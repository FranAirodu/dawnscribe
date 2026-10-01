/* ??????????????????????????????????????????????????????????????
   DawnScribe - Achievement cards (Steam-style)

   Every badge unlock appears as a card in the bottom-right corner and
   STAYS there - on this page, the next page, another tab, another device -
   until the user presses its x. A reward nobody saw is a reward that
   didn't happen, so nothing here closes itself.

   Where the cards come from:
   * Server: badge_unlock_queue. drain_badge_unlocks() returns every unlock
     the user hasn't closed; dismiss_badge_unlock(id) closes one. This file
     asks for them itself on every page load, so it works on any page that
     loads it (nav.js injects it everywhere; index.html includes it).
   * Callers: nav.js / index.html still pass unlocks to DSBadgeCelebrate().
     Those that match a server card are merged into it; anything the server
     doesn't know about is kept in localStorage until closed.

   Accessibility: no motion when the OS or the site's reduce-motion pref is
   on; cards are a labelled region, x is a real button, Esc is NOT bound
   (closing must be a deliberate choice).
   ?????????????????????????????????????????????????????????????? */
(function () {
  'use strict';
  if (window.DSBadgeCelebrate) return;

  var SB_URL = 'https://cajjyyskpmjnpcxcfeuk.supabase.co';
  var SB_KEY = 'sb_publishable_ZZjE1u_pQn5YkrMKH4P3KQ_HSGqTjzx';
  var LOCAL_KEY = 'ds_unclosed_unlocks';      // unlocks the server doesn't track
  var BUS_KEY = 'ds_unlock_closed';           // tells other tabs a card was closed
  var MAX_VISIBLE = 3;

  var cards = [];          // [{ key, id, name, icon, gem_name, gem_color, xp_reward, desc }]
  var serverLoaded = false;
  var held = [];           // caller items waiting for the server list (to de-duplicate)
  var root = null, ownDb = null;

  /* \u2500\u2500 helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  function reducedMotion() {
    try {
      if (document.documentElement.classList.contains('ds-reduced-motion')) return true;
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function iconClass(s) { s = String(s || '').replace(/[^a-z0-9-]/gi, ''); return /^ti-/.test(s) ? s : 'ti-award'; }
  function color(c, fallback) { return /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : fallback; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[_\s]+/g, ' ').trim(); }
  function looseKey(it) { return 'l:' + norm(it.name) + '|' + norm(it.gem_name); }

  function client() {
    try { if (window.db && typeof window.db.rpc === 'function') return window.db; } catch (e) {}
    try { if (typeof db !== 'undefined' && db && typeof db.rpc === 'function') return db; } catch (e) {}
    if (!ownDb && window.supabase && typeof window.supabase.createClient === 'function') {
      try { ownDb = window.supabase.createClient(SB_URL, SB_KEY); } catch (e) {}
    }
    return ownDb;
  }

  function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') || []; } catch (e) { return []; } }
  function writeLocal(list) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(-20))); } catch (e) {} }

  /* \u2500\u2500 styles \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  function injectStyles() {
    if (document.getElementById('ds-ach-css')) return;
    var st = document.createElement('style');
    st.id = 'ds-ach-css';
    st.textContent = [
      '.ds-ach{position:fixed;right:20px;bottom:20px;z-index:99990;display:flex;flex-direction:column-reverse;gap:10px;',
      'width:340px;max-width:calc(100vw - 32px);pointer-events:none;font-family:Lato,system-ui,sans-serif;}',
      '.ds-ach-card{pointer-events:auto;position:relative;display:flex;gap:14px;align-items:center;padding:14px 40px 14px 14px;',
      'border-radius:10px;background:linear-gradient(135deg,#1d1f2b 0%,#14151e 100%);color:#e8e8f2;',
      'border:1px solid rgba(255,255,255,.08);box-shadow:0 14px 36px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4);',
      'overflow:hidden;transform:translateY(24px);opacity:0;transition:transform .38s cubic-bezier(.2,1.2,.4,1),opacity .3s ease;}',
      '.ds-ach-card.in{transform:none;opacity:1;}',
      '.ds-ach-card.out{transform:translateX(110%);opacity:0;transition:transform .28s ease-in,opacity .28s ease-in;}',
      '.ds-ach-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--gem);}',
      '.ds-ach-card::after{content:"";position:absolute;inset:0;pointer-events:none;',
      'background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.07) 45%,transparent 60%);transform:translateX(-100%);}',
      '.ds-ach-card.in::after{animation:ds-ach-shine 1.6s .3s ease-out 1;}',
      '@keyframes ds-ach-shine{to{transform:translateX(100%);}}',
      '.ds-ach-gem{width:56px;height:56px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;',
      'font-size:30px;color:#fff;background:radial-gradient(circle at 35% 30%,var(--gem-soft),rgba(0,0,0,.35));',
      'border:2px solid var(--gem);box-shadow:0 0 16px var(--gem-glow),inset 0 0 10px rgba(0,0,0,.4);}',
      '.ds-ach-body{min-width:0;flex:1;}',
      '.ds-ach-kick{font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:#f0c674;font-weight:700;margin-bottom:2px;}',
      '.ds-ach-name{font-family:Cinzel,Georgia,serif;font-size:16px;font-weight:700;color:#fff;line-height:1.25;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ds-ach-meta{font-size:12.5px;color:#a9a9c2;margin-top:2px;}',
      '.ds-ach-meta b{color:var(--gem-text);font-weight:700;}',
      '.ds-ach-desc{font-size:12px;color:#8e8ea8;margin-top:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
      '.ds-ach-x{position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:6px;border:0;cursor:pointer;',
      'background:rgba(255,255,255,.06);color:#c9c9dc;font-size:15px;line-height:26px;text-align:center;padding:0;}',
      '.ds-ach-x:hover,.ds-ach-x:focus-visible{background:rgba(255,255,255,.16);color:#fff;outline:none;}',
      '.ds-ach-more{pointer-events:auto;align-self:flex-end;display:flex;gap:8px;align-items:center;font-size:12px;color:#c9c9dc;',
      'background:#1a1b25;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:5px 6px 5px 12px;box-shadow:0 6px 18px rgba(0,0,0,.45);}',
      '.ds-ach-more button{border:0;cursor:pointer;border-radius:12px;padding:3px 10px;font-size:11.5px;background:rgba(255,255,255,.08);color:#e8e8f2;}',
      '.ds-ach-more button:hover{background:rgba(255,255,255,.16);}',
      '.ds-ach.calm .ds-ach-card,.ds-ach.calm .ds-ach-card.out{transition:none;transform:none;}',
      '.ds-ach.calm .ds-ach-card.in::after{animation:none;}',
      '@media (max-width:600px){.ds-ach{right:16px;left:16px;bottom:16px;width:auto;max-width:none;}',
      '.ds-ach-gem{width:46px;height:46px;font-size:24px;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  function ensureRoot() {
    if (root && document.body.contains(root)) return root;
    injectStyles();
    root = document.createElement('div');
    root.className = 'ds-ach' + (reducedMotion() ? ' calm' : '');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Achievements');
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
    return root;
  }

  function rgba(hex, a) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex) ||
            /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
    if (!m) return 'rgba(240,198,116,' + a + ')';
    var p = function (x) { return parseInt(x.length === 1 ? x + x : x, 16); };
    return 'rgba(' + p(m[1]) + ',' + p(m[2]) + ',' + p(m[3]) + ',' + a + ')';
  }

  /* \u2500\u2500 rendering \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  function cardEl(c) {
    var gem = color(c.gem_color, '#f0c674');
    var el = document.createElement('div');
    el.className = 'ds-ach-card';
    el.setAttribute('data-key', c.key);
    el.style.setProperty('--gem', gem);
    el.style.setProperty('--gem-soft', rgba(gem, .55));
    el.style.setProperty('--gem-glow', rgba(gem, .35));
    el.style.setProperty('--gem-text', /^#[0-4]/.test(gem) ? '#d6d6e6' : gem);
    var xp = Number(c.xp_reward) > 0 ? ' \u00b7 +' + Number(c.xp_reward).toLocaleString() + ' XP' : '';
    el.innerHTML =
      '<div class="ds-ach-gem" aria-hidden="true"><i class="ti ' + iconClass(c.icon) + '"></i></div>' +
      '<div class="ds-ach-body">' +
        '<div class="ds-ach-kick">' + (c.kind === 'reward' ? 'Reward earned' : 'Achievement unlocked') + '</div>' +
        '<div class="ds-ach-name" title="' + esc(c.name) + '">' + esc(c.name) + '</div>' +
        (c.kind === 'reward' ? '' : '<div class="ds-ach-meta">' + (c.gem_name ? '<b>' + esc(c.gem_name) + '</b> tier' : 'Badge earned') + esc(xp) + '</div>') +
        (c.desc ? '<div class="ds-ach-desc">' + esc(c.desc) + '</div>' : '') +
      '</div>' +
      '<button type="button" class="ds-ach-x" aria-label="Close: ' + esc(c.name) + '">\u2715</button>';
    el.querySelector('.ds-ach-x').addEventListener('click', function () { close(c.key, true); });
    return el;
  }

  function render() {
    if (!document.body) return;
    var r = ensureRoot();
    var visible = cards.slice(0, MAX_VISIBLE);
    // Remove cards that are no longer visible.
    Array.prototype.forEach.call(r.querySelectorAll('.ds-ach-card'), function (el) {
      if (!visible.some(function (c) { return c.key === el.getAttribute('data-key'); }) && !el.classList.contains('out')) el.remove();
    });
    // Add new ones (column-reverse: first in DOM sits at the bottom).
    visible.forEach(function (c, i) {
      if (r.querySelector('.ds-ach-card[data-key="' + CSS.escape(c.key) + '"]')) return;
      var el = cardEl(c);
      var before = r.querySelectorAll('.ds-ach-card')[i] || r.querySelector('.ds-ach-more');
      r.insertBefore(el, before || null);
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('in'); }); });
    });
    var more = r.querySelector('.ds-ach-more');
    var extra = cards.length - visible.length;
    if (cards.length > 1) {
      if (!more) { more = document.createElement('div'); more.className = 'ds-ach-more'; r.appendChild(more); }
      more.innerHTML = '<span>' + (extra > 0 ? '+' + extra + ' more' : cards.length + ' achievements') + '</span>' +
        '<button type="button">Close all</button>';
      more.querySelector('button').onclick = closeAll;
    } else if (more) more.remove();
    if (!cards.length && r) r.remove(), root = null;
  }

  /* \u2500\u2500 state \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  function has(key) { return cards.some(function (c) { return c.key === key; }); }

  function add(c) {
    if (!c || !c.name || has(c.key)) return;
    // A caller item that matches a server card is the same unlock.
    if (!c.id && cards.some(function (x) { return x.id && looseKey(x) === c.key; })) return;
    if (c.id) cards = cards.filter(function (x) { return !(!x.id && x.key === looseKey(c)); });
    cards.push(c);
  }

  function close(key, broadcast) {
    var c = cards.filter(function (x) { return x.key === key; })[0];
    cards = cards.filter(function (x) { return x.key !== key; });
    if (c && c.id) {
      var d = client();
      if (d) d.rpc('dismiss_badge_unlock', { p_id: c.id }).then(function () {}, function () {});
    }
    writeLocal(readLocal().filter(function (x) { return x.key !== key; }));
    if (broadcast) { try { localStorage.setItem(BUS_KEY, key + '|' + Date.now()); } catch (e) {} }
    var el = root && root.querySelector('.ds-ach-card[data-key="' + CSS.escape(key) + '"]');
    if (el && !reducedMotion()) {
      el.classList.add('out');
      setTimeout(function () { el.remove(); render(); }, 280);
    } else { if (el) el.remove(); render(); }
  }

  function closeAll() {
    var ids = cards.filter(function (c) { return c.id; }).length;
    cards.slice().forEach(function (c) { if (!c.id) close(c.key, true); });
    if (ids) {
      var d = client();
      if (d) d.rpc('dismiss_badge_unlock', { p_id: null }).then(function () {}, function () {});
      cards.filter(function (c) { return c.id; }).forEach(function (c) {
        try { localStorage.setItem(BUS_KEY, c.key + '|' + Date.now()); } catch (e) {}
      });
      cards = cards.filter(function (c) { return !c.id; });
    }
    render();
  }

  function fromServer(u) {
    return {
      key: 's:' + u.id, id: u.id, kind: u.kind || 'badge',
      name: u.badge_name || String(u.badge_slug || 'Badge').replace(/_/g, ' '),
      icon: u.badge_icon, gem_name: u.gem_name, gem_color: u.gem_color || u.badge_color,
      xp_reward: u.xp_reward, desc: u.badge_description || ''
    };
  }

  function loadServer() {
    var d = client();
    if (!d || !d.auth) { serverLoaded = true; flushHeld(); return; }
    d.auth.getSession().then(function (s) {
      if (!s || !s.data || !s.data.session) { serverLoaded = true; flushHeld(); return; }
      return d.rpc('drain_badge_unlocks').then(function (res) {
        var list = (res && res.data && res.data.unlocks) || [];
        list.forEach(function (u) { add(fromServer(u)); });
      });
    }).then(function () {}, function () {}).then(function () {
      serverLoaded = true; flushHeld(); render();
    });
  }

  function flushHeld() {
    held.forEach(function (c) {
      add(c);
      if (!c.id && has(c.key)) {
        var loc = readLocal();
        if (!loc.some(function (x) { return x.key === c.key; })) { loc.push(c); writeLocal(loc); }
      }
    });
    held = [];
    render();
  }

  /* items: [{ id?, name, icon, gem_name, gem_color, xp_reward, description? }] */
  window.DSBadgeCelebrate = function (items) {
    if (!items) return;
    if (!Array.isArray(items)) items = [items];
    items.forEach(function (it) {
      if (!it || !it.name) return;
      var c = it.id ? fromServer({ id: it.id, badge_name: it.name, badge_icon: it.icon, gem_name: it.gem_name,
                                   gem_color: it.gem_color, xp_reward: it.xp_reward, badge_description: it.description })
                    : { key: '', name: it.name, icon: it.icon, gem_name: it.gem_name, gem_color: it.gem_color,
                        xp_reward: it.xp_reward, desc: it.description || '' };
      if (!c.id) c.key = looseKey(c);
      held.push(c);
    });
    // Wait for the server list so the same unlock never shows twice; the
    // server answer usually lands well inside this window.
    if (serverLoaded) start(flushHeld); else setTimeout(function () { if (held.length && !serverLoaded) start(flushHeld); }, 4000);
  };
  window.DSAchievements = { closeAll: closeAll, refresh: loadServer };

  // A check-in can bring reward cards (Sparks, Scribe's Flame, Infernal Dawn,
  // the 7-day bonus); the server files them, so just ask again after a claim.
  window.addEventListener('ds-checkin-complete', function () { setTimeout(loadServer, 400); });

  // Another tab closed a card: close it here too.
  window.addEventListener('storage', function (e) {
    if (e.key !== BUS_KEY || !e.newValue) return;
    var key = e.newValue.split('|')[0];
    if (has(key)) close(key, false);
  });

  function start(fn) {
    if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
  }
  start(function () {
    readLocal().forEach(add);
    render();
    // Page scripts create their Supabase client during load; ask once it exists.
    if (document.readyState === 'complete') loadServer();
    else window.addEventListener('load', function () { setTimeout(loadServer, 50); });
  });
})();
