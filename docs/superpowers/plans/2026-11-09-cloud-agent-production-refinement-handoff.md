# Amarante — Cloud Agent Production Refinement, Post-Processing, Performance & High-Craft Multiplayer Handoff

**Date:** 2026-11-09  
**Branch:** `master`  
**Target Hardware:**
- **Player 1 (Vikas — Desktop PC):** `Intel i5-12400F` + `AMD RX 6700`, `1440p` / `1080p`, `120–144 FPS`
- **Player 2 (Ishika — Tablet):** `Xiaomi Pad 7` (`3200×2136` `3:2` touch screen), `90–120 FPS` (`<= 46` scene draw calls)

---

## 1. Mission Brief for the Cloud Agent

You are receiving a clean, working, git-committed build of **Amarante** (*The Unfading Bloom* — a 2-player co-op 3D action RPG with multimodal Gemini voice-judged miracles). All legacy prototype files, unused asset packs, and obsolete screenshot dumps have been purged so you are working exclusively on the live production codebase.

Your mission is to take this foundation and **push it to an uncompromising, production-ready AA standard** across four core pillars:

1. **Rock-Solid, Low-Latency 2-Player Multiplayer (`worker/room-do.js`, `world/src/net/coop-client.js`, `world/src/player-controller.js`, `world/src/combat/campaign-loop.js`):**
   - **Authoritative & Deterministic Enemy + Wave Synchronization:**
     - Ensure that when two real browsers (`Host` + `Guest`) are paired in a room via `CoopRoomDO` (`worker/room-do.js` & `world/tools/serve.mjs`), all `8` active enemies' positions, target locks, animations (`windup`, `attack`, `hit_A`, `death`), HP, elemental marks (`rime`, `solar`), and Two-Tier Detonations (`SHATTERBLOW`, `SOLAR FLARE`) stay 100% synchronized at `20 Hz` with smooth cubic Hermite / velocity dead-reckoning interpolation on the Guest client (zero enemy teleport-snapping or ghost enemies!).
   - **Full Skill, VFX & Hazard Replication:**
     - Replicate **every** partner action with exact parameters:
       - Mage `Hold LMB` (`shatterlance`), `Hold E` (`frost_lance` / `cinder_fall`), and `Q` (`storm_cataclysm` — including the `8.4m` outer / `1.68m` inner golden bombardment circle on the ground and the friendly-fire evacuation hazard for the Knight!).
       - Knight `LMB` combos (`combo1..4`), `Hold LMB` frontal shield block (`80%` DR + physical line-of-fire interception protecting the Mage), `E` Power Sword (`13s` active / `18s` CD with `Tab` summon lock), and `Q` Twin-Element Eclipse Blade (`12s`, `2.0×` DMG).
   - **Seamless Reconnection, Presence & Room Lifecycle:**
     - Handle WebSocket drops, mobile tab backgrounding on Xiaomi Pad 7, instant state catch-up on reconnect (`world_sync` snapshot + `stonesSolvedMask` bitmask), and sub-50ms RTT ping/jitter telemetry.
   - **Synchronized Two-Tier Commune (`[Hold R]`):**
     - Ensure both players see the live audio waveform/timer when either partner holds `[R]`, lock controls symmetrically during Mode B (`divine_miracle`) slow-motion Eclipse and the `4.80s` 4-beat Resurrection/Blessing (or `2.80s` Smite), and play the synchronized divine voice line on both devices.

2. **Post-Processing, Atmosphere & Shader Polish (`world/src/post.js`, `world/src/sky-tod.js`, `world/assets/`):**
   - Refine the custom HDR post-processing pipeline (`world/src/post.js`) and time-of-day transitions (`Day` $\rightarrow$ `Dusk` $\rightarrow$ `Starlit Night` + `Eclipse` & `Smite Monochrome`):
     - Crisp cel-shaded tonal separation, warm sunlight halation without muddy yellow/amber wash, clean contact shadows (`uCharShadows[10]`), and lush wind-driven gouache meadow motion (`world/assets/flowers/meadow.js`).
     - Maintain the **Universal "Zero Glass" Rule**: all spells and VFX (`world/assets/vfx/*.js`) must use hardware-opaque (`transparent: false`) cel-shaded geometry or hard-cutout shaders (`discard`)—never washed-out alpha-blended fog.

3. **UI, HUD & Boot Flow Tightening (`world/src/ui/app-flow.js`, `world/src/ui/sculpted-hud.js`, `world/src/ui/damage-numbers.js`):**
   - **Unified Single-Stage Boot (`0ms` Pixelated Dither Reveal):**
     - Never show a separate pre-boot splash screen before the pixelated dither canvas. The calligraphic `Amarante` title screen + Bayer 4×4 dither veil (`app-flow.js`) mounts at `0ms` while character GLBs load in the background and resolves directly into the live 3D valley.
   - **Functional, Elegant Dark-Frosted HUD (`sculpted-hud.js` & `damage-numbers.js`):**
     - Keep the HUD cohesive (`rgba(16, 20, 28, 0.72)` dark-frosted translucent pills, warm-ivory/silver rims, zero baby-blue Ghibli clutter, and consolidated Option 2 damage pill badges that never overlap).
     - Ensure 100% touch responsiveness on the `3:2` Xiaomi Pad 7 layout (`setProfile('tablet')`).

4. **Performance & Frame-Pacing Discipline:**
   - **Desktop (`RX 6700`):** `120–144 FPS` (`<= 54` scene draw calls, `4x MSAA` + bloom).
   - **Tablet (`Xiaomi Pad 7`):** `90–120 FPS` (`<= 46` scene draw calls, zero GC spikes or frame hitches during 8-enemy waves or the 68-meteor `Q` barrage).

---

## 2. Mandatory Reading & Verification Protocol

1. Read [`AGENTS.md`](file:///C:/Users/silen/projects/kilo-3d-kit/AGENTS.md), [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md), [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md), [`docs/superpowers/plans/2026-11-07-amarante-final-playable-handoff.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-11-07-amarante-final-playable-handoff.md), and [`docs/superpowers/plans/2026-11-08-combat-aiming-ai-overhaul-plan.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-11-08-combat-aiming-ai-overhaul-plan.md).
2. Inspect the current visual baseline screenshots in [`docs/design-references/visual-baseline-2026-11-07/`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/visual-baseline-2026-11-07) before touching any shader or UI file.
3. Run `npm test` (`test-combat-sim.mjs` + `test-coop-room.mjs`) and record + watch live 2-browser multiplayer gameplay videos via Playwright before claiming completion.
