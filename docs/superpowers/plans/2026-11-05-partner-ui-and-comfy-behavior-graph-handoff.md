# Partner Agent Handoff — UI Refinement, End-to-End Behavioral Audit & ComfyUI-Style Video Behavior Graph

**Date:** 2026-11-05  
**Target Workspace / Git Worktree:** `C:/Users/silen/projects/kilo-3d-kit/.kilo/worktrees/behavior-ui` (Branch: `feat/behavior-graph-and-ui-polish`)  
**Sibling Thread Boundary:** The main workspace (`C:/Users/silen/projects/kilo-3d-kit`) is actively being used by Vikas + Primary Agent for **Sound & Music R&D (`world/src/audio/**`, `world/src/combat/combat-sfx.js`, `world/assets/audio/**`)**. **DO NOT touch audio/music/sfx files.**

---

## 1. Operating Contract & Core Rules (READ FIRST)

1. **Mandatory Project Reading:** Read [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md), [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md), [`GIT-DISCIPLINE.md`](file:///C:/Users/silen/projects/kilo-3d-kit/GIT-DISCIPLINE.md), and [`docs/superpowers/plans/2026-11-02-haru-machi-locked-master-plan.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-11-02-haru-machi-locked-master-plan.md).
2. **Zero Spoilers to Vikas:** NEVER reveal the God of Love's secret true name or the actual text/answers of the 3 Sacred Inscription Stone poems in chat, UI screenshots, or node graph labels (use placeholders like `[Secret Stone Poem #1 — True Name Riddle]` in any visible graph node).
3. **Subagent Concurrency Cap:** Spawn **at most 3 subagents at the same time** (`<= 3` concurrent subagents). Use them aggressively to parallelize video capture, UI auditing, and graph building, but never exceed 3 active subagents at once.
4. **Non-Blocking "Keep Vikas in the Loop" Protocol:**
   - Do **everything you can do autonomously right away** without waiting.
   - Whenever a visual or design choice needs Vikas's taste (such as UI/HUD layout refinements generated with `gpt-image`), **generate the visual options first, show them to Vikas in chat to pick, AND keep executing unblocked engineering work in the background** (recording game-state videos, wiring the ComfyUI node graph, fixing behavioral bugs).
5. **Pragmatic Scope (Made for Vikas & Ishika):**
   - This game is a personal romantic co-op gift for Vikas and his wife Ishika (`Desktop RX 6700` + `Xiaomi Pad 7`). Do **not** add enterprise bloat or rewrite working 3D shaders (`Briar Option 9`, `Left-to-Right Wind Petal Smite`, and the `World Shadow Pass` are already locked and approved). Focus on **rock-solid behavior, clean UI, and a visual node-graph inspector** so Vikas can see and tune how every part of the game behaves without reading code.

---

## 2. Mission Overview (3 Parallel Tracks)

Vikas is an AI-first engineer and learning-science designer who thinks in **visual causal graphs and live motion**, not walls of code. Your mission has three tightly connected deliverables:

### Track A: `gpt-image` UI Polish & Step-by-Step UI/Tab/Flow Verification
1. **Audit Every Screen & Interaction Step-by-Step:**
   - **Step 1 (`Title` — `FLOW_STEPS.TITLE`):** `Haru-machi` title, credits (*Developed by Argon & Sol · Directed by Vikas · For Ishika*), `Enter the Valley` button.
   - **Step 2 (`Loading` — `FLOW_STEPS.LOADING`):** Stone progress bar & shader warmup transition.
   - **Step 3 (`Create / Join World` — `FLOW_STEPS.CREATE_JOIN`):** Human-memorable room phrase (`"Love is curiosity"`), Create vs. Join tabs, 2-seat room pairing (`?room=`), 3rd-player `room_full` rejection.
   - **Step 4 (`Southern Flower Field Lobby` — `FLOW_STEPS.FLOWER_LOBBY` at `(0, 128)`):** Role selection (`Knight` vs. `Mage`), Guest `Ready` / Host `Start Expedition`, live 3D character emotes (`wave` / `cheer`).
   - **Step 5 (`In-Game Sculpted HUD` — `FLOW_STEPS.IN_GAME`):**
     - Starts bare (`unlockedStage === 0 && !communeDiscovered`): Top-left 2 life bars (clickable Role Emblem -> Character Info Card modal), Top-right Pause (`||`) button (with Time-of-Day tabs: `Morning`, `Golden Hour`, `Twilight`, `Starlit Night`, `Auto Cycle`, plus Device Profile & Role Swap), and Bottom-right Action Cluster on Tablet (`Attack`, `Evade`, `Jump`, left thumbstick).
     - Progressive Unlock States:
       - Reading Stone 1 (`(0, -14)`), Stone 2 (`(-42, 18)`), or Stone 3 (`(44, 16)`) via `✿ Read` opens the Weathered Inscription Modal and reveals the `Commune [R]` lotus tablet.
       - Stage 1 Unlock $\rightarrow$ `E` Power Slot (`Ice Sword` / `Frost Lance`) + Awakening Card.
       - Stage 2 Unlock $\rightarrow$ `Tab` Element Toggle (`Ice` $\leftrightarrow$ `Fire`: `Fire Sword` / `Cinder Fall`).
       - Stage 3 Unlock $\rightarrow$ `Q` Personal Ultimate (`Sky-Lightning Awakening` / `6.0s Vulnerable Storm Cataclysm`).
2. **Generate Visual UI Refinement Options with `gpt-image` (`imagen-guide`):**
   - Load `imagen-guide` (`C:\Users\silen\.gemini\antigravity-acp\t3-home\config\skills\imagen-guide\SKILL.md`) and `interfaces` (`C:\Users\silen\.gemini\antigravity-acp\t3-home\config\skills\interfaces\SKILL.md`).
   - Inspect real screenshots of the current UI modals (`Character Info Card`, `Pause / Time-of-Day Modal`, `Weathered Stone Inscription Modal`, `Awakening Card`, `Create/Join Tablets`).
   - If any modal, tab state, or HUD element feels flat, cramped, or inconsistent with `docs/references/visual-concepts/sculpted-hud-concept.png`, generate 3–4 visual concept variations with `mcp_gpt-image_generate_image` / `edit_image`, show them to Vikas for selection, and implement the winning polish in `world/src/ui/app-flow.js` and `world/src/ui/sculpted-hud.js`.

---

### Track B: Automated Video Capture of Every Game State & Causal Transition
Vikas specifically asked that the behavioral graph use **rendered video loops / frame sequences (`.webm` clips)**—not just static screenshots—so he can watch the actual behavior inside each node.

Build a Playwright capture script (`world/tools/capture-behavior-graph-clips.mjs`) that records crisp `640×360` (or `800×450`) `.webm` video loops into `world/behavior-graph/clips/` for every node in the game's state machine:
1. `01-flow-title.webm` — Title screen over the Southern Flower Field vista.
2. `02-flow-loading.webm` — Loading stone bar transition.
3. `03-flow-create-join.webm` — Create / Join World tablets & room phrase input.
4. `04-flow-flower-lobby.webm` — Knight & Mage waving/cheering in the wildflowers at `(0, 128)` + Role Swap & Start.
5. `05-hud-bare-start.webm` — Dropping into `(0, 124)` with the bare HUD (`Stage 0`).
6. `06-hud-role-info-and-pause-tabs.webm` — Clicking the Role Emblem (Character Info Card) & Pause Modal Time-of-Day tabs (`Day` $\rightarrow$ `Evening` $\rightarrow$ `Night`).
7. `07-stone-read-unlock-commune.webm` — Approaching a Sacred Stone, tapping `✿ Read`, viewing the Inscription Modal (spoiler-masked), and unlocking the `Commune [R]` tablet.
8. `08-commune-tap-vs-hold.webm` — Pressing `R` within `<= 4.0m`: `Frame 37` Eclipse sky compression, `6.5m` airborne enemy throw (`0.15x` slow-mo), and the 30s Crimson Rose ring timer + listening bar.
9. `09-verdict-briar-blessing.webm` — `Briar Option 9` 4-beat sequence: slow root creep $\rightarrow$ fast chestnut-mahogany briar whip $\rightarrow$ `-3.05m` downward plunge $\rightarrow$ `1.6s` underground flower slump & smooth HP fill $\rightarrow$ side-by-side pop-up & `30s` `<= 5.0m` tether buff.
10. `10-verdict-smite-wind-petals.webm` — `Frame 41` `0.0x` dead-wind B&W snap $\rightarrow$ left-to-right wind erosion into `1.68x` crimson petals that accelerate and vanish mid-flight.
11. `11-knight-combat-kit.webm` — Knight 4-hit sword combo (`1.0x -> 1.3x` mash ramp), Hold `Shield Block` (`80% DR`), `Tab` `Ice`/`Fire` toggle, `E` Power Sword (`13s` active / `18s` CD = `5s` downtime), and `Q` Sky-Lightning Awakening (`10s` `2.0x` DMG).
12. `12-mage-combat-kit.webm` — Mage 3-bolt soft-lock combo, Hold `Shatterlance` (auto-fallback after 3 consecutive charged shots), `Hold E` / `Release E` terrain-conforming Spellbook Aim Arrow (`Frost Lance` `14.5m` vs. `Cinder Fall` `3..16m`), and `Q` `6.0s` vulnerable Storm Cataclysm.

---

### Track C: ComfyUI-Style Interactive Behavioral Node Graph (`world/behavior-graph.html`)
Build a fast, self-contained, dark-mode **ComfyUI-Style Visual Behavioral Node Graph** at `world/behavior-graph.html` (and deployable to Cloudflare Pages so Vikas can open it in one click):

1. **Use the Fastest, Cleanest Node-Canvas Stack:**
   - Either **`LiteGraph.js`** (ComfyUI's own canvas engine) OR a custom HTML5 pan/zoom + SVG Cubic-Bezier noodle-wire canvas (whichever renders embedded `<video autoplay loop muted playsinline>` cards inside nodes cleanest and sharpest at 60fps!).
   - Note: Custom HTML/DOM node cards inside a pan/zoom transform container (`transform: translate(x, y) scale(z)`) with an SVG cubic-bezier wire overlay (`like ComfyUI / React Flow / xyflow`) is often **much crisper for playing live `<video>` elements, interactive buttons, and sliders** than `<canvas>`-only `LiteGraph.js`! Choose whichever gives Vikas the most responsive ComfyUI feel.
2. **What Every Node Shows:**
   - **Header Bar:** Color-coded by category (`Opening Flow`, `UI & Modals`, `Sacred Stones & Commune`, `Divine Verdicts`, `Knight Kit`, `Mage Kit`, `Co-Op & World Rules`).
   - **Live Looping Video Stage:** Plays the real recorded `.webm` clip of that exact state right inside the node card (with hover-to-scrub or click-to-expand).
   - **Input & Output Noodle Ports:**
     - Shows exact trigger conditions on input wires (e.g., `Tap [R] & dist <= 4.0m & (!inCombat || Downed || HP < 35%)`) and exact state transitions on output wires (`Hold >= 1.5s -> Release Sends`, `Tap < 1.5s + 2.2s Silence -> Auto-Send`, `< 2 Words -> Safe Cancel (0 Penalty)`).
   - **Interactive Parameter Widgets (ComfyUI Style):**
     - Editable number pills / sliders right on the node for the key design parameters (`communeMaxSec: 30`, `prayerMaxDist: 4.0m`, `blessingTetherDist: 5.0m`, `blessingDuration: 30s`, `knightECooldown: 18s`, `knightEDuration: 13s`, `mageECooldown: 8.5s`, `mageQDuration: 6.0s`, `mashRampMax: 1.30x`).
     - Include a **"Simulate / Trace Path"** button on trigger nodes that lights up the active bezier wires and downstream nodes step-by-step so Vikas can visually trace what happens when any button is tapped, plus an **"Export Tuned Config"** button.

---

## 3. Recommended Execution Order for the Partner Agent

1. **Step 1 (Setup Worktree):** Verify you are running inside your isolated git worktree (`C:/Users/silen/projects/kilo-3d-kit/.kilo/worktrees/behavior-ui`) so your edits never conflict with the main workspace.
2. **Step 2 (Launch Up to 3 Subagents in Parallel):**
   - **Subagent 1 (`UI & Modal Auditor`):** Audits `world/src/ui/app-flow.js`, `world/src/ui/sculpted-hud.js`, and `world/src/main.js` across every screen, tab, and button; captures baseline screenshots of every UI state.
   - **Subagent 2 (`Behavioral Video Recorder`):** Writes and runs `world/tools/capture-behavior-graph-clips.mjs` to record the 12 real `.webm` gameplay/UI clips for the ComfyUI node graph.
   - **Subagent 3 (`ComfyUI Node Graph Architect`):** Builds `world/behavior-graph.html` with pan/zoom canvas, color-coded ComfyUI node cards, `<video>` players, bezier noodle wires, interactive parameter widgets, and path-tracing simulation.
3. **Step 3 (Keep Vikas in the Loop):**
   - Present any UI refinement options (`gpt-image`) and deploy `world/behavior-graph.html` to Cloudflare Pages (`wrangler pages deploy`) so Vikas can inspect the entire game's behavior visually in his browser.
