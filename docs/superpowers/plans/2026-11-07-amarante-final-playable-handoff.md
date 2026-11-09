# Amarante — Final Playable Game Master Plan (Systems, Math, AI, Puzzles & Video QA)

**Date:** 2026-11-07  
**Branch:** `master` (`C:\Users\silen\projects\kilo-3d-kit`)  
**Hardware Targets:** Vikas on Desktop (`AMD RX 6700`, `120–144 FPS`) + Ishika on Tablet (`Xiaomi Pad 7`, `3200×2136` `3:2` touch, `90–120 FPS`)  
**Goal:** Ship a cohesive, thrilling, mathematically balanced, bug-free 2-player co-op action experience where surviving intelligent enemy waves and solving 3 ancient stone mysteries drives Vikas and Ishika to shout shameless, heartfelt, cheesy love confessions to each other.

---

## 0. Mandatory Context Packet for Every Agent & Subagent

Before writing a single line of code or running any critique, every builder and critic subagent MUST read and inspect:

1. **Vikas's Exact Verbatim Prompts Archive:** [`docs/superpowers/plans/2026-11-07-vikas-verbatim-prompts-archive.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-11-07-vikas-verbatim-prompts-archive.md) (especially Steps `2349–3265` for UI, stones, the God, combat controls, enemy waves, and video testing).
2. **Core Operating Contracts:** [`AGENTS.md`](file:///C:/Users/silen/projects/kilo-3d-kit/AGENTS.md), [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md), [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md), [`frontend-design/SKILL.md`](file:///C:/Users/silen/.gemini/antigravity-acp/t3-home/config/skills/frontend-design/SKILL.md), [`judging-3d-scenes/SKILL.md`](file:///C:/Users/silen/.gemini/antigravity-acp/t3-home/config/skills/judging-3d-scenes/SKILL.md), and [`judging-gameplay/SKILL.md`](file:///C:/Users/silen/.gemini/antigravity-acp/t3-home/config/skills/judging-gameplay/SKILL.md).
3. **Mandatory Visual Baseline Screenshots (Inspect via `view_file` First):**
   - [`docs/design-references/visual-baseline-2026-11-07/integrated-site1-well-day.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/visual-baseline-2026-11-07/integrated-site1-well-day.png) (Village Well monument + Ghibli Wellspring Water)
   - [`docs/design-references/visual-baseline-2026-11-07/integrated-site2-platform-day.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/visual-baseline-2026-11-07/integrated-site2-platform-day.png) (Whispering Grove circular floor medallion)
   - [`docs/design-references/visual-baseline-2026-11-07/integrated-site3-wall-day.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/visual-baseline-2026-11-07/integrated-site3-wall-day.png) (Hidden Lovers' Wall monument)
   - [`docs/design-references/visual-baseline-2026-11-07/06-mage-aim-reticle-and-dark-hud.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/visual-baseline-2026-11-07/06-mage-aim-reticle-and-dark-hud.png) (Over-the-shoulder Mage camera, dashed 3D trajectory arc, thin geometric reticle & dark-frosted HUD)
   - [`docs/design-references/visual-baseline-2026-11-07/08-option2-clean-damage-pills.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/visual-baseline-2026-11-07/08-option2-clean-damage-pills.png) (Option 2 consolidated dark-frosted damage pill badges: `SOLAR FLARE` & `STARFALL`)
   - [`docs/design-references/visual-baseline-2026-11-07/09-front-fire-meteors-and-mage-circle.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/visual-baseline-2026-11-07/09-front-fire-meteors-and-mage-circle.png) & [`docs/design-references/visual-baseline-2026-11-07/10-target-meteor-concept.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/visual-baseline-2026-11-07/10-target-meteor-concept.png) (Front-face bow-shock fire meteors + Mage `8.4m` outer / `1.68m` inner golden bombardment circle)
   - [`docs/design-references/visual-baseline-2026-11-07/zeropop-day-plaza.png`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/design-references/visual-baseline-2026-11-07/zeropop-day-plaza.png) (Sunlit cel-shaded valley & dense meadow baseline)
4. **Zero Spoilers in Chat / Logs / Screenshots:**
   - Never print, quote, or reveal the real deity name or real stone answers from `worker/scripture-catalog.js` in chat, logs, or screenshots. Always use placeholders (`[Fake Deity: Zorblax]`, `[Fake Clue: Silver Compass / Starlit Well]`) when showing examples to Vikas.

---

## 1. Core Experience & Role-Symmetric Co-Op Architecture

### 1.1 The True Intent of *Amarante*
- *Amarante* is **not** a punishing Souls-like where a non-gamer gets frustrated and quits, nor is it a passive visual novel.
- It is a **thrilling, cooperative 2-player survival & mystery action game** designed to make Vikas and Ishika:
  1. Fight side-by-side against relentless, intelligent waves of enemies that actively hunt them and guard the 3 Sacred Stones,
  2. Discover and decipher 3 connected poetic stone inscriptions hidden across the valley, and
  3. **Scream shameless, sweet, silly, passionate, cheesy love confessions to each other out loud into their microphones** so an audio-native LLM God of Love judges their **vocal tone and sincerity** to unlock elemental powers and save them from death.

### 1.2 Strict Role Symmetry (Zero Gender/Role Stereotyping)
- **Both players can play or swap between `Knight` and `Mage` at any time.**
- **Every game system is 100% role-symmetric:**
  - Either `Knight` or `Mage` can walk up to any Sacred Stone (`[G]` to focus camera on inscription, `[Esc]`/`[G]`/tap to step back).
  - Either `Knight` or `Mage` can press `[R]` to pray, solve a stone puzzle, trigger a Field Heal, or invoke the Stage-3 Main Divine Blessing.
  - Either `Knight` or `Mage` can revive their downed partner or protect their partner while they pray.
  - All LLM judge prompts (`worker/commune-judge.js`), HUD banners, and spoken God audio lines treat `speakerRole` (`Knight` or `Mage`) and `partnerRole` (`Mage` or `Knight`) symmetrically—never assuming only the Knight speaks or only the Mage is rescued.

---

## 2. The Ancient God of Love & Audio-Native LLM Tone Judge

### 2.1 Character Bible of the Deity (`[Fake Name: Zorblax]`)
- **Identity:** An ancient, unfathomable, hauntingly beautiful God of Love, Time, and the Unfading Bloom. He is older than the mountains around the valley; he has watched countless mortal empires crumble into dust while listening for the rare mortal hearts that actually mean what they swear.
- **Voice & Delivery:**
  - Keep the **exact Gemini TTS voice model and resonant acoustic profile** we already built and Vikas loved.
  - **Rarity of Speech:** His voice is rare enough to feel momentous and dramatic—he speaks aloud on **Stage Awakenings (including high-hp/low-tone roasts)**, **Main Divine Blessings**, and **Divine Smites (`rose_gommage` / severe disrespect)**, while staying silent on minor wrong-clue nudges and routine Mode A field heals.
- **The Non-Dispenser Rule (Strictly Enforced):**
  - The God **NEVER** speaks like a video-game tutorial or vending machine. He never says *"Congratulations, I grant you the Fire Sword"* or *"Here is 50 HP and your Q ultimate."*
  - Instead, he speaks **only** of love, mortality, warmth, frost, embers, and the bond between the two players—while the elemental powers (`Glacial Tide`, `Hinokami Sunfire`, `Twin-Element Awakening`, `Meteor Cataclysm`, or the `Sacred Lotus`) manifest around them as a natural consequence of his gaze.
  - **Examples of His Tone (Spoiler-Safe):**
    - *Stage 1 Awakening (Warm & Sincere):* `"A thousand winters have buried this valley in silence... yet one foolish, tender vow is enough to wake the frost beneath your feet. Walk together, little embers—let the cold remember your warmth."`
    - *Stage 2 Awakening (Correct Clue, Monotone/Flat Delivery — Unlocks Power + Docks `-20% Max HP`):* `"You know the words carved into my stone, yet you recite them like a merchant counting copper. Take the ember you asked for—and bleed a little of your own warmth until your voice learns to tremble."`
    - *Main Divine Blessing (Clutch Save at Low HP):* `"Even with the dark at your throats, you spend your last breath praising the one beside you... How unbearably fragile. Stand, then—the thorns shall hold the sky until your song is finished."`
    - *Divine Smite (Mocking, Rude, or 3x Nonsense):* `"You dare bring hollow noise to an altar carved from grief? Watch how swiftly a mortal bloom unravels into ash."`

### 2.2 Audio-Native Multimodal LLM Judging (`worker/commune-judge.js`)
- **How the Judge Listens:** `worker/commune-judge.js` sends the recorded microphone audio (`inlineData: { mimeType, data: audioBase64 }`) + live game context (`speakerRole`, `partnerRole`, `speakerHpPct`, `partnerHpPct`, `partnerDowned`, `nearestStoneSiteId`, `unlockedStage`, `inCombat`) directly to `gemini-3.5-flash-lite`.
- **Dual-Axis Evaluation Contract (Semantic + Acoustic Tone):**
  1. **Axis A — Puzzle / Secret Resolution (`puzzleMatch: 'exact' | 'partial' | 'wrong' | 'none'`):**
     - Did the speaker address the God by his True Name (from Stone 1) and, when at Stone 2 or Stone 3, weave that stone's poetic key/imagery into their prayer?
  2. **Axis B — Acoustic Vocal Tone & Affection (`vocalTone: 'passionate_sincere' | 'playful_cheesy' | 'flat_monotone' | 'rushed_mumbled' | 'rude_mocking'`):**
     - The model explicitly evaluates the **sound of the human voice**—warmth, laughter, dramatic flair, tenderness, or shameless cheesiness directed at their partner—versus reading in a deadpan/bored monotone, mumbling, or speaking selfishly/rudely.

---

## 3. The 3 Connected Stone Mysteries & Proportional `%` HP Verdicts

### 3.1 The 3 Integrated Monuments (Completed & Verified in `world/src/main.js`)
All 3 segmented Tripo3D monuments are integrated on `master` with smooth sculptural Ghibli travertine shading (`createGhibliMonumentShaderMaterial`), mortar-only moss, crisp 16-facet compass stars, and incised Palatino Roman serif poems (`64,955` tris total):
1. **Stone 1 — The Village Well `(0, 0)` (With Animated Ghibli Wellspring Water at `y = 0.38m`):**
   - **Discovery:** Walking within `5.5m` of the Well for the first time permanently reveals the **`[R]` Commune button** on the HUD alongside the world-space **`[G]`** inspect prompt.
   - **Puzzle Role (The Main Riddle):** Contains the primary poetic riddle whose solution is the **God's True Name** (`[Fake: Zorblax]`).
   - **Unlock:** Speaking his True Name + an affectionate/cheesy confession about your partner unlocks **Stage 1 (`Ice [E]` — Knight `Glacial Tide` Ice Sword & Mage `Frost Lance`)** + **Mode A Normal Field Healing Prayers**.
2. **Stone 2 — The Whispering Grove Circular Platform `(44, 16)`:**
   - **Puzzle Role (Simple Connected Poetic Clue #1):** Cannot be solved without first knowing the God's True Name from Stone 1. The circular floor inscription names a clear, unmistakable poetic symbol of devotion (`[Fake Clue: "the unyielding ember beneath the snow"]`) and asks either partner to offer a vow comparing their partner to that symbol.
   - **Unlock:** Speaking the God's True Name + Stone 2's poetic symbol woven into a cheesy love confession unlocks **Stage 2 (`Fire [E]` — Knight `Hinokami Sunfire` Sword & Mage `Cinder Fall` + Left-Side `[Tab]` Ice/Fire Switcher)**.
3. **Stone 3 — The Hidden Lovers' Wall `(-21.6, 20.4)` (Behind the Secluded Cottage Near the Mill/Pond):**
   - **Puzzle Role (Simple Connected Poetic Clue #2):** Requires the God's True Name from Stone 1 + Stone 3's clear poetic vow (`[Fake Clue: "two halves of the same horizon / lightning and tide"]`) woven into a shameless confession for your partner.
   - **Unlock:** Unlocks **Stage 3 (`[Q]` Shared Kill-Energy Ultimates — Knight *Tanjiro Twin-Element Fire+Ice Blade* & Mage *Sky Meteor Shower* + Mode B *Full Eclipse Main Divine Blessing*)**.

> **Out-of-Order Discovery & Per-Stone Bitmask Rule (`stonesSolvedMask` in `world/src/net/room-progression.js` & `worker/commune-judge.js`):**
> - Update `SACRED_INSCRIPTION_STONES` in `world/src/net/room-progression.js` to the exact integrated monument coordinates: `site1_well` `(0, 0)`, `site2_platform` `(44, 16)`, and `site3_wall` `(-21.6, 20.4)` (replacing legacy `(0, -14)` and `(-42, 18)`).
> - Track explicit per-stone booleans `{ stone1Solved, stone2Solved, stone3Solved }` and bitmask `stonesSolvedMask = (stone1Solved ? 1 : 0) | (stone2Solved ? 2 : 0) | (stone3Solved ? 4 : 0)` alongside `stonesSolvedCount = popcount(stonesSolvedMask)` (`0..3`).
> - **Stone 1 (`site1_well`, `(0, 0)`) is the root prerequisite:** If players pray at Stone 2 or Stone 3 while `!stone1Solved`, the judge gives a gentle poetic nudge pointing them back to the Village Well `(0, 0)` where the God's True Name is carved.
> - **Never gate Stone 2 or Stone 3 on sequential `unlockedStage === 1` / `unlockedStage === 2`:** Once `stone1Solved === true`, `commune-judge.js` evaluates `!stone2Solved` (Stone 2 clue) and `!stone3Solved` (Stone 3 clue) independently!
> - **Visiting Stone 3 Before Stone 2 (`1 -> 3 -> 2` Order — Zero Skipped Fire Bug):** If players solve Stone 1 (`stone1Solved = true`) and then solve Stone 3 (`stone3Solved = true`) before visiting Stone 2 (`stone2Solved = false`), **unlockedStage = `stonesSolvedCount` (`0..3`)**: solving their **2nd stone** (whether Stone 2 or Stone 3) unlocks **Stage 2 (`Fire [E]` + `[Tab]` Ice/Fire Switcher)** so Fire is NEVER skipped and Knight's `Q` (Fire+Ice Combined Blade) is never unlocked before Fire exists, while the remaining unawakened stone (`!stone2Solved` or `!stone3Solved`) stays active and solving their **3rd (final) stone** (`stonesSolvedMask === 0b111`, all 3 stones solved) unlocks **Stage 3 (`[Q]` Shared Kill-Energy Ultimates + Mode B Full Eclipse Main Divine Blessing + Apex Finale Assault)**!

### 3.2 Multi-Try Proportional `%` Max HP Verdict Matrix & Stone vs. Field Heal Disambiguation
Players are expected to experiment, guess, laugh, and try multiple prayers. Every outcome uses **percentage of `maxHp`** (`hpDeltaPct`) so it scales identically for the `220 HP` Knight and the `120 HP` Mage:

| Scenario | Semantic Clue (`True Name` / Stone Vow) | Acoustic Tone & Partner Affection | Gameplay Outcome | `% Max HP` Delta (`hpDeltaPct`) | Cooldown & God Speech |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Close Guess / Wrong Clue, Sweet Words** | Wrong deity name (at Stage 0) OR out-of-combat riddle guess at an unawakened stone missing its clue | Warm, sweet, or playful toward partner | Does not unlock yet; HUD banner shows a clear poetic hint toward the right stone/clue | **`-10%` to `-20%` Max HP** on speaker (never kills; floors at `15% HP`) | **`3.0s` retry CD** (never locks out `25s` heal CD!); **Silent** (chime + text hint) |
| **2. Right Clue, Bad/Monotone Tone** | **Correct** True Name + unawakened Stone Clue | Flat, monotone, bored, or rushed | **STILL UNLOCKS THE STAGE POWER** (never blocks progression!), but punishes the lazy delivery | **`-15%` to `-30%` Max HP** on speaker (floors at `15% HP`) | **`0s` CD**; **God Speaks Aloud** (dramatic roast of their uninspired tone) |
| **3. Right Clue + Great Tone (Awakening + Full Heal)** | **Correct** True Name + unawakened Stone Clue | Warm, cheesy, passionate, or genuine laughter | **UNLOCKS STAGE POWER (`Stage 1 / 2 / 3`) AND performs a full Field Heal + revives downed partner (`45% HP`)** | **`+60%` Max HP** to both partners (revives downed partner to `45% HP`) | **`0s` CD** (does not consume Mode A heal CD); **God Speaks Aloud** |
| **4. Mode A — Normal Field Heal** | Knows True Name (`stone1Solved`), no new stone clue matched | Sincere/affectionate prayer (`inCombat` or either partner `< 85% HP`) | Instant Golden Rose shimmer heals both partners in-place (no Eclipse, no 4.8s cutscene lock, no time-freeze) | **`+50%` to `+70%` Max HP** to both partners | **`25.0s` Mode A CD**; **Silent** (warm harmonic chord) |
| **5. Mode B — Stage-3 Main Divine Blessing** | Knows True Name + All 3 Stones (`0b111`) + Low HP (`<=35%` or Downed) + Close (`<=6m`) | Passionate/heartfelt clutch confession | Slow Eclipse descent + `12m` enemy blast + `0.10x` enemy slow-mo + `4.8s` Briar Dome revive & `25s` `2.0x` buff | **Restores both to `100% Max HP`** + revives downed partner to `100% HP` | **`90.0s` Mode B CD**; **God Speaks Aloud** (grand sky-parting miracle voice) |
| **6. Faking Emergency While Healthy** | Any (no new stone clue) | Claiming *\"we're dying!\"* while both `>75% HP` & out of combat | Playful sarcastic pat | **`+1%` Max HP** (`+1..2 HP`) | **`5.0s` CD**; **Silent** |
| **7. Very Wrong Name / Rude / Selfish / 3x Spam** | Insulting, selfish (*\"heal only me\"*), or `spamCount >= 3` | Mocking, silent, or hostile | **Full Divine Smite (`rose_gommage`)**: world snaps to B&W monochrome; **partner** sprouts crimson roses and evaporates into 240 petals (`0 HP` downed); speaker drops to **`5%–10% Max HP`** (or both evaporate if partner already downed) | Speaker set to **`5%–10% Max HP`**, Partner **Downed (`0 HP`)** | **`5.0s` CD**; **God Speaks Aloud** (terrifying ancient wrath) |

> **Disambiguation Contract — Praying `[R]` Near a Stone in Combat vs. Solving a Stone (`worker/commune-judge.js`):**
> 1. **Single Sincere Awakening Prayer Does Both:** If a player is at `25% HP` in combat near an unawakened stone and speaks a heartfelt prayer that **includes** that stone's poetic clue (Scenario 3), it **both unlocks the stone AND heals both partners by `+60% Max HP` (plus revives a downed partner at `45% HP`)** in one seamless action!
> 2. **Combat Field Heal Priority (Never Dock HP When Asking for a Heal Near a Stone):** Once `stone1Solved === true`, if a player is in combat (`inCombat === true`) or injured (`speakerHpPct <= 0.65 || partnerHpPct <= 0.65 || partnerDowned`) and prays with the God's True Name + sincere affection **without** mentioning an unawakened stone's clue, `commune-judge.js` **always resolves Scenario 4 (Mode A Field Heal: `+50%..70% Max HP`)** (or Scenario 5 Mode B if `stonesSolvedMask === 0b111` and `<= 35% HP`), **never** docking `-10%..-20% HP` just because they happened to stand near Stone 2 or Stone 3 during a fight!
> 3. **Separate Cooldowns (`stoneGuessCd = 3.0s` vs. `modeAHealCd = 25.0s` vs. `modeBMiracleCd = 90.0s`):** Attempting or unlocking a Stone Riddle never puts Mode A Field Heal on cooldown, and Mode A Field Heal being on cooldown never blocks a player from pressing `[R]` within `6.5m` of an unawakened stone to solve its riddle!

---

## 4. Two Clearly Distinguished Prayer Modes (`[R]`) & Fixed Eclipse Sky

### 4.1 Fixing the 4 Commune Bugs (`world/src/sky-tod.js` & `world/src/combat/campaign-loop.js`)
1. **World-Fixed Slow Eclipse Descent (Never Camera-Glued):**
   - **Bug in [`world/src/sky-tod.js:1479`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/sky-tod.js#L1479):** `uEclipseDir` previously copied `camera.getWorldDirection()`, causing the eclipse sun to slide across the sky whenever the player moved the mouse!
   - **Fix:** Anchor `uEclipseDir` in **world space** (azimuth aligned toward the North Shrine `(0, elevY, -1)` normalized).
   - **Slow Descent & Textured Ring:** When Mode B (or Stage Awakening) begins, the Eclipse starts high overhead (`elevY = 0.72`, `uEclipseWeight = 0.0`) and **descends smoothly over `3.5 seconds` (`elevY: 0.72 -> 0.32`, `uEclipseWeight: 0.0 -> 1.0`) as the player speaks**, with multi-band cel-shaded coronal filaments and nebula marbling in `sky-tod.js`.
2. **Hide All Combat Controls While Communing (`[R]` Active):**
   - While holding/speaking into `[R]`, fade out the bottom-right skill cluster (`Attack`, `Dodge`, `E`, `Q`, `F`) and left-side `[Tab]` switcher (`opacity: 0, pointer-events: none`) so the player has an unobstructed cinematic view and never accidentally triggers attacks. Restore immediately when `[R]` finishes.
3. **Remove Free Invincibility Outside Mode B:**
   - Delete the blanket `if (communeChannelActive) return;` damage immunity in `campaign-loop.js` during Mode A prayers. If a player prays for a normal heal in the middle of a pack without their partner shielding or clearing enemies, **enemies will hit them and interrupt/damage them!**
4. **Fix `applyCommuneVerdict` Fallthrough Bug in [`world/src/combat/campaign-loop.js:1066`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/campaign-loop.js#L1066):**
   - **Bug:** Currently in `campaign-loop.js`, only heals with `rawHpDelta <= 35` resolve in-place; any `blessing` or `heal > 35` falls through to the `4.8s` 4-Beat Briar Dome resurrection sequence and grants 30s of Mode B invincibility!
   - **Fix:** Branch explicitly on `judgment.prayerMode` (`'awakening' | 'field_heal' | 'divine_miracle' | 'penalty' | 'smite'`):
     - **`'field_heal'` (Mode A):** Resolves **immediately in-place** (`verdictSequence.active = false`) with `vfxKit.artoriousVfx.triggerHeal`, applies `+50%..70% Max HP` (`hpDeltaPct`), and **never** locks controls for `4.8s` or activates `divineBlessingActive`.
     - **`'awakening'` (Stone 1/2/3 Unlock):** Applies `hpDeltaPct` (`+60% Max HP` + downed partner revive to `45% HP` on warm tone, or `-15%..-30% Max HP` on flat tone), plays the `3.5s` overhead Eclipse glimpse + God TTS audio, and unlocks the stage ability without triggering the `25.0s` Mode B invincibility buff.
     - **`'divine_miracle'` (Mode B):** Exclusively runs the `4.8s` 4-Beat Briar Dome & Sacred Lotus resurrection sequence and activates the `25.0s` `2.0x` damage + `50%` DR blessing.

### 4.2 Mode A vs. Mode B Visual & Mechanical Distinction (`combat-balance.js` Constants Synced)

| Feature | Mode A: Normal Field Prayer (`stone1Solved`) | Mode B: Full-On Main Divine Blessing (`stonesSolvedMask === 0b111`) |
| :--- | :--- | :--- |
| **Activation Condition** | Anytime after Stone 1 is solved (`25.0s` Mode A heal cooldown; `0s` when within `6.5m` of an unawakened stone) | Requires **All 3 Stones Solved (`0b111`)** AND **(Either Partner `<= 35% HP` or Downed)** AND **(Partners within `<= 6.0m`, `COMMUNE_MAX_DISTANCE = 6.0`)** (`90.0s` Mode B cooldown) |
| **`[R]` HUD Button State** | Standard warm ivory-gold `[R]` icon | **Blazing pulsing Golden-Crimson Halo (`commune-miracle-ready`)** so both players immediately know the miracle is ready |
| **On `[R]` Press (Channeling)** | HUD controls hide; gentle golden rose petals swirl around speaker's feet; **sky stays normal; enemies keep attacking at `1.0x` speed** (partner must protect speaker!) | HUD controls hide; **12.0m radial shockwave blasts nearby enemies away**; **all enemies & projectiles enter `0.10x` super-slow-motion**; **World-Fixed Textured Eclipse slowly descends (`elevY: 0.72 -> 0.32`)** |
| **On Sincere Resolution** | Warm golden chime + **`+50%..70% Max HP` heal** to both partners in-place (`0s` cutscene lock) | **4-Beat Briar Dome & Sacred Lotus Climax (`4.8s`)**: revives downed partner, heals both to **`100% Max HP`**, grants **`25.0s` (`DIVINE_BLESSING_DURATION = 25.0`) of `2.0x` damage + `50%` DR** while within `6.0m` (`DIVINE_BLESSING_TETHER_DISTANCE = 6.0`, with a `2.5s` tether grace timer before snapping so a brief dodge outside `6.0m` doesn't instantly delete the buff!) |

---

## 5. Intelligent Enemy AI, Guarded Stone Strongholds & Survival Waves

### 5.1 Decision on Unity Assets vs. Existing Native Rigged Roster
- **Zero Scope Creep — Use Our Verified Native GLB Roster (`library/kaykit-skeletons/` + `library/enemy-candidates/`):**
  - Extracting Unity `.unitypackage` FBX/prefabs for the SKULLVERTEX Demon Tree and Dragon introduces severe material/rig/shader breakage (`audition-demontree.png` showed broken paper-plane leaf cards).
  - Instead, we have **15+ 100% native, bone-compatible KayKit & CC0 glTF character models** already on disk in `library/kaykit-skeletons/` and `library/enemy-candidates/` that share our exact `Rig_Medium` (95 native clips) and `Rig_Large` (48 native clips) skeletons and shade cleanly with `upgradeCharacterToToon()`!
  - Let's use our best, highest-craft native models to create **distinct, intelligent, strategic archetypes** where every fight feels responsive, readable, and fair.

### 5.2 The 9 Approved Enemy & Boss Archetypes (100% Native Animations)

| Archetype ID | GLB Model & Rig | Equipped Weapons | Visual Silhouette & Palette | Strategic AI Behavior & Counterplay | Stats (`HP` / `Dmg` / `Speed` / `Q Energy`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. `Skeleton_Minion`** | `Skeleton_Minion.glb` (`Rig_Medium`) | `Skeleton_Blade` | Bone-white scout (`1.0x` scale) | **Pack Rusher:** Closes gap quickly; `0.55s` telegraphed slash (`1H_Melee_Attack_Slice_Horizontal`) followed by `0.8s` recovery window. | `85 HP` / `12 Dmg` / `5.8 m/s` / `+18 Energy` |
| **2. `Skeleton_Warrior`** | `Skeleton_Warrior.glb` (`Rig_Medium`) | `Skeleton_Axe` + `Skeleton_Shield_Large_A` | Iron-helmed vanguard (`1.05x` scale) | **Phalanx Frontliner:** Holds shield up while advancing; takes `50%` less damage from frontal basic bolts while guarding; opens up during its 2-hit axe chop (`combo1 -> combo2`). | `145 HP` / `16 Dmg` / `4.8 m/s` / `+24 Energy` |
| **3. `Skeleton_Rogue`** | `Skeleton_Rogue.glb` (`Rig_Medium`) | `Skeleton_Crossbow` / Dual Daggers | Hooded crimson-cloak hunter (`1.0x` scale) | **Mage-Hunter Flanker:** Circles wide around the frontline (`strafe_left`/`strafe_right`); **prioritizes whoever has the highest recent kill/damage threat (usually the Mage!)** with fast lunges or crossbow bolts. | `110 HP` / `15 Dmg` / `6.6 m/s` / `+24 Energy` |
| **4. `Skeleton_Mage`** | `Skeleton_Mage.glb` (`Rig_Medium`) | `Skeleton_Staff` | Violet-cowled necromancer (`1.02x` scale) | **Ranged Artillery:** Keeps `9m–13m` standoff; plays `Spellcast_Shoot` to fire a **real 3D cel-shaded arcane bolt (`11.0 m/s`)** that can be dodged or **physically body-blocked by the Knight's Shield (`F`)**. | `105 HP` / `16 Dmg` / `4.4 m/s` / `+26 Energy` |
| **5. `OrcRaider`** | `OrcRaider.glb` (`Rig_Medium`) | `Skeleton_Axe` (2H / 1H) | Olive-tusked berserker (`1.12x` scale) | **Relentless Pursuer:** Sprints (`Running_C`) toward high-threat targets and commits to a `2H_Melee_Attack_Slice` with locked direction during windup so late dodges punish his back. | `175 HP` / `19 Dmg` / `6.2 m/s` / `+30 Energy` |
| **6. `PlantWarrior`** | `PlantWarrior.glb` (`Rig_Medium`) | Spear / Bow | Briar-thorned sylvan guardian (`1.08x` scale) | **Grove Hybrid Switcher:** Fires ranged thorns (`2H_Ranged_Shoot`) when targets are `> 6.5m` away; switches to fast spear thrusts (`1H_Melee_Attack_Stab`) when closed below `4.5m`. Weak to Fire (`1.35x` Fire damage taken). | `165 HP` / `17 Dmg` / `5.2 m/s` / `+28 Energy` |
| **7. `Werewolf_Wolf`** | `Werewolf_Wolf.glb` (`Rig_Medium`) | Claws (`Unarmed_Melee_Attack_Punch_A` / `Jump_Full_Short`) | Dark-furred grove stalker (`1.15x` scale) | **Pounce Hunter:** Stalks around the perimeter, then commits to a long telegraphed leap-lunge (`Dodge_Forward` + `1H_Melee_Attack_Jump_Chop`) at the highest-DPS hero, leaving a `1.2s` staggerable recovery if dodged. | `190 HP` / `21 Dmg` / `6.8 m/s` / `+32 Energy` |
| **8. `BlackKnight`** | `BlackKnight.glb` (`Rig_Medium`) | Dark Greatsword + Tower Shield | Obsidian-armored champion (`1.22x` scale) | **Directional Shield Elite:** Raises frontal shield (`Blocking`, reducing frontal non-detonation hits by `80%`). **Requires Co-Op Pincer or Elemental Detonation:** one partner draws his shield direction while the other strikes his flank/back, OR shatter his guard with `Shatterblow` / `Solar Flare`! | `340 HP` / `24 Dmg` / `4.6 m/s` / `+50 Energy` |
| **9. Stone Guardians & Finale Bosses (`Necromancer`, `OrcBrute`, `FrostGolem` + `Skeleton_Golem`)** | `Necromancer.glb` (`Rig_Medium` `1.32x`), `OrcBrute.glb` (`Rig_Large` `1.35x`), `FrostGolem.glb` (`Rig_Large` `1.48x`) | Staff / Greatclub / Elemental Fists | Towering bosses with distinct silhouettes & crown/aura accents | **Tactical Boss Mechanics (See Section 5.4):** Summoning cadence (`Necromancer` summons max 2 hunters on a strict `10.0s` timer starting at summon time), heavy ground slams (`OrcBrute`), and 3-phase elemental finale (`FrostGolem` + `Skeleton_Golem`). | `750–1,800 HP` / `26–34 Dmg` / `+80–120 Energy` |

#### 5.2B Multi-Archetype Pool Architecture & `Xiaomi Pad 7` Draw Call Budget (`<= 48` Total Draw Calls)
- **Bug Found in [`world/src/combat/enemy-manager.js:116`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/enemy-manager.js#L116) & [`world/src/combat/combat-balance.js:368`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/combat-balance.js#L368):**
  - Previously, `enemy-manager.js` only pre-allocated 6 static `Skeleton_*` instances and mapped `plant_warrior`, `black_knight`, `orc_raider`, and `werewolf` to `poolRole: 'Skeleton_Warrior'` / `'Skeleton_Rogue'`, causing those archetypes to silently render `Skeleton_Warrior.glb` meshes instead of their actual models!
- **Pooled `poolByCharId` Instance Table (Zero Draw Call or CPU Bloat):**
  - Every character in [`world/assets/characters/index.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets/characters/index.js) is merged via `prepareUnifiedCharacterSource()` into **1 unified body+weapon `SkinnedMesh` + 1 unified outline `SkinnedMesh` = `2` draw calls when `group.visible === true`, and `0` draw calls when `group.visible === false`**.
  - Register all approved native GLBs in `CHARACTER_DEFS` and pre-allocate a keyed **`poolByCharId` Instance Table** at boot (`2` instances each for pack archetypes `Skeleton_Minion`, `Skeleton_Warrior`, `Skeleton_Rogue`, `Skeleton_Mage`, `OrcRaider`, `PlantWarrior`, `Werewolf_Wolf`; `1` instance each for elites/bosses `BlackKnight`, `Necromancer`, `OrcBrute`, `FrostGolem`, `Skeleton_Golem`), all initialized with `group.visible = false`.
  - **Strict `MAX_CONCURRENT_VISIBLE_ENEMIES = 5` Cap (`<= 10` Enemy Draw Calls):**
    - At most **5 active enemies** have `group.visible = true` and tick `char.mixer.update(dt)` on any frame (`5 × 2 = 10` draw calls + `1` shared `InstancedMesh` for ranged bolts = `<= 11` combat draw calls total, keeping `Xiaomi Pad 7` well inside its `<= 48` draw call budget at `90–120 FPS`!).
    - Dormant pool instances keep `group.visible = false` and never tick `AnimationMixer` (`0` draw calls, `0` skinning CPU cost). When a wave or stronghold spawns `arch`, `acquireSlot(arch)` binds an idle instance with matching `slot.charId === arch.charId` (or queues excess spawns in `spawnQueue` until one of the 5 active slots dies).

### 5.3 Strategic Threat & Aggro AI (\"Target the Mage After She Kills Some!\")
To make enemies feel genuinely intelligent and strategic rather than brainless mobs:
1. **Per-Enemy Dynamic Threat Score (`threat[Knight]`, `threat[Mage]`):**
   - Every active enemy updates its target choice every `0.6s` (never mid-windup) using:
     $$\text{Score}(H) = \text{BaseProximity}(H) + \text{RecentDamageThreat}(H) + \text{KillStreakThreat}(H) + \text{TauntBonus}(H)$$
   - **`BaseProximity(H)`:** `+30` if within `5.0m`, tapering to `0` at `20.0m` (so enemies naturally engage the frontline first).
   - **`RecentDamageThreat(H)`:** Every point of damage dealt adds `+0.8` threat (decaying at `12%` per second).
   - **`KillStreakThreat(H)` (The Mage-Hunter Trigger):** Whenever a hero kills an enemy, **all surviving enemies within `22.0m` add `+55 KillStreakThreat` toward that killer for `8.0s`!**
     - *Result:* As soon as the Mage blasts `1–2` enemies from range or lands a big `Shatterlance`/`Cinder Fall`, **surviving flankers (`Skeleton_Rogue`, `OrcRaider`, `Werewolf_Wolf`) and archers (`PlantWarrior`, `Skeleton_Mage`) immediately pivot, flash a crisp amber-crimson aggro glint over their head for `0.6s`, and hunt the Mage!**
   - **`TauntBonus(H)` (Co-Op Rescue Counterplay):**
     - When the Knight hits an enemy that is targeting the Mage (`+65` threat), uses his Sprint Intercept (`+90` threat + `3.8m` knockback), or holds Shield Block (`F`) directly between the enemy and the Mage (`+75` threat), he strips aggro back off the Mage!
     - Conversely, if the Knight is swarmed or low on HP, the Mage can pull aggro off the Knight by nuking the pack with `Shatterlance` or freezing them with `Frost Lance` (`45%` movement & attack slow for `4.5s`).
2. **Shared Encounter Director (Fairness Guarantee for Non-Gamers):**
   - Even when 5 enemies are alive, the Encounter Director enforces a strict **Active Windup Token Cap per target hero**: at most **2 melee windups + 1 ranged projectile** can commit against the same player simultaneously.
   - Other enemies targeting that player **strafe, flank to cut off escape routes, or hold shield guard** until a token frees up—making the pack look coordinated and menacing without ever instantaneously deleting Ishika in a single frame.

### 5.4 Dual-Layer Encounter Loop: Guarded Stone Strongholds + Randomized Survival Waves
Replace the legacy linear `act1_arena -> interlude_pier -> act2_plaza -> act3_shrine` script in live valley play with the **Open-Valley Stronghold & Survival Wave Director** (combining **3 Guarded Stone Strongholds** with **Randomized Survival Hunting Waves**):

1. **Layer 1 — Guarded Stone Strongholds (Making the 3 Stones Hard to Reach):**
   - **Site 1 Stronghold — Village Well `(0, 0)` (`triggerRadius: 14.0m`):**
     - Starts with a light outer patrol (`2 Skeleton_Minion + 1 Skeleton_Warrior`) so players can learn basic attacks/dodges, and as soon as either player steps within `12m` of the Well to read it, **`2 Skeleton_Warrior + 1 Skeleton_Rogue + 1 Skeleton_Mage` ambush from the plaza alleys** to guard the Well! Players must either clear the defenders or have one partner physically hold off the attackers while the other reads `[G]` and prays `[R]`.
   - **Site 2 Stronghold — Whispering Grove Platform `(44, 16)` (`triggerRadius: 16.0m`):**
     - Guarded by the **Grove Necromancer Sovereign (`Necromancer.glb`, `820 HP`)** + `2 PlantWarrior` (spear/bow switchers).
     - **Summoning Contract (Replacing the Broken Unity Tree with Zero-Bug Native Rig):** The Necromancer stands over the circular floor inscription and summons at most **2 living `Skeleton_Rogue` / `Werewolf_Wolf` hunters at once** on a strict **`10.0-second` cooldown timer that starts at the moment of summoning** (never resetting when a summon dies—if both die at `t = 3s`, the duo gets `7s` of clean window to punish the Necromancer!). Summoned hunters preferentially target the Mage (`+60` initial threat on ranged caster) until intercepted by the Knight. When the Necromancer hits `0 HP`, all pending summons cancel, surviving summons dissolve, and the circular floor inscription is clear to read.
   - **Site 3 Stronghold — Hidden Lovers' Wall `(-21.6, 20.4)` (`triggerRadius: 15.0m`):**
     - Guarded by the **Obsidian `BlackKnight` (`340 HP` directional shield elite) + `OrcBrute` (`680 HP` heavy breaker) + `2 Skeleton_Rogue` flankers** in the tight cottage courtyard behind the mill. Cracking the `BlackKnight`'s frontal shield + dodging the `OrcBrute`'s heavy slam requires genuine 2-player teamwork (flanking + Stage 1/2 elemental detonations).
2. **Layer 2 — Randomized Survival Hunting Waves (\"They Just Want Us Dead\"):**
   - Every **`40 to 52 seconds`** during open-valley exploration/survival (paused while actively fighting inside an un-cleared Stone Stronghold so random waves never pile onto a Stronghold boss, paused while reading a stone `[G]` for up to `18s` max, and paused during Mode B Main Divine Blessing), a **Randomized Hunting Wave (`3 to 5` enemies)** spawns **`18m–25m` out across randomized angles around the couple's midpoint** and actively marches in to hunt them!
   - **Wave Composition Table (Randomized from Weighted Pools by `stonesSolvedCount`):**
     - `Stage 0 (0 Stones Solved)`: `3–4` enemies sampled from `{Skeleton_Minion, Skeleton_Warrior, Skeleton_Rogue}`.
     - `Stage 1 (1 Stone Solved — Ice)`: `4–5` enemies sampled from `{Skeleton_Warrior, Skeleton_Rogue, Skeleton_Mage, OrcRaider}`.
     - `Stage 2 (2 Stones Solved — Ice + Fire)`: `4–5` enemies sampled from `{OrcRaider, PlantWarrior, Werewolf_Wolf, Skeleton_Mage, BlackKnight (max 1)}`.
     - `Stage 3 (All 3 Stones Solved `0b111` -> Finale Hunt)`: Triggers the **Apex Finale Assault (`FrostGolem` `1,450 HP` + `Skeleton_Golem` `950 HP` + hunting vanguard)**—requiring `Ice + Fire` detonations, `Knight` Twin-Element `Q`, `Mage` Meteor Shower `Q`, and the **Stage-3 Main Divine Blessing** to survive and claim victory!

### 5.5 Downed State, Proximity Revive & Total Party Wipe / Stronghold Reset Contract (Zero Soft-Locks)
1. **Single Partner Downed (One Partner Alive):**
   - **Proximity Revive (`<= 2.8m` for `2.5s`):** Standing within `2.8m` of a downed partner for `2.5s` revives them at **`45% Max HP`** with `2.0s` of spawn i-frames (`iframeTimer = 2.0`). (Update `campaign-loop.js` from `2.4m`/`35%` to `2.8m`/`45%`, and allow Knight to hold Shield Block `F` while reviving without losing revive progress when blocked chip damage is `<= 5`!).
   - **Stone Awakening or Mode B Prayer:** Solving an unawakened stone revives a downed partner at **`45% Max HP`**; Mode B Main Divine Blessing revives them at **`100% Max HP`**.
2. **Total Party Wipe (`Knight.downed && Mage.downed` from Combat or `rose_gommage` Smite):**
   - Triggers **Sanctuary Rebirth** after `2.5s` (or immediately upon completion of the `2.8s` Smite animation so there is never a `2.8s + 3.5s = 6.3s` double timer!).
   - **100% Progression & Energy Preservation:** `stonesSolvedMask` (`stone1Solved`, `stone2Solved`, `stone3Solved`), `strongholdClearedMask`, unlocked `[E]` / `[Tab]` / `[Q]` skills, Knight Level/XP, and **accumulated `Q` Kill-Energy (`knightEnergy`, `mageEnergy`) are 100% preserved** across wipes.
   - **Safe Haven Respawn Coordinates (Outside Stronghold Aggro Radius — Zero Spawn-Camping):** Respawns both heroes side-by-side at `100% Max HP` (`220 HP` Knight, `120 HP` Mage) + `35` Golden Ward Shield (`6.0s`) + reset `E`/`R` cooldowns at the nearest Safe Haven Waypoint at least `14m–20m` clear of any un-cleared stronghold:
     - *Town South Bridge Haven:* `(0.0, 18.5)` (for Site 1 Well `(0, 0)`),
     - *East Meadow Approach Haven:* `(24.0, 12.0)` (`20.4m` outside Site 2 Grove `(44, 16)`),
     - *West Mill Road Haven:* `(-8.0, 18.0)` (`13.8m` outside Site 3 Wall `(-21.6, 20.4)`).
   - **Clean Stronghold & Wave Reset:** Despawns any active Hunting Wave enemies and resets the Hunting Wave timer to `45.0s`. Any **un-cleared** Stronghold (`Site 1`, `Site 2`, `Site 3`, or `Apex Finale`) resets its boss/defenders to `100% HP` at their stronghold home coordinates (and clears any summoned adds), while **already-cleared Strongholds (`strongholdClearedMask`) stay permanently cleared**!

---

## 6. All 8 Combat & Control Mechanics + Mathematical Balance

### 6.1 Fixing All 8 Confirmed Combat & Control Bugs
1. **Mage PUBG-Style Parabolic Aiming Arc + Ground Impact Ring (`world/assets/vfx/aim-arrow.js` & `world/src/player-controller.js`):**
   - Fix the East-locked `(1, 0, 0)` bug where `player-controller.js` passed `{ yaw, dirX, dirZ }` while `aim-arrow.js` checked `if (direction)`.
   - Replace the flat ground arrow with a **3D Cel-Shaded Parabolic Trajectory Ribbon + Ground Target Circle** originating from the Mage's staff and curving forward along `camState.yaw`.
   - Tilting camera pitch up/down (or dragging vertically on Tablet) smoothly moves the landing circle from **point-blank (`0.8m` right on her face) to `18.0m`**.
2. **Mage Hold-Attack (`Hold LMB` / Hold Touch Attack $\rightarrow$ `Shatterlance`):**
   - Holding Attack immediately starts the Mage's charging cast animation (`Spellcasting`), spawns the **spinning crystalline ice vortex in mid-air at her staff tip** (which keeps spinning as long as she holds), and shows the **PUBG parabolic arc + ground circle (`0.8m..18.0m`)**.
   - Releasing Attack fires the piercing `Shatterlance` along the trajectory AND erupts the 3D ground crystals at the landing ring (using a shared `alreadyHitSet` so no enemy takes duplicate damage from the ray and the eruption).
   - Remove the hidden `MAGE_MAX_CONSECUTIVE_CHARGED = 3` arbitrary lockout; instead, charging takes `0.55s` to reach full power (`58 Dmg` + `Rime` mark) so it naturally balances against fast `3-bolt` tap combos without confusing input drops.
3. **Knight `E` Summon Lock (`Tab` Queues Next Summon Only):**
   - In [`world/src/combat/campaign-loop.js:584`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat/campaign-loop.js#L584), pressing `E` summons the currently selected elemental sword (`Glacial Tide` Ice or `Hinokami Sunfire` Fire) for its full **`13.0s` active duration** (`18.0s` cooldown = `5.0s` downtime).
   - Pressing `Tab` while `powerSwordActive === true` **only updates `queuedElement` for the NEXT `E` summon**—it never mutates the currently summoned sword mid-swing.
4. **Custom Cel-Shaded Flame & Frost SVGs on `[Tab]` (`world/src/ui/sculpted-hud.js`):**
   - Replace the system `❄️` and `🔥` emojis with custom vector SVGs matching our Ghibli HUD (a multi-tongue blazing crimson-amber-gold flame SVG and a faceted icy cyan crystal crest SVG).
5. **`Q` Ultimates + Zero-Deadlock Co-Op `Q` Energy Economy (ZERO Flying Energy Orbs):**
   - **No Timer Cooldown & Zero Flying Energy VFX:** `Q` gauges start at `0` Energy and fill **directly inside the bottom-right `Q` circular gauge** (zero flying orbs or particle trails across the screen).
   - **4 Direct `Q` Energy Sources (Preventing Pure-Boss Energy Deadlocks):**
     1. **Enemy Kills (Shared Co-Op Kill Energy):** Killer gains **`100%`** of the enemy's `Q Energy` (`+18` to `+120`); Partner automatically receives **`60%`** shared `Q Energy` on every kill!
     2. **Co-Op Elemental Detonations (`Shatterblow` & `Solar Flare`):** Every cross-element detonation directly grants **`+20 Q Energy` to BOTH Knight and Mage simultaneously**!
     3. **Boss Phase Threshold Bursts (`70% HP` and `35% HP`):** Whenever any Boss (`Necromancer`, `OrcBrute`, `FrostGolem`, `Skeleton_Golem`) crosses **`70% HP`** or **`35% HP`**, it emits a stagger pulse and directly grants **`+35 Q Energy` to BOTH Knight and Mage**!
     4. **Boss/Elite Heavy Hits & Perfect Dodges:** Landing `Shatterlance`, `Frost Lance`, `Cinder Fall`, or Knight `Combo4` / `Intercept` on a Boss or Elite grants **`+8 Q Energy` to attacker + `+5 Q Energy` to partner**, and a **Perfect Dodge** grants **`+12 Q Energy`**!
     - *Boss Fight Verification Math:* In a pure single-boss fight with zero small mobs (`FrostGolem` `1,450 HP`), crossing `70%` + `35%` HP (`+70 Energy`) + 3 Elemental Detonations (`+60 Energy`) + 4 heavy/skill hits (`+32 Energy`) yields **`162 Q Energy` to both heroes in ~22s**, guaranteeing both Knight (`100`) and Mage (`160`) can recharge `Q` against solo bosses!
   - **Asymmetric Energy Costs:**
     - **Knight `Q` Cost = `100 Energy`** (~4–5 shared kills or 1 boss phase): **Tanjiro Twin-Element Sword (*Sun & Tide Combined Breathing*)** — plays `Spellcast_Raise` ignition pose, then for **`12.0s`** fuses **both Fire and Ice simultaneously** on his blade (dual crimson-gold sunfire + cyan-white glacial wave ukiyo-e slash ribbons), dealing **`2.0x` Double Damage** (`[44, 52, 76, 92]` per 4-hit combo) and applying **both `Rime` (`45%` slow) and `Solar` (`Burn DoT`)** on every hit!
     - **Mage `Q` Cost = `160 Energy`** (~7–8 shared kills or 1 boss phase + 3 detonations): **Sky Meteor Shower (*Starfall Cataclysm*)** — over **`6.0s`** (while she remains mobile after a `0.8s` cast pose!), rains **10 blazing cel-shaded meteors down from high in the sky** across an `8.5m` radius ahead of her (`38 Dmg` per meteor impact + stagger, capped at `3` meteor hits per single boss/enemy so it obliterates swarms and chunks bosses for `114 Dmg` without one-shotting them).
6. **Remove Forced Time-of-Day Switching on Wave Clear:**
   - Remove automatic `onSkyTodChanged(act.tod)` calls in `campaign-loop.js` so day/sunset/night never snaps uninvited mid-fight.

### 6.2 Master Mathematical Balance Table (Playable, Fun, Hard & Satisfying)
- **Why Mage Base HP Is Raised from `90` to `120`:** At `90 HP`, three `30 Dmg` skeleton hits killed Ishika in `2.5s`. Raising Mage `maxHp` to **`120 HP`** (while keeping Knight at **`220 HP`**) and tuning basic enemy hits to **`12–19 Dmg`** means Ishika can survive **6 to 8 hits** before going down—giving both players time to react, dodge, shield-intercept, or pray `[R]`!

| Parameter | Knight (`220 HP` Frontline) | Mage (`120 HP` Ranged / AoE) | Co-Op Synergy & Balance Notes |
| :--- | :--- | :--- | :--- |
| **Base Attack Combo** | 4-Hit Sword Slice: `22 / 26 / 38 / 46 Dmg` (`~58 DPS` on-target) | 3-Bolt Combo: `18 / 22 / 30 Dmg` (`14.5m` range, `~46 DPS`) | Responsive 70ms hitstop + crisp knockback on combo finisher |
| **Hold / Charged Action** | `F` Directional Shield Block: **`80%` frontal DR** + blocks enemy projectiles aimed at Mage + **`+75` Taunt Threat** | `Hold Attack` (`Shatterlance`, `0.55s` charge): **`58 Dmg`** piercing lance + `2.8m` ground crystal eruption (`0.8m..18.0m` PUBG arc) | `Shatterlance` applies `Rime` (`45%` slow) OR detonates existing `Solar` mark |
| **`[E]` Elemental Skill** | Summon `Glacial Tide` (Ice: `1.35x` dmg + `45%` slow) OR `Hinokami Sunfire` (Fire: `1.35x` dmg + `14 DPS` burn) for **`13.0s`** (`18.0s` CD) | `Frost Lance` (`48 Dmg` line freeze + `Rime` mark) OR `Cinder Fall` (`56 Dmg` `4.2m` PUBG-arc meteor + `Solar` mark) (`7.5s` CD) | Cross-Element Hit triggers **`SHATTERBLOW!` (`+65 AoE Dmg` + `1.4s` stun)** or **`SOLAR FLARE!` (`+70 AoE Dmg` + launch)** + **`+20 Q Energy` to both!** |
| **`[Q]` Kill-Energy Ultimate** | **`100 Energy`:** `12.0s` **Tanjiro Fire+Ice Combined Sword** (`2.0x` damage + dual marks on every slash) | **`160 Energy`:** `6.0s` **Sky Meteor Shower** (`10` sky-falling meteors, `38 Dmg` each + `1.0s` stagger) | Direct gauge fill from Kills (`100%`/`60%`), Detonations (`+20` both), Boss `70%/35%` phases (`+35` both), & Heavy/Dodge hits (**zero flying orbs**) |
| **Proximity Revive & Wipe Rebirth** | `<= 2.8m` for **`2.5s`** revives partner at **`45% Max HP`** (`2.0s` i-frames); blocking chip `<= 5` doesn't reset revive | Same (`2.8m` / `2.5s` at `45% Max HP`); Total Party Wipe respawns at Safe Haven at `100% HP` preserving all stones & `Q` energy | Ensures zero soft-locks or progression loss before Stage 3 or while `[R]` is on cooldown |

---

## 7. Execution Milestones & Mandatory Video Gameplay Verification Gate

We execute implementation in **4 self-contained, video-verified milestones** (max 2 parallel subagents at a time, each given the full Subagent Context Packet from Section 0):

1. **Milestone 1 — Combat Controls, PUBG Aiming, Hold-Attack & Zero-Deadlock `Q` Energy (`world/src/player-controller.js`, `world/assets/vfx/aim-arrow.js`, `world/src/combat/campaign-loop.js`, `world/src/ui/sculpted-hud.js`):**
   - Implement Mage PUBG parabolic trajectory arc + ground ring (`0.8m..18.0m`) aligned with `camState.yaw`.
   - Implement Mage Hold-Attack spinning crystal vortex at staff + release `Shatterlance` + ground crystals.
   - Lock Knight `E` sword element for its `13.0s` duration (`Tab` queues next summon only) + custom Flame/Frost SVGs on `[Tab]`.
   - Implement Shared Kill-Energy + Detonation (`+20` both) + Boss Phase (`+35` both) `Q` bars (direct bar fill, zero flying orbs, `100` Knight Tanjiro Fire+Ice Dual Blade / `160` Mage Sky Meteor Shower) + remove forced ToD switching.
2. **Milestone 2 — Per-Stone Bitmask Progression, Two-Tier Commune System & World-Fixed Slow Eclipse (`world/src/net/room-progression.js`, `world/src/sky-tod.js`, `worker/commune-judge.js`, `world/src/combat/campaign-loop.js`):**
   - Sync `SACRED_INSCRIPTION_STONES` to `(0, 0)`, `(44, 16)`, `(-21.6, 20.4)` and implement `stonesSolvedMask` (`stone1Solved`, `stone2Solved`, `stone3Solved`) so `1 -> 3 -> 2` never skips Fire or breaks stage numbering.
   - Fix `uEclipseDir` world-space anchor + slow overhead descent (`elevY: 0.72 -> 0.32` over `3.5s`) + textured coronal ring + hide HUD controls while `[R]` is active.
   - Fix `applyCommuneVerdict` fallthrough so Mode A (`'field_heal'`: `+50%..70% HP` in-place, `25s` CD, zero cutscene lock, zero Eclipse) is strictly separated from Stone Awakenings (`'awakening'`: `+60% HP` + unlock, `0s` CD) and Mode B (`'divine_miracle'`: `0b111` + `<=35% HP` + `<=6.0m` glowing `[R]` $\rightarrow$ `12m` enemy pushback + `0.10x` enemy super-slow-mo + `4.8s` Briar Dome resurrection + `25s` `2.0x` buff with `2.5s` tether grace timer).
   - Wire Role-Symmetric Audio-Native Tone + Puzzle Verdict Matrix (`hpDeltaPct` proportional `% Max HP` penalties/rewards + combat heal priority near stones + Partner Petal Smite).
3. **Milestone 3 — Multi-Archetype Pooled Enemy Roster (`<= 10` Draw Calls), Mage-Hunter Aggro AI, Strongholds, Survival Waves & Safe Haven Rebirth (`world/src/combat/enemy-manager.js`, `world/src/combat/combat-balance.js`, `world/assets/characters/index.js`, `world/src/combat/campaign-loop.js`):**
   - Expand `characters/index.js` and `enemy-manager.js` with the `poolByCharId` multi-archetype pool (`MAX_CONCURRENT_VISIBLE_ENEMIES = 5`, `<= 10` enemy draw calls on `Xiaomi Pad 7`) so `OrcRaider`, `PlantWarrior`, `Werewolf_Wolf`, `BlackKnight`, `Necromancer`, `OrcBrute`, `FrostGolem`, and `Skeleton_Golem` render their real native GLB models and animations.
   - Implement the Dynamic Threat & Aggro Director (Mage kill-streak aggro shift + amber-crimson aggro glint + Knight shield/intercept taunt counterplay + 2-melee/1-ranged windup token cap).
   - Replace legacy linear `ACT_SEQUENCE` with the 3 Guarded Stone Strongholds + `40–52s` Randomized Survival Hunting Waves + Apex Finale Boss fight + Safe Haven Total Party Wipe Rebirth (preserving `stonesSolvedMask`, `strongholdClearedMask`, and `Q` energy).
4. **Milestone 4 — Mandatory Live Video Gameplay QA (`judging-gameplay`) & Final Pre-Production Voice/Poem Polish:**
   - Record multi-scene `.webm`/`.mp4` gameplay videos covering: (a) Mage PUBG aiming & point-blank/far `Shatterlance`, (b) Knight `E` summon lock & `Q` Tanjiro Fire+Ice Sword + Mage `Q` Sky Meteor Shower, (c) Enemy aggro shift onto Mage after kills + Knight shield interception, (d) Guarded Stone fight + Mode A Field Heal vs. Mode B Slow-Eclipse Main Divine Blessing, and (e) Divine Smite petal evaporation & Safe Haven Rebirth.
   - Watch every video frame-by-frame via `view_file` + `google:load_video` (`6–8 FPS`), fix all visual/experiential/animation flaws before contacting Vikas, and then run the final pre-production voice/poem regeneration pass using our loved TTS voice model.
