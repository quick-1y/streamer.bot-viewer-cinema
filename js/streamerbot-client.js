/*
 * Minimal Streamer.bot WebSocket client.
 *
 * Protocol (verified against the official @streamerbot/client source and
 * docs.streamer.bot, Streamer.bot ≥ 0.2.5):
 *   1. Server sends   {"request":"Hello","info":{...},"authentication":{"salt","challenge"}?}
 *   2. If authentication is present and a password is configured, client sends
 *        {"request":"Authenticate","id":..,"authentication": b64(sha256(b64(sha256(password+salt))+challenge))}
 *      Without "Enforce" enabled on the server, unauthenticated clients may still
 *      use read-only requests like GetActiveViewers.
 *   3. Requests carry a unique "id"; the response echoes it with "status":"ok"|"error".
 *   4. Events arrive as {"timeStamp","event":{"source","type"},"data":{...}} after
 *        {"request":"Subscribe","id":..,"events":{"Twitch":["PresentViewers"]}}
 *
 * This module knows nothing about viewers or rendering.
 */
(function () {
  'use strict';
  const VC = window.VC;
  const log = VC.log;

  const HELLO_TIMEOUT = 4000;
  const REQUEST_TIMEOUT = 10000;
  const BACKOFF_MAX = 30000;
  const AUTH_FAIL_DELAY = 60000;

  class StreamerbotConnection {
    constructor({ url, password = '', subscriptions = {} }) {
      this.url = url;
      this.password = password || '';
      this.subscriptions = subscriptions;
      this.ws = null;
      this.state = 'idle';           // idle | connecting | handshaking | ready | waiting | stopped
      this.attempt = 0;
      this.generation = 0;
      this.pending = new Map();
      this.listeners = { ready: new Set(), event: new Set(), state: new Set() };
      this.timers = { hello: 0, reconnect: 0 };
      this.timeoutsInRow = 0;
      this.info = null;
      this.authenticated = false;
    }

    on(type, fn) { this.listeners[type].add(fn); return () => this.listeners[type].delete(fn); }
    emit(type, payload) {
      for (const fn of this.listeners[type]) {
        try { fn(payload); } catch (e) { log.warn(`listener "${type}" threw`, e); }
      }
    }
    setState(s) { if (this.state !== s) { this.state = s; this.emit('state', s); log.debug('state →', s); } }

    start() {
      if (this.state !== 'idle' && this.state !== 'stopped') return;
      if (this.state === 'stopped') this.setState('idle');
      this.connect();
    }

    stop() {
      this.setState('stopped');
      clearTimeout(this.timers.hello);
      clearTimeout(this.timers.reconnect);
      this.rejectAll(new Error('stopped'));
      this.teardownSocket();
    }

    // ------------------------------------------------------------------ socket lifecycle
    connect() {
      if (this.state === 'stopped') return;
      clearTimeout(this.timers.reconnect);
      this.teardownSocket();
      const gen = ++this.generation;
      this.setState('connecting');
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (e) {
        log.warn('Invalid WebSocket URL', this.url, e);
        this.scheduleReconnect(AUTH_FAIL_DELAY);
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        if (gen !== this.generation) return;
        this.setState('handshaking');
        // Streamer.bot < 0.2.5 sends no Hello; carry on unauthenticated after a short wait.
        this.timers.hello = setTimeout(() => {
          if (gen === this.generation && this.state === 'handshaking') {
            log.info('No Hello received; continuing without authentication');
            this.becomeReady();
          }
        }, HELLO_TIMEOUT);
      };
      ws.onmessage = (ev) => { if (gen === this.generation) this.handleMessage(ev.data); };
      ws.onerror = () => { /* onclose always follows; nothing to do here */ };
      ws.onclose = (ev) => {
        if (gen !== this.generation) return;
        log.info('socket closed', ev.code, ev.reason || '');
        clearTimeout(this.timers.hello);
        this.ws = null;
        this.authenticated = false;
        this.rejectAll(new Error('socket closed'));
        if (this.state !== 'stopped') this.scheduleReconnect();
      };
    }

    teardownSocket() {
      const ws = this.ws;
      this.ws = null;
      if (!ws) return;
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try { ws.close(); } catch (e) { /* ignore */ }
    }

    scheduleReconnect(forcedDelay) {
      if (this.state === 'stopped') return;
      clearTimeout(this.timers.reconnect);
      const base = forcedDelay || Math.min(BACKOFF_MAX, 1000 * Math.pow(2, this.attempt));
      const delay = Math.round(base * (0.85 + Math.random() * 0.3));
      this.attempt = Math.min(this.attempt + 1, 10);
      this.setState('waiting');
      log.info(`reconnecting in ${delay} ms`);
      this.timers.reconnect = setTimeout(() => this.connect(), delay);
    }

    /** Close and reconnect (used when the server stops answering on an open socket). */
    forceReconnect(reason) {
      log.warn('forcing reconnect:', reason);
      this.teardownSocket();
      this.rejectAll(new Error(reason));
      this.scheduleReconnect();
    }

    // ------------------------------------------------------------------ messages
    handleMessage(raw) {
      if (typeof raw !== 'string' || !raw) return;
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { log.warn('Ignoring non-JSON message'); return; }
      if (!msg || typeof msg !== 'object') return;

      if (msg.request === 'Hello' && this.state === 'handshaking') {
        clearTimeout(this.timers.hello);
        this.info = msg.info || null;
        this.handleHello(msg);
        return;
      }
      if (typeof msg.id === 'string' && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        this.timeoutsInRow = 0;
        p.resolve(msg);
        return;
      }
      if (msg.event && typeof msg.event.source === 'string' && typeof msg.event.type === 'string') {
        this.emit('event', { source: msg.event.source, type: msg.event.type, data: msg.data || {}, timeStamp: msg.timeStamp });
      }
    }

    async handleHello(hello) {
      const gen = this.generation;
      const auth = hello.authentication;
      if (auth && this.password) {
        if (typeof auth.salt !== 'string' || typeof auth.challenge !== 'string') {
          log.warn('Malformed authentication challenge from server');
          this.forceReconnect('bad auth payload');
          return;
        }
        try {
          const secret = await VC.sha256base64(this.password + auth.salt);
          const authentication = await VC.sha256base64(secret + auth.challenge);
          if (gen !== this.generation) return;
          const res = await this.request({ request: 'Authenticate', authentication });
          if (res && res.status === 'ok') {
            this.authenticated = true;
          } else {
            log.warn('Streamer.bot rejected the WebSocket password. Check ?password= / config.js.');
            this.teardownSocket();
            this.scheduleReconnect(AUTH_FAIL_DELAY);
            return;
          }
        } catch (e) {
          if (gen === this.generation) this.forceReconnect('authentication failed: ' + e.message);
          return;
        }
      } else if (auth && !this.password) {
        log.info('Server has authentication enabled; continuing unauthenticated (works unless "Enforce" is on).');
      }
      if (gen === this.generation) this.becomeReady();
    }

    async becomeReady() {
      this.attempt = 0;
      this.timeoutsInRow = 0;
      this.setState('ready');
      const events = this.subscriptions;
      if (events && Object.keys(events).length) {
        try {
          const res = await this.request({ request: 'Subscribe', events });
          if (!res || res.status !== 'ok') log.warn('Subscribe was not accepted', res && res.error);
        } catch (e) { log.warn('Subscribe failed', e.message); }
      }
      if (this.state === 'ready') this.emit('ready', this.info);
    }

    // ------------------------------------------------------------------ requests
    request(body, timeout = REQUEST_TIMEOUT) {
      return new Promise((resolve, reject) => {
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('not connected')); return; }
        const id = VC.uid('req');
        const timer = setTimeout(() => {
          if (!this.pending.has(id)) return;
          this.pending.delete(id);
          reject(new Error(`${body.request} timed out`));
          // Two silent requests in a row → the socket is half-open; rebuild it.
          if (++this.timeoutsInRow >= 2) this.forceReconnect('requests timing out');
        }, timeout);
        this.pending.set(id, { resolve, reject, timer });
        try {
          ws.send(JSON.stringify(Object.assign({}, body, { id })));
        } catch (e) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(e);
        }
      });
    }

    rejectAll(err) {
      for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(err); }
      this.pending.clear();
    }
  }

  VC.StreamerbotConnection = StreamerbotConnection;
})();
