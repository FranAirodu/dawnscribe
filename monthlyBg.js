/* ── DAWNSCRIBE MONTHLY BACKGROUND ─────────────────────────────────
   The drifting particle background that changes theme every two months
   (Frost, Ember Dawn, Verdant, Solstice, Crimson Dusk, Celestial).

   ONE copy lives here, and it runs on EVERY page. nav.js and accent.js both
   load this file (whichever runs first wins; the guard stops a double run).
   Pages with neither must add <script src="monthlyBg.js" defer></script>.
   Do NOT paste a copy of this code into a single page again — that is how it
   ended up living only on index.html.

   How it sits behind the page: the canvas is fixed at z-index -1, <html>
   carries the page colour, and <body> is made transparent so the canvas
   shows through. Cards and panels keep their own backgrounds.
   Reduced-motion users get one still frame; the loop pauses in hidden tabs.
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
  var THEMES = [FROST, FROST, EMBER, EMBER, VERDANT, VERDANT, SOLSTICE, SOLSTICE, CRIMSON, CRIMSON, CELESTIAL, CELESTIAL];

  function start() {
    if (!document.body) return;
    var st = document.createElement('style');
    st.id = 'ds-monthly-bg-css';
    st.textContent =
      'html{background-color:var(--bg,#0b0b12);}' +
      'body{background-color:transparent !important;}' +
      '#ds-bg-canvas{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:-1;}';
    document.head.appendChild(st);

    var canvas = document.getElementById('ds-bg-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'ds-bg-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(canvas, document.body.firstChild);
    }
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var T = THEMES[new Date().getMonth()];
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; if (still) draw(); }
    var particles = [];
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
    resize();
    window.addEventListener('resize', resize);
    if (still) return;
    function loop() { if (!document.hidden) draw(); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
