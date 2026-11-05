# Independent 3D Scene & Live Gameplay Video QA Report — Divine Verdict (`Track E`)

**Verdict:** **PASS (Signed Off After Iterative Visual & Motion Fixes)**  
**Date:** `2026-11-04`  
**Evaluator:** Track E — Independent 3D Scene (`judging-3d-scenes`) & Live Gameplay Video (`judging-gameplay`) QA Judge  
**Harness Script:** `C:/Users/silen/projects/kilo-3d-kit/qa-review/divine-verdict/run-divine-verdict-qa.mjs`  
**Telemetry Log:** `C:/Users/silen/projects/kilo-3d-kit/qa-review/divine-verdict/qa-telemetry.json`

---

## 1. Verified Deliverable Artifacts (`qa-review/divine-verdict/`)

| Artifact | Resolution / Format | Scene / Shot ID | Draw Calls | Triangles | Status |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `shot-37-prayer-throw.png` | `1600x900` PNG | `09-divine-prayer-eclipse-throw` (`Frame 37`) | `32` | `3,864,966` | **PASS** |
| `shot-57-briar-jail.png` | `1600x900` PNG | `10-divine-briar-jail-lattice` (`Frame 57`) | `42` | `3,882,284` | **PASS** |
| `shot-beat3-flower-slump.png` | `1600x900` PNG | `11-divine-underground-flower-slump` (`Beat 3`) | `37` | `3,840,884` | **PASS** |
| `shot-41-smite-bw-dissolve.png` | `1600x900` PNG | `12-divine-smite-bw-petal-dissolve` (`Frame 41`) | `41` | `3,911,093` | **PASS** |
| `clip-blessing-resurrection.webm` | `1280x720` @ 30 FPS (`2,481 KB`) | Live 4-Beat Blessing & Underground Resurrection (`~4.5s`) | `<= 42` | `~3.88M` | **PASS** |
| `clip-smite-dissolve.webm` | `1280x720` @ 30 FPS (`2,393 KB`) | Live Smite 0.0x Wind Freeze, B&W Drain & 240-Petal Dissolve (`~3.8s`) | `<= 41` | `~3.91M` | **PASS** |

---

## 2. Still-Frame 3D Scene Inspection (`judging-3d-scenes`)

### 2.1 `shot-37-prayer-throw.png` (`09-divine-prayer-eclipse-throw` vs. `Frame 37`)
- **Visual Anchor Comparison (`37-strict3d-beat1-prayer-throw-sky-compression.png`):**
  - **Sky & Eclipse Compression:** `uEclipseWeight = 1.0`, `uEclipseCompression = 1.0`, `windTimeScale = 0.35`. The colossal obsidian-black Eclipse void (`radius = 0.325 rad`) with searing ruby blood-crimson corona (`#e60c2c`) and multi-layered crimson-crowned storm-cloud amphitheater dominates the upper sky while the 3D cumulus cloud ring retains full volumetric height.
  - **4.0m Prayer Circle & Creeping Briar Roots:** Knight (`x=51.2, z=-3.4`) and Mage (`x=52.6, z=-1.0`, distance `2.78m <= 4.0m`) channel their prayer in a 3/4 rear-side profile as 24 braided *Witcher 3* wild-rose briar tendrils and ruby rosebuds creep around their boots (`growthProgress = 0.28`).
  - **6.5m Airborne Enemy Throw (`0.15x` Slow-Motion):** Both skeleton warriors are launched `3.35m..3.55m` into the air (`y = 3.95m, 4.15m`), pitched backward off their feet (`rotX = -0.78, rotZ = 0.46` and `rotX = -0.74, rotZ = -0.48`), and held at `mixerTimeScale = 0.15`.

### 2.2 `shot-57-briar-jail.png` (`10-divine-briar-jail-lattice` vs. `Frame 57`)
- **Visual Anchor Comparison (`57-witcher3-vine2-iris-manor-interlaced-rose-lattice.png`):**
  - **3-Tier *Witcher 3* Iris Manor Rose-Briar Cage:** All `24` Blender-baked 3-strand helically braided woody briar arches (`witcherBriarArch: 680 tris`) enclose both lovers on the grey Town Plaza cobblestones (`z = 9.2`):
    - **Tier 0 (`0..7`):** 8 wide basal cobblestone wreath coils sweeping flush along the plaza stones with zero ground-clipped bottom roses.
    - **Tier 1 (`8..15`):** 8 mid-height interlaced briar ribs weaving around the flanks and waist while preserving a clean front window for both characters' faces and eyes.
    - **Tier 2 (`16..23`):** 8 tall overarching gothic canopy arches (`scaleY = 1.34..1.52`, `inwardPitch = -0.16..-0.22`) curving over the Knight's helm and Mage's witch hat up to the lower rim of the Eclipse.
  - **Color & Material Integrity:** Removing the double-gamma `pow(vVertexColor, 1.0/2.2)` in `artorious-vfx.js` restored rich, velvety ruby blood-crimson goblet roses (`#2e0107 -> #de0c2c`), deep forest-green/bronze-olive serrated leaves, and olive-walnut woody stems.

