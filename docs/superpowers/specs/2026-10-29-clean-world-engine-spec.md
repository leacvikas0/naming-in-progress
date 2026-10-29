# Clean-Sheet World & Town Engine Specification (`Haru-machi`)
**Date:** 2026-10-29  
**Target Role:** Blind World-Builder Subagent (`Phase 1`) + Independent Visual Critic Subagent (`Gate 1`)  
**Hard Rule:** **STRICT BAN on copying or importing any code from `C:\Users\silen\Downloads\world 1` or `game/src/world.js`.** You are building a clean-sheet, first-principles 3D world and town engine in `src/world/` using only:
1. Visual mood/color/lighting references in `docs/refs/` (`ref-hamlet-mood.png`, `ref-shrine-vista-mood.png`, `ref-world1-wisteria-mood.png`, `ref-house3d-style.png`) — used strictly for **color palette, atmosphere, and spatial mood**, NEVER as literal diffusion-artifact geometry to copy.
2. Architectural primitives and 4-step toon/ink-outline patterns inspired by `house3d/src/` (`materials.js`, `parts.js`, `textures.js`, `house.js`), extended into a parametric village kit.

---

## 1. Why We Are Engineering From First Principles (What Is Banned)

 The previous experimental prototype (`world 1`) suffered from severe architectural flaws that are **strictly forbidden** in this build:
- **BANNED:** 25,000-triangle single tree meshes (`wisteria-engine.js`) and local puff-scale inflation (`1.62x` / `2.15x`) that pushed scene triangle counts to `1.8M – 8.9M` tris.
- **BANNED:** Multiple competing ground-cover systems (4 overlapping toroidal rings + `lookPitchPush` camera-altitude offsets + 2D patch impostors + runtime `mesh.count` truncation in `lod.js`).
- **BANNED:** Placing buildings on un-terraced heightfield slopes where foundations float or 3D grass blades stab through porches and steps.
- **BANNED:** Generic pre-built GLB prop packs (`library/kenney-*`, `library/kaykit-dungeon`). Every structure, bridge, dock, shrine arch, waterwheel, well, fence, and botanical element is procedurally generated with unified 4-step Toon + View-Space Ink Outline shading and hand-painted procedural canvas textures.

---

## 2. Logical Geography & Settlement Masterplan (`src/world/geography.js`)

A believable AA game town (like *Genshin Impact*'s Springvale or *Zelda*'s Hateno Village) is dictated by **water, elevation, road forks, and livelihood**. Everything in `Haru-machi` derives from one deterministic mathematical model (`sampleWorld(x, z)`):

```text
                      NORTH (+Elevation y = +6.5m)
               [Zone D: Wisteria Arch Shrine & Overlook]
                      (x: 6, z: -58, r: 16m)
                                |
                       Stepped Stone Path
                                |
   WEST (y = -1.2m)             |                 EAST (y = +0.5m)
[Zone B: Waterfall, Mill] --- [Zone A: Hamlet] --- [Zone C: Wisteria Ring]
  Millhouse (-26, -12)      Well Plaza (0, 0)       Combat Clearing (38, -6)
  Waterwheel & Stream       4 Timber Cottages       2 Giant Wisteria Trees
  Wooden Pier (-24, 12)     Garden Walls/Fences     Fenced Training/Wave Ring
                                |
                        South Road Approach
                           (x: 0, z: 55)
```

### The Four Coherent Zones
1. **Zone A — The Hamlet Crossroads & Well Plaza (`center: (0, 0)`, flat datum `y = 0.0m`, radius `26m`):**
   - **Why it is here:** The main southern road forks here toward the western millpond, the eastern wisteria clearing, and the northern shrine climb.
   - **Centerpiece:** A circular cobblestone well plaza (`radius: 6.5m`) at `(0, 0)` with a stone-and-timber roofed well, wooden buckets, and low stone curbstones.
   - **The 4 Hamlet Cottages (Parametric Tudor Kit):**
     - **1. The Crossroads Inn & Bakery (`x: -11, z: -13, rotY: +0.55`):** 2-storey cross-gabled Tudor house (`11m × 8m`), terracotta clay tile roof, stone chimney, dormer window, timber-framed stucco, warm lantern porch facing the well plaza.
     - **2. The Apothecary & Herb Cottage (`x: 13, z: -11, rotY: -0.62`):** 1.5-storey cottage (`8.5m × 6.5m`) with a side timber awning, flower boxes under leaded blue windows, and a fenced herb garden patch along its side wall.
     - **3. The Cooper & Smithy Cottage (`x: 14, z: 12, rotY: -2.35`):** 1.5-storey cottage (`9.5m × 7m`) with a heavy stone chimney, porch lean-to roof, wooden barrels, and stone workbench facing the well.
     - **4. The Gardener's Cottage (`x: -13, z: 13, rotY: +2.30`):** 1-storey steep-gabled cottage (`8m × 6.5m`) with an attached fenced vegetable patch (raised soil beds + cabbages/greens), low dry-stone wall, and timber gate.

