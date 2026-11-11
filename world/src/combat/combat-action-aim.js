// ============================================================================
// world/src/combat/combat-action-aim.js
//
// Wave 2B Combat Feel, 1-Input Swing Buffer, Mash Speed Ramp (1.0x -> 1.30x),
// Contact-Frame Hit Detection, Knight Shield Block & Ice/Fire Toggle, and
// Mage 3-Charged Shatterlance Limiter + Hold-E / Release-E Spellbook Aim State.
//
// Zero-DOM/WebGL pure state controller shared by `player-controller.js`,
// `combat-balance.js`, and headless `test-combat-sim.mjs`.
// ============================================================================

import {
  clamp,
  projectAimRayToGround,
  FROST_LANCE_AIM_LENGTH,
  CINDER_FALL_MIN_DISTANCE,
  CINDER_FALL_MAX_DISTANCE,
  SHATTERLANCE_MIN_DISTANCE,
  SHATTERLANCE_MAX_DISTANCE,
} from '../terrain-scalar.js';

export const MASH_TIMESCALE_MIN = 1.0;
export const MASH_TIMESCALE_MAX = 1.3;
export const MASH_TIMESCALE_STEP = 0.1;
export const MASH_TIMESCALE_DECAY_PER_SEC = 0.45;

export const KNIGHT_SHIELD_BLOCK_DR = 0.8; // 80% incoming damage reduction
export const KNIGHT_POWER_SWORD_DURATION = 13.0; // 13s active duration
export const KNIGHT_POWER_SWORD_COOLDOWN = 18.0; // 18s total cooldown from activation (5s downtime)
export const KNIGHT_ULT_DURATION = 12.0; // 12s of 2x double damage (Twin-Element Blade)
export const KNIGHT_ULT_DMG_MULT = 2.0;
export const KNIGHT_ULT_COOLDOWN = 24.0;

export const MAGE_MAX_CONSECUTIVE_CHARGED = 999;
export const MAGE_E_COOLDOWN = 8.5; // 8.5s cooldown on Frost Lance / Cinder Fall E skill
export const MAGE_STORM_CATACLYSM_DURATION = 6.0; // 6.0s vulnerable stationary channel
export const MAGE_STORM_CATACLYSM_COOLDOWN = 24.0;

/**
 * Full-duration native skeletal sword combo specs for Knight.
 * Every swing plays from `startTime: 0` with `hopVy: 0` (zero mid-air jitter,
 * zero clipped windups) and triggers hit detection at `contactFrac` (0.40..0.46).
 */
export const KNIGHT_COMBO_SPECS = [
  {
    index: 0,
    clip: 'combo1',
    nativeClip: 'Melee_1H_Attack_Slice_Horizontal',
    startTime: 0,
    animStartTime: 0,
    animTimeScale: 1.38,
    visualDuration: 0.78,
    baseTimeScale: 1.0,
    timeScale: 1.0,
    duration: 0.52,
    contactFrac: 0.4,
    stepDist: 0.24,
    hopVy: 0,
    cameraImpulse: 0,
  },
  {
    index: 1,
    clip: 'combo2',
    nativeClip: 'Melee_1H_Attack_Slice_Diagonal',
    startTime: 0,
    animStartTime: 0,
    animTimeScale: 1.35,
    visualDuration: 0.74,
    baseTimeScale: 1.0,
    timeScale: 1.0,
    duration: 0.52,
    contactFrac: 0.42,
    stepDist: 0.26,
    hopVy: 0,
    cameraImpulse: 0,
  },
  {
    index: 2,
    clip: 'combo3',
    nativeClip: 'Melee_1H_Attack_Chop',
    startTime: 0,
    animStartTime: 0,
    animTimeScale: 1.38,
    visualDuration: 0.78,
    baseTimeScale: 1.0,
    timeScale: 1.0,
    duration: 0.54,
    contactFrac: 0.44,
    stepDist: 0.3,
    hopVy: 0,
    cameraImpulse: 0,
  },
  {
    index: 3,
    clip: 'combo4',
    nativeClip: 'Melee_1H_Attack_Jump_Chop',
    startTime: 0,
    animStartTime: 0,
    animTimeScale: 1.38,
    visualDuration: 0.82,
    baseTimeScale: 1.0,
    timeScale: 1.0,
    duration: 0.58,
    contactFrac: 0.46,
    stepDist: 0.38,
    hopVy: 0,
    cameraImpulse: 0,
  },
];

/**
 * Full-duration native skeletal bolt combo specs for Mage.
 * Plays from `startTime: 0` with `hopVy: 0` and triggers bolt release at `contactFrac`.
 * `nativeClip` is the KayKit 1.1 clip (semantic `clip` is the fallback); release
 * frames were measured from the right-hand socket's forward extension peak:
 * Ranged_Magic_Shoot thrust peaks at 0.27–0.30 s, Ranged_1H_Shoot at 0.21–0.23 s.
 * Bolt 1 releases at 0.30 s so the 0.26/0.28 s hold timers can still upgrade it
 * into Shatterlance before a bolt leaves the staff.
 */
