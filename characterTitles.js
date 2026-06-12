// ═══════════════════════════════════════════════════════════════
// characterTitles.js — DawnScribe Character Titles System
// ═══════════════════════════════════════════════════════════════

window.CharacterTitles = (function() {

  // ── CATEGORY META ─────────────────────────────────────────────
  var CATEGORIES = [
    { key: 'personality',  label: 'Personality',          icon: 'ti-mood-smile' },
    { key: 'role',         label: 'Role',                  icon: 'ti-shield-star' },
    { key: 'dawnscribe',   label: 'DawnScribe Originals',  icon: 'ti-sparkles' },
    { key: 'relationship', label: 'Relationship',          icon: 'ti-heart' },
    { key: 'fan_reaction', label: 'Fan Reaction',          icon: 'ti-flame' },
    { key: 'negative',     label: 'Negative',              icon: 'ti-alert-triangle' }
  ];

  // ── HELPERS ───────────────────────────────────────────────────
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function db() { return window.db; }

  // ── LOAD ALL ACTIVE TITLES ────────────────────────────────────
  var _titlesCache = null;
  async function loadTitles() {
    if (_titlesCache) return _titlesCache;
    var { data } = await db().from('character_titles')
      .select('id,title,category,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    _titlesCache = data || [];
    return _titlesCache;
  }

  // ── LOAD CHAPTER CHARACTERS (active only) ────────────────────
  async function loadChapterCharacters(chapterId) {
    var { data } = await db().from('chapter_characters')
      .select('id, status, chapter_image_url, author_note, character_id, novel_characters(id, name, portrait_url, status)')
      .eq('chapter_id', chapterId)
      .eq('status', 'active');
    return (data || []).map(function(r) {
      return Object.assign({}, r.novel_characters, {
        chapter_character_id: r.id,
        chapter_image_url: r.chapter_image_url,
        author_note: r.author_note
      });
    });
  }

  // ── LOAD USER'S EXISTING VOTES FOR THIS CHAPTER ───────────────
  async function loadUserVotes(chapterId, userId) {
    if (!userId) return {};
    var { data } = await db().from('character_title_votes')
      .select('character_id, title_id')
      .eq('chapter_id', chapterId)
      .eq('user_id', userId);
    var map = {};
    (data||[]).forEach(function(v){ map[v.character_id] = v.title_id; });
    return map;
  }

  // ── LOAD VOTE COUNTS FOR CHAPTER (chapter results) ────────────
  async function loadChapterVoteCounts(chapterId) {
    var { data } = await db().from('character_title_votes')
      .select('character_id, title_id')
      .eq('chapter_id', chapterId);
    // { [characterId]: { [titleId]: count } }
    var map = {};
    (data||[]).forEach(function(v){
      if (!map[v.character_id]) map[v.character_id] = {};
      map[v.character_id][v.title_id] = (map[v.character_id][v.title_id]||0) + 1;
    });
    return map;
  }

  // ── LOAD VOTE COUNTS FOR WHOLE WORK (book results) ────────────
  async function loadWorkVoteCounts(workId) {
    var { data } = await db().from('character_title_votes')
      .select('character_id, title_id')
      .eq('work_id', workId);
    var map = {};
    (data||[]).forEach(function(v){
      if (!map[v.character_id]) map[v.character_id] = {};
      map[v.character_id][v.title_id] = (map[v.character_id][v.title_id]||0) + 1;
    });
    return map;
  }

  // ── SUBMIT A VOTE ─────────────────────────────────────────────
  async function submitVote(characterId, titleId, chapterId, workId, userId) {
    var { error } = await db().from('character_title_votes').insert({
      character_id: characterId,
      title_id: titleId,
      chapter_id: chapterId,
      work_id: workId,
      user_id: userId
    });
    return !error;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER — VOTING UI (shown at end of chapter)
  // ══════════════════════════════════════════════════════════════
  async function renderVotingSection(container, chapterId, workId, session) {
    container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3);"><i class="ti ti-loader-2" style="font-size:24px;animation:spin 1s linear infinite;"></i></div>';

    var characters = await loadChapterCharacters(chapterId);
    if (!characters.length) { container.innerHTML = ''; return; }

    var titles = await loadTitles();
    var userId = session ? session.user.id : null;
    var userVotes = await loadUserVotes(chapterId, userId);
    var voteCounts = await loadChapterVoteCounts(chapterId);

    var titleMap = {};
    titles.forEach(function(t){ titleMap[t.id] = t; });

    container.innerHTML = '';

    // Section header
    var header = document.createElement('div');
    header.className = 'ct-section-header';
    header.innerHTML =
      '<div class="ct-section-title"><i class="ti ti-crown"></i> Character Titles</div>' +
      '<div class="ct-section-sub">Give each character a title based on their performance this chapter. One vote per character — permanent.</div>';
    container.appendChild(header);

    // Character cards
    characters.forEach(function(char) {
      var myVoteTitleId = userVotes[char.id] || null;
      var myVoteTitle = myVoteTitleId ? titleMap[myVoteTitleId] : null;
      var charVotes = voteCounts[char.id] || {};
      var hasVoted = !!myVoteTitleId;

      var card = document.createElement('div');
      card.className = 'ct-char-card';
      card.id = 'ct-char-' + char.id;

      var imgHtml = char.chapter_image_url
        ? '<img src="'+esc(char.chapter_image_url)+'" class="ct-char-img" alt=""/>'
        : char.portrait_url
          ? '<img src="'+esc(char.portrait_url)+'" class="ct-char-img" alt=""/>'
          : '<div class="ct-char-img-placeholder"><i class="ti ti-user"></i></div>';

      card.innerHTML =
        '<div class="ct-char-top">' +
          imgHtml +
          '<div class="ct-char-info">' +
            '<div class="ct-char-name">' + esc(char.name) + '</div>' +
            (hasVoted
              ? '<div class="ct-voted-badge"><i class="ti ti-check"></i> You voted: <strong>' + esc(myVoteTitle ? myVoteTitle.title : '?') + '</strong></div>'
              : (session
                  ? '<div class="ct-char-prompt">Pick a title for this chapter</div>'
                  : '<div class="ct-char-prompt"><a href="auth.html" style="color:var(--accent);">Sign in</a> to vote</div>')) +
          '</div>' +
          '<button class="ct-results-toggle" data-char="'+char.id+'" onclick="CharacterTitles.toggleResults(this)">' +
            '<i class="ti ti-chart-bar"></i> Results' +
          '</button>' +
        '</div>';

      // Results panel (hidden by default)
      var resultsDiv = document.createElement('div');
      resultsDiv.className = 'ct-results-panel';
      resultsDiv.id = 'ct-results-' + char.id;
      resultsDiv.style.display = 'none';
      resultsDiv.innerHTML = buildResultsHTML(charVotes, titleMap, 'chapter');
      card.appendChild(resultsDiv);

      // Title picker (only if not yet voted and logged in)
      if (!hasVoted && session) {
        var picker = buildTitlePicker(char.id, chapterId, workId, userId, titles, card, container, titleMap, voteCounts);
        card.appendChild(picker);
      }

      container.appendChild(card);
    });

    // Suggest a title link
    if (session) {
      var suggest = document.createElement('div');
      suggest.className = 'ct-suggest-wrap';
      suggest.innerHTML =
        '<button class="ct-suggest-btn" onclick="CharacterTitles.openSuggestModal()"><i class="ti ti-bulb"></i> Suggest a new title</button>';
      container.appendChild(suggest);
    }

    // Suggest modal
    container.appendChild(buildSuggestModal(session));
  }

  // ── BUILD TITLE PICKER ────────────────────────────────────────
  function buildTitlePicker(charId, chapterId, workId, userId, titles, card, container, titleMap, voteCounts) {
    var wrap = document.createElement('div');
    wrap.className = 'ct-picker-wrap';
    wrap.id = 'ct-picker-' + charId;

    // One-time warning
    var warning = document.createElement('div');
    warning.className = 'ct-picker-warning';
    warning.innerHTML = '<i class="ti ti-alert-circle"></i> You only get to choose one title for this chapter, once. Pick wisely.';
    wrap.appendChild(warning);

    // Category tabs
    var tabBar = document.createElement('div');
    tabBar.className = 'ct-tab-bar';
    var titlesByCategory = {};
    titles.forEach(function(t){
      if (!titlesByCategory[t.category]) titlesByCategory[t.category] = [];
      titlesByCategory[t.category].push(t);
    });

    CATEGORIES.forEach(function(cat, i) {
      if (!titlesByCategory[cat.key] || !titlesByCategory[cat.key].length) return;
      var tab = document.createElement('button');
      tab.className = 'ct-tab' + (i === 0 ? ' active' : '');
      tab.setAttribute('data-cat', cat.key);
      tab.innerHTML = '<i class="ti ' + cat.icon + '"></i> ' + cat.label;
      if (cat.key === 'negative') {
        tab.innerHTML += ' <span class="ct-neg-badge">!</span>';
      }
      tab.addEventListener('click', function() {
        wrap.querySelectorAll('.ct-tab').forEach(function(t){ t.classList.remove('active'); });
        tab.classList.add('active');
        wrap.querySelectorAll('.ct-grid').forEach(function(g){ g.style.display = 'none'; });
        var grid = wrap.querySelector('.ct-grid[data-cat="'+cat.key+'"]');
        if (grid) grid.style.display = 'flex';
      });
      tabBar.appendChild(tab);
    });
    wrap.appendChild(tabBar);

    // Search box
    var searchBox = document.createElement('input');
    searchBox.className = 'ct-search';
    searchBox.type = 'text';
    searchBox.placeholder = 'Search titles…';
    searchBox.addEventListener('input', function() {
      var q = searchBox.value.toLowerCase();
      wrap.querySelectorAll('.ct-title-btn').forEach(function(btn){
        btn.style.display = btn.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
      wrap.querySelectorAll('.ct-grid').forEach(function(g){ g.style.display = 'flex'; });
      wrap.querySelectorAll('.ct-tab').forEach(function(t){ t.classList.remove('active'); });
    });
    wrap.appendChild(searchBox);

    // Category grids
    CATEGORIES.forEach(function(cat, i) {
      var catTitles = titlesByCategory[cat.key] || [];
      if (!catTitles.length) return;
      var grid = document.createElement('div');
      grid.className = 'ct-grid';
      grid.setAttribute('data-cat', cat.key);
      grid.style.display = i === 0 ? 'flex' : 'none';

      if (cat.key === 'negative') {
        var warning = document.createElement('div');
        warning.className = 'ct-neg-warning';
        warning.innerHTML = '<i class="ti ti-alert-triangle"></i> These titles critique the character\'s actions, not the author. Use responsibly.';
        grid.appendChild(warning);
      }

      catTitles.forEach(function(t) {
        var btn = document.createElement('button');
        btn.className = 'ct-title-btn';
        btn.textContent = t.title;
        btn.setAttribute('data-title-id', t.id);
        btn.addEventListener('click', function() {
          // Confirm step
          wrap.querySelectorAll('.ct-title-btn').forEach(function(b){ b.classList.remove('selected'); });
          btn.classList.add('selected');
          showVoteConfirm(charId, t, chapterId, workId, userId, card, wrap, titleMap, voteCounts);
        });
        grid.appendChild(btn);
      });
      wrap.appendChild(grid);
    });

    return wrap;
  }

  // ── VOTE CONFIRM ──────────────────────────────────────────────
  function showVoteConfirm(charId, title, chapterId, workId, userId, card, pickerWrap, titleMap, voteCounts) {
    var existing = pickerWrap.querySelector('.ct-confirm-bar');
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.className = 'ct-confirm-bar';
    bar.innerHTML =
      '<span class="ct-confirm-text">Give <strong>' + esc(title.title) + '</strong>? This is permanent.</span>' +
      '<button class="ct-confirm-yes"><i class="ti ti-check"></i> Confirm</button>' +
      '<button class="ct-confirm-no">Cancel</button>';

    bar.querySelector('.ct-confirm-yes').addEventListener('click', async function() {
      bar.querySelector('.ct-confirm-yes').disabled = true;
      bar.querySelector('.ct-confirm-yes').innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite;"></i>';

      var ok = await submitVote(charId, title.id, chapterId, workId, userId);
      if (!ok) {
        bar.innerHTML = '<span style="color:var(--red);">Error submitting vote. Try again.</span>';
        return;
      }

      // Replace picker with voted state
      pickerWrap.remove();
      var promptEl = card.querySelector('.ct-char-prompt');
      if (promptEl) {
        promptEl.outerHTML = '<div class="ct-voted-badge"><i class="ti ti-check"></i> You voted: <strong>' + esc(title.title) + '</strong></div>';
      }

      // Update results panel
      if (!voteCounts[charId]) voteCounts[charId] = {};
      voteCounts[charId][title.id] = (voteCounts[charId][title.id]||0) + 1;
      var resultsPanel = document.getElementById('ct-results-' + charId);
      if (resultsPanel) {
        resultsPanel.innerHTML = buildResultsHTML(voteCounts[charId], titleMap, 'chapter');
      }

      // Show results immediately after voting
      var toggleBtn = card.querySelector('.ct-results-toggle');
      if (toggleBtn && resultsPanel) {
        resultsPanel.style.display = 'block';
        toggleBtn.innerHTML = '<i class="ti ti-chart-bar"></i> Hide';
      }
    });

    bar.querySelector('.ct-confirm-no').addEventListener('click', function() {
      bar.remove();
      pickerWrap.querySelectorAll('.ct-title-btn').forEach(function(b){ b.classList.remove('selected'); });
    });

    pickerWrap.appendChild(bar);
  }

  // ── BUILD RESULTS HTML ────────────────────────────────────────
  function buildResultsHTML(voteCountsForChar, titleMap, mode) {
    // Sort by count desc, take top 10
    var entries = Object.keys(voteCountsForChar).map(function(tid){
      return { titleId: tid, count: voteCountsForChar[tid], title: titleMap[tid] };
    }).filter(function(e){ return e.title; })
      .sort(function(a,b){ return b.count - a.count; })
      .slice(0, 10);

    if (!entries.length) return '<div class="ct-results-empty">No votes yet.</div>';

    var total = entries.reduce(function(s,e){ return s + e.count; }, 0);
    var html = '<div class="ct-results-list">';
    entries.forEach(function(e, i) {
      var pct = total > 0 ? Math.round((e.count / total) * 100) : 0;
      var catColor = { personality:'var(--accent)', role:'var(--gold)', dawnscribe:'#a78bfa', relationship:'#f472b6', fan_reaction:'#fb923c', negative:'var(--red)' };
      var color = catColor[e.title.category] || 'var(--accent)';
      html +=
        '<div class="ct-result-row">' +
          '<div class="ct-result-rank">' + (i+1) + '</div>' +
          '<div class="ct-result-info">' +
            '<div class="ct-result-title" style="color:'+color+';">' + esc(e.title.title) + '</div>' +
            '<div class="ct-result-bar-wrap"><div class="ct-result-bar" style="width:'+pct+'%;background:'+color+';"></div></div>' +
          '</div>' +
          '<div class="ct-result-count">' + e.count + ' <span style="font-size:10px;color:var(--text3);">(' + pct + '%)</span></div>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  // ── TOGGLE RESULTS PANEL ──────────────────────────────────────
  function toggleResults(btn) {
    var charId = btn.getAttribute('data-char');
    var panel = document.getElementById('ct-results-' + charId);
    if (!panel) return;
    var open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    btn.innerHTML = open
      ? '<i class="ti ti-chart-bar"></i> Results'
      : '<i class="ti ti-chart-bar"></i> Hide';
  }

  // ── SUGGEST MODAL ─────────────────────────────────────────────
  function buildSuggestModal(session) {
    var modal = document.createElement('div');
    modal.className = 'ct-modal-overlay';
    modal.id = 'ct-suggest-modal';
    modal.style.display = 'none';
    modal.innerHTML =
      '<div class="ct-modal">' +
        '<div class="ct-modal-header">' +
          '<div class="ct-modal-title"><i class="ti ti-bulb"></i> Suggest a Title</div>' +
          '<button class="ct-modal-close" onclick="CharacterTitles.closeSuggestModal()"><i class="ti ti-x"></i></button>' +
        '</div>' +
        '<div class="ct-modal-body">' +
          '<p style="font-size:12px;color:var(--text3);margin-bottom:14px;">Suggestions are reviewed by admin before going live. You\'ll receive an email either way.</p>' +
          '<div class="ct-modal-field">' +
            '<label class="ct-modal-label">Title Text <span style="color:var(--red);">*</span></label>' +
            '<input class="ct-modal-input" id="ct-suggest-title" maxlength="40" placeholder="e.g. Silent Chaos"/>' +
          '</div>' +
          '<div class="ct-modal-field">' +
            '<label class="ct-modal-label">Category <span style="color:var(--red);">*</span></label>' +
            '<select class="ct-modal-input" id="ct-suggest-cat">' +
              CATEGORIES.map(function(c){ return '<option value="'+c.key+'">'+c.label+'</option>'; }).join('') +
            '</select>' +
          '</div>' +
          '<div class="ct-modal-field">' +
            '<label class="ct-modal-label">Why this title? (optional)</label>' +
            '<textarea class="ct-modal-input" id="ct-suggest-reason" rows="3" maxlength="300" placeholder="Explain the vibe…"></textarea>' +
          '</div>' +
          '<div id="ct-suggest-feedback" style="font-size:12px;margin-top:6px;"></div>' +
        '</div>' +
        '<div class="ct-modal-footer">' +
          '<button class="ct-modal-cancel" onclick="CharacterTitles.closeSuggestModal()">Cancel</button>' +
          '<button class="ct-modal-submit" id="ct-suggest-submit" onclick="CharacterTitles.submitSuggestion()"><i class="ti ti-send"></i> Submit</button>' +
        '</div>' +
      '</div>';
    return modal;
  }

  function openSuggestModal() {
    var m = document.getElementById('ct-suggest-modal');
    if (m) m.style.display = 'flex';
  }
  function closeSuggestModal() {
    var m = document.getElementById('ct-suggest-modal');
    if (m) m.style.display = 'none';
    var fb = document.getElementById('ct-suggest-feedback');
    if (fb) fb.innerHTML = '';
  }

  async function submitSuggestion() {
    var title = (document.getElementById('ct-suggest-title')||{}).value || '';
    var cat = (document.getElementById('ct-suggest-cat')||{}).value || '';
    var reason = (document.getElementById('ct-suggest-reason')||{}).value || '';
    var fb = document.getElementById('ct-suggest-feedback');
    var btn = document.getElementById('ct-suggest-submit');

    if (!title.trim()) { if(fb) fb.innerHTML = '<span style="color:var(--red);">Please enter a title.</span>'; return; }

    var session = null;
    try { var r = await db().auth.getSession(); session = r.data.session; } catch(e){}
    if (!session) { if(fb) fb.innerHTML = '<span style="color:var(--red);">Please sign in first.</span>'; return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite;"></i>';

    var { error } = await db().from('suggested_character_titles').insert({
      suggested_by: session.user.id,
      title: title.trim(),
      category: cat,
      reason: reason.trim() || null
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> Submit';

    if (error) {
      if (fb) fb.innerHTML = '<span style="color:var(--red);">Error: ' + esc(error.message) + '</span>';
    } else {
      if (fb) fb.innerHTML = '<span style="color:var(--green);"><i class="ti ti-check"></i> Submitted! You\'ll be notified by email after review.</span>';
      setTimeout(closeSuggestModal, 2200);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER — STORY.HTML CHARACTER CARDS
  // ══════════════════════════════════════════════════════════════
  async function renderStoryCharacterCards(container, workId, isOwner) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;font-size:20px;"></i></div>';

    var { data: chars } = await db().from('novel_characters')
      .select('id, name, portrait_url, status, ended_reason')
      .eq('work_id', workId)
      .order('sort_order', { ascending: true });

    if (!chars || !chars.length) { container.innerHTML = ''; return; }

    var titles = await loadTitles();
    var titleMap = {};
    titles.forEach(function(t){ titleMap[t.id] = t; });

    var voteCounts = await loadWorkVoteCounts(workId);

    var { data: collabs } = await db().from('artwork_collabs')
      .select('id, artwork_id, character_name, works(id, cover_url, title)')
      .eq('novel_id', workId)
      .eq('status', 'approved');
    var collabsByChar = {};
    (collabs||[]).forEach(function(c){
      var key = (c.character_name||'').toLowerCase().trim();
      if (!collabsByChar[key]) collabsByChar[key] = [];
      collabsByChar[key].push(c);
    });

    container.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'ct-story-grid';
    container.appendChild(grid);

    // Hidden file input for portrait uploads (owner only)
    var activeUploadCharId = null;
    if (isOwner) {
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      fileInput.id = 'ct-portrait-input';
      fileInput.addEventListener('change', async function() {
        var file = fileInput.files[0];
        if (!file || !activeUploadCharId) return;
        var btn = container.querySelector('.ct-edit-btn[data-char="'+activeUploadCharId+'"]');
        if (btn) { btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite;"></i>'; btn.disabled = true; }

        var ext = file.name.split('.').pop();
        var path = activeUploadCharId + '-portrait-' + Date.now() + '.' + ext;
        var { error: upErr } = await db().storage.from('avatars').upload(path, file, { upsert: true });
        if (upErr) { if(btn){btn.innerHTML='<i class="ti ti-pencil"></i> Edit';btn.disabled=false;} return; }
        var { data: urlData } = db().storage.from('avatars').getPublicUrl(path);
        var url = urlData.publicUrl;

        await db().from('novel_characters').update({ portrait_url: url }).eq('id', activeUploadCharId);

        // Update the portrait in the card
        var img = container.querySelector('.ct-story-portrait[data-char="'+activeUploadCharId+'"]');
        var placeholder = container.querySelector('.ct-story-portrait-placeholder[data-char="'+activeUploadCharId+'"]');
        if (img) { img.src = url; img.style.display = 'block'; }
        if (placeholder) { placeholder.style.display = 'none'; }
        if (!img) {
          // Was a placeholder, swap it
          if (placeholder) {
            var newImg = document.createElement('img');
            newImg.src = url;
            newImg.className = 'ct-story-portrait';
            newImg.setAttribute('data-char', activeUploadCharId);
            newImg.alt = '';
            placeholder.parentNode.replaceChild(newImg, placeholder);
          }
        }
        if (btn) { btn.innerHTML = '<i class="ti ti-pencil"></i> Edit'; btn.disabled = false; }
        fileInput.value = '';
      });
      container.appendChild(fileInput);
    }

    chars.forEach(function(char) {
      var charVotes = voteCounts[char.id] || {};
      var charCollabs = collabsByChar[char.name.toLowerCase().trim()] || [];

      var top3 = Object.keys(charVotes)
        .map(function(tid){ return { title: titleMap[tid], count: charVotes[tid] }; })
        .filter(function(e){ return e.title; })
        .sort(function(a,b){ return b.count - a.count; })
        .slice(0, 3);

      var card = document.createElement('div');
      card.className = 'ct-story-char-card' + (char.status === 'ended' ? ' ct-char-ended' : '');

      var imgHtml = char.portrait_url
        ? '<img src="'+esc(char.portrait_url)+'" class="ct-story-portrait" data-char="'+esc(char.id)+'" alt="'+esc(char.name)+'"/>'
        : '<div class="ct-story-portrait-placeholder" data-char="'+esc(char.id)+'"><i class="ti ti-user" style="font-size:28px;"></i></div>';

      var endedBadge = char.status === 'ended'
        ? '<div class="ct-ended-badge"><i class="ti ti-skull"></i> ' + esc(char.ended_reason || 'No longer in story') + '</div>'
        : '';

      var editBtn = isOwner
        ? '<button class="ct-edit-btn" data-char="'+esc(char.id)+'" title="Upload portrait"><i class="ti ti-pencil"></i> Edit</button>'
        : '';

      var titlesHtml = top3.length
        ? top3.map(function(e, i){
            var catColor = { personality:'var(--accent)', role:'var(--gold)', dawnscribe:'#a78bfa', relationship:'#f472b6', fan_reaction:'#fb923c', negative:'var(--red)' };
            var color = catColor[e.title.category] || 'var(--accent)';
            return '<div class="ct-story-top-title" style="border-color:'+color+';color:'+color+';">' +
              (i===0 ? '<i class="ti ti-crown" style="font-size:10px;"></i> ' : '') +
              esc(e.title.title) +
              ' <span class="ct-story-title-count">'+e.count+'</span>' +
            '</div>';
          }).join('')
        : '<div style="font-size:11px;color:var(--text3);font-style:italic;">No votes yet</div>';

      var collabsHtml = '';
      if (charCollabs.length) {
        collabsHtml =
          '<div class="ct-story-art-strip">' +
          charCollabs.slice(0,6).map(function(c){
            var cover = c.works && c.works.cover_url ? c.works.cover_url : '';
            return cover ? '<a href="artwork.html?id='+esc(c.artwork_id)+'" class="ct-story-art-thumb"><img src="'+esc(cover)+'" alt="collab art"/></a>' : '';
          }).join('') +
          (charCollabs.length > 6 ? '<div class="ct-story-art-more">+' + (charCollabs.length-6) + '</div>' : '') +
          '</div>';
      }

      card.innerHTML =
        '<div class="ct-story-char-top">' +
          imgHtml +
          '<div class="ct-story-char-name">' + esc(char.name) + '</div>' +
          endedBadge +
          editBtn +
        '</div>' +
        '<div class="ct-story-titles-wrap">' + titlesHtml + '</div>' +
        collabsHtml;

      // Wire edit button
      if (isOwner) {
        var btn = card.querySelector('.ct-edit-btn');
        if (btn) {
          btn.addEventListener('click', function() {
            activeUploadCharId = char.id;
            document.getElementById('ct-portrait-input').click();
          });
        }
      }

      grid.appendChild(card);
    });
  }

  // Public API
  return {
    renderVotingSection: renderVotingSection,
    renderStoryCharacterCards: renderStoryCharacterCards,
    toggleResults: toggleResults,
    openSuggestModal: openSuggestModal,
    closeSuggestModal: closeSuggestModal,
    submitSuggestion: submitSuggestion
  };

})();
