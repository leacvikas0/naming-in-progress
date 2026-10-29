# Botanical & Toroidal Meadow Pack — Pass 2 Blind Critique & Verification Scope

## 1. Pass 1 `judging-3d-scenes` Verdict & Scores

- **Judged Stage:** `Refined asset/exterior` (Stage 2 Asset Pack + Toroidal GPU Meadow Integration)
- **Verdict:** **Changes needed** (Pass 1 meets draw-call, triangle budget, and mask-exclusion engineering constraints, but exhibits clear Major structural and botanical finish defects in stem geometry, petal/cup attachment, shrub blossom readability, and meadow drift composition).

| Dimension | Pass 1 Score | Cap / Anchor Justification |
| :--- | :---: | :--- |
| **Structure** | **6 / 10** | Major structural defects (`FLOWER-01`, `FLOWER-02`, `FLOWER-04`): stems on `cosmos`, `daisy`, and `bellflower` are flat 2-triangle ribbons that collapse to 1px hairlines when viewed edge-on and visibly gap/pinch below tilted flower heads; `toonShrub` blossoms are isolated single triangles floating on only the front hemisphere. |
| **Function** | **7 / 10** | All 6 species obey triangle budgets (`20/24`, `90/96`, `86/88`, `107/110`, `86/88`, `136/140`), `meadow-drift` runs at `6` draw calls / `143 FPS` with clean `uWorldMask.b < 0.5` path exclusion, but `Front Elevation` viewports clip the top of tall species (`FLOWER-07`). |
| **Intent** | **6 / 10** | Major intent gaps (`FLOWER-03`, `FLOWER-04`, `FLOWER-06`): `lupine` reads as coaxial stacked square/octahedral beads with bare stem gaps rather than a lush whorled lupine spike; `toonShrub` has 1-triangle confetti instead of readable blossoms; `meadow-drift` scatters flowers uniformly instead of natural botanical drifts and loses `daisy` readability at player camera distance. |
| **Finish** | **6 / 10** | Major finish issues (`FLOWER-05`, `FLOWER-06`): near-black basal vertex colors on `grassTuft` and stems create harsh dark spots on the bright gouache terrain in `meadow-drift.png`, and `lupine` top tips wash out to stark white-grey facets. |
| **Overall** | **6 / 10** | **Lowest evaluated dimension (`6/10`), never an average.** |

---

## 2. Blind Visual Inventory of `shots/pass1/*.png`

1. **[species-sheet.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/species-sheet.png):**
   - Shows a 3×2 grid of the 6 vertex-colored botanical species (`grassTuft` 20/24 tris, `bellflower` 90/96 tris, `daisy` 86/88 tris, `lupine` 107/110 tris, `cosmos` 86/88 tris, `toonShrub` 136/140 tris) on green circular pedestals. HUD reports `Meadow Draw Calls: 6`, `Active Tris: 525`, `FPS: 142`.
2. **[meadow-drift.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/meadow-drift.png):**
   - Player-perspective oblique view along a winding brown dirt path carving cleanly through a dense meadow (`Meadow Draw Calls: 6`, `Active Tris: 263,230`, `FPS: 143`). Both sides of the path are lined with `grassTuft`, `bellflower`, `lupine`, `cosmos`, `daisy`, and `toonShrub`. The path exclusion (`uWorldMask.b < 0.5`) is clean, but grass bases appear overly black against the lime-green terrain, grass heights are overly uniform, daisies barely read in the mid-ground, and shrubs look like plain dark-green mounds.
3. **[grassTuft.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/grassTuft.png):**
   - 3-viewport inspection (`3/4 Hero Turntable`, `Front Elevation`, `Top-Down Radial Silhouette`) of a 5-blade grass tuft (`20/24 tris`). Top-down view shows a rigid 5-pointed star with a pentagonal hole in the center; Front Elevation shows the right blade turning edge-on into a paper-thin hairline and the top blade tip clipped by the upper viewport edge.
4. **[bellflower.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/bellflower.png):**
   - 3-stem violet campanula cluster (`90/96 tris`) with basal leaves, drooping violet bell corollas, and yellow inner stamens. In `3/4 Hero Turntable`, the left stem pinches to a thin ribbon and attaches awkwardly to the upper side of the left bell, while the right foreground stem rises straight into the lower mouth of the right bell.
