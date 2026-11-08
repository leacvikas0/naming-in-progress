# Amarante — Forensic Audit Receipts & Combat, Aiming, Enemy AI & Balance Overhaul Plan

**Date:** 2026-11-08  
**Status:** Audited & Upgraded by Independent Plan Critic-Fixer — Ready for User Sign-Off & Implementation

---

## Part 1: Forensic Receipts (Why the Current Build Felt Broken in Live Play)

### 1. Why Aiming (`Hold E` & `Hold LMB`) Was Beyond Broken
1. **Receipt 1.1 — Capture-Phase `keydown('e')` & `keydown('tab')` Hijack (`world/src/player-controller.js:2412-2440` vs. `world/src/main.js:3245-3292`):**
   - `player-controller.js:2423` registers a **capture-phase (`true`)** `keydown` listener on `window` that intercepts `'e'`, calls `e.stopImmediatePropagation()`, and calls `startSkillAim()` with **zero arguments (`yaw = undefined, pitch = undefined, distance = undefined`)**.
   - Because `stopImmediatePropagation()` kills the event in the capture phase, `main.js:3284` (`coopSystem.startSkillAim({ yaw: camState.yaw, pitch: camState.pitch })`) **is 100% dead code and never executes!**
   - Even worse, on `keyup('e')`, `player-controller.js:2435` also intercepts in capture phase and calls `releaseSkillAim()` without `{ yaw: camState.yaw, pitch: camState.pitch, distance: eAimDragDistance }`.
   - Similarly, `player-controller.js:2417` intercepts `'tab'` in capture phase with `e.stopImmediatePropagation()`, **bypassing `main.js:3245`'s `if (tabToggleReady)` progression gate and `sculptedHud.setElement(...)`**—allowing players at Stage 0/1 to illegally toggle Fire before Stone 2 is solved while desyncing the HUD!
2. **Receipt 1.2 — Holding `E` Cannot Move the Aim Indicator with the Mouse (`world/src/main.js:3418-3447`):**
   - In `main.js:3418`, `mousemove` checks:
     ```js
     const isShatterAim =
       coopSystem?.player?.activeHeroId === 'Mage' &&
       coopSystem.actionAim?.aimState?.active &&
       coopSystem.actionAim.aimState.spellId === 'shatterlance';
     ```
   - Because it checks `spellId === 'shatterlance'`, holding **`E`** (`frost_lance` or `cinder_fall`) **never updates `eAimDragDistance` and never calls `updateSkillAim` on mouse move!**
   - Furthermore, when PointerLock is not active (`main.js:3434`), `mousemove` hits `if (!pointerDragging) return;`. Since `pointerDragging` is only `true` while holding `LMB`, holding `E` on keyboard and moving the mouse does **nothing at all**—neither camera yaw/pitch nor aim distance responds!
   - Additionally, `combat-action-aim.js:391` hard-locked `fixedDistance: chosenSpell === 'frost_lance' ? FROST_LANCE_AIM_LENGTH : null`, preventing vertical aim control on `Frost Lance`.
3. **Receipt 1.3 — `mousedown` Soft-Lock Snap, `154ms < 180ms` Race Condition, `WASD` Timer Cancel & Locomotion Yaw Overwrite (`world/src/main.js:3305, 3369-3383`, `player-controller.js:1321-1329, 2550, 2721-2724`, `combat-action-aim.js:76-109, 368-380`):**
   - Pressing `LMB` immediately calls `coopSystem.triggerAction('attack')` at `0ms` (`main.js:3369`), which starts `mage_attack1` and **snaps `Mage.yaw` toward a nearby soft-lock enemy** (`player-controller.js:1327`) instead of where the camera is looking!
   - When `mashTimeScale` is ramped (`1.1x–1.3x`), `mage_attack1`'s contact frame (`0.50s * 0.40 / 1.30 = 154ms`) fires *before* the `180ms` `lmbHoldTimer`, so `startSkillAim` fails to cancel the tap bolt.
   - Pressing any `WASD` key while starting to hold `LMB` hits `main.js:3305` (`if (['w','a','s','d',' '].includes(k)) clearTimeout(lmbHoldTimer)`), **aborting Mage's `Hold LMB` before it can even start**!
   - When `Hold E` aiming IS active and the player moves with `WASD`, `player-controller.js:2551` sets `Mage.yaw = aimYaw`, and then 170 lines later in the **same frame** (`player-controller.js:2723`), locomotion overwrites `leader.yaw` toward `Math.atan2(moveX, moveZ)` (the movement direction instead of camera aim!). Also, line `2550` checks `camYaw !== 0`, which evaluates to `false` when facing due South (`camYaw = 0`)!
   - Finally, `main.js:3426` mutates `eAimDragDistance` from mouse `dy` AND mutates `camState.pitch`, and on the next frame `player-controller.js:2552` calls `updateSkillAim` with `distance: undefined`, causing `combat-action-aim.js:375` to apply `-pitchDelta * 18.0` a **second time** (double-mutating distance!).
