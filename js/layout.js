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
    VIEW_W: 960,
    VIEW_H: 540,
    ART_SCALE: 2, // artwork is composited at native 1920×1080 resolution
    ZS: 25.8, // tile width/height in px, px per z unit
    W: 19.8,
    D: 17.4,
    CENTER_AISLE: 9.9,
    // Walking line in the centre aisle. A chair on the camera side (+x) of a walker
    // is in front of them and hides them from the feet up; its sprite reaches ~2.3
    // tiles sideways before it only covers the shoes. So walkers keep to the left
    // edge of the aisle, beside the block0 chairs, which are behind them.
    CENTER_LANE: 9.5,
    RIGHT_AISLE: 18.7,
    // Behind the last row, but clear of the low entrance partition: walking at the
    // old 16.2 the painted wall cut off the walkers' legs ("sinking into the floor").
    CROSS_Y: 15.5,
    ROWS: [4.1, 6.1, 8.1, 10.7, 12.7, 14.7],
    // A 4-tile centre aisle (2.6 tiles between chair edges) lets a walker pass
    // the blocks without the neighbouring chair backs being drawn over them.
    BLOCKS: [
      { x0: 2.3, n: 5 },
      { x0: 11.9, n: 5 }
    ],
    SEAT_PITCH: 1.4,
    WALK_OFFSET: 0.6 // walkway lies this far in front of a seat (toward the screen)
  };

  // Four surveyed floor corners, (0,0), (W,0), (W,D), (0,D), in room-art pixels.
  // Each is the intersection of two painted edges: the screen-wall base (29.6°),
  // the front floor edge (29.4°) and the right floor edge (−27.5°). The x = 0
  // side runs through the back corner parallel to the right edge, which is the
  // direction of the painted floorboards (−27.3°…−27.9°), so rug ends and aisles
  // follow the boards and the floor is a near-parallelogram, not a trapezoid.
  // A projective map keeps the y = 0 and y = D rows exactly on those painted
  // walls, so chair rows, rugs and the fence run parallel to the screen and
  // the entrance even though the artwork is not a perfect parallel projection.
  L.FLOOR = { corners: [[884, 291], [1477.1, 628], [907.7, 923.8], [312.5, 587.9]] };
  (function () {
    // Unit square → quad (Heckbert). H maps (u, v, 1) to homogeneous art pixels.
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = L.FLOOR.corners;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    const H = [x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
      y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
    const [a, b, c, d, e, f, p, q, r] = H;
    const inv = [e * r - f * q, c * q - b * r, b * f - c * e,
      f * p - d * r, a * r - c * p, c * d - a * f,
      d * q - e * p, b * p - a * q, a * e - b * d];
    L.FLOOR.H = H;
    L.FLOOR.inverse = inv;
  })();
  L.floorArt = function (x, y) {
    const [a, b, c, d, e, f, g, h, i] = L.FLOOR.H, u = x / L.W, v = y / L.D;
    const w = g * u + h * v + i;
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
  };
  L.project = function (x, y, z = 0) {
    const p = L.artPoint(...L.floorArt(x, y));
    return { x: p.x, y: p.y - z * L.ZS };
  };

  // All overlay geometry is measured in the unmodified room artwork.
  // Painted screen interior: TL, TR, BR, BL in the displayed 1672×941 art.
  // Its lower edge and height differ from the upper edge: use all four corners.
  L.SCREEN_ART_CORNERS = [[960, 123], [1375, 343], [1375, 523], [960, 290]];
  L.artPoint = function (x, y) {
    return { x: 12 + (x * 936) / 1672, y: 6 + (y * 527) / 941 };
  };
  L.fromArt = function (x, y) {
    const [a, b, c, d, e, f, g, h, i] = L.FLOOR.inverse;
    const w = g * x + h * y + i;
    return { x: (a * x + b * y + c) / w * L.W, y: (d * x + e * y + f) / w * L.D };
  };
  L.RUGS = [
    // Cover the painted chair feet, which extend left/forward of each seat anchor.
    { x0: 0.55, x1: 17.9, y0: 2.8, y1: 8.6 },
    { x0: 0.55, x1: 17.9, y0: 9.4, y1: 15.5 }
  ];
  L.rugCorners = (r) => [[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]]
    .map(([x,y]) => L.floorArt(x,y));
  // Entrance anchors and occlusion polygons, surveyed in the displayed room art.
  L.ART_GEOMETRY = {
    gateLeft: [240, 648],
    gateRight: [357, 713],
    opening: [
      [237, 530],
      [357, 588],
      [357, 713],
      [240, 648]
    ],
    // One straight entrance wall in the plane of the door posts (floor y ≈ 20.6),
    // capped at the height of the post blocks and closed by an end post.
    facade: [
      [157, 460],
      [174, 451],
      [210, 441],
      [398, 534],
      [398, 578],
      [459, 612],
      [461, 604],
      [473, 611],
      [473, 772],
      [452, 783],
      [440, 776],
      [373, 738],
      [357, 722],
      [240, 652],
      [226, 653],
      [157, 614]
    ],
    lintel: [
      [210, 441],
      [398, 534],
      [398, 578],
      [459, 612],
      [461, 604],
      [473, 611],
      [473, 632],
      [452, 643],
      [443, 634],
      [395, 607],
      [357, 588],
      [237, 530],
      [210, 514]
    ],
    railFront: [L.floorArt(7.8, 17.15), L.floorArt(19.55, 17.15)],
    railRight: [L.floorArt(19.55, .8), L.floorArt(19.55, 17.15)]
  };

  L.artContains = function (polygon, point) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = L.artPoint(...polygon[i]),
        b = L.artPoint(...polygon[j]);
      if (
        a.y > point.y !== b.y > point.y &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      )
        inside = !inside;
    }
    return inside;
  };
  L.facadeOccludes = (point) =>
    L.artContains(L.ART_GEOMETRY.lintel, point) ||
    (L.artContains(L.ART_GEOMETRY.facade, point) && !L.artContains(L.ART_GEOMETRY.opening, point));

  // Seats share the same plane as the rugs and railings. The first row is
  // 4.1 tiles from the screen wall; the carpet starts 2.8 tiles from it.
  L.seatPoint = function (row, nominalX, forward = 0) {
    return { x: nominalX, y: L.ROWS[row] - forward };
  };

  const gateLeft = L.fromArt(...L.ART_GEOMETRY.gateLeft);
  const gateRight = L.fromArt(...L.ART_GEOMETRY.gateRight);
  const gateLength = Math.hypot(gateRight.x - gateLeft.x, gateRight.y - gateLeft.y);
  L.GATE = {
    left: gateLeft,
    right: gateRight,
    center: { x: (gateLeft.x + gateRight.x) / 2, y: (gateLeft.y + gateRight.y) / 2 },
    inward: {
      x: (gateRight.y - gateLeft.y) / gateLength,
      y: -(gateRight.x - gateLeft.x) / gateLength
    }
  };
  L.doorX = L.GATE.center.x;
  L.doorY = L.GATE.center.y;
  L.OUTSIDE = { x: L.doorX - L.GATE.inward.x * 1.8, y: L.doorY - L.GATE.inward.y * 1.8 };
  L.INSIDE = { x: L.doorX + L.GATE.inward.x * 2.0, y: L.doorY + L.GATE.inward.y * 2.0 };
  L.gateDistance = function (p) {
    return (p.x - L.doorX) * L.GATE.inward.x + (p.y - L.doorY) * L.GATE.inward.y;
  };
  L.isOutside = (p) => L.gateDistance(p) < 0;


  // ---------------------------------------------------------------- seats
  L.buildSeats = function (maxSeats) {
    const seats = [];
    L.ROWS.forEach((ry, r) => {
      L.BLOCKS.forEach((b, bi) => {
        for (let i = 0; i < b.n; i++) {
          const nominalX = b.x0 + i * L.SEAT_PITCH;
          const point = L.seatPoint(r, nominalX);
          seats.push({
            id: `r${r}b${bi}s${i}`,
            row: r,
            block: bi,
            index: i,
            nominalX,
            x: point.x,
            y: point.y,
            occupant: null
          });
        }
      });
    });
    // Neighbour links for allocation scoring.
    for (const s of seats) {
      s.neighbours = seats.filter(
        (o) =>
          o !== s &&
          ((o.row === s.row && o.block === s.block && Math.abs(o.index - s.index) === 1) ||
            (Math.abs(o.row - s.row) === 1 && o.block === s.block && o.index === s.index))
      );
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
    const centreX = L.CENTER_AISLE;
    const xScore = 1 - Math.abs(s.x - centreX) / 8;
    return rowScore * 1.4 + xScore;
  };

  // ---------------------------------------------------------------- routes
  /** Polyline from outside the door to the seat (last point = seat itself). */
  L.routeToSeat = function (seat) {
    const walk = L.seatPoint(seat.row, seat.nominalX, L.WALK_OFFSET);
    const half = (L.BLOCKS[seat.block].n - 1) / 2;
    // No aisle along the left wall: there the chairs would stand on the walkers'
    // camera side, and the entrance facade cuts off their legs near the back.
    // The whole left block is reached along its rows from the centre aisle.
    const aisle = seat.block === 1 && seat.index > half ? L.RIGHT_AISLE : L.CENTER_LANE;
    const pts = [L.OUTSIDE, L.INSIDE, { x: L.INSIDE.x, y: L.CROSS_Y }];
    if (Math.abs(aisle - L.INSIDE.x) > 1e-6) pts.push({ x: aisle, y: L.CROSS_Y });
    pts.push({ x: aisle, y: walk.y }, walk, { x: seat.x, y: seat.y });
    return pts.map((p) => ({ x: p.x, y: p.y }));
  };

  VC.Layout = L;
})();
