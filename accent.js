/* Monthly background — shared by every page. See monthlyBg.js. Kept at the TOP so an error further down can never stop it. */
(function(){if(window.__dsMonthlyBgLoader)return;window.__dsMonthlyBgLoader=true;var s=document.createElement("script");s.src="monthlyBg.js";s.defer=true;(document.head||document.documentElement).appendChild(s);})();
/* ── DAWNSCRIBE ACCENT (AURA) ───────────────────────────────────────
   For full-screen tool pages that do NOT load nav.js (chapters.html,
   lorebook.html). nav.js applies the user's aura colour itself; these pages
   never got it and stayed default teal.

   The function below is a verbatim copy of dsApplyAccent() in nav.js — the
   readability clamp and per-theme values must match. If you change one,
   change the other. If nav.js is on the page it wins (loaded later, same id).
   Load this in <head> so there is no teal flash.
──────────────────────────────────────────────────────────────────── */
/* ── AURA GLOW ON THE HEADER BAR ──────────────────────────────────
   Pages without nav.js (admin pages, auth, legal pages, chapters, lorebook)
   never had the header glow. Same look as the block in nav.js: the user's
   aura washes in from both ends of the bar and fades out before the middle.
   Keep the two in step.

   Every rule is wrapped in :where(), which weighs nothing, so a page's own
   nav rules always win: a sticky header stays sticky, and a dropdown that
   is positioned absolutely stays where it is. */
(function () {
  if (document.getElementById('ds-aura-glow')) return;
  var css =
    ':where(nav){position:relative;--aura-a:0.22;}' +
    ':where(html[data-theme="light"]) :where(nav){--aura-a:0.34;}' +
    ':where(nav > *){position:relative;z-index:1;}' +
    ':where(nav)::before,:where(nav)::after{content:"";position:absolute;top:0;bottom:0;max-width:340px;pointer-events:none;z-index:0;}' +
    ':where(nav)::before{left:0;width:20%;background:linear-gradient(to right,rgba(var(--aura-rgb,45,212,191),var(--aura-a)),rgba(var(--aura-rgb,45,212,191),0) 100%);}' +
    ':where(nav)::after{right:0;width:26%;background:linear-gradient(to left,rgba(var(--aura-rgb,45,212,191),var(--aura-a)),rgba(var(--aura-rgb,45,212,191),0) 100%);}' +
    '@supports (background: color-mix(in srgb, red 50%, white)){' +
      ':where(nav){--aura-glow:color-mix(in srgb,rgb(var(--aura-rgb,45,212,191)) 62%,#ffffff);}' +
      ':where(html[data-theme="light"]) :where(nav){--aura-glow:color-mix(in srgb,rgb(var(--aura-rgb,45,212,191)) 78%,#000000);}' +
      ':where(nav)::before{background:linear-gradient(to right,color-mix(in srgb,var(--aura-glow) calc(var(--aura-a) * 100%),transparent),transparent 100%);}' +
      ':where(nav)::after{background:linear-gradient(to left,color-mix(in srgb,var(--aura-glow) calc(var(--aura-a) * 100%),transparent),transparent 100%);}' +
    '}';
  var st = document.createElement('style');
  st.id = 'ds-aura-glow';
  st.textContent = css;
  // Prepended, so anything the page itself writes comes later and wins.
  (document.head || document.documentElement).insertBefore(st, (document.head || document.documentElement).firstChild);
})();

