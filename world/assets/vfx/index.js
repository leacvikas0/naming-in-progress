// ============================================================================
// world/assets/vfx/index.js
//
// Stage 4 Pass 1 Public VFX Kit API:
// - `createFrostLanceSystem(options)`
// - `createVfxKit(options)`
// - `getSharedNoiseAtlas()`, `createNoiseAtlas(size)`
// - `createGlacierCrystalGeometry(options)`
// - `FROST_LANCE_DEFAULTS`
// ============================================================================

import { createNoiseAtlas, getSharedNoiseAtlas } from './noise-atlas.js';
import {
  FrostLanceSystem,
  createFrostLanceSystem,
  createGlacierCrystalGeometry,
  FROST_LANCE_DEFAULTS,
} from './frost-lance.js';

export {
  createNoiseAtlas,
  getSharedNoiseAtlas,
  FrostLanceSystem,
  createFrostLanceSystem,
  createGlacierCrystalGeometry,
  FROST_LANCE_DEFAULTS,
};

/**
 * Convenience factory for the Stage 4 VFX Kit.
 */
export function createVfxKit({
  scene,
  getGroundHeight = () => 0,
  frostLanceConfig = {},
  onApexImpact = null,
} = {}) {
  const noiseAtlas = getSharedNoiseAtlas();
  const frostLance = createFrostLanceSystem({
    scene,
    getGroundHeight,
    config: frostLanceConfig,
    onApexImpact,
  });

  return {
    noiseAtlas,
    frostLance,
    castFrostLance: (origin, direction, options = {}) =>
      frostLance.cast(origin, direction, options),
    seek: (timeSeconds) => frostLance.seek(timeSeconds),
    update: (dt) => frostLance.update(dt),
    setLighting: (lighting) => frostLance.setLighting(lighting),
    registerEnemyTargets: (enemies) => frostLance.registerEnemyTargets(enemies),
    getCameraShakeOffset: (out) => frostLance.getCameraShakeOffset(out),
    getHitstopScale: () => frostLance.getHitstopScale(),
    getStats: () => frostLance.getStats(),
    clear: () => frostLance.clear(),
    dispose: () => frostLance.dispose(),
  };
}
