// ============================================================================
// world/src/combat/combat-balance.js
//
// Pure-JS, Zero-DOM/WebGL Combat Balance, Synergy Rules, Soft-Lock Cone Target
// Acquisition, 3-Attacker Token Allocator, Dynamic Threat & Aggro AI
// (`selectEnemyTargetByThreat`), Q Energy Economy (`Q_ENERGY_CONFIG`),
// Guarded Stone Strongholds (`STONE_STRONGHOLDS`), Randomized Survival Waves
// (`SURVIVAL_WAVE_POOLS`), Safe Haven Waypoints (`SAFE_HAVEN_WAYPOINTS`),
// Detonation Resolver, and Deterministic Headless Campaign Simulator.
//
// Safe to import in both browser ES modules and headless Node.js test scripts.
// ============================================================================

import {
  clamp,
  shortestAngleDiff,
  FROST_LANCE_AIM_LENGTH,
  CINDER_FALL_MIN_DISTANCE,
  CINDER_FALL_MAX_DISTANCE,
} from '../terrain-scalar.js';
import {
  KNIGHT_SHIELD_BLOCK_DR,
  KNIGHT_POWER_SWORD_DURATION,
  KNIGHT_POWER_SWORD_COOLDOWN,
  KNIGHT_ULT_DURATION,
  KNIGHT_ULT_DMG_MULT,
  KNIGHT_ULT_COOLDOWN,
  MAGE_MAX_CONSECUTIVE_CHARGED,
  MAGE_E_COOLDOWN,
  MAGE_STORM_CATACLYSM_DURATION,
  MAGE_STORM_CATACLYSM_COOLDOWN,
  createCombatActionAimController,
} from './combat-action-aim.js';

export { clamp, shortestAngleDiff };

/* ------------------------------------------------------------------------- */
/* 1. Hero Stats, Q Energy Economy & Sword Breathing Styles                  */
/* ------------------------------------------------------------------------- */

export const HERO_STATS = {
  Knight: {
    id: 'Knight',
    maxHp: 220,
    speed: 7.5,
    sprintMult: 1.55,
    comboDmg: [22, 26, 38],
    combo4Dmg: 46,
    heavyDmg: 56,
    shieldBlockDr: KNIGHT_SHIELD_BLOCK_DR, // 80% damage reduction while holding Shield Block
    powerSwordDuration: KNIGHT_POWER_SWORD_DURATION, // 13.0s active
    powerSwordCd: KNIGHT_POWER_SWORD_COOLDOWN, // 18.0s total cooldown from activation (5.0s downtime)
    ultDuration: 12.0, // 12.0s of 2.0x Tanjiro Twin-Element Fire+Ice Blade
    ultDmgMult: KNIGHT_ULT_DMG_MULT, // 2.0x
    ultCd: KNIGHT_ULT_COOLDOWN,
    ultEnergyCost: 100,
    interceptDmg: 34,
    interceptShield: 35,
    interceptDuration: 6.0,
    interceptCd: 6.0,
    interceptRange: 9.0,
    interceptKnockback: 3.8,
    infusedMult: 1.35,
    xpPerKill: 45,
    xpPerLevel: 90,
  },
  Mage: {
    id: 'Mage',
    maxHp: 120, // Raised from 90 to 120 so Mage survives 6-8 basic hits
    speed: 7.2,
    sprintMult: 1.5,
    boltDmg: [18, 22, 30],
    boltRange: 14.5,
    shatterlanceDmg: 58,
    shatterlanceChargeSeconds: 0.55,
    maxConsecutiveCharged: MAGE_MAX_CONSECUTIVE_CHARGED,
    skillCd: MAGE_E_COOLDOWN,
    stormCataclysmDuration: MAGE_STORM_CATACLYSM_DURATION, // 6.0s Sky Meteor Shower
    stormCataclysmCd: MAGE_STORM_CATACLYSM_COOLDOWN,
    stormCataclysmWaveDmg: 68,
    stormCataclysmRadius: 8.5,
    meteorCount: 10,
    meteorDmg: 38,
    maxMeteorHitsPerTarget: 3,
    ultEnergyCost: 160,
    heavyNovaDmg: 42,
    heavyNovaRadius: 3.5,
    infuseHeal: 45,
    infuseDuration: 13.0,
    infuseCd: 8.5,
  },
};

export const Q_ENERGY_CONFIG = Object.freeze({
  knightCost: 100,
  mageCost: 160,
  sharedKillRatio: 0.60,
  detonationBonusBoth: 20,
  bossPhaseBonusBoth: 35,
  heavyHitBossAttacker: 8,
  heavyHitBossPartner: 5,
  perfectDodgeBonus: 12,
});

export function getKnightLevelStats(level = 1) {
  const cleanLevel = Math.max(1, Math.floor(Number(level) || 1));
  return {
    level: cleanLevel,
    dmgMult: Number((1.0 + 0.12 * (cleanLevel - 1)).toFixed(3)),
    iceSlowFactor: clamp(Number((0.25 + 0.04 * cleanLevel).toFixed(3)), 0.25, 0.65),
    iceSlowDuration: 4.5,
    fireStrikeBonus: 6 + 3 * cleanLevel,
    fireBurnDps: 8 + 4 * cleanLevel,
    fireBurnDuration: 4.0,
  };
}

export const BREATHING_STYLES = {
  none: {
    id: 'none',
    element: 'none',
    name: 'Steel Wind',
    mark: null,
    dmgMult: 1.0,
    duration: 0,
    colorHex: '#d8e4f0',
    detonationId: null,
  },
  rime: {
    id: 'rime',
    element: 'ice',
    name: 'Glacial Tide',
    mark: 'rime',
    dmgMult: 1.35,
    duration: KNIGHT_POWER_SWORD_DURATION,
    colorHex: '#38bdf8',
    detonationId: 'shatterblow',
  },
  solar: {
    id: 'solar',
    element: 'fire',
    name: 'Hinokami Sunfire',
    mark: 'solar',
    dmgMult: 1.35,
    duration: KNIGHT_POWER_SWORD_DURATION,
    colorHex: '#ff6a12',
    detonationId: 'solar_flare',
  },
  tempest: {
    id: 'tempest',
    element: 'storm',
    name: 'Thunderclap Wisteria',
    mark: 'tempest',
    dmgMult: 1.35,
    duration: 12.0,
    colorHex: '#a855f7',
    detonationId: 'thunderchain',
  },
  eclipse: {
    id: 'eclipse',
    element: 'eclipse',
    name: 'Sun & Tide Eclipse',
    mark: 'eclipse',
    dmgMult: 1.5,
    duration: 22.0,
    colorHex: '#fb923c',
    detonationId: 'solar_flare',
  },
};

/* ------------------------------------------------------------------------- */
/* 2. The 4 Signature Valley Spells                                          */
/* ------------------------------------------------------------------------- */

export const SPELLS = {
  frost_lance: {
    id: 'frost_lance',
    slot: 1,
    name: 'Frost Lance',
    cd: MAGE_E_COOLDOWN,
    dmg: 48,
    range: FROST_LANCE_AIM_LENGTH,
    width: 2.6,
    mark: 'rime',
    infusion: 'rime',
    resonanceGain: 12,
  },
  shatterlance: {
    id: 'shatterlance',
    slot: 2,
    name: 'Shatterlance',
    cd: 6.0,
    dmg: 58,
    range: 18.0,
    minRange: 0.8,
    maxRange: 18.0,
    width: 2.2,
    eruptionRadius: 2.8,
    mark: 'rime',
    infusion: 'rime',
    detonatesMark: true,
    resonanceGain: 16,
  },
  cinder_fall: {
    id: 'cinder_fall',
    slot: 3,
    name: 'Cinder Fall',
    cd: MAGE_E_COOLDOWN,
    dmg: 56,
    range: CINDER_FALL_MAX_DISTANCE,
    minRange: CINDER_FALL_MIN_DISTANCE,
    maxRange: CINDER_FALL_MAX_DISTANCE,
    radius: 4.2,
    mark: 'solar',
    infusion: 'solar',
    resonanceGain: 15,
  },
  storm_lance: {
    id: 'storm_lance',
    slot: 4,
    name: 'Storm Lance',
    cd: 5.5,
    dmg: 46,
    range: 16.0,
    radius: 3.8,
    chainCount: 3,
    chainRadius: 6.5,
    mark: 'tempest',
    infusion: 'tempest',
    resonanceGain: 14,
  },
};

export const SPELL_BY_SLOT = {
  1: SPELLS.frost_lance,
  2: SPELLS.shatterlance,
  3: SPELLS.cinder_fall,
  4: SPELLS.storm_lance,
};

export const WINGMAN_SPELL_ROTATION = [
  'frost_lance',
  'cinder_fall',
  'storm_lance',
  'shatterlance',
];

/* ------------------------------------------------------------------------- */
/* 3. Physical Combo Detonations & Couples Resonance Ultimate                */
/* ------------------------------------------------------------------------- */

export const DETONATIONS = {
  shatterblow: {
    id: 'shatterblow',
    mark: 'rime',
    label: 'SHATTERBLOW!',
    bonusDmg: 65,
    radius: 4.2,
    stun: 1.4,
    knockback: 5.5,
    resonanceGain: 20,
    qEnergyBonusBoth: 20,
  },
  solar_flare: {
    id: 'solar_flare',
    mark: 'solar',
    label: 'SOLAR FLARE!',
    bonusDmg: 70,
    radius: 4.5,
    launchVy: 7.5,
    knockback: 6.0,
    resonanceGain: 20,
    qEnergyBonusBoth: 20,
  },
  thunderchain: {
    id: 'thunderchain',
    mark: 'tempest',
    label: 'THUNDERCHAIN!',
    bonusDmg: 60,
    radius: 7.5,
    pullStrength: 5.0,
    stun: 1.1,
    resonanceGain: 20,
    qEnergyBonusBoth: 20,
  },
};

export const MARK_TO_DETONATION = {
  rime: DETONATIONS.shatterblow,
  solar: DETONATIONS.solar_flare,
  tempest: DETONATIONS.thunderchain,
  eclipse: DETONATIONS.solar_flare,
};

export const FINISHER_SOURCES = new Set([
  'combo3',
  'combo4',
  'charged',
  'heavy',
  'intercept',
  'shatterlance',
  'mage_heavy',
  'couples_ultimate',
  'storm_cataclysm',
  'knight_sky_lightning',
  'frost_lance',
  'cinder_fall',
]);

export const COUPLES_ULTIMATE = {
  id: 'couples_ultimate',
  name: 'Rime & Solar Cataclysm',
  resonanceCost: 100,
  dmg: 180,
  radius: 10.0,
  fullHeal: true,
  shieldGrant: 50,
  shieldDuration: 8.0,
  aegisBreak: 2,
  stun: 2.2,
};

/* ------------------------------------------------------------------------- */
/* 4. Multi-Archetype Enemy & Boss Roster (`ENEMY_ARCHETYPES`)               */
/* ------------------------------------------------------------------------- */

export const MAX_POOL_SIZE = 19;
export const MAX_CONCURRENT_ENEMIES = 5;
export const MAX_ATTACK_TOKENS = 3;
export const ENEMY_WINDUP_SECONDS = 0.65;

