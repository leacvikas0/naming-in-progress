// ============================================================================
// world/assets/vfx/artorious-vfx.js
//
// Divine Verdict ("Court of Bloody Dark Flowers & The Eclipse") Overhaul:
// 4-Beat Witcher 3 (Iris von Everec Manor) Briar Jail, Underground Slump
// & Loose Crimson Petal Dissolve VFX Engine
//
// Visual & Engineering Contract:
// - Strictly <= 4 Draw Calls when active, 0 Draw Calls when idle:
//   1. DC 1 (`skyRibbonsMesh`): Dark crimson-obsidian calligraphic breeze wisps
//      during Prayer (`0.35x` slow wind) and Beat 1/4 transitions.
//   2. DC 2 (`monolithsMesh`): `MAX_MONOLITHS = 24` instances of the Blender 5.2
//      baked `BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch` arranged in a dense
//      double-ring interwoven lattice dome (`12` clockwise-weaving + `12`
//      counter-clockwise-weaving arches spanning the duo footprint). Driven by
//      curve-extruded growth in the vertex/fragment shader via `uv.x` (`uCurveT`
//      vs `growthProgress` in `aMonolithMeta.y`) and downward retraction via
//      `aMonolithMeta.z` (`submergeDepth`) with a razor-sharp ground-plane
//      portal `discard` (`vWorldPos.y < vGroundY - 0.01`).
//   3. DC 3 (`prismsAndDebrisMesh`): `240` instances of `createPlushRosePetalGeometry()`
//      — `32` world-space drifting crimson petals + `8` camera-foreground
//      soft-focus crimson petals in `channel` (`Frame 37`); `64` scattering
//      matte crimson petals in Beat 4 (`2.20s..2.50s`); and `240` upward-spiraling
//      blood-crimson petals (`kind = 2.0` for all 240 instances, zero golden
//      embers!) in `smite` (`Frame 41`).
//   4. DC 4 (`groundSigilMesh`): `MAX_GROUND_SIGILS = 2` instances of the
//      Blender 5.2 baked `BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump` shaded
//      with cel-banded vertex colors and dark velvet-umber contour ink (`#24080e`)
//      — zero procedural rings, zero broken concrete rubble.
// - Universal "Zero Glass" Law: Every mesh uses `transparent: false,
//   depthWrite: true, side: THREE.FrontSide`.
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';
import { BLENDER_VOLUMETRIC_FLOWERS } from '../flowers/blender-flower-data.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

function smoothstep(edge0, edge1, x) {
  const t = saturate((x - edge0) / Math.max(1e-6, edge1 - edge0));
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

export const ARTORIOUS_VFX_DEFAULTS = Object.freeze({
  // Locked 4-Beat Blessing / Heal / Miracle Timeline (4.80s total: 2.10s slow-to-whip asymmetric net growth -> 0.55s underground yank -> 1.60s flower slump HP fill -> 0.55s pop-up)
  blessingTotalDuration: 4.8,
  beat1FastJailEnd: 2.1,
  beat2SubmergeEnd: 2.65,
  beat3UndergroundEnd: 4.25,
  beat4PopUpEnd: 4.8,

  // Locked Smite Timeline (2.80s total, Frame 41)
  smiteTotalDuration: 2.8,
  smiteLifetime: 1.45,
  smiteFadeTime: 1.35,

  healDuration: 2.75,
  healFadeTime: 2.05,
  blessingDuration: 2.75,
  blessingFadeTime: 2.05,
  miracleDuration: 2.75,
  miracleFadeTime: 2.05,

  // Radii & Heights
  channelOrbitRadius: 2.4,
  channelSigilRadius: 1.45,
  smiteScarRadius: 1.15,
  miracleSigilRadius: 1.55,
  skyHeight: 7.5,
  smiteSkyHeight: 6.2,

  // Dark Crimson & Velvet Wild-Rose Palette (Witcher 3 Iris Manor & Frame 37/41/57)
  colorMiracleInk: '#24080e',
  colorMiracleAmber: '#5a0613',
  colorMiracleGoldMid: '#b81428',
  colorMiracleCore: '#e11d48',

  colorCathCore: '#4a040e',
  colorCathMid: '#8f0d1e',
  colorCathFacet: '#b81428',
  colorCathRim: '#e11d48',
  colorSakuraBlush: '#e11d48',
  colorAzureVein: '#fb4b68',
  colorCathInk: '#24080e',

  colorPetalInk: '#24080e',
  colorPetalMid: '#b81428',

  // Velvet Blood-Rose & Petal Dissolve Palette (Pure Ruby Blood-Crimson: R >> G, B > G)
  colorRoseOuter: '#42010a',
  colorRoseCup: '#9e051c',
  colorRoseCore: '#e60c2c',
  colorRoseInk: '#220207',

  colorSmiteInk: '#1c0206',
  colorSmiteDeep: '#42010a',
  colorSmiteMid: '#a8061e',
  colorSmiteCore: '#e60c2c',
});

/* ------------------------------------------------------------------------- */
/* 1. True 3D Botanical Geometries (Blender Briar Arch, Crimson Slump,       */
/*    Plush 3D Rose Petal, and Opaque Wind Ribbon)                           */
/* ------------------------------------------------------------------------- */

/**
 * Builds the BufferGeometry for `DC 2 (monolithsMesh)` directly from the
 * Headless Blender 5.2 baked `BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch`.
 * Includes `position`, `normal`, `color` (Linear RGB), and `uv` (`[uCurveT, vPartKind]`).
 */
export function createWitcherBriarArchGeometry() {
  const data = BLENDER_VOLUMETRIC_FLOWERS.witcherBriarArch;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.pos.slice(), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.nrm.slice(), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(data.col.slice(), 3));
  if (data.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(data.uv.slice(), 2));
  }
  if (data.anc) {
    geo.setAttribute('aSpineAnchor', new THREE.BufferAttribute(data.anc.slice(), 3));
  } else {
    geo.setAttribute('aSpineAnchor', new THREE.BufferAttribute(data.pos.slice(), 3));
  }
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/**
 * Builds the BufferGeometry for `DC 4 (groundSigilMesh)` directly from the
 * Headless Blender 5.2 baked `BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump`.
 */
