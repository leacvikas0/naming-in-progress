# Haru-machi prototype revision implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task after explicit implementation authorization. Use the project's required dedicated asset builders and fresh blind critic-fixers at asset gates. Steps use checkbox syntax for tracking.

**Goal:** Turn the agreed two-player opening, compact role combat, directional spell aiming, sequential verse discoveries and private contextual prayers into a small reliable playable prototype.

**Architecture:** Keep the current Three.js world and verified asset packages. Introduce small pure rule modules for room/action/aim/progression decisions, used by browser and server. Separate accepted game events from visual playback; adapt existing controllers and VFX at their actual integration points.

**Tech stack:** Three.js 0.170.0, native KayKit clips, existing Node development server/test tools, Cloudflare Worker + Durable Object, configured audio-capable judge and existing voice atlas. No new frontend framework or second game renderer.

**Spec:** [DESIGN.md](DESIGN.md). **Behavior checks:** [ACCEPTANCE.md](ACCEPTANCE.md).

## Global constraints

- This is a future execution plan. This task creates only temporary documents and planning presentation. No gameplay code, map or secrets are changed by writing it.
- Before future execution, read the four mandatory project documents in order and this design. Carry the latest user decisions into the canonical vision/continuation documents so an old four-spell/shared-Q description does not silently win.
- Never read/import/copy the banned world code. Do not use forbidden environment prop packs. Preserve native skeletal animation and zero-glass VFX rules.
- Generated images are rough mood/flow references only. No red under-enemy targeting circles or persistent overhead red enemy marking. Spellbook behavior is adapted, not copied wholesale.
- Tablet 1440×960 test capture and desktop 1600×900 test capture are required; actual Pad 7 and RX 6700 checks remain separate from headless tests. Preserve complete-scene budgets from DESIGN.
- Use native workspace isolation or the approved `.worktrees/` workflow when implementing. Keep asset-family changes isolated. Do not create implementation worktrees merely to write these temporary documents.
- Respect layer gates: map blockout → environment assets → native character motion → VFX → mechanics/network/voice. Pure rule tests can precede integrations.
- Commit each passing implementation gate with the continuation plan updated. Never label a recovery checkpoint or saved screenshot report as a quality sign-off.

## Delivery slices and dependencies

1. Contract and baseline checkpoint.
2. Reviewed field/route blockout.
3. Environment corrections and reusable UI art study.
4. Full native action timing and stable camera.
5. Shared aiming math and both-device input.
6. Arrow/ice/meteor/charge/Q visual gate.
7. Two-seat room lifecycle and accepted-event authority.
8. New role powers, encounters and shared progression.
9. Private verse/unlock catalog.
10. Private bounded recording/judgment and ceremonies.
11. Integrated contextual 3D HUD and screens.
12. End-to-end device review and deployment.

Tasks 2–6 refine existing layers before the new integrated game loop is signed off. A stage may be rejected without throwing away unrelated already-verified assets.

## File ownership and proposed new modules

| New module | Single responsibility |
|---|---|
| `world/src/shared/room-rules.js` | Pure two-seat room reducer, roles/readiness/run/reconnect transitions. |
| `world/src/shared/aim-rules.js` | Fixed/variable-distance aim math and canonical immutable snapshots. |
| `world/src/shared/action-rules.js` | Action phases, one buffered attack, release markers and control locks. |
| `world/src/shared/terrain-rules.js` | Existing scalar terrain/walkable rules extracted without renderer imports, preserving output. |
| `world/src/shared/encounter-rules.js` | Server-safe encounter state, hit scheduling, status expiry and XP. |
| `world/src/shared/progression-rules.js` | Verse discovery order, eligible reward and idempotent unlock application. |
| `world/src/input/aim-controller.js` | Desktop/touch pointer ownership, terrain projection and confirm/cancel. |
| `world/src/ui/app-flow.js` | Title/loading/room/lobby/playing/pause/info state and view bindings. |
| `world/src/ui/hud3d.js` | Shared-renderer HUD scene, batches and accessible hit-target alignment. |
| `world/src/net/commune-client.js` | Mic lifecycle, 8/15-second rule, one invocation and no peer recording. |
| `world/assets/vfx/aim-arrow.js` | Terrain-following physical arrow/glyph with zero idle visibility. |
| `world/assets/vfx/mage-storm.js` | Bounded standalone winter/water Q visual sequence. |
| `worker/commune-judge.js` | One bounded judge request, schema validation, safe reward policy and private history. |
| `worker/scripture-catalog.js` | Catalog metadata and protected content lookup; no client solution export. |

