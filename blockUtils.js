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
    var r1 = await window.db.from('blocks').select('blocked_id').eq('blocker_id', uid);
    if (r1.data) r1.data.forEach(function(r){ _byMe.add(r.blocked_id); });
    var r2 = await window.db.from('blocks').select('blocker_id').eq('blocked_id', uid);
    if (r2.data) r2.data.forEach(function(r){ _byThem.add(r.blocker_id); });
  }

  function blockedByMe()      { return _byMe; }
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
