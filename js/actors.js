/*
 * Actor = one viewer's character. Pure movement/state; drawing lives in renderer.js.
 *
 * Movement model: the character travels along a fixed polyline from outside the
 * door to its seat. `s` is the distance travelled; walking in increases it, walking
 * out decreases it. Reversing direction (leave mid-walk, or come back mid-exit) is
 * therefore always seamless — no teleporting, no re-pathing.
 */
(function () {
  'use strict';
  const VC = window.VC;
  const L = VC.Layout;

  const WALK_SPEED = 3.0;    // tiles / second; keeps traversal bounded in the larger hall
  const SHUFFLE_SPEED = 1.1; // last step into the seat
  const SIT_TIME = 0.45;     // seconds to sit down / stand up
  const PERSONAL_SPACE = 0.62;
  const MAX_YIELD = 1.6;     // never wait longer than this behind someone
  const KEEP_RIGHT = 0.17;

  class Actor {
    constructor(viewer, seat) {
      this.key = viewer.key;
      this.viewer = viewer;
      this.seat = seat;
      this.appearance = VC.makeAppearance(viewer.key);
      this.sprites = null;          // built lazily by the renderer
      this.route = L.routeToSeat(seat);
      this.lens = [];
      this.total = 0;
      for (let i = 1; i < this.route.length; i++) {
        const a = this.route[i - 1], b = this.route[i];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        this.lens.push(d);
        this.total += d;
      }
      this.lastLen = this.lens[this.lens.length - 1];
      this.s = 0;
      this.sit = 0;
      this.dir = 1;
      this.phase = 'queued';        // queued | walking | seated | gone
      this.pos = { x: this.route[0].x, y: this.route[0].y };
      this.heading = { x: 1, y: 0 };
      this.facing = 'SE';
      this.moving = false;
      this.walkClock = 0;
      this.blockedFor = 0;
      this.offset = { x: 0, y: 0 };
      this.labelLift = 0;           // smoothed label displacement (renderer)
      const r = VC.rng(VC.hash(viewer.key + '#idle'));
      this.idleClock = r() * 10;
      this.idlePeriod = 5 + r() * 7;
    }

    isInside() { return this.phase === 'walking' || this.phase === 'seated'; }
    isLeaving() { return this.dir < 0; }

    enter() { this.phase = 'walking'; this.dir = 1; this.s = 0; this.sit = 0; this.locate(); }

    placeSeated() { this.phase = 'seated'; this.dir = 1; this.s = this.total; this.sit = 1; this.locate(); this.facing = 'NE'; }

    leave() {
      if (this.phase === 'queued') { this.phase = 'gone'; return; }
      this.dir = -1;
      if (this.phase === 'seated') this.phase = 'walking';
    }

    comeBack() {
      this.dir = 1;
      if (this.phase === 'gone' || this.phase === 'queued') this.enter();
    }

    dispose() { this.sprites = null; this.phase = 'gone'; }

    /** Point on the route at distance s, plus the direction of that segment. */
    sample(s) {
      let acc = 0;
      for (let i = 0; i < this.lens.length; i++) {
        const len = this.lens[i];
        if (s <= acc + len || i === this.lens.length - 1) {
          const t = len > 0 ? VC.clamp((s - acc) / len, 0, 1) : 1;
          const a = this.route[i], b = this.route[i + 1];
          return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / (len || 1), dy: (b.y - a.y) / (len || 1), seg: i };
        }
        acc += len;
      }
      const p = this.route[this.route.length - 1];
      return { x: p.x, y: p.y, dx: 0, dy: -1, seg: this.lens.length - 1 };
    }

    locate() {
      const p = this.sample(this.s);
      this.basePos = p;
      this.pos = { x: p.x + this.offset.x, y: p.y + this.offset.y };
      return p;
    }

    /** True if another walker is just ahead of us, going the same way. */
    blocked(others, hx, hy) {
      for (const o of others) {
        if (o === this || o.phase !== 'walking' || !o.moving && o.sit > 0) continue;
        const rx = o.pos.x - this.pos.x, ry = o.pos.y - this.pos.y;
        const dist = Math.hypot(rx, ry);
        if (dist > PERSONAL_SPACE || dist < 1e-4) continue;
        const ahead = (rx * hx + ry * hy) / dist;
        if (ahead < 0.55) continue;                       // not in front of us
        const same = o.heading.x * hx + o.heading.y * hy;
        if (same > 0.3 || !o.moving) return true;        // same direction, or standing still
      }
      return false;
    }

    update(dt, others) {
      if (this.phase === 'queued' || this.phase === 'gone') return;
      this.moving = false;

      if (this.dir > 0) {
        if (this.s < this.total) this.advance(dt, others, +1);
        else {
          this.sit = Math.min(1, this.sit + dt / SIT_TIME);
          if (this.sit >= 1) this.phase = 'seated';
        }
      } else {
        if (this.sit > 0) this.sit = Math.max(0, this.sit - dt / SIT_TIME);
        else this.advance(dt, others, -1);
        if (this.s <= 0 && this.sit <= 0) { this.phase = 'gone'; return; }
      }
      if (this.phase === 'seated' && this.dir > 0) this.idleClock += dt;

      // Keep-right lateral offset on shared aisles so opposite walkers pass each other.
      const p = this.basePos || this.sample(this.s);
      const onRowSegments = p.seg >= this.lens.length - 2;
      const tx = onRowSegments || !this.moving ? 0 : -p.dy * this.dir * KEEP_RIGHT;
      const ty = onRowSegments || !this.moving ? 0 : p.dx * this.dir * KEEP_RIGHT;
      const k = 1 - Math.exp(-dt * 6);
      this.offset.x += (tx - this.offset.x) * k;
      this.offset.y += (ty - this.offset.y) * k;
      this.pos = { x: p.x + this.offset.x, y: p.y + this.offset.y };

      this.updateFacing(p);
    }

    advance(dt, others, sign) {
      const p = this.sample(this.s);
      const hx = p.dx * sign, hy = p.dy * sign;
      this.heading = { x: hx, y: hy };
      const inSeatRow = this.s > this.total - this.lastLen - 1e-6;
      if (!inSeatRow && this.blocked(others, hx, hy) && this.blockedFor < MAX_YIELD) {
        this.blockedFor += dt;
        this.basePos = p;
        return;
      }
      this.blockedFor = Math.max(0, this.blockedFor - dt * 2);
      const speed = inSeatRow ? SHUFFLE_SPEED : WALK_SPEED;
      this.s = VC.clamp(this.s + speed * dt * sign, 0, this.total);
      this.moving = true;
      this.walkClock += dt * speed;
      this.basePos = this.sample(this.s);
    }

    updateFacing(p) {
      const inSeatRow = this.s >= this.total - this.lastLen - 1e-6;
      if (this.sit > 0 || (inSeatRow && this.s > this.total - this.lastLen + 0.05)) { this.facing = 'NE'; return; }
      if (!this.moving) return;
      const hx = this.heading.x, hy = this.heading.y;
      if (Math.abs(hx) >= Math.abs(hy)) this.facing = hx > 0 ? 'SE' : 'NW';
      else this.facing = hy > 0 ? 'SW' : 'NE';
    }

    /** Depth for painter's ordering (larger = closer to the camera). */
    get depth() { return this.pos.x + this.pos.y + 0.02; }

    /** Inside the door frame? (renderer clips to the doorway) */
    get inDoorway() { return this.pos.x < 0.35; }
  }

  VC.Actor = Actor;
})();