export const ENEMY_ARCHETYPES = {
  skeleton_minion: {
    id: 'skeleton_minion',
    charId: 'Skeleton_Minion',
    poolRole: 'Skeleton_Minion',
    name: 'Skeleton Minion',
    maxHp: 85,
    dmg: 12,
    speed: 5.8,
    qEnergyReward: 18,
    attackRange: 2.3,
    windupDuration: 0.55,
    attackCooldown: 1.9,
    telegraphRadius: 1.65,
    scale: 1.0,
  },
  skeleton_warrior: {
    id: 'skeleton_warrior',
    charId: 'Skeleton_Warrior',
    poolRole: 'Skeleton_Warrior',
    name: 'Skeleton Warrior',
    maxHp: 145,
    dmg: 16,
    speed: 4.8,
    qEnergyReward: 24,
    attackRange: 2.5,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.2,
    telegraphRadius: 1.85,
    scale: 1.05,
    frontalBasicBoltDr: 0.50,
  },
  skeleton_rogue: {
    id: 'skeleton_rogue',
    charId: 'Skeleton_Rogue',
    poolRole: 'Skeleton_Rogue',
    name: 'Skeleton Rogue',
    maxHp: 110,
    dmg: 15,
    speed: 6.6,
    qEnergyReward: 24,
    attackRange: 2.2,
    windupDuration: 0.55,
    attackCooldown: 1.8,
    telegraphRadius: 1.65,
    scale: 1.0,
    isFlanker: true,
  },
  skeleton_mage: {
    id: 'skeleton_mage',
    charId: 'Skeleton_Mage',
    poolRole: 'Skeleton_Mage',
    name: 'Skeleton Mage',
    maxHp: 105,
    dmg: 16,
    speed: 4.4,
    qEnergyReward: 26,
    attackRange: 10.5,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.7,
    telegraphRadius: 2.2,
    scale: 1.02,
    isRanged: true,
    projectileSpeed: 11.0,
  },
  orc_raider: {
    id: 'orc_raider',
    charId: 'OrcRaider',
    poolRole: 'OrcRaider',
    name: 'Valley Orc Raider',
    maxHp: 175,
    dmg: 19,
    speed: 6.2,
    qEnergyReward: 30,
    attackRange: 2.5,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.0,
    telegraphRadius: 1.9,
    scale: 1.12,
    isFlanker: true,
  },
  plant_warrior: {
    id: 'plant_warrior',
    charId: 'PlantWarrior',
    poolRole: 'PlantWarrior',
    name: 'Briar Plant Warrior',
    maxHp: 165,
    dmg: 17,
    speed: 5.2,
    qEnergyReward: 28,
    attackRange: 10.5,
    meleeAttackRange: 2.8,
    rangedMinDist: 6.5,
    meleeMaxDist: 4.5,
    isHybridRangedMelee: true,
    projectileSpeed: 11.5,
    fireVulnerabilityMult: 1.35,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.1,
    telegraphRadius: 1.9,
    scale: 1.08,
  },
  werewolf: {
    id: 'werewolf',
    charId: 'Werewolf_Wolf',
    poolRole: 'Werewolf_Wolf',
    name: 'Moonlit Werewolf',
    maxHp: 190,
    dmg: 21,
    speed: 6.8,
    qEnergyReward: 32,
    attackRange: 2.5,
    windupDuration: 0.58,
    attackCooldown: 1.85,
    telegraphRadius: 1.85,
    scale: 1.15,
    isFlanker: true,
    isPounceHunter: true,
  },
  black_knight: {
    id: 'black_knight',
    charId: 'BlackKnight',
    poolRole: 'BlackKnight',
    name: 'Obsidian Black Knight',
    maxHp: 340,
    dmg: 24,
    speed: 4.6,
    qEnergyReward: 50,
    attackRange: 2.8,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.1,
    telegraphRadius: 2.2,
    scale: 1.22,
    isElite: true,
    directionalShieldConeDeg: 70,
    directionalShieldDr: 0.80,
  },
  necromancer: {
    id: 'necromancer',
    charId: 'Necromancer',
    poolRole: 'Necromancer',
    name: 'Grove Necromancer Sovereign',
    maxHp: 820,
    dmg: 26,
    speed: 3.8,
    qEnergyReward: 90,
    attackRange: 10.5,
    windupDuration: 0.70,
    attackCooldown: 2.5,
    telegraphRadius: 2.6,
    scale: 1.32,
    isBoss: true,
    isRanged: true,
    projectileSpeed: 11.5,
    summonCooldown: 10.0,
    maxActiveSummons: 2,
    summonArchetypes: ['skeleton_rogue', 'werewolf'],
    phaseThresholds: [0.70, 0.35],
    aegisLayersMax: 0,
  },
  orc_brute: {
    id: 'orc_brute',
    charId: 'OrcBrute',
    poolRole: 'OrcBrute',
    name: 'Ironcrag Orc Brute',
    maxHp: 750,
    dmg: 28,
    speed: 4.5,
    qEnergyReward: 80,
    attackRange: 3.4,
    windupDuration: 0.72,
    attackCooldown: 2.3,
    telegraphRadius: 2.9,
    scale: 1.35,
    isBoss: true,
    phaseThresholds: [0.70, 0.35],
    aegisLayersMax: 0,
  },
  frost_golem: {
    id: 'frost_golem',
    charId: 'FrostGolem',
    poolRole: 'FrostGolem',
    name: 'Ancient Frost Golem',
    maxHp: 1450,
    dmg: 32,
    speed: 4.1,
    qEnergyReward: 120,
    attackRange: 3.6,
    windupDuration: 0.75,
    attackCooldown: 2.4,
    telegraphRadius: 3.3,
    scale: 1.48,
    isBoss: true,
    phaseThresholds: [0.70, 0.35],
    aegisLayersMax: 0,
  },
  skeleton_golem: {
    id: 'skeleton_golem',
    charId: 'Skeleton_Golem',
    poolRole: 'Skeleton_Golem',
    name: 'Ossuary Skeleton Golem',
    maxHp: 950,
    dmg: 34,
    speed: 4.3,
    qEnergyReward: 100,
    attackRange: 3.5,
    windupDuration: 0.72,
    attackCooldown: 2.35,
    telegraphRadius: 3.1,
    scale: 1.38,
    isBoss: true,
    phaseThresholds: [0.70, 0.35],
    aegisLayersMax: 0,
  },
  captain: {
    id: 'captain',
    charId: 'BlackKnight',
    poolRole: 'BlackKnight',
    name: 'Twilight Elite Captain',
    maxHp: 320,
    dmg: 24,
    speed: 4.6,
    qEnergyReward: 50,
    attackRange: 2.8,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.2,
    telegraphRadius: 2.4,
    scale: 1.18,
    isElite: true,
  },
  royal_guard: {
    id: 'royal_guard',
    charId: 'Skeleton_Warrior',
    poolRole: 'Skeleton_Warrior',
    name: 'Shrine Royal Guard',
    maxHp: 210,
    dmg: 22,
    speed: 4.5,
    qEnergyReward: 32,
    attackRange: 2.6,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.2,
    telegraphRadius: 2.0,
    scale: 1.08,
  },
  boss_sovereign: {
    id: 'boss_sovereign',
    charId: 'FrostGolem',
    poolRole: 'Boss_Sovereign',
    name: 'The Hollow Sovereign',
    maxHp: 1400,
    dmg: 34,
    speed: 4.2,
    qEnergyReward: 120,
    attackRange: 3.6,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.4,
    telegraphRadius: 3.3,
    scale: 1.42,
    isBoss: true,
    hasBoneAegis: true,
    phaseThresholds: [0.70, 0.35],
    aegisTriggerHpRatio: 0.5,
    aegisLayersMax: 2,
    aegisDmgReduction: 0.85,
  },
  demon_tree: {
    id: 'demon_tree',
    charId: 'Necromancer',
    poolRole: 'Necromancer',
    name: 'Night Demon Tree',
    maxHp: 680,
    dmg: 28,
    speed: 0.0,
    qEnergyReward: 85,
    isStationary: true,
    isElite: true,
    isBoss: true,
    attackRange: 3.6,
    windupDuration: 0.72,
    attackCooldown: 2.6,
    telegraphRadius: 3.2,
    scale: 1.35,
    batSummonCooldown: 10.0,
    maxActiveBats: 2,
    summonCooldown: 10.0,
    maxActiveSummons: 2,
    phaseThresholds: [0.70, 0.35],
  },
  summoned_bat: {
    id: 'summoned_bat',
    charId: 'Skeleton_Rogue',
    poolRole: 'Skeleton_Rogue',
    name: 'Nightwing Bat',
    maxHp: 55,
    dmg: 14,
    speed: 6.2,
    qEnergyReward: 18,
    isFlying: true,
    isSummon: true,
    hoverHeight: 2.35,
    swoopHeight: 1.2,
    preferredTarget: 'Mage',
    attackRange: 2.1,
    windupDuration: 0.55,
    attackCooldown: 1.9,
    telegraphRadius: 1.55,
    scale: 0.72,
  },
};

// Backwards-compatible short & PascalCase aliases on ENEMY_ARCHETYPES
ENEMY_ARCHETYPES.minion = ENEMY_ARCHETYPES.skeleton_minion;
ENEMY_ARCHETYPES.warrior = ENEMY_ARCHETYPES.skeleton_warrior;
ENEMY_ARCHETYPES.rogue = ENEMY_ARCHETYPES.skeleton_rogue;
ENEMY_ARCHETYPES.mage = ENEMY_ARCHETYPES.skeleton_mage;
ENEMY_ARCHETYPES.werewolf_wolf = ENEMY_ARCHETYPES.werewolf;
ENEMY_ARCHETYPES.Skeleton_Minion = ENEMY_ARCHETYPES.skeleton_minion;
ENEMY_ARCHETYPES.Skeleton_Warrior = ENEMY_ARCHETYPES.skeleton_warrior;
ENEMY_ARCHETYPES.Skeleton_Rogue = ENEMY_ARCHETYPES.skeleton_rogue;
ENEMY_ARCHETYPES.Skeleton_Mage = ENEMY_ARCHETYPES.skeleton_mage;
ENEMY_ARCHETYPES.OrcRaider = ENEMY_ARCHETYPES.orc_raider;
ENEMY_ARCHETYPES.PlantWarrior = ENEMY_ARCHETYPES.plant_warrior;
ENEMY_ARCHETYPES.Werewolf_Wolf = ENEMY_ARCHETYPES.werewolf;
ENEMY_ARCHETYPES.BlackKnight = ENEMY_ARCHETYPES.black_knight;
ENEMY_ARCHETYPES.Necromancer = ENEMY_ARCHETYPES.necromancer;
ENEMY_ARCHETYPES.OrcBrute = ENEMY_ARCHETYPES.orc_brute;
ENEMY_ARCHETYPES.FrostGolem = ENEMY_ARCHETYPES.frost_golem;
ENEMY_ARCHETYPES.Skeleton_Golem = ENEMY_ARCHETYPES.skeleton_golem;

/* ------------------------------------------------------------------------- */
/* 5. Guarded Stone Strongholds, Survival Wave Pools & Safe Havens           */
/* ------------------------------------------------------------------------- */

export const STONE_STRONGHOLDS = Object.freeze({
  site1_well: Object.freeze({
    id: 'site1_well',
    stoneStage: 1,
    name: 'Village Well Stronghold',
    bannerTitle: 'SACRED WELL OF THE PLAZA',
    bannerSubtitle: 'Clear the Vanguard or Guard Your Partner While They Read the Stone',
    center: Object.freeze({ x: 0.0, z: 0.0, y: 0.0 }),
    triggerRadius: 14.0,
    ambushRadius: 12.0,
    outerPatrol: Object.freeze([
      Object.freeze({ archetype: 'skeleton_minion', x: -5.5, z: 7.5 }),
      Object.freeze({ archetype: 'skeleton_minion', x: 5.5, z: 7.5 }),
      Object.freeze({ archetype: 'skeleton_warrior', x: 0.0, z: 9.2 }),
    ]),
    spawns: Object.freeze([
      Object.freeze({ archetype: 'skeleton_warrior', x: -7.2, z: -5.8 }),
      Object.freeze({ archetype: 'skeleton_warrior', x: 7.2, z: -5.8 }),
      Object.freeze({ archetype: 'skeleton_rogue', x: -8.6, z: 2.4 }),
      Object.freeze({ archetype: 'skeleton_mage', x: 8.6, z: -3.2 }),
    ]),
  }),
  site2_platform: Object.freeze({
    id: 'site2_platform',
    stoneStage: 2,
    name: 'Whispering Grove Platform Stronghold',
    bannerTitle: 'WHISPERING GROVE MEDALLION',
    bannerSubtitle: 'Vanquish the Grove Necromancer Sovereign to Unseal the Floor Inscription',
    center: Object.freeze({ x: 44.0, z: 16.0, y: 0.0 }),
    triggerRadius: 16.0,
    bossArchetype: 'necromancer',
    summonCooldown: 10.0,
    maxActiveSummons: 2,
    spawns: Object.freeze([
      Object.freeze({ archetype: 'necromancer', x: 44.0, z: 16.0, isBoss: true }),
      Object.freeze({ archetype: 'plant_warrior', x: 39.8, z: 18.8 }),
      Object.freeze({ archetype: 'plant_warrior', x: 48.2, z: 18.8 }),
    ]),
  }),
  site3_wall: Object.freeze({
    id: 'site3_wall',
    stoneStage: 3,
    name: "Hidden Lovers' Wall Stronghold",
    bannerTitle: "HIDDEN LOVERS' WALL",
    bannerSubtitle: 'Shatter the Obsidian Guard & Heavy Breaker to Reach the Cottage Wall',
    center: Object.freeze({ x: -21.6, z: 20.4, y: 0.0 }),
    triggerRadius: 15.0,
    spawns: Object.freeze([
      Object.freeze({ archetype: 'black_knight', x: -19.8, z: 17.8, isElite: true }),
      Object.freeze({ archetype: 'orc_brute', x: -23.4, z: 18.0, isBoss: true }),
      Object.freeze({ archetype: 'skeleton_rogue', x: -17.2, z: 21.6 }),
      Object.freeze({ archetype: 'skeleton_rogue', x: -25.6, z: 21.6 }),
    ]),
  }),
  apex_finale: Object.freeze({
    id: 'apex_finale',
    stoneStage: 4,
    name: 'Apex Finale Assault',
    bannerTitle: 'APEX FINALE · TITANS OF THE ECLIPSE',
    bannerSubtitle: 'Unleash Twin-Element Blade, Starfall Cataclysm & Main Divine Blessing',
    center: Object.freeze({ x: 0.0, z: 0.0, y: 0.0 }),
    triggerRadius: 24.0,
    spawns: Object.freeze([
      Object.freeze({ archetype: 'frost_golem', x: 0.0, z: -11.5, isBoss: true }),
      Object.freeze({ archetype: 'skeleton_golem', x: -5.2, z: -9.8, isBoss: true }),
      Object.freeze({ archetype: 'orc_raider', x: 5.2, z: -9.8 }),
      Object.freeze({ archetype: 'skeleton_mage', x: 0.0, z: -14.8 }),
    ]),
  }),
});

