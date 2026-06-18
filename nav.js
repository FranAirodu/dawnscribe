/* ── DAWNSCRIBE SHARED NAV ─────────────────────────────────────────
   Include this file on every page AFTER the Supabase client is set up.
   The page must have a <nav> element. This script appends the right-side
   controls (DM, notifications, avatar/dropdown, search) to that nav,
   injects the required CSS, and runs all auth-dependent logic.
──────────────────────────────────────────────────────────────────── */

// Apply cached accent color immediately so there's no teal flash.
function dsApplyAccent(hex) {
  var existing = document.getElementById('ds-accent-override');
  if (existing) existing.remove();
  if (!hex) return;
  var d = hex.replace('#','');
  var r = Math.max(0, parseInt(d.slice(0,2),16) - 30);
  var g = Math.max(0, parseInt(d.slice(2,4),16) - 30);
  var b = Math.max(0, parseInt(d.slice(4,6),16) - 30);
  var hex2 = '#' + [r,g,b].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
  var st = document.createElement('style');
  st.id = 'ds-accent-override';
  st.textContent = ':root { --accent: ' + hex + ' !important; --accent2: ' + hex2 + ' !important; } html[data-theme="light"] { --accent: ' + hex + ' !important; --accent2: ' + hex2 + ' !important; }';
  document.head.appendChild(st);
}
(function(){ var c = localStorage.getItem('ds_accent_hex'); if (c) dsApplyAccent(c); })();

