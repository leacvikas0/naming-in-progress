#!/usr/bin/env node
// ============================================================================
// world/tools/test-combat-sim.mjs
//
// Automated Node.js Unit & Full 3-Act Campaign Simulation Verification Suite
// for Haru-machi Stage 4 & 5 Combat, Pooled Enemy AI & Synergy Detonations.
// ============================================================================

import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  HERO_STATS,
  BREATHING_STYLES,
  SPELLS,
  DETONATIONS,
  ENEMY_ARCHETYPES,
  ACT_DEFINITIONS,
  ACT_SEQUENCE,
  MAX_CONCURRENT_ENEMIES,
  MAX_ATTACK_TOKENS,
  resolveShrineObstacles,
  selectSoftLockTarget,
  allocateAttackTokens,
  applyHitAndResolveDetonation,
  createHeadlessCampaignSim,
} from '../src/combat/combat-balance.js';
import { createCampaignLoop } from '../src/combat/campaign-loop.js';
import { createCombatSfx } from '../src/combat/combat-sfx.js';

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('=== Haru-machi Stage 5 Combat & 3-Act Campaign Simulation Tests ===');

/* ------------------------------------------------------------------------- */
/* 1. Balance Constants & Geography Coordinate Verification                  */
/* ------------------------------------------------------------------------- */

check('1. HERO_STATS, SPELLS & DETONATIONS match exact spec tables', () => {
  assert.equal(HERO_STATS.Knight.maxHp, 220);
  assert.deepEqual(HERO_STATS.Knight.comboDmg, [22, 26, 38]);
  assert.equal(HERO_STATS.Knight.heavyDmg, 56);
  assert.equal(HERO_STATS.Knight.interceptDmg, 34);
  assert.equal(HERO_STATS.Knight.interceptShield, 35);
  assert.equal(HERO_STATS.Knight.infusedMult, 1.35);

  assert.equal(HERO_STATS.Mage.maxHp, 180);
  assert.deepEqual(HERO_STATS.Mage.boltDmg, [18, 22, 30]);
  assert.equal(HERO_STATS.Mage.infuseHeal, 45);
  assert.equal(HERO_STATS.Mage.infuseDuration, 12.0);

  assert.equal(SPELLS.frost_lance.dmg, 42);
  assert.equal(SPELLS.frost_lance.mark, 'rime');
  assert.equal(SPELLS.shatterlance.dmg, 58);
  assert.equal(SPELLS.shatterlance.detonatesMark, true);
  assert.equal(SPELLS.cinder_fall.dmg, 54);
  assert.equal(SPELLS.cinder_fall.mark, 'solar');
  assert.equal(SPELLS.storm_lance.dmg, 46);
  assert.equal(SPELLS.storm_lance.mark, 'tempest');
  assert.equal(SPELLS.storm_lance.chainCount, 3);

  assert.equal(DETONATIONS.shatterblow.bonusDmg, 65);
  assert.equal(DETONATIONS.shatterblow.stun, 1.4);
  assert.equal(DETONATIONS.solar_flare.bonusDmg, 70);
  assert.equal(DETONATIONS.solar_flare.launchVy, 7.5);
  assert.equal(DETONATIONS.thunderchain.bonusDmg, 60);
  assert.equal(DETONATIONS.thunderchain.pullStrength, 5.0);
});

