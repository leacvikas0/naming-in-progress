# HANDOFF — Combat/Animation/VFX pass, in progress (2026-11-09)

This branch's last commit holds **unfinished, unreviewed work** from four parallel workstreams.
They were stopped mid-task when usage ran out. Read this first, then:
- `docs/superpowers/plans/2026-11-09-production-refinement-pass.md` (earlier pass; done)
- `docs/superpowers/plans/2026-11-09-combat-encounter-design.md` (the spec for the enemy work)

## Owner requests driving this pass (verbatim intent)
1. "Use each enemy's animations properly to make a challenging and alive fight, not just things
   clobbering in your face." Fighting is the main design focus.
2. "Refine the animations and aiming for the mage too." Really high quality.
3. "The knight's sword stuff: make it more flary so it looks cool af, think Demon Slayer, do it
   efficiently. The ultimate is very boring right now; redesign things properly so it all feels
   cohesive and very high quality."
4. "Refine the blessing and divine smite animation, the sky: make it temporally beautiful, like the
   sky descending." Visual and timing only.
5. Commit to git at every phase.
6. Out of scope (owner handles): God voice/judging/prompts (commune-client, /api/commune,
   /api/altar), Cloudflare/multiplayer.

## Snapshot state at commit time
- Every touched JS file passes `node --check`.
- Test results:
  - `node world/tools/test-combat-sim.mjs`: 11/12. Check 8 is a **pre-existing** failure: it wants
    `COMMUNE_MAX_DISTANCE` = Infinity while `test-divine-verdict-sim` locks it at 4/5. This
    needs an owner decision.
  - `node world/tools/test-mage-aim.mjs` (new): pass.
  - `node world/tools/test-coop-room.mjs`: pass.
  - `node world/test-divine-verdict-sim.mjs`: pass.
  - `node world/test-eclipse-smite-shaders.mjs`: pass.
  - `node world/test-briar-vfx.mjs`: pass.
- **Not verified in a browser**: none of this snapshot has been rendered or reviewed by the lead
  agent. Treat every change as a draft to review, render and finish.

## Assets (required)
- The owner's asset source is https://github.com/GeorgeQLe/assets-kaykit-3d-characters (CC0
  KayKit: Adventurers 2.0, Skeletons 1.1, Character Animations 1.1).
- Run `npm run fetch:kaykit` (`scripts/fetch-kaykit.mjs`, workstream A). It populates
  `library/kaykit-v2/` (gitignored), which needs these folders:
  - `adventurers-2.0/{Characters,Assets}/gltf`
  - `skeletons-1.1/{characters,assets,Animations}/gltf`
  - `character-animations-1.1/Animations/gltf`
  - If the script is incomplete, sparse-clone those paths from `assets/kaykit/` in that repo.
- **Key fact:** the 1.1/2.0 character GLBs embed **no animations** (23-bone skins). All clips live
  in `Rig_Medium_*.glb` and `Rig_Large_*.glb` (Skeleton_Golem is Rig_Large). Many clip names
  changed, e.g. `1H_Melee_Attack_Chop` became `Melee_1H_Attack_Chop`, `Spellcast_Shoot` became
  `Ranged_Magic_Shoot`, `Death_C_Skeletons` became `Skeletons_Death`.
- Clip inventory with durations: regenerate with a GLB JSON-chunk reader. A Rig_Medium summary is
  in the encounter design doc. Notable clips:
  - CombatMelee: Melee_1H_Attack_{Chop,Jump_Chop,Slice_*,Stab}, Melee_2H_Attack_{Chop,Slice,Spin 2.4s,Spinning,Stab},
    Melee_Block/Blocking/Block_Hit/Block_Attack, Melee_Dualwield_Attack_*, Melee_Unarmed_Attack_{Kick,Punch_A}.
  - CombatRanged: Ranged_Magic_{Shoot .93,Spellcasting .67,Spellcasting_Long 2.53,Raise 2.10,Summon 4.30}, Ranged_1H/2H/Bow_*.
  - General: Death_A .8, Death_B 2.63, Hit_A, Hit_B, Idle_A/B, Spawn_Air/Ground, Throw.
  - MovementAdvanced: Dodge_* .4, Running_Strafe_L/R, Walking_Backwards, Sneaking, Crouching.
  - Special: Skeletons_{Awaken_Floor,Awaken_Floor_Long,Awaken_Standing,Death 2.0,Death_Resurrect 2.7,Idle,Spawn_Ground,Taunt,Taunt_Longer,Walking}, Inactive poses.
  - Simulation: Lie_Down/Idle/StandUp, Sit_*.
  - Rig_Large: Melee_2H_Attack, Melee_2H_Slam 2.83, Melee_Unarmed_Smash 3.47, Melee_Dualwield_SlashCombo,
    Melee_Block*, Hit_A, Death_A 1.67, Idle_A/B, Dodge_*, Running_A, Walking_A, Flexing 4.3.

