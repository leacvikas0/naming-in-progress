# Amarante — Final Playable Game Master Plan & Thread Handoff

**Date:** 2026-11-07  
**Branch:** `master` (`C:\Users\silen\projects\kilo-3d-kit`)  
**Goal:** Ship a complete, bug-free, mathematically balanced, playable 2-player co-op game for Vikas (Desktop `RX 6700`) and Ishika (Tablet `Xiaomi Pad 7`) by tomorrow.

---

## 0. Mandatory Guardrails for the Next Thread (READ BEFORE TOUCHING CODE)

1. **Read Mandatory Skills & Docs First:**
   - Read [`AGENTS.md`](file:///C:/Users/silen/projects/kilo-3d-kit/AGENTS.md), [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md), [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md), [`frontend-design/SKILL.md`](file:///C:/Users/silen/.gemini/antigravity-acp/t3-home/config/skills/frontend-design/SKILL.md), and [`docs/design-references/combat-review-2026-11-06/haru_machi_combat_review_brief.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/combat-review-2026-11-06/haru_machi_combat_review_brief.md).
2. **Zero Spoilers in Chat / Logs / Screenshots:**
   - **NEVER** inspect, print, or reveal the real deity name or real stone poems/answers from `worker/scripture-catalog.js`. Always use fake names (`Alex` & `Sam`, `[Fake Deity: Zorblax]`) and `[Fake Puzzle #1 / #2 / #3]` in all conversation with Vikas.
3. **Do Not Touch the Sacred Stones Yet:**
   - Vikas is preparing updated assets/materials for the 3 Sacred Inscription Sites. **Leave the stone meshes untouched until Vikas provides them.** When integrating them later:
     - Mount **strictly 3 sites** (1: Village Well `(0, 0)`, 2: Hidden Long Wall behind house near mill/lake `(-21.6, 20.4)`, 3: Circular Ground Inscription under the Demon Tree `(44, 16)`—delete the duplicate 4th stone at `(-42, 18)`).
     - Wire their shader uniforms (`uSunDir`, `uDaylight`, `uLightTint`, `uFogColor`) inside `applyTimeOfDay()` in [`world/src/main.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/main.js) so they shade properly at Day, Sunset, and Night.

---

## 1. Combat & Controls Overhaul (Fixing All 8 Confirmed Bugs)

### 1.1 Mage Aiming (`Hold E` & `Hold Attack`) — PUBG Grenade-Style Parabolic Arc + Target Ring
- **Root Cause Fixed:** In [`world/assets/vfx/aim-arrow.js:419`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/vfx/aim-arrow.js#L419), `this.direction` was initialized to `(1, 0, 0)` (East) and checked `if (direction)`, while [`world/src/player-controller.js:1461`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/player-controller.js#L1461) passed `{ yaw, dirX, dirZ }` without `.direction`—causing the aim indicator to point East forever.
- **New Design to Build:**
  - Replace the flat ground surfboard arrow with a **PUBG-style 3D Parabolic Trajectory Arc + 3D Cel-Shaded Ground Impact Ring**.
  - The arc originates from the Mage's raised staff hand and curves forward **in the exact direction the camera/character is facing (`camState.yaw`)**.
  - Tilting camera pitch up/down (or dragging up/down on Tablet) smoothly moves the landing ring from **point-blank (`0.8m` right on her face) up to `16.0m–18.0m`**.

### 1.2 Mage Charged Attack (`Hold LMB` / Hold Attack -> `Shatterlance`)
- **Root Cause Fixed:** Holding LMB waited `180ms` and entered `shatterlance_aim_start` without playing a charging animation or holding the spell visual in the air.
- **New Design to Build:**
  - **Hold Attack:** Immediately starts the Mage's charging cast animation AND spawns the **actual spinning crystal/arcane vortex in mid-air at her staff**, which **keeps spinning while held**.
  - **Aim While Holding:** Displays the **PUBG parabolic arc + ground target circle** in front of where she is facing (`0.8m .. 18.0m`).
  - **Release Attack:** Launches the spinning piercing ice lance along the ray AND erupts the ground crystals at the landing circle (deduplicated with `alreadyHitSet` so no enemy takes double damage).

### 1.3 Knight `E` Sword Summon Lock (`Tab` Queues Next Summon Only)
- **Root Cause Fixed:** In [`world/src/combat/campaign-loop.js:584`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/campaign-loop.js#L584), `toggleHeroElement('Knight')` called `setKnightBreathing(nextStyle)` while `powerSwordActive` was true, mutating an active Fire Sword into an Ice Sword mid-duration.
- **New Design to Build:**
  - `E` is a **summon**. Pressing `E` with Fire selected summons the **Fire Sword** for its full `13.0s` duration (`18.0s` cooldown = `5.0s` downtime).
  - Pressing `Tab` while the sword is active **only switches the queued element for the NEXT `E` summon**—the active blade stays its summoned element until it expires.

### 1.4 Custom Blazing Flame & Crystalline Frost SVGs on `[Tab]` Switcher
- **Root Cause Fixed:** [`world/src/ui/sculpted-hud.js:888`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/ui/sculpted-hud.js#L888) used ugly system emojis (`❄️` and `🔥`).
- **New Design to Build:**
  - Replace both emojis with custom cel-shaded vector SVGs (a multi-tongue blazing crimson-amber-gold flame SVG and a sharp crystalline frost crest SVG).

### 1.5 `Q` Ultimates + Genshin Kill-Energy System (Shared Co-Op Energy)
- **Root Cause Fixed:** Both `performKnightUltimate` and `performMageStormCataclysm` in [`world/src/combat/campaign-loop.js:1694`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/campaign-loop.js#L1694) & [`1767`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/campaign-loop.js#L1767) called the same placeholder `vfxKit.stormLance.cast(...)` on a simple timer cooldown.
- **New Design to Build:**
  1. **Genshin Kill-Energy Gauge (No Timer Cooldown):**
     - `Q` starts at `0%` Energy and charges up to `100%` by **killing enemies and triggering elemental combo detonations**, filling the bottom-right `Q` circle from bottom to top.
     - **Co-Op Energy Share:** Whenever the Knight kills an enemy, the Knight gains primary `Q` Energy AND the Mage automatically receives a shared cut (`~60%`), and vice versa.
     - **Asymmetric Energy Cost:** Knight `Q` costs **`100 Energy`**; Mage `Q` costs **`160 Energy`** (harder to fill so her AoE bombardment isn't spammed).
  2. **Knight `Q` — *Tanjiro Twin-Element Sword (Hinokami Sunfire + Glacial Tide Combined)*:**
     - Plays sword-raise ignition pose (`Spellcast_Raise` + sky strike flash).
     - For **`12.0s`**, his sword fuses **both Fire and Ice simultaneously**: a dual-colored artistic ukiyo-e slash ribbon (crimson-gold flames + cyan-white glacial waves & ice shards) dealing **`2.0x` Double Damage** and applying **both Ice Slow and Fire Burn** on every slash.
  3. **Mage `Q` — *Sky Meteor Shower Bombardment*:**
     - Over **`6.0s`**, rains **10–12 blazing meteors down from high in the sky** at angled trajectories across the target area in front of her, each erupting with molten craters and stagger (moderate per-meteor damage so it clears swarms and chunks bosses without trivializing the Knight).

### 1.6 Remove Forced Time-of-Day Switching on Wave Clear
- **Root Cause Fixed:** [`world/src/combat/campaign-loop.js:658`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/campaign-loop.js#L658) called `onSkyTodChanged(act.tod)`, forcing the sky to Evening/Night when killing arena enemies.
- **New Design to Build:** Remove automatic `onSkyTodChanged` calls on wave/act transitions so time of day remains under player control.

---

## 2. The God, Commune (`[R]`), Sky Descent & Proportional Verdicts

1. **Immediate `[R]` Discovery Near First Stone + `[G]` / `[Esc]` Camera Focus:**
   - Walking within `5.5m` of the first Sacred Stone immediately reveals the **`[R]` Commune icon** on the HUD alongside the world-space **`[G]`** button.
   - Pressing **`G`** hides the HUD and glides the camera to focus on the stone inscription; pressing **`Esc`** (or `G` / `WASD`) glides back out.
2. **3 Connected Solvable Puzzles + Cheesy Confessions:**
   - **Stone 1:** Riddle for the God's True Name $\rightarrow$ unlocks **Stage 1: Ice `[E]`**.
   - **Stone 2:** Solvable riddle building on Stone 1 $\rightarrow$ unlocks **Stage 2: Fire `[E]` + Left-Side `[Tab]` Switch**.
   - **Stone 3:** Solvable riddle combining Stones 1 & 2 $\rightarrow$ unlocks **Stage 3: Ultimate `[Q]` + Main Divine Blessing**.
   - Every prayer requires weaving the puzzle answer into an affectionate, cheesy love confession about your partner.
3. **Proportional Percentage HP Verdicts & Petal Smite ([`worker/commune-judge.js`](file:///C:/Users/silen/projects/kilo-3d-kit/worker/commune-judge.js) & [`world/src/combat/campaign-loop.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/campaign-loop.js)):**
   - **Wrong name/answer, but sweet/respectful words:** AI-decided **`-10%` to `-20%` Max HP** penalty on speaker + deadpan hint (silent).
   - **Very wrong name OR rude/lazy/mocking prayer:** Drops speaker to **`5% HP`** OR triggers **Full Divine Smite**: world snaps to B&W monochrome, crimson rose petals sprout on your **partner's** body and evaporate them into 240 blood-crimson petals while dropping speaker to **`10% HP`** (or both evaporate if partner is already downed). **God speaks aloud.**
   - **Right name/answer, but said badly/monotone:** **Still unlocks the power** (`Ice`, `Fire`, or `Q`), **but docks `-15%` to `-30%` Max HP** and **the God speaks aloud** to roast the lackluster delivery.
