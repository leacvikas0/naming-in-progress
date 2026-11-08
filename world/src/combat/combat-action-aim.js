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
    startTime: 0,
    animStartTime: 0.1,
    animTimeScale: 1.22,
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
    startTime: 0,
    animStartTime: 0.2,
    animTimeScale: 1.25,
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
    startTime: 0,
    animStartTime: 0.26,
    animTimeScale: 1.28,
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
    startTime: 0,
    animStartTime: 0.16,
    animTimeScale: 1.25,
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
 */
export const MAGE_COMBO_SPECS = [
  {
    index: 0,
    clip: 'mage_attack1',
    startTime: 0,
    baseTimeScale: 1.0,
    timeScale: 1.0,
    duration: 0.5,
    contactFrac: 0.4,
    stepDist: 0,
    hopVy: 0,
    cameraImpulse: 0,
  },
  {
    index: 1,
    clip: 'mage_attack2',
    startTime: 0,
    baseTimeScale: 1.0,
    timeScale: 1.0,
    duration: 0.5,
    contactFrac: 0.42,
    stepDist: 0,
    hopVy: 0,
    cameraImpulse: 0,
  },
  {
    index: 2,
    clip: 'mage_attack3',
    startTime: 0,
    baseTimeScale: 1.0,
    timeScale: 1.0,
    duration: 0.56,
    contactFrac: 0.45,
    stepDist: 0,
    hopVy: 0,
    cameraImpulse: 0,
  },
];

/**
 * Stationary charged Shatterlance spec for Mage (`Hold Attack`).
 * Uses the full native cast animation as its load time (`startTime: 0`).
 * After 3 consecutive charged attacks, holding attack automatically falls back
 * to a normal bolt attack.
 */
export const MAGE_CHARGED_SHATTERLANCE_SPEC = {
  clip: 'cast_spell',
  spellId: 'shatterlance',
  startTime: 0,
  baseTimeScale: 1.0,
  timeScale: 1.0,
  duration: 0.86,
  contactFrac: 0.46,
  stepDist: 0,
  hopVy: 0,
  stationary: true,
  maxConsecutive: MAGE_MAX_CONSECUTIVE_CHARGED,
  cameraImpulse: 0,
};

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
      startTime: 0,
      animStartTime: baseSpec.animStartTime ?? 0,
      animTimeScale: (baseSpec.animTimeScale ?? 1.0) * effectiveTimeScale,
      hopVy: 0,
      baseDuration: baseSpec.duration,
      duration: effectiveDuration,
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
    // upgrade it into the stationary Shatterlance charged cast.
    if (h.activeSwing && h.activeSwing.kind === 'combo' && !h.activeSwing.contactFired) {
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
    isInitialShow = false,
  } = {}) {
    const chosenSpell = spellId || heroes.Mage.selectedSpell || 'frost_lance';
    const isShatter = chosenSpell === 'shatterlance';
    const minDist = isShatter ? SHATTERLANCE_MIN_DISTANCE : CINDER_FALL_MIN_DISTANCE;
    const maxDist = isShatter ? SHATTERLANCE_MAX_DISTANCE : CINDER_FALL_MAX_DISTANCE;

    if (Number.isFinite(Number(distance))) {
      aimState.customDistance = clamp(Number(distance), minDist, maxDist);
    } else if (
      !isInitialShow &&
      aimState.customDistance !== null &&
      Number.isFinite(Number(pitch)) &&
      aimState.lastPitch !== null &&
      chosenSpell !== 'frost_lance'
    ) {
      const pitchDelta = Number(pitch) - aimState.lastPitch;
      if (Math.abs(pitchDelta) > 1e-4) {
        aimState.customDistance = clamp(
          aimState.customDistance - pitchDelta * 18.0,
          minDist,
          maxDist
        );
      }
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
      spellId: chosenSpell,
      fixedDistance: chosenSpell === 'frost_lance' ? FROST_LANCE_AIM_LENGTH : null,
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

    if (aimState.active) {
      onAimChanged?.({ ...aimState }, isInitialShow ? 'show' : 'update');
    }
    return { ...aimState };
  }

  /**
   * `Release E` or `Release Hold Attack` (`skillAimRelease`):
   * Hides the Spellbook Aim Arrow and casts Mage's aimed spell
   * (`shatterlance` at `0.8..18.0m`, `frost_lance` at `14.5m`, or `cinder_fall` at `3.0..16.0m`).
   */
  function releaseSkillAim(overrideParams = null) {
    if (overrideParams && typeof overrideParams === 'object') {
      updateSkillAim(overrideParams);
    }
    const wasActive = aimState.active;
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
      cooldown: chosenSpell === 'shatterlance' ? 2.8 : MAGE_E_COOLDOWN,
      wasAiming: wasActive,
    };
    onAimChanged?.({ ...aimState }, 'hide');
    const castResult = onAimCast ? onAimCast(castPayload) : null;
    return { ...castPayload, castResult };
  }

  function cancelSkillAim() {
    if (!aimState.active) return;
    aimState.active = false;
    onAimChanged?.({ ...aimState }, 'hide');
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
    notifyHeroMoved,
    toggleElement,
    startSkillAim,
    updateSkillAim,
    releaseSkillAim,
    cancelSkillAim,
    update,
  };
}
