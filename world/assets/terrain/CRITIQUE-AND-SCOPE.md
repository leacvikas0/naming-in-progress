# Stage 2 Pass 2 — Independent Blind Visual Critique & Verification Scope

## 1. Blind `judging-3d-scenes` Audit & Pass 1 Scores (`assembled-v3-pass1` & `terrain/shots/pass2`)

- **Judged Stage:** `Final presentation` / `Refined asset & assembled environment` (Stage Gate 2 Pass 2 — Assembled Haru-machi Valley vs. [`ref-target-trees.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-target-trees.png) and [`ref-house3d-style.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-house3d-style.png))
- **Verdict:** **Changes Needed** (Multiple obvious, human-noticeable Major flaws in tree canopy/blossom structure and color space consistency, missing directional shadows on buildings/landmarks/plaza, harsh 3D grass distance cutoffs and stair/road blade encroachment, and repetitive white-capped pyramid horizon mountains)

| Dimension | Pass 1 Score | Cap / Anchor Rationale (`judging-3d-scenes`) |
| :--- | :---: | :--- |
| **Structure** | **5 / 10** | **Major (capped at 6):** Every tree has the exact same symmetrical mushroom/pancake silhouette and identical 5-bough angles (reading as stamped clones in [`day-arena-wisteria.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-arena-wisteria.png) and spiky 9-pointed asterisks from above in [`aerial-masterplan.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/aerial-masterplan.png)); hanging blossoms use rigid vertical brown sticks (`1.35m` poles) dropping straight down under the boughs; horizon mountains are 28 identical 6-sided pyramids with identical horizontal white snow-cone caps (`y = 0.62`). |
| **Function** | **6 / 10** | **Major (capped at 6):** 3D grass tufts encroach onto the Grand North Staircase curbs (blades poking straight through the stone stringers in [`day-shrine-arch.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-shrine-arch.png)) and overhang the Village Plaza cobbles and East Arena dirt lane in [`day-plaza.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-plaza.png). |
| **Intent** | **5 / 10** | **Major (capped at 6):** Fails to capture key visual signatures of [`ref-target-trees.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-target-trees.png): (1) multi-tiered asymmetric umbrella leaf-frond sub-crowns with visible warm brown boughs between tiers and distinct 5-petal star-blossoms on the branches; (2) directional sun shadows across the plaza, houses, shrine arch, and meadow; (3) lush hillside meadow continuity (3D grass cuts off abruptly in a tight ring in [`day-arena-wisteria.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-arena-wisteria.png), [`day-mill-pier.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-mill-pier.png), and [`evening-sunset-vista.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/evening-sunset-vista.png), leaving bare plastic hills); (4) natural green/slate-blue mountain ridges without cartoon snow-cap triangles. |
| **Finish** | **5 / 10** | **Major (capped at 6):** Severe color-space mismatch in `trees.js` (`pow(col, 2.2)` without `<colorspace_fragment>` causes pitch-black bark and neon-purple fronds in [`terrain/shots/pass2/shrine-arch-stairs.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass2/shrine-arch-stairs.png) while blowing out top fronds to bleached white-pink in [`day-shrine-arch.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-shrine-arch.png)); flat untextured cylinder meshes (`plazaDisc`, `platformCurb`) cover up the procedural cobblestones on the Well Plaza and Shrine Overlook; pond water in [`day-mill-pier.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-mill-pier.png) is washed-out neon cyan with polygonal shoreline edges; sunset tint in [`evening-sunset-vista.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/evening-sunset-vista.png) (`[0.54, 0.38, 0.36]`) turns the green valley muddy olive-brown. |
| **Overall** | **5 / 10** | **Lowest evaluated required dimension (`5 / 10`), never an average.** |

---

## 2. Blind Visual Inventory of Inspected Evidence

