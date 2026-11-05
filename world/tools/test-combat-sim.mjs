#!/usr/bin/env node
// ============================================================================
// world/tools/test-combat-sim.mjs
//
// Automated Node.js Unit & Full 3-Act Campaign Simulation Verification Suite
// for Haru-machi Stage 4 & 5 / Wave 2B Combat Feel, Knight & Mage Kits,
// Terrain Scalar Math, Pooled Enemy AI & Synergy Detonations.
// ============================================================================

import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  clamp,
  lerp,
  smoothstep,
  shortestAngleDiff,
  sampleSlopeNormal,
  isWalkableShorelineDepth,
  projectAimRayToGround,
} from '../src/terrain-scalar.js';
import {
  KNIGHT_COMBO_SPECS,
  MAGE_COMBO_SPECS,
  MAGE_CHARGED_SHATTERLANCE_SPEC,
  MASH_TIMESCALE_MIN,
  MASH_TIMESCALE_MAX,
  KNIGHT_SHIELD_BLOCK_DR,
  KNIGHT_POWER_SWORD_DURATION,
  KNIGHT_POWER_SWORD_COOLDOWN,
  KNIGHT_ULT_DURATION,
  KNIGHT_ULT_DMG_MULT,
  MAGE_MAX_CONSECUTIVE_CHARGED,
  MAGE_E_COOLDOWN,
  MAGE_STORM_CATACLYSM_DURATION,
  createCombatActionAimController,
} from '../src/combat/combat-action-aim.js';
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
  COMMUNE_MAX_DISTANCE,
  POWERUP_TETHER_DISTANCE,
  getKnightLevelStats,
  resolveShrineObstacles,
  selectSoftLockTarget,
  allocateAttackTokens,
  applyHitAndResolveDetonation,
  createHeadlessCampaignSim,
} from '../src/combat/combat-balance.js';
import { createCampaignLoop } from '../src/combat/campaign-loop.js';
import { createCombatSfx } from '../src/combat/combat-sfx.js';

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('=== Haru-machi Wave 2B Combat Feel, Knight & Mage Kits & Campaign Sim Tests ===');

/* ------------------------------------------------------------------------- */
/* 1. Terrain Scalar Math & Aim Ray Projection (`terrain-scalar.js`)         */
/* ------------------------------------------------------------------------- */

await check('1. terrain-scalar.js exports pure scalar helpers, slope normal, shoreline depth & aim projection', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-2, 0, 3), 0);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.equal(smoothstep(0, 10, 5), 0.5);
  assert.ok(Math.abs(shortestAngleDiff(Math.PI * 1.9, 0.1) - -0.414159) < 1e-3);

  // Slope normal on a 45-degree incline z -> y = z
  const n = sampleSlopeNormal((x, z) => z, 0, 0, 0.5);
  assert.ok(Math.abs(n.x) < 1e-6);
  assert.ok(n.y > 0.7 && n.y < 0.72);
  assert.ok(n.z < -0.7 && n.z > -0.72);
  const [nx, ny, nz] = n;
  assert.equal(nx, n.x);
  assert.equal(ny, n.y);
  assert.equal(nz, n.z);

  // Shoreline wading depth (waterY = -1.2, maxWadeDepth = 0.35 -> walkable down to -1.55m)
  assert.equal(isWalkableShorelineDepth(-1.45, -1.2, 0.35), true);
  assert.equal(isWalkableShorelineDepth(-1.85, -1.2, 0.35), false);

  // Aim projection: Frost Lance fixed 14.5m vs Cinder Fall variable 3.0..16.0m
  const frostAim = projectAimRayToGround({
    origin: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0.75,
    spellId: 'frost_lance',
  });
  assert.equal(frostAim.distance, 14.5);

  const cinderNear = projectAimRayToGround({
    origin: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0.92,
    spellId: 'cinder_fall',
  });
  const cinderFar = projectAimRayToGround({
    origin: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0.04,
    spellId: 'cinder_fall',
  });
  assert.ok(cinderNear.distance >= 3.0 && cinderNear.distance <= 4.0);
  assert.ok(cinderFar.distance >= 15.5 && cinderFar.distance <= 16.0);
});

/* ------------------------------------------------------------------------- */
/* 2. Balance Constants & Geography Coordinate Verification                  */
/* ------------------------------------------------------------------------- */

