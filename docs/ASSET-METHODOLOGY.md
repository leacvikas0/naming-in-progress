# 3D World, Asset & Co-Op Game Methodology

This document records the exact workflow and engineering rules established by Vikas in `[Expand Game for Co-op Fun](t3-thread://v1/98aecbb4-04c7-4b9c-874b-fb5544ce9cc7)` (cleaned up for spelling and clarity, with zero filler), followed by the concrete operational details inferred from those rules.

---

## Part 1: Vikas's Direct Rules (Cleaned Up from Chat)

### 1. Core Game Vision & Target Hardware
- **Rebuild, Do Not Copy:** Rebuild this into a genuinely fun 2-player co-op game where my wife and I pick one character each, support each other, and power each other up—think *Genshin Impact*, but actually built around co-op synergy. Do not copy the old codebase or the broken prototype code.
- **Cross-Platform Setup:**
  - **Wife's Device:** Xiaomi Pad 7 (needs fast performance without ruining visual quality, plus *Genshin*-style mobile touch controls).
  - **My Device:** Desktop PC (`i5-12400F` + `RX 6700`).
  - **Backend:** Hosted on **Cloudflare Workers** as the authoritative service that manages the game state.
- **Asset Sourcing Rule:**
  - Pull player characters from **KayKit only**—do **not** use the KayKit/Kenney dungeon or environment prop assets (they look ugly).
  - For enemies, additional characters, and animations, find and download good assets online that fit the style.
  - **Use native, diverse skeletal animations**—do not hand-build procedural bone-wiggling animations.

### 2. World Design & Anti-Slop Rules
- **`world 1` Code is Strictly Banned:** You are completely banned from copying or reusing code from `C:\Users\silen\Downloads\world 1`. It has major engineering flaws in how it handles distances and LODs. Use it **only** as a visual mood reference for how the meadow/flowers look, and engineer the real world from scratch via a blind subagent.
- **Diffusion Image Models Are for Mood Only:** When using `gpt-image` to generate visual references, use those images **only** for scenery mood, color, and rough guidance—**never** as literal geometry to trace, because diffusion models optimize for pretty 2D pictures rather than architectural or game-ready 3D geometry.
- **Logical Coherence in Placement:** Build a small, fun town using the `house3d` Tudor house style. Every building, path, and landmark must be logically derived from the world: *Why is this house here? Why is this structure here?*
- **AA Game Design Standard:** Work in phases so every phase produces something workable and playable, then expand it. Avoid AI slop at all costs—at every decision point ask: *"Would a pro AA game designer do it this way or that way?"*

### 3. Phase Gate 1: Low-Poly 3D Blockout & Blind Critique Loop
- **Blockout First:** Whenever building a 3D world, first create a fast, low-poly Three.js blockout to map out the terrain and where everything goes.
- **Walk the Scenery Like a Real Player:** Walk through the blockout from player eye-level across all angles. Does it make sense from every angle? Is the overall mapping logical?
- **Truly Blind Independent Critics (Scored Out of 10):**
  - Have an independent subagent visually critique the rendered views and score both the **overall work** and **specific parts out of 10**.
  - **Never reuse the same critic agent** that gave the previous score—spawn a brand-new agent for each round.
  - **Never prime or bias the critic:** Do not send the previous critic's report to the new critic, do not tell it *"hey, I found these flaws and fixed them, please rate me,"* and do not let code comments steer its score. Give it nothing but the rendered images and ask it to critically judge what it sees.
- **User Browser Sign-Off:** Once the blockout passes, open the 3D Three.js build in the browser so I can inspect and approve it before moving on to detailed asset production.

### 4. Phase Gate 2: The 2-Pass Parallel Asset Workflow
- **Orchestrator Never Builds or Self-Judges Assets:** Do not make the assets yourself and judge them yourself, and do not dump a huge pile of unrelated assets onto one subagent.
- **One Subagent Per Asset Family (Parallel Batches):** Send parallel subagents where each agent owns one focused asset module—for example, 3 subagents in parallel:
  1. One builds the **Houses Kit**.
  2. One builds the **Modular Flower & Meadow Pack**.
  3. One builds the **Terrain, Water & Landmarks**.
