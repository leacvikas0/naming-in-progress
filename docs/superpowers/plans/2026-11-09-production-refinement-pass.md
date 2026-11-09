# Haru-machi — Production Refinement Pass (2026-11-09)

Scope: visual fidelity, consistent gameplay logic, balanced powers, better enemies,
a new post-processing/atmosphere pass (NMS-leaning environment within the existing
cel-shaded Tudor-valley theme).

**Explicitly out of scope (owner handles):** the God / voice / Commune / verdict
system internals (prompting, judging, voice, eclipse/smite cinematics) and the
Cloudflare / multiplayer transport. Where this pass touches their *interfaces*
(e.g. combat numbers a blessing multiplies), it changes numbers only and documents it.

Each phase lands as its own commit after its checks pass.

---

## 0. Audit findings (evidence-based)

### 0.1 Tests
- `world/tools/test-combat-sim.mjs` check 8 **fails** (`COMMUNE_MAX_DISTANCE = 4`,
  `POWERUP_TETHER_DISTANCE = 5` in `combat-balance.js:754-757`, test and locked plan
  require `Infinity`) but the runner still prints `ALL 9 ... PASSED` (exit code 1).
  The banner hides regressions.
- `test-coop-room.mjs`, `test-divine-verdict-sim.mjs`, `test-eclipse-smite-shaders.mjs` pass.

### 0.2 Combat logic holes
| # | Hole | Where |
|---|------|-------|
| C1 | Mage hit intercepted by shielding Knight is reduced **twice** (80% then 80% again on the recursive Knight call → 96% DR). | `campaign-loop.js` `handlePlayerHit` |
| C2 | Shield-hold is free: no guard meter, no duration, no facing arc, intercepts Mage hits from any distance. Makes both heroes near-immortal. | `campaign-loop.js`, `player-controller.js` |
| C3 | Dash has no cooldown; 0.30s i-frames on a 0.32s dash → chainable permanent invulnerability. Perfect dodge (+35% dmg, resonance) has no limit. | `player-controller.js` |
| C4 | Knight level uncapped (×1.96 dmg by L9); ice reduces enemy damage up to 65%. | `combat-balance.js` |
| C5 | Damage multipliers (Q ×2, infusion, empowered, perfect dodge, detonation) stack multiplicatively without cap. | `combat-balance.js` |
| C6 | Mark ownership untracked → Knight self-primes and self-detonates; the co-op synergy is optional. | `combat-balance.js` |
| C7 | Storm Cataclysm ≈820 dmg/target, 11 m radius, strips the whole boss Aegis. | `combat-balance.js` |
| C8 | Unused spec features: `infuseHeal`, `intercept*` constants defined but never wired. | `combat-balance.js` |

### 0.3 Enemy holes
| # | Hole |
|---|------|
| E1 | Boss Aegis active from spawn with 2 layers (`enemy-manager.js:322-324`) so the `aegisTriggerHpRatio` phase never fires. |
| E2 | Death timer fixed at 0.58 s (`enemy-manager.js:431`) cuts `Death_A` short. |
| E3 | Damage resolves on a 0.65 s timer, not the clip contact frame; locomotion clips run at 1.0× regardless of speed → foot sliding. |
| E4 | No stagger/poise; stun has no animation; bosses can be chain-interrupted and slowed without cap. |
| E5 | Pool slots (2 Warrior, 1 Minion, 1 Rogue, 1 Mage) don't match wave composition → wrong models; Captain/Royal Guard/Boss have no distinct look. |
| E6 | `main.js:1604-1609` blob shadows read `pool` / `isBoss`, the manager exposes `poolSlots` / `isBossSlot` → boss shadow sizing broken. |
| E7 | Skeleton-mage ground AoE has no visible telegraph (ring hidden); all archetypes share one 0.65 s windup. |
| E8 | No act-level HP/damage scaling; no 1-vs-2 player scaling. |

### 0.4 Campaign / flow holes
| # | Hole | Where |
|---|------|-------|
| G1 | No fail state: full wipe → 3.5 s → respawn at 60% HP + 30 shield with wave state kept. | `campaign-loop.js:2155-2200` |
| G2 | Every wave clear instantly revives and is the only non-divine revive. | `campaign-loop.js:2256` |
| G3 | Downed heroes can still move/dash. | `player-controller.js:1529` |
| G4 | Stone unlocks gate only the touch HUD; desktop keys bypass them. | `sculpted-hud.js`, `player-controller.js` |
| G5 | Pause is cosmetic; simulation runs under modals. Debug keys 5–8 change camera mid-fight. | `main.js` |
| G6 | Replay keeps `stonesSolved`; only the Knight's position triggers acts. | `campaign-loop.js` |

### 0.5 Visual findings (from fresh renders + source)
- **Fog never reaches the playfield**: `scene.fog = Fog(.., 340, 880)` (`main.js:107`) with a 165 m
  play radius → no aerial perspective; mountains read as flat cardboard.
- **Lighting split-brain**: toon materials use Three lights; terrain/grass/trees use custom
  `uSunDir/uLightTint` shaders. At night, trees and shrine floor render near daylight green/white.
