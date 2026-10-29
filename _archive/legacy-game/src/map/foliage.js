import * as THREE from "three";
import { MEADOW, MEADOW_LIGHT } from "./palette.js";

// Sunpetal Vale — procedural foliage.
//
// Grass, wildflowers, shrubs, ferns, trees and ground-cover accents for the
// anime meadow. Everything is generated from maths: no textures, no GLB, no
// asset loads. Same seed => same scene (all randomness comes from the injected
// `rng`).
//
// The look follows handoff/map-bg/REF-NOTES.md §5: one shared two-colour ramp
// material instead of PBR. Every vertex carries a sunlit colour (`aSun`) and a
// shadow colour (`aShadow`) baked from the palette's three tones, plus a wind
// weight (`aWind`). The fragment shader does
//
//   col = mix(shadow + ambient*0.42, sun * uSunColor, wrapLit)
//
// with soft-upward normals (the anti-black-blade trick), a warm rim, backlight
// translucency, and a clamped highlight compression. No lights, no PBR, no
// shadow-map dependence — that is what keeps this from reading as green plastic.
//
// Wind is a vertex-shader displacement of the world position, following the
// reference formula: two frequencies, a spatial per-instance phase, and
// amplitude proportional to height². Per-instance colour variation comes from a
// hash of the instance world position, not from instance colours.

const TAU = Math.PI * 2;
const PLAY_HALF = 46;
const LAKE = { minX: -80, maxX: -50, minZ: -25, maxZ: 18, level: -0.35 };
const DEFAULT_SEED = 20261017;
const GRASS_TILE = 64;

/* ==========================================================================
   Math + noise
   ========================================================================== */

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash2(ix, iz) {
  let h = ix * 374761393 + iz * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

function fbm2(x, z, octaves = 3) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise2(x * freq, z * freq);
    norm += amp;
    freq *= 2.02;
    amp *= 0.5;
  }
  return v / norm;
}

// Deterministic fallback RNG for callers that do not inject one.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ==========================================================================
   Colour helpers (all values are linear-sRGB, as THREE.Color stores them)
   ========================================================================== */

function rgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

function mix3(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

function scale3(a, k, out) {
  out[0] = a[0] * k;
  out[1] = a[1] * k;
  out[2] = a[2] * k;
  return out;
}

/* ==========================================================================
   Geometry builder
   ========================================================================== */

// Accumulates indexed triangles with the foliage attribute layout:
//   position, normal, aSun (sunlit vertex colour), aShadow (shadow colour),
//   aWind (0..1 wind weight, ~height fraction).
class Builder {
  constructor() {
    this.position = [];
    this.normal = [];
    this.sun = [];
    this.shadow = [];
    this.wind = [];
    this.index = [];
  }

  vertex(x, y, z, nx, ny, nz, sun, shd, wind) {
    const i = this.position.length / 3;
    this.position.push(x, y, z);
    this.normal.push(nx, ny, nz);
    this.sun.push(sun[0], sun[1], sun[2]);
    this.shadow.push(shd[0], shd[1], shd[2]);
    this.wind.push(wind);
    return i;
  }

  tri(a, b, c) {
    this.index.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.index.push(a, b, c, a, c, d);
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.normal, 3));
    geo.setAttribute("aSun", new THREE.Float32BufferAttribute(this.sun, 3));
    geo.setAttribute("aShadow", new THREE.Float32BufferAttribute(this.shadow, 3));
    geo.setAttribute("aWind", new THREE.Float32BufferAttribute(this.wind, 1));
    geo.setIndex(this.index);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

// Every geometry is authored so its tallest point is y = 1, which lets one
// instance scale (metres) drive both the silhouette and the wind amplitude.
function normalizeToHeight(geo) {
  const pos = geo.attributes.position;
  let maxY = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > maxY) maxY = y;
  }
  if (maxY > 0.001) {
    const k = 1 / maxY;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  }
  return geo;
}

/**
 * One arching, V-folded leaf/blade. This is the single workhorse primitive:
 * grass blades, canopy leaf fans, shrub leaves, fern fronds, flower stem leaves
 * and reeds are all built from it. Geometry follows REF-NOTES §4 S6.
 *
 * V-fold = 3 vertices per ring (left lifted, mid dropped) so even a thin blade
 * catches light with some volume.
 */
function addLeaf(b, o) {
  const {
    x = 0,
    y = 0,
    z = 0,
    yaw = 0,
    pitch = 0.45,
    length = 0.7,
    width = 0.12,
    arch = 0.26,
    fold = 0.016,
    segments = 3,
    sunBase,
    sunTip,
    shdBase,
    shdTip,
    windBase = 0,
    windTip = 1,
    leafShape = true,
    rimMix = 0,
    rimColor = null,
  } = o;

  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const sideX = -sinY;
  const sideZ = cosY;
  const rings = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Leaf = narrow base -> wide belly -> point. Blade = wide base -> point.
    const profile = leafShape
      ? Math.sin(Math.pow(t, 0.72) * Math.PI)
      : 1 - t * 0.86;
    const halfW = width * 0.5 * profile;
    const ang = pitch + t * arch * 0.6;
    const reach = length * t * Math.cos(ang);
    const lift = length * (t * Math.sin(pitch) - t * t * arch);
    const cx = x + cosY * reach;
    const cy = y + Math.max(0.004, lift);
    const cz = z + sinY * reach;

    const sun = mix3(sunBase, sunTip, Math.pow(t, 0.85), [0, 0, 0]);
    if (rimMix > 0 && rimColor) {
      mix3(sun, rimColor, rimMix * Math.pow(t, 1.5), sun);
    }
    const shd = mix3(shdBase, shdTip, Math.pow(t, 0.85), [0, 0, 0]);
    const w = windBase + (windTip - windBase) * Math.pow(t, 1.4);

    const sp = Math.sin(ang);
    const cp = Math.cos(ang);
    let nx = -cosY * sp;
    let ny = cp;
    let nz = -sinY * sp;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;

    if (i === segments) {
      rings.push([b.vertex(cx, cy, cz, nx, ny, nz, sun, shd, w)]);
      continue;
    }

    const foldLift = fold * profile;
    const midDrop = fold * 0.5 * profile;
    const sunMid = scale3(sun, 0.94, [0, 0, 0]);
    const shdMid = scale3(shd, 0.94, [0, 0, 0]);

    const nLx = nx + sideX * 0.5;
    const nLz = nz + sideZ * 0.5;
    const nlL = Math.hypot(nLx, ny, nLz) || 1;
    const nRx = nx - sideX * 0.5;
    const nRz = nz - sideZ * 0.5;
    const nlR = Math.hypot(nRx, ny, nRz) || 1;

    rings.push([
      b.vertex(
        cx + sideX * halfW, cy + foldLift, cz + sideZ * halfW,
        nLx / nlL, ny / nlL, nLz / nlL, sun, shd, w
      ),
      b.vertex(cx, cy - midDrop, cz, nx, ny, nz, sunMid, shdMid, w),
      b.vertex(
        cx - sideX * halfW, cy + foldLift, cz - sideZ * halfW,
        nRx / nlR, ny / nlR, nRz / nlR, sun, shd, w
      ),
    ]);
  }

  for (let i = 0; i < segments - 1; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    b.quad(r0[0], r0[1], r1[1], r1[0]);
    b.quad(r0[1], r0[2], r1[2], r1[1]);
  }
  const rLast = rings[segments - 1];
  const vTip = rings[segments][0];
  b.tri(rLast[0], rLast[1], vTip);
  b.tri(rLast[1], rLast[2], vTip);
}

