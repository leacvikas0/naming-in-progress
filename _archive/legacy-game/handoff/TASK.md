# Task 01: build Sunpetal Vale

**Concurrent task:** a separate DeepSeek agent may implement Frost Lance. Read
`SHARED-OWNERSHIP.md`; the map task owns world/main/balance, while the spell task
owns player/enemies/fx. Keep edits disjoint and report integration needs in docs.

## Start here

Work in `C:/Users/silen/projects/kilo-3d-kit`.
The user manages the handoff between Codex and DeepSeek. Codex prepared this
design and downloaded assets; DeepSeek implements the playable map. Do not spend
time building an agent bridge, model adapter, or inter-agent messaging service.

Read root `AGENTS.md`, this file, `MAP-DESIGN.md`, `ASSETS.md`, and
`game/src/CONTRACT.md`. Inspect the actual implementations before editing.
`PROGRESS.md` is your checklist and evidence log. `REVIEW.md` is reserved for
Codex's subsequent review: do not mark your own work approved there.

**Goal:** replace the cramped dungeon environment with a beautiful, dreamy,
anime-inspired outdoor valley while keeping the existing two-hero combat game
working. Ship a polished playable area, not a generic scene demo.

**Approved direction:** 96 x 96 metre map, bright meadow, thick edge foliage,
flower-lined loop, ruined shrine, western lakeside view, eastern traveller camp,
soft sun and distant hills. Full layout and acceptance criteria are in the design.

**Not this task:** spellbook mechanics, math curriculum, importing spell effects,
quests, inventory, NPC dialogue, swimming, climbing, terrain physics, a terrain
editor, procedural biome generation, engine migration, or deployment. Reserve
the shrine for the later spellbook task. Do not implement a fake spellbook now.

## Execution approach

Use real subagents if your harness supports them. More tokens are permission to
do good visual work, not to create more systems. Keep at most three workers
active, with one clear owner per file. Do not have agents edit shared files at
the same time. If subagents are unavailable, execute the same work sequentially;
do not build orchestration infrastructure to simulate them.

### 1. Inspect and establish a baseline

- [ ] Check git status; preserve all existing user changes.
- [ ] Read `world.js`, `main.js`, `balance.js`, the world API, and enemy movement.
- [ ] Run `npm test` once as a baseline. Record failures before changing anything.
- [ ] Serve the repository ROOT (`npm run view`), then open `/game/`.
- [ ] Save one baseline gameplay screenshot and collect the performance sample
      described below before editing. Use the same browser/device/viewport later.
- [ ] Choose the small asset palette listed in `ASSETS.md`; inspect loaded bounds
      so trees, props, and characters share a believable scale.

### 2. Parallel preparation with disjoint ownership

The lead agent owns integration, `world.js`, `balance.js`, `main.js`, and the
contract's environment prose. Delegate these bounded jobs in parallel:

**Worker A: foliage and scenic dressing.** Own only a new optional
`game/src/vale-scenery.js`. Implement an environment helper for instanced trees,
bushes, grass, flowers, distant hills, shoreline, and clouds. Consume a root
group, a resolved asset-template map, and named scenery settings from the lead.
Return only update/reset hooks if needed. The lead freezes that small interface
before this worker codes. Use Three.js only; no imports of other game modules.
Do not edit `world.js`, `balance.js`, or `main.js`.

**Worker B: landmark placements.** Own only an optional
`game/src/vale-layout.js`, exporting static named placement data for the shrine,
camp, and route accents. Coordinates must follow the design; no gameplay logic,
no new dependencies, no asset loads. Consume asset keys selected by the lead,
not hardcoded `/library/` URLs. If this would be a tiny list, send the proposed
data back to the lead instead of adding a permanent file.

**Lead: playable world and integration.** Set the dimensions, build the flat
ground and route, load only selected assets once, integrate helpers, preserve
world API/lifecycle, arrange valid spawns, and own title/game lighting changes.
Keep all `ASSETS` URLs and scene configuration in `balance.js`.

Do not spawn another layer of managers/reviewers. When the parallel work is
integrated, use one of the now-free workers for one short review of the diff and
the five acceptance signals. It should report concrete defects only.

### 3. Build in a useful order

- [ ] Make the full-size playable ground, paths, boundaries and three landmarks
      work with placeholder placements. Preserve player start `(0,0,6)`.
