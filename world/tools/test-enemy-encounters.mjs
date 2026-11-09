// Pure-logic tests for the 2026-11-09 combat encounter design (contact frames, parry, poise,
// crowd limiter, stride matching, boss phases, minion reassembly). Run: node world/tools/test-enemy-encounters.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEnemyManager } from '../src/combat/enemy-manager.js';
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
  inKnightFrontArc,
  canScheduleContacts,
  scheduleContacts,
  registerMashHit,
  SHIELD_BASH_AFTER_BLOCKS,
  MAX_ATTACK_TOKENS,
  MASH_WINDOW,
  MASH_ELITE_EXTRA_HITS,
  CONTACT_OVERLAP_WINDOW,
  CONTACT_BEAT_GAP,
  MAX_OVERLAPPING_CONTACTS,
  PARRY_POISE_FRACTION,
  knightShieldCovers,
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
  assert.ok(a1[0].spawns.some((s) => s.archetype === 'minion') && a1[0].spawns.some((s) => s.archetype === 'warrior'));
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

// --- Phase 3: pincer, mash counter, hunter, contact fairness, manager parry ------------------------
const knightFacingEast = { id: 'Knight', x: 0, z: 0, yaw: Math.PI / 2, shieldBlocking: true };
const foe = (id, x, z, extra = {}) => ({ id, x, z, hp: 50, active: true, aiState: 'orbit', targetHeroId: 'Knight', distToTarget: Math.hypot(x, z), ...extra });

check('13. Pincer: Knight blocking one front enemy -> <=3 tokens and one goes outside his front arc', () => {
  const front = [foe('f1', 2, 0), foe('f2', 2.2, 1.0)];
  const flank = [foe('b1', -2.5, 0.3), foe('b2', 0.2, -2.5)];
  const all = [...front, ...flank];
  const holders = allocateAttackTokens(all, MAX_ATTACK_TOKENS, { knight: knightFacingEast });
  assert.ok(holders.length >= 1 && holders.length <= MAX_ATTACK_TOKENS, `holders=${holders.length}`);
  assert.equal(all.filter((e) => e.hasAttackToken).length, holders.length);
  assert.ok(front.every((e) => inKnightFrontArc(knightFacingEast, e)));
  assert.ok(flank.every((e) => !inKnightFrontArc(knightFacingEast, e)));
  assert.ok(holders.some((e) => inKnightFrontArc(knightFacingEast, e)), 'a front attacker holds a token');
  assert.ok(holders.some((e) => !inKnightFrontArc(knightFacingEast, e)), 'a flanker holds a token');
  // Even when the flanker is farther than every front enemy, the pincer partner still gets a token.
  const far = [foe('f1', 2, 0), foe('f2', 2.2, 1), foe('b1', -6, 0.3)];
  const h2 = allocateAttackTokens(far, MAX_ATTACK_TOKENS, { knight: knightFacingEast });
  assert.ok(h2.length <= MAX_ATTACK_TOKENS && h2.some((e) => e.id === 'b1'));
});

check('14. Mash counter: rapid guarded hits within MASH_WINDOW arm it; spaced hits never do', () => {
  const wall = { shieldWall: true };
  assert.equal(registerMashHit(wall, 10.0), false);
  assert.equal(registerMashHit(wall, 10.0 + MASH_WINDOW * 0.3), false);
  assert.equal(registerMashHit(wall, 10.0 + MASH_WINDOW * 0.6), true, `${SHIELD_BASH_AFTER_BLOCKS} rapid hits arm the counter`);
  assert.equal(wall.mashHits, 0, 'counter resets after firing');
  const slow = { shieldWall: true };
  for (let i = 0; i < 6; i++) assert.equal(registerMashHit(slow, i * (MASH_WINDOW + 0.3)), false, `spaced hit ${i}`);
  // Unguarded elites need MASH_ELITE_EXTRA_HITS more.
  const elite = {};
  const lastIdx = SHIELD_BASH_AFTER_BLOCKS + MASH_ELITE_EXTRA_HITS - 1;
  for (let i = 0; i < lastIdx; i++) assert.equal(registerMashHit(elite, i * 0.4), false);
  assert.equal(registerMashHit(elite, lastIdx * 0.4), true);
});

