import { PALETTES } from './materials.js';
import { createGinkgoGeometry, createMapleGeometry, createBlossomGeometry } from './geometry.js';

// ---------------------------------------------------------------------------
// Built-in petal types
//
// A type is pure data plus a geometry builder. Everything the runtime needs is
// in this object, which means a game can add its own petal by registering one
// more entry - no changes to the system.
//
//   id       unique string
//   label    display name
//   build    (cfg) => THREE.BufferGeometry
//   palette  five-colour palette from materials.js (or your own object)
//   scale    geometry scale multiplier
//   weight   relative spawn weight among active types
//   motion   spin = tumble speed, fall = fall speed, sway = horizontal drift
//   size     [min, max] per-instance scale
//   params   passed straight to the builder
// ---------------------------------------------------------------------------

export const PETAL_TYPES = [
  {
    id: 'ginkgo-gold',
    label: 'Ginkgo (gold)',
    build: createGinkgoGeometry,
    palette: PALETTES.ginkgoGold,
    scale: 0.46,
    weight: 0.24,
    motion: { spin: 1.00, fall: 1.00, sway: 1.00 },
    size: [1.10, 2.00],
    params: {
      fanHalfAngle: 1.20, notchDepth: 0.34, notchWidth: 26.0, lobeDepth: 0.18,
      scallopAmp: 0.030, scallopFreq: 11, cupDepth: 0.115, veinRidge: 0.020,
      ribs: 26, seed: 11
    }
  },
  {
    id: 'ginkgo-amber',
    label: 'Ginkgo (amber)',
    build: createGinkgoGeometry,
    palette: PALETTES.ginkgoAmber,
    scale: 0.42,
    weight: 0.10,
    motion: { spin: 1.10, fall: 1.05, sway: 0.95 },
    size: [1.10, 1.95],
    params: {
      fanHalfAngle: 1.02, notchDepth: 0.46, notchWidth: 20.0, lobeDepth: 0.14,
      scallopAmp: 0.022, scallopFreq: 14, cupDepth: 0.135, veinRidge: 0.018,
      ribs: 28, seed: 37
    }
  },
  {
    id: 'sakura-pink',
    label: 'Sakura (pink)',
    build: createBlossomGeometry,
    palette: PALETTES.sakuraPink,
    scale: 0.42,
    weight: 0.28,
    motion: { spin: 0.70, fall: 0.85, sway: 1.10 },
    size: [1.05, 1.95],
    params: {
      length: 1.00, width: 0.34, widthPow: 0.80, notch: 0.22, tipStyle: 'broad',
      cupDepth: 0.13, skew: 0.03, seed: 5
    }
  },
  {
    id: 'sakura-white',
    label: 'Sakura (white)',
    build: createBlossomGeometry,
    palette: PALETTES.sakuraWhite,
    scale: 0.40,
    weight: 0.14,
    motion: { spin: 0.65, fall: 0.90, sway: 1.15 },
    size: [1.00, 1.85],
    params: {
      length: 0.94, width: 0.31, widthPow: 0.85, notch: 0.19, tipStyle: 'broad',
      cupDepth: 0.12, skew: -0.02, seed: 13
    }
  },
  {
    id: 'maple-red',
    label: 'Maple (crimson)',
    build: createMapleGeometry,
    palette: PALETTES.mapleRed,
    scale: 0.46,
    weight: 0.08,
    motion: { spin: 1.40, fall: 1.10, sway: 0.85 },
    size: [1.00, 1.70],
    params: {
      radius: 0.58, lobes: 5, lobePow: 0.90, serration: 0.050,
      cupDepth: 0.10, seed: 21
    }
  },
  {
    id: 'maple-orange',
    label: 'Maple (orange)',
    build: createMapleGeometry,
    palette: PALETTES.mapleOrange,
    scale: 0.44,
    weight: 0.08,
    motion: { spin: 1.30, fall: 1.05, sway: 0.85 },
    size: [1.00, 1.70],
    params: {
      radius: 0.56, lobes: 5, lobePow: 0.80, serration: 0.055,
      cupDepth: 0.09, seed: 29
    }
  },
  {
    id: 'rose',
    label: 'Rose petal',
    build: createBlossomGeometry,
    palette: PALETTES.roseDusty,
    scale: 0.44,
    weight: 0.08,
    motion: { spin: 0.80, fall: 0.92, sway: 1.00 },
    size: [1.05, 1.90],
    params: {
      length: 1.05, width: 0.38, widthPow: 0.72, notch: 0.0, tipStyle: 'broad',
      cupDepth: 0.17, skew: 0.05, seed: 41
    }
  }
];

const registry = new Map();

PETAL_TYPES.forEach((t) => registry.set(t.id, t));

/**
 * Add or replace a petal type. Returns the stored type.
 * Register before constructing a PetalSystem that uses it.
 */
export function registerPetalType(type) {
  if (!type || !type.id || typeof type.build !== 'function' || !type.palette) {
    throw new Error('registerPetalType: type needs { id, build, palette }');
  }
  const normalized = {
    weight: 1,
    scale: 1,
    size: [1.0, 1.8],
    motion: { spin: 1, fall: 1, sway: 1 },
    params: {},
    label: type.id,
    ...type
  };
  registry.set(type.id, normalized);
  return normalized;
}

export function getPetalType(id) {
  return registry.get(id) || null;
}

export function getPetalTypes() {
  return Array.from(registry.values());
}
