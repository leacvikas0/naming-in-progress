// ============================================================================
// world/assets/vfx/ultimate-vfx.js
//
// Shared cinematic language for all three ultimates (Knight Q Sky-Lightning
// Awakening, Couples Sun & Tide Eclipse, Mage Q Storm Cataclysm):
//   storm halo descends -> ground sigil inks itself -> thick opaque column
//   strikes -> crack shockwave + crest wall + ink splash + sparks/petals.
//
// Contract: <= 6 InstancedMeshes while active, 0 draw calls idle.
//   1. boltMesh   - jagged opaque cel tubes (white HDR core / body / ink rim)
//   2. discMesh   - ground sigil (mode 0) or crack shockwave + ink splash (mode 1)
//   3. crestMesh  - open cylinder shockwave crest wall
//   4. cloudMesh  - storm-halo cloud puffs, undersides lit by strikes
//   5. petalMesh  - ivory lotus / crimson rose petals (couples bloom)
//   6. sparkMesh  - stretched octahedron sparks / embers
// All materials: transparent:false, depthWrite:true, hard discard cutouts.
// Records are pooled; per-frame update allocates nothing.
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
function smoothstep(a, b, x) {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function outQuint(t) {
  const u = 1 - saturate(t);
  return 1 - u * u * u * u * u;
}
function hash11(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

// Palette rows: core (HDR-boosted in shader), body, deep, ink.
export const ULTIMATE_PALETTES = Object.freeze({
  rime: { idx: 0, core: '#f4feff', body: '#4fb3f2', deep: '#16508f', ink: '#0a1f3a' },
  solar: { idx: 1, core: '#fff2b0', body: '#ff7a14', deep: '#c42008', ink: '#1f0b05' },
  tempest: { idx: 2, core: '#fff6cc', body: '#b38cf5', deep: '#4c1d95', ink: '#110720' },
  couples: { idx: 3, core: '#fff8e6', body: '#f2c14e', deep: '#c0163a', ink: '#1c0a12' },
  eclipse: { idx: 4, core: '#fffaf0', body: '#ffae3a', deep: '#2a4f9e', ink: '#140c1e' },
  ivory: { idx: 5, core: '#ffffff', body: '#ffe3a0', deep: '#c8961a', ink: '#24170a' },
  rose: { idx: 6, core: '#fff1f2', body: '#ff4d6d', deep: '#9f1239', ink: '#1f0710' },
});
const PAL_KEYS = ['rime', 'solar', 'tempest', 'couples', 'eclipse', 'ivory', 'rose'];

function palIndex(style) {
  const s = String(style || '').toLowerCase();
  if (ULTIMATE_PALETTES[s]) return ULTIMATE_PALETTES[s].idx;
  if (s === 'fire' || s === 'sunfire' || s === 'hinokami') return 1;
  if (s === 'ice' || s === 'frost' || s === 'glacial') return 0;
  if (s === 'storm' || s === 'thunderclap' || s === 'wisteria') return 2;
  return 2;
}

const MAX_BOLTS = 16;
const MAX_DISCS = 8;
const MAX_CRESTS = 6;
const MAX_HALOS = 2;
const PUFFS_PER_HALO = 26;
const EYE_PUFFS = 4;
const MAX_PUFFS = MAX_HALOS * PUFFS_PER_HALO;
const MAX_PETALS = 48;
const MAX_SPARKS = 72;
const MAX_SPARK_BURSTS = 8;
const MAX_BLOOMS = 1;

/* ---------------------------- geometries --------------------------------- */

function createBoltTubeGeometry(segments = 22, sides = 6) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  for (let s = 0; s <= segments; s++) {
    const y = s / segments;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU;
      const c = Math.cos(a);
      const n = Math.sin(a);
      pos.push(c, y, n);
      nrm.push(c, 0, n);
      uv.push(k / sides, y);
    }
  }
  const row = sides + 1;
  for (let s = 0; s < segments; s++) {
    for (let k = 0; k < sides; k++) {
      const a = s * row + k;
      const b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function createUltimatePetalGeometry(rows = 8, cols = 6) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const half = 0.42 * Math.sin(Math.PI * Math.pow(v, 0.78)) + 0.02;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const x = (u * 2 - 1) * half;
      const z = 0.22 * v * v - 0.5 * x * x;
      pos.push(x, v, z);
      uv.push(u, v);
    }
  }
  const row = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * row + c;
      idx.push(a, a + row, a + 1, a + row, a + row + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------- materials ---------------------------------- */

const GLSL_COMMON = /* glsl */ `
  uniform vec3 uCore[7];
  uniform vec3 uBody[7];
  uniform vec3 uDeep[7];
  uniform vec3 uInk[7];
  uniform float uCoreBoost;
  float h11(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
`;

function paletteUniforms() {
  const mk = (key) => PAL_KEYS.map((k) => new THREE.Color(ULTIMATE_PALETTES[k][key]));
  return {
    uCore: { value: mk('core') },
    uBody: { value: mk('body') },
    uDeep: { value: mk('deep') },
    uInk: { value: mk('ink') },
    uCoreBoost: { value: 4.2 },
  };
}

function baseMaterial(name, shared, extraUniforms, vertexShader, fragmentShader, side = THREE.FrontSide) {
  return new THREE.ShaderMaterial({
    name,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side,
    uniforms: { ...shared, ...extraUniforms },
    vertexShader,
    fragmentShader,
  });
}

function createBoltMaterial(shared) {
  return baseMaterial(
    'UltimateVfx_BoltMaterial',
    shared,
    {},
    /* glsl */ `
      ${GLSL_COMMON}
      uniform float uTime;
      attribute vec4 aBoltA; // seed, palette, reveal, fade
      attribute vec4 aBoltB; // jag amplitude (m), radius (m), ascend flag, flash
      varying float vT;
      varying vec3 vN;
      varying vec3 vW;
      varying vec4 vA;
      varying vec4 vB;
      void main() {
        float t = position.y;
        vec3 base = (instanceMatrix * vec4(0.0, t, 0.0, 1.0)).xyz;
        vec3 ax = normalize(instanceMatrix[0].xyz);
        vec3 az = normalize(instanceMatrix[2].xyz);
        float flick = floor(uTime * 15.0);
        float s = aBoltA.x * 13.0 + flick * 3.17;
        float k = t * 9.0;
        float i0 = floor(k);
        float f = fract(k);
        vec2 j0 = vec2(h11(i0 + s), h11(i0 + s + 7.7)) - 0.5;
        vec2 j1 = vec2(h11(i0 + 1.0 + s), h11(i0 + 1.0 + s + 7.7)) - 0.5;
        float k2 = t * 23.0;
        float i2 = floor(k2);
        vec2 m0 = vec2(h11(i2 + s * 1.3), h11(i2 + s * 1.3 + 3.1)) - 0.5;
        vec2 m1 = vec2(h11(i2 + 1.0 + s * 1.3), h11(i2 + 1.0 + s * 1.3 + 3.1)) - 0.5;
        float pin = pow(sin(3.14159 * clamp(t, 0.0, 1.0)), 0.55);
        vec2 jag = (mix(j0, j1, f) * 2.0 + mix(m0, m1, fract(k2)) * 0.55) * aBoltB.x * pin;
        // fat at both ends (cloud root / impact), knotted along the shaft
        float r = aBoltB.y * (0.62 + 0.38 * smoothstep(0.75, 1.0, t) + 0.55 * smoothstep(0.08, 0.0, t));
        r *= 0.85 + 0.3 * h11(i2 + s);
        vec3 world = base + ax * (jag.x + position.x * r) + az * (jag.y + position.z * r);
        vN = normalize(ax * normal.x + az * normal.z);
        vW = world;
        vT = t;
        vA = aBoltA;
        vB = aBoltB;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    /* glsl */ `
      ${GLSL_COMMON}
      uniform sampler2D uNoise;
      varying float vT;
      varying vec3 vN;
      varying vec3 vW;
      varying vec4 vA;
      varying vec4 vB;
      void main() {
        float reveal = vA.z;
        bool ascend = vB.z > 0.5;
        float front = ascend ? reveal : 1.0 - reveal;
        if (ascend ? vT > front : vT < front) discard;
        float n = texture2D(uNoise, vec2(vT * 2.3 + vA.x, vA.x * 0.37)).b;
        if (n < vA.w * 1.15) discard;
        int p = int(vA.y + 0.5);
        vec3 V = normalize(cameraPosition - vW);
        float ndv = abs(dot(normalize(vN), V));
        float flash = vB.w;
        float lead = smoothstep(0.10, 0.0, abs(vT - front));
        vec3 col = uInk[p];
        if (ndv > 0.20) col = uDeep[p] * 1.25;
        if (ndv > 0.36) col = uBody[p] * (1.6 + flash);
        if (ndv > 0.58 - lead * 0.3) col = uCore[p] * (uCoreBoost + flash * 2.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  );
}

function createDiscMaterial(shared) {
  const mat = baseMaterial(
    'UltimateVfx_GroundDiscMaterial',
    shared,
    {},
    /* glsl */ `
      attribute vec4 aDiscA; // mode, palette, age01, seed
      attribute vec4 aDiscB; // reveal, fade, spin, _
      varying vec2 vP;
      varying vec4 vA;
      varying vec4 vB;
      void main() {
        vP = position.xz;
        vA = aDiscA;
        vB = aDiscB;
        gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      ${GLSL_COMMON}
      uniform sampler2D uNoise;
      varying vec2 vP;
      varying vec4 vA;
      varying vec4 vB;
      const float PI = 3.14159265;
      float band(float x, float c, float w) { return step(abs(x - c), w); }
      void main() {
        int p = int(vA.y + 0.5);
        float r = length(vP);
        if (r > 1.0) discard;
        float ang = atan(vP.y, vP.x);
        float fade = vB.y;
        float n = texture2D(uNoise, vP * 0.9 + vec2(vA.w * 0.13, vA.w * 0.29)).b;
        if (n < fade * 1.1) discard;
        vec3 col;
        if (vA.x < 0.5) {
          // Lotus mandala sigil, inked outlines + HDR gold channels, drawn by angular sweep.
          float a01 = fract((ang + PI) / (2.0 * PI));
          if (a01 > vB.x) discard;
          float a = ang + vB.z;
          float ink = 0.0;
          float gold = 0.0;
          ink = max(ink, band(r, 0.94, 0.040));
          gold = max(gold, band(r, 0.94, 0.016));
          ink = max(ink, band(r, 0.80, 0.020));
          gold = max(gold, band(r, 0.80, 0.007));
          ink = max(ink, band(r, 0.26, 0.026));
          gold = max(gold, band(r, 0.26, 0.010));
          float seg = 2.0 * PI / 8.0;
          float pa = mod(a, seg) - seg * 0.5;
          float pr = (r - 0.27) / 0.52;
          if (pr > 0.0 && pr < 1.0) {
            float hw = 0.36 * pow(sin(pr * PI * 0.92 + 0.08), 0.8) * (1.0 - pr * 0.35);
            float e = abs(pa) / max(hw, 0.001);
            ink = max(ink, band(e, 1.0, 0.16));
            gold = max(gold, band(e, 1.0, 0.065));
            float rib = abs(pa) * r;
            ink = max(ink, step(rib, 0.008) * step(pr, 0.82));
          }
          // offset outer petals
          float pb = mod(a + seg * 0.5, seg) - seg * 0.5;
          float qr = (r - 0.55) / 0.36;
          if (qr > 0.0 && qr < 1.0) {
            float hw2 = 0.26 * sin(qr * PI);
            float e2 = abs(pb) / max(hw2, 0.001);
            ink = max(ink, band(e2, 1.0, 0.20));
            gold = max(gold, band(e2, 1.0, 0.08));
          }
          float bead = mod(a, seg * 0.5) - seg * 0.25;
          float bd = length(vec2(bead * 0.87, r - 0.87));
          ink = max(ink, step(bd, 0.035));
          gold = max(gold, step(bd, 0.018));
          ink = max(ink, step(r, 0.10));
          gold = max(gold, step(r, 0.06));
          if (ink < 0.5) discard;
          col = gold > 0.5 ? uBody[p] * 2.2 + uCore[p] * 0.6 * step(r, 0.06) : uInk[p];
        } else {
          // Crack shockwave ring + radial cracks + central ink splash.
          float age = vA.z;
          float R = 0.08 + 0.9 * (1.0 - pow(1.0 - clamp(age * 1.7, 0.0, 1.0), 4.0));
          float w = mix(0.075, 0.025, age);
          float d = abs(r - R);
          float hit = 0.0;
          col = uInk[p];
          if (d < w + 0.03) {
            float edgeN = texture2D(uNoise, vec2(ang * 1.3, R * 2.0)).r;
            if (d < w + 0.03 * edgeN) hit = 1.0;
            if (d < w) col = uBody[p] * 1.8;
            if (d < w * 0.42) col = uCore[p] * uCoreBoost;
          }
          if (hit < 0.5) {
            float crackLen = min(R * 1.04, 0.97);
            for (int i = 0; i < 11; i++) {
              float fi = float(i);
              float ca = fi / 11.0 * 2.0 * PI + (h11(fi + vA.w) - 0.5) * 0.45;
              float lenI = crackLen * (0.55 + 0.45 * h11(fi * 3.1 + vA.w));
              float wig = sin(r * 21.0 + fi * 4.0) * 0.045 + sin(r * 53.0 + fi) * 0.015;
              float da = abs(mod(ang - ca - wig + PI, 2.0 * PI) - PI) * r;
              float cw = 0.014 * (1.0 - r / max(lenI, 0.01)) + 0.003;
              if (r < lenI && da < cw + 0.012) {
                hit = 1.0;
                col = da < cw ? uBody[p] * (1.5 + 1.5 * (1.0 - age)) : uInk[p];
              }
            }
          }
          if (hit < 0.5) {
            // sumi ink splash: blot + flung droplets
            float blot = texture2D(uNoise, vP * 1.6 + vec2(vA.w)).b;
            float splashR = 0.20 + 0.10 * blot;
            if (r < splashR * min(1.0, age * 6.0 + 0.3)) hit = 1.0;
            float drop = texture2D(uNoise, vP * 3.1 + vec2(vA.w * 0.7)).a;
            if (r > 0.22 && r < 0.62 && drop > 0.86) hit = 1.0;
            col = uInk[p];
          }
          if (hit < 0.5) discard;
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `
  );
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -4;
  return mat;
}

function createCrestMaterial(shared) {
  return baseMaterial(
    'UltimateVfx_CrestWallMaterial',
    shared,
    {},
    /* glsl */ `
      attribute vec4 aCrestA; // palette, age01, seed, fade
      varying vec2 vUv;
      varying vec4 vA;
      void main() {
        vUv = uv;
        vA = aCrestA;
        gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      ${GLSL_COMMON}
      uniform sampler2D uNoise;
      varying vec2 vUv;
      varying vec4 vA;
      void main() {
        int p = int(vA.x + 0.5);
        float n = texture2D(uNoise, vec2(vUv.x * 5.0 + vA.z, 0.31)).b;
        float n2 = texture2D(uNoise, vec2(vUv.x * 13.0 + vA.z, vUv.y * 0.5)).g;
        float crest = 0.35 + 0.65 * pow(n, 1.3) + 0.12 * n2;
        if (vUv.y > crest) discard;
        float er = texture2D(uNoise, vec2(vUv.x * 7.0, vUv.y * 1.3 + vA.z)).b;
        if (er < vA.w * 1.1) discard;
        float topD = crest - vUv.y;
        vec3 col = uDeep[p] * 1.1;
        if (topD < 0.36) col = uBody[p] * 1.7;
        if (topD < 0.12) col = uCore[p] * uCoreBoost * 0.8;
        if (topD < 0.035 || vUv.y < 0.06) col = uInk[p];
        if (topD > 0.36 && topD < 0.42) col = uInk[p];
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    THREE.DoubleSide
  );
}

function createCloudMaterial(shared) {
  return baseMaterial(
    'UltimateVfx_StormCloudMaterial',
    shared,
    {
      uCloudDark: { value: new THREE.Color('#151026') },
      uCloudMid: { value: new THREE.Color('#3b3160') },
    },
    /* glsl */ `
      attribute vec4 aCloudA; // palette, flash, fade, seed
      varying vec3 vN;
      varying vec3 vW;
      varying vec4 vA;
      varying vec3 vL;
      void main() {
        vA = aCloudA;
        vL = position;
        vec4 w = instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    /* glsl */ `
      ${GLSL_COMMON}
      uniform sampler2D uNoise;
      uniform vec3 uCloudDark;
      uniform vec3 uCloudMid;
      varying vec3 vN;
      varying vec3 vW;
      varying vec4 vA;
      varying vec3 vL;
      void main() {
        int p = int(vA.x + 0.5);
        float n = texture2D(uNoise, vL.xz * 0.5 + vL.y * 0.3 + vec2(vA.w)).b;
        if (n < vA.z * 1.1) discard;
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float ndv = abs(dot(N, V));
        float lit = dot(N, normalize(vec3(0.3, 1.0, 0.2)));
        vec3 col = lit > 0.25 ? uCloudMid : uCloudDark;
        // strike flash lights only the undersides, briefly; a thin palette rim otherwise
        float under = smoothstep(0.1, -0.6, N.y);
        if (lit > 0.25 && ndv < 0.42) col = mix(uCloudMid, uBody[p], 0.35);
        if (vA.y > 0.15 && under > 0.5) col = uBody[p] * (1.0 + 1.6 * vA.y);
        if (vA.y > 0.55 && under > 0.8) col = uCore[p] * (1.0 + 2.0 * vA.y);
        if (ndv < 0.22) col = uInk[p] * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  );
}

function createPetalMaterial(shared) {
  return baseMaterial(
    'UltimateVfx_PetalMaterial',
    shared,
    {},
    /* glsl */ `
      attribute vec4 aPetalA; // palette (5 ivory lotus / 6 rose), fade, seed, glow
      varying vec2 vUv;
      varying vec4 vA;
      void main() {
        vUv = uv;
        vA = aPetalA;
        gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      ${GLSL_COMMON}
      uniform sampler2D uNoise;
      varying vec2 vUv;
      varying vec4 vA;
      void main() {
        int p = int(vA.x + 0.5);
        float n = texture2D(uNoise, vUv * vec2(0.6, 0.9) + vec2(vA.z)).b;
        if (n < vA.y * 1.1) discard;
        float x = abs(vUv.x * 2.0 - 1.0);
        vec3 col = mix(uCore[p] * (1.25 + vA.w), uBody[p] * 1.3, smoothstep(0.35, 0.95, vUv.y));
        if (p == 5) col = mix(col, uDeep[6] * 1.3, smoothstep(0.78, 0.98, vUv.y));
        if (x < 0.06 && vUv.y < 0.8) col = uDeep[p];
        if (x > 0.84 || vUv.y < 0.03) col = uInk[p];
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    THREE.DoubleSide
  );
}

function createSparkMaterial(shared) {
  return baseMaterial(
    'UltimateVfx_SparkMaterial',
    shared,
    {},
    /* glsl */ `
      attribute vec2 aSparkA; // palette, heat
      varying vec3 vN;
      varying vec3 vW;
      varying vec2 vA;
      void main() {
        vA = aSparkA;
        vec4 w = instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    /* glsl */ `
      ${GLSL_COMMON}
      varying vec3 vN;
      varying vec3 vW;
      varying vec2 vA;
      void main() {
        int p = int(vA.x + 0.5);
        float ndv = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
        vec3 col = ndv > 0.45 ? uCore[p] * (1.0 + 3.0 * vA.y) : uBody[p] * (1.0 + vA.y);
        if (ndv < 0.15) col = uDeep[p];
        gl_FragColor = vec4(col, 1.0);
      }
    `
  );
}

/* ------------------------------ system ----------------------------------- */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Euler();

function makeRecords(n, extra) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push({ active: false, age: 0, delay: 0, life: 1, seed: i * 1.37, ...extra() });
  return arr;
}

export class UltimateVfxSystem {
  constructor({ scene = null, getGroundHeight = () => 0 } = {}) {
    this.scene = scene;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.noiseAtlas = getSharedNoiseAtlas();
    this.uTime = { value: 0 };
    const pal = paletteUniforms();
    this.shared = { ...pal, uTime: this.uTime, uNoise: { value: this.noiseAtlas } };

    this.group = new THREE.Group();
    this.group.name = 'UltimateVfxRoot';
    this.group.visible = false;
    if (scene) scene.add(this.group);

    const mk = (name, geo, mat, max, attrs) => {
      for (const [key, size] of attrs) {
        geo.setAttribute(key, new THREE.InstancedBufferAttribute(new Float32Array(max * size), size));
      }
      const mesh = new THREE.InstancedMesh(geo, mat, max);
      mesh.name = name;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.userData.isVfx = true;
      this.group.add(mesh);
      return mesh;
    };
    this.boltMesh = mk('UltimateVfx_DC1_Bolts', createBoltTubeGeometry(), createBoltMaterial(this.shared), MAX_BOLTS, [['aBoltA', 4], ['aBoltB', 4]]);
    const discGeo = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2);
    this.discMesh = mk('UltimateVfx_DC2_GroundDiscs', discGeo, createDiscMaterial(this.shared), MAX_DISCS, [['aDiscA', 4], ['aDiscB', 4]]);
    const crestGeo = new THREE.CylinderGeometry(1, 1, 1, 56, 1, true).translate(0, 0.5, 0);
    this.crestMesh = mk('UltimateVfx_DC3_CrestWalls', crestGeo, createCrestMaterial(this.shared), MAX_CRESTS, [['aCrestA', 4]]);
    this.cloudMesh = mk('UltimateVfx_DC4_StormHalo', new THREE.IcosahedronGeometry(1, 1), createCloudMaterial(this.shared), MAX_PUFFS, [['aCloudA', 4]]);
    this.petalMesh = mk('UltimateVfx_DC5_Petals', createUltimatePetalGeometry(), createPetalMaterial(this.shared), MAX_PETALS, [['aPetalA', 4]]);
    this.sparkMesh = mk('UltimateVfx_DC6_Sparks', new THREE.OctahedronGeometry(1, 0), createSparkMaterial(this.shared), MAX_SPARKS, [['aSparkA', 2]]);

    const v3 = () => new THREE.Vector3();
    this.bolts = makeRecords(MAX_BOLTS, () => ({ from: v3(), to: v3(), width: 0.2, jag: 0.4, pal: 2, revealDur: 0.08, ascend: false, flash: 0, track: null, trackFrom: null }));
    this.discs = makeRecords(MAX_DISCS, () => ({ pos: v3(), radius: 2, mode: 0, pal: 2, revealDur: 0.4, spin: 0 }));
    this.crests = makeRecords(MAX_CRESTS, () => ({ pos: v3(), radius: 4, height: 1, pal: 2 }));
    this.halos = makeRecords(MAX_HALOS, () => ({ center: v3(), height: 8, r0: 7, r1: 4, pal: 2, formDur: 0.5, flashAt: -9 }));
    this.sparkBursts = makeRecords(MAX_SPARK_BURSTS, () => ({ pos: v3(), count: 12, speed: 6, pal: 2 }));
    this.blooms = makeRecords(MAX_BLOOMS, () => ({ pos: v3(), openAt: 0.55, flyCount: 24 }));
    this.cataclysm = { active: false, haloIdx: -1, sigilIdx: -1, pos: v3() };
    this._tipFallback = v3();
  }

  /* ------------------------------ spawning ------------------------------- */

  _take(pool) {
    let best = pool[0];
    for (const r of pool) {
      if (!r.active) return r;
      if (r.age - r.delay > best.age - best.delay) best = r;
    }
    return best;
  }

  _ground(x, z) {
    const g = this.getGroundHeight(x, z);
    return Number.isFinite(g) ? g : 0;
  }

  spawnBolt(from, to, { delay = 0, life = 0.5, width = 0.2, jag = 0.4, pal = 2, revealDur = 0.08, ascend = false, track = null, trackFrom = null, seed = null } = {}) {
    const b = this._take(this.bolts);
    b.active = true;
    b.age = 0;
    b.delay = delay;
    b.life = life;
    b.from.copy(from);
    b.to.copy(to);
    b.width = width;
    b.jag = jag;
    b.pal = pal;
    b.revealDur = revealDur;
    b.ascend = ascend;
    b.track = track;
    b.trackFrom = trackFrom;
    b.seed = seed ?? Math.random() * 10;
    return b;
  }

  spawnDisc(pos, { delay = 0, life = 1, radius = 2, mode = 0, pal = 2, revealDur = 0.4, spin = 0 } = {}) {
    const d = this._take(this.discs);
    Object.assign(d, { active: true, age: 0, delay, life, radius, mode, pal, revealDur, spin, seed: Math.random() * 10 });
    d.pos.copy(pos);
    return d;
  }

  spawnCrest(pos, { delay = 0, life = 0.6, radius = 4, height = 1, pal = 2 } = {}) {
    const c = this._take(this.crests);
    Object.assign(c, { active: true, age: 0, delay, life, radius, height, pal, seed: Math.random() * 10 });
    c.pos.copy(pos);
    return c;
  }

  spawnHalo(center, { delay = 0, life = 1.6, height = 8.5, r0 = 7.5, r1 = 3.6, pal = 2, formDur = 0.5 } = {}) {
    const h = this._take(this.halos);
    Object.assign(h, { active: true, age: 0, delay, life, height, r0, r1, pal, formDur, flashAt: -9, seed: Math.random() * 10 });
    h.center.copy(center);
    return h;
  }

  spawnSparks(pos, { delay = 0, life = 0.6, count = 12, speed = 6, pal = 2 } = {}) {
    const s = this._take(this.sparkBursts);
    Object.assign(s, { active: true, age: 0, delay, life, count, speed, pal, seed: Math.random() * 10 });
    s.pos.copy(pos);
    return s;
  }

  _impact(pos, pal, scale = 1, delay = 0) {
    this.spawnDisc(pos, { delay, life: 0.95, radius: 6.2 * scale, mode: 1, pal });
    this.spawnCrest(pos, { delay, life: 0.6, radius: 4.8 * scale, height: 1.15 * scale, pal });
    _p.copy(pos);
    _p.y += 0.2;
    this.spawnSparks(_p, { delay, life: 0.75, count: Math.round(18 * scale), speed: 9 * scale, pal });
  }

  /* --------------------------- choreography ------------------------------ */

  /**
   * Knight Q: anticipation (halo descends + sigil, 0-0.48s) -> column strikes the
   * raised blade (0.48s) -> ground release under the slam (0.93s) -> disperse (~1.6s).
   */
  playKnightAwakening(pos, { style = 'tempest', getBladeTip = null, releaseDelay = 0.93 } = {}) {
    const pal = palIndex(style);
    const gy = this._ground(pos.x, pos.z);
    _a.set(pos.x, gy, pos.z);
    const halo = this.spawnHalo(_a, { life: 1.75, height: 8.6, r0: 8.0, r1: 3.4, pal, formDur: 0.5 });
    halo.flashAt = 0.48;
    this.spawnDisc(_a, { life: 1.7, radius: 2.6, mode: 0, pal, revealDur: 0.42, spin: 0.7 });
    _b.set(pos.x, gy + 8.6, pos.z);
    this._tipFallback.set(pos.x, gy + 2.3, pos.z);
    const track = typeof getBladeTip === 'function' ? getBladeTip : null;
    this.spawnBolt(_b, this._tipFallback, { delay: 0.30, life: 0.2, width: 0.05, jag: 0.4, pal, revealDur: 0.14, track });
    this.spawnBolt(_b, this._tipFallback, { delay: 0.48, life: 0.62, width: 0.3, jag: 0.42, pal, revealDur: 0.05, track });
    this.spawnBolt(_b, this._tipFallback, { delay: 0.50, life: 0.42, width: 0.11, jag: 0.75, pal, revealDur: 0.05, track });
    for (let i = 0; i < 3; i++) {
      const ang = i * 2.1 + 0.4;
      _c.set(pos.x + Math.cos(ang) * 3.3, gy + 8.4 + i * 0.2, pos.z + Math.sin(ang) * 3.3);
      this.spawnBolt(_b, _c, { delay: 0.47 + i * 0.03, life: 0.34, width: 0.07, jag: 0.5, pal, revealDur: 0.06 });
    }
    this.spawnSparks(this._tipFallback, { delay: 0.5, life: 0.55, count: 14, speed: 6.5, pal });
    this._sparkTrack = track;
    this._impact(_a, pal, 1.0, releaseDelay);
    this._shakeAt = releaseDelay;
    this._shakeAge = 0;
    this._shakeAmp = 0.12;
    this.group.visible = true;
  }

  /**
   * Couples ultimate: twin sigils + rising prayer pillars (rose Knight / ivory Mage)
   * and a closed lotus bud under a descending gold halo; at `strikeDelay` a braided
   * three-strand column lands, the bud bursts open and petals fly.
   */
  playCouplesUltimate(knightPos, magePos, impactPos, { strikeDelay = 0.55 } = {}) {
    const P = ULTIMATE_PALETTES;
    const heroes = [[knightPos, P.rose.idx], [magePos, P.ivory.idx]];
    for (const [hp, pal] of heroes) {
      if (!hp) continue;
      const gy = this._ground(hp.x, hp.z);
      _a.set(hp.x, gy, hp.z);
      this.spawnDisc(_a, { life: 1.4, radius: 1.5, mode: 0, pal, revealDur: 0.3, spin: -0.8 });
      _b.set(hp.x, gy + 7.5, hp.z);
      this.spawnBolt(_a, _b, { life: 0.7, width: 0.13, jag: 0.12, pal, revealDur: 0.32, ascend: true });
    }
    const gy = this._ground(impactPos.x, impactPos.z);
    _a.set(impactPos.x, gy, impactPos.z);
    const halo = this.spawnHalo(_a, { life: 1.65, height: 9.0, r0: 8.5, r1: 4.2, pal: P.couples.idx, formDur: strikeDelay });
    halo.flashAt = strikeDelay;
    this.spawnDisc(_a, { life: 1.6, radius: 4.4, mode: 0, pal: P.couples.idx, revealDur: strikeDelay * 0.9, spin: 0.5 });
    _b.set(impactPos.x, gy + 9.0, impactPos.z);
    this.spawnBolt(_b, _a, { delay: strikeDelay, life: 0.7, width: 0.55, jag: 0.28, pal: P.couples.idx, revealDur: 0.06 });
    for (let i = 0; i < 2; i++) {
      const off = i === 0 ? 0.55 : -0.55;
      _c.set(impactPos.x + off, gy + 9.0, impactPos.z - off * 0.4);
      _d.set(impactPos.x - off * 0.4, gy, impactPos.z + off * 0.4);
      this.spawnBolt(_c, _d, { delay: strikeDelay - 0.02, life: 0.6, width: 0.14, jag: 0.65, pal: i === 0 ? P.rose.idx : P.ivory.idx, revealDur: 0.07 });
    }
    const bloom = this._take(this.blooms);
    Object.assign(bloom, { active: true, age: 0, delay: 0, life: 1.6, openAt: strikeDelay, flyCount: 28, seed: Math.random() * 10 });
    bloom.pos.copy(_a);
    this._impact(_a, P.couples.idx, 1.2, strikeDelay);
    this.group.visible = true;
  }

  /** Mage Q: persistent violet storm halo + spinning sigil for the whole channel. */
  startCataclysm(pos, duration = 6.0) {
    const pal = ULTIMATE_PALETTES.tempest.idx;
    const gy = this._ground(pos.x, pos.z);
    _a.set(pos.x, gy, pos.z);
    this.cataclysm.pos.copy(_a);
    const halo = this.spawnHalo(_a, { life: duration + 0.8, height: 8.2, r0: 9.5, r1: 5.4, pal, formDur: 0.6 });
    halo.flashAt = 0.3;
    this.cataclysm.halo = halo;
    this.cataclysm.sigil = this.spawnDisc(_a, { life: duration + 0.4, radius: 3.3, mode: 0, pal, revealDur: 0.5, spin: 0.45 });
    this.cataclysm.active = true;
    _b.set(pos.x, gy + 8.2, pos.z);
    _c.set(pos.x, gy + 2.2, pos.z);
    this.spawnBolt(_b, _c, { delay: 0.3, life: 0.45, width: 0.2, jag: 0.35, pal, revealDur: 0.06 });
    this.spawnSparks(_c, { delay: 0.32, count: 10, speed: 5, pal });
    this.group.visible = true;
  }

  /** One cataclysm wave: columns from the halo onto each target (max 4). */
  cataclysmStrike(targets = null) {
    const pal = ULTIMATE_PALETTES.tempest.idx;
    const c = this.cataclysm;
    if (!c.active) return;
    let n = 0;
    const strikeAt = (x, z, i) => {
      const gy = this._ground(x, z);
      _a.set(x, gy, z);
      const ang = hash11(this.uTime.value * 3.1 + i) * TAU;
      _b.set(c.pos.x + Math.cos(ang) * 5.0, c.pos.y + 8.0, c.pos.z + Math.sin(ang) * 5.0);
      this.spawnBolt(_b, _a, { delay: i * 0.07, life: 0.42, width: 0.24, jag: 0.6, pal, revealDur: 0.06 });
      this.spawnDisc(_a, { delay: i * 0.07, life: 0.6, radius: 2.6, mode: 1, pal });
      this.spawnCrest(_a, { delay: i * 0.07, life: 0.45, radius: 2.0, height: 0.7, pal });
      _a.y += 0.2;
      this.spawnSparks(_a, { delay: i * 0.07, life: 0.5, count: 8, speed: 6, pal });
    };
    if (targets) {
      for (const t of targets) {
        if (n >= 4) break;
        const e = t?.enemy || t;
        if (!e || !Number.isFinite(e.x)) continue;
        strikeAt(e.x, e.z, n++);
      }
    }
    for (let i = n; i < 2; i++) {
      const ang = hash11(this.uTime.value * 7.3 + i * 2.7) * TAU;
      const rad = 3.5 + 2.5 * hash11(this.uTime.value + i);
      strikeAt(c.pos.x + Math.cos(ang) * rad, c.pos.z + Math.sin(ang) * rad, i);
    }
    if (c.halo?.active) c.halo.flashAt = c.halo.age;
  }

  stopCataclysm() {
    const c = this.cataclysm;
    if (!c.active) return;
    c.active = false;
    for (const r of [c.halo, c.sigil]) {
      if (r?.active) r.life = Math.min(r.life, r.age + 0.5);
    }
  }

  /* ------------------------------- update -------------------------------- */

  update(dt) {
    if (!this.group.visible) return;
    this.uTime.value += dt;
    this._advance(dt);
    this._evaluate();
  }

  _advance(dt) {
    for (const pool of [this.bolts, this.discs, this.crests, this.halos, this.sparkBursts, this.blooms]) {
      for (const r of pool) {
        if (!r.active) continue;
        r.age += dt;
        if (r.age - r.delay > r.life) r.active = false;
      }
    }
    if (this._shakeAt !== undefined) this._shakeAge += dt;
  }

  _evaluate() {
    let nb = 0;
    const bA = this.boltMesh.geometry.attributes.aBoltA;
    const bB = this.boltMesh.geometry.attributes.aBoltB;
    for (const b of this.bolts) {
      if (!b.active) continue;
      const t = b.age - b.delay;
      if (t < 0) continue;
      if (b.track) b.track(b.to);
      const reveal = saturate(t / b.revealDur);
      const fade = smoothstep(b.life * 0.55, b.life, t);
      const flash = Math.exp(-t * 9.0);
      _c.subVectors(b.to, b.from);
      const len = _c.length();
      if (len < 1e-3) continue;
      _c.divideScalar(len);
      _d.set(0, 0, 1);
      if (Math.abs(_c.z) > 0.9) _d.set(1, 0, 0);
      _a.crossVectors(_c, _d).normalize();
      _b.crossVectors(_a, _c).normalize();
      _c.multiplyScalar(len);
      _m.makeBasis(_a, _c, _b).setPosition(b.from);
      this.boltMesh.setMatrixAt(nb, _m);
      bA.setXYZW(nb, b.seed, b.pal, reveal, fade);
      bB.setXYZW(nb, b.jag, b.width, b.ascend ? 1 : 0, flash);
      nb++;
    }
    this.boltMesh.count = nb;
    this.boltMesh.instanceMatrix.needsUpdate = true;
    bA.needsUpdate = true;
    bB.needsUpdate = true;

    let nd = 0;
    const dA = this.discMesh.geometry.attributes.aDiscA;
    const dB = this.discMesh.geometry.attributes.aDiscB;
    for (const d of this.discs) {
      if (!d.active) continue;
      const t = d.age - d.delay;
      if (t < 0) continue;
      const u = saturate(t / d.life);
      const fade = d.mode === 0 ? smoothstep(d.life - 0.45, d.life, t) : smoothstep(0.45, 1.0, u);
      const grow = d.mode === 0 ? lerp(0.86, 1.0, outQuint(t / Math.max(0.05, d.revealDur))) : 1;
      _p.set(d.pos.x, d.pos.y + 0.05 + nd * 0.004, d.pos.z);
      _s.set(d.radius * grow, 1, d.radius * grow);
      _m.compose(_p, _q.identity(), _s);
      this.discMesh.setMatrixAt(nd, _m);
      dA.setXYZW(nd, d.mode, d.pal, u, d.seed);
      dB.setXYZW(nd, saturate(t / d.revealDur), fade, d.spin * t, 0);
      nd++;
    }
    this.discMesh.count = nd;
    this.discMesh.instanceMatrix.needsUpdate = true;
    dA.needsUpdate = true;
    dB.needsUpdate = true;

    let nc = 0;
    const cA = this.crestMesh.geometry.attributes.aCrestA;
    for (const c of this.crests) {
      if (!c.active) continue;
      const t = c.age - c.delay;
      if (t < 0) continue;
      const u = saturate(t / c.life);
      const rad = c.radius * (0.12 + 0.88 * outQuint(u * 1.25));
      const h = c.height * (1.0 - 0.65 * u) * smoothstep(0.0, 0.08, u);
      _p.copy(c.pos);
      _s.set(rad, Math.max(0.01, h), rad);
      _m.compose(_p, _q.identity(), _s);
      this.crestMesh.setMatrixAt(nc, _m);
      cA.setXYZW(nc, c.pal, u, c.seed, smoothstep(0.5, 1.0, u));
      nc++;
    }
    this.crestMesh.count = nc;
    this.crestMesh.instanceMatrix.needsUpdate = true;
    cA.needsUpdate = true;

    let np = 0;
    const clA = this.cloudMesh.geometry.attributes.aCloudA;
    for (const h of this.halos) {
      if (!h.active) continue;
      const t = h.age - h.delay;
      if (t < 0) continue;
      const form = outQuint(t / h.formDur);
      const disperse = smoothstep(h.life - 0.6, h.life, t);
      const flash = h.age >= h.flashAt ? Math.exp(-(h.age - h.flashAt) * 4.5) : 0;
      for (let i = 0; i < PUFFS_PER_HALO; i++) {
        const hs = hash11(h.seed * 3.3 + i * 1.71);
        const hs2 = hash11(h.seed * 1.9 + i * 2.93);
        // first EYE_PUFFS knot the storm's eye (bolt origin); the rest form a two-row ring
        const eye = i < EYE_PUFFS;
        const ringI = eye ? i : i - EYE_PUFFS;
        const ringN = eye ? EYE_PUFFS : PUFFS_PER_HALO - EYE_PUFFS;
        const ang = (ringI / ringN) * TAU + h.seed + t * (eye ? -0.6 : 0.3) + hs * 0.2;
        const ringR = lerp(h.r0, h.r1, form) * (ringI % 2 === 0 ? 1.0 : 0.8) * (0.94 + 0.12 * hs2);
        const rad = (eye ? 0.9 * form : ringR) * (1 + disperse * 0.7);
        const y = h.center.y + h.height + (eye ? 0.5 : 0) + (1 - form) * 4.5 + (ringI % 2 === 0 ? 0.25 : -0.25) + disperse * 1.4;
        const sc = (eye ? 0.75 : 0.62 + 0.5 * hs) * smoothstep(0.0, 0.35, form + 0.05) * Math.sqrt(h.r1 / 4.6);
        _p.set(h.center.x + Math.cos(ang) * rad, y, h.center.z + Math.sin(ang) * rad);
        _e.set((hs - 0.5) * 0.5, ang, (hs2 - 0.5) * 0.4);
        _q.setFromEuler(_e);
        _s.set(sc * 1.7, sc * 0.62, sc * 1.2);
        _m.compose(_p, _q, _s);
        this.cloudMesh.setMatrixAt(np, _m);
        clA.setXYZW(np, h.pal, flash * (0.6 + 0.4 * hs2), disperse, hs * 5);
        np++;
      }
    }
    this.cloudMesh.count = np;
    this.cloudMesh.instanceMatrix.needsUpdate = true;
    clA.needsUpdate = true;

    let npt = 0;
    const pA = this.petalMesh.geometry.attributes.aPetalA;
    for (const bl of this.blooms) {
      if (!bl.active) continue;
      const t = bl.age - bl.delay;
      if (t < 0) continue;
      const rise = outQuint(t / 0.35);
      const open = outQuint((t - bl.openAt) / 0.35);
      const fade = smoothstep(bl.life - 0.5, bl.life, t);
      // 12 large lotus petals: closed bud -> burst open flat
      for (let i = 0; i < 12 && npt < MAX_PETALS; i++) {
        const outer = i >= 6;
        const yaw = (i / 6) * TAU + (outer ? Math.PI / 6 : 0);
        const tilt = lerp(outer ? 0.35 : 0.12, outer ? 1.45 : 1.15, open);
        const sc = (outer ? 2.1 : 1.6) * rise * (1 + 0.25 * open);
        _e.set(tilt, yaw, 0, 'YXZ');
        _q.setFromEuler(_e);
        _p.copy(bl.pos);
        _p.y += 0.06;
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        this.petalMesh.setMatrixAt(npt, _m);
        pA.setXYZW(npt, 5, fade, i * 0.37, open * 0.8);
        npt++;
      }
      // flying rose + lotus petals after the strike
      const ft = t - bl.openAt;
      if (ft > 0) {
        for (let i = 0; i < bl.flyCount && npt < MAX_PETALS; i++) {
          const hs = hash11(bl.seed + i * 1.37);
          const hs2 = hash11(bl.seed + i * 2.71);
          const ang = (i / bl.flyCount) * TAU + hs * 0.4 + ft * (0.9 + hs);
          const sp = 4.5 + 5.0 * hs2;
          const drag = (1 - Math.exp(-2.2 * ft)) / 2.2;
          const r = 0.6 + sp * drag;
          _p.set(bl.pos.x + Math.cos(ang) * r, bl.pos.y + 0.4 + (3.5 + 3 * hs) * drag - 1.1 * ft * ft, bl.pos.z + Math.sin(ang) * r);
          _e.set(ft * (4 + hs * 6), ang, ft * 5 * hs2);
          _q.setFromEuler(_e);
          const sc = 0.32 + 0.22 * hs;
          _s.set(sc, sc, sc);
          _m.compose(_p, _q, _s);
          this.petalMesh.setMatrixAt(npt, _m);
          pA.setXYZW(npt, i % 3 === 0 ? 5 : 6, fade, hs * 7, 0.3);
          npt++;
        }
      }
    }
    this.petalMesh.count = npt;
    this.petalMesh.instanceMatrix.needsUpdate = true;
    pA.needsUpdate = true;

    let ns = 0;
    const sA = this.sparkMesh.geometry.attributes.aSparkA;
    for (const s of this.sparkBursts) {
      if (!s.active) continue;
      const t = s.age - s.delay;
      if (t < 0) continue;
      const u = saturate(t / s.life);
      for (let i = 0; i < s.count && ns < MAX_SPARKS; i++) {
        const h1 = hash11(s.seed + i * 1.13);
        const h2 = hash11(s.seed + i * 2.31);
        const h3 = hash11(s.seed + i * 3.77);
        const life = s.life * (0.55 + 0.45 * h3);
        if (t > life) continue;
        const az = h1 * TAU;
        const el = 0.25 + h2 * 1.0;
        const sp = s.speed * (0.55 + 0.6 * h3);
        _a.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(sp);
        const drag = (1 - Math.exp(-3.0 * t)) / 3.0;
        _p.set(s.pos.x + _a.x * drag, s.pos.y + _a.y * drag - 4.5 * t * t, s.pos.z + _a.z * drag);
        _b.set(_a.x * Math.exp(-3 * t), _a.y * Math.exp(-3 * t) - 9.0 * t, _a.z * Math.exp(-3 * t));
        const vl = _b.length();
        if (vl > 1e-4) _b.divideScalar(vl);
        else _b.copy(UP);
        _q.setFromUnitVectors(UP, _b);
        const shrink = 1 - smoothstep(0.6, 1.0, t / life);
        const w = 0.05 * shrink + 0.005;
        _s.set(w, (0.08 + Math.min(0.4, vl * 0.045)) * shrink + 0.01, w);
        _m.compose(_p, _q, _s);
        this.sparkMesh.setMatrixAt(ns, _m);
        sA.setXY(ns, s.pal, 1 - u);
        ns++;
      }
    }
    this.sparkMesh.count = ns;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    sA.needsUpdate = true;

    const any = nb + nd + nc + np + npt + ns > 0;
    const pending = this._anyPending();
    this.group.visible = any || pending;
  }

  _anyPending() {
    for (const pool of [this.bolts, this.discs, this.crests, this.halos, this.sparkBursts, this.blooms]) {
      for (const r of pool) if (r.active) return true;
    }
    return false;
  }

  getCameraShakeOffset(target = new THREE.Vector3()) {
    if (this._shakeAt === undefined) return target.set(0, 0, 0);
    const t = this._shakeAge - this._shakeAt;
    if (t < 0 || t > 0.4) return target.set(0, 0, 0);
    const env = Math.exp(-t * 9.0) * this._shakeAmp;
    return target.set(Math.sin(t * 61) * env, Math.abs(Math.cos(t * 67)) * env, Math.cos(t * 53) * env);
  }

  /** Deterministic preview: replays a scenario from t = 0 to `timeSeconds`. */
  seek(timeSeconds, scenario = null) {
    if (scenario) {
      this.clear();
      scenario(this);
    }
    this.uTime.value = timeSeconds;
    this._advance(timeSeconds);
    this.group.visible = true;
    this._evaluate();
    return this;
  }

  getStats() {
    const meshes = [this.boltMesh, this.discMesh, this.crestMesh, this.cloudMesh, this.petalMesh, this.sparkMesh];
    let drawCalls = 0;
    let instances = 0;
    if (this.group.visible) {
      for (const m of meshes) {
        if (m.count > 0) {
          drawCalls++;
          instances += m.count;
        }
      }
    }
    return { active: drawCalls > 0, drawCalls, instances, cataclysm: this.cataclysm.active };
  }

  clear() {
    for (const pool of [this.bolts, this.discs, this.crests, this.halos, this.sparkBursts, this.blooms]) {
      for (const r of pool) {
        r.active = false;
        r.track = null;
      }
    }
    this.cataclysm.active = false;
    this.cataclysm.halo = null;
    this.cataclysm.sigil = null;
    this._shakeAt = undefined;
    for (const m of [this.boltMesh, this.discMesh, this.crestMesh, this.cloudMesh, this.petalMesh, this.sparkMesh]) m.count = 0;
    this.group.visible = false;
  }

  dispose() {
    this.clear();
    for (const m of [this.boltMesh, this.discMesh, this.crestMesh, this.cloudMesh, this.petalMesh, this.sparkMesh]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.group.parent?.remove(this.group);
  }
}

export function createUltimateVfxSystem(options = {}) {
  return new UltimateVfxSystem(options);
}
