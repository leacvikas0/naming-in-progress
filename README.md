# kilo-3d-kit

Project folder for **Kilo Code**. Human-made CC0 3D assets, local search, and a small viewer.

Style bible: Kenney castle/furniture (static props) + KayKit Adventurers (already rigged, 75 clips).

## The game

**Naming In Progress** — an endless wave brawler built entirely from this library
(KayKit Dungeon Remastered + KayKit Adventurers/Skeletons, all rigged clips played as-is).

```powershell
cd C:\Users\silen\projects\kilo-3d-kit
npm run view
```

Then open http://localhost:4173/game/

- Pick Knight / Barbarian / Rogue / Mage, then survive escalating skeleton waves.
- WASD move · mouse aim · LMB attack · Space dodge (i-frames) · Shift sprint · R restart.
- Every 3rd wave offers a card upgrade (18 total, common/rare/epic).
- Coins burst from kills, magnet to you, and feed the score.

### How it's built

| File | Role |
|---|---|
| `game/index.html` | shell + HUD + overlays |
| `game/style.css` | torch-lit parchment/iron identity |
| `game/src/balance.js` | all tuning: heroes, enemies, waves, upgrades |
| `game/src/events.js` | pub/sub bus between modules |
| `game/src/world.js` | arena build, torches, colliders, spawns |
| `game/src/player.js` | movement, combos, dodge, mage blast, hp |
| `game/src/enemies.js` | skeleton AI, waves, projectiles |
| `game/src/fx.js` | hitstop, shake, damage numbers, particles, coins |
| `game/src/hud.js` | DOM HUD, hero select, upgrade cards, death screen |
| `game/src/audio.js` | synthesized WebAudio SFX (no audio files) |
| `game/src/main.js` | bootstrap, camera, input, run state |
| `game/src/CONTRACT.md` | frozen module interfaces + measured asset facts |

Assets are never re-rigged: KayKit characters ship with skeletons and clips; the code
strips bundled equipment variants per hero (each GLB ships every weapon) and plays the
clips. Kenney/KayKit props stay static.

Tests:

```powershell
npm test          # balance + controls suites
```

## Test it (viewer)

```powershell
npm run view
```

Then open http://localhost:4173

Pick a KayKit character to see idle/walk clips. Kenney props have no skeleton (that is correct).

## What was pulled

| Pack | License | Role |
|---|---|---|
| [Kenney Castle Kit](https://kenney.nl/assets/castle-kit) | CC0, human | world tiles |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | CC0, human | interior props |
| [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) | CC0, human, no gen AI | rigged characters |

Re-fetch:

```powershell
npm run setup
```

## Rigging stance

Do not auto-rig Kenney crates. KayKit ships a humanoid skeleton + clips. `scripts/inspect-rig.mjs` only reports bones/skins/animations. The viewer plays those clips.

## Agent

Open this folder in Kilo Code. It will pick up `AGENTS.md` and `.kilocode/rules/3d-assets.md`.
