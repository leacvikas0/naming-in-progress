# Haru-machi — Combat & Enemy Design Review Brief

**Review owner:** Vikas  
**Date:** 6 November 2026  
**Status:** **PROPOSAL ONLY — NOT AUTHORIZED FOR IMPLEMENTATION**  
**Audience:** PC coding agents working on Haru-machi.  
**Scope:** Enemy assets, animation, combat mechanics, co-op combat, encounter pacing, balance, multiplayer correctness, performance and tests. **No story expansion.**

> **Primary instruction to the agent:** Read the current local game first; test and challenge this brief against the code, playable state, available animations and Vikas's intent. Give Vikas a concise diagnosis, disagreements, better options and staged implementation plan. **Discuss it with Vikas and obtain his explicit approval before changing any gameplay code or assets.** You have creative freedom to improve the proposed design; you do not have permission to silently rewrite the game's identity or override Vikas's decisions.

## 1. Non-negotiable workflow with Vikas

1. **Read-only audit first.** Check current local worktree and latest uncommitted/unpushed changes, not merely older GitHub `master`. Inspect the relevant combat, enemy, asset, input, network and test code. Reproduce existing behaviour where possible. Do not silently replace working systems.
2. **Protect secrets.** Do not inspect, quote, summarize, or expose the god's true name, sacred-stone poems/answers or unrelated plot spoilers. In particular, **avoid `worker/scripture-catalog.js`** and any equivalent story-secret files. If necessary, ask Vikas for a spoiler-safe interface instead.
3. **Verify interpretation.** Separate what Vikas explicitly requested, what the assistant suggested, what the code actually does and what is still ambiguous. Pay special attention to old and new decisions that differ. The verbatim user messages are in Appendix A.
4. **Critically challenge the design.** Identify unfair or boring mechanics, impossible animation requirements, hidden costs/licensing problems, weak combat math, network races, mobile performance and failure scenarios. Propose simpler or better solutions where justified.
5. **Present the review to Vikas BEFORE implementation.** Include evidence, asset/animation audition results or a plan to produce them, actual code risks, concrete alternatives, an estimated scope breakdown and exact files you propose to touch. Ask Vikas for sign-off on the revised design.
6. **After approval:** implement in independently verifiable milestones, demonstrate each one, show playtest evidence, and consult Vikas before material scope/design changes. Small engineering details within the approved design are yours to solve creatively.
7. **No asset shopping without a reason.** Budget is **₹0**. The rejected AI-generated Fantasy Creatures pack is forbidden. Avoid irrelevant protagonist redesigns, narrative invention and speculative features.

**Decision gate:** Stop after the audit and design-review response. No changes to the game until Vikas says go ahead.

## 2. Combat north star

Make a **hard, doable, beautiful, lively two-person action experience**. Knight and Mage should both be capable alone, but coordination must create meaningful choices and spectacular saves. Difficulty comes from enemy readability, timing, movement, interference and cooperation—not HP sponges, arbitrary immunity or unavoidable simultaneous attacks. Keep the game responsive on **desktop + tablet** and make visually clear, tactile hit confirmation an acceptance criterion.

Retain the current KayKit Knight and Mage. Do not design romance, dialogue, gods, prayers or stone answers here. Those are central to the overall game, but **outside the approved scope of this document**. Combat changes must preserve their integration and not inadvertently break them. The three stone sites must remain discoverable in any order; no enemy fight may require a later unlock to be beatable.

## 3. Enemy asset plan — candidates, not permission to import blindly

