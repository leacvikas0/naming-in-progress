# SOUL.md — The Vision, Rules & Build Order of Our Co-Op Game

> **Mandatory Reading for Every Agent:** This document records **only** what Vikas explicitly specified and discussed with the lead agent. We are building this as a personal passion project for Vikas and his wife to play together whenever they want to have fun. Do not invent bloated RPG filler; build with AA craft, discipline, and heart.

---

## 1. What This Game Is (And Who It Is For)

- **A Romantic, High-Synergy 2-Player Co-Op Action Game:**
  - Built specifically for **Vikas** (playing on his desktop PC: `i5-12400F` + `RX 6700`) and **his wife** (playing on her **Xiaomi Pad 7** tablet with *Genshin Impact*-style touch controls).
  - Instead of playing solo with character hot-swapping, each of us picks **one character**, and our attacks, buffs, and powers are designed to **support, protect, and power each other up**.
  - Hosted on **Cloudflare Workers** as the authoritative backend managing the game room and state.

---

## 2. The Strict 5-Stage Build Order (Scope Discipline)

We do **not** mash everything together at once. We build the project in five strict, sequential layers, locking quality at each layer before moving to the next:

1. **Stage 1 — The Scene Map (Expanded Blockout & Toroidal Valley Layout)**
   - Start with a low-poly Three.js 3D blockout to lock terrain, sightlines, and logical placement.
   - **Map Scale & Boundary Rule (From Vikas's Latest Review):**
     - The central town layout (`house3d`-style Tudor hamlet) is good in structure, but **outside the town we must increase the distances between landmarks and expand the overall playable area** so the world feels noticeably larger and has room to breathe.
     - Beyond the playable zone, frame the horizon with a scenic **valley and distant mountains** visible from inside the game.
     - **Toroidal Boundary Teleport:** Crossing the outer boundary of the game zone seamlessly teleports/wraps the player to the opposite side of the valley.
2. **Stage 2 — The 3D Environment Assets (2-Pass Parallel Subagent Workflow)**
   - Replace blockout volumes with high-craft procedural cel-shaded assets (`world/assets/houses/`, `world/assets/flowers/`, `world/assets/terrain/`), built one asset family per subagent and verified through the 2-pass blind critic-fixer loop.
3. **Stage 3 — Characters & Native Skeletal Motion**
   - Player heroes come from **KayKit (`library/kaykit-adventurers`) only**—never use the ugly Kenney/KayKit dungeon or environment prop kits.
   - Enemies and additional characters come from KayKit skeletons and quality rigged packs found online.
   - **100% Native Diverse Skeletal Animations:** Use real skeletal animation clips from the packs/online—never build procedural bone-wiggling animations.
4. **Stage 4 — Cinematic, Breathtaking VFX Engine**
   - The visual effects for attacks, spells, weapon trails, partner halos, and sky-parting miracles must be **extremely high quality and cinematic**.
   - Build upon our verified VFX references (`_archive/legacy-game/src/*-vfx.js`: `ice-lance-vfx.js`, `glacial-crown-vfx.js`, `thunder-vfx.js`, and `docs/experiments/2026-09-16-vfx-libraries.md` with `three.quarks` + custom toon/bloom shaders).
5. **Stage 5 — Game Mechanics, Cloudflare Workers Co-Op, Login & Live Voice Judgment**
   - Only after Stages 1–4 look and feel incredible do we wire up the full game loop, login/room pairing, and the live voice-judged romantic invocations.

---

## 3. Core Romantic Combat & The "Artorious" Live Voice Mechanic

What we have discussed and locked so far for the gameplay & powers (with room to keep iterating):

- **Live Voice-Judged Miracles ("Praying to Artorious, God of Love"):**
  - To cast high-impact support/empowerment spells (like a major heal, revive, or divine partner buff), the caster speaks aloud into their mic (e.g., *"Artorious, the God of Love, bare your eyes to my pain and the suffering of my beloved—grant us your grace, let my spell be empowered beyond measure with the love in my heart and your benevolence!"*).
  - **Direct Multimodal Audio (Gemini Live Connection, Not Just Whisper):**
    - Instead of plain text transcription (which loses vocal emotion), we stream live audio to Gemini so it judges **both the words and the emotional delivery/tone** in real time.
  - **Artorious's Verdict & In-Game Voice:**
    - Artorious speaks back inside the game with a **very restrained, deadpan divine voice**:
      - **If the prayer is monotone, rushed, or lacks emotion:** The clouds part and Artorious **strikes the speaker** with a petty lightning bolt (*"Your love is insincere"*), dealing comic punishment instead of the spell.
      - **If the prayer is heartfelt, dramatic, or genuinely funny/committed:** The heavens open in a cinematic miracle, empowering the heal/buff beyond measure.
- **Mutual Embarrassment & Synergy (Discussed Direction):**
  - **Sanctuary Time-Dilation:** Holding the invocation button slows world time and spotlights the speaker so they have 4–6 seconds to deliver their line without getting mauled mid-sentence.
  - **Symmetric Roles:** Both partners have partner-empowering skills (`E`) and high-stakes voice invocations (`Her Prayer of Grace` to heal/supercharge him; `His Chivalric Oath` to shield her / drop a devotion meteor), plus a **Call-and-Response Couples Ultimate**.

---

## 4. What Is Locked vs. What Is Still Open

- **LOCKED:**
  - Target devices (`RX 6700` Desktop + `Xiaomi Pad 7` Tablet with *Genshin*-style touch controls).
  - Hard ban on `C:\Users\silen\Downloads\world 1` code (visual mood reference only) and hard ban on Kenney/KayKit environment prop kits.
  - Diffusion images (`gpt-image`) used strictly for mood/color reference, never geometry to copy.
  - 5-stage build sequence (Map $\rightarrow$ Assets $\rightarrow$ Characters/Motion $\rightarrow$ Cinematic VFX $\rightarrow$ Mechanics/Login/Voice).
  - Expanded valley distances outside town + scenic mountain horizon + toroidal boundary wrap teleport.
  - 2-Pass Parallel Subagent Asset Methodology & Truly Blind `/10` Critics (`METHODOLOGY.md`).
  - Strict Git & Worktree Discipline (`GIT-DISCIPLINE.md`).
- **STILL OPEN FOR DESIGN DISCUSSION (When Ready):**
  - Final hero roster lock (exact weapon/element pairings beyond the Knight + Mage core duo).
  - Exact boss roster and between-wave town activities.
  - Artorious's specific prompt pools and voice synthesis tuning.