/** Tapered tube along a polyline: trunks, branches, roots, flower stems. */
function addTube(b, points, r0, r1, sides, sunA, sunB, shdA, shdB, windScale) {
  const rings = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const t = n > 1 ? i / (n - 1) : 0;
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    let tz = next.z - prev.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;

    let ux = 0;
    let uy = 1;
    let uz = 0;
    if (Math.abs(ty) > 0.92) {
      ux = 1;
      uy = 0;
      uz = 0;
    }
    let sx = uy * tz - uz * ty;
    let sy = uz * tx - ux * tz;
    let sz = ux * ty - uy * tx;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl;
    sy /= sl;
    sz /= sl;
    const ux2 = ty * sz - tz * sy;
    const uy2 = tz * sx - tx * sz;
    const uz2 = tx * sy - ty * sx;

    const r = r0 + (r1 - r0) * t;
    const sun = mix3(sunA, sunB, t, [0, 0, 0]);
    const shd = mix3(shdA, shdB, t, [0, 0, 0]);
    const w = clamp01(p.y) * windScale;
    const ring = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nx = sx * ca + ux2 * sa;
      const ny = sy * ca + uy2 * sa;
      const nz = sz * ca + uz2 * sa;
      ring.push(
        b.vertex(p.x + nx * r, p.y + ny * r, p.z + nz * r, nx, ny, nz, sun, shd, w)
      );
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = rings[i][s];
      const bb = rings[i][(s + 1) % sides];
      const c = rings[i + 1][(s + 1) % sides];
      const d = rings[i + 1][s];
      b.quad(a, bb, c, d);
    }
  }
}

/* ==========================================================================
   Geometry factories
   ========================================================================== */

// Grass tuft. variant 0/1 = near (6 blades), variant 2 = far (4 blades).
function buildGrassGeometry(variant, rng, C) {
  const b = new Builder();
  const blades = variant === 2 ? 5 : variant === 0 ? 7 : 6;
  const baseAng = rng() * TAU;
  for (let i = 0; i < blades; i++) {
    const yaw = baseAng + (i / blades) * TAU + (rng() - 0.5) * 0.55;
    const spread = 0.02 + rng() * 0.08;
    const bx = Math.cos(yaw) * spread;
    const bz = Math.sin(yaw) * spread;
    const pitch = 1.12 + rng() * 0.26;
    const arch = 0.12 + rng() * 0.16;
    const targetLift = 0.85 + rng() * 0.15;
    const length = Math.min(2.1, targetLift / Math.max(0.28, Math.sin(pitch) - arch));
    // Wide blades: at 0.2 m tall this is a 3-5 cm blade, which is what makes
    // short turf read as a carpet instead of thin isolated spikes.
    const width = variant === 2 ? 0.14 + rng() * 0.08 : 0.17 + rng() * 0.11;
    const bright = 0.92 + rng() * 0.16;
    const tipMix = rng() * 0.45;
    addLeaf(b, {
      x: bx,
      y: 0,
      z: bz,
      yaw,
      pitch,
      length,
      width,
      arch,
      fold: 0.014 + rng() * 0.016,
      segments: 3,
      sunBase: scale3(mix3(C.grassBase, C.grassCool, 0.5, [0, 0, 0]), bright, [0, 0, 0]),
      sunTip: scale3(mix3(C.grassWarm, C.grassTip, tipMix * 0.75, [0, 0, 0]), bright, [0, 0, 0]),
      shdBase: scale3(C.grassShadow, bright, [0, 0, 0]),
      shdTip: scale3(mix3(C.grassCool, C.grassBase, 0.35, [0, 0, 0]), bright, [0, 0, 0]),
      windBase: 0,
      windTip: 1,
      leafShape: false,
    });
  }
  return normalizeToHeight(b.build());
}

// Flower stem + two small stem leaves. Shared by every wildflower.
function buildFlowerStemGeometry(rng, C) {
  const b = new Builder();
  const bendX = 0.018;
  const bendZ = 0.01;
  addTube(
    b,
    [
      { x: 0, y: 0, z: 0 },
      { x: bendX * 0.45, y: 0.5, z: bendZ * 0.45 },
      { x: bendX, y: 1, z: bendZ },
    ],
    0.016, 0.006, 3,
    C.grassCool, C.grassBase, C.grassShadow, C.grassShadow, 1
  );
  addLeaf(b, {
    x: bendX * 0.35, y: 0.3, z: bendZ * 0.35,
    yaw: 0.5 + rng() * 0.5, pitch: 0.85, length: 0.2, width: 0.08,
    arch: 0.24, fold: 0.008, segments: 2,
    sunBase: C.grassBase, sunTip: C.grassTip,
    shdBase: C.grassShadow, shdTip: C.grassCool,
    windBase: 0.3, windTip: 0.75, leafShape: true,
  });
  addLeaf(b, {
    x: bendX * 0.7, y: 0.58, z: bendZ * 0.7,
    yaw: 3.5 + rng() * 0.5, pitch: 0.95, length: 0.16, width: 0.07,
    arch: 0.24, fold: 0.008, segments: 2,
    sunBase: C.grassBase, sunTip: C.grassTip,
    shdBase: C.grassShadow, shdTip: C.grassCool,
    windBase: 0.5, windTip: 0.9, leafShape: true,
  });
  return normalizeToHeight(b.build());
}

// Five-petal wildflower head, authored at y = 1 so it sits on the stem top.
function buildFlowerHeadGeometry(color, C) {
  const b = new Builder();
  const cy = 1;
  const cx = 0.018;
  const cz = 0.01;
  const white = C.flowerWhite;
  const sky = C.ambientSky;

  // Saturated petals: only a whisper of white, or every drift turns cream.
  const sunPetal = scale3(color, 0.96, [0, 0, 0]);
  const sunTip = mix3(color, white, 0.15, [0, 0, 0]);
  const shdPetal = scale3(mix3(color, sky, 0.2, [0, 0, 0]), 0.38, [0, 0, 0]);
  const shdTip = scale3(mix3(color, sky, 0.1, [0, 0, 0]), 0.55, [0, 0, 0]);

  const cupR = 0.02;
  const midR = 0.056;
  const tipR = 0.105;
  const petals = 5;
  const center = b.vertex(cx, cy + 0.002, cz, 0, 1, 0, sunPetal, shdPetal, 0.98);

  for (let p = 0; p < petals; p++) {
    const aC = (p / petals) * TAU;
    const aL = aC - (TAU / petals) * 0.44;
    const aR = aC + (TAU / petals) * 0.44;

    let nx = Math.cos(aC) * 0.22;
    let ny = 1;
    let nz = Math.sin(aC) * 0.22;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;

    const v = (a, r, y, sun, shd, w) =>
      b.vertex(cx + Math.cos(a) * r, cy + y, cz + Math.sin(a) * r, nx, ny, nz, sun, shd, w);

    const cupL = v(aL, cupR, 0.004, sunPetal, shdPetal, 0.98);
    const cupM = v(aC, cupR * 0.92, 0.007, scale3(sunPetal, 0.95, [0, 0, 0]), scale3(shdPetal, 0.95, [0, 0, 0]), 0.985);
    const cupR2 = v(aR, cupR, 0.004, sunPetal, shdPetal, 0.98);

    const midL = v(aL, midR, 0.012, sunPetal, shdPetal, 0.99);
    const midM = v(aC, midR * 0.96, 0.01, sunTip, shdTip, 0.995);
    const midR2 = v(aR, midR, 0.012, sunPetal, shdPetal, 0.99);
    const tip = v(aC, tipR, 0.024, sunTip, shdTip, 1);

    b.tri(center, cupM, cupL);
    b.tri(center, cupR2, cupM);
    b.quad(cupL, cupM, midM, midL);
    b.quad(cupM, cupR2, midR2, midM);
    b.tri(midL, midM, tip);
    b.tri(midM, midR2, tip);
  }

  // Golden centre.
  const goldSun = C.flowerGold;
  const goldShd = scale3(mix3(C.flowerGold, sky, 0.3, [0, 0, 0]), 0.55, [0, 0, 0]);
  const apex = b.vertex(cx, cy + 0.02, cz, 0, 1, 0, goldSun, goldShd, 1);
  const ring = [];
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * TAU;
    ring.push(
      b.vertex(cx + Math.cos(a) * 0.014, cy + 0.008, cz + Math.sin(a) * 0.014, 0, 1, 0, goldSun, goldShd, 1)
    );
  }
  for (let p = 0; p < 5; p++) {
    b.tri(ring[p], ring[(p + 1) % 5], apex);
  }

  return b.build();
}