5. **[daisy.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/daisy.png):**
   - 3-flower white daisy cluster (`86/88 tris`) with golden-orange hexagonal centers, 8 white diamond petals per flower, flat ribbon stems, and basal leaves. In `3/4 Hero Turntable`, the left stem stops short of the tilted orange center disk, and in `Top-Down Radial Silhouette`, petals touch the center disk only at single points, leaving wide triangular gaps around the receptacle.
6. **[lupine.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/lupine.png):**
   - 3-spike lavender lupine (`107/110 tris`) with basal leaves and stacked diamond/pyramid tiers along each stem. In `3/4 Hero Turntable` and `Front Elevation`, the side spikes separate into disconnected-looking diamond beads with bare dark-green ribbon stems visible between tiers; in `Top-Down Radial Silhouette`, the tiers align into sharp 4-pointed stars.
7. **[cosmos.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/cosmos.png):**
   - 3-flower rose-pink cosmos cluster (`86/88 tris`). In `3/4 Hero Turntable`, both left and right ribbon stems visibly terminate with a gap below the tilted flower heads, and in `Front Elevation`, the right stem collapses into a 1px vertical line while the highest flower head clips the top of the frame.
8. **[toonShrub.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/toonShrub.png):**
   - Multi-lobe green bush (`136/140 tris`) with 8 small colored triangles (pink, orange, cream) placed only on the front hemisphere (`Top-Down Radial Silhouette` shows the entire rear half empty), reading as stray confetti triangles rather than stylized flowers.

---

## 3. Ranked Findings (`FLOWER-01` through `FLOWER-07`)

### `FLOWER-01` (Major — Structure & Attachment): Disconnected Flower Heads, Single-Point Petal Gaps, and Paper-Thin Ribbon Stems on `daisy` and `cosmos`
- **Location:** `world/assets/flowers/species.js` (`daisy`, `cosmos`).
- **Observed Defect:** Stems are flat 1-sided/2-triangle ribbons that collapse into 1px lines when seen edge-on and terminate below the tilted flower heads with a visible air gap. Furthermore, each petal diamond meets the central disk at only a single vertex, leaving open gaps around the disk perimeter and making petals look detached.
- **Evidence:** [daisy.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/daisy.png) (`3/4 Hero Turntable` left stem gap, `Top-Down Radial Silhouette` petal-to-disk gaps) and [cosmos.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/cosmos.png) (`3/4 Hero Turntable` left/right stem detachment, `Front Elevation` right stem edge-on collapse).
- **Correction Target:** Build crossed/3D V-rib or triangular-section stems whose apex penetrates cleanly into the center of the tilted flower receptacle (`disk`), and widen/overlap the petal bases into the receptacle disk so there are zero floating gaps while staying `<= 88` triangles for both `daisy` and `cosmos`.
- **Recheck:** Inspect `shots/pass2/daisy.png` and `shots/pass2/cosmos.png` across all 3 viewports to confirm solid stem-to-disk attachment from every angle and full, connected petal rings.

### `FLOWER-02` (Major — Structure & Silhouette): `bellflower` Ribbon Stem Pinching and Awkward Bell Suspension
- **Location:** `world/assets/flowers/species.js` (`bellflower`).
- **Observed Defect:** In `bellflower.png`, the arching stems are single flat strips that pinch to 1px mid-arc, and the right stem in the 3/4 view visually runs straight through the mouth of the foreground bell rather than visibly arching over and suspending the bell from its top apex/calyx.
- **Evidence:** [bellflower.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/bellflower.png) (`3/4 Hero Turntable` left stem pinch & right stem overlap, `Top-Down Radial Silhouette`).
- **Correction Target:** Give `bellflower` well-separated radial stem angles with 3D V-ribbed/crossed stem geometry that arches cleanly into the top apex of each hanging bell corolla, with flared petal tips and warm glowing stamen cores (`<= 96` triangles).
- **Recheck:** Inspect `shots/pass2/bellflower.png` to confirm every bell visibly hangs from its arched stem apex with no edge-on stem disappearance or stem-through-mouth illusion.

