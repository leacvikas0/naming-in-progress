# Terrain, Water & Landmarks — Pass 2 Blind Critique & Verification Scope

## 1. Pass 1 `judging-3d-scenes` Verdict & Scores

- **Judged Stage:** `Refined asset/exterior` (Stage Gate 2 — Terrain, Water & Landmarks Kit)
- **Verdict:** **Changes Needed** (Multiple Major structural, functional, and finish defects across terrain seam stitching, road-to-doorstep/landmark alignment, waterfall/flume hydraulic geometry, and landmark/tree silhouette craft)

| Dimension | Pass 1 Score | Cap / Anchor Rationale |
| :--- | :---: | :--- |
| **Structure** | **5 / 10** | **Major (capped at 6):** Visible sky-colored T-junction seam cracks along the `±140m` inner-to-outer terrain boundary; jagged vertical tear on the left edge of the waterfall ribbon; upstream river plane protruding into mid-air; timber flume stopping short of the waterwheel apex; pier abutment curb floating over the bank slope. |
| **Function** | **5 / 10** | **Major (capped at 6):** Green grass ring gap separating the central Well Plaza disk from the surrounding dirt ring road; Watermill-to-Pier road missing the Stone Pier Abutment and terminating in the pond shoreline to the north; southern house doorsteps/porches oriented away from radial road stubs; Shrine altar pedestal placed off-center blocking the left arch pillar. |
| **Intent** | **6 / 10** | **Major (capped at 6):** Waterfall cliff built from 6 axis-aligned rectangular cubes ("Minecraft blocks") instead of layered rock strata; moored boat is a rectangular slab without bow prow or hollow gunwale; cherry/wisteria canopies use sharp `detail=1` octahedra with harsh two-tone color splits and rigid bead-stack pendants. |
| **Finish** | **5 / 10** | **Major (capped at 6):** Patchy road shader switching abruptly between grey cobblestones and bare dirt along the ring road and radial spokes; partial black toon outlines appearing randomly on single edges of the pier ramp, stair stringers, and arena gate post; polygonal 28-sided Shrine rim with tan ground-mask halo bleed. |
| **Overall** | **5 / 10** | **Lowest evaluated required dimension (`5 / 10`), never an average.** |

---

## 2. Blind Visual Inventory of `shots/pass1/*.png`

1. **[`shrine-arch-stairs.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/shrine-arch-stairs.png):**
   - Elevated circular stone platform on the north hill with an 8-petal blue-and-gold floor medallion at center, approached from the south by a wide stone staircase with stepped side stringers and two square newel posts topped with yellow lantern cubes.
   - Romanesque stone archway behind the medallion with rusticated square pillars and a semicircular arch ring + keystone. An octagonal stone pedestal with a floating cyan diamond sits off-center to the left right in front of the left arch pillar.
   - Flanking the arch are a pink cherry tree (left) and purple/pink wisteria tree (right) in raised stone planter rings. Tree canopies are composed of 4–5 large flat-shaded low-poly polyhedra with rigid vertical chains of 3–4 diamond beads hanging underneath.
   - In the left and right background hills, thin cyan/sky-colored horizontal seam lines cut across the green terrain slope where the inner terrain meets the outer skirt.

2. **[`waterfall-flume-channel.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/waterfall-flume-channel.png):**
   - Half-timbered watermill house on the right with a large wooden spoked waterwheel on its west wall, sitting beside a teal millpond.
   - To the left of the mill, a cyan waterfall ribbon descends between six axis-aligned grey rectangular boxes topped with smaller flat square caps.
   - The waterfall ribbon has a severe jagged vertical step/tear along its left third, and at the top crest, the horizontal upstream water ribbon pokes out into mid-air to the left of the cliff box.
   - A brown wooden trestle flume supported by three thin vertical posts starts in front of the upper waterfall face and terminates above the left rim of the waterwheel (failing to reach the top center overshot point of the wheel).
   - Underneath the waterwheel, a bright cyan rectangular tailrace slab juts out at an angle into the teal pond water with a hard rectangular edge.
   - In the upper-right background hill behind the neighboring Tudor house, a sky-blue seam line cuts horizontally across the terrain.

