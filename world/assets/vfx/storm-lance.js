// ============================================================================
// world/assets/vfx/storm-lance.js
//
// Stage 4 Pass 2: Opaque Cel-Shaded "Storm Lance" Lightning Great-Spear VFX
//
// Visual & Engineering Contract:
// - Strictly <= 3 InstancedMeshes when active, 0 draw calls when idle (`group.visible = false`):
//     1. `lightningRibbonMesh` (1 InstancedMesh): Multi-role 3D Lightning
//        Great-Spear (`impactTime = 0.06s`, 24Hz strobe window `0.06..0.34s`,
//        clean gap-eroded snap-off `0.34..0.44s` in `< 0.10s`):
//          - Role 0: Taut, blazing white-gold/cyan Central Spear Shaft with
//            flared Great-Lance spearhead tip (`jitter = 0.025`).
//          - Role 1: 2 Helical Plasma Coils wrapping around the central shaft.
//          - Role 2: 3-target chain-lightning arcs jumping to `Skeleton_Mage`
//            and flank fulgurite pillars.
//        (`transparent: false, depthWrite: true, side: THREE.FrontSide`, hard
//        `discard < 0.45`).
//     2. `fulguriteSpikesMesh` (1 InstancedMesh): 14 chiseled 7-sided dark
//        volcanic obsidian-glass ground monoliths (`#14111f -> #3d335c`) at
//        100% scale & ground height (ZERO shrinking or floor sinking!), draining
//        gold veins downward and fracture-dissolving from tip & Voronoi faults
//        inward with a cyan-gold spark rim (`transparent: false`).
//     3. `fulguriteScarMesh` (1 InstancedMesh): Vitrified obsidian-violet
//        ground crater with razor-sharp branching Lichtenberg lightning
//        filaments (`transparent: false`, hard `discard < 0.45`).
// - Zero raw sRGB vec3 literals in GLSL; all palette colors passed via `THREE.Color`.
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';
import { createGlacierCrystalGeometry } from './frost-lance.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

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

export const STORM_LANCE_DEFAULTS = Object.freeze({
  range: 14.3, // default distance from Mage (60.8, -4.0) to Skeleton_Warrior (75.1, -3.8)
  speed: 240.0, // 0.06s lightning strike snap speed
  impactTime: 0.06,
  boltSnapStart: 0.34,
  boltSnapEnd: 0.44,
  lifetime: 0.52, // active discharge window before fulgurite drain/dissolve
  fadeTime: 1.08, // fulgurite voltage drain & fracture dissolve duration

  // Lightning Great-Spear & Helical Coil Geometry
  primaryStrands: 4,
  chainStrands: 12,
  handHeight: 1.12,
  handForward: 0.25,
  endHeight: 1.02,
  sag: 0.03,
  spreadNear: 0.10,
  spreadFar: 0.46,
  twist: 2.1,
  twistSpeed: 2.2,
  jitter: 0.18,
  jitterScale: 4.8,
  width: 0.17,

  // Fulgurite Spikes & Ground Scar
  spikeCount: 14,
  scarRadius: 4.8,

  // Linear-sRGB Palette Uniforms (passed via THREE.Color)
  colorVioletInk: '#140c2b',
  colorStormDeep: '#1d4ed8',
  colorStormMid: '#38bdf8',
  colorGoldCore: '#fff3a1',
  colorObsidian: '#14111f',
  colorWisteriaDark: '#241e38',
  colorWisteriaMid: '#3b3159',
  colorWisteriaLit: '#5b4c87',
  colorFulguriteInk: '#090612',
});

/* ------------------------------------------------------------------------- */
/* 1. Closed Double-Wound Camera-Aligned Ribbon Geometry (`side: FrontSide`) */
/* ------------------------------------------------------------------------- */