- [ ] Integrate the selected models, instancing repeated static mesh primitives
      by geometry/material and modest spatial chunks. Keep flowers low near combat.
- [ ] Add the atmosphere: sky, warm sun, cool fill, restrained haze, water and
      distant silhouettes. Check the player-height view, not only aerial views.
- [ ] Add a little life: gentle tree/grass sway and a small pool of pollen motes.
      Finish the static composition before adding animated decoration.
- [ ] Walk and fight through the actual map; correct sparse-looking vistas,
      blocked routes, excessive density and camera occlusion from observed results.

## High-value verification: exactly five signals

These are the review gates. Fix a failure and rerun the affected check. Do not
create large test suites, run every test after every prop, or chase unmeasured
micro-optimizations.

1. **Loads correctly.** Fresh load at `/game/`, start a run, assets finish loading,
   no failed requests for selected assets, no uncaught runtime/shader errors.
   A screenshot cannot substitute for checking console/network errors.
2. **Looks like the brief.** Save four normal gameplay-camera screenshots:
   central meadow, shrine, western lake view, eastern camp. Include a hero for
   scale. Add one aerial overview only for layout checking. Show distinct places,
   lush layered edges, clear combat silhouettes and a finished horizon. Do one
   visual correction pass if these expose obvious problems.
3. **Traversal and encounters work.** Walk/sprint/dodge around the complete loop
   and every landmark; rotate the camera at each. Play two complete waves, swap
   heroes, cast the existing mage attacks, collect coins, and retry once. Enemies
   must reach the player; no water spawns, trapping, invisible walls in paths,
   floating feet, foliage hiding attacks, or accumulating scenery/lights on retry.
4. **Performance stays usable.** At 1280 x 720, record actual DPR, browser and
   device, then sample 10 seconds after warmup in each of: meadow idle, forest
   view, and combat. Record median/p95 frame interval plus `renderer.info.render`
   calls/triangles. Compare with the baseline at matching resolution/DPR and a
   comparable enemy count. Aim for 60 FPS idle and 45+ FPS combat on this device;
   treat these as targets, not invented guarantees. Idle draw calls should
   preferably stay below 200, total idle triangles below 500k. If the baseline
   already misses FPS targets, explain that and avoid worsening comparable combat
   p95 by more than 25%. Any target miss needs a reason and one focused reduction
   of the measured dominant cost. Do not build a benchmark dashboard or redesign
   rendering in pursuit of an arbitrary number. No unbounded resource growth on retry.
5. **Existing behavior survives.** Run `npm test` once after integration. Report
   the command and outcome, distinguishing baseline failures. If behavior changes
   justify a new test, add only a focused check for spawn validity or world reset;
   don't test the exact number/coordinates of decorative trees or snapshot source.

Use browser automation if available. Never claim visual/performance checks passed
if you only read source or ran Node tests. If browser access is unavailable, say
exactly which signals remain unverified and supply the local URL for the user.

## Keep the solution small

- Reuse the existing loader cache, seed, frame loop and lifecycle. One map;
  handwritten landmarks and seeded dressing. No ECS, new event system, navmesh,
  workers, streaming framework, editor, general biome engine or quality settings UI.
- No new npm dependencies unless the task truly cannot work without one; this
  scene can be built with the existing Three.js version and bundled addons.
- Avoid terrain height changes in playable space. Pretty silhouette hills may
  exist beyond the player bounds; they do not require a terrain movement system.
- Do not fix unrelated combat/UI/audio code or restyle the title screen.
- No per-frame GLTF loading, material/geometry allocation, recompilation requests,
  full foliage regeneration or large particle allocations. Shared animation time
  should update uniforms/transforms, not set `material.needsUpdate` every frame.
- Do not use every downloaded model. A coherent palette of 20-30 models is enough.
- Once the five signals are checked and material failures are addressed, stop.
  Leave future ideas in a short note; do not execute them.

## Deliver

Update `PROGRESS.md` with the checklist, changed files, local URL, screenshots,
test output summary, measured performance, limitations and any questions for
Codex. Include reproducible steps for a failed check. Do not push or deploy.
Keep source/config/docs changes reviewable. The `library/` directory is ignored
by Git: preserve it locally, and explicitly note that asset files must accompany
any later deployment. Do not accidentally commit the original ZIPs.
