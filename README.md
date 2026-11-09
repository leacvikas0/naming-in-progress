# Amarante — *The Unfading Bloom*

A romantic, role-symmetric 2-player co-op 3D action RPG built in Three.js (`r170`) and Cloudflare Workers (`CoopRoomDO`), designed for **Desktop PC** (`AMD RX 6700`, `144 FPS`) and **Tablet** (`Xiaomi Pad 7`, `120–144 FPS` with native touch HUD).

---

## Quick Start

```powershell
# 1. Start the local game & co-op server (http://127.0.0.1:4173/world/index.html)
npm start

# 2. Run the automated combat, AI, progression & co-op room test suites
npm test
```

Open **`http://127.0.0.1:4173/world/index.html`** in your browser.

---

## Controls & Role-Symmetric Co-Op Kit

| Input (PC / Touch) | **Knight** (*Bulwark & Breathing Blade*) | **Mage** (*Artillery & Starfall Weaver*) |
|---|---|---|
| **Move / Strafe** | `WASD` / Left Floating Joystick | `WASD` / Left Floating Joystick (`0.55×` strafe while aiming) |
| **Tap Attack (`LMB`)** | 4-Hit Sword Combo (`combo1..4`, `0ms` response) | 3-Hit Homing Arcane Bolt Volley (`0ms` response) |
| **Hold Attack (`Hold LMB`)** | **Frontal Shield Block** (`80%` DR + intercepts hits aimed at nearby Mage) | **Aimed Shatterlance** (`0.8m..18.0m` dashed 3D trajectory arc + over-the-shoulder camera) |
| **Element Toggle (`Tab`)** | Queues next sword element (`Ice` $\leftrightarrow$ `Fire`; active sword stays locked until next `E`) | Toggles `E` spell (`Frost Lance` $\leftrightarrow$ `Cinder Fall`) |
| **Skill (`E` / `Hold E`)** | **Power Sword** (`13.0s` active / `18.0s` CD): ignites blade with `Glacial Tide` (`25%` slow) or `Hinokami Sunfire` (Burn DoT) | **Hold `E` to Aim / Release `E` to Cast** (`8.5s` CD): `Frost Lance` (`2.5..14.5m` glacier line) or `Cinder Fall` (`3.0..16.0m` volcanic meteor) |
| **Ultimate (`Q`)** | **Twin-Element Eclipse Awakening** (`100` Q Energy, `12.0s`): `2.0×` damage + applies both Fire Burn and Ice Slow | **Sky Meteor Shower** (`160` Q Energy, `6.0s`): draws an `8.4m` golden circle + `1.68m` inner safe eye around the Mage and bombards the annulus (`68` front-fire meteors; Knight must evacuate outside the `8.4m` circle!) |
| **Dodge (`Shift` / `RMB`)** | Directional Dash (`0.30s` i-frames; Perfect Dodge slows attacker to `0.30×` & grants `+12` Q Energy) | Directional Dash (`0.30s` i-frames; Perfect Dodge slows attacker to `0.30×` & grants `+12` Q Energy) |
| **Jump (`Space`)** | Grounded Jump | Grounded Jump |
| **Inspect Stone (`G`)** | Close-up inspection of the 3 carved Sacred Stones (`Village Well`, `Whispering Grove`, `Secluded Wall`) | Close-up inspection of the 3 carved Sacred Stones |
| **Commune (`Hold R`)** | **Two-Tier Voice Prayer** (`<= 6.0m` from partner): Mode A Field Heal (`30%` HP) or Mode B Desperate Combat Miracle (`4.8s` Eclipse Resurrection + `25s` Proximity Blessing) | **Two-Tier Voice Prayer** (`<= 6.0m` from partner) |

---

## Architecture & Directory Layout

| Path | Description |
|---|---|
| [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md) | Game vision, hardware targets, voice-judged romantic mechanics, and 5-stage build order |
| [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md) | Blockout-first protocol, blind `/10` critic rules, and Mandatory Live Video Gameplay QA |
| [`GIT-DISCIPLINE.md`](file:///C:/Users/silen/projects/kilo-3d-kit/GIT-DISCIPLINE.md) | Clean workspace rules, worktree isolation, and atomic commit checkpoints |
| [`AGENTS.md`](file:///C:/Users/silen/projects/kilo-3d-kit/AGENTS.md) | Mandatory operating contract for all agents and subagents |
| [`world/index.html`](file:///C:/Users/silen/projects/kilo-3d-kit/world/index.html) & [`world/src/main.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/main.js) | Assembled 3D world, camera/input loop, post-processing, and HUD wiring |
| [`world/src/player-controller.js`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/player-controller.js) | Hero locomotion, melee/ranged combat dispatch, aiming camera, and Solo Wingman AI |
| [`world/src/combat/`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/combat) | `combat-balance.js`, `combat-action-aim.js`, `enemy-manager.js` (`8` concurrent enemies, `4` attack tokens), `campaign-loop.js`, `commune-client.js` |
| [`world/src/ui/`](file:///C:/Users/silen/projects/kilo-3d-kit/world/src/ui) | `sculpted-hud.js` (dark-frosted translucent HUD), `damage-numbers.js` (Option 2 consolidated pill badges), `app-flow.js`, `title-domain-lobby.js` |
| [`world/assets/`](file:///C:/Users/silen/projects/kilo-3d-kit/world/assets) | Opaque cel-shaded 3D modules: `terrain/`, `houses/`, `flowers/`, `characters/`, `vfx/` (`aim-arrow.js`, `frost-lance.js`, `shatterlance.js`, `cinder-fall.js`, `sword-vfx.js`, `artorious-verdict-vfx.js`) |
| [`worker/`](file:///C:/Users/silen/projects/kilo-3d-kit/worker) | Cloudflare Worker + `CoopRoomDO` WebSocket relay and multimodal Gemini voice judge |
| [`docs/superpowers/plans/`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans) | Master design & engineering specifications and verbatim prompt archives |
