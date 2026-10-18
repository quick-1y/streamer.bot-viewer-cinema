/*
 * Renderer: composes the pixel-art world (low-res canvas, upscaled with
 * nearest-neighbour) and draws crisp name labels on a full-resolution overlay.
 * Reads Audience/Actor state; never mutates it except for label smoothing.
 */
(function () {
  'use strict';
  const VC = window.VC;
  const L = VC.Layout;

  const ROLE_COLOURS = {
    broadcaster: '#ffd36b', moderator: '#8dff9a', vip: '#ff9ad5', subscriber: '#9fe7ff', viewer: '#fff4e2'
  };

  class Renderer {
    constructor(root, opts) {
      this.root = root;
      this.opts = opts;
      this.scene = VC.buildScene();

      this.world = document.createElement('canvas');
      this.world.className = 'world';
      this.world.width = L.VIEW_W;
      this.world.height = L.VIEW_H;
      this.ctx = this.world.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;

      this.labels = document.createElement('canvas');
      this.labels.className = 'labels';
      this.lctx = this.labels.getContext('2d');

      root.appendChild(this.world);
      root.appendChild(this.labels);

      this.counterEl = null;
      this.counterValue = -1;
      if (opts.showCounter) this.buildCounter();

      this.seatItems = [];
      this.onResize = () => this.resize();
      window.addEventListener('resize', this.onResize);
      this.resize();
    }

    destroy() {
      window.removeEventListener('resize', this.onResize);
      this.root.innerHTML = '';
    }

    setSeats(seats) {
      const items = [];
      for (const s of seats) {
        const p = L.project(s.x, s.y, 0);
        const sx = Math.round(p.x), sy = Math.round(p.y);
        items.push({ depth: s.x + s.y - 0.3, kind: 'cushion', sx, sy });
        items.push({ depth: s.x + s.y + 0.36, kind: 'back', sx, sy });
      }
      this.seatItems = items;
    }

    buildCounter() {
      const el = document.createElement('div');
      el.className = 'counter';
      el.innerHTML = '<span class="icon" aria-hidden="true"></span><span class="label"></span><span class="value">0</span>';
      el.querySelector('.label').textContent = this.opts.counterLabel + ':';
      el.querySelector('.icon').appendChild(popcornIcon());
      this.root.appendChild(el);
      this.counterEl = el;
      this.counterNum = el.querySelector('.value');
    }

    setCount(n) {
      if (!this.counterEl || n === this.counterValue) return;
      this.counterValue = n;
      this.counterNum.textContent = String(n);
      this.counterEl.classList.remove('bump');
      void this.counterEl.offsetWidth; // restart animation
      this.counterEl.classList.add('bump');
    }

    resize() {
      const vw = window.innerWidth || L.VIEW_W, vh = window.innerHeight || L.VIEW_H;
      const fit = Math.min(vw / L.VIEW_W, vh / L.VIEW_H);
      const int = Math.floor(fit);
      const scale = int >= 1 ? int : fit;   // never stretch pixels by a fractional factor at OBS sizes
      this.scale = scale;
      const cw = Math.round(L.VIEW_W * scale), ch = Math.round(L.VIEW_H * scale);
      this.offX = Math.round((vw - cw) / 2);
      this.offY = Math.round((vh - ch) / 2);
      Object.assign(this.world.style, { width: cw + 'px', height: ch + 'px', left: this.offX + 'px', top: this.offY + 'px' });
      const dpr = window.devicePixelRatio || 1;
      this.dpr = dpr;
      this.labels.width = Math.round(vw * dpr);
      this.labels.height = Math.round(vh * dpr);
      Object.assign(this.labels.style, { width: vw + 'px', height: vh + 'px' });
      this.fontPx = VC.clamp(Math.round(scale * 9), 12, 34);
      this.font = `600 ${this.fontPx}px "Pixelify Sans", "Trebuchet MS", sans-serif`;
      this.widthCache = new Map();
      if (this.counterEl) this.counterEl.style.setProperty('--u', (scale / (1920 / L.VIEW_W)).toFixed(3));
    }

    // ------------------------------------------------------------------ frame
    draw(audience, time, dt) {
      this.lastDt = dt || 1 / 60;
      const ctx = this.ctx;
      const S = this.scene;
      ctx.clearRect(0, 0, L.VIEW_W, L.VIEW_H);
      ctx.drawImage(S.bg, 0, 0);
      this.drawLights(time, true);

      const items = this.seatItems.slice();
      const visible = [];
      const outside = [];
      for (const a of audience.actors.values()) {
        if (!a.isInside()) continue;
        visible.push(a);
        if (a.pos.y > L.D) outside.push(a);
        else items.push({ depth: a.depth, kind: 'actor', actor: a });
      }
      items.sort((p, q) => p.depth - q.depth);

      const seat = S.seats;
      for (const it of items) {
        if (it.kind === 'cushion') ctx.drawImage(seat.cushion, it.sx - seat.ax, it.sy - seat.ay);
        else if (it.kind === 'back') ctx.drawImage(seat.back, it.sx - seat.ax, it.sy - seat.ay);
        else this.drawActor(it.actor);
      }
      ctx.drawImage(S.fg, 0, 0);
      outside.sort((a, b) => a.depth - b.depth).forEach((a) => this.drawActor(a));
      this.drawLights(time, false);
      this.drawLabels(visible);
      this.setCount(audience.hallCount);
    }

    drawLights(t, under) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (under) {
        // pale bounce light from the blank screen onto stage and front rows
        const g = this.scene.screenGlow;
        const grd = ctx.createRadialGradient(g.x, g.y, 4, g.x, g.y, 150);
        grd.addColorStop(0, 'rgba(170,155,180,0.045)');
        grd.addColorStop(1, 'rgba(170,155,180,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(g.x - 150, g.y - 150, 300, 300);
      } else {
        for (let i = 0; i < this.scene.lights.length; i++) {
          const l = this.scene.lights[i];
          const flick = 0.92 + 0.08 * Math.sin(t * 2.1 + i * 1.7) * Math.sin(t * 3.3 + i);
          const grd = ctx.createRadialGradient(l.x, l.y, 1, l.x, l.y, l.r);
          grd.addColorStop(0, `rgba(${l.col},${(l.a * flick).toFixed(3)})`);
          grd.addColorStop(1, `rgba(${l.col},0)`);
          ctx.fillStyle = grd;
          ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
        }
      }
      ctx.restore();
    }

    drawActor(a) {
      if (!a.sprites) a.sprites = VC.buildSprites(a.appearance);
      const ctx = this.ctx;
      const sp = a.sprites;
      const spriteScale = 1.25;
      const p = L.project(a.pos.x, a.pos.y, 0);
      let x = Math.round(p.x), y = Math.round(p.y);
      let img, flip = false, footY = sp.footY;

      if (a.sit >= 0.5) {
        img = sp.sit;
        footY = sp.sitFootY;
        const bob = (a.phase === 'seated' && (a.idleClock % a.idlePeriod) < 0.35) ? 1 : 0;
        y = y - 14 + bob;          // align the seated pose with the taller upholstered chair
        flip = true;
      } else {
        const front = a.facing === 'SW' || a.facing === 'SE';
        const set = front ? sp.front : sp.back;
        const f = a.moving ? 1 + (Math.floor(a.walkClock * 3.2) % 4) : 0;
        img = set[f];
        flip = a.facing === 'SE' || a.facing === 'NE';
        y -= Math.round(a.sit * 4);
      }
      a.screenX = x; a.screenTop = y - footY * spriteScale + 1;

      if (flip) {
        ctx.save();
        ctx.translate(x, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -Math.floor(sp.w * spriteScale / 2), Math.round(y - footY * spriteScale), Math.round(sp.w * spriteScale), Math.round(sp.h * spriteScale));
        ctx.restore();
      } else {
        ctx.drawImage(img, x - Math.floor(sp.w * spriteScale / 2), Math.round(y - footY * spriteScale), Math.round(sp.w * spriteScale), Math.round(sp.h * spriteScale));
      }
    }

    // ------------------------------------------------------------------ labels
    drawLabels(actors) {
      const ctx = this.lctx;
      const dpr = this.dpr, s = this.scale;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.labels.width, this.labels.height);
      if (!actors.length) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = this.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineJoin = 'round';

      const fh = this.fontPx;
      const pad = Math.max(2, Math.round(fh * 0.18));
      // Closest-to-camera first: they keep their spot; farther labels lift to avoid overlap.
      const order = actors.slice().sort((p, q) => q.depth - p.depth);
      const placed = [];
      const dt = this.lastDt || 1 / 60;
      for (const a of order) {
        const text = a.viewer.display;
        let w = this.widthCache.get(text);
        if (w === undefined) { w = ctx.measureText(text).width; this.widthCache.set(text, w); if (this.widthCache.size > 600) this.widthCache.clear(); }
        const cx = this.offX + (a.screenX + 0.5) * s;
        const baseY = this.offY + (a.screenTop - 1.2) * s;
        let lift = 0;
        for (let tries = 0; tries < 4; tries++) {
          const top = baseY - lift - fh, bottom = baseY - lift + pad;
          const hit = placed.some((r) => cx - w / 2 - pad < r.r && cx + w / 2 + pad > r.l && top < r.b && bottom > r.t);
          if (!hit) break;
          lift += fh * 0.95;
        }
        a.labelLift += (lift - a.labelLift) * (1 - Math.exp(-dt * 10));
        const y = baseY - a.labelLift;
        placed.push({ l: cx - w / 2 - pad, r: cx + w / 2 + pad, t: y - fh, b: y + pad });
        a._label = { x: cx, y, text };
      }
      for (let i = order.length - 1; i >= 0; i--) {
        const a = order[i];
        const lab = a._label;
        const alpha = 1;
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(3, fh * 0.3);
        ctx.strokeStyle = 'rgba(14,6,6,0.92)';
        ctx.strokeText(lab.text, lab.x, lab.y);
        ctx.fillStyle = ROLE_COLOURS[roleKey(a.viewer)];
        ctx.fillText(lab.text, lab.x, lab.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  function roleKey(v) {
    if (v.role === 'broadcaster') return 'broadcaster';
    if (v.role === 'moderator') return 'moderator';
    if (v.role === 'vip') return 'vip';
    if (v.subscribed) return 'subscriber';
    return 'viewer';
  }

  // Small pixel popcorn bucket for the counter.
  function popcornIcon() {
    const c = document.createElement('canvas');
    c.width = 12; c.height = 14;
    const x = c.getContext('2d');
    const px = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    px(2, 1, 3, 3, '#fff1c4'); px(5, 0, 3, 3, '#ffe08a'); px(8, 1, 3, 3, '#fff1c4'); px(3, 3, 7, 2, '#ffd25e');
    px(2, 5, 9, 9, '#f3ece0');
    for (let i = 0; i < 3; i++) px(3 + i * 3, 5, 2, 9, '#d8323a');
    px(2, 5, 9, 1, '#b8262d');
    return c;
  }

  VC.Renderer = Renderer;
})();
