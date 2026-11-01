// ============================================================================
// world/assets/vfx/mage-bolt.js
//
// Stage 4 Pass 2: Mage's 3-Hit Normal Attack & Charged Starlight Nova Projectiles
//
// Visual & Engineering Contract:
// - Strictly <= 2 Draw Calls when active, 0 Draw Calls when idle (`group.visible = false`):
//     1. `boltCoreAndShardsMesh` (DC1, 1 InstancedMesh):
//        Renders up to 12 in-flight chiseled 3D Starlight-Wisteria Crystal Bolt
//        Heads (spinning star-prism / octahedron with 3-band cel shading:
//        `#3b0764` deep wisteria ink rim -> `#38bdf8` arcane cyan-violet mid ->
//        `#fef08a` starlight gold core) AND up to 36 ballistic 3D impact burst
//        shards that shatter outward on hit and dissolve via `NoiseAtlas`
//        fracture erosion (`transparent: false, depthWrite: true, side: THREE.FrontSide`).
//     2. `boltWakeRibbonMesh` (DC2, 1 InstancedMesh):
//        Renders a crisp, camera-aligned cel-stepped Ukiyo-e comet-tail ribbon
//        behind each flying bolt (`#2e1065` border, `#60a5fa` mid, `#fef08a` core)
//        + a crisp expanding starlight impact ring at the hit point
//        (`transparent: false, depthWrite: true, side: THREE.FrontSide`,
//        hard `discard < 0.45`).
// - Zero raw sRGB vec3 literals in GLSL; all palette colors passed via `THREE.Color`.
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD_Z = new THREE.Vector3(0, 0, 1);

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

export const MAGE_BOLT_DEFAULTS = Object.freeze({
  defaultRange: 13.0,
  handHeight: 1.24,
  handForward: 0.55,
  targetHeight: 1.08,
  impactDuration: 0.46,

  // Combo speeds (m/s)
  speedCombo0: 28.0,
  speedCombo1: 29.0,
  speedCombo2: 30.0,
  speedCharged: 22.0,

  // Linear-sRGB Palette Uniforms (passed via THREE.Color)
  colorBoltRimInk: '#3b0764',
  colorBoltViolet: '#6d28d9',
  colorBoltMid: '#38bdf8',
  colorBoltCore: '#fef08a',

  colorWakeBorder: '#2e1065',
  colorWakeMid: '#60a5fa',
  colorWakeCore: '#fef08a',
});

/* ------------------------------------------------------------------------- */
/* 1. Outward-Wound Procedural 3D Geometries (`side: THREE.FrontSide`)       */
/* ------------------------------------------------------------------------- */

/**
 * Chiseled 8-faceted 3D Starlight Crystal Star-Prism / Octahedron geometry.
 * Local +Z is forward along the bolt flight vector; outward-wound CCW triangles
 * so `side: THREE.FrontSide` renders with zero back-face culling holes.
 */
