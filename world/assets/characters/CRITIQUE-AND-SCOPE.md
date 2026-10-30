# Stage 3 Pass 2 — Blind Critique & Verification Scope (`world/assets/characters/`)

## 1. Executive Verdict & Pass 1 Scores

- **Verdict:** **Changes Needed** (Blocked on hardware draw-call budget + major weapon socket alignment & toon outline/self-shadowing defects).
- **Judged Stage:** Stage 3 Pass 1 — Characters & Native Skeletal Motion (`KayKit Adventurers` + `KayKit Skeletons` + `Rig_Medium_*` native skeletal clips).
- **Most Consequential Finding:** Each equipped character with outlines consumes **20 draw calls** (`40` draw calls for just 2 heroes in [`hero-duo-knight-mage.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/hero-duo-knight-mage.png), `94` draw calls for 5 heroes in [`adventurer-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/adventurer-lineup.png), and `82` draw calls for 4 skeletons in [`skeleton-enemies.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/skeleton-enemies.png)). Because the Xiaomi Pad 7 (`tablet` profile) has a total scene budget of `<= 48` draw calls and Stage 2 environment assets already use `41` draw calls, unmerged multi-mesh characters blow the hardware budget immediately. Additionally, several weapons have broken local grip orientations (`Skeleton_Axe.gltf` is mounted sideways inside the forearm, `Knight` idle sword plunges underground, `Barbarian` 2H axe clips through his off-hand, `Rogue` daggers have mismatched grip offsets), and hard-edged normal extrusion + self-shadowing create visible facial/helmet artifacts.

### Pass 1 Blind Scores (`/10` per `judging-3d-scenes`)

| Dimension | Pass 1 Score | Cap / Rationale |
|---|---:|---|
| **Structure** | **5 / 10** | **Capped at 6 (Major):** Character proportions and silhouette hierarchy match KayKit rigs, but weapon attachment transforms (`Skeleton_Axe`, `Knight` sword in `idle`, `Mage` open spellbook in `sprint`/`pray_channel`, `Rogue` daggers) cause severe mesh penetration into limbs, torso, or the ground plane, and frame edges clip weapon tips in [`hero-duo-knight-mage.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/hero-duo-knight-mage.png) and [`skeleton-enemies.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/skeleton-enemies.png). |
| **Function** | **3 / 10** | **Capped at 4 (Blocker):** `40` draw calls for 2 heroes (`20` draws/character) violates the Xiaomi Pad 7 `<= 48` total draw-call budget ([`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md)). Native skeletal animations (`95` clips across 5 `Rig_Medium_*` packs, `26` semantic keys) load and deform properly, but the per-part mesh explosion blocks game integration. |
| **Intent** | **8 / 10** | Uses 100% genuine KayKit Adventurers (`Knight`, `Mage`, `Barbarian`, `Rogue`, `Rogue_Hooded`) and KayKit Skeletons (`Skeleton_Warrior`, `Skeleton_Mage`, `Skeleton_Rogue`, `Skeleton_Minion`) with real `Rig_Medium_*` skeletal animations and zero procedural bone-wiggling. |
| **Finish** | **5 / 10** | **Capped at 6 (Major):** Compared against [`ref-target-trees.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-target-trees.png), Pass 1 exhibits harsh polygon-facet self-shadow banding on the back of the Knight's helmet and Mage's hat ([`back-and-silhouette.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/back-and-silhouette.png)), a white/grey halo ring around the Mage's black hair bun, thin dark stray outline lines across the Mage's mouth and Knight's cheek ([`hero-duo-knight-mage.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/hero-duo-knight-mage.png)), and split-normal outline gaps on sharp edges (shields, spellbook corners, skeleton jaws). |
| **Overall (Lowest)** | **3 / 10** | **Blocked (`Function = 3/10`)** — requires Pass 2 architectural draw-call consolidation and visual/socket fixes. |

---

## 2. Blind Visual Inventory of Pass 1 Evidence