| Slot | Source / available model | Combat identity | Deployment | Decision / risk |
|---|---|---|---|---|
| Skeleton Minion | Existing KayKit | Basic slow slash; recovery lesson | Meadow, early paths | Already integrated; preserve |
| Skeleton Warrior | Existing KayKit | Guarding, deliberate 2-hit pressure | Meadow, village | Already integrated; vary AI |
| Skeleton Rogue | Existing KayKit | Flank, lunge, retreat | Forest/village | Already integrated; check clips |
| Skeleton Mage | Existing KayKit | Visible ranged bolt; interruptible spell | Forest/village | Already integrated; projectiles must be real |
| Orc Raider | KayKit Mystery 4 (`OrcRaider.glb`) | Aggressive mobile melee, 2-hit chain | Forest | GLB verified in mirror; rig/attacks must be tested |
| Plant Warrior | KayKit Mystery 6 (`PlantWarrior.glb`) | Spear at close range, bow at distance | Forest, grove approach | GLB + bow/spear verified; check medium rig attachment and transitions |
| Werewolf | KayKit Mystery 4 (`Werewolf_Wolf.glb`) | Night-only pounce, hunt, recovery | Night forest | Two morph versions available; verify exact pounce or adapt |
| Orc Brute | KayKit Mystery 6 (`OrcBrute.glb`) | Heavy telegraphed slam/sweep | Deep forest, village | Large rig; two-handed clip deformation risk |
| Black Knight | KayKit Mystery 5 (`BlackKnight.glb`) | Frontal shield, stagger/counter | Village confrontation | GLB + shield/sword verified; guard angle and attack timing |
| Monstrosity | KayKit Mystery 6 (`Monstrosity.glb`) | Optional heavy rush/stagger miniboss | Optional clearing | Conditional; rig naming/version conflict must be tested |
| Small bat | Quaternius *Animated Monster* (2018) | Fast dive / harass Mage | Night tree | Conditional; original flying attack / death must pass animation audit |
| Giant bat / Hir'eek | HIVE game-derived port | Rare night aerial elite | Optional night forest | Conditional; large mesh, source-game rights and animation conversion risk |
| Demon Tree | SKULLVERTEX Unity free asset | Night-only stationary guardian; summons bats | Wisteria Grove by one stone | Five listed animations; procedural collapse required |
| Dragon PBR | SKULLVERTEX Unity free asset | Final 3-phase dragon | Northern finale | 13 advertised clips; inspect real Unity contents and conversion |

**Optional aesthetic candidate:** HIVE armored *Skeleton Variations*, which Vikas liked. Do not introduce until its actual clips, style, portability and redistribution rights are checked. **No** paid KayKit Extras, Meshtint or dubious game ports under the ₹0 rule. The unofficial KayKit GitHub mirror contains model files; confirm provenance/licensing and individual animation compatibility before shipping. Prefer original creator distribution if possible.

**Actual model archive:** `https://github.com/GeorgeQLe/assets-kaykit-3d-characters` (unofficial); its character-animation library includes `Rig_Medium_*` and `Rig_Large_*` GLB packs. A model file's existence is NOT proof that its requested combat motions are present or work when attached to it. Create an asset audition with original model views and clips, not AI mockups.

## 4. Encounter design and difficulty curve (starting suggestion)

| Encounter | Enemy composition | What it tests | First-pass target |
|---|---|---|---|
| Meadow scouts | 2 Minions + 1 Warrior | Dodge, direction, hitting during recovery | 15–25 sec |
| Forest ambush | 2 Orc Raiders + 1 Plant Warrior | Threat priority; melee vs ranged | 25–40 sec |
| Heavy forest | 1 Orc Brute + 1 support | Dodge the dangerous arc; create charge openings | 35–55 sec |
| Night patrol | Werewolf (+ optional Giant Bat separately) | Pursuit, lunge response, aerial awareness | Tune after audition |
| Village defense | Black Knight + controlled skeleton/ranged reinforcements | Flanking, shield counter, coordinated spacing | 45–70 sec |
| Optional clearing | Monstrosity, no mandatory unlock | Heavy move readability; co-op stagger | 45–75 sec |
| Night Wisteria | Demon Tree + replenishing small bats | Split attention; Mage charge vs aerial hunters | 50–80 sec |
| North finale | Dragon PBR | Ground/body tells, flight, fire, landing punish | ~90–130 sec competent first win |

These times are *test targets only*. Preserve existing world layout and non-combat flow. **Do not force a linear stone discovery order.** Avoid automatically starting waves in ways that contradict the latest local game's pacing. Harder fights should introduce a new decision, not simply more HP.

## 5. Enemy combat system: one readable contract