// Layered rosette shrub: three tiers of arching leaves plus a central tuft.
function buildShrubGeometry(variant, rng, C) {
  const b = new Builder();
  const tiers = [
    { y: 0, n: 7 + (variant % 2), pitchMin: 0.38, pitchMax: 0.72, lenMin: 0.62, lenMax: 0.9, widMin: 0.18, widMax: 0.24, k: 0.82 },
    { y: 0.2, n: 6, pitchMin: 0.7, pitchMax: 1.02, lenMin: 0.48, lenMax: 0.68, widMin: 0.15, widMax: 0.2, k: 0.94 },
    { y: 0.4, n: 5, pitchMin: 1, pitchMax: 1.35, lenMin: 0.32, lenMax: 0.48, widMin: 0.12, widMax: 0.16, k: 1.05 },
  ];
  for (const tier of tiers) {
    for (let i = 0; i < tier.n; i++) {
      const yaw = (i / tier.n) * TAU + rng() * 0.7;
      const pitch = lerp(tier.pitchMin, tier.pitchMax, rng());
      const length = lerp(tier.lenMin, tier.lenMax, rng());
      const width = lerp(tier.widMin, tier.widMax, rng());
      const k = tier.k * (0.94 + rng() * 0.12);
      const rim = Math.max(0, Math.cos(yaw)) * 0.4;
      addLeaf(b, {
        x: Math.cos(yaw) * 0.02,
        y: tier.y,
        z: Math.sin(yaw) * 0.02,
        yaw,
        pitch,
        length,
        width,
        arch: 0.28 + rng() * 0.12,
        fold: 0.014,
        segments: 3,
        sunBase: scale3(mix3(C.bushMid, C.bushDark, 0.38, [0, 0, 0]), k, [0, 0, 0]),
        sunTip: scale3(mix3(C.bushLight, C.bushMid, 0.4, [0, 0, 0]), k, [0, 0, 0]),
        shdBase: scale3(C.bushDark, k * 0.85, [0, 0, 0]),
        shdTip: scale3(mix3(C.bushDark, C.bushMid, 0.45, [0, 0, 0]), k, [0, 0, 0]),
        windBase: tier.y * 0.8,
        windTip: Math.min(1, tier.y * 0.8 + 0.25),
        rimMix: rim,
        rimColor: C.canopyRim,
      });
    }
  }
  for (let i = 0; i < 4; i++) {
    const yaw = rng() * TAU;
    addLeaf(b, {
      x: 0, y: 0.1, z: 0,
      yaw, pitch: 1.15, length: 0.35, width: 0.1,
      arch: 0.15, fold: 0.012, segments: 3,
      sunBase: mix3(C.bushMid, C.bushDark, 0.3, [0, 0, 0]),
      sunTip: mix3(C.bushLight, C.bushMid, 0.35, [0, 0, 0]),
      shdBase: C.bushDark,
      shdTip: mix3(C.bushDark, C.bushMid, 0.5, [0, 0, 0]),
      windBase: 0.2, windTip: 0.9,
    });
  }
  return normalizeToHeight(b.build());
}

function buildFernGeometry(rng, C) {
  const b = new Builder();
  for (let i = 0; i < 9; i++) {
    const yaw = (i / 9) * TAU + (rng() - 0.5) * 0.4;
    const pitch = 0.5 + rng() * 0.3;
    const length = 0.85 + rng() * 0.3;
    const rim = Math.max(0, Math.cos(yaw)) * 0.35;
    addLeaf(b, {
      x: Math.cos(yaw) * 0.03,
      y: 0.02,
      z: Math.sin(yaw) * 0.03,
      yaw,
      pitch,
      length,
      width: 0.16,
      arch: 0.55 + rng() * 0.15,
      fold: 0.02,
      segments: 4,
      sunBase: mix3(C.fern, C.bushMid, 0.3, [0, 0, 0]),
      sunTip: mix3(C.bushLight, C.canopyRim, 0.25, [0, 0, 0]),
      shdBase: C.bushDark,
      shdTip: mix3(C.bushDark, C.fern, 0.5, [0, 0, 0]),
      windBase: 0.05,
      windTip: 0.75,
      rimMix: rim,
      rimColor: C.canopyRim,
    });
  }
  for (let i = 0; i < 3; i++) {
    const yaw = rng() * TAU;
    addLeaf(b, {
      x: 0, y: 0.05, z: 0,
      yaw, pitch: 1.1, length: 0.5, width: 0.12,
      arch: 0.2, fold: 0.014, segments: 3,
      sunBase: mix3(C.fern, C.bushMid, 0.25, [0, 0, 0]),
      sunTip: C.bushLight,
      shdBase: C.bushDark,
      shdTip: mix3(C.bushDark, C.fern, 0.5, [0, 0, 0]),
      windBase: 0.15, windTip: 0.9,
    });
  }
  return normalizeToHeight(b.build());
}

