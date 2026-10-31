// ============================================================================
// world/assets/vfx/cinder-fall.js
//
// Stage 4 Pass 2: Opaque Cel-Shaded "Cinder Fall" Volcanic Meteor VFX System
//
// Visual & Engineering Contract:
// - Strictly <= 4 InstancedMeshes when active, 0 draw calls when idle (`group.visible = false`):
//     1. `asteroidMesh` (1 InstancedMesh): Angular chiseled volcanic basalt-magma
//        asteroid monolith (`70%+` solid 4-band cel-shaded basalt armor plates
//        split by recessed tectonic magma fissures, `transparent: false,
//        depthWrite: true, side: THREE.FrontSide`).
//     2. `fireWakeMesh` (1 InstancedMesh): Closed 3D flame-tongue plume hulls
//        along the in-flight wake (collapsing cleanly into the crater on impact)
//        and roaring volcanic crater fire plumes (`transparent: false`, hard
//        `discard` < 0.45, 3-band Ukiyo-e cel fire & dark soot-ink border).
//     3. `craterRocksMesh` (1 InstancedMesh): 16 tilted basalt-and-magma crater
//        rim monoliths heaved around the impact perimeter + 24 ballistic cinder
//        rocks (`transparent: false, depthWrite: true, side: THREE.FrontSide`).
//     4. `craterDecalMesh` (1 InstancedMesh): Wide 3D-relieved volcanic slag
//        crater basin & 8-arm tectonic lava-rift scar grounding the entire
//        outer ring of basalt rim slabs (`transparent: false`, `discard` < 0.45).
// - Zero raw sRGB vec3 literals in GLSL; all palette colors passed via `THREE.Color`.
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';
import { createGlacierCrystalGeometry } from './frost-lance.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

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

export const CINDER_FALL_DEFAULTS = Object.freeze({
  range: 14.0, // default arena impact distance
  speed: 22.5, // horizontal downrange travel speed, m/s
  lifetime: 2.2, // seconds crater burns after impact
  fadeTime: 1.5, // seconds everything takes to clear

  // Trajectory
  handHeight: 2.15,
  handForward: 0.65,
  endHeight: 0.68,
  arc: 3.4,
  arcCurve: 0.85,

  // Asteroid & Crater Rim
  radius: 1.08,
  spin: 3.4,
  rimSlabCount: 16,
  cinderRockCount: 24,
  craterRadius: 3.35,
  fissureRadius: 6.85, // Wide enough to ground all outer basalt rim slabs!
  trailBurnout: 0.08, // Collapses sky wake immediately upon impact so no sky-tube lingers!

  // Linear-sRGB Palette Uniforms (passed via THREE.Color)
  colorChar: '#1c1512',
  colorRockDark: '#382b24',
  colorRockMid: '#5e493e',
  colorRockLit: '#8c7262',
  colorCrackDeep: '#d93800',
  colorCrack: '#ff7314',
  colorHot: '#fff3c4',
  colorInk: '#120c09',
  colorFlameEdge: '#d9280b',
  colorFlameMid: '#ff7b14',
  colorFlameCore: '#fff094',
  colorFlameSmoke: '#1a120f',
});

/* ------------------------------------------------------------------------- */
/* 1. Procedural Geometries (Angular Chiseled Asteroid & Flame-Tongue Hull)  */
/* ------------------------------------------------------------------------- */

export function createVolcanicAsteroidGeometry({
  subdivisions = 1,
  cuts = 11,
  cutDepth = 0.34,
  craters = 6,
  craterDepth = 0.22,
  seed = 11.7,
} = {}) {
  // subdivisions = 1 gives bold, flat-planed polyhedral basalt armor plates
  const baseGeo = new THREE.IcosahedronGeometry(1.0, subdivisions).toNonIndexed();
  const posAttr = baseGeo.attributes.position;

  const cutPlanes = [];
  for (let i = 0; i < cuts; i++) {
    const s = seed * 13.1 + i * 19.7;
    const theta = hash11(s + 1.1) * TAU;
    const phi = Math.acos(signedHash(s + 2.3));
    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    ).normalize();
    cutPlanes.push({
      dir,
      planeDist: 1.0 - cutDepth * (0.60 + 0.55 * hash11(s + 3.9)),
    });
  }

  const craterDirs = [];
  for (let i = 0; i < craters; i++) {
    const s = seed * 29.3 + i * 37.1;
    const theta = hash11(s + 1.7) * TAU;
    const phi = Math.acos(signedHash(s + 4.1));
    craterDirs.push(
      new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize()
    );
  }

  const cavityArr = new Float32Array(posAttr.count);
  const v = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).normalize();
    let r = 1.0;
    let cav = 0.0;

    // Bold angular volcanic cragginess
    const crag =
      Math.sin(v.x * 2.8 + seed) * Math.cos(v.y * 2.4 - seed) * 0.18 +
      Math.cos(v.z * 3.5 + v.x * 1.9) * 0.14;
    r += crag;

    // Planar chisel cuts with magma-filled fault seams along the cut borders
    for (const cp of cutPlanes) {
      const proj = v.dot(cp.dir) * r;
      if (proj > cp.planeDist) {
        const bite = proj - cp.planeDist;
        r -= bite * 0.92;
        // Emphasize magma seam along the fracture step edge
        const seamEdge = Math.exp(-Math.pow((bite - 0.05) * 14.0, 2.0));
        cav = Math.max(cav, seamEdge * 0.95);
      }
    }

    // Deep volcanic fissure troughs
    for (const cd of craterDirs) {
      const ang = Math.acos(clamp(v.dot(cd), -1.0, 1.0));
      if (ang < 0.48) {
        const u = ang / 0.48;
        const bowl = (1.0 - u * u) * craterDepth;
        const rim = Math.exp(-Math.pow((u - 0.85) * 6.0, 2.0)) * 0.09;
        r -= bowl - rim;
        cav = Math.max(cav, Math.pow(1.0 - u, 1.4) * 1.0);
      }
    }

    posAttr.setXYZ(i, v.x * r, v.y * r * 0.92, v.z * r);
    cavityArr[i] = cav;
  }

  baseGeo.setAttribute('aCavity', new THREE.BufferAttribute(cavityArr, 1));
  baseGeo.computeVertexNormals();
  baseGeo.computeBoundingSphere();
  return baseGeo;
}