function createOpaqueRibbonGeometry(nodes = 48) {
  const steps = Math.max(4, Math.round(nodes));
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
/* 2. Opaque Cel Shaders (`transparent: false`)                              */
/* ------------------------------------------------------------------------- */

function createLightningRibbonMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'StormLanceLightningRibbonMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uBoltSnapOff: sharedUniforms.uBoltSnapOff,
      uColorVioletInk: { value: new THREE.Color(config.colorVioletInk) },
      uColorStormDeep: { value: new THREE.Color(config.colorStormDeep) },
      uColorStormMid: { value: new THREE.Color(config.colorStormMid) },
      uColorGoldCore: { value: new THREE.Color(config.colorGoldCore) },
      uSag: { value: config.sag },
      uSpreadNear: { value: config.spreadNear },
      uSpreadFar: { value: config.spreadFar },
      uTwist: { value: config.twist },
      uTwistSpeed: { value: config.twistSpeed },
      uJitter: { value: config.jitter },
      uJitterScale: { value: config.jitterScale },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aStartPos;
      attribute vec3 aEndPos;
      attribute vec4 aStrandMeta; // x: strandNorm (-1..1, 0 = taut core lance), y: seed, z: width, w: activeReach (0..1)

      uniform float uTime;
      uniform float uSag;
      uniform float uSpreadNear;
      uniform float uSpreadFar;
      uniform float uTwist;
      uniform float uTwistSpeed;
      uniform float uJitter;
      uniform float uJitterScale;

      varying float vSide;
      varying float vT;
      varying float vSeed;
      varying float vReach;
      varying float vIsCore;
      varying vec2 vUv;

      float triWave(float x) {
        return abs(fract(x) * 2.0 - 1.0) * 2.0 - 1.0;
      }

      vec3 evalBoltPoint(float t, vec3 startP, vec3 endP, vec3 dir, vec3 sideV, float strandNorm, float seed) {
        float tt = clamp(t, 0.0, 1.0);
        float absNorm = abs(strandNorm);
        float isCore = step(absNorm, 0.08);
        vec3 up = vec3(0.0, 1.0, 0.0);

        // 24Hz lightning strobe seed jump so coils & filaments crackle and re-strike violently in motion!
        float stepTime = floor(uTime * 24.0) * 1.37;

        vec3 p = mix(startP, endP, tt) + up * (uSag * (1.0 - isCore * 0.85) * sin(tt * 3.14159265));

        float envelope = sin(tt * 3.14159265) * smoothstep(1.0, 0.85, tt);
        float spread = mix(uSpreadNear, uSpreadFar, envelope) * (1.0 - isCore);
        float ringAng = seed * 6.28318 + strandNorm * 3.14159 + uTwist * 6.28318 * tt - uTime * uTwistSpeed * 6.28318 + stepTime * 0.42;
        vec3 radial = sideV * cos(ringAng) + up * sin(ringAng) * 0.78;
        p += radial * sign(strandNorm) * mix(0.65, 1.0, absNorm) * spread;

        float k1 = triWave(tt * uJitterScale + seed * 1.73 + stepTime * 0.31);
        float k2 = triWave(tt * uJitterScale * 2.3 - seed * 2.91 + stepTime * 0.57) * 0.45;
        float kink = (k1 + k2) * uJitter * mix(0.03, 0.45 + 0.55 * absNorm, 1.0 - isCore);

        float pinch = smoothstep(0.0, 0.08, tt) * smoothstep(1.0, 0.90, tt);
        vec3 kdir = normalize(sideV * cos(seed * 7.1 + strandNorm * 3.7) + up * sin(seed * 5.3 - strandNorm * 2.3));
        p += kdir * kink * pinch;
        return p;
      }

      void main() {
        float strandNorm = aStrandMeta.x;
        float seed = aStrandMeta.y;
        float baseWidth = aStrandMeta.z;
        float reach = aStrandMeta.w;

        float isCore = step(abs(strandNorm), 0.08);
        vSide = position.y;
        vT = position.x;
        vUv = vec2(position.x, position.y * 0.5 + 0.5);
        vSeed = seed;
        vReach = reach;
        vIsCore = isCore;

        if (reach <= 0.001 || baseWidth <= 0.001) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        vec3 delta = aEndPos - aStartPos;
        vec3 dir = normalize(vec3(delta.x, 0.0, delta.z) + vec3(1e-5, 0.0, 0.0));
        vec3 sideV = vec3(-dir.z, 0.0, dir.x);

        float t = position.x * min(1.0, reach);
        float eps = 0.014;
        vec3 p0 = evalBoltPoint(t, aStartPos, aEndPos, dir, sideV, strandNorm, seed);
        vec3 pa = evalBoltPoint(max(0.0, t - eps), aStartPos, aEndPos, dir, sideV, strandNorm, seed);
        vec3 pb = evalBoltPoint(min(1.0, t + eps), aStartPos, aEndPos, dir, sideV, strandNorm, seed);

        vec3 tangent = normalize(pb - pa + vec3(1e-5, 0.0, 0.0));
        vec3 viewDir = normalize(cameraPosition - p0);
        vec3 ribbonOrtho = normalize(cross(viewDir, tangent));

        float spearheadSwell = isCore * exp(-pow((t - 0.86) * 11.0, 2.0)) * 1.25;
        float tipTaper = smoothstep(1.0, 0.93, t) * 0.84 + 0.16;
        float bodyTaper = (sin(clamp(t, 0.02, 0.98) * 3.14159265) * 0.42 + 0.58 + spearheadSwell) * tipTaper;

        float w = baseWidth * bodyTaper;
        vec3 world = p0 + ribbonOrtho * (position.y * w) + viewDir * (position.z * (0.005 + isCore * 0.012));

        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform float uBoltSnapOff;
      uniform vec3 uColorVioletInk;
      uniform vec3 uColorStormDeep;
      uniform vec3 uColorStormMid;
      uniform vec3 uColorGoldCore;

      varying float vSide;
      varying float vT;
      varying float vSeed;
      varying float vReach;
      varying float vIsCore;
      varying vec2 vUv;

      void main() {
        if (vReach <= 0.01 || vT > vReach || uBoltSnapOff >= 0.995) discard;

        float boltSnapOff = clamp(uBoltSnapOff, 0.0, 1.0);
        vec4 n0 = texture2D(uNoiseAtlas, vec2(vUv.x * 3.2 + vSeed * 0.41, vSeed * 0.73));
        // Cleanly snap the lightning beam off between t = 0.34..0.44s by eroding gaps along vUv.x!
        if (n0.b < boltSnapOff) discard;

        float edgeDist = abs(vSide);
        vec2 nUv = vec2(vT * 2.8 - uTime * 3.5 + vSeed * 0.37, vSide * 0.45 + vSeed * 0.73);
        vec4 nSample = texture2D(uNoiseAtlas, nUv);

        float centerWeight = 1.0 - edgeDist;
        float noiseWeight = mix(0.28, 0.14, vIsCore);
        float plasmaErode = centerWeight * 0.88 + (nSample.b - 0.35) * noiseWeight;
        if (plasmaErode < 0.45) discard;

        vec3 col = uColorStormDeep;
        col = mix(col, uColorStormMid * 1.06, step(0.56, plasmaErode));
        col = mix(col, uColorGoldCore * 1.24, step(mix(0.76, 0.70, vIsCore), plasmaErode));

        float inkBorder = 1.0 - smoothstep(0.45, 0.53, plasmaErode);
        col = mix(col, uColorVioletInk, inkBorder);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createFulguriteSpikeMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'StormLanceFulguriteSpikeMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uColorObsidian: { value: new THREE.Color(config.colorObsidian) },
      uColorWisteriaDark: { value: new THREE.Color(config.colorWisteriaDark) },
      uColorWisteriaMid: { value: new THREE.Color(config.colorWisteriaMid) },
      uColorWisteriaLit: { value: new THREE.Color(config.colorWisteriaLit) },
      uColorStormMid: { value: new THREE.Color(config.colorStormMid) },
      uColorGoldCore: { value: new THREE.Color(config.colorGoldCore) },
      uColorInk: { value: new THREE.Color(config.colorFulguriteInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSpikeMeta; // x: seed, y: charge, z: dissolveProgress (0..1), w: unused
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec4 vMeta;

      void main() {
        vLocalPos = position;
        vMeta = aSpikeMeta;

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
      uniform vec3 uColorObsidian;
      uniform vec3 uColorWisteriaDark;
      uniform vec3 uColorWisteriaMid;
      uniform vec3 uColorWisteriaLit;
      uniform vec3 uColorStormMid;
      uniform vec3 uColorGoldCore;
      uniform vec3 uColorInk;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec4 vMeta;

      void main() {
        float seed = vMeta.x;
        float charge = max(0.0, vMeta.y);
        float dissolveProgress = clamp(vMeta.z, 0.0, 1.0);

        // 1. Crisp Derivative-Flat Facet Normal + Horizontal Azimuth Contrast
        vec3 dN = cross(dFdx(vWorldPos), dFdy(vWorldPos));
        vec3 N = length(dN) > 1e-8 ? normalize(dN) : normalize(vWorldNormal);
        if (dot(N, vWorldNormal) < 0.0) N = -N;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 horizN = normalize(vec3(N.x, 0.0, N.z) + vec3(1e-5, 0.0, 0.0));
        vec3 horizV = normalize(vec3(V.x, 0.0, V.z) + vec3(1e-5, 0.0, 0.0));
        float horizNdv = clamp(dot(horizN, horizV), 0.0, 1.0);
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        vec3 L = normalize(vec3(uSunDir.x, max(0.45, uSunDir.y), uSunDir.z));
        float ndl = dot(N, L) * 0.5 + 0.5;

        // 2. Sample NoiseAtlas & Perform Tip-Downward + Voronoi Fault Fracture Dissolve (ZERO shrinking!)
        vec2 uvVein = vWorldPos.xz * 0.55 + vec2(vWorldPos.y * 0.65 + seed * 0.41, seed * 0.77);
        vec4 nSample = texture2D(uNoiseAtlas, uvVein);
        float hLocal = clamp(vLocalPos.y, 0.0, 1.0);
        float fractureVal = nSample.b * 0.65 + (1.0 - hLocal) * 0.35;
        if (fractureVal < dissolveProgress) discard;

        // 3. 4-Band Volcanic Obsidian-Slate Cel Shading (70%+ dark vitrified stone)
        float score = clamp(ndl * 0.52 + horizNdv * 0.48, 0.0, 1.0);
        vec3 col = uColorObsidian;
        col = mix(col, uColorWisteriaDark, step(0.28, score));
        col = mix(col, uColorWisteriaMid, step(0.56, score));
        col = mix(col, uColorWisteriaLit, step(0.80, score));

        // 4. Drain gold veins downward toward the root before/during fracture dissolve
        float drainLevel = clamp(charge, 0.0, 1.2);
        float heightDrainGate = smoothstep(drainLevel + 0.22, max(0.0, drainLevel - 0.18), hLocal);
        float basalSurge = smoothstep(0.42, 0.0, hLocal) * smoothstep(0.35, 0.85, nSample.b);
        float veinLine = smoothstep(0.66, 0.92, nSample.r) * smoothstep(0.32, 0.85, nSample.b + 0.25);
        float tipSpark = smoothstep(0.76, 0.98, hLocal) * 0.55;
        float electricMask = clamp((veinLine * 0.95 + basalSurge * 0.72 + tipSpark) * charge * heightDrainGate, 0.0, 1.0);

        vec3 veinCol = mix(uColorStormMid * 1.06, uColorGoldCore * 1.24, smoothstep(0.38, 0.82, electricMask));
        col = mix(col, veinCol, smoothstep(0.18, 0.52, electricMask));

        // 5. Cyan-Gold Spark Rim along the dissolving fracture boundary
        float sparkRim = step(0.001, dissolveProgress) * (1.0 - smoothstep(dissolveProgress, dissolveProgress + 0.07, fractureVal));
        col = mix(col, mix(uColorStormMid, uColorGoldCore, 0.65) * 1.35, sparkRim);

        // 6. Crisp Dark Obsidian Ink Silhouette Rim
        float inkRim = 1.0 - smoothstep(0.14, 0.25, ndv);
        col = mix(col, uColorInk, inkRim * (1.0 - max(electricMask * 0.55, sparkRim)));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createFulguriteScarMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'StormLanceFulguriteScarMaterial',
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
      uDaylight: sharedUniforms.uDaylight,
      uColorObsidian: { value: new THREE.Color(config.colorObsidian) },
      uColorWisteriaDark: { value: new THREE.Color(config.colorWisteriaDark) },
      uColorVioletInk: { value: new THREE.Color(config.colorVioletInk) },
      uColorStormMid: { value: new THREE.Color(config.colorStormMid) },
      uColorGoldCore: { value: new THREE.Color(config.colorGoldCore) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aScarMeta; // x: age01, y: reach, z: seed, w: charge
      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vMeta = aScarMeta;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform float uDaylight;
      uniform vec3 uColorObsidian;
      uniform vec3 uColorWisteriaDark;
      uniform vec3 uColorVioletInk;
      uniform vec3 uColorStormMid;
      uniform vec3 uColorGoldCore;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;

      void main() {
        float age = clamp(vMeta.x, 0.0, 1.0);
        float reach = vMeta.y;
        float seed = vMeta.z;
        float charge = vMeta.w;
        if (reach <= 0.01 || age >= 1.0) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p) / max(0.15, reach);
        float ang = atan(p.y, p.x);

        vec4 n0 = texture2D(uNoiseAtlas, vWorldPos.xz * 0.20 + vec2(seed * 0.31, seed * 0.73));
        vec4 n1 = texture2D(uNoiseAtlas, vWorldPos.xz * 0.45 + vec2(0.19, 0.61));

        float branchWave = cos(ang * 12.0 + (n0.b - 0.5) * 3.4 - r * 2.2);
        float branchMask = smoothstep(0.50, 0.94, branchWave) * smoothstep(1.04, 0.16, r);
        float coreBasin = smoothstep(0.74 + (n0.b - 0.5) * 0.22, 0.42, r);
        float outerShock = smoothstep(0.055, 0.0, abs(r - 0.86 + (n0.b - 0.5) * 0.05));

        float fadeOut = 1.0 - smoothstep(0.65, 1.0, age);
        float mask = max(max(coreBasin * 0.92, branchMask * 0.96), outerShock * 0.92) * fadeOut;

        if (mask < 0.45) discard;

        vec3 col = mix(uColorObsidian, uColorWisteriaDark, step(0.48, n0.g));

        float filament = smoothstep(0.84, 0.98, branchWave) * smoothstep(0.96, 0.10, r);
        float vorFilament = smoothstep(0.78, 0.95, n1.r) * smoothstep(0.68, 0.15, r);
        float centerFlash = smoothstep(0.24, 0.04, r + (n0.b - 0.5) * 0.06);
        float electricIntensity = clamp((max(filament, vorFilament * 0.85) + outerShock * 0.85 + centerFlash * 0.95) * min(1.0, charge), 0.0, 1.0);

        col = mix(col, uColorStormMid * 1.08, smoothstep(0.24, 0.58, electricIntensity));
        col = mix(col, uColorGoldCore * 1.22, smoothstep(0.68, 0.94, electricIntensity));

        float border = 1.0 - smoothstep(0.45, 0.52, mask);
        col = mix(col, uColorObsidian, border * (1.0 - outerShock * 0.6));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. Pooled, Deterministic StormLanceSystem (<= 3 Draw Calls)               */
/* ------------------------------------------------------------------------- */

const MAX_RIBBON_STRANDS = 24;
const MAX_FULGURITE_SPIKES = 14;
const MAX_SCAR_DECALS = 3;

const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _identityMat = new THREE.Matrix4();

export class StormLanceSystem {
  constructor({
    scene,
    getGroundHeight = () => 0,
    config = {},
    onApexImpact = null,
  } = {}) {
    this.scene = scene || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.config = { ...STORM_LANCE_DEFAULTS, ...config };
    this.onApexImpact = onApexImpact;

    this.noiseAtlas = getSharedNoiseAtlas();

    this.sharedUniforms = {
      uTime: { value: 0 },
      uBoltSnapOff: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
    };

    this.group = new THREE.Group();
    this.group.name = 'StormLanceVfxRoot';
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

    // DC 1: Multi-Role Lightning Great-Spear, Helical Coils & Chain-Lightning Arcs
    const ribbonGeo = createOpaqueRibbonGeometry(48);
    this.startPosAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RIBBON_STRANDS * 3), 3);
    this.endPosAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RIBBON_STRANDS * 3), 3);
    this.strandMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RIBBON_STRANDS * 4), 4);
    ribbonGeo.setAttribute('aStartPos', this.startPosAttr);
    ribbonGeo.setAttribute('aEndPos', this.endPosAttr);
    ribbonGeo.setAttribute('aStrandMeta', this.strandMetaAttr);

    this.ribbonMat = createLightningRibbonMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.lightningRibbonMesh = new THREE.InstancedMesh(ribbonGeo, this.ribbonMat, MAX_RIBBON_STRANDS);
    this.lightningRibbonMesh.name = 'StormLance_DC1_BraidedLightningRibbons';
    this.lightningRibbonMesh.frustumCulled = false;
    this.lightningRibbonMesh.count = 0;
    for (let i = 0; i < MAX_RIBBON_STRANDS; i++) {
      this.lightningRibbonMesh.setMatrixAt(i, _identityMat);
    }
    this.lightningRibbonMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.lightningRibbonMesh);

    // DC 2: 14 Chiseled 7-Sided Volcanic Obsidian-and-Gold Fulgurite Monoliths
    const spikeGeo = createGlacierCrystalGeometry({
      seed: 73.1,
      sides: 7,
      taper: 0.62,
      roughness: 0.14,
      bend: 0.45,
    });
    this.spikeMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_FULGURITE_SPIKES * 4),
      4
    );
    spikeGeo.setAttribute('aSpikeMeta', this.spikeMetaAttr);
    this.spikeMat = createFulguriteSpikeMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.fulguriteSpikesMesh = new THREE.InstancedMesh(spikeGeo, this.spikeMat, MAX_FULGURITE_SPIKES);
    this.fulguriteSpikesMesh.name = 'StormLance_DC2_FulguriteSpikes';
    this.fulguriteSpikesMesh.frustumCulled = false;
    this.fulguriteSpikesMesh.count = 0;
    this.group.add(this.fulguriteSpikesMesh);

    // DC 3: Vitrified Obsidian-Gold Lichtenberg Ground Scar
    const scarGeo = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    this.scarMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SCAR_DECALS * 4), 4);
    scarGeo.setAttribute('aScarMeta', this.scarMetaAttr);
    this.scarMat = createFulguriteScarMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.fulguriteScarMesh = new THREE.InstancedMesh(scarGeo, this.scarMat, MAX_SCAR_DECALS);
    this.fulguriteScarMesh.name = 'StormLance_DC3_FulguriteGroundScar';
    this.fulguriteScarMesh.frustumCulled = false;
    this.fulguriteScarMesh.count = 0;
    this.group.add(this.fulguriteScarMesh);
  }

  _seedRecords(seed = 1.0) {
    const c = this.config;
    // Fast 0.06s lightning strike as required
    this.impactTime = 0.06;
    this.totalDuration = c.lifetime + c.fadeTime;

    this.spikeRecords = [];
    for (let i = 0; i < MAX_FULGURITE_SPIKES; i++) {
      const s = seed * 29.1 + i * 17.3;
      const isChainSpike = i >= 10;
      const ang = isChainSpike
        ? ((i - 10) / 4) * TAU + 0.4
        : (i / 10) * TAU + signedHash(s + 1.1) * 0.14;
      const inFrontWindow = !isChainSpike && ang > 0.35 && ang < 2.15;
      this.spikeRecords.push({
        isChainSpike,
        chainIdx: i - 10,
        seed: hash11(s + 2.3) * 10.0,
        ang,
        radial: isChainSpike ? 0.65 : (inFrontWindow ? 1.35 : 0.95) + 1.35 * hash11(s + 3.9),
        height: (isChainSpike ? 1.75 : inFrontWindow ? 1.15 : 2.65) * (0.80 + 0.45 * hash11(s + 5.1)),
        radius: (inFrontWindow ? 0.28 : 0.38) + 0.18 * hash11(s + 6.7),
        lean: 0.34 + 0.30 * hash11(s + 8.3),
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
    const snapReach = saturate(timeSeconds / Math.max(0.02, this.impactTime));
    const impactElapsed = timeSeconds - this.impactTime;
    const fadeU = saturate((timeSeconds - c.lifetime) / Math.max(0.1, c.fadeTime));

    // Active bolt strobe window `0.06..0.34s` (24Hz seed jumps); between `0.34..0.44s` snap off cleanly via gap erosion!
    const boltSnapOff = smoothstep(0.34, 0.44, timeSeconds);
    this.sharedUniforms.uBoltSnapOff.value = boltSnapOff;
    const strobeSeedJump = Math.floor(timeSeconds * 24.0) * 1.37;

    const startX = this.origin.x + this.direction.x * c.handForward;
    const startZ = this.origin.z + this.direction.z * c.handForward;
    const startY = this.origin.y + c.handHeight;

    const impX = this.origin.x + this.direction.x * this.castLength;
    const impZ = this.origin.z + this.direction.z * this.castLength;
    const impY = this.getGroundHeight(impX, impZ);

    const chainTargets = [
      {
        x: impX + this.direction.x * 2.1 - this.side.x * 1.85,
        z: impZ + this.direction.z * 2.1 - this.side.z * 1.85,
      },
      {
        x: impX + this.direction.x * 1.6 + this.side.x * 2.35,
        z: impZ + this.direction.z * 1.6 + this.side.z * 2.35,
      },
      {
        x: impX - this.direction.x * 1.2 - this.side.x * 2.4,
        z: impZ - this.direction.z * 1.2 - this.side.z * 2.4,
      },
    ];

    // 1. Evaluate 1 Taut Central Spear Shaft + 2 Helical Coils + Chain Arcs (DC 1)
    //    Vanishes cleanly by t = 0.44s (< 0.10s snap-off)!
    let ribbonSlot = 0;
    if (boltSnapOff < 0.995) {
      // Role 0 (Slot 0): Single Taut, High-Contrast Central Lightning Spear Shaft
      const coreW = c.width * 1.65;
      this.startPosAttr.setXYZ(ribbonSlot, startX, startY, startZ);
      this.endPosAttr.setXYZ(ribbonSlot, impX, impY + c.endHeight, impZ);
      this.strandMetaAttr.setXYZW(ribbonSlot, 0.0, 0.5, coreW, snapReach);
      ribbonSlot++;

      // Role 1 (Slots 1..2): 2 Wide-Orbiting 180°-Opposite Helical Plasma Coils with 24Hz strobe seed jump
      const coilNorms = [-0.72, 0.72];
      const coilSeeds = [1.0 + strobeSeedJump, 1.5 + strobeSeedJump];
      for (let k = 0; k < 2; k++) {
        const w = c.width * 0.54;
        this.startPosAttr.setXYZ(ribbonSlot, startX, startY, startZ);
        this.endPosAttr.setXYZ(ribbonSlot, impX, impY + c.endHeight, impZ);
        this.strandMetaAttr.setXYZW(ribbonSlot, coilNorms[k], coilSeeds[k], w, snapReach);
        ribbonSlot++;
      }

      // Role 2: Chain-Lightning Arcs snapping from Skeleton_Warrior to Skeleton_Mage & Flank Fulgurite Pillars
      if (impactElapsed >= 0) {
        const chainReach = saturate(impactElapsed / 0.06);
        for (let k = 0; k < 9 && ribbonSlot < MAX_RIBBON_STRANDS; k++) {
          const ct = chainTargets[k % chainTargets.length];
          const ctY = this.getGroundHeight(ct.x, ct.z) + c.endHeight * (k < 6 ? 0.95 : 0.45);
          const isChainCore = k % 3 === 0;
          const strandNorm = isChainCore ? 0.0 : (k % 2 === 0 ? 1 : -1) * 0.55;
          const w = c.width * (isChainCore ? 0.88 : 0.42);
          const cSeed = 21.3 + k * 2.9 + (isChainCore ? 0.0 : strobeSeedJump);
          this.startPosAttr.setXYZ(ribbonSlot, impX, impY + c.endHeight, impZ);
          this.endPosAttr.setXYZ(ribbonSlot, ct.x, ctY, ct.z);
          this.strandMetaAttr.setXYZW(ribbonSlot, strandNorm, cSeed, w, chainReach);
          ribbonSlot++;
        }
      }
    }
    this.lightningRibbonMesh.count = ribbonSlot;
    this.startPosAttr.needsUpdate = true;
    this.endPosAttr.needsUpdate = true;
    this.strandMetaAttr.needsUpdate = true;

    // 2. Evaluate 14 Chiseled Obsidian-and-Gold Fulgurite Ground Monoliths (DC 2)
    //    Keep at 100% height & radius and constant ground height (ZERO shrinking or floor sinking!);
    //    drain voltage downward first, then fracture-dissolve from tip & Voronoi faults inward!
    let spikeSlot = 0;
    if (impactElapsed >= -0.02) {
      const tImp = Math.max(0.01, impactElapsed + 0.02);
      const emerge = outQuint(Math.min(1.0, tImp / 0.12));

      for (let i = 0; i < MAX_FULGURITE_SPIKES; i++) {
        const rec = this.spikeRecords[i];
        const dissolveProgress = smoothstep(0.38, 0.98, fadeU + i * 0.025);
        if (dissolveProgress >= 0.995) continue;

        const spikeCharge = 1.24 * (1.0 - smoothstep(0.0, 0.48, fadeU + i * 0.02));
        let baseX = impX;
        let baseZ = impZ;
        if (rec.isChainSpike) {
          const ct = chainTargets[rec.chainIdx % chainTargets.length];
          baseX = ct.x;
          baseZ = ct.z;
        }
        const sx = baseX + Math.cos(rec.ang) * rec.radial;
        const sz = baseZ + Math.sin(rec.ang) * rec.radial;
        const sy = this.getGroundHeight(sx, sz) - 0.14;

        _dummy.position.set(sx, sy, sz);
        _pos.set(
          Math.cos(rec.ang) * Math.sin(rec.lean),
          Math.cos(rec.lean),
          Math.sin(rec.ang) * Math.sin(rec.lean)
        ).normalize();
        _dummy.quaternion.setFromUnitVectors(UP, _pos);
        _dummy.scale.set(
          rec.radius * emerge,
          rec.height * emerge,
          rec.radius * emerge
        );
        _dummy.updateMatrix();
        this.fulguriteSpikesMesh.setMatrixAt(spikeSlot, _dummy.matrix);
        this.spikeMetaAttr.setXYZW(spikeSlot, rec.seed, spikeCharge, dissolveProgress, 0.0);
        spikeSlot++;
      }
    }
    this.fulguriteSpikesMesh.count = spikeSlot;
    this.fulguriteSpikesMesh.instanceMatrix.needsUpdate = true;
    this.spikeMetaAttr.needsUpdate = true;

    // 3. Evaluate Vitrified Obsidian-Gold Lichtenberg Ground Scar (DC 3)
    let scarSlot = 0;
    const scarFade = 1.0 - smoothstep(0.45, 1.0, fadeU);
    if (impactElapsed >= -0.02 && scarFade > 0.02) {
      const tScar = Math.max(0.01, impactElapsed + 0.02);
      const reach = smoothstep(0.0, 0.14, tScar);
      const castYaw = Math.atan2(this.direction.x, this.direction.z);

      _dummy.position.set(impX, impY + 0.042, impZ);
      _dummy.quaternion.setFromAxisAngle(UP, castYaw);
      _dummy.scale.set(c.scarRadius, 1.0, c.scarRadius);
      _dummy.updateMatrix();
      this.fulguriteScarMesh.setMatrixAt(scarSlot, _dummy.matrix);
      this.scarMetaAttr.setXYZW(scarSlot, fadeU, reach, 0.37, 1.05 * scarFade);
      scarSlot++;

      const ct0 = chainTargets[0];
      const ct0Y = this.getGroundHeight(ct0.x, ct0.z) + 0.042;
      _dummy.position.set(ct0.x, ct0Y, ct0.z);
      _dummy.quaternion.setFromAxisAngle(UP, castYaw + 0.8);
      _dummy.scale.set(c.scarRadius * 0.62, 1.0, c.scarRadius * 0.62);
      _dummy.updateMatrix();
      this.fulguriteScarMesh.setMatrixAt(scarSlot, _dummy.matrix);
      this.scarMetaAttr.setXYZW(scarSlot, fadeU, reach, 0.83, 1.0 * scarFade);
      scarSlot++;
    }
    this.fulguriteScarMesh.count = scarSlot;
    this.fulguriteScarMesh.instanceMatrix.needsUpdate = true;
    this.scarMetaAttr.needsUpdate = true;

    // Hitstop & Camera Shake
    this._hitstopScale = Math.abs(timeSeconds - this.impactTime) <= 0.035 ? 0.05 : 1.0;
    if (impactElapsed >= 0 && impactElapsed <= 0.45) {
      const env = Math.exp(-impactElapsed * 7.2) * 0.16;
      this._shakeOffset.set(
        this.side.x * Math.sin(impactElapsed * 68.0) * env,
        Math.abs(Math.cos(impactElapsed * 54.0)) * env * 0.65,
        this.side.z * Math.sin(impactElapsed * 68.0) * env
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
        activeRibbons: 0,
        activeSpikes: 0,
        activeScars: 0,
      };
    }
    let drawCalls = 0;
    if (this.lightningRibbonMesh.count > 0) drawCalls++;
    if (this.fulguriteSpikesMesh.count > 0) drawCalls++;
    if (this.fulguriteScarMesh.count > 0) drawCalls++;
    return {
      active: true,
      age: Number(this.age.toFixed(3)),
      drawCalls,
      activeRibbons: this.lightningRibbonMesh.count,
      activeSpikes: this.fulguriteSpikesMesh.count,
      activeScars: this.fulguriteScarMesh.count,
    };
  }

  clear() {
    this.active = false;
    this.age = 0;
    this._shakeOffset.set(0, 0, 0);
    this._hitstopScale = 1.0;
    this.group.visible = false;
    this.lightningRibbonMesh.count = 0;
    this.fulguriteSpikesMesh.count = 0;
    this.fulguriteScarMesh.count = 0;
  }

  dispose() {
    this.clear();
    this.lightningRibbonMesh.geometry.dispose();
    this.fulguriteSpikesMesh.geometry.dispose();
    this.fulguriteScarMesh.geometry.dispose();
    this.ribbonMat.dispose();
    this.spikeMat.dispose();
    this.scarMat.dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

export function createStormLanceSystem(options = {}) {
  return new StormLanceSystem(options);
}
