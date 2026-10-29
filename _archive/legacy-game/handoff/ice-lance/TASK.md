# Task 02: the mage's first spellbook spell — Frost Lance

## Mission and boundaries

Work in `C:/Users/silen/projects/kilo-3d-kit`. The user will run you in DeepSeek's
desktop harness. Implement a real mage spell in this existing Three.js game.
Read root AGENTS.md, game/src/CONTRACT.md and ../SHARED-OWNERSHIP.md first.
The outdoor map is being implemented concurrently; do not wait for it or edit
its owned files. This spell must work with either the existing dungeon or the new
valley, using world.bounds/colliders instead of hardcoded map dimensions.

The long-term mage has three spells that alternate on successful casts. This
task implements ONLY the first, Frost Lance. Use an active spell list containing
only `ice-lance` and a simple next-cast index. Later the sequence becomes A -> B
-> C -> A; today it is A -> A. No empty slots, fake spells or failures every third
cast. Rejected/cancelled casts do not advance the index. A new run resets it.
Switching away and back must not grant a free cast by resetting its cooldown.

Frost Lance replaces the mage's normal/light arcane bolt on the existing attack
input. Keep the mage's heavy and Meteor, movement, aiming, animations, party swap
and all other heroes working. Do not introduce new keybindings or restyle HUD.
This is the first spellbook ability integration, not the full book UI, unlock
system or math-learning mechanic. Do not place a book in the unfinished map.

## Read and look before implementing

Reference root: `C:/Users/silen/Downloads/VFX-godot/` (read-only).
Use the original THREE.JS implementation as the visual source of truth:

- `spellbook/src/config/abilities/ice.js` — parameters and effect description.
- `spellbook/src/abilities/IceAbility.js` — eruption orchestration/instancing.
- `spellbook/src/materials/IceMaterial.js` — shading approach.
- `spellbook/src/assets/ProceduralGeometry.js` — crystal construction.
- `reference/frost-lance/plates/ice__sheet__hero.png` — inspect this image.
- `reference/frost-lance/plates/ice__sheet__master.png` — extra views if needed.

Frost Lance is a GROUND ERUPTION, not a thrown spear. `ShatterlanceAbility.js`
is a different spell; do not accidentally implement it. Ignore instructions to
port to Godot: this target is the existing Three.js game. Do not modify the VFX
reference project or start a second reference server on its shared port 5173.

The reference uses Three.js ^0.185.1; this game uses ^0.170.0. Adapt the small
required pieces to the installed version. Do not upgrade the game engine or
transplant the reference's editor, render pipeline, particle engine, 100-spell
registry, postprocessing stack or scene context. If copying substantial source,
preserve its MIT notice from spellbook/LICENSE in a new game/src/spellbook-LICENSE.txt
and identify adapted source files. This code license is separate from CC0 models.

## Desired spell and initial tuning

At the existing Spellcast animation's impact beat, a cold pulse leaves the mage.
A narrow fracture front races along the locked aim direction. Small near-caster
crystals rise first; larger leaning crystals form a dramatic crown at the end.
A pale frost footprint, brief chips/mist and sparse glints sell the impact.
The field then sinks/fades cleanly. Make the silhouette recognizably match the
reference; a blue sphere with an ice label is not sufficient.

Starting parameters, tune only when observed gameplay needs it:

| Parameter | Initial value |
|---|---:|
| Maximum reach | 12 m |
| Minimum usable line length | 2.5 m |
| Front speed | 26 m/s |
| Half-width near / far end | 0.55 / 1.6 m |
| Near / far crystal height | 0.35 / 2.4 m, a few tips up to 3 m |
| Crystal instances | 72-96 per cast, 2-3 shared shape variants |
| Cooldown between accepted casts | 1.0 s minimum, respecting existing animation cadence |
| Standing field / withdrawal | about 1.2 / 0.5 s after front completes |
| Damage | one 1.25x existing rolled mage light damage hit per enemy per cast |
| Element | frost for THIS spell only |
| Extra stun | 0.15 s; existing elemental reactions retain their own effects |
| Concurrent visual cast slots | 3; reuse oldest finished/visual slot if saturated |

Use existing stats for damage/crit/reaction multipliers and momentum, not an
independent damage subsystem. Award normal light-cast momentum once, not per
crystal. VFX recycling must never cancel already accepted gameplay damage.
Retain ordinary existing frost reactions. Do not make standing crystals solid
walls, grant permanent freezing, or tick damage every rendered frame.

## Small integration design

1. `ice-lance-config.js`: spell-only constants, active spell list and minimal
   settings shared by gameplay/visuals. The map agent owns balance.js, so leave it
   alone. Config can be consolidated by Codex after both tasks, if useful.
2. `player.js`: hook the mage light attack at fireImpact, replacing only its old
   bolt branch. Accept and lock origin, horizontal aim, clipped travel length,
   rolled damage/crit and a castId. Emit `player-spell-cast`. Avoid double-firing
   the old projectile and the new spell. Use the existing cooldown/animation
   state; handle swap/cancel/retry deliberately, with index advancement at the
   successful cast event. Geometry creation is not a player responsibility.