### 2.3 `shot-beat3-flower-slump.png` (`11-divine-underground-flower-slump` — Beat 3 `0.70s..2.20s`)
- **Underground Hide & Shadow Suppression:**
  - `knightVisible = false`, `mageVisible = false`, `swordVfxVisible = false`.
  - `knightShadowActive = 0`, `mageShadowActive = 0` (`uCharShadows[0].w = 0, uCharShadows[1].w = 0`), confirming zero ghost character shadows on the cobblestones while underground.
  - `monolithsCount = 0` (briar cage 100% retracted underground).
  - `slumpCount = 1`, `petalsCount = 12`: Only the quiet ruby blood-crimson flower slump (`crimsonFlowerSlump: 521 tris`) and 12 ground-skimming crimson petals rest on the cobblestones while the top-left Party HP bars smoothly fill toward 100%.

### 2.4 `shot-41-smite-bw-dissolve.png` (`12-divine-smite-bw-petal-dissolve` vs. `Frame 41`)
- **Visual Anchor Comparison (`41-strict3d-beat5-smite-bw-loose-petal-dissolve.png`):**
  - **Selective-Crimson Stark B&W Grade (`uSmiteMonochrome = 1.0`, `windTimeScale = 0.0`):**
    - 100% of the environment—including sunlit AND shaded Tudor cottage roofs, well roof, shrine stair carpet, trees, grass, cobblestones, clouds, and the surviving kneeling Mage (`monochromeOverride = 1.0`)—is desaturated to stark B&W grayscale with zero terracotta roof bleed.
    - 100% of the Divine Verdict crimson elements—the Eclipse corona, crimson storm-cloud amphitheater, `crimsonFlowerSlump`, the dissolving Knight's lower-boot fragments, and all `240` upward-spiraling 3D rose petals (`prismsAndDebrisMesh.count = 240`, `kind = 2.0`, zero golden embers, zero black petals)—retain vivid ruby blood-crimson saturation.

---

## 3. Live Gameplay Video Inspection (`judging-gameplay`)

### 3.1 `clip-blessing-resurrection.webm` (`1280x720` @ 30 FPS, `~4.5s`)
- **Observed Timeline & Causal Verification:**
  - **`0.00s .. 1.10s` (`PRAYER_CHANNEL`):** Knight (`68/220 HP`) channels prayer beside downed Mage (`0/90 HP, DOWNED`) on the Town Plaza cobblestones (`Dist = 1.36m <= 4.0m`). Wind slows to `0.35x` as 24 briar arches creep around their boots (`monoliths = 24`) under the Black-Crimson Eclipse.
  - **`1.10s .. 1.55s` (`BLESSING Beat 1`, `0.00s..0.45s`):** Quartic ease-in shoots all 24 braided *Witcher 3* wild-rose briar arches upward to completely jail both characters (`Vis = 1/1`, `monoliths = 24`).
  - **`1.55s .. 1.80s` (`BLESSING Beat 2`, `0.45s..0.70s`):** Both characters and the 24 briar arches are yanked `-2.5m` straight into the ground (`submergeDepth = 2.5m` with razor-sharp ground-plane `discard`) as `crimsonFlowerSlump` (`slump = 1`) blooms on the cobblestones.
  - **`1.80s .. 3.30s` (`BLESSING Beat 3`, `0.70s..2.20s` — `1.50s` Underground):** Both characters are hidden (`Vis = 0/0`), all vines are gone (`monoliths = 0`), and only the quiet crimson flower slump rests on the cobblestones while the top-left HP bars smoothly interpolate from `68/220 -> 220/220` (Knight) and `0/90 (DOWNED) -> 90/90` (Mage).
  - **`3.30s .. 4.50s` (`BLESSING Beat 4` -> `BLESSED_30S`):** Both Knight and revived Mage pop cleanly out of the ground side-by-side (`Dist = 1.35m`, `Vis = 1/1`, `Knight = 220/220`, `Mage = 90/90`) using ground-anchored `Spawn_Ground`/`Cheer` animations as the flower slump scatters into 64 crimson petals and the 30s Proximity Blessing (`<= 5.0m` tether) activates.