Do not pre-scaffold every file. Create a module with its first test and actual consumer. Existing `main.js`, `player-controller.js`, `campaign-loop.js`, `touch-hud.js`, `coop-client.js`, `combat-balance.js`, `worker/index.js`, `room-do.js` and `serve.mjs` are explicit integration boundaries, not invitations to rewrite the entire game.

## Task 1: Preserve the baseline and resolve old-contract conflicts

**Files:** canonical `SOUL.md`, continuation plan; existing combat/co-op test tools; proposed test folder `world/tools/tests/`.

- [ ] Record current HEAD, clean/dirty paths, active assets and original test outputs before implementation. Protect existing user files and today's temporary plans.
- [ ] Update canonical decisions: random roles/base stats, no speech selection, two E modes, charged Shatterlance, Knight hold-block, separate Q, tap-record Commune, no proximity gate and arrow aiming. Retain old sections as explicitly superseded history where useful.
- [ ] Run `node world/tools/test-combat-sim.mjs`. Run the co-op suite with outgoing judge requests stubbed so server prewarm does not consume quota. Record that these tests still cover some old behavior and will be revised intentionally.
- [ ] Add a test runner using Node's built-in `node:test` under `world/tools/tests/`. Keep root archived npm test commands out of the workflow.
- [ ] Record visual/motion gates as unverified until fresh evidence exists. Commit `docs(plan): record approved prototype revision and baseline`.

Baseline command that stubs only the unrelated model prewarm:

```js
// Run with node --input-type=module, preserving local HTTP/WebSocket calls.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, options) =>
  String(input).startsWith('https://generativelanguage.googleapis.com/')
    ? Promise.resolve(new Response('{}', { status: 200 }))
    : realFetch(input, options);
await import('./world/tools/test-coop-room.mjs');
```

**Exit:** baseline is recorded; old assertions are identified, not silently deleted to make failures disappear. No feature claimed complete.

## Task 2: Block out the safe flower pocket and useful journey

**Files:** `world/src/blockout/{geography,scene-builder,main}.js`, `world/assets/terrain/geography.js`, `world/tools/shoot-blockout.mjs`; proposed `world/tools/tests/layout.test.mjs`.

**Interface:** add exported pure `OPENING_LAYOUT = { lobby: {center,radius}, approach: [{x,z}], encounterPockets: [{id,center,radius}], sanctuaryIds }` in the existing geography data, shared between visual blockout and runtime placement. It is a candidate layout until player review.

- [ ] Candidate starting placement: safe south pocket near `(0,100)`, radius approximately 12 m, inside the current 125 m playable boundary; route bends toward the existing town. Place two small encounter pockets beyond the safe edge, not in the lobby. These are the first blockout measurements to inspect, not generated-image coordinates.
- [ ] Write a layout test that no encounter circle intersects the safe circle, all sampled route points have legal walkable heights and field boundary has clearance from the wrap trigger. Run it red against missing data.
- [ ] Build cheap blockout masses and paths first. Keep existing town, pond, arena and shrine recognizable. Introduce distance through terrain, bends and sightlines; do not uniformly scale all coordinates.
- [ ] Walk camera-level routes in both directions, sample boundary wrap from approach positions and check house/path collisions. Adjust candidate coordinates from that evidence.
- [ ] Capture current multi-angle blockout views; commission a new truly blind critic under the project protocol, then obtain user blockout sign-off before environment asset work.
- [ ] Commit `feat(map): add reviewed flower lobby and approach route` only after this gate.

Test geometry invariant to include:

```js
import assert from 'node:assert/strict';
function assertSafePocket(lobby, pockets) {
  for (const p of pockets) {
    const d = Math.hypot(p.center.x-lobby.center.x, p.center.z-lobby.center.z);
    assert.ok(d > p.radius + lobby.radius, `${p.id} overlaps safe field`);
  }
}
```

**Exit:** actual reviewed blockout, legal route and defined spawn/aggro exclusions. A pretty concept does not satisfy this task.

## Task 3: Correct houses and adapt the existing flower assets

**Files:** `world/assets/houses/{parts,index}.js`, `world/assets/houses/{shoot,verify}.mjs`, flower/terrain modules and their critique/evidence files. Proposed `world/assets/houses/facade-layout.js`, `world/tools/tests/facades.test.mjs`.

