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

  /* ── Downscale policy, per bucket ──────────────────────────────────────
     maxPx  = longest edge, in pixels. Never upscales; a smaller image is
              left alone entirely.
     quality = re-encode quality for lossy formats (JPEG/WebP).
     null policy = this bucket is never touched.

     Deliberate exclusions:
       cosmetic-assets — avatar layers must line up pixel-for-pixel with the
                         body base. Resampling them would misregister every
                         composited avatar on the site. Never resized.
     Deliberate conservatism:
       collab-art      — this is artwork readers pay for and artists earn
                         royalties on. 2400px preserves detail; it only
                         catches genuinely oversized camera output.
     ──────────────────────────────────────────────────────────────────── */
  var RESIZE = {
    'avatars':         { maxPx: 768,  quality: 0.88 },
    'banners':         { maxPx: 1920, quality: 0.85 },
    'covers':          { maxPx: 1600, quality: 0.85 },
    'collab-art':      { maxPx: 2400, quality: 0.90 },
    'comment-images':  { maxPx: 1280, quality: 0.82 },
    'cosmetic-assets': null
  };

  // Formats we will re-encode. GIF is excluded on purpose: drawing a GIF to a
  // canvas keeps only the first frame, so resizing one silently destroys the
  // animation. SVG is excluded because it has no pixel dimensions to reduce.
  var RESIZABLE_TYPES = { 'image/jpeg': true, 'image/png': true, 'image/webp': true };

  function isAbsolute(v) {
    return typeof v === 'string' && /^(https?:)?\/\//i.test(v);
  }

  function loadBitmap(blob) {
    return new Promise(function (resolve, reject) {
      if (global.createImageBitmap) {
        global.createImageBitmap(blob).then(resolve, function () { fallback(); });
      } else { fallback(); }

      function fallback() {
        var img = new Image();
        var u = URL.createObjectURL(blob);
        img.onload = function () { URL.revokeObjectURL(u); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(u); reject(new Error('decode failed')); };
        img.src = u;
      }
    });
  }

  /* Downscale an image blob if it exceeds the bucket's policy.

     Guarantees, in order of importance:
       1. The output MIME type always equals the input MIME type. Stored paths
          carry the original file extension, so changing format would leave
          .png files containing WebP data.
       2. Never upscales.
       3. Alpha is preserved (no PNG-to-JPEG conversion, canvas left
          transparent rather than filled).
       4. If anything fails, or the result is not actually smaller, the
          original file is returned untouched. A resize must never be able to
          block an upload.                                                   */
  async function shrinkIfNeeded(bucket, file) {
    try {
      var policy = RESIZE[bucket];
      if (!policy || !file) return file;

      var type = file.type || '';
      if (!RESIZABLE_TYPES[type]) return file;
      if (typeof document === 'undefined' || !global.HTMLCanvasElement) return file;

      var bmp = await loadBitmap(file);
      var w = bmp.width, h = bmp.height;
      if (!w || !h) return file;

      var longest = Math.max(w, h);
      if (longest <= policy.maxPx) {
        if (bmp.close) bmp.close();
        return file;                     // already small enough
      }

      var scale = policy.maxPx / longest;
      var nw = Math.max(1, Math.round(w * scale));
      var nh = Math.max(1, Math.round(h * scale));

      var canvas = document.createElement('canvas');
      canvas.width = nw; canvas.height = nh;
      var ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, nw, nh);
      if (bmp.close) bmp.close();

      var out = await new Promise(function (resolve) {
        try { canvas.toBlob(resolve, type, policy.quality); }
        catch (e) { resolve(null); }
      });

      // Re-encoding a flat-colour PNG can come out larger than the original.
      if (!out || !out.size || out.size >= file.size) return file;

      // Preserve the filename so callers that read file.name still work.
      if (file.name && global.File) {
        try {
          return new File([out], file.name, { type: type, lastModified: Date.now() });
        } catch (e) { /* fall through to the plain Blob */ }
      }
      return out;
    } catch (e) {
      return file;                        // any failure: upload the original
    }
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
      opts = opts || {};
      var payload = opts.noResize ? file : await shrinkIfNeeded(bucket, file);

      // contentType must follow the payload, not the original, or Supabase
      // infers it from the path extension and can disagree with the bytes.
      var sendOpts = {};
      for (var k in opts) { if (k !== 'noResize') sendOpts[k] = opts[k]; }
      if (!sendOpts.contentType && payload && payload.type) sendOpts.contentType = payload.type;

      var res = await db.storage.from(bucket).upload(trimSlashes(path), payload, sendOpts);
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
    pathFromUrl: pathFromUrl,
    shrinkIfNeeded: shrinkIfNeeded,
    resizePolicy: function (bucket) { return RESIZE[bucket] || null; }
  };
})(window);
