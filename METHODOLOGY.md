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
4. **VFX & Shader Engineering Rules (Locked in Stage 4 & 5):**
   - **Never Copy Unoptimized External Shaders Verbatim:** Reference projects (`C:\Users\silen\Downloads\VFX-godot\spellbook`) use per-fragment 3D Simplex FBM/Voronoi loops (`~15 ms` per frame) and dark-void backgrounds. Instead, sample the shared `128×128` RGBA `NoiseAtlas` `DataTexture` (`world/assets/vfx/noise-atlas.js`) and consolidate each spell into `<= 6` instanced draw calls (`< 0.35 ms` GPU time).
   - **Universal "Zero Glass" Physical Weight Rule (No Transparent Spells):** Never use semi-transparent alpha (`opacity < 1.0`) or washed-out additive meshes for spells, crystals, meteors, lightning, or sword trails. Every spell volume (`Frost Lance`, `Shatterlance`, `Cinder Fall`, `Storm Lance`, and *Demon Slayer* Sword Breathing arcs) must use hardware-opaque `transparent: false, side: THREE.FrontSide` (or hard `alphaTest` cel-eroded ribbons) with bold 3–4 band cel contrast, dark ink/rim framing, and real physical weight over bright warm sand and sunlit grass.
   - **Avoid "Stained Glass" Trap on 3D Crystals:** Never combine flat vertical color stripes with `fwidth` wireframe bevel lines, dark cartoon ink outlines, or semi-transparent alpha (`< 1.0`) over bright warm sand/trees. Use hardware-opaque `transparent: false, side: THREE.FrontSide` with counter-clockwise outward-wound geometry, horizontal-azimuth optical thickness (`dot(horizN, horizV)`), internal fracture/vein FBM, permanent subsurface inner light (`uColorCore`), and 3D height-field ground relief.
   - **Linear-sRGB Uniforms Under `OutputPass`:** Because `world/src/post.js` renders in linear HalfFloat and runs `OutputPass` (ACES + linear-to-sRGB), always pass colors via `new THREE.Color('#rrggbb')` uniforms rather than raw sRGB `vec3` literals in GLSL to prevent double-gamma bleaching.
   - **Native Video Critique for VFX, Attacks & Combat Motion (`6–8 FPS` via `view_file` + `google:load_video`):** Static single-frame PNGs cannot show how a spell, sword swing, hitstop, enemy wave, or combat loop *feels* in motion. Whenever critiquing or verifying VFX, attacks, animations, enemy AI, or gameplay feel, record a live gameplay video clip (`.webm` / `.mp4`) of the actual combat sequence and inspect it with native multimodal video (`view_file` $\rightarrow$ `google:load_video` at `6–8 FPS`) rather than relying on still screenshots alone.
5. **Stage 5 Full-Game Blind Critic Gate (`judging-3d-scenes` + `judging-gameplay` + Native Video):**
   - Apply the blind `/10` critique protocol using both recorded gameplay video (`6–8 FPS`) and multi-resolution captures across Desktop (`1600×900`) and Xiaomi Pad 7 (`1440×960` `3:2`) to catch motion, timing, readability, and UX flaws before sign-off.