/**
 * Closed outward-wound 3D flame-tongue plume hull (local +Y is tongue length from 0 to 1).
 */
export function createFlameTongueHullGeometry({ rings = 10, sides = 8 } = {}) {
  const ringPts = [];
  for (let r = 0; r < rings; r++) {
    const v = r / (rings - 1);
    const rad = Math.sin(Math.pow(v, 0.72) * Math.PI) * (1.0 - 0.32 * v);
    const curlX = Math.pow(v, 1.8) * 0.18;
    const pts = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * TAU;
      pts.push({
        pos: [Math.cos(ang) * rad * 0.52 + curlX, v, Math.sin(ang) * rad * 0.52],
        u: s / sides,
        v,
      });
    }
    ringPts.push(pts);
  }

  const baseCenter = [0, -0.04, 0];
  const tipCenter = [0.20, 1.05, 0];
  const positions = [];
  const uvs = [];

  const pushTriCCW = (a, b, c, uvA, uvB, uvC) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
  };

  for (let r = 0; r < rings - 1; r++) {
    const row0 = ringPts[r];
    const row1 = ringPts[r + 1];
    for (let s = 0; s < sides; s++) {
      const sNext = (s + 1) % sides;
      const a = row0[s];
      const b = row1[s];
      const c = row1[sNext];
      const d = row0[sNext];
      pushTriCCW(a.pos, b.pos, c.pos, [a.u, a.v], [b.u, b.v], [c.u, c.v]);
      pushTriCCW(a.pos, c.pos, d.pos, [a.u, a.v], [c.u, c.v], [d.u, d.v]);
    }
  }

  const firstRow = ringPts[0];
  const lastRow = ringPts[rings - 1];
  for (let s = 0; s < sides; s++) {
    const sNext = (s + 1) % sides;
    pushTriCCW(
      baseCenter,
      firstRow[s].pos,
      firstRow[sNext].pos,
      [0.5, 0.0],
      [firstRow[s].u, 0.0],
      [firstRow[sNext].u, 0.0]
    );
    pushTriCCW(
      lastRow[s].pos,
      tipCenter,
      lastRow[sNext].pos,
      [lastRow[s].u, 1.0],
      [0.5, 1.0],
      [lastRow[sNext].u, 1.0]
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/* ------------------------------------------------------------------------- */
/* 2. Opaque Cel Shaders (`transparent: false`)                              */
/* ------------------------------------------------------------------------- */

function createBasaltMagmaMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'CinderFallBasaltMagmaMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uColorChar: { value: new THREE.Color(config.colorChar) },
      uColorRockDark: { value: new THREE.Color(config.colorRockDark) },
      uColorRockMid: { value: new THREE.Color(config.colorRockMid) },
      uColorRockLit: { value: new THREE.Color(config.colorRockLit) },
      uColorCrackDeep: { value: new THREE.Color(config.colorCrackDeep) },
      uColorCrack: { value: new THREE.Color(config.colorCrack) },
      uColorHot: { value: new THREE.Color(config.colorHot) },
      uColorInk: { value: new THREE.Color(config.colorInk) },
    },
    vertexShader: /* glsl */ `
      attribute float aCavity;
      attribute vec4 aInstanceMeta; // x: seed, y: heat (0..1.5), z: isSlab (0..1), w: age01

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying float vCavity;
      varying vec4 vMeta;

      void main() {
        vLocalPos = position;
        vCavity = aCavity;
        vMeta = aInstanceMeta;

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
      uniform vec3 uColorChar;
      uniform vec3 uColorRockDark;
      uniform vec3 uColorRockMid;
      uniform vec3 uColorRockLit;
      uniform vec3 uColorCrackDeep;
      uniform vec3 uColorCrack;
      uniform vec3 uColorHot;
      uniform vec3 uColorInk;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying float vCavity;
      varying vec4 vMeta;

      void main() {
        float seed = vMeta.x;
        float heat = vMeta.y;
        float isSlab = vMeta.z;

        // 1. Crisp Derivative-Flat Facet Normal so every polyhedral rock plane reads distinctly
        vec3 dN = cross(dFdx(vWorldPos), dFdy(vWorldPos));
        vec3 N = length(dN) > 1e-8 ? normalize(dN) : normalize(vWorldNormal);
        if (dot(N, vWorldNormal) < 0.0) N = -N;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(vec3(uSunDir.x, max(0.42, uSunDir.y), uSunDir.z));

        float ndl = dot(N, L) * 0.5 + 0.5;
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        // 2. Sample Low-Frequency Tectonic Fault Mask (B) and Coarse Fracture Seams (R)
        //    (Avoids uniform soccer-ball Voronoi cells—75% of the rock stays solid charred basalt!)
        vec2 uvMacro = vLocalPos.xz * 0.34 + vec2(vLocalPos.y * 0.31 + seed * 0.41, seed * 0.79);
        vec2 uvFault = vLocalPos.xy * 0.48 + vec2(vLocalPos.z * 0.42 - seed * 0.29, seed * 0.53);
        vec4 nMacro = texture2D(uNoiseAtlas, uvMacro);
        vec4 nFault = texture2D(uNoiseAtlas, uvFault + (nMacro.gb - 0.5) * 0.28);

        // 3. 4-Band Derivative-Flat Basalt Cel Shading (high-contrast volcanic stone plates)
        float facetLift = 0.65 + 0.35 * ndv;
        float rockScore = clamp(ndl * 0.76 * facetLift + (nMacro.g - 0.5) * 0.16, 0.0, 1.0);
        vec3 rockCol = uColorChar;
        rockCol = mix(rockCol, uColorRockDark, step(0.26, rockScore));
        rockCol = mix(rockCol, uColorRockMid, step(0.50, rockScore));
        rockCol = mix(rockCol, uColorRockLit, step(0.74, rockScore));

        // 4. Tectonic Magma Fissures (gated by low-freq tectonic zones + recessed cavity + basal root heat)
        float basalGlow = isSlab * smoothstep(0.42, -0.15, vLocalPos.y);
        float tectonicGate = smoothstep(0.42, 0.78, nMacro.b + vCavity * 0.65 + basalGlow * 0.75);
        float seamLine = smoothstep(0.68, 0.93, nFault.r) * tectonicGate;
        float cavityMagma = smoothstep(0.48, 0.88, vCavity) * smoothstep(0.35, 0.80, nFault.b);
        float magmaMask = clamp((seamLine * 0.92 + cavityMagma * 0.75 + basalGlow * 0.68) * clamp(heat, 0.0, 1.35), 0.0, 1.0);

        vec3 magmaCol = mix(uColorCrackDeep, uColorCrack * 1.08, smoothstep(0.18, 0.58, magmaMask));
        magmaCol = mix(magmaCol, uColorHot * 1.22, smoothstep(0.64, 0.94, magmaMask));

        vec3 finalColor = mix(rockCol * mix(0.86, 1.0, uDaylight), magmaCol, smoothstep(0.18, 0.45, magmaMask));

        // 5. Crisp Dark Charred Ink Silhouette Rim (dot(N, V))
        float inkRim = 1.0 - smoothstep(0.14, 0.24, ndv);
        finalColor = mix(finalColor, uColorInk, inkRim * (1.0 - magmaMask * 0.55));

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

function createFireWakeCutoutMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'CinderFallFireWakeCutoutMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uColorFlameEdge: { value: new THREE.Color(config.colorFlameEdge) },
      uColorFlameMid: { value: new THREE.Color(config.colorFlameMid) },
      uColorFlameCore: { value: new THREE.Color(config.colorFlameCore) },
      uColorFlameSmoke: { value: new THREE.Color(config.colorFlameSmoke) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aWakeMeta; // x: age01, y: heat, z: seed, w: intensity
      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vMeta = aWakeMeta;

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
      uniform vec3 uColorFlameEdge;
      uniform vec3 uColorFlameMid;
      uniform vec3 uColorFlameCore;
      uniform vec3 uColorFlameSmoke;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        float age = clamp(vMeta.x, 0.0, 1.0);
        float heat = vMeta.y;
        float seed = vMeta.z;
        float intensity = vMeta.w;
        if (intensity <= 0.01 || age >= 1.0) discard;

        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        // Scroll FBM channel (B/G) along tongue axis (vUv.y) for licking Ukiyo-e flame tongues (never Voronoi giraffe cells!)
        vec2 scrollUv = vec2(vUv.x * 1.15 + seed * 0.37, vUv.y * 0.95 - uTime * 2.4 + seed * 0.71);
        vec4 n0 = texture2D(uNoiseAtlas, scrollUv);
        vec4 n1 = texture2D(uNoiseAtlas, scrollUv * 1.75 + vec2(0.29, -uTime * 1.5));

        float tongueWave = n0.b * 0.62 + n1.g * 0.38;
        float tipErode = smoothstep(1.0, 0.14, vUv.y) * 0.76 + 0.24;
        float erodedMask = (tongueWave * 0.64 + ndv * 0.52) * tipErode * (1.0 - age * 0.38) * intensity;

        // Hard alphaTest cutout (strictly >= 0.45, zero transparent fog!)
        if (erodedMask < 0.45) discard;

        // 3-Band Ukiyo-e Cel Fire + Dark Soot-Ink Border
        float fireBand = (erodedMask - 0.45) / 0.55 + heat * 0.18 * (1.0 - vUv.y);
        vec3 col = uColorFlameEdge;
        col = mix(col, uColorFlameMid, step(0.26, fireBand));
        col = mix(col, uColorFlameCore * 1.15, step(0.60, fireBand));

        float inkBorder = 1.0 - smoothstep(0.45, 0.53, erodedMask);
        float silhouetteInk = 1.0 - smoothstep(0.14, 0.24, ndv);
        col = mix(col, uColorFlameSmoke, max(inkBorder, silhouetteInk * 0.85));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createCraterDecalMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'CinderFallCraterDecalMaterial',
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
      uColorChar: { value: new THREE.Color(config.colorChar) },
      uColorRockDark: { value: new THREE.Color(config.colorRockDark) },
      uColorRockMid: { value: new THREE.Color(config.colorRockMid) },
      uColorCrackDeep: { value: new THREE.Color(config.colorCrackDeep) },
      uColorCrack: { value: new THREE.Color(config.colorCrack) },
      uColorHot: { value: new THREE.Color(config.colorHot) },
      uColorInk: { value: new THREE.Color(config.colorInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aDecalMeta; // x: age01, y: reach, z: seed, w: heat
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
      uniform vec3 uColorChar;
      uniform vec3 uColorRockDark;
      uniform vec3 uColorRockMid;
      uniform vec3 uColorCrackDeep;
      uniform vec3 uColorCrack;
      uniform vec3 uColorHot;
      uniform vec3 uColorInk;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;

      float slagHeightAt(vec2 q) {
        vec4 n0 = texture2D(uNoiseAtlas, q * 0.12);
        vec4 n1 = texture2D(uNoiseAtlas, q * 0.31 + vec2(0.41, 0.19));
        return n0.b * 0.65 + n1.g * 0.35;
      }

      void main() {
        float age = clamp(vMeta.x, 0.0, 1.0);
        float reach = vMeta.y;
        float seed = vMeta.z;
        float heat = vMeta.w;
        if (reach <= 0.01 || age >= 1.0) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p) / max(0.15, reach);
        float ang = atan(p.y, p.x);

        vec2 wPos = vWorldPos.xz;
        vec4 n0 = texture2D(uNoiseAtlas, wPos * 0.14 + vec2(seed * 0.37, seed * 0.61));
        vec4 n1 = texture2D(uNoiseAtlas, wPos * 0.32 + vec2(0.23, 0.51));

        // Wide Scorched Volcanic Slag Basin (grounds all outer basalt rim slabs!) + 8 Radial Tectonic Rifts
        float armWave = cos(ang * 8.0 + (n0.b - 0.5) * 2.6 + r * 1.4);
        float armMask = smoothstep(0.54, 0.94, armWave) * smoothstep(1.06, 0.20, r);
        float basinLobes = 0.78 + (n0.b - 0.5) * 0.24 + (n1.g - 0.5) * 0.12;
        float basinMask = smoothstep(basinLobes, basinLobes - 0.28, r);

        float fadeOut = 1.0 - smoothstep(0.70, 1.0, age);
        float totalMask = max(basinMask * 0.92, armMask * 0.96) * fadeOut;

        // Hard cel cutout (< 0.45 discarded)
        if (totalMask < 0.45) discard;

        // 3D height-field volcanic slag normal relief
        float e = 0.18;
        float h  = slagHeightAt(wPos);
        float hx = slagHeightAt(wPos + vec2(e, 0.0));
        float hy = slagHeightAt(wPos + vec2(0.0, e));
        vec3 nrm = normalize(vec3((h - hx) / e * 0.42, 1.0, (h - hy) / e * 0.42));
        vec3 lightDir = normalize(vec3(uSunDir.x, max(0.38, uSunDir.y), uSunDir.z));
        float lambert = clamp(dot(nrm, lightDir), 0.0, 1.0);

        vec3 rockBase = mix(uColorChar, uColorRockDark, step(0.38, lambert * 0.7 + h * 0.3));
        rockBase = mix(rockBase, uColorRockMid, step(0.68, lambert * 0.7 + h * 0.3));

        // Crisp 3-band cel-shaded radial magma fault lines & fractured caldera floor (never a blurry orange gradient!)
        float centralRing = smoothstep(0.38, 0.22, abs(r - 0.24 + (n0.b - 0.5) * 0.10));
        float riftLine = smoothstep(0.76, 0.94, armWave) * smoothstep(0.95, 0.14, r);
        float concentricRing = smoothstep(0.055, 0.0, abs(r - 0.54 + (n0.b - 0.5) * 0.07));
        float vorFault = smoothstep(0.74, 0.92, n1.r) * smoothstep(0.65, 0.15, r);
        float lavaFactor = clamp((max(riftLine, vorFault * 0.85) + centralRing * 0.72 + concentricRing * 0.78) * min(1.05, heat), 0.0, 1.0);

        vec3 lavaCol = uColorCrackDeep;
        lavaCol = mix(lavaCol, uColorCrack * 1.06, step(0.42, lavaFactor));
        lavaCol = mix(lavaCol, uColorHot * 1.18, step(0.76, lavaFactor));
        vec3 col = mix(rockBase * mix(0.84, 0.98, uDaylight), lavaCol, step(0.28, lavaFactor));

        float border = 1.0 - smoothstep(0.45, 0.53, totalMask);
        col = mix(col, uColorInk, border * (1.0 - step(0.28, lavaFactor) * 0.5));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. Pooled, Deterministic CinderFallSystem (<= 4 Draw Calls)               */
/* ------------------------------------------------------------------------- */

const MAX_ASTEROID_CORES = 4; // 1 primary meteor monolith + 3 split basalt-magma boulders on impact
const MAX_FIRE_TONGUES = 34; // wake plumes (in-flight) + roaring crater eruption fire tongues (post-impact)
const MAX_CRATER_ROCKS = 40; // 16 crater rim basalt monoliths + 24 ballistic cinder rocks
const MAX_CRATER_DECALS = 2;

const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _nextPos = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();

export class CinderFallSystem {
  constructor({
    scene,
    getGroundHeight = () => 0,
    config = {},
    onApexImpact = null,
  } = {}) {
    this.scene = scene || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.config = { ...CINDER_FALL_DEFAULTS, ...config };
    this.onApexImpact = onApexImpact;

    this.noiseAtlas = getSharedNoiseAtlas();

    this.sharedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
    };

    this.group = new THREE.Group();
    this.group.name = 'CinderFallVfxRoot';
    this.group.visible = false;
    if (this.scene) {
      this.scene.add(this.group);
    }

    this.origin = new THREE.Vector3(0, 0, 0);
    this.direction = new THREE.Vector3(1, 0, 0);
    this.side = new THREE.Vector3(0, 0, 1);
    this.castLength = this.config.range;
    this.active = false;
    this.age = 0;

    this._shakeOffset = new THREE.Vector3();
    this._hitstopScale = 1.0;

    this._buildMeshes();
    this._seedRecords(1.0);
  }

  _buildMeshes() {
    const c = this.config;

    this.basaltMat = createBasaltMagmaMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.fireWakeMat = createFireWakeCutoutMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.craterDecalMat = createCraterDecalMaterial(this.noiseAtlas, this.sharedUniforms, c);

    // DC 1: Angular Chiseled Volcanic Basalt-Magma Asteroid Monolith
    const asteroidGeo = createVolcanicAsteroidGeometry({
      subdivisions: 1,
      cuts: 11,
      cutDepth: 0.34,
      craters: 6,
      craterDepth: 0.22,
    });
    this.asteroidMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_ASTEROID_CORES * 4),
      4
    );
    asteroidGeo.setAttribute('aInstanceMeta', this.asteroidMetaAttr);
    this.asteroidMesh = new THREE.InstancedMesh(asteroidGeo, this.basaltMat, MAX_ASTEROID_CORES);
    this.asteroidMesh.name = 'CinderFall_DC1_BasaltAsteroid';
    this.asteroidMesh.frustumCulled = false;
    this.asteroidMesh.count = 0;
    this.group.add(this.asteroidMesh);

    // DC 2: Hard-Cutout Cel Fire-Tongue Wake & Crater Plumes
    const flameHullGeo = createFlameTongueHullGeometry({ rings: 10, sides: 8 });
    this.wakeMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_FIRE_TONGUES * 4),
      4
    );
    flameHullGeo.setAttribute('aWakeMeta', this.wakeMetaAttr);
    this.fireWakeMesh = new THREE.InstancedMesh(flameHullGeo, this.fireWakeMat, MAX_FIRE_TONGUES);
    this.fireWakeMesh.name = 'CinderFall_DC2_FireTongueWake';
    this.fireWakeMesh.frustumCulled = false;
    this.fireWakeMesh.count = 0;
    this.group.add(this.fireWakeMesh);

    // DC 3: 16 Tilted Crater Rim Basalt Monoliths + 24 Ballistic Cinder Rocks
    const slabGeo = createGlacierCrystalGeometry({
      seed: 41.9,
      sides: 7,
      taper: 0.68,
      roughness: 0.16,
      bend: 0.38,
    });
    const posCount = slabGeo.attributes.position.count;
    const cavArr = new Float32Array(posCount);
    for (let i = 0; i < posCount; i++) {
      const py = slabGeo.attributes.position.getY(i);
      cavArr[i] = clamp(1.0 - Math.max(0.0, py) * 1.25, 0.0, 1.0) * 0.72;
    }
    slabGeo.setAttribute('aCavity', new THREE.BufferAttribute(cavArr, 1));
    this.rocksMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_CRATER_ROCKS * 4),
      4
    );
    slabGeo.setAttribute('aInstanceMeta', this.rocksMetaAttr);
    this.craterRocksMesh = new THREE.InstancedMesh(slabGeo, this.basaltMat, MAX_CRATER_ROCKS);
    this.craterRocksMesh.name = 'CinderFall_DC3_CraterSlabsAndCinders';
    this.craterRocksMesh.frustumCulled = false;
    this.craterRocksMesh.count = 0;
    this.group.add(this.craterRocksMesh);

    // DC 4: Wide 3D-Relieved Volcanic Slag & Lava-Rift Crater Decal
    const decalGeo = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    this.decalMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_CRATER_DECALS * 4),
      4
    );
    decalGeo.setAttribute('aDecalMeta', this.decalMetaAttr);
    this.craterDecalMesh = new THREE.InstancedMesh(decalGeo, this.craterDecalMat, MAX_CRATER_DECALS);
    this.craterDecalMesh.name = 'CinderFall_DC4_LavaVeinCraterDecal';
    this.craterDecalMesh.frustumCulled = false;
    this.craterDecalMesh.count = 0;
    this.group.add(this.craterDecalMesh);
  }

  _trajectoryAt(u, out) {
    const c = this.config;
    const t = clamp(u, 0.0, 1.0);
    const dist = lerp(c.handForward, this.castLength, t);
    const x = this.origin.x + this.direction.x * dist;
    const z = this.origin.z + this.direction.z * dist;
    const baseH = lerp(
      this.origin.y + c.handHeight,
      this.getGroundHeight(x, z) + c.endHeight,
      t
    );
    const arcLift = Math.pow(Math.max(0.0, Math.sin(t * Math.PI)), c.arcCurve) * c.arc;
    out.set(x, baseH + arcLift, z);
    return out;
  }

  _seedRecords(seed = 1.0) {
    const c = this.config;
    this.impactTime = this.castLength / Math.max(1.0, c.speed); // ~0.622s for 14m at 22.5 m/s
    this.totalDuration = this.impactTime + c.lifetime + c.fadeTime;

    this.rimSlabRecords = [];
    for (let i = 0; i < c.rimSlabCount; i++) {
      const s = seed * 19.7 + i * 29.3;
      const ang = (i / c.rimSlabCount) * TAU + signedHash(s + 1.1) * 0.14;
      // Stepped-down front-right camera window so crater core, asteroid & staggering Skeleton_Warrior read clearly
      const isFrontWindow = ang > 0.30 && ang < 2.45;
      this.rimSlabRecords.push({
        seed: hash11(s + 2.3) * 10.0,
        ang,
        radial: c.craterRadius * (0.66 + 0.32 * hash11(s + 3.7)),
        height: (isFrontWindow ? 0.78 : 2.15) * (0.80 + 0.45 * hash11(s + 5.1)),
        radius: (isFrontWindow ? 0.44 : 0.64) + 0.28 * hash11(s + 6.9),
        lean: 0.42 + 0.26 * hash11(s + 8.3),
        stagger: hash11(s + 9.7) * 0.05,
      });
    }

    this.cinderRockRecords = [];
    for (let i = 0; i < c.cinderRockCount; i++) {
      const s = seed * 41.3 + i * 17.9;
      // Route ballistic cinder rocks outside the front camera sightline (avoiding ang in [0.35, 2.35]) so Skeleton_Warrior's chest is never occluded!
      const rawU = i / c.cinderRockCount;
      const ang = lerp(2.40, TAU + 0.30, rawU) + signedHash(s + 1.3) * 0.15;
      const speed = 6.2 + 5.8 * hash11(s + 2.9);
      this.cinderRockRecords.push({
        seed: hash11(s + 4.1) * 10.0,
        ang,
        vx: Math.cos(ang) * speed,
        vz: Math.sin(ang) * speed,
        vy: 4.8 + 4.8 * hash11(s + 5.7),
        size: 0.20 + 0.16 * hash11(s + 7.3),
        spinX: signedHash(s + 8.9) * 7.0,
        spinY: signedHash(s + 10.1) * 7.0,
        spinZ: signedHash(s + 11.7) * 7.0,
      });
    }

    this.fireTongueRecords = [];
    for (let i = 0; i < MAX_FIRE_TONGUES; i++) {
      const s = seed * 59.1 + i * 23.7;
      const isWake = i < 14;
      this.fireTongueRecords.push({
        isWake,
        seed: hash11(s + 1.7) * 10.0,
        uOffset: isWake ? i / 14 : (i - 14) / Math.max(1, MAX_FIRE_TONGUES - 14),
        ang: (i / MAX_FIRE_TONGUES) * TAU * 2.0 + signedHash(s + 3.1) * 0.35,
        radial: 0.25 + 0.75 * hash11(s + 4.9),
        scale: 0.72 + 0.65 * hash11(s + 6.3),
      });
    }
  }

  cast(origin, direction, options = {}) {
    if (origin) {
      this.origin.set(origin.x ?? origin[0] ?? 0, origin.y ?? origin[1] ?? 0, origin.z ?? origin[2] ?? 0);
    }
    if (direction) {
      const dx = direction.x ?? direction[0] ?? 1;
      const dz = direction.z ?? direction[2] ?? 0;
      const len = Math.hypot(dx, dz) || 1;
      this.direction.set(dx / len, 0, dz / len);
    }
    this.side.set(-this.direction.z, 0, this.direction.x);
    this.castLength = options.range ?? this.config.range;
    this.origin.y = this.getGroundHeight(this.origin.x, this.origin.z);

    this._seedRecords(options.seed ?? 1.0);
    this.active = true;
    this.age = 0;
    this.group.visible = true;
    this.seek(0.01);
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

  seek(timeSeconds) {
    if (timeSeconds < 0 || timeSeconds > this.totalDuration + 0.1) {
      this.clear();
      return this;
    }

    this.active = true;
    this.age = timeSeconds;
    this.group.visible = true;
    this.sharedUniforms.uTime.value = timeSeconds;

    const c = this.config;
    const flightU = saturate(timeSeconds / Math.max(0.05, this.impactTime));
    const impactElapsed = timeSeconds - this.impactTime;
    const postImpactU = saturate(impactElapsed / Math.max(0.1, c.lifetime + c.fadeTime));
    const fadeShrink = 1.0 - smoothstep(0.65, 1.0, postImpactU);

    const impX = this.origin.x + this.direction.x * this.castLength;
    const impZ = this.origin.z + this.direction.z * this.castLength;
    const impY = this.getGroundHeight(impX, impZ);

    // 1. Evaluate Chiseled Volcanic Basalt Asteroid Monolith (DC 1)
    let astSlot = 0;
    if (impactElapsed < 0) {
      // Hurtling mid-air asteroid along arc
      this._trajectoryAt(flightU, _pos);
      _dummy.position.copy(_pos);
      _euler.set(timeSeconds * c.spin, timeSeconds * c.spin * 0.78, timeSeconds * c.spin * 0.52);
      _dummy.quaternion.setFromEuler(_euler);
      const popIn = smoothstep(0.0, 0.08, flightU);
      _dummy.scale.setScalar(c.radius * popIn);
      _dummy.updateMatrix();
      this.asteroidMesh.setMatrixAt(astSlot, _dummy.matrix);
      this.asteroidMetaAttr.setXYZW(astSlot, 1.7, 0.90 + 0.45 * flightU, 0.0, flightU);
      astSlot++;
    } else if (fadeShrink > 0.02) {
      // Colossal angular basalt-magma asteroid monolith embedded just behind/left of Skeleton_Warrior
      // so both the jagged basalt monolith and the staggering Skeleton_Warrior are 100% hero-legible!
      const settleDrop = smoothstep(0.0, 0.45, impactElapsed) * 0.28;
      const sinkY = (1.0 - fadeShrink) * 0.85;
      _dummy.position.set(impX - 1.05, impY + 1.06 - settleDrop - sinkY, impZ - 0.25);
      _euler.set(0.38, 0.95, -0.28);
      _dummy.quaternion.setFromEuler(_euler);
      _dummy.scale.set(
        c.radius * 1.28 * fadeShrink,
        c.radius * 1.16 * fadeShrink,
        c.radius * 1.24 * fadeShrink
      );
      _dummy.updateMatrix();
      this.asteroidMesh.setMatrixAt(astSlot, _dummy.matrix);
      this.asteroidMetaAttr.setXYZW(astSlot, 1.7, 1.15 * fadeShrink, 0.0, postImpactU);
      astSlot++;

      // 3 fractured volcanic boulder chunks flanking the impact basin
      const splitAngles = [-2.25, 2.05, -0.65];
      for (let b = 0; b < 3; b++) {
        const bAng = splitAngles[b];
        const bDist = 1.65 + smoothstep(0.0, 0.24, impactElapsed) * 0.55;
        const bx = impX + Math.cos(bAng) * bDist;
        const bz = impZ + Math.sin(bAng) * bDist;
        const by = this.getGroundHeight(bx, bz) + 0.42 - sinkY * 0.6;
        _dummy.position.set(bx, by, bz);
        _euler.set(b * 1.1 + 0.4, bAng, 0.35);
        _dummy.quaternion.setFromEuler(_euler);
        _dummy.scale.set(
          c.radius * 0.66 * fadeShrink,
          c.radius * 0.58 * fadeShrink,
          c.radius * 0.64 * fadeShrink
        );
        _dummy.updateMatrix();
        this.asteroidMesh.setMatrixAt(astSlot, _dummy.matrix);
        this.asteroidMetaAttr.setXYZW(astSlot, 3.1 + b, 1.10 * fadeShrink, 0.0, postImpactU);
        astSlot++;
      }
    }
    this.asteroidMesh.count = astSlot;
    this.asteroidMesh.instanceMatrix.needsUpdate = true;
    this.asteroidMetaAttr.needsUpdate = true;

    // 2. Evaluate Hard-Cutout Cel Fire-Tongue Wake (In-Flight) & Crater Eruption Plumes (Post-Impact) (DC 2)
    let wakeSlot = 0;
    const wakeBurnU = impactElapsed > 0 ? saturate(impactElapsed / Math.max(0.02, c.trailBurnout)) : 0.0;

    for (let i = 0; i < MAX_FIRE_TONGUES; i++) {
      const rec = this.fireTongueRecords[i];
      if (rec.isWake && wakeBurnU < 0.99) {
        // In-flight sky wake behind the falling meteor (collapses cleanly into the crater upon impact!)
        const headU = impactElapsed < 0 ? flightU : 0.96;
        const tailU = lerp(Math.max(0.0, headU - 0.48), headU, wakeBurnU);
        const sampleU = lerp(tailU, headU, rec.uOffset);
        if (sampleU <= 0.01) continue;

        this._trajectoryAt(sampleU, _pos);
        this._trajectoryAt(Math.max(0.0, sampleU - 0.04), _nextPos);
        _tangent.subVectors(_nextPos, _pos);
        if (_tangent.lengthSq() < 1e-5) _tangent.set(-this.direction.x, 0.45, -this.direction.z);
        _tangent.y += 0.35;
        _tangent.normalize();

        const swirlR = (1.0 - rec.uOffset) * 0.34;
        _pos.x += this.side.x * Math.cos(rec.ang + timeSeconds * 5.0) * swirlR;
        _pos.y += Math.sin(rec.ang + timeSeconds * 5.0) * swirlR * 0.6;
        _pos.z += this.side.z * Math.cos(rec.ang + timeSeconds * 5.0) * swirlR;

        _dummy.position.copy(_pos);
        _quat.setFromUnitVectors(UP, _tangent);
        _dummy.quaternion.copy(_quat);
        const wScale = rec.scale * (0.55 + 0.65 * rec.uOffset) * (1.0 - wakeBurnU);
        _dummy.scale.set(wScale * 0.72, wScale * 1.85, wScale * 0.72);
        _dummy.updateMatrix();
        this.fireWakeMesh.setMatrixAt(wakeSlot, _dummy.matrix);
        this.wakeMetaAttr.setXYZW(
          wakeSlot,
          wakeBurnU * 0.7 + (1.0 - rec.uOffset) * 0.25,
          0.95,
          rec.seed,
          1.0 - wakeBurnU
        );
        wakeSlot++;
      } else if (!rec.isWake && impactElapsed >= -0.02 && postImpactU < 0.88) {
        // Horseshoe crown of roaring volcanic fire-tongue plumes framing the crater & basalt monolith
        const tCol = Math.max(0.01, impactElapsed + 0.02);
        const colFade = 1.0 - smoothstep(0.38, 0.88, postImpactU);
        const kIdx = i - 14;
        const kSpan = kIdx / Math.max(1, MAX_FIRE_TONGUES - 15);
        // Wrap around the rear & flanks (-2.65 .. +0.32 rad) leaving the front-right camera view open
        const horseshoeAng = lerp(-2.65, 0.32, kSpan);
        const rDist = (1.45 + rec.radial * 1.35) * smoothstep(0.0, 0.18, tCol);
        const fx = impX + Math.cos(horseshoeAng) * rDist;
        const fz = impZ + Math.sin(horseshoeAng) * rDist;
        const fy = this.getGroundHeight(fx, fz) + 0.05;

        _dummy.position.set(fx, fy, fz);
        _pos.set(Math.cos(horseshoeAng) * 0.34, 1.0, Math.sin(horseshoeAng) * 0.34).normalize();
        _dummy.quaternion.setFromUnitVectors(UP, _pos);
        const hScale = rec.scale * (1.75 + 1.05 * (1.0 - rec.radial)) * outQuint(Math.min(1.0, tCol * 4.8)) * colFade;
        const rScale = rec.scale * 0.88 * colFade;
        _dummy.scale.set(rScale, hScale, rScale);
        _dummy.updateMatrix();
        this.fireWakeMesh.setMatrixAt(wakeSlot, _dummy.matrix);
        this.wakeMetaAttr.setXYZW(wakeSlot, postImpactU * 0.82, 1.18, rec.seed, colFade);
        wakeSlot++;
      }
    }
    this.fireWakeMesh.count = wakeSlot;
    this.fireWakeMesh.instanceMatrix.needsUpdate = true;
    this.wakeMetaAttr.needsUpdate = true;

    // 3. Evaluate 16 Tilted Crater Rim Basalt Monoliths + 24 Ballistic Cinder Rocks (DC 3)
    let rockSlot = 0;
    if (impactElapsed >= -0.01 && fadeShrink > 0.02) {
      const tImp = Math.max(0.0, impactElapsed + 0.01);

      // 3a. 16 Crater Rim Basalt-and-Magma Monoliths
      for (let i = 0; i < this.rimSlabRecords.length; i++) {
        const slab = this.rimSlabRecords[i];
        const tSlab = tImp - slab.stagger;
        if (tSlab < 0) continue;
        const emerge = outQuint(Math.min(1.0, tSlab / 0.15));
        const sx = impX + Math.cos(slab.ang) * slab.radial;
        const sz = impZ + Math.sin(slab.ang) * slab.radial;
        const sy = this.getGroundHeight(sx, sz) - 0.16 - (1.0 - fadeShrink) * 1.1;

        _dummy.position.set(sx, sy, sz);
        _pos.set(
          Math.cos(slab.ang) * Math.sin(slab.lean),
          Math.cos(slab.lean),
          Math.sin(slab.ang) * Math.sin(slab.lean)
        ).normalize();
        _dummy.quaternion.setFromUnitVectors(UP, _pos);
        _dummy.scale.set(
          slab.radius * emerge * fadeShrink,
          slab.height * emerge * fadeShrink,
          slab.radius * emerge * fadeShrink
        );
        _dummy.updateMatrix();
        this.craterRocksMesh.setMatrixAt(rockSlot, _dummy.matrix);
        this.rocksMetaAttr.setXYZW(rockSlot, slab.seed, 1.22 * fadeShrink, 1.0, postImpactU);
        rockSlot++;
      }

      // 3b. 24 Ballistic Cinder Rocks
      const gravity = -17.0;
      const drag = 0.65;
      for (let i = 0; i < this.cinderRockRecords.length; i++) {
        const cin = this.cinderRockRecords[i];
        const dragT = (1.0 - Math.exp(-drag * tImp)) / drag;
        const cx = impX + cin.vx * dragT;
        const cz = impZ + cin.vz * dragT;
        const floorY = this.getGroundHeight(cx, cz) + 0.08;
        const rawY = impY + 0.45 + cin.vy * dragT + 0.5 * gravity * tImp * tImp;
        const cy = Math.max(floorY, rawY);
        const spinT = rawY <= floorY ? tImp * 0.2 : tImp;

        _dummy.position.set(cx, cy, cz);
        _euler.set(cin.spinX * spinT, cin.ang + cin.spinY * spinT, cin.spinZ * spinT);
        _dummy.quaternion.setFromEuler(_euler);
        const sc = cin.size * fadeShrink;
        _dummy.scale.set(sc * 0.95, sc * 1.35, sc * 0.95);
        _dummy.updateMatrix();
        this.craterRocksMesh.setMatrixAt(rockSlot, _dummy.matrix);
        this.rocksMetaAttr.setXYZW(rockSlot, cin.seed, 1.05 * fadeShrink, 0.4, postImpactU);
        rockSlot++;
      }
    }
    this.craterRocksMesh.count = rockSlot;
    this.craterRocksMesh.instanceMatrix.needsUpdate = true;
    this.rocksMetaAttr.needsUpdate = true;

    // 4. Evaluate Wide 3D Volcanic Slag & Lava-Rift Crater Decal (DC 4)
    let decalSlot = 0;
    if (impactElapsed >= -0.02) {
      const tCrater = Math.max(0.01, impactElapsed + 0.02);
      const reach = smoothstep(0.0, 0.18, tCrater);
      const castYaw = Math.atan2(this.direction.x, this.direction.z);
      _dummy.position.set(impX, impY + 0.042, impZ);
      _dummy.quaternion.setFromAxisAngle(UP, castYaw);
      _dummy.scale.set(c.fissureRadius, 1.0, c.fissureRadius);
      _dummy.updateMatrix();
      this.craterDecalMesh.setMatrixAt(decalSlot, _dummy.matrix);
      this.decalMetaAttr.setXYZW(decalSlot, postImpactU, reach, 0.49, 1.22 * fadeShrink);
      decalSlot++;
    }
    this.craterDecalMesh.count = decalSlot;
    this.craterDecalMesh.instanceMatrix.needsUpdate = true;
    this.decalMetaAttr.needsUpdate = true;

    // Hitstop & Camera Shake
    this._hitstopScale = Math.abs(timeSeconds - this.impactTime) <= 0.04 ? 0.05 : 1.0;
    if (impactElapsed >= 0 && impactElapsed <= 0.65) {
      const env = Math.exp(-impactElapsed * 5.8) * 0.22;
      this._shakeOffset.set(
        Math.sin(impactElapsed * 48.0) * env * 0.7,
        Math.abs(Math.cos(impactElapsed * 56.0)) * env,
        Math.cos(impactElapsed * 42.0) * env * 0.7
      );
    } else {
      this._shakeOffset.set(0, 0, 0);
    }

    return this;
  }

  update(dt) {
    if (!this.active) return;
    const nextAge = this.age + dt;
    if (nextAge > this.totalDuration) {
      this.clear();
      return;
    }
    this.seek(nextAge);
  }

  getStats() {
    if (!this.active || !this.group.visible) {
      return {
        active: false,
        drawCalls: 0,
        activeAsteroids: 0,
        activeFireTongues: 0,
        activeCraterRocks: 0,
        activeDecals: 0,
      };
    }
    let drawCalls = 0;
    if (this.asteroidMesh.count > 0) drawCalls++;
    if (this.fireWakeMesh.count > 0) drawCalls++;
    if (this.craterRocksMesh.count > 0) drawCalls++;
    if (this.craterDecalMesh.count > 0) drawCalls++;
    return {
      active: true,
      age: Number(this.age.toFixed(3)),
      drawCalls,
      activeAsteroids: this.asteroidMesh.count,
      activeFireTongues: this.fireWakeMesh.count,
      activeCraterRocks: this.craterRocksMesh.count,
      activeDecals: this.craterDecalMesh.count,
    };
  }

  clear() {
    this.active = false;
    this.age = 0;
    this._shakeOffset.set(0, 0, 0);
    this._hitstopScale = 1.0;
    this.group.visible = false;
    this.asteroidMesh.count = 0;
    this.fireWakeMesh.count = 0;
    this.craterRocksMesh.count = 0;
    this.craterDecalMesh.count = 0;
  }

  dispose() {
    this.clear();
    this.asteroidMesh.geometry.dispose();
    this.fireWakeMesh.geometry.dispose();
    this.craterRocksMesh.geometry.dispose();
    this.craterDecalMesh.geometry.dispose();
    this.basaltMat.dispose();
    this.fireWakeMat.dispose();
    this.craterDecalMat.dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

export function createCinderFallSystem(options = {}) {
  return new CinderFallSystem(options);
}
