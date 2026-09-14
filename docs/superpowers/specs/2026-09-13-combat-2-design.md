# Combat 2.0 — duo party, reactions, verbs, and a fight that breathes

Date: 2026-09-13
Status: approved in conversation. This is the implementation spec for `feat/combat-2`.

## Problem statement

The game is stale and unwinnable past wave 5, and the two are the same bug.

1. **One verb.** `handleAttackInput` has a single action: click, 143° arc, no cost, cannot
   miss. Every fight is walk-at-nearest-skeleton and click on a metronome.
2. **The blob.** Every enemy type except the mage walks straight at the player and every
   enemy in range starts a windup simultaneously. There is no throttle, so wave 5+ is a
   pile-up and there is no answer to it but running.
3. **Nothing lands.** Knockback is 3.2 with `exp(-8·dt)` decay — 0.4 units total, invisible.
4. **The arena is wallpaper.** `world.hazards` exists (`{x,z,radius,damage,tick}`) but the
   only consumer is `blocked()` (spawn exclusion). Nothing takes spike damage.
5. **No build, no texture.** Upgrades are flat stat cards, coins are score with no sink,
   every wave is the same wave with a bigger number.

## Design goals

- A fight that **reads**: you can see who is attacking, who is waiting, and why.
- A **rhythm**: build momentum with light attacks, spend it on a super, punctuate with
  heavy attacks and perfect dodges.
- A **reason to swap**: two heroes, two elements, reactions that reward applying one aura
  and cashing it out with the other.
- **Consequences for space**: knockback, spikes, and standoff orbiting make position matter.

## Party and elements

The party is **two heroes**, chosen at the title screen (two distinct picks). Each hero owns
one element. All four heroes are KayKit on the same skeleton and clip set, so a swap is a
model swap plus a stat sheet — no re-rigging.

| Hero | Element | Reaction identity |
|---|---|---|
| Knight | `frost` | control / setup |
| Barbarian | `ember` | burst / knockback |
| Rogue | `shadow` | mobility / marks |
| Mage | `arcane` | AoE / detonation |

## Auras and reactions

- Elemental damage applies an **aura** to the target: `{ element, t }`, 5s duration,
  refreshed by the same element.
- Damage of a **different** element while an aura is present **triggers the reaction** and
  consumes the aura. The reaction is a function of the two elements.
- Same element → refresh only. No reaction.

### The six reactions

| Id | Elements | Name | Effect |
|---|---|---|---|
| `melt` | frost + ember | Melt | 2.2× damage burst, armor break: +30% damage taken for 4s |
| `overload` | ember + shadow | Overload | AoE explosion, 14 knockback, anti-pileup |
| `shatter` | frost + shadow | Shatter | Freeze 1.5s; frozen targets take 2.5× from the next hit |
| `detonate` | ember + arcane | Detonate | Fire nova; burn DoT spreads to enemies within 3.5 |
| `frozen` | frost + arcane | Frozen | Hard freeze, radius 2.5, 2.0s. Pure control |
| `void` | shadow + arcane | Void | Vortex pulls enemies within 3.0 to the point; marked, +20% damage taken for 6s |

Reactions emit one event; enemies resolve mechanics, fx plays the payload, hud shows the
name, audio plays a sting.

## Verbs

**Light (LMB)** — unchanged combo clips, now the momentum builder. Combo finisher (3rd hit)
gets real knockback (see numbers).

**Heavy (RMB)** — committed attack per hero, long recovery, cannot be cancelled except by
dodge after impact. Interrupts windups (0.6s stun), heavy knockback, big momentum.

| Hero | Heavy | Clip | Notes |
|---|---|---|---|
| Knight | Shield Bash | `Block_Attack` | cone stun, no movement |
| Barbarian | Overhead Chop | `2H_Melee_Attack_Chop` | slowest, biggest single hit |
| Rogue | Dashing Stab | `Dualwield_Melee_Attack_Stab` | lunges forward 2.2 units |
| Mage | Charged Blast | `Spellcast_Long` | larger radius, slower projectile |

**Super (E, at 100 momentum)** — hero ultimate, 8s of spectacle on a 1.2s entry slowmo,
invulnerable during the entry.

| Hero | Super | Shape |
|---|---|---|
| Knight | Bulwark | 360° shockwave, 3.5 radius, big knockback + stun |
| Barbarian | Whirlwind | 3s spin, repeated 360° hits while moving |
| Rogue | Shadow Flurry | blinks to up to 5 enemies, 4 hits each |
| Mage | Meteor | delayed 5.0-radius blast at aim point |

