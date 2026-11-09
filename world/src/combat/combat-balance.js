// ============================================================================
// world/src/combat/combat-balance.js
//
// Pure-JS, Zero-DOM/WebGL Combat Balance, Synergy Rules, Soft-Lock Cone Target
// Acquisition, 3-Attacker Token Allocator, Detonation Resolver, Knight & Mage
// Wave 2B Kits & Deterministic Headless 3-Act Campaign Simulator.
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
/* 1. Hero Stats & Sword Breathing Styles                                    */
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
    ultDuration: KNIGHT_ULT_DURATION, // 10.0s of 2.0x double damage
    ultDmgMult: KNIGHT_ULT_DMG_MULT, // 2.0x
    ultCd: KNIGHT_ULT_COOLDOWN, // 24.0s
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
    maxHp: 90, // Fragile Glass Cannon — dies in ~3 unprotected hits!
    speed: 7.2,
    sprintMult: 1.5,
    boltDmg: [18, 22, 30],
    boltRange: 14.5,
    shatterlanceDmg: 58,
    maxConsecutiveCharged: MAGE_MAX_CONSECUTIVE_CHARGED, // 3 consecutive charged limit
    skillCd: MAGE_E_COOLDOWN, // 8.5s cooldown on Hold/Release E spell
    stormCataclysmDuration: MAGE_STORM_CATACLYSM_DURATION, // 6.0s stationary vulnerable channel
    stormCataclysmCd: MAGE_STORM_CATACLYSM_COOLDOWN, // 24.0s
    stormCataclysmWaveDmg: 68,
    stormCataclysmRadius: 8.5,
    heavyNovaDmg: 42,
    heavyNovaRadius: 3.5,
    infuseHeal: 45,
    infuseDuration: 13.0,
    infuseCd: 8.5,
  },
};

// Production balance levers (2026-11-09 refinement pass). Locked spec values
// (E 13s/18s, Q 10s x2, shield 80% DR, Mage E 8.5s, 6s storm) are untouched;
// these bound the stacking and free-defence exploits around them.
export const KNIGHT_MAX_LEVEL = 5;
export const KNIGHT_LEVEL_DMG_STEP = 0.08;
export const ICE_DAMAGE_REDUCTION_CAP = 0.2;
// Cap on the passive stack (infusion x empowered x perfect-dodge, max 2.28 uncapped).
// Knight Q's locked x2 applies on top, and divine partner multipliers after that,
// so the God's help stays a decisive swing.
export const MORTAL_DMG_MULT_CAP = 1.7;
// Detonating a mark you primed yourself is weak: synergy should need both heroes.
export const SELF_DETONATION_MULT = 0.35;
export const KNIGHT_GUARD_MAX = 100;
export const KNIGHT_GUARD_HOLD_DRAIN = 7; // per second while held
export const KNIGHT_GUARD_HIT_COST = 0.6; // fraction of raw damage drained per blocked hit
export const KNIGHT_GUARD_REGEN = 30; // per second once lowered
export const KNIGHT_GUARD_REGEN_DELAY = 1.0;
export const KNIGHT_GUARD_BREAK_STUN = 1.2;
export const SHIELD_COVER_RADIUS = 6.0; // Mage must be this close to be covered
export const SHIELD_ARC_COS = 0.5; // +-60 deg frontal block/cover arc
export const DASH_COOLDOWN = 0.9;
export const DASH_IFRAMES = 0.22;
export const PERFECT_DODGE_ICD = 4.0;
// Live enemy HP escalation per act (archetype base values stay as authored).
export const ACT_HP_SCALE = { act1_arena: 1.0, act2_plaza: 1.2, act3_shrine: 1.35 };
export const BOSS_HP_SCALE = 1.6; // 1400 -> 2240 with Aegis phase at 50%