export const SURVIVAL_WAVE_POOLS = Object.freeze({
  0: Object.freeze({
    stonesSolvedCount: 0,
    intervalMin: 40.0,
    intervalMax: 52.0,
    spawnRadiusMin: 18.0,
    spawnRadiusMax: 25.0,
    minCount: 3,
    maxCount: 4,
    pool: Object.freeze(['skeleton_minion', 'skeleton_warrior', 'skeleton_rogue']),
  }),
  1: Object.freeze({
    stonesSolvedCount: 1,
    intervalMin: 40.0,
    intervalMax: 52.0,
    spawnRadiusMin: 18.0,
    spawnRadiusMax: 25.0,
    minCount: 4,
    maxCount: 5,
    pool: Object.freeze(['skeleton_warrior', 'skeleton_rogue', 'skeleton_mage', 'orc_raider']),
  }),
  2: Object.freeze({
    stonesSolvedCount: 2,
    intervalMin: 40.0,
    intervalMax: 52.0,
    spawnRadiusMin: 18.0,
    spawnRadiusMax: 25.0,
    minCount: 4,
    maxCount: 5,
    maxElites: 1,
    pool: Object.freeze([
      'orc_raider',
      'plant_warrior',
      'werewolf',
      'skeleton_mage',
      'black_knight',
    ]),
  }),
  3: Object.freeze({
    stonesSolvedCount: 3,
    intervalMin: 42.0,
    intervalMax: 52.0,
    spawnRadiusMin: 18.0,
    spawnRadiusMax: 25.0,
    minCount: 4,
    maxCount: 5,
    isApexFinale: true,
    pool: Object.freeze(['frost_golem', 'skeleton_golem', 'orc_raider', 'werewolf']),
  }),
});

export const SAFE_HAVEN_WAYPOINTS = Object.freeze([
  Object.freeze({
    id: 'haven_south_bridge',
    name: 'Town South Bridge Haven',
    forSiteId: 'site1_well',
    x: 0.0,
    z: 18.5,
    y: 0.0,
  }),
  Object.freeze({
    id: 'haven_east_meadow',
    name: 'East Meadow Approach Haven',
    forSiteId: 'site2_platform',
    x: 24.0,
    z: 12.0,
    y: 0.0,
  }),
  Object.freeze({
    id: 'haven_west_mill',
    name: 'West Mill Road Haven',
    forSiteId: 'site3_wall',
    x: -8.0,
    z: 18.0,
    y: 0.0,
  }),
]);

export function selectNearestSafeHavenWaypoint(x = 0, z = 18.5) {
  let best = SAFE_HAVEN_WAYPOINTS[0];
  let bestDist = Infinity;
  for (let i = 0; i < SAFE_HAVEN_WAYPOINTS.length; i++) {
    const wp = SAFE_HAVEN_WAYPOINTS[i];
    const d = Math.hypot(x - wp.x, z - wp.z);
    if (d < bestDist) {
      bestDist = d;
      best = wp;
    }
  }
  return best;
}

export const SHRINE_OBSTACLES = [
  { id: 'shrine_pedestal', x: -5.8, z: -87.8, r: 1.6 },
  { id: 'shrine_planter_w', x: -10.6, z: -90.8, r: 2.6 },
  { id: 'shrine_planter_e', x: 10.6, z: -90.8, r: 2.6 },
];

export const ACT_DEFINITIONS = {
  act1_arena: {
    id: 'act1_arena',
    name: 'Act I · East Wisteria Combat Ring',
    bannerTitle: 'ACT I · EAST WISTERIA RING',
    bannerSubtitle: 'Ignite the Knight’s Blade with Her Valley Spells & Shatter the Pack',
    center: { x: 68.0, z: -4.0, y: 0.6 },
    triggerRadius: 18.0,
    spawnRadiusMin: 6.0,
    spawnRadiusMax: 15.0,
    fenceRadius: 19.5,
    tod: 'day',
    heroSpawn: {
      knight: { x: 54.0, z: -4.2, yaw: 1.57 },
      mage: { x: 52.0, z: -3.2, yaw: 1.57 },
    },
    guidePath: [
      { x: 4.5, z: 8.5 },
      { x: 10.5, z: -0.5 },
      { x: 20.0, z: -1.5 },
      { x: 30.0, z: -2.5 },
      { x: 40.0, z: -3.4 },
      { x: 50.0, z: -4.0 },
    ],
    waves: [
      {
        id: 'wave1',
        label: 'Wave 1 · Wisteria Scouts',
        spawns: [
          { archetype: 'minion', x: 75.5, z: -7.5 },
          { archetype: 'minion', x: 75.5, z: -0.5 },
          { archetype: 'warrior', x: 78.5, z: -5.8 },
          { archetype: 'warrior', x: 78.5, z: -2.2 },
        ],
      },
      {
        id: 'wave2',
        label: 'Wave 2 · Wisteria Warband',
        spawns: [
          { archetype: 'warrior', x: 75.2, z: -6.8 },
          { archetype: 'warrior', x: 75.2, z: -1.2 },
          { archetype: 'rogue', x: 71.5, z: -11.8 },
          { archetype: 'rogue', x: 71.5, z: 3.8 },
          { archetype: 'mage', x: 80.5, z: -6.2 },
          { archetype: 'mage', x: 80.5, z: -1.8 },
        ],
      },
    ],
  },

  interlude_pier: {
    id: 'interlude_pier',
    name: 'Sunset Interlude · West Millpond Pier Sanctuary',
    bannerTitle: 'SUNSET INTERLUDE · WEST MILLPOND PIER',
    bannerSubtitle: 'Touch the Lakeside Sanctuary Brazier to Heal & Unlock Empowered Breathing',
    center: { x: -42.0, z: 8.5, y: -0.23 },
    triggerRadius: 4.8,
    tod: 'evening',
    empoweredBreathing: true,
    sanctuaryReward: {
      fullHeal: true,
      shield: 35,
      shieldDuration: 12.0,
      resonanceGain: 50,
      empoweredBreathing: true,
      empoweredMult: 1.25,
    },
    heroSpawn: {
      knight: { x: -37.2, z: 8.5, yaw: -1.57 },
      mage: { x: -35.4, z: 8.8, yaw: -1.57 },
    },
    guidePath: [
      { x: 42.0, z: -3.5 },
      { x: 24.0, z: -1.8 },
      { x: 10.5, z: 0.0 },
      { x: 0.0, z: 10.5 },
      { x: -10.5, z: 1.2 },
      { x: -19.5, z: 4.5 },
      { x: -28.5, z: 7.6 },
      { x: -36.5, z: 8.5 },
    ],
    waves: [],
  },

  act2_plaza: {
    id: 'act2_plaza',
    name: 'Act II · Twilight Hamlet Plaza Defense',
    bannerTitle: 'ACT II · TWILIGHT HAMLET DEFENSE',
    bannerSubtitle: 'Defend the Village Well Ring Road Against the Twilight Vanguard',
    center: { x: 0.0, z: 0.0, y: 0.0 },
    triggerRadius: 15.0,
    spawnRadiusMin: 9.5,
    spawnRadiusMax: 12.5,
    wellKeepoutRadius: 6.4,
    tod: 'evening',
    heroSpawn: {
      knight: { x: 0.0, z: 8.2, yaw: Math.PI },
      mage: { x: 1.9, z: 8.6, yaw: Math.PI },
    },
    guidePath: [
      { x: -34.0, z: 8.5 },
      { x: -25.0, z: 6.8 },
      { x: -16.5, z: 3.6 },
      { x: -10.5, z: 1.2 },
    ],
    waves: [
      {
        id: 'wave3',
        label: 'Wave 3 · Twilight Vanguard',
        spawns: [
          { archetype: 'captain', x: 0.0, z: -10.8 },
          { archetype: 'warrior', x: -8.2, z: -7.4 },
          { archetype: 'warrior', x: 8.2, z: -7.4 },
          { archetype: 'warrior', x: -10.6, z: 1.8 },
          { archetype: 'mage', x: 10.6, z: 1.8 },
          { archetype: 'mage', x: 0.0, z: -11.8 },
        ],
      },
    ],
  },

  act3_shrine: {
    id: 'act3_shrine',
    name: 'Act III · Starlit North Shrine Overlook Boss Duel',
    bannerTitle: 'ACT III · THE HOLLOW SOVEREIGN',
    bannerSubtitle: 'Shatter the Sovereign’s Bone Aegis with Physical Detonations or Cataclysm',
    center: { x: 0.0, z: -85.5, y: 8.0 },
    triggerRadius: 14.0,
    arenaRadius: 12.8,
    spawnRadiusMin: 3.0,
    spawnRadiusMax: 11.5,
    tod: 'night',
    obstacles: SHRINE_OBSTACLES,
    heroSpawn: {
      knight: { x: -0.9, z: -76.5, yaw: Math.PI },
      mage: { x: 1.2, z: -76.2, yaw: Math.PI },
    },
    guidePath: [
      { x: 0.0, z: -12.0 },
      { x: 0.0, z: -22.0 },
      { x: 0.0, z: -34.0 },
      { x: 0.0, z: -46.0 },
      { x: 0.0, z: -58.0 },
      { x: 0.0, z: -70.0 },
    ],
    waves: [
      {
        id: 'wave4',
        label: 'Wave 4 · The Hollow Sovereign',
        spawns: [
          { archetype: 'boss_sovereign', x: 0.0, z: -88.8 },
          { archetype: 'royal_guard', x: -4.2, z: -83.2 },
          { archetype: 'royal_guard', x: 4.2, z: -83.2 },
        ],
      },
    ],
  },

  victory_dawn: {
    id: 'victory_dawn',
    name: 'Victory · Dawn Over Haru-machi',
    bannerTitle: 'DAWN BREAKS OVER HARU-MACHI',
    bannerSubtitle: 'The Valley is Restored · Press Replay Expedition Anytime',
    center: { x: 0.0, z: -85.5, y: 8.0 },
    triggerRadius: 20.0,
    tod: 'day',
    guidePath: [],
    waves: [],
  },
};

export const ACT_SEQUENCE = [
  'act1_arena',
  'interlude_pier',
  'act2_plaza',
  'act3_shrine',
  'victory_dawn',
];

export function resolveShrineObstacles(px, pz, entityRadius = 0.55, clampToArena = false) {
  let x = px;
  let z = pz;

  for (let i = 0; i < SHRINE_OBSTACLES.length; i++) {
    const obs = SHRINE_OBSTACLES[i];
    const dx = x - obs.x;
    const dz = z - obs.z;
    const minD = obs.r + entityRadius;
    const d = Math.hypot(dx, dz);
    if (d < minD) {
      if (d > 1e-5) {
        x += (dx / d) * (minD - d);
        z += (dz / d) * (minD - d);
      } else {
        x += minD;
      }
    }
  }

  if (clampToArena) {
    const cx = ACT_DEFINITIONS.act3_shrine.center.x;
    const cz = ACT_DEFINITIONS.act3_shrine.center.z;
    const maxR = ACT_DEFINITIONS.act3_shrine.arenaRadius - entityRadius * 0.5;
    const dx = x - cx;
    const dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d > maxR && d > 1e-5) {
      x = cx + (dx / d) * maxR;
      z = cz + (dz / d) * maxR;
    }
  }

  return { x, z };
}

/* ------------------------------------------------------------------------- */
/* 6. Dynamic Threat & Aggro AI (`selectEnemyTargetByThreat`)                */
/* ------------------------------------------------------------------------- */

/**
 * Pure Dynamic Threat & Aggro AI selector (Master Plan Section 5.3):
 *   Score(H) = BaseProximity(H) + RecentDamageThreat(H) + KillStreakThreat(H) + TauntBonus(H)
 *
 * - BaseProximity(H): +30 if within 5.0m, tapering to 0 at 20.0m
 * - RecentDamageThreat(H): +0.8 per damage point dealt (decays at 12%/s)
 * - KillStreakThreat(H): +55 for 8.0s when a hero kills an enemy within 22.0m
 *   (making flankers/archers pivot to hunt the Mage after she gets kills!)
 * - TauntBonus(H): Knight hitting an enemy targeting Mage (+65), Sprint-Intercepting
 *   (+90), or Shield-Blocking between enemy and Mage (+75) pulls aggro back!
 */