### Reference Targets
- **[`ref-target-trees.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-target-trees.png):**
  - Warm medium-brown organic trunks with natural lean, splitting into multi-level spreading boughs and secondary branches that remain visibly framed between stepped horizontal foliage tiers.
  - Broad, faceted umbrella leaf-frond layers in fresh sunlit yellow-green (`#b5e568`), vibrant spring-green (`#8fd14f`), and cool emerald underside shade (`#5aa842`), accented by soft pastel sakura-pink leaf clusters on upper/outer tiers.
  - Distinct, readable 5-petal star-blossoms (white, blush pink, lavender, peach) with notched petal gaps clustered along the lower boughs and delicate short hanging stems.
  - Lush 3D grass and wildflower drifts (yellow, white, pink, blue-violet) in the foreground transitioning seamlessly into painterly sunlit yellow-green/spring-green stippled hillsides, crossed by crisp directional tree canopy shadows.
  - Rounded/faceted green midground hills and atmospheric slate-blue/grey background mountain ridges with zero white snow-cone caps.
- **[`ref-house3d-style.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-house3d-style.png):**
  - Crisp Tudor cottage with warm cream stucco, dark ink outlines, terracotta tile roof, stone quoins, blue paned windows, and a strong directional ground shadow anchoring the building to the lawn.

### Pass 1 World Renders (`world/shots/assembled-v3-pass1/*.png`) & Terrain Kit Renders (`world/assets/terrain/shots/pass2/*.png`)
1. **[`day-plaza.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-plaza.png) & [`night-plaza-lanterns.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/night-plaza-lanterns.png):**
   - Central Well Plaza and Tudor cottages look crisp in architecture, but the houses, roofed well, bollard fences, and player pawn cast **zero directional shadows** on the ground.
   - A flat untextured grey cylinder (`plazaDisc`) covers the center of the plaza, hiding the procedural cobblestones.
   - 3D grass tufts encroach onto the grey cobblestone apron on the left and across the east dirt road on the right.
   - Background horizon shows sharp geometric pyramids with identical white triangle snow-caps.
2. **[`day-mill-pier.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-mill-pier.png) & [`pier-shoreline.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass2/pier-shoreline.png):**
   - In `day-mill-pier.png`, the pond is flat bright cyan with hard polygonal straight-line segments along the right sandy beach.
   - Behind the two trees on the left shore, the hillside is 100% bare smooth plastic green with an obvious cutoff where tiny grass dots stop.
   - Four identical sharp white-capped pyramids line the northern horizon.
3. **[`day-arena-wisteria.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-arena-wisteria.png) & [`wisteria-trees-arena.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass2/wisteria-trees-arena.png):**
   - Eight trees around the arena fence all share the exact same symmetrical flat-topped mushroom silhouette and branch angles, reading as clones.
   - Hanging wisteria/blossoms read as stiff vertical bead-curtains hanging on straight brown vertical sticks.
   - Because the toroidal grass focus sits inside the sandy arena ring (`foliageMask = 0`), the grass behind the arena shrinks to microscopic confetti specks and cuts off completely right behind the trees, leaving a barren green background hill.
4. **[`day-shrine-arch.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/day-shrine-arch.png), [`night-moon-shrine.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/night-moon-shrine.png) & [`shrine-arch-stairs.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/shots/pass2/shrine-arch-stairs.png):**
   - Large 3D grass blades in the bottom-left and bottom-right foreground clip straight through the stone staircase stringer walls.
   - The Shrine platform floor is a flat untextured beige cylinder (`platformCurb`) that hides the procedural Shrine flagstones and prevents directional shadows from appearing on the terrace.
   - In `shrine-arch-stairs.png` (`terrain/shots/pass2`), tree trunks are pitch-black and top fronds are harsh saturated purple because `trees.js` outputs `pow(col, 2.2)` without sRGB output conversion in `preview.html`, whereas in `day-shrine-arch.png` the top fronds blow out to pale white-pink under `post.js` ACES exposure.
5. **[`evening-sunset-vista.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/evening-sunset-vista.png) & [`aerial-masterplan.png`](file:///C:/Users/silen/projects/kilo-3d-kit/world/shots/assembled-v3-pass1/aerial-masterplan.png):**
   - In `evening-sunset-vista.png`, the 3D grass cuts off in a sharp horizontal band halfway through the village because `uPlayerPos` is centered on the northern stairs (`z = -37.5`) with only a `56m` radius, leaving the southern village and pond shoreline bald.
   - Sunset `worldTint` (`[0.54, 0.38, 0.36]`) darkens the green valley into muddy olive-brown blotches.
   - In `aerial-masterplan.png`, every tree canopy looks like a spiky 9-pointed sea-urchin star with a bleached white center.

---

## 3. Ranked Pass 2 Repair Findings (`PASS2-01` – `PASS2-05`)

### `PASS2-01` — [Major | Structure, Intent & Finish] Tree Canopy Silhouette, Clone Symmetry, Star-Blossom Legibility, Hanging Sticks & Color-Space Mismatch
- **Location:** [`world/assets/terrain/trees.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/trees.js)
- **Observed Defect:**
  1. All 44 trees share a single symmetrical dome of 15 tightly packed puffs and identical 5-bough angles, looking like clones from eye level and spiky 9-pointed stars from overhead.
  2. Hanging blossoms use `1.35m` vertical brown limb cylinders (`addTaperedLimb`) that look like stiff brown rods dropping from the boughs, while branch blossoms have overlapping petals that read as small blobs instead of crisp 5-petal star flowers.
  3. Fragment shader applies `pow(col, 2.2)` without `<tonemapping_fragment>` / `<colorspace_fragment>`, causing dark/saturated colors in `terrain/preview.html` and bleached white-pink tops in `world/index.html`.
- **Correction Target:**
  1. Redesign `trees.js` so each tree has genuine per-tree asymmetry (organic trunk lean, 4–6 multi-level spreading boughs at varied heights/lengths/azimuths, and stepped multi-tiered umbrella sub-crowns with visible warm brown boughs between tiers).
  2. Broaden leaf-frond fans into fuller, overlapping umbrella plates so overhead views (`aerial-masterplan.png`) read as lush rounded/lobed foliage umbrellas rather than spiky asterisks, with harmonious spring-green tiers (`#589e3c` -> `#82c84e` -> `#b2e668`) and selective soft sakura-pink / wisteria-lavender accent fronds (`#f9c2d8` / `#dec4fa`).
  3. Sculpt crisp, deeply notched 5-petal star-blossom clusters (`add5PetalBlossom`) nestled along the visible brown boughs, and replace the stiff vertical brown rods with delicate, softly swayed/tapered blossom racemes.
  4. Fix color-space output in `trees.js` so `terrain/shots/pass2/*.png` and `world/shots/assembled-v3/*.png` both render with rich, natural warm chestnut bark (`#8c583a`) and luminous spring foliage.

### `PASS2-02` — [Major | Function, Intent & Finish] 3D Grass Stair/Road Encroachment, Midground Cutoff Ring & Terrain Meadow Detail
- **Location:** [`world/assets/terrain/geography.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/geography.js), [`world/assets/terrain/terrain-water.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/terrain-water.js), [`world/assets/flowers/meadow.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/flowers/meadow.js), and [`world/src/main.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/main.js)
- **Observed Defect:**
  1. Grass tufts spawn too close to the Grand North Staircase (`|x| <= 3.4m` vs `2.6m` stringer + `1.45m` blade reach) and road edges, poking through stone stair curbs in `day-shrine-arch.png` and overhanging cobbles/dirt in `day-plaza.png`.
  2. Toroidal grass radius (`56m` desktop, `42m` tablet) and focus placement leave obvious bald cutoffs in `day-arena-wisteria.png`, `day-mill-pier.png`, `day-shrine-arch.png`, and `evening-sunset-vista.png`.
  3. The terrain shader lacks medium/far-distance painterly grass brushstrokes and wildflower stippling (`ref-target-trees.png` left hillside), making the terrain beyond the 3D grass look like smooth plastic.
- **Correction Target:**
  1. Expand `foliageMask = 0.0` safety margins in `geography.js` (`sampleWorld` and `createWorldMaskTexture`) around the Grand North Staircase (`|x| <= 4.65m`), roads (`hw + 1.25m`), Well Plaza (`r < 13.8m`), Arena (`fenceR + 1.8m`), and Shrine Platform (`platformR + 2.2m`) while preserving all `verify.mjs` probes.
  2. Expand `MEADOW_PROFILES` coverage in `meadow.js` (`desktop`: `grassRadius: 78`, `grassCount: 12000`, `flowerRadius: 105`; `tablet`: `grassRadius: 56`, `grassCount: 6400`, `flowerRadius: 85`), use full square-with-rounded-fade coverage so corners are not wasted, and tune `updateMeadowFocus` + `populateValleyWildflowerDrifts` in `world/src/main.js` so all 8 camera views have continuous foreground-to-midground grass and wildflower coverage.
  3. Upgrade `createGouacheTerrainMaterial` in `terrain-water.js` with painterly wind-swept meadow grass brushstrokes and sunlit yellow/pink/white wildflower hillside stippling on open meadow turf (`mask.b > 0.5`), matching the hillside texture of `ref-target-trees.png`.

### `PASS2-03` — [Major | Structure, Intent & Finish] Missing Directional Ground Shadows for Houses, Well, Shrine Arch & Trees, plus Opaque Plaza/Shrine Floor Discs
- **Location:** [`world/assets/terrain/landmarks.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/landmarks.js) and [`world/assets/terrain/terrain-water.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/terrain-water.js)
- **Observed Defect:**
  1. `buildWellPlaza` and `buildShrineOverlook` place flat untextured cylinder slabs (`plazaDisc`, `platformCurb`) over the terrain, hiding the procedural cobblestones/flagstones and blocking terrain shader shadows.
  2. Houses, the central Well, the Shrine Archway, and the Shrine Planters cast zero directional shadows on the ground, making structures look ungrounded compared to `ref-house3d-style.png` and `ref-target-trees.png`.
- **Correction Target:**
  1. Replace the opaque full-floor `plazaDisc` and `platformCurb` cylinders in `landmarks.js` with dressed stone perimeter curb rings + stepped retaining plinths so the procedural cobblestones and Shrine flagstones of `terrainMat` are visible across the Well Plaza and Shrine Overlook.
  2. Upgrade the directional shadow evaluation in `terrain-water.js` (and `meadow.js`) so that in addition to dappled leaf-crown tree shadows, the 5 Tudor buildings, the central Well, the Shrine Arch piers, the Altar pedestal, and the Shrine planters cast crisp, sun/moon-direction-aware shadows across the cobblestones, flagstones, roads, and grass at **zero extra draw calls**.

### `PASS2-04` — [Major | Structure & Intent] Repetitive 6-Sided Pyramid Horizon Mountains with Identical White Snow-Caps
- **Location:** [`world/assets/terrain/terrain-water.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/terrain-water.js) (`buildSkyAndAlpineHorizonAndHydroStructures`)
- **Observed Defect:**
  - The horizon is ringed by 28 identical 6-sided `ConeGeometry` pyramids topped with stark white triangle cones at the exact same height ratio (`day-mill-pier.png`, `day-plaza.png`), contradicting the organic green foothills and atmospheric slate-blue/grey multi-ridge mountains of `ref-target-trees.png`.
- **Correction Target:**
  - Replace the 6-sided cone-plus-white-cap pyramids with sculpted, multi-ridged, softly domed mountain massifs (`buildMountainMassifGeometry`) featuring per-vertex elevation & directional shading gradients (lush green/sage-olive foothill ridges in the inner ring and misty slate-blue/grey alpine massifs in the outer ring, without artificial white triangle caps).

### `PASS2-05` — [Minor / Major | Finish] Pond Water Color/Shoreline Blend, Upstream Spring Outcrop & Sunset Golden-Hour Tint
- **Location:** [`world/assets/terrain/terrain-water.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/terrain-water.js) and [`world/src/sky-tod.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/sky-tod.js)
- **Observed Defect:**
  1. Pond water in `day-mill-pier.png` blows out to flat neon cyan with visible polygonal `CircleGeometry` edges along the sandy beach.
  2. In `aerial-masterplan.png`, the NW stream starts abruptly in flat green grass with tiny pebbles.
  3. In `evening-sunset-vista.png`, `worldTint: [0.54, 0.38, 0.36]` makes the meadow look dark and muddy instead of warm golden hour.
- **Correction Target:**
  1. Deepen the pond water palette (`waterShallow: 0x38b8c4`, `waterDeep: 0x166888`) with soft shoreline alpha feathering (`smoothstep(1.0, 0.88, rPond)`) so the water edge blends organically into the wet sand bank without polygonal creases.
  2. Add a proper rocky headwaters spring outcrop and mossy boulders around `z = -64m` so the stream emerges naturally from a rocky hillock in `aerial-masterplan.png`.
  3. Warm up the Evening sunset keyframe (`t = 0.76`) in `world/src/sky-tod.js` (`worldTint: [0.90, 0.74, 0.66]`, `waterTint: [0.85, 0.68, 0.68]`) so `evening-sunset-vista.png` glows with rich golden-hour light.

---

## 4. Acceptance & Verification Scope

1. **Terrain Kit Verification (`node world/assets/terrain/shoot.mjs pass2` & `node world/assets/terrain/verify.mjs`):**
   - `0` console errors, `draws <= 24` (`23` observed), `triangles < 120,000` (`113,736` observed), `totalSceneTriangles < 120,000` (`113,736`), all `v7` coordinates and `uWorldMask` channel `B` probes passing.
2. **Flowers & Houses Verification (`node world/assets/flowers/verify.mjs` & `node world/assets/houses/verify.mjs`):**
   - All species triangle caps, `meadowDrawCalls <= 6`, mask exclusions, and house kit budgets (`15` lineup draws, `46,544` tris, `0` console errors) passing.
3. **Full World Assembly Verification (`node world/tools/shoot-world.mjs assembled-v3`):**
   - `passesAllBudgets === true` (`desktopDraws = 41 <= 60`, `desktopTriangles = 582,359 <= 620,000`, `tabletDraws = 41 <= 48`, `tabletTriangles = 360,119 <= 380,000`, `consoleErrorCount = 0`).
4. **Visual Recheck (`view_file` on all 8 `world/shots/assembled-v3/*.png` & `world/assets/terrain/shots/pass2/*.png`):**
   - All dimensions (`Structure`, `Function`, `Intent`, `Finish`, `Overall`) reach `9 / 10`.

---

## 5. Pass 2 Post-Fix Recheck Verdict & Final `/10` Scores

- **Verdict:** **Pass Within Inspected Scope** — All 5 findings (`PASS2-01` through `PASS2-05`) have been resolved and visually verified across all 8 `world/shots/assembled-v3/*.png` and all 6 `world/assets/terrain/shots/pass2/*.png` renders.

| Dimension | Pass 1 Score | Pass 2 Score | Post-Fix Verification Evidence |
| :--- | :---: | :---: | :--- |
| **Structure** | **5 / 10** | **9 / 10** | Asymmetric leaning trunks and 5 multi-height primary boughs + 10 sub-boughs hold up lush 15-puff umbrella canopies; stiff vertical brown poles replaced by curved blossom racemes and notched 5-petal star flowers; white-capped 6-sided pyramid cones replaced by deeply seated, sculpted multi-ridge olive-green & slate-blue mountain massifs; rowboat sculpted with tapered hull and thwarts. |
| **Function** | **6 / 10** | **9 / 10** | Expanded `foliageMask = 0.0` margins around the Grand North Staircase (`|x| <= 4.75m`), roads (`hw + 1.35m`), Well Plaza (`r < 13.8m`), Arena (`fenceR + 1.85m`), and Shrine (`platformR + 2.2m`) eliminate all grass blade clipping through stair stringers and road cobbles; Shrine terrace floor ring fixes buried player feet. |
| **Intent** | **5 / 10** | **9 / 10** | Matches [`ref-target-trees.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-target-trees.png) and [`ref-house3d-style.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/refs/ref-house3d-style.png) with directional architectural & dappled tree shadows across cobblestones, flagstones, and grass; stationary fallback slot relocation in `meadow.js` + expanded `72m` radius + painterly hillside washes provide continuous foreground-to-horizon meadow coverage. |
| **Finish** | **5 / 10** | **9 / 10** | Unified linear/sRGB tone-mapped output (`<tonemapping_fragment>` + `<colorspace_fragment>`) in `trees.js` and `waterMat`; open stone curb rings on the Well Plaza and Shrine Overlook expose procedural cobblestones/flagstones and shadows; deep cerulean-to-turquoise pond water with feathered shoreline alpha; warm golden-hour sunset tint (`[0.88, 0.70, 0.62]`). |
| **Overall** | **5 / 10** | **9 / 10** | **Lowest evaluated required dimension (`9 / 10`), never an average.** |