### `FLOWER-03` (Major — Structure, Intent & Finish): `lupine` Coaxial Square Beads and Bare Stem Gaps
- **Location:** `world/assets/flowers/species.js` (`lupine`).
- **Observed Defect:** Each lupine spike consists of coaxially aligned 4-sided diamond beads that separate along tilted side spikes, exposing bare ribbon stems between tiers and producing a harsh 4-pointed star cross-section from above with chalky white top facets.
- **Evidence:** [lupine.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/lupine.png) (`3/4 Hero Turntable`, `Front Elevation`, `Top-Down Radial Silhouette`).
- **Correction Target:** Overlap successive floret tiers along the curved spike axis and alternate (twist) the azimuthal phase of each whorl by `30°–45°` so the spike reads as a continuous, organic, spiral-whorled lupine raceme from both side and top-down views, with a rich violet-to-lilac-rose gouache gradient (`<= 110` triangles).
- **Recheck:** Inspect `shots/pass2/lupine.png` in 3/4, Front, and Top-Down views to verify overlapping whorled tiers, no bare stem gaps between florets, and a rounded radial silhouette.

### `FLOWER-04` (Major — Structure & Intent): `toonShrub` Single-Triangle Confetti Blossoms and Empty Rear Hemisphere
- **Location:** `world/assets/flowers/species.js` (`toonShrub`).
- **Observed Defect:** The shrub's blossoms are 8 isolated single triangles placed only on the front half of the mesh, reading as stray polygon shards rather than flowers, and leaving the back half barren in top-down/meadow views. Also, the bottom of the shrub lobes curves up leaving scalloped under-gaps.
- **Evidence:** [toonShrub.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/toonShrub.png) (`3/4 Hero Turntable`, `Front Elevation`, `Top-Down Radial Silhouette`) and [meadow-drift.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/meadow-drift.png) (left foreground shrub).
- **Correction Target:** Sculpt a grounded, multi-lobe gouache foliage cluster (`min.y ≈ 0` with flat/tucked base skirt) crowned with readable multi-triangle rosette/star blossoms distributed around the entire 360° upper canopy (`<= 140` triangles).
- **Recheck:** Inspect `shots/pass2/toonShrub.png` and `shots/pass2/meadow-drift.png` to confirm readable multi-petal blossoms across all sides of the canopy and solid ground contact.

### `FLOWER-05` (Major — Structure & Finish): `grassTuft` Rigid 5-Pointed Star Symmetry, Edge-On Blade Disappearance, and Overly Black Base
- **Location:** `world/assets/flowers/species.js` (`grassTuft`).
- **Observed Defect:** The 5 grass blades sit in a rigid 72° circle with a hollow pentagon at the center, one blade turns edge-on into a 1px line in Front Elevation, and the basal vertex color is near-black, creating dark holes on the terrain in `meadow-drift.png`.
- **Evidence:** [grassTuft.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/grassTuft.png) (`Front Elevation`, `Top-Down Radial Silhouette`) and [meadow-drift.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/meadow-drift.png).
- **Correction Target:** Cluster 6–7 varied-height, curved/cambered blades (`<= 24` triangles total) rooted tightly through the center `(0,0,0)` with varied roll/yaw angles so no view looks like a mechanical star or collapses edge-on, and tune the root-to-tip gouache green gradient (deep moss green base `#234d1e` to sunlit chartreuse tip `#8cd943`) so tufts blend seamlessly into the meadow floor.
- **Recheck:** Inspect `shots/pass2/grassTuft.png` and `shots/pass2/meadow-drift.png`.

### `FLOWER-06` (Major — Function, Intent & Finish): Uniform Meadow Scatter and Weak Flower Drift Hierarchy in `meadow-drift.png`
- **Location:** `world/assets/flowers/meadow.js` and `world/assets/flowers/preview.html`.
- **Observed Defect:** Wildflowers in `meadow-drift.png` are scattered with uniform high-frequency noise rather than cohesive species drifts (clusters of lupine, drifts of daisies and cosmos, pockets of bellflowers and shrubs), grass tufts have uniform height, and daisies look faint at player camera distance.
- **Evidence:** [meadow-drift.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/meadow-drift.png).
- **Correction Target:** Use multi-scale spatial drift clustering in `meadow.js` so wildflowers form painterly botanical drifts alongside the winding path while strictly respecting `worldMaskTexture` exclusion (`mask.b < 0.5`), vary toroidal grass tuft scales/heights naturally, and ensure warm creamy-white daisies and rose cosmos read vividly in `meadow-drift.png`.
- **Recheck:** Inspect `shots/pass2/meadow-drift.png` to confirm natural species clustering, seamless grass root integration, clear path exclusion, and `6` meadow draw calls.

