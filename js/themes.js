/* Cinema themes: artwork sets and palettes over the same surveyed geometry. */
(function () {
  'use strict';
  const VC = window.VC;

  const THEMES = {
    classic: {
      art: {
        alignedRoom: 'assets/art/cinema-room-aligned.png',
        chair: 'assets/art/cinema-chair.png',
        rug1: 'assets/art/rug-1.png',
        rug2: 'assets/art/rug-2.png'
      },
      lights: ['255,172,74'],
      lightAlpha: 0.035,
      sign: { fill: '#ffe7a4', glow: '#ffad48' },
      poster: { base: '#241812', frame: '#b98643', edge: '#f1cc79', inset: '#482919' },
      rail: {
        front: '#56311e', frontEdge: '#251922', back: '#301c16', backEdge: '#211820',
        top: '#bd8240', topEdge: '#6e4a32', post: '#8c4b24', lamp: '#ffe0a0',
        upper: '#79401e', lower: '#3a2117', outline: '#251a21',
        upperLight: '#b56f33', lowerLight: '#684021'
      }
    },
    cyberpunk: {
      art: {
        alignedRoom: 'assets/themes/cyberpunk/cinema-room.png',
        chair: 'assets/themes/cyberpunk/cinema-chair.png',
        rug1: 'assets/themes/cyberpunk/rug-1.png',
        rug2: 'assets/themes/cyberpunk/rug-2.png'
      },
      lights: ['44,232,245', '255,65,185'],
      lightAlpha: 0.06,
      sign: { fill: '#d4fdff', glow: '#1ce6ff' },
      poster: { base: '#070b1a', frame: '#1b3f5c', edge: '#4cf0ff', inset: '#24123c' },
      rail: {
        front: '#1c2236', frontEdge: '#0a0d1c', back: '#10142a', backEdge: '#080b18',
        top: '#3b4c78', topEdge: '#2ce8f5', post: '#33415f', lamp: '#ff6ad5',
        upper: '#26304e', lower: '#141a30', outline: '#090c1c',
        upperLight: '#3fe6f5', lowerLight: '#c043b8'
      }
    }
  };

  // ?theme= wins over config.js; unknown names fall back to the classic look.
  const query = new URLSearchParams(location.search).get('theme');
  const requested = String(query || (window.CINEMA_CONFIG || {}).cinemaTheme || 'classic').trim().toLowerCase();
  const id = Object.prototype.hasOwnProperty.call(THEMES, requested) ? requested : 'classic';
  if (id !== requested) VC.log.warn('Unknown cinema theme "' + requested + '"; using classic');

  VC.Theme = Object.assign({ id, names: Object.keys(THEMES) }, THEMES[id]);
  // Every bundled rug, so a config.js written for one theme follows the active one.
  VC.Theme.bundledRugs = new Set(Object.values(THEMES).flatMap(t => [t.art.rug1, t.art.rug2]));
  document.documentElement.dataset.cinemaTheme = id;
})();
