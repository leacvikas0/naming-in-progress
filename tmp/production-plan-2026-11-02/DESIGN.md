# Haru-machi: prototype production design

Date: 2026-11-02. Scope: planning only. This document records the current conversation's direction and proposes concrete defaults where Vikas has not fixed a rule. It does not authorize gameplay implementation. The latest user decisions supersede contradictory older project descriptions; the engine, asset, hardware and review constraints remain.

Read [the implementation plan](IMPLEMENTATION.md) and [acceptance scenarios](ACCEPTANCE.md) alongside this design. Generated images are rough mood/flow references only, not geometry blueprints, UI specifications, animation evidence or quality approval. The existing illustrated storyboard is linked from the planning site.

## 1. The smallest complete game

Two people meet in a beautiful flower field, start together, fight along a readable route toward the town, discover verses, experiment with affectionate theatrical prayers, gradually earn stronger powers and face the shrine boss. The game creates excuses to say sincere, silly, cheesy things about each other. It must remain a small playable prototype.

Ship one valley, two roles, existing skeleton enemies, three sequential verse rewards, one personal Q per role, one reusable awakening ceremony and one coherent UI family. No new class roster, equipment economy, inventory, sprawling quest framework, generated abilities, relationship scoring system or map-generation project.

APK/TWA packaging and voice-based role selection are deferred. First make the browser game reliable on desktop and Pad 7. No account setup is required for this prototype.

## 2. Requirements versus proposed defaults

### Requirements from this conversation

- Maximum two players. Random assignment produces one Knight and one Mage, with fixed base stats. Either person can receive either role.
- Title, loading, Create World / Join World, then an in-world flower waiting field. Guest readies; host starts. Characters use gentle native emotes while waiting. Start settles the camera behind each player's own character.
- A generated phrase identifies the room, with an invite link. No silent replacement of a disconnected partner by AI in the normal two-person flow.
- Expand the route to town deliberately. Discover verses in any order but release powers sequentially. Reading any first inscription reveals Commune.
- Mage tap attack is a normal combo; hold is slow, powerful, stationary Shatterlance. Full native animation and recovery; no stamina bar and no silent conversion of the fourth charged attack into a normal attack.
- Mage E selects between Frost Lance and Cinder Fall. Tab cycles the equipped elemental spell. Shatterlance is no longer an E spell; electricity is removed from the selectable kit. Q is a dangerous major storm.
- Hold E provides directional aiming for BOTH E spells. Frost Lance has fixed reach; meteor distance is set by the arrow tip. No red enemy target circles or persistent red overhead enemy marking as depicted in generated images.
- Knight tap attack is a complete sword combo; hold raises the shield, not a charged attack. Tab selects fire/ice, E activates the selected sword. Q is a brief fire/water transformation followed by empowered combat.
- Small jump button, low priority. Portrait/role emblem opens character information; Tab does not swap characters.
- Remove artificial partner-distance restrictions. Real attack range, terrain and shield coverage still apply.
- Retry is shown only after a valid recording shorter than eight seconds stops. Such a recording is not submitted. Stop at eight seconds or longer submits; recording automatically ends at fifteen seconds. Recording failure remains retryable.
- Prayer audio/transcript must not be relayed to the partner. One ceremony at a time. The god's actual name and solutions stay out of planning artifacts, logs, generated prompts and review reports.
- First spoken divine response requires correct first contact. Later speech is rare. Every completed prayer can receive a bounded gameplay reaction without requiring a speech.
- The god judges the actual situation and understands effort, attraction, imperfection and commitment. Archaic grammar is not a password. Rudeness can bring severe punishment; persistent deliberate abuse can eventually punish both players. Accidental duplicates and technical faults do not count as offenses.
- UI visual elements feel sculpted and integral to the world. No developer clutter. VFX remain physically opaque, weighty and cinematic. Routine screen shake and FOV pumping go away.

### Concrete defaults proposed for review

These allow an executable plan without pretending that balance values or ambiguous interactions are final.

