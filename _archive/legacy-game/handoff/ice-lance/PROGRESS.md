# DeepSeek progress: Frost Lance

Status: **implementation complete and verified** (2026-10-17). Not pushed or
deployed. The map agent's concurrent files (`world.js`, `main.js`, `balance.js`)
were not edited; their working-tree changes are that agent's work.

## What shipped

The mage's light attack is now a **ground eruption** along the locked aim line:
a fracture front races out, crystals tear up behind it (small near the caster, a
leaning crown at the far end), a pale frost footprint is laid, and the field
stands then sinks. The old arcane bolt branch and its projectile subsystem were
removed from `player.js`; mage heavy, Meteor, movement, aiming, animations and
party swap are untouched.

| File | Change |
|---|---|
| `game/src/player.js` | Frost Lance cast at `fireImpact`; one-entry `ACTIVE_SPELLS` next-cast index; player-owned 1.0 s cooldown gating the mage light swing; clipped-length refusal; `player-spell-cast` emit; reset on respawn; removed the dead bolt projectile code; added `spellId` / `spellIndex` / `spellCooldownFrac` getters. |
| `game/src/enemies.js` | Subscribes to `player-spell-cast`; bounded front list; swept `[prevFront, front]` contact test with XZ projection, enemy radius and `halfWidthAt`; one contact per enemy id per `castId`; no contacts after the front completes; extra 0.15 s stun; `clearAll()` clears fronts/hit sets. |
| `game/src/fx.js` | Creates the pooled VFX once; subscribes to `player-spell-cast`; passes the **same gameplay dt** the enemies front used (`rawDt * lastGameplayScale`); `reset()` clears the ice. |
| `game/src/ice-lance-config.js` (new) | Spell-only constants, `ACTIVE_SPELLS = ["ice-lance"]`, tuning adapted from the reference. |
| `game/src/ice-lance-logic.js` (new) | Shared `halfWidthAt`, `clipCastLength`, `advanceFront` (dt-driven, never wall-clock). |
| `game/src/ice-lance-vfx.js` (new) | Pooled instanced crystals (3 shared variants, one shared material), frost footprint, glints, 3 fixed cast slots, oldest slot recycled; burst/ring helpers injected from `fx.js`. |
| `game/src/spellbook-LICENSE.txt` (new) | MIT notice + adapted-file list. |
| `game/tests/ice-lance.test.mjs` (new) | 21 focused tests, run directly with Node. |
| `game/handoff/ice-lance/` | This progress file, `browser-check.py`, `evidence.json`, `browser-log.txt`, three screenshots. |

`package.json` was left unchanged as instructed.

## Frozen interface contract (implemented)

### Event `player-spell-cast` (new; emitted only by `player.js`)

```js
{
  spellId: "ice-lance",
  castId,                  // monotonic int per accepted cast (player instance)
  origin: { x, y: 0, z },  // copied plain object, never a live player vector
  dir: { x, z },           // normalised, nonzero, horizontal
  range,                   // locked clipped length in metres (>= 2.5)
  damage,                  // one rolled mage light hit x 1.25
  crit,
  element: "frost",
  reactionMult, auraMult, executeMult, reactionHeal
}
```

Refused casts (not the mage, cooldown running, clipped line < 2.5 m, dead)
emit nothing, deal no damage, create no VFX, start no cooldown and do not
advance the next-cast index. The extra stun is not part of the event: enemies
read `ICE_LANCE.stun` from the shared config.

### Player additions (additive to the frozen API)

`spellId` (next spell id), `spellIndex`, `spellCooldownFrac` getters.
`respawn()` clears the cooldown and index. `swapTo()` deliberately does **not**
touch either.

### `game/src/ice-lance-logic.js` (imports nothing)

- `halfWidthAt(s, cfg)` — shared band half-width used by damage and VFX.
- `clipCastLength(origin, dir, maxRange, world)` — first world collider/boundary,
  always finite.
- `advanceFront(front, dt, cfg, length)` — gameplay-dt-driven.

### `game/src/ice-lance-vfx.js` (integrated only by `fx.js`)

```js
createIceLanceVFX({ parent, rng, burst, ring, shake, emit })
  -> { group, spawn(payload), update(gameplayDt), reset(), activeCasts, slotCount }
```

