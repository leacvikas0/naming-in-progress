# Divine Verdict ("Court of Bloody Dark Flowers & The Eclipse") Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy lotus/levitation Commune sequence with the locked **Court of Bloody Dark Flowers & The Eclipse** cinematic and gameplay overhaul (`Frame 37` Prayer Start & Airborne Enemy Throw, `Frame 57` *Witcher 3* Iris Manor Dense Wild-Rose Briar Jail & Underground Resurrection Slump, 30s `<= 5.0m` Proximity Blessing Tether, and `Frame 41` `0.0x` Dead-Wind Selective-Crimson Monochrome Smite Dissolve).

**Architecture:**
1. **Headless Blender 5.2 Botanical Asset Pipeline (`world/tools/build-blender-flowers.py` -> `world/assets/flowers/blender-flower-data.js`):** Procedurally sculpts and bakes a closed-volume *Witcher 3: Hearts of Stone* (Iris von Everec Manor) braided wild-rose briar lattice (`witcherBriarSegment`) and a quiet cobblestone flower-slump cushion (`crimsonPetalSlump`) with explicit arc-length growth parameter `uCurveT`, botanical part classification `vPartKind` (`stem`, `serratedLeaf`, `roseBloom`), spherical-goblet custom normals, and Linear-RGB vertex cavity AO.
2. **Atmosphere, Post-Processing & Character Shader Seams (`world/src/sky-tod.js`, `world/src/post.js`, `world/assets/characters/toon-skin.js`, `world/src/main.js`):** Adds the colossal Black-and-Crimson Eclipse Disc + downward cloud-ring compression (`uEclipseWeight`, `uEclipseCompression`), a phase-continuous `windElapsed` integrator (`windTimeScale = 0.35` in Prayer, `0.0` dead stop in Smite), a selective blood-crimson monochrome post-grade (`uSmiteMonochrome`) applied after split-toning/haze, and a GPU ground-plane portal clip (`uGroundClipY`) + upward Voronoi petal-dissolve (`uDissolveProgress`) on both unified character toon and outline `SkinnedMesh`es.
3. **4-Beat Choreography & Gameplay Rules (`world/assets/vfx/artorious-vfx.js`, `world/src/combat/commune-client.js`, `world/src/combat/enemy-manager.js`, `world/src/combat/campaign-loop.js`, `world/src/player-controller.js`):** Enforces the strict `<= 4.0m` Circle + Combat Eligibility (`Downed` or `< 35% HP`) gate, 100% control lockout, hybrid hold/tap voice detector (`>= 1.5s` hold-to-send, `< 1.5s` hands-free with `2.2s` post-speech silence auto-send, `< 2` words safe cancel), `6.5m` zero-damage airborne enemy launch (`0.15x` slow-mo), the `2.5s` 4-beat Briar Jail -> Underground `-2.5m` Pull -> `1.5s` Flower-Slump HP Fill -> Clean Pop-Up resurrection, the `30.0s` `<= 5.0m` Proximity Blessing (`0` dmg taken, `2.0x` dmg, `1/3` `Q` CD, `1/2` `E` CD/downtime, instant break `> 5.0m`), and the `2.8s` `Frame 41` Smite dissolve (Partner dies + Speaker `10% Max HP`, or Speaker dissolves -> Sanctuary Stone wipe if Partner was already dead).

**Tech Stack:** Three.js (r170 ES Modules), GLSL ES 3.00 Custom ShaderMaterials, Headless Blender 5.2.1 LTS (`bmesh` + `mathutils` + `bx_review`), WebAudio API (`AnalyserNode` VAD + Haas stereo widener), Node.js native test runner, Playwright + native multimodal video QA (`5–12 FPS`).

**Spec:** Locked visual references in `docs/references/vfx-concepts/37-strict3d-beat1-prayer-throw-sky-compression.png`, `docs/references/vfx-concepts/57-witcher3-vine2-iris-manor-interlaced-rose-lattice.png`, and `docs/references/vfx-concepts/41-strict3d-beat5-smite-bw-loose-petal-dissolve.png`.

## Global Constraints

- **Universal "Zero Glass" Law:** Every mesh in `ArtoriousVfxSystem` and `BLENDER_VOLUMETRIC_FLOWERS` must use `transparent: false, depthWrite: true` (`THREE.FrontSide`), relying strictly on 3D geometry, vertex colors, and shader `discard` erosion—zero alpha-blended glass shells, zero glowing sci-fi veins, zero broken concrete rubble.
- **Draw Call Budget:** `ArtoriousVfxSystem` must stay `<= 4` draw calls when active and `0` draw calls when idle (`group.visible = false`, all `InstancedMesh.count = 0`).
- **Zero Prayer/Blessing Direct Damage:** Neither Prayer Start (`Phase 1`) nor Blessing/Heal/Miracle (`Phase 2A`) may deal any direct HP damage to enemies (`0` damage dealt, `0` damage taken). `E` and `Q` move animations and mechanics remain unchanged except for their Blessing cooldown multipliers.
- **Strict `<= 4.0m` Prayer Eligibility:** Prayer can only start when `distance(Knight, Mage) <= 4.0m` (living or downed body), and if `activeEnemies.length > 0`, only when `Knight.downed || Mage.downed || Knight.hp / Knight.maxHp < 0.35 || Mage.hp / Mage.maxHp < 0.35`.
- **Strict `<= 5.0m` Blessing Tether:** The `30.0s` Blessing grants `100%` invincibility (`0` damage taken), `2.0x` attack/spell damage, `1/3` `Q` cooldown (`24s -> 8.0s`), and `1/2` `E` cooldown (`8.5s -> 4.25s` Mage `E`; `5.0s -> 2.5s` downtime / `15.5s` total CD Knight `E`) **only while `distance(Knight, Mage) <= 5.0m`**, breaking permanently the instant `distance > 5.0m`.

## Review Focus

1. **Underground Character Shadow & Sword VFX Bleed (`Beat 2 & Beat 3`, `0.45s -> 2.20s`):** When characters are pulled `-2.5m` underground beneath the quiet crimson flower slump, their `uCharShadows` ground circles on terrain/meadow and Knight's `swordVfx` elemental sheath must be 100% hidden (`active = 0.0`, `visible = false`), never leaving dark shadow discs or floating blades on the cobblestones.
2. **Phase-Continuous Wind Deceleration & Freeze (`windTimeScale = 0.35` -> `0.0`):** Changing `windTimeScale` must integrate a monotonic `windElapsed += dt * windTimeScale` accumulator rather than multiplying `elapsed * windTimeScale`, so trees, grass, flowers, clouds, and wind ribbons never snap or teleport backward in phase when wind slows or stops dead.
3. **Selective-Crimson Monochrome Purity (`Frame 41` Smite):** The `post.js` `uSmiteMonochrome` grade must run *after* split-toning (`uWarmHigh` / `uCoolShadow`), shadow lift (`uLift`), and sky haze (`uHaze`), using a strict crimson dominance gate (`R > 2.35 * G && R > 1.65 * B`) so terracotta village roofs (`#c24928`) and environment props desaturate to stark monochrome greyscale while ONLY the blood-crimson rose petals and Eclipse corona remain saturated.
4. **Foolproof Hybrid Mic Input Edge Cases:** A quick tap (`< 1.5s`) followed by silence or `< 2` spoken words must safely cancel (`cancelCommuneChannel`) with zero Smite penalty; a hold (`>= 1.5s`) must send immediately on key/pointer release; a tap (`< 1.5s`) with speech (`>= 2` words) must auto-send after `2.2s` of silence or on a second tap.
5. **Arena Fence & Obstacle Clamping During Airborne Enemy Throw (`6.5m`):** Enemies launched off their feet (`vy = 8.8..12.2`, `vx/vz` outward knockback, `0.15x` mixer slow-mo) near the East Wisteria Arena fence, Town Plaza well/fences, or North Shrine planters must stay clamped inside walkable bounds via `applyEnemySpatialConstraints` and land cleanly on `walkableHeightAt(x, z)`.

---

## Part 1: Initial Architecture & Cinematography Plan

### 1.1 Exact File Seams & Responsibilities