(function() {

  /* ── CSS ─────────────────────────────────────────────────────── */
  var css = `
    :root { --accent: #2dd4bf; --accent2: #0d9488; }
    html[data-theme="light"] { --accent: #0d9488; --accent2: #0f766e; }
    .ember-wrap { display: flex; align-items: center; gap: 6px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: #f97316; font-size: 14px; font-weight: 700; cursor: default; transition: all 0.2s, transform 0.2s; }
    .ember-wrap:hover { border-color: #f97316; }
    .ember-wrap i { font-size: 16px; }
    .ember-count { color: var(--text); font-family: 'Lato', sans-serif; font-size: 13px; }
    .quill-wrap { display: flex; align-items: center; gap: 6px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--gold); font-size: 14px; font-weight: 700; cursor: default; transition: all 0.2s, transform 0.2s; }
    .quill-wrap:hover { border-color: var(--gold); }
    .quill-wrap i { font-size: 16px; }
    .quill-count { color: var(--text); font-family: 'Lato', sans-serif; font-size: 13px; }
    .dm-wrap { position: relative; }
    .dm-btn { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text2); font-size: 18px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; position: relative; text-decoration: none; }
    .dm-btn.has-unread { border-color: var(--accent); color: var(--accent); background: rgba(45,212,191,0.08); }
    .dm-btn:hover { border-color: var(--accent); color: var(--accent); }
    .dm-badge { position: absolute; top: -6px; right: -6px; background: var(--accent2); color: white; font-size: 10px; font-weight: 700; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .notif-wrap { position: relative; }
    .notif-btn { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text2); font-size: 18px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; position: relative; }
    .notif-btn:hover { border-color: var(--accent); color: var(--accent); }
    .notif-badge { position: absolute; top: -6px; right: -6px; background: var(--red,#f87171); color: white; font-size: 10px; font-weight: 700; width: 18px; height: 18px; border-radius: 50%; display: none; align-items: center; justify-content: center; }
    .notif-dropdown { display: none; position: absolute; top: calc(100% + 10px); right: 0; width: 340px; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; z-index: 400; box-shadow: 0 16px 40px rgba(0,0,0,0.4); animation: ds-fadeDown 0.15s ease; overflow: hidden; }
    .notif-dropdown.open { display: block; }
    .notif-tabs { display: flex; background: var(--bg); border-bottom: 1px solid var(--border); padding: 4px; gap: 4px; }
    .notif-tab { flex: 1; padding: 8px 4px; border: none; border-radius: 6px; font-size: 11px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; transition: all 0.2s; background: transparent; color: var(--text3); display: flex; align-items: center; justify-content: center; gap: 4px; }
    .notif-tab:hover { color: var(--text2); }
    .notif-tab.active { background: var(--bg2); color: var(--accent); }
    .notif-tab-badge { background: var(--red,#f87171); color: white; font-size: 9px; font-weight: 700; min-width: 16px; height: 16px; border-radius: 8px; padding: 0 4px; display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
    .notif-panel { display: none; }
    .notif-panel.active { display: block; }
    .notif-feed { max-height: 320px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
    .notif-feed::-webkit-scrollbar { width: 4px; }
    .notif-feed::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 4px; }
    .notif-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px; border-radius: 8px; background: var(--bg3); transition: background 0.15s; }
    .notif-item.unread { background: rgba(45,212,191,0.05); border: 1px solid rgba(45,212,191,0.1); }
    .notif-cover { width: 36px; height: 36px; border-radius: 6px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: white; overflow: hidden; }
    .notif-body { flex: 1; min-width: 0; }
    .notif-title { font-size: 12px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .notif-text { font-size: 11px; color: var(--text3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .notif-time { font-size: 10px; color: var(--text3); margin-top: 3px; display: flex; align-items: center; gap: 3px; }
    .notif-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; margin-top: 4px; }
    .notif-footer { padding: 10px 12px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .mark-read-btn { background: transparent; border: none; color: var(--text3); font-size: 11px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; display: flex; align-items: center; gap: 4px; }
    .mark-read-btn:hover { color: var(--accent); }
    .view-all-notif { font-size: 11px; font-weight: 700; color: var(--accent); text-decoration: none; display: flex; align-items: center; gap: 4px; }
    .nav-login-btn { background: transparent; border: 1px solid var(--border); border-radius: 8px; padding: 8px 16px; color: var(--text2); font-size: 13px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; transition: all 0.2s; text-decoration: none; display: flex; align-items: center; }
    .nav-login-btn:hover { border-color: var(--accent); color: var(--accent); }
    .user-nav-wrap { position: relative; display: none; }
    .user-avatar-btn { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg,#1e0040,#6b21a8); border: 2px solid rgba(45,212,191,0.4); display: flex; align-items: center; justify-content: center; font-family: 'Cinzel', serif; font-size: 15px; font-weight: 700; color: #c084fc; cursor: pointer; overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s; flex-shrink: 0; }
    .user-avatar-btn:hover { border-color: var(--accent); }
    .user-avatar-btn img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .user-avatar-btn.has-pending { border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.25), 0 0 12px rgba(245,158,11,0.2); animation: gold-pulse 2.5s ease-in-out infinite; }
    @keyframes gold-pulse { 0%,100%{ box-shadow:0 0 0 3px rgba(245,158,11,0.25),0 0 12px rgba(245,158,11,0.2); } 50%{ box-shadow:0 0 0 4px rgba(245,158,11,0.4),0 0 20px rgba(245,158,11,0.35); } }
    .collab-pending-pill { margin-left: auto; background: #f59e0b; color: #0a0a0f; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 1px 7px; letter-spacing: 0.5px; white-space: normal; max-width: 150px; line-height: 1.4; text-align: right; }
    .user-dropdown { display: none; position: absolute; top: calc(100% + 10px); right: 0; width: 260px; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; z-index: 400; box-shadow: 0 16px 40px rgba(0,0,0,0.5); animation: ds-fadeDown 0.15s ease; overflow: hidden; }
    .user-dropdown.open { display: block; }
    .user-dropdown-header { padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
    .user-dropdown-name { font-size: 14px; font-weight: 700; color: var(--text); }
    .user-dropdown-handle { font-size: 12px; color: var(--text3); margin-top: 1px; }
    .user-dropdown-menu { padding: 6px; }
    .user-dropdown-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px; color: var(--text2); font-size: 13px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; transition: all 0.15s; text-decoration: none; border: none; background: none; width: 100%; text-align: left; }
    .user-dropdown-item:hover { background: var(--bg3); color: var(--accent); }
    .user-dropdown-item i { font-size: 16px; color: var(--text3); flex-shrink: 0; }
    .user-dropdown-item:hover i { color: var(--accent); }
    .user-dropdown-divider { height: 1px; background: var(--border); margin: 4px 8px; }
    .signout-btn { color: var(--red,#f87171) !important; }
    .signout-btn i { color: var(--red,#f87171) !important; }
    .search-dropdown-wrap { position: relative; }
    .search-trigger-btn { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text2); font-size: 13px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
    .search-trigger-btn:hover { border-color: var(--accent); color: var(--accent); }
    .search-trigger-btn i { font-size: 16px; }
    .search-dropdown { display: none; position: absolute; top: calc(100% + 10px); right: 0; width: 340px; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 16px; z-index: 400; box-shadow: 0 16px 40px rgba(0,0,0,0.4); animation: ds-fadeDown 0.15s ease; }
    .search-dropdown.open { display: block; }
    .search-section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text3); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .search-field { display: flex; align-items: center; gap: 6px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; margin-bottom: 6px; transition: border-color 0.2s; }
    .search-field:focus-within { border-color: var(--accent); }
    .search-field i { color: var(--text3); font-size: 15px; flex-shrink: 0; }
    .search-input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-size: 13px; font-family: 'Lato', sans-serif; }
    .search-input::placeholder { color: var(--text3); }
    .search-go-btn { background: var(--accent2); border: none; border-radius: 5px; padding: 3px 9px; color: white; font-size: 11px; font-weight: 700; font-family: 'Lato', sans-serif; cursor: pointer; flex-shrink: 0; }
    .search-divider { height: 1px; background: var(--border); margin: 10px 0; }
    .search-preview { display: none; margin-bottom: 4px; border-radius: 8px; overflow: hidden; }
    .search-preview.visible { display: block; }
    .search-preview-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; transition: background 0.15s; text-decoration: none; }
    .search-preview-item:hover { background: var(--bg3); }
    .search-preview-cover { width: 28px; height: 28px; border-radius: 4px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: white; overflow: hidden; }
    .search-preview-info { flex: 1; min-width: 0; }
    .search-preview-title { font-size: 12px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .search-preview-sub { font-size: 10px; color: var(--text3); }
    .search-preview-spinner { padding: 8px; text-align: center; color: var(--text3); }
    .search-section.collapsed { opacity: 0.4; pointer-events: none; }
    @keyframes ds-fadeDown { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
  `;
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── NAV HTML ────────────────────────────────────────────────── */
  var navHtml = `
    <div class="quill-wrap" id="quill-wrap" style="display:none;" title="Your Quills — purchased to support creators">
      <i class="ti ti-feather"></i>
      <span class="quill-count" id="ds-quill-count">0</span>
    </div>
    <div class="ember-wrap" id="ember-wrap" style="display:none;" title="Your embers — earned by reading chapters">
      <i class="ti ti-flame"></i>
      <span class="ember-count" id="ds-ember-count">0</span>
    </div>
    <div class="dm-wrap">
      <a class="dm-btn" href="messages.html" id="dm-btn">
        <i class="ti ti-message"></i>
        <span class="dm-badge" id="dm-badge" style="display:none;"></span>
      </a>
    </div>
    <div class="notif-wrap">
      <button class="notif-btn" onclick="dsToggleNotif()">
        <i class="ti ti-bell"></i>
        <span class="notif-badge" id="ds-notif-badge"></span>
      </button>
      <div class="notif-dropdown" id="notifDropdown">
        <div class="notif-tabs">
          <button class="notif-tab active" id="notif-tab-novels" onclick="dsSwitchNotif('novels')"><i class="ti ti-book"></i> Novels</button>
          <button class="notif-tab" id="notif-tab-artists" onclick="dsSwitchNotif('artists')"><i class="ti ti-palette"></i> Artists</button>
          <button class="notif-tab" id="notif-tab-comments" onclick="dsSwitchNotif('comments')"><i class="ti ti-message-circle"></i> Comments</button>
        </div>
        <div class="notif-panel active" id="notif-novels">
          <div class="notif-feed" id="notif-feed-novels"><div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i></div></div>
          <div class="notif-footer">
            <button class="mark-read-btn" onclick="dsMarkAllRead('novels')"><i class="ti ti-checks"></i> Mark all as read</button>
            <a class="view-all-notif" href="notifications.html#novels">View all <i class="ti ti-arrow-right"></i></a>
          </div>
        </div>
        <div class="notif-panel" id="notif-artists">
          <div class="notif-feed" id="notif-feed-artists"><div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i></div></div>
          <div class="notif-footer">
            <button class="mark-read-btn" onclick="dsMarkAllRead('artists')"><i class="ti ti-checks"></i> Mark all as read</button>
            <a class="view-all-notif" href="notifications.html#artists">View all <i class="ti ti-arrow-right"></i></a>
          </div>
        </div>
        <div class="notif-panel" id="notif-comments">
          <div class="notif-feed" id="notif-feed-comments"><div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i></div></div>
          <div class="notif-footer">
            <button class="mark-read-btn" onclick="dsMarkAllRead('comments')"><i class="ti ti-checks"></i> Mark all as read</button>
            <a class="view-all-notif" href="notifications.html#comments">View all <i class="ti ti-arrow-right"></i></a>
          </div>
        </div>
      </div>
    </div>
    <a class="nav-login-btn" href="auth.html" id="nav-login-btn">Log In</a>
    <div class="user-nav-wrap" id="user-nav-wrap">
      <button class="user-avatar-btn" id="user-avatar-btn" onclick="dsToggleUserDropdown()">
        <span id="user-avatar-initial">?</span>
      </button>
      <div class="user-dropdown" id="user-dropdown">
        <div class="user-dropdown-header">
          <div class="user-dropdown-name" id="dd-display-name">My Account</div>
          <div class="user-dropdown-handle" id="dd-handle">@username</div>
        </div>
        <div class="user-dropdown-menu">
          <a class="user-dropdown-item" id="dd-profile-link" href="profile.html"><i class="ti ti-user"></i> My Profile</a>
          <a class="user-dropdown-item" id="dd-friends-link" href="friends.html"><i class="ti ti-users"></i> Friends</a>
          <a class="user-dropdown-item" href="following.html#titles"><i class="ti ti-bookmark"></i> Following Titles</a>
          <a class="user-dropdown-item" href="following.html#authors"><i class="ti ti-feather"></i> Following Authors</a>
          <a class="user-dropdown-item" href="following.html#artists"><i class="ti ti-palette"></i> Following Artists</a>
          <a class="user-dropdown-item" href="following.html#history"><i class="ti ti-history"></i> Reading History</a>
          <a class="user-dropdown-item" href="avatar.html"><i class="ti ti-shirt"></i> My Avatar</a>
          <a class="user-dropdown-item" href="rewards.html"><i class="ti ti-award"></i> My Rewards</a>
          <a class="user-dropdown-item" href="settings.html"><i class="ti ti-settings"></i> Settings</a>
          <div class="user-dropdown-divider"></div>
          <button class="user-dropdown-item signout-btn" onclick="dsSignOut()"><i class="ti ti-logout"></i> Sign Out</button>
        </div>
      </div>
    </div>
    <div class="search-dropdown-wrap">
      <button class="search-trigger-btn" onclick="dsToggleSearch()">
        <i class="ti ti-search"></i> Search
        <i class="ti ti-chevron-down" id="search-chevron"></i>
      </button>
      <div class="search-dropdown" id="searchDropdown">
        <div class="search-section" id="srch-sec-novels">
          <div class="search-section-label"><i class="ti ti-book"></i> Novels &amp; Authors</div>
          <div class="search-field"><i class="ti ti-book-2"></i><input type="text" id="srch-titles" placeholder="Search book titles…" class="search-input" autocomplete="off"/><button class="search-go-btn" onclick="dsGoSearch('titles')">Go</button></div>
          <div class="search-preview" id="srch-preview-titles"></div>
          <div class="search-field"><i class="ti ti-feather"></i><input type="text" id="srch-authors" placeholder="Search authors…" class="search-input" autocomplete="off"/><button class="search-go-btn" onclick="dsGoSearch('authors')">Go</button></div>
          <div class="search-preview" id="srch-preview-authors"></div>
        </div>
        <div class="search-divider"></div>
        <div class="search-section" id="srch-sec-art">
          <div class="search-section-label"><i class="ti ti-palette"></i> Art &amp; Artists</div>
          <div class="search-field"><i class="ti ti-photo"></i><input type="text" id="srch-artwork" placeholder="Search artwork…" class="search-input" autocomplete="off"/><button class="search-go-btn" onclick="dsGoSearch('artwork')">Go</button></div>
          <div class="search-preview" id="srch-preview-artwork"></div>
          <div class="search-field"><i class="ti ti-brush"></i><input type="text" id="srch-artists" placeholder="Search artists…" class="search-input" autocomplete="off"/><button class="search-go-btn" onclick="dsGoSearch('artists')">Go</button></div>
          <div class="search-preview" id="srch-preview-artists"></div>
        </div>
      </div>
    </div>
  `;

  /* Inject into nav's right side */
  var nav = document.querySelector('nav');
  if (nav) {
    var rightWrap = document.createElement('div');
    rightWrap.className = 'ds-nav-right';
    rightWrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:auto;';
    rightWrap.innerHTML = navHtml;
    nav.appendChild(rightWrap);
  }

  /* ── HELPERS ─────────────────────────────────────────────────── */
  function dsEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function dsTimeAgo(s){
    if(!s) return '';
    var d=Math.floor((Date.now()-new Date(s))/1000);
    if(d<60) return 'just now';
    if(d<3600) return Math.floor(d/60)+'m ago';
    if(d<86400) return Math.floor(d/3600)+'h ago';
    return Math.floor(d/86400)+'d ago';
  }
  var DS_COVER_COLORS = ['cover-purple','cover-blue','cover-red','cover-green','cover-gold','cover-pink'];
  function dsCoverColor(id){ var h=0; for(var i=0;i<(id||'').length;i++) h=(h*31+id.charCodeAt(i))&0xffff; return DS_COVER_COLORS[h%DS_COVER_COLORS.length]; }
  function dsCoverLetter(t){ return (t||'?').charAt(0).toUpperCase(); }

  /* ── TOGGLE FUNCTIONS ────────────────────────────────────────── */
  window.dsToggleNotif = function() {
    document.getElementById('notifDropdown').classList.toggle('open');
    document.getElementById('searchDropdown').classList.remove('open');
    var dd = document.getElementById('user-dropdown'); if(dd) dd.classList.remove('open');
  };
  window.dsSwitchNotif = function(tab) {
    document.querySelectorAll('.notif-tab').forEach(function(t,i){
      t.classList.toggle('active', ['novels','artists','comments'][i]===tab);
    });
    document.querySelectorAll('.notif-panel').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('notif-'+tab).classList.add('active');
  };
  window.dsToggleUserDropdown = function() {
    var dd = document.getElementById('user-dropdown');
    dd.classList.toggle('open');
    document.getElementById('notifDropdown').classList.remove('open');
    document.getElementById('searchDropdown').classList.remove('open');
  };
  window.dsToggleSearch = function() {
    var dropdown = document.getElementById('searchDropdown');
    var chevron = document.getElementById('search-chevron');
    dropdown.classList.toggle('open');
    chevron.style.transform = dropdown.classList.contains('open') ? 'rotate(180deg)' : '';
    document.getElementById('notifDropdown').classList.remove('open');
    var dd = document.getElementById('user-dropdown'); if(dd) dd.classList.remove('open');
  };
  window.dsSignOut = async function() {
    try { await db.auth.signOut(); } catch(e) {}
    localStorage.removeItem('ds_accent_hex');
    window.location.href = 'index.html';
  };

  /* Close dropdowns on outside click */
  document.addEventListener('click', function(e) {
    var inNav = e.target.closest('.notif-wrap, .user-nav-wrap, .search-dropdown-wrap, .dm-wrap');
    if (!inNav) {
      document.getElementById('notifDropdown').classList.remove('open');
      document.getElementById('searchDropdown').classList.remove('open');
      var dd = document.getElementById('user-dropdown'); if(dd) dd.classList.remove('open');
    }
  });

  /* ── NOTIFICATION HELPERS ────────────────────────────────────── */
  function dsGetClearedIds(tab) {
    try {
      var saved = localStorage.getItem('ds_notif_cleared_' + tab);
      if (!saved) return {};
      var arr = JSON.parse(saved); var map = {};
      arr.forEach(function(id){ map[id]=true; });
      return map;
    } catch(e){ return {}; }
  }
  window.dsMarkAllRead = function(tab) {
    var feed = document.getElementById('notif-feed-' + tab);
    if (!feed) return;
    var cleared = dsGetClearedIds(tab);
    feed.querySelectorAll('.notif-item[data-id]').forEach(function(item){ cleared[item.dataset.id]=true; });
    localStorage.setItem('ds_notif_cleared_' + tab, JSON.stringify(Object.keys(cleared)));
    feed.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-checks"></i> All caught up!</div>';
    var tabBtn = document.getElementById('notif-tab-' + tab);
    if(tabBtn){ var b=tabBtn.querySelector('.notif-tab-badge'); if(b) b.remove(); }
  };

  /* ── SEARCH ──────────────────────────────────────────────────── */
  var dsSearchTimers = {};
  window.dsGoSearch = function(type) {
    var inputMap = { titles:'srch-titles', authors:'srch-authors', artwork:'srch-artwork', artists:'srch-artists' };
    var q = (document.getElementById(inputMap[type])||{}).value || '';
    if(q.trim()) window.location.href = 'search.html?q='+encodeURIComponent(q.trim())+'&tab='+type;
  };
  ['titles','authors','artwork','artists'].forEach(function(type) {
    var inputMap = { titles:'srch-titles', authors:'srch-authors', artwork:'srch-artwork', artists:'srch-artists' };
    var previewMap = { titles:'srch-preview-titles', authors:'srch-preview-authors', artwork:'srch-preview-artwork', artists:'srch-preview-artists' };
    document.addEventListener('DOMContentLoaded', function(){
      var inp = document.getElementById(inputMap[type]);
      if (!inp) return;
      inp.addEventListener('keydown', function(e){ if(e.key==='Enter') dsGoSearch(type); });
      inp.addEventListener('input', function(){
        clearTimeout(dsSearchTimers[type]);
        var q = inp.value.trim();
        var preview = document.getElementById(previewMap[type]);
        if (!q) { if(preview){ preview.innerHTML=''; preview.classList.remove('visible'); } return; }
        dsSearchTimers[type] = setTimeout(async function(){
          if (!preview) return;
          preview.innerHTML = '<div class="search-preview-spinner"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;"></i></div>';
          preview.classList.add('visible');
          try {
            var res;
            if (type === 'titles') {
              res = await db.from('works').select('id,title,cover_url,author_id').eq('type','novel').eq('is_published',true).ilike('title','%'+q+'%').limit(4);
            } else if (type === 'authors') {
              res = await db.from('profiles').select('id,username,display_name,avatar_url').ilike('display_name','%'+q+'%').limit(4);
            } else if (type === 'artwork') {
              res = await db.from('works').select('id,title,cover_url,author_id').eq('type','artwork').eq('is_published',true).ilike('title','%'+q+'%').limit(4);
            } else {
              res = await db.from('profiles').select('id,username,display_name,avatar_url').ilike('display_name','%'+q+'%').limit(4);
            }
            var items = res.data || [];
            if (!items.length) { preview.innerHTML='<div style="padding:8px 10px;font-size:12px;color:var(--text3);">No results</div>'; return; }
            preview.innerHTML = '';
            items.forEach(function(item){
              var a = document.createElement('a');
              a.className = 'search-preview-item';
              var isWork = !!item.title;
              a.href = isWork ? (type==='titles'?'story.html?id=':'artwork.html?id=')+item.id : 'profile.html?user='+(item.username||'');
              var coverHtml = (isWork && item.cover_url)
                ? '<img src="'+dsEsc(item.cover_url)+'" style="width:100%;height:100%;object-fit:cover;"/>'
                : ((!isWork && item.avatar_url) ? '<img src="'+dsEsc(item.avatar_url)+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>' : dsEsc((item.title||item.display_name||'?').charAt(0).toUpperCase()));
              a.innerHTML = '<div class="search-preview-cover '+dsCoverColor(item.id)+'">'+coverHtml+'</div>'
                + '<div class="search-preview-info"><div class="search-preview-title">'+dsEsc(item.title||item.display_name||'Unknown')+'</div></div>';
              preview.appendChild(a);
            });
          } catch(e){ preview.innerHTML=''; preview.classList.remove('visible'); }
        }, 300);
      });
    });
  });

  /* ── DM BADGE ────────────────────────────────────────────────── */
  async function dsLoadDmBadge(uid) {
    var unreadRes = await db.from('messages').select('id').is('read_at',null).neq('sender_id',uid);
    var count = (unreadRes.data||[]).length;
    var btn = document.getElementById('dm-btn');
    var badge = document.getElementById('dm-badge');
    if(!btn||!badge) return;
    if(count>0){ badge.textContent=Math.min(count,99); badge.style.display='flex'; btn.classList.add('has-unread'); }
    else { badge.style.display='none'; btn.classList.remove('has-unread'); }
  }

  /* ── NOTIFICATIONS ───────────────────────────────────────────── */
  async function dsLoadNotifications(uid) {
    var followedWorks = await db.from('work_follows').select('work_id').eq('user_id',uid);
    var workIds = (followedWorks.data||[]).map(function(r){return r.work_id;});
    var novelNotifs = [];
    if(workIds.length){
      var chapRes = await db.from('chapters').select('id,chapter_number,title,created_at,work_id').in('work_id',workIds).order('created_at',{ascending:false}).limit(8);
      novelNotifs = chapRes.data||[];
      if(novelNotifs.length){
        var cwIds=[...new Set(novelNotifs.map(function(c){return c.work_id;}))];
        var {data:cwData}=await db.from('works').select('id,title,cover_url').in('id',cwIds);
        var cwMap={};(cwData||[]).forEach(function(w){cwMap[w.id]=w;});
        novelNotifs.forEach(function(ch){ch.works=cwMap[ch.work_id]||null;});
      }
    }
    var novelFeed = document.getElementById('notif-feed-novels');
    var clearedN = dsGetClearedIds('novels');
    var unrN = novelNotifs.filter(function(c){return !clearedN[c.id];});
    if(!unrN.length){ novelFeed.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">No new chapters from followed stories.</div>'; }
    else {
      novelFeed.innerHTML='';
      unrN.forEach(function(ch){
        var work=ch.works; var title=work?work.title:'Unknown';
        var chLabel=ch.title?'Chapter '+ch.chapter_number+' — "'+ch.title+'"':'Chapter '+ch.chapter_number;
        var item=document.createElement('div'); item.className='notif-item unread'; item.dataset.id=ch.id; item.style.cursor='pointer';
        item.onclick=function(){if(work) window.location.href='story.html?id='+work.id;};
        var coverHtml = work && work.cover_url
          ? '<img src="'+dsEsc(work.cover_url)+'" style="width:100%;height:100%;object-fit:cover;" alt=""/>'
          : dsEsc(dsCoverLetter(title));
        var coverClass = work && work.cover_url ? '' : dsCoverColor(ch.work_id);
        item.innerHTML='<div class="notif-cover '+coverClass+'" style="overflow:hidden;padding:0;">'+coverHtml+'</div>'
          +'<div class="notif-body"><div class="notif-title">'+dsEsc(title)+'</div><div class="notif-text">'+dsEsc(chLabel)+' is now available</div>'
          +'<div class="notif-time"><i class="ti ti-clock"></i> '+dsTimeAgo(ch.created_at)+'</div></div><div class="notif-dot"></div>';
        novelFeed.appendChild(item);
      });
    }

    var followedUsers = await db.from('follows').select('following_id').eq('follower_id',uid);
    var followedIds = (followedUsers.data||[]).map(function(r){return r.following_id;});
    var artistNotifs = [];
    if(followedIds.length){
      var artRes = await db.from('works').select('id,title,type,created_at,author_id,cover_url').eq('type','artwork').in('author_id',followedIds).order('created_at',{ascending:false}).limit(8);
      artistNotifs = artRes.data||[];
      if(artistNotifs.length){
        var aaIds=[...new Set(artistNotifs.map(function(w){return w.author_id;}))];
        var {data:aaProfs}=await db.from('profiles').select('id,username,display_name,avatar_url').in('id',aaIds);
        var aaPMap={};(aaProfs||[]).forEach(function(p){aaPMap[p.id]=p;});
        artistNotifs.forEach(function(w){w.profiles=aaPMap[w.author_id]||null;});
      }
    }
    var artistFeed = document.getElementById('notif-feed-artists');
    var clearedA = dsGetClearedIds('artists');
    var unrA = artistNotifs.filter(function(w){return !clearedA[w.id];});

    // Prepend friend requests to artist feed
    try {
      var frRes2 = await db.from('friendships').select('id,requester_id,created_at').eq('recipient_id',uid).eq('status','pending').order('created_at',{ascending:false});
      var frRows2 = frRes2.data||[];
      if(frRows2.length){
        var frIds2=frRows2.map(function(r){return r.requester_id;});
        var {data:frProfs2}=await db.from('profiles').select('id,username,display_name,avatar_url').in('id',frIds2);
        var frPMap2={};(frProfs2||[]).forEach(function(p){frPMap2[p.id]=p;});
        artistFeed.innerHTML='';
        frRows2.forEach(function(fr){
          var p=frPMap2[fr.requester_id]||{}; var name=p.display_name||p.username||'Someone';
          var avH=p.avatar_url?'<img src="'+p.avatar_url+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>':name.charAt(0).toUpperCase();
          var el=document.createElement('div');
          el.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);margin-bottom:4px;';
          el.innerHTML='<div style="width:28px;height:28px;border-radius:50%;background:var(--bg4);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text2);">'+avH+'</div>'
            +'<div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:700;color:#f59e0b;">'+dsEsc(name)+' sent you a friend request</div></div>'
            +'<a href="friends.html" style="font-size:11px;font-weight:700;color:#f59e0b;text-decoration:none;border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:3px 8px;">View</a>';
          artistFeed.appendChild(el);
        });
      } else { artistFeed.innerHTML=''; }
    } catch(e){ artistFeed.innerHTML=''; }

    if(!unrA.length && artistFeed.children.length === 0){ artistFeed.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">No new art from followed artists.</div>'; }
    else {
      unrA.forEach(function(work){
        var prof=work.profiles; var name=prof?(prof.display_name||prof.username||'Unknown'):'Unknown';
        var avHtml = work.cover_url
          ? '<img src="'+dsEsc(work.cover_url)+'" style="width:100%;height:100%;object-fit:cover;" alt=""/>'
          : prof&&prof.avatar_url ? '<img src="'+dsEsc(prof.avatar_url)+'" style="width:100%;height:100%;object-fit:cover;" alt=""/>' : dsEsc(name.charAt(0).toUpperCase());
        var coverClass = work.cover_url ? '' : dsCoverColor(work.author_id);
        var item=document.createElement('div'); item.className='notif-item unread'; item.dataset.id=work.id; item.style.cursor='pointer';
        item.onclick=function(){window.location.href='artwork.html?id='+work.id;};
        item.innerHTML='<div class="notif-cover '+coverClass+'" style="overflow:hidden;padding:0;">'+avHtml+'</div>'
          +'<div class="notif-body"><div class="notif-title">'+dsEsc(name)+'</div><div class="notif-text">Posted — "'+dsEsc(work.title)+'"</div>'
          +'<div class="notif-time"><i class="ti ti-clock"></i> '+dsTimeAgo(work.created_at)+'</div></div><div class="notif-dot"></div>';
        artistFeed.appendChild(item);
      });
    }

    var myWorks=await db.from('works').select('id,title,type,cover_url').eq('author_id',uid);
    var myWorkRows=myWorks.data||[];
    var myNovelIds=myWorkRows.filter(function(w){return w.type!=='artwork';}).map(function(w){return w.id;});
    var myArtworkIds=myWorkRows.filter(function(w){return w.type==='artwork';}).map(function(w){return w.id;});
    var myWorkTitleMap={};myWorkRows.forEach(function(w){myWorkTitleMap[w.id]=w;});
    var commentNotifs=[];
    if(myNovelIds.length){
      var ownerChapRes=await db.from('chapters').select('id,work_id').in('work_id',myNovelIds);
      var ownerChapIds=(ownerChapRes.data||[]).map(function(c){return c.id;});
      var chapWorkMap={};(ownerChapRes.data||[]).forEach(function(c){chapWorkMap[c.id]=c.work_id;});
      if(ownerChapIds.length){
        var ncRes=await db.from('chapter_comments').select('id,content,created_at,chapter_id,user_id,parent_id').in('chapter_id',ownerChapIds).neq('user_id',uid).order('created_at',{ascending:false}).limit(20);
        (ncRes.data||[]).filter(function(c){return !c.parent_id;}).forEach(function(c){c.work_id=chapWorkMap[c.chapter_id]||null;c._type='novel';commentNotifs.push(c);});
        // Also fetch paragraph_comments (deep-link to paragraph panel)
        var prRes=await db.from('paragraph_comments').select('id,content,created_at,chapter_id,user_id,parent_id,paragraph_index').in('chapter_id',ownerChapIds).neq('user_id',uid).order('created_at',{ascending:false}).limit(20);
        (prRes.data||[]).filter(function(c){return !c.parent_id;}).forEach(function(c){c.work_id=chapWorkMap[c.chapter_id]||null;c._type='para';commentNotifs.push(c);});
      }
    }
    if(myArtworkIds.length){
      var acRes2=await db.from('artwork_comments').select('id,content,created_at,work_id,user_id,parent_id').in('work_id',myArtworkIds).neq('user_id',uid).order('created_at',{ascending:false}).limit(20);
      (acRes2.data||[]).filter(function(c){return !c.parent_id;}).forEach(function(c){c._type='artwork';commentNotifs.push(c);});
    }
    commentNotifs.sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);});
    commentNotifs=commentNotifs.slice(0,8);
    if(commentNotifs.length){
      var cmtUserIds=[...new Set(commentNotifs.map(function(c){return c.user_id;}))];
      var {data:cmtProfs}=await db.from('profiles').select('id,username,display_name,avatar_url').in('id',cmtUserIds);
      var cmtProfMap={};(cmtProfs||[]).forEach(function(p){cmtProfMap[p.id]=p;});
      commentNotifs.forEach(function(cm){cm.profiles=cmtProfMap[cm.user_id]||null;cm.works=myWorkTitleMap[cm.work_id]||null;});
    }
    var commentFeed=document.getElementById('notif-feed-comments');
    var clearedC=dsGetClearedIds('comments');
    var unrC=commentNotifs.filter(function(cm){return !clearedC[cm.id];});
    if(!unrC.length){ commentFeed.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">No new comments on your works.</div>'; }
    else {
      commentFeed.innerHTML='';
      unrC.forEach(function(cm){
        var prof=cm.profiles; var work=cm.works;
        var name=prof?(prof.display_name||prof.username||'Someone'):'Someone';
        var workTitle=work?work.title:'your work';
        var item=document.createElement('div'); item.className='notif-item unread'; item.dataset.id=cm.id; item.style.cursor='pointer';
        item.onclick=function(){
          if(!cm.work_id) return;
          if(cm._type==='artwork') { window.location.href='artwork.html?id='+cm.work_id; }
          else if(cm._type==='para' && cm.chapter_id) {
            var _destUrl = 'chapter.html?id='+cm.chapter_id;
            var _alreadyThere = window.location.href.includes(cm.chapter_id);
            if (_alreadyThere) {
              if (typeof spOpen === 'function') {
                spOpen('comments');
                setTimeout(function() {
                  var el = document.getElementById('sp-comment-'+cm.id);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  var paraEl = document.querySelector('[data-para-idx="'+cm.paragraph_index+'"]');
                  if (paraEl) paraEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 400);
              }
            } else {
              sessionStorage.setItem('ds_open_para', cm.paragraph_index);
              sessionStorage.setItem('ds_open_comment', cm.id);
              var _pname = prof ? (prof.display_name || prof.username || '') : '';
              if (_pname) sessionStorage.setItem('ds_open_name', _pname);
              window.location.href = _destUrl;
            }
          }
          else { window.location.href='chapter.html?id='+cm.chapter_id; }
        };
        var avHtml2 = work && work.cover_url
          ? '<img src="'+dsEsc(work.cover_url)+'" style="width:100%;height:100%;object-fit:cover;" alt=""/>'
          : prof&&prof.avatar_url ? '<img src="'+dsEsc(prof.avatar_url)+'" style="width:100%;height:100%;object-fit:cover;" alt=""/>' : dsEsc(name.charAt(0).toUpperCase());
        var coverClass2 = work && work.cover_url ? '' : dsCoverColor(cm.user_id||cm.id);
        item.innerHTML='<div class="notif-cover '+coverClass2+'" style="overflow:hidden;padding:0;">'+avHtml2+'</div>'
          +'<div class="notif-body"><div class="notif-title">'+dsEsc(name)+(cm._type==='para'?' commented on a paragraph in ':' commented on ')+dsEsc(workTitle)+'</div>'
          +'<div class="notif-text">"'+dsEsc((cm.content||'').slice(0,70))+(cm.content&&cm.content.length>70?'...':'')+'"</div>'
          +'<div class="notif-time"><i class="ti ti-clock"></i> '+dsTimeAgo(cm.created_at)+'</div></div><div class="notif-dot"></div>';
        commentFeed.appendChild(item);
      });
    }

    // Badge counts
    var unreadN=unrN.length, unreadA=unrA.length, unreadC=unrC.length;
    var total=unreadN+unreadA+unreadC;
    var badge=document.getElementById('ds-notif-badge');
    if(badge){ if(total>0){badge.textContent=Math.min(total,99);badge.style.display='flex';}else{badge.style.display='none';} }
    function setTabBadge(tabId,count){var btn=document.getElementById(tabId);if(!btn)return;var ex=btn.querySelector('.notif-tab-badge');if(ex)ex.remove();if(count>0){var b=document.createElement('span');b.className='notif-tab-badge';b.textContent=Math.min(count,99);btn.appendChild(b);}}
    setTabBadge('notif-tab-novels',unreadN);
    setTabBadge('notif-tab-artists',unreadA);
    setTabBadge('notif-tab-comments',unreadC);
  }

  /* ── AUTH INIT ───────────────────────────────────────────────── */
  function dsWaitForDb(cb, tries) {
    tries = tries || 0;
    if (typeof db !== 'undefined') { cb(); return; }
    if (tries > 40) { console.warn('DS nav: db not found'); return; }
    setTimeout(function(){ dsWaitForDb(cb, tries + 1); }, 75);
  }

  dsWaitForDb(function(){
  (async function dsInitUserNav() {
    try {
      var session = (await db.auth.getSession()).data.session;
      if (!session) return;
      var loginBtn = document.getElementById('nav-login-btn');
      if(loginBtn) loginBtn.style.display = 'none';
      var userWrap = document.getElementById('user-nav-wrap');
      if(userWrap) userWrap.style.display = 'flex';
      var avatarBtn = document.getElementById('user-avatar-btn');

      // Load ember balance
      var emberWrap = document.getElementById('ember-wrap');
      if (emberWrap) {
        emberWrap.style.display = 'flex';
        try {
          var emberRes = await db.from('user_embers').select('balance').eq('user_id', session.user.id).maybeSingle();
          var balance = (emberRes.data && emberRes.data.balance) || 0;
          document.getElementById('ds-ember-count').textContent = balance.toLocaleString();
        } catch(e) {}
      }

      // Load Quill balance. The Quills system (real-money currency,
      // purchased to support creators) isn't built yet — this shows
      // 0 as a placeholder until a user_quills table/RPC exists, at
      // which point swap this query for the real one.
      var quillWrap = document.getElementById('quill-wrap');
      if (quillWrap) {
        quillWrap.style.display = 'flex';
        try {
          var quillRes = await db.from('user_quills').select('balance').eq('user_id', session.user.id).maybeSingle();
          var quillBalance = (quillRes.data && quillRes.data.balance) || 0;
          document.getElementById('ds-quill-count').textContent = quillBalance.toLocaleString();
        } catch(e) {
          document.getElementById('ds-quill-count').textContent = '0';
        }
      }

      var meta = session.user.user_metadata || {};
      var username = meta.username || null;
      var displayName = meta.display_name || username || session.user.email.split('@')[0];
      document.getElementById('dd-display-name').textContent = displayName;
      document.getElementById('dd-handle').textContent = username ? '@'+username : session.user.email;
      document.getElementById('user-avatar-initial').textContent = displayName.charAt(0).toUpperCase();
      if(username) document.getElementById('dd-profile-link').href = 'profile.html?user='+username;

      // Always fetch profile by uid — metadata may be missing/stale
      var res = await db.from('profiles').select('avatar_url,display_name,username,id').eq('id',session.user.id).maybeSingle();
      if(res && !res.error && res.data && !username){
        username = res.data.username;
        if(username){
          document.getElementById('dd-handle').textContent = '@'+username;
          document.getElementById('dd-profile-link').href = 'profile.html?user='+username;
        }
      }

      // Apply user's saved accent color sitewide
      // Cache in localStorage so it applies instantly on next page load with no DB wait.
      var accentRes = await db.from('user_avatars').select('accent_color').eq('user_id', session.user.id).maybeSingle();
      if (accentRes.data && accentRes.data.accent_color && accentRes.data.accent_color.hex) {
        var ac = accentRes.data.accent_color;
        var hex = ac.hex;
        localStorage.setItem('ds_accent_hex', hex);
        dsApplyAccent(hex);
      } else {
        // No custom accent — cache the default teal so it loads instantly on all pages
        // without waiting for the session/DB fetch to complete.
        var defaultAccent = '#2dd4bf';
        localStorage.setItem('ds_accent_hex', defaultAccent);
        dsApplyAccent(defaultAccent);
      }

      // Run pending check for ALL logged-in users sitewide using session.user.id
      (async function() {
        var uid2 = session.user.id;
        var pendingParts = [];
        try {
          var myArtworks2 = await db.from('works').select('id').eq('author_id',uid2).eq('type','artwork');
          var artIds2 = (myArtworks2.data||[]).map(function(w){return w.id;});
          if(artIds2.length){
            var acRes2=await db.from('artwork_collabs').select('id').in('artwork_id',artIds2).eq('status','pending');
            var acCount2=(acRes2.data||[]).length; if(acCount2>0) pendingParts.push(acCount2+' story collab'+(acCount2>1?'s':''));
          }
          var myNovels2 = await db.from('works').select('id').eq('author_id',uid2).eq('type','novel');
          var novIds2 = (myNovels2.data||[]).map(function(w){return w.id;});
          if(novIds2.length){
            var scRes2=await db.from('story_collabs').select('id').in('work_id',novIds2).eq('status','pending');
            var scCount2=(scRes2.data||[]).length; if(scCount2>0) pendingParts.push(scCount2+' fan art'+(scCount2>1?'s':''));
            var songRes2=await db.from('character_song_suggestions').select('id').in('work_id',novIds2).eq('status','pending');
            var songCount2=(songRes2.data||[]).length; if(songCount2>0) pendingParts.push(songCount2+' song suggestion'+(songCount2>1?'s':''));
          }
          var frRes2=await db.from('friendships').select('id').eq('recipient_id',uid2).eq('status','pending');
          var frCount2=(frRes2.data||[]).length; if(frCount2>0) pendingParts.push(frCount2+' friend request'+(frCount2>1?'s':''));
          var collabParts2 = pendingParts.filter(function(p){ return p.indexOf('friend') === -1; });
          var friendParts2 = pendingParts.filter(function(p){ return p.indexOf('friend') !== -1; });
          if(pendingParts.length>0) avatarBtn.classList.add('has-pending');
          if(collabParts2.length>0){
            var pl2=document.getElementById('dd-profile-link');
            if(pl2) pl2.innerHTML='<i class="ti ti-user"></i> My Profile <span class="collab-pending-pill">'+collabParts2.join(' · ')+'</span>';
          }
          if(friendParts2.length>0){
            var fl2=document.getElementById('dd-friends-link');
            if(fl2) fl2.innerHTML='<i class="ti ti-users"></i> Friends <span class="collab-pending-pill">'+friendParts2.join(' · ')+'</span>';
          }
        } catch(e) {}
      })();

      if(username){
        var res = await db.from('profiles').select('avatar_url,display_name,id').eq('username',username).maybeSingle();
        if(res && !res.error && res.data){
          if(res.data.display_name){
            document.getElementById('dd-display-name').textContent = res.data.display_name;
            document.getElementById('user-avatar-initial').textContent = res.data.display_name.charAt(0).toUpperCase();
          }
          if(res.data.avatar_url){
            avatarBtn.innerHTML = '<img src="'+res.data.avatar_url+'" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>';
          }
          var uid2 = res.data.id || session.user.id;
          var pendingParts = [];
          var myArtworks = await db.from('works').select('id').eq('author_id',uid2).eq('type','artwork');
          var artIds = (myArtworks.data||[]).map(function(w){return w.id;});
          if(artIds.length){
            var acRes3=await db.from('artwork_collabs').select('id').in('artwork_id',artIds).eq('status','pending');
            var acCount=(acRes3.data||[]).length; if(acCount>0) pendingParts.push(acCount+' story collab'+(acCount>1?'s':''));
          }
          var myNovels = await db.from('works').select('id').eq('author_id',uid2).eq('type','novel');
          var novIds = (myNovels.data||[]).map(function(w){return w.id;});
          if(novIds.length){
            var scRes3=await db.from('story_collabs').select('id').in('work_id',novIds).eq('status','pending');
            var scCount=(scRes3.data||[]).length; if(scCount>0) pendingParts.push(scCount+' fan art'+(scCount>1?'s':''));
          }
          var frRes3=await db.from('friendships').select('id').eq('recipient_id',uid2).eq('status','pending');
          var frCount=(frRes3.data||[]).length; if(frCount>0) pendingParts.push(frCount+' friend request'+(frCount>1?'s':''));
          // Song suggestions pending
          var myWorkIds3=(await db.from('works').select('id').eq('author_id',uid2)).data||[];
          var mwids3=myWorkIds3.map(function(w){return w.id;});
          if(mwids3.length){
            var songRes3=await db.from('character_song_suggestions').select('id').in('work_id',mwids3).eq('status','pending');
            var songCount3=(songRes3.data||[]).length; if(songCount3>0) pendingParts.push(songCount3+' song suggestion'+(songCount3>1?'s':''));
          }
          // Collab pending → My Profile pill
          var collabParts = pendingParts.filter(function(p){ return p.indexOf('friend') === -1; });
          var friendParts = pendingParts.filter(function(p){ return p.indexOf('friend') !== -1; });
          if(pendingParts.length>0) avatarBtn.classList.add('has-pending');
          if(collabParts.length>0){
            var pl=document.getElementById('dd-profile-link');
            if(pl) pl.innerHTML='<i class="ti ti-user"></i> My Profile <span class="collab-pending-pill">'+collabParts.join(' · ')+'</span>';
          }
          if(friendParts.length>0){
            var fl=document.getElementById('dd-friends-link');
            if(fl) fl.innerHTML='<i class="ti ti-users"></i> Friends <span class="collab-pending-pill">'+friendParts.join(' · ')+'</span>';
          }
          await dsLoadNotifications(uid2);
          await dsLoadDmBadge(uid2);
        }
      }
      // Admin link
      if(session.user.id==='516db718-edd5-4856-9281-2df642d006f5'){
        var menu=document.querySelector('.user-dropdown-menu');
        if(menu){
          var div2=document.createElement('div'); div2.className='user-dropdown-divider';
          var adminLink=document.createElement('a'); adminLink.className='user-dropdown-item'; adminLink.href='WhiteRoomUnbreakable.html';
          adminLink.innerHTML='<i class="ti ti-shield" style="color:#f59e0b;"></i> <span style="color:#f59e0b;">Admin Panel</span>';
          var signOutBtn=menu.querySelector('.signout-btn');
          menu.insertBefore(div2,signOutBtn); menu.insertBefore(adminLink,signOutBtn);
        }
      }
    } catch(err){ console.warn('DS nav:', err); }
  })();

  // Live-update ember count when embers are awarded elsewhere on the page
  window.addEventListener('ds-embers-awarded', function(e){
    var el = document.getElementById('ds-ember-count');
    if (!el) return;
    var current = parseInt((el.textContent||'0').replace(/,/g,'')) || 0;
    el.textContent = (current + (e.detail.amount||0)).toLocaleString();
    el.parentElement.style.transform = 'scale(1.15)';
    setTimeout(function(){ el.parentElement.style.transform = 'scale(1)'; }, 200);
  });
  }); // dsWaitForDb

})();