2. **Zone B — The Waterfall, Watermill & Lake Pier (`x: -55..-18, z: -30..35`):**
   - **Why it is here:** A natural rock shelf in the northwest (`y = +4.5m`) feeds a clear stream that cascades down a `5.5m` waterfall into the turquoise millpond (`waterLevel = -1.2m`).
   - **The Watermill (`x: -26, z: -14, y: +0.4m, rotY: +0.35`):** Stone-base, timber-upper mill house perched right beside the waterfall ledge, with a **rotating 4.2m wooden waterwheel** (`update(dt)`) sitting directly in the cascading raceway!
   - **The Wooden Pier & Boat Dock (`x: -22, z: 8` extending to `x: -32, z: 10`):** Timber posts driven into the lake bed supporting a plank walkway right at `y = -0.4m` (`0.8m` above water), tied with rope bollards.

3. **Zone C — The Wisteria Combat Clearing (`center: (38, -6), y = +0.5m, radius: 19m`):**
   - **Why it is here:** Just east of the hamlet fork, a broad, flat packed-earth ring (`radius: 16m`) serves as the village's festival ground and primary combat arena.
   - **Framing:** Ringed by a split-rail timber fence with an open western entrance gate, flanked by **two landmark blooming Violet Wisteria trees** (`(28, -22)` and `(50, -18)`) whose cascading purple racemes frame the sky, with rocky cliff shoulders behind them.

4. **Zone D — The Northern Wisteria Shrine Overlook (`center: (6, -58), y = +6.5m, radius: 16m`):**
   - **Why it is here:** A gentle stepped path climbs `6.5m` north from the Hamlet Commons up to an ancient sacred overlook with a panoramic view back over the red-roofed cottages and turquoise millpond.
   - **Architecture:** A `13m`-diameter circular stone-paved platform (`y = +6.5m`) featuring a procedural geometric 8-petal floral medallion inlaid in pale cream and slate-blue stone, framed by a **weathered cream-stone Romanesque archway** (`4.6m` tall, crisp ink outlines, moss/ivy accents) and an ancient overhanging Wisteria & Sakura tree (`(13, -62)`).

---

## 3. Clean-Sheet Rendering & Performance Architecture (RX 6700 + Xiaomi Pad 7)

### 3.1 Hard Performance Budgets
| Metric | Xiaomi Pad 7 (`tablet` profile, DPR 1.5) | Desktop RX 6700 (`desktop` profile, DPR 2.0) |
|---|---|---|
| **Target Frame Rate** | **90–120 FPS** (`< 8.5 ms/frame`) | **120–144 FPS** (`< 6.5 ms/frame`) |
| **Total Draw Calls** | **`<= 48` draw calls** | **`<= 60` draw calls** |
| **Total Active Triangles** | **`<= 380,000` triangles** | **`<= 620,000` triangles** |
| **Per-Frame CPU Allocations** | **`0` allocations** | **`0` allocations** |

### 3.2 First-Principles Distance & Foliage Architecture (Zero Popping, Zero Hacks)
1. **Single Analytical Terrain + Splat Shader (`src/world/terrain.js`):**
   - `480m × 480m` playable/scenic terrain mesh (`240 × 240` grid in the inner `240m`, lower density outer skirt) surrounded by a stylized distant mountain-ridge & horizon-lake vista ring (`backdrop.js`).
   - A single `512 × 512` `RGBA` data texture (`uWorldMask`) generated deterministically from `geography.js` encodes:
     - `R`: Surface ID / road & plaza blend weight (cobblestone, packed dirt road, shrine paving, cliff rock, meadow grass).
     - `G`: Meadow color variation & dappled canopy shadow mask.
     - `B`: **Exact Foliage Exclusion Mask** (`0.0` inside every building footprint + `1.5m` apron, every road, the well plaza, the eastern combat ring, the northern shrine floor, and below waterline; `1.0` on open meadow).
     - `A`: Contact Ambient Occlusion (`0.0..1.0`) around every building plinth, stone wall, well, and rock.
   - The terrain fragment shader renders crisp, multi-scale painted gouache grass brushwork + cobblestone/flagstone patterns directly on the ground, so even at `80m+` where 3D grass blades end, the ground already has rich 3-tone painted texture and contact shadows.

