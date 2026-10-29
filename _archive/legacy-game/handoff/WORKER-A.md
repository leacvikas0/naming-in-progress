# Worker A brief — `game/src/vale-scenery.js`

You are Worker A on a two-worker implementation of **Sunpetal Vale**, an outdoor
map replacing a cramped dungeon in `C:/Users/silen/projects/kilo-3d-kit`.

Read these first, in this order:
1. `C:/Users/silen/projects/kilo-3d-kit/AGENTS.md`
2. `C:/Users/silen/projects/kilo-3d-kit/game/handoff/MAP-DESIGN.md`
   (sections *Ground, boundaries and water*, *Foliage: deliberate density*,
   *Lighting and atmosphere*)
3. `C:/Users/silen/projects/kilo-3d-kit/game/src/balance.js` — read
   `ASSETS.valley`, `VALE_PALETTE` and `CONFIG.vale`. These are FROZEN. Do not edit
   balance.js.
4. `C:/Users/silen/projects/kilo-3d-kit/game/src/world.js` — the current dungeon
   world. The Lead is rewriting this file concurrently. **Do not read it as a
   contract and do not edit it.** You only need to know it is a Three.js module.

## Your only file

Create exactly one new file: `game/src/vale-scenery.js`.

Do **not** edit `world.js`, `balance.js`, `main.js`, `index.html`, any CSS, any
test, or any other file. Another worker owns `vale-layout.js`; do not touch it.
You may create scratch files under `game/handoff/scratch/` for your own preview,
but the deliverable is the one module.

## Hard constraints

- **Three.js only.** `import * as THREE from "three";` and nothing else. No
  imports of any other game module. No new npm dependency. No asset URLs of your
  own — every URL arrives from the caller.
- **No network fetching.** You receive already-loaded Three.js template roots.
  Never call GLTFLoader or `loadAsync`.
- **Instancing.** Repeated static geometry must be batched with
  `THREE.InstancedMesh` by geometry+material, grouped into modest spatial chunks
  so offscreen foliage can be frustum-culled. A multi-mesh glTF tree must be
  split into one batch per child geometry/material while preserving each child's
  local transform relative to the tree root. Do not create one batch per plant.
- **No per-frame allocation.** Animation must mutate existing uniforms or
  instance matrices; never `material.needsUpdate`, never new geometry/materials
  in `update()`. Keep the per-frame work O(instances) with plain math.
- Grass/flower clumps are non-colliding. Do not return colliders for them.
- No shadows from grass/flowers. If you set `castShadow` anywhere it must be
  limited to a small number of nearby large trees and only if the caller enabled
  shadows — default to not setting shadows at all.
- Keep the module under ~450 lines. Favour clarity over cleverness.

## Frozen interface — implement exactly this

```js
export function createScenery(options) -> {
  group,                 // THREE.Group already populated, added by caller
  update(dt, elapsed),   // animate sway + pollen; no allocation
  reset(),               // restore deterministic initial animation state
  colliders,             // [{ x, z, radius }] ONLY solid trunks/boulders
  stats,                 // { trees, shrubs, grassClumps, flowerClumps, batches, instances }
}
```

`options` (all supplied by the Lead; treat as read-only):

```js
{
  palette,   // VALE_PALETTE object (numbers are hex ints)
  config,    // CONFIG.vale object (trees, grassClumps, flowerClumps, shrubClusters,
             //  loopPath, loopWidth, spokes, landmarks, lake, meadowGrassMax, seed)
  rng,       // () => number in [0,1). Deterministic. Use it for ALL variation.
  templates, // { treeBroad1, treeBroad2, treeRound1, treeRound2, treeSmall1,
             //   treeSmall2, bush1, bush2, bush3, grass1, grass2, rock1, rock2,
             //   rock3, flowerPink, flowerCream, fern, clover, flowerBush, pebble }
             // Each value is a THREE.Object3D (a loaded glTF scene root) or null.
             // Null means that asset failed to load: skip it, never throw.
  bounds,    // { minX, maxX, minZ, maxZ } walkable bounds, X/Z [-46, 46]
  pathDistance, // (x, z) => number, distance in metres from (x,z) to the nearest
                // path centre line. Use it to keep path centres bare.
  groundHeight, // (x, z) => number, always 0 in playable space. Use for placement.
}
```

## Composition you must produce

Follow MAP-DESIGN.md. The map is 96 x 96 m with walkable bounds X/Z `[-46, 46]`.
North is **-Z**, east is **+X**.

- **Trees: ~104 total including backdrop.** 4-6 broadleaf variants across two
  height bands (~5-8 m and ~8-12 m). 60-70% of tree density in perimeter groups,
  20-30% along path shoulders and landmark edges. Cluster in unequal patches with
  gaps — no even random scatter, no confetti forest. Vary rotation, uniform scale
  and green tint subtly. Keep large trees **outside the usual camera envelope
  around route centres**: the camera sits ~7.6 m behind and ~4-6 m above the hero,
  so do not put canopies within about 6 m of the path centre line or the meadow
  centre, or they will hide the hero and enemies.
- **Perimeter framing:** the square must not read as four dungeon walls. Overlap
  tree groups, bushes and rock shoulders just outside the bounds and in perimeter
  pockets. Leave the walkable rectangle connected — no interior wall, no ring of
  trunk colliders the enemies cannot route around. The existing AI is direct
  chase with simple circular push-out, not pathfinding.
- **Shrubs/ferns: ~190 clusters** near edges and shoulders, not in the meadow
  centre.
- **Grass clumps: ~1500 and flower clumps: ~620** as instanced batches. In the
  central battle clearing grass must stay under ~0.35 m tall and path centres must
  be nearly bare (use `pathDistance`). Flowers 0.15-0.55 m on shoulders. Never
  thick foliage through the player start at `(0, 6)` or the landmark centres.
- **Solid trunks and boulders:** return a small circular collider for a tree or
  rock **only** when it is genuinely solid and near walkable space. Keep them out
  of the direct combat connections (meadow, shrine clearing, camp clearing, the
  loop path). Prefer placement over colliders. `colliders.length` should stay
  small (roughly under 40) — the Lead also adds landmark colliders.
- **Ambient life:** gentle tree/grass sway driven by shared elapsed time (vertex
  or instance-matrix based), and a small pool of pollen motes (a few hundred
  points at most, additive, `depthWrite: false`). Keep it restrained — no
  full-screen bloom, no particle storm. `update()` must be cheap and allocation
  free. `reset()` must return to the same deterministic state (retry must not
  accumulate anything).

## Determinism

Use only the passed `rng` for placement and variation, and do not consume it in
`update()`. A fresh `createScenery` with the same rng seed must produce the same
layout.

## Report back (concise)

Reply with: the file path, a 5-10 line summary of what you built (batches,
instance counts, how sway works, what colliders you emitted), the exported
interface as actually implemented, `stats` values from a smoke run if you do one,
and anything you could not verify. Do not claim visual quality you have not seen.

## Verification you must do

Write a throwaway Node or browser check that imports the module and calls
`createScenery` with a stub `templates` object built from
`new THREE.BoxGeometry`/`MeshBasicMaterial` roots (no GLTF), a fixed rng, and
real bounds. Assert: it returns the interface, `group.children.length > 0`,
`stats.trees` is within 80-120, `update(0.016, 1.0)` runs without throwing and
does not change `group.children.length`, and `reset()` restores identical
instance matrices to a fresh build. Put it in `game/handoff/scratch/worker-a-check.mjs`
and report the command and its output. Do not add it to `npm test`.