**Interfaces:** `buildFacadeLayout(spec) -> { openings, structuralSegments }`; each opening has local-plane bounds, each segment a swept beam polygon and a type. The renderer and validation consume the same layout. Deliberate window mullions are explicitly typed and excluded from the structural-beam check.

- [ ] Write tests using every `VILLAGE_BUILDING_SPECS` entry that no structural beam polygon intersects the clear interior of a window/door. Include front, side, rear and dormer cases, not only the user's reported facade.
- [ ] Make the smallest layout change that reserves openings before `buildTimberFrame` places posts/diagonals. Preserve plausible headers, sill framing and actual wall thickness. Do not fix the issue by hiding the window, shrinking every beam or changing the camera.
- [ ] Use a dedicated houses builder and independent Pass 2 critic-fixer. Keep work in that asset family; apply the same ownership rules to any meadow-density/layout change.
- [ ] Reuse current flower species and GPU batching in the new field. Do not reproduce the generator's larger asset count or new plants literally. Place emote feet on ground with enough visual clearance.
- [ ] Prototype one reusable shallow stone/brass UI token family as isolated art, not a second renderer architecture. Restrained frames and one coherent icon/health style supersede the varying generated slabs.
- [ ] Capture all affected variants and full-scene budgets, complete required blind review and commit per passing asset family.

**Exit:** no framing crossing real openings, plausible field, no forbidden props, verified family artifacts. No red target ring/health-bar art is added from the storyboard.

## Task 4: Full native actions, role holds and a stable camera

**Files:** new `world/src/shared/action-rules.js`; existing character clip API, player controller, touch HUD and input section in main; new `world/tools/tests/actions.test.mjs`.

**Interfaces:** `createActionState(role)`; `stepAction(state, event, config) -> {state,effects}`. Events: `press`, `release`, `tick`, `dodge`, `hit`, `down`, `lock`, `unlock`. Configuration supplies measured native duration/release marker and threshold. Effects: `play_clip`, `strike`, `release_charge`, `block_on`, `block_off`, `cancel_action`. State carries `actionId`, `kind`, `phase`, `elapsed`, `releaseFired`, `bufferedAttack`, `requiresFreshPress`, `locked`.

- [ ] Resolve actual native clips, durations and release poses from the current pack; save a small animation manifest. No guessed clip length, nonzero startTime slice or procedural bone movement. Emote aliases must be checked visually before lobby use.
- [ ] Write red tests for one buffered swing, no forced restart, no repeated release, locked actions rejecting input, Knight long hold blocking without a charged hit, Mage long hold releasing exactly one Shatterlance, and fresh-press requirement after recovery.
- [ ] Replace button-down damage/advance/camera side effects. Decide tap on release below the 220 ms seed; a long hold must never also fire a normal attack. Clear held pointers/keys on blur, downed, screen transition and ceremony exit.
- [ ] Normal attacks advance the full clip, with one marker-triggered hit; normal mashing can adjust tempo smoothly within a reviewed cap. Charged/Q clips do not accelerate with mashing. Dodge cancels only in explicitly allowed phases.
- [ ] Remove routine camera/FOV impulses in local and peer input paths. Remove/inspect automatic fourth-hit hop, instantaneous lunge and root correction separately from camera follow. Do not follow a weapon bone or incidental animation bob with the camera pivot.
- [ ] Record slow taps, rapid taps, hold/release, moving attacks, shielding, charging, dodge cancel and remote playback. Complete native-motion review before integrating new VFX. Commit `feat(motion): preserve native actions and role-specific holds`.

Example release-once regression fixture:

```js
import assert from 'node:assert/strict';
import {createActionState,stepAction} from '../../src/shared/action-rules.js';
const config={holdMs:220,clipMs:1200,releaseAt:.65};
let s=createActionState('Mage'), releases=0;
for(const event of [
  {type:'press',button:'attack'},
  {type:'tick',dtMs:300},
  {type:'tick',dtMs:900},
  {type:'tick',dtMs:900},
]) {
  const out=stepAction(s,event,config);s=out.state;
  releases+=out.effects.filter(e=>e.type==='release_charge').length;
}
assert.equal(releases,1);
assert.equal(s.requiresFreshPress,true);
```

Run: `node --test world/tools/tests/actions.test.mjs`. Add the Knight equivalent to prove there is no charged sword path.

## Task 5: Aim math and input that mean the same thing

**Files:** new `world/src/shared/aim-rules.js`, `world/src/input/aim-controller.js`, tests `aim.test.mjs`; integrations `main.js`, `player-controller.js`, `touch-hud.js`, `campaign-loop.js`.

