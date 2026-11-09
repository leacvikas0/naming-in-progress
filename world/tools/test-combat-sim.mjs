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
  KNIGHT_MAX_LEVEL,
  MORTAL_DMG_MULT_CAP,
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

await check('2. HERO_STATS (incl. 120 HP Mage & 12s Knight Q), SPELLS & DETONATIONS match exact spec', () => {
  assert.equal(HERO_STATS.Knight.maxHp, 220);
  assert.deepEqual(HERO_STATS.Knight.comboDmg, [22, 26, 38]);
  assert.equal(HERO_STATS.Knight.combo4Dmg, 46);
  assert.equal(HERO_STATS.Knight.shieldBlockDr, 0.8);
  assert.equal(HERO_STATS.Knight.powerSwordDuration, 13.0);
  assert.equal(HERO_STATS.Knight.powerSwordCd, 18.0);
  assert.equal(HERO_STATS.Knight.ultDuration, 12.0);
  assert.equal(HERO_STATS.Knight.ultDmgMult, 2.0);

  // 120 HP Mage with continuous Hold-LMB Shatterlance
  assert.equal(HERO_STATS.Mage.maxHp, 120);
  assert.deepEqual(HERO_STATS.Mage.boltDmg, [18, 22, 30]);
  assert.equal(HERO_STATS.Mage.skillCd, 8.5);
  assert.equal(HERO_STATS.Mage.stormCataclysmDuration, 6.0);
  assert.equal(HERO_STATS.Mage.maxConsecutiveCharged, 999);

  assert.equal(SPELLS.frost_lance.dmg, 48);
  assert.equal(SPELLS.frost_lance.cd, 8.5);
  assert.equal(SPELLS.frost_lance.range, 14.5);
  assert.equal(SPELLS.frost_lance.mark, 'rime');
  assert.equal(SPELLS.shatterlance.dmg, 58);
  assert.equal(SPELLS.shatterlance.detonatesMark, true);
  assert.equal(SPELLS.cinder_fall.dmg, 56);
  assert.equal(SPELLS.cinder_fall.cd, 8.5);
  assert.equal(SPELLS.cinder_fall.mark, 'solar');
  assert.equal(SPELLS.storm_lance.dmg, 46);
  assert.equal(SPELLS.storm_lance.mark, 'tempest');
  assert.equal(SPELLS.storm_lance.chainCount, 3);

  assert.equal(DETONATIONS.rime_shatter.bonusDmg, 42);
  assert.equal(DETONATIONS.rime_shatter.stun, 0.75);
  assert.equal(DETONATIONS.shatterblow.bonusDmg, 65);
  assert.equal(DETONATIONS.shatterblow.stun, 1.1);
  assert.equal(DETONATIONS.solar_flare.bonusDmg, 70);
  assert.equal(DETONATIONS.solar_flare.stun, 1.0);
  assert.equal(DETONATIONS.solar_flare.knockback, 4.8);
  assert.equal(DETONATIONS.solar_flare.launchVy, undefined);
  assert.equal(DETONATIONS.thunderchain.bonusDmg, 60);
  assert.equal(DETONATIONS.thunderchain.pullStrength, 5.0);

  assert.equal(MAX_CONCURRENT_ENEMIES, 8);
  assert.equal(MAX_ATTACK_TOKENS, 3);
  assert.equal(ENEMY_ARCHETYPES.skeleton_minion.maxHp, 140);
  assert.equal(ENEMY_ARCHETYPES.skeleton_minion.speed, 7.2);
  assert.equal(ENEMY_ARCHETYPES.skeleton_rogue.maxHp, 185);
  assert.equal(ENEMY_ARCHETYPES.skeleton_rogue.speed, 8.0);
  assert.equal(ENEMY_ARCHETYPES.skeleton_warrior.maxHp, 250);
  assert.equal(ENEMY_ARCHETYPES.skeleton_warrior.speed, 6.2);
  assert.equal(ENEMY_ARCHETYPES.werewolf.maxHp, 350);
  assert.equal(ENEMY_ARCHETYPES.werewolf.speed, 8.4);
  assert.equal(ENEMY_ARCHETYPES.black_knight.maxHp, 580);
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
  assert.equal(ENEMY_ARCHETYPES.boss_sovereign.maxHp, 2200);

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

await check('6. Knight Kit: Tab toggles ice/fire, Hold Shield Block (80% DR), E Power Sword (13s active / 18s cd = 5s downtime, Ice slow & Fire burn), Q (10s bounded mult), and XP leveling', () => {
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

  // 6B. Knight E (Power Sword - Ice): 13s active, 18s cooldown = 5s downtime; slows enemy speed & windup (capped <= 0.25)
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
  assert.ok(lvl1Slow <= 0.25);

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

  // 6E. Knight Q (Twin-Element Awakening): 12.0s active, bounded multiplier (capped at 2.25x, no frame-0 nuke!)
  const target3 = sim.activeEnemies.find((e) => !e.dead);
  target3.hp = 500;
  target3.maxHp = 500;
  target3.mark = null;
  const baseSwing = sim.knightAttack('combo1', target3);
  target3.mark = null;
  const qRes = sim.knightCastSkyLightningUlt(target3);
  assert.equal(qRes.activated, true);
  assert.equal(qRes.duration, 12.0);
  assert.equal(qRes.dmgMult, 2.0);
  assert.equal(qRes.strikeResult.detonation, null, 'Knight Q ignition pulse must not self-detonate');
  assert.ok(qRes.strikeResult.damageDealt <= 80, 'Knight Q ignition pulse must be a small stagger pulse, not a 446-dmg nuke');
  target3.mark = null;
  const ultSwing = sim.knightAttack('combo1', target3);
  assert.ok(ultSwing.damageDealt > baseSwing.damageDealt && ultSwing.damageDealt <= 70, 'Knight Q boosts slash damage within bounded 2.25x cap');

  // 6F. Killing enemies grants XP and levels up Knight (scaling damage & Ice/Fire sword potency up to 0.25 cap)
  const startLevel = sim.heroes.Knight.level;
  for (const e of [...sim.activeEnemies]) {
    while (!e.dead && e.hp > 0) {
      sim.knightAttack('combo4', e);
    }
  }
  assert.ok(sim.heroes.Knight.level > startLevel, 'Killing enemies must level up Knight');
  assert.ok(
    getKnightLevelStats(sim.heroes.Knight.level).iceSlowFactor > lvl1Slow &&
      getKnightLevelStats(sim.heroes.Knight.level).iceSlowFactor <= 0.25,
    'Higher Knight level must increase Ice Sword slow potency up to 0.25 cap'
  );
});

/* ------------------------------------------------------------------------- */
/* 5. Mage Kit: Fragile 90 HP, 3-Charged Shatterlance, E Aim & 6s Q Storm    */
/* ------------------------------------------------------------------------- */

await check('7. Mage Kit: 120 HP durability, infinite Hold-LMB Shatterlance, Tab toggle, Hold/Release E aim (14.5m vs 3..16m, 8.5s cd), and 6.0s mobile Sky Meteor Shower + Knight Shield protection', () => {
  const sim = createHeadlessCampaignSim();
  sim.moveHeroesTo(ACT_DEFINITIONS.act1_arena.center.x, ACT_DEFINITIONS.act1_arena.center.z);

  // 7A. 120 HP Mage survives 3 hits of 30 dmg and goes down on the 4th unprotected hit of 30 dmg
  assert.equal(sim.heroes.Mage.maxHp, 120);
  sim.applyDamageToHero('Mage', 30);
  sim.applyDamageToHero('Mage', 30);
  sim.applyDamageToHero('Mage', 30);
  assert.equal(sim.heroes.Mage.downed, false);
  sim.applyDamageToHero('Mage', 30);
  assert.equal(sim.heroes.Mage.downed, true, 'Mage must go down in 4 unprotected hits of 30 dmg');
  // Restore Mage HP for remaining checks
  sim.heroes.Mage.downed = false;
  sim.heroes.Mage.hp = 120;

  // 7B. Hold Attack (Shatterlance): supports continuous Hold-LMB Shatterlance without forced 3-cast fallback
  const ch1 = sim.mageHoldChargedAttack();
  const ch2 = sim.mageHoldChargedAttack();
  const ch3 = sim.mageHoldChargedAttack();
  const ch4 = sim.mageHoldChargedAttack();
  assert.equal(ch1.fallbackToNormal, false);
  assert.equal(ch2.fallbackToNormal, false);
  assert.equal(ch3.fallbackToNormal, false);
  assert.equal(ch4.fallbackToNormal, false);
  assert.equal(sim.heroes.Mage.consecutiveChargedCount, 4);

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

  // 7D. Mage Q (6.0s Mobile Sky Meteor Shower after 0.8s cast pose):
  // - While active, if Knight holds Shield Block, Knight intercepts the enemy hit and saves the Mage!
  // - If Knight is NOT shielding, taking a hit deals normal HP damage without instant-downing Mage or cancelling Sky Meteor Shower!
  const qStorm = sim.mageCastStormCataclysm();
  assert.equal(qStorm.activated, true);
  assert.equal(qStorm.stationary, false);
  assert.equal(qStorm.vulnerableOneHitDown, false);
  assert.equal(qStorm.duration, MAGE_STORM_CATACLYSM_DURATION);
  assert.equal(sim.heroes.Mage.stormCataclysmActive, true);

  sim.knightHoldShieldBlock(true);
  const protectedHit = sim.applyDamageToHero('Mage', 32);
  assert.equal(protectedHit.interceptedByKnight, true, 'Shielding Knight must intercept attack aimed at Mage');
  assert.equal(sim.heroes.Mage.downed, false);
  assert.equal(sim.heroes.Mage.stormCataclysmActive, true);

  // Drop Knight's shield -> 1 unprotected hit of 12 dmg reduces Mage HP to 108 without instant-downing her!
  sim.knightHoldShieldBlock(false);
  const unprotectedHit = sim.applyDamageToHero('Mage', 12);
  assert.equal(unprotectedHit.downed, false, 'Mage Q no longer instant-downs on 1 unprotected hit');
  assert.equal(sim.heroes.Mage.hp, 108);
  assert.equal(sim.heroes.Mage.stormCataclysmActive, true);
});

/* ------------------------------------------------------------------------- */
/* 6. Removal of Partner Distance Restrictions & Indicator Clutter           */
/* ------------------------------------------------------------------------- */

await check('8. Partner Commune (<= 6.0m) & Blessing Tether (<= 6.0m) distances and hidden indicator clutter work deterministically', () => {
  assert.equal(COMMUNE_MAX_DISTANCE, 6.0);
  assert.equal(POWERUP_TETHER_DISTANCE, 6.0);

  const scene = new THREE.Scene();
  const sfx = createCombatSfx();
  const loop = createCampaignLoop({
    scene,
    walkableHeightAt: () => 0,
    combatSfx: sfx,
  });

  // Partners within 3.6m can Commune and share Blessing tether
  const heroStates = {
    Knight: { x: -1.8, y: 0, z: 0, yaw: 0 },
    Mage: { x: 1.8, y: 0, z: 0, yaw: 0 },
  };
  assert.equal(loop.canCommuneTogether(heroStates).allowed, true);
  assert.equal(loop.isWithinPowerupTether(heroStates), true);

  loop.update(0.016, { heroStates });
  assert.equal(loop.crestAndTetherMesh.visible, false, 'crestAndTetherMesh must remain hidden');
  assert.equal(loop.groundIndicatorMesh.visible, false, 'groundIndicatorMesh must remain hidden');
});

/* ------------------------------------------------------------------------- */
/* 7. Soft-Lock, 4-Token Cap, Two-Tier Detonations & Full 3-Act Campaign Sim */
/* ------------------------------------------------------------------------- */

await check('9. selectSoftLockTarget, allocateAttackTokens (3 tokens), Two-Tier Detonations & Boss Bone Aegis work deterministically', () => {
  const origin = { x: 0, z: 0 };
  const enemies = [
    { id: 'behind', x: 0, z: -12, hp: 100, dead: false, active: true },
    { id: 'in_cone_marked', x: 1.0, z: 9, hp: 100, dead: false, active: true, mark: 'rime' },
  ];
  assert.equal(selectSoftLockTarget(origin, 0, enemies)?.id, 'in_cone_marked');

  const tokenPool = [
    { id: 'e1', hp: 100, dead: false, active: true, distToTarget: 3.0, aiState: 'windup', targetHeroId: 'Knight' },
    { id: 'e2', hp: 100, dead: false, active: true, distToTarget: 4.0, isBoss: true, targetHeroId: 'Knight' },
    { id: 'e3', hp: 100, dead: false, active: true, distToTarget: 2.5, targetHeroId: 'Mage' },
    { id: 'e4', hp: 100, dead: false, active: true, distToTarget: 5.0, targetHeroId: 'Mage' },
    { id: 'e5', hp: 100, dead: false, active: true, distToTarget: 6.0, targetHeroId: 'Knight' },
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

  // Basic combo3 of same element ('rime') must NOT self-detonate 'rime' mark!
  const basicSameElem = applyHitAndResolveDetonation(
    boss,
    { source: 'combo3', baseDmg: 38, infusion: 'rime' },
    [boss]
  );
  assert.equal(basicSameElem.detonation, null, 'Basic combo3 of same element must NOT self-detonate');
  assert.equal(boss.aegisLayers, 2);

  // Tier 1 Heavy Finisher ('combo4') of same element ('rime') triggers RIME SHATTER! (42 AoE Dmg) and breaks 1 aegis layer!
  const tier1Shatter = applyHitAndResolveDetonation(
    boss,
    { source: 'combo4', baseDmg: 46, infusion: 'rime' },
    [boss]
  );
  assert.equal(tier1Shatter.detonation?.id, 'rime_shatter');
  assert.equal(tier1Shatter.detonation?.bonusDmg, 42);
  assert.equal(boss.aegisLayers, 1);

  // Tier 2 Cross-Element ('solar' mark + 'rime' Frost Lance) triggers SOLAR FLARE! (70 AoE Dmg) and breaks final aegis layer!
  applyHitAndResolveDetonation(boss, { source: 'cinder_fall', baseDmg: 54, applyMark: 'solar' }, [boss]);
  const tier2Cross = applyHitAndResolveDetonation(
    boss,
    { source: 'frost_lance', baseDmg: 48, applyMark: 'rime' },
    [boss]
  );
  assert.equal(tier2Cross.detonation?.id, 'solar_flare');
  assert.equal(tier2Cross.detonation?.bonusDmg, 70);
  assert.equal(boss.aegisLayers, 0);
  assert.equal(boss.aegisActive, false);
});

await check('10. Full 3-Act Valley Expedition & Pooled Enemy Manager (8 concurrent cap, pool fallback, active strafing, Road Vanguard Pack & Solo Wingman Synergy) pass 100%', async () => {
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

  assert.equal(em.poolSlots.length, 10); // encounter design: per-role rigs incl. Golem + Necromancer
  assert.equal(em.telegraphRingMesh.visible, false, 'telegraphRingMesh must stay permanently hidden');
  em.spawnWave(ACT_DEFINITIONS.act1_arena.waves[1], 'act1_arena');
  assert.equal(em.visibleCount, 6, 'All 6 enemies in Wave 2 spawn concurrently under MAX_CONCURRENT_ENEMIES = 8');
  assert.equal(em.spawnQueue.length, 0);
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

  // Mage Q 6s Sky Meteor Shower + Knight Shield Block interception in liveLoop
  const mUlt = liveLoop.performMageStormCataclysm({
    Mage: { x: 72, y: 0.6, z: -6, yaw: 0 },
  });
  assert.equal(mUlt.ultimate, 'storm_cataclysm');
  assert.equal(mUlt.duration, 6.0);
  assert.equal(mUlt.stationary, false);

  liveLoop.setKnightShieldBlocking(true);
  const intercepted = liveLoop.handlePlayerHit({ id: 'Mage' }, em.activeEnemies[0], 30);
  assert.equal(intercepted.interceptedByKnight, true);
  assert.equal(liveLoop.combatHeroes.Mage.downed, false);

  liveLoop.setKnightShieldBlocking(false);
  const hitDuringCataclysm = liveLoop.handlePlayerHit({ id: 'Mage' }, em.activeEnemies[0], 15);
  assert.equal(hitDuringCataclysm.downed, false);
  assert.equal(liveLoop.combatHeroes.Mage.hp, 105);
  assert.equal(liveLoop.combatHeroes.Mage.stormCataclysmActive, true);
});

await check('11. Phase 1 Combat Upgrades: Shatterlance (0.8..18.0m single-hit deduplication), 3D Skeleton_Mage dodgeable bolts, and 2.5s Proximity Revive', async () => {
  // 11A. projectAimRayToGround supports Shatterlance variable 0.8..18.0m range
  const shatterPointBlank = projectAimRayToGround({
    origin: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 1.05,
    spellId: 'shatterlance',
  });
  const shatterFar = projectAimRayToGround({
    origin: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0.04,
    spellId: 'shatterlance',
  });
  assert.ok(shatterPointBlank.distance >= 0.8 && shatterPointBlank.distance <= 1.6);
  assert.ok(shatterFar.distance >= 17.5 && shatterFar.distance <= 18.0);

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

  let playerHits = [];
  const em = await createEnemyManager({
    scene: new THREE.Scene(),
    kit: mockKit,
    walkableHeightAt: () => 0.0,
    resolveCollisions: (x, z) => ({ x, z, wrapped: false }),
    onPlayerHit: (targetHero, enemy, dmg, opts) => {
      playerHits.push({ heroId: targetHero.id, dmg, opts });
    },
  });

  const loop = createCampaignLoop({
    scene: new THREE.Scene(),
    walkableHeightAt: () => 0.0,
    enemyManager: em,
    combatSfx: createCombatSfx(),
  });

  // 11B. Shatterlance at 0.8m point-blank hits an enemy at 0.85m AND never double-hits an enemy inside both ray & eruption
  const closeEnemy = em.spawnImmediateFromSpec({ archetype: 'warrior', x: 68.0, z: -3.15 });
  closeEnemy.hp = 500;
  closeEnemy.maxHp = 500;
  const castClose = loop.castSpell(
    'shatterlance',
    { x: 68.0, y: 0, z: -4.0 },
    0,
    { x: 66.5, y: 0, z: -4.0 },
    { distance: 0.8, ignoreCooldown: true }
  );
  assert.equal(castClose.distance, 0.8);
  assert.equal(castClose.hits.length, 1, 'Enemy in both ray and eruption must be hit exactly ONCE');
  assert.equal(500 - closeEnemy.hp, SPELLS.shatterlance.dmg);

  // 11C. Skeleton_Mage fires a real 3D projectile that can be dodged or intercepted by Knight Shield Block
  em.clearAllEnemies();
  playerHits = [];
  em.spawnEnemyProjectile({
    origin: { x: 0, y: 1.25, z: 0 },
    targetPos: { x: 0, y: 1.05, z: 6.0 },
    speed: 11.5,
    dmg: 18,
    targetHeroId: 'Mage',
  });
  assert.equal(em.activeProjectiles.length, 1);

  // Step projectile while Knight shields in front at z = 3.0m -> Knight physically intercepts the bolt!
  for (let i = 0; i < 20; i++) {
    em.update(0.025, {
      Knight: { id: 'Knight', x: 0, y: 0, z: 3.0, yaw: Math.PI, shieldBlocking: true },
      Mage: { id: 'Mage', x: 0, y: 0, z: 6.0, yaw: Math.PI },
    });
  }
  assert.equal(em.activeProjectiles.length, 0, 'Shielding Knight must intercept the projectile');
  assert.equal(playerHits.length, 1);
  assert.equal(playerHits[0].heroId, 'Knight');
  assert.equal(playerHits[0].opts?.interceptedByKnight, true);

  // 11D. 2.5s interruptible co-op proximity revive (<= 2.8m restores 45% Max HP + 2.0s i-frames)
  loop.combatHeroes.Mage.downed = true;
  loop.combatHeroes.Mage.hp = 0;
  const nearHeroes = {
    Knight: { id: 'Knight', x: 0, y: 0, z: 0, yaw: 0 },
    Mage: { id: 'Mage', x: 1.5, y: 0, z: 0, yaw: 0 },
  };
  loop.update(1.2, { heroStates: nearHeroes, soloWingmanActive: false });
  assert.equal(loop.combatHeroes.Mage.downed, true);
  assert.ok(loop.combatHeroes.Mage.reviveProgress > 0.4);

  // Taking unblocked damage (> 5) interrupts reviveTimer back to 0!
  loop.handlePlayerHit(nearHeroes.Knight, closeEnemy, 15);
  assert.equal(loop.combatHeroes.Mage.reviveTimer, 0);

  // Hardcore revive rule: partner within 2.5 m for 2.5 s -> 35% Max HP with 1.0 s i-frames.
  for (let s = 0; s < 26; s++) {
    loop.update(0.1, { heroStates: nearHeroes, soloWingmanActive: false });
  }
  assert.equal(loop.combatHeroes.Mage.downed, false);
  assert.equal(loop.combatHeroes.Mage.hp, Math.round(HERO_STATS.Mage.maxHp * 0.35));
  assert.ok(loop.combatHeroes.Mage.iframeTimer > 0, "revive grants i-frames");
});

await check('12. Phase 2 Proportional Divine Prayer & Phase 4 Night Demon Tree + Summoned Bats (10.0s summon timer, max 2 bats, 1.2m swoop)', async () => {
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
    walkableHeightAt: () => 0.0,
    resolveCollisions: (x, z) => ({ x, z, wrapped: false }),
  });

  const loop = createCampaignLoop({
    scene: new THREE.Scene(),
    walkableHeightAt: () => 0.0,
    enemyManager: em,
    combatSfx: createCombatSfx(),
  });

  // 12A. Proportional Prayer Verdicts (selfish_penalty -20 HP, sarcastic_pat +1 HP, grace +25 HP)
  loop.combatHeroes.Knight.hp = 60;
  loop.combatHeroes.Mage.hp = 50;
  const hStates = {
    Knight: { id: 'Knight', x: 0, y: 0, z: 0 },
    Mage: { id: 'Mage', x: 2, y: 0, z: 0 },
  };
  const patRes = loop.applyCommuneVerdict({ verdict: 'sarcastic_pat', hpDelta: 1 }, 'Knight', hStates);
  assert.equal(patRes.verdict, 'sarcastic_pat');
  assert.equal(loop.combatHeroes.Knight.hp, 61);
  assert.equal(loop.combatHeroes.Mage.hp, 51);

  const graceRes = loop.applyCommuneVerdict({ verdict: 'grace', hpDelta: 25 }, 'Knight', hStates);
  assert.equal(graceRes.verdict, 'grace');
  assert.equal(loop.combatHeroes.Knight.hp, 86);
  assert.equal(loop.combatHeroes.Mage.hp, 76);

  const selfishRes = loop.applyCommuneVerdict({ verdict: 'selfish_penalty', hpDelta: -20 }, 'Knight', hStates);
  assert.equal(selfishRes.verdict, 'selfish_penalty');
  assert.equal(loop.combatHeroes.Knight.hp, 66);

  // 12B. Night Demon Tree stationary root slam + 10.0s Bat Summon Cooldown (max 2 active bats)
  em.clearAllEnemies();
  const tree = em.spawnImmediateFromSpec({ archetype: 'demon_tree', x: 44.0, z: 16.0 });
  assert.equal(tree.isStationary, true);
  assert.equal(tree.batSummonCooldown, 10.0);
  assert.equal(tree.maxActiveBats, 2);

  // First tick triggers summon of 2 bats and sets batSummonTimer = 10.0s immediately
  em.update(0.1, {
    Knight: { id: 'Knight', x: 44.0, y: 0, z: 22.0 },
    Mage: { id: 'Mage', x: 46.0, y: 0, z: 24.0 },
  });
  const batsWave1 = em.activeEnemies.filter((e) => e.archetype === 'summoned_bat');
  assert.equal(batsWave1.length, 2, 'Demon Tree must summon max 2 active bats');
  assert.equal(tree.batSummonTimer, 10.0, '10.0s cooldown must start at summon timestamp');
  assert.equal(batsWave1[0].targetHeroId, 'Mage', 'Summoned bats must prioritize Mage (Ishika)');
  assert.ok(Math.abs(batsWave1[0].y - 2.35) < 0.05, 'Flying bats hover at y = 2.35m while approaching');

  // If players kill both bats after 2.0s, Demon Tree must wait remaining 8.0s before summoning again!
  em.update(2.0, {
    Knight: { id: 'Knight', x: 44.0, y: 0, z: 22.0 },
    Mage: { id: 'Mage', x: 46.0, y: 0, z: 24.0 },
  });
  for (const b of batsWave1) {
    em.applyHitToEnemy(b, { dmg: 200, source: 'combo1' });
  }
  for (let k = 0; k < 10; k++) {
    em.update(0.1, {
      Knight: { id: 'Knight', x: 44.0, y: 0, z: 22.0 },
      Mage: { id: 'Mage', x: 46.0, y: 0, z: 24.0 },
    });
  }
  assert.equal(
    em.activeEnemies.filter((e) => !e.dead && e.archetype === 'summoned_bat').length,
    0,
    'No new bats may spawn while batSummonTimer > 0 (remaining ~7.0s)'
  );

  // Advance remaining 7.2s -> batSummonTimer reaches 0 and 2 new bats summon!
  for (let k = 0; k < 72; k++) {
    em.update(0.1, {
      Knight: { id: 'Knight', x: 44.0, y: 0, z: 22.0 },
      Mage: { id: 'Mage', x: 46.0, y: 0, z: 24.0 },
    });
  }
  const batsWave2 = em.activeEnemies.filter((e) => !e.dead && e.archetype === 'summoned_bat');
  assert.equal(batsWave2.length, 2, '2 new bats summon once the 10.0s timer from last summon expires');

  // When a bat enters windup/attack window, it swoops down to y = 1.20m so Knight melee can cleave it!
  batsWave2[0].aiState = 'windup';
  batsWave2[0].windupTimer = 0.1;
  em.update(0.05, {
    Knight: { id: 'Knight', x: 44.0, y: 0, z: 22.0 },
    Mage: { id: 'Mage', x: 46.0, y: 0, z: 24.0 },
  });
  assert.ok(Math.abs(batsWave2[0].y - 1.2) < 0.05, 'Attacking bat must swoop to y = 1.2m');

  // Vanquishing the Night Demon Tree sets groveTreeVanquished = true (revealing the Grove Medallion!)
  assert.equal(em.groveTreeVanquished, false);
  em.applyHitToEnemy(tree, { dmg: 999, source: 'couples_ultimate' });
  assert.equal(em.groveTreeVanquished, true);
});

await check('13. Final Playable Master Plan: Knight E Summon Lock on Tab, Shared Q Kill-Energy + Detonation + Boss Phase Fill (Knight 100 / Mage 160), Two-Tier Commune (Mode A vs Mode B + 2.5s Tether Grace), and 1->3->2 Out-of-Order Stone Bitmask', async () => {
  const { createEnemyManager } = await import('../src/combat/enemy-manager.js');
  const { createRoomProgressionState } = await import('../src/net/room-progression.js');
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

  let loop = null;
  const em = await createEnemyManager({
    scene: new THREE.Scene(),
    kit: mockKit,
    walkableHeightAt: () => 0.0,
    resolveCollisions: (x, z) => ({ x, z, wrapped: false }),
    onEnemyKilled: (enemy, res) => loop?.awardKnightKillXp?.(enemy, res),
    onBossPhaseThreshold: (payload) => loop?.handleBossPhaseThreshold?.(payload),
  });

  loop = createCampaignLoop({
    scene: new THREE.Scene(),
    walkableHeightAt: () => 0.0,
    enemyManager: em,
    combatSfx: createCombatSfx(),
  });

  const hStates = {
    Knight: { id: 'Knight', x: 0, y: 0, z: 10.0, yaw: 0 },
    Mage: { id: 'Mage', x: 0.4, y: 0, z: 10.0, yaw: 0 },
  };

  // 13A. Knight E Summon Lock on Tab: pressing Tab while Ice Sword is active queues 'fire' without changing the active Ice Sword!
  assert.equal(loop.combatHeroes.Knight.selectedElement, 'ice');
  const sumIce = loop.performPartnerSkill('Knight', hStates);
  assert.equal(sumIce.summonedElement, 'ice');
  assert.equal(loop.combatHeroes.Knight.summonedElement, 'ice');
  assert.equal(loop.combatHeroes.Knight.breathingStyle, 'rime');

  const tabWhileActive = loop.toggleHeroElement('Knight');
  assert.equal(tabWhileActive.element, 'fire', 'Tab must queue fire as selectedElement');
  assert.equal(loop.combatHeroes.Knight.summonedElement, 'ice', 'Active summoned sword element must remain locked to ice');
  assert.equal(loop.combatHeroes.Knight.breathingStyle, 'rime', 'Active sword breathingStyle must remain rime until E expires');

  // Mage casting cinder_fall while Knight's E sword is active must NOT overwrite Knight's summoned Ice Sword!
  loop.castSpell('cinder_fall', hStates.Mage, 0, hStates.Knight, { ignoreCooldown: true });
  assert.equal(loop.combatHeroes.Knight.breathingStyle, 'rime');

  // 13B. Shared Q Kill-Energy + Cross-Element Detonation (+20 both) + Boss Phase Thresholds (+35 both at 70% & 35% HP)
  assert.equal(loop.combatHeroes.Knight.qEnergyMax, 100);
  assert.equal(loop.combatHeroes.Mage.qEnergyMax, 160);
  loop.combatHeroes.Knight.qEnergy = 0;
  loop.combatHeroes.Mage.qEnergy = 0;

  // Require energy check blocks Q when gauge < max
  const blockedK = loop.performKnightUltimate(hStates, { requireEnergy: true });
  assert.equal(blockedK.notEnoughEnergy, true);

  // Kill a fodder minion (qEnergyReward = 18) with Knight -> +18 to Knight (100%), +11 to Mage (60%)
  const fodder = em.spawnImmediateFromSpec({ archetype: 'skeleton_minion', x: 0, z: 12.0 });
  loop.performKnightSwing('combo4', hStates.Knight, 0, hStates.Mage);
  loop.performKnightSwing('combo4', hStates.Knight, 0, hStates.Mage);
  assert.equal(fodder.dead, true);
  assert.equal(loop.combatHeroes.Knight.qEnergy, 18);
  assert.equal(loop.combatHeroes.Mage.qEnergy, 11);

  // Spawn a Boss and cross 70% & 35% HP thresholds + trigger a Cross-Element Detonation
  em.clearAllEnemies();
  const boss = em.spawnImmediateFromSpec({ archetype: 'boss_sovereign', x: 0.2, z: 12.2 });
  boss.maxHp = 200;
  boss.hp = 142;
  // Mage marks boss with frost_lance (+8 Mage, +5 Knight for hitting Boss, plus crosses 70% threshold -> +35 both!)
  loop.castSpell('frost_lance', hStates.Mage, 0, hStates.Knight, { ignoreCooldown: true });
  assert.equal(boss.phase70Triggered, true);
  assert.ok(loop.combatHeroes.Knight.qEnergy >= 58);
  assert.ok(loop.combatHeroes.Mage.qEnergy >= 54);

  // Top up Knight to 100 and cast Knight Q (12.0s Twin-Element Eclipse Blade, 2.0x damage, applies BOTH burn + slow)
  loop.addHeroQEnergy('Knight', 100);
  assert.equal(loop.combatHeroes.Knight.qEnergy, 100);
  const kUlt = loop.performKnightUltimate(hStates, { requireEnergy: true });
  assert.equal(kUlt.ultimate, 'knight_sky_lightning');
  assert.equal(kUlt.duration, 12.0);
  assert.equal(kUlt.breathingStyle, 'eclipse');
  assert.equal(loop.combatHeroes.Knight.qEnergy, 0, 'Casting Knight Q consumes 100 Q Energy');
  assert.ok(boss.burnTimer > 0 && boss.iceSlowTimer > 0, 'Twin-Element Blade must apply BOTH Fire Burn and Ice Slow');

  // Top up Mage to 160 and cast Mage Q (6.0s Sky Meteor Shower, capped at 3 meteor hits per single boss)
  em.clearAllEnemies();
  const soloBoss = em.spawnImmediateFromSpec({ archetype: 'boss_sovereign', x: 0.4, z: 14.5 });
  soloBoss.maxHp = 2000;
  soloBoss.hp = 2000;
  loop.addHeroQEnergy('Mage', 160);
  assert.equal(loop.combatHeroes.Mage.qEnergy, 160);
  const mUlt = loop.performMageStormCataclysm(hStates, { requireEnergy: true });
  assert.equal(mUlt.ultimate, 'storm_cataclysm');
  assert.equal(loop.combatHeroes.Mage.qEnergy, 0, 'Casting Mage Q consumes 160 Q Energy');
  for (let i = 0; i < 62; i++) {
    loop.update(0.1, { heroStates: hStates, soloWingmanActive: false });
  }
  assert.equal(
    loop.combatHeroes.Mage.stormCataclysmHitCounts.get(soloBoss),
    3,
    'Single boss must take at most 3 meteor hits from a 10-meteor Sky Meteor Shower'
  );

  // 13C. Two-Tier Commune: Mode A In-Place Heal (+30% Max HP, 25s CD, zero Eclipse) vs Mode B Emergency Divine Miracle (90s CD, 25s Blessing, 2.5s Tether Grace)
  loop.combatHeroes.Knight.hp = 100;
  loop.combatHeroes.Mage.hp = 60;
  const modeARes = loop.applyCommuneVerdict(
    { verdict: 'heal', prayerMode: 'field_heal', hpDeltaPct: 0.30 },
    'Knight',
    hStates
  );
  assert.equal(modeARes.prayerMode, 'field_heal');
  assert.equal(modeARes.sequenceActive, false, 'Mode A must heal in place without 4.8s underground sequence');
  assert.equal(loop.combatHeroes.Knight.hp, 166, 'Knight +30% of 220 Max HP = +66 HP');
  assert.equal(loop.combatHeroes.Mage.hp, 96, 'Mage +30% of 120 Max HP = +36 HP');
  assert.equal(loop.modeAHealCd, 25.0);
  assert.equal(loop.isDivineBlessingActive(), false);

  // Stage 1 Altar Awakening triggers 3.5s Eclipse; Stone 2 Riddle does NOT trigger Eclipse
  const stg1Awaken = loop.applyCommuneVerdict(
    { verdict: 'awakening', prayerMode: 'awakening', unlocksStage: true, stageUnlocked: 1 },
    'Knight',
    hStates
  );
  assert.equal(stg1Awaken.awakeningEclipseActive, true);
  assert.equal(loop.awakeningEclipseTimer, 3.5);
  loop.update(3.6, { heroStates: hStates, soloWingmanActive: false });
  assert.equal(loop.awakeningEclipseTimer, 0);

  const stone2Awaken = loop.applyCommuneVerdict(
    { verdict: 'awakening', prayerMode: 'awakening', unlocksStage: true, stageUnlocked: 2, stoneSolvedId: 'stone_grove' },
    'Knight',
    hStates
  );
  assert.equal(stone2Awaken.awakeningEclipseActive, false);

  // Mode B Emergency Divine Miracle activates 4.8s sequence -> 25s Blessing with 2.5s Tether Grace
  loop.combatHeroes.Mage.hp = 20;
  const modeBRes = loop.applyCommuneVerdict(
    { verdict: 'miracle', prayerMode: 'divine_miracle', hpDeltaPct: 1.0 },
    'Knight',
    hStates
  );
  assert.equal(modeBRes.prayerMode, 'divine_miracle');
  assert.equal(modeBRes.sequenceActive, true);
  assert.equal(loop.modeBMiracleCd, 90.0);
  loop.update(4.85, { heroStates: hStates, soloWingmanActive: false });
  assert.equal(loop.isDivineBlessingActive(), true);
  assert.equal(loop.getDivineBlessingRemaining(), 25.0);

  // Move > 6.0m apart for 1.5s (< 2.5s grace) -> Blessing stays active; move > 6.0m for another 1.1s (>= 2.5s) -> Blessing snaps!
  hStates.Knight.x = 0;
  hStates.Mage.x = 7.5;
  loop.update(1.5, { heroStates: hStates, soloWingmanActive: false });
  assert.equal(loop.isDivineBlessingActive(), true, '2.5s tether grace timer must protect against brief separation');
  loop.update(1.1, { heroStates: hStates, soloWingmanActive: false });
  assert.equal(loop.isDivineBlessingActive(), false, 'Blessing snaps after 2.5s outside 6.0m tether');

  // 13D. Connected 1 -> 3 -> 2 Out-of-Order Stone Bitmask Progression
  const prog = createRoomProgressionState();
  prog.applyVerdictProgression({ unlocksStage: true, stageUnlocked: 1, stoneSolvedId: 'stone_well' });
  assert.equal(prog.getState().stonesSolvedMask, 0b001);
  assert.equal(prog.getState().unlockedStage, 1);

  prog.applyVerdictProgression({ unlocksStage: true, stoneSolvedId: 'stone_cottage_wall' });
  assert.equal(prog.getState().stonesSolvedMask, 0b101);
  assert.equal(prog.getState().unlockedStage, 2);
  assert.equal(prog.getState().fireUnlocked, true);

  prog.applyVerdictProgression({ unlocksStage: true, stoneSolvedId: 'stone_grove' });
  assert.equal(prog.getState().stonesSolvedMask, 0b111);
  assert.equal(prog.getState().unlockedStage, 3);
  assert.equal(prog.getState().ultimateUnlocked, true);
});

await check('14. Overhaul Verification: 8-Slot Pool Fallback, Active Cooldown Circle-Strafing, Elite Windup Super-Armor, South Road Vanguard Pack, 22-28s Survival Waves & Solo Wingman Opposite-Element Synergy', async () => {
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
    walkableHeightAt: () => 0.0,
    resolveCollisions: (x, z) => ({ x, z, wrapped: false }),
  });

  // 14A. 8-Slot Pool Fallback when requesting 4 of the same archetype (only 2 dedicated slots)
  em.clearAllEnemies();
  for (let i = 0; i < 8; i++) {
    em.spawnImmediateFromSpec({ archetype: 'skeleton_warrior', x: i * 1.5, z: 10.0 });
  }
  assert.equal(em.activeEnemies.length, 8, 'Pool fallback must allow full 8 concurrent enemies even if same archetype');
  assert.equal(em.visibleCount, 8);

  // 14B. Active Cooldown Circle-Strafing (Never stand still in idle when hasAttackToken && cooldownTimer > 0)
  em.clearAllEnemies();
  const rusher = em.spawnImmediateFromSpec({ archetype: 'skeleton_rogue', x: 0.0, z: 1.8 });
  rusher.spawnAnimTimer = 0;
  rusher.cooldownTimer = 0.8;
  const startX = rusher.x;
  em.update(0.1, {
    Knight: { id: 'Knight', x: 0, y: 0, z: 0, yaw: 0 },
    Mage: { id: 'Mage', x: 5, y: 0, z: 5, yaw: 0 },
  });
  assert.equal(rusher.hasAttackToken, true);
  assert.notEqual(rusher.char.anim.currentKey, 'idle', 'Token holder on cooldown must circle-strafe, never idle');
  assert.ok(Math.abs(rusher.x - startX) > 0.05, 'Token holder on cooldown must physically move to flank');

  // 14C. Elite/Boss Windup Super-Armor: basic hit does NOT cancel windup; Detonation or Intercept DOES
  em.clearAllEnemies();
  const elite = em.spawnImmediateFromSpec({ archetype: 'black_knight', x: 0, z: 2.0 });
  elite.aiState = 'windup';
  elite.windupTimer = 0.20;
  elite.shieldGuarding = false;
  em.applyHitToEnemy(elite, { source: 'combo1', baseDmg: 22, infusion: 'rime', attackerPos: { x: 0, z: 0 } });
  assert.equal(elite.aiState, 'windup', 'Elite in windup must have super-armor against basic combo1');
  assert.equal(elite.mark, 'rime');

  // Now hit the rime-marked elite with opposite-element Fire ('solar') -> SHATTERBLOW! breaks windup super-armor!
  const detRes = em.applyHitToEnemy(elite, { source: 'combo3', baseDmg: 38, infusion: 'solar', attackerPos: { x: 0, z: 0 } });
  assert.equal(detRes.detonation?.id, 'shatterblow');
  assert.equal(elite.aiState, 'orbit', 'Cross-element detonation must interrupt Elite windup super-armor');
  assert.ok(elite.stunTimer >= 1.0);

  // 14D. Immediate South Road Vanguard Pack & Fast 22-28s Survival Waves
  em.clearAllEnemies();
  const loop = createCampaignLoop({
    scene: new THREE.Scene(),
    walkableHeightAt: () => 0.0,
    enemyManager: em,
    combatSfx: createCombatSfx(),
    openValleyMode: true,
  });
  loop.setUnlockedStage(2, 0b011);
  assert.equal(loop.survivalWaveTimer, 6.0, 'Initial survivalWaveTimer must be 6.0s');

  // First update near Flower Field start (0, 124) automatically spawns the 4-enemy South Road Vanguard Pack
  const startHeroes = {
    Knight: { id: 'Knight', x: 0, y: 0, z: 124.0, yaw: Math.PI },
    Mage: { id: 'Mage', x: 1.6, y: 0, z: 124.0, yaw: Math.PI },
  };
  loop.update(0.1, { heroStates: startHeroes, activeHeroId: 'Knight', soloWingmanActive: false });
  assert.equal(em.activeEnemies.length, 4, 'South Road Vanguard Pack of 4 hunters must spawn automatically near z = 124');
  for (const e of em.activeEnemies) {
    assert.ok(e.z >= 95.0 && e.z <= 105.0, `Vanguard enemy z (${e.z}) must be in [96..104] road zone`);
  }

  // Trigger a survival wave at z = 124 -> must clamp within [-148, 148] (not [-108, 108]) and set 22..28s timer
  const waveDef = loop.triggerSurvivalWave(startHeroes.Knight);
  assert.ok(waveDef.spawns.length >= 4 && waveDef.spawns.length <= 7);
  assert.ok(loop.survivalWaveTimer >= 22.0 && loop.survivalWaveTimer <= 28.0);
  assert.ok(waveDef.spawns.some((s) => s.z > 108.0), 'Survival wave at z=124 must not be clamped to z<=108');

  // 14E. Solo AI Wingman Opposite-Element Synergy (AI Mage casts cinder_fall while Human Knight has Ice Sword 'rime' without overwriting Knight's 'rime' blade!)
  loop.performPartnerSkill('Knight', startHeroes);
  assert.equal(loop.combatHeroes.Knight.breathingStyle, 'rime');
  for (let i = 0; i < 20; i++) {
    loop.update(0.1, { heroStates: startHeroes, activeHeroId: 'Knight', soloWingmanActive: true });
  }
  assert.equal(
    loop.combatHeroes.Knight.breathingStyle,
    'rime',
    'AI Wingman Mage casting opposite-element spell must NEVER overwrite Human Knight active rime blade'
  );
  assert.ok(
    em.activeEnemies.some((e) => e.mark === 'solar' || e.hp < e.maxHp),
    'AI Wingman Mage must cast opposite-element cinder_fall even while Knight breathingStyle !== none'
  );
});

