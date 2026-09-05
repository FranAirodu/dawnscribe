/* ── DAWNSCRIBE SHARED NAV ─────────────────────────────────────────
   Include this file on every page AFTER the Supabase client is set up.
   The page must have a <nav> element. This script appends the right-side
   controls (DM, notifications, avatar/dropdown, search) to that nav,
   injects the required CSS, and runs all auth-dependent logic.
──────────────────────────────────────────────────────────────────── */

// Apply cached accent color immediately so there's no teal flash.
// Accessibility prefs (Reduced Motion / High Contrast) — applied here so every
// page that loads nav.js gets them automatically, no per-page script tag needed.
(function () {
  try {
    var misc = localStorage.getItem('ds_settings_misc');
    var prefs = misc ? JSON.parse(misc) : {};
    if (!document.getElementById('ds-accessibility-style')) {
      var style = document.createElement('style');
      style.id = 'ds-accessibility-style';
      style.textContent =
        'html.ds-reduced-motion *, html.ds-reduced-motion *::before, html.ds-reduced-motion *::after {' +
        'animation-duration:0.001ms !important;animation-iteration-count:1 !important;' +
        'transition-duration:0.001ms !important;scroll-behavior:auto !important;}' +
        'html.ds-high-contrast{--text2:var(--text);--text3:#c8c8d8;--border:#6a6a8a;}';
      document.head.appendChild(style);
    }
    document.documentElement.classList.toggle('ds-reduced-motion', !!prefs.pref_reduced_motion);
    document.documentElement.classList.toggle('ds-high-contrast', !!prefs.pref_high_contrast);
  } catch (e) {}
})();

// Defensive fallback: if spoilerUtils.js wasn't included on this page for any
// reason, don't let comment previews error out — just strip the || markers.
if (!window.dsSpoiler) {
  window.dsSpoiler = {
    render: function(html){ return html ? html.replace(/\|\|([\s\S]+?)\|\|/g, '$1') : html; },
    enabled: function(){ return false; }
  };
}

// Checks whether "right now" falls inside the user's Quiet Hours window,
// handling overnight ranges (e.g. 22:00 -> 08:00) correctly.
// ── OWN PRIVATE PROFILE FIELDS ───────────────────────────────────────────────
// These `profiles` columns are no longer column-granted: readable there, they
// exposed every user's notification prefs, content filters, timezone, payout
// status and hidden gender/location to anyone via PostgREST, and could be used
// as filter oracles. The owner reads them through this SECURITY DEFINER RPC,
// scoped to auth.uid(). Field names are unchanged, so callers are unchanged.
async function dsMyPrivate() {
  try {
    var r = await db.rpc('get_my_private_profile');
    if (r && r.error) return { data: null, error: r.error };
    var rows = r ? r.data : null;
    return { data: (rows && rows.length) ? rows[0] : null, error: null };
  } catch (e) { return { data: null, error: e }; }
}


// ── SEARCH PREVIEW FILTERING ─────────────────────────────────────────────────
// The nav search dropdown reaches the whole published catalogue, so it is a
// discovery surface and must respect the same settings browse and search do:
// mature ratings, content warnings, blocked tags and language. It previously
// applied none of them.
var dsSearchPrefs = null;
async function dsLoadSearchPrefs() {
  if (dsSearchPrefs) return dsSearchPrefs;
  // Restrictive defaults until the profile loads, so nothing leaks on a slow
  // network or for a failed read.
  var p = { safe: true, gore: false, erotica: false, warnings: [], tags: {},
            lang: 'any', langStrict: false, langOriginal: true, loaded: false };
  try {
    var res = await dsMyPrivate();
    var row = res ? res.data : null;
    if (row) {
      p.safe    = row.settings_filter_safe === true;
      p.gore    = row.settings_filter_gore !== false;
      p.erotica = row.settings_filter_erotica !== false;
      p.warnings = Array.isArray(row.filtered_content_warnings) ? row.filtered_content_warnings : [];
      p.tags = (row.tag_prefs && typeof row.tag_prefs === 'object') ? row.tag_prefs : {};
      if (row.pref_story_language) p.lang = row.pref_story_language;
      p.langStrict   = row.lang_strict === true;
      p.langOriginal = row.lang_original !== false;
    } else {
      // Signed out: no preferences exist, so show everything rather than nothing.
      p = { safe:false, gore:true, erotica:true, warnings:[], tags:{},
            lang:'any', langStrict:false, langOriginal:true, loaded:true };
    }
    p.loaded = true;
  } catch (e) { /* keep restrictive defaults */ }
  dsSearchPrefs = p;
  return p;
}