check('2. ACT_DEFINITIONS match exact geography.js coordinates & obstacle clearances', () => {
  // Act I: East Wisteria Combat Ring at (68.0, -4.0), r = 6.0..15.0m (inside fenceR = 19.5m)
  const act1 = ACT_DEFINITIONS.act1_arena;
  assert.equal(act1.center.x, 68.0);
  assert.equal(act1.center.z, -4.0);
  assert.equal(act1.triggerRadius, 18.0);
  assert.equal(act1.spawnRadiusMin, 6.0);
  assert.equal(act1.spawnRadiusMax, 15.0);
  assert.equal(act1.tod, 'day');
  assert.equal(act1.waves[0].spawns.length, 4);
  assert.equal(act1.waves[1].spawns.length, 6);

  for (const w of act1.waves) {
    for (const sp of w.spawns) {
      const d = Math.hypot(sp.x - act1.center.x, sp.z - act1.center.z);
      assert.ok(
        d >= act1.spawnRadiusMin && d <= act1.spawnRadiusMax,
        `Act 1 spawn (${sp.x}, ${sp.z}) dist ${d.toFixed(2)}m must be in [6.0, 15.0]m`
      );
    }
  }

  // Interlude: West Millpond Pier Sanctuary Brazier at (-42.0, 8.5)
  const pier = ACT_DEFINITIONS.interlude_pier;
  assert.equal(pier.center.x, -42.0);
  assert.equal(pier.center.z, 8.5);
  assert.equal(pier.triggerRadius, 4.8);
  assert.equal(pier.tod, 'evening');
  assert.equal(pier.sanctuaryReward.empoweredBreathing, true);
  assert.equal(pier.sanctuaryReward.resonanceGain, 50);

  // Act II: Twilight Hamlet Plaza Defense at (0.0, 0.0), cobble ring road r = 9.5..12.5m
  const act2 = ACT_DEFINITIONS.act2_plaza;
  assert.equal(act2.center.x, 0.0);
  assert.equal(act2.center.z, 0.0);
  assert.equal(act2.triggerRadius, 15.0);
  assert.equal(act2.spawnRadiusMin, 9.5);
  assert.equal(act2.spawnRadiusMax, 12.5);
  assert.equal(act2.tod, 'evening');
  assert.equal(act2.waves[0].spawns.length, 6);
  for (const sp of act2.waves[0].spawns) {
    const r = Math.hypot(sp.x, sp.z);
    assert.ok(
      r >= act2.spawnRadiusMin && r <= act2.spawnRadiusMax,
      `Act 2 spawn (${sp.x}, ${sp.z}) r=${r.toFixed(2)}m must be on ring road [9.5, 12.5]m`
    );
  }

  // Act III: Starlit North Shrine Boss Duel at (0.0, -85.5), arenaRadius <= 12.8m
  const act3 = ACT_DEFINITIONS.act3_shrine;
  assert.equal(act3.center.x, 0.0);
  assert.equal(act3.center.z, -85.5);
  assert.equal(act3.triggerRadius, 14.0);
  assert.equal(act3.arenaRadius, 12.8);
  assert.equal(act3.tod, 'night');
  assert.equal(ENEMY_ARCHETYPES.boss_sovereign.maxHp, 1400);

  for (const sp of act3.waves[0].spawns) {
    const dArena = Math.hypot(sp.x - act3.center.x, sp.z - act3.center.z);
    assert.ok(dArena <= act3.arenaRadius, `Shrine spawn must be inside arenaRadius 12.8m`);
    const dPedestal = Math.hypot(sp.x - -5.8, sp.z - -87.8);
    assert.ok(dPedestal > 1.6 + 0.6, `Shrine spawn must avoid pedestal (-5.8, -87.8, r=1.6)`);
    const dPlanterW = Math.hypot(sp.x - -10.6, sp.z - -90.8);
    const dPlanterE = Math.hypot(sp.x - 10.6, sp.z - -90.8);
    assert.ok(dPlanterW > 2.6 + 0.6 && dPlanterE > 2.6 + 0.6, `Shrine spawn must avoid planters`);
  }

  // Verify resolveShrineObstacles pushes any point inside pedestal (-5.8, -87.8) out cleanly
  const pushed = resolveShrineObstacles(-5.8, -87.8, 0.6, true);
  assert.ok(Math.hypot(pushed.x - -5.8, pushed.z - -87.8) >= 2.19);
});

/* ------------------------------------------------------------------------- */
/* 2. Soft-Lock Cone Acquisition & 3-Attacker Token Cap                      */
/* ------------------------------------------------------------------------- */

check('3. selectSoftLockTarget acquires priority enemy in 75° forward cone or partner threat fallback', () => {
  const origin = { x: 0, z: 0 };
  const forwardYaw = 0; // Facing +Z
  const enemies = [
    { id: 'behind', x: 0, z: -12, hp: 100, dead: false, active: true },
    { id: 'in_cone_far', x: 1.5, z: 14, hp: 100, dead: false, active: true },
    { id: 'in_cone_marked', x: 1.0, z: 9, hp: 100, dead: false, active: true, mark: 'rime' },
  ];

  const picked = selectSoftLockTarget(origin, forwardYaw, enemies);
  assert.ok(picked);
  assert.equal(picked.id, 'in_cone_marked');

  // Partner threat fallback when no enemy is inside the forward cone
  const onlyBehindNearPartner = [
    { id: 'flanker', x: 1.5, z: -4.5, hp: 100, dead: false, active: true, aiState: 'windup' },
  ];
  const fallback = selectSoftLockTarget(origin, forwardYaw, onlyBehindNearPartner, {
    partnerPos: { x: 1.0, z: -3.5 },
  });
  assert.ok(fallback);
  assert.equal(fallback.id, 'flanker');
});

