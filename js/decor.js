/* Independent wall art and fitted marquee lettering, cached at scene creation. */
(function () {
  'use strict';
  const VC = window.VC;
  const D = (VC.Decor = {});
  // Corners in the original 1672×941 artwork: top-left, top-right, bottom-left.
  // The frames remain part of each object, rather than part of the room.
  D.slots = [
    { id: 'poster1', corners: [[237, 355], [276, 336], [237, 456]] },
    { id: 'poster2', corners: [[290, 347], [319, 333], [290, 397]] },
    { id: 'poster3', corners: [[328, 309], [401, 274], [328, 404]] },
    { id: 'poster4', corners: [[652, 162], [724, 127], [652, 268]] },
    { id: 'poster5', corners: [[750, 163], [815, 131], [750, 246]] }
  ];
  function quad([a, b, d], padding = 0) {
    const at = (u, v) => [0, 1].map(k => a[k] + u * (b[k] - a[k]) + v * (d[k] - a[k]));
    return [[-padding, -padding], [1 + padding, -padding],
      [1 + padding, 1 + padding], [-padding, 1 + padding]].map(p => at(...p));
  }
  // Room-space bounds and horizontal offsets in decor-clean-atlas.png.
  const cleanPatches = [
    {x:233,y:329,w:47,h:134,sx:0},
    {x:286,y:328,w:37,h:74,sx:47},
    {x:323,y:267,w:83,h:144,sx:84},
    {x:647,y:120,w:82,h:155,sx:167},
    {x:745,y:124,w:75,h:129,sx:249},
    {x:241,y:484,w:110,h:96,sx:324}
  ];
  D.cleanRoom = function (ctx, clean) {
    const patches = D.slots.map(s => quad(s.corners, .035));
    patches.push(quad([[243, 486], [349, 546], [243, 518]]));
    // Replace only decoration footprints; preserve the hand-calibrated room,
    // floor, walls, door, lamps and silhouette pixel for pixel everywhere else.
    for (const [index, points] of patches.entries()) {
      const {x,y,w,h,sx} = cleanPatches[index];
      ctx.save();
      ctx.beginPath();
      points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(clean, sx, 0, w, h, x, y, w, h);
      ctx.restore();
    }
  };
  const replacements = new Map();
  D.ready = async function (config = {}) {
    replacements.clear();
    await Promise.all(D.slots.map(async ({ id }) => {
      const src = config && config[id];
      if (typeof src !== 'string' || !src.trim()) return;
      const image = new Image();
      try {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = src;
        });
        replacements.set(id, image);
      } catch (_) {
        console.warn('Cannot load poster ' + id + ': ' + src + '; using bundled artwork');
      }
    }));
  };

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  D.posters = function (atlas, config = {}) {
    return D.slots.filter(({ id }) => !config || config[id] !== null).map(({ id, corners }) => {
      const [a, b, d] = corners;
      const c = [b[0] + d[0] - a[0], b[1] + d[1] - a[1]];
      const points = [a, b, c, d];
      const x = Math.floor(Math.min(...points.map(p => p[0])) - 2);
      const y = Math.floor(Math.min(...points.map(p => p[1])) - 2);
      const w = Math.ceil(Math.max(...points.map(p => p[0])) - x + 2);
      const h = Math.ceil(Math.max(...points.map(p => p[1])) - y + 2);
      const image = canvas(w, h), ctx = image.getContext('2d');
      ctx.filter = 'brightness(.9) saturate(.94)';
      ctx.translate(-x, -y);
      ctx.beginPath();
      points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(atlas, 0, 0);
      const replacement = replacements.get(id);
      if (replacement) {
        // Derive each frame's aspect ratio before applying the wall shear.
        // The narrow poster1 frame must not stretch a standard poster texture.
        const height = 240 * (d[1] - a[1]) / (b[0] - a[0]);
        ctx.transform((b[0] - a[0]) / 240, (b[1] - a[1]) / 240,
          (d[0] - a[0]) / height, (d[1] - a[1]) / height, ...a);
        // Keep the original frame. Crop the replacement centrally, without distortion.
        const iw = 204, ih = height * 316 / 360;
        const scale = Math.max(iw / replacement.width, ih / replacement.height);
        const sw = iw / scale, sh = ih / scale;
        ctx.drawImage(replacement, (replacement.width - sw) / 2, (replacement.height - sh) / 2,
          sw, sh, 18, height * 22 / 360, iw, ih);
      }
      return { id, image, x: 12 + x * 936 / 1672, y: 6 + y * 527 / 941,
        w: w * 936 / 1672, h: h * 527 / 941 };
    });
  };

  D.sign = function (value) {
    const text = String(value ?? 'CINEMA').replace(/\s+/gu, ' ').trim();
    const image = canvas(640, 160), ctx = image.getContext('2d');
    ctx.font = '700 120px "Pixelify Sans", "Trebuchet MS", sans-serif';
    const metrics = ctx.measureText(text);
    const left = metrics.actualBoundingBoxLeft || 0;
    const right = metrics.actualBoundingBoxRight || metrics.width;
    const ascent = metrics.actualBoundingBoxAscent || 90;
    const descent = metrics.actualBoundingBoxDescent || 0;
    const width = Math.max(metrics.width, left + right, 1);
    const height = Math.max(ascent + descent, 1);
    const scale = Math.min(592 / width, 128 / height);
    ctx.translate(image.width / 2, image.height / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffe7a4';
    ctx.shadowColor = '#ffad48';
    ctx.shadowBlur = 4;
    ctx.fillText(text, (left - right) / 2, (ascent - descent) / 2);
    return { text, image, scale, width: width * scale, height: height * scale };
  };
  // Draw within the painted lightbox; the affine transform follows its facade.
  D.drawSign = function (ctx, sign) {
    ctx.save();
    ctx.transform(98 / 640, 55.5 / 640, 0, 24 / 160, 247, 490);
    ctx.drawImage(sign.image, 0, 0);
    ctx.restore();
  };
})();