(function () {
if (window.dsApplyAccent) return;
function dsApplyAccent(hex) {
  var existing = document.getElementById('ds-accent-override');
  if (existing) existing.remove();
  if (!hex) return;

  /* ── Readability clamp ──────────────────────────────────────────
     The accent is a user-chosen colour but it carries body-sized text:
     links, titles, tab labels. A pale pick lands below the 4.5:1 WCAG AA
     floor and the user has no way to know why their site got hard to read.

     So we keep the HUE they chose and darken (light theme) or lighten
     (dark/dim themes) only as far as needed to clear the floor against
     that theme's page background. A colour that already passes is left
     completely untouched — most picks never move at all.

     Per-theme because the requirement inverts: on a light canvas the
     accent must be dark enough, on a dark canvas light enough. The same
     hex cannot satisfy both, which is why each theme gets its own value. */

  function dsHexToRgb(h) {
    h = String(h || '').replace('#','');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  }
  function dsRgbToHex(c) {
    return '#' + [c.r,c.g,c.b].map(function(v){
      return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0');
    }).join('');
  }
  function dsRelLum(c) {
    var f = function(v){ v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
  }
  function dsContrast(a, b) {
    var l1 = dsRelLum(a), l2 = dsRelLum(b);
    return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
  }
  // Scale toward black or white in small steps, preserving hue direction.
  function dsClampAccent(hexIn, bgHex, target) {
    var c = dsHexToRgb(hexIn), bg = dsHexToRgb(bgHex);
    if (!c || !bg) return hexIn;
    if (dsContrast(c, bg) >= target) return hexIn;   // already fine: do not touch
    var darken = dsRelLum(bg) > 0.5;                 // light canvas -> darken the accent
    var best = c;
    for (var i = 1; i <= 40; i++) {
      var t = i / 40;
      var cand = darken
        ? { r: c.r*(1-t), g: c.g*(1-t), b: c.b*(1-t) }
        : { r: c.r+(255-c.r)*t, g: c.g+(255-c.g)*t, b: c.b+(255-c.b)*t };
      best = cand;
      if (dsContrast(cand, bg) >= target) break;
    }
    return dsRgbToHex(best);
  }

  var AA = 4.5;
  // Clamp against each theme's WORST surface, not its page background. Accent text
  // mostly sits inside cards (--bg2/--bg3/--bg4), which are lighter than --bg on a
  // dark theme and darker than --bg on a light one. Clamping to --bg alone cleared
  // 4.5 on the page and still failed everywhere it actually appears — measured at
  // 3.53 against --bg4 on a story page.
  var accentDark  = dsClampAccent(hex, '#22223a', AA);   // dark : lightest surface
  var accentDim   = dsClampAccent(hex, '#34344c', AA);   // dim  : lightest surface
  var accentLight = dsClampAccent(hex, '#d8d8e8', AA);   // light: darkest surface

  // --accent2 stays the "one shade further" companion it always was.
  function dsShade(h) {
    var c = dsHexToRgb(h); if (!c) return h;
    var lighten = dsRelLum(c) < 0.25;                 // very dark accents shade upward
    return dsRgbToHex(lighten
      ? { r: c.r+20, g: c.g+20, b: c.b+20 }
      : { r: c.r-30, g: c.g-30, b: c.b-30 });
  }

  // --accent-rgb is the bare "r, g, b" triple for rgba(var(--accent-rgb), a)
  // tints. It was used in three places in the welcome modal but never defined
  // anywhere, so those rules were invalid CSS and rendered nothing.
  function dsRgbTriple(h) {
    var c = dsHexToRgb(h);
    return c ? (c.r + ', ' + c.g + ', ' + c.b) : '45, 212, 191';
  }

  // --aura-rgb is the UNCLAMPED colour the user picked, for decoration only:
  // glows and washes. --accent below is clamped for text contrast and shifts
  // hue to do it, so it must not be used for decoration. Keep in step with
  // the identical block in nav.js.
  var st = document.createElement('style');
  st.id = 'ds-accent-override';
  st.textContent =
    ':root { --aura-rgb: ' + dsRgbTriple(hex) + ' !important; }' +
    ':root { --accent: ' + accentDark + ' !important; --accent2: ' + dsShade(accentDark) + ' !important; --accent-rgb: ' + dsRgbTriple(accentDark) + ' !important; }' +
    'html[data-theme="dim"] { --accent: ' + accentDim + ' !important; --accent2: ' + dsShade(accentDim) + ' !important; --accent-rgb: ' + dsRgbTriple(accentDim) + ' !important; }' +
    'html[data-theme="light"] { --accent: ' + accentLight + ' !important; --accent2: ' + dsShade(accentLight) + ' !important; --accent-rgb: ' + dsRgbTriple(accentLight) + ' !important; }';
  document.head.appendChild(st);
}
// Pages used to hand-roll their own #ds-accent-override style from the raw
// stored hex. Those copies had no readability clamp and no per-theme values, so
// they silently undid this one. Expose the real applier so a page can just call it.
window.dsApplyAccent = dsApplyAccent;
(function(){ var c = localStorage.getItem('ds_accent_hex'); if (c) dsApplyAccent(c); })();
// Aura changed in another tab (avatar page) — follow it without a reload.
window.addEventListener('storage', function (e) {
  if (e.key === 'ds_accent_hex') dsApplyAccent(e.newValue || null);
});
})();

