# Local asset inventory for Sunpetal Vale

Prepared 2026-10-17. All selected editions are CC0. No purchases were made.

## Downloaded before implementation

| Pack | Local directory | Indexed glTF models | Original ZIP bytes |
|---|---|---:|---:|
| KayKit Forest Nature 1.0 FREE | `library/kaykit-forest-free/` | 105 | 6,435,630 |
| Quaternius Stylized Nature MegaKit Standard FREE | `library/quaternius-stylized-nature-standard/` | 68 | 104,088,529 |

Every model in both free editions was downloaded, not just a handpicked sample.
These do not include the paid extra/source tiers. The full local library now
indexes 2,876 glTF/GLB entries across 31 packs. Catalog entries count model files;
not all files are unique silhouettes or suitable for this map.

Verified every new glTF model's referenced external buffers/images exists locally:
zero missing dependencies across 173 models. This verifies file completeness,
not that these assets have already been rendered inside the game.

Sources:
- https://kaylousberg.itch.io/kaykit-forest — free download upload ID 13520330.
- https://quaternius.com/packs/stylizednaturemegakit.html — creator description.
- https://quaternius.itch.io/stylized-nature-megakit — standard free upload ID 11055123.

Keep their original licenses. Archive copies live in `library/_archives/`.
SHA-256:
- KayKit ZIP: `2ee83e63bb7695f2d884ec27ddf6fce020789a452e7d5c5b0bbdfc4f6ea1fc8c`.
- Quaternius ZIP: `298f6732b872e4cf7b30e6e7abf9641c7f6dc6b326df37ac089533ed7e3d58c9`.

Pack metadata is in `scripts/packs.json`; the existing fetcher now understands
the ordinary anonymous itch.io free-download flow. `npm run fetch` skips populated
packs and fetches missing ones; `npm run index` rebuilds the manifest. Node 22+
supports the fetch/cookie APIs used. If an itch.io upload is replaced, obtain the
current free file from the source page and update its ID; never substitute paid
content or commit temporary signed CDN URLs. Text licenses are preserved by fetch.

## Coherent palette: use only about 20-30 models

Search `catalog/index.json`, using each entry's exact `url`. Add selected URLs to
`ASSETS` in balance.js. Do not load all 2,876 entries, all 173 additions, or every
legacy dungeon asset at startup.

**Primary foliage: KayKit Forest.** Tree_2 variants have softer spreading canopies;
Tree_4 variants are rounder. Mix 4-6 trees, 2-3 bushes, 2 rocks and 2 grass clusters.
Use broadleaf silhouettes primarily. A few conifers can frame the distance.

Actual URL prefix:
`/library/kaykit-forest-free/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf/`

Example files: `Tree_2_A_Color1.gltf`, `Tree_2_C_Color1.gltf`,
`Tree_4_A_Color1.gltf`, `Bush_2_A_Color1.gltf`, `Grass_2_B_Color1.gltf`,
`Rock_1_C_Color1.gltf`. These glTF files reference nearby .bin/texture files;
preserve directory structure. Preview sheet: `contents.png` at the pack root.

**Soft ground accents: Quaternius.** Use Flower_3_Group, Flower_4_Group,
Fern_1, Clover_1, Bush_Common_Flowers and at most a couple of pebble/plant variants.
Actual URL prefix: `/library/quaternius-stylized-nature-standard/glTF/`.
Files use `.gltf`, e.g. `Flower_3_Group.gltf`. Inspect leaf alpha and shadows:
use alpha testing where appropriate and avoid sorting thousands of blended cards.
The free package's textures do not include the paid engine-specific foliage shaders.
No Unity/Godot shader is automatically usable by Three.js.

**Structures and camp: already local.** `kenney-nature` (329 model files) has
bridges, rocks and wood props; `kenney-castle` (76) supplies pale architectural
pieces; `kenney-fantasy-town` (167) supplies small fantasy props; `kenney-survival`
(80) supplies the camp. `kaykit-dungeon` can supply a couple of ruin/coin pieces.
Select compatible pieces, not a whole building town or a dungeon wall perimeter.
Characters/animations remain the existing KayKit adventurers and skeletons.

## Measured mesh cost and usage limits

The root AGENTS budget is prop <2,000 triangles unless a catalog exception exists.
For this task avoid over-budget models; no catalog exception has been granted.
All KayKit Forest models are below 2,000 except `Tree_3_C_Color1` (2,228): omit it.
Most Quaternius full trees exceed the budget (roughly 3k-10k); keep them available
in the library but omit them from this scene. Quaternius flowers/ferns and selected
small plants provide the softer look without densely drawing expensive trees.
Also omit Mushroom_Laetiporus and the larger RockPath variants above the budget.
See `asset-audit.json` for per-model triangle counts from glTF mesh primitives.

Instancing reduces draw calls, not triangles or alpha overdraw. A multi-mesh tree
needs batches per geometry/material, preserving child transforms. Avoid cloning
every material per tree. Group repeated geometry/material into a modest number
of spatial batches so distant/offscreen foliage can be culled; do not create one
batch per individual plant. Measure before adding LOD or an extra quality system.

Do not import new art families just to use more assets. Downloads live in the
ignored library and are a palette, not a requirement to crowd every model in.

## Deployment note

The existing game serves `/library/...` from the REPOSITORY ROOT. Serving only the
`game/` directory breaks those URLs. Git ignores library; a future publish must
copy the selected models AND their referenced buffers/textures. Deployment is
not part of this task. Document the actual selected URLs for that later step.
