# Map background rebuild — "Sunpetal Vale, anime meadow"

Status: background-only pass. We are NOT wiring gameplay yet. The deliverable is a
standalone, beautiful background/map scene that can later replace the flat ground
+ scattered Kenney props in `game/src/world.js`.

## Why

Current map (see `handoff/shots/vale-meadow.png`): one flat green plane, a beige
path made of hard-edged quads, sparse Kenney props that read as green blobs, and
washed-out light. It has no depth, no foliage mass, no sky, no silhouette. It is
being replaced.

## Direction

A high-key, late-afternoon **anime adventure meadow**: rolling ground, dense
layered grass, flower drifts, stylised trees with 3-tone canopies, a painterly
cumulus sky, warm low sun with cool blue shadows, and lavender aerial haze on
everything distant. Ghibli/Genshin composition language, original assets,
procedural geometry only — no textures, no photoreal assets, no new downloads.

Style is still "stylised low-poly" so it stays compatible with KayKit characters
when we integrate. Do not mix in photoreal materials.

### Non-negotiables
1. **No textures.** All colour from vertex colours, flat shading, lights and shaders.
2. **Three tones.** Each family (canopy, grass, trunk, ground) uses light / mid / shadow only.
3. **Silhouette first.** Trees must read as layered leaf masses, never spheres.
4. **No confetti.** Flowers arrive in drifts/patches of one dominant colour, not rainbow scatter.
5. **No flat plane.** Ground must have painterly colour drift + path + patches, and the
   world must have rolling relief outside the playable square.
6. **Anime light.** Warm sun (`#fff3d6`), cool sky fill (`#bfe2ff`), blue-green shadows,
   warm rim on foliage silhouettes, distance → cooler + hazier.
7. **Performance.** InstancedMesh everywhere repeated; target < 220 draw calls and
   < 1.6 M triangles for the whole background at `quality: "high"`.
8. **Determinism.** Same seed → same scene. Use the injected `rng`, never `Math.random`.

## Layout (metres, 1 unit = 1 m)

- Playable square: X/Z `[-46, 46]`, flat at `y = 0` (gameplay depends on flat feet).
- Scenic ring: out to radius ~140. Rolling hills, tree walls, ridges.
- Lake west: `X -78..-50`, `Z -25..18`, water level `-0.35`.
- Path loop through `(0,24) (-27,20) (-32,-9) (-18,-28) (0,-31) (26,-23) (30,14) (18,29)`
  plus spokes to the meadow centre. Path is a soft dirt ribbon, 3–4 m wide, irregular edges.
- Open meadow clearing around `(0,0)` radius ~20: low grass, flower drifts, no trees.
- Feature compositions: a big tree at `(0,-38)`, a tree cluster at the lake overlook
  `(-40,-10)`, a grove at `(36,24)`, and a dense woodland wall around the perimeter.

## Module contract

New folder `game/src/map/`. Private world helpers (same exception documented for
`vale-scenery.js` in `CONTRACT.md`): they import only `three`, `three/addons/*`
and `./palette.js`. Never another game module. No DOM access outside the preview
pages. No renderer creation inside modules.

```
palette.js   MEADOW + MEADOW_LIGHT            (Lead, done)
terrain.js   createMeadowTerrain(opts)        (Lead)
foliage.js   createMeadowFoliage(opts)        (teammate)
sky.js       createMeadowSky(opts)            (teammate)
post.js      createMeadowPost(opts)           (teammate)
index.js     createMeadowBackground(opts)     (Lead, composes all)
```

### terrain.js (Lead)
```js
createMeadowTerrain({ rng, palette = MEADOW, quality = "high" }) => {
  group,                       // THREE.Group added to scene by caller
  heightAt(x, z),              // number, ground surface y (0 inside playable square)
  pathDistance(x, z),          // metres from path edge; negative inside the path
  waterLevel,                  // number
  update(elapsed, dt),         // water + subtle ground animation only
  stats: { triangles, drawCalls },
}
```

### foliage.js (teammate)
```js
createMeadowFoliage({
  rng,
  heightAt,          // (x,z) => y
  pathDistance,      // (x,z) => metres, negative on path
  palette = MEADOW,
  quality = "high",  // "low" halves counts and disables shadow casting
  seed = 20261017,
}) => {
  group, update(elapsed, dt), colliders: [{x, z, radius}], stats
}
```
Must contain, in this order of visual importance:
1. **Grass field** — 12k–20k instanced clumps, 5–7 curved tapered blades each, root→tip
   vertex gradient (`grassShadow` → `grassBase` → `grassTip`), wind vertex shader
   (bend proportional to height², two frequencies, phase from instance position).
   Height bands: short (0.10–0.25 m) inside the meadow clearing, tall (0.45–0.95 m)
   on verges/shoulders and near the perimeter. Path centres stay nearly bare.
2. **Wildflowers** — 1.5k–3k instanced, 5-petal procedural heads on 0.2–0.5 m stems,
   in drifts of a single dominant colour, four variants (pink, cream, lilac, white).
3. **Shrubs & ferns** — 200–350 clusters, layered leaf fans, 0.6–1.8 m.
4. **Trees** — 70–110: 4 broadleaf variants + 1 conifer, 5–12 m, canopies built from
   6–10 flattened, offset leaf puffs with a 3-tone vertex gradient and a bright rim
   on the sun side. Trunks taper and branch. Sway amplitude proportional to height.
   Dense woodland wall outside `[-46,46]`, feature trees inside per the layout above.
5. **Ground cover accents** — clover/sorrel patches, reeds at the lake shore, a few
   fallen-petal patches. Keep cheap.

### sky.js + post.js (teammate)
```js
createMeadowSky({ palette = MEADOW, sunAzimuth, sunElevation, quality }) => {
  group, sun /* DirectionalLight */, hemi /* HemisphereLight */, ambient,
  sunDir /* Vector3 */, update(elapsed), stats
}
createMeadowPost({ renderer, scene, camera, width, height, enabled = true }) => {
  composer, render(dt), setSize(w, h), setEnabled(bool), dispose()
}
```
Sky: shader gradient dome (zenith → mid → horizon, warm glow around the sun), visible
sun disc with soft halo, 5–8 stylised cumulus clusters (flat-shaded puffs, white top /
lavender-blue base, slow drift), 3 layers of distant ridge silhouettes fading into
`fog`, and a thin band of atmospheric haze on the horizon. Must look right from the
gameplay camera (35° elevation, 11.5 m distance) — no cloud sitting in the sightline.
Post: UnrealBloom (threshold ~0.82, strength ~0.42, radius ~0.55) + a final grade pass
(slight saturation/contrast lift, warm highlights, cool shadows, vignette). Must degrade
to plain render if `enabled: false` or WebGL2 unavailable.

## Preview harness

- `game/handoff/map-bg/preview.html` — the combined scene (Lead). Gameplay-like camera
  (fov 58, 11.5 m back, 2.4 m high, 35° pitch), orbit with mouse drag, WASD fly,
  mood presets (Morning / Golden hour / Dusk), stats overlay, and a "hide HUD" key.
- Teammates may add their own harness pages next to it, named `preview-<area>.html`.
- Serve from the repo root: `http://127.0.0.1:4173/game/handoff/map-bg/preview.html`.
  The static server is already running on port 4173.
- Verify visually with the Playwright MCP tools before reporting done. Save screenshots
  as `game/handoff/map-bg/shots/<name>.png` and include the paths in your report.

## Palette

Read `game/src/map/palette.js`. Do not invent new colours; if a shade is genuinely
missing, add it to the palette file and tell the Lead.