// Broadleaf tree: tapered branching trunk + 4 tiers of flattened leaf-fan
// puffs (13 puffs, ~120 leaves). Canopy reads as layered leaf masses, never
// spheres: leaves point in every direction so the silhouette stays ragged.
function buildBroadleafGeometry(variant, rng, C) {
  const b = new Builder();
  const trunkTopY = 0.32 + rng() * 0.05;
  const leanX = (rng() - 0.5) * 0.05;
  const leanZ = (rng() - 0.5) * 0.05;

  // Bark: mid-brown, never the pale highlight (pale trunks read as birch).
  const barkSun = mix3(C.trunk, C.trunkDark, 0.18, [0, 0, 0]);
  const barkTip = mix3(C.trunk, C.trunkPale, 0.22, [0, 0, 0]);
  const barkShd = scale3(C.trunkDark, 0.88, [0, 0, 0]);
  const barkShdTip = mix3(C.trunkDark, C.trunk, 0.35, [0, 0, 0]);

  // Root flare.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rng() * 0.5;
    const rl = 0.055 + rng() * 0.04;
    addTube(
      b,
      [
        { x: 0, y: 0.05, z: 0 },
        { x: Math.cos(a) * rl * 0.6, y: 0.02, z: Math.sin(a) * rl * 0.6 },
        { x: Math.cos(a) * rl, y: -0.005, z: Math.sin(a) * rl },
      ],
      0.032, 0.005, 4,
      barkSun, barkTip, barkShd, barkShdTip, 0.9
    );
  }

  // Trunk.
  addTube(
    b,
    [
      { x: 0, y: 0, z: 0 },
      { x: leanX * 0.5, y: trunkTopY * 0.55, z: leanZ * 0.5 },
      { x: leanX, y: trunkTopY, z: leanZ },
    ],
    0.058, 0.028, 6,
    barkSun, barkTip, barkShd, barkShdTip, 0.9
  );

  // Main branches.
  const branchCount = 3 + (variant % 2);
  const branchTips = [];
  for (let i = 0; i < branchCount; i++) {
    const a = (i / branchCount) * TAU + rng() * 0.9;
    const y0 = trunkTopY * (0.5 + rng() * 0.32);
    const len = 0.16 + rng() * 0.1;
    const tipX = leanX + Math.cos(a) * len;
    const tipZ = leanZ + Math.sin(a) * len;
    const tipY = y0 + 0.2 + rng() * 0.12;
    addTube(
      b,
      [
        { x: leanX * 0.8, y: y0, z: leanZ * 0.8 },
        { x: (leanX * 0.8 + tipX) * 0.5 + (rng() - 0.5) * 0.03, y: (y0 + tipY) * 0.5, z: (leanZ * 0.8 + tipZ) * 0.5 },
        { x: tipX, y: tipY, z: tipZ },
      ],
      0.026, 0.007, 5,
      barkSun, barkTip, barkShd, barkShdTip, 0.9
    );
    branchTips.push({ x: tipX, y: tipY, z: tipZ });
  }

  // Twigs so the canopy never floats on nothing.
  for (let i = 0; i < 6; i++) {
    const t0 = branchTips[i % branchTips.length];
    const a = rng() * TAU;
    addTube(
      b,
      [
        { x: t0.x, y: t0.y, z: t0.z },
        { x: t0.x + Math.cos(a) * 0.06, y: t0.y + 0.1, z: t0.z + Math.sin(a) * 0.06 },
      ],
      0.008, 0.002, 3,
      barkSun, barkTip, barkShd, barkShdTip, 0.9
    );
  }

  // Canopy: 4 overlapping tiers. Lower tiers are wide, dark and drooping;
  // upper tiers tighten and lift, so the mass has a rounded, layered profile.
  const canopySunBase = mix3(C.canopyMid, C.canopyDark, 0.55, [0, 0, 0]);
  const canopySunTip = mix3(C.canopyLight, C.canopyMid, 0.55, [0, 0, 0]);
  const canopyShdBase = scale3(C.canopyDark, 0.82, [0, 0, 0]);
  const canopyShdTip = mix3(C.canopyDark, C.canopyMid, 0.35, [0, 0, 0]);

  const tiers = [
    { y: 0.42 + rng() * 0.03, puffs: 4, spread: 0.14, len: [0.19, 0.27], wid: [0.1, 0.15], pitch: [-0.3, 0.25], k: 0.78 },
    { y: 0.56 + rng() * 0.03, puffs: 4, spread: 0.13, len: [0.18, 0.26], wid: [0.1, 0.15], pitch: [0.1, 0.6], k: 0.9 },
    { y: 0.69 + rng() * 0.03, puffs: 3, spread: 0.1, len: [0.16, 0.24], wid: [0.09, 0.14], pitch: [0.35, 0.85], k: 1 },
    { y: 0.8 + rng() * 0.03, puffs: 2, spread: 0.07, len: [0.13, 0.2], wid: [0.08, 0.12], pitch: [0.6, 1.15], k: 1.08 },
  ];

  for (const tier of tiers) {
    for (let p = 0; p < tier.puffs; p++) {
      const a = (p / tier.puffs) * TAU + rng() * 1.4;
      const rr = tier.spread * (0.45 + rng() * 0.9);
      const cx = leanX + Math.cos(a) * rr;
      const cz = leanZ + Math.sin(a) * rr;
      const cy = tier.y + (rng() - 0.5) * 0.035;
      const leaves = 8 + Math.floor(rng() * 4);
      const windB = clamp01(cy * 0.95);
      const windT = clamp01((cy + 0.12) * 1);
      for (let l = 0; l < leaves; l++) {
        const yaw = (l / leaves) * TAU + rng() * 0.6;
        const pitch = lerp(tier.pitch[0], tier.pitch[1], rng());
        const length = lerp(tier.len[0], tier.len[1], rng());
        const width = lerp(tier.wid[0], tier.wid[1], rng());
        const k = tier.k * (0.94 + rng() * 0.12);
        const rim = Math.max(0, Math.cos(yaw)) * 0.12;
        addLeaf(b, {
          x: cx + Math.cos(yaw) * 0.02,
          y: cy + (rng() - 0.5) * 0.035,
          z: cz + Math.sin(yaw) * 0.02,
          yaw,
          pitch,
          length,
          width,
          arch: 0.18 + rng() * 0.14,
          fold: 0.018,
          segments: 3,
          sunBase: scale3(canopySunBase, k, [0, 0, 0]),
          sunTip: scale3(canopySunTip, k, [0, 0, 0]),
          shdBase: scale3(canopyShdBase, k, [0, 0, 0]),
          shdTip: scale3(canopyShdTip, k, [0, 0, 0]),
          windBase: windB,
          windTip: windT,
          rimMix: rim,
          rimColor: C.canopyRim,
        });
      }
    }
  }

  // Inner fill leaves: close the underside so the canopy is a mass, not a disc.
  for (let i = 0; i < 12; i++) {
    const yaw = rng() * TAU;
    const y = 0.46 + rng() * 0.3;
    const k = 0.82 + (y - 0.46) * 0.9;
    addLeaf(b, {
      x: leanX + (rng() - 0.5) * 0.1,
      y,
      z: leanZ + (rng() - 0.5) * 0.1,
      yaw,
      pitch: -0.25 + rng() * 0.75,
      length: 0.14 + rng() * 0.1,
      width: 0.09 + rng() * 0.05,
      arch: 0.2 + rng() * 0.12,
      fold: 0.016,
      segments: 3,
      sunBase: scale3(canopySunBase, k, [0, 0, 0]),
      sunTip: scale3(canopySunTip, k, [0, 0, 0]),
      shdBase: scale3(canopyShdBase, k, [0, 0, 0]),
      shdTip: scale3(canopyShdTip, k, [0, 0, 0]),
      windBase: clamp01(y * 0.95),
      windTip: clamp01((y + 0.12) * 1),
      rimMix: 0.15,
      rimColor: C.canopyRim,
    });
  }

  // Crown tuft.
  for (let i = 0; i < 5; i++) {
    const yaw = rng() * TAU;
    addLeaf(b, {
      x: leanX, y: 0.82 + rng() * 0.04, z: leanZ,
      yaw, pitch: 0.5 + rng() * 0.5, length: 0.15, width: 0.09,
      arch: 0.18, fold: 0.018, segments: 3,
      sunBase: scale3(mix3(C.canopyMid, C.canopyLight, 0.3, [0, 0, 0]), 1.04, [0, 0, 0]),
      sunTip: scale3(mix3(C.canopyRim, C.canopyLight, 0.4, [0, 0, 0]), 1.04, [0, 0, 0]),
      shdBase: C.canopyDark,
      shdTip: C.canopyMid,
      windBase: 0.82, windTip: 1,
      rimMix: 0.35, rimColor: C.canopyRim,
    });
  }

  return normalizeToHeight(b.build());
}

function buildConiferGeometry(rng, C) {
  const b = new Builder();
  const barkSun = mix3(C.trunk, C.trunkDark, 0.25, [0, 0, 0]);
  const barkTip = mix3(C.trunk, C.trunkPale, 0.2, [0, 0, 0]);
  const barkShd = scale3(C.trunkDark, 0.85, [0, 0, 0]);
  addTube(
    b,
    [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0.9, z: 0 }],
    0.036, 0.01, 5,
    barkSun, barkTip, barkShd, barkSun, 0.9
  );
  const tiers = 8;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = 0.12 + t * 0.78;
    const radius = 0.34 * (1 - t * 0.86) + 0.02;
    const leaves = 11 - (i > 5 ? 2 : 0);
    for (let l = 0; l < leaves; l++) {
      const yaw = (l / leaves) * TAU + i * 0.55 + rng() * 0.4;
      const length = radius * (0.95 + rng() * 0.3);
      const pitch = -0.08 + rng() * 0.22 + t * 0.12;
      const k = 0.86 + t * 0.26;
      const rim = Math.max(0, Math.cos(yaw)) * 0.32;
      addLeaf(b, {
        x: Math.cos(yaw) * 0.012,
        y,
        z: Math.sin(yaw) * 0.012,
        yaw,
        pitch,
        length,
        width: 0.07 + rng() * 0.04,
        arch: 0.22 + rng() * 0.1,
        fold: 0.01,
        segments: 3,
        sunBase: scale3(mix3(C.coniferDark, C.coniferLight, 0.25, [0, 0, 0]), k, [0, 0, 0]),
        sunTip: scale3(C.coniferLight, k, [0, 0, 0]),
        shdBase: scale3(C.coniferDark, 0.85, [0, 0, 0]),
        shdTip: scale3(mix3(C.coniferDark, C.coniferLight, 0.35, [0, 0, 0]), k, [0, 0, 0]),
        windBase: clamp01(y * 0.9),
        windTip: clamp01((y + 0.12) * 0.95),
        rimMix: rim,
        rimColor: C.canopyRim,
      });
    }
  }
  for (let i = 0; i < 3; i++) {
    const yaw = (i / 3) * TAU;
    addLeaf(b, {
      x: 0, y: 0.86, z: 0,
      yaw, pitch: 1.1 + rng() * 0.2, length: 0.14, width: 0.05,
      arch: 0.1, fold: 0.008, segments: 3,
      sunBase: mix3(C.coniferDark, C.coniferLight, 0.4, [0, 0, 0]),
      sunTip: C.coniferLight,
      shdBase: C.coniferDark,
      shdTip: mix3(C.coniferDark, C.coniferLight, 0.4, [0, 0, 0]),
      windBase: 0.9, windTip: 1,
      rimMix: 0.4, rimColor: C.canopyRim,
    });
  }
  return normalizeToHeight(b.build());
}

