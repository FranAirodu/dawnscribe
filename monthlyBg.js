/* ── DAWNSCRIBE MONTHLY BACKGROUND ─────────────────────────────────
   The drifting particle background behind every page. DawnScribe teal is
   the default; members can switch to any background they have unlocked.

   ONE copy lives here, and it runs on EVERY page. nav.js and accent.js both
   load this file (whichever runs first wins; the guard stops a double run).
   Pages with neither must add <script src="monthlyBg.js" defer></script>.
   Do NOT paste a copy of this code into a single page again — that is how it
   ended up living only on index.html.

   How it sits behind the page: the canvas is fixed at z-index -1, <html>
   carries the page colour, and <body> is made transparent so the canvas
   shows through. Cards and panels keep their own backgrounds.
   Reduced-motion users get one still frame; the loop pauses in hidden tabs.

   Backgrounds work like nameplate fonts: a STYLE (Drifting Embers, Floating
   Letters, Constellations, Snowfall, ...) plus a COLOUR. A choice is stored
   as "style:#hex". Drifting Embers in teal is the default and is free.
   To add a style: add it to STYLES below and a row to the bg_styles table.
   The pick is kept in a small browser note (localStorage 'ds_bg_choice') so
   it shows instantly, and checked against their account once per visit.
   window.dsSetBackground(choice) switches it live.
──────────────────────────────────────────────────────────────────── */
(function () {
  if (window.__dsMonthlyBg) return;
  window.__dsMonthlyBg = true;

  function rgbOf(hex) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function mix(c, t, a) { return [0, 1, 2].map(function (i) { return Math.round(c[i] + (t[i] - c[i]) * a); }); }
  // A particle theme built from one colour, in the same style as the monthly ones.
  function themeFromHex(hex) {
    var c = rgbOf(hex), s = function (x) { return x.join(','); };
    return { dark: s(mix(c, [255, 255, 255], 0.35)), count: 74, spd: [0.06, 0.16], sz: [0.4, 2.6], drift: 0.08,
      glows: [{ x: 0.2, y: 0.3, r: 500, c: s(c) }, { x: 0.8, y: 0.75, r: 420, c: s(mix(c, [0, 0, 0], 0.35)) }, { x: 0.55, y: 0.5, r: 330, c: s(mix(c, [255, 255, 255], 0.25)) }] };
  }
  /* A choice is "style:#hex", e.g. "embers:#2dd4bf". Older notes held just a
     colour (or "teal"); those mean Drifting Embers. */
  function parseChoice(c) {
    c = String(c || '').toLowerCase();
    if (c === 'teal' || c === 'month' || c === 'calm' || !c) return { style: 'embers', hex: '#2dd4bf' };
    if (/^#[0-9a-f]{6}$/.test(c)) return { style: 'embers', hex: c };
    var p = c.split(':');
    return { style: STYLES[p[0]] ? p[0] : 'embers', hex: /^#[0-9a-f]{6}$/.test(p[1] || '') ? p[1] : '#2dd4bf' };
  }
  function readChoice() { try { return localStorage.getItem('ds_bg_choice') || 'embers:#2dd4bf'; } catch (e) { return 'embers:#2dd4bf'; } }

  var canvas, ctx, T, S, particles = [], still = false, looping = false;
  var GLYPHS = 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz&\u00a7\u00b6~,.;:!?\u2019\u201c\u201d';
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* Each style: seed() makes its particles, step(p) moves one, paint(p) draws it.
     All styles share the colour glows from themeFromHex. */
  var STYLES = {
    embers: {
      seed: function () { return { r: rnd(T.sz[0], T.sz[1]), speed: rnd(T.spd[0], T.spd[1]), drift: (Math.random() - 0.5) * T.drift }; },
      count: 74,
      step: function (p) { p.y -= p.speed; p.x += p.drift; },
      paint: function (p, a) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(' + T.dark + ',' + a + ')'; ctx.fill(); }
    },
    letters: {
      count: 46,
      seed: function () { return { ch: GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)), size: rnd(11, 26), speed: rnd(0.08, 0.22),
        drift: (Math.random() - 0.5) * 0.12, rot: rnd(-0.4, 0.4), spin: (Math.random() - 0.5) * 0.002, serif: Math.random() < 0.6 }; },
      step: function (p) { p.y -= p.speed; p.x += p.drift; p.rot += p.spin; },
      paint: function (p, a) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.font = (p.serif ? 'italic ' : '') + Math.round(p.size) + 'px ' + (p.serif ? 'Georgia,serif' : 'Cinzel,Georgia,serif');
        ctx.fillStyle = 'rgba(' + T.dark + ',' + (a * 0.55) + ')'; ctx.fillText(p.ch, 0, 0); ctx.restore();
      }
    },
    constellations: {
      count: function () { return Math.max(30, Math.min(80, Math.round(window.innerWidth * window.innerHeight / 26000))); },
      seed: function () { return { r: rnd(0.6, 2.2), vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12 }; },
      step: function (p) {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) p.y = canvas.height + 10; else if (p.y > canvas.height + 10) p.y = -10;
        if (p.x < -10) p.x = canvas.width + 10; else if (p.x > canvas.width + 10) p.x = -10;
      },
      before: function () {
        // faint lines between nearby stars
        var max = 150, n = particles.length;
        ctx.lineWidth = 0.7;
        for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
          var A = particles[i], B = particles[j], dx = A.x - B.x, dy = A.y - B.y, d = dx * dx + dy * dy;
          if (d < max * max) {
            ctx.strokeStyle = 'rgba(' + T.dark + ',' + (0.22 * (1 - Math.sqrt(d) / max)) + ')';
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
          }
        }
      },
      paint: function (p, a) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(' + T.dark + ',' + Math.min(1, a + 0.25) + ')'; ctx.fill();
      }
    },
    snow: {
      count: 90,
      seed: function () { return { r: rnd(0.8, 3.2), speed: rnd(0.25, 0.7), sway: rnd(0.2, 0.7), ph: Math.random() * 6.28 }; },
      step: function (p) { p.ph += 0.01; p.y += p.speed * (0.6 + p.r / 4); p.x += Math.sin(p.ph) * p.sway * 0.4; },
      paint: function (p, a) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(' + T.snow + ',' + Math.min(1, a + 0.2) + ')'; ctx.fill(); }
    }
  };
  function themeFor(choice) {
    var c = parseChoice(choice), th = themeFromHex(c.hex);
    th.snow = mix(rgbOf(c.hex), [255, 255, 255], 0.7).join(',');
    th.style = c.style;
    return th;
  }
  function seed() {
    particles = [];
    var n = typeof S.count === 'function' ? S.count() : S.count;
    for (var i = 0; i < n; i++) {
      var p = S.seed();
      p.x = Math.random() * window.innerWidth; p.y = Math.random() * window.innerHeight;
      p.opacity = Math.random() * 0.55 + 0.18; p.pulse = Math.random() * Math.PI * 2; p.pulseSpeed = Math.random() * 0.008 + 0.003;
      particles.push(p);
    }
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    T.glows.forEach(function (g) {
      var gx = g.x * canvas.width, gy = g.y * canvas.height;
      var grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, g.r);
      grad.addColorStop(0, 'rgba(' + g.c + ',0.22)');
      grad.addColorStop(1, 'rgba(' + g.c + ',0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(gx, gy, g.r, 0, Math.PI * 2); ctx.fill();
    });
    if (S.before) S.before();
    particles.forEach(function (p) {
      if (!still) { p.pulse += p.pulseSpeed; S.step(p); }
      if (p.y < -30) { p.y = canvas.height + 20; p.x = Math.random() * canvas.width; }
      if (p.y > canvas.height + 30) { p.y = -20; p.x = Math.random() * canvas.width; }
      if (p.x < -30 || p.x > canvas.width + 30) { p.x = Math.random() * canvas.width; }
      S.paint(p, p.opacity * (0.45 + 0.55 * Math.sin(p.pulse)));
    });
  }
  function apply(choice) {
    T = themeFor(choice);
    S = STYLES[T.style] || STYLES.embers;
    still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    seed(); draw();
    if (!still && !looping) {
      looping = true;
      var loop = function () { if (still) { looping = false; return; } if (!document.hidden) draw(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }
  window.dsSetBackground = function (choice) {
    choice = String(choice || 'embers:#2dd4bf').toLowerCase();
    try { localStorage.setItem('ds_bg_choice', choice); } catch (e) {}
    if (ctx) apply(choice);
  };
  // Once per visit, make sure the browser note matches the member's account.
  function syncFromAccount(tries) {
    try { if (sessionStorage.getItem('ds_bg_synced')) return; } catch (e) { return; }
    var d = null;
    try { if (window.db && window.db.rpc) d = window.db; else if (typeof db !== 'undefined' && db && db.rpc) d = db; } catch (e) {}
    if (!d) { if (tries < 20) setTimeout(function () { syncFromAccount(tries + 1); }, 500); return; }
    d.rpc('my_backgrounds').then(function (r) {
      var v = r && r.data;
      if (!v || !v.ok) return;
      try { sessionStorage.setItem('ds_bg_synced', '1'); } catch (e) {}
      if ((v.choice || 'embers:#2dd4bf') !== readChoice()) window.dsSetBackground(v.choice || 'embers:#2dd4bf');
    }, function () {});
  }

  function start() {
    if (!document.body) return;
    var st = document.createElement('style');
    st.id = 'ds-monthly-bg-css';
    st.textContent =
      'html{background-color:var(--bg,#0b0b12);}' +
      'body{background-color:transparent !important;}' +
      '#ds-bg-canvas{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:-1;}';
    document.head.appendChild(st);

    canvas = document.getElementById('ds-bg-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'ds-bg-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(canvas, document.body.firstChild);
    }
    ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    window.addEventListener('resize', function () { canvas.width = window.innerWidth; canvas.height = window.innerHeight; if (still) draw(); });
    apply(readChoice());
    setTimeout(function () { syncFromAccount(0); }, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
