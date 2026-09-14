# Module contract — frozen. Do not change signatures.

Every module is created by `main.js` and communicates via `events.js`. A module may import
`three` and `./events.js` / `./balance.js`. A module may NOT import another game module.
`main.js` is the only file that wires modules together.

## Units

1 unit = 1 meter. Player and skeletons are normalized to 1.9 units tall, feet at y = 0.
Arena is 48 × 48 centered on origin. Floor top surface is y = 0.

## Measured asset sizes (from gltf-transform)

| Asset | size (x, y, z) | note |
|---|---|---|
| floor_tile_large | 4, 0.15, 4 | top at y ≈ 0.05; min y = -0.1 |
| floor_dirt_large | 4, 0.21, 4 | min y = -0.1 |
| wall | 4, 4, 1 | origin centered, min y = 0 |
| wall_corner | 2.5, 4, 2.5 | L-shape, occupies x −2→0.5, z −0.5→2 |
| wall_doorway | 4, 4, 1 | |
| pillar | 1.5, 4, 1.5 | |
| torch_mounted | 0.55, 1.06, 0.62 | origin at wall mount; body extends −y and +z |
| torch_lit | — | floor torch, use with light |
| chest_gold | 1.7, 1.21, 1.91 | |
| coin | 0.36, 0.125, 0.36 | |
| banner_red | 1.5, 3.2, 0.31 | hangs from y ≈ 0.53 up to 3.73 |
| barrel_large | 1.8, 2.0, 1.8 | |
| crates_stacked | 2.09, 2.14, 2.25 | |
| rubble_large | 8.1, 3.5, 3.2 | big — use sparingly |
| barrier | 4, 1.1, 0.5 | low wall |
| shelf_small_candles | 1, 0.99, 0.5 | |
| stairs | 5, 5.1, 4 | |
| column | 0.7, 1.4, 0.7 | |
| floor_tile_big_spikes | 4, 2.1, 4 | spikes up — use as hazard |
| characters (KayKit) | ~2–3.4 tall | normalize to 1.9 at load |

Asset URLs live in `balance.js` → `ASSETS`. Never hardcode a `/library/...` path in a module.

## Character loading — MANDATORY

Every KayKit character GLB bundles **all equipment variants as separate rigid nodes**
(e.g. Knight ships 2 swords, 4 shields, helmet, cape). You MUST strip equipment:

- Skinned nodes (their mesh primitives have `JOINTS_0`) are the body — always keep.
- Rigid equipment nodes are hidden unless the character/enemy `keep[]` array lists them.
- Keep only the FIRST skin found; call `SkeletonUtils.clone()` per instance.
- Normalize each model: compute `Box3` of the **skinned meshes only**, scale so height
  ≈ 1.9, feet to y = 0. Do NOT use the whole-scene box — weapons inflate it (Knight's
  whole-scene box is 3.4 tall, body is ~2.3 before scale).
- Cache the loaded + cleaned GLTF per URL; clone per spawn. Never re-fetch per enemy.
- `frustumCulled = false` on skinned meshes (they vanish otherwise when the skeleton
  moves them outside the bind-pose bounds).

## Module APIs

### world.js — `createWorld({ scene, config, rng })`

```js
{
  group,                       // THREE.Group holding everything
  colliders,                   // [{ x, z, radius }] solid props
  hazards,                     // [{ x, z, radius, damage, tick }] spikes
  bounds,                      // { minX, maxX, minZ, maxZ } play area (walls excluded)
  coinTemplate,                // THREE.Group cloneable, coin scaled ~0.36
  torchCount,
  spawnPoint(rng, awayFrom, minDist),  // Vector3 on floor, ≥ minDist from awayFrom
  update(dt, elapsed),         // torch flicker, ember particles
  reset(),
}
```

Builds: 12×12 grid of 4-unit floor tiles (48×48, mixed tile variants + dirt patches, random
90° rotations), perimeter walls with corners and periodic pillars, mounted torches with
flickering point lights + emissive flames, banners, props (barrels, crates, rubble, shelves,
chests), 2–3 spike hazard tiles, a raised platform. Fog + dim ambient. Target ≤ 10 point
lights. All meshes from `ASSETS.dungeon`. Colliders for solid props only, radius ≈ half of
the prop's widest dimension.

### player.js — `createPlayer({ scene, world, events, config, hero, partner })`