**Perfect dodge** — when dodge i-frames negate an attack: +25 momentum, 0.35s slowmo,
3s empowered window (+25% damage), screen flash. Turns dodge from retreat into offense.

**Swap (Q, or 1/2)** — swap to the other hero in place. 1.5s cooldown (upgradeable), 0.25s
i-frames, element ring + trail on swap-in. Per-hero HP: the inactive hero recovers nothing;
if the active hero's HP hits 0 and the partner is alive, auto-swap; both down ends the run.

## Momentum

`0..100`. Light hit +6, heavy hit +12, kill +10, perfect dodge +25, reaction +20.
At 100 the super is armed; using it drains to 0. HUD shows a trough; `E` keycap turns gold
when ready (existing `.px-keycap.hot` pattern).

## Enemy AI — the fight breathes

1. **Attack tokens.** `combat.maxAttackers` (3) enemies may hold a windup at once. Enemies
   without a token hold their approach.
2. **Standoff orbiting.** Enemies inside `type.standoff` but without a token orbit the
   player tangentially (strafe) instead of pressing in. A token freeing is visible as the
   next enemy stepping in.
3. **Role spacing.** Warrior holds slightly wider than minion; rogue keeps its dash (dash
   requires a token); mage unchanged (already keeps distance).
4. **Spikes hurt.** `world.hazards` damages player and enemies on a per-entity tick timer
   (`combat.spikeDamage` 12, `combat.spikeTick` 0.9). Kiting into spikes is a real tactic.
5. **Elites** get one special: windups are ×0.75 time, and they enrage below 50% hp
   (+30% speed). Reactions never apply to the player — auras and reactions are
   enemy-side mechanics only.

## Run texture

- **Wave modifiers** on `computeWave(n).modifier`: `swarm` (×1.5 count, -20% hp), `elites`
  (forced elite wave), `arcane` (mage-heavy mix), `horde` (minion-heavy, faster). Null on
  normal waves. Banner shows the modifier name.
- **Elite waves every 4th** stay, now with a banner and a bonus coin shower on clear.
- **Intermission** stays 4s; upgrade every 3rd wave stays.

## Build identity

Six new upgrades that lean into the new systems (existing 14 stay):

| Id | Name | Tier | Effect |
|---|---|---|---|
| `focus` | Elemental Focus | rare | reactions deal +40% damage |
| `aura` | Lingering Aura | common | aura duration +50% |
| `reactionary` | Reactionary | rare | reactions heal 6 |
| `core` | Momentum Core | rare | +25% momentum gain |
| `swiftswap` | Swift Swap | common | swap cooldown -40%, +15% move speed for 2s after swap |
| `executioner` | Executioner | epic | +30% damage to enemies under 30% hp |

## Frozen interfaces

### balance.js

```js
export const ELEMENTS = {
  frost:  { id: "frost",  name: "Frost",  color: 0x7fd7ff },
  ember:  { id: "ember",  name: "Ember",  color: 0xff7a2a },
  shadow: { id: "shadow", name: "Shadow", color: 0x9b6fe8 },
  arcane: { id: "arcane", name: "Arcane", color: 0x7fe8c8 },
};

// CHARACTERS[knight|barbarian|rogue|mage] gains:
//   element: "frost"|"ember"|"shadow"|"arcane"
//   heavy: { clip, damageMult, knockback, stun, lunge, radius, arc }
//   super: { id, name, desc, clip, duration, damageMult, radius, knockback, stun }

export const REACTIONS = {
  melt:     { id:"melt",     name:"Melt",     elements:["frost","ember"],  color, damageMult:2.2, radius:2.2, armorBreak:{ mult:1.3, time:4 } },
  overload: { id:"overload", name:"Overload", elements:["ember","shadow"], color, damageMult:1.5, radius:3.5, knockback:14 },
  shatter:  { id:"shatter",  name:"Shatter",  elements:["frost","shadow"], color, damageMult:1.2, radius:2.0, freeze:1.5, shatterMult:2.5 },
  detonate: { id:"detonate", name:"Detonate", elements:["ember","arcane"], color, damageMult:1.4, radius:3.0, burn:{ dps:6, time:4, spread:3.5 } },
  frozen:   { id:"frozen",   name:"Frozen",   elements:["frost","arcane"], color, damageMult:1.0, radius:2.5, freeze:2.0 },
  void:     { id:"void",     name:"Void",     elements:["shadow","arcane"],color, damageMult:1.1, radius:3.0, pull:9, mark:{ time:6, crit:0.25 } },
};

export function reactionFor(elementA, elementB) // -> REACTIONS entry or null
```