3. `enemies.js`: subscribe to the new event, advance a small bounded set of spell
   fronts in the existing update, and call existing damageEnemy when the front
   reaches an enemy. One hit set per cast prevents repeat hits across frames.
   Use the same clipped footprint/timing as the VFX. Reset pending fronts/hit
   sets in clearAll. Do not import player.js or call private player functions.
4. `ice-lance-vfx.js`, integrated only by `fx.js`: own the instanced geometry,
   shared materials and fixed cast slots. Receive the event and update from the
   existing FX frame hook; clear on FX reset. A private optional logic helper is
   justified only if it avoids duplicating the exact footprint/front math.

Freeze the event shape before delegating:
`{ spellId: 'ice-lance', castId, origin: {x,y:0,z}, dir: {x,z}, range,
damage, crit, element:'frost', reactionMult, auraMult, executeMult, reactionHeal }`.
Origin/dir are copies, not mutable player vectors. Use a normalized nonzero dir.
Config supplies widths/speed. The player locks a valid length at impact; stop
the line at the first solid world collider/boundary. A line shorter than 2.5 m
is refused cleanly without damage, VFX, cooldown or sequence advancement. Show
existing feedback if practical without touching HUD files.

Enemy hits use XZ projection onto the locked line with enemy radius included
in the lateral test. Apply damage only as the advancing front reaches that
position; a swept previous-front/current-front check avoids missing enemies at
lower frame rates. Handle an enemy entering the already-erupted field explicitly:
it does not receive a new contact hit after the front has passed. A given target
is hit at most once per cast. Standing ice is decorative after that cast's front.
No second explosion hit at the far end on top of the line's damage.

Respect the game's existing simulation delta/hitstop rules. FX and damage must
agree on front progress; check how main supplies dt and how fx currently rescales
it before wiring the helper. Never advance the spell on wall-clock setTimeouts.

## Parallel work without overengineering

Use at most two leaf subagents, if the harness supports them: one owns only the
new VFX helper after agreeing its interface; one owns only a focused test file
after agreeing event semantics. The lead owns player/enemies/fx/config integration.
Do not give agents overlapping files or spawn managers. If no subagents exist,
do the work sequentially. Do not build orchestration tools.

Preallocate the crystal geometry, material palette and cast slots. A cast
updates pooled records and instance transforms. Share geometries/materials;
avoid full transparent screen-filling mist, expensive layered noise, refraction,
scene captures or dynamic point lights per crystal. No new full-screen passes,
new dependencies, per-cast shader creation or per-frame needsUpdate recompiles.
A small simple ice material plus good facets and timing is a valid cheap first
version. Retain readable crystalline shading, not generic glowing cones.

## Only the checks that matter

- Establish the existing suite result once before editing; run it once after
  integration. Concurrent map changes may affect it: record actual causes and
  do not fix the other agent's files. Add only `game/tests/ice-lance.test.mjs`
  and run it directly, leaving package.json unchanged.
- Focused tests: valid mage casts replace the old bolt and carry frost; refusal
  does not advance the list; front timing and one-hit-per-target are correct;
  reset removes pending damage and swap does not bypass cooldown. Include an
  off-line enemy and an enemy beyond the clipped endpoint as negative cases.
  Reuse the existing enemy-test fake loader/event bus instead of a new framework.
- In browser, select Mage, aim in different directions and fight one wave. Show
  a cast hitting multiple enemies along the line and missing one outside it.
  Switch heroes, return, cast, die/retry: no stale ice, listeners or delayed hits.
  Verify other hero attacks, mage heavy and Meteor still work. Check console.
- Capture three gameplay views: early front, peak field and cleared aftermath,
  plus a short in-game cast clip if recording is already available. Do not build
  a render/video pipeline for this. Evaluate against the source contact sheet,
  including visibility against the bright outdoor ground if the map is ready.
- Measure one warmed-up 10-second repeated-cast sample at a recorded resolution,
  DPR and device against the same scene without casting. Aim for <=15 extra draw
  calls with one active cast and <=35 with three. Report actual p95 frame interval
  and calls, not guessed FPS. After 30 casts and one retry, active resources should
  return to the warmed pool baseline; lazily populated stable caches are okay.
  Distinguish the first-use hitch from repeated-cast cost. If renderer access is
  unavailable, report that limitation rather than changing main.js just to expose
  it. No shader compilation should be deliberately triggered on each cast.

Once these pass, stop. No shader parameter editor, generic spell framework,
ability plugin architecture, skill tree, networking, full spellbook UI or broad
combat rebalance. Unlimited model tokens do not expand the implementation scope.

## Report back through files

Update PROGRESS.md here with checklist, changed files, actual test outcomes,
browser evidence, performance, adapted-source/license details and remaining
limitations. Record the new event/helper contract for later consolidation in
CONTRACT.md. Do not edit the map task's progress or claim its checks passed.
Do not push/deploy. Codex will review both results after the user hands them back.