export function selectEnemyTargetByThreat(enemy, heroes = {}, threatState = {}) {
  const knight = heroes?.Knight || heroes?.knight || null;
  const mage = heroes?.Mage || heroes?.mage || null;

  const knightAlive = Boolean(knight && !knight.downed);
  const mageAlive = Boolean(mage && !mage.downed);

  if (!knightAlive && !mageAlive) {
    return null;
  }
  if (knightAlive && !mageAlive) {
    return Object.assign(knight, {
      targetHero: knight,
      targetHeroId: 'Knight',
      huntingMage: false,
      shiftedToMage: false,
      knightScore: 100,
      mageScore: -Infinity,
    });
  }
  if (mageAlive && !knightAlive) {
    return Object.assign(mage, {
      targetHero: mage,
      targetHeroId: 'Mage',
      huntingMage: true,
      shiftedToMage: enemy?.targetHeroId !== 'Mage',
      knightScore: -Infinity,
      mageScore: 100,
    });
  }

  const ex = Number(enemy?.x ?? 0);
  const ez = Number(enemy?.z ?? 0);

  function computeProximityScore(hero) {
    const d = Math.hypot(ex - Number(hero.x ?? 0), ez - Number(hero.z ?? 0));
    if (d <= 5.0) return 30.0;
    if (d >= 20.0) return 0.0;
    return 30.0 * (1.0 - (d - 5.0) / 15.0);
  }

  const knightProximity = computeProximityScore(knight);
  const mageProximity = computeProximityScore(mage);

  // RecentDamageThreat: +0.8 per damage point (or pre-scaled in enemy.threatByHero)
  const rawKnightDmgThreat = Number(
    enemy?.damageThreat?.Knight ??
      threatState?.recentDamageThreat?.Knight ??
      (Number(threatState?.recentDamage?.Knight || 0) * 0.8)
  );
  const rawMageDmgThreat = Number(
    enemy?.damageThreat?.Mage ??
      threatState?.recentDamageThreat?.Mage ??
      (Number(threatState?.recentDamage?.Mage || 0) * 0.8)
  );

  // KillStreakThreat: +55 for 8.0s when a hero kills an enemy within 22.0m
  const knightKillTimer = Math.max(
    Number(enemy?.killStreakTimers?.Knight || 0),
    Number(threatState?.killStreakTimers?.Knight || 0),
    Number(knight?.killStreakTimer || 0)
  );
  const mageKillTimer = Math.max(
    Number(enemy?.killStreakTimers?.Mage || 0),
    Number(threatState?.killStreakTimers?.Mage || 0),
    Number(mage?.killStreakTimer || 0)
  );

  const isFlankerOrRanged = Boolean(
    enemy?.isFlanker ||
      enemy?.isRanged ||
      enemy?.isHybridRangedMelee ||
      enemy?.isPounceHunter ||
      enemy?.preferredTarget === 'Mage'
  );
  const mageHunterMult = isFlankerOrRanged ? 1.25 : 1.0;

  const knightKillStreakThreat = knightKillTimer > 0 ? 55.0 : 0.0;
  const mageKillStreakThreat =
    (mageKillTimer > 0 ? 55.0 * mageHunterMult : 0.0) +
    (enemy?.preferredTarget === 'Mage' ? 60.0 : 0.0);

  // TauntBonus(Knight):
  // - Hitting an enemy targeting Mage: +65
  // - Sprint-Intercepting: +90
  // - Holding Shield-Block (`F`) between enemy and Mage: +75
  let knightTauntBonus = Number(enemy?.knightTauntBonus || threatState?.knightTauntBonus || 0);
  if (enemy?.tauntHitTimer > 0 || threatState?.knightHitEnemyTargetingMage) {
    knightTauntBonus += 65.0;
  }
  if (enemy?.interceptTauntTimer > 0 || threatState?.knightIntercepted) {
    knightTauntBonus += 90.0;
  }

  if (knight?.shieldBlocking) {
    const dke = Math.hypot(ex - Number(knight.x ?? 0), ez - Number(knight.z ?? 0));
    const dme = Math.hypot(ex - Number(mage.x ?? 0), ez - Number(mage.z ?? 0));
    if (dke <= 7.5 && dke <= dme + 1.5) {
      knightTauntBonus += 75.0;
    }
  }

  const mageTauntBonus = Number(enemy?.mageTauntBonus || threatState?.mageTauntBonus || 0);

  const knightScore =
    knightProximity + rawKnightDmgThreat + knightKillStreakThreat + knightTauntBonus;
  const mageScore =
    mageProximity + rawMageDmgThreat + mageKillStreakThreat + mageTauntBonus;

  const chooseMage = mageScore > knightScore + 1.5;
  const chosenHero = chooseMage ? mage : knight;
  const chosenId = chooseMage ? 'Mage' : 'Knight';
  const huntingMage =
    chosenId === 'Mage' && (mageKillStreakThreat > 0 || rawMageDmgThreat >= 20);
  const shiftedToMage = chosenId === 'Mage' && enemy?.targetHeroId !== 'Mage';

  return Object.assign(chosenHero, {
    targetHero: chosenHero,
    targetHeroId: chosenId,
    huntingMage,
    shiftedToMage,
    knightScore: Number(knightScore.toFixed(2)),
    mageScore: Number(mageScore.toFixed(2)),
  });
}

export function selectSoftLockTarget(
  origin,
  forwardYaw,
  enemies,
  {
    maxRange = 20.0,
    coneHalfAngle = (75 * Math.PI) / 360,
    partnerPos = null,
    partnerThreatRadius = 8.0,
  } = {}
) {
  if (!origin || !Array.isArray(enemies) || enemies.length === 0) return null;

  let bestInCone = null;
  let bestInConeScore = -Infinity;

  let bestThreatFallback = null;
  let bestThreatScore = -Infinity;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || e.dead || e.hp <= 0 || e.active === false) continue;

    const ex = e.x ?? e.group?.position?.x ?? 0;
    const ez = e.z ?? e.group?.position?.z ?? 0;
    const dx = ex - origin.x;
    const dz = ez - origin.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= maxRange) {
      const angleToEnemy = Math.atan2(dx, dz);
      const absAngleDiff = Math.abs(shortestAngleDiff(angleToEnemy, forwardYaw));
      if (absAngleDiff <= coneHalfAngle + 1e-4) {
        const distScore = 1.0 - dist / maxRange;
        const angleScore = 1.0 - absAngleDiff / Math.max(1e-4, coneHalfAngle);
        const markBonus = e.mark ? 0.35 : 0.0;
        const bossBonus = e.isBoss ? 0.25 : e.isElite ? 0.12 : 0.0;
        const windupBonus = e.aiState === 'windup' ? 0.2 : 0.0;
        const score = distScore * 0.58 + angleScore * 0.42 + markBonus + bossBonus + windupBonus;
        if (score > bestInConeScore) {
          bestInConeScore = score;
          bestInCone = e;
        }
      }
    }

    const distPartner = partnerPos
      ? Math.hypot(ex - partnerPos.x, ez - partnerPos.z)
      : Infinity;
    const minThreatDist = Math.min(dist, distPartner);
    if (minThreatDist <= partnerThreatRadius) {
      const attackingBonus = e.aiState === 'windup' || e.hasAttackToken ? 0.5 : 0.0;
      const threatScore = 1.0 - minThreatDist / partnerThreatRadius + attackingBonus;
      if (threatScore > bestThreatScore) {
        bestThreatScore = threatScore;
        bestThreatFallback = e;
      }
    }
  }

  return bestInCone || bestThreatFallback || null;
}

export function allocateAttackTokens(enemies, maxTokens = MAX_ATTACK_TOKENS) {
  if (!Array.isArray(enemies)) return [];

  const eligible = [];
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e) continue;
    const isAlive = !e.dead && e.hp > 0 && e.active !== false;
    const isStunned = (e.stunTimer || 0) > 0 || (e.grounded === false && (e.y || 0) > 0.5);
    if (!isAlive || isStunned) {
      e.hasAttackToken = false;
      if (e.aiState === 'windup') {
        e.aiState = 'orbit';
        e.windupTimer = 0;
        e.telegraphProgress = 0;
      }
      continue;
    }
    eligible.push(e);
  }

  eligible.sort((a, b) => {
    const aWindup = a.aiState === 'windup' ? 1 : 0;
    const bWindup = b.aiState === 'windup' ? 1 : 0;
    if (aWindup !== bWindup) return bWindup - aWindup;

    const aBoss = a.isBoss ? 2 : a.isElite ? 1 : 0;
    const bBoss = b.isBoss ? 2 : b.isElite ? 1 : 0;
    if (aBoss !== bBoss) return bBoss - aBoss;

    const aDist = a.distToTarget ?? 999;
    const bDist = b.distToTarget ?? 999;
    return aDist - bDist;
  });

  // Enforce Shared Encounter Director fairness guarantee: at most 2 melee windups
  // + 1 ranged attacker against the same hero simultaneously, up to maxTokens total.
  const holders = [];
  const meleeCountByHero = { Knight: 0, Mage: 0 };
  const rangedCountByHero = { Knight: 0, Mage: 0 };

  for (let i = 0; i < eligible.length; i++) {
    const e = eligible[i];
    const targetHeroId = e.targetHeroId === 'Mage' ? 'Mage' : 'Knight';
    const isRangedNow = Boolean(e.isRanged || e.usingRangedMode);
    const heroCapOk = isRangedNow
      ? rangedCountByHero[targetHeroId] < 2
      : meleeCountByHero[targetHeroId] < 3;

    if (holders.length < maxTokens && heroCapOk) {
      e.hasAttackToken = true;
      holders.push(e);
      if (isRangedNow) rangedCountByHero[targetHeroId]++;
      else meleeCountByHero[targetHeroId]++;
    } else {
      e.hasAttackToken = false;
      if (e.aiState === 'windup') {
        e.aiState = 'orbit';
        e.windupTimer = 0;
        e.telegraphProgress = 0;
      }
    }
  }

  return holders;
}

// Divine Verdict & Co-Op Tether Locked Constants (Master Plan Section 4.2 & 6.2)
export const COMMUNE_MAX_DISTANCE = 6.0;
export const COMMUNE_RESURRECT_DISTANCE = 6.0;
export const COMMUNE_COMBAT_HP_THRESHOLD = 0.35;
export const POWERUP_TETHER_DISTANCE = 6.0;
export const DIVINE_BLESSING_DURATION = 25.0;
export const DIVINE_BLESSING_TETHER_DISTANCE = 6.0;
export const DIVINE_BLESSING_TETHER_GRACE_SECONDS = 2.5;
export const DIVINE_BLESSING_DMG_MULT = 2.0;
export const DIVINE_BLESSING_Q_CD_MULT = 1 / 3;
export const DIVINE_BLESSING_E_CD_MULT = 0.5;
export const ALTAR_STELE_POS = { x: 0.0, z: 0.0, y: 0.0, triggerRadius: 6.5 };

/**
 * Applies a hit (`hitSpec`) to `enemy`, resolves Sword Breathing multipliers,
 * Knight Level scaling, Ice Sword slow (movement, attack speed & damage) and
 * Fire Sword persistent burn DoT, Knight Q 2.0x double damage, PlantWarrior
 * 1.35x Fire vulnerability, BlackKnight ±70° frontal shield guard (80% DR vs
 * flank/detonation stagger), Boss 70%/35% phase thresholds, and Physical Detonations.
 */
