# *Amarante* — Independent Human UI/UX Critic & Fixer Report

**Date:** 2026-11-05  
**Worktree:** `C:\Users\silen\projects\kilo-3d-kit\.kilo\worktrees\behavior-ui`  
**Verified Output Directory:** `world/shots/amarante-verified/`  
**Playwright Runner:** `world/tools/audit-ui-screens.mjs` (`consoleErrors = 0`, `pageErrors = 0`)

---

## 1. Ten Verified Screenshots (`1920×1080` Desktop & `1600×1000` Xiaomi Pad 7 Tablet)

| Plate | Resolution & Profile | Flow Step / State | Verification Status |
|---|---|---|---|
| `01-title-pixel-to-clear.png` | `1920×1080` (`desktop`) | `FLOW_STEPS.TITLE` — *Amarante* (`The Unfading Bloom`) + see-through `1.5px` double-hairline CTA `Step into the Domain` over the Southern Flower Field vista (`backdrop-filter: none`, `36px -> 1px` mosaic canvas resolved). | **PASS** |
| `02-open-join-domain.png` | `1920×1080` (`desktop`) | `FLOW_STEPS.CREATE_JOIN` — Two `86%` transparent open-air hairline frames (`Open a Domain` with `"Rain on warm limestone"` + `Enter` vs. `Join a Domain` + `Join`). | **PASS** |
| `03-flower-lobby-3d-claim.png` | `1920×1080` (`desktop`) | `FLOW_STEPS.FLOWER_LOBBY` — 3D Knight & Mage in the wildflowers, Knight claimed with floating outer-shoulder hairline input (`Your name: Vikas`), partner tag (`Ishika · Mage`) floating above the 3D Mage's hat, and borderless bottom phrase (`Rain on warm limestone` + copy icon). | **PASS** |
| `04-hud-bare-desktop.png` | `1920×1080` (`desktop`) | `FLOW_STEPS.IN_GAME` bare start — Top-left borderless party rows (`Vikas`, `Ishika`), bottom-center HP bar (`220 / 220`), compact bottom-right Desktop keycap rings (`Attack`, `Dash`, `Jump`), zero `Lv. 1` badges, zero legacy `#top-bar` clutter. | **PASS** |
| `05-hud-bare-tablet-two-handed.png` | `1600×1000` (`tablet`) | `FLOW_STEPS.IN_GAME` bare start — Bottom-left floating movement thumbstick (`left: 44px, bottom: 44px, 132×132px`) + bottom-right `Attack` (`84px`), `Dash` (`54px`), `Jump` (`54px`) see-through double-hairline rings. | **PASS** |
| `06-stone-3s-gaze-commune.png` | `1920×1080` (`desktop`) | Approaching `stone_plaza` `(0, -14)` within `<= 4.5m` — Over-the-shoulder camera framing showing the borderless 3D calligraphy verse (`Stele of the Sovereign Vow`) + golden lotus gaze progress ring etched directly onto the 3D limestone face, and `Commune [R]` materialized in the HUD (zero `"✿ Read"` pill, zero 2D modal). | **PASS** |
| `07-hud-tablet-full-fan-arc-day.png` | `1600×1000` (`tablet`) | Sunlit Day (`data-env-polarity="day"`) with all powers unlocked — Left thumbstick + Right-hand 2-ring concentric fan arc (`Attack`, `Dash`, `Jump`, `[Tab]` with `"Tab to switch"`, `[E]` Ice, `[Q]`, `Commune [R]`, verified `>= 22.06px` minimum clear finger gap) + 3D floating *Genshin* damage numbers (`148`, `296 ✦`). | **PASS** |
| `08-hud-tablet-golden-hour-polarity.png` | `1600×1000` (`tablet`) | Golden Hour (`data-env-polarity="golden"`, champagne-apricot `#ffeed6` hairlines + warm amber `#fb923c` accent) with `[E]` toggled to `Fire` (`Hinokami Sunfire` / `Cinder Fall`) and fiery floating damage numbers (`184`, `Solar Flare 342 ✦`). | **PASS** |
| `09-hud-tablet-night-eclipse-polarity.png` | `1600×1000` (`tablet`) | Starlit Night / Crimson Eclipse (`data-env-polarity="eclipse"`, pale rose-silver `#ffe8ee` + Amaranth Crimson `#e11d48` hairlines) while `Commune [R]` is actively listening (`00:24` + crimson wave bars + 3D Crimson Rose Ring at feet beneath the Colossal Crimson Eclipse sky). | **PASS** |
| `10-pause-sky-atmosphere.png` | `1920×1080` (`desktop`) | Minimal transparent hairline Pause popover (`Sanctuary Pause`) showing `Morning`, `Golden Hour`, `Twilight` (verified staying on `Twilight` with `aria-pressed="true"` when clicked!), `Starlit Night`, `Auto`, and `Resume`. | **PASS** |

---

## 2. Visual & Behavioral Flaws Caught via `view_file` & Fixed