check('15. Hunter retargets the Mage when exposed (>6 m); shield covers her only inside radius and front arc', () => {
  const rogue = { x: 4, z: 0 };
  const knight = { ...knightFacingEast, shieldBlocking: false };
  const mageNear = { id: 'Mage', x: -1.5, z: 0 };
  const mageFar = { id: 'Mage', x: -8, z: 0 };
  assert.equal(selectHuntTarget(rogue, knight, mageFar), mageFar, 'exposed Mage is hunted');
  assert.equal(selectHuntTarget(rogue, knight, mageNear), knight, 'sheltered Mage: nearest hero is the Knight');
  assert.equal(knightShieldCovers(knight, { id: 'Mage', x: -2, z: 0 }, rogue), false, 'shield down covers nobody');
  const up = { ...knight, shieldBlocking: true };
  const mageBehind = { id: 'Mage', x: -2, z: 0 };
  assert.equal(knightShieldCovers(up, mageBehind, rogue), true, 'front attacker is blocked');
  assert.equal(knightShieldCovers(up, mageBehind, { x: -3, z: 3 }), false, 'flanker slips past the arc');
  assert.equal(knightShieldCovers(up, mageFar, rogue), false, 'out of cover radius');
});

check('16. Contact fairness: third contact inside CONTACT_OVERLAP_WINDOW and any within CONTACT_BEAT_GAP are rejected', () => {
  assert.equal(MAX_OVERLAPPING_CONTACTS, 2);
  const log = [];
  scheduleContacts(log, 'Knight', 'a', [5.0], 4.0);
  assert.equal(canScheduleContacts(log, 'Knight', 'b', [5.0 + CONTACT_BEAT_GAP * 0.5]), false, 'closer than the beat gap');
  assert.equal(canScheduleContacts(log, 'Knight', 'b', [5.0 - CONTACT_BEAT_GAP * 0.9]), false);
  assert.equal(canScheduleContacts(log, 'Knight', 'b', [5.0 + CONTACT_BEAT_GAP + 0.01]), true, 'second contact on a beat is fine');
  scheduleContacts(log, 'Knight', 'b', [5.0 + CONTACT_BEAT_GAP + 0.01], 4.0);
  // Beat gap and overlap cap work together: a third contact can never squeeze in beside the pair.
  const third = 5.0 + CONTACT_BEAT_GAP + 0.01 + CONTACT_BEAT_GAP * 0.5;
  assert.equal(canScheduleContacts(log, 'Knight', 'c', [third]), false, 'third contact crowding the pair');
  assert.equal(canScheduleContacts(log, 'Knight', 'c', [5.0 + 2 * CONTACT_BEAT_GAP + 0.05]), true, 'a full beat after the pair');
  assert.equal(canScheduleContacts(log, 'Mage', 'c', [5.0]), true, 'other hero is independent');
  assert.equal(canScheduleContacts(log, 'Knight', 'a', [5.0]), true, 'owner may reschedule itself');
});

const mockKit = {
  async loadAnimationPacks() {},
  async createCharacter(charId) {
    const group = new THREE.Group();
    const modelRoot = new THREE.Group();
    group.add(modelRoot);
    let currentKey = 'idle';
    return {
      id: charId,
      group,
      modelRoot,
      mixer: { timeScale: 1.0 },
      anim: {
        get currentKey() {
          return currentKey;
        },
      },
      play(key) {
        currentKey = key;
      },
      poseAt(key) {
        currentKey = key;
      },
      update() {},
    };
  },
};
async function makeManager() {
  const hits = [];
  const em = await createEnemyManager({
    scene: new THREE.Scene(),
    kit: mockKit,
    walkableHeightAt: () => 0.6,
    resolveCollisions: (x, z) => ({ x, z, wrapped: false }),
    onPlayerHit: (h, e, dmg) => hits.push({ hero: h.id, dmg }),
  });
  return { em, hits };
}
const heroPair = (blocking, mageX = -3) => ({
  Knight: { id: 'Knight', x: 0, y: 0.6, z: 0, yaw: Math.PI / 2, shieldBlocking: blocking },
  Mage: { id: 'Mage', x: mageX, y: 0.6, z: 0, yaw: 0 },
});

