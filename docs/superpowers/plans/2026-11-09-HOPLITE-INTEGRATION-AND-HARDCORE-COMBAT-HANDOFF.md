# Hoplite Master Integration & Hardcore Tactical Combat Handoff (`2026-11-09`)

## 0. STOP — Verify Your Branch & Workspace Layout First (`5 Seconds`)

Before reading or editing any code, verify that you are on the **True Modern `main` / `master` branch**:

1. Check that [`BRANCH_CANARY_TRUE_MASTER_2026_11_09.md`](file:///C:/Users/silen/projects/kilo-3d-kit/BRANCH_CANARY_TRUE_MASTER_2026_11_09.md) exists at the repository root.
2. Check that your active game directory **`world/`** has:
   - `world/src/ui/damage-numbers.js` (Option 2 consolidated damage counters)
   - `world/assets/textures/hud/knight-emblem.png` & `mage-emblem.png` (authentic chibi portraits in our modern translucent HUD)
   - `world/src/ui/app-flow.js` with `IGN_64X64` (`1.5px` Sunbeam Lithograph Stipple dither onboarding + one-shot still lobby greeting)
   - `world/assets/models/inscriptions/site1-well-live.glb`, `site2-grove-live.glb`, `site3-wall-live.glb` (3 carved sandstone monuments + Ghibli well water)
3. Check that **`_kranioi_work_to_integrate/`** exists at the repository root.

### Why `_kranioi_work_to_integrate/` Is in a Separate Folder
In the previous session (`hoplite/kranioi-404312d9`, commit `1956859`), your 4 phases of work (KayKit v2 loader, Knight/Mage/Sky VFX, and the Workstream B Enemy Overhaul) were accidentally built on top of an older November 6 snapshot (`fc41024` / `5a24af8`) that was missing 28 commits of our modern UI, 3 carved stone monuments, 12-enemy roster, over-the-shoulder parabolic aiming, and 68-meteor Sky Shower Q.

To make integration 100% lossless and crystal clear:
- **`world/`** is our **True Modern Master** (the live game you will edit).
- **`_kranioi_work_to_integrate/`** contains **every single file** from `hoplite/kranioi-404312d9` (`1956859`) right here in the same checkout (and `kranioi-reference` is also pushed as a git branch if you want `git diff`).

---

## 1. Hard Protection Rules — What You Must NEVER Overwrite in `world/`

When integrating code from `_kranioi_work_to_integrate/` into `world/`, **NEVER overwrite or regress** these modern systems in `world/`:

1. **DO NOT TOUCH THE UI / HUD / ONBOARDING FILES:**
   - Keep `world/src/ui/app-flow.js`, `world/src/ui/sculpted-hud.js`, `world/src/ui/damage-numbers.js`, and `world/assets/textures/hud/*` **as they are in `world/`**.
   - Never copy `_kranioi_work_to_integrate/world/src/ui/sculpted-hud.js` over `world/src/ui/sculpted-hud.js` (the `_kranioi` copy is the old Nov 6 beige HUD with inline SVG helmets).
   - If you need a new hook on `sculptedHud` (such as `setVerdictSkyPreview` or guard/poise feedback), add only that specific method to `world/src/ui/sculpted-hud.js` without altering its visual layout, CSS, or chibi portraits.
2. **DO NOT REMOVE THE 3 CARVED STONE MONUMENTS, GHIBLI WELL WATER, OR FLOWER LOBBY PROJECTION IN `world/src/main.js`:**
   - Keep `world/src/main.js`'s 3 segmented stone monuments (`site1-well-live.glb`, `site2-grove-live.glb`, `site3-wall-live.glb`), `enterStoneInspection()`, `updateSacredStoneGaze()`, `damageNumbers`, `updateFlowerLobbyHeroProjections()`, and the `loop: false, clampWhenFinished: true` one-shot lobby greetings on Knight & Mage.
3. **DO NOT SHRINK THE 12-ENEMY ROSTER IN `world/assets/characters/index.js`:**
   - `world/assets/characters/index.js` currently supports **both** the KayKit skeletons AND our external enemy/boss candidates (`OrcRaider`, `PlantWarrior`, `Werewolf_Wolf`, `BlackKnight`, `Necromancer`, `OrcBrute`, `FrostGolem`, `Skeleton_Golem`).
   - When integrating `_kranioi_work_to_integrate/world/assets/characters/index.js` (which loads `library/kaykit-v2/` + `Rig_Medium_MovementAdvanced.glb`, `Rig_Medium_Tools.glb`, `Skeleton_Golem_Axe_Large.gltf`, and `adaptClipBankToRig`), **merge both capabilities** so `npm run fetch:kaykit` populates `library/kaykit-v2/`, all KayKit 1.1 clips (`Running_Strafe_Left/Right`, `Dodge_Left/Right/Backward/Forward`, `Skeletons_Taunt`, `Skeletons_Death_Resurrect`, `Flexing`, etc.) resolve, AND all external enemy candidates in `library/enemy-candidates/` remain playable!
4. **KEEP OUR OVER-THE-SHOULDER PARABOLIC AIMING & 68-METEOR SKY SHOWER Q:**
   - Preserve the over-the-shoulder camera blend (`camState.aimShoulderBlend`), dashed ballistic arc + thin ground reticle (`world/assets/vfx/aim-arrow.js`), front-face bow-shock meteor fire (`world/assets/vfx/cinder-fall.js`), and the 68-meteor `Storm Cataclysm` (`Sky Meteor Shower`) with the golden annular bombardment circle and Knight evacuation AI.

---

## 2. Two Animation & Physics Bugs Found in `_kranioi_work_to_integrate/` (Fix During Integration)

When we audited `_kranioi_work_to_integrate/`, we caught two subtle bugs you mentioned not having time to check:

1. **Bug 1 — Golem Stand-Up from Down Pose (`Death_A` Reversed) & Repeated `LoopOnce` Clips Freezing (`world/assets/characters/index.js`):**
   - In `createCharacterAnimationController().play()`, `action.setEffectiveTimeScale(timeScale)` was called **before** `action.reset()`.
   - In Three.js (`AnimationAction`), when a `LoopOnce` clip with `clampWhenFinished = true` finishes (like `Death_A` when the Golem enters `down`), Three.js sets `action.paused = true`.
   - Calling `action.setEffectiveTimeScale(-dur / 1.0)` while `action.paused === true` sets `this._effectiveTimeScale = this.paused ? 0 : timeScale` (`0`!), and `action.reset()` afterwards does **not** recompute `_effectiveTimeScale`!
   - **Fix:** Always call `action.reset()` **before** `action.setEffectiveTimeScale(timeScale)` in `play()`.
2. **Bug 2 — Enemy Side/Back Dodge Velocity Overwritten on the Next Frame (`world/src/combat/enemy-manager.js`):**
   - In `enemyDodge()`, `e.vx` and `e.vz` are set to `8.5 m/s` and `e.attackAnimTimer = 0.4`, while `e.aiState` stays `'orbit'`.
   - On the very next frame, `thinkOrbit()` runs `approach()` or `standoff()`, which moves the enemy in the approach/orbit direction and fights the dodge impulse.
   - **Fix:** In `thinkOrbit()`, return early (`if (e.attackAnimTimer > 0) return;`) while a dodge or flinch animation is active so the `8.5 m/s` dodge impulse plays out cleanly.

---

## 3. Your Core Mission: Integrate Everything & Design a Genuinely Hard, Smart, Tactical Combat System

Vikas's directive for you:
> *"Tell the agent what to do exactly: the integration, and make the enemies much better, much harder to begin with, instead of just doing boring shit there — actually very hard to deal with, all smart, and a very balanced combat system properly done. That agent is very smart; ask it to design itself."*

### Step-by-Step Execution Plan

#### Phase 1 — KayKit v2 Assets & Unified Character/Animation Controller (`world/assets/characters/index.js`)
1. Run `npm run fetch:kaykit` to populate `library/kaykit-v2/`.
2. Merge `_kranioi_work_to_integrate/world/assets/characters/index.js` into `world/assets/characters/index.js`:
   - Keep `library/kaykit-v2` 2.0 Adventurers, 1.1 Skeletons (`Skeleton_Minion`, `Skeleton_Warrior`, `Skeleton_Rogue`, `Skeleton_Mage`, `Skeleton_Necromancer`, `Skeleton_Golem`), and all 1.1 animation packs (`General`, `MovementBasic`, `MovementAdvanced`, `CombatMelee`, `CombatRanged`, `Special`, `Tools`, plus `Rig_Large` packs).
   - Also keep the `library/enemy-candidates/` roster entries (`OrcRaider`, `PlantWarrior`, `Werewolf_Wolf`, `BlackKnight`, `OrcBrute`, `FrostGolem`) so both KayKit v2 and candidate rigs work seamlessly.
   - Apply the `action.reset()` ordering fix before `action.setEffectiveTimeScale(timeScale)`.

#### Phase 2 — Integrate VFX, Mage Turn/Release-Frame Aiming, Sky Choreography & Atmosphere
1. Integrate from `_kranioi_work_to_integrate/` into `world/`:
   - `world/assets/vfx/ultimate-vfx.js` & `world/assets/vfx/index.js` (Knight Q Awakening & Couples Ultimate frost-and-fire burst)
   - `world/assets/vfx/sword-vfx.js` (Knight breathing swings & blade trail sync)
   - `world/assets/vfx/mage-bolt.js` (Homing/chaining Mage bolts)
   - `world/assets/vfx/artorious-vfx.js` & `world/src/verdict-sky-choreo.js` (Blessing & Smite sky timelines)
   - `world/src/sky-tod.js` (Night nebula band + veiled ringed gas giant + eclipse state)
   - `world/src/post.js` (Depth-based aerial perspective, height fog, sun/moon in-scatter, TOD-aligned grade keys)
   - Keep `world/assets/vfx/cinder-fall.js` (front-face bow-shock fire cradle + magma-veined asteroid + comet plume) and `world/assets/vfx/aim-arrow.js` (over-the-shoulder parabolic arc + thin ground reticle).
2. Wire Mage turn-to-target, release-frame spell spawning, sticky soft-lock hysteresis, and strafe/back-pedal aim locomotion from `_kranioi_work_to_integrate/world/src/combat/combat-action-aim.js` and `player-controller.js` into `world/src/combat/combat-action-aim.js` and `world/src/player-controller.js` while keeping over-the-shoulder mouse/touch aiming intact.

#### Phase 3 — Design & Integrate a Hardcore, Smart, Balanced Combat & Enemy System (`world/src/combat/*`)
Take the foundation you built in `_kranioi_work_to_integrate/world/src/combat/{combat-balance,enemy-manager,campaign-loop,combat-sfx}.js` and **design/elevate the combat and enemy encounter system so it is genuinely challenging, smart, and punishing from Act 1 onward**:
1. **Design Authority:** You have full authority to tune and design enemy AI tactics, wave compositions, attack timings, poise/stagger thresholds, crowd coordination, and damage/HP math so that:
   - Enemies **never** feel like passive, slow punching bags. Even in Act 1, enemies actively pressure both lovers, flank around Knight's shield wall, punish greedy mashing with uninterruptible/hyper-armor counters or shield bashes, hunt an unprotected Mage, and force the players to use **timed parries, directional dodges, Knight shield-intercepts, cross-element marks, and physical/spell detonations** to survive.
   - Integrate the full 3-beat contact-frame attack lifecycle (`windupSlow` -> fast swing -> exact `contactFrac` hit -> `recovery`), ±0.15s timed shield parry + guard meter, poise/stagger regeneration, stride-matched locomotion, Shield-Wall formation + flanking vulnerability, Minion bone-pile reassembly (must be finished by spells/detonations/heavy), Rogue Mage-hunters with reactive side-dodges, Skeleton Mage summoners/casters, Captain rally buffs + unblockable chops, Necromancer bone-wards + ground eruptions, and the 3-phase Skeleton Golem Boss (with crimson petal-crack area decals, Phase 2 Bone Aegis + add waves, down window, and reverse `Death_A` stand-up).
   - Keep our 68-meteor `Storm Cataclysm` (`Sky Meteor Shower`) with the golden annular bombardment circle and Knight evacuation / every-3rd-wave friendly-fire hazard, plus consolidated `damageNumbers` (`world/src/ui/damage-numbers.js`) wired into enemy/boss hits and detonations.

#### Phase 4 — Live Video & Screenshot Verification (`judging-gameplay`)
1. Run all unit & simulation tests (`world/tools/test-enemy-encounters.mjs`, `world/tools/test-mage-aim.mjs`, `world/tools/test-combat-sim.mjs`, `world/test-divine-verdict-sim.mjs`, `world/tools/test-coop-room.mjs`) and ensure 100% pass (resolve the partner distance assertion in `test-combat-sim.mjs` to match the locked `COMMUNE_MAX_DISTANCE = 4.0` / `POWERUP_TETHER_DISTANCE = 5.0` constants in `test-divine-verdict-sim.mjs`).
2. Boot the live game (`node world/tools/serve.mjs`) and capture **live gameplay renders / videos** verifying:
   - The **modern translucent HUD with chibi portraits** and **Option 1 Sunbeam Lithograph Dither Onboarding** are intact and unharmed.
   - The new **`Cinder Fall` meteor visuals** (front-face bow-shock fire, magma asteroid, coaxial comet plume, impact crater) in live play.
   - **Left/right strafe (`Running_Strafe_Left` / `Running_Strafe_Right`) and 4-way dodge directions (`Dodge_Left` / `Dodge_Right` / `Dodge_Backward` / `Dodge_Forward`)** in live play.
   - **The Golem Boss's stand-up from its down pose** (`Death_A` reversed with `action.reset()` before `setEffectiveTimeScale`), plus intense Act 1 / Act 2 / Act 3 combat encounters.
3. Remove `_kranioi_work_to_integrate/` and `BRANCH_CANARY_TRUE_MASTER_2026_11_09.md` once integration is verified and committed, or keep the repo clean on `main`.
