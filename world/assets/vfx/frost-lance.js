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

export const FROST_LANCE_DEFAULTS = Object.freeze({
  // Cast & 4-Beat Choreography Timing
  range: 14.5, // metres
  speed: 26.0, // fracture front speed, m/s
  windupTime: 0.11, // Beat 1: cast wind-up & muzzle cryo-sigil (0.00s..0.11s)
  holdAfterImpact: 2.12, // Beat 3: standing glacier duration before Beat 4 withdrawal
  shatterShakeTime: 0.28, // pre-sink shudder duration
  sinkTime: 1.12, // Beat 4: sink & dissolve withdrawal duration (ends at ~4.2s)

  // Footprint Progression (Narrow at Caster -> Wide V-Canyon Wall at Apex)
  widthNear: 0.58, // half-width at caster's feet, metres
  width: 2.55, // half-width at far end, metres
  widthCurve: 0.82,
  spikeCount: 168, // 56 per variant: bold, chiseled glacier blades
  clumping: 1.25,
  scatter: 0.28,
  frontBias: 0.86,

  // Silhouette & Continuous Accelerating Height Ramp (0.58m -> 2.95m wall -> 3.65m Apex Crown)
  heightNear: 0.58, // ankle/shin-high at caster's feet, metres
  height: 2.95, // main wall blade height entering apex, metres
  heightCurve: 1.22, // smooth continuous ramp (no flat knee-high fence!)
  heightJitter: 0.22,
  crown: 0.38,
  peak: 1.24, // apex crown multiplier (2.95 * 1.24 -> ~3.65m bold cathedral spires that fit 100% in frame)
  peakWidth: 0.42, // broad pre-apex swell so mid-trail flows seamlessly into crown
  rubble: 0.25, // fraction of outer basal splinter shards
  rubbleScale: 0.38,

  // Sculpted 6-Faceted Broad-Shouldered Anime Glacier Blade Geometry
  radius: 0.64, // bold broadsword-like base radius so facets read crisply
  radiusJitter: 0.28,
  taper: 0.46, // broad faceted chisel shoulder tapering to sharp apex point (never needle-thin!)
  facets: 6, // 6-faceted hexagonal/bladed prism for high-contrast adjacent faces
  roughness: 0.18,
  bend: 0.52, // organic forward/outward blade sweep from base to tip
  bladeAspect: 0.62, // bladed cross-section flattening
  lean: 0.42, // radians leaning away from caster
  leanJitter: 0.32,
  twist: 1.0,

  // Spring-Overshoot Eruption Dynamics
  riseTime: 0.16, // seconds from buried to full height
  riseOvershoot: 0.26, // +26% violent elastic spring overshoot
  riseStagger: 0.042,
  settle: 0.44,
  birthFade: 0.40, // HDR birth flash duration

  // Cel-Refraction Palette ("Dark Before Bright" High-Contrast Glacier Palette)
  colorDeep: '#072247', // deep abyssal glacier sapphire core
  colorMid: '#155896', // rich cobalt-cerulean mid-refraction
  colorIce: '#4cd4ff', // luminous glacial cyan-aqua facet body
  colorRim: '#f0fcff', // crisp diamond-white specular & rime
  colorInk: '#061529', // dark cobalt anime silhouette edge
  colorScarDeep: '#081d38', // abyssal glacier-cobalt ground fissure trench
  colorScarMid: '#184b7c', // frozen cobalt-teal sub-crust
  colorScarVein: '#5ee4ff', // glowing electric-cyan fracture fault veins
  colorMistCrest: '#ebfbff', // lit top of rolling glacier mist
  colorMistShadow: '#42b8e8', // saturated icy cyan mist body
  shockRadius: 6.8, // apex frost-wave shock ring radius, metres
});

/* ------------------------------------------------------------------------- */
/* 1. Procedural 6-Faceted Chiseled Anime Glacier Blade Geometry             */
/*    Includes a buried basal root (`y = -0.26..0.0`) so tilted or           */
/*    overshooting crystals NEVER expose a flat bottom or float above ground.*/
/* ------------------------------------------------------------------------- */

const RING_HEIGHTS = [-0.55, 0.0, 0.22, 0.50, 0.76, 0.90];

function profileRadius(t, taper) {
  if (t < 0) {
    // Deep sub-surface root extends to y = -0.55 so even wide, steeply tilted short
    // rubble shards remain 100% buried below the ground plane!
    return 0.75 + 0.25 * (1.0 + t / 0.55);
  }
  return taper + (1 - taper) * Math.pow(1 - t, 1.12);
}

