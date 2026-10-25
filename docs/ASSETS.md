# Assets: what is placeholder, what you must supply

**The build uses code-drawn placeholders. It is not asset-final.** Avatars follow your latest mockup (non-human, customisable blobs); they are drawn by one SVG function (`apps/web/src/components/Avatar.tsx`) used in the lobby, results, editor and — rasterised — the Phaser staircase. If you want illustrated production avatars, keep the same `AvatarConfig` fields (body, eyes, glasses, headwear, gear) so saved choices stay valid.

| Asset | Today | Where it lives | What to supply |
|---|---|---|---|
| A. Landing hero (desktop + mobile) | SVG placeholder scene | `components/art.tsx` → `HeroArt` | Original art per the brief below: ~2400×1400 desktop, ~1080×1440 mobile, AVIF/WebP at 2–3 widths, plus a background-only variant. No text/UI/logos/sacred figures/verses. Quiet dark space left of centre on desktop; clear top band on mobile. |
| B. Gameplay staircase | Procedural scene, baked once into one canvas texture | `scene/staircase.ts` (`stairGeometry()` = step coordinates/scale anchors) | Perspective staircase with wide treads, no numbers (numbers are drawn in code), plus a JSON of tread coordinates/scale anchors and foreground occlusion masks. 10–30 steps must work without baked numbers. |
| C. Avatar sprites | SVG blobs (static pose; Phaser tweens for climb/fall/bob) | `components/Avatar.tsx` | Optional: transparent PNG/WebP atlases + frame metadata for idle, climb, descend, celebrate, back-view and portrait; consistent canvas, ground anchor, proportions. Verify frame registration/feet placement/loop continuity; record licences. |
| D. Category illustrations | SVG gradient + motif | `components/art.tsx` → `CategoryArt` | 4–7 text-free illustrations (Qur’an, Hadith, Seerah, Prophets, History, Practices, Mixed), 320×180 @2x, WebP. |
| Emblem/wordmark, favicon, app icons | Eight-point star SVG | `public/favicon.svg`, `Layout.tsx` → `Emblem` | Final mark; export favicons/PWA icons. |
| E. Sound | Synthesised beeps, off by default | `lib/sound.ts` | Optional short neutral UI sounds with licence/provenance. No music/devotional audio. |
| Questions | 50 **unreviewed** dev fixtures | `apps/server/src/db/fixtures.ts` | Reviewed content via Admin import. |

## Generation brief (A)
"Original cinematic Islamic-inspired architectural adventure world for ElimQuest. Grand tiled arches, lantern-lit continuous staircase, sandstone terraces, navy night sky, teal atmospheric depth, warm amber illumination. Mature stylised game art, not photorealistic humans and not preschool cartoon. A few small non-human blob adventurers seen from behind. Desktop composition leaves quiet dark space on the left for HTML headline and controls; architecture and ascending path dominate the right. No text, UI, logos, sacred figures, sacred verses, awards, or copied game characters. Create a separate mobile crop retaining clear space for UI."

## Brief (B)
"Perspective staircase viewed from behind a player at its base, ascending toward a distant decorative arch. Wide clearly distinguishable treads support several characters side-by-side. Original navy/teal Islamic geometric architecture and warm lantern edges. No characters, no stair numbers, no UI, no text, no sacred figures. Consistent lighting and camera."

## Budgets and measured sizes (this build)
Initial home page JS ≈ 74 KB gzip + CSS 12 KB gzip + one font subset; Phaser chunk (lazy, game screens only) ≈ 357 KB gzip. Both are far under the 1 MB / 3 MB budgets, but the placeholders are tiny; **re-measure with real art** (use compressed AVIF/WebP, explicit dimensions). Machine-readable list: `docs/assets-manifest.json`.