2. **Single-Band World-Snapped 3D Meadow (`src/world/foliage.js`):**
   - **ONE** clean world-snapped toroidal GPU `InstancedMesh` for curved 3-blade grass tufts (`22,000` tufts on `tablet` inside `R = 42m`; `40,000` tufts on `desktop` inside `R = 56m`).
   - **Static Clustered Wildflowers & Bushes (`3` `InstancedMesh` batches):**
     - Placed deterministically in curated drifts along road shoulders, garden edges, shoreline banks, and shrine approaches (violet bellflowers, white/gold daisies, lavender lupines, and rounded toon shrubs with flower dots).
     - Samples `uWorldMask.b` at birth AND in the vertex shader: **if `mask.b < 0.5`, the instance is never placed / culled.** Zero grass or flowers can ever appear inside a house, on a porch step, on cobblestones, or underwater.
   - Smooth distance fade (`smoothstep(R, R * 0.78, distToCamera)`) sinks grass blades gently into the matching painted terrain shader—no popping, no altitude-truncation hacks.

3. **Game-Ready 2-Tier Botanical Trees (`src/world/trees.js`):**
   - **Wisteria & Sakura Hero Trees (`~2,200` tris/tree):** Sculpted branching trunk + 14 layered flat-shaded canopy domes (3-tone gouache ramp + rim highlight) + 22 hanging wisteria blossom racemes (soft wind sway in vertex shader). Batched into `2` `InstancedMesh` calls (trunks + canopies/racemes).
   - **Lush Green Round/Tiered Village Trees (`~650` tris/tree):** Clean cel-shaded puff trees (like the green trees in `ref-house3d-style.png` and `ref-hamlet-mood.png`) framing the cottages, millstream, and hillside ridges. Batched into `2` `InstancedMesh` calls.

4. **Static-Merged Toon Village (`src/world/village.js`):**
   - Extends `house3d`'s `mergeStatic` and instanced clay roof tiles across all 5 buildings (4 cottages + watermill), the well plaza, stone garden walls, wooden fences, pier, and shrine arch.
   - Every static architectural piece shares the unified `createMaterials()` palette (`stucco`, `timber`, `stone`, `roofTiles[0..5]`, `glass`, `lampGlow`, `iron`) and view-space inverted-hull outlines (`uThickness`), merged into **`~12` draw calls total** for the entire village!
   - Exports exact 2D collision footprints (`colliders: [{ type: 'box' | 'circle', ... }]`) and walkable floor height `heightAt(x, z)` (including the wooden pier and stepped shrine path) so players and enemies collide cleanly with every wall, fence, and well.

---

## 4. Verification & Subagent Critique Gate

The World-Builder subagent must deliver:
1. `world/index.html` + `src/world/*` — runnable interactive 3D world with 3rd-person character walk (`WASD` + mouse look + mobile virtual thumbstick), camera preset hotkeys (`1` Hamlet Well Plaza, `2` Waterfall & Mill Pier, `3` Wisteria Combat Ring, `4` Northern Shrine Overlook, `5` Aerial Masterplan), Time-of-Day toggle (`Day`, `Sunset`, `Night`), and live HUD readout (`FPS`, `Draw Calls`, `Triangles`, `Profile: Desktop | Pad 7`).
2. Zero console errors, `<= 48` draw calls in Pad 7 mode, `<= 60` draw calls in Desktop mode, `<= 450k` triangles in gameplay views.

Immediately after the World-Builder subagent finishes, a **separate, blind Visual & Design Critic Subagent** will:
1. Boot the world in headless Chromium at both `1600×900` (Desktop) and `1440×960` (`3:2` Xiaomi Pad 7 aspect).
2. Capture 8 high-resolution screenshots across all 4 zones, close-up doorsteps/foundations, and aerial layout.
3. Inspect every screenshot with multimodal vision against a strict AA checklist:
   - Any floating building corners, un-grounded plinths, or waterwheel misalignment?
   - Any single blade of grass or flower poking through cobblestones, porches, docks, or shrine paving?
   - Any ugly overlapping geometry, broken outlines, or color-cast drift?
   - Does every building and path have clear geographical & functional logic?
   - Are draw calls and triangle counts strictly inside budget?
4. Produce a brutal defect list that we fix to 100% pass before moving to Phase 2.
