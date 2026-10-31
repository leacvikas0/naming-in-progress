# METHODOLOGY.md — 3D World, Asset & Subagent Engineering Protocol

> **Mandatory Reading for Every Agent:** This document records Vikas's exact methodology rules from `[Expand Game for Co-op Fun](t3-thread://v1/98aecbb4-04c7-4b9c-874b-fb5544ce9cc7)` (cleaned up for spelling/grammar, zero filler) followed by the concrete operational rules inferred from them.

---

## Part 1: Vikas's Direct Rules

### 1. World Design & Anti-Slop Rules
- **`world 1` Code is Strictly Banned:** You are completely banned from copying or reusing code from `C:\Users\silen\Downloads\world 1`. It has severe engineering flaws in how it handles distances and LODs. Use it **only** as a visual mood reference, and engineer the world from scratch via a blind subagent.
- **Diffusion Image Models Are for Mood Only:** When using `gpt-image` to generate visual references, use those images **only** for scenery mood, color harmony, and rough guidance—**never** as literal geometry to match, because diffusion models optimize for pretty 2D pictures rather than architectural or game-ready 3D geometry.
- **Logical Coherence in Placement:** Build a small, fun town using the `house3d` Tudor house style, with expanded distances between outer zones, valley/mountain vistas around the perimeter, and toroidal boundary wrap. Every building, path, and landmark must be logically derived from the world: *Why is this house here? Why is this structure here?*
- **AA Game Design Standard:** Work in phases so every phase produces something workable and playable, then expand it. Avoid AI slop at all costs—at every decision point ask: *"Would a pro AA game designer do it this way or that way?"*