- **Strict 2-Pass Cap Per Asset (No Infinite Loops):**
  - **Pass 1 (Builder Subagent):** Builds the asset to the best possible quality and renders multi-angle preview screenshots.
  - **Pass 2 (Independent Critic-Fixer Subagent):** A fresh subagent inspects Pass 1, writes down a **Critique** (with flaws explained and `/10` scores) plus a **Verification & Test Scope** (what the asset must satisfy to pass the quality bar), **performs the actual fixes itself**, and **verifies the result against that scope/test plan** before returning it to the lead agent.
  - **Lead Agent Visual Check:** The lead agent inspects the Pass 2 renders: *"Does it look good enough?"* If yes (which should be true almost every time after Pass 2), lock it and move to the next asset batch.
- **Dedicated Character & Animation Subagent:** After the environment assets are built, use a dedicated subagent to gather, download, and wire the characters and enemies with their native skeletal animations.

---

## Part 2: What I Inferred From Your Messages (Concrete Operational Rules)

To execute your rules reliably without gaps, I inferred the following concrete operational mechanics:

1. **Isolated Folder Ownership (`world/assets/<module>/`):**
   - Since parallel subagents run in the same repo, each Pass 1 Builder and Pass 2 Critic-Fixer is restricted to its own directory (`world/assets/houses/`, `world/assets/flowers/`, `world/assets/terrain/`, `world/assets/characters/`) with its own standalone `preview.html`, ephemeral-port `shoot.mjs`, `CRITIQUE-AND-SCOPE.md`, and `verify.mjs` so parallel agents never overwrite each other's files or collide on ports.
2. **Enforcing "Blind" Criticism in Pass 2:**
   - Because you caught how code comments biased the blockout critics, the Pass 2 Critic-Fixer is required to call `view_file` on every PNG in `shots/pass1/` and write the Critique section of `CRITIQUE-AND-SCOPE.md` **before** opening any `.js` source file.
3. **Xiaomi Pad 7 vs. RX 6700 Budgets:**
   - From your hardware specs (`Xiaomi Pad 7` = `Snapdragon 7+ Gen 3`, `3200×2136` `3:2` 144Hz screen; `Desktop` = `i5-12400F` + `RX 6700`), "runs fast AF on her tab without fucking up quality" translates to:
     - `DPR = 1.5` on Pad 7 (`2133×1424` internal render target) vs `DPR = 2.0` on Desktop.
     - Single world-snapped toroidal GPU grass ring (`R = 42m` / `22k` tufts on Pad 7 vs `R = 56m` / `40k` tufts on PC) that smoothly tucks into a 3-tone gouache terrain shader so grass density stays lush right around the player with zero popping.
     - Static geometry merging (`mergeStatic` + instanced clay roof tiles) so the entire village + terrain + trees stays under `48` draw calls and `380k` triangles on her tablet.
4. **Carrying Forward the Blind `v5` Blockout Critic Fixes into World Assembly:**
   - Since you approved the `v5` blockout to move into asset building right as the blind `v5` critic (`06f77e8b7704bd4deda56f026536a5b9`, `5.5/10`) returned its raw image audit, I inferred that every legitimate spatial flaw it caught (computing exact doorway-to-road coordinates `doorX/doorZ` so no door opens onto bare grass, carving the waterwheel tailrace channel to `y = -2.2m` so the wheel sits in water, adding a sandy shoreline + stone pier abutment, straightening the Shrine stairs along `x = 0` with continuous sloped stringers, and softening wisteria racemes from spiky cones into organic blossom clusters) must be baked directly into the `houses` and `terrain` asset modules.
5. **Cloudflare Workers + Durable Objects Architecture:**
   - From *"we host on Cloudflare Workers as the thing that actually manages the game"*, I inferred a single `wrangler.toml` setup where a Worker serves the static 3D client assets and upgrades `/api/room/:code` WebSockets to a stateful **`CoopRoomDO` Durable Object** running a 20Hz authoritative room loop (managing waves, aggro split, partner buffs, and Co-Op Link windows) while movement/attacks run with zero-latency client prediction.