check('4. allocateAttackTokens strictly caps concurrent attackers at <= 3 and revokes stunned tokens', () => {
  const enemies = [
    { id: 'e1', hp: 100, dead: false, active: true, distToTarget: 3.0, aiState: 'windup' },
    { id: 'e2', hp: 100, dead: false, active: true, distToTarget: 4.0, isBoss: true },
    { id: 'e3', hp: 100, dead: false, active: true, distToTarget: 2.5 },
    { id: 'e4', hp: 100, dead: false, active: true, distToTarget: 5.0 },
    { id: 'e5', hp: 100, dead: false, active: true, distToTarget: 6.0 },
  ];

  const holders = allocateAttackTokens(enemies, MAX_ATTACK_TOKENS);
  assert.equal(holders.length, 3);
  assert.equal(enemies.filter((e) => e.hasAttackToken).length, 3);

  // Stun e1 and e2 -> tokens must reallocate to e3, e4, e5 (still <= 3)
  enemies[0].stunTimer = 1.4;
  enemies[1].stunTimer = 1.1;
  const nextHolders = allocateAttackTokens(enemies, MAX_ATTACK_TOKENS);
  assert.equal(nextHolders.length, 3);
  assert.equal(enemies[0].hasAttackToken, false);
  assert.equal(enemies[1].hasAttackToken, false);
});

/* ------------------------------------------------------------------------- */
/* 3. Physical Detonations (Shatterblow, Solar Flare, Thunderchain) & Aegis  */
/* ------------------------------------------------------------------------- */

check('5. Physical Detonations resolve Shatterblow, Solar Flare, and Thunderchain with AoE & CC', () => {
  // 5A. Shatterblow ('rime' mark + Knight 'combo3')
  const rimeTarget = { id: 't1', x: 0, z: 0, hp: 200, maxHp: 200, mark: 'rime', markTimer: 5.0, active: true };
  const rimeNeighbor = { id: 't2', x: 2.5, z: 0, hp: 150, maxHp: 150, active: true };
  const resShatter = applyHitAndResolveDetonation(
    rimeTarget,
    { source: 'combo3', baseDmg: 38, infusion: 'rime', attackerPos: { x: 0, z: 2 } },
    [rimeTarget, rimeNeighbor]
  );
  assert.ok(resShatter.detonation);
  assert.equal(resShatter.detonation.id, 'shatterblow');
  assert.equal(rimeTarget.mark, null);
  assert.equal(rimeTarget.stunTimer, 1.4);
  assert.equal(rimeNeighbor.hp, 150 - 65);
  assert.equal(resShatter.hitstopMs, 70);

  // 5B. Solar Flare ('solar' mark + Knight 'charged' Heavy Finisher -> upward launch vy = 7.5)
  const solarTarget = { id: 's1', x: 0, z: 0, hp: 220, maxHp: 220, mark: 'solar', markTimer: 5.0, grounded: true, active: true };
  const resSolar = applyHitAndResolveDetonation(
    solarTarget,
    { source: 'charged', baseDmg: 56, infusion: 'solar', attackerPos: { x: 0, z: 2 } },
    [solarTarget]
  );
  assert.ok(resSolar.detonation);
  assert.equal(resSolar.detonation.id, 'solar_flare');
  assert.equal(solarTarget.vy, 7.5);
  assert.equal(solarTarget.grounded, false);

  // 5C. Thunderchain ('tempest' mark + Mage 'shatterlance' or Knight 'intercept' -> inward pull)
  const stormTarget = { id: 'm1', x: 0, z: 0, hp: 200, maxHp: 200, mark: 'tempest', markTimer: 5.0, active: true };
  const stormOuter = { id: 'm2', x: 5.0, z: 0, hp: 160, maxHp: 160, active: true };
  const resThunder = applyHitAndResolveDetonation(
    stormTarget,
    { source: 'shatterlance', baseDmg: 58, detonatesMark: true, attackerPos: { x: 0, z: 6 } },
    [stormTarget, stormOuter]
  );
  assert.ok(resThunder.detonation);
  assert.equal(resThunder.detonation.id, 'thunderchain');
  assert.ok(stormOuter.vx < 0, 'Thunderchain must pull outer enemy inward toward primary target');
  assert.equal(stormOuter.stunTimer, 1.1);
});

