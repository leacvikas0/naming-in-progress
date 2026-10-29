# PORT PLAN — use the reference scenes' assets directly

Decision (user): the two reference HTML pages are the **asset source**. We port their
botanical geometry builders + materials nearly verbatim, and we keep **our own map**
(terrain, path, lake, landmarks, camera). Their post-processing is the reference for ours.

Stop treating the references as "inspiration". Do not re-derive their flowers, grass,
leaves or rocks by hand. Copy the code, adapt imports/API, keep the math identical.

## Source files (read-only, do not modify)

- A: `C:\Users\silen\Downloads\ai_studio_code (31).html` — three r160 ES modules, 1574 lines.
- B: `C:\Users\silen\Downloads\sunlit_anime_meadow_modular_3d_botanical_studio_scene.html` — three r128 global script; line 366 is a 3.3 MB base64 image, skip it (read by line range).

## Target modules

```
game/src/map/port/refb-kit.js   <- B's material + geometry builders   (porter B)
game/src/map/port/refa-kit.js   <- A's material + geometry builders   (porter A)
game/src/map/kit.js             <- placement/composition on our map   (Lead)
```

Both kits import only `three` (+ `three/addons/*`) and nothing from the game.

## Required exports — refb-kit.js (source B)

Verbatim, with the same attribute layout the source material expects
(`position`, `normal`, `color` = sun colour, `aShadowColor`, `aWindWeight`):

```js
export const REFB_PALETTE                 // B's PALETTE, unchanged
export function createGhibliBotanicalMaterial(opts)  // B line 554-720
export function createMeadowGrassTuftGeometry(variant)        // 1283-1323, variants 0..2
export function createHeroBellflowerClumpGeometry(variant)    // 1038-1143
export function createSingleBellflowerStalkGeometry(variant)  // 1144-1191
export function createSecondaryVioletSprigGeometry(variant)   // 1192-1232
export function createChamomileDaisyClusterGeometry(variant)  // 1233-1282
export function createFacetedMeadowRockGeometry(variant)      // 1324-1402, variants 0..2
export function createTreeCanopyGeometry(opts)   // NEW, but built ONLY from B's
//   PartGeometryBuilder.addArchingLeaf: 6-10 flattened offset puffs, 1.2-2.0 m leaves,
//   pitch 0.15-0.55, arch 0.30, segments 3, wind 0.15, 3-tone canopy ramp
//   (canopyDark base -> canopyMid -> canopyLight top). 4 broadleaf variants + 1 conifer.
export function createTreeTrunkGeometry(opts)    // tapered, 3-6 sided, branching; trunk palette
```

Also export the helpers the geometry needs (`createColoredGeometry`, `PartGeometryBuilder`
or equivalent), and `REFB_HEIGHT` only if you port B's height function for the harness.
Do NOT port B's scene layout / camera / UI / turntable / GLB export.

## Required exports — refa-kit.js (source A)

Verbatim, keeping A's merged-attribute layout (`aPartId`, `aSwayWeight`, `aPetalCoord`):

```js
export const REFA_PRESETS                 // A's three mood presets, unchanged
export function createRefaMaterial(preset) // A's ShaderMaterial (wind + canopy + SSS)
export function buildFlowerStalkGeometry(variant)   // A's 4 hero stalk variants
export function buildWildflowerGeometry(variant)    // A's 3 wildflower variants
export function buildGrassTuftGeometry(variant)     // A's 3 grass tuft variants
export class SeededRandom
```

Do NOT port A's terrain, camera, HUD, inspector mode, wireframe, or the meadow assembly
loop. We only want the botanical assets + the material.

## r128/r160 -> r170 adaptations allowed (nothing else)

- `THREE.sRGBEncoding` -> `THREE.SRGBColorSpace`, `outputEncoding` -> `outputColorSpace`.
- `new THREE.Geometry`-era calls if any -> BufferGeometry equivalents.
- Import `three` as an ES module; no globals, no `window`.
- `geometry.setAttribute(...)` names unchanged.
- Keep vertex-attribute names, palette values, and all constants identical.
- Keep `flatShading` / `side` / `transparent` settings as authored.

## Verification

Each porter ships a harness page `game/handoff/map-bg/preview-port-<a|b>.html` that:
- imports the kit, builds one instance of EVERY asset variant side by side on a plain
  ground plane, with the kit's own material and a neutral light rig (or the kit's own
  shader lighting if it is self-lit),
- uses three r0.170.0 via CDN importmap and OrbitControls,
- prints geometry counts (variants, triangles) in a corner.

Screenshot it with Playwright MCP to `game/handoff/map-bg/shots/port-<a|b>-01.png`,
inspect it, and confirm the assets look like the reference page. Iterate until they do.

## Integration (Lead)

`game/src/map/kit.js` will place: B's grass tufts (dense, instanced, 3 variants),
B's bellflowers + daisies (drifts), A's hero stalks (sparse, tall, foreground + garden
pockets), B's rocks, and trees from B's leaf builder. Our terrain/path/lake stay.
