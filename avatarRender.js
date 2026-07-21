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

  // TEMP: placeholder cosmetic layers disabled — real body artwork is
  // live and the test shapes drew over it. Flip to true (or replace
  // with real art layers) when illustrated cosmetic assets arrive.
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

  function getBodyPreset(presets, key) {
    presets = presets || [];
    var p = presets.find(function (b) { return b.id === key; });
    if (p) return p;
    return presets.find(function (b) { return b.is_default; }) || presets[0] || null;
  }

  function getPoseImagePath(preset, pose) {
    if (!preset) return null;
    var paths = preset.pose_paths || {};
    return paths[pose] || paths.pose1 || preset.image_path || null;
  }

  /**
   * Render the avatar SVG string.
   * @param {Object} avatarData - row from user_avatars (or default-shaped object)
   * @param {Array}  presets    - active rows from avatar_body_presets
   * @param {Array}  allItems   - rows from cosmetic_items (only needed for placeholder layers)
   * @param {Object} [opts]     - { applyPosition: true, applyMirror: true }
   */
  function renderSvg(avatarData, presets, allItems, opts) {
    avatarData = avatarData || {};
    allItems = allItems || [];
    opts = opts || {};
    var applyPosition = opts.applyPosition !== false;
    var applyMirror = opts.applyMirror !== false;

    var parts = [];

    // Base body: pre-colored artwork preset resolved from skin_tone.
    var preset = getBodyPreset(presets, avatarData.skin_tone);
    if (preset) {
      var bodyPath = getPoseImagePath(preset, avatarData.pose || 'pose1');
      if (bodyPath) {
        parts.push('<image href="' + BODY_ASSET_BASE + bodyPath + '" x="' + BODY_BOX.x + '" y="' + BODY_BOX.y + '" width="' + BODY_BOX.w + '" height="' + BODY_BOX.h + '" preserveAspectRatio="xMidYMax meet"/>');
      }
    }

    // Equipped item layers, in SLOT_ORDER (bottom to top).
    if (RENDER_PLACEHOLDER_LAYERS) SLOT_ORDER.forEach(function (slot) {
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
   * Build a default (unsaved) avatar for first-time users: base items
   * equipped with default colors, default skin-tone preset.
   */
  function buildDefaultAvatar(presets, allItems) {
    var dp = getBodyPreset(presets, null);
    var avatarData = { skin_tone: dp ? dp.id : '#f4d9c4', equipped: {}, pose: 'pose1' };
    (allItems || []).filter(function (it) { return it.is_base_item; }).forEach(function (it) {
      var colors = {};
      (it.fill_regions || []).forEach(function (r) { colors[r.id] = r.default_color; });
      avatarData.equipped[it.slot] = { item_id: it.id, colors: colors };
    });
    return avatarData;
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
    return {
      avatarData: avatarData,
      presets: presets,
      items: items,
      svg: renderSvg(avatarData, presets, items, opts)
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
    buildDefaultAvatar: buildDefaultAvatar,
    load: load
  };
})();