- **State machine per enemy:** Observe/Choose Target → Approach/Reposition → Windup → Committed Attack (with active hit window) → Recovery → Reassess; interrupt, stagger, death and despawn are explicit transitions. Windup locks or limits aim before the damaging frame; attacks cannot perfectly track late dodges.
- **Shared encounter director:** Initial hypothesis: up to 2 melee attack commitments plus 1 scheduled ranged threat; never create an unavoidable multi-hit burst on the 90-HP Mage. An enemy without a token can flank/reposition. Use visible body motion and spatial audio, not red floor telegraph circles.
- **Every species has mechanics:** Raider mixes short combos; Plant Warrior switches spear/bow; Werewolf commits to pounces; Brute's large attacks leave recovery; Black Knight has physically directional shield defense and a punishable counter; Monstrosity gets at most 2–3 excellent heavyweight moves rather than invented clips.
- **Use actual 3D hit geometry:** Sweep capsules, bite cones, projectile collisions and flying-height checks must match VFX and contact frames. A 2D X/Z distance check alone is unacceptable for aerial threats. Avoid damage through walls/terrain, duplicated hits and hitting from an idle pose.
- **Network consistency:** One authoritative outcome for damage, stagger, death, summon count, phase, timer and rewards. Prefer the least invasive reliable host-authoritative or room-based model that fits the current Cloudflare Durable Objects architecture; **agent must investigate rather than assume a rewrite**. Predict local effects; reconcile state; handle disconnect/rejoin and simultaneous inputs.
- **The feel:** Clear sound, hitstop, recoil, correct interruption, recoverable camera, coherent matte toon shading, real cast shadows, no plastic sheen. No untested shader replacement across every character.

## 6. Co-op rules (preserve both players' agency)

- **Knight:** Frontline, directional shield, contact-frame melee combo, stagger, defense, physical interception. No magic global protection from across the arena. Interception works only when body, range and attack direction make sense.
- **Mage:** Three standard bolts and Shatterlance; provides ranged control, marks, short windows for teammates and independent defenses. The Mage should never be unable to hit an enemy standing right in front of her.
- **Elemental synergy:** Preserve mark → Knight finisher → detonation and reverse sequence Knight staggers → Mage can charge. Show clear physical effects and real damage rather than hidden synergy multipliers.
- **Revives:** Normal interruptible proximity revive (~2.5 sec proposed) as combat fallback **only if it fits and doesn't undermine the existing special rescue/Commune mechanics**. Both players downed = encounter checkpoint. Don't redesign god/prayer mechanics under this brief.
- **No mandatory role-lock choreography:** Solo contribution must remain viable; co-op makes it safer and faster. Player skill may bypass the intended attack sequence without causing invulnerability or soft-locks.

### Mage Shatterlance: agreed direction, implementation to validate

- One Attack button: tap for normal combo; **hold to charge**, drag sideways for direction and up/down for eruption distance, **release to cast**. Aim marker, ice-lance travel, ground-crystal eruption and damage must share one selected 3D aim result.
- **Maximum range 18 m.** Point-blank shots work; minimum distance small enough for an enemy on her face. Fuzzy aim assist targets nearby visible enemies along intended direction; never lock through walls, behind the Mage or beyond max range. Flying enemies need height-aware targeting and their own hit resolution.
- A charged attack includes both a projectile-like lance and a **ground eruption**. They may have distinct collision semantics, but prevent accidental duplicate damage and describe which effect hits aerial vs grounded targets.
- Holding/releasing/canceling must be coherent on mouse and tablet. The present snapshot has 0.28 sec hold timers, animation-timed contact firing and a three-charge fallback; these conflict with a true release-to-fire experience. **Agent should propose a clean input state machine and ask Vikas whether to replace the three-charge limiter.** Do not change silently.

## 7. Demon Tree: specifically agreed summoning loop

The tree appears **at night** in the Wisteria Grove, holding one of the three Sacred Stones beneath itself. It remains damageable from range: Ishika can snipe it, but the tree summons flying threats to pressure her. No arbitrary immunity, invisible sniper wall, forced root puzzle or scripted co-op switch.

**Working rules to validate with Vikas:**