- Water has no fog; outline materials disable fog → dark outlines pop out of haze.
- Post (`post.js`): bloom threshold 0.58-0.68 on linear HDR + extra Orton glow → everything bright
  halos; "cavity AO" is luma-based, draws dark rings around silhouettes; grade keys almost identical
  across TOD (exposure 0.99-1.01, sat 1.07-1.08) so grading adds no mood.
- Gimmick reads: calligraphic white wind ribbons (`sky-tod.js:1289`, 24 instances, screen-space
  swooshes), hard yellow sun ring, low-poly cloud puffs floating *in front of* mountains at wrong scale,
  beige evening haze slab at mid distance.
- Day/evening/night mode branches pop (`sky-tod.js:1550-1565`).

---

## Phase 1 — Combat correctness & balance (commit)
Targets: competent duo **~40-50 % first-clear without divine help**, **≥85 % with it**; casual
duo needs the God to finish the boss.
1. Fix C1 (single DR application on intercept).
2. Shield: DR 80→60 %, guard meter 100 drains per absorbed damage + 8/s held, regen after 1 s;
   break → 1.2 s guard-broken stagger. Mage intercept only if Mage within 6 m **and** in Knight's
   120° front arc.
3. Dash: 0.9 s cooldown, i-frames 0.30→0.22 s; perfect-dodge buff 4 s internal cooldown.
4. Knight level cap 5, +8 %/level; ice enemy-damage reduction capped at 20 %.
5. Global outgoing multiplier soft-cap 3.0× (applied once at damage resolution).
6. Mark ownership: cross-hero detonation ×1.0, self-detonation ×0.35 → synergy matters.
7. Cataclysm: radius 11→8, remove hidden ×1.25, removes **one** Aegis layer, cooldown 24→30 s.
   Knight Q: ×2.0→×1.6 for 10 s, cooldown 24→28 s.
8. Power-up tether `Infinity` per locked plan (Commune distance left to owner).
9. Test runner prints an honest summary.

## Phase 2 — Campaign logic (commit)
1. Downed: 20 s bleed-out, partner revive by holding interact 2.0 s within 2.5 m (35 % HP);
   downed heroes can't move/attack.
2. Remove instant wave-clear full revive → wave clear heals downed partner to 25 % only.
3. Full wipe → act restarts at its checkpoint (current act's wave 1, enemies cleared), no free shield.
4. Gate desktop abilities by `stonesSolved` exactly as touch HUD does.
5. Real pause (simulation dt = 0) in solo; debug camera keys only with `?debug`.
6. Replay resets stones; either hero can trigger acts.

## Phase 3 — Enemies (commit)
1. Boss Aegis phases at 66 % / 33 % HP (1 layer each), not from spawn.
2. Death waits for clip duration (cap 2.2 s), then pools.
3. Locomotion `timeScale = speed / clipNativeSpeed`; damage on per-archetype contact fraction of
   the attack clip.
4. Poise: elites/boss have poise bars; stagger only when broken; hit-react clip on minions;
   boss stun/slow diminishing returns.
5. Per-archetype windups (rogue 0.45, warrior 0.65, captain 0.8, boss slam 1.1 s) and a visible
   opaque ground telegraph for skeleton-mage AoE (zero-glass rule: opaque cel ring, not alpha).
6. Act scaling ×1.0 / ×1.2 / ×1.4 HP, boss 1400→2200; solo (wingman) ×0.75.
7. Fix E6 (shadow pool property names); pool slots sized to wave composition.

## Phase 4 — Post-processing & atmosphere (commit)
1. One shared atmosphere uniform block (sun dir, sun/sky/ground light, fog color, fog density,
   height-fog) updated by `sky-tod.js` and consumed by terrain, meadow, trees, water, outlines.
2. Exponential-squared height fog scaled to the 165 m world (aerial perspective begins ~45 m).
3. Bloom: threshold 1.0 on HDR (only emissive/VFX/sun bloom), soft knee, half-res on tablet;
   delete Orton glow and luma "cavity AO".
4. Grade keyed to TOD with real intent: day = clean warm highlights / teal shadows;
   dusk = magenta-amber split; night = moonlit blue with protected warm practical lights.
   Exposure follows key-light luminance so night isn't just "darker day".
5. Smooth TOD blends (no mode pops); tone down wind ribbons (fewer, fog-faded, only in motion);
   sun disc softened into a scattering bloom.
6. Tablet tier: DPR 1.25, bloom half-res, no FXAA on MSAA, no AO.

## Phase 5 — NMS-leaning environment (commit)
1. Night sky: large ringed gas-giant + small moon, painted nebula band, denser star field with
   twinkle; dusk shows the planet faintly.
2. Distant mountain layers fogged by atmosphere with rim light toward the sun.
3. Ambient life: fireflies at dusk/night around water, roses, and wisteria; day pollen motes.
4. Clouds pushed behind ridgelines and scaled up.

## Phase 6 — Verification
- `node world/tools/test-combat-sim.mjs`, `test-coop-room.mjs`, divine/eclipse sims.
- Fresh SwiftShader renders: day plaza, dusk vista, night plaza/shrine, before vs after.
- Report what is verified, what is source-only, and GPU perf as **unmeasured** (no GPU in sandbox).
