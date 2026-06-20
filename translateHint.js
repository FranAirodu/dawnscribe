/* ── DAWNSCRIBE TRANSLATE HINT ─────────────────────────────────────
   Shows a small dismissible banner pointing readers to their browser's
   built-in translate feature when a story isn't in their language.
   Zero-cost — relies entirely on the reader's own browser (Chrome/Edge
   built-in translate, Safari Translate, etc.), no API or backend involved.
──────────────────────────────────────────────────────────────────── */
window.dsTranslateHint = (function () {
  var LANG_NAMES = {
    en: 'English', pt: 'Portuguese', es: 'Spanish', fr: 'French', de: 'German',
    ja: 'Japanese', ko: 'Korean', zh: 'Chinese', id: 'Indonesian'
  };

  // Inserts the hint banner into `container` (prepended) if the work's language
  // differs from English and from the reader's own browser language, and the
  // reader hasn't dismissed it before. Returns the banner element, or null.
  function show(container, langCode) {
    if (!container || !langCode || langCode === 'en' || !LANG_NAMES[langCode]) return null;
    try {
      if (localStorage.getItem('ds_translate_hint_dismissed')) return null;
    } catch (e) {}

    var myLang = ((navigator.language || navigator.userLanguage || 'en') + '').split('-')[0].toLowerCase();
    if (myLang === langCode) return null; // reader's browser is already in that language

    var langName = LANG_NAMES[langCode];
    var bar = document.createElement('div');
    bar.id = 'ds-translate-hint';
    bar.style.cssText = 'position:relative;background:rgba(45,212,191,0.08);border:1px solid rgba(45,212,191,0.25);' +
      'border-radius:10px;padding:10px 38px 10px 14px;margin:0 0 16px;font-size:13px;line-height:1.5;' +
      'color:var(--text2,#9b9bc0);display:flex;align-items:flex-start;gap:8px;';
    bar.innerHTML =
      '<i class="ti ti-language" style="color:var(--accent,#2dd4bf);font-size:17px;flex-shrink:0;margin-top:1px;"></i>' +
      '<span>This story is in ' + langName + '. Your browser can translate it for you — look for a translate icon ' +
      'in your address bar, or right-click the page and choose "Translate to&hellip;".</span>' +
      '<button type="button" aria-label="Dismiss" title="Don\'t show this again" ' +
      'style="position:absolute;top:6px;right:8px;background:none;border:none;color:var(--text3,#5a5a80);' +
      'cursor:pointer;font-size:18px;line-height:1;padding:4px;">&times;</button>';

    bar.querySelector('button').addEventListener('click', function () {
      try { localStorage.setItem('ds_translate_hint_dismissed', '1'); } catch (e) {}
      bar.remove();
    });

    container.insertBefore(bar, container.firstChild);
    return bar;
  }

  return { show: show };
})();
