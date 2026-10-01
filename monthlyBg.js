/* ── DAWNSCRIBE MONTHLY BACKGROUND ─────────────────────────────────
   The drifting particle background that changes theme every month:
   Jan Frost, Feb Thaw, Mar Blossom, Apr Ember Dawn, May Verdant, Jun Tidewater,
   Jul Solstice, Aug Harvest, Sep Crimson Dusk, Oct Twilight Rose, Nov Celestial, Dec Aurora.

   ONE copy lives here, and it runs on EVERY page. nav.js and accent.js both
   load this file (whichever runs first wins; the guard stops a double run).
   Pages with neither must add <script src="monthlyBg.js" defer></script>.
   Do NOT paste a copy of this code into a single page again — that is how it
   ended up living only on index.html.

   How it sits behind the page: the canvas is fixed at z-index -1, <html>
   carries the page colour, and <body> is made transparent so the canvas
   shows through. Cards and panels keep their own backgrounds.
   Reduced-motion users get one still frame; the loop pauses in hidden tabs.

   Members can pick their own background on the Characters page
   (Background tab): 'month' (default, follows the calendar), 'teal' (free),
   'calm' (this month's look, standing still) or any colour they unlocked.
   The pick is kept in a small browser note (localStorage 'ds_bg_choice') so
   it shows instantly, and checked against their account once per visit.
   window.dsSetBackground(choice) switches it live.
──────────────────────────────────────────────────────────────────── */
(function () {
  if (window.__dsMonthlyBg) return;
  window.__dsMonthlyBg = true;

  var FROST     = { dark:'180,220,255', count:70, spd:[0.06,0.14], sz:[0.5,2.8], drift:0.06, glows:[{x:0.1,y:0.2,r:500,c:'120,180,255'},{x:0.8,y:0.75,r:420,c:'80,140,220'},{x:0.5,y:0.5,r:350,c:'160,210,255'}] };
  var EMBER     = { dark:'255,180,60',  count:75, spd:[0.10,0.22], sz:[0.4,2.4], drift:0.10, glows:[{x:0.5,y:0.9,r:520,c:'255,140,40'},{x:0.2,y:0.5,r:380,c:'255,100,20'},{x:0.8,y:0.3,r:300,c:'255,160,60'}] };
  var VERDANT   = { dark:'80,220,120',  count:68, spd:[0.08,0.18], sz:[0.5,2.5], drift:0.14, glows:[{x:0.7,y:0.3,r:460,c:'60,200,100'},{x:0.15,y:0.8,r:380,c:'30,160,80'},{x:0.5,y:0.6,r:300,c:'100,230,140'}] };
  var SOLSTICE  = { dark:'255,210,60',  count:80, spd:[0.12,0.25], sz:[0.4,2.2], drift:0.08, glows:[{x:0.5,y:0.15,r:520,c:'255,200,50'},{x:0.85,y:0.6,r:440,c:'45,212,191'},{x:0.15,y:0.7,r:360,c:'255,180,40'}] };
  var CRIMSON   = { dark:'255,90,100',  count:62, spd:[0.05,0.13], sz:[0.6,3.0], drift:0.07, glows:[{x:0.2,y:0.6,r:480,c:'200,40,60'},{x:0.75,y:0.2,r:400,c:'255,80,80'},{x:0.5,y:0.9,r:340,c:'220,60,80'}] };
  var CELESTIAL = { dark:'190,130,255', count:90, spd:[0.04,0.11], sz:[0.3,2.0], drift:0.04, glows:[{x:0.35,y:0.4,r:500,c:'150,80,255'},{x:0.8,y:0.8,r:420,c:'100,40,200'},{x:0.1,y:0.7,r:360,c:'200,120,255'}] };
  var THAW      = { dark:'170,240,225', count:66, spd:[0.07,0.16], sz:[0.5,2.6], drift:0.08, glows:[{x:0.2,y:0.3,r:480,c:'110,210,200'},{x:0.8,y:0.7,r:400,c:'150,225,240'},{x:0.5,y:0.55,r:320,c:'90,190,170'}] };
  var BLOSSOM   = { dark:'255,185,215', count:72, spd:[0.06,0.15], sz:[0.6,2.8], drift:0.16, glows:[{x:0.75,y:0.25,r:470,c:'255,140,190'},{x:0.2,y:0.75,r:400,c:'240,120,170'},{x:0.5,y:0.5,r:320,c:'255,190,220'}] };
  var TIDEWATER = { dark:'110,200,255', count:74, spd:[0.08,0.17], sz:[0.5,2.4], drift:0.12, glows:[{x:0.5,y:0.85,r:520,c:'30,120,220'},{x:0.15,y:0.35,r:400,c:'20,160,200'},{x:0.85,y:0.25,r:330,c:'80,190,255'}] };
  var HARVEST   = { dark:'255,190,110', count:70, spd:[0.07,0.16], sz:[0.5,2.7], drift:0.12, glows:[{x:0.25,y:0.7,r:480,c:'200,120,40'},{x:0.8,y:0.35,r:400,c:'170,90,30'},{x:0.5,y:0.2,r:320,c:'230,160,70'}] };
  var TWILIGHT  = { dark:'240,150,210', count:76, spd:[0.05,0.13], sz:[0.4,2.4], drift:0.07, glows:[{x:0.3,y:0.25,r:480,c:'190,70,150'},{x:0.75,y:0.75,r:420,c:'130,60,170'},{x:0.5,y:0.5,r:330,c:'230,110,170'}] };
  var AURORA    = { dark:'150,255,200', count:84, spd:[0.04,0.12], sz:[0.3,2.2], drift:0.05, glows:[{x:0.2,y:0.25,r:500,c:'40,220,150'},{x:0.75,y:0.35,r:440,c:'140,80,255'},{x:0.5,y:0.8,r:360,c:'60,200,220'}] };
  var THEMES = [FROST, THAW, BLOSSOM, EMBER, VERDANT, TIDEWATER, SOLSTICE, HARVEST, CRIMSON, TWILIGHT, CELESTIAL, AURORA];

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
  function readChoice() { try { return localStorage.getItem('ds_bg_choice') || 'month'; } catch (e) { return 'month'; } }
  function themeFor(choice) {
    if (choice === 'teal') return themeFromHex('#2dd4bf');
    if (/^#[0-9a-f]{6}$/i.test(choice || '')) return themeFromHex(choice);
    return THEMES[new Date().getMonth()];
  }

  var canvas, ctx, T, particles = [], still = false, looping = false;
  function seed() {
    particles = [];
    for (var i = 0; i < T.count; i++) {
      particles.push({
        x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
        r: Math.random() * (T.sz[1] - T.sz[0]) + T.sz[0],
        speed: Math.random() * (T.spd[1] - T.spd[0]) + T.spd[0],
        drift: (Math.random() - 0.5) * T.drift,
        opacity: Math.random() * 0.55 + 0.18,
        pulse: Math.random() * Math.PI * 2, pulseSpeed: Math.random() * 0.008 + 0.003
      });
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
    particles.forEach(function (p) {
      if (!still) { p.pulse += p.pulseSpeed; p.y -= p.speed; p.x += p.drift; }
      if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
      if (p.x < -10 || p.x > canvas.width + 10) { p.x = Math.random() * canvas.width; }
      var a = p.opacity * (0.45 + 0.55 * Math.sin(p.pulse));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + T.dark + ',' + a + ')'; ctx.fill();
    });
  }
  function apply(choice) {
    T = themeFor(choice);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    still = reduce || choice === 'calm';
    seed(); draw();
    if (!still && !looping) {
      looping = true;
      var loop = function () { if (still) { looping = false; return; } if (!document.hidden) draw(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }
  window.dsSetBackground = function (choice) {
    choice = String(choice || 'month').toLowerCase();
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
      if ((v.choice || 'month') !== readChoice()) window.dsSetBackground(v.choice || 'month');
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
