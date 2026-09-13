# Dungeon of the Lost Bones — design

A 3D wave-brawler using only the local kilo-3d-kit library (KayKit rigged characters + KayKit Dungeon Remastered props). Runs as a static page served by the existing `npm run view` server at `/game/`.

## Pillars

1. **Feel first.** Hitstop, knockback, screen shake, damage numbers, dodge i-frames, coins that burst out. Every hit must be felt.
2. **Pick up and play.** Title screen → character pick → fighting within five seconds. No menus, no text walls.
3. **Run-based.** Waves escalate forever; you die, you retry. Upgrades every 3 waves make each run diverge.
4. **Local library only.** Every mesh is a KayKit/Kenney file already in `library/`.

## Loop

Pick hero → arena → waves of skeletons → coins drop → upgrade card pick every 3 waves → death → score screen (waves survived, kills, coins) → retry.

## Heroes (KayKit Adventurers, rigged, 75 clips each)

| Hero | HP | DMG | Speed | Style |
|---|---|---|---|---|
| Knight | 110 | 15 | 6.2 | 3-hit 1H combo |
| Barbarian | 135 | 24 | 5.7 | slow 2H swings |
| Rogue | 90 | 11 | 7.0 | fast dual wield |
| Mage | 85 | 18 | 6.0 | ranged arcane bolt w/ blast |

## Enemies (KayKit Skeletons, rigged)

Minion (fodder), Warrior (heavy, telegraphed), Rogue (dash burst), Mage (keeps distance, fires bolts). Elites on waves divisible by 4.

## Controls

WASD move · mouse aim · LMB attack · Space dodge roll (i-frames) · Shift sprint · R retry on death.

## Architecture

```
game/
  index.html            shell + HUD + title/death overlays
  src/
    main.js             bootstrap, RAF loop, event wiring        (glue, human)
    balance.js          all tuning numbers + wave/upgrade data   (contract, human)
    events.js           pub/sub bus                              (contract, human)
    world.js            arena build, colliders, lights, torches  (subagent)
    player.js           movement, dodge, attack, hp              (subagent)
    enemies.js          AI, spawning, projectiles                (subagent)
    fx.js               hitstop, shake, numbers, particles, coins(subagent)
    hud.js              DOM HUD, cards, overlays                 (subagent)
    audio.js            WebAudio synth SFX                       (subagent)
  style.css             HUD + overlay styling                    (glue, human)
```

Modules communicate through `events.js` and are constructed with explicit dependencies (`{ scene, world, fx, events, config }`). No module imports another game module except `main.js` (and hud importing balance for upgrade data).

## Event contract (frozen)

`world`: `torch-light` {position,color,intensity}
`player`: `player-attack` {origin,dir,range,arc,damage,heavy} · `player-hurt` {amount,hp} · `player-died` · `player-dodged` · `player-jumped` · `player-landed` · `player-moved` {position,speed}
`enemies`: `enemy-spawned` {position,type} · `enemy-hit` {position,amount,crit,color} · `enemy-died` {position,value,color} · `enemy-attack` {position}
`fx`: `hitstop` {duration} · `shake` {amount} · `coin-collected` {value}
`hud`: `wave-start` {wave,count} · `wave-clear` {wave} · `upgrade-offer` {cards} · `upgrade-picked` {id} · `run-ended` {stats} · `hero-chosen` {id} · `run-started`
`audio`: `sfx` {name,position?,pitch?}

## Verification

- `node game/tests/balance.test.mjs` — wave curve, upgrade rolls, rng determinism.
- Playwright: page loads with zero console errors, title → play → attack → wave 1 spawns → death → retry works.
- Headless sim: 90 seconds of synthetic input, no NaNs, no crash.