3. **[`pier-shoreline.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/pier-shoreline.png):**
   - Circular teal millpond with animated light-blue ripple ellipses and a sandy shoreline ring.
   - Extending from the eastern shore into the pond is a wooden plank pier on timber pilings with bollards, a tall lantern post at the tip, and a brown rectangular boat floating alongside the south edge.
   - At the shore end of the pier sits a large grey stone abutment ramp with side curbs; its right curb and rear step float above the green grass bank, and two of its edges have dark black lines while the rest do not.
   - The cobblestone road coming down from the watermill curves into the sandy shore **north** of the stone pier abutment, failing to connect to the abutment ramp.

4. **[`wisteria-trees-arena.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/wisteria-trees-arena.png):**
   - Circular sandy combat ring enclosed by a cobblestone border ring and a timber split-rail fence with a west entrance gap flanked by lantern posts.
   - Three wisteria trees and two small green trees surround the outer perimeter. The wisteria canopies show stark flat-shaded octahedra in two contrasting purple/pink shades colliding with hard creases.
   - Along the left and right distant hill horizons, thin cyan seam cracks are visible along the terrain chunk/skirt boundary, and a clipped white polygon hangs from the top-center sky edge.

5. **[`well-plaza-roads.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/well-plaza-roads.png):**
   - Central circular stone Well Plaza with a timber-roofed well at `(0,0)` surrounded by four low split-rail fence segments on stone posts.
   - Surrounding the stone plaza is an unintended **green grass moat ring**, outside of which runs a muddy brown dirt ring road with intermittent patches of grey cobblestone.
   - Four Tudor houses flank the plaza; the Grand North Staircase rises behind the well toward the Shrine Archway.

6. **[`aerial-overview.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/aerial-overview.png):**
   - High oblique bird's-eye view of the entire valley: central Well Plaza and 4 houses, North Staircase and Shrine platform, West Millpond + Waterfall + Watermill + Pier, East Wisteria Combat Ring, and South boundary road.
   - Clearly exposes the road network disconnects: the green ring around the Well Plaza, the blotchy transition between cobble pads and dirt roads, the southern houses facing away from their road stubs, and the Watermill-to-Pier path missing the pier abutment.
   - Exposes sky-colored seam cracks along the `±140m` square boundary between the inner terrain chunks and the outer mountain skirt, and shows mountain peak cones concentrated only in the NW quadrant while the NE/East/South mountain rim lacks peak silhouettes.

---

## 3. Ranked Findings (`TERR-01` – `TERR-06`)

