/* ── DAWNSCRIBE BLOCK UTILITIES ────────────────────────────────────
   Load BEFORE any inline scripts that use dsBlock.
   Requires: window.db (Supabase client).
──────────────────────────────────────────────────────────────────── */
window.dsBlock = (function () {
  var _byMe   = new Set();
  var _byThem = new Set();
  var _myUid  = null;

  async function load(uid) {
    _myUid = uid; _byMe.clear(); _byThem.clear();
    // Only YOUR OWN blocks are readable. The "who blocked me" query was removed
    // deliberately: handing the client that list let a blocked user enumerate
    // exactly who blocked them, which is a retaliation risk.
    //
    // Hiding is now enforced in the database by RESTRICTIVE RLS policies, so
    // content from anyone you're blocked with never reaches the browser at all.
    // _byThem therefore stays empty; it is kept so isBlockingMe()/either()
    // remain callable from the ~40 existing call sites without edits.
    var r1 = await window.db.from('blocks').select('blocked_id').eq('blocker_id', uid);
    if (r1.data) r1.data.forEach(function(r){ _byMe.add(r.blocked_id); });
  }

  function blockedByMe()      { return _byMe; }
  // Always empty by design -- see load(). The server hides these rows instead.
  function blockingMe()       { return _byThem; }
  function isBlockedByMe(uid) { return _byMe.has(uid); }
  function isBlockingMe(uid)  { return _byThem.has(uid); }
  function either(uid)        { return _byMe.has(uid) || _byThem.has(uid); }

  async function block(uid) {
    if (!_myUid) return;
    var res = await window.db.from('blocks').insert({ blocker_id: _myUid, blocked_id: uid });
    if (!res.error) _byMe.add(uid);
    return res;
  }

  async function unblock(uid) {
    if (!_myUid) return;
    var res = await window.db.from('blocks').delete().eq('blocker_id', _myUid).eq('blocked_id', uid);
    if (!res.error) _byMe.delete(uid);
    return res;
  }

  return { load, blockedByMe, blockingMe, isBlockedByMe, isBlockingMe, either, block, unblock };
})();
