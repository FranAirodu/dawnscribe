/**
 * commentToolbar.js
 * Shared module for DawnScribe comment forms.
 * Provides: GIF picker, emoji picker (textarea insert), image upload (Supabase).
 *
 * Usage:
 *   CommentToolbar.init(db)               — call once after db is ready
 *   CommentToolbar.renderToolbar(opts)    — returns HTML string for the action row
 *   CommentToolbar.openGif(context)       — open GIF picker for a context key
 *   CommentToolbar.openEmoji(textareaId)  — open emoji picker targeting a textarea
 *   CommentToolbar.openImage(context, textareaId) — open image upload for a context
 *   CommentToolbar.getPendingGif(context) — get selected gif URL or null
 *   CommentToolbar.getPendingImage(context) — get uploaded image URL or null
 *   CommentToolbar.clearAttachments(context) — clear gif + image for context
 *   CommentToolbar.renderPreview(context) — returns HTML for inline preview area
 *   CommentToolbar.refreshPreview(context) — update preview div in DOM
 *
 * opts = {
 *   context: 'chapter' | 'para' | 'sp' | 'artwork' | 'story' | 'collab' | any string,
 *   textareaId: 'comment-input',   // id of the textarea to insert emojis into
 *   onSubmit: function() {}        // optional submit callback for keyboard shortcut
 * }
 *
 * renderToolbar returns an HTML string:
 *   <div class="ct-toolbar">
 *     [spoiler btn if textareaId given] [GIF btn] [Emoji btn] [Image btn]
 *   </div>
 * Include <div id="ct-preview-{context}"></div> in your form to show previews.
 */