### `TERR-01` — [Major | Structure] Inner-to-Outer Terrain Skirt Seam Cracks & Asymmetric Horizon Peaks
- **Location:** `world/assets/terrain/terrain-water.js` (`createTerrainChunkGeometries`, `createOuterSkirtGeometry`, `createMountainPeaksGeometry`).
- **Observed Defect:** Thin sky-blue T-junction gaps appear along the `x = ±140m` and `z = ±140m` boundary where the 16 high-resolution inner chunks (`36×36` segments each, `144` segments across `280m`) meet the single lower-resolution outer mountain skirt (`112×112` segments across `640m`). Because vertex positions along `±140m` do not share identical sample points and there is no vertical overlap lip, sub-pixel/multi-pixel cracks expose the sky clear color. Additionally, mountain peak cones are clustered only on the North/NW arc, leaving the East/SE/SW horizon looking like an empty ramped bowl.
- **Evidence:** [`aerial-overview.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/aerial-overview.png) (upper-right and upper-left `±140m` boundary lines), [`wisteria-trees-arena.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/wisteria-trees-arena.png) (left and right hill horizons), [`waterfall-flume-channel.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/waterfall-flume-channel.png) (hill behind right house).
- **Correction Target:**
  1. Ensure the outer skirt's inner hole boundary (`±140m`) either shares exact vertex alignment or extends slightly inward (`±138.5m`) with a tiny downward skirt lip / matched height-and-normal sampling so zero sky-bleed T-junction cracks can ever occur at any camera angle.
  2. Distribute sculpted alpine/foothill peaks around the full 360° distant mountain ring (preserving the grand northern peaks while framing East, West, and South vistas) and remove the stray low-hanging cloud polygon clipping the top of `wisteria-trees-arena.png`.
- **Recheck:** Inspect `aerial-overview.png`, `wisteria-trees-arena.png`, `waterfall-flume-channel.png`, and `pier-shoreline.png` in Pass 2 to confirm zero cyan/sky seam lines on any hill slope.

### `TERR-02` — [Major | Function & Finish] Road-to-Plaza Moat Gap, Patchy Cobble/Dirt Shader, and Doorstep/Pier Misalignment
- **Location:** `world/assets/terrain/geography.js` (`BUILDINGS`, `ROAD_SEGMENTS`, `evalRoadMask`, `createWorldMaskTexture`) and `world/assets/terrain/terrain-water.js` (terrain fragment shader).
- **Observed Defect:**
  1. A green grass moat (`r = 8m..11.5m`) separates the central Well Plaza stone cylinder from the surrounding village ring road because `evalRoadMask` starts the ring road outside the plaza disk instead of paving the entire central plaza footprint (`r <= 14.5m`) continuously into the ring road and radial spokes.
  2. The road shader transitions abruptly between grey cobblestones and muddy brown dirt mid-road because cobblestone weighting is only active on narrow `type === 'cobble'` segments rather than forming a continuous cobbled Village Plaza + Ring Road + House Forecourts that blend smoothly into compacted flagstone/gravel country lanes toward the Arena, Millpond, and South Gate.
  3. The path from the Watermill to the Pier terminates at the pond shore north of the Stone Pier Abutment (`(-46, 15)` vs abutment shore entrance), leaving the pier ramp disconnected on grass.
  4. The southern village houses (`cotSW`, `cotSE`) have their front porches/doors oriented away from the plaza/road stubs, and road stubs connect to building centers instead of `getBuildingDoorWorldPos(b)`.
- **Evidence:** [`well-plaza-roads.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/well-plaza-roads.png) (foreground grass ring around well plaza, blotchy cobble-to-dirt islands), [`pier-shoreline.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/pier-shoreline.png) (road missing pier abutment on right), [`aerial-overview.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/aerial-overview.png) (overall road network).
- **Correction Target:**
  1. Orient every village building so its front door faces the village road network naturally, and route each building's cobblestone forecourt/approach directly to `getBuildingDoorWorldPos(b)`.
  2. Route the Mill-to-Pier walkway cleanly onto the landward entrance of the Stone Pier Abutment (`(-43.5, 16.0)`).
  3. Fill the central Well Plaza ground mask (`r <= 14.8m`) continuously so there is zero grass moat between the Well Plaza stone curb and the surrounding ring road, and upgrade the gouache terrain shader so the village core has warm dressed cobblestones while outer radial avenues have warm sandstone flagstones/compacted pathing with feathered mossy stone borders.
- **Recheck:** Inspect `well-plaza-roads.png`, `pier-shoreline.png`, and `aerial-overview.png` in Pass 2; run `verify.mjs` to assert doorstep alignment and mask channel integrity.

### `TERR-03` — [Major | Structure & Intent] Waterfall Ribbon Tear, Floating Upstream Water, Disconnected Flume, and Blocky Cliff Boxes
- **Location:** `world/assets/terrain/terrain-water.js` (`createWaterSystem`) and `world/assets/terrain/landmarks.js` (`buildMillworkAndPier`, `buildWaterfallCliffRocks`).
- **Observed Defect:**
  1. The waterfall ribbon has a sharp vertical step/tear on its left side because its vertices sample `getTerrainHeight(wx, wz)` across the edge of the river channel cutout.
  2. The upstream river water mesh extends horizontally out of the cliffside into mid-air to the left of the waterfall crest.
  3. The timber trestle flume floats in front of the waterfall face and ends at the left rim of the waterwheel instead of channeling water from the upper cascade lip directly to the top-center overshot buckets of the waterwheel (`x = -46.8, z = -4.2`), with a water chute pouring onto the wheel.
  4. The waterfall cliff rocks are 6 axis-aligned grey rectangular boxes with flat square caps that read as stacked shipping boxes, and the tailrace under the wheel is an unblended cyan rectangle clipping the pond.
