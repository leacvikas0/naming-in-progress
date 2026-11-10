# Gemini Carbon Master Handoff Plan — Close-Quarters Enemy Combat, Honest Hitboxes & Visceral Damage Feedback

**Date:** 2026-11-10  
**Target Agent:** Gemini Carbon (Next Session)  
**Baseline Commit:** `8b402f8` (`master`, `hoplite-integration`, `hoplite-dest`)  
**Companion Vision Doc:** [`docs/superpowers/plans/2026-11-10-open-world-exploration-and-smart-enemies-vision.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-11-10-open-world-exploration-and-smart-enemies-vision.md)

---

## 1. Context & What Was Completed on 2026-11-10

1. **Solo Wingman Mage Follow & Yaw Stability (`78bde46`):**
   - Locked `partner.wingAnchorYaw` during active melee combos, added follow start/stop hysteresis deadbands in [`world/src/player-controller.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/player-controller.js), and gated Wingman AI engagement to `<= 15.5m` in [`world/src/combat/campaign-loop.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/campaign-loop.js).
2. **16 Blind-Critic Video Audit Fixes (`11b1590`):**
   - Added `aggr-1` through `aggr-5` automated video audit scenarios in [`world/tools/gameplay-video-harness.mjs`](file:///C:/Users/silen/projects/kilo-3d-kit/world/tools/gameplay-video-harness.mjs).
   - Fixed Stage-0 Wingman spell gating, Whispering Grove `(44, 16)` near-camera tree canopy dither cutout ([`world/assets/terrain/trees.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/trees.js)), `Frost Lance` height/hold tapering, Stone 1/2/3 Awakening `3.5s` overhead Eclipse (`prayerMode: 'awakening'`), circular Blood-Moon Eclipse framing inside the `50°` camera frustum ([`world/src/sky-tod.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/sky-tod.js)), Proximity Revive under Shield Block `[F]`, and 240 crimson rose petals blooming directly on the victim during Divine Smite (`rose_gommage`).
3. **Logical Anti-Cheat & State Preconditions (`8b402f8`):**
   - Blocked `[G]` Stone reading and `[R]` Stone Awakening whenever living enemies contest the stone (`<= 20m` from stone or `<= 16m` from either hero) across [`world/src/combat/campaign-loop.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/campaign-loop.js), [`world/src/main.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/main.js), and [`worker/commune-judge.js`](file:///C:/Users/silen/projects/kilo-3d-kit/worker/commune-judge.js).
   - Prevented swapping into a downed hero (`0 HP`) and prioritized Solo Wingman AI sprinting to `1.15m` to revive a downed human leader.

---

## 2. Vikas's Live Playtest Findings (Immediate Priority for Gemini Carbon)

When Vikas played the live build at `http://127.0.0.1:4173/world/index.html`, he praised the Knight's controls and movement feel, and identified **4 critical enemy & combat-feel flaws**:

> 1. *"The enemies kind of feel like toys... the controls and movement of the knight and all that stuff is very very interesting, but you can't tell when you are being damaged, you know that's a problem so you need to show that."*
> 2. *"And I just can't tell like the enemies they feel like they're not even hitting me. There's this weird thing like they're so far away and it just feels like all the attacks are not actually hitting me at all."*
> 3. *"We definitely need to work on the enemies and they are very slow at animating and at attacking and all."*
> 4. *"Investigate why you could not run persistent services — that should be in your harness/methodology."* (Solved via WMI `Win32_Process.Create` and codified in [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md) Rule 11.)

---

## 3. Exact Code-Level Root Causes (Already Diagnosed)

### Root Cause A — Why Enemies Stop Far Away & Swing at Empty Air ("Bluetooth Hitboxes")
- A KayKit character's physical 3D arm + sword reach is only **`1.15m to 1.45m`** center-to-center.
- However, in [`world/src/combat/combat-balance.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/combat-balance.js) (lines 985–1002):
  - `warrior_chop` has `range: 2.4` and `warrior_slice` has `range: 2.5` (`2.5 * 1.05 * 0.92 = 2.42m` trigger distance).
  - `captain_chop` has `range: 3.0` (`3.37m` trigger distance).
  - `boss_2h` has `range: 3.9` (`5.31m` trigger distance).
- And in [`world/src/combat/enemy-manager.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/enemy-manager.js):
  - `preferredRange(e)` (line 1728) stops enemies at `atk.range * scale * 0.8` (`2.02m–4.62m` away!).
  - `chooseAttack(e, dist)` (line 1711) starts their swing at `reach * sc * 0.92` (`2.42m–5.31m` away!).
  - `tickAttack` (line 1656) has **zero forward step-in lunge** on normal melee attacks (`a.atk.lunge` is only set on `rogue_jump_chop` and `boss_leap_slam`).
  - `resolveContact` (line 1625) checks `isInAttackArc(e, e.yaw, h, atk.range * sc + 0.35, atk.arcDeg)` (`2.98m` for a Warrior, `4.01m` for a Captain!).
- **Visual Result:** Enemies stop **`2.4m to 5.0m` away**, swing their weapon at empty air **`1.2m to 2.5m` short of your body**, and their oversized invisible hitbox damages you across the gap without their blade ever touching you.

### Root Cause B — Why Enemies Move & Attack in Slow Motion
- **Slow-Motion Approach ([`world/src/combat/enemy-manager.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/enemy-manager.js) lines 1731–1748 & 1764–1807):**
  - `if (e.shieldWall && e.shieldDownTimer <= 0 && dist < 7) { speed = 1.0 * mv; clip = 'Melee_Blocking'; }` — Shield Warriors within `7.0m` drop from running to a **`1.0 m/s` crawl** while playing a static block pose.
  - `const run = dist > 4.5; speed = (run ? e.speed : 1.6) * mv;` — All other enemies within `4.5m` stop running (`5.8–8.0 m/s`) and drop to a **`1.6 m/s` walk** (`0.55×` animation playback rate).
  - In `standoff()`, non-token enemies outside melee range crawl at `0.9 m/s` (`Melee_Blocking`) or sideways-strafe with radial speed clamped to `1.5 m/s`.
- **Slow-Motion Attack Windups & Long Cooldowns ([`world/src/combat/combat-balance.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/combat-balance.js) lines 985–1002 & [`world/src/combat/enemy-manager.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/enemy-manager.js) lines 1538, 1645–1650):**
  - `windupSlow` is `0.32` (`captain_chop`) to `0.45–0.50` (`warrior_chop`, `warrior_slice`), and `startAttack` runs at `speed = 1.0`, so the first 80% of every enemy swing plays in `0.32×–0.50×` slow-motion, followed by `0.4s–1.1s` recovery plus `1.0s–1.8s` `cooldownTimer`.

### Root Cause C — Why You Can't Tell When You Are Being Damaged
- In [`world/src/combat/campaign-loop.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/campaign-loop.js) line 1185 (`handlePlayerHit`), the flinch animation (`hit_A`) and damage callback (`friendlyFireCallback`) were **only wired inside `else if (hitOptions?.friendlyFire && rem > 0)`**!
- When an enemy hits you, `hitOptions.friendlyFire` is undefined—resulting in **zero floating `-DMG` number**, **zero 3D character hit-flash**, **zero flinch animation**, **zero knockback jolt**, and **zero screen-edge crimson damage vignette or HP bar shake**.

### Root Cause D — Why Enemies Feel Like Plastic Toys When You Hit Them
- In [`world/src/main.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/main.js) line 1642 (`emitFloatingDamageForEnemyHit`), `if (!isPeakMoment) return;` suppresses floating damage numbers on all `combo1`, `combo2`, `combo3`, and basic Mage staff bolts.
- In [`world/src/combat/enemy-manager.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/enemy-manager.js) (`applyHitToEnemy`), struck enemies have no 3D emissive hit-flash and no directional knockback velocity away from the attacker's swing.

---

## 4. Step-by-Step Implementation Plan for Gemini Carbon

### Task 1: Close-In Melee Ranges, Forward Step-In Lunges & Snappy Enemy Animations (`enemy-manager.js`)
> **Test Compatibility Note:** `world/tools/test-enemy-encounters.mjs` Check #1 tests the pure function `attackTimeline(ENEMY_ATTACKS.warrior_chop, 1.067)` with default `speedMult = 1.0`. Keep `ENEMY_ATTACKS` pure defaults intact in `combat-balance.js`, and pass the faster `speed` multiplier (`1.55×`–`1.85×`) inside `enemy-manager.js` (`startAttack` / `tryStartAttack` / `tickAttack`). Also ensure `contactTimes[0] >= 0.35s` so Check #17 (`parryScenario(0.1)`) and Check #18 (`parryScenario(0.3)`) pass 100%.

1. **Tighten `preferredRange(e)` and `e.standoffDist` in [`world/src/combat/enemy-manager.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/enemy-manager.js):**
   - For melee enemies, set `preferredRange(e)` to `e.isBoss ? 1.72 : 1.22 * (e.group.scale.x || 1)` (`~1.12m–1.48m` instead of `2.02m–4.62m`).
   - Tighten melee `standoffDist` to `1.62 + (slot.slotIndex % 3) * 0.20`.
2. **Remove Slow-Walk & Shield-Crawl Brakes in `approach()` and `standoff()`:**
   - In `approach()`, let enemies run with `Running_A` at full speed (`(e.shieldWall && e.shieldDownTimer <= 0 ? e.speed * 0.85 : e.speed) * mv`) all the way in to `want` (`~1.22m * scale`). Only raise `Melee_Blocking` once inside `2.15m` waiting for cooldown.
   - In `standoff()`, when a non-ranged enemy is outside `e.standoffDist + 0.85`, make it run directly toward the hero (`Running_A` at `e.speed * 0.88 * mv`) instead of crawling at `0.9 m/s`.
3. **Tighten `chooseAttack(e, dist)` to True Close-In Strike Distance:**
   - Standard 1H / dualwield / unarmed melee (`minion_punch`, `minion_kick`, `warrior_chop`, `warrior_slice`, `rogue_stab`, `shield_bash`): trigger only when `dist <= 1.60 * sc`.
   - 2H elite melee (`captain_chop`): trigger when `dist <= 1.85 * sc`.
   - Giant boss melee (`boss_2h`, `boss_combo`): trigger when `dist <= 2.25`.
4. **Add Physical Forward Step-In Lunge on Every Melee Attack in `tickAttack`:**
   - During `a.contactIdx === 0 && target && a.clipT >= a.tl.slowEndClip * 0.40` on all non-ranged melee attacks (`!a.atk.ranged && !a.atk.areaAtTarget`), step the enemy forward toward `target` at `6.2 m/s` (or `a.atk.lungeSpeed || 8.5` for leap attacks) down to `minCloseDist = e.isBoss ? 1.65 : 1.18 * sc` so the 3D blade visually slices through the hero's body.
5. **Tighten `resolveContact` to Honest 3D Blade Reach (Zero "Bluetooth Hits"):**
   - Replace `atk.range * sc + 0.35` (`~3.0m–5.7m`) with honest weapon reach: `1.68 * sc` for standard 1H melee, `1.95 * sc` for `captain_chop`, `2.45m` for `boss_2h`/`boss_combo`, and `atk.radius + 0.12` for area slams. Stepping or dashing outside physical blade reach causes a clean whiff.
6. **Speed Up Enemy Attack Animations & Cadence:**
   - In `startAttack` and `tryStartAttack`, use `speed = (atkId === 'captain_chop' ? 1.85 : 1.55) * (e.isBoss && e.phase === 'p3' ? BOSS_P3_SPEED : 1.0)`.
   - In `tickAttack`, boost visual action playback during the downswing (`r.clipT >= a.tl.slowEndClip ? r.timeScale * 1.25 : r.timeScale`), shorten post-swing `recoverT` to `(a.atk.recovery ?? 0.4) * 0.52`, and shorten post-attack `cooldownTimer` to `e.attackCooldown * (0.45 + rand() * 0.22) * ...`.

### Task 2: Unmistakable Player Damage Feedback (`toon-skin.js`, `campaign-loop.js`, `player-controller.js`, `damage-numbers.js`, `sculpted-hud.js`, `main.js`)
1. **3D Emissive Hit-Flash Helper (`world/assets/characters/toon-skin.js`):**
   - Export `setCharacterHitFlash(rootOrChar, weight = 0.0, flashColorHex = 0xff3b5c)` setting `mat.emissive` and `mat.emissiveIntensity = weight * 0.92` on `MeshToonMaterial` instances.
2. **Authoritative Player Hit Reactions (`world/src/combat/campaign-loop.js` & `world/src/player-controller.js`):**
   - In `handlePlayerHit` (`campaign-loop.js`), add `setOnPlayerDamaged(fn)` and fire it on **every** enemy/hazard hit (`rem > 0 || absorbed > 0`), passing `{ heroId, damageDealt: rem, absorbed, blockedByShield, enemy, source }`.
   - Set `targetHeroState.hitFlashTimer = 0.18` (`hitFlashBlocked = blockedByShield`), apply a directional knockback step away from `enemy` (`0.26m` unblocked, `0.09m` shield-blocked, resolved via `resolveCollisions`), and trigger a crisp `hit_A` flinch (`timeScale: 1.35`, `actionTimer = 0.24`) when the hero is idle or moving.
3. **Floating Player `-DMG` / `BLOCKED -DMG` Pill & Screen-Edge Damage Vignette (`damage-numbers.js`, `sculpted-hud.js`, `main.js`):**
   - Add `.am-dmg-pop.el-player-hit` (crimson pill `-24`) and `.am-dmg-pop.el-player-blocked` (icy-gold pill `BLOCKED -4`) in [`world/src/ui/damage-numbers.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/ui/damage-numbers.js).
   - Add `#sculpted-damage-vignette` (translucent crimson radial edge pulse) + `.sh-life-row.is-damaged-shake` HP bar shake in [`world/src/ui/sculpted-hud.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/ui/sculpted-hud.js) via `sculptedHud.triggerDamagePulse({ role, damage, blocked })`.
   - Wire `coopSystem.campaignLoop.setOnPlayerDamaged(...)` in [`world/src/main.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/main.js).

### Task 3: Visceral Enemy Hit Reactions (`main.js` & `enemy-manager.js`)
1. **Floating Damage Numbers on Every Hit (`world/src/main.js`):**
   - In `emitFloatingDamageForEnemyHit` (line 1642), remove `if (!isPeakMoment) return;` so routine `combo1–3` slashes and Mage bolts spawn crisp floating damage numbers on every hit (with unique mergeKeys for routine hits vs consolidated crit callouts for peak finishers).
2. **Enemy Hit-Flash, Knockback Impulse & Snappy Flinch (`world/src/combat/enemy-manager.js`):**
   - In `applyHitToEnemy`, set `enemy.hitFlashTimer = 0.14` (ticked in `update()` via `setCharacterHitFlash(e.char, e.hitFlashTimer / 0.14, 0xfff1f2)`), apply directional knockback velocity (`enemy.vx`, `enemy.vz` at `3.2 m/s` on light hits and `6.4 m/s` on heavy/skill hits), and play `Hit_A`/`Hit_B` flinch at `timeScale: 1.45`.

### Task 4: Mandatory 3-Beat Close-Quarters Video Verification & Test Suite Gate
1. Run all 5 automated test suites (`test-enemy-encounters.mjs`, `test-combat-sim.mjs`, `test-mage-aim.mjs`, `test-character-animations.mjs`, `test-coop-room.mjs`) — 100% must pass.
2. Record and inspect the **3-Beat Close-Quarters Visceral Combat Video Audit** (`METHODOLOGY.md` Rule 9) via `view_file` + `google:load_video` (`6–8 FPS`), verifying:
   - Beat A: Enemies sprint in fast, step-lunge into `~1.2m` chest-to-chest distance so their blades visibly intersect the hero, and whiff cleanly when the hero steps outside physical sword reach.
   - Beat B: Player damage is unmistakably visible in center-screen (floating crimson `-DMG`, hero crimson hit-flash, knockback + flinch, screen-edge crimson vignette, HP bar shake).
   - Beat C: Basic `combo1–3` slashes pop damage numbers, flash the enemy mesh, knock the skeleton back, and trigger snappy flinches.
