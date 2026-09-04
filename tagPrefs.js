/* tagPrefs.js — DawnScribe shared tag-preference handling (window.DSTags)
 *
 * WHY THIS EXISTS
 * Tag preferences (like / block, set in Settings → Tag Preferences) were saved
 * to TWO places — localStorage['ds_tag_prefs'] and profiles.tag_prefs — and
 * every reader read only localStorage. The database column was written and
 * never read by anything. Verified live: blocked tags set in the database with
 * localStorage cleared filtered nothing on index, browse or search. Sign in on
 * a second device, or clear browsing data, and every blocked tag silently
 * stopped applying.
 *
 * The audit also found:
 *   browse.html   applied no tag filter at all.
 *   index.html    matched tags_main only (~3 tags) while search.html matched
 *                 tags_all (~28). Blocking "Military Sci-Fi" hid the work in
 *                 search and on ZERO index rows. Most tags the Settings picker
 *                 offers (Harem, Isekai, Mecha, Reincarnation…) are tags_all
 *                 level, so most of what a reader could block did nothing.
 *   index.html    rows 0 and 1, reading history, continue reading, both
 *                 activity-sidebar feeds and the realtime prepend handlers
 *                 applied nothing.
 *   following / profile / rising / activity   applied nothing.
 *
 * POLICY (Fran's call, session 42)
 *   MATCH ON tags_all. tags_main is a slice of tags_all (publish writes
 *   tags_main = tags.slice(0,3)), so tags_all is a strict superset and the
 *   only field that makes the Settings picker meaningful.
 *
 *   DATABASE IS THE SOURCE OF TRUTH. localStorage is a cache, refreshed on
 *   every successful load and used only as a fallback when the profile read
 *   fails or the viewer is signed out.
 *
 *   HIDE on discovery surfaces (browse, search, index, activity).
 *   BADGE on profile, following and rising — a catalogue or a leaderboard with
 *   holes in it reads as broken rather than as filtered.
 *   Library / continue-reading / reading-history are NOT filtered: your own
 *   shelf is yours, same rule as content warnings.
 *
 *   NO GATE on story or chapter. A blocked tag is a taste preference, not a
 *   safety matter — that is what contentWarnings.js is for.
 *
 * SHAPE
 *   { "Isekai": "liked", "Harem": "blocked" }
 *   Any value other than 'liked' or 'blocked' is ignored. Settings deletes the
 *   key entirely on the third click, so absent = no opinion.
 *
 * NOTE ON tags_all
 *   It is a TEXT column holding a JSON array, not jsonb. Server-side matching
 *   therefore uses ILIKE against the raw text with the quotes included
 *   ('%"Harem"%'), which anchors on the JSON quoting so "Harem" does not match
 *   "Harem Building". Tag names containing % or _ would act as ILIKE wildcards;
 *   escapeLike() below handles that. No current tag contains either.
 */
