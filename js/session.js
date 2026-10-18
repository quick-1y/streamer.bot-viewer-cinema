/* Local OBS browser-source continuity. No passwords or connection credentials are stored. */
(function () {
  'use strict';
  const VC = window.VC;
  const MAX_AGE = 12 * 60 * 60 * 1000;
  VC.AudienceSession = class {
    constructor(config, audience) {
      this.audience = audience;
      this.enabled = config.rememberAudience !== false;
      this.key =
        'viewer-cinema:audience:v1:' +
        JSON.stringify([
          config.url,
          !!config.demo,
          config.maxSeats,
          !!config.hideBroadcaster,
          (config.ignore || []).slice().sort()
        ]);
    }
    restore() {
      if (!this.enabled) return false;
      try {
        const raw = localStorage.getItem(this.key);
        if (!raw || raw.length > 512000) return false;
        const state = JSON.parse(raw);
        const age = Date.now() - state.savedAt;
        if (!Number.isFinite(age) || age < 0 || age > MAX_AGE) return false;
        return this.audience.restoreState(state, age);
      } catch (_) {
        // CEF/private browsers may deny storage; live operation still works.
        return false;
      }
    }
    save() {
      if (!this.enabled || !this.audience.hasSnapshot) return;
      try {
        localStorage.setItem(this.key, JSON.stringify(this.audience.exportState()));
      } catch (_) {
        /* Storage denial or quota must never interrupt the overlay. */
      }
    }
  };
})();