1. At most **two living flying summons** at once.
2. **10-second cooldown between summon events, starting at the moment of summoning**, not when a bat dies.
3. At each eligible summon, refill missing slots up to two. If both die at t=3 after summoning at t=0, earliest next summon is t=10 (7 seconds of respite). If only one dies, refill one slot at next eligible event.
4. Summons **target Ishika** (original user wording: “they target her only”). A later paraphrase said “preferentially”; **resolve strict vs preference with Vikas**. Knight must physically be able to intercept, stagger or kill them. They must regularly dive low enough for melee and have real aerial hitboxes.
5. Attack cadence: ordinary swipe/grab and one well-signalled ground impact for close-range pressure. The agent must confirm actual clip compatibility before committing to the impact move.
6. Summoning cue should be visually legible; an interruptible summon with a delayed retry is a *proposal* rather than a settled requirement. Ask Vikas if it improves play.
7. When tree HP reaches zero, cancel pending attacks/summons, disable damage, stop/despawn survivors cleanly and play a simple custom **3D defeat animation**: shudder, roots release the stone, branches slump/collapse or withdraw, bark/leaves settle. Preserve access to the stone. Never read/reveal the stone's writing.
8. Tree must be defeatable with the base Knight/Mage kits even if it is the **first** stone found. No required Fire/Ice unlock and no mandatory prayer success.

**Test cases:** both bats dead at 3s, one dead at 5s, one dead at 9.9s, bats alive past t=10, tree dies during summon, bat dies after tree, one player downed, disconnected Mage, and multiple simultaneous bat death callbacks. Ensure cooldown never resets per death; no third live bat.

## 8. Dragon: proposed ground/air finale

Use SKULLVERTEX Dragon PBR only after verifying 13 listed clips in the actual package and obtaining valid conversion/asset rights. Published clips include bite, fire attacks, takeoff, hover, landing and death. No dedicated tail sweep or hit-react is confirmed: don't fabricate them.

- **100–70% HP:** ground bite, readable ground breath, committed recoveries.
- **70–35%:** takeoff, air fire, clearly timed landing; Mage can still damage it while flying; Knight gets frequent meaningful landing windows.
- **35–0%:** tighter combos and fewer idle gaps, but never instant attacks or hard aim-tracking into a completed dodge.
- **Candidate baseline:** 3,200 HP, 30–42 damage for major boss attacks; adapt from actual measured DPS and survival. Resize/validate the arena against dragon wings and breath geometry; don't blindly use the current tight 12.8m radius.
- Finish must be a legitimate victory on both devices with the same damage/phase/death state, not two conflicting simulations.

## 9. Balance: numbers are hypotheses, not orders

Current visible GitHub code has Knight **220 HP**, Mage **90 HP**, ~**55.5** ideal Knight combo DPS and ~**44.9** ideal Mage combo DPS before misses, movement, dodges, buffs and exposure. Do not double-count downtime: distinguish *on-target* DPS from *realized* DPS. Current skeletons hit for 30–32 damage, which can down the Mage in three hits and should be re-evaluated.

| Attack class | Starting candidate damage | Expected player lesson |
|---|---:|---|
| Tutorial skeletons | 12–18 | Read and punish |
| Ranged / fast pressure | 14–22 | Dodge/reposition |
| Heavy elites | 24–32 | Respect windup; counter recovery |
| Boss major hits | 30–42 | Hard, clearly avoidable damage |

Agent should analyze attack frequency, AoE overlap, iframe windows, shield interception, progression scaling, stun lock, solo survivability, heal/revive access and stage exposure. Use headless simulation to catch nonsense; **real two-player desktop/tablet playtests decide final balance**. Test novice, ordinary coordinated and practiced play. Never optimize a boss solely for one theoretical DPS number.

## 10. Technical audit starting points — based on an older pushed snapshot

Relevant paths observed in repo `leacvikas0/haru-machi-private` (not necessarily newest locally):