(function () {
  'use strict';

  var prefs = {};          // { tag: 'liked' | 'blocked' }
  var loaded = false;
  var LS_KEY = 'ds_tag_prefs';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var o = raw ? JSON.parse(raw) : null;
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }

  function writeCache(o) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(o || {})); } catch (e) {}
  }

  /* Database first; localStorage is only a fallback. Never throws — a failed
   * load degrades to the cached value, and an empty cache degrades to "no
   * preferences" rather than breaking the page. */
  async function init(db) {
    var fromDb = null;
    try {
      if (db && db.rpc) {
        var r = await db.rpc('get_my_private_profile');
        var rows = (r && !r.error) ? r.data : null;
        var row = (rows && rows.length) ? rows[0] : null;
        var tp = row ? row.tag_prefs : null;
        if (typeof tp === 'string') { try { tp = JSON.parse(tp); } catch (e) { tp = null; } }
        if (tp && typeof tp === 'object') fromDb = tp;
      }
    } catch (e) { fromDb = null; }

    if (fromDb) {
      prefs = fromDb;
      writeCache(prefs);   // refresh the cache so an offline load stays correct
    } else {
      prefs = readCache();
    }
    loaded = true;
    return prefs;
  }

  function all() { var o = {}; for (var k in prefs) if (prefs.hasOwnProperty(k)) o[k] = prefs[k]; return o; }
  function isReady() { return loaded; }

  function blockedTags() {
    return Object.keys(prefs).filter(function (t) { return prefs[t] === 'blocked'; });
  }
  function likedTags() {
    return Object.keys(prefs).filter(function (t) { return prefs[t] === 'liked'; });
  }

  /* Every tag on a work. tags_all is authoritative; tags_main is its first
   * three entries and is used only when a query did not select tags_all. */
  function tagsOf(work) {
    if (!work) return [];
    var src = (work.tags_all != null) ? work.tags_all : work.tags_main;
    if (Array.isArray(src)) return src;
    if (typeof src === 'string') { try { var a = JSON.parse(src || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    return [];
  }

  function matchedBlocked(work) {
    if (!Object.keys(prefs).length) return [];
    var p = prefs;
    return tagsOf(work).filter(function (t) { return p[t] === 'blocked'; });
  }

  function isBlocked(work) { return matchedBlocked(work).length > 0; }

  function hasLiked(work) {
    var p = prefs;
    return tagsOf(work).some(function (t) { return p[t] === 'liked'; });
  }

  /* Discovery-surface filter: drops blocked works, then floats liked ones to
   * the front. viewerId keeps the viewer's own works visible; exemptIds covers
   * collabs they are part of. Sort is stable-by-construction (partition, not
   * comparator) so the caller's existing ordering survives inside each group. */
  function filterItems(items, viewerId, exemptIds) {
    var list = items || [];
    if (!Object.keys(prefs).length) return list;
    var has = function (id) {
      if (!exemptIds) return false;
      return exemptIds.has ? exemptIds.has(id) : exemptIds.indexOf(id) !== -1;
    };
    var kept = list.filter(function (w) {
      if (!w) return false;
      if (viewerId && w.author_id === viewerId) return true;
      if (has(w.id)) return true;
      return !isBlocked(w);
    });
    var liked = [], rest = [];
    kept.forEach(function (w) { (hasLiked(w) ? liked : rest).push(w); });
    return liked.concat(rest);
  }

  /* Escapes ILIKE metacharacters so a tag containing % or _ cannot widen the
   * match. The backslash escape needs PostgREST's default escape character. */
  function escapeLike(tag) {
    return String(tag == null ? '' : tag).replace(/([%_\\])/g, '\\$1');
  }

  /* Applies blocked tags to a PostgREST query against `works`. Matching is on
   * tags_all, with the JSON quotes included so "Harem" cannot match
   * "Harem Building". */
  function applyToQuery(q) {
    blockedTags().forEach(function (tag) {
      q = q.not('tags_all', 'ilike', '%"' + escapeLike(tag.replace(/"/g, '')) + '"%');
    });
    return q;
  }

  /* Inline pill for surfaces that badge rather than hide. */
  function badge(work) {
    var hits = matchedBlocked(work);
    if (!hits.length) return '';
    return ' <span title="Tagged ' + esc(hits.join(', ')) + ' — which you blocked in Settings" ' +
      'style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:#a78bfa;' +
      'background:rgba(167,139,250,0.12);border:1px solid rgba(167,139,250,0.32);border-radius:20px;padding:1px 7px;margin-left:4px;">' +
      '<i class="ti ti-tag" aria-hidden="true" style="font-size:11px;"></i> Blocked tag</span>';
  }

  /* Cache signature for pages that cache rendered HTML (rising.html). */
  function signature() {
    var keys = Object.keys(prefs).sort();
    return keys.map(function (k) { return k + '=' + prefs[k]; }).join('|');
  }

  window.DSTags = {
    init: init,
    all: all,
    isReady: isReady,
    blockedTags: blockedTags,
    likedTags: likedTags,
    tagsOf: tagsOf,
    matchedBlocked: matchedBlocked,
    isBlocked: isBlocked,
    hasLiked: hasLiked,
    filter: filterItems,
    applyToQuery: applyToQuery,
    escapeLike: escapeLike,
    badge: badge,
    signature: signature
  };
})();
