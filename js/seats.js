/* Seat allocation: one occupant per seat, spread viewers out, prefer good seats. */
(function () {
  'use strict';
  const VC = window.VC;
  const L = VC.Layout;

  class SeatAllocator {
    constructor(seats) {
      this.seats = seats;
      this.byId = new Map(seats.map((s) => [s.id, s]));
    }

    get capacity() { return this.seats.length; }
    get freeCount() { let n = 0; for (const s of this.seats) if (!s.occupant) n++; return n; }

    /** Reserve a seat for `key`. Tries `preferredId` first (stable seat on rejoin). */
    allocate(key, preferredId) {
      const pref = preferredId && this.byId.get(preferredId);
      if (pref && !pref.occupant) { pref.occupant = key; return pref; }
      let best = null, bestCost = Infinity;
      const rnd = VC.rng(VC.hash(key));
      for (const s of this.seats) {
        if (s.occupant) continue;
        let busy = 0;
        for (const n of s.neighbours) if (n.occupant) busy++;
        // Spread people out (keeps name labels readable), then prefer good seats,
        // with a small per-viewer jitter so the room fills organically.
        const cost = busy * 1.5 - L.seatDesirability(s) * 1.2 + rnd() * 0.9;
        if (cost < bestCost) { bestCost = cost; best = s; }
      }
      if (best) best.occupant = key;
      return best;
    }

    release(seat, key) {
      if (seat && (key === undefined || seat.occupant === key)) seat.occupant = null;
    }
  }

  VC.SeatAllocator = SeatAllocator;
})();