1. **[`hero-duo-knight-mage.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/hero-duo-knight-mage.png):**
   - Shows the core co-op duo (`Knight` on left in `Idle_Combat`, `Mage` on right in `cast_spell` / `Spellcasting`) on a cel-shaded green circular stage.
   - The Knight's `sword_1handed.gltf` blade tip is clipped off by the left edge of the viewport.
   - Faint dark line artifacts appear across the Mage's lower face (mouth area) and near the Knight's right cheek under the helmet visor.
2. **[`adventurer-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/adventurer-lineup.png):**
   - Shows all 5 playable heroes (`Knight`, `Mage`, `Barbarian`, `Rogue`, `Rogue_Hooded`) in a horizontal arc.
   - On the far-left `Knight` (`idle`), the sword blade points downward and penetrates straight through the ground floor (`y = 0`), making the sword look like a broken stub.
   - On the center `Barbarian` (`combo1`), the 2-handed axe (`axe_2handed.gltf`) is held one-handed in `handSlot.r` while its shaft slices directly through his empty left hand/wrist.
   - On `Rogue` (`dash`) and `Rogue_Hooded` (`cheer`), the dual daggers (`dagger.gltf`) sit too deep inside the fists (crossguards buried in the hand mesh) and have inconsistent blade directions.
3. **[`skeleton-enemies.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/skeleton-enemies.png):**
   - Shows 4 skeleton enemies (`Skeleton_Warrior`, `Skeleton_Mage`, `Skeleton_Rogue`, `Skeleton_Minion`).
   - On `Skeleton_Minion` (far right), `Skeleton_Axe.gltf` has a severely broken local rotation/offset: the stone axe head is sideways/embedded directly into the right wrist like a katar, while the wooden shaft is buried up inside the forearm bone.
   - On `Skeleton_Mage` (2nd from left), `Skeleton_Staff.gltf` angles inward so the lower shaft intersects the skeleton's right leg/robe.
   - On `Skeleton_Warrior` (far left), the blade tip of `Skeleton_Blade.gltf` is cut off by the left border of the image, and a dark outline artifact pokes through the left ribcage under the red scarf.
4. **[`action-poses-sheet.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/action-poses-sheet.png):**
   - Shows 4 combat/invocation poses (`Knight` `combo1`, `Knight` `charged`, `Mage` `pray_channel`, `Mage` `sprint`).
   - On the far-left `Knight` (`combo1`), the sword blade is clipped by the left viewport edge.
   - On the far-right `Mage` (`sprint`), `spellbook_open.gltf` in `handSlot.l` is completely swallowed inside her torso/coat, and the top of `staff.gltf` is clipped at the right viewport edge.