export function createGlacierCrystalGeometry({
  seed = 1,
  sides = 6,
  taper = 0.26,
  roughness = 0.18,
  bend = 0.44,
  bladeAspect = 0.58,
} = {}) {
  const facets = Math.max(5, Math.round(sides));
  const tipRadius = clamp(taper, 0.08, 0.85);

  const bendAngle = hash11(seed * 1.77) * TAU;
  const bendX = Math.cos(bendAngle);
  const bendZ = Math.sin(bendAngle);
  const perpX = -bendZ;
  const perpZ = bendX;

  const axisOffset = (t) => (t <= 0 ? 0 : bend * 0.42 * Math.pow(t, 1.55));

  const angles = [];
  for (let i = 0; i < facets; i++) {
    const jitter = (hash11(seed * 3.13 + i * 7.7) - 0.5) * (TAU / facets) * 0.34 * roughness * 2.0;
    angles.push((i / facets) * TAU + jitter);
  }

  const rings = RING_HEIGHTS.map((t, ringIndex) => {
    const baseR = profileRadius(t, tipRadius) * 0.5;
    const drift = axisOffset(t);
    const y =
      t +
      (hash11(seed * 5.9 + ringIndex * 2.3) - 0.5) *
        0.035 *
        roughness *
        (t > 0.05 && t < 0.85 ? 1 : 0);

    return angles.map((angle, i) => {
      const tPos = Math.max(0, t);
      const wobble =
        1 +
        (hash11(seed * 11.1 + ringIndex * 13.7 + i * 3.9) - 0.5) *
          roughness *
          0.95 *
          (0.30 + 0.70 * tPos);
      const r = Math.max(0.01, baseR * wobble);
      const ca = Math.cos(angle) * r;
      const sa = Math.sin(angle) * r * bladeAspect;
      const lx = ca * bendX + sa * perpX + bendX * drift;
      const lz = ca * bendZ + sa * perpZ + bendZ * drift;
      return [lx, y, lz];
    });
  });

  const apexDrift = axisOffset(1.0);
  const apex = [
    bendX * apexDrift + (hash11(seed * 17.3) - 0.5) * 0.04 * roughness,
    1.0,
    bendZ * apexDrift + (hash11(seed * 19.7) - 0.5) * 0.04 * roughness,
  ];
  const floorCentre = [0, RING_HEIGHTS[0], 0];

  const positions = [];
  const facetUvs = [];

  const pushTri = (pA, pB, pC, uvA, uvB, uvC) => {
    positions.push(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], pC[0], pC[1], pC[2]);
    facetUvs.push(uvA[0], uvA[1], uvA[2], uvB[0], uvB[1], uvB[2], uvC[0], uvC[1], uvC[2]);
  };

  // Constant per-facet tonal offset (all 3 vertices of a triangle get the EXACT
  // same `fTone` in `aFacetUv.z` so it NEVER interpolates across integer bands!).
  const facetTones = [-0.22, 0.18, -0.10, 0.24, -0.18, 0.12, -0.14, 0.20];

  for (let ring = 0; ring < rings.length - 1; ring++) {
    const lower = rings[ring];
    const upper = rings[ring + 1];
    const v0 = clamp(RING_HEIGHTS[ring], 0.0, 1.0);
    const v1 = clamp(RING_HEIGHTS[ring + 1], 0.0, 1.0);

    for (let i = 0; i < facets; i++) {
      const j = (i + 1) % facets;
      const fTone = facetTones[i % facetTones.length];
      pushTri(
        lower[i],
        lower[j],
        upper[i],
        [0.0, v0, fTone],
        [1.0, v0, fTone],
        [0.0, v1, fTone]
      );
      pushTri(
        lower[j],
        upper[j],
        upper[i],
        [1.0, v0, fTone],
        [1.0, v1, fTone],
        [0.0, v1, fTone]
      );
    }
  }

  const top = rings[rings.length - 1];
  const base = rings[0];
  const vTop = RING_HEIGHTS[rings.length - 1];
  for (let i = 0; i < facets; i++) {
    const j = (i + 1) % facets;
    // Tip chisel facets get a constant +0.16 specular lift across the entire triangle
    const fToneTip = facetTones[i % facetTones.length] + 0.16;
    pushTri(
      top[i],
      top[j],
      apex,
      [0.0, vTop, fToneTip],
      [1.0, vTop, fToneTip],
      [0.5, 1.0, fToneTip]
    );
    pushTri(
      floorCentre,
      base[j],
      base[i],
      [0.5, 0.0, -0.2],
      [1.0, 0.0, -0.2],
      [0.0, 0.0, -0.2]
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFacetUv', new THREE.Float32BufferAttribute(facetUvs, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Chunky diamond-octahedral ice splinter geometry for flying shards & apex burst
 * (centered around origin so shards tumble naturally like shattered glacier glass).
 */
function createDebrisCrystalGeometry() {
  const geo = createGlacierCrystalGeometry({
    seed: 19.4,
    sides: 6,
    taper: 0.58,
    roughness: 0.34,
    bend: 0.08,
    bladeAspect: 0.78,
  });
  geo.translate(0, -0.32, 0);
  geo.scale(1.15, 0.62, 1.05);
  geo.computeBoundingSphere();
  return geo;
}

/* ------------------------------------------------------------------------- */
/* 2. Custom Shaders (All Driven by Pre-Baked 128x128 RGBA NoiseAtlas)       */
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

      // Sample multi-scale snow & frost crust height in world space (like reference GroundDecals.js)
      float sampleFrostCrustHeight(vec2 wPos) {
        vec4 n1 = texture2D(uNoiseAtlas, wPos * 0.14);
        vec4 n2 = texture2D(uNoiseAtlas, wPos * 0.37 + vec2(0.31, 0.57));
        return n1.b * 0.55 + n1.g * 0.30 + n2.r * 0.15;
      }

      void main() {
        float age = clamp(vMeta.x, 0.0, 1.0);
        float kind = vMeta.y;
        float seed = vMeta.z;
        float intensity = vMeta.w;
        if (intensity <= 0.001 || age >= 1.0) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;

        vec2 wPos = vWorldPos.xz;
        vec4 nWorld = texture2D(uNoiseAtlas, wPos * 0.18);
        vec4 nDetail = texture2D(uNoiseAtlas, wPos * 0.42 + vec2(0.23, 0.67));
        vec4 nLocal = texture2D(uNoiseAtlas, vUv * 1.15 + vec2(seed * 0.53, seed * 0.29));

        vec3 col = vec3(0.0);
        float alpha = 0.0;

        if (kind < 0.5) {
          // =================================================================
          // KIND 0: SEAMLESS WORLD-SPACE GLACIER CORRIDOR & APEX BASIN
          // Evaluated 100% in world space so there are ZERO concentric bullseye
          // rings or scalloped seams!
          // =================================================================
          vec2 rel = wPos - uCastOrigin.xz;
          float alongM = dot(rel, uCastDir.xz);
          float latM = dot(rel, uCastSide.xz);

          float frontM = uTravelFront * uCastLength;
          float frontWarp = (nWorld.b - 0.5) * 0.85 + (nDetail.g - 0.5) * 0.40;
          if (alongM > frontM + 1.15 + frontWarp || alongM < -1.15) discard;

          float s = clamp(alongM / max(1.0, uCastLength), 0.0, 1.0);
          float corridorHalfW = mix(uWidthNear, uWidthFar, pow(s, uWidthCurve)) * 1.42;

          // Apex impact basin expansion around the end of the corridor
          vec2 apexCenter = uCastOrigin.xz + uCastDir.xz * uCastLength;
          float apexDist = length(wPos - apexCenter);
          float apexRadius = uWidthFar * 1.72 * smoothstep(0.50, 0.72, uTravelFront);

          // Organic domain-warped normalized distance from the glacial spine/basin
          float edgeNoise = (nWorld.b - 0.5) * 0.34 + (nDetail.g - 0.5) * 0.20 + (nDetail.r - 0.5) * 0.10;
          float dCorridor = abs(latM) / max(0.45, corridorHalfW);
          float backCap = max(0.0, (-alongM - 0.35) / 1.05);
          float frontCap = max(0.0, (alongM - frontM) / 1.15);
          float dLine = sqrt(dCorridor * dCorridor + backCap * backCap + frontCap * frontCap);
          float dBasin = apexRadius > 0.1 ? (apexDist / apexRadius) : 99.0;

          float dNorm = min(dLine, dBasin) + edgeNoise * 0.30;
          if (dNorm > 1.0) discard;

          // 3D Snow/Rime Relief Normal via finite differences on NoiseAtlas
          float eps = 0.16;
          float hC = sampleFrostCrustHeight(wPos);
          float hX = sampleFrostCrustHeight(wPos + vec2(eps, 0.0));
          float hZ = sampleFrostCrustHeight(wPos + vec2(0.0, eps));
          vec3 snowN = normalize(vec3((hC - hX) / eps * 0.35, 1.0, (hC - hZ) / eps * 0.35));
          float snowLambert = clamp(dot(snowN, normalize(uSunDir)), 0.0, 1.0);
          float snowShade = 0.54 + 0.46 * pow(snowLambert, 0.80);

          // 3 Zones from center to outer edge:
          // 1) Inner Abyssal Glacial Chasm Trench (dNorm < 0.42)
          // 2) Mid Frozen Cobalt-Cyan Ice Slab & Branching Voronoi Fault Veins (0.28 .. 0.62)
          // 3) Wide Outer Crystalline Snow-Rime Bed (0.42 .. 1.00) -> surrounds all outer rubble spikes!
          float trenchMask = 1.0 - smoothstep(0.16, 0.44, dNorm);
          float slabMask = smoothstep(0.12, 0.32, dNorm) * (1.0 - smoothstep(0.50, 0.72, dNorm));
          float rimeBankMask = smoothstep(0.32, 0.56, dNorm) * (1.0 - smoothstep(0.80, 1.00, dNorm));

          // Branching tectonic ice fault cracks inside the trench & slab
          float crackPrimary = smoothstep(0.65, 0.90, nDetail.r);
          float crackSecondary = smoothstep(0.70, 0.93, nWorld.r);
          float veinMask = clamp(crackPrimary * 0.88 + crackSecondary * 0.68, 0.0, 1.0) *
                           (1.0 - smoothstep(0.48, 0.76, dNorm));

          // Clean bright snow-rime color shaded by 3D relief normal (never muddy grey!)
          vec3 snowBase = mix(mix(uColorIce, uColorRim, 0.52), uColorRim, snowShade);
          vec3 slabCol = mix(uColorScarMid, uColorIce, smoothstep(0.22, 0.75, hC));
          vec3 trenchCol = mix(uColorInk, uColorScarDeep, smoothstep(0.15, 0.75, nWorld.g));

          col = snowBase;
          col = mix(col, slabCol, clamp(slabMask + trenchMask, 0.0, 1.0));
          col = mix(col, trenchCol, trenchMask * 0.90);
          col = mix(col, snowBase, rimeBankMask * (0.76 + 0.24 * hC));

          // Glowing cyan tectonic fault lines inside the frozen chasm
          float freshBoost = (1.0 - smoothstep(0.0, 0.55, age)) * 0.65 + 0.35;
          vec3 veinHdr = mix(uColorScarVein, uColorRim, 0.45) * (1.40 + 0.85 * freshBoost * (0.5 + uGlowBoost));
          col = mix(col, veinHdr, veinMask * 0.90);

          // Crystalline pinpoint glints on the rime crust
          float glint = smoothstep(0.83, 0.97, nDetail.a) * (rimeBankMask + slabMask * 0.5);
          col += uColorRim * glint * (1.0 + 0.55 * uGlowBoost);

          // Soft powdery grain falloff at the outer edge (like GroundDecals.js FROST)
          float cover = smoothstep(1.00, 0.44, dNorm);
          float powderEdge = smoothstep(0.10, 0.54, cover * (0.42 + 0.72 * hC));
          float quadFeather = smoothstep(1.0, 0.82, max(abs(p.x), abs(p.y)));
          float fadeOut = 1.0 - smoothstep(0.76, 1.0, age);
          alpha = clamp(powderEdge * mix(0.88, 0.98, trenchMask + veinMask * 0.5), 0.0, 1.0) *
                  quadFeather * fadeOut * intensity;

        } else if (kind < 1.5) {
          // =================================================================
          // KIND 1: MUZZLE CRYO-FROST RING (Soft Circular Arcane Frost Halo)
          // =================================================================
          float uExp = 1.0 - clamp(age / 0.14, 0.0, 1.0);
          float expand = 1.0 - uExp * uExp * uExp * uExp;
          float fadeOut = 1.0 - smoothstep(0.35, 1.0, age);
          float qR = r / max(0.10, expand);
          if (qR > 1.0) discard;

          float ang = atan(p.y, p.x) + uTime * 1.4;
          float outerRing = smoothstep(0.045, 0.0, abs(qR - 0.82 + (nLocal.b - 0.5) * 0.05));
          float innerRing = smoothstep(0.032, 0.0, abs(qR - 0.48));
          float starSpokes = smoothstep(0.92, 0.995, cos(ang * 6.0)) * smoothstep(0.84, 0.20, qR);
          float frostCrack = smoothstep(0.72, 0.94, nLocal.r) * smoothstep(0.82, 0.22, qR);

          float runeMask = clamp(outerRing + innerRing * 0.85 + starSpokes * 0.85 + frostCrack * 0.65, 0.0, 1.0);
          if (runeMask < 0.02) discard;

          vec3 hdrRune = mix(uColorScarVein, uColorRim, 0.62) * (1.55 + 0.80 * uGlowBoost);
          col = hdrRune;
          alpha = runeMask * 0.88 * fadeOut * intensity;

        } else if (kind < 2.5) {
          // =================================================================
          // KIND 2: JAGGED BRANCHING TECTONIC FISSURE SPEARHEAD
          // =================================================================
          float fadeOut = 1.0 - smoothstep(0.62, 1.0, age);
          float zigZag = (nWorld.r - 0.5) * 0.52 + (nDetail.g - 0.5) * 0.34;
          float taperTip = smoothstep(0.95, -0.65, p.y);
          float warpedX = p.x * 1.45 - zigZag * (0.45 + 0.55 * abs(p.y));

          float mainFault = smoothstep(0.090 * taperTip + 0.014, 0.0, abs(warpedX)) *
                            smoothstep(0.95, 0.62, abs(p.y));
          vec2 branchUv = vec2(warpedX * 1.8 + p.y * 0.85, p.y * 2.2 - abs(warpedX) * 1.2);
          float branchSample = texture2D(uNoiseAtlas, branchUv * 0.55 + vec2(seed)).r;
          float branches = smoothstep(0.70, 0.94, branchSample) *
                           smoothstep(0.85, 0.15, abs(warpedX)) *
                           smoothstep(0.92, 0.10, r);

          float fissureMask = clamp(mainFault + branches * 0.88, 0.0, 1.0);
          float darkTrench = smoothstep(0.22, 0.02, abs(warpedX)) * smoothstep(0.90, 0.15, r) * 0.68;

          vec3 hdrCrack = mix(uColorScarVein, uColorRim, smoothstep(0.35, 0.85, mainFault)) *
                          (1.60 + 0.85 * uGlowBoost);
          col = mix(uColorScarDeep, hdrCrack, fissureMask);
          alpha = clamp(darkTrench + fissureMask * 0.96, 0.0, 1.0) * fadeOut * intensity;

        } else {
          // =================================================================
          // KIND 3: CLEAN SONIC FROST-NOVA SHOCKWAVE & RADIAL ICE CRACKS
          // (Like reference GroundDecals.js SHOCKWAVE + CRACK: clean expanding
          // sonic frost ring + sharp radial fracture veins, zero cartoon zig-zag
          // or dirty grey mud on the sand!)
          // =================================================================
          float fadeOut = 1.0 - smoothstep(0.48, 1.0, age);
          float front = mix(0.22, 0.94, pow(age, 0.50));

          // Subtle organic ripple distortion (never a 10-pointed cartoon star!)
          float rippleWarp = (nLocal.b - 0.5) * 0.045 + (nWorld.g - 0.5) * 0.035;
          float d = (r + rippleWarp) / max(0.12, front);
          if (d > 1.06 || d < 0.15) discard;

          // Razor-crisp expanding outer shockwave ring + inner sonic frost ring
          float outerRing = smoothstep(0.036, 0.0, abs(d - 0.94));
          float innerRing = smoothstep(0.028, 0.0, abs(d - 0.66)) * 0.82;

          // Branching tectonic radial frost fractures inside the shockwave radius
          float radialCracks = smoothstep(0.71, 0.95, nDetail.r) *
                               smoothstep(0.96, 0.52, d) * (1.0 - smoothstep(0.48, 0.20, d));
          float fineVeins = smoothstep(0.76, 0.96, nWorld.r) *
                            smoothstep(0.94, 0.64, d) * (1.0 - smoothstep(0.64, 0.35, d));

          float crestMask = clamp(outerRing + innerRing + radialCracks * 0.85 + fineVeins * 0.65, 0.0, 1.0);
          float softFrostGlow = smoothstep(0.96, 0.82, d) * (1.0 - smoothstep(0.82, 0.58, d)) * 0.28;

          // Pure luminous glacial cyan to diamond white (never dark grey!)
          vec3 hdrNova = mix(uColorIce, uColorRim, smoothstep(0.20, 0.82, outerRing + innerRing + radialCracks * 0.5)) *
                         (1.65 + 0.85 * uGlowBoost);
          col = hdrNova;
          alpha = clamp(softFrostGlow + crestMask * 0.92, 0.0, 1.0) * fadeOut * intensity;
        }

        if (alpha < 0.005) discard;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/**
 * Draw Calls 2..4 & 5 Shader: High-Contrast 4-Band Cel-Shaded Anime Glacier Blades
 * & 3D Diamond Ice Splinters.
 * - Uses screen-space geometric face derivatives (dFdx/dFdy) so every polygon
 *   facet is tack-sharp and adjacent faces have unmistakable tonal separation.
 * - Zero horizontal tip stripe artifacts.
 */
function createCelGlacierMaterial(noiseAtlas, sharedUniforms, corridorUniforms, { isDebris = false } = {}) {
  return new THREE.ShaderMaterial({
    name: isDebris ? 'FrostLanceDebrisCrystalMaterial' : 'FrostLanceBladeCrystalMaterial',
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uGlowBoost: sharedUniforms.uGlowBoost,
      uCastOrigin: corridorUniforms.uCastOrigin,
      uColorDeep: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorDeep) },
      uColorMid: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorMid) },
      uColorIce: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorIce) },
      uColorRim: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorRim) },
      uColorInk: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorInk) },
      uColorScarVein: { value: new THREE.Color(FROST_LANCE_DEFAULTS.colorScarVein) },
      uIsDebris: { value: isDebris ? 1.0 : 0.0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aBirth;
      attribute vec3 aFacetUv;

      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vFacetUv;
      varying float vSeed;
      varying float vBirth;

      void main() {
        vLocalPos = position;
        vFacetUv = aFacetUv;
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
      uniform vec3 uColorDeep;
      uniform vec3 uColorMid;
      uniform vec3 uColorIce;
      uniform vec3 uColorRim;
      uniform vec3 uColorInk;
      uniform vec3 uColorScarVein;
      uniform float uIsDebris;

      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vFacetUv;
      varying float vSeed;
      varying float vBirth;

      void main() {
        float alphaFade = vBirth < 0.0 ? clamp(1.0 + vBirth, 0.0, 1.0) : 1.0;
        float birthFlash = max(0.0, vBirth);
        if (alphaFade <= 0.01) discard;

        // Enforce tack-sharp flat polygon facet normals via screen-space derivatives
        vec3 N = normalize(vWorldNormal);
        if (!gl_FrontFacing) N = -N;
        vec3 flatN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
        if (dot(flatN, N) < 0.0) flatN = -flatN;
        N = normalize(mix(N, flatN, 0.88));

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);
        // Secondary cross-rim light direction so adjacent facets always separate in tone
        vec3 sideL = normalize(vec3(-L.z, 0.35, L.x));

        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float ndl = dot(N, L) * 0.5 + 0.5;
        float nds = dot(N, sideL) * 0.5 + 0.5;
        float h = clamp(vLocalPos.y + uIsDebris * 0.38, 0.0, 1.0);

        // Diagonal crystal cleavage UVs (sheared along crystal axis)
        vec2 diagUv = vec2(
          vFacetUv.x * 0.32 + h * 0.52 + vSeed * 0.23,
          h * 0.62 - vFacetUv.x * 0.24 + vSeed * 0.41
        );
        vec4 nDiag = texture2D(uNoiseAtlas, diagUv);
        vec4 nBase = texture2D(uNoiseAtlas, vec2(vFacetUv.x * 0.45 + vSeed * 0.17, h * 0.85));

        // 1. Optical Thickness & 4-Band Anime Cel-Facet Shading:
        //    - Looking head-on into a facet (ndv high) sees deep into the sapphire core (uColorDeep),
        //      preventing center-screen whiteout in over-the-shoulder view!
        //    - Constant per-facet vFacetUv.z (-0.22..+0.40) + ndl + nds separates every adjacent
        //      polygon face into a distinct cel band (Deep Sapphire -> Cobalt-Cerulean -> Glacial Cyan -> Specular White).
        float facetTone = vFacetUv.z; // constant across each triangle!
        float facetLight = ndl * 0.58 + nds * 0.22 + (1.0 - ndv) * 0.28 + facetTone;

        float bandCerulean = smoothstep(0.34, 0.40, facetLight);
        float bandCyan = smoothstep(0.58, 0.64, facetLight);
        float bandSpecular = smoothstep(0.82, 0.88, facetLight);

        // Deep internal thickness gradient (richer sapphire in lower/middle core, brighter near apex tip)
        float coreThickness = clamp(ndv * 0.85 * (1.0 - smoothstep(0.65, 0.98, h) * 0.45), 0.0, 1.0);
        vec3 deepCore = mix(uColorMid, uColorDeep, coreThickness);

        vec3 body = mix(uColorDeep * 0.88, deepCore, bandCerulean);
        body = mix(body, uColorIce, bandCyan * (0.92 - coreThickness * 0.28));
        body = mix(body, uColorRim, bandSpecular * 0.82);

        // Smooth apex tip frost highlight (continuous smoothstep, ZERO horizontal stripes!)
        float tipFrost = smoothstep(0.76, 0.99, h) * (0.55 + 0.45 * (1.0 - ndv));
        body = mix(body, uColorRim, tipFrost * 0.72);

        // 2. Diagonal Internal Quartz Cleavage Planes & Fracture Veins
        float cleavage = smoothstep(0.66, 0.90, nDiag.g);
        float deepPocket = smoothstep(0.20, 0.50, nDiag.b) * (1.0 - bandSpecular);
        float crackStreak = smoothstep(0.75, 0.94, nDiag.r) * smoothstep(0.12, 0.88, h);

        body = mix(body, uColorDeep * 0.72, deepPocket * 0.42);
        body = mix(body, uColorIce, cleavage * 0.34);
        body = mix(body, uColorRim, crackStreak * 0.46);

        // 3. World-Space Ground-Hugging Basal Snow-Rime (computed from world height above ground
        //    so tilted crystals NEVER show a diagonal/floating white band in mid-air!)
        float worldAboveGround = max(0.0, vWorldPos.y - uCastOrigin.y);
        float baseRime = smoothstep(0.36, 0.0, worldAboveGround) *
                         (0.55 + 0.45 * nBase.b) * (1.0 - uIsDebris * 0.90);
        body = mix(body, uColorRim, clamp(baseRime * 0.82, 0.0, 1.0));

        // 4. Razor-Sharp Vertical Crystalline Ridge Bevels (anti-aliased via fwidth, NO horizontal ring!)
        float edgeDistU = min(vFacetUv.x, 1.0 - vFacetUv.x);
        float fwU = max(fwidth(vFacetUv.x), 0.007);
        float ridgeLine = (1.0 - smoothstep(fwU * 0.50, fwU * 1.85, edgeDistU)) *
                          smoothstep(0.06, 0.24, worldAboveGround);
        body = mix(body, uColorRim, ridgeLine * 0.86);

        // 5. Inner Electric-Cyan Fresnel + Crisp Dark Cobalt Anime Silhouette Ink Rim (#061529)
        float innerCyanRim = smoothstep(0.46, 0.20, ndv) * (1.0 - smoothstep(0.20, 0.12, ndv));
        float cobaltInkRim = 1.0 - smoothstep(0.14, 0.24, ndv);
        body = mix(body, uColorScarVein, innerCyanRim * 0.74);

        float inkWeight = cobaltInkRim * 0.94 * (1.0 - baseRime * 0.40);
        body = mix(body, uColorInk, inkWeight);

        // 6. Saturated Bioluminescent Cyan Emissive & Specular Glints
        //    In evening/twilight (uGlowBoost high), boost facet contrast so adjacent faces
        //    stay rich sapphire vs glowing cyan instead of chalky pastel!
        vec2 glintUv = vWorldPos.xz * 1.45 + vec2(uTime * 0.18, vSeed * 0.41);
        float glintSample = texture2D(uNoiseAtlas, glintUv).a;
        float glint = smoothstep(0.84, 0.97, glintSample) * (0.35 + 0.65 * (1.0 - ndv));

        float selectiveMask = clamp(
          ridgeLine * 0.85 +
          crackStreak * 0.78 +
          innerCyanRim * 0.75 +
          bandCyan * 0.38 +
          smoothstep(0.82, 0.99, h) * 0.52,
          0.0,
          1.0
        ) * (1.0 - cobaltInkRim * 0.92);

        vec3 emissive = vec3(0.0);
        emissive += uColorScarVein * selectiveMask * (0.20 + 0.92 * uGlowBoost);
        emissive += uColorDeep * (1.0 - bandCyan) * uGlowBoost * 0.22 * (1.0 - cobaltInkRim);
        // Birth flash energizes bevels, chisel tip, and cleavage streaks
        emissive += mix(uColorScarVein, uColorRim, 0.48) * birthFlash * (0.16 + 1.20 * selectiveMask);
        // Pinpoint surface diamond glints
        emissive += uColorRim * glint * (1.10 + 0.75 * uGlowBoost);

        // Soft Reinhard ceiling so bloom never blows out the crystal into a white blob
        emissive /= (1.0 + emissive * 0.30);

        vec3 finalColor = body * mix(0.74, 1.02, uDaylight) + emissive;
        float finalAlpha = clamp((0.96 + 0.04 * (1.0 - ndv)) * alphaFade, 0.0, 1.0);

        gl_FragColor = vec4(finalColor, finalAlpha);
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
          // PTYPE 0: GROUND-HUGGING COLD GLACIER VAPOR (Pure smooth FBM)
          // =================================================================
          vec2 nUv = vUv * 0.34 + vec2(seed * 0.43 + age * 0.09, seed * 0.71);
          float b = texture2D(uNoiseAtlas, nUv).b;

          float radialSoft = exp(-r * r * 3.0) * (1.0 - r * r);
          float cloudShape = radialSoft * (0.55 + 0.45 * b);
          float fadeIn = smoothstep(0.0, 0.16, age);
          float fadeOut = 1.0 - smoothstep(0.54, 1.0, age);

          float topLit = smoothstep(-0.35, 0.45, p.y + (b - 0.5) * 0.25);
          col = mix(uColorMistShadow, uColorMistCrest, topLit) * (1.05 + 0.35 * uGlowBoost);
          alpha = cloudShape * fadeIn * fadeOut * alphaScale;

        } else if (pType < 1.5) {
          // =================================================================
          // PTYPE 1: TWINKLING 4-POINT ANIME STAR DIAMOND GLINTS
          // =================================================================
          float fadeIn = smoothstep(0.0, 0.08, age);
          float fadeOut = 1.0 - smoothstep(0.58, 1.0, age);
          float twinkle = 0.72 + 0.28 * sin(uTime * 19.0 + seed * 37.0);

          vec2 ap = abs(p);
          float rayH = exp(-ap.y * 17.0) * exp(-ap.x * 2.5);
          float rayV = exp(-ap.x * 17.0) * exp(-ap.y * 2.5);
          vec2 diag = abs(vec2(p.x + p.y, p.x - p.y)) * 0.70710678;
          float rayD = (exp(-diag.y * 25.0) * exp(-diag.x * 5.2) +
                        exp(-diag.x * 25.0) * exp(-diag.y * 5.2)) * 0.50;
          float core = smoothstep(0.28, 0.0, r);
          float starShape = clamp((rayH + rayV + rayD + core * 1.25) * twinkle, 0.0, 1.0);

          float halo = smoothstep(0.68, 0.15, r) * 0.42;
          alpha = clamp(max(starShape, halo * smoothstep(0.08, 0.35, starShape + halo)), 0.0, 1.0) *
                  fadeIn * fadeOut * alphaScale;

          vec3 hdrStar = mix(uColorIce, uColorRim, smoothstep(0.20, 0.70, starShape)) *
                         (1.85 + 0.95 * uGlowBoost);
          col = mix(uColorInk, hdrStar, smoothstep(0.14, 0.48, starShape));

        } else {
          // =================================================================
          // PTYPE 2: CRISP 8-POINT ANIME IMPACT STARBURST (Zero vertical bullseye circles!)
          // =================================================================
          float fadeOut = 1.0 - smoothstep(0.18, 1.0, age);
          vec2 ap = abs(p);
          vec2 diag = abs(vec2(p.x + p.y, p.x - p.y)) * 0.70710678;
          float rays = exp(-ap.y * 22.0) * exp(-ap.x * 2.4) +
                       exp(-ap.x * 22.0) * exp(-ap.y * 2.4) +
                       (exp(-diag.y * 26.0) * exp(-diag.x * 3.2) +
                        exp(-diag.x * 26.0) * exp(-diag.y * 3.2)) * 0.75;
          float core = smoothstep(0.26, 0.0, r);
          float starMask = clamp(rays + core * 1.15, 0.0, 1.0);
          float halo = smoothstep(0.58, 0.08, r) * 0.32;

          vec3 hdrBurst = mix(uColorIce, uColorRim, 0.68) * (1.85 + 0.85 * uGlowBoost);
          col = mix(uColorInk, hdrBurst, smoothstep(0.12, 0.45, starMask));
          alpha = clamp(max(starMask, halo * smoothstep(0.08, 0.35, starMask + halo)), 0.0, 1.0) *
                  fadeOut * alphaScale;
        }

        if (alpha < 0.005) discard;
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
      p.life = 1.90 + hash11(s + 4.3) * 1.10;
      p.along = u;
      p.lateral = signedHash(s + 5.9) * (isApexMist ? 0.68 : 0.42);
      p.offsetX = signedHash(s + 7.1) * 0.22;
      p.offsetY = 0.16 + hash11(s + 8.7) * (isApexMist ? 0.48 : 0.24);
      p.offsetZ = signedHash(s + 10.3) * 0.22;
      p.vx = signedHash(s + 11.9) * 0.28;
      p.vy = 0.08 + hash11(s + 13.1) * 0.14;
      p.vz = signedHash(s + 14.7) * 0.28;
      p.drag = 1.75;
      const baseSz = lerp(0.95, 2.35, u) * (0.85 + 0.30 * hash11(s + 16.3));
      p.startSize = baseSz * 0.55;
      p.endSize = baseSz * 1.32;
      p.alphaScale = isApexMist ? 0.48 + 0.16 * hash11(s + 17.9) : 0.38 + 0.14 * hash11(s + 17.9);
      p.seed = hash11(s + 19.1);
    }

    // 4b. 110 Twinkling 4-Point Anime Star Diamond Glints (`pType = 1`)
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
      p.life = isMuzzleStar ? 0.52 : 1.15 + hash11(s + 3.7) * 0.85;
      p.along = u;
      p.lateral = signedHash(s + 5.1) * (isMuzzleStar ? 0.35 : 0.76);
      p.offsetX = signedHash(s + 6.7) * 0.30;
      p.offsetY = isMuzzleStar
        ? 0.62 + hash11(s + 8.3) * 0.70
        : 0.22 + hash11(s + 8.3) * localEnvelopeH * (isApexStar ? 1.05 : 0.78);
      p.offsetZ = signedHash(s + 9.9) * 0.30;
      p.vx = signedHash(s + 11.3) * 0.95;
      p.vy = 0.65 + hash11(s + 12.9) * (isApexStar ? 1.45 : 0.75);
      p.vz = signedHash(s + 14.5) * 0.95;
      p.drag = 1.25;
      const starSz = (isMuzzleStar ? 0.42 : 0.30 + 0.28 * hash11(s + 16.1)) * lerp(0.82, 1.32, u);
      p.startSize = starSz;
      p.endSize = starSz * 0.40;
      p.alphaScale = 0.94;
      p.seed = hash11(s + 17.7);
    }

    // 4c. 1 Staff-Tip Arcane Cryo-Starburst (`pIdx = 206`) + 3 Apex Impact Halo Starbursts
    //     (Placed slightly behind the target at `along = 1.03` so the flash frames the
    //     Skeleton from behind rather than washing out in front of his face!)
    if (pIdx < MAX_ATMOSPHERE_PARTICLES) {
      const p = this.atmosphereRecords[pIdx++];
      p.pType = 2;
      p.spawnTime = 0.03;
      p.life = 0.26;
      p.along = 0.0;
      p.lateral = 0;
      p.offsetX = 0.0;
      p.offsetY = 1.02;
      p.offsetZ = -0.12;
      p.vx = 0;
      p.vy = 0.1;
      p.vz = 0.4;
      p.drag = 1.5;
      p.startSize = 0.98;
      p.endSize = 1.60;
      p.alphaScale = 0.95;
      p.seed = 0.33;
    }

    for (let b = 0; pIdx < MAX_ATMOSPHERE_PARTICLES; b++, pIdx++) {
      const p = this.atmosphereRecords[pIdx];
      p.pType = 2;
      p.spawnTime = 0.56 + b * 0.05;
      p.life = 0.24; // Crisp impact flash at t = 0.56..0.80s (peaks in shot 03, gone by shot 05!)
      p.along = 1.04;
      p.lateral = (b - 1) * 0.16;
      p.offsetX = 0.0;
      p.offsetY = 1.55 + b * 0.35;
      p.offsetZ = 0.35;
      p.vx = 0;
      p.vy = 0.35;
      p.vz = 0;
      p.drag = 1.8;
      p.startSize = 1.65 + b * 0.30;
      p.endSize = 3.10 + b * 0.40;
      p.alphaScale = 0.82 - b * 0.14;
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
      // Express directly in the spell's `(direction, side)` orthonormal basis:
      // `angle = 0` -> straight downrange (`+direction`, behind target)
      // `angle = -PI/2` -> left flank (`-side`)
      // `angle = +PI/2` -> right flank (`+side`)
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

    h *= 1.0 + record.heightJitter * c.heightJitter;
    if (record.rubble) {
      h *= c.rubbleScale;
    }

    return Math.max(0.22, h);
  }

  _spikeRadius(record) {
    const c = this.config;
    const grow = lerp(0.72, 1.25, Math.pow(saturate(record.along), 0.58));
    const jitter = 1.0 + record.radiusJitter * c.radiusJitter * 0.45;
    const tierBoost =
      record.tier === 'apexCrown' && !record.rubble
        ? 1.24
        : record.tier === 'flankWall'
          ? 1.08
          : record.rubble
            ? 1.28
            : 0.92;
    return Math.max(0.10, c.radius * grow * jitter * tierBoost);
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
    const spring = Math.sin(after * 16.5) * Math.exp(-after / Math.max(0.06, c.settle));
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

    // 1. Push 6 Butt-Joined World-Space Glacial Corridor Segments (`kind = 0`)
    //    Because `decalGeo` has half-size 1 (`PlaneGeometry(2,2)`), setting `rZ = segHalfLen`
    //    makes adjacent segments meet edge-to-edge without overlapping alpha seams!
    const scarFade = 1.0 - smoothstep(0.35, 1.0, retractU);
    const segCount = this.scarPatchRecords.length;
    const segHalfLen = (this.castLength / segCount) * 0.52;

    for (let i = 0; i < segCount; i++) {
      const seg = this.scarPatchRecords[i];
      if (timeSeconds < seg.spawnTime) continue;

      const segElapsed = timeSeconds - seg.spawnTime;
      const segLife = this.totalDuration - seg.spawnTime;
      const segAge = clamp(segElapsed / Math.max(0.2, segLife), 0.0, 0.999);

      const isLast = i === segCount - 1;
      const rX = c.width * (isLast ? 2.15 : 1.85);
      const rZ = isLast ? segHalfLen * 2.10 : segHalfLen * 1.06;

      _dummy.position.set(seg.wx, seg.wy, seg.wz);
      _dummy.quaternion.set(seg.qx, seg.qy, seg.qz, seg.qw);
      _dummy.scale.set(rX, 1, rZ);
      _dummy.updateMatrix();

      this.groundDecalMesh.setMatrixAt(slot, _dummy.matrix);
      const o = slot * 4;
      metaArr[o + 0] = segAge;
      metaArr[o + 1] = 0.0;
      metaArr[o + 2] = seg.seed;
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
        0.74
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
      const riseSink = Math.min(0.0, emerge - 1.0) * height * 0.82;
      const tiltLiftCompensation = 0.54 * radius * Math.sin(leanAngle);
      _dummy.position.y += riseSink - tiltLiftCompensation - 0.08;
      if (retractU > 0) {
        const sink = inCubic(retractU);
        _dummy.position.y -= sink * (height + radius + 0.45);
      }

      const widthGrow = lerp(0.86, 1.0, Math.min(1.0, emerge));
      const currentHeight = Math.max(0.08, height * Math.max(0.18, emerge)) + tiltLiftCompensation * 0.90;
      _dummy.quaternion.copy(_tiltQuat);
      _dummy.scale.set(radius * widthGrow, currentHeight, radius * widthGrow);
      _dummy.updateMatrix();

      this.crystalMeshes[variant].setMatrixAt(slot, _dummy.matrix);
      const birthElapsed = Math.max(0, timeSeconds - record.eruptTime);
      const birthGlow = saturate(1.0 - birthElapsed / birthFade);
      this.crystalBirthAttrs[variant].array[slot] = Math.max(
        birthGlow,
        shatterPhase * (1.0 - retractU) * 0.45
      );
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
        scMult = lerp(0.32, rec.endScaleMult, expand) * (1.0 - smoothstep(0.62, 1.0, u) * 0.72);
        birthArr[slot] = u < 0.35 ? 1.0 - u * 2.2 : -smoothstep(0.42, 1.0, u);
      } else {
        const popIn = smoothstep(0.0, 0.08, u);
        const shrinkOut = lerp(1.0, rec.endScaleMult, smoothstep(0.45, 1.0, u));
        scMult = popIn * shrinkOut;
        birthArr[slot] = saturate(1.0 - u * 1.9);
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
