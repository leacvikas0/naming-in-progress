# Tudor Village Houses Kit — Pass 1 Blind Critique & Pass 2 Verification Scope

## 1. Pass 1 `judging-3d-scenes` Verdict & Scores

- **Judged Stage:** `Refined asset/exterior` (Tudor Village Houses Kit — 5 hero buildings: `inn`, `herbalist`, `smithy`, `gardener`, `watermill`)
- **Verdict:** **Changes needed** (Major structural interpenetrations on roof dormers, window arches, and Inn front cross-gable/porch; functional workspace contradictions in the Smithy, Gardener plot, Herbalist greenhouse, and Watermill channel; plus missing rear-elevation evidence in Pass 1 captures).
- **Most Consequential Finding:** Across all five buildings, the main pitched roof tile courses pass uninterrupted through the roof dormers, slicing directly across each dormer's front wall and window glass (`HOUSE-01`). On the Inn, the front porch gable ridge overlaps the second-floor center window while the hanging tavern sign cuts directly through the front-right blue window shutter (`HOUSE-02`).

| Dimension | Pass 1 Score (`/10`) | Cap / Anchor Justification |
| :--- | :---: | :--- |
| **Structure** | **5 / 10** | Major structural interpenetrations (capped at `<= 6`): main roof tiles slice through all dormer windows (`HOUSE-01`); Inn porch peak clips into the 2nd-floor center window and cross-gable beam swallows its arch (`HOUSE-02`); ground-floor window keystones poke through horizontal timber belts (`HOUSE-03`); Smithy shed roof cuts across the forge firebox (`HOUSE-04`); Gardener and Watermill collide in the lineup (`HOUSE-08`). |
| **Function** | **6 / 10** | Major functional contradictions (capped at `<= 6`): Smithy forge hearth opening sits up at roof-rafter height with the anvil wedged against the chimney base (`HOUSE-04`); Gardener picket gate opens directly into a raised bed wall and cabbages with no walkable path (`HOUSE-06`); Herbalist greenhouse lacks an entrance and rear-corner vertical framing (`HOUSE-05`); Watermill wheel sits on flat turf without a recessed millrace channel (`HOUSE-07`). |
| **Intent** | **8 / 10** | All 5 requested Tudor archetypes (`inn`, `herbalist`, `smithy`, `gardener`, `watermill`) are present, distinct in silhouette, and share a cohesive warm cream stucco, dark oak timber, blue shutter, and terracotta tile visual language. Minor deductions for annex integration issues. |
| **Finish** | **6 / 10** | Major facade finish flaws (capped at `<= 6`): Inn hanging sign interpenetrates the ground-floor right shutter (`HOUSE-02`), cross-gable roof lacks a clean valley/bargeboard termination, and Pass 1 captures omit rear/opposing angles (`HOUSE-09`). |
| **Overall** | **5 / 10** | **Lowest evaluated required dimension (`Structure: 5/10`), never an average.** |

---

## 2. Blind Inventory of Pass 1 Captures (`shots/pass1/*.png`)

Written strictly from visual inspection of the 7 rendered PNGs prior to reading any `.js` source file:

1. [`inn-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/inn-3q.png) & [`inn-front.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/inn-front.png):
   - Two-story half-timbered building on a light-grey stone block plinth with three stepped front stairs leading to an arched wooden double door.
   - Front porch with a pitched terracotta roof supported by two tall wooden posts on stone plinth blocks (posts clear the front stairs cleanly on either side).
   - Five front windows (two ground floor, three second floor) plus one left-wall ground-floor window, each with blue louvered shutters, brown flower boxes with tiny geometric flower buds, and radial white stone arch voussoirs.
   - A large central cross-gable on the front roof slope and a small gabled roof dormer to its right; stone chimney stack rising behind the ridge.
   - A wooden picnic table with two benches on a stone pad at front-left, a black wall lantern to the right of the door, and a hanging wooden sign with a gold circle mounted on the right side of the porch.