export const MAGE_COMBO_SPECS = [
  {
    index: 0,
    clip: 'mage_attack1',
    nativeClip: 'Ranged_Magic_Shoot',
    startTime: 0,
    baseTimeScale: 1.0,
    timeScale: 1.0,
    duration: 0.68,
    contactFrac: 0.44,
    releaseTime: 0.3,
    fade: 0.08,
    stepDist: 0,
    hopVy: 0,
    cameraImpulse: 0,
  },
  {
    index: 1,
    clip: 'mage_attack2',
    nativeClip: 'Ranged_1H_Shoot',
    startTime: 0,
    baseTimeScale: 1.0,
    timeScale: 1.0,
    duration: 0.52,
    contactFrac: 0.42,
    releaseTime: 0.22,
    fade: 0.06,
    stepDist: 0,
    hopVy: 0,
    cameraImpulse: 0,
  },
  {
    index: 2,
    clip: 'mage_attack3',
    nativeClip: 'Ranged_Magic_Shoot',
    startTime: 0,
    baseTimeScale: 1.0,
    timeScale: 1.0,
    duration: 0.7,
    contactFrac: 0.4,
    releaseTime: 0.28,
    fade: 0.06,
    stepDist: 0,
    hopVy: 0,
    cameraImpulse: 0,
  },
];

/**
 * Stationary charged Shatterlance spec for Mage (`Hold Attack`).
 * Two native clips in sequence from `startTime: 0`: the staff-circling
 * `windupClip` gathers, then `nativeClip` (Ranged_1H_Shoot) is started
 * `nativeReleaseOffset` before contact so its thrust peak lands on the release
 * frame and its held-out pose carries the recovery.
 * After 3 consecutive charged attacks, holding attack automatically falls back
 * to a normal bolt attack.
 */
export const MAGE_CHARGED_SHATTERLANCE_SPEC = {
  clip: 'cast_spell',
  windupClip: 'Ranged_Magic_Spellcasting',
  nativeClip: 'Ranged_1H_Shoot',
  fallbackClip: 'cast_shoot',
  nativeReleaseOffset: 0.22,
  spellId: 'shatterlance',
  startTime: 0,
  baseTimeScale: 1.0,
  timeScale: 1.0,
  duration: 0.98,
  contactFrac: 0.46,
  stepDist: 0,
  hopVy: 0,
  stationary: true,
  maxConsecutive: MAGE_MAX_CONSECUTIVE_CHARGED,
  cameraImpulse: 0,
};

/**
 * Mage E cast clips. The spell spawns at `releaseTime` (real seconds after
 * release-E); `lock` is when the clip hands back to locomotion. Dash or movement
 * may cancel anything after `releaseTime`, never before it.
 */
export const MAGE_E_CAST_SPECS = {
  frost_lance: {
    nativeClip: 'Ranged_1H_Shoot',
    fallbackClip: 'cast_shoot',
    timeScale: 1.0,
    releaseTime: 0.22,
    lock: 0.78,
    fade: 0.1,
  },
  shatterlance: {
    nativeClip: 'Ranged_1H_Shoot',
    fallbackClip: 'cast_spell',
    timeScale: 1.0,
    releaseTime: 0.22,
    lock: 0.78,
    fade: 0.1,
  },
  cinder_fall: {
    // Staff apex of Ranged_Magic_Raise is 0.60 s at 1x; 1.25x keeps the meteor call snappy.
    nativeClip: 'Ranged_Magic_Raise',
    fallbackClip: 'pray_channel',
    timeScale: 1.25,
    releaseTime: 0.48,
    lock: 1.14,
    fade: 0.1,
  },
};

/** Held while E is aimed: raises the staff by 0.37 s and clamps on the aimed pose. */
export const MAGE_AIM_HOLD_SPEC = {
  nativeClip: 'Ranged_1H_Aiming',
  fallbackClip: 'cast_spell',
  fade: 0.12,
  moveSpeedMult: 0.42,
  // Aim-walk is a commitment: strafing stays quick, back-pedalling is slow (dodge to disengage).
  directionalSpeed: { forward: 1.0, side: 0.85, backward: 0.5 },
  locomotion: {
    // HoldingRifle keeps the staff raised like the aim pose; Running_A would swing it low.
    forward: ['Running_HoldingRifle', 'run'],
    backward: ['Walking_Backwards', 'walk'],
    left: ['Running_Strafe_Left', 'run'],
    right: ['Running_Strafe_Right', 'run'],
  },
};

/** Aim-walk speed factor for a move direction `rel` radians off the facing (0 = forward). */
export function mageAimDirectionalSpeed(rel) {
  const d = MAGE_AIM_HOLD_SPEC.directionalSpeed;
  const c = Math.cos(rel);
  return c >= 0 ? d.side + (d.forward - d.side) * c : d.side + (d.backward - d.side) * -c;
}