| File Path | Responsibility in the Overhaul |
|---|---|
| `world/tools/build-blender-flowers.py` | Headless Blender 5.2 generator expanded to sculpt and bake two new 3D botanical assets into `world/assets/flowers/blender-flower-data.js`: `witcherBriarLattice` (braided *Witcher 3* Iris Manor thorny rose-vine arch with serrated forest-green `#18361c` & autumn-burgundy `#4a1822` leaves, tight crimson buds, and deep goblet blood-roses `#5a0613 -> #db1e34`, plus per-vertex `uv = [uCurveT, vPartKind]`) and `crimsonFlowerSlump` (quiet, flat cobblestone cushion of fallen velvet roses and loose cupped crimson petals, `h <= 0.16m`). |
| `world/assets/flowers/blender-flower-data.js` | Generated static ES module exporting `BLENDER_VOLUMETRIC_FLOWERS` (`pos`, `nrm`, `col`, and optional `uv` Float32Arrays). |
| `world/assets/vfx/artorious-vfx.js` | Replaces Sacred Lotus monoliths and floating levitation with the 4-Draw-Call **Briar Jail, Flower Slump & Loose Crimson Petal Vortex** engine:<ul><li>`DC 1 (skyRibbonsMesh)`: Dark crimson-obsidian wind wisps during Prayer (`0.35x`) and upward-curling dissipation threads.</li><li>`DC 2 (monolithsMesh)`: Upgraded to render 24 instances of the Blender-baked `witcherBriarLattice` weaving a dense, 100%-enclosing *Witcher 3* wild-rose cage around both lovers, driven by `uGrowthProgress` (`vCurveT` extrusion) and `uSubmergeDepth` (`-2.5m` underground pull + ground-plane `discard`).</li><li>`DC 3 (prismsAndDebrisMesh)`: 240 instances of `createPlushRosePetalGeometry()` — 32 world-space drifting petals + 8 camera-frustum foreground soft-focus petals in `channel` (`Frame 37`), 64 scattering slump petals at Beat 4 (`2.20s -> 2.50s`), and 240 upward-dissolving blood-crimson petals in `smite` (`Frame 41`, zero golden embers).</li><li>`DC 4 (groundSigilMesh)`: Upgraded to render the Blender-baked `crimsonFlowerSlump` — a quiet, low-profile pile of fallen crimson roses and loose petals resting directly on the cobblestones during Beat 2–4 (`0.45s -> 2.50s`) and around the dissolving partner's boots in `smite` (`Frame 41`), with **zero broken concrete rubble** and **zero glowing sci-fi rings**.</li></ul> |
| `world/assets/characters/toon-skin.js` | Injects `uGroundClipY`, `uDissolveProgress`, `uDissolveEdgeColor`, and `uMonochromeOverride` into both `createCharacterToonMaterial` and `makeSkinnedOutlineMaterial`, plus a helper `setCharacterVerdictShaderState(charInstance, state)` so characters clip cleanly at the ground plane when pulled to `y = -2.5m` and dissolve upward from boots to crown into crimson petals during Smite. |
| `world/src/sky-tod.js` | Adds `setEclipseState({ weight, compression, dir })` to `createTimeOfDaySky`: blends the upper sky to deep blue-black (`#060812`), renders the colossal Black Eclipse Disc (`angRadius = 0.34 rad`) with searing blood-crimson rim (`#ff1e2e`), and compresses `todCumulusRing` vertices downward by `14.5m` with crimson-lit tops and obsidian undersides (`Frame 37` & `Frame 41`). |
| `world/src/post.js` | Adds `setSmiteMonochrome(weight)` (`uSmiteMonochrome` uniform in `GradeShader`) to drain the entire world to stark Black & White monochrome after split-toning/haze while keeping pure blood-crimson (`crimsonDominance`) saturated (`Frame 41`). |
| `world/src/combat/commune-client.js` | Upgrades microphone capture to the **Foolproof Hybrid Hold / Tap + Silence VAD State Machine** (`Hold >= 1.5s` sends on release; `Tap < 1.5s` stays in hands-free mode with `2.2s` post-speech silence auto-send or second-tap send; `< 2` spoken words or `< 0.35s` voiced RMS triggers `safe_cancel` with zero Smite). |
| `world/src/combat/enemy-manager.js` | Adds `applyPrayerAirborneThrow(centerPos, radius = 6.5)` launching all enemies within `6.5m` upward (`vy = 8.8..12.2`) and radially backward (`vx/vz = 11.5 m/s`) into a `0.15x` slow-motion airborne knockdown (`0` damage to enemies, `0` damage to players). |
| `world/src/combat/campaign-loop.js` | Implements `canStartDivinePrayer(heroStates)` (`<= 4.0m` + combat `< 35% HP` or `downed`), the asynchronous `2.5s` Blessing/Heal/Resurrection timeline (`verdictSequence`: Beat 1 `0..0.45s` fast briar jail, Beat 2 `0.45..0.70s` `-2.5m` yank, Beat 3 `0.70..2.20s` underground `1.5s` smooth HP fill to 100% + partner repositioned beside speaker, Beat 4 `2.20..2.50s` side-by-side pop-up), the `2.8s` Smite timeline (Partner dissolves & dies + Speaker drops to `10% Max HP`; or if Partner was already dead, Speaker dissolves -> Sanctuary Stone wipe), and the `30.0s` `<= 5.0m` Proximity Blessing Tether (`0` damage taken, `2.0x` damage, `1/3` `Q` CD, `1/2` `E` CD/downtime, instant break when `dist > 5.0m`). |
| `world/src/player-controller.js` & `world/src/main.js` | Enforces 100% control lockout during Prayer/Blessing/Smite, integrates monotonic `windElapsed` (`windTimeScale = 1.0 | 0.35 | 0.0`), hides `uCharShadows` when characters submerge below ground, syncs camera look-target dip during Beat 2–3, and exposes deterministic shots for `Frame 37`, `Frame 57`, and `Frame 41`. |

### 1.2 Cinematographic Timeline & Animation Curves

```mermaid
sequenceDiagram
    participant P as Player Input (R / Commune)
    participant Sky as Sky & Post (sky-tod.js / post.js)
    participant VFX as ArtoriousVfxSystem (artorious-vfx.js)
    participant Char as Heroes & Enemies (player-controller / campaign-loop)

    Note over P,Char: PHASE 1: PRAYER START (Speaking Mode — Frame 37)
    P->>Char: Gate Check: dist <= 4.0m & (!inCombat || anyDowned || anyHp < 35%)
    Char->>Char: 100% Control Lockout + Enemies within 6.5m Airborne Throw (vy=10.5, 0.15x slow-mo, 0 dmg)
    Char->>Sky: uEclipseWeight -> 1.0, uEclipseCompression -> 1.0, windTimeScale -> 0.35
    Char->>VFX: startChannel() -> 40 Loose Crimson Petals (8 foreground lens) + Slow Briar Vine Creep (uGrowth = 0.0 -> 0.22)

    alt Accidental Empty Tap (< 2 words)
        P->>Char: Safe Cancel -> Unlock Controls, Sky & Wind Restore (0 Penalty)
    else Verdict == BLESSING / HEAL / MIRACLE (Phase 2A — 2.5s Total)
        Note over P,Char: Beat 1 (0.00s -> 0.45s): Quartic Ease-In Super-Fast Briar Jail (Frame 57)
        VFX->>VFX: 24 Braided Briar Arches shoot up (uGrowth = 0.22 + 0.78 * t^4) enclosing both lovers
        Note over P,Char: Beat 2 (0.45s -> 0.70s): Yanked Underground (-2.5m) Into Quiet Flower Slump
        VFX->>Char: Hero Y offset 0.0m -> -2.5m (uGroundClipY active), Vines retract into ground
        VFX->>VFX: Only quiet crimsonFlowerSlump remains on cobblestones
        Note over P,Char: Beat 3 (0.70s -> 2.20s): Kept Underground 1.5s While HP Fills to 100%
        Char->>Char: Heroes hidden (visible=false, shadow=0), Dead partner revived & placed beside speaker, HP smoothly lerps -> 100%
        Note over P,Char: Beat 4 (2.20s -> 2.50s): Clean Side-by-Side Pop Back Up in Full Power
        Char->>Char: Heroes pop up (y: -2.5m -> 0.0m), Slump scatters into puff of matte crimson petals
        Char->>Sky: Eclipse clears -> Day/Act sky, windTimeScale -> 1.0, Controls Unlock
        Char->>Char: Start 30.0s Proximity Blessing (<= 5.0m Tether: Invincible, 2x DMG, 1/3 Q CD, 1/2 E CD)
    else Verdict == SMITE (Phase 2C — Frame 41 — 2.8s Total)
        Char->>Sky: windTimeScale -> 0.0 (All trees/grass/wind freeze dead!)
        Char->>Sky: post.setSmiteMonochrome(1.0) (Stark B&W world, ONLY blood-crimson saturated)
        alt Both Lovers Were Alive
            Char->>Char: Partner dissolves upward into 240 blood-crimson petals & dies (0 HP / Downed); Speaker drops to 10% Max HP
        else Partner Was Already Dead
            Char->>Char: Speaker dissolves upward into 240 blood-crimson petals -> Total Party Wipe -> Respawn at Sanctuary Stone
        end
    end
```

---

## Part 2: Ruthless Self-Critique ("What Would Look Bad or Break in Version 1 & How We Fix It")

Using `judging-3d-scenes`, `judging-gameplay`, and `scenario-blender-expert` standards, here are the **10 concrete visual, geometric, shader, and gameplay failures** that would happen in a naive Version 1 implementation—and the exact engineering fixes baked into our final execution tracks:

### Critique 1: Character Ground Shadow Circles (`uCharShadows`) Stay Stamped on the Cobblestones While Characters Are `-2.5m` Underground (`judging-3d-scenes` Blocker)
- **What Would Break in V1:** In `world/src/main.js` (`syncCharacterGroundShadows()`, lines 1102–1133), the shader uniform `uCharShadows` checks `if (kGrp && kGrp.visible)` and stamps a `0.72m` dark shadow disc onto the terrain and meadow grass at `(kGrp.position.x, kGrp.position.z)`. If Beat 2 (`0.45s -> 0.70s`) pulls the characters to `y = -2.5m` without fading `uCharShadows` (or if `kGrp.visible` stays `true`), two dark circular character shadows sit awkwardly on top of the cobblestones during the `1.5s` quiet flower slump!
- **How We Fix It:**
  1. During Beat 2 (`0.45s -> 0.70s`), `syncCharacterGroundShadows()` computes `submergeRatio = clamp(1.0 + (kGrp.position.y - walkableHeightAt(kGrp.position.x, kGrp.position.z)) / 0.65, 0.0, 1.0)` and scales the shadow's active weight (`w` component of `uCharShadows[idx]`) down to `0.0`.
  2. During Beat 3 (`0.70s -> 2.20s`), `campaignLoop` / `player-controller` explicitly sets `knightChar.group.visible = false` and `mageChar.group.visible = false` (and hides `vfxKit.swordVfx` blade sheath), guaranteeing `0` character triangles and `0.0` ground shadow weight while underground.