// Applies every discovery filter to a works query for the search preview.
function dsFilterSearchQuery(q, p) {
  /* Muted authors. The search preview is the single most-loaded surface on
     the site, and Settings promises muting hides work from "your feeds and
     search" — so it belongs here. Server-side via the is_muted_for_me
     computed column, so muted rows never reach the browser. */
  if (window.DSMute) q = DSMute.filterQuery(q);
  if (p.safe || !p.gore)    q = q.neq('content_rating_gore', true);
  if (p.safe || !p.erotica) q = q.neq('content_rating_erotica', true);
  (p.warnings || []).forEach(function (w) {
    q = q.not('content_warnings', 'cs', JSON.stringify([w]));
  });
  Object.keys(p.tags || {}).forEach(function (t) {
    if (p.tags[t] !== 'blocked') return;
    q = q.not('tags_all', 'ilike', '%"' + String(t).replace(/"/g, '').replace(/([%_\\])/g, '\\$1') + '"%');
  });
  if (!p.langOriginal) q = q.neq('is_fan_translation', true);
  if (p.langStrict && p.lang !== 'any') q = q.eq('language', p.lang);
  return q;
}

function dsIsWithinQuietHours(prefRow) {
  if (!prefRow || prefRow.quiet_hours_enabled !== true) return false;
  var start = prefRow.quiet_hours_start || '22:00';
  var end = prefRow.quiet_hours_end || '08:00';
  var now = new Date();
  var nowMins = now.getHours() * 60 + now.getMinutes();
  var sParts = start.split(':'); var eParts = end.split(':');
  var startMins = (parseInt(sParts[0],10)||0) * 60 + (parseInt(sParts[1],10)||0);
  var endMins = (parseInt(eParts[0],10)||0) * 60 + (parseInt(eParts[1],10)||0);
  if (startMins === endMins) return false;
  if (startMins < endMins) return nowMins >= startMins && nowMins < endMins;
  // Overnight window (e.g. 22:00 -> 08:00) wraps past midnight
  return nowMins >= startMins || nowMins < endMins;
}
function dsIsQuiet(prefRow) {
  return !!(prefRow && (prefRow.quiet_mode === true || dsIsWithinQuietHours(prefRow)));
}

function dsApplyAccent(hex) {
  var existing = document.getElementById('ds-accent-override');
  if (existing) existing.remove();
  if (!hex) return;
  var d = hex.replace('#','');
  var r = Math.max(0, parseInt(d.slice(0,2),16) - 30);
  var g = Math.max(0, parseInt(d.slice(2,4),16) - 30);
  var b = Math.max(0, parseInt(d.slice(4,6),16) - 30);
  var hex2 = '#' + [r,g,b].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
  var st = document.createElement('style');
  st.id = 'ds-accent-override';
  st.textContent = ':root { --accent: ' + hex + ' !important; --accent2: ' + hex2 + ' !important; } html[data-theme="light"] { --accent: ' + hex + ' !important; --accent2: ' + hex2 + ' !important; }';
  document.head.appendChild(st);
}
(function(){ var c = localStorage.getItem('ds_accent_hex'); if (c) dsApplyAccent(c); })();

(function() {

  /* ── CSS ─────────────────────────────────────────────────────── */
  var css = `
    :root { --accent: #2dd4bf; --accent2: #0d9488; --gold: #f59e0b; }
    html[data-theme="light"] { --accent: #0d9488; --accent2: #0f766e; --gold: #d97706; }
    .ember-wrap { display: flex; align-items: center; gap: 6px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: #f97316; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s, transform 0.2s; }
    .ember-wrap:hover { border-color: #f97316; }
    .ember-wrap i { font-size: 16px; }
    .ember-count { color: var(--text); font-family: 'Lato', sans-serif; font-size: 13px; }
    .quill-wrap { display: flex; align-items: center; gap: 6px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--gold); font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s, transform 0.2s; }
    .quill-wrap:hover { border-color: var(--gold); }
    .quill-wrap i { font-size: 16px; }
    .quill-count { color: var(--text); font-family: 'Lato', sans-serif; font-size: 13px; }
    .dm-wrap { position: relative; }
    .dm-btn { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text2); font-size: 18px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; position: relative; text-decoration: none; }
    .dm-btn.has-unread { border-color: var(--accent); color: var(--accent); background: rgba(45,212,191,0.08); }
    .dm-btn:hover { border-color: var(--accent); color: var(--accent); }
    .dm-badge { position: absolute; top: -6px; right: -6px; background: var(--accent2); color: white; font-size: 10px; font-weight: 700; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .notif-wrap { position: relative; }
    .notif-btn { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text2); font-size: 18px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; position: relative; }
    .notif-btn:hover { border-color: var(--accent); color: var(--accent); }
    .notif-badge { position: absolute; top: -6px; right: -6px; background: var(--red,#f87171); color: white; font-size: 10px; font-weight: 700; width: 18px; height: 18px; border-radius: 50%; display: none; align-items: center; justify-content: center; }
    .notif-dropdown { display: none; position: absolute; top: calc(100% + 10px); right: 0; width: 340px; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; z-index: 400; box-shadow: 0 16px 40px rgba(0,0,0,0.4); animation: ds-fadeDown 0.15s ease; overflow: hidden; }
    .notif-dropdown.open { display: block; }
    .notif-tabs { display: flex; background: var(--bg); border-bottom: 1px solid var(--border); padding: 4px; gap: 4px; }
    .notif-tab { flex: 1; padding: 8px 4px; border: none; border-radius: 6px; font-size: 11px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; transition: all 0.2s; background: transparent; color: var(--text3); display: flex; align-items: center; justify-content: center; gap: 4px; }
    .notif-tab:hover { color: var(--text2); }
    .notif-tab.active { background: var(--bg2); color: var(--accent); }
    .notif-tab-badge { background: var(--red,#f87171); color: white; font-size: 9px; font-weight: 700; min-width: 16px; height: 16px; border-radius: 8px; padding: 0 4px; display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
    .notif-panel { display: none; }
    .notif-panel.active { display: block; }
    .notif-feed { max-height: 320px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
    .notif-feed::-webkit-scrollbar { width: 4px; }
    .notif-feed::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 4px; }
    .notif-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px; border-radius: 8px; background: var(--bg3); transition: background 0.15s; }
    .notif-item.unread { background: rgba(45,212,191,0.05); border: 1px solid rgba(45,212,191,0.1); }
    .notif-cover { width: 36px; height: 36px; border-radius: 6px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: white; overflow: hidden; }
    .notif-body { flex: 1; min-width: 0; }
    .notif-title { font-size: 12px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .notif-text { font-size: 11px; color: var(--text3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .notif-time { font-size: 10px; color: var(--text3); margin-top: 3px; display: flex; align-items: center; gap: 3px; }
    .notif-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; margin-top: 4px; }
    .notif-footer { padding: 10px 12px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .mark-read-btn { background: transparent; border: none; color: var(--text3); font-size: 11px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; display: flex; align-items: center; gap: 4px; }
    .mark-read-btn:hover { color: var(--accent); }
    .view-all-notif { font-size: 11px; font-weight: 700; color: var(--accent); text-decoration: none; display: flex; align-items: center; gap: 4px; }
    .nav-login-btn { background: transparent; border: 1px solid var(--border); border-radius: 8px; padding: 8px 16px; color: var(--text2); font-size: 13px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; transition: all 0.2s; text-decoration: none; display: flex; align-items: center; }
    .nav-login-btn:hover { border-color: var(--accent); color: var(--accent); }
    .user-nav-wrap { position: relative; display: none; }
    .user-avatar-btn { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg,#1e0040,#6b21a8); border: 2px solid rgba(45,212,191,0.4); display: flex; align-items: center; justify-content: center; font-family: 'Cinzel', serif; font-size: 15px; font-weight: 700; color: #c084fc; cursor: pointer; overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s; flex-shrink: 0; }
    .user-avatar-btn:hover { border-color: var(--accent); }
    .user-avatar-btn img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    /* gold aura on avatar removed — pending items now live in notifications page */
    .collab-pending-pill { margin-left: auto; background: #f59e0b; color: #0a0a0f; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 1px 7px; letter-spacing: 0.5px; white-space: normal; max-width: 150px; line-height: 1.4; text-align: right; }
    .user-dropdown { display: none; position: absolute; top: calc(100% + 10px); right: 0; width: 260px; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; z-index: 400; box-shadow: 0 16px 40px rgba(0,0,0,0.5); animation: ds-fadeDown 0.15s ease; overflow: hidden; }
    .user-dropdown.open { display: block; }
    .user-dropdown-header { padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
    .user-dropdown-name { font-size: 14px; font-weight: 700; color: var(--text); }
    .user-dropdown-handle { font-size: 12px; color: var(--text3); margin-top: 1px; }
    .user-dropdown-menu { padding: 6px; }
    .user-dropdown-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; color: var(--text2); font-size: 13px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; transition: all 0.15s; text-decoration: none; border: none; background: none; width: 100%; text-align: left; }
    .user-dropdown-item:hover { background: var(--bg3); color: var(--accent); }
    .user-dropdown-item i { font-size: 16px; color: var(--text3); flex-shrink: 0; }
    .user-dropdown-item:hover i { color: var(--accent); }
    .user-dropdown-divider { height: 1px; background: var(--border); margin: 4px 8px; }
    .dd-accordion-trigger { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px 4px; cursor: pointer; user-select: none; border: none; background: none; width: 100%; text-align: left; }
    .dd-accordion-trigger:hover .dd-acc-label { color: var(--text2); }
    .dd-acc-label { font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: .8px; transition: color 0.15s; }
    .dd-acc-chevron { font-size: 12px; color: var(--text3); transition: transform 0.2s; }
    .dd-accordion-trigger.open .dd-acc-chevron { transform: rotate(180deg); }
    .dd-accordion-body { overflow: hidden; max-height: 0; transition: max-height 0.25s ease; }
    .dd-accordion-body.open { max-height: 500px; }
    .signout-btn { color: var(--red,#f87171) !important; }
    .signout-btn i { color: var(--red,#f87171) !important; }
    .search-dropdown-wrap { position: relative; }
    .search-trigger-btn { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text2); font-size: 13px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
    .search-trigger-btn:hover { border-color: var(--accent); color: var(--accent); }
    .search-trigger-btn i { font-size: 16px; }
    .search-dropdown { display: none; position: absolute; top: calc(100% + 10px); right: 0; width: 340px; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 16px; z-index: 400; box-shadow: 0 16px 40px rgba(0,0,0,0.4); animation: ds-fadeDown 0.15s ease; }
    .search-dropdown.open { display: block; }
    .search-section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text3); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .search-field { display: flex; align-items: center; gap: 6px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; margin-bottom: 6px; transition: border-color 0.2s; }
    .search-field:focus-within { border-color: var(--accent); }
    .search-field i { color: var(--text3); font-size: 15px; flex-shrink: 0; }
    .search-input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-size: 13px; font-family: 'Lato', sans-serif; }
    .search-input::placeholder { color: var(--text3); }
    .search-go-btn { background: var(--accent2); border: none; border-radius: 5px; padding: 3px 9px; color: white; font-size: 11px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; flex-shrink: 0; }
    .search-divider { height: 1px; background: var(--border); margin: 10px 0; }
    .search-preview { display: none; margin-bottom: 4px; border-radius: 8px; overflow: hidden; }
    .search-preview.visible { display: block; }
    .search-preview-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; transition: background 0.15s; text-decoration: none; }
    .search-preview-item:hover { background: var(--bg3); }
    .search-preview-cover { width: 28px; height: 28px; border-radius: 4px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: white; overflow: hidden; }
    .search-preview-info { flex: 1; min-width: 0; }
    .search-preview-title { font-size: 12px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .search-preview-sub { font-size: 10px; color: var(--text3); }
    .search-preview-spinner { padding: 8px; text-align: center; color: var(--text3); }
    .search-section.collapsed { opacity: 0.4; pointer-events: none; }
    /* ── Daily Check-In (click-to-claim) ── */
    .checkin-btn { position: relative; display: none; align-items: center; justify-content: center; width: 38px; height: 38px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; color: var(--gold); font-size: 18px; cursor: pointer; transition: all 0.2s; flex-shrink: 0; }
    .checkin-btn:hover { border-color: var(--gold); transform: translateY(-1px); }
    .checkin-btn.claimed { color: var(--text3); opacity: 0.55; }
    .checkin-btn.claimed:hover { border-color: var(--border); transform: none; opacity: 0.8; }
    .checkin-dot { position: absolute; top: -3px; right: -3px; width: 10px; height: 10px; border-radius: 50%; background: var(--gold); display: none; animation: ds-ckPulse 1.8s infinite; }
    @keyframes ds-ckPulse { 0% { box-shadow: 0 0 0 0 rgba(245,197,66,0.6); } 70% { box-shadow: 0 0 0 7px rgba(245,197,66,0); } 100% { box-shadow: 0 0 0 0 rgba(245,197,66,0); } }
    html[data-theme="light"] .checkin-btn { background: #fdf6e0; border-color: rgba(200,150,20,0.35); color: #a16207; }
    html[data-theme="light"] .checkin-btn.claimed { background: var(--bg3); border-color: var(--border); color: var(--text3); }
    .ck-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 3000; display: none; align-items: flex-start; justify-content: center; padding: 56px 16px 24px; overflow-y: auto; }
    .ck-overlay.open { display: flex; animation: ds-fadeDown 0.2s ease; }
    .ck-modal { background: var(--bg2); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 560px; padding: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.45); }
    .ck-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .ck-title { font-size: 18px; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 8px; }
    .ck-title i { color: var(--gold); }
    .ck-close { background: none; border: none; color: var(--text3); font-size: 20px; cursor: pointer; padding: 4px; line-height: 1; }
    .ck-close:hover { color: var(--text); }
    .ck-sub { font-size: 12.5px; color: var(--text3); margin-bottom: 14px; line-height: 1.5; }
    .ck-strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 14px; }
    .ck-tile { position: relative; background: var(--bg3); border: 1px solid var(--border); border-radius: 10px; padding: 8px 3px 7px; text-align: center; transition: all 0.2s; }
    .ck-tile .ck-d { font-size: 9.5px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.3px; }
    .ck-tile .ck-ic { font-size: 18px; margin: 3px 0 1px; color: #f97316; }
    .ck-tile .ck-r { font-size: 11px; font-weight: 800; color: var(--text); line-height: 1.2; }
    .ck-tile .ck-bonus { display: block; font-size: 9px; color: var(--text3); font-weight: 600; margin-top: 1px; }
    .ck-tile.done { opacity: 0.5; }
    .ck-tile.done::after { content: '✓'; position: absolute; top: 3px; right: 5px; color: #22c55e; font-weight: 900; font-size: 11px; }
    .ck-tile.day7 { border-color: rgba(245,197,66,0.4); }
    .ck-tile.day7 .ck-ic { color: var(--gold); }
    .ck-tile.claim { border-color: var(--gold); box-shadow: 0 0 12px rgba(245,197,66,0.25); cursor: pointer; transform: translateY(-2px); }
    .ck-tile.claim:hover { box-shadow: 0 0 18px rgba(245,197,66,0.5); }
    .ck-claim-btn { width: 100%; margin: 0 0 16px; padding: 11px; border: none; border-radius: 10px; background: linear-gradient(135deg, #f5c542, #f97316); color: #1a1208; font-size: 14px; font-weight: 800; cursor: pointer; transition: filter 0.2s; }
    .ck-claim-btn:hover { filter: brightness(1.08); }
    .ck-claim-btn:disabled { opacity: 0.55; cursor: default; filter: none; }
    .ck-repair-wrap { margin-top: 10px; text-align: center; }
    .ck-repair-btn { background: transparent; border: 1px dashed var(--border); border-radius: 9px; padding: 8px 14px; color: var(--text2); font-size: 12px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; }
    .ck-repair-btn:hover { border-color: #fb923c; color: #fb923c; }
    .ck-repair-btn:disabled { opacity: 0.5; cursor: default; }
    .ck-repair-cost { color: var(--gold); font-weight: 800; display: inline-flex; align-items: center; gap: 2px; }
    .ck-cal { border-top: 1px solid var(--border); padding-top: 12px; }
    .ck-cal-title { font-size: 11.5px; font-weight: 800; color: var(--text3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; justify-content: space-between; }
    .ck-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
    .ck-wd { text-align: center; font-size: 10px; font-weight: 700; color: var(--text3); padding-bottom: 2px; }
    .ck-day { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 12px; font-weight: 700; color: var(--text3); background: var(--bg3); border: 1px solid transparent; }
    .ck-day.claimed { background: rgba(245,197,66,0.14); color: var(--gold); border-color: rgba(245,197,66,0.35); }
    .ck-day.missed { opacity: 0.3; }
    .ck-day.future { opacity: 0.6; }
    .ck-day.today { border-color: var(--gold); }
    .ck-day.blank { background: transparent; }
    .ck-foot { margin-top: 12px; font-size: 12px; color: var(--text3); text-align: center; line-height: 1.5; }
    .ck-foot b { color: var(--gold); }
    @keyframes ds-fadeDown { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
  `;
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── NAV HTML ────────────────────────────────────────────────── */
  var navHtml = `
    <div class="quill-wrap" id="quill-wrap" style="display:none;cursor:pointer;" title="Your Quills — spend them in the Marketplace" onclick="window.location.href='marketplace.html'">
      <i class="ti ti-feather"></i>
      <span class="quill-count" id="ds-quill-count">0</span>
    </div>
    <div class="ember-wrap" id="ember-wrap" style="display:none;cursor:pointer;" title="Your embers — spend them in My Avatar" onclick="window.location.href='avatar.html'">
      <i class="ti ti-flame"></i>
      <span class="ember-count" id="ds-ember-count">0</span>
    </div>
    <button class="checkin-btn claimed" id="ds-checkin-btn" title="Daily Check-In" onclick="dsOpenCheckin()">
      <i class="ti ti-sunrise"></i>
      <span class="checkin-dot" id="ds-checkin-dot"></span>
    </button>
    <div class="dm-wrap">
      <a class="dm-btn" href="messages.html" id="dm-btn">
        <i class="ti ti-message"></i>
        <span class="dm-badge" id="dm-badge" style="display:none;"></span>
      </a>
    </div>
    <div class="notif-wrap">
      <button class="notif-btn" onclick="dsToggleNotif()">
        <i class="ti ti-bell"></i>
        <span class="notif-badge" id="ds-notif-badge"></span>
        <i class="ti ti-moon" id="ds-quiet-indicator" title="Quiet Mode is on" style="display:none;position:absolute;top:-2px;right:-2px;font-size:11px;color:var(--accent,#2dd4bf);background:var(--bg2,#1a1a26);border-radius:50%;padding:1px;"></i>
      </button>
      <div class="notif-dropdown" id="notifDropdown">
        <div class="notif-tabs">
          <button class="notif-tab active" id="notif-tab-novels" onclick="dsSwitchNotif('novels')"><i class="ti ti-book"></i> Novels</button>
          <button class="notif-tab" id="notif-tab-artists" onclick="dsSwitchNotif('artists')"><i class="ti ti-palette"></i> Artists</button>
          <button class="notif-tab" id="notif-tab-comments" onclick="dsSwitchNotif('comments')"><i class="ti ti-message-circle"></i> Comments</button>
          <button class="notif-tab" id="notif-tab-activity" onclick="dsSwitchNotif('activity')"><i class="ti ti-bell-ringing"></i> Activity</button>
        </div>
        <div class="notif-panel active" id="notif-novels">
          <div class="notif-feed" id="notif-feed-novels"><div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i></div></div>
          <div class="notif-footer">
            <button class="mark-read-btn" onclick="dsMarkAllRead('novels')"><i class="ti ti-checks"></i> Mark all as read</button>
            <a class="view-all-notif" href="notifications.html#novels">View all <i class="ti ti-arrow-right"></i></a>
          </div>
        </div>
        <div class="notif-panel" id="notif-artists">
          <div class="notif-feed" id="notif-feed-artists"><div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i></div></div>
          <div class="notif-footer">
            <button class="mark-read-btn" onclick="dsMarkAllRead('artists')"><i class="ti ti-checks"></i> Mark all as read</button>
            <a class="view-all-notif" href="notifications.html#artists">View all <i class="ti ti-arrow-right"></i></a>
          </div>
        </div>
        <div class="notif-panel" id="notif-comments">
          <div class="notif-feed" id="notif-feed-comments"><div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i></div></div>
          <div class="notif-footer">
            <button class="mark-read-btn" onclick="dsMarkAllRead('comments')"><i class="ti ti-checks"></i> Mark all as read</button>
            <a class="view-all-notif" href="notifications.html#comments">View all <i class="ti ti-arrow-right"></i></a>
          </div>
        </div>
        <div class="notif-panel" id="notif-activity">
          <div class="notif-feed" id="notif-feed-activity"><div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i></div></div>
          <div class="notif-footer">
            <button class="mark-read-btn" onclick="dsMarkAllRead('activity')"><i class="ti ti-checks"></i> Mark all as read</button>
            <a class="view-all-notif" href="notifications.html#activity">View all <i class="ti ti-arrow-right"></i></a>
          </div>
        </div>
      </div>
    </div>
    <a class="nav-login-btn" href="auth.html" id="nav-login-btn">Log In</a>
    <div class="user-nav-wrap" id="user-nav-wrap">
      <button class="user-avatar-btn" id="user-avatar-btn" onclick="dsToggleUserDropdown()">
        <span id="user-avatar-initial">?</span>
      </button>
      <div class="user-dropdown" id="user-dropdown">
        <div class="user-dropdown-header">
          <div class="user-dropdown-name" id="dd-display-name">My Account</div>
          <div class="user-dropdown-handle" id="dd-handle">@username</div>
        </div>
        <div class="user-dropdown-menu">

          <!-- ── NAVIGATE ─────────────────────────────── -->
          <button class="dd-accordion-trigger open" onclick="dsToggleAccordion(this)" aria-expanded="true">
            <span class="dd-acc-label">Navigate</span>
            <i class="ti ti-chevron-down dd-acc-chevron"></i>
          </button>
          <div class="dd-accordion-body open">
            <a class="user-dropdown-item" id="dd-profile-link" href="profile.html"><i class="ti ti-user"></i> My Profile</a>
            <a class="user-dropdown-item" id="dd-books-link" href="creator.html?tab=novels"><i class="ti ti-book-2"></i> My Books</a>
            <a class="user-dropdown-item" id="dd-art-link" href="creator.html?tab=art"><i class="ti ti-palette"></i> My Art</a>
            <a class="user-dropdown-item" href="library.html"><i class="ti ti-books"></i> My Library</a>
            <a class="user-dropdown-item" id="dd-friends-link" href="friends.html"><i class="ti ti-users"></i> Friends</a>
            <a class="user-dropdown-item" href="following.html#titles"><i class="ti ti-bookmark"></i> Following Titles</a>
            <a class="user-dropdown-item" href="following.html#authors"><i class="ti ti-feather"></i> Following Authors</a>
            <a class="user-dropdown-item" href="following.html#artists"><i class="ti ti-palette"></i> Following Artists</a>
            <a class="user-dropdown-item" href="following.html#history"><i class="ti ti-history"></i> Reading History</a>
            <a class="user-dropdown-item" href="avatar.html"><i class="ti ti-shirt"></i> My Avatar</a>
          </div>

          <div class="user-dropdown-divider" style="margin:4px 8px;"></div>

          <!-- ── CREATE & SELL ───────────────────────── -->
          <button class="dd-accordion-trigger" onclick="dsToggleAccordion(this)" aria-expanded="false">
            <span class="dd-acc-label" style="color:var(--accent);">Create &amp; Sell</span>
            <i class="ti ti-chevron-down dd-acc-chevron"></i>
          </button>
          <div class="dd-accordion-body">
            <a class="user-dropdown-item" href="scroll-create.html"><i class="ti ti-writing" style="color:var(--accent);"></i> <span style="color:var(--accent);">Submit a Scroll</span></a>
            <a class="user-dropdown-item" href="banner-create.html"><i class="ti ti-photo" style="color:#f59e0b;"></i> <span style="color:#f59e0b;">Submit a Banner</span></a>
            <a class="user-dropdown-item" href="cosmetic-create.html"><i class="ti ti-shirt" style="color:#a78bfa;"></i> <span style="color:#a78bfa;">Submit a Cosmetic</span></a>
            <a class="user-dropdown-item" href="licensing.html"><i class="ti ti-license"></i> Character Licensing</a>
            <a class="user-dropdown-item" href="payouts.html"><i class="ti ti-wallet"></i> Creator Payouts</a>
          </div>

          <div class="user-dropdown-divider" style="margin:4px 8px;"></div>

          <!-- ── ACCOUNT ─────────────────────────────── -->
          <button class="dd-accordion-trigger" onclick="dsToggleAccordion(this)" aria-expanded="false">
            <span class="dd-acc-label">Account</span>
            <i class="ti ti-chevron-down dd-acc-chevron"></i>
          </button>
          <div class="dd-accordion-body">
            <a class="user-dropdown-item" href="rewards.html"><i class="ti ti-award"></i> My Rewards</a>
            <a class="user-dropdown-item" href="settings.html"><i class="ti ti-settings"></i> Settings</a>
          </div>

          <div class="user-dropdown-divider"></div>
          <button class="user-dropdown-item signout-btn" onclick="dsSignOut()"><i class="ti ti-logout"></i> Sign Out</button>
        </div>
      </div>
    </div>
    <div class="search-dropdown-wrap">
      <button class="search-trigger-btn" onclick="dsToggleSearch()">
        <i class="ti ti-search"></i> Search
        <i class="ti ti-chevron-down" id="search-chevron"></i>
      </button>
      <div class="search-dropdown" id="searchDropdown">
        <div class="search-section" id="srch-sec-novels">
          <div class="search-section-label"><i class="ti ti-book"></i> Novels &amp; Authors</div>
          <div class="search-field"><i class="ti ti-book-2"></i><input type="text" id="srch-titles" placeholder="Search book titles…" class="search-input" autocomplete="off"/><button class="search-go-btn" onclick="dsGoSearch('titles')">Go</button></div>
          <div class="search-preview" id="srch-preview-titles"></div>
          <div class="search-field"><i class="ti ti-feather"></i><input type="text" id="srch-authors" placeholder="Search authors…" class="search-input" autocomplete="off"/><button class="search-go-btn" onclick="dsGoSearch('authors')">Go</button></div>
          <div class="search-preview" id="srch-preview-authors"></div>
        </div>
        <div class="search-divider"></div>
        <div class="search-section" id="srch-sec-art">
          <div class="search-section-label"><i class="ti ti-palette"></i> Art &amp; Artists</div>
          <div class="search-field"><i class="ti ti-photo"></i><input type="text" id="srch-artwork" placeholder="Search artwork…" class="search-input" autocomplete="off"/><button class="search-go-btn" onclick="dsGoSearch('artwork')">Go</button></div>
          <div class="search-preview" id="srch-preview-artwork"></div>
          <div class="search-field"><i class="ti ti-brush"></i><input type="text" id="srch-artists" placeholder="Search artists…" class="search-input" autocomplete="off"/><button class="search-go-btn" onclick="dsGoSearch('artists')">Go</button></div>
          <div class="search-preview" id="srch-preview-artists"></div>
        </div>
        <div class="search-divider"></div>
        <div class="search-section" id="srch-sec-tags">
          <div class="search-section-label"><i class="ti ti-tag"></i> Tags</div>
          <div class="search-field"><i class="ti ti-tag"></i><input type="text" id="srch-tags" placeholder="e.g. fantasy, romance, cultivation…" class="search-input" autocomplete="off"/><button class="search-go-btn" onclick="dsGoSearch('tags')">Go</button></div>
          <div class="search-preview" id="srch-preview-tags"></div>
        </div>
      </div>
    </div>
  `;

  /* Inject into nav's right side */
  var nav = document.querySelector('nav');
  if (nav) {
    var rightWrap = document.createElement('div');
    rightWrap.className = 'ds-nav-right';
    rightWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:auto;';
    rightWrap.innerHTML = navHtml;
    nav.appendChild(rightWrap);
  }

  /* ── HELPERS ─────────────────────────────────────────────────── */
  // Escapes single quotes too: several sinks below build attributes with single
  // quotes (style='...', onclick='...'), where &quot; alone would not help.
  function dsEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  // HTML-escaping does not neutralise a javascript: URL, so href/src values need
  // a scheme allowlist as well. '' means "no usable URL".
  // EVERY href/src value goes through this, not dsEsc(). The session-17 pass
  // routed avatar_url through here and left cover_url on dsEsc, so five sinks
  // accepted any scheme. dsSafeUrl returns '' for anything that is not http(s)
  // or site-relative, so callers must test ITS result - testing the raw column
  // instead renders <img src=""> where the letter fallback belongs.
  function dsSafeUrl(u){
    u = String(u == null ? '' : u).trim();
    if (!/^(https?:\/\/|\/)/i.test(u)) return '';
    return dsEsc(u);
  }

  // % and _ are ILIKE wildcards; escape them so a query of '%' does not match
  // every row in the table.
  function dsIlikeEsc(s){ return String(s||'').replace(/[%_\\]/g, '\\$&'); }
  function dsTimeAgo(s){
    if(!s) return '';
    var d=Math.floor((Date.now()-new Date(s))/1000);
    if(d<60) return 'just now';
    if(d<3600) return Math.floor(d/60)+'m ago';
    if(d<86400) return Math.floor(d/3600)+'h ago';
    return Math.floor(d/86400)+'d ago';
  }
  var DS_COVER_COLORS = ['cover-purple','cover-blue','cover-red','cover-green','cover-gold','cover-pink'];
  function dsCoverColor(id){ var h=0; for(var i=0;i<(id||'').length;i++) h=(h*31+id.charCodeAt(i))&0xffff; return DS_COVER_COLORS[h%DS_COVER_COLORS.length]; }
  function dsCoverLetter(t){ return (t||'?').charAt(0).toUpperCase(); }

  /* ── TOGGLE FUNCTIONS ────────────────────────────────────────── */
  window.dsToggleNotif = function() {
    document.getElementById('notifDropdown').classList.toggle('open');
    document.getElementById('searchDropdown').classList.remove('open');
    var dd = document.getElementById('user-dropdown'); if(dd) dd.classList.remove('open');
  };
  window.dsSwitchNotif = function(tab) {
    document.querySelectorAll('.notif-tab').forEach(function(t,i){
      t.classList.toggle('active', ['novels','artists','comments','activity'][i]===tab);
    });
    document.querySelectorAll('.notif-panel').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('notif-'+tab).classList.add('active');
  };
  window.dsToggleAccordion = function(trigger) {
    var body = trigger.nextElementSibling;
    var isOpen = trigger.classList.contains('open');
    trigger.classList.toggle('open', !isOpen);
    trigger.setAttribute('aria-expanded', String(!isOpen));
    if(body) body.classList.toggle('open', !isOpen);
  };

  window.dsToggleUserDropdown = function() {
    var dd = document.getElementById('user-dropdown');
    dd.classList.toggle('open');
    document.getElementById('notifDropdown').classList.remove('open');
    document.getElementById('searchDropdown').classList.remove('open');
  };
  window.dsToggleSearch = function() {
    var dropdown = document.getElementById('searchDropdown');
    var chevron = document.getElementById('search-chevron');
    dropdown.classList.toggle('open');
    chevron.style.transform = dropdown.classList.contains('open') ? 'rotate(180deg)' : '';
    document.getElementById('notifDropdown').classList.remove('open');
    var dd = document.getElementById('user-dropdown'); if(dd) dd.classList.remove('open');
  };
  window.dsSignOut = async function() {
    try { await db.auth.signOut(); } catch(e) {}
    localStorage.removeItem('ds_accent_hex');
    window.location.href = 'index.html';
  };

  /* Close dropdowns on outside click */
  document.addEventListener('click', function(e) {
    var inNav = e.target.closest('.notif-wrap, .user-nav-wrap, .search-dropdown-wrap, .dm-wrap');
    if (!inNav) {
      document.getElementById('notifDropdown').classList.remove('open');
      document.getElementById('searchDropdown').classList.remove('open');
      var dd = document.getElementById('user-dropdown'); if(dd) dd.classList.remove('open');
    }
  });

  /* ── NOTIFICATION HELPERS ────────────────────────────────────── */
  function dsGetClearedIds(tab) {
    try {
      var saved = localStorage.getItem('ds_notif_cleared_' + tab);
      if (!saved) return {};
      var arr = JSON.parse(saved); var map = {};
      arr.forEach(function(id){ map[id]=true; });
      return map;
    } catch(e){ return {}; }
  }
  /* Single source of truth for the bell count: recount the live DOM.
     Every unread notification renders exactly one .notif-item.unread, so
     counting elements keeps the bell, the tab pips and the feeds in sync
     no matter which path cleared them (mark-all, item click, or load). */
  var DS_NOTIF_TABS = ['novels','artists','comments','activity'];
  window.dsRecalcNotifBadge = function() {
    var total = 0;
    DS_NOTIF_TABS.forEach(function(tab){
      var feed = document.getElementById('notif-feed-' + tab);
      var n = feed ? feed.querySelectorAll('.notif-item.unread').length : 0;
      total += n;
      var btn = document.getElementById('notif-tab-' + tab);
      if (btn) {
        var ex = btn.querySelector('.notif-tab-badge');
        if (ex) ex.remove();
        if (n > 0) {
          var b = document.createElement('span');
          b.className = 'notif-tab-badge';
          b.textContent = Math.min(n, 99);
          btn.appendChild(b);
        }
      }
    });
    var badge = document.getElementById('ds-notif-badge');
    if (badge) {
      if (total > 0) { badge.textContent = Math.min(total, 99); badge.style.display = 'flex'; }
      else { badge.style.display = 'none'; }
    }
    return total;
  };

  window.dsMarkAllRead = function(tab) {
    var feed = document.getElementById('notif-feed-' + tab);
    if (!feed) return;
    var cleared = dsGetClearedIds(tab);
    var serverIds = [];
    feed.querySelectorAll('.notif-item[data-id]').forEach(function(item){
      cleared[item.dataset.id]=true;
      // Rows backed by the notifications table must also be flagged read
      // server-side, or they return on the next load and the count creeps
      // back up. Broadcast rows (user_id NULL) are deliberately excluded.
      if (item.dataset.server === '1') serverIds.push(item.dataset.id);
    });
    localStorage.setItem('ds_notif_cleared_' + tab, JSON.stringify(Object.keys(cleared)));
    if (serverIds.length) {
      // A bare try/catch around an un-awaited builder catches NOTHING: the
      // rejection is asynchronous, so it escapes as an unhandled promise
      // rejection instead. Wrapping in Promise.resolve() first is required -
      // .catch() chained straight onto a Supabase builder throws synchronously.
      Promise.resolve(db.from('notifications').update({is_read:true}).in('id', serverIds))
        .catch(function(){});
    }
    feed.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-checks"></i> All caught up!</div>';
    if (window.dsRecalcNotifBadge) window.dsRecalcNotifBadge();
  };

  /* ── SEARCH ──────────────────────────────────────────────────── */
  var dsSearchTimers = {};
  window.dsGoSearch = function(type) {
    var inputMap = { titles:'srch-titles', authors:'srch-authors', artwork:'srch-artwork', artists:'srch-artists', tags:'srch-tags' };
    var q = (document.getElementById(inputMap[type])||{}).value || '';
    if (!q.trim()) return;
    if (type === 'tags') {
      window.location.href = 'search.html?q='+encodeURIComponent(q.trim())+'&type=titles&tagmode=1';
    } else {
      window.location.href = 'search.html?q='+encodeURIComponent(q.trim())+'&tab='+type;
    }
  };
  ['titles','authors','artwork','artists','tags'].forEach(function(type) {
    var inputMap = { titles:'srch-titles', authors:'srch-authors', artwork:'srch-artwork', artists:'srch-artists', tags:'srch-tags' };
    var previewMap = { titles:'srch-preview-titles', authors:'srch-preview-authors', artwork:'srch-preview-artwork', artists:'srch-preview-artists', tags:'srch-preview-tags' };
    document.addEventListener('DOMContentLoaded', function(){
      var inp = document.getElementById(inputMap[type]);
      if (!inp) return;
      inp.addEventListener('keydown', function(e){ if(e.key==='Enter') dsGoSearch(type); });
      inp.addEventListener('input', function(){
        clearTimeout(dsSearchTimers[type]);
        var q = inp.value.trim();
        var preview = document.getElementById(previewMap[type]);
        if (!q) { if(preview){ preview.innerHTML=''; preview.classList.remove('visible'); } return; }
        dsSearchTimers[type] = setTimeout(async function(){
          if (!preview) return;
          preview.innerHTML = '<div class="search-preview-spinner"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;"></i></div>';
          preview.classList.add('visible');
          try {
            var res;
            if (type === 'titles') {
              var _sp = await dsLoadSearchPrefs();
              res = await dsFilterSearchQuery(db.from('works').select('id,title,cover_url,author_id').eq('type','novel').eq('is_published',true).ilike('title','%'+dsIlikeEsc(q)+'%'), _sp).limit(4);
            } else if (type === 'authors') {
              res = await db.from('profiles').select('id,username,display_name,avatar_url').ilike('display_name','%'+dsIlikeEsc(q)+'%').limit(4);
            } else if (type === 'artwork') {
              var _sp2 = await dsLoadSearchPrefs();
              res = await dsFilterSearchQuery(db.from('works').select('id,title,cover_url,author_id').eq('type','artwork').eq('is_published',true).ilike('title','%'+dsIlikeEsc(q)+'%'), _sp2).limit(4);
            } else if (type === 'tags') {
              var _sp3 = await dsLoadSearchPrefs();
              res = await dsFilterSearchQuery(db.from('works').select('id,title,cover_url,tags_main').eq('type','novel').eq('is_published',true).ilike('tags_all','%'+dsIlikeEsc(q)+'%'), _sp3).limit(5);
            } else {
              res = await db.from('profiles').select('id,username,display_name,avatar_url').ilike('display_name','%'+dsIlikeEsc(q)+'%').limit(4);
            }
            var items = res.data || [];
            if (!items.length) { preview.innerHTML='<div style="padding:8px 10px;font-size:12px;color:var(--text3);">No results</div>'; return; }
            preview.innerHTML = '';
            if (type === 'tags') {
              // Show a "See all results" shortcut plus matching novels
              var seeAll = document.createElement('a');
              seeAll.className = 'search-preview-item';
              seeAll.href = 'search.html?q='+encodeURIComponent(q)+'&type=titles&tagmode=1';
              seeAll.style.cssText = 'background:rgba(45,212,191,0.07);border-bottom:1px solid var(--border);';
              seeAll.innerHTML = '<div class="search-preview-cover" style="background:rgba(45,212,191,0.15);"><i class="ti ti-tag" style="font-size:14px;color:var(--accent);"></i></div>'
                + '<div class="search-preview-info"><div class="search-preview-title" style="color:var(--accent);">See all "'+dsEsc(q)+'" novels</div>'
                + '<div class="search-preview-sub">'+items.length+' match'+(items.length!==1?'es':'')+' in tag search</div></div>';
              preview.appendChild(seeAll);
              items.forEach(function(item){
                var a = document.createElement('a');
                a.className = 'search-preview-item';
                a.href = 'story.html?id='+item.id;
                var _cu = dsSafeUrl(item.cover_url);
                var coverHtml = _cu
                  ? '<img src="'+_cu+'" style="width:100%;height:100%;object-fit:cover;"/>'
                  : dsEsc((item.title||'?').charAt(0).toUpperCase());
                a.innerHTML = '<div class="search-preview-cover '+dsCoverColor(item.id)+'">'+coverHtml+'</div>'
                  + '<div class="search-preview-info"><div class="search-preview-title">'+dsEsc(item.title||'Unknown')+'</div></div>';
                preview.appendChild(a);
              });
            } else {
              items.forEach(function(item){
                var a = document.createElement('a');
                a.className = 'search-preview-item';
                var isWork = !!item.title;
                // A profile row with no username would have produced
                // 'profile.html?user=' — a live-looking link to nothing.
                if (isWork) {
                  a.href = (type==='titles'?'story.html?id=':'artwork.html?id=')+item.id;
                } else if (item.username) {
                  a.href = 'profile.html?user='+encodeURIComponent(item.username);
                }
                // else: no href at all. An <a> without href is inert and
                // unfocusable, which beats a javascript: URL or a live-looking
                // 'profile.html?user=' pointing at nothing.
                var _cu2 = isWork ? dsSafeUrl(item.cover_url) : '';
                var _au2 = isWork ? '' : dsSafeUrl(item.avatar_url);
                var coverHtml = _cu2
                  ? '<img src="'+_cu2+'" style="width:100%;height:100%;object-fit:cover;"/>'
                  : (_au2 ? '<img src="'+_au2+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>' : dsEsc((item.title||item.display_name||'?').charAt(0).toUpperCase()));
                a.innerHTML = '<div class="search-preview-cover '+dsCoverColor(item.id)+'">'+coverHtml+'</div>'
                  + '<div class="search-preview-info"><div class="search-preview-title">'+dsEsc(item.title||item.display_name||'Unknown')+'</div></div>';
                preview.appendChild(a);
              });
            }
          } catch(e){ preview.innerHTML=''; preview.classList.remove('visible'); }
        }, 300);
      });
    });
  });

  /* ── DM BADGE ────────────────────────────────────────────────── */
  async function dsLoadDmBadge(uid) {
    var btn = document.getElementById('dm-btn');
    var badge = document.getElementById('dm-badge');
    if(!btn||!badge) return;
    try {
      var { data: dmPrefRow } = await dsMyPrivate();
      if (dmPrefRow && (dmPrefRow.notif_message === false || dsIsQuiet(dmPrefRow))) { badge.style.display='none'; btn.classList.remove('has-unread'); return; }
    } catch(e) {}
    var unreadRes = await (async function(){
      var convRes = await db.from('conversations').select('id').or('participant_a.eq.'+uid+',participant_b.eq.'+uid);
      var convIds = (convRes.data||[]).map(function(c){ return c.id; });
      if (!convIds.length) return { data: [] };
      return db.from('messages').select('id').is('read_at',null).neq('sender_id',uid).in('conversation_id', convIds);
    })();
    var count = (unreadRes.data||[]).length;
    if(count>0){ badge.textContent=Math.min(count,99); badge.style.display='flex'; btn.classList.add('has-unread'); }
    else { badge.style.display='none'; btn.classList.remove('has-unread'); }
  }

  /* ── NOTIFICATIONS ───────────────────────────────────────────── */
  async function dsLoadNotifications(uid) {
    // Load this user's own notification preferences once, used to gate each feed below
    var myPrefs = { notif_follow: true, notif_chapter: true, notif_comment: true, notif_message: true, notif_announce: false };
    try {
      var { data: prefRow } = await dsMyPrivate();
      if (prefRow) {
        if (prefRow.notif_follow   !== null && prefRow.notif_follow   !== undefined) myPrefs.notif_follow   = prefRow.notif_follow;
        if (prefRow.notif_chapter  !== null && prefRow.notif_chapter  !== undefined) myPrefs.notif_chapter  = prefRow.notif_chapter;
        if (prefRow.notif_comment  !== null && prefRow.notif_comment  !== undefined) myPrefs.notif_comment  = prefRow.notif_comment;
        if (prefRow.notif_message  !== null && prefRow.notif_message  !== undefined) myPrefs.notif_message  = prefRow.notif_message;
        if (prefRow.notif_announce !== null && prefRow.notif_announce !== undefined) myPrefs.notif_announce = prefRow.notif_announce;
        // Quiet Mode / Quiet Hours are temporary master overrides — they suppress
        // everything below without ever touching the individual saved preferences.
        // Turning them off restores exactly what was there before.
        var isQuietNow = dsIsQuiet(prefRow);
        if (isQuietNow) {
          myPrefs.notif_follow = false; myPrefs.notif_chapter = false; myPrefs.notif_comment = false;
          myPrefs.notif_message = false; myPrefs.notif_announce = false;
        }
        var quietIndicator = document.getElementById('ds-quiet-indicator');
        if (quietIndicator) quietIndicator.style.display = isQuietNow ? 'block' : 'none';
      }
    } catch(e) {}

    var followedWorks = myPrefs.notif_chapter ? await db.from('work_follows').select('work_id').eq('user_id',uid) : { data: [] };
    var workIds = (followedWorks.data||[]).map(function(r){return r.work_id;});
    var novelNotifs = [];
    if(workIds.length){
      var chapRes = await db.from('chapters').select('id,chapter_number,title,created_at,work_id').in('work_id',workIds).eq('status','published').order('created_at',{ascending:false}).limit(8);
      novelNotifs = chapRes.data||[];
      if(novelNotifs.length){
        var cwIds=[...new Set(novelNotifs.map(function(c){return c.work_id;}))];
        var {data:cwData}=await db.from('works').select('id,title,cover_url').in('id',cwIds);
        var cwMap={};(cwData||[]).forEach(function(w){cwMap[w.id]=w;});
        novelNotifs.forEach(function(ch){ch.works=cwMap[ch.work_id]||null;});
      }
    }
    var novelFeed = document.getElementById('notif-feed-novels');
    var clearedN = dsGetClearedIds('novels');
    var unrN = novelNotifs.filter(function(c){return !clearedN[c.id];});
    if(!myPrefs.notif_chapter){ novelFeed.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">New chapter notifications are turned off.</div>'; }
    else if(!unrN.length){ novelFeed.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">No new chapters from followed stories.</div>'; }
    else {
      novelFeed.innerHTML='';
      unrN.forEach(function(ch){
        var work=ch.works; var title=work?work.title:'Unknown';
        var chLabel=ch.title?'Chapter '+ch.chapter_number+' — "'+ch.title+'"':'Chapter '+ch.chapter_number;
        var item=document.createElement('div'); item.className='notif-item unread'; item.dataset.id=ch.id; item.style.cursor='pointer';
        item.onclick=function(){if(work) window.location.href='story.html?id='+work.id;};
        var _cu3 = work ? dsSafeUrl(work.cover_url) : '';
        var coverHtml = _cu3
          ? '<img src="'+_cu3+'" style="width:100%;height:100%;object-fit:cover;" alt=""/>'
          : dsEsc(dsCoverLetter(title));
        // Must follow the same test as coverHtml, or a rejected URL shows the
        // letter with no background colour behind it.
        var coverClass = _cu3 ? '' : dsCoverColor(ch.work_id);
        item.innerHTML='<div class="notif-cover '+coverClass+'" style="overflow:hidden;padding:0;">'+coverHtml+'</div>'
          +'<div class="notif-body"><div class="notif-title">'+dsEsc(title)+'</div><div class="notif-text">'+dsEsc(chLabel)+' is now available</div>'
          +'<div class="notif-time"><i class="ti ti-clock"></i> '+dsTimeAgo(ch.created_at)+'</div></div><div class="notif-dot"></div>';
        novelFeed.appendChild(item);
      });
    }

    var followedUsers = await db.from('follows').select('following_id').eq('follower_id',uid);
    var followedIds = (followedUsers.data||[]).map(function(r){return r.following_id;});
    var artistNotifs = [];
    if(followedIds.length){
      var artRes = await db.from('works').select('id,title,type,created_at,author_id,cover_url').eq('type','artwork').in('author_id',followedIds).order('created_at',{ascending:false}).limit(8);
      artistNotifs = artRes.data||[];
      if(artistNotifs.length){
        var aaIds=[...new Set(artistNotifs.map(function(w){return w.author_id;}))];
        var {data:aaProfs}=await db.from('profiles').select('id,username,display_name,avatar_url').in('id',aaIds);
        var aaPMap={};(aaProfs||[]).forEach(function(p){aaPMap[p.id]=p;});
        artistNotifs.forEach(function(w){w.profiles=aaPMap[w.author_id]||null;});
      }
    }
    var artistFeed = document.getElementById('notif-feed-artists');
    var clearedA = dsGetClearedIds('artists');
    var unrA = artistNotifs.filter(function(w){return !clearedA[w.id];});

    // Prepend friend requests to artist feed
    try {
      var frRes2 = await db.from('friendships').select('id,requester_id,created_at').eq('recipient_id',uid).eq('status','pending').order('created_at',{ascending:false});
      var frRows2 = frRes2.data||[];
      if(frRows2.length){
        var frIds2=frRows2.map(function(r){return r.requester_id;});
        var {data:frProfs2}=await db.from('profiles').select('id,username,display_name,avatar_url').in('id',frIds2);
        var frPMap2={};(frProfs2||[]).forEach(function(p){frPMap2[p.id]=p;});
        artistFeed.innerHTML='';
        frRows2.forEach(function(fr){
          var p=frPMap2[fr.requester_id]||{}; var name=p.display_name||p.username||'Someone';
          // avatar_url was interpolated RAW here while every sibling site used
          // dsEsc -- a single missed call is all an attribute break needs.
          var avH=dsSafeUrl(p.avatar_url)?'<img src="'+dsSafeUrl(p.avatar_url)+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>':dsEsc(name.charAt(0).toUpperCase());
          var el=document.createElement('div');
          el.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);margin-bottom:4px;';
          el.innerHTML='<div style="width:28px;height:28px;border-radius:50%;background:var(--bg4);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text2);">'+avH+'</div>'
            +'<div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:700;color:#f59e0b;">'+dsEsc(name)+' sent you a friend request</div></div>'
            +'<a href="friends.html" style="font-size:11px;font-weight:700;color:#f59e0b;text-decoration:none;border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:3px 8px;">View</a>';
          artistFeed.appendChild(el);
        });
      } else { artistFeed.innerHTML=''; }
    } catch(e){ artistFeed.innerHTML=''; }

    // Prepend new-follower notifications to artist feed, respecting preference
    var unreadFollows = 0;
    if (myPrefs.notif_follow) {
      try {
        var folRes = await db.from('notifications').select('id,from_user_id,message,created_at,is_read')
          .eq('user_id', uid).eq('type','new_follower').eq('is_read', false)
          .order('created_at',{ascending:false}).limit(8);
        var folRows = folRes.data||[];
        unreadFollows = folRows.length;
        if(folRows.length){
          var folIds=folRows.map(function(r){return r.from_user_id;}).filter(Boolean);
          var {data:folProfs}=await db.from('profiles').select('id,username,display_name,avatar_url').in('id',folIds);
          var folPMap={};(folProfs||[]).forEach(function(p){folPMap[p.id]=p;});
          folRows.forEach(function(fl){
            var p=folPMap[fl.from_user_id]||{}; var name=p.display_name||p.username||'Someone';
            var avH=p.avatar_url?'<img src="'+dsSafeUrl(p.avatar_url)+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>':dsEsc(name.charAt(0).toUpperCase());
            var el=document.createElement('div');
            el.className='notif-item unread'; el.style.cursor='pointer';
            el.dataset.id=fl.id; el.dataset.server='1';
            el.innerHTML='<div class="notif-cover" style="overflow:hidden;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">'+avH+'</div>'
              +'<div class="notif-body"><div class="notif-title">'+dsEsc(name)+'</div><div class="notif-text">Started following you</div>'
              +'<div class="notif-time"><i class="ti ti-clock"></i> '+dsTimeAgo(fl.created_at)+'</div></div><div class="notif-dot"></div>';
            el.onclick=function(){
              Promise.resolve(db.from('notifications').update({is_read:true}).eq('id',fl.id)).catch(function(){});
              el.classList.remove('unread');
              if (window.dsRecalcNotifBadge) window.dsRecalcNotifBadge();
              if(p.username) window.location.href='profile.html?u='+p.username;
            };
            artistFeed.appendChild(el);
          });
        }
      } catch(e) {}
    }

    if(!unrA.length && !unreadFollows && artistFeed.children.length === 0){ artistFeed.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">No new art from followed artists.</div>'; }
    else {
      unrA.forEach(function(work){
        var prof=work.profiles; var name=prof?(prof.display_name||prof.username||'Unknown'):'Unknown';
        var _cu4 = dsSafeUrl(work.cover_url);
        var _au4 = prof ? dsSafeUrl(prof.avatar_url) : '';
        var avHtml = _cu4
          ? '<img src="'+_cu4+'" style="width:100%;height:100%;object-fit:cover;" alt=""/>'
          : _au4 ? '<img src="'+_au4+'" style="width:100%;height:100%;object-fit:cover;" alt=""/>' : dsEsc(name.charAt(0).toUpperCase());
        var coverClass = _cu4 ? '' : dsCoverColor(work.author_id);
        var item=document.createElement('div'); item.className='notif-item unread'; item.dataset.id=work.id; item.style.cursor='pointer';
        item.onclick=function(){window.location.href='artwork.html?id='+work.id;};
        item.innerHTML='<div class="notif-cover '+coverClass+'" style="overflow:hidden;padding:0;">'+avHtml+'</div>'
          +'<div class="notif-body"><div class="notif-title">'+dsEsc(name)+'</div><div class="notif-text">Posted — "'+dsEsc(work.title)+'"</div>'
          +'<div class="notif-time"><i class="ti ti-clock"></i> '+dsTimeAgo(work.created_at)+'</div></div><div class="notif-dot"></div>';
        artistFeed.appendChild(item);
      });
    }

    var myWorks = myPrefs.notif_comment ? await db.from('works').select('id,title,type,cover_url').eq('author_id',uid) : { data: [] };
    var myWorkRows=myWorks.data||[];
    var myNovelIds=myWorkRows.filter(function(w){return w.type!=='artwork';}).map(function(w){return w.id;});
    var myArtworkIds=myWorkRows.filter(function(w){return w.type==='artwork';}).map(function(w){return w.id;});
    var myWorkTitleMap={};myWorkRows.forEach(function(w){myWorkTitleMap[w.id]=w;});
    var commentNotifs=[];
    if(myNovelIds.length){
      var ownerChapRes=await db.from('chapters').select('id,work_id').in('work_id',myNovelIds);
      var ownerChapIds=(ownerChapRes.data||[]).map(function(c){return c.id;});
      var chapWorkMap={};(ownerChapRes.data||[]).forEach(function(c){chapWorkMap[c.id]=c.work_id;});
      if(ownerChapIds.length){
        var ncRes=await db.from('chapter_comments').select('id,content,created_at,chapter_id,user_id,parent_id').in('chapter_id',ownerChapIds).neq('user_id',uid).order('created_at',{ascending:false}).limit(20);
        (ncRes.data||[]).filter(function(c){return !c.parent_id;}).forEach(function(c){c.work_id=chapWorkMap[c.chapter_id]||null;c._type='novel';commentNotifs.push(c);});
        // Also fetch paragraph_comments (deep-link to paragraph panel)
        var prRes=await db.from('paragraph_comments').select('id,content,created_at,chapter_id,user_id,parent_id,paragraph_index').in('chapter_id',ownerChapIds).neq('user_id',uid).order('created_at',{ascending:false}).limit(20);
        (prRes.data||[]).filter(function(c){return !c.parent_id;}).forEach(function(c){c.work_id=chapWorkMap[c.chapter_id]||null;c._type='para';commentNotifs.push(c);});
      }
      // Song suggestions
      try {
        var songRes=await db.from('character_song_suggestions').select('id,song_title,artist_name,created_at,work_id,user_id,status').in('work_id',myNovelIds).neq('user_id',uid).eq('status','pending').order('created_at',{ascending:false}).limit(10);
        (songRes.data||[]).forEach(function(s){ s.content=(s.song_title||'Unknown')+(s.artist_name?' — '+s.artist_name:''); s._type='song'; commentNotifs.push(s); });
      } catch(e2){}
      // Character opinions
      try {
        var opRes=await db.from('character_opinions').select('id,body,created_at,work_id,user_id,status').in('work_id',myNovelIds).neq('user_id',uid).eq('status','pending').order('created_at',{ascending:false}).limit(10);
        (opRes.data||[]).forEach(function(o){ o.content=o.body; o._type='opinion'; commentNotifs.push(o); });
      } catch(e3){}
    }
    if(myArtworkIds.length){
      var acRes2=await db.from('artwork_comments').select('id,content,created_at,work_id,user_id,parent_id').in('work_id',myArtworkIds).neq('user_id',uid).order('created_at',{ascending:false}).limit(20);
      (acRes2.data||[]).filter(function(c){return !c.parent_id;}).forEach(function(c){c._type='artwork';commentNotifs.push(c);});
    }
    commentNotifs.sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);});
    commentNotifs=commentNotifs.slice(0,8);
    if(commentNotifs.length){
      var cmtUserIds=[...new Set(commentNotifs.map(function(c){return c.user_id;}))];
      var {data:cmtProfs}=await db.from('profiles').select('id,username,display_name,avatar_url').in('id',cmtUserIds);
      var cmtProfMap={};(cmtProfs||[]).forEach(function(p){cmtProfMap[p.id]=p;});
      commentNotifs.forEach(function(cm){cm.profiles=cmtProfMap[cm.user_id]||null;cm.works=myWorkTitleMap[cm.work_id]||null;});
    }
    var commentFeed=document.getElementById('notif-feed-comments');
    var clearedC=dsGetClearedIds('comments');
    var unrC=commentNotifs.filter(function(cm){return !clearedC[cm.id];});
    if(!myPrefs.notif_comment){ commentFeed.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">Comment notifications are turned off.</div>'; }
    else if(!unrC.length){ commentFeed.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">No new comments on your works.</div>'; }
    else {
      commentFeed.innerHTML='';
      unrC.forEach(function(cm){
        var prof=cm.profiles; var work=cm.works;
        var name=prof?(prof.display_name||prof.username||'Someone'):'Someone';
        var workTitle=work?work.title:'your work';
        var item=document.createElement('div'); item.className='notif-item unread'; item.dataset.id=cm.id; item.style.cursor='pointer';
        item.onclick=function(){
          if(!cm.work_id) return;
          if(cm._type==='song'||cm._type==='opinion'){ window.location.href='story.html?id='+cm.work_id; return; }
          if(cm._type==='artwork') { window.location.href='artwork.html?id='+cm.work_id; }
          else if(cm._type==='para' && cm.chapter_id) {
            var _destUrl = 'chapter.html?id='+cm.chapter_id;
            var _alreadyThere = window.location.href.includes(cm.chapter_id);
            if (_alreadyThere) {
              if (typeof spOpen === 'function') {
                spOpen('comments');
                setTimeout(function() {
                  var el = document.getElementById('sp-comment-'+cm.id);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  var paraEl = document.querySelector('[data-para-idx="'+cm.paragraph_index+'"]');
                  if (paraEl) paraEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 400);
              }
            } else {
              sessionStorage.setItem('ds_open_para', cm.paragraph_index);
              sessionStorage.setItem('ds_open_comment', cm.id);
              var _pname = prof ? (prof.display_name || prof.username || '') : '';
              if (_pname) sessionStorage.setItem('ds_open_name', _pname);
              window.location.href = _destUrl;
            }
          }
          else { window.location.href='chapter.html?id='+cm.chapter_id; }
        };
        var _cu5 = work ? dsSafeUrl(work.cover_url) : '';
        var _au5 = prof ? dsSafeUrl(prof.avatar_url) : '';
        var avHtml2 = _cu5
          ? '<img src="'+_cu5+'" style="width:100%;height:100%;object-fit:cover;" alt=""/>'
          : _au5 ? '<img src="'+_au5+'" style="width:100%;height:100%;object-fit:cover;" alt=""/>' : dsEsc(name.charAt(0).toUpperCase());
        var coverClass2 = _cu5 ? '' : dsCoverColor(cm.user_id||cm.id);
        var cmTypeLabel = cm._type==='song' ? ' suggested a song for ' : cm._type==='opinion' ? ' shared a character opinion on ' : cm._type==='para' ? ' commented on a paragraph in ' : ' commented on ';
        var cmTypeColor = cm._type==='song' ? 'color:var(--gold);' : cm._type==='opinion' ? 'color:#ec4899;' : '';
        item.innerHTML='<div class="notif-cover '+coverClass2+'" style="overflow:hidden;padding:0;">'+avHtml2+'</div>'
          +'<div class="notif-body"><div class="notif-title" style="'+cmTypeColor+'">'+dsEsc(name)+cmTypeLabel+dsEsc(workTitle)+'</div>'
          +'<div class="notif-text">"'+dsSpoiler.render(dsEsc((cm.content||'').slice(0,70)))+(cm.content&&cm.content.length>70?'...':'')+'"</div>'
          +'<div class="notif-time"><i class="ti ti-clock"></i> '+dsTimeAgo(cm.created_at)+'</div></div><div class="notif-dot"></div>';
        commentFeed.appendChild(item);
      });
    }

    // Badge counts
    var unreadN=unrN.length, unreadA=unrA.length+unreadFollows, unreadC=unrC.length;

    // Activity notifications (song approved/rejected + site announcements)
    var activityFeed = document.getElementById('notif-feed-activity');
    var unreadAct = 0;
    try {
      var { data: actRows } = await db.from('notifications')
        .select('id,type,message,work_id,chapter_id,created_at')
        .eq('user_id', uid)
        .in('type', ['song_approved','song_rejected','fan_translation_linked','opinion_submitted','opinion_approved','opinion_featured','quote_submitted','quote_approved','quote_rejected','question_submitted','question_answered','question_declined','collab_request','showcase_collab_request','showcase_collab_accepted','showcase_collab_declined','echo','poll_closing','title_approved','title_denied'])
        .order('created_at', { ascending: false })
        .limit(12);
      var clearedAct = dsGetClearedIds('activity');
      var unrAct = (actRows||[]).filter(function(n){ return !clearedAct[n.id]; });

      var unrBlast = [];
      if (myPrefs.notif_announce) {
        var { data: blastRows } = await db.from('notifications')
          .select('id,message,created_at')
          .is('user_id', null)
          .eq('type', 'blast')
          .order('created_at', { ascending: false })
          .limit(8);
        unrBlast = (blastRows||[]).filter(function(n){ return !clearedAct[n.id]; });
      }

      unreadAct = unrAct.length + unrBlast.length;
      if (!unrAct.length && !unrBlast.length) {
        activityFeed.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">No new activity.</div>';
      } else {
        activityFeed.innerHTML = '';
        unrBlast.forEach(function(n) {
          var item = document.createElement('div');
          item.className = 'notif-item unread';
          item.dataset.id = n.id;
          item.onclick = function() {
            var map = dsGetClearedIds('activity');
            map[n.id] = true;
            localStorage.setItem('ds_notif_cleared_activity', JSON.stringify(Object.keys(map)));
            item.classList.remove('unread');
            if (window.dsRecalcNotifBadge) window.dsRecalcNotifBadge();
            // Shared broadcast row — clear locally only, never mark is_read globally
          };
          item.innerHTML =
            '<div class="notif-cover" style="background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:18px;color:#2dd4bf;">'+
              '<i class="ti ti-speakerphone"></i>'+
            '</div>'+
            '<div class="notif-body">'+
              '<div class="notif-title" style="color:#2dd4bf;">📣 Announcement</div>'+
              '<div class="notif-text">'+dsEsc((n.message||'').slice(0,80))+(n.message&&n.message.length>80?'...':'')+'</div>'+
              '<div class="notif-time"><i class="ti ti-clock"></i> '+dsTimeAgo(n.created_at)+'</div>'+
            '</div><div class="notif-dot"></div>';
          activityFeed.appendChild(item);
        });
        unrAct.forEach(function(n) {
          var iconColor, icon, title;
          if(n.type==='song_approved')         { iconColor='#22c55e'; icon='ti-music';             title='🎵 Song Approved'; }
          else if(n.type==='song_rejected')    { iconColor='#ef4444'; icon='ti-music-off';         title='🎵 Song Not Approved'; }
          else if(n.type==='fan_translation_linked') { iconColor='#2dd4bf'; icon='ti-language';   title='🌐 Fan Translation'; }
          else if(n.type==='opinion_submitted')  { iconColor='#ec4899'; icon='ti-message-heart';     title='💬 New Character Opinion'; }
          else if(n.type==='opinion_approved') { iconColor='#ec4899'; icon='ti-message-heart';     title='💬 Opinion Approved'; }
          else if(n.type==='opinion_featured') { iconColor='#f59e0b'; icon='ti-star';              title='⭐ Opinion Featured'; }
          else if(n.type==='quote_submitted')  { iconColor='var(--gold,#f5c542)'; icon='ti-quote'; title='❝ New Quote Nomination'; }
          else if(n.type==='quote_approved')   { iconColor='#22c55e'; icon='ti-quote';            title='❝ Quote Approved'; }
          else if(n.type==='quote_rejected')   { iconColor='#ef4444'; icon='ti-quote';            title='❝ Quote Not Approved'; }
          else if(n.type==='question_submitted'){ iconColor='#2dd4bf'; icon='ti-help-circle';     title='❓ New Character Question'; }
          else if(n.type==='question_answered'){ iconColor='#2dd4bf'; icon='ti-message-check';    title='💬 Question Answered'; }
          else if(n.type==='question_declined'){ iconColor='var(--text3)'; icon='ti-x';           title='❓ Question Declined'; }
          else if(n.type==='collab_request')   { iconColor='#f59e0b'; icon='ti-git-merge';         title='🤝 Collab Request'; }
          else if(n.type==='showcase_collab_request'){ iconColor='#f59e0b'; icon='ti-photo';        title='🎨 Fan Art Awaiting You'; }
          else if(n.type==='showcase_collab_accepted'){ iconColor='#22c55e'; icon='ti-photo-check'; title='🎨 Fan Art Approved'; }
          else if(n.type==='showcase_collab_declined'){ iconColor='var(--text3)'; icon='ti-photo-off'; title='🎨 Fan Art Collab Declined'; }
          else if(n.type==='echo')             { iconColor='#f97316'; icon='ti-flame';             title='🔥 Echo on Chapter'; }
          else if(n.type==='poll_closing')     { iconColor='#f59e0b'; icon='ti-clock-exclamation'; title='📊 Poll Closing Soon'; }
          else if(n.type==='title_approved')   { iconColor='#22c55e'; icon='ti-check';             title='🏷️ Title Approved'; }
          else if(n.type==='title_denied')     { iconColor='var(--text3)'; icon='ti-x';            title='🏷️ Title Not Added'; }
          else                                 { iconColor='var(--text3)'; icon='ti-bell';         title=dsEsc(n.type||'Notification'); }
          var item = document.createElement('div');
          item.className = 'notif-item unread';
          item.dataset.id = n.id;
          item.dataset.server = '1';
          var dest = n.chapter_id ? 'chapter.html?id='+n.chapter_id : (n.work_id ? 'story.html?id='+n.work_id : null);
          if(n.type==='collab_request') dest = 'collab-inbox.html';
          if(n.type==='showcase_collab_request') dest = 'collab-inbox.html';
          if(n.type==='showcase_collab_accepted'||n.type==='showcase_collab_declined') dest = n.work_id ? 'artwork.html?id='+n.work_id : null;
          item.style.cursor = dest ? 'pointer' : 'default';
          item.onclick = function() {
            var map = dsGetClearedIds('activity');
            map[n.id] = true;
            localStorage.setItem('ds_notif_cleared_activity', JSON.stringify(Object.keys(map)));
            item.classList.remove('unread');
            Promise.resolve(db.from('notifications').update({is_read:true}).eq('id',n.id)).catch(function(){});
            if (window.dsRecalcNotifBadge) window.dsRecalcNotifBadge();
            if (dest) window.location.href = dest;
          };
          item.innerHTML =
            '<div class="notif-cover" style="background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:18px;color:'+iconColor+';">'+
              '<i class="ti '+icon+'"></i>'+
            '</div>'+
            '<div class="notif-body">'+
              '<div class="notif-title" style="color:'+iconColor+';">'+title+'</div>'+
              '<div class="notif-text">'+dsEsc((n.message||'').slice(0,80))+(n.message&&n.message.length>80?'...':'')+'</div>'+
              '<div class="notif-time"><i class="ti ti-clock"></i> '+dsTimeAgo(n.created_at)+'</div>'+
            '</div><div class="notif-dot"></div>';
          activityFeed.appendChild(item);
        });
      }
    } catch(e) {
      if (activityFeed) activityFeed.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">Could not load.</div>';
    }

    // Feeds are fully rendered — derive the bell and tab counts from the DOM
    // so first paint uses the exact same accounting as every later clear.
    if (window.dsRecalcNotifBadge) window.dsRecalcNotifBadge();
  }

  /* ── AUTH INIT ───────────────────────────────────────────────── */
  function dsWaitForDb(cb, tries) {
    tries = tries || 0;
    if (typeof db !== 'undefined') { cb(); return; }
    if (tries > 40) { console.warn('DS nav: db not found'); return; }
    setTimeout(function(){ dsWaitForDb(cb, tries + 1); }, 75);
  }

  dsWaitForDb(function(){
  (async function dsInitUserNav() {
    try {
      var session = (await db.auth.getSession()).data.session;
      if (!session) return;
      var loginBtn = document.getElementById('nav-login-btn');
      if(loginBtn) loginBtn.style.display = 'none';
      var userWrap = document.getElementById('user-nav-wrap');
      if(userWrap) userWrap.style.display = 'flex';
      var avatarBtn = document.getElementById('user-avatar-btn');

      // Load ember balance
      var emberWrap = document.getElementById('ember-wrap');
      if (emberWrap) {
        emberWrap.style.display = 'flex';
        try {
          var emberRes = await db.from('user_embers').select('balance').eq('user_id', session.user.id).maybeSingle();
          var balance = (emberRes.data && emberRes.data.balance) || 0;
          document.getElementById('ds-ember-count').textContent = balance.toLocaleString();
        } catch(e) {}
      }

      // Load Quill balance. The Quills system (real-money currency,
      // purchased to support creators) isn't built yet — this shows
      // 0 as a placeholder until a user_quills table/RPC exists, at
      // which point swap this query for the real one.
      var quillWrap = document.getElementById('quill-wrap');
      if (quillWrap) {
        quillWrap.style.display = 'flex';
        try {
          var quillRes = await db.from('user_quills').select('balance').eq('user_id', session.user.id).maybeSingle();
          var quillBalance = (quillRes.data && quillRes.data.balance) || 0;
          document.getElementById('ds-quill-count').textContent = quillBalance.toLocaleString();
        } catch(e) {
          document.getElementById('ds-quill-count').textContent = '0';
        }
      }

      var meta = session.user.user_metadata || {};
      // Point "My Books" / "My Art" dropdown links at the owner's own profile,
      // deep-linking straight to the Works tab's Novels or Artwork sub-tab.
      function dsSetOwnWorkLinks(uname){
        // "My Books" / "My Art" open the creator workspace, which resolves the
        // author from the session — no username needed. Hrefs are already set
        // in markup; this keeps the call sites valid and future-proof.
        var b=document.getElementById('dd-books-link');
        if(b) b.href='creator.html?tab=novels';
        var a=document.getElementById('dd-art-link');
        if(a) a.href='creator.html?tab=art';
      }
      var username = meta.username || null;
      var displayName = meta.display_name || username || session.user.email.split('@')[0];
      var _ddn0=document.getElementById('dd-display-name'); if(_ddn0) _ddn0.textContent = displayName;
      var _ddh0=document.getElementById('dd-handle'); if(_ddh0) _ddh0.textContent = username ? '@'+username : session.user.email;
      var _uai0=document.getElementById('user-avatar-initial'); if(_uai0) _uai0.textContent = displayName.charAt(0).toUpperCase();
      var _dpl0=document.getElementById('dd-profile-link'); if(username && _dpl0) _dpl0.href = 'profile.html?user='+username;
      if(username){ dsSetOwnWorkLinks(username); }

      // Always fetch profile by uid — metadata may be missing/stale
      var res = await db.from('profiles').select('avatar_url,display_name,username,id,account_status').eq('id',session.user.id).maybeSingle();

      // ── BAN CHECK ────────────────────────────────────────────────
      // This is the authoritative site-wide enforcement of the banned state.
      // account_status is set by admins via WhiteRoom and is never overwritten
      // by the user's own Settings save.
      if (res && res.data && res.data.account_status === 'banned') {
        await db.auth.signOut();
        window.location.href = 'auth.html?reason=banned';
        return;
      }

      if(res && !res.error && res.data){
        // Fill in any missing username/displayName from DB (more reliable than metadata)
        if(!username && res.data.username){
          username = res.data.username;
          document.getElementById('dd-handle').textContent = '@'+username;
          document.getElementById('dd-profile-link').href = 'profile.html?user='+username;
          dsSetOwnWorkLinks(username);
        }
        if(res.data.display_name){
          var _ddn1=document.getElementById('dd-display-name'); if(_ddn1) _ddn1.textContent = res.data.display_name;
          var _uai1=document.getElementById('user-avatar-initial'); if(_uai1) _uai1.textContent = res.data.display_name.charAt(0).toUpperCase();
        }
        // Apply avatar image immediately — not gated on username
        if(dsSafeUrl(res.data.avatar_url) && !window.__dsNavHeadshot){
          avatarBtn.innerHTML = '<img src="'+dsSafeUrl(res.data.avatar_url)+'" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
        }
      }

      // ── TIMEZONE CAPTURE (sitewide, best-effort) ────────────────
      // Night Owl (and any future local-time badge) evaluates "night" in the
      // reader's own timezone via profiles.timezone. Capture the browser IANA
      // zone and store it, but ONLY when it differs from what's already saved —
      // so a stable user writes zero times after the first load, and a traveler
      // writes only on change. Fire-and-forget: never blocks nav, never throws.
      // The set_my_timezone RPC re-validates against pg_timezone_names and has
      // its own IS DISTINCT FROM no-write guard, so a bad or unchanged value is
      // a safe no-op even if this client gate is bypassed.
      (async function dsCaptureTimezone(){
        try {
          var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (!tz) return;
          var privTz = await dsMyPrivate();
          var saved = (privTz && privTz.data) ? privTz.data.timezone : null;
          if (tz === saved) return; // unchanged — skip the write entirely
          db.rpc('set_my_timezone', { p_tz: tz }).then(function(){}, function(){});
        } catch(e) { /* timezone capture is never worth an error */ }
      })();

      // ── SVG AVATAR HEADSHOT (sitewide) ──────────────────────────
      // Overrides the photo pfp with the user's customized avatar face.
      // Loads avatarRender.js on demand so every page gets it without
      // needing its own <script> include. Falls back silently to the
      // avatar_url photo if presets/artwork aren't available.
      (async function dsApplyAvatarHeadshot(uid){
        try {
          if (!window.DSAvatar) {
            await new Promise(function(res, rej){
              var sc = document.createElement('script');
              sc.src = 'avatarRender.js'; sc.onload = res; sc.onerror = rej;
              document.head.appendChild(sc);
            });
          }
          var r = await DSAvatar.load(db, uid);
          if (!r.presets || !r.presets.length || !r.headshotSvg) return;
          var btn = document.getElementById('user-avatar-btn');
          if (!btn) return;
          window.__dsNavHeadshot = true; // photo fetches must not overwrite
          btn.innerHTML = r.headshotSvg;
          var sv = btn.querySelector('svg');
          if (sv) { sv.style.width='100%'; sv.style.height='100%'; sv.style.display='block'; sv.style.borderRadius='50%'; }
        } catch(e) { /* keep photo fallback */ }
      })(session.user.id);

      // Apply user's saved accent color sitewide
      // Cache in localStorage so it applies instantly on next page load with no DB wait.
      var accentRes = await db.from('user_avatars').select('accent_color').eq('user_id', session.user.id).maybeSingle();
      if (accentRes.data && accentRes.data.accent_color && accentRes.data.accent_color.hex) {
        var ac = accentRes.data.accent_color;
        var hex = ac.hex;
        localStorage.setItem('ds_accent_hex', hex);
        dsApplyAccent(hex);
      } else {
        // No custom accent — cache the default teal so it loads instantly on all pages
        // without waiting for the session/DB fetch to complete.
        var defaultAccent = '#2dd4bf';
        localStorage.setItem('ds_accent_hex', defaultAccent);
        dsApplyAccent(defaultAccent);
      }

      // Run pending check for ALL logged-in users sitewide using session.user.id
      (async function() {
        var uid2 = session.user.id;
        var pendingParts = [];
        try {
          // One works fetch, split client-side. Was two round-trips (artwork, novel);
          // songs now cover every owned work, matching the block this replaces below.
          var myWorks2 = await db.from('works').select('id,type').eq('author_id',uid2);
          var allRows2 = myWorks2.data||[];
          var artIds2 = allRows2.filter(function(w){return w.type==='artwork';}).map(function(w){return w.id;});
          var novIds2 = allRows2.filter(function(w){return w.type==='novel';}).map(function(w){return w.id;});
          var allIds2 = allRows2.map(function(w){return w.id;});
          if(artIds2.length){
            var acRes2=await db.from('artwork_collabs').select('id').in('artwork_id',artIds2).eq('status','pending');
            var acCount2=(acRes2.data||[]).length; if(acCount2>0) pendingParts.push(acCount2+' story collab'+(acCount2>1?'s':''));
          }
          if(novIds2.length){
            var scRes2=await db.from('story_collabs').select('id').in('work_id',novIds2).eq('status','pending');
            var scCount2=(scRes2.data||[]).length; if(scCount2>0) pendingParts.push(scCount2+' fan art'+(scCount2>1?'s':''));
          }
          if(allIds2.length){
            var songRes2=await db.from('character_song_suggestions').select('id').in('work_id',allIds2).eq('status','pending');
            var songCount2=(songRes2.data||[]).length; if(songCount2>0) pendingParts.push(songCount2+' song suggestion'+(songCount2>1?'s':''));
          }
          var frRes2=await db.from('friendships').select('id').eq('recipient_id',uid2).eq('status','pending');
          var frCount2=(frRes2.data||[]).length; if(frCount2>0) pendingParts.push(frCount2+' friend request'+(frCount2>1?'s':''));
          var collabParts2 = pendingParts.filter(function(p){ return p.indexOf('friend') === -1; });
          var friendParts2 = pendingParts.filter(function(p){ return p.indexOf('friend') !== -1; });
          if(collabParts2.length>0){
            var pl2=document.getElementById('dd-profile-link');
            if(pl2) pl2.innerHTML='<i class="ti ti-user"></i> My Profile <span class="collab-pending-pill">'+collabParts2.join(' · ')+'</span>';
          }
          if(friendParts2.length>0){
            var fl2=document.getElementById('dd-friends-link');
            if(fl2) fl2.innerHTML='<i class="ti ti-users"></i> Friends <span class="collab-pending-pill">'+friendParts2.join(' · ')+'</span>';
          }
        } catch(e) {}
      })();

      if(username){
        var res = await db.from('profiles').select('avatar_url,display_name,id').eq('username',username).maybeSingle();
        if(res && !res.error && res.data){
          if(res.data.display_name){
            var _ddn2=document.getElementById('dd-display-name'); if(_ddn2) _ddn2.textContent = res.data.display_name;
            var _uai2=document.getElementById('user-avatar-initial'); if(_uai2) _uai2.textContent = res.data.display_name.charAt(0).toUpperCase();
          }
          if(dsSafeUrl(res.data.avatar_url) && !window.__dsNavHeadshot){
            avatarBtn.innerHTML = '<img src="'+dsSafeUrl(res.data.avatar_url)+'" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
          }
          // Pending-count block deleted — the sitewide IIFE above already ran the
          // identical query set for this same user. res.data.id and session.user.id
          // are the same row; this block only ever recomputed and repainted the
          // same two pills. Saves 6 round-trips per page view for every logged-in user.
          var uid2 = res.data.id || session.user.id;
          await dsLoadNotifications(uid2);
          await dsLoadDmBadge(uid2);

          // ── LOGIN BADGE TRIGGERS ──────────────────────────────
          // Run silently in background — never block nav or show toasts here.
          // Pages can listen for 'ds-badge-unlocked' to show their own toasts.
          (async function() {
            try {
              // Veteran: advances automatically based on account age
              var vetResult = await db.rpc('award_veteran_badge', { p_user_id: uid2 });
              if (vetResult.data && vetResult.data.newly_unlocked &&
                  vetResult.data.newly_unlocked.length > 0) {
                window.dispatchEvent(new CustomEvent('ds-badge-unlocked', {
                  detail: { results: [vetResult.data] }
                }));
              }
            } catch(e) {}

            try {
              // Rising: recount followers in case follows happened while away
              await db.rpc('award_rising_badge', { p_user_id: uid2 });
            } catch(e) {}

            try {
              // check_special_badges: Pioneer, Renaissance, Silent Reader,
              // Curator, Homecoming — all idempotent and safe to run every login
              var specialResults = await db.rpc('check_special_badges', { p_user_id: uid2 });
              if (specialResults.data && specialResults.data.length > 0) {
                window.dispatchEvent(new CustomEvent('ds-badge-unlocked', {
                  detail: { results: specialResults.data }
                }));
              }
            } catch(e) {}

            try {
              // ── BADGE UNLOCK QUEUE DRAIN ────────────────────────
              // Durable mailbox of tier crossings recorded server-side by
              // award_badge_progress / award_one_time_badge / sync_kindled_badge.
              // Runs last so anything the triggers above just queued is picked
              // up in the same pass. Survives the user closing the tab mid-read:
              // an unlock earned yesterday still surfaces on next login.
              // Identity comes from auth.uid() — the RPC takes no arguments.
              var drained = await db.rpc('drain_badge_unlocks');
              var unlocks = (drained.data && drained.data.unlocks) || [];
              if (unlocks.length > 0) {
                // Reshape queue rows into the { badge_slug, newly_unlocked[] }
                // shape the existing ds-badge-unlocked listener already speaks,
                // grouping consecutive tiers of the same badge into one result.
                var grouped = [];
                var byBadge = {};
                unlocks.forEach(function(u) {
                  var key = u.badge_slug || 'badge';
                  if (!byBadge[key]) {
                    byBadge[key] = {
                      badge_slug: key,
                      badge_name: u.badge_name,
                      badge_icon: u.badge_icon,
                      badge_color: u.badge_color,
                      newly_unlocked: []
                    };
                    grouped.push(byBadge[key]);
                  }
                  byBadge[key].newly_unlocked.push({
                    tier: u.tier,
                    gem_name: u.gem_name,
                    gem_color: u.gem_color,
                    xp_reward: u.xp_reward
                  });
                });
                window.dispatchEvent(new CustomEvent('ds-badge-unlocked', {
                  detail: { results: grouped }
                }));
              }
            } catch(e) {}

            try {
              // ── DAILY CHECK-IN: click-to-claim (no auto-claim, no pop-up) ──
              // The sunrise nav button opens the calendar modal; a pulsing
              // gold dot shows while today's reward is unclaimed. localStorage
              // is the fast path; user_streaks confirms cross-device claims.
              // Timezone capture. daily_checkin, the night owl badge and the
              // digest emails all derive "when" from profiles.timezone, and an
              // unset value means UTC \u2014 which rolls a user's reward day over
              // in the middle of their evening. set_my_timezone validates the
              // name against pg_timezone_names and skips the write when it
              // hasn't changed, so this is cheap to call and safe to repeat.
              try {
                var dsTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (dsTz && localStorage.getItem('ds_tz_sent_' + uid2) !== dsTz) {
                  var tzRes = await db.rpc('set_my_timezone', { p_tz: dsTz });
                  if (tzRes && !tzRes.error) localStorage.setItem('ds_tz_sent_' + uid2, dsTz);
                }
              } catch(e) {}

              var ckBtn = document.getElementById('ds-checkin-btn');
              if (ckBtn) ckBtn.style.display = 'flex';
              // The button ships dimmed, so it can only ever brighten once the
              // server confirms a claim is available. Cached "next claimable"
              // instant means most navigations cost no network call at all.
              if (dsCkCachedClaimed(uid2)) dsSetCheckinDot(false);
              else await dsRefreshCheckinCache(uid2);
            } catch(e) {}
          })();
        }
      }

      // Admin link — check admins table, not hardcoded UID
      try {
        var adminCheck = await db.from('admins').select('id')
          .eq('id', session.user.id).maybeSingle();
        if (adminCheck.data) {
          var menu = document.querySelector('.user-dropdown-menu');
          if (menu) {
            var div2 = document.createElement('div'); div2.className = 'user-dropdown-divider';
            var adminLink = document.createElement('a'); adminLink.className = 'user-dropdown-item';
            adminLink.href = 'WhiteRoomUnbreakable.html';
            adminLink.innerHTML = '<i class="ti ti-shield" style="color:#f59e0b;"></i> <span style="color:#f59e0b;">Admin Panel</span>';
            var signOutBtn = menu.querySelector('.signout-btn');
            menu.insertBefore(div2, signOutBtn);
            menu.insertBefore(adminLink, signOutBtn);
          }
        }
      } catch(e) {}
    } catch(err){ console.warn('DS nav:', err); }
  })();

  // ── BADGE UNLOCK EVENT LISTENER ──────────────────────────────
  // Dispatched by nav.js badge triggers and by any page's badge RPC calls.
  // Pages that have a showToast function will show the toast automatically.
  // Pages without it (or that want custom handling) can override this listener.
  // Unlocks are drained server-side (marked delivered) regardless of whether
  // this page can render a toast. 14 pages don't define showToast, so without
  // a client-side stash a drained unlock would be lost permanently. Park it in
  // sessionStorage and replay on the next page that can show it.
  var DS_UNLOCK_STASH = 'ds_pending_badge_toasts';

  /* Badge unlocks get a full-screen celebration rather than a toast that
     reads the same as "Settings saved". Loaded as a shared file so nav.js
     and index.html (which keeps its own nav copy) can't drift apart. */
  (function dsLoadBadgeCelebrate() {
    if (window.DSBadgeCelebrate || document.getElementById('ds-bc-script')) return;
    var sc = document.createElement('script');
    sc.id = 'ds-bc-script';
    sc.src = 'badgeCelebrate.js';
    document.head.appendChild(sc);
  })();

  /* Flattens both unlock shapes — the one-time { awarded, badge_slug } form
     and the tiered { newly_unlocked: [...] } form — into one list of things
     to celebrate. */
  function dsUnlocksToCelebrations(results) {
    var out = [];
    (results || []).forEach(function (r) {
      var label = r.badge_name ||
                  (r.badge_slug ? r.badge_slug.replace(/_/g, ' ') : 'badge');
      var icon = r.badge_icon || 'ti-award';
      if (r.newly_unlocked && r.newly_unlocked.length) {
        r.newly_unlocked.forEach(function (tier) {
          out.push({
            name: label, icon: icon,
            gem_name: tier.gem_name,
            gem_color: tier.gem_color || r.badge_color,
            xp_reward: tier.xp_reward
          });
        });
      } else if (r.awarded && r.badge_slug) {
        out.push({
          name: label, icon: icon,
          gem_name: r.gem_name,
          gem_color: r.gem_color || r.badge_color,
          xp_reward: r.xp_reward
        });
      }
    });
    return out;
  }

  function dsStashUnlocks(results) {
    try {
      var prev = JSON.parse(sessionStorage.getItem(DS_UNLOCK_STASH) || '[]');
      sessionStorage.setItem(DS_UNLOCK_STASH, JSON.stringify(prev.concat(results)));
    } catch(e) {}
  }

  function dsTakeStashedUnlocks() {
    try {
      var held = JSON.parse(sessionStorage.getItem(DS_UNLOCK_STASH) || '[]');
      if (held.length) sessionStorage.removeItem(DS_UNLOCK_STASH);
      return held;
    } catch(e) { return []; }
  }

  window.addEventListener('ds-badge-unlocked', function(e) {
    var results = (e.detail && e.detail.results) || [];
    if (!results.length) return;
    // The celebration renderer is self-contained, so unlike the old toast
    // path it works on every page — nothing to hold back waiting for a
    // page-local showToast. Only stash if the shared file hasn't loaded yet
    // AND there's no toast fallback, so an unlock is never simply lost.
    if (typeof window.DSBadgeCelebrate !== 'function' &&
        typeof window.showToast !== 'function') { dsStashUnlocks(results); return; }

    if (typeof window.DSBadgeCelebrate === 'function') {
      var held0 = dsTakeStashedUnlocks();
      if (held0.length) results = held0.concat(results);
      window.DSBadgeCelebrate(dsUnlocksToCelebrations(results));
      return;
    }
    // Prepend anything held from an earlier page that couldn't display.
    var held = dsTakeStashedUnlocks();
    if (held.length) results = held.concat(results);
    results.forEach(function(r, i) {
      // Prefer server-supplied display metadata (badge_unlock_queue drain
      // provides it); fall back to the slug for legacy dispatchers that don't.
      var label = r.badge_name ||
                  (r.badge_slug ? r.badge_slug.replace(/_/g,' ') : 'badge');
      var icon  = r.badge_icon || 'ti-award';
      var msg = null;
      if (r.awarded && r.badge_slug) {
        msg = 'Badge unlocked: ' + label;
      } else if (r.newly_unlocked && r.newly_unlocked.length > 0) {
        r.newly_unlocked.forEach(function(tier, j) {
          setTimeout(function() {
            var xp = (tier.xp_reward > 0)
              ? ' · +' + Number(tier.xp_reward).toLocaleString() + ' XP'
              : '';
            var gem = tier.gem_name ? ' · ' + tier.gem_name : '';
            window.showToast(label + gem + xp, icon);
          }, (i + j + 1) * 700);
        });
        return;
      }
      if (msg) setTimeout(function(){ window.showToast(msg, icon); }, (i + 1) * 700);
    });
  });

  // On any page that can show toasts, flush unlocks held from earlier pages.
  // Deferred so page scripts have defined showToast by the time this runs.
  window.addEventListener('load', function() {
    setTimeout(function() {
      if (typeof window.DSBadgeCelebrate !== 'function' &&
          typeof window.showToast !== 'function') return;
      var held = dsTakeStashedUnlocks();
      if (!held.length) return;
      window.dispatchEvent(new CustomEvent('ds-badge-unlocked', {
        detail: { results: held }
      }));
    }, 400);
  });

  // Live-update ember count when embers are awarded elsewhere on the page
  window.addEventListener('ds-embers-awarded', function(e){
    var el = document.getElementById('ds-ember-count');
    if (!el) return;
    var current = parseInt((el.textContent||'0').replace(/,/g,'')) || 0;
    el.textContent = (current + (e.detail.amount||0)).toLocaleString();
    el.parentElement.style.transform = 'scale(1.15)';
    setTimeout(function(){ el.parentElement.style.transform = 'scale(1)'; }, 200);
  });
  /* ── DAILY CHECK-IN: click-to-claim calendar (Gaia-style) ─────
     Opened only via the sunrise nav button — never auto-opens.
     Rewards come from the daily_checkin RPC; this UI reads
     user_streaks + daily_checkins (both have SELECT RLS). */
  var dsCkState = null;

  /* ── "NEXT REWARD" COUNTDOWN ──────────────────────────────────
     daily_checkin() enforces a 20-hour floor between claims on top of the
     local-date rule, so "come back tomorrow" was not always true: claim late
     in the evening and the next one genuinely unlocks late the following
     afternoon. ds_my_checkin_status() hands back that exact instant, so the
     modal can state it instead of guessing. */
  var dsCkTimer = null;

  function dsCkCountdownText(iso) {
    var ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return null;
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    var sec = Math.floor((ms % 60000) / 1000);
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + sec + 's';
    return sec + 's';
  }

  function dsCkStopCountdown() {
    if (dsCkTimer) { clearInterval(dsCkTimer); dsCkTimer = null; }
  }

  function dsCkStartCountdown() {
    dsCkStopCountdown();
    var s = dsCkState;
    var el = document.getElementById('ck-next');
    if (!el || !s || !s.claimedToday || !s.claimableAt) return;
    var tick = function() {
      var t = dsCkCountdownText(s.claimableAt);
      if (!t) {
        dsCkStopCountdown();
        el.innerHTML = 'Your next reward is ready \u2014 <b>refresh to claim it</b>.';
        try { localStorage.removeItem(dsCkCacheKey(s.uid)); } catch(e) {}
        dsSetCheckinDot(true);
        return;
      }
      el.innerHTML = 'Next reward unlocks in <b style="color:var(--gold);">' + t + '</b>.';
    };
    tick();
    dsCkTimer = setInterval(tick, 1000);
  }

  /* ── CHECK-IN BUTTON STATE CACHE ──────────────────────────────
     The gold sunrise button must only be lit when a claim would really
     succeed. daily_checkin() owns that decision: it derives "today" from
     profiles.timezone and also enforces a 20-hour real-time floor, so any
     date computed from the browser clock will disagree with it (badly, for
     users west of UTC late in the evening) and the button re-lights on every
     page load. ds_my_checkin_status() returns the exact instant the next
     claim unlocks; we cache that timestamp and stay dimmed until it passes. */
  function dsCkCacheKey(uid) { return 'ds_checkin_next_' + uid; }

  function dsCkCachedClaimed(uid) {
    try {
      var v = localStorage.getItem(dsCkCacheKey(uid));
      return !!(v && Date.parse(v) > Date.now());
    } catch(e) { return false; }
  }

  async function dsRefreshCheckinCache(uid) {
    try {
      var st = await db.rpc('ds_my_checkin_status');
      var d = (st && st.data) || {};
      if (d.authenticated === false) return null;
      if (typeof d.claimed !== 'boolean') return null;
      try {
        if (d.claimed && d.claimable_at) localStorage.setItem(dsCkCacheKey(uid), d.claimable_at);
        else localStorage.removeItem(dsCkCacheKey(uid));
      } catch(e) {}
      dsSetCheckinDot(!d.claimed);
      return d;
    } catch(e) { return null; }
  }

  function dsCkRewardFor(day) {
    if (day === 7) return { embers: 10, flame: true, spark: false };
    return { embers: 2, flame: false, spark: (day === 3 || day === 6) };
  }

  function dsSetCheckinDot(show) {
    var dot = document.getElementById('ds-checkin-dot');
    if (dot) dot.style.display = show ? 'block' : 'none';
    // De-highlight the sunrise button once today's reward is claimed so the
    // nav itself tells you you're done — gold = unclaimed, dimmed = claimed.
    var btn = document.getElementById('ds-checkin-btn');
    if (btn) {
      btn.classList.toggle('claimed', !show);
      btn.title = show ? 'Daily Check-In — claim your reward!' : 'Daily reward claimed — come back tomorrow!';
    }
  }

  function dsInjectCheckinModal() {
    if (document.getElementById('ds-checkin-modal')) return;
    var ov = document.createElement('div');
    ov.className = 'ck-overlay';
    ov.id = 'ds-checkin-modal';
    ov.innerHTML =
      '<div class="ck-modal">' +
        '<div class="ck-head">' +
          '<div class="ck-title"><i class="ti ti-sunrise"></i> Daily Check-In</div>' +
          '<button class="ck-close" onclick="dsCloseCheckin()" title="Close"><i class="ti ti-x"></i></button>' +
        '</div>' +
        '<div class="ck-sub" id="ck-sub">Loading\u2026</div>' +
        '<div class="ck-strip" id="ck-strip"></div>' +
        '<button class="ck-claim-btn" id="ck-claim-btn" style="display:none;" onclick="dsClaimDaily()"></button>' +
        '<div class="ck-cal">' +
          '<div class="ck-cal-title"><span id="ck-month-label"></span><span id="ck-month-count"></span></div>' +
          '<div class="ck-grid" id="ck-grid"></div>' +
          '<div class="ck-foot" id="ck-foot"></div>' +
          '<div class="ck-repair-wrap" id="ck-repair-wrap" style="display:none;">' +
            '<button class="ck-repair-btn" id="ck-repair-btn" onclick="dsRepairStreak()"><i class="ti ti-tool"></i> Repair a missed day <span class="ck-repair-cost">(15 <i class="ti ti-flame"></i>)</span></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    ov.addEventListener('click', function(e){ if (e.target === ov) dsCloseCheckin(); });
    document.body.appendChild(ov);
  }

  window.dsCloseCheckin = function() {
    var ov = document.getElementById('ds-checkin-modal');
    if (ov) ov.classList.remove('open');
    document.body.style.overflow = '';
    dsCkStopCountdown();
  };

  window.dsOpenCheckin = async function() {
    dsInjectCheckinModal();
    var ov = document.getElementById('ds-checkin-modal');
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    try {
      var session = (await db.auth.getSession()).data.session;
      if (!session) { window.location.href = 'auth.html'; return; }
      var uid = session.user.id;
      // "Today" must come from the server: daily_checkin derives the date from
      // profiles.timezone, so computing it from the browser here would show a
      // live claim button that the RPC then answers with already_checked_in,
      // and a calendar off by a day. Fall back to the browser date only if the
      // RPC is unavailable.
      var now = new Date();
      var y, m, d;
      try {
        var sd = await db.rpc('ds_my_checkin_date');
        var parts = (sd && sd.data) ? String(sd.data).split('-') : null;
        if (parts && parts.length === 3) {
          y = parseInt(parts[0], 10);
          m = parseInt(parts[1], 10) - 1;
          d = parseInt(parts[2], 10);
        }
      } catch(e) { /* fall through to the browser date */ }
      if (!(y >= 1970)) { y = now.getFullYear(); m = now.getMonth(); d = now.getDate(); }
      var todayStr = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      var mStart = y + '-' + String(m+1).padStart(2,'0') + '-01';
      var daysInMo = new Date(y, m+1, 0).getDate();
      var mEnd = y + '-' + String(m+1).padStart(2,'0') + '-' + String(daysInMo).padStart(2,'0');
      var yestD = new Date(y, m, d - 1);
      var yest = yestD.getFullYear() + '-' + String(yestD.getMonth()+1).padStart(2,'0') + '-' + String(yestD.getDate()).padStart(2,'0');

      var sRes = await db.from('user_streaks')
        .select('current_streak,longest_streak,last_checkin')
        .eq('user_id', uid).maybeSingle();
      var cRes = await db.from('daily_checkins')
        .select('checkin_date')
        .eq('user_id', uid)
        .gte('checkin_date', mStart).lte('checkin_date', mEnd);

      var streak = sRes.data || { current_streak: 0, longest_streak: 0, last_checkin: null };
      var claimedDates = {};
      (cRes.data || []).forEach(function(r){ claimedDates[r.checkin_date] = true; });

      // claimedToday: true if last_checkin matches local today OR calendar already
      // has a row for today (guards against UTC/local date mismatch on old rows).
      var claimedToday = (streak.last_checkin === todayStr) || !!(claimedDates[todayStr]);
      var effStreak;
      if (claimedToday) effStreak = streak.current_streak || 1;
      else if (streak.last_checkin === yest || claimedDates[yest]) effStreak = (streak.current_streak || 0) + 1;
      else effStreak = 1;

      var repairedToday = false;
      try {
        var rrRes = await db.from('ember_spends').select('id')
          .eq('user_id', uid).eq('spend_type', 'streak_repair')
          .gte('created_at', todayStr + 'T00:00:00.000Z').limit(1);
        repairedToday = !!(rrRes.data && rrRes.data.length);
      } catch(e) {}

      dsCkState = {
        uid: uid, todayStr: todayStr, claimedToday: claimedToday,
        effStreak: effStreak, cycleDay: ((effStreak - 1) % 7) + 1,
        streak: streak, claimedDates: claimedDates, y: y, m: m,
        repairedToday: repairedToday
      };
      // Re-sync the nav button against the server's own answer, and keep the
      // exact unlock instant so the modal can count down to it.
      var ckStatus = await dsRefreshCheckinCache(uid);
      if (ckStatus) {
        dsCkState.claimableAt = ckStatus.claimable_at || null;
        if (typeof ckStatus.claimed === 'boolean') dsCkState.claimedToday = ckStatus.claimed;
        claimedToday = dsCkState.claimedToday;
      }
      dsSetCheckinDot(!claimedToday);
      dsRenderCheckin();
    } catch(e) {
      var sub = document.getElementById('ck-sub');
      if (sub) sub.textContent = 'Could not load check-in data \u2014 please try again shortly.';
    }
  };

  function dsRenderCheckin() {
    var s = dsCkState;
    if (!s) return;
    var sub = document.getElementById('ck-sub');
    if (s.claimedToday) {
      sub.innerHTML = 'Day <b style="color:var(--gold);">' + s.effStreak + '</b> claimed \u2014 keep the streak going! Longest streak: <b>' + Math.max(s.streak.longest_streak || 0, s.effStreak) + '</b> days.'
        + '<div id="ck-next" style="margin-top:6px;"></div>';
    } else if (s.effStreak > 1) {
      sub.innerHTML = 'You\u2019re on a <b style="color:var(--gold);">' + (s.effStreak - 1) + '-day</b> streak \u2014 claim now to make it <b>' + s.effStreak + '</b>!';
    } else {
      sub.innerHTML = 'Check in daily to earn <b>Embers</b>, free <b>Sparks of Dawn</b>, and a <b>Celestial Flame</b> every 7th day!';
    }

    var html = '';
    for (var d = 1; d <= 7; d++) {
      var r = dsCkRewardFor(d);
      var cls = 'ck-tile' + (d === 7 ? ' day7' : '');
      var claimable = false;
      if (d < s.cycleDay || (d === s.cycleDay && s.claimedToday)) cls += ' done';
      else if (d === s.cycleDay && !s.claimedToday) { cls += ' claim'; claimable = true; }
      var bonus = r.flame ? '+1 Flame' : (r.spark ? '+1 Spark' : 'Embers');
      html += '<div class="' + cls + '"' + (claimable ? ' onclick="dsClaimDaily()" title="Click to claim today\u2019s reward!"' : '') + '>' +
        '<div class="ck-d">Day ' + d + '</div>' +
        '<div class="ck-ic"><i class="ti ' + (r.flame ? 'ti-sparkles' : 'ti-flame') + '"></i></div>' +
        '<div class="ck-r">+' + r.embers + '<span class="ck-bonus">' + bonus + '</span></div>' +
        '</div>';
    }
    document.getElementById('ck-strip').innerHTML = html;

    dsCkStartCountdown();

    var btn = document.getElementById('ck-claim-btn');
    btn.style.display = s.claimedToday ? 'none' : 'block';
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-sunrise"></i> Claim Day ' + s.effStreak + ' Reward';

    // Month calendar (perfect-month / Dawnkeeper progress)
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('ck-month-label').textContent = months[s.m] + ' ' + s.y;
    var daysInMonth = new Date(Date.UTC(s.y, s.m + 1, 0)).getUTCDate();
    var firstDow = new Date(Date.UTC(s.y, s.m, 1)).getUTCDay();
    var todayDom = parseInt(s.todayStr.slice(8), 10);
    var g = '';
    ['S','M','T','W','T','F','S'].forEach(function(w){ g += '<div class="ck-wd">' + w + '</div>'; });
    for (var b = 0; b < firstDow; b++) g += '<div class="ck-day blank"></div>';
    var claimedCount = 0, missedAny = false;
    for (var dd = 1; dd <= daysInMonth; dd++) {
      var dStr = s.todayStr.slice(0, 8) + String(dd).padStart(2, '0');
      var c = 'ck-day';
      if (s.claimedDates[dStr]) { c += ' claimed'; claimedCount++; }
      else if (dd < todayDom) { c += ' missed'; missedAny = true; }
      else if (dd > todayDom) c += ' future';
      if (dd === todayDom) c += ' today';
      g += '<div class="' + c + '">' + (s.claimedDates[dStr] ? '<i class="ti ti-check"></i>' : dd) + '</div>';
    }
    document.getElementById('ck-grid').innerHTML = g;
    document.getElementById('ck-month-count').textContent = claimedCount + '/' + daysInMonth + ' days';
    document.getElementById('ck-foot').innerHTML = missedAny
      ? 'A <b>perfect month</b> (every single day claimed) earns the <b>Dawnkeeper</b> badge \u2014 your next chance begins on the 1st!'
      : 'Claim <b>every day</b> this month to earn the <b>Dawnkeeper</b> badge! \ud83c\udfc6';

    var repWrap = document.getElementById('ck-repair-wrap');
    if (repWrap) repWrap.style.display = (missedAny && !s.repairedToday) ? 'block' : 'none';
  }

  window.dsRepairStreak = async function() {
    var s = dsCkState;
    if (!s) return;
    var btn = document.getElementById('ck-repair-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Repairing\u2026'; }
    try {
      var res = await db.rpc('repair_missed_checkin');
      if (!res.data || !res.data.success) {
        var msg = (res.data && res.data.error) || 'repair_failed';
        var friendly = {
          already_repaired_today: 'You can only repair one missed day per day \u2014 try again tomorrow.',
          nothing_to_repair: 'No missed days to repair this month \u2014 nice work!',
          insufficient_embers: 'You need 15 Embers to repair a missed day.',
          not_authenticated: 'Please sign in first.'
        }[msg] || msg;
        if (typeof window.showToast === 'function') window.showToast(friendly, 'ti-x');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-tool"></i> Repair a missed day <span class="ck-repair-cost">(15 <i class="ti ti-flame"></i>)</span>'; }
        return;
      }
      var el = document.getElementById('ds-ember-count');
      if (el) {
        var cur = parseInt((el.textContent || '0').replace(/,/g, '')) || 0;
        el.textContent = Math.max(0, cur - (res.data.ember_cost || 15)).toLocaleString();
      }
      s.claimedDates[res.data.repaired_date] = true;
      s.streak.current_streak = res.data.new_streak;
      s.streak.longest_streak = Math.max(s.streak.longest_streak || 0, res.data.new_streak);
      s.repairedToday = true;
      if (typeof window.showToast === 'function') window.showToast('Missed day repaired! Streak restored to ' + res.data.new_streak + ' \ud83d\udd25', 'ti-tool');
      dsRenderCheckin();
    } catch(e) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-tool"></i> Repair a missed day <span class="ck-repair-cost">(15 <i class="ti ti-flame"></i>)</span>'; }
    }
  };

  window.dsClaimDaily = async function() {
    var s = dsCkState;
    if (!s || s.claimedToday) return;
    var btn = document.getElementById('ck-claim-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Claiming\u2026'; }
    try {
      var res = await db.rpc('daily_checkin', { p_local_date: s.todayStr });
      if (!res.data || !res.data.success) throw new Error('claim_failed');
      var ckAfter = await dsRefreshCheckinCache(s.uid);
      if (ckAfter) s.claimableAt = ckAfter.claimable_at || null;
      if (!res.data.already_checked_in) {
        var rw = res.data.rewards || {};
        if (rw.embers) {
          var el = document.getElementById('ds-ember-count');
          if (el) {
            var cur = parseInt((el.textContent || '0').replace(/,/g, '')) || 0;
            el.textContent = (cur + rw.embers).toLocaleString();
            el.parentElement.style.transform = 'scale(1.15)';
            setTimeout(function(){ el.parentElement.style.transform = 'scale(1)'; }, 200);
          }
        }
        // Pages listen to refresh their own state (e.g. free Sparks on story.html).
        // NOTE: intentionally NOT dispatching ds-embers-awarded — the ember
        // counter was already updated directly above (avoids double-count).
        window.dispatchEvent(new CustomEvent('ds-checkin-complete', { detail: res.data }));
        if (typeof window.showToast === 'function') {
          var bits = ['Day ' + res.data.streak + ' claimed! +' + (rw.embers || 0) + ' Embers \ud83d\udd25'];
          if (rw.spark_grant > 0) bits.push('+' + rw.spark_grant + ' Spark' + (rw.spark_grant !== 1 ? 's' : '') + ' of Dawn \u26a1 (Monday bonus!)');
          if (rw.scribes_flame > 0) bits.push('+1 Scribe\u2019s Flame \uD83D\uDD16 (monthly vote unlocked!)');
          if (rw.infernal_dawn > 0) bits.push('+1 Infernal Dawn \u2600\uFE0F (yearly vote unlocked!)');
          // Due but withheld: the yearly token needs 3 months of account tenure.
          else if (rw.infernal_locked) {
            bits.push('Infernal Dawn \u2600\uFE0F unlocks after 3 months'
              + (rw.infernal_eligible_on ? ' \u2014 eligible ' + rw.infernal_eligible_on : ''));
          }
          if (rw.perfect_month) bits.push('Perfect month! Dawnkeeper honor earned \ud83c\udfc6');
          bits.forEach(function(bb, bi){ setTimeout(function(){ window.showToast(bb, 'ti-flame'); }, bi * 900); });
        }
      }
      s.claimedToday = true;
      s.effStreak = res.data.streak || s.effStreak;
      s.cycleDay = res.data.cycle_day || s.cycleDay;
      s.claimedDates[s.todayStr] = true;
      dsSetCheckinDot(false);
      dsRenderCheckin();
    } catch(e) {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Claim failed \u2014 tap to try again'; }
    }
  };

  }); // dsWaitForDb

})();
