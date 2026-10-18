/* Bundled illustrated layers, sampled once at native output resolution. */
(function () {
  'use strict';
  const VC = window.VC;
  const A = (VC.Art = { images: {}, ready: null, available: false });
  const sources = {
    room: 'assets/art/cinema-room.png',
    chair: 'assets/art/cinema-chair.png',
    viewers: 'assets/art/viewers.png',
    viewersExtra: 'assets/art/viewers-extra.png'
  };
  A.ready = Promise.all(
    Object.entries(sources).map(
      ([name, src]) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            A.images[name] = img;
            resolve();
          };
          img.onerror = () => reject(new Error('Cannot load artwork: ' + src));
          img.src = src;
        })
    )
  )
    .then(() => {
      A.available = true;
    })
    .catch((error) => {
      console.warn(error.message);
    });

  const crops = [
    [
      [172, 26, 147, 342],
      [455, 30, 161, 338],
      [758, 82, 207, 270]
    ],
    [
      [168, 375, 163, 352],
      [452, 379, 158, 348],
      [750, 434, 215, 270]
    ],
    [
      [171, 730, 156, 349],
      [448, 731, 169, 347],
      [766, 790, 205, 263]
    ],
    [
      [172, 1079, 159, 348],
      [447, 1079, 159, 343],
      [742, 1134, 235, 264]
    ]
  ];
  const extraCrops = [
    [
      [156, 21, 163, 361],
      [453, 17, 169, 364],
      [762, 77, 224, 286]
    ],
    [
      [152, 386, 181, 361],
      [444, 386, 178, 361],
      [749, 441, 245, 284]
    ],
    [
      [154, 747, 172, 359],
      [450, 747, 177, 359],
      [770, 814, 224, 270]
    ],
    [
      [157, 1106, 168, 339],
      [451, 1106, 171, 338],
      [770, 1159, 228, 270]
    ]
  ];
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  A.scene = function () {
    const L = VC.Layout,
      bg = canvas(1920, 1080),
      fg = canvas(1920, 1080),
      lintel = canvas(1920, 1080);
    const ctx = bg.getContext('2d'),
      front = fg.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'brightness(.9) saturate(.94)';
    // Preserve the original fine detail: no low-resolution intermediate canvas.
    ctx.drawImage(A.images.room, 24, 12, 1872, 1054);
    const F = L.artPoint;
    function polygon(context, points) {
      points.forEach(([x, y], i) => {
        const p = F(x, y);
        i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y);
      });
      context.closePath();
    }
    // Foreground facade, including its genuine door opening. Copy the painted
    // pixels after the actors so walkers pass behind the wall and through the door.
    front.save();
    front.scale(2, 2);
    front.filter = 'brightness(.9) saturate(.94)';
    front.beginPath();
    polygon(front, L.ART_GEOMETRY.facade);
    polygon(front, L.ART_GEOMETRY.opening);
    front.clip('evenodd');
    front.drawImage(A.images.room, 12, 6, 936, 527);
    front.restore();
    const header = lintel.getContext('2d');
    header.scale(2, 2);
    header.filter = 'brightness(.9) saturate(.94)';
    header.beginPath();
    polygon(header, L.ART_GEOMETRY.lintel);
    header.clip();
    header.drawImage(A.images.room, 12, 6, 936, 527);
    front.save();
    front.scale(2, 2);
    A.railings(front);
    front.restore();
    const lights = [
      [294, 405],
      [442, 294],
      [626, 200],
      [778, 113],
      [213, 545],
      [407, 652],
      [529, 315]
    ].map(([x, y]) => ({
      ...F(x, y),
      r: 14,
      col: '255,172,74',
      a: 0.035
    }));
    return {
      bg,
      fg,
      lintel,
      seats: A.seats(),
      lights,
      screenGlow: F(1190, 465),
      illustrated: true
    };
  };
  A.railings = function (ctx) {
    const L = VC.Layout,
      P = L.project;
    function shape(points, fill, stroke) {
      ctx.beginPath();
      points.forEach((p, i) => {
        const q = P(...p);
        i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
    function line(a, b, col, width = 0.6) {
      const p = P(...a),
        q = P(...b);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.strokeStyle = col;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    const posted = new Set();
    function post(x, y) {
      const key = x.toFixed(5) + ',' + y.toFixed(5);
      if (posted.has(key)) return;
      posted.add(key);
      const s = 0.1,
        h = 1.02;
      shape(
        [
          [x - s, y + s, 0],
          [x + s, y + s, 0],
          [x + s, y + s, h],
          [x - s, y + s, h]
        ],
        '#56311e',
        '#251922'
      );
      shape(
        [
          [x + s, y - s, 0],
          [x + s, y + s, 0],
          [x + s, y + s, h],
          [x + s, y - s, h]
        ],
        '#301c16',
        '#211820'
      );
      shape(
        [
          [x - s, y - s, h],
          [x + s, y - s, h],
          [x + s, y + s, h],
          [x - s, y + s, h]
        ],
        '#bd8240',
        '#6e4a32'
      );
      line([x - s, y + s, 0.08], [x - s, y + s, h - 0.06], '#8c4b24');
      const p = P(x, y, h + 0.02);
      ctx.fillStyle = '#ffe0a0';
      ctx.fillRect(p.x - 0.5, p.y - 0.6, 1, 1.2);
    }
    for (const [start, end, axis] of [
      [L.fromArt(...L.ART_GEOMETRY.railFront[0]), L.fromArt(...L.ART_GEOMETRY.railFront[1]), 0],
      [L.fromArt(...L.ART_GEOMETRY.railRight[0]), L.fromArt(...L.ART_GEOMETRY.railRight[1]), 1]
    ]) {
      const a = [start.x, start.y],
        b = [end.x, end.y];
      const normal = axis === 0 ? [0, 0.16] : [0.16, 0],
        h = 0.95;
      for (const z of [0.28, h]) {
        shape(
          [
            [a[0] - normal[0], a[1] - normal[1], z],
            [b[0] - normal[0], b[1] - normal[1], z],
            [b[0] + normal[0], b[1] + normal[1], z],
            [a[0] + normal[0], a[1] + normal[1], z]
          ],
          z === h ? '#79401e' : '#3a2117',
          '#251a21'
        );
        line([...a, z + 0.015], [...b, z + 0.015], z === h ? '#b56f33' : '#684021', 0.65);
      }
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const sections = Math.ceil(length / 1.65);
      for (let i = 0; i <= sections; i++)
        post(a[0] + ((b[0] - a[0]) * i) / sections, a[1] + ((b[1] - a[1]) * i) / sections);
    }
  };
  A.seats = function () {
    const back = canvas(100, 100),
      cushion = canvas(100, 100),
      ctx = back.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(A.images.chair, 2, 3, 96, 87.75);
    const shadow = cushion.getContext('2d');
    shadow.save();
    shadow.translate(62, 90);
    shadow.scale(1, 0.3);
    const glow = shadow.createRadialGradient(0, 0, 1, 0, 0, 31);
    glow.addColorStop(0, 'rgba(16,7,17,.6)');
    glow.addColorStop(1, 'rgba(16,7,17,0)');
    shadow.fillStyle = glow;
    shadow.fillRect(-31, -31, 62, 62);
    shadow.restore();
    return { cushion, back, ax: 31, ay: 46, w: 50, h: 50 };
  };
  A.sprites = function (appearance) {
    const hash = VC.hash(appearance.hair + appearance.shirt + appearance.hairStyle);
    const row = hash % 4,
      atlasCrops = (hash >>> 2) % 2 ? extraCrops : crops,
      atlas = (hash >>> 2) % 2 ? A.images.viewersExtra : A.images.viewers,
      scale = 116 / atlasCrops[row][0][3];
    function pose(col, frame = 0) {
      const c = canvas(80, 128),
        ctx = c.getContext('2d');
      const [x, y, w, h] = atlasCrops[row][col];
      const dw = w * scale,
        dh = h * scale,
        bob = frame ? [0, -1, 0, 1][frame - 1] : 0;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(atlas, x, y, w, h, (80 - dw) / 2, 124 - dh + bob, dw, dh);
      if (col < 2 && (frame === 2 || frame === 3)) {
        // Exchange the stride under the jacket while retaining the painted head/torso.
        ctx.save();
        ctx.translate(80, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(c, 0, 92, 80, 36, 0, 92, 80, 36);
        ctx.restore();
      }
      // Stable, restrained wardrobe variations; face and hair retain their artwork.
      const hue = [-18, 0, 18, 36][(hash >>> 4) % 4];
      if (hue) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 54, 80, 42);
        ctx.clip();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.filter = `hue-rotate(${hue}deg)`;
        ctx.drawImage(c, 0, 0);
        ctx.restore();
      }
      return c;
    }
    return {
      front: [0, 1, 2, 3, 4].map((f) => pose(0, f)),
      back: [0, 1, 2, 3, 4].map((f) => pose(1, f)),
      sit: pose(2),
      w: 40,
      h: 64,
      footY: 62,
      sitFootY: 62,
      scale: 1,
      seatOffset: 16,
      seatShift: 8,
      generated: true
    };
  };
})();
