/* Visual presets share the same surveyed cinema geometry. */
(function () {
  'use strict';
  const classic = {
    id: 'classic', roomFilter: 'none', chairFilter: 'none',
    assets: {}, rugs: ['rug1', 'rug2'],
    lights: ['255,172,74'], sign: '#ffe7a4', signGlow: '#ffad48',
    poster: { base: '#241812', frame: '#b98643', edge: '#f1cc79', inset: '#482919' },
    rail: { front: '#56311e', back: '#301c16', top: '#bd8240',
      frontEdge: '#251922', backEdge: '#211820', topEdge: '#6e4a32',
      post: '#8c4b24', lamp: '#ffe0a0', upper: '#79401e', lower: '#3a2117',
      outline: '#251a21', upperLight: '#b56f33', lowerLight: '#684021' }
  };
  const cyberpunk = {
    id: 'cyberpunk',
    roomFilter: 'grayscale(1) brightness(.62) sepia(.7) saturate(2.5) hue-rotate(155deg)',
    chairFilter: 'hue-rotate(270deg) saturate(.85) brightness(.8)',
    assets: { cyberFloor: 'assets/art/cyberpunk-floor.png',
      cyberRug1: 'assets/art/cyberpunk-rug-cyan.png',
      cyberRug2: 'assets/art/cyberpunk-rug-magenta.png' },
    rugs: ['cyberRug1', 'cyberRug2'],
    lights: ['44,232,245', '255,65,185'], sign: '#c7fcff', signGlow: '#1ce6ff',
    poster: { base: '#080d1d', frame: '#194657', edge: '#59f2ff', inset: '#26153e' },
    rail: { front: '#253547', back: '#111a2c', top: '#5c8fa5',
      frontEdge: '#0b1326', backEdge: '#0b1020', topEdge: '#2ce8f5',
      post: '#458497', lamp: '#b6fcff', upper: '#294e64', lower: '#15283d',
      outline: '#0b152c', upperLight: '#47e9f5', lowerLight: '#8260b8' }
  };
  window.VC.CinemaThemes = {
    get: name => name === cyberpunk.id ? cyberpunk : classic
  };
})();
