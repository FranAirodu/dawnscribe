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

  /* ── WebP conversion policy, per bucket ────────────────────────────────
     WebP is typically 25-35% smaller than JPEG and far smaller than PNG for
     photographic content. Egress, not storage, is the cost meter, so this is
     the single highest-leverage saving available on the image pipeline.

     IMPORTANT — why the stored path keeps its original extension:
     All ten upload call sites build a path locally and then reuse that same
     variable to persist the URL. Rewriting the extension inside upload()
     would desync every one of them, so instead the bytes change and the
     extension does not. This is safe because Content-Type, not the file
     extension, determines how a browser decodes an image, and upload() below
     always sets contentType from the payload. A '.png' object served as
     image/webp renders correctly everywhere.

     The one place this could matter is a future move to a provider that
     serves by extension and ignores stored content types. upload() now
     returns the canonical path (with the extension the bytes actually
     deserve) as `path`, so call sites can be migrated to persist that and a
     one-time rename migration can follow. Until then the mismatch is inert.

     Excluded:
       cosmetic-assets — never touched at all (see RESIZE above).
       avatars         — head shots are generated PNGs composited by
                         avatarRender.js and written with an explicit
                         contentType; leave that pipeline byte-predictable.
     ──────────────────────────────────────────────────────────────────── */
  var CONVERT_TO_WEBP = {
    'banners':         { quality: 0.85 },
    'covers':          { quality: 0.85 },
    'collab-art':      { quality: 0.92 },   // paid artwork: bias toward fidelity
    'comment-images':  { quality: 0.82 },
    'avatars':         null,
    'cosmetic-assets': null
  };

  // Source formats worth converting. Already-WebP input is left alone: it would
  // be a lossy round-trip for no gain.
  var CONVERTIBLE_TYPES = { 'image/jpeg': true, 'image/png': true };

  var _webpSupport = null;   // null = untested, true/false once known

  /* Does this browser's canvas actually ENCODE WebP? Safari decodes WebP long
     before it could encode it, so feature-detecting on decode would be wrong.
     canvas.toBlob silently falls back to PNG when it cannot honour the type,
     so the only reliable test is to encode and inspect what came back. */
  async function canEncodeWebp() {
    if (_webpSupport !== null) return _webpSupport;
    try {
      if (typeof document === 'undefined' || !global.HTMLCanvasElement) {
        _webpSupport = false; return false;
      }
      var c = document.createElement('canvas');
      c.width = 2; c.height = 2;
      var b = await new Promise(function (resolve) {
        try { c.toBlob(resolve, 'image/webp', 0.8); } catch (e) { resolve(null); }
      });
      _webpSupport = !!(b && b.type === 'image/webp');
    } catch (e) {
      _webpSupport = false;
    }
    return _webpSupport;
  }

  /* Swap a path's extension. Used only for the canonical path reported back to
     the caller — the object is still written at the original path. */
  function withExtension(path, ext) {
    var p = String(path == null ? '' : path);
    var slash = p.lastIndexOf('/');
    var dot = p.lastIndexOf('.');
    if (dot > slash && dot !== -1) return p.slice(0, dot) + '.' + ext;
    return p + '.' + ext;
  }

  /* Re-encode to WebP if the bucket opts in and it is actually smaller.
     Same failure contract as shrinkIfNeeded: any problem returns the input
     untouched. Runs AFTER downscaling, so it re-encodes the already-reduced
     pixels rather than the original. */
  async function convertToWebpIfWorthwhile(bucket, file) {
    try {
      var policy = CONVERT_TO_WEBP[bucket];
      if (!policy || !file) return file;

      var type = file.type || '';
      if (!CONVERTIBLE_TYPES[type]) return file;
      if (!(await canEncodeWebp())) return file;

      var bmp = await loadBitmap(file);
      var w = bmp.width, h = bmp.height;
      if (!w || !h) { if (bmp.close) bmp.close(); return file; }

      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      if (!ctx) { if (bmp.close) bmp.close(); return file; }
      // Canvas is left transparent rather than filled, so PNG alpha survives
      // the trip into WebP (which supports alpha).
      ctx.drawImage(bmp, 0, 0);
      if (bmp.close) bmp.close();

      var out = await new Promise(function (resolve) {
        try { canvas.toBlob(resolve, 'image/webp', policy.quality); }
        catch (e) { resolve(null); }
      });

      // Guard against a silent PNG fallback, and against the conversion
      // coming out bigger (common for small flat-colour source images).
      if (!out || !out.size || out.type !== 'image/webp' || out.size >= file.size) return file;

      if (file.name && global.File) {
        try {
          return new File([out], withExtension(file.name, 'webp'),
                          { type: 'image/webp', lastModified: Date.now() });
        } catch (e) { /* fall through to the plain Blob */ }
      }
      return out;
    } catch (e) {
      return file;
    }
  }

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

      // WebP conversion is skipped when the caller asserted an explicit
      // contentType — that call site is declaring the exact format it wants
      // written, and overriding it would be a surprise.
      if (!opts.noConvert && !opts.contentType) {
        payload = await convertToWebpIfWorthwhile(bucket, payload);
      }

      // contentType must follow the payload, not the original, or Supabase
      // infers it from the path extension and can disagree with the bytes.
      // This is also what makes the extension mismatch harmless: the object is
      // served as image/webp regardless of the '.png' in its path.
      var sendOpts = {};
      for (var k in opts) { if (k !== 'noResize' && k !== 'noConvert') sendOpts[k] = opts[k]; }
      if (!sendOpts.contentType && payload && payload.type) sendOpts.contentType = payload.type;

      var writePath = trimSlashes(path);
      var res = await db.storage.from(bucket).upload(writePath, payload, sendOpts);

      /* `path` is the path the object was actually written to — persist this.
         `canonicalPath` is the path the bytes deserve by extension. They differ
         only when a conversion happened; see the CONVERT_TO_WEBP note above.
         Nothing reads canonicalPath yet; it exists so a later migration can. */
      return {
        error: (res && res.error) || null,
        path: writePath,
        canonicalPath: (payload && payload.type === 'image/webp')
          ? withExtension(writePath, 'webp')
          : writePath,
        contentType: (payload && payload.type) || null
      };
    } catch (e) {
      return { error: e || { message: 'Upload failed.' } };
    }
  }

  /* Delete objects by path.
     Returns { error, requested, removed, missing }.
     `error` keeps its old shape, so existing call sites are unaffected.

     WHY THE COUNTS: storage .remove() does NOT error on a path that isn't
     there — it resolves with an empty data array. This is the storage-layer
     twin of the PostgREST zero-row silent no-op that has bitten this codebase
     repeatedly: the caller checks `error`, sees null, and reports success for
     a file that is still sitting in a public bucket. Any call site that
     deletes on a user's behalf (removing a cover, withdrawing artwork,
     scrubbing on account deletion) should check `removed` as well as `error`. */
  async function remove(db, bucket, paths) {
    try {
      var list = (Array.isArray(paths) ? paths : [paths]).map(trimSlashes).filter(Boolean);
      if (!list.length) return { error: null, requested: 0, removed: 0, missing: [] };
      var res = await db.storage.from(bucket).remove(list);
      var err = (res && res.error) || null;
      var got = (res && Array.isArray(res.data)) ? res.data : [];
      var gotNames = got.map(function (o) { return o && (o.name || o.path); }).filter(Boolean);
      var missing = err ? list.slice() : list.filter(function (p) {
        return gotNames.indexOf(p) === -1 &&
               gotNames.indexOf(p.split('/').pop()) === -1;
      });
      return {
        error: err,
        requested: list.length,
        removed: err ? 0 : gotNames.length,
        missing: missing
      };
    } catch (e) {
      return { error: e || { message: 'Delete failed.' },
               requested: 0, removed: 0, missing: [] };
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
    convertToWebpIfWorthwhile: convertToWebpIfWorthwhile,
    canEncodeWebp: canEncodeWebp,
    withExtension: withExtension,
    resizePolicy: function (bucket) { return RESIZE[bucket] || null; },
    convertPolicy: function (bucket) { return CONVERT_TO_WEBP[bucket] || null; }
  };
})(window);