```js
{
  group, position,             // Vector3 (feet)
  hp, maxHp, alive,            // the ACTIVE hero's values
  stats: { damageMult, moveSpeedMult, critChance, range, arc, coinMult,
           attackSpeedMult, lifesteal, dodgeCooldownMult, thorns,
           reactionMult, auraMult, momentumMult, swapCooldownMult,
           executeMult, reactionHeal },
  hero,                        // the starting CHARACTERS entry
  activeHero,                  // the currently-controlled CHARACTERS entry
  party,                       // [{ def, hp, maxHp }, ...] length 2
  partyAlive,                  // heroes with hp > 0
  momentum, superReady, swapCooldownFrac,
  update(dt, input),           // input = { move: {x,z}, aim: Vector3, attack: bool,
                               //           heavy: bool, dodge: bool, sprint: bool,
                               //           jump: bool, swap: bool, super: bool }
  swap(),                      // bool — swap to the partner if the cooldown is ready
  swapTo(idx, forced),         // bool — swap to party slot idx; forced skips guards (auto-swap)
  dispose(),                   // remove this player's listeners from the shared bus
  damage(amount, opts),        // emits player-hurt / player-died
  heal(n), addMaxHp(n), respawn(),
  dodgeCooldownFrac,           // 0..1 for HUD
  isDodging,
}
```

Movement: accelerate toward camera-relative input, face aim, 3-hit combo with lunge and
combo window, dodge roll with i-frames + cooldown, sprint, jump with gravity, hurt invuln
with blink. On attack, emit `player-attack` with
`{ origin, dir, range, arc, damage, heavy, crit, element, kind, stun, knockback,
reactionMult, auraMult, executeMult, reactionHeal }`
— the enemy module resolves hits. Effective stats = hero base × `stats` multipliers ×
upgrade `apply()` mutations.

**Combat 2.0 verbs.** Light attacks build momentum; the 3rd combo hit is a shove.
`heavy` is a committed attack from `hero.heavy` (dodge-cancellable only after impact).
`super` spends a full momentum bar on `hero.super`, one of four shapes keyed by
`super.id`: `nova` (instant 360), `whirlwind` (repeated 360 ticks), `flurry` (blink
strikes), `meteor` (delayed blast at the aim point). A hit negated during dodge i-frames
is a **perfect dodge**: it emits `perfect-dodge`, awards momentum, and opens a short
damage window. The inactive hero is off-field; when the active hero falls and the partner
lives, the party auto-swaps instead of dying — `player-died` only fires when both are down.

**Lifecycle.** The event bus is a module singleton, so a player's listeners outlive it.
`main.js` MUST call `player.dispose()` before replacing the player at the start of a run,
or the previous player keeps collecting kill/reaction momentum on every retry.

### enemies.js — `createEnemies({ scene, world, events, config, rng })`

```js
{
  group,
  aliveCount, totalCount,      // totalCount = spawned this wave
  killCount, reactionCount,    // reactions triggered this wave
  list,                        // live enemy objects (debug/tests)
  spawnWave(waveDef, player),  // telegraph then spawn from world.spawnPoint
  update(dt, player),          // AI, attacks, projectiles, hit resolution
  clearAll(),                  // remove all enemies + projectiles
  damageEnemy(enemy, amount, opts),  // used by hit resolution
}
```

AI: minion chases; warrior chases with heavy telegraph; rogue dashes when in range; mage
keeps distance and fires a bolt. Windup flash before every attack. Enemy attacks resolve
against the player: `player.damage(dmg)` unless `player.isDodging`. Enemy melee resolves in
`update` when the windup completes and the player is still in range.