4. **Receipt 1.4 — Aim Trajectory & Ground Ring Are Buried Underneath the 3D Grass (`world/assets/vfx/aim-arrow.js:317-444` & `qa-video-1.webm` at `00:00–00:01`):**
   - In `qa-video-1.webm` (`00:00–00:01`), the PUBG trajectory arc and target circle are nearly invisible because `aim-arrow.js` builds a `26cm`-wide ribbon whose ground impact ring sits at `y = groundY + 0.108m` (`10.8cm` high), while the 3D meadow grass blades are **`40cm–70cm` tall**! The grass completely buries the landing ring and low trajectory arc.

---

### 2. Why Enemies Were Slow, Passive & Instantly Deleted When Power Unlocked
1. **Receipt 2.1 — Instant `446 + 367 + 140` Damage Explosion vs. `85–190 HP` Enemies (`qa-video-2.webm` at `00:02`, `world/src/combat/combat-balance.js:1384-1636`, `campaign-loop.js:2069-2083`):**
   - **Self-Detonation Bug (`combat-balance.js:220-233, 1466-1486`):** `FINISHER_SOURCES` allows a single hero to detonate their **own same-element mark** (`Knight` `combo1` applies `solar`, `Knight` `combo3` detonates `SOLAR FLARE!`; `Mage` `frost_lance` applies `rime`, `shatterlance` detonates `SHATTERBLOW!`). Even worse, during `eclipse` (`Knight Q`), line `1476` (`... || isSwordHit`) triggers a `SOLAR FLARE!` detonation on **every single finisher swing even with zero mark on the enemy**!
   - **Exponential Multiplier Stacking (`combat-balance.js:1424-1431, 1563`):**
     $$\text{DirectDmg} = (\text{base} \cdot \text{lvl} + \text{fireBonus}) \times \text{infused}(1.35) \times \text{empowered}(1.25) \times \text{ult}(2.0) \times \text{commune}(2.0) \times \text{vuln}(1.35)$$
     And `detonation.bonusDmg` (`70`) is *also* multiplied by `empoweredMult * ultMult` (`140–175 AoE`).
   - **Hidden Frame-0 `Q` Nuke (`campaign-loop.js:2069-2083`):** Pressing Knight `Q` immediately dealt an unannounced `baseDmg: 75` AoE hit (`227–306` direct + `140` detonation = **`446` damage on frame 0**), instantly vaporizing `Skeleton_Warrior` (`145 HP`), `PlantWarrior` (`165 HP`), and `OrcRaider` (`175 HP`) in `qa-video-2.webm` at `00:02`!
2. **Receipt 2.2 — Enemies Stand Motionless (`0 m/s`) on Cooldown & Orbit Passively Outside Range (`world/src/combat/enemy-manager.js:804-815, 1391-1456` & `qa-video-2.webm` `00:00–00:01`):**
   - When an enemy holds one of the `MAX_ATTACK_TOKENS = 3` tokens and is inside attack range while `cooldownTimer > 0` (`1.8s–2.7s`), `enemy-manager.js:1437` executes `playEnemyLocomotion(e, 'idle')` at **`0 m/s` velocity**—standing like a mannequin waiting to be killed for over 2 seconds after every swing!
   - Non-token enemies sit out at `standoffDist = 3.3m–4.4m` (`> melee range`) lazily walking sideways (`orbitSpeed = 0.75`).
   - Every normal player hit forces `hit_A` (`0.32s`) and every detonation stuns all enemies in `4.5m` for `1.4s` AND launches them airborne (`vy = 7.5`), stripping their attack token and resetting `windupTimer = 0` (`combat-balance.js:1588-1601`)—so enemies can **never finish an attack windup** once the player starts mashing!
3. **Receipt 2.3 — Ice Slow Quadruple-Dips on Speed, Rotation, Windup, Cooldown & Outgoing Damage (`world/src/combat/enemy-manager.js:1116, 1282, 1315, 1319, 1333`):**
   - `iceSlowFactor` (`29%–65%`) slows enemy movement, turn rate, windup animation, `cooldownTimer` countdown, AND enemy outgoing attack damage (`line 1333: outgoingDmg = e.dmg * (1.0 - dmgReduction)`) all at once—turning a `2.1s` attack cycle into `5.0s–7.5s` of slow-motion paralysis that hits for `35%` damage.
4. **Receipt 2.4 — `124m` Empty Walk From Flower Field Start, `[-108, 108]` Wave Spawn Clamp, and `44s` Initial Wave Timer (`main.js:2108`, `campaign-loop.js:304, 2533, 3110`):**
   - `onStartGame` (`main.js:2108`) teleports the heroes to **`(0, 124)`** (Southern Flower Field trailhead), which is **`124 meters` away** from `site1_well` (`(0, 0)`, `triggerRadius: 14.0m`).
   - Meanwhile, `survivalWaveTimer` starts at **`44.0s`** (`campaign-loop.js:304`), `triggerSurvivalWave` clamps wave spawn coordinates to `[-108, 108]` (`campaign-loop.js:2533`, even though the player starts at `z = 124`!), and `haven_south_bridge` at `(0, 18.5)` pauses `survivalWaveTimer` within a `16.0m` radius (`z = 2.5..34.5`).
   - Result: For the first **`42+ seconds`** of walking from the Flower Field toward Town, there are **literally ZERO enemies anywhere on the map**!

