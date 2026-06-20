/* ── DAWNSCRIBE SPOILER UTILITIES ──────────────────────────────────
   Load BEFORE any inline scripts that render comment/review content.
   Provides Discord-style ||spoiler text|| inline spoiler markup:
   parsed at render time into a blurred, click-to-reveal span.
──────────────────────────────────────────────────────────────────── */
window.dsSpoiler = (function () {

  // Reads the user's "Blur Spoilers" preference (default ON — protect by default)
  function enabled() {
    try {
      var misc = localStorage.getItem('ds_settings_misc');
      if (!misc) return true;
      var parsed = JSON.parse(misc);
      return parsed.spoilers !== undefined ? !!parsed.spoilers : true;
    } catch (e) { return true; }
  }

  // Takes ALREADY-HTML-ESCAPED text (so this never introduces XSS) and
  // converts any ||...|| pairs into spoiler spans. Safe to call on plain
  // text too — if there's no ||..|| pairing, it returns the input unchanged.
  function render(escapedHtml) {
    if (!escapedHtml) return escapedHtml;
    if (!enabled()) {
      // Spoiler protection is off — just strip the markers, show plain text
      return escapedHtml.replace(/\|\|([\s\S]+?)\|\|/g, '$1');
    }
    return escapedHtml.replace(/\|\|([\s\S]+?)\|\|/g,
      '<span class="ds-spoiler" title="Click to reveal spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
  }

  // Whether raw (unescaped) input text contains spoiler markup
  function hasMarkup(raw) {
    return !!raw && /\|\|([\s\S]+?)\|\|/.test(raw);
  }

  // Wraps the current selection of a <textarea>/<input> in || ||, or inserts
  // a placeholder at the cursor if nothing is selected. Returns focus to the field.
  function wrapSelection(field) {
    if (!field) return;
    var start = field.selectionStart, end = field.selectionEnd;
    var val = field.value;
    var selected = val.slice(start, end);
    var insertText = selected ? '||' + selected + '||' : '||spoiler text||';
    field.value = val.slice(0, start) + insertText + val.slice(end);
    field.focus();
    if (selected) {
      field.selectionStart = start;
      field.selectionEnd = start + insertText.length;
    } else {
      // Select the placeholder word so typing immediately replaces it
      field.selectionStart = start + 2;
      field.selectionEnd = start + insertText.length - 2;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return { enabled: enabled, render: render, hasMarkup: hasMarkup, wrapSelection: wrapSelection };
})();

// Inject shared spoiler styling once
(function(){
  if (document.getElementById('ds-spoiler-style')) return;
  var style = document.createElement('style');
  style.id = 'ds-spoiler-style';
  style.textContent =
    '.ds-spoiler{filter:blur(5px);cursor:pointer;border-radius:3px;background:rgba(120,120,160,0.12);transition:filter 0.2s;user-select:none;}' +
    '.ds-spoiler.revealed{filter:blur(0);cursor:text;background:transparent;user-select:text;}' +
    '.spoiler-btn{display:inline-flex;align-items:center;gap:4px;background:transparent;border:1px solid var(--border,rgba(255,255,255,0.1));color:var(--text3,#9b9bc0);border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;transition:all 0.15s;}' +
    '.spoiler-btn:hover{border-color:var(--accent,#2dd4bf);color:var(--accent,#2dd4bf);}' +
    '.spoiler-btn.active{border-color:var(--accent,#2dd4bf);color:var(--accent,#2dd4bf);background:rgba(45,212,191,0.08);}';
  document.head.appendChild(style);
})();