`CONFIG.combat` gains: `maxAttackers: 3`, `standoff: 3.6`, `spikeDamage: 12`, `spikeTick: 0.9`,
`auraTime: 5`, `swapCooldown: 1.5`, `swapIFrames: 0.25`, `heavyStun: 0.6`.
`CONFIG.player` gains: `momentumMax: 100`, `perfectWindow: 3`, `perfectDamageMult: 1.25`.

Player stat bag gains: `reactionMult: 1`, `auraMult: 1`, `momentumMult: 1`,
`swapCooldownMult: 1`, `executeMult: 0`.

### events.js additions (append to CONTRACT table)

| Event | Payload | Emitter |
|---|---|---|
| `player-attack` (extended) | `{ origin, dir, range, arc, damage, heavy, crit, element, kind, stun }` | player |
| `aura-applied` | `{ position, element, color }` | enemies |
| `reaction` | `{ type, name, position, radius, damage, color }` | enemies |
| `perfect-dodge` | `{ position }` | enemies |
| `swap` | `{ from, to, element, color }` | player |
| `swap-ready` | `{ frac }` | player |
| `momentum` | `{ value, max, ready }` | player |
| `super-used` | `{ hero, position }` | player |
| `hazard-hit` | `{ target, position }` | player / enemies |
| `wave-start` (extended) | `{ wave, count, modifier }` | main |

### player.js

`createPlayer({ scene, world, events, config, hero, partner, loader })` — `hero` is the
starting hero, `partner` the second. Returned object gains:

```js
swap()                    // swap to partner if cooldown ready; returns bool
get activeHero()          // CHARACTERS entry
get party()               // [{ def, hp, maxHp }, ...] length 2
get momentum()            // 0..max
get superReady()          // bool
get swapCooldownFrac()    // 0..1
```

`update(dt, input)` input gains `{ heavy: bool, super: bool, swap: bool }`.

### enemies.js

`createEnemies(...)` returned object unchanged, plus:

```js
get reactionCount()       // reactions triggered this wave
applyElement(enemy, element, damage, opts)  // used internally by damage path
```

Enemy objects gain: `aura`, `frozenT`, `armorBreakT`, `burnT`, `markedT`, `hazardCd`.

### fx.js

```js
reactionFx(type, position, radius, color)   // 6 payload shapes
swapFx(from, to, element, position)
```

Aura rings are NOT in fx.js: `enemies.js` parents a small ring mesh to each enemy
group so it follows the entity for free, and disposes it when the aura expires.
This keeps fx.js free of any enemy-list coupling.

### balance.js pure helpers (node-testable, no THREE)

```js
export function reactionFor(elementA, elementB)   // -> REACTIONS entry | null (same element -> null)
export function auraOutcome(currentAura, element) // -> { apply, reaction }
  // currentAura = null | { element, t }
  // same element  -> { apply: true, reaction: null }   (refresh)
  // new element   -> { apply: true, reaction: id }     (consume)
export const MOMENTUM_GAIN = { light: 6, heavy: 12, kill: 10, perfect: 25, reaction: 20 };
export function momentumAfter(current, gain, max)  // clamped 0..max
```

### hud.js

```js
update(state)  // state gains { momentum, momentumMax, superReady, swapFrac, activeHero, party }
```

New DOM: `#momentum-trough`, `#momentum-fill`, `#ability-super`, `#ability-swap`,
`#party-bar` with two `.party-chip`. Title screen: `#start-btn` enables only when two
distinct heroes are picked; roster shows pick order (1 / 2 badges).

## Out of scope

- No AI-generated animation. KayKit clips only.
- No new 3D assets.
- No per-hero upgrade trees; the stat bag stays shared.
- No enemy roster expansion.

## Verification

- `npm test` stays green (existing 47).
- New tests: `game/tests/reactions.test.mjs` (reactionFor table, aura consume logic),
  `game/tests/momentum.test.mjs` (gain/spend math), `game/tests/party.test.mjs`
  (swap cooldown, per-hero HP, auto-swap on death).
- Playwright smoke: title → pick two heroes → descend → swap works → wave 1 clears.