**Interface:** `resolveAim(input, rules) -> AimSnapshot`. Input: `{abilityId,mode,origin,pointerGround,fallbackYaw}`. Rules: `{frostRange,meteorMin,meteorMax,heightAt,isLegal}`. Invalid snapshots have `valid:false` and a bounded reason enum, not arbitrary text. Valid nested vectors/snapshot are frozen/copied on confirmation.

- [ ] Write and run the fixed-range, variable-range, no-target, invalid-ground, zero-vector, slope-height and immutable-confirm tests below before implementation.
- [ ] Implement planar direction math once. Frost ignores pointer radius; meteor clamps radius. Ground height is resolved at canonical tip. Keep source `origin` as feet; VFX hand offsets do not modify distance.
- [ ] Project pointer onto actual terrain/collision surfaces, recomputing after camera changes. Keep the last valid heading for a degenerate point but do not mislabel a no-ground result as valid.
- [ ] Route only short E taps through nearest-valid soft-lock. Long E begins manual aim, release leaves it armed, one ground confirmation consumes it. Suppress normal attack/camera tap from the same pointer event. Expose visible Cancel; Escape/dodge/element switch/lock clears aim.
- [ ] Desktop pointer-lock needs an explicit transition: release it for aim, store camera yaw/pitch, use cursor projection, consume confirm/cancel and reacquire only on the next permitted player gesture. Do not steal camera control while waiting for permission.
- [ ] Tablet uses distinct pointer IDs for movement, camera, ability hold and confirmation. A finger on joystick is never interpreted as the meteor target. Validate landscape and common browser UI insets.
- [ ] Remove downstream soft-target recomputation from confirmed manual casts, including peer playback. Pass the full accepted snapshot. Commit `feat(aim): unify fixed ice and variable meteor targeting` after tests and input checks.

```js
import assert from 'node:assert/strict';
import {resolveAim} from '../../src/shared/aim-rules.js';
const rules={frostRange:14.5,meteorMin:3,meteorMax:16,
  heightAt:(x,z)=>z*.1,isLegal:()=>true};
const input={mode:'manual',origin:{x:0,y:0,z:0},fallbackYaw:0};
for(const z of [2,9,30]) {
  const a=resolveAim({...input,abilityId:'frost_lance',pointerGround:{x:0,z}},rules);
  assert.equal(a.distance,14.5);assert.equal(a.targetPos.z,14.5);
}
const near=resolveAim({...input,abilityId:'cinder_fall',pointerGround:{x:0,z:6}},rules);
const far=resolveAim({...input,abilityId:'cinder_fall',pointerGround:{x:0,z:99}},rules);
assert.equal(near.distance,6);assert.ok(Math.abs(near.targetPos.y-.6)<1e-6);
assert.equal(far.distance,16);
assert.equal(resolveAim({...input,abilityId:'cinder_fall',pointerGround:null},rules).valid,false);
```

Add an integration assertion that `cinderFall.cast` receives `aim.distance` and its computed ground impact equals `aim.targetPos`; a maximum-range argument alongside a different `targetPos` must fail the test. The same accepted ID rendered twice must not produce two hit events.

## Task 6: Gate the arrow and revised spells as VFX

**Files:** new `world/assets/vfx/aim-arrow.js`, `mage-storm.js`; existing `frost-lance.js`, `cinder-fall.js`, `shatterlance.js`, `sword-vfx.js`, `artorious-vfx.js`, VFX preview/shoot/verify tools; tests `vfx-contracts.test.mjs`.

**Interfaces:** `createAimArrow({getGroundHeight}) -> {group,setAim(snapshot),clear(),getStats(),dispose()}`. Spell playback consumes `AcceptedCast={id,abilityId,aim,startTick,releaseTick,impactTick,seed}`; it does not acquire targets or award damage. `frostGrowth(progress)` is monotonic on emergence and exactly 1 after completion. Add a headless exported pure growth helper only if needed for this meaningful motion invariant.

