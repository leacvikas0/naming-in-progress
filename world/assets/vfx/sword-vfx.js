// ============================================================================
// world/assets/vfx/sword-vfx.js
//
// Stage 4 Pass 2: 100% Live Bone-Tracked *Demon Slayer* Sword Breathing &
// Physical Elemental Detonations (Zero Ground Garbage on Swings!)
//
// Visual & Engineering Contract:
// - Strictly <= 4 draw calls when active, 0 draw calls when idle:
//     1. `sheathMesh` (1 Mesh attached to `knightChar.equippedWeapons['handSlot.r']`
//        with `userData.isVfx = true`): Sleek, blade-hugging 3D elemental sheath
//        with serrated Ukiyo-e flame/frost/storm edge tongues above the crossguard
//        (`y = 0.22..1.48`), `transparent: false, depthWrite: true, side: THREE.FrontSide`,
//        hard `discard < 0.45`.
//     2. `liveRibbonMesh` (aliased as `slashRibbonMesh`, 1 Mesh):
//        100% Live Bone-Tracked Sword Trail sampled directly from `rightSword.matrixWorld`
//        between `localGuard = (0, 0.20, 0)` and `localTip = (0, 1.72, 0)` across a
//        48-slice Catmull-Rom-interpolated ring buffer (`trailLifetime = 0.24s`),
//        plus ground-hugging detonation shockwave crest during `triggerDetonation`
//        (`transparent: false, depthWrite: true, side: THREE.DoubleSide`,
//        hard `alphaTest` `discard < 0.45`).
//     3. `shrapnelMesh` (1 InstancedMesh):
//        - On normal sword swings: 8 small, fast-moving airborne tangential blade
//          sparks (`size = 0.08..0.14m`) flying off `tipWorld` along the blade's
//          motion vector and dissolving via `NoiseAtlas` erosion in `0.22s`
//          (ZERO floor spikes on swings!).
//        - On `triggerDetonation(type, pos)`: 28 radial 3D glacier/magma/fulgurite
//          detonation spires that dissolve via `NoiseAtlas` fracture erosion without
//          uniform shrinking.
//     4. `detonationDecalMesh` (1 InstancedMesh):
//        Strictly used for `triggerDetonation(type, pos)` (ZERO floor decals on
//        normal sword swings!).
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';
import { createGlacierCrystalGeometry } from './frost-lance.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

// Exact sword_1handed.gltf local blade coordinates inside `knightChar.equippedWeapons['handSlot.r']`
// (Crossguard top = 0.20m, physical blade tip = 1.4095m -> strictly never longer than the real blade!)
export const LOCAL_BLADE_GUARD = Object.freeze(new THREE.Vector3(0, 0.20, 0));
export const LOCAL_BLADE_TIP = Object.freeze(new THREE.Vector3(0, 1.41, 0));

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