(function(global) {
  'use strict';

  var _db = null;
  var GIPHY_KEY = 'Gum2tzhKdWKmg03MVpAvAR1RNBrl5o95';
  var IMAGE_BUCKET = 'comment-images';

  // State
  var _gifContext = null;
  var _gifSelected = null;
  var _gifPage = 0;
  var _gifLastQuery = '';
  var _gifPageSize = 16;
  var _gifTotalCount = 0;

  var _emojiTargetId = null;
  var _emojiOpen = false;

  var _pendingGif = {};    // context -> url
  var _pendingImage = {};  // context -> url

  // ── INIT ──────────────────────────────────────────────────────────────────

  function init(db) {
    _db = db;
    _injectStyles();
    _injectModals();
    _bindGlobalEvents();
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  function renderToolbar(opts) {
    var ctx = opts.context || 'default';
    var taId = opts.textareaId || '';
    var spoiler = taId && global.dsSpoiler
      ? '<button type="button" class="ct-btn ct-spoiler-btn" title="Mark spoiler" onclick="(function(){if(window.dsSpoiler&&document.getElementById(\''+taId+'\'))window.dsSpoiler.wrapSelection(document.getElementById(\''+taId+'\'));})()">' +
        '<i class="ti ti-eye-off"></i></button>'
      : '';
    return '<div class="ct-toolbar" data-ctx="'+ctx+'">' +
      spoiler +
      '<button type="button" class="ct-btn ct-gif-btn" id="ct-gif-btn-'+ctx+'" title="Add GIF" onclick="CommentToolbar.openGif(\''+ctx+'\')">' +
        '<i class="ti ti-gif"></i> GIF</button>' +
      '<button type="button" class="ct-btn ct-emoji-btn" id="ct-emoji-btn-'+ctx+'" title="Add emoji" onclick="CommentToolbar.openEmoji(\''+taId+'\',\''+ctx+'\')">' +
        '<i class="ti ti-mood-smile"></i></button>' +
      '<button type="button" class="ct-btn ct-img-btn" id="ct-img-btn-'+ctx+'" title="Add image" onclick="CommentToolbar.openImage(\''+ctx+'\',\''+taId+'\')">' +
        '<i class="ti ti-photo"></i></button>' +
      '</div>';
  }

  function openGif(context) {
    _gifContext = context;
    _gifSelected = null;
    _gifPage = 0;
    _gifLastQuery = '';
    _gifTotalCount = 0;
    var confirmBtn = document.getElementById('ct-gif-confirm');
    if (confirmBtn) confirmBtn.disabled = true;
    var searchInput = document.getElementById('ct-gif-search-input');
    if (searchInput) searchInput.value = '';
    var resultsEl = document.getElementById('ct-gif-results');
    if (resultsEl) resultsEl.innerHTML = _gifEmptyHTML('Search for a GIF above', 'ti-mood-smile');
    _gifUpdatePagination();
    var overlay = document.getElementById('ct-gif-overlay');
    if (overlay) overlay.classList.add('show');
    setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
  }

  function openEmoji(textareaId, context) {
    _emojiTargetId = textareaId;
    var picker = document.getElementById('ct-emoji-overlay');
    if (!picker) return;

    // Position near the emoji button
    var btn = document.getElementById('ct-emoji-btn-' + context);
    if (btn) {
      var rect = btn.getBoundingClientRect();
      // Try to position above the button
      var top = rect.top - 380;
      if (top < 8) top = rect.bottom + 8;
      var left = rect.left;
      if (left + 320 > window.innerWidth) left = window.innerWidth - 328;
      picker.style.top = top + 'px';
      picker.style.left = left + 'px';
    }

    if (_emojiOpen && picker.classList.contains('show')) {
      picker.classList.remove('show');
      _emojiOpen = false;
      return;
    }
    picker.classList.add('show');
    _emojiOpen = true;
    // Reset to first category
    _emojiRenderCats();
    _emojiSelectCat(0);
    var search = document.getElementById('ct-emoji-search');
    if (search) { search.value = ''; search.focus(); }
  }

  function openImage(context, textareaId) {
    var input = document.getElementById('ct-img-file-input');
    if (!input) return;
    input.dataset.ctx = context;
    input.dataset.ta = textareaId || '';
    input.value = '';
    input.click();
  }

  function getPendingGif(context) {
    return _pendingGif[context] || null;
  }

  function getPendingImage(context) {
    return _pendingImage[context] || null;
  }

  function clearAttachments(context) {
    _pendingGif[context] = null;
    _pendingImage[context] = null;
    var btn = document.getElementById('ct-gif-btn-' + context);
    if (btn) btn.classList.remove('has-attachment');
    var imgBtn = document.getElementById('ct-img-btn-' + context);
    if (imgBtn) imgBtn.classList.remove('has-attachment');
    refreshPreview(context);
  }

  function refreshPreview(context) {
    var el = document.getElementById('ct-preview-' + context);
    if (!el) return;
    var gifUrl = _pendingGif[context];
    var imgUrl = _pendingImage[context];
    var html = '';
    if (gifUrl) {
      html += '<div class="ct-preview-item" id="ct-preview-gif-'+context+'">' +
        '<img src="'+_esc(gifUrl)+'" alt="gif"/>' +
        '<div class="ct-preview-info"><span class="ct-preview-label">GIF</span>' +
        '<button class="ct-preview-remove" onclick="CommentToolbar._removeGif(\''+context+'\')" type="button"><i class="ti ti-x"></i> Remove</button></div>' +
        '</div>';
    }
    if (imgUrl) {
      html += '<div class="ct-preview-item" id="ct-preview-img-'+context+'">' +
        '<img src="'+_esc(imgUrl)+'" alt="image"/>' +
        '<div class="ct-preview-info"><span class="ct-preview-label">Image</span>' +
        '<button class="ct-preview-remove" onclick="CommentToolbar._removeImage(\''+context+'\')" type="button"><i class="ti ti-x"></i> Remove</button></div>' +
        '</div>';
    }
    el.innerHTML = html;
  }

  // Called by preview remove buttons
  function _removeGif(context) {
    _pendingGif[context] = null;
    var btn = document.getElementById('ct-gif-btn-' + context);
    if (btn) btn.classList.remove('has-attachment');
    refreshPreview(context);
  }

  function _removeImage(context) {
    _pendingImage[context] = null;
    var btn = document.getElementById('ct-img-btn-' + context);
    if (btn) btn.classList.remove('has-attachment');
    refreshPreview(context);
  }

  // ── GIF PICKER INTERNALS ──────────────────────────────────────────────────

  function _gifClose() {
    var overlay = document.getElementById('ct-gif-overlay');
    if (overlay) overlay.classList.remove('show');
    _gifContext = null;
    _gifSelected = null;
  }

  function _gifUpdatePagination() {
    var prevBtn = document.getElementById('ct-gif-prev');
    var nextBtn = document.getElementById('ct-gif-next');
    var label = document.getElementById('ct-gif-page-label');
    if (!prevBtn) return;
    var totalPages = _gifTotalCount ? Math.ceil(Math.min(_gifTotalCount, 200) / _gifPageSize) : 0;
    prevBtn.disabled = (_gifPage === 0 || !_gifLastQuery);
    nextBtn.disabled = (!_gifLastQuery || (_gifPage + 1) >= totalPages);
    label.textContent = _gifLastQuery ? 'Page ' + (_gifPage + 1) + (totalPages ? ' of ' + totalPages : '') : '';
  }

  function _gifEmptyHTML(msg, icon) {
    return '<div class="ct-gif-empty"><i class="ti ' + (icon||'ti-mood-smile') + '" style="font-size:28px;display:block;margin-bottom:8px;"></i>' + msg + '</div>';
  }

  async function _gifSearch() {
    var q = (document.getElementById('ct-gif-search-input').value || '').trim();
    if (!q) return;
    if (q !== _gifLastQuery) _gifPage = 0;
    _gifLastQuery = q;
    var resultsEl = document.getElementById('ct-gif-results');
    resultsEl.innerHTML = _gifEmptyHTML('<span style="animation:spin 1s linear infinite;display:inline-block;">⏳</span> Searching…', 'ti-loader-2');
    try {
      var offset = _gifPage * _gifPageSize;
      var url = 'https://api.giphy.com/v1/gifs/search?api_key=' + GIPHY_KEY +
        '&q=' + encodeURIComponent(q) + '&limit=' + _gifPageSize + '&offset=' + offset + '&rating=pg-13';
      var res = await fetch(url);
      var json = await res.json();
      var gifs = json.data || [];
      _gifTotalCount = (json.pagination && json.pagination.total_count) ? json.pagination.total_count : 0;
      _gifUpdatePagination();
      if (!gifs.length) { resultsEl.innerHTML = _gifEmptyHTML('No GIFs found. Try another search.', 'ti-search-off'); return; }
      resultsEl.innerHTML = '';
      _gifSelected = null;
      var confirmBtn = document.getElementById('ct-gif-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      gifs.forEach(function(gif) {
        var previewUrl = (gif.images.downsized && gif.images.downsized.url) ? gif.images.downsized.url : gif.images.fixed_width.url;
        var fullUrl = (gif.images.downsized_medium && gif.images.downsized_medium.url) ? gif.images.downsized_medium.url :
          (gif.images.downsized && gif.images.downsized.url) ? gif.images.downsized.url : gif.images.fixed_width.url;
        var item = document.createElement('div');
        item.className = 'ct-gif-item';
        item.innerHTML = '<img src="' + previewUrl + '" loading="lazy" alt="gif"/>';
        item.addEventListener('click', function() {
          resultsEl.querySelectorAll('.ct-gif-item').forEach(function(el) { el.classList.remove('selected'); });
          item.classList.add('selected');
          _gifSelected = fullUrl;
          if (confirmBtn) confirmBtn.disabled = false;
        });
        resultsEl.appendChild(item);
      });
      resultsEl.scrollTop = 0;
    } catch(e) {
      resultsEl.innerHTML = _gifEmptyHTML('Error loading GIFs. Try again.', 'ti-alert-circle');
    }
  }

  function _gifConfirm() {
    if (!_gifSelected || !_gifContext) return;
    _pendingGif[_gifContext] = _gifSelected;
    var btn = document.getElementById('ct-gif-btn-' + _gifContext);
    if (btn) btn.classList.add('has-attachment');
    refreshPreview(_gifContext);
    _gifClose();
  }

  function _gifPagePrev() {
    if (_gifPage > 0) { _gifPage--; _gifSearch(); }
  }

  function _gifPageNext() {
    var totalPages = _gifTotalCount ? Math.ceil(Math.min(_gifTotalCount, 200) / _gifPageSize) : 999;
    if (_gifPage + 1 < totalPages) { _gifPage++; _gifSearch(); }
  }

  // ── EMOJI PICKER INTERNALS ────────────────────────────────────────────────

  var EMOJI_CATS = [
    { label: '😊', name: 'Smileys', emojis: [
      ['😀','grinning'],['😁','beaming'],['😂','joy'],['🤣','rofl'],['😅','sweat smile'],['😆','laughing'],['😉','wink'],['😊','blush'],['😋','yum'],['😎','sunglasses'],['😍','heart eyes'],['🥰','smiling hearts'],['😘','kiss'],['🤩','star struck'],['🥳','partying'],['😏','smirk'],['😒','unamused'],['😞','disappointed'],['😢','cry'],['😭','loudly crying'],['😤','triumph'],['😠','angry'],['😡','rage'],['🤬','cursing'],['😈','smiling imp'],['💀','skull'],['🤯','mind blown'],['😱','scream'],['😰','anxious'],['😳','flushed'],['🥵','hot'],['🥶','cold'],['😶','no mouth'],['😐','neutral'],['🙄','eye roll'],['😬','grimace'],['🤔','thinking'],['🤗','hugs'],['😴','sleeping'],['🥱','yawning'],['🤢','nauseated'],['🤮','vomiting'],['🥴','woozy'],['😵','dizzy'],['🤑','money mouth'],['👻','ghost'],['👽','alien'],['🤖','robot'],['💩','poop'],['😺','smiling cat'],['😸','grinning cat'],['😹','joy cat'],['😻','heart eyes cat'],
    ]},
    { label: '❤️', name: 'Hearts', emojis: [
      ['❤️','red heart'],['🧡','orange heart'],['💛','yellow heart'],['💚','green heart'],['💙','blue heart'],['💜','purple heart'],['🖤','black heart'],['🤍','white heart'],['🤎','brown heart'],['💔','broken heart'],['❣️','heart exclamation'],['💕','two hearts'],['💞','revolving hearts'],['💓','beating heart'],['💗','growing heart'],['💖','sparkling heart'],['💘','heart arrow'],['💝','heart ribbon'],['💋','kiss mark'],['💌','love letter'],['💍','ring'],['🌹','rose'],
    ]},
    { label: '🔥', name: 'Energy', emojis: [
      ['🔥','fire'],['⚡','lightning'],['💥','explosion'],['✨','sparkles'],['🌟','glowing star'],['⭐','star'],['💫','dizzy star'],['🌠','shooting star'],['☄️','comet'],['🌊','wave'],['🌀','cyclone'],['❄️','snowflake'],['🌪','tornado'],['🌈','rainbow'],['☀️','sun'],['🌙','moon'],['💢','anger'],['‼️','double exclamation'],['⚠️','warning'],['🎆','fireworks'],['🪄','magic wand'],
    ]},
    { label: '👑', name: 'Prestige', emojis: [
      ['👑','crown'],['🏆','trophy'],['🥇','gold medal'],['🥈','silver medal'],['🥉','bronze medal'],['🎖️','medal'],['💎','gem'],['💰','money bag'],['🦁','lion'],['🐉','dragon'],['🦅','eagle'],['🦋','butterfly'],['🕊️','dove'],['🦄','unicorn'],['⚔️','sword'],['🛡️','shield'],['🔮','crystal ball'],['🧿','evil eye'],['🔱','trident'],
    ]},
    { label: '👍', name: 'Gestures', emojis: [
      ['👍','thumbs up'],['👎','thumbs down'],['👏','clapping'],['🙌','raising hands'],['🤝','handshake'],['✌️','victory'],['🤞','crossed fingers'],['🫶','heart hands'],['💪','muscle'],['🫂','people hugging'],['🙏','pray'],['🤜','right fist'],['🤛','left fist'],['✊','raised fist'],['👊','oncoming fist'],['🖐️','raised hand'],['✋','raised hand'],['🤚','back hand'],['🖖','vulcan salute'],['☝️','index finger'],['🫵','pointing'],
    ]},
    { label: '🌿', name: 'Nature', emojis: [
      ['🌸','cherry blossom'],['🌺','hibiscus'],['🌻','sunflower'],['🌹','rose'],['🌷','tulip'],['🌱','seedling'],['🌿','herb'],['🍀','clover'],['🍃','leaves'],['🍂','fallen leaf'],['🍁','maple leaf'],['🌴','palm'],['🌲','tree'],['🌳','tree'],['🦋','butterfly'],['🐝','bee'],['🌊','wave'],['⛰️','mountain'],['🌋','volcano'],['🌄','sunrise'],['🌌','milky way'],['🪷','lotus'],
    ]},
    { label: '🎨', name: 'Creative', emojis: [
      ['🎨','palette'],['🖌️','paintbrush'],['🖍️','crayon'],['✏️','pencil'],['📝','memo'],['📖','book'],['📚','books'],['🎭','arts'],['🎬','clapper'],['🎤','microphone'],['🎵','note'],['🎶','notes'],['🎸','guitar'],['🎹','piano'],['📸','camera'],['🖼️','picture'],['🌌','milky way'],['💡','bulb'],['🔭','telescope'],
    ]},
    { label: '⚡', name: 'Symbols', emojis: [
      ['💯','hundred'],['✅','check'],['❌','cross'],['❓','question'],['❗','exclamation'],['🔑','key'],['🗝️','old key'],['🔒','lock'],['🔓','unlock'],['⚙️','gear'],['🧩','puzzle'],['🎲','dice'],['♾️','infinity'],['🎯','bullseye'],['🚀','rocket'],['🛸','ufo'],['🌐','globe'],['📡','satellite'],['⏰','alarm'],['⌛','hourglass'],['🔔','bell'],['📢','loudspeaker'],
    ]},
  ];

  var _emojiActiveCat = 0;

  function _emojiRenderCats() {
    var bar = document.getElementById('ct-emoji-cats');
    if (!bar) return;
    bar.innerHTML = EMOJI_CATS.map(function(cat, i) {
      return '<button class="ct-emoji-cat' + (i === _emojiActiveCat ? ' active' : '') +
        '" onclick="CommentToolbar._emojiSelectCat(' + i + ')" title="' + cat.name + '">' + cat.label + '</button>';
    }).join('');
  }

  function _emojiSelectCat(i) {
    _emojiActiveCat = i;
    _emojiRenderCats();
    _emojiRenderGrid(EMOJI_CATS[i].emojis);
    var search = document.getElementById('ct-emoji-search');
    if (search) search.value = '';
  }

  function _emojiRenderGrid(emojis) {
    var grid = document.getElementById('ct-emoji-grid');
    if (!grid) return;
    if (!emojis.length) { grid.innerHTML = '<div class="ct-emoji-empty">No emojis found</div>'; return; }
    grid.innerHTML = emojis.map(function(e) {
      return '<button class="ct-emoji-btn" title="' + e[1] + '" onclick="CommentToolbar._emojiInsert(\'' + encodeURIComponent(e[0]) + '\')">' + e[0] + '</button>';
    }).join('');
  }

  function _emojiSearch() {
    var q = (document.getElementById('ct-emoji-search').value || '').toLowerCase().trim();
    if (!q) { _emojiRenderGrid(EMOJI_CATS[_emojiActiveCat].emojis); return; }
    var all = [];
    EMOJI_CATS.forEach(function(cat) { all = all.concat(cat.emojis); });
    _emojiRenderGrid(all.filter(function(e) { return e[1].indexOf(q) !== -1; }));
  }

  function _emojiInsert(encoded) {
    var emoji = decodeURIComponent(encoded);
    var ta = _emojiTargetId ? document.getElementById(_emojiTargetId) : null;
    if (ta) {
      var start = ta.selectionStart || 0;
      var end = ta.selectionEnd || 0;
      var val = ta.value;
      ta.value = val.slice(0, start) + emoji + val.slice(end);
      var pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
    }
    // Close picker
    var picker = document.getElementById('ct-emoji-overlay');
    if (picker) picker.classList.remove('show');
    _emojiOpen = false;
  }

  // ── IMAGE UPLOAD INTERNALS ────────────────────────────────────────────────

  async function _handleImageUpload(file, context) {
    if (!file || !_db) return;
    var allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.indexOf(file.type) === -1) {
      _showToast('Only JPEG, PNG, GIF, and WebP images are allowed.', 'ti-alert-circle');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      _showToast('Image must be under 5MB.', 'ti-alert-circle');
      return;
    }
    var btn = document.getElementById('ct-img-btn-' + context);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite;"></i>'; }
    try {
      var ext = file.name.split('.').pop() || 'jpg';
      var path = 'comments/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;
      var { error } = await _db.storage.from(IMAGE_BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      var url = _db.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
      _pendingImage[context] = url;
      if (btn) btn.classList.add('has-attachment');
      refreshPreview(context);
    } catch(e) {
      _showToast('Failed to upload image: ' + (e.message || 'Unknown error'), 'ti-alert-circle');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-photo"></i>'; }
  }

  // ── STYLES ────────────────────────────────────────────────────────────────

  function _injectStyles() {
    if (document.getElementById('ct-styles')) return;
    var style = document.createElement('style');
    style.id = 'ct-styles';
    style.textContent = `
      /* ── Comment Toolbar ── */
      .ct-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
      .ct-btn{background:none;border:1px solid var(--border,#2a2a3a);border-radius:7px;padding:5px 11px;color:var(--text2,#aaa);font-size:12px;font-weight:700;font-family:'Lato',sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.2s;white-space:nowrap;}
      .ct-btn:hover{border-color:var(--accent,#2dd4bf);color:var(--accent,#2dd4bf);}
      .ct-btn.has-attachment{border-color:var(--accent,#2dd4bf);color:var(--accent,#2dd4bf);background:rgba(45,212,191,0.08);}

      /* ── Inline preview ── */
      .ct-preview-area{margin-bottom:8px;display:flex;flex-direction:column;gap:6px;}
      .ct-preview-item{display:flex;align-items:flex-start;gap:10px;padding:8px 12px;background:var(--bg3,#1a1a2e);border-radius:8px;}
      .ct-preview-item img{width:80px;height:80px;object-fit:cover;border-radius:6px;display:block;flex-shrink:0;}
      .ct-preview-info{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:4px;}
      .ct-preview-label{font-size:11px;color:var(--text3,#666);font-style:italic;}
      .ct-preview-remove{background:none;border:1px solid var(--border,#2a2a3a);border-radius:6px;padding:3px 9px;color:var(--text2,#aaa);font-size:11px;font-family:'Lato',sans-serif;cursor:pointer;transition:all 0.2s;align-self:flex-start;}
      .ct-preview-remove:hover{border-color:#ef4444;color:#ef4444;}

      /* ── GIF Picker Modal ── */
      .ct-gif-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:3000;align-items:center;justify-content:center;}
      .ct-gif-overlay.show{display:flex;}
      .ct-gif-modal{background:var(--bg2,#12121e);border:1px solid var(--border,#2a2a3a);border-radius:16px;width:min(520px,95vw);max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.5);overflow:hidden;}
      .ct-gif-header{padding:16px 18px 12px;border-bottom:1px solid var(--border,#2a2a3a);display:flex;align-items:center;gap:10px;flex-shrink:0;}
      .ct-gif-title{font-family:'Cinzel',serif;font-size:15px;font-weight:700;color:var(--text,#f1f0ff);flex:1;}
      .ct-gif-close{background:none;border:none;color:var(--text2,#aaa);font-size:18px;cursor:pointer;padding:2px 6px;border-radius:6px;line-height:1;}
      .ct-gif-close:hover{color:#ef4444;}
      .ct-gif-search-wrap{padding:12px 18px;border-bottom:1px solid var(--border,#2a2a3a);display:flex;gap:8px;flex-shrink:0;}
      .ct-gif-search-input{flex:1;background:var(--bg3,#1a1a2e);border:1px solid var(--border,#2a2a3a);border-radius:8px;padding:8px 12px;color:var(--text,#f1f0ff);font-size:13px;font-family:'Lato',sans-serif;outline:none;}
      .ct-gif-search-input:focus{border-color:var(--accent,#2dd4bf);}
      .ct-gif-search-btn{background:var(--accent2,#0d9488);border:none;border-radius:8px;padding:8px 14px;color:white;font-size:13px;font-weight:700;font-family:'Lato',sans-serif;cursor:pointer;transition:background 0.2s;}
      .ct-gif-search-btn:hover{background:var(--accent,#2dd4bf);}
      .ct-gif-results{padding:12px 18px;overflow-y:auto;flex:1;display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:100px;gap:6px;}
      .ct-gif-empty{grid-column:1/-1;text-align:center;padding:32px;color:var(--text3,#666);font-size:13px;}
      .ct-gif-item{border-radius:8px;overflow:hidden;cursor:pointer;background:var(--bg3,#1a1a2e);position:relative;width:100%;height:100%;}
      .ct-gif-item img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:opacity 0.2s;}
      .ct-gif-item:hover img{opacity:0.8;}
      .ct-gif-item:hover::after{content:'';position:absolute;inset:0;border-radius:8px;box-shadow:inset 0 0 0 2px var(--accent2,#0d9488);}
      .ct-gif-item.selected::after{content:'';position:absolute;inset:0;border-radius:8px;box-shadow:inset 0 0 0 2px var(--accent,#2dd4bf);}
      .ct-gif-item.selected img{opacity:0.85;}
      .ct-gif-footer{padding:10px 18px;border-top:1px solid var(--border,#2a2a3a);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
      .ct-gif-pagination{display:flex;align-items:center;gap:8px;}
      .ct-gif-page-btn{background:none;border:1px solid var(--border,#2a2a3a);border-radius:7px;padding:5px 13px;color:var(--text2,#aaa);font-size:12px;font-weight:700;font-family:'Lato',sans-serif;cursor:pointer;transition:all 0.2s;}
      .ct-gif-page-btn:hover:not(:disabled){border-color:var(--accent,#2dd4bf);color:var(--accent,#2dd4bf);}
      .ct-gif-page-btn:disabled{opacity:0.3;cursor:default;}
      .ct-gif-page-label{font-size:11px;color:var(--text3,#666);}
      .ct-gif-confirm{background:var(--accent2,#0d9488);border:none;border-radius:8px;padding:8px 18px;color:white;font-size:13px;font-weight:700;font-family:'Lato',sans-serif;cursor:pointer;transition:background 0.2s;}
      .ct-gif-confirm:hover{background:var(--accent,#2dd4bf);}
      .ct-gif-confirm:disabled{opacity:0.4;cursor:default;}

      /* ── Emoji Picker ── */
      .ct-emoji-overlay{display:none;position:fixed;z-index:3100;width:310px;background:var(--bg2,#12121e);border:1px solid var(--border,#2a2a3a);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.5);overflow:hidden;}
      .ct-emoji-overlay.show{display:block;}
      .ct-emoji-search-wrap{padding:10px 12px 8px;border-bottom:1px solid var(--border,#2a2a3a);}
      .ct-emoji-search{width:100%;background:var(--bg3,#1a1a2e);border:1px solid var(--border,#2a2a3a);border-radius:8px;padding:7px 12px;color:var(--text,#f1f0ff);font-family:'Lato',sans-serif;font-size:13px;outline:none;transition:border-color 0.2s;box-sizing:border-box;}
      .ct-emoji-search:focus{border-color:var(--accent,#2dd4bf);}
      .ct-emoji-cats{display:flex;gap:2px;padding:6px 8px;border-bottom:1px solid var(--border,#2a2a3a);overflow-x:auto;scrollbar-width:none;}
      .ct-emoji-cats::-webkit-scrollbar{display:none;}
      .ct-emoji-cat{background:transparent;border:none;border-radius:6px;padding:4px 7px;cursor:pointer;font-size:16px;transition:background 0.15s;flex-shrink:0;}
      .ct-emoji-cat:hover{background:var(--bg3,#1a1a2e);}
      .ct-emoji-cat.active{background:rgba(45,212,191,0.15);}
      .ct-emoji-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;padding:8px;max-height:200px;overflow-y:auto;scrollbar-width:thin;}
      .ct-emoji-grid::-webkit-scrollbar{width:4px;}
      .ct-emoji-grid::-webkit-scrollbar-thumb{background:var(--bg3,#1a1a2e);border-radius:4px;}
      .ct-emoji-btn{background:transparent;border:none;border-radius:6px;padding:5px;font-size:20px;cursor:pointer;transition:background 0.1s;line-height:1;}
      .ct-emoji-btn:hover{background:var(--bg3,#1a1a2e);}
      .ct-emoji-empty{grid-column:1/-1;text-align:center;padding:16px;color:var(--text3,#666);font-size:13px;}

      /* ── Hidden file input ── */
      #ct-img-file-input{display:none;}

      @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
    `;
    document.head.appendChild(style);
  }

  // ── MODAL HTML ────────────────────────────────────────────────────────────

  function _injectModals() {
    if (document.getElementById('ct-gif-overlay')) return;

    // GIF Modal
    var gifDiv = document.createElement('div');
    gifDiv.id = 'ct-gif-overlay';
    gifDiv.className = 'ct-gif-overlay';
    gifDiv.innerHTML =
      '<div class="ct-gif-modal">' +
        '<div class="ct-gif-header">' +
          '<div class="ct-gif-title"><i class="ti ti-gif" style="color:var(--accent,#2dd4bf);"></i> Pick a GIF</div>' +
          '<button class="ct-gif-close" onclick="CommentToolbar._gifClose()"><i class="ti ti-x"></i></button>' +
        '</div>' +
        '<div class="ct-gif-search-wrap">' +
          '<input class="ct-gif-search-input" id="ct-gif-search-input" type="text" placeholder="Search GIFs…"/>' +
          '<button class="ct-gif-search-btn" onclick="CommentToolbar._gifSearch()"><i class="ti ti-search"></i> Search</button>' +
        '</div>' +
        '<div class="ct-gif-results" id="ct-gif-results">' +
          '<div class="ct-gif-empty"><i class="ti ti-mood-smile" style="font-size:28px;display:block;margin-bottom:8px;"></i>Search for a GIF above</div>' +
        '</div>' +
        '<div class="ct-gif-footer">' +
          '<div class="ct-gif-pagination">' +
            '<button class="ct-gif-page-btn" id="ct-gif-prev" onclick="CommentToolbar._gifPagePrev()" disabled><i class="ti ti-chevron-left"></i> Prev</button>' +
            '<span class="ct-gif-page-label" id="ct-gif-page-label"></span>' +
            '<button class="ct-gif-page-btn" id="ct-gif-next" onclick="CommentToolbar._gifPageNext()" disabled>Next <i class="ti ti-chevron-right"></i></button>' +
          '</div>' +
          '<button class="ct-gif-confirm" id="ct-gif-confirm" onclick="CommentToolbar._gifConfirm()" disabled>Select GIF</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(gifDiv);

    // Emoji Picker
    var emojiDiv = document.createElement('div');
    emojiDiv.id = 'ct-emoji-overlay';
    emojiDiv.className = 'ct-emoji-overlay';
    emojiDiv.innerHTML =
      '<div class="ct-emoji-search-wrap">' +
        '<input class="ct-emoji-search" id="ct-emoji-search" placeholder="Search emojis…" autocomplete="off" oninput="CommentToolbar._emojiSearch()"/>' +
      '</div>' +
      '<div class="ct-emoji-cats" id="ct-emoji-cats"></div>' +
      '<div class="ct-emoji-grid" id="ct-emoji-grid"></div>';
    document.body.appendChild(emojiDiv);

    // Hidden image file input
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'ct-img-file-input';
    fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp';
    fileInput.addEventListener('change', function() {
      if (fileInput.files && fileInput.files[0]) {
        _handleImageUpload(fileInput.files[0], fileInput.dataset.ctx || 'default');
      }
    });
    document.body.appendChild(fileInput);
  }

  // ── GLOBAL EVENTS ─────────────────────────────────────────────────────────

  function _bindGlobalEvents() {
    document.addEventListener('DOMContentLoaded', function() {
      // GIF search on Enter
      document.addEventListener('keydown', function(e) {
        var input = document.getElementById('ct-gif-search-input');
        if (e.key === 'Enter' && input && document.activeElement === input) {
          _gifPage = 0; _gifSearch();
        }
        // Close emoji on Escape
        if (e.key === 'Escape') {
          var picker = document.getElementById('ct-emoji-overlay');
          if (picker && picker.classList.contains('show')) { picker.classList.remove('show'); _emojiOpen = false; }
          _gifClose();
        }
      });

      // Close emoji picker on outside click
      document.addEventListener('click', function(e) {
        var picker = document.getElementById('ct-emoji-overlay');
        if (!picker || !picker.classList.contains('show')) return;
        if (picker.contains(e.target)) return;
        // Also allow emoji buttons to toggle it
        if (e.target.closest && e.target.closest('.ct-emoji-btn')) return;
        if (e.target.closest && e.target.closest('[id^="ct-emoji-btn-"]')) return;
        picker.classList.remove('show');
        _emojiOpen = false;
      });

      // Close gif on overlay backdrop click
      document.addEventListener('click', function(e) {
        var overlay = document.getElementById('ct-gif-overlay');
        if (overlay && overlay.classList.contains('show') && e.target === overlay) {
          _gifClose();
        }
      });
    });
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _showToast(msg, icon) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.innerHTML = '<i class="ti ' + (icon || 'ti-check') + '"></i> ' + msg;
    t.classList.add('show');
    setTimeout(function() { t.classList.remove('show'); }, 3500);
  }

  // ── EXPORTS ───────────────────────────────────────────────────────────────

  global.CommentToolbar = {
    init: init,
    renderToolbar: renderToolbar,
    openGif: openGif,
    openEmoji: openEmoji,
    openImage: openImage,
    getPendingGif: getPendingGif,
    getPendingImage: getPendingImage,
    clearAttachments: clearAttachments,
    refreshPreview: refreshPreview,
    // Internal (called from injected HTML onclick)
    _gifClose: _gifClose,
    _gifSearch: _gifSearch,
    _gifConfirm: _gifConfirm,
    _gifPagePrev: _gifPagePrev,
    _gifPageNext: _gifPageNext,
    _emojiSelectCat: _emojiSelectCat,
    _emojiSearch: _emojiSearch,
    _emojiInsert: _emojiInsert,
    _removeGif: _removeGif,
    _removeImage: _removeImage,
    EMOJI_CATS: EMOJI_CATS,
  };

})(window);