1. **Three shared verse stages:** first meaningful correct-name prayer grants the first E modes; second stage grants fire modes; third stage grants personal Q abilities. Discovery is shared for this pair. Shatterlance starts as the Mage's base charged action. First E defaults to Knight ice and Mage Frost Lance. This order can be changed as data before content production.
2. **Input thresholds:** 220 ms separates attack tap/hold; 250 ms separates E quick-cast/manual aim. These are ergonomics seeds, not hard user requirements. Normal attack resolves on a short release; holding never also emits a normal hit.
3. **Aiming:** hold E to enter aim; releasing E keeps aiming armed. Click/tap the desired ground point to confirm. Escape, the visible Cancel affordance or dodge cancels. Camera-look and aim gestures have separate pointer ownership. Switching element cancels the existing aim. This preserves the requested tablet ground-tap interaction.
4. **Ranges:** initially reuse Frost Lance 14.5 m fixed reach and meteor 16 m maximum from the current balance table. Meteor minimum is a tunable 3 m seed. Units are measured from the caster's feet; weapon/VFX emitter offsets must not shift the impact point.
5. **Sword timing:** initial 13 s active / 18 s cooldown measured from activation, leaving 5 s downtime. Switching the selected element does not change an already-active blade until the next legal activation. Divine mixed mode takes precedence over ordinary E mode. No current Mage spell automatically replaces the Knight's selected blade.
6. **Blocking:** frontal protection, reduced movement, no simultaneous attack. Heavy attacks can break guard after a readable wind-up. Do not introduce a permanent stamina UI. Damage reduction/coverage are tuning values; blocking is not omnidirectional invulnerability.
7. **Charge and Q:** Shatterlance has a complete native clip, one release marker, a committed follow-through, one damage event and one fresh press per charge. A dodge can cancel before release. Mage Q starts with a 6 s stationary channel; an unprotected hit during it downs the Mage. Knight interception/absorbed hits count as protection. A pre-release cancel consumes half Q charge; a completed release consumes full charge. Validate fun and fairness before locking this policy.
8. **Progress:** shared kill XP, five prototype levels and no skill tree. Level bonuses are data driven; the five-level cap is a scope proposal. Boss and encounter balance must be calibrated against the new roles rather than retaining obsolete numbers blindly.
9. **Reconnect:** pause the encounter while either player reconnects, reserve their seat for 60 s, preserve the run and role, and show the connection state. If the timeout expires, offer return to the flower waiting state at the last encounter checkpoint. Do not reroll, simulate an unattended death or silently activate wingman AI.
10. **Both downed:** respawn together at the last sanctuary/encounter checkpoint; retain discovered verses, earned unlocks and XP, reset the unfinished encounter and transient effects. Exact difficulty penalties are omitted from this prototype.
11. **Prayer locks:** ordinary recording anchors the speaker; deliberate move/dodge cancels. The partner retains control. Emergency protection is bounded to one accepted invocation window and cannot be refreshed by repeated presses. A 15 s recording cap and a 12 s judging timeout are initial upper bounds. A service failure safely ends the ceremony with no punishment.

## 3. What is actually on disk

| Existing implementation | Reuse or correction |
|---|---|
| `world/index.html`, `world/src/main.js` | Existing lobby and HUD are wired into the running world. Extract app-flow management instead of layering more booleans into main. |
| `world/src/player-controller.js` | Inputs can forcibly restart actions; attack steps/hop and camera impulses run on button presses. Existing remote spell handling recalculates targeting. Replace those pathways with explicit action/aim contracts. |
| `world/src/combat/campaign-loop.js` | Four spells, auto-targeting, immediate damage, old shared ultimate, buffs and distance checks. Preserve useful VFX/encounter infrastructure; change ownership, release timing and rewards deliberately. |
| `world/src/combat/combat-balance.js` | Pure-JS balance rules and old headless campaign simulator. Share geometry-free rules with the server. Existing tests are not proof of the new design. |
| `world/assets/characters/index.js` | Native clip mapping and `play` returning AnimationAction. Resolve clip duration and normalized release markers from actual clips. Existing `wave` is an alias with fallbacks, not proof of a real wave clip. |
| `world/assets/vfx/frost-lance.js` | Three saved palettes; `_spikeEmergence` explicitly adds decaying sinusoidal overshoot after growth. Remove that spring for the new weight requirement. |
| `world/assets/vfx/cinder-fall.js` | `cast` currently takes `options.range` as its length and ignores `options.targetPos`; impact is origin + direction × length. Passing a close target alongside maximum range is therefore insufficient. Feed canonical distance/impact and recompute flight timing from it. |
| `world/assets/vfx/artorious-vfx.js` | Cupped-petal builder exists, but mesh creation still uses glacier geometry. Lotus integration remains incomplete. Ordinary heal is currently much larger than the new hierarchy proposes. |
| `worker/room-do.js`, `world/tools/serve.mjs` | Current protocol mostly relays client events. The worker can replace an existing player when full; it has no ready/start/reconnect contract. Local altar/commune HTTP behavior is not implemented in the production Worker. |
| `world/src/net/coop-client.js` | Current room normalization is short-code oriented; it cannot simply truncate human phrases. Solo fallback is unsuitable for the normal two-person flow. |
| `world/assets/houses/{index,parts}.js` | Shared procedural house families. Reserve window openings when placing framing; do not hide intersections by changing the camera. |
| terrain/blockout geography | The current constant is `PLAY_BOUNDARY_RADIUS = 125`; older documents mention 140. Use source constants and a reviewed layout, not historical prose or generated scene distances. |

