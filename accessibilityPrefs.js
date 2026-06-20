/* ── DAWNSCRIBE ACCESSIBILITY PREFERENCES ──────────────────────────
   Reads the reduced-motion / high-contrast preferences saved in
   settings.html and applies them on every page. Self-contained: injects
   its own CSS so no page-specific stylesheet changes are needed.
──────────────────────────────────────────────────────────────────── */
(function () {
  function readPrefs() {
    try {
      var misc = localStorage.getItem('ds_settings_misc');
      if (!misc) return { reduced_motion: false, high_contrast: false };
      var parsed = JSON.parse(misc);
      return {
        reduced_motion: !!parsed.pref_reduced_motion,
        high_contrast: !!parsed.pref_high_contrast
      };
    } catch (e) { return { reduced_motion: false, high_contrast: false }; }
  }

  function injectStyle() {
    if (document.getElementById('ds-accessibility-style')) return;
    var style = document.createElement('style');
    style.id = 'ds-accessibility-style';
    style.textContent =
      'html.ds-reduced-motion *, html.ds-reduced-motion *::before, html.ds-reduced-motion *::after {' +
      'animation-duration:0.001ms !important;animation-iteration-count:1 !important;' +
      'transition-duration:0.001ms !important;scroll-behavior:auto !important;}' +
      'html.ds-high-contrast{--text2:var(--text);--text3:#c8c8d8;--border:#6a6a8a;}';
    document.head.appendChild(style);
  }

  function apply() {
    injectStyle();
    var prefs = readPrefs();
    document.documentElement.classList.toggle('ds-reduced-motion', prefs.reduced_motion);
    document.documentElement.classList.toggle('ds-high-contrast', prefs.high_contrast);
  }

  // Apply as early as possible, then re-check after full load in case
  // localStorage was populated by a settings sync that ran after this fired.
  apply();
  document.addEventListener('DOMContentLoaded', apply);
})();
