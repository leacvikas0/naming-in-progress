# Sunpetal Vale: approved map direction

This document specifies the outdoor map task requested on 2026-10-17. The user
delegated map decisions to Codex and will ask DeepSeek to implement them.

## Feeling and composition

A bright, welcoming fantasy valley in late-afternoon sunlight: rounded lime and
sage canopies, cream stone ruins, petal pink and pale yellow flowers, cool distant
hills and turquoise water. Dreamy and playful, with a clear hero silhouette.
Use anime adventure landscapes as a composition reference; build an original
place using the local CC0 models. The result remains stylized low-poly, not a
promise of Genshin's production rendering.

The key view is from the central meadow toward a broken arch and an old spreading
tree at the northern shrine. A light winding path draws the eye there. Other
views open onto the lake and a little camp. Make a few memorable compositions,
not an even random scatter of props across a bigger square.

## Dimensions and coordinates

1 unit = 1 metre. Hero height remains 1.9. North is negative Z; east is positive X.
Set `CONFIG.arena.w` and `.d` to 96. Retain wallInset 2, so usable bounds are
X/Z `[-46,46]`. All walkable ground tops and feet are at Y=0. The gross map
footprint is 4x the old 48 x 48 arena; usable rectangular area is about 4.37x the
old 44 x 44 bounds. Scenic backdrop may extend to roughly +/-110.

The full rectangle remains connected walkable ground. Dense trees and rocks sit
mainly outside it or in perimeter pockets; the existing AI uses direct chasing,
not pathfinding. Do not create interior walls, deep lakes, maze corridors, fences
or a ring of trunk colliders that enemies cannot route around.

| Place | Centre (X,Z) | Size and purpose |
|---|---|---|
| Sunpetal Meadow | (0,0) | ~40 x 36 m open combat clearing; hero starts (0,6) |
| Wishing Arch shrine | (0,-31) | ~20 x 16 m secondary clearing; broken pale arch and empty low pedestal; tree behind |
| Lakeside overlook | (-31,-4) | ~16 x 22 m open western apron; view of lake beyond X=-48 |
| Traveller's rest | (29,17) | ~18 x 16 m clearing; tent/bedroll, crates, unlit cooking setup at the side |
| Petal Walk | (-23,22) | ~18 x 14 m flower-rich southern clearing joining meadow and lake route |

The main path is a soft irregular 6-8 m wide loop through these approximate
waypoints: `(0,24) -> (-27,20) -> (-32,-9) -> (-18,-28) -> (0,-31) ->
(26,-23) -> (30,14) -> (18,29) -> (0,24)`. Add 8-12 m broad visual connections
from the meadow to the north shrine, lake overlook and eastern camp. Paths are
visual ground treatments, not corridors bounded by solid props. At least two
obvious exits from every landmark clearing. No required jumping or climbing.

```text
                        NORTH / -Z
            distant misty hills and tree silhouettes
                  [old tree / Wishing Arch]
                   /         |          \
        forest edge          |          flower grove
              /              |                \
 LAKE ~~~ [overlook] ---- [MEADOW] --------- eastern route
 beyond       |          player (0,6)           |
 bounds       |               |           [camp at side]
              \         [Petal Walk]          /
                -------- loop path ----------
                        SOUTH / +Z
```

See `map-overview.svg` for the spatial reference. Coordinates and clearance rules
take precedence over the illustrative shapes.

## Ground, boundaries and water

- Build a continuous green base and subtle larger patches of warmer/cooler green.
  Avoid repeating stone floor tiles, checkerboard seams and a perfectly straight
  path. Low-cost geometry patches just above the floor are sufficient; avoid
  z-fighting and hundreds of individually drawn decals.
- Frame the square with overlapping tree groups, bushes, rock shoulders and
  distant hills so the edge does not read as four dungeon walls. Keep a visible
  low scenic verge near the actual bounds so the clamp is understandable.
- Put the turquoise lake west of the playable rectangle, roughly X=-75..-48,
  Z=-25..18. Its water sits just below the ground. A scalloped shoreline with
  rocks/reeds hides the base edge. No playable water, swimming, bridge physics,
  lethal lake or water spawn logic is required.
- Shrine floor and any decorative bridge-like slabs must be visually flush with
  Y=0. Keep the pedestal itself off the walking route. No inaccessible raised
  platform pretending to be walkable.

## Foliage: deliberate density

Start around 80-120 trees total including backdrop; use a handful of broadleaf
variants, two height bands (roughly 5-8 m and 8-12 m) and sparing conifers.
These counts are starting composition guides, not acceptance tests.

Put 60-70% of visual plant density near perimeter groups, 20-30% along path
shoulders and landmark edges, and the remainder as low flowers in the meadow.
Cluster plants in unequal patches with gaps. Vary rotation, scale and green tint
subtly; do not create a confetti forest of saturated unrelated colors.