await check('11. Refinement pass: single shield DR on intercept, level cap, passive-stack cap, self-detonation penalty', () => {
  const sim = createHeadlessCampaignSim();
  sim.knightHoldShieldBlock(true);
  const intercept = sim.applyDamageToHero('Mage', 50);
  assert.equal(intercept.interceptedByKnight, true);
  assert.equal(intercept.knightHpLost, 10, 'Intercepted 50 dmg must cost the Knight 10 (80% DR applied once)');
  sim.knightHoldShieldBlock(false);

  assert.equal(getKnightLevelStats(9).level, KNIGHT_MAX_LEVEL);

  const mk = () => ({ hp: 2000, maxHp: 2000, x: 0, z: 0, mark: null });
  const capped = mk();
  const capRes = applyHitAndResolveDetonation(capped, {
    source: 'combo1', baseDmg: 100, infusion: 'solar', empoweredBreathing: true, perfectDodgeBuff: true,
  }, [capped]);
  const plain = mk();
  const plainRes = applyHitAndResolveDetonation(plain, { source: 'combo1', baseDmg: 100, infusion: 'none' }, [plain]);
  assert.ok(capRes.damageDealt <= Math.ceil((plainRes.damageDealt + 30) * MORTAL_DMG_MULT_CAP));

  const selfE = mk();
  selfE.mark = 'rime'; selfE.markTimer = 5; selfE.markOwner = 'Knight';
  const selfRes = applyHitAndResolveDetonation(selfE, { source: 'combo4', baseDmg: 0, heroId: 'Knight' }, [selfE]);
  const partnerE = mk();
  partnerE.mark = 'rime'; partnerE.markTimer = 5; partnerE.markOwner = 'Mage';
  const partnerRes = applyHitAndResolveDetonation(partnerE, { source: 'combo4', baseDmg: 0, heroId: 'Knight' }, [partnerE]);
  assert.ok(partnerRes.damageDealt > selfRes.damageDealt * 2, 'Partner-primed detonations must hit much harder');
});