### `FLOWER-07` (Minor — Inspection Framing): `Front Elevation (y=0 Grounded)` Viewport Clips Tall Plant Tips
- **Location:** `world/assets/flowers/preview.html`.
- **Observed Defect:** In `grassTuft.png`, `bellflower.png`, `daisy.png`, `lupine.png`, and `cosmos.png`, the upper-right `Front Elevation (y=0 Grounded)` camera frames too tightly, clipping the highest tips of the plants at the top border.
- **Evidence:** [daisy.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/daisy.png), [cosmos.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/cosmos.png), [lupine.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass1/lupine.png).
- **Correction Target:** Adjust the `Front Elevation` camera distance/target in `preview.html` so the entire plant from the `y=0` pedestal surface to its highest tip sits comfortably inside the viewport with clear margin below the HUD bar.
- **Recheck:** Inspect all 6 single-species PNGs in `shots/pass2/*.png` to verify zero top clipping.

---

## 4. Acceptance Scope & Verification Contract

To pass Stage 2 — Pass 2 sign-off, the Botanical & Toroidal Meadow Pack MUST satisfy both the **Programmatic Verification Contract** (`node world/assets/flowers/verify.mjs`) and the **Visual Recheck Contract** (`shots/pass2/*.png`):

1. **Species Completeness & Attribute Integrity:**
   - All 6 species (`grassTuft`, `bellflower`, `daisy`, `lupine`, `cosmos`, `toonShrub`) exist and return valid `THREE.BufferGeometry` instances via `createFlowerSpeciesGeometries()`.
   - Every geometry has non-empty, finite (non-`NaN`, non-`Infinity`) `position`, `normal`, and `color` (`itemSize === 3`) vertex attributes.
   - Every geometry is grounded at `y = 0` (`Math.abs(bbox.min.y) <= 0.03`, `bbox.max.y > 0.15`).
2. **Strict Triangle Caps:**
   - `grassTuft <= 24` tris
   - `bellflower <= 96` tris
   - `daisy <= 88` tris
   - `lupine <= 110` tris
   - `cosmos <= 88` tris
   - `toonShrub <= 140` tris
3. **Toroidal Meadow Draw-Call & Mask Exclusion Contract:**
   - `createToroidalMeadow({ profile: 'tablet', ... })` and `createToroidalMeadow({ profile: 'desktop', ... })` each produce `<= 6` draw calls (`1` toroidal grass `InstancedMesh` + `5` wildflower/shrub `InstancedMesh` batches).
   - Wildflower instances strictly respect `worldMaskTexture` exclusion (`mask.b < 0.5` road/water/foundation channels have `0` spawned static flower instances).
4. **Clean Headless Render & Visual Recheck (`shots/pass2/`):**
   - `shots/pass2/report.json` records `0` console/page errors across all 8 views (`species-sheet`, `meadow-drift`, `grassTuft`, `bellflower`, `daisy`, `lupine`, `cosmos`, `toonShrub`).
   - All 7 findings (`FLOWER-01` .. `FLOWER-07`) are visually resolved in `shots/pass2/*.png`, achieving `>= 8/10` in every `judging-3d-scenes` dimension (`Structure`, `Function`, `Intent`, `Finish`, `Overall`).

---

## 5. Pass 2 Recheck & Final `judging-3d-scenes` Scores