function buildCloverGeometry(rng, C) {
  const b = new Builder();
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * TAU + rng() * 0.5;
    addLeaf(b, {
      x: 0, y: 0.02, z: 0,
      yaw, pitch: 0.55 + rng() * 0.3, length: 0.2 + rng() * 0.06, width: 0.17 + rng() * 0.05,
      arch: 0.3, fold: 0.01, segments: 2,
      sunBase: mix3(C.moss, C.grassWarm, 0.35, [0, 0, 0]),
      sunTip: mix3(C.grassWarm, C.grassTip, 0.4, [0, 0, 0]),
      shdBase: C.grassShadow,
      shdTip: C.grassCool,
      windBase: 0.2, windTip: 0.7,
      leafShape: true,
    });
  }
  return normalizeToHeight(b.build());
}

function buildReedGeometry(rng, C) {
  const b = new Builder();
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * TAU + rng() * 0.6;
    addLeaf(b, {
      x: Math.cos(yaw) * 0.02, y: 0, z: Math.sin(yaw) * 0.02,
      yaw, pitch: 1.15 + rng() * 0.2, length: 1 + rng() * 0.2, width: 0.05 + rng() * 0.02,
      arch: 0.18 + rng() * 0.08, fold: 0.006, segments: 3,
      sunBase: mix3(C.grassCool, C.pathWet, 0.25, [0, 0, 0]),
      sunTip: mix3(C.grassTip, C.pathWet, 0.35, [0, 0, 0]),
      shdBase: C.grassShadow,
      shdTip: mix3(C.grassShadow, C.grassCool, 0.5, [0, 0, 0]),
      windBase: 0, windTip: 1,
      leafShape: false,
    });
  }
  addTube(
    b,
    [
      { x: 0, y: 0.95, z: 0 },
      { x: 0.01, y: 1.09, z: 0.005 },
      { x: 0.015, y: 1.21, z: 0.01 },
    ],
    0.032, 0.006, 4,
    C.pathWet, C.trunkPale, scale3(C.trunkDark, 0.9, [0, 0, 0]), C.pathWet, 1
  );
  return normalizeToHeight(b.build());
}

function buildPetalCardGeometry(color, C) {
  const b = new Builder();
  const sun = color;
  const shd = scale3(mix3(color, C.ambientSky, 0.3, [0, 0, 0]), 0.55, [0, 0, 0]);
  const bright = mix3(sun, C.flowerWhite, 0.15, [0, 0, 0]);
  const n = 6;
  const center = b.vertex(0, 0, 0, 0, 1, 0, sun, shd, 0);
  const ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const r = i % 2 === 0 ? 1 : 0.72;
    ring.push(b.vertex(Math.cos(a) * r, 0, Math.sin(a) * r, 0, 1, 0, bright, shd, 0));
  }
  for (let i = 0; i < n; i++) b.tri(center, ring[(i + 1) % n], ring[i]);
  return b.build();
}

/* ==========================================================================
   Foliage material — two-colour ramp, no lights, no PBR
   ========================================================================== */

