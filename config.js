/*
 * Viewer Cinema — deployment configuration.
 *
 * Edit the values below once, OR override any of them per OBS source through
 * the URL query string, e.g.
 *   file:///C:/overlays/viewer-cinema/index.html?port=8080&password=secret&bg=transparent
 *
 * URL parameters always win over this file.
 */
window.CINEMA_CONFIG = {
  // ---- Streamer.bot WebSocket Server (Servers/Clients → WebSocket Server) ----
  host: '127.0.0.1',        // ?host=
  port: 8080,               // ?port=
  endpoint: '/',            // ?endpoint=
  secure: false,            // ?secure=1  → wss:// (only for remote setups behind TLS)
  password: '',             // ?password=  (only needed if "Authentication" + "Enforce" are on)

  // ---- Viewer list ----
  pollSeconds: 60,          // ?poll=  safety re-sync interval; 0 disables (events still work)
  leaveGraceSeconds: 90,    // ?grace= how long a viewer may be missing before walking out
  hideBroadcaster: false,   // ?hideBroadcaster=1
  // Accounts that never get a seat (case-insensitive). ?ignore=bot1,bot2 replaces this list.
  ignore: [
    'nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot', 'wizebot',
    'soundalerts', 'sery_bot', 'commanderroot', 'kofistreambot', 'own3d',
    'botrixoficial', 'tangiabot', 'pokemoncommunitygame', 'lumiastream', 'blerp',
    'streamstickers', 'frostytoolsdotcom', 'creatisbot', 'wzbot'
  ],

  // ---- Look ----
  background: 'dark',       // ?bg=dark | transparent | #rrggbb
  maxSeats: 60,             // ?seats= cap (layout has 60 seats)
  showCounter: true,        // ?counter=0 hides "Зрители"
  counterLabel: 'Зрители',
  signText: 'CINEMA',        // ?sign= название на вывеске; длинный текст автоматически уменьшается
  // Independent wall posters: omitted = bundled art, null = hide, string = replacement image.
  // Use local paths, e.g. goodVibes: 'assets/my-poster.png'. Images fit inside the existing frames.
  posters: {},              // sunset, small, goodVibes, mountains, space
  initialEntrance: 'seated',  // ?initial=walk | seated  (how viewers present at page load appear)

  rememberAudience: true,   // ?remember=0 disables local audience persistence

  // ---- Developer ----
  debug: false,             // ?debug=1   logs to the browser console only (never on screen)
  demo: false               // ?demo=1    simulated viewers, no Streamer.bot needed
};
