// ============================================================================
// world/assets/vfx/artorious-vfx.js
//
// Stage 4 & 5: Artorious, God of Love — Opaque Cel-Shaded Prayer Sanctuary,
// Petty Lightning Smite & Sky-Parting Divine Miracle VFX System
//
// Visual & Engineering Contract:
// - Universal "Zero Glass" Law: Every mesh uses `transparent: false,
//   depthWrite: true, side: THREE.FrontSide` (with hard `discard < 0.45` on
//   cel-eroded sky ribbons and 3D-relieved ground sigils).
// - Zero raw sRGB vec3 literals in GLSL; all palette colors passed via
//   `new THREE.Color('#rrggbb')` uniforms.
// - Zero Shrinking / Zero Floor Sinking on Dissolution: Spires, obelisks,
//   fulgurite spikes, and ballistic soot chunks keep 100% scale & ground height
//   and dissolve via 3D `NoiseAtlas` Voronoi/FBM erosion with a glowing gold
//   or crimson-rose spark edge.
// - Strictly <= 4 Draw Calls when active, 0 Draw Calls when idle
//   (`this.group.visible = false`):
//     1. `skyRibbonsMesh` (DC 1): Closed double-wound camera-aligned 3D
//        ribbons (`createOpaqueRibbonGeometry(48)`) supporting Petty Rose-Gold
//        & Crimson Thunder-Spear (`smite`) and Celestial Sun-Gold &
//        Wisteria-Cyan Helical Sky Columns & God-Ray Ribbons (`channel`,
//        `blessing`, `miracle`).
//     2. `monolithsMesh` (DC 2): Chiseled 7-sided 3D crystal/obelisk monoliths
//        (`createGlacierCrystalGeometry`) using horizontal-azimuth optical
//        thickness (`dot(horizN, horizV)`) + derivative-flat facet normals +
//        subsurface inner light.
//     3. `prismsAndDebrisMesh` (DC 3): Solid 3D octahedral starlight prisms,
//        floating golden wisteria petals, and 1-bounce ballistic rose-obsidian
//        soot chunks.
//     4. `groundSigilMesh` (DC 4): World-space 3D-relieved ground decal
//        (`PlaneGeometry(2, 2).rotateX(-Math.PI/2)`) rendering the 12-Pointed
//        Celestial Sun-Rose & Compass Rose Sanctuary Mandala or Vitrified
//        Obsidian-Wine Lichtenberg Smite Scar.
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';
import { createGlacierCrystalGeometry } from './frost-lance.js';
import { createStarlightCrystalGeometry } from './mage-bolt.js';

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

/**
 * Deterministic 1-bounce ballistic trajectory (`gravity = -22 m/s^2`, `restitution = 0.32`).
 * Bounces once on `floorY` and settles cleanly on the ground without sinking.
 */
function evalOneBounceBallistic(t, y0, vy0, gravity, restitution, floorY, outState) {
  const a = -0.5 * gravity;
  const h0 = Math.max(0.0, y0 - floorY);
  const disc = Math.max(0.0, vy0 * vy0 + 4.0 * a * h0);
  const sqrtDisc = Math.sqrt(disc);
  const tHit1 = (vy0 + sqrtDisc) / (2.0 * a);
  const vImpact = sqrtDisc;
  const vy1 = vImpact * restitution;
  const tBounceDur = (2.0 * vy1) / (-gravity);
  const tSettle = tHit1 + tBounceDur;

  if (t <= tHit1) {
    outState.y = y0 + vy0 * t + 0.5 * gravity * t * t;
    outState.horizT = t;
    outState.spinT = t;
  } else if (t <= tSettle) {
    const tb = t - tHit1;
    outState.y = Math.max(floorY, floorY + vy1 * tb + 0.5 * gravity * tb * tb);
    outState.horizT = tHit1 + tb * 0.45;
    outState.spinT = tHit1 + tb * 0.42;
  } else {
    outState.y = floorY;
    outState.horizT = tHit1 + tBounceDur * 0.45;
    outState.spinT = tHit1 + tBounceDur * 0.42;
  }
  return outState;
}

export const ARTORIOUS_VFX_DEFAULTS = Object.freeze({
  // Timings
  smiteImpactTime: 0.05, // 0.05s heaven-to-ground snap
  smiteBoltSnapStart: 0.34,
  smiteBoltSnapEnd: 0.44,
  smiteLifetime: 0.52,
  smiteFadeTime: 1.08,

  blessingDuration: 1.45,
  blessingFadeTime: 1.15,

  miracleDuration: 1.45,
  miracleFadeTime: 1.35,

  // Radii & Heights
  channelOrbitRadius: 2.1,
  channelSigilRadius: 3.9,
  smiteScarRadius: 4.35,
  miracleSigilRadius: 5.85,
  skyHeight: 18.0,
  smiteSkyHeight: 22.0,

  // Celestial Gold, Alabaster-Sapphire & Wisteria-Cyan Palette (via THREE.Color)
  colorMiracleInk: '#1e3a8a', // royal sapphire-ink border
  colorMiracleAmber: '#d97706', // rich solar amber outer band
  colorMiracleGoldMid: '#fbbf24', // radiant gold mid
  colorMiracleCore: '#fffbeb', // white-gold core

  colorCathCore: '#b45309', // deep amber-gold core
  colorCathMid: '#f59e0b', // warm solar mid
  colorCathFacet: '#fef08a', // luminous gold-ivory facets
  colorCathRim: '#fffbeb', // white-gold alabaster rim
  colorAzureVein: '#38bdf8', // celestial azure veins
  colorCathInk: '#172554', // deep royal sapphire silhouette ink

  colorPetalInk: '#3b0764', // deep wisteria ink
  colorPetalMid: '#e879f9', // luminous wisteria-rose petal mid

  // Petty Smite Rose-Gold, Crimson & Obsidian-Wine Palette (via THREE.Color)
  colorSmiteInk: '#1f0918', // dark wine ink border
  colorSmiteDeep: '#be123c', // deep crimson-rose
  colorSmiteMid: '#f43f5e', // vivid rose-crimson mid
  colorSmiteCore: '#fef08a', // white-gold core

  colorObsidianPlum: '#170d1c', // dark obsidian-plum plates
  colorObsidianMid: '#2d1636', // mid vitrified wine-obsidian
  colorObsidianLit: '#4c2459', // lit plum-slate facet
  colorObsidianInk: '#0c0410', // pitch wine-obsidian ink
});

/* ------------------------------------------------------------------------- */
/* 1. Closed Double-Wound Camera-Aligned Ribbon Geometry (`side: FrontSide`) */
/* ------------------------------------------------------------------------- */

