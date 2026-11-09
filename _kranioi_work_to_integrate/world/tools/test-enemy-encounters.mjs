// Pure-logic tests for the 2026-11-09 combat encounter design (contact frames, parry, poise,
// crowd limiter, stride matching, boss phases, minion reassembly). Run: node world/tools/test-enemy-encounters.mjs
import assert from 'node:assert/strict';
import {
  ENEMY_ATTACKS,
  ENEMY_ARCHETYPES,
  ACT_DEFINITIONS,
  WINDUP_LEAD,
  PARRY_WINDOW,
  MINION_REASSEMBLE_SECONDS,
  attackTimeline,
  advanceAttackClip,
  isParryTiming,
  isInAttackArc,
  initPoise,
  applyPoiseDamage,
  tickPoise,
  resolvePreHit,
  resolvePostHit,
  canStartWindup,
  recordWindup,
  allocateAttackTokens,
  strideTimeScale,
  bossPhaseFor,
  selectBossAttack,
  tickBonePile,
  isPileFinisher,
  selectHuntTarget,
} from '../src/combat/combat-balance.js';

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}
const near = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} != ${b}`);

check('1. Contact frame lands exactly when clip time crosses contactFrac after the slowed windup', () => {
  const atk = ENEMY_ATTACKS.warrior_chop; // contact 0.45, slow 0.45
  const dur = 1.067;
  const tl = attackTimeline(atk, dur);
  const slowEnd = 0.45 * dur - WINDUP_LEAD;
  near(tl.windupEnd, slowEnd / 0.45, 1e-9, 'windupEnd');
  near(tl.contactTimes[0], tl.windupEnd + WINDUP_LEAD, 1e-9, 'contact');
  // Step the clock at 60 Hz and record the real time the contact is crossed.
  let clipT = 0;
  let t = 0;
  let hitAt = null;
  const dt = 1 / 60;
  while (t < tl.clipEnd + 0.1) {
    const r = advanceAttackClip(atk, dur, clipT, dt);
    t += dt;
    if (r.crossed.length && hitAt === null) hitAt = t;
    if (clipT < slowEnd - 1e-9) assert.ok(r.timeScale <= 0.45 + 1e-9 || r.clipT >= slowEnd);
    clipT = r.clipT;
  }
  assert.ok(hitAt !== null, 'contact crossed');
  assert.ok(Math.abs(hitAt - tl.contactTimes[0]) <= dt + 1e-9, `hit at ${hitAt} vs ${tl.contactTimes[0]}`);
  // Damage never resolves during the windup segment.
  const early = advanceAttackClip(atk, dur, 0, tl.windupEnd * 0.99);
  assert.equal(early.crossed.length, 0);
  // Windup is genuinely slowed: anticipation lasts longer than the native clip segment.
  assert.ok(tl.contactTimes[0] > 0.45 * dur * 1.5);
});

check('2. Multi-contact flurry resolves each contact once; speedMult shortens the timeline', () => {
  const atk = ENEMY_ATTACKS.boss_combo;
  const dur = 1.6;
  let clipT = 0;
  const hits = [];
  for (let i = 0; i < 400; i++) {
    const r = advanceAttackClip(atk, dur, clipT, 1 / 60);
    hits.push(...r.crossed);
    clipT = r.clipT;
  }
  assert.deepEqual(hits, [0, 1, 2]);
  const slow = attackTimeline(atk, dur, 1.0);
  const fast = attackTimeline(atk, dur, 1.25);
  assert.ok(fast.contactTimes[0] < slow.contactTimes[0]);
  near(fast.clipEnd * 1.25, slow.clipEnd, 1e-9, 'P3 speed scales whole clip');
});

check('3. Parry window is ±0.15 s around the contact frame', () => {
  assert.equal(PARRY_WINDOW, 0.15);
  assert.ok(isParryTiming(9.9, 10.0));
  assert.ok(isParryTiming(10.15, 10.0));
  assert.ok(isParryTiming(9.85, 10.0));
  assert.ok(!isParryTiming(9.8, 10.0));
  assert.ok(!isParryTiming(10.2, 10.0));
  assert.ok(!isParryTiming(NaN, 10.0));
});

check('4. Poise: elites stagger only when poise breaks, then refill and regen after delay', () => {
  const elite = initPoise({ isElite: true, aiState: 'orbit' }, 70);
  assert.equal(resolvePostHit(elite, { source: 'combo1' }, 30), 'none');
  assert.equal(resolvePostHit(elite, { source: 'combo2' }, 30), 'none');
  assert.equal(resolvePostHit(elite, { source: 'combo3' }, 30), 'stagger');
  assert.equal(elite.poise, 70);
  applyPoiseDamage(elite, 50);
  tickPoise(elite, 1.0);
  assert.equal(elite.poise, 20, 'no regen during delay');
  tickPoise(elite, 1.5); // 1.0 s of delay left, then 0.5 s regen
  assert.ok(elite.poise > 20 && elite.poise < 70);
  // Heavy hits deal 1.8x poise damage.
  const e2 = initPoise({ isElite: true, aiState: 'orbit' }, 70);
  assert.equal(resolvePostHit(e2, { source: 'heavy' }, 40), 'stagger');
});

check('5. Trash: light hit before contact interrupts; after contact it does not; uninterruptible attacks ignore', () => {
  const trash = { aiState: 'windup', attack: { atk: ENEMY_ATTACKS.minion_punch, contactIdx: 0 } };
  assert.equal(resolvePostHit(trash, { source: 'combo1' }, 12), 'interrupt');
  trash.attack.contactIdx = 1;
  assert.equal(resolvePostHit(trash, { source: 'combo1' }, 12), 'none');
  const jumper = { aiState: 'windup', attack: { atk: ENEMY_ATTACKS.rogue_jump_chop, contactIdx: 0 } };
  assert.equal(resolvePostHit(jumper, { source: 'combo1' }, 12), 'none');
  assert.equal(resolvePostHit({ aiState: 'orbit' }, { source: 'combo1' }, 12), 'flinch');
  // Skeleton Mage eruption: one hit interrupts even an elite caster.
  const caster = initPoise({ isElite: true, aiState: 'windup', attack: { atk: ENEMY_ATTACKS.mage_eruption, contactIdx: 0 } }, 999);
  assert.equal(resolvePostHit(caster, { source: 'combo1' }, 5), 'interrupt');
});

check('6. Shield wall: front hits blocked; Shatterlance pierces; Knight heavy guard-breaks; flank hits land', () => {
  const w = { shieldUp: true, x: 0, z: 0, yaw: 0, aiState: 'orbit' }; // facing +Z
  assert.equal(resolvePreHit(w, { source: 'combo1', attackerPos: { x: 0, z: 2 } }), 'blocked');
  assert.equal(resolvePreHit(w, { source: 'shatterlance', spellId: 'shatterlance', attackerPos: { x: 0, z: 3 } }), 'pierce');
  assert.equal(resolvePreHit(w, { source: 'heavy', attackerPos: { x: 0, z: 2 } }), 'guardbreak');
  assert.equal(resolvePreHit(w, { source: 'combo1', attackerPos: { x: 0, z: -2 } }), 'hit');
  // Rogue sidesteps Mage bolts on cooldown only.
  const r = { hunter: true, aiState: 'orbit', dodgeCooldown: 0 };
  assert.equal(resolvePreHit(r, { source: 'mage_attack1' }), 'dodge');
  r.dodgeCooldown = 2;
  assert.equal(resolvePreHit(r, { source: 'mage_attack1' }), 'hit');
});

check('7. Crowd: max 3 tokens; at most 2 windups per hero within 0.4 s; ineligible states hold no token', () => {
  const es = Array.from({ length: 6 }, (_, i) => ({ id: i, hp: 50, active: true, distToTarget: i }));
  es[0].tokenIneligible = true; // dormant
  const holders = allocateAttackTokens(es, 3);
  assert.equal(holders.length, 3);
  assert.equal(es[0].hasAttackToken, false);
  const log = [];
  assert.ok(canStartWindup(log, 'Knight', 0));
  recordWindup(log, 'Knight', 0);
  recordWindup(log, 'Knight', 0.1);
  assert.ok(!canStartWindup(log, 'Knight', 0.3));
  assert.ok(canStartWindup(log, 'Mage', 0.3), 'per-hero limit');
  assert.ok(canStartWindup(log, 'Knight', 0.41));
  recordWindup(log, 'Knight', 0.45);
  assert.equal(log.length, 2, 'entry at t=0 pruned, t=0.1 kept');
});

check('8. Stride-matched locomotion timeScale = ground speed / native stride', () => {
  near(strideTimeScale('Running_A', 4.2), 1.0);
  near(strideTimeScale('Walking_A', 0.75), 0.5);
  near(strideTimeScale('Running_Strafe_Left', 1.8), 0.5);
  near(strideTimeScale('Running_A', 4.2, { scale: 1.18 }), 4.2 / (4.2 * 1.18));
  near(strideTimeScale('Running_A', 4.6, { rig: 'large' }), 1.0);
  assert.equal(strideTimeScale('Running_A', 50), 2.2, 'clamped');
  assert.equal(strideTimeScale('Idle_A', 3), 1.0, 'non-locomotion clips untouched');
});

check('9. Boss phases: P1 > 50%, P2 Aegis phase, P3 <= 33% adds Unarmed Smash', () => {
  assert.equal(bossPhaseFor(1.0), 'p1');
  assert.equal(bossPhaseFor(0.51), 'p1');
  assert.equal(bossPhaseFor(0.5), 'p2');
  assert.equal(bossPhaseFor(0.6, true), 'p2');
  assert.equal(bossPhaseFor(0.33), 'p3');
  const p3 = new Set();
  for (let i = 0; i < 20; i++) p3.add(selectBossAttack('p3', i / 20));
  assert.ok(p3.has('boss_smash'));
  for (let i = 0; i < 20; i++) assert.notEqual(selectBossAttack('p1', i / 20), 'boss_smash');
  assert.notEqual(selectBossAttack('p1', 0, 'boss_2h'), 'boss_2h', 'no immediate repeat');
  assert.equal(ENEMY_ARCHETYPES.boss_sovereign.charId, 'Skeleton_Golem');
});

check('10. Minion bone pile reassembles after 6 s unless frozen/destroyed; only detonations/spells finish it', () => {
  assert.equal(MINION_REASSEMBLE_SECONDS, 6.0);
  const pile = { pileTimer: MINION_REASSEMBLE_SECONDS };
  assert.equal(tickBonePile(pile, 5.9), 'pile');
  assert.equal(tickBonePile(pile, 0.2), 'reassemble');
  const frozen = { pileTimer: 0.1, pileFrozen: true };
  assert.equal(tickBonePile(frozen, 1.0), 'held');
  assert.ok(isPileFinisher({ source: 'combo1' }, { detonation: { id: 'shatterblow' } }));
  assert.ok(isPileFinisher({ source: 'cinder_fall', spellId: 'cinder_fall' }));
  assert.ok(isPileFinisher({ source: 'mage_attack1' }));
  assert.ok(!isPileFinisher({ source: 'combo2' }));
});

check('11. Rogue hunts the exposed Mage (>6 m from Knight), else nearest; melee arc test', () => {
  const rogue = { x: 0, z: 0 };
  const knight = { x: 1, z: 0 };
  assert.equal(selectHuntTarget(rogue, knight, { x: 9, z: 0 }).x, 9);
  assert.equal(selectHuntTarget(rogue, knight, { x: 4, z: 0 }).x, 1);
  assert.equal(selectHuntTarget(rogue, { ...knight, downed: true }, { x: 4, z: 0 }).x, 4);
  assert.ok(isInAttackArc({ x: 0, z: 0 }, 0, { x: 0, z: 2 }, 2.4, 70));
  assert.ok(!isInAttackArc({ x: 0, z: 0 }, 0, { x: 2, z: 0.2 }, 2.4, 70));
  assert.ok(!isInAttackArc({ x: 0, z: 0 }, 0, { x: 0, z: 3 }, 2.4, 70));
});

check('12. Act layouts follow the spec (Act 1 minions -> shield wall, Act 2 hunters + Mage, Act 3 ambush -> elites -> Golem)', () => {
  const a1 = ACT_DEFINITIONS.act1_arena.waves;
  assert.ok(a1[0].spawns.every((s) => s.archetype === 'minion'));
  assert.equal(a1[1].spawns.filter((s) => s.archetype === 'warrior').length, 2);
  const a2 = ACT_DEFINITIONS.act2_plaza.waves[0].spawns;
  assert.ok(a2.filter((s) => s.archetype === 'rogue').length >= 2 && a2.some((s) => s.archetype === 'mage'));
  const a3 = ACT_DEFINITIONS.act3_shrine.waves;
  assert.ok(a3[0].spawns.every((s) => s.dormant));
  assert.ok(a3[1].spawns.some((s) => s.archetype === 'captain') && a3[1].spawns.some((s) => s.archetype === 'necromancer'));
  assert.equal(a3[a3.length - 1].spawns[0].archetype, 'boss_sovereign');
  for (const id of Object.keys(ENEMY_ARCHETYPES)) {
    for (const atkId of ENEMY_ARCHETYPES[id].attacks || []) assert.ok(ENEMY_ATTACKS[atkId], `${id}:${atkId}`);
  }
});

console.log(`\n${passed} PASSED, ${failed} FAILED (enemy encounter logic)`);
if (failed) process.exit(1);