function smoothstep(edge0, edge1, x) {
  const t = saturate((x - edge0) / (edge1 - edge0));
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

function signedHash(n) {
  return hash11(n) * 2.0 - 1.0;
}

function catmullRomScalar(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2.0 * p1 +
      (-p0 + p2) * t +
      (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
      (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)
  );
}

function catmullRomVec3(p0, p1, p2, p3, t, out) {
  out.set(
    catmullRomScalar(p0.x, p1.x, p2.x, p3.x, t),
    catmullRomScalar(p0.y, p1.y, p2.y, p3.y, t),
    catmullRomScalar(p0.z, p1.z, p2.z, p3.z, t)
  );
  return out;
}

export const BREATHING_PALETTES = Object.freeze({
  none: {
    id: 'none',
    label: 'Steel Wind',
    band0: '#334155',
    band1: '#94a3b8',
    band2: '#f1f5f9',
    ink: '#0f172a',
    chipCore: '#64748b',
    chipDeep: '#334155',
    chipMid: '#64748b',
    chipLit: '#cbd5e1',
    chipSeam: '#f8fafc',
    decalDeep: '#475569',
    decalBase: '#94a3b8',
    decalEdge: '#f1f5f9',
  },
  rime: {
    id: 'rime',
    label: 'Glacial Tide',
    band0: '#1b5694',
    band1: '#56b8f5',
    band2: '#f0fcff',
    ink: '#0d2c4d',
    chipCore: '#4b92c9',
    chipDeep: '#24629c',
    chipMid: '#4d8ec4',
    chipLit: '#7fd0ff',
    chipSeam: '#f4feff',
    decalDeep: '#467fa8',
    decalBase: '#78bae3',
    decalEdge: '#f4fcff',
  },
  solar: {
    id: 'solar',
    label: 'Hinokami Sunfire',
    band0: '#cc2408',
    band1: '#ff7b14',
    band2: '#fff3a1',
    ink: '#210d06',
    chipCore: '#ff6a12',
    chipDeep: '#4a1207',
    chipMid: '#cc290a',
    chipLit: '#ff7b14',
    chipSeam: '#fff3b8',
    decalDeep: '#1f130e',
    decalBase: '#d93800',
    decalEdge: '#ff8819',
  },
  tempest: {
    id: 'tempest',
    label: 'Thunderclap Wisteria',
    band0: '#3b0764',
    band1: '#38bdf8',
    band2: '#fef08a',
    ink: '#130724',
    chipCore: '#38bdf8',
    chipDeep: '#1d1633',
    chipMid: '#3d3163',
    chipLit: '#38bdf8',
    chipSeam: '#fff3a1',
    decalDeep: '#161126',
    decalBase: '#38bdf8',
    decalEdge: '#fff3a1',
  },
  eclipse: {
    id: 'eclipse',
    label: 'Sun & Tide Eclipse',
    band0: '#cc2408',
    band1: '#ff7b14',
    band2: '#fff3a1',
    ink: '#160d1f',
    chipCore: '#ff6a12',
    chipDeep: '#4a1207',
    chipMid: '#cc290a',
    chipLit: '#ff7b14',
    chipSeam: '#fff3b8',
    decalDeep: '#1f130e',
    decalBase: '#d93800',
    decalEdge: '#ff8819',
  },
});

/**
 * Active Swing Windows synced to Measured KayKit `Rig_Medium_CombatMelee` Clips.
 */
export const SWING_CONFIGS = Object.freeze({
  combo1: {
    clip: '1H_Melee_Attack_Slice_Horizontal',
    startTime: 0.14,
    timeScale: 1.18,
    duration: 0.52,
    activeStart: 0.01,
    activeEnd: 0.26,
    clipCleaveStart: 0.11,
    clipCleaveEnd: 0.5,
    tiltZ: -0.18,
    arcSpan: Math.PI * 1.18,
  },
  combo2: {
    clip: '1H_Melee_Attack_Slice_Diagonal',
    startTime: 0.28,
    timeScale: 1.15,
    duration: 0.52,
    activeStart: 0.02,
    activeEnd: 0.25,
    clipCleaveStart: 0.21,
    clipCleaveEnd: 0.58,
    tiltZ: -0.58,
    arcSpan: Math.PI * 1.24,
  },
  combo3: {
    clip: '1H_Melee_Attack_Chop',
    startTime: 0.44,
    timeScale: 1.15,
    duration: 0.54,
    activeStart: 0.02,
    activeEnd: 0.26,
    clipCleaveStart: 0.27,
    clipCleaveEnd: 0.68,
    tiltZ: -1.12,
    arcSpan: Math.PI * 1.18,
  },
  combo4: {
    clip: '1H_Melee_Attack_Stab',
    startTime: 0.26,
    timeScale: 1.15,
    duration: 0.58,
    activeStart: 0.02,
    activeEnd: 0.28,
    clipCleaveStart: 0.17,
    clipCleaveEnd: 0.58,
    tiltZ: -0.26,
    arcSpan: Math.PI * 1.12,
    isThrust: true,
  },
  charged: {
    clip: '2H_Melee_Attack_Spinning',
    startTime: 0.0,
    timeScale: 1.15,
    duration: 0.58,
    activeStart: 0.01,
    activeEnd: 0.52,
    clipCleaveStart: 0.01,
    clipCleaveEnd: 0.6,
    tiltZ: -0.12,
    arcSpan: Math.PI * 2.0,
  },
  intercept: {
    clip: '1H_Melee_Attack_Stab',
    startTime: 0.26,
    timeScale: 1.25,
    duration: 0.48,
    activeStart: 0.02,
    activeEnd: 0.26,
    clipCleaveStart: 0.16,
    clipCleaveEnd: 0.56,
    tiltZ: -0.3,
    arcSpan: Math.PI * 0.96,
    isThrust: true,
  },
});

function normalizeStyleKey(style) {
  if (!style) return 'none';
  const s = String(style).toLowerCase();
  if (
    s === 'eclipse' ||
    s === 'sun_and_tide' ||
    s === 'fire_and_water' ||
    s === 'blessed' ||
    s === 'dual'
  ) {
    return 'eclipse';
  }
  if (s === 'rime' || s === 'glacial' || s === 'ice' || s === 'frost' || s === 'shatterblow') {
    return 'rime';
  }
  if (s === 'solar' || s === 'sunfire' || s === 'hinokami' || s === 'fire' || s === 'solar_flare') {
    return 'solar';
  }
  if (s === 'tempest' || s === 'thunderclap' || s === 'wisteria' || s === 'storm' || s === 'thunderchain') {
    return 'tempest';
  }
  return 'none';
}

/* ------------------------------------------------------------------------- */
/* 1. Procedural Geometries (`createBladeSheathGeometry` & Live Trail Buffer)*/
/* ------------------------------------------------------------------------- */

/**
 * Closed 3D Blade Sheath geometry in `sword_1handed.gltf` local coordinates:
 * Encloses KayKit's stylized steel blade (`halfWidthX = 0.1569, halfThickZ = 0.0479`)
 * with a fuller, artistic Ukiyo-e winged/serrated elemental envelope (`widthX = 0.215, thickZ = 0.072`)
 * strictly from crossguard (`y = 0.21`) to physical tip (`y = 1.41`) so it is NEVER longer than the sword!
 */
export function createBladeSheathGeometry({ rings = 20, cols = 14 } = {}) {
  const ringPts = [];
  for (let r = 0; r < rings; r++) {
    const v = r / (rings - 1);
    const y = lerp(0.21, 1.402, v);
    const taper =
      v < 0.78
        ? lerp(0.94, 1.04, v / 0.78)
        : lerp(1.04, 0.06, (v - 0.78) / 0.22);
    const widthX = 0.212 * taper;
    const thickZ = 0.072 * taper;

    const pts = [];
    for (let c = 0; c < cols; c++) {
      const u = c / cols;
      const ang = u * TAU;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const edgePow = Math.pow(Math.abs(cosA), 1.85);
      const fullerPow = Math.pow(Math.abs(sinA), 1.6);
      const serration =
        1.0 +
        0.16 * edgePow * (0.55 + 0.45 * Math.sin(v * Math.PI * 6.0 - Math.abs(cosA) * 1.2));
      const fullerRidge = 1.0 + 0.14 * fullerPow * Math.sin(v * Math.PI);
      const x = cosA * widthX * serration;
      const z = sinA * thickZ * fullerRidge;
      const radialEdge = Math.abs(cosA);
      pts.push({ pos: [x, y, z], u, v, radialEdge });
    }
    ringPts.push(pts);
  }

  const baseCenter = [0, 0.195, 0];
  const tipCenter = [0, 1.41, 0];
  const positions = [];
  const uvs = [];
  const edgeFactors = [];

  const pushTriCCW = (a, b, c, uvA, uvB, uvC, eA, eB, eC) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
    edgeFactors.push(eA, eB, eC);
  };

  for (let r = 0; r < rings - 1; r++) {
    const row0 = ringPts[r];
    const row1 = ringPts[r + 1];
    for (let c = 0; c < cols; c++) {
      const cNext = (c + 1) % cols;
      const a = row0[c];
      const b = row1[c];
      const d = row1[cNext];
      const e = row0[cNext];
      pushTriCCW(a.pos, b.pos, d.pos, [a.u, a.v], [b.u, b.v], [d.u, d.v], a.radialEdge, b.radialEdge, d.radialEdge);
      pushTriCCW(a.pos, d.pos, e.pos, [a.u, a.v], [d.u, d.v], [e.u, e.v], a.radialEdge, d.radialEdge, e.radialEdge);
    }
  }

  const firstRow = ringPts[0];
  const lastRow = ringPts[rings - 1];
  for (let c = 0; c < cols; c++) {
    const cNext = (c + 1) % cols;
    pushTriCCW(
      baseCenter,
      firstRow[c].pos,
      firstRow[cNext].pos,
      [0.5, 0.0],
      [firstRow[c].u, 0.0],
      [firstRow[cNext].u, 0.0],
      0.0,
      firstRow[c].radialEdge,
      firstRow[cNext].radialEdge
    );
    pushTriCCW(
      lastRow[c].pos,
      tipCenter,
      lastRow[cNext].pos,
      [lastRow[c].u, 1.0],
      [0.5, 1.0],
      [lastRow[cNext].u, 1.0],
      lastRow[c].radialEdge,
      1.0,
      lastRow[cNext].radialEdge
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aEdgeFactor', new THREE.Float32BufferAttribute(edgeFactors, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const MAX_TRAIL_SLICES = 48;
const DET_RING_SLICES = 24;
const TOTAL_RIBBON_SLICES = MAX_TRAIL_SLICES + DET_RING_SLICES;
const RADIAL_VERTS = 5; // v = 0, 0.25, 0.5, 0.75, 1.0 across guard -> tip

/**
 * Dynamic vertex buffer for `liveRibbonMesh` (supports 48 bone-tracked trail slices
 * + optional 24-slice ground-hugging detonation shockwave crest in 1 single draw call).
 */
export function createLiveSwordRibbonGeometry() {
  const maxVerts = TOTAL_RIBBON_SLICES * RADIAL_VERTS;
  const maxQuads = (TOTAL_RIBBON_SLICES - 1) * (RADIAL_VERTS - 1);
  const positions = new Float32Array(maxVerts * 3);
  const normals = new Float32Array(maxVerts * 3);
  const uvs = new Float32Array(maxVerts * 2);
  const sliceAges = new Float32Array(maxVerts); // 0..1 age normalized to trailLifetime
  const indices = new Uint16Array(maxQuads * 6);

  for (let i = 0; i < maxVerts; i++) {
    normals[i * 3 + 1] = 1.0;
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const normAttr = new THREE.BufferAttribute(normals, 3);
  const uvAttr = new THREE.BufferAttribute(uvs, 2);
  const ageAttr = new THREE.BufferAttribute(sliceAges, 1);
  const idxAttr = new THREE.BufferAttribute(indices, 1);

  posAttr.setUsage(THREE.DynamicDrawUsage);
  normAttr.setUsage(THREE.DynamicDrawUsage);
  uvAttr.setUsage(THREE.DynamicDrawUsage);
  ageAttr.setUsage(THREE.DynamicDrawUsage);
  idxAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', normAttr);
  geometry.setAttribute('uv', uvAttr);
  geometry.setAttribute('aSliceAge', ageAttr);
  geometry.setIndex(idxAttr);
  geometry.setDrawRange(0, 0);
  return geometry;
}

// Legacy export kept for backwards compatibility with any external imports
export function createUkiyoeSlashArcGeometry() {
  return createLiveSwordRibbonGeometry();
}

/* ------------------------------------------------------------------------- */
/* 2. Opaque Cel Shaders (`transparent: false, depthWrite: true`)            */
/* ------------------------------------------------------------------------- */

function createBladeSheathMaterial(noiseAtlas, sharedUniforms) {
  const pal = BREATHING_PALETTES.solar;
  return new THREE.ShaderMaterial({
    name: 'SwordVfxBladeSheathMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uDualEclipse: sharedUniforms.uDualEclipse,
      uColorBand0: { value: new THREE.Color(pal.band0) },
      uColorBand1: { value: new THREE.Color(pal.band1) },
      uColorBand2: { value: new THREE.Color(pal.band2) },
      uColorInk: { value: new THREE.Color(pal.ink) },
      uRimeBand0: sharedUniforms.uRimeBand0,
      uRimeBand1: sharedUniforms.uRimeBand1,
      uRimeBand2: sharedUniforms.uRimeBand2,
      uRimeInk: sharedUniforms.uRimeInk,
    },
    vertexShader: /* glsl */ `
      attribute float aEdgeFactor;
      varying vec2 vUv;
      varying float vEdgeFactor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vEdgeFactor = aEdgeFactor;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform float uDualEclipse;
      uniform vec3 uColorBand0;
      uniform vec3 uColorBand1;
      uniform vec3 uColorBand2;
      uniform vec3 uColorInk;
      uniform vec3 uRimeBand0;
      uniform vec3 uRimeBand1;
      uniform vec3 uRimeBand2;
      uniform vec3 uRimeInk;

      varying vec2 vUv;
      varying float vEdgeFactor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        vec2 scrollUv = vec2(vUv.x * 1.4, vUv.y * 1.35 - uTime * 2.4);
        vec4 nSample = texture2D(uNoiseAtlas, scrollUv);

        // Solid core across the real steel blade (vEdgeFactor < 0.72), with artistic serrated Ukiyo-e tongues along outer edges
        float coreSolid = 1.0 - smoothstep(0.42, 1.0, vEdgeFactor) * 0.72;
        float flowWave = nSample.b * 0.58 + nSample.g * 0.42;
        float tongueMask = coreSolid + flowWave * 0.58 * smoothstep(1.0, 0.08, vUv.y * 0.28);
        if (tongueMask < 0.45) discard;

        float striation = sin(vEdgeFactor * 12.0 - vUv.y * 9.0 + nSample.b * 3.8) * 0.09;
        float bandScore = (1.0 - vEdgeFactor * 0.75) * 0.76 + flowWave * 0.30 + striation;

        // Intertwined Sunfire & Glacial Tide wave when uDualEclipse > 0.5
        float eclipseWave = sin(vUv.x * 10.0 - vUv.y * 6.0 + uTime * 8.0 + (nSample.b - 0.5) * 2.2);
        float tideMix = uDualEclipse * smoothstep(-0.15, 0.15, eclipseWave);
        vec3 b0 = mix(uColorBand0, uRimeBand0, tideMix);
        vec3 b1 = mix(uColorBand1, uRimeBand1, tideMix);
        vec3 b2 = mix(uColorBand2, uRimeBand2, tideMix);
        vec3 inkCol = mix(uColorInk, uRimeInk, tideMix);

        vec3 col = b0;
        col = mix(col, b1 * 1.05, step(0.36, bandScore));
        col = mix(col, b2 * 1.18, step(0.66, bandScore));

        float border = 1.0 - smoothstep(0.45, 0.54, tongueMask);
        float rimInk = 1.0 - smoothstep(0.14, 0.24, ndv);
        float waveRib = smoothstep(0.032, 0.0, abs(bandScore - 0.36)) * 0.65;
        float streamSeam = uDualEclipse * smoothstep(0.10, 0.0, abs(eclipseWave)) * 0.55;
        col = mix(col, inkCol, max(max(border, rimInk * 0.82), max(waveRib, streamSeam)));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createLiveSwordRibbonMaterial(noiseAtlas, sharedUniforms) {
  return new THREE.ShaderMaterial({
    name: 'SwordVfxLiveBoneRibbonMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uDualEclipse: sharedUniforms.uDualEclipse,
      uColorBand0: sharedUniforms.uSlashBand0,
      uColorBand1: sharedUniforms.uSlashBand1,
      uColorBand2: sharedUniforms.uSlashBand2,
      uColorInk: sharedUniforms.uSlashInk,
      uRimeBand0: sharedUniforms.uRimeBand0,
      uRimeBand1: sharedUniforms.uRimeBand1,
      uRimeBand2: sharedUniforms.uRimeBand2,
      uRimeInk: sharedUniforms.uRimeInk,
    },
    vertexShader: /* glsl */ `
      attribute float aSliceAge;
      varying vec2 vUv;
      varying float vSliceAge;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vSliceAge = aSliceAge;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform float uDualEclipse;
      uniform vec3 uColorBand0;
      uniform vec3 uColorBand1;
      uniform vec3 uColorBand2;
      uniform vec3 uColorInk;
      uniform vec3 uRimeBand0;
      uniform vec3 uRimeBand1;
      uniform vec3 uRimeBand2;
      uniform vec3 uRimeInk;

      varying vec2 vUv;
      varying float vSliceAge;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        // vUv.x = u (0.0 at newest live blade edge -> 1.0 at oldest tail)
        // vUv.y = v (0.0 at inner crossguard 0.20 -> 1.0 at outer physical tip 1.41)
        float u = clamp(vUv.x, 0.0, 1.0);
        float v = clamp(vUv.y, 0.0, 1.0);
        float age01 = clamp(vSliceAge, 0.0, 1.0);
        if (age01 >= 0.995) discard;

        vec2 nUv = vec2(u * 2.1 + uTime * 2.2, v * 1.45 - uTime * 0.6);
        vec4 n0 = texture2D(uNoiseAtlas, nUv);
        vec4 n1 = texture2D(uNoiseAtlas, nUv * 1.85 + vec2(0.37, 0.61));

        // Full-bodied Ukiyo-e woodblock crescent spanning the entire physical blade (v = 0.03..1.00)
        // so the slash ribbon feels wide, artistic, and grounded right on the blade from hilt to tip!
        float tailProgress = max(u * 0.88, age01 * 0.90);
        float tailDissolve = 1.0 - smoothstep(0.48, 0.97, tailProgress);
        float innerWake = smoothstep(0.02, 0.22, v + (1.0 - u) * 0.14);
        float waveNoise = n0.b * 0.62 + n1.g * 0.38;
        float erodedMask = (innerWake * 0.82 + waveNoise * 0.52) * tailDissolve;

        // Hard alphaTest cutout (strictly >= 0.45, zero transparent glass!)
        if (erodedMask < 0.45) discard;

        // Intertwined Sunfire & Glacial Tide wave when uDualEclipse > 0.5
        float eclipseWave = sin(u * 10.0 - v * 6.0 + uTime * 8.0 + (n0.b - 0.5) * 2.4);
        float tideMix = uDualEclipse * smoothstep(-0.14, 0.14, eclipseWave);
        vec3 b0 = mix(uColorBand0, uRimeBand0, tideMix);
        vec3 b1 = mix(uColorBand1, uRimeBand1, tideMix);
        vec3 b2 = mix(uColorBand2, uRimeBand2, tideMix);
        vec3 inkCol = mix(uColorInk, uRimeInk, tideMix);

        // Bold Ukiyo-e concentric flow striations + 3-Band Demon Slayer Breathing Crescent
        float striation = sin(v * 20.0 + n0.b * 5.8 + u * 9.0) * 0.16;
        float celScore = pow(v, 1.22) * 0.74 + (1.0 - u * 0.42) * 0.14 + (n1.b - 0.5) * 0.22 + striation;
        vec3 col = b0;
        col = mix(col, b1 * 1.05, step(0.34, celScore));
        col = mix(col, b2 * 1.16, step(0.74, celScore));

        // Crisp sumi-ink woodblock border along cutout tongues, internal wave ribs, and outer razor spine
        float cutoutInk = 1.0 - smoothstep(0.45, 0.54, erodedMask);
        float outerRazorInk = smoothstep(0.935, 0.992, v);
        float waveRib1 = smoothstep(0.032, 0.0, abs(celScore - 0.34)) * 0.78;
        float waveRib2 = smoothstep(0.028, 0.0, abs(celScore - 0.74)) * 0.68;
        float eclipseSeam = uDualEclipse * smoothstep(0.09, 0.0, abs(eclipseWave)) * 0.68;
        col = mix(col, inkCol, max(max(cutoutInk, outerRazorInk * 0.90), max(max(waveRib1, waveRib2), eclipseSeam)));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createShrapnelCrystalMaterial(noiseAtlas, sharedUniforms) {
  return new THREE.ShaderMaterial({
    name: 'SwordVfxShrapnelCrystalMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uDualEclipse: sharedUniforms.uDualEclipse,
      uColorCore: sharedUniforms.uChipCore,
      uColorDeep: sharedUniforms.uChipDeep,
      uColorMid: sharedUniforms.uChipMid,
      uColorLit: sharedUniforms.uChipLit,
      uColorSeam: sharedUniforms.uChipSeam,
      uColorInk: sharedUniforms.uSlashInk,
      uRimeChipCore: sharedUniforms.uRimeChipCore,
      uRimeChipDeep: sharedUniforms.uRimeChipDeep,
      uRimeChipLit: sharedUniforms.uRimeChipLit,
      uRimeChipSeam: sharedUniforms.uRimeChipSeam,
    },
    vertexShader: /* glsl */ `
      attribute vec4 aChipMeta; // x: seed (negative = rime spire in eclipse mode), y: glow, z: isAirborne (0=grounded spire, 1=tangential spark), w: dissolveProgress (0..1)
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec4 vMeta;

      void main() {
        vLocalPos = position;
        vMeta = aChipMeta;

        mat4 instMat = modelMatrix * instanceMatrix;
        vec4 world = instMat * vec4(position, 1.0);
        vWorldPos = world.xyz;

        vec3 col0 = instMat[0].xyz;
        vec3 col1 = instMat[1].xyz;
        vec3 col2 = instMat[2].xyz;
        vec3 invScaleSq = 1.0 / max(vec3(dot(col0, col0), dot(col1, col1), dot(col2, col2)), vec3(1e-6));
        vWorldNormal = normalize(
          col0 * (normal.x * invScaleSq.x) +
          col1 * (normal.y * invScaleSq.y) +
          col2 * (normal.z * invScaleSq.z)
        );

        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uDaylight;
      uniform float uDualEclipse;
      uniform vec3 uColorCore;
      uniform vec3 uColorDeep;
      uniform vec3 uColorMid;
      uniform vec3 uColorLit;
      uniform vec3 uColorSeam;
      uniform vec3 uColorInk;
      uniform vec3 uRimeChipCore;
      uniform vec3 uRimeChipDeep;
      uniform vec3 uRimeChipLit;
      uniform vec3 uRimeChipSeam;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec4 vMeta;

      void main() {
        float rawSeed = vMeta.x;
        float seed = abs(rawSeed);
        float isRimeSpire = uDualEclipse * step(rawSeed, -0.001);
        float glowBoost = vMeta.y;
        float isAirborne = vMeta.z;
        float dissolveProgress = clamp(vMeta.w, 0.0, 1.0);

        vec3 cCore = mix(uColorCore, uRimeChipCore, isRimeSpire);
        vec3 cDeep = mix(uColorDeep, uRimeChipDeep, isRimeSpire);
        vec3 cLit = mix(uColorLit, uRimeChipLit, isRimeSpire);
        vec3 cSeam = mix(uColorSeam, uRimeChipSeam, isRimeSpire);

        // 1. Locked V1 Horizontal-Azimuth Optical Thickness & Derivative-Flat Facets
        vec3 dN = cross(dFdx(vWorldPos), dFdy(vWorldPos));
        vec3 N = length(dN) > 1e-8 ? normalize(dN) : normalize(vWorldNormal);
        if (dot(N, vWorldNormal) < 0.0) N = -N;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 horizN = normalize(vec3(N.x, 0.0, N.z) + vec3(1e-5, 0.0, 0.0));
        vec3 horizV = normalize(vec3(V.x, 0.0, V.z) + vec3(1e-5, 0.0, 0.0));
        float ndv = clamp(dot(horizN, horizV), 0.0, 1.0);

        float thickness = clamp(pow(ndv, 0.85) * 0.96, 0.0, 1.0);
        float rimAmount = pow(1.0 - ndv, 2.3);

        // 2. World-Space Internal Fracture Planes & Local Feather-Frost Veins
        vec3 fp = vWorldPos * 0.42 + seed * 0.73;
        float r0 = texture2D(uNoiseAtlas, fp.xz + vec2(fp.y * 0.57, 0.19)).r;
        float r1 = texture2D(uNoiseAtlas, fp.xy * 1.65 + vec2(0.41, fp.z * 0.63)).r;
        float cracks = smoothstep(0.55, 0.95, 0.58 * r0 + 0.42 * r1);

        vec3 vp = vLocalPos * 0.95 + seed * 0.31;
        float v0 = texture2D(uNoiseAtlas, vp.xy + vec2(vp.z * 0.47, 0.23)).b;
        float v1 = texture2D(uNoiseAtlas, vp.yz * 1.90 + vec2(0.67, vp.x * 0.53)).b;
        float veins = smoothstep(0.44, 0.90, 0.55 * v0 + 0.45 * v1);

        // Physical NoiseAtlas erosion for tangential sparks & detonation spires (zero uniform shrinking!)
        float hLocal = clamp(vLocalPos.y, 0.0, 1.0);
        float erodeNoise = (0.56 * r0 + 0.44 * v0) * 0.72 + (1.0 - hLocal) * 0.28;
        if (dissolveProgress > 0.001 && erodeNoise < dissolveProgress) discard;

        vec3 body = mix(cLit, cDeep, thickness);
        body = mix(body, cSeam, veins * 0.30);
        body = mix(body, cSeam, cracks * 0.28);

        // 3. Basal Rime / Ember Surge on Ground-Rooted Spires
        float rimeFbm = texture2D(uNoiseAtlas, vLocalPos.xy * 1.35 + vec2(seed * 0.29, vLocalPos.z * 1.35)).b;
        float rime = smoothstep(0.50, 0.0, hLocal) * (0.5 + 0.5 * rimeFbm) * (1.0 - isAirborne * 0.65);
        body = mix(body, cSeam, clamp(rime, 0.0, 1.0) * 0.56);

        // 4. Crisp Hewn-Plane Facet Separation
        body *= mix(1.0, 0.64 + 0.80 * ndv, 0.82);

        // 5. Sky-Probe + Key Sun Lighting
        vec3 L = normalize(vec3(uSunDir.x, max(0.45, uSunDir.y), uSunDir.z));
        vec3 H = normalize(L + V);
        float ndl = max(dot(N, L), 0.0);
        float skyProbe = 0.76 + 0.26 * ndl;
        vec3 diffuseLit = body * skyProbe * mix(0.82, 0.98, uDaylight);
        float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.20 * mix(0.5, 1.0, uDaylight);

        // 6. Permanent Subsurface Inner Light + Dissolve Fracture Edge
        vec3 glow = cSeam * rimAmount * 0.80;
        glow += cCore * (cracks * 0.62 + veins * 0.28) * 1.45;
        glow += cCore * (0.86 + 0.14 * glowBoost);
        glow *= 0.48;
        glow /= (1.0 + glow * 0.35);

        vec3 finalColor = diffuseLit + cSeam * spec + glow;
        float dissolveEdge = step(0.001, dissolveProgress) * (1.0 - smoothstep(dissolveProgress, dissolveProgress + 0.08, erodeNoise));
        finalColor = mix(finalColor, cSeam * 1.32, dissolveEdge);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

function createDetonationDecalMaterial(noiseAtlas, sharedUniforms) {
  return new THREE.ShaderMaterial({
    name: 'SwordVfxDetonationDecalMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uDualEclipse: sharedUniforms.uDualEclipse,
      uColorDeep: sharedUniforms.uDecalDeep,
      uColorBase: sharedUniforms.uDecalBase,
      uColorEdge: sharedUniforms.uDecalEdge,
      uColorInk: sharedUniforms.uSlashInk,
      uRimeDecalDeep: sharedUniforms.uRimeDecalDeep,
      uRimeDecalBase: sharedUniforms.uRimeDecalBase,
      uRimeDecalEdge: sharedUniforms.uRimeDecalEdge,
    },
    vertexShader: /* glsl */ `
      attribute vec4 aDecalMeta; // x: age01, y: reach, z: seed, w: intensity
      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vMeta = aDecalMeta;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uDaylight;
      uniform float uDualEclipse;
      uniform vec3 uColorDeep;
      uniform vec3 uColorBase;
      uniform vec3 uColorEdge;
      uniform vec3 uColorInk;
      uniform vec3 uRimeDecalDeep;
      uniform vec3 uRimeDecalBase;
      uniform vec3 uRimeDecalEdge;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;

      float crustDepthAt(vec2 q) {
        vec4 nDrift = texture2D(uNoiseAtlas, q * 0.09);
        vec4 nSlabs = texture2D(uNoiseAtlas, q * 0.25 + vec2(0.37, 0.61));
        vec4 nGrain = texture2D(uNoiseAtlas, q * 0.72 + vec2(0.19, 0.83));
        float drift = nDrift.b;
        float slabs = smoothstep(0.15, 0.75, nSlabs.g) * 0.30 + nSlabs.r * 0.14;
        float grain = nGrain.a * 0.15;
        return drift * 0.60 + slabs + grain;
      }

      void main() {
        float age = clamp(vMeta.x, 0.0, 1.0);
        float reach = vMeta.y;
        float seed = vMeta.z;
        float intensity = vMeta.w;
        if (reach <= 0.01 || age >= 1.0 || intensity <= 0.01) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p) / max(0.15, reach);
        float ang = atan(p.y, p.x);

        vec2 wPos = vWorldPos.xz;
        vec4 n0 = texture2D(uNoiseAtlas, wPos * 0.14 + vec2(seed * 0.37, seed * 0.61));
        vec4 n1 = texture2D(uNoiseAtlas, wPos * 0.34 + vec2(0.23, 0.51));

        float starLobes = 0.76 + 0.22 * cos(ang * 10.0 + (n0.b - 0.5) * 1.8);
        float grainRim = (n0.b - 0.5) * 0.26 + (n1.a - 0.5) * 0.15;
        float fadeOut = 1.0 - smoothstep(0.68, 1.0, age);
        float mask = (starLobes + grainRim - r + 0.46) * fadeOut * intensity;

        if (mask < 0.45) discard;

        float e = 0.16;
        float h  = crustDepthAt(wPos);
        float hx = crustDepthAt(wPos + vec2(e, 0.0));
        float hy = crustDepthAt(wPos + vec2(0.0, e));
        vec3 nrm = normalize(vec3((h - hx) / e * 0.36, 1.0, (h - hy) / e * 0.36));

        vec3 lightDir = normalize(vec3(uSunDir.x, max(0.38, uSunDir.y), uSunDir.z));
        float lambert = clamp(dot(nrm, lightDir), 0.0, 1.0);
        float shade = 0.36 + 0.64 * pow(lambert, 0.80);

        float eclipseSector = uDualEclipse * smoothstep(-0.18, 0.18, sin(ang * 4.0 - r * 3.5 + (n0.b - 0.5) * 1.4));
        vec3 cDeep = mix(uColorDeep, uRimeDecalDeep, eclipseSector);
        vec3 cBase = mix(uColorBase, uRimeDecalBase, eclipseSector);
        vec3 cEdge = mix(uColorEdge, uRimeDecalEdge, eclipseSector);

        vec3 col = mix(cDeep, cBase, step(0.46, shade));
        col = mix(col, cEdge, step(0.68, shade));

        float shockRing = smoothstep(0.06, 0.0, abs(r - 0.80 + (n0.b - 0.5) * 0.06));
        float innerSeam = smoothstep(0.68, 0.92, n1.r) * smoothstep(0.50, 0.78, mask);
        col = mix(col, cBase, innerSeam * 0.55);
        col = mix(col, cEdge * 1.12, shockRing * 0.80);

        float rimShadow = 1.0 - smoothstep(0.45, 0.53, mask);
        col = mix(col, cDeep * 0.84, rimShadow * 0.70);

        gl_FragColor = vec4(col * mix(0.84, 1.0, uDaylight), 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. Pooled, Deterministic SwordVfxSystem (<= 4 Draw Calls)                 */
/* ------------------------------------------------------------------------- */

const MAX_SHRAPNEL = 42;
const MAX_DETONATION_DECALS = 3;
const TRAIL_LIFETIME = 0.28;
const SPARK_LIFETIME = 0.22;
const SUB_SLICES_PER_STEP = 4;

const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _euler = new THREE.Euler();
const _guardW = new THREE.Vector3();
const _tipW = new THREE.Vector3();
const _interpGuard = new THREE.Vector3();
const _interpTip = new THREE.Vector3();
const _bladeDir = new THREE.Vector3();
const _tangDir = new THREE.Vector3();
const _arcNorm = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _radialVec = new THREE.Vector3();

export class SwordVfxSystem {
  constructor({ scene, getGroundHeight = () => 0 } = {}) {
    this.scene = scene || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.noiseAtlas = getSharedNoiseAtlas();

    const defPal = BREATHING_PALETTES.solar;
    const rimePal = BREATHING_PALETTES.rime;
    this.sharedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
      uDualEclipse: { value: 0.0 },
      uSlashBand0: { value: new THREE.Color(defPal.band0) },
      uSlashBand1: { value: new THREE.Color(defPal.band1) },
      uSlashBand2: { value: new THREE.Color(defPal.band2) },
      uSlashInk: { value: new THREE.Color(defPal.ink) },
      uChipCore: { value: new THREE.Color(defPal.chipCore) },
      uChipDeep: { value: new THREE.Color(defPal.chipDeep) },
      uChipMid: { value: new THREE.Color(defPal.chipMid) },
      uChipLit: { value: new THREE.Color(defPal.chipLit) },
      uChipSeam: { value: new THREE.Color(defPal.chipSeam) },
      uDecalDeep: { value: new THREE.Color(defPal.decalDeep) },
      uDecalBase: { value: new THREE.Color(defPal.decalBase) },
      uDecalEdge: { value: new THREE.Color(defPal.decalEdge) },
      uRimeBand0: { value: new THREE.Color(rimePal.band0) },
      uRimeBand1: { value: new THREE.Color(rimePal.band1) },
      uRimeBand2: { value: new THREE.Color(rimePal.band2) },
      uRimeInk: { value: new THREE.Color(rimePal.ink) },
      uRimeChipCore: { value: new THREE.Color(rimePal.chipCore) },
      uRimeChipDeep: { value: new THREE.Color(rimePal.chipDeep) },
      uRimeChipLit: { value: new THREE.Color(rimePal.chipLit) },
      uRimeChipSeam: { value: new THREE.Color(rimePal.chipSeam) },
      uRimeDecalDeep: { value: new THREE.Color(rimePal.decalDeep) },
      uRimeDecalBase: { value: new THREE.Color(rimePal.decalBase) },
      uRimeDecalEdge: { value: new THREE.Color(rimePal.decalEdge) },
    };

    this.group = new THREE.Group();
    this.group.name = 'SwordVfxRoot';
    this.group.visible = false;
    if (this.scene) {
      this.scene.add(this.group);
    }

    this.knightChar = null;
    this.infusionStyle = 'none';
    this.infusionTimer = 0;
    this.trailLifetime = TRAIL_LIFETIME;

    // Ring buffer / trail history of up to 48 Catmull-Rom-interpolated (guardWorld, tipWorld, age) slices
    this.trailSlices = [];
    this.controlPostures = [];

    this.swingState = {
      active: false,
      type: 'combo1',
      style: 'solar',
      origin: new THREE.Vector3(),
      yaw: 0,
      age: 0,
      duration: 0.52,
      activeStart: 0.02,
      activeEnd: 0.28,
      clip: '1H_Melee_Attack_Slice_Horizontal',
      clipTime: null,
    };

    this.detonationState = {
      active: false,
      type: 'shatterblow',
      style: 'rime',
      pos: new THREE.Vector3(),
      age: 0,
      duration: 0.90,
    };

    this._shakeOffset = new THREE.Vector3();
    this._hitstopScale = 1.0;

    this._buildMeshes();
    this._seedShrapnelPool();
  }

  _buildMeshes() {
    // 1. Sleek Blade Sheath Mesh (attached to `knightChar.equippedWeapons['handSlot.r']` via `attachToKnight`)
    const sheathGeo = createBladeSheathGeometry({ rings: 16, cols: 10 });
    this.sheathMat = createBladeSheathMaterial(this.noiseAtlas, this.sharedUniforms);
    this.sheathMesh = new THREE.Mesh(sheathGeo, this.sheathMat);
    this.sheathMesh.name = 'SwordVfx_BladeSheath';
    this.sheathMesh.userData.isVfx = true;
    this.sheathMesh.frustumCulled = false;
    this.sheathMesh.visible = false;

    // 2. True Live Bone-Tracked Sword Ribbon Mesh (aliased as `slashRibbonMesh`)
    const ribbonGeo = createLiveSwordRibbonGeometry();
    this.slashMat = createLiveSwordRibbonMaterial(this.noiseAtlas, this.sharedUniforms);
    this.liveRibbonMesh = new THREE.Mesh(ribbonGeo, this.slashMat);
    this.liveRibbonMesh.name = 'SwordVfx_DC2_LiveBoneSwordRibbon';
    this.liveRibbonMesh.frustumCulled = false;
    this.liveRibbonMesh.visible = false;
    this.slashRibbonMesh = this.liveRibbonMesh;
    this.group.add(this.liveRibbonMesh);

    // 3. Airborne Tangential Blade Sparks (Swings) & 3D Detonation Spires (Detonations)
    const chipGeo = createGlacierCrystalGeometry({
      seed: 29.7,
      sides: 7,
      taper: 0.66,
      roughness: 0.10,
      bend: 0.56,
    });
    this.chipMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHRAPNEL * 4), 4);
    chipGeo.setAttribute('aChipMeta', this.chipMetaAttr);
    this.chipMat = createShrapnelCrystalMaterial(this.noiseAtlas, this.sharedUniforms);
    this.shrapnelMesh = new THREE.InstancedMesh(chipGeo, this.chipMat, MAX_SHRAPNEL);
    this.shrapnelMesh.name = 'SwordVfx_DC3_ShrapnelAndWedges';
    this.shrapnelMesh.frustumCulled = false;
    this.shrapnelMesh.count = 0;
    this.group.add(this.shrapnelMesh);

    // 4. Detonation Ground Scar & 3D Snow-Rime / Slag Basin InstancedMesh (Strictly for Detonations!)
    const decalGeo = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    this.decalMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_DETONATION_DECALS * 4),
      4
    );
    decalGeo.setAttribute('aDecalMeta', this.decalMetaAttr);
    this.decalMat = createDetonationDecalMaterial(this.noiseAtlas, this.sharedUniforms);
    this.detonationDecalMesh = new THREE.InstancedMesh(
      decalGeo,
      this.decalMat,
      MAX_DETONATION_DECALS
    );
    this.detonationDecalMesh.name = 'SwordVfx_DC4_DetonationGroundDecal';
    this.detonationDecalMesh.frustumCulled = false;
    this.detonationDecalMesh.count = 0;
    this.group.add(this.detonationDecalMesh);
  }

  _seedShrapnelPool() {
    // 8 Airborne Tangential Blade Sparks emitted off `tipWorld` during the forward cleave (ZERO floor spikes!)
    this.tangentialSparkRecords = [];
    for (let i = 0; i < 8; i++) {
      const s = 17.3 + i * 23.1;
      this.tangentialSparkRecords.push({
        seed: hash11(s + 1.1) * 10.0,
        emitFrac: 0.38 + (i / 7) * 0.54,
        bladeFrac: 0.76 + 0.24 * hash11(s + 2.3),
        speed: 5.8 + 3.4 * hash11(s + 3.7),
        outwardSpeed: 1.2 + 1.5 * hash11(s + 4.9),
        liftSpeed: signedHash(s + 6.1) * 1.2,
        size: 0.08 + 0.06 * hash11(s + 7.3), // 0.08..0.14m as specified
        spawned: false,
        spawnAge: 0,
        spawnPos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
      });
    }

    this.detonationWedgeRecords = [];
    for (let i = 0; i < 28; i++) {
      const s = 51.3 + i * 23.7;
      const isRingWedge = i < 22;
      const az = ((i / 28) * TAU + signedHash(s + 1.3) * 0.08 + TAU) % TAU;
      const inCameraWindow = az < 3.65 || az > 5.95;
      this.detonationWedgeRecords.push({
        isRingWedge,
        inCameraWindow,
        seed: hash11(s + 2.9) * 10.0,
        az,
        radial: (inCameraWindow ? 1.45 : 1.35) + (inCameraWindow ? 0.75 : 1.35) * hash11(s + 4.1),
        lean: (inCameraWindow ? 0.62 : 0.36) + 0.26 * hash11(s + 5.7),
        vOut: 4.5 + 4.2 * hash11(s + 7.1),
        vy: 6.2 + 3.5 * hash11(s + 8.5),
        height: (inCameraWindow ? 0.56 : 2.55) + (inCameraWindow ? 0.24 : 0.85) * hash11(s + 9.9),
        radius: (inCameraWindow ? 0.20 : 0.44) + (inCameraWindow ? 0.07 : 0.16) * hash11(s + 11.3),
        spin: signedHash(s + 13.1) * 8.0,
        stagger: hash11(s + 15.3) * 0.10,
      });
    }
  }

  _applyPaletteToUniforms(styleKey, isDetonationPalette = false) {
    const norm = normalizeStyleKey(styleKey);
    const pal = BREATHING_PALETTES[norm] || BREATHING_PALETTES.solar;
    const isEclipse = norm === 'eclipse' || (isDetonationPalette && this.infusionStyle === 'eclipse');
    this.sharedUniforms.uDualEclipse.value = isEclipse ? 1.0 : 0.0;
    if (!isDetonationPalette) {
      this.sharedUniforms.uSlashBand0.value.set(pal.band0);
      this.sharedUniforms.uSlashBand1.value.set(pal.band1);
      this.sharedUniforms.uSlashBand2.value.set(pal.band2);
      this.sharedUniforms.uSlashInk.value.set(pal.ink);
    }
    this.sharedUniforms.uChipCore.value.set(pal.chipCore);
    this.sharedUniforms.uChipDeep.value.set(pal.chipDeep);
    this.sharedUniforms.uChipMid.value.set(pal.chipMid);
    this.sharedUniforms.uChipLit.value.set(pal.chipLit);
    this.sharedUniforms.uChipSeam.value.set(pal.chipSeam);
    this.sharedUniforms.uDecalDeep.value.set(pal.decalDeep);
    this.sharedUniforms.uDecalBase.value.set(pal.decalBase);
    this.sharedUniforms.uDecalEdge.value.set(pal.decalEdge);
  }

  _getRightSwordNode() {
    if (!this.knightChar) return null;
    return (
      this.knightChar.equippedWeapons?.['handSlot.r'] ||
      this.knightChar.sockets?.['handSlot.r'] ||
      null
    );
  }

  /**
   * Samples `(guardWorld, tipWorld)` directly from `rightSword.matrixWorld`
   * (or synthesizes along the measured bone trajectory if `knightChar` is not attached).
   */
  _sampleCurrentBladeSegment(outGuard, outTip, fallbackProgressU = 0.5) {
    const rightSword = this._getRightSwordNode();
    if (rightSword && this.knightChar?.group) {
      this.knightChar.group.updateMatrixWorld(true);
      outGuard.copy(LOCAL_BLADE_GUARD).applyMatrix4(rightSword.matrixWorld);
      outTip.copy(LOCAL_BLADE_TIP).applyMatrix4(rightSword.matrixWorld);
      return true;
    }

    // Fallback bone trajectory synthesizer when `knightChar` is not attached
    const sw = this.swingState;
    const cfg = SWING_CONFIGS[sw.type] || SWING_CONFIGS.combo1;
    const u = clamp(fallbackProgressU, 0.0, 1.0);
    const span = cfg.arcSpan || Math.PI * 1.2;
    const localAng = (u - 0.48) * span;
    const tilt = cfg.tiltZ || -0.48;

    const cosY = Math.cos(sw.yaw);
    const sinY = Math.sin(sw.yaw);
    const fwdX = sinY;
    const fwdZ = cosY;
    const rightX = cosY;
    const rightZ = -sinY;

    const dirRight = Math.sin(localAng) * Math.cos(tilt);
    const dirUp = Math.sin(localAng) * Math.sin(tilt);
    const dirFwd = Math.cos(localAng);

    const dx = rightX * dirRight + fwdX * dirFwd;
    const dy = dirUp;
    const dz = rightZ * dirRight + fwdZ * dirFwd;
    const invLen = 1.0 / (Math.hypot(dx, dy, dz) || 1.0);

    const cx = sw.origin.x + fwdX * 0.25;
    const cy = sw.origin.y + 1.12;
    const cz = sw.origin.z + fwdZ * 0.25;

    outGuard.set(cx + dx * invLen * 0.52, cy + dy * invLen * 0.52, cz + dz * invLen * 0.52);
    outTip.set(cx + dx * invLen * 1.73, cy + dy * invLen * 1.73, cz + dz * invLen * 1.73);
    return false;
  }

  /**
   * Adds a new `(guardWorld, tipWorld)` control posture and subdivides the step from
   * `(prevGuard, prevTip)` into 4 Catmull-Rom / radial-preserved sub-slices ending
   * 100% on `(guardW, tipW)` at `sub === SUB_SLICES_PER_STEP`.
   */
  _pushControlPostureAndSubdivide(
    guardW,
    tipW,
    dtStep = 0.012,
    ageAtEnd = 0.0,
    activeFracOverride = null
  ) {
    const newCtrl = {
      guard: guardW.clone(),
      tip: tipW.clone(),
      age: ageAtEnd,
    };

    const ctrlCount = this.controlPostures.length;
    if (ctrlCount === 0) {
      this.controlPostures.push(newCtrl);
      this.trailSlices.unshift({
        guard: guardW.clone(),
        tip: tipW.clone(),
        age: ageAtEnd,
      });
      return;
    }

    // Catmull-Rom interpolates between q1 (t=0, previous posture) and q2 (t=1, newCtrl)!
    const q1 = this.controlPostures[ctrlCount - 1];
    const q0 = this.controlPostures[Math.max(0, ctrlCount - 2)];
    const q2 = newCtrl;
    const q3 = {
      guard: _interpGuard.copy(q2.guard).multiplyScalar(2).sub(q1.guard).clone(),
      tip: _interpTip.copy(q2.tip).multiplyScalar(2).sub(q1.tip).clone(),
    };

    // Emit tangential airborne blade sparks when the swing crosses their emitFrac
    const sw = this.swingState;
    const activeSpan = Math.max(0.05, sw.activeEnd - sw.activeStart);
    const currActiveU =
      activeFracOverride !== null && activeFracOverride !== undefined
        ? saturate(activeFracOverride)
        : saturate((sw.age - ageAtEnd - sw.activeStart) / activeSpan);

    const fwdX = Math.sin(sw.yaw);
    const fwdZ = Math.cos(sw.yaw);

    for (let s = 0; s < this.tangentialSparkRecords.length; s++) {
      const sp = this.tangentialSparkRecords[s];
      if (!sp.spawned && currActiveU >= sp.emitFrac) {
        _tangDir.subVectors(tipW, q1.tip);
        if (_tangDir.lengthSq() < 1e-5) {
          _tangDir.set(fwdX, -0.2, fwdZ);
        }
        _tangDir.normalize();
        const fwdDot = _tangDir.x * fwdX + _tangDir.z * fwdZ;
        if (fwdDot < 0.2 && currActiveU < 0.65) {
          continue;
        }
        if (fwdDot < 0.35) {
          _tangDir.x = lerp(_tangDir.x, fwdX, 0.65);
          _tangDir.z = lerp(_tangDir.z, fwdZ, 0.65);
          _tangDir.normalize();
        }
        sp.spawned = true;
        sp.spawnAge = Math.max(0, sw.age - ageAtEnd);
        sp.spawnPos.lerpVectors(guardW, tipW, sp.bladeFrac);
        _bladeDir.subVectors(tipW, guardW).normalize();
        sp.vel
          .copy(_tangDir)
          .multiplyScalar(sp.speed)
          .addScaledVector(_bladeDir, sp.outwardSpeed);
        sp.vel.y += sp.liftSpeed;
      }
    }

    // Knight chest pivot for radial arc preservation on fast swings
    if (this.knightChar?.group) {
      _pivot.copy(this.knightChar.group.position);
    } else {
      _pivot.copy(sw.origin);
    }
    _pivot.y += 1.12;

    const len1 = q1.guard.distanceTo(q1.tip);
    const len2 = q2.guard.distanceTo(q2.tip);
    const rad1 = q1.tip.distanceTo(_pivot);
    const rad2 = q2.tip.distanceTo(_pivot);

    for (let sub = 1; sub <= SUB_SLICES_PER_STEP; sub++) {
      const t = sub / SUB_SLICES_PER_STEP;
      if (sub === SUB_SLICES_PER_STEP) {
        // Exact lock to physical sword blade at t = 1.0 (zero lag or drift!)
        _interpGuard.copy(guardW);
        _interpTip.copy(tipW);
      } else {
        catmullRomVec3(q0.guard, q1.guard, q2.guard, q3.guard, t, _interpGuard);
        catmullRomVec3(q0.tip, q1.tip, q2.tip, q3.tip, t, _interpTip);

        // Preserve radial arc curvature around the Knight's shoulder/chest pivot and exact blade length
        const targetBladeLen = lerp(len1, len2, t);
        const targetTipRad = lerp(rad1, rad2, t);

        _radialVec.subVectors(_interpTip, _pivot);
        const curRad = _radialVec.length();
        if (curRad > 1e-4) {
          _radialVec.multiplyScalar(lerp(curRad, targetTipRad, 0.55) / curRad);
          _interpTip.copy(_pivot).add(_radialVec);
        }

        _bladeDir.subVectors(_interpTip, _interpGuard);
        if (_bladeDir.lengthSq() > 1e-5) {
          _bladeDir.normalize();
          _interpGuard.copy(_interpTip).addScaledVector(_bladeDir, -targetBladeLen);
        }
      }

      const subAge = ageAtEnd + (1.0 - t) * dtStep;
      this.trailSlices.unshift({
        guard: _interpGuard.clone(),
        tip: _interpTip.clone(),
        age: subAge,
      });
    }

    this.controlPostures.push(newCtrl);
    if (this.controlPostures.length > 4) {
      this.controlPostures.shift();
    }
    if (this.trailSlices.length > MAX_TRAIL_SLICES) {
      this.trailSlices.length = MAX_TRAIL_SLICES;
    }
  }

  /**
   * Rebuilds the vertex buffer (`position`, `normal`, `uv`, `aSliceAge`, `index`) of `liveRibbonMesh`.
   */
  _rebuildLiveRibbonBuffer() {
    const geo = this.liveRibbonMesh.geometry;
    const posArr = geo.attributes.position.array;
    const normArr = geo.attributes.normal.array;
    const uvArr = geo.attributes.uv.array;
    const ageArr = geo.attributes.aSliceAge.array;
    const idxArr = geo.index.array;

    let vertOffset = 0;
    let idxOffset = 0;

    // 1. Live Bone-Tracked Sword Trail Ribbon (`u = 0..1` newest blade edge -> oldest tail, `v = 0..1` guard -> tip)
    const sliceCount = Math.min(this.trailSlices.length, MAX_TRAIL_SLICES);
    if (sliceCount >= 2) {
      const cfg = SWING_CONFIGS[this.swingState.type] || SWING_CONFIGS.combo1;
      const isThrust = Boolean(cfg.isThrust);

      for (let i = 0; i < sliceCount; i++) {
        const s = this.trailSlices[i];
        const sPrev = this.trailSlices[Math.max(0, i - 1)];
        const sNext = this.trailSlices[Math.min(sliceCount - 1, i + 1)];

        const u = i / (sliceCount - 1);
        const age01 = clamp(s.age / Math.max(0.04, this.trailLifetime), 0.0, 1.0);

        _bladeDir.subVectors(s.tip, s.guard);
        const bladeLen = _bladeDir.length() || 1.0;
        _bladeDir.divideScalar(bladeLen);

        _tangDir.subVectors(sPrev.tip, sNext.tip);
        if (_tangDir.lengthSq() < 1e-6) {
          _tangDir.set(0, 1, 0);
        } else {
          _tangDir.normalize();
        }

        _arcNorm.crossVectors(_tangDir, _bladeDir);
        if (_arcNorm.lengthSq() < 1e-5) {
          _arcNorm.set(0, 1, 0);
        } else {
          _arcNorm.normalize();
        }

        // Orthogonal wing basis perpendicular to `_bladeDir` for thrust wake (`combo4` / `intercept`)
        // Ensures even a straight forward lunge thrust carves a wide, artistic Ukiyo-e spiral/wing wake
        // along the blade from hilt (`v=0`) to tip (`v=1`) without EVER extending past `s.tip`!
        let wingX = 0;
        let wingY = 0;
        let wingZ = 0;
        if (isThrust && u > 0) {
          _radialVec.crossVectors(_bladeDir, UP);
          if (_radialVec.lengthSq() < 1e-4) {
            _radialVec.set(1, 0, 0);
          } else {
            _radialVec.normalize();
          }
          _pos.crossVectors(_radialVec, _bladeDir).normalize();
          const spiralAng = u * 1.85 - 0.32;
          const ca = Math.cos(spiralAng);
          const sa = Math.sin(spiralAng);
          wingX = _radialVec.x * ca + _pos.x * sa;
          wingY = _radialVec.y * ca + _pos.y * sa;
          wingZ = _radialVec.z * ca + _pos.z * sa;
          _arcNorm.set(-_radialVec.x * sa + _pos.x * ca, -_radialVec.y * sa + _pos.y * ca, -_radialVec.z * sa + _pos.z * ca).normalize();
        }

        // Fuller 3D camber along `_arcNorm` so swings have rich sculptural body from every camera angle
        const twistSpan = (0.21 + 0.11 * Math.sin(u * Math.PI)) * (1.0 - age01 * 0.22);
        const thrustSpan = isThrust ? Math.sin(u * Math.PI * 0.88) * 0.78 : 0.0;

        for (let r = 0; r < RADIAL_VERTS; r++) {
          const v = r / (RADIAL_VERTS - 1);
          const offsetNorm = Math.sin(v * Math.PI) * twistSpan * (u > 0 ? 1.0 : 0.35);
          const thrustOffset = thrustSpan * (0.28 + 0.72 * Math.sin(v * Math.PI * 0.85));
          const vx = lerp(s.guard.x, s.tip.x, v) + _arcNorm.x * offsetNorm + wingX * thrustOffset;
          const vy = lerp(s.guard.y, s.tip.y, v) + _arcNorm.y * offsetNorm + wingY * thrustOffset;
          const vz = lerp(s.guard.z, s.tip.z, v) + _arcNorm.z * offsetNorm + wingZ * thrustOffset;

          const vIdx = vertOffset + r;
          posArr[vIdx * 3 + 0] = vx;
          posArr[vIdx * 3 + 1] = vy;
          posArr[vIdx * 3 + 2] = vz;

          normArr[vIdx * 3 + 0] = _arcNorm.x;
          normArr[vIdx * 3 + 1] = _arcNorm.y;
          normArr[vIdx * 3 + 2] = _arcNorm.z;

          uvArr[vIdx * 2 + 0] = u;
          uvArr[vIdx * 2 + 1] = v;
          ageArr[vIdx] = age01;
        }

        if (i < sliceCount - 1) {
          const row0 = vertOffset;
          const row1 = vertOffset + RADIAL_VERTS;
          for (let r = 0; r < RADIAL_VERTS - 1; r++) {
            const a = row0 + r;
            const b = row1 + r;
            const c = row1 + r + 1;
            const d = row0 + r + 1;
            idxArr[idxOffset++] = a;
            idxArr[idxOffset++] = b;
            idxArr[idxOffset++] = c;
            idxArr[idxOffset++] = a;
            idxArr[idxOffset++] = c;
            idxArr[idxOffset++] = d;
          }
        }
        vertOffset += RADIAL_VERTS;
      }
    }

    // 2. Optional Ground-Hugging Detonation Shockwave Crest Ribbon (Strictly during `triggerDetonation`)
    if (this.detonationState.active) {
      const det = this.detonationState;
      const uDet = det.age / Math.max(0.08, det.duration);
      if (uDet >= 0 && uDet < 0.96) {
        const emerge = outQuint(Math.min(1.0, uDet * 3.8));
        const innerR = 1.45 * emerge;
        const outerR = 2.55 * emerge;
        const ringBaseVert = vertOffset;

        for (let i = 0; i < DET_RING_SLICES; i++) {
          const u = i / (DET_RING_SLICES - 1);
          const ang = u * Math.PI * 1.65 + uDet * 1.2;
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);

          for (let r = 0; r < RADIAL_VERTS; r++) {
            const v = r / (RADIAL_VERTS - 1);
            const rad = lerp(innerR, outerR, v);
            const liftY = det.pos.y + 0.16 + v * 0.28 + Math.sin(u * Math.PI) * 0.12;
            const vIdx = vertOffset + r;

            posArr[vIdx * 3 + 0] = det.pos.x + sa * rad;
            posArr[vIdx * 3 + 1] = liftY;
            posArr[vIdx * 3 + 2] = det.pos.z + ca * rad;

            normArr[vIdx * 3 + 0] = sa;
            normArr[vIdx * 3 + 1] = 0.65;
            normArr[vIdx * 3 + 2] = ca;

            uvArr[vIdx * 2 + 0] = u;
            uvArr[vIdx * 2 + 1] = v;
            ageArr[vIdx] = uDet * 0.85;
          }

          if (i < DET_RING_SLICES - 1) {
            const row0 = ringBaseVert + i * RADIAL_VERTS;
            const row1 = row0 + RADIAL_VERTS;
            for (let r = 0; r < RADIAL_VERTS - 1; r++) {
              const a = row0 + r;
              const b = row1 + r;
              const c = row1 + r + 1;
              const d = row0 + r + 1;
              idxArr[idxOffset++] = a;
              idxArr[idxOffset++] = b;
              idxArr[idxOffset++] = c;
              idxArr[idxOffset++] = a;
              idxArr[idxOffset++] = c;
              idxArr[idxOffset++] = d;
            }
          }
          vertOffset += RADIAL_VERTS;
        }
      }
    }

    geo.setDrawRange(0, idxOffset);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
    geo.attributes.aSliceAge.needsUpdate = true;
    geo.index.needsUpdate = true;

    this.liveRibbonMesh.visible = idxOffset > 0;
  }

  /**
   * Attaches the opaque cel-shaded Blade Sheath Mesh (`userData.isVfx = true`)
   * directly to `knightChar.equippedWeapons['handSlot.r']`.
   */
  attachToKnight(knightChar) {
    this.knightChar = knightChar || null;
    if (!knightChar) return this;

    const rightSword =
      knightChar.equippedWeapons?.['handSlot.r'] ||
      knightChar.sockets?.['handSlot.r'] ||
      knightChar.modelRoot;

    if (rightSword && typeof rightSword.add === 'function') {
      rightSword.add(this.sheathMesh);
      this.sheathMesh.userData.isVfx = true;
      rightSword.updateMatrixWorld(true);
    }
    return this;
  }

  /**
   * Sets the Knight's active Sword Breathing Style (`'none' | 'rime' | 'solar' | 'tempest' | 'eclipse'`).
   */
  setInfusion(style = 'none', duration = 12) {
    const norm = normalizeStyleKey(style);
    this.infusionStyle = norm;
    this.infusionTimer = norm === 'none' ? 0 : Math.max(0.1, duration);

    const pal = BREATHING_PALETTES[norm] || BREATHING_PALETTES.none;
    this.sheathMat.uniforms.uColorBand0.value.set(pal.band0);
    this.sheathMat.uniforms.uColorBand1.value.set(pal.band1);
    this.sheathMat.uniforms.uColorBand2.value.set(pal.band2);
    this.sheathMat.uniforms.uColorInk.value.set(pal.ink);

    this.sheathMesh.visible = norm !== 'none';
    this._applyPaletteToUniforms(norm, false);
    return this;
  }

  /**
   * Alias for `setInfusion` supporting `setBreathingStyle('eclipse' | 'solar' | 'rime' | 'tempest' | 'none')`.
   */
  setBreathingStyle(style = 'none', duration = 12) {
    return this.setInfusion(style, duration);
  }

  /**
   * Starts a live bone-tracked sword swing synced to KayKit's melee animation clip.
   */
  triggerSwing(swingType = 'combo1', origin = null, yaw = null, styleOverride = null, opts = {}) {
    const typeKey = SWING_CONFIGS[swingType] ? swingType : 'combo1';
    const cfg = SWING_CONFIGS[typeKey];
    const style = normalizeStyleKey(
      styleOverride || (this.infusionStyle !== 'none' ? this.infusionStyle : 'none')
    );

    if (origin) {
      this.swingState.origin.set(
        origin.x ?? origin[0] ?? 0,
        origin.y ?? origin[1] ?? 0,
        origin.z ?? origin[2] ?? 0
      );
    } else if (this.knightChar?.group) {
      this.swingState.origin.copy(this.knightChar.group.position);
    }

    this.swingState.yaw =
      yaw !== null && yaw !== undefined
        ? yaw
        : this.knightChar?.group
          ? this.knightChar.group.rotation.y
          : 0;
    this.swingState.type = typeKey;
    this.swingState.style = style;
    this.swingState.duration = opts.duration ?? cfg.duration;
    this.swingState.activeStart = cfg.activeStart;
    this.swingState.activeEnd = cfg.activeEnd;
    this.swingState.clip = cfg.clip;
    this.swingState.clipTime = null;
    this.swingState.age = 0;
    this.swingState.active = true;

    this.trailSlices.length = 0;
    this.controlPostures.length = 0;
    for (const sp of this.tangentialSparkRecords) {
      sp.spawned = false;
    }

    this._applyPaletteToUniforms(style, false);
    this.group.visible = true;
    return this;
  }

  /**
   * Cleanly ends an interrupted swing (e.g. when canceled by Dash or Shield Block).
   */
  endSwing() {
    this.swingState.active = false;
    this.trailSlices.length = 0;
    this.controlPostures.length = 0;
    this._rebuildLiveRibbonBuffer();
    return this;
  }

  /**
   * Triggers one of the Physical Detonations at `pos`:
   * `'shatterblow' | 'solar_flare' | 'thunderchain' | 'eclipse'`.
   */
  triggerDetonation(type = 'shatterblow', pos = [0, 0, 0]) {
    const normType = normalizeStyleKey(type);
    const style =
      normType === 'eclipse' || this.infusionStyle === 'eclipse'
        ? 'eclipse'
        : normType !== 'none'
          ? normType
          : 'rime';
    const px = pos.x ?? pos[0] ?? 0;
    const pz = pos.z ?? pos[2] ?? 0;
    const py = pos.y ?? pos[1] ?? this.getGroundHeight(px, pz);

    this.detonationState.active = true;
    this.detonationState.type = type;
    this.detonationState.style = style;
    this.detonationState.pos.set(px, py, pz);
    this.detonationState.age = 0;
    this.detonationState.duration = 0.90;

    this._applyPaletteToUniforms(style, true);
    this.group.visible = true;
    this._evaluateState(this.sharedUniforms.uTime.value);
    return this;
  }

  setLighting({ sunDir, daylight = 1.0 } = {}) {
    if (sunDir) this.sharedUniforms.uSunDir.value.copy(sunDir).normalize();
    if (Number.isFinite(daylight)) this.sharedUniforms.uDaylight.value = clamp(daylight, 0.0, 1.2);
  }

  getCameraShakeOffset(target = new THREE.Vector3()) {
    return target.copy(this._shakeOffset);
  }

  getHitstopScale() {
    return this._hitstopScale;
  }

  /**
   * Reconstructs the exact 16-substep Catmull-Rom bone-tracked sword trail:
   * - In live gameplay (`preserveLiveAction === true`), reads the active swing
   *   `AnimationAction.time` directly from `knightChar` after `knightChar.update(dt)`,
   *   steps `liveAction.time` across `[clipStart .. clipEnd]` to build the smooth
   *   16-substep trail, and restores `liveAction.time` without EVER calling
   *   `poseAt()` (`mixer.stopAllAction()`) or mutating `loop` / `clampWhenFinished`!
   * - In deterministic screenshot seeker mode (`preserveLiveAction === false`),
   *   samples `[tStart, tEnd]` via `poseAt()` for static frame capture.
   */
  _reconstructBoneTrailForCurrentSwing({ preserveLiveAction = false, dt = 0.016 } = {}) {
    if (!this.swingState.active) return;
    const sw = this.swingState;
    const cfg = SWING_CONFIGS[sw.type] || SWING_CONFIGS.combo1;
    const clipName = sw.clip || cfg.clip;

    if (preserveLiveAction) {
      const anim = this.knightChar?.anim;
      const liveClipName = anim?.currentClipName;
      const liveAction = liveClipName ? anim.rawActions.get(liveClipName) : null;
      const isPlayingSwing = Boolean(
        liveAction &&
          liveAction.isRunning() &&
          (liveClipName === clipName || anim.currentKey === sw.type)
      );

      if (!isPlayingSwing) {
        // Knight has transitioned out of the swing clip (into dash, sprint, run, or idle).
        // NEVER touch knightChar's mixer; simply age out existing trail slices naturally!
        for (let i = this.trailSlices.length - 1; i >= 0; i--) {
          this.trailSlices[i].age += dt;
          if (this.trailSlices[i].age >= this.trailLifetime) {
            this.trailSlices.splice(i, 1);
          }
        }
        return;
      }

      const curClipTime = liveAction.time;
      const curTimeScale = Math.max(0.2, liveAction.getEffectiveTimeScale() || 1.0);
      const cleaveStart = cfg.clipCleaveStart ?? cfg.startTime;
      const cleaveEnd = cfg.clipCleaveEnd ?? cfg.startTime + cfg.activeEnd * cfg.timeScale;

      this.trailSlices.length = 0;
      this.controlPostures.length = 0;
      for (const sp of this.tangentialSparkRecords) {
        sp.spawned = false;
      }

      if (curClipTime < cleaveStart) {
        return;
      }

      const clipEnd = Math.min(curClipTime, cleaveEnd);
      const fadeAfterCleave = Math.max(0, (curClipTime - cleaveEnd) / curTimeScale);
      if (fadeAfterCleave >= this.trailLifetime) {
        return;
      }

      const clipTrailSpan = Math.max(0.02, (this.trailLifetime - fadeAfterCleave) * curTimeScale);
      const clipStart = Math.max(cleaveStart, clipEnd - clipTrailSpan);

      if (clipEnd > clipStart + 0.002) {
        const SUBSTEPS = 16;
        const dtSub = (clipEnd - clipStart) / curTimeScale / SUBSTEPS;
        const cleaveSpan = Math.max(0.04, cleaveEnd - cleaveStart);

        for (let step = 0; step <= SUBSTEPS; step++) {
          const uStep = step / SUBSTEPS;
          const tClipSample = lerp(clipStart, clipEnd, uStep);
          const sliceAgeAtTarget = Math.max(0, (curClipTime - tClipSample) / curTimeScale);
          const activeFrac = saturate((tClipSample - cleaveStart) / cleaveSpan);

          liveAction.time = tClipSample;
          this.knightChar.mixer.update(0);
          this.knightChar.group.updateMatrixWorld(true);

          this._sampleCurrentBladeSegment(_guardW, _tipW, activeFrac);
          this._pushControlPostureAndSubdivide(
            _guardW,
            _tipW,
            dtSub,
            sliceAgeAtTarget,
            activeFrac
          );
        }

        // Restore exact liveAction.time without stopping or mutating any AnimationAction properties
        liveAction.time = curClipTime;
        this.knightChar.mixer.update(0);
        this.knightChar.group.updateMatrixWorld(true);
      }
      return;
    }

    // Deterministic seeker path (`preserveLiveAction === false`, e.g., `seek()`)
    const targetClipTime =
      sw.clipTime !== null && sw.clipTime !== undefined
        ? sw.clipTime
        : cfg.startTime + sw.age * cfg.timeScale;

    this.trailSlices.length = 0;
    this.controlPostures.length = 0;
    for (const sp of this.tangentialSparkRecords) {
      sp.spawned = false;
    }

    const tEnd = Math.min(sw.age, cfg.activeEnd);
    const trailFadeAfterEnd = Math.max(0, sw.age - cfg.activeEnd);
    if (trailFadeAfterEnd >= this.trailLifetime) {
      return;
    }
    const tStart = Math.max(cfg.activeStart, sw.age - this.trailLifetime);

    if (sw.age >= cfg.activeStart && tEnd > tStart + 0.002) {
      const SUBSTEPS = 16;
      const dtSub = (tEnd - tStart) / SUBSTEPS;
      const activeSpan = Math.max(0.04, cfg.activeEnd - cfg.activeStart);
      const canPoseKnight = Boolean(this.knightChar && typeof this.knightChar.poseAt === 'function');

      for (let step = 0; step <= SUBSTEPS; step++) {
        const uStep = step / SUBSTEPS;
        const tSwing = lerp(tStart, tEnd, uStep);
        const sliceAgeAtTarget = sw.age - tSwing;
        const tClipSample = Math.max(0.01, cfg.startTime + tSwing * cfg.timeScale);
        const activeFrac = saturate((tSwing - cfg.activeStart) / activeSpan);

        if (canPoseKnight) {
          this.knightChar.poseAt(clipName, tClipSample);
        }
        this._sampleCurrentBladeSegment(_guardW, _tipW, activeFrac);
        this._pushControlPostureAndSubdivide(
          _guardW,
          _tipW,
          dtSub,
          sliceAgeAtTarget,
          activeFrac
        );
      }

      if (canPoseKnight) {
        this.knightChar.poseAt(clipName, Math.max(0.01, targetClipTime));
      }
    }
  }

  /**
   * Deterministic timeline & pose seeker for screenshot/video verification.
   */
  seek(timeSeconds, poseConfig = null) {
    this.sharedUniforms.uTime.value = timeSeconds;

    if (poseConfig) {
      if (poseConfig.infusion !== undefined) {
        this.setInfusion(poseConfig.infusion, 12);
      }
      if (poseConfig.swing) {
        const sw = poseConfig.swing;
        this.triggerSwing(sw.type || 'combo2', sw.origin, sw.yaw, sw.style || poseConfig.infusion);
        this.swingState.age = sw.age ?? timeSeconds;
        this.swingState.clip = sw.clip || SWING_CONFIGS[this.swingState.type].clip;
        this.swingState.clipTime = sw.clipTime ?? poseConfig.clipTime ?? null;
      } else {
        this.swingState.active = false;
        this.trailSlices.length = 0;
        this.controlPostures.length = 0;
      }
      if (poseConfig.detonation) {
        const det = poseConfig.detonation;
        this.triggerDetonation(det.type || 'shatterblow', det.pos);
        this.detonationState.age = det.age ?? timeSeconds;
      } else {
        this.detonationState.active = false;
      }
    } else {
      if (this.swingState.active) this.swingState.age = timeSeconds;
      if (this.detonationState.active) this.detonationState.age = timeSeconds;
    }

    if (this.swingState.active) {
      this._reconstructBoneTrailForCurrentSwing({ preserveLiveAction: false });
    }

    this._evaluateState(timeSeconds);
    return this;
  }

  _evaluateState(clockTime = 0) {
    this.sharedUniforms.uTime.value = clockTime;

    let chipSlot = 0;
    let decalSlot = 0;

    // 1. Evaluate Active Sword Swing (Live Bone-Tracked Ribbon + 8 Airborne Tangential Sparks; ZERO floor garbage!)
    if (this.swingState.active) {
      const sw = this.swingState;
      this._applyPaletteToUniforms(sw.style, false);
      const isEclipseSwing = sw.style === 'eclipse' || this.infusionStyle === 'eclipse';

      if (sw.age <= sw.duration + this.trailLifetime) {
        const drag = 2.4;
        for (let i = 0; i < this.tangentialSparkRecords.length && chipSlot < MAX_SHRAPNEL; i++) {
          const sp = this.tangentialSparkRecords[i];
          if (!sp.spawned) continue;
          const spAge = sw.age - sp.spawnAge;
          if (spAge < 0 || spAge > SPARK_LIFETIME) continue;

          const spU = saturate(spAge / SPARK_LIFETIME);
          const dissolveProgress = smoothstep(0.22, 0.98, spU);
          if (dissolveProgress >= 0.995) continue;

          const dragT = (1.0 - Math.exp(-drag * spAge)) / drag;
          const wx = sp.spawnPos.x + sp.vel.x * dragT;
          const wy = sp.spawnPos.y + sp.vel.y * dragT - 0.5 * 6.0 * spAge * spAge;
          const wz = sp.spawnPos.z + sp.vel.z * dragT;

          _dummy.position.set(wx, wy, wz);
          _pos.copy(sp.vel).normalize();
          _dummy.quaternion.setFromUnitVectors(UP, _pos);
          // Physical Scale Rule: 0.08..0.14m tangential spark dissolves via NoiseAtlas erosion without shrinking!
          _dummy.scale.set(sp.size * 0.55, sp.size * 1.45, sp.size * 0.55);
          _dummy.updateMatrix();
          this.shrapnelMesh.setMatrixAt(chipSlot, _dummy.matrix);
          const signedSeed = isEclipseSwing && i % 2 === 1 ? -Math.max(0.05, sp.seed) : sp.seed;
          this.chipMetaAttr.setXYZW(chipSlot, signedSeed, 1.4, 1.0, dissolveProgress);
          chipSlot++;
        }
      } else {
        this.swingState.active = false;
        this.trailSlices.length = 0;
      }
    }

    // 2. Evaluate Active Physical Detonation (`shatterblow`, `solar_flare`, `thunderchain`, `eclipse`)
    if (this.detonationState.active) {
      const det = this.detonationState;
      const u = det.age / Math.max(0.08, det.duration);
      if (u >= 0 && u <= 1.0) {
        this._applyPaletteToUniforms(det.style, true);
        const isEclipseDet =
          det.style === 'eclipse' ||
          det.type === 'eclipse' ||
          this.infusionStyle === 'eclipse';
        const dx = det.pos.x;
        const dy = det.pos.y;
        const dz = det.pos.z;
        const fadeDet = 1.0 - smoothstep(0.62, 1.0, u);
        const emerge = outQuint(Math.min(1.0, u * 3.8));

        // 2a. 3D Snow-Rime / Volcanic-Slag / Fulgurite-Scar Detonation Ground Plate (Strictly on Detonations!)
        if (decalSlot < MAX_DETONATION_DECALS) {
          _dummy.position.set(dx, dy + 0.045, dz);
          _dummy.quaternion.identity();
          const rad = 4.65 * smoothstep(0.0, 0.22, u);
          _dummy.scale.set(rad, 1.0, rad);
          _dummy.updateMatrix();
          this.detonationDecalMesh.setMatrixAt(decalSlot, _dummy.matrix);
          this.decalMetaAttr.setXYZW(decalSlot, u, 1.0, 0.59, fadeDet);
          decalSlot++;
        }

        // 2b. 28 Solid 3D Detonation Glacier Spires / Solar Pillar Cinders / Fulgurite Monoliths
        //     In 'eclipse' mode (or when blessed), alternate the 28 radial spires between
        //     Glacier Ice Spires (negative seed) and Incandescent Magma Spires (positive seed)!
        for (let i = 0; i < this.detonationWedgeRecords.length && chipSlot < MAX_SHRAPNEL; i++) {
          const rec = this.detonationWedgeRecords[i];
          const dissolveProgress = smoothstep(0.48, 0.98, u + rec.stagger);
          if (dissolveProgress >= 0.995) continue;

          const spireSeed =
            isEclipseDet && i % 2 === 1 ? -Math.max(0.05, rec.seed) : Math.max(0.05, rec.seed);

          if (det.type === 'solar_flare' && !rec.isRingWedge) {
            const cDist = rec.radial + rec.vOut * det.age * 0.55;
            const wx = dx + Math.cos(rec.az) * cDist;
            const wz = dz + Math.sin(rec.az) * cDist;
            const wy = dy + 0.35 + rec.vy * det.age - 0.5 * 16.0 * det.age * det.age;
            _dummy.position.set(wx, Math.max(dy + 0.1, wy), wz);
            _euler.set(rec.spin * det.age, rec.az, rec.spin * det.age * 0.6);
            _dummy.quaternion.setFromEuler(_euler);
            const sc = rec.radius * 1.15 * emerge;
            _dummy.scale.set(sc, sc * 1.8, sc);
            _dummy.updateMatrix();
            this.shrapnelMesh.setMatrixAt(chipSlot, _dummy.matrix);
            this.chipMetaAttr.setXYZW(chipSlot, spireSeed, 1.3 * fadeDet, 1.0, dissolveProgress);
            chipSlot++;
          } else {
            const rSpread =
              det.type === 'thunderchain'
                ? lerp(2.6, 0.75, emerge) * (0.68 + 0.32 * (i % 2))
                : rec.radial * (0.62 + 0.52 * emerge);
            const wx = dx + Math.cos(rec.az) * rSpread;
            const wz = dz + Math.sin(rec.az) * rSpread;
            const wy = this.getGroundHeight(wx, wz) - 0.15;

            _dummy.position.set(wx, wy, wz);
            const isMagmaSpire = det.type === 'solar_flare' || (isEclipseDet && i % 2 === 0);
            const leanAng = isMagmaSpire ? rec.lean * 0.52 : rec.lean;
            _pos.set(
              Math.cos(rec.az) * Math.sin(leanAng),
              Math.cos(leanAng),
              Math.sin(rec.az) * Math.sin(leanAng)
            ).normalize();
            _dummy.quaternion.setFromUnitVectors(UP, _pos);
            const hMult = isMagmaSpire ? 1.42 : 1.25;
            _dummy.scale.set(
              rec.radius * emerge,
              rec.height * hMult * emerge,
              rec.radius * emerge
            );
            _dummy.updateMatrix();
            this.shrapnelMesh.setMatrixAt(chipSlot, _dummy.matrix);
            this.chipMetaAttr.setXYZW(chipSlot, spireSeed, 1.3 * fadeDet, 0.0, dissolveProgress);
            chipSlot++;
          }
        }

        // 70ms Hitstop & 0.14m Camera Punch on Detonation
        this._hitstopScale = det.age <= 0.07 ? 0.05 : 1.0;
        if (det.age <= 0.35) {
          const env = Math.exp(-det.age * 8.5) * 0.14;
          this._shakeOffset.set(
            Math.sin(det.age * 58.0) * env,
            Math.abs(Math.cos(det.age * 64.0)) * env,
            Math.cos(det.age * 52.0) * env
          );
        } else {
          this._shakeOffset.set(0, 0, 0);
        }
      } else {
        this.detonationState.active = false;
        this._hitstopScale = 1.0;
        this._shakeOffset.set(0, 0, 0);
      }
    } else {
      this._hitstopScale = 1.0;
      this._shakeOffset.set(0, 0, 0);
    }

    // Rebuild dynamic vertex buffer of `liveRibbonMesh`
    this._rebuildLiveRibbonBuffer();

    this.shrapnelMesh.count = chipSlot;
    this.shrapnelMesh.instanceMatrix.needsUpdate = true;
    this.chipMetaAttr.needsUpdate = true;

    this.detonationDecalMesh.count = decalSlot;
    this.detonationDecalMesh.instanceMatrix.needsUpdate = true;
    this.decalMetaAttr.needsUpdate = true;

    const anyWorldActive = this.liveRibbonMesh.visible || chipSlot > 0 || decalSlot > 0;
    this.group.visible = anyWorldActive;
  }

  update(dt) {
    this.sharedUniforms.uTime.value += dt;

    if (this.infusionStyle !== 'none' && this.infusionTimer > 0) {
      this.infusionTimer -= dt;
      if (this.infusionTimer <= 0) {
        this.setInfusion('none', 0);
      }
    }

    if (this.swingState.active) {
      this.swingState.age += dt;
      this._reconstructBoneTrailForCurrentSwing({ preserveLiveAction: true, dt });
    }

    if (this.detonationState.active) {
      this.detonationState.age += dt;
    }

    if (
      this.swingState.active ||
      this.detonationState.active ||
      this.trailSlices.length > 0 ||
      this.group.visible
    ) {
      this._evaluateState(this.sharedUniforms.uTime.value);
    }
  }

  getStats() {
    let drawCalls = 0;
    if (this.sheathMesh.visible && this.sheathMesh.parent) drawCalls++;
    if (this.group.visible) {
      if (this.liveRibbonMesh.visible) drawCalls++;
      if (this.shrapnelMesh.count > 0) drawCalls++;
      if (this.detonationDecalMesh.count > 0) drawCalls++;
    }
    return {
      active: drawCalls > 0,
      infusionStyle: this.infusionStyle,
      drawCalls,
      sheathVisible: Boolean(this.sheathMesh.visible && this.sheathMesh.parent),
      activeSlashRibbons: this.group.visible && this.liveRibbonMesh.visible ? 1 : 0,
      activeTrailSlices: this.trailSlices.length,
      activeShrapnel: this.group.visible ? this.shrapnelMesh.count : 0,
      activeDecals: this.group.visible ? this.detonationDecalMesh.count : 0,
    };
  }

  clear() {
    this.infusionStyle = 'none';
    this.infusionTimer = 0;
    this.sheathMesh.visible = false;
    this.swingState.active = false;
    this.detonationState.active = false;
    this.trailSlices.length = 0;
    this.controlPostures.length = 0;
    this._hitstopScale = 1.0;
    this._shakeOffset.set(0, 0, 0);
    this.group.visible = false;
    this.liveRibbonMesh.visible = false;
    this.liveRibbonMesh.geometry.setDrawRange(0, 0);
    this.shrapnelMesh.count = 0;
    this.detonationDecalMesh.count = 0;
  }

  dispose() {
    this.clear();
    if (this.sheathMesh.parent) {
      this.sheathMesh.parent.remove(this.sheathMesh);
    }
    this.sheathMesh.geometry.dispose();
    this.sheathMat.dispose();
    this.liveRibbonMesh.geometry.dispose();
    this.slashMat.dispose();
    this.shrapnelMesh.geometry.dispose();
    this.chipMat.dispose();
    this.detonationDecalMesh.geometry.dispose();
    this.decalMat.dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

export function createSwordVfxSystem(options = {}) {
  return new SwordVfxSystem(options);
}
