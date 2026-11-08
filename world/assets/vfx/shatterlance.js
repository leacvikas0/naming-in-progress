// ============================================================================
// world/assets/vfx/shatterlance.js
//
// Stage 4 Pass 2: Opaque Subsurface-Lit "Shatterlance" Railgun Spear VFX System
//
// Visual & Engineering Contract:
// - Strictly <= 4 InstancedMeshes when active, 0 draw calls when idle (`group.visible = false`):
//     1. `intakeShardsMesh` (1 InstancedMesh): 32 spiraling 3D intake crystal
//        shards converging in a clean coaxial halo around the hovering assembly
//        axis (`transparent: false`).
//     2. `greatLanceMesh` (1 InstancedMesh): 4.1m 7-fluted railgun great-lance
//        with luminous cerulean-white flute valleys, weld-line charge surge, and
//        coaxial Mach shock collars (`transparent: false`).
//     3. `shatterWedgesMesh` (1 InstancedMesh): Fan-shaped directional railgun
//        shatter-crown spires + ballistic downrange 3D crystal splinters
//        (`fragInherit = 0.45`, gravity `-19 m/s^2`, `transparent: false`).
//     4. `groundDecalMesh` (1 InstancedMesh): World-space 3D height-field
//        snow-rime railgun slipstream & 8-pointed star-fissure impact frost
//        sheet (`transparent: false` with hard grain-eroded `discard` < 0.45).
// - Unified with Locked `V1` Glacial Subsurface Optics: `transparent: false,
//   depthWrite: true, side: THREE.FrontSide`, horizontal-azimuth optical
//   thickness (`dot(horizN, horizV)`), permanent subsurface inner light
//   (`uColorCore`), internal fracture planes & feather-frost veins.
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

export const SHATTERLANCE_DEFAULTS = Object.freeze({
  range: 14.3, // default arena target distance
  speed: 58.0, // railgun flight speed, m/s
  assembly: 0.65, // Beat 1: spiraling shard convergence & fluted lance assembly
  lifetime: 0.55, // Beat 3: impact hold duration
  fadeTime: 1.45, // Beat 4: ballistic wedge & frost-plate fade

  // Great-lance dimensions
  lanceLength: 4.15,
  lanceRadius: 0.46,
  lanceHeight: 1.52,
  hoverForward: 3.15,
  facets: 7,
  swell: 0.26,
  tailWidth: 0.24,
  tipCurve: 1.28,
  fluteDepth: 0.34,
  fluteTwist: 0.52,

  // Intake shard vortex
  intakeCount: 32,
  intakeSphere: 2.35,
  intakeSpread: 2.15,
  intakeStagger: 0.52,
  intakeEase: 2.4,
  intakeSize: 0.24,

  // Impact break & ballistic shatter wedges
  fragmentCount: 52,
  fragInherit: 0.45,
  fragSpeed: 8.6,
  fragGravity: -19.0,
  fragDrag: 0.72,
  fragSize: 0.42,
  sheetRadius: 5.6,

  // Locked V1 Royal Glacial-Cerulean Subsurface Palette (passed via THREE.Color)
  colorCore: '#4b92c9',
  colorDeep: '#225e96',
  colorMid: '#4b8ec4',
  colorIce: '#7dd0ff',
  colorRim: '#f4feff',
  colorSeam: '#c4f5ff',
  colorInk: '#153a5c',
  colorSheetBase: '#78bae3',
  colorSheetDeep: '#447ea8',
  colorSheetEdge: '#f4fcff',
});

/* ------------------------------------------------------------------------- */
/* 1. Procedural 7-Fluted Railgun Great-Lance Geometry (Outward CCW Winding) */
/* ------------------------------------------------------------------------- */

