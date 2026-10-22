/* Screen content shared by starting.html, break.html and ending.html. */
(function () {
  'use strict';
  const VC = window.VC, W = 1000, H = 400;
  const str = (v, d) => typeof v === 'string' ? v : d;
  const number = (v, d, min, max) => v !== undefined && v !== null && Number.isFinite(+v) ? VC.clamp(+v, min, max) : d;
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  // Streamer.bot versions/custom categories may differ in key casing. The old
  // scrolling credits uses the same case-insensitive section/key lookup.
  function field(data, key) {
    if (!record(data) || typeof key !== 'string') return undefined;
    const ownKey = Object.prototype.hasOwnProperty.call(data, key) ? key :
      Object.keys(data).find(k => k.toLowerCase() === key.toLowerCase());
    return ownKey === undefined ? undefined : data[ownKey];
  }
  function namesAt(data, path) {
    if (!Array.isArray(path) || !path.length) return [];
    for (const key of path) {
      data = field(data, key);
      if (data === undefined) return [];
    }
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    return data.map(v => typeof v === 'string' ? v : v && (v.display || v.displayName || v.userName || v.name || v.login))
      .filter(v => typeof v === 'string')
      .map(v => v.trim())
      // Credits formatting may leave unexpanded Streamer.bot arguments behind.
      // Match the old scrolling credits: a template is not a viewer/leaderboard row.
      .filter(v => !/%[^%\s]+%/u.test(v))
      .filter(v => {
        if (typeof v !== 'string' || !v.trim() || seen.has(v.trim().toLowerCase())) return false;
        seen.add(v.trim().toLowerCase()); return true;
      });
  }
  class ScreenScene {
    constructor(renderer, cfg) {
      this.renderer = renderer; this.cfg = cfg; this.mode = document.body.dataset.scene;
      this.q = new URLSearchParams(location.search);
      this.elapsed = 0; this.phase = 'intro'; this.loaded = false; this.loading = false; this.groups = [];
      this.el = document.createElement('section'); this.el.className = 'cinema-screen';
      this.el.setAttribute('aria-label', 'Экран кинотеатра'); renderer.root.appendChild(this.el);
      if (this.mode === 'starting') this.message(this.q.get('text') ?? str(cfg.startingText, 'Стрим скоро начнется'));
      if (this.mode === 'break') this.buildChat();
      if (this.mode === 'ending') {
        this.el.classList.add('is-credits');
        this.message(this.q.get('text') ?? str(cfg.endingText, 'Стрим завершен'));
        if (cfg.demo) this.acceptCredits({ users: { users: ['Котейка', 'Aurora', 'NightRain'] },
          events: { follows: ['Новый_зритель'], subs: ['Sakura'], cheers: ['Pixel'] } });
      }
      this.position();
    }
    position() {
      const r = this.renderer;
      const key = [r.scale, r.offX, r.offY].join(':');
      if (this.positionKey === key) return;
      this.positionKey = key;
      const points = VC.Layout.SCREEN_ART_CORNERS.map(([x, y]) => {
        const p = VC.Layout.artPoint(x, y);
        return [r.offX + p.x * r.scale, r.offY + p.y * r.scale];
      });
      // Project the whole rectangular DOM plane onto the four painted corners.
      // An affine skew cannot match this screen's slightly unequal side heights.
      const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = points;
      const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
      const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
      const den = dx1 * dy2 - dx2 * dy1;
      const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
      const a = (x1 - x0 + g * x1) / W, b = (x3 - x0 + h * x3) / H;
      const d = (y1 - y0 + g * y1) / W, e = (y3 - y0 + h * y3) / H;
      this.el.style.transform = `matrix3d(${[a, d, 0, g / W, b, e, 0, h / H, 0, 0, 1, 0, x0, y0, 0, 1].join(',')})`;
    }
    message(value) {
      this.el.replaceChildren();
      const box = document.createElement('div'); box.className = 'screen-message';
      const span = document.createElement('span'); span.textContent = value;
      box.appendChild(span); this.el.appendChild(box);
      let lo = 1, hi = 86;
      while (hi - lo > .25) {
        const size = (lo + hi) / 2; span.style.fontSize = size + 'px';
        if (span.scrollHeight <= box.clientHeight && span.scrollWidth <= box.clientWidth) lo = size;
        else hi = size;
      }
      span.style.fontSize = lo + 'px';
    }
    buildChat() {
      const url = this.q.get('chatUrl') ?? this.cfg.chatUrl;
      this.chatMode = url ? 'embed' : (this.q.get('chatMode') || this.cfg.chatMode || 'streamerbot');
      const box = document.createElement('div'); box.className = 'screen-chat'; this.el.appendChild(box);
      if (this.chatMode === 'embed') {
        try {
          const parsed = new URL(url);
          if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Unsupported chat URL');
          const iframe = document.createElement('iframe'); iframe.title = 'Чат стрима'; iframe.src = parsed.href;
          iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
          box.classList.add('is-embed'); box.appendChild(iframe);
        } catch (_) { this.message('Укажите ссылку на виджет чата в chatUrl'); }
        return;
      }
      const heading = document.createElement('h1'); heading.textContent = str(this.cfg.breakText, 'Перерыв. Скоро вернусь!'); box.appendChild(heading);
      this.chat = document.createElement('div'); this.chat.className = 'chat-messages'; box.appendChild(this.chat);
      this.chatNotice('Подключаемся к чату…');
      if (this.cfg.demo) { this.addChat('Котейка', 'Всем привет!'); this.addChat('Aurora', 'Ждём продолжения 🍿'); }
    }
    chatNotice(value) {
      if (this.chat && !this.chat.querySelector('.chat-line')) {
        this.chat.replaceChildren(); const el = document.createElement('div'); el.className = 'chat-empty'; el.textContent = value; this.chat.appendChild(el);
      }
    }
    addChat(name, value) {
      if (!this.chat || typeof value !== 'string' || !value.trim()) return;
      const notice = this.chat.querySelector('.chat-empty'); if (notice) notice.remove();
      const line = document.createElement('div'); line.className = 'chat-line';
      const author = document.createElement('strong'); author.textContent = str(name, 'Зритель') + ': ';
      line.append(author, document.createTextNode(value)); this.chat.appendChild(line);
      const contentHeight = () => Array.from(this.chat.children).reduce((sum, el) => sum + el.offsetHeight, 0) + (this.chat.children.length - 1) * 9;
      while (this.chat.children.length > 1 && (this.chat.children.length > 20 || contentHeight() > this.chat.clientHeight)) this.chat.firstChild.remove();
    }
    connect(connection) {
      if (this.mode === 'break' && this.chatMode === 'streamerbot') {
        connection.subscriptions.Twitch = Array.from(new Set([...connection.subscriptions.Twitch, 'ChatMessage', 'ChatMessageDeleted', 'ChatCleared', 'UserBanned', 'UserTimedOut']));
        connection.on('ready', () => this.chatNotice('Чат подключён. Ждём сообщений…'));
        connection.on('state', s => { if (s === 'waiting') this.chatNotice('Соединение потеряно. Переподключаемся…'); });
        connection.on('event', event => {
          if (event.source !== 'Twitch') return;
          if (event.type === 'ChatMessage') {
            const m = VC.normalizeChatMessage(event.data); if (m) this.addChat(m.display, m.text);
          } else if (['ChatMessageDeleted', 'ChatCleared', 'UserBanned', 'UserTimedOut'].includes(event.type)) {
            this.chat.replaceChildren(); this.chatNotice('Чат подключён. Ждём сообщений…');
          }
        });
      }
      if (this.mode === 'ending') connection.on('ready', () => this.fetchCredits(connection));
    }
    async fetchCredits(connection) {
      if (this.loading || (this.loaded && this.groups.length)) return;
      this.loading = true;
      try {
        const res = await connection.request({ request: 'GetCredits' });
        if (!res || res.status !== 'ok') throw new Error(res && res.error || 'GetCredits failed');
        const data = field(res, 'credits') ?? res;
        // Users Present can be disabled while event/custom Credits remain valid.
        // Still reject malformed payloads instead of silently showing empty credits.
        if (!record(data) || !['users', 'events', 'groups', 'hypeTrain', 'top', 'custom'].some(key => record(field(data, key)))) {
          throw new Error('Invalid Credits payload');
        }
        this.acceptCredits(data);
      } catch (e) {
        VC.log.warn('Credits:', e.message); this.phase = 'error';
        this.message('Стрим завершен\nНе удалось загрузить титры.\nПроверьте Credits и подключение Streamer.bot.');
      } finally { this.loading = false; }
    }
    acceptCredits(data) {
      this.groups = (Array.isArray(this.cfg.creditsGroups) ? this.cfg.creditsGroups : []).map(g => ({ title: str(g.title, ''), names: namesAt(data, g.path) })).filter(g => g.names.length);
      // Counts/paths help diagnose an empty roll without logging viewer identities.
      this.creditsDiagnostics = [];
      for (const section of Object.keys(data)) {
        if (!record(data[section])) continue;
        for (const key of Object.keys(data[section])) {
          const entries = data[section][key];
          if (Array.isArray(entries)) this.creditsDiagnostics.push({ path: [section, key], count: entries.length });
        }
      }
      VC.log.debug('Credits arrays:', this.creditsDiagnostics);
      if (!this.groups.length) VC.log.warn('No matching Credits entries. Check Services → Credits and creditsGroups.', this.creditsDiagnostics);
      VC.log.debug('Credits groups:', this.groups.map(g => ({ title: g.title, count: g.names.length })));
      this.loaded = true;
      this.beginCredits();
    }
    beginCredits() {
      this.phase = 'intro'; this.elapsed = 0;
      this.message(this.q.get('text') ?? str(this.cfg.endingText, 'Стрим завершен'));
    }
    startRoll() {
      this.el.replaceChildren(); this.roll = document.createElement('div'); this.roll.className = 'credits-roll';
      for (const group of this.groups) {
        const section = document.createElement('div'); section.className = 'credits-group';
        const heading = document.createElement('h2'); heading.textContent = group.title; section.appendChild(heading);
        for (const name of group.names) {
          const line = document.createElement('div'); line.className = 'credits-name'; line.textContent = name; section.appendChild(line);
        }
        this.roll.appendChild(section);
      }
      this.el.appendChild(this.roll); this.offset = H; this.phase = 'roll'; this.roll.style.transform = `translateY(${this.offset}px)`;
    }
    update(dt) {
      this.position();
      if (this.mode !== 'ending' || !this.loaded) return;
      this.elapsed += dt;
      if (this.phase === 'intro' && this.elapsed >= number(this.q.get('creditsIntro') ?? this.cfg.creditsIntroSeconds, 4, 0, 120)) {
        if (this.groups.length) this.startRoll();
        else {
          this.phase = 'empty'; this.elapsed = 0;
          this.message(this.creditsDiagnostics.some(entry => entry.count > 0)
            ? 'В Credits есть записи, но выбранные группы пусты.'
            : 'В Credits пока нет записей для титров.');
        }
      } else if (this.phase === 'thanks' && this.elapsed >= number(this.q.get('creditsThanks') ?? this.cfg.creditsThanksSeconds, 4, 0.1, 120)) {
        const loop = this.q.has('creditsLoop') ? ['1', 'true', 'yes'].includes(this.q.get('creditsLoop')) : this.cfg.creditsLoop === true;
        if (loop) this.beginCredits();
      } else if (this.phase === 'empty' && this.elapsed >= 4) {
        this.finish();
      } else if (this.phase === 'roll') {
        this.offset -= number(this.q.get('creditsSpeed') ?? this.cfg.creditsSpeed, 45, 5, 300) * dt;
        this.roll.style.transform = `translateY(${this.offset}px)`;
        if (this.offset < -this.roll.offsetHeight) this.finish();
      }
    }
    finish() { this.phase = 'thanks'; this.elapsed = 0; this.message(this.q.get('thanks') ?? str(this.cfg.thanksText, 'Спасибо, что были с нами!')); }
  }
  VC.ScreenScene = ScreenScene;
})();
