# Haru-machi acceptance scenarios

These are future pass/fail checks, not results already achieved. A task is complete only when the relevant scenarios have current evidence. Automated checks prove state transitions and values; motion, aiming readability, atmosphere and controls need actual gameplay/video and the mandatory blind review gate.

## A. Opening and two-person rooms

| ID | Situation | Required result |
|---|---|---|
| A01 | Open game on either device | Correct title/credits and one Enter; no combat beneath title. |
| A02 | Slow or failed asset load | Progress reflects real completed work; failure has usable retry; no fake 100% or invisible active enemies. |
| A03 | Create world | Unique phrase and invite link, host seat, one authoritative random role and fixed stats. |
| A04 | Join through phrase with case/spacing differences | Resolve the same room without eight-character truncation. |
| A05 | Join through invite link | No need to retype phrase; second seat receives complementary role. |
| A06 | Third person/tab attempts ordinary join | Reject capacity; do not evict either original player. |
| A07 | Host presses Start before guest Ready/assets loaded | No start; show only missing readiness reason. |
| A08 | Host double-clicks Start and packets retry | Exactly one run ID and shared transition. |
| A09 | Guest presses Start through forged event | Reject; no role/cooldown/state change. |
| A10 | Guest readies then disconnects | Ready clears; Start disables; seat is reserved within the reconnect policy. |
| A11 | Either reloads/resumes with valid seat token | Same role, progression, checkpoint and current room state; stale connection cannot overwrite it. |
| A12 | Mid-fight disconnect | Explicit reconnect state and proposed room pause; no silent AI or offscreen deaths. |
| A13 | Pending resume exceeds timeout | Offer the specified checkpoint/lobby recovery, not an unexplained fresh run. |
| A14 | Connected flower lobby | Gentle verified native clips; no locomotion/combat/aggro; both characters stay grounded. |
| A15 | Start | Each camera settles behind its own hero; input begins once; no menu click also becomes an attack. |
| A16 | Mic denied in lobby | Joining/playing still works; explain permission only when Commune is requested. |

## B. World and travel

| ID | Situation | Required result |
|---|---|---|
| B01 | Walk the new approach in both directions | Clear route and meaningful sightlines, no generated-image geometry copied literally or long empty detour. |
| B02 | View town/field from player height and alternate angles | Terrain/cottages/flowers make spatial sense; no hidden placement fix that works only for a screenshot. |
| B03 | Inspect every actual house variant | Structural beams do not cross window/door clear interiors; deliberate mullions remain plausible. |
| B04 | Inspect steps, dormers, shutters and side elevations | No new intersection introduced by facade correction. |
| B05 | Seed roaming encounters across repeated runs | Enemies remain in authored pockets, outside lobby and verse-reader exclusion areas; no spawning directly behind a player without warning. |
| B06 | Kill the first encounter before earning E | Base Knight and Mage actions can win with teamwork; no circular unlock dependency. |
| B07 | Cross outer boundary while moving or aiming | Approved wrap works; active aim/cast either cancels coherently or uses its frozen valid origin, never stretches across the entire valley. |
| B08 | Lure an enemy toward safe lobby | Leash/encounter rules prevent combat invading the waiting field. |

## C. Native attack and hold behavior

| ID | Situation | Required result |
|---|---|---|
| C01 | Knight slow tap combo | Full native wind-up/contact/follow-through; one contact per attack. |
| C02 | Rapid clicking before previous contact | No forced animation restart, duplicate hit or skipped combo motion. |
| C03 | Stop mashing | Complete current swing and at most one intentionally buffered follow-up, not an attack backlog. |
| C04 | Knight hold/release | Shield, no charged sword or extra normal attack; no attack while blocking. |
| C05 | Attack from side/back during block | Protection matches agreed facing coverage rather than omnidirectional immunity. |
| C06 | Heavy enemy attack against guard | Readable native wind-up and agreed guard-break effect. |
| C07 | Mage short tap versus hold threshold | Exactly one normal OR one charged intent, never both. |
| C08 | Hold Mage attack continuously past recovery | One Shatterlance only; another requires a fresh press. |
| C09 | Three or more fresh repeated charges | Same understandable charge/recovery rules; no silent fourth-charge normal attack. |
| C10 | Charged wind-up | Stationary/exposed, full animation; damage/VFX occurs at intended marker, not button-down. |
| C11 | Dodge before versus after charged release | Only the documented cancel window applies; no invisible projectile after a pre-release cancel. |
| C12 | Blur, pointercancel, downed or cinematic lock while holding | Release state clears; no stuck shield/mic, ghost cast or attack on return. |
| C13 | Normal attacks with no enemies | No camera shake/FOV pumping, forward teleport or unwanted hop. |
| C14 | Peer plays the action | Same accepted action/seed/schedule; remote code does not forcibly splice a shorter different animation. |
| C15 | Move over uneven ground while attacking | Character grounding and camera follow remain stable independently of weapon motion. |