export function createFlutedGreatLanceGeometry({
  facets = 7,
  rings = 16,
  swell = 0.26,
  tailWidth = 0.24,
  tipCurve = 1.28,
  fluteDepth = 0.34,
  fluteTwist = 0.52,
} = {}) {
  const cols = facets * 2; // Alternating outer ridge (even) and concave flute valley (odd)
  const ringData = [];

  const profileAt = (u) => {
    if (u < swell) {
      const t = u / Math.max(0.01, swell);
      return lerp(tailWidth, 1.0, smoothstep(0.0, 1.0, t));
    }
    const t = (u - swell) / Math.max(0.01, 1.0 - swell);
    return Math.pow(Math.max(0.0, 1.0 - t), tipCurve);
  };

  // Axis is local +Z from tail (-0.32) to tip (+0.68), total unit length = 1.0
  for (let r = 0; r < rings; r++) {
    const u = r / (rings - 1);
    const z = u - 0.32;
    const baseRad = Math.max(0.012, profileAt(u));
    const twistAng = u * fluteTwist * TAU;
    const pts = [];

    for (let c = 0; c < cols; c++) {
      const isFluteValley = c % 2 === 1;
      const frac = c / cols;
      const ang = frac * TAU + twistAng;
      const groove = isFluteValley
        ? 1.0 - fluteDepth * Math.sin(u * Math.PI)
        : 1.0 + 0.08 * Math.sin(u * Math.PI);
      const rad = baseRad * groove;
      pts.push({
        pos: [Math.cos(ang) * rad, Math.sin(ang) * rad, z],
        fluteVal: isFluteValley ? 1.0 : 0.0,
        u,
        facetId: (c >> 1) / facets,
      });
    }
    ringData.push(pts);
  }

  const tailTip = [0, 0, -0.38];
  const noseTip = [0, 0, 0.74];

  const positions = [];
  const facetUvs = []; // x: fluteValley (0..1), y: axial u (0..1), z: facetId

  const pushTriCCW = (pA, pB, pC, uvA, uvB, uvC) => {
    positions.push(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], pC[0], pC[1], pC[2]);
    facetUvs.push(uvA[0], uvA[1], uvA[2], uvB[0], uvB[1], uvB[2], uvC[0], uvC[1], uvC[2]);
  };

  for (let r = 0; r < rings - 1; r++) {
    const row0 = ringData[r];
    const row1 = ringData[r + 1];
    for (let c = 0; c < cols; c++) {
      const cNext = (c + 1) % cols;
      const a = row0[c];
      const b = row0[cNext];
      const d = row1[c];
      const e = row1[cNext];

      pushTriCCW(
        a.pos,
        b.pos,
        e.pos,
        [a.fluteVal, a.u, a.facetId],
        [b.fluteVal, b.u, b.facetId],
        [e.fluteVal, e.u, e.facetId]
      );
      pushTriCCW(
        a.pos,
        e.pos,
        d.pos,
        [a.fluteVal, a.u, a.facetId],
        [e.fluteVal, e.u, e.facetId],
        [d.fluteVal, d.u, d.facetId]
      );
    }
  }

  const firstRow = ringData[0];
  const lastRow = ringData[rings - 1];
  for (let c = 0; c < cols; c++) {
    const cNext = (c + 1) % cols;
    const f0 = firstRow[c];
    const f1 = firstRow[cNext];
    pushTriCCW(
      tailTip,
      f1.pos,
      f0.pos,
      [0.5, 0.0, f0.facetId],
      [f1.fluteVal, 0.0, f1.facetId],
      [f0.fluteVal, 0.0, f0.facetId]
    );

    const l0 = lastRow[c];
    const l1 = lastRow[cNext];
    pushTriCCW(
      l0.pos,
      l1.pos,
      noseTip,
      [l0.fluteVal, 1.0, l0.facetId],
      [l1.fluteVal, 1.0, l1.facetId],
      [0.0, 1.0, l0.facetId]
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFacetUv', new THREE.Float32BufferAttribute(facetUvs, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/* ------------------------------------------------------------------------- */
/* 2. Locked V1 Subsurface Glacial Crystal & 3D Snow-Rime Shaders            */
/* ------------------------------------------------------------------------- */

function createShatterCrystalMaterial(noiseAtlas, sharedUniforms, config, { isGreatLance = false } = {}) {
  return new THREE.ShaderMaterial({
    name: isGreatLance ? 'ShatterlanceGreatLanceMaterial' : 'ShatterlanceCrystalWedgeMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uChargeProgress: sharedUniforms.uChargeProgress,
      uColorCore: { value: new THREE.Color(config.colorCore) },
      uColorDeep: { value: new THREE.Color(config.colorDeep) },
      uColorMid: { value: new THREE.Color(config.colorMid) },
      uColorIce: { value: new THREE.Color(config.colorIce) },
      uColorRim: { value: new THREE.Color(config.colorRim) },
      uColorSeam: { value: new THREE.Color(config.colorSeam) },
      uColorInk: { value: new THREE.Color(config.colorInk) },
      uIsGreatLance: { value: isGreatLance ? 1.0 : 0.0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aFacetUv;
      attribute vec4 aInstanceMeta; // x: seed, y: glowBoost, z: role (0=grounded/lance, 1=airborne/collar), w: phase

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec3 vFacetUv;
      varying vec4 vMeta;

      void main() {
        vLocalPos = position;
        vFacetUv = aFacetUv;
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
      uniform float uChargeProgress;
      uniform vec3 uColorCore;
      uniform vec3 uColorDeep;
      uniform vec3 uColorMid;
      uniform vec3 uColorIce;
      uniform vec3 uColorRim;
      uniform vec3 uColorSeam;
      uniform vec3 uColorInk;
      uniform float uIsGreatLance;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec3 vFacetUv;
      varying vec4 vMeta;

      void main() {
        float seed = vMeta.x;
        float glowMult = vMeta.y;
        float isAirborneOrCollar = vMeta.z;
        float dissolveProgress = clamp(vMeta.w, 0.0, 1.0) * (1.0 - uIsGreatLance);

        // 1. Outward per-triangle normal + horizontal-azimuth optical thickness
        //    (matches locked V1 Frost Lance so leaned/airborne shards never turn pitch-black!)
        vec3 dN = cross(dFdx(vWorldPos), dFdy(vWorldPos));
        vec3 N = length(dN) > 1e-8 ? normalize(dN) : normalize(vWorldNormal);
        if (dot(N, vWorldNormal) < 0.0) N = -N;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 horizN = normalize(vec3(N.x, 0.0, N.z) + vec3(1e-5, 0.0, 0.0));
        vec3 horizV = normalize(vec3(V.x, 0.0, V.z) + vec3(1e-5, 0.0, 0.0));
        float ndv = clamp(mix(dot(horizN, horizV), abs(dot(N, V)), uIsGreatLance * 0.45), 0.0, 1.0);

        // 2. Optical Thickness & Fresnel
        float thickness = clamp(pow(ndv, 0.85) * 0.96, 0.0, 1.0);
        float rimAmount = pow(1.0 - ndv, 2.3);

        // 3. World-Space Internal Fracture Planes (cracks) & Local Milky Feather-Frost (veins)
        vec3 fp = vWorldPos * 0.42 + seed * 0.73;
        float r0 = texture2D(uNoiseAtlas, fp.xz + vec2(fp.y * 0.57, 0.19)).r;
        float r1 = texture2D(uNoiseAtlas, fp.xy * 1.65 + vec2(0.41, fp.z * 0.63)).r;
        float cracks = smoothstep(0.55, 0.95, 0.58 * r0 + 0.42 * r1);

        vec3 vp = vLocalPos * 0.95 + seed * 0.31;
        float v0 = texture2D(uNoiseAtlas, vp.xy + vec2(vp.z * 0.47, 0.23)).b;
        float v1 = texture2D(uNoiseAtlas, vp.yz * 1.90 + vec2(0.67, vp.x * 0.53)).b;
        float veins = smoothstep(0.44, 0.90, 0.55 * v0 + 0.45 * v1);

        // 4. Voronoi Fracture Sublimation (keeps 100% physical spire scale while sublimating in place!)
        float hLocal = clamp(vLocalPos.y, 0.0, 1.0);
        float sublimateNoise = (0.58 * r0 + 0.42 * v0) * 0.72 + (1.0 - hLocal) * 0.28;
        if (sublimateNoise < dissolveProgress) discard;

        vec3 body = mix(uColorIce, uColorDeep, thickness);
        body = mix(body, uColorRim, veins * 0.30);
        body = mix(body, uColorRim, cracks * 0.28);

        // 5. Basal Snow-Rime on Ground-Rooted Impact Spires
        float rimeFbm = texture2D(uNoiseAtlas, vLocalPos.xy * 1.35 + vec2(seed * 0.29, vLocalPos.z * 1.35)).b;
        float rime = smoothstep(0.48, 0.0, hLocal) * (0.5 + 0.5 * rimeFbm) * (1.0 - uIsGreatLance) * (1.0 - isAirborneOrCollar * 0.75);
        body = mix(body, uColorRim, clamp(rime, 0.0, 1.0) * 0.56);

        // 6. Crisp Hewn-Plane Facet Separation
        body *= mix(1.0, 0.64 + 0.80 * ndv, 0.82);

        // 7. Sky-Probe + Key Sun Lighting
        vec3 L = normalize(vec3(uSunDir.x, max(0.45, uSunDir.y), uSunDir.z));
        vec3 H = normalize(L + V);
        float ndl = max(dot(N, L), 0.0);
        float skyProbe = 0.76 + 0.26 * ndl;
        vec3 diffuseLit = body * skyProbe * mix(0.82, 0.98, uDaylight);
        float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.22 * mix(0.5, 1.0, uDaylight);

        // 8. Great-Lance 7-Fluted Spiral Valley Channels & Charge Weld Surge
        float fluteValley = smoothstep(0.28, 0.82, vFacetUv.x) * uIsGreatLance;
        float fluteRidge = (1.0 - smoothstep(0.0, 0.42, vFacetUv.x)) * uIsGreatLance;
        float axialU = vFacetUv.y;
        float weldLine = exp(-pow((axialU - uChargeProgress) * 6.5, 2.0)) * uIsGreatLance;
        float lanceChannel = clamp(fluteValley * 0.85 + weldLine * 0.92, 0.0, 1.0);
        diffuseLit = mix(diffuseLit, uColorDeep * 0.78, fluteRidge * 0.62);
        diffuseLit = mix(diffuseLit, uColorRim, lanceChannel * 0.78);

        // 9. Permanent Subsurface Inner Light + Frost-White Sublimation Rim Edge
        vec3 glow = uColorRim * rimAmount * 0.78;
        glow += uColorCore * (cracks * 0.58 + veins * 0.26) * 1.45;
        glow += uColorCore * 0.84;
        glow += uColorSeam * lanceChannel * (0.72 + 0.25 * glowMult);
        glow *= 0.48;
        glow /= (1.0 + glow * 0.35);

        vec3 finalColor = diffuseLit + uColorRim * spec + glow;
        float sublimateEdge = step(0.001, dissolveProgress) * (1.0 - smoothstep(dissolveProgress, dissolveProgress + 0.075, sublimateNoise));
        finalColor = mix(finalColor, uColorRim * 1.28, sublimateEdge);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

function createShatterGroundDecalMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'ShatterlanceGroundDecalMaterial',
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
      uColorSheetBase: { value: new THREE.Color(config.colorSheetBase) },
      uColorSheetDeep: { value: new THREE.Color(config.colorSheetDeep) },
      uColorSheetEdge: { value: new THREE.Color(config.colorSheetEdge) },
      uColorSeam: { value: new THREE.Color(config.colorSeam) },
      uColorInk: { value: new THREE.Color(config.colorInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aDecalMeta; // x: age01, y: kind (0=track, 1=star-fissure), z: seed, w: reach
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
      uniform vec3 uColorSheetBase;
      uniform vec3 uColorSheetDeep;
      uniform vec3 uColorSheetEdge;
      uniform vec3 uColorSeam;
      uniform vec3 uColorInk;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;

      float snowDepthAt(vec2 q) {
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
        float kind = vMeta.y;
        float seed = vMeta.z;
        float reach = vMeta.w;
        if (reach <= 0.01 || age >= 1.0) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        vec2 wPos = vWorldPos.xz;
        vec4 n0 = texture2D(uNoiseAtlas, wPos * 0.14 + vec2(seed * 0.31, seed * 0.67));
        vec4 n1 = texture2D(uNoiseAtlas, wPos * 0.36 + vec2(0.41, 0.19));

        float fadeOut = 1.0 - smoothstep(0.70, 1.0, age);
        float mask = 0.0;
        float shockRing = 0.0;

        if (kind < 0.5) {
          // KIND 0: Railgun Snow-Rime Slipstream Corridor
          float along = vUv.y;
          if (along > reach) discard;
          float lat = abs(p.x) / max(0.28, mix(0.52, 0.96, along));
          float lobes = (n0.b - 0.5) * 0.44 + (n1.g - 0.5) * 0.24;
          mask = (1.0 - lat + lobes) * smoothstep(0.0, 0.08, along) * smoothstep(reach + 0.05, reach - 0.08, along) * fadeOut;
        } else {
          // KIND 1: 8-Pointed Crystalline Star-Rime Impact Basin + Dual Sonic Frost Rings
          float r = length(p) / max(0.15, reach);
          float ang = atan(p.y, p.x);
          float starLobes = 0.76 + 0.22 * cos(ang * 8.0 + (n0.b - 0.5) * 1.6);
          float grainRim = (n0.b - 0.5) * 0.28 + (n1.a - 0.5) * 0.16;
          mask = (starLobes + grainRim - r + 0.46) * fadeOut;

          float ring1 = smoothstep(0.07, 0.0, abs(r - 0.82 + (n0.b - 0.5) * 0.06));
          float ring2 = smoothstep(0.05, 0.0, abs(r - 0.52 + (n1.b - 0.5) * 0.05));
          shockRing = max(ring1, ring2 * 0.75);
        }

        // Hard cel/grain cutout (transparent: false, zero glass fog!)
        if (mask < 0.45) discard;

        // 3D height-field forward differences (e = 0.16m) for packed snow-rime relief
        float e = 0.16;
        float h  = snowDepthAt(wPos);
        float hx = snowDepthAt(wPos + vec2(e, 0.0));
        float hy = snowDepthAt(wPos + vec2(0.0, e));
        vec3 nrm = normalize(vec3((h - hx) / e * 0.36, 1.0, (h - hy) / e * 0.36));

        vec3 lightDir = normalize(vec3(uSunDir.x, max(0.38, uSunDir.y), uSunDir.z));
        float lambert = clamp(dot(nrm, lightDir), 0.0, 1.0);
        float shade = 0.38 + 0.62 * pow(lambert, 0.80);

        vec3 col = mix(uColorSheetDeep, uColorSheetEdge, shade);
        // Subtle cerulean subsurface ice seams & sonic frost ring highlights
        float iceSeam = smoothstep(0.68, 0.92, n1.r) * smoothstep(0.52, 0.78, mask);
        col = mix(col, uColorSheetBase, iceSeam * 0.55);
        col = mix(col, uColorSheetEdge * 1.06, shockRing * 0.75);

        // Soft packed-snow shadow edge instead of a black cartoon sticker border
        float rimShadow = 1.0 - smoothstep(0.45, 0.54, mask);
        col = mix(col, uColorSheetDeep * 0.88, rimShadow * 0.65);

        gl_FragColor = vec4(col * mix(0.84, 1.0, uDaylight), 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. Pooled, Deterministic ShatterlanceSystem (<= 4 Draw Calls)             */
/* ------------------------------------------------------------------------- */

const MAX_INTAKE_SHARDS = 32;
const MAX_LANCE_PARTS = 6; // 1 main fluted lance + 2 coaxial railgun collars
const MAX_SHATTER_WEDGES = 52;
const MAX_DECALS = 4;

const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _rotQuat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _forwardZ = new THREE.Vector3(0, 0, 1);

export class ShatterlanceSystem {
  constructor({
    scene,
    getGroundHeight = () => 0,
    config = {},
    onApexImpact = null,
  } = {}) {
    this.scene = scene || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.config = { ...SHATTERLANCE_DEFAULTS, ...config };
    this.onApexImpact = onApexImpact;

    this.noiseAtlas = getSharedNoiseAtlas();

    this.sharedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
      uChargeProgress: { value: 0.0 },
    };

    this.group = new THREE.Group();
    this.group.name = 'ShatterlanceVfxRoot';
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
    this.chargeHoldActive = false;
    this.chargeHoldTime = 0;
    this.chargeProgress = 0;
    this.fromChargeHold = false;

    this._shakeOffset = new THREE.Vector3();
    this._hitstopScale = 1.0;

    this._buildMeshes();
    this._seedRecords(1.0);
  }

  _buildMeshes() {
    const c = this.config;

    const shardGeo = createGlacierCrystalGeometry({
      seed: 19.3,
      sides: 7,
      taper: 0.65,
      roughness: 0.10,
      bend: 0.55,
    });

    this.crystalMat = createShatterCrystalMaterial(this.noiseAtlas, this.sharedUniforms, c, {
      isGreatLance: false,
    });
    this.lanceMat = createShatterCrystalMaterial(this.noiseAtlas, this.sharedUniforms, c, {
      isGreatLance: true,
    });

    // DC 1: Spiraling Intake Crystal Shards
    const intakeGeo = shardGeo.clone();
    this.intakeMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INTAKE_SHARDS * 4), 4);
    intakeGeo.setAttribute('aInstanceMeta', this.intakeMetaAttr);
    this.intakeShardsMesh = new THREE.InstancedMesh(intakeGeo, this.crystalMat, MAX_INTAKE_SHARDS);
    this.intakeShardsMesh.name = 'Shatterlance_DC1_IntakeShards';
    this.intakeShardsMesh.frustumCulled = false;
    this.intakeShardsMesh.count = 0;
    this.group.add(this.intakeShardsMesh);

    // DC 2: 7-Fluted Railgun Great-Lance + Coaxial Mach Shock Collars
    const lanceGeo = createFlutedGreatLanceGeometry({
      facets: c.facets,
      swell: c.swell,
      tailWidth: c.tailWidth,
      tipCurve: c.tipCurve,
      fluteDepth: c.fluteDepth,
      fluteTwist: c.fluteTwist,
    });
    this.lanceMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LANCE_PARTS * 4), 4);
    lanceGeo.setAttribute('aInstanceMeta', this.lanceMetaAttr);
    this.greatLanceMesh = new THREE.InstancedMesh(lanceGeo, this.lanceMat, MAX_LANCE_PARTS);
    this.greatLanceMesh.name = 'Shatterlance_DC2_FlutedGreatLance';
    this.greatLanceMesh.frustumCulled = false;
    this.greatLanceMesh.count = 0;
    this.group.add(this.greatLanceMesh);

    // DC 3: Directional Railgun Shatter-Crown Spires & Ballistic 3D Wedges
    const wedgeGeo = shardGeo.clone();
    this.wedgeMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHATTER_WEDGES * 4), 4);
    wedgeGeo.setAttribute('aInstanceMeta', this.wedgeMetaAttr);
    this.shatterWedgesMesh = new THREE.InstancedMesh(wedgeGeo, this.crystalMat, MAX_SHATTER_WEDGES);
    this.shatterWedgesMesh.name = 'Shatterlance_DC3_ShatterWedges';
    this.shatterWedgesMesh.frustumCulled = false;
    this.shatterWedgesMesh.count = 0;
    this.group.add(this.shatterWedgesMesh);

    // DC 4: World-Space 3D Snow-Rime Track & Star-Fissure Ground Relief Decal
    const decalGeo = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    this.decalMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 4), 4);
    decalGeo.setAttribute('aDecalMeta', this.decalMetaAttr);
    this.groundDecalMat = createShatterGroundDecalMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.groundDecalMesh = new THREE.InstancedMesh(decalGeo, this.groundDecalMat, MAX_DECALS);
    this.groundDecalMesh.name = 'Shatterlance_DC4_GroundFrostDecal';
    this.groundDecalMesh.frustumCulled = false;
    this.groundDecalMesh.count = 0;
    this.group.add(this.groundDecalMesh);
  }

  _seedRecords(seed = 1.0) {
    const c = this.config;
    const effectiveAssembly = this.fromChargeHold ? 0.05 : c.assembly;
    const flightDuration = Math.max(0.04, this.castLength / Math.max(1.0, c.speed));
    this.flightStartTime = effectiveAssembly;
    this.impactTime = effectiveAssembly + flightDuration;
    this.totalDuration = this.impactTime + c.lifetime + c.fadeTime;

    this.intakeRecords = [];
    for (let i = 0; i < MAX_INTAKE_SHARDS; i++) {
      const s = seed * 17.3 + i * 23.1;
      const ringAng = (i / MAX_INTAKE_SHARDS) * TAU * 2.0 + signedHash(s + 1.1) * 0.22;
      const radial = (0.58 + 0.48 * hash11(s + 2.3)) * c.intakeSphere;
      const axial = lerp(-1.45, 0.75, hash11(s + 3.7));
      const stagger = (i / MAX_INTAKE_SHARDS) * c.intakeStagger * 0.72;
      this.intakeRecords.push({
        seed: hash11(s + 5.1) * 10.0,
        ringAng,
        radial,
        axial,
        stagger,
        size: c.intakeSize * (0.72 + 0.44 * hash11(s + 7.9)),
        spin: (4.5 + hash11(s + 9.3) * 4.5) * (i % 2 === 0 ? 1 : -1),
      });
    }

    this.wedgeRecords = [];
    const crownCount = 26;
    for (let i = 0; i < MAX_SHATTER_WEDGES; i++) {
      const s = seed * 31.7 + i * 19.9;
      const isCrownSpike = i < crownCount;
      const rawAz = (i / (isCrownSpike ? crownCount : MAX_SHATTER_WEDGES - crownCount)) * TAU + signedHash(s + 1.3) * 0.12;
      // Entire camera-facing hemisphere (az in [0.22, 2.92], i.e., sin(az) > 0.2) uses low waist-high fangs
      // so Skeleton_Warrior & Skeleton_Mage are 100% framed in front of the towering rear Shatter-Crown!
      const inCameraWindow = isCrownSpike && rawAz > 0.22 && rawAz < 2.92;
      const spd = c.fragSpeed * (0.75 + 0.65 * hash11(s + 2.9));
      const forwardInherit = c.speed * c.fragInherit * (0.35 + 0.45 * hash11(s + 4.1));
      this.wedgeRecords.push({
        isCrownSpike,
        inCameraWindow,
        seed: hash11(s + 5.7) * 10.0,
        az: rawAz,
        tilt: isCrownSpike
          ? inCameraWindow
            ? 0.56 + 0.18 * hash11(s + 6.3)
            : 0.34 + 0.32 * hash11(s + 6.3)
          : 0.25 + 0.65 * hash11(s + 6.3),
        radialOffset: isCrownSpike
          ? (inCameraWindow ? 1.45 : 1.08) + 1.35 * hash11(s + 7.1)
          : 0.55 + 0.85 * hash11(s + 7.1),
        vForward: forwardInherit * 0.38 + Math.cos(rawAz) * spd * 0.65,
        vSide: Math.sin(rawAz) * spd * 0.92,
        vy: 5.4 + hash11(s + 8.5) * 6.2,
        size:
          c.fragSize *
          (isCrownSpike
            ? (inCameraWindow ? 0.44 : 1.52) + 0.45 * hash11(s + 9.7)
            : 0.62 + 0.52 * hash11(s + 9.7)),
        spinX: signedHash(s + 11.1) * 8.5,
        spinY: signedHash(s + 13.3) * 8.5,
        spinZ: signedHash(s + 15.7) * 8.5,
      });
    }
  }

  _resolveOriginAndDirection({ origin, direction, dirX, dirZ, yaw } = {}) {
    if (origin) {
      this.origin.set(
        origin.x ?? origin[0] ?? this.origin.x,
        origin.y ?? origin[1] ?? this.origin.y,
        origin.z ?? origin[2] ?? this.origin.z
      );
    }
    this.origin.y = this.getGroundHeight(this.origin.x, this.origin.z);

    let rDx = null;
    let rDz = null;
    if (direction && (direction.x !== undefined || direction.z !== undefined || Array.isArray(direction))) {
      const dx = Number(direction.x ?? direction[0] ?? 0);
      const dz = Number(direction.z ?? direction[2] ?? 0);
      if (Math.hypot(dx, dz) > 1e-5) {
        rDx = dx;
        rDz = dz;
      }
    }
    if (rDx === null && Number.isFinite(dirX) && Number.isFinite(dirZ) && Math.hypot(dirX, dirZ) > 1e-5) {
      rDx = Number(dirX);
      rDz = Number(dirZ);
    }
    if (rDx === null && Number.isFinite(yaw)) {
      rDx = Math.sin(Number(yaw));
      rDz = Math.cos(Number(yaw));
    }
    if (rDx !== null && rDz !== null) {
      const len = Math.hypot(rDx, rDz) || 1.0;
      this.direction.set(rDx / len, 0, rDz / len);
    }
    this.side.set(-this.direction.z, 0, this.direction.x);
  }

  /**
   * Renders a continuously spinning 3D cel-shaded crystalline ice vortex + orbiting
   * frost shards suspended in mid-air at the Mage's raised staff tip (`origin.y + 1.25m`,
   * `0.65m` forward) for as long as the player holds Attack!
   */
  updateChargeHold({
    origin,
    direction,
    dirX,
    dirZ,
    yaw,
    chargeProgress,
    active = true,
    dt = 0.016,
  } = {}) {
    if (!active) {
      return this.cancelCharge();
    }

    this._resolveOriginAndDirection({ origin, direction, dirX, dirZ, yaw });

    if (!this.chargeHoldActive) {
      this.chargeHoldActive = true;
      this.chargeHoldTime = 0;
    }
    if (Number.isFinite(dt) && dt > 0) {
      this.chargeHoldTime += dt;
    }

    const t = this.chargeHoldTime;
    const prog = Number.isFinite(chargeProgress)
      ? clamp(chargeProgress, 0.25, 1.0)
      : clamp(t / 0.55, 0.28, 1.0);
    this.chargeProgress = prog;

    this.active = true;
    this.group.visible = true;
    this.sharedUniforms.uTime.value = t;
    this.sharedUniforms.uChargeProgress.value = 0.5 + 0.5 * Math.sin(t * 6.5);

    this._renderStaffVortexFrame(t, prog);
    return this;
  }

  _renderStaffVortexFrame(t, prog) {
    const c = this.config;
    const staffForward = 0.65;
    const staffHeight = 1.25;
    const centerX = this.origin.x + this.direction.x * staffForward;
    const centerZ = this.origin.z + this.direction.z * staffForward;
    const centerY = this.getGroundHeight(centerX, centerZ) + staffHeight;

    // 1. DC 1: 32 Orbiting 3D Crystalline Frost Shards swirling continuously around staff tip
    let intakeSlot = 0;
    const vortexScale = 0.65 + 0.35 * prog;
    for (let i = 0; i < MAX_INTAKE_SHARDS; i++) {
      const rec = this.intakeRecords[i];
      const orbitSpeed = 6.2 + (i % 5) * 1.15;
      const swirlAng = rec.ringAng + t * orbitSpeed * (i % 2 === 0 ? 1 : -1);
      const orbitRad = (0.34 + 0.48 * ((i % 7) / 6)) * vortexScale * (0.88 + 0.14 * Math.sin(t * 5.0 + i));
      const axialOff = ((i / MAX_INTAKE_SHARDS) - 0.5) * 1.15 * vortexScale + Math.cos(t * 4.2 + i) * 0.12;

      const rx = Math.cos(swirlAng) * orbitRad;
      const ry = Math.sin(swirlAng) * orbitRad;

      const wx = centerX + this.direction.x * axialOff + this.side.x * rx;
      const wz = centerZ + this.direction.z * axialOff + this.side.z * rx;
      const wy = Math.max(this.getGroundHeight(wx, wz) + 0.35, centerY + ry);

      _dummy.position.set(wx, wy, wz);
      // Orient each crystal shard tangentially along the spinning vortex + tilted toward aim axis
      const targetX = centerX + this.direction.x * 0.95 - this.side.x * ry * 0.65;
      const targetY = centerY + rx * 0.65;
      const targetZ = centerZ + this.direction.z * 0.95 - this.side.z * ry * 0.65;
      _pos.set(targetX - wx, targetY - wy, targetZ - wz);
      if (_pos.lengthSq() > 1e-4) {
        _pos.normalize();
        _quat.setFromUnitVectors(UP, _pos);
      } else {
        _quat.identity();
      }
      _rotQuat.setFromAxisAngle(UP, t * rec.spin * 1.6);
      _dummy.quaternion.copy(_quat).multiply(_rotQuat);

      const sc = rec.size * (0.78 + 0.34 * prog);
      _dummy.scale.set(sc * 0.62, sc * 1.55, sc * 0.62);
      _dummy.updateMatrix();
      this.intakeShardsMesh.setMatrixAt(intakeSlot, _dummy.matrix);

      const mOff = intakeSlot * 4;
      this.intakeMetaAttr.array[mOff + 0] = rec.seed;
      this.intakeMetaAttr.array[mOff + 1] = 0.85 + 0.25 * prog;
      this.intakeMetaAttr.array[mOff + 2] = 1.0;
      this.intakeMetaAttr.array[mOff + 3] = 0.0;
      intakeSlot++;
    }
    this.intakeShardsMesh.count = intakeSlot;
    this.intakeShardsMesh.instanceMatrix.needsUpdate = true;
    this.intakeMetaAttr.needsUpdate = true;

    // 2. DC 2: Rapidly Spinning 7-Fluted Crystalline Lance Core + Counter-Rotating Vortex Collars at Staff Tip
    let lanceSlot = 0;
    const bob = Math.sin(t * 8.5) * 0.035;
    _quat.setFromUnitVectors(_forwardZ, this.direction);
    _rotQuat.setFromAxisAngle(_forwardZ, t * 11.5);
    _quat.multiply(_rotQuat);

    _dummy.position.set(centerX, centerY + bob, centerZ);
    _dummy.quaternion.copy(_quat);
    _dummy.scale.set(
      c.lanceRadius * (0.68 + 0.34 * prog),
      c.lanceRadius * (0.68 + 0.34 * prog),
      c.lanceLength * (0.42 + 0.28 * prog)
    );
    _dummy.updateMatrix();
    this.greatLanceMesh.setMatrixAt(lanceSlot, _dummy.matrix);
    this.lanceMetaAttr.setXYZW(lanceSlot, 1.1, 1.15, 0.0, 0.0);
    lanceSlot++;

    // Slot 1: Counter-spinning wide crystalline vortex ring collar at staff tip
    _quat.setFromUnitVectors(_forwardZ, this.direction);
    _rotQuat.setFromAxisAngle(_forwardZ, -t * 14.0);
    _quat.multiply(_rotQuat);
    _dummy.position.set(
      centerX + this.direction.x * 0.18,
      centerY + bob,
      centerZ + this.direction.z * 0.18
    );
    _dummy.quaternion.copy(_quat);
    _dummy.scale.set(
      c.lanceRadius * (1.28 + 0.35 * prog),
      c.lanceRadius * (1.28 + 0.35 * prog),
      0.55
    );
    _dummy.updateMatrix();
    this.greatLanceMesh.setMatrixAt(lanceSlot, _dummy.matrix);
    this.lanceMetaAttr.setXYZW(lanceSlot, 2.7, 1.25, 1.0, 0.0);
    lanceSlot++;

    this.greatLanceMesh.count = lanceSlot;
    this.greatLanceMesh.instanceMatrix.needsUpdate = true;
    this.lanceMetaAttr.needsUpdate = true;

    // 3. DC 3: Zero impact wedges while holding charge
    this.shatterWedgesMesh.count = 0;
    this.shatterWedgesMesh.instanceMatrix.needsUpdate = true;

    // 4. DC 4: Spinning 8-Pointed Crystalline Star-Rime Glyph beneath Mage's feet while charging
    const castYaw = Math.atan2(this.direction.x, this.direction.z);
    const groundY = this.getGroundHeight(this.origin.x, this.origin.z) + 0.042;
    _dummy.position.set(this.origin.x, groundY, this.origin.z);
    _dummy.quaternion.setFromAxisAngle(UP, castYaw + t * 1.25);
    const glyphRad = 1.65 * (0.75 + 0.25 * prog);
    _dummy.scale.set(glyphRad, 1.0, glyphRad);
    _dummy.updateMatrix();
    this.groundDecalMesh.setMatrixAt(0, _dummy.matrix);
    this.decalMetaAttr.setXYZW(0, 0.15, 1.0, 0.19, 1.0);
    this.groundDecalMesh.count = 1;
    this.groundDecalMesh.instanceMatrix.needsUpdate = true;
    this.decalMetaAttr.needsUpdate = true;
  }

  cancelCharge() {
    if (!this.chargeHoldActive) return this;
    this.chargeHoldActive = false;
    this.chargeHoldTime = 0;
    this.chargeProgress = 0;
    this.clear();
    return this;
  }

  cast(origin, direction, options = {}) {
    const wasHoldingCharge = Boolean(this.chargeHoldActive || options.fromChargeHold);
    this.chargeHoldActive = false;
    this.chargeHoldTime = 0;
    this.fromChargeHold = wasHoldingCharge;

    this._resolveOriginAndDirection({
      origin,
      direction,
      dirX: options.dirX ?? options.aim?.dirX,
      dirZ: options.dirZ ?? options.aim?.dirZ,
      yaw: options.yaw ?? options.aim?.yaw,
    });

    const rawRange = options.distance ?? options.range ?? options.aim?.distance ?? this.config.range;
    this.castLength = clamp(Number(rawRange) || this.config.range, 0.8, 18.0);

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
    this.chargeHoldActive = false;
    if (timeSeconds < 0 || timeSeconds > this.totalDuration + 0.1) {
      this.clear();
      return this;
    }

    this.active = true;
    this.age = timeSeconds;
    this.group.visible = true;
    this.sharedUniforms.uTime.value = timeSeconds;

    const c = this.config;
    const effectiveAssembly = this.fromChargeHold ? 0.05 : c.assembly;
    const startHoverDist = this.fromChargeHold
      ? Math.min(0.65, this.castLength * 0.35)
      : Math.min(c.hoverForward, this.castLength * 0.45);
    const assemblyU = saturate(timeSeconds / Math.max(0.03, effectiveAssembly));
    const flightDuration = Math.max(0.04, this.castLength / Math.max(1.0, c.speed));
    const flightU = saturate((timeSeconds - effectiveAssembly) / flightDuration);
    const impactElapsed = timeSeconds - this.impactTime;
    const postImpactU = saturate(impactElapsed / Math.max(0.1, c.lifetime + c.fadeTime));

    this.sharedUniforms.uChargeProgress.value = timeSeconds < effectiveAssembly ? assemblyU : 1.0;

    // 1. Evaluate Spiraling Coaxial Intake Shards (DC 1)
    let intakeSlot = 0;
    if (timeSeconds <= this.impactTime + 0.02) {
      const hoverDist = lerp(startHoverDist, this.castLength, flightU);
      const centerX = this.origin.x + this.direction.x * hoverDist;
      const centerZ = this.origin.z + this.direction.z * hoverDist;
      const centerY = this.getGroundHeight(centerX, centerZ) + c.lanceHeight;

      for (let i = 0; i < MAX_INTAKE_SHARDS; i++) {
        const rec = this.intakeRecords[i];
        const shardProgress = saturate((assemblyU - rec.stagger) / Math.max(0.15, 1.0 - rec.stagger));
        if (shardProgress >= 0.992 && timeSeconds > effectiveAssembly + 0.03) continue;

        const pull = 1.0 - Math.pow(shardProgress, c.intakeEase);
        const swirlAng = rec.ringAng + timeSeconds * 3.8;
        const rad = rec.radial * (0.52 + 0.56 * pull);
        const ax = rec.axial * (0.45 + 0.55 * pull);

        // Upper/rear horseshoe arc so the central 7-fluted Great-Lance is 100% unobstructed from the front camera
        const horseshoeAng = Math.sin(swirlAng) * 1.95;
        const rx = Math.sin(horseshoeAng) * rad;
        const ry = Math.cos(horseshoeAng) * rad * 0.72 + 0.28;

        const wx = centerX + this.direction.x * ax + this.side.x * rx;
        const wz = centerZ + this.direction.z * ax + this.side.z * rx;
        const wy = Math.max(this.getGroundHeight(wx, wz) + 0.68, centerY + ry);

        _dummy.position.set(wx, wy, wz);
        // Point each shard radially inward + forward into the fluted lance core (true 3D convergence cone!)
        const targetX = centerX + this.direction.x * (ax * 0.35 + 0.85);
        const targetY = centerY;
        const targetZ = centerZ + this.direction.z * (ax * 0.35 + 0.85);
        _pos.set(targetX - wx, targetY - wy, targetZ - wz);
        if (_pos.lengthSq() > 1e-4) {
          _pos.normalize();
          _quat.setFromUnitVectors(UP, _pos);
        } else {
          _quat.identity();
        }
        _rotQuat.setFromAxisAngle(UP, timeSeconds * rec.spin);
        _dummy.quaternion.copy(_quat).multiply(_rotQuat);

        const sc = rec.size * (0.55 + 0.55 * Math.sin(shardProgress * Math.PI * 0.85 + 0.2));
        _dummy.scale.set(sc * 0.58, sc * 1.45, sc * 0.58);
        _dummy.updateMatrix();
        this.intakeShardsMesh.setMatrixAt(intakeSlot, _dummy.matrix);

        const mOff = intakeSlot * 4;
        this.intakeMetaAttr.array[mOff + 0] = rec.seed;
        this.intakeMetaAttr.array[mOff + 1] = 0.45 + 0.55 * shardProgress;
        this.intakeMetaAttr.array[mOff + 2] = 1.0;
        this.intakeMetaAttr.array[mOff + 3] = 0.0;
        intakeSlot++;
      }
    }
    this.intakeShardsMesh.count = intakeSlot;
    this.intakeShardsMesh.instanceMatrix.needsUpdate = true;
    this.intakeMetaAttr.needsUpdate = true;

    // 2. Evaluate 7-Fluted Great-Lance (DC 2) — shatters cleanly into DC 3 wedges upon impact!
    let lanceSlot = 0;
    const lanceVisible = timeSeconds <= this.impactTime + 0.02;
    if (lanceVisible) {
      const dist = lerp(startHoverDist, this.castLength, flightU);
      const lx = this.origin.x + this.direction.x * dist;
      const lz = this.origin.z + this.direction.z * dist;
      const bob = timeSeconds < effectiveAssembly ? Math.sin(timeSeconds * 9.5) * 0.04 : 0.0;
      const ly = this.getGroundHeight(lx, lz) + c.lanceHeight + bob;

      _quat.setFromUnitVectors(_forwardZ, this.direction);
      const rollAng = timeSeconds * (timeSeconds < effectiveAssembly ? 1.8 : 8.5);
      _rotQuat.setFromAxisAngle(_forwardZ, rollAng);
      _quat.multiply(_rotQuat);

      const lenGrow = Math.pow(Math.max(0.28, assemblyU), 0.48);
      const radGrow = Math.pow(Math.max(0.36, assemblyU), 0.88);

      // Slot 0: Primary 4.15m 7-Fluted Railgun Great-Lance
      _dummy.position.set(lx, ly, lz);
      _dummy.quaternion.copy(_quat);
      _dummy.scale.set(
        c.lanceRadius * radGrow,
        c.lanceRadius * radGrow,
        Math.min(c.lanceLength, Math.max(1.4, this.castLength * 0.85)) * lenGrow
      );
      _dummy.updateMatrix();
      this.greatLanceMesh.setMatrixAt(lanceSlot, _dummy.matrix);
      this.lanceMetaAttr.setXYZW(lanceSlot, 1.1, 0.95, 0.0, 0.0);
      lanceSlot++;
    }
    this.greatLanceMesh.count = lanceSlot;
    this.greatLanceMesh.instanceMatrix.needsUpdate = true;
    this.lanceMetaAttr.needsUpdate = true;

    // 3. Evaluate Directional Railgun Shatter-Crown & Ballistic 3D Wedges (DC 3)
    //    Keep at 100% erupted scale & ground height and sublimate via Voronoi fracture erosion!
    let wedgeSlot = 0;
    if (impactElapsed >= -0.02) {
      const tBreak = Math.max(0.0, impactElapsed + 0.02);
      const impX = this.origin.x + this.direction.x * this.castLength;
      const impZ = this.origin.z + this.direction.z * this.castLength;
      const impY = this.getGroundHeight(impX, impZ);

      for (let i = 0; i < MAX_SHATTER_WEDGES; i++) {
        const rec = this.wedgeRecords[i];
        const dissolveProgress = smoothstep(0.45, 0.98, postImpactU + (i / MAX_SHATTER_WEDGES) * 0.08);
        if (dissolveProgress >= 0.995) continue;

        if (rec.isCrownSpike) {
          // Ground-rooted radial impaling glacier spires fanning outward from the railgun strike
          const pop = outQuint(Math.min(1.0, tBreak / 0.11));
          const ox = Math.cos(rec.az) * rec.radialOffset + (rec.inCameraWindow ? -0.25 : 0.45);
          const oz = Math.sin(rec.az) * rec.radialOffset;
          const wx = impX + this.direction.x * ox + this.side.x * oz;
          const wz = impZ + this.direction.z * ox + this.side.z * oz;
          const wy = this.getGroundHeight(wx, wz) - 0.16;

          _dummy.position.set(wx, wy, wz);
          _pos.set(
            this.direction.x * (0.48 + Math.cos(rec.az) * 0.72) + this.side.x * Math.sin(rec.az) * 0.82,
            1.05,
            this.direction.z * (0.48 + Math.cos(rec.az) * 0.72) + this.side.z * Math.sin(rec.az) * 0.82
          ).normalize();
          _dummy.quaternion.setFromUnitVectors(UP, _pos);
          const h = rec.size * 3.45 * pop;
          const r = rec.size * 0.92 * pop;
          _dummy.scale.set(r, h, r);
          _dummy.updateMatrix();
          this.shatterWedgesMesh.setMatrixAt(wedgeSlot, _dummy.matrix);
          this.wedgeMetaAttr.setXYZW(wedgeSlot, rec.seed, 1.0 - postImpactU * 0.5, 0.0, dissolveProgress);
          wedgeSlot++;
        } else {
          // High-velocity downrange ballistic crystal splinters
          const dragT = (1.0 - Math.exp(-c.fragDrag * tBreak)) / c.fragDrag;
          const downrange = rec.vForward * dragT;
          const lateral = rec.vSide * dragT;
          const wx = impX + this.direction.x * downrange + this.side.x * lateral;
          const wz = impZ + this.direction.z * downrange + this.side.z * lateral;
          const groundY = this.getGroundHeight(wx, wz) + 0.08;
          const rawY = impY + 1.05 + rec.vy * dragT + 0.5 * c.fragGravity * tBreak * tBreak;
          const wy = Math.max(groundY, rawY);
          const spinT = rawY <= groundY ? tBreak * 0.25 : tBreak;

          _dummy.position.set(wx, wy, wz);
          _euler.set(rec.spinX * spinT, rec.az + rec.spinY * spinT, rec.spinZ * spinT);
          _dummy.quaternion.setFromEuler(_euler);
          const sc = rec.size;
          _dummy.scale.set(sc * 0.72, sc * 1.85, sc * 0.72);
          _dummy.updateMatrix();
          this.shatterWedgesMesh.setMatrixAt(wedgeSlot, _dummy.matrix);
          this.wedgeMetaAttr.setXYZW(wedgeSlot, rec.seed, 1.0 - postImpactU * 0.5, 1.0, dissolveProgress);
          wedgeSlot++;
        }
      }
    }
    this.shatterWedgesMesh.count = wedgeSlot;
    this.shatterWedgesMesh.instanceMatrix.needsUpdate = true;
    this.wedgeMetaAttr.needsUpdate = true;

    // 4. Evaluate 3D Snow-Rime Slipstream & Star-Fissure Ground Decal (DC 4)
    let decalSlot = 0;
    const castYaw = Math.atan2(this.direction.x, this.direction.z);
    const totalAge01 = clamp(timeSeconds / Math.max(0.2, this.totalDuration), 0.0, 0.999);

    // Muzzle / Hover Assembly Snow-Rime Star-Plate underneath the assembling Great-Lance
    if (timeSeconds <= this.impactTime + 0.45) {
      const hoverX = this.origin.x + this.direction.x * startHoverDist;
      const hoverZ = this.origin.z + this.direction.z * startHoverDist;
      const hoverY = this.getGroundHeight(hoverX, hoverZ) + 0.042;
      _dummy.position.set(hoverX, hoverY, hoverZ);
      _dummy.quaternion.setFromAxisAngle(UP, castYaw + timeSeconds * 0.35);
      const asmRad = 2.95 * smoothstep(0.0, 0.25, assemblyU);
      _dummy.scale.set(asmRad, 1.0, asmRad);
      _dummy.updateMatrix();
      this.groundDecalMesh.setMatrixAt(decalSlot, _dummy.matrix);
      this.decalMetaAttr.setXYZW(decalSlot, totalAge01 * 0.6, 1.0, 0.19, 1.0);
      decalSlot++;
    }

    // Track decal along railgun path
    const trackReach = timeSeconds < effectiveAssembly ? 0.35 * assemblyU : clamp(0.35 + 0.65 * flightU, 0.0, 1.0);
    if (trackReach > 0.02) {
      const midDist = this.castLength * 0.5;
      const tx = this.origin.x + this.direction.x * midDist;
      const tz = this.origin.z + this.direction.z * midDist;
      const ty = this.getGroundHeight(tx, tz) + 0.04;
      _dummy.position.set(tx, ty, tz);
      _dummy.quaternion.setFromAxisAngle(UP, castYaw);
      _dummy.scale.set(2.15, 1.0, this.castLength * 0.55);
      _dummy.updateMatrix();
      this.groundDecalMesh.setMatrixAt(decalSlot, _dummy.matrix);
      this.decalMetaAttr.setXYZW(decalSlot, totalAge01, 0.0, 0.37, trackReach);
      decalSlot++;
    }

    // Star-fissure impact frost plate
    if (impactElapsed >= -0.02) {
      const plateGrow = smoothstep(0.0, 0.18, Math.max(0.01, impactElapsed + 0.02));
      const ix = this.origin.x + this.direction.x * this.castLength;
      const iz = this.origin.z + this.direction.z * this.castLength;
      const iy = this.getGroundHeight(ix, iz) + 0.045;
      _dummy.position.set(ix, iy, iz);
      _dummy.quaternion.setFromAxisAngle(UP, castYaw);
      _dummy.scale.set(c.sheetRadius, 1.0, c.sheetRadius);
      _dummy.updateMatrix();
      this.groundDecalMesh.setMatrixAt(decalSlot, _dummy.matrix);
      this.decalMetaAttr.setXYZW(decalSlot, postImpactU, 1.0, 0.73, plateGrow);
      decalSlot++;
    }

    this.groundDecalMesh.count = decalSlot;
    this.groundDecalMesh.instanceMatrix.needsUpdate = true;
    this.decalMetaAttr.needsUpdate = true;

    // Hitstop & Camera Shake
    this._hitstopScale = Math.abs(timeSeconds - this.impactTime) <= 0.035 ? 0.05 : 1.0;
    if (impactElapsed >= 0 && impactElapsed <= 0.45) {
      const env = Math.exp(-impactElapsed * 7.5) * 0.18;
      this._shakeOffset.set(
        this.direction.x * Math.sin(impactElapsed * 62.0) * env,
        Math.abs(Math.cos(impactElapsed * 48.0)) * env * 0.7,
        this.direction.z * Math.sin(impactElapsed * 62.0) * env
      );
    } else {
      this._shakeOffset.set(0, 0, 0);
    }

    return this;
  }

  update(dt) {
    if (!this.active) return;
    if (this.chargeHoldActive) {
      if (Number.isFinite(dt) && dt > 0) {
        this.chargeHoldTime += dt;
      }
      const prog = clamp(this.chargeHoldTime / 0.55, 0.28, 1.0);
      this.sharedUniforms.uTime.value = this.chargeHoldTime;
      this.sharedUniforms.uChargeProgress.value = 0.5 + 0.5 * Math.sin(this.chargeHoldTime * 6.5);
      this._renderStaffVortexFrame(this.chargeHoldTime, prog);
      return;
    }
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
        chargeHoldActive: false,
        drawCalls: 0,
        activeIntakeShards: 0,
        activeLanceParts: 0,
        activeShatterWedges: 0,
        activeDecals: 0,
      };
    }
    let drawCalls = 0;
    if (this.intakeShardsMesh.count > 0) drawCalls++;
    if (this.greatLanceMesh.count > 0) drawCalls++;
    if (this.shatterWedgesMesh.count > 0) drawCalls++;
    if (this.groundDecalMesh.count > 0) drawCalls++;
    return {
      active: true,
      chargeHoldActive: Boolean(this.chargeHoldActive),
      age: Number((this.chargeHoldActive ? this.chargeHoldTime : this.age).toFixed(3)),
      drawCalls,
      activeIntakeShards: this.intakeShardsMesh.count,
      activeLanceParts: this.greatLanceMesh.count,
      activeShatterWedges: this.shatterWedgesMesh.count,
      activeDecals: this.groundDecalMesh.count,
    };
  }

  clear() {
    this.active = false;
    this.chargeHoldActive = false;
    this.chargeHoldTime = 0;
    this.chargeProgress = 0;
    this.fromChargeHold = false;
    this.age = 0;
    this._shakeOffset.set(0, 0, 0);
    this._hitstopScale = 1.0;
    this.group.visible = false;
    this.intakeShardsMesh.count = 0;
    this.greatLanceMesh.count = 0;
    this.shatterWedgesMesh.count = 0;
    this.groundDecalMesh.count = 0;
  }

  dispose() {
    this.clear();
    this.intakeShardsMesh.geometry.dispose();
    this.greatLanceMesh.geometry.dispose();
    this.shatterWedgesMesh.geometry.dispose();
    this.groundDecalMesh.geometry.dispose();
    this.crystalMat.dispose();
    this.lanceMat.dispose();
    this.groundDecalMat.dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

export function createShatterlanceSystem(options = {}) {
  return new ShatterlanceSystem(options);
}