export function applyHitAndResolveDetonation(enemy, hitSpec = {}, allEnemies = []) {
  if (!enemy || enemy.dead || enemy.hp <= 0) {
    return {
      damageDealt: 0,
      totalAoEDamage: 0,
      killed: false,
      detonation: null,
      markApplied: null,
      iceSlowApplied: false,
      fireBurnApplied: false,
      frontalShieldBlocked: false,
      guardShattered: false,
      bossPhasesCrossed: [],
      aegisBroken: false,
      aegisLayersRemaining: enemy?.aegisLayers || 0,
      resonanceGain: 0,
      hitstopMs: 0,
      cameraPunch: 0,
    };
  }

  const source = hitSpec.source || 'combo1';
  const baseDmg = Number(hitSpec.baseDmg ?? hitSpec.dmg ?? 20);
  const rawInfusion = hitSpec.infusion || 'none';
  const infusion =
    rawInfusion === 'ice'
      ? 'rime'
      : rawInfusion === 'fire'
        ? 'solar'
        : rawInfusion;

  const isSwordHit =
    source === 'combo1' ||
    source === 'combo2' ||
    source === 'combo3' ||
    source === 'combo4' ||
    source === 'charged' ||
    source === 'heavy' ||
    source === 'intercept' ||
    source === 'knight_sky_lightning';

  const knightLevel = Math.max(1, Number(hitSpec.knightLevel || 1));
  const lvlStats = getKnightLevelStats(knightLevel);
  const levelMult = isSwordHit ? lvlStats.dmgMult : 1.0;
  const ultMult =
    isSwordHit && (hitSpec.knightUltActive || Number(hitSpec.ultDmgMult) > 1.0)
      ? Number(hitSpec.ultDmgMult || KNIGHT_ULT_DMG_MULT)
      : 1.0;

  const effectiveInfusion = infusion;
  const infusedMult =
    isSwordHit && effectiveInfusion && effectiveInfusion !== 'none'
      ? effectiveInfusion === 'eclipse' && !hitSpec.knightUltActive
        ? BREATHING_STYLES.eclipse.dmgMult
        : HERO_STATS.Knight.infusedMult
      : 1.0;
  const empoweredMult =
    hitSpec.empoweredBreathing &&
    ((isSwordHit && effectiveInfusion !== 'none') || SPELLS[source])
      ? 1.25
      : 1.0;
  const dodgeMult = hitSpec.perfectDodgeBuff ? 1.35 : 1.0;
  const communeMult = isSwordHit
    ? Number(hitSpec.partnerSwordMult || 1.0)
    : Number(hitSpec.partnerMagicMult || 1.0);

  const fireBonus =
    isSwordHit && (effectiveInfusion === 'solar' || effectiveInfusion === 'eclipse')
      ? lvlStats.fireStrikeBonus
      : 0;

  let rawDirectDmg = Math.round(
    (baseDmg * levelMult + fireBonus) *
      infusedMult *
      empoweredMult *
      dodgeMult *
      communeMult *
      ultMult
  );

  // PlantWarrior 1.35x Fire (`solar` / `cinder_fall`) vulnerability
  const isFireAttack =
    effectiveInfusion === 'solar' ||
    effectiveInfusion === 'eclipse' ||
    source === 'cinder_fall' ||
    hitSpec.applyMark === 'solar';
  if (
    isFireAttack &&
    (enemy.archetype === 'plant_warrior' ||
      enemy.charId === 'PlantWarrior' ||
      Number(enemy.fireVulnerabilityMult) > 1.0)
  ) {
    const fireVuln = Number(enemy.fireVulnerabilityMult || 1.35);
    rawDirectDmg = Math.round(rawDirectDmg * fireVuln);
  }

  // Apply Knight E Power Sword Ice Slow or Fire Burn DoT on sword hits
  let iceSlowApplied = false;
  let fireBurnApplied = false;
  if (isSwordHit && (effectiveInfusion === 'rime' || effectiveInfusion === 'eclipse')) {
    enemy.iceSlowTimer = Math.max(enemy.iceSlowTimer || 0, lvlStats.iceSlowDuration);
    enemy.iceSlowFactor = Math.max(enemy.iceSlowFactor || 0, lvlStats.iceSlowFactor);
    enemy.slowTimer = Math.max(enemy.slowTimer || 0, lvlStats.iceSlowDuration);
    enemy.slowFactor = enemy.iceSlowFactor;
    iceSlowApplied = true;
  }
  if (isSwordHit && (effectiveInfusion === 'solar' || effectiveInfusion === 'eclipse')) {
    enemy.burnTimer = Math.max(enemy.burnTimer || 0, lvlStats.fireBurnDuration);
    enemy.burnDps = Math.max(enemy.burnDps || 0, lvlStats.fireBurnDps);
    fireBurnApplied = true;
  }

  // Check if this hit triggers a Physical Detonation on a marked enemy
  const canDetonate = Boolean(hitSpec.detonatesMark || FINISHER_SOURCES.has(source));
  const activeMark =
    enemy.mark && (enemy.markTimer === undefined || enemy.markTimer > 0) ? enemy.mark : null;

  let detonationSpec = null;
  const isEclipseDetonation =
    canDetonate &&
    !hitSpec.knightUltActive &&
    (activeMark === 'eclipse' ||
      (effectiveInfusion === 'eclipse' &&
        (activeMark === 'rime' || activeMark === 'solar' || isSwordHit)));

  if (activeMark && canDetonate && MARK_TO_DETONATION[activeMark]) {
    detonationSpec = MARK_TO_DETONATION[activeMark];
    enemy.mark = null;
    enemy.markTimer = 0;
  } else if (isEclipseDetonation) {
    detonationSpec = DETONATIONS.solar_flare;
    enemy.mark = null;
    enemy.markTimer = 0;
  }

  const attackerX = hitSpec.attackerPos?.x ?? (enemy.x || 0);
  const attackerZ = hitSpec.attackerPos?.z ?? (enemy.z || 0) + 1.0;

  // BlackKnight Directional Frontal Shield (±70° cone reduces non-detonation hits by 80%;
  // flanking hits from side/behind or Elemental Detonations deal 100% damage and stagger him!)
  let frontalShieldBlocked = false;
  let guardShattered = false;
  const hasDirectionalShield =
    enemy.archetype === 'black_knight' ||
    enemy.charId === 'BlackKnight' ||
    Number(enemy.directionalShieldConeDeg) > 0;

  if (hasDirectionalShield && (enemy.stunTimer || 0) <= 0) {
    const coneRad = ((Number(enemy.directionalShieldConeDeg) || 70) * Math.PI) / 180;
    const dxAttacker = attackerX - (enemy.x || 0);
    const dzAttacker = attackerZ - (enemy.z || 0);
    const distAttacker = Math.hypot(dxAttacker, dzAttacker);
    const angleToAttacker = distAttacker > 1e-4 ? Math.atan2(dxAttacker, dzAttacker) : (enemy.yaw || 0);
    const isFrontalHit =
      enemy.yaw !== undefined &&
      Math.abs(shortestAngleDiff(angleToAttacker, enemy.yaw)) <= coneRad;

    if (detonationSpec) {
      guardShattered = true;
      enemy.shieldGuarding = false;
      enemy.stunTimer = Math.max(enemy.stunTimer || 0, 1.4);
    } else if (isFrontalHit && enemy.aiState !== 'windup') {
      const dr = Number(enemy.directionalShieldDr ?? 0.80);
      rawDirectDmg = Math.max(1, Math.round(rawDirectDmg * (1.0 - dr)));
      frontalShieldBlocked = true;
    } else if (!isFrontalHit) {
      guardShattered = true;
      enemy.shieldGuarding = false;
      enemy.stunTimer = Math.max(enemy.stunTimer || 0, 0.85);
    }
  }

  let aegisBroken = false;

  if (enemy.isBoss && enemy.aegisActive && enemy.aegisLayers > 0) {
    if (
      source === 'couples_ultimate' ||
      source === 'divine_miracle' ||
      source === 'storm_cataclysm'
    ) {
      enemy.aegisLayers = 0;
      enemy.aegisActive = false;
      aegisBroken = true;
      enemy.stunTimer = Math.max(enemy.stunTimer || 0, COUPLES_ULTIMATE.stun);
    } else if (detonationSpec || source === 'divine_blessing' || source === 'knight_sky_lightning') {
      enemy.aegisLayers = Math.max(0, enemy.aegisLayers - 1);
      aegisBroken = true;
      if (enemy.aegisLayers === 0) {
        enemy.aegisActive = false;
        enemy.stunTimer = Math.max(enemy.stunTimer || 0, 2.0);
      }
    } else {
      const reduction = enemy.aegisDmgReduction ?? 0.85;
      rawDirectDmg = Math.max(1, Math.round(rawDirectDmg * (1.0 - reduction)));
    }
  }

  const prevHp = enemy.hp;
  enemy.hp = Math.max(0, enemy.hp - rawDirectDmg);
  let primaryDamageDealt = prevHp - enemy.hp;
  let totalAoEDamage = primaryDamageDealt;

  let detonationResult = null;
  let resonanceGain = Number(hitSpec.resonanceGain || (isSwordHit ? 4 : 0));

  if (detonationSpec) {
    resonanceGain += detonationSpec.resonanceGain;
    const bonusBase = isEclipseDetonation
      ? Math.round((DETONATIONS.solar_flare.bonusDmg + DETONATIONS.shatterblow.bonusDmg) * 0.75)
      : detonationSpec.bonusDmg;
    const bonusDmg = Math.round(bonusBase * empoweredMult * ultMult);
    const affectedIds = [];

    const targets =
      Array.isArray(allEnemies) && allEnemies.length > 0 ? allEnemies : [enemy];
    const cx = enemy.x || 0;
    const cz = enemy.z || 0;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t || t.dead || t.hp <= 0 || t.active === false) continue;
      const dist = t === enemy ? 0 : Math.hypot((t.x || 0) - cx, (t.z || 0) - cz);
      if (dist <= detonationSpec.radius) {
        const before = t.hp;
        t.hp = Math.max(0, t.hp - bonusDmg);
        const dealt = before - t.hp;
        totalAoEDamage += dealt;
        if (t === enemy) {
          primaryDamageDealt += dealt;
        }
        affectedIds.push(t.instanceId || t.id || i);

        const stunDur = isEclipseDetonation
          ? Math.max(detonationSpec.stun || 0, DETONATIONS.shatterblow.stun)
          : detonationSpec.stun;
        if (stunDur) {
          t.stunTimer = Math.max(t.stunTimer || 0, stunDur);
          t.hasAttackToken = false;
          if (t.aiState === 'windup') {
            t.aiState = 'orbit';
            t.windupTimer = 0;
            t.telegraphProgress = 0;
          }
        }

        if (detonationSpec.launchVy) {
          t.vy = detonationSpec.launchVy;
          t.grounded = false;
        }

        if (detonationSpec.pullStrength) {
          const pdx = cx - (t.x || 0);
          const pdz = cz - (t.z || 0);
          const pLen = Math.hypot(pdx, pdz);
          if (pLen > 0.25) {
            t.vx = (pdx / pLen) * detonationSpec.pullStrength;
            t.vz = (pdz / pLen) * detonationSpec.pullStrength;
          }
        } else if (detonationSpec.knockback) {
          const kdx = (t.x || 0) - attackerX;
          const kdz = (t.z || 0) - attackerZ;
          const kLen = Math.hypot(kdx, kdz) || 1;
          t.vx = (kdx / kLen) * detonationSpec.knockback;
          t.vz = (kdz / kLen) * detonationSpec.knockback;
        }

        if (t.hp <= 0) {
          t.dead = true;
          t.hasAttackToken = false;
        }
      }
    }

    detonationResult = {
      id: detonationSpec.id,
      mark: detonationSpec.mark,
      label: detonationSpec.label,
      bonusDmg,
      radius: detonationSpec.radius,
      x: cx,
      y: enemy.y || 0,
      z: cz,
      affectedCount: affectedIds.length,
    };
  } else {
    const nextMark =
      hitSpec.applyMark ||
      (isSwordHit && !FINISHER_SOURCES.has(source) && effectiveInfusion !== 'none'
        ? effectiveInfusion
        : null);
    if (nextMark && enemy.hp > 0) {
      enemy.mark = nextMark;
      enemy.markTimer = hitSpec.markDuration ?? 6.0;
    }

    if (hitSpec.knockback && enemy.hp > 0) {
      const kdx = (enemy.x || 0) - attackerX;
      const kdz = (enemy.z || 0) - attackerZ;
      const kLen = Math.hypot(kdx, kdz) || 1;
      enemy.vx = (kdx / kLen) * hitSpec.knockback;
      enemy.vz = (kdz / kLen) * hitSpec.knockback;
    }
  }

  // Boss 70% and 35% HP Phase Threshold detection (+35 Q Energy to both heroes)
  const bossPhasesCrossed = [];
  if (enemy.isBoss && enemy.maxHp > 0) {
    const hpRatio = enemy.hp / enemy.maxHp;
    if (!enemy.phase70Triggered && hpRatio <= 0.70) {
      enemy.phase70Triggered = true;
      bossPhasesCrossed.push(0.70);
    }
    if (!enemy.phase35Triggered && hpRatio <= 0.35) {
      enemy.phase35Triggered = true;
      bossPhasesCrossed.push(0.35);
    }
  }

  let aegisRaised = false;
  if (
    enemy.isBoss &&
    (enemy.aegisLayersMax ?? 2) > 0 &&
    !enemy.aegisTriggered &&
    enemy.hp > 0 &&
    enemy.hp <= enemy.maxHp * (enemy.aegisTriggerHpRatio ?? 0.5)
  ) {
    enemy.aegisTriggered = true;
    if (source === 'couples_ultimate' || source === 'storm_cataclysm') {
      enemy.aegisActive = false;
      enemy.aegisLayers = 0;
      aegisBroken = true;
    } else {
      enemy.aegisActive = true;
      enemy.aegisLayers = enemy.aegisLayersMax ?? 2;
      aegisRaised = true;
    }
  }

  if (enemy.hp <= 0) {
    enemy.dead = true;
    enemy.hasAttackToken = false;
    enemy.mark = null;
    enemy.markTimer = 0;
  }

  return {
    damageDealt: primaryDamageDealt,
    totalAoEDamage,
    killed: enemy.dead,
    detonation: detonationResult,
    markApplied: enemy.mark || null,
    iceSlowApplied,
    fireBurnApplied,
    frontalShieldBlocked,
    guardShattered,
    bossPhasesCrossed,
    aegisRaised,
    aegisBroken,
    aegisLayersRemaining: enemy.aegisLayers || 0,
    resonanceGain,
    hitstopMs: detonationResult ? 70 : 0,
    cameraPunch: 0, // Zero routine attack camera shake!
  };
}

export const resolveDamageAndMark = applyHitAndResolveDetonation;

/* ------------------------------------------------------------------------- */
/* 7. Headless Deterministic 3-Act Campaign Simulator                        */
/* ------------------------------------------------------------------------- */

