# DawnScribe — Avatar Base Sheet Spec

The canonical template for **all** avatar base art and every garment/overlay drawn on top of it. Any sheet that follows this spec will align pixel-for-pixel with every other sheet.

## Why this exists

The first two deliveries used different canvases — male `3000×4000` (3:4), female `4000×4800` (5:6). Because the aspect ratios differed, the two could not be reconciled by resizing alone (that would stretch the figure). They also placed the head at different heights, which broke the circular headshot crop. This spec removes both problems permanently.

## Canvas

| Property | Value |
|---|---|
| Canvas size | **4000 × 4800 px** |
| Aspect ratio | 5:6 |
| Format | PNG-24 with alpha (transparent background) |
| Colour space | sRGB |

## Figure anchor (the important part)

These three numbers are what make overlays line up. They are non-negotiable.

| Anchor | Value |
|---|---|
| **Centerline X** | `2000` px (figure horizontally centred on this axis) |
| **Baseline Y (soles of feet)** | `4560` px |
| **Male figure height** | `3556` px (crown of head → soles) |
| **Female figure height** | `3307` px (93% of male) |

So the male crown sits at Y `1004` and the female crown at Y `1253`. Bottom padding is 240px below the feet; everything else is transparent margin.

Female is intentionally ~7% shorter than male — a natural height difference, not an error.

## Rules

1. **Never stretch.** If a sheet is the wrong size, scale it proportionally and pad with transparency. Distorting the aspect ratio is never acceptable.
2. **Never upscale** if it can be avoided. Deliver at or above the target figure height so the pipeline only ever scales down.
3. **Pose variants** (`_a`, `_b`) must share the same baseline and centerline. Only the limbs change between poses — the crown height and foot line stay put.
4. **Skin tones** are the same linework at different fills. All 8 tones of a gender/pose must be pixel-identical in geometry.
5. **Garments and overlays** are drawn on this exact canvas at these exact anchors, one file per body type. A male shirt and a female shirt are separate art.

## File naming

```
body/<gender>/<tone>_<pose>.png
```

- `<gender>` — `male` | `female`
- `<tone>` — `porcelain`, `peach`, `sand`, `tan`, `honey`, `caramel`, `chestnut`, `espresso`
- `<pose>` — `a` | `b`

Example: `body/female/caramel_b.png`

## Verifying a delivery

Open `normalize-bases.html`, point it at the files, and hit run. Every row must read **aligned**. The overlay check should show male and female sharing the red baseline and blue centerline exactly. Anything reading OFF-ANCHOR needs to go back to the artist or be run through the normalizer.

## Downstream note — head crops

The headshot crop (`avatar_body_presets.head_crops`) depends on where the head sits. It is currently tuned for the **pre-normalization** art. If you replace the base sheets with normalized versions, the crops must be re-measured for both genders, because the figures move. Do not swap the art and the crops separately — they change together.
