# Sunpetal Vale — 3D asset concept sheet

Concept-art pass for **new 3D assets** for the anime meadow map. Discovery + concept
only: **no 3D conversion has been run** (no Tripo, no Hi3D). Six concepts, one asset per
image, ready to be fed to an image-to-3D model **after human approval**.

- Generated with `gpt-image-2_5` (`generate_image`), 1254 × 1254 px, 1:1.
- Every image: one isolated object, 3/4 view, whole object in frame, flat neutral
  mid-grey background, matte flat colour, no text/UI/border.
- Style source: `ref-b-valley-wide.png` passed as the single style `reference_image`
  (palette + shading language only, composition explicitly excluded).
- Result: **6/6 accepted on the first generation, 0 retries.**

## Style references (screenshots, not deliverables)

| File | What it shows |
|---|---|
| `concepts/ref-b-valley-wide.png` | **Primary style target.** Ground composition: turf colour drift, flower clumps, faceted boulders, dappled canopy shadow. Used as the generation style reference. |
| `concepts/ref-b-valley.png` | Flower close-up from the same studio scene: flat-faceted petals, 3-tone lilac masses, no gloss. |
| `concepts/ref-c-before-flat-map.png` | The **"before"** state (`game/handoff/shots/vale-meadow.png`): flat green plane, hard-edged beige path, washed-out light. What we are replacing. |

Note on the two `file://` reference pages:

- `sunlit_anime_meadow_modular_3d_botanical_studio_scene.html` rendered correctly and is
  the real style reference (shots above).
- `ai_studio_code (31).html` is titled "AAA Stylized Evening Meadow & Botanical Asset
  Engine" but at 1400 × 1200 it renders a **macro flower-field demo**, not the map, and is
  over-exposed. Not usable as a style reference, so the map's own `vale-meadow.png`
  screenshot was used as the "before" fallback instead.

## The six concepts

| # | Asset | Why the map needs it | Where it goes (metres) | Concept file | Priority | Modelling note |
|---|---|---|---|---|---|---|
| 1 | **Hero tree** — layered broadleaf, ~10 m | The one signature silhouette; anchors the north landmark and gives the gameplay camera something to read against the sky | `(0, -38)`, north feature composition; canopy ~4.5 m radius, frames the north path terminus | `concepts/concept-01-hero-tree.png` | **A** | 2.5–3k tris. Tapered 6-sided trunk + 3 branches; 9–10 flattened icosphere puffs (6–8 sides) with 3-tone vertex gradient and pale rim on the sun side. Pivot at base, canopy starts ~4.5 m up so the trunk reads. |
| 2 | **Broadleaf variant** — slim, ~7 m | Workhorse of the perimeter woods and the `(36,24)` grove; repeats 40–60× so it must be cheap | Woodland wall outside `[-46,46]`; grove at `(36,24)`; lake overlook `(-40,-10)` | `concepts/concept-02-broadleaf-tree.png` | B | 1.5–2k tris. 5–6 puffs in a taller oval, straighter trunk; same material as the hero tree so both can share instancing. |
| 3 | **Conifer** — stacked tiers, ~8 m | Builds the far tree-wall silhouette on the scenic ring; without it the horizon is only broadleaf domes | Scenic ring r 80–140, denser north-east / north-west ridges | `concepts/concept-03-conifer.png` | **A** | 1.2–1.8k tris. 6 stacked 8-sided skirt tiers with alternating vertex radii for the zig-zag edge; dark under-faces via vertex colour; short trunk at base. |
| 4 | **Bush / fern cluster** — ~1.2 m | Fills path shoulders and meadow edges so the grass meets the woods without a hard line; cheapest depth cue | Path shoulders along the whole loop; meadow edge drifts; lake shore | `concepts/concept-04-bush-fern.png` | B | 600–900 tris. 3 overlapping rosettes × 7–9 tapered blade quads bent over 3 segments; colour ramps dark base → bright tip. |
| 5 | **Mossy boulder group** — ~1.4 m | Grounds the terrain, breaks up the flat meadow, dresses the lake shore; reusable 15–25× | Lake west shore `X -78..-50, Z -25..18`; meadow accents e.g. `(-52,-2)`, `(12,-20)`, `(28,10)` | `concepts/concept-05-mossy-boulder.png` | **A** | 400–700 tris. 2–3 chiselled icospheres (level 1) with vertex jitter, flat shaded; moss as a slightly inflated shell with a noisy boundary (vertex-colour mask). |
| 6 | **Broken stone arch** — Wishing Arch, ~4 m tall | The POI / path terminus; gives the shrine an actual structure instead of a bare clearing | `(0, -31)` — north loop vertex, framing the hero tree at `(0,-38)` | `concepts/concept-06-broken-arch.png` | **A** | 1.5–2.5k tris. Two 7–9-block beveled pillars + stepped bases, lintel of 4 blocks with a jagged diagonal break; 3–4 mesh islands are fine, still one asset. No gate, no door, no carving. |

## Recommended priority batch for 3D conversion (4)

**Convert these four first: #1 hero tree, #6 broken arch, #5 mossy boulder group, #3 conifer.**

Why this set:

- **Hero tree + broken arch** are the only *unique landmarks* on the map. They define the
  north shrine composition and the map's silhouette identity; nothing procedural can fake
  them, and they are the assets the user will actually notice.