---

## Part 2: Concrete Engineering & Mathematical Fix Plan

### Fix 1 — Rebuild Mage Aiming (`Hold E` & `Hold LMB`) So It Is Instant, 100% Mouse/Touch-Responsive & Unmistakably Visible Over Tall Grass

1. **Unify Input Handling (`world/src/player-controller.js` & `world/src/main.js`):**
   - **Delete the duplicate capture-phase `keydown('e' / 'tab')` and `keyup('e')` hijack** in `player-controller.js:2412-2440` so `main.js` is the single authoritative input source with full access to `camState.yaw`, `camState.pitch`, `eAimDragDistance`, `eSkillReady`, `tabToggleReady`, `sculptedHud.setElement()`, and `isUiOverlayBlockingInput()`.
   - **Allow Mouse Aiming Anytime `aimState.active === true` (Even Without PointerLock or `LMB` Held):**
     - In `main.js` `mousemove`, always track `const dx = document.pointerLockElement === canvas ? (e.movementX || 0) : (e.clientX - lastMouseX)` and `const dy = document.pointerLockElement === canvas ? (e.movementY || 0) : (e.clientY - lastMouseY)` (updating `lastMouseX = e.clientX; lastMouseY = e.clientY` on every `mousemove`).
     - Whenever `isMageAiming` (`coopSystem?.player?.activeHeroId === 'Mage' && coopSystem.actionAim?.aimState?.active`) is true—for **BOTH `Hold E` (`frost_lance` / `cinder_fall`) AND `Hold LMB` (`shatterlance`)**—moving the mouse ALWAYS rotates `camState.yaw` / `Mage.yaw` horizontally and adjusts `eAimDragDistance` (`0.8m..18.0m` for `shatterlance`, `2.5m..14.5m` for `frost_lance`, `3.0m..16.0m` for `cinder_fall`) vertically, even if PointerLock is not active or `LMB` is not held!
   - **Eliminate Double Pitch/Distance Mutation & Fix `camYaw === 0` Falsy Bug:**
     - Make `eAimDragDistance` (`aimState.customDistance`) the single source of truth during aiming: remove the redundant `-pitchDelta * 18.0` auto-mutation in `combat-action-aim.js:368-380` when `player-controller.js` ticks `updateSkillAim` each frame, and allow `frost_lance` (`Hold E` Ice) to also aim its target distance from `2.5m..14.5m` (removing `fixedDistance: FROST_LANCE_AIM_LENGTH` lock in `combat-action-aim.js:391`).
     - In `player-controller.js:2550`, fix `const aimYaw = typeof camYaw === 'number' ? camYaw : (actionAim.aimState.yaw ?? heroStates.Mage.yaw);` so facing due South (`camYaw === 0`) never evaluates as falsy!
   - **Lock `Mage.yaw` to Camera Crosshair While Strafing with `WASD` (`player-controller.js:2627-2725`):**
     - In `player-controller.js:2718`, prevent `WASD` locomotion from overwriting `Mage.yaw` while `actionAim.aimState.active` is true:
       ```js
       const lockYawForAimOrStrike = Boolean(
         (leader.id === 'Mage' && actionAim.aimState.active) ||
         (activeSw && !activeSw.contactFired && activeSw.elapsed < activeSw.contactTime)
       );
       ```
       When `Mage` is aiming (`Hold E` or `Hold LMB`), `Mage.yaw` stays 100% locked to `camYaw` (PUBG/Genshin camera-strafe aiming) while `WASD` strafes her feet at `0.55x` walk speed!
   - **Keep `0ms` Instant Tap Attack AND Guarantee `100%` Clean `140ms` Hold-LMB Upgrade (Zero Latency, Zero Accidental Tap Bolt, Zero Unwanted Soft-Lock Snap):**
     - **Why we do NOT delay tap attacks to `mouseup`:** Delaying `triggerAction('attack')` until `mouseup` adds `80–140ms` of input sluggishness to every basic attack and breaks unit tests that expect `activeSwing` at `0ms` on press.
     - **The Zero-Latency Solution (`combat-action-aim.js:76-109`, `player-controller.js:1321-1329`, `main.js:3305, 3369-3383`):**
       1. In `combat-action-aim.js`, set `MAGE_COMBO_SPECS[0]` (`mage_attack1`) and `MAGE_COMBO_SPECS[1]` (`mage_attack2`) to `duration: 0.56, contactFrac: 0.48` and enforce `contactTime = Math.max(0.22, effectiveDuration * contactFrac)` in `startComboSwingInternal`. Even at max `mashTimeScale = 1.30x`, `contactTime` is **`>= 220ms`** (never `154ms`!).
       2. In `player-controller.js:1321-1329` (`onSwingStarted`), when `swing.heroId === 'Mage'`, **do NOT snap `Mage.yaw` to off-angle soft-lock targets at `0ms`**—keep `Mage.yaw = camYaw` at swing start, and resolve soft-lock target acquisition at `onContactHit` (`>= 220ms`) within a tighter `±28°` camera-forward cone!
       3. In `main.js:3305`, do **NOT** clear `lmbHoldTimer` on `WASD` press when `coopSystem.player.activeHeroId === 'Mage'`.
       4. In `main.js:3372`, lower Mage's `lmbHoldTimer` from `180ms` to **`140ms`**. Because `140ms < 220ms` (`contactTime`), holding `LMB` past `140ms` **always** cancels the uncommitted `mage_attack1` (`cancelSwing('Mage')`) before any tap bolt fires and enters `shatterlance_aim_start` aligned 100% with `camState.yaw`!