export function createHeadlessCampaignSim() {
  const heroes = {
    Knight: {
      id: 'Knight',
      hp: HERO_STATS.Knight.maxHp,
      maxHp: HERO_STATS.Knight.maxHp,
      shield: 0,
      shieldTimer: 0,
      x: 2.8,
      z: 14.5,
      y: 0.0,
      yaw: Math.PI,
      downed: false,
      reviveProgress: 0,
      level: 1,
      xp: 0,
      kills: 0,
      qEnergy: 0,
      selectedElement: 'ice',
      shieldBlocking: false,
      powerSwordActive: false,
      powerSwordTimer: 0,
      powerSwordCd: 0,
      ultActive: false,
      ultTimer: 0,
      ultCd: 0,
      ultDmgMult: 1.0,
      breathingStyle: 'none',
      breathingTimer: 0,
      empoweredBreathing: false,
      perfectDodgeBuff: false,
      iframeTimer: 0,
      interceptCd: 0,
    },
    Mage: {
      id: 'Mage',
      hp: HERO_STATS.Mage.maxHp,
      maxHp: HERO_STATS.Mage.maxHp,
      shield: 0,
      shieldTimer: 0,
      x: 4.6,
      z: 15.0,
      y: 0.0,
      yaw: Math.PI,
      downed: false,
      reviveProgress: 0,
      qEnergy: 0,
      selectedElement: 'ice',
      selectedSpell: 'frost_lance',
      consecutiveChargedCount: 0,
      skillCd: 0,
      stormCataclysmActive: false,
      stormCataclysmTimer: 0,
      stormCataclysmWaveTimer: 0,
      ultCd: 0,
      empoweredBreathing: false,
      perfectDodgeBuff: false,
      iframeTimer: 0,
      infuseCd: 0,
      spellCooldowns: {
        frost_lance: 0,
        shatterlance: 0,
        cinder_fall: 0,
        storm_lance: 0,
      },
    },
  };

  let actIndex = 0;
  let currentActId = ACT_SEQUENCE[0];
  let currentTod = ACT_DEFINITIONS[currentActId].tod;
  let waveIndex = -1;
  let actTriggered = false;
  let heartResonance = 0;
  let tetherSurge = { active: false, style: 'none', progress: 0, duration: 0.65 };

  const poolSlots = [
    { slotIndex: 0, poolRole: 'Skeleton_Warrior', busy: false, visible: false, enemy: null },
    { slotIndex: 1, poolRole: 'Skeleton_Warrior', busy: false, visible: false, enemy: null },
    { slotIndex: 2, poolRole: 'Skeleton_Minion', busy: false, visible: false, enemy: null },
    { slotIndex: 3, poolRole: 'Skeleton_Rogue', busy: false, visible: false, enemy: null },
    { slotIndex: 4, poolRole: 'Skeleton_Mage', busy: false, visible: false, enemy: null },
    { slotIndex: 5, poolRole: 'Boss_Sovereign', busy: false, visible: false, enemy: null },
  ];

  let activeEnemies = [];
  let spawnQueue = [];
  let nextEnemySeq = 1;
  const eventLog = [];

  function awardKnightKillXp(enemy) {
    const xpGain = enemy?.isBoss
      ? HERO_STATS.Knight.xpPerKill * 4
      : enemy?.isElite
        ? HERO_STATS.Knight.xpPerKill * 2
        : HERO_STATS.Knight.xpPerKill;
    heroes.Knight.kills += 1;
    heroes.Knight.xp += xpGain;
    while (heroes.Knight.xp >= HERO_STATS.Knight.xpPerLevel) {
      heroes.Knight.xp -= HERO_STATS.Knight.xpPerLevel;
      heroes.Knight.level += 1;
      eventLog.push({ type: 'knight_level_up', level: heroes.Knight.level });
    }
  }

  function addResonance(amount) {
    heartResonance = clamp(heartResonance + amount, 0, 100);
    return heartResonance;
  }

  function acquirePoolSlot(archetypeSpec) {
    const visibleCount = poolSlots.filter((s) => s.busy && s.visible).length;
    if (visibleCount >= MAX_CONCURRENT_ENEMIES) return null;

    if (archetypeSpec.isBoss) {
      const bossSlot = poolSlots[5];
      if (!bossSlot.busy) return bossSlot;
    }

    for (let i = 0; i < 5; i++) {
      if (!poolSlots[i].busy && poolSlots[i].poolRole === archetypeSpec.poolRole) {
        return poolSlots[i];
      }
    }
    for (let i = 0; i < 5; i++) {
      if (!poolSlots[i].busy) {
        return poolSlots[i];
      }
    }
    return null;
  }

  function spawnEnemyFromSpec(spawnSpec) {
    const arch = ENEMY_ARCHETYPES[spawnSpec.archetype] || ENEMY_ARCHETYPES.warrior;
    const slot = acquirePoolSlot(arch);
    if (!slot) {
      spawnQueue.push(spawnSpec);
      return null;
    }

    let sx = spawnSpec.x;
    let sz = spawnSpec.z;
    if (currentActId === 'act3_shrine') {
      const resolved = resolveShrineObstacles(sx, sz, 0.65, true);
      sx = resolved.x;
      sz = resolved.z;
    }

    const enemy = {
      instanceId: `enemy_${nextEnemySeq++}`,
      archetype: arch.id,
      charId: arch.charId,
      name: arch.name,
      slotIndex: slot.slotIndex,
      hp: arch.maxHp,
      maxHp: arch.maxHp,
      dmg: arch.dmg,
      speed: arch.speed,
      qEnergyReward: arch.qEnergyReward ?? 20,
      attackRange: arch.attackRange,
      windupDuration: arch.windupDuration,
      attackCooldown: arch.attackCooldown,
      telegraphRadius: arch.telegraphRadius,
      isRanged: Boolean(arch.isRanged),
      isElite: Boolean(arch.isElite),
      isBoss: Boolean(arch.isBoss),
      aegisTriggerHpRatio: arch.aegisTriggerHpRatio ?? 0.5,
      aegisLayersMax: arch.aegisLayersMax ?? 2,
      aegisDmgReduction: arch.aegisDmgReduction ?? 0.85,
      aegisTriggered: false,
      aegisActive: false,
      aegisLayers: 0,
      phase70Triggered: false,
      phase35Triggered: false,
      x: sx,
      y: ACT_DEFINITIONS[currentActId]?.center?.y || 0,
      z: sz,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: true,
      dead: false,
      xpAwarded: false,
      active: true,
      mark: null,
      markTimer: 0,
      stunTimer: 0,
      slowTimer: 0,
      iceSlowTimer: 0,
      iceSlowFactor: 0,
      burnTimer: 0,
      burnDps: 0,
      aiState: 'orbit',
      windupTimer: 0,
      telegraphProgress: 0,
      cooldownTimer: 0.4,
      hasAttackToken: false,
      distToTarget: 10,
    };

    slot.busy = true;
    slot.visible = true;
    slot.enemy = enemy;
    activeEnemies.push(enemy);
    return enemy;
  }

  function releaseEnemySlot(enemy) {
    if (enemy && !enemy.xpAwarded && (enemy.dead || enemy.hp <= 0)) {
      enemy.xpAwarded = true;
      awardKnightKillXp(enemy);
    }
    const slot = poolSlots[enemy.slotIndex];
    if (slot) {
      slot.busy = false;
      slot.visible = false;
      slot.enemy = null;
    }
    enemy.active = false;
    activeEnemies = activeEnemies.filter((e) => e !== enemy);

    while (spawnQueue.length > 0 && activeEnemies.length < MAX_CONCURRENT_ENEMIES) {
      const nextSpec = spawnQueue.shift();
      spawnEnemyFromSpec(nextSpec);
    }
  }

  function startWave(idx) {
    const act = ACT_DEFINITIONS[currentActId];
    if (!act || !act.waves || idx >= act.waves.length) return false;
    waveIndex = idx;
    spawnQueue = [];
    for (const s of poolSlots) {
      s.busy = false;
      s.visible = false;
      s.enemy = null;
    }
    activeEnemies = [];

    const wave = act.waves[idx];
    for (const sp of wave.spawns) {
      spawnEnemyFromSpec(sp);
    }
    allocateAttackTokens(activeEnemies, MAX_ATTACK_TOKENS);
    eventLog.push({ type: 'wave_start', actId: currentActId, waveId: wave.id });
    return true;
  }

  function reviveAllHeroesInstant() {
    for (const h of Object.values(heroes)) {
      if (h.downed) {
        h.downed = false;
        h.reviveProgress = 0;
        h.hp = Math.max(h.hp, Math.round(h.maxHp * 0.6));
      }
    }
  }

  function advanceToAct(nextActId) {
    currentActId = nextActId;
    actIndex = ACT_SEQUENCE.indexOf(nextActId);
    const act = ACT_DEFINITIONS[currentActId];
    currentTod = act.tod;
    waveIndex = -1;
    actTriggered = false;
    spawnQueue = [];
    for (const s of poolSlots) {
      s.busy = false;
      s.visible = false;
      s.enemy = null;
    }
    activeEnemies = [];
    eventLog.push({ type: 'act_changed', actId: currentActId, tod: currentTod });
  }

  function checkWaveAndActCompletion() {
    for (const e of activeEnemies) {
      if ((e.dead || e.hp <= 0) && !e.xpAwarded) {
        e.xpAwarded = true;
        awardKnightKillXp(e);
      }
    }
    const act = ACT_DEFINITIONS[currentActId];
    if (!act || !actTriggered) return;

    const deadList = activeEnemies.filter((e) => e.dead || e.hp <= 0);
    for (const d of deadList) {
      releaseEnemySlot(d);
    }

    if (act.waves && act.waves.length > 0) {
      if (activeEnemies.length === 0 && spawnQueue.length === 0) {
        reviveAllHeroesInstant();
        if (waveIndex + 1 < act.waves.length) {
          startWave(waveIndex + 1);
        } else {
          eventLog.push({ type: 'act_cleared', actId: currentActId });
          const nextActId = ACT_SEQUENCE[actIndex + 1];
          if (nextActId) {
            advanceToAct(nextActId);
          }
        }
      }
    }
  }

  function moveHeroesTo(x, z) {
    heroes.Knight.x = x;
    heroes.Knight.z = z;
    heroes.Mage.x = x + 1.8;
    heroes.Mage.z = z + 0.5;
    heroes.Mage.consecutiveChargedCount = 0;
    actionAim.notifyHeroMoved('Mage');

    const act = ACT_DEFINITIONS[currentActId];
    if (act && !actTriggered) {
      const d = Math.hypot(x - act.center.x, z - act.center.z);
      if (d <= act.triggerRadius) {
        actTriggered = true;
        if (currentActId === 'interlude_pier') {
          heroes.Knight.hp = heroes.Knight.maxHp;
          heroes.Mage.hp = heroes.Mage.maxHp;
          heroes.Knight.shield = act.sanctuaryReward.shield;
          heroes.Mage.shield = act.sanctuaryReward.shield;
          heroes.Knight.empoweredBreathing = true;
          heroes.Mage.empoweredBreathing = true;
          addResonance(act.sanctuaryReward.resonanceGain);
          eventLog.push({
            type: 'sanctuary_blessing',
            actId: currentActId,
            empoweredBreathing: true,
          });
          advanceToAct('act2_plaza');
        } else if (act.waves && act.waves.length > 0) {
          startWave(0);
        }
      }
    }
  }

  function igniteKnightBreathing(styleId, duration = HERO_STATS.Knight.powerSwordDuration) {
    const resolvedStyle =
      styleId === 'ice' ? 'rime' : styleId === 'fire' ? 'solar' : styleId;
    if (!BREATHING_STYLES[resolvedStyle]) return;
    heroes.Knight.breathingStyle = resolvedStyle;
    heroes.Knight.breathingTimer = duration;
    tetherSurge = { active: true, style: resolvedStyle, progress: 0, duration: 0.65 };
  }

  function castSpell(spellId, targetEnemy = null, options = {}) {
    const spell = SPELLS[spellId];
    if (!spell || heroes.Mage.downed) return null;

    const castDistance = Number(options.distance || options.range || spell.range);
    const primary =
      targetEnemy ||
      selectSoftLockTarget(
        heroes.Mage,
        heroes.Mage.yaw,
        activeEnemies,
        { maxRange: castDistance, partnerPos: heroes.Knight }
      ) ||
      activeEnemies[0];

    if (!heroes.Knight.powerSwordActive && !heroes.Knight.ultActive) {
      igniteKnightBreathing(spell.infusion, HERO_STATS.Knight.powerSwordDuration);
    }
    heroes.Mage.spellCooldowns[spell.id] = spell.cd;
    if (spell.id === 'frost_lance' || spell.id === 'cinder_fall') {
      heroes.Mage.skillCd = MAGE_E_COOLDOWN;
    }
    addResonance(spell.resonanceGain);

    const results = [];
    if (primary) {
      const hitRes = applyHitAndResolveDetonation(
        primary,
        {
          source: spell.id,
          baseDmg: spell.dmg,
          applyMark: spell.mark,
          detonatesMark: Boolean(spell.detonatesMark),
          empoweredBreathing: heroes.Mage.empoweredBreathing,
          attackerPos: heroes.Mage,
        },
        activeEnemies
      );
      if (hitRes.detonation) {
        addResonance(
          hitRes.detonation.resonanceGain || DETONATIONS[hitRes.detonation.id].resonanceGain
        );
      }
      results.push(hitRes);

      if (spell.radius || spell.chainCount) {
        const rad = spell.chainRadius || spell.radius || 4.0;
        let chainsLeft = spell.chainCount || 99;
        for (const other of activeEnemies) {
          if (other === primary || other.dead || other.hp <= 0) continue;
          if (chainsLeft <= 0) break;
          const d = Math.hypot(other.x - primary.x, other.z - primary.z);
          if (d <= rad) {
            chainsLeft--;
            results.push(
              applyHitAndResolveDetonation(
                other,
                {
                  source: spell.id,
                  baseDmg: Math.round(spell.dmg * 0.8),
                  applyMark: spell.mark,
                  empoweredBreathing: heroes.Mage.empoweredBreathing,
                  attackerPos: heroes.Mage,
                },
                activeEnemies
              )
            );
          }
        }
      }
    }

    checkWaveAndActCompletion();
    return {
      spell,
      distance: castDistance,
      results,
      knightBreathing: heroes.Knight.breathingStyle,
    };
  }

  function mageInfuse(styleId = 'rime') {
    if (heroes.Mage.downed) return null;
    heroes.Knight.hp = Math.min(
      heroes.Knight.maxHp,
      heroes.Knight.hp + HERO_STATS.Mage.infuseHeal
    );
    heroes.Mage.hp = Math.min(
      heroes.Mage.maxHp,
      heroes.Mage.hp + Math.round(HERO_STATS.Mage.infuseHeal * 0.6)
    );
    igniteKnightBreathing(styleId, HERO_STATS.Mage.infuseDuration);
    heroes.Mage.infuseCd = HERO_STATS.Mage.infuseCd;
    addResonance(10);
    return { style: styleId, knightHp: heroes.Knight.hp };
  }

  function knightAttack(swingType = 'combo1', targetEnemy = null) {
    if (heroes.Knight.downed) return null;
    heroes.Knight.shieldBlocking = false;
    const target =
      targetEnemy ||
      selectSoftLockTarget(
        heroes.Knight,
        heroes.Knight.yaw,
        activeEnemies,
        { maxRange: 8.0, partnerPos: heroes.Mage }
      ) ||
      activeEnemies[0];
    if (!target) return null;

    let baseDmg = HERO_STATS.Knight.comboDmg[0];
    if (swingType === 'combo2') baseDmg = HERO_STATS.Knight.comboDmg[1];
    else if (swingType === 'combo3') baseDmg = HERO_STATS.Knight.comboDmg[2];
    else if (swingType === 'combo4') baseDmg = HERO_STATS.Knight.combo4Dmg || 46;
    else if (swingType === 'charged' || swingType === 'heavy')
      baseDmg = HERO_STATS.Knight.heavyDmg;

    const res = applyHitAndResolveDetonation(
      target,
      {
        source: swingType,
        baseDmg,
        infusion: heroes.Knight.breathingStyle,
        knightLevel: heroes.Knight.level,
        knightUltActive: heroes.Knight.ultActive,
        ultDmgMult: heroes.Knight.ultDmgMult,
        empoweredBreathing: heroes.Knight.empoweredBreathing,
        perfectDodgeBuff: heroes.Knight.perfectDodgeBuff,
        attackerPos: heroes.Knight,
      },
      activeEnemies
    );
    heroes.Knight.perfectDodgeBuff = false;
    addResonance(res.resonanceGain);
    checkWaveAndActCompletion();
    return res;
  }

  function knightToggleElement() {
    const res = actionAim.toggleElement('Knight');
    heroes.Knight.selectedElement = res.element;
    return res;
  }

  function knightHoldShieldBlock(active = true) {
    if (active) {
      const res = actionAim.pressHeavy('Knight');
      heroes.Knight.shieldBlocking = true;
      return res;
    }
    const res = actionAim.releaseHeavy('Knight');
    heroes.Knight.shieldBlocking = false;
    return res;
  }

  function knightActivatePowerSword() {
    if (heroes.Knight.downed) return null;
    if (heroes.Knight.powerSwordCd > 0.05) {
      return { onCooldown: true, cooldownRemaining: heroes.Knight.powerSwordCd };
    }
    const elem = heroes.Knight.selectedElement || 'ice';
    const styleId = elem === 'fire' ? 'solar' : 'rime';
    heroes.Knight.summonedElement = elem;
    heroes.Knight.powerSwordActive = true;
    heroes.Knight.powerSwordTimer = KNIGHT_POWER_SWORD_DURATION;
    heroes.Knight.powerSwordCd = KNIGHT_POWER_SWORD_COOLDOWN;
    igniteKnightBreathing(styleId, KNIGHT_POWER_SWORD_DURATION);
    return {
      activated: true,
      element: elem,
      summonedElement: elem,
      breathingStyle: styleId,
      activeDuration: KNIGHT_POWER_SWORD_DURATION,
      totalCooldown: KNIGHT_POWER_SWORD_COOLDOWN,
      downtimeAfterExpiry: KNIGHT_POWER_SWORD_COOLDOWN - KNIGHT_POWER_SWORD_DURATION,
    };
  }

  function knightCastSkyLightningUlt(targetEnemy = null) {
    if (heroes.Knight.downed) return null;
    if (heroes.Knight.ultCd > 0.05) {
      return { onCooldown: true, cooldownRemaining: heroes.Knight.ultCd };
    }
    heroes.Knight.ultActive = true;
    heroes.Knight.ultTimer = KNIGHT_ULT_DURATION;
    heroes.Knight.ultDmgMult = KNIGHT_ULT_DMG_MULT;
    heroes.Knight.ultCd = KNIGHT_ULT_COOLDOWN;
    const styleId = 'eclipse';
    igniteKnightBreathing(styleId, Math.max(heroes.Knight.breathingTimer, KNIGHT_ULT_DURATION));

    const target = targetEnemy || activeEnemies[0];
    let strikeResult = null;
    if (target && !target.dead) {
      strikeResult = applyHitAndResolveDetonation(
        target,
        {
          source: 'knight_sky_lightning',
          baseDmg: 75,
          infusion: styleId,
          knightLevel: heroes.Knight.level,
          knightUltActive: true,
          ultDmgMult: KNIGHT_ULT_DMG_MULT,
          detonatesMark: true,
          attackerPos: heroes.Knight,
        },
        activeEnemies
      );
      checkWaveAndActCompletion();
    }
    return {
      activated: true,
      poseClip: 'pray_channel',
      element: 'eclipse',
      duration: KNIGHT_ULT_DURATION,
      dmgMult: KNIGHT_ULT_DMG_MULT,
      cooldown: KNIGHT_ULT_COOLDOWN,
      strikeResult,
    };
  }

  function mageTapAttack(targetEnemy = null) {
    if (heroes.Mage.downed || heroes.Mage.stormCataclysmActive) return null;
    heroes.Mage.consecutiveChargedCount = 0;
    const swingRes = actionAim.pressAttack('Mage');
    const target =
      targetEnemy ||
      selectSoftLockTarget(
        heroes.Mage,
        heroes.Mage.yaw,
        activeEnemies,
        { maxRange: HERO_STATS.Mage.boltRange, partnerPos: heroes.Knight }
      ) ||
      activeEnemies[0];
    let hitResult = null;
    if (target) {
      const cIdx = clamp(actionAim.heroes.Mage.comboIndex, 0, 2);
      const dmg = HERO_STATS.Mage.boltDmg[cIdx] || 18;
      hitResult = applyHitAndResolveDetonation(
        target,
        {
          source: cIdx === 2 ? 'mage_attack3' : cIdx === 1 ? 'mage_attack2' : 'mage_attack1',
          baseDmg: dmg,
          applyMark: cIdx === 2 ? 'rime' : null,
          attackerPos: heroes.Mage,
        },
        activeEnemies
      );
      checkWaveAndActCompletion();
    }
    return {
      kind: 'normal_bolt',
      consecutiveChargedCount: heroes.Mage.consecutiveChargedCount,
      swingRes,
      hitResult,
    };
  }

  function mageHoldChargedAttack(targetEnemy = null) {
    if (heroes.Mage.downed || heroes.Mage.stormCataclysmActive) return null;
    actionAim.heroes.Mage.activeSwing = null;
    const heavyRes = actionAim.pressHeavy('Mage');
    heroes.Mage.consecutiveChargedCount = actionAim.heroes.Mage.consecutiveChargedCount;

    if (heavyRes.fallbackToNormal) {
      const target =
        targetEnemy ||
        selectSoftLockTarget(
          heroes.Mage,
          heroes.Mage.yaw,
          activeEnemies,
          { maxRange: HERO_STATS.Mage.boltRange, partnerPos: heroes.Knight }
        ) ||
        activeEnemies[0];
      let hitResult = null;
      if (target) {
        hitResult = applyHitAndResolveDetonation(
          target,
          {
            source: 'mage_attack1',
            baseDmg: HERO_STATS.Mage.boltDmg[0],
            attackerPos: heroes.Mage,
          },
          activeEnemies
        );
        checkWaveAndActCompletion();
      }
      return {
        kind: 'normal_bolt_fallback',
        fallbackToNormal: true,
        consecutiveChargedCount: heroes.Mage.consecutiveChargedCount,
        hitResult,
      };
    }

    const castRes = castSpell('shatterlance', targetEnemy);
    return {
      kind: 'charged_shatterlance',
      fallbackToNormal: false,
      stationary: true,
      startTime: 0,
      consecutiveChargedCount: heroes.Mage.consecutiveChargedCount,
      castRes,
    };
  }

  function mageToggleSpell() {
    const res = actionAim.toggleElement('Mage');
    heroes.Mage.selectedSpell = res.spellId;
    heroes.Mage.selectedElement = res.element;
    return res;
  }

  function mageStartSkillAim(opts = {}) {
    return actionAim.startSkillAim({
      origin: opts.origin || heroes.Mage,
      yaw: opts.yaw ?? heroes.Mage.yaw,
      pitch: opts.pitch ?? 0.18,
      distance: opts.distance,
      touchTarget: opts.touchTarget,
      spellId: opts.spellId || heroes.Mage.selectedSpell,
    });
  }

  function mageUpdateSkillAim(opts = {}) {
    return actionAim.updateSkillAim(opts);
  }

  function mageReleaseSkillAim(opts = null) {
    if (heroes.Mage.skillCd > 0.05) {
      actionAim.cancelSkillAim();
      return { onCooldown: true, cooldownRemaining: heroes.Mage.skillCd };
    }
    return actionAim.releaseSkillAim(opts);
  }

  function mageCastStormCataclysm() {
    if (heroes.Mage.downed) return null;
    if (heroes.Mage.ultCd > 0.05) {
      return { onCooldown: true, cooldownRemaining: heroes.Mage.ultCd };
    }
    heroes.Mage.stormCataclysmActive = true;
    heroes.Mage.stormCataclysmTimer = MAGE_STORM_CATACLYSM_DURATION;
    heroes.Mage.stormCataclysmCastTimer = HERO_STATS.Mage.stormCataclysmCastDuration || 0.8;
    heroes.Mage.stormCataclysmWaveTimer = 0;
    heroes.Mage.ultCd = MAGE_STORM_CATACLYSM_COOLDOWN;

    const waveHits = [];
    for (const e of [...activeEnemies]) {
      if (!e || e.dead || e.hp <= 0) continue;
      waveHits.push(
        applyHitAndResolveDetonation(
          e,
          {
            source: 'storm_cataclysm',
            baseDmg: HERO_STATS.Mage.stormCataclysmMeteorDmg || HERO_STATS.Mage.stormCataclysmWaveDmg,
            applyMark: 'solar',
            detonatesMark: true,
            empoweredBreathing: true,
            attackerPos: heroes.Mage,
          },
          activeEnemies
        )
      );
    }
    checkWaveAndActCompletion();
    return {
      activated: true,
      stationary: false,
      vulnerableOneHitDown: false,
      castPoseDuration: HERO_STATS.Mage.stormCataclysmCastDuration || 0.8,
      duration: MAGE_STORM_CATACLYSM_DURATION,
      cooldown: MAGE_STORM_CATACLYSM_COOLDOWN,
      waveHits,
    };
  }

  function knightIntercept(targetEnemy = null) {
    if (heroes.Knight.downed) return null;
    heroes.Knight.shield = HERO_STATS.Knight.interceptShield;
    heroes.Knight.shieldTimer = HERO_STATS.Knight.interceptDuration;
    heroes.Mage.shield = HERO_STATS.Knight.interceptShield;
    heroes.Mage.shieldTimer = HERO_STATS.Knight.interceptDuration;
    heroes.Knight.interceptCd = HERO_STATS.Knight.interceptCd;

    const target = targetEnemy || activeEnemies[0];
    let res = null;
    if (target) {
      heroes.Knight.x = target.x - 1.2;
      heroes.Knight.z = target.z + 1.2;
      res = applyHitAndResolveDetonation(
        target,
        {
          source: 'intercept',
          baseDmg: HERO_STATS.Knight.interceptDmg,
          infusion: heroes.Knight.breathingStyle,
          knightLevel: heroes.Knight.level,
          knightUltActive: heroes.Knight.ultActive,
          ultDmgMult: heroes.Knight.ultDmgMult,
          empoweredBreathing: heroes.Knight.empoweredBreathing,
          knockback: HERO_STATS.Knight.interceptKnockback,
          attackerPos: heroes.Knight,
        },
        activeEnemies
      );
      addResonance(res.resonanceGain + 8);
      checkWaveAndActCompletion();
    }
    return {
      knightShield: heroes.Knight.shield,
      mageShield: heroes.Mage.shield,
      hitResult: res,
    };
  }

  function castCouplesUltimate() {
    if (heartResonance < COUPLES_ULTIMATE.resonanceCost) return null;
    heartResonance = 0;

    heroes.Knight.hp = heroes.Knight.maxHp;
    heroes.Mage.hp = heroes.Mage.maxHp;
    heroes.Knight.downed = false;
    heroes.Mage.downed = false;
    heroes.Knight.shield = COUPLES_ULTIMATE.shieldGrant;
    heroes.Mage.shield = COUPLES_ULTIMATE.shieldGrant;

    const hits = [];
    const snapshot = [...activeEnemies];
    for (const e of snapshot) {
      if (e.dead || e.hp <= 0) continue;
      hits.push(
        applyHitAndResolveDetonation(
          e,
          {
            source: 'couples_ultimate',
            baseDmg: COUPLES_ULTIMATE.dmg,
            detonatesMark: true,
            empoweredBreathing: heroes.Knight.empoweredBreathing,
            attackerPos: heroes.Knight,
          },
          activeEnemies
        )
      );
    }
    checkWaveAndActCompletion();
    return { hits, resonance: heartResonance };
  }

  function applyDamageToHero(heroId, amount, attackerEnemy = null) {
    const h = heroes[heroId];
    if (!h || h.downed || h.iframeTimer > 0) {
      return { absorbed: 0, hpLost: 0, downed: false, interceptedByKnight: false };
    }

    const slowReduction = clamp(Number(attackerEnemy?.iceSlowFactor) || 0, 0, 0.75);
    let effectiveAmount = Math.max(1, Math.round(amount * (1.0 - slowReduction)));

    if (heroId === 'Mage' && heroes.Knight.shieldBlocking && !heroes.Knight.downed) {
      const blockedDmg = Math.max(
        1,
        Math.round(effectiveAmount * (1.0 - KNIGHT_SHIELD_BLOCK_DR))
      );
      const knightRes = applyDamageToHero('Knight', blockedDmg, null);
      return {
        absorbed: effectiveAmount - blockedDmg + knightRes.absorbed,
        hpLost: 0,
        knightHpLost: knightRes.hpLost,
        downed: false,
        interceptedByKnight: true,
      };
    }

    if (heroId === 'Knight' && heroes.Knight.shieldBlocking) {
      effectiveAmount = Math.max(
        1,
        Math.round(effectiveAmount * (1.0 - KNIGHT_SHIELD_BLOCK_DR))
      );
    }

    let rem = effectiveAmount;
    let absorbed = 0;
    if (h.shield > 0) {
      absorbed = Math.min(h.shield, rem);
      h.shield -= absorbed;
      rem -= absorbed;
    }

    h.hp = Math.max(0, h.hp - rem);
    if (h.hp <= 0) {
      h.downed = true;
      h.reviveProgress = 0;
    }
    return { absorbed, hpLost: rem, downed: h.downed, interceptedByKnight: false };
  }

  const actionAim = createCombatActionAimController({
    walkableHeightAt: () => ACT_DEFINITIONS[currentActId]?.center?.y || 0,
    onContactHit: (swing) => {
      if (swing.heroId === 'Knight') {
        knightAttack(swing.clip);
      } else if (swing.kind === 'charged') {
        castSpell('shatterlance');
      } else {
        const target =
          selectSoftLockTarget(
            heroes.Mage,
            heroes.Mage.yaw,
            activeEnemies,
            { maxRange: HERO_STATS.Mage.boltRange, partnerPos: heroes.Knight }
          ) || activeEnemies[0];
        if (target) {
          applyHitAndResolveDetonation(
            target,
            {
              source: swing.clip,
              baseDmg: HERO_STATS.Mage.boltDmg[swing.comboIndex] || 18,
              applyMark: swing.comboIndex === 2 ? 'rime' : null,
              attackerPos: heroes.Mage,
            },
            activeEnemies
          );
          checkWaveAndActCompletion();
        }
      }
    },
    onAimCast: (payload) => {
      heroes.Mage.skillCd = MAGE_E_COOLDOWN;
      return castSpell(payload.spellId, null, { distance: payload.distance });
    },
  });

  function step(dt) {
    actionAim.update(dt);

    for (const h of Object.values(heroes)) {
      if (h.shieldTimer > 0) {
        h.shieldTimer = Math.max(0, h.shieldTimer - dt);
        if (h.shieldTimer <= 0) h.shield = 0;
      }
      if (h.iframeTimer > 0) h.iframeTimer = Math.max(0, h.iframeTimer - dt);
    }

    if (heroes.Knight.powerSwordTimer > 0) {
      heroes.Knight.powerSwordTimer = Math.max(0, heroes.Knight.powerSwordTimer - dt);
      if (heroes.Knight.powerSwordTimer <= 0) {
        heroes.Knight.powerSwordActive = false;
      }
    }
    if (heroes.Knight.powerSwordCd > 0) {
      heroes.Knight.powerSwordCd = Math.max(0, heroes.Knight.powerSwordCd - dt);
    }

    if (heroes.Knight.ultTimer > 0) {
      heroes.Knight.ultTimer = Math.max(0, heroes.Knight.ultTimer - dt);
      if (heroes.Knight.ultTimer <= 0) {
        heroes.Knight.ultActive = false;
        heroes.Knight.ultDmgMult = 1.0;
      }
    }
    if (heroes.Knight.ultCd > 0) {
      heroes.Knight.ultCd = Math.max(0, heroes.Knight.ultCd - dt);
    }

    if (heroes.Knight.breathingTimer > 0) {
      heroes.Knight.breathingTimer = Math.max(0, heroes.Knight.breathingTimer - dt);
      if (heroes.Knight.breathingTimer <= 0) heroes.Knight.breathingStyle = 'none';
    }

    if (heroes.Mage.skillCd > 0) {
      heroes.Mage.skillCd = Math.max(0, heroes.Mage.skillCd - dt);
    }
    if (heroes.Mage.ultCd > 0) {
      heroes.Mage.ultCd = Math.max(0, heroes.Mage.ultCd - dt);
    }
    for (const k of Object.keys(heroes.Mage.spellCooldowns)) {
      if (heroes.Mage.spellCooldowns[k] > 0) {
        heroes.Mage.spellCooldowns[k] = Math.max(0, heroes.Mage.spellCooldowns[k] - dt);
      }
    }

    if (heroes.Mage.stormCataclysmActive && heroes.Mage.stormCataclysmTimer > 0) {
      heroes.Mage.stormCataclysmTimer = Math.max(0, heroes.Mage.stormCataclysmTimer - dt);
      heroes.Mage.stormCataclysmWaveTimer += dt;
      if (heroes.Mage.stormCataclysmWaveTimer >= 1.0) {
        heroes.Mage.stormCataclysmWaveTimer -= 1.0;
        for (const e of [...activeEnemies]) {
          if (!e || e.dead || e.hp <= 0) continue;
          applyHitAndResolveDetonation(
            e,
            {
              source: 'storm_cataclysm',
              baseDmg: HERO_STATS.Mage.stormCataclysmWaveDmg,
              applyMark: 'tempest',
              detonatesMark: true,
              empoweredBreathing: true,
              attackerPos: heroes.Mage,
            },
            activeEnemies
          );
        }
      }
      if (heroes.Mage.stormCataclysmTimer <= 0) {
        heroes.Mage.stormCataclysmActive = false;
      }
    }

    if (tetherSurge.active) {
      tetherSurge.progress += dt / tetherSurge.duration;
      if (tetherSurge.progress >= 1) tetherSurge.active = false;
    }

    const distPartners = Math.hypot(
      heroes.Knight.x - heroes.Mage.x,
      heroes.Knight.z - heroes.Mage.z
    );
    for (const [id, h] of Object.entries(heroes)) {
      const partner = id === 'Knight' ? heroes.Mage : heroes.Knight;
      if (h.downed && !partner.downed && distPartners <= 3.5) {
        h.reviveProgress = Math.min(1.0, h.reviveProgress + dt / 2.0);
        if (h.reviveProgress >= 1.0) {
          h.downed = false;
          h.reviveProgress = 0;
          h.hp = Math.round(h.maxHp * 0.65);
          h.shield = 25;
          h.shieldTimer = 4.0;
          eventLog.push({ type: 'hero_revived', heroId: id });
        }
      }
    }

    for (const e of activeEnemies) {
      if (e.dead || e.hp <= 0) continue;

      if (e.burnTimer > 0 && e.burnDps > 0) {
        const tickDt = Math.min(dt, e.burnTimer);
        e.burnTimer = Math.max(0, e.burnTimer - dt);
        const burnDmg = e.burnDps * tickDt;
        e.hp = Math.max(0, Number((e.hp - burnDmg).toFixed(2)));
        if (e.hp <= 0) {
          e.dead = true;
          e.hasAttackToken = false;
          continue;
        }
      }

      if (e.iceSlowTimer > 0) {
        e.iceSlowTimer = Math.max(0, e.iceSlowTimer - dt);
        if (e.iceSlowTimer <= 0) {
          e.iceSlowFactor = 0;
        }
      }

      if (e.markTimer > 0) {
        e.markTimer = Math.max(0, e.markTimer - dt);
        if (e.markTimer <= 0) e.mark = null;
      }
      if (e.stunTimer > 0) {
        e.stunTimer = Math.max(0, e.stunTimer - dt);
      }
      if (!e.grounded) {
        e.vy -= 19.0 * dt;
        e.y += e.vy * dt;
        const groundY = ACT_DEFINITIONS[currentActId]?.center?.y || 0;
        if (e.y <= groundY) {
          e.y = groundY;
          e.vy = 0;
          e.grounded = true;
        }
      }
      if (Math.hypot(e.vx, e.vz) > 1e-3) {
        e.x += e.vx * dt;
        e.z += e.vz * dt;
        e.vx *= Math.max(0, 1 - 6.0 * dt);
        e.vz *= Math.max(0, 1 - 6.0 * dt);
        if (currentActId === 'act3_shrine') {
          const res = resolveShrineObstacles(e.x, e.z, 0.65, true);
          e.x = res.x;
          e.z = res.z;
        }
      }
      e.distToTarget = Math.hypot(e.x - heroes.Knight.x, e.z - heroes.Knight.z);
    }

    allocateAttackTokens(activeEnemies, MAX_ATTACK_TOKENS);

    for (const e of activeEnemies) {
      if (e.dead || e.hp <= 0 || e.stunTimer > 0) continue;
      const slowMult = 1.0 - clamp(e.iceSlowFactor || 0, 0, 0.75);
      if (e.cooldownTimer > 0) e.cooldownTimer = Math.max(0, e.cooldownTimer - dt * slowMult);

      if (e.hasAttackToken) {
        if (e.aiState === 'windup') {
          e.windupTimer += dt * slowMult;
          e.telegraphProgress = clamp(e.windupTimer / e.windupDuration, 0, 1);
          if (e.windupTimer >= e.windupDuration) {
            e.aiState = 'orbit';
            e.windupTimer = 0;
            e.telegraphProgress = 0;
            e.cooldownTimer = e.attackCooldown;
            if (e.distToTarget <= e.telegraphRadius + 1.2) {
              applyDamageToHero('Knight', e.dmg, e);
            }
          }
        } else if (e.cooldownTimer <= 0 && e.distToTarget <= e.attackRange + 0.5) {
          e.aiState = 'windup';
          e.windupTimer = 0;
          e.telegraphProgress = 0;
        } else if (e.distToTarget > e.attackRange * 0.85) {
          const dx = heroes.Knight.x - e.x;
          const dz = heroes.Knight.z - e.z;
          const d = Math.hypot(dx, dz) || 1;
          e.x += (dx / d) * e.speed * slowMult * dt;
          e.z += (dz / d) * e.speed * slowMult * dt;
        }
      }
    }

    checkWaveAndActCompletion();
  }

  function runFullCampaignAutoPlay() {
    let safetySteps = 0;
    const spellOrder = ['frost_lance', 'cinder_fall', 'storm_lance', 'shatterlance'];
    let spellIdx = 0;

    while (currentActId !== 'victory_dawn' && safetySteps < 600) {
      safetySteps++;
      const act = ACT_DEFINITIONS[currentActId];
      if (!actTriggered) {
        moveHeroesTo(act.center.x, act.center.z);
      }

      if (activeEnemies.length > 0) {
        const target = activeEnemies[0];
        heroes.Knight.x = target.x - 1.2;
        heroes.Knight.z = target.z + 1.0;
        heroes.Mage.x = target.x - 3.0;
        heroes.Mage.z = target.z + 2.2;

        const spId = spellOrder[spellIdx % spellOrder.length];
        spellIdx++;
        castSpell(spId, target);

        if (!target.dead) knightAttack('combo1', target);
        if (!target.dead) knightAttack('combo2', target);
        if (!target.dead) knightAttack('combo3', target);
        if (!target.dead) knightAttack('combo4', target);

        if (heartResonance >= 100 && activeEnemies.some((e) => e.isBoss && e.aegisActive)) {
          castCouplesUltimate();
        }
      }

      step(0.1);
    }

    return {
      completed: currentActId === 'victory_dawn',
      currentActId,
      currentTod,
      stepsUsed: safetySteps,
      eventLog,
    };
  }

  return {
    heroes,
    poolSlots,
    actionAim,
    get currentActId() {
      return currentActId;
    },
    get currentTod() {
      return currentTod;
    },
    get waveIndex() {
      return waveIndex;
    },
    get actTriggered() {
      return actTriggered;
    },
    get heartResonance() {
      return heartResonance;
    },
    get activeEnemies() {
      return activeEnemies;
    },
    get spawnQueue() {
      return spawnQueue;
    },
    get visibleEnemyCount() {
      return poolSlots.filter((s) => s.busy && s.visible).length;
    },
    get tetherSurge() {
      return tetherSurge;
    },
    eventLog,
    addResonance,
    moveHeroesTo,
    startWave,
    advanceToAct,
    castSpell,
    mageInfuse,
    knightAttack,
    knightToggleElement,
    knightHoldShieldBlock,
    knightActivatePowerSword,
    knightCastSkyLightningUlt,
    mageTapAttack,
    mageHoldChargedAttack,
    mageToggleSpell,
    mageStartSkillAim,
    mageUpdateSkillAim,
    mageReleaseSkillAim,
    mageCastStormCataclysm,
    knightIntercept,
    castCouplesUltimate,
    applyDamageToHero,
    step,
    runFullCampaignAutoPlay,
  };
}

export const createCombatSimulationState = createHeadlessCampaignSim;