// One warrior swings at the Knight; he raises his shield `blockLead` s before the contact frame.
async function parryScenario(blockLead) {
  const { em, hits } = await makeManager();
  em.spawnWave({ id: 'parry', spawns: [{ archetype: 'warrior', x: 2, z: 0 }] }, 'act1_arena');
  const e = em.activeEnemies[0];
  initPoise(e, 100);
  let parried = 0;
  em.setOnParry(() => parried++);
  let blocked = false;
  let resolved = false;
  for (let i = 0; i < 1200 && !resolved; i++) {
    const a = e.attack;
    if (a && !blocked && a.tl.contactTimes[0] - a.t <= blockLead) {
      em.notifyKnightBlock(true);
      blocked = true;
    }
    em.update(1 / 60, heroPair(blocked));
    resolved = blocked && (e.aiState === 'stagger' || e.aiState === 'recover' || (e.attack && e.attack.contactIdx > 0));
  }
  assert.ok(resolved, 'attack resolved');
  return { e, hits, parried };
}

const parryOn = await parryScenario(0.1);
check('17. Parry: Knight block 0.1 s before contact staggers the attacker, removes poise, deals no damage', () => {
  assert.equal(parryOn.parried, 1);
  assert.equal(parryOn.e.aiState, 'stagger');
  near(parryOn.e.poise, 100 * (1 - PARRY_POISE_FRACTION), 1e-6, 'poise');
  assert.equal(parryOn.hits.length, 0, 'parried contact deals no damage');
});

const parryEarly = await parryScenario(0.3);
check('18. Parry: a block raised 0.3 s early is outside the +-0.15 s window (no stagger, hit resolves)', () => {
  assert.equal(parryEarly.parried, 0);
  assert.notEqual(parryEarly.e.aiState, 'stagger');
  assert.equal(parryEarly.e.poise, 100);
  assert.ok(parryEarly.hits.some((h) => h.hero === 'Knight'), 'the swing connects with the Knight');
});

check('19. Act 1 wave 2 mixes a shield-wall archetype with a hunter archetype', () => {
  const spawns = ACT_DEFINITIONS.act1_arena.waves[1].spawns;
  const defOf = (s) => ENEMY_ARCHETYPES[s.archetype] || ENEMY_ARCHETYPES[`skeleton_${s.archetype}`];
  assert.ok(spawns.some((s) => defOf(s)?.shieldWall), 'shield wall present');
  assert.ok(spawns.some((s) => defOf(s)?.hunter), 'hunter present');
});

async function hunterRun(mageX) {
  const { em } = await makeManager();
  em.spawnWave({ id: 'hunt', spawns: [{ archetype: 'rogue', x: 5, z: 0 }] }, 'act1_arena');
  const e = em.activeEnemies[0];
  const targets = new Set();
  let everShielded = false;
  let attackedWhileShielded = false;
  for (let i = 0; i < 240; i++) {
    em.update(1 / 60, heroPair(true, mageX));
    targets.add(e.targetHeroId);
    if (e.mageShielded) {
      everShielded = true;
      if (e.attack && e.attack.targetHeroId === 'Mage') attackedWhileShielded = true;
    }
  }
  return { e, targets, everShielded, attackedWhileShielded };
}
const hunterCovered = await hunterRun(-2);
const hunterExposed = await hunterRun(-9);
check('20. Manager hunter: shield-covered Mage is probed around the arc, exposed Mage (>6 m) is targeted directly', () => {
  assert.equal(hunterCovered.everShielded, true, 'Knight shield covers the Mage from the front');
  assert.ok(hunterCovered.e.huntFlankSign, 'covered: hunter circles for an angle instead of charging');
  assert.equal(hunterCovered.attackedWhileShielded, false, 'no attack committed into the shield');
  assert.equal(hunterExposed.everShielded, false, 'exposed Mage is never covered');
  assert.ok(hunterExposed.targets.has('Mage') && hunterExposed.e.targetHeroId === 'Mage', 'exposed Mage becomes the target');
  assert.ok(!hunterExposed.e.huntFlankSign, 'no probe needed');
});

console.log(`\n${passed} PASSED, ${failed} FAILED (enemy encounter logic)`);
if (failed) process.exit(1);