check('6. Boss Hollow Sovereign raises 2-layer Bone Aegis at <= 50% HP and breaks via 2 detonations or Ultimate', () => {
  const boss = {
    id: 'sovereign',
    isBoss: true,
    hp: 720,
    maxHp: 1400,
    aegisTriggerHpRatio: 0.5,
    aegisLayersMax: 2,
    aegisDmgReduction: 0.85,
    aegisTriggered: false,
    aegisActive: false,
    aegisLayers: 0,
    active: true,
  };

  // Hit pushes boss below 700 HP (<= 50%) -> raises 2-layer Bone Aegis
  const triggerHit = applyHitAndResolveDetonation(
    boss,
    { source: 'frost_lance', baseDmg: 42, applyMark: 'rime' },
    [boss]
  );
  assert.equal(triggerHit.aegisRaised, true);
  assert.equal(boss.aegisActive, true);
  assert.equal(boss.aegisLayers, 2);

  // Detonation #1 breaks Layer 1 (2 -> 1)
  const det1 = applyHitAndResolveDetonation(
    boss,
    { source: 'combo3', baseDmg: 38, infusion: 'rime' },
    [boss]
  );
  assert.equal(det1.aegisBroken, true);
  assert.equal(boss.aegisLayers, 1);
  assert.equal(boss.aegisActive, true);

  // Re-mark and Detonation #2 breaks Layer 2 (1 -> 0, Aegis shattered!)
  applyHitAndResolveDetonation(boss, { source: 'cinder_fall', baseDmg: 54, applyMark: 'solar' }, [boss]);
  const det2 = applyHitAndResolveDetonation(
    boss,
    { source: 'charged', baseDmg: 56, infusion: 'solar' },
    [boss]
  );
  assert.equal(det2.aegisBroken, true);
  assert.equal(boss.aegisLayers, 0);
  assert.equal(boss.aegisActive, false);
});

/* ------------------------------------------------------------------------- */
/* 4. Shared 2-InstancedMesh Indicator Contract & Headless SFX Safety        */
/* ------------------------------------------------------------------------- */

check('7. campaign-loop.js creates strictly 2 opaque InstancedMeshes and combat-sfx.js is headless-safe', () => {
  const scene = new THREE.Scene();
  const sfx = createCombatSfx();
  // Calling all SFX methods in headless Node must be a clean no-op
  sfx.playSwordSlash(0, 'rime');
  sfx.playHeavyFinisher('solar');
  sfx.playBreathingIgnition('tempest');
  sfx.playSpellCast('frost_lance');
  sfx.playDetonation('shatterblow');
  sfx.playShieldChime();
  sfx.playVictoryFanfare();

  const loop = createCampaignLoop({
    scene,
    walkableHeightAt: () => 0,
    combatSfx: sfx,
  });

  const instancedMeshes = [];
  loop.indicatorGroup.traverse((obj) => {
    if (obj.isInstancedMesh) instancedMeshes.push(obj);
  });

  assert.equal(
    instancedMeshes.length,
    2,
    'Combat indicator group must contain strictly 2 shared InstancedMeshes'
  );
  for (const im of instancedMeshes) {
    assert.equal(im.material.transparent, false, `${im.name} must have transparent: false`);
    assert.equal(im.material.depthWrite, true, `${im.name} must have depthWrite: true`);
  }

  // Update indicators with Knight & Mage positions -> Soul Tether + Guiding Petals populate cleanly
  loop.update(0.016, {
    heroStates: {
      Knight: { x: 2.0, y: 0, z: 12.0, yaw: Math.PI },
      Mage: { x: 4.0, y: 0, z: 12.5, yaw: Math.PI },
    },
  });
  assert.ok(loop.groundIndicatorMesh.count > 0, 'Guiding petal markers should populate groundIndicatorMesh');
  assert.ok(loop.crestAndTetherMesh.count >= 16, 'Golden Soul Tether beads should populate crestAndTetherMesh');
});

/* ------------------------------------------------------------------------- */
/* 5. Downed & Partner Revive + Full 3-Act Campaign Deterministic Simulation */
/* ------------------------------------------------------------------------- */

check('8. Hero Downed & Partner Proximity Revive (2.0s within 3.5m) works deterministically', () => {
  const sim = createHeadlessCampaignSim();
  sim.heroes.Knight.x = 0;
  sim.heroes.Knight.z = 0;
  sim.heroes.Mage.x = 2.0; // Within 3.5m
  sim.heroes.Mage.z = 0;

  const fatal = sim.applyDamageToHero('Knight', 500);
  assert.equal(fatal.downed, true);
  assert.equal(sim.heroes.Knight.downed, true);

  // Step 2.1 seconds in 0.5s increments while Mage stands within 3.5m
  sim.step(0.5);
  assert.equal(sim.heroes.Knight.downed, true);
  sim.step(0.8);
  sim.step(0.8);
  assert.equal(sim.heroes.Knight.downed, false, 'Knight must revive after 2.0s within 3.5m of partner');
  assert.ok(sim.heroes.Knight.hp > 0);
});

