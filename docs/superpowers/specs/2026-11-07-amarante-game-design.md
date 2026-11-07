# Amarante ("The Unfading Bloom") — End-to-End Game Experience, Logic & UI Spec

**Date:** 2026-11-07  
**Status:** Active Canonical Spec (Resolving the 5 Core Logical Holes & Overhauling UI to Genshin-Clean Light Aesthetic)

---

## 1. Core Experience & Player Journey (Second 0 to Climax)

### Stage A — Opening & Co-Op Pairing (`world/src/ui/app-flow.js`)
1. **Title Screen (`FLOW_STEPS.TITLE`):**
   - Camera frames the sunlit Southern Flower Field `(0, 128)` looking north down the country road toward the village.
   - Clean, light typography (`Amarante` / `The Unfading Bloom` / `Developed by Argon & Sol · Directed by Vikas · For Ishika`) with a warm light stone CTA button: **`Enter Valley`**.
2. **Create or Join World (`FLOW_STEPS.CREATE_JOIN`):**
   - Heading: **`Meet in the Valley`**
   - Two light, warm limestone cards (`#faf6ee` surface, `#231f1c` dark ink text, zero `#1b1822` black slabs):
     - **Create World:** Shows a human-memorable room phrase (e.g., `Love is curiosity`; tap to cycle) and a **`Create`** button.
     - **Join World:** Clean input field for the room phrase and a **`Join`** button.
