/*
 * Audience director: turns viewer-list snapshots into actor lifecycles.
 *   - diffing snapshots (no duplicates, stable seats/appearance)
 *   - leave grace period (viewer lists flicker)
 *   - door pacing for simultaneous arrivals
 *   - waiting line when the hall is full
 * It never touches the network and never draws.
 */
(function () {
  'use strict';
  const VC = window.VC;
  const log = VC.log;
  const MEMORY_LIMIT = 500;

  class Audience {
    constructor({ seats, leaveGraceMs = 90000 }) {
      this.allocator = new VC.SeatAllocator(seats);
      this.leaveGraceMs = leaveGraceMs;
      this.records = new Map();   // key → { viewer, missingSince }
      this.actors = new Map();    // key → Actor (includes actors walking out)
      this.waiting = [];          // keys with no free seat yet (FIFO)
      this.doorQueue = [];        // actors created but not yet through the door
      this.doorCooldown = 0;
      this.lastSeat = new Map();  // key → seat id (stable seat on return)
      this.hasSnapshot = false;
    }

    /** Apply a full snapshot of present viewers. */
    applyList(list, { initialMode = 'walk' } = {}) {
      const now = performance.now();
      const firstSnapshot = !this.hasSnapshot;
      this.hasSnapshot = true;
      const present = new Set();
      for (const v of list) {
        present.add(v.key);
        let rec = this.records.get(v.key);
        if (rec) {
          rec.viewer = v;
          rec.missingSince = null;
          const actor = this.actors.get(v.key);
          if (actor) actor.viewer = v;
          continue;
        }
        rec = { viewer: v, missingSince: null };
        this.records.set(v.key, rec);
        const actor = this.actors.get(v.key);
        if (actor && actor.isLeaving()) {
          actor.viewer = v;
          actor.comeBack();                       // rejoined while walking out
          log.debug('return', v.key);
        } else if (!actor) {
          this.admit(v, firstSnapshot && initialMode === 'seated');
        }
      }
      for (const [key, rec] of this.records) {
        if (!present.has(key) && rec.missingSince === null) rec.missingSince = now;
      }
    }

    admit(viewer, seatedImmediately) {
      const seat = this.allocator.allocate(viewer.key, this.lastSeat.get(viewer.key));
      if (!seat) {
        if (!this.waiting.includes(viewer.key)) this.waiting.push(viewer.key);
        return;
      }
      this.remember(viewer.key, seat.id);
      const actor = new VC.Actor(viewer, seat);
      this.actors.set(viewer.key, actor);
      if (seatedImmediately) actor.placeSeated();
      else this.doorQueue.push(actor);
    }

    depart(key) {
      this.records.delete(key);
      const wi = this.waiting.indexOf(key);
      if (wi >= 0) this.waiting.splice(wi, 1);
      const actor = this.actors.get(key);
      if (!actor) return;
      const qi = this.doorQueue.indexOf(actor);
      if (qi >= 0) {                       // never made it inside: just drop it
        this.doorQueue.splice(qi, 1);
        this.finish(actor);
      } else {
        actor.leave();
      }
    }

    finish(actor) {
      this.allocator.release(actor.seat, actor.key);
      if (this.actors.get(actor.key) === actor) this.actors.delete(actor.key);
      actor.dispose();
      this.admitWaiting();
    }

    admitWaiting() {
      while (this.waiting.length && this.allocator.freeCount > 0) {
        const key = this.waiting.shift();
        const rec = this.records.get(key);
        if (rec) this.admit(rec.viewer, false);
      }
    }

    remember(key, seatId) {
      this.lastSeat.delete(key);
      this.lastSeat.set(key, seatId);
      if (this.lastSeat.size > MEMORY_LIMIT) this.lastSeat.delete(this.lastSeat.keys().next().value);
    }

    update(dt) {
      const now = performance.now();
      for (const [key, rec] of this.records) {
        if (rec.missingSince !== null && now - rec.missingSince >= this.leaveGraceMs) this.depart(key);
      }

      // Door pacing: one person through the door at a time, faster when a crowd is waiting.
      this.doorCooldown -= dt;
      if (this.doorQueue.length && this.doorCooldown <= 0 && this.doorClear()) {
        const actor = this.doorQueue.shift();
        actor.enter();
        this.doorCooldown = this.doorQueue.length > 5 ? 0.42 : 0.75;
      }

      const list = Array.from(this.actors.values());
      for (const a of list) a.update(dt, list);
      for (const a of list) if (a.phase === 'gone') this.finish(a);
    }

    doorClear() {
      const P = VC.Layout.INSIDE;
      for (const a of this.actors.values()) {
        if (a.phase !== 'walking') continue;
        if (Math.hypot(a.pos.x - P.x, a.pos.y - P.y) < 0.55 && a.dir > 0) return false;
      }
      return true;
    }

    /** Number shown on the "Зрители" counter: everyone inside who isn't on the way out. */
    get hallCount() {
      let n = 0;
      for (const a of this.actors.values()) if (a.isInside() && !a.isLeaving()) n++;
      return n;
    }

    /** Minimal serializable state for OBS source reloads, excluding sprite caches. */
    exportState() {
      const now = performance.now();
      return {
        version: 1,
        savedAt: Date.now(),
        records: Array.from(this.records.values(), (r) => ({
          viewer: r.viewer,
          missingFor: r.missingSince === null ? null : Math.max(0, now - r.missingSince)
        })),
        actors: Array.from(this.actors.values(), (a) => ({
          viewer: a.viewer, seat: a.seat.id, phase: a.phase,
          s: a.s, sit: a.sit, dir: a.dir, walkClock: a.walkClock
        })),
        lastSeat: Array.from(this.lastSeat),
        doorCooldown: this.doorCooldown
      };
    }

    restoreState(state, age = 0) {
      if (!state || state.version !== 1 || !Array.isArray(state.records) ||
          !Array.isArray(state.actors) || state.records.length > MEMORY_LIMIT ||
          state.actors.length > this.allocator.capacity || this.hasSnapshot) return false;
      const viewer = (raw) => VC.normalizeViewerList([raw])[0];
      const now = performance.now();
      for (const r of state.records) {
        const v = r && viewer(r.viewer);
        if (!v || this.records.has(v.key)) continue;
        const missingFor = Number.isFinite(r.missingFor) ? Math.max(0, r.missingFor) : 0;
        this.records.set(v.key, { viewer: v,
          missingSince: r.missingFor === null ? null : now - missingFor - age });
      }
      if (Array.isArray(state.lastSeat)) for (const pair of state.lastSeat.slice(-MEMORY_LIMIT)) {
        if (Array.isArray(pair) && typeof pair[0] === 'string' && this.allocator.byId.has(pair[1]))
          this.remember(pair[0], pair[1]);
      }
      for (const r of state.actors) {
        const v = r && viewer(r.viewer);
        if (!v || this.actors.has(v.key) || !['queued', 'walking', 'seated'].includes(r.phase) ||
            !Number.isFinite(r.s) || !Number.isFinite(r.sit) || ![1, -1].includes(r.dir)) continue;
        const preferred = this.allocator.byId.get(r.seat);
        if (!preferred || preferred.occupant) continue;
        const seat = this.allocator.allocate(v.key, r.seat);
        const a = new VC.Actor(v, seat);
        this.remember(v.key, seat.id);
        a.s = VC.clamp(r.s, 0, a.total);
        a.sit = VC.clamp(r.sit, 0, 1);
        a.dir = r.dir;
        a.phase = r.phase;
        a.walkClock = Number.isFinite(r.walkClock) ? r.walkClock : 0;
        if (a.phase === 'seated') a.placeSeated();
        else a.locate();
        this.actors.set(v.key, a);
        if (a.phase === 'queued') this.doorQueue.push(a);
      }
      for (const [key, rec] of this.records) {
        if (!this.actors.has(key)) this.admit(rec.viewer, false);
      }
      this.doorCooldown = Number.isFinite(state.doorCooldown) ? Math.max(0, state.doorCooldown) : 0;
      this.hasSnapshot = true;
      return true;
    }

    snapshot() {
      return {
        present: this.records.size,
        hall: this.hallCount,
        actors: this.actors.size,
        waiting: this.waiting.slice(),
        doorQueue: this.doorQueue.length,
        freeSeats: this.allocator.freeCount,
        capacity: this.allocator.capacity,
        seats: Array.from(this.actors.values()).map((a) => ({ key: a.key, seat: a.seat.id, phase: a.phase, sit: +a.sit.toFixed(2) }))
      };
    }
  }

  VC.Audience = Audience;
})();