### Critique 2: Uniform 3D Scaling Makes Vines Look Like Inflating Plastic Toys Instead of Growing Stems (`scenario-blender-expert` & `judging-3d-scenes` Major)
- **What Would Break in V1:** Scaling a static vine mesh uniformly (`_dummy.scale.setScalar(emerge)`) makes a miniature cage expand radially and vertically at the same time—stems look hair-thin at `t = 0.05s` and roses inflate from microscopic dots. Worse, in `Frame 57`, the *Witcher 3* Iris Manor rose lattice is a **dense, multi-stranded braided cage** that completely jails both characters (`width ~ 2.8m`, `height ~ 2.25m`), whereas a single thin arch leaves huge gaps.
- **How We Fix It:**
  1. In `world/tools/build-blender-flowers.py`, we sculpt `witcherBriarCluster` with **3 interlaced, helically braided woody stems per cluster** (`sides = 5`, dark bark `#2b1712 -> #3d2318` with thorny barbs), **14 serrated compound rose leaves** (deep forest-green `#16381c` and autumn-burgundy `#4e1620`), **6 tight crimson rosebuds**, and **5 lush goblet blood-roses** (`#4a040e -> #b81428 -> #e11d48`), and encode `uv = [uCurveT, vPartKind]` on every vertex.
  2. In `ArtoriousMonolithMaterial` (`artorious-vfx.js`), we spawn **24 overlapping instances** arranged in a dense **double-ring interwoven dome** (`12` inner clockwise-leaning arches + `12` outer counter-clockwise-leaning arches bridging the full `2.6m x 2.2m` duo footprint so it forms an impenetrable *Witcher 3* briar jail around both Knight and Mage).
  3. The vertex shader grows stems **along `uCurveT`** (`float activeT = min(uCurveT, uGrowthProgress)`), tapering stem cross-sections to a sharp point at the growing tip (`uCurveT == uGrowthProgress`), while leaves and roses sprout locally only after `uGrowthProgress` passes their attachment node `uAttachT`!

### Critique 3: Plunging `-2.5m` Through Sloped Terrain or Low Camera Angles Exposes Feet/Outlines Under the Floor (`judging-3d-scenes` Blocker)
- **What Would Break in V1:** When characters plunge `-2.5m` underground (`0.45s -> 0.70s`) or pop back up (`2.20s -> 2.50s`), relying solely on the terrain's depth buffer fails on sloped stairs (e.g., North Shrine) or when the inverted-hull outline (`mvPosition.z -= zBias`) wins the depth test near the ground contact line.
- **How We Fix It:** We inject `uniform float uGroundClipY;` into **both** `createCharacterToonMaterial` and `makeSkinnedOutlineMaterial` (`world/assets/characters/toon-skin.js`) and into `ArtoriousMonolithMaterial` (`world/assets/vfx/artorious-vfx.js`). Every fragment with `vWorldPos.y < uGroundClipY + 0.01` is discarded on the GPU—creating a razor-sharp horizontal ground-plane portal cut regardless of terrain slope or camera angle.

### Critique 4: Camera Plunges Underground or Stares Over the Flower Slump (`judging-gameplay` Camera Betrayal Blocker)
- **What Would Break in V1:** If the `-2.5m` pull modifies `heroStates.Knight.y`, `syncSharedPlayerFromLeader()` copies `leader.y` to `player.y`, and `updateCamera()` in `main.js` drags the camera `-2.5m` underground inside the terrain mesh! Conversely, if `player.y` stays at ground level (`0.0m`), `camera.lookAt` stares at `player.y + 1.85m` (empty air) while the characters are hidden underground for `1.5s`, leaving the quiet crimson flower slump at the very bottom of the screen.
- **How We Fix It:**
  1. `heroStates[role].y` remains strictly pinned to `walkableHeightAt(x, z)`. The `-2.5m` plunge is applied exclusively via `artoriousVfx.getHeroLevitationOffset(role)` in `applyTransform()`.
  2. During Beat 2 & Beat 3 (`0.45s -> 2.20s`), `artoriousVfx.getCameraCinematicOffset()` provides a smooth damped look-target dip (`lookY = -0.68m`) so the camera tilts gently down to center the quiet cobblestone flower slump and the filling HUD health bars, then smoothly restores (`lookY = 0.0m`) at `2.20s -> 2.50s` as both characters pop up!

### Critique 5: `windTimeScale = 0.0` Causes Instantaneous Backward Phase Teleport in All Foliage & Clouds (`judging-3d-scenes` Major)
- **What Would Break in V1:** All vertex shaders (`sky-tod.js`, `meadow.js`, `trees.js`, `terrain-water.js`) compute `sin(uTime * speed + phase)`. Multiplying `elapsed * windTimeScale` causes `uTime` to jump from `60.0` to `21.0` when `windTimeScale` changes from `1.0` to `0.35`, and from `21.0` to `0.0` when `windTimeScale` hits `0.0` in Smite—violently teleporting every tree branch, cloud, and grass blade across the screen!
- **How We Fix It:** In `world/src/main.js`, we maintain a dedicated `windElapsed` state variable updated each frame by `windElapsed += dt * sky.getWindTimeScale()`. When `windTimeScale` drops to `0.35` (Prayer) or `0.0` (Smite), `windElapsed` slows down and stops at its exact instantaneous value—zero phase jump, 100% dead-still freeze across every tree, flower, grass blade, waterwheel, and wind ribbon.

### Critique 6: `post.js` Split-Toning, Shadow Lift, and Sky Haze Ruin the `Frame 41` Stark B&W + Blood-Crimson Grade (`judging-3d-scenes` Major)
- **What Would Break in V1:** In `world/src/post.js`, Steps 5, 6, and 7 (`uWarmHigh`, `uCoolShadow`, `uLift * vec3(0.82, 0.90, 1.08)`, and `uHaze * vec3(0.86, 0.94, 1.0)`) run *after* `uSaturation`. If monochrome desaturation is applied at Step 3, the output is still tinted periwinkle-blue! And a naive red-hue filter would keep the terracotta village roofs (`#c24928`) and the surviving speaker's crimson cape saturated, contradicting `Frame 41` where the houses and surviving character are 100% stark B&W.
- **How We Fix It:**
  1. Place the `uSmiteMonochrome` selective-crimson grade in `post.js` **after Step 7 (Haze)** and right before Step 8 (Vignette).
  2. Use a strict **Blood-Crimson Purity Mask** (`float crimsonMask = smoothstep(0.16, 0.34, c.r - max(c.g * 2.35, c.b * 1.65)) * step(0.18, c.r);`) that passes pure blood-crimson (`#7f1022..#ff1e38` petals & Eclipse corona, where `G < 0.15 * R`) while rejecting orange-terracotta roofs (`#c24928`, where `G = 0.38 * R`).
  3. On the surviving speaker character during Smite (`Frame 41`), set `uMonochromeOverride = 1.0` in `toon-skin.js` so the kneeling survivor's cape/armor renders in stark monochrome greyscale while the dissolving partner's 240 crimson rose petals and the overhead Eclipse ring burn vivid blood-crimson!

### Critique 7: Eclipse Disc Hidden Behind Cumulus Clouds or Off-Camera (`judging-3d-scenes` Blocker)
- **What Would Break in V1:** In `sky-tod.js`, the sun is fixed in the NNW (`[-0.21, 0.28, -0.93]`) and the 10 cumulus clouds float at `y = 35..52m`. If the player prays while facing South or East, the Eclipse disc is behind the camera! And even when facing North, the cumulus clouds at `y = 35..52m` cover the lower half of the sky dome (`d.y = 0.15..0.30`), blocking the Eclipse disc.
- **How We Fix It:** When Prayer starts, `sky.setEclipseState()` locks `uEclipseDir` to the camera's horizontal forward azimuth at an elevation of `d.y = 0.42` (`~25°` above the horizon, matching `Frame 37` and `Frame 41`), and `uEclipseCompression` physically presses the cumulus cloud ring downward (`worldPos.y -= 14.5 * uEclipseCompression`) so the colossal black Eclipse disc sits directly above the compressed crimson-lit cloud bank in front of the player!

### Critique 8: Airborne Thrown Enemies Clipping Outside Arena Fences or Dealing Windup Damage Mid-Flight (`judging-gameplay` Blocker)
- **What Would Break in V1:** Launching enemies backward at `11.5 m/s` without per-frame boundary clamping can push skeletons outside the East Wisteria Arena fence (`r = 18.4m`) or into village cottages. Also, if an enemy was at `windupTimer = 0.64s` (`0.01s` before hit) when Prayer started, a slow-mo tick could still complete their windup and hit the locked player!
- **How We Fix It:**
  1. `applyPrayerAirborneThrow()` immediately resets `e.aiState = 'orbit'`, `e.windupTimer = 0`, `e.telegraphProgress = 0`, `e.hasAttackToken = false`, and sets `e.stunTimer = 2.6`, `e.knockdownTimer = 2.4`.
  2. Every frame during airborne flight (`!e.grounded`), `enemyManager.update()` runs `applyEnemySpatialConstraints(e.x + e.vx * dt, e.z + e.vz * dt, e.radius)` and sets `e.char.mixer.timeScale = 0.15` while airborne (`e.y > groundY + 0.15`), producing the exact `Frame 37` slow-motion airborne throw without ever escaping arena boundaries or dealing damage.

