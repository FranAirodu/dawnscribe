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

    // Load aura votes
    var charIds = chars.map(function(c){ return c.id; });
    var auraByChar = await loadAuraVotes(charIds);

    // Load featured opinions per character
    var featuredOpinionsByChar = await loadFeaturedOpinions(charIds);

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
    var currentUserSession = window._ctSession || null;

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
      var auraData = auraByChar[char.id] || { winner: null, total: 0 };
      var myAuraHex = myAuraMap[char.id] || null;
      var featuredOpinions = featuredOpinionsByChar[char.id] || [];

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
      var featuredOpinionHtml = '';
      if (featuredOpinions.length) {
        var fo = featuredOpinions[0]; // show most recently featured
        featuredOpinionHtml =
          '<div class="ct-opinion-strip">' +
            '<div class="ct-opinion-label"><i class="ti ti-message-heart"></i> Reader\'s Take</div>' +
            '<div class="ct-opinion-body">' + esc('\u201c' + fo.body + '\u201d') + '</div>' +
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
                '<i class="ti ' + (s.is_featured ? 'ti-star-filled' : 'ti-star') + '"></i></button>'
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
          '<div class="ct-aura-label"><i class="ti ti-droplet"></i> Character\'s Aura</div>' +
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
          '<div class="ct-aura-label"><i class="ti ti-droplet"></i> Character\'s Aura</div>' +
          '<div style="font-size:10px;color:var(--text3);padding:0 12px 8px;line-height:1.5;">Readers vote on the color that reflects this character\'s soul. The most popular choice tints their card.</div>' +
          (auraData.winner
            ? '<div class="ct-aura-voted"><div class="ct-aura-voted-dot" style="background:'+auraData.winner+';"></div> Leading: ' + (AURA_PALETTE.find(function(p){return p.hex===auraData.winner;})||{name:auraData.winner}).name + ' · ' + auraData.total + ' vote' + (auraData.total!==1?'s':'') + '</div>'
            : '<div style="font-size:11px;color:var(--text3);padding:0 12px 8px;font-style:italic;">No votes yet</div>') +
          buildAuraBreakdown(auraData.counts || {}, auraData.total);
      }

      card.innerHTML =
        auraWashHtml +
        '<div class="ct-flip-inner">' +
          // FRONT
          '<div class="ct-flip-front">' +
            '<div class="ct-story-char-top">' +
              imgHtml +
              '<div class="ct-story-char-name">' + esc(char.name) + '</div>' +
              endedBadge + editBtn +
            '</div>' +
            '<div class="ct-story-titles-wrap">' + titlesHtml + '</div>' +
            featuredOpinionHtml +
            featuredHtml +
            collabsHtml +
            (charSongs.length ? '<button class="ct-flip-trigger ct-flip-songs" title="View songs" style="' + (aura ? 'border-color:'+aura+'55;color:'+aura+';' : '') + '"><i class="ti ti-music"></i> ' + charSongs.length + ' song' + (charSongs.length > 1 ? 's' : '') + '</button>' : '') +
            ((currentUserSession && !isOwner) ? '<button class="ct-flip-trigger ct-flip-aura" title="Vote on aura" style="' + (aura ? 'border-color:'+aura+'55;color:'+aura+';' : '') + '"><i class="ti ti-droplet"></i> Aura</button>' : '') +
            (isOwner ? '<button class="ct-flip-trigger ct-flip-aura" title="View aura" style="' + (aura ? 'border-color:'+aura+'55;color:'+aura+';' : '') + '"><i class="ti ti-droplet"></i> Aura</button>' : '') +
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
        '</div>';

      // Wire flip triggers — songs and aura each open their own back
      var flipTriggers = card.querySelectorAll('.ct-flip-trigger');
      var flipCloses = card.querySelectorAll('.ct-flip-close');
      var songBack = card.querySelector('.ct-flip-back[data-back="songs"]');
      var auraBack = card.querySelector('.ct-flip-back[data-back="aura"]');

      function showBack(which) {
        if (songBack) songBack.style.display = (which === 'songs') ? 'flex' : 'none';
        if (auraBack) auraBack.style.display = (which === 'aura') ? 'flex' : 'none';
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
          } else {
            showBack('songs');
          }
        });
      });
      flipCloses.forEach(function(fc) {
        fc.addEventListener('click', function(e) { e.stopPropagation(); hideBack(); });
      });

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

      grid.appendChild(card);
    });

    // Author pending songs panel
    if (isOwner) {
      await renderPendingSongsPanel(container, workId);
      await renderPendingOpinionsPanel(container, workId);
    }
  }

  // ── PENDING SONGS PANEL (author only) ─────────────────────────
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
    });

    document.body.appendChild(modal);
    _songModal = modal;
  }

  // ── AURA PALETTE ──────────────────────────────────────────────
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
    return !error;
  }

  // ── OPINION DATA LOADERS ──────────────────────────────────────
  async function loadFeaturedOpinions(characterIds) {
    if (!characterIds.length) return {};
    var { data, error } = await db().from('character_opinions')
      .select('id, character_id, chapter_id, user_id, body, is_featured')
      .in('character_id', characterIds)
      .eq('status', 'approved')
      .eq('is_featured', true);
    if (error) return {};
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
      chapter_id: chapterId,
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
  function openOpinionModal(charId, charName, chapterId, workId, userId) {
    if (_opinionModal) _opinionModal.remove();
    var modal = document.createElement('div');
    modal.className = 'ct-opinion-modal-overlay';
    modal.innerHTML =
      '<div class="ct-opinion-modal">' +
        '<div class="ct-opinion-modal-header">' +
          '<div class="ct-opinion-modal-title"><i class="ti ti-message-heart"></i> Your Take on ' + esc(charName) + '</div>' +
          '<button class="ct-opinion-modal-close"><i class="ti ti-x"></i></button>' +
        '</div>' +
        '<div class="ct-opinion-modal-body">' +
          '<div class="ct-opinion-hint">Share your personal take on ' + esc(charName) + ' based on what happened this chapter. One opinion per chapter — the author may feature it on the character card. Keep it honest, keep it kind.</div>' +
          '<textarea class="ct-opinion-textarea" id="ct-opinion-body" maxlength="280" placeholder="What do you make of ' + esc(charName) + ' after this chapter?"></textarea>' +
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
      // Notify the work author
      if (window.dsNotifyAuthor) {
        window.dsNotifyAuthor('chapter_comment', '{name} shared a take on ' + charName + ' in "{title}"', { character_id: charId });
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