### 2. Stage Gate 1: Low-Poly 3D Blockout & Truly Blind Critique Loop
- **Blockout First:** Whenever building or expanding a 3D world, first create a fast, low-poly Three.js blockout to map out the terrain, scale, and where everything goes.
- **Walk the Scenery Like a Real Player:** Walk through the blockout from player eye-level across all angles. Does it make sense from every angle? Is the overall mapping logical?
- **Truly Blind Independent Critics (Scored Out of 10 via `judging-3d-scenes`):**
  - Every critic subagent MUST load and follow [`judging-3d-scenes/SKILL.md`](file:///C:/Users/silen/.gemini/antigravity-acp/t3-home/config/skills/judging-3d-scenes/SKILL.md) (and [`references/examples.md`](file:///C:/Users/silen/.gemini/antigravity-acp/t3-home/config/skills/judging-3d-scenes/references/examples.md)).
  - Have an independent subagent visually critique the rendered views and score both the **overall work** and **specific parts out of 10** (`Structure`, `Function`, `Intent`, `Finish` — where a Blocker caps its dimension at `4`, a Major caps at `6`, and **Overall is the lowest evaluated required dimension, never an average**).
  - **Never reuse the same critic agent** that gave the previous score—spawn a brand-new agent each time.
  - **Never prime or bias the critic:** Do not send the previous critic's report to the new critic, do not tell it *"hey, I found these flaws and fixed them, please rate me,"* and do not let code comments steer its score. Give it **nothing** except the rendered images and instructions to critically judge what it sees.
- **User Browser Sign-Off:** Once the blockout passes, open the 3D Three.js build in the browser so Vikas can inspect and approve it before moving on to asset production.

### 3. Stage Gate 2: The 2-Pass Parallel Asset Workflow
- **Orchestrator Never Builds or Self-Judges Assets:** Do not build the assets yourself in the main orchestrator thread and judge them yourself, and do not dump a huge pile of unrelated assets onto one subagent.
- **One Subagent Per Asset Family (Parallel Batches):** Dispatch parallel subagents where each agent owns one focused asset module (e.g., 1 for the Houses Kit, 1 for the Modular Flower & Meadow Pack, 1 for Terrain/Water/Landmarks, 1 for Cinematic VFX).
- **Strict 2-Pass Cap Per Asset (No Infinite Loops):**
  - **Pass 1 (Builder Subagent):** Builds the asset to the highest possible quality and renders multi-angle preview screenshots (`shots/pass1/`).
  - **Pass 2 (Independent Critic-Fixer Subagent):** A fresh subagent inspects Pass 1, writes down a **Critique** (with flaws explained and `/10` scores) plus a **Verification & Test Scope** (`CRITIQUE-AND-SCOPE.md` + `verify.mjs` defining what the asset must satisfy to pass the quality bar), **performs the actual fixes itself**, and **verifies the fixed result against that scope/test plan** (`shots/pass2/`) before handing it back to the lead agent.
  - **Lead Agent Visual Check:** The lead agent inspects the Pass 2 renders with `view_file`: *"Does it look good enough?"* If yes, lock it and move to the next asset batch.

### 4. Stage Gate 3 & 4: Native Character Motion & Cinematic VFX
- **Dedicated Character & Animation Subagent:** Pull player characters from **KayKit (`library/kaykit-adventurers`) only**. For enemies and animations, use KayKit skeletons and quality rigged assets found online. **Use 100% native, diverse skeletal animations**—never hand-code procedural bone-wiggling.
- **Cinematic VFX Bar:** Attack slashes, spell geometry, partner halos, and Artorious's sky-parting miracles must be built to a high-craft cinematic visual bar using our VFX references (`_archive/legacy-game/src/*-vfx.js` and `docs/experiments/2026-09-16-vfx-libraries.md`) and verified through the same 2-pass visual critique loop.

---

## Part 2: Concrete Operational Inferences

1. **Isolated Folder Ownership (`world/assets/<module>/`):**
   - Each parallel subagent works exclusively inside its own asset directory (`world/assets/houses/`, `world/assets/flowers/`, `world/assets/terrain/`, `world/assets/characters/`, `world/assets/vfx/`) or isolated git worktree (`.worktrees/<task>`) with its own `preview.html` and ephemeral-port `shoot.mjs` (`server.listen(0, '127.0.0.1')`) so parallel agents never collide.
2. **Inspect-PNGs-Before-Code Rule in Pass 2:**
   - Every Pass 2 Critic-Fixer must call `view_file` on `shots/pass1/*.png` and write the visual critique section of `CRITIQUE-AND-SCOPE.md` **before** reading any `.js` source file.
3. **Hardware Performance Targets (`Xiaomi Pad 7` vs `RX 6700`):**
   - `tablet` profile (Xiaomi Pad 7, `3200×2136` `3:2` 144Hz): `DPR = 1.5`, toroidal GPU grass radius `R = 42m` (`22k` tufts), `<= 48` draw calls, `<= 380k` triangles, `90–120 FPS`.
   - `desktop` profile (RX 6700): `DPR = 2.0`, toroidal GPU grass radius `R = 56m` (`40k` tufts), `<= 60` draw calls, `<= 620k` triangles, `120–144 FPS`.
4. **VFX & Shader Engineering Rules (Locked in Stage 4):**
   - **Never Copy Unoptimized External Shaders Verbatim:** Reference projects (`C:\Users\silen\Downloads\VFX-godot\spellbook`) use per-fragment 3D Simplex FBM/Voronoi loops (`~15 ms` per frame) and dark-void backgrounds. Instead, sample the shared `128×128` RGBA `NoiseAtlas` `DataTexture` (`world/assets/vfx/noise-atlas.js`) and consolidate each spell into `<= 6` instanced draw calls (`< 0.35 ms` GPU time).
   - **Avoid "Stained Glass" Trap on 3D Crystals:** Never combine flat vertical color stripes with `fwidth` wireframe bevel lines, dark cartoon ink outlines, or semi-transparent alpha (`< 1.0`) over bright warm sand/trees. Use hardware-opaque `transparent: false, side: THREE.FrontSide` with counter-clockwise outward-wound geometry, horizontal-azimuth optical thickness (`dot(horizN, horizV)`), internal fracture/vein FBM, permanent subsurface inner light (`uColorCore`), and 3D height-field ground relief.
   - **Linear-sRGB Uniforms Under `OutputPass`:** Because `world/src/post.js` renders in linear HalfFloat and runs `OutputPass` (ACES + linear-to-sRGB), always pass colors via `new THREE.Color('#rrggbb')` uniforms rather than raw sRGB `vec3` literals in GLSL to prevent double-gamma bleaching.
