// ============================================================================
// world/assets/vfx/noise-atlas.js
//
// Ultra-fast (< 3.5ms CPU) deterministic generator for the shared 128x128
// tileable RGBA DataTexture (`NoiseAtlas`) used by Stage 4 VFX shaders:
//   - R channel: Ridged multi-octave crystal fracture planes (cracks & fault lines)
//   - G channel: Feather-frost FBM veins & cellular ice-crust relief
//   - B channel: Pure smooth multi-octave FBM cloud noise for billowing mist & rime
//   - A channel: High-frequency pinpoint crystal glints & diamond star seeds
//
// Zero per-fragment 3D Simplex noise loops in GLSL — all shaders sample this
// pre-baked tileable atlas.
// ============================================================================

import * as THREE from 'three';

let _sharedAtlas = null;

function clampByte(v) {
  const n = (v * 255 + 0.5) | 0;
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

function smoothstep(edge0, edge1, x) {
  const t = x <= edge0 ? 0 : x >= edge1 ? 1 : (x - edge0) / (edge1 - edge0);
  return t * t * (3 - 2 * t);
}

/**
 * Fast deterministic integer hash on a periodic 2D lattice (`period` must be power-of-two).
 */
function hashMask2D(ix, iy, mask, seed) {
  const x = ix & mask;
  const y = iy & mask;
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) * 2.3283064365386963e-10;
}

/**
 * Tileable 2D value noise in [0, 1] with power-of-two period (`period = 4, 8, 16, 32`).
 */
function periodicValueNoise(u, v, period, seed) {
  const mask = period - 1;
  const x = u * period + 1024;
  const y = v * period + 1024;
  const ix = x | 0;
  const iy = y | 0;
  const fx = x - ix;
  const fy = y - iy;

  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const c00 = hashMask2D(ix, iy, mask, seed);
  const c10 = hashMask2D(ix + 1, iy, mask, seed);
  const c01 = hashMask2D(ix, iy + 1, mask, seed);
  const c11 = hashMask2D(ix + 1, iy + 1, mask, seed);

  const top = c00 + (c10 - c00) * ux;
  const bot = c01 + (c11 - c01) * ux;
  return top + (bot - top) * uy;
}

/**
 * Generates the 128x128 tileable RGBA DataTexture (`NoiseAtlas`) in < 3.5ms CPU.
 */
export function createNoiseAtlas(size = 128) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const data = new Uint8Array(size * size * 4);
  const invSize = 1.0 / size;

  // Pre-compute an 8x8 periodic Voronoi feature point table so cellular lookups are fast
  const CELLS = 8;
  const CELL_MASK = CELLS - 1;
  const featX = new Float32Array(CELLS * CELLS);
  const featY = new Float32Array(CELLS * CELLS);
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      const i = cy * CELLS + cx;
      featX[i] = hashMask2D(cx, cy, CELL_MASK, 88) * 0.78 + 0.11;
      featY[i] = hashMask2D(cx, cy, CELL_MASK, 154) * 0.78 + 0.11;
    }
  }

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) * invSize;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) * invSize;
      const idx = (y * size + x) * 4;

      // Domain warp for organic glacier fracture & vein flow
      const wx = (periodicValueNoise(u, v, 4, 101) - 0.5) * 0.14;
      const wy = (periodicValueNoise(u, v, 4, 203) - 0.5) * 0.14;
      const wu = u + wx;
      const wv = v + wy;

      // Fast periodic Voronoi lookup using pre-computed feature points
      const vx = wu * CELLS + 1024;
      const vy = wv * CELLS + 1024;
      const vix = vx | 0;
      const viy = vy | 0;
      const vfx = vx - vix;
      const vfy = vy - viy;
      let d1 = 8.0;
      let d2 = 8.0;
      for (let dy = -1; dy <= 1; dy++) {
        const cy = (viy + dy) & CELL_MASK;
        const rowOff = cy * CELLS;
        for (let dx = -1; dx <= 1; dx++) {
          const cx = (vix + dx) & CELL_MASK;
          const fi = rowOff + cx;
          const rx = dx + featX[fi] - vfx;
          const ry = dy + featY[fi] - vfy;
          const dSq = rx * rx + ry * ry;
          if (dSq < d1) {
            d2 = d1;
            d1 = dSq;
          } else if (dSq < d2) {
            d2 = dSq;
          }
        }
      }
      const vorEdge = Math.min(1, Math.sqrt(d2) - Math.sqrt(d1));

      // R Channel: Ridged crystal fracture planes + Voronoi cleavage seams
      const r1 = 1.0 - Math.abs(periodicValueNoise(wu, wv, 8, 11) * 2.0 - 1.0);
      const r2 = 1.0 - Math.abs(periodicValueNoise(wu, wv, 16, 23) * 2.0 - 1.0);
      const r3 = 1.0 - Math.abs(periodicValueNoise(u, v, 32, 37) * 2.0 - 1.0);
      const vorCrack = 1.0 - smoothstep(0.0, 0.22, vorEdge);
      const ridgedRaw = r1 * 0.46 + r2 * 0.32 + r3 * 0.22;
      const fractureR = Math.min(1.0, ridgedRaw * ridgedRaw * 0.75 + vorCrack * 0.68);

      // G Channel: Feather-frost FBM veins & packed snow slab height
      const g1 = periodicValueNoise(wu, wv, 4, 311);
      const g2 = periodicValueNoise(wu, wv, 8, 419);
      const g3 = periodicValueNoise(u, v, 16, 523);
      const fbmG = g1 * 0.5 + g2 * 0.32 + g3 * 0.18;
      const slabRelief = smoothstep(0.08, 0.65, vorEdge) * 0.35;
      const veinsG = Math.min(1.0, smoothstep(0.26, 0.84, fbmG) * 0.78 + slabRelief);

      // B Channel: Pure smooth multi-octave FBM cloud noise (zero Voronoi cells!)
      const b1 = periodicValueNoise(u, v, 4, 617);
      const b2 = periodicValueNoise(u + wx * 0.5, v + wy * 0.5, 8, 733);
      const b3 = periodicValueNoise(u, v, 16, 829);
      const mistB = smoothstep(0.16, 0.86, b1 * 0.58 + b2 * 0.30 + b3 * 0.12);

      // A Channel: High-frequency pinpoint crystal glints & star seeds
      const a1 = periodicValueNoise(u, v, 16, 911);
      const a2 = periodicValueNoise(u, v, 32, 977);
      const cellSpark = hashMask2D(x >> 1, y >> 1, 63, 1337);
      const glintRaw = a1 * 0.35 + a2 * 0.45 + cellSpark * 0.20;
      const glintStep = smoothstep(0.45, 0.96, glintRaw);
      const glintA = glintStep * Math.sqrt(glintStep);

      data[idx + 0] = clampByte(fractureR);
      data[idx + 1] = clampByte(veinsG);
      data[idx + 2] = clampByte(mistB);
      data[idx + 3] = clampByte(glintA);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'vfxNoiseAtlas128';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;

  const elapsedMs = typeof performance !== 'undefined' ? Number((performance.now() - t0).toFixed(2)) : 0;
  texture.userData.generationTimeMs = elapsedMs;
  texture.userData.resolution = size;

  return texture;
}

/**
 * Returns the cached shared 128x128 RGBA NoiseAtlas DataTexture.
 */
export function getSharedNoiseAtlas() {
  if (!_sharedAtlas) {
    _sharedAtlas = createNoiseAtlas(128);
  }
  return _sharedAtlas;
}
