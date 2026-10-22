/* Bundled illustrated layers, sampled once at native output resolution. */
(function () {
  'use strict';
  const VC = window.VC;
  const A = (VC.Art = { images: {}, ready: null, error: null });
  const sources = {
    alignedRoom: 'assets/art/cinema-room-aligned.png',
    rug1: 'assets/art/rug-1.png',
    rug2: 'assets/art/rug-2.png',
    chair: 'assets/art/cinema-chair.png',
    viewers: 'assets/art/viewers.png',
    viewersExtra: 'assets/art/viewers-extra.png',
    viewersDiverse: 'assets/art/viewers-diverse.png'
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
    .catch((error) => { A.error = error; });

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
  const diverseCrops = [
    [[142, 27, 149, 361], [440, 31, 150, 354], [746, 84, 224, 276]],
    [[134, 398, 161, 363], [431, 397, 164, 362], [752, 451, 236, 281]],
    [[135, 766, 158, 366], [438, 768, 157, 359], [768, 820, 221, 287]],
    [[128, 1134, 165, 373], [435, 1133, 168, 371], [757, 1184, 244, 292]]
  ];
  // Leg geometry per atlas row in pose-canvas pixels: front/back splits between
  // the feet. Older back poses reuse mirrored front legs. Measured offline:
  // reading pixels back is forbidden when the overlay runs from file:// (OBS).
  const legs = [41, 40, 40, 40].map(split => [split, 80 - split]);
  const extraLegs = [43, 41, 43, 42].map(split => [split, 80 - split]);
  const diverseLegs = [[40, 40], [40, 40], [40, 40], [40, 40]];
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  // Rectangular, top-down textures; each is projected onto its own floor rectangle.
  let rugImages = [];
  A.configureRugs = async function (config = {}) {
    rugImages = await Promise.all(['rug1', 'rug2'].map(async id => {
      const src = config && config[id];
      if (src === null) return null;
      const fallback = A.images[id];
      if (typeof src !== 'string' || !src.trim() || src === sources[id]) return fallback;
      const image = new Image();
      try {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = src;
        });
        return image;
      } catch (_) {
        console.warn('Cannot load rug ' + id + ': ' + src + '; using bundled artwork');
        return fallback;
      }
    }));
  };
  // The deterministic mesh is baked into this bundled layer. No pixel readback
  // or filesystem fetch is needed when OBS opens the overlay as a local file.
  A.room = function () {
    const room=canvas(1672,941);
    room.getContext('2d').drawImage(A.images.alignedRoom,0,0);
    return room;
  };
  A.rugs = function (ctx) {
    ctx.save(); ctx.translate(24,12); ctx.scale(1872/1672,1054/941);
    // The floor map is projective, so each rug is sampled as a grid of small
    // affine cells: the texture stays undistorted and all four edges stay on
    // their world lines.
    const N=8;
    for(const [index,rug] of VC.Layout.RUGS.entries()) {
      const image = index in rugImages ? rugImages[index] : A.images['rug' + (index + 1)];
      if (!image) continue;
      const source=(u,v)=>[u*image.naturalWidth,v*image.naturalHeight];
      const target=(u,v)=>VC.Layout.floorArt(rug.x0+(rug.x1-rug.x0)*u,rug.y0+(rug.y1-rug.y0)*v);
      for(let j=0;j<N;j++) for(let i=0;i<N;i++) {
        const cell=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]].map(([u,v])=>[u/N,v/N]);
        const src=cell.map(c=>source(...c)), dst=cell.map(c=>target(...c));
        // One artwork pixel of overlap keeps solid custom textures opaque at seams.
        for(const ids of [[0,1,2],[0,2,3]])
          VC.drawTexturedTriangle(ctx,image,ids.map(k=>src[k]),ids.map(k=>dst[k]),1);
      }
    }
    ctx.restore();
  };
  A.scene = function (opts = {}) {
    const L = VC.Layout,
      bg = canvas(1920, 1080),
      fg = canvas(1920, 1080),
      lintel = canvas(1920, 1080),
      room = A.room();
    const sign = VC.Decor.sign(opts.signText);
    VC.Decor.drawSign(room.getContext('2d'), sign);
    const ctx = bg.getContext('2d'),
      front = fg.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'brightness(.9) saturate(.94)';
    // Preserve the original fine detail: no low-resolution intermediate canvas.
    ctx.drawImage(room, 24, 12, 1872, 1054);
    A.rugs(ctx);
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
    front.drawImage(room, 12, 6, 936, 527);
    front.restore();
    const header = lintel.getContext('2d');
    header.scale(2, 2);
    header.filter = 'brightness(.9) saturate(.94)';
    header.beginPath();
    polygon(header, L.ART_GEOMETRY.lintel);
    header.clip();
    header.drawImage(room, 12, 6, 936, 527);
    front.save();
    front.scale(2, 2);
    A.railings(front);
    front.restore();
    // Painted lamp positions in the displayed room art.
    const lights = [
      [279, 420],
      [431, 299],
      [615, 207],
      [737, 161], // clear of the cornice, in the gap between poster slots 4 and 5
      [197, 548],
      [390, 647],
      [517, 317]
    ].map(([x, y]) => ({
      ...F(x, y),
      r: 14,
      col: '255,172,74',
      a: 0.035
    }));
    return {
      bg,
      room,
      fg,
      lintel,
      posters: VC.Decor.posters(opts.posters),
      sign,
      seats: A.seats(),
      lights,
      screenGlow: F(1195, 470)
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
  const HIP = 90;
  const WALK_FRAMES = 8;
  // Each leg has rigid thigh and shin pieces (including the shoe). Joints rotate;
  // leg length and shoe width stay constant throughout the cycle. No pixel readback is
  // needed, so this also works with local files in OBS.
  function walkPose(source, phase, split, front, mirroredLegs) {
    const c = canvas(80, 128), ctx = c.getContext('2d');
    const direction = front ? 1 : -1;
    const rotate = (point, pivot, angle) => ({
      x: pivot.x + (point.x - pivot.x) * Math.cos(angle) - (point.y - pivot.y) * Math.sin(angle),
      y: pivot.y + (point.x - pivot.x) * Math.sin(angle) + (point.y - pivot.y) * Math.cos(angle)
    });
    const legs = [0, 1].map(side => {
      const t = (phase + side * 0.5) % 1;
      const swing = t >= 0.5, u = swing ? (t - 0.5) * 2 : t * 2;
      const travel = swing ? -Math.cos(u * Math.PI) : 1 - 2 * u;
      const hip = { x: split + (side ? 6 : -6), y: HIP };
      const knee = { x: hip.x, y: 106 };
      const ankle = mirroredLegs
        ? { x: hip.x + (side ? 1 : 0), y: side ? 116 : 119 }
        : { x: hip.x + (side ? 0 : -1), y: side ? 119 : 116 };
      const upperAngle = direction * travel * 0.18;
      const lowerAngle = upperAngle - direction * (swing ? Math.sin(u * Math.PI) * 0.48 : 0);
      const targetKnee = rotate(knee, hip, upperAngle);
      const rotatedAnkle = rotate(ankle, knee, lowerAngle);
      const targetAnkle = { x: targetKnee.x + rotatedAnkle.x - knee.x, y: targetKnee.y + rotatedAnkle.y - knee.y };
      return { side, hip, knee, ankle, targetKnee, targetAnkle, upperAngle, lowerAngle, swing };
    });
    // The supporting foot sets the body height; the other bends at the knee
    // and clears the floor. Both segments retain the source artwork's length.
    const support = legs.find(leg => !leg.swing);
    const bob = support.ankle.y - support.targetAnkle.y;
    const ordered = mirroredLegs ? [...legs].reverse() : legs;
    for (const leg of ordered) {
      const x = leg.side ? split : 0, width = leg.side ? 80 - split : split;
      function piece(y, height, pivot, destination, rotation) {
        ctx.save();
        ctx.translate(destination.x, destination.y + bob);
        ctx.rotate(rotation);
        ctx.drawImage(source, x, y, width, height, x - pivot.x, y - pivot.y, width, height);
        ctx.restore();
      }
      piece(HIP - 2, 20, leg.hip, leg.hip, leg.upperAngle);
      piece(103, 25, leg.knee, leg.targetKnee, leg.lowerAngle);
    }
    // Keep the jacket over the hip seams.
    ctx.drawImage(source, 0, 0, 80, HIP + 2, 0, bob, 80, HIP + 2);
    return c;
  }

  // Keep appearance seeds stable across reloads and scenes.
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
  A.appearanceKey = function (login) {
    const random = VC.rng(VC.hash(login));
    const shirt = SHIRT[Math.floor(random() * SHIRT.length)];
    random(); // Reserved draw: keeps previously assigned characters stable.
    const style = HAIRSTYLES[Math.floor(random() * HAIRSTYLES.length)];
    random();
    const hair = HAIR[Math.floor(random() * HAIR.length)];
    return VC.hash(hair + shirt + style);
  };

  // Share immutable frames for the 48 atlas/row/palette combinations.
  const spriteCache = new Map();
  A.sprites = function (hash) {
    const atlasIndex = (hash >>> 6) % 3 === 2 ? 2 : (hash >>> 2) % 2;
    const key = atlasIndex * 16 + (hash & 3) * 4 + ((hash >>> 4) & 3);
    if (spriteCache.has(key)) return spriteCache.get(key);
    const row = hash % 4,
      atlasCrops = [crops, extraCrops, diverseCrops][atlasIndex],
      atlas = [A.images.viewers, A.images.viewersExtra, A.images.viewersDiverse][atlasIndex],
      leg = [legs, extraLegs, diverseLegs][atlasIndex][row],
      scale = 116 / atlasCrops[row][0][3];
    function pose(col, tint = true) {
      const c = canvas(80, 128),
        ctx = c.getContext('2d');
      const [x, y, w, h] = atlasCrops[row][col];
      const dw = w * scale,
        dh = h * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(atlas, x, y, w, h, (80 - dw) / 2, 124 - dh, dw, dh);
      // Older sheets paint the back view mid-stride. Reuse the same outfit's
      // standing legs, facing away, instead of mirroring crossed walking legs.
      if (col === 1 && atlasIndex < 2) {
        const standing = pose(0, false);
        ctx.clearRect(0, HIP, 80, 128 - HIP);
        ctx.save();
        ctx.translate(80, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(standing, 0, HIP, 80, 128 - HIP, 0, HIP, 80, 128 - HIP);
        ctx.restore();
      }
      // Stable, restrained wardrobe variations; face and hair retain their artwork.
      const hue = [-18, 0, 18, 36][(hash >>> 4) % 4];
      if (hue && tint) {
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
    const sprites = {
      front: [],
      back: [],
      strideDistance: 1.25,
      sit: pose(2),
      w: 40,
      h: 64,
      footY: 62,
      sitFootY: 62,
      scale: 1,
      seatOffset: 16,
      seatShift: 8
    };
    for (const [name, col] of [['front', 0], ['back', 1]]) {
      const source = pose(col);
      const split = leg[col];
      sprites[name] = [source, ...Array.from({length: WALK_FRAMES}, (_, i) =>
        walkPose(source, i / WALK_FRAMES, split, col === 0, col === 1 && atlasIndex < 2))];
    }
    spriteCache.set(key, sprites);
    return sprites;
  };
})();