3. **3D Flower Field Hero Claim (`FLOW_STEPS.FLOWER_LOBBY`):**
   - Camera moves in front of the **Knight** and **Mage** standing among wildflowers at `(0, 133)`.
   - Clicking/tapping a hero claims that role (`Knight` or `Mage`) and opens a light warm-stone name bubble (`Your name: [Vikas] [→]`).
   - **Co-Op Start vs. Solo Dev Test Escape Hatch (Logical Hole #1 Fix):**
     - In 2-player co-op, each player claims one hero and confirms their name; once ready, the session starts at the Southern trailhead `(0, 124)`.
     - **Dev Solo Escape Hatch (`DEV_SOLO_TEST`):** A clearly marked **`Solo Test →`** button in the Flower Field Lobby lets a single developer enter the valley immediately without waiting for a second player, and allows `Alt+Tab` / portrait-tap hero swapping while solo (`playerCount < 2`). When 2 human players are connected (`peerConnected === true`), each player is locked to their claimed hero.

---

### Stage B — Starting Kit & Road to Town (`Stage 0: Unawakened`)
- Both heroes spawn at `(0, 124)` facing North toward Town.
- **Strictly Gated Starting Controls (Logical Hole #2 Fix):**
  - Legacy debug hotkeys (`1, 2, 3, 4` and `K`) that bypassed progression are removed from `world/src/main.js`.
  - At `Stage 0`, **only** the 3 physical actions exist on the HUD and in input handling:
    - **Normal Attack (`[LMB]`):**
      - **Knight:** Tap = 4-hit native sword combo (`1.0x -> 1.30x` mash speed ramp, contact-frame hit detection). Hold = **Frontal Shield Block** (`80%` damage reduction).
      - **Mage:** Tap = 3-hit arcane bolt combo (nearest-enemy soft-lock). Hold = **Stationary Shatterlance** (full animation load; max 3 consecutive charged casts before automatic normal-attack fallback).
    - **Dash (`[Shift]` / Right-Click)**
    - **Jump (`[Space]`)**
  - `[R] Commune`, `[E] Elemental Skill`, `[Tab] Element Switch`, and `[Q] Ultimate` are **hidden and locked** at Stage 0.

---

### Stage C — The 3 Sacred Sites & Shared Sequential Progression (Logical Holes #3 & #4 Fix)
- **The 3 Sacred Inscription Sites:**
  1. **The Village Well** `(0, 0)` (Town Plaza)
  2. **The Wisteria Grove Medallion** `(44, 16)` (East Grove)
  3. **The Lakeside Sanctuary Stele** `(-42, 18)` (West Pier / Cottage Alley)
- **Reading Any Site Unlocks `Commune [R]`:**
  - Walking within `5.5m` of any site displays a floating world-projected **`Read [G]`** button.
  - Inspecting any site for the first time reveals the **`Commune [R]`** button in the upper-right of the action arc for both partners.
- **Sequential Shared Couple Unlocks (`Stage 0 → 1 → 2 → 3`):**
  - Regardless of which physical site the couple visits first, solving the riddles via `Commune [R]` advances the **shared room progression sequentially** for both players together:
    - **1st Awakening (`Stage 1 — Rime Covenant`):** Solving the first riddle (speaking the God of Love's secret True Name) unlocks **`[E]` Elemental Skill (Ice)** for both partners:
      - **Knight `[E]`:** `Ice Sword` (`13s` active / `18s` cooldown — slows enemy movement, attack speed, and damage).
      - **Mage `[E]`:** `Frost Lance` (`Hold E` terrain-conforming cyan aim arrow, `Release E` casts `14.5m` solid ice spear line, `8.5s` cooldown).
    - **2nd Awakening (`Stage 2 — Twin Flame`):** Solving the second riddle (first spoken Proof of Love) unlocks **Fire Element** on `[E]` AND reveals the **Left-Side `[Tab]` Element Switch (`Ice ⇄ Fire`)** (~30% below top-left of screen):
      - **Knight `[E]` (Fire):** `Fire Sword` (`13s` active / `18s` cooldown — ignites blade with persistent burn damage).
      - **Mage `[E]` (Fire):** `Cinder Fall` (`Hold E` variable-distance `3..16m` terrain aim arrow, `Release E` calls down a molten meteor).
    - **3rd Awakening (`Stage 3 — Sovereign Ascendance`):** Solving the third riddle (second spoken Proof of Love) unlocks **`[Q]` Elemental Burst Ultimate** for both partners:
      - **Knight `[Q]`:** `Sovereign Sky-Strike` (sword-raise pose, fiery/water lightning from above, `10s` of `2x` double damage, `24s` cooldown).
      - **Mage `[Q]`:** `Storm Cataclysm` (`6s` stationary devastating lightning-and-tempest storm; fragile—1 unprotected hit downs her, requiring the Knight to shield/protect her).

---

### Stage D — Fragile Mage, Downed / Revive & Valley Climax (Logical Hole #5 Fix)
- **Asymmetric Co-Op Synergy:**
  - The **Mage** has high area damage but low HP (dies in ~3 hits) and is completely stationary during Charged Shatterlance and `Q` Storm Cataclysm.
  - The **Knight** has high HP, `80%` frontal Shield Block DR, and `Ice Sword` slow to peel enemies off the Mage.
- **Downed & Revive Mechanic:**
  - If either hero drops to `0 HP`, they enter a **Downed State**.
  - They can be revived in two ways:
    1. **Partner Proximity Revive:** The surviving partner walks within `3.2m` of the downed hero (automatic/interact rescue).
    2. **Emergency Prayer to Artorious (`Commune [R]`):** Speaking a sincere emergency plea while low HP or while a partner is downed triggers the Sacred Lotus forcefield & miracle heal/revive.

---

## 2. Genshin-Inspired Light HUD & UI Specification (`world/src/ui/sculpted-hud.js`)

1. **Zero Redundant Bottom Health Bar:**
   - The bottom-center health bar is removed. Player and partner HP/Shields live exclusively in the **Top-Left Party Strip**.
2. **Top-Left Party Strip:**
   - Authentic 3D-rendered bust portraits of our actual **KayKit Chibi Knight** (grey faceted visor helmet, red cape) and **KayKit Chibi Mage** (purple pointed witch hat with orange band).
   - Floating crisp white names (`Vikas`, `Ishika`) with natural drop shadows and slim Genshin-style lime-green HP bars (`#78d64b`) + golden shield bar extensions. No opaque black pills behind names.
3. **Left-Side `[Tab]` Element Switch (`~30vh` from Top-Left):**
   - Simple, lightweight pill switch on the left side (`top: 30%`, `left: 22px`) showing **`Ice ⇄ Fire [Tab]`**. Only visible once `Stage 2` is unlocked.
4. **Bottom-Right Action Cluster (Genshin Translucent Circles + Colored Vertical Fill):**
   - Clean translucent circles (`rgba(36, 38, 44, 0.28)` fill, `1.5px solid rgba(255, 255, 255, 0.68)` rim, subtle inner notched ring).
   - **Flat White Silhouette Icons (Per-Character):**
     - **Attack (`[LMB]`):** Broadsword over 8-point star (Knight) / Arcane Orb-Staff over 8-point star (Mage).
     - **Dash (`[Shift]`):** Dashing figure + double chevrons `>>`.
     - **Jump (`[Space]`):** Leaping figure + curved upward arrow.
     - **Skill (`[E]`), Burst (`[Q]`), Commune (`[R]`):** Flat white elemental/rose glyphs with **vertical bottom-to-top colored fill bars** (`.sh-vertical-fill`) that rise and fall with cooldown/charge state (Ice Cyan `#38bdf8`, Fire Amber `#fb923c`, Burst Gold/Violet `#facc15`, Commune Rose `#f43f5e`).