2. **Elevate & Thicken the 3D PUBG Parabolic Arc & Target Ring Above the 70cm Meadow Grass (`world/assets/vfx/aim-arrow.js`):**
   - **Why It Was Invisible:** The ground ring sat at `y = +0.108m` while grass is `0.40m–0.70m` tall, and the ribbon was only `0.26m` wide.
   - **Exact Geometry Fix in `aim-arrow.js`:**
     - Raise the **3D Parabolic Trajectory Arc (`PART 0` & `PART 1`)**: start at the Mage's raised staff crystal (`originGroundY + 1.45m`), peak at **`arcPeak = clamp(1.15 + L * 0.18, 1.35, 3.85)`** (`1.35m` to `3.85m` high in the air—well above all grass and enemy heads!), and widen the trajectory ribbon to **`0.34m–0.44m`** with a vertical 3D cross-section (`localH = 0.14m`) so it is clearly visible from behind-the-shoulder camera angles!
     - Elevate the **3D Target Impact Ring & Bullseye (`PART 2` & `PART 3`)** so its top crown sits at **`y = endGroundY + 0.56m` with a vertical 3D cylinder/beacon skirt down to `endGroundY + 0.04m`** so it **never** gets swallowed by the `40cm–70cm` meadow grass at `0.8m` or `18.0m`!

---

### Fix 2 — Make Enemies Fast, Aggressive, Coordinated & Genuinely Threatening ("They Want Us Dead")

1. **Increase Concurrent Active Enemies from `5` to `8` (`MAX_CONCURRENT_ENEMIES = 8`, `MAX_ATTACK_TOKENS = 4`) While Preserving `uCharShadows[10]` & Tablet `<= 48` Draw Calls:**
   - **Expand `uCharShadows` from `vec4[8]` to `vec4[10]` (`2` Heroes + `8` Enemies):**
     - In `world/assets/terrain/terrain-water.js` (`lines 717, 760, 900`), `world/assets/flowers/meadow.js` (`lines 180, 408, 440, 635`), and `world/src/main.js` (`syncCharacterGroundShadows`, `line 2695`), expand `uCharShadows` from `8` to **`10` `THREE.Vector4` slots** (`filled < 8`) so all `8` active enemies receive grounded contact shadows without overflowing the uniform array.
   - **Prevent Pool Slot Exhaustion in `enemy-manager.js` (`acquireSlot`):**
     - Add fallback slot acquisition in `enemy-manager.js`: if a wave requests a 3rd instance of an archetype whose `2` dedicated slots are already busy, automatically acquire any free non-boss pack slot (`Skeleton_Minion`, `Skeleton_Warrior`, `Skeleton_Rogue`, `OrcRaider`, `PlantWarrior`, `Werewolf_Wolf`) so `8`-enemy waves always spawn in full without dropping units.
   - **Keep Xiaomi Pad 7 Tablet Strictly `<= 48` Draw Calls (`46` Draws with `8` Active Enemies):**
     - In `main.js:3118` (`setProfile`), when `activeProfile === 'tablet'`, hide the BackSide outline `SkinnedMesh` on **all** pooled enemies (removing the `if (slot.isBossSlot) continue;` exemption) as well as Knight and Mage's BackSide outline meshes (`-3` draw calls on Tablet), keeping Tablet at **`<= 46` draw calls** even with `8` concurrent enemies on screen (while Desktop keeps all outlines at `<= 54` draw calls, `120–144 FPS`).
   - **Immediate Road Vanguard Pack & Fast Survival Hunting Waves (`campaign-loop.js`):**
     - Fix the broken `[-108, 108]` coordinate clamp in `triggerSurvivalWave` (`campaign-loop.js:2533`) to **`[-148, 148]`** so hunting waves can spawn around the Southern Flower Field (`z = 124`).
     - Initialize `survivalWaveTimer = 4.5s` (down from `44.0s`) and spawn an immediate **South Road Vanguard Pack (`4` enemies at `(0, 98)`–`(0, 104)`, `20m` ahead of the `(0, 124)` start point)** when the expedition starts so players are engaged within **3–4 seconds** of entering the valley!
     - Shorten the recurring **Survival Hunting Wave timer** from `42–51s` to **`22–28s`** (`4 to 7` enemies per wave, spawning `14m–20m` away and immediately sprinting in), widen Stronghold `triggerRadius` (`site1_well: 14m -> 24m`, `site2_platform: 16m -> 22m`, `site3_wall: 15m -> 22m`), and tighten Safe Haven wave-suppression radius from `16.0m` to **`8.5m`**.

