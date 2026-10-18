/* Independent wall art and fitted marquee lettering, cached at scene creation. */
(function () {
  'use strict';
  const VC = window.VC;
  const D = (VC.Decor = {});
  // Corners in the original 1672×941 artwork: top-left, top-right, bottom-left.
  // The frames remain part of each object, rather than part of the room.
  D.slots = [
    { id: 'sunset', corners: [[253, 342], [291, 324], [253, 450]] },
    { id: 'small', corners: [[302, 342], [331, 328], [302, 389]] },
    { id: 'goodVibes', corners: [[344, 300], [413, 267], [344, 396]] },
    { id: 'mountains', corners: [[662, 158], [733, 123], [662, 264]] },
    { id: 'space', corners: [[755, 155], [819, 124], [755, 258]] }
  ];
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
        // The narrow sunset frame must not stretch a standard poster texture.
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
    ctx.transform(94 / 640, 53 / 640, 0, 24 / 160, 262, 486);
    ctx.drawImage(sign.image, 0, 0);
    ctx.restore();
  };
})();