export function createStarlightCrystalGeometry({ points = 6 } = {}) {
  const cols = points * 2;
  const zRings = [
    { z: -0.52, rOuter: 0.14, rInner: 0.09, u: 0.12 },
    { z: -0.12, rOuter: 0.42, rInner: 0.25, u: 0.42 },
    { z: 0.18, rOuter: 0.36, rInner: 0.22, u: 0.68 },
  ];

  const ringVerts = zRings.map((spec) => {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const isRidge = c % 2 === 0;
      const ang = (c / cols) * TAU;
      const r = isRidge ? spec.rOuter : spec.rInner;
      row.push({
        pos: [Math.cos(ang) * r, Math.sin(ang) * r, spec.z],
        ridge: isRidge ? 1.0 : 0.2,
        u: spec.u,
      });
    }
    return row;
  });

  const tailTip = [0, 0, -0.78];
  const noseTip = [0, 0, 0.76];
  const positions = [];
  const uvs = [];

  const pushTriCCW = (a, b, c, uvA, uvB, uvC) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
  };

  for (let r = 0; r < ringVerts.length - 1; r++) {
    const row0 = ringVerts[r];
    const row1 = ringVerts[r + 1];
    for (let c = 0; c < cols; c++) {
      const cNext = (c + 1) % cols;
      const a = row0[c];
      const b = row0[cNext];
      const d = row1[c];
      const e = row1[cNext];
      pushTriCCW(a.pos, b.pos, e.pos, [a.ridge, a.u], [b.ridge, b.u], [e.ridge, e.u]);
      pushTriCCW(a.pos, e.pos, d.pos, [a.ridge, a.u], [e.ridge, e.u], [d.ridge, d.u]);
    }
  }

  const firstRow = ringVerts[0];
  const lastRow = ringVerts[ringVerts.length - 1];
  for (let c = 0; c < cols; c++) {
    const cNext = (c + 1) % cols;
    const f0 = firstRow[c];
    const f1 = firstRow[cNext];
    pushTriCCW(tailTip, f1.pos, f0.pos, [1.0, 0.0], [f1.ridge, f1.u], [f0.ridge, f0.u]);

    const l0 = lastRow[c];
    const l1 = lastRow[cNext];
    pushTriCCW(l0.pos, l1.pos, noseTip, [l0.ridge, l0.u], [l1.ridge, l1.u], [1.0, 1.0]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Closed Double-Faced Outward-Wound Ribbon / Ring Plate Geometry (`side: THREE.FrontSide`).
 * Has both a +Y upper face and a -Y lower face (plus crossed vertical fin when in wake mode)
 * so it is 100% opaque `FrontSide` from any camera elevation or azimuth!
 */
export function createCometWakeRibbonGeometry({ steps = 16 } = {}) {
  const positions = [];
  const uvs = [];
  const planeIds = []; // 0 = horizontal XZ sheet (also used for impact rings), 1 = vertical YZ crossed fin

  const pushQuadBothSides = (p00, p10, p11, p01, uv00, uv10, uv11, uv01, planeId, epsOffset) => {
    const up00 = [p00[0] + epsOffset[0], p00[1] + epsOffset[1], p00[2] + epsOffset[2]];
    const up10 = [p10[0] + epsOffset[0], p10[1] + epsOffset[1], p10[2] + epsOffset[2]];
    const up11 = [p11[0] + epsOffset[0], p11[1] + epsOffset[1], p11[2] + epsOffset[2]];
    const up01 = [p01[0] + epsOffset[0], p01[1] + epsOffset[1], p01[2] + epsOffset[2]];

    const dn00 = [p00[0] - epsOffset[0], p00[1] - epsOffset[1], p00[2] - epsOffset[2]];
    const dn10 = [p10[0] - epsOffset[0], p10[1] - epsOffset[1], p10[2] - epsOffset[2]];
    const dn11 = [p11[0] - epsOffset[0], p11[1] - epsOffset[1], p11[2] - epsOffset[2]];
    const dn01 = [p01[0] - epsOffset[0], p01[1] - epsOffset[1], p01[2] - epsOffset[2]];

    // Front/Top CCW
    positions.push(...up00, ...up10, ...up11, ...up00, ...up11, ...up01);
    uvs.push(...uv00, ...uv10, ...uv11, ...uv00, ...uv11, ...uv01);
    planeIds.push(planeId, planeId, planeId, planeId, planeId, planeId);

    // Back/Bottom CCW
    positions.push(...dn00, ...dn11, ...dn10, ...dn00, ...dn01, ...dn11);
    uvs.push(...uv00, ...uv11, ...uv10, ...uv00, ...uv01, ...uv11);
    planeIds.push(planeId, planeId, planeId, planeId, planeId, planeId);
  };

  for (let i = 0; i < steps - 1; i++) {
    const u0 = i / (steps - 1);
    const u1 = (i + 1) / (steps - 1);
    const z0 = (u0 - 0.5) * 2.0; // -1..+1
    const z1 = (u1 - 0.5) * 2.0;

    // Sheet 0: XZ plane (x in -1..+1, z in -1..+1) — works for both horizontal wake fin & ground impact ring
    pushQuadBothSides(
      [-1, 0, z0],
      [-1, 0, z1],
      [1, 0, z1],
      [1, 0, z0],
      [0, u0],
      [0, u1],
      [1, u1],
      [1, u0],
      0.0,
      [0, 0.008, 0]
    );

    // Sheet 1: YZ vertical crossed fin (y in -1..+1, z in -1..+1) — makes comet tail 3D from side cameras
    pushQuadBothSides(
      [0, -1, z0],
      [0, -1, z1],
      [0, 1, z1],
      [0, 1, z0],
      [0, u0],
      [0, u1],
      [1, u1],
      [1, u0],
      1.0,
      [0.008, 0, 0]
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aPlaneId', new THREE.Float32BufferAttribute(planeIds, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/* ------------------------------------------------------------------------- */
/* 2. Opaque 3-Band Cel Shaders (`transparent: false, side: FrontSide`)      */
/* ------------------------------------------------------------------------- */

function createBoltCoreAndShardMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'MageBoltCoreAndShardMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uColorRimInk: { value: new THREE.Color(config.colorBoltRimInk) },
      uColorViolet: { value: new THREE.Color(config.colorBoltViolet) },
      uColorMid: { value: new THREE.Color(config.colorBoltMid) },
      uColorCore: { value: new THREE.Color(config.colorBoltCore) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aBoltMeta; // x: seed, y: coreBoost, z: dissolveProgress (0..1), w: role (0=boltHead, 1=shard)
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec4 vMeta;

      void main() {
        vUv = uv;
        vLocalPos = position;
        vMeta = aBoltMeta;

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
      uniform vec3 uColorRimInk;
      uniform vec3 uColorViolet;
      uniform vec3 uColorMid;
      uniform vec3 uColorCore;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying vec4 vMeta;

      void main() {
        float seed = vMeta.x;
        float coreBoost = vMeta.y;
        float dissolveProgress = clamp(vMeta.z, 0.0, 1.0);

        // 1. Derivative-flat facet normal so chiseled starlight crystal facets pop
        vec3 dN = cross(dFdx(vWorldPos), dFdy(vWorldPos));
        vec3 N = length(dN) > 1e-8 ? normalize(dN) : normalize(vWorldNormal);
        if (dot(N, vWorldNormal) < 0.0) N = -N;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(vec3(uSunDir.x, max(0.45, uSunDir.y), uSunDir.z));
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float ndl = dot(N, L) * 0.5 + 0.5;

        // 2. NoiseAtlas fracture erosion for ballistic impact shards (zero shrinking!)
        vec2 nUv = vLocalPos.xy * 0.85 + vec2(vLocalPos.z * 0.65 + seed * 0.37, seed * 0.71);
        vec4 nSample = texture2D(uNoiseAtlas, nUv);
        float fractureVal = nSample.r * 0.55 + nSample.b * 0.45;
        if (dissolveProgress > 0.001 && fractureVal < dissolveProgress) discard;

        // 3. 3-Band Starlight-Wisteria Cel Shading:
        //    #3b0764 deep wisteria ink rim -> #38bdf8 arcane cyan-violet mid -> #fef08a starlight gold core
        float celScore = ndv * 0.58 + ndl * 0.24 + vUv.x * 0.18 + (nSample.b - 0.5) * 0.14 + coreBoost * 0.12;
        vec3 col = mix(uColorRimInk, uColorViolet, step(0.24, celScore));
        col = mix(col, uColorMid * 1.08, step(0.42, celScore));
        col = mix(col, uColorCore * 1.22, step(0.68, celScore));

        // 4. Dissolve fracture edge glow + crisp wisteria ink silhouette rim
        float dissolveEdge = step(0.001, dissolveProgress) * (1.0 - smoothstep(dissolveProgress, dissolveProgress + 0.08, fractureVal));
        col = mix(col, uColorCore * 1.32, dissolveEdge);

        float rimInk = 1.0 - smoothstep(0.15, 0.26, ndv);
        col = mix(col, uColorRimInk, rimInk * (1.0 - dissolveEdge * 0.7));

        gl_FragColor = vec4(col * mix(0.88, 1.0, uDaylight), 1.0);
      }
    `,
  });
}

function createBoltWakeRibbonMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'MageBoltWakeRibbonMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uColorBorder: { value: new THREE.Color(config.colorWakeBorder) },
      uColorMid: { value: new THREE.Color(config.colorWakeMid) },
      uColorCore: { value: new THREE.Color(config.colorWakeCore) },
    },
    vertexShader: /* glsl */ `
      attribute float aPlaneId;
      attribute vec4 aWakeMeta; // x: progress (0..1), y: seed, z: role (0=cometWake, 1=impactRing), w: intensity
      varying vec2 vUv;
      varying float vPlaneId;
      varying vec4 vMeta;

      void main() {
        vUv = uv;
        vPlaneId = aPlaneId;
        vMeta = aWakeMeta;

        // Hide vertical crossed fin when rendering a horizontal ground/target impact ring (role >= 0.5)
        if (aWakeMeta.z >= 0.5 && aPlaneId > 0.5) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform vec3 uColorBorder;
      uniform vec3 uColorMid;
      uniform vec3 uColorCore;

      varying vec2 vUv;
      varying float vPlaneId;
      varying vec4 vMeta;

      void main() {
        float progress = clamp(vMeta.x, 0.0, 1.0);
        float seed = vMeta.y;
        float role = vMeta.z;
        float intensity = vMeta.w;
        if (intensity <= 0.01 || progress >= 1.0) discard;

        float mask = 0.0;
        float celBand = 0.0;

        if (role < 0.5) {
          // ROLE 0: Ukiyo-e Starlight Comet-Tail Ribbon behind flying bolt
          // vUv.y = 1.0 at bolt head (+Z), 0.0 at trailing comet tail (-Z); vUv.x = 0..1 across width
          float lat = abs(vUv.x - 0.5) * 2.0;
          float along = vUv.y;
          float taperWidth = mix(0.22, 1.0, pow(along, 0.55));
          float normLat = lat / max(0.12, taperWidth);

          vec2 scrollUv = vec2(along * 1.8 - uTime * 3.8 + seed * 0.41, vUv.x * 1.2 + seed * 0.73);
          vec4 n0 = texture2D(uNoiseAtlas, scrollUv);
          float wave = n0.b * 0.62 + n0.g * 0.38;

          float headCap = smoothstep(1.0, 0.88, along);
          float tailFade = smoothstep(0.0, 0.32, along);
          mask = ((1.0 - normLat * 0.78) + (wave - 0.42) * 0.52) * headCap * tailFade * intensity;
          celBand = (1.0 - normLat) * 0.68 + wave * 0.32 + along * 0.15;
        } else {
          // ROLE 1: Crisp Expanding Starlight Impact Ring at Hit Point
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          float ang = atan(p.y, p.x);

          vec4 n0 = texture2D(uNoiseAtlas, p * 0.65 + vec2(seed * 0.37, seed * 0.61));
          float starBurst = cos(ang * 8.0 + seed * 3.1) * 0.08 + (n0.b - 0.5) * 0.08;
          float ringCenter = mix(0.28, 0.82, pow(progress, 0.62));
          float ringThickness = mix(0.24, 0.11, progress);
          float ringProfile = 1.0 - abs(r + starBurst - ringCenter) / max(0.05, ringThickness);
          float fadeOut = 1.0 - smoothstep(0.65, 1.0, progress);

          mask = (ringProfile * 0.78 + n0.b * 0.28) * fadeOut * intensity;
          celBand = ringProfile * 0.75 + n0.b * 0.25;
        }

        // Hard alphaTest cutout (strictly >= 0.45, zero transparent glass!)
        if (mask < 0.45) discard;

        // 3-Band Ukiyo-e Starlight Comet & Ring Colors:
        // #2e1065 border -> #60a5fa mid -> #fef08a core
        vec3 col = uColorBorder;
        col = mix(col, uColorMid * 1.06, step(0.46, celBand));
        col = mix(col, uColorCore * 1.22, step(0.72, celBand));

        float borderInk = 1.0 - smoothstep(0.45, 0.54, mask);
        col = mix(col, uColorBorder, borderInk);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. Pooled, Deterministic MageBoltSystem (<= 2 Draw Calls When Active)     */
/* ------------------------------------------------------------------------- */

const MAX_CORE_AND_SHARD_INSTANCES = 48; // Up to 12 in-flight bolt heads + 36 ballistic 3D impact burst shards
const MAX_WAKE_AND_RING_INSTANCES = 24; // Up to 12 in-flight comet wakes + 12 expanding starlight impact rings
const MAX_ACTIVE_VOLLEYS = 4;

const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _prevPos = new THREE.Vector3();
const _velDir = new THREE.Vector3();
const _sideDir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _spinQuat = new THREE.Quaternion();
const _euler = new THREE.Euler();

function parseComboIndex(comboIndex) {
  if (typeof comboIndex === 'string') {
    const s = comboIndex.toLowerCase();
    if (s === 'charged' || s === 'nova' || s === '3') return 3;
    if (s === 'combo3' || s === 'finisher' || s === '2') return 2;
    if (s === 'combo2' || s === 'helix' || s === '1') return 1;
    return 0;
  }
  return clamp(Math.round(Number(comboIndex) || 0), 0, 3);
}

export class MageBoltSystem {
  constructor({ scene, getGroundHeight = () => 0, config = {} } = {}) {
    this.scene = scene || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.config = { ...MAGE_BOLT_DEFAULTS, ...config };
    this.noiseAtlas = getSharedNoiseAtlas();

    this.sharedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
    };

    this.group = new THREE.Group();
    this.group.name = 'MageBoltVfxRoot';
    this.group.visible = false;
    if (this.scene) {
      this.scene.add(this.group);
    }

    this.active = false;
    this.age = 0;
    this.volleys = [];
    this._volleyCounter = 0;
    this._shakeOffset = new THREE.Vector3();
    this._hitstopScale = 1.0;

    this._buildMeshes();
    this._seedShardTemplates();
  }

  _buildMeshes() {
    const c = this.config;

    // DC 1: Chiseled 3D Starlight-Wisteria Crystal Bolt Heads & Ballistic 3D Impact Burst Shards
    const coreGeo = createStarlightCrystalGeometry({ points: 6 });
    this.coreMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_CORE_AND_SHARD_INSTANCES * 4),
      4
    );
    coreGeo.setAttribute('aBoltMeta', this.coreMetaAttr);
    this.coreMat = createBoltCoreAndShardMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.boltCoreAndShardsMesh = new THREE.InstancedMesh(
      coreGeo,
      this.coreMat,
      MAX_CORE_AND_SHARD_INSTANCES
    );
    this.boltCoreAndShardsMesh.name = 'MageBolt_DC1_CoreAndShards';
    this.boltCoreAndShardsMesh.frustumCulled = false;
    this.boltCoreAndShardsMesh.count = 0;
    this.group.add(this.boltCoreAndShardsMesh);

    // DC 2: Camera-Aligned Ukiyo-e Comet-Tail Wake Ribbons & Expanding Starlight Impact Rings
    const wakeGeo = createCometWakeRibbonGeometry({ steps: 16 });
    this.wakeMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_WAKE_AND_RING_INSTANCES * 4),
      4
    );
    wakeGeo.setAttribute('aWakeMeta', this.wakeMetaAttr);
    this.wakeMat = createBoltWakeRibbonMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.boltWakeRibbonMesh = new THREE.InstancedMesh(
      wakeGeo,
      this.wakeMat,
      MAX_WAKE_AND_RING_INSTANCES
    );
    this.boltWakeRibbonMesh.name = 'MageBolt_DC2_WakeAndImpactRings';
    this.boltWakeRibbonMesh.frustumCulled = false;
    this.boltWakeRibbonMesh.count = 0;
    this.group.add(this.boltWakeRibbonMesh);
  }

  _seedShardTemplates() {
    this.shardTemplates = [];
    for (let i = 0; i < 36; i++) {
      const s = 17.3 + i * 23.9;
      const az = (i / 36) * TAU + signedHash(s + 1.1) * 0.12;
      const elev = 0.18 + 0.62 * hash11(s + 2.7);
      const speed = 4.6 + 5.2 * hash11(s + 4.3);
      this.shardTemplates.push({
        seed: hash11(s + 5.9) * 10.0,
        vx: Math.cos(az) * Math.cos(elev) * speed,
        vy: Math.sin(elev) * speed + 2.8,
        vz: Math.sin(az) * Math.cos(elev) * speed,
        size: 0.18 + 0.14 * hash11(s + 7.1),
        stagger: hash11(s + 8.5) * 0.12,
        spinX: signedHash(s + 9.7) * 11.0,
        spinY: signedHash(s + 11.3) * 11.0,
        spinZ: signedHash(s + 13.1) * 11.0,
      });
    }
  }

  _buildVolleyDescriptor({
    origin = [0, 0, 0],
    direction = [1, 0, 0],
    targetPos = null,
    comboIndex = 0,
    onHit = null,
  } = {}) {
    const c = this.config;
    const combo = parseComboIndex(comboIndex);

    const ox = origin.x ?? origin[0] ?? 0;
    const oz = origin.z ?? origin[2] ?? 0;
    const oy = (origin.y ?? origin[1] ?? this.getGroundHeight(ox, oz)) + c.handHeight;

    let dx = direction?.x ?? direction?.[0] ?? 1;
    let dz = direction?.z ?? direction?.[2] ?? 0;
    const dLen = Math.hypot(dx, dz) || 1;
    dx /= dLen;
    dz /= dLen;

    const sx = -dz;
    const sz = dx;

    const startX = ox + dx * c.handForward;
    const startZ = oz + dz * c.handForward;
    const startY = oy;

    let endX;
    let endY;
    let endZ;
    if (targetPos) {
      endX = targetPos.x ?? targetPos[0] ?? startX + dx * c.defaultRange;
      endZ = targetPos.z ?? targetPos[2] ?? startZ + dz * c.defaultRange;
      const rawEndY = targetPos.y ?? targetPos[1];
      endY =
        rawEndY !== undefined && rawEndY > this.getGroundHeight(endX, endZ) + 0.3
          ? rawEndY
          : this.getGroundHeight(endX, endZ) + c.targetHeight;
    } else {
      endX = ox + dx * c.defaultRange;
      endZ = oz + dz * c.defaultRange;
      endY = this.getGroundHeight(endX, endZ) + c.targetHeight;
    }

    const totalDist = Math.max(1.5, Math.hypot(endX - startX, endZ - startZ));
    const speed =
      combo === 3
        ? c.speedCharged
        : combo === 2
          ? c.speedCombo2
          : combo === 1
            ? c.speedCombo1
            : c.speedCombo0;
    const flightDuration = totalDist / speed;
    const impactDuration = combo === 3 ? 0.62 : combo === 2 ? 0.52 : c.impactDuration;

    const bolts = [];
    const seedBase = (++this._volleyCounter % 16) * 3.7 + combo * 7.1;

    if (combo === 0) {
      // Hit 1: 1 fast Arcane Starlight Bolt (28 m/s)
      bolts.push({
        seed: seedBase + 1.1,
        launchDelay: 0.0,
        flightDuration,
        scale: 1.0,
        helixPhase: 0,
        helixRadius: 0.0,
        fanAngleRad: 0.0,
        shardCount: 8,
        burstRadius: 1.85,
        hitFired: false,
      });
    } else if (combo === 1) {
      // Hit 2: 2 Twin Helix Starlight Bolts (29 m/s, spiraling +-0.28m around the flight line)
      for (let b = 0; b < 2; b++) {
        bolts.push({
          seed: seedBase + b * 2.3 + 1.7,
          launchDelay: b * 0.025,
          flightDuration,
          scale: 0.96,
          helixPhase: b * Math.PI,
          helixRadius: 0.28,
          fanAngleRad: 0.0,
          shardCount: 8,
          burstRadius: 1.95,
          hitFired: false,
        });
      }
    } else if (combo === 2) {
      // Hit 3 Finisher: 3-Bolt Converging Starlight Fan Volley (-14 deg, 0 deg, +14 deg, 30 m/s)
      const deg14 = (14.0 * Math.PI) / 180.0;
      const fanAngles = [-deg14, 0.0, deg14];
      for (let b = 0; b < 3; b++) {
        bolts.push({
          seed: seedBase + b * 3.1 + 2.1,
          launchDelay: Math.abs(b - 1) * 0.018,
          flightDuration,
          scale: b === 1 ? 1.12 : 0.98,
          helixPhase: 0,
          helixRadius: 0.0,
          fanAngleRad: fanAngles[b],
          shardCount: 6, // 3 * 6 = 18 converging finisher shards
          burstRadius: 2.65,
          hitFired: false,
        });
      }
    } else {
      // ComboIndex 3 ('charged' Heavy Nova Orb): 1 Large Starlight Nova Sphere (scale = 1.65x, 22 m/s, 3.5m burst)
      bolts.push({
        seed: seedBase + 4.7,
        launchDelay: 0.0,
        flightDuration,
        scale: 1.65,
        isNovaOrb: true,
        helixPhase: 0,
        helixRadius: 0.0,
        fanAngleRad: 0.0,
        shardCount: 24,
        burstRadius: 3.5,
        hitFired: false,
      });
    }

    const maxBoltEnd = Math.max(...bolts.map((b) => b.launchDelay + b.flightDuration));
    return {
      comboIndex: combo,
      age: 0.0,
      totalDuration: maxBoltEnd + impactDuration,
      impactDuration,
      start: new THREE.Vector3(startX, startY, startZ),
      end: new THREE.Vector3(endX, endY, endZ),
      dir: new THREE.Vector3(dx, 0, dz),
      side: new THREE.Vector3(sx, 0, sz),
      totalDist,
      bolts,
      onHit,
    };
  }

  _sampleBoltPosition(volley, bolt, u, out) {
    const t = clamp(u, 0.0, 1.0);
    const bx = lerp(volley.start.x, volley.end.x, t);
    const bz = lerp(volley.start.z, volley.end.z, t);
    const by = lerp(volley.start.y, volley.end.y, t);

    let latOffset = 0.0;
    let vertOffset = 0.0;

    if (bolt.helixRadius > 0.001) {
      // Twin Helix spiral around flight line, pinching cleanly at launch (u=0) and hit point (u=1)
      const pinch = Math.sin(t * Math.PI);
      const ang = bolt.helixPhase + t * TAU * 2.25;
      latOffset += Math.cos(ang) * bolt.helixRadius * pinch;
      vertOffset += Math.sin(ang) * bolt.helixRadius * 0.72 * pinch;
    }

    if (Math.abs(bolt.fanAngleRad) > 0.001) {
      // Converging Fan Volley: launches at +-14 deg and curves inward to converge on targetPos at u = 1.0!
      const fanReach = Math.tan(bolt.fanAngleRad) * volley.totalDist * 0.42;
      latOffset += Math.sin(t * Math.PI) * fanReach;
      vertOffset += Math.sin(t * Math.PI) * 0.22;
    }

    if (bolt.isNovaOrb) {
      vertOffset += Math.sin(t * Math.PI) * 0.35;
    }

    out.set(
      bx + volley.side.x * latOffset,
      by + vertOffset,
      bz + volley.side.z * latOffset
    );
    return out;
  }

  /**
   * Fires a Mage normal-attack or charged Starlight-Wisteria volley.
   */
  fireComboVolley({
    origin = [0, 0, 0],
    direction = [1, 0, 0],
    targetPos = null,
    comboIndex = 0,
    onHit = null,
  } = {}) {
    const vDesc = this._buildVolleyDescriptor({
      origin,
      direction,
      targetPos,
      comboIndex,
      onHit,
    });
    if (this.volleys.length >= MAX_ACTIVE_VOLLEYS) {
      this.volleys.shift();
    }
    this.volleys.push(vDesc);
    this.active = true;
    this.age = 0;
    this.group.visible = true;
    this._evaluateVolleys(this.sharedUniforms.uTime.value);
    return this;
  }

  cast(origin, direction, options = {}) {
    return this.fireComboVolley({
      origin,
      direction,
      targetPos: options.targetPos || null,
      comboIndex: options.comboIndex ?? 0,
      onHit: options.onHit || null,
    });
  }

  /**
   * Deterministic seeker for preview studio & automated verification.
   */
  seek(timeSeconds, config = null) {
    if (config) {
      this.volleys = [this._buildVolleyDescriptor(config)];
    } else if (this.volleys.length === 0) {
      this.volleys = [this._buildVolleyDescriptor({ comboIndex: 2 })];
    }

    this.age = timeSeconds;
    this.sharedUniforms.uTime.value = timeSeconds;
    for (const v of this.volleys) {
      v.age = timeSeconds;
    }
    this._evaluateVolleys(timeSeconds);
    return this;
  }

  _evaluateVolleys(clockTime = 0) {
    this.sharedUniforms.uTime.value = clockTime;

    let coreSlot = 0;
    let wakeSlot = 0;
    let maxShakeEnv = 0;
    let anyHitstop = false;

    for (let vIdx = 0; vIdx < this.volleys.length; vIdx++) {
      const volley = this.volleys[vIdx];

      for (let bIdx = 0; bIdx < volley.bolts.length; bIdx++) {
        const bolt = volley.bolts[bIdx];
        const bAge = volley.age - bolt.launchDelay;
        if (bAge < 0) continue;

        const flightU = bAge / Math.max(0.04, bolt.flightDuration);
        const impactElapsed = bAge - bolt.flightDuration;

        if (flightU <= 1.0) {
          // -----------------------------------------------------------------
          // A. In-Flight Starlight-Wisteria Bolt Head (DC 1) & Comet Wake (DC 2)
          // -----------------------------------------------------------------
          this._sampleBoltPosition(volley, bolt, flightU, _pos);
          this._sampleBoltPosition(volley, bolt, Math.max(0.0, flightU - 0.05), _prevPos);
          _velDir.subVectors(_pos, _prevPos);
          if (_velDir.lengthSq() < 1e-6) {
            _velDir.copy(volley.dir);
          } else {
            _velDir.normalize();
          }
          _quat.setFromUnitVectors(FORWARD_Z, _velDir);

          // 1. Primary Chiseled Starlight Crystal Bolt Head (or Charged Nova Sphere)
          if (coreSlot < MAX_CORE_AND_SHARD_INSTANCES) {
            _spinQuat.setFromAxisAngle(FORWARD_Z, clockTime * (bolt.isNovaOrb ? 6.5 : 14.0) + bolt.seed);
            _dummy.position.copy(_pos);
            _dummy.quaternion.copy(_quat).multiply(_spinQuat);
            const popIn = smoothstep(0.0, 0.08, flightU);
            const s = bolt.scale * popIn;
            if (bolt.isNovaOrb) {
              // Heavy Nova Sphere: fuller polyhedral star-orb proportion + 2 orbiting crystal satellites
              _dummy.scale.set(s * 0.68, s * 0.68, s * 0.78);
            } else {
              _dummy.scale.set(s * 0.56, s * 0.56, s * 1.18);
            }
            _dummy.updateMatrix();
            this.boltCoreAndShardsMesh.setMatrixAt(coreSlot, _dummy.matrix);
            this.coreMetaAttr.setXYZW(coreSlot, bolt.seed, bolt.isNovaOrb ? 1.45 : 1.0, 0.0, 0.0);
            coreSlot++;

            // If Charged Heavy Nova Orb, add 2 crossed star-rings / satellite crystals in DC 1
            if (bolt.isNovaOrb && coreSlot + 1 < MAX_CORE_AND_SHARD_INSTANCES) {
              for (let sat = 0; sat < 2; sat++) {
                const satAng = clockTime * 11.0 + sat * Math.PI;
                const orbitR = 0.54 * popIn;
                _dummy.position.set(
                  _pos.x + volley.side.x * Math.cos(satAng) * orbitR,
                  _pos.y + Math.sin(satAng) * orbitR,
                  _pos.z + volley.side.z * Math.cos(satAng) * orbitR
                );
                _euler.set(satAng, clockTime * 9.0, sat * 1.57);
                _dummy.quaternion.setFromEuler(_euler);
                _dummy.scale.set(0.28 * popIn, 0.28 * popIn, 0.52 * popIn);
                _dummy.updateMatrix();
                this.boltCoreAndShardsMesh.setMatrixAt(coreSlot, _dummy.matrix);
                this.coreMetaAttr.setXYZW(coreSlot, bolt.seed + sat + 1.0, 1.35, 0.0, 0.0);
                coreSlot++;
              }
            }
          }

          // 2. Ukiyo-e Starlight Comet-Tail Wake Ribbon behind the flying bolt (DC 2)
          if (wakeSlot < MAX_WAKE_AND_RING_INSTANCES) {
            const wakeLen = Math.min(flightU * volley.totalDist, bolt.isNovaOrb ? 3.3 : 2.55);
            if (wakeLen > 0.12) {
              _dummy.position.copy(_pos).addScaledVector(_velDir, -wakeLen * 0.48);
              _spinQuat.setFromAxisAngle(FORWARD_Z, bolt.seed * 0.7);
              _dummy.quaternion.copy(_quat).multiply(_spinQuat);
              const wakeW = (bolt.isNovaOrb ? 0.58 : 0.34) * bolt.scale;
              _dummy.scale.set(wakeW, wakeW, wakeLen * 0.5);
              _dummy.updateMatrix();
              this.boltWakeRibbonMesh.setMatrixAt(wakeSlot, _dummy.matrix);
              this.wakeMetaAttr.setXYZW(wakeSlot, flightU * 0.65, bolt.seed, 0.0, 1.0);
              wakeSlot++;
            }
          }
        } else if (impactElapsed >= 0 && impactElapsed <= volley.impactDuration) {
          // -----------------------------------------------------------------
          // B. Impact Shard Shatter Burst (DC 1) & Expanding Starlight Ring (DC 2)
          //    Shards keep 100% physical scale and dissolve via NoiseAtlas erosion!
          // -----------------------------------------------------------------
          if (!bolt.hitFired) {
            bolt.hitFired = true;
            if (typeof volley.onHit === 'function') {
              volley.onHit({
                comboIndex: volley.comboIndex,
                hitPosition: volley.end.clone(),
                boltIndex: bIdx,
              });
            }
          }

          const impU = saturate(impactElapsed / volley.impactDuration);
          const hitPos = volley.end;
          const groundY = this.getGroundHeight(hitPos.x, hitPos.z) + 0.05;

          // 1. Ballistic 3D Starlight Crystal Shards bursting outward & dissolving via NoiseAtlas
          const shardCount = bolt.shardCount || 8;
          const speedMult = bolt.isNovaOrb ? 1.38 : volley.comboIndex === 2 ? 1.15 : 0.92;
          const sizeMult = bolt.isNovaOrb ? 1.35 : volley.comboIndex === 2 ? 1.12 : 0.95;
          const drag = 1.65;
          const gravity = -18.5;

          for (let sIdx = 0; sIdx < shardCount && coreSlot < MAX_CORE_AND_SHARD_INSTANCES; sIdx++) {
            const tmpl = this.shardTemplates[(bIdx * 9 + sIdx) % this.shardTemplates.length];
            const dissolveProgress = smoothstep(0.32, 0.96, impU + tmpl.stagger);
            if (dissolveProgress >= 0.995) continue;

            const dragT = (1.0 - Math.exp(-drag * impactElapsed)) / drag;
            const sx = hitPos.x + tmpl.vx * speedMult * dragT;
            const sz = hitPos.z + tmpl.vz * speedMult * dragT;
            const rawY = hitPos.y + tmpl.vy * speedMult * dragT + 0.5 * gravity * impactElapsed * impactElapsed;
            const sy = Math.max(groundY, rawY);

            _dummy.position.set(sx, sy, sz);
            _euler.set(
              tmpl.spinX * impactElapsed + tmpl.seed,
              tmpl.spinY * impactElapsed,
              tmpl.spinZ * impactElapsed
            );
            _dummy.quaternion.setFromEuler(_euler);

            // Physical Scale Rule: keep shard at 100% scale (no shrinking!) while NoiseAtlas erodes it
            const pop = outQuint(Math.min(1.0, impactElapsed / 0.05));
            const sc = tmpl.size * sizeMult * pop;
            _dummy.scale.set(sc * 0.65, sc * 0.65, sc * 1.45);
            _dummy.updateMatrix();
            this.boltCoreAndShardsMesh.setMatrixAt(coreSlot, _dummy.matrix);
            this.coreMetaAttr.setXYZW(coreSlot, tmpl.seed, 1.25, dissolveProgress, 1.0);
            coreSlot++;
          }

          // 2. Crisp Expanding Starlight Impact Ring at Hit Point (DC 2)
          //    (Only spawn 1 primary + 1 tilted ring for Finisher / Charged Nova so rings don't triple-stack)
          if ((bIdx === 0 || volley.comboIndex === 1) && wakeSlot < MAX_WAKE_AND_RING_INSTANCES) {
            const ringRad = bolt.burstRadius * (0.38 + 0.62 * outQuint(Math.min(1.0, impU * 1.6)));
            _dummy.position.set(hitPos.x, hitPos.y, hitPos.z);
            _euler.set(0.28, bIdx * 1.1, -0.22);
            _dummy.quaternion.setFromEuler(_euler);
            _dummy.scale.set(ringRad, 1.0, ringRad);
            _dummy.updateMatrix();
            this.boltWakeRibbonMesh.setMatrixAt(wakeSlot, _dummy.matrix);
            this.wakeMetaAttr.setXYZW(wakeSlot, impU, bolt.seed + 0.5, 1.0, 1.0);
            wakeSlot++;

            // Ground-parallel starlight shock ring for Charged Heavy Nova (3.5m) & Combo 3 Finisher
            if (volley.comboIndex >= 2 && wakeSlot < MAX_WAKE_AND_RING_INSTANCES) {
              _dummy.position.set(hitPos.x, groundY + 0.04, hitPos.z);
              _dummy.quaternion.setFromAxisAngle(UP, clockTime * 1.5);
              _dummy.scale.set(ringRad * 1.05, 1.0, ringRad * 1.05);
              _dummy.updateMatrix();
              this.boltWakeRibbonMesh.setMatrixAt(wakeSlot, _dummy.matrix);
              this.wakeMetaAttr.setXYZW(wakeSlot, impU * 0.92, bolt.seed + 2.1, 1.0, 1.0);
              wakeSlot++;
            }
          }

          if (impactElapsed <= 0.045 && volley.comboIndex >= 2) {
            anyHitstop = true;
          }
          if (impactElapsed <= 0.32 && volley.comboIndex >= 2) {
            const amp = volley.comboIndex === 3 ? 0.16 : 0.09;
            maxShakeEnv = Math.max(maxShakeEnv, Math.exp(-impactElapsed * 8.5) * amp);
          }
        }
      }
    }

    this.boltCoreAndShardsMesh.count = coreSlot;
    this.boltCoreAndShardsMesh.instanceMatrix.needsUpdate = true;
    this.coreMetaAttr.needsUpdate = true;

    this.boltWakeRibbonMesh.count = wakeSlot;
    this.boltWakeRibbonMesh.instanceMatrix.needsUpdate = true;
    this.wakeMetaAttr.needsUpdate = true;

    this._hitstopScale = anyHitstop ? 0.06 : 1.0;
    if (maxShakeEnv > 0.001) {
      this._shakeOffset.set(
        Math.sin(clockTime * 58.0) * maxShakeEnv,
        Math.abs(Math.cos(clockTime * 64.0)) * maxShakeEnv * 0.75,
        Math.cos(clockTime * 52.0) * maxShakeEnv
      );
    } else {
      this._shakeOffset.set(0, 0, 0);
    }

    const anyVisible = coreSlot > 0 || wakeSlot > 0;
    this.group.visible = anyVisible;
    this.active = anyVisible;
  }

  update(dt) {
    this.sharedUniforms.uTime.value += dt;
    if (this.volleys.length === 0) {
      if (this.group.visible) this.clear();
      return;
    }

    this.age += dt;
    for (let i = this.volleys.length - 1; i >= 0; i--) {
      this.volleys[i].age += dt;
      if (this.volleys[i].age > this.volleys[i].totalDuration) {
        this.volleys.splice(i, 1);
      }
    }

    if (this.volleys.length === 0) {
      this.clear();
      return;
    }

    this._evaluateVolleys(this.sharedUniforms.uTime.value);
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

  getStats() {
    if (!this.active || !this.group.visible) {
      return {
        active: false,
        drawCalls: 0,
        activeCoresAndShards: 0,
        activeWakesAndRings: 0,
      };
    }
    let drawCalls = 0;
    if (this.boltCoreAndShardsMesh.count > 0) drawCalls++;
    if (this.boltWakeRibbonMesh.count > 0) drawCalls++;
    return {
      active: drawCalls > 0,
      age: Number(this.age.toFixed(3)),
      drawCalls,
      activeCoresAndShards: this.boltCoreAndShardsMesh.count,
      activeWakesAndRings: this.boltWakeRibbonMesh.count,
    };
  }

  clear() {
    this.active = false;
    this.age = 0;
    this.volleys.length = 0;
    this._shakeOffset.set(0, 0, 0);
    this._hitstopScale = 1.0;
    this.group.visible = false;
    this.boltCoreAndShardsMesh.count = 0;
    this.boltWakeRibbonMesh.count = 0;
  }

  dispose() {
    this.clear();
    this.boltCoreAndShardsMesh.geometry.dispose();
    this.boltWakeRibbonMesh.geometry.dispose();
    this.coreMat.dispose();
    this.wakeMat.dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

export function createMageBoltSystem(options = {}) {
  return new MageBoltSystem(options);
}