/** Aim assist for E: magnet radii with hysteresis so the reticle never flickers. */
export const MAGE_AIM_ASSIST = {
  cinderSnapRadius: 2.4,
  cinderReleaseRadius: 3.4,
  lanceSnapAngle: (10 * Math.PI) / 180,
  lanceReleaseAngle: (15 * Math.PI) / 180,
  touchDeadzonePx: 22,
  touchRangePx: 160,
  cinderDefaultDistance: 9.0,
  cinderMin: CINDER_FALL_MIN_DISTANCE,
  cinderMax: CINDER_FALL_MAX_DISTANCE,
};

/**
 * Magnetises the E aim onto an enemy. Cinder Fall snaps the reticle when an enemy
 * is within `cinderSnapRadius` of the free reticle point; Frost Lance snaps yaw when
 * an enemy sits within `lanceSnapAngle` of the aim line. `current` keeps its lock
 * until it leaves the wider release radius/angle. `manual` disables the magnet.
 * Returns `{ yaw, distance, target, locked }` with distance clamped to the spell.
 */
export function resolveSkillAimAssist({
  origin,
  spellId = 'frost_lance',
  yaw = 0,
  distance = MAGE_AIM_ASSIST.cinderDefaultDistance,
  enemies = [],
  current = null,
  manual = false,
  isTargetable = null,
} = {}) {
  const ox = Number(origin?.x) || 0;
  const oz = Number(origin?.z) || 0;
  const isLance = spellId !== 'cinder_fall';
  const minD = isLance ? 0.5 : CINDER_FALL_MIN_DISTANCE;
  const maxD = isLance ? FROST_LANCE_AIM_LENGTH : CINDER_FALL_MAX_DISTANCE;
  const freeDist = isLance ? FROST_LANCE_AIM_LENGTH : clamp(distance, minD, maxD);
  const free = { yaw, distance: freeDist, target: null, locked: false };
  if (manual || !Array.isArray(enemies) || enemies.length === 0) return free;

  const alive = (e) =>
    e && (typeof isTargetable === 'function' ? isTargetable(e) : !e.dead && e.hp > 0 && e.active !== false);
  const fx = ox + Math.sin(yaw) * freeDist;
  const fz = oz + Math.cos(yaw) * freeDist;

  let best = null;
  let bestMetric = Infinity;
  for (const e of enemies) {
    if (!alive(e)) continue;
    const ex = e.x ?? e.group?.position?.x ?? 0;
    const ez = e.z ?? e.group?.position?.z ?? 0;
    const d = Math.hypot(ex - ox, ez - oz);
    if (d < 0.6 || d > maxD + 0.75) continue;
    const isCurrent = current && (e === current || (e.id !== undefined && e.id === current.id));
    let metric;
    if (isLance) {
      const ang = Math.abs(wrapAngle(Math.atan2(ex - ox, ez - oz) - yaw));
      const limit = isCurrent ? MAGE_AIM_ASSIST.lanceReleaseAngle : MAGE_AIM_ASSIST.lanceSnapAngle;
      if (ang > limit) continue;
      metric = ang - (isCurrent ? 0.05 : 0);
    } else {
      const off = Math.hypot(ex - fx, ez - fz);
      const limit = isCurrent ? MAGE_AIM_ASSIST.cinderReleaseRadius : MAGE_AIM_ASSIST.cinderSnapRadius;
      if (off > limit) continue;
      metric = off - (isCurrent ? 0.6 : 0);
    }
    if (metric < bestMetric) {
      bestMetric = metric;
      best = { e, ex, ez, d };
    }
  }
  if (!best) return free;
  return {
    yaw: Math.atan2(best.ex - ox, best.ez - oz),
    distance: isLance ? FROST_LANCE_AIM_LENGTH : clamp(best.d, minD, maxD),
    target: best.e,
    locked: true,
  };
}

/**
 * Touch drag-to-aim for the E button. `dx/dy` are screen pixels from the press
 * point (+x right, +y up). Up = camera forward. Inside the deadzone the aim stays
 * on auto (`manual: false`). Dragging back over the button after leaving it arms
 * cancel.
 */
export function mapTouchAimDrag({
  dx = 0,
  dy = 0,
  camYaw = 0,
  overButton = false,
  leftButton = false,
} = {}) {
  const len = Math.hypot(dx, dy);
  const cancel = Boolean(leftButton && overButton);
  if (len < MAGE_AIM_ASSIST.touchDeadzonePx) {
    return { manual: false, cancel, yaw: camYaw, distance: null, dragLen: len };
  }
  // World right is (-cos yaw, sin yaw), matching the movement basis.
  const yaw = wrapAngle(camYaw + Math.atan2(-dx, dy));
  const t = clamp((len - MAGE_AIM_ASSIST.touchDeadzonePx) / MAGE_AIM_ASSIST.touchRangePx, 0, 1);
  const distance = CINDER_FALL_MIN_DISTANCE + t * (CINDER_FALL_MAX_DISTANCE - CINDER_FALL_MIN_DISTANCE);
  return { manual: true, cancel, yaw, distance, dragLen: len };
}