- `spawn` allocates a visual slot only; gameplay damage is independent.
- `fx.js` passes `rawDt * lastGameplayScale`, where `lastGameplayScale` is the
  `timeScale` main.js multiplied the current frame's raw dt by. Events emitted
  during the gameplay step (hitstop) can move `timeScale` before `fx.update`
  runs, so reading `timeScale` at fx-update time would desync ice from damage.
- `reset()` hides and zeroes every instance; `fx.reset()` calls it.

### Gameplay front (`enemies.js`)

- Phases: travel → standing (`standTime` 1.2 s) → sinking (`sinkTime` 0.5 s).
- Contact requires the front to still be travelling; a target is hit at most
  once per `castId` (enemy-id set).
- `clearAll()` drops pending fronts and hit sets.

## Verification

### Node

- Existing suite **before integration** (with the map agent's concurrent
  changes already in the tree): `npm test` exit 0.
- Existing suite **after integration**: `npm test` exit 0 — same 10 suites,
  11 / 12 / 16 / 26 / 19 / 5 / 4 / 18 / 7 / 2 assertions. No map-owned file was
  edited by this task.
- Focused: `node game/tests/ice-lance.test.mjs` → **21 passed, exit 0**. Covers:
  spell list/config, shared footprint math, collider/boundary clipping, valid
  mage cast replacing the bolt with frost and one momentum award, copied
  origin, clipped range, too-short refusal (no event/damage/VFX/cooldown/index
  change), cooldown gating, swap keeping the cooldown, cancelled swing, respawn
  reset, mage heavy/Meteor payloads, front arrival timing, one contact per
  target per cast, off-line and past-end negatives, late entry into the
  standing field, low-frame-rate sweep, `clearAll` pending-damage removal, and
  overlapping casts with independent hit sets.

### Browser (Playwright + installed Chrome, headless)

Device recorded: `ANGLE (AMD, AMD Radeon RX 6700 (0x000073DF) Direct3D11
vs_5_0 ps_5_0, D3D11)`, 1600×900, DPR 1. Script: `browser-check.py`; raw
numbers: `evidence.json`; console log: `browser-log.txt`. **Console errors and
warnings: none.** No game server was running when evidence began, so the repo
root was served read-only on `http://127.0.0.1:4180/game/index.html` with
`python -m http.server 4180`; the script maps the jsdelivr three.js import to
the installed `three@0.170.0` build so the check does not depend on network.

Controlled wave combat (three targets on the line at 2.5 / 5.0 / 7.5 m, one at
5.0 m with 4.0 m lateral offset):

- each on-line target took one contact (45 hp, i.e. the existing elemental
  pipeline applying the rolled 22.5 hit twice — pre-existing enemies.js
  behaviour, not changed here); the off-line target took 0;
- early front / peak field / cleared aftermath screenshots below;
- after the cast the VFX pool reports 0 crystals / 0 frost / no glints.

Hero switching: knight light attack still hits (60 hp) and creates **no** ice;
swapping back to the mage casts again. Mage heavy still hits (72 hp). Meteor
fires after 10 kills fill momentum (100 → 0 on start) and damages both targets
at the aim point (144 hp each; the existing super hitstop/slowmo stretches the
2.0 s gameplay delay to ≈3.5 s wall time). Retry: ice/frost/glints are cleared
immediately, exactly one player group exists, and no delayed hits land on the
new wave (`no_delayed_hits: true`).

Screenshots (1600×900, fixed evidence camera via main's `__cameraOverride`
hook; gameplay itself unchanged):

- `game/handoff/ice-lance/shot-early-front.png` — front just leaving the mage,
  first crystals and a contact.
- `game/handoff/ice-lance/shot-peak-field.png` — standing field: small dense
  near crystals, tall leaning crown at the far end, frost footprint, three
  targets on the line and one clearly outside it.
- `game/handoff/ice-lance/shot-aftermath.png` — field fully withdrawn.

Visual judgement against `ice__sheet__hero.png`: the silhouette reads as a
ground eruption (not a thrown spear): advancing line, dense low start, dramatic
far crown, pale rime and sparse glints. Ice is translucent blue-white with a
white fresnel rim and stays readable on the bright meadow, though the reference
was authored on dark ground, so contrast is lower than the source sheet.

### Performance

Warmed 10 s repeated-cast sample vs the same scene without casting (caster and
frozen full-hp targets held still so both samples measure the same content):