2. **Fix Enemy Speed, Eliminate `0 m/s` Cooldown Idling & Close Standoff Distance (`world/src/combat/enemy-manager.js` & `combat-balance.js`):**
   - **Boost Enemy Movement Speeds by `+25%–35%`:**
     - `Skeleton_Minion`: `5.8 -> 7.2 m/s` (matches player base run speed!)
     - `Skeleton_Warrior`: `4.8 -> 6.2 m/s`
     - `Skeleton_Rogue`: `6.6 -> 8.0 m/s` (faster than base player—forces dashing/blocking/peeling!)
     - `OrcRaider`: `6.2 -> 7.6 m/s`
     - `PlantWarrior`: `5.2 -> 6.4 m/s` (`projectileSpeed: 11.5 -> 14.5 m/s`)
     - `Werewolf_Wolf`: `6.8 -> 8.4 m/s` (true pounce hunter—closes gap rapidly!)
     - `BlackKnight`: `4.6 -> 6.0 m/s`
     - Bosses (`Necromancer`, `OrcBrute`, `FrostGolem`, `Skeleton_Golem`): `4.1..4.5 -> 5.5..6.2 m/s`
   - **Cut Attack Cooldowns & Windups so Enemies Attack Relentlessly:**
     - Reduce `attackCooldown` across all melee archetypes from `1.8s–2.7s` down to **`0.85s–1.25s`** (`windupDuration: 0.42s–0.55s`), and reduce initial `cooldownTimer` on spawn to `0.15s–0.30s`!
   - **Eliminate `0 m/s` Cooldown Idling (`enemy-manager.js:1437`):**
     - When an enemy holds an attack token and is on its `0.85s–1.25s` `cooldownTimer`, **never** stand still in `'idle'`! Instead, have it **actively circle-strafe around the player's flank (`1.85m–2.4m` radius at `0.75x` run speed)** trying to get behind the Knight's shield or surround the Mage!
   - **Tighten Non-Token Flanking Radius (`standoffDist: 3.3..4.4m -> 2.2..2.8m`):**
     - Enemies waiting for an attack token close in to **`2.2m–2.8m`** and aggressively pincer from opposite angles (`+90° / -90° / 180°` surround slots) instead of hanging back at `4.4m`.
   - **Poise / Anti-Stunlock Rules (`enemy-manager.js` & `combat-balance.js`):**
     - Basic attacks (`combo1/2/3`, `mage_attack1/2`) apply `35ms` hitstop and a visual flinch blend, **NOT** a `0.32s` full AI lock (`attackAnimTimer`), and **never cancel an enemy's active attack windup**!
     - Only **Elemental Detonations (`Shatterblow` / `Solar Flare` / `Rime Shatter`)**, **Knight Sprint-Intercept**, **Heavy/Charged Finishers (`Shatterlance`, `Combo4`)**, or **Boss Phase Breaks** can interrupt a standard enemy windup—and Elites/Bosses (`BlackKnight`, `OrcBrute`, `FrostGolem`, `Skeleton_Golem`, `Necromancer`) have **Super-Armor during windup** that can ONLY be interrupted by a **Detonation** or **Ultimate**!

3. **Fix Ice Slow Five-Way Dip (`enemy-manager.js:1116, 1282, 1315, 1319, 1333`):**
   - Cap `iceSlowFactor` at **`25%` (`0.25`)** (`15%` on Bosses/Elites) for `3.0s`, and apply it **ONLY to movement speed and attack animation speed**—removing the `iceTimeMult` penalty on `cooldownTimer` (`line 1116`) and removing the `1.0 - dmgReduction` outgoing damage penalty (`line 1333`)!

---

### Fix 3 — Fix the Combat & Power Scaling Math (Stage-Aware Co-Op Detonations + Smart Solo Wingman Synergy + Meaningful TTK)