Use roughly 150-250 shrub/fern clusters and 1,000-2,500 instanced grass/flower
clumps if the measured budget permits. Use patch spacing and silhouettes to make
them read as fuller growth; individual blades across the whole map are unnecessary.
Grass in the main battle area should stay under ~0.35 m; path centres almost bare.
Flowers can be 0.15-0.55 m on shoulders. No thick foliage through the player start.

Keep collidable trunks and boulders out of the direct combat connections. Ground
plants are non-colliding. If a landmark uses a solid trunk or stone, give it a
simple appropriately sized circular collider, ensure enemies handle that small
obstacle using existing patterns, and verify actual encounters. Prefer moving
the obstacle out of the chase line to writing a new navigation system.

Do not hide the hero and enemies under near-camera canopies. Place large trees
outside the usual camera envelope around route centres. Camera clipping exposed
in the traversal check should first be solved by placement/height; use a small
camera correction only if needed, not a new generalized camera subsystem.

## Lighting and atmosphere

Suggested art palette (tune visually, do not treat hex values as test assertions):

| Role | Starting colour |
|---|---|
| High sky / horizon | #9EDBEE / #E5EFE0 |
| Grass / canopy shadows | #8DBD68 / #44785D |
| Sunlit leaves | #B9D77C |
| Path / old stone | #DDCBA1 / #C9C9B4 |
| Lake | #65C9CA |
| Flowers | #F3C8DA, #FFF0B3, #C6B9EB |

Use one warm directional sun and a cool hemisphere fill. A simple gradient sky,
few large stylized cloud groups, and pale distance fog provide depth. Keep nearby
contrast; fog should soften distant woods, not erase the shrine 30 m away.

The existing renderer uses ACES tone mapping; tune exposure with it. Current dark
fog and the intense following player point light are dungeon-specific. Apply the
new environment settings when gameplay begins; preserve or explicitly restore
the title scene's presentation. Avoid changing shared `PALETTE.fog` globally and
accidentally tinting every existing effect/title material. Inspect title show/hide
and world light visibility together, including retry.

Start without full-screen post-processing. The dreamy look should come from
composition, color, light, silhouettes and haze. If shadows are added, use one
limited directional shadow map, nearby casters only, and measure the cost. Do not
make thousands of grass instances cast shadows. No SSR, volumetric clouds, SSAO,
multi-pass water reflections or raymarched fog for this task.

Water can be a cheap opaque/slightly translucent stylized surface with slow
UV/uniform animation and a few foam accents. No animated geometry/material
reallocation. Small pooled pollen motes and mild synchronized leaf/grass motion
are enough to feel alive. Avoid a permanent neon bloom or thick particle storm.

## Architecture constraints

Reuse `createWorld({scene, config, rng, loader})`; keep `group`, `colliders`,
`hazards`, `bounds`, `coinTemplate`, `torchCount`, `spawnPoint`, `update`, `reset`
and the actual `ready` promise. Outdoor hazards may be empty and torchCount 0.
Coins and the existing FX module still need a usable coinTemplate.

The contract prose is stale: actual world already accepts loader and returns
ready. Update environment/units prose for this map and record these existing
facts; do not redesign the public module API.

Load selected asset templates once. World.ready resolves only after essential
templates are usable; a failed essential load should produce a useful loading
error rather than silently starting an empty map. Cache/shared instance resources
must survive normal resets. Do not reconstruct thousands of props on retry.

An optional scenery helper imported by world.js is an explicit narrow exception
to the existing no-game-module-import rule. It is a private world helper, not a
peer gameplay module. Document that exception if used; do not relax the rule for
player/enemies/fx. Alternatively keep it in world.js if a helper adds more
complexity than it removes.

Use small static layout/config data, not a map format with a schema/plugin system.
`main.js` owns renderer, scene transitions and module wiring. `balance.js` owns
asset URLs and tunables; environment-specific configuration should have its own
named section rather than dozens of unrelated magic constants in main.js.

spawnPoint must return a valid in-bounds, ground-level point away from the player
and solid landmark props. Existing code can return the final rejected candidate
after 40 failed attempts: replace that unsafe fallback with a simple small set
of checked open-clearing anchors. Never return a knowingly blocked or out-of-bounds
point. Because obstacles are sparse and clearings broad, do not build a navigation
grid. Retain existing spawn distance semantics and test them meaningfully if changed.

## Ready for the next task

Leave an empty pedestal and clear 10 m testing space at the shrine. This gives a
future spellbook a natural home, but introduces no interaction, UI or unlock now.
The current waves, party selection, abilities, upgrades, currency and retry remain
the gameplay. The map is complete when the five signals in TASK.md have evidence.