2. [`herbalist-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/herbalist-3q.png):
   - 1.5-story half-timbered cottage with a stone plinth, three front steps, central arched door with a small cantilevered gable hood, two front windows with blue shutters and flower boxes, one right-side roof dormer, and a stone chimney.
   - Left (`-X`) side wall features a lean-to glass greenhouse on a low stone base wall with a wood-framed sloped glass roof and two interior dark rectangular planter troughs holding rows of green/purple herb clusters.
3. [`smithy-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/smithy-3q.png):
   - 1.5-story half-timbered cottage with front door hood, two front windows, left-side roof dormer, and a massive stone forge chimney on the right (`+X`) gable wall.
   - Right (`+X`) side features an open-sided lean-to shed with a terracotta tile roof supported by three wooden posts over a stone slab platform, housing a stone forge breast with a glowing orange firebox, an anvil on a timber stump, a water-filled quench barrel, and three stacked wooden barrels at the rear.
4. [`gardener-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/gardener-3q.png):
   - 1.5-story half-timbered cottage with front door hood, two front windows, one right-wall window, left-side roof dormer, and stone chimney.
   - Right (`+X`) side features a low stone-walled garden enclosure with front corner piers, a low wooden picket gate, and three dark-brown raised soil beds planted with rows of green cabbages.
5. [`watermill-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/watermill-3q.png):
   - Two-story building with a full stone-block ground story capped by a projecting stone cornice ledge, a half-timbered upper story, steep terracotta roof with one right-side dormer, front steps, arched door with gable hood, and two front ground-floor windows.
   - Left (`-X`) side features a large wooden paddle waterwheel on a horizontal axle supported between the stone house wall and an exterior freestanding stone pier.
6. [`all-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/all-lineup.png):
   - Wide front-elevation lineup of all 5 buildings from left to right (`inn`, `herbalist`, `smithy`, `gardener`, `watermill`) on a green ground plane.

---

## 3. Ranked Findings & Repair Handoff

### `HOUSE-01` — Main Roof Tile Courses Slice Directly Through All Roof Dormer Windows
- **Severity:** **Major** (`Structure`)
- **Location:** `C:\Users\silen\projects\kilo-3d-kit\world\assets\houses\` — Roof dormer sub-assembly across all 5 buildings (`inn`, `herbalist`, `smithy`, `gardener`, `watermill`).
- **Observed Defect:** The dormer body sits recessed into the main roof slope such that the raised terracotta tile courses of the main roof pass straight through the dormer's front wall, stone jambs, and blue glass window panes. A diagonal orange band of main-roof tiles is clearly visible cutting across the lower half of every dormer window. Additionally, the dormer's white stone arch/jamb blocks protrude wider than the dormer cheek walls.
- **Evidence:**
  - [`herbalist-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/herbalist-3q.png) (upper-right roof dormer: orange main-roof tile strips cut horizontally across the dormer window panes and white jambs).
  - [`smithy-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/smithy-3q.png) (upper-left roof dormer: main roof tiles slice through the dormer window and flower box).
  - [`gardener-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/gardener-3q.png) & [`watermill-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/watermill-3q.png) (same roof-tile penetration through dormer face).
  - [`inn-front.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/inn-front.png) (right roof dormer sits cramped next to the cross-gable and exhibits tile clipping at its base sill).
- **Correction Target:** Position and protrude each dormer's front wall forward (`+Z`) and upward (`+Y`) relative to the main roof slope so the entire dormer front face, window frame, sill, and flower box sit completely clear in front of the outer surface of the main roof tile rows, with deep cheek walls bridging back into the roof slope and clean timber framing around the dormer window instead of oversized protruding stone quoins.
- **Recheck:** Inspect `inn-front.png`, `inn-3q.png`, `herbalist-3q.png`, `smithy-3q.png`, `gardener-3q.png`, and `watermill-3q.png` in `shots/pass2/` to confirm zero main-roof tile intersection across any dormer window or front wall.

