// ============================================================================
// world/assets/vfx/sword-vfx.js
//
// Stage 4 Pass 2: Opaque *Demon Slayer* Sword Breathing & Physical Detonations
//
// Visual & Engineering Contract:
// - Strictly <= 4 draw calls when active, 0 draw calls when idle:
//     1. `sheathMesh` (1 Mesh attached to `knightChar.equippedWeapons['handSlot.r']`
//        with `userData.isVfx = true`): Sleek, blade-hugging 3D elemental sheath
//        with serrated Ukiyo-e flame/frost/storm edge tongues above the crossguard
//        (`y = 0.22..1.46`), `transparent: false, depthWrite: true, side: THREE.FrontSide`,
//        hard `discard` < 0.45.
//     2. `slashRibbonMesh` (1 InstancedMesh): Broad, camera-legible 3D crescent
//        Ukiyo-e Slash Arc Ribbons sweeping from the Knight's sword cleave plane
//        through the target + low ground-hugging detonation shockwave crests
//        (`transparent: false, depthWrite: true, side: THREE.FrontSide`, hard
//        `discard` < 0.45, 3-band cel colors + woodblock ink striations).
//     3. `shrapnelMesh` (1 InstancedMesh): Solid 3D elemental slash-wake fangs &
//        radial detonation crystal/magma/fulgurite crowns (`shatterblow`: 24
//        luminous V1 cerulean-sapphire glacier spires; `solar_flare`: erupting
//        solar flame-magma spires + cinders; `thunderchain`: radial obsidian-gold
//        fulgurite monoliths), `transparent: false, depthWrite: true, side: THREE.FrontSide`.
//     4. `detonationDecalMesh` (1 InstancedMesh): 3D height-field snow-rime /
//        volcanic-slag / fulgurite-scar ground detonation plate (`transparent: false`,
//        hard `discard` < 0.45).
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
    // Exact Locked V1 Luminous Glacial Cerulean Subsurface Palette
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
    // Blazing Hinokami Solar-Magma Palette
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
});

// tiltZ around -0.56..-0.62 rad (-33°) banks the crescent face toward the 3rd-person
// camera while sweeping across the target's torso so both the Ukiyo-e wave pattern
// and the target's head/shoulders remain 100% visible!
export const SWING_CONFIGS = Object.freeze({
  combo1: { tiltZ: -0.48, pitchX: 0.16, radius: 2.32, arcSpan: Math.PI * 1.22, duration: 0.38 },
  combo2: { tiltZ: -0.58, pitchX: 0.20, radius: 2.36, arcSpan: Math.PI * 1.26, duration: 0.40 },
  combo3: { tiltZ: -0.54, pitchX: 0.18, radius: 2.40, arcSpan: Math.PI * 1.30, duration: 0.46 },
  charged: { tiltZ: -0.35, pitchX: 0.10, radius: 2.90, arcSpan: Math.PI * 1.96, duration: 0.56 },
  intercept: { tiltZ: -0.52, pitchX: 0.16, radius: 2.75, arcSpan: Math.PI * 1.15, duration: 0.42 },
});