- `world/src/combat/enemy-manager.js`: fixed six skeleton/boss pool, max five concurrent, shared orbit/windup and XY-plane-style hit checks.
- `world/src/combat/combat-balance.js`: hero/enemy stats, enemy archetypes, wave definitions, detonation damage and headless simulator.
- `world/src/combat/combat-action-aim.js`: tap/hold combos, contact timing, Shield Block, 3-charge limiter.
- `world/src/combat/campaign-loop.js`: act/wave progression, long-distance Knight block interception, spells, buffs, downing and revives.
- `world/src/player-controller.js` and `world/src/touch-hud.js`: mouse/touch attack timers, skill input, crosshair plumbing.
- `world/assets/vfx/shatterlance.js`: existing lance and ground-crystal VFX; displayed endpoint should be tied to validated gameplay damage distance.
- `worker/room-do.js` and `world/src/net/coop-client.js`: `enemy_hit` and `world_sync` relay rather than full authoritative collision resolution.
- `world/tools/test-combat-sim.mjs`: existing deterministic test base to extend.

**Do not assume these filenames, metrics, line numbers or conclusions still match the local worktree.** Confirm before making a plan, especially because Vikas has unpushed changes. Avoid spoiler-bearing story resources.

## 11. Acceptance tests and production gates

**Gate A — audit:** Current behaviour reproduced, mismatches and risks reported to Vikas; no modifications made. **Vikas approval required.**

**Gate B — asset audition:** For each approved model, show an authentic real 3D preview in current world lighting plus a named inventory of playable idle/walk/run/attack/recovery/hit/death clips. Verify bone mapping, scale, pivots, attachments, license and triangle/draw-call cost. Reject unusable models.

**Gate C — combat core:** Deterministic attacks; each attack lands only at a believable contact window, one hit per valid target unless intentionally multihit, correct dodge/guard/stagger, no through-wall damage, no dead enemy attacks, no ghost hits after cancel.

**Gate D — co-op & input:** Both clients agree on HP/death/phase/summons. Latency and jitter tests, reconnection tests, simultaneous hits, role swaps, touch lost-pointer cases, point-blank and max-range Shatterlance, aerial targeting, shield physically protects only when in the way.

**Gate E — encounter quality:** Small mixed enemy groups demonstrate distinct behaviour and provide recoverable punish windows. Tree summon cadence passes edge cases. Dragon phases are fair, cinematic, and not HP sponges. Ordinary players can win with practice; expert players feel rewarded for cooperation.

**Gate F — performance and regression:** Xiaomi Pad/tablet and Windows desktop: no severe sustained frame drops or VFX spikes in worst-case multi-enemy scenes; no freezes, broken state transitions, or leaked enemy instances. Existing non-combat systems remain untouched and functional.

## 12. What the agent should send Vikas first

**Do NOT send a PR or begin implementation yet.** Send a review with these six parts:

1. **What I found in the local game:** what actually exists, changed, failed or differs from this proposed brief.
2. **What is genuinely strong in this plan:** preserve and expand useful mechanics.
3. **What is wrong or overcomplicated:** explain with code/animation/gameplay evidence; offer better alternatives and tradeoffs.
4. **Asset / animation feasibility matrix:** exact clips and missing moves; realistic treatment of three-dimensional bat attacks, tree death and dragon landing.
5. **My recommended MVP sequence:** smallest reliable steps, likely effort/risk, tests and exact files affected.
6. **Decisions for Vikas to approve:** target priority vs exclusivity for bats, charged-move input/3-charge limiter, revival fallback, degree of network authority, optional enemies and any important conflict with the actual current game.

**Finish by asking Vikas to review and approve the proposed direction before any edits.** Creative freedom is encouraged in diagnosis, mechanics, encounter design and implementation *after explicit confirmation*, not as license to silently redesign the project.

---

# Appendix A — Verbatim messages from Vikas (not paraphrased)

The entries below preserve the wording, errors, emoji and sequence of the user's relevant messages from this planning thread. The agent should **prioritize newer decisions if an earlier exploration conflicts**, and discuss unresolved conflicts directly with Vikas. The assistant's interpretations above are separate proposals.

### Vikas 01

> The pack you are giving me is ai generated slop pack i am not using that 😭


### Vikas 02

> Remember okeh only that pack you showed me at first the fantasy one now build a real proet plan and make sure you get tj real pics of the assets


### Vikas 03

> The minatour is very basic looking look for more stuff the ultimate monster pack remeber and all look more properly for good assets


### Vikas 04