### 3.2 `clip-smite-dissolve.webm` (`1280x720` @ 30 FPS, `~3.8s`)
- **Observed Timeline & Causal Verification:**
  - **`0.00s .. 0.80s` (`PRAYER_CHANNEL`):** Mage (`72/90 HP`) channels prayer beside Knight (`180/220 HP`) under the Eclipse sky (`Wind = 0.35x`, `B&W = 0.00`).
  - **`0.80s .. 3.60s` (`SMITE`, `0.00s..2.80s`):**
    - On Smite impact, wind freezes dead (`Wind = 0.00x`), the entire world drains to stark B&W (`B&W = 1.00`), Speaker (Mage) drops to `10% Max HP` (`9/90 HP`), and Partner (Knight) drops to `0/220 (DEAD)`.
    - Knight dissolves from crown to boots (`Dissolve: 0.00 -> 0.28 -> 0.81 -> 1.00`) into an S-curved rising vortex of `240` blood-crimson rose petals (`petals = 240`) with `crimsonFlowerSlump` at his boots.
    - Once `Dissolve = 1.00`, Knight remains dissolved (`Vis = 0/1`) rather than popping back into a standing idle mesh.

---

## 4. Defects Found & Fixed During Track E QA

1. **Double-Gamma Pastel Pink Roses (`world/assets/vfx/artorious-vfx.js`, `world/tools/build-blender-flowers.py`):**
   - *Cause:* `createMonolithMaterial` and `createGroundSigilMaterial` applied `pow(vVertexColor, 1.0/2.2)` even though `vVertexColor` is already Linear RGB and `post.js` applies `linearToSRGB()`.
   - *Fix:* Removed the duplicate gamma curve in `artorious-vfx.js` and re-baked `world/assets/flowers/blender-flower-data.js` via Headless Blender 5.2 with pure ruby blood-crimson vertex colors (`#2e0107 -> #de0c2c`).
2. **Ground-Clipped Bottom Roses & Low Briar Canopy (`world/assets/vfx/artorious-vfx.js`):**
   - *Cause:* Positive `inwardPitch` (`rotX > 0`) in Three.js right-handed coordinates rotated the `+Z` arch spine downward into `-Y`, pushing lower roses below `vGroundY` (`discard`) and lowering the canopy arches.
   - *Fix:* Changed `inwardPitch` to negative Euler X angles (`-0.02` for Tier 0 basal wreath, `-0.04..-0.10` for Tier 1 ribs, `-0.16..-0.22` with `scaleY = 1.34..1.52` for Tier 2 overarching canopy arches) and reached full Beat 1 growth by `t = 0.40s`.
3. **Shaded Village Roof Bleed & Black Ambient Petals in Smite B&W Grade (`world/src/post.js`, `world/src/sky-tod.js`):**
   - *Cause:* Post-grade `srgbCrimsonMask` ran after blue shadow lift (`uCoolShadow` / `uLift`), allowing shaded red roof tiles to pass `B > G`, while semi-transparent `todLivingAirPetals3D` blended with grey cobblestones and turned charcoal-black in B&W.
   - *Fix:* Evaluated `uSmiteMonochrome` crimson purity strictly on `linPreGrade` (`R > max(G * 28.0, B * 4.2)` and `B > G * 1.85`) and made `todLivingAirPetals3D` render crisp opaque ruby petals during Eclipse.
4. **Top-Down Dissolve Direction (`world/assets/characters/toon-skin.js`):**
   - *Cause:* `erodeVal` used `hNorm` directly, eroding feet before head.
   - *Fix:* Inverted to `topDown = 1.0 - hNorm` so characters dissolve from crown to boots into rising petals (`Frame 41`).
5. **Beat 4 `Spawn_Air` Vertical Jump & Post-Smite Dead Hero Idle Revert (`world/assets/characters/index.js`, `world/src/player-controller.js`):**
   - *Cause:* `SEMANTIC_ANIMATIONS.revive` listed `Spawn_Air` (which has a `+3.0m` vertical root-bone offset) first, and `player-controller.js` did not check `!campaignLoop.combatHeroes[leader.id]?.downed` before playing `idle` or keep Smite-dissolved heroes hidden while downed.
   - *Fix:* Changed `revive` candidates to `['Spawn_Ground', 'Lie_StandUp', 'Cheer']`, gated leader locomotion on `!downed`, and kept Smite-dissolved victims at `dissolveProgress = 1.0` (`visible = false`) while downed.

---

## 5. Automated Unit Test Verification

All 4 Divine Verdict unit & simulation test suites pass with zero errors:
- `node world/test-briar-vfx.mjs` -> **PASS**
- `node world/test-eclipse-smite-shaders.mjs` -> **PASS**
- `node world/test-commune-vad-throw.mjs` -> **PASS**
- `node world/test-divine-verdict-sim.mjs` -> **PASS**