- [ ] Render the arrow against sunlit sand, meadow, stairs and slopes. Use shallow geometry or opaque/hard-cutout strips and shared NoiseAtlas if required. Adapt source shaft/head/chevrons/tip measurements, not additive transparency or expensive reference noise loops. Width stays fixed while meteor arrow length changes. Zero draws when clear; target <=2 when active.
- [ ] Write the pure frost monotonic/no-overshoot test, then remove `_spikeEmergence` sinusoidal settle. Retain quick travelling eruption and grounded mass; compare V1/V2/V3 in motion with the proposed darker starting treatment. No new bouncing at dissolve.
- [ ] Correct meteor `cast`: it currently ignores `targetPos`. Use `aim.distance` and exact canonical impact; recompute flight time from that distance and preserve one impact event. Validate near/mid/max targets with a moving enemy deliberately ignored after manual confirmation.
- [ ] Reuse Shatterlance's actual spear with full native charged release. Build the two personal Q spectacles as separately bounded sequences, keeping intended hazard readability during the Mage's channel.
- [ ] Finish lotus geometry wiring without using the first unlock, simple heal and emergency miracle at identical scale. Ordinary heal is grounded; unlock levitation is limited to receiver; emergency protection is a distinct effect.
- [ ] Use the mandatory dedicated VFX family builder and independent Pass 2 workflow. Capture current PNGs and videos, per-system and combined cost. Commit only reviewed families; leave failed motion/quality gates unmarked.

Example growth invariant:

```js
import assert from 'node:assert/strict';
function assertMonotonicGrowth(sample) {
  let last=0;
  for(let ms=0;ms<=1500;ms+=5){
    const value=sample(ms/1000);
    assert.ok(value>=last-1e-6 && value<=1+1e-6);
    last=value;
  }
  assert.equal(sample(2),1);
}
```

**Exit:** no claim based only on geometry helper tests. The reviewed video must actually stop looking elastic.

## Task 7: Two-seat rooms, ready/start and accepted game events

**Files:** `world/src/shared/room-rules.js`, `worker/room-do.js`, `worker/index.js`, `world/tools/serve.mjs`, `world/src/net/coop-client.js`; tests `rooms-v2.test.mjs` and revised `test-coop-room.mjs`.

**Interfaces:** `createRoom({id,seed})`; `reduceRoom(room,event) -> {state,events,error}`. Events: `join`, `assets_ready`, `guest_ready`, `start`, `disconnect`, `resume`, `resume_ready`, `reconnect_timeout`, `leave`, `new_run`. State includes `version:2`, `phase`, two seat records, `runId`, `checkpoint`, `eventSeq`. Seats contain assigned role, connected/assets/ready flags and token hash; public snapshots omit authentication material.

- [ ] Write red tests: complement roles for every seeded draw, third seat rejected without eviction, guest cannot start, early host Start rejected, repeated Start yields one run ID, stale socket cannot evict resumed seat, reconnect preserves role/progression, timeout cannot activate AI.
- [ ] Implement create/join endpoints with opaque IDs, collision-checked human phrases and seat resume tokens. Store a lookup for normalized phrases; old room-code truncation is not reused. Return bounded user-facing errors for missing/full/expired room.
- [ ] Implement room state transitions once and consume them in both server adapters. In normal play ignore client `swap_roles`, foreign-role casts, arbitrary `enemy_hit` damage and forged `world_sync` progression. Increment protocol version and revise old relay tests explicitly.
- [ ] Define a single authority for acceptance/damage/spawns: Durable Object in production, equivalent local room simulation in development. Do not keep host and guest both applying authoritative damage. Extract scalar terrain rules from `geography.js`, leaving DataTexture generation client-side; prove sampled heights unchanged before using them on server.
- [ ] Use active-room simulation ticks, accepted action IDs and ordered public event sequence. Start, cast, impact, downed, unlock and checkpoint are idempotent events. Resume sends a consistent snapshot plus sequence, and clients discard older duplicates.
- [ ] Route new screens from room state; avoid starting enemies behind a loading or lobby overlay. No new permanent account system. Commit `feat(coop): coordinate two-seat start and reconnect`.

Minimum lifecycle test fixture:

```js
import assert from 'node:assert/strict';
import {createRoom,reduceRoom} from '../../src/shared/room-rules.js';
let room=createRoom({id:'fixture',seed:123});
function send(event){const out=reduceRoom(room,event);room=out.state;return out;}
send({type:'join',seatId:'a'});send({type:'join',seatId:'b'});
assert.deepEqual(new Set(room.seats.map(s=>s.role)),new Set(['Knight','Mage']));
assert.equal(send({type:'join',seatId:'c'}).error,'ROOM_FULL');
assert.equal(room.seats.length,2);
assert.equal(send({type:'start',seatId:'a'}).error,'NOT_READY');
send({type:'assets_ready',seatId:'a'});send({type:'assets_ready',seatId:'b'});
send({type:'guest_ready',seatId:'b',ready:true});
const start=send({type:'start',seatId:'a'});
assert.equal(start.events.filter(e=>e.type==='run_started').length,1);
assert.equal(send({type:'start',seatId:'a'}).events.length,0);
```

