# Stage 5 Gameplay & UI — Blind Critique & Verification Scope

**Critic-Fixer Role:** Independent Blind Stage 5 Gameplay & UI Critic-Fixer Subagent  
**Protocol:** [`judging-3d-scenes/SKILL.md`](file:///C:/Users/silen/.gemini/antigravity-acp/t3-home/config/skills/judging-3d-scenes/SKILL.md), [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md), [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md)  
**Inspected Evidence (Pass 1 — Before Reading Source Code):**
- [`01-desktop-act1-sunfire-slash.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/01-desktop-act1-sunfire-slash.png) (`1600×900` Desktop)
- [`02-desktop-shatterlance-railgun.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/02-desktop-shatterlance-railgun.png) (`1600×900` Desktop)
- [`03-desktop-cinder-fall-meteor.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/03-desktop-cinder-fall-meteor.png) (`1600×900` Desktop)
- [`04-desktop-storm-lance-fulgurite.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/04-desktop-storm-lance-fulgurite.png) (`1600×900` Desktop)
- [`05-tablet-pad7-touch-combat.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/05-tablet-pad7-touch-combat.png) (`1440×960` `3:2` Xiaomi Pad 7 Tablet)
- [`06-sunset-pier-sanctuary-interlude.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/06-sunset-pier-sanctuary-interlude.png) (`1600×900` Desktop)
- [`07-dusk-hamlet-plaza-defense.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/07-dusk-hamlet-plaza-defense.png) (`1600×900` Desktop)
- [`08-night-shrine-hollow-sovereign-boss.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/08-night-shrine-hollow-sovereign-boss.png) (`1600×900` Desktop)

---

## 1. Initial Blind Verdict & `/10` Scores (Pass 1)

- **Verdict:** **Changes Needed**
- **Initial `/10` Scores (Pass 1):**
  - **Structure:** `5 / 10` (Capped by Major spatial/mesh contradictions: oversized Sanctuary disc in `06` overhanging water on both sides of the narrow pier and slicing through the moored boat; right-hand skeleton in `07` clipping directly through the wooden plaza fence rails; boss in `08` appearing to hover above the floor behind self-occluding crystal spikes.)
  - **Function:** `5 / 10` (Capped by Major combat framing and spell-to-target alignment flaws: `Shatterlance` in `02` fires over the friendly Knight and terminates in empty space 4m short of enemies that are pushed to the far-right border and clipped off-screen; `Storm Lance` in `04` shoots straight through the back of the friendly Knight's head; Mage hero is sliced in half by the left screen edge in `03` and `05`.)
  - **Intent:** `6 / 10` (Capped by Major visual storytelling gaps: `06` announces `SANCTUARY BRAZIER KINDLED` but renders no 3D Sanctuary Brazier on the pier, reusing an enemy-style telegraph ring instead; `08` announces `Bone Aegis × 2` on **The Hollow Sovereign**, yet the boss has no visible 3D orbiting Bone Aegis shields or boss crown to set him apart from a scaled-up regular skeleton warrior, and the left add has two overlapping overhead crests.)
  - **Finish:** `6 / 10` (All spell and sword-breathing shaders obey the hardware-opaque `transparent: false` Zero-Glass rule with bold ukiyo-e/cel contrast and `110–144 FPS` / `36–58` draw calls, but overall presentation is held back by viewport clipping, top-right camera preset dropdown desync showing `2 · Well Plaza` in every act, and desktop keyboard hints inside the Xiaomi Pad 7 touch buttons.)
  - **Overall (Lowest Required Dimension):** **`5 / 10`**

---

## 2. Blind Visual Inventory Across Plates `01`–`08`

- **[`01-desktop-act1-sunfire-slash.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/01-desktop-act1-sunfire-slash.png):**
  - **What is visible:** East Wisteria Clearing in daylight. Mage stands at left (`x ≈ 14%`), connected by a faceted golden diamond tether to the Knight (`x ≈ 42%`), who holds a blazing orange-gold sword and unleashes a wide opaque orange-red crescent slash (`Hinokami Sunfire`) with a star-shaped lava ground decal. Three skeleton enemies stand to the right (`x ≈ 62%–86%`) with opaque orange octahedron overhead crests (`y ≈ 2.15m`). A black-and-gold circular ground telegraph ring sits under the foreground skeleton minion on the bottom right, partially cropped by the bottom-right viewport edge.
- **[`02-desktop-shatterlance-railgun.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/02-desktop-shatterlance-railgun.png):**
  - **What is visible:** East Wisteria Clearing (`Wave 2/2`). Mage stands on the far left (hat tip touching the left edge). The `2 · Shatterlance` 7-fluted glacial great-lance, radial ice shard ring, and frost ground splat are centered directly on the friendly Knight (`x ≈ 45%`), with the spear tip ending in empty sand near the center of the screen (`x ≈ 65%`). Meanwhile, the skeleton enemies are bunched at the extreme right border (`x ≈ 88%–100%`), half-clipped off the right edge of the frame along with their blue overhead Rime crest.
- **[`03-desktop-cinder-fall-meteor.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/03-desktop-cinder-fall-meteor.png):**
  - **What is visible:** East Wisteria Clearing (`Wave 2/2`). The Mage on the far left is cut in half vertically by the left viewport border. The Knight stands at center-left with an ignited Sunfire blade. In the center sits the `3 · Cinder Fall` dark obsidian magma boulder surrounded by tilted black-and-orange basalt pillars and a bright lava crater decal. One red-hooded skeleton stands in the front edge of the crater (clipping a black rock chunk), while two other enemies behind the boulder are almost completely hidden behind the opaque meteor sphere (only their helmets and orange crests poke out).
- **[`04-desktop-storm-lance-fulgurite.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/04-desktop-storm-lance-fulgurite.png):**
  - **What is visible:** East Wisteria Clearing (`Wave 2/2`). Mage on left fires a long horizontal cyan-white braided lightning beam (`4 · Storm Lance`) toward three skeletons on the right surrounded by dark indigo/obsidian fulgurite spikes, a dark fractal ground crater, and a wide cyan shock ring. The horizontal lightning spear passes straight through the back of the friendly Knight's helmet at `x ≈ 30%`, and the rightmost skeleton + outer shock ring clip off the right edge of the screen.
- **[`05-tablet-pad7-touch-combat.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/05-tablet-pad7-touch-combat.png):**
  - **What is visible:** `1440×960` (`3:2`) tablet frame (`Xiaomi Pad 7`). Mage on the far left is half-clipped by the left viewport border, with her boots directly above the bottom-left virtual joystick (`Sprint`). Knight in center-left swings a bold blue-and-white ukiyo-e water/ice crescent (`Glacial Tide`) in front of tall cel-shaded blue `Frost Lance` ice monolith spikes and a wide ice ground decal. The upper crescent ribbon crosses directly over the center horned skeleton warrior's face, hiding its head. Bottom-center spell bar (`Cataclysm 100% READY!`) and bottom-right 5-button touch action arc do not overlap each other, though the touch buttons display PC keyboard sub-labels (`Shift`, `E · Ward`, `Q · Burst`, `Space`).
- **[`06-sunset-pier-sanctuary-interlude.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/06-sunset-pier-sanctuary-interlude.png):**
  - **What is visible:** West Millpond Pier at dusk with warm sunset sky, waterwheel mill house on the right, and calm blue pond water. Both Knight and Mage stand cleanly on the wooden pier deck planks (`y = -0.23m`, not wading in water) connected by the Golden Soul Tether. However, a huge (`~4.5m` diameter) flat black/gold/amber circular bullseye ring lies centered on the narrow (`~2.2m` wide) pier, overhanging the water by more than a meter on both sides and slicing straight through the moored wooden boat on the left. No 3D Sanctuary Brazier is present despite the banner `SANCTUARY BRAZIER KINDLED`. A yellow Guiding Petal Marker sits directly under the Mage's boots.
- **[`07-dusk-hamlet-plaza-defense.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/07-dusk-hamlet-plaza-defense.png):**
  - **What is visible:** Twilight Hamlet Well Plaza at dusk, looking north toward the shrine stairs and Tudor houses. Knight and Mage fight in the foreground of the stone well. Two black-and-gold enemy ground telegraph rings sit under two horned skeleton warriors on the left/center. The center skeleton warrior and the Knight's Sunfire lava splat/telegraph ring encroach into the stone base of the well. On the right (`x ≈ 62%`), a skeleton minion stands directly inside the circular wooden plaza fence rail, with the wooden rails slicing through its waist and legs. A red-hatted skeleton mage stands behind the well post with no overhead crest.
- **[`08-night-shrine-hollow-sovereign-boss.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/08-night-shrine-hollow-sovereign-boss.png):**
  - **What is visible:** Starlit North Shrine Overlook at night in front of the stone arch and wisteria planters. **The Hollow Sovereign** (`1.42×` scale horned skeleton) stands in the center flanked by two normal-scale horned skeleton adds. Tall orange crystalline spikes and a fiery lava decal surround the center. The boss's skeletal feet appear suspended `~0.4m` in the air in front of the tall orange crystal pillars, which also slice through his right arm and block his lower body. The boss has no visible 3D orbiting Bone Aegis shields or boss crown/mantle to visually represent `Bone Aegis × 2`. The left skeleton add has two overlapping diamond crests colliding above its helmet.

---

## 3. Ranked Findings & Repair Targets

### `[F-01]` (Major — Function / Framing) `02-desktop-shatterlance-railgun.png`: Shatterlance Fires Over Friendly Knight & Misses Off-Screen Clipped Enemies
- **Location:** [`02-desktop-shatterlance-railgun.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/02-desktop-shatterlance-railgun.png) (`x = 40%–100%`)
- **Observed Defect:** The `2 · Shatterlance` railgun spear and its radial ice ring are positioned over the friendly Knight near the center-left, terminating in empty air at `x ≈ 65%`, while the enemies are pushed to the extreme right border (`x ≈ 88%–100%`) and half-clipped off the viewport along with their blue overhead crest.
- **Correction Target:** Frame the camera and stage the combat positions in `02` so the Mage, Knight, and enemy pack all sit comfortably inside the safe action frame (`x = 18%–82%`), and aim/position the `Shatterlance` railgun spear so its converging rings launch from ahead of the Mage/Knight and its tip visibly pierces/detonates directly into the enemy pack without hitting the friendly Knight.

### `[F-02]` (Major — Function / Framing) `03`, `04`, `05`: Left/Right Viewport Hero & Enemy Clipping and Friendly-Fire Occlusion
- **Location:**
  - [`03-desktop-cinder-fall-meteor.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/03-desktop-cinder-fall-meteor.png) (left border `x = 0%–8%`, center meteor `x = 42%–55%`)
  - [`04-desktop-storm-lance-fulgurite.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/04-desktop-storm-lance-fulgurite.png) (Knight head at `x = 30%`, right border `x = 92%–100%`)
  - [`05-tablet-pad7-touch-combat.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/05-tablet-pad7-touch-combat.png) (left border `x = 0%–10%`, center enemy face `x = 64%`)
- **Observed Defect:**
  1. In `03` and `05`, the Mage hero is sliced vertically in half by the left edge of the screen.
  2. In `04`, the horizontal `Storm Lance` beam shoots straight through the back of the friendly Knight's helmet, and the rightmost enemy/fulgurite ring clips off the right border.
  3. In `03`, the giant black `Cinder Fall` boulder sits directly on the sightline in front of two rear skeletons, hiding their bodies completely.
  4. In `05`, the upper `Glacial Tide` slash ribbon passes directly over the center skeleton warrior's face, obscuring its head.
- **Correction Target:** Adjust camera framing and hero/enemy staging across `01`–`05` so both heroes (`Mage` + `Knight`) and all active enemies remain 100% within the viewport with clean breathing room around the HUD, offset the Knight slightly from the Mage's horizontal `Storm Lance` firing line in `04`, stage the `Cinder Fall` meteor impact in `03` so the enemies are clearly visible around the crater rim rather than hidden behind the boulder, and angle the `Glacial Tide` slash in `05` so the target enemy's head and silhouette read clearly.

### `[F-03]` (Major — Structure / Intent) `06-sunset-pier-sanctuary-interlude.png`: Missing 3D Sanctuary Brazier & Oversized Ring Overhanging Pier Into Water
- **Location:** [`06-sunset-pier-sanctuary-interlude.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/06-sunset-pier-sanctuary-interlude.png) (center pier `x = 20%–62%`)
- **Observed Defect:** The Sanctuary zone on the narrow (`~2.2m` wide) wooden pier uses a `~4.5m` wide flat black-and-gold telegraph-style disc that hangs over the water on both sides of the dock and slices through the moored wooden boat. Furthermore, despite the callout `SANCTUARY BRAZIER KINDLED`, there is no 3D Sanctuary Brazier object on the pier, and the yellow Guiding Petal Marker clips directly into the Mage's boots.
- **Correction Target:** Build a dedicated, hardware-opaque 3D **Sanctuary Brazier** (cel-shaded stone/bronze pedestal with warm kindled sunfire flame and a compact golden rune ring `r <= 0.95m` that fits cleanly inside the wooden pier deck width without overhanging the water or clipping the boat), and place the Guiding Petal Marker cleanly ahead of the heroes along their path rather than intersecting the Mage's boots.

### `[F-04]` (Major — Structure / Placement) `07-dusk-hamlet-plaza-defense.png`: Enemy Clipping Through Wooden Plaza Fence & Well Encroachment
- **Location:** [`07-dusk-hamlet-plaza-defense.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/07-dusk-hamlet-plaza-defense.png) (right fence at `x = 60%–68%`, central well at `x = 45%–55%`)
- **Observed Defect:** The right-hand skeleton minion stands directly inside the wooden fence rail (`r ≈ 4.0m`), with the two horizontal wooden rails slicing through its waist and pelvis. Meanwhile, the center horned skeleton warrior and Sunfire ground splat/telegraph ring intersect the base of the central stone well (`r < 2.2m`), and the back skeleton mage stands behind the well post without a visible overhead crest.
- **Correction Target:** Enforce both the inner well exclusion radius (`r >= 2.4m`) and the wooden plaza fence clearance (keep plaza combat actors within the open cobblestone ring or outside the fence gaps so zero enemies intersect the wooden fence segments or stone well), and ensure all active enemies in `07` sit in clear sightlines with visible overhead crests and telegraph rings on open cobblestones.

### `[F-05]` (Major — Structure / Intent) `08-night-shrine-hollow-sovereign-boss.png`: Boss Floating Feet, Missing 3D Bone Aegis Shields, Self-Occluding Spikes & Double Crest Overlap
- **Location:** [`08-night-shrine-hollow-sovereign-boss.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/08-night-shrine-hollow-sovereign-boss.png) (center boss `x = 44%–55%`, left add `x = 25%`)
- **Observed Defect:**
  1. **The Hollow Sovereign** (`1.42×` scale) appears to have his dark skeletal feet hovering in mid-air (`~0.4m` up) in front of tall orange crystal pillars that block his lower body and slice through his right arm.
  2. Despite the HUD badge `Bone Aegis × 2`, the boss has no visible 3D orbiting **Bone Aegis** shields or sovereign crown/mantle in the 3D scene to distinguish him from a scaled-up normal skeleton warrior.
  3. The left skeleton add has two overhead diamond crests colliding right on top of each other above its helmet.
- **Correction Target:**
  1. Ground **The Hollow Sovereign** firmly on the shrine stone floor (`y = 0` relative to the shrine platform) with clearly visible feet contact.
  2. Give **The Hollow Sovereign** unmistakable 3D **Bone Aegis** orbiting shield plates (and/or sovereign crown/pauldrons) tied to his `aegis` count so `Bone Aegis × 2` reads immediately in 3D space.
  3. Stage the `Rime & Solar Cataclysm` / `Hinokami` VFX ring around the boss perimeter so it frames rather than blocks or pierces the boss's torso/arms.
  4. Prevent duplicate/colliding overhead elemental crests on the same enemy.

### `[F-06]` (Minor — UI / HUD Ergonomics) Camera Preset Dropdown Desync & Tablet Touch Button Labels
- **Location:**
  - Top-right camera preset selector (`2 · Well Plaza`) across `01`–`08`
  - Bottom-right 5-button touch action arc in [`05-tablet-pad7-touch-combat.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/stage5-gameplay/05-tablet-pad7-touch-combat.png)
- **Observed Defect:**
  1. The top-right camera dropdown displays `2 · Well Plaza` in every screenshot even when the active camera/act is East Wisteria Clearing (`01`–`05`), West Millpond Pier (`06`), or Starlit North Shrine Overlook (`08`).
  2. In `05` (`Xiaomi Pad 7` touch mode), the touch action buttons display PC keyboard keybind sub-labels (`Shift`, `E · Ward`, `Q · Burst`, `Space`).
- **Correction Target:** Sync the top-right location/preset selector with the active stage/act location (`East Wisteria Clearing`, `West Millpond Pier`, `Well Plaza`, `North Shrine Overlook`), and show touch-native sub-labels on the tablet action arc when in `tablet` mode.

---

## 4. Verification & Test Scope (Pass 2 Gate)

Before signing off Pass 2, all of the following must be verified:
1. `node world/tools/shoot-stage5-gameplay.mjs` renders all 8 plates (`01`–`08`) cleanly.
2. `node world/tools/shoot-world.mjs stage5-arch-check` passes all architectural invariants.
3. `node world/tools/test-combat-sim.mjs` and `node world/tools/test-coop-room.mjs` pass 100% of assertions.
4. Visual re-inspection of all 8 updated PNG plates via `view_file` confirms `[F-01]` through `[F-06]` are completely resolved with zero new regressions.