const FOLIAGE_VERTEX = /* glsl */ `
attribute vec3 aSun;
attribute vec3 aShadow;
attribute float aWind;

uniform float uTime;
uniform float uWindStrength;
uniform float uSwayScale;

varying vec3 vSunColor;
varying vec3 vShadowColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vWind;

#include <fog_pars_vertex>

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec4 localPos = vec4(position, 1.0);
  vec3 localNormal = normal;
  vec2 instOrigin = vec2(0.0);
  float instScale = 1.0;
  mat3 instNormal = mat3(1.0);

  #ifdef USE_INSTANCING
    localPos = instanceMatrix * localPos;
    instOrigin = instanceMatrix[3].xz;
    instScale = length(instanceMatrix[1].xyz);
    instNormal = mat3(instanceMatrix);
  #endif

  vec4 worldPos = modelMatrix * localPos;

  // Wind: REF B's two waves + REF A's spatial per-instance phase.
  float hf = clamp(aWind, 0.0, 1.0);
  float w = pow(hf, 2.0) * 0.55;
  float t = uTime;
  float wave1 = sin(t * 2.1 + worldPos.x * 0.75 + worldPos.z * 0.55);
  float wave2 = cos(t * 3.4 - worldPos.x * 0.45 + worldPos.z * 0.95) * 0.35;
  float gust = (wave1 + wave2) * w * uWindStrength * uSwayScale * instScale;
  worldPos.x += gust * 0.14;
  worldPos.z += gust * 0.08;
  worldPos.y -= abs(gust) * 0.03;

  // Per-instance colour variation from a position hash (never instance colours).
  float h1 = hash21(instOrigin * 1.73 + 0.37);
  float h2 = hash21(instOrigin * 2.11 + 7.31);
  vSunColor = aSun * (0.92 + h1 * 0.16);
  vShadowColor = aShadow * (0.93 + h2 * 0.14);
  vWorldNormal = normalize(mat3(modelMatrix) * instNormal * localNormal);
  vWorldPos = worldPos.xyz;
  vWind = hf;

  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const FOLIAGE_FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform float uNormalSoftness;
uniform float uTranslucency;
uniform float uPetalRim;
uniform float uCanopy;
uniform float uWrap;

varying vec3 vSunColor;
varying vec3 vShadowColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying float vWind;

#include <fog_pars_fragment>

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 rawN = normalize(vWorldNormal);
  if (!gl_FrontFacing) rawN = -rawN;

  // Soft-upward normals: thin double-sided blades must never go black.
  vec3 upN = normalize(vec3(rawN.x * 0.35, 1.0, rawN.z * 0.35));
  vec3 N = normalize(mix(rawN, upN, uNormalSoftness));
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);

  float wrapLit = smoothstep(-uWrap, 0.55, dot(N, L));

  // Cheap canopy cookie: darken the woodland floor outside the meadow.
  if (uCanopy > 0.001) {
    float dist = length(vWorldPos.xz);
    float n = vnoise(vWorldPos.xz * 0.075 + 13.0);
    float canopy = smoothstep(0.50, 0.86, n) * smoothstep(26.0, 66.0, dist) * uCanopy;
    wrapLit *= 1.0 - canopy * 0.55;
  }

  vec3 ambient = mix(uGroundAmbient, uSkyAmbient, N.y * 0.5 + 0.5);
  vec3 col = mix(vShadowColor + ambient * 0.42, vSunColor * uSunColor, wrapLit);

  // Backlight translucency + warm fresnel rim.
  float backLight = pow(clamp(dot(V, -L + N * 0.35), 0.0, 1.0), 2.6);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.8);
  vec3 sss = mix(vSunColor, uSunColor, 0.45) * 1.06;
  col += sss * (backLight * 0.65 + rim * 0.48) * uTranslucency * 0.48;

  // Petals get an extra capped tip glow (never above 1.06x).
  col = mix(col, vSunColor * 1.06, uPetalRim * smoothstep(0.2, 0.95, vWind) * 0.35);

  // Soft highlight compression, same curve as the reference scenes.
  col = col / (1.0 + col * 0.14);

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/* ==========================================================================
   createMeadowFoliage
   ========================================================================== */

export function createMeadowFoliage(options = {}) {
  const {
    rng: injectedRng,
    heightAt = () => 0,
    pathDistance = () => 999,
    palette = MEADOW,
    quality = "high",
    seed = DEFAULT_SEED,
    sunDir: sunDirOption,
  } = options;

  const high = quality !== "low";
  const q = high ? 1 : 0.5;
  const rng = typeof injectedRng === "function" ? injectedRng : mulberry32(seed);
  const P = { ...MEADOW, ...palette };

  const C = {};
  for (const key of Object.keys(P)) {
    if (typeof P[key] === "number") C[key] = rgb(P[key]);
  }

  const group = new THREE.Group();
  group.name = "meadowFoliage";

  const stats = {
    instances: 0,
    drawCalls: 0,
    triangles: 0,
    trees: 0,
    grassClumps: 0,
    flowers: 0,
    shrubs: 0,
    groundCover: 0,
  };
  const colliders = [];

  /* ---------------- sun direction ---------------- */

  const sunDir = new THREE.Vector3();
  if (sunDirOption) {
    if (Array.isArray(sunDirOption)) {
      sunDir.set(sunDirOption[0], sunDirOption[1], sunDirOption[2]);
    } else {
      sunDir.copy(sunDirOption);
    }
  } else {
    // Keep the ramp coherent with the shared light rig in palette.js.
    const az = MEADOW_LIGHT.sunAzimuth;
    const el = MEADOW_LIGHT.sunElevation;
    sunDir.set(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az)
    );
  }
  sunDir.normalize();
  // Yaw that turns the baked canopy rim (local +X) toward the sun.
  const sunYaw = Math.atan2(-sunDir.z, sunDir.x);

  /* ---------------- placement helpers ---------------- */

  const inLake = (x, z, pad = 0) =>
    x > LAKE.minX - pad && x < LAKE.maxX + pad && z > LAKE.minZ - pad && z < LAKE.maxZ + pad;

  const groundY = (x, z) => {
    const y = heightAt(x, z);
    return Number.isFinite(y) ? y : 0;
  };

  const sampleAnnulus = (rMin, rMax) => {
    const a = rng() * TAU;
    const r = Math.sqrt(rMin * rMin + rng() * (rMax * rMax - rMin * rMin));
    return [Math.cos(a) * r, Math.sin(a) * r];
  };

  /* ---------------- geometry ---------------- */

  const grassGeos = [
    buildGrassGeometry(0, rng, C),
    buildGrassGeometry(1, rng, C),
    buildGrassGeometry(2, rng, C),
  ];
  const flowerStemGeo = buildFlowerStemGeometry(rng, C);
  const flowerPalette = [C.flowerPink, C.flowerCream, C.flowerLilac, C.flowerWhite];
  const flowerHeadGeos = flowerPalette.map((c) => buildFlowerHeadGeometry(c, C));
  const shrubGeos = [buildShrubGeometry(0, rng, C), buildShrubGeometry(1, rng, C)];
  const fernGeo = buildFernGeometry(rng, C);
  const treeGeos = [];
  for (let v = 0; v < 4; v++) treeGeos.push(buildBroadleafGeometry(v, rng, C));
  treeGeos.push(buildConiferGeometry(rng, C));
  const cloverGeo = buildCloverGeometry(rng, C);
  const reedGeo = buildReedGeometry(rng, C);
  const petalGeos = [
    buildPetalCardGeometry(C.flowerPink, C),
    buildPetalCardGeometry(C.flowerCream, C),
  ];

  /* ---------------- materials ---------------- */

  const sharedUniforms = {
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color(P.sun) },
    uSkyAmbient: { value: new THREE.Color(P.ambientSky) },
    uGroundAmbient: { value: new THREE.Color(P.ambientGround) },
    uTime: { value: 0 },
    uWindStrength: { value: 1 },
  };

  function makeFoliageMaterial(cfg) {
    const uniforms = {
      uSunDir: sharedUniforms.uSunDir,
      uSunColor: sharedUniforms.uSunColor,
      uSkyAmbient: sharedUniforms.uSkyAmbient,
      uGroundAmbient: sharedUniforms.uGroundAmbient,
      uTime: sharedUniforms.uTime,
      uWindStrength: sharedUniforms.uWindStrength,
      // Fog uniforms must exist on the material for the renderer to refresh
      // them; the built-in fog chunks pick them up when scene.fog is present.
      fogColor: { value: new THREE.Color(P.fog) },
      fogNear: { value: MEADOW_LIGHT.fogNear },
      fogFar: { value: MEADOW_LIGHT.fogFar },
      fogDensity: { value: 0.00025 },
      uNormalSoftness: { value: cfg.normalSoftness },
      uTranslucency: { value: cfg.translucency },
      uPetalRim: { value: cfg.petalRim },
      uSwayScale: { value: cfg.swayScale },
      uCanopy: { value: cfg.canopy },
      uWrap: { value: cfg.wrap ?? 0.35 },
    };
    const mat = new THREE.ShaderMaterial({
      name: cfg.name,
      uniforms,
      vertexShader: FOLIAGE_VERTEX,
      fragmentShader: FOLIAGE_FRAGMENT,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: true,
    });
    return mat;
  }

  const grassMat = makeFoliageMaterial({
    name: "meadowGrassMat",
    normalSoftness: 0.82, translucency: 0.45, petalRim: 0, swayScale: 1, canopy: 0.85,
  });
  const stemMat = makeFoliageMaterial({
    name: "meadowFlowerStemMat",
    normalSoftness: 0.82, translucency: 0.7, petalRim: 0, swayScale: 0.9, canopy: 0.35,
  });
  const headMat = makeFoliageMaterial({
    name: "meadowFlowerHeadMat",
    normalSoftness: 0.68, translucency: 0.7, petalRim: 1, swayScale: 0.9, canopy: 0.2,
  });
  const shrubMat = makeFoliageMaterial({
    name: "meadowShrubMat",
    normalSoftness: 0.66, translucency: 0.8, petalRim: 0, swayScale: 0.75, canopy: 0.55,
  });
  const fernMat = makeFoliageMaterial({
    name: "meadowFernMat",
    normalSoftness: 0.66, translucency: 0.8, petalRim: 0, swayScale: 0.65, canopy: 0.7,
  });
  const treeMat = makeFoliageMaterial({
    name: "meadowTreeMat",
    normalSoftness: 0.6, translucency: 0.4, petalRim: 0, swayScale: 0.34, canopy: 0,
  });
  const groundMat = makeFoliageMaterial({
    name: "meadowGroundCoverMat",
    normalSoftness: 0.78, translucency: 0.85, petalRim: 0, swayScale: 0.8, canopy: 0.5,
  });
  const petalMat = makeFoliageMaterial({
    name: "meadowPetalMat",
    normalSoftness: 0.5, translucency: 0.9, petalRim: 0, swayScale: 0, canopy: 0,
  });

  /* ---------------- instancing ---------------- */

  const tmpMatrix = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler();
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();

  function triCount(geo) {
    return geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  }

  function addInstanced(geo, mat, list, name, castShadow) {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.name = name;
    mesh.castShadow = high && !!castShadow;
    mesh.receiveShadow = false;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const sx = p.scaleXZ ?? p.scale ?? 1;
      const sy = p.scaleY ?? p.scale ?? 1;
      const sz = p.scaleZ ?? sx;
      tmpPos.set(p.x, p.y, p.z);
      tmpEuler.set(p.tiltX || 0, p.yaw || 0, p.tiltZ || 0, "YXZ");
      tmpQuat.setFromEuler(tmpEuler);
      tmpScale.set(sx, sy, sz);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    stats.drawCalls += 1;
    stats.instances += list.length;
    stats.triangles += triCount(geo) * list.length;
  }

  // Grass is split into spatial tiles so the frustum can cull whole chunks.
  function addGrassInstanced(geo, mat, list, name) {
    if (!list.length) return;
    const tiles = new Map();
    for (const p of list) {
      const tx = Math.floor((p.x + 100) / GRASS_TILE);
      const tz = Math.floor((p.z + 100) / GRASS_TILE);
      const key = `${tx}:${tz}`;
      let arr = tiles.get(key);
      if (!arr) tiles.set(key, (arr = []));
      arr.push(p);
    }
    for (const [key, arr] of tiles) {
      addInstanced(geo, mat, arr, `${name}:${key}`, false);
    }
  }

  /* ---------------- trees ---------------- */

  const treeLists = [[], [], [], [], []];
  const treePoints = [];

  function pickTreeVariant(coniferChance) {
    if (rng() < coniferChance) return 4;
    const r = rng();
    if (r < 0.32) return 0;
    if (r < 0.6) return 1;
    if (r < 0.84) return 2;
    return 3;
  }

  function addTree(variant, x, z, scale) {
    const y = groundY(x, z) - Math.min(0.22, scale * 0.025);
    treeLists[variant].push({
      x,
      y,
      z,
      yaw: sunYaw + (rng() - 0.5) * 0.9,
      scaleXZ: scale * (0.9 + rng() * 0.2),
      scaleY: scale,
    });
    treePoints.push({ x, z });
    stats.trees += 1;
    if (Math.abs(x) < PLAY_HALF - 1 && Math.abs(z) < PLAY_HALF - 1) {
      colliders.push({ x, z, radius: 0.5 + scale * 0.035 });
    }
  }

  // Feature compositions from the layout brief.
  addTree(0, 0, -38, 11.5);
  addTree(1, -7, -36.5, 9);
  addTree(1, 7.5, -37, 9.4);
  addTree(2, -40, -10, 10.5);
  addTree(0, -36.5, -14, 8.2);
  addTree(2, -42.5, -5.5, 8.6);
  addTree(3, 36, 24, 10.2);
  addTree(3, 32, 28.5, 8.4);
  addTree(0, 40.5, 20, 8.8);

  // Woodland wall: a rounded-square ring hugging the outside of the playable
  // square, so no tree can stand inside [-46, 46].
  const perimeterCount = Math.round(64 * q);
  for (let i = 0; i < perimeterCount; i++) {
    const a = (i / perimeterCount) * TAU + (rng() - 0.5) * 0.16;
    const m = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const base = (PLAY_HALF + 2.5) / m;
    const r = base + rng() * 24;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inLake(x, z, 8)) continue;
    addTree(pickTreeVariant(0.16), x, z, 6.5 + rng() * 4.5);
  }

  // Distant silhouette ring.
  const distantCount = Math.round(20 * q);
  for (let i = 0; i < distantCount; i++) {
    const a = (i / distantCount) * TAU + rng() * 0.22;
    const r = 82 + rng() * 32;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inLake(x, z, 10)) continue;
    addTree(pickTreeVariant(0.24), x, z, 8 + rng() * 4);
  }

  // Interior pockets near the square edges, never in the central meadow.
  const pocketTarget = Math.round(12 * q);
  let pockets = 0;
  for (let attempt = 0; attempt < 1400 && pockets < pocketTarget; attempt++) {
    const x = -PLAY_HALF + 2 + rng() * (PLAY_HALF * 2 - 4);
    const z = -PLAY_HALF + 2 + rng() * (PLAY_HALF * 2 - 4);
    const edge = Math.min(PLAY_HALF - Math.abs(x), PLAY_HALF - Math.abs(z));
    if (edge > 13 || edge < 2.5) continue;
    if (Math.hypot(x, z) < 23) continue;
    if (pathDistance(x, z) < 5.5) continue;
    if (inLake(x, z, 4)) continue;
    addTree(pickTreeVariant(0.1), x, z, 6.5 + rng() * 3.5);
    pockets += 1;
  }

  /* ---------------- shrubs + ferns ---------------- */

  const shrubAList = [];
  const shrubBList = [];
  const fernList = [];

  const nearTree = (x, z, rad) => {
    for (let i = 0; i < treePoints.length; i++) {
      const t = treePoints[i];
      if (Math.hypot(x - t.x, z - t.z) < rad) return true;
    }
    return false;
  };

  function placeShrubs(list, target, minScale, maxScale) {
    let placed = 0;
    let attempts = 0;
    while (placed < target && attempts < target * 40) {
      attempts++;
      const [x, z] = sampleAnnulus(20, 72);
      if (inLake(x, z, 3)) continue;
      const pd = pathDistance(x, z);
      if (pd < 1.6) continue;
      const perim = Math.max(Math.abs(x), Math.abs(z)) > 34;
      const shoulder = pd < 8;
      const shade = nearTree(x, z, 9);
      if (!shoulder && !shade && !perim && rng() > 0.4) continue;
      if (!shoulder && !shade && rng() > 0.55) continue;
      const s = minScale + rng() * (maxScale - minScale);
      list.push({
        x,
        y: groundY(x, z) - 0.05,
        z,
        yaw: rng() * TAU,
        tiltX: (rng() - 0.5) * 0.08,
        tiltZ: (rng() - 0.5) * 0.08,
        scaleXZ: s * (0.9 + rng() * 0.2),
        scaleY: s,
      });
      placed += 1;
    }
  }

  placeShrubs(shrubAList, Math.round(140 * q), 0.7, 1.7);
  placeShrubs(shrubBList, Math.round(90 * q), 0.65, 1.5);

  const fernTarget = Math.round(60 * q);
  let ferns = 0;
  for (let attempt = 0; attempt < fernTarget * 60 && ferns < fernTarget; attempt++) {
    const [x, z] = sampleAnnulus(18, 70);
    if (inLake(x, z, 3)) continue;
    if (pathDistance(x, z) < 1.8) continue;
    if (!nearTree(x, z, 8) && Math.max(Math.abs(x), Math.abs(z)) < 34) continue;
    const s = 0.6 + rng() * 0.6;
    fernList.push({
      x,
      y: groundY(x, z) - 0.04,
      z,
      yaw: rng() * TAU,
      tiltX: (rng() - 0.5) * 0.1,
      tiltZ: (rng() - 0.5) * 0.1,
      scaleXZ: s * (0.9 + rng() * 0.2),
      scaleY: s,
    });
    ferns += 1;
  }
  stats.shrubs = shrubAList.length + shrubBList.length + fernList.length;

  /* ---------------- grass ---------------- */

  const grassLists = [[], [], []];

  function pushGrass(variant, x, z, height) {
    const clump = fbm2(x * 0.25 + 6, z * 0.25 - 4, 3);
    let widthK = 0.85 + rng() * 0.32;
    let heightK = 0.92 + rng() * 0.16;
    if (clump > 0.52) {
      widthK *= 1.25;
      heightK *= 1.35;
    }
    grassLists[variant].push({
      x,
      y: groundY(x, z) - 0.01,
      z,
      yaw: rng() * TAU,
      tiltX: (rng() - 0.5) * 0.18,
      tiltZ: (rng() - 0.5) * 0.18,
      scaleXZ: height * widthK,
      scaleY: height * heightK,
    });
    stats.grassClumps += 1;
  }

  // 1. Short meadow turf inside the clearing (tall only on path shoulders).
  const shortTarget = Math.round(5800 * q);
  let shortPlaced = 0;
  for (let attempt = 0; attempt < shortTarget * 5 && shortPlaced < shortTarget; attempt++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * 24;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inLake(x, z, 2)) continue;
    const pd = pathDistance(x, z);
    if (pd < 1.15) continue;
    const variant = rng() < 0.5 ? 0 : 1;
    let h;
    if (pd < 3.6 && rng() < 0.65) h = 0.42 + rng() * 0.38;
    else h = 0.1 + rng() * 0.15;
    pushGrass(variant, x, z, h);
    shortPlaced += 1;
  }

  // 2. Mid ring: verges and path shoulders.
  const midTarget = Math.round(4800 * q);
  let midPlaced = 0;
  for (let attempt = 0; attempt < midTarget * 7 && midPlaced < midTarget; attempt++) {
    const [x, z] = sampleAnnulus(22, 48);
    if (inLake(x, z, 2)) continue;
    const pd = pathDistance(x, z);
    if (pd < 1.15) continue;
    const perim = Math.max(Math.abs(x), Math.abs(z)) > 38;
    const nearPath = pd < 6.5;
    if (!nearPath && !perim && rng() > 0.5) continue;
    let h;
    if (nearPath) h = 0.45 + rng() * 0.5;
    else if (perim) h = 0.4 + rng() * 0.45;
    else h = 0.26 + rng() * 0.3;
    pushGrass(rng() < 0.5 ? 0 : 1, x, z, h);
    midPlaced += 1;
  }

  // 3. Outer woodland floor (cheap far tuft).
  const outerTarget = Math.round(4000 * q);
  let outerPlaced = 0;
  for (let attempt = 0; attempt < outerTarget * 5 && outerPlaced < outerTarget; attempt++) {
    const [x, z] = sampleAnnulus(44, 96);
    if (inLake(x, z, 2)) continue;
    if (pathDistance(x, z) < 1.15) continue;
    const perim = Math.max(Math.abs(x), Math.abs(z)) > 44;
    if (!perim && rng() > 0.6) continue;
    pushGrass(2, x, z, 0.32 + rng() * 0.5);
    outerPlaced += 1;
  }

  // 4. Scruff: a thin line of small tufts softening the bare path edge.
  const scruffTarget = Math.round(600 * q);
  let scruffPlaced = 0;
  for (let attempt = 0; attempt < scruffTarget * 30 && scruffPlaced < scruffTarget; attempt++) {
    const [x, z] = sampleAnnulus(0, 44);
    if (inLake(x, z, 2)) continue;
    const pd = pathDistance(x, z);
    if (pd < 0.3 || pd > 1.6) continue;
    pushGrass(rng() < 0.5 ? 0 : 1, x, z, 0.14 + rng() * 0.3);
    scruffPlaced += 1;
  }

  /* ---------------- wildflowers (drifts) ---------------- */

  const flowerLists = [[], [], [], []];
  const flowerStems = [];

  const driftDefs = [
    { x: 6.5, z: 5, r: 4.2, c: 0 },
    { x: -8.5, z: 7.5, r: 3.6, c: 2 },
    { x: 12, z: -7, r: 4.4, c: 1 },
    { x: -13, z: -3, r: 3.8, c: 3 },
    { x: 2, z: -13, r: 3.2, c: 0 },
    { x: 15, z: 13, r: 3.4, c: 2 },
  ];
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU;
    const r = 14 + Math.sqrt(rng()) * 26;
    driftDefs.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      r: 2.2 + rng() * 3.4,
      c: i % 4,
    });
  }

  let driftWeight = 0;
  for (const d of driftDefs) driftWeight += d.r * d.r;
  const flowerTarget = Math.round(2200 * q);
  for (const d of driftDefs) {
    const count = Math.max(20, Math.round((flowerTarget * d.r * d.r) / driftWeight));
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 8) {
      attempts++;
      const a = rng() * TAU;
      const rr = d.r * Math.pow(rng(), 0.55);
      const x = d.x + Math.cos(a) * rr;
      const z = d.z + Math.sin(a) * rr;
      if (inLake(x, z, 1.5)) continue;
      if (pathDistance(x, z) < 0.7) continue;
      const h = 0.2 + rng() * 0.3;
      const item = {
        x,
        y: groundY(x, z) - 0.01,
        z,
        yaw: rng() * TAU,
        tiltX: (rng() - 0.5) * 0.12,
        tiltZ: (rng() - 0.5) * 0.12,
        scaleXZ: h * (0.9 + rng() * 0.25),
        scaleY: h * (0.92 + rng() * 0.16),
      };
      flowerLists[d.c].push(item);
      flowerStems.push(item);
      stats.flowers += 1;
      placed += 1;
    }
  }

  /* ---------------- ground cover ---------------- */

  const cloverList = [];
  for (let p = 0; p < 12; p++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * 24;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    for (let i = 0; i < Math.round(26 * q); i++) {
      const aa = rng() * TAU;
      const rr = Math.sqrt(rng()) * 1.6;
      const x = cx + Math.cos(aa) * rr;
      const z = cz + Math.sin(aa) * rr;
      if (inLake(x, z, 1)) continue;
      if (pathDistance(x, z) < 0.9) continue;
      const s = 0.18 + rng() * 0.16;
      cloverList.push({
        x,
        y: groundY(x, z) - 0.005,
        z,
        yaw: rng() * TAU,
        scaleXZ: s,
        scaleY: s * (0.8 + rng() * 0.4),
      });
    }
  }

  const reedList = [];
  const reedTarget = Math.round(240 * q);
  for (let i = 0; i < reedTarget; i++) {
    const t = rng();
    const z = -25 + t * 43 + (rng() - 0.5) * 2;
    const x = -50.2 + rng() * 2.6;
    const y = Math.max(groundY(x, z), LAKE.level - 0.05);
    const s = 0.7 + rng() * 0.6;
    reedList.push({
      x,
      y: y - 0.05,
      z,
      yaw: rng() * TAU,
      tiltX: (rng() - 0.5) * 0.15,
      tiltZ: (rng() - 0.5) * 0.15,
      scaleXZ: s * (0.8 + rng() * 0.2),
      scaleY: s,
    });
  }

  const petalLists = [[], []];
  const petalSpots = [
    { x: 0, z: -38, r: 5 },
    { x: -40, z: -10, r: 4 },
    { x: 36, z: 24, r: 4 },
    { x: 6.5, z: 5, r: 3 },
    { x: -8.5, z: 7.5, r: 3 },
    { x: 12, z: -7, r: 3 },
    { x: -13, z: -3, r: 2.5 },
  ];
  for (const spot of petalSpots) {
    const n = Math.round(50 * q);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      const rr = Math.sqrt(rng()) * spot.r;
      const x = spot.x + Math.cos(a) * rr;
      const z = spot.z + Math.sin(a) * rr;
      if (inLake(x, z, 1)) continue;
      const s = 0.05 + rng() * 0.08;
      petalLists[rng() < 0.65 ? 0 : 1].push({
        x,
        y: groundY(x, z) + 0.02,
        z,
        yaw: rng() * TAU,
        scaleXZ: s,
        scaleY: s,
      });
    }
  }
  stats.groundCover = cloverList.length + reedList.length + petalLists[0].length + petalLists[1].length;

  /* ---------------- build batches ---------------- */

  for (let v = 0; v < 3; v++) {
    addGrassInstanced(grassGeos[v], grassMat, grassLists[v], `meadowGrass${v}`);
  }
  addInstanced(flowerStemGeo, stemMat, flowerStems, "meadowFlowerStems", false);
  for (let v = 0; v < 4; v++) {
    addInstanced(flowerHeadGeos[v], headMat, flowerLists[v], `meadowFlowerHeads${v}`, false);
  }
  addInstanced(shrubGeos[0], shrubMat, shrubAList, "meadowShrubA", true);
  addInstanced(shrubGeos[1], shrubMat, shrubBList, "meadowShrubB", true);
  addInstanced(fernGeo, fernMat, fernList, "meadowFerns", false);
  for (let v = 0; v < 5; v++) {
    addInstanced(treeGeos[v], treeMat, treeLists[v], `meadowTrees${v}`, true);
  }
  addInstanced(cloverGeo, groundMat, cloverList, "meadowClover", false);
  addInstanced(reedGeo, groundMat, reedList, "meadowReeds", false);
  addInstanced(petalGeos[0], petalMat, petalLists[0], "meadowPetalsPink", false);
  addInstanced(petalGeos[1], petalMat, petalLists[1], "meadowPetalsCream", false);

  /* ---------------- animation ---------------- */

  function update(elapsed, dt) {
    const t = Number.isFinite(elapsed) ? elapsed : 0;
    sharedUniforms.uTime.value = t;
    // A slow breathing gust on top of the two in-shader waves.
    sharedUniforms.uWindStrength.value =
      0.9 + 0.2 * Math.sin(t * 0.37) + 0.08 * Math.sin(t * 0.93 + 1.7);
  }

  update(0, 0);

  return { group, update, colliders, stats };
}