## D. Directional E targeting

| ID | Situation | Required result |
|---|---|---|
| D01 | Hold E with Frost Lance selected | Physical, terrain-following direction arrow appears; no circle under the enemy. |
| D02 | Move pointer from near to far on same heading | Ice arrow tip stays exactly at configured fixed reach; only heading can change. |
| D03 | Hold E with meteor selected | Same visual language; arrow length changes to measured legal distance. |
| D04 | Set meteor target near, middle and max range | Actual impact centre equals arrow tip in all three cases. Flight time follows actual distance. |
| D05 | Confirm manual aim with a nearer enemy off to the side | No snap; accepted direction/distance remain chosen by the player. |
| D06 | Enemy moves after confirmation | Cast keeps the ground point; it does not home or reacquire. |
| D07 | Tap E with valid enemy ahead | Quick-cast uses nearest eligible forward target while preserving the spell's fixed/variable reach rule. |
| D08 | Tap E with no valid target | Legal forward fallback; no arbitrary turn or attempt to cast through invalid terrain. |
| D09 | Point at sky, own feet, water or forbidden surface | No NaN/direction snap/false-valid cast; documented invalid feedback; no cost consumed. |
| D10 | Rotate camera with stationary cursor while aiming | Arrow recomputes against the correct world surface. |
| D11 | Aim over slope or stairs | No flat-plane hovering/clipping; tip height matches damage/VFX ground height. |
| D12 | Switch element, dodge, cancel or become downed | Arrow clears; no late confirm/cooldown. |
| D13 | Tablet joystick + camera + E hold + ground confirmation | Pointer ownership is independent; no movement finger selecting an impact or confirmation also firing a normal attack. |
| D14 | Desktop pointer-lock enter/exit | Correct release/restore policy; no giant camera jump or forbidden automatic recapture. |
| D15 | Peer receives accepted cast twice | One visual instance per ID; no local authoritative damage or re-targeting. |
| D16 | Damaging meteor before its visible arrival | Test must fail; damage is scheduled to accepted impact. |
| D17 | Arrow on sunlit sand and dense meadow | Contrast readable without red target discs, glassy wash or huge solid obstruction. |
| D18 | Aim inactive | No residual arrow/glyph and zero idle draws. |

## E. Roles, powers, levels and difficulty

| ID | Situation | Required result |
|---|---|---|
| E01 | Knight selects fire/ice without activating | Selection changes; active effect/cooldown does not restart. |
| E02 | Activate E at t=0 with 13/18 seed | Effect expires at t=13; next activation allowed at t=18, not t=31. |
| E03 | Repeated fire hits | Capped refreshable burn; no unbounded stack growth or duplicate network ticks. |
| E04 | Repeated ice hits and level increases | Local enemy slow/damage reduction respects cap/boss floor; other player's controls and clocks do not slow. |
| E05 | Mage casts E during Knight mixed Q | No downgrade/overwrite of stronger blade state. |
| E06 | Q/divine buff expires | Restore only still-valid ordinary blade; clear every related damage multiplier and visual flag. |
| E07 | Attempt removed electricity/four-slot/old shared-Q command | Not reachable through UI or accepted through forged/stale input. |
| E08 | Mage Q channel versus unprotected/protected hit | Agreed lethal exposure applies only to an unprotected hit; shield/ward protection is honoured. |
| E09 | Mage Q cancelled before release | Agreed half-cost seed applies once; no Q effect or later stray release. |
| E10 | Both press their own Q simultaneously | Distinct role-owned accepted actions and costs; no duplicate old couples ultimate. |
| E11 | Knight protects while Mage damages | Shared XP and agreed charge gains recognise useful participation; last hit is not required. |
| E12 | Enemy death packet repeats | No second XP/reward/spawn progression. |
| E13 | Both players fall | Defined checkpoint reset; no double reset, loss of earned discoveries or revival into an active enemy hit. |
| E14 | Fight Sovereign under new roles | Shield phase consistent, telegraphs readable, Q spectacular but not an automatic entire-boss win. |

## F. Verse and prayer rules