> Ultimate monsters don't have enough animations 😭 
> It's just pinch and weapon attack
> The tree only appears at night is actually holding under itself or something one of the stones?


### Vikas 05

> Hey 😭 btw what stops ishika from blasting charged attacks on the tree from a distance


### Vikas 06

> No no just 😭😭😭 fuck let the tree summon some mfkers who can fly out shit and they target her only and she can't be too far or the attacks like limit to reach of the charged attack i think there already is btw we need to make it proper i think it's fixed rn we should make it she aims at enemy it goes to it even if it's like on her face 😂 
> And all


### Vikas 07

> The thing is the attack isn't just charged it also summons a ice attack from ground  


### Vikas 08

> We begy to make it controllable the distance 


### Vikas 09

> Great now the real plan let's talk about it what assets are we using do final pass of research find the best candidates


### Vikas 10

> I agree for the tree 😭 but we will have to shade then or rjeh end up looking like toys 😂 what would you choose? And no money I got and also why can't we use characters from games like witcher and all?? There should be sites where they are with all animations and for most games yk 


### Vikas 11

> Ahh stop overthinking let's find games from which we can take monsters and ar easier to implement in our game shownme options and if possible just downloabke from a site 


### Vikas 12

> Show me options 😭😏 we got this the skeleton is op giant bat great the sycyhe is too weird quality 😂


### Vikas 13

> Hey waitch what if we take characters too 😭 like mage and knight better ones?? Option!s please with animations we need animationss 


### Vikas 14

> Hey waitch what if we take characters too 😭 like mage and knight better ones?? Option!s please with animations we need animationss 


### Vikas 15

> Those are too old and low quality 


### Vikas 16

> Hmm for now let's keep our kaykit ones 😂 😭😭😭 this is work I am not into doing rn let's make the enemy assets finall shall we who where what and all we agreed to change a recap 


### Vikas 17

> We need to get more kaykit variety instead of just skeleton 😂


### Vikas 18

> Hey these the ones you listed above are they even available 


### Vikas 19

> Okeh then we use this we got pretty much all kaykit assets on this mirror let's now choose what will)w e use an dall 


### Vikas 20

> Yeah, yeah, and find more mirrors that might exist.


### Vikas 21

> No only chatavger we take I mean enemies tell me now what we using and all telll


### Vikas 22

> Done. Verify animations are possible for each and available and show render of each we need real.


### Vikas 23

> For the tree death let's just do some animations btw we are planning here my agents on the pc will do it so keep in mind all my prompts as I say them they should be included verbatim in the doc we make and the agent should be told to verify understand intent verify with me first .  
> Now go on design the easy to implement game system story and such   
> Remember the main game is around romance where me and her we call on each other prsu to the god get gifts save each other and all. And i want simple spells too like after we know the god's name the mage or i can pray to him and ask for healing and such simple things too


### Vikas 24

> For the tree death let's just do some animations btw we are planning here my agents on the pc will do it so keep in mind all my prompts as I say them they should be included verbatim in the doc we make and the agent should be told to verify understand intent verify with me first .
> Now go on design the easy to implement game system story and such 
> Remember the main game is around romance where me and her we call on each other prsu to the god get gifts save each other and all. And i want simple spells too like after we know the god's name the mage or i can pray to him and ask for healing and such simple things too


### Vikas 25

> Yes talk to me about it first okeh 😊😊 no writing docs rn


### Vikas 26

> You really do not understand the actual game beyond enemies soo let us scope only that the enemies and fights fuck the other sirdd you do not get it I am not forcing it anymore 
> Show me your plan for the real damn good mechanics enemies plan and.  A hard yet doable beairul fun engaging! Co op experience in fights where we make sure no bugs all things accunted for logically done 


### Vikas 27

> And it cns keep summoning those flying things you kill them? It gets two more till it's dear 10 sec cooldown between 


### Vikas 28

> I like your plan write a doc as a suggestion of a plan aks the agent to verify it properly and critically examine it and truly adapt based on what we have and our goal 
> And give it creative freedom but always docusid with vikas first pit my name or knows it  


---

**End of brief. First action: inspect, critique, discuss and obtain Vikas’s explicit approval.**
