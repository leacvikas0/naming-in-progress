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

### player.js — `createPlayer({ scene, world, events, config, hero })`

```js
{
  group, position,             // Vector3 (feet)
  hp, maxHp, alive,
  stats: { damageMult, moveSpeedMult, critChance, range, arc, coinMult,
           attackSpeedMult, lifesteal, dodgeCooldownMult, thorns },
  hero,                        // the CHARACTERS entry
  update(dt, input),           // input = { move: {x,z}, aim: Vector3, attack: bool,
                               //           dodge: bool, sprint: bool, jump: bool }
  damage(amount, opts),        // emits player-hurt / player-died
  heal(n), addMaxHp(n), respawn(),
  dodgeCooldownFrac,           // 0..1 for HUD
  isDodging,
}
```

Movement: accelerate toward camera-relative input, face aim, 3-hit combo with lunge and
combo window, dodge roll with i-frames + cooldown, sprint, jump with gravity, hurt invuln
with blink. On attack, emit `player-attack` with `{ origin, dir, range, arc, damage, heavy }`
— the enemy module resolves hits. Effective stats = hero base × `stats` multipliers ×
upgrade `apply()` mutations.

### enemies.js — `createEnemies({ scene, world, events, config, rng })`

```js
{
  group,
  aliveCount, totalCount,      // totalCount = spawned this wave
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

HUD emits: `hero-selected {id}`, `start-run {}`, `retry {}`, `upgrade-chosen {id}`.
HUD listens: `player-hurt` (flash), `player-died`, `wave-start`, `wave-clear`,
`coin-collected`, `upgrade-offer` is pushed via `showUpgrades` by main.
All DOM ids already exist in `game/index.html`. Style with classes from `game/style.css`
(`hero-card`, `upgrade-card`, `death-stat`, `hidden`, `show`, `hit`, `low`, `danger`,
`ready`). Do not add new CSS files. Do not restyle `index.html`.

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

## Event list (frozen)

| Event | Payload | Emitter |
|---|---|---|
| `sfx` | `{ name, position?, pitch?, volume? }` | any |
| `player-attack` | `{ origin, dir, range, arc, damage, heavy }` | player |
| `player-hurt` | `{ amount, hp }` | player |
| `player-died` | `{ }` | player |
| `player-dodged` | `{ }` | player |
| `player-jumped` | `{ }` | player |
| `player-landed` | `{ }` | player |
| `enemy-spawned` | `{ position, type }` | enemies |
| `enemy-hit` | `{ position, amount, crit, color }` | enemies |
| `enemy-died` | `{ position, value, color }` | enemies |
| `enemy-attack` | `{ position }` | enemies |
| `enemy-count` | `{ alive }` | enemies |
| `wave-start` | `{ wave, count }` | main |
| `wave-clear` | `{ wave }` | main |
| `upgrade-offer` | `{ cards }` | main |
| `upgrade-chosen` | `{ id }` | hud |
| `run-started` | `{ hero }` | main |
| `run-ended` | `{ wave, kills, coins, score }` | main |
| `coin-collected` | `{ value }` | fx |
| `score-changed` | `{ score }` | main |
| `hero-selected` | `{ id }` | hud |
| `start-run` | `{ }` | hud |
| `retry` | `{ }` | hud |
| `hitstop` | `{ duration }` | any |
| `shake` | `{ amount }` | any |
