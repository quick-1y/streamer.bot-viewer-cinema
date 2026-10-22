/*
 * Keeps an authoritative list of present viewers in sync with Streamer.bot.
 *
 * Source of truth: the GetActiveViewers request
 *   → { id, status:"ok", count, viewers:[{ login, display, id, role, subscribed, ... }] }
 * Refresh triggers (no busy polling):
 *   - on (re)connect
 *   - on Twitch.PresentViewers events (Streamer.bot's own present-viewer tick, every 1–10 min)
 *   - a slow safety poll (config.pollSeconds) in case events are disabled
 */
(function () {
  'use strict';
  const VC = window.VC;
  const log = VC.log;

  const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;

  function str(v) { return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''; }

  /**
   * Turn a GetActiveViewers response into a clean viewer list.
   * Returns null when the payload is not something we should act on
   * (so a malformed reply never empties the cinema).
   */
  function normalizeResponse(res, opts) {
    if (!res || typeof res !== 'object') return null;
    if (res.status && res.status !== 'ok') return null;
    const raw = Array.isArray(res.viewers) ? res.viewers
      : Array.isArray(res.users) ? res.users : null;
    if (!raw) return null;
    return normalizeList(raw, opts);
  }

  function normalizeList(raw, opts = {}) {
    const ignore = new Set((opts.ignore || []).map((s) => String(s).toLowerCase()));
    const seen = new Set();
    const out = [];
    for (const v of raw) {
      if (!v || typeof v !== 'object') continue;
      const login = str(v.login || v.userName || v.username || v.user_login || v.name).trim().toLowerCase();
      if (!login || login.length > 64) continue;
      if (seen.has(login) || ignore.has(login)) continue;
      const role = v.role;
      const isBroadcaster = String(role).toLowerCase() === 'broadcaster' || role === 4;
      if (opts.hideBroadcaster && isBroadcaster) continue;
      let display = str(v.display || v.displayName || v.display_name).replace(CONTROL, '').trim();
      if (!display.replace(/\s/g, '')) display = login;
      if (display.length > 25) display = display.slice(0, 24) + '…';
      seen.add(login);
      out.push({
        key: login,
        login,
        display,
        role: isBroadcaster ? 'broadcaster' : String(role || 'viewer').toLowerCase(),
        subscribed: v.subscribed === true || v.isSubscribed === true
      });
    }
    return out;
  }

  class ViewerSync {
    constructor(connection, opts, onList) {
      this.conn = connection;
      this.opts = opts;
      this.onList = onList;
      this.inFlight = false;
      this.rerun = false;
      this.debounce = 0;
      this.pollTimer = 0;
      this.unsubs = [];
      this.lastOk = 0;
    }

    start() {
      this.unsubs.push(this.conn.on('ready', () => this.refresh('connected')));
      this.unsubs.push(this.conn.on('event', (ev) => {
        if (ev.source === 'Twitch' && ev.type === 'PresentViewers') this.refreshSoon('PresentViewers');
      }));
      const ms = Math.max(0, Number(this.opts.pollSeconds) || 0) * 1000;
      if (ms > 0) {
        this.pollTimer = setInterval(() => {
          // Skip if an event-driven refresh already happened recently.
          if (this.conn.state === 'ready' && Date.now() - this.lastOk > ms * 0.8) this.refresh('poll');
        }, ms);
      }
    }

    stop() {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      clearInterval(this.pollTimer);
      clearTimeout(this.debounce);
    }

    refreshSoon(reason) {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.refresh(reason), 400);
    }

    async refresh(reason) {
      if (this.conn.state !== 'ready') return;
      if (this.inFlight) { this.rerun = true; return; }
      this.inFlight = true;
      try {
        const res = await this.conn.request({ request: 'GetActiveViewers' });
        const list = normalizeResponse(res, this.opts);
        if (list) {
          this.lastOk = Date.now();
          log.debug(`viewers (${reason}):`, list.length);
          this.onList(list);
        } else {
          log.warn('Unexpected GetActiveViewers response; keeping current audience', res && (res.error || res.status));
        }
      } catch (e) {
        log.info('GetActiveViewers failed:', e.message);
      } finally {
        this.inFlight = false;
        if (this.rerun) { this.rerun = false; this.refreshSoon('rerun'); }
      }
    }
  }

  // Accept the nested Twitch payload and flat/alias fields used by chat bridges.
  // Never use displayName as identity: it need not match the login.
  VC.normalizeChatMessage = function (data) {
    if (!data || typeof data !== 'object') return null;
    const message = data.message && typeof data.message === 'object' ? data.message : data;
    const user = message.user || data.user || {};
    const login = message.username || message.userName || message.login || user.login || user.userName;
    const content = typeof message.message === 'string' ? message.message : message.text;
    if (typeof login !== 'string' || !login.trim() || typeof content !== 'string' || !content.trim()) return null;
    return { login: login.trim().toLowerCase(), display: message.displayName || message.display || login, text: content, isBroadcaster: message.role === 4 || String(message.role).toLowerCase() === 'broadcaster' };
  };

  VC.ViewerSync = ViewerSync;
  VC.normalizeViewerResponse = normalizeResponse;
  VC.normalizeViewerList = normalizeList;
})();