function normalizeStyleKey(style) {
  if (!style) return 'none';
  const s = String(style).toLowerCase();
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
/* 1. Procedural Closed Outward-Wound Geometries (`side: THREE.FrontSide`)   */
/* ------------------------------------------------------------------------- */

/**
 * Closed 3D Blade Sheath geometry in `sword_1handed.gltf` local coordinates:
 * Encloses KayKit's stylized blade (`widthX = 0.134, thickZ = 0.056`) from crossguard
 * (`y = 0.22`) to tip (`y = 1.48`) without swelling wider than the crossguard.
 */
export function createBladeSheathGeometry({ rings = 16, cols = 10 } = {}) {
  const ringPts = [];
  for (let r = 0; r < rings; r++) {
    const v = r / (rings - 1);
    const y = lerp(0.22, 1.48, v);
    // Matches KayKit sword_1handed blade envelope + 8mm elemental sheath clearance, tapering from v = 0.72 to tip
    const taper =
      v < 0.72
        ? lerp(0.92, 1.0, v / 0.72)
        : lerp(1.0, 0.08, (v - 0.72) / 0.28);
    const widthX = 0.134 * taper;
    const thickZ = 0.056 * taper;

    const pts = [];
    for (let c = 0; c < cols; c++) {
      const u = c / cols;
      const ang = u * TAU;
      const edgePow = Math.pow(Math.abs(Math.cos(ang)), 2.2);
      const serration = 1.0 + 0.18 * edgePow * (0.55 + 0.45 * Math.sin(v * Math.PI * 5.0));
      const x = Math.cos(ang) * widthX * serration;
      const z = Math.sin(ang) * thickZ;
      const radialEdge = Math.abs(Math.cos(ang)); // 0 along flat spine, 1 at outer blade edge fins
      pts.push({ pos: [x, y, z], u, v, radialEdge });
    }
    ringPts.push(pts);
  }

  const baseCenter = [0, 0.20, 0];
  const tipCenter = [0, 1.52, 0];
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

/**
 * Sleek, sculptural 3D Crescent Ukiyo-e Slash Arc Geometry in the local XZ plane
 * centered on +Z (forward), with `innerR = 0.64..outerR = 1.04` so it sweeps
 * cleanly across the enemy torso without blocking their silhouette.
 */
export function createUkiyoeSlashArcGeometry({ steps = 48 } = {}) {
  const arcSpan = Math.PI * 1.26;
  const innerR = 0.64;
  const outerR = 1.04;
  const halfThickY = 0.068;

  const rings = [];
  for (let i = 0; i < steps; i++) {
    const u = i / (steps - 1);
    const endTaper = Math.sin(u * Math.PI);
    const headSwell = Math.sin(Math.pow(u, 0.85) * Math.PI);
    const ang = (u - 0.48) * arcSpan;
    const sinA = Math.sin(ang);
    const cosA = Math.cos(ang);

    const rIn = lerp(0.86, innerR, headSwell);
    const rMid = lerp(0.91, (innerR + outerR) * 0.54, headSwell);
    const rOut = lerp(0.96, outerR, Math.pow(endTaper, 0.45));
    const hY = halfThickY * Math.pow(endTaper, 0.55);

    rings.push([
      { pos: [sinA * rOut, 0.0, cosA * rOut], u, v: 1.0 },
      { pos: [sinA * rMid, hY, cosA * rMid], u, v: 0.60 },
      { pos: [sinA * rIn, 0.0, cosA * rIn], u, v: 0.0 },
      { pos: [sinA * rMid, -hY, cosA * rMid], u, v: 0.60 },
    ]);
  }

  const positions = [];
  const uvs = [];

  const pushTri = (a, b, c) => {
    positions.push(a.pos[0], a.pos[1], a.pos[2], b.pos[0], b.pos[1], b.pos[2], c.pos[0], c.pos[1], c.pos[2]);
    uvs.push(a.u, a.v, b.u, b.v, c.u, c.v);
  };

  for (let i = 0; i < steps - 1; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    for (let k = 0; k < 4; k++) {
      const kNext = (k + 1) % 4;
      const a = r0[k];
      const b = r1[k];
      const c = r1[kNext];
      const d = r0[kNext];
      pushTri(a, b, c);
      pushTri(a, c, d);
      pushTri(a, c, b);
      pushTri(a, d, c);
    }
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
      uColorBand0: { value: new THREE.Color(pal.band0) },
      uColorBand1: { value: new THREE.Color(pal.band1) },
      uColorBand2: { value: new THREE.Color(pal.band2) },
      uColorInk: { value: new THREE.Color(pal.ink) },
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
      uniform vec3 uColorBand0;
      uniform vec3 uColorBand1;
      uniform vec3 uColorBand2;
      uniform vec3 uColorInk;

      varying vec2 vUv;
      varying float vEdgeFactor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        // Scroll smooth FBM (channel B/G, never cellular Voronoi scribbles!) upward along the blade
        vec2 scrollUv = vec2(vUv.x * 1.4, vUv.y * 1.35 - uTime * 2.4);
        vec4 nSample = texture2D(uNoiseAtlas, scrollUv);

        // Carve licking Ukiyo-e flame/frost tongues along the outer cutting edges
        float coreSolid = 1.0 - vEdgeFactor * 0.78;
        float flowWave = nSample.b * 0.58 + nSample.g * 0.42;
        float tongueMask = coreSolid + flowWave * 0.56 * smoothstep(1.0, 0.12, vUv.y * 0.35);
        if (tongueMask < 0.45) discard;

        // 3-Band Ukiyo-e Blade Aura: Blazing central spine ridge -> vibrant mid body -> deep edge & ink rim
        float striation = sin(vEdgeFactor * 10.0 - vUv.y * 8.0 + nSample.b * 3.5) * 0.08;
        float bandScore = (1.0 - vEdgeFactor) * 0.74 + flowWave * 0.28 + striation;
        vec3 col = uColorBand0;
        col = mix(col, uColorBand1 * 1.04, step(0.38, bandScore));
        col = mix(col, uColorBand2 * 1.18, step(0.68, bandScore));

        float border = 1.0 - smoothstep(0.45, 0.54, tongueMask);
        float rimInk = 1.0 - smoothstep(0.14, 0.24, ndv);
        col = mix(col, uColorInk, max(border, rimInk * 0.82));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createSlashArcMaterial(noiseAtlas, sharedUniforms) {
  return new THREE.ShaderMaterial({
    name: 'SwordVfxUkiyoeSlashArcMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uColorBand0: sharedUniforms.uSlashBand0,
      uColorBand1: sharedUniforms.uSlashBand1,
      uColorBand2: sharedUniforms.uSlashBand2,
      uColorInk: sharedUniforms.uSlashInk,
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSlashMeta; // x: progress (0..1), y: seed, z: role, w: intensity
      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vMeta = aSlashMeta;

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
      uniform vec3 uColorBand0;
      uniform vec3 uColorBand1;
      uniform vec3 uColorBand2;
      uniform vec3 uColorInk;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        float progress = clamp(vMeta.x, 0.0, 1.0);
        float seed = vMeta.y;
        float intensity = vMeta.w;
        if (intensity <= 0.01 || progress >= 1.0) discard;

        // vUv.x is along the arc (0 = Knight sword tail, 1 = leading cleave head); vUv.y is radial (0 = inner wake, 1 = outer razor edge)
        float headFront = clamp(progress * 1.65 + 0.35, 0.0, 1.04);
        float tailErase = clamp((progress - 0.45) * 1.25, 0.0, 0.92);
        if (vUv.x > headFront || vUv.x < tailErase) discard;

        vec2 nUv = vec2(vUv.x * 2.2 - uTime * 2.0 + seed * 0.41, vUv.y * 1.35 + seed * 0.73);
        vec4 n0 = texture2D(uNoiseAtlas, nUv);
        vec4 n1 = texture2D(uNoiseAtlas, nUv * 1.9 + vec2(0.37, 0.61));

        // Ukiyo-e woodblock flame/wave tongues trailing along the inner wake (vUv.y -> 0) and tail
        float arcWindow = smoothstep(tailErase, tailErase + 0.14, vUv.x) * smoothstep(headFront, headFront - 0.10, vUv.x);
        float radialWeight = smoothstep(0.0, 0.64, vUv.y);
        float waveNoise = n0.b * 0.60 + n1.g * 0.40;
        float erodedMask = (radialWeight * 0.76 + waveNoise * 0.46) * arcWindow * intensity;

        // Hard alphaTest cutout (strictly >= 0.45, zero transparent fog!)
        if (erodedMask < 0.45) discard;

        // Bold Ukiyo-e concentric flow striations + 3-Band Demon Slayer Breathing Crescent
        float striation = sin(vUv.y * 18.0 + n0.b * 5.0 - vUv.x * 7.5) * 0.15;
        float celScore = vUv.y * 0.68 + n1.b * 0.24 + striation;
        vec3 col = uColorBand0;
        col = mix(col, uColorBand1 * 1.05, step(0.40, celScore));
        col = mix(col, uColorBand2 * 1.20, step(0.72, celScore));

        // Crisp sumi-ink woodblock border along the cutout tongues, internal wave ribs, and outer razor spine
        float cutoutInk = 1.0 - smoothstep(0.45, 0.54, erodedMask);
        float outerRazorInk = smoothstep(0.94, 0.995, vUv.y);
        float waveRibInk = smoothstep(0.035, 0.0, abs(celScore - 0.40)) * 0.65;
        col = mix(col, uColorInk, max(max(cutoutInk, outerRazorInk * 0.85), waveRibInk));

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
      uColorCore: sharedUniforms.uChipCore,
      uColorDeep: sharedUniforms.uChipDeep,
      uColorMid: sharedUniforms.uChipMid,
      uColorLit: sharedUniforms.uChipLit,
      uColorSeam: sharedUniforms.uChipSeam,
      uColorInk: sharedUniforms.uSlashInk,
    },
    vertexShader: /* glsl */ `
      attribute vec4 aChipMeta; // x: seed, y: glow, z: isAirborne (0=grounded spire, 1=slash fang), w: unused
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
      uniform vec3 uColorCore;
      uniform vec3 uColorDeep;
      uniform vec3 uColorMid;
      uniform vec3 uColorLit;
      uniform vec3 uColorSeam;
      uniform vec3 uColorInk;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec4 vMeta;

      void main() {
        float seed = vMeta.x;
        float glowBoost = vMeta.y;
        float isAirborne = vMeta.z;

        // 1. Locked V1 Horizontal-Azimuth Optical Thickness & Derivative-Flat Facets
        //    (Guarantees Shatterblow spires in 12 match Frost Lance 03 and never turn pitch-black!)
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

        vec3 body = mix(uColorLit, uColorDeep, thickness);
        body = mix(body, uColorSeam, veins * 0.30);
        body = mix(body, uColorSeam, cracks * 0.28);

        // 3. Basal Rime / Ember Surge on Ground-Rooted Spires
        float hLocal = clamp(vLocalPos.y, 0.0, 1.0);
        float rimeFbm = texture2D(uNoiseAtlas, vLocalPos.xy * 1.35 + vec2(seed * 0.29, vLocalPos.z * 1.35)).b;
        float rime = smoothstep(0.50, 0.0, hLocal) * (0.5 + 0.5 * rimeFbm) * (1.0 - isAirborne * 0.65);
        body = mix(body, uColorSeam, clamp(rime, 0.0, 1.0) * 0.56);

        // 4. Crisp Hewn-Plane Facet Separation
        body *= mix(1.0, 0.64 + 0.80 * ndv, 0.82);

        // 5. Sky-Probe + Key Sun Lighting
        vec3 L = normalize(vec3(uSunDir.x, max(0.45, uSunDir.y), uSunDir.z));
        vec3 H = normalize(L + V);
        float ndl = max(dot(N, L), 0.0);
        float skyProbe = 0.76 + 0.26 * ndl;
        vec3 diffuseLit = body * skyProbe * mix(0.82, 0.98, uDaylight);
        float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.20 * mix(0.5, 1.0, uDaylight);

        // 6. Permanent Subsurface Inner Light (Reinhard-rolled)
        vec3 glow = uColorSeam * rimAmount * 0.80;
        glow += uColorCore * (cracks * 0.62 + veins * 0.28) * 1.45;
        glow += uColorCore * (0.86 + 0.14 * glowBoost);
        glow *= 0.48;
        glow /= (1.0 + glow * 0.35);

        vec3 finalColor = diffuseLit + uColorSeam * spec + glow;
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
      uColorDeep: sharedUniforms.uDecalDeep,
      uColorBase: sharedUniforms.uDecalBase,
      uColorEdge: sharedUniforms.uDecalEdge,
      uColorInk: sharedUniforms.uSlashInk,
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
      uniform vec3 uColorDeep;
      uniform vec3 uColorBase;
      uniform vec3 uColorEdge;
      uniform vec3 uColorInk;

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

        // 3D height-field forward differences (e = 0.16m) for packed snow-rime / slag relief
        float e = 0.16;
        float h  = crustDepthAt(wPos);
        float hx = crustDepthAt(wPos + vec2(e, 0.0));
        float hy = crustDepthAt(wPos + vec2(0.0, e));
        vec3 nrm = normalize(vec3((h - hx) / e * 0.36, 1.0, (h - hy) / e * 0.36));

        vec3 lightDir = normalize(vec3(uSunDir.x, max(0.38, uSunDir.y), uSunDir.z));
        float lambert = clamp(dot(nrm, lightDir), 0.0, 1.0);
        float shade = 0.36 + 0.64 * pow(lambert, 0.80);

        // 3-band stepped crust so solar stays dark-char -> crimson -> blazing orange (never khaki-olive!)
        // and rime stays glacial cerulean -> sky ice -> snow white!
        vec3 col = mix(uColorDeep, uColorBase, step(0.46, shade));
        col = mix(col, uColorEdge, step(0.68, shade));

        float shockRing = smoothstep(0.06, 0.0, abs(r - 0.80 + (n0.b - 0.5) * 0.06));
        float innerSeam = smoothstep(0.68, 0.92, n1.r) * smoothstep(0.50, 0.78, mask);
        col = mix(col, uColorBase, innerSeam * 0.55);
        col = mix(col, uColorEdge * 1.12, shockRing * 0.80);

        float rimShadow = 1.0 - smoothstep(0.45, 0.53, mask);
        col = mix(col, uColorDeep * 0.84, rimShadow * 0.70);

        gl_FragColor = vec4(col * mix(0.84, 1.0, uDaylight), 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. Pooled, Deterministic SwordVfxSystem (<= 4 Draw Calls)                 */
/* ------------------------------------------------------------------------- */

const MAX_SLASH_RIBBONS = 8;
const MAX_SHRAPNEL = 42;
const MAX_DETONATION_DECALS = 3;

const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _euler = new THREE.Euler();
const _quatYaw = new THREE.Quaternion();
const _quatTilt = new THREE.Quaternion();
const _quatPitch = new THREE.Quaternion();
const _quatSpin = new THREE.Quaternion();
const _forwardZ = new THREE.Vector3(0, 0, 1);
const _rightX = new THREE.Vector3(1, 0, 0);

export class SwordVfxSystem {
  constructor({ scene, getGroundHeight = () => 0 } = {}) {
    this.scene = scene || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.noiseAtlas = getSharedNoiseAtlas();

    const defPal = BREATHING_PALETTES.solar;
    this.sharedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
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

    this.swingState = {
      active: false,
      type: 'combo1',
      style: 'solar',
      origin: new THREE.Vector3(),
      yaw: 0,
      age: 0,
      duration: 0.40,
    };

    this.detonationState = {
      active: false,
      type: 'shatterblow',
      style: 'rime',
      pos: new THREE.Vector3(),
      age: 0,
      duration: 0.85,
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

    // 2. World-Space Ukiyo-e Slash Arc Ribbon InstancedMesh
    const slashGeo = createUkiyoeSlashArcGeometry({ steps: 48 });
    this.slashMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_SLASH_RIBBONS * 4),
      4
    );
    slashGeo.setAttribute('aSlashMeta', this.slashMetaAttr);
    this.slashMat = createSlashArcMaterial(this.noiseAtlas, this.sharedUniforms);
    this.slashRibbonMesh = new THREE.InstancedMesh(slashGeo, this.slashMat, MAX_SLASH_RIBBONS);
    this.slashRibbonMesh.name = 'SwordVfx_DC2_UkiyoeSlashRibbons';
    this.slashRibbonMesh.frustumCulled = false;
    this.slashRibbonMesh.count = 0;
    this.group.add(this.slashRibbonMesh);

    // 3. Solid 3D Elemental Slash-Wake Fangs & Detonation Spires InstancedMesh
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

    // 4. Detonation Ground Scar & 3D Snow-Rime / Slag Basin InstancedMesh
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
    // Compact ground-erupting elemental fangs strictly in the forward cleave zone around the enemy (never floating behind the Knight!)
    this.swingChipRecords = [];
    for (let i = 0; i < 10; i++) {
      const s = 13.7 + i * 19.1;
      const uArc = i / 9;
      this.swingChipRecords.push({
        isGroundFang: true,
        seed: hash11(s + 1.1) * 10.0,
        arcAngle: lerp(-0.38, 0.42, uArc),
        radial: 1.75 + 0.65 * hash11(s + 2.3),
        height: 0.68 + 0.42 * hash11(s + 3.7),
        radius: 0.18 + 0.08 * hash11(s + 5.1),
        lean: 0.44 + 0.22 * hash11(s + 6.9),
      });
    }

    this.detonationWedgeRecords = [];
    for (let i = 0; i < 28; i++) {
      const s = 51.3 + i * 23.7;
      const isRingWedge = i < 22;
      const az = ((i / 28) * TAU + signedHash(s + 1.3) * 0.08 + TAU) % TAU;
      // Cover the entire front camera hemisphere AND the left side toward the Knight (az in [0.05, 3.65] or > 5.95)
      // with low ankle-to-knee framing fangs, keeping the central 1.35m arena around Skeleton_Warrior 100% open!
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
      });
    }
  }

  _applyPaletteToUniforms(styleKey, isDetonationPalette = false) {
    const pal = BREATHING_PALETTES[normalizeStyleKey(styleKey)] || BREATHING_PALETTES.solar;
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
   * Sets the Knight's active Sword Breathing Style (`'none' | 'rime' | 'solar' | 'tempest'`).
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
   * Spawns a sweeping world-space Ukiyo-e Slash Arc Ribbon from the Knight's cleave plane.
   */
  triggerSwing(swingType = 'combo1', origin = null, yaw = null, styleOverride = null) {
    const cfg = SWING_CONFIGS[swingType] || SWING_CONFIGS.combo1;
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
    this.swingState.type = SWING_CONFIGS[swingType] ? swingType : 'combo1';
    this.swingState.style = style;
    this.swingState.duration = cfg.duration;
    this.swingState.age = 0;
    this.swingState.active = true;

    this._applyPaletteToUniforms(style, false);
    this.group.visible = true;
    this._evaluateState(0.08);
    return this;
  }

  /**
   * Triggers one of the 3 Physical Detonations at `pos`:
   * `'shatterblow' | 'solar_flare' | 'thunderchain'`.
   */
  triggerDetonation(type = 'shatterblow', pos = [0, 0, 0]) {
    const style = normalizeStyleKey(type);
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
    this._evaluateState(0.08);
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
   * Deterministic timeline & pose seeker for screenshot verification.
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
      } else {
        this.swingState.active = false;
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

    this._evaluateState(timeSeconds);
    return this;
  }

  _evaluateState(clockTime = 0) {
    this.sharedUniforms.uTime.value = clockTime;

    let slashSlot = 0;
    let chipSlot = 0;
    let decalSlot = 0;

    // 1. Evaluate Active Sword Swing (Cohesive Ukiyo-e Slash Arc Crescent + Slash-Wake Fangs)
    if (this.swingState.active) {
      const sw = this.swingState;
      const u = sw.age / Math.max(0.05, sw.duration);
      if (u >= 0 && u <= 1.0) {
        const cfg = SWING_CONFIGS[sw.type] || SWING_CONFIGS.combo1;
        this._applyPaletteToUniforms(sw.style, false);

        const fwdX = Math.sin(sw.yaw);
        const fwdZ = Math.cos(sw.yaw);
        // Anchor crescent center slightly ahead of the Knight's chest (0.35m) so the trailing arc wraps right from his sword hand through the target!
        const cx = sw.origin.x + fwdX * 0.35;
        const cy = sw.origin.y + 1.12;
        const cz = sw.origin.z + fwdZ * 0.35;

        _quatYaw.setFromAxisAngle(UP, sw.yaw);
        _quatTilt.setFromAxisAngle(_forwardZ, cfg.tiltZ);
        _quatPitch.setFromAxisAngle(_rightX, cfg.pitchX || 0.14);

        // Slot 0: Primary Broad Ukiyo-e Slash Arc Crescent
        const numArcSlices = sw.type === 'charged' ? 2 : 1;
        for (let s = 0; s < numArcSlices && slashSlot < MAX_SLASH_RIBBONS; s++) {
          _dummy.position.set(cx, cy, cz);
          _quatSpin.setFromAxisAngle(UP, s * Math.PI + (sw.type === 'charged' ? u * 2.2 : 0.08));
          _dummy.quaternion.copy(_quatYaw).multiply(_quatTilt).multiply(_quatPitch).multiply(_quatSpin);

          const rScale = cfg.radius * (0.90 + 0.14 * outQuint(Math.min(1.0, u * 2.4)));
          const zStretch = sw.type === 'intercept' ? 1.32 : 1.04;
          _dummy.scale.set(rScale, 1.25, rScale * zStretch);
          _dummy.updateMatrix();
          this.slashRibbonMesh.setMatrixAt(slashSlot, _dummy.matrix);
          this.slashMetaAttr.setXYZW(slashSlot, u * 0.82, 0.37 + s * 1.9, 0.0, 1.0);
          slashSlot++;
        }

        // Slot 1: Tightly Overlapped Outer Crest Flare (adds 3D woodblock thickness without a separated gap!)
        if (slashSlot < MAX_SLASH_RIBBONS) {
          _dummy.position.set(cx, cy + 0.06, cz);
          _quatSpin.setFromAxisAngle(UP, -0.06);
          _dummy.quaternion.copy(_quatYaw).multiply(_quatTilt).multiply(_quatPitch).multiply(_quatSpin);
          const crestScale = cfg.radius * 0.94;
          _dummy.scale.set(crestScale, 1.05, crestScale * 1.02);
          _dummy.updateMatrix();
          this.slashRibbonMesh.setMatrixAt(slashSlot, _dummy.matrix);
          this.slashMetaAttr.setXYZW(slashSlot, clamp(u * 0.82 - 0.04, 0.04, 0.95), 2.13, 0.0, 0.96);
          slashSlot++;
        }

        // Only spawn slash-wake fangs when no full detonation crown is active (keeps detonation shots 100% clean!)
        if (!this.detonationState.active) {
          const fadeChip = 1.0 - smoothstep(0.62, 1.0, u);
          const emerge = outQuint(Math.min(1.0, u * 3.5));

          // Ground scorch/frost crescent decal underneath the sweeping sword cleave
          if (decalSlot < MAX_DETONATION_DECALS) {
            const gx = cx + fwdX * (cfg.radius * 0.68);
            const gz = cz + fwdZ * (cfg.radius * 0.68);
            const gy = this.getGroundHeight(gx, gz) + 0.042;
            _dummy.position.set(gx, gy, gz);
            _dummy.quaternion.setFromAxisAngle(UP, sw.yaw);
            const gRad = 2.45 * emerge;
            _dummy.scale.set(gRad, 1.0, gRad);
            _dummy.updateMatrix();
            this.detonationDecalMesh.setMatrixAt(decalSlot, _dummy.matrix);
            this.decalMetaAttr.setXYZW(decalSlot, u * 0.75, 1.0, 0.31, fadeChip);
            decalSlot++;
          }

          for (let i = 0; i < this.swingChipRecords.length && chipSlot < MAX_SHRAPNEL; i++) {
            const rec = this.swingChipRecords[i];
            const localAng = rec.arcAngle;
            const rDist = rec.radial * (0.85 + 0.22 * emerge);
            const wx = cx + Math.sin(sw.yaw + localAng) * rDist;
            const wz = cz + Math.cos(sw.yaw + localAng) * rDist;
            const groundY = this.getGroundHeight(wx, wz);

            if (rec.isGroundFang) {
              // Ground-rooted erupting flame/frost spires sweeping along the cleave arc
              _dummy.position.set(wx, groundY - 0.12, wz);
              _pos.set(
                Math.sin(sw.yaw + localAng) * Math.sin(rec.lean),
                Math.cos(rec.lean),
                Math.cos(sw.yaw + localAng) * Math.sin(rec.lean)
              ).normalize();
              _dummy.quaternion.setFromUnitVectors(UP, _pos);
              _dummy.scale.set(
                rec.radius * emerge * fadeChip,
                rec.height * emerge * fadeChip,
                rec.radius * emerge * fadeChip
              );
              _dummy.updateMatrix();
              this.shrapnelMesh.setMatrixAt(chipSlot, _dummy.matrix);
              this.chipMetaAttr.setXYZW(chipSlot, rec.seed, 1.25, 0.0, 0.0);
              chipSlot++;
            } else {
              // Tangential elemental splinters hugging the crescent wake at waist/chest height (y = 0.7..1.4m)
              const wy = groundY + 0.75 + (i % 3) * 0.22;
              _dummy.position.set(wx, wy, wz);
              const tangYaw = sw.yaw + localAng + Math.PI * 0.45;
              _pos.set(Math.sin(tangYaw) * 0.88, 0.35, Math.cos(tangYaw) * 0.88).normalize();
              _dummy.quaternion.setFromUnitVectors(UP, _pos);
              _dummy.scale.set(
                rec.radius * 0.85 * fadeChip,
                rec.height * 1.35 * fadeChip,
                rec.radius * 0.85 * fadeChip
              );
              _dummy.updateMatrix();
              this.shrapnelMesh.setMatrixAt(chipSlot, _dummy.matrix);
              this.chipMetaAttr.setXYZW(chipSlot, rec.seed, 1.35, 1.0, 0.0);
              chipSlot++;
            }
          }
        }
      } else {
        this.swingState.active = false;
      }
    }

    // 2. Evaluate Active Physical Detonation (`shatterblow`, `solar_flare`, `thunderchain`)
    if (this.detonationState.active) {
      const det = this.detonationState;
      const u = det.age / Math.max(0.08, det.duration);
      if (u >= 0 && u <= 1.0) {
        this._applyPaletteToUniforms(det.style, true);
        const dx = det.pos.x;
        const dy = det.pos.y;
        const dz = det.pos.z;
        const fadeDet = 1.0 - smoothstep(0.62, 1.0, u);
        const emerge = outQuint(Math.min(1.0, u * 3.8));

        // 2a. 3D Snow-Rime / Volcanic-Slag / Fulgurite-Scar Detonation Ground Plate
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

        // 2b. Ground-Hugging Detonation Shockwave Crest Ribbons (at ankle height dy + 0.22m so they frame the base cleanly!)
        for (let r = 0; r < 2 && slashSlot < MAX_SLASH_RIBBONS; r++) {
          const rYaw = r * Math.PI + u * 1.1 + 0.4;
          const rTilt = det.type === 'solar_flare' ? -0.35 : -0.18;
          _quatYaw.setFromAxisAngle(UP, rYaw);
          _quatTilt.setFromAxisAngle(_forwardZ, rTilt);
          _dummy.position.set(dx, dy + 0.22 + r * 0.14, dz);
          _dummy.quaternion.copy(_quatYaw).multiply(_quatTilt);
          const wRad = (2.45 + r * 0.45) * emerge * fadeDet;
          _dummy.scale.set(wRad, 0.95, wRad);
          _dummy.updateMatrix();
          this.slashRibbonMesh.setMatrixAt(slashSlot, _dummy.matrix);
          this.slashMetaAttr.setXYZW(slashSlot, u * 0.72, 4.1 + r * 1.7, 0.0, fadeDet);
          slashSlot++;
        }

        // 2c. 28 Solid 3D Detonation Glacier Spires / Solar Pillar Cinders / Fulgurite Monoliths
        for (let i = 0; i < this.detonationWedgeRecords.length && chipSlot < MAX_SHRAPNEL; i++) {
          const rec = this.detonationWedgeRecords[i];
          if (det.type === 'solar_flare' && !rec.isRingWedge) {
            // Upward volcanic magma pillar spires at center + ballistic cinders (vy = 7.5)
            const cDist = rec.radial + rec.vOut * det.age * 0.55;
            const wx = dx + Math.cos(rec.az) * cDist;
            const wz = dz + Math.sin(rec.az) * cDist;
            const wy = dy + 0.35 + rec.vy * det.age - 0.5 * 16.0 * det.age * det.age;
            _dummy.position.set(wx, Math.max(dy + 0.1, wy), wz);
            _euler.set(rec.spin * det.age, rec.az, rec.spin * det.age * 0.6);
            _dummy.quaternion.setFromEuler(_euler);
            const sc = rec.radius * 1.15 * fadeDet;
            _dummy.scale.set(sc, sc * 1.8, sc);
            _dummy.updateMatrix();
            this.shrapnelMesh.setMatrixAt(chipSlot, _dummy.matrix);
            this.chipMetaAttr.setXYZW(chipSlot, rec.seed, 1.3 * fadeDet, 1.0, 0.0);
            chipSlot++;
          } else {
            // Radial 3D Glacier Spires (shatterblow) / Solar Pillar / Thunderchain Monoliths
            const rSpread =
              det.type === 'thunderchain'
                ? lerp(2.6, 0.75, emerge) * (0.68 + 0.32 * (i % 2))
                : rec.radial * (0.62 + 0.52 * emerge);
            const wx = dx + Math.cos(rec.az) * rSpread;
            const wz = dz + Math.sin(rec.az) * rSpread;
            const wy = this.getGroundHeight(wx, wz) - 0.15;

            _dummy.position.set(wx, wy, wz);
            const leanAng = det.type === 'solar_flare' ? rec.lean * 0.45 : rec.lean;
            _pos.set(
              Math.cos(rec.az) * Math.sin(leanAng),
              Math.cos(leanAng),
              Math.sin(rec.az) * Math.sin(leanAng)
            ).normalize();
            _dummy.quaternion.setFromUnitVectors(UP, _pos);
            const hMult = det.type === 'solar_flare' ? 1.45 : 1.25;
            _dummy.scale.set(
              rec.radius * emerge * fadeDet,
              rec.height * hMult * emerge * fadeDet,
              rec.radius * emerge * fadeDet
            );
            _dummy.updateMatrix();
            this.shrapnelMesh.setMatrixAt(chipSlot, _dummy.matrix);
            this.chipMetaAttr.setXYZW(chipSlot, rec.seed, 1.3 * fadeDet, 0.0, 0.0);
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

    this.slashRibbonMesh.count = slashSlot;
    this.slashRibbonMesh.instanceMatrix.needsUpdate = true;
    this.slashMetaAttr.needsUpdate = true;

    this.shrapnelMesh.count = chipSlot;
    this.shrapnelMesh.instanceMatrix.needsUpdate = true;
    this.chipMetaAttr.needsUpdate = true;

    this.detonationDecalMesh.count = decalSlot;
    this.detonationDecalMesh.instanceMatrix.needsUpdate = true;
    this.decalMetaAttr.needsUpdate = true;

    const anyWorldActive = slashSlot > 0 || chipSlot > 0 || decalSlot > 0;
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
    }
    if (this.detonationState.active) {
      this.detonationState.age += dt;
    }

    if (this.swingState.active || this.detonationState.active || this.group.visible) {
      this._evaluateState(this.sharedUniforms.uTime.value);
    }
  }

  getStats() {
    let drawCalls = 0;
    if (this.sheathMesh.visible && this.sheathMesh.parent) drawCalls++;
    if (this.group.visible) {
      if (this.slashRibbonMesh.count > 0) drawCalls++;
      if (this.shrapnelMesh.count > 0) drawCalls++;
      if (this.detonationDecalMesh.count > 0) drawCalls++;
    }
    return {
      active: drawCalls > 0,
      infusionStyle: this.infusionStyle,
      drawCalls,
      sheathVisible: Boolean(this.sheathMesh.visible && this.sheathMesh.parent),
      activeSlashRibbons: this.group.visible ? this.slashRibbonMesh.count : 0,
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
    this._hitstopScale = 1.0;
    this._shakeOffset.set(0, 0, 0);
    this.group.visible = false;
    this.slashRibbonMesh.count = 0;
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
    this.slashRibbonMesh.geometry.dispose();
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