## Workstreams and their write sets (status = stopped mid-task)
| WS | Goal | Files in this snapshot | What to do next |
|---|---|---|---|
| A Loader | Load from `library/kaykit-v2`. Clips come from the Rig_* packs, with an alias table so every old clip name / semantic key still resolves. Add Necromancer + Skeleton_Golem to the roster. Add helpers `getClipDuration` / `resolveClipName`. | `world/assets/characters/index.js`, `scripts/fetch-kaykit.mjs`, `package.json` (`fetch:kaykit`) | Review the alias table. Boot the **real** app (no player-controller stub) and fix console errors and 404s. Check textures, weapons and scale. Render stills of Knight, Mage and skeletons. |
| C Knight sword + ultimates | Demon Slayer breathing styles (Glacial Tide wave curls, Hinokami Sunfire flame tongues, Thunderclap Wisteria zig-zag lightning, eclipse) as layered opaque ink-outlined strokes. Redesign Knight Q (~1.4s: anticipation, lightning column onto the blade, shockwave, then an "awakened blade" state for 10s), Couples Ultimate, and Storm Cataclysm as one visual family. | `world/assets/vfx/sword-vfx.js`, `world/assets/vfx/ultimate-vfx.js` (new), possibly `index.js`, `storm-lance.js`, and trigger code in `player-controller.js` / `campaign-loop.js` | Check how far ultimate-vfx is wired in. Render each style mid-swing plus ultimate keyframes, critique, iterate. Keep numbers and durations unchanged. |
| D Mage aim/anim | Sticky soft-lock with hysteresis and priority, gentle homing, staff-tip origin at the clip's release frame, turn-to-target, Cinder Fall snap with override, touch drag-to-aim on E, clip choice per action (Ranged_Magic_*), dash-cancel of recovery. | `world/src/combat/combat-action-aim.js`, `combat-balance.js` (selectSoftLockTarget), `world/assets/vfx/aim-arrow.js`, `mage-bolt.js`, `player-controller.js` (mage functions), `world/src/ui/sculpted-hud.js`, `world/tools/test-mage-aim.mjs` (new) | Diff review. Verify on tablet and desktop profiles in the browser. |
| E Blessing/smite sky | Temporal choreography: a front descending from zenith to horizon; blessing (hush, cloud parting from the zenith, ivory-gold shafts descending, lotus, crescendo, settle); smite (deadpan beat, crimson-black front sweeping down, eclipse overshoot, one bolt, monochrome snap, release). Locked durations unchanged. | `world/src/verdict-sky-choreo.js` (new), `world/src/sky-tod.js`, `world/assets/vfx/artorious-vfx.js`, `world/src/main.js` | Render timeline stills (~6–8 per verdict) before and after. Ensure the night nebula/planet (gated by `1-ecW`) and the post.js depth atmosphere still behave. |
| **B Enemies (not started)** | Implement `docs/superpowers/plans/2026-11-09-combat-encounter-design.md`: three-beat attacks on contact frames, poise/stagger/parry, turn-taking crowd, stride-matched locomotion, distinct roles (shield Warrior, hunter Rogue, kiting/summoning Skeleton Mage, Captain, Necromancer), minion reassembly, ambushes, Skeleton Golem boss with phases, act layouts. | `world/src/combat/enemy-manager.js`, `combat-balance.js` (ENEMY_ARCHETYPES / ACT_DEFINITIONS), `campaign-loop.js` | Start after A is verified (it needs clip durations). Update test-combat-sim expectations only where the design intentionally changes them, and explain each change. |

## Verification harness (worked in the Linux sandbox)
- playwright-core plus system Chrome, launched with: `--no-sandbox --use-angle=swiftshader
  --enable-unsafe-swiftshader --ignore-gpu-blocklist --use-gl=angle`.
- Serve the repo root over http, open `/world/index.html`, wait for `window.__WORLD__.ready`, then
  call `__WORLD__.setProfile('tablet'|'desktop')`, `setShot(id)`, `toggleHud(false)`,
  `setTimeOfDay('day'|'evening'|'night')`.
- SwiftShader takes about 50s per 800x450 frame.
- The old harness stubbed `world/src/player-controller.js` because `library/` was missing. With
  kaykit-v2 present, drop the stub.

## House rules (from AGENTS.md / SOUL.md)
- Characters come from KayKit only, and use native skeletal clips only (no procedural bone
  wiggling).
- ZERO GLASS: spells and slashes are opaque/cutout cel geometry with HDR cores for bloom, never
  washed-out alpha fog.
- Never read `_archive/legacy-game/src/world.js` or `C:\Users\silen\Downloads\world 1`.
- No red target circles or enemy diamonds (locked plan).
- Commit after every verified phase; keep comments brief.

## Earlier pass already committed (context)
- Combat balance: single shield DR, guard meter/arc, dash cooldown, level/multiplier caps, mark
  ownership.
- Campaign: partner revive, act restart on wipe, stone gating.
- Boss Aegis as a 50% phase; full death clips; enemy shadows fixed.
- post.js depth atmosphere and TOD-aligned grade.
- Night nebula + ringed planet.
