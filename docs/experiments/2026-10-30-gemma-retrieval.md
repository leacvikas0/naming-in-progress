# Haru-machi: Gemma retrieval evaluation, 2026-10-30

## Outcome

Use the existing EmbeddingGemma 2 Q8 + Vera for code navigation, scoped initially to the assembled world, and the image MCP for screenshot retrieval. Pair results with current source and the existing live scene inspection API. Godot is outside this evaluation.

## What was run

- Started the current app at http://127.0.0.1:4187/world/index.html. Chrome reported the RX 6700 through ANGLE/D3D11. The checked plaza view loaded with no console errors. This was a runtime smoke check, not a blind visual critique or sustained FPS benchmark.
- Indexed 69 active files into 1,146 chunks (13.6 MiB). The completed run took 144.22 seconds with 8 reported embedding requests, no retries and no timeouts. JS parsing reported no errors; one HTML file had parser errors and one unknown-format file used fallback text indexing.
- Verified that `_archive/legacy-game/src/world.js` is excluded by `.veraignore`; it was not opened or imported for this evaluation. The original user-provided untracked reference image was left untouched.
- Indexed the eight existing assembled-v2 screenshots. Four descriptive searches retrieved the expected view first: aerial masterplan, mill/pier, moonlit shrine, lantern plaza.

## Code retrieval diagnostic

Ten authored natural-language questions targeted known source files for boundary wrapping, sky, post-processing, quality profiles, meadow updates, walkable heights, waterwheel animation, houses, painted textures and screenshot capture.

| Search setup | Expected file first | Expected file in top five |
|---|---:|---:|
| Whole active corpus | 2/10 | 9/10 |
| Assembled-world path filter | 4/10 | 10/10 |

These are file-localization results, not exact-function or task-completion scores. The filter was selected after examining the baseline: this is a practical diagnostic, not an independent held-out benchmark. No broad model-quality claim follows from ten questions. Several results were relevant callers; exact symbols and source reads remain essential.

Use `repo: C:/Users/silen/game-dev/haru-machi`, `path: ["world/src/*.js", "world/assets/**/*.js", "world/tools/*.mjs"]`, `limit: 5`, `compact: true` initially for assembled-world tasks. Expand to blockout/reference code and documentation when the task needs them. Do not exclude useful reference implementations permanently merely to improve a score.

## Real issue found and corrected

The earlier embedding server used a physical batch limit of 2,048 tokens. Vera shortened several long code inputs to fit. A 3,970-token shader-like input reproduced HTTP 500. The Gemma runtime's text context and physical batch were raised to 8,192. The same input then returned HTTP 200 with a 768-dimensional vector. Text Q8 weights, mean pooling and retrieval prompts remain in use. Image runtime settings were kept separate. Initial indexing is GPU work; avoiding truncation is the quality priority.

The shared adapter is `C:/Users/silen/.codex/tools/gemma-search/runtime.cjs`; its pre-change copy has suffix `.before-haru`. Other already-built project indexes are not rebuilt automatically by this evaluation.

## Practical project context

- Three.js installed version: 0.170.0; this app uses WebGLRenderer. Match examples and APIs to that version and renderer.
- Entry: `world/index.html` -> `world/src/main.js`.
- Terrain/water/world placement: `world/assets/terrain/`.
- Meadow and plant geometry/shaders: `world/assets/flowers/`.
- Active village houses: `world/assets/houses/`; `house3d/` is a separate reference kit.
- Sky: `world/src/sky-tod.js`; final post-processing: `world/src/post.js`.
- Views, shots, profile switches and stats are exposed by `window.__WORLD__`.
- A lightweight static scan found 34 relative import edges across 18 importing modules, all resolving to files. This is an import map, not a complete runtime or call graph.
- Some copied instructions and historical screenshot manifests use `C:/Users/silen/projects/kilo-3d-kit`. The supplied `game-dev/haru-machi` path resolves to that canonical directory; avoid treating these aliases as different projects.
- Root README/npm tests still describe the archived game. No gameplay or visual changes were made here.

## Artifacts and remaining limits

Full query results, runtime snapshot, live screenshot and import map are saved under:
`C:/Users/silen/.codex/tools/gemma-search/evaluations/haru-machi-2026-10-30/`.

The image corpus is explicitly refreshed, not watched. Historical images are not automatically linked to current source hashes. Rendering budgets, visual craft, full gameplay behavior and comparative agent task success were not evaluated. Next useful work is an actual requested game change using this workflow, not more synthetic search tests.