| Sample | median | p95 | avg draw calls | avg triangles |
|---|---:|---:|---:|---:|
| baseline, no casting | 6.9 ms | 7.0 ms | 130.0 | 635,743 |
| casting, 1.08 s interval | 6.9 ms | 7.0 ms | 141.1 | 651,005 |
| casting, 1.0 s interval (8 s) | 6.9 ms | 7.0 ms | 141.4 | 651,681 |

- one active cast: **+9.4 draw calls** (139.4 vs 130.0) — under the 15 target;
- two active casts: **+12.6 draw calls** (142.6 vs 130.0);
- **three concurrent casts were never observed**, so the ≤35 three-cast budget
  is unverified. With a 1.0 s cooldown measured from impact plus the ~0.2 s
  swing impact beat, accepted impacts are ≥1.2 s apart while a visual cast
  lives ≈2.16 s, so at most two overlap. The 3-slot pool exists and recycles
  the oldest slot, but normal cadence does not saturate it. Extrapolated cost
  would be ≈+14 calls.
- frame interval is display-capped at ≈6.9 ms median / 7.0 ms p95 in both
  samples; the spell adds no measurable frame-time cost at this resolution.

Resources: warm pool = 107 geometries / 302 textures / 43 programs. After the
≈18-cast 10 s sample it is identical (no per-cast growth). After 30 casts and
one retry: 107 geometries / 308 textures / 41 programs, VFX at 0. Geometries
and programs return to (or below) baseline; the +6 textures appear only after
the retry and are not attributable to this spell (the VFX path creates no
textures), but that retry-path texture delta is recorded rather than claimed
clean. First-use shader compilation (one material program, one glint program)
was not separately timed; the repeated-cast sample is warmed.

## Adapted source / license

`game/src/ice-lance-vfx.js` adapts the MIT-licensed reference:

- `createCrystalGeometry` ← `spellbook/src/assets/ProceduralGeometry.js`;
- the injected ice shading (thickness tint, fresnel rim, rime, birth flash,
  glints) ← `spellbook/src/materials/IceMaterial.js`, reduced to cheap terms;
- cast timing/eruption behaviour ← `spellbook/src/abilities/IceAbility.js`;
- `game/src/ice-lance-config.js` tuning ← `spellbook/src/config/abilities/ice.js`.

MIT notice preserved in `game/src/spellbook-LICENSE.txt`. No reference editor,
render pipeline, particle engine, spell registry, postprocessing, scene
context or Three.js upgrade was transplanted; the game stays on `three@0.170.0`.
No new dependency was added.

## Integration notes for Codex / map owner

- No changes are required in `main.js`, `world.js` or `balance.js`. The spell
  uses only `world.bounds` / `world.colliders`, so it works with the dungeon or
  the valley.
- New event `player-spell-cast` and the config/helper/VFX contract above are
  the additions to consolidate into `CONTRACT.md` later.
- `balance.js` was left alone: `ICE_LANCE` and `ACTIVE_SPELLS` live in
  `game/src/ice-lance-config.js` and can be folded into balance by the
  consolidator.
- The focused test is not wired into `package.json` (per instruction); run it
  with `node game/tests/ice-lance.test.mjs`.

## Limitations / unverified

- Three concurrent visual casts were not reachable under the 1.0 s cooldown, so
  the three-slot draw-call budget is extrapolated, not measured.
- The existing enemies.js elemental pipeline applies a hit's rolled damage and
  then its element payload, so one Frost Lance contact deals 2 × 22.5 = 45 to a
  fresh target and emits two `enemy-hit` events. This is pre-existing behaviour
  shared with every elemental light attack; it was deliberately not changed
  (out of scope, would rebalance combat). "One hit per cast" is verified at the
  contact level (`aura-applied` / hp stability), not at the raw event count.
- The retry path leaves +6 textures vs the warm pool; not traced to the spell
  (no textures are created by the VFX), but not claimed as clean either.
- No in-game cast clip was recorded (no recording pipeline was already present);
  evidence is three stills plus the numeric checks.
- Visual tuning is a first pass. The contact sheet was authored on dark ground;
  on the bright meadow the ice reads with lower contrast, which is visible in
  the screenshots rather than hidden.
- No full spellbook UI, unlock system, extra spells, shader editor, plugin
  architecture or networking was built, per scope.