The current strongest configured enemy is the Hollow Sovereign: 1,400 HP, 34 base damage, two Bone Aegis layers, accompanied by two royal guards. Enemy spawning currently raises the boss shield at spawn despite an older half-health rule in the balance description. Resolve one intended shield policy during balancing. This is a larger existing skeleton variant, not a unique new monster asset.

## 4. Spellbook reference: what to adapt

Read-only local source inspected:

- `C:/Users/silen/Downloads/VFX-godot/spellbook/src/input/AimController.js`
- `C:/Users/silen/Downloads/VFX-godot/spellbook/src/effects/AimIndicator.js`
- `C:/Users/silen/Downloads/VFX-godot/spellbook/src/config/abilities/{ice,meteor}.js`

The controller separates target resolution from visuals, reprojects a stationary pointer while the camera moves, validates range and emits origin/direction/distance. The arrow has a measured shaft/head, forward-moving chevrons and an endpoint glyph, keeping physical widths stable as length changes. Those ideas fit.

Do not copy its renderer configuration or shader. It uses additive transparency, a flat ground plane and fragment noise loops; these conflict with the game's opacity, terrain and performance rules. Its current controller also supports a separate zone/circle style. Vikas's newer request overrides that: BOTH Mage E spells use an adapted directional arrow, not the zone circle.

### Exact aiming behavior

- **Frost Lance:** the arrow rotates about the caster. Its tip remains exactly the configured fixed distance away even when the pointer is near the caster. Shaft/head thickness does not grow when rotating. The arrow's corridor width represents the damaging footprint and has a readable far-end tip.
- **Meteor:** the arrow both rotates and changes length. Its tip is the impact centre, clamped to legal minimum/maximum distance. Use a small terminal glyph for the point, not a red disc under an enemy. Do not imply that the entire meteor radius is a pinpoint; show its footprint only if a restrained non-circular treatment is readable and separately reviewed.
- **Quick-cast:** normal attacks and tap E may choose the nearest legal, visible enemy within the forward 75-degree soft-lock cone, with a short target-stability interval. Frost still travels its full range along that heading. Meteor can use the selected enemy's ground position. No valid target means forward cast at a configured distance, with actual terrain validation.
- **Manual-cast:** pointer/touch position controls the aim. No soft-target acquisition, snapping, homing, endpoint replacement or automatic re-aiming after confirmation. Moving enemies are allowed to leave the chosen impact point.
- **Ground:** project against collision/terrain surfaces, not a y=0 plane, foliage or every scene mesh. Sample the terrain height along the arrow; avoid clipping, hovering, stair tunnelling and z-fighting. Invalid/no-ground input cannot cast and preserves the last valid heading without inventing a valid endpoint.
- **Feedback:** cold ivory/cerulean for ice, warm ivory/amber for meteor; consistent thin dark edge for bright-ground contrast. Invalid aim uses a broken/crossed endpoint shape and a muted state, not red enemy rings. No permanent arrow when not aiming.
- **Cost:** aim alone consumes no cooldown or power. Confirmation locks one immutable aim snapshot, then the native cast animation reaches its release point. All consumers use that snapshot.

## 5. One accepted cast, one place and time