check('9. Full 3-Act Valley Expedition simulates deterministically from Act I Arena to Dawn Victory', () => {
  const sim = createHeadlessCampaignSim();
  assert.equal(sim.currentActId, 'act1_arena');

  // Trigger Act I Wave 1 (4 enemies) & Wave 2 (6 enemies -> capped at <= 5 concurrent visible!)
  sim.moveHeroesTo(ACT_DEFINITIONS.act1_arena.center.x, ACT_DEFINITIONS.act1_arena.center.z);
  assert.equal(sim.actTriggered, true);
  assert.equal(sim.waveIndex, 0);
  assert.equal(sim.visibleEnemyCount, 4);

  // Start Wave 2 directly to verify the 6-enemy wave caps visible enemies at 5 and queues 1
  sim.startWave(1);
  assert.equal(sim.visibleEnemyCount, MAX_CONCURRENT_ENEMIES);
  assert.equal(sim.spawnQueue.length, 1);

  // Reset and run full 3-Act campaign auto-play
  const fullSim = createHeadlessCampaignSim();
  const outcome = fullSim.runFullCampaignAutoPlay();

  assert.equal(outcome.completed, true, 'Campaign must reach victory_dawn');
  assert.equal(outcome.currentActId, 'victory_dawn');
  assert.equal(outcome.currentTod, 'day');
  assert.equal(fullSim.heroes.Knight.empoweredBreathing, true, 'Pier sanctuary must grant Empowered Breathing');

  const visitedActs = outcome.eventLog
    .filter((e) => e.type === 'act_changed')
    .map((e) => e.actId);
  assert.deepEqual(visitedActs, [
    'interlude_pier',
    'act2_plaza',
    'act3_shrine',
    'victory_dawn',
  ]);
});

const { createEnemyManager } = await import('../src/combat/enemy-manager.js');
const createdCalls = [];
const mockKit = {
  async loadAnimationPacks() {},
  async createCharacter(charId, opts = {}) {
    createdCalls.push({ charId, opts });
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

const em = await createEnemyManager({
  scene: new THREE.Scene(),
  kit: mockKit,
  walkableHeightAt: () => 0.6,
  resolveCollisions: (x, z) => ({ x, z, wrapped: false }),
});

check('10. enemy-manager.js pre-allocates 6 KayKit Skeletons (incl. Boss Sovereign cellOverrides), caps visible <= 5, and handles setFrozenForShot', () => {
  assert.equal(em.poolSlots.length, 6);
  assert.equal(em.visibleCount, 0, 'All 6 pool slots must start with visible = false (0 idle draw calls)');

  const bossCall = createdCalls[5];
  assert.equal(bossCall.charId, 'Skeleton_Warrior');
  assert.ok(Math.abs(bossCall.opts.targetHeight - 1.9 * 1.42) < 1e-4);
  assert.equal(bossCall.opts.outlineThickness, 0.015);
  assert.deepEqual(bossCall.opts.cellOverrides, {
    r0c3: [42, 30, 52],
    r1c0: [204, 24, 44],
    r1c2: [248, 196, 68],
  });

  // Spawn 6-enemy Wave 2 -> must cap concurrent visible enemies at 5 and queue 1
  em.spawnWave(ACT_DEFINITIONS.act1_arena.waves[1], 'act1_arena');
  assert.equal(em.visibleCount, 5);
  assert.equal(em.activeEnemies.length, 5);
  assert.equal(em.spawnQueue.length, 1);

  // Kill one active enemy and advance death timer -> queued 6th enemy spawns into the freed slot!
  const firstEnemy = em.activeEnemies[0];
  em.applyHitToEnemy(firstEnemy, { source: 'charged', baseDmg: 999, infusion: 'rime' });
  assert.equal(firstEnemy.dead, true);
  em.update(0.7, {
    Knight: { id: 'Knight', x: 68, y: 0.6, z: -4 },
    Mage: { id: 'Mage', x: 66, y: 0.6, z: -4 },
  });
  assert.equal(em.spawnQueue.length, 0, 'Queued reinforcement must spawn once an active slot frees');
  assert.equal(em.visibleCount, 5);

  // Verify setFrozenForShot poses cleanly and hides combat wave enemies
  em.setFrozenForShot('day-arena-wisteria');
  assert.equal(em.visibleCount, 2, 'day-arena-wisteria frozen shot shows 2 posed Arena skeletons');
  em.setFrozenForShot(null);
  assert.equal(em.visibleCount, 5, 'Unfreezing restores active combat wave visibility');
});

console.log(`\nALL ${passed} COMBAT & 3-ACT CAMPAIGN TESTS PASSED!\n`);