4. **World-Fixed Slow Eclipse Descent, Hidden Controls & Stage-3 Main Divine Blessing:**
   - **Fix Camera-Glued Eclipse Bug ([`world/src/sky-tod.js:1479`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/sky-tod.js#L1479)):** Never use `camera.getWorldDirection()` for `uEclipseDir`. Anchor the Eclipse in world space, give it textured coronal filaments & cel-shaded nebula marbling, and **make it descend slowly from overhead (`elevY: 0.72 -> 0.32`) and ramp `weight: 0.0 -> 1.0` gradually as you speak** instead of snapping red on Frame 1.
   - **Hide All HUD Controls During Commune:** Fade out all combat/skill rings while communing so the screen is clean and never confuses the player.
   - **No Free Invincibility If Conditions Aren't Met:** Remove `communeChannelActive` invincibility when praying outside the Stage-3 Main Blessing conditions—enemies will keep attacking and kill you if you pray recklessly in combat.
   - **Main Divine Blessing (Only at `Stage 3` + Partner/Both Low HP `<= 35%` + Close Together `<= 6.0m`):**
     - When all conditions are met, the **`[R]` Commune icon glows brightly**.
     - Pressing `[R]` while glowing **immediately blasts nearby enemies far away (`12m` radial pushback)** and **slows enemy time to `0.10x` visibly super-slow-motion** while you speak, followed by the 4-beat Briar Dome & Underground Flower Slump resurrection (`100% HP` + `30s` of `2.0x` damage & invincibility within `5.0m` tether).

---

## 3. Enemy Roster, Demon Tree & Final Boss Dragon

1. **Approved Enemy Roster ([`haru_machi_combat_review_brief.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/combat-review-2026-11-06/haru_machi_combat_review_brief.md)):**
   - **KayKit Skeletons:** `Skeleton_Minion`, `Skeleton_Warrior`, `Skeleton_Rogue`, `Skeleton_Mage` (real dodgeable 3D bolts, tutorial damage tuned to `12–18` so 90-HP Mage isn't 3-shot by basic minions).
   - **KayKit Mystery Roster (`/library/enemy-candidates/`):** `OrcRaider.glb`, `PlantWarrior.glb` (spear close / bow ranged), `Werewolf_Wolf.glb` (night pounce), `OrcBrute.glb` (`Rig_Large` heavy slam), `BlackKnight.glb` (directional frontal shield + punishable counter), `Monstrosity.glb`.
2. **Night Wisteria Grove Boss — SKULLVERTEX `Demon Tree` (`#86461`) + Flying Bats (`Quaternius_Bat.glb`):**
   - Link: `https://assetstore.unity.com/packages/3d/characters/creatures/demon-tree-86461` (to be downloaded & converted via Blender 5.2 to `.glb` with `upgradeCharacterToToon()`).
   - Appears at night in the Wisteria Grove holding the circular ground inscription beneath its roots.
   - Summons at most **2 living flying bats** at once on a strict **10-second cooldown starting at summon time** (never resetting on bat death). Bats target the Mage and dive low enough for Knight melee interception + height-aware Mage `Shatterlance`.
   - On death (`0 HP`), cancels pending summons, despawns surviving bats, and plays its root-retraction collapse to uncover the circular ground inscription.
3. **Northern Finale Boss — SKULLVERTEX `Dragon PBR` (`#94333`, 13 Animations):**
   - Link: `https://assetstore.unity.com/packages/3d/characters/creatures/dragon-pbr-94333` (to be downloaded & converted via Blender 5.2 to `.glb` with `upgradeCharacterToToon()`).
   - 3-Phase Boss Fight (`100–70%` ground bite & fire breath $\rightarrow$ `70–35%` takeoff, hover fire & timed landing punish windows $\rightarrow$ `35–0%` aggressive finale), mathematically tuned so the duo needs their full Stage 3 kit (`Ice + Fire + Twin-Blade/Meteor Q + Main Divine Blessing`) to triumph.
