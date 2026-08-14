/* escapeUtils.js — DawnScribe shared output-encoding helpers (window.DSEscape)
 *
 * WHY THIS EXISTS
 * Five files rolled their own escaper and five got it wrong in five different ways:
 *   nav.js               esc() was fine, but dsIlikeEsc reached only 2 of 5 search sites
 *   messages.html        esc() escaped " but not '
 *   marketplace.html     esc() escaped " but not '
 *   collab-*.html        esc() escaped " but not '; JSON.stringify sat raw in an attribute
 *   characterTitles.js   esc() escaped NEITHER quote, across ~112 sinks
 *   chapters.html        no HTML escaper at all — escXml (an XML escaper) stood in
 *   publish.html         escHtml(x).replace(/'/g,"\\'") — a silent no-op
 *
 * The rule that keeps getting missed: THE CONTEXT DECIDES THE ENCODING.
 * Escaping is not one function. Pick by where the value lands.
 *
 *   text between tags ............ esc()
 *   quoted HTML attribute ........ esc()
 *   inside an on* handler ........ attrJson()      <-- esc() IS NOT ENOUGH
 *   href / src ................... safeUrl() then esc()
 *   colour in a style attribute .. safeHex()
 *   PostgREST .ilike() pattern ... likeEsc()
 *   .docx / XML export ........... escXml()
 */
(function (global) {
  'use strict';

  /* Text and quoted-attribute contexts. Escapes BOTH quotes — a single-quoted
   * attribute is just as real as a double-quoted one, and half the bugs above
   * came from escaping only one. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* A JS string literal safe inside an on* attribute.
   *
   * THIS IS THE ONE THAT KEEPS BITING. You cannot get here with esc() alone.
   * An on* attribute is parsed TWICE: the HTML parser reads the attribute value
   * and decodes entities, THEN the JS parser reads what is left. So &#39; is
   * decoded back to a raw quote before JS ever sees it, and a value escaped only
   * as HTML escapes its own string literal:
   *
   *   BROKEN  onclick="f('" + esc(title) + "')"
   *           title = "a',alert(1),'"  ->  f('a',alert(1),'')      executes
   *
   * Two layers, in this order: JSON.stringify handles the JS layer (quotes,
   * backslashes, newlines), then entity-encoding handles the HTML layer.
   *
   *   CORRECT onclick="f(" + attrJson(title) + ")"
   *           title = "a',alert(1),'"  ->  f("a',alert(1),'")      inert string
   *
   * Note attrJson supplies its own quotes — do not wrap the call site in more.
   */
  function attrJson(v) {
    return JSON.stringify(v === undefined ? null : v)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* Anything reaching href or src. esc() does NOT stop javascript:, and a
   * javascript: URL in an <a href> executes on click. Allow only http(s) and
   * site-relative; anything else becomes '' so the caller can branch on falsy. */
  function safeUrl(u) {
    u = String(u == null ? '' : u).trim();
    return /^(https?:\/\/|\/)/i.test(u) ? u : '';
  }

  /* Colour values reaching a style attribute. Arbitrary text there breaks out of
   * the attribute; only a literal 6-digit hex is allowed through. */
  function safeHex(v) {
    v = String(v == null ? '' : v).trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '';
  }

  /* PostgREST .ilike() patterns. % and _ are wildcards: unescaped user input
   * silently changes what the query matches. Not an injection, a correctness bug. */
  function likeEsc(s) {
    return String(s == null ? '' : s).replace(/[\\%_]/g, '\\$&');
  }

  /* XML/.docx export only — deliberately does NOT touch quotes, because the
   * export path builds its own attribute quoting. Never use this for HTML. */
  function escXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  global.DSEscape = {
    esc: esc,
    attrJson: attrJson,
    safeUrl: safeUrl,
    safeHex: safeHex,
    likeEsc: likeEsc,
    escXml: escXml
  };
})(window);
