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
  function path(ctx, pts) {
    ctx.beginPath();
    pts.forEach((q, i) => {
      const p = P(...q);
      const x = Math.round(p.x),
        y = Math.round(p.y);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
  }
  function poly(ctx, pts, color, stroke) {
    path(ctx, pts);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  function line(ctx, a, b, color, width = 1) {
    const p = P(...a),
      q = P(...b);
    ctx.beginPath();
    ctx.moveTo(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5);
    ctx.lineTo(Math.round(q.x) + 0.5, Math.round(q.y) + 0.5);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
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
  function poster(ctx, a, kind) {
    const z0 = 1.85,
      z1 = 4.55,
      b = a + 1.6;
    poly(
      ctx,
      [
        left(a - 0.14, z0 - 0.14),
        left(b + 0.14, z0 - 0.14),
        left(b + 0.14, z1 + 0.14),
        left(a - 0.14, z1 + 0.14)
      ],
      '#291721',
      '#110e18'
    );
    poly(
      ctx,
      [
        left(a - 0.06, z0 - 0.06),
        left(b + 0.06, z0 - 0.06),
        left(b + 0.06, z1 + 0.06),
        left(a - 0.06, z1 + 0.06)
      ],
      '#b87c3d',
      '#e6aa57'
    );
    poly(
      ctx,
      [left(a, z0), left(b, z0), left(b, z1), left(a, z1)],
      kind === 0 ? '#ba6550' : kind === 1 ? '#283950' : '#3c534a'
    );
    if (kind === 0) {
      poly(
        ctx,
        [left(a, 2.35), left(a + 0.55, 3.8), left(a + 1, 3.02), left(b, 3.6), left(b, 2.35)],
        '#4d354d'
      );
      poly(ctx, [left(a, 2.35), left(a + 0.9, 3.4), left(b, 2.35)], '#292b3c');
      dot(ctx, 0.06, b - 0.3, 4.13, '#ffd280', 4);
    } else {
      const rnd = VC.rng(kind * 739);
      for (let i = 0; i < 42; i++)
        dot(
          ctx,
          0.06,
          a + 0.12 + rnd() * 1.32,
          2.4 + rnd() * 1.9,
          i % 4 ? '#c28d53' : '#f4c480',
          i % 7 ? 1 : 2
        );
      if (kind === 1)
        poly(
          ctx,
          [left(a + 0.3, 2.4), left(a + 0.65, 3.8), left(a + 1.2, 3.6), left(a + 1.45, 2.4)],
          '#a26944'
        );
    }
    // Tiny typeset poster footer, following the wall perspective.
    const p = P(0.08, b - 0.08, 2.12);
    ctx.save();
    ctx.transform(0.72, -0.36, 0, 1, p.x, p.y);
    ctx.fillStyle = '#edc47d';
    ctx.font = '7px "Pixelify Sans", monospace';
    ctx.fillText(['MIDNIGHT', 'STARDUST', 'GOOD VIBES'][kind], 0, 0);
    ctx.restore();
  }
  function plant(ctx, x, y, size = 1) {
    box(ctx, x - 0.23, y - 0.23, 0.46, 0.46, 0, 0.48, '#aa6740', '#79422d', '#4c2c27');
    line(ctx, [x - 0.23, y + 0.23, 0.39], [x + 0.23, y + 0.23, 0.39], '#c18c51');
    const p = P(x, y, 0.45),
      rnd = VC.rng(Math.round((x + y) * 83));
    for (let i = 0; i < 15; i++) {
      const dx = (rnd() - 0.5) * 23 * size,
        dy = -(5 + rnd() * 19) * size;
      ctx.strokeStyle = '#233d28';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + dx, p.y + dy);
      ctx.stroke();
      const col = ['#345c30', '#557e39', '#718e3e', '#2a482b'][i % 4];
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(p.x + dx, p.y + dy);
      ctx.lineTo(p.x + dx * 0.35 - 3, p.y + dy * 0.5 + 1);
      ctx.lineTo(p.x + dx * 0.4 + 3, p.y + dy * 0.6 + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#83994b';
      ctx.fillRect(Math.round(p.x + dx * 0.8), Math.round(p.y + dy * 0.8), 1, 2);
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
  function entrance(ctx) {
    const a = L.DOOR_Y0,
      b = L.DOOR_Y1,
      h = L.DOOR_H;
    poly(ctx, [left(a, 0), left(b, 0), left(b, h), left(a, h)], '#1a1421');
    poly(
      ctx,
      [left(a + 0.12, 0), left(b - 0.12, 0), left(b - 0.12, 1.8), left(a + 0.12, 1.8)],
      '#4b3029'
    );
    for (const y of [a - 0.15, b])
      box(ctx, -0.09, y, 0.23, 0.15, 0, h + 0.15, '#bf8848', '#76452e', '#4c2c28');
    box(ctx, -0.1, a - 0.15, 0.25, b - a + 0.3, h, 0.18, '#c28747', '#8c5530', '#42282a');
    // Small draped header above the doorway.
    for (let y = a - 0.1; y < b + 0.1; y += 0.2)
      poly(
        ctx,
        [left(y, h + 0.2), left(y + 0.2, h + 0.2), left(y + 0.2, h + 0.8), left(y, h + 0.8)],
        Math.round(y * 10) % 4 ? '#8f2b35' : '#571c2c'
      );
    boards(ctx, -2.5, a - 0.55, 0, b + 0.65, 700);
    poly(
      ctx,
      [
        [-2.5, b + 0.65, 0],
        [0, b + 0.65, 0],
        [0, b + 0.65, -0.35],
        [-2.5, b + 0.65, -0.35]
      ],
      '#4a2a28',
      '#211421'
    );
    box(ctx, -0.22, a - 0.53, 0.28, 0.2, 0, 2.8, '#9c653c', '#632f29', '#351c24');
    box(ctx, -0.22, b + 0.43, 0.28, 0.2, 0, 2.8, '#9c653c', '#632f29', '#351c24');
    // Project the CINEMA sign onto the plane of the entrance wall.
    const p = P(-0.23, b + 0.5, 3.05);
    ctx.save();
    ctx.transform(0.9, -0.45, 0, 1, p.x, p.y);
    ctx.fillStyle = '#261821';
    ctx.fillRect(-3, -17, 53, 21);
    ctx.strokeStyle = '#ba6f2e';
    ctx.strokeRect(-3, -17, 53, 21);
    ctx.fillStyle = '#844126';
    ctx.fillRect(0, -14, 47, 15);
    ctx.strokeStyle = '#ffd16c';
    ctx.strokeRect(0, -14, 47, 15);
    ctx.fillStyle = '#ffe4a0';
    ctx.font = 'bold 12px "Pixelify Sans",monospace';
    ctx.fillText('CINEMA', 3, -2);
    for (let x = 1; x < 48; x += 4) {
      ctx.fillStyle = '#ffcf68';
      ctx.fillRect(x, -16, 1, 1);
      ctx.fillRect(x, 2, 1, 1);
    }
    ctx.restore();
    plant(ctx, -1.7, a - 0.25, 0.8);
    plant(ctx, -1.7, b + 0.35, 0.8);
  }
  function railings(ctx) {
    const h = 0.62;
    for (const [a, b] of [
      [
        [0.2, L.D - 0.12],
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
    const w = 40,
      h = 42,
      ax = 20,
      ay = 33,
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
      line(ctx, [a + 0.13, y + 0.03, 1.36], [b - 0.14, y + 0.03, 1.36], '#df6851');
      line(ctx, [a + 0.12, y + 0.03, 0.5], [a + 0.12, y + 0.03, 1.24], '#ad3d3c');
      line(ctx, [b - 0.15, y + 0.03, 0.5], [b - 0.15, y + 0.03, 1.24], '#601d2c');
      line(ctx, [-0.04, y + 0.03, 0.56], [-0.04, y + 0.03, 1.22], '#7b2132');
      box(ctx, -0.52, 0.48, 1.04, 0.14, 0.24, 0.15, '#8d5934', '#4f3029', '#2e2026');
    });
    return { cushion: cushion.c, back: backLayer.c, ax, ay };
  }
  VC.buildScene = function () {
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
    poster(ctx, 2.1, 0);
    poster(ctx, 6.1, 1);
    poster(ctx, 9.35, 2);
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
    entrance(ctx);
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
    lights.push({ ...P(-0.2, L.doorY, 1), r: 23, col: '255,164,79', a: 0.16 });
    const doorPoly = [
      [0, L.DOOR_Y0, 0],
      [0, L.DOOR_Y1, 0],
      [0, L.DOOR_Y1, L.DOOR_H],
      [0, L.DOOR_Y0, L.DOOR_H]
    ].map((q) => P(...q));
    return {
      bg: bg.c,
      fg: fg.c,
      seats: seatSprites(),
      doorPoly,
      lights,
      screenGlow: P(L.W / 2, 1.5, 0.2)
    };
  };
})();