/** Desktop PointerLock: camera pitch -> Cinder Fall distance (same curve as terrain-scalar). */
export function desktopPitchAimDistance(pitch = 0.18) {
  return projectAimRayToGround({ pitch, spellId: 'cinder_fall', heightFn: () => 0 }).distance;
}

/**
 * Composes one frame of Mage E aim for every input source:
 * - `desktop`: camera yaw + pitch distance, magnet assist.
 * - `touch` (drag past deadzone): drag direction/length, magnet assist.
 * - `auto` (touch press without drag, or quick-cast): snaps straight onto
 *   `autoTarget` if it is targetable and in range, else aims along `facingYaw`.
 * Returns `{ yaw, distance, target, lockState }`; `lockState` is
 * 'cancel' > 'blocked' (on cooldown) > 'locked' > 'free'.
 */
export function composeMageSkillAim({
  source = 'desktop',
  spellId = 'frost_lance',
  origin = { x: 0, z: 0 },
  camYaw = 0,
  pitch = 0.18,
  facingYaw = 0,
  touch = null,
  autoTarget = null,
  current = null,
  enemies = [],
  onCooldown = false,
  isTargetable = null,
} = {}) {
  const isLance = spellId !== 'cinder_fall';
  const targetable = (e) =>
    Boolean(e) && (typeof isTargetable === 'function' ? isTargetable(e) : !e.dead && e.hp > 0);
  let yaw = camYaw;
  let distance = MAGE_AIM_ASSIST.cinderDefaultDistance;
  let cancel = false;
  let res = null;

  const drag = source === 'touch' && touch ? mapTouchAimDrag({ ...touch, camYaw }) : null;
  if (drag) cancel = drag.cancel;

  if (source === 'desktop') {
    distance = desktopPitchAimDistance(pitch);
  } else if (drag && drag.manual) {
    yaw = drag.yaw;
    distance = drag.distance;
  } else {
    // Auto: lock straight onto the soft-lock target when it is in spell range.
    yaw = facingYaw;
    const t = targetable(autoTarget) ? autoTarget : null;
    if (t) {
      const dx = (t.x ?? 0) - (origin.x ?? 0);
      const dz = (t.z ?? 0) - (origin.z ?? 0);
      const d = Math.hypot(dx, dz);
      const maxD = isLance ? FROST_LANCE_AIM_LENGTH : CINDER_FALL_MAX_DISTANCE;
      if (d > 0.6 && d <= maxD + 0.75) {
        res = {
          yaw: Math.atan2(dx, dz),
          distance: isLance ? FROST_LANCE_AIM_LENGTH : clamp(d, CINDER_FALL_MIN_DISTANCE, CINDER_FALL_MAX_DISTANCE),
          target: t,
          locked: true,
        };
      }
    }
  }

  if (!res) {
    res = resolveSkillAimAssist({ origin, spellId, yaw, distance, enemies, current, isTargetable });
  }
  const lockState = cancel ? 'cancel' : onCooldown ? 'blocked' : res.locked ? 'locked' : 'free';
  return { yaw: res.yaw, distance: res.distance, target: res.target, lockState };
}

function wrapAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export function createCombatActionAimController({
  walkableHeightAt = () => 0,
  onSwingStarted = null,
  onContactHit = null,
  onSwingFinished = null,
  onShieldBlockChanged = null,
  onElementToggled = null,
  onAimChanged = null,
  onAimCast = null,
} = {}) {
  const heroes = {
    Knight: {
      id: 'Knight',
      selectedElement: 'ice', // 'ice' (Glacial Tide) | 'fire' (Hinokami Sunfire)
      comboIndex: -1,
      comboResetTimer: 0,
      mashCount: 0,
      mashTimeScale: MASH_TIMESCALE_MIN,
      bufferedAttack: false,
      activeSwing: null,
      shieldBlocking: false,
      consecutiveChargedCount: 0,
    },
    Mage: {
      id: 'Mage',
      selectedElement: 'ice', // 'ice' -> frost_lance | 'fire' -> cinder_fall
      selectedSpell: 'frost_lance', // 'frost_lance' | 'cinder_fall'
      comboIndex: -1,
      comboResetTimer: 0,
      mashCount: 0,
      mashTimeScale: MASH_TIMESCALE_MIN,
      bufferedAttack: false,
      activeSwing: null,
      shieldBlocking: false,
      consecutiveChargedCount: 0,
    },
  };

  const aimState = {
    active: false,
    heroId: 'Mage',
    spellId: 'frost_lance',
    origin: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0.18,
    distance: FROST_LANCE_AIM_LENGTH,
    length: FROST_LANCE_AIM_LENGTH,
    minDistance: CINDER_FALL_MIN_DISTANCE,
    maxDistance: CINDER_FALL_MAX_DISTANCE,
    dirX: 0,
    dirZ: 1,
    direction: { x: 0, y: 0, z: 1 },
    targetPos: { x: 0, y: 0, z: FROST_LANCE_AIM_LENGTH },
    customDistance: null,
    lastPitch: null,
    // 'free' | 'locked' (snapped to an enemy) | 'cancel' (touch dragged back) | 'blocked' (on cooldown)
    lockState: 'free',
    lockTargetId: null,
  };

  function startComboSwingInternal(heroId, isChainedFromBuffer = false) {
    const h = heroes[heroId] || heroes.Knight;
    const specs = heroId === 'Mage' ? MAGE_COMBO_SPECS : KNIGHT_COMBO_SPECS;

    if (isChainedFromBuffer || h.comboResetTimer > 0) {
      h.comboIndex = (h.comboIndex + 1) % specs.length;
    } else {
      h.comboIndex = 0;
    }

    if (isChainedFromBuffer) {
      // Mash speed already bumped when buffered; keep clamped in [1.00, 1.30]
      h.mashTimeScale = clamp(h.mashTimeScale, MASH_TIMESCALE_MIN, MASH_TIMESCALE_MAX);
    }

    const baseSpec = specs[h.comboIndex] || specs[0];
    const effectiveTimeScale = clamp(
      baseSpec.baseTimeScale * h.mashTimeScale,
      MASH_TIMESCALE_MIN,
      MASH_TIMESCALE_MAX
    );
    const effectiveDuration = baseSpec.duration / effectiveTimeScale;
    const contactFrac = clamp(baseSpec.contactFrac ?? 0.42, 0.38, 0.48);
    const contactTime = effectiveDuration * contactFrac;

    h.comboResetTimer = effectiveDuration + 0.65;
    if (heroId === 'Mage') {
      h.consecutiveChargedCount = 0;
    }

    const swing = {
      kind: 'combo',
      heroId,
      comboIndex: h.comboIndex,
      clip: baseSpec.clip,
      nativeClip: baseSpec.nativeClip || null,
      fade: baseSpec.fade ?? 0.06,
      startTime: 0,
      animStartTime: baseSpec.animStartTime ?? 0,
      animTimeScale: (baseSpec.animTimeScale ?? 1.0) * effectiveTimeScale,
      hopVy: 0,
      baseDuration: baseSpec.duration,
      duration: effectiveDuration,
      visualDuration: (baseSpec.visualDuration ?? baseSpec.duration) / effectiveTimeScale,
      timeScale: effectiveTimeScale,
      mashTimeScale: h.mashTimeScale,
      contactFrac,
      contactTime,
      contactFired: false,
      elapsed: 0,
      stepDist: baseSpec.stepDist || 0,
      stationary: false,
      cameraImpulse: 0,
    };

    h.activeSwing = swing;
    onSwingStarted?.(swing, h);
    return swing;
  }

  /**
   * Handles a tap on `attack`:
   * - If idle, starts swing immediately at `startTime: 0, hopVy: 0`.
   * - If already swinging, NEVER cuts the active swing: sets the 1-input buffer
   *   `bufferedAttack = true` and ramps `mashTimeScale` (`1.00x -> 1.30x`).
   */
  function pressAttack(heroId = 'Knight') {
    const normId = heroId === 'Mage' ? 'Mage' : 'Knight';
    const h = heroes[normId];

    if (normId === 'Knight' && h.shieldBlocking) {
      h.shieldBlocking = false;
      onShieldBlockChanged?.(false, h);
    }
    if (normId === 'Mage') {
      h.consecutiveChargedCount = 0;
    }

    if (h.activeSwing) {
      // Strictly 1-input buffer: never cut the active animation!
      h.bufferedAttack = true;
      h.mashCount += 1;
      h.mashTimeScale = clamp(
        Number((h.mashTimeScale + MASH_TIMESCALE_STEP).toFixed(4)),
        MASH_TIMESCALE_MIN,
        MASH_TIMESCALE_MAX
      );
      return {
        buffered: true,
        cutActiveSwing: false,
        bufferedAttack: h.bufferedAttack,
        mashTimeScale: h.mashTimeScale,
        activeSwing: h.activeSwing,
      };
    }

    if (h.comboResetTimer > 0) {
      h.mashCount += 1;
      h.mashTimeScale = clamp(
        Number((h.mashTimeScale + MASH_TIMESCALE_STEP).toFixed(4)),
        MASH_TIMESCALE_MIN,
        MASH_TIMESCALE_MAX
      );
    } else {
      h.mashCount = 0;
      h.mashTimeScale = MASH_TIMESCALE_MIN;
    }

    const swing = startComboSwingInternal(normId, false);
    return {
      buffered: false,
      cutActiveSwing: false,
      bufferedAttack: false,
      mashTimeScale: h.mashTimeScale,
      activeSwing: swing,
    };
  }

  /**
   * Handles Hold Attack (`heavy` / `charged` / `shield_block`):
   * - Knight: Raises frontal Shield Block (`block` clip, 80% damage reduction,
   *   protects Mage behind him; zero charged sword attack).
   * - Mage: Stationary `Shatterlance` cast (`startTime: 0`, unlimited consecutive casts).
   */
  function pressHeavy(heroId = 'Knight') {
    const normId = heroId === 'Mage' ? 'Mage' : 'Knight';
    const h = heroes[normId];

    if (normId === 'Knight') {
      h.activeSwing = null;
      h.bufferedAttack = false;
      h.shieldBlocking = true;
      onShieldBlockChanged?.(true, h);
      return {
        kind: 'shield_block',
        heroId: 'Knight',
        clip: 'block',
        shieldBlocking: true,
        damageReduction: KNIGHT_SHIELD_BLOCK_DR,
        cameraImpulse: 0,
      };
    }

    // If LMB mousedown started mage_attack1 < 0.30s ago and it hasn't fired contact yet,
    // upgrade it into the stationary Shatterlance charged cast. A bolt that already
    // released only has recovery left, which the charge may cancel.
    if (h.activeSwing && h.activeSwing.kind === 'combo') {
      h.activeSwing = null;
      h.bufferedAttack = false;
    }

    if (h.activeSwing) {
      // Already in the middle of a charged cast; do not cut it
      return {
        kind: 'charged',
        fallbackToNormal: false,
        buffered: true,
        heroId: 'Mage',
        consecutiveChargedCount: h.consecutiveChargedCount,
        activeSwing: h.activeSwing,
      };
    }

    h.consecutiveChargedCount += 1;
    const spec = MAGE_CHARGED_SHATTERLANCE_SPEC;
    const contactFrac = clamp(spec.contactFrac, 0.38, 0.48);
    const swing = {
      kind: 'charged',
      heroId: 'Mage',
      spellId: spec.spellId,
      comboIndex: 3,
      clip: spec.clip,
      windupClip: spec.windupClip || null,
      nativeClip: spec.nativeClip || null,
      fallbackClip: spec.fallbackClip || null,
      nativeReleaseOffset: spec.nativeReleaseOffset ?? 0,
      startTime: 0,
      hopVy: 0,
      baseDuration: spec.duration,
      duration: spec.duration,
      timeScale: 1.0,
      mashTimeScale: 1.0,
      contactFrac,
      contactTime: spec.duration * contactFrac,
      contactFired: false,
      elapsed: 0,
      stepDist: 0,
      stationary: true,
      consecutiveChargedCount: h.consecutiveChargedCount,
      cameraImpulse: 0,
    };

    h.activeSwing = swing;
    onSwingStarted?.(swing, h);
    return {
      kind: 'charged',
      fallbackToNormal: false,
      heroId: 'Mage',
      consecutiveChargedCount: h.consecutiveChargedCount,
      activeSwing: swing,
    };
  }

  function releaseHeavy(heroId = 'Knight') {
    const normId = heroId === 'Mage' ? 'Mage' : 'Knight';
    const h = heroes[normId];
    if (normId === 'Knight' && h.shieldBlocking) {
      h.shieldBlocking = false;
      onShieldBlockChanged?.(false, h);
      return { shieldBlocking: false };
    }
    return { shieldBlocking: h.shieldBlocking };
  }

  function cancelSwing(heroId = 'Knight', { resetCombo = false } = {}) {
    const normId = heroId === 'Mage' ? 'Mage' : 'Knight';
    const h = heroes[normId];
    h.activeSwing = null;
    h.bufferedAttack = false;
    h.mashTimeScale = MASH_TIMESCALE_MIN;
    if (resetCombo) {
      h.comboIndex = -1;
      h.comboResetTimer = 0;
      h.mashCount = 0;
    }
    return { canceled: true, heroId: normId };
  }

  /** True between swing start and its release/contact frame (not cancellable). */
  function isInReleaseWindup(heroId = 'Mage') {
    const sw = heroes[heroId === 'Mage' ? 'Mage' : 'Knight'].activeSwing;
    return Boolean(sw && !sw.contactFired);
  }

  /**
   * Ends the active swing's recovery (dash/move cancel). Refuses before the
   * release frame so a cancel can never eat a projectile. Clears the buffer.
   */
  function cancelRecovery(heroId = 'Mage') {
    const h = heroes[heroId === 'Mage' ? 'Mage' : 'Knight'];
    if (!h.activeSwing) return { cancelled: false, reason: 'idle' };
    if (!h.activeSwing.contactFired) return { cancelled: false, reason: 'windup' };
    const sw = h.activeSwing;
    h.activeSwing = null;
    h.bufferedAttack = false;
    onSwingFinished?.(sw, h);
    return { cancelled: true, swing: sw };
  }

  function notifyHeroMoved(heroId = 'Mage') {
    const normId = heroId === 'Mage' ? 'Mage' : 'Knight';
    const h = heroes[normId];
    if (normId === 'Mage' && h.consecutiveChargedCount > 0 && !h.activeSwing) {
      h.consecutiveChargedCount = 0;
    }
  }

  /**
   * `Tab` (`toggleElement`):
   * - Knight: toggles between `'ice'` (`Glacial Tide`) and `'fire'` (`Hinokami Sunfire`).
   * - Mage: toggles `E` spell between `'frost_lance'` (`Frost Lance`) and `'cinder_fall'` (`Cinder Fall`).
   */
  function toggleElement(heroId = 'Knight') {
    const normId = heroId === 'Mage' ? 'Mage' : 'Knight';
    const h = heroes[normId];
    if (normId === 'Knight') {
      h.selectedElement = h.selectedElement === 'ice' ? 'fire' : 'ice';
      const breathingStyle = h.selectedElement === 'ice' ? 'rime' : 'solar';
      const payload = {
        heroId: 'Knight',
        element: h.selectedElement,
        breathingStyle,
      };
      onElementToggled?.(payload);
      return payload;
    }

    h.selectedSpell = h.selectedSpell === 'frost_lance' ? 'cinder_fall' : 'frost_lance';
    h.selectedElement = h.selectedSpell === 'frost_lance' ? 'ice' : 'fire';
    if (aimState.active) {
      aimState.spellId = h.selectedSpell;
      updateSkillAim({
        origin: aimState.origin,
        yaw: aimState.yaw,
        pitch: aimState.pitch,
      });
    }
    const payload = {
      heroId: 'Mage',
      element: h.selectedElement,
      spellId: h.selectedSpell,
    };
    onElementToggled?.(payload);
    return payload;
  }

  /**
   * `Hold E` or `Hold Attack` (`skillAimStart`):
   * Activates the 3D PUBG-style Parabolic Aim Trajectory & Ground Impact Ring for Mage's
   * aimed spell (`shatterlance` at `0.8..18.0m`, `frost_lance` at `14.5m`, or `cinder_fall` at `3.0..16.0m`).
   */
  function startSkillAim({
    origin = { x: 0, y: 0, z: 0 },
    yaw = 0,
    pitch = 0.18,
    distance = undefined,
    touchTarget = null,
    rayOrigin = null,
    rayDir = null,
    spellId = null,
    lockState = 'free',
    lockTargetId = null,
  } = {}) {
    const chosenSpell = spellId || heroes.Mage.selectedSpell || 'frost_lance';
    // If Hold Attack upgraded a tap swing before its contact frame fired, cancel the tap swing cleanly
    if (heroes.Mage.activeSwing && !heroes.Mage.activeSwing.contactFired) {
      heroes.Mage.activeSwing = null;
      heroes.Mage.bufferedAttack = false;
    }
    aimState.active = true;
    aimState.spellId = chosenSpell;
    aimState.customDistance = Number.isFinite(Number(distance)) ? Number(distance) : null;
    aimState.lastPitch = Number.isFinite(Number(pitch)) ? Number(pitch) : null;
    updateSkillAim({
      origin,
      yaw,
      pitch,
      distance,
      touchTarget,
      rayOrigin,
      rayDir,
      spellId: chosenSpell,
      lockState,
      lockTargetId,
      isInitialShow: true,
    });
    return { ...aimState };
  }

  function updateSkillAim({
    origin = aimState.origin,
    yaw = aimState.yaw,
    pitch = aimState.pitch,
    distance = undefined,
    touchTarget = null,
    rayOrigin = null,
    rayDir = null,
    spellId = aimState.spellId,
    lockState = undefined,
    lockTargetId = undefined,
    isInitialShow = false,
  } = {}) {
    const chosenSpell = spellId || heroes.Mage.selectedSpell || 'frost_lance';
    const isShatter = chosenSpell === 'shatterlance';
    const hasCustomDist =
      Number.isFinite(Number(distance)) || aimState.customDistance !== null;
    const minDist =
      isShatter || hasCustomDist ? SHATTERLANCE_MIN_DISTANCE : CINDER_FALL_MIN_DISTANCE;
    const maxDist =
      isShatter || hasCustomDist ? SHATTERLANCE_MAX_DISTANCE : CINDER_FALL_MAX_DISTANCE;

    if (Number.isFinite(Number(distance))) {
      aimState.customDistance = clamp(Number(distance), minDist, maxDist);
    }
    if (Number.isFinite(Number(pitch))) {
      aimState.lastPitch = Number(pitch);
    }

    const effectiveDistance =
      distance !== undefined
        ? distance
        : aimState.customDistance !== null
          ? aimState.customDistance
          : undefined;

    const proj = projectAimRayToGround({
      origin,
      yaw,
      pitch,
      distance: effectiveDistance,
      spellId: effectiveDistance !== undefined ? 'shatterlance' : chosenSpell,
      fixedDistance: null,
      minDistance: minDist,
      maxDistance: maxDist,
      touchTarget,
      rayOrigin,
      rayDir,
      heightFn: walkableHeightAt,
    });

    aimState.spellId = chosenSpell;
    aimState.origin = { ...proj.origin };
    aimState.yaw = proj.yaw;
    if (typeof pitch === 'number') aimState.pitch = pitch;
    aimState.distance = proj.distance;
    aimState.length = proj.length;
    aimState.minDistance = minDist;
    aimState.maxDistance = maxDist;
    aimState.dirX = proj.dirX;
    aimState.dirZ = proj.dirZ;
    aimState.direction = { x: proj.dirX, y: 0, z: proj.dirZ };
    aimState.targetPos = { ...proj.targetPos };
    if (lockState !== undefined) aimState.lockState = lockState || 'free';
    if (lockTargetId !== undefined) aimState.lockTargetId = lockTargetId;

    if (aimState.active) {
      onAimChanged?.({ ...aimState }, isInitialShow ? 'show' : 'update');
    }
    return { ...aimState };
  }

  /**
   * `Release E` or `Release Hold Attack` (`skillAimRelease`):
   * Casts Mage's aimed spell (`shatterlance` at `0.8..18.0m`, `frost_lance` at `14.5m`,
   * or `cinder_fall` at `3.0..16.0m`), then hides the Aim Arrow (the cast result is passed
   * along so the arrow can linger until the release frame).
   * Releasing while `lockState === 'cancel'` cancels instead of casting.
   */
  function releaseSkillAim(overrideParams = null) {
    const wasActive = aimState.active;
    if (!wasActive) {
      return { cancelled: true, spellId: aimState.spellId, wasAiming: false, castResult: null };
    }
    if (overrideParams && typeof overrideParams === 'object') {
      updateSkillAim(overrideParams);
    }
    if (aimState.lockState === 'cancel') {
      cancelSkillAim();
      return { cancelled: true, spellId: aimState.spellId, wasAiming: true, castResult: null };
    }
    aimState.active = false;
    const chosenSpell = aimState.spellId || heroes.Mage.selectedSpell || 'frost_lance';
    const castPayload = {
      spellId: chosenSpell,
      origin: { ...aimState.origin },
      yaw: aimState.yaw,
      pitch: aimState.pitch,
      distance: aimState.distance,
      length: aimState.length,
      dirX: aimState.dirX,
      dirZ: aimState.dirZ,
      direction: { x: aimState.dirX, y: 0, z: aimState.dirZ },
      targetPos: { ...aimState.targetPos },
      lockState: aimState.lockState,
      lockTargetId: aimState.lockTargetId,
      cooldown: chosenSpell === 'shatterlance' ? 2.8 : MAGE_E_COOLDOWN,
      wasAiming: wasActive,
    };
    const castResult = onAimCast ? onAimCast(castPayload) : null;
    onAimChanged?.({ ...aimState, isReleasingCast: true }, 'hide', castResult);
    aimState.lockState = 'free';
    aimState.lockTargetId = null;
    return { ...castPayload, castResult };
  }

  function cancelSkillAim() {
    if (!aimState.active) return;
    aimState.active = false;
    aimState.lockState = 'free';
    aimState.lockTargetId = null;
    onAimChanged?.({ ...aimState }, 'hide', { cancelled: true });
  }

  /**
   * Advances active swings, triggers contact-frame hit detection at `contactFrac`,
   * chains buffered attacks on completion, and decays `mashTimeScale` when idle.
   */
  function update(dt) {
    const safeDt = Math.max(0, Number(dt) || 0);

    for (const heroId of ['Knight', 'Mage']) {
      const h = heroes[heroId];

      if (h.activeSwing) {
        const sw = h.activeSwing;
        sw.elapsed += safeDt;

        if (!sw.contactFired && sw.elapsed >= sw.contactTime) {
          sw.contactFired = true;
          onContactHit?.(sw, h);
        }

        if (sw.elapsed >= sw.duration) {
          const completed = sw;
          h.activeSwing = null;
          onSwingFinished?.(completed, h);

          if (h.bufferedAttack) {
            h.bufferedAttack = false;
            startComboSwingInternal(heroId, true);
          }
        }
      } else {
        if (h.comboResetTimer > 0) {
          h.comboResetTimer = Math.max(0, h.comboResetTimer - safeDt);
        }
        if (h.mashTimeScale > MASH_TIMESCALE_MIN) {
          h.mashTimeScale = Math.max(
            MASH_TIMESCALE_MIN,
            Number((h.mashTimeScale - MASH_TIMESCALE_DECAY_PER_SEC * safeDt).toFixed(4))
          );
          if (h.mashTimeScale <= MASH_TIMESCALE_MIN + 1e-4) {
            h.mashTimeScale = MASH_TIMESCALE_MIN;
            h.mashCount = 0;
          }
        }
      }
    }
  }

  return {
    heroes,
    aimState,
    pressAttack,
    pressHeavy,
    releaseHeavy,
    cancelSwing,
    isInReleaseWindup,
    cancelRecovery,
    notifyHeroMoved,
    toggleElement,
    startSkillAim,
    updateSkillAim,
    releaseSkillAim,
    cancelSkillAim,
    update,
  };
}
