/* contentWarnings.js — DawnScribe shared content-warning handling (window.DSWarn)
 *
 * WHY THIS EXISTS
 * Content warnings were tagged on works and filterable in Settings, but the
 * filter was only ever applied on browse.html, search.html and most (not all)
 * of index.html's rows. An audit found:
 *   story.html    gate fired ONLY on gore/erotica. A work tagged
 *                 "Self-Harm / Suicide" with clean ratings loaded with no
 *                 interception even when the reader had filtered it.
 *   artwork.html  no gate of any kind, and warnings never displayed.
 *   chapter.html  warnings never displayed.
 *   following / profile / rising / activity   no warning filter at all.
 *   index.html    rows 0 and 1, the activity sidebar feeds, and the realtime
 *                 prepend handlers all bypassed the filter.
 *
 * Discovery-side filtering is NOT sufficient on its own: story and artwork
 * links arrive from profiles, DMs, bookmarks, search engines and off-site.
 * The destination page is the only place the reader's opt-out can actually
 * be honoured. That is what gate() is for.
 *
 * POLICY (Fran's call, session 42)
 *   story.html, artwork.html ...... GATE   (full-screen interstitial)
 *   chapter.html .................. BANNER (dismissible strip; chapter links
 *                                   are mid-read navigation, so gating every
 *                                   chapter would punish normal reading)
 *   library / continue-reading / reading-history ... NOT filtered. Your own
 *                                   shelf is yours; the destination gate still
 *                                   fires when you open the work, so nothing
 *                                   disappears without explanation and nothing
 *                                   surprises you either.
 *
 * SEMANTICS
 *   filtered_content_warnings is an opt-OUT list: a warning present in the
 *   list means "do not show me this". Empty list (the default) = no filtering.
 *   Guests have no list, so nothing is filtered for them — matching how the
 *   mature gate already treats guests as never having opted in.
 *
 * AUTHORS AND COAUTHORS ARE EXEMPT. You are never gated out of your own work.
 *
 * INDEPENDENT OF THE MATURE GATE
 *   story.html's existing gore/erotica gate uses sessionStorage key
 *   'ds_cw_ok_<id>'. This module uses 'ds_cwwarn_ok_<id>'. They are deliberately
 *   separate keys — accepting one must not silently accept the other, and the
 *   two gates answer different questions.
 *
 * NOTE ON THE COLUMN
 *   works.content_warnings is NOT NULL DEFAULT '[]'::jsonb. Keep it that way.
 *   If it ever becomes nullable, the PostgREST pattern used by browse/search
 *   (.not('content_warnings','cs',...)) breaks catastrophically: in SQL
 *   NOT (NULL @> x) evaluates to NULL, so every untagged work would be
 *   silently hidden the moment a reader filtered anything.
 */