5. **[`back-and-silhouette.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/back-and-silhouette.png) vs. [`ref-target-trees.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-target-trees.png):**
   - Shows the 3rd-person rear camera view of `Mage` (left) and `Knight` (right).
   - Unlike the clean, smooth cel-shaded Knight in [`ref-target-trees.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-target-trees.png), the back of the Knight's helmet and the Mage's purple hat show harsh low-poly facet bands and jagged self-shadow stair-stepping.
   - The Mage's dark hair bun under the rear hat brim has a pale grey/white ring around a pitch-black center.

---

## 3. Ranked Findings & Repair Handoff

### `[CHAR-01]` BLOCKER — Unmerged Sub-Meshes, Accessories & Outlines Blow the Tablet Draw-Call Budget
- **Severity & Location:** **Blocker** | `world/assets/characters/` (`index.js`, `toon-skin.js`) | Evidence: [`shots/pass1/report.json`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/report.json).
- **Observed Defect:** Every KayKit character consists of 6–9 separate skinned sub-meshes (`Body`, `Head`, `ArmLeft`, `ArmRight`, `LegLeft`, `LegRight`, etc.) plus rigid bone-parented accessories (`Helmet`, `Hat`, `Cape`, `Hood`, etc.) and equipped weapons, each with its own separate inverted-hull outline mesh. As recorded in [`report.json`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/report.json), just 2 heroes (`hero-duo-knight-mage`) require **40 draw calls**, 5 heroes (`adventurer-lineup`) require **94 draw calls**, and 4 skeletons (`skeleton-enemies`) require **82 draw calls**.
- **Correction Target:** Implement a **Unified SkinnedMesh + Bone-Weighted Accessory/Weapon Merger**:
  1. Transform all character skinned sub-meshes AND rigid bone-attached accessories (and bone-socketed weapons that share the character's atlas or can be combined into a single character/weapon draw call) into the root skeleton bind space, assigning rigid vertices `skinIndex = [boneIndex, 0, 0, 0]` and `skinWeight = [1, 0, 0, 0]`.
  2. Merge all character + accessory (+ same-atlas weapon) geometries into **1 single `SkinnedMesh` + 1 single outline `SkinnedMesh` per character** (or `<= 3` draw calls per character if a weapon uses a separate material).
  3. Support dynamic `equipWeapon` / weapon updates by rebuilding or updating the merged skin/socket cleanly so `hero-duo-knight-mage` uses **`<= 6` asset draw calls**, `adventurer-lineup` uses **`<= 15` asset draw calls**, and `skeleton-enemies` uses **`<= 12` asset draw calls**.
- **Recheck:** Verify in `shots/pass2/report.json` and `verify.mjs` that `hero-duo-knight-mage.drawCalls <= 6`, `adventurer-lineup.drawCalls <= 15`, and `skeleton-enemies.drawCalls <= 12` while skeletal animations deform identically.

### `[CHAR-02]` MAJOR — Broken Weapon Socket Rotations & Grip Offsets (`Skeleton_Axe`, `Knight` Sword, `Mage` Spellbook, `Barbarian` Axe, `Rogue` Daggers)
- **Severity & Location:** **Major** | `world/assets/characters/index.js` | Evidence: [`adventurer-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/adventurer-lineup.png), [`skeleton-enemies.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/skeleton-enemies.png), [`action-poses-sheet.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/action-poses-sheet.png).
- **Observed Defect:**
  1. `Skeleton_Axe.gltf` on `Skeleton_Minion` ([`skeleton-enemies.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/skeleton-enemies.png), far right) is rotated so the blade is embedded sideways in the wrist and the handle goes up inside the forearm.
  2. `sword_1handed.gltf` on `Knight` in `idle` ([`adventurer-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/adventurer-lineup.png), far left) angles downward through the `y = 0` ground plane, cutting off the blade.
  3. `spellbook_open.gltf` on `Mage` (`handSlot.l`) intersects the torso during `sprint` ([`action-poses-sheet.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/action-poses-sheet.png), far right) and is held sideways with the hand clipping the spine in `pray_channel`.
  4. `dagger.gltf` on `Rogue` and `Rogue_Hooded` ([`adventurer-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/adventurer-lineup.png)) has its crossguard buried inside the hand mesh, and `Barbarian`'s `axe_2handed.gltf` slices through his off-hand in `combo1`.
  5. `Skeleton_Staff.gltf` on `Skeleton_Mage` ([`skeleton-enemies.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/skeleton-enemies.png)) clips through the skeleton's right leg/robe.
- **Correction Target:** Audit the native local axes of every KayKit weapon GLTF (`sword_1handed`, `shield_badge`, `staff`, `spellbook_open`, `axe_2handed`, `dagger`, `Skeleton_Blade`, `Skeleton_Shield_Large_A`, `Skeleton_Staff`, `Skeleton_Dagger`, `Skeleton_Axe`) relative to `handSlot.r` and `handSlot.l`, and apply per-weapon socket grip transforms (`position` + `rotation`) and appropriate animation clip selection (`2H_Melee_Attack_*` for 2H axe) so every weapon is gripped cleanly by the handle with zero ground or body penetration.
- **Recheck:** Inspect `shots/pass2/{hero-duo-knight-mage,adventurer-lineup,skeleton-enemies,action-poses-sheet}.png` to confirm natural weapon grips and zero ground/limb clipping.

### `[CHAR-03]` MAJOR — Self-Shadowing Facet Bands, Hair-Bun Halo & Facial Outline Bleed-Through
- **Severity & Location:** **Major** | `world/assets/characters/toon-skin.js` | Evidence: [`back-and-silhouette.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/back-and-silhouette.png), [`hero-duo-knight-mage.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/hero-duo-knight-mage.png), compared with [`ref-target-trees.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-target-trees.png).
- **Observed Defect:**
  1. In [`back-and-silhouette.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/back-and-silhouette.png), the Knight's helmet and Mage's purple hat show blocky polygon-facet shading bands and jagged self-cast shadows (`receiveShadow = true` on low-poly curved character meshes), whereas [`ref-target-trees.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-target-trees.png) has smooth, clean cel-shading on character surfaces.
  2. The Mage's hair bun in [`back-and-silhouette.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/back-and-silhouette.png) displays a bright grey/white halo around a black center (excessive fresnel rim light on near-black hair texels).
  3. In [`hero-duo-knight-mage.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/hero-duo-knight-mage.png), faint dark lines bleed through the Mage's lower face and the Knight's cheek, and sharp corners (shields, spellbook, skeleton jaws) show split-normal outline gaps.
- **Correction Target:**
  1. Disable self-shadowing (`receiveShadow = false`, while keeping `castShadow = true` for crisp ground shadows) on character toon meshes, and compute welded/smoothed vertex normals for smooth toon shading and gap-free outline extrusion (`aOutlineNormal` or welded normals on the outline geometry).
  2. Modulate rim-light intensity by base-color luminance so dark colors (black hair, dark iron) don't get washed out by a grey/white rim halo.
  3. Use slight depth bias (`polygonOffset` or normal-only push along welded smooth normals with proper thickness scaling) on the `BackSide` outline mesh so internal head/mouth/visor cavities never poke through the front face.
- **Recheck:** Inspect `shots/pass2/back-and-silhouette.png` and `shots/pass2/hero-duo-knight-mage.png` against `ref-target-trees.png`.

### `[CHAR-04]` MINOR — Camera Framing Clips Weapon Tips at Viewport Borders
- **Severity & Location:** **Minor** | `world/assets/characters/shoot.mjs` / `preview.html` | Evidence: [`hero-duo-knight-mage.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/hero-duo-knight-mage.png), [`skeleton-enemies.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/skeleton-enemies.png), [`action-poses-sheet.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass1/action-poses-sheet.png).
- **Observed Defect:** The left/right viewport edges cut off the tip of the Knight's sword in `hero-duo-knight-mage.png` and `action-poses-sheet.png`, the Mage's staff tip in `action-poses-sheet.png`, and `Skeleton_Warrior`'s blade tip in `skeleton-enemies.png`.
- **Correction Target:** Pull the camera distance back slightly (`~10–15%`) in those shots so 100% of every character and extended weapon silhouette is framed with clean margin inside the viewport.
- **Recheck:** Confirm full weapon visibility across all 5 `shots/pass2/*.png` renders.

---

## 4. Verification & Test Scope (`verify.mjs`)

To pass Stage 3 Gate, `node world/assets/characters/verify.mjs` must verify:
1. **Render & Error Gate:** `shots/pass2/report.json` exists with `zeroConsoleErrors === true`, `consoleErrors.length === 0`, and all 5 PNGs (`hero-duo-knight-mage.png`, `adventurer-lineup.png`, `skeleton-enemies.png`, `action-poses-sheet.png`, `back-and-silhouette.png`) exist on disk with file size `> 30,000` bytes.
2. **Hardware Draw-Call & Triangle Gate:**
   - `hero-duo-knight-mage`: `drawCalls <= 6` and `triangles <= 26000`.
   - `adventurer-lineup`: `drawCalls <= 15`.
   - `skeleton-enemies`: `drawCalls <= 12`.
   - `action-poses-sheet`: `drawCalls <= 12`.
   - `back-and-silhouette`: `drawCalls <= 6`.
3. **Native Animation & Roster Gate:**
   - All 5 `Rig_Medium_*` GLB packs loaded (`Rig_Medium_General.glb`, `Rig_Medium_MovementBasic.glb`, `Rig_Medium_CombatMelee.glb`, `Rig_Medium_CombatRanged.glb`, `Rig_Medium_Special.glb`).
   - `totalNativeClips >= 90` and `semanticKeys.length >= 24`.
   - All 5 Adventurer IDs (`Knight`, `Mage`, `Barbarian`, `Rogue`, `Rogue_Hooded`) and 4 Skeleton IDs (`Skeleton_Warrior`, `Skeleton_Mage`, `Skeleton_Rogue`, `Skeleton_Minion`) verified.

---

## 5. Pass 2 Recheck & After-Scores

### Pass 2 Verification Summary (`shots/pass2/report.json` & `verify.mjs`)

- **Verdict:** **Pass Within Inspected Scope** (`node world/assets/characters/verify.mjs` passed with `0` console errors).
- **Draw-Call Consolidation (`[CHAR-01]` Resolved — 90% Reduction):**
  - Implemented `prepareUnifiedCharacterSource` and `rebuildUnifiedCharacterSkin` in [`toon-skin.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/toon-skin.js) + [`index.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/index.js), transforming all skinned body sub-meshes, rigid bone-parented accessories (`Helmet`, `Hat`, `Hood`, `Cape`), glowing skeleton eyes (`vMapUv.x < -0.5`), and socketed weapons (`handSlot.r` / `handSlot.l`) into **1 unified `SkinnedMesh` + 1 unified outline `SkinnedMesh` (`2` draw calls per complete equipped character)**:
    - [`shots/pass2/hero-duo-knight-mage.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/hero-duo-knight-mage.png): **`4` draw calls** (`20,961` triangles) — down from `40` draw calls in Pass 1 (budget `<= 6`).
    - [`shots/pass2/adventurer-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/adventurer-lineup.png): **`10` draw calls** (`49,437` triangles) — down from `94` draw calls in Pass 1 (budget `<= 15`).
    - [`shots/pass2/skeleton-enemies.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/skeleton-enemies.png): **`8` draw calls** (`48,432` triangles) — down from `82` draw calls in Pass 1 (budget `<= 12`).
    - [`shots/pass2/action-poses-sheet.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/action-poses-sheet.png): **`8` draw calls** (`41,922` triangles) — down from `80` draw calls in Pass 1 (budget `<= 12`).
    - [`shots/pass2/back-and-silhouette.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/back-and-silhouette.png): **`4` draw calls** (`20,961` triangles) — down from `40` draw calls in Pass 1 (budget `<= 6`).
- **Weapon Grip & Animation Style Fixes (`[CHAR-02]` & `[CHAR-04]` Resolved):**
  - `spellbook_open.gltf` (`handSlot.l`): rotated (`[0, 0.7071068, 0.7071068, 0]`, `position: [0, 0.19, 0.05]`) so the pink spine rests in the Mage's palm and the open white pages face outward in [`hero-duo-knight-mage.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/hero-duo-knight-mage.png) and [`action-poses-sheet.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/action-poses-sheet.png).
  - `Skeleton_Axe.gltf`: grip shifted to `position: [0, 0.20, 0]` on the lower wooden handle below the double-bladed stone head, clearly visible in [`skeleton-enemies.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/skeleton-enemies.png).
  - `Skeleton_Staff.gltf`: rotated (`[0, 0.7071068, 0, 0.7071068]`, `position: [0, 0.14, 0]`) so the horned skull ornament faces forward and the shaft clears the robe.
  - `dagger.gltf` & `Skeleton_Dagger.gltf`: grip offset raised to `[0, 0.065, 0]` so crossguards sit cleanly above the fists on `Rogue`, `Rogue_Hooded`, and `Skeleton_Rogue`.
  - Weapon-style-aware `SEMANTIC_ANIMATIONS` (`1h`, `2h`, `dual`, `magic`): `Knight` `idle` uses `Idle_Combat` (preventing ground blade penetration), and `Barbarian` `combo1` uses `2H_Melee_Attack_Slice` (both hands swinging the 2H battleaxe in [`adventurer-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/adventurer-lineup.png)).
  - Camera framing widened across all shots so 100% of extended weapon tips remain inside the viewport margins.
- **Cel-Shading, Smooth Normals & Outline Fixes (`[CHAR-03]` Resolved):**
  - Removed the vertex clip-plane stretching bug (`gl_Position = vec4(0,0,2,1)`) and filtered front-face eye/nose outline triangles on the CPU, eliminating the stray dark line across the Mage's mouth in [`hero-duo-knight-mage.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/hero-duo-knight-mage.png).
  - Disabled self-shadowing (`receiveShadow = false`) and added `computeSmoothShadingNormals` (`~62°` threshold) plus luminance-modulated Fresnel rim lighting and plum-espresso hair cell override (`r0c1: [52, 38, 68]`), eliminating the helmet/hat facet banding and hair-bun white halo in [`back-and-silhouette.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/shots/pass2/back-and-silhouette.png).

### Pass 1 vs. Pass 2 Scores (`/10` per `judging-3d-scenes`)

| Dimension | Pass 1 Score | Pass 2 Score | Pass 2 Verification Notes |
|---|---:|---:|---|
| **Structure** | 5 / 10 | **9 / 10** | All weapon sockets, grip offsets, and silhouettes sit naturally with zero ground, limb, or viewport border clipping across all 5 shots. |
| **Function** | 3 / 10 | **9 / 10** | `2` draw calls per equipped character (`4` draws for Hero Duo, `10` for 5 Adventurers, `8` for 4 Skeletons), 95 native `Rig_Medium` clips across all 5 packs, 26 weapon-style-aware semantic keys. |
| **Intent** | 8 / 10 | **9 / 10** | 100% genuine KayKit Adventurers & Skeletons with authentic 1H/2H/Dual/Magic skeletal animations and zero procedural bone-wiggling. |
| **Finish** | 5 / 10 | **9 / 10** | Clean anime cel-shading, smooth helmet/hat/cape shading matching [`ref-target-trees.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-target-trees.png), crisp view-space ink outlines, and zero facial bleed-through. |
| **Overall (Lowest)** | **3 / 10** | **9 / 10** | **PASS (`>= 7/10` in all dimensions, 0 blockers, verified by `verify.mjs`).** |

