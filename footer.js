/* ── DAWNSCRIBE SHARED FOOTER ──────────────────────────────────────
   Include on every page just before </body>.
   Replaces existing <footer> if present, otherwise appends one.
──────────────────────────────────────────────────────────────────── */
(function () {
  var css = `
    .ds-footer{background:var(--bg2);border-top:1px solid var(--border);padding:40px 32px 32px;text-align:center;color:var(--text3);font-size:13px;margin-top:60px;font-family:'Lato',sans-serif;}
    .ds-footer-logo{font-family:'Cinzel',serif;font-size:22px;font-weight:700;color:var(--accent);letter-spacing:1px;margin-bottom:6px;}
    .ds-footer-tagline{color:var(--text3);font-size:13px;margin-bottom:20px;}
    .ds-footer-links{display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:20px;}
    .ds-footer-link{color:var(--text3);text-decoration:none;font-size:12px;font-weight:600;padding:4px 2px;transition:color 0.2s;}
    .ds-footer-link:hover{color:var(--accent);}
    .ds-footer-sep{color:var(--border);font-size:12px;user-select:none;}
    .ds-footer-copy{font-size:11px;color:var(--text3);opacity:0.6;}
  `;
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  var year = new Date().getFullYear();
  var html = `
    <div class="ds-footer-logo">DawnScribe</div>
    <div class="ds-footer-tagline">A home for stories, art, and the people who love them.</div>
    <div class="ds-footer-links">
      <a href="index.html" class="ds-footer-link">Home</a><span class="ds-footer-sep">·</span>
      <a href="about.html" class="ds-footer-link">About</a><span class="ds-footer-sep">·</span>
      <a href="terms.html" class="ds-footer-link">Terms of Service</a><span class="ds-footer-sep">·</span>
      <a href="privacy.html" class="ds-footer-link">Privacy Policy</a><span class="ds-footer-sep">·</span>
      <a href="terms.html#dmca" class="ds-footer-link">DMCA</a><span class="ds-footer-sep">·</span>
      <a href="guidelines.html" class="ds-footer-link">Community Guidelines</a><span class="ds-footer-sep">·</span>
      <a href="contact.html" class="ds-footer-link">Contact</a>
    </div>
    <div class="ds-footer-copy">&copy; ${year} DawnScribe. All rights reserved.</div>
  `;
  // Skip on full-height app pages where a footer would break the layout
  var noFooterPages = ['messages.html'];
  var currentPage = window.location.pathname.split('/').pop();
  if (noFooterPages.indexOf(currentPage) !== -1) return;

  var existing = document.querySelector('footer');
  if (existing) { existing.removeAttribute('style'); existing.className = 'ds-footer'; existing.innerHTML = html; }
  else { var f = document.createElement('footer'); f.className = 'ds-footer'; f.innerHTML = html; document.body.appendChild(f); }
})();