1. **Flower Field 3D Lobby (`03-flower-lobby-3d-claim.png`) — Overlapping Face Badges, Duplicate Partner Pill & Shoulder Callout Collision (`app-flow.js` & `main.js`):**
   - **Flaw Observed in Pass 1 PNG:** The hero role badge (`#af-claim-knight`) rendered at `chestY - 84px` directly across the 3D Knight's visor/eyes; the Mage showed two overlapping pills (`Ishika · Mage` and `Mage / Ishika · Mage`) stacked across her face; and the floating shoulder input (`#app-flow-name-bubble`) used `shoulderOffsetX = -136px`, overlapping the Knight's helmet and broadsword.
   - **Fix Applied:** Projected true 3D crown coordinates (`y + 2.45m` for Knight, `y + 2.75m` above the Mage's pointed wizard hat) in `updateFlowerLobbyHeroProjections()`, anchored `.af-hero-ring-badge` above the claimed hero's helmet, hid the redundant `.af-hero-ring-badge` on the partner-claimed hero when `#app-flow-partner-tag` (`Ishika · Mage`) is visible above the Mage's hat, and widened `shoulderOffsetX` to `±276px` so `#app-flow-name-bubble` floats cleanly in the wildflowers beside the Knight's outer shoulder.

2. **3D Sacred Stone Calligraphy Decal & Over-the-Shoulder Framing (`06-stone-3s-gaze-commune.png`, `main.js`):**
   - **Flaw Observed in Pass 1 PNG:** Linear WebGL alpha blending allowed the dark geometric placeholder bars (`waveLine` / `petalC` at `z = ±0.245m`) to bleed through the semi-transparent decal wash behind the poem lines, and the Knight's chibi helmet clipped the bottom-left edge of the stone.
   - **Fix Applied:** Mounted the decal plane at `z = ±0.254m` with an aspect-scaled elliptical limestone-matched core (`alpha = 1.0` up to `r = 0.84` covering both the top lotus and bottom bar, feathering smoothly to `alpha = 0.0` at `r = 1.0` with zero box borders) and chiseled dark-outlined typography (`46px` title, `36px` italic verse, `r = 76px` golden lotus gaze ring). Widened `shoulderPosOff` to `1.48 * gazeBlend` (`effDist = 3.25m`) and aimed the camera look-at toward the active Sacred Stone so the Knight stands cleanly on the left third and the stone face is 100% unobstructed in the center-right foreground.

3. **Element Toggle (`[E]` Fire) Revert & Mid-Fade `"Tab to switch"` Ghost (`08-hud-tablet-golden-hour-polarity.png`, `main.js` & `sculpted-hud.js`):**
   - **Flaw Observed in Pass 1 PNG:** Calling `sculptedHud.setElement('fire')` updated the HUD state, but the next `requestAnimationFrame` tick in `main.js` (`updateCombatHud`) read `coopSystem.heroStates.Knight.selectedElement` (`'ice'`) and overwrote `[E]` back to the blue Ice icon. In addition, `#sculpted-tab-caption.is-dismissed` used a `150ms` opacity transition that left a faint dark ghost string when captured shortly after toggling.
   - **Fix Applied:** Synchronized `sculptedHud.setElement` and `sculptedHud.setProgressionState` with `coopSystem.heroStates.{Knight,Mage}.selectedElement` in `main.js`, and applied `display: none; visibility: hidden;` on `#sculpted-tab-caption.is-dismissed`.

4. **Floating *Genshin* Damage Numbers Auto-Crit Override & Star Placement (`07` & `08`, `damage-numbers.js`):**
   - **Flaw Observed in Pass 1 PNG:** `spawnDamageNumber` had a hardcoded `numVal >= 85` check that forced `148` (`element: 'ice', isCrit: false`) into yellow crit styling with a leading `✦` star (`✦ 148`).
   - **Fix Applied:** Removed `numVal >= 85` so `isCrit: false` numbers render in their true elemental palette (`#a5f3fc` Glacial Ice Cyan for `148`, `#fdba74` Sunfire Coral-Amber for `184`), and placed the `✦` star after critical numbers (`296 ✦`, `Solar Flare 342 ✦`).

5. **Crimson Eclipse Sync in `Commune [R]` & Sticky `eclipse` Polarity in Pause Modal (`09` & `10`, `main.js` & `sculpted-hud.js`):**
   - **Flaw Observed in Pass 1 PNG:** `syncPrayerEclipseAndMonochrome()` in `main.js` did not check `sculptedHud.getState().commune.listening`, causing the background `animate()` loop to reset `sky.setEclipseState({ weight: 0 })` during Shot 09. Conversely, `syncEnvironmentPolarity()` in `sculpted-hud.js` checked `state.envPolarity === 'eclipse'` inside its own condition, keeping `data-env-polarity="eclipse"` stuck on pink borders when switching to `Twilight` in Shot 10. Also hid the legacy `sanctuarySteleMesh` black obelisk that was appearing in front of the Town Well.
   - **Fix Applied:** Added `hudCommune?.listening || hudCommune?.partnerListening` to `inPrayerChannel` in `main.js`, separated `state.envPolarityOverride` in `sculpted-hud.js` (clearing it when `setTimeOfDaySelection` or `setCommuneState({ listening: false })` runs), and forced `coopSystem.sanctuarySteleMesh.visible = false`.
