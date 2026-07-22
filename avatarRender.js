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


  // ── BACKGROUNDS ───────────────────────────────────────────────
  // Hand-authored procedural SVG backgrounds (pure gradients + geometry,
  // no raster art). Each fills the full 320x480 viewBox and renders as
  // the bottom-most layer, outside the position/mirror transform.
  // cosmetic_items rows reference these via image_url = 'ds-bg:<key>'.
  // Gradient/filter ids are prefixed per-key so multiple avatars on one
  // page never collide (identical keys share identical defs — safe).
  var BACKGROUNDS = {
    sunrise_sky: { name: 'Sunrise Sky', svg:
      '<defs><linearGradient id="dsbg_sun_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2b3a67"/><stop offset="0.45" stop-color="#b06a8f"/>' +
      '<stop offset="0.75" stop-color="#f4a259"/><stop offset="1" stop-color="#ffd97d"/></linearGradient>' +
      '<radialGradient id="dsbg_sun_b" cx="0.5" cy="0.82" r="0.5">' +
      '<stop offset="0" stop-color="#fff3c4" stop-opacity="0.95"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_sun_a)"/>' +
      '<circle cx="160" cy="400" r="46" fill="#ffe8a3"/>' +
      '<rect width="320" height="480" fill="url(#dsbg_sun_b)"/>' +
      '<path d="M0 452 Q80 434 160 448 T320 444 L320 480 L0 480 Z" fill="#5c3a54" opacity="0.55"/>' },

    night_stars: { name: 'Night Stars', svg:
      '<defs><linearGradient id="dsbg_nst_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#05070f"/><stop offset="0.6" stop-color="#101a33"/>' +
      '<stop offset="1" stop-color="#1d2b4d"/></linearGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_nst_a)"/>' +
      '<circle cx="252" cy="76" r="26" fill="#f4f1de"/><circle cx="243" cy="70" r="24" fill="#101a33"/>' +
      '<g fill="#f4f1de"><circle cx="36" cy="52" r="1.6"/><circle cx="88" cy="120" r="1.2"/>' +
      '<circle cx="140" cy="40" r="1.8"/><circle cx="196" cy="150" r="1.1"/><circle cx="290" cy="180" r="1.5"/>' +
      '<circle cx="60" cy="210" r="1.3"/><circle cx="120" cy="260" r="1"/><circle cx="270" cy="300" r="1.4"/>' +
      '<circle cx="30" cy="330" r="1.1"/><circle cx="170" cy="90" r="1.3"/><circle cx="230" cy="230" r="1"/>' +
      '<circle cx="300" cy="60" r="1.2"/><circle cx="70" cy="400" r="1"/><circle cx="150" cy="360" r="1.2"/></g>' },

    aurora_veil: { name: 'Aurora Veil', svg:
      '<defs><linearGradient id="dsbg_aur_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#050b18"/><stop offset="1" stop-color="#0e1f2e"/></linearGradient>' +
      '<linearGradient id="dsbg_aur_b" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2dd4bf" stop-opacity="0"/><stop offset="0.5" stop-color="#2dd4bf" stop-opacity="0.55"/>' +
      '<stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></linearGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_aur_a)"/>' +
      '<path d="M-20 60 Q80 120 60 250 Q50 330 110 420 L60 420 Q10 320 20 230 Q30 130 -20 100 Z" fill="url(#dsbg_aur_b)"/>' +
      '<path d="M120 20 Q220 90 200 220 Q192 310 250 410 L200 410 Q150 300 160 210 Q170 110 100 60 Z" fill="url(#dsbg_aur_b)" opacity="0.8"/>' +
      '<path d="M260 40 Q330 110 300 260 L330 260 L330 40 Z" fill="url(#dsbg_aur_b)" opacity="0.6"/>' +
      '<g fill="#e2e8f0"><circle cx="50" cy="40" r="1.2"/><circle cx="280" cy="90" r="1.4"/><circle cx="150" cy="150" r="1"/><circle cx="90" cy="300" r="1.1"/><circle cx="240" cy="330" r="1.2"/></g>' },

    old_library: { name: 'Old Library', svg:
      '<defs><linearGradient id="dsbg_lib_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#3b2a1e"/><stop offset="1" stop-color="#221710"/></linearGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_lib_a)"/>' +
      '<g><rect x="0" y="110" width="320" height="10" fill="#54382a"/><rect x="0" y="240" width="320" height="10" fill="#54382a"/><rect x="0" y="370" width="320" height="10" fill="#54382a"/></g>' +
      '<g opacity="0.95">' +
      '<rect x="18" y="52" width="14" height="58" fill="#8d3b3b"/><rect x="34" y="60" width="12" height="50" fill="#3e5c4a"/><rect x="48" y="48" width="16" height="62" fill="#a06a2c"/><rect x="66" y="64" width="11" height="46" fill="#4a4e69"/><rect x="80" y="55" width="14" height="55" fill="#6d3b53"/>' +
      '<rect x="228" y="50" width="13" height="60" fill="#3e5c4a"/><rect x="243" y="62" width="15" height="48" fill="#8d3b3b"/><rect x="260" y="54" width="12" height="56" fill="#4a4e69"/><rect x="274" y="66" width="14" height="44" fill="#a06a2c"/><rect x="290" y="52" width="13" height="58" fill="#6d3b53"/>' +
      '<rect x="20" y="184" width="15" height="56" fill="#4a4e69"/><rect x="37" y="192" width="12" height="48" fill="#a06a2c"/><rect x="51" y="180" width="14" height="60" fill="#3e5c4a"/><rect x="67" y="196" width="12" height="44" fill="#8d3b3b"/>' +
      '<rect x="240" y="186" width="14" height="54" fill="#6d3b53"/><rect x="256" y="178" width="12" height="62" fill="#a06a2c"/><rect x="270" y="194" width="15" height="46" fill="#3e5c4a"/><rect x="287" y="184" width="13" height="56" fill="#4a4e69"/>' +
      '<rect x="16" y="314" width="13" height="56" fill="#8d3b3b"/><rect x="31" y="322" width="15" height="48" fill="#4a4e69"/><rect x="48" y="310" width="12" height="60" fill="#a06a2c"/>' +
      '<rect x="252" y="316" width="14" height="54" fill="#3e5c4a"/><rect x="268" y="308" width="12" height="62" fill="#6d3b53"/><rect x="282" y="322" width="15" height="48" fill="#8d3b3b"/></g>' +
      '<rect width="320" height="480" fill="#1a0f08" opacity="0.25"/>' },

    warm_parchment: { name: 'Warm Parchment', svg:
      '<defs><radialGradient id="dsbg_par_a" cx="0.5" cy="0.4" r="0.9">' +
      '<stop offset="0" stop-color="#f2e3c6"/><stop offset="1" stop-color="#d9c39a"/></radialGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_par_a)"/>' +
      '<g stroke="#b89b6a" stroke-width="1" opacity="0.5">' +
      '<line x1="30" y1="90" x2="290" y2="90"/><line x1="30" y1="130" x2="290" y2="130"/>' +
      '<line x1="30" y1="350" x2="290" y2="350"/><line x1="30" y1="390" x2="290" y2="390"/></g>' +
      '<path d="M40 60 q6 -14 20 -8" stroke="#a3824f" stroke-width="2" fill="none" opacity="0.6"/>' +
      '<path d="M260 420 q10 8 22 2" stroke="#a3824f" stroke-width="2" fill="none" opacity="0.6"/>' +
      '<rect width="320" height="480" fill="none" stroke="#8a6a3d" stroke-width="6" opacity="0.35"/>' },

    rainy_window: { name: 'Rainy Window', svg:
      '<defs><linearGradient id="dsbg_rain_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#33415c"/><stop offset="1" stop-color="#1b2436"/></linearGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_rain_a)"/>' +
      '<g stroke="#8ecae6" stroke-width="2" stroke-linecap="round" opacity="0.5">' +
      '<line x1="40" y1="20" x2="34" y2="90"/><line x1="90" y1="60" x2="84" y2="150"/>' +
      '<line x1="140" y1="10" x2="136" y2="70"/><line x1="190" y1="90" x2="184" y2="180"/>' +
      '<line x1="240" y1="30" x2="236" y2="110"/><line x1="290" y1="70" x2="284" y2="160"/>' +
      '<line x1="60" y1="200" x2="56" y2="280"/><line x1="120" y1="240" x2="116" y2="330"/>' +
      '<line x1="220" y1="220" x2="214" y2="300"/><line x1="270" y1="260" x2="266" y2="350"/>' +
      '<line x1="30" y1="360" x2="26" y2="430"/><line x1="170" y1="380" x2="166" y2="450"/></g>' +
      '<g fill="#8ecae6" opacity="0.6"><circle cx="34" cy="94" r="3"/><circle cx="84" cy="154" r="3"/><circle cx="184" cy="184" r="3"/><circle cx="284" cy="164" r="3"/><circle cx="116" cy="334" r="3"/><circle cx="266" cy="354" r="3"/></g>' +
      '<rect x="154" y="0" width="6" height="480" fill="#101828" opacity="0.7"/>' +
      '<rect x="0" y="236" width="320" height="6" fill="#101828" opacity="0.7"/>' },

    forest_glade: { name: 'Forest Glade', svg:
      '<defs><linearGradient id="dsbg_for_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#a3c9a8"/><stop offset="0.6" stop-color="#5e8c61"/><stop offset="1" stop-color="#33532f"/></linearGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_for_a)"/>' +
      '<g fill="#2e4a2a" opacity="0.85">' +
      '<path d="M30 480 L30 140 L20 140 Q26 60 42 140 L40 140 L40 480 Z"/>' +
      '<path d="M282 480 L282 120 L272 120 Q280 40 296 120 L292 120 L292 480 Z"/>' +
      '<ellipse cx="30" cy="120" rx="42" ry="52"/><ellipse cx="286" cy="96" rx="48" ry="58"/></g>' +
      '<g fill="#243d20" opacity="0.6"><ellipse cx="70" cy="60" rx="60" ry="36"/><ellipse cx="250" cy="40" rx="66" ry="34"/></g>' +
      '<g fill="#f6f4d2" opacity="0.55"><circle cx="120" cy="200" r="2"/><circle cx="200" cy="160" r="1.6"/><circle cx="160" cy="260" r="1.8"/><circle cx="90" cy="310" r="1.5"/><circle cx="230" cy="290" r="1.7"/></g>' +
      '<path d="M0 452 Q100 436 200 450 T320 446 L320 480 L0 480 Z" fill="#243d20" opacity="0.7"/>' },

    ocean_horizon: { name: 'Ocean Horizon', svg:
      '<defs><linearGradient id="dsbg_oce_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#bde0fe"/><stop offset="0.55" stop-color="#7fb8e6"/><stop offset="0.56" stop-color="#1c6ea4"/><stop offset="1" stop-color="#0b4a75"/></linearGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_oce_a)"/>' +
      '<circle cx="240" cy="120" r="30" fill="#fff7d6" opacity="0.9"/>' +
      '<g stroke="#e0fbfc" stroke-width="2.5" fill="none" opacity="0.55" stroke-linecap="round">' +
      '<path d="M20 300 q16 -8 32 0 q16 8 32 0"/><path d="M180 330 q16 -8 32 0 q16 8 32 0"/>' +
      '<path d="M70 380 q16 -8 32 0 q16 8 32 0"/><path d="M210 420 q16 -8 32 0 q16 8 32 0"/>' +
      '<path d="M20 440 q16 -8 32 0"/></g>' +
      '<g fill="#f8f9fa" opacity="0.9"><path d="M60 150 q8 6 16 0 q-8 4 -16 0"/><path d="M120 100 q8 6 16 0 q-8 4 -16 0"/></g>' },

    moonlit_clouds: { name: 'Moonlit Clouds', svg:
      '<defs><linearGradient id="dsbg_moo_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#1a2238"/><stop offset="1" stop-color="#39466b"/></linearGradient>' +
      '<radialGradient id="dsbg_moo_b" cx="0.72" cy="0.2" r="0.4">' +
      '<stop offset="0" stop-color="#f8f7ff" stop-opacity="0.8"/><stop offset="1" stop-color="#f8f7ff" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_moo_a)"/>' +
      '<rect width="320" height="480" fill="url(#dsbg_moo_b)"/>' +
      '<circle cx="230" cy="96" r="34" fill="#f4f1de"/>' +
      '<g fill="#535f85" opacity="0.9">' +
      '<ellipse cx="80" cy="180" rx="70" ry="22"/><ellipse cx="140" cy="196" rx="60" ry="18"/>' +
      '<ellipse cx="250" cy="270" rx="80" ry="24"/><ellipse cx="190" cy="286" rx="56" ry="16"/>' +
      '<ellipse cx="60" cy="380" rx="76" ry="22"/><ellipse cx="130" cy="396" rx="58" ry="16"/></g>' +
      '<g fill="#8d99c4" opacity="0.7"><ellipse cx="90" cy="172" rx="46" ry="14"/><ellipse cx="256" cy="262" rx="52" ry="15"/><ellipse cx="66" cy="372" rx="48" ry="14"/></g>' },

    candlelit_study: { name: 'Candlelit Study', svg:
      '<defs><radialGradient id="dsbg_can_a" cx="0.5" cy="0.62" r="0.75">' +
      '<stop offset="0" stop-color="#7a4a1e"/><stop offset="0.55" stop-color="#3d2410"/><stop offset="1" stop-color="#160c05"/></radialGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_can_a)"/>' +
      '<rect x="0" y="404" width="320" height="76" fill="#2a180a"/>' +
      '<rect x="44" y="360" width="10" height="44" rx="3" fill="#e9dcc5"/>' +
      '<ellipse cx="49" cy="356" rx="5" ry="9" fill="#ffb703"/><ellipse cx="49" cy="353" rx="2.4" ry="5" fill="#fff1b6"/>' +
      '<rect x="256" y="368" width="9" height="36" rx="3" fill="#e9dcc5"/>' +
      '<ellipse cx="260.5" cy="364" rx="4.4" ry="8" fill="#ffb703"/><ellipse cx="260.5" cy="361" rx="2" ry="4.4" fill="#fff1b6"/>' +
      '<g opacity="0.9"><rect x="120" y="392" width="80" height="8" rx="2" fill="#8d3b3b"/><rect x="128" y="384" width="66" height="8" rx="2" fill="#3e5c4a"/><rect x="136" y="376" width="52" height="8" rx="2" fill="#a06a2c"/></g>' },

    sakura_breeze: { name: 'Sakura Breeze', svg:
      '<defs><linearGradient id="dsbg_sak_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffe5ec"/><stop offset="1" stop-color="#f7c6d9"/></linearGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_sak_a)"/>' +
      '<path d="M-10 20 Q60 40 40 130 Q30 190 -10 210 Z" fill="#5c374c" opacity="0.85"/>' +
      '<g fill="#f28fad"><ellipse cx="46" cy="60" rx="44" ry="34"/><ellipse cx="10" cy="110" rx="40" ry="30"/></g>' +
      '<g fill="#fbb1c8" opacity="0.9"><ellipse cx="60" cy="46" rx="26" ry="18"/><ellipse cx="22" cy="96" rx="24" ry="16"/></g>' +
      '<g fill="#f28fad">' +
      '<path d="M140 120 q6 -8 12 0 q-6 8 -12 0"/><path d="M220 80 q6 -8 12 0 q-6 8 -12 0"/>' +
      '<path d="M260 180 q6 -8 12 0 q-6 8 -12 0"/><path d="M180 240 q6 -8 12 0 q-6 8 -12 0"/>' +
      '<path d="M120 320 q6 -8 12 0 q-6 8 -12 0"/><path d="M240 340 q6 -8 12 0 q-6 8 -12 0"/>' +
      '<path d="M80 420 q6 -8 12 0 q-6 8 -12 0"/><path d="M290 430 q6 -8 12 0 q-6 8 -12 0"/></g>' },

    inkfall: { name: 'Inkfall', svg:
      '<defs><linearGradient id="dsbg_ink_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#0d1321"/><stop offset="1" stop-color="#1d2d44"/></linearGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_ink_a)"/>' +
      '<g fill="#2dd4bf" opacity="0.85">' +
      '<path d="M40 0 L40 90 q0 12 -8 12 q-8 0 -8 -12 L24 60 q8 20 16 0 Z" opacity="0.7"/>' +
      '<path d="M120 0 L120 150 q0 14 -9 14 q-9 0 -9 -14 L102 100 q9 26 18 0 Z" opacity="0.5"/>' +
      '<path d="M210 0 L210 60 q0 10 -7 10 q-7 0 -7 -10 L196 40 q7 16 14 0 Z" opacity="0.8"/>' +
      '<path d="M290 0 L290 120 q0 12 -8 12 q-8 0 -8 -12 L274 80 q8 22 16 0 Z" opacity="0.6"/></g>' +
      '<g fill="#2dd4bf"><circle cx="34" cy="130" r="3" opacity="0.7"/><circle cx="112" cy="196" r="3.5" opacity="0.5"/><circle cx="204" cy="98" r="2.6" opacity="0.8"/><circle cx="283" cy="160" r="3" opacity="0.6"/><circle cx="70" cy="300" r="2" opacity="0.4"/><circle cx="250" cy="330" r="2.4" opacity="0.4"/></g>' },

    golden_field: { name: 'Golden Field', svg:
      '<defs><linearGradient id="dsbg_gol_a" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffd166"/><stop offset="0.5" stop-color="#f4a259"/><stop offset="1" stop-color="#bc6c25"/></linearGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_gol_a)"/>' +
      '<circle cx="160" cy="180" r="40" fill="#fff3c4" opacity="0.9"/>' +
      '<path d="M0 380 Q90 356 180 376 T320 370 L320 480 L0 480 Z" fill="#a8681f"/>' +
      '<path d="M0 410 Q110 392 220 408 T320 402 L320 480 L0 480 Z" fill="#8a5416"/>' +
      '<g stroke="#e8b34b" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.9">' +
      '<path d="M40 420 q-4 -22 4 -40"/><path d="M80 432 q4 -24 -2 -44"/><path d="M130 424 q-4 -22 4 -40"/>' +
      '<path d="M200 434 q4 -24 -2 -44"/><path d="M250 426 q-4 -22 4 -40"/><path d="M290 438 q4 -22 -2 -42"/></g>' },

    starlit_galaxy: { name: 'Starlit Galaxy', svg:
      '<defs><radialGradient id="dsbg_gal_a" cx="0.5" cy="0.42" r="0.85">' +
      '<stop offset="0" stop-color="#2a1a4a"/><stop offset="0.55" stop-color="#140d2b"/><stop offset="1" stop-color="#06040f"/></radialGradient>' +
      '<linearGradient id="dsbg_gal_b" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#7c3aed" stop-opacity="0"/><stop offset="0.5" stop-color="#a78bfa" stop-opacity="0.5"/>' +
      '<stop offset="1" stop-color="#2dd4bf" stop-opacity="0"/></linearGradient></defs>' +
      '<rect width="320" height="480" fill="url(#dsbg_gal_a)"/>' +
      '<path d="M-20 320 Q120 140 340 120 L340 200 Q140 220 -20 400 Z" fill="url(#dsbg_gal_b)"/>' +
      '<g fill="#f8f7ff"><circle cx="50" cy="70" r="1.6"/><circle cx="120" cy="130" r="1.2"/><circle cx="200" cy="60" r="1.8"/>' +
      '<circle cx="270" cy="140" r="1.3"/><circle cx="90" cy="220" r="1.5"/><circle cx="180" cy="190" r="1.1"/>' +
      '<circle cx="250" cy="250" r="1.6"/><circle cx="60" cy="330" r="1.2"/><circle cx="150" cy="300" r="1.9"/>' +
      '<circle cx="230" cy="370" r="1.2"/><circle cx="300" cy="320" r="1.4"/><circle cx="40" cy="430" r="1.3"/>' +
      '<circle cx="190" cy="430" r="1.5"/><circle cx="280" cy="440" r="1.1"/></g>' +
      '<g fill="#c4b5fd" opacity="0.9"><circle cx="140" cy="220" r="2.6"/><circle cx="222" cy="160" r="2.2"/></g>' }
  };

  function getBackgroundDef(key) {
    return (key && BACKGROUNDS[key]) || null;
  }

  // cosmetic_items rows encode their registry key as image_url = 'ds-bg:<key>'
  function getItemBackgroundKey(item) {
    if (!item || !item.image_url) return null;
    var m = /^ds-bg:([a-z0-9_]+)$/.exec(String(item.image_url));
    return m ? m[1] : null;
  }

  // Resolve the equipped background's SVG markup (or '' if none/suppressed).
  function renderBackgroundLayer(avatarData, allItems, skipSlots) {
    if ((skipSlots || []).indexOf('background') !== -1) return '';
    var eq = (avatarData.equipped || {}).background;
    if (!eq) return '';
    var item = (allItems || []).find(function (it) { return it.id === eq.item_id; });
    var def = getBackgroundDef(getItemBackgroundKey(item));
    return def ? def.svg : '';
  }

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

    var bgLayer = renderBackgroundLayer(avatarData, allItems, skipSlots);

    return '<svg viewBox="0 0 320 480" xmlns="http://www.w3.org/2000/svg">' +
      bgLayer +
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
    var preset = getBodyPreset(presets, avatarData.skin_tone);
    if (preset) {
      var bodyPath = getPoseImagePath(preset, avatarData.pose || 'pose1');
      if (bodyPath) {
        parts.push('<image href="' + BODY_ASSET_BASE + bodyPath + '" x="' + BODY_BOX.x + '" y="' + BODY_BOX.y + '" width="' + BODY_BOX.w + '" height="' + BODY_BOX.h + '" preserveAspectRatio="xMidYMax meet"/>');
      }
    }

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

    var bgLayer = renderBackgroundLayer(avatarData, allItems, skipSlots);

    return '<svg viewBox="' + crop.x + ' ' + crop.y + ' ' + crop.w + ' ' + crop.h + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">' +
      bgLayer +
      '<g' + tf + '>' + parts.join('') + '</g>' +
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
      var resp = await fetch(hrefs[i]);
      var blob = await resp.blob();
      var dataUri = await new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      svg = svg.split('href="' + hrefs[i] + '"').join('href="' + dataUri + '"');
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
    BACKGROUNDS: BACKGROUNDS,
    getBackgroundDef: getBackgroundDef,
    getItemBackgroundKey: getItemBackgroundKey,
    getPoseImagePath: getPoseImagePath,
    renderSvg: renderSvg,
    renderHeadshotSvg: renderHeadshotSvg,
    exportHeadshotPng: exportHeadshotPng,
    getHeadCrop: getHeadCrop,
    buildDefaultAvatar: buildDefaultAvatar,
    load: load
  };
})();