export function createCrimsonFlowerSlumpGeometry() {
  const data = BLENDER_VOLUMETRIC_FLOWERS.crimsonFlowerSlump;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.pos.slice(), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.nrm.slice(), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(data.col.slice(), 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/**
 * Kept exported for backward compatibility with existing geometry consumers.
 */
export function createSacredLotusPetalGeometry({
  radialSegments = 16,
  heightSegments = 16,
} = {}) {
  const cols = Math.max(8, radialSegments);
  const rows = Math.max(8, heightSegments);
  const positions = [];
  const uvs = [];
  const cavities = [];
  const indices = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const widthProfile =
      Math.sin(Math.pow(v, 0.62) * Math.PI) * (1.0 + 0.36 * Math.sin(v * Math.PI));
    const halfWidth = Math.max(0.02, widthProfile * 0.96);
    const halfThick = Math.max(
      0.018,
      (1.0 - v * 0.55) * 0.19 * (0.42 + 0.58 * Math.sin(v * Math.PI))
    );
    const outwardCurve = Math.pow(v, 1.42) * 0.36;

    for (let c = 0; c < cols; c++) {
      const theta = (c / cols) * TAU;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const x = cosT * halfWidth;
      const cupDish = (1.0 - cosT * cosT) * 0.2 * Math.sin(v * Math.PI);
      const z = sinT * halfThick - cupDish - outwardCurve;
      const y = v;

      positions.push(x, y, z);
      uvs.push(cosT * 0.5 + 0.5, v);
      const cupDepth = (1.0 - cosT * cosT) * Math.sin(v * Math.PI);
      const baseCavity = clamp(1.0 - v * 1.35, 0.0, 1.0);
      const innerFace = sinT > 0 ? 0.25 : 0.0;
      cavities.push(clamp(cupDepth * 0.5 + baseCavity * 0.38 + innerFace, 0.0, 1.0));
    }
  }

  const baseCenterIdx = positions.length / 3;
  positions.push(0, 0, 0);
  uvs.push(0.5, 0);
  cavities.push(1.0);

  const tipCenterIdx = positions.length / 3;
  positions.push(0, 1.0, -0.36);
  uvs.push(0.5, 1.0);
  cavities.push(0.0);

  for (let r = 0; r < rows; r++) {
    const rowA = r * cols;
    const rowB = (r + 1) * cols;
    for (let c = 0; c < cols; c++) {
      const nextC = (c + 1) % cols;
      const a = rowA + c;
      const b = rowA + nextC;
      const d = rowB + c;
      const e = rowB + nextC;
      indices.push(a, d, b, b, d, e);
    }
  }
  for (let c = 0; c < cols; c++) {
    indices.push(baseCenterIdx, c, (c + 1) % cols);
  }
  const topRow = rows * cols;
  for (let c = 0; c < cols; c++) {
    indices.push(topRow + c, tipCenterIdx, topRow + ((c + 1) % cols));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aCavity', new THREE.Float32BufferAttribute(cavities, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a closed, plush 3D Curved Crimson Rose Petal Geometry (`THREE.FrontSide`)
 * with a rounded, broadly cupped rose-petal silhouette (wide upper lip + gentle
 * bilobed heart curve, zero pointy guitar-pick triangles) for `prismsAndDebrisMesh`.
 */
export function createPlushRosePetalGeometry({
  radialSegments = 12,
  heightSegments = 8,
} = {}) {
  const cols = Math.max(8, radialSegments);
  const rows = Math.max(6, heightSegments);
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    // Rounded obovate rose petal profile: narrow base attachment, wide rounded upper belly (v ~ 0.65..0.88), soft rounded top margin
    const obovate = Math.sin(Math.pow(v, 0.42) * Math.PI * 0.96);
    const topRound = 1.0 - Math.pow(Math.max(0, (v - 0.78) / 0.22), 2.2) * 0.35;
    const halfWidth = Math.max(0.04, obovate * topRound * 0.54);
    const halfThick = Math.max(0.018, Math.sin(v * Math.PI) * 0.085 + 0.016);
    const sCurveZ =
      Math.sin(v * Math.PI * 1.05) * 0.14 - Math.pow(Math.max(0, v - 0.62), 1.8) * 0.24;

    for (let c = 0; c < cols; c++) {
      const theta = (c / cols) * TAU;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const x = cosT * halfWidth;
      // Subtle bilobed heart dip at the center of the upper petal lip
      const heartNotch =
        Math.pow(v, 3.0) * (1.0 - Math.min(1.0, Math.abs(cosT) * 2.2)) * 0.055;
      const y = (v - 0.5) * 0.96 - heartNotch;
      const cupZ = (1.0 - cosT * cosT) * 0.13 * Math.sin(v * Math.PI);
      const z = sinT * halfThick - cupZ + sCurveZ;

      positions.push(x, y, z);
      uvs.push(cosT * 0.5 + 0.5, v);
    }
  }

  const baseIdx = positions.length / 3;
  positions.push(0, -0.48, 0);
  uvs.push(0.5, 0);

  const tipIdx = positions.length / 3;
  positions.push(0, 0.43, -0.09);
  uvs.push(0.5, 1);

  for (let r = 0; r < rows; r++) {
    const rowA = r * cols;
    const rowB = (r + 1) * cols;
    for (let c = 0; c < cols; c++) {
      const nextC = (c + 1) % cols;
      const a = rowA + c;
      const b = rowA + nextC;
      const d = rowB + c;
      const e = rowB + nextC;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  for (let c = 0; c < cols; c++) {
    const nextC = (c + 1) % cols;
    indices.push(baseIdx, c, nextC);
  }
  const topRow = rows * cols;
  for (let c = 0; c < cols; c++) {
    const nextC = (c + 1) % cols;
    indices.push(topRow + c, tipIdx, topRow + nextC);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createSculptedLotusSanctuaryGeometry() {
  return createCrimsonFlowerSlumpGeometry();
}

export function createOpaqueRibbonGeometry(nodes = 128) {
  const steps = Math.max(16, Math.round(nodes));
  const positions = new Float32Array(steps * 4 * 3);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const o = i * 12;
    positions[o + 0] = t;
    positions[o + 1] = -1;
    positions[o + 2] = 1;
    positions[o + 3] = t;
    positions[o + 4] = 1;
    positions[o + 5] = 1;
    positions[o + 6] = t;
    positions[o + 7] = -1;
    positions[o + 8] = -1;
    positions[o + 9] = t;
    positions[o + 10] = 1;
    positions[o + 11] = -1;
  }

  const indices = new Uint16Array((steps - 1) * 12);
  for (let i = 0; i < steps - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    const o = i * 12;
    indices[o + 0] = a + 0;
    indices[o + 1] = b + 0;
    indices[o + 2] = a + 1;
    indices[o + 3] = a + 1;
    indices[o + 4] = b + 0;
    indices[o + 5] = b + 1;

    indices[o + 6] = a + 2;
    indices[o + 7] = a + 3;
    indices[o + 8] = b + 2;
    indices[o + 9] = a + 3;
    indices[o + 10] = b + 3;
    indices[o + 11] = b + 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

/* ------------------------------------------------------------------------- */
/* 2. Opaque Gouache & Cel Shaders (`transparent: false, depthWrite: true`)  */
/* ------------------------------------------------------------------------- */

function createSkyRibbonMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'ArtoriousSkyRibbonMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uColorSmiteInk: { value: new THREE.Color(config.colorSmiteInk) },
      uColorSmiteDeep: { value: new THREE.Color(config.colorSmiteDeep) },
      uColorSmiteMid: { value: new THREE.Color(config.colorSmiteMid) },
      uColorSmiteCore: { value: new THREE.Color(config.colorSmiteCore) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aStartPos;
      attribute vec3 aEndPos;
      attribute vec4 aRibbonMeta;  // x: strandNorm (-1..1), y: seed, z: width, w: activeReach (0..1)
      attribute vec4 aRibbonStyle; // x: styleId, y: erodeProgress, z: helixRadius, w: turns

      uniform float uTime;

      varying float vSide;
      varying float vT;
      varying float vSeed;
      varying float vReach;
      varying float vErodeProgress;

      vec3 evalRibbonPoint(
        float t,
        vec3 startP,
        vec3 endP,
        vec3 basisU,
        vec3 basisV,
        float strandNorm,
        float seed,
        float helixRadius,
        float turns
      ) {
        float tt = clamp(t, 0.0, 1.0);
        float smoothT = tt * tt * (3.0 - 2.0 * tt);
        vec3 p = mix(startP, endP, mix(tt, smoothT, 0.35));

        float effectiveRadius = max(0.35, helixRadius);
        float effectiveTurns = max(0.65, turns);
        float spinDir = strandNorm >= 0.0 ? 1.0 : -1.0;
        float ringAng =
          seed * 6.28318 +
          effectiveTurns * 6.28318 * tt * spinDir -
          uTime * 0.85;

        float radEnv = (0.82 + 0.28 * sin(tt * 3.14159265)) * mix(0.90, 1.15, tt);
        vec3 radial = basisU * cos(ringAng) + basisV * sin(ringAng);
        p += radial * effectiveRadius * radEnv;
        p.y += sin(tt * 6.28318 * 1.2 + seed * 3.1 - uTime * 1.1) * 0.10;
        return p;
      }

      void main() {
        float strandNorm = aRibbonMeta.x;
        float seed = aRibbonMeta.y;
        float baseWidth = aRibbonMeta.z;
        float reach = aRibbonMeta.w;
        float erodeProgress = aRibbonStyle.y;
        float helixRadius = aRibbonStyle.z;
        float turns = aRibbonStyle.w;

        vSide = position.y;
        vT = position.x;
        vSeed = seed;
        vReach = reach;
        vErodeProgress = erodeProgress;

        if (reach <= 0.001 || baseWidth <= 0.001 || erodeProgress >= 0.995) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        vec3 delta = aEndPos - aStartPos;
        float segLen = max(0.001, length(delta));
        vec3 axis = delta / segLen;
        vec3 ref = abs(axis.y) > 0.90 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 basisU = normalize(cross(axis, ref));
        vec3 basisV = normalize(cross(axis, basisU));

        float t = position.x * min(1.0, reach);
        float eps = 0.008;
        vec3 p0 = evalRibbonPoint(t, aStartPos, aEndPos, basisU, basisV, strandNorm, seed, helixRadius, turns);
        vec3 pa = evalRibbonPoint(max(0.0, t - eps), aStartPos, aEndPos, basisU, basisV, strandNorm, seed, helixRadius, turns);
        vec3 pb = evalRibbonPoint(min(1.0, t + eps), aStartPos, aEndPos, basisU, basisV, strandNorm, seed, helixRadius, turns);

        vec3 tangent = normalize(pb - pa + vec3(1e-5, 1e-5, 0.0));
        vec3 viewDir = normalize(cameraPosition - p0);
        vec3 ribbonOrtho = normalize(cross(viewDir, tangent) + basisU * 1e-4);

        float startTaper = smoothstep(0.0, 0.18, t);
        float endTaper = smoothstep(1.0, 0.72, t);
        float bodyTaper = startTaper * endTaper * (0.68 + 0.32 * sin(t * 3.14159265));

        float w = baseWidth * bodyTaper;
        vec3 world = p0 + ribbonOrtho * (position.y * w) + viewDir * (position.z * 0.008);

        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform vec3 uColorSmiteInk;
      uniform vec3 uColorSmiteDeep;
      uniform vec3 uColorSmiteMid;
      uniform vec3 uColorSmiteCore;

      varying float vSide;
      varying float vT;
      varying float vSeed;
      varying float vReach;
      varying float vErodeProgress;

      void main() {
        if (vReach <= 0.01 || vT > vReach || vErodeProgress >= 0.995) discard;

        float wispWave = sin(vT * 14.0 - uTime * 2.2 + vSeed * 6.283) * 0.5 + 0.5;
        vec4 nGap = texture2D(uNoiseAtlas, vec2(vT * 2.2 - uTime * 0.45 + vSeed * 0.41, vSeed * 0.73));
        float wispMetric = nGap.b * 0.55 + wispWave * 0.45;
        float targetErode = max(vErodeProgress, 0.48);
        if (wispMetric < targetErode) discard;

        float edgeDist = abs(vSide);
        vec2 nUv = vec2(vT * 2.0 - uTime * 1.2 + vSeed * 0.37, vSide * 0.40 + vSeed * 0.73);
        vec4 nSample = texture2D(uNoiseAtlas, nUv);

        float centerWeight = 1.0 - edgeDist;
        float plasmaErode = centerWeight * 0.88 + (nSample.b - 0.36) * 0.16;
        if (plasmaErode < 0.45) discard;

        vec3 col = uColorSmiteDeep;
        col = mix(col, uColorSmiteMid, step(0.56, plasmaErode));
        col = mix(col, uColorSmiteCore, step(0.75, plasmaErode));

        float inkBorder = 1.0 - smoothstep(0.45, 0.53, plasmaErode);
        col = mix(col, uColorSmiteInk, inkBorder * 0.82);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createMonolithMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'ArtoriousMonolithMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uColorRoseInk: { value: new THREE.Color(config.colorRoseInk) },
      uColorBarkInk: { value: new THREE.Color('#2d1609') },
      uTubeRadiusScale: { value: 1.95 },
      uFlowerScale: { value: 1.32 },
      uBowerCenter: { value: new THREE.Vector3(0, 0, 0) },
      uBowerAO: { value: 0.88 },
      uSapIntensity: { value: 1.15 },
      uWetness: { value: 1.15 },
      uEclipseRim: { value: 0.92 },
      uBarkTone: { value: 2.0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec3 aSpineAnchor;
      attribute vec4 aMonolithMeta; // x: seed, y: growthProgress (0..1), z: submergeDepth (m), w: groundY (m)

      uniform float uTubeRadiusScale;
      uniform float uFlowerScale;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vVertexColor;
      varying float vCurveT;
      varying float vPartKind;
      varying float vGrowthProgress;
      varying float vGroundY;
      varying float vSeed;

      void main() {
        float uCurveT = uv.x;
        float partKind = uv.y;
        float growthProgress = clamp(aMonolithMeta.y, 0.0, 1.05);
        float submergeDepth = aMonolithMeta.z;
        float groundY = aMonolithMeta.w;

        vCurveT = uCurveT;
        vPartKind = partKind;
        vGrowthProgress = growthProgress;
        vGroundY = groundY;
        vSeed = aMonolithMeta.x;
        vVertexColor = color;

        float deltaT = growthProgress - uCurveT;

        // Living 3D coiling writhe wave applied equally to spine and surface so attached flowers never detach!
        float writheEnv = smoothstep(0.06, 0.45, uCurveT) * (1.0 - 0.55 * smoothstep(0.88, 1.0, growthProgress));
        float wPhase = uCurveT * 8.5 - growthProgress * 5.8 + vSeed * 2.1;
        vec3 writheOffset = vec3(
          sin(wPhase) * 0.048,
          cos(wPhase * 1.15) * 0.034,
          cos(wPhase) * 0.048
        ) * writheEnv;

        vec3 spinePt = aSpineAnchor + writheOffset;
        vec3 relVec = position - aSpineAnchor;
        vec3 localPos;

        if (partKind < 0.05) {
          // Woody coiling vine stem (partKind == 0.0): scale tube radius around its 3D spine by uTubeRadiusScale
          // and taper smoothly to a sharp conical tendril point at uCurveT == growthProgress!
          float tipTaper = smoothstep(-0.005, 0.24, deltaT);
          localPos = spinePt + relVec * (tipTaper * uTubeRadiusScale);
        } else if (partKind < 0.20) {
          // Curved amber-ivory-tipped rose thorns (partKind == 0.08): scale outward with uTubeRadiusScale
          float thornSprout = smoothstep(0.0, 0.14, deltaT);
          localPos = spinePt + relVec * (thornSprout * mix(1.0, uTubeRadiusScale, 0.85));
        } else {
          // Leaves (0.5), Crimson Star-Lilies (0.85/0.88), Blush-Rose Clusters (0.92), Velvet Roses (1.0):
          // Bloom smoothly outward from their exact stem attachment point scaled by uFlowerScale!
          float sprout = smoothstep(0.01, 0.24, deltaT);
          float bloomScale = sprout * (1.0 + 0.16 * sin(sprout * 3.14159)) * uFlowerScale;
          localPos = spinePt + relVec * bloomScale;
        }

        mat4 instMat = modelMatrix * instanceMatrix;
        vec4 world = instMat * vec4(localPos, 1.0);
        world.y -= submergeDepth;
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
      uniform vec3 uColorRoseInk;
      uniform vec3 uColorBarkInk;
      uniform vec3 uBowerCenter;
      uniform float uBowerAO;
      uniform float uSapIntensity;
      uniform float uWetness;
      uniform float uEclipseRim;
      uniform float uBarkTone;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vVertexColor;
      varying float vCurveT;
      varying float vPartKind;
      varying float vGrowthProgress;
      varying float vGroundY;
      varying float vSeed;

      void main() {
        // 1. Razor-sharp horizontal ground-plane portal cut during Beat 2 submerge
        if (vWorldPos.y < vGroundY - 0.01) discard;

        // 2. Curve-extruded growth cut along uCurveT
        if (vGrowthProgress <= 0.001 || vCurveT > vGrowthProgress + 0.004) discard;

        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        vec3 L = normalize(vec3(uSunDir.x, max(0.54, uSunDir.y), uSunDir.z));
        vec3 H = normalize(L + V);
        float ndl = dot(N, L) * 0.5 + 0.5;
        float ndh = clamp(dot(N, H), 0.0, 1.0);

        // ==================================================================
        // REALISTIC 3D BOWER DEPTH & GROUND-CONTACT AMBIENT OCCLUSION
        // Inner coils, rear layers, and base contact fall into deep dark-fantasy
        // shadow while outer foreground coils catch warm cylindrical light!
        // ==================================================================
        vec3 relBower = vWorldPos - uBowerCenter;
        float radialDist = length(relBower.xz);
        float camDepthFactor = smoothstep(-1.15, 1.20, dot(relBower.xz, normalize(cameraPosition.xz - uBowerCenter.xz + vec2(1e-4))));
        float shellFactor = smoothstep(0.48, 1.95, radialDist);
        float groundAO = 0.52 + 0.48 * smoothstep(0.0, 0.45, relBower.y);
        float rawBowerAO = clamp((0.30 + 0.44 * camDepthFactor + 0.32 * shellFactor) * groundAO, 0.24, 1.08);
        float bowerShade = mix(1.0, rawBowerAO, uBowerAO);

        vec3 baseCol = max(vVertexColor, vec3(0.001));
        vec3 col;

        if (vPartKind < 0.05) {
          // ==================================================================
          // 3D CYLINDRICAL OLIVE-WALNUT BARK WITH HELICAL CORD GROOVES,
          // NARROW VISCERAL CRIMSON SAP VEINS & WET SPECULAR SHEEN (1000373056.png)
          // ==================================================================
          vec2 barkUv = vec2(
            vCurveT * 11.0 + vSeed * 0.37,
            (vWorldPos.x * 3.2 - vWorldPos.z * 3.2 + vWorldPos.y * 1.4) + vSeed * 0.83
          );
          vec4 nBark = texture2D(uNoiseAtlas, barkUv);

          // Helical cord-grooves wrapping around the round coiling vine tube
          float helicalPhase = vCurveT * 38.0 + (vWorldPos.x - vWorldPos.z) * 14.0 + vWorldPos.y * 8.0 + nBark.r * 2.6;
          float helicalCord = sin(helicalPhase) * 0.5 + 0.5;
          float barkGrain = (nBark.g * 0.50 + nBark.b * 0.50) * 0.38 + helicalCord * 0.62;

          // Strong 3D cylindrical normal lighting (top-front key light + view normal) so each round tube pops in 3D!
          vec3 camKey = normalize(V * 0.55 + vec3(0.22, 0.88, 0.32));
          float cylDiffuse = clamp(dot(N, camKey) * 0.5 + 0.5, 0.0, 1.0);
          float tubeRoundness = cylDiffuse * 0.54 + pow(ndv, 0.85) * 0.46;
          float barkLight = clamp(tubeRoundness * 0.74 + barkGrain * 0.34 - 0.08, 0.0, 1.0);

          // Selectable Bark Palette:
          // Mode 0: Warm Olive-Walnut Reference (1000373056.png)
          // Mode 1: Deep Mossy Forest-Olive
          // Mode 2: Warm Aged Chestnut-Mahogany
          vec3 cGroove      = vec3(0.065, 0.042, 0.012);
          vec3 cOliveWalnut = vec3(0.360, 0.255, 0.082);
          vec3 cMossBronze  = vec3(0.680, 0.485, 0.155);
          vec3 cSunCord     = vec3(0.960, 0.720, 0.265);

          if (uBarkTone > 0.5 && uBarkTone < 1.5) {
            // Mode 1: Deep Mossy Woodland Olive
            cGroove      = vec3(0.045, 0.048, 0.012);
            cOliveWalnut = vec3(0.260, 0.295, 0.068);
            cMossBronze  = vec3(0.510, 0.565, 0.135);
            cSunCord     = vec3(0.810, 0.860, 0.240);
          } else if (uBarkTone >= 1.5) {
            // Mode 2: Warm Aged Chestnut-Mahogany
            cGroove      = vec3(0.085, 0.032, 0.012);
            cOliveWalnut = vec3(0.440, 0.185, 0.055);
            cMossBronze  = vec3(0.760, 0.365, 0.115);
            cSunCord     = vec3(1.020, 0.580, 0.210);
          }

          vec3 barkCol = mix(cGroove, cOliveWalnut, smoothstep(0.14, 0.36, barkLight));
          barkCol = mix(barkCol, cMossBronze, smoothstep(0.38, 0.62, barkLight));
          barkCol = mix(barkCol, cSunCord,    smoothstep(0.66, 0.88, barkLight));
          barkCol *= (0.34 + 0.66 * bowerShade);

          // Crisp, narrow Crimson-Red Sap Veins inside helical crevices & lower drip edge (20-25% coverage so olive bark shines!)
          float grooveSap = smoothstep(0.79, 0.95, 1.0 - helicalCord) * (0.50 + 0.50 * nBark.b);
          float undersideSap = smoothstep(-0.32, -0.78, N.y) * smoothstep(0.52, 0.82, nBark.r);
          float sapMask = clamp((grooveSap * 0.88 + undersideSap * 0.38) * uSapIntensity, 0.0, 1.0);

          vec3 cSapDeep = vec3(0.38, 0.008, 0.020) * (0.45 + 0.55 * bowerShade);
          vec3 cSapBright = vec3(0.96, 0.025, 0.060) * (0.58 + 0.42 * bowerShade);
          vec3 sapCol = mix(cSapDeep, cSapBright, smoothstep(0.25, 0.75, cylDiffuse * 0.65 + nBark.g * 0.35));
          col = mix(barkCol, sapCol, sapMask * 0.62);

          // Wet visceral specular sheen along the rounded vine cords & crimson sap veins
          float wetSpec = pow(ndh, 18.0) * (0.32 + 0.28 * sapMask) * uWetness * bowerShade;
          col += mix(vec3(0.65, 0.52, 0.22), vec3(0.98, 0.18, 0.25), sapMask) * wetSpec;

          // Overhead Blood-Eclipse crimson rim backlight on upper crown coils
          float eclipseRim = pow(1.0 - ndv, 2.6) * smoothstep(0.0, 0.85, N.y) * smoothstep(0.55, 2.25, relBower.y) * uEclipseRim;
          col += vec3(0.88, 0.025, 0.06) * eclipseRim * 0.52;

          // Crisp dark-umber silhouette contour around each 3D tube so overlapping coils separate cleanly!
          float inkRim = 1.0 - smoothstep(0.08, 0.22, ndv);
          col = mix(col, vec3(0.028, 0.014, 0.005), inkRim * 0.56);
        } else if (vPartKind < 0.20) {
          // ==================================================================
          // CURVED AMBER-IVORY-TIPPED ROSE THORNS (vPartKind == 0.08)
          // ==================================================================
          float celBand = mix(0.76, 1.28, smoothstep(0.24, 0.64, ndl)) * (0.46 + 0.54 * bowerShade);
          col = baseCol * celBand + vec3(0.45, 0.34, 0.20) * pow(ndh, 16.0) * 0.32 * uWetness;
        } else if (vPartKind < 0.75) {
          // ==================================================================
          // DARK MOSS-OLIVE & BURGUNDY-GREEN SERRATED LEAVES (vPartKind == 0.5)
          // ==================================================================
          float celBand = mix(0.68, 1.18, smoothstep(0.28, 0.58, ndl)) * (0.42 + 0.58 * bowerShade);
          celBand = mix(celBand, 1.38 * (0.46 + 0.54 * bowerShade), smoothstep(0.62, 0.82, ndl));
          col = baseCol * celBand;
          float inkRim = 1.0 - smoothstep(0.10, 0.22, ndv);
          col = mix(col, vec3(0.012, 0.024, 0.010), inkRim * 0.45);
        } else if (abs(vPartKind - 0.88) < 0.015) {
          // ==================================================================
          // GOLDEN-AMBER STAR-LILY STAMENS (vPartKind == 0.88)
          // ==================================================================
          col = mix(vec3(0.72, 0.32, 0.02), vec3(1.0, 0.84, 0.20), smoothstep(0.20, 0.75, ndl + ndv * 0.35)) * (0.65 + 0.35 * bowerShade);
        } else {
          // ==================================================================
          // SCULPTED 3D VELVET CRIMSON ROSES (1.0), STAR-LILIES (0.85) & BLUSH CLUSTERS (0.92)
          // Deep velvet-crimson inner petal whorl AO + sunlit scarlet/blush outer rims!
          // ==================================================================
          float petalLight = clamp(ndl * 0.62 + ndv * 0.38, 0.0, 1.0);
          float celBand = mix(0.42, 1.08, smoothstep(0.20, 0.54, petalLight));
          celBand = mix(celBand, 1.48, smoothstep(0.62, 0.86, petalLight));
          col = baseCol * celBand * (0.48 + 0.52 * bowerShade) + vec3(0.58, 0.09, 0.16) * pow(ndh, 14.0) * 0.22 * uWetness;
          float inkRim = 1.0 - smoothstep(0.10, 0.24, ndv);
          col = mix(col, uColorRoseInk, inkRim * 0.55);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createPrismsAndDebrisMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'ArtoriousPrismsAndDebrisMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uColorRoseOuter: { value: new THREE.Color(config.colorRoseOuter) },
      uColorRoseCup: { value: new THREE.Color(config.colorRoseCup) },
      uColorRoseCore: { value: new THREE.Color(config.colorRoseCore) },
      uColorRoseInk: { value: new THREE.Color(config.colorRoseInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aDebrisMeta; // x: seed, y: fgSoftFocusFlag, z: dissolveProgress, w: kind (2.0 = crimson_rose_petal)
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec4 vMeta;

      void main() {
        vUv = uv;
        vMeta = aDebrisMeta;

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
      uniform vec3 uColorRoseOuter;
      uniform vec3 uColorRoseCup;
      uniform vec3 uColorRoseCore;
      uniform vec3 uColorRoseInk;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec4 vMeta;

      void main() {
        float seed = vMeta.x;
        float isForegroundLens = step(1.5, vMeta.y);
        float dissolveProgress = clamp(vMeta.z, 0.0, 1.0);

        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(vec3(uSunDir.x, max(0.48, uSunDir.y), uSunDir.z));
        float ndl = dot(N, L) * 0.5 + 0.5;
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        vec4 nSample = texture2D(uNoiseAtlas, vWorldPos.xz * 0.55 + vec2(vWorldPos.y * 0.65 + seed * 0.37, seed * 0.83));
        float edgeDist = clamp(abs(vUv.x - 0.5) * 1.55 + vUv.y * 0.45, 0.0, 1.0);
        float erodeVal = nSample.b * 0.48 + nSample.g * 0.27 + (1.0 - edgeDist) * 0.25;
        if (erodeVal < dissolveProgress) discard;

        float softLight = clamp(ndl * 0.65 + ndv * 0.35, 0.0, 1.0);

        // Pure Velvet Ruby Blood-Crimson Rose Petal (R >> G, B > G so it stays 100% saturated in Frame 41 B&W Smite grade!)
        vec3 col = mix(uColorRoseOuter, uColorRoseCup, smoothstep(0.20, 0.64, softLight + vUv.y * 0.22));
        col = mix(col, uColorRoseCore, smoothstep(0.64, 0.94, softLight + vUv.y * 0.28));

        // Camera-foreground lens petals have a soft velvet gradient instead of a hard ink outline (Frame 37 & Frame 41)
        float inkRim = (1.0 - smoothstep(0.12, 0.22, ndv)) * mix(0.38, 0.12, isForegroundLens);
        col = mix(col, uColorRoseInk, inkRim);
        col.r = max(col.r, 0.28);
        col.g = min(col.g, col.r * 0.003);
        col.b = clamp(col.b, col.r * 0.055, col.r * 0.095);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createGroundSigilMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'ArtoriousGroundSigilMaterial',
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
      uColorRoseInk: { value: new THREE.Color(config.colorRoseInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec4 aSigilMeta; // x: dissolveProgress (0..1), y: reach (0..1), z: seed, w: modeFlag
      varying vec4 vMeta;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      varying vec3 vWorldNormal;
      varying vec3 vVertexColor;

      void main() {
        vMeta = aSigilMeta;
        vLocalPos = position;
        vVertexColor = color;

        float reach = clamp(aSigilMeta.y, 0.0, 1.5);
        vec3 scaledPos = vec3(position.x * reach, position.y * min(1.0, reach), position.z * reach);
        mat4 instMat = modelMatrix * instanceMatrix;
        vec4 world = instMat * vec4(scaledPos, 1.0);
        vWorldPos = world.xyz;
        vWorldNormal = normalize(mat3(instMat) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uDaylight;
      uniform vec3 uColorRoseInk;

      varying vec4 vMeta;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      varying vec3 vWorldNormal;
      varying vec3 vVertexColor;

      void main() {
        float dissolveProgress = clamp(vMeta.x, 0.0, 1.0);
        float reach = vMeta.y;
        float seed = vMeta.z;

        if (reach <= 0.01 || dissolveProgress >= 0.995) discard;

        vec4 n0 = texture2D(uNoiseAtlas, vWorldPos.xz * 0.45 + vec2(seed * 0.31, seed * 0.73));
        float rNorm = clamp(length(vLocalPos.xz) / 0.95, 0.0, 1.0);
        float erodeMetric = n0.b * 0.65 + (1.0 - rNorm) * 0.35;
        if (erodeMetric < dissolveProgress) discard;

        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(vec3(uSunDir.x, max(0.50, uSunDir.y), uSunDir.z));
        float ndl = dot(N, L) * 0.5 + 0.5;
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        // Keep Linear-RGB Blender vertex color directly in linear HDR space (post.js performs linearToSRGB!)
        vec3 baseCol = max(vVertexColor, vec3(0.001));
        float celBand = mix(0.68, 1.12, smoothstep(0.26, 0.58, ndl));
        celBand = mix(celBand, 1.35, smoothstep(0.68, 0.88, ndl));
        vec3 col = baseCol * celBand;

        // Crisp dark velvet-crimson contour ink (#220207) while preserving pure ruby blood-crimson ratio for Frame 41
        float inkRim = 1.0 - smoothstep(0.12, 0.24, ndv);
        col = mix(col, uColorRoseInk, inkRim * 0.42);
        col.r = max(col.r, 0.24);
        col.g = min(col.g, col.r * 0.003);
        col.b = clamp(col.b, col.r * 0.055, col.r * 0.095);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. Pooled, Deterministic ArtoriousVfxSystem (<= 4 Draw Calls Active)      */
/* ------------------------------------------------------------------------- */

const MAX_SKY_RIBBONS = 24;
const MAX_MONOLITHS = 36; // 36 wide asymmetric Witcher 3 multi-gauge root & briar net modules
const MAX_PRISMS_AND_DEBRIS = 240; // 240 3D curved crimson rose petals
const MAX_GROUND_SIGILS = 2; // 2 crimsonFlowerSlump cushions

const _dummy = new THREE.Object3D();
const _euler = new THREE.Euler();
const _identityMat = new THREE.Matrix4();
const _camFwd = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();

export class ArtoriousVfxSystem {
  constructor({
    scene,
    camera = null,
    getGroundHeight = () => 0,
    config = {},
  } = {}) {
    this.scene = scene || null;
    this.camera = camera || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.config = { ...ARTORIOUS_VFX_DEFAULTS, ...config };

    this.noiseAtlas = getSharedNoiseAtlas();

    this.sharedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
    };

    this.group = new THREE.Group();
    this.group.name = 'ArtoriousVfxRoot';
    this.group.visible = false;
    if (this.scene) {
      this.scene.add(this.group);
    }

    this.mode = 'blessing'; // 'channel' | 'smite' | 'rose_gommage' | 'heal' | 'blessing' | 'miracle'
    this.suspense = false;
    this.isLooping = false;
    this.active = false;
    this.age = 0;
    this.totalDuration = 4.8;

    this.origin = new THREE.Vector3(59.8, 0, -4.0);
    this.partnerPos = new THREE.Vector3(59.1, 0, -2.05);
    this.hasPartner = true;
    this.enemyCenter = new THREE.Vector3(75.1, 0, -3.8);
    this.hasEnemyCenter = false;

    this._shakeOffset = new THREE.Vector3();
    this._cameraLookOffset = new THREE.Vector3();
    this._hitstopScale = 1.0;
    this._originLevY = 0.0;
    this._partnerLevY = 0.0;
    this._undergroundHidden = false;
    this._characterDissolveProgress = 0.0;

    this._buildMeshes();
    this._seedRecords(1.0);
  }

  _buildMeshes() {
    const c = this.config;

    // DC 1: Smooth 128-Node 3D Helical Breeze Wisps (`skyRibbonsMesh`)
    const ribbonGeo = createOpaqueRibbonGeometry(128);
    this.startPosAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SKY_RIBBONS * 3), 3);
    this.endPosAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SKY_RIBBONS * 3), 3);
    this.ribbonMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SKY_RIBBONS * 4), 4);
    this.ribbonStyleAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SKY_RIBBONS * 4), 4);
    ribbonGeo.setAttribute('aStartPos', this.startPosAttr);
    ribbonGeo.setAttribute('aEndPos', this.endPosAttr);
    ribbonGeo.setAttribute('aRibbonMeta', this.ribbonMetaAttr);
    ribbonGeo.setAttribute('aRibbonStyle', this.ribbonStyleAttr);

    this.skyRibbonMat = createSkyRibbonMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.skyRibbonsMesh = new THREE.InstancedMesh(ribbonGeo, this.skyRibbonMat, MAX_SKY_RIBBONS);
    this.skyRibbonsMesh.name = 'Artorious_DC1_SkyRibbons';
    this.skyRibbonsMesh.frustumCulled = false;
    this.skyRibbonsMesh.count = 0;
    for (let i = 0; i < MAX_SKY_RIBBONS; i++) {
      this.skyRibbonsMesh.setMatrixAt(i, _identityMat);
    }
    this.skyRibbonsMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.skyRibbonsMesh);

    // DC 2: 36 Blender-Baked Witcher 3 Multi-Gauge Root & Briar Net Modules (`monolithsMesh`)
    const monolithGeo = createWitcherBriarArchGeometry();
    this.monolithMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_MONOLITHS * 4),
      4
    );
    monolithGeo.setAttribute('aMonolithMeta', this.monolithMetaAttr);
    this.monolithMat = createMonolithMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.monolithsMesh = new THREE.InstancedMesh(monolithGeo, this.monolithMat, MAX_MONOLITHS);
    this.monolithsMesh.name = 'Artorious_DC2_Monoliths';
    this.monolithsMesh.frustumCulled = false;
    this.monolithsMesh.count = 0;
    this.group.add(this.monolithsMesh);

    // DC 3: 240 Plush 3D Curved Crimson Rose Petals (`prismsAndDebrisMesh`)
    const petalGeo = createPlushRosePetalGeometry({
      radialSegments: 12,
      heightSegments: 8,
    });
    this.debrisMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_PRISMS_AND_DEBRIS * 4),
      4
    );
    petalGeo.setAttribute('aDebrisMeta', this.debrisMetaAttr);
    this.debrisMat = createPrismsAndDebrisMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.prismsAndDebrisMesh = new THREE.InstancedMesh(
      petalGeo,
      this.debrisMat,
      MAX_PRISMS_AND_DEBRIS
    );
    this.prismsAndDebrisMesh.name = 'Artorious_DC3_PrismsAndDebris';
    this.prismsAndDebrisMesh.frustumCulled = false;
    this.prismsAndDebrisMesh.count = 0;
    this.group.add(this.prismsAndDebrisMesh);

    // DC 4: Blender-Baked Crimson Flower Slump Cushion (`groundSigilMesh`)
    const sigilGeo = createCrimsonFlowerSlumpGeometry();
    this.sigilMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_GROUND_SIGILS * 4),
      4
    );
    sigilGeo.setAttribute('aSigilMeta', this.sigilMetaAttr);
    this.sigilMat = createGroundSigilMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.groundSigilMesh = new THREE.InstancedMesh(sigilGeo, this.sigilMat, MAX_GROUND_SIGILS);
    this.groundSigilMesh.name = 'Artorious_DC4_GroundSigil';
    this.groundSigilMesh.frustumCulled = false;
    this.groundSigilMesh.count = 0;
    this.group.add(this.groundSigilMesh);
  }

  _seedRecords(seed = 1.0) {
    // 1. 36 Interleaved Conical/Piriform Briar Mound Modules (`1000373056.png`):
    //    Ordered in interleaved 4-module groups (`i % 4 = tier 0, 1, 2, 3`) so any `activeBriarCount`
    //    from 12 to 36 preserves the complete conical mound silhouette:
    //    - Tier 0 (`i % 4 === 0`, 9 modules): Wide Cobblestone Base Coils (pitched low `+0.28..+0.38 rad`, wide `rx`, hugging the ground)
    //    - Tier 1 (`i % 4 === 1`, 9 modules): Left & Right Flank Window Coils (moderate pitch `+0.08..+0.18 rad`, framing Knight & Mage)
    //    - Tier 2 (`i % 4 === 2`, 9 modules): Conical Shoulder Boughs (pitched upward `-0.18..-0.28 rad`, tapering inward)
    //    - Tier 3 (`i % 4 === 3`, 9 modules): Tall Central Eclipse-Peak Crown Boughs (pitched steeply upward `-0.38..-0.50 rad`
    //      from rear-center anchors so the mound peaks at `y ~ 3.1m..3.5m` inside the lower ring of the Blood-Red Eclipse!)
    this.briarLatticeRecords = [];
    for (let i = 0; i < MAX_MONOLITHS; i++) {
      const s = seed * 37.3 + i * 23.1;
      const tier = i % 4;
      const tierIdx = Math.floor(i / 4); // 0..8 within each tier
      const weaveDir = (tierIdx + tier) % 2 === 0 ? 1.0 : -1.0;

      if (tier === 0) {
        // Tier 0: Wide Cobblestone Base Coils (low, wide ground-sprawling C-loops on left, right & front border)
        const baseAngles = [-0.15, Math.PI + 0.15, 0.35, Math.PI - 0.35, -0.55, Math.PI + 0.55, 0.82, Math.PI - 0.82, -1.57];
        const baseAng = baseAngles[tierIdx % baseAngles.length] + signedHash(s + 1.1) * 0.08;
        const sideStretch = Math.abs(Math.cos(baseAng));
        this.briarLatticeRecords.push({
          tier: 0,
          weaveDir,
          seed: hash11(s + 2.3) * 10.0,
          ang: baseAng,
          radialMultX: 1.08 + sideStretch * 0.26 + signedHash(s + 3.7) * 0.06,
          radialMultZ: 0.92 + signedHash(s + 4.1) * 0.06,
          offsetX: signedHash(s + 4.5) * 0.16,
          offsetZ: signedHash(s + 4.7) * 0.12,
          tangWeight: 0.62,
          inwardWeight: 0.68,
          yawSkew: weaveDir * (0.12 + hash11(s + 5.5) * 0.10),
          scaleX: 1.05 + 0.14 * hash11(s + 4.9),
          scaleY: 0.86 + 0.12 * hash11(s + 5.7),
          scaleZ: 1.02 + 0.12 * hash11(s + 6.3),
          // Positive X-rotation pitches +Z downward so outer base coils hug the cobblestones (y ~ 0.45..1.05m)
          inwardPitch: 0.28 + 0.10 * hash11(s + 7.1),
          rollTilt: weaveDir * (0.14 + 0.06 * hash11(s + 8.3)),
          staggerDelay: tierIdx * 0.025 + hash11(s + 9.1) * 0.04,
          growDuration: 1.28 + hash11(s + 9.7) * 0.22,
        });
      } else if (tier === 1) {
        // Tier 1: Left & Right Flank C-Coils framing the central Knight & Mage window (y ~ 1.25..1.80m)
        const flankAngles = [0.08, Math.PI - 0.08, -0.28, Math.PI + 0.28, 0.48, Math.PI - 0.48, -0.72, -2.42, -1.57];
        const baseAng = flankAngles[tierIdx % flankAngles.length] + signedHash(s + 1.1) * 0.07;
        this.briarLatticeRecords.push({
          tier: 1,
          weaveDir,
          seed: hash11(s + 2.3) * 10.0,
          ang: baseAng,
          radialMultX: 0.88 + Math.abs(Math.cos(baseAng)) * 0.16 + signedHash(s + 3.7) * 0.05,
          radialMultZ: 0.84 + signedHash(s + 4.1) * 0.06,
          offsetX: signedHash(s + 4.5) * 0.14,
          offsetZ: signedHash(s + 4.7) * 0.10,
          tangWeight: 0.54,
          inwardWeight: 0.76,
          yawSkew: weaveDir * (0.14 + hash11(s + 5.5) * 0.10),
          scaleX: 1.08 + 0.14 * hash11(s + 4.9),
          scaleY: 1.02 + 0.14 * hash11(s + 5.7),
          scaleZ: 1.06 + 0.12 * hash11(s + 6.3),
          inwardPitch: 0.08 + 0.08 * hash11(s + 7.1),
          rollTilt: weaveDir * (0.16 + 0.06 * hash11(s + 8.3)),
          staggerDelay: 0.10 + tierIdx * 0.032 + hash11(s + 9.1) * 0.05,
          growDuration: 1.34 + hash11(s + 9.7) * 0.22,
        });
      } else if (tier === 2) {
        // Tier 2: Upper-Mid Conical Shoulder Coils tapering inward symmetrically on both left & right shoulders (y ~ 1.95..2.55m)
        const shoulderAngles = [-0.52, Math.PI + 0.52, -0.88, Math.PI + 0.88, -0.28, Math.PI + 0.28, -1.18, Math.PI + 1.18, -1.57];
        const baseAng = shoulderAngles[tierIdx % shoulderAngles.length] + signedHash(s + 1.1) * 0.05;
        this.briarLatticeRecords.push({
          tier: 2,
          weaveDir,
          seed: hash11(s + 2.3) * 10.0,
          ang: baseAng,
          radialMultX: 0.68 + Math.abs(Math.cos(baseAng)) * 0.14 + signedHash(s + 3.7) * 0.04,
          radialMultZ: 0.72 + signedHash(s + 4.1) * 0.05,
          offsetX: signedHash(s + 4.5) * 0.10,
          offsetZ: signedHash(s + 4.7) * 0.08,
          tangWeight: 0.36,
          inwardWeight: 0.90,
          yawSkew: weaveDir * (0.08 + hash11(s + 5.5) * 0.08),
          scaleX: 1.10 + 0.14 * hash11(s + 4.9),
          scaleY: 1.16 + 0.14 * hash11(s + 5.7),
          scaleZ: 1.08 + 0.12 * hash11(s + 6.3),
          // Negative X-rotation pitches +Z upward toward the conical shoulder apex!
          inwardPitch: -0.18 - 0.08 * hash11(s + 7.1),
          rollTilt: weaveDir * (0.12 + 0.05 * hash11(s + 8.3)),
          staggerDelay: 0.18 + tierIdx * 0.036 + hash11(s + 9.1) * 0.04,
          growDuration: 1.38 + hash11(s + 9.7) * 0.20,
        });
      } else {
        // Tier 3: Tall Central Eclipse-Peak Crown Boughs (balanced left/right/center rear anchors, pitched steeply upward
        // so the top coils & star-lilies form a centered piriform peak at y ~ 2.9m..3.3m inside the Blood-Red Eclipse!)
        const crownAngles = [-1.57, -1.18, -1.96, -0.88, -2.26, -1.38, -1.76, -0.72, -2.42];
        const baseAng = crownAngles[tierIdx % crownAngles.length] + signedHash(s + 1.1) * 0.04;
        this.briarLatticeRecords.push({
          tier: 3,
          weaveDir,
          seed: hash11(s + 2.3) * 10.0,
          ang: baseAng,
          radialMultX: 0.42 + Math.abs(Math.cos(baseAng)) * 0.16 + signedHash(s + 3.7) * 0.04,
          radialMultZ: 0.58 + signedHash(s + 4.1) * 0.05,
          offsetX: signedHash(s + 4.5) * 0.08,
          offsetZ: signedHash(s + 4.7) * 0.06,
          tangWeight: 0.22,
          inwardWeight: 0.96,
          yawSkew: weaveDir * (0.06 + hash11(s + 5.5) * 0.06),
          scaleX: 1.12 + 0.14 * hash11(s + 4.9),
          scaleY: 1.24 + 0.14 * hash11(s + 5.7),
          scaleZ: 1.10 + 0.12 * hash11(s + 6.3),
          // Steep negative X-rotation (-0.36..-0.46 rad) lifts +Z upward into a tall conical Eclipse peak!
          inwardPitch: -0.36 - 0.10 * hash11(s + 7.1),
          rollTilt: weaveDir * (0.10 + 0.04 * hash11(s + 8.3)),
          staggerDelay: 0.26 + tierIdx * 0.038 + hash11(s + 9.1) * 0.04,
          growDuration: 1.42 + hash11(s + 9.7) * 0.18,
        });
      }
    }

    function isFrontGapOrCenter(v) {
      return Boolean(v);
    }

    // 2. 8 Camera-Foreground Soft-Focus Crimson Petals (Frame 37 & Frame 41 Outer Lens Border Framing)
    this.foregroundLensPetals = [
      { u: -0.88, v: 0.62, depth: 2.45, scale: 0.115, roll: 0.45, speed: 0.32 },
      { u: -0.86, v: -0.66, depth: 2.35, scale: 0.125, roll: -0.62, speed: 0.28 },
      { u: 0.88, v: -0.58, depth: 2.30, scale: 0.130, roll: 0.85, speed: 0.26 },
      { u: 0.86, v: 0.58, depth: 2.55, scale: 0.105, roll: -0.48, speed: 0.34 },
      { u: -0.90, v: 0.04, depth: 2.65, scale: 0.095, roll: 1.12, speed: 0.30 },
      { u: 0.90, v: 0.08, depth: 2.60, scale: 0.098, roll: -0.95, speed: 0.35 },
      { u: -0.62, v: -0.78, depth: 2.85, scale: 0.082, roll: 0.32, speed: 0.38 },
      { u: 0.64, v: -0.76, depth: 2.90, scale: 0.080, roll: -0.38, speed: 0.36 },
    ];

    // 3. 240 Curved 3D Crimson Rose Petals (100% kind = 2.0 blood-crimson rose petals, zero golden embers!)
    this.debrisRecords = [];
    for (let i = 0; i < MAX_PRISMS_AND_DEBRIS; i++) {
      const s = seed * 61.3 + i * 17.9;
      const spanU = i / MAX_PRISMS_AND_DEBRIS;
      const swirlAng = spanU * TAU * 7.0 + signedHash(s + 1.3) * 0.25;

      this.debrisRecords.push({
        seed: hash11(s + 4.1) * 10.0,
        ang: swirlAng,
        torsoY: 0.04 + 1.25 * Math.pow(hash11(s + 4.7), 1.35),
        torsoR: 0.05 + 0.42 * Math.pow(hash11(s + 5.1), 0.85),
        orbitRadius: 0.85 + 2.45 * hash11(s + 5.3),
        climbSpeed: 1.45 + 2.35 * hash11(s + 6.7),
        heightOffset: hash11(s + 7.9) * 5.6,
        burstSpeed: 1.65 + 2.85 * hash11(s + 8.3),
        windScale: 0.72 + 0.65 * hash11(s + 8.7),
        size: 0.055 + 0.052 * hash11(s + 9.1),
        spawnDelay: (i % 16) * 0.01,
        dissolveStagger: (hash11(s + 10.3) - 0.5) * 0.16,
        spinX: signedHash(s + 11.1) * 5.4,
        spinY: signedHash(s + 12.7) * 5.4,
        spinZ: signedHash(s + 14.3) * 5.4,
      });
    }
  }

  _setPositions(origin, partnerPos = null, enemyCenter = null, options = null) {
    if (options && options.camera) {
      this.camera = options.camera;
    }
    if (origin) {
      const ox = origin.x ?? origin[0] ?? 59.8;
      const oz = origin.z ?? origin[2] ?? -4.0;
      const oy = this.getGroundHeight(ox, oz);
      this.origin.set(ox, oy, oz);
    } else {
      this.origin.y = this.getGroundHeight(this.origin.x, this.origin.z);
    }

    if (partnerPos) {
      const px = partnerPos.x ?? partnerPos[0] ?? this.origin.x - 0.7;
      const pz = partnerPos.z ?? partnerPos[2] ?? this.origin.z + 1.95;
      const py = this.getGroundHeight(px, pz);
      this.partnerPos.set(px, py, pz);
      this.hasPartner = true;
    } else {
      this.hasPartner = false;
    }

    if (enemyCenter) {
      const ex = enemyCenter.x ?? enemyCenter[0] ?? 75.1;
      const ez = enemyCenter.z ?? enemyCenter[2] ?? -3.8;
      const ey = this.getGroundHeight(ex, ez);
      this.enemyCenter.set(ex, ey, ez);
      this.hasEnemyCenter = true;
    } else {
      this.hasEnemyCenter = false;
    }
  }

  startChannel(origin, partnerPos = null, options = null) {
    this._setPositions(origin, partnerPos, null, options);
    this.communeMode = options?.communeMode || 'divine_miracle';
    this.mode = 'channel';
    this.suspense = false;
    this.isLooping = true;
    this.active = true;
    this.age = 0;
    this.totalDuration = 9999.0;
    this.group.visible = true;
    this.seek(0.02);
    return this;
  }

  stopChannel() {
    if (this.mode === 'channel') {
      this.clear();
    }
    return this;
  }

  setSuspense(isSuspense = true) {
    this.suspense = Boolean(isSuspense);
    return this;
  }

  triggerSmite(origin, partnerPos = null, options = null) {
    if (
      origin &&
      typeof origin === 'object' &&
      !Array.isArray(origin) &&
      (origin.position || origin.origin)
    ) {
      return this.triggerRoseGommageDeath(origin, partnerPos, options);
    }
    this._setPositions(origin, partnerPos, null, options);
    this.mode = 'smite';
    this.suspense = false;
    this.isLooping = false;
    this.active = true;
    this.age = 0;
    this.totalDuration = this.config.smiteTotalDuration;
    this.group.visible = true;
    this.seek(0.01);
    return this;
  }

  triggerRoseGommageDeath(optionsOrOrigin = null, partnerPos = null, options = null) {
    let orig = optionsOrOrigin;
    let part = partnerPos;
    let opts = options;
    if (
      optionsOrOrigin &&
      typeof optionsOrOrigin === 'object' &&
      !Array.isArray(optionsOrOrigin) &&
      !optionsOrOrigin.isVector3 &&
      (optionsOrOrigin.position !== undefined ||
        optionsOrOrigin.origin !== undefined ||
        optionsOrOrigin.partnerPosition !== undefined ||
        optionsOrOrigin.partnerPos !== undefined)
    ) {
      orig = optionsOrOrigin.position ?? optionsOrOrigin.origin ?? this.origin;
      part = optionsOrOrigin.partnerPosition ?? optionsOrOrigin.partnerPos ?? null;
      opts = optionsOrOrigin;
    }
    this._setPositions(orig, part, null, opts);
    this.mode = 'smite';
    this.suspense = false;
    this.isLooping = false;
    this.active = true;
    this.age = 0;
    this.totalDuration = this.config.smiteTotalDuration;
    this.group.visible = true;
    this.seek(0.01);
    return this;
  }

  spawnRoseGommageDeath(optionsOrOrigin = null, partnerPos = null, options = null) {
    return this.triggerRoseGommageDeath(optionsOrOrigin, partnerPos, options);
  }

  spawnSmiteBolt(optionsOrOrigin = null, partnerPos = null, options = null) {
    return this.triggerSmite(optionsOrOrigin, partnerPos, options);
  }

  triggerHeal(origin, partnerPos = null, options = null) {
    this._setPositions(origin, partnerPos, null, options);
    this.mode = 'heal';
    this.suspense = false;
    this.isLooping = false;
    this.active = true;
    this.age = 0;
    this.totalDuration = 1.65;
    this.group.visible = true;
    this.seek(0.02);
    return this;
  }

  triggerBlessing(origin, partnerPos = null, options = null) {
    this._setPositions(origin, partnerPos, null, options);
    this.mode = 'blessing';
    this.suspense = false;
    this.isLooping = false;
    this.active = true;
    this.age = 0;
    this.totalDuration = this.config.blessingTotalDuration;
    this.group.visible = true;
    this.seek(0.02);
    return this;
  }

  triggerMiracle(origin, partnerPos = null, enemyCenter = null, options = null) {
    this._setPositions(origin, partnerPos, enemyCenter, options);
    this.mode = 'miracle';
    this.suspense = false;
    this.isLooping = false;
    this.active = true;
    this.age = 0;
    this.totalDuration = this.config.blessingTotalDuration;
    this.group.visible = true;
    this.seek(0.02);
    return this;
  }

  setLighting({ sunDir, daylight = 1.0 } = {}) {
    if (sunDir) this.sharedUniforms.uSunDir.value.copy(sunDir).normalize();
    if (Number.isFinite(daylight)) this.sharedUniforms.uDaylight.value = clamp(daylight, 0.0, 1.2);
  }

  getCameraShakeOffset(out = new THREE.Vector3()) {
    return out.copy(this._shakeOffset);
  }

  getCameraLookOffset(out = new THREE.Vector3()) {
    if (!this.active) return out.set(0, 0, 0);
    return out.copy(this._cameraLookOffset);
  }

  getCameraCinematicOffset(out = new THREE.Vector3()) {
    return this.getCameraLookOffset(out);
  }

  isHeroUndergroundHidden() {
    if (!this.active) return false;
    return this._undergroundHidden;
  }

  isUndergroundHidden() {
    return this.isHeroUndergroundHidden();
  }

  getHitstopScale() {
    return this._hitstopScale;
  }

  getCharacterDissolveProgress() {
    if (!this.active || (this.mode !== 'smite' && this.mode !== 'rose_gommage')) return 0.0;
    return this._characterDissolveProgress;
  }

  getHeroLevitationOffset(role = 'origin') {
    if (!this.active) return 0.0;
    const isPartner = role === 'partner' || role === 'Knight' || role === 1;
    return isPartner ? this._partnerLevY : this._originLevY;
  }

  /**
   * Configures live briar thickness, flower scale, 3D bower AO, sap intensity,
   * wetness, Eclipse rim backlight, bark tone, and active instance count for
   * visual optimization and side-by-side comparison charts.
   */
  setBriarStylePreset({
    tubeRadiusScale = 1.95,
    flowerScale = 1.32,
    bowerAO = 0.88,
    sapIntensity = 1.15,
    wetness = 1.15,
    eclipseRim = 0.92,
    barkTone = 2.0,
    activeBriarCount = 18,
    radialSpanMult = 1.0,
    crownHeightMult = 1.28,
  } = {}) {
    const u = this.monolithMat?.uniforms;
    if (u) {
      if (u.uTubeRadiusScale) u.uTubeRadiusScale.value = tubeRadiusScale;
      if (u.uFlowerScale) u.uFlowerScale.value = flowerScale;
      if (u.uBowerAO) u.uBowerAO.value = bowerAO;
      if (u.uSapIntensity) u.uSapIntensity.value = sapIntensity;
      if (u.uWetness) u.uWetness.value = wetness;
      if (u.uEclipseRim) u.uEclipseRim.value = eclipseRim;
      if (u.uBarkTone) u.uBarkTone.value = barkTone;
    }
    this._activeBriarCount = Math.max(8, Math.min(MAX_MONOLITHS, Math.round(activeBriarCount)));
    this._radialSpanMult = radialSpanMult;
    this._crownHeightMult = crownHeightMult;
    return this;
  }

  /**
   * Evaluates the weighted, two-stage root-creep -> whip-lock growth curve for a single
   * briar net instance `rec` at Blessing time `t`, so the instances grow with staggered,
   * organic asymmetry (`0.00s..2.10s`) rather than moving in robotic lockstep.
   */
  _evalInstanceBriarGrowth(rec, t, baseGrowthOverride = null) {
    if (baseGrowthOverride !== null) {
      return clamp(baseGrowthOverride, 0.0, 1.05);
    }
    const localT = Math.max(0.0, t - rec.staggerDelay);
    const u = clamp(localT / rec.growDuration, 0.0, 1.0);
    // Stage A (u = 0..0.48): Low ground-hugging root coils snaking outward & beginning their climb (0.04 -> 0.42)
    // Stage B (u = 0.48..1.0): Sweeping coiling surge (0.42 -> 1.00) that wraps the dome & blooms the flowers!
    if (u < 0.48) {
      const uSlow = u / 0.48;
      return 0.04 + 0.38 * (uSlow * uSlow * (2.0 - uSlow));
    }
    const uWhip = (u - 0.48) / 0.52;
    const whipCurve = 1.0 - Math.pow(1.0 - uWhip, 2.8);
    return 0.42 + 0.58 * whipCurve;
  }

  _populateBriarLatticeArches(
    cx,
    cz,
    baseGrowthProgress,
    submergeDepth = 0.0,
    blessingTime = null,
    radialCrunch = 1.0,
    submergeTwist = 0.0
  ) {
    if (baseGrowthProgress <= 0.001 && blessingTime === null) {
      this.monolithsMesh.count = 0;
      return;
    }

    const baseGroundY = this.getGroundHeight(cx, cz);
    if (this.monolithMat?.uniforms?.uBowerCenter) {
      this.monolithMat.uniforms.uBowerCenter.value.set(cx, baseGroundY, cz);
    }

    const ox = this.origin.x;
    const oz = this.origin.z;
    const px = this.hasPartner ? this.partnerPos.x : ox;
    const pz = this.hasPartner ? this.partnerPos.z : oz;
    const dx = px - ox;
    const dz = pz - oz;
    const dist = Math.hypot(dx, dz);

    // Wide, overarching asymmetric coiling vine footprint (~4.1m..4.6m wide across the cobblestones)
    let ux = dist > 0.05 ? dx / dist : 1.0;
    let uz = dist > 0.05 ? dz / dist : 0.0;
    let vx = -uz;
    let vz = ux;
    if (this.camera && this.camera.position) {
      const toCamDot = (this.camera.position.x - cx) * vx + (this.camera.position.z - cz) * vz;
      if (toCamDot < 0) {
        ux = -ux;
        uz = -uz;
        vx = -vx;
        vz = -vz;
      }
    }
    const spanMult = this._radialSpanMult ?? 1.0;
    const heightMult = this._crownHeightMult ?? 1.28;
    const limitCount = this._activeBriarCount ?? 18;

    const rx = Math.max(2.05, dist * 0.68 + 1.32) * radialCrunch * spanMult;
    const rz = Math.max(1.38, dist * 0.36 + 1.02) * radialCrunch * spanMult;

    let mSlot = 0;
    for (let i = 0; i < limitCount; i++) {
      const rec = this.briarLatticeRecords[i];
      let instGrowth =
        blessingTime !== null
          ? this._evalInstanceBriarGrowth(rec, blessingTime, null)
          : clamp(baseGrowthProgress * (0.85 + 0.25 * Math.sin(i * 1.7)), 0.04, 1.0);

      const submergeProgress = clamp(submergeTwist / 0.48, 0.0, 1.0);

      // Active coiling orbit angle as the vines wind up in Beat 1 and wrench downward in Beat 2
      const coilOrbit =
        (blessingTime !== null ? (1.0 - instGrowth) * rec.weaveDir * 0.28 : 0.0) +
        rec.weaveDir * submergeTwist;
      const effAng = rec.ang + coilOrbit * 0.45;
      const ca = Math.cos(effAng);
      const sa = Math.sin(effAng);

      // Guarantee a clear central window in front of the characters' faces (sa > 0.18, |ca| < 0.78)
      // WITHOUT squashing scaleY (so all tubes & roses stay 100% plump and 3D!):
      // Front-window modules coil along their lower uCurveT (0.0..0.38, y <= 0.55m), while flanks & rear crown grow to 1.0!
      const frontWindowMask =
        rec.tier <= 2
          ? smoothstep(0.18, 0.52, sa) * (1.0 - smoothstep(0.45, 0.78, Math.abs(ca)))
          : 0.0;
      const maxWindowGrowth = 1.0 - 0.62 * frontWindowMask;
      instGrowth = Math.min(instGrowth, maxWindowGrowth);

      // Wide elliptical + asymmetric offset anchor on the cobblestones
      const localX = ca * rx * rec.radialMultX + rec.offsetX;
      const localZ = sa * rz * rec.radialMultZ + rec.offsetZ;
      const sx = cx + ux * localX + vx * localZ;
      const sz = cz + uz * localX + vz * localZ;
      const sy = this.getGroundHeight(sx, sz);

      // Orient module so its coiling strands wind around the dome
      const radDirX = sx - cx;
      const radDirZ = sz - cz;
      const radLen = Math.hypot(radDirX, radDirZ) || 1.0;
      const nx = radDirX / radLen;
      const nz = radDirZ / radLen;
      const tx = -nz * rec.weaveDir;
      const tz = nx * rec.weaveDir;

      const fwdX = tx * rec.tangWeight - nx * rec.inwardWeight;
      const fwdZ = tz * rec.tangWeight - nz * rec.inwardWeight;
      const archYaw = Math.atan2(fwdX, fwdZ) + rec.yawSkew + coilOrbit;

      // Living coiling pulse as the vine snakes into place
      const whipPulse =
        blessingTime !== null
          ? Math.sin(clamp((instGrowth - 0.35) / 0.65, 0.0, 1.0) * Math.PI) * 0.08
          : 0.0;

      // Conical Mound Pitch & Height Scaling:
      // Tier 3 (Central Eclipse Crown) and Tier 2 (Conical Shoulders) pitch upward (negative X-rot)
      // and scale with `heightMult` so the apex peaks high inside the Blood-Red Eclipse ring!
      const crownPitchBoost =
        rec.tier === 3
          ? -(heightMult - 1.0) * 0.24
          : rec.tier === 2
            ? -(heightMult - 1.0) * 0.12
            : 0.0;
      const tierHeightScale =
        rec.tier === 3
          ? heightMult
          : rec.tier === 2
            ? 1.0 + (heightMult - 1.0) * 0.65
            : 1.0 + (heightMult - 1.0) * 0.25;

      // Note: in Three.js right-handed space (+Z forward, +Y up), POSITIVE X-rotation pitches +Z DOWNWARD toward -Y!
      _dummy.position.set(sx, sy - 0.012, sz);
      _euler.set(
        rec.inwardPitch + crownPitchBoost - whipPulse * 0.35 + submergeProgress * 0.32,
        archYaw,
        rec.rollTilt + rec.weaveDir * (whipPulse + submergeTwist * 0.25),
        'YXZ'
      );
      _dummy.quaternion.setFromEuler(_euler);
      const plungeScaleY = 1.0 - 0.32 * submergeProgress;
      _dummy.scale.set(
        rec.scaleX * (1.0 + whipPulse * 0.08),
        rec.scaleY * (1.0 + whipPulse * 0.06) * tierHeightScale * plungeScaleY,
        rec.scaleZ
      );
      _dummy.updateMatrix();

      this.monolithsMesh.setMatrixAt(mSlot, _dummy.matrix);
      this.monolithMetaAttr.setXYZW(mSlot, rec.seed, instGrowth, submergeDepth, sy);
      mSlot++;
    }

    this.monolithsMesh.count = mSlot;
    this.monolithsMesh.instanceMatrix.needsUpdate = true;
    this.monolithMetaAttr.needsUpdate = true;
  }

  _populateForegroundLensPetals(startSlot, t, windTimeScale = 0.35, fallbackCx = 0, fallbackCy = 0, fallbackCz = 0) {
    let slot = startSlot;
    const cam = this.camera;
    let hasCam = false;
    if (cam && cam.matrixWorld) {
      cam.updateMatrixWorld?.();
      const e = cam.matrixWorld.elements;
      _camRight.set(e[0], e[1], e[2]).normalize();
      _camUp.set(e[4], e[5], e[6]).normalize();
      _camFwd.set(-e[8], -e[9], -e[10]).normalize();
      hasCam = true;
    }

    const driftT = t * windTimeScale;
    for (let i = 0; i < this.foregroundLensPetals.length && slot < MAX_PRISMS_AND_DEBRIS; i++) {
      const fp = this.foregroundLensPetals[i];
      const uDrift = fp.u + Math.sin(driftT * 1.4 + i * 1.7) * 0.03;
      const vDrift = fp.v + Math.cos(driftT * 1.1 + i * 2.1) * 0.03;

      if (hasCam) {
        const spanH = Math.tan(((cam.fov || 50) * 0.5 * Math.PI) / 180) * fp.depth;
        const spanW = spanH * (cam.aspect || 16 / 9);
        const px =
          cam.position.x +
          _camFwd.x * fp.depth +
          _camRight.x * (uDrift * spanW) +
          _camUp.x * (vDrift * spanH);
        const py =
          cam.position.y +
          _camFwd.y * fp.depth +
          _camRight.y * (uDrift * spanW) +
          _camUp.y * (vDrift * spanH);
        const pz =
          cam.position.z +
          _camFwd.z * fp.depth +
          _camRight.z * (uDrift * spanW) +
          _camUp.z * (vDrift * spanH);
        _dummy.position.set(px, py, pz);
      } else {
        _dummy.position.set(
          fallbackCx + uDrift * 3.2,
          fallbackCy + 1.45 + vDrift * 1.2,
          fallbackCz + 2.4
        );
      }

      _euler.set(
        0.55 + driftT * fp.speed,
        fp.roll + driftT * fp.speed * 0.8,
        fp.roll * 0.7 - driftT * fp.speed * 0.6
      );
      _dummy.quaternion.setFromEuler(_euler);
      const sc = fp.scale;
      _dummy.scale.set(sc * 1.15, sc * 1.12, sc * 0.90);
      _dummy.updateMatrix();

      this.prismsAndDebrisMesh.setMatrixAt(slot, _dummy.matrix);
      this.debrisMetaAttr.setXYZW(slot, i * 1.37 + 0.5, 2.0, 0.0, 2.0);
      slot++;
    }
    return slot;
  }

  seek(timeSeconds, options = null) {
    if (options && typeof options === 'object') {
      if (options.camera) {
        this.camera = options.camera;
      }
      if (options.mode) {
        const m = String(options.mode).toLowerCase();
        this.mode = m === 'rose_gommage' || m === 'gommage' ? 'smite' : m;
        this.isLooping = this.mode === 'channel';
        const c = this.config;
        if (this.mode === 'smite') {
          this.totalDuration = c.smiteTotalDuration;
        } else if (this.mode === 'heal') {
          this.totalDuration = 1.65;
        } else if (this.mode === 'blessing' || this.mode === 'miracle') {
          this.totalDuration = c.blessingTotalDuration;
        } else {
          this.totalDuration = 9999.0;
        }
      }
      if (options.communeMode) {
        this.communeMode = options.communeMode;
      }
      if (options.suspense !== undefined) {
        this.suspense = Boolean(options.suspense);
      }
      if (
        options.origin !== undefined ||
        options.position !== undefined ||
        options.partnerPos !== undefined ||
        options.partnerPosition !== undefined ||
        options.enemyCenter !== undefined
      ) {
        this._setPositions(
          options.origin ?? options.position ?? this.origin,
          options.partnerPos !== undefined
            ? options.partnerPos
            : options.partnerPosition !== undefined
              ? options.partnerPosition
              : this.hasPartner
                ? this.partnerPos
                : null,
          options.enemyCenter !== undefined
            ? options.enemyCenter
            : this.hasEnemyCenter
              ? this.enemyCenter
              : null,
          options
        );
      }
    }

    if (timeSeconds < 0 || (!this.isLooping && timeSeconds > this.totalDuration + 0.05)) {
      this.clear();
      return this;
    }

    this.active = true;
    this.age = timeSeconds;
    this.group.visible = true;

    const windRate =
      this.mode === 'smite' || this.mode === 'rose_gommage'
        ? 0.0
        : this.mode === 'channel' && this.communeMode !== 'normal'
          ? 0.35
          : 1.0;
    this.sharedUniforms.uTime.value = timeSeconds * Math.max(0.05, windRate);

    if (this.mode === 'channel') {
      this._evaluateChannel(timeSeconds);
    } else if (this.mode === 'smite' || this.mode === 'rose_gommage') {
      this._evaluateSmite(timeSeconds);
    } else if (this.mode === 'heal') {
      this._evaluateFieldHeal(timeSeconds);
    } else {
      this._evaluateBlessingFourBeat(timeSeconds);
    }

    return this;
  }

  /**
   * PHASE 1 (`channel` — Frame 37):
   * - Mode B (`communeMode !== 'normal'`): 36 Witcher 3 brown-root & briar net modules creep slowly
   *   along the cobblestones around the lovers' boots + 32 world-space crimson rose petals + 8 foreground lens petals.
   * - Mode A (`communeMode === 'normal'`): Gentle rose petals swirl around speaker's feet (`0` briar roots, `0` lens petals).
   */
  _evaluateChannel(t) {
    const ox = this.origin.x;
    const oz = this.origin.z;
    const px = this.hasPartner ? this.partnerPos.x : ox;
    const pz = this.hasPartner ? this.partnerPos.z : oz;
    const cx = this.hasPartner ? (ox + px) * 0.5 : ox;
    const cz = this.hasPartner ? (oz + pz) * 0.5 : oz;
    const cy = this.getGroundHeight(cx, cz);

    this._originLevY = 0.0;
    this._partnerLevY = 0.0;
    this._undergroundHidden = false;
    this._characterDissolveProgress = 0.0;
    this._cameraLookOffset.set(0, 0, 0);
    this._hitstopScale = 1.0;
    this._shakeOffset.set(0, 0, 0);

    // DC 1: Keep 0 ribbon rings so no artificial red wire rings obscure the characters
    this.skyRibbonsMesh.count = 0;

    if (this.communeMode === 'normal') {
      // Mode A Normal Field Prayer: 0 briar dome roots, gentle swirling petals around feet
      this.monolithsMesh.count = 0;
      this.monolithsMesh.instanceMatrix.needsUpdate = true;

      let dSlot = 0;
      for (let i = 0; i < 24; i++) {
        const rec = this.debrisRecords[i];
        const swirlAng = rec.ang + t * (1.25 + (i % 3) * 0.22);
        const rad = 0.75 + (i % 6) * 0.32;
        const localH = (rec.heightOffset * 0.35 + t * 0.85) % 1.85;
        const dx = cx + Math.cos(swirlAng) * rad;
        const dz = cz + Math.sin(swirlAng) * rad;
        const dy = this.getGroundHeight(dx, dz) + 0.14 + localH;

        _dummy.position.set(dx, dy, dz);
        _euler.set(t * rec.spinX * 0.45, swirlAng + t * rec.spinY * 0.45, t * rec.spinZ * 0.45);
        _dummy.quaternion.setFromEuler(_euler);
        const sc = rec.size * 1.02;
        _dummy.scale.set(sc * 1.15, sc * 1.10, sc * 0.90);
        _dummy.updateMatrix();
        this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
        this.debrisMetaAttr.setXYZW(dSlot, rec.seed, 1.0, 0.0, 2.0);
        dSlot++;
      }
      this.prismsAndDebrisMesh.count = dSlot;
      this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
      this.debrisMetaAttr.needsUpdate = true;
      this.groundSigilMesh.count = 0;
      return;
    }

    // DC 2: 36 Briar Net roots coiling low along the cobblestones around the lovers' boots (`0.12 -> 0.22`)
    const growthProgress = 0.12 + 0.10 * (1.0 - Math.exp(-t * 0.50));
    this._populateBriarLatticeArches(cx, cz, growthProgress, 0.0, null, 1.0, 0.0);

    // DC 3: 32 World-Space Drifting Crimson Petals + 8 Camera-Foreground Soft-Focus Crimson Petals (`count = 40`)
    let dSlot = 0;
    const slowT = t * 0.35;
    for (let i = 0; i < 32; i++) {
      const rec = this.debrisRecords[i];
      const swirlAng = rec.ang + slowT * (0.85 + (i % 3) * 0.18);
      const rad = 2.45 + rec.orbitRadius * 2.4;
      const localH = (rec.heightOffset + slowT * rec.climbSpeed * 0.85) % 4.6;
      const dx = cx + Math.cos(swirlAng) * rad;
      const dz = cz + Math.sin(swirlAng) * rad;
      const dy = this.getGroundHeight(dx, dz) + 0.32 + localH;

      _dummy.position.set(dx, dy, dz);
      _euler.set(slowT * rec.spinX * 0.45, swirlAng + slowT * rec.spinY * 0.45, slowT * rec.spinZ * 0.45);
      _dummy.quaternion.setFromEuler(_euler);
      const sc = rec.size * 1.15;
      _dummy.scale.set(sc * 1.18, sc * 1.12, sc * 0.92);
      _dummy.updateMatrix();
      this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
      this.debrisMetaAttr.setXYZW(dSlot, rec.seed, 1.0, 0.0, 2.0);
      dSlot++;
    }
    dSlot = this._populateForegroundLensPetals(dSlot, t, 0.35, cx, cy, cz);
    this.prismsAndDebrisMesh.count = dSlot;
    this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
    this.debrisMetaAttr.needsUpdate = true;

    // DC 4: 0 ground sigils during Prayer channel
    this.groundSigilMesh.count = 0;
  }

  /**
   * MODE A IN-PLACE FIELD HEAL (`heal` — `totalDuration = 1.65s`):
   * - Swirls 36 rising rose petals around both partners in place with `0s` cutscene lock,
   *   `0` briar roots, and `0` underground plunge!
   */
  _evaluateFieldHeal(t) {
    const ox = this.origin.x;
    const oz = this.origin.z;
    const px = this.hasPartner ? this.partnerPos.x : ox;
    const pz = this.hasPartner ? this.partnerPos.z : oz;
    const cx = this.hasPartner ? (ox + px) * 0.5 : ox;
    const cz = this.hasPartner ? (oz + pz) * 0.5 : oz;

    this._originLevY = 0.0;
    this._partnerLevY = 0.0;
    this._undergroundHidden = false;
    this._characterDissolveProgress = 0.0;
    this._cameraLookOffset.set(0, 0, 0);
    this._hitstopScale = 1.0;
    this._shakeOffset.set(0, 0, 0);

    this.skyRibbonsMesh.count = 0;
    this.monolithsMesh.count = 0;
    this.groundSigilMesh.count = 0;

    const u = clamp(t / Math.max(0.2, this.totalDuration), 0.0, 1.0);
    let dSlot = 0;
    for (let i = 0; i < 36; i++) {
      const rec = this.debrisRecords[i];
      const dissolveProgress = smoothstep(0.55, 0.98, u + rec.dissolveStagger * 0.4);
      if (dissolveProgress >= 0.995) continue;

      const anchorX = i % 2 === 0 ? ox : px;
      const anchorZ = i % 2 === 0 ? oz : pz;
      const swirlAng = rec.ang + t * 2.4;
      const rad = 0.45 + (i % 6) * 0.22 + u * 0.55;
      const dx = (this.hasPartner ? anchorX : cx) + Math.cos(swirlAng) * rad;
      const dz = (this.hasPartner ? anchorZ : cz) + Math.sin(swirlAng) * rad;
      const dy = this.getGroundHeight(dx, dz) + 0.18 + u * 2.1 + (i % 5) * 0.24;

      _dummy.position.set(dx, dy, dz);
      _euler.set(t * rec.spinX * 0.65, swirlAng, t * rec.spinZ * 0.65);
      _dummy.quaternion.setFromEuler(_euler);
      const sc = rec.size * 1.08;
      _dummy.scale.set(sc * 1.18, sc * 1.12, sc * 0.92);
      _dummy.updateMatrix();
      this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
      this.debrisMetaAttr.setXYZW(dSlot, rec.seed, 1.0, dissolveProgress, 2.0);
      dSlot++;
    }
    this.prismsAndDebrisMesh.count = dSlot;
    this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
    this.debrisMetaAttr.needsUpdate = true;
  }

  /**
   * PHASE 2A (`blessing` / `heal` / `miracle` — `totalDuration = 4.80s` 4-Beat Sequence):
   * - Beat 1 (`0.00s -> 2.10s`): Living Coiling Vine Growth & Multi-Flower Blooming (`2.10s`).
   * - Beat 2 (`2.10s -> 2.65s`): Helical Constriction & Complete Underground Plunge (`0.55s`).
   * - Beat 3 (`2.65s -> 4.25s`): Quiet Cobblestone Flower Slump (`1.60s` Underground).
   * - Beat 4 (`4.25s -> 4.80s`): Clean Pop-Up in Full Power & 64-Petal Scatter (`0.55s`).
   */
  _evaluateBlessingFourBeat(t) {
    const ox = this.origin.x;
    const oz = this.origin.z;
    const px = this.hasPartner ? this.partnerPos.x : ox;
    const pz = this.hasPartner ? this.partnerPos.z : oz;
    const cx = this.hasPartner ? (ox + px) * 0.5 : ox;
    const cz = this.hasPartner ? (oz + pz) * 0.5 : oz;
    const cy = this.getGroundHeight(cx, cz);

    this._characterDissolveProgress = 0.0;
    this._hitstopScale = 1.0;
    this._shakeOffset.set(0, 0, 0);

    if (t < 2.10) {
      // ======================================================================
      // BEAT 1 (0.00s -> 2.10s): Living Coiling Vine Growth & Flower Blooming
      // ======================================================================
      this._originLevY = 0.0;
      this._partnerLevY = 0.0;
      this._undergroundHidden = false;
      this._cameraLookOffset.set(0, 0, 0);

      // Subtle coiling constriction tightening in the final 0.40s (1.70s..2.10s) right as the dome locks!
      const lockTighten = smoothstep(1.65, 2.08, t);
      const radialCrunch = 1.0 - 0.10 * lockTighten;

      this.skyRibbonsMesh.count = 0;

      // DC 2: 36 Coiling Vine, Star-Lily & Blush-Rose Modules uncoiling with staggered, asymmetric timing
      this._populateBriarLatticeArches(cx, cz, 1.0, 0.0, t, radialCrunch, 0.0);

      // DC 3: 32 Crimson Petals swirling around the widening briar net & cobblestones
      let dSlot = 0;
      for (let i = 0; i < 32; i++) {
        const rec = this.debrisRecords[i];
        const swirlAng = rec.ang + t * 0.85;
        const rad = (1.65 + (i % 7) * 0.48) * radialCrunch;
        const localH = i < 14 ? 0.03 + (i % 3) * 0.02 : (rec.heightOffset + t * rec.climbSpeed * 0.65) % 2.6;
        const dx = cx + Math.cos(swirlAng) * rad;
        const dz = cz + Math.sin(swirlAng) * rad;
        const dy = this.getGroundHeight(dx, dz) + localH;

        _dummy.position.set(dx, dy, dz);
        _euler.set(
          i < 14 ? 1.42 : t * rec.spinX * 0.4,
          swirlAng + t * rec.spinY * 0.4,
          i < 14 ? 0.12 : t * rec.spinZ * 0.4
        );
        _dummy.quaternion.setFromEuler(_euler);
        const sc = rec.size * 1.1;
        _dummy.scale.set(sc * 1.18, sc * 1.12, sc * 0.92);
        _dummy.updateMatrix();
        this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
        this.debrisMetaAttr.setXYZW(dSlot, rec.seed, 1.0, 0.0, 2.0);
        dSlot++;
      }
      this.prismsAndDebrisMesh.count = dSlot;
      this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
      this.debrisMetaAttr.needsUpdate = true;

      // DC 4: Lush crimson rose & petal carpet spreading across the cobblestones beneath the coiling vines (1000373056.png!)
      const carpetReach = 0.38 + 0.98 * smoothstep(0.05, 1.85, t);
      _dummy.position.set(cx, cy + 0.008, cz);
      _dummy.quaternion.setFromAxisAngle(UP, 0.25);
      _dummy.scale.set(1.0, 1.0, 1.0);
      _dummy.updateMatrix();
      this.groundSigilMesh.setMatrixAt(0, _dummy.matrix);
      this.sigilMetaAttr.setXYZW(0, 0.0, carpetReach, 0.37, 1.0);
      this.groundSigilMesh.count = 1;
      this.groundSigilMesh.instanceMatrix.needsUpdate = true;
      this.sigilMetaAttr.needsUpdate = true;
    } else if (t < 2.65) {
      // ======================================================================
      // BEAT 2 (2.10s -> 2.65s): Complete Underground Plunge
      // Solid 3D dome physically plunges downward through the cobblestone ground
      // portal across the full 2.10s..2.62s window (reaching -3.05m at t = 2.62s)
      // so Frames 1..5 show the crown sinking into the stones and Frame 6 (2.62s)
      // has 0 pixels remaining above ground before Beat 3 begins at 2.65s!
      // ======================================================================
      const uSub = clamp((t - 2.10) / 0.52, 0.0, 1.0);
      const submergeU = uSub * uSub * (3.0 - 2.0 * uSub);
      const levY = -2.5 * smoothstep(2.10, 2.62, t);
      this._originLevY = levY;
      this._partnerLevY = levY;
      this._undergroundHidden = false;
      this._cameraLookOffset.set(0, -0.68 * submergeU, 0);

      this.skyRibbonsMesh.count = 0;

      // DC 2: Constrict radially, pitch downward (+X rot), and plunge 3.05m deep across the full Beat 2 window!
      const radialCrunch = 0.90 - 0.30 * submergeU;
      const submergeTwist = submergeU * 0.48;
      this._populateBriarLatticeArches(cx, cz, 1.0, 3.05 * submergeU, 2.10, radialCrunch, submergeTwist);

      // DC 3: 24 Crimson Petals settling toward the cobblestones
      let dSlot = 0;
      for (let i = 0; i < 24; i++) {
        const rec = this.debrisRecords[i];
        const swirlAng = rec.ang + t * 0.75;
        const rad = (0.38 + (i % 6) * 0.26) * (1.15 - 0.25 * submergeU);
        const dy = cy + 0.03 + (1.0 - submergeU) * (0.42 + (i % 4) * 0.28);
        const dx = cx + Math.cos(swirlAng) * rad;
        const dz = cz + Math.sin(swirlAng) * rad;

        _dummy.position.set(dx, dy, dz);
        _euler.set(1.25 - 0.9 * (1.0 - submergeU), swirlAng, 0.18 * (1.0 - submergeU));
        _dummy.quaternion.setFromEuler(_euler);
        const sc = rec.size * 1.05;
        _dummy.scale.set(sc * 1.18, sc * 1.12, sc * 0.92);
        _dummy.updateMatrix();
        this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
        this.debrisMetaAttr.setXYZW(dSlot, rec.seed, 1.0, 0.0, 2.0);
        dSlot++;
      }
      this.prismsAndDebrisMesh.count = dSlot;
      this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
      this.debrisMetaAttr.needsUpdate = true;

      // DC 4: Settle the cobblestone crimson flower slump to its quiet resting radius (`1.36 -> 1.18`)
      const slumpReach = 1.36 - 0.18 * submergeU;
      _dummy.position.set(cx, cy + 0.008, cz);
      _dummy.quaternion.setFromAxisAngle(UP, 0.25);
      _dummy.scale.set(1.0, 1.0, 1.0);
      _dummy.updateMatrix();
      this.groundSigilMesh.setMatrixAt(0, _dummy.matrix);
      this.sigilMetaAttr.setXYZW(0, 0.0, slumpReach, 0.37, 1.0);
      this.groundSigilMesh.count = 1;
      this.groundSigilMesh.instanceMatrix.needsUpdate = true;
      this.sigilMetaAttr.needsUpdate = true;
    } else if (t < 4.25) {
      // ======================================================================
      // BEAT 3 (2.65s -> 4.25s): Quiet Cobblestone Flower Slump (1.60s Underground)
      // ======================================================================
      this._originLevY = -2.5;
      this._partnerLevY = -2.5;
      this._undergroundHidden = true;
      this._cameraLookOffset.set(0, -0.68, 0);

      // DC 1 & DC 2: 100% gone (`count = 0`)
      this.skyRibbonsMesh.count = 0;
      this.monolithsMesh.count = 0;

      // DC 3: 12 Gentle Ground-Skimming Crimson Petals resting/drifting around the flower slump
      let dSlot = 0;
      for (let i = 0; i < 12; i++) {
        const rec = this.debrisRecords[i];
        const swirlAng = rec.ang + t * 0.22;
        const rad = 0.55 + (i / 12) * 1.05;
        const dx = cx + Math.cos(swirlAng) * rad;
        const dz = cz + Math.sin(swirlAng) * rad;
        const dy = this.getGroundHeight(dx, dz) + 0.025 + Math.sin(t * 1.4 + i) * 0.012;

        _dummy.position.set(dx, dy, dz);
        _euler.set(1.38 + 0.08 * Math.sin(t + i), swirlAng, 0.08 * Math.cos(t + i));
        _dummy.quaternion.setFromEuler(_euler);
        const sc = rec.size * 1.08;
        _dummy.scale.set(sc * 1.18, sc * 1.12, sc * 0.92);
        _dummy.updateMatrix();
        this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
        this.debrisMetaAttr.setXYZW(dSlot, rec.seed, 1.0, 0.0, 2.0);
        dSlot++;
      }
      this.prismsAndDebrisMesh.count = dSlot;
      this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
      this.debrisMetaAttr.needsUpdate = true;

      // DC 4: Quiet crimsonFlowerSlump resting on the cobblestones (`count = 1`)
      _dummy.position.set(cx, cy + 0.008, cz);
      _dummy.quaternion.setFromAxisAngle(UP, 0.25);
      _dummy.scale.set(1.0, 1.0, 1.0);
      _dummy.updateMatrix();
      this.groundSigilMesh.setMatrixAt(0, _dummy.matrix);
      this.sigilMetaAttr.setXYZW(0, 0.0, 1.18, 0.37, 1.0);
      this.groundSigilMesh.count = 1;
      this.groundSigilMesh.instanceMatrix.needsUpdate = true;
      this.sigilMetaAttr.needsUpdate = true;
    } else {
      // ======================================================================
      // BEAT 4 (4.25s -> 4.80s): Clean Pop Back Up & 64-Petal Slump Scatter
      // ======================================================================
      const u4 = clamp((t - 4.25) / 0.55, 0.0, 1.0);
      const popU = outQuint(u4);
      const levY = -2.5 * (1.0 - popU);

      this._originLevY = levY;
      this._partnerLevY = levY;
      this._undergroundHidden = false;
      this._cameraLookOffset.set(0, -0.68 * (1.0 - popU), 0);

      this.skyRibbonsMesh.count = 0;
      this.monolithsMesh.count = 0;

      // DC 3: Scatter the flower slump into a puff of 64 matte crimson petals that blows away & erodes
      let dSlot = 0;
      for (let i = 0; i < 64; i++) {
        const rec = this.debrisRecords[i];
        const dissolveProgress = smoothstep(0.45, 0.98, u4 + rec.dissolveStagger * 0.5);
        if (dissolveProgress >= 0.995) continue;

        const burstAng = rec.ang + u4 * 1.4;
        const rad = 0.22 + u4 * rec.burstSpeed * 0.85 + (i % 5) * 0.14;
        const dy = cy + 0.04 + Math.sin(u4 * Math.PI * 0.85) * (0.45 + (i % 6) * 0.22);
        const dx = cx + Math.cos(burstAng) * rad;
        const dz = cz + Math.sin(burstAng) * rad;

        _dummy.position.set(dx, dy, dz);
        _euler.set(u4 * rec.spinX, burstAng + u4 * rec.spinY, u4 * rec.spinZ);
        _dummy.quaternion.setFromEuler(_euler);
        const sc = rec.size * (1.15 - 0.35 * u4);
        _dummy.scale.set(sc * 1.18, sc * 1.12, sc * 0.92);
        _dummy.updateMatrix();
        this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
        this.debrisMetaAttr.setXYZW(dSlot, rec.seed, 1.0, dissolveProgress, 2.0);
        dSlot++;
      }
      this.prismsAndDebrisMesh.count = dSlot;
      this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
      this.debrisMetaAttr.needsUpdate = true;

      // DC 4: Slump erodes out rapidly as it scatters into petals
      const slumpDissolve = smoothstep(0.0, 0.65, u4);
      if (slumpDissolve < 0.98) {
        _dummy.position.set(cx, cy + 0.008, cz);
        _dummy.quaternion.setFromAxisAngle(UP, 0.25);
        _dummy.scale.set(1.0, 1.0, 1.0);
        _dummy.updateMatrix();
        this.groundSigilMesh.setMatrixAt(0, _dummy.matrix);
        this.sigilMetaAttr.setXYZW(0, slumpDissolve, 1.18, 0.37, 1.0);
        this.groundSigilMesh.count = 1;
        this.groundSigilMesh.instanceMatrix.needsUpdate = true;
        this.sigilMetaAttr.needsUpdate = true;
      } else {
        this.groundSigilMesh.count = 0;
      }
    }
  }

  /**
   * PHASE 2C (`smite` — `totalDuration = 2.80s`, `Frame 41` Left-to-Right Wind Petal Erosion):
   * - A directional wind blows from the LEFT side of the screen (`-windRight`) toward the RIGHT (`+windRight`),
   *   sweeping across the dying character from left to right (`_characterDissolveProgress`).
   * - As the wind hits the character, it literally turns his body along the left-to-right erosion seam into
   *   `240` individual 3D curved crimson rose petals (`prismsAndDebrisMesh`, `kind = 2.0`) and carries those
   *   petals away in a billowing horizontal-rightward wind stream!
   * - Strictly ONLY petals (`groundSigilMesh.count = 0` — zero whole 3D roses on the ground!).
   */
  _evaluateSmite(t) {
    const ox = this.origin.x;
    const oz = this.origin.z;
    const oy = this.origin.y;

    this._originLevY = 0.0;
    this._partnerLevY = 0.0;
    this._undergroundHidden = false;
    this._cameraLookOffset.set(0, 0, 0);
    this._characterDissolveProgress = smoothstep(0.10, 1.68, t);
    this._hitstopScale = t >= 0.02 && t <= 0.08 ? 0.15 : 1.0;
    this._shakeOffset.set(0, 0, 0);

    // DC 1 & DC 2: 0 draw calls so the stark B&W world + 240 blood-crimson rose petals take 100% focus
    this.skyRibbonsMesh.count = 0;
    this.monolithsMesh.count = 0;

    // Screen-Left -> Screen-Right wind basis vector (`windRight` points from left to right across the screen)
    let windRightX = 1.0;
    let windRightZ = 0.0;
    if (this.camera && this.camera.matrixWorld) {
      this.camera.updateMatrixWorld?.();
      const e = this.camera.matrixWorld.elements;
      const rx = e[0];
      const rz = e[2];
      const rLen = Math.hypot(rx, rz);
      if (rLen > 1e-4) {
        windRightX = rx / rLen;
        windRightZ = rz / rLen;
      }
    }
    const windDepthX = -windRightZ;
    const windDepthZ = windRightX;

    const dissProg = this._characterDissolveProgress;

    // DC 3: All 240 instances are Body-to-Wind Crimson Petals (ZERO stationary camera-border petals, ZERO whole roses!)
    let dSlot = 0;
    const worldPetalCount = MAX_PRISMS_AND_DEBRIS; // 240
    for (let i = 0; i < worldPetalCount; i++) {
      const rec = this.debrisRecords[i];

      // Stratified birth coordinates across the dying character's 3D silhouette:
      // uBodyX: 0.0 (far-left edge, -0.74m) -> 1.0 (far-right edge, +0.62m)
      // uBodyY: 0.04 (boots) -> 0.98 (helmet/head)
      const uBodyX = (i * 0.61803398875 + hash11(rec.seed * 1.9 + i) * 0.08) % 1.0;
      const uBodyY = clamp((i / worldPetalCount) * 0.88 + (hash11(rec.seed * 3.1 + i) - 0.35) * 0.18, 0.03, 0.98);
      const bodyLocalX = -0.74 + uBodyX * 1.36;
      const bodyLocalY = 0.05 + uBodyY * 1.56;
      const bodyLocalZ = (hash11(rec.seed * 7.3 + i) - 0.5) * 0.42;

      // Exact left-to-right wind erosion threshold matching toon-skin.js (`leftToRight * 0.78 + (1 - hNorm) * 0.08`)
      const erodeThreshold = clamp(
        uBodyX * 0.78 + (1.0 - uBodyY) * 0.08 + (hash11(rec.seed * 5.7 + i) - 0.5) * 0.08,
        0.02,
        0.96
      );
      const deltaProg = dissProg * 1.06 - erodeThreshold;

      // Real-time detachment timestamp `tDetach` (0.12s..1.60s) so `windAge` advances continuously with `t`
      // and NEVER stops or parks on the right side!
      const tDetach = 0.10 + 1.50 * clamp(erodeThreshold / 1.02, 0.0, 1.0);
      const windAge = Math.max(0.0, t - tDetach);

      // Each petal has a staggered wind-flight lifespan (0.48s..0.92s) over which it runs away to the right,
      // smoothly tapers in size, and erodes from its outer rim inward so you cannot tell when it disappeared!
      const petalLife = 0.48 + 0.44 * hash11(rec.seed * 13.7 + i * 3.1);
      const uLife = windAge > 0.0 ? clamp(windAge / petalLife, 0.0, 1.0) : 0.0;
      const dissolveProgress = smoothstep(0.18, 0.96, uLife);
      if (dissolveProgress >= 0.992 || uLife >= 0.992) continue;

      // Larger individual 3D rose petals (1.68x base size) so each petal reads clearly!
      const basePetalSize = rec.size * 1.68;

      let localRight;
      let localUp;
      let localDepth;
      let rotX;
      let rotY;
      let rotZ;
      let sc = basePetalSize;

      if (windAge <= 0.0) {
        // Active Wind-Transformation Seam: petals remain invisible (sc = 0) until the left-to-right
        // wind seam comes within 0.18 of their exact body coordinate (bodyLocalX, bodyLocalY),
        // then bud directly out of the character's dissolving armor/flesh right before peeling away!
        const emergeFactor = smoothstep(-0.18, -0.005, deltaProg);
        if (emergeFactor <= 0.001) continue;
        const flutter = Math.sin(t * 9.0 + i * 1.7) * 0.025 * emergeFactor;
        localRight = bodyLocalX + flutter;
        localUp = bodyLocalY + Math.cos(t * 7.5 + i * 2.1) * 0.025 * emergeFactor;
        localDepth = bodyLocalZ;
        rotX = 0.55 + Math.sin(t * 4.5 + i) * 0.35;
        rotY = 0.25 + (i % 7) * 0.42 + t * 0.8;
        rotZ = -0.38 + Math.cos(t * 5.0 + i) * 0.28;
        sc = basePetalSize * 1.12 * emergeFactor;
      } else {
        // Detached & Running Away Fast in the Left-to-Right Wind (`+windRight`):
        // Accelerates briskly rightward across the plaza while subtly shrinking and dissolving into thin air!
        const windSpeed = 3.65 + rec.burstSpeed * 1.85;
        const distRight = windSpeed * Math.pow(windAge, 1.24);
        localRight = bodyLocalX + distRight;

        const ribbonSign = i % 2 === 0 ? 1.0 : -1.0;
        const gustWaveY =
          Math.sin(distRight * 1.05 - t * 4.2 + rec.seed * 0.7) *
          (0.12 + 0.24 * Math.min(1.5, windAge)) *
          ribbonSign;
        const gustLiftY = (0.24 + (i % 5) * 0.09) * windAge;
        localUp = Math.max(0.08, bodyLocalY + gustLiftY + gustWaveY);
        localDepth =
          bodyLocalZ +
          Math.cos(distRight * 0.90 - t * 3.1 + rec.seed) * (0.14 + 0.22 * Math.min(1.4, windAge));

        // Petals bank and tumble in the left-to-right wind current
        rotX = 0.62 + windAge * rec.spinX * 0.85;
        rotY = 0.40 + windAge * rec.spinY * 0.75;
        rotZ = -0.52 + windAge * rec.spinZ * 0.80;

        // Whisper-subtle continuous scale-down taper combined with edge-to-core shader dissolve
        // so petals never stay parked on the right and you cannot tell the exact frame they vanish!
        const subtleScaleFade = Math.pow(1.0 - smoothstep(0.12, 0.98, uLife), 1.35);
        sc = basePetalSize * 1.15 * subtleScaleFade;
      }

      const dx = ox + windRightX * localRight + windDepthX * localDepth;
      const dz = oz + windRightZ * localRight + windDepthZ * localDepth;
      const groundH = this.getGroundHeight(dx, dz);
      const dy = Math.max(groundH + 0.028, oy + localUp);

      _dummy.position.set(dx, dy, dz);
      _euler.set(rotX, rotY, rotZ);
      _dummy.quaternion.setFromEuler(_euler);
      _dummy.scale.set(sc * 1.22, sc * 1.15, sc * 0.95);
      _dummy.updateMatrix();

      this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
      this.debrisMetaAttr.setXYZW(dSlot, rec.seed, 1.0, dissolveProgress, 2.0);
      dSlot++;
    }

    this.prismsAndDebrisMesh.count = dSlot;
    this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
    this.debrisMetaAttr.needsUpdate = true;

    // DC 4: Strictly ZERO whole roses in Smite (`groundSigilMesh.count = 0` — only loose petals!)
    this.groundSigilMesh.count = 0;
  }

  update(dt, options = null) {
    if (options && options.camera) {
      this.camera = options.camera;
    }
    if (!this.active) return;
    const nextAge = this.age + dt;
    if (!this.isLooping && nextAge > this.totalDuration) {
      this.clear();
      return;
    }
    this.seek(nextAge);
  }

  getStats() {
    if (!this.active || !this.group.visible) {
      return {
        active: false,
        mode: this.mode,
        suspense: this.suspense,
        drawCalls: 0,
        activeSkyRibbons: 0,
        activeMonoliths: 0,
        activePrismsAndDebris: 0,
        activeGroundSigils: 0,
        characterDissolveProgress: 0,
      };
    }
    let drawCalls = 0;
    if (this.skyRibbonsMesh.count > 0) drawCalls++;
    if (this.monolithsMesh.count > 0) drawCalls++;
    if (this.prismsAndDebrisMesh.count > 0) drawCalls++;
    if (this.groundSigilMesh.count > 0) drawCalls++;
    return {
      active: true,
      mode: this.mode,
      suspense: this.suspense,
      age: Number(this.age.toFixed(3)),
      drawCalls,
      activeSkyRibbons: this.skyRibbonsMesh.count,
      activeMonoliths: this.monolithsMesh.count,
      activePrismsAndDebris: this.prismsAndDebrisMesh.count,
      activeGroundSigils: this.groundSigilMesh.count,
      characterDissolveProgress: Number(this._characterDissolveProgress.toFixed(3)),
    };
  }

  clear() {
    this.active = false;
    this.isLooping = false;
    this.suspense = false;
    this.age = 0;
    this._originLevY = 0.0;
    this._partnerLevY = 0.0;
    this._undergroundHidden = false;
    this._characterDissolveProgress = 0.0;
    this._shakeOffset.set(0, 0, 0);
    this._cameraLookOffset.set(0, 0, 0);
    this._hitstopScale = 1.0;
    this.group.visible = false;
    this.skyRibbonsMesh.count = 0;
    this.monolithsMesh.count = 0;
    this.prismsAndDebrisMesh.count = 0;
    this.groundSigilMesh.count = 0;
  }

  dispose() {
    this.clear();
    this.skyRibbonsMesh.geometry.dispose();
    this.monolithsMesh.geometry.dispose();
    this.prismsAndDebrisMesh.geometry.dispose();
    this.groundSigilMesh.geometry.dispose();
    this.skyRibbonMat.dispose();
    this.monolithMat.dispose();
    this.debrisMat.dispose();
    this.sigilMat.dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

export function createArtoriousVfxSystem(options = {}) {
  return new ArtoriousVfxSystem(options);
}
export {
  ArtoriousVfxSystem as ArtoriousSystem,
  createArtoriousVfxSystem as createArtoriousSystem,
};
export default ArtoriousVfxSystem;
