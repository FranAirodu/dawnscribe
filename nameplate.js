/* ── DAWNSCRIBE NAMEPLATES — shared by every page ────────────────────
   A nameplate is a member's name written over their banner art in the
   font and colour they picked (Call of Duty / Halo calling-card style),
   with their title underneath.

   Pages use:
     DSNameplate.load([uid, ...])         -> Promise<{ uid: plate }>  (cached, one call)
     DSNameplate.html(plate, { size })    -> markup ('lg' | 'md' | 'sm')
     DSNameplate.mount(el, uid, { size }) -> fetch + draw into el
     DSNameplate.nameStyle(plate)         -> inline style for a bare name
     DSNameplate.ensureFont(family)       -> loads a Google Font once
     DSNameplate.hover(root)              -> tap/hover cards on [data-ds-user]

   Fonts are Google Fonts only (free for commercial use), loaded the first
   time something needs them, so a page with no nameplates loads nothing.
   Text always sits on a dark scrim with a shadow, so any font stays
   readable on any banner.
──────────────────────────────────────────────────────────────────────── */
(function () {
  if (window.DSNameplate) return;

  var CACHE = {};
  var loadedFonts = {};
  var pending = null, pendingIds = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hexOk(h) { return /^#[0-9a-f]{6}$/i.test(String(h || '')) ? h : null; }
  function safeUrl(u) { return /^https:\/\//i.test(String(u || '')) ? u : ''; }

  function client() {
    try { if (window.db && typeof window.db.rpc === 'function') return window.db; } catch (e) {}
    try { if (typeof db !== 'undefined' && db && typeof db.rpc === 'function') return db; } catch (e) {}
    return null;
  }

  function ensureFont(family) {
    family = String(family || '').trim();
    if (!family || loadedFonts[family] || !/^[A-Za-z0-9 ]+$/.test(family)) return;
    loadedFonts[family] = true;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + '&display=swap';
    (document.head || document.documentElement).appendChild(l);
  }

  function injectCss() {
    if (document.getElementById('ds-np-css')) return;
    var st = document.createElement('style');
    st.id = 'ds-np-css';
    st.textContent = [
      '.ds-np{position:relative;overflow:hidden;border-radius:12px;background:linear-gradient(135deg,#141428,#24123a,#0f2030);',
      'display:flex;flex-direction:column;justify-content:flex-end;isolation:isolate;}',
      '.ds-np-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;}',
      '.ds-np::after{content:"";position:absolute;inset:0;z-index:-1;',
      'background:linear-gradient(90deg,rgba(6,6,14,.78) 0%,rgba(6,6,14,.45) 55%,rgba(6,6,14,.1) 100%),',
      'linear-gradient(0deg,rgba(6,6,14,.55) 0%,transparent 60%);}',
      '.ds-np-name{line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;',
      'text-shadow:0 2px 3px rgba(0,0,0,.85),0 0 18px rgba(0,0,0,.6);letter-spacing:.01em;}',
      '.ds-np-title{font-family:Lato,system-ui,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.14em;',
      'color:rgba(255,255,255,.82);text-shadow:0 1px 2px rgba(0,0,0,.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.ds-np-title i{opacity:.8;margin-right:4px;}',
      '.ds-np.lg{min-height:110px;padding:14px 20px;}.ds-np.lg .ds-np-name{font-size:40px;}.ds-np.lg .ds-np-title{font-size:17px;margin-top:6px;}',
      '.ds-np.md{min-height:84px;padding:12px 16px;}.ds-np.md .ds-np-name{font-size:28px;}.ds-np.md .ds-np-title{font-size:14px;margin-top:4px;}',
      '.ds-np.sm{min-height:58px;padding:8px 12px;border-radius:9px;}.ds-np.sm .ds-np-name{font-size:19px;}.ds-np.sm .ds-np-title{font-size:12px;margin-top:2px;}',
      /* A title with its own font drops the small-caps look and uses the font as-is. */
      '.ds-np-title.styled{text-transform:none;letter-spacing:.02em;font-weight:400;}',
      '.ds-np.bare{background:none;border-radius:0;padding:0;min-height:0;}.ds-np.bare::after{display:none;}',
      '@media (max-width:600px){.ds-np.lg .ds-np-name{font-size:30px;}}',
      /* hover card */
      '.ds-np-pop{position:absolute;z-index:9990;width:300px;max-width:calc(100vw - 24px);border-radius:14px;overflow:hidden;',
      'background:var(--bg2,#12121a);border:1px solid var(--border,rgba(255,255,255,.08));box-shadow:0 18px 40px rgba(0,0,0,.55);',
      'opacity:0;transform:translateY(4px);transition:opacity .15s,transform .15s;}',
      '.ds-np-pop.in{opacity:1;transform:none;}',
      '.ds-np-pop .ds-np{border-radius:0;}',
      '.ds-np-pop-foot{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;font-size:12.5px;color:var(--text3,#8a8aa8);font-family:Lato,sans-serif;}',
      '.ds-np-pop-foot a{color:var(--accent,#2dd4bf);font-weight:700;text-decoration:none;}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }


  /* Colour fonts (Nabla, Honk, Bungee Spice) have their colours built into
     the letters, so CSS "color" does nothing. To recolour them we build a
     font palette from the picked colour: every shade in the font's own
     palette is moved to the picked hue, keeping its light/dark so the 3D
     and outline effects survive. No colour picked = the font's original look. */
  var COLOR_FONTS = {
    'Nabla': ['#ffd214','#ff552d','#ff9b00','#ff9123','#ffd214','#ffeb6e','#ffd214','#ffeb6e','#fffabe','#ffffff'],
    'Honk': ['#000000','#000000','#ffffb2','#ffff78','#ffc753','#ff755f','#ff3caf','#ff46af'],
    'Bungee Spice': ['#c90900','#ffd700']
  };
  function isColorFont(fam) { return !!COLOR_FONTS[String(fam || '').trim()]; }
  function hexToHsl(h) {
    var r = parseInt(h.substr(1, 2), 16) / 255, g = parseInt(h.substr(3, 2), 16) / 255, b = parseInt(h.substr(5, 2), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hu = 0, d = mx - mn;
    if (d) {
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      hu = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hu *= 60;
    }
    return [hu, s, l];
  }
  function hsl(h, s, l) { return 'hsl(' + Math.round(h) + ' ' + Math.round(s * 100) + '% ' + Math.round(Math.min(.97, Math.max(.04, l)) * 100) + '%)'; }
  var palDone = {};
  function paletteStyle(fam, hex) {
    fam = String(fam || '').trim();
    var base = COLOR_FONTS[fam];
    hex = hexOk(hex);
    if (!base || !hex) return '';
    var id = '--ds-' + fam.replace(/[^A-Za-z]/g, '').toLowerCase() + '-' + hex.slice(1).toLowerCase();
    if (!palDone[id]) {
      palDone[id] = 1;
      var pick = hexToHsl(hex);
      var mids = base.map(hexToHsl).filter(function (x) { return x[2] > .08 && x[2] < .97; });
      var avg = mids.reduce(function (a, x) { return a + x[2]; }, 0) / (mids.length || 1);
      var over = base.map(function (b, i) {
        var e = hexToHsl(b);
        if (e[2] <= .08 || e[2] >= .97) return i + ' ' + b;   // keep outlines and white shine
        return i + ' ' + hsl(pick[0], pick[1], pick[2] + (e[2] - avg));
      }).join(', ');
      var st = document.getElementById('ds-np-pal');
      if (!st) { st = document.createElement('style'); st.id = 'ds-np-pal'; (document.head || document.documentElement).appendChild(st); }
      st.textContent += '@font-palette-values ' + id + '{font-family:"' + fam + '";base-palette:0;override-colors:' + over + ';}';
    }
    return 'font-palette:' + id + ';';
  }

  function color(p) {
    return hexOk(p && p.color_hex) || hexOk(p && p.aura_hex) || '#2dd4bf';
  }
  function nameStyle(p) {
    var fam = (p && p.font_family) || 'Cinzel';
    ensureFont(fam);
    if (isColorFont(fam)) return "font-family:'" + fam.replace(/'/g, '') + "',Georgia,serif;" + paletteStyle(fam, p && p.color_hex);
    return "font-family:'" + fam.replace(/'/g, '') + "',Georgia,serif;color:" + color(p) + ';';
  }

  /* opts.size: lg | md | sm. opts.bare: no banner, just the lettering.
     opts.noTitle: hide the title line (e.g. where the title shows elsewhere). */
  function html(p, opts) {
    injectCss();
    opts = opts || {};
    p = p || {};
    var size = opts.size || 'md';
    var scale = Number(p.font_size) || 1;
    var art = !opts.bare && safeUrl(p.banner_url);
    var base = { lg: 40, md: 28, sm: 19 }[size] || 28;
    return '<div class="ds-np ' + size + (opts.bare ? ' bare' : '') + '">'
      + (art ? '<img class="ds-np-art" src="' + esc(art) + '" alt="" loading="lazy" onerror="this.remove()"/>' : '')
      + '<div class="ds-np-name" style="' + nameStyle(p) + 'font-size:' + Math.round(base * scale) + 'px;">'
      + esc(p.display_name || p.username || 'Reader') + '</div>'
      + (!opts.noTitle && p.title ? titleHtml(p, size) : '')
      + '</div>';
  }

  function titleHtml(p, size) {
    var fam = p.title_font_family, col = hexOk(p.title_color_hex);
    if (!fam) {
      return '<div class="ds-np-title"' + (col ? ' style="color:' + col + ';"' : '') + '><i class="ti ti-feather"></i>' + esc(p.title) + '</div>';
    }
    ensureFont(fam);
    var base = { lg: 22, md: 17, sm: 14 }[size] || 17;
    return '<div class="ds-np-title styled" style="font-family:\'' + fam.replace(/'/g, '') + '\',Georgia,serif;font-size:'
      + Math.round(base * (Number(p.title_font_size) || 1)) + 'px;' + (isColorFont(fam) ? paletteStyle(fam, col) : 'color:' + (col || 'rgba(255,255,255,.88)') + ';') + '">' + esc(p.title) + '</div>';
  }

  // Batches every load() made in the same tick into one database call.
  function load(ids) {
    ids = (ids || []).filter(function (id) { return /^[0-9a-f-]{36}$/i.test(String(id)); });
    var want = ids.filter(function (id) { return !CACHE[id]; });
    if (!want.length) return Promise.resolve(pick(ids));
    want.forEach(function (id) { pendingIds[id] = 1; });
    if (!pending) {
      pending = new Promise(function (resolve) {
        setTimeout(function () {
          var batch = Object.keys(pendingIds); pendingIds = {}; pending = null;
          var d = client();
          if (!d) return resolve();
          d.rpc('get_nameplate_cards', { p_user_ids: batch }).then(function (r) {
            (r && r.data || []).forEach(function (p) { CACHE[p.user_id] = p; });
            resolve();
          }, function () { resolve(); });
        }, 0);
      });
    }
    return pending.then(function () { return pick(ids); });
  }
  function pick(ids) { var o = {}; ids.forEach(function (id) { if (CACHE[id]) o[id] = CACHE[id]; }); return o; }

  function mount(el, uid, opts) {
    if (!el) return Promise.resolve(null);
    return load([uid]).then(function (m) {
      if (m[uid]) el.innerHTML = html(m[uid], opts);
      return m[uid] || null;
    });
  }

  /* Hover (desktop) or tap (touch) any element with data-ds-user="<uuid>"
     to see that member's nameplate card. */
  var pop = null, popTimer = null, popFor = null;
  function closePop() { if (pop) { pop.remove(); pop = null; popFor = null; } }
  function openPop(target) {
    var uid = target.getAttribute('data-ds-user');
    if (!uid || popFor === target) return;
    closePop();
    popFor = target;
    load([uid]).then(function (m) {
      var p = m[uid];
      if (!p || popFor !== target) return;
      injectCss();
      pop = document.createElement('div');
      pop.className = 'ds-np-pop';
      pop.innerHTML = html(p, { size: 'md' })
        + '<div class="ds-np-pop-foot"><span>@' + esc(p.username || '') + '</span>'
        + '<a href="profile.html?user=' + encodeURIComponent(p.username || '') + '">View profile →</a></div>';
      document.body.appendChild(pop);
      var r = target.getBoundingClientRect();
      var left = Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 12);
      var top = window.scrollY + r.bottom + 8;
      if (r.bottom + pop.offsetHeight + 16 > window.innerHeight) top = window.scrollY + r.top - pop.offsetHeight - 8;
      pop.style.left = Math.max(12, left) + 'px';
      pop.style.top = top + 'px';
      pop.addEventListener('mouseenter', function () { clearTimeout(popTimer); });
      pop.addEventListener('mouseleave', function () { popTimer = setTimeout(closePop, 200); });
      requestAnimationFrame(function () { if (pop) pop.classList.add('in'); });
    });
  }
  var hoverOn = false;
  function hover() {
    if (hoverOn) return; hoverOn = true;
    var fine = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    if (fine) {
      document.addEventListener('mouseover', function (e) {
        var t = e.target.closest && e.target.closest('[data-ds-user]');
        if (!t) return;
        clearTimeout(popTimer);
        popTimer = setTimeout(function () { openPop(t); }, 350);
      });
      document.addEventListener('mouseout', function (e) {
        var t = e.target.closest && e.target.closest('[data-ds-user]');
        if (!t) return;
        clearTimeout(popTimer);
        popTimer = setTimeout(closePop, 250);
      });
    } else {
      // Touch: first tap shows the card, second tap follows the link.
      document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-ds-user]');
        if (!t) { if (pop && !(e.target.closest && e.target.closest('.ds-np-pop'))) closePop(); return; }
        if (popFor === t) return;
        e.preventDefault();
        openPop(t);
      }, true);
    }
    window.addEventListener('scroll', function () { if (pop && fine) closePop(); }, { passive: true });
  }

  window.DSNameplate = {
    load: load, html: html, mount: mount, nameStyle: nameStyle, ensureFont: ensureFont, hover: hover,
    isColorFont: isColorFont, paletteStyle: paletteStyle,
    forget: function (uid) { delete CACHE[uid]; }
  };
})();