1. **Two-Tier Co-Op & Stage-1-Safe Detonation System (Eliminates Solo Basic-Mash Self-Detonation While Keeping Stage 1 & Solo 100% Playable):**
   - **Bug Fixed:** Previously, `MARK_TO_DETONATION` allowed a single hero spamming basic attacks (`combo1 -> combo3`) with 1 element to detonate their own mark on every 3rd hit (`SOLAR FLARE! 140`), and during `eclipse` (`Knight Q`), `isSwordHit` triggered a detonation even with **zero mark** on the enemy (`combat-balance.js:1476`).
   - **Hidden Trap Fixed by Critic:** A naive "Fire-only detonates Ice" rule would break **Stage 0 & Stage 1** (before Stone 2 is solved, when ONLY `Ice` is unlocked and neither hero has `Fire`!), leaving players unable to detonate marks or break `BlackKnight`'s shield at Stage 1.
   - **New Two-Tier Rule (`combat-balance.js`):**
     - **Rule A — Basic Swings Never Self-Detonate:** `combo1`, `combo2`, `combo3`, `mage_attack1`, `mage_attack2`, `mage_attack3` **apply/refresh** elemental marks (`rime` or `solar`) but **never** detonate a same-element mark, and `eclipse` (`Knight Q`) **never** detonates an unmarked enemy!
     - **Tier 1 — Heavy Partner / Charged Shatter (`RIME SHATTER!`, Available at Stage 0 & Stage 1):**
       - Striking an already `rime`-marked enemy with a **Heavy Committed Finisher** (`Mage` Charged `Shatterlance` or `Knight` `Combo4` / `Sprint-Intercept`, with a `3.5s` per-target internal detonation cooldown) triggers **`RIME SHATTER!` (`40 AoE Dmg`, `0.70s` stagger, shatters `BlackKnight` frontal shield)**. This guarantees players at Stage 0 & Stage 1 can break shields and reward co-op finisher timing before Fire is unlocked!
     - **Tier 2 — True Cross-Element Co-Op Detonation (`SHATTERBLOW! / SOLAR FLARE!`, Stage 2+ & Stage 3 `Eclipse`):**
       - Striking an Ice (`rime`) mark with any **Fire (`solar`)** skill/finisher (`Knight` Fire Sword `combo3/4/intercept` or `Mage` `Cinder Fall`), OR striking a Fire (`solar`) mark with any **Ice (`rime`)** skill/finisher (`Knight` Ice Sword `combo3/4/intercept` or `Mage` `Frost Lance` / `Shatterlance`), OR striking a marked enemy with Knight's Stage-3 Twin-Element `Q` (`eclipse` blade, `3.5s` per-target cooldown) triggers the full **`SHATTERBLOW! / SOLAR FLARE!` (`60 AoE Dmg`, `0.95s` stun, breaks Boss/Elite Super-Armor, `+20 Q Energy` to both heroes)**.
   - **Upgrade Solo AI Wingman for Automatic Opposite-Element Synergy (`campaign-loop.js:1264 & 3140-3231`):**
     - In `campaign-loop.js:1264`, when Stage 2 (`fireUnlocked`) is active in Solo mode, casting a Mage spell attunes AI Knight to the **opposite element** (`frost_lance` -> `solar`, `cinder_fall` -> `rime`) instead of the same element!
     - In `campaign-loop.js:3187`, remove the broken `&& combatHeroes.Knight.breathingStyle === 'none'` check that stopped AI Mage from casting whenever Human Knight pressed `E`. Instead, AI Mage casts every `6.5s` and automatically picks `'cinder_fall'` (Fire) when Knight's blade is `Ice` (`rime`) and `'frost_lance'` (Ice) when Knight's blade is `Fire` (`solar`)!
     - In `campaign-loop.js:3146`, allow AI Knight (when Human plays `Mage`) to activate `E` Power Sword (picking the opposite element to Mage once Stage 2 is unlocked) and chain `combo1..combo4` so solo Mage players get true cross-element detonations!

2. **Replace Exponential Multiplier Stacking with Clean, Bounded Additive Buffs & Remove the Hidden Frame-0 `Q` Nuke:**
   - **Remove the unannounced `baseDmg: 75` (`446 Dmg`) instant AoE nuke on Knight `Q` press (`campaign-loop.js:2069-2083`)**: Pressing `Q` on Knight plays his `0.45s` ignition pose + `3.5m` stagger wave (`25 Dmg`) and ignites his **`12.0s` Tanjiro Twin-Element Fire+Ice Blade (`1.65x` direct slash damage + dual Fire/Ice marks + `3.5s` internal detonation cooldown per target)**—so you actually have to **fight and slash enemies with your dual blade**, not press `Q` and watch the room die on Frame 0!
   - **Cap & Balance Damage Formula (`combat-balance.js:1424`):**
     - `Knight E Power Sword`: **`1.25x`** direct sword damage + applies `rime` (`25%` slow) or `solar` (`12 DPS` burn for `3.5s`) mark.
     - `Knight Q Twin-Element Blade`: **`1.65x`** direct sword damage + applies both `rime` & `solar` effects.
     - `Cross-Element Detonation`: Fixed **`60 AoE Dmg`** (`Rime Shatter`: `40 AoE Dmg`; `Shatterblow`: `0.95s` stun; `Solar Flare`: `5.0 m/s` horizontal knockback, **zero vertical sky-launch `launchVy` juggling** that makes enemies untargetable in the air!). Detonation damage does **not** multiply by `ultMult * empoweredMult`.
     - `Mode B Divine Blessing`: **`1.50x`** damage + `50%` DR (down from `2.0x * 1.25x * 1.35x * 2.0x = 6.75x`).

3. **Rebalance Enemy HP & Damage Table for Thrilling 2-Player Co-Op Survival:**