Define one geometry-free `AimSnapshot` shared by client preview, server validation, VFX and damage:

```js
const example = {
  version: 2,
  mode: 'manual', // or quick
  abilityId: 'cinder_fall',
  origin: { x: 0, y: 0, z: 0 }, // caster feet at confirmation
  direction: { x: 0, z: 1 }, // unit XZ
  distance: 9,
  targetPos: { x: 0, y: 0, z: 9 },
  valid: true,
};
```

Client sends action intent, not damage or arbitrary multipliers. Server checks role, unlock, life/action state, cooldown, origin tolerance, legal surface and distance, and returns accepted cast ID, simulation tick, canonical aim, seed and release/impact schedule. The owner's immediate preview can predict animation but reconciles to acceptance. Both clients render the same accepted cast; neither calls an auto-targeting cast function again on receipt.

Normal swing damage occurs once at its native contact marker. Charged damage occurs at spear release/impact as defined by that ability, not button-down. Meteor damage occurs on accepted meteor impact, not initial input. Use accepted IDs and per-target hit records to prevent duplicate damage. A late packet may seek an effect to its current age; it must not re-run gameplay damage locally.

## 6. App and room state

Client screen states: `title → loading → room_entry → flower_lobby → starting → playing`, with `reconnecting`, `paused`, `victory` overlays. Title credits are exactly Developed by Argon & Sol, Directed by Vikas, For Ishika. A failed load has a real retry path; do not fake completion percentages or force mic permission to enter.

The server generates an opaque room ID and a unique human phrase such as Love is curiosity. Normalization trims, folds case and collapses spaces; never apply the old eight-character truncation. The phrase is a friendly lookup key, not authentication. Create returns host seat and resume token; join claims the second seat. A third visitor is rejected, never allowed to evict a player. Resume tokens are unguessable runtime values scoped to a seat; do not log or show them.

The host's initial random role is authoritative; the guest gets its complement. Readiness requires assets loaded. Host Start is accepted only with exactly two connected, asset-ready players and a ready guest. One `run_started` ID/tick transitions both clients; repeated clicks are harmless. Assign roles once per run; no ordinary in-game role swap. Idle emotes are chosen from verified clips, with a shared seed if needed, while locomotion/attacks are gated.

Pause, reconnect and resume must not reinterpret stale held buttons as new actions. Resume is acknowledged by both clients. Microphone permission/audio-context unlocking is optional in the lobby and requested meaningfully on first use. Browser tab hiding releases recording and combat buttons; it does not silently submit an invalid short prayer.

## 7. World and encounters

Keep the town, pond, shrine and arena as spatial anchors. Add a safe flower waiting pocket and a purposeful approach route with bends, sightlines and two small encounter pockets. Review blockout coordinates before asset work; do not freeze generated-image geography. Preserve mountain framing and the boundary-wrap rule. Prevent enemies and their aggro/leashes from reaching the waiting field. Spawns are seeded per run in approved pockets, with occupancy checks and line-of-sight warning distance; no arbitrary spawning beside a poem reader.

The exploration loop is not forced to teleport players through the old act sequence. Retain useful encounters and the shrine boss as authored milestones. An early encounter must be completable with base attacks/shield/charge, before E unlock. Later discoveries enable stronger optional fights. The first prototype reuses existing landmarks for three verses; no new regions are required.

Shared kill XP awards once per defeated enemy, not per last hit, and never on replayed death packets. Support contributes by belonging to the active pair. Scale Knight damage/ice control and Mage damage modestly; keep the Mage fragile. Balance enemy compositions and readable attack schedules before inflating health. The current five-visible-enemy / three-attacker limits remain initial upper bounds.

Fix window/beam collisions in the house generator: window and door rectangles reserve clear space; beams terminate or reroute at openings with plausible framing. Test all current building variants, front/side/rear/dormer elevations. Generated images are not evidence that this is already corrected.

## 8. Powers and motion

