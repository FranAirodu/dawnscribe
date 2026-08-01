/* ── DAWNSCRIBE SHARED AVATAR RENDERER ─────────────────────────────
 * Single source of truth for rendering a user's avatar SVG.
 * Used by: avatar.html (editor preview), index.html (sidebar widget),
 * profile.html (profile display). Any change to avatar rendering
 * happens HERE — never in per-page copies.
 *
 * Usage:
 *   <script src="avatarRender.js"></script>
 *   var svg = DSAvatar.renderSvg(avatarData, bodyPresets, allItems);
 *   // or full fetch + render:
 *   var r = await DSAvatar.load(db, uid);   // { avatarData, presets, items, svg }
 */
(function () {
  'use strict';

  var BODY_ASSET_BASE = 'https://cajjyyskpmjnpcxcfeuk.supabase.co/storage/v1/object/public/cosmetic-assets/';

  // Slot render order (bottom to top). Matches the layered-asset spec.
  var SLOT_ORDER = [
    'background', 'companion', 'effect', 'pants', 'shoes', 'outfit', 'shirt',
    'jacket', 'gloves', 'accessory', 'neck', 'back', 'hair', 'eyes', 'lips', 'hat'
  ];

  // Body render box inside the 320x480 viewBox. Leaves headroom for
  // hair/hats + side room for back items/backgrounds; future cosmetic
  // layers must use this same box.
  var BODY_BOX = { x: 24, y: 78, w: 272, h: 384 };

  // Female body scale. 1.00 = renders identically to male.
  //
  // DIAGNOSTIC REVERT: set to 1.00 so male and female go through the exact
  // same render box while isolating a head-alignment issue on female.
  //
  // IMPORTANT when re-enabling (<1.0): the images use preserveAspectRatio
  // "...meet", which fits the image to the LIMITING dimension. With
  // BODY_BOX 272x384 and 4000x4800 art, WIDTH is limiting
  // (272/4000 = 0.068 < 384/4800 = 0.080), so scaling height ALONE does
  // nothing to the rendered figure size — it only shifts the box's top
  // edge down, which can desync layers. Scale BOTH w and h instead.
  var FEMALE_BODY_SCALE = 1.00;

  // Returns the render box for a given body type. At scale 1.0 both genders
  // use BODY_BOX unchanged. Below 1.0, width AND height scale together (so
  // the figure actually shrinks) while keeping BODY_BOX's bottom baseline
  // and horizontal center, so the feet stay on the same floor line.
  function bodyBoxFor(bodyType) {
    if (bodyType !== 'female' || FEMALE_BODY_SCALE === 1) return BODY_BOX;
    var w = Math.round(BODY_BOX.w * FEMALE_BODY_SCALE);
    var h = Math.round(BODY_BOX.h * FEMALE_BODY_SCALE);
    var baseline = BODY_BOX.y + BODY_BOX.h;   // pin feet to same floor line
    var cx = BODY_BOX.x + BODY_BOX.w / 2;     // keep horizontally centered
    return { x: Math.round(cx - w / 2), y: baseline - h, w: w, h: h };
  }

  // Full-canvas box for background layers (drawn behind everything).
  var BG_BOX = { x: 0, y: 0, w: 320, h: 480 };

  // Cosmetic art delivered by commissioned artists lives in the same
  // public bucket as body art. image_url may be either a bare storage
  // path ('hats/straw_hat.png') or a fully-qualified https URL.
  var COSMETIC_ASSET_BASE = BODY_ASSET_BASE;

  // Placeholder vector cosmetic layers (test geometry) stay disabled —
  // real body artwork is live and the test shapes drew over it. Real
  // illustrated cosmetics render through renderItemLayers() instead,
  // which is driven by cosmetic_items.image_url and needs no flag.
  var RENDER_PLACEHOLDER_LAYERS = false;

  // Until real layered art exists, each slot renders as a simple
  // colored region on the body silhouette.
  var SLOT_PLACEHOLDER_SHAPES = {
    shirt:    { d: 'M150 165 q50 22 100 0 l14 34 q-64 28 -128 0 Z', region: 'main' },
    outfit:   { d: 'M150 165 q50 22 100 0 l14 34 q-64 28 -128 0 Z M155 205 q45 16 90 0 l8 140 q-53 18 -106 0 Z', region: 'main' },
    jacket:   { d: 'M145 160 q55 26 110 0 l18 40 q-72 32 -146 0 Z', region: 'main' },
    pants:    { d: 'M155 205 q45 16 90 0 l8 140 q-53 18 -106 0 Z', region: 'main' },
    shoes:    { d: 'M150 410 l-10 50 q-2 12 12 14 l16 2 q12 -2 12 -14 l-2 -52 Z M200 410 l10 50 q2 12 -12 14 l-16 2 q-12 -2 -12 -14 l2 -52 Z', region: 'main' },
    gloves:   { d: 'M115 245 l-12 36 q-3 8 6 11 l10 3 q8 2 11 -7 l11 -35 Z M235 245 l12 36 q3 8 -6 11 l-10 3 q-8 2 -11 -7 l-11 -35 Z', region: 'main' },
    accessory:{ d: 'M150 195 l50 0 l0 14 l-50 0 Z', region: 'main' },
    neck:     { d: 'M165 158 q20 10 20 10 q0 0 20 -10 l4 12 q-24 12 -48 0 Z', region: 'main' },
    back:     { d: 'M120 175 q-20 40 -10 90 l16 -4 q-8 -44 8 -78 Z M230 175 q20 40 10 90 l-16 -4 q8 -44 -8 -78 Z', region: 'main' },
    hair:     { d: 'M120 60 q10 -34 52 -34 q44 0 54 36 q6 22 -2 40 q-2 -22 -16 -30 q-6 14 -18 18 q2 -12 -6 -18 q-8 12 -28 12 q-22 0 -28 -16 q-8 8 -8 22 q-12 -16 -8 -38 Z', region: 'main' },
    eyes:     { d: 'M148 95 q4 -6 10 -2 M192 95 q-4 -6 -10 -2', stroke: true, region: null },
    lips:     { d: 'M160 118 q10 6 30 0', stroke: true, region: null },
    hat:      { d: 'M125 45 q45 -38 100 0 l-4 18 q-46 -26 -92 0 Z', region: 'main' }
  };


  function sanitizeHex(hex) {
    if (!hex) return '#888888';
    var clean = String(hex).trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(clean) ? clean : '#888888';
  }

  /**
   * Resolve the body artwork preset. `key` is the saved skin_tone id;
   * bodyType narrows the fallback so a male avatar with an unset or
   * stale skin tone doesn't fall back onto a female body (or vice versa).
   */
  function getBodyPreset(presets, key, bodyType) {
    presets = presets || [];
    var p = presets.find(function (b) { return b.id === key; });
    if (p && (!bodyType || !b_type(p) || b_type(p) === bodyType)) return p;

    var pool = bodyType
      ? presets.filter(function (b) { return b_type(b) === bodyType; })
      : presets;
    if (!pool.length) pool = presets;

    return pool.find(function (b) { return b.is_default; }) || pool[0] || null;
  }

  function b_type(preset) {
    return preset && preset.body_type ? preset.body_type : null;
  }

  function getPoseImagePath(preset, pose) {
    if (!preset) return null;
    var paths = preset.pose_paths || {};
    return paths[pose] || paths.pose1 || preset.image_path || null;
  }

  // ── HEADSHOT CROPS ────────────────────────────────────────────
  // ViewBox regions (in the 320x480 avatar coordinate space) that frame
  // the character's face, per pose. Tunable per body preset via the
  // avatar_body_presets.head_crops jsonb column, e.g.
  //   { "pose1": {"x":118,"y":84,"w":84,"h":84} }
  // Falls back to these defaults when the preset has no override.
  var DEFAULT_HEAD_CROPS = {
    pose1: { x: 118, y: 84, w: 84, h: 84 },
    pose2: { x: 118, y: 84, w: 84, h: 84 }
  };

  function getHeadCrop(preset, pose) {
    pose = pose || 'pose1';
    var fromDb = preset && preset.head_crops && (preset.head_crops[pose] || preset.head_crops.pose1);
    var c = fromDb || DEFAULT_HEAD_CROPS[pose] || DEFAULT_HEAD_CROPS.pose1;
    // Validate: all numeric, sane bounds
    if (!c || typeof c.x !== 'number' || typeof c.y !== 'number' ||
        typeof c.w !== 'number' || typeof c.h !== 'number' || c.w <= 0 || c.h <= 0) {
      c = DEFAULT_HEAD_CROPS.pose1;
    }
    return c;
  }

  /**
   * Resolve a cosmetic_items.image_url into a loadable URL.
   * Accepts absolute http(s) URLs, protocol-relative URLs, and data URIs
   * as-is; anything else is treated as a path inside the public bucket.
   * Returns null for empty/invalid values so callers can skip the layer.
   */
  // Build a skipSlots list that suppresses every slot except 'background',
  // so a render pass can emit background art alone.
  function nonBackgroundSlots(skipSlots) {
    var out = SLOT_ORDER.filter(function (s) { return s !== 'background'; });
    return out.concat(skipSlots || []);
  }

  /**
   * Pick the artwork path for an item given the avatar's body type.
   * Garments are cut per body type; backgrounds and other body-agnostic
   * art use the 'any' key. Falls back to the legacy flat image_url so
   * pre-existing rows keep working.
   */
  function pickAssetPath(item, bodyType) {
    if (!item) return null;
    var paths = item.asset_paths || {};
    var p = paths[bodyType || 'male'] || paths.any || null;
    if (p && String(p).trim()) return p;
    return item.image_url || null;
  }

  function resolveAssetUrl(url) {
    if (!url) return null;
    var u = String(url).trim();
    if (!u) return null;
    if (/^(https?:|data:|\/\/)/i.test(u)) return u;
    if (u.charAt(0) === '/') u = u.slice(1);
    return COSMETIC_ASSET_BASE + u;
  }

  function escapeAttr(v) {
    return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Render the equipped cosmetic art layers as <image> elements.
   * Artists deliver a transparent PNG per item per body type, sized to
   * the same 320x480 canvas as the body art, so each layer is drawn into
   * BODY_BOX (or the full canvas for backgrounds) and stacks by z_index.
   *
   * The path is resolved from asset_paths[avatarData.body_type]; items
   * with no art for that body type are skipped entirely, rendering as
   * nothing rather than as a broken image icon.
   *
   * @param {Object} avatarData
   * @param {Array}  allItems - rows from cosmetic_items
   * @param {Array}  skipSlots
   * @returns {Array<String>} SVG fragments, already in draw order
   */
  function renderItemLayers(avatarData, allItems, skipSlots) {
    allItems = allItems || [];
    skipSlots = skipSlots || [];
    var equipped = (avatarData && avatarData.equipped) || {};
    var bodyType = (avatarData && avatarData.body_type) || 'male';
    var layers = [];

    SLOT_ORDER.forEach(function (slot, slotIndex) {
      if (skipSlots.indexOf(slot) !== -1) return;
      var eq = equipped[slot];
      if (!eq) return;
      var item = allItems.find(function (it) { return it.id === eq.item_id; });
      if (!item) return;
      var href = resolveAssetUrl(pickAssetPath(item, bodyType));
      if (!href) return; // no art for this body type yet — draw nothing

      var box = (slot === 'background') ? BG_BOX : bodyBoxFor(bodyType);
      // Backgrounds fill the canvas; body-aligned art preserves its
      // aspect ratio anchored to the same baseline as the body preset.
      var par = (slot === 'background') ? 'xMidYMid slice' : 'xMidYMax meet';

      layers.push({
        z: (typeof item.z_index === 'number' ? item.z_index : 0),
        slotIndex: slotIndex,
        svg: '<image href="' + escapeAttr(href) + '" x="' + box.x + '" y="' + box.y +
             '" width="' + box.w + '" height="' + box.h +
             '" preserveAspectRatio="' + par + '"/>'
      });
    });

    // z_index wins; SLOT_ORDER breaks ties so the spec ordering holds.
    layers.sort(function (a, b) {
      return (a.z - b.z) || (a.slotIndex - b.slotIndex);
    });

    return layers.map(function (l) { return l.svg; });
  }

  /**
   * Render the avatar SVG string.
   * @param {Object} avatarData - row from user_avatars (or default-shaped object)
   * @param {Array}  presets    - active rows from avatar_body_presets
   * @param {Array}  allItems   - rows from cosmetic_items (only needed for placeholder layers)
   * @param {Object} [opts]     - { applyPosition: true, applyMirror: true, skipSlots: [] }
   */
  function renderSvg(avatarData, presets, allItems, opts) {
    avatarData = avatarData || {};
    allItems = allItems || [];
    opts = opts || {};
    var applyPosition = opts.applyPosition !== false;
    var applyMirror = opts.applyMirror !== false;
    var skipSlots = opts.skipSlots || [];

    var parts = [];

    // Background art sits behind the body and the ground shadow.
    var bgParts = renderItemLayers(avatarData, allItems, nonBackgroundSlots(skipSlots));
    parts.push.apply(parts, bgParts);

    // Base body: pre-colored artwork preset resolved from skin_tone.
    var preset = getBodyPreset(presets, avatarData.skin_tone, avatarData.body_type);
    if (preset) {
      var bodyPath = getPoseImagePath(preset, avatarData.pose || 'pose1');
      if (bodyPath) {
        var bBox = bodyBoxFor(avatarData.body_type);
        parts.push('<image href="' + BODY_ASSET_BASE + bodyPath + '" x="' + bBox.x + '" y="' + bBox.y + '" width="' + bBox.w + '" height="' + bBox.h + '" preserveAspectRatio="xMidYMax meet"/>');
      }
    }

    // Illustrated cosmetic layers, stacked over the body.
    parts.push.apply(parts, renderItemLayers(avatarData, allItems, skipSlots.concat(['background'])));

    // Equipped item layers, in SLOT_ORDER (bottom to top).
    if (RENDER_PLACEHOLDER_LAYERS) SLOT_ORDER.forEach(function (slot) {
      if (skipSlots.indexOf(slot) !== -1) return; // e.g. profile suppresses 'background' so the user's banner shows through
      var eq = (avatarData.equipped || {})[slot];
      if (!eq) return;
      var item = allItems.find(function (it) { return it.id === eq.item_id; });
      if (!item) return;
      var shape = SLOT_PLACEHOLDER_SHAPES[slot];
      if (!shape) return;

      var fillColor = '#888888';
      if (shape.region && eq.colors && eq.colors[shape.region]) {
        fillColor = sanitizeHex(eq.colors[shape.region]);
      } else if (item.fill_regions && item.fill_regions[0]) {
        fillColor = sanitizeHex(item.fill_regions[0].default_color);
      }

      if (shape.stroke) {
        parts.push('<path d="' + shape.d + '" fill="none" stroke="' + fillColor + '" stroke-width="3" stroke-linecap="round"/>');
      } else {
        parts.push(
          '<path d="' + shape.d + '" fill="' + fillColor + '"/>' +
          '<path d="' + shape.d + '" fill="#000" opacity="0.14" style="mix-blend-mode:multiply"/>' +
          '<path d="' + shape.d + '" fill="none" stroke="#1a1a1a" stroke-width="1.5" opacity="0.7"/>'
        );
      }
    });

    // Display transforms: position shift (left/center/right) + mirror flip.
    var shift = 0;
    if (applyPosition) {
      shift = avatarData.avatar_position === 'left' ? -62 : (avatarData.avatar_position === 'right' ? 62 : 0);
    }
    var tf = 'translate(' + shift + ',0)';
    if (applyMirror && avatarData.mirrored) tf += ' translate(320,0) scale(-1,1)';

    return '<svg viewBox="0 0 320 480" xmlns="http://www.w3.org/2000/svg">' +
      '<g transform="' + tf + '">' +
      '<ellipse cx="160" cy="465" rx="90" ry="12" fill="rgba(0,0,0,0.15)"/>' +
      parts.join('') +
      '</g>' +
      '</svg>';
  }

  /**
   * Render a zoomed-in headshot of the avatar (for circular profile
   * pictures etc). Same layers as renderSvg but the viewBox is cropped
   * to the face region for the active pose. Position shift is ignored
   * (it would move the face out of frame); mirror is applied around the
   * crop's own center so the face stays framed.
   * @param {Object} [opts] - { skipSlots: [] } passed through
   */
  function renderHeadshotSvg(avatarData, presets, allItems, opts) {
    avatarData = avatarData || {};
    allItems = allItems || [];
    opts = opts || {};
    var skipSlots = opts.skipSlots || [];

    var parts = [];

    parts.push.apply(parts, renderItemLayers(avatarData, allItems, nonBackgroundSlots(skipSlots)));

    var preset = getBodyPreset(presets, avatarData.skin_tone, avatarData.body_type);
    if (preset) {
      var bodyPath = getPoseImagePath(preset, avatarData.pose || 'pose1');
      if (bodyPath) {
        var bBox = bodyBoxFor(avatarData.body_type);
        parts.push('<image href="' + BODY_ASSET_BASE + bodyPath + '" x="' + bBox.x + '" y="' + bBox.y + '" width="' + bBox.w + '" height="' + bBox.h + '" preserveAspectRatio="xMidYMax meet"/>');
      }
    }

    parts.push.apply(parts, renderItemLayers(avatarData, allItems, skipSlots.concat(['background'])));

    if (RENDER_PLACEHOLDER_LAYERS) SLOT_ORDER.forEach(function (slot) {
      if (skipSlots.indexOf(slot) !== -1) return;
      var eq = (avatarData.equipped || {})[slot];
      if (!eq) return;
      var item = allItems.find(function (it) { return it.id === eq.item_id; });
      if (!item) return;
      var shape = SLOT_PLACEHOLDER_SHAPES[slot];
      if (!shape) return;
      var fillColor = '#888888';
      if (shape.region && eq.colors && eq.colors[shape.region]) {
        fillColor = sanitizeHex(eq.colors[shape.region]);
      } else if (item.fill_regions && item.fill_regions[0]) {
        fillColor = sanitizeHex(item.fill_regions[0].default_color);
      }
      if (shape.stroke) {
        parts.push('<path d="' + shape.d + '" fill="none" stroke="' + fillColor + '" stroke-width="3" stroke-linecap="round"/>');
      } else {
        parts.push(
          '<path d="' + shape.d + '" fill="' + fillColor + '"/>' +
          '<path d="' + shape.d + '" fill="#000" opacity="0.14" style="mix-blend-mode:multiply"/>' +
          '<path d="' + shape.d + '" fill="none" stroke="#1a1a1a" stroke-width="1.5" opacity="0.7"/>'
        );
      }
    });

    var crop = getHeadCrop(preset, avatarData.pose || 'pose1');
    var tf = '';
    if (avatarData.mirrored) {
      // Flip around the crop's horizontal center so the face stays framed
      var cx = crop.x + crop.w / 2;
      tf = ' transform="translate(' + (2 * cx) + ',0) scale(-1,1)"';
    }

    return '<svg viewBox="' + crop.x + ' ' + crop.y + ' ' + crop.w + ' ' + crop.h + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
      '<g' + tf + '>' + parts.join('') + '</g>' +
      '</svg>';
  }

  /**
   * Build a default (unsaved) avatar for first-time users: base items
   * equipped with default colors, default skin-tone preset.
   */
  function buildDefaultAvatar(presets, allItems, bodyType) {
    bodyType = bodyType || 'male';
    var dp = getBodyPreset(presets, null, bodyType);
    var avatarData = {
      skin_tone: dp ? dp.id : '#f4d9c4',
      body_type: bodyType,
      equipped: {},
      pose: 'pose1'
    };
    // No base garments are auto-equipped: base-item art hasn't been
    // delivered, so a fresh avatar is the bare body until the user
    // equips something real. (Base items remain selectable in the editor.)
    return avatarData;
  }

  /**
   * Export the headshot as a PNG Blob (for storing as profiles.avatar_url).
   * SVGs loaded via <img> can't fetch external images, so the body PNG is
   * inlined as a data URI, the self-contained SVG is rasterized to a
   * square canvas, and a PNG blob is returned.
   */
  async function exportHeadshotPng(avatarData, presets, allItems, size) {
    size = size || 256;
    var svg = renderHeadshotSvg(avatarData, presets, allItems);

    // Inline every external <image href> as a data URI
    var hrefs = [];
    svg.replace(/href="(https?:[^"]+)"/g, function (m, u) { if (hrefs.indexOf(u) === -1) hrefs.push(u); return m; });
    for (var i = 0; i < hrefs.length; i++) {
      try {
        var resp = await fetch(hrefs[i]);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var blob = await resp.blob();
        var dataUri = await new Promise(function (res, rej) {
          var fr = new FileReader();
          fr.onload = function () { res(fr.result); };
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        svg = svg.split('href="' + hrefs[i] + '"').join('href="' + dataUri + '"');
      } catch (e) {
        // A single unreachable cosmetic asset must not block the whole
        // headshot save — drop that layer and carry on.
        if (window.console) console.warn('avatar export: skipping asset', hrefs[i], e);
        svg = svg.replace(new RegExp('<image[^>]*href="' +
          hrefs[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*/>', 'g'), '');
      }
    }

    // Explicit dimensions so Firefox rasterizes at full size
    svg = svg.replace('<svg ', '<svg width="' + size + '" height="' + size + '" ');

    var svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      var img = await new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () { res(im); };
        im.onerror = rej;
        im.src = svgUrl;
      });
      var canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
      return await new Promise(function (res, rej) {
        canvas.toBlob(function (b) { b ? res(b) : rej(new Error('toBlob failed')); }, 'image/png');
      });
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  /**
   * Fetch everything needed and render in one call.
   * @param {Object} db  - Supabase client
   * @param {String} uid - user id whose avatar to render
   * @param {Object} [opts] - passed through to renderSvg
   * @returns {Promise<{avatarData, presets, items, svg}>}
   */
  async function load(db, uid, opts) {
    var results = await Promise.all([
      db.from('user_avatars').select('*').eq('user_id', uid).maybeSingle(),
      db.from('cosmetic_items').select('*'),
      db.from('avatar_body_presets').select('*').eq('is_active', true).order('sort_order')
    ]);
    var presets = results[2].data || [];
    var items = results[1].data || [];
    var avatarData = results[0].data || buildDefaultAvatar(presets, items);
    if (avatarData && !avatarData.body_type) avatarData.body_type = 'male';
    return {
      avatarData: avatarData,
      presets: presets,
      items: items,
      svg: renderSvg(avatarData, presets, items, opts),
      headshotSvg: renderHeadshotSvg(avatarData, presets, items, opts)
    };
  }

  window.DSAvatar = {
    BODY_ASSET_BASE: BODY_ASSET_BASE,
    SLOT_ORDER: SLOT_ORDER,
    BODY_BOX: BODY_BOX,
    SLOT_PLACEHOLDER_SHAPES: SLOT_PLACEHOLDER_SHAPES,
    sanitizeHex: sanitizeHex,
    getBodyPreset: getBodyPreset,
    getPoseImagePath: getPoseImagePath,
    renderSvg: renderSvg,
    renderHeadshotSvg: renderHeadshotSvg,
    exportHeadshotPng: exportHeadshotPng,
    getHeadCrop: getHeadCrop,
    resolveAssetUrl: resolveAssetUrl,
    pickAssetPath: pickAssetPath,
    renderItemLayers: renderItemLayers,
    BG_BOX: BG_BOX,
    buildDefaultAvatar: buildDefaultAvatar,
    load: load
  };
})();