6. **Mandatory Subagent Artistic & Visual Context Packet (Never Under-Context Subagents):**
   - A recurring failure mode is giving subagents a narrow technical task without the artistic vision, visual baseline, or Vikas's exact words—causing them to ship generic/off-theme assets or code that looks smart in isolation but feels broken in the actual game.
   - Every builder or critic subagent invocation MUST include:
     1. **Vikas's Exact Directives:** [`docs/superpowers/plans/2026-11-07-vikas-verbatim-prompts-archive.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-11-07-vikas-verbatim-prompts-archive.md) (specifically calling out the relevant step numbers for their task so they read Vikas's unedited words).
     2. **Full Game Systems & Math Plan:** [`docs/superpowers/plans/2026-11-07-amarante-final-playable-handoff.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-11-07-amarante-final-playable-handoff.md) so the subagent understands the game's core intent (role-symmetric co-op between Vikas and Ishika, audio-native tone-judged cheesy love confessions, ancient God of Love, and fun-but-hard co-op survival).
     3. **Visual Baseline Screenshots via `view_file` (`docs/design-references/visual-baseline-2026-11-07/*.png`):** Every subagent MUST call `view_file` on at least 3 baseline screenshots (`integrated-site1-well-day.png`, `integrated-site2-platform-day.png`, `integrated-site3-wall-day.png`, `live-verify-3-genshin-hud-stage3.png`, `zeropop-day-plaza.png`) BEFORE writing code or critiquing, so it visually calibrates to our Ghibli sunlit valley, warm travertine monuments, and translucent HUD.
7. **Mandatory End-toEnd Video Gameplay Verification Before User Sign-Off:**
   - Never ask Vikas to test a combat, enemy, control, or UI feature until an automated Playwright + video recording harness has recorded the live experience (`.webm`/`.mp4`), a subagent or lead agent has watched the video via `view_file` + `google:load_video`, and all obvious visual, animation, targeting, and game-feel bugs have been fixed first.
8. **Pacing, Rhythm & "Breathing Room" Rule (Think Like a Novel):**
   - Gameplay, combat choreography, and world exploration must have deliberate rhythm and breathing room—never a non-stop wall of visual clutter, nor sluggish underwater slow-motion.
   - Give distinct beats space to land: fast, decisive enemy approaches and strikes contrasted with clear punish windows; clean, readable floating damage callouts; and quiet exploration between high-intensity stone defense encounters.
9. **Mandatory 3-Beat Close-Quarters Visceral Combat & "Honest Hitbox" Video Audit:**
   - Automated QA harnesses that only mash abilities or cast big AOEs will miss fundamental close-quarters melee flaws. Every enemy AI, combat, or animation change MUST record and inspect a dedicated **Close-Quarters 1v1 / 1v3 Melee Audit Video** covering three unscripted-feeling beats:
     1. **Beat A — Aggressive Enemy Approach & Honest Blade-to-Body Contact (Zero "Bluetooth Hits"):**
        - Have the hero stand still while melee enemies approach and attack, then take 2 steps back mid-windup.
        - Enemies must sprint in decisively (`Running_A` at full speed all the way to `~1.2m–1.6m`, never dropping into a `1.0–1.6 m/s` slow-motion crawl inside `4.5–7.0m`), animate their swings at snappy combat speed (`~1.55×–1.85×`), and **physically step/lunge forward into their downswing** (`~1.18m–1.55m` center-to-center) so their 3D weapon visibly slices through the hero's body.
        - Hit detection (`isInAttackArc`) must match the actual 3D weapon length (`~1.65m` for standard 1H skeletons, `~2.2m` for 2H elites, `~2.5m` for bosses). If the hero steps or dashes outside physical blade reach, the swing must cleanly **whiff**—never damage the player across empty air.
     2. **Beat B — Unmistakable Player Damage Feedback (Readable Without Looking at the Corner HUD):**
        - When an enemy hits a hero, a viewer watching the center of the screen must immediately feel and see the impact via four synchronized signals:
          - A bold floating crimson **`-DMG`** pill (or icy-gold **`BLOCKED -DMG`** when blocking with Knight's shield `[F]`) spawning directly above the struck hero,
          - A `0.18s` crimson/white emissive hit-flash on the struck hero's 3D mesh,
          - A physical directional knockback jolt away from the attacker + crisp `hit_A` flinch animation (when idle/moving),
          - A translucent crimson screen-edge damage vignette pulse + top-left HP bar shake/flash.
     3. **Beat C — Visceral Enemy Hit Reactions (No "Plastic Toy" Enemies):**
        - Strike an enemy with basic `combo1 -> combo2 -> combo3` sword slashes (zero spells). Every single hit must pop a crisp floating damage number, flash the enemy's 3D mesh (`0.14s` warm-white/crimson emissive flash), apply a directional knockback impulse away from the swing, and trigger a snappy flinch reaction.
10. **Logical Anti-Cheat & State-Machine Precondition Gate:**
    - Every interactive mechanic (`[G]` Read Stone, `[R]` Awaken/Commune, Hero Swap, Proximity Revive) must enforce strict logical preconditions in both the UI prompt layer and the authoritative game/worker state machine:
      - Sacred Inscription Stones cannot be read (`[G]`) or awakened while living enemies contest the stone (`<= 20m` from the stone or `<= 16m` from either hero).
      - Keyword stone prayers cannot unlock remote stones the heroes are not physically standing beside.
      - Players cannot swap control into a downed hero (`0 HP`), and in Solo mode the AI wingman must immediately prioritize sprinting to revive a downed human leader.
11. **Windows Persistent Dev Server Protocol (Escaping the Harness Job Object):**
    - On Windows, standard `run_command` child processes (including `Start-Process`) inherit the tool call's Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) and are terminated as soon as the command exits or the turn ends.
    - Whenever launching a persistent local HTTP server for live browser playtesting (`http://127.0.0.1:4173/world/index.html`), ALWAYS spawn it via **WMI (`Win32_Process.Create`)** so `WmiPrvSE.exe` parents the process outside the agent Job Object:
      ```powershell
      Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = 'cmd.exe /c "set PORT=4173&& node C:\Users\silen\projects\kilo-3d-kit\world\tools\serve.mjs > C:\Users\silen\projects\kilo-3d-kit\world\shots\aggr-qa\server.log 2>&1"'
        CurrentDirectory = 'C:\Users\silen\projects\kilo-3d-kit'
      }
      ```
    - Always verify `Invoke-WebRequest -Uri 'http://127.0.0.1:4173/world/index.html' -UseBasicParsing` returns `StatusCode 200` before telling Vikas the server is ready.