## Task 8: Role powers, roaming encounters and balance

**Files:** `world/src/shared/encounter-rules.js`, `world/src/combat/{combat-balance,campaign-loop,enemy-manager}.js`, room simulation consumers; tests `combat-v2.test.mjs`, `status-expiry.test.mjs`.

**Interfaces:** `createEncounter(seed,definition)`; `stepEncounter(state,dtMs)`; `applyAcceptedAction(state,action)`; `applyEnemyDefeat(state,event)`; results return public ordered events. `activateBlade(hero,element,nowMs,config)` rejects until next-ready time, stores active expiry separately from selected element, and never accepts a role-inappropriate action.

- [ ] Write tests for one swing/contact, one meteor impact, fire burn refresh/cap, ice effect refresh/floor, no global time change, Q single cost, duplicate kill giving no XP, and removal of all artificial partner-distance checks.
- [ ] Re-map the ability catalog: base Mage Shatterlance charge; E Frost/Cinder; Knight selected ice/fire E; separate personal Q; no ordinary Storm Lance E and no old four-slot/wingman-command shortcuts.
- [ ] Stop auto-infusing the Knight from every Mage cast. Define mixed Q/divine priority and restoration on expiry. Clear every damage/empowerment flag when the owning buff ends. A selected element change alone cannot restart duration/cooldown.
- [ ] Seed authored roaming pockets; respect safe-field/poem exclusions, max visible enemies and attack tokens. Enemy threats remain readable without red circles; do not restore target art to compensate for weak animation timing.
- [ ] Implement five-level shared XP seed and role-stat curves from the existing enemy table. Instrument ordinary-hit survival and timed encounter results, then tune against actual replayed input—not just the headless auto-win simulator.
- [ ] Define one boss shield schedule and adjust elite/boss health/telegraphs to the new Q mechanics. A full Mage Q should feel devastating without trivially ending the complete boss encounter. Protecting the cast must be feasible under the concurrent-attacker cap.
- [ ] Implement checkpoint recovery and consensual new-run reset. Commit `feat(combat): implement revised role power loop` after current tests and two-client checks.

Blade timing test (13/18 are explicitly provisional):

```js
import assert from 'node:assert/strict';
import {activateBlade} from '../../src/shared/encounter-rules.js';
const config={activeMs:13000,cooldownMs:18000};
const hero={role:'Knight',blade:null,bladeReadyAt:0};
const first=activateBlade(hero,'fire',1000,config);
assert.equal(first.hero.blade.expiresAt,14000);
assert.equal(first.hero.bladeReadyAt,19000);
assert.equal(activateBlade(first.hero,'ice',18999,config).error,'COOLDOWN');
assert.equal(activateBlade(first.hero,'ice',19000,config).error,null);
```

## Task 9: Three verses, private solutions and sequential rewards

**Files:** `world/src/shared/progression-rules.js`, `worker/scripture-catalog.js`, read endpoint in `worker/index.js`, local parity in `serve.mjs`; proposed tests `progression.test.mjs`, `public-content.test.mjs`.

**Interfaces:** `createProgression()` returns `{discovered:[],stage:0,nameKnown:false,communeVisible:false,appliedUnlockIds:[]}`; `discoverVerse(state,id)` adds discovery and reveals Commune; `eligibleVerseId(state,catalog)` returns only the next discovered unmet stage or null; `applyUnlock(state,{id,verseId})` is idempotent. Public poem responses contain id/title/poem only, never expected meaning, aliases or solution flags.

- [ ] Write red tests: discovering verse 3 first reveals Commune but cannot skip stages; rediscovery/duplicate result has no effect; correct-name first contact and stage progress remain distinct validated facts.
- [ ] Author three short, forgiving poems tied to existing stele/waterside/shrine locations. Use the actual protected configured name only in private content tooling; never include it in plans, logs, public code or generated examples. Keep exact authoring and solution fixtures outside public artifacts. The first name clue must be solvable; later themes invite personal effort/devotion rather than exact recitation.
- [ ] Store reward IDs in a fixed private catalog with stage prerequisites. Proposed stages are first E, fire modes, personal Q; freeze the reward order with Vikas before recording final lines or building bespoke unlock art.
- [ ] Persist shared discovered/stage/name-known facts with the room/run checkpoint. Reload/reconnect cannot farm rewards. No cross-account system is required.
- [ ] Add world interaction prompts only near discoverable objects and show the role-info page's actual earned abilities. Existing gate requires neither both players near the tablet nor a partner tether.
- [ ] Commit `feat(progression): add bounded sequential valley verses` after endpoint leakage and order tests pass.