- **Evidence:** [`waterfall-flume-channel.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/waterfall-flume-channel.png) (center-left waterfall tear, top-left floating water lip, trestle flume stopping left of wheel, cubic cliff blocks, rectangular tailrace slab).
- **Correction Target:**
  1. Construct the waterfall cascade using a smooth, continuous analytical profile curve from the upper stream lip (`y = 4.35m`) down into the plunge pool (`y = -0.35m`) with curved crest, multi-layered foam/spray strips, and an upstream river ribbon whose width stays strictly nestled inside the carved terrain channel bed.
  2. Rebuild the waterfall cliff formation using sculpted, faceted, stratified rock buttresses and mossy boulders that frame both sides of the cascade and support the flume intake organically.
  3. Route the timber trestle flume from the upper waterfall intake basin right to the top-center overshot crown of the waterwheel, complete with diagonal knee braces, water flowing inside the trough, a pouring water arc onto the wheel paddles, and a stone-lined tailrace channel that merges seamlessly into the plunge pool foam.
- **Recheck:** Inspect `waterfall-flume-channel.png` and `pier-shoreline.png` in Pass 2.

### `TERR-04` — [Major | Structure & Intent] Stone Pier Abutment Overhang & Boxy Rowboat Silhouette
- **Location:** `world/assets/terrain/landmarks.js` (`buildMillworkAndPier`).
- **Observed Defect:**
  1. The Stone Pier Abutment is an oversized (`5.2m` wide) concrete slab whose right side curb and rear step float above the sloping shoreline bank, with stray black edge lines on only two box edges.
  2. The moored rowboat is a flat rectangular box (`3.2m × 1.3m`) with three flat boards on top, lacking a pointed bow/stern, hollow hull interior, thwarts, oars, or mooring line to the pier bollard.
- **Evidence:** [`pier-shoreline.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/pier-shoreline.png) (bottom-right abutment ramp, center-left rectangular boat).
- **Correction Target:**
  1. Proportion the Stone Pier Abutment cleanly (`~3.4m` wide) with deep foundation skirts anchored into the shoreline slope, dressed ashlar side parapets, and direct alignment with both the wooden pier deck and the cobblestone shore path.
  2. Sculpt a proper tapered wooden rowboat with pointed bow and stern, recessed inner hull floor, raised gunwale rim, wooden thwart seats, a pair of oars, and a braided mooring rope tied to the adjacent pier bollard.
- **Recheck:** Inspect `pier-shoreline.png` in Pass 2.

### `TERR-05` — [Major | Structure, Function & Finish] North Shrine Platform Rim, Off-Center Altar, and Archway Proportions
- **Location:** `world/assets/terrain/landmarks.js` (`buildNorthShrineAndStairs`) and `world/assets/terrain/geography.js`.
- **Observed Defect:**
  1. The Shrine platform cylinder (`28` radial segments) shows coarse polygonal facets along its foreground rim, overhangs the hillside on the left/right with an unstepped vertical wall, and has a blurry tan dirt halo outside its rim.
  2. The small crystal pedestal sits asymmetrically at `x = -3.8m` directly in front of the left archway pillar, visually colliding with the pillar base in `shrine-arch-stairs.png`.
  3. The Romanesque archway ring is noticeably thinner than its supporting pillars, the keystone is a plain box, and the stair stringers have partial black outlines on random edges.