| Archetype | Old HP / Dmg / Speed / CD | **New HP / Dmg / Speed / CD** | Unbuffed Solo TTK | Powered Co-Op TTK (With Cross-Element Detonation) |
| :--- | :--- | :--- | :--- | :--- |
| **`Skeleton_Minion`** | `85 HP` / `12 Dmg` / `5.8` / `1.9s` | **`140 HP` / `15 Dmg` / `7.2 m/s` / `0.95s`** | ~2.4s (1 full combo) | ~1.2s (fast pack rusher) |
| **`Skeleton_Rogue`** | `110 HP` / `15 Dmg` / `6.6` / `1.8s` | **`185 HP` / `18 Dmg` / `8.0 m/s` / `0.85s`** | ~3.2s | ~1.6s (relentless Mage-hunter flanker) |
| **`Skeleton_Mage`** | `105 HP` / `16 Dmg` / `4.4` / `2.7s` | **`175 HP` / `19 Dmg` / `5.2 m/s` / `1.35s`** | ~3.0s | ~1.5s (fast `14.5 m/s` bolts every `1.35s`) |
| **`Skeleton_Warrior`** | `145 HP` / `16 Dmg` / `4.8` / `2.2s` | **`250 HP` / `20 Dmg` / `6.2 m/s` / `1.10s`** | ~4.3s | ~2.2s (shielded frontline bruiser) |
| **`PlantWarrior`** | `165 HP` / `17 Dmg` / `5.2` / `2.1s` | **`280 HP` / `21 Dmg` / `6.4 m/s` / `1.05s`** | ~4.8s | ~2.3s (ranged thorn / melee spear switcher) |
| **`OrcRaider`** | `175 HP` / `19 Dmg` / `6.2` / `2.0s` | **`310 HP` / `23 Dmg` / `7.6 m/s` / `1.00s`** | ~5.3s | ~2.6s (aggressive berserker) |
| **`Werewolf_Wolf`** | `190 HP` / `21 Dmg` / `6.8` / `1.85s` | **`350 HP` / `25 Dmg` / `8.4 m/s` / `0.90s`** | ~6.0s | ~2.9s (leaping pounce hunter) |
| **`BlackKnight` (Elite)** | `340 HP` / `24 Dmg` / `4.6` / `2.1s` | **`580 HP` / `28 Dmg` / `6.0 m/s` / `1.15s`** | ~12s frontal (`80%` DR) | ~4.5s with Co-Op Flank or Detonation |
| **`OrcBrute` / `Necromancer`** | `750–820 HP` / `26–28 Dmg` | **`1,250–1,350 HP` / `32 Dmg` / `5.8 m/s` / `1.25s`** | ~24s | ~11–14s sustained co-op boss fight |
| **`FrostGolem` / `Skeleton_Golem`** | `950–1,450 HP` / `32–34 Dmg` | **`2,200 / 1,650 HP` / `36 Dmg` / `5.6 m/s` / `1.30s`** | ~38s | ~18–22s Apex Finale (requires `Q` + Mode B Blessing) |

---

## Part 3: Independent Plan Critic Audit & Improvements Applied

