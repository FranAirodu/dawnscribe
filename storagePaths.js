/* ══════════════════════════════════════════════════════════════════════════
   DawnScribe — storagePaths.js
   Single source of truth for building image URLs and uploading image files.

   WHY THIS EXISTS
   Every image URL on the site used to be built inline, in ten different
   places, by calling the Supabase SDK directly. That meant the storage
   provider's hostname was baked into ten files plus every row of every
   image column in the database. Moving images anywhere else would have
   meant editing all of it.

   Now every read and write goes through here. Switching providers is a
   change to PROVIDER below, plus one SQL find/replace on stored URLs.
   Nothing else on the site needs to know where images live.

   The helper is deliberately tolerant: url() accepts either a bare
   storage path or an already-absolute URL and does the right thing, so
   rows written before this file existed keep working untouched.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── Provider configuration ──────────────────────────────────────────────
  // 'supabase' = serve from Supabase Storage (current).
  // 'cdn'      = serve from an external bucket/CDN (e.g. Cloudflare R2)
  //              mounted at CDN_BASE. Uploads still go to Supabase unless
  //              UPLOAD_PROVIDER is changed too, so reads can be moved to a
  //              CDN first and writes cut over afterwards.
  var PROVIDER = 'supabase';
  var CDN_BASE = '';               // e.g. 'https://img.dawnscribe.com'
  var UPLOAD_PROVIDER = 'supabase';

  var BUCKETS = {
    AVATARS: 'avatars',
    BANNERS: 'banners',
    COVERS: 'covers',
    COLLAB_ART: 'collab-art',
    COSMETIC_ASSETS: 'cosmetic-assets',
    COMMENT_IMAGES: 'comment-images'
  };

  function isAbsolute(v) {
    return typeof v === 'string' && /^(https?:)?\/\//i.test(v);
  }

  function trimSlashes(v) {
    return String(v == null ? '' : v).replace(/^\/+/, '').replace(/\/+$/, '');
  }

  /* Build a public URL for a stored object.
     Accepts a bare path ('user/123/x.png') or an absolute URL. Absolute
     input is returned unchanged so legacy rows still resolve. */
  function url(db, bucket, pathOrUrl) {
    if (pathOrUrl == null || pathOrUrl === '') return '';
    if (isAbsolute(pathOrUrl)) return pathOrUrl;

    var path = trimSlashes(pathOrUrl);

    if (PROVIDER === 'cdn' && CDN_BASE) {
      return trimSlashes(CDN_BASE) + '/' + bucket + '/' +
             path.split('/').map(encodeURIComponent).join('/');
    }

    try {
      var res = db.storage.from(bucket).getPublicUrl(path);
      return (res && res.data && res.data.publicUrl) || '';
    } catch (e) {
      return '';
    }
  }

  /* Cache-busting variant, for files written with upsert:true where the
     path never changes (avatar head shots, profile banners). */
  function urlFresh(db, bucket, pathOrUrl, stamp) {
    var u = url(db, bucket, pathOrUrl);
    if (!u) return '';
    return u + (u.indexOf('?') === -1 ? '?' : '&') + 'v=' +
           (stamp == null ? Date.now() : stamp);
  }

  /* Upload an object. Returns { error } — a plain shape every call site can
     destructure, regardless of which provider handled the write. */
  async function upload(db, bucket, path, file, opts) {
    try {
      if (UPLOAD_PROVIDER !== 'supabase') {
        return { error: { message: 'Uploads are not configured for provider "' + UPLOAD_PROVIDER + '".' } };
      }
      var res = await db.storage.from(bucket).upload(trimSlashes(path), file, opts || {});
      return { error: (res && res.error) || null };
    } catch (e) {
      return { error: e || { message: 'Upload failed.' } };
    }
  }

  /* Delete objects by path. */
  async function remove(db, bucket, paths) {
    try {
      var list = (Array.isArray(paths) ? paths : [paths]).map(trimSlashes).filter(Boolean);
      if (!list.length) return { error: null };
      var res = await db.storage.from(bucket).remove(list);
      return { error: (res && res.error) || null };
    } catch (e) {
      return { error: e || { message: 'Delete failed.' } };
    }
  }

  /* Recover the storage path from a stored absolute URL. Used when deleting
     a file we only have the public URL for. Provider-shape-dependent, which
     is exactly why it belongs in this file and not at the call site. */
  function pathFromUrl(bucket, absUrl) {
    if (!absUrl || typeof absUrl !== 'string') return '';
    var marker = '/' + bucket + '/';
    var i = absUrl.indexOf(marker);
    if (i === -1) return '';
    var tail = absUrl.slice(i + marker.length).split('?')[0];
    try { return decodeURIComponent(tail); } catch (e) { return tail; }
  }

  global.DSStorage = {
    BUCKETS: BUCKETS,
    provider: function () { return PROVIDER; },
    url: url,
    urlFresh: urlFresh,
    upload: upload,
    remove: remove,
    pathFromUrl: pathFromUrl
  };
})(window);