All 7 findings (`FLOWER-01` through `FLOWER-07`) were resolved in [`species.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/species.js), [`meadow.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/meadow.js), [`index.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/index.js), and [`preview.html`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/preview.html), re-rendered via `node world/assets/flowers/shoot.mjs pass2`, visually re-inspected across all 8 screenshots in `shots/pass2/*.png`, and programmatically verified via `node world/assets/flowers/verify.mjs` (`PASS`).

### Finding Resolution Matrix

| Finding ID | Pass 1 Defect | Pass 2 Verification Evidence | Status |
| :--- | :--- | :--- | :---: |
| **`FLOWER-01`** | Disconnected flower heads, single-point petal gaps, and paper-thin ribbon stems on `daisy` and `cosmos` | [daisy.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass2/daisy.png), [cosmos.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass2/cosmos.png): Slender 3D orthogonal `crossedStalk` stems penetrate cleanly into the receptacle disk from every angle; petal roots tuck inside the raised golden dome with zero gaps (`88/88` tris each). | **RESOLVED** |
| **`FLOWER-02`** | `bellflower` ribbon stem pinching and foreground stem overlapping bell mouth | [bellflower.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass2/bellflower.png): 3-segment 3D shepherd's-crook stems arch above each bell and hook down into the top green calyx apex with all 3 bells cleanly separated across 3/4, Front, and Top-Down views (`96/96` tris). | **RESOLVED** |
| **`FLOWER-03`** | `lupine` coaxial diamond beads, horizontal shear gaps on tilted spikes, and chalky top facets | [lupine.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass2/lupine.png): Overlapping floret whorls along a continuous spine axis with `60°` azimuthal twist form a seamless spiral-whorled raceme and 6-lobed top-down silhouette (`109/110` tris). | **RESOLVED** |
| **`FLOWER-04`** | `toonShrub` single-triangle front-only confetti blossoms and scalloped underside gaps | [toonShrub.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass2/toonShrub.png): 10 dome-hugging 4-petal blossom rosettes sit flush across 360° of the upper canopy, and outer ground skirt vertices sit flush at `y = 0` (`140/140` tris). | **RESOLVED** |
| **`FLOWER-05`** | `grassTuft` hollow 5-star symmetry, edge-on blade collapse, and overly black roots | [grassTuft.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass2/grassTuft.png): 6 axially twisted blades rooted across the center eliminate the central hole and edge-on disappearance (`24/24` tris). | **RESOLVED** |
| **`FLOWER-06`** | Uniform noisy flower scatter and weak daisy/cosmos drift readability in `meadow-drift.png` | [meadow-drift.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass2/meadow-drift.png): Multi-scale species drift anchors create lush, readable colonies of daisies, cosmos, bellflowers, lupines, and flowering shrubs along the winding path (`6` draw calls, `142 FPS`). | **RESOLVED** |
| **`FLOWER-07`** | `Front Elevation (y=0 Grounded)` viewport clipped tall plant tips | [species-sheet.png](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/shots/pass2/species-sheet.png) & all 6 single-species PNGs in `shots/pass2/`: Clean headroom above every plant tip. | **RESOLVED** |

### Pass 2 `judging-3d-scenes` Verdict & Scores

- **Verdict:** **Pass within inspected scope**

| Dimension | Pass 1 Score | Pass 2 Score | Pass 2 Justification |
| :--- | :---: | :---: | :--- |
| **Structure** | 6 / 10 | **9 / 10** | Solid 3D stem-to-receptacle attachments, overlapping petal collars, continuous lupine whorls, grounded shrub skirts, and dome-hugging 4-petal shrub rosettes across all 3 orthogonal/oblique studio angles. |
| **Function** | 7 / 10 | **9 / 10** | All 6 species strictly obey triangle caps (`24/24`, `96/96`, `88/88`, `109/110`, `88/88`, `140/140`), `tablet` and `desktop` profiles execute in `6` draw calls with `0` `uWorldMask.b < 0.5` path violations, and `verify.mjs` passes with `0` console errors. |
| **Intent** | 6 / 10 | **9 / 10** | Every species has a distinct, immediately recognizable botanical silhouette both in close-up turntable inspection and in player-perspective meadow drifts. |
| **Finish** | 6 / 10 | **9 / 10** | Cohesive 3-tone gouache cel-shaded palette with warm root-to-tip gradients that blend naturally into the Haru-machi meadow floor. |
| **Overall** | **6 / 10** | **9 / 10** | **Lowest evaluated dimension (`9/10`), never an average.** |
