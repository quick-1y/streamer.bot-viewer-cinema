/*
 * Cinema geometry in world units + isometric projection.
 *
 *   world x → screen down-right, world y → screen down-left, z → up.
 *   The screen hangs on the back-right wall (y = 0); seats face −y.
 *   The entrance faces the camera on the front-left facade (y = D).
 */
(function () {
  'use strict';
  const VC = window.VC;

  const L = {
    VIEW_W: 960, VIEW_H: 540,
    ART_SCALE: 2,                // artwork is composited at native 1920×1080 resolution     // internal pixel-art resolution, scaled without smoothing
    TW: 40, TH: 20, ZS: 25.8,       // tile width/height in px, px per z unit
    OX: 496.96, OY: 155.52,              // screen position of world origin
    W: 19.8, D: 17.4, H: 5.8,     // room size (x, y) and wall height
    STAGE_D: 2.1,                 // raised stage depth in front of the screen
    SCREEN_X0: 2.15, SCREEN_X1: 17.65, SCREEN_Z0: 1.25, SCREEN_Z1: 5.15,
    LEFT_AISLE: 1.4, CENTER_AISLE: 9.9, RIGHT_AISLE: 18.4,
    CROSS_Y: 16.2,
    DOOR_X0: 1.2, DOOR_X1: 3.5, DOOR_H: 3.0,
    ROWS: [4.2, 6.3, 8.4, 10.5, 12.6, 14.7],
    BLOCKS: [{ x0: 2.65, n: 5 }, { x0: 11.0, n: 5 }],
    SEAT_PITCH: 1.5,
    WALK_OFFSET: 0.6               // walkway lies this far in front of a seat (toward the screen)
  };

  L.project = function (x, y, z = 0) {
    return { x: L.OX + x * 18.55 - y * 21.274, y: L.OY + x * 10.04 + y * 9.751 - z * L.ZS };
  };

  L.doorX = (L.DOOR_X0 + L.DOOR_X1) / 2;
  L.doorY = L.D;
  L.OUTSIDE = { x: L.doorX, y: L.D + 1.3 };
  L.INSIDE = { x: L.doorX, y: L.D - 0.6 };

  // ---------------------------------------------------------------- seats
  L.buildSeats = function (maxSeats) {
    const seats = [];
    L.ROWS.forEach((ry, r) => {
      L.BLOCKS.forEach((b, bi) => {
        for (let i = 0; i < b.n; i++) {
          seats.push({
            id: `r${r}b${bi}s${i}`,
            row: r, block: bi, index: i,
            x: b.x0 + i * L.SEAT_PITCH,
            y: ry,
            occupant: null
          });
        }
      });
    });
    // Neighbour links for allocation scoring.
    for (const s of seats) {
      s.neighbours = seats.filter((o) => o !== s && (
        (o.row === s.row && o.block === s.block && Math.abs(o.index - s.index) === 1) ||
        (Math.abs(o.row - s.row) === 1 && o.block === s.block && o.index === s.index)));
    }
    // Cap capacity, dropping the least desirable seats first (front row / far edges).
    if (maxSeats > 0 && maxSeats < seats.length) {
      const ranked = seats.slice().sort((a, b) => L.seatDesirability(b) - L.seatDesirability(a));
      const keep = new Set(ranked.slice(0, maxSeats));
      return seats.filter((s) => keep.has(s));
    }
    return seats;
  };

  /** Higher is better: middle rows, seats toward the centre of the screen. */
  L.seatDesirability = function (s) {
    const rowScore = [0.4, 0.85, 1.0, 1.0, 0.85, 0.6][s.row] || 0.5;
    const centreX = (L.SCREEN_X0 + L.SCREEN_X1) / 2;
    const xScore = 1 - Math.abs(s.x - centreX) / 8;
    return rowScore * 1.4 + xScore;
  };

  // ---------------------------------------------------------------- routes
  /** Polyline from outside the door to the seat (last point = seat itself). */
  L.routeToSeat = function (seat) {
    const walkY = seat.y - L.WALK_OFFSET;
    const half = (L.BLOCKS[seat.block].n - 1) / 2;
    let aisle;
    if (seat.block === 0) aisle = seat.index <= half ? L.LEFT_AISLE : L.CENTER_AISLE;
    else aisle = seat.index <= half ? L.CENTER_AISLE : L.RIGHT_AISLE;
    const pts = [L.OUTSIDE, L.INSIDE, { x: L.LEFT_AISLE, y: L.CROSS_Y }];
    if (aisle !== L.LEFT_AISLE) pts.push({ x: aisle, y: L.CROSS_Y });
    pts.push({ x: aisle, y: walkY }, { x: seat.x, y: walkY }, { x: seat.x, y: seat.y });
    return pts.map((p) => ({ x: p.x, y: p.y }));
  };

  VC.Layout = L;
})();
