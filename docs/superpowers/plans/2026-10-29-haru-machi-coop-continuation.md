# Haru-machi Romantic Co-Op Action RPG — Master Continuation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan stage-by-stage. Before touching any file, read [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md), [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md), and [`GIT-DISCIPLINE.md`](file:///C:/Users/silen/projects/kilo-3d-kit/GIT-DISCIPLINE.md). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build *Haru-machi* in five strict, quality-gated stages: **(1) Expanded Scene Map & Toroidal Valley**, **(2) 2-Pass Environment Assets**, **(3) KayKit Characters & Native Motion**, **(4) Cinematic High-Craft VFX**, and **(5) Co-Op Mechanics, Login, Cloudflare Workers & Gemini Live Voice Judgment ("Artorious, God of Love")**.

**Architecture:** Clean-sheet Three.js `0.170.0` ES-module client (`world/`) backed by isolated, 2-pass verified packages (`world/assets/{houses,flowers,terrain,characters,vfx}`), `three.quarks@0.16.0` + post-processing bloom for cinematic VFX, and a Cloudflare Worker + `CoopRoomDO` Durable Object (`worker/`) managing 2-player state and streaming live voice prayers to Gemini Live.

**Specs & Core Docs:**
- [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md) — Core vision, 5-stage build sequence, romantic voice-judged miracles, and locked vs. open design items.
- [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md) — Blockout-first protocol, blind `/10` critic rules, and 2-pass parallel asset workflow.
- [`GIT-DISCIPLINE.md`](file:///C:/Users/silen/projects/kilo-3d-kit/GIT-DISCIPLINE.md) — Clean root structure, git worktrees, and atomic commit checkpoints.
- [`docs/superpowers/specs/2026-10-29-clean-world-engine-spec.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/specs/2026-10-29-clean-world-engine-spec.md) — Clean-sheet world & rendering spec.

---

## Current State Snapshot on Disk

- [x] **Workspace Cleaned & Archived:** Legacy prototype (`game/`, `meadow-kit/`, `viewer/`, old reports) moved cleanly to `_archive/legacy-game/` and `_archive/legacy-prototypes/`. VFX shader references preserved in `_archive/legacy-game/src/{ice-lance-vfx,glacial-crown-vfx,thunder-vfx}.js`.
- [x] **Blockout `v5` Baseline:** Live at [`world/blockout.html`](file:///C:/Users/silen/projects/kilo-3d-kit/world/blockout.html) (`http://127.0.0.1:4173/world/blockout.html`).
- [x] **Partial Stage 2 Pass 1 Code on Disk:**
  - `world/assets/houses/`: [`textures.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/textures.js), [`materials.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/materials.js), [`parts.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/houses/parts.js) written.
  - `world/assets/terrain/`: [`geography.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/geography.js), [`terrain-water.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/terrain-water.js), [`landmarks.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/landmarks.js), [`trees.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/terrain/trees.js) written.

---

### Stage 1: The Scene Map — Expanded Outer Distances, Mountain Vistas & Toroidal Boundary Wrap

**Files:**
- Modify: `world/src/blockout/geography.js`, `world/src/blockout/scene-builder.js`, `world/src/blockout/main.js`, `world/assets/terrain/geography.js`
- Test: `world/tools/shoot-blockout.mjs`, `world/shots/v6/*.png`

**What This Stage Locks:**
- Keeps the central Hamlet (`Zone A`, Well Plaza + 4 cottages) compact and cozy, while **increasing the distances between outer zones** so the valley between the Town, the Western Waterfall/Mill & Lake (`Zone B`), the Eastern Wisteria Combat Clearing (`Zone C`), and the Northern Shrine Overlook (`Zone D`) feels expansive (`~2.0×` outer landmark spacing, `playRadius = 140m`).
-Fixes the 5 spatial geometry flaws flagged by the blind `v5` critic (`(doorX, doorZ)` road-to-step connection, symmetrical Inn porch posts, `y = -2.2m` waterwheel channel + sandy shoreline + stone pier abutment, axial `x = 0` Shrine staircase with continuous mitered cheek-walls, soft wisteria clusters clear of the arena fence).
- Surrounds the playable valley with a **scenic outer valley basin and distant mountain ridge ring** (`R = 160m..420m`).
- **Toroidal Boundary Teleport:** When a player crosses the outer playable boundary (`r > PLAY_BOUNDARY_RADIUS`), they smoothly wrap/teleport to the opposite side of the playable valley (`(x, z) -> (-x * 0.92, -z * 0.92)` on the matching road/meadow elevation) with a brief petal-breeze transition.

- [x] **Step 1: Update `world/src/blockout/geography.js` and `scene-builder.js` with expanded outer distances, mountain vista ring, `v5` critic fixes, and toroidal boundary wrap**
- [x] **Step 2: Render `world/shots/v6/` and dispatch a fresh, truly blind Image-Only Critic Subagent (`research`) to score `v6` out of 10**
- [x] **Step 3: Open `http://127.0.0.1:4173/world/blockout.html` in browser for user sign-off and commit (`feat(map): expand valley distances, add mountain horizon and toroidal wrap`)**

---

### Stage 2: The 3D Environment Assets (2-Pass Parallel Subagent Workflow + Full World Assembly)

**Files:**
- Create/Modify: `world/assets/houses/{index.js,preview.html,shoot.mjs,CRITIQUE-AND-SCOPE.md,verify.mjs}`
- Create/Modify: `world/assets/flowers/{index.js,preview.html,shoot.mjs,CRITIQUE-AND-SCOPE.md,verify.mjs}`
- Create/Modify: `world/assets/terrain/{index.js,preview.html,shoot.mjs,CRITIQUE-AND-SCOPE.md,verify.mjs}`
- Create: `world/index.html`, `world/src/{main.js,platform.js}`

**What This Stage Locks:**
- Completes Pass 1 and Pass 2 (blind Critic-Fixer) for all three environment asset modules (`houses`, `flowers`, `terrain`), then assembles them into the live playable world (`world/index.html`) hitting `< 48` draw calls and `< 380k` triangles on the Xiaomi Pad 7 profile.

- [x] **Step 1: Dispatch 3 parallel Pass 1 Builder Subagents (`self`) to complete `houses`, `flowers`, and `terrain` and render `shots/pass1/`**
- [x] **Step 2: Dispatch 3 fresh, blind Pass 2 Critic-Fixer Subagents (`self`) to inspect `shots/pass1/*.png` before reading code, write `CRITIQUE-AND-SCOPE.md` + `verify.mjs`, fix all defects, and render `shots/pass2/`**
- [x] **Step 3: Lead agent visual sign-off (`view_file` on `shots/pass2/*.png`) + atomic git commit per asset module**
- [x] **Step 4: Assemble `world/index.html` combining the verified Terrain, Houses, and Toroidal Flower Meadow, run a fresh blind World Critic Gate, and commit (`feat(world): assemble verified stage 2 environment`)**

---

### Stage 3: KayKit Characters & 100% Native Skeletal Motion

**Files:**
- Create: `world/assets/characters/{index.js,toon-skin.js,preview.html,shoot.mjs,CRITIQUE-AND-SCOPE.md,verify.mjs}`
- Create: `world/src/{player-controller.js,touch-hud.js}`

**What This Stage Locks:**
- Uses **KayKit Adventurers (`library/kaykit-adventurers`) only** for player characters (`Knight`, `Mage`, `Barbarian`, `Rogue`, `Rogue_Hooded`), upgraded with the 8×4 UV palette flattener + 4-step `MeshToonMaterial` + skinned inverted-hull ink outlines (per `docs/experiments/2026-09-16-cel-shading-knight.md`).
- Uses KayKit Skeletons (`library/kaykit-skeletons`) + downloaded CC0 rigged glTF monsters for enemies.
- Wires **100% native diverse skeletal `AnimationClip`s** (`Rig_Medium_MovementBasic.glb`, `Rig_Medium_CombatMelee.glb`, `Rig_Medium_CombatRanged.glb`, `Rig_Medium_Special.glb`, `Rig_Medium_General.glb`) with smooth cross-fading (`idle`, `run`, `sprint`, `dash`, `jump`, `combo1..4`, `charged`, `skill`, `pray_channel`, `burst`, `hit`, `downed`, `revive`) and weapon bone sockets (`handSlot.r`, `handSlot.l`).
- Wires Desktop (`WASD` + Mouse Look) and Xiaomi Pad 7 (`3:2` Genshin floating thumbstick + touch-look + thumb-arc buttons) locomotion in the live world.

- [x] **Step 1: Dispatch Pass 1 Character & Native Motion Specialist Subagent (`self`) to build `world/assets/characters/` and render `shots/pass1/`**
- [x] **Step 2: Dispatch fresh Pass 2 Character Critic-Fixer Subagent (`self`) to blind-audit `shots/pass1/`, write `CRITIQUE-AND-SCOPE.md` + `verify.mjs`, fix any skinning/clip/socket issues, and render `shots/pass2/`**
- [x] **Step 3: Wire playable cel-shaded hero locomotion + Pad 7 touch controls into `world/index.html` and commit (`feat(characters): add cel-shaded kaykit heroes with native skeletal motion`)**

---

### Stage 4: Cinematic, High-Craft VFX Engine (`world/assets/vfx/`)

**Files:**
- Create: `world/assets/vfx/{index.js,sword-trails.js,partner-halos.js,spells-geometry.js,divine-miracles.js,post-bloom.js,preview.html,shoot.mjs,CRITIQUE-AND-SCOPE.md,verify.mjs}`

**What This Stage Locks:**
- Builds a breathtaking, AA-grade anime VFX suite using `three.quarks@0.16.0` + `UnrealBloomPass` + `AfterimagePass` + custom vertex/fragment shaders informed by `_archive/legacy-game/src/{ice-lance-vfx,glacial-crown-vfx,thunder-vfx}.js` and `docs/experiments/2026-09-16-vfx-libraries.md`:
  1. **Cinematic Weapon & Spell Trails:** Ribbon slash arcs with ember/blossom particle wake and impact hitstop ripples.
  2. **Partner Empowerment Halos (`E`):**
     - *Her `Jealous Halo`:* 5 crystalline wisteria flowers physically orbiting your hero and firing homing lightning lances on retaliation.
     - *His `Knight's Intercept` & `Husband's Hubris`:* Mach-2 warp trail + golden barrier dome + oversized solar flame blade infusion.
  3. **Sculpted 3D Spell & Miracle Spectacles:**
     - *`Glacial Crown` & `Ice/Storm Lance` evolved:* Faceted crystal spires, spiraling wind-blossom ribbons, and ground-cracking shockwaves.
     - *Artorious's Sky-Parting Miracle (`APPROVED` / `SMITTEN`):* Volumetric golden god-rays parting the sky above the speaker, raining glowing wisteria petals, and erupting a rose-gold sanctuary dome.
     - *Artorious's Divine Smite (`INSINCERE`):* Dark thundercloud snap + pink-gold lightning bolt + comical soot/flowerpot bonk impact.
     - *Call-and-Response Couples Supernova (`Q`):* Dual-elemental vortex cataclysm across the arena.

- [ ] **Step 1: Dispatch Pass 1 Cinematic VFX Builder Subagent (`self`) to build `world/assets/vfx/` and capture multi-frame action sequences in `shots/pass1/`**
- [ ] **Step 2: Dispatch fresh Pass 2 VFX Critic-Fixer Subagent (`self`) to blind-critique readability, color harmony, bloom balance, and Pad 7 frame time, fix issues, and verify `shots/pass2/`**
- [ ] **Step 3: Lead agent visual sign-off and commit (`feat(vfx): add cinematic spell, halo, and divine miracle vfx engine`)**

---

### Stage 5: Game Mechanics, Login, Cloudflare Workers Co-Op & Gemini Live Voice Judgment ("Artorious")

**Files:**
- Create: `wrangler.toml`, `worker/index.js`, `worker/room-do.js`, `worker/artorious-judge.js`
- Create: `world/src/net/room-client.js`, `world/src/ui/{login-lobby.js,artorious-hud.js}`, `world/src/combat/{coop-loop.js,voice-invocation.js}`
- Test: `worker/test-coop-and-voice.mjs`

**What This Stage Locks:**
- **Login & Instant Room Pairing:** Clean sunlit meadow title/lobby screen with 1-tap room creation, 4-letter Room Code, and on-screen QR code so your wife scans your monitor with her Xiaomi Pad 7 and joins in 2 seconds.
- **Cloudflare Worker + `CoopRoomDO` Durable Object:** 20Hz authoritative room state managing player sync, enemy waves, aggro split, partner buffs, and shared Heart Resonance.
- **Live Voice-Judged Invocations (`Hold 🎙️` / `Hold V` — "Artorious, God of Love"):**
  - Holding the invocation button triggers **Sanctuary Time-Dilation** (world slows to 15%, camera dollies to a low-angle hero spotlight, Artorious's Mood Decree appears).
  - Streams live microphone audio (`WebAudio` / `MediaRecorder`) to **Gemini Live multimodal audio** so the model hears **both the words and the vocal emotion/sincerity** (catching monotone mumbling vs. heartfelt/dramatic commitment).
  - Artorious speaks his restrained, deadpan judgment inside the game and triggers either **Divine Smite** (when insincere/boring) or **Empowered Miracle Heal / Devotion Meteor / Couples Supernova** (when sincere/passionate).

- [ ] **Step 1: Build and test `wrangler.toml`, `worker/room-do.js`, and `world/src/ui/login-lobby.js` for 2-player Desktop + Pad 7 room sync**
- [ ] **Step 2: Build `worker/artorious-judge.js` and `world/src/combat/voice-invocation.js` (Sanctuary Time-Dilation + Gemini Live multimodal audio judgment + restrained divine TTS playback)**
- [ ] **Step 3: Wire the full co-op combat loop, run end-to-end 2-player verification (`node worker/test-coop-and-voice.mjs`), and commit (`feat(coop): complete cloudflare workers room, login, and artorious live voice judgment`)**