| ID | Situation | Required result |
|---|---|---|
| F01 | Read later poem first | Discover it and reveal Commune; do not skip stage order. |
| F02 | Read same poem on both clients/reconnect | Shared discovery once, no duplicated unlock or ceremony. |
| F03 | Valid recording stops at 7,999 ms | Retry only; zero judge request and no spam count. |
| F04 | Valid recording stops at 8,000 ms | Submit once, no Retry. |
| F05 | Recording reaches 15,000 ms | Auto-stop and one submission; another tap cannot submit twice. |
| F06 | Denied/failed/empty recording | Retry/recovery; no smite or offense count. |
| F07 | Permission resolves after cancel | Stop eventual stream immediately; no mic left open. |
| F08 | Recorder final chunk arrives after stop | Hardware tracks already stopped; collect final data without retaining capture. |
| F09 | Both start Commune together | Server chooses one owner; losing client does not record; no restarted/shared overwritten effect. |
| F10 | Partner inspects their network/events | No speaker audio, raw transcript, private summary, solution or provider-key leakage. |
| F11 | Speaker falsely reports low HP or dead partner | Judge context uses authoritative room truth, not caller claims. |
| F12 | Dramatic dying claim while safe | Context-sensitive bounded response; no automatic emergency protection reward. |
| F13 | Simple honest affection while safe | Still eligible for modest meaningful response/progression; emergency is not required for all help. |
| F14 | First incorrect versus correct true-name contact | No spoken reveal before valid contact; protected comparison happens server-side. Public artifacts do not expose the answer. |
| F15 | Ordinary versus exceptional completed prayers | Gameplay feedback can occur each time, speech follows rarity gates, no continuous generated monologue. |
| F16 | Joke/profanity versus deliberate contempt | Judge fixtures distinguish context; a swear word alone does not trigger rude punishment. |
| F17 | Repeated deliberate abuse after clear warnings | Bounded escalation can reach severe/joint punishment; normal downed/checkpoint rules still work. |
| F18 | Model times out or returns malformed/forbidden reward | Safe failure and ceremony release; no fallback punishment, arbitrary spell or forged health delta. |
| F19 | HTTP result arrives before/after WS result | Same invocation settles once with one voice/effect/reward. |
| F20 | Cancel/reset/disconnect while judging | Late result cannot mutate a new run or reopen a cancelled ceremony. |
| F21 | Emergency invocation repeatedly tapped/cancelled | No indefinite protection/refresh exploit; technical failures are distinguished from intentional repeated starts. |
| F22 | Partner far away | No artificial distance denial; protection at speaker, healing at recipient, no teleport or peer camera takeover. |
| F23 | Unlock while receiver holds attack/dodge | Inputs disabled through ceremony, cleared on exit; no stored burst of actions on landing. |
| F24 | Receiver animation/effect fails | Controls recover deterministically, partner remains playable and unlock applies at most once. |

## G. Visual, audio and deployment gates

- [ ] Current player-height PNGs cover field, path, all houses, town, pond and shrine at both target layouts.
- [ ] Current video covers full sword cycles, rapid mashing, block, Shatterlance, both aim modes, near/max meteor impacts and non-bouncing ice growth.
- [ ] Current video distinguishes simple heal, first unlock and emergency miracle; no shared identical spectacle for all three.
- [ ] Screenshot arrows and timing overlays are QA-only. No red under-enemy circle, ordinary overhead red bar or debug controls leak into play.
- [ ] Blind critic receives raw current evidence and neutral task instructions, not this flaw list, previous reports or code. Required skill loaded before critique; PNGs before source; fresh critic each round.
- [ ] Tablet thumb reach, minimum target size, labels in daylight, portrait/browser resizes and actual audio/Bluetooth behavior are physically checked.
- [ ] Voice intelligible in mono tablet speakers and headphones; width/tail does not obscure dialogue or gameplay warnings.
- [ ] Complete scene meets the project's draw/triangle targets and recorded actual-device frame-time gates; saved historical reports and software-WebGL warnings are not performance proof.
- [ ] Static deployment allowlist excludes repository/private configuration and includes required character assets legitimately.
- [ ] Production Worker implements room, verse and commune APIs rather than merely relaying events or falling through to static HTML.
- [ ] Two real devices can join through HTTPS, start together, aim at the same accepted points, pray privately and reconnect without role/progression loss.
- [ ] Evidence links, source revision, device/profile and remaining limits are recorded before final sign-off.

## Evidence record template

For each completed scenario record: scenario ID, source commit, local/production environment, device/profile, input sequence, expected outcome, observed outcome, relevant accepted event IDs, image/video path and pass/fail. Redact tokens, audio/transcripts, protected name/solutions and provider responses. Store public visual evidence separately from protected content fixtures.

The planner has inspected source and rough references; none of the future scenarios above is marked passed by the planning task itself.