```js
import assert from 'node:assert/strict';
import {createProgression,discoverVerse,eligibleVerseId,applyUnlock}
  from '../../src/shared/progression-rules.js';
const catalog=[{id:'verse_1',stage:1},{id:'verse_2',stage:2},{id:'verse_3',stage:3}];
let p=discoverVerse(createProgression(),'verse_3');
assert.equal(p.communeVisible,true);assert.equal(eligibleVerseId(p,catalog),null);
p=discoverVerse(p,'verse_1');assert.equal(eligibleVerseId(p,catalog),'verse_1');
p=applyUnlock(p,{id:'unlock-a',verseId:'verse_1'});
assert.equal(p.stage,1);
assert.deepEqual(applyUnlock(p,{id:'unlock-a',verseId:'verse_1'}),p);
```

## Task 10: Private recording, contextual judgment and rare voice

**Files:** new `world/src/net/commune-client.js`, `worker/commune-judge.js`; room ownership in room rules/DO; existing voice atlas, main mic handlers and Artorious effects; tests `recording.test.mjs`, `prayer-races.test.mjs`, `judge-policy.test.mjs`.

**Interfaces:** export pure `recordingDecision({durationMs,hasAudio,failed,cancelled}) -> 'retry'|'submit'|'cancel'`; `beginInvocation(room,seatId) -> {id,owner,error}`; `settleInvocation(room,{id,result})` commits at most once. Judge API returns an allowlisted normalized reaction; raw transcript/audio/provider errors never enter public packets.

- [ ] Boundary-test 7,999 / 8,000 / 15,000 ms, empty capture, denial, track errors, short retry and duplicate stop. A monotonically measured elapsed time is used, not container metadata or wall-clock changes.
- [ ] Acquire room ownership before opening the mic. If a stop/cancel happens while permission is pending, immediately stop the eventual stream and do not create an abandoned recording. On valid stop call recorder stop and track stop immediately; collect the final chunk asynchronously without extending device capture. Clear tracks/timers on blur, downed, disconnect and teardown.
- [ ] Implement tap-record/tap-stop for keyboard and touch with no hold-to-pray remnants. Under-eight stop shows only Retry; no network request and no diegetic 'already heard' line. At fifteen seconds auto-stop submits once. Same-pointer bubbling must not also attack or reopen recording.
- [ ] Accept audio only for the room-owned ID and authorised seat. Build context from authoritative room state, including actual emergency and next eligible verse. The transport submits one bounded turn; do not add always-on streaming without a new decision.
- [ ] Validate schema/enums/types; keep at most three private compact history items. Server determines reward IDs, stage eligibility, health deltas, severity and speaking allowance. First-contact, major-unlock/rescue/warning gates select rare fixed voice clips. Provider timeout/malformed response releases ceremony without punishment; no automatic fallback smite.
- [ ] Test concurrent two-player begin, duplicate HTTP/WS delivery, cancellation while judging, late result after downed/reset, role change on stale socket, spoofed low health, and abuse-count exemption for retries/errors. Three timestamp checks are not a replacement for invocation IDs.
- [ ] Author limited grand voice lines and mix them with a clear central voice plus restrained stereo width/tail; check mono tablet speakers and headphone/Bluetooth release. Never send the speaker's recording to the partner as a voice line.
- [ ] Emergency effects lock only the speaker, with bounded protection and no repeated refresh. Awakening locks only the receiver; clear buffered inputs on landing and restore controls even when a cinematic fails. Commit `feat(commune): resolve private bounded invocations` after race and device tests.

```js
import assert from 'node:assert/strict';
import {recordingDecision} from '../../src/net/commune-client.js';
const valid={hasAudio:true,failed:false,cancelled:false};
assert.equal(recordingDecision({...valid,durationMs:7999}),'retry');
assert.equal(recordingDecision({...valid,durationMs:8000}),'submit');
assert.equal(recordingDecision({...valid,durationMs:15000}),'submit');
assert.equal(recordingDecision({...valid,durationMs:9000,failed:true}),'retry');
assert.equal(recordingDecision({...valid,durationMs:9000,cancelled:true}),'cancel');
```

The module must expose that pure helper without opening devices or requiring `window` at import time.

## Task 11: Assemble final screens and truthful 3D HUD