await check('12. Refinement pass: partner revive by proximity, full wipe restarts the act at full HP without free shield', () => {
  const loop = createCampaignLoop({ scene: new THREE.Scene(), walkableHeightAt: () => 0, combatSfx: createCombatSfx() });
  const heroStates = { Knight: { x: 0, y: 0, z: 0, yaw: 0 }, Mage: { x: 1, y: 0, z: 0, yaw: 0 } };
  loop.combatHeroes.Mage.hp = 0;
  loop.combatHeroes.Mage.downed = true;
  for (let i = 0; i < 60; i++) loop.update(0.05, { heroStates, soloWingmanActive: false });
  assert.equal(loop.combatHeroes.Mage.downed, false, 'Standing beside a downed partner for 2.5s revives them');
  assert.equal(loop.combatHeroes.Mage.hp, Math.round(HERO_STATS.Mage.maxHp * 0.35));

  loop.combatHeroes.Knight.downed = true;
  loop.combatHeroes.Knight.hp = 0;
  loop.combatHeroes.Mage.downed = true;
  loop.combatHeroes.Mage.hp = 0;
  for (let i = 0; i < 40; i++) loop.update(0.1, { heroStates, soloWingmanActive: false });
  assert.equal(loop.combatHeroes.Knight.downed, false);
  assert.equal(loop.combatHeroes.Knight.hp, HERO_STATS.Knight.maxHp);
  assert.equal(loop.combatHeroes.Knight.shield, 0, 'No free rebirth shield after a wipe');
});

const failedCount = process.exitCode ? 'SOME' : 0;
if (failedCount) {
  console.error(`\n${passed} PASSED, SOME WAVE 2B COMBAT & CAMPAIGN TESTS FAILED (see FAIL above)\n`);
} else {
  console.log(`\nALL ${passed} WAVE 2B COMBAT & CAMPAIGN TESTS PASSED!\n`);
}