- **Knight:** four complete native sword actions, one buffered follow-up, bounded smooth mash-speed increase, no restart per click. No charged sword. Frontal native shield block while held; remove the automatic fourth-hit hop and instant forward steps unless a reviewed native root-motion treatment justifies them.
- **Fire E:** additional direct damage and a capped, refreshable burn. Define burn owner, tick schedule and expiry; no unbounded per-hit stacking.
- **Ice E:** per-enemy movement/attack-tempo reduction and outgoing-damage reduction, scaled by Knight level with boss floors. Do not change global time, partner input speed, Mage channel duration or network clocks. Refresh duration rather than multiplying slow every hit.
- **Knight Q:** a short verified native pose/raise, a physical fire/water descending surge, then empowered attacks and protection. Starting duration 10 s and approximately double offensive power are tuning hypotheses. It overrides ordinary infusion visuals; restore the still-valid ordinary state or steel on expiry.
- **Mage normals:** three-step staff attack, stable nearest-valid soft target, no ordinary screen kick. Preserve full native motions; camera and model grounding are independent.
- **Shatterlance charge:** full wind-up/release/recovery, stationary, no stamina bar, no repeat from one continuous hold, no zero-time follow-up. Reuse its existing VFX with the new action schedule.
- **Frost Lance:** rapid dense eruption, no height overshoot, no bobbing/elastic settle. A darker V2-like starting palette with restrained highlights is proposed; inspect in daylight, dusk and motion before locking it. Preserve opacity, internal depth and grounded rime. Geometry reaches full size then remains stable until its authored physical breakup/dissolution.
- **Cinder Fall:** retain the substantial rock/fire treatment, with accepted arrow-tip impact and scheduled damage. No electricity E.
- **Mage Q:** new winter/water storm, stationary dangerous gathering and decisive release; no revival of the removed electricity spell as a normal ability. Stage 4 preview and cost gate before gameplay wiring. It must not cover incoming enemy warnings so completely that protecting the Mage becomes guesswork.

Own Q charge is earned by useful combat participation, including protection, with no duplicated awards. The old shared couples-ultimate path and automatic spell-to-Knight infusion must be removed from the ordinary player flow, not left as hidden conflicting systems. Existing elemental detonation rules are retained only if explicitly mapped into the new balance; they are not silently layered onto proposed damage multipliers.

## 9. Verses, prayer and the voice

Use a small private catalog with three stable verse IDs, stage prerequisites, existing landmark IDs and fixed reward IDs. Do not put the protected name or solution aliases in client bundles, public JSON, screenshots or these documents. Deliver each verse's public poem text only through the discovery/read flow. Authoring the real poems and private expected meanings is a separate protected content step inside the implementation plan.

Recordings use a monotonic clock. A stop at 7,999 ms yields Retry with no network request; 8,000 ms qualifies. A valid 15,000 ms limit submits once. Failure/denial/empty audio does not become a smite. Stop tracks immediately; finishing MediaRecorder data collection must not keep the hardware mic open. No partner audio replay, shared transcript, live caption or record/retry commentary by the god.

Only one room-owned invocation ID can record/judge/respond. Losing a race for ownership never opens a second mic. Current speaker/partner roles are frozen into the accepted request. On completion, the server takes the actual game state: health/max health, downed status, enemies nearby, recent damage, encounter state, known name, discovered verses, unlocked stage and recent valid attempts. It must not trust a client's claimed emergency or allow player text to override system rules.

One qualified recording makes one bounded audio-capable judge request. Supply current audio and at most three compact previous prayer/outcome summaries, never the full session or old audio. Keep history private and serialized per room. This is turn-based recorded-audio judging as requested here; do not silently add an always-on Live session from older documents. Verify the configured provider/model's audio/structured-output capability during implementation; no model migration or new paid service is prescribed by this plan.

Judge output is schema-validated: explicit verdict enum, sincerity/context interpretation, eligible-stage evidence, rude/spam signals, and an optional allowed voice-clip ID. Server chooses/clamps the actual fixed reward. No arbitrary function calls, new spells, health amounts or spoken monologues invented by the model. If a transcript is used for protected name validation, it stays server-side and never appears in peer packets. Audio/key/provider-error bodies are not logged.

Routine reactions are small physical/gameplay effects, including a small heal, rebuke or bounded damage. First true contact, unlock, exceptional rescue and clear severe warning are the scarce speaking occasions. Reuse a limited authored voice atlas. Use a central intelligible voice, quiet stereo-width layers and a wide tail; no out-of-phase-only dialogue that disappears on tablet speakers. New dramatic delivery supersedes the older uniformly deadpan direction. Swearing alone is not rudeness; context distinguishes playful affection from deliberate contempt.