await check('2. HERO_STATS (incl. fragile 90 HP Mage), SPELLS & DETONATIONS match exact Wave 2B spec', () => {
  assert.equal(HERO_STATS.Knight.maxHp, 220);
  assert.deepEqual(HERO_STATS.Knight.comboDmg, [22, 26, 38]);
  assert.equal(HERO_STATS.Knight.combo4Dmg, 46);
  assert.equal(HERO_STATS.Knight.shieldBlockDr, 0.8);
  assert.equal(HERO_STATS.Knight.powerSwordDuration, 13.0);
  assert.equal(HERO_STATS.Knight.powerSwordCd, 18.0);
  assert.equal(HERO_STATS.Knight.ultDuration, 10.0);
  assert.equal(HERO_STATS.Knight.ultDmgMult, 2.0);

  // Fragile Glass Cannon Mage (~3 unprotected hits downs her)
  assert.equal(HERO_STATS.Mage.maxHp, 90);
  assert.deepEqual(HERO_STATS.Mage.boltDmg, [18, 22, 30]);
  assert.equal(HERO_STATS.Mage.skillCd, 8.5);
  assert.equal(HERO_STATS.Mage.stormCataclysmDuration, 6.0);
  assert.equal(HERO_STATS.Mage.maxConsecutiveCharged, 3);

  assert.equal(SPELLS.frost_lance.dmg, 42);
  assert.equal(SPELLS.frost_lance.cd, 8.5);
  assert.equal(SPELLS.frost_lance.range, 14.5);
  assert.equal(SPELLS.frost_lance.mark, 'rime');
  assert.equal(SPELLS.shatterlance.dmg, 58);
  assert.equal(SPELLS.shatterlance.detonatesMark, true);
  assert.equal(SPELLS.cinder_fall.dmg, 54);
  assert.equal(SPELLS.cinder_fall.cd, 8.5);
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

await check('3. ACT_DEFINITIONS match exact geography.js coordinates & obstacle clearances', () => {
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

  const pier = ACT_DEFINITIONS.interlude_pier;
  assert.equal(pier.center.x, -42.0);
  assert.equal(pier.center.z, 8.5);
  assert.equal(pier.triggerRadius, 4.8);
  assert.equal(pier.tod, 'evening');

  const act2 = ACT_DEFINITIONS.act2_plaza;
  assert.equal(act2.center.x, 0.0);
  assert.equal(act2.center.z, 0.0);
  assert.equal(act2.waves[0].spawns.length, 6);

  const act3 = ACT_DEFINITIONS.act3_shrine;
  assert.equal(act3.center.x, 0.0);
  assert.equal(act3.center.z, -85.5);
  assert.equal(act3.arenaRadius, 12.8);
  assert.equal(ENEMY_ARCHETYPES.boss_sovereign.maxHp, 1400);

  const pushed = resolveShrineObstacles(-5.8, -87.8, 0.6, true);
  assert.ok(Math.hypot(pushed.x - -5.8, pushed.z - -87.8) >= 2.19);
});

/* ------------------------------------------------------------------------- */
/* 3. Full Native Clips, 1-Input Swing Buffer, Mash Speed Ramp & Contact Hit */
/* ------------------------------------------------------------------------- */

await check('4. KNIGHT_COMBO_SPECS & MAGE_COMBO_SPECS have startTime: 0, hopVy: 0, contactFrac in [0.38..0.48], and zero routine camera shake', () => {
  assert.equal(KNIGHT_COMBO_SPECS.length, 4);
  for (const s of KNIGHT_COMBO_SPECS) {
    assert.equal(s.startTime, 0, `${s.clip} must start at 0s (zero cut windup)`);
    assert.equal(s.hopVy, 0, `${s.clip} must have hopVy = 0 (zero mid-air jitter)`);
    assert.ok(
      s.contactFrac >= 0.38 && s.contactFrac <= 0.48,
      `${s.clip} contactFrac (${s.contactFrac}) must be in [0.38, 0.48]`
    );
    assert.equal(s.cameraImpulse, 0, `${s.clip} must have 0 routine camera shake`);
  }

  assert.equal(MAGE_COMBO_SPECS.length, 3);
  for (const s of MAGE_COMBO_SPECS) {
    assert.equal(s.startTime, 0, `${s.clip} must start at 0s`);
    assert.equal(s.hopVy, 0, `${s.clip} must have hopVy = 0`);
    assert.ok(s.contactFrac >= 0.38 && s.contactFrac <= 0.48);
    assert.equal(s.cameraImpulse, 0);
  }

  assert.equal(MAGE_CHARGED_SHATTERLANCE_SPEC.startTime, 0);
  assert.equal(MAGE_CHARGED_SHATTERLANCE_SPEC.hopVy, 0);
});

await check('5. 1-Input Swing Buffer, 1.0x -> 1.30x Mash Speed Ramp, and Contact-Frame Hit Detection work cleanly without cutting swings', () => {
  const contactEvents = [];
  const startedEvents = [];
  const finishedEvents = [];

  const ctrl = createCombatActionAimController({
    onSwingStarted: (sw) => startedEvents.push({ ...sw }),
    onContactHit: (sw) => contactEvents.push({ clip: sw.clip, elapsed: sw.elapsed, contactTime: sw.contactTime }),
    onSwingFinished: (sw) => finishedEvents.push({ clip: sw.clip, duration: sw.duration }),
  });

  // Tap 1: starts combo1 at 1.00x timeScale; does NOT fire contact hit at 0ms!
  const tap1 = ctrl.pressAttack('Knight');
  assert.equal(tap1.buffered, false);
  assert.equal(tap1.mashTimeScale, 1.0);
  assert.equal(startedEvents.length, 1);
  assert.equal(startedEvents[0].clip, 'combo1');
  assert.equal(contactEvents.length, 0, 'Hit detection must NOT trigger at 0ms button press');

  // Spam LMB 4 times during combo1 -> must buffer at most 1 follow-up swing, never cut combo1, and ramp mashTimeScale up to 1.30x!
  ctrl.pressAttack('Knight');
  ctrl.pressAttack('Knight');
  const mashTap = ctrl.pressAttack('Knight');
  assert.equal(mashTap.buffered, true);
  assert.equal(mashTap.cutActiveSwing, false);
  assert.equal(ctrl.heroes.Knight.bufferedAttack, true);
  assert.equal(ctrl.heroes.Knight.mashTimeScale, MASH_TIMESCALE_MAX);
  assert.equal(startedEvents.length, 1, 'Active swing must NOT be cut or restarted by mashing');

  // Step to just before contactTime -> still 0 contact hits
  const cTime = ctrl.heroes.Knight.activeSwing.contactTime;
  ctrl.update(cTime - 0.02);
  assert.equal(contactEvents.length, 0);

  // Step across contactTime -> contact hit fires!
  ctrl.update(0.04);
  assert.equal(contactEvents.length, 1);
  assert.equal(contactEvents[0].clip, 'combo1');

  // Step to end of combo1 -> combo1 finishes cleanly and buffered combo2 starts automatically at 1.30x speed!
  const remaining = ctrl.heroes.Knight.activeSwing.duration - ctrl.heroes.Knight.activeSwing.elapsed + 0.01;
  ctrl.update(remaining);
  assert.equal(finishedEvents.length, 1);
  assert.equal(finishedEvents[0].clip, 'combo1');
  assert.equal(startedEvents.length, 2, 'Buffered attack must automatically start combo2 on completion');
  assert.equal(startedEvents[1].clip, 'combo2');
  assert.equal(startedEvents[1].timeScale, 1.3);
  assert.equal(ctrl.heroes.Knight.bufferedAttack, false, '1-input buffer is consumed');

  // Let combo2 finish and stay idle for 1.0s -> mashTimeScale decays smoothly back to 1.00x
  ctrl.update(1.0);
  ctrl.update(1.0);
  assert.equal(ctrl.heroes.Knight.activeSwing, null);
  assert.equal(ctrl.heroes.Knight.mashTimeScale, MASH_TIMESCALE_MIN);
});

/* ------------------------------------------------------------------------- */
/* 4. Knight Kit: Tab Ice/Fire, Shield Block, E Power Sword, Q & Leveling    */
/* ------------------------------------------------------------------------- */

await check('6. Knight Kit: Tab toggles ice/fire, Hold Shield Block (80% DR), E Power Sword (13s active / 18s cd = 5s downtime, Ice slow & Fire burn), Q (10s 2x dmg), and XP leveling', () => {
  const sim = createHeadlessCampaignSim();
  sim.moveHeroesTo(ACT_DEFINITIONS.act1_arena.center.x, ACT_DEFINITIONS.act1_arena.center.z);
  const enemy = sim.activeEnemies[0];
  assert.ok(enemy);

  // 6A. Tab toggles Knight element between 'ice' and 'fire'
  assert.equal(sim.heroes.Knight.selectedElement, 'ice');
  const t1 = sim.knightToggleElement();
  assert.equal(t1.element, 'fire');
  const t2 = sim.knightToggleElement();
  assert.equal(t2.element, 'ice');

  // 6B. Knight E (Power Sword - Ice): 13s active, 18s cooldown = 5s downtime; slows enemy speed, attack & outgoing damage
  const pIce = sim.knightActivatePowerSword();
  assert.equal(pIce.activated, true);
  assert.equal(pIce.element, 'ice');
  assert.equal(pIce.activeDuration, 13.0);
  assert.equal(pIce.totalCooldown, 18.0);
  assert.equal(pIce.downtimeAfterExpiry, 5.0);

  const hitIce = sim.knightAttack('combo1', enemy);
  assert.equal(hitIce.iceSlowApplied, true);
  assert.ok(enemy.iceSlowTimer > 0);
  const lvl1Slow = getKnightLevelStats(1).iceSlowFactor;
  assert.equal(enemy.iceSlowFactor, lvl1Slow);

  // Step 13.0s -> Power Sword active duration expires, leaving exactly 5.0s downtime on the 18.0s cooldown!
  sim.step(13.0);
  assert.equal(sim.heroes.Knight.powerSwordActive, false);
  assert.ok(Math.abs(sim.heroes.Knight.powerSwordCd - 5.0) < 1e-3);
  const blockedDuringDowntime = sim.knightActivatePowerSword();
  assert.equal(blockedDuringDowntime.onCooldown, true);

  // Step remaining 5.0s downtime -> Power Sword is ready again!
  sim.step(5.05);
  assert.equal(sim.heroes.Knight.powerSwordCd, 0);

  // 6C. Switch to Fire ('fire') and activate E -> applies bonus fire strike + persistent burn DoT
  sim.knightToggleElement();
  assert.equal(sim.heroes.Knight.selectedElement, 'fire');
  const pFire = sim.knightActivatePowerSword();
  assert.equal(pFire.activated, true);
  assert.equal(pFire.breathingStyle, 'solar');

  const enemy2 = sim.activeEnemies.find((e) => !e.dead);
  const hitFire = sim.knightAttack('combo1', enemy2);
  assert.equal(hitFire.fireBurnApplied, true);
  assert.ok(enemy2.burnTimer > 0 && enemy2.burnDps > 0);
  const hpBeforeBurn = enemy2.hp;
  sim.step(1.0);
  assert.ok(enemy2.hp < hpBeforeBurn, 'Fire Sword burn DoT must tick persistent damage over time');

  // 6D. Hold Shield Block reduces incoming damage by 80%
  sim.knightHoldShieldBlock(true);
  assert.equal(sim.heroes.Knight.shieldBlocking, true);
  const kDmgRes = sim.applyDamageToHero('Knight', 50);
  assert.equal(kDmgRes.hpLost, 10, 'Shield Block must reduce 50 incoming damage by 80% to 10');
  sim.knightHoldShieldBlock(false);

  // 6E. Knight Q (Sky-Lightning Awakening): 10.0s of 2.0x double damage
  const target3 = sim.activeEnemies.find((e) => !e.dead);
  target3.hp = 500;
  target3.maxHp = 500;
  const baseSwing = sim.knightAttack('combo1', target3);
  const qRes = sim.knightCastSkyLightningUlt(target3);
  assert.equal(qRes.activated, true);
  assert.equal(qRes.duration, 10.0);
  assert.equal(qRes.dmgMult, 2.0);
  const ultSwing = sim.knightAttack('combo1', target3);
  assert.equal(ultSwing.damageDealt, baseSwing.damageDealt * 2, 'Knight Q must grant 2.0x double sword damage');

  // 6F. Killing enemies grants XP and levels up Knight (scaling damage & Ice/Fire sword potency)
  const startLevel = sim.heroes.Knight.level;
  for (const e of [...sim.activeEnemies]) {
    sim.knightAttack('combo4', e);
    sim.knightAttack('combo4', e);
  }
  assert.ok(sim.heroes.Knight.level > startLevel, 'Killing enemies must level up Knight');
  assert.ok(
    getKnightLevelStats(sim.heroes.Knight.level).iceSlowFactor > lvl1Slow,
    'Higher Knight level must increase Ice Sword slow potency'
  );
});

/* ------------------------------------------------------------------------- */
/* 5. Mage Kit: Fragile 90 HP, 3-Charged Shatterlance, E Aim & 6s Q Storm    */
/* ------------------------------------------------------------------------- */

await check('7. Mage Kit: Fragile ~3-hit HP, 3-consecutive-charged Shatterlance fallback, Tab toggle, Hold/Release E aim (14.5m vs 3..16m, 8.5s cd), and 6.0s vulnerable Storm Cataclysm + Knight Shield protection', () => {
  const sim = createHeadlessCampaignSim();
  sim.moveHeroesTo(ACT_DEFINITIONS.act1_arena.center.x, ACT_DEFINITIONS.act1_arena.center.z);

  // 7A. Fragile 90 HP Mage dies in 3 unprotected hits of 30 dmg
  assert.equal(sim.heroes.Mage.maxHp, 90);
  sim.applyDamageToHero('Mage', 30);
  sim.applyDamageToHero('Mage', 30);
  assert.equal(sim.heroes.Mage.downed, false);
  sim.applyDamageToHero('Mage', 30);
  assert.equal(sim.heroes.Mage.downed, true, 'Mage must go down in 3 unprotected hits');
  // Restore Mage HP for remaining checks
  sim.heroes.Mage.downed = false;
  sim.heroes.Mage.hp = 90;

  // 7B. Hold Attack (Shatterlance): after 3 consecutive charged attacks, 4th automatically falls back to normal bolt attack!
  const ch1 = sim.mageHoldChargedAttack();
  const ch2 = sim.mageHoldChargedAttack();
  const ch3 = sim.mageHoldChargedAttack();
  assert.equal(ch1.fallbackToNormal, false);
  assert.equal(ch2.fallbackToNormal, false);
  assert.equal(ch3.fallbackToNormal, false);
  assert.equal(sim.heroes.Mage.consecutiveChargedCount, MAGE_MAX_CONSECUTIVE_CHARGED);

  const ch4 = sim.mageHoldChargedAttack();
  assert.equal(
    ch4.fallbackToNormal,
    true,
    '4th consecutive Hold Attack must automatically fall back to a normal bolt attack'
  );
  assert.equal(sim.heroes.Mage.consecutiveChargedCount, 0, 'Fallback normal attack resets consecutiveChargedCount to 0');

  // 7C. Tab toggles Mage E spell between frost_lance and cinder_fall; Hold E / Release E aims & casts with 8.5s cooldown
  assert.equal(sim.heroes.Mage.selectedSpell, 'frost_lance');
  const aimFrost = sim.mageStartSkillAim({ pitch: 0.65 });
  assert.equal(aimFrost.active, true);
  assert.equal(aimFrost.spellId, 'frost_lance');
  assert.equal(aimFrost.distance, 14.5, 'Frost Lance aim arrow must have fixed 14.5m length');
  const castFrost = sim.mageReleaseSkillAim();
  assert.equal(castFrost.spellId, 'frost_lance');
  assert.equal(castFrost.cooldown, MAGE_E_COOLDOWN);
  assert.equal(sim.heroes.Mage.skillCd, 8.5);

  // Clear cooldown and toggle to Cinder Fall
  sim.heroes.Mage.skillCd = 0;
  sim.heroes.Mage.spellCooldowns.cinder_fall = 0;
  const toggled = sim.mageToggleSpell();
  assert.equal(toggled.spellId, 'cinder_fall');

  const aimCinderClose = sim.mageStartSkillAim({ pitch: 0.9 });
  assert.ok(aimCinderClose.distance >= 3.0 && aimCinderClose.distance <= 4.5);
  const aimCinderMid = sim.mageUpdateSkillAim({ distance: 11.2 });
  assert.equal(aimCinderMid.distance, 11.2, 'Cinder Fall aim arrow must track variable 3..16m distance');
  const castCinder = sim.mageReleaseSkillAim();
  assert.equal(castCinder.spellId, 'cinder_fall');
  assert.equal(castCinder.distance, 11.2);
  assert.equal(sim.heroes.Mage.skillCd, 8.5);

  // 7D. Mage Q (6.0s Stationary Vulnerable Storm Cataclysm):
  // - While channeling, if Knight holds Shield Block, Knight intercepts the enemy hit and saves the Mage!
  // - If Knight is NOT shielding, 1 unprotected hit immediately downs her!
  const qStorm = sim.mageCastStormCataclysm();
  assert.equal(qStorm.activated, true);
  assert.equal(qStorm.duration, MAGE_STORM_CATACLYSM_DURATION);
  assert.equal(sim.heroes.Mage.stormCataclysmActive, true);

  sim.knightHoldShieldBlock(true);
  const protectedHit = sim.applyDamageToHero('Mage', 32);
  assert.equal(protectedHit.interceptedByKnight, true, 'Shielding Knight must intercept attack aimed at channeling Mage');
  assert.equal(sim.heroes.Mage.downed, false);
  assert.equal(sim.heroes.Mage.stormCataclysmActive, true);

  // Now drop Knight's shield -> 1 unprotected hit immediately downs Mage!
  sim.knightHoldShieldBlock(false);
  const unprotectedHit = sim.applyDamageToHero('Mage', 12);
  assert.equal(unprotectedHit.downed, true, '1 unprotected hit during 6s Storm Cataclysm must immediately down Mage');
  assert.equal(sim.heroes.Mage.stormCataclysmActive, false);
});

/* ------------------------------------------------------------------------- */
/* 6. Removal of Partner Distance Restrictions & Indicator Clutter           */
/* ------------------------------------------------------------------------- */

await check('8. Partner distance restrictions are removed (Infinity) and overhead/underfoot enemy indicator clutter stays hidden', () => {
  assert.equal(COMMUNE_MAX_DISTANCE, Infinity);
  assert.equal(POWERUP_TETHER_DISTANCE, Infinity);

  const scene = new THREE.Scene();
  const sfx = createCombatSfx();
  const loop = createCampaignLoop({
    scene,
    walkableHeightAt: () => 0,
    combatSfx: sfx,
  });

  // Partners 120m apart can still Commune and share buffs without restriction
  const heroStates = {
    Knight: { x: -60, y: 0, z: 0, yaw: 0 },
    Mage: { x: 60, y: 0, z: 0, yaw: 0 },
  };
  assert.equal(loop.canCommuneTogether(heroStates).allowed, true);
  assert.equal(loop.isWithinPowerupTether(heroStates.Knight, heroStates.Mage), true);

  loop.update(0.016, { heroStates });
  assert.equal(loop.crestAndTetherMesh.visible, false, 'crestAndTetherMesh must remain hidden');
  assert.equal(loop.groundIndicatorMesh.visible, false, 'groundIndicatorMesh must remain hidden');
});

/* ------------------------------------------------------------------------- */
/* 7. Soft-Lock, 3-Token Cap, Physical Detonations & Full 3-Act Campaign Sim */
/* ------------------------------------------------------------------------- */

await check('9. selectSoftLockTarget, allocateAttackTokens, Physical Detonations & Boss Bone Aegis work deterministically', () => {
  const origin = { x: 0, z: 0 };
  const enemies = [
    { id: 'behind', x: 0, z: -12, hp: 100, dead: false, active: true },
    { id: 'in_cone_marked', x: 1.0, z: 9, hp: 100, dead: false, active: true, mark: 'rime' },
  ];
  assert.equal(selectSoftLockTarget(origin, 0, enemies)?.id, 'in_cone_marked');

  const tokenPool = [
    { id: 'e1', hp: 100, dead: false, active: true, distToTarget: 3.0, aiState: 'windup' },
    { id: 'e2', hp: 100, dead: false, active: true, distToTarget: 4.0, isBoss: true },
    { id: 'e3', hp: 100, dead: false, active: true, distToTarget: 2.5 },
    { id: 'e4', hp: 100, dead: false, active: true, distToTarget: 5.0 },
  ];
  assert.equal(allocateAttackTokens(tokenPool, MAX_ATTACK_TOKENS).length, 3);

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
  const triggerHit = applyHitAndResolveDetonation(
    boss,
    { source: 'frost_lance', baseDmg: 42, applyMark: 'rime' },
    [boss]
  );
  assert.equal(triggerHit.aegisRaised, true);
  assert.equal(boss.aegisLayers, 2);

  applyHitAndResolveDetonation(boss, { source: 'combo3', baseDmg: 38, infusion: 'rime' }, [boss]);
  assert.equal(boss.aegisLayers, 1);

  applyHitAndResolveDetonation(boss, { source: 'cinder_fall', baseDmg: 54, applyMark: 'solar' }, [boss]);
  applyHitAndResolveDetonation(boss, { source: 'combo4', baseDmg: 46, infusion: 'solar' }, [boss]);
  assert.equal(boss.aegisLayers, 0);
  assert.equal(boss.aegisActive, false);
});

await check('10. Full 3-Act Valley Expedition & Pooled Enemy Manager (incl. telegraphRingMesh.visible = false) pass 100%', async () => {
  const fullSim = createHeadlessCampaignSim();
  const outcome = fullSim.runFullCampaignAutoPlay();
  assert.equal(outcome.completed, true, 'Campaign must reach victory_dawn');
  assert.equal(outcome.currentActId, 'victory_dawn');

  const { createEnemyManager } = await import('../src/combat/enemy-manager.js');
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

  const em = await createEnemyManager({
    scene: new THREE.Scene(),
    kit: mockKit,
    walkableHeightAt: () => 0.6,
    resolveCollisions: (x, z) => ({ x, z, wrapped: false }),
  });

  assert.equal(em.poolSlots.length, 6);
  assert.equal(em.telegraphRingMesh.visible, false, 'telegraphRingMesh must stay permanently hidden');
  em.spawnWave(ACT_DEFINITIONS.act1_arena.waves[1], 'act1_arena');
  assert.equal(em.visibleCount, 5);
  assert.equal(em.spawnQueue.length, 1);
  assert.equal(em.telegraphRingMesh.visible, false);

  // Verify live CampaignLoop + EnemyManager integration for Knight & Mage Wave 2B kits
  const liveLoop = createCampaignLoop({
    scene: new THREE.Scene(),
    walkableHeightAt: () => 0.6,
    enemyManager: em,
    combatSfx: createCombatSfx(),
  });

  // Knight E Power Sword (13s active / 18s cooldown = 5s downtime)
  const kSkill = liveLoop.performPartnerSkill('Knight', {
    Knight: { x: 74, y: 0.6, z: -6, yaw: 0 },
    Mage: { x: 72, y: 0.6, z: -6, yaw: 0 },
  });
  assert.equal(kSkill.skill, 'power_sword');
  assert.equal(kSkill.activeDuration, 13.0);
  assert.equal(kSkill.totalCooldown, 18.0);
  assert.equal(kSkill.downtime, 5.0);

  // Mage E Frost Lance / Cinder Fall (8.5s cooldown)
  const mSkill = liveLoop.performPartnerSkill(
    'Mage',
    {
      Knight: { x: 74, y: 0.6, z: -6, yaw: 0 },
      Mage: { x: 72, y: 0.6, z: -6, yaw: 0 },
    },
    { spellId: 'cinder_fall', distance: 9.5 }
  );
  assert.equal(mSkill.skill, 'mage_elemental_spell');
  assert.equal(mSkill.cooldown, 8.5);
  assert.equal(mSkill.distance, 9.5);

  // Mage Q 6s Storm Cataclysm + Knight Shield Block interception in liveLoop
  const mUlt = liveLoop.performMageStormCataclysm({
    Mage: { x: 72, y: 0.6, z: -6, yaw: 0 },
  });
  assert.equal(mUlt.ultimate, 'storm_cataclysm');
  assert.equal(mUlt.duration, 6.0);

  liveLoop.setKnightShieldBlocking(true);
  const intercepted = liveLoop.handlePlayerHit({ id: 'Mage' }, em.activeEnemies[0], 30);
  assert.equal(intercepted.interceptedByKnight, true);
  assert.equal(liveLoop.combatHeroes.Mage.downed, false);

  liveLoop.setKnightShieldBlocking(false);
  const downedByOneHit = liveLoop.handlePlayerHit({ id: 'Mage' }, em.activeEnemies[0], 15);
  assert.equal(downedByOneHit.downed, true);
  assert.equal(liveLoop.combatHeroes.Mage.downed, true);
});

console.log(`\nALL ${passed} WAVE 2B COMBAT & CAMPAIGN TESTS PASSED!\n`);
