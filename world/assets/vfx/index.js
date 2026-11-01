// ============================================================================
// world/assets/vfx/index.js
//
// Stage 4 Complete Opaque VFX, Mage Bolts & Sword Breathing Suite API:
// - `createFrostLanceSystem(options)`
// - `createShatterlanceSystem(options)`
// - `createCinderFallSystem(options)`
// - `createStormLanceSystem(options)`
// - `createSwordVfxSystem(options)`
// - `createMageBoltSystem(options)`
// - `createVfxKit(options)`
// - `getSharedNoiseAtlas()`, `createNoiseAtlas(size)`
// ============================================================================

import * as THREE from 'three';
import { createNoiseAtlas, getSharedNoiseAtlas } from './noise-atlas.js';
import {
  FrostLanceSystem,
  createFrostLanceSystem,
  createGlacierCrystalGeometry,
  FROST_LANCE_DEFAULTS,
  FROST_LANCE_STYLE_PRESETS,
} from './frost-lance.js';
import {
  ShatterlanceSystem,
  createShatterlanceSystem,
  createFlutedGreatLanceGeometry,
  SHATTERLANCE_DEFAULTS,
} from './shatterlance.js';
import {
  CinderFallSystem,
  createCinderFallSystem,
  createVolcanicAsteroidGeometry,
  createFlameTongueHullGeometry,
  CINDER_FALL_DEFAULTS,
} from './cinder-fall.js';
import {
  StormLanceSystem,
  createStormLanceSystem,
  STORM_LANCE_DEFAULTS,
} from './storm-lance.js';
import {
  SwordVfxSystem,
  createSwordVfxSystem,
  createBladeSheathGeometry,
  createLiveSwordRibbonGeometry,
  createUkiyoeSlashArcGeometry,
  LOCAL_BLADE_GUARD,
  LOCAL_BLADE_TIP,
  BREATHING_PALETTES,
  SWING_CONFIGS,
} from './sword-vfx.js';
import {
  MageBoltSystem,
  createMageBoltSystem,
  createStarlightCrystalGeometry,
  createCometWakeRibbonGeometry,
  MAGE_BOLT_DEFAULTS,
} from './mage-bolt.js';

export {
  createNoiseAtlas,
  getSharedNoiseAtlas,
  FrostLanceSystem,
  createFrostLanceSystem,
  createGlacierCrystalGeometry,
  FROST_LANCE_DEFAULTS,
  FROST_LANCE_STYLE_PRESETS,
  ShatterlanceSystem,
  createShatterlanceSystem,
  createFlutedGreatLanceGeometry,
  SHATTERLANCE_DEFAULTS,
  CinderFallSystem,
  createCinderFallSystem,
  createVolcanicAsteroidGeometry,
  createFlameTongueHullGeometry,
  CINDER_FALL_DEFAULTS,
  StormLanceSystem,
  createStormLanceSystem,
  STORM_LANCE_DEFAULTS,
  SwordVfxSystem,
  createSwordVfxSystem,
  createBladeSheathGeometry,
  createLiveSwordRibbonGeometry,
  createUkiyoeSlashArcGeometry,
  LOCAL_BLADE_GUARD,
  LOCAL_BLADE_TIP,
  BREATHING_PALETTES,
  SWING_CONFIGS,
  MageBoltSystem,
  createMageBoltSystem,
  createStarlightCrystalGeometry,
  createCometWakeRibbonGeometry,
  MAGE_BOLT_DEFAULTS,
};

/**
 * Convenience factory for the complete Stage 4 VFX, Mage Bolts & Sword Breathing Kit.
 */
export function createVfxKit({
  scene,
  getGroundHeight = () => 0,
  frostLanceConfig = {},
  shatterlanceConfig = {},
  cinderFallConfig = {},
  stormLanceConfig = {},
  mageBoltConfig = {},
  onApexImpact = null,
} = {}) {
  const noiseAtlas = getSharedNoiseAtlas();

  const frostLance = createFrostLanceSystem({
    scene,
    getGroundHeight,
    config: frostLanceConfig,
    onApexImpact,
  });
  const shatterlance = createShatterlanceSystem({
    scene,
    getGroundHeight,
    config: shatterlanceConfig,
    onApexImpact,
  });
  const cinderFall = createCinderFallSystem({
    scene,
    getGroundHeight,
    config: cinderFallConfig,
    onApexImpact,
  });
  const stormLance = createStormLanceSystem({
    scene,
    getGroundHeight,
    config: stormLanceConfig,
    onApexImpact,
  });
  const swordVfx = createSwordVfxSystem({
    scene,
    getGroundHeight,
  });
  const mageBolt = createMageBoltSystem({
    scene,
    getGroundHeight,
    config: mageBoltConfig,
  });

  const allSystems = [frostLance, shatterlance, cinderFall, stormLance, swordVfx, mageBolt];
  const _tmpShake = new THREE.Vector3();

  return {
    noiseAtlas,
    frostLance,
    shatterlance,
    cinderFall,
    stormLance,
    swordVfx,
    mageBolt,
    castFrostLance: (origin, direction, options = {}) =>
      frostLance.cast(origin, direction, options),
    castShatterlance: (origin, direction, options = {}) =>
      shatterlance.cast(origin, direction, options),
    castCinderFall: (origin, direction, options = {}) =>
      cinderFall.cast(origin, direction, options),
    castStormLance: (origin, direction, options = {}) =>
      stormLance.cast(origin, direction, options),
    fireMageBolt: (options = {}) => mageBolt.fireComboVolley(options),
    castSpell: (spellId, origin, direction, options = {}) => {
      const id = String(spellId || 'frost_lance').toLowerCase();
      if (id === 'shatterlance' || id === '2') return shatterlance.cast(origin, direction, options);
      if (id === 'cinder_fall' || id === 'cinderfall' || id === '3') {
        return cinderFall.cast(origin, direction, options);
      }
      if (id === 'storm_lance' || id === 'stormlance' || id === '4') {
        return stormLance.cast(origin, direction, options);
      }
      if (id === 'mage_bolt' || id === 'magebolt' || id === 'bolt') {
        return mageBolt.fireComboVolley({ origin, direction, ...options });
      }
      return frostLance.cast(origin, direction, options);
    },
    seek: (timeSeconds) => frostLance.seek(timeSeconds),
    update: (dt) => {
      for (const sys of allSystems) sys.update(dt);
    },
    setLighting: (lighting) => {
      for (const sys of allSystems) sys.setLighting(lighting);
    },
    registerEnemyTargets: (enemies) => frostLance.registerEnemyTargets(enemies),
    getCameraShakeOffset: (out = new THREE.Vector3()) => {
      out.set(0, 0, 0);
      for (const sys of allSystems) {
        if (typeof sys.getCameraShakeOffset === 'function') {
          sys.getCameraShakeOffset(_tmpShake);
          out.add(_tmpShake);
        }
      }
      return out;
    },
    getHitstopScale: () => {
      let minScale = 1.0;
      for (const sys of allSystems) {
        if (typeof sys.getHitstopScale === 'function') {
          minScale = Math.min(minScale, sys.getHitstopScale());
        }
      }
      return minScale;
    },
    getStats: () => ({
      frostLance: frostLance.getStats(),
      shatterlance: shatterlance.getStats(),
      cinderFall: cinderFall.getStats(),
      stormLance: stormLance.getStats(),
      swordVfx: swordVfx.getStats(),
      mageBolt: mageBolt.getStats(),
    }),
    clear: () => {
      for (const sys of allSystems) sys.clear();
    },
    dispose: () => {
      for (const sys of allSystems) sys.dispose();
    },
  };
}
