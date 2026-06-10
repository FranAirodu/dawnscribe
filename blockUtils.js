/* ── DAWNSCRIBE BLOCK UTILITIES ────────────────────────────────────
   Include on any page that needs block awareness.
   Requires: window.db (Supabase client), user must be authed.

   API:
     dsBlock.load(uid)          → fetches & caches both lists
     dsBlock.blockedByMe()      → Set of uids I've blocked
     dsBlock.blockingMe()       → Set of uids who've blocked me
     dsBlock.isBlockedByMe(uid) → bool
     dsBlock.isBlockingMe(uid)  → bool
     dsBlock.either(uid)        → true if either direction
     dsBlock.block(uid)         → insert row, update cache
     dsBlock.unblock(uid)       → delete row, update cache
──────────────────────────────────────────────────────────────────── */

window.dsBlock = (function () {

  var _byMe = new Set();      // uids I have blocked
  var _byThem = new Set();    // uids who have blocked me
  var _myUid = null;
  var _loaded = false;

  async function load(uid) {
    _myUid = uid;
    _byMe.clear();
    _byThem.clear();

    // Rows where I am the blocker
    var r1 = await window.db.from('blocks')
      .select('blocked_id')
      .eq('blocker_id', uid);
    if (r1.data) r1.data.forEach(function (r) { _byMe.add(r.blocked_id); });

    // Rows where I am the blocked party — need service-role or a view;
    // since RLS only exposes own rows, we use a trick:
    // select rows where blocked_id = my uid (RLS allows this because blocker owns the row,
    // but we can't read it... so we use a public count function instead).
    // Workaround: expose a Postgres function or just query with the blocker filter.
    // Simplest safe approach: create an RLS policy that also allows SELECT when blocked_id = auth.uid()
    // (tell user to run this SQL if not done). Until then we query with .eq('blocked_id', uid) —
    // this works IF the RLS policy allows SELECT for both parties. We added that below.
    var r2 = await window.db.from('blocks')
      .select('blocker_id')
      .eq('blocked_id', uid);
    if (r2.data) r2.data.forEach(function (r) { _byThem.add(r.blocker_id); });

    _loaded = true;
  }

  function blockedByMe()      { return _byMe; }
  function blockingMe()       { return _byThem; }
  function isBlockedByMe(uid) { return _byMe.has(uid); }
  function isBlockingMe(uid)  { return _byThem.has(uid); }
  function either(uid)        { return _byMe.has(uid) || _byThem.has(uid); }

  async function block(uid) {
    if (!_myUid) return;
    var res = await window.db.from('blocks').insert({
      blocker_id: _myUid,
      blocked_id: uid
    });
    if (!res.error) _byMe.add(uid);
    return res;
  }

  async function unblock(uid) {
    if (!_myUid) return;
    var res = await window.db.from('blocks')
      .delete()
      .eq('blocker_id', _myUid)
      .eq('blocked_id', uid);
    if (!res.error) _byMe.delete(uid);
    return res;
  }

  return { load, blockedByMe, blockingMe, isBlockedByMe, isBlockingMe, either, block, unblock };

})();