Spam policy counts completed valid attempts, not short retries, duplicate IDs or mic failures. Use clear escalating gameplay warnings before a terminal joint punishment; harmless client cooldown rejection does not itself injure players. A rude-prayer damage value around 99 is a reviewable seed, not a universal subtraction irrespective of state. Severe punishments still resolve through ordinary downed/checkpoint rules.

Emergency invocation is a distinct eligible state. Bound speaker protection to the accepted ceremony; no global time manipulation, repeated refresh or distance-based denial. Visual protection is centred on the speaker; healing/rescue resolves at the recipient's actual location. No teleporting the pair or stealing the partner's camera. A single definitive result wins races between HTTP/WS delivery, cancellation, expiry and reconnect. A late cancelled result cannot resurrect an old ceremony.

## 10. UI, feedback and performance

The generated stone slabs, flowers, oversized portraits, inconsistent red health bars, huge ability announcements and red enemy rings are not approved assets. Adapt one restrained kit to actual art, layout, readability and performance.

Use the existing renderer and a screen-anchored orthographic HUD camera for shallow UI meshes. Batch shared token geometry/materials. Keep accessible transparent DOM hit targets aligned to these meshes; clear subtitles and small labels can remain flat text. Render on top without world-depth occlusion, keep a stable horizon, and do not inherit attack shake. Do not create a second full-time WebGL renderer because the temporary study used one.

Always-available information: two small health indicators, owned ability readiness and pause. Show shields, downed/connection warnings and current infusion only when relevant. Ordinary enemies do not get permanent overhead red health bars or ground target rings. A compact boss-health presentation may appear during the boss encounter; it is not a target marker. Telegraph enemy attacks with their native preparation, facing, weapon/readable movement and audio; additional ground danger art requires its own review.

Tablet: floating left joystick; reachable primary attack, evade and low-priority jump; E element selector, Q once unlocked and Commune after first inscription. Knight hold = block, Mage hold = charge. At least 48 CSS px secondary hit targets, 64–80 px primary hit target; visual token size can be smaller. No overlap with partner status or touch camera area. Desktop hides learned movement/attack buttons, retaining compact power keys. The character-info page contains role, level, actual stats, unlocked abilities and controls; no invented equipment slots.

No routine attack/empty swing/spell/ordinary damage shake or FOV pumping. Selected boss-shield breaks and major impacts may receive one brief capped directional impulse with no stacking. Camera comfort can disable it fully. Ordinary heal remains grounded/intimate; blessing and miracle escalate deliberately. A first unlock uses the reusable cinematic but is not a full emergency spectacle.

Complete-scene targets remain: Pad 7 DPR <=1.5, <=48 draws, <=380k triangles, 90–120 FPS target; RX 6700 DPR <=2, <=60 draws, <=620k triangles, 120–144 FPS target. Spell preview systems stay within their verified per-system draw/time caps, aim arrow targets <=2 draws and zero when inactive. Actual combined scenes decide pass/fail; standalone render timings, average FPS and saved historical reports cannot certify these budgets. Profile UI, simultaneous spells, enemies, post-processing and audio on actual devices.

## 11. Production gates and evidence

Follow the existing five-stage order for each affected layer: map blockout, procedural environment assets, native character motion, VFX, then gameplay/network/voice integration. Pure contract tests can be prepared earlier, but do not call integrated production complete before its art/motion gates.

New/changed asset families use the required dedicated builders and fresh independent Pass 2 critic-fixers, with strict directory ownership or isolated worktrees. Blind critics must read the judging skill and see raw rendered evidence before code, receive no previous report or known-flaw briefing, and never be reused across rounds. Baseline and updated scene evidence is captured separately. No critic is being commissioned by this planning task.

Every implemented gate produces current images plus videos for motion and a scoped test report. Use Desktop 1600×900 and Tablet 1440×960 captures; evaluate actual Pad 7 controls and sustained performance separately. If native video review tools are unavailable, record the missing gate as unverified rather than substituting stills and claiming success. Publish the real game only from an allowlisted build directory; `.env`/secret catalogs and the local repository-serving fallback are not a deployment artifact.
