/*
 * Procedural pixel-art characters.
 * Appearance is derived from a hash of the login, so a viewer always looks the same.
 * Each character is rendered once into a handful of tiny frame canvases.
 */
(function () {
  'use strict';
  const VC = window.VC;

  const SKIN = ['#f6d2b8', '#f0c09a', '#e3a97f', '#d29468', '#b97a4e', '#9a6038', '#7a4a2a', '#5c3820'];
  const HAIR = ['#1d1515', '#2e1f17', '#4a2c1a', '#6b3f22', '#a0592b', '#c98a3c', '#e6c36a', '#d9d4cc',
    '#8a8f99', '#c2493f', '#e07aa8', '#7a4fc9', '#3f7fd6', '#3aa489', '#1f2a48', '#f2f0ea'];
  const SHIRT = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#3b5bdb', '#8e44ad',
    '#d35486', '#ecf0f1', '#34495e', '#7f8c8d', '#6d4c41', '#00a8a8', '#b33771', '#f78fb3', '#546de5', '#2d3436'];
  const PANTS = ['#2d3a6b', '#3b4f8a', '#1e1e24', '#4b4b55', '#7a6248', '#5a3f2b', '#2f4f3f', '#6b6f78'];
  const SHOES = ['#1a1414', '#ece8e1', '#7a2a1f', '#3d2b1f', '#2a3550'];
  const HATCOL = ['#c0392b', '#2c3e50', '#27ae60', '#e1b12c', '#6c4a2b', '#2f80ed', '#111111', '#8e44ad'];
  const HAIRSTYLES = ['short', 'short', 'spiky', 'long', 'bob', 'ponytail', 'bun', 'curly', 'mohawk', 'buzz', 'side', 'long'];
  const OUTFITS = ['plain', 'plain', 'hoodie', 'jacket', 'stripes', 'vest'];
  const HATS = ['none', 'none', 'none', 'none', 'none', 'cap', 'beanie', 'fedora'];

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

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
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
  }
  VC.shade = shade;

  // ------------------------------------------------------------------ pixel grid
  const W = 14, H = 24;          // frame size incl. 1px outline margin; feet at y = 22
  function grid() { return Array.from({ length: H }, () => new Array(W).fill(null)); }
  function set(g, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H && c) g[y][x] = c; }
  function rect(g, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(g, x + i, y + j, c); }

  function toCanvas(g) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    // Outline: dark pixel around every opaque pixel.
    const out = '#160c0c';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[y][x]) continue;
      if ((g[y - 1] && g[y - 1][x]) || (g[y + 1] && g[y + 1][x]) || g[y][x - 1] || g[y][x + 1]) {
        ctx.fillStyle = out; ctx.fillRect(x, y, 1, 1);
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[y][x]) { ctx.fillStyle = g[y][x]; ctx.fillRect(x, y, 1, 1); }
    }
    return cv;
  }

  // Head box: x 4..9, y 3..9  (6×7). Body x 4..9, y 10..15. Legs y 16..20, shoes y 21. (+1 margin)
  const HX = 4, HY = 3;

  function drawHair(g, a, view) {
    const h = a.hair, hl = shade(a.hair, 0.22), dk = shade(a.hair, -0.25);
    const st = a.hairStyle;
    const back = view === 'back';
    // base cap of hair on top of head
    if (st !== 'buzz') { rect(g, HX, HY - 1, 6, 2, h); set(g, HX + 1, HY - 1, hl); set(g, HX + 2, HY - 1, hl); }
    else rect(g, HX, HY, 6, 1, dk);
    switch (st) {
      case 'short':
        if (back) rect(g, HX, HY + 1, 6, 4, h);
        else { set(g, HX, HY + 1, h); set(g, HX + 5, HY + 1, h); set(g, HX, HY + 2, dk); set(g, HX + 5, HY + 2, dk); }
        break;
      case 'spiky':
        set(g, HX, HY - 2, h); set(g, HX + 2, HY - 2, h); set(g, HX + 4, HY - 2, h); set(g, HX + 5, HY - 2, hl);
        if (back) rect(g, HX, HY + 1, 6, 4, h); else { set(g, HX, HY + 1, h); set(g, HX + 5, HY + 1, h); set(g, HX + 2, HY + 1, h); }
        break;
      case 'long':
        rect(g, HX - 1, HY, 1, 8, h); rect(g, HX + 6, HY, 1, 8, h);
        if (back) rect(g, HX, HY + 1, 6, 8, h); else { set(g, HX, HY + 1, h); set(g, HX + 5, HY + 1, h); set(g, HX, HY + 2, dk); set(g, HX + 5, HY + 2, dk); }
        set(g, HX - 1, HY + 7, dk); set(g, HX + 6, HY + 7, dk);
        break;
      case 'bob':
        rect(g, HX - 1, HY, 1, 6, h); rect(g, HX + 6, HY, 1, 6, h);
        if (back) rect(g, HX, HY + 1, 6, 5, h); else rect(g, HX, HY + 1, 6, 1, h);
        break;
      case 'ponytail':
        if (back) { rect(g, HX, HY + 1, 6, 4, h); rect(g, HX + 2, HY + 5, 2, 4, dk); }
        else { set(g, HX, HY + 1, h); set(g, HX + 5, HY + 1, h); rect(g, HX + 6, HY + 2, 1, 5, h); }
        break;
      case 'bun':
        rect(g, HX + 2, HY - 3, 2, 2, h); set(g, HX + 2, HY - 3, hl);
        if (back) rect(g, HX, HY + 1, 6, 4, h); else { set(g, HX, HY + 1, h); set(g, HX + 5, HY + 1, h); }
        break;
      case 'curly':
        rect(g, HX - 1, HY - 2, 8, 3, h); set(g, HX, HY - 2, hl); set(g, HX + 3, HY - 2, hl); set(g, HX + 5, HY - 1, hl);
        rect(g, HX - 1, HY + 1, 1, 4, h); rect(g, HX + 6, HY + 1, 1, 4, h);
        if (back) rect(g, HX, HY + 1, 6, 5, h);
        break;
      case 'mohawk':
        rect(g, HX + 2, HY - 3, 2, 3, h); set(g, HX + 2, HY - 3, hl);
        rect(g, HX, HY - 1, 6, 1, dk);
        if (back) rect(g, HX + 2, HY, 2, 4, h);
        break;
      case 'side':
        rect(g, HX, HY + 1, 4, 1, h); set(g, HX, HY + 2, h);
        set(g, HX + 5, HY + 1, h);
        if (back) rect(g, HX, HY + 1, 6, 4, h);
        break;
      case 'buzz':
        if (back) rect(g, HX, HY + 1, 6, 3, dk);
        break;
    }
  }

  function drawHat(g, a, view) {
    const c = a.hatColor, d = shade(c, -0.3), l = shade(c, 0.2);
    if (a.hat === 'cap') {
      rect(g, HX, HY - 1, 6, 2, c); set(g, HX + 1, HY - 1, l);
      if (view === 'front') rect(g, HX - 1, HY + 1, 4, 1, d); else rect(g, HX + 3, HY + 1, 4, 1, d);
    } else if (a.hat === 'beanie') {
      rect(g, HX, HY - 2, 6, 3, c); rect(g, HX - 0, HY + 1, 6, 1, d); set(g, HX + 2, HY - 3, l); set(g, HX + 3, HY - 3, l);
    } else if (a.hat === 'fedora') {
      rect(g, HX - 1, HY, 8, 1, d); rect(g, HX, HY - 2, 6, 2, c); rect(g, HX, HY - 1, 6, 1, shade(c, -0.5));
    }
  }

  function drawBody(g, a, view, pose, frame) {
    const skin = a.skin, sd = shade(skin, -0.15);
    const sh = a.shirt, shD = shade(sh, -0.25), shL = shade(sh, 0.15);
    const back = view === 'back';
    // head
    rect(g, HX, HY, 6, 7, skin); rect(g, HX, HY + 6, 6, 1, sd);
    if (!back) {
      // face looks slightly left (3/4 view); mirrored for the other side when drawn
      set(g, HX + 1, HY + 3, '#1b1212'); set(g, HX + 4, HY + 3, '#1b1212');
      if (a.blush) { set(g, HX, HY + 4, '#e58a8a'); set(g, HX + 5, HY + 4, '#e58a8a'); }
      set(g, HX + 2, HY + 5, shade(skin, -0.3));
      if (a.glasses) { rect(g, HX, HY + 3, 6, 1, '#2b2b33'); set(g, HX + 1, HY + 3, '#9fd3ff'); set(g, HX + 4, HY + 3, '#9fd3ff'); }
    } else {
      set(g, HX - 1, HY + 3, sd); set(g, HX + 6, HY + 3, sd); // ears
    }
    drawHair(g, a, view);
    if (a.hat !== 'none') drawHat(g, a, view);

    // torso
    const ty = 10;
    rect(g, 4, ty, 6, 6, sh); rect(g, 4, ty, 1, 6, shD); set(g, 8, ty, shL);
    if (a.outfit === 'stripes') { rect(g, 4, ty + 1, 6, 1, a.accent); rect(g, 4, ty + 3, 6, 1, a.accent); rect(g, 4, ty + 5, 6, 1, a.accent); }
    if (a.outfit === 'jacket' && !back) { rect(g, 6, ty, 2, 6, a.accent); }
    if (a.outfit === 'vest' && !back) { rect(g, 4, ty + 1, 2, 5, a.accent); rect(g, 8, ty + 1, 2, 5, a.accent); }
    if (a.outfit === 'hoodie') { if (back) rect(g, 5, ty, 4, 2, shD); else { set(g, 6, ty + 1, '#eeeeee'); set(g, 7, ty + 2, '#eeeeee'); } }
    if (!back) set(g, 6, ty, sd); // neckline

    // arms (swing while walking)
    const swing = pose === 'walk' ? [0, 1, 0, -1][frame] : 0;
    if (pose === 'sit') {
      rect(g, 3, ty + 1, 1, 4, shD); rect(g, 10, ty + 1, 1, 4, shD);
      set(g, 3, ty + 5, skin); set(g, 10, ty + 5, skin);
      if (a.popcorn) { rect(g, 10, ty + 2, 2, 3, '#e8e0d0'); set(g, 10, ty + 2, '#c0392b'); set(g, 11, ty + 1, '#ffe08a'); set(g, 10, ty + 1, '#fff2c0'); }
    } else {
      rect(g, 3, ty + 1 + Math.max(0, swing), 1, 4, shD); set(g, 3, ty + 5 + Math.max(0, swing), skin);
      rect(g, 10, ty + 1 + Math.max(0, -swing), 1, 4, shD); set(g, 10, ty + 5 + Math.max(0, -swing), skin);
    }

    // legs
    const p = a.pants, pd = shade(p, -0.25), shoe = a.shoes;
    if (pose === 'sit') {
      rect(g, 4, 16, 6, 2, p); rect(g, 4, 16, 6, 1, pd);
    } else {
      const lift = pose === 'walk' ? [[0, 0], [1, 0], [0, 0], [0, 1]][frame] : [0, 0];
      rect(g, 5, 16, 2, 5 - lift[0], p); rect(g, 7, 16, 2, 5 - lift[1], pd);
      rect(g, 5, 21 - lift[0], 2, 1, shoe); rect(g, 7, 21 - lift[1], 2, 1, shoe);
      if (!back) { set(g, 4, 21 - lift[0], shoe); set(g, 9, 21 - lift[1], shoe); }
    }
  }

  function frame(a, view, pose, f) {
    const g = grid();
    drawBody(g, a, view, pose, f || 0);
    return toCanvas(g);
  }

  /** Builds { front:[idle,w0..w3], back:[idle,w0..w3], sit } frame canvases. */
  VC.buildSprites = function (a) {
    return {
      front: [frame(a, 'front', 'idle'), frame(a, 'front', 'walk', 0), frame(a, 'front', 'walk', 1), frame(a, 'front', 'walk', 2), frame(a, 'front', 'walk', 3)],
      back: [frame(a, 'back', 'idle'), frame(a, 'back', 'walk', 0), frame(a, 'back', 'walk', 1), frame(a, 'back', 'walk', 2), frame(a, 'back', 'walk', 3)],
      sit: frame(a, 'back', 'sit'),
      w: W, h: H, footY: 22
    };
  };
})();