An independent forensic code + video audit of [`docs/superpowers/plans/2026-11-08-combat-aiming-ai-overhaul-plan.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-11-08-combat-aiming-ai-overhaul-plan.md) against `qa-video-1-mage-pubg-aim-shatterlance.webm`, `qa-video-2-knight-e-lock-and-tanjiro-q.webm`, and the live codebase identified **8 hidden engineering traps** in the initial draft and folded their exact fixes into Parts 1 & 2 above:

1. **Preserved `0ms` Tap Attack Responsiveness While Guaranteeing `100%` Clean `140ms` Hold-LMB Aim (`Fix 1.1`):**
   - *Trap in Draft:* Delaying Mage's tap attack until `mouseup` (`< 160ms`) would add `80–140ms` of input latency to basic attacks and break existing unit tests that assert `activeSwing` starts on `mousedown` / `triggerAction('attack')`.
   - *Fix Applied:* Keep `0ms` swing start on `mousedown`, raise `mage_attack1/2` `contactTime` floor to `>= 220ms` (`duration: 0.56, contactFrac: 0.48` in `combat-action-aim.js:76-109`, so even at `1.30x` mash speed `contactTime >= 220ms`), stop snapping `Mage.yaw` to off-angle soft-lock targets at `0ms` in `onSwingStarted` (`player-controller.js:1321-1329`), and fire `lmbHoldTimer` at `140ms` (`140ms < 220ms`) to cleanly abort the uncommitted `mage_attack1` before any bolt fires and snap into `shatterlance_aim_start` aligned with `camState.yaw`.
2. **Fixed `WASD` Clearing `lmbHoldTimer` & Locomotion Overwriting `Mage.yaw` During Aiming (`Fix 1.1`):**
   - *Trap Found in Code:* In `main.js:3305`, pressing any `WASD` key cleared `lmbHoldTimer`, preventing Mage from starting `Hold LMB` while moving. And in `player-controller.js:2721-2724`, moving with `WASD` while holding `E` (`frost_lance` / `cinder_fall`) overwrote `leader.yaw` toward `Math.atan2(moveX, moveZ)` 170 lines after `line 2551` set `Mage.yaw = aimYaw` (plus `line 2550` treated `camYaw === 0` as falsy!).
   - *Fix Applied:* Do not clear `lmbHoldTimer` on `WASD` when playing as `Mage`, fix `typeof camYaw === 'number'` at `player-controller.js:2550`, and lock `leader.yaw = camYaw` in `player-controller.js:2718` whenever `actionAim.aimState.active === true` so `WASD` strafes cleanly without rotating Mage away from the camera aim trajectory.
3. **Removed Capture-Phase `'tab'` Hijack in `player-controller.js:2417` (`Fix 1.1`):**
   - *Trap Found in Code:* `player-controller.js:2417` intercepted `'tab'` in capture phase with `e.stopImmediatePropagation()`, bypassing `main.js:3245`'s `if (tabToggleReady)` Stage 2 progression check and leaving `sculptedHud` out of sync.
   - *Fix Applied:* Delete the entire capture-phase `keydown`/`keyup` block in `player-controller.js:2412-2440`.
4. **Expanded `uCharShadows` from `vec4[8]` to `vec4[10]` for `MAX_CONCURRENT_ENEMIES = 8` (`Fix 2.1`):**
   - *Trap Found in Code:* `terrain-water.js:760` and `meadow.js:408` declare `uniform vec4 uCharShadows[8];` (`2` heroes + `6` enemies). Raising `MAX_CONCURRENT_ENEMIES` to `8` without resizing `uCharShadows` either leaves enemies `7..8` with no ground shadows or throws a `TypeError` on `tArr[8].set(...)`.
   - *Fix Applied:* Expand `uCharShadows` to `vec4[10]` across `terrain-water.js`, `meadow.js`, and `main.js:2695` (`filled < 8`).
5. **Added Pool Slot Fallback in `enemy-manager.js` (`Fix 2.1`):**
   - *Trap Found in Code:* Standard archetypes in `MULTI_ARCHETYPE_POOL_CONFIG` only have `2` instances each; a `6–8` enemy wave requesting `3` of the same archetype silently drops spawns.
   - *Fix Applied:* Add non-boss pack slot fallback in `acquireSlot(charId)` so waves up to `8` enemies always spawn every unit immediately.
6. **Kept Xiaomi Pad 7 Tablet Strictly `<= 48` Draw Calls (`46` Draws at `8` Enemies) (`Fix 2.1`):**
   - *Trap in Draft:* The draft noted `49` draw calls on Tablet for `8` enemies, which exceeds the `<= 48` Xiaomi Pad 7 hardware gate by `1` draw call.
   - *Fix Applied:* In `main.js:3118` (`setProfile('tablet')`), hide the BackSide outline `SkinnedMesh` on `isBossSlot` enemies and Knight/Mage (`-3` draw calls), bringing Tablet to **`<= 46` draw calls** even with all `8` enemies visible on screen.
7. **Resolved Stage 1 Detonation Deadlock & Upgraded Solo AI Wingman Element Synergy (`Fix 3.1`):**
   - *Trap in Draft & Code:* At Stage 0 & Stage 1, only `Ice` (`rime`) is unlocked (`Fire` unlocks at Stone 2). Requiring `Fire` to detonate `Ice` would make detonations and `BlackKnight` shield-breaks impossible at Stage 1. Furthermore, in `campaign-loop.js:3187`, AI Mage stopped casting spells whenever Human Knight activated `E` (`breathingStyle !== 'none'`), and `line 1264` overwrote AI Knight's sword with the *same* element as Mage instead of the opposite element.
   - *Fix Applied:* Introduced Two-Tier Detonations (`Tier 1: Rime Shatter` `40 AoE Dmg` + shield-break when a `rime`-marked enemy is hit by a Heavy Finisher `Shatterlance` / `Combo4` / `Intercept` on a `3.5s` per-target cooldown; `Tier 2: Cross-Element Shatterblow / Solar Flare` `60 AoE Dmg` on `Ice + Fire` or `Fire + Ice`), and updated Solo AI Wingman (`campaign-loop.js:1264, 3146, 3187`) to actively cast and pick the **opposite element** once Stage 2 is unlocked.
8. **Fixed the `124m` Empty Walk From `(0, 124)` Flower Field Start & `[-108, 108]` Wave Spawn Clamp (`Fix 2.1`):**
   - *Trap Found in Code:* `onStartGame` spawns heroes at `(0, 124)`, `124m` south of `site1_well` `(0, 0)`, while `survivalWaveTimer` started at `44.0s`, `triggerSurvivalWave` clamped `z` to `[-108, 108]` (`campaign-loop.js:2533`), and `haven_south_bridge` suppressed waves across a `16.0m` radius (`z = 2.5..34.5`).
   - *Fix Applied:* Spawn an immediate `4`-enemy **South Road Vanguard Pack** at `(0, 98)`–`(0, 104)` on expedition start, set initial `survivalWaveTimer = 4.5s` (recurring `22–28s`), widen survival wave spawn bounds to `[-148, 148]`, increase Stronghold `triggerRadius` to `22m–24m`, and tighten Safe Haven wave suppression to `8.5m`.

