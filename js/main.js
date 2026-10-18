/* Wiring: config → connection → sync → audience → renderer, plus the frame loop. */
(function () {
  'use strict';
  const VC = window.VC;

  function readConfig() {
    const base = Object.assign({}, window.CINEMA_CONFIG || {});
    const q = new URLSearchParams(location.search);
    const bool = (v) => v === '1' || v === 'true' || v === 'yes' || v === '';
    const num = (v, d) => (v !== null && v !== '' && isFinite(+v) ? +v : d);
    if (q.has('host')) base.host = q.get('host');
    if (q.has('port')) base.port = num(q.get('port'), base.port);
    if (q.has('endpoint')) base.endpoint = q.get('endpoint');
    if (q.has('secure')) base.secure = bool(q.get('secure'));
    if (q.has('password')) base.password = q.get('password');
    if (q.has('poll')) base.pollSeconds = num(q.get('poll'), base.pollSeconds);
    if (q.has('grace')) base.leaveGraceSeconds = num(q.get('grace'), base.leaveGraceSeconds);
    if (q.has('hideBroadcaster')) base.hideBroadcaster = bool(q.get('hideBroadcaster'));
    if (q.has('ignore')) base.ignore = q.get('ignore').split(',').map((s) => s.trim()).filter(Boolean);
    if (q.has('bg')) base.background = q.get('bg');
    if (q.has('seats')) base.maxSeats = num(q.get('seats'), base.maxSeats);
    if (q.has('counter')) base.showCounter = bool(q.get('counter'));
    if (q.has('initial')) base.initialEntrance = q.get('initial');
    if (q.has('debug')) base.debug = bool(q.get('debug'));
    if (q.has('demo')) base.demo = bool(q.get('demo'));
    base.port = base.port || 8080;
    base.host = base.host || '127.0.0.1';
    let ep = base.endpoint || '/';
    if (ep[0] !== '/') ep = '/' + ep;
    base.url = `${base.secure ? 'wss' : 'ws'}://${base.host}:${base.port}${ep}`;
    return base;
  }

  function applyBackground(bg) {
    const v = String(bg || 'dark').trim();
    document.documentElement.style.background =
      v === 'transparent' ? 'transparent' : v === 'dark' ? '#0a0607' : v;
  }

  function start() {
    const cfg = readConfig();
    VC.log.enabled = !!cfg.debug;
    applyBackground(cfg.background);

    const seats = VC.Layout.buildSeats(cfg.maxSeats);
    const audience = new VC.Audience({ seats, leaveGraceMs: Math.max(0, cfg.leaveGraceSeconds) * 1000 });
    const renderer = new VC.Renderer(document.getElementById('stage'), {
      showCounter: cfg.showCounter !== false,
      counterLabel: cfg.counterLabel || 'В зале'
    });
    renderer.setSeats(seats);

    const listOpts = { ignore: cfg.ignore, hideBroadcaster: cfg.hideBroadcaster };
    let snapshots = 0;
    const onList = (list) => {
      audience.applyList(list, { initialMode: snapshots === 0 ? cfg.initialEntrance : 'walk' });
      snapshots++;
    };

    let connection = null, sync = null, demo = null;
    if (cfg.demo) {
      demo = VC.startDemo((list) => onList(VC.normalizeViewerList(list, listOpts)));
    } else {
      connection = new VC.StreamerbotConnection({
        url: cfg.url,
        password: cfg.password,
        subscriptions: { Twitch: ['PresentViewers'] }
      });
      sync = new VC.ViewerSync(connection, {
        pollSeconds: cfg.pollSeconds,
        ignore: cfg.ignore,
        hideBroadcaster: cfg.hideBroadcaster
      }, onList);
      sync.start();
      connection.start();
    }

    // Frame loop: frame-rate independent, dt clamped so a paused/hidden source doesn't jump.
    let last = performance.now(), raf = 0;
    const frame = (now) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      audience.update(dt);
      renderer.draw(audience, now / 1000, dt);
      raf = requestAnimationFrame(frame);
    };
    const begin = () => { last = performance.now(); raf = requestAnimationFrame(frame); };
    if (document.fonts && document.fonts.load) {
      document.fonts.load(renderer.font).catch(() => {}).finally(() => { renderer.widthCache.clear(); });
    }
    begin();

    window.addEventListener('pagehide', () => {
      cancelAnimationFrame(raf);
      if (sync) sync.stop();
      if (connection) connection.stop();
      if (demo) demo.stop();
    });

    // Read-only handle for automated tests / console inspection (nothing is rendered).
    window.__cinema = {
      config: cfg, audience, connection, renderer,
      snapshot: () => Object.assign(audience.snapshot(), { connection: connection ? connection.state : 'demo' })
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