(function () {
  'use strict';

  var filtered = [];      // the viewer's opt-out list
  var loaded = false;     // init() has completed at least once

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function warningsOf(work) {
    if (!work) return [];
    var w = work.content_warnings;
    // Tolerate a JSON string as well as a parsed array — publish.html writes
    // JSON.stringify(...) into a jsonb column, and some callers hand us rows
    // that came back through paths that did not parse it.
    if (typeof w === 'string') { try { w = JSON.parse(w); } catch (e) { return []; } }
    return Array.isArray(w) ? w : [];
  }

  /* Loads the viewer's opt-out list. Safe to call more than once and safe to
   * call for a signed-out viewer. Never throws — a failed load degrades to
   * "filter nothing" rather than breaking the page it is called from. */
  async function init(db) {
    try {
      if (!db || !db.rpc) { loaded = true; return filtered; }
      var r = await db.rpc('get_my_private_profile');
      var rows = (r && !r.error) ? r.data : null;
      var row = (rows && rows.length) ? rows[0] : null;
      var list = row ? row.filtered_content_warnings : null;
      if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { list = null; } }
      filtered = Array.isArray(list) ? list : [];
    } catch (e) {
      filtered = [];
    }
    loaded = true;
    return filtered;
  }

  function active() { return filtered.slice(); }
  function isReady() { return loaded; }

  /* Which of this work's warnings the viewer has opted out of. */
  function matched(work) {
    if (!filtered.length) return [];
    var mine = filtered;
    return warningsOf(work).filter(function (cw) { return mine.indexOf(cw) !== -1; });
  }

  function isBlocked(work) { return matched(work).length > 0; }

  /* List-page filter. Pass viewerId to keep the viewer's own works visible,
   * and exemptIds (a Set or Array) for collabs they are part of. */
  function filterItems(items, viewerId, exemptIds) {
    if (!filtered.length) return items || [];
    var has = function (id) {
      if (!exemptIds) return false;
      return exemptIds.has ? exemptIds.has(id) : exemptIds.indexOf(id) !== -1;
    };
    return (items || []).filter(function (w) {
      if (!w) return false;
      if (viewerId && w.author_id === viewerId) return true;
      if (has(w.id)) return true;
      return !isBlocked(w);
    });
  }

  function joinLabels(list) {
    var safe = list.map(esc);
    if (safe.length === 1) return '<b>' + safe[0] + '</b>';
    if (safe.length === 2) return '<b>' + safe[0] + '</b> and <b>' + safe[1] + '</b>';
    return '<b>' + safe.slice(0, -1).join('</b>, <b>') + '</b> and <b>' + safe[safe.length - 1] + '</b>';
  }

  /* ── GATE ── full-screen interstitial. story.html and artwork.html.
   * opts: { authorIds: [], viewerId: '', backHref: 'index.html' }
   * Returns true if a gate was shown. */
  function gate(work, opts) {
    opts = opts || {};
    if (!work || !work.id) return false;

    var hits = matched(work);
    if (!hits.length) return false;

    // Authors and coauthors are never gated out of their own work.
    var authorIds = opts.authorIds || [];
    if (opts.viewerId && authorIds.indexOf(opts.viewerId) !== -1) return false;
    if (opts.viewerId && work.author_id === opts.viewerId) return false;

    var key = 'ds_cwwarn_ok_' + work.id;
    try { if (sessionStorage.getItem(key)) return false; } catch (e) {}

    // Never stack on top of the mature gate — if that overlay is already up,
    // the reader is answering one question at a time.
    if (document.getElementById('content-gate-overlay')) return false;
    if (document.getElementById('cw-gate-overlay')) return false;

    var backHref = opts.backHref || 'index.html';
    var ov = document.createElement('div');
    ov.id = 'cw-gate-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(8,10,14,0.97);display:flex;align-items:center;justify-content:center;padding:24px;';
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="cw-gate-title" style="max-width:440px;text-align:center;background:var(--card,#14161c);border:1px solid var(--border,#2a2d36);border-radius:16px;padding:36px 32px;">' +
        '<i class="ti ti-flag" aria-hidden="true" style="font-size:40px;color:var(--gold,#f59e0b);display:block;margin-bottom:14px;"></i>' +
        '<div id="cw-gate-title" style="font-family:Cinzel,serif;font-size:19px;font-weight:700;margin-bottom:10px;">Content Warning</div>' +
        '<div style="font-size:13px;color:var(--text2,#b8bcc8);line-height:1.6;">You asked not to be shown ' + joinLabels(hits) + '.<br>This work is tagged with it.</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:24px;flex-wrap:wrap;">' +
          '<button type="button" data-cw-back style="background:none;border:1px solid var(--border,#2a2d36);border-radius:9px;padding:10px 20px;color:var(--text2,#b8bcc8);font-size:13px;font-weight:700;cursor:pointer;font-family:Lato,sans-serif;">Take me back</button>' +
          '<button type="button" data-cw-go style="background:var(--gold,#f59e0b);border:none;border-radius:9px;padding:10px 20px;color:#14161c;font-size:13px;font-weight:700;cursor:pointer;font-family:Lato,sans-serif;">View anyway</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text3,#7a7f8c);margin-top:14px;">You can change this any time in Settings → Content Warnings.</div>' +
      '</div>';

    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';

    ov.querySelector('[data-cw-back]').addEventListener('click', function () {
      if (window.history.length > 1) window.history.back();
      else window.location.href = backHref;
    });
    ov.querySelector('[data-cw-go]').addEventListener('click', function () {
      try { sessionStorage.setItem(key, '1'); } catch (e) {}
      ov.remove();
      document.body.style.overflow = '';
    });

    // Safety net: if the overlay is torn out by any other code path, give the
    // page its scroll back. story.html learned this one the hard way.
    var obs = new MutationObserver(function () {
      if (!document.getElementById('cw-gate-overlay')) {
        document.body.style.overflow = '';
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true });
    return true;
  }

  /* ── BANNER ── dismissible strip. chapter.html.
   * mount: element to insert before, or a container to prepend into. */
  function banner(work, mount) {
    if (!work || !mount) return false;
    var hits = matched(work);
    if (!hits.length) return false;
    if (document.getElementById('cw-banner')) return false;

    var key = 'ds_cwwarn_ok_' + work.id;
    try { if (sessionStorage.getItem(key)) return false; } catch (e) {}

    var el = document.createElement('div');
    el.id = 'cw-banner';
    el.setAttribute('role', 'note');
    el.style.cssText = 'display:flex;align-items:flex-start;gap:10px;background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.35);border-radius:10px;padding:12px 14px;margin:0 0 18px;font-size:13px;line-height:1.55;color:var(--text2,#b8bcc8);';
    el.innerHTML =
      '<i class="ti ti-flag" aria-hidden="true" style="font-size:17px;color:var(--gold,#f59e0b);flex:0 0 auto;margin-top:1px;"></i>' +
      '<div style="flex:1 1 auto;">This chapter\'s story is tagged ' + joinLabels(hits) + ', which you asked not to be shown.</div>' +
      '<button type="button" data-cw-dismiss aria-label="Dismiss content warning" style="background:none;border:none;color:var(--text3,#7a7f8c);cursor:pointer;font-size:17px;line-height:1;padding:0 2px;flex:0 0 auto;">&times;</button>';

    if (mount.parentNode && mount.dataset && mount.dataset.cwInsertBefore === '1') {
      mount.parentNode.insertBefore(el, mount);
    } else {
      mount.insertBefore(el, mount.firstChild);
    }

    el.querySelector('[data-cw-dismiss]').addEventListener('click', function () {
      try { sessionStorage.setItem(key, '1'); } catch (e) {}
      el.remove();
    });
    return true;
  }

  /* Small inline pill for list rows that badge rather than hide (rising.html). */
  function badge(work) {
    var hits = matched(work);
    if (!hits.length) return '';
    return ' <span title="Tagged ' + esc(hits.join(', ')) + ' — which you filtered in Settings" ' +
      'style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:#fbbf24;' +
      'background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.32);border-radius:20px;padding:1px 7px;margin-left:4px;">' +
      '<i class="ti ti-flag" aria-hidden="true" style="font-size:11px;"></i> Content warning</span>';
  }

  window.DSWarn = {
    init: init,
    active: active,
    isReady: isReady,
    warningsOf: warningsOf,
    matched: matched,
    isBlocked: isBlocked,
    filter: filterItems,
    gate: gate,
    banner: banner,
    badge: badge
  };
})();
