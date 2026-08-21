/* ── DAWNSCRIBE CREATOR AGE GATE ───────────────────────────────────────
   Client-side companion to the server-side 18+ enforcement.

   The DATABASE is the real control (RLS policies + triggers on
   cosmetic_items / scrolls / character_license_agreements). This file only
   stops under-18 users from walking into a wall they can't pass — it is a
   UX layer, never a security layer. Never rely on it alone.

   Include on every page, just before </body> and AFTER the page's own
   Supabase client is created:
       <script src="creatorAgeGate.js"></script>

   Public API (window.DSAgeGate):
     await DSAgeGate.status()          -> { authenticated, is_adult, has_attestation,
                                            can_monetize, needs_attestation, has_dob }
     await DSAgeGate.refresh()         -> re-fetch, ignoring cache
     await DSAgeGate.ensureAttestation() -> true if signed (shows modal if needed)
     DSAgeGate.showWall(opts)          -> replace #main-content with an 18+ notice
─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var CACHE_KEY = 'ds_monetization_status';
  var CACHE_MS = 5 * 60 * 1000;
  var AGREEMENT_VERSION = 'v1';

  // Anchors that lead to a paid-listing flow. Hidden for under-18 accounts.
  var GATED_HREFS = ['scroll-create.html', 'banner-create.html', 'cosmetic-create.html'];

  var _status = null;
  var _inflight = null;

  // ── client lookup ───────────────────────────────────────────────────
  // Pages declare `const db = window.supabase.createClient(...)` at script
  // top level, which is a global lexical binding (not a window property),
  // so this has to be a try/catch on the bare identifier — same approach
  // nav.js uses.
  function getDb() {
    try { if (typeof db !== 'undefined' && db) return db; } catch (e) {}
    if (window.db) return window.db;
    return null;
  }

  function waitForDb(timeoutMs) {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function poll() {
        var c = getDb();
        if (c) return resolve(c);
        if (Date.now() - started > (timeoutMs || 8000)) return resolve(null);
        setTimeout(poll, 60);
      })();
    });
  }

  // ── status ──────────────────────────────────────────────────────────
  // Keyed by user id. sessionStorage survives a sign-out, so an unkeyed cache
  // handed the next account in the same tab the previous account's adult
  // status for up to five minutes - in both directions.
  function cacheKeyFor(uid) { return CACHE_KEY + ':' + uid; }

  function readCache(uid) {
    if (!uid) return null;
    try {
      var raw = sessionStorage.getItem(cacheKeyFor(uid));
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || (Date.now() - obj.t) > CACHE_MS) return null;
      return obj.v;
    } catch (e) { return null; }
  }

  function writeCache(uid, v) {
    if (!uid) return;
    try { sessionStorage.setItem(cacheKeyFor(uid), JSON.stringify({ t: Date.now(), v: v })); } catch (e) {}
  }

  function clearCache() {
    try {
      // Legacy unkeyed entry, plus every per-user entry in this tab.
      sessionStorage.removeItem(CACHE_KEY);
      for (var i = sessionStorage.length - 1; i >= 0; i--) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf(CACHE_KEY + ':') === 0) sessionStorage.removeItem(k);
      }
    } catch (e) {}
  }

  var SIGNED_OUT = {
    authenticated: false, is_adult: false, has_attestation: false,
    can_monetize: false, needs_attestation: false, has_dob: false
  };

  async function fetchStatus(force) {
    if (!force && _status) return _status;
    if (_inflight) return _inflight;

    var p = (async function () {
      var client = await waitForDb();
      if (!client) return SIGNED_OUT;

      var uid = null;
      try {
        var sess = await client.auth.getSession();
        uid = (sess && sess.data && sess.data.session && sess.data.session.user)
          ? sess.data.session.user.id : null;
      } catch (e) { return SIGNED_OUT; }

      if (!uid) { _status = SIGNED_OUT; return _status; }

      // Cache is consulted only once the session is known, so it can be keyed
      // by user. getSession() reads local storage, so this costs nothing.
      if (!force) {
        var cached = readCache(uid);
        if (cached) { _status = cached; return cached; }
      }

      try {
        var res = await client.rpc('get_monetization_status');
        if (res.error) {
          // Fail CLOSED on the UI side: if we can't confirm adulthood we do
          // not show monetization entry points. The DB would reject anyway.
          console.warn('[DSAgeGate] status check failed:', res.error.message);
          _status = Object.assign({}, SIGNED_OUT, { authenticated: true });
          return _status;
        }
        _status = res.data || SIGNED_OUT;
        writeCache(uid, _status);
        return _status;
      } catch (e) {
        console.warn('[DSAgeGate] status check threw:', e);
        return Object.assign({}, SIGNED_OUT, { authenticated: true });
      }
    })();

    // The clear MUST hang off the promise, not off a `finally` inside it.
    // Three of the paths above return before that block is ever entered
    // (no client, getSession threw, no session), which left _inflight
    // pointing at a resolved signed-out promise forever. Because the
    // `if (_inflight)` guard runs even when force is true, refresh() then
    // returned that stale result for the rest of the page's life: an adult
    // saw the 18+ wall and ensureAttestation() resolved false with no error.
    _inflight = p;
    var clear = function () { _inflight = null; };
    p.then(clear, clear);
    return p;
  }

  // ── hide monetization entry points ──────────────────────────────────
  function isGatedAnchor(a) {
    var href = a.getAttribute('href') || '';
    for (var i = 0; i < GATED_HREFS.length; i++) {
      if (href.indexOf(GATED_HREFS[i]) === 0 || href.indexOf('/' + GATED_HREFS[i]) > -1) return true;
    }
    return false;
  }

  function hideGatedLinks(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var anchors;
    try { anchors = scope.querySelectorAll('a[href]'); } catch (e) { return; }
    Array.prototype.forEach.call(anchors, function (a) {
      if (a.getAttribute('data-ds-age-hidden')) return;
      if (!isGatedAnchor(a)) return;
      a.setAttribute('data-ds-age-hidden', '1');
      a.style.display = 'none';
      a.setAttribute('aria-hidden', 'true');
      a.setAttribute('tabindex', '-1');
    });
    // Anything explicitly marked by a page.
    try {
      Array.prototype.forEach.call(scope.querySelectorAll('[data-requires-adult]'), function (el) {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
      });
    } catch (e) {}
  }

  function watchForGatedLinks() {
    hideGatedLinks(document);
    // nav.js, index.html's duplicate nav and profile.html's showcase all
    // inject their markup asynchronously, so a one-shot pass isn't enough.
    try {
      var obs = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            if (added[j].nodeType === 1) hideGatedLinks(added[j]);
          }
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  // ── 18+ wall ────────────────────────────────────────────────────────
  function showWall(opts) {
    opts = opts || {};
    var main = document.getElementById('main-content');
    var host = main || document.querySelector('.page') || document.body;
    if (main) main.style.display = 'none';

    if (document.getElementById('ds-age-wall')) {
      document.getElementById('ds-age-wall').style.display = 'block';
      return;
    }

    var wall = document.createElement('div');
    wall.id = 'ds-age-wall';
    wall.setAttribute('role', 'status');
    wall.style.cssText = 'text-align:center;padding:72px 20px;max-width:620px;margin:0 auto;';
    wall.innerHTML =
      '<i class="ti ti-cake" style="font-size:48px;color:var(--text3);display:block;margin-bottom:16px;"></i>' +
      '<h2 style="font-family:\'Cinzel\',serif;font-size:20px;margin-bottom:12px;color:var(--text);">' +
        (opts.title || 'You need to be 18 to sell on DawnScribe') + '</h2>' +
      '<p style="color:var(--text2);font-size:14px;line-height:1.7;margin-bottom:14px;">' +
        (opts.body || 'Selling items means receiving real money, which our payment provider and ' +
         'tax rules require an adult account holder for. This isn\'t a judgement about your work.') +
      '</p>' +
      '<p style="color:var(--text2);font-size:14px;line-height:1.7;margin-bottom:24px;">' +
        'Everything else is still open to you &mdash; publish novels and artwork, join collaborations, ' +
        'earn and spend Embers, and get credited on work you help make.' +
      '</p>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
        '<a href="creator.html" style="background:var(--accent2);color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Back to your works</a>' +
        '<a href="guidelines.html#avatar-marketplace" style="border:1px solid var(--border);color:var(--text2);padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Read the rule</a>' +
      '</div>';

    if (main && main.parentNode) main.parentNode.insertBefore(wall, main);
    else host.appendChild(wall);
  }

  // ── attestation modal ───────────────────────────────────────────────
  function attestationHtml() {
    return '' +
    '<div id="ds-attest-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9998;"></div>' +
    '<div id="ds-attest-modal" role="dialog" aria-modal="true" aria-labelledby="ds-attest-title" ' +
      'style="position:fixed;z-index:9999;top:50%;left:50%;transform:translate(-50%,-50%);width:min(560px,92vw);' +
      'max-height:86vh;overflow-y:auto;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:26px;">' +
      '<h3 id="ds-attest-title" style="font-family:\'Cinzel\',serif;font-size:19px;color:var(--text);margin-bottom:6px;">' +
        'Creator Age &amp; Liability Agreement</h3>' +
      '<p style="color:var(--text3);font-size:12px;margin-bottom:16px;">Required once, before your first item goes up for review.</p>' +

      '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px 18px;' +
        'font-size:13px;line-height:1.75;color:var(--text2);margin-bottom:18px;">' +
        '<p style="margin-bottom:10px;">By submitting an item for sale on DawnScribe, you confirm that:</p>' +
        '<ul style="margin:0 0 10px 18px;padding:0;list-style:disc;">' +
          '<li style="margin-bottom:6px;">You are <strong style="color:var(--text);">18 years of age or older</strong>, and the date of birth on your account is accurate.</li>' +
          '<li style="margin-bottom:6px;">You have the legal capacity to enter into this agreement and to receive payment.</li>' +
          '<li style="margin-bottom:6px;">The work you are submitting is your own, or you have written permission to sell it.</li>' +
          '<li style="margin-bottom:6px;">You are responsible for any tax owed on money you receive through DawnScribe.</li>' +
          '<li>If you have given a false date of birth, you accept responsibility for that misrepresentation, and DawnScribe may remove your listings, withhold or reverse payouts, and close your account.</li>' +
        '</ul>' +
        '<p style="margin:0;">DawnScribe relies on this confirmation in good faith. Payouts are additionally subject to identity verification by our payment provider, which independently requires an adult account holder.</p>' +
      '</div>' +

      '<label for="ds-attest-check" style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;margin-bottom:20px;">' +
        '<input type="checkbox" id="ds-attest-check" style="margin-top:3px;width:16px;height:16px;flex-shrink:0;cursor:pointer;"/>' +
        '<span style="font-size:13.5px;color:var(--text);line-height:1.6;">I confirm I am 18 or older and I agree to the above.</span>' +
      '</label>' +

      '<div id="ds-attest-err" style="display:none;color:var(--red,#f87171);font-size:13px;margin-bottom:14px;"></div>' +

      '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">' +
        '<button type="button" id="ds-attest-cancel" style="background:transparent;border:1px solid var(--border);' +
          'color:var(--text2);padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:\'Lato\',sans-serif;">Cancel</button>' +
        '<button type="button" id="ds-attest-accept" disabled style="background:var(--accent2);border:none;color:#fff;' +
          'padding:9px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;opacity:0.5;font-family:\'Lato\',sans-serif;">Agree &amp; Continue</button>' +
      '</div>' +
    '</div>';
  }

  function ensureAttestation() {
    return new Promise(function (resolve) {
      fetchStatus().then(function (st) {
        if (!st.authenticated) return resolve(false);
        if (!st.is_adult) { showWall(); return resolve(false); }
        if (st.has_attestation) return resolve(true);

        var holder = document.createElement('div');
        holder.id = 'ds-attest-holder';
        holder.innerHTML = attestationHtml();
        document.body.appendChild(holder);

        var check = document.getElementById('ds-attest-check');
        var accept = document.getElementById('ds-attest-accept');
        var cancel = document.getElementById('ds-attest-cancel');
        var errBox = document.getElementById('ds-attest-err');
        var lastFocus = document.activeElement;

        function close(result) {
          document.removeEventListener('keydown', onKey);
          if (holder.parentNode) holder.parentNode.removeChild(holder);
          try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) {}
          resolve(result);
        }
        function onKey(e) { if (e.key === 'Escape') close(false); }

        check.addEventListener('change', function () {
          accept.disabled = !check.checked;
          accept.style.opacity = check.checked ? '1' : '0.5';
        });
        cancel.addEventListener('click', function () { close(false); });
        document.getElementById('ds-attest-backdrop').addEventListener('click', function () { close(false); });
        document.addEventListener('keydown', onKey);
        setTimeout(function () { try { check.focus(); } catch (e) {} }, 40);

        accept.addEventListener('click', async function () {
          if (!check.checked) return;
          accept.disabled = true;
          accept.textContent = 'Saving…';
          errBox.style.display = 'none';

          var client = getDb();
          if (!client) { errBox.textContent = 'Connection problem. Please reload and try again.'; errBox.style.display = 'block'; accept.disabled = false; accept.textContent = 'Agree & Continue'; return; }

          var res = await client.rpc('sign_creator_age_attestation', { p_version: AGREEMENT_VERSION });
          if (res.error || !res.data || res.data.success !== true) {
            var code = (res.data && res.data.error) || (res.error && res.error.message) || 'unknown';
            var msg = code === 'under_18'
              ? 'The date of birth on your account is under 18, so this agreement can\'t be accepted.'
              : code === 'no_date_of_birth'
              ? 'Your account has no date of birth on file. Add one in Settings first.'
              : 'Could not save the agreement: ' + code;
            errBox.textContent = msg;
            errBox.style.display = 'block';
            accept.disabled = false;
            accept.textContent = 'Agree & Continue';
            return;
          }
          await refresh();
          close(true);
        });
      });
    });
  }

  async function refresh() {
    clearCache();
    _status = null;
    _inflight = null;
    return fetchStatus(true);
  }

  // ── boot ────────────────────────────────────────────────────────────
  function boot() {
    fetchStatus().then(function (st) {
      if (st.authenticated && !st.is_adult) watchForGatedLinks();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.DSAgeGate = {
    status: fetchStatus,
    refresh: refresh,
    ensureAttestation: ensureAttestation,
    showWall: showWall,
    AGREEMENT_VERSION: AGREEMENT_VERSION
  };
})();
