/* muteFilter.js — window.DSMute
   ────────────────────────────────────────────────────────────────────────
   Muting hides a person's stories and artwork from your feeds and search.
   It is deliberately SOFTER than blocking: a muted person can still message
   and comment, they are not told, and their work stays reachable if you go
   to their profile on purpose. Mute is a discovery filter, not a wall.

   That is exactly why this is not an RLS policy on `works` — RLS would hide
   the work everywhere, including on the profile you deliberately opened.
   The database side is instead a PostgREST computed column,
   `is_muted_for_me(works)`, which discovery surfaces opt into.

   Two ways to use it, matching DSWarn/DSTags:

     DSMute.filterQuery(q)  — server-side. Append to any works query:
                                q = DSMute.filterQuery(q)
                              Preferred: the rows never leave the database,
                              and it works on queries that paginate or order.

     DSMute.isBlocked(work) — client-side, for rows already fetched (feeds
                              that hydrate works by id from another table).
                              Requires init() first.

   init() is safe to call repeatedly; the work happens once.
   Signed out: no mutes exist, so nothing is filtered.                      */
(function (global) {
  'use strict';

  var _db = null;
  var _ids = null;          // Set of muted user ids, once loaded
  var _loading = null;

  function init(db) {
    if (db) _db = db;
    if (_loading) return _loading;
    _loading = (async function () {
      try {
        var sess = await _db.auth.getSession();
        var uid = sess && sess.data && sess.data.session && sess.data.session.user
          ? sess.data.session.user.id : null;
        if (!uid) { _ids = new Set(); return; }
        var res = await _db.from('mutes').select('muted_id').eq('muter_id', uid);
        var s = new Set();
        (res.data || []).forEach(function (r) { if (r.muted_id) s.add(r.muted_id); });
        _ids = s;
      } catch (e) {
        /* A failed lookup must not hide the whole site. An empty set means
           "nothing muted", which is the same thing every reader without a
           mute list sees. */
        _ids = new Set();
      }
    })();
    return _loading;
  }

  /* Server-side filter. `is` rather than `eq` because the computed column is
     a boolean and PostgREST wants IS NOT TRUE semantics here — a null (which
     should not occur, but would if author_id were ever null) must be KEPT,
     not dropped. Same "missing field means keep" rule the client-side path
     follows below. */
  function filterQuery(q) {
    if (!q || typeof q.not !== 'function') return q;
    try { return q.not('is_muted_for_me', 'is', true); }
    catch (e) { return q; }
  }

  /* Client-side test for an already-fetched row.
     Returns false (keep) when init() has not run or the row carries no
     author, so a missing field can never blank out a feed. */
  function isBlocked(work) {
    if (!work || !_ids || !_ids.size) return false;
    var author = work.author_id || work.artist_id || null;
    if (!author) return false;
    return _ids.has(author);
  }

  function isMutedUser(userId) {
    if (!userId || !_ids || !_ids.size) return false;
    return _ids.has(userId);
  }

  function ids() { return _ids ? Array.from(_ids) : []; }

  global.DSMute = {
    init: init,
    filterQuery: filterQuery,
    isBlocked: isBlocked,
    isMutedUser: isMutedUser,
    ids: ids
  };
})(window);
