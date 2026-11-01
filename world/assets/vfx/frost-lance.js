// ============================================================================
// world/assets/vfx/frost-lance.js
//
// Stage 4 Pass 2: High-Impact Cel-Shaded "Frost Lance" VFX System
// Engineered specifically for Haru-machi's bright sunlit & twilight world.
//
// Performance & Architecture Guarantees:
// - Strictly <= 6 draw calls total when active (0 draw calls when idle):
//     1. `groundDecalMesh` (1 InstancedMesh): Seamless World-Space Glacial
//        Fracture Corridor & Apex Basin (zero overlapping bullseye rings!),
//        3D-relieved Frost Rime & Snow-Crust Drift, Muzzle Cryo-Sigil,
//        Jagged Branching Tectonic Fissure Spearhead, and Dual-Wave Crystalline
//        Apex Frost Nova Shockwave.
//     2..4. `crystalMeshes[0..2]` (3 InstancedMeshes): 3 distinct 6-faceted
//        broad-shouldered, chiseled anime glacier blade geometries with buried
//        basal roots (`y = -0.26..1.0`), 4-band normal+thickness cel refraction,
//        `fwidth` razor ridge bevels, dark cobalt ink silhouette (`#07172b`),
//        and zero horizontal tip banding artifacts.
//     5. `crystalDebrisMesh` (1 InstancedMesh): Solid cel-shaded 3D diamond
//        ice splinters, muzzle shards, breach chips, and the expanding 3D
//        crystalline apex impact burst crown.
//     6. `atmosphereMesh` (1 InstancedMesh): Camera-facing billboards for
//        billowing cold glacier vapor, crystal-hugging 4-point anime star
//        glints, staff-tip arcane cryo-starburst, and apex impact shock-flash.
// - Zero per-fragment 3D Simplex noise loops: all shaders sample the shared
//   128x128 RGBA `NoiseAtlas` DataTexture generated once at boot.
// - Zero heap allocations during `cast()`, `update(dt)`, or `seek(timeSeconds)`.
// - 100% deterministic `seek(timeSeconds)` for exact frame-accurate inspection.
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';

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

function inCubic(t) {
  const u = saturate(t);
  return u * u * u;
}

