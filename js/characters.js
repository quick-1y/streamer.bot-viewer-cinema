/*
 * Procedural pixel-art characters.
 * Appearance is derived from a hash of the login, so a viewer always looks the same.
 * Each character is rendered once into a handful of tiny frame canvases.
 */
(function () {
  'use strict';
  const VC = window.VC;

  const SKIN = [
    '#f6d2b8',
    '#f0c09a',
    '#e3a97f',
    '#d29468',
    '#b97a4e',
    '#9a6038',
    '#7a4a2a',
    '#5c3820'
  ];
  const HAIR = [
    '#1d1515',
    '#2e1f17',
    '#4a2c1a',
    '#6b3f22',
    '#a0592b',
    '#c98a3c',
    '#e6c36a',
    '#d9d4cc',
    '#8a8f99',
    '#c2493f',
    '#e07aa8',
    '#7a4fc9',
    '#3f7fd6',
    '#3aa489',
    '#1f2a48',
    '#f2f0ea'
  ];
  const SHIRT = [
    '#c0392b',
    '#e67e22',
    '#f1c40f',
    '#27ae60',
    '#16a085',
    '#2980b9',
    '#3b5bdb',
    '#8e44ad',
    '#d35486',
    '#ecf0f1',
    '#34495e',
    '#7f8c8d',
    '#6d4c41',
    '#00a8a8',
    '#b33771',
    '#f78fb3',
    '#546de5',
    '#2d3436'
  ];
  const PANTS = [
    '#2d3a6b',
    '#3b4f8a',
    '#1e1e24',
    '#4b4b55',
    '#7a6248',
    '#5a3f2b',
    '#2f4f3f',
    '#6b6f78'
  ];
  const SHOES = ['#1a1414', '#ece8e1', '#7a2a1f', '#3d2b1f', '#2a3550'];
  const HATCOL = [
    '#c0392b',
    '#2c3e50',
    '#27ae60',
    '#e1b12c',
    '#6c4a2b',
    '#2f80ed',
    '#111111',
    '#8e44ad'
  ];
  const HAIRSTYLES = [
    'short',
    'short',
    'spiky',
    'long',
    'bob',
    'ponytail',
    'bun',
    'curly',
    'mohawk',
    'buzz',
    'side',
    'long'
  ];
  const OUTFITS = ['plain', 'plain', 'hoodie', 'jacket', 'stripes', 'vest'];
  const HATS = ['none', 'none', 'none', 'none', 'none', 'cap', 'beanie', 'fedora'];

  function pick(r, arr) {
    return arr[Math.floor(r() * arr.length)];
  }

  VC.makeAppearance = function (key) {
    const r = VC.rng(VC.hash(key));
    const shirt = pick(r, SHIRT);
    let pants = pick(r, PANTS);
    if (pants === shirt) pants = PANTS[0];
    const hairStyle = pick(r, HAIRSTYLES);
    return {
      skin: pick(r, SKIN),
      hair: pick(r, HAIR),
      hairStyle,
      shirt,
      accent: pick(r, SHIRT),
      outfit: pick(r, OUTFITS),
      pants,
      shoes: pick(r, SHOES),
      hat: hairStyle === 'mohawk' ? 'none' : pick(r, HATS),
      hatColor: pick(r, HATCOL),
      glasses: r() < 0.18,
      popcorn: r() < 0.3,
      blush: r() < 0.35
    };
  };

  // ------------------------------------------------------------------ colour helpers
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    if (amt < 0) {
      r *= 1 + amt;
      g *= 1 + amt;
      b *= 1 + amt;
    } else {
      r += (255 - r) * amt;
      g += (255 - g) * amt;
      b += (255 - b) * amt;
    }
    return (
      '#' +
      ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b))
        .toString(16)
        .slice(1)
    );
  }
  VC.shade = shade;

  // Each frame is a tiny hand-shaped pixel grid; palettes remain login-derived.
  const W = 22,
    H = 34;
  function grid() {
    return Array.from({ length: H }, () => new Array(W).fill(null));
  }
  function set(g, x, y, c) {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c;
  }
  function rect(g, x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(g, x + i, y + j, c);
  }
  function frame(a, view, pose, f = 0) {
    const g = grid(),
      sit = pose === 'sit',
      back = view === 'back',
      shift = sit ? -2 : 0;
    const skin = a.skin,
      sd = shade(skin, -0.22),
      sl = shade(skin, 0.12);
    const hair = a.hair,
      hd = shade(hair, -0.28),
      hl = shade(hair, 0.23);
    const shirt = a.shirt,
      shd = shade(shirt, -0.3),
      shl = shade(shirt, 0.15);
    const sy = (y) => y + shift;
    // Softly rounded head silhouette, with a cheek on the camera-facing side.
    rect(g, 7, sy(5), 8, 10, skin);
    rect(g, 5, sy(7), 12, 6, skin);
    rect(g, 7, sy(14), 7, 1, sd);
    rect(g, 5, sy(9), 2, 4, sl);
    rect(g, 14, sy(8), 3, 6, sd);
    if (back) {
      rect(g, 5, sy(8), 4, 6, skin);
      set(g, 4, sy(11), skin);
      set(g, 5, sy(10), '#291d25');
      set(g, 5, sy(13), sd);
      rect(g, 9, sy(11), 2, 3, sl);
      set(g, 9, sy(12), sd);
    } else {
      rect(g, 6, sy(10), 2, 2, '#211a27');
      rect(g, 12, sy(10), 2, 2, '#211a27');
      set(g, 6, sy(10), '#ece5cc');
      set(g, 12, sy(10), '#ece5cc');
      set(g, 9, sy(12), sd);
      rect(g, 8, sy(14), 3, 1, shade(skin, -0.35));
      if (a.blush) {
        set(g, 6, sy(12), '#d7827d');
        set(g, 13, sy(12), '#d7827d');
      }
    }
    // Hair is sculpted in clusters, rather than a rectangular cap.
    rect(g, 8, sy(3), 6, 1, hair);
    rect(g, 6, sy(4), 10, 2, hair);
    rect(g, 5, sy(6), 12, 3, hair);
    rect(g, 14, sy(8), 3, 5, hd);
    rect(g, 7, sy(4), 5, 1, hl);
    rect(g, 6, sy(5), 3, 1, hl);
    rect(g, 6, sy(7), 2, 3, hair);
    rect(g, 9, sy(7), 2, 2, hair);
    rect(g, 12, sy(6), 2, 4, hd);
    rect(g, 15, sy(6), 1, 4, hl);
    if (back) {
      rect(g, 9, sy(7), 7, 5, hair);
      rect(g, 12, sy(11), 4, 3, hd);
      rect(g, 10, sy(8), 1, 3, hl);
      rect(g, 13, sy(7), 1, 3, hl);
      set(g, 11, sy(12), hd);
      set(g, 15, sy(12), hair);
    }
    if (a.hairStyle === 'long' || a.hairStyle === 'ponytail' || a.hairStyle === 'bob') {
      rect(g, 15, sy(9), 3, a.hairStyle === 'bob' ? 7 : 11, hd);
      rect(g, 16, sy(9), 1, 7, hair);
      rect(g, 5, sy(8), 1, 6, hair);
    }
    if (a.hairStyle === 'spiky' || a.hairStyle === 'curly') {
      for (const [x, y] of [
        [6, 3],
        [9, 2],
        [12, 2],
        [15, 4]
      ]) {
        rect(g, x, sy(y), 2, 2, hair);
        set(g, x, sy(y), hl);
      }
    }
    if (a.hairStyle === 'bun') {
      rect(g, 13, sy(1), 3, 3, hair);
      set(g, 13, sy(1), hl);
    }
    if (a.hairStyle === 'mohawk') {
      rect(g, 10, sy(0), 3, 5, hair);
      rect(g, 10, sy(0), 1, 3, hl);
    }
    if (a.hairStyle === 'buzz') {
      rect(g, 6, sy(5), 10, 3, hd);
      rect(g, 7, sy(4), 8, 1, hair);
      rect(g, 6, sy(6), 3, 1, hair);
      rect(g, 10, sy(5), 4, 1, hair);
    }
    if (a.hat !== 'none') {
      const c = a.hatColor,
        d = shade(c, -0.3),
        l = shade(c, 0.22);
      rect(g, 6, sy(4), 10, 3, c);
      rect(g, 8, sy(3), 6, 1, c);
      rect(g, 6, sy(7), 11, 2, d);
      rect(g, 7, sy(4), 5, 1, l);
      if (a.hat === 'cap') rect(g, back ? 3 : 4, sy(8), 7, 1, c);
      if (a.hat === 'fedora') {
        rect(g, 4, sy(7), 15, 2, d);
        rect(g, 7, sy(2), 8, 2, c);
        rect(g, 6, sy(6), 10, 1, '#33232a');
      }
      if (a.hat === 'beanie') {
        rect(g, 9, sy(1), 3, 2, l);
        rect(g, 6, sy(8), 11, 1, c);
      }
    }
    if (a.glasses) {
      if (back) {
        rect(g, 4, sy(10), 4, 1, '#303041');
        set(g, 5, sy(10), '#a8c1d0');
      } else {
        rect(g, 5, sy(10), 10, 1, '#303041');
        rect(g, 5, sy(11), 3, 1, '#738995');
        rect(g, 12, sy(11), 3, 1, '#738995');
      }
    }
    const ty = sy(16);
    rect(g, 7, ty, 8, 8, shirt);
    rect(g, 6, ty + 1, 10, 5, shirt);
    rect(g, 13, ty + 1, 3, 7, shd);
    rect(g, 7, ty + 1, 2, 5, shl);
    rect(g, 8, ty - 1, 5, 1, sd);
    rect(g, 7, ty + 7, 8, 1, shd);
    if (a.outfit === 'hoodie') {
      rect(g, 9, ty, 5, 2, shd);
      rect(g, 10, ty, 3, 1, shade(shirt, 0.08));
    }
    if (a.outfit === 'stripes') for (const y of [2, 5]) rect(g, 7, ty + y, 7, 1, a.accent);
    if (a.outfit === 'jacket' || a.outfit === 'vest') {
      rect(g, 10, ty + 1, 2, 6, a.accent);
      rect(g, 12, ty + 1, 1, 6, shade(shirt, -0.4));
    }
    const swing = pose === 'walk' ? [0, 1, 0, -1][f] : 0;
    rect(g, 5, ty + 2, 2, 4, shd);
    rect(g, 15, ty + 2, 2, 4, shd);
    if (sit) {
      rect(g, 4, ty + 4, 3, 3, shirt);
      rect(g, 3, ty + 6, 3, 2, skin);
      set(g, 3, ty + 6, sl);
      rect(g, 14, ty + 6, 3, 2, skin);
      rect(g, 6, ty + 8, 10, 3, a.pants);
      rect(g, 6, ty + 8, 9, 1, shade(a.pants, 0.15));
      rect(g, 5, ty + 10, 3, 3, a.pants);
      rect(g, 12, ty + 10, 3, 3, shade(a.pants, -0.2));
      rect(g, 4, ty + 12, 4, 2, a.shoes);
      rect(g, 11, ty + 12, 4, 2, a.shoes);
      if (a.popcorn) {
        rect(g, 3, ty + 4, 3, 4, '#e9d1ae');
        rect(g, 3, ty + 4, 1, 4, '#b8483c');
        rect(g, 2, ty + 3, 5, 1, '#ffde85');
        set(g, 3, ty + 2, '#fff0ba');
        set(g, 5, ty + 2, '#fff0ba');
      }
    } else {
      rect(g, 5, ty + 6 + Math.max(0, swing), 2, 2, skin);
      rect(g, 15, ty + 6 + Math.max(0, -swing), 2, 2, sd);
      const lift =
        pose === 'walk'
          ? [
              [0, 0],
              [2, 0],
              [0, 0],
              [0, 2]
            ][f]
          : [0, 0];
      rect(g, 7, 24, 3, 6 - lift[0], a.pants);
      rect(g, 11, 24, 3, 6 - lift[1], shade(a.pants, -0.23));
      rect(g, 7, 24, 1, 4, shade(a.pants, 0.1));
      rect(g, 6, 30 - lift[0], 4, 2, a.shoes);
      rect(g, 10, 30 - lift[1], 4, 2, a.shoes);
      set(g, 6, 30 - lift[0], shade(a.shoes, 0.2));
      set(g, 10, 30 - lift[1], shade(a.shoes, 0.2));
    }
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (g[y][x]) continue;
        if ((g[y - 1] && g[y - 1][x]) || (g[y + 1] && g[y + 1][x]) || g[y][x - 1] || g[y][x + 1]) {
          ctx.fillStyle = '#191420';
          ctx.fillRect(x, y, 1, 1);
        }
      }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (g[y][x]) {
          ctx.fillStyle = g[y][x];
          ctx.fillRect(x, y, 1, 1);
        }
    return cv;
  }
  VC.buildSprites = function (a) {
    const frames = (view) => [
      frame(a, view, 'idle'),
      ...[0, 1, 2, 3].map((f) => frame(a, view, 'walk', f))
    ];
    return {
      front: frames('front'),
      back: frames('back'),
      sit: frame(a, 'back', 'sit'),
      w: W,
      h: H,
      footY: 32,
      sitFootY: 28
    };
  };
})();
