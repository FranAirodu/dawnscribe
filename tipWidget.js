/* ── DAWNSCRIBE TIP WIDGET ─────────────────────────────────────────
   Shared "Support the author" / "Support this creator" panel.
   Used by chapter.html, story.html and profile.html so the tip UI and
   the wording around the split live in exactly one place.

   The 90/10 split is NEVER computed here. tip_creator() owns it; this
   file only quotes it in copy. If the split ever changes, change it in
   the function and update the one sentence below.

   Load AFTER the Supabase client exists on the page.

   Usage:
     window.dsTips.mount({
       bodyEl:    document.getElementById('tip-body'),
       listEl:    document.getElementById('tip-list'),
       sectionEl: document.getElementById('tip-section'),
       db:        db,                 // supabase client
       workId:    workData.id,        // required for tipping
       chapterId: chapterData.id,     // optional, attributes the tip
       authorId:  workData.author_id, // to detect self
       userId:    currentSession ? currentSession.user.id : null,
       signedIn:  !!currentSession,
       escape:    escHtml,            // page's own escaper
       onToast:   showToast           // optional
     });
──────────────────────────────────────────────────────────────────── */
window.dsTips = (function () {

  var PRESETS = [50, 100, 500, 1000];
  var MIN = 10;
  var MAX = 100000;
  var SHARE_COPY = 'They keep 90%.';

  function esc(cfg, s) {
    if (cfg.escape) return cfg.escape(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var INPUT_CSS = 'padding:8px 10px;background:var(--bg);border:1px solid var(--border);' +
    'border-radius:8px;color:var(--text);font-family:\'Lato\',sans-serif;font-size:14px;';

  function mount(cfg) {
    if (!cfg || !cfg.bodyEl) return;
    if (cfg.sectionEl) cfg.sectionEl.style.display = '';

    // No work to tip means nothing to render — profile pages pass the
    // creator's most recently updated work, and a creator with none yet
    // simply has no tip panel.
    if (!cfg.workId) {
      if (cfg.sectionEl) cfg.sectionEl.style.display = 'none';
      return;
    }

    var isSelf = cfg.userId && cfg.authorId && cfg.userId === cfg.authorId;

    if (!cfg.signedIn) {
      cfg.bodyEl.innerHTML = '<div style="color:var(--text2);font-size:14px;">' +
        '<a href="auth.html" style="color:var(--accent);">Sign in</a> to tip with Quills.</div>';
      loadList(cfg);
      return;
    }
    if (isSelf) {
      cfg.bodyEl.innerHTML = '<div style="color:var(--text2);font-size:14px;">' +
        'Readers can tip you here. You keep 90% of every tip.</div>';
      loadList(cfg);
      return;
    }

    cfg.bodyEl.innerHTML =
      '<div style="color:var(--text2);font-size:14px;margin-bottom:12px;">' +
        'Send Quills. ' + SHARE_COPY + '</div>' +
      '<div class="ds-tip-presets" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
        '<input class="ds-tip-amount" type="number" min="' + MIN + '" max="' + MAX + '" step="10" ' +
          'placeholder="Quills" style="width:110px;' + INPUT_CSS + '" />' +
        '<input class="ds-tip-message" type="text" maxlength="280" ' +
          'placeholder="Say something (optional)" style="flex:1;min-width:180px;' + INPUT_CSS + '" />' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:7px;margin-top:10px;' +
        'color:var(--text2);font-size:13px;cursor:pointer;">' +
        '<input class="ds-tip-anon" type="checkbox" style="cursor:pointer;" /> Tip anonymously' +
      '</label>' +
      '<button class="ds-tip-send" style="margin-top:12px;padding:9px 18px;background:var(--accent);' +
        'border:none;border-radius:8px;color:#fff;font-family:\'Lato\',sans-serif;font-weight:700;' +
        'font-size:14px;cursor:pointer;"><i class="ti ti-coin"></i> Send tip</button>' +
      '<div class="ds-tip-error" style="margin-top:10px;color:var(--red);font-size:13px;display:none;"></div>';

    var presets = cfg.bodyEl.querySelector('.ds-tip-presets');
    PRESETS.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = n.toLocaleString();
      b.style.cssText = 'padding:7px 14px;background:var(--bg);border:1px solid var(--border);' +
        'border-radius:20px;color:var(--text);font-family:\'Lato\',sans-serif;font-size:13px;cursor:pointer;';
      b.onclick = function () { cfg.bodyEl.querySelector('.ds-tip-amount').value = n; };
      presets.appendChild(b);
    });

    cfg.bodyEl.querySelector('.ds-tip-send').onclick = function () { send(cfg); };
    loadList(cfg);
  }

  async function send(cfg) {
    var btn = cfg.bodyEl.querySelector('.ds-tip-send');
    var err = cfg.bodyEl.querySelector('.ds-tip-error');
    var amt = parseInt(cfg.bodyEl.querySelector('.ds-tip-amount').value, 10);
    err.style.display = 'none';

    // Checked here for a fast message, and again in tip_creator, which is
    // the boundary that actually matters.
    if (!amt || amt < MIN) {
      err.textContent = 'Minimum tip is ' + MIN + ' Quills.';
      err.style.display = '';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2"></i> Sending...';
    try {
      var anon = !!cfg.bodyEl.querySelector('.ds-tip-anon').checked;
      var res = await cfg.db.rpc('tip_creator', {
        p_work_id:    cfg.workId,
        p_chapter_id: cfg.chapterId || null,
        p_quills:     amt,
        p_message:    cfg.bodyEl.querySelector('.ds-tip-message').value || null,
        p_anonymous:  anon
      });
      if (res.error) throw res.error;
      var data = res.data;
      if (!data || !data.ok) throw new Error((data && data.error) || 'Tip failed');

      if (cfg.onToast) cfg.onToast('Tip sent — thank you!');

      // nav.js paints the header balance once on load and exposes no
      // refresher, so set it from the value the RPC returned.
      var qEl = document.getElementById('ds-quill-count');
      if (qEl && typeof data.new_balance === 'number') {
        qEl.textContent = data.new_balance.toLocaleString();
      }

      if (cfg.onTipped) cfg.onTipped(data, amt, anon);

      cfg.bodyEl.querySelector('.ds-tip-amount').value = '';
      cfg.bodyEl.querySelector('.ds-tip-message').value = '';
      cfg.bodyEl.querySelector('.ds-tip-anon').checked = false;
      loadList(cfg);
    } catch (e) {
      err.textContent = (e && e.message) ? e.message : 'Something went wrong.';
      err.style.display = '';
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-coin"></i> Send tip';
  }

  async function loadList(cfg) {
    if (!cfg.listEl || !cfg.workId) return;
    try {
      // RPCs rather than table reads: creator_tips is not directly readable,
      // so an anonymous tipper's id never reaches the browser. Both already
      // exclude reversed tips.
      var listRes = await cfg.db.rpc('list_work_tips', { p_work_id: cfg.workId, p_limit: 15 });
      var totRes  = await cfg.db.rpc('work_tip_totals', { p_work_id: cfg.workId });
      var tips = listRes.data || [];
      if (!tips.length) { cfg.listEl.innerHTML = ''; return; }

      var tot   = totRes.data || {};
      var count = tot.tip_count   || tips.length;
      var total = tot.quill_total || 0;

      var html = '<div style="color:var(--text2);font-size:13px;margin-bottom:10px;">' +
        count.toLocaleString() + (count === 1 ? ' tip' : ' tips') +
        ' \u00b7 ' + total.toLocaleString() + ' Quills</div>';

      tips.forEach(function (t) {
        var name = t.is_anonymous
          ? ('Anonymous' + (t.is_mine ? ' (you)' : ''))
          : esc(cfg, t.display_name || 'Reader');
        html += '<div style="display:flex;gap:10px;align-items:baseline;padding:8px 0;' +
          'border-top:1px solid var(--border);font-size:14px;">' +
          '<span style="font-weight:700;' + (t.is_anonymous ? 'color:var(--text2);' : '') + '">' +
            name + '</span>' +
          '<span style="color:var(--accent);font-weight:700;">' +
            (t.quill_amount || 0).toLocaleString() + '</span>' +
          (t.message ? '<span style="color:var(--text2);">' + esc(cfg, t.message) + '</span>' : '') +
          '</div>';
      });
      cfg.listEl.innerHTML = html;
    } catch (e) { /* the tip list is never worth breaking the page over */ }
  }

  return { mount: mount, refresh: loadList, MIN: MIN, MAX: MAX };
})();
