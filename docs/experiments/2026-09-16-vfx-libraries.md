# VFX libraries and pipelines — evaluation

Date: 2026-09-16
Status: research, not implemented. Nothing in this doc is wired into the game.
Scope: what can add animation and combat effects to the game, and what it costs.

## TL;DR

Three separate questions were asked: what library, what art, what authoring tool.
The answers are different and only the first one is a real dependency decision.

- **Engine**: `three.quarks` 0.16.0. Verified running on this project's exact
  three.js r170 in a browser, not just declared compatible. Pin 0.16.0 — 0.17.x
  requires `three >=0.182`.
- **Art**: Kenney Particle Pack + Smoke Particles, both CC0, both already
  fetchable by `scripts/fetch-library.mjs`. No new source, no new license.
- **Authoring**: not yet. The current Node pipeline can generate atlases, and
  Effekseer is the escape hatch if hand-coding volume becomes the bottleneck.
- **Post-processing**: the built-in `three/addons/postprocessing` passes are
  free (already in the import map) and are the highest impact-per-line change
  in this document.

Two blockers were found that no amount of library choice removes; they are
integration work in this repo, listed in "What this costs".

## Verified in this repo, not assumed

The engine claim was tested, because peer ranges are not evidence. A spike page
loaded `three.quarks@0.16.0` through the project's real import map, built a
particle system, stepped it 60 ticks and rendered it:

| Check | Result |
|---|---|
| three.js revision loaded | **170** (the project's pin) |
| `three.quarks` loads via import map, no bundler | pass, 116 exports |
| Single three.js instance (no bundled duplicate) | **pass** — the decisive check |
| `BatchedRenderer` + system construct | pass |
| 60 simulation ticks | pass, 37 live particles |
| `renderer.render()` GL error | **0** |
| Pixels actually written | **256 lit pixels** |

The spike was deleted after the run. Reproducing it needs four import-map
entries and ~40 lines; the gotchas below are the whole difficulty.

### Load path

`/+esm` on jsDelivr must **not** be used: it rewrites the bare `three` import to
`three@0.175.0`, which loads a second three.js and breaks `instanceof` checks
silently. Use the raw ESM files and let the import map resolve `three` to the
project's own copy:

```json
{
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
  "quarks.core": "https://cdn.jsdelivr.net/npm/quarks.core@0.16.0/dist/quarks.core.esm.js",
  "three.quarks": "https://cdn.jsdelivr.net/npm/three.quarks@0.16.0/dist/three.quarks.esm.js"
}
```

Both raw bundles import exactly `three` and (for three.quarks) `quarks.core`.
No other bare specifiers, so nothing else needs mapping.

### Gotchas found by the spike

These are not documented clearly and each one cost a debug cycle:

1. **`BatchedRenderer` must be added to the scene.** It is an `Object3D` that
   owns the batch meshes. Adding only the emitter renders nothing, with no error.
2. **`ps.emitter` must also be in the scene.** `ParticleSystem.update()` calls
   `this.dispose()` on the first tick if its emitter's root is not a `Scene`.
   The symptom is `particleNum` staying at 0.
3. **`material` is mandatory.** `rendererSettings.material = parameters.material`
   with no default; `VFXBatch` then does `settings.material.clone()` and throws
   on `undefined`.
4. **quarks has its own math types.** `ApplyForce` wants a quarks `Vector3` and a
   `ValueGenerator` magnitude, not a THREE vector. `SizeOverLife` takes a
   `PiecewiseBezier`, `ColorOverLife` a `Gradient` with separate `color` and
   `alpha` arrays. Passing THREE types throws at update time, not construction.

## Candidate table

| Library | License (verified) | Vanilla three? | r170 | Verdict |
|---|---|---|---|---|
| **three.quarks** 0.16.0 | MIT | yes | **verified running** | **Adopt** |
| three-nebula 13.2.0 | MIT | yes | peer `>=0.122 <1.0` | Consider (no trails/flipbooks) |
| wawa-vfx-vanilla 1.2.10 | MIT | yes | peer `>=0.159` | Consider (stale ~1yr) |
| @newkrok/three-particles 3.0.0 | MIT | yes | peer `^0.182` | Reject for now (r170 too old) |
| tsparticles | MIT | **no** — 2D canvas | n/a | Reject (wrong dimensionality) |
| @pixi/particle-emitter | MIT | **no** — PixiJS | n/a | Reject (wrong renderer) |
| vfx-js | MIT | **no** — DOM elements | n/a | Reject (not scene VFX) |
| vanilla-vfx / Three-VFX | MIT | WebGPU only | n/a | Reject (needs `three/webgpu`) |
| `@ffgflash/three-particles` | — | — | — | **Does not exist** on npm |

three.quarks wins on the combination that matters: MIT, framework-agnostic,
and feature-deep enough to replace what `fx.js` hand-rolls — batched single-draw
rendering, lifetime curves, flipbook animation, sub-emitters, and a trail
renderer. It owns its own scene-graph node and is driven by explicit system
objects, so it does not violate the module contract.

## Post-processing

`game/index.html` already maps `three/addons/`, so these cost **zero install**:

| Pass | Adds |
|---|---|
| `UnrealBloomPass` | glow on emissive elements, impacts |
| `AfterimagePass` | trails during existing hitstop/slowmo |
| `RGBShiftShader` via `ShaderPass` | chromatic split on a hit frame |
| `OutputPass` | correct color space with a composer |

`postprocessing` (pmndrs, **Zlib**) is the larger option: 33 effects including
`ShockWaveEffect`, `SelectiveBloomEffect` and `ChromaticAberrationEffect`. Same
`/+esm` trap applies — map the raw `build/index.js`. r170 is inside its
`>=0.168 <0.187` peer range.

Rejected on license: `lygia` (Prosperity License, noncommercial only),
Shadertoy shaders (default CC BY-NC-SA 3.0), `realism-effects` (stale against an
API r172 deletes), `glslify` (needs a build step).

## Art assets

| Pack | License | Verdict |
|---|---|---|
| Kenney Particle Pack | CC0 (verified on page) | **Add** — 80 soft sprites |
| Kenney Smoke Particles | CC0 (verified on page) | **Add** — 77 sprites |
| Brackeys' VFX Bundle | CC0 (verified in page text) | Consider — check flipbooks for style clash |
| Screaming Brain Abstract Noise | CC0 (verified) | Consider — dissolve/erosion masks |
| Kenney Explosion Pack | **UNVERIFIED** — page 404s | Do not add without a live license source |
| CodeManu Free VFX | **conflicting** CC0 vs CC BY 4.0 | Reject |
| BDragon1727, Pipoya, ansimuz | non-redistributable / unstated | Reject |
| Unity Asset Store "free" packs | engine-bound EULA | Reject |

KayKit and Quaternius contain **no** VFX content; the only effect-adjacent asset
in the whole library is a `smokebomb.gltf` prop.

## What this costs

Two blockers are in this repo, not in any library:

1. **The library pipeline only indexes `.glb`/`.gltf`.** `scripts/index-library.mjs`
   skips everything else, so adding Kenney's PNG particle packs requires a schema
   change to `catalog/index.json` (a `kind: "texture"` entry) or a separate path.
2. **The game never loads an external image file.** Every texture in `game/src/`
   is a procedural `CanvasTexture` (`fx.js:145`, `title.js:110`). Sprite-based
   VFX needs a `TextureLoader` path that does not exist yet.

Plus: `fx.js` currently uses `THREE.Points` with a hardcoded circular alpha
falloff (`BURST_FRAG`, `fx.js:50`). Textured billboards are a real upgrade but
they are a rewrite of the burst pool, not a drop-in.

## Recommendation

**Ordered by impact per unit of work:**

1. **Built-in post-processing passes.** No install, no import-map change, ~20
   lines. Bloom plus an afterimage during the hitstop that already exists is the
   single largest visual jump available.
2. **Kenney Particle Pack + Smoke Particles.** CC0, same author as half the
   existing library, zero style risk. Requires the two pipeline changes above.
3. **three.quarks 0.16.0** for the effects that hand-rolled `Points` cannot
   express: trails, flipbooks, sub-emitters. Pin the version; budget a day.
4. **Effekseer** (MIT, no bundler) only if authoring volume outgrows code. It
   adds a WASM renderer and a second draw pass.
5. **Blender** only for a specific hero effect — GPL tool, 348 MB, and material
   animation is experimental (`KHR_animation_pointer` is not supported by
   three.js GLTFLoader without a third-party plugin).

Separately, and unrelated to any of the above: the mage's light attack lunges
forward ~1.0 unit into melee range. `startSwing()` sets `lungeT` and
`lungeSpeed` unconditionally (`game/src/player.js:741`), including for the
`style: "blast"` ranged hero whose `heavy` correctly has `lunge: 0`. That is a
one-line conditional, not a design problem.

## Verification status

| Claim | Status |
|---|---|
| three.quarks 0.16.0 runs on r170, renders pixels | **Measured in this repo** |
| Single three.js instance under the raw ESM path | **Measured** |
| `/+esm` pulls three@0.175.0 | **Measured** |
| The four spike gotchas | **Measured** |
| Kenney pack licenses, fetchability via the existing script | Verified against kenney.nl |
| All other licenses and peer ranges | Verified against npm/GitHub metadata |
| Whether Kenney Explosion Pack is still CC0 | **UNVERIFIED** — page 404s |
| three.quarks + the real game loop (pooling, `reset()`) | **Not tested** — spike was standalone |