**Combat 2.0 choreography.** At most `combat.maxAttackers` enemies may hold a windup at
once (attack tokens, released on resolve/death/stun). Enemies inside `combat.standoff` that
hold no token orbit the player tangentially instead of pressing in, so a large wave reads
as a ring rather than a pile. Spikes in `world.hazards` damage enemies on a per-enemy
`combat.spikeTick` cooldown (main.js ticks the player's own hazard damage). Elites enrage
below half hp (+speed, faster windup).

**Elements and reactions.** A hit carrying `element` applies an aura
(`{ element, t }`, `combat.auraTime`). A different element landing on an aura triggers the
matching `REACTIONS` entry, consumes the aura, and applies the incoming element as the new
one. Reaction payloads: `melt` (armor break), `overload` (AoE + knockback), `shatter`
(freeze, then a shatter multiplier on the next hit), `detonate` (fire nova + spreading
burn), `frozen` (hard freeze in a radius), `void` (pull + damage mark). Frozen enemies take
no actions. Damage-taken modifiers (armor break, mark, shatter, execute) are applied before
the hit lands.

### fx.js — `createFX({ scene, camera, events, rng })`

```js
{
  update(dt, player),
  timeScale,                   // main multiplies dt by this
  hitstop(sec), shake(amount),
  damageNumber(pos, amount, opts),   // { crit, color, heal }
  burst(pos, opts),            // { count, color, speed, size, life, gravity, up }
  slashArc(pos, dir, opts),    // { range, arc, color, life }
  ring(pos, opts),
  spawnCoins(pos, value),      // uses world.coinTemplate
  slowmo(scale, duration),
  reset(),
}
```

fx subscribes to `hitstop` / `shake` / `enemy-hit` / `enemy-died` / `coin-collected` events
itself. `hitstop` scales `timeScale` to 0.05 briefly; `slowmo` to 0.35. Damage numbers are
sprites from a shared canvas atlas, pooled, float up and fade. Coins are physical: pop out
with arc + gravity + bounce, then magnet to the player inside `config.combat.coinMagnet`
range; on pickup emit `coin-collected` with value.

### hud.js — `createHUD({ events, characters })`

```js
{
  update(state),   // { hp, maxHp, wave, enemies, coins, score, dodgeFrac, combo }
  showTitle(), hideTitle(), showLoading(text), hideLoading(),
  showUpgrades(cards), hideUpgrades(),
  showDeath(stats), hideDeath(),      // stats = { wave, kills, coins, score }
  showWaveBanner(n, sub), flashDamage(), showToast(text),
  addUpgradePip(card), reset(), setSelectedHero(id),
}
```

HUD emits: `hero-selected {id}`, `retry {}`, `upgrade-chosen {id}`.
HUD listens: `player-hurt` (flash), `player-died`, `wave-start`, `wave-clear`,
`coin-collected`, `upgrade-offer` is pushed via `showUpgrades` by main.
All DOM ids already exist in `game/index.html`. Style with classes from
`game/chrome.css` (pixel frames: `px-slab`, `px-ornate`, `px-btn`, `px-trough`,
`px-keycap`, `px-roster`, `px-well`, `px-divider`, `px-rule`, `px-icon`) and
`game/style.css` (layout + type).
Do not add new CSS files. Do not restyle `index.html`.

### Pixel chrome pipeline

The UI chrome is hand-authored pixel art compiled to PNG, applied through CSS
`border-image` 9-slices. Source of truth is `game/ui/`:

- `game/ui/lib/` — ASCII-grid art (frames, font, stat icons) + palette
- `game/ui/art/` — reviewed AI-assisted imports (class sigils), see its SOURCES.md
- `game/ui/gen/` — build output; **the only directory the game reads**
- `node game/ui/build-ui.mjs` — regenerate `gen/` (also `npm run ui`)

Two invariants that break the chrome silently if violated:

1. `border-image-slice` in `chrome.css` must equal the source PNG's border
   width, and `border-width` must equal the slice. `game/tests/ui.test.mjs`
   asserts the source dimensions.
2. Every element showing chrome needs `image-rendering: pixelated`.

When adding a frame, add it to `build-ui.mjs`, add it to the REQUIRED list in
`game/tests/ui.test.mjs`, then run `npm run ui && npm run test:ui`.

### title.js — `createTitle({ scene, camera, events, loader, characters })`

```js
{
  group,                       // THREE.Group holding the stage (hidden until show())
  build(),                     // async: loads + normalizes all hero GLBs, fills roster
  show(), hide(),
  update(dt),                  // sway, rise, idle flourishes, embers, camera drift
  selectHero(id, notify, emote), // shows that hero on the dais; emits hero-selected
  selectedId, visible,
}
```

Hero-select stage. The dungeon world is hidden during the title phase; `main.js`
reveals `world.group` on `start-run`. The selected hero rises onto a lit dais, idles
with the shared KayKit `Idle` clip, and flourishes with the clip named by its
`pose` in balance.js (falling back to `combo[0]`, then `Cheer`).

`emote` controls the flourish, and the two callers differ deliberately: switching
heroes (click a roster bar, arrow keys) passes `true` so the hero shows off, while
the initial auto-select at boot passes `false` so the game opens on a hero simply
standing there rather than mid-swing. The flourish also replays on its own after
`IDLE_FLOURISH` (8s) with no interaction.

Roster bars live in `#hero-list`; the detail plaque in `#hero-detail`. Each row and
the plaque show the hero's class sigil from `game/ui/gen/sigil-<id>.png`, and the
plaque's stat row uses `icon-hp/dmg/spd.png`. A hero's `id` must therefore match
its sigil filename.
`title.js` emits: `hero-selected {id}`, `start-run {}`, `sfx {name:"ui-click"}`.
`title.js` owns the `#start-btn` click; hud.js must not also emit `start-run`.

### audio.js — `createAudio({ events })`

```js
{
  unlock(),                  // resume AudioContext on first gesture
  update(dt, listenerPos),   // listener = player position
  play(name, opts),          // { position, pitch, volume }
  setMuted(bool), muted,
}
```

Subscribes to the `sfx` event. All sound is synthesized (oscillators + noise buffers) — no
audio files. Sound names: `swing`, `swing-heavy`, `hit`, `crit`, `kill`, `hurt`, `dodge`,
`jump`, `land`, `coin`, `wave`, `upgrade`, `death`, `enemy-windup`, `cast`, `explode`,
`ui-click`, `start`.

### Music (inside audio.js)

`audio.music` is a state-driven music director layered on the same AudioContext as
the SFX. It is not a second module: `main.js` calls it, and it never imports
another game module.

```js
audio.music.load(name)                  // fetch + decode, deferred until unlock()
audio.music.prefetch(names)             // background decode
audio.music.play(name, { fade, restart, from })
audio.music.stop({ fade })
audio.music.setFilter({ gain, lowpass, rate, fade })
audio.music.state                       // { loaded, pending, current, gain, lowpass, rate }
```

Tracks are `"title"` and `"combat"`. Signal path per track:
`source -> lowpass -> trackGain -> musicBus -> master`, so `setMuted` silences
music and SFX together.

Two invariants:

1. **Loop points come from the manifest, never `buffer.duration`.** Chrome decodes
   Vorbis through ffmpeg, which can pad the decoded tail (ffmpeg ticket 6367);
   looping to `buffer.duration` would play that padding at every wrap.
2. **Music failure is silent.** Any fetch, decode or WebAudio error leaves the
   game running with SFX only. Never surface a music error to the player.

### Music pipeline

Sources are one-shots, so `game/audio/build-music.mjs` bakes a crossfade loop
into each track (`body + crossfade(tail -> pre)`) and normalizes to
−16 LUFS / −1.5 dBTP, then encodes Vorbis.

- `game/audio/src/` — committed sources
- `game/audio/gen/` — build output; **the only directory the game reads**
- `node game/audio/build-music.mjs` — regenerate `gen/` (also `npm run music`)

Loop points are the `TRACKS` constants at the top of the build script. Re-run
`npm run music && npm run test:music` after retuning any of them.

## Event list (frozen)

| Event | Payload | Emitter |
|---|---|---|
| `sfx` | `{ name, position?, pitch?, volume? }` | any |
| `player-attack` | `{ origin, dir, range, arc, damage, heavy, crit, element, kind, stun, knockback, reactionMult, auraMult, executeMult, reactionHeal }` | player |
| `player-hurt` | `{ amount, hp }` | player |
| `player-died` | `{ }` | player |
| `player-dodged` | `{ }` | player |
| `player-jumped` | `{ }` | player |
| `player-landed` | `{ }` | player |
| `swap` | `{ from, to, element, color }` | player |
| `super-used` | `{ hero, position, color }` | player |
| `momentum` | `{ value, max, ready }` | player |
| `perfect-dodge` | `{ position }` | player |
| `aura-applied` | `{ position, element, color }` | enemies |
| `reaction` | `{ type, name, position, radius, damage, color }` | enemies |
| `reaction-heal` | `{ amount }` | enemies |
| `hazard-hit` | `{ target, position }` | enemies / main |
| `enemy-spawned` | `{ position, type }` | enemies |
| `enemy-hit` | `{ position, amount, crit, color }` | enemies |
| `enemy-died` | `{ position, value, color }` | enemies |
| `enemy-attack` | `{ position }` | enemies |
| `enemy-count` | `{ alive }` | enemies |
| `wave-start` | `{ wave, count, modifier, sub }` | main |
| `wave-clear` | `{ wave }` | main |
| `upgrade-offer` | `{ cards }` | main |
| `upgrade-chosen` | `{ id }` | hud |
| `run-started` | `{ hero, party }` | main |
| `run-ended` | `{ wave, kills, coins, score }` | main |
| `coin-collected` | `{ value }` | fx |
| `score-changed` | `{ score }` | main |
| `hero-selected` | `{ id }` | hud |
| `party-selected` | `{ heroes }` | title |
| `party-slot` | `{ index }` | hud |
| `start-run` | `{ }` | title |
| `retry` | `{ }` | hud |
| `hitstop` | `{ duration }` | any |
| `shake` | `{ amount }` | any |
