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

  const WALK_SPEED = 2.4;    // tiles / second; a relaxed walk through the hall
  const SIT_TIME = 0.5;      // seconds to sit down (sliding back into the chair) / stand up
  const TURN_TIME = 0.3;     // turn round in the row, back to the chair, before sitting
  const RISE_PAUSE = 0.18;   // stand with the back to the chair for a moment before walking off
  const PERSONAL_SPACE = 0.62;
  const MAX_YIELD = 1.6;     // never wait longer than this behind someone
  const KEEP_RIGHT = 0.4;   // passing lane; only used while someone walks the other way
  const PASS_RANGE = 2.4;   // tiles: how far ahead an oncoming walker makes us keep right
  const FADE_DIST = 1.2;    // tiles outside the door over which arrivals fade in and leavers fade out

  class Actor {
    constructor(viewer, seat) {
      this.key = viewer.key;
      this.viewer = viewer;
      this.seat = seat;
      this.appearanceKey = VC.Art.appearanceKey(viewer.key);
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
      // Walking ends in the row's legroom in front of the seat; the final short
      // segment into the chair is covered only while sitting down / standing up.
      this.seatStart = this.total - this.lastLen;
      this.s = 0;
      this.sit = 0;
      this.turn = 0;                // 0 → TURN_TIME while turning round in front of the seat
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

    enter() { this.phase = 'walking'; this.dir = 1; this.s = 0; this.sit = 0; this.turn = 0; this.locate(); }

    placeSeated() {
      this.phase = 'seated'; this.dir = 1; this.s = this.total; this.sit = 1; this.turn = TURN_TIME;
      this.locate(); this.facing = 'NE';
    }

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

      if (this.sit > 0) this.turn = TURN_TIME;   // seated (or restored mid-sit) means already turned
      if (this.s > this.seatStart) this.settle();  // keep the slide into the chair in step with `sit`
      if (this.dir > 0) {
        // Walk along the row to the legroom in front of the seat, turn round so the
        // back is to the chair, then sit down, sliding back into it.
        if (this.s < this.seatStart) this.advance(dt, others, +1);
        else if (this.turn < TURN_TIME) this.turn = Math.min(TURN_TIME, this.turn + dt);
        else {
          this.sit = Math.min(1, this.sit + dt / SIT_TIME);
          this.settle();
          if (this.sit >= 1) this.phase = 'seated';
        }
      } else {
        // Stand up, rising out of the chair into the legroom with the back to it,
        // pause, then turn and walk off along the row.
        if (this.sit > 0) { this.sit = Math.max(0, this.sit - dt / SIT_TIME); this.settle(); }
        else if (this.turn > 0 && this.s >= this.seatStart - 1e-6)
          this.turn = Math.max(0, this.turn - dt * TURN_TIME / RISE_PAUSE);
        else { this.turn = 0; this.advance(dt, others, -1); }
        if (this.s <= 0 && this.sit <= 0) { this.phase = 'gone'; return; }
      }
      if (this.phase === 'seated' && this.dir > 0) this.idleClock += dt;

      // Keep-right lateral offset on shared aisles, only while someone comes the other way.
      const p = this.basePos || this.sample(this.s);
      const onRowSegments = p.seg >= this.lens.length - 2;
      const lane = !onRowSegments && this.moving && this.oncoming(others) ? KEEP_RIGHT : 0;
      const tx = -p.dy * this.dir * lane;
      const ty = p.dx * this.dir * lane;
      const k = 1 - Math.exp(-dt * 6);
      this.offset.x += (tx - this.offset.x) * k;
      this.offset.y += (ty - this.offset.y) * k;
      this.pos = { x: p.x + this.offset.x, y: p.y + this.offset.y };

      this.updateFacing(p);
    }

    /** Position on the legroom → chair segment follows the sitting progress. */
    settle() {
      const t = this.sit * this.sit * (3 - 2 * this.sit);
      this.s = this.seatStart + this.lastLen * t;
      this.basePos = this.sample(this.s);
    }

    /** Another walker ahead of us, heading towards us. */
    oncoming(others) {
      const hx = this.heading.x, hy = this.heading.y;
      for (const o of others) {
        if (o === this || o.phase !== 'walking' || !o.moving) continue;
        const rx = o.pos.x - this.pos.x, ry = o.pos.y - this.pos.y;
        const dist = Math.hypot(rx, ry);
        if (dist > PASS_RANGE || dist < 1e-4) continue;
        if ((rx * hx + ry * hy) / dist > 0.5 && o.heading.x * hx + o.heading.y * hy < -0.5) return true;
      }
      return false;
    }

    advance(dt, others, sign) {
      const p = this.sample(this.s);
      const hx = p.dx * sign, hy = p.dy * sign;
      this.heading = { x: hx, y: hy };
      // People squeezing past each other inside a row never wait for one another.
      const inRow = p.seg >= this.lens.length - 2;
      if (!inRow && this.blocked(others, hx, hy) && this.blockedFor < MAX_YIELD) {
        this.blockedFor += dt;
        this.basePos = p;
        return;
      }
      this.blockedFor = Math.max(0, this.blockedFor - dt * 2);
      const previous = this.s;
      this.s = VC.clamp(this.s + WALK_SPEED * dt * sign, 0, this.seatStart);
      const distance = Math.abs(this.s - previous);
      this.moving = distance > 0;
      this.walkClock += distance;
      this.basePos = this.sample(this.s);
    }

    updateFacing(p) {
      // Sitting, rising, or turned round in the legroom: back to the chair, facing the screen.
      // During the first half of the turn the walker still faces along the row.
      if (this.sit > 0 || this.turn >= TURN_TIME / 2 || (this.turn > 0 && this.dir < 0)) { this.facing = 'NE'; return; }
      if (!this.moving) return;
      const hx = this.heading.x, hy = this.heading.y;
      if (Math.abs(hx) >= Math.abs(hy)) this.facing = hx > 0 ? 'SE' : 'NW';
      else this.facing = hy > 0 ? 'SW' : 'NE';
    }

    /** Opacity: fades in on the first steps outside the door, out on the last ones when leaving. */
    get alpha() { return VC.clamp(this.s / FADE_DIST, 0, 1); }

    /** Depth for painter's ordering (larger = closer to the camera). */
    get depth() { return this.pos.x + this.pos.y + 0.02; }

    /** Within the front entrance threshold. */
    get inDoorway() { return Math.abs(L.gateDistance(this.pos)) < 0.35; }
  }

  VC.Actor = Actor;
})();