export function getKnightLevelStats(level = 1) {
  const cleanLevel = Math.min(KNIGHT_MAX_LEVEL, Math.max(1, Math.floor(Number(level) || 1)));
  return {
    level: cleanLevel,
    dmgMult: Number((1.0 + KNIGHT_LEVEL_DMG_STEP * (cleanLevel - 1)).toFixed(3)),
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
    dmg: 42,
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
    width: 2.2,
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
    dmg: 54,
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
    resonanceGain: 18,
  },
  solar_flare: {
    id: 'solar_flare',
    mark: 'solar',
    label: 'SOLAR FLARE!',
    bonusDmg: 70,
    radius: 4.5,
    launchVy: 7.5,
    knockback: 6.0,
    resonanceGain: 18,
  },
  thunderchain: {
    id: 'thunderchain',
    mark: 'tempest',
    label: 'THUNDERCHAIN!',
    bonusDmg: 60,
    radius: 7.5,
    pullStrength: 5.0,
    stun: 1.1,
    resonanceGain: 18,
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
/* 4. Pooled Enemy Archetypes & 3-Act Valley Expedition Definitions          */
/* ------------------------------------------------------------------------- */

export const MAX_POOL_SIZE = 10; // hidden slots cost no draw calls; visible stays capped
export const MAX_CONCURRENT_ENEMIES = 5;
export const MAX_ATTACK_TOKENS = 3;
export const ENEMY_WINDUP_SECONDS = 0.65;

export const ENEMY_ARCHETYPES = {
  minion: {
    id: 'minion',
    charId: 'Skeleton_Minion',
    poolRole: 'Skeleton_Minion',
    name: 'Skeleton Minion',
    maxHp: 95,
    dmg: 30,
    speed: 4.8,
    attackRange: 2.3,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.1,
    telegraphRadius: 1.65,
    scale: 1.0,
    attacks: ['minion_punch', 'minion_kick'],
    reassembles: true,
  },
  warrior: {
    id: 'warrior',
    charId: 'Skeleton_Warrior',
    poolRole: 'Skeleton_Warrior',
    name: 'Skeleton Warrior',
    maxHp: 140,
    dmg: 32,
    speed: 4.4,
    attackRange: 2.5,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.3,
    telegraphRadius: 1.85,
    scale: 1.0,
    attacks: ['warrior_chop', 'warrior_slice'],
    shieldWall: true,
  },
  rogue: {
    id: 'rogue',
    charId: 'Skeleton_Rogue',
    poolRole: 'Skeleton_Rogue',
    name: 'Skeleton Rogue',
    maxHp: 115,
    dmg: 30,
    speed: 5.4,
    attackRange: 2.2,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 1.85,
    telegraphRadius: 1.65,
    scale: 1.0,
    attacks: ['rogue_stab', 'rogue_jump_chop'],
    hunter: true,
  },
  mage: {
    id: 'mage',
    charId: 'Skeleton_Mage',
    poolRole: 'Skeleton_Mage',
    name: 'Skeleton Mage',
    maxHp: 110,
    dmg: 30,
    speed: 3.9,
    attackRange: 9.5,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.8,
    telegraphRadius: 2.2,
    scale: 1.0,
    isRanged: true,
    attacks: ['mage_bolt', 'mage_eruption'],
    summons: true,
  },
  captain: {
    id: 'captain',
    charId: 'Skeleton_Warrior',
    poolRole: 'Skeleton_Warrior',
    name: 'Twilight Elite Captain',
    maxHp: 320,
    dmg: 36,
    speed: 4.6,
    attackRange: 2.8,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.2,
    telegraphRadius: 2.4,
    scale: 1.18,
    isElite: true,
    poise: 70,
    attacks: ['captain_spin', 'captain_chop', 'warrior_slice'],
    rallies: true,
  },
  necromancer: {
    id: 'necromancer',
    charId: 'Necromancer',
    poolRole: 'Necromancer',
    name: 'Shrine Necromancer',
    maxHp: 240,
    dmg: 26,
    speed: 3.8,
    attackRange: 9.0,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 3.0,
    telegraphRadius: 2.0,
    scale: 1.0,
    isRanged: true,
    isElite: true,
    poise: 40,
    attacks: ['necro_bolt'],
    summons: true,
    wards: true,
  },
  royal_guard: {
    id: 'royal_guard',
    charId: 'Skeleton_Warrior',
    poolRole: 'Skeleton_Warrior',
    name: 'Shrine Royal Guard',
    maxHp: 210,
    dmg: 34,
    speed: 4.5,
    attackRange: 2.6,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.2,
    telegraphRadius: 2.0,
    scale: 1.08,
    attacks: ['warrior_chop', 'warrior_slice'],
    shieldWall: true,
  },
  boss_sovereign: {
    id: 'boss_sovereign',
    // Real Rig_Large Skeleton_Golem (GOLEM_TARGET_HEIGHT 2.8 m), not a scaled Warrior.
    charId: 'Skeleton_Golem',
    poolRole: 'Skeleton_Golem',
    name: 'The Hollow Sovereign',
    maxHp: 1400,
    dmg: 45,
    speed: 4.2,
    attackRange: 3.6,
    windupDuration: ENEMY_WINDUP_SECONDS,
    attackCooldown: 2.4,
    telegraphRadius: 3.3,
    scale: 1.0,
    isBoss: true,
    poise: 140,
    attacks: ['boss_2h', 'boss_combo', 'boss_slam'],
    aegisTriggerHpRatio: 0.5,
    aegisLayersMax: 2,
    aegisDmgReduction: 0.85,
  },
};

/* ------------------------------------------------------------------------- */
/* 4b. Encounter design (2026-11-09 spec): three-beat contact-frame attacks,  */
/*     parry, poise, crowd turn-taking, stride matching, boss phases.         */
/* ------------------------------------------------------------------------- */

// Clip time (s, at 1.0x) before the first contact where the slowed windup snaps back to full speed.
export const WINDUP_LEAD = 0.12;
export const PARRY_WINDOW = 0.15;
export const WINDUP_STAGGER_WINDOW = 0.4;
export const MAX_WINDUPS_PER_WINDOW = 2;
export const MINION_REASSEMBLE_SECONDS = 6.0;
export const BOSS_DOWN_WINDOW = 4.0;
export const BOSS_P3_HP_RATIO = 0.33;
export const BOSS_P3_SPEED = 1.25;
export const STAGGER_SECONDS = { trash: 0.55, elite: 1.1, boss: 1.4, parry: 1.2 };
export const POISE_REGEN_DELAY = 2.0;
export const POISE_REGEN_PER_SEC = 0.3; // fraction of max per second
export const SHIELD_BASH_AFTER_BLOCKS = 3;
export const ROGUE_DODGE_COOLDOWN = 4.0;
export const ROGUE_EXPOSED_DISTANCE = 6.0;
export const MAGE_SUMMON_COOLDOWN = 14.0;
export const NECRO_WARD_SECONDS = 3.0;
export const CAPTAIN_RALLY_SECONDS = 6.0;
export const CAPTAIN_RALLY_SPEED_MULT = 1.15;

/**
 * Per-attack data. `contacts` are clip fractions where damage resolves (multi-hit flurries list
 * several). `area` attacks hit everyone within `radius` of a point `areaOffset` m ahead (or the
 * locked target for `areaAtTarget`) and are the only attacks that get a ground decal.
 * `interruptible: 'any'` means even elites lose the cast to one hit.
 */
export const ENEMY_ATTACKS = {
  minion_punch: { clip: 'Melee_Unarmed_Attack_Punch_A', contacts: [0.38], windupSlow: 0.5, recovery: 0.35, range: 2.0, arcDeg: 80, dmg: 22, blockable: true, interruptible: true },
  minion_kick: { clip: 'Melee_Unarmed_Attack_Kick', contacts: [0.42], windupSlow: 0.55, recovery: 0.4, range: 2.2, arcDeg: 70, dmg: 26, blockable: true, interruptible: true },
  warrior_chop: { clip: 'Melee_1H_Attack_Chop', contacts: [0.45], windupSlow: 0.45, recovery: 0.45, range: 2.4, arcDeg: 70, dmg: 30, blockable: true, interruptible: true },
  warrior_slice: { clip: 'Melee_1H_Attack_Slice_Diagonal', contacts: [0.42], windupSlow: 0.5, recovery: 0.4, range: 2.5, arcDeg: 110, dmg: 28, blockable: true, interruptible: true },
  shield_bash: { clip: 'Melee_Block_Attack', contacts: [0.4], windupSlow: 0.85, recovery: 0.5, range: 2.3, arcDeg: 80, dmg: 24, blockable: true, interruptible: false, counter: true },
  rogue_stab: { clip: 'Melee_Dualwield_Attack_Stab', contacts: [0.3, 0.52, 0.74], windupSlow: 0.55, recovery: 0.45, range: 2.2, arcDeg: 70, dmg: 14, blockable: true, interruptible: true },
  rogue_jump_chop: { clip: 'Melee_1H_Attack_Jump_Chop', contacts: [0.55], windupSlow: 0.7, recovery: 0.55, range: 2.4, arcDeg: 80, dmg: 30, blockable: true, interruptible: false, lunge: 5.5, minDist: 3.6 },
  mage_bolt: { clip: 'Ranged_Magic_Shoot', contacts: [0.5], windupSlow: 0.55, recovery: 0.4, range: 10.5, ranged: true, aimRadius: 1.3, dmg: 24, blockable: true, interruptible: true },
  mage_eruption: { clip: 'Ranged_Magic_Spellcasting_Long', contacts: [0.78], windupSlow: 1.0, recovery: 0.5, range: 10.5, area: true, areaAtTarget: true, radius: 2.6, dmg: 38, blockable: true, interruptible: 'any', cooldown: 9.0 },
  necro_bolt: { clip: 'Ranged_Magic_Shoot', contacts: [0.5], windupSlow: 0.6, recovery: 0.4, range: 10.0, ranged: true, aimRadius: 1.3, dmg: 26, blockable: true, interruptible: true },
  captain_spin: { clip: 'Melee_2H_Attack_Spin', contacts: [0.36, 0.62], windupSlow: 0.55, recovery: 0.6, range: 2.9, area: true, areaOffset: 0, radius: 2.9, dmg: 26, blockable: true, interruptible: false, noDecal: true },
  captain_chop: { clip: 'Melee_2H_Attack_Chop', contacts: [0.5], windupSlow: 0.32, recovery: 0.8, range: 3.0, arcDeg: 60, dmg: 48, blockable: false, interruptible: false, glint: 'crimson' },
  boss_2h: { clip: 'Melee_2H_Attack', contacts: [0.45], windupSlow: 0.5, recovery: 0.6, range: 3.9, arcDeg: 110, dmg: 44, blockable: true, interruptible: false },
  boss_combo: { clip: 'Melee_Dualwield_SlashCombo', contacts: [0.28, 0.5, 0.72], windupSlow: 0.55, recovery: 0.7, range: 3.7, arcDeg: 120, dmg: 24, blockable: true, interruptible: false },
  boss_slam: { clip: 'Melee_2H_Slam', contacts: [0.45], windupSlow: 0.7, recovery: 1.0, range: 4.5, area: true, areaOffset: 2.2, radius: 3.4, dmg: 55, blockable: true, interruptible: false },
  boss_smash: { clip: 'Melee_Unarmed_Smash', contacts: [0.55], windupSlow: 0.8, recovery: 1.2, range: 4.5, area: true, areaOffset: 1.6, radius: 4.6, dmg: 62, blockable: false, interruptible: false },
};

/** Real-time beats of an attack: slowed windup, contact moments, clip end, recovery end. */
export function attackTimeline(atk, clipDuration, speedMult = 1.0) {
  const dur = clipDuration > 1e-3 ? clipDuration : 1.0;
  const sm = Math.max(0.05, speedMult);
  const slow = clamp(atk.windupSlow ?? 1.0, 0.05, 1.0);
  const firstContactClip = (atk.contacts?.[0] ?? 0.5) * dur;
  const slowEndClip = Math.max(0, firstContactClip - WINDUP_LEAD);
  const windupEnd = slowEndClip / (slow * sm);
  const contactTimes = (atk.contacts || [0.5]).map((c) => windupEnd + (c * dur - slowEndClip) / sm);
  const clipEnd = windupEnd + (dur - slowEndClip) / sm;
  return { dur, slowEndClip, windupEnd, contactTimes, clipEnd, recoverEnd: clipEnd + (atk.recovery ?? 0.4) };
}

/**
 * Advances the attack's clip clock by `dt` real seconds (exact across the slow/fast boundary).
 * Returns the new clip time, the action timeScale to apply and contact indices crossed this step.
 */
export function advanceAttackClip(atk, clipDuration, clipT, dt, speedMult = 1.0) {
  const dur = clipDuration > 1e-3 ? clipDuration : 1.0;
  const sm = Math.max(0.05, speedMult);
  const slow = clamp(atk.windupSlow ?? 1.0, 0.05, 1.0);
  const slowEndClip = Math.max(0, (atk.contacts?.[0] ?? 0.5) * dur - WINDUP_LEAD);
  const prev = clipT;
  let t = clipT;
  let remaining = Math.max(0, dt);
  if (t < slowEndClip) {
    const need = (slowEndClip - t) / (slow * sm);
    if (remaining <= need) {
      t += remaining * slow * sm;
      remaining = 0;
    } else {
      t = slowEndClip;
      remaining -= need;
    }
  }
  t += remaining * sm;
  const crossed = [];
  (atk.contacts || [0.5]).forEach((c, i) => {
    const ct = c * dur;
    if (prev < ct && t >= ct) crossed.push(i);
  });
  return {
    clipT: t,
    timeScale: (t < slowEndClip ? slow : 1.0) * sm,
    crossed,
    finished: t >= dur,
  };
}

/** Knight block raised within ±PARRY_WINDOW of an enemy contact frame. */
export function isParryTiming(blockStartAt, contactAt, window = PARRY_WINDOW) {
  if (!Number.isFinite(blockStartAt) || !Number.isFinite(contactAt)) return false;
  return Math.abs(contactAt - blockStartAt) <= window + 1e-9;
}

/** Hero position inside a melee attack's range and frontal arc (yaw: +Z forward convention). */
export function isInAttackArc(attacker, yaw, target, range, arcDeg = 90) {
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d < 0.6) return true;
  const diff = Math.abs(shortestAngleDiff(Math.atan2(dx, dz), yaw));
  return diff <= (arcDeg * Math.PI) / 360;
}

export function initPoise(e, poiseMax = 0) {
  e.poiseMax = poiseMax;
  e.poise = poiseMax;
  e.poiseRegenDelay = 0;
  return e;
}

/** Returns true when the hit breaks poise (and refills it for the next cycle). */
export function applyPoiseDamage(e, amount) {
  if (!e.poiseMax) return false;
  e.poise -= Math.max(0, amount);
  e.poiseRegenDelay = POISE_REGEN_DELAY;
  if (e.poise <= 0) {
    e.poise = e.poiseMax;
    return true;
  }
  return false;
}

export function tickPoise(e, dt) {
  if (!e.poiseMax) return;
  if (e.poiseRegenDelay > 0) {
    const used = Math.min(dt, e.poiseRegenDelay);
    e.poiseRegenDelay -= used;
    dt -= used;
    if (dt <= 0) return;
  }
  e.poise = Math.min(e.poiseMax, e.poise + e.poiseMax * POISE_REGEN_PER_SEC * dt);
}

const HEAVY_KNIGHT_SOURCES = new Set(['charged', 'heavy']);
const MAGE_PROJECTILE_SOURCES = new Set(['mage_attack1', 'mage_attack2', 'mage_attack3']);

export function isPoiseHeavyHit(hit = {}) {
  return HEAVY_KNIGHT_SOURCES.has(hit.source) || hit.source === 'combo4' || Boolean(hit.spellId);
}

/**
 * Pre-damage reaction: 'dodge' (Rogue sidesteps a Mage bolt), 'blocked' (shield front arc),
 * 'pierce' (Shatterlance through a shield), 'guardbreak' (Knight heavy vs shield), or 'hit'.
 */
export function resolvePreHit(e, hit = {}) {
  const fromMageBolt = MAGE_PROJECTILE_SOURCES.has(hit.source) || hit.spellId === 'frost_lance';
  if (
    e.hunter &&
    fromMageBolt &&
    (e.dodgeCooldown || 0) <= 0 &&
    e.aiState !== 'windup' &&
    e.aiState !== 'recover' &&
    e.aiState !== 'stagger'
  ) {
    return 'dodge';
  }
  if (e.shieldUp && hit.attackerPos) {
    const inFront = isInAttackArc(e, e.yaw || 0, hit.attackerPos, 999, 140);
    if (inFront) {
      if (hit.spellId === 'shatterlance' || hit.source === 'shatterlance') return 'pierce';
      if (HEAVY_KNIGHT_SOURCES.has(hit.source)) return 'guardbreak';
      if (!hit.detonation) return 'blocked';
    }
  }
  return 'hit';
}

/**
 * Post-damage reaction. Trash: 'interrupt' if a light hit lands before an interruptible contact,
 * else 'flinch'. Elites/boss: 'stagger' only when poise breaks; casts flagged
 * interruptible:'any' break on one hit.
 */
export function resolvePostHit(e, hit = {}, damageDealt = 0) {
  if (damageDealt <= 0) return 'none';
  const atk = e.attack?.atk;
  const preContact = e.aiState === 'windup' && e.attack && e.attack.contactIdx === 0;
  if (preContact && atk?.interruptible === 'any') return 'interrupt';
  if (e.isElite || e.isBoss) {
    const poiseDmg = damageDealt * (isPoiseHeavyHit(hit) ? 1.8 : 1.0);
    return applyPoiseDamage(e, poiseDmg) ? 'stagger' : 'none';
  }
  if (preContact) return atk?.interruptible ? 'interrupt' : 'none';
  if (e.aiState === 'recover' || e.aiState === 'windup') return 'none';
  return 'flinch';
}

/** Crowd limiter: no more than MAX_WINDUPS_PER_WINDOW windups on one hero within the window. */
export function canStartWindup(log, heroId, now, window = WINDUP_STAGGER_WINDOW) {
  let n = 0;
  for (let i = 0; i < log.length; i++) {
    if (log[i].heroId === heroId && now - log[i].t < window) n++;
  }
  return n < MAX_WINDUPS_PER_WINDOW;
}

export function recordWindup(log, heroId, now, window = WINDUP_STAGGER_WINDOW) {
  for (let i = log.length - 1; i >= 0; i--) {
    if (now - log[i].t >= window) log.splice(i, 1);
  }
  log.push({ heroId, t: now });
  return log;
}

// Native ground speed (m/s at timeScale 1.0) of each locomotion clip for the rig's own height.
export const NATIVE_STRIDE_SPEED = {
  medium: {
    Walking_A: 1.5,
    Walking_B: 1.5,
    Walking_C: 1.5,
    Skeletons_Walking: 1.2,
    Running_A: 4.2,
    Running_B: 4.2,
    Running_Strafe_Left: 3.6,
    Running_Strafe_Right: 3.6,
    Walking_Backwards: 1.3,
  },
  large: { Walking_A: 2.0, Running_A: 4.6 },
};

/** timeScale that makes the clip's feet match `groundSpeed` (scale = extra group scale). */
export function strideTimeScale(clipName, groundSpeed, { rig = 'medium', scale = 1.0 } = {}) {
  const native = NATIVE_STRIDE_SPEED[rig]?.[clipName];
  if (!native) return 1.0;
  return clamp(groundSpeed / (native * Math.max(0.2, scale)), 0.35, 2.2);
}

export function bossPhaseFor(hpRatio, aegisTriggered = false) {
  if (hpRatio <= BOSS_P3_HP_RATIO) return 'p3';
  if (aegisTriggered || hpRatio <= 0.5) return 'p2';
  return 'p1';
}

export const BOSS_ATTACK_SETS = {
  p1: ['boss_2h', 'boss_combo', 'boss_slam'],
  p2: ['boss_2h', 'boss_combo', 'boss_slam'],
  p3: ['boss_combo', 'boss_2h', 'boss_smash', 'boss_slam'],
};

/** Deterministic pick from the phase set (roll in [0,1)); never repeats the previous attack. */
export function selectBossAttack(phase, roll = 0, lastId = null) {
  const set = BOSS_ATTACK_SETS[phase] || BOSS_ATTACK_SETS.p1;
  let idx = Math.floor(clamp(roll, 0, 0.9999) * set.length);
  if (set[idx] === lastId) idx = (idx + 1) % set.length;
  return set[idx];
}

/** Bone pile tick: returns 'reassemble' once the timer expires unless frozen or destroyed. */
export function tickBonePile(pile, dt) {
  if (pile.pileFrozen || pile.pileDestroyed) return 'held';
  pile.pileTimer = Math.max(0, (pile.pileTimer ?? MINION_REASSEMBLE_SECONDS) - dt);
  return pile.pileTimer <= 0 ? 'reassemble' : 'pile';
}

/** A bone pile is finished only by a detonation or a Mage spell/attack. */
export function isPileFinisher(hit = {}, result = null) {
  if (result?.detonation) return true;
  if (hit.spellId) return true;
  const s = hit.source || '';
  return s.startsWith('mage_') || s === 'storm_cataclysm' || s === 'couples_ultimate' || s === 'cinder_fall' || s === 'shatterlance';
}

/** Rogue hunter: the Mage when she strays > ROGUE_EXPOSED_DISTANCE from the Knight, else nearest. */
export function selectHuntTarget(e, knight, mage) {
  const kOk = knight && !knight.downed;
  const mOk = mage && !mage.downed;
  if (kOk && mOk) {
    if (Math.hypot(knight.x - mage.x, knight.z - mage.z) > ROGUE_EXPOSED_DISTANCE) return mage;
    const dk = Math.hypot(e.x - knight.x, e.z - knight.z);
    const dm = Math.hypot(e.x - mage.x, e.z - mage.z);
    return dm < dk ? mage : knight;
  }
  return kOk ? knight : mOk ? mage : knight || mage || null;
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
        // Reassembling minions teach "finish the bone pile with a detonation or spell".
        label: 'Wave 1 · Restless Bones',
        spawns: [
          { archetype: 'minion', x: 75.5, z: -7.5 },
          { archetype: 'minion', x: 75.5, z: -0.5 },
          { archetype: 'minion', x: 77.5, z: -4.0 },
          { archetype: 'minion', x: 73.5, z: -10.5 },
        ],
      },
      {
        id: 'wave2',
        label: 'Wave 2 · Shield Wall',
        spawns: [
          { archetype: 'warrior', x: 78.5, z: -5.8 },
          { archetype: 'warrior', x: 78.5, z: -2.2 },
          { archetype: 'minion', x: 75.2, z: -6.8 },
          { archetype: 'minion', x: 75.2, z: -1.2 },
          { archetype: 'minion', x: 71.5, z: -11.8 },
          { archetype: 'minion', x: 71.5, z: 3.8 },
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
        label: 'Wave 3 · Dusk Hunters',
        spawns: [
          // Skeleton Mage holds the well steps; Rogues hunt whichever hero strays.
          { archetype: 'mage', x: 0.0, z: -3.1 },
          { archetype: 'rogue', x: -8.2, z: -7.4 },
          { archetype: 'rogue', x: 8.2, z: -7.4 },
          { archetype: 'warrior', x: -10.6, z: 1.8 },
          { archetype: 'minion', x: 10.6, z: 1.8 },
          { archetype: 'minion', x: 0.0, z: -11.8 },
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
        label: 'Wave 4 · The Sleeping Court',
        spawns: [
          // Dormant ambush: Skeletons_Inactive_* poses until a hero comes within wakeRadius.
          { archetype: 'minion', x: -4.5, z: -80.5, dormant: 'floor', rotY: 2.6 },
          { archetype: 'minion', x: 4.0, z: -81.0, dormant: 'floor', rotY: -2.4 },
          { archetype: 'warrior', x: -6.6, z: -84.0, dormant: 'standing', rotY: 1.9 },
          { archetype: 'warrior', x: 6.6, z: -84.6, dormant: 'standing', rotY: -1.9 },
          { archetype: 'rogue', x: 0.0, z: -83.0, dormant: 'floor', rotY: Math.PI },
        ],
      },
      {
        id: 'wave5',
        label: 'Wave 5 · Captain & Necromancer',
        spawns: [
          { archetype: 'captain', x: 0.0, z: -90.5 },
          { archetype: 'necromancer', x: 3.6, z: -93.0 },
          { archetype: 'minion', x: -4.0, z: -88.0 },
          { archetype: 'minion', x: 4.0, z: -87.5 },
        ],
      },
      {
        id: 'wave6',
        label: 'Wave 6 · The Hollow Sovereign',
        spawns: [{ archetype: 'boss_sovereign', x: 0.0, z: -88.8 }],
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
/* 5. Pure Helper Functions                                                  */
/* ------------------------------------------------------------------------- */

// Soft-lock targets must be fully present: not dead, dying (death clip) or still rising (spawn clip).
export function isSoftLockable(e) {
  if (!e || e.dead || e.hp <= 0 || e.active === false) return false;
  if ((e.deathTimer || 0) > 0 || e.dying) return false;
  if ((e.spawnAnimTimer || 0) > 0 || e.spawning) return false;
  return true;
}

export const SOFT_LOCK_STICKY_RANGE_MULT = 1.15;
export const SOFT_LOCK_STICKY_CONE_MULT = 1.4;
export const SOFT_LOCK_SWITCH_MARGIN = 0.3;

/**
 * Cone soft-lock (75° cone by default) scored by closeness to the aim ray,
 * distance, and threat. Options:
 * - `stickyTarget` (or `origin.softLockTarget`): the current lock is kept while it
 *   stays valid inside a widened range/cone unless a challenger out-scores it by
 *   `switchMargin` (hysteresis — no per-frame target flipping).
 * - `selfId` ('Mage'/'Knight'): bias toward enemies targeting / winding up on us.
 * - `partnerTarget`: bias toward the partner's current target (focus fire).
 * Falls back to the nearest threat to self/partner outside the cone.
 */
export function selectSoftLockTarget(
  origin,
  forwardYaw,
  enemies,
  {
    maxRange = 20.0,
    coneHalfAngle = (75 * Math.PI) / 360,
    partnerPos = null,
    partnerThreatRadius = 8.0,
    stickyTarget = undefined,
    switchMargin = SOFT_LOCK_SWITCH_MARGIN,
    selfId = null,
    partnerTarget = null,
  } = {}
) {
  if (!origin || !Array.isArray(enemies) || enemies.length === 0) return null;

  const sticky = stickyTarget === undefined ? origin.softLockTarget || null : stickyTarget;
  const selfRole = selfId || origin.id || null;

  let bestInCone = null;
  let bestInConeScore = -Infinity;
  let stickyScore = -Infinity;

  let bestThreatFallback = null;
  let bestThreatScore = -Infinity;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!isSoftLockable(e)) continue;

    const ex = e.x ?? e.group?.position?.x ?? 0;
    const ez = e.z ?? e.group?.position?.z ?? 0;
    const dx = ex - origin.x;
    const dz = ez - origin.z;
    const dist = Math.hypot(dx, dz);
    const isSticky = sticky !== null && (e === sticky || (e.id !== undefined && e.id === sticky.id));
    const rangeLimit = isSticky ? maxRange * SOFT_LOCK_STICKY_RANGE_MULT : maxRange;
    const coneLimit = isSticky ? coneHalfAngle * SOFT_LOCK_STICKY_CONE_MULT : coneHalfAngle;

    if (dist <= rangeLimit) {
      const angleToEnemy = Math.atan2(dx, dz);
      const absAngleDiff = Math.abs(shortestAngleDiff(angleToEnemy, forwardYaw));
      if (absAngleDiff <= coneLimit + 1e-4) {
        const distScore = Math.max(0, 1.0 - dist / maxRange);
        const angleScore = Math.max(0, 1.0 - absAngleDiff / Math.max(1e-4, coneHalfAngle));
        // Perpendicular offset from the aim ray: "the one I'm pointing at" wins close calls.
        const rayOffset = dist * Math.sin(Math.min(absAngleDiff, Math.PI / 2));
        const rayScore = Math.max(0, 1.0 - rayOffset / 4.0);
        const markBonus = e.mark ? 0.35 : 0.0;
        const bossBonus = e.isBoss ? 0.25 : e.isElite ? 0.12 : 0.0;
        const windupBonus = e.aiState === 'windup' ? 0.2 : 0.0;
        const onSelf = selfRole && e.targetHeroId === selfRole;
        const threatBonus = onSelf ? (e.aiState === 'windup' || e.hasAttackToken ? 0.25 : 0.08) : 0.0;
        const focusBonus =
          partnerTarget && (e === partnerTarget || (e.id !== undefined && e.id === partnerTarget.id))
            ? 0.15
            : 0.0;
        const score =
          distScore * 0.46 +
          angleScore * 0.34 +
          rayScore * 0.2 +
          markBonus +
          bossBonus +
          windupBonus +
          threatBonus +
          focusBonus;
        if (isSticky) stickyScore = score;
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

  // Hysteresis: keep the current lock unless the challenger is clearly better.
  if (stickyScore > -Infinity && bestInCone !== sticky && bestInConeScore < stickyScore + switchMargin) {
    const stickyEnemy = enemies.find(
      (e) => e === sticky || (sticky && e && e.id !== undefined && e.id === sticky.id)
    );
    if (stickyEnemy) return stickyEnemy;
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
    // Dormant ambushers, bone piles, staggered and downed enemies never hold a token.
    if (!isAlive || isStunned || e.tokenIneligible) {
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

  const holders = [];
  for (let i = 0; i < eligible.length; i++) {
    const e = eligible[i];
    if (i < maxTokens) {
      e.hasAttackToken = true;
      holders.push(e);
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

// Divine Verdict ("Court of Bloody Dark Flowers & The Eclipse") Locked Constants
export const COMMUNE_MAX_DISTANCE = 4.0;
export const COMMUNE_RESURRECT_DISTANCE = 4.0;
export const COMMUNE_COMBAT_HP_THRESHOLD = 0.35;
export const POWERUP_TETHER_DISTANCE = 5.0;
export const DIVINE_BLESSING_DURATION = 30.0;
export const DIVINE_BLESSING_TETHER_DISTANCE = 5.0;
export const DIVINE_BLESSING_DMG_MULT = 2.0;
export const DIVINE_BLESSING_Q_CD_MULT = 1 / 3;
export const DIVINE_BLESSING_E_CD_MULT = 0.5;
export const ALTAR_STELE_POS = { x: 2.6, z: 7.2, y: 0.0, triggerRadius: 5.0 };

/**
 * Applies a hit (`hitSpec`) to `enemy`, resolves Sword Breathing multipliers,
 * Knight Level scaling, Ice Sword slow (movement, attack speed & damage) and
 * Fire Sword persistent burn DoT, Knight Q 2.0x Sky-Lightning double damage,
 * Boss Bone Aegis mitigation/layer-breaking, and Physical Detonations.
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
      ? effectiveInfusion === 'eclipse'
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

  const mortalMult =
    Math.min(MORTAL_DMG_MULT_CAP, infusedMult * empoweredMult * dodgeMult) * ultMult;
  let rawDirectDmg = Math.round((baseDmg * levelMult + fireBonus) * mortalMult * communeMult);
  const attackerHero = hitSpec.heroId || (isSwordHit ? 'Knight' : 'Mage');

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
    (activeMark === 'eclipse' ||
      (effectiveInfusion === 'eclipse' &&
        (activeMark === 'rime' || activeMark === 'solar' || isSwordHit)));

  const selfDetonation = Boolean(
    activeMark && enemy.markOwner && enemy.markOwner === attackerHero
  );
  if (activeMark && canDetonate && MARK_TO_DETONATION[activeMark]) {
    detonationSpec = MARK_TO_DETONATION[activeMark];
    enemy.mark = null;
    enemy.markTimer = 0;
  } else if (isEclipseDetonation) {
    detonationSpec = DETONATIONS.solar_flare;
    enemy.mark = null;
    enemy.markTimer = 0;
  }

  let aegisBroken = false;

  if (enemy.isBoss && enemy.aegisActive && enemy.aegisLayers > 0) {
    if (source === 'couples_ultimate' || source === 'divine_miracle') {
      enemy.aegisLayers = 0;
      enemy.aegisActive = false;
      aegisBroken = true;
      enemy.stunTimer = Math.max(enemy.stunTimer || 0, COUPLES_ULTIMATE.stun);
    } else if (
      detonationSpec ||
      source === 'divine_blessing' ||
      source === 'knight_sky_lightning' ||
      source === 'storm_cataclysm'
    ) {
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

  const attackerX = hitSpec.attackerPos?.x ?? (enemy.x || 0);
  const attackerZ = hitSpec.attackerPos?.z ?? (enemy.z || 0) + 1.0;

  if (detonationSpec) {
    resonanceGain += detonationSpec.resonanceGain;
    const bonusBase = isEclipseDetonation
      ? Math.round((DETONATIONS.solar_flare.bonusDmg + DETONATIONS.shatterblow.bonusDmg) * 0.75)
      : detonationSpec.bonusDmg;
    const bonusDmg = Math.round(
      bonusBase * empoweredMult * ultMult * (selfDetonation ? SELF_DETONATION_MULT : 1.0)
    );
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
      enemy.markOwner = attackerHero;
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

  let aegisRaised = false;
  if (
    enemy.isBoss &&
    !enemy.aegisTriggered &&
    enemy.hp > 0 &&
    enemy.hp <= enemy.maxHp * (enemy.aegisTriggerHpRatio ?? 0.5)
  ) {
    enemy.aegisTriggered = true;
    if (source === 'couples_ultimate') {
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
/* 6. Headless Deterministic 3-Act Campaign Simulator                        */
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
      selectedElement: 'ice', // 'ice' | 'fire'
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
      selectedElement: 'ice',
      selectedSpell: 'frost_lance', // 'frost_lance' | 'cinder_fall'
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
    while (
      heroes.Knight.xp >= HERO_STATS.Knight.xpPerLevel &&
      heroes.Knight.level < KNIGHT_MAX_LEVEL
    ) {
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
      name: arch.name,
      slotIndex: slot.slotIndex,
      hp: arch.maxHp,
      maxHp: arch.maxHp,
      dmg: arch.dmg,
      speed: arch.speed,
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

    igniteKnightBreathing(spell.infusion, HERO_STATS.Knight.powerSwordDuration);
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
    heroes.Knight.powerSwordActive = true;
    heroes.Knight.powerSwordTimer = KNIGHT_POWER_SWORD_DURATION; // 13.0s active
    heroes.Knight.powerSwordCd = KNIGHT_POWER_SWORD_COOLDOWN; // 18.0s total cd (5.0s downtime)
    igniteKnightBreathing(styleId, KNIGHT_POWER_SWORD_DURATION);
    return {
      activated: true,
      element: elem,
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
    heroes.Knight.ultTimer = KNIGHT_ULT_DURATION; // 10.0s
    heroes.Knight.ultDmgMult = KNIGHT_ULT_DMG_MULT; // 2.0x
    heroes.Knight.ultCd = KNIGHT_ULT_COOLDOWN; // 24.0s
    const styleId = heroes.Knight.selectedElement === 'fire' ? 'solar' : 'rime';
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
      element: heroes.Knight.selectedElement,
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
    // Clear any finished/pending swing in headless immediate calls so consecutive presses test cleanly
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
    heroes.Mage.stormCataclysmTimer = MAGE_STORM_CATACLYSM_DURATION; // 6.0s stationary vulnerable
    heroes.Mage.stormCataclysmWaveTimer = 0;
    heroes.Mage.ultCd = MAGE_STORM_CATACLYSM_COOLDOWN; // 24.0s

    // Immediate opening Storm Cataclysm wave across active enemies
    const waveHits = [];
    for (const e of [...activeEnemies]) {
      if (!e || e.dead || e.hp <= 0) continue;
      waveHits.push(
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
        )
      );
    }
    checkWaveAndActCompletion();
    return {
      activated: true,
      stationary: true,
      vulnerableOneHitDown: true,
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

    const slowReduction = clamp(
      Number(attackerEnemy?.iceSlowFactor) || 0,
      0,
      ICE_DAMAGE_REDUCTION_CAP
    );
    let effectiveAmount = Math.max(1, Math.round(amount * (1.0 - slowReduction)));

    // Shielding Knight intercepts hits on the Mage; DR is applied once, on the Knight's path.
    if (heroId === 'Mage' && heroes.Knight.shieldBlocking && !heroes.Knight.downed) {
      const knightRes = applyDamageToHero('Knight', effectiveAmount, null);
      return {
        absorbed: effectiveAmount - (knightRes.hpLost || 0),
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

    // Mage Q 6.0s Storm Cataclysm vulnerability: 1 unprotected hit immediately downs her!
    if (heroId === 'Mage' && heroes.Mage.stormCataclysmActive && rem > 0) {
      h.hp = 0;
      h.downed = true;
      h.reviveProgress = 0;
      heroes.Mage.stormCataclysmActive = false;
      heroes.Mage.stormCataclysmTimer = 0;
      return {
        absorbed,
        hpLost: effectiveAmount - absorbed,
        downed: true,
        cataclysmInterrupted: true,
        interceptedByKnight: false,
      };
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

    // 1. Update Hero timers & Partner Revive (2.0s within 3.5m)
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

    // 2. Update Active Enemies (including Fire Sword Burn DoT & Ice Sword Slow)
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
