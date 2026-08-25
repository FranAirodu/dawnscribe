/* ══════════════════════════════════════════════════════════════
   DawnScribe — Badge unlock celebration

   Badge unlocks used to arrive as an ordinary toast, visually identical
   to "Settings saved". Earning a Celestite tier after months of effort
   deserves to look different from a form confirmation, and a toast in the
   corner is genuinely easy to miss.

   This is the single implementation for the whole site: nav.js injects it
   on every page that loads nav.js, and index.html (which keeps its own nav
   copy and does NOT load nav.js) includes it directly. One file so the two
   can't drift apart.

   Accessibility: honours both the OS "reduce motion" setting and the
   site's own pref (html.ds-reduced-motion, set by accessibilityPrefs.js).
   When either is on, the card still appears — only the confetti and the
   motion are dropped. A celebration nobody can sit through comfortably
   isn't a celebration.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (window.DSBadgeCelebrate) return;   // already loaded

  var GOLD = '#f0c674';
  var queue = [];
  var showing = false;

  function reducedMotion() {
    try {
      if (document.documentElement.classList.contains('ds-reduced-motion')) return true;
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }

  function injectStyles() {
    if (document.getElementById('ds-badge-celebrate-css')) return;
    var css = document.createElement('style');
    css.id = 'ds-badge-celebrate-css';
    css.textContent = [
      '.ds-bc-scrim{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;',
      'justify-content:center;background:rgba(6,6,12,0.72);opacity:0;transition:opacity .28s ease;}',
      '.ds-bc-scrim.ds-bc-in{opacity:1;}',
      '.ds-bc-canvas{position:fixed;inset:0;pointer-events:none;z-index:100000;}',
      '.ds-bc-card{position:relative;z-index:100001;max-width:340px;width:calc(100% - 48px);',
      'padding:28px 26px 24px;border-radius:18px;text-align:center;',
      'background:linear-gradient(180deg,#171722 0%,#101018 100%);',
      'border:1px solid rgba(255,255,255,0.10);',
      'box-shadow:0 24px 70px rgba(0,0,0,0.6);',
      'transform:scale(.82);opacity:0;transition:transform .34s cubic-bezier(.2,1.5,.4,1),opacity .24s ease;}',
      '.ds-bc-card.ds-bc-in{transform:scale(1);opacity:1;}',
      '.ds-bc-nomotion .ds-bc-card{transition:none;transform:none;opacity:1;}',
      '.ds-bc-nomotion .ds-bc-scrim{transition:none;opacity:1;}',
      '.ds-bc-gem{width:76px;height:76px;margin:0 auto 14px;border-radius:50%;',
      'display:flex;align-items:center;justify-content:center;font-size:38px;',
      'border:2px solid rgba(255,255,255,0.16);}',
      '.ds-bc-kicker{font-size:11px;letter-spacing:2.4px;text-transform:uppercase;',
      'color:' + GOLD + ';margin-bottom:6px;font-weight:700;}',
      '.ds-bc-name{font-family:Cinzel,Georgia,serif;font-size:21px;font-weight:700;',
      'color:#fff;line-height:1.25;margin-bottom:6px;}',
      '.ds-bc-sub{font-size:13px;color:#a8a8ba;margin-bottom:2px;}',
      '.ds-bc-xp{font-size:13px;font-weight:700;color:' + GOLD + ';margin-top:8px;}',
      '.ds-bc-dismiss{margin-top:18px;font-size:12px;color:#7d7d90;}',
      '@media (max-width:420px){.ds-bc-card{padding:22px 18px 20px;}.ds-bc-name{font-size:19px;}}'
    ].join('');
    document.head.appendChild(css);
  }

  /* Confetti: a few dozen paper rectangles under gravity. Deliberately
     dependency-free — a celebration is not worth a CDN request that might
     fail or be blocked. Stops itself once every piece is off-screen, so
     there is no animation loop left running behind the page. */
  function confetti(canvas, colors) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H;
    function size() {
      W = canvas.width = Math.floor(window.innerWidth * dpr);
      H = canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }
    size();
    window.addEventListener('resize', size);

    var pieces = [];
    var count = window.innerWidth < 500 ? 60 : 90;
    for (var i = 0; i < count; i++) {
      pieces.push({
        x: (0.5 + (Math.random() - 0.5) * 0.5) * W,
        y: H * 0.42 + (Math.random() - 0.5) * 40 * dpr,
        vx: (Math.random() - 0.5) * 13 * dpr,
        vy: (Math.random() * -13 - 4) * dpr,
        w: (5 + Math.random() * 6) * dpr,
        h: (8 + Math.random() * 8) * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.32,
        color: colors[(Math.random() * colors.length) | 0],
        life: 0
      });
    }

    var gravity = 0.42 * dpr;
    var raf = null;
    function frame() {
      ctx.clearRect(0, 0, W, H);
      var alive = 0;
      for (var i = 0; i < pieces.length; i++) {
        var p = pieces[i];
        p.vy += gravity;
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life++;
        if (p.y < H + 40 * dpr) alive++;
        var fade = p.life > 90 ? Math.max(0, 1 - (p.life - 90) / 45) : 1;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive > 0) { raf = requestAnimationFrame(frame); }
      else { ctx.clearRect(0, 0, W, H); window.removeEventListener('resize', size); }
    }
    raf = requestAnimationFrame(frame);

    return function stop() {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }

  function showOne(item, done) {
    injectStyles();
    var calm = reducedMotion();

    var gemColor = item.gem_color || GOLD;
    var iconCls = item.icon || 'ti-award';

    var scrim = document.createElement('div');
    scrim.className = 'ds-bc-scrim';
    if (calm) scrim.classList.add('ds-bc-nomotion');
    scrim.setAttribute('role', 'alertdialog');
    scrim.setAttribute('aria-live', 'assertive');
    scrim.setAttribute('aria-label', 'Badge unlocked: ' + (item.name || 'badge'));

    var canvas = null, stopConfetti = null;
    if (!calm) {
      canvas = document.createElement('canvas');
      canvas.className = 'ds-bc-canvas';
      scrim.appendChild(canvas);
    }

    var card = document.createElement('div');
    card.className = 'ds-bc-card';
    if (calm) card.classList.add('ds-bc-in');

    var gemLine = item.gem_name
      ? '<div class="ds-bc-sub">' + escapeHtml(item.gem_name) + ' tier</div>' : '';
    var xpLine = (item.xp_reward > 0)
      ? '<div class="ds-bc-xp">+' + Number(item.xp_reward).toLocaleString() + ' XP</div>' : '';

    card.innerHTML =
      '<div class="ds-bc-gem" style="background:radial-gradient(circle at 35% 30%,' +
        hexA(gemColor, 0.45) + ',' + hexA(gemColor, 0.12) + ');color:' + gemColor + ';">' +
        '<i class="ti ' + escapeAttr(iconCls) + '"></i></div>' +
      '<div class="ds-bc-kicker">Badge Unlocked</div>' +
      '<div class="ds-bc-name">' + escapeHtml(item.name || 'New badge') + '</div>' +
      gemLine + xpLine +
      '<div class="ds-bc-dismiss">Tap anywhere to continue</div>';

    scrim.appendChild(card);
    document.body.appendChild(scrim);

    requestAnimationFrame(function () {
      scrim.classList.add('ds-bc-in');
      card.classList.add('ds-bc-in');
      if (!calm && canvas) {
        stopConfetti = confetti(canvas, [gemColor, GOLD, '#ffffff', '#7dd3fc', '#f9a8d4']);
      }
    });

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      if (stopConfetti) stopConfetti();
      scrim.classList.remove('ds-bc-in');
      card.classList.remove('ds-bc-in');
      setTimeout(function () {
        if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
        done();
      }, calm ? 0 : 260);
    }

    scrim.addEventListener('click', close);
    document.addEventListener('keydown', function onKey(ev) {
      if (ev.key === 'Escape') { document.removeEventListener('keydown', onKey); close(); }
    });

    // Long enough to read and enjoy, short enough not to trap anyone.
    var timer = setTimeout(close, calm ? 3200 : 5200);
  }

  function pump() {
    if (showing) return;
    var next = queue.shift();
    if (!next) return;
    showing = true;
    showOne(next, function () {
      showing = false;
      // Small gap so two unlocks in a row read as two events, not a flicker.
      setTimeout(pump, 260);
    });
  }

  function hexA(hex, alpha) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) return 'rgba(240,198,116,' + alpha + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' +
           parseInt(m[3], 16) + ',' + alpha + ')';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /* items: [{ name, icon, gem_name, gem_color, xp_reward }] */
  window.DSBadgeCelebrate = function (items) {
    if (!items) return;
    if (!Array.isArray(items)) items = [items];
    items.forEach(function (it) { if (it) queue.push(it); });
    if (document.body) pump();
    else document.addEventListener('DOMContentLoaded', pump);
  };
})();