- **Mossy boulder** is the highest reuse-per-triangle asset on the list (400–700 tris,
  15–25 instances) and instantly fixes the "flat plane" read at ground level.
- **Conifer** is what makes the scenic ring read as a *far tree wall* rather than a row of
  domes; it is the cheapest way to buy horizon depth.

Left for batch B: **#2 broadleaf variant** and **#4 bush/fern cluster**. They are valuable
but `foliage.js` can approximate both procedurally in the meantime, and they are the two
most instance-heavy assets, so they benefit from being converted once the style is locked
by batch A.

## Prompts used

Shared style block (prepended to every prompt):

> Stylised anime low-poly game asset concept art. ONE single isolated object, centred,
> fully in frame with clear empty margin, on a flat uniform neutral mid-grey background
> (#8f8f8f), three-quarter view slightly above eye level, wide 1:1 square composition.
> The reference image is a STYLE reference only for palette and shading language — ignore
> its composition completely; the output must be a single isolated object on grey, not a
> meadow scene. **Matte flat-colour stylised game asset, no glossy highlights, no dramatic
> glow, neutral white balance, no yellow cast.** Faceted flat-shaded low-poly geometry,
> clean readable silhouette, three-tone shading only (light, mid, shadow) with a subtle
> pale rim on the sun-facing top edge, anime cel-shaded look, solid flat colour masses, no
> textures, no surface noise, no bump maps. Even soft diffuse studio lighting, no cast
> shadow on the background, no ground plane, no floor. No text, no labels, no UI, no
> border, no frame, no people.

Negative tail (appended to every prompt):

> Negative :: ai slop, ai generated, overly yellow images, amber color cast, plastic
> looking, glossy sheen, overly polished, text, watermark

Per-asset `SUBJECT` lines:

1. **Hero tree** — "a single large hero broadleaf tree about 10 metres tall. A thick tapered
   warm-brown trunk (#8a6244 with dark #5f4331 underside) that splits into three visible
   branches. The canopy is a broad rounded dome built from nine or ten flattened,
   overlapping leaf-puff masses with clear gaps between them, never a sphere. Colour
   blocks: deep sage-green shadow puffs underneath (#3f7a4c), mid lime-green body
   (#77b74f), bright yellow-green sunlit tops (#b8dd6c), and a pale yellow rim (#eaf7ab)
   on the sun side."
2. **Broadleaf variant** — "a single slender broadleaf tree about 7 metres tall, a slimmer
   sibling variant of a big hero tree. Straight narrow warm-brown trunk … The canopy is a
   tall upright oval built from five or six flattened overlapping leaf-puff masses,
   clearly separated with small gaps, never a sphere."
3. **Conifer** — "a single stylised conifer tree about 8 metres tall, built from six stacked
   wavy conical tiers of flat faceted leaf plates that overhang each other like layered
   skirts, each tier slightly smaller than the one below, with a short visible warm-brown
   trunk at the base. … Crisp zig-zag silhouette, wide at the bottom, tapering to a small
   pointed top."
4. **Bush / fern** — "a single low bush-and-fern cluster about 1.2 metres tall and 1.6 metres
   wide, built from three overlapping rosettes of long tapered leaf blades fanning outward
   and arching down at the tips, with a few shorter upright fern fronds in the centre. …
   No flowers, no berries, no soil."
5. **Mossy boulder group** — "a group of three chunky faceted mossy boulders gathered as one
   tight cluster, the largest about 1.4 metres wide and the others half that size, all
   sitting low and touching. Low-poly chiselled cream-grey stone (#d2c9ae) with pale top
   planes (#e3dcc6) and cooler blue-grey shadow planes (#b3ab97) … Soft rounded green moss
   caps (#6aa84e with a lighter #8cc65e top)."
6. **Broken arch** — "a single freestanding broken stone arch gateway, a ruined shrine
   entrance about 4 metres tall and 3 metres wide. Two thick rectangular pale cream stone
   pillars (#d2c9ae) with simple stepped bases, joined by a broken lintel across the top
   whose right half is snapped off in a jagged diagonal break … No gate, no door, no
   ironwork, no carving, no runes, no text, no banners."

## Hand-off notes for the 3D step

- Feed each PNG **as-is** (1:1, isolated, grey background) — do not crop or composite.
- Target **1–3k tris** per asset; flat shading (`flatShading: true`) with vertex colours,
  `roughness 1`, `metalness 0`, **no textures** (SPEC non-negotiable #1).
- Pivot at ground centre `(0, 0, 0)`, Y-up, 1 unit = 1 m, so placement coordinates above
  apply directly.
- Keep the three-tone vertex gradient (light / mid / shadow) — that is what makes the asset
  read as the same family as the meadow.
- The arch's snapped lintel leaves a small detached stone chunk on the right pillar; keep it
  as a separate mesh island of the same asset, not a loose second object.
- Palette source of truth: `game/src/map/palette.js`. No new colours were introduced.

## What failed / caveats

- Nothing was rejected — all six passed the read-back review on the first generation
  (no plastic sheen, no amber cast, no multi-object frames, no cropping, no text).
- The `ai_studio_code (31).html` reference page did not show the map as expected (it renders
  a macro flower field), so the "before" reference is the existing game screenshot instead.
- These are **concepts**, not final art. Approximate on-model detail (individual leaf
  silhouettes, ivy strands on the arch) should be simplified by the modeller to hit the
  poly budget.