**Files:** `world/src/ui/{app-flow,hud3d}.js`, `world/index.html`, `main.js`, `touch-hud.js`; tests `ui-state.test.mjs` plus current browser interaction/capture tools.

**Interfaces:** `deriveHudState(room,hero,progression,action) -> {health,controls,selectedElement,prayerStatus,connectionStatus}`; `createHud3d({renderer,camera,root}) -> {update(snapshot,viewport),render(),dispose()}`. Use the existing renderer; actual drawing order clears HUD depth without clearing world color. Transparent DOM buttons consume events and expose accessible names. App flow has one transition table, not independent modals that can overlap.

- [ ] Write tests that lobby has no attack/movement controls, receiver lock hides/disables combat, Commune stays hidden before discovery, E/Q visibility matches real unlocks, Knight/Mage hold semantics are reflected, and disconnected status cannot masquerade as linked play.
- [ ] Implement title credits, honest loading, Create/Join phrase flow, flower field emotes and per-seat Ready/Start. Both client assets must be ready before one accepted start tick moves cameras. Use useful recovery for failed loads/full rooms, without developer error dumps.
- [ ] Replace the generated slabs/frames with one reviewed kit. Batch health, icon and cooldown visuals, use opaque/readable materials, align DOM hit targets after resize/profile/fullscreen changes. No emoji, permanent minimap/clock/inventory/mana, red enemy targeting ring or ordinary overhead red enemy bar.
- [ ] Add character information via the role emblem: actual role/base+level stats, unlocked powers and only relevant controls. Tab is always element cycle in play; it must not swap the hero or unexpectedly open a page.
- [ ] Show only the newly unlocked ability's short hint and clear it after successful use. E aiming can display Cancel and selected spell; no tutorial for obvious joystick movement. Put audio, camera comfort and leave-room actions in pause.
- [ ] Capture desktop and tablet at actual CSS sizes; measure hit targets, thumb reach and central sightline. Profile the added HUD against the complete scene, not the temporary demo's separate canvas. Commit `feat(ui): integrate contextual sculpted game screens`.

**Exit:** no UI state lies about readiness, power ownership or recording. At least 48 px secondary and 64–80 px primary touch targets remain distinct even when icons are visually small.

## Task 12: Playthrough, blind gate and actual deployment

**Files:** current capture/verification tools, new scenarios under `world/tools/tests/`, allowlisted static build tooling and Worker config; continuation plan/evidence report.

- [ ] Run all revised Node contract tests and updated legacy suites. Revise old half-health/proximity-revive/four-spell assertions into explicit new assertions; do not simply remove coverage.
- [ ] Execute every scenario in ACCEPTANCE on two clients, including disconnect during charge, aiming, prayer and awakening. Record actual outcomes and IDs; never capture protected content into public test artifacts.
- [ ] Record title-to-boss playthrough and focused sword/charge/aim/ice/prayer clips. Capture 1600×900 desktop and 1440×960 tablet layouts. Inspect motion with the required native-video workflow. If unavailable, list that gate as incomplete.
- [ ] Run sustained actual hardware checks including aim arrow + both heroes + enemies + simultaneous VFX + HUD + post-processing. Record worst cases and frame-time distribution, not only a pleasant empty-field FPS.
- [ ] Commission a fresh blind full-game critic under the exact judging protocol and obtain Vikas's playable sign-off. Handle any implementation fixes within their scoped gate; do not pass historical self-reports forward as evidence.
- [ ] Build an allowlisted asset directory for the real game and verified character assets. Never deploy the repo root, `.env`, private scripture solutions or the temporary planning directory as the real game. Fix the development server's arbitrary-file fallback before sharing it beyond localhost.
- [ ] Deploy the Worker room/verse/judge endpoints with secret bindings and matching static assets. Verify local/production behavior parity, mic HTTPS context and a real Desktop + Pad 7 join/start/reconnect. Packaging as an APK/TWA remains deferred.
- [ ] Update canonical continuation checkboxes and atomic final commit only for completed gates. Provide current image/video evidence, remaining limitations and the actual deployed game URL. Do not reuse the temporary Pages planning URL as evidence of a functioning co-op deployment.

## Review before execution

The source-backed aiming correction is a requirement. The proposed verse reward order, input thresholds, reconnect timeout, five-level cap, Q refund rule and final damage/HP values are review points, clearly listed in DESIGN. Keep them configurable and validate them in a short playtest before treating them as locked content. No additional game subsystem is needed to start Task 1 once implementation is authorised.