- **Evidence:** [`shrine-arch-stairs.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/shrine-arch-stairs.png).
- **Correction Target:**
  1. Upgrade the Shrine platform to a smooth high-segment (`48` segments) tiered stone sanctuary terrace with a stepped retaining plinth base and carved stone perimeter balustrade/curb blocks so it sits majestically in the hill crown without a dirt halo bleed.
  2. Give the Romanesque Shrine Archway bold, cohesive architectural depth (molded plinths, fluted/rusticated piers, prominent impost capitals, deep voussoir arch ring with proud keystone, and flanking guardian lantern pedestals / symmetrically placed ritual braziers or centered sacred focal relationship that leaves the 8-petal medallion and arch vista unobstructed).
  3. Align the Grand North Staircase treads, stepped stone stringers, and newel lanterns cleanly into the south entrance of the Shrine terrace.
- **Recheck:** Inspect `shrine-arch-stairs.png` and `well-plaza-roads.png` in Pass 2.

### `TERR-06` — [Major | Intent & Finish] Harsh Low-Poly Octahedron Tree Canopies & Rigid Bead-Stack Blossoms
- **Location:** `world/assets/terrain/trees.js` (`createTrees`).
- **Observed Defect:**
  1. Cherry, Wisteria, and Meadow Oak canopies are built from `detail = 1` octahedra/icosahedra with high-contrast flat vertex colors (`#7a3ec8` next to `#e8b4d8`), making them read as sharp crystalline diamonds jammed together rather than lush gouache foliage domes.
  2. Hanging wisteria/cherry blossom clusters are vertical stacks of 3–4 detached diamond beads floating in straight columns below the canopy.
  3. Tree trunks are straight cylinders without root flare or primary limbs reaching into the canopy puffs.
- **Evidence:** [`shrine-arch-stairs.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/shrine-arch-stairs.png), [`wisteria-trees-arena.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass1/wisteria-trees-arena.png).
- **Correction Target:**
  1. Sculpt organic, multi-tiered gouache foliage canopies using higher-subdivision, softly flattened dome puffs (`detail = 2` with smooth height/radial color gradients and soft normal shading) supported by flared root trunks and spreading primary branches.
  2. Replace the detached bead stacks with graceful, tapered draping wisteria racemes (clustered panicle cones that hang naturally from the lower canopy boughs).
  3. Keep total scene triangle count strictly `< 55,000` and draw calls `<= 22`.
- **Recheck:** Inspect `shrine-arch-stairs.png`, `wisteria-trees-arena.png`, and `aerial-overview.png` in Pass 2; verify triangle and draw-call budgets in `verify.mjs`.

---

## 4. Acceptance Scope & Verification Contract

To pass Stage Gate 2 (Pass 2), the Terrain, Water & Landmarks kit must satisfy both **Programmatic Verification (`verify.mjs`)** and **Visual Recheck (`shots/pass2/*.png`)**:

1. **Exact `v7` Geography Contract (`geography.js`):**
   - `PLAY_BOUNDARY_RADIUS === 125`
   - `INNER_EXTENT === 140`
   - `ZONES.shrine.z === -86`
   - `ZONES.arena.x === 68`
   - `ZONES.millpond.x === -62`
   - `getBuildingDoorWorldPos(b)` returns a world position on the building's front doorway edge that connects directly to a road segment (`evalRoadMask(doorPos.x, doorPos.z).weight > 0.65`).
2. **World Mask Texture Contract (`createWorldMaskTexture(512)`):**
   - Channel `B` (foliage/grass exclusion, where `0.0` = excluded, `1.0` = open meadow turf) MUST equal `0.0` (`<= 0.02`, i.e. raw byte `<= 5`) at:
     - All 5 building centers (`BUILDINGS[i].x, BUILDINGS[i].z`)
     - Central Well Plaza (`0, 0`)
     - East Wisteria Combat Ring (`68, -4`)
     - North Shrine Platform (`0, -86`)
     - West Millpond (`-62, 6`)
   - Channel `B` MUST equal `1.0` (`>= 0.95`, i.e. raw byte `>= 242`) on open meadow turf spots.
3. **Render & Performance Contract (`shots/pass2/report.json`):**
   - `consoleErrors.length === 0`
   - `draws <= 22` across all 6 camera views
   - `triangles < 55000` (`totalSceneTriangles < 55000`) across all 6 camera views
   - All 6 Pass 2 PNGs rendered and non-empty
4. **Visual Quality Contract (`judging-3d-scenes` Pass 2 Recheck):**
   - Every dimension (`Structure`, `Function`, `Intent`, `Finish`, `Overall`) scores `>= 8 / 10` with zero Blockers or Majors remaining.
