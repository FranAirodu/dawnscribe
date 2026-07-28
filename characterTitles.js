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
  async function renderVotingSection(container, chapterId, workId, session, isOwner) {
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
      '<div class="ct-section-sub">' +
        (isOwner
          ? 'Readers vote to give your characters titles. Authors cannot vote on or suggest songs for their own characters.'
          : 'Give each character a title based on their performance this chapter. One vote per character — permanent.') +
      '</div>';
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
            (isOwner
              ? '<div class="ct-char-prompt" style="color:var(--text3);font-size:11px;font-style:italic;">Authors cannot vote on their own characters</div>'
              : (hasVoted
                  ? '<div class="ct-voted-badge"><i class="ti ti-check"></i> You voted: <strong>' + esc(myVoteTitle ? myVoteTitle.title : '?') + '</strong></div>'
                  : (session
                      ? '<div class="ct-char-prompt">Pick a title for this chapter</div>'
                      : '<div class="ct-char-prompt"><a href="auth.html" style="color:var(--accent);">Sign in</a> to vote</div>'))) +
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

      // Suggest a Song button — hidden for story owner
      if (session && !isOwner) {
        (function(cid, cname, wid, uid) {
          var songBtn = document.createElement('button');
          songBtn.className = 'ct-suggest-song-btn ct-suggest-song-inline';
          songBtn.innerHTML = '<i class="ti ti-music-plus"></i> Suggest a theme song for ' + esc(cname);
          songBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openSongModal(cid, cname, wid, uid || 'anon');
          });
          card.appendChild(songBtn);

          // Personal Opinion button
          var opinionBtn = document.createElement('button');
          opinionBtn.className = 'ct-opinion-btn';
          opinionBtn.innerHTML = '<i class="ti ti-message-heart"></i> Share your take on ' + esc(cname) + ' this chapter';
          opinionBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openOpinionModal(cid, cname, chapterId, wid, uid);
          });
          card.appendChild(opinionBtn);
        })(char.id, char.name, workId, userId);
      }

      // Title picker (only if not yet voted, logged in, and NOT the owner)
      if (!hasVoted && session && !isOwner) {
        var picker = buildTitlePicker(char.id, chapterId, workId, userId, titles, card, container, titleMap, voteCounts);
        card.appendChild(picker);
      }

      container.appendChild(card);
    });

    // Suggest a title link — hidden for owner
    if (session && !isOwner) {
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

      // ── NEW READER MISSION: give character a title ────────────
      if (window.dsCompleteMission) {
        try { await window.dsCompleteMission('give_character_title'); } catch(e) {}
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
  // ══════════════════════════════════════════════════════════════
  // SONG SUGGESTIONS
  // ══════════════════════════════════════════════════════════════

  // Extract YouTube video ID from various URL formats
  function ytId(url) {
    var m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  // Load approved songs for all characters in a work
  async function loadApprovedSongs(workId) {
    var { data } = await db().from('character_song_suggestions')
      .select('id, character_id, youtube_url, song_title, artist_name, is_featured, chapter_id, user_id')
      .eq('work_id', workId)
      .eq('status', 'approved')
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: true });
    var map = {};
    (data||[]).forEach(function(s) {
      if (!map[s.character_id]) map[s.character_id] = [];
      map[s.character_id].push(s);
    });
    return map;
  }

  // Load pending songs (author only)
  async function loadPendingSongs(workId) {
    var { data } = await db().from('character_song_suggestions')
      .select('id, character_id, youtube_url, song_title, artist_name, user_id, chapter_id, created_at')
      .eq('work_id', workId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    return data || [];
  }

  // Load suggester usernames in batch
  async function loadUsernames(userIds) {
    if (!userIds.length) return {};
    var { data } = await db().from('profiles').select('id, username, display_name').in('id', userIds);
    var map = {};
    (data||[]).forEach(function(p){ map[p.id] = p.display_name || p.username; });
    return map;
  }

  // Submit a song suggestion
  async function submitSongSuggestion(charId, workId, chapterId, userId, youtubeUrl, songTitle, artistName) {
    var vid = ytId(youtubeUrl);
    if (!vid) return { error: 'Invalid YouTube URL' };
    var cleanUrl = 'https://www.youtube.com/watch?v=' + vid;
    var { error } = await db().from('character_song_suggestions').insert({
      character_id: charId, work_id: workId, chapter_id: chapterId || null,
      user_id: userId, youtube_url: cleanUrl, song_title: songTitle.trim(),
      artist_name: artistName.trim(), status: 'pending'
    });
    return { error: error ? error.message : null };
  }

  // Approve / reject a song
  async function updateSongStatus(songId, status) {
    var { error } = await db().from('character_song_suggestions')
      .update({ status: status }).eq('id', songId);
    return !error;
  }

  // Delete a song permanently
  async function deleteSong(songId) {
    var { error } = await db().from('character_song_suggestions')
      .delete().eq('id', songId);
    return !error;
  }

  // Set featured song (unfeature others for same character first)
  async function featureSong(songId, charId) {
    await db().from('character_song_suggestions')
      .update({ is_featured: false }).eq('character_id', charId).eq('is_featured', true);
    var { error } = await db().from('character_song_suggestions')
      .update({ is_featured: true }).eq('id', songId);
    return !error;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER — STORY.HTML CHARACTER CARDS
  // ══════════════════════════════════════════════════════════════
  async function renderStoryCharacterCards(container, workId, isOwner, workAuthorId) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;font-size:20px;"></i></div>';

    var { data: chars } = await db().from('novel_characters')
      .select('id, name, portrait_url, status, ended_reason, impressions_enabled, is_book_card')
      .eq('work_id', workId)
      .order('sort_order', { ascending: true });

    if (!chars || !chars.length) { container.innerHTML = ''; return; }

    // Book Card (if any) always renders first, ahead of the characters.
    chars.sort(function(a, b){
      var ab = a.is_book_card ? 0 : 1, bb = b.is_book_card ? 0 : 1;
      if (ab !== bb) return ab - bb;
      return 0; // preserve sort_order within each group
    });

    var titles = await loadTitles();
    var titleMap = {};
    titles.forEach(function(t){ titleMap[t.id] = t; });

    var voteCounts = await loadWorkVoteCounts(workId);

    // NOTE: artwork_collabs lost its novel_id/character_name columns in the
    // collab system rebuild, so per-character art matching is disabled until
    // the schema grows a character link. Query kept schema-valid to avoid 400s.
    var collabsByChar = {};
    try {
      var { data: collabs } = await db().from('artwork_collabs')
        .select('id, artwork_id, work_id, status')
        .eq('work_id', workId)
        .eq('status', 'approved');
      // No character association available — collabsByChar stays empty.
    } catch(e) {}

    var currentUserSession = window._ctSession || null;

    // Load aura votes
    var charIds = chars.map(function(c){ return c.id; });

    // Load approved character cosmetic collabs
    var cosmeticsByChar = {};
    try {
      var { data: cosmetics } = await db().from('character_cosmetic_collabs')
        .select('id, character_id, artist_id, image_url, name, description, quill_price')
        .in('character_id', charIds)
        .eq('status', 'approved');
      (cosmetics || []).forEach(function(c){
        if (!cosmeticsByChar[c.character_id]) cosmeticsByChar[c.character_id] = [];
        cosmeticsByChar[c.character_id].push(c);
      });
    } catch(e) {}

    // Load fan vote counts (total + this month + whether I voted today)
    var fanCounts = {};
    try {
      var { data: fanRows } = await db().rpc('get_character_fan_counts', { p_work_id: workId });
      (fanRows || []).forEach(function(r){ fanCounts[r.character_id] = r; });
    } catch(e) {}
    var auraByChar = await loadAuraVotes(charIds);

    // Load featured opinions per character
    var featuredOpinionsByChar = await loadFeaturedOpinions(charIds);

    // ── CARD EXPANSION DATA (dynamics / impressions / moods / quotes / traits / fan art / questions) ──
    var _uid = currentUserSession ? currentUserSession.user.id : null;
    var _monthStart = new Date().toISOString().slice(0,7) + '-01';
    var EXP = { dyn:[], dynVotes:{}, myDynVotes:{}, impr:{}, mood:{}, quotes:{}, quoteVotes:{}, myQuoteVotes:{}, traits:{}, fanArt:{}, qs:{}, pendQ:{}, pendQuotes:{}, charNames:{} };
    chars.forEach(function(c){ EXP.charNames[c.id] = c.name; });
    try {
      var expRes = await Promise.all([
        Promise.resolve(db().from('character_dynamics').select('id,character_a,character_b,label,status,created_by').eq('work_id', workId)).catch(function(){return {data:[]};}),
        Promise.resolve(db().from('character_impression_votes').select('character_id,user_id,phase,sentiment').in('character_id', charIds)).catch(function(){return {data:[]};}),
        Promise.resolve(db().from('character_mood_votes').select('character_id,user_id,mood').in('character_id', charIds).eq('vote_month', _monthStart)).catch(function(){return {data:[]};}),
        Promise.resolve(db().from('character_quotes').select('id,character_id,user_id,quote_text,status,is_featured').in('character_id', charIds)).catch(function(){return {data:[]};}),
        Promise.resolve(db().from('character_trait_votes').select('character_id,user_id,axis,value').in('character_id', charIds)).catch(function(){return {data:[]};}),
        Promise.resolve(db().from('story_collabs').select('id,character_id,image_url,description').eq('work_id', workId).eq('status','approved').not('character_id','is',null)).catch(function(){return {data:[]};}),
        Promise.resolve(db().from('character_questions').select('id,character_id,user_id,question,answer,status,is_pinned,created_at').in('character_id', charIds)).catch(function(){return {data:[]};})
      ]);
      EXP.dyn = (expRes[0].data || []).filter(function(d){ return d.status === 'active' || isOwner; });
      (expRes[1].data || []).forEach(function(r){
        var e = EXP.impr[r.character_id] || (EXP.impr[r.character_id] = { first:{}, now:{}, myFirst:null, myNow:null });
        e[r.phase][r.sentiment] = (e[r.phase][r.sentiment] || 0) + 1;
        if (_uid && r.user_id === _uid) { if (r.phase==='first') e.myFirst = r.sentiment; else e.myNow = r.sentiment; }
      });
      (expRes[2].data || []).forEach(function(r){
        var m = EXP.mood[r.character_id] || (EXP.mood[r.character_id] = { counts:{}, total:0, my:null });
        m.counts[r.mood] = (m.counts[r.mood] || 0) + 1; m.total++;
        if (_uid && r.user_id === _uid) m.my = r.mood;
      });
      (expRes[3].data || []).forEach(function(q){
        var arr = EXP.quotes[q.character_id] || (EXP.quotes[q.character_id] = []);
        arr.push(q);
        if (q.status === 'pending') EXP.pendQuotes[q.character_id] = (EXP.pendQuotes[q.character_id] || 0) + 1;
      });
      (expRes[4].data || []).forEach(function(r){
        var t = EXP.traits[r.character_id] || (EXP.traits[r.character_id] = {});
        var a = t[r.axis] || (t[r.axis] = { sum:0, count:0, my:null });
        a.sum += r.value; a.count++;
        if (_uid && r.user_id === _uid) a.my = r.value;
      });
      (expRes[5].data || []).forEach(function(f){
        var arr = EXP.fanArt[f.character_id] || (EXP.fanArt[f.character_id] = []);
        arr.push(f);
      });
      (expRes[6].data || []).forEach(function(q){
        if (q.status === 'answered') { (EXP.qs[q.character_id] || (EXP.qs[q.character_id] = [])).push(q); }
        else if (q.status === 'pending') { EXP.pendQ[q.character_id] = (EXP.pendQ[q.character_id] || 0) + 1; }
      });
      // dynamic + quote votes (need ids first)
      var dynIds = EXP.dyn.map(function(d){ return d.id; });
      var quoteIds = [];
      Object.values(EXP.quotes).forEach(function(arr){ arr.forEach(function(q){ if (q.status==='approved') quoteIds.push(q.id); }); });
      var voteRes = await Promise.all([
        dynIds.length ? Promise.resolve(db().from('character_dynamic_votes').select('dynamic_id,user_id').in('dynamic_id', dynIds)).catch(function(){return {data:[]};}) : {data:[]},
        quoteIds.length ? Promise.resolve(db().from('character_quote_votes').select('quote_id,user_id').in('quote_id', quoteIds)).catch(function(){return {data:[]};}) : {data:[]}
      ]);
      (voteRes[0].data || []).forEach(function(v){
        EXP.dynVotes[v.dynamic_id] = (EXP.dynVotes[v.dynamic_id] || 0) + 1;
        if (_uid && v.user_id === _uid) EXP.myDynVotes[v.dynamic_id] = true;
      });
      (voteRes[1].data || []).forEach(function(v){
        EXP.quoteVotes[v.quote_id] = (EXP.quoteVotes[v.quote_id] || 0) + 1;
        if (_uid && v.user_id === _uid) EXP.myQuoteVotes[v.quote_id] = true;
      });
    } catch(e) { console.warn('Card expansion data failed', e); }
    // Most Beloved: current-month fan vote leader across this novel's cards
    var _maxMonthVotes = 0;
    chars.forEach(function(c){ var f = fanCounts[c.id]; if (f && (f.month_votes||0) > _maxMonthVotes) _maxMonthVotes = f.month_votes||0; });

    // Load current user's own aura votes (to show which they picked)
    var myAuraMap = {};
    if (currentUserSession) {
      var { data: myAuraRows } = await db().from('character_aura_votes')
        .select('character_id, hex')
        .in('character_id', charIds)
        .eq('user_id', currentUserSession.user.id);
      (myAuraRows||[]).forEach(function(r){ myAuraMap[r.character_id] = r.hex; });
    }

    // Load approved songs and suggester names
    var songsByChar = await loadApprovedSongs(workId);
    var allSongUserIds = [];
    Object.values(songsByChar).forEach(function(songs) {
      songs.forEach(function(s){ allSongUserIds.push(s.user_id); });
    });
    var usernames = await loadUsernames([...new Set(allSongUserIds)]);

    // Batch-fetch chapter titles for songs that were suggested on a specific chapter
    var allChapterIds = [];
    Object.values(songsByChar).forEach(function(songs) {
      songs.forEach(function(s){ if (s.chapter_id) allChapterIds.push(s.chapter_id); });
    });
    var chapterMap = {};
    if (allChapterIds.length) {
      var { data: chapRows } = await db().from('chapters')
        .select('id, title, chapter_number')
        .in('id', [...new Set(allChapterIds)]);
      (chapRows||[]).forEach(function(c){ chapterMap[c.id] = c; });
    }
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
      var isBook = !!char.is_book_card;
      var charVotes = voteCounts[char.id] || {};
      var charCollabs = collabsByChar[char.name.toLowerCase().trim()] || [];
      var auraData = auraByChar[char.id] || { winner: null, total: 0 };
      var myAuraHex = myAuraMap[char.id] || null;
      var top3 = Object.keys(charVotes)
        .map(function(tid){ return { title: titleMap[tid], count: charVotes[tid] }; })
        .filter(function(e){ return e.title; })
        .sort(function(a,b){ return b.count - a.count; })
        .slice(0, 3);

      // ── FAN VOTES (total + monthly) ───────────────────────────
      var fc = fanCounts[char.id] || { total_votes: 0, month_votes: 0, voted_today: false };
      var fanBtnHtml = '';
      if (currentUserSession && !isOwner && char.status !== 'ended') {
        var votedToday = !!fc.voted_today;
        fanBtnHtml = '<button class="ct-fan-vote-btn" data-fan-char="' + esc(char.id) + '"' + (votedToday ? ' disabled' : '') +
          ' style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:14px;border:1px solid rgba(236,72,153,0.45);background:' + (votedToday ? 'rgba(236,72,153,0.18)' : 'transparent') + ';color:#ec4899;font-size:11px;font-weight:700;cursor:' + (votedToday ? 'default' : 'pointer') + ';font-family:inherit;">' +
          '<i class="ti ti-heart"></i> ' + (votedToday ? 'Voted today' : 'Fan Vote') + '</button>';
      }
      var fanRowHtml =
        '<div class="ct-fan-vote-row" style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;padding:2px 0 6px;">' +
          fanBtnHtml +
          '<span class="ct-fan-counts" data-fan-counts="' + esc(char.id) + '" style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:14px;border:1px solid rgba(236,72,153,0.3);font-size:10.5px;color:var(--text3);">' +
            '<i class="ti ti-heart" style="color:#ec4899;font-size:10px;"></i> ' +
            '<strong style="color:var(--text2);">' + (fc.total_votes || 0) + '</strong>&nbsp;all-time \u00b7 ' +
            '<strong style="color:var(--text2);">' + (fc.month_votes || 0) + '</strong>&nbsp;this month' +
          '</span>' +
        '</div>';

      // ── EXPANSION: per-character computed bits ──────────────────
      var moodData = EXP.mood[char.id] || { counts:{}, total:0, my:null };
      var moodWinner = null, moodMax = 0;
      Object.keys(moodData.counts).forEach(function(m){ if (moodData.counts[m] > moodMax) { moodMax = moodData.counts[m]; moodWinner = m; } });
      var moodHex = moodWinner ? (CT_MOODS.find(function(m){ return m.name === moodWinner; }) || {}).hex : null;

      var belovedHtml = (_maxMonthVotes > 0 && (fc.month_votes||0) === _maxMonthVotes)
        ? '<div class="ct-beloved-ribbon" title="Most fan votes this month"><i class="ti ti-heart-filled"></i> Most Beloved</div>' : '';

      var imprData = EXP.impr[char.id] || { first:{}, now:{}, myFirst:null, myNow:null };
      function _topSent(obj){ var w=null,mx=0; Object.keys(obj).forEach(function(s){ if(obj[s]>mx){mx=obj[s];w=s;} }); return w; }
      var imprTopFirst = _topSent(imprData.first), imprTopNow = _topSent(imprData.now);
      var impressionHtml = (char.impressions_enabled !== false && (imprTopFirst || imprTopNow))
        ? '<div class="ct-impression-strip"><i class="ti ti-timeline"></i> First: <strong style="color:' + (CT_SENT_COLOR[imprTopFirst]||'var(--text3)') + ';">' + esc(imprTopFirst||'\u2014') + '</strong> <i class="ti ti-arrow-right" style="font-size:9px;"></i> Now: <strong style="color:' + (CT_SENT_COLOR[imprTopNow]||'var(--text3)') + ';">' + esc(imprTopNow||'\u2014') + '</strong></div>'
        : '';

      var charDyns = EXP.dyn.filter(function(d){ return (d.character_a === char.id || d.character_b === char.id) && d.status === 'active'; })
        .sort(function(a,b){ return (EXP.dynVotes[b.id]||0) - (EXP.dynVotes[a.id]||0); });
      var topDyn = charDyns[0];
      var dynChipHtml = topDyn
        ? '<div class="ct-dyn-chip"><i class="ti ti-arrows-left-right"></i> ' + esc(topDyn.label) + ' \u00b7 ' + esc(EXP.charNames[topDyn.character_a === char.id ? topDyn.character_b : topDyn.character_a] || '?') + '</div>'
        : '';

      var charQuotes = (EXP.quotes[char.id] || []).filter(function(q){ return q.status === 'approved'; })
        .sort(function(a,b){ return (b.is_featured?1e6:0) + (EXP.quoteVotes[b.id]||0) - ((a.is_featured?1e6:0) + (EXP.quoteVotes[a.id]||0)); });
      var topQuote = charQuotes[0];
      var quoteStripHtml = topQuote
        ? '<div class="ct-quote-strip"><div class="ct-opinion-label" style="color:#a78bfa;"><i class="ti ti-quote"></i> Quote Wall</div><div class="ct-opinion-body">' + esc('\u201c' + topQuote.quote_text + '\u201d') + '</div></div>'
        : '';

      var charFanArt = EXP.fanArt[char.id] || [];
      var fanArtHtml = charFanArt.length
        ? '<div class="ct-story-art-strip">' +
            charFanArt.slice(0,6).map(function(f){
              return '<a href="' + esc(f.image_url) + '" target="_blank" rel="noopener" class="ct-story-art-thumb" title="' + esc(f.description||'Fan art') + '"><img src="' + esc(f.image_url) + '" alt="fan art"/></a>';
            }).join('') +
            (charFanArt.length > 6 ? '<div class="ct-story-art-more">+' + (charFanArt.length - 6) + '</div>' : '') +
          '</div>'
        : '';

      var charTraits = EXP.traits[char.id] || {};
      var traitsVoteCount = Object.keys(charTraits).reduce(function(n,k){ return n + charTraits[k].count; }, 0);
      var charAnsweredQs = (EXP.qs[char.id] || []).sort(function(a,b){ return (b.is_pinned?1:0) - (a.is_pinned?1:0) || (a.created_at < b.created_at ? 1 : -1); });
      var charPendQ = EXP.pendQ[char.id] || 0;
      var charPendQuotes = EXP.pendQuotes[char.id] || 0;

      var card = document.createElement('div');
      card.className = 'ct-story-char-card' + (char.status === 'ended' ? ' ct-char-ended' : '');
      if (moodHex) { card.classList.add('ct-mood-tinted'); card.style.setProperty('--ct-mood', moodHex); card.title = 'This month\u2019s mood: ' + moodWinner; }

      var imgHtml = char.portrait_url
        ? '<img src="'+esc(char.portrait_url)+'" class="ct-story-portrait" data-char="'+esc(char.id)+'" alt="'+esc(char.name)+'"/>'
        : '<div class="ct-story-portrait-placeholder" data-char="'+esc(char.id)+'"><i class="ti ' + (isBook ? 'ti-book-2' : 'ti-user') + '" style="font-size:28px;"></i></div>';

      var endedBadge = char.status === 'ended'
        ? '<div class="ct-ended-badge"><i class="ti ti-skull"></i> ' + esc(char.ended_reason || 'No longer in story') + '</div>'
        : '';

      var editBtn = isOwner
        ? '<button class="ct-edit-btn" data-char="'+esc(char.id)+'" title="Upload portrait"><i class="ti ti-pencil"></i> Edit</button>'
        : '';

      var aura = auraData.winner; // null if no votes yet

      var titlesHtml = top3.length
        ? top3.map(function(e, i){
            var catColor = { personality:'var(--accent)', role:'var(--gold)', dawnscribe:'#a78bfa', relationship:'#f472b6', fan_reaction:'#fb923c', negative:'var(--red)' };
            var color = catColor[e.title.category] || 'var(--accent)';
            // If aura voted, blend: border uses aura, text keeps category color
            var borderColor = aura ? aura : color;
            var bgColor = aura ? aura + '18' : 'transparent';
            return '<div class="ct-story-top-title" style="border-color:'+borderColor+';color:'+color+';background:'+bgColor+';">' +
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

      // ── AURA wash (full card gradient tint from winning vote) ──
      var auraWashStyle = auraData.winner
        ? 'background: radial-gradient(ellipse at top, ' + auraData.winner + '22 0%, transparent 70%);'
        : '';
      var auraWashHtml = '<div class="ct-aura-wash' + (auraData.winner ? ' active' : '') + '" data-char-aura="'+esc(char.id)+'" style="'+auraWashStyle+'"></div>';

      // ── FEATURED OPINION strip ────────────────────────────────
      var featuredOpinions = featuredOpinionsByChar[char.id] || [];
      var featuredOpinion = featuredOpinions.find(function(o){ return o.is_featured; });
      var approvedOpinions = featuredOpinions; // all approved, including non-featured
      var featuredOpinionHtml = '';
      if (featuredOpinion) {
        featuredOpinionHtml =
          '<div class="ct-opinion-strip">' +
            '<div class="ct-opinion-label"><i class="ti ti-message-heart"></i> Reader\'s Take</div>' +
            '<div class="ct-opinion-body">' + esc('\u201c' + featuredOpinion.body + '\u201d') + '</div>' +
            '<div class="ct-opinion-attr">\u2014 ' + esc(featuredOpinion._authorName || '') + '</div>' +
          '</div>';
      }

      // Songs for this character
      var charSongs = songsByChar[char.id] || [];
      var featuredSong = charSongs.find(function(s){ return s.is_featured; });

      // Front: featured song strip (if exists)
      var featuredHtml = '';
      if (featuredSong) {
        var sugName = usernames[featuredSong.user_id] || 'a reader';
        var vid = ytId(featuredSong.youtube_url);
        var songBg = aura ? 'background:' + aura + '12;border-color:' + aura + '40;' : '';
        featuredHtml = '<a href="' + esc(featuredSong.youtube_url) + '" target="_blank" rel="noopener" class="ct-featured-song" style="' + songBg + '">' +
          '<div class="ct-featured-song-thumb"><img src="https://img.youtube.com/vi/' + esc(vid) + '/default.jpg" alt=""/><div class="ct-featured-song-play"><i class="ti ti-player-play-filled"></i></div></div>' +
          '<div class="ct-featured-song-info"><div class="ct-featured-song-title">' + esc(featuredSong.song_title) + '</div>' +
          '<div class="ct-featured-song-artist">' + esc(featuredSong.artist_name || '') + '</div>' +
          '<div class="ct-featured-song-credit" style="' + (aura ? 'color:'+aura+';' : '') + '">♪ suggested by ' + esc(sugName) + '</div></div>' +
          '</a>';
      }

      // Back: all approved songs list
      var backSongsHtml = charSongs.length
        ? charSongs.map(function(s) {
            var vid2 = ytId(s.youtube_url);
            var sugName2 = usernames[s.user_id] || 'a reader';
            var chap = s.chapter_id ? chapterMap[s.chapter_id] : null;
            var chapPill = chap
              ? '<a href="chapter.html?id=' + esc(s.chapter_id) + '" class="ct-song-chapter-pill" onclick="event.stopPropagation();" title="Go to chapter"><i class="ti ti-book"></i> Ch. ' + chap.chapter_number + '</a>'
              : '';
            var starBtn = isOwner
              ? '<button class="ct-song-feature-btn" data-song-id="' + esc(s.id) + '" data-char-id="' + esc(char.id) + '" title="' + (s.is_featured ? 'Unfeature' : 'Set as featured') + '">' +
                (s.is_featured ? '<span style="font-size:13px;line-height:1;">★</span>' : '<i class="ti ti-star"></i>') + '</button>'
              : '';
            var deleteBtn = isOwner
              ? '<button class="ct-song-delete-btn" data-song-id="' + esc(s.id) + '" title="Delete song"><i class="ti ti-trash"></i></button>'
              : '';
            return '<a href="' + esc(s.youtube_url) + '" target="_blank" rel="noopener" class="ct-song-row">' +
              '<img src="https://img.youtube.com/vi/' + esc(vid2) + '/default.jpg" class="ct-song-thumb" alt=""/>' +
              '<div class="ct-song-info"><div class="ct-song-title">' + esc(s.song_title) + '</div>' +
              '<div class="ct-song-meta">' + esc(s.artist_name || '') + (s.artist_name ? ' · ' : '') + 'by ' + esc(sugName2) + '</div>' +
              chapPill + '</div>' +
              starBtn + deleteBtn + '</a>';
          }).join('')
        : '<div class="ct-songs-empty"><i class="ti ti-music-off"></i> No songs yet — be the first!</div>';

      // Suggest button (logged-in non-owner)
      var suggestBtnHtml = currentUserSession && !isOwner
        ? '<button class="ct-suggest-song-btn" data-char-id="' + esc(char.id) + '" data-char-name="' + esc(char.name) + '"><i class="ti ti-music-plus"></i> Suggest a Song</button>'
        : '';

      // ── CHARACTER COSMETIC COLLABS ──────────────────────────────
      var charCosmetics = cosmeticsByChar[char.id] || [];
      var cosmeticGalleryHtml = charCosmetics.length
        ? '<div class="ct-cosmetic-gallery">' +
            charCosmetics.map(function(cm){
              return '<div class="ct-cosmetic-item">' +
                '<img src="' + esc(cm.image_url) + '" alt="' + esc(cm.name) + '" class="ct-cosmetic-img"/>' +
                '<div class="ct-cosmetic-name">' + esc(cm.name) + '</div>' +
                (cm.quill_price ? '<div class="ct-cosmetic-price"><i class="ti ti-feather" style="font-size:10px;"></i> ' + cm.quill_price + ' Quills</div>' : '') +
              '</div>';
            }).join('') +
          '</div>'
        : '<div style="text-align:center;padding:14px;color:var(--text3);font-size:12px;">No cosmetic art submitted yet.</div>';

      var submitCosmeticBtnHtml = (currentUserSession && !isOwner)
        ? '<button class="ct-submit-cosmetic-btn" data-char-id="' + esc(char.id) + '" data-char-name="' + esc(char.name) + '" data-work-id="' + esc(workId) + '"><i class="ti ti-palette"></i> Submit Cosmetic Art</button>'
        : '';

      var hasCosmetics = charCosmetics.length > 0;
      var cosmeticTabBtn = (hasCosmetics || (currentUserSession && !isOwner))
        ? '<button class="ct-flip-trigger ct-flip-cosmetics" title="Character cosmetics" style="color:#f59e0b;border-color:rgba(245,158,11,0.35);"><i class="ti ti-palette"></i>' + (hasCosmetics ? ' ' + charCosmetics.length : '') + '</button>'
        : '';

      // Flip card structure
      card.className += ' ct-flip-card';

      // Build aura picker HTML for back panel
      // Build vote breakdown HTML (shown after voting or for owner)
      function buildAuraBreakdown(counts, total) {
        if (!total) return '<div style="font-size:11px;color:var(--text3);padding:4px 12px 8px;font-style:italic;">No votes cast yet.</div>';
        var sorted = Object.keys(counts).sort(function(a,b){ return counts[b]-counts[a]; });
        var palMap = {};
        AURA_PALETTE.forEach(function(p){ palMap[p.hex] = p.name; });
        return '<div class="ct-aura-breakdown">' +
          '<div class="ct-aura-breakdown-title">Vote Breakdown</div>' +
          sorted.map(function(hex) {
            var pct = Math.round(counts[hex] / total * 100);
            var name = palMap[hex] || hex;
            return '<div class="ct-aura-bar-row">' +
              '<div class="ct-aura-bar-dot" style="background:' + hex + ';"></div>' +
              '<div class="ct-aura-bar-track"><div class="ct-aura-bar-fill" style="width:' + pct + '%;background:' + hex + ';"></div></div>' +
              '<div class="ct-aura-bar-label">' + counts[hex] + '</div>' +
            '</div>';
          }).join('') +
        '</div>';
      }

      var alreadyVoted = !!myAuraHex;
      var auraPickerHtml = '';
      if (currentUserSession && !isOwner) {
        var confirmedSel = alreadyVoted ? ' confirmed' : '';
        auraPickerHtml =
          '<div class="ct-aura-label"><i class="ti ti-droplet"></i> ' + (isBook ? 'Book\'s Aura' : 'Character\'s Aura') + '</div>' +
          '<div style="font-size:10px;color:var(--text3);padding:0 12px 6px;line-height:1.5;">Pick the color that best reflects this character\'s soul — a feeling, not a fact. The most voted color shades their card.</div>' +
          '<div class="ct-aura-swatch-row" data-aura-char="'+esc(char.id)+'">' +
          AURA_PALETTE.map(function(p) {
            var cls = (myAuraHex === p.hex) ? ' confirmed' : '';
            return '<div class="ct-aura-swatch'+cls+'" style="background:'+p.hex+';" title="'+esc(p.name)+'" data-hex="'+esc(p.hex)+'" data-name="'+esc(p.name)+'"></div>';
          }).join('') +
          '</div>' +
          '<div class="ct-aura-name-hint" data-aura-name-hint>' + (myAuraHex ? (AURA_PALETTE.find(function(p){return p.hex===myAuraHex;})||{name:myAuraHex}).name : '') + '</div>' +
          '<div class="ct-aura-accept-row">' +
            '<button class="ct-aura-accept-btn' + (alreadyVoted ? '' : '') + '" data-aura-accept style="' + (alreadyVoted ? 'display:none;' : 'display:none;') + '">' +
              '<i class="ti ti-check"></i> Accept' +
            '</button>' +
            (alreadyVoted
              ? '<span style="font-size:11px;color:var(--text3);font-style:italic;">Your vote: <strong style="color:var(--text);">' + (AURA_PALETTE.find(function(p){return p.hex===myAuraHex;})||{name:myAuraHex}).name + '</strong></span>'
              : '') +
          '</div>' +
          (alreadyVoted ? buildAuraBreakdown(auraData.counts || {}, auraData.total) : '<div data-aura-breakdown-placeholder></div>');
      } else if (isOwner) {
        auraPickerHtml =
          '<div class="ct-aura-label"><i class="ti ti-droplet"></i> ' + (isBook ? 'Book\'s Aura' : 'Character\'s Aura') + '</div>' +
          '<div style="font-size:10px;color:var(--text3);padding:0 12px 8px;line-height:1.5;">Readers vote on the color that reflects this character\'s soul. The most popular choice tints their card.</div>' +
          (auraData.winner
            ? '<div class="ct-aura-voted"><div class="ct-aura-voted-dot" style="background:'+auraData.winner+';"></div> Leading: ' + (AURA_PALETTE.find(function(p){return p.hex===auraData.winner;})||{name:auraData.winner}).name + ' · ' + auraData.total + ' vote' + (auraData.total!==1?'s':'') + '</div>'
            : '<div style="font-size:11px;color:var(--text3);padding:0 12px 8px;font-style:italic;">No votes yet</div>') +
          buildAuraBreakdown(auraData.counts || {}, auraData.total);
      }

      card.innerHTML =
        auraWashHtml +
        belovedHtml +
        '<div class="ct-flip-inner">' +
          // FRONT
          '<div class="ct-flip-front">' +
            '<div class="ct-story-char-top">' +
              imgHtml +
              '<div class="ct-story-char-name">' + esc(char.name) + (isBook ? ' <span class="ct-book-badge" style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:var(--accent);background:rgba(45,212,191,0.12);border:1px solid rgba(45,212,191,0.3);border-radius:5px;padding:2px 6px;vertical-align:middle;margin-left:6px;"><i class=\'ti ti-book-2\'></i> Book Card</span>' : '') + '</div>' +
              endedBadge + editBtn +
            '</div>' +
            (isBook ? '' : '<div class="ct-story-titles-wrap">' + titlesHtml + '</div>') +
            (isBook ? '' : fanRowHtml) +
            (isBook ? '' : impressionHtml) +
            (isBook ? '' : dynChipHtml) +
            featuredOpinionHtml +
            quoteStripHtml +
            featuredHtml +
            collabsHtml +
            fanArtHtml +
            (charSongs.length ? '<button class="ct-flip-trigger ct-flip-songs" title="View songs" style="' + (aura ? 'border-color:'+aura+'55;color:'+aura+';' : '') + '"><i class="ti ti-music"></i> ' + charSongs.length + ' song' + (charSongs.length > 1 ? 's' : '') + '</button>' : '') +
            (approvedOpinions.length ? '<button class="ct-flip-trigger ct-flip-opinions" title="View reader opinions" style="color:#ec4899;border-color:rgba(236,72,153,0.35);"><i class="ti ti-message-heart"></i> ' + approvedOpinions.length + ' opinion' + (approvedOpinions.length > 1 ? 's' : '') + '</button>' : '') +
            // Book Card only: opinions are chapter-scoped everywhere else, so the
            // book card needs its own "share a take" entry (chapter-agnostic).
            ((isBook && currentUserSession && !isOwner) ? '<button class="ct-flip-trigger ct-book-take-btn" title="Share your take on this book" style="color:#ec4899;border-color:rgba(236,72,153,0.35);"><i class="ti ti-message-plus"></i> Share a Take</button>' : '') +
            ((currentUserSession && !isOwner) ? '<button class="ct-flip-trigger ct-flip-aura" title="Vote on aura" style="' + (aura ? 'border-color:'+aura+'55;color:'+aura+';' : '') + '"><i class="ti ti-droplet"></i> Aura</button>' : '') +
            (isOwner ? '<button class="ct-flip-trigger ct-flip-aura" title="View aura" style="' + (aura ? 'border-color:'+aura+'55;color:'+aura+';' : '') + '"><i class="ti ti-droplet"></i> Aura</button>' : '') +
            cosmeticTabBtn +
            (isBook ? '' : '<button class="ct-flip-trigger" data-open="dynamics" style="color:#38bdf8;border-color:rgba(56,189,248,0.35);"><i class="ti ti-arrows-left-right"></i>' + (charDyns.length ? ' ' + charDyns.length : ' Dynamics') + '</button>') +
            '<button class="ct-flip-trigger" data-open="quotes" style="color:#a78bfa;border-color:rgba(167,139,250,0.35);"><i class="ti ti-quote"></i>' + (charQuotes.length ? ' ' + charQuotes.length : ' Quotes') + ((isOwner && charPendQuotes) ? ' <span class="ct-pend-dot">' + charPendQuotes + '</span>' : '') + '</button>' +
            (isBook ? '' : '<button class="ct-flip-trigger" data-open="traits" style="color:#34d399;border-color:rgba(52,211,153,0.35);"><i class="ti ti-adjustments-horizontal"></i> Traits</button>') +
            '<button class="ct-flip-trigger" data-open="vibe" style="' + (moodHex ? 'color:'+moodHex+';border-color:'+moodHex+'55;' : '') + '"><i class="ti ti-mood-neutral"></i> Vibe</button>' +
            '<button class="ct-flip-trigger" data-open="ask" style="color:#fbbf24;border-color:rgba(251,191,36,0.35);"><i class="ti ti-help-circle"></i>' + (charAnsweredQs.length ? ' ' + charAnsweredQs.length : ' Ask') + ((isOwner && charPendQ) ? ' <span class="ct-pend-dot">' + charPendQ + '</span>' : '') + '</button>' +
          '</div>' +
          // BACK — Opinions
          '<div class="ct-flip-back" data-back="opinions" style="display:none;">' +
            '<div class="ct-flip-back-header">' +
              '<div class="ct-flip-back-name"><i class="ti ti-message-heart" style="color:#ec4899;"></i> ' + (isBook ? 'Reader Takes on this Book' : esc(char.name) + '\u2019s Reader Takes') + '</div>' +
              '<button class="ct-flip-close" title="Back"><i class="ti ti-arrow-left"></i></button>' +
            '</div>' +
            '<div class="ct-opinions-back-scroll">' +
              (approvedOpinions.length ? approvedOpinions.map(function(o) {
                var featuredBtnHtml = isOwner
                  ? '<button class="ct-opinion-feature-inline' + (o.is_featured ? ' active' : '') + '" data-opinion-id="' + esc(o.id) + '" data-char-id="' + esc(char.id) + '" title="' + (o.is_featured ? 'Unfeature' : 'Feature on card') + '">' +
                      (o.is_featured ? '<span style="font-size:13px;line-height:1;">★</span>' : '<i class="ti ti-star"></i>') +
                    '</button>'
                  : '';
                return '<div class="ct-opinion-back-row' + (o.is_featured ? ' featured' : '') + '">' +
                  '<div class="ct-opinion-back-body">' + esc('\u201c' + o.body + '\u201d') + '</div>' +
                  '<div class="ct-opinion-back-meta">\u2014 ' + esc(o._authorName || '') + featuredBtnHtml + '</div>' +
                '</div>';
              }).join('') : '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">No approved opinions yet.</div>') +
            '</div>' +
          '</div>' +
          // BACK — Songs
          '<div class="ct-flip-back" data-back="songs">' +
            '<div class="ct-flip-back-header">' +
              '<div class="ct-flip-back-name"><i class="ti ti-music"></i> ' + esc(char.name) + '\u2019s Songs</div>' +
              '<button class="ct-flip-close" title="Back"><i class="ti ti-arrow-left"></i></button>' +
            '</div>' +
            '<div class="ct-songs-list">' + backSongsHtml + '</div>' +
            suggestBtnHtml +
          '</div>' +
          // BACK — Aura
          '<div class="ct-flip-back" data-back="aura" style="display:none;">' +
            '<div class="ct-flip-back-header">' +
              '<div class="ct-flip-back-name"><i class="ti ti-droplet"></i> ' + esc(char.name) + '\u2019s Aura</div>' +
              '<button class="ct-flip-close" title="Back"><i class="ti ti-arrow-left"></i></button>' +
            '</div>' +
            '<div class="ct-aura-back-scroll">' +
              auraPickerHtml +
            '</div>' +
          '</div>' +
          // BACK — Cosmetics
          '<div class="ct-flip-back" data-back="cosmetics" style="display:none;">' +
            '<div class="ct-flip-back-header">' +
              '<div class="ct-flip-back-name"><i class="ti ti-palette" style="color:#f59e0b;"></i> ' + esc(char.name) + '\u2019s Cosmetics</div>' +
              '<button class="ct-flip-close" title="Back"><i class="ti ti-arrow-left"></i></button>' +
            '</div>' +
            '<div class="ct-cosmetic-back-scroll">' +
              (charCosmetics.length ? '' : '<div style="font-size:11.5px;color:var(--text3);padding:10px 14px 4px;line-height:1.5;">Artists can submit avatar cosmetics for this character. Once approved by the author, readers can purchase them here.</div>') +
              cosmeticGalleryHtml +
              submitCosmeticBtnHtml +
            '</div>' +
          '</div>' +
          // BACK — Dynamics
          '<div class="ct-flip-back" data-back="dynamics" style="display:none;">' +
            '<div class="ct-flip-back-header">' +
              '<div class="ct-flip-back-name"><i class="ti ti-arrows-left-right" style="color:#38bdf8;"></i> ' + esc(char.name) + '\u2019s Dynamics</div>' +
              '<button class="ct-flip-close" title="Back"><i class="ti ti-arrow-left"></i></button>' +
            '</div>' +
            '<div class="ct-exp-scroll">' +
              (charDyns.length ? charDyns.map(function(d){
                var other = EXP.charNames[d.character_a === char.id ? d.character_b : d.character_a] || '?';
                var n = EXP.dynVotes[d.id] || 0;
                var mine = !!EXP.myDynVotes[d.id];
                var voteBtn = (currentUserSession && !isOwner)
                  ? '<button class="ct-dyn-vote-btn' + (mine ? ' active' : '') + '" data-dyn-id="' + esc(d.id) + '" title="' + (mine ? 'Remove vote' : 'Vote for this dynamic') + '"><i class="ti ti-heart' + (mine ? '-filled' : '') + '"></i> ' + n + '</button>'
                  : '<span class="ct-dyn-vote-btn" style="cursor:default;"><i class="ti ti-heart"></i> ' + n + '</span>';
                var hideBtn = isOwner ? '<button class="ct-dyn-hide-btn" data-dyn-id="' + esc(d.id) + '" title="Hide this dynamic"><i class="ti ti-eye-off"></i></button>' : '';
                return '<div class="ct-dyn-row"><div class="ct-dyn-row-label"><strong>' + esc(d.label) + '</strong> with ' + esc(other) + '</div>' + voteBtn + hideBtn + '</div>';
              }).join('') : '<div class="ct-exp-empty">No dynamics yet \u2014 propose one below!</div>') +
              ((currentUserSession && !isOwner && chars.length > 1) ?
                '<div class="ct-exp-form"><div class="ct-exp-form-title">Propose a dynamic</div>' +
                '<select class="ct-exp-select" data-dyn-other><option value="">With whom?</option>' +
                  chars.filter(function(c2){ return c2.id !== char.id; }).map(function(c2){ return '<option value="' + esc(c2.id) + '">' + esc(c2.name) + '</option>'; }).join('') +
                '</select>' +
                '<select class="ct-exp-select" data-dyn-label><option value="">Which dynamic?</option>' +
                  CT_DYN_LABELS.map(function(l){ return '<option value="' + esc(l) + '">' + esc(l) + '</option>'; }).join('') +
                '</select>' +
                '<button class="ct-exp-submit" data-dyn-propose><i class="ti ti-plus"></i> Propose</button></div>'
              : '') +
            '</div>' +
          '</div>' +
          // BACK — Quotes
          '<div class="ct-flip-back" data-back="quotes" style="display:none;">' +
            '<div class="ct-flip-back-header">' +
              '<div class="ct-flip-back-name"><i class="ti ti-quote" style="color:#a78bfa;"></i> ' + esc(char.name) + '\u2019s Quote Wall</div>' +
              '<button class="ct-flip-close" title="Back"><i class="ti ti-arrow-left"></i></button>' +
            '</div>' +
            '<div class="ct-exp-scroll">' +
              (charQuotes.length ? charQuotes.map(function(q){
                var n = EXP.quoteVotes[q.id] || 0;
                var mine = !!EXP.myQuoteVotes[q.id];
                var voteBtn = (currentUserSession && !isOwner)
                  ? '<button class="ct-quote-vote-btn' + (mine ? ' active' : '') + '" data-quote-id="' + esc(q.id) + '"><i class="ti ti-heart' + (mine ? '-filled' : '') + '"></i> ' + n + '</button>'
                  : '<span class="ct-quote-vote-btn" style="cursor:default;"><i class="ti ti-heart"></i> ' + n + '</span>';
                var featBtn = isOwner ? '<button class="ct-quote-feat-btn' + (q.is_featured ? ' active' : '') + '" data-quote-id="' + esc(q.id) + '" title="' + (q.is_featured ? 'Unfeature' : 'Feature on card') + '">' + (q.is_featured ? '<span style="font-size:13px;line-height:1;">\u2605</span>' : '<i class="ti ti-star"></i>') + '</button>' : '';
                return '<div class="ct-quote-row' + (q.is_featured ? ' featured' : '') + '"><div class="ct-quote-row-text">' + esc('\u201c' + q.quote_text + '\u201d') + '</div><div class="ct-quote-row-actions">' + voteBtn + featBtn + '</div></div>';
              }).join('') : '<div class="ct-exp-empty">No approved quotes yet.</div>') +
              (isOwner ? '<div data-pending-quotes-slot="' + esc(char.id) + '"></div>' : '') +
              ((currentUserSession && !isOwner) ?
                '<div class="ct-exp-form"><div class="ct-exp-form-title">Nominate a quote</div>' +
                '<textarea class="ct-exp-textarea" data-quote-text maxlength="400" rows="2" placeholder="Their most memorable line\u2026"></textarea>' +
                '<button class="ct-exp-submit" data-quote-nominate><i class="ti ti-send"></i> Send to author</button></div>'
              : '') +
            '</div>' +
          '</div>' +
          // BACK — Traits
          '<div class="ct-flip-back" data-back="traits" style="display:none;">' +
            '<div class="ct-flip-back-header">' +
              '<div class="ct-flip-back-name"><i class="ti ti-adjustments-horizontal" style="color:#34d399;"></i> ' + esc(char.name) + '\u2019s Traits</div>' +
              '<button class="ct-flip-close" title="Back"><i class="ti ti-arrow-left"></i></button>' +
            '</div>' +
            '<div class="ct-exp-scroll">' +
              '<div style="font-size:10px;color:var(--text3);padding:0 12px 8px;line-height:1.5;">Where do readers place ' + esc(char.name) + '? ' + (currentUserSession && !isOwner ? 'Tap a segment to cast or change your vote.' : 'Community averages shown.') + (traitsVoteCount ? ' \u00b7 ' + traitsVoteCount + ' votes' : '') + '</div>' +
              CT_TRAIT_AXES.map(function(ax){
                var a = charTraits[ax.key] || { sum:0, count:0, my:null };
                var avg = a.count ? a.sum / a.count : 0;
                var pct = ((avg + 2) / 4) * 100;
                var segs = [-2,-1,0,1,2].map(function(v){
                  var sel = (a.my === v) ? ' selected' : '';
                  return '<button class="ct-trait-seg' + sel + '" data-trait-axis="' + esc(ax.key) + '" data-trait-val="' + v + '"' + ((currentUserSession && !isOwner) ? '' : ' disabled') + '></button>';
                }).join('');
                return '<div class="ct-trait-row"><div class="ct-trait-labels"><span>' + esc(ax.left) + '</span><span>' + esc(ax.right) + '</span></div>' +
                  '<div class="ct-trait-track">' + segs + (a.count ? '<div class="ct-trait-avg" style="left:' + pct.toFixed(1) + '%;" title="Community average"></div>' : '') + '</div></div>';
              }).join('') +
            '</div>' +
          '</div>' +
          // BACK — Vibe (mood of the month + first impression vs now)
          '<div class="ct-flip-back" data-back="vibe" style="display:none;">' +
            '<div class="ct-flip-back-header">' +
              '<div class="ct-flip-back-name"><i class="ti ti-mood-neutral"' + (moodHex ? ' style="color:'+moodHex+';"' : '') + '></i> ' + esc(char.name) + '\u2019s Vibe</div>' +
              '<button class="ct-flip-close" title="Back"><i class="ti ti-arrow-left"></i></button>' +
            '</div>' +
            '<div class="ct-exp-scroll">' +
              '<div class="ct-exp-form-title" style="padding:0 12px;">Mood of the Month</div>' +
              '<div style="font-size:10px;color:var(--text3);padding:0 12px 6px;line-height:1.5;">One vote per month \u2014 the winning mood tints the card\u2019s outline. Resets on the 1st.</div>' +
              '<div class="ct-mood-grid">' +
                CT_MOODS.map(function(m){
                  var cnt = moodData.counts[m.name] || 0;
                  var mine = moodData.my === m.name;
                  var canVote = currentUserSession && !isOwner;
                  return '<button class="ct-mood-chip' + (mine ? ' mine' : '') + '" data-mood="' + esc(m.name) + '" style="--mood:' + m.hex + ';"' + (canVote ? '' : ' disabled') + '>' + esc(m.name) + (cnt ? ' <span class="ct-mood-count">' + cnt + '</span>' : '') + '</button>';
                }).join('') +
              '</div>' +
              (moodData.my ? '<div class="ct-exp-hint">Your vote this month: <strong>' + esc(moodData.my) + '</strong></div>' : '') +
              ((char.impressions_enabled !== false || isOwner) ?
                '<div class="ct-exp-form-title" style="padding:10px 12px 0;">First Impression \u2192 Now</div>' +
                (isOwner
                  ? '<label class="ct-exp-hint" style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" data-impr-toggle' + (char.impressions_enabled !== false ? ' checked' : '') + '/> Show this strip on the card</label>' +
                    '<div class="ct-exp-hint">Readers: first impression locks once cast; \u201cnow\u201d can change anytime.</div>'
                  : '<div style="font-size:10px;color:var(--text3);padding:0 12px 6px;line-height:1.5;">How did they strike you at first \u2014 and now? First locks once cast; now can change.</div>') +
                ((currentUserSession && !isOwner && char.impressions_enabled !== false) ?
                  ['first','now'].map(function(ph){
                    var my = ph === 'first' ? imprData.myFirst : imprData.myNow;
                    var locked = ph === 'first' && !!imprData.myFirst;
                    return '<div class="ct-impr-row"><div class="ct-impr-row-label">' + (ph === 'first' ? 'First' : 'Now') + '</div>' +
                      CT_SENTIMENTS.map(function(s){
                        var sel = my === s ? ' selected' : '';
                        return '<button class="ct-impr-btn' + sel + '" data-impr-phase="' + ph + '" data-impr-sent="' + esc(s) + '" style="--sent:' + CT_SENT_COLOR[s] + ';"' + (locked && my !== s ? ' disabled' : '') + '>' + esc(s) + '</button>';
                      }).join('') + '</div>';
                  }).join('') : '')
              : '') +
            '</div>' +
          '</div>' +
          // BACK — Ask the Character
          '<div class="ct-flip-back" data-back="ask" style="display:none;">' +
            '<div class="ct-flip-back-header">' +
              '<div class="ct-flip-back-name"><i class="ti ti-help-circle" style="color:#fbbf24;"></i> ' + (isBook ? 'Ask about this book' : 'Ask ' + esc(char.name)) + '</div>' +
              '<button class="ct-flip-close" title="Back"><i class="ti ti-arrow-left"></i></button>' +
            '</div>' +
            '<div class="ct-exp-scroll">' +
              (charAnsweredQs.length ? charAnsweredQs.map(function(q){
                var pinBtn = isOwner ? '<button class="ct-q-pin-btn' + (q.is_pinned ? ' active' : '') + '" data-q-id="' + esc(q.id) + '" title="' + (q.is_pinned ? 'Unpin' : 'Pin to top') + '"><i class="ti ti-pin' + (q.is_pinned ? '-filled' : '') + '"></i></button>' : (q.is_pinned ? '<i class="ti ti-pin-filled" style="color:#fbbf24;font-size:11px;"></i>' : '');
                return '<div class="ct-q-row' + (q.is_pinned ? ' pinned' : '') + '"><div class="ct-q-question"><i class="ti ti-help-circle" style="font-size:11px;"></i> ' + esc(q.question) + ' ' + pinBtn + '</div><div class="ct-q-answer" data-q-answer-html="' + esc(q.id) + '"></div></div>';
              }).join('') : '<div class="ct-exp-empty">No answered questions yet' + (currentUserSession && !isOwner ? ' \u2014 ask the first!' : '.') + '</div>') +
              (isOwner ? '<div data-pending-qs-slot="' + esc(char.id) + '"></div>' : '') +
              ((currentUserSession && !isOwner) ?
                '<div class="ct-exp-form"><div class="ct-exp-form-title">' + (isBook ? 'Ask the author about this book' : 'Ask ' + esc(char.name) + ' a question') + '</div>' +
                '<textarea class="ct-exp-textarea" data-ask-text maxlength="500" rows="2" placeholder="' + (isBook ? 'The author answers about the story\u2026' : 'The author answers in-character\u2026') + '"></textarea>' +
                '<button class="ct-exp-submit" data-ask-submit><i class="ti ti-send"></i> Ask</button></div>'
              : '') +
            '</div>' +
          '</div>' +
        '</div>';

      // Wire flip triggers — songs, opinions, and aura each open their own back
      var flipTriggers = card.querySelectorAll('.ct-flip-trigger');
      var flipCloses = card.querySelectorAll('.ct-flip-close');
      var songBack = card.querySelector('.ct-flip-back[data-back="songs"]');
      var auraBack = card.querySelector('.ct-flip-back[data-back="aura"]');
      var opinionsBack = card.querySelector('.ct-flip-back[data-back="opinions"]');
      var cosmeticsBack = card.querySelector('.ct-flip-back[data-back="cosmetics"]');

      function showBack(which) {
        card.querySelectorAll('.ct-flip-back').forEach(function(b) {
          b.style.display = (b.getAttribute('data-back') === which) ? 'flex' : 'none';
        });
        card.classList.add('flipped');
      }
      function hideBack() {
        card.classList.remove('flipped');
      }

      flipTriggers.forEach(function(t) {
        t.addEventListener('click', function(e) {
          e.stopPropagation();
          if (t.classList.contains('ct-flip-aura')) {
            showBack('aura');
          } else if (t.classList.contains('ct-flip-opinions')) {
            showBack('opinions');
          } else if (t.classList.contains('ct-flip-cosmetics')) {
            showBack('cosmetics');
          } else if (t.getAttribute('data-open')) {
            showBack(t.getAttribute('data-open'));
          } else {
            showBack('songs');
          }
        });
      });

      // ── EXPANSION WIRING ───────────────────────────────────────
      wireCardExpansion(card, char, workId, isOwner, currentUserSession, container, EXP, { answeredQs: charAnsweredQs });
      flipCloses.forEach(function(fcBtn) {
        fcBtn.addEventListener('click', function(e) { e.stopPropagation(); hideBack(); });
      });

      // Wire fan vote button
      var fanVoteBtn = card.querySelector('.ct-fan-vote-btn');
      if (fanVoteBtn) {
        fanVoteBtn.addEventListener('click', async function(e) {
          e.stopPropagation();
          if (fanVoteBtn.disabled) return;
          fanVoteBtn.disabled = true;
          fanVoteBtn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite;"></i>';
          try {
            var { data: fvData, error: fvErr } = await db().rpc('vote_character_fan', { p_character_id: char.id });
            var countsEl = card.querySelector('[data-fan-counts="' + char.id + '"]');
            if (fvData && (fvData.total_votes !== undefined) && countsEl) {
              countsEl.innerHTML = '<i class="ti ti-heart" style="color:#ec4899;font-size:10px;"></i> ' +
                '<strong style="color:var(--text2);">' + fvData.total_votes + '</strong> all-time \u00b7 ' +
                '<strong style="color:var(--text2);">' + fvData.month_votes + '</strong> this month';
            }
            if (fvErr || !fvData || !fvData.success) {
              var fvMsg = (fvData && fvData.error) || (fvErr && fvErr.message) || '';
              if (fvMsg === 'already_voted_today') {
                fanVoteBtn.innerHTML = '<i class="ti ti-heart"></i> Voted today';
                fanVoteBtn.style.background = 'rgba(236,72,153,0.18)';
                fanVoteBtn.style.cursor = 'default';
              } else {
                fanVoteBtn.disabled = false;
                fanVoteBtn.innerHTML = '<i class="ti ti-heart"></i> Fan Vote';
              }
              return;
            }
            fanVoteBtn.innerHTML = '<i class="ti ti-heart"></i> Voted today';
            fanVoteBtn.style.background = 'rgba(236,72,153,0.18)';
            fanVoteBtn.style.cursor = 'default';
          } catch(err) {
            fanVoteBtn.disabled = false;
            fanVoteBtn.innerHTML = '<i class="ti ti-heart"></i> Fan Vote';
          }
        });
      }

      // Wire inline feature buttons (author only) in the opinions panel
      if (isOwner && opinionsBack) {
        opinionsBack.querySelectorAll('.ct-opinion-feature-inline').forEach(function(btn) {
          btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            var oid = btn.dataset.opinionId;
            var cid2 = btn.dataset.charId;
            var isCurrentlyFeatured = btn.classList.contains('active');
            // Unfeature all opinions for this character first
            await db().from('character_opinions')
              .update({ is_featured: false })
              .eq('character_id', cid2)
              .eq('is_featured', true);
            // If it wasn't already featured, feature it now
            if (!isCurrentlyFeatured) {
              await db().from('character_opinions')
                .update({ is_featured: true })
                .eq('id', oid);
            }
            // Refresh the whole card section
            renderStoryCharacterCards(container, workId, true);
          });
        });
      }

      // Wire aura swatches — two-step: click to stage, Accept btn to confirm
      var auraRow = card.querySelector('.ct-aura-swatch-row');
      var acceptBtn = card.querySelector('[data-aura-accept]');
      var nameHint = card.querySelector('[data-aura-name-hint]');
      var breakdownPlaceholder = card.querySelector('[data-aura-breakdown-placeholder]');
      var stagedHex = null;

      if (auraRow && currentUserSession && !isOwner) {
        auraRow.querySelectorAll('.ct-aura-swatch').forEach(function(sw) {
          sw.addEventListener('click', function() {
            // If already confirmed (voted), re-staging is allowed to change vote
            var hex = sw.dataset.hex;
            var name = sw.dataset.name || hex;
            stagedHex = hex;
            // Update swatch visuals
            auraRow.querySelectorAll('.ct-aura-swatch').forEach(function(s){
              s.classList.remove('staged', 'confirmed');
            });
            sw.classList.add('staged');
            // Show color name hint
            if (nameHint) nameHint.textContent = name;
            // Show Accept button (dynamically colored)
            if (acceptBtn) {
              acceptBtn.style.display = 'block';
              acceptBtn.style.background = hex;
              acceptBtn.style.color = isLightColor(hex) ? '#111' : '#fff';
              acceptBtn.textContent = '';
              var icon = document.createElement('i');
              icon.className = 'ti ti-check';
              acceptBtn.appendChild(icon);
              acceptBtn.appendChild(document.createTextNode(' Accept ' + name));
            }
          });
        });

        if (acceptBtn) {
          acceptBtn.addEventListener('click', async function() {
            if (!stagedHex) return;
            acceptBtn.disabled = true;
            var ok = await submitAuraVote(char.id, stagedHex, currentUserSession.user.id);
            if (!ok) { acceptBtn.disabled = false; return; }

            // ── NEW READER MISSION: suggest aura for character ────
            if (window.dsCompleteMission) {
              try { await window.dsCompleteMission('suggest_character_aura'); } catch(e) {}
            }

            // Mark swatch confirmed
            auraRow.querySelectorAll('.ct-aura-swatch').forEach(function(s){
              s.classList.remove('staged', 'confirmed');
              if (s.dataset.hex === stagedHex) s.classList.add('confirmed');
            });
            acceptBtn.style.display = 'none';

            // Update name hint to confirmed state
            var name = (AURA_PALETTE.find(function(p){return p.hex===stagedHex;})||{name:stagedHex}).name;
            if (nameHint) nameHint.textContent = '';

            // Update vote label
            var acceptRow = card.querySelector('.ct-aura-accept-row');
            if (acceptRow) {
              var voteLabel = acceptRow.querySelector('span');
              if (!voteLabel) { voteLabel = document.createElement('span'); voteLabel.style.cssText = 'font-size:11px;color:var(--text3);font-style:italic;'; acceptRow.appendChild(voteLabel); }
              voteLabel.innerHTML = 'Your vote: <strong style="color:var(--text);">' + name + '</strong>';
            }

            // Refresh breakdown — reload votes fresh
            var fresh = await loadAuraVotes([char.id]);
            var freshData = fresh[char.id] || { counts: {}, total: 0 };
            if (breakdownPlaceholder) {
              var bkDiv = document.createElement('div');
              bkDiv.innerHTML = buildAuraBreakdown(freshData.counts, freshData.total);
              breakdownPlaceholder.replaceWith(bkDiv.firstElementChild || bkDiv);
            }

            // Update wash color on the card front
            var wash = card.querySelector('.ct-aura-wash');
            if (wash && freshData.winner) {
              wash.style.background = 'radial-gradient(ellipse at top, ' + freshData.winner + '22 0%, transparent 70%)';
              wash.classList.add('active');
            }

            // Live-tint title pills, song strip, and trigger buttons with new winner
            if (freshData.winner) {
              var w = freshData.winner;
              card.querySelectorAll('.ct-story-top-title').forEach(function(el) {
                el.style.borderColor = w;
                el.style.background = w + '18';
              });
              var songStrip = card.querySelector('.ct-featured-song');
              if (songStrip) {
                songStrip.style.background = w + '12';
                songStrip.style.borderColor = w + '40';
                var credit = songStrip.querySelector('.ct-featured-song-credit');
                if (credit) credit.style.color = w;
              }
              card.querySelectorAll('.ct-flip-trigger').forEach(function(btn) {
                btn.style.borderColor = w + '55';
                btn.style.color = w;
              });
            }

            if (window.showToast) window.showToast('Aura locked in! ✨', 'ti-droplet');
            stagedHex = null;
          });
        }
      }

      // Helper: is a hex color light enough to need dark text?
      function isLightColor(hex) {
        hex = hex.replace('#','');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        var r = parseInt(hex.slice(0,2),16);
        var g = parseInt(hex.slice(2,4),16);
        var b = parseInt(hex.slice(4,6),16);
        return (r*299 + g*587 + b*114) / 1000 > 140;
      }

      // Wire edit button
      if (isOwner) {
        var btn = card.querySelector('.ct-edit-btn');
        if (btn) {
          btn.addEventListener('click', function() {
            activeUploadCharId = char.id;
            document.getElementById('ct-portrait-input').click();
          });
        }
        // Wire feature buttons
        card.querySelectorAll('.ct-song-feature-btn').forEach(function(b) {
          b.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            var sid = b.dataset.songId, cid = b.dataset.charId;
            featureSong(sid, cid).then(function(ok) {
              if (ok) renderStoryCharacterCards(container, workId, isOwner);
            });
          });
        });
        // Wire delete buttons
        card.querySelectorAll('.ct-song-delete-btn').forEach(function(b) {
          b.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            deleteSong(b.dataset.songId).then(function(ok) {
              if (ok) renderStoryCharacterCards(container, workId, isOwner);
            });
          });
        });
      }

      // Wire suggest song button
      var ssBtn = card.querySelector('.ct-suggest-song-btn');
      if (ssBtn) {
        ssBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          openSongModal(ssBtn.dataset.charId, ssBtn.dataset.charName, workId, currentUserSession.user.id);
        });
      }

      // Wire Book Card "Share a Take" (opinion with no chapter)
      var btBtn = card.querySelector('.ct-book-take-btn');
      if (btBtn) {
        btBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          openOpinionModal(char.id, char.name, null, workId, currentUserSession.user.id, true);
        });
      }

      // Wire submit cosmetic art button
      var scBtn = card.querySelector('.ct-submit-cosmetic-btn');
      if (scBtn) {
        scBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          openCosmeticModal(scBtn.dataset.charId, scBtn.dataset.charName, scBtn.dataset.workId, currentUserSession.user.id);
        });
      }

      grid.appendChild(card);
    });

    // Author pending songs panel
    if (isOwner) {
      await renderPendingSongsPanel(container, workId);
      await renderPendingOpinionsPanel(container, workId);
      await renderPendingCosmeticsPanel(container, workId);
    }
  }

  // ── PENDING SONGS PANEL (author only) ─────────────────────────
  // ── CARD EXPANSION: safe answer rendering + interaction wiring ──────────

  // Render stored answer HTML keeping only text and http(s) images (GIFs)
  function ctSafeAnswerHTML(raw) {
    if (!raw) return '';
    try {
      var doc = new DOMParser().parseFromString(raw, 'text/html');
      var out = document.createElement('div');
      function walk(node, dest) {
        node.childNodes.forEach(function(n) {
          if (n.nodeType === 3) { dest.appendChild(document.createTextNode(n.textContent)); }
          else if (n.nodeType === 1) {
            var tag = n.tagName.toLowerCase();
            if (tag === 'img') {
              var src = n.getAttribute('src') || '';
              if (/^https?:\/\//i.test(src)) {
                var img = document.createElement('img');
                img.src = src; img.alt = ''; img.className = 'ct-q-gif'; img.loading = 'lazy';
                dest.appendChild(img);
              }
            } else if (tag === 'br') { dest.appendChild(document.createElement('br')); }
            else { walk(n, dest); }
          }
        });
      }
      walk(doc.body, out);
      return out.innerHTML;
    } catch(e) { return esc(raw); }
  }

  function ctToast(msg, icon) {
    var t = document.getElementById('toast');
    if (t && t.querySelector('span')) {
      t.querySelector('span').textContent = msg;
      var ic = t.querySelector('i'); if (ic) ic.className = 'ti ' + (icon || 'ti-check');
      t.classList.add('show');
      setTimeout(function(){ t.classList.remove('show'); }, 3000);
    }
  }

  function wireCardExpansion(card, char, workId, isOwner, session, container, EXP, extras) {
    var uid = session ? session.user.id : null;
    function rerender() { renderStoryCharacterCards(container, workId, isOwner); }

    // Answered question bodies (safe HTML with GIF support)
    (extras.answeredQs || []).forEach(function(q) {
      var slot = card.querySelector('[data-q-answer-html="' + q.id + '"]');
      if (slot) slot.innerHTML = ctSafeAnswerHTML(q.answer);
    });

    // ── Dynamics ──
    card.querySelectorAll('.ct-dyn-vote-btn[data-dyn-id]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (!uid) { window.location.href = 'auth.html'; return; }
        var id = btn.getAttribute('data-dyn-id');
        btn.disabled = true;
        if (EXP.myDynVotes[id]) {
          await Promise.resolve(db().from('character_dynamic_votes').delete().eq('dynamic_id', id).eq('user_id', uid)).catch(function(){});
        } else {
          await Promise.resolve(db().from('character_dynamic_votes').insert({ dynamic_id: id, user_id: uid })).catch(function(){});
          try { await db().rpc('award_shipper_badge', { p_user_id: uid, p_character_id: char.id }); } catch(e) {}
        }
        rerender();
      });
    });
    card.querySelectorAll('.ct-dyn-hide-btn').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        btn.disabled = true;
        await Promise.resolve(db().from('character_dynamics').update({ status: 'hidden' }).eq('id', btn.getAttribute('data-dyn-id'))).catch(function(){});
        ctToast('Dynamic hidden.', 'ti-eye-off');
        rerender();
      });
    });
    var proposeBtn = card.querySelector('[data-dyn-propose]');
    if (proposeBtn) {
      proposeBtn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var other = card.querySelector('[data-dyn-other]').value;
        var label = card.querySelector('[data-dyn-label]').value;
        if (!other || !label) { ctToast('Pick a character and a dynamic.', 'ti-alert-circle'); return; }
        proposeBtn.disabled = true;
        var res = await Promise.resolve(db().from('character_dynamics').insert({ work_id: workId, character_a: char.id, character_b: other, label: label, created_by: uid }).select().single()).catch(function(err){ return { error: err }; });
        if (res && res.error) {
          proposeBtn.disabled = false;
          ctToast('That dynamic already exists \u2014 vote for it instead!', 'ti-info-circle');
          return;
        }
        if (res && res.data) {
          await Promise.resolve(db().from('character_dynamic_votes').insert({ dynamic_id: res.data.id, user_id: uid })).catch(function(){});
          try { await db().rpc('award_shipper_badge', { p_user_id: uid, p_character_id: char.id }); } catch(e) {}
        }
        ctToast('Dynamic proposed!', 'ti-arrows-left-right');
        rerender();
      });
    }

    // ── Quotes ──
    card.querySelectorAll('.ct-quote-vote-btn[data-quote-id]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (!uid) { window.location.href = 'auth.html'; return; }
        var id = btn.getAttribute('data-quote-id');
        btn.disabled = true;
        if (EXP.myQuoteVotes[id]) {
          await Promise.resolve(db().from('character_quote_votes').delete().eq('quote_id', id).eq('user_id', uid)).catch(function(){});
        } else {
          await Promise.resolve(db().from('character_quote_votes').insert({ quote_id: id, user_id: uid })).catch(function(){});
          try { await db().rpc('award_quote_keeper_badge', { p_user_id: uid, p_character_id: char.id }); } catch(e) {}
        }
        rerender();
      });
    });
    card.querySelectorAll('.ct-quote-feat-btn').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var id = btn.getAttribute('data-quote-id');
        var makeFeatured = !btn.classList.contains('active');
        btn.disabled = true;
        if (makeFeatured) {
          await Promise.resolve(db().from('character_quotes').update({ is_featured: false }).eq('character_id', char.id).eq('is_featured', true)).catch(function(){});
        }
        await Promise.resolve(db().from('character_quotes').update({ is_featured: makeFeatured }).eq('id', id)).catch(function(){});
        rerender();
      });
    });
    var nominateBtn = card.querySelector('[data-quote-nominate]');
    if (nominateBtn) {
      nominateBtn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var ta = card.querySelector('[data-quote-text]');
        var text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        nominateBtn.disabled = true;
        var res = await Promise.resolve(db().from('character_quotes').insert({ character_id: char.id, work_id: workId, user_id: uid, quote_text: text })).catch(function(err){ return { error: err }; });
        if (res && res.error) { nominateBtn.disabled = false; ctToast('Could not send \u2014 try again.', 'ti-x'); return; }
        ta.value = '';
        nominateBtn.disabled = false;
        ctToast('Quote sent to the author for approval!', 'ti-quote');
        ctNotifyWorkAuthor(workId, uid, char.id, 'quote_submitted', function(n, t) {
          return n + ' nominated a quote for ' + char.name + ' in \u201c' + t + '\u201d';
        });
      });
    }
    // Owner: pending quotes panel
    var pendQuoteSlot = card.querySelector('[data-pending-quotes-slot]');
    if (pendQuoteSlot && isOwner) {
      var pendingQuotes = (EXP.quotes[char.id] || []).filter(function(q){ return q.status === 'pending'; });
      if (pendingQuotes.length) {
        pendQuoteSlot.innerHTML = '<div class="ct-exp-form-title" style="padding:8px 12px 4px;">Pending approval (' + pendingQuotes.length + ')</div>' +
          pendingQuotes.map(function(q) {
            return '<div class="ct-quote-row pending" data-pend-quote="' + esc(q.id) + '"><div class="ct-quote-row-text">' + esc('\u201c' + q.quote_text + '\u201d') + '</div>' +
              '<div class="ct-quote-row-actions">' +
                '<button class="ct-exp-approve" data-qa="' + esc(q.id) + '" data-qu="' + esc(q.user_id || '') + '"><i class="ti ti-check"></i></button>' +
                '<button class="ct-exp-reject" data-qr="' + esc(q.id) + '" data-qu="' + esc(q.user_id || '') + '"><i class="ti ti-x"></i></button>' +
              '</div></div>';
          }).join('');
        pendQuoteSlot.querySelectorAll('[data-qa]').forEach(function(b) {
          b.addEventListener('click', async function(e) { e.stopPropagation(); b.disabled = true;
            await Promise.resolve(db().from('character_quotes').update({ status: 'approved' }).eq('id', b.getAttribute('data-qa'))).catch(function(){});
            ctNotifyUser(b.getAttribute('data-qu'), uid, workId, char.id, 'quote_approved', 'Your quote for ' + char.name + ' was approved by the author! \u275d');
            rerender();
          });
        });
        pendQuoteSlot.querySelectorAll('[data-qr]').forEach(function(b) {
          b.addEventListener('click', async function(e) { e.stopPropagation(); b.disabled = true;
            await Promise.resolve(db().from('character_quotes').update({ status: 'rejected' }).eq('id', b.getAttribute('data-qr'))).catch(function(){});
            ctNotifyUser(b.getAttribute('data-qu'), uid, workId, char.id, 'quote_rejected', 'Your quote for ' + char.name + ' wasn\u2019t approved this time.');
            rerender();
          });
        });
      }
    }

    // ── Traits ──
    card.querySelectorAll('.ct-trait-seg:not([disabled])').forEach(function(seg) {
      seg.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (!uid) { window.location.href = 'auth.html'; return; }
        seg.disabled = true;
        await Promise.resolve(db().from('character_trait_votes').upsert(
          { character_id: char.id, user_id: uid, axis: seg.getAttribute('data-trait-axis'), value: parseInt(seg.getAttribute('data-trait-val'), 10), updated_at: new Date().toISOString() },
          { onConflict: 'character_id,user_id,axis' }
        )).catch(function(){});
        try { await db().rpc('award_trait_scout_badge', { p_user_id: uid, p_character_id: char.id }); } catch(e) {}
        rerender();
      });
    });

    // ── Mood (once per month; upsert lets them change within the month) ──
    card.querySelectorAll('.ct-mood-chip:not([disabled])').forEach(function(chip) {
      chip.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (!uid) { window.location.href = 'auth.html'; return; }
        chip.disabled = true;
        var res = await Promise.resolve(db().from('character_mood_votes').upsert(
          { character_id: char.id, user_id: uid, mood: chip.getAttribute('data-mood'), vote_month: new Date().toISOString().slice(0,7) + '-01' },
          { onConflict: 'character_id,user_id,vote_month' }
        )).catch(function(err){ return { error: err }; });
        if (res && res.error) { ctToast('Could not save mood vote.', 'ti-x'); chip.disabled = false; return; }
        ctToast('Mood set for this month!', 'ti-mood-check');
        try { await db().rpc('award_vibe_check_badge', { p_user_id: uid, p_character_id: char.id }); } catch(e) {}
        rerender();
      });
    });

    // ── Impressions ──
    card.querySelectorAll('.ct-impr-btn:not([disabled])').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        if (!uid) { window.location.href = 'auth.html'; return; }
        var phase = btn.getAttribute('data-impr-phase');
        btn.disabled = true;
        await Promise.resolve(db().from('character_impression_votes').upsert(
          { character_id: char.id, user_id: uid, phase: phase, sentiment: btn.getAttribute('data-impr-sent'), updated_at: new Date().toISOString() },
          { onConflict: 'character_id,user_id,phase' }
        )).catch(function(){});
        if (phase === 'first') ctToast('First impression locked in.', 'ti-lock');
        rerender();
      });
    });
    var imprToggle = card.querySelector('[data-impr-toggle]');
    if (imprToggle) {
      imprToggle.addEventListener('change', async function(e) {
        e.stopPropagation();
        await Promise.resolve(db().from('novel_characters').update({ impressions_enabled: imprToggle.checked }).eq('id', char.id)).catch(function(){});
        ctToast(imprToggle.checked ? 'Impression strip shown.' : 'Impression strip hidden.', 'ti-timeline');
        rerender();
      });
    }

    // ── Ask the Character ──
    var askBtn = card.querySelector('[data-ask-submit]');
    if (askBtn) {
      askBtn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var ta = card.querySelector('[data-ask-text]');
        var text = ta.value.trim();
        if (!text) { ta.focus(); return; }
        askBtn.disabled = true;
        var res = await Promise.resolve(db().from('character_questions').insert({ character_id: char.id, work_id: workId, user_id: uid, question: text })).catch(function(err){ return { error: err }; });
        if (res && res.error) { askBtn.disabled = false; ctToast('Could not send \u2014 try again.', 'ti-x'); return; }
        ta.value = '';
        askBtn.disabled = false;
        ctToast('Question sent \u2014 the author will answer in-character!', 'ti-help-circle');
        try { await db().rpc('award_ask_a_character_badge', { p_user_id: uid, p_character_id: char.id }); } catch(e) {}
        ctNotifyWorkAuthor(workId, uid, char.id, 'question_submitted', function(n, t) {
          return n + ' asked ' + char.name + ' a question in \u201c' + t + '\u201d';
        });
      });
    }
    card.querySelectorAll('.ct-q-pin-btn').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        btn.disabled = true;
        await Promise.resolve(db().from('character_questions').update({ is_pinned: !btn.classList.contains('active') }).eq('id', btn.getAttribute('data-q-id'))).catch(function(){});
        rerender();
      });
    });
    // Owner: pending questions with in-character answer composer (GIF toolbar)
    var pendQSlot = card.querySelector('[data-pending-qs-slot]');
    if (pendQSlot && isOwner) {
      Promise.resolve(db().from('character_questions').select('id,user_id,question,created_at').eq('character_id', char.id).eq('status', 'pending').order('created_at', { ascending: true }))
        .catch(function(){ return { data: [] }; })
        .then(function(res) {
          var pend = res.data || [];
          if (!pend.length) return;
          var pendQById = {};
          pend.forEach(function(q) { pendQById[q.id] = q; });
          pendQSlot.innerHTML = '<div class="ct-exp-form-title" style="padding:8px 12px 4px;">Waiting for an answer (' + pend.length + ')</div>' +
            pend.map(function(q) {
              var ctx = 'ctq-' + q.id;
              var taId = 'ct-q-answer-' + q.id;
              var toolbar = (window.CommentToolbar && CommentToolbar.renderToolbar) ? CommentToolbar.renderToolbar({ context: ctx, textareaId: taId }) : '';
              return '<div class="ct-q-row pending" data-pend-q="' + esc(q.id) + '">' +
                '<div class="ct-q-question"><i class="ti ti-help-circle" style="font-size:11px;"></i> ' + esc(q.question) + '</div>' +
                '<textarea class="ct-exp-textarea" id="' + taId + '" rows="2" placeholder="Answer as ' + esc(char.name) + '\u2026"></textarea>' +
                toolbar +
                '<div class="ct-quote-row-actions" style="margin-top:6px;">' +
                  '<button class="ct-exp-submit" data-answer-q="' + esc(q.id) + '" style="flex:1;"><i class="ti ti-send"></i> Answer</button>' +
                  '<button class="ct-exp-reject" data-decline-q="' + esc(q.id) + '" title="Decline"><i class="ti ti-x"></i></button>' +
                '</div></div>';
            }).join('');
          pendQSlot.querySelectorAll('[data-answer-q]').forEach(function(b) {
            b.addEventListener('click', async function(e) {
              e.stopPropagation();
              var qid = b.getAttribute('data-answer-q');
              var ta2 = document.getElementById('ct-q-answer-' + qid);
              var text = (ta2 ? ta2.value : '').trim();
              var gifUrl = (window.CommentToolbar && CommentToolbar.getPendingGif) ? CommentToolbar.getPendingGif('ctq-' + qid) : null;
              if (!text && !gifUrl) { if (ta2) ta2.focus(); return; }
              b.disabled = true;
              var answerHtml = esc(text).replace(/\n/g, '<br>') + (gifUrl ? '<img src="' + esc(gifUrl) + '" alt="" class="ct-q-gif"/>' : '');
              var res2 = await Promise.resolve(db().from('character_questions').update({ status: 'answered', answer: answerHtml, answered_at: new Date().toISOString() }).eq('id', qid)).catch(function(err){ return { error: err }; });
              if (res2 && res2.error) { b.disabled = false; ctToast('Could not save answer.', 'ti-x'); return; }
              if (window.CommentToolbar && CommentToolbar.clearAttachments) CommentToolbar.clearAttachments('ctq-' + qid);
              ctToast('Answered in-character!', 'ti-message-check');
              try { await db().rpc('award_in_character_badge', { p_user_id: uid, p_character_id: char.id }); } catch(e) {}
              ctNotifyUser((pendQById[qid] || {}).user_id, uid, workId, char.id, 'question_answered', char.name + ' answered your question! \ud83d\udcac');
              rerender();
            });
          });
          pendQSlot.querySelectorAll('[data-decline-q]').forEach(function(b) {
            b.addEventListener('click', async function(e) {
              e.stopPropagation(); b.disabled = true;
              var _dqid = b.getAttribute('data-decline-q');
              await Promise.resolve(db().from('character_questions').update({ status: 'declined' }).eq('id', _dqid)).catch(function(){});
              ctNotifyUser((pendQById[_dqid] || {}).user_id, uid, workId, char.id, 'question_declined', 'Your question for ' + char.name + ' was declined by the author.');
              rerender();
            });
          });
        });
    }
  }

  async function renderPendingSongsPanel(container, workId) {
    var pending = await loadPendingSongs(workId);
    var existingPanel = container.querySelector('.ct-pending-songs-panel');
    if (existingPanel) existingPanel.remove();
    if (!pending.length) return;

    var uids = [...new Set(pending.map(function(s){ return s.user_id; }))];
    var names = await loadUsernames(uids);

    // Batch-fetch chapter titles for pending songs
    var pendingChapIds = [...new Set(pending.filter(function(s){ return s.chapter_id; }).map(function(s){ return s.chapter_id; }))];
    var pendingChapMap = {};
    if (pendingChapIds.length) {
      var { data: pChaps } = await db().from('chapters').select('id, title, chapter_number').in('id', pendingChapIds);
      (pChaps||[]).forEach(function(c){ pendingChapMap[c.id] = c; });
    }

    var panel = document.createElement('div');
    panel.className = 'ct-pending-songs-panel';
    panel.innerHTML = '<div class="ct-pending-songs-title"><i class="ti ti-music-check"></i> Song Suggestions Awaiting Approval <span class="ct-pending-badge">' + pending.length + '</span></div>';

    pending.forEach(function(s) {
      var vid = ytId(s.youtube_url);
      var name = names[s.user_id] || 'Unknown';
      var chap = s.chapter_id ? pendingChapMap[s.chapter_id] : null;
      var chapLabel = chap ? ' · <i class="ti ti-book" style="font-size:10px;"></i> Ch. ' + chap.chapter_number : '';
      var row = document.createElement('div');
      row.className = 'ct-pending-song-row';
      row.innerHTML =
        '<img src="https://img.youtube.com/vi/' + esc(vid) + '/default.jpg" class="ct-song-thumb" alt=""/>' +
        '<div class="ct-song-info">' +
          '<div class="ct-song-title"><a href="' + esc(s.youtube_url) + '" target="_blank" rel="noopener">' + esc(s.song_title) + '</a></div>' +
          '<div class="ct-song-meta">' + esc(s.artist_name || '') + (s.artist_name ? ' · ' : '') + 'Suggested by ' + esc(name) + chapLabel + '</div>' +
        '</div>' +
        '<div class="ct-pending-song-actions">' +
          '<button class="ct-song-approve-btn" data-id="' + esc(s.id) + '"><i class="ti ti-check"></i> Approve</button>' +
          '<button class="ct-song-reject-btn" data-id="' + esc(s.id) + '"><i class="ti ti-x"></i> Reject</button>' +
          '<button class="ct-song-delete-pending-btn" data-id="' + esc(s.id) + '" title="Delete suggestion"><i class="ti ti-trash"></i></button>' +
        '</div>';

      row.querySelector('.ct-song-approve-btn').addEventListener('click', async function() {
        await updateSongStatus(s.id, 'approved');
        renderStoryCharacterCards(container, workId, true);
      });
      row.querySelector('.ct-song-reject-btn').addEventListener('click', async function() {
        await updateSongStatus(s.id, 'rejected');
        renderPendingSongsPanel(container, workId);
      });
      row.querySelector('.ct-song-delete-pending-btn').addEventListener('click', async function() {
        await deleteSong(s.id);
        renderPendingSongsPanel(container, workId);
      });

      panel.appendChild(row);
    });

    container.appendChild(panel);
  }

  // ── COSMETIC ART SUBMISSION MODAL ─────────────────────────────
  var _cosmeticModal = null;
  function openCosmeticModal(charId, charName, workId, userId) {
    if (_cosmeticModal) _cosmeticModal.remove();
    var modal = document.createElement('div');
    modal.className = 'ct-song-modal-overlay';
    modal.innerHTML =
      '<div class="ct-song-modal">' +
        '<div class="ct-song-modal-header">' +
          '<div class="ct-song-modal-title"><i class="ti ti-palette" style="color:#f59e0b;"></i> Submit Cosmetic Art for ' + esc(charName) + '</div>' +
          '<button class="ct-song-modal-close"><i class="ti ti-x"></i></button>' +
        '</div>' +
        '<div class="ct-song-modal-body">' +
          '<p style="font-size:12.5px;color:var(--text3);margin-bottom:14px;line-height:1.5;">Submit original avatar cosmetic art for this character. The author will review it. If approved, readers can purchase it and apply it to their avatar.</p>' +
          '<div class="ct-song-modal-field">' +
            '<label>Cosmetic Name <span style="color:var(--accent);">*</span></label>' +
            '<input type="text" id="cc-name" placeholder="e.g. Aelthas Summer Robes" maxlength="60"/>' +
          '</div>' +
          '<div class="ct-song-modal-field">' +
            '<label>Description</label>' +
            '<input type="text" id="cc-desc" placeholder="Short description (optional)" maxlength="120"/>' +
          '</div>' +
          '<div class="ct-song-modal-field">' +
            '<label>Image URL <span style="color:var(--accent);">*</span></label>' +
            '<input type="url" id="cc-image" placeholder="https://... (upload to Imgur or Supabase first)"/>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:4px;">Must be a direct image link. Recommended: transparent PNG, 400×400px or square.</div>' +
          '</div>' +
          '<div class="ct-song-modal-field">' +
            '<label>Quill Price <span style="color:var(--accent);">*</span></label>' +
            '<input type="number" id="cc-price" placeholder="e.g. 50" min="10" max="500" value="50" style="max-width:120px;"/>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:4px;">You receive 60%, the author 30%, platform 10%.</div>' +
          '</div>' +
        '</div>' +
        '<div class="ct-song-modal-footer">' +
          '<button class="ct-song-cancel-btn">Cancel</button>' +
          '<button class="ct-modal-submit" id="cc-submit-btn"><i class="ti ti-send"></i> Submit for Review</button>' +
        '</div>' +
      '</div>';

    modal.querySelector('.ct-song-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.querySelector('.ct-song-cancel-btn').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    modal.querySelector('#cc-submit-btn').addEventListener('click', async function() {
      var name = modal.querySelector('#cc-name').value.trim();
      var desc = modal.querySelector('#cc-desc').value.trim();
      var image = modal.querySelector('#cc-image').value.trim();
      var price = parseInt(modal.querySelector('#cc-price').value) || 50;

      if (!name) { alert('Please enter a cosmetic name.'); return; }
      if (!image) { alert('Please provide an image URL.'); return; }
      if (price < 10 || price > 500) { alert('Price must be between 10 and 500 Quills.'); return; }

      var btn = modal.querySelector('#cc-submit-btn');
      btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i> Submitting…';

      // Fetch novelist (work author_id)
      var { data: work } = await db().from('works').select('author_id').eq('id', workId).maybeSingle();
      if (!work) { alert('Could not find novel author. Please try again.'); btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> Submit for Review'; return; }

      var { error } = await db().from('character_cosmetic_collabs').insert({
        character_id: charId,
        work_id: workId,
        artist_id: userId,
        novelist_id: work.author_id,
        image_url: image,
        name: name,
        description: desc || null,
        quill_price: price,
        status: 'pending'
      });

      if (error) {
        alert('Could not submit: ' + error.message);
        btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> Submit for Review';
        return;
      }
      modal.innerHTML = '<div class="ct-song-modal" style="text-align:center;padding:32px 24px;">' +
        '<i class="ti ti-circle-check" style="font-size:40px;color:var(--green);display:block;margin-bottom:12px;"></i>' +
        '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;">Submitted!</div>' +
        '<div style="font-size:13px;color:var(--text3);">The author will review your cosmetic art. You\'ll be notified when it\'s approved.</div>' +
        '<button onclick="this.closest(\'.ct-song-modal-overlay\').remove()" style="margin-top:18px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 20px;color:var(--text);font-family:inherit;font-size:13px;cursor:pointer;">Close</button>' +
        '</div>';
    });

    document.body.appendChild(modal);
    _cosmeticModal = modal;
  }

  // ── SONG SUGGESTION MODAL ──────────────────────────────────────
  var _songModal = null;
  function openSongModal(charId, charName, workId, userId) {
    if (_songModal) _songModal.remove();
    var modal = document.createElement('div');
    modal.className = 'ct-song-modal-overlay';
    modal.innerHTML =
      '<div class="ct-song-modal">' +
        '<div class="ct-song-modal-header">' +
          '<div class="ct-song-modal-title"><i class="ti ti-music-plus"></i> Suggest a Song for ' + esc(charName) + '</div>' +
          '<button class="ct-song-modal-close"><i class="ti ti-x"></i></button>' +
        '</div>' +
        '<div class="ct-song-modal-body">' +
          '<label class="ct-song-label">YouTube URL *</label>' +
          '<input class="ct-song-input" id="ct-song-url" type="url" placeholder="https://www.youtube.com/watch?v=..." />' +
          '<label class="ct-song-label">Song Title *</label>' +
          '<input class="ct-song-input" id="ct-song-name" type="text" maxlength="100" placeholder="e.g. Believer" />' +
          '<label class="ct-song-label">Artist Name</label>' +
          '<input class="ct-song-input" id="ct-song-artist" type="text" maxlength="100" placeholder="e.g. Imagine Dragons" />' +
          '<div class="ct-song-hint">The author will review your suggestion before it appears on the character card.</div>' +
          '<div id="ct-song-error" style="color:var(--red);font-size:12px;margin-top:4px;display:none;"></div>' +
        '</div>' +
        '<div class="ct-song-modal-footer">' +
          '<button class="ct-song-cancel-btn">Cancel</button>' +
          '<button class="ct-song-submit-btn"><i class="ti ti-send"></i> Submit</button>' +
        '</div>' +
      '</div>';

    modal.querySelector('.ct-song-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.querySelector('.ct-song-cancel-btn').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    modal.querySelector('.ct-song-submit-btn').addEventListener('click', async function() {
      var url = document.getElementById('ct-song-url').value.trim();
      var title = document.getElementById('ct-song-name').value.trim();
      var artist = document.getElementById('ct-song-artist').value.trim();
      var errEl = document.getElementById('ct-song-error');
      errEl.style.display = 'none';
      if (!url || !title) { errEl.textContent = 'YouTube URL and song title are required.'; errEl.style.display = 'block'; return; }
      var result = await submitSongSuggestion(charId, workId, null, userId, url, title, artist);
      if (result.error) { errEl.textContent = result.error; errEl.style.display = 'block'; return; }
      modal.remove();
      // Show thank-you toast if available
      if (window.showToast) window.showToast('Song suggestion submitted! The author will review it. 🎵', 'ti-music');
      // ── NEW READER MISSION: suggest a song for a character ────
      if (window.dsCompleteMission) {
        try { await window.dsCompleteMission('suggest_character_song'); } catch(e) {}
      }
      // Notify the work author
      try {
        var _db2 = db();
        var _wRes2 = await _db2.from('works').select('author_id,title').eq('id', workId).maybeSingle();
        var _w2 = _wRes2.data;
        if (_w2 && _w2.author_id !== userId) {
          var _meRes2 = await _db2.from('profiles').select('display_name,username').eq('id', userId).maybeSingle();
          var _me2 = _meRes2.data || {};
          var _myName2 = _me2.display_name || _me2.username || 'Someone';
          await _db2.from('notifications').insert({
            user_id: _w2.author_id,
            type: 'opinion_submitted',
            from_user_id: userId,
            work_id: workId,
            character_id: charId,
            message: _myName2 + ' suggested a song for a character in \u201c' + (_w2.title || 'your story') + '\u201d'
          });
        }
      } catch(e3) {}
    });

    document.body.appendChild(modal);
    _songModal = modal;
  }

  // ── NOTIFICATION HELPERS (quotes & questions) ─────────────────
  async function ctNotifyWorkAuthor(workId, fromUid, charId, type, buildMsg) {
    try {
      if (!workId || !fromUid) return;
      var _db = db();
      var wRes = await _db.from('works').select('author_id,title').eq('id', workId).maybeSingle();
      var w = wRes.data;
      if (!w || !w.author_id || w.author_id === fromUid) return;
      var meRes = await _db.from('profiles').select('display_name,username').eq('id', fromUid).maybeSingle();
      var me = meRes.data || {};
      var myName = me.display_name || me.username || 'Someone';
      await _db.from('notifications').insert({
        user_id: w.author_id,
        type: type,
        from_user_id: fromUid,
        work_id: workId,
        character_id: charId || null,
        message: buildMsg(myName, w.title || 'your story')
      });
    } catch (e) {}
  }
  async function ctNotifyUser(targetUid, myUid, workId, charId, type, message) {
    try {
      if (!targetUid || targetUid === myUid) return;
      await db().from('notifications').insert({
        user_id: targetUid,
        type: type,
        from_user_id: myUid || null,
        work_id: workId || null,
        character_id: charId || null,
        message: message
      });
    } catch (e) {}
  }

  // ── AURA PALETTE ──────────────────────────────────────────────
  var CT_MOODS = [
    { name:'Grieving', hex:'#3b82f6' }, { name:'Scheming', hex:'#a855f7' },
    { name:'Feral', hex:'#ef4444' },    { name:'Hopeful', hex:'#f5c542' },
    { name:'At Peace', hex:'#22c55e' }, { name:'Burning', hex:'#f97316' },
    { name:'Haunted', hex:'#9ca3af' },  { name:'In Love', hex:'#ec4899' }
  ];
  var CT_SENTIMENTS = ['Loved','Liked','Neutral','Suspicious','Disliked','Hated'];
  var CT_SENT_COLOR = { Loved:'#ec4899', Liked:'#22c55e', Neutral:'#9ca3af', Suspicious:'#f5c542', Disliked:'#f97316', Hated:'#ef4444' };
  var CT_DYN_LABELS = ['Rivals','Slow Burn','Found Family','Doomed','Ride or Die','Enemies to Allies','Mentor & Student','Siblings in Arms','It\u2019s Complicated'];
  var CT_TRAIT_AXES = [
    { key:'hero_menace', left:'Hero', right:'Menace' },
    { key:'brains_brawn', left:'Brains', right:'Brawn' },
    { key:'soft_cold', left:'Soft Heart', right:'Cold Blood' },
    { key:'chaos_order', left:'Chaos', right:'Order' },
    { key:'leader_lone', left:'Leader', right:'Lone Wolf' },
    { key:'open_mystery', left:'Open Book', right:'Mystery' }
  ];

  var AURA_PALETTE = [
    // Reds & pinks (8)
    { hex: '#fca5a5', name: 'Blush' },
    { hex: '#ef4444', name: 'Crimson' },
    { hex: '#b91c1c', name: 'Bloodstone' },
    { hex: '#f43f5e', name: 'Scarlet' },
    { hex: '#ec4899', name: 'Rose' },
    { hex: '#db2777', name: 'Fuchsia' },
    { hex: '#ff80ab', name: 'Carnation' },
    { hex: '#be123c', name: 'Garnet' },
    // Oranges & yellows (8)
    { hex: '#fed7aa', name: 'Peach' },
    { hex: '#f97316', name: 'Ember' },
    { hex: '#c2410c', name: 'Rust' },
    { hex: '#f59e0b', name: 'Amber' },
    { hex: '#eab308', name: 'Gold' },
    { hex: '#ca8a04', name: 'Bronze' },
    { hex: '#fde68a', name: 'Sunlight' },
    { hex: '#92400e', name: 'Mahogany' },
    // Greens (8)
    { hex: '#86efac', name: 'Mint' },
    { hex: '#84cc16', name: 'Lime' },
    { hex: '#22c55e', name: 'Jade' },
    { hex: '#15803d', name: 'Forest' },
    { hex: '#10b981', name: 'Teal' },
    { hex: '#0f766e', name: 'Depths' },
    { hex: '#d9f99d', name: 'Wisp' },
    { hex: '#064e3b', name: 'Ancient' },
    // Blues & cyans (8)
    { hex: '#67e8f9', name: 'Ice' },
    { hex: '#06b6d4', name: 'Cyan' },
    { hex: '#0284c7', name: 'Sapphire' },
    { hex: '#3b82f6', name: 'Azure' },
    { hex: '#1d4ed8', name: 'Cobalt' },
    { hex: '#1e3a5f', name: 'Abyss' },
    { hex: '#bae6fd', name: 'Frost' },
    { hex: '#172554', name: 'Midnight' },
    // Purples, violets & neutrals (8)
    { hex: '#c4b5fd', name: 'Lavender' },
    { hex: '#8b5cf6', name: 'Violet' },
    { hex: '#6366f1', name: 'Indigo' },
    { hex: '#a855f7', name: 'Amethyst' },
    { hex: '#7e22ce', name: 'Dusk' },
    { hex: '#4a044e', name: 'Shadow' },
    { hex: '#ffffff', name: 'Ivory' },
    { hex: '#94a3b8', name: 'Ash' },
  ];

  // ── AURA DATA LOADERS ─────────────────────────────────────────
  async function loadAuraVotes(characterIds) {
    if (!characterIds.length) return {};
    var { data, error } = await db().from('character_aura_votes')
      .select('character_id, hex, user_id')
      .in('character_id', characterIds);
    if (error) return {};
    // Group by character, count hex frequencies, find winning hex
    var map = {};
    (data||[]).forEach(function(v) {
      if (!map[v.character_id]) map[v.character_id] = { counts: {}, votes: [] };
      map[v.character_id].counts[v.hex] = (map[v.character_id].counts[v.hex] || 0) + 1;
      map[v.character_id].votes.push(v);
    });
    // Add winning hex
    Object.keys(map).forEach(function(cid) {
      var counts = map[cid].counts;
      var best = Object.keys(counts).sort(function(a,b){ return counts[b]-counts[a]; })[0];
      map[cid].winner = best || null;
      map[cid].total = map[cid].votes.length;
    });
    return map;
  }

  async function submitAuraVote(characterId, hex, userId) {
    var { error } = await db().from('character_aura_votes')
      .upsert({ character_id: characterId, user_id: userId, hex: hex }, { onConflict: 'character_id,user_id' });
    if (!error) {
      try { await db().rpc('award_aura_reader_badge', { p_user_id: userId, p_character_id: characterId }); } catch(e) {}
    }
    return !error;
  }

  // ── OPINION DATA LOADERS ──────────────────────────────────────
  async function loadFeaturedOpinions(characterIds) {
    if (!characterIds.length) return {};
    // Load ALL approved opinions so we can show them in the Opinions panel
    var { data, error } = await db().from('character_opinions')
      .select('id, character_id, chapter_id, user_id, body, is_featured, created_at')
      .in('character_id', characterIds)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (error) return {};
    // Fetch submitter display names
    var uids = [...new Set((data||[]).map(function(o){ return o.user_id; }))];
    var nameMap = {};
    if (uids.length) {
      var { data: profs } = await db().from('profiles').select('id,display_name,username').in('id', uids);
      (profs||[]).forEach(function(p){ nameMap[p.id] = p.display_name || p.username || 'Someone'; });
    }
    (data||[]).forEach(function(o){ o._authorName = nameMap[o.user_id] || 'Someone'; });
    var map = {};
    (data||[]).forEach(function(o) {
      if (!map[o.character_id]) map[o.character_id] = [];
      map[o.character_id].push(o);
    });
    return map;
  }

  async function loadPendingOpinions(workId) {
    var { data } = await db().from('character_opinions')
      .select('id, character_id, chapter_id, user_id, body, created_at')
      .eq('work_id', workId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    return data || [];
  }

  async function submitOpinion(characterId, chapterId, workId, userId, body) {
    var { error } = await db().from('character_opinions').insert({
      character_id: characterId,
      chapter_id: chapterId || null,   // book-card takes are chapter-agnostic
      work_id: workId,
      user_id: userId,
      body: body.trim()
    });
    if (error) {
      if (error.code === '23505') return { error: 'You already submitted an opinion for this character this chapter.' };
      return { error: error.message };
    }
    return { ok: true };
  }

  async function updateOpinionStatus(id, status, featured) {
    var update = { status: status };
    if (featured !== undefined) update.is_featured = featured;
    var { error } = await db().from('character_opinions').update(update).eq('id', id);
    return !error;
  }

  // ── OPINION MODAL ─────────────────────────────────────────────
  var _opinionModal = null;
  var _ctIsBookOpinion = false;
  function openOpinionModal(charId, charName, chapterId, workId, userId, isBook) {
    _ctIsBookOpinion = !!isBook;
    if (_opinionModal) _opinionModal.remove();
    var modal = document.createElement('div');
    modal.className = 'ct-opinion-modal-overlay';
    modal.innerHTML =
      '<div class="ct-opinion-modal">' +
        '<div class="ct-opinion-modal-header">' +
          '<div class="ct-opinion-modal-title"><i class="ti ti-message-heart"></i> ' + (_ctIsBookOpinion ? 'Your Take on this Book' : 'Your Take on ' + esc(charName)) + '</div>' +
          '<button class="ct-opinion-modal-close"><i class="ti ti-x"></i></button>' +
        '</div>' +
        '<div class="ct-opinion-modal-body">' +
          '<div class="ct-opinion-hint">' + (_ctIsBookOpinion ? 'Share your overall take on this book. The author may feature it on the Book Card. Keep it honest, keep it kind.' : 'Share your personal take on ' + esc(charName) + ' based on what happened this chapter. One opinion per chapter — the author may feature it on the character card. Keep it honest, keep it kind.') + '</div>' +
          '<textarea class="ct-opinion-textarea" id="ct-opinion-body" maxlength="280" placeholder="' + (_ctIsBookOpinion ? 'What did this book leave you with?' : 'What do you make of ' + esc(charName) + ' after this chapter?') + '"></textarea>' +
          '<div class="ct-opinion-char-counter"><span id="ct-opinion-counter">0</span>/280</div>' +
          '<div id="ct-opinion-error" style="color:var(--red);font-size:12px;display:none;"></div>' +
        '</div>' +
        '<div class="ct-opinion-modal-footer">' +
          '<button class="ct-opinion-cancel-btn">Cancel</button>' +
          '<button class="ct-opinion-submit-btn" disabled><i class="ti ti-send"></i> Submit</button>' +
        '</div>' +
      '</div>';

    var textarea = modal.querySelector('#ct-opinion-body');
    var counter = modal.querySelector('#ct-opinion-counter');
    var submitBtn = modal.querySelector('.ct-opinion-submit-btn');
    var errEl = modal.querySelector('#ct-opinion-error');

    textarea.addEventListener('input', function() {
      var len = textarea.value.length;
      counter.textContent = len;
      submitBtn.disabled = len < 1;
    });

    modal.querySelector('.ct-opinion-modal-close').addEventListener('click', function() { modal.remove(); });
    modal.querySelector('.ct-opinion-cancel-btn').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    submitBtn.addEventListener('click', async function() {
      var body = textarea.value.trim();
      errEl.style.display = 'none';
      if (!body) return;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite;"></i> Submitting...';
      var result = await submitOpinion(charId, chapterId, workId, userId, body);
      if (result.error) {
        errEl.textContent = result.error;
        errEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ti ti-send"></i> Submit';
        return;
      }
      modal.remove();
      if (window.showToast) window.showToast('Opinion submitted — the author will review it! ✨', 'ti-message-heart');
      // Notify the work author — use chapter.html bridge if available, else insert directly
      if (window.dsNotifyAuthor) {
        window.dsNotifyAuthor('opinion_submitted', '{name} shared a character opinion on \u201c{title}\u201d', { character_id: charId });
      } else {
        try {
          var _db = db();
          var _wRes = await _db.from('works').select('author_id,title').eq('id', workId).maybeSingle();
          var _w = _wRes.data;
          if (_w && _w.author_id !== userId) {
            var _meRes = await _db.from('profiles').select('display_name,username').eq('id', userId).maybeSingle();
            var _me = _meRes.data || {};
            var _myName = _me.display_name || _me.username || 'Someone';
            await _db.from('notifications').insert({
              user_id: _w.author_id,
              type: 'opinion_submitted',
              from_user_id: userId,
              work_id: workId,
              chapter_id: chapterId || null,
              character_id: charId,
              message: _myName + ' shared a character opinion on \u201c' + (_w.title || 'your story') + '\u201d'
            });
          }
        } catch(e2) {}
      }
    });

    document.body.appendChild(modal);
    _opinionModal = modal;
  }

  // ── PENDING OPINIONS PANEL (author, on story.html) ────────────
  async function renderPendingOpinionsPanel(container, workId) {
    var pending = await loadPendingOpinions(workId);
    var existingPanel = container.querySelector('.ct-pending-opinions-panel');
    if (existingPanel) existingPanel.remove();
    if (!pending.length) return;

    var uids = [...new Set(pending.map(function(o){ return o.user_id; }))];
    var names = await loadUsernames(uids);

    var chapIds = [...new Set(pending.filter(function(o){ return o.chapter_id; }).map(function(o){ return o.chapter_id; }))];
    var chapMap = {};
    if (chapIds.length) {
      var { data: chapRows } = await db().from('chapters').select('id, title, chapter_number').in('id', chapIds);
      (chapRows||[]).forEach(function(c){ chapMap[c.id] = c; });
    }

    // Also fetch character names
    var charIds = [...new Set(pending.map(function(o){ return o.character_id; }))];
    var charMap = {};
    if (charIds.length) {
      var { data: charRows } = await db().from('novel_characters').select('id, name').in('id', charIds);
      (charRows||[]).forEach(function(c){ charMap[c.id] = c; });
    }

    var panel = document.createElement('div');
    panel.className = 'ct-pending-opinions-panel';
    panel.innerHTML = '<div class="ct-pending-opinions-title"><i class="ti ti-message-heart"></i> Reader Opinions Awaiting Review <span class="ct-pending-badge">' + pending.length + '</span></div>';

    pending.forEach(function(o) {
      var name = names[o.user_id] || 'Unknown';
      var chap = o.chapter_id ? chapMap[o.chapter_id] : null;
      var charName = charMap[o.character_id] ? charMap[o.character_id].name : '?';
      var chapLabel = chap ? 'Ch. ' + chap.chapter_number + (chap.title ? ' — ' + chap.title : '') : '';

      var row = document.createElement('div');
      row.className = 'ct-pending-opinion-row';

      var metaDiv = document.createElement('div');
      metaDiv.className = 'ct-pending-opinion-meta';
      metaDiv.textContent = name + ' on ' + charName + (chapLabel ? ' · ' + chapLabel : '');

      var bodyDiv = document.createElement('div');
      bodyDiv.style.flex = '1';
      bodyDiv.appendChild(metaDiv);
      var textDiv = document.createElement('div');
      textDiv.className = 'ct-pending-opinion-body';
      textDiv.textContent = '\u201c' + o.body + '\u201d';
      bodyDiv.appendChild(textDiv);

      var actions = document.createElement('div');
      actions.className = 'ct-pending-opinion-actions';

      var approveBtn = document.createElement('button');
      approveBtn.className = 'ct-opinion-approve-btn';
      approveBtn.innerHTML = '<i class="ti ti-check"></i> Approve';
      approveBtn.addEventListener('click', async function() {
        await updateOpinionStatus(o.id, 'approved', false);
        // Notify the submitter their opinion was approved
        try {
          await db().from('notifications').insert({
            user_id: o.user_id,
            type: 'opinion_approved',
            work_id: workId,
            character_id: o.character_id,
            message: 'Your character opinion on ' + charName + ' was approved by the author'
          });
        } catch(e2) {}
        renderPendingOpinionsPanel(container, workId);
      });

      var featureBtn = document.createElement('button');
      featureBtn.className = 'ct-opinion-feature-btn';
      featureBtn.innerHTML = '<i class="ti ti-star"></i> Feature';
      featureBtn.title = 'Approve and feature on character card for this chapter';
      featureBtn.addEventListener('click', async function() {
        // Un-feature any existing featured opinion for this char+chapter
        await db().from('character_opinions')
          .update({ is_featured: false })
          .eq('character_id', o.character_id)
          .eq('chapter_id', o.chapter_id)
          .eq('is_featured', true);
        await updateOpinionStatus(o.id, 'approved', true);
        // Notify the submitter their opinion was featured
        try {
          await db().from('notifications').insert({
            user_id: o.user_id,
            type: 'opinion_featured',
            work_id: workId,
            character_id: o.character_id,
            message: 'Your character opinion on ' + charName + ' was featured on the character card! \u2b50'
          });
        } catch(e2) {}
        renderPendingOpinionsPanel(container, workId);
      });

      var rejectBtn = document.createElement('button');
      rejectBtn.className = 'ct-opinion-reject-btn';
      rejectBtn.innerHTML = '<i class="ti ti-x"></i> Reject';
      rejectBtn.addEventListener('click', async function() {
        await updateOpinionStatus(o.id, 'rejected', false);
        renderPendingOpinionsPanel(container, workId);
      });

      actions.appendChild(approveBtn);
      actions.appendChild(featureBtn);
      actions.appendChild(rejectBtn);

      row.appendChild(bodyDiv);
      row.appendChild(actions);
      panel.appendChild(row);
    });

    container.appendChild(panel);
  }

  // ── PENDING COSMETICS PANEL (author only) ─────────────────────
  async function renderPendingCosmeticsPanel(container, workId) {
    var existing = container.querySelector('.ct-pending-cosmetics-panel');
    if (existing) existing.remove();

    var { data: charIds } = await db().from('novel_characters').select('id').eq('work_id', workId);
    if (!charIds || !charIds.length) return;
    var ids = charIds.map(function(c){ return c.id; });

    var { data: pending } = await db().from('character_cosmetic_collabs')
      .select('id, character_id, artist_id, image_url, name, description, quill_price, created_at')
      .in('character_id', ids)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!pending || !pending.length) return;

    // Load artist usernames
    var artistIds = [...new Set(pending.map(function(p){ return p.artist_id; }))];
    var artistNames = await loadUsernames(artistIds);

    // Load char names
    var { data: charRows } = await db().from('novel_characters').select('id, name').in('id', ids);
    var charNameMap = {};
    (charRows||[]).forEach(function(c){ charNameMap[c.id] = c.name; });

    var panel = document.createElement('div');
    panel.className = 'ct-pending-cosmetics-panel ct-pending-songs-panel';
    panel.innerHTML = '<div class="ct-pending-songs-title"><i class="ti ti-palette" style="color:#f59e0b;"></i> Cosmetic Art Awaiting Approval <span class="ct-pending-badge">' + pending.length + '</span></div>';

    pending.forEach(function(cm) {
      var row = document.createElement('div');
      row.className = 'ct-pending-song-row';
      row.style.alignItems = 'flex-start';
      row.innerHTML =
        '<img src="' + esc(cm.image_url) + '" style="width:52px;height:52px;border-radius:8px;object-fit:cover;flex-shrink:0;" alt=""/>' +
        '<div class="ct-song-info">' +
          '<div class="ct-song-title">' + esc(cm.name) + '</div>' +
          '<div class="ct-song-meta">For <strong>' + esc(charNameMap[cm.character_id] || 'Unknown') + '</strong> · by ' + esc(artistNames[cm.artist_id] || 'Unknown') + ' · ' + cm.quill_price + ' Quills</div>' +
          (cm.description ? '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + esc(cm.description) + '</div>' : '') +
        '</div>' +
        '<div class="ct-pending-song-actions">' +
          '<button class="ct-song-approve-btn" data-id="' + esc(cm.id) + '"><i class="ti ti-check"></i> Approve</button>' +
          '<button class="ct-song-reject-btn" data-id="' + esc(cm.id) + '"><i class="ti ti-x"></i> Reject</button>' +
        '</div>';

      row.querySelector('.ct-song-approve-btn').addEventListener('click', async function() {
        await db().from('character_cosmetic_collabs').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', cm.id);
        renderStoryCharacterCards(container, workId, true);
      });
      row.querySelector('.ct-song-reject-btn').addEventListener('click', async function() {
        var reason = prompt('Rejection reason (optional):') || '';
        await db().from('character_cosmetic_collabs').update({ status: 'rejected', rejection_reason: reason || null, reviewed_at: new Date().toISOString() }).eq('id', cm.id);
        renderPendingCosmeticsPanel(container, workId);
      });

      panel.appendChild(row);
    });

    container.appendChild(panel);
  }

  // Public API
  return {
    renderVotingSection: renderVotingSection,
    renderStoryCharacterCards: renderStoryCharacterCards,
    toggleResults: toggleResults,
    openSuggestModal: openSuggestModal,
    closeSuggestModal: closeSuggestModal,
    submitSuggestion: submitSuggestion,
    openSongModal: openSongModal,
    openOpinionModal: openOpinionModal
  };

})();