function hash11(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function signedHash(n) {
  return hash11(n) * 2.0 - 1.0;
}

/* ------------------------------------------------------------------------- */
/* Default Frost Lance Configuration                                         */
/* ------------------------------------------------------------------------- */

export const FROST_LANCE_STYLE_PRESETS = Object.freeze({
  v1: {
    name: 'v1-luminous-glacial-cerulean',
    label: 'V1: Luminous Glacial Cerulean & Frost Veins (Exact Attached Reference Match)',
    colorDeep: '#26659c', // exact luminous mid-deep glacial cerulean from attached image.png
    colorMid: '#4f8ec2',
    colorIce: '#7fd0ff', // crisp glacier sky-blue
    colorRim: '#f4feff', // chalky frost-white Fresnel & basal rime
    colorCore: '#5292c4', // permanent subsurface glacial cerulean inner light
    colorInk: '#153a5c',
    colorScarDeep: '#427ba6',
    colorScarMid: '#72b0db',
    colorScarVein: '#f2faff',
    colorMistCrest: '#f4feff',
    colorMistShadow: '#72b0db',
    depthTint: 0.96,
    frostLine: 0.56,
    veins: 0.54,
    fracture: 0.72,
    facetSharp: 0.80,
  },
  v2: {
    name: 'v2-fierce-glacier-monolith',
    label: 'V2: Fierce Glacial Cerulean (Deeper Core Bite & Razor Fracture Cracks)',
    colorDeep: '#1d548a', // slightly deeper, scarier cerulean core bite
    colorMid: '#4482b8',
    colorIce: '#78ccff', // crisp alpine glacier blue
    colorRim: '#f6feff', // razor frost-white ridges, cracks & rime
    colorCore: '#4888bd',
    colorInk: '#102f4d',
    colorScarDeep: '#3b719c',
    colorScarMid: '#6aa8d6',
    colorScarVein: '#f4fbff',
    colorMistCrest: '#f6feff',
    colorMistShadow: '#6aa8d6',
    depthTint: 1.12,
    frostLine: 0.54,
    veins: 0.52,
    fracture: 0.82,
    facetSharp: 0.88,
  },
  v3: {
    name: 'v3-subzero-cryo-cerulean',
    label: 'V3: Sub-Zero Cryo-Cerulean (Charged Cold Cyan-Blue Inner Faults)',
    colorDeep: '#1f5a91', // rich sub-zero glacial cerulean
    colorMid: '#3f8cc4',
    colorIce: '#74ceff', // luminous cryo-sky body
    colorRim: '#f7ffff', // bright frost-white rime & crack highlights
    colorCore: '#3ea4d9', // cold charged cyan-cerulean subsurface core
    colorInk: '#113354',
    colorScarDeep: '#39739e',
    colorScarMid: '#64addb',
    colorScarVein: '#f5fcff',
    colorMistCrest: '#f7ffff',
    colorMistShadow: '#64addb',
    depthTint: 1.05,
    frostLine: 0.62,
    veins: 0.58,
    fracture: 0.84,
    facetSharp: 0.85,
  },
});

export const FROST_LANCE_DEFAULTS = Object.freeze({
  // Cast & 4-Beat Choreography Timing (matching original ice.js)
  range: 14.5, // metres
  speed: 26.0, // fracture front speed, m/s
  windupTime: 0.11, // Beat 1: cast wind-up
  holdAfterImpact: 2.12, // Beat 3: standing glacier duration before withdrawal
  shatterShakeTime: 0.28, // pre-sink shudder duration
  sinkTime: 1.05, // Beat 4: sink withdrawal duration

  // Footprint Progression (matching original ice.js + wider, more intimidating far end)
  widthNear: 0.56, // half-width at caster's feet, metres
  width: 3.40, // widened half-width at far end, metres
  widthCurve: 0.74, // flares powerfully into the impact zone
  spikeCount: 168,
  clumping: 1.32,
  scatter: 0.55,
  frontBias: 0.85,

  // Silhouette (heavier, more intimidating glacial monolith wall & crown)
  heightNear: 0.56, // spike height at caster, metres
  height: 3.32, // towering glacier height at far end, metres
  heightCurve: 1.50,
  heightJitter: 0.52,
  crown: 0.50,
  peak: 1.44, // extra height swell at impact point (~4.7m towering monoliths)
  peakWidth: 0.32,
  rubble: 0.40, // 40% chunky ankle-height glacier blocks filling the bed
  rubbleScale: 0.34,

  // Individual Crystal (matching original ice.js + ProceduralGeometry.js!)
  radius: 0.47, // heavy, imposing glacial column radius
  radiusJitter: 0.85, // wide organic variety of thick & medium glacier columns
  taper: 0.69, // exact original ice.js taper (0.69 = blocky, heavy glacier columns, NEVER spiky!)
  facets: 7, // exact original ice.js 7-sided prism
  roughness: 0.09, // exact original ice.js surface roughness
  bend: 0.66, // exact original ice.js organic curve from base to tip
  bladeAspect: 1.0, // circular cross-section like original (never flat glass knives!)
  lean: 0.44, // aggressive forward/outward glacial upheaval lean
  leanJitter: 1.18,
  twist: 1.0,

  // Eruption Dynamics (matching original ice.js)
  riseTime: 0.17,
  riseOvershoot: 0.26,
  riseStagger: 0.07,
  settle: 0.55,
  birthFade: 0.45,

  // Default V1 Luminous Glacial Cerulean Palette
  stylePreset: 'v1',
  ...FROST_LANCE_STYLE_PRESETS.v1,
  shockRadius: 6.8,
});

/* ------------------------------------------------------------------------- */
/* 1. Procedural 7-Sided Blocky Glacier Crystal Geometry                     */
/*    Direct port of Spellbook's `createCrystalGeometry` (`taper = 0.69`,    */
/*    `sides = 7`, `roughness = 0.09`, `bend = 0.66`) + buried root `-0.45`. */
/* ------------------------------------------------------------------------- */

const RING_HEIGHTS = [-0.45, 0.0, 0.22, 0.50, 0.75, 0.92];

function profileRadius(t, taper) {
  if (t < 0) {
    return 0.85 + 0.15 * (1.0 + t / 0.45);
  }
  return taper + (1 - taper) * Math.pow(1 - t, 1.15);
}

export function createGlacierCrystalGeometry({
  seed = 1,
  sides = 7,
  taper = 0.69,
  roughness = 0.09,
  bend = 0.66,
} = {}) {
  const facets = Math.max(3, Math.round(sides));
  const tipRadius = Math.min(0.9, Math.max(0.01, taper));

  const bendAngle = hash11(seed * 1.77) * TAU;
  const bendX = Math.cos(bendAngle);
  const bendZ = Math.sin(bendAngle);

  const axisOffset = (t) => (t <= 0 ? 0 : bend * 0.5 * Math.pow(t, 1.6));

  const angles = [];
  for (let i = 0; i < facets; i++) {
    const jitter = (hash11(seed * 3.13 + i * 7.7) - 0.5) * (TAU / facets) * 0.55 * roughness * 3.0;
    angles.push((i / facets) * TAU + jitter);
  }

  const rings = RING_HEIGHTS.map((t, ringIndex) => {
    const baseR = profileRadius(t, tipRadius) * 0.5;
    const drift = axisOffset(t);
    // Height wobble keeps the shoulder lines from stacking into clean bands (exact original!)
    const y =
      t +
      (hash11(seed * 5.9 + ringIndex * 2.3) - 0.5) * 0.06 * roughness * (t > 0 ? 1 : 0);

    return angles.map((angle, i) => {
      const tPos = Math.max(0, t);
      const wobble =
        1 +
        (hash11(seed * 11.1 + ringIndex * 13.7 + i * 3.9) - 0.5) *
          roughness *
          1.3 *
          (0.35 + 0.65 * tPos);
      const r = Math.max(0.002, baseR * wobble);
      return [Math.cos(angle) * r + bendX * drift, y, Math.sin(angle) * r + bendZ * drift];
    });
  });

  // The apex is offset a little off-axis so the tip reads as chipped rather than a cone vertex
  const apexDrift = axisOffset(1.0);
  const apex = [
    bendX * apexDrift + (hash11(seed * 17.3) - 0.5) * 0.09 * roughness,
    1.0,
    bendZ * apexDrift + (hash11(seed * 19.7) - 0.5) * 0.09 * roughness,
  ];
  const floorCentre = [0, RING_HEIGHTS[0], 0];

  const positions = [];
  const facetUvs = [];

  const pushTri = (pA, pB, pC, uvA, uvB, uvC) => {
    positions.push(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], pC[0], pC[1], pC[2]);
    facetUvs.push(uvA[0], uvA[1], uvA[2], uvB[0], uvB[1], uvB[2], uvC[0], uvC[1], uvC[2]);
  };

  for (let ring = 0; ring < rings.length - 1; ring++) {
    const lower = rings[ring];
    const upper = rings[ring + 1];
    const v0 = clamp(RING_HEIGHTS[ring], 0.0, 1.0);
    const v1 = clamp(RING_HEIGHTS[ring + 1], 0.0, 1.0);

    for (let i = 0; i < facets; i++) {
      const j = (i + 1) % facets;
      pushTri(lower[i], upper[i], lower[j], [0.0, v0, 0.0], [0.0, v1, 0.0], [1.0, v0, 0.0]);
      pushTri(lower[j], upper[i], upper[j], [1.0, v0, 0.0], [0.0, v1, 0.0], [1.0, v1, 0.0]);
    }
  }

  const top = rings[rings.length - 1];
  const base = rings[0];
  const vTop = RING_HEIGHTS[rings.length - 1];
  for (let i = 0; i < facets; i++) {
    const j = (i + 1) % facets;
    pushTri(top[i], apex, top[j], [0.0, vTop, 0.0], [0.5, 1.0, 0.0], [1.0, vTop, 0.0]);
    pushTri(floorCentre, base[i], base[j], [0.5, 0.0, 0.0], [0.0, 0.0, 0.0], [1.0, 0.0, 0.0]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFacetUv', new THREE.Float32BufferAttribute(facetUvs, 3));
  // Non-indexed + per-triangle vertex normals: gives every hewn plane its true 3D normal!
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Chunky glacier ice chip geometry for breach shards & impact burst
 */
function createDebrisCrystalGeometry() {
  const geo = createGlacierCrystalGeometry({
    seed: 5 * 2.7 + 41,
    sides: 5,
    taper: 0.45,
    roughness: 0.45,
    bend: 0.25,
  });
  geo.translate(0, -0.35, 0);
  geo.scale(1.15, 0.65, 1.05);
  geo.computeBoundingSphere();
  return geo;
}

/* ------------------------------------------------------------------------- */
/* 2. Custom Shaders (Authentic Spellbook IceMaterial & 3D Frost Relief)     */
/* ------------------------------------------------------------------------- */

function createGroundDecalMaterial(noiseAtlas, sharedUniforms, corridorUniforms) {
  return new THREE.ShaderMaterial({
    name: 'FrostLanceGroundDecalMaterial',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uGlowBoost: sharedUniforms.uGlowBoost,
      uCastOrigin: corridorUniforms.uCastOrigin,
      uCastDir: corridorUniforms.uCastDir,
      uCastSide: corridorUniforms.uCastSide,
      uCastLength: corridorUniforms.uCastLength,
      uTravelFront: corridorUniforms.uTravelFront,
      uWidthNear: { value: FROST_LANCE_DEFAULTS.widthNear },
      uWidthFar: { value: FROST_LANCE_DEFAULTS.width },
      uWidthCurve: { value: FROST_LANCE_DEFAULTS.widthCurve },
      uColorScarDeep: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorScarDeep) },
      uColorScarMid: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorScarMid) },
      uColorScarVein: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorScarVein) },
      uColorIce: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorIce) },
      uColorRim: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorRim) },
      uColorInk: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aDecalMeta; // x: age (0..1), y: kind (0..3), z: seed, w: intensity
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
      uniform float uGlowBoost;
      uniform vec3 uCastOrigin;
      uniform vec3 uCastDir;
      uniform vec3 uCastSide;
      uniform float uCastLength;
      uniform float uTravelFront;
      uniform float uWidthNear;
      uniform float uWidthFar;
      uniform float uWidthCurve;
      uniform vec3 uColorScarDeep;
      uniform vec3 uColorScarMid;
      uniform vec3 uColorScarVein;
      uniform vec3 uColorIce;
      uniform vec3 uColorRim;
      uniform vec3 uColorInk;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;

      // Exact port of Spellbook GroundDecals.js snowDepth(q) using NoiseAtlas:
      // 3 scales: banked FBM drifts + shouldered Voronoi slabs + fine grain
      float snowDepthAt(vec2 q) {
        vec4 nDrift = texture2D(uNoiseAtlas, q * 0.085);
        vec4 nSlabs = texture2D(uNoiseAtlas, q * 0.24 + vec2(0.37, 0.61));
        vec4 nGrain = texture2D(uNoiseAtlas, q * 0.72 + vec2(0.19, 0.83));
        float drift = nDrift.b;
        float slabs = smoothstep(0.15, 0.75, nSlabs.g) * 0.30 + nSlabs.r * 0.14;
        float grain = nGrain.a * 0.15;
        return drift * 0.60 + slabs + grain;
      }

      void main() {
        float age = clamp(vMeta.x, 0.0, 1.0);
        float kind = vMeta.y;
        float seed = vMeta.z;
        float intensity = vMeta.w;
        if (intensity <= 0.001 || age >= 1.0) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (kind > 0.5 && r > 1.0) discard;

        vec2 wPos = vWorldPos.xz;
        vec4 nWorld = texture2D(uNoiseAtlas, wPos * 0.09);
        vec4 nDetail = texture2D(uNoiseAtlas, wPos * 0.22 + vec2(0.31, 0.57));
        vec4 nLocal = texture2D(uNoiseAtlas, vUv * 1.15 + vec2(seed * 0.53, seed * 0.29));

        vec3 col = vec3(0.0);
        float alpha = 0.0;

        if (kind < 0.5) {
          // =================================================================
          // KIND 0: SPELLBOOK 3D HEIGHT-FIELD FROST & RIME SHEET (DECAL == 6)
          // Differentiated height field (snowDepthAt) lit by key light so it
          // banks and catches light like real packed rime, breaking into natural
          // grains at the rim with ZERO printed cartoon outline!
          // =================================================================
          vec2 rel = wPos - uCastOrigin.xz;
          float alongM = dot(rel, uCastDir.xz);
          float latM = dot(rel, uCastSide.xz);

          float frontM = uTravelFront * uCastLength;
          float frontWarp = (nWorld.b - 0.5) * 0.75;
          if (alongM > frontM + 1.15 + frontWarp || alongM < -1.15) discard;

          float s = clamp(alongM / max(1.0, uCastLength), 0.0, 1.0);
          float corridorHalfW = mix(uWidthNear, uWidthFar, pow(s, uWidthCurve)) * 1.32;

          vec2 apexCenter = uCastOrigin.xz + uCastDir.xz * uCastLength;
          float apexDist = length(wPos - apexCenter);
          float apexRadius = uWidthFar * 1.55 * smoothstep(0.45, 0.70, uTravelFront);

          float dCorridor = abs(latM) / max(0.45, corridorHalfW);
          float backCap = max(0.0, (-alongM - 0.35) / 1.10);
          float frontCap = max(0.0, (alongM - frontM) / 1.20);
          float dLine = sqrt(dCorridor * dCorridor + backCap * backCap + frontCap * frontCap);
          float dBasin = apexRadius > 0.1 ? (apexDist / apexRadius) : 99.0;
          float d = min(dLine, dBasin);

          // Ragged FBM lobe reach (never a smooth disc or hard-edged sticker!)
          vec2 warp = (vec2(nWorld.b, nDetail.b) - 0.5) * 0.45;
          float lobes = (texture2D(uNoiseAtlas, wPos * 0.11 + warp * 0.25).b - 0.5) * 2.0;
          float reach = d * (1.0 - lobes * 0.34);
          float cover = smoothstep(1.0, 0.56, reach);
          if (cover < 0.004) discard;

          // 3D height-field forward differences (e = 0.16m) for real surface relief
          float e = 0.16;
          float h  = snowDepthAt(wPos);
          float hx = snowDepthAt(wPos + vec2(e, 0.0));
          float hy = snowDepthAt(wPos + vec2(0.0, e));
          vec3 nrm = normalize(vec3((h - hx) / e * 0.34, 1.0, (h - hy) / e * 0.34));

          vec3 lightDir = normalize(vec3(uSunDir.x, max(0.35, uSunDir.y), uSunDir.z));
          float lambert = clamp(dot(nrm, lightDir), 0.0, 1.0);
          // Snow/rime scatters deep: shadow goes cool glacial blue (uColorScarDeep), lit faces go uColorScarVein
          float shade = 0.36 + 0.64 * pow(lambert, 0.80);

          // Thick in the middle, breaking into scattered grains at the rim (no printed outline!)
          float lie = smoothstep(0.12, 0.54, cover * (0.34 + 0.78 * h));

          float fadeOut = 1.0 - smoothstep(0.72, 1.0, age);
          alpha = lie * fadeOut * 0.94 * intensity;
          col = mix(uColorScarDeep, uColorScarVein, shade) * mix(0.82, 1.0, uDaylight);

          // Stepped crystal crust glints on the rime surface
          float glintNoise = texture2D(uNoiseAtlas, wPos * 0.65 + vec2(floor(uTime * 7.0) * 0.17, 0.31)).a;
          float glint = smoothstep(0.88, 0.99, glintNoise);
          col += uColorRim * glint * pow(lambert, 2.0) * 0.45 * (1.0 - smoothstep(0.0, 0.7, age));

        } else if (kind < 1.5) {
          // =================================================================
          // KIND 1: MUZZLE FROST SHOCK RING
          // =================================================================
          float uExp = 1.0 - clamp(age / 0.16, 0.0, 1.0);
          float expand = 1.0 - uExp * uExp * uExp;
          float fadeOut = 1.0 - smoothstep(0.30, 1.0, age);
          float qR = r / max(0.10, expand);
          if (qR > 1.0) discard;

          float ring = smoothstep(0.08, 0.0, abs(qR - 0.82));
          col = mix(uColorIce, uColorRim, ring);
          alpha = ring * 0.75 * fadeOut * intensity;

        } else if (kind < 2.5) {
          // =================================================================
          // KIND 2: TRAVELLING FRONT FROST CRACK
          // =================================================================
          float fadeOut = 1.0 - smoothstep(0.55, 1.0, age);
          float zigZag = (nWorld.r - 0.5) * 0.42;
          float taperTip = smoothstep(0.95, -0.65, p.y);
          float warpedX = p.x * 1.45 - zigZag * (0.45 + 0.55 * abs(p.y));
          float mainFault = smoothstep(0.075 * taperTip + 0.012, 0.0, abs(warpedX)) *
                            smoothstep(0.95, 0.62, abs(p.y));
          col = mix(uColorIce, uColorRim, mainFault);
          alpha = mainFault * 0.80 * fadeOut * intensity;

        } else {
          // =================================================================
          // KIND 3: IMPACT SHOCKWAVE RING (Exact GroundDecals.js DECAL == 3)
          // =================================================================
          float radius = mix(0.08, 0.96, pow(age, 0.55));
          float ring = smoothstep(0.055, 0.0, abs(r - radius));
          alpha = ring * (1.0 - age) * 0.85 * intensity;
          col = mix(uColorIce, uColorRim, ring) * (1.05 + 0.35 * uGlowBoost);
        }

        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/**
 * Draw Calls 2..4 & 5 Shader: Authentic Spellbook IceMaterial.js Shader
 */
function createCelGlacierMaterial(noiseAtlas, sharedUniforms, corridorUniforms, { isDebris = false } = {}) {
  return new THREE.ShaderMaterial({
    name: isDebris ? 'FrostLanceDebrisCrystalMaterial' : 'FrostLanceBladeCrystalMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uGlowBoost: sharedUniforms.uGlowBoost,
      uCastOrigin: corridorUniforms.uCastOrigin,
      uColorCore: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorCore) },
      uColorDeep: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorDeep) },
      uColorMid: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorMid) },
      uColorIce: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorIce) },
      uColorRim: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorRim) },
      uColorInk: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorInk) },
      uColorScarVein: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorScarVein) },
      uDensity: { value: FROST_LANCE_DEFAULTS.depthTint ?? 1.20 },
      uFresnel: { value: 2.3 },
      uFresnelPower: { value: 2.4 },
      uTranslucency: { value: 1.5 },
      uFacetSharp: { value: FROST_LANCE_DEFAULTS.facetSharp ?? 0.72 },
      uFracture: { value: FROST_LANCE_DEFAULTS.fracture ?? 0.62 },
      uVeins: { value: FROST_LANCE_DEFAULTS.veins ?? 0.52 },
      uFrostLine: { value: FROST_LANCE_DEFAULTS.frostLine ?? 0.56 },
      uIsDebris: { value: isDebris ? 1.0 : 0.0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aBirth;
      attribute vec3 aFacetUv;

      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vSeed;
      varying float vBirth;

      void main() {
        vLocalPos = position;
        vSeed = aSeed;
        vBirth = aBirth;

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
      uniform float uGlowBoost;
      uniform vec3 uCastOrigin;
      uniform vec3 uColorCore;
      uniform vec3 uColorDeep;
      uniform vec3 uColorMid;
      uniform vec3 uColorIce;
      uniform vec3 uColorRim;
      uniform vec3 uColorInk;
      uniform vec3 uColorScarVein;
      uniform float uDensity;
      uniform float uFresnel;
      uniform float uFresnelPower;
      uniform float uTranslucency;
      uniform float uFacetSharp;
      uniform float uFracture;
      uniform float uVeins;
      uniform float uFrostLine;
      uniform float uIsDebris;

      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vSeed;
      varying float vBirth;

      void main() {
        float birthFlash = max(0.0, vBirth);
        float dissolveProgress = clamp(-vBirth, 0.0, 1.0);

        // 1. Outward-pointing per-triangle normal; use horizontal prism azimuth (horizN, horizV)
        //    for thickness & Fresnel so leaned spikes and close/low camera angles keep the
        //    EXACT same deep core-to-rim color balance as far shots!
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 horizN = normalize(vec3(N.x, 0.0, N.z) + vec3(1e-5, 0.0, 0.0));
        vec3 horizV = normalize(vec3(V.x, 0.0, V.z) + vec3(1e-5, 0.0, 0.0));
        float ndv = clamp(dot(horizN, horizV), 0.0, 1.0);

        // 2. Thickness Tint & Fresnel (Exact IceMaterial.js lines 153-155):
        //    Facing a facet head-on looks deep into the solid glacier block (darkening to uColorDeep);
        //    grazing angles clip the pale edge (uColorIce -> uColorRim).
        float thickness = clamp(pow(ndv, 0.85) * uDensity, 0.0, 1.0);
        float fres = pow(1.0 - ndv, uFresnelPower) * uFresnel;

        // 3. World-Space Internal Fracture Planes (cracks) & Local-Space Milky Feather-Frost (veins)
        vec3 fp = vWorldPos * 0.42 + vSeed * 0.73;
        float r0 = texture2D(uNoiseAtlas, fp.xz + vec2(fp.y * 0.57, 0.19)).r;
        float r1 = texture2D(uNoiseAtlas, fp.xy * 1.65 + vec2(0.41, fp.z * 0.63)).r;
        float cracks = smoothstep(0.55, 0.96, 0.58 * r0 + 0.42 * r1);

        vec3 vp = vLocalPos * 0.95 + vSeed * 0.31;
        float v0 = texture2D(uNoiseAtlas, vp.xy + vec2(vp.z * 0.47, 0.23)).b;
        float v1 = texture2D(uNoiseAtlas, vp.yz * 1.90 + vec2(0.67, vp.x * 0.53)).b;
        float veins = smoothstep(0.44, 0.90, 0.55 * v0 + 0.45 * v1);

        // 4. Voronoi Fracture Sublimation (keeps 100% physical spire scale & height during fade-out!)
        float hLocal = clamp(vLocalPos.y + uIsDebris * 0.35, 0.0, 1.0);
        float sublimateNoise = (0.58 * r0 + 0.42 * v0) * 0.72 + (1.0 - hLocal) * 0.28;
        if (sublimateNoise < dissolveProgress) discard;

        vec3 body = mix(uColorIce, uColorDeep, thickness);
        body = mix(body, uColorRim, veins * uVeins * 0.52);
        body = mix(body, uColorRim, cracks * uFracture * 0.38);

        // 5. Rime gathers where the crystal left the floor (Exact IceMaterial.js lines 166-168)
        float rimeFbm = texture2D(uNoiseAtlas, vLocalPos.xy * 1.35 + vec2(vSeed * 0.29, vLocalPos.z * 1.35)).b;
        float rime = smoothstep(0.52, 0.0, hLocal) * (0.5 + 0.5 * rimeFbm) * (1.0 - uIsDebris * 0.70);
        body = mix(body, uColorRim, clamp(rime, 0.0, 1.0) * uFrostLine);

        // 6. Lift facets that point at the camera so the silhouette reads as a bundle of hewn planes
        body *= mix(1.0, 0.62 + 0.82 * ndv, uFacetSharp);

        // 7. Even Sky-Probe + Key Sun Lighting (prevents downward-tilted ring planes from turning grey!)
        vec3 L = normalize(vec3(uSunDir.x, max(0.45, uSunDir.y), uSunDir.z));
        vec3 H = normalize(L + V);
        float ndl = max(dot(N, L), 0.0);
        float skyProbe = 0.74 + 0.28 * ndl;
        vec3 diffuseLit = body * skyProbe * mix(0.80, 0.98, uDaylight);

        // Subtle crisp planar specular reflection from the sun
        float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.20 * mix(0.5, 1.0, uDaylight);

        // 8. Pinpoint Surface Glints & Reinhard-Rolled Subsurface/Rim Glow
        float spNoise = texture2D(
          uNoiseAtlas,
          vWorldPos.xz * 0.75 + vec2(vWorldPos.y * 0.65, uTime * 0.06 + vSeed * 0.43)
        ).a;
        float sp = pow(clamp(spNoise, 0.0, 1.0), 11.0) * smoothstep(0.0, 0.7, fres + 0.3);

        float rimAmount = pow(1.0 - ndv, uFresnelPower);
        vec3 glow = uColorRim * rimAmount * 0.85;
        glow += uColorCore * (cracks * uFracture * 0.80 + veins * uVeins * 0.35) * uTranslucency;
        glow += uColorCore * 0.88;
        glow += uColorRim * sp * 1.35;
        glow += uColorRim * birthFlash * (cracks * 0.65 + rime * 0.45) * 0.45;
        glow *= (0.34 + 0.55 * uGlowBoost);
        glow /= (1.0 + glow * 0.35);

        vec3 finalColor = diffuseLit + uColorRim * spec + glow;
        float sublimateEdge = step(0.001, dissolveProgress) * (1.0 - smoothstep(dissolveProgress, dissolveProgress + 0.075, sublimateNoise));
        finalColor = mix(finalColor, uColorRim * 1.28, sublimateEdge);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

function createAtmosphereBillboardMaterial(noiseAtlas, sharedUniforms) {
  return new THREE.ShaderMaterial({
    name: 'FrostLanceAtmosphereBillboardMaterial',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uDaylight: sharedUniforms.uDaylight,
      uGlowBoost: sharedUniforms.uGlowBoost,
      uColorMistCrest: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorMistCrest) },
      uColorMistShadow: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorMistShadow) },
      uColorIce: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorIce) },
      uColorRim: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorRim) },
      uColorInk: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aParticlePosSize; // xyz: world center, w: size
      attribute vec4 aParticleMeta;    // x: age (0..1), y: pType (0..2), z: seed, w: alphaScale

      varying vec2 vUv;
      varying vec4 vMeta;

      void main() {
        vUv = uv;
        vMeta = aParticleMeta;

        float size = aParticlePosSize.w;
        if (size <= 0.001 || aParticleMeta.w <= 0.001) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return;
        }

        vec3 center = aParticlePosSize.xyz;
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

        float angle = aParticleMeta.z * 6.2831853 + aParticleMeta.x * (aParticleMeta.y < 0.5 ? 0.35 : 1.6);
        float ca = cos(angle);
        float sa = sin(angle);
        vec2 rotPos = vec2(
          position.x * ca - position.y * sa,
          position.x * sa + position.y * ca
        ) * size;

        vec3 worldPos = center + camRight * rotPos.x + camUp * rotPos.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform float uDaylight;
      uniform float uGlowBoost;
      uniform vec3 uColorMistCrest;
      uniform vec3 uColorMistShadow;
      uniform vec3 uColorIce;
      uniform vec3 uColorRim;
      uniform vec3 uColorInk;

      varying vec2 vUv;
      varying vec4 vMeta;

      void main() {
        float age = clamp(vMeta.x, 0.0, 1.0);
        float pType = vMeta.y;
        float seed = vMeta.z;
        float alphaScale = vMeta.w;
        if (alphaScale <= 0.001 || age >= 1.0) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;

        vec3 col = vec3(0.0);
        float alpha = 0.0;

        if (pType < 0.5) {
          // =================================================================
          // PTYPE 0: ROLLING GROUND GLACIER FOG (Non-additive occluding mist)
          // =================================================================
          vec2 nUv = vUv * 0.38 + vec2(seed * 0.43 + age * 0.11, seed * 0.71);
          float b = texture2D(uNoiseAtlas, nUv).b;

          float radialSoft = exp(-r * r * 2.8) * (1.0 - r * r);
          float cloudShape = radialSoft * (0.50 + 0.50 * b);
          float fadeIn = smoothstep(0.0, 0.14, age);
          float fadeOut = 1.0 - smoothstep(0.55, 1.0, age);

          float topLit = smoothstep(-0.40, 0.45, p.y + (b - 0.5) * 0.25);
          col = mix(uColorMistShadow, uColorMistCrest, topLit) * (0.98 + 0.25 * uGlowBoost);
          alpha = cloudShape * fadeIn * fadeOut * alphaScale * 1.35;

        } else if (pType < 1.5) {
          // =================================================================
          // PTYPE 1: SOFT PINPOINT ICE GLITTER PLUME (Exact Spellbook ParticleShape.SOFT)
          // Small, glowing ice motes drifting upward — zero big 2D star stickers!
          // =================================================================
          float fadeIn = smoothstep(0.0, 0.06, age);
          float fadeOut = 1.0 - smoothstep(0.62, 1.0, age);
          float twinkle = 0.65 + 0.35 * sin(uTime * 16.0 + seed * 43.0);

          float core = exp(-r * r * 14.0);
          float halo = exp(-r * r * 3.8) * (1.0 - r * r) * 0.45;
          float mote = clamp((core + halo) * twinkle, 0.0, 1.0);

          col = mix(uColorIce, uColorRim, smoothstep(0.15, 0.65, core)) * (1.35 + 0.65 * uGlowBoost);
          alpha = mote * fadeIn * fadeOut * alphaScale;

        } else {
          // =================================================================
          // PTYPE 2: IMPACT FREEZING VAPOUR SHELL / BURST
          // =================================================================
          float fadeOut = 1.0 - smoothstep(0.18, 1.0, age);
          vec2 nUv = vUv * 0.55 + vec2(seed * 0.37, age * 0.22);
          float b = texture2D(uNoiseAtlas, nUv).b;
          float shell = exp(-r * r * 3.2) * (1.0 - r * r) * (0.55 + 0.45 * b);
          col = mix(uColorIce, uColorRim, 0.72) * (1.30 + 0.55 * uGlowBoost);
          alpha = shell * fadeOut * alphaScale * 0.75;
        }

        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. Pooled, Deterministic FrostLanceSystem (<= 6 Draw Calls Total)         */
/* ------------------------------------------------------------------------- */

const CRYSTAL_VARIANTS = 3;
const MAX_SPIKES = 168;
const SLOTS_PER_VARIANT = Math.ceil(MAX_SPIKES / CRYSTAL_VARIANTS); // 56
const MAX_GROUND_DECALS = 16;
const MAX_DEBRIS_CRYSTALS = 196;
const MAX_ATMOSPHERE_PARTICLES = 210;

const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _lean = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _spinQuat = new THREE.Quaternion();
const _tiltQuat = new THREE.Quaternion();

export class FrostLanceSystem {
  constructor({
    scene,
    getGroundHeight = () => 0,
    config = {},
    onApexImpact = null,
  } = {}) {
    this.scene = scene || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.config = { ...FROST_LANCE_DEFAULTS, ...config };
    this.onApexImpact = onApexImpact;

    this.noiseAtlas = getSharedNoiseAtlas();

    this.sharedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
      uGlowBoost: { value: 0.25 },
    };

    this.corridorUniforms = {
      uCastOrigin: { value: new THREE.Vector3(0, 0, 0) },
      uCastDir: { value: new THREE.Vector3(1, 0, 0) },
      uCastSide: { value: new THREE.Vector3(0, 0, 1) },
      uCastLength: { value: this.config.range },
      uTravelFront: { value: 0.0 },
    };

    this.group = new THREE.Group();
    this.group.name = 'FrostLanceVfxRoot';
    this.group.visible = false;
    if (this.scene) {
      this.scene.add(this.group);
    }

    this.origin = new THREE.Vector3(0, 0, 0);
    this.direction = new THREE.Vector3(0, 0, 1);
    this.side = new THREE.Vector3(1, 0, 0);
    this.castLength = this.config.range;
    this.active = false;
    this.age = 0;
    this._apexTriggered = false;

    this.enemyTargets = [];
    this._staggeredEnemies = new Set();

    this._shakeOffset = new THREE.Vector3();
    this._hitstopScale = 1.0;

    this._buildDrawCallMeshes();
    this._buildDeterministicRecordPools();
  }

  _buildDrawCallMeshes() {
    const c = this.config;

    // DRAW CALL 1: Seamless World-Space Ground Scar Corridor + Muzzle Sigil + Fissure + Nova Shockwave
    const decalGeo = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    this.decalMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_GROUND_DECALS * 4),
      4
    );
    decalGeo.setAttribute('aDecalMeta', this.decalMetaAttr);

    this.groundDecalMat = createGroundDecalMaterial(
      this.noiseAtlas,
      this.sharedUniforms,
      this.corridorUniforms
    );
    this.groundDecalMesh = new THREE.InstancedMesh(
      decalGeo,
      this.groundDecalMat,
      MAX_GROUND_DECALS
    );
    this.groundDecalMesh.name = 'FrostLance_DC1_GroundScarAndRings';
    this.groundDecalMesh.frustumCulled = false;
    this.groundDecalMesh.renderOrder = 1;
    this.groundDecalMesh.count = 0;
    this.group.add(this.groundDecalMesh);

    // DRAW CALLS 2, 3, 4: 3 Sculpted 6-Faceted Chiseled Anime Glacier Blade Variants
    this.crystalMat = createCelGlacierMaterial(
      this.noiseAtlas,
      this.sharedUniforms,
      this.corridorUniforms,
      { isDebris: false }
    );
    this.crystalMeshes = [];
    this.crystalSeedAttrs = [];
    this.crystalBirthAttrs = [];

    for (let v = 0; v < CRYSTAL_VARIANTS; v++) {
      const bladeGeo = createGlacierCrystalGeometry({
        seed: 7.3 + v * 21.7,
        sides: c.facets,
        taper: c.taper,
        roughness: c.roughness,
        bend: c.bend,
        bladeAspect: c.bladeAspect,
      });

      const seeds = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS_PER_VARIANT), 1);
      const births = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS_PER_VARIANT), 1);
      for (let i = 0; i < SLOTS_PER_VARIANT; i++) {
        seeds.array[i] = hash11(v * 101.3 + i * 17.9) * 10.0;
      }
      bladeGeo.setAttribute('aSeed', seeds);
      bladeGeo.setAttribute('aBirth', births);

      const mesh = new THREE.InstancedMesh(bladeGeo, this.crystalMat, SLOTS_PER_VARIANT);
      mesh.name = `FrostLance_DC${v + 2}_CrystalBlades_V${v}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      mesh.count = 0;
      this.group.add(mesh);

      this.crystalMeshes.push(mesh);
      this.crystalSeedAttrs.push(seeds);
      this.crystalBirthAttrs.push(births);
    }

    // DRAW CALL 5: 3D Diamond Ice Splinters & Apex Crystalline Hemisphere Burst
    const debrisGeo = createDebrisCrystalGeometry();
    this.debrisSeedAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_DEBRIS_CRYSTALS),
      1
    );
    this.debrisBirthAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_DEBRIS_CRYSTALS),
      1
    );
    for (let i = 0; i < MAX_DEBRIS_CRYSTALS; i++) {
      this.debrisSeedAttr.array[i] = hash11(i * 29.3 + 5.1) * 10.0;
    }
    debrisGeo.setAttribute('aSeed', this.debrisSeedAttr);
    debrisGeo.setAttribute('aBirth', this.debrisBirthAttr);

    this.debrisMat = createCelGlacierMaterial(
      this.noiseAtlas,
      this.sharedUniforms,
      this.corridorUniforms,
      { isDebris: true }
    );
    this.crystalDebrisMesh = new THREE.InstancedMesh(
      debrisGeo,
      this.debrisMat,
      MAX_DEBRIS_CRYSTALS
    );
    this.crystalDebrisMesh.name = 'FrostLance_DC5_DebrisAndHemisphereBurst';
    this.crystalDebrisMesh.frustumCulled = false;
    this.crystalDebrisMesh.renderOrder = 3;
    this.crystalDebrisMesh.count = 0;
    this.group.add(this.crystalDebrisMesh);

    // DRAW CALL 6: Unified Camera-Facing Billboard Mist, 4-Point Stars & Arcane/Impact Starbursts
    const billboardGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.particlePosSizeAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_ATMOSPHERE_PARTICLES * 4),
      4
    );
    this.particleMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_ATMOSPHERE_PARTICLES * 4),
      4
    );
    billboardGeo.setAttribute('aParticlePosSize', this.particlePosSizeAttr);
    billboardGeo.setAttribute('aParticleMeta', this.particleMetaAttr);

    this.atmosphereMat = createAtmosphereBillboardMaterial(this.noiseAtlas, this.sharedUniforms);
    this.atmosphereMesh = new THREE.InstancedMesh(
      billboardGeo,
      this.atmosphereMat,
      MAX_ATMOSPHERE_PARTICLES
    );
    this.atmosphereMesh.name = 'FrostLance_DC6_MistAndDiamondStars';
    this.atmosphereMesh.frustumCulled = false;
    this.atmosphereMesh.renderOrder = 4;
    this.atmosphereMesh.count = 0;

    _dummy.position.set(0, 0, 0);
    _dummy.quaternion.identity();
    _dummy.scale.setScalar(1);
    _dummy.updateMatrix();
    for (let i = 0; i < MAX_ATMOSPHERE_PARTICLES; i++) {
      this.atmosphereMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.atmosphereMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.atmosphereMesh);
  }

  _buildDeterministicRecordPools() {
    this.spikeRecords = [];
    for (let i = 0; i < MAX_SPIKES; i++) {
      this.spikeRecords.push({
        index: i,
        along: 0,
        lateral: 0,
        scatter: 0,
        tier: 'flankWall',
        heroBoost: 1.0,
        angle: 0,
        radial: 0,
        rubble: false,
        heightJitter: 0,
        radiusJitter: 0,
        leanJitter: 0,
        yaw: 0,
        stagger: 0,
        eruptTime: 0,
      });
    }

    // 6 non-overlapping butt-joined ground corridor segments (`kind = 0`)
    // evaluated seamlessly in world space -> zero alpha stacking or bullseye rings!
    this.scarPatchRecords = [];
    const SCAR_SEGMENT_COUNT = 6;
    for (let i = 0; i < SCAR_SEGMENT_COUNT; i++) {
      this.scarPatchRecords.push({
        alongStart: i / SCAR_SEGMENT_COUNT,
        alongEnd: (i + 1) / SCAR_SEGMENT_COUNT,
        alongCenter: (i + 0.5) / SCAR_SEGMENT_COUNT,
        seed: hash11(i * 41.7 + 3.3),
        spawnTime: 0,
      });
    }

    this.debrisRecords = [];
    for (let i = 0; i < MAX_DEBRIS_CRYSTALS; i++) {
      this.debrisRecords.push({
        mode: 'chip',
        spawnTime: 0,
        life: 1.0,
        along: 0,
        lateral: 0,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: -20.0,
        drag: 0.65,
        scaleX: 0.1,
        scaleY: 0.2,
        scaleZ: 0.1,
        endScaleMult: 0.2,
        yaw: 0,
        pitch: 0,
        roll: 0,
        spinX: 0,
        spinY: 0,
        spinZ: 0,
      });
    }

    this.atmosphereRecords = [];
    for (let i = 0; i < MAX_ATMOSPHERE_PARTICLES; i++) {
      this.atmosphereRecords.push({
        pType: 0,
        spawnTime: 0,
        life: 1.5,
        along: 0,
        lateral: 0,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        drag: 1.2,
        startSize: 0.5,
        endSize: 1.5,
        alphaScale: 0.7,
        seed: hash11(i * 59.1 + 11.7),
      });
    }

    this._seedDeterministicChoreography(1.0);
  }

  _seedDeterministicChoreography(castSeed = 1.0) {
    const c = this.config;
    const travelDuration = c.range / Math.max(1.0, c.speed); // ~0.5577s
    this.impactTime = c.windupTime + travelDuration; // ~0.668s
    this.withdrawStartTime = this.impactTime + c.holdAfterImpact; // ~2.79s
    this.totalDuration = this.withdrawStartTime + c.shatterShakeTime + c.sinkTime; // ~4.19s

    // 1. Seed 168 Crystal Spikes:
    //    - 118 Line Spikes arranged as a wide-open Glacial V-Canyon so the central
    //      sightline to `Skeleton_Warrior` is 100% clear in `05-player-shoulder-camera`
    //      and the front-right approach is open in `03-apex-crown-impact`.
    //    - 50 Apex Glacier Cathedral Crown Spikes arching behind and around the target!
    const apexCount = 50;
    const lineCount = MAX_SPIKES - apexCount; // 118

    for (let i = 0; i < MAX_SPIKES; i++) {
      const rec = this.spikeRecords[i];
      const s = castSeed * 13.7 + i * 19.31;

      rec.yaw = hash11(s + 1.1) * TAU;
      rec.stagger = hash11(s + 2.3);
      rec.heightJitter = signedHash(s + 3.7);
      rec.radiusJitter = signedHash(s + 5.1);
      rec.leanJitter = signedHash(s + 7.3);
      rec.scatter = signedHash(s + 9.9);
      rec.heroBoost = 1.0;

      if (i < lineCount) {
        const uRaw = (i + 0.35 * hash11(s + 11.3)) / lineCount;
        rec.along = Math.pow(saturate(uRaw), c.frontBias);

        const tierRoll = i % 10;
        const sideSign = i % 2 === 0 ? 1 : -1;

        if (tierRoll < 5) {
          // Primary Glacial Canyon Flank Walls (50% of line spikes):
          // Parted into a wide V-corridor (`|lateral| = 0.42..0.82` for `along > 0.35`)
          // so the over-the-shoulder camera has a crystal-clear central sightline to the enemy!
          rec.tier = 'flankWall';
          rec.rubble = false;
          const minLat = lerp(0.20, 0.46, smoothstep(0.22, 0.78, rec.along));
          rec.lateral = sideSign * (minLat + 0.38 * hash11(s + 15.7));

          // On the front-right approach to the apex (`along > 0.76` and `sideSign > 0`),
          // step the right wall down into a low framing terrace so `03-apex-crown-impact`
          // has an unobstructed view of `Skeleton_Warrior` inside the cathedral crown!
          if (sideSign > 0 && rec.along > 0.76) {
            rec.heroBoost = 0.44;
          } else if (i % 5 === 0) {
            rec.heroBoost = 1.24;
          }
        } else if (tierRoll < 8) {
          // Inner Chasm Low Teeth (30% of line spikes):
          // Kept knee-high (`0.34x`) past the launch zone so the V-canyon floor looks jagged
          // without ever blocking the player's over-the-shoulder sightline!
          rec.tier = 'chasmFang';
          rec.rubble = false;
          rec.lateral = sideSign * (0.14 + 0.24 * hash11(s + 13.1));
          rec.heroBoost = lerp(0.88, 0.34, smoothstep(0.22, 0.58, rec.along));
        } else {
          // Outer Basal Splinter Rubble (20% of line spikes):
          rec.tier = 'rubble';
          rec.rubble = true;
          rec.lateral = sideSign * (0.58 + 0.44 * hash11(s + 17.9));
        }

        const frontArrival = c.windupTime + rec.along * travelDuration;
        if (rec.along < 0.16) {
          rec.eruptTime = 0.055 + rec.along * 0.38 + rec.stagger * 0.025;
        } else {
          rec.eruptTime = frontArrival + rec.stagger * c.riseStagger;
        }
      } else {
        // =====================================================================
        // GIANT APEX GLACIER CATHEDRAL CROWN (50 Spires framing target at along=1.0)
        // `rec.angle` is in the spell's `(direction, side)` frame:
        //   - `angle = 0`: directly behind target (`+direction`, `+X`)
        //   - `angle = -PI/2`: left flank (`-side`, `-Z`, behind target from 03 camera)
        //   - `angle = +PI/2`: right flank (`+side`, `+Z`, toward 03 camera)
        //   - `angle = +/-PI`: uprange (`-direction`, `-X`, toward 05 camera)
        // =====================================================================
        const k = i - lineCount;
        rec.tier = 'apexCrown';
        rec.along = 0.95 + 0.05 * hash11(s + 21.1);
        rec.rubble = false;

        if (k < 10) {
          // 10 Colossal Cathedral King-Spires towering in a high semi-circle BEHIND
          // and to the LEFT/REAR-RIGHT of `Skeleton_Warrior` (`angle = -1.75 .. +0.38 rad`),
          // so they form a giant 4.5m glacier throne behind him in BOTH 03 and 05!
          const tSpan = k / 9;
          rec.angle = lerp(-1.75, 0.38, tSpan) + signedHash(s + 23.3) * 0.04;
          rec.radial = 0.38 + 0.20 * hash11(s + 25.9);
          rec.heroBoost = 1.18 + 0.16 * (1.0 - Math.abs(tSpan - 0.5));
        } else if (k < 28) {
          // 18 Outer Cathedral Crescent Spires wrapping from Left-Uprange (`-2.38 rad`)
          // around the Rear (`0.0 rad`) to Rear-Right (`+0.58 rad`):
          // Leaves `angle = +0.62 .. +2.95 rad` (the front-right camera window for shot 03)
          // and `angle = -2.50 .. +2.50` front center (shot 05 sightline) completely open!
          const ringIdx = k - 10;
          const tSpan = ringIdx / 17;
          rec.angle = lerp(-2.38, 0.58, tSpan) + signedHash(s + 27.1) * 0.04;
          rec.radial = 0.58 + 0.40 * Math.sqrt(hash11(s + 29.7));
          rec.heroBoost = lerp(1.12, 0.90, Math.abs(tSpan - 0.5) * 1.3);
        } else if (k < 38) {
          // 10 Waist-High Outward-Jutting Impaling Fangs ringing the front/right crater lip
          // (`angle = +0.55 .. +2.65 rad`, `radial = 0.35..0.68`) so Skeleton_Warrior is
          // visibly surrounded at knee/waist height without his torso or head being blocked!
          const fangIdx = k - 28;
          const tSpan = fangIdx / 9;
          rec.angle = lerp(0.55, 2.65, tSpan) + signedHash(s + 28.3) * 0.05;
          rec.radial = 0.36 + 0.32 * hash11(s + 29.1);
          rec.heroBoost = 0.26 + 0.10 * hash11(s + 30.1);
        } else {
          // 12 Outer Basal Crown Rubble Shards (`k = 38..49`)
          const rubIdx = k - 38;
          rec.rubble = true;
          rec.angle = (rubIdx / 12) * TAU + 0.12;
          rec.radial = 0.78 + 0.30 * hash11(s + 31.3);
        }

        rec.eruptTime = 0.50 + rec.radial * 0.05 + rec.stagger * 0.025;
      }
    }

    // 2. Seed 6 Non-Overlapping Corridor Segments (`kind = 0`)
    for (let i = 0; i < this.scarPatchRecords.length; i++) {
      const seg = this.scarPatchRecords[i];
      seg.spawnTime =
        seg.alongStart < 0.05
          ? 0.03
          : c.windupTime + seg.alongStart * travelDuration;
    }

    // 3. Seed 196 3D Diamond Ice Splinters & Apex Crystalline Burst Shards
    let dIdx = 0;

    // 3a. 22 Expanding 3D Crystalline Apex Nova Burst Shards at Impact (`t = 0.56s..1.14s`)
    for (let k = 0; k < 22 && dIdx < MAX_DEBRIS_CRYSTALS; k++, dIdx++) {
      const rec = this.debrisRecords[dIdx];
      const s = castSeed * 31.1 + k * 17.3;
      const ring = k < 8 ? 0 : k < 16 ? 1 : 2;
      const az =
        ring === 0
          ? (k / 8) * TAU
          : ring === 1
            ? ((k - 8) / 8) * TAU + 0.38
            : ((k - 16) / 6) * TAU + 0.65;
      const elev = ring === 0 ? 0.28 : ring === 1 ? 0.58 : 0.88;

      rec.mode = 'apexHemisphere';
      rec.spawnTime = 0.56 + ring * 0.022;
      rec.life = 0.58;
      rec.along = 0.98;
      rec.lateral = 0;
      rec.offsetX = Math.sin(az) * Math.cos(elev) * 0.55;
      rec.offsetY = 0.25 + Math.sin(elev) * 0.38;
      rec.offsetZ = Math.cos(az) * Math.cos(elev) * 0.55;
      rec.vx = Math.sin(az) * Math.cos(elev) * 6.8;
      rec.vy = Math.sin(elev) * 4.8;
      rec.vz = Math.cos(az) * Math.cos(elev) * 6.8;
      rec.gravity = -9.5;
      rec.drag = 2.4;
      const chunkSz = 0.22 + 0.12 * hash11(s + 1.1);
      rec.scaleX = chunkSz;
      rec.scaleY = chunkSz * (1.15 + 0.35 * hash11(s + 2.3));
      rec.scaleZ = chunkSz * 0.92;
      rec.endScaleMult = 0.25;
      rec.yaw = az;
      rec.pitch = Math.PI * 0.5 - elev;
      rec.roll = signedHash(s + 5.1) * 0.6;
      rec.spinX = signedHash(s + 7.1) * 5.5;
      rec.spinY = signedHash(s + 8.3) * 5.5;
      rec.spinZ = signedHash(s + 9.1) * 5.5;
    }

    // 3b. 14 Muzzle Crystal Burst Shards at Cast Launch (`t = 0.04s..0.44s`)
    for (let k = 0; k < 14 && dIdx < MAX_DEBRIS_CRYSTALS; k++, dIdx++) {
      const rec = this.debrisRecords[dIdx];
      const s = castSeed * 43.7 + k * 13.1;
      const ang = (k / 14) * TAU + signedHash(s) * 0.2;
      rec.mode = 'muzzleSplinter';
      rec.spawnTime = 0.04 + (k % 3) * 0.022;
      rec.life = 0.38;
      rec.along = 0.04;
      rec.lateral = 0;
      rec.offsetX = Math.cos(ang) * 0.22;
      rec.offsetY = 0.52 + Math.sin(ang) * 0.18;
      rec.offsetZ = 0.36;
      rec.vx = Math.cos(ang) * 3.2;
      rec.vy = 2.4 + Math.sin(ang) * 1.6;
      rec.vz = 4.2 + hash11(s + 2.1) * 2.6;
      rec.gravity = -18.0;
      rec.drag = 1.4;
      const mSz = 0.13 + 0.07 * hash11(s + 4.3);
      rec.scaleX = mSz;
      rec.scaleY = mSz * 1.18;
      rec.scaleZ = mSz * 0.95;
      rec.endScaleMult = 0.18;
      rec.yaw = ang;
      rec.pitch = 0.85;
      rec.roll = 0;
      rec.spinX = signedHash(s + 6.1) * 9.0;
      rec.spinY = signedHash(s + 7.7) * 9.0;
      rec.spinZ = signedHash(s + 9.3) * 9.0;
    }

    // 3c. 90 Breach Ice Chips Spat Along the Racing Eruption Front
    for (let k = 0; k < 90 && dIdx < MAX_DEBRIS_CRYSTALS; k++, dIdx++) {
      const rec = this.debrisRecords[dIdx];
      const s = castSeed * 53.3 + k * 19.7;
      const spikeRef = this.spikeRecords[(k * 2) % lineCount];
      const spreadAng = hash11(s + 1.3) * TAU;
      const speed = 3.2 + hash11(s + 2.9) * 4.2;

      rec.mode = 'chip';
      rec.spawnTime = spikeRef.eruptTime + 0.02;
      rec.life = 0.38 + hash11(s + 4.1) * 0.22;
      rec.along = spikeRef.along;
      rec.lateral = spikeRef.lateral;
      rec.offsetX = Math.cos(spreadAng) * 0.20;
      rec.offsetY = 0.22 + hash11(s + 5.7) * 0.38;
      rec.offsetZ = Math.sin(spreadAng) * 0.20;
      rec.vx = Math.cos(spreadAng) * speed * 0.62;
      rec.vy = 3.6 + hash11(s + 7.3) * 3.8;
      rec.vz = Math.sin(spreadAng) * speed * 0.62 + 1.4;
      rec.gravity = -22.0;
      rec.drag = 0.75;
      const sz = 0.11 + hash11(s + 8.9) * 0.08;
      rec.scaleX = sz;
      rec.scaleY = sz * (1.12 + hash11(s + 10.1) * 0.32);
      rec.scaleZ = sz * 0.92;
      rec.endScaleMult = 0.12;
      rec.yaw = hash11(s + 11.7) * TAU;
      rec.pitch = hash11(s + 13.3) * TAU;
      rec.roll = hash11(s + 14.9) * TAU;
      rec.spinX = signedHash(s + 16.1) * 12.0;
      rec.spinY = signedHash(s + 17.7) * 12.0;
      rec.spinZ = signedHash(s + 19.3) * 12.0;
    }

    // 3d. 46 Apex Detonation Shards (`along = 0.86..1.0`) + 24 Beat-4 Shatter Chips
    for (; dIdx < MAX_DEBRIS_CRYSTALS; dIdx++) {
      const rec = this.debrisRecords[dIdx];
      const s = castSeed * 67.9 + dIdx * 23.1;
      const isWithdrawShatter = dIdx >= MAX_DEBRIS_CRYSTALS - 24;
      const ang = hash11(s + 1.1) * TAU;
      const spd = 4.2 + hash11(s + 2.7) * 5.4;

      rec.mode = isWithdrawShatter ? 'shatterChip' : 'chip';
      rec.spawnTime = isWithdrawShatter
        ? this.withdrawStartTime + hash11(s + 3.9) * 0.32
        : 0.56 + hash11(s + 3.9) * 0.14;
      rec.life = isWithdrawShatter ? 0.65 : 0.48 + hash11(s + 5.3) * 0.34;
      rec.along = isWithdrawShatter ? 0.18 + 0.82 * hash11(s + 6.7) : 0.88 + 0.12 * hash11(s + 6.7);
      rec.lateral = isWithdrawShatter ? signedHash(s + 8.1) * 0.65 : signedHash(s + 8.1) * 0.52;
      rec.offsetX = Math.cos(ang) * 0.55;
      rec.offsetY = 0.45 + hash11(s + 9.5) * 1.15;
      rec.offsetZ = Math.sin(ang) * 0.55;
      rec.vx = Math.cos(ang) * spd;
      rec.vy = 4.2 + hash11(s + 11.1) * 4.6;
      rec.vz = Math.sin(ang) * spd;
      rec.gravity = -19.5;
      rec.drag = 0.68;
      const sz = 0.12 + hash11(s + 12.7) * 0.09;
      rec.scaleX = sz;
      rec.scaleY = sz * (1.15 + hash11(s + 14.3) * 0.35);
      rec.scaleZ = sz * 0.92;
      rec.endScaleMult = 0.15;
      rec.yaw = hash11(s + 15.9) * TAU;
      rec.pitch = hash11(s + 17.3) * TAU;
      rec.roll = hash11(s + 18.9) * TAU;
      rec.spinX = signedHash(s + 20.1) * 12.0;
      rec.spinY = signedHash(s + 21.7) * 12.0;
      rec.spinZ = signedHash(s + 23.3) * 12.0;
    }

    // 4. Seed 210 Billboard Atmosphere Particles:
    //    - 96 Ground-Hugging Cold Glacier Vapor Puffs (`pType = 0`)
    //    - 110 Crystal-Hugging 4-Point Anime Star Glints (`pType = 1`, scaled to local spike height!)
    //    - 4 Arcane/Impact Starbursts (`pType = 2`: 1 at Staff Tip + 3 at Apex Impact Core!)
    let pIdx = 0;

    // 4a. 96 Ground-Hugging Cold Glacier Vapor Puffs (`pType = 0`)
    for (let k = 0; k < 96 && pIdx < MAX_ATMOSPHERE_PARTICLES; k++, pIdx++) {
      const p = this.atmosphereRecords[pIdx];
      const s = castSeed * 79.3 + k * 17.1;
      const isApexMist = k >= 58;
      const u = isApexMist ? 0.84 + 0.16 * hash11(s + 1.3) : 0.12 + (k / 58) * 0.74;
      const arrival = isApexMist
        ? 0.54 + (k % 4) * 0.16 + hash11(s + 2.9) * 0.12
        : c.windupTime + u * travelDuration + (k % 3) * 0.22 + hash11(s + 2.9) * 0.12;

      p.pType = 0;
      p.spawnTime = arrival;
      p.life = 2.10 + hash11(s + 4.3) * 1.10;
      p.along = u;
      p.lateral = signedHash(s + 5.9) * (isApexMist ? 0.72 : 0.48);
      p.offsetX = signedHash(s + 7.1) * 0.25;
      p.offsetY = 0.18 + hash11(s + 8.7) * (isApexMist ? 0.58 : 0.30);
      p.offsetZ = signedHash(s + 10.3) * 0.25;
      p.vx = signedHash(s + 11.9) * 0.32;
      p.vy = 0.12 + hash11(s + 13.1) * 0.18;
      p.vz = signedHash(s + 14.7) * 0.32;
      p.drag = 1.85;
      const baseSz = lerp(0.85, 1.85, u) * (0.85 + 0.30 * hash11(s + 16.3));
      p.startSize = baseSz * 0.55;
      p.endSize = baseSz * 1.25;
      p.alphaScale = isApexMist ? 0.24 + 0.10 * hash11(s + 17.9) : 0.18 + 0.08 * hash11(s + 17.9);
      p.seed = hash11(s + 19.1);
    }

    // 4b. 110 Pinpoint Ice Glitter Motes (`pType = 1`, exact Spellbook ParticleShape.SOFT)
    for (let k = 0; k < 110 && pIdx < MAX_ATMOSPHERE_PARTICLES; k++, pIdx++) {
      const p = this.atmosphereRecords[pIdx];
      const s = castSeed * 97.1 + k * 23.7;
      const isMuzzleStar = k < 16;
      const isApexStar = k >= 16 && k < 76;
      const u = isMuzzleStar
        ? 0.01 + 0.09 * hash11(s + 1.1)
        : isApexStar
          ? 0.78 + 0.22 * hash11(s + 1.1)
          : 0.15 + 0.65 * Math.pow(hash11(s + 1.1), 0.72);
      const arrival = isMuzzleStar
        ? 0.03 + hash11(s + 2.3) * 0.13
        : isApexStar
          ? 0.54 + hash11(s + 2.3) * 0.52
          : c.windupTime + u * travelDuration + (k % 3) * 0.16;

      const localEnvelopeH = lerp(c.heightNear, c.height, Math.pow(u, c.heightCurve));

      p.pType = 1;
      p.spawnTime = arrival;
      p.life = isMuzzleStar ? 0.55 : 1.35 + hash11(s + 3.7) * 0.95;
      p.along = u;
      p.lateral = signedHash(s + 5.1) * (isMuzzleStar ? 0.35 : 0.78);
      p.offsetX = signedHash(s + 6.7) * 0.30;
      p.offsetY = isMuzzleStar
        ? 0.62 + hash11(s + 8.3) * 0.70
        : 0.22 + hash11(s + 8.3) * localEnvelopeH * (isApexStar ? 1.05 : 0.80);
      p.offsetZ = signedHash(s + 9.9) * 0.30;
      p.vx = signedHash(s + 11.3) * 0.95;
      p.vy = 0.75 + hash11(s + 12.9) * (isApexStar ? 1.55 : 0.85);
      p.vz = signedHash(s + 14.5) * 0.95;
      p.drag = 1.15;
      const moteSz = (isMuzzleStar ? 0.18 : 0.11 + 0.12 * hash11(s + 16.1)) * lerp(0.85, 1.25, u);
      p.startSize = moteSz;
      p.endSize = moteSz * 0.45;
      p.alphaScale = 0.88;
      p.seed = hash11(s + 17.7);
    }

    // 4c. 1 Staff-Tip Vapour Burst (`pIdx = 206`) + 3 Apex Freezing Vapour Shells
    if (pIdx < MAX_ATMOSPHERE_PARTICLES) {
      const p = this.atmosphereRecords[pIdx++];
      p.pType = 2;
      p.spawnTime = 0.03;
      p.life = 0.28;
      p.along = 0.0;
      p.lateral = 0;
      p.offsetX = 0.0;
      p.offsetY = 1.02;
      p.offsetZ = -0.12;
      p.vx = 0;
      p.vy = 0.1;
      p.vz = 0.4;
      p.drag = 1.5;
      p.startSize = 0.85;
      p.endSize = 1.45;
      p.alphaScale = 0.75;
      p.seed = 0.33;
    }

    for (let b = 0; pIdx < MAX_ATMOSPHERE_PARTICLES; b++, pIdx++) {
      const p = this.atmosphereRecords[pIdx];
      p.pType = 0;
      p.spawnTime = 0.54 + b * 0.06;
      p.life = 1.65;
      p.along = 0.96;
      p.lateral = (b - 1) * 0.35;
      p.offsetX = 0.0;
      p.offsetY = 0.28;
      p.offsetZ = 0.0;
      p.vx = (b - 1) * 0.35;
      p.vy = 0.14;
      p.vz = 0;
      p.drag = 1.8;
      p.startSize = 1.15;
      p.endSize = 2.10;
      p.alphaScale = 0.28;
      p.seed = 0.51 + b * 0.21;
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Spatial & Silhouette Helpers                                            */
  /* ----------------------------------------------------------------------- */

  _halfWidth(s) {
    const c = this.config;
    return lerp(c.widthNear, c.width, Math.pow(saturate(s), c.widthCurve));
  }

  _lateralNorm(record) {
    const c = this.config;
    const raw = record.lateral;
    const clumped = Math.sign(raw) * Math.pow(Math.abs(raw), c.clumping);
    return clumped + record.scatter * c.scatter * 0.25;
  }

  _pointAt(along, lateralMeters, out) {
    const dist = along * this.castLength;
    out.x = this.origin.x + this.direction.x * dist + this.side.x * lateralMeters;
    out.z = this.origin.z + this.direction.z * dist + this.side.z * lateralMeters;
    out.y = this.getGroundHeight(out.x, out.z);
    return out;
  }

  _groundNormalAt(x, z, out) {
    const eps = 0.45;
    const hL = this.getGroundHeight(x - eps, z);
    const hR = this.getGroundHeight(x + eps, z);
    const hD = this.getGroundHeight(x, z - eps);
    const hU = this.getGroundHeight(x, z + eps);
    out.set(hL - hR, 2.0 * eps, hD - hU).normalize();
    return out;
  }

  _spikeWorldPosition(record, out) {
    if (record.tier === 'apexCrown') {
      const reach = this._halfWidth(1.0) * 1.18 * record.radial;
      const cx = this.origin.x + this.direction.x * this.castLength;
      const cz = this.origin.z + this.direction.z * this.castLength;
      const alongOff = Math.cos(record.angle) * reach;
      const sideOff = Math.sin(record.angle) * reach;
      out.x = cx + this.direction.x * alongOff + this.side.x * sideOff;
      out.z = cz + this.direction.z * alongOff + this.side.z * sideOff;
      out.y = this.getGroundHeight(out.x, out.z);
      return out;
    }
    const latMeters = this._lateralNorm(record) * this._halfWidth(record.along);
    return this._pointAt(record.along, latMeters, out);
  }

  _spikeHeight(record) {
    const c = this.config;
    let h = lerp(c.heightNear, c.height, Math.pow(saturate(record.along), c.heightCurve));

    const apexFactor =
      record.tier === 'apexCrown'
        ? 1.0 - record.radial * 0.14
        : smoothstep(1.0 - c.peakWidth, 1.0, record.along);
    h *= 1.0 + (c.peak - 1.0) * apexFactor;

    if (record.tier === 'flankWall') {
      const edge = saturate((Math.abs(record.lateral) - 0.25) / 0.55);
      h *= lerp(1.05, 1.0 - c.crown * 0.65, Math.pow(edge, 1.3)) * (record.heroBoost || 1.0);
    } else if (record.tier === 'chasmFang') {
      h *= record.heroBoost || 0.65;
    } else if (record.tier === 'apexCrown' && !record.rubble) {
      h *= record.heroBoost || 1.0;
    }

    h *= 1.0 + record.heightJitter * c.heightJitter * 0.55;
    if (record.rubble) {
      h *= c.rubbleScale;
    }

    return Math.max(0.22, h);
  }

  _spikeRadius(record) {
    const c = this.config;
    const grow = lerp(0.75, 1.25, Math.pow(saturate(record.along), 0.58));
    const jitter = 1.0 + record.radiusJitter * c.radiusJitter * 0.45;
    const tierBoost =
      record.tier === 'apexCrown' && !record.rubble
        ? 1.32
        : record.tier === 'flankWall'
          ? 1.15
          : record.rubble
            ? 1.42
            : 1.02;
    return Math.max(0.14, c.radius * grow * jitter * tierBoost);
  }

  _spikeEmergence(record, timeSeconds) {
    const elapsed = timeSeconds - record.eruptTime;
    if (elapsed < 0) return -1;

    const c = this.config;
    const riseTime = Math.max(0.03, c.riseTime);
    if (elapsed <= riseTime) {
      return outQuint(elapsed / riseTime);
    }

    const after = elapsed - riseTime;
    const spring = Math.sin(after * 14.0) * Math.exp(-after / Math.max(0.06, c.settle));
    return 1.0 + c.riseOvershoot * spring;
  }

  _cacheCastWorldPositions() {
    this.corridorUniforms.uCastOrigin.value.copy(this.origin);
    this.corridorUniforms.uCastDir.value.copy(this.direction);
    this.corridorUniforms.uCastSide.value.copy(this.side);
    this.corridorUniforms.uCastLength.value = this.castLength;

    const castYaw = Math.atan2(this.direction.x, this.direction.z);

    for (let i = 0; i < MAX_SPIKES; i++) {
      const rec = this.spikeRecords[i];
      this._spikeWorldPosition(rec, _pos);
      rec.wx = _pos.x;
      rec.wy = _pos.y;
      rec.wz = _pos.z;
    }

    for (let i = 0; i < this.scarPatchRecords.length; i++) {
      const seg = this.scarPatchRecords[i];
      this._pointAt(seg.alongCenter, 0, _pos);
      seg.wx = _pos.x;
      seg.wy = _pos.y + 0.035;
      seg.wz = _pos.z;
      this._groundNormalAt(_pos.x, _pos.z, _normal);
      _tiltQuat.setFromUnitVectors(UP, _normal);
      _spinQuat.setFromAxisAngle(UP, castYaw);
      _tiltQuat.multiply(_spinQuat);
      seg.qx = _tiltQuat.x;
      seg.qy = _tiltQuat.y;
      seg.qz = _tiltQuat.z;
      seg.qw = _tiltQuat.w;
    }

    for (let i = 0; i < MAX_DEBRIS_CRYSTALS; i++) {
      const rec = this.debrisRecords[i];
      const hw = this._halfWidth(rec.along);
      this._pointAt(rec.along, rec.lateral * hw, _pos);
      rec.baseX = _pos.x;
      rec.baseY = _pos.y;
      rec.baseZ = _pos.z;
    }

    for (let i = 0; i < MAX_ATMOSPHERE_PARTICLES; i++) {
      const p = this.atmosphereRecords[i];
      const hw = this._halfWidth(p.along);
      this._pointAt(p.along, p.lateral * hw, _pos);
      p.baseX = _pos.x;
      p.baseY = _pos.y;
      p.baseZ = _pos.z;
    }

    this._groundNormalAt(this.origin.x, this.origin.z, _normal);
    this._originTiltQuat = this._originTiltQuat || new THREE.Quaternion();
    this._originTiltQuat.setFromUnitVectors(UP, _normal);
  }

  /* ----------------------------------------------------------------------- */
  /* Public API: Cast, Seek, Update, Lighting & Gameplay Hooks               */
  /* ----------------------------------------------------------------------- */

  setStylePreset(presetKey = 'v1') {
    const preset = FROST_LANCE_STYLE_PRESETS[presetKey] || FROST_LANCE_STYLE_PRESETS.v1;
    this.config.stylePreset = presetKey;
    Object.assign(this.config, preset);

    for (const mat of [this.crystalMat, this.debrisMat]) {
      if (!mat) continue;
      mat.uniforms.uColorCore.value.set(preset.colorCore);
      mat.uniforms.uColorDeep.value.set(preset.colorDeep);
      mat.uniforms.uColorMid.value.set(preset.colorMid);
      mat.uniforms.uColorIce.value.set(preset.colorIce);
      mat.uniforms.uColorRim.value.set(preset.colorRim);
      mat.uniforms.uColorInk.value.set(preset.colorInk);
      mat.uniforms.uColorScarVein.value.set(preset.colorScarVein);
      if (mat.uniforms.uDensity) mat.uniforms.uDensity.value = preset.depthTint ?? 1.20;
      if (mat.uniforms.uFrostLine) mat.uniforms.uFrostLine.value = preset.frostLine ?? 0.56;
      if (mat.uniforms.uVeins) mat.uniforms.uVeins.value = preset.veins ?? 0.52;
      if (mat.uniforms.uFracture) mat.uniforms.uFracture.value = preset.fracture ?? 0.62;
      if (mat.uniforms.uFacetSharp) mat.uniforms.uFacetSharp.value = preset.facetSharp ?? 0.72;
    }

    if (this.groundDecalMat) {
      this.groundDecalMat.uniforms.uColorScarDeep.value.set(preset.colorScarDeep);
      this.groundDecalMat.uniforms.uColorScarMid.value.set(preset.colorScarMid);
      this.groundDecalMat.uniforms.uColorScarVein.value.set(preset.colorScarVein);
      this.groundDecalMat.uniforms.uColorIce.value.set(preset.colorIce);
      this.groundDecalMat.uniforms.uColorRim.value.set(preset.colorRim);
      this.groundDecalMat.uniforms.uColorInk.value.set(preset.colorInk);
    }

    if (this.atmosphereMat) {
      this.atmosphereMat.uniforms.uColorMistCrest.value.set(preset.colorMistCrest);
      this.atmosphereMat.uniforms.uColorMistShadow.value.set(preset.colorMistShadow);
      this.atmosphereMat.uniforms.uColorIce.value.set(preset.colorIce);
      this.atmosphereMat.uniforms.uColorRim.value.set(preset.colorRim);
      this.atmosphereMat.uniforms.uColorInk.value.set(preset.colorInk);
    }
    return this;
  }

  cast(origin, direction, options = {}) {
    if (origin) {
      this.origin.set(origin.x ?? origin[0] ?? 0, origin.y ?? origin[1] ?? 0, origin.z ?? origin[2] ?? 0);
    }
    if (direction) {
      const dx = direction.x ?? direction[0] ?? 0;
      const dz = direction.z ?? direction[2] ?? 1;
      const len = Math.hypot(dx, dz) || 1;
      this.direction.set(dx / len, 0, dz / len);
    }
    this.side.set(-this.direction.z, 0, this.direction.x);

    this.castLength = options.range ?? this.config.range;
    this.origin.y = this.getGroundHeight(this.origin.x, this.origin.z);

    if (options.seed !== undefined) {
      this._seedDeterministicChoreography(options.seed);
    }
    this._cacheCastWorldPositions();

    this.active = true;
    this.age = 0;
    this._apexTriggered = false;
    this._staggeredEnemies.clear();
    this.group.visible = true;

    this.seek(0.001);
    return this;
  }

  registerEnemyTargets(enemies = []) {
    this.enemyTargets = Array.isArray(enemies) ? enemies : [];
  }

  setLighting({ sunDir, daylight = 1.0, glowBoost } = {}) {
    if (sunDir) {
      this.sharedUniforms.uSunDir.value.copy(sunDir).normalize();
    }
    if (Number.isFinite(daylight)) {
      this.sharedUniforms.uDaylight.value = clamp(daylight, 0.0, 1.2);
    }
    if (Number.isFinite(glowBoost)) {
      this.sharedUniforms.uGlowBoost.value = glowBoost;
    } else {
      this.sharedUniforms.uGlowBoost.value = lerp(0.92, 0.24, clamp(daylight, 0.0, 1.0));
    }
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

    if (this.spikeRecords[0].wx === undefined) {
      this._cacheCastWorldPositions();
    }

    this.active = true;
    this.age = timeSeconds;
    this.group.visible = true;
    this.sharedUniforms.uTime.value = timeSeconds;

    const c = this.config;
    const travelDuration = c.range / Math.max(1.0, c.speed);
    const travelU = saturate((timeSeconds - c.windupTime) / travelDuration);
    this.corridorUniforms.uTravelFront.value = Math.max(0.08, travelU);

    const shatterPhase = saturate(
      (timeSeconds - this.withdrawStartTime) / Math.max(0.05, c.shatterShakeTime)
    );
    const retractU = saturate(
      (timeSeconds - (this.withdrawStartTime + c.shatterShakeTime)) / Math.max(0.05, c.sinkTime)
    );

    this._evaluateGroundDecals(timeSeconds, travelU, retractU);
    this._evaluateCrystalBlades(timeSeconds, shatterPhase, retractU);
    this._evaluateDebrisAndHemisphereBurst(timeSeconds);
    this._evaluateAtmosphereBillboards(timeSeconds);
    this._evaluateGameplayHooks(timeSeconds, travelU);

    return this;
  }

  update(dt) {
    if (!this.active) {
      this._shakeOffset.set(0, 0, 0);
      this._hitstopScale = 1.0;
      return;
    }

    const effectiveDt = dt * (this._hitstopScale < 0.5 ? 0.35 : 1.0);
    const nextAge = this.age + effectiveDt;

    if (nextAge > this.totalDuration) {
      this.clear();
      return;
    }

    this.seek(nextAge);
  }

  _evaluateGroundDecals(timeSeconds, travelU, retractU) {
    const c = this.config;
    const metaArr = this.decalMetaAttr.array;
    let slot = 0;

    const pushSpecialDecal = (x, y, z, radiusX, radiusZ, yaw, age01, kind, seed, intensity) => {
      if (slot >= MAX_GROUND_DECALS || age01 < 0 || age01 >= 1 || intensity <= 0.001) return;
      _dummy.position.set(x, y + 0.042, z);
      _spinQuat.setFromAxisAngle(UP, yaw);
      _dummy.quaternion.copy(this._originTiltQuat).multiply(_spinQuat);
      _dummy.scale.set(radiusX, 1, radiusZ);
      _dummy.updateMatrix();

      this.groundDecalMesh.setMatrixAt(slot, _dummy.matrix);
      const o = slot * 4;
      metaArr[o + 0] = age01;
      metaArr[o + 1] = kind;
      metaArr[o + 2] = seed;
      metaArr[o + 3] = intensity;
      slot++;
    };

    // 1. Push 1 Single Full-Corridor World-Space Glacial Quad (`kind = 0`)
    //    Covers the entire cast corridor + apex basin in a single quad with ZERO segment seams or notches!
    const scarFade = 1.0 - smoothstep(0.35, 1.0, retractU);
    if (scarFade > 0.001) {
      const midDist = this.castLength * 0.52;
      const cx = this.origin.x + this.direction.x * midDist;
      const cz = this.origin.z + this.direction.z * midDist;
      const cy = this.getGroundHeight(cx, cz) + 0.035;
      const rX = c.width * 2.75;
      const rZ = this.castLength * 0.88;
      const segAge = clamp(timeSeconds / Math.max(0.2, this.totalDuration), 0.0, 0.999);
      const castYaw = Math.atan2(this.direction.x, this.direction.z);

      _dummy.position.set(cx, cy, cz);
      _spinQuat.setFromAxisAngle(UP, castYaw);
      _dummy.quaternion.copy(this._originTiltQuat).multiply(_spinQuat);
      _dummy.scale.set(rX, 1, rZ);
      _dummy.updateMatrix();

      this.groundDecalMesh.setMatrixAt(slot, _dummy.matrix);
      const o = slot * 4;
      metaArr[o + 0] = segAge;
      metaArr[o + 1] = 0.0;
      metaArr[o + 2] = 0.37;
      metaArr[o + 3] = scarFade;
      slot++;
    }

    const castYaw = Math.atan2(this.direction.x, this.direction.z);

    // 2. Muzzle Geometric Cryo-Sigil (`kind = 1`, crisp hexagonal rune at launch)
    const sigilLife = 0.68;
    if (timeSeconds <= sigilLife) {
      const sx = this.origin.x + this.direction.x * 0.72;
      const sz = this.origin.z + this.direction.z * 0.72;
      pushSpecialDecal(sx, this.origin.y, sz, 1.48, 1.48, castYaw, timeSeconds / sigilLife, 1.0, 0.17, 1.0);
    }

    // 3. Jagged Branching Tectonic Fissure Spearhead (`kind = 2`, racing ahead of spikes)
    if (timeSeconds >= 0.05 && timeSeconds <= this.impactTime + 0.06) {
      const spearAlong = clamp(travelU + 0.08, 0.08, 0.98);
      const dist = spearAlong * this.castLength;
      const spX = this.origin.x + this.direction.x * dist;
      const spZ = this.origin.z + this.direction.z * dist;
      const spearAge = saturate((timeSeconds - 0.05) / (this.impactTime + 0.06));
      const w = this._halfWidth(spearAlong) * 0.95;
      pushSpecialDecal(spX, this.origin.y, spZ, w, 2.35, castYaw, spearAge * 0.60, 2.0, 0.53, 1.0);
    }

    // 4. Dual-Wave Crystalline Apex Frost-Nova Shockwave (`kind = 3`, centered at Apex Impact!)
    const shockStart = 0.55;
    const shockLife = 0.88;
    if (timeSeconds >= shockStart && timeSeconds <= shockStart + shockLife) {
      const shockAge = (timeSeconds - shockStart) / shockLife;
      const apX = this.origin.x + this.direction.x * this.castLength;
      const apZ = this.origin.z + this.direction.z * this.castLength;
      pushSpecialDecal(
        apX,
        this.origin.y,
        apZ,
        c.shockRadius,
        c.shockRadius,
        0.0,
        shockAge,
        3.0,
        0.81,
        1.0
      );
      // Secondary tight inner nova ring staggered by 0.08s for multi-layered anime impact!
      const innerAge = (timeSeconds - (shockStart + 0.08)) / (shockLife * 0.78);
      if (innerAge > 0 && innerAge < 1) {
        pushSpecialDecal(
          apX,
          this.origin.y,
          apZ,
          c.shockRadius * 0.68,
          c.shockRadius * 0.68,
          0.52,
          innerAge,
          3.0,
          0.37,
          0.92
        );
      }
    }

    this.groundDecalMesh.count = slot;
    this.groundDecalMesh.instanceMatrix.needsUpdate = true;
    this.decalMetaAttr.needsUpdate = true;
  }

  _evaluateCrystalBlades(timeSeconds, shatterPhase, retractU) {
    const c = this.config;
    const birthFade = Math.max(0.04, c.birthFade);
    const used = [0, 0, 0];

    for (let i = 0; i < MAX_SPIKES; i++) {
      const record = this.spikeRecords[i];
      const variant = i % CRYSTAL_VARIANTS;
      const slot = (i / CRYSTAL_VARIANTS) | 0;
      const emerge = this._spikeEmergence(record, timeSeconds);

      if (emerge < 0) {
        _dummy.position.set(0, -999, 0);
        _dummy.quaternion.identity();
        _dummy.scale.setScalar(0.0001);
        _dummy.updateMatrix();
        this.crystalMeshes[variant].setMatrixAt(slot, _dummy.matrix);
        this.crystalBirthAttrs[variant].array[slot] = 0;
        used[variant] = Math.max(used[variant], slot + 1);
        continue;
      }

      const height = this._spikeHeight(record);
      const radius = this._spikeRadius(record);

      if (record.tier === 'apexCrown') {
        const alongDir = Math.cos(record.angle);
        const sideDir = Math.sin(record.angle);
        const radialOutX = this.direction.x * alongDir + this.side.x * sideDir;
        const radialOutZ = this.direction.z * alongDir + this.side.z * sideDir;
        _lean
          .set(
            this.direction.x * 0.36 + radialOutX * (0.55 + 0.60 * record.radial),
            0,
            this.direction.z * 0.36 + radialOutZ * (0.55 + 0.60 * record.radial)
          )
          .normalize();
      } else {
        const outward = this._lateralNorm(record);
        // Splay the V-canyon flank walls outward (`splayWeight = 0.92`) so the center sightline stays wide open!
        const splayWeight = record.tier === 'chasmFang' ? 0.42 : 0.92;
        _lean
          .copy(this.direction)
          .multiplyScalar(0.78)
          .addScaledVector(this.side, outward * splayWeight)
          .normalize();
      }

      const baseLean =
        record.tier === 'apexCrown'
          ? c.lean * (0.42 + 0.68 * record.radial)
          : c.lean * (0.38 + 0.65 * record.along);
      const leanAngle = clamp(
        baseLean * (1.0 + record.leanJitter * c.leanJitter * 0.38),
        0.08,
        0.72
      );

      _axis.crossVectors(UP, _lean);
      if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
      else _axis.normalize();

      _tiltQuat.setFromAxisAngle(_axis, leanAngle);
      _spinQuat.setFromAxisAngle(UP, record.yaw * c.twist);
      _tiltQuat.multiply(_spinQuat);

      _dummy.position.set(record.wx, record.wy, record.wz);

      if (shatterPhase > 0 && retractU < 0.85) {
        const shudder =
          Math.sin(timeSeconds * 68.0 + record.index * 5.7) *
          0.045 *
          shatterPhase *
          (1.0 - retractU);
        _dummy.position.x += this.side.x * shudder;
        _dummy.position.z += this.side.z * shudder;
      }

      // CRITICAL BASE EMBEDDING FIX:
      // Sink every crystal by `tiltLiftCompensation = 0.54 * radius * sin(leanAngle)`
      // so the tilted `y = 0` ring is guaranteed to stay 100% below the ground surface!
      // NEVER sink or shrink erupted spires during withdrawal (retractU > 0) — they sublimate in place!
      const riseSink = Math.min(0.0, emerge - 1.0) * height * 0.82;
      const tiltLiftCompensation = 0.54 * radius * Math.sin(leanAngle);
      _dummy.position.y += riseSink - tiltLiftCompensation - 0.08;

      const sublimateU =
        retractU > 0
          ? smoothstep(0.02, 0.96, retractU * 1.12 - record.along * 0.10 - record.stagger * 0.08)
          : 0.0;
      if (sublimateU >= 0.995) {
        _dummy.position.set(0, -999, 0);
        _dummy.quaternion.identity();
        _dummy.scale.setScalar(0.0001);
        _dummy.updateMatrix();
        this.crystalMeshes[variant].setMatrixAt(slot, _dummy.matrix);
        this.crystalBirthAttrs[variant].array[slot] = -1.0;
        used[variant] = Math.max(used[variant], slot + 1);
        continue;
      }

      const widthGrow = lerp(0.86, 1.0, Math.min(1.0, emerge));
      const currentHeight = Math.max(0.08, height * Math.max(0.18, emerge)) + tiltLiftCompensation * 0.90;
      _dummy.quaternion.copy(_tiltQuat);
      _dummy.scale.set(radius * widthGrow, currentHeight, radius * widthGrow);
      _dummy.updateMatrix();

      this.crystalMeshes[variant].setMatrixAt(slot, _dummy.matrix);
      const birthElapsed = Math.max(0, timeSeconds - record.eruptTime);
      const birthGlow = saturate(1.0 - birthElapsed / birthFade);
      this.crystalBirthAttrs[variant].array[slot] =
        sublimateU > 0.001
          ? -sublimateU
          : Math.max(birthGlow, shatterPhase * (1.0 - retractU) * 0.45);
      used[variant] = Math.max(used[variant], slot + 1);
    }

    for (let v = 0; v < CRYSTAL_VARIANTS; v++) {
      this.crystalMeshes[v].count = used[v];
      this.crystalMeshes[v].instanceMatrix.needsUpdate = true;
      this.crystalBirthAttrs[v].needsUpdate = true;
    }
  }

  _evaluateDebrisAndHemisphereBurst(timeSeconds) {
    let slot = 0;
    const birthArr = this.debrisBirthAttr.array;
    const castYaw = Math.atan2(this.direction.x, this.direction.z);

    for (let i = 0; i < MAX_DEBRIS_CRYSTALS; i++) {
      const rec = this.debrisRecords[i];
      const elapsed = timeSeconds - rec.spawnTime;
      if (elapsed < 0 || elapsed >= rec.life) continue;

      const u = elapsed / rec.life;
      const dragFactor =
        rec.drag > 0.05 ? (1.0 - Math.exp(-rec.drag * elapsed)) / rec.drag : elapsed;

      const localX = rec.offsetX + rec.vx * dragFactor;
      const localZ = rec.offsetZ + rec.vz * dragFactor;
      const wx = rec.baseX + this.side.x * localX + this.direction.x * localZ;
      const wz = rec.baseZ + this.side.z * localX + this.direction.z * localZ;
      const wy = rec.baseY + rec.offsetY + rec.vy * dragFactor + 0.5 * rec.gravity * elapsed * elapsed;

      // Hide chips that have fallen back into the ground so they don't litter the sand
      if (rec.mode !== 'apexHemisphere' && wy < rec.baseY + 0.06) {
        continue;
      }

      _dummy.position.set(wx, wy, wz);
      _dummy.rotation.set(
        rec.pitch + rec.spinX * elapsed,
        rec.yaw + castYaw + rec.spinY * elapsed,
        rec.roll + rec.spinZ * elapsed
      );

      let scMult = 1.0;
      if (rec.mode === 'apexHemisphere') {
        const expand = outQuint(Math.min(1.0, u * 1.45));
        scMult = lerp(0.32, 1.0, expand);
        birthArr[slot] = u < 0.35 ? 1.0 - u * 2.2 : -smoothstep(0.42, 0.98, u);
      } else {
        const popIn = smoothstep(0.0, 0.08, u);
        scMult = popIn;
        birthArr[slot] = u < 0.42 ? saturate(1.0 - u * 2.1) : -smoothstep(0.42, 0.98, u);
      }

      _dummy.scale.set(rec.scaleX * scMult, rec.scaleY * scMult, rec.scaleZ * scMult);
      _dummy.updateMatrix();
      this.crystalDebrisMesh.setMatrixAt(slot, _dummy.matrix);
      slot++;
    }

    this.crystalDebrisMesh.count = slot;
    this.crystalDebrisMesh.instanceMatrix.needsUpdate = true;
    this.debrisBirthAttr.needsUpdate = true;
  }

  _evaluateAtmosphereBillboards(timeSeconds) {
    const posSizeArr = this.particlePosSizeAttr.array;
    const metaArr = this.particleMetaAttr.array;
    let slot = 0;

    for (let i = 0; i < MAX_ATMOSPHERE_PARTICLES; i++) {
      const p = this.atmosphereRecords[i];
      const elapsed = timeSeconds - p.spawnTime;
      if (elapsed < 0 || elapsed >= p.life) continue;

      const u = elapsed / p.life;
      const dragFactor = p.drag > 0.05 ? (1.0 - Math.exp(-p.drag * elapsed)) / p.drag : elapsed;
      const swirlX = Math.sin(elapsed * 2.8 + p.seed * 19.0) * 0.14;
      const swirlZ = Math.cos(elapsed * 2.4 + p.seed * 13.0) * 0.14;

      const localX = p.offsetX + p.vx * dragFactor + swirlX;
      const localZ = p.offsetZ + p.vz * dragFactor + swirlZ;
      const wx = p.baseX + this.side.x * localX + this.direction.x * localZ;
      const wz = p.baseZ + this.side.z * localX + this.direction.z * localZ;
      const wy = p.baseY + p.offsetY + p.vy * elapsed;

      const size = lerp(p.startSize, p.endSize, smoothstep(0.0, 1.0, u));
      const o = slot * 4;
      posSizeArr[o + 0] = wx;
      posSizeArr[o + 1] = wy;
      posSizeArr[o + 2] = wz;
      posSizeArr[o + 3] = size;

      metaArr[o + 0] = u;
      metaArr[o + 1] = p.pType;
      metaArr[o + 2] = p.seed;
      metaArr[o + 3] = p.alphaScale;
      slot++;
    }

    for (let s = slot; s < this.atmosphereMesh.count; s++) {
      posSizeArr[s * 4 + 3] = 0;
      metaArr[s * 4 + 3] = 0;
    }

    this.atmosphereMesh.count = slot;
    this.particlePosSizeAttr.needsUpdate = true;
    this.particleMetaAttr.needsUpdate = true;
  }

  _evaluateGameplayHooks(timeSeconds, travelU) {
    this._hitstopScale = timeSeconds >= 0.675 && timeSeconds <= 0.720 ? 0.08 : 1.0;

    this._shakeOffset.set(0, 0, 0);
    if (timeSeconds >= 0.11 && timeSeconds < 0.64) {
      const rumble = 0.032 * Math.sin(timeSeconds * 75.0);
      this._shakeOffset.set(this.side.x * rumble, Math.abs(rumble) * 0.6, this.side.z * rumble);
    } else if (timeSeconds >= 0.64 && timeSeconds <= 1.28) {
      const tImp = timeSeconds - 0.64;
      const env = Math.exp(-tImp * 6.2) * 0.24;
      const osc = Math.sin(tImp * 54.0);
      const oscSide = Math.cos(tImp * 41.0);
      this._shakeOffset.set(
        (this.direction.x * osc + this.side.x * oscSide * 0.6) * env,
        Math.abs(osc) * env * 0.75,
        (this.direction.z * osc + this.side.z * oscSide * 0.6) * env
      );
    }

    if (timeSeconds >= 0.62 && !this._apexTriggered) {
      this._apexTriggered = true;
      this._pointAt(1.0, 0, _pos);
      if (typeof this.onApexImpact === 'function') {
        this.onApexImpact({
          impactPoint: _pos.clone(),
          direction: this.direction.clone(),
          timeSeconds,
        });
      }
    }

    if (this.enemyTargets.length > 0 && timeSeconds >= 0.12 && timeSeconds <= 1.45) {
      const frontDist = Math.min(this.castLength, Math.max(2.0, travelU * this.castLength + 1.5));
      for (const enemy of this.enemyTargets) {
        if (!enemy || !enemy.group || this._staggeredEnemies.has(enemy)) continue;
        const ex = enemy.group.position.x - this.origin.x;
        const ez = enemy.group.position.z - this.origin.z;
        const alongMeters = ex * this.direction.x + ez * this.direction.z;
        const latMeters = Math.abs(ex * this.side.x + ez * this.side.z);
        const hitRadius = alongMeters > this.castLength * 0.72 ? 4.2 : 2.4;

        if (alongMeters >= -0.8 && alongMeters <= frontDist && latMeters <= hitRadius) {
          this._staggeredEnemies.add(enemy);
          if (typeof enemy.play === 'function') {
            try {
              enemy.play('hit_A', { loop: false, fade: 0.06, timeScale: 0.95, force: true });
            } catch {
              // Ignore if clip missing
            }
          }
        }
      }
    }
  }

  getStats() {
    if (!this.active) {
      return {
        active: false,
        drawCalls: 0,
        activeSpikes: 0,
        activeDecals: 0,
        activeDebris: 0,
        activeParticles: 0,
      };
    }

    const bladeInstances =
      this.crystalMeshes[0].count + this.crystalMeshes[1].count + this.crystalMeshes[2].count;
    let drawCalls = 0;
    if (this.groundDecalMesh.count > 0) drawCalls++;
    for (let v = 0; v < CRYSTAL_VARIANTS; v++) {
      if (this.crystalMeshes[v].count > 0) drawCalls++;
    }
    if (this.crystalDebrisMesh.count > 0) drawCalls++;
    if (this.atmosphereMesh.count > 0) drawCalls++;

    return {
      active: true,
      age: Number(this.age.toFixed(3)),
      drawCalls,
      activeSpikes: bladeInstances,
      activeDecals: this.groundDecalMesh.count,
      activeDebris: this.crystalDebrisMesh.count,
      activeParticles: this.atmosphereMesh.count,
      hitstopScale: this._hitstopScale,
      noiseAtlasGenMs: this.noiseAtlas.userData.generationTimeMs || 0,
    };
  }

  clear() {
    this.active = false;
    this.age = 0;
    this._apexTriggered = false;
    this._shakeOffset.set(0, 0, 0);
    this._hitstopScale = 1.0;
    this.group.visible = false;

    this.groundDecalMesh.count = 0;
    for (let v = 0; v < CRYSTAL_VARIANTS; v++) {
      this.crystalMeshes[v].count = 0;
    }
    this.crystalDebrisMesh.count = 0;
    this.atmosphereMesh.count = 0;
  }

  dispose() {
    this.clear();
    this.groundDecalMesh.geometry.dispose();
    this.groundDecalMat.dispose();
    for (const mesh of this.crystalMeshes) {
      mesh.geometry.dispose();
    }
    this.crystalMat.dispose();
    this.crystalDebrisMesh.geometry.dispose();
    this.debrisMat.dispose();
    this.atmosphereMesh.geometry.dispose();
    this.atmosphereMat.dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

export function createFrostLanceSystem(options = {}) {
  return new FrostLanceSystem(options);
}