### Critique 9: Dead Partner Revival Teleporting Visibly Above Ground Instead of Underground During Beat 3 (`judging-3d-scenes` Major)
- **What Would Break in V1:** If one partner died `3.8m` away and Prayer is triggered (`<= 4.0m` rule), reviving them immediately at `0.0s` would make them stand up before the briar jail closes; reviving them at `2.20s` at `3.8m` distance would make them pop up outside the briar jail instead of side-by-side!
- **How We Fix It:**
  1. During Beat 1 (`0.00s -> 0.45s`), the briar lattice expands over the midpoint `(cx, cz)` and both characters' positions (`rx = max(1.65m, dist * 0.62 + 0.95m)`).
  2. During Beat 3 (`0.70s -> 2.20s`), **while both characters are completely hidden underground (`y = -2.5m`, `visible = false`)**, any downed partner has `downed = false` set and both characters' `(x, z)` coordinates are smoothly repositioned side-by-side (`1.35m` apart around `(cx, cz)`, clamped via `resolveCollisions`) while their HP lerps smoothly from current HP (`0` if downed) to `100% Max HP` over `1.5s` (`0.70s -> 2.20s`).
  3. At Beat 4 (`2.20s -> 2.50s`), both characters pop up (`visible = true`, `y: -2.5m -> 0.0m`) standing right beside each other at `100% HP`!

### Critique 10: Solo Wingman AI Lagging `> 5.0m` Behind Leader and Accidentally Breaking the 30s Blessing Tether (`judging-gameplay` Major)
- **What Would Break in V1:** In `player-controller.js`, Solo Wingman AI normally trails at `2.15m` and only sprints when `distW > 4.2m`. If the player sprints + dashes (`15.4 m/s`), the gap between Leader and AI Wingman briefly hits `5.1m`, which would prematurely snap the `<= 5.0m` Blessing Tether in single-player mode!
- **How We Fix It:** While `campaignLoop.isDivineBlessingActive()` is true in Solo Wingman mode (`!isPeerLinked`), `player-controller.js` tightens `wingOffsetDist` to `1.45m` and increases Wingman follow speed so the AI partner stays within `1.4m..2.8m` of the leader during normal locomotion/dashing, while explicit separation `> 5.0m` (in 2-player co-op or direct position separation tests) immediately breaks the Blessing at `5.001m`.

---

## Part 3: Final Upgraded Parallel Subagent Execution Tracks

