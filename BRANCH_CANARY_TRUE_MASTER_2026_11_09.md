# BRANCH CANARY — TRUE MODERN MASTER (`2026-11-09`)

If you can read this file (`BRANCH_CANARY_TRUE_MASTER_2026_11_09.md`) at the repository root, **you are on the correct, modern `main` / `master` branch**.

---

## 1. Quick 5-Second Verification Clues (Confirm Before Editing Anything)

Verify these 4 clues in your workspace:

1. **Modern Translucent HUD & Chibi Portraits (Active in `world/`):**
   - `world/src/ui/damage-numbers.js` exists (Option 2 Minimalist Big-Moments-Only consolidated damage counters).
   - `world/assets/textures/hud/knight-emblem.png` and `world/assets/textures/hud/mage-emblem.png` exist (authentic chibi portraits used by `world/src/ui/sculpted-hud.js`).
   - `world/src/ui/app-flow.js` has `IGN_64X64` (`1.5px` Sunbeam Lithograph Stipple dither reveal — Option 1).
2. **3 Segmented Carved Sandstone Monuments & Ghibli Well Water (Active in `world/`):**
   - `world/assets/models/inscriptions/site1-well-live.glb`, `site2-grove-live.glb`, and `site3-wall-live.glb` exist.
   - `world/src/main.js` has `enterStoneInspection()`, `updateSacredStoneGaze()`, and `updateFlowerLobbyHeroProjections()`.
3. **12-Enemy Roster & Over-the-Shoulder Parabolic Aiming (Active in `world/`):**
   - `world/assets/characters/index.js` defines `ENEMY_ROSTER_IDS` (`Skeleton_Minion`, `Skeleton_Warrior`, `Skeleton_Rogue`, `Skeleton_Mage`, `OrcRaider`, `PlantWarrior`, `Werewolf_Wolf`, `BlackKnight`, `Necromancer`, `OrcBrute`, `FrostGolem`, `Skeleton_Golem`).
   - `world/src/combat/campaign-loop.js` has the 68-meteor `Storm Cataclysm` (`Sky Meteor Shower`) with the golden annular bombardment circle and Knight evacuation AI.
4. **The Previous Hoplite Agent's Work Is Staged in `_kranioi_work_to_integrate/`:**
   - Because `hoplite/kranioi-404312d9` (`1956859`) was accidentally branched off an older Nov 6 snapshot (`fc41024` / `5a24af8`) that lacked our 28 commits of modern UI, monuments, enemy models, and meteor Q, **every single file modified on `hoplite/kranioi-404312d9` has been extracted into `_kranioi_work_to_integrate/`** right inside this branch (and is also available on the git branch `kranioi-reference`).

---

## 2. Where You Must Edit Code

- **DO ALL YOUR EDITS IN `world/`** (the active game directory).
- **READ FROM `_kranioi_work_to_integrate/`** as your source of modular combat/VFX/sky/animation code to integrate and evolve into `world/`.
- Read [`docs/superpowers/plans/2026-11-09-HOPLITE-INTEGRATION-AND-HARDCORE-COMBAT-HANDOFF.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-11-09-HOPLITE-INTEGRATION-AND-HARDCORE-COMBAT-HANDOFF.md) for the complete file-by-file integration map and your combat/enemy design mission.