export function createOpaqueRibbonGeometry(nodes = 48) {
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
/* 2. Opaque Cel Shaders (`transparent: false, depthWrite: true, FrontSide`) */
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
      uColorMiracleInk: { value: new THREE.Color(config.colorMiracleInk) },
      uColorMiracleAmber: { value: new THREE.Color(config.colorMiracleAmber) },
      uColorMiracleGoldMid: { value: new THREE.Color(config.colorMiracleGoldMid) },
      uColorMiracleCore: { value: new THREE.Color(config.colorMiracleCore) },
      uColorAzureVein: { value: new THREE.Color(config.colorAzureVein) },
      uColorSmiteInk: { value: new THREE.Color(config.colorSmiteInk) },
      uColorSmiteDeep: { value: new THREE.Color(config.colorSmiteDeep) },
      uColorSmiteMid: { value: new THREE.Color(config.colorSmiteMid) },
      uColorSmiteCore: { value: new THREE.Color(config.colorSmiteCore) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aStartPos;
      attribute vec3 aEndPos;
      attribute vec4 aRibbonMeta;  // x: strandNorm (-1..1, 0 = core), y: seed, z: width, w: activeReach (0..1)
      attribute vec4 aRibbonStyle; // x: styleId (0=gold, 1=smite, 2=azure), y: erodeProgress, z: helixRadius, w: jitterAmp

      uniform float uTime;

      varying float vSide;
      varying float vT;
      varying float vSeed;
      varying float vReach;
      varying float vIsCore;
      varying float vStyleId;
      varying float vErodeProgress;

      float triWave(float x) {
        return abs(fract(x) * 2.0 - 1.0) * 2.0 - 1.0;
      }

      vec3 evalRibbonPoint(
        float t,
        vec3 startP,
        vec3 endP,
        vec3 axis,
        vec3 basisU,
        vec3 basisV,
        float strandNorm,
        float seed,
        float styleId,
        float helixRadius,
        float jitterAmp
      ) {
        float tt = clamp(t, 0.0, 1.0);
        float absNorm = abs(strandNorm);
        float isCore = step(absNorm, 0.08);
        float isSmite = step(0.5, styleId) * step(styleId, 1.5);

        // 24Hz lightning strobe jump in smite mode
        float stepTime = isSmite > 0.5 ? floor(uTime * 24.0) * 1.37 : 0.0;

        vec3 p = mix(startP, endP, tt);

        // Helical spiral around the 3D segment axis (stately vertical braid in celestial mode, 24Hz coil in smite mode)
        float twistTurns = mix(0.72, 2.25, isSmite);
        float spinDir = strandNorm >= 0.0 ? 1.0 : -1.0;
        float ringAng =
          seed * 6.28318 +
          strandNorm * 3.14159 +
          twistTurns * 6.28318 * tt * spinDir -
          uTime * mix(1.45, 2.6, isSmite) +
          stepTime * 0.42;

        float radEnv = isSmite > 0.5
          ? sin(tt * 3.14159265) * smoothstep(1.0, 0.86, tt)
          : mix(0.85, 1.12, tt) * smoothstep(0.0, 0.06, tt);
        vec3 radial = basisU * cos(ringAng) + basisV * sin(ringAng);
        p += radial * helixRadius * radEnv * (1.0 - isCore);

        // Jagged 24Hz lightning kink in smite mode
        if (jitterAmp > 0.001) {
          float k1 = triWave(tt * 5.4 + seed * 1.73 + stepTime * 0.31);
          float k2 = triWave(tt * 12.1 - seed * 2.91 + stepTime * 0.57) * 0.46;
          float kink = (k1 + k2) * jitterAmp * mix(0.18, 0.55 + 0.45 * absNorm, 1.0 - isCore);
          float pinch = smoothstep(0.0, 0.06, tt) * smoothstep(1.0, 0.92, tt);
          vec3 kdir = basisU * cos(seed * 7.1 + strandNorm * 3.7) + basisV * sin(seed * 5.3 - strandNorm * 2.3);
          p += kdir * kink * pinch;
        }

        return p;
      }

      void main() {
        float strandNorm = aRibbonMeta.x;
        float seed = aRibbonMeta.y;
        float baseWidth = aRibbonMeta.z;
        float reach = aRibbonMeta.w;

        float styleId = aRibbonStyle.x;
        float erodeProgress = aRibbonStyle.y;
        float helixRadius = aRibbonStyle.z;
        float jitterAmp = aRibbonStyle.w;

        float isCore = step(abs(strandNorm), 0.08);
        float isSmite = step(0.5, styleId) * step(styleId, 1.5);

        vSide = position.y;
        vT = position.x;
        vSeed = seed;
        vReach = reach;
        vIsCore = isCore;
        vStyleId = styleId;
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
        float eps = 0.015;
        vec3 p0 = evalRibbonPoint(t, aStartPos, aEndPos, axis, basisU, basisV, strandNorm, seed, styleId, helixRadius, jitterAmp);
        vec3 pa = evalRibbonPoint(max(0.0, t - eps), aStartPos, aEndPos, axis, basisU, basisV, strandNorm, seed, styleId, helixRadius, jitterAmp);
        vec3 pb = evalRibbonPoint(min(1.0, t + eps), aStartPos, aEndPos, axis, basisU, basisV, strandNorm, seed, styleId, helixRadius, jitterAmp);

        vec3 tangent = normalize(pb - pa + vec3(1e-5, 1e-5, 0.0));
        vec3 viewDir = normalize(cameraPosition - p0);
        vec3 ribbonOrtho = normalize(cross(viewDir, tangent) + basisU * 1e-4);

        float spearheadSwell = isCore * isSmite * exp(-pow((t - 0.88) * 10.5, 2.0)) * 1.45;
        float tipTaper = smoothstep(1.0, 0.90, t) * 0.82 + 0.18;
        float bodyTaper = (sin(clamp(t, 0.02, 0.98) * 3.14159265) * 0.38 + 0.62 + spearheadSwell) * tipTaper;

        float w = baseWidth * bodyTaper;
        vec3 world = p0 + ribbonOrtho * (position.y * w) + viewDir * (position.z * (0.006 + isCore * 0.012));

        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform vec3 uColorMiracleInk;
      uniform vec3 uColorMiracleAmber;
      uniform vec3 uColorMiracleGoldMid;
      uniform vec3 uColorMiracleCore;
      uniform vec3 uColorAzureVein;
      uniform vec3 uColorSmiteInk;
      uniform vec3 uColorSmiteDeep;
      uniform vec3 uColorSmiteMid;
      uniform vec3 uColorSmiteCore;

      varying float vSide;
      varying float vT;
      varying float vSeed;
      varying float vReach;
      varying float vIsCore;
      varying float vStyleId;
      varying float vErodeProgress;

      void main() {
        if (vReach <= 0.01 || vT > vReach || vErodeProgress >= 0.995) discard;

        float isSmite = step(0.5, vStyleId) * step(vStyleId, 1.5);
        float isAzure = step(1.5, vStyleId);

        vec4 nGap = texture2D(uNoiseAtlas, vec2(vT * 3.2 + vSeed * 0.41, vSeed * 0.73));
        // In smite mode, snap off cleanly via gap erosion along vT; in celestial mode, erode upward into the heavens!
        float gapMetric = mix(nGap.b * 0.58 + (1.0 - vT) * 0.42, nGap.b, isSmite);
        if (gapMetric < vErodeProgress) discard;

        float edgeDist = abs(vSide);
        float scrollSpeed = mix(2.2, 3.8, isSmite);
        vec2 nUv = vec2(vT * 2.6 - uTime * scrollSpeed + vSeed * 0.37, vSide * 0.45 + vSeed * 0.73);
        vec4 nSample = texture2D(uNoiseAtlas, nUv);

        float centerWeight = 1.0 - edgeDist;
        float noiseWeight = mix(0.26, 0.14, vIsCore);
        float plasmaErode = centerWeight * 0.88 + (nSample.b - 0.34) * noiseWeight;
        if (plasmaErode < 0.45) discard;

        vec3 borderInk = mix(uColorMiracleInk, uColorSmiteInk, isSmite);
        vec3 outerBand = mix(
          mix(uColorMiracleAmber, uColorAzureVein, isAzure),
          uColorSmiteDeep,
          isSmite
        );
        vec3 midBand = mix(
          mix(uColorMiracleGoldMid, mix(uColorAzureVein, uColorMiracleGoldMid, 0.48), isAzure),
          uColorSmiteMid,
          isSmite
        );
        vec3 coreBand = mix(uColorMiracleCore, uColorSmiteCore, isSmite);

        vec3 col = outerBand;
        col = mix(col, midBand * 1.10, step(0.55, plasmaErode));
        col = mix(col, coreBand * 1.26, step(mix(0.75, 0.69, vIsCore), plasmaErode));

        float inkBorder = 1.0 - smoothstep(0.45, 0.53, plasmaErode);
        col = mix(col, borderInk, inkBorder);

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
      // Celestial Gold & Alabaster-Sapphire Cathedral Palette
      uColorCathCore: { value: new THREE.Color(config.colorCathCore) },
      uColorCathMid: { value: new THREE.Color(config.colorCathMid) },
      uColorCathFacet: { value: new THREE.Color(config.colorCathFacet) },
      uColorCathRim: { value: new THREE.Color(config.colorCathRim) },
      uColorAzureVein: { value: new THREE.Color(config.colorAzureVein) },
      uColorCathInk: { value: new THREE.Color(config.colorCathInk) },
      // Petty Smite Obsidian-Rose & Gold Fulgurite Palette
      uColorObsidianPlum: { value: new THREE.Color(config.colorObsidianPlum) },
      uColorObsidianMid: { value: new THREE.Color(config.colorObsidianMid) },
      uColorObsidianLit: { value: new THREE.Color(config.colorObsidianLit) },
      uColorSmiteMid: { value: new THREE.Color(config.colorSmiteMid) },
      uColorSmiteCore: { value: new THREE.Color(config.colorSmiteCore) },
      uColorObsidianInk: { value: new THREE.Color(config.colorObsidianInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aMonolithMeta; // x: seed, y: charge, z: dissolveProgress (0..1), w: paletteMode (0=gold, 1=smite)
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec4 vMeta;

      void main() {
        vLocalPos = position;
        vMeta = aMonolithMeta;

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

      uniform vec3 uColorCathCore;
      uniform vec3 uColorCathMid;
      uniform vec3 uColorCathFacet;
      uniform vec3 uColorCathRim;
      uniform vec3 uColorAzureVein;
      uniform vec3 uColorCathInk;

      uniform vec3 uColorObsidianPlum;
      uniform vec3 uColorObsidianMid;
      uniform vec3 uColorObsidianLit;
      uniform vec3 uColorSmiteMid;
      uniform vec3 uColorSmiteCore;
      uniform vec3 uColorObsidianInk;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec4 vMeta;

      void main() {
        float seed = vMeta.x;
        float charge = max(0.0, vMeta.y);
        float dissolveProgress = clamp(vMeta.z, 0.0, 1.0);
        float isSmite = step(0.5, vMeta.w);

        // 1. Derivative-Flat Facet Normal + Locked V1 Horizontal-Azimuth Optical Thickness
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

        // 2. 3D NoiseAtlas Voronoi/FBM Erosion (ZERO shrinking or floor sinking!)
        vec2 uvVein = vWorldPos.xz * 0.52 + vec2(vWorldPos.y * 0.62 + seed * 0.41, seed * 0.77);
        vec4 nSample = texture2D(uNoiseAtlas, uvVein);
        float hLocal = clamp(vLocalPos.y, 0.0, 1.0);
        float erodeVal = nSample.b * 0.64 + (1.0 - hLocal) * 0.36;
        if (erodeVal < dissolveProgress) discard;

        vec3 col;
        float sparkEdge = step(0.001, dissolveProgress) * (1.0 - smoothstep(dissolveProgress, dissolveProgress + 0.075, erodeVal));

        if (isSmite < 0.5) {
          // Mode 0: Celestial Gold & Alabaster-Sapphire Cathedral / Astrolabe Obelisks
          // Clean 4-band derivative-flat cel facet contrast (zero noisy Voronoi cell scribbles!)
          float thickness = horizNdv * 0.56 + ndl * 0.44;
          col = uColorCathCore;
          col = mix(col, uColorCathMid, step(0.34, thickness));
          col = mix(col, uColorCathFacet, step(0.64, thickness));
          col = mix(col, uColorCathRim * 1.16, step(0.84, thickness));

          // Warm subsurface solar-gold inner glow + basal celestial azure rime & white-gold tip crest
          float subsurface = smoothstep(0.28, 0.86, horizNdv) * (1.0 - hLocal * 0.42) * 0.30;
          col = mix(col, uColorCathMid * 1.12, subsurface);

          float basalRime = smoothstep(0.26, 0.0, hLocal) * (0.55 + 0.45 * smoothstep(0.35, 0.78, nSample.g));
          float tipCrest = smoothstep(0.74, 0.98, hLocal);
          float facetEdge = smoothstep(0.76, 0.94, horizNdv) * smoothstep(0.15, 0.90, hLocal) * 0.38;

          float azureGlow = clamp(basalRime * 0.75 * min(1.2, charge), 0.0, 1.0);
          col = mix(col, mix(uColorAzureVein, uColorCathFacet, 0.45) * 1.12, azureGlow);
          col = mix(col, uColorCathRim * 1.22, clamp(tipCrest * 0.65 + facetEdge, 0.0, 1.0));

          // Glowing Gold-Azure Spark Edge along dissolving threshold
          col = mix(col, mix(uColorAzureVein, uColorCathRim, 0.65) * 1.38, sparkEdge);

          // Crisp Royal Sapphire Ink Silhouette Rim for unmistakable physical weight over sand
          float inkRim = 1.0 - smoothstep(0.18, 0.30, ndv);
          col = mix(col, uColorCathInk, inkRim * (1.0 - sparkEdge));
        } else {
          // Mode 1: Petty Smite Obsidian-Rose & Gold Fulgurite Spikes
          // Clean 3-band dark vitrified obsidian facets with rose-gold root surge & tip spark
          float score = clamp(ndl * 0.52 + horizNdv * 0.48, 0.0, 1.0);
          col = uColorObsidianPlum;
          col = mix(col, uColorObsidianMid, step(0.30, score));
          col = mix(col, uColorObsidianLit, step(0.62, score));

          // Drain rose-crimson & gold energy downward toward the root
          float drainLevel = clamp(charge, 0.0, 1.25);
          float heightDrainGate = smoothstep(drainLevel + 0.22, max(0.0, drainLevel - 0.18), hLocal);
          float basalSurge = smoothstep(0.38, 0.0, hLocal) * (0.55 + 0.45 * smoothstep(0.34, 0.85, nSample.b));
          float ridgeSurge = smoothstep(0.78, 0.95, score) * smoothstep(0.65, 0.08, hLocal) * 0.68;
          float tipSpark = smoothstep(0.78, 0.98, hLocal) * 0.62;
          float electricMask = clamp((basalSurge * 0.88 + ridgeSurge + tipSpark) * charge * heightDrainGate, 0.0, 1.0);

          vec3 smiteVeinCol = mix(uColorSmiteMid * 1.14, uColorSmiteCore * 1.28, smoothstep(0.42, 0.86, electricMask));
          col = mix(col, smiteVeinCol, smoothstep(0.18, 0.54, electricMask));

          // Crimson-Rose & Gold Spark Edge along dissolving threshold
          col = mix(col, mix(uColorSmiteMid, uColorSmiteCore, 0.55) * 1.38, sparkEdge);

          // Crisp Pitch Wine-Obsidian Ink Silhouette Rim
          float inkRim = 1.0 - smoothstep(0.15, 0.26, ndv);
          col = mix(col, uColorObsidianInk, inkRim * (1.0 - max(electricMask * 0.45, sparkEdge)));
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
      uColorMiracleInk: { value: new THREE.Color(config.colorMiracleInk) },
      uColorMiracleGoldMid: { value: new THREE.Color(config.colorMiracleGoldMid) },
      uColorMiracleCore: { value: new THREE.Color(config.colorMiracleCore) },
      uColorAzureVein: { value: new THREE.Color(config.colorAzureVein) },
      uColorPetalInk: { value: new THREE.Color(config.colorPetalInk) },
      uColorPetalMid: { value: new THREE.Color(config.colorPetalMid) },
      uColorObsidianPlum: { value: new THREE.Color(config.colorObsidianPlum) },
      uColorObsidianLit: { value: new THREE.Color(config.colorObsidianLit) },
      uColorSmiteMid: { value: new THREE.Color(config.colorSmiteMid) },
      uColorSmiteCore: { value: new THREE.Color(config.colorSmiteCore) },
      uColorObsidianInk: { value: new THREE.Color(config.colorObsidianInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aDebrisMeta; // x: seed, y: glowOrHeat, z: dissolveProgress, w: kind (0=prism, 1=petal, 2=soot)
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
      uniform vec3 uColorMiracleInk;
      uniform vec3 uColorMiracleGoldMid;
      uniform vec3 uColorMiracleCore;
      uniform vec3 uColorAzureVein;
      uniform vec3 uColorPetalInk;
      uniform vec3 uColorPetalMid;
      uniform vec3 uColorObsidianPlum;
      uniform vec3 uColorObsidianLit;
      uniform vec3 uColorSmiteMid;
      uniform vec3 uColorSmiteCore;
      uniform vec3 uColorObsidianInk;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec4 vMeta;

      void main() {
        float seed = vMeta.x;
        float glowOrHeat = max(0.0, vMeta.y);
        float dissolveProgress = clamp(vMeta.z, 0.0, 1.0);
        float kind = vMeta.w;

        vec3 dN = cross(dFdx(vWorldPos), dFdy(vWorldPos));
        vec3 N = length(dN) > 1e-8 ? normalize(dN) : normalize(vWorldNormal);
        if (dot(N, vWorldNormal) < 0.0) N = -N;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(vec3(uSunDir.x, max(0.45, uSunDir.y), uSunDir.z));
        float ndl = dot(N, L) * 0.5 + 0.5;
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        vec4 nSample = texture2D(uNoiseAtlas, vWorldPos.xz * 0.65 + vec2(vWorldPos.y * 0.7 + seed * 0.37, seed * 0.83));
        float erodeVal = nSample.b * 0.62 + nSample.g * 0.38;
        if (erodeVal < dissolveProgress) discard;

        float sparkEdge = step(0.001, dissolveProgress) * (1.0 - smoothstep(dissolveProgress, dissolveProgress + 0.08, erodeVal));
        float facetScore = clamp(ndl * 0.55 + ndv * 0.45 + vUv.x * 0.18, 0.0, 1.0);
        vec3 col;

        if (kind < 0.5) {
          // Kind 0: 3D Octahedral Celestial Starlight Prism
          col = mix(uColorAzureVein, uColorMiracleGoldMid * 1.12, step(0.38, facetScore));
          col = mix(col, uColorMiracleCore * 1.28, step(0.68, facetScore));
          col = mix(col, uColorMiracleCore * 1.35, sparkEdge);
          float inkRim = 1.0 - smoothstep(0.15, 0.28, ndv);
          col = mix(col, uColorMiracleInk, inkRim * (1.0 - sparkEdge));
        } else if (kind < 1.5) {
          // Kind 1: Floating Golden Wisteria Petal
          col = mix(uColorPetalMid, uColorMiracleGoldMid * 1.14, step(0.42, facetScore + vUv.y * 0.25));
          col = mix(col, uColorMiracleCore * 1.25, step(0.74, facetScore + vUv.y * 0.25));
          col = mix(col, uColorMiracleCore * 1.35, sparkEdge);
          float inkRim = 1.0 - smoothstep(0.14, 0.26, ndv);
          col = mix(col, uColorPetalInk, inkRim * (1.0 - sparkEdge));
        } else {
          // Kind 2: Ballistic Rose-Obsidian Soot Chunk (Smite)
          col = mix(uColorObsidianPlum, uColorObsidianLit, step(0.48, facetScore));
          float emberMask = smoothstep(0.62, 0.90, nSample.r) * clamp(glowOrHeat, 0.0, 1.25);
          vec3 emberCol = mix(uColorSmiteMid * 1.15, uColorSmiteCore * 1.26, smoothstep(0.4, 0.85, emberMask));
          col = mix(col, emberCol, smoothstep(0.18, 0.55, emberMask));
          col = mix(col, uColorSmiteMid * 1.35, sparkEdge);
          float inkRim = 1.0 - smoothstep(0.14, 0.25, ndv);
          col = mix(col, uColorObsidianInk, inkRim * (1.0 - max(emberMask * 0.5, sparkEdge)));
        }

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
      // Celestial Sun-Rose & Compass Rose Mandala Palette
      uColorCathInk: { value: new THREE.Color(config.colorCathInk) },
      uColorCathCore: { value: new THREE.Color(config.colorCathCore) },
      uColorCathMid: { value: new THREE.Color(config.colorCathMid) },
      uColorCathFacet: { value: new THREE.Color(config.colorCathFacet) },
      uColorCathRim: { value: new THREE.Color(config.colorCathRim) },
      uColorAzureVein: { value: new THREE.Color(config.colorAzureVein) },
      // Petty Smite Lichtenberg Scar Palette
      uColorObsidianPlum: { value: new THREE.Color(config.colorObsidianPlum) },
      uColorObsidianMid: { value: new THREE.Color(config.colorObsidianMid) },
      uColorSmiteInk: { value: new THREE.Color(config.colorSmiteInk) },
      uColorSmiteMid: { value: new THREE.Color(config.colorSmiteMid) },
      uColorSmiteCore: { value: new THREE.Color(config.colorSmiteCore) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSigilMeta; // x: age01, y: reach, z: seed, w: signedCharge (+ = mandala, - = smite scar)
      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vMeta = aSigilMeta;
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

      uniform vec3 uColorCathInk;
      uniform vec3 uColorCathCore;
      uniform vec3 uColorCathMid;
      uniform vec3 uColorCathFacet;
      uniform vec3 uColorCathRim;
      uniform vec3 uColorAzureVein;

      uniform vec3 uColorObsidianPlum;
      uniform vec3 uColorObsidianMid;
      uniform vec3 uColorSmiteInk;
      uniform vec3 uColorSmiteMid;
      uniform vec3 uColorSmiteCore;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;

      float reliefHeightAt(vec2 q) {
        vec4 n0 = texture2D(uNoiseAtlas, q * 0.16);
        vec4 n1 = texture2D(uNoiseAtlas, q * 0.38 + vec2(0.31, 0.57));
        return n0.g * 0.62 + n1.b * 0.38;
      }

      void main() {
        float age = clamp(vMeta.x, 0.0, 1.0);
        float reach = vMeta.y;
        float seed = vMeta.z;
        float signedCharge = vMeta.w;
        float isSmite = step(signedCharge, -0.001);
        float charge = abs(signedCharge);

        if (reach <= 0.01 || age >= 1.0) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p) / max(0.15, reach);
        float ang = atan(p.y, p.x);

        vec2 wPos = vWorldPos.xz;
        vec4 n0 = texture2D(uNoiseAtlas, wPos * 0.18 + vec2(seed * 0.31, seed * 0.73));
        vec4 n1 = texture2D(uNoiseAtlas, wPos * 0.42 + vec2(0.19, 0.61));

        // 3D finite-difference relief normal for physical ground weight
        float e = 0.16;
        float h  = reliefHeightAt(wPos);
        float hx = reliefHeightAt(wPos + vec2(e, 0.0));
        float hy = reliefHeightAt(wPos + vec2(0.0, e));
        vec3 nrm = normalize(vec3((h - hx) / e * 0.38, 1.0, (h - hy) / e * 0.38));
        vec3 lightDir = normalize(vec3(uSunDir.x, max(0.42, uSunDir.y), uSunDir.z));
        float lambert = clamp(dot(nrm, lightDir), 0.0, 1.0);

        float erodeFade = 1.0 - smoothstep(0.68, 1.0, age + (1.0 - n0.b) * 0.18);

        if (isSmite < 0.5) {
          // 12-Pointed Celestial Sun-Rose & Compass Rose Sanctuary Mandala (crisp geometric astrolabe, zero cow-print noise!)
          float rotA = ang - uTime * (0.38 + seed * 0.12);
          float rotB = ang + uTime * 0.52;

          // 12-pointed outer Sun-Rose star & 6-pointed inner Compass Rose
          float star12Wave = cos(rotA * 12.0);
          float star12Reach = 0.78 + 0.14 * star12Wave;
          float star12Filigree = smoothstep(0.052, 0.0, abs(r - star12Reach));

          float compassWave = cos(rotB * 6.0);
          float compassReach = 0.48 + 0.12 * compassWave;
          float compassFiligree = smoothstep(0.048, 0.0, abs(r - compassReach));

          // Concentric astrolabe rings, radial spokes & 24 rune ticks
          float outerRing = smoothstep(0.055, 0.0, abs(r - 0.92));
          float zodiacBand = smoothstep(0.115, 0.02, abs(r - 0.78));
          float midRing = smoothstep(0.046, 0.0, abs(r - 0.63));
          float innerRing = smoothstep(0.046, 0.0, abs(r - 0.32));
          float centerMedallion = smoothstep(0.28, 0.18, r);
          float runeTicks =
            smoothstep(0.55, 0.90, cos(rotB * 24.0)) *
            smoothstep(0.09, 0.0, abs(r - 0.78));
          float radialSpokes =
            smoothstep(0.84, 0.97, cos(rotA * 12.0)) *
            smoothstep(0.92, 0.24, r);

          // Open-work astrolabe mask so valley ground breathes cleanly between concentric rings
          float geomMask = max(
            max(max(outerRing, midRing), max(innerRing, centerMedallion * 0.92)),
            max(max(star12Filigree, compassFiligree), max(zodiacBand * 0.88, radialSpokes * 0.90))
          );
          float totalMask = geomMask * erodeFade;

          if (totalMask < 0.45) discard;

          // Clean geometric 3-band Royal Sapphire & Solar Gold Astrolabe Base
          float radialBand = step(0.52, cos(rotA * 12.0) * 0.5 + 0.5);
          vec3 baseCol = mix(uColorCathInk, uColorCathCore, step(0.58, r) * radialBand);
          baseCol = mix(baseCol, uColorCathMid, centerMedallion * 0.75);

          float filigreeIntensity = clamp(
            (max(max(outerRing, midRing), max(innerRing, star12Filigree)) +
              compassFiligree * 0.94 +
              runeTicks * 0.88 +
              radialSpokes * 0.82) * min(1.2, charge),
            0.0,
            1.0
          );

          float azureAccent = clamp((compassFiligree * 0.92 + innerRing * 0.85 + runeTicks * 0.68), 0.0, 1.0);
          vec3 col = mix(baseCol * mix(0.88, 1.0, uDaylight), uColorAzureVein * 1.08, smoothstep(0.28, 0.70, azureAccent));
          col = mix(col, uColorCathFacet * 1.14, smoothstep(0.26, 0.58, filigreeIntensity));
          col = mix(col, uColorCathRim * 1.24, smoothstep(0.70, 0.94, filigreeIntensity));

          float border = 1.0 - smoothstep(0.45, 0.54, totalMask);
          col = mix(col, uColorCathInk, border);

          gl_FragColor = vec4(col, 1.0);
        } else {
          // Vitrified Obsidian-Wine Lichtenberg Smite Scar
          float branchWave = cos(ang * 12.0 + (n0.b - 0.5) * 3.5 - r * 2.3);
          float branchMask = smoothstep(0.48, 0.94, branchWave) * smoothstep(1.04, 0.14, r);
          float coreBasin = smoothstep(0.76 + (n0.b - 0.5) * 0.22, 0.40, r);
          float outerShock = smoothstep(0.055, 0.0, abs(r - 0.86 + (n0.b - 0.5) * 0.05));

          float mask = max(max(coreBasin * 0.92, branchMask * 0.96), outerShock * 0.92) * erodeFade;
          if (mask < 0.45) discard;

          vec3 col = mix(uColorObsidianPlum, uColorObsidianMid, step(0.46, lambert * 0.6 + h * 0.4));

          float filament = smoothstep(0.82, 0.98, branchWave) * smoothstep(0.96, 0.08, r);
          float vorFilament = smoothstep(0.76, 0.95, n1.r) * smoothstep(0.68, 0.14, r);
          float centerFlash = smoothstep(0.26, 0.04, r + (n0.b - 0.5) * 0.06);
          float electricIntensity = clamp(
            (max(filament, vorFilament * 0.85) + outerShock * 0.85 + centerFlash * 0.95) * min(1.15, charge),
            0.0,
            1.0
          );

          col = mix(col, uColorSmiteMid * 1.12, smoothstep(0.22, 0.56, electricIntensity));
          col = mix(col, uColorSmiteCore * 1.25, smoothstep(0.68, 0.94, electricIntensity));

          float border = 1.0 - smoothstep(0.45, 0.52, mask);
          col = mix(col, uColorSmiteInk, border * (1.0 - outerShock * 0.6));

          gl_FragColor = vec4(col, 1.0);
        }
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. Pooled, Deterministic ArtoriousVfxSystem (<= 4 Draw Calls Active)      */
/* ------------------------------------------------------------------------- */

const MAX_SKY_RIBBONS = 24;
const MAX_MONOLITHS = 24; // 8 in channel, 14 in smite, 24 in miracle Cathedral Crown
const MAX_PRISMS_AND_DEBRIS = 42;
const MAX_GROUND_SIGILS = 3;

const BALLISTIC_GRAVITY = -22.0;
const BALLISTIC_RESTITUTION = 0.32;

const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _euler = new THREE.Euler();
const _identityMat = new THREE.Matrix4();
const _bounceState = { y: 0, horizT: 0, spinT: 0 };

export class ArtoriousVfxSystem {
  constructor({
    scene,
    getGroundHeight = () => 0,
    config = {},
  } = {}) {
    this.scene = scene || null;
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

    this.mode = 'miracle'; // 'channel' | 'smite' | 'blessing' | 'miracle'
    this.suspense = false;
    this.isLooping = false;
    this.active = false;
    this.age = 0;
    this.totalDuration = 3.9;

    this.origin = new THREE.Vector3(59.8, 0, -4.0);
    this.partnerPos = new THREE.Vector3(59.1, 0, -2.05);
    this.hasPartner = true;
    this.enemyCenter = new THREE.Vector3(75.1, 0, -3.8);
    this.hasEnemyCenter = false;

    this._shakeOffset = new THREE.Vector3();
    this._hitstopScale = 1.0;

    this._buildMeshes();
    this._seedRecords(1.0);
  }

  _buildMeshes() {
    const c = this.config;

    // DC 1: Sky Ribbons & Petty Thunder-Spear (`skyRibbonsMesh`)
    const ribbonGeo = createOpaqueRibbonGeometry(48);
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

    // DC 2: Chiseled 7-Sided Obelisks, Fulgurite Spikes & 24-Spire Cathedral Crown (`monolithsMesh`)
    const monolithGeo = createGlacierCrystalGeometry({
      seed: 37.3,
      sides: 7,
      taper: 0.66,
      roughness: 0.11,
      bend: 0.46,
    });
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

    // DC 3: 3D Octahedral Starlight Prisms, Golden Wisteria Petals & Ballistic Soot Chunks (`prismsAndDebrisMesh`)
    const prismGeo = createStarlightCrystalGeometry({ points: 4 });
    this.debrisMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_PRISMS_AND_DEBRIS * 4),
      4
    );
    prismGeo.setAttribute('aDebrisMeta', this.debrisMetaAttr);
    this.debrisMat = createPrismsAndDebrisMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.prismsAndDebrisMesh = new THREE.InstancedMesh(
      prismGeo,
      this.debrisMat,
      MAX_PRISMS_AND_DEBRIS
    );
    this.prismsAndDebrisMesh.name = 'Artorious_DC3_PrismsAndDebris';
    this.prismsAndDebrisMesh.frustumCulled = false;
    this.prismsAndDebrisMesh.count = 0;
    this.group.add(this.prismsAndDebrisMesh);

    // DC 4: World-Space 3D-Relieved Sanctuary Mandala & Smite Scar (`groundSigilMesh`)
    const sigilGeo = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
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
    // 1. 8 Floating Golden Runic Astrolabe Obelisks (`channel` mode)
    //    Clearly levitating at waist-to-shoulder height (`y = ground + 1.35..1.72m`) around the hero!
    this.astrolabeRecords = [];
    for (let i = 0; i < 8; i++) {
      const s = seed * 17.3 + i * 23.1;
      this.astrolabeRecords.push({
        seed: hash11(s + 1.1) * 10.0,
        baseAng: (i / 8) * TAU,
        radius: 2.15 + signedHash(s + 2.3) * 0.10,
        baseHeight: 1.32 + (i % 2) * 0.24,
        scaleY: 0.54 + 0.14 * hash11(s + 3.7),
        scaleR: 0.22 + 0.06 * hash11(s + 4.9),
        tilt: 0.34 + 0.16 * hash11(s + 6.1),
      });
    }

    // 2. 14 Jagged Obsidian-Rose & Gold Fulgurite Spikes (`smite` mode)
    //    Parted / knee-high in the front camera window (`normAng < 1.45 || normAng > 5.70` facing +X/+Z camera)
    //    so the struck speaker is 100% visible!
    this.smiteSpikeRecords = [];
    for (let i = 0; i < 14; i++) {
      const s = seed * 29.7 + i * 19.3;
      const ang = (i / 14) * TAU + signedHash(s + 1.3) * 0.12;
      const normAng = ((ang % TAU) + TAU) % TAU;
      const inFrontCameraWindow = normAng < 1.45 || normAng > 5.70;
      this.smiteSpikeRecords.push({
        seed: hash11(s + 2.7) * 10.0,
        ang,
        radial: (inFrontCameraWindow ? 1.65 : 1.18) + 0.82 * hash11(s + 3.9),
        height: (inFrontCameraWindow ? 0.62 : 2.25) * (0.82 + 0.38 * hash11(s + 5.1)),
        radius: (inFrontCameraWindow ? 0.24 : 0.36) + 0.14 * hash11(s + 6.7),
        lean: 0.38 + 0.24 * hash11(s + 8.3),
        stagger: i * 0.012,
      });
    }

    // 3. 24-Spire Celestial Gold & Alabaster-Sapphire Cathedral Crown (`blessing` / `miracle` mode)
    //    - Slots 0..9: 10 Inner Sanctuary Ring Spires (`r = 2.45..2.95m`)
    //    - Slots 10..23: 14 Towering Stepped Outer Cathedral Apse Spires (`r = 3.45..4.55m`)
    //    - Front camera window (`normAng < 1.42 || normAng > 5.65` facing +X/+Z camera) is parted
    //      into low ankle/knee-high threshold spires (`0.52..0.74m`) so both partners are framed heroically in the center!
    this.cathedralSpireRecords = [];
    for (let i = 0; i < MAX_MONOLITHS; i++) {
      const s = seed * 43.1 + i * 31.7;
      const isOuter = i >= 10;
      const ringCount = isOuter ? 14 : 10;
      const ringIdx = isOuter ? i - 10 : i;
      const ang = (ringIdx / ringCount) * TAU + (isOuter ? 0.12 : 0.0) + signedHash(s + 1.1) * 0.08;
      const normAng = ((ang % TAU) + TAU) % TAU;
      const inFrontWindow = normAng < 1.42 || normAng > 5.65;

      // Stepped cathedral organ-pipe silhouette peaking behind the heroes (`normAng ~ PI + 0.65`)
      const rearArch = Math.max(0.0, -Math.cos(normAng - 0.65));
      const baseH = isOuter
        ? inFrontWindow
          ? 0.68
          : 2.55 + rearArch * 1.95
        : inFrontWindow
          ? 0.52
          : 1.48 + rearArch * 1.05;

      this.cathedralSpireRecords.push({
        isOuter,
        seed: hash11(s + 2.3) * 10.0,
        ang,
        radial: (isOuter ? 3.60 : 2.50) + 0.62 * hash11(s + 3.7) + (inFrontWindow ? 0.42 : 0.0),
        height: baseH * (0.88 + 0.24 * hash11(s + 5.1)),
        radius: (inFrontWindow ? 0.24 : isOuter ? 0.44 : 0.32) + 0.14 * hash11(s + 6.9),
        lean: (inFrontWindow ? 0.48 : isOuter ? 0.22 : 0.30) + 0.14 * hash11(s + 8.1),
        stagger: (isOuter ? 0.04 : 0.0) + ringIdx * 0.008,
        dissolveStagger: (hash11(s + 9.7) - 0.5) * 0.14,
      });
    }

    // 4. 42 Prisms, Golden Wisteria Petals & Ballistic Soot Chunks (`prismsAndDebrisMesh`)
    //    Ballistic soot angles in `smite` mode are routed around the flanks/rear or wider outer ring
    //    so they never fly in front of the struck speaker's face!
    this.debrisRecords = [];
    for (let i = 0; i < MAX_PRISMS_AND_DEBRIS; i++) {
      const s = seed * 61.3 + i * 17.9;
      const spanU = i / MAX_PRISMS_AND_DEBRIS;
      // Route ballistic angle over `1.35 .. TAU - 0.15` (clear of the +X/+Z front camera cone `0..1.25`)
      const ballisticAng = lerp(1.35, TAU - 0.12, spanU) + signedHash(s + 1.3) * 0.14;
      const swirlAng = spanU * TAU * 2.0 + signedHash(s + 1.3) * 0.22;
      const speed = 3.4 + 4.0 * hash11(s + 2.9);
      this.debrisRecords.push({
        seed: hash11(s + 4.1) * 10.0,
        ang: swirlAng,
        ballisticAng,
        orbitRadius: 1.35 + 2.95 * hash11(s + 5.3),
        climbSpeed: 1.8 + 2.4 * hash11(s + 6.7),
        heightOffset: hash11(s + 7.9) * 5.2,
        vx: Math.cos(ballisticAng) * speed,
        vz: Math.sin(ballisticAng) * speed,
        vy: 3.8 + 4.2 * hash11(s + 8.3),
        size: 0.15 + 0.14 * hash11(s + 9.1),
        isPetal: i % 2 === 1,
        dissolveStagger: (hash11(s + 10.3) - 0.5) * 0.15,
        spinX: signedHash(s + 11.1) * 6.2,
        spinY: signedHash(s + 12.7) * 6.2,
        spinZ: signedHash(s + 14.3) * 6.2,
      });
    }
  }

  _setPositions(origin, partnerPos = null, enemyCenter = null) {
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

  startChannel(origin, partnerPos = null) {
    this._setPositions(origin, partnerPos, null);
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

  setSuspense(isSuspense = true) {
    this.suspense = Boolean(isSuspense);
    return this;
  }

  triggerSmite(origin) {
    this._setPositions(origin, null, null);
    this.mode = 'smite';
    this.suspense = false;
    this.isLooping = false;
    this.active = true;
    this.age = 0;
    this.totalDuration = this.config.smiteLifetime + this.config.smiteFadeTime;
    this.group.visible = true;
    this.seek(0.01);
    return this;
  }

  triggerBlessing(origin, partnerPos = null) {
    this._setPositions(origin, partnerPos, null);
    this.mode = 'blessing';
    this.suspense = false;
    this.isLooping = false;
    this.active = true;
    this.age = 0;
    this.totalDuration = this.config.blessingDuration + this.config.blessingFadeTime;
    this.group.visible = true;
    this.seek(0.02);
    return this;
  }

  triggerMiracle(origin, partnerPos = null, enemyCenter = null) {
    this._setPositions(origin, partnerPos, enemyCenter);
    this.mode = 'miracle';
    this.suspense = false;
    this.isLooping = false;
    this.active = true;
    this.age = 0;
    this.totalDuration = this.config.miracleDuration + this.config.miracleFadeTime;
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

  getHitstopScale() {
    return this._hitstopScale;
  }

  seek(timeSeconds, options = null) {
    if (options && typeof options === 'object') {
      if (options.mode) {
        this.mode = String(options.mode).toLowerCase();
        this.isLooping = this.mode === 'channel';
        const c = this.config;
        if (this.mode === 'smite') {
          this.totalDuration = c.smiteLifetime + c.smiteFadeTime;
        } else if (this.mode === 'blessing') {
          this.totalDuration = c.blessingDuration + c.blessingFadeTime;
        } else if (this.mode === 'miracle') {
          this.totalDuration = c.miracleDuration + c.miracleFadeTime;
        } else {
          this.totalDuration = 9999.0;
        }
      }
      if (options.suspense !== undefined) {
        this.suspense = Boolean(options.suspense);
      }
      if (options.origin !== undefined || options.partnerPos !== undefined || options.enemyCenter !== undefined) {
        this._setPositions(
          options.origin ?? this.origin,
          options.partnerPos !== undefined ? options.partnerPos : this.hasPartner ? this.partnerPos : null,
          options.enemyCenter !== undefined ? options.enemyCenter : this.hasEnemyCenter ? this.enemyCenter : null
        );
      }
    }

    if (timeSeconds < 0 || (!this.isLooping && timeSeconds > this.totalDuration + 0.1)) {
      this.clear();
      return this;
    }

    this.active = true;
    this.age = timeSeconds;
    this.group.visible = true;

    const speedMult = this.mode === 'channel' && this.suspense ? 2.15 : 1.0;
    this.sharedUniforms.uTime.value = timeSeconds * speedMult;

    if (this.mode === 'smite') {
      this._evaluateSmite(timeSeconds);
    } else if (this.mode === 'channel') {
      this._evaluateChannel(timeSeconds);
    } else {
      this._evaluateMiracleOrBlessing(timeSeconds, this.mode === 'miracle');
    }

    return this;
  }

  _evaluateChannel(t) {
    const c = this.config;
    const ox = this.origin.x;
    const oz = this.origin.z;
    const oy = this.origin.y;
    const px = this.hasPartner ? this.partnerPos.x : ox;
    const pz = this.hasPartner ? this.partnerPos.z : oz;
    const py = this.hasPartner ? this.partnerPos.y : oy;

    // Frame the sanctuary around both partners when praying together
    const cx = this.hasPartner ? (ox + px) * 0.5 : ox;
    const cz = this.hasPartner ? (oz + pz) * 0.5 : oz;

    const emerge = smoothstep(0.0, 0.28, t);
    const orbitSpeed = this.suspense ? 3.2 : 1.35;

    // DC 1: Ascending Sun-Gold & Wisteria-Cyan Sanctuary Pillars (horseshoe around rear & flanks
    //       `ang = 1.68 .. TAU - 0.42` so the front camera view of both heroes is 100% unobstructed!)
    let rSlot = 0;
    for (let i = 0; i < 8; i++) {
      const spanU = i / 7;
      const ang = lerp(1.68, TAU - 0.42, spanU) + Math.sin(t * 0.6 + i) * 0.04;
      const rad = (this.hasPartner ? 2.75 : 2.25) + (i % 2) * 0.38;
      const sx = cx + Math.cos(ang) * rad;
      const sz = cz + Math.sin(ang) * rad;
      const sy = this.getGroundHeight(sx, sz) + 0.08;
      const topH = (12.5 + (i % 3) * 2.2) * emerge;

      const isAzure = i % 3 === 1 ? 2.0 : 0.0;
      const isPrimaryPillar = i % 2 === 0;
      const strandNorm = isPrimaryPillar ? 0.0 : 0.55;
      const width = isPrimaryPillar ? 0.22 : 0.14;
      const helixRad = isPrimaryPillar ? 0.0 : 0.10;

      this.startPosAttr.setXYZ(rSlot, sx, sy, sz);
      this.endPosAttr.setXYZ(rSlot, sx, sy + topH, sz);
      this.ribbonMetaAttr.setXYZW(rSlot, strandNorm, 1.1 + i * 1.7, width, emerge);
      this.ribbonStyleAttr.setXYZW(rSlot, isAzure, 0.0, helixRad, 0.0);
      rSlot++;
    }

    this.skyRibbonsMesh.count = rSlot;
    this.startPosAttr.needsUpdate = true;
    this.endPosAttr.needsUpdate = true;
    this.ribbonMetaAttr.needsUpdate = true;
    this.ribbonStyleAttr.needsUpdate = true;

    // DC 2: 8 Floating Golden Runic Astrolabe Obelisks orbiting around the sanctuary
    //       Stepped height: high waist-to-head levitation in the rear/flank apse, low knee-level
    //       levitation in the front camera window so neither hero's face is ever blocked!
    let mSlot = 0;
    const orbitRadBase = this.hasPartner ? 2.55 : 2.10;
    for (let i = 0; i < 8; i++) {
      const rec = this.astrolabeRecords[i];
      const ang = rec.baseAng + t * orbitSpeed;
      const normAng = ((ang % TAU) + TAU) % TAU;
      const frontFactor = Math.max(0.0, Math.cos(normAng - 0.62));
      const rad = orbitRadBase + (rec.radius - 2.15);
      const mx = cx + Math.cos(ang) * rad;
      const mz = cz + Math.sin(ang) * rad;
      const floatH = lerp(rec.baseHeight + 0.22, 0.55, Math.pow(frontFactor, 1.4));
      const my =
        this.getGroundHeight(mx, mz) +
        floatH +
        Math.sin(t * 3.4 + i * 1.1) * 0.12;

      _dummy.position.set(mx, my, mz);
      _pos.set(
        Math.cos(ang) * Math.sin(rec.tilt),
        Math.cos(rec.tilt),
        Math.sin(ang) * Math.sin(rec.tilt)
      ).normalize();
      _dummy.quaternion.setFromUnitVectors(UP, _pos);
      _dummy.rotateY(t * (this.suspense ? 4.2 : 1.8) + i);
      _dummy.scale.set(
        rec.scaleR * emerge,
        rec.scaleY * emerge,
        rec.scaleR * emerge
      );
      _dummy.updateMatrix();
      this.monolithsMesh.setMatrixAt(mSlot, _dummy.matrix);
      this.monolithMetaAttr.setXYZW(mSlot, rec.seed, this.suspense ? 1.28 : 1.05, 0.0, 0.0);
      mSlot++;
    }
    this.monolithsMesh.count = mSlot;
    this.monolithsMesh.instanceMatrix.needsUpdate = true;
    this.monolithMetaAttr.needsUpdate = true;

    // DC 3: 28 Ascending 3D Octahedral Starlight Prisms & Floating Golden Wisteria Petals
    let dSlot = 0;
    for (let i = 0; i < 28; i++) {
      const rec = this.debrisRecords[i];
      const swirlAng = rec.ang + t * (1.25 + (i % 3) * 0.35);
      const rad = 1.85 + (rec.orbitRadius * 0.65);
      const localH = ((rec.heightOffset + t * rec.climbSpeed) % 4.8) * emerge;
      const dx = cx + Math.cos(swirlAng) * rad;
      const dz = cz + Math.sin(swirlAng) * rad;
      const dy = this.getGroundHeight(dx, dz) + 0.45 + localH;

      _dummy.position.set(dx, dy, dz);
      _euler.set(t * rec.spinX * 0.5, swirlAng + t * rec.spinY * 0.5, t * rec.spinZ * 0.5);
      _dummy.quaternion.setFromEuler(_euler);
      const sc = rec.size * 0.90 * emerge;
      if (rec.isPetal) {
        _dummy.scale.set(sc * 1.15, sc * 0.38, sc * 0.78);
      } else {
        _dummy.scale.set(sc * 0.88, sc * 1.32, sc * 0.88);
      }
      _dummy.updateMatrix();
      this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
      this.debrisMetaAttr.setXYZW(dSlot, rec.seed, 1.12, 0.0, rec.isPetal ? 1.0 : 0.0);
      dSlot++;
    }
    this.prismsAndDebrisMesh.count = dSlot;
    this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
    this.debrisMetaAttr.needsUpdate = true;

    // DC 4: 12-Pointed Celestial Sun-Rose & Compass Rose Sanctuary Mandala
    let sSlot = 0;
    _dummy.position.set(ox, oy + 0.042, oz);
    _dummy.quaternion.setFromAxisAngle(UP, 0.0);
    _dummy.scale.set(c.channelSigilRadius, 1.0, c.channelSigilRadius);
    _dummy.updateMatrix();
    this.groundSigilMesh.setMatrixAt(sSlot, _dummy.matrix);
    this.sigilMetaAttr.setXYZW(sSlot, 0.0, emerge, 0.31, this.suspense ? 1.25 : 1.05);
    sSlot++;

    if (this.hasPartner) {
      const px = this.partnerPos.x;
      const pz = this.partnerPos.z;
      const py = this.partnerPos.y;
      _dummy.position.set(px, py + 0.040, pz);
      _dummy.quaternion.setFromAxisAngle(UP, 0.52);
      _dummy.scale.set(c.channelSigilRadius * 0.64, 1.0, c.channelSigilRadius * 0.64);
      _dummy.updateMatrix();
      this.groundSigilMesh.setMatrixAt(sSlot, _dummy.matrix);
      this.sigilMetaAttr.setXYZW(sSlot, 0.0, emerge, 0.77, 0.95);
      sSlot++;
    }
    this.groundSigilMesh.count = sSlot;
    this.groundSigilMesh.instanceMatrix.needsUpdate = true;
    this.sigilMetaAttr.needsUpdate = true;

    this._hitstopScale = 1.0;
    this._shakeOffset.set(0, 0, 0);
  }

  _evaluateSmite(t) {
    const c = this.config;
    const ox = this.origin.x;
    const oz = this.origin.z;
    const oy = this.origin.y;

    const snapReach = saturate(t / Math.max(0.015, c.smiteImpactTime));
    const impactElapsed = t - c.smiteImpactTime;
    const fadeU = saturate((t - c.smiteLifetime) / Math.max(0.1, c.smiteFadeTime));
    const boltSnapOff = smoothstep(c.smiteBoltSnapStart, c.smiteBoltSnapEnd, t);
    const strobeSeedJump = Math.floor(t * 24.0) * 1.37;

    // DC 1: Petty Rose-Gold & Crimson Thunder-Spear (`y = 22.0m -> ground + 0.8m` in 0.05s,
    // 24Hz strobe, 2 helical plasma coils + 8 radial ground-arc filaments, clean snap-off `0.34..0.44s`)
    let rSlot = 0;
    if (boltSnapOff < 0.995) {
      const skyY = oy + c.smiteSkyHeight;
      const hitY = oy + 0.80;
      const groundArcStartY = oy + 0.26;

      // Slot 0: Blazing Vertical Petty Thunder-Spear Core Shaft (tightened width so speaker's face is 100% readable)
      this.startPosAttr.setXYZ(rSlot, ox - 0.16, skyY, oz - 0.16);
      this.endPosAttr.setXYZ(rSlot, ox - 0.16, hitY, oz - 0.16);
      this.ribbonMetaAttr.setXYZW(rSlot, 0.0, 0.5 + strobeSeedJump * 0.25, 0.25, snapReach);
      this.ribbonStyleAttr.setXYZW(rSlot, 1.0, boltSnapOff, 0.0, 0.18);
      rSlot++;

      // Slots 1..2: 2 Helical Rose-Crimson Plasma Coils wrapping the vertical shaft at 24Hz
      const coilNorms = [-0.76, 0.76];
      for (let k = 0; k < 2; k++) {
        this.startPosAttr.setXYZ(rSlot, ox - 0.16, skyY, oz - 0.16);
        this.endPosAttr.setXYZ(rSlot, ox - 0.16, hitY, oz - 0.16);
        this.ribbonMetaAttr.setXYZW(
          rSlot,
          coilNorms[k],
          1.4 + k * 1.9 + strobeSeedJump,
          0.12,
          snapReach
        );
        this.ribbonStyleAttr.setXYZW(rSlot, 1.0, boltSnapOff, 0.32, 0.20);
        rSlot++;
      }

      // Slots 3..4: 2 Forked Sky-to-Fulgurite Secondary Branches
      if (impactElapsed >= 0) {
        const branchReach = saturate(impactElapsed / 0.045);
        for (let b = 0; b < 2; b++) {
          const spk = this.smiteSpikeRecords[b * 4 + 5];
          const tx = ox + Math.cos(spk.ang) * spk.radial;
          const tz = oz + Math.sin(spk.ang) * spk.radial;
          const ty = this.getGroundHeight(tx, tz) + 0.55;
          this.startPosAttr.setXYZ(rSlot, ox - 0.14, oy + 11.5 - b * 2.5, oz - 0.14);
          this.endPosAttr.setXYZ(rSlot, tx, ty, tz);
          this.ribbonMetaAttr.setXYZW(
            rSlot,
            b === 0 ? -0.45 : 0.45,
            9.1 + b * 3.7 + strobeSeedJump,
            0.13,
            branchReach
          );
          this.ribbonStyleAttr.setXYZW(rSlot, 1.0, boltSnapOff, 0.22, 0.30);
          rSlot++;
        }

        // Slots 5..12: 8 Radial Ground-Arc Filaments skittering across the crater floor to surrounding fulgurite spikes
        const arcReach = saturate(impactElapsed / 0.055);
        for (let a = 0; a < 8 && rSlot < MAX_SKY_RIBBONS; a++) {
          const spk = this.smiteSpikeRecords[(a * 2 + 1) % this.smiteSpikeRecords.length];
          const ax = ox + Math.cos(spk.ang) * spk.radial;
          const az = oz + Math.sin(spk.ang) * spk.radial;
          const ay = this.getGroundHeight(ax, az) + 0.32;
          const isPrimaryArc = a % 2 === 0;
          this.startPosAttr.setXYZ(rSlot, ox, groundArcStartY, oz);
          this.endPosAttr.setXYZ(rSlot, ax, ay, az);
          this.ribbonMetaAttr.setXYZW(
            rSlot,
            isPrimaryArc ? 0.0 : 0.52,
            21.3 + a * 2.9 + strobeSeedJump,
            isPrimaryArc ? 0.13 : 0.09,
            arcReach
          );
          this.ribbonStyleAttr.setXYZW(rSlot, 1.0, boltSnapOff, 0.12, 0.22);
          rSlot++;
        }
      }
    }
    this.skyRibbonsMesh.count = rSlot;
    this.startPosAttr.needsUpdate = true;
    this.endPosAttr.needsUpdate = true;
    this.ribbonMetaAttr.needsUpdate = true;
    this.ribbonStyleAttr.needsUpdate = true;

    // DC 2: 14 Jagged Obsidian-Rose & Gold Fulgurite Spikes (100% scale, ZERO shrinking or floor sinking!)
    let mSlot = 0;
    if (impactElapsed >= -0.02) {
      const tImp = Math.max(0.01, impactElapsed + 0.02);
      const emerge = outQuint(Math.min(1.0, tImp / 0.11));

      for (let i = 0; i < this.smiteSpikeRecords.length; i++) {
        const rec = this.smiteSpikeRecords[i];
        const dissolveProgress = smoothstep(0.36, 0.98, fadeU + rec.stagger);
        if (dissolveProgress >= 0.995) continue;

        const spikeCharge = 1.26 * (1.0 - smoothstep(0.0, 0.48, fadeU + rec.stagger));
        const sx = ox + Math.cos(rec.ang) * rec.radial;
        const sz = oz + Math.sin(rec.ang) * rec.radial;
        const sy = this.getGroundHeight(sx, sz) - 0.14;

        _dummy.position.set(sx, sy, sz);
        _pos.set(
          Math.cos(rec.ang) * Math.sin(rec.lean),
          Math.cos(rec.lean),
          Math.sin(rec.ang) * Math.sin(rec.lean)
        ).normalize();
        _dummy.quaternion.setFromUnitVectors(UP, _pos);
        // Keep at 100% erupted scale — NEVER shrink or sink on dissolution!
        _dummy.scale.set(
          rec.radius * emerge,
          rec.height * emerge,
          rec.radius * emerge
        );
        _dummy.updateMatrix();
        this.monolithsMesh.setMatrixAt(mSlot, _dummy.matrix);
        this.monolithMetaAttr.setXYZW(mSlot, rec.seed, spikeCharge, dissolveProgress, 1.0);
        mSlot++;
      }
    }
    this.monolithsMesh.count = mSlot;
    this.monolithsMesh.instanceMatrix.needsUpdate = true;
    this.monolithMetaAttr.needsUpdate = true;

    // DC 3: 24 Ballistic Rose-Obsidian Soot Chunks that bounce on the dirt and crumble into ash!
    //       Spawned outside a 0.72m radial ring around the speaker so her face is never occluded!
    let dSlot = 0;
    if (impactElapsed >= 0) {
      for (let i = 0; i < 24; i++) {
        const rec = this.debrisRecords[i];
        const dissolveProgress = smoothstep(0.38, 0.98, fadeU + rec.dissolveStagger);
        if (dissolveProgress >= 0.995) continue;

        const chunkHeat = 1.22 * (1.0 - smoothstep(0.05, 0.45, fadeU + rec.dissolveStagger));
        const startR = 0.72;
        const sx = ox + Math.cos(rec.ballisticAng) * startR;
        const sz = oz + Math.sin(rec.ballisticAng) * startR;
        const approxX = sx + rec.vx * 0.35;
        const approxZ = sz + rec.vz * 0.35;
        const floorY = this.getGroundHeight(approxX, approxZ) + rec.size * 0.45;

        evalOneBounceBallistic(
          impactElapsed,
          oy + 0.36,
          rec.vy,
          BALLISTIC_GRAVITY,
          BALLISTIC_RESTITUTION,
          floorY,
          _bounceState
        );

        const cx = sx + rec.vx * _bounceState.horizT * 0.68;
        const cz = sz + rec.vz * _bounceState.horizT * 0.68;
        const cy = _bounceState.y;

        _dummy.position.set(cx, cy, cz);
        _euler.set(
          rec.spinX * _bounceState.spinT,
          rec.ballisticAng + rec.spinY * _bounceState.spinT,
          rec.spinZ * _bounceState.spinT
        );
        _dummy.quaternion.setFromEuler(_euler);
        const sc = rec.size * 1.12;
        _dummy.scale.set(sc * 1.05, sc * 0.85, sc * 1.08);
        _dummy.updateMatrix();
        this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
        this.debrisMetaAttr.setXYZW(dSlot, rec.seed, chunkHeat, dissolveProgress, 2.0);
        dSlot++;
      }
    }
    this.prismsAndDebrisMesh.count = dSlot;
    this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
    this.debrisMetaAttr.needsUpdate = true;

    // DC 4: Vitrified Obsidian-Wine Lichtenberg Smite Scar
    let sSlot = 0;
    const scarFade = 1.0 - smoothstep(0.55, 1.0, fadeU);
    if (impactElapsed >= -0.02 && scarFade > 0.02) {
      const tScar = Math.max(0.01, impactElapsed + 0.02);
      const reach = smoothstep(0.0, 0.12, tScar);
      _dummy.position.set(ox, oy + 0.042, oz);
      _dummy.quaternion.setFromAxisAngle(UP, 0.25);
      _dummy.scale.set(c.smiteScarRadius, 1.0, c.smiteScarRadius);
      _dummy.updateMatrix();
      this.groundSigilMesh.setMatrixAt(sSlot, _dummy.matrix);
      // Negative signedCharge (-1.15) selects Petty Smite Scar mode in shader!
      this.sigilMetaAttr.setXYZW(sSlot, fadeU, reach, 0.43, -1.15 * scarFade);
      sSlot++;
    }
    this.groundSigilMesh.count = sSlot;
    this.groundSigilMesh.instanceMatrix.needsUpdate = true;
    this.sigilMetaAttr.needsUpdate = true;

    // Hitstop & Damped Camera Shake
    this._hitstopScale = Math.abs(t - c.smiteImpactTime) <= 0.035 ? 0.05 : 1.0;
    if (impactElapsed >= 0 && impactElapsed <= 0.48) {
      const env = Math.exp(-impactElapsed * 6.8) * 0.18;
      this._shakeOffset.set(
        Math.sin(impactElapsed * 64.0) * env * 0.75,
        Math.abs(Math.cos(impactElapsed * 56.0)) * env,
        Math.cos(impactElapsed * 58.0) * env * 0.75
      );
    } else {
      this._shakeOffset.set(0, 0, 0);
    }
  }

  _evaluateMiracleOrBlessing(t, isFullMiracle = true) {
    const c = this.config;
    const holdDur = isFullMiracle ? c.miracleDuration : c.blessingDuration;
    const fadeDur = isFullMiracle ? c.miracleFadeTime : c.blessingFadeTime;
    const fadeU = saturate((t - holdDur) / Math.max(0.1, fadeDur));

    const ox = this.origin.x;
    const oz = this.origin.z;
    const oy = this.origin.y;
    const px = this.hasPartner ? this.partnerPos.x : ox - 0.7;
    const pz = this.hasPartner ? this.partnerPos.z : oz + 1.95;
    const py = this.hasPartner ? this.partnerPos.y : oy;

    // Center the Cathedral Crown & Grand Mandala between both partners!
    const cx = this.hasPartner ? (ox + px) * 0.5 : ox;
    const cz = this.hasPartner ? (oz + pz) * 0.5 : oz;
    const cy = this.getGroundHeight(cx, cz);

    const skyReach = smoothstep(0.0, 0.22, t);
    const ribbonErode = smoothstep(0.15, 0.92, fadeU);

    // DC 1: Ascending Celestial Sun-Gold & Wisteria-Cyan Sky-Parting God-Ray Pillars (`y = 0..18m`)
    //       Arranged in a grand cathedral apse horseshoe (`ang = 1.48 .. TAU - 0.20`) behind & flanking both partners
    //       so the front camera window framing the Knight & Mage is 100% clear (zero overhead noodle arches!)
    let rSlot = 0;
    if (ribbonErode < 0.995) {
      // 1a. 4 Grand Vertical Sky-Parting God-Ray Pillars flanking the cathedral apse
      const pillarOffsets = [
        [-2.75, -1.85],
        [-2.85, 1.45],
        [-1.15, -3.45],
        [-1.35, 3.25],
      ];
      const pillarCount = isFullMiracle ? 4 : 2;
      for (let p = 0; p < pillarCount; p++) {
        const gx = cx + pillarOffsets[p][0];
        const gz = cz + pillarOffsets[p][1];
        const gy = this.getGroundHeight(gx, gz) + 0.1;
        this.startPosAttr.setXYZ(rSlot, gx, gy, gz);
        this.endPosAttr.setXYZ(rSlot, gx, gy + c.skyHeight, gz);
        this.ribbonMetaAttr.setXYZW(rSlot, 0.0, 2.1 + p * 2.3, 0.30, skyReach);
        this.ribbonStyleAttr.setXYZW(rSlot, p % 2 === 1 ? 2.0 : 0.0, ribbonErode, 0.0, 0.0);
        rSlot++;
      }

      // 1b. 10 Stately Vertical & Gently-Braided Sun-Gold & Wisteria-Cyan Sky Columns (`y = 0..18m`) in the cathedral horseshoe
      const helixCount = isFullMiracle ? 10 : 6;
      for (let h = 0; h < helixCount && rSlot < MAX_SKY_RIBBONS; h++) {
        const spanU = h / Math.max(1, helixCount - 1);
        const ang = lerp(1.48, TAU - 0.20, spanU);
        const rad = (isFullMiracle ? 3.35 : 2.65) + (h % 2) * 0.65;
        const hx = cx + Math.cos(ang) * rad;
        const hz = cz + Math.sin(ang) * rad;
        const hy = this.getGroundHeight(hx, hz) + 0.08;
        const isAzure = h % 3 === 1 ? 2.0 : 0.0;
        const isStraightRay = h % 2 === 0;
        const strandNorm = isStraightRay ? 0.0 : 0.55;
        const helixRad = isStraightRay ? 0.0 : 0.12;

        this.startPosAttr.setXYZ(rSlot, hx, hy, hz);
        this.endPosAttr.setXYZ(rSlot, hx, hy + c.skyHeight * 0.95, hz);
        this.ribbonMetaAttr.setXYZW(
          rSlot,
          strandNorm,
          11.7 + h * 1.9,
          isStraightRay ? 0.24 : 0.15,
          skyReach
        );
        this.ribbonStyleAttr.setXYZW(rSlot, isAzure, ribbonErode, helixRad, 0.0);
        rSlot++;
      }
    }
    this.skyRibbonsMesh.count = rSlot;
    this.startPosAttr.needsUpdate = true;
    this.endPosAttr.needsUpdate = true;
    this.ribbonMetaAttr.needsUpdate = true;
    this.ribbonStyleAttr.needsUpdate = true;

    // DC 2: 24-Spire Celestial Gold & Alabaster-Sapphire Cathedral Crown
    //       Erupts in a stepped ring around both partners (with parted front camera window)
    //       and sublimates via Voronoi fracture erosion at 100% scale (ZERO shrinking or floor sinking!)
    let mSlot = 0;
    const totalSpires = isFullMiracle ? MAX_MONOLITHS : 16;
    const scaleMult = isFullMiracle ? 1.0 : 0.80;

    for (let i = 0; i < totalSpires; i++) {
      const rec = this.cathedralSpireRecords[i];
      const tLocal = t - rec.stagger;
      if (tLocal <= 0) continue;

      const dissolveProgress = smoothstep(0.05, 0.96, fadeU + rec.dissolveStagger);
      if (dissolveProgress >= 0.995) continue;

      const emerge = outQuint(Math.min(1.0, tLocal / 0.18));
      const spireCharge = 1.25 * (1.0 - smoothstep(0.0, 0.55, fadeU + rec.dissolveStagger));

      const sx = cx + Math.cos(rec.ang) * rec.radial * scaleMult;
      const sz = cz + Math.sin(rec.ang) * rec.radial * scaleMult;
      const sy = this.getGroundHeight(sx, sz) - 0.16;

      _dummy.position.set(sx, sy, sz);
      _pos.set(
        Math.cos(rec.ang) * Math.sin(rec.lean),
        Math.cos(rec.lean),
        Math.sin(rec.ang) * Math.sin(rec.lean)
      ).normalize();
      _dummy.quaternion.setFromUnitVectors(UP, _pos);
      // Keep at 100% erupted scale — NEVER shrink or sink on dissolution!
      _dummy.scale.set(
        rec.radius * scaleMult * emerge,
        rec.height * scaleMult * emerge,
        rec.radius * scaleMult * emerge
      );
      _dummy.updateMatrix();
      this.monolithsMesh.setMatrixAt(mSlot, _dummy.matrix);
      this.monolithMetaAttr.setXYZW(mSlot, rec.seed, spireCharge, dissolveProgress, 0.0);
      mSlot++;
    }
    this.monolithsMesh.count = mSlot;
    this.monolithsMesh.instanceMatrix.needsUpdate = true;
    this.monolithMetaAttr.needsUpdate = true;

    // DC 3: 42 Solid 3D Octahedral Starlight Prisms & Floating Golden Wisteria Petals
    let dSlot = 0;
    const prismCount = isFullMiracle ? MAX_PRISMS_AND_DEBRIS : 28;
    for (let i = 0; i < prismCount; i++) {
      const rec = this.debrisRecords[i];
      const dissolveProgress = smoothstep(0.25, 0.96, fadeU + rec.dissolveStagger);
      if (dissolveProgress >= 0.995) continue;

      const swirlAng = rec.ang + t * (1.45 + (i % 3) * 0.35);
      const rad = (1.85 + rec.orbitRadius * 0.85) * scaleMult;
      const localH = ((rec.heightOffset + t * rec.climbSpeed * 1.15) % 6.2) * skyReach;
      const dx = cx + Math.cos(swirlAng) * rad;
      const dz = cz + Math.sin(swirlAng) * rad;
      const dy = this.getGroundHeight(dx, dz) + 0.45 + localH;

      _dummy.position.set(dx, dy, dz);
      _euler.set(t * rec.spinX * 0.6, swirlAng + t * rec.spinY * 0.6, t * rec.spinZ * 0.6);
      _dummy.quaternion.setFromEuler(_euler);
      const sc = rec.size * 1.05 * skyReach;
      if (rec.isPetal) {
        _dummy.scale.set(sc * 1.18, sc * 0.38, sc * 0.80);
      } else {
        _dummy.scale.set(sc * 0.92, sc * 1.38, sc * 0.92);
      }
      _dummy.updateMatrix();
      this.prismsAndDebrisMesh.setMatrixAt(dSlot, _dummy.matrix);
      this.debrisMetaAttr.setXYZW(dSlot, rec.seed, 1.24, dissolveProgress, rec.isPetal ? 1.0 : 0.0);
      dSlot++;
    }
    this.prismsAndDebrisMesh.count = dSlot;
    this.prismsAndDebrisMesh.instanceMatrix.needsUpdate = true;
    this.debrisMetaAttr.needsUpdate = true;

    // DC 4: 12-Pointed Celestial Sun-Rose & Compass Rose Sanctuary Mandala
    let sSlot = 0;
    if (fadeU < 0.99) {
      const reach = smoothstep(0.0, 0.24, t);
      const mainRad = isFullMiracle ? c.miracleSigilRadius : c.channelSigilRadius * 1.18;

      _dummy.position.set(cx, cy + 0.042, cz);
      _dummy.quaternion.setFromAxisAngle(UP, 0.0);
      _dummy.scale.set(mainRad, 1.0, mainRad);
      _dummy.updateMatrix();
      this.groundSigilMesh.setMatrixAt(sSlot, _dummy.matrix);
      this.sigilMetaAttr.setXYZW(sSlot, fadeU, reach, 0.23, 1.28);
      sSlot++;

      if (this.hasPartner) {
        _dummy.position.set(ox, oy + 0.045, oz);
        _dummy.quaternion.setFromAxisAngle(UP, 0.42);
        _dummy.scale.set(2.35, 1.0, 2.35);
        _dummy.updateMatrix();
        this.groundSigilMesh.setMatrixAt(sSlot, _dummy.matrix);
        this.sigilMetaAttr.setXYZW(sSlot, fadeU, reach, 0.61, 1.18);
        sSlot++;

        _dummy.position.set(px, py + 0.045, pz);
        _dummy.quaternion.setFromAxisAngle(UP, -0.42);
        _dummy.scale.set(2.35, 1.0, 2.35);
        _dummy.updateMatrix();
        this.groundSigilMesh.setMatrixAt(sSlot, _dummy.matrix);
        this.sigilMetaAttr.setXYZW(sSlot, fadeU, reach, 0.89, 1.18);
        sSlot++;
      }
    }
    this.groundSigilMesh.count = sSlot;
    this.groundSigilMesh.instanceMatrix.needsUpdate = true;
    this.sigilMetaAttr.needsUpdate = true;

    // Crisp hitstop & warm cathedral resonance shake on initial miracle burst
    this._hitstopScale = t >= 0.04 && t <= 0.09 ? 0.12 : 1.0;
    if (t >= 0.02 && t <= 0.55) {
      const env = Math.exp(-(t - 0.02) * 5.5) * (isFullMiracle ? 0.14 : 0.08);
      this._shakeOffset.set(
        Math.sin(t * 42.0) * env * 0.6,
        Math.abs(Math.cos(t * 48.0)) * env,
        Math.cos(t * 38.0) * env * 0.6
      );
    } else {
      this._shakeOffset.set(0, 0, 0);
    }
  }

  update(dt) {
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
    };
  }

  clear() {
    this.active = false;
    this.isLooping = false;
    this.suspense = false;
    this.age = 0;
    this._shakeOffset.set(0, 0, 0);
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
