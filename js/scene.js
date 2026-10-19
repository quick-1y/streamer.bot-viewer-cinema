/* A cutaway picture house. Static art is cached; viewers and light animate separately. */
(function () {
  'use strict';
  const VC = window.VC,
    L = VC.Layout,
    P = L.project;
  const C = {
    wood: '#60321f',
    edge: '#a26736',
    gold: '#c58a3c',
    ink: '#190e17',
    velvet: '#721d2b',
    red: '#a82b39',
    redHi: '#d45448',
    carpet: '#481926'
  };
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { c, ctx };
  }
  // Rasterize polygon edges and fills on the art grid. Canvas vector antialiasing
  // otherwise leaves soft half-pixels even when CSS uses nearest-neighbour.
  function pixelLine(ctx, p, q, color, width = 1) {
    let x = Math.round(p.x),
      y = Math.round(p.y);
    const x1 = Math.round(q.x),
      y1 = Math.round(q.y);
    const dx = Math.abs(x1 - x),
      dy = -Math.abs(y1 - y);
    const sx = x < x1 ? 1 : -1,
      sy = y < y1 ? 1 : -1;
    let err = dx + dy;
    ctx.fillStyle = color;
    const offset = Math.floor(width / 2);
    for (;;) {
      ctx.fillRect(x - offset, y - offset, width, width);
      if (x === x1 && y === y1) break;
      const e = 2 * err;
      if (e >= dy) {
        err += dy;
        x += sx;
      }
      if (e <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  function poly(ctx, pts, color, stroke) {
    rasterPolygon(
      ctx,
      pts.map((q) => {
        const p = P(...q);
        return { x: Math.round(p.x), y: Math.round(p.y) };
      }),
      color,
      stroke
    );
  }
  function rasterPolygon(ctx, points, color, stroke) {
    const y0 = Math.min(...points.map((p) => p.y)),
      y1 = Math.max(...points.map((p) => p.y));
    ctx.fillStyle = color;
    for (let y = y0; y < y1; y++) {
      const hits = [],
        scan = y + 0.5;
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        if ((a.y <= scan && b.y > scan) || (b.y <= scan && a.y > scan))
          hits.push(a.x + ((scan - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i + 1 < hits.length; i += 2) {
        const x = Math.ceil(hits[i] - 0.5),
          end = Math.ceil(hits[i + 1] - 0.5);
        ctx.fillRect(x, y, end - x, 1);
      }
    }
    if (stroke)
      points.forEach((p, i) => pixelLine(ctx, p, points[(i + 1) % points.length], stroke));
  }
  function line(ctx, a, b, color, width = 1) {
    pixelLine(ctx, P(...a), P(...b), color, width);
  }
  function dot(ctx, x, y, z, color, size = 1) {
    const p = P(x, y, z);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
  }
  function box(ctx, x, y, w, d, z, h, top, front, side, outline = '#27131a') {
    poly(
      ctx,
      [
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x, y + d, z + h]
      ],
      front,
      outline
    );
    poly(
      ctx,
      [
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x + w, y, z + h]
      ],
      side,
      outline
    );
    poly(
      ctx,
      [
        [x, y, z + h],
        [x + w, y, z + h],
        [x + w, y + d, z + h],
        [x, y + d, z + h]
      ],
      top,
      outline
    );
  }
  const left = (a, z, x = 0.04) => [x, a, z];
  const back = (a, z, y = 0.04) => [a, y, z];
  function wall(ctx, at, length, dark) {
    poly(
      ctx,
      [at(0, 0), at(length, 0), at(length, L.H), at(0, L.H)],
      dark ? '#481722' : '#541923',
      C.ink
    );
    const rnd = VC.rng(dark ? 91 : 29);
    // Narrow damask strips, with broken gold flecks rather than flat red planes.
    for (let a = 0.06; a < length; a += 0.4) {
      poly(
        ctx,
        [at(a, 1.15), at(a + 0.18, 1.15), at(a + 0.18, L.H - 0.22), at(a, L.H - 0.22)],
        dark ? '#571b27' : '#681f2b'
      );
      line(ctx, at(a, 1.15), at(a, L.H - 0.2), '#32131f');
      for (let z = 1.35; z < L.H - 0.3; z += 0.48) {
        const k = rnd();
        line(ctx, at(a + 0.08, z), at(a + 0.13, z + 0.12), k > 0.45 ? '#762d32' : '#481725');
      }
    }
    poly(ctx, [at(0, 0), at(length, 0), at(length, 1.1), at(0, 1.1)], '#3c2424');
    for (let a = 0.1; a < length; a += 0.85) {
      poly(
        ctx,
        [at(a, 0.14), at(a + 0.68, 0.14), at(a + 0.68, 0.87), at(a, 0.87)],
        '#492a27',
        '#291921'
      );
      line(ctx, at(a, 0.87), at(a + 0.68, 0.87), '#79503a');
    }
    for (const [z, col, w] of [
      [0.1, '#1e1420', 3],
      [1.1, '#a36839', 2],
      [1.18, '#321822', 1],
      [L.H - 0.22, '#b67a3e', 2],
      [L.H - 0.13, '#45251f', 3]
    ])
      line(ctx, at(0, z), at(length, z), col, w);
  }
  function boards(ctx, x0, y0, x1, y1, seed) {
    poly(
      ctx,
      [
        [x0, y0, 0],
        [x1, y0, 0],
        [x1, y1, 0],
        [x0, y1, 0]
      ],
      '#613a2c'
    );
    const rnd = VC.rng(seed);
    const tones = ['#67402d', '#75472e', '#5a342b', '#6d3c29', '#543028'];
    for (let y = y0; y < y1; y += 0.4) {
      for (let x = x0 - 2 + rnd() * 2; x < x1; x += 2.1) {
        const a = Math.max(x0, x),
          b = Math.min(x1, x + 2.1),
          d = Math.min(y1, y + 0.4);
        poly(
          ctx,
          [
            [a, y, 0],
            [b, y, 0],
            [b, d, 0],
            [a, d, 0]
          ],
          tones[Math.floor(rnd() * tones.length)],
          '#352124'
        );
        line(ctx, [a + 0.05, y + 0.06, 0], [b - 0.04, y + 0.06, 0], '#94603b');
        for (let n = 0; n < 3; n++) {
          const xx = a + rnd() * (b - a),
            yy = y + 0.12 + rnd() * 0.18;
          line(
            ctx,
            [xx, yy, 0],
            [Math.min(b - 0.02, xx + 0.1 + rnd() * 0.55), yy, 0],
            rnd() > 0.5 ? '#4c2b25' : '#805035'
          );
        }
        dot(ctx, a + 0.1, y + 0.2, 0, '#2d2024');
      }
    }
  }
  function rug(ctx, x0, y0, x1, y1) {
    poly(
      ctx,
      [
        [x0, y0, 0.01],
        [x1, y0, 0.01],
        [x1, y1, 0.01],
        [x0, y1, 0.01]
      ],
      '#a56836',
      '#241420'
    );
    poly(
      ctx,
      [
        [x0 + 0.11, y0 + 0.11, 0.01],
        [x1 - 0.11, y0 + 0.11, 0.01],
        [x1 - 0.11, y1 - 0.11, 0.01],
        [x0 + 0.11, y1 - 0.11, 0.01]
      ],
      C.carpet
    );
    for (const n of [0.24, 0.32])
      poly(
        ctx,
        [
          [x0 + n, y0 + n, 0.01],
          [x1 - n, y0 + n, 0.01],
          [x1 - n, y1 - n, 0.01],
          [x0 + n, y1 - n, 0.01]
        ],
        'rgba(0,0,0,0)',
        n === 0.24 ? '#78412e' : '#612b2c'
      );
    for (let y = y0 + 0.6; y < y1 - 0.3; y += 0.55)
      for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.65) {
        const d = 0.08;
        poly(
          ctx,
          [
            [x, y - d, 0.02],
            [x + d, y, 0.02],
            [x, y + d, 0.02],
            [x - d, y, 0.02]
          ],
          '#793335'
        );
        dot(ctx, x + 0.19, y + 0.2, 0.02, '#54202a');
      }
  }
  function lantern(ctx, at, a, z) {
    poly(
      ctx,
      [
        at(a - 0.15, z - 0.35),
        at(a + 0.15, z - 0.35),
        at(a + 0.15, z + 0.55),
        at(a - 0.15, z + 0.55)
      ],
      '#301921',
      '#a06931'
    );
    const center = P(...at(a, z + 0.15));
    ctx.fillStyle = '#4d2a21';
    ctx.fillRect(center.x - 5, center.y - 7, 10, 15);
    ctx.fillStyle = '#e6a342';
    ctx.fillRect(center.x - 4, center.y - 6, 8, 12);
    ctx.fillStyle = '#ffe6a0';
    ctx.fillRect(center.x - 2, center.y - 5, 4, 10);
    ctx.fillStyle = '#fff5bf';
    ctx.fillRect(center.x - 1, center.y - 4, 2, 7);
    ctx.fillStyle = '#8e5027';
    ctx.fillRect(center.x - 6, center.y - 8, 12, 2);
    ctx.fillRect(center.x - 5, center.y + 6, 10, 2);
    ctx.fillStyle = '#d29645';
    ctx.fillRect(center.x - 3, center.y - 10, 6, 2);
    ctx.fillRect(center.x - 2, center.y + 8, 4, 2);
    ctx.fillStyle = '#865227';
    ctx.fillRect(center.x - 4, center.y - 6, 1, 12);
    ctx.fillRect(center.x + 3, center.y - 6, 1, 12);
  }
  function plant(ctx, x, y, size = 1) {
    box(ctx, x - 0.23, y - 0.23, 0.46, 0.46, 0, 0.48, '#aa6740', '#79422d', '#4c2c27');
    line(ctx, [x - 0.23, y + 0.23, 0.39], [x + 0.23, y + 0.23, 0.39], '#c18c51');
    const p = P(x, y, 0.45),
      rnd = VC.rng(Math.round((x + y) * 83));
    // Broad, layered leaves, with stepped edges and a lighter central vein.
    for (let i = 0; i < 14; i++) {
      const angle = -Math.PI + rnd() * Math.PI;
      const length = (15 + rnd() * 16) * size;
      const dx = Math.cos(angle) * length,
        dy = Math.sin(angle) * length - 5;
      const mid = { x: p.x + dx * 0.54, y: p.y + dy * 0.6 };
      const tip = { x: Math.round(p.x + dx), y: Math.round(p.y + dy) };
      const w = (2 + rnd() * 2) * size;
      const points = [
        { x: p.x, y: p.y - 2 },
        { x: mid.x - w, y: mid.y + 2 },
        tip,
        { x: mid.x + w, y: mid.y - 3 }
      ].map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) }));
      rasterPolygon(ctx, points, ['#345735', '#49733a', '#688b42', '#2a4631'][i % 4], '#253b2c');
      pixelLine(ctx, { x: p.x, y: p.y - 1 }, tip, i % 3 ? '#759448' : '#9ba95d');
    }
  }
  function screen(ctx) {
    const x0 = L.SCREEN_X0,
      x1 = L.SCREEN_X1,
      z0 = L.SCREEN_Z0,
      z1 = L.SCREEN_Z1;
    box(
      ctx,
      x0 - 0.17,
      0,
      x1 - x0 + 0.34,
      0.13,
      z0 - 0.18,
      z1 - z0 + 0.36,
      '#5f4648',
      '#241c29',
      '#171522'
    );
    const corners = [
      [x0, 0.15, z0],
      [x1, 0.15, z0],
      [x1, 0.15, z1],
      [x0, 0.15, z1]
    ];
    const p = P(x0, 0, z1),
      q = P(x1, 0, z0);
    const gradient = ctx.createLinearGradient(p.x, p.y, q.x, q.y);
    gradient.addColorStop(0, '#aaa0a2');
    gradient.addColorStop(0.45, '#c1b9b5');
    gradient.addColorStop(1, '#8e8690');
    poly(ctx, corners, gradient, '#dbc4b0');
    line(ctx, [x0, 0.16, z0 + 0.04], [x1, 0.16, z0 + 0.04], '#695765', 2);
    // Velvet side curtains: alternating folds and shaded hems.
    for (const [a, b] of [
      [0.9, x0 - 0.03],
      [x1 + 0.03, L.W - 0.9]
    ]) {
      for (let x = a; x < b; x += 0.16) {
        const k = Math.round((x - a) / 0.16) % 4;
        poly(
          ctx,
          [
            [x, 0.22, 0.35],
            [Math.min(b, x + 0.16), 0.22, 0.35],
            [Math.min(b, x + 0.16), 0.22, L.H - 0.27],
            [x, 0.22, L.H - 0.27]
          ],
          ['#561427', '#8e2130', '#b53836', '#751b2b'][k]
        );
      }
      for (const z of [0.5, 1.85]) line(ctx, [a, 0.24, z], [b, 0.24, z], '#ce903f', 2);
    }
    for (let x = 0.9; x < L.W - 0.9; x += 0.65) {
      poly(
        ctx,
        [
          [x, 0.26, L.H - 0.25],
          [Math.min(L.W - 0.9, x + 0.65), 0.26, L.H - 0.25],
          [Math.min(L.W - 0.9, x + 0.65), 0.26, 5.08],
          [x + 0.38, 0.26, 4.98],
          [x, 0.26, 5.1]
        ],
        '#81212d',
        '#3e1725'
      );
      line(ctx, [x + 0.08, 0.27, 5.13], [x + 0.53, 0.27, 5.04], '#b3443c');
    }
    for (const x of [0.28, L.W - 0.85]) {
      box(ctx, x, 0.22, 0.6, 0.45, 3.25, 1.27, '#40303a', '#201c2a', '#141321');
      const p = P(x + 0.33, 0.68, 3.65);
      ctx.fillStyle = '#0e101a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 3, 5, -0.25, 0, Math.PI * 2);
      ctx.fill();
      const q = P(x + 0.33, 0.68, 4.22);
      ctx.fillStyle = '#65505a';
      ctx.fillRect(q.x - 1, q.y - 2, 2, 3);
    }
  }
  function counter(ctx) {
    box(ctx, 0.08, 10.65, 0.9, 2.45, 0, 0.9, '#a56b38', '#5b3226', '#432725');
    for (let y = 10.85; y < 12.9; y += 0.65)
      poly(
        ctx,
        [
          [0.99, y, 0.13],
          [0.99, y + 0.5, 0.13],
          [0.99, y + 0.5, 0.68],
          [0.99, y, 0.68]
        ],
        '#603b29',
        '#a16b3d'
      );
    box(ctx, 0.08, 10.65, 1.0, 2.45, 0.9, 0.13, '#a26737', '#603425', '#6c3c28');
    box(ctx, 0.22, 11, 0.55, 0.85, 1.03, 0.18, '#bc4738', '#8b262b', '#641f29');
    box(
      ctx,
      0.23,
      11.02,
      0.52,
      0.81,
      1.21,
      1.05,
      '#f8bf64',
      'rgba(244,192,110,.25)',
      'rgba(249,209,143,.3)'
    );
    const rnd = VC.rng(555);
    for (let i = 0; i < 55; i++)
      dot(
        ctx,
        0.3 + rnd() * 0.35,
        11.1 + rnd() * 0.6,
        1.25 + rnd() * 0.25,
        i % 3 ? '#ffdc88' : '#fff1bb',
        2
      );
    for (const y of [11.03, 11.82]) line(ctx, [0.77, y, 1.2], [0.77, y, 2.26], '#ad7543');
    box(ctx, 0.15, 10.94, 0.7, 0.97, 2.26, 0.17, '#e26740', '#a52b2f', '#70212b');
    box(ctx, 0.4, 12.25, 0.28, 0.3, 1.03, 0.26, '#ffe8ba', '#bd473a', '#f0b767');
    // Low wooden bench between the entrance and the posters.
    box(ctx, 0.15, 5.2, 0.5, 2.25, 0.2, 0.45, '#4a2a26', '#331f24', '#261b23');
    box(ctx, 0.12, 5.15, 0.78, 2.35, 0.62, 0.13, '#ad7040', '#75482d', '#4c2e26');
    box(ctx, 0.08, 5.15, 0.13, 2.35, 0.75, 0.8, '#b17a43', '#63422f', '#40282a');
  }
  // Entrance on the FRONT plane, opening toward the camera as in the reference.
  // Floor and plants belong behind the actors; the facade masks the rear aisle.
  function entranceFloor(ctx) {
    const y = L.D;
    boards(ctx, 0, y, 5.3, y + 2.1, 700);
    poly(
      ctx,
      [
        [0, y + 2.1, 0],
        [5.3, y + 2.1, 0],
        [5.3, y + 2.1, -0.5],
        [0, y + 2.1, -0.5]
      ],
      '#503029',
      '#221824'
    );
    poly(
      ctx,
      [
        [5.3, y, 0],
        [5.3, y + 2.1, 0],
        [5.3, y + 2.1, -0.5],
        [5.3, y, -0.5]
      ],
      '#36232a',
      '#221824'
    );
    rug(ctx, L.DOOR_X0 + 0.15, y - 0.25, L.DOOR_X1 - 0.15, y + 1.75);
    plant(ctx, 0.4, y + 1.35, 1.1);
    plant(ctx, 4.8, y + 1.35, 1.1);
  }
  function entrance(ctx, signText) {
    const y = L.D + 0.05,
      a = L.DOOR_X0,
      b = L.DOOR_X1,
      h = L.DOOR_H;
    const face = (x, z) => [x, y, z];
    // Two solid side panels and a lintel leave a genuine open doorway.
    for (const [x0, x1] of [
      [0, a],
      [b, 5.3]
    ]) {
      poly(ctx, [face(x0, 0), face(x1, 0), face(x1, 4.15), face(x0, 4.15)], '#581e2c', '#261723');
      for (let x = x0 + 0.13; x < x1; x += 0.24) line(ctx, face(x, 0.12), face(x, 4), '#842f35', 2);
      poly(
        ctx,
        [face(x0, 0.08), face(x1, 0.08), face(x1, 0.75), face(x0, 0.75)],
        '#3d2629',
        '#94613b'
      );
    }
    box(ctx, 0, y - 0.12, 5.3, 0.28, h + 0.08, 1.07, '#9c6437', '#632d2b', '#35202a');
    for (const x of [a - 0.13, b])
      box(ctx, x, y - 0.1, 0.13, 0.25, 0, h + 0.1, '#c28e50', '#8d5534', '#422832');
    line(ctx, face(a + 0.03, h), face(b - 0.03, h), '#d3a263', 2);
    line(ctx, face(0, 4.2), face(5.3, 4.2), '#cc9551', 3);
    // Warm lightbox with fitted lettering, projected down-right.
    poly(
      ctx,
      [
        [0.25, y + 0.2, 3.25],
        [5.05, y + 0.2, 3.25],
        [5.05, y + 0.2, 3.99],
        [0.25, y + 0.2, 3.99]
      ],
      '#251a24',
      '#ca843c'
    );
    poly(
      ctx,
      [
        [0.42, y + 0.21, 3.34],
        [4.89, y + 0.21, 3.34],
        [4.89, y + 0.21, 3.9],
        [0.42, y + 0.21, 3.9]
      ],
      '#70382a',
      '#ffd381'
    );
    const sign = VC.Decor.sign(signText);
    const p = P(0.5, y + 0.23, 3.88),
      q = P(4.8, y + 0.23, 3.88),
      r = P(0.5, y + 0.23, 3.36);
    ctx.save();
    ctx.transform((q.x - p.x) / 640, (q.y - p.y) / 640,
      (r.x - p.x) / 160, (r.y - p.y) / 160, p.x, p.y);
    ctx.drawImage(sign.image, 0, 0);
    ctx.restore();
    for (let x = 0.45; x < 5; x += 0.23)
      for (const z of [3.3, 3.95]) dot(ctx, x, y + 0.23, z, '#ffeaa1', 1);
    lantern(ctx, (x, z) => [x, y + 0.15, z], 0.57, 2.1);
    lantern(ctx, (x, z) => [x, y + 0.15, z], 4.58, 2.1);
  }
  function railings(ctx) {
    const h = 0.62;
    for (const [a, b] of [
      [
        [5.5, L.D - 0.12],
        [L.W - 0.14, L.D - 0.12]
      ],
      [
        [L.W - 0.14, 0.5],
        [L.W - 0.14, L.D - 0.12]
      ]
    ]) {
      line(ctx, [...a, h], [...b, h], '#251822', 5);
      line(ctx, [...a, h + 0.03], [...b, h + 0.03], '#a36b3d', 2);
      line(ctx, [...a, 0.27], [...b, 0.27], '#58392e', 2);
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t <= length; t += 1.5) {
        const x = a[0] + ((b[0] - a[0]) * t) / length,
          y = a[1] + ((b[1] - a[1]) * t) / length;
        box(ctx, x - 0.06, y - 0.06, 0.12, 0.12, 0, h + 0.12, '#bb9052', '#6f4935', '#402b2b');
        dot(ctx, x, y, h + 0.15, '#ffd382', 2);
      }
    }
  }
  function seatSprites() {
    const w = 56,
      h = 60,
      ax = 28,
      ay = 48,
      cushion = canvas(w, h),
      backLayer = canvas(w, h);
    function local(ctx, fn) {
      ctx.save();
      const p = P(0, 0, 0);
      ctx.translate(ax - p.x, ay - p.y);
      fn(ctx);
      ctx.restore();
    }
    local(cushion.ctx, (ctx) => {
      // Contact shadow and cast-iron feet.
      poly(
        ctx,
        [
          [-0.6, -0.15, 0],
          [0.6, -0.15, 0],
          [0.7, 0.65, 0],
          [-0.5, 0.65, 0]
        ],
        'rgba(12,8,18,.55)'
      );
      for (const x of [-0.4, 0.31])
        box(ctx, x, -0.19, 0.09, 0.6, 0, 0.3, '#5b3940', '#1c1722', '#120f19');
      box(ctx, -0.52, -0.42, 1.04, 0.86, 0.28, 0.27, '#a4323a', '#7e202e', '#491b2a');
      poly(
        ctx,
        [
          [-0.46, -0.36, 0.56],
          [0.43, -0.36, 0.56],
          [0.47, 0.31, 0.56],
          [-0.47, 0.31, 0.56]
        ],
        '#9b2d37',
        '#bd4744'
      );
      line(ctx, [-0.43, 0.28, 0.56], [0.43, 0.28, 0.56], '#5b1b2a');
      for (const x of [-0.65, 0.52]) {
        box(ctx, x, -0.38, 0.13, 0.95, 0.12, 0.57, '#b1793f', '#633b2b', '#3a2427');
        line(ctx, [x, -0.33, 0.71], [x, 0.46, 0.71], '#d49c53');
        dot(ctx, x + 0.06, -0.13, 0.72, '#251a25', 2);
      }
    });
    local(backLayer.ctx, (ctx) => {
      // Rounded upholstered back, piping, seam, and a wooden base.
      const a = -0.53,
        b = 0.53,
        y = 0.46;
      poly(
        ctx,
        [
          [a, y, 0.35],
          [b, y, 0.35],
          [b, y, 1.35],
          [b - 0.12, y, 1.48],
          [a + 0.12, y, 1.48],
          [a, y, 1.35]
        ],
        '#6f1d2c',
        '#241320'
      );
      poly(
        ctx,
        [
          [a + 0.08, y + 0.025, 0.44],
          [b - 0.07, y + 0.025, 0.44],
          [b - 0.07, y + 0.025, 1.3],
          [b - 0.17, y + 0.025, 1.4],
          [a + 0.17, y + 0.025, 1.4],
          [a + 0.08, y + 0.025, 1.3]
        ],
        '#912735'
      );
      poly(
        ctx,
        [
          [b, y, 0.35],
          [b, 0.61, 0.35],
          [b, 0.61, 1.32],
          [b, y, 1.35]
        ],
        '#481b2b',
        '#251522'
      );
      poly(
        ctx,
        [
          [a, y, 1.35],
          [a + 0.12, y, 1.48],
          [b - 0.12, y, 1.48],
          [b, y, 1.35],
          [b, 0.6, 1.32],
          [a, 0.6, 1.32]
        ],
        '#bd4845',
        '#381927'
      );
      const fabric = ['#84303a', '#94353d', '#a23c41', '#a83e43', '#9c353d', '#8f2b36', '#7e2531'];
      for (let i = 0; i < fabric.length; i++) {
        const z = 0.52 + i * 0.105;
        poly(
          ctx,
          [
            [a + 0.12, y + 0.04, z],
            [b - 0.13, y + 0.04, z],
            [b - 0.13, y + 0.04, z + 0.105],
            [a + 0.12, y + 0.04, z + 0.105]
          ],
          fabric[i]
        );
      }
      for (const x of [-0.25, 0.23]) {
        dot(ctx, x, y + 0.055, 0.96, '#63232e');
        dot(ctx, x - 0.025, y + 0.055, 1.0, '#bc5550');
      }
      line(ctx, [a + 0.13, y + 0.03, 1.36], [b - 0.14, y + 0.03, 1.36], '#df6851');
      line(ctx, [a + 0.12, y + 0.03, 0.5], [a + 0.12, y + 0.03, 1.24], '#ad3d3c');
      line(ctx, [b - 0.15, y + 0.03, 0.5], [b - 0.15, y + 0.03, 1.24], '#601d2c');
      line(ctx, [-0.04, y + 0.03, 0.56], [-0.04, y + 0.03, 1.22], '#7b2132');
      box(ctx, -0.52, 0.48, 1.04, 0.14, 0.24, 0.15, '#8d5934', '#4f3029', '#2e2026');
    });
    return { cushion: cushion.c, back: backLayer.c, ax, ay };
  }
  VC.buildScene = function (opts = {}) {
    if (VC.Art.available) return VC.Art.scene(opts);
    const bg = canvas(L.VIEW_W, L.VIEW_H),
      fg = canvas(L.VIEW_W, L.VIEW_H),
      ctx = bg.ctx;
    // The slab and floor are drawn before the walls, so trim never disappears.
    poly(
      ctx,
      [
        [0, L.D, 0],
        [L.W, L.D, 0],
        [L.W, L.D, -0.65],
        [0, L.D, -0.65]
      ],
      '#4a2a2b',
      '#211622'
    );
    poly(
      ctx,
      [
        [L.W, 0, 0],
        [L.W, L.D, 0],
        [L.W, L.D, -0.65],
        [L.W, 0, -0.65]
      ],
      '#301f29',
      '#19131f'
    );
    boards(ctx, 0, 0, L.W, L.D, 1234);
    wall(ctx, back, L.W, false);
    wall(ctx, left, L.D, true);
    // Thick crown moulding on the cutaway silhouette.
    poly(
      ctx,
      [
        [-0.27, -0.27, L.H],
        [L.W, -0.27, L.H],
        [L.W, 0, L.H],
        [0, 0, L.H],
        [0, L.D, L.H],
        [-0.27, L.D, L.H]
      ],
      '#74442e',
      '#281823'
    );
    line(ctx, [0, 0, L.H], [L.W, 0, L.H], '#bf8443');
    line(ctx, [0, 0, L.H], [0, L.D, L.H], '#bf8443');
    screen(ctx);
    const lights = [];
    for (const y of [1.05, 4.35, 8.3, 13.55]) {
      lantern(ctx, left, y, 3.15);
      lights.push({ ...P(0.07, y, 3.35), r: 31, col: '255,163,68', a: 0.23 });
    }
    for (const x of [1.1, L.W - 1.1]) {
      lantern(ctx, back, x, 2.35);
      lights.push({ ...P(x, 0.1, 2.6), r: 25, col: '255,175,80', a: 0.18 });
    }
    rug(ctx, 2.0, 2.9, L.W - 1.8, 15.65);
    // Central aisle and fine double borders frame the six rows.
    rug(ctx, L.CENTER_AISLE - 0.53, 2.95, L.CENTER_AISLE + 0.53, 16.75);
    box(ctx, 1.15, 0.3, L.W - 2.3, 1.65, 0, 0.26, '#4b2a29', '#2c1c25', '#261b24');
    for (let x = 1.4; x < L.W - 1.3; x += 0.9) {
      line(ctx, [x, 0.33, 0.27], [x, 1.92, 0.27], '#674033');
      dot(ctx, x, 1.96, 0.12, '#ffd68a', 1);
    }
    counter(ctx);
    entranceFloor(ctx);
    entrance(fg.ctx, opts.signText);
    plant(ctx, 0.7, 1.0, 1.0);
    plant(ctx, L.W - 0.7, 0.8, 1.1);
    plant(ctx, 0.65, 14.3, 0.85);
    for (const y of L.ROWS)
      for (const x of [1.82, L.W - 1.65]) {
        box(ctx, x, y - 0.25, 0.1, 0.3, 0, 0.08, '#c78745', '#55342a', '#32232a');
        dot(ctx, x + 0.05, y - 0.1, 0.1, '#ffd388', 2);
      }
    railings(fg.ctx);
    lights.push({ ...P(0.65, 11.4, 1.75), r: 22, col: '255,187,89', a: 0.18 });
    for (const x of [0.57, 4.58])
      lights.push({ ...P(x, L.D + 0.2, 2.3), r: 26, col: '255,164,79', a: 0.19 });
    return {
      bg: bg.c,
      fg: fg.c,
      seats: seatSprites(),
      lights,
      screenGlow: P(L.W / 2, 1.5, 0.2)
    };
  };
})();