The implementation is partitioned into **4 clean, non-overlapping file-ownership tracks** (Tracks A, B, C can run in parallel after Track A's schema is known, followed by Track D integration & Track E Independent QA Judgment):

| Track | Subagent Role | Owned Files (Strict Non-Overlapping) |
|---|---|---|
| **Track A** | **Blender 5.2 Botanical Sculptor & VFX Geometry TD** | `world/tools/build-blender-flowers.py`, `world/assets/flowers/blender-flower-data.js`, `world/assets/vfx/artorious-vfx.js`, `world/test-briar-vfx.mjs` |
| **Track B** | **Atmosphere, Post-Grade & Character Shader TD** | `world/src/sky-tod.js`, `world/src/post.js`, `world/assets/characters/toon-skin.js`, `world/test-eclipse-smite-shaders.mjs` |
| **Track C** | **Hybrid Voice VAD & Airborne Enemy Physics TD** | `world/src/combat/commune-client.js`, `world/src/combat/enemy-manager.js`, `world/test-commune-vad-throw.mjs` |
| **Track D** | **Verdict State Machine, 30s Tether & Live World Wiring TD** | `world/src/combat/campaign-loop.js`, `world/src/combat/combat-balance.js`, `world/src/player-controller.js`, `world/src/main.js`, `world/test-divine-verdict-sim.mjs` |
| **Track E** | **Independent 3D Scene & Live Gameplay QA Judge** | `qa-review/divine-verdict/` (Read-only inspection of `world/`, headless Playwright + native `.webm` video capture & 2-pass `judging-3d-scenes` + `judging-gameplay` sign-off) |

---

### Task 1 (Track A): Headless Blender 5.2 *Witcher 3* Briar Lattice & Crimson Flower Slump + 4-Beat `ArtoriousVfxSystem`

**Files:**
- Modify: `world/tools/build-blender-flowers.py`
- Modify: `world/assets/flowers/blender-flower-data.js` (generated via headless Blender 5.2)
- Modify: `world/assets/vfx/artorious-vfx.js`
- Create: `world/test-briar-vfx.mjs`

**Interfaces:**
- Produces in `world/assets/flowers/blender-flower-data.js`:
  - `BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch`: `{ triangles: number (<= 680), pos: Float32Array, nrm: Float32Array, col: Float32Array, uv: Float32Array }` where `uv` pairs are `[uCurveT (0..1), vPartKind (0.0=stem, 0.5=serratedLeaf, 1.0=crimsonRose)]`.
  - `BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump`: `{ triangles: number (<= 540), pos: Float32Array, nrm: Float32Array, col: Float32Array }` (flat `r = 1.0m`, `h = 0.01..0.15m` cobblestone cushion of 9 fallen velvet crimson roses and 28 cupped loose crimson petals, zero stone rubble).
- Produces in `world/assets/vfx/artorious-vfx.js`:
  - `artoriousVfx.startChannel(origin, partnerPos, { camera })` — `Frame 37` slow creeping briar roots (`uGrowthProgress = 0.0 -> 0.22`) + `40` loose cupped crimson rose petals (`32` world-space around lovers + `8` camera-foreground soft-focus petals) drifting at `windTimeScale = 0.35`.
  - `artoriousVfx.triggerBlessing(origin, partnerPos)` / `artoriousVfx.triggerHeal(origin, partnerPos)` / `artoriousVfx.triggerMiracle(origin, partnerPos)` — unified `2.50s` (`totalDuration = 2.50`) 4-beat *Witcher 3* Briar Jail & Flower Slump sequence:
    - **Beat 1 (`0.00s -> 0.45s`):** Quartic ease-in (`u = (t / 0.45)^4`, `uGrowthProgress = 0.22 + 0.78 * u`) shooting 24 interlaced `witcherBriarArch` instances up to form a dense, 100%-enclosing *Witcher 3* wild-rose cocoon (`height = 2.25m`).
    - **Beat 2 (`0.45s -> 0.70s`):** In `0.25s`, `submergeU = smoothstep(0.45, 0.70, t)`: pulls both heroes straight underground (`_originLevY = _partnerLevY = -2.5 * submergeU`), retracts the 24 briar arches into the ground (`uSubmergeDepth = 2.5 * submergeU` with ground-plane `discard`), and reveals `DC 4` (`crimsonFlowerSlump`, `count = 1`) resting quietly on the cobblestones.
    - **Beat 3 (`0.70s -> 2.20s`):** For `1.50s`, heroes remain at `-2.5m` (`isUndergroundHidden() === true`), `monolithsMesh.count = 0` (vines 100% gone), and only the quiet `crimsonFlowerSlump` (`DC 4`) + 12 gentle ground-skimming petals (`DC 3`) rest on the cobblestones.
    - **Beat 4 (`2.20s -> 2.50s`):** In `0.30s`, `popU = outQuint((t - 2.20) / 0.30)`: heroes pop cleanly back onto the ground (`_originLevY = _partnerLevY = -2.5 * (1.0 - popU)`), `crimsonFlowerSlump` scatters into a brief puff of 64 matte crimson petals (`DC 3`) that blows away and erodes to `0` draw calls at `2.50s`.
  - `artoriousVfx.triggerSmite(dissolveOrigin, partnerPos, { camera })` — `2.80s` (`totalDuration = 2.80`) `Frame 41` Smite sequence: `0.0x` dead-still foreground & ambient petals + `240` upward-spiraling loose blood-crimson rose petals (`kind = 2.0`, zero golden embers) rising from the dissolving character's torso/boots toward the Eclipse disc + `crimsonFlowerSlump` petal pile at their boots (`_characterDissolveProgress = smoothstep(0.15, 2.15, t)`).
  - `artoriousVfx.isHeroUndergroundHidden()` -> `boolean` (`true` during `0.70s <= age < 2.20s` in `blessing`/`heal`/`miracle`).
  - `artoriousVfx.getCameraLookOffset(outVec3)` -> `THREE.Vector3` (dips `y` to `-0.68m` during `0.45s..2.20s` so the camera frames the flower slump).

- [ ] **Step 1: Write the failing test `world/test-briar-vfx.mjs`**

```js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLENDER_VOLUMETRIC_FLOWERS } from './assets/flowers/blender-flower-data.js';
import { createArtoriousVfxSystem } from './assets/vfx/artorious-vfx.js';

// 1. Verify Blender-baked Witcher 3 briar arch & crimson flower slump exist with valid attributes
assert.ok(BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch, 'witcherBriarArch must be baked in blender-flower-data.js');
assert.ok(BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.triangles >= 280 && BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.triangles <= 680);
assert.equal(
  BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.uv.length,
  BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch.triangles * 3 * 2,
  'witcherBriarArch must include per-vertex [uCurveT, vPartKind] uv pairs'
);
assert.ok(BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump, 'crimsonFlowerSlump must be baked in blender-flower-data.js');
assert.ok(BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump.triangles >= 180 && BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump.triangles <= 540);

// 2. Verify 4-beat Blessing timeline (2.50s total)
const scene = new THREE.Scene();
const vfx = createArtoriousVfxSystem({ scene, getGroundHeight: () => 0 });
vfx.triggerBlessing({ x: 0, y: 0, z: 0 }, { x: 1.5, y: 0, z: 0 });
assert.equal(vfx.totalDuration, 2.5);

// Beat 1 (0.35s): Dense briar jail (24 instances) growing fast, heroes still on ground (levY == 0)
vfx.seek(0.35);
assert.equal(vfx.monolithsMesh.count, 24, 'Beat 1 must render 24 dense briar lattice arches');
assert.equal(vfx.getHeroLevitationOffset('Knight'), 0);
assert.equal(vfx.isHeroUndergroundHidden(), false);

// Beat 2 end (0.69s): Heroes pulled underground near -2.5m, flower slump active
vfx.seek(0.69);
assert.ok(vfx.getHeroLevitationOffset('Knight') < -2.2, 'Beat 2 must yank heroes to ~ -2.5m');
assert.equal(vfx.groundSigilMesh.count, 1, 'Flower slump must be visible on cobblestones');

// Beat 3 (1.45s): Heroes kept underground (hidden), vines 100% gone (count == 0), only flower slump remains
vfx.seek(1.45);
assert.equal(vfx.isHeroUndergroundHidden(), true, 'Heroes must be flagged underground-hidden during Beat 3 (0.70s..2.20s)');
assert.equal(vfx.monolithsMesh.count, 0, 'Briar vines must have completely disappeared into the ground in Beat 3');
assert.equal(vfx.groundSigilMesh.count, 1, 'Only the quiet flower slump remains on the ground in Beat 3');

// Beat 4 (2.35s): Heroes popping back up to ground, flower slump scattering into crimson petals
vfx.seek(2.35);
assert.equal(vfx.isHeroUndergroundHidden(), false, 'Heroes must unhide at 2.20s for the Beat 4 pop-up');
assert.ok(vfx.getHeroLevitationOffset('Knight') > -0.5 && vfx.getHeroLevitationOffset('Knight') <= 0.0);
assert.ok(vfx.prismsAndDebrisMesh.count >= 40, 'Beat 4 must scatter matte crimson petals');

// 3. Verify Smite timeline (2.80s total, 240 crimson petals, 0 golden embers)
vfx.triggerSmite({ x: 0, y: 0, z: 0 }, { x: 1.5, y: 0, z: 0 });
assert.equal(vfx.totalDuration, 2.8);
vfx.seek(1.4);
assert.ok(vfx.getCharacterDissolveProgress() > 0.45 && vfx.getCharacterDissolveProgress() < 0.95);
assert.ok(vfx.prismsAndDebrisMesh.count >= 200);
console.log('PASS test-briar-vfx');
```

- [ ] **Step 2: Run `node world/test-briar-vfx.mjs` to verify it fails**

Run: `node world/test-briar-vfx.mjs`
Expected: FAIL (`witcherBriarArch must be baked in blender-flower-data.js`).

- [ ] **Step 3: Implement `build_witcher_briar_arch()` and `build_crimson_flower_slump()` in `world/tools/build-blender-flowers.py` and bake with Headless Blender 5.2**

Add `self.uv = []` to `VolumetricFlowerSculptor` in `world/tools/build-blender-flowers.py` (defaulting `(0.0, 0.0)` for existing meadow flowers, and storing `(u_curve_t, v_part_kind)` for `witcherBriarArch`):
- `build_witcher_briar_arch()` (`<= 680` tris): 3 intertwined helical woody briar stems (`#24130e -> #3d2218`, `v_part_kind = 0.0`) arching from `(r=0, y=0)` to `(r=0.95m, y=1.85m)` with 12 thorny barbs, 14 serrated compound leaves (`#16381c` forest-green and `#4e1620` autumn-burgundy, `v_part_kind = 0.5`), 6 tight crimson rosebuds, and 5 deep spherical-goblet blood-roses (`#4a040e -> #b81428 -> #e11d48`, `v_part_kind = 1.0`).
- `build_crimson_flower_slump()` (`<= 540` tris): low-relief (`y = 0.005..0.145m`, radius `0.95m`) quiet cobblestone pile of 9 fallen goblet blood-roses, 12 autumn-burgundy/forest-green basal leaves, and 24 loose cupped crimson petals resting flat on the ground.
- Run `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python-exit-code 1 -P world/tools/build-blender-flowers.py` to regenerate `world/assets/flowers/blender-flower-data.js` and render the `bx_review` sheet.

- [ ] **Step 4: Upgrade `world/assets/vfx/artorious-vfx.js` to the 4-Beat Briar Jail, Flower Slump & Loose Crimson Petal Engine**

Update `ArtoriousVfxSystem` in `world/assets/vfx/artorious-vfx.js`:
- Import `BLENDER_VOLUMETRIC_FLOWERS` from `../flowers/blender-flower-data.js`.
- Build `monolithsMesh` (`DC 2`, `MAX_MONOLITHS = 24`) from `BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch` (`position`, `normal`, `color`, `uv`), with vertex shader extrusion along `uv.x` (`uCurveT` vs `aMonolithMeta.y = growthProgress`) and downward retraction `world.y -= aMonolithMeta.z` (`submergeDepth`) + fragment `if (vWorldPos.y < vGroundY - 0.01) discard;`.
- Build `groundSigilMesh` (`DC 4`, `MAX_GROUND_SIGILS = 2`) from `BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump` (`position`, `normal`, `color`), shaded with cel-banded vertex colors + dark velvet-umber contour ink (`#24080e`)—zero procedural banana rings, zero stone rubble.
- Implement `_evaluateChannel(t)` (`40` crimson petals including `8` camera-foreground soft-focus petals + slow creeping briar roots `growthProgress = 0.04 + 0.18 * (1 - exp(-t * 0.65))`), `_evaluateBlessingFourBeat(t)` (`2.50s` Beat 1–4 timeline), and `_evaluateSmite(t)` (`2.80s` `Frame 41` upward loose crimson petal dissolve with `kind = 2.0` for all `240` petals).

- [ ] **Step 5: Run `node world/test-briar-vfx.mjs` to verify it passes**

Run: `node world/test-briar-vfx.mjs`
Expected: `PASS test-briar-vfx`

---

### Task 2 (Track B): Sky Eclipse Compression (`Frame 37`), Selective-Crimson B&W Post-Grade (`Frame 41`) & Character Ground-Clip / Dissolve Shaders

**Files:**
- Modify: `world/src/sky-tod.js`
- Modify: `world/src/post.js`
- Modify: `world/assets/characters/toon-skin.js`
- Create: `world/test-eclipse-smite-shaders.mjs`

**Interfaces:**
- Produces in `world/src/sky-tod.js`:
  - `sky.setEclipseState({ weight = 0, compression = 0, windTimeScale = 1.0, dir = null })`
  - `sky.getWindTimeScale()` -> `number` (`1.0` normal, `0.35` Prayer, `0.0` Smite)
  - `sky.state.eclipseWeight`, `sky.state.eclipseCompression`, `sky.state.windTimeScale`
- Produces in `world/src/post.js`:
  - `post.setSmiteMonochrome(weight = 0)` (sets `GradeShader.uniforms.uSmiteMonochrome.value = clamp(weight, 0, 1)`)
- Produces in `world/assets/characters/toon-skin.js`:
  - `setCharacterVerdictShaderState(charRootOrInstance, { groundClipY = -9999, dissolveProgress = 0, dissolveBaseY = 0, monochromeOverride = 0 })`

- [ ] **Step 1: Write the failing test `world/test-eclipse-smite-shaders.mjs`**

```js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTimeOfDaySky } from './src/sky-tod.js';
import {
  createCharacterToonMaterial,
  makeSkinnedOutlineMaterial,
  setCharacterVerdictShaderState,
} from './assets/characters/toon-skin.js';

// 1. Verify Sky Eclipse & WindTimeScale state API
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.2, 900);
camera.position.set(0, 3, 15);
camera.lookAt(0, 2, 0);
camera.updateMatrixWorld();

const sky = createTimeOfDaySky({ quality: 'high', camera });
assert.equal(typeof sky.setEclipseState, 'function');
assert.equal(sky.getWindTimeScale(), 1.0);

sky.setEclipseState({ weight: 1.0, compression: 1.0, windTimeScale: 0.35, camera });
assert.equal(sky.getWindTimeScale(), 0.35);
assert.equal(sky.state.eclipseWeight, 1.0);
assert.equal(sky.state.eclipseCompression, 1.0);

sky.setEclipseState({ weight: 1.0, compression: 1.0, windTimeScale: 0.0, camera });
assert.equal(sky.getWindTimeScale(), 0.0);

// 2. Verify Character Ground-Clip & Upward Dissolve uniforms on Toon & Outline materials
const group = new THREE.Group();
const toonMat = createCharacterToonMaterial(new THREE.MeshBasicMaterial(), { role: 'knight' });
const outlineMat = makeSkinnedOutlineMaterial({ useVertexParams: true });
const skinMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), toonMat);
const outMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), outlineMat);
group.add(skinMesh, outMesh);

setCharacterVerdictShaderState(group, {
  groundClipY: 0.5,
  dissolveProgress: 0.65,
  dissolveBaseY: 0.0,
  monochromeOverride: 1.0,
});

assert.equal(toonMat.userData.verdictUniforms.uGroundClipY.value, 0.5);
assert.equal(toonMat.userData.verdictUniforms.uDissolveProgress.value, 0.65);
assert.equal(toonMat.userData.verdictUniforms.uMonochromeOverride.value, 1.0);
assert.equal(outlineMat.uniforms.uGroundClipY.value, 0.5);
assert.equal(outlineMat.uniforms.uDissolveProgress.value, 0.65);
console.log('PASS test-eclipse-smite-shaders');
```

- [ ] **Step 2: Run `node world/test-eclipse-smite-shaders.mjs` to verify it fails**

Run: `node world/test-eclipse-smite-shaders.mjs`
Expected: FAIL (`sky.setEclipseState is not a function`).

- [ ] **Step 3: Implement `setEclipseState` and Colossal Black-Crimson Eclipse Disc + Cloud Compression in `world/src/sky-tod.js`**

In `world/src/sky-tod.js`:
- Add `uEclipseWeight: { value: 0.0 }`, `uEclipseDir: { value: new THREE.Vector3(0, 0.42, -0.91).normalize() }` to `skyUniforms`, and `uEclipseWeight: { value: 0.0 }`, `uEclipseCompression: { value: 0.0 }`, `uEclipseDir: { value: new THREE.Vector3(0, 0.42, -0.91).normalize() }` to `cloudUniforms`, plus `uEclipsePetalWeight: { value: 0.0 }` to `livingAirUniforms`.
- In `SKY_FRAG`: blend sky gradient toward deep abyssal blue-black (`#050710` zenith, `#120916` mid, `#2b0c18` horizon) by `uEclipseWeight`; render the colossal Black Eclipse Void (`angEclipse = acos(clamp(dot(d, normalize(uEclipseDir)), -1.0, 1.0))`, radius `0.34 rad`, interior `#020103`) and its searing HDR blood-crimson coronal ring (`smoothstep(0.358, 0.336, angEclipse)` + exponential crimson glow `#e11d48 -> #7f1022`).
- In `CLOUD_VERT` & `CLOUD_FRAG`: compress cloud vertices downward (`pos.y *= mix(1.0, 0.48, uEclipseCompression); worldPos.y -= uEclipseCompression * 14.5;`) and grade cloud colors to charcoal-obsidian underside (`#141018`) + blood-crimson backlit crown (`#d91b32`) when `uEclipseWeight > 0.001`.
- In `livingAirPetalsMesh` fragment shader: when `uEclipsePetalWeight > 0.001`, shift sakura/wisteria petals and motes to deep velvet blood-crimson (`#881327 -> #e11d48`).

- [ ] **Step 4: Implement `setSmiteMonochrome` Selective-Crimson B&W Grade in `world/src/post.js` and Verdict Uniforms in `world/assets/characters/toon-skin.js`**

- In `world/src/post.js`: add `uSmiteMonochrome: { value: 0.0 }` to `GradeShader.uniforms` and `setSmiteMonochrome(weight)` on the returned post controller. In `GradeShader.fragmentShader` (after Step 7 Haze, before Step 8 Vignette), when `uSmiteMonochrome > 0.001`, compute `float crimsonMask = smoothstep(0.16, 0.34, c.r - max(c.g * 2.35, c.b * 1.65)) * step(0.18, c.r);`, compute neutral high-contrast monochrome `vec3 bw = vec3(pow(clamp(lumaLin(c), 0.0, 1.0), 1.08));`, and `c = mix(c, mix(bw, c * vec3(1.12, 0.88, 0.90), crimsonMask), uSmiteMonochrome);`.
- In `world/assets/characters/toon-skin.js`: add `verdictUniforms` (`uGroundClipY = -9999`, `uDissolveProgress = 0`, `uDissolveBaseY = 0`, `uMonochromeOverride = 0`) to `createCharacterToonMaterial` (via `onBeforeCompile` world-position varying `vVerdictWorldPos`) and `makeSkinnedOutlineMaterial`, discarding any fragment with `vVerdictWorldPos.y < uGroundClipY` or `erodeVal < uDissolveProgress`, tinting the `0.08` dissolve rim `#e11d48`, and desaturating character albedo when `uMonochromeOverride > 0.5`. Export `setCharacterVerdictShaderState(rootOrChar, state)`.

- [ ] **Step 5: Run `node world/test-eclipse-smite-shaders.mjs` to verify it passes**

Run: `node world/test-eclipse-smite-shaders.mjs`
Expected: `PASS test-eclipse-smite-shaders`

---

### Task 3 (Track C): Foolproof Hybrid Mic Input (`Hold >= 1.5s` / `Tap < 1.5s` + `2.2s` Silence Auto-Send + `< 2` Words Safe Cancel) & `6.5m` Airborne Enemy Throw

**Files:**
- Modify: `world/src/combat/commune-client.js`
- Modify: `world/src/combat/enemy-manager.js`
- Create: `world/test-commune-vad-throw.mjs`

**Interfaces:**
- Produces in `world/src/combat/commune-client.js`:
  - `communeClient.beginPress(options)` — starts `listening` if `idle`; if already `listening` in `hands_free` mode, immediately triggers `stopAndSendOrCancel()`.
  - `communeClient.endPress(options)` — if `elapsed >= 1.50s` (`HOLD_SEND_THRESHOLD_SECONDS = 1.5`), immediately calls `stopAndSendOrCancel()`; if `elapsed < 1.50s`, switches input mode to `'hands_free'` and keeps listening until a second tap, `2.2s` of silence after detected speech (`SILENCE_AUTO_SEND_SECONDS = 2.2`), or `30.0s` max timeout.
  - `communeClient.reportVoiceActivity({ rms, wordCount, transcriptHint })` — updates `hasSpokenWords`, `spokenDurationSeconds`, and `silenceAfterSpeechSeconds`.
  - Safe Cancel Rule: inside `stopAndSendCommune()`, if `wordCount < 2` (when `transcriptHint` is present or returned by `/api/commune` with `safeCancel: true` or transcript `< 2` words, or when no audio/speech was recorded `< 0.35s` voiced RMS and no `transcriptHint` / `audioBase64` with `>= 2` words was supplied), calls `cancelCommune({ reason: 'empty_or_accidental_tap' })`, invokes `onCancel?.({ reason: 'empty_or_accidental_tap' })`, and **never** triggers a Smite verdict!
- Produces in `world/src/combat/enemy-manager.js`:
  - `enemyManager.applyPrayerAirborneThrow(centerPos, throwRadius = 6.5)` -> `{ thrownCount: number, enemies: Array }` (launches all living enemies within `6.5m` off their feet with `vy = 8.8..12.2`, outward radial `vx/vz = 11.5`, `grounded = false`, `knockdownTimer = 2.4`, `slowTimer = 3.0`, `slowFactor = 0.85`, `char.mixer.timeScale = 0.15`, `aiState = 'orbit'`, `windupTimer = 0`, dealing `0` damage).

- [ ] **Step 1: Write the failing test `world/test-commune-vad-throw.mjs`**

```js
import assert from 'node:assert/strict';
import { createCommuneClient } from './src/combat/commune-client.js';

// 1. Test Hold >= 1.5s sends on release, while Tap < 1.5s stays in hands-free mode
let cancelledReason = null;
let verdicts = [];
const client = createCommuneClient({
  useWallClockTimeout: false,
  fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    return {
       async json() {
        return { ok: true, verdict: 'blessing', transcript: body.transcriptHint };
      },
    };
  },
  onCancel: (info) => {
    cancelledReason = info.reason;
  },
  onVerdict: (j) => {
    verdicts.push(j);
  },
});

// Case A: Accidental empty tap (< 1.5s press, then second tap with < 2 words) -> Safe Cancel, 0 Smite!
await client.beginPress({ speakerRole: 'Knight', useWallClockTimeout: false });
client.update(0.4); // 0.4s < 1.5s
await client.endPress();
assert.equal(client.getState().state, 'listening', 'Tap < 1.5s must remain in hands-free listening mode');
assert.equal(client.getState().inputMode, 'hands_free');

// Tap again with 0 words spoken -> must safe-cancel with zero verdict
const cancelRes = await client.beginPress();
assert.equal(cancelRes.cancelled, true);
assert.equal(cancelledReason, 'empty_or_accidental_tap');
assert.equal(verdicts.length, 0);

// Case B: Tap < 1.5s + speech (>= 2 words) + 2.2s silence -> auto-sends!
await client.beginPress({
  speakerRole: 'Knight',
  transcriptHint: 'I offer my life for my beloved mage',
  useWallClockTimeout: false,
});
client.update(0.5);
await client.endPress();
client.reportVoiceActivity({ rms: 0.18, dt: 0.6 });
client.reportVoiceActivity({ rms: 0.002, dt: 2.25 }); // > 2.2s silence after speech
await new Promise((r) => setTimeout(r, 20));
assert.equal(verdicts.length, 1);
assert.equal(verdicts[0].verdict, 'blessing');

// Case C: Hold >= 1.5s with valid speech -> sends immediately on endPress()
await client.beginPress({
  speakerRole: 'Mage',
  transcriptHint: 'Protect our bond under the crimson rose',
  useWallClockTimeout: false,
});
client.reportVoiceActivity({ rms: 0.2, dt: 1.6 });
client.update(1.6);
await client.endPress();
assert.equal(verdicts.length, 2);
console.log('PASS test-commune-vad-throw');
```

- [ ] **Step 2: Run `node world/test-commune-vad-throw.mjs` to verify it fails**

Run: `node world/test-commune-vad-throw.mjs`
Expected: FAIL (`client.beginPress is not a function`).

- [ ] **Step 3: Implement `beginPress`, `endPress`, `reportVoiceActivity` (WebAudio `AnalyserNode` RMS + `2.2s` silence auto-send) and `< 2` words Safe Cancel in `world/src/combat/commune-client.js`**

In `world/src/combat/commune-client.js`:
- Add `HOLD_SEND_THRESHOLD_SECONDS = 1.5`, `SILENCE_AUTO_SEND_SECONDS = 2.2`, `MIN_VOICED_SECONDS = 0.35`, and `MIN_SAFE_WORD_COUNT = 2`.
- Track `inputMode` (`'hold_check' | 'hands_free'`), `voicedSeconds`, `silenceAfterSpeechSeconds`, and wire an `AnalyserNode` when `activeStream` is acquired so live microphone RMS is sampled every `update(dt)`.
- Implement `beginPress(options)` and `endPress(options)` plus `< 2` words safe cancel (`onCancel` callback) so accidental empty taps cancel cleanly without calling `/api/commune` or triggering Smite, and if `/api/commune` returns a transcript with `< 2` words, it also invokes `onCancel` instead of `onVerdict`.

- [ ] **Step 4: Implement `applyPrayerAirborneThrow(centerPos, throwRadius = 6.5)` in `world/src/combat/enemy-manager.js`**

In `world/src/combat/enemy-manager.js`:
- Add `applyPrayerAirborneThrow(centerPos, throwRadius = 6.5)` (and alias `applySacredWardPushback` to call it on Prayer start while keeping gentle perimeter ward pushback for enemies outside `6.5m` trying to walk in).
- For every living enemy within `6.5m` of `centerPos`:
  - `enemy.hp` is untouched (`0` damage).
  - Cancel any active windup (`enemy.aiState = 'orbit'`, `enemy.windupTimer = 0`, `enemy.telegraphProgress = 0`, `enemy.hasAttackToken = false`).
  - Set `enemy.vy = 8.8 + (1.0 - dist / throwRadius) * 3.4`, `enemy.grounded = false`, `enemy.vx = nx * 11.5`, `enemy.vz = nz * 11.5`, `enemy.stunTimer = Math.max(enemy.stunTimer, 2.6)`, `enemy.slowTimer = Math.max(enemy.slowTimer, 3.0)`, `enemy.slowFactor = 0.85`, `enemy.knockdownTimer = 2.4`.
  - Play `'Hit_B'` with `timeScale: 0.15, force: true` and keep `enemy.char.mixer.timeScale = 0.15` while `!enemy.grounded` in `enemyManager.update(dt)` so thrown skeletons hang in slow-motion arcs matching `Frame 37`.

- [ ] **Step 5: Run `node world/test-commune-vad-throw.mjs` to verify it passes**

Run: `node world/test-commune-vad-throw.mjs`
Expected: `PASS test-commune-vad-throw`

---

### Task 4 (Track D): Divine Verdict State Machine (`4.0m` Circle Rule, `2.5s` Underground Resurrection, `30s` `<= 5.0m` Tether, `2.8s` Smite) & Live World Integration

**Files:**
- Modify: `world/src/combat/combat-balance.js`
- Modify: `world/src/combat/campaign-loop.js`
- Modify: `world/src/player-controller.js`
- Modify: `world/src/main.js`
- Create: `world/test-divine-verdict-sim.mjs`

**Interfaces:**
- Produces in `world/src/combat/combat-balance.js`:
  - `COMMUNE_MAX_DISTANCE = 4.0`
  - `COMMUNE_COMBAT_HP_THRESHOLD = 0.35`
  - `DIVINE_BLESSING_DURATION = 30.0`
  - `DIVINE_BLESSING_TETHER_DISTANCE = 5.0`
  - `DIVINE_BLESSING_DMG_MULT = 2.0`
  - `DIVINE_BLESSING_Q_CD_MULT = 1 / 3` (`24.0s -> 8.0s`)
  - `DIVINE_BLESSING_E_CD_MULT = 0.5` (`8.5s -> 4.25s` Mage `E`; `5.0s -> 2.5s` downtime / `15.5s` total CD Knight `E`)
- Produces in `world/src/combat/campaign-loop.js`:
  - `campaignLoop.canCommuneTogether(heroStates)` -> `{ allowed: boolean, reason: string | null, distance: number, maxDist: 4.0, inCombat: boolean, anyDowned: boolean, anyLowHp: boolean }`
  - `campaignLoop.isControlLocked()` -> `boolean` (`true` during Prayer channel, `2.5s` Blessing sequence, or `2.8s` Smite sequence)
  - `campaignLoop.isDivineBlessingActive()` -> `boolean`
  - `campaignLoop.verdictSequence`: `{ active, kind ('blessing' | 'smite'), elapsed, duration, beat }`

- [ ] **Step 1: Write the failing test `world/test-divine-verdict-sim.mjs` covering all gameplay rules and Review Focus edge cases**

```js
import assert from 'node:assert/strict';
import { createCampaignLoop } from './src/combat/campaign-loop.js';
import { HERO_STATS } from './src/combat/combat-balance.js';

const mockEnemies = [];
const enemyManager = {
  get activeEnemies() { return mockEnemies; },
  get spawnQueue() { return []; },
  setCurrentActId() {},
  clearAllEnemies() { mockEnemies.length = 0; },
  applyAreaOrLineHit() {
    throw new Error('Prayer/Blessing must deal ZERO direct damage to enemies!');
  },
  applyPrayerAirborneThrow() { return { thrownCount: mockEnemies.length }; },
  update() {},
};

const loop = createCampaignLoop({ enemyManager });
const heroStates = {
  Knight: { id: 'Knight', x: 0, y: 0, z: 0, yaw: 0 },
  Mage: { id: 'Mage', x: 4.5, y: 0, z: 0, yaw: 0 },
};

// 1. Strict 4.0m Circle Rule: 4.5m apart must be rejected
assert.equal(loop.canCommuneTogether(heroStates).allowed, false);
assert.equal(loop.canCommuneTogether(heroStates).reason, 'too_far');

// Move within 3.2m (<= 4.0m): allowed out of combat even at 100% HP
heroStates.Mage.x = 3.2;
assert.equal(loop.canCommuneTogether(heroStates).allowed, true);

// 2. Combat Eligibility Rule: in combat at 100% HP -> rejected; at < 35% HP or Downed -> allowed
mockEnemies.push({ id: 'e1', x: 4, z: 0, hp: 100, maxHp: 100, dead: false, active: true });
assert.equal(loop.canCommuneTogether(heroStates).allowed, false);
assert.equal(loop.canCommuneTogether(heroStates).reason, 'combat_hp_too_high');

loop.combatHeroes.Mage.hp = 28; // 28 / 90 = 31.1% (< 35%)
assert.equal(loop.canCommuneTogether(heroStates).allowed, true);

// 3. Phase 2A: 2.5s Blessing/Resurrection sequence (0 direct enemy damage, smooth underground HP fill)
loop.combatHeroes.Mage.hp = 0;
loop.combatHeroes.Mage.downed = true;
loop.combatHeroes.Knight.hp = 70;
loop.applyCommuneVerdict({ verdict: 'blessing' }, 'Knight', heroStates);

assert.equal(loop.isControlLocked(), true, 'Controls must be locked during the 2.5s Blessing cinematic');
loop.update(0.5, { heroStates, soloWingmanActive: false }); // Beat 2 (0.50s)
assert.ok(loop.combatHeroes.Knight.hp === 70, 'HP fill starts in Beat 3 (0.70s..2.20s)');

loop.update(0.95, { heroStates, soloWingmanActive: false }); // Beat 3 mid (1.45s = 50% through 0.70..2.20s)
assert.equal(loop.combatHeroes.Mage.downed, false, 'Dead partner must be revived underground during Beat 3');
assert.ok(loop.combatHeroes.Knight.hp > 130 && loop.combatHeroes.Knight.hp < 220, 'HP must smoothly fill during Beat 3');
assert.ok(loop.combatHeroes.Mage.hp > 35 && loop.combatHeroes.Mage.hp < 90);

loop.update(1.10, { heroStates, soloWingmanActive: false }); // 2.55s -> Blessing cinematic complete!
assert.equal(loop.isControlLocked(), false, 'Controls must unlock after 2.50s');
assert.equal(loop.combatHeroes.Knight.hp, HERO_STATS.Knight.maxHp);
assert.equal(loop.combatHeroes.Mage.hp, HERO_STATS.Mage.maxHp);
assert.equal(loop.isDivineBlessingActive(), true);

// 4. Phase 2B: 30s Proximity Blessing (<= 5.0m Tether: 100% Invincibility, 2x DMG, 1/3 Q CD, 1/2 E CD)
const hitWhileBlessed = loop.handlePlayerHit({ id: 'Mage' }, mockEnemies[0], 85);
assert.equal(hitWhileBlessed.hpLost, 0, 'Must take 0 damage (100% invincible) while Blessing tether <= 5.0m');
assert.equal(loop.combatHeroes.Mage.hp, 90);

// Break enemyManager.applyAreaOrLineHit guard to allow player E/Q skills to test cooldowns
enemyManager.applyAreaOrLineHit = () => [];
const mageERes = loop.performPartnerSkill('Mage', heroStates);
assert.equal(mageERes.cooldown, 4.25, 'Mage E cooldown must be halved (8.5s -> 4.25s) during Blessing');
const knightERes = loop.performPartnerSkill('Knight', heroStates);
assert.equal(knightERes.downtime, 2.5, 'Knight E downtime must be halved (5.0s -> 2.5s, total CD 15.5s) during Blessing');
const knightQRes = loop.performKnightUltimate(heroStates);
assert.equal(knightQRes.cooldown, 8.0, 'Knight Q cooldown must be 1/3 (24s -> 8.0s) during Blessing');

// Hard Separation Rule: moving > 5.0m apart immediately breaks the 30s Blessing!
heroStates.Mage.x = 5.05;
loop.update(0.016, { heroStates, soloWingmanActive: false });
assert.equal(loop.isDivineBlessingActive(), false, 'Blessing must break immediately when distance > 5.0m');

// 5. Phase 2C: Smite when both alive -> Partner dies (0 HP / downed), Speaker drops to 10% Max HP (22 HP Knight)
heroStates.Mage.x = 2.0;
loop.applyCommuneVerdict({ verdict: 'smite' }, 'Knight', heroStates);
assert.equal(loop.isControlLocked(), true, 'Controls must lock for 2.8s during Smite');
assert.equal(loop.combatHeroes.Mage.hp, 0);
assert.equal(loop.combatHeroes.Mage.downed, true);
assert.equal(loop.combatHeroes.Knight.hp, 22, 'Knight speaker must drop to 10% Max HP (22 HP)');

// 6. Phase 2C: Smite when Partner is ALREADY dead -> Speaker dies -> Total Party Wipe!
loop.update(2.85, { heroStates, soloWingmanActive: false });
loop.applyCommuneVerdict({ verdict: 'smite' }, 'Knight', heroStates);
assert.equal(loop.combatHeroes.Knight.hp, 0);
assert.equal(loop.combatHeroes.Knight.downed, true);
assert.equal(loop.combatHeroes.Mage.downed, true);
console.log('PASS test-divine-verdict-sim');
```

- [ ] **Step 2: Run `node world/test-divine-verdict-sim.mjs` to verify it fails**

Run: `node world/test-divine-verdict-sim.mjs`
Expected: FAIL (`assert.equal(loop.canCommuneTogether(heroStates).allowed, false)`).

- [ ] **Step 3: Implement the Verdict State Machine, 4-Beat Underground Heal, 30s `<= 5.0m` Tether, and Smite Rules in `world/src/combat/combat-balance.js` & `world/src/combat/campaign-loop.js`**

- In `world/src/combat/combat-balance.js`: set `COMMUNE_MAX_DISTANCE = 4.0`, `POWERUP_TETHER_DISTANCE = 5.0`, and export the Blessing constants.
- In `world/src/combat/campaign-loop.js`:
  - Update `canCommuneTogether(heroStates)` to enforce `dist <= 4.0` and (when `enemyManager.activeEnemies.length > 0`) `anyDowned || knightHpRatio < 0.35 || mageHpRatio < 0.35`.
  - Remove all direct enemy damage from `applyCommuneVerdict` (`heal`, `blessing`, `miracle` all route into the unified `2.50s` `verdictSequence` with zero `applyAreaOrLineHit` calls).
  - During `verdictSequence` (`kind === 'blessing'`, `duration = 2.50s`):
    - `0.00s -> 0.70s`: record `startKnightHp`, `startMageHp`.
    - `0.70s -> 2.20s` (Beat 3, underground): revive any downed hero (`downed = false`), smoothly reposition both heroes side-by-side (`1.35m` apart around midpoint `(cx, cz)`), and linearly interpolate `Knight.hp` and `Mage.hp` to `100% Max HP` (`u = (elapsed - 0.70) / 1.50`).
    - `2.20s -> 2.50s` (Beat 4): both heroes are at `100% Max HP`, activate `divineBlessingTimer = 30.0`, `divineBlessingActive = true`, `partnerSwordMult = 2.0`, `partnerMagicMult = 2.0`, and unlock controls at `2.50s`.
  - Every frame while `divineBlessingActive`: check `getPartnerDistance(knight, mage) <= 5.0`. If `> 5.0`, immediately break `divineBlessingActive = false`, `divineBlessingTimer = 0`, `partnerSwordMult = 1.0`, `partnerMagicMult = 1.0`. While active and `<= 5.0m`: `handlePlayerHit` returns `0` damage (`invincible: true`), `performKnightUltimate` / `performMageStormCataclysm` use `8.0s` cooldown (`24.0 / 3`), `performPartnerSkill('Mage')` uses `4.25s` cooldown (`8.5 / 2`), and `performPartnerSkill('Knight')` uses `15.5s` total cooldown (`13.0s` active + `2.5s` downtime).
  - For `verdict === 'smite'` (`duration = 2.80s`): if `partnerHero.downed` was already `true` when Smite triggered, set `speakerHero.hp = 0`, `speakerHero.downed = true` (triggering the `bothDownedTimer` Sanctuary Stone respawn at `2.80s`); otherwise set `partnerHero.hp = 0`, `partnerHero.downed = true` and `speakerHero.hp = Math.max(1, Math.round(speakerHero.maxHp * 0.10))` (`22 HP` Knight / `9 HP` Mage).

- [ ] **Step 4: Wire Control Lockout, Hybrid Mic Input, `windElapsed`, Shadow Suppression, and Character Shaders in `world/src/player-controller.js` & `world/src/main.js`**

- In `world/src/player-controller.js`:
  - In `startCommuneChannel`: check `campaignLoop.canCommuneTogether(heroStates)` first; if `!allowed`, emit diegetic banner and return `{ allowed: false, reason }`. When allowed, lock controls, call `enemyManager.applyPrayerAirborneThrow({ x: cx, z: cz }, 6.5)`, and notify `onPrayerAtmosphereChanged?.({ phase: 'prayer' })`.
  - In `triggerAction`, `triggerSpell`, `swapActiveHero`, and `update` locomotion: block all player movement/actions while `campaignLoop.isControlLocked()` is `true`.
  - In `update(dt)`: sync `knightChar.group.visible` and `mageChar.group.visible` with `!vfxKit.artoriousVfx.isHeroUndergroundHidden()`, sync `setCharacterVerdictShaderState()` on both characters (`groundClipY = walkableHeightAt(x, z) - 0.02` during Beat 2/4, `dissolveProgress` on the dissolving victim during Smite, and `monochromeOverride = 1.0` on the surviving speaker during Smite), and tighten Solo Wingman follow distance to `1.45m` while `campaignLoop.isDivineBlessingActive()` is true.
- In `world/src/main.js`:
  - Wire `R` keydown/keyup and `communeRBtn` / `sculptedHud` / `touchHud` to `communeClient.beginPress()` and `communeClient.endPress()`, and wire `communeClient.onCancel` to `coopSystem.cancelCommuneChannel()`.
  - Integrate `windElapsed += dt * sky.getWindTimeScale()` and pass `windElapsed` to `terrainKit.update`, `updateMeadowFocus`, and `sky.update`.
  - In `syncCharacterGroundShadows()`: fade `uCharShadows` slot weight to `0.0` when `kGrp.position.y < walkableHeightAt(x, z) - 0.15` or `!kGrp.visible`.
  - Add deterministic verification shots `'09-divine-prayer-eclipse-throw'` (`Frame 37`), `'10-divine-briar-jail-lattice'` (`Frame 57`), `'11-divine-underground-flower-slump'` (Beat 3), and `'12-divine-smite-bw-petal-dissolve'` (`Frame 41`) to `STAGE5_GAMEPLAY_SHOTS`.

- [ ] **Step 5: Run all unit & simulation tests to verify they pass**

Run: `node world/test-divine-verdict-sim.mjs && node world/test-briar-vfx.mjs && node world/test-eclipse-smite-shaders.mjs && node world/test-commune-vad-throw.mjs`
Expected: All 4 test suites print `PASS`.

---

### Task 5 (Track E): Independent 3D Scene & Live Gameplay Video QA Judgment (`judging-3d-scenes` + `judging-gameplay`)

**Files:**
- Create: `qa-review/divine-verdict/run-divine-verdict-qa.mjs`

**Interfaces:**
- Consumes: `window.__WORLD__` live runtime in headless Chromium/Playwright (`setGameplayShot`, `coopSystem`, `communeClient`, `sky`, `post`).
- Produces:
  - 4 high-resolution (`1600x900`) multi-angle still captures matching `Frame 37`, `Frame 57`, `Beat 3 Slump`, and `Frame 41` (`qa-review/divine-verdict/shot-*.png`).
  - 2 native `.webm` motion video recordings (`qa-review/divine-verdict/clip-blessing-resurrection.webm` and `qa-review/divine-verdict/clip-smite-dissolve.webm`) with debug overlay `[Phase/Beat] | [WindScale/Dist] | [Knight HP / Mage HP]`.
  - Independent `judging-3d-scenes` + `judging-gameplay` critique report (`qa-review/divine-verdict/qa-report.md`).

- [ ] **Step 1: Run the QA harness to record still shots and live `.webm` motion clips of both Blessing/Resurrection (`2.5s`) and Smite (`2.8s`)**

Run: `node qa-review/divine-verdict/run-divine-verdict-qa.mjs`
Expected: Writes `shot-37-prayer-throw.png`, `shot-57-briar-jail.png`, `shot-beat3-flower-slump.png`, `shot-41-smite-bw-dissolve.png`, `clip-blessing-resurrection.webm`, and `clip-smite-dissolve.webm`.

- [ ] **Step 2: Inspect all rendered images and watch `.webm` videos natively with `view_file` -> `google:load_video` (`5–8 FPS` macro, `10–12 FPS` beat transitions)**

Verify against `Frame 37`, `Frame 57`, and `Frame 41`:
1. Colossal black Eclipse disc + crimson corona compresses clouds downward (`Frame 37`), skeletons fly through the air in `0.15x` slow-mo, foreground + world crimson petals drift slowly.
2. Dense *Witcher 3* Iris Manor braided wild-rose briar lattice completely encloses both characters (`Frame 57`, zero concrete rubble, zero glass), yanks them underground in `0.25s`, vanishes completely leaving ONLY the quiet crimson flower slump on the cobblestones for `1.5s` (zero character ground shadows visible!) while HP bars fill smoothly to `100%`, and pops both heroes cleanly back up side-by-side at `2.20s..2.50s`.
3. Smite freezes all valley wind dead (`0.0x`), drains houses/trees/survivor to stark B&W while keeping ONLY blood-crimson petals and the Eclipse corona saturated (`Frame 41`), and dissolves the victim upward into loose crimson petals.
