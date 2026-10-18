/*
 * Static cinema art, painted once into offscreen canvases at the internal
 * pixel-art resolution. Animated lighting is the only per-frame part.
 * Note: the screen is intentionally left blank (OBS handles announcements).
 */
(function () {
  'use strict';
  const VC = window.VC;
  const L = VC.Layout;
  const P = L.project;
  const shade = (c, a) => VC.shade(c, a);

  const C = {
    wall: '#5b1a1e', wallDark: '#47141a', wallSeam: '#3e1015', wallHi: '#6e2328',
    leftWall: '#4d161b', leftSeam: '#350e13',
    wains: '#5a3420', wainsDark: '#40240f', wainsHi: '#734528',
    trim: '#3b2214', trimHi: '#7a4b26', gold: '#c99a3f',
    floor: '#5a3a22', floorLine: '#4a2f1b', floorHi: '#6b472a',
    carpet: '#6e1820', carpetDark: '#5a1219', carpetPat: '#7f2028', carpetBorder: '#a8742e',
    stage: '#3d1e14', stageFace: '#2c140d', stageHi: '#58301d',
    screen: '#d9dde4', screenEdge: '#b9bfc9', screenFrame: '#1b1012',
    curtain: '#8e1b22', curtainDark: '#6a1218', curtainHi: '#b02a30',
    slab: '#2b170d', slabDark: '#1e0f08',
    seat: '#a11d26', seatDark: '#7a1219', seatHi: '#c43a3f', seatArm: '#4a2a18', seatArmHi: '#6b3e22'
  };

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { c, ctx };
  }

  function poly(ctx, pts, fill, stroke) {
    ctx.beginPath();
    pts.forEach((p, i) => { const s = P(p[0], p[1], p[2] || 0); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function line(ctx, a, b, color, w = 1) {
    const s = P(a[0], a[1], a[2] || 0), e = P(b[0], b[1], b[2] || 0);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }
  function dot(ctx, x, y, z, color, size = 1) {
    const s = P(x, y, z);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(s.x - size / 2), Math.round(s.y - size / 2), size, size);
  }
  // Axis-aligned box helper: draws the three visible faces (top, +y face, +x face).
  function box(ctx, x0, y0, x1, y1, z0, z1, top, sideY, sideX) {
    poly(ctx, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], sideY);
    poly(ctx, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], sideX);
    poly(ctx, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top);
  }

  // ------------------------------------------------------------------ walls
  function backWall(ctx) {
    const { W, H } = L;
    poly(ctx, [[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]], C.wall);
    for (let x = 0.3; x < W; x += 0.55) line(ctx, [x, 0, 0.95], [x, 0, H - 0.25], (Math.round(x * 10) % 2) ? C.wallSeam : C.wallDark);
    for (let x = 0.55; x < W; x += 1.1) line(ctx, [x, 0, 1.0], [x, 0, H - 0.3], C.wallHi);
    poly(ctx, [[0, 0, 0], [W, 0, 0], [W, 0, 0.95], [0, 0, 0.95]], C.wains);
    for (let x = 0.4; x < W; x += 0.8) line(ctx, [x, 0, 0.1], [x, 0, 0.85], C.wainsDark);
    line(ctx, [0, 0, 0.95], [W, 0, 0.95], C.trimHi);
    poly(ctx, [[0, 0, H - 0.25], [W, 0, H - 0.25], [W, 0, H], [0, 0, H]], C.trim);
    line(ctx, [0, 0, H - 0.25], [W, 0, H - 0.25], C.gold);
  }

  function leftWall(ctx) {
    const { D, H } = L;
    poly(ctx, [[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]], C.leftWall);
    for (let y = 0.3; y < D; y += 0.55) line(ctx, [0, y, 0.95], [0, y, H - 0.25], (Math.round(y * 10) % 2) ? C.leftSeam : '#3f1116');
    for (let y = 0.55; y < D; y += 1.1) line(ctx, [0, y, 1.0], [0, y, H - 0.3], '#5f1d23');
    poly(ctx, [[0, 0, 0], [0, D, 0], [0, D, 0.95], [0, 0, 0.95]], C.wainsDark);
    for (let y = 0.4; y < D; y += 0.8) line(ctx, [0, y, 0.1], [0, y, 0.85], '#331b0c');
    line(ctx, [0, 0, 0.95], [0, D, 0.95], C.wainsHi);
    poly(ctx, [[0, 0, H - 0.25], [0, D, H - 0.25], [0, D, H], [0, 0, H]], '#321b10');
    line(ctx, [0, 0, H - 0.25], [0, D, H - 0.25], C.gold);
  }

  function wallTops(ctx) {
    const { W, D, H } = L, t = 0.32;
    // End caps (wall thickness visible where the cutaway ends)
    poly(ctx, [[0, D, -0.5], [-t, D, -0.5], [-t, D, H], [0, D, H]], '#2a1410');
    poly(ctx, [[W, 0, -0.5], [W, -t, -0.5], [W, -t, H], [W, 0, H]], '#3a1a14');
    line(ctx, [W, 0, 0.95], [W, -t, 0.95], C.trimHi);
    line(ctx, [0, D, 0.95], [-t, D, 0.95], C.wainsHi);
    poly(ctx, [[-t, -t, H], [W, -t, H], [W, 0, H], [0, 0, H], [0, D, H], [-t, D, H]], '#4a2a18');
    line(ctx, [0, 0, H], [W, 0, H], C.trimHi);
    line(ctx, [0, 0, H], [0, D, H], C.trimHi);
    line(ctx, [-t, -t, H], [W, -t, H], '#2b170d');
    line(ctx, [-t, -t, H], [-t, D, H], '#2b170d');
  }

  // ------------------------------------------------------------------ screen + curtains
  function screen(ctx) {
    const { SCREEN_X0: x0, SCREEN_X1: x1, SCREEN_Z0: z0, SCREEN_Z1: z1 } = L;
    poly(ctx, [[x0 - 0.18, 0, z0 - 0.16], [x1 + 0.18, 0, z0 - 0.16], [x1 + 0.18, 0, z1 + 0.16], [x0 - 0.18, 0, z1 + 0.16]], C.screenFrame);
    poly(ctx, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], C.screen);
    // soft vignette toward the edges (no content, stays blank)
    for (let i = 1; i <= 3; i++) {
      const k = i * 0.07;
      poly(ctx, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z0 + k], [x0, 0, z0 + k]], 'rgba(150,158,172,0.18)');
      poly(ctx, [[x0, 0, z1 - k], [x1, 0, z1 - k], [x1, 0, z1], [x0, 0, z1]], 'rgba(150,158,172,0.14)');
      poly(ctx, [[x0, 0, z0], [x0 + k * 2, 0, z0], [x0 + k * 2, 0, z1], [x0, 0, z1]], 'rgba(150,158,172,0.16)');
      poly(ctx, [[x1 - k * 2, 0, z0], [x1, 0, z0], [x1, 0, z1], [x1 - k * 2, 0, z1]], 'rgba(150,158,172,0.16)');
    }
  }

  function curtain(ctx, xa, xb, z0, z1) {
    poly(ctx, [[xa, 0.06, z0], [xb, 0.06, z0], [xb, 0.06, z1], [xa, 0.06, z1]], C.curtain);
    let k = 0;
    for (let x = xa + 0.11; x < xb; x += 0.22, k++) {
      line(ctx, [x, 0.06, z0 + 0.05], [x, 0.06, z1], k % 2 ? C.curtainDark : C.curtainHi);
    }
    // gathered tie-back
    poly(ctx, [[xa, 0.08, 1.75], [xb, 0.08, 1.75], [xb, 0.08, 1.92], [xa, 0.08, 1.92]], C.gold);
  }

  function valance(ctx) {
    const x0 = 0.95, x1 = 16.75, z = 4.12, H = L.H - 0.25;
    poly(ctx, [[x0, 0.07, z], [x1, 0.07, z], [x1, 0.07, H], [x0, 0.07, H]], C.curtain);
    for (let x = x0; x < x1 - 0.01; x += 0.66) {
      poly(ctx, [[x, 0.07, z], [x + 0.66, 0.07, z], [x + 0.33, 0.07, z - 0.2]], C.curtainDark);
      dot(ctx, x + 0.33, 0.07, z - 0.24, C.gold);
    }
    line(ctx, [x0, 0.07, z + 0.05], [x1, 0.07, z + 0.05], C.gold);
  }

  function speaker(ctx, x, z) {
    poly(ctx, [[x, 0.05, z], [x + 0.55, 0.05, z], [x + 0.55, 0.05, z + 0.85], [x, 0.05, z + 0.85]], '#1c1414');
    poly(ctx, [[x + 0.55, 0.05, z], [x + 0.55, 0.3, z], [x + 0.55, 0.3, z + 0.85], [x + 0.55, 0.05, z + 0.85]], '#120c0c');
    dot(ctx, x + 0.28, 0.05, z + 0.6, '#3a2e2e', 2);
    dot(ctx, x + 0.28, 0.05, z + 0.25, '#3a2e2e', 3);
  }

  // ------------------------------------------------------------------ floor, carpet, stage
  function floor(ctx) {
    const { W, D } = L;
    // slab thickness on the open (front) edges
    poly(ctx, [[0, D, 0], [W, D, 0], [W, D, -0.55], [0, D, -0.55]], C.slab);
    poly(ctx, [[W, 0, 0], [W, D, 0], [W, D, -0.55], [W, 0, -0.55]], C.slabDark);
    line(ctx, [0, D, -0.05], [W, D, -0.05], '#4a2a16');
    line(ctx, [W, 0, -0.05], [W, D, -0.05], '#3a2010');
    poly(ctx, [[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0]], C.floor);
    const r = VC.rng(1234);
    for (let y = 0.45; y < D; y += 0.45) {
      line(ctx, [0, y], [W, y], C.floorLine);
      for (let x = r() * 2; x < W; x += 1.6 + r() * 1.4) line(ctx, [x, y - 0.45], [x, y], C.floorLine);
      if (r() < 0.5) line(ctx, [r() * W, y - 0.22], [r() * W, y - 0.22], C.floorHi);
    }
  }

  function carpet(ctx) {
    const x0 = 1.68, x1 = 16.02, y0 = 3.2, y1 = 11.86;
    poly(ctx, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], C.carpetBorder);
    poly(ctx, [[x0 + 0.14, y0 + 0.14], [x1 - 0.14, y0 + 0.14], [x1 - 0.14, y1 - 0.14], [x0 + 0.14, y1 - 0.14]], C.carpet);
    // diamond lattice pattern
    for (let x = x0 + 0.6; x < x1 - 0.3; x += 0.9) {
      for (let y = y0 + 0.6; y < y1 - 0.3; y += 0.9) {
        const d = 0.16;
        poly(ctx, [[x, y - d], [x + d, y], [x, y + d], [x - d, y]], C.carpetPat);
      }
    }
    for (let x = x0 + 0.3; x < x1; x += 0.6) dot(ctx, x, y0 + 0.07, 0, '#d1a050');
    for (let x = x0 + 0.3; x < x1; x += 0.6) dot(ctx, x, y1 - 0.07, 0, '#d1a050');
    // aisle runner down the centre
    poly(ctx, [[L.CENTER_AISLE - 0.38, y0 + 0.14], [L.CENTER_AISLE + 0.38, y0 + 0.14], [L.CENTER_AISLE + 0.38, y1 - 0.14], [L.CENTER_AISLE - 0.38, y1 - 0.14]], C.carpetDark);
  }

  function stage(ctx) {
    const x0 = 0.9, x1 = 16.75, d = L.STAGE_D, h = 0.32;
    box(ctx, x0, 0, x1, d, 0, h, C.stage, C.stageFace, '#24100a');
    for (let x = x0 + 0.5; x < x1; x += 0.9) line(ctx, [x, 0, h], [x, d, h], '#331a10');
    line(ctx, [x0, d, h], [x1, d, h], C.stageHi);
    for (let x = x0 + 0.45; x < x1; x += 0.9) dot(ctx, x, d, h * 0.45, '#ffcf7a');
  }

  function aisleLights(ctx) {
    for (const ry of L.ROWS) {
      dot(ctx, 1.62, ry - 0.2, 0.02, '#ffbf5e', 2);
      dot(ctx, 16.08, ry - 0.2, 0.02, '#ffbf5e', 2);
    }
  }

  // ------------------------------------------------------------------ props
  function sconce(ctx, y, z) {
    poly(ctx, [[0.02, y - 0.12, z - 0.25], [0.02, y + 0.12, z - 0.25], [0.02, y + 0.12, z + 0.05], [0.02, y - 0.12, z + 0.05]], '#6b4422');
    poly(ctx, [[0.05, y - 0.2, z], [0.05, y + 0.2, z], [0.05, y + 0.14, z + 0.42], [0.05, y - 0.14, z + 0.42]], '#ffd27a');
    line(ctx, [0.05, y - 0.2, z], [0.05, y + 0.2, z], '#8a5a2a');
  }
  function sconceBack(ctx, x, z) {
    poly(ctx, [[x - 0.12, 0.02, z - 0.25], [x + 0.12, 0.02, z - 0.25], [x + 0.12, 0.02, z + 0.05], [x - 0.12, 0.02, z + 0.05]], '#6b4422');
    poly(ctx, [[x - 0.2, 0.05, z], [x + 0.2, 0.05, z], [x + 0.14, 0.05, z + 0.42], [x - 0.14, 0.05, z + 0.42]], '#ffd27a');
  }

  function poster(ctx, y0, y1, z0, z1, art) {
    poly(ctx, [[0.02, y0 - 0.1, z0 - 0.12], [0.02, y1 + 0.1, z0 - 0.12], [0.02, y1 + 0.1, z1 + 0.12], [0.02, y0 - 0.1, z1 + 0.12]], '#b0802f');
    poly(ctx, [[0.03, y0, z0], [0.03, y1, z0], [0.03, y1, z1], [0.03, y0, z1]], art.sky);
    const ym = (y0 + y1) / 2;
    if (art.kind === 'mountain') {
      poly(ctx, [[0.04, y0 + 0.05, z0 + 0.25], [0.04, ym - 0.1, z1 - 0.45], [0.04, ym + 0.25, z0 + 0.7], [0.04, y1 - 0.15, z1 - 0.7], [0.04, y1 - 0.05, z0 + 0.25]], art.fg);
      poly(ctx, [[0.04, ym - 0.22, z1 - 0.58], [0.04, ym - 0.1, z1 - 0.45], [0.04, ym + 0.02, z1 - 0.58]], '#f4efe6');
      dot(ctx, 0.04, y1 - 0.35, z1 - 0.3, '#ffe28a', 2);
    } else if (art.kind === 'reel') {
      const c = P(0.04, ym, (z0 + z1) / 2);
      ctx.fillStyle = art.fg; ctx.beginPath(); ctx.ellipse(c.x, c.y, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = art.sky;
      [[0, -3], [0, 3], [-3, 0], [3, 0]].forEach(([dx, dy]) => ctx.fillRect(Math.round(c.x + dx - 1), Math.round(c.y + dy - 1), 2, 2));
    } else {
      for (let i = 0; i < 9; i++) dot(ctx, 0.04, y0 + 0.12 + ((i * 37) % 10) / 10 * (y1 - y0 - 0.24), z0 + 0.2 + ((i * 53) % 10) / 10 * (z1 - z0 - 0.4), i % 3 ? '#f5f0c8' : '#9ad1ff');
      const m = P(0.04, y1 - 0.4, z1 - 0.35); ctx.fillStyle = '#f2e6b0'; ctx.beginPath(); ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function plant(ctx, x, y, s = 1) {
    box(ctx, x - 0.22 * s, y - 0.22 * s, x + 0.22 * s, y + 0.22 * s, 0, 0.42 * s, '#5a2f17', '#7a4220', '#5e3218');
    line(ctx, [x - 0.22 * s, y + 0.22 * s, 0.42 * s], [x + 0.22 * s, y + 0.22 * s, 0.42 * s], '#a0602f');
    const base = P(x, y, 0.45 * s);
    const leaves = [[-5, -9, '#2f6b33'], [4, -10, '#2f6b33'], [-2, -13, '#3f8a3f'], [6, -5, '#3f8a3f'], [-7, -4, '#3f8a3f'], [1, -7, '#58a84f'], [-3, -6, '#58a84f'], [3, -14, '#58a84f']];
    for (const [dx, dy, col] of leaves) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(base.x + dx * s, base.y + dy * s, 3 * s, 1.6 * s, Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function popcornCounter(ctx) {
    const y0 = 9.0, y1 = 10.55;
    box(ctx, 0.02, y0, 0.72, y1, 0, 0.82, '#6b3f22', '#4e2c16', '#5d351c');
    line(ctx, [0.02, y1, 0.82], [0.72, y1, 0.82], '#9a6334');
    line(ctx, [0.72, y0, 0.82], [0.72, y1, 0.82], '#9a6334');
    // machine
    box(ctx, 0.12, y0 + 0.25, 0.6, y0 + 0.85, 0.82, 1.05, '#b3262c', '#8a1a20', '#9d2026');
    box(ctx, 0.14, y0 + 0.27, 0.58, y0 + 0.83, 1.05, 1.55, 'rgba(255,240,200,0.35)', 'rgba(255,230,170,0.55)', 'rgba(255,230,170,0.45)');
    box(ctx, 0.16, y0 + 0.3, 0.56, y0 + 0.8, 1.05, 1.28, '#ffe08a', '#f7cf5a', '#f0c24a');
    box(ctx, 0.1, y0 + 0.22, 0.62, y0 + 0.88, 1.55, 1.7, '#c9302f', '#9a1f22', '#ad2427');
    // cups
    box(ctx, 0.25, y0 + 1.0, 0.5, y0 + 1.25, 0.82, 1.05, '#fff3d6', '#e9dcc0', '#d9c9a8');
    dot(ctx, 0.37, y0 + 1.12, 1.1, '#ffe08a', 2);
  }

  function door(ctx) {
    const { DOOR_Y0: y0, DOOR_Y1: y1, DOOR_H: h } = L;
    poly(ctx, [[0, y0, 0], [0, y1, 0], [0, y1, h], [0, y0, h]], '#140806');
    // warm corridor light from below
    for (let i = 0; i < 4; i++) {
      poly(ctx, [[0, y0, 0], [0, y1, 0], [0, y1, 0.25 + i * 0.25], [0, y0, 0.25 + i * 0.25]], 'rgba(255,150,60,0.07)');
    }
    // frame
    poly(ctx, [[0.04, y0 - 0.14, 0], [0.04, y0, 0], [0.04, y0, h], [0.04, y0 - 0.14, h]], '#7a4b26');
    poly(ctx, [[0.04, y1, 0], [0.04, y1 + 0.14, 0], [0.04, y1 + 0.14, h], [0.04, y1, h]], '#7a4b26');
    poly(ctx, [[0.04, y0 - 0.14, h], [0.04, y1 + 0.14, h], [0.04, y1 + 0.14, h + 0.14], [0.04, y0 - 0.14, h + 0.14]], '#8d5a2c');
    // marquee lightbox above the door (decorative, no text)
    const mz0 = h + 0.32, mz1 = h + 0.95, my0 = y0 - 0.25, my1 = y1 + 0.25;
    poly(ctx, [[0.06, my0, mz0], [0.06, my1, mz0], [0.06, my1, mz1], [0.06, my0, mz1]], '#3a1a10');
    poly(ctx, [[0.07, my0 + 0.12, mz0 + 0.12], [0.07, my1 - 0.12, mz0 + 0.12], [0.07, my1 - 0.12, mz1 - 0.12], [0.07, my0 + 0.12, mz1 - 0.12]], '#b8322a');
    // little film strip motif
    for (let y = my0 + 0.3; y < my1 - 0.2; y += 0.28) poly(ctx, [[0.08, y, mz0 + 0.25], [0.08, y + 0.16, mz0 + 0.25], [0.08, y + 0.16, mz1 - 0.25], [0.08, y, mz1 - 0.25]], '#f3d38a');
    for (let y = my0 + 0.05; y <= my1; y += 0.2) { dot(ctx, 0.08, y, mz0 + 0.05, '#ffe9a8'); dot(ctx, 0.08, y, mz1 - 0.05, '#ffe9a8'); }
  }

  // ------------------------------------------------------------------ foreground railings
  function railings(ctx) {
    const { W, D } = L, h = 0.62, inset = 0.14;
    const posts = [];
    for (let x = 0.2; x <= W - 0.1; x += 1.45) posts.push([x, D - inset]);
    for (let y = 0.4; y <= D - 0.2; y += 1.45) posts.push([W - inset, y]);
    posts.push([W - inset, D - inset]);
    posts.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
    // rails first (behind posts visually ok at this scale)
    poly(ctx, [[0.1, D - inset - 0.05, h], [W - inset, D - inset - 0.05, h], [W - inset, D - inset + 0.07, h], [0.1, D - inset + 0.07, h]], '#7a4b26');
    poly(ctx, [[W - inset - 0.05, 0.3, h], [W - inset + 0.07, 0.3, h], [W - inset + 0.07, D - inset, h], [W - inset - 0.05, D - inset, h]], '#6b4020');
    line(ctx, [0.1, D - inset + 0.07, h - 0.05], [W - inset, D - inset + 0.07, h - 0.05], '#4a2a14');
    line(ctx, [W - inset + 0.07, 0.3, h - 0.05], [W - inset + 0.07, D - inset, h - 0.05], '#3e2210');
    line(ctx, [0.1, D - inset, h * 0.45], [W - inset, D - inset, h * 0.45], '#5a3519');
    line(ctx, [W - inset, 0.3, h * 0.45], [W - inset, D - inset, h * 0.45], '#4d2c14');
    for (const [x, y] of posts) {
      box(ctx, x - 0.06, y - 0.06, x + 0.06, y + 0.06, 0, h + 0.08, '#a06a34', '#6b4020', '#55321a');
      dot(ctx, x, y, h + 0.14, '#ffd27a');
    }
  }

  // ------------------------------------------------------------------ seats
  // Seat sprites drawn relative to a seat centre; anchor (ax, ay) = seat floor point.
  function seatSprites() {
    const w = 30, h = 30, ax = 15, ay = 22;
    const cushion = makeCanvas(w, h), back = makeCanvas(w, h);
    const rel = (ctx, fn) => { ctx.save(); const o = P(0, 0, 0); ctx.translate(ax - o.x, ay - o.y); fn(ctx); ctx.restore(); };
    rel(cushion.ctx, (ctx) => {
      // base / legs
      box(ctx, -0.36, -0.2, 0.36, 0.25, 0, 0.26, '#2a1410', '#2a1410', '#1e0e0a');
      // cushion
      box(ctx, -0.4, -0.34, 0.4, 0.3, 0.26, 0.42, C.seat, C.seatDark, '#86161d');
      line(ctx, [-0.38, -0.32, 0.42], [0.38, -0.32, 0.42], C.seatHi);
      // armrests
      box(ctx, -0.52, -0.3, -0.42, 0.34, 0, 0.62, C.seatArmHi, C.seatArm, '#3a2112');
      box(ctx, 0.42, -0.3, 0.52, 0.34, 0, 0.62, C.seatArmHi, C.seatArm, '#3a2112');
    });
    rel(back.ctx, (ctx) => {
      box(ctx, -0.41, 0.3, 0.41, 0.44, 0.26, 1.08, C.seatHi, C.seat, C.seatDark);
      poly(ctx, [[-0.41, 0.44, 0.98], [0.41, 0.44, 0.98], [0.41, 0.44, 1.08], [-0.41, 0.44, 1.08]], '#d0484c');
      line(ctx, [-0.36, 0.44, 0.35], [0.36, 0.44, 0.35], C.seatDark);
      line(ctx, [0, 0.44, 0.4], [0, 0.44, 0.95], '#8a141c');
    });
    return { cushion: cushion.c, back: back.c, ax, ay };
  }

  // ------------------------------------------------------------------ assemble
  VC.buildScene = function () {
    const { VIEW_W: w, VIEW_H: h } = L;
    const bg = makeCanvas(w, h), fg = makeCanvas(w, h);
    const ctx = bg.ctx;

    backWall(ctx);
    leftWall(ctx);
    // back-wall decorations
    speaker(ctx, 0.25, 3.0);
    speaker(ctx, 16.85, 3.0);
    sconceBack(ctx, 0.62, 2.35);
    sconceBack(ctx, 17.15, 2.35);
    screen(ctx);
    curtain(ctx, 0.95, 2.35, 0.32, 4.35);
    curtain(ctx, 15.45, 16.75, 0.32, 4.35);
    valance(ctx);
    // left-wall decorations
    sconce(ctx, 2.2, 2.45);
    poster(ctx, 3.3, 4.7, 1.35, 3.25, { kind: 'mountain', sky: '#e58a4a', fg: '#4a2a4a' });
    sconce(ctx, 5.6, 2.45);
    poster(ctx, 6.5, 7.9, 1.35, 3.25, { kind: 'stars', sky: '#1d2a52' });
    sconce(ctx, 8.75, 2.45);
    poster(ctx, 9.4, 10.6, 1.6, 3.15, { kind: 'reel', sky: '#2f5d50', fg: '#e8d29a' });
    door(ctx);
    wallTops(ctx);
    floor(ctx);
    carpet(ctx);
    stage(ctx);
    aisleLights(ctx);
    // floor props, back to front
    plant(ctx, 0.42, 0.45, 1.0);
    plant(ctx, 17.15, 0.42, 1.0);
    popcornCounter(ctx);
    plant(ctx, 0.4, 11.1, 0.9);

    railings(fg.ctx);

    const seats = seatSprites();

    // Door clip polygon (screen space) for characters passing the doorway.
    const doorPoly = [[0, L.DOOR_Y0, 0], [0, L.DOOR_Y1, 0], [0, L.DOOR_Y1, L.DOOR_H], [0, L.DOOR_Y0, L.DOOR_H]].map((p) => P(p[0], p[1], p[2]));

    // Light sources for the animated glow pass.
    const lights = [
      { ...P(0.05, 2.2, 2.65), r: 26, col: '255,178,90', a: 0.32 },
      { ...P(0.05, 5.6, 2.65), r: 26, col: '255,178,90', a: 0.32 },
      { ...P(0.05, 8.75, 2.65), r: 26, col: '255,178,90', a: 0.32 },
      { ...P(0.62, 0.05, 2.55), r: 22, col: '255,178,90', a: 0.28 },
      { ...P(17.15, 0.05, 2.55), r: 22, col: '255,178,90', a: 0.28 },
      { ...P(0.3, L.doorY, 0.6), r: 30, col: '255,140,60', a: 0.22 },
      { ...P(0.35, 9.6, 1.4), r: 18, col: '255,210,120', a: 0.25 }
    ];
    const screenGlow = P((L.SCREEN_X0 + L.SCREEN_X1) / 2, 1.6, 0.2);

    return { bg: bg.c, fg: fg.c, seats, doorPoly, lights, screenGlow };
  };
})();