### `HOUSE-02` — Inn Front Porch Peak, Cross-Gable Beam, and Hanging Sign Collide with Windows & Shutters
- **Severity:** **Major** (`Structure`, `Finish`)
- **Location:** `C:\Users\silen\projects\kilo-3d-kit\world\assets\houses\` — `inn` front facade (`porch`, `crossGable`, upper center window, and hanging tavern sign).
- **Observed Defect:**
  1. In [`inn-front.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/inn-front.png) and [`inn-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/inn-3q.png), the apex and ridge tiles of the front porch gable rise too high (`y`), directly overlapping and occluding the flower box and lower frame of the second-story center window.
  2. The top stone arch voussoirs of the second-story center window clip into the horizontal base tie-beam of the front cross-gable.
  3. The hanging tavern sign on the right side of the porch is positioned at an `X/Z` coordinate that slices directly through the blue left shutter of the ground-floor right window.
  4. The front cross-gable's sloped bargeboards hang past the horizontal eaves line without a clean valley roof tie-back into the main roof ridge.
- **Evidence:**
  - [`inn-front.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/inn-front.png) (center porch apex overlaps upper center window; upper center window arch clips into cross-gable beam; hanging sign board cuts through the ground-floor right window's left blue shutter).
  - [`inn-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/inn-3q.png) (confirms 3D penetration of the hanging sign into the shutter and porch ridge into the upper window box).
- **Correction Target:**
  1. Lower the Inn porch eave/ridge height slightly and/or raise the second-story window line/eaves so there is clear vertical separation between the porch ridge cap and the second-story center window's flower box, and between the second-story window arches and the upper eaves/cross-gable tie-beam.
  2. Mount the hanging tavern sign forward (`+Z`) on the right porch post (projecting outward or to the side clear of the wall) so it hangs cleanly in front of the porch without touching or occluding the ground-floor window shutter.
  3. Extend the cross-gable roof ridge/slopes back into the main roof plane so it forms a coherent intersecting gable roof rather than a flat floating triangle, and shift the Inn's right dormer slightly right (`+X`) so it has breathing room from the cross-gable.
- **Recheck:** Inspect `shots/pass2/inn-front.png` and `shots/pass2/inn-3q.png` to verify daylight clearance between the porch ridge and upper window box, full visibility of all window stone arches below the beams, and zero intersection between the tavern sign and window shutters.

### `HOUSE-03` — Ground-Floor Window Stone Arch Keystones Poke Through Horizontal Timber Beams & Stone Cornices
- **Severity:** **Major** (`Structure`, `Finish`)
- **Location:** `C:\Users\silen\projects\kilo-3d-kit\world\assets\houses\` — Window arch assembly vs. mid-wall horizontal timber belt (`herbalist`, `smithy`, `gardener`) and stone belt cornice (`watermill`), plus door hood brackets.
- **Observed Defect:** On the 1.5-story cottages (`herbalist`, `smithy`, `gardener`), the topmost white stone keystone of every ground-floor window arch extends above and forward of the horizontal mid-wall timber beam, poking out of the top of the brown wooden beam as a stray white block. On the `watermill`, the projecting stone cornice ledge between the 1st and 2nd stories cuts straight through the top stone voussoirs of the ground-floor windows, and the door gable hood straddles the stone cornice ledge awkwardly.
- **Evidence:**
  - [`herbalist-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/herbalist-3q.png) (white stone rectangle pokes through the top of the horizontal timber beam above both front windows).
  - [`smithy-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/smithy-3q.png) & [`gardener-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/gardener-3q.png) (same keystone protrusion through horizontal timber beam).
  - [`watermill-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/watermill-3q.png) (stone cornice belt slices through top window voussoirs and door hood).
- **Correction Target:** Adjust ground-floor window vertical placement (`y`) and/or arch radius and mid-wall belt height so every window's stone arch voussoirs sit cleanly below the horizontal timber beam / stone belt course with zero protrusion through the beam, and position the door hood cleanly below or integrated with the belt course.
- **Recheck:** Inspect all 5 building close-ups in `shots/pass2/` to confirm no stone arch blocks poke above horizontal beams or clip into the Watermill's stone cornice.

### `HOUSE-04` — Smithy Forge Hearth Opening Clips Into Shed Roof Rafters, Chimney Clips Gable Brace, and Anvil Lacks Workspace Clearance
- **Severity:** **Major** (`Structure`, `Function`)
- **Location:** `C:\Users\silen\projects\kilo-3d-kit\world\assets\houses\` — `smithy` right-side (`+X`) forge annex (`smithy-3q.png`).
- **Observed Defect:**
  1. The glowing forge firebox opening is placed far too high on the chimney breast, causing the sloped wooden roof beam and terracotta tiles of the lean-to shed to slice across the top of the glowing fire opening.
  2. Higher up on the `+X` gable wall, the diagonal timber brace intersects the stone chimney stack while the chimney cuts through the right roof verge/bargeboard.
  3. On the forge floor, the anvil on its wooden stump is jammed against the stone base of the forge hearth and quench barrel, leaving no standing room for a smith.
- **Evidence:**
  - [`smithy-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/smithy-3q.png) (right-side forge annex: orange glowing coals are clipped by the shed's front-sloping rafter; anvil is wedged against the hearth base; upper gable diagonal timber clips into the chimney).
- **Correction Target:**
  1. Lower the forge hearth waist/firebox opening to a realistic working height (`~0.95m–1.15m` above the forge floor deck) well below the lean-to shed roof rafters, with a proper stone hood corbeling into the chimney flue below the roof plane.
  2. Center the chimney cleanly on the `+X` gable wall (or adjust the gable brace layout) so the chimney rises cleanly without asymmetric bargeboard/brace clipping.
  3. Move the anvil + stump forward/outward into the center of the forge work deck with clear standing room between the hearth, anvil, and quench barrel.
- **Recheck:** Inspect `shots/pass2/smithy-3q.png` and rear/side views to confirm the glowing forge opening sits completely clear below the shed roof, the anvil has walkable space around it, and the chimney-to-gable junction is clean.

### `HOUSE-05` — Herbalist Greenhouse Lacks Rear-Corner Vertical Framing, Wall Ledger Posts, and Functional Entry
- **Severity:** **Major** (`Structure`, `Function`)
- **Location:** `C:\Users\silen\projects\kilo-3d-kit\world\assets/houses\` — `herbalist` left-side (`-X`) greenhouse annex (`herbalist-3q.png`).
- **Observed Defect:**
  1. Looking through the transparent front glass of the greenhouse in [`herbalist-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/herbalist-3q.png), the rear-left corner lacks a vertical wooden corner post (the horizontal mid-rail and eave beam appear to end at thin glass), and there are no vertical wall-side posts framing the triangular gable glass against the house wall.
  2. The greenhouse is completely sealed on all four sides by a continuous stone knee-wall with no door or entry step from the outside or house.
  3. The interior herb beds sit slightly too close to the front glass wall.
- **Evidence:**
  - [`herbalist-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/herbalist-3q.png) (left greenhouse annex: continuous stone knee-wall across front with no door; missing rear-left vertical corner post and wall-junction posts).
- **Correction Target:**
  1. Add complete timber framing to the greenhouse: rear-left vertical corner post, front and rear vertical wall-junction posts against the cottage wall, and sloped end rafters framing the triangular glass gables.
  2. Add a framed wooden greenhouse door with a small stone step on the front (`+Z`) face of the greenhouse (and/or a central aisle between the two planter tables) so the herbalist workspace has a clear functional entrance and interior walkway.
- **Recheck:** Inspect `shots/pass2/herbalist-3q.png` and `shots/pass2/all-rear-lineup.png` to verify complete 4-corner timber framing and a visible, unobstructed front greenhouse doorway with interior aisle clearance.

### `HOUSE-06` — Gardener Walled Plot Gate Opens Directly Into a Raised Soil Bed Wall and Clipped Cabbages
- **Severity:** **Major** (`Function`, `Structure`)
- **Location:** `C:\Users\silen\projects\kilo-3d-kit\world\assets\houses\` — `gardener` right-side (`+X`) walled garden annex (`gardener-3q.png`).
- **Observed Defect:**
  1. In [`gardener-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/gardener-3q.png), the wooden picket gate on the front (`+Z`) stone wall opens directly into the side board of the front-most raised wooden planter bed and a row of cabbages that are partially clipped into the inside of the front stone wall. There is no walkable path inside the gate.
  2. The garden wall's grey foundation plinth is much shallower (`min.y`) than the house's deep stone plinth, creating an abrupt step at the house-to-garden wall seam.
- **Evidence:**
  - [`gardener-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/gardener-3q.png) (bottom-right garden gate: cabbages and dark soil bed sit immediately behind the wooden gate bars with zero walkway clearance).
- **Correction Target:**
  1. Arrange the raised soil beds inside the walled garden so a clear gravel/stone walkway leads inward from the front picket gate, with all cabbages centered cleanly atop their soil beds without touching the stone perimeter walls or blocking the gate opening.
  2. Extend the garden enclosure's stone foundation plinth down to match the house's deep plinth depth (`min.y <= -1.4m`) so it never floats on sloped terrain.
- **Recheck:** Inspect `shots/pass2/gardener-3q.png` to confirm the picket gate opens onto a clear interior walkway and all cabbages sit cleanly inside the raised beds.

### `HOUSE-07` — Watermill Wheel Sits on Flat Ground Without a Recessed Stone Millrace Channel or Axle Bearing Block
- **Severity:** **Major** (`Function`, `Structure`)
- **Location:** `C:\Users\silen\projects\kilo-3d-kit\world\assets\houses\` — `watermill` left-side (`-X`) wheel assembly (`watermill-3q.png`).
- **Observed Defect:**
  1. In [`watermill-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/watermill-3q.png), the bottom paddles of the waterwheel sit directly against the flat green ground plane (`y = 0`) between the house wall and the outer stone pier, with no stone water trough/millrace raceway channel or water surface to indicate how water drives the wheel.
  2. The outer stone pier's top lacks a dark iron/wood axle pillow-block bearing where the main shaft rests.
- **Evidence:**
  - [`watermill-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/watermill-3q.png) (left waterwheel bottom paddles touch flat grass; axle terminates abruptly into the white stone pier).
- **Correction Target:**
  1. Build a stone-lined millrace trough/channel (extending down into the `-2.5m` deep plinth with stone side walls and a blue-tinted water chute surface) flanking the lower arc of the waterwheel between the mill wall and the outboard stone pier.
  2. Add a heavy iron/timber bearing block atop the outboard stone pier supporting the rotating axle hub.
- **Recheck:** Inspect `shots/pass2/watermill-3q.png` to verify the waterwheel paddles dip cleanly into a framed stone millrace channel with an axle bearing block on the outer pier.

### `HOUSE-08` — Lineup Spacing Causes Gardener and Watermill Annexes to Collide in `all-lineup.png`
- **Severity:** **Major** (`Structure`)
- **Location:** `C:\Users\silen\projects\kilo-3d-kit\world\assets\houses\` — `buildAllVillageBuildings` lineup spacing (`all-lineup.png`).
- **Observed Defect:** In [`all-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/all-lineup.png), the Gardener's right-side (`+X`) walled garden directly abuts/collides with the Watermill's left-side (`-X`) outboard stone pier and waterwheel, leaving zero separation between the two buildings.
- **Evidence:**
  - [`all-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/all-lineup.png) (between 4th and 5th buildings: Gardener right stone wall touches Watermill left stone pier).
- **Correction Target:** Increase the horizontal spacing in `buildAllVillageBuildings` (or compute center positions from each building's actual X-extent including side annexes) so every building in `all-lineup.png` has at least `3.5m–4.5m` of clean daylight separation between adjacent side annexes.
- **Recheck:** Inspect `shots/pass2/all-lineup.png` and `shots/pass2/all-rear-lineup.png` to confirm clear separation between all 5 buildings.

### `HOUSE-09` — Insufficient Rear/Opposing View Coverage in Pass 1 Captures
- **Severity:** **Minor** (`Finish` / Evidence Gate)
- **Location:** `C:\Users\silen\projects\kilo-3d-kit\world\assets\houses\shoot.mjs`
- **Observed Defect:** All 7 screenshots in `shots/pass1/` are captured from the front (`+Z`) hemisphere. Rear (`-Z`) facades, back roof slopes, rear windows/framing, and the backs of side annexes (`greenhouse`, `forge`, `garden`, `waterwheel`) are unverified in Pass 1.
- **Evidence:**
  - [`all-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass1/all-lineup.png) and the 6 individual front/3Q shots in `shots/pass1/`.
- **Correction Target:** Update `shoot.mjs` to render an 8th capture (`all-rear-lineup.png`, rear 3/4 overview from `-Z`) in addition to the 7 required shots, and verify that all rear elevations have complete half-timber framing, windows/details, and clean annex backs.
- **Recheck:** Inspect `shots/pass2/all-rear-lineup.png` with `view_file`.

---

## 4. Acceptance Scope & Verification Contract

To pass Stage 2 — Pass 2, the Tudor Village Houses Kit (`world/assets/houses/`) must satisfy both the **Programmatic Verification Contract** (`node world/assets/houses/verify.mjs`) and the **Visual Recheck Contract** (`shots/pass2/*.png`):

1. **Building Contract (`createBuilding(type, opts)` & Builders):**
   - All 5 building types (`inn`, `herbalist`, `smithy`, `gardener`, `watermill`) build cleanly in headless Three.js without errors.
   - Every building exports `doorWorldOffset` with `localX === 0` and `localZ === +(d * 0.5 + 1.35).toFixed(3)` matching its main body depth `d`.
   - Every building exports a valid `collider` (`type: 'aabb'`, finite `halfW > 0`, `halfD > 0`, `height > 0`) and `parts` dictionary.
   - Deep foundation plinths: bounding box `min.y <= -1.4m` for `inn`, `herbalist`, `smithy`, `gardener`, and `min.y <= -2.5m` for `watermill` (including side annexes so nothing floats on sloped terrain).
   - `watermill.update(dt)` deterministically rotates the waterwheel around its horizontal (`X`) axis.
2. **Performance & Draw-Call Contract (`buildAllVillageBuildings`):**
   - Combined 5-building lineup uses **`<= 16` draw calls** (merged material buckets + animated waterwheel) and **`<= 48,000` triangles**.
   - Non-Overlapping Lineup: adjacent buildings in `buildAllVillageBuildings()` have strictly non-overlapping world X bounding intervals (`gap >= 2.5m` between adjacent bounding boxes).
3. **Render & Visual QA Contract (`shots/pass2/`):**
   - `shots/pass2/report.json` records `0` console/page errors and confirms all 7 core shots plus `all-rear-lineup.png` rendered cleanly.
   - All 9 findings (`HOUSE-01` through `HOUSE-09`) are visually resolved and re-scored `>= 8/10` across all 4 `judging-3d-scenes` dimensions (`Structure`, `Function`, `Intent`, `Finish`, `Overall`).

---

## 5. Pass 2 Recheck Verdict, Evidence & Scores

- **Recheck Verdict:** **Pass within inspected scope** (`Stage = Refined asset/exterior`)
- **Programmatic Verification (`node world/assets/houses/verify.mjs`):** `PASS`
  - Combined 5-building lineup: **`15` draw calls** (budget `<= 16`) and **`46,544` triangles** (budget `<= 48,000`).
  - Console/Page Errors in [`shots/pass2/report.json`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/report.json): **`0`**.
  - Deep foundation plinths verified: `inn`, `herbalist`, `smithy`, `gardener` `min.y = -1.50m` (`<= -1.4m`); `watermill` `min.y = -2.60m` (`<= -2.5m`).
  - Exact `doorWorldOffset` (`localX = 0, localZ = d * 0.5 + 1.35`) and `watermill.update(dt)` rotation verified.

### Finding-by-Finding Visual Recheck (`shots/pass2/*.png`)

1. **`HOUSE-01` (Roof Dormers vs. Main Roof Tiles) — RESOLVED:**
   - Verified across [`inn-front.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/inn-front.png), [`inn-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/inn-3q.png), [`herbalist-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/herbalist-3q.png), [`smithy-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/smithy-3q.png), [`gardener-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/gardener-3q.png), and [`watermill-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/watermill-3q.png). Analytical placement (`computeDormerSpec`) and tile culling (`skipFn`) place every dormer's front face, window, timber corner posts, and flower box cleanly above and forward of the main roof tile courses with zero tile penetration.
2. **`HOUSE-02` (Inn Porch Peak, Cross-Gable & Hanging Sign) — RESOLVED:**
   - Verified in [`inn-front.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/inn-front.png) and [`inn-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/inn-3q.png). The porch ridge (`y = 3.44m`) sits cleanly below the second-story center window's flower box with visible cream stucco separation; all upper window stone arches sit cleanly below the cross-gable and eaves beams; and the hanging tavern sign (`x = 2.11m`) hangs cleanly inside the open stucco bay between the right porch post and the ground-floor right window's left shutter (`x = 2.61m`).
3. **`HOUSE-03` (Ground-Floor Window Keystones vs. Horizontal Belts) — RESOLVED:**
   - Verified across all 5 building close-ups in `shots/pass2/`. Tightened stone arch radii (`w/2 + 0.14`) and adjusted horizontal timber/stone belt heights provide `0.20m–0.34m` of clean wall clearance above every ground-floor window arch and door hood.
4. **`HOUSE-04` (Smithy Forge Hearth, Chimney Gable Braces & Anvil Workspace) — RESOLVED:**
   - Verified in [`smithy-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/smithy-3q.png). The forge chimney rises symmetrically at `z = 0` on the `+X` gable wall with inward-sloping gable timber braces framing into the stack; the waist-high stone hearth (`y = 1.04m`) and glowing orange coals sit under a corbeled stone smoke hood completely visible beneath the raised shed roof (`eaveY = 3.12m`); and the anvil + quench barrel sit in an open, walkable workspace.
5. **`HOUSE-05` (Herbalist Greenhouse Framing & Conservatory Doorway) — RESOLVED:**
   - Verified in [`herbalist-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/herbalist-3q.png) and [`all-rear-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/all-rear-lineup.png). Complete 4-corner and wall-junction timber posts frame the glass conservatory, and a front timber-and-glass doorway with a stone threshold step opens onto a central stone aisle between the two herb planter benches.
6. **`HOUSE-06` (Gardener Walled Plot Gate & Walkway) — RESOLVED:**
   - Verified in [`gardener-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/gardener-3q.png). The wooden picket gate opens onto a stone-flagged central walkway flanked by U-shaped raised timber soil beds with all cabbages sitting cleanly inside their frames.
7. **`HOUSE-07` (Watermill Stone Millrace Channel, Flume & Axle Bearing) — RESOLVED:**
   - Verified in [`watermill-3q.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/watermill-3q.png). The waterwheel dips into a stone-lined millrace trough with flowing water, whitewater foam, an elevated timber headrace water flume, and an iron pillow-block axle bearing atop the outboard stone pier.
8. **`HOUSE-08` & `HOUSE-09` (Lineup Separation & Rear Elevation Coverage) — RESOLVED:**
   - Verified in [`all-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/all-lineup.png) and [`all-rear-lineup.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/shots/pass2/all-rear-lineup.png). All 5 buildings have `>= 3.4m` of daylight separation and complete rear half-timber framing, windows, and annex backs.

| Dimension | Pass 1 Score | Pass 2 Recheck Score (`/10`) | Pass 2 Justification |
| :--- | :---: | :---: | :--- |
| **Structure** | 5 / 10 | **9 / 10** | Zero roof-tile-through-dormer clipping, zero window-arch-through-beam clipping, clean chimney-to-gable framing, deep terrain-safe plinths (`-1.5m` / `-2.6m`), and non-overlapping lineup bounds. |
| **Function** | 6 / 10 | **9 / 10** | Every building and annex is functionally coherent: front steps clear porch posts, greenhouse has a stepped entry door and central aisle, smithy hearth is at waist height with clear anvil workspace, garden gate opens onto a stone path, and waterwheel runs in a stone millrace trough with headrace flume and axle bearings. |
| **Intent** | 8 / 10 | **9 / 10** | All 5 Tudor archetypes are immediately distinguishable from any angle (front, 3/4, or rear) and share a cohesive cel-shaded architectural vocabulary. |
| **Finish** | 6 / 10 | **9 / 10** | Clean inverted-hull outlines, procedural hand-painted textures, zero console/WebGL warnings, and complete multi-angle + rear-elevation verification within budget (`15` draw calls, `46,544` triangles). |
| **Overall** | **5 / 10** | **9 / 10** | **Lowest evaluated required dimension (`9 / 10`), never an average.** |
