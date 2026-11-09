// ============================================================================
// world/assets/vfx/aim-arrow.js
//
// Wave 2A: Sculpted 3D Beveled Relief Spellbook Aim Arrow & Impact Reticle
//
// Visual & Engineering Contract:
// - Replaces flat 2D ground decals with a true 3D extruded, beveled relief
//   mesh (`0cm` grounded skirt -> `6.8cm` beveled shoulder flats -> `9.8cm`
//   crowned central spine ridge) that conforms dynamically to Haru-machi's
//   terrain height `getGroundHeight(x, z)`.
// - Packs 4 closed, outward-wound 3D manifold sub-meshes into 1 single
//   indexed `BufferGeometry` (`1` draw call active, `0` draw calls hidden):
//     1. Part 0: 3D Extruded Beveled Shaft (`24` lengthwise rows x `7`-point
//        3D cross-section + front/back 3D end caps) with raised central spine.
//     2. Part 1: 3D Sculpted Swept-Wing Chevron Spearhead (`14` rows x `7`-point
//        3D diamond-ridge cross-section + swept barb back walls, `11cm` peak).
//     3. Part 2: Outer 3D Beveled Target Ring / Glacial Apex Collar (`48`
//        angular segments x `5`-point 3D trapezoid/ridge profile + 8 raised
//        3D crown battlements).
//     4. Part 3: Inner 3D Beveled Bullseye Ring & 4 Compass Chevrons (`32`
//        angular segments x `5`-point 3D profile).
// - Universal "Zero Glass" Law: Hardware-opaque (`transparent: false,
//   depthWrite: true, side: THREE.FrontSide`) matte gouache cel-shader driven
//   by true 3D surface normals (`vNormal`) and 3D relief height (`vHeight`).
//     * Mode `'frost_lance'` (or `'ice'`): fixed `14.5m` length, crisp glacial
//       cyan-white spine (`#e0f7ff`), cerulean-ice bevels (`#38bdf8`), deep
//       alpine-slate side walls (`#1e4e68`), dark navy-indigo base skirt (`#0c2d48`).
//     * Mode `'cinder_fall'` (or `'fire'`): variable tip distance clamped to
//       `3.0..16.0m` with a sculpted 3D volcanic crater ring at the tip,
//       sunlit cream-gold spine (`#fef08a`), warm terracotta-amber bevels
//       (`#f97316`), crimson-garnet side walls (`#be123c`), dark umber-wine
//       base skirt (`#27091c`).
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const AIM_ARROW_DEFAULTS = Object.freeze({
  gridCols: 6,
  gridRows: 36,
  groundOffset: 0.012,
  frostLanceLength: 14.5,
  cinderFallDefaultDistance: 11.5,
  minDistance: 3.0,
  maxDistance: 16.0,
  frostHalfSpan: 1.45,
  cinderHalfSpan: 2.05,

  // Mode 'frost_lance' ('ice') Linear-sRGB Uniforms
  colorIceCore: '#e8faff',
  colorIceMid: '#4cc3f7',
  colorIceWall: '#1b557a',
  colorIceInk: '#0c263b',

  // Mode 'cinder_fall' ('fire') Linear-sRGB Uniforms
  colorFireCore: '#fef3a8',
  colorFireAmber: '#f97316',
  colorFireCrimson: '#be123c',
  colorFireInk: '#2a0a16',
});

// 7-point 3D cross-section for the Shaft (Part 0) & Chevron Spearhead (Part 1)
// latFrac in [-1, 1], heightM in meters, normal (nx, ny)
const SHAFT_PROFILE = [
  { lat: -1.00, h: 0.000, nx: -0.82, ny: 0.57, ridge: 0.0 }, // 0: left grounded base skirt
  { lat: -0.76, h: 0.068, nx: -0.28, ny: 0.96, ridge: 0.45 }, // 1: left beveled top shoulder
  { lat: -0.26, h: 0.056, nx: -0.12, ny: 0.99, ridge: 0.35 }, // 2: left inner flute channel
  { lat:  0.00, h: 0.098, nx:  0.00, ny: 1.00, ridge: 1.00 }, // 3: raised 3D central spine ridge
  { lat:  0.26, h: 0.056, nx:  0.12, ny: 0.99, ridge: 0.35 }, // 4: right inner flute channel
  { lat:  0.76, h: 0.068, nx:  0.28, ny: 0.96, ridge: 0.45 }, // 5: right beveled top shoulder
  { lat:  1.00, h: 0.000, nx:  0.82, ny: 0.57, ridge: 0.0 }, // 6: right grounded base skirt
];

// 5-point 3D cross-section for the Closed Beveled Target Rings (Part 2 & Part 3)
const RING_PROFILE = [
  { rOff: -1.00, h: 0.000, nr: -0.80, ny: 0.60, ridge: 0.0 }, // 0: inner grounded skirt
  { rOff: -0.52, h: 0.064, nr: -0.24, ny: 0.97, ridge: 0.55 }, // 1: inner bevel shoulder
  { rOff:  0.00, h: 0.088, nr:  0.00, ny: 1.00, ridge: 1.00 }, // 2: crowned top ridge
  { rOff:  0.52, h: 0.064, nr:  0.24, ny: 0.97, ridge: 0.55 }, // 3: outer bevel shoulder
  { rOff:  1.00, h: 0.000, nr:  0.80, ny: 0.60, ridge: 0.0 }, // 4: outer grounded skirt
];

const SHAFT_ROWS = 24;
const HEAD_ROWS = 14;
const OUTER_RING_SEGS = 48;
const INNER_RING_SEGS = 32;

/**
 * Builds the multi-part 3D beveled relief geometry for the Spellbook Aim Arrow.
 * Every vertex stores:
 *  - `position` (dynamic world-space XYZ conformed to terrain)
 *  - `normal` (dynamic world-space 3D normal)
 *  - `uv` (`vec2(u, v01)`)
 *  - `aRibbonCoord` (`vec4(alongMeters, lateralMeters, heightMeters, ridgeMetric)`)
 *  - `aBlueprint` (`vec4(partId, uParam, colIndex, profileLatOrR)`)
 */
export function createAimArrowGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const ribbonCoords = [];
  const blueprints = [];
  const indices = [];

  function pushVert(u, v01, partId, colIdx, latOrR, h, nx, ny, nz, ridge) {
    const idx = positions.length / 3;
    positions.push(u * 14.5, h, latOrR);
    normals.push(nx, ny, nz);
    uvs.push(u, v01);
    ribbonCoords.push(u * 14.5, latOrR, h, ridge);
    blueprints.push(partId, u, colIdx, latOrR);
    return idx;
  }

  // ---------------------------------------------------------------------------
  // PART 0: 3D Extruded Beveled Arrow Shaft (SHAFT_ROWS = 24, 7 cols)
  // ---------------------------------------------------------------------------
  const shaftCols = SHAFT_PROFILE.length; // 7
  const shaftStartV = positions.length / 3;
  for (let r = 0; r <= SHAFT_ROWS; r++) {
    const u = r / SHAFT_ROWS;
    // Taper height down cleanly at the origin tail (r = 0) so the shaft is a closed 3D relief
    const endCapScale = r === 0 ? 0.0 : r === 1 ? 0.65 : 1.0;
    for (let c = 0; c < shaftCols; c++) {
      const p = SHAFT_PROFILE[c];
      const v01 = c / (shaftCols - 1);
      pushVert(u, v01, 0, c, p.lat, p.h * endCapScale, p.nx, p.ny, 0.0, p.ridge * endCapScale);
    }
  }
  for (let r = 0; r < SHAFT_ROWS; r++) {
    const rowA = shaftStartV + r * shaftCols;
    const rowB = shaftStartV + (r + 1) * shaftCols;
    for (let c = 0; c < shaftCols - 1; c++) {
      const a = rowA + c;
      const b = rowA + c + 1;
      const d = rowB + c;
      const e = rowB + c + 1;
      // Outward FrontSide (+Y up when row is +direction and col is +side)
      indices.push(a, b, d);
      indices.push(b, e, d);
    }
  }

  // ---------------------------------------------------------------------------
  // PART 1: 3D Sculpted Swept-Wing Chevron Spearhead (HEAD_ROWS = 14, 7 cols)
  // ---------------------------------------------------------------------------
  const headStartV = positions.length / 3;
  for (let r = 0; r <= HEAD_ROWS; r++) {
    const u = r / HEAD_ROWS;
    // r = 0 is the grounded back wall of the swept chevron barbs; r = HEAD_ROWS is the grounded spear tip
    const endCapScale = r === 0 || r === HEAD_ROWS ? 0.0 : r === 1 ? 0.85 : 1.0 - Math.pow(u, 2.2) * 0.35;
    for (let c = 0; c < shaftCols; c++) {
      const p = SHAFT_PROFILE[c];
      const v01 = c / (shaftCols - 1);
      // Spearhead has a taller, prouder 11.2cm central diamond ridge
      const headH = p.h * 1.16 * endCapScale;
      pushVert(u, v01, 1, c, p.lat, headH, p.nx, p.ny, 0.0, p.ridge * (r === 0 ? 0.0 : 1.0));
    }
  }
  for (let r = 0; r < HEAD_ROWS; r++) {
    const rowA = headStartV + r * shaftCols;
    const rowB = headStartV + (r + 1) * shaftCols;
    for (let c = 0; c < shaftCols - 1; c++) {
      const a = rowA + c;
      const b = rowA + c + 1;
      const d = rowB + c;
      const e = rowB + c + 1;
      indices.push(a, b, d);
      indices.push(b, e, d);
    }
  }

  // ---------------------------------------------------------------------------
  // PART 2: Outer 3D Beveled Target Ring / Glacial Apex Collar (48 segs x 5 cols)
  // ---------------------------------------------------------------------------
  const ringCols = RING_PROFILE.length; // 5
  const outerRingStartV = positions.length / 3;
  for (let s = 0; s <= OUTER_RING_SEGS; s++) {
    const u = s / OUTER_RING_SEGS;
    for (let c = 0; c < ringCols; c++) {
      const p = RING_PROFILE[c];
      const v01 = c / (ringCols - 1);
      pushVert(u, v01, 2, c, p.rOff, p.h, p.nr, p.ny, 0.0, p.ridge);
    }
  }
  for (let s = 0; s < OUTER_RING_SEGS; s++) {
    const rowA = outerRingStartV + s * ringCols;
    const rowB = outerRingStartV + (s + 1) * ringCols;
    for (let c = 0; c < ringCols - 1; c++) {
      const a = rowA + c;
      const b = rowA + c + 1;
      const d = rowB + c;
      const e = rowB + c + 1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  // ---------------------------------------------------------------------------
  // PART 3: Inner 3D Beveled Bullseye Ring (32 segs x 5 cols)
  // ---------------------------------------------------------------------------
  const innerRingStartV = positions.length / 3;
  for (let s = 0; s <= INNER_RING_SEGS; s++) {
    const u = s / INNER_RING_SEGS;
    for (let c = 0; c < ringCols; c++) {
      const p = RING_PROFILE[c];
      const v01 = c / (ringCols - 1);
      pushVert(u, v01, 3, c, p.rOff, p.h * 0.85, p.nr, p.ny, 0.0, p.ridge);
    }
  }
  for (let s = 0; s < INNER_RING_SEGS; s++) {
    const rowA = innerRingStartV + s * ringCols;
    const rowB = innerRingStartV + (s + 1) * ringCols;
    for (let c = 0; c < ringCols - 1; c++) {
      const a = rowA + c;
      const b = rowA + c + 1;
      const d = rowB + c;
      const e = rowB + c + 1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.Float32BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  const normAttr = new THREE.Float32BufferAttribute(normals, 3);
  normAttr.setUsage(THREE.DynamicDrawUsage);
  const coordAttr = new THREE.Float32BufferAttribute(ribbonCoords, 4);
  coordAttr.setUsage(THREE.DynamicDrawUsage);

  geo.setAttribute('position', posAttr);
  geo.setAttribute('normal', normAttr);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aRibbonCoord', coordAttr);
  geo.setAttribute('aBlueprint', new THREE.Float32BufferAttribute(blueprints, 4));
  geo.setIndex(indices);
  return geo;
}

function createAimArrowMaterial(noiseAtlas, config) {
  return new THREE.ShaderMaterial({
    name: 'SpellbookAimArrowMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: { value: 0.0 },
      uLength: { value: config.frostLanceLength },
      uMode: { value: 0.0 }, // 0.0 = frost_lance ('ice'), 1.0 = cinder_fall ('fire')
      // Smoothed 0..1 state weights: snapped to an enemy, cancel armed, on cooldown, released.
      uLock: { value: 0.0 },
      uCancel: { value: 0.0 },
      uBlocked: { value: 0.0 },
      uCommit: { value: 0.0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
      uIceCore: { value: new THREE.Color(config.colorIceCore) },
      uIceMid: { value: new THREE.Color(config.colorIceMid) },
      uIceWall: { value: new THREE.Color(config.colorIceWall) },
      uIceInk: { value: new THREE.Color(config.colorIceInk) },
      uFireCore: { value: new THREE.Color(config.colorFireCore) },
      uFireAmber: { value: new THREE.Color(config.colorFireAmber) },
      uFireCrimson: { value: new THREE.Color(config.colorFireCrimson) },
      uFireInk: { value: new THREE.Color(config.colorFireInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aRibbonCoord; // x: alongMeters, y: lateralMeters, z: heightMeters, w: ridgeMetric
      attribute vec4 aBlueprint;   // x: partId, y: uParam, z: colIdx, w: profileLatOrR
      varying vec4 vCoord;
      varying vec4 vBlueprint;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vCoord = aRibbonCoord;
        vBlueprint = aBlueprint;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform float uLength;
      uniform float uMode;
      uniform float uLock;
      uniform float uCancel;
      uniform float uBlocked;
      uniform float uCommit;
      uniform vec3 uSunDir;
      uniform float uDaylight;

      uniform vec3 uIceCore;
      uniform vec3 uIceMid;
      uniform vec3 uIceWall;
      uniform vec3 uIceInk;

      uniform vec3 uFireCore;
      uniform vec3 uFireAmber;
      uniform vec3 uFireCrimson;
      uniform vec3 uFireInk;

      varying vec4 vCoord;
      varying vec4 vBlueprint;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        float alongM = vCoord.x;
        float latM = vCoord.y;
        float hM = vCoord.z;
        float ridgeMetric = clamp(vCoord.w, 0.0, 1.0);
        float partId = vBlueprint.x;
        float uParam = vBlueprint.y;
        float isFire = step(0.5, uMode);

        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(vec3(uSunDir.x, max(0.45, uSunDir.y), uSunDir.z));
        float ndl = dot(N, L) * 0.5 + 0.5;
        float topFacing = clamp(N.y, 0.0, 1.0);

        // Subtle gouache brushstroke modulation + directional flow chevrons carved along the 3D top bevel
        vec4 nSample = texture2D(
          uNoiseAtlas,
          vec2(alongM * 0.28 - uTime * 0.65, latM * 0.45 + 0.37)
        );
        // Flow speeds up when locked, stalls when cancel-armed or on cooldown.
        float flowRate = 1.65 * (1.0 + 0.6 * uLock) * (1.0 - 0.85 * max(uCancel, uBlocked));
        float scrollWave = fract(alongM * 0.52 - abs(latM) * 0.85 - uTime * flowRate);
        float chevronPulse = smoothstep(0.18, 0.38, scrollWave) * smoothstep(0.82, 0.58, scrollWave);
        float isShaftOrHead = step(partId, 1.5);
        float flowHighlight = chevronPulse * isShaftOrHead * smoothstep(0.035, 0.065, hM);

        // Grounding AO & crisp cel ink along the base skirt where the 3D wall meets the terrain
        float skirtInk = 1.0 - smoothstep(0.008, 0.032, hM);
        float sideWallFactor = 1.0 - smoothstep(0.62, 0.90, topFacing);
        float spineCrown = smoothstep(0.62, 0.92, ridgeMetric) * smoothstep(0.05, 0.085, hM);

        vec3 col;
        if (isFire < 0.5) {
          // Mode 0: Frost Lance — Sculpted 3D Glacial Relief Arrow
          vec3 topGouache = mix(uIceMid * 0.94, uIceMid * 1.08, step(0.52, ndl + (nSample.g - 0.5) * 0.12));
          // Chiseled 3D side bevel walls in deep alpine slate
          col = mix(topGouache, uIceWall, sideWallFactor * 0.85);
          // Raised 3D central spine ridge + scrolling chevron pulse in crisp cyan-ivory
          float coreMask = clamp(spineCrown + flowHighlight * 0.72 + step(1.5, partId) * smoothstep(0.72, 0.95, ridgeMetric) * 0.85, 0.0, 1.0);
          col = mix(col, uIceCore * 1.12, step(0.42, coreMask));
          // Grounded dark navy-indigo base skirt rim
          col = mix(col, uIceInk, skirtInk * 0.92);
        } else {
          // Mode 1: Cinder Fall — Sculpted 3D Terracotta-Gold & Crimson Relief Arrow + Target Ring
          vec3 topGouache = mix(uFireCrimson * 1.04, uFireAmber * 1.08, step(0.46, ndl + ridgeMetric * 0.25 + (nSample.g - 0.5) * 0.12));
          // Chiseled 3D side bevel walls in rich crimson-garnet
          col = mix(topGouache, uFireCrimson * 0.78, sideWallFactor * 0.85);
          // Raised 3D central spine ridge + target ring crown in sunlit cream-gold
          float coreMask = clamp(spineCrown + flowHighlight * 0.75 + step(1.5, partId) * smoothstep(0.70, 0.95, ridgeMetric) * 0.88, 0.0, 1.0);
          col = mix(col, uFireCore * 1.14, step(0.42, coreMask));
          // Grounded dark umber-wine base skirt rim
          col = mix(col, uFireInk, skirtInk * 0.92);
        }

        // Locked: target rings (parts 2/3) pulse to the core colour on their crown.
        float isRing = step(1.5, partId);
        float lockPulse = 0.55 + 0.45 * sin(uTime * 9.0);
        vec3 coreCol = mix(uIceCore, uFireCore, isFire);
        col = mix(col, coreCol * 1.18, uLock * isRing * smoothstep(0.4, 0.9, ridgeMetric) * lockPulse);
        // Released: a short bright flash toward the core colour while the clip reaches its release frame.
        col = mix(col, coreCol * 1.2, uCommit * 0.55 * (1.0 - skirtInk));
        // Cancel-armed / cooldown: opaque desaturated slate (no transparency, Zero Glass).
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 slate = mix(vec3(0.16, 0.17, 0.2), vec3(0.58, 0.6, 0.64), clamp(luma * 1.4, 0.0, 1.0));
        vec3 cancelCol = mix(slate, vec3(0.62, 0.16, 0.18), 0.35 * (1.0 - skirtInk));
        col = mix(col, slate, uBlocked * 0.8);
        col = mix(col, cancelCol, uCancel);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export class AimArrowSystem {
  constructor({
    scene,
    getGroundHeight = () => 0,
    config = {},
  } = {}) {
    this.scene = scene || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.config = { ...AIM_ARROW_DEFAULTS, ...config };

    this.noiseAtlas = getSharedNoiseAtlas();

    this.group = new THREE.Group();
    this.group.name = 'AimArrowVfxRoot';
    this.group.visible = false;
    if (this.scene) {
      this.scene.add(this.group);
    }

    this.origin = new THREE.Vector3(0, 0, 0);
    this.direction = new THREE.Vector3(1, 0, 0);
    this.side = new THREE.Vector3(0, 0, 1);
    this.mode = 'frost_lance';
    this.distance = this.config.frostLanceLength;
    this.length = this.config.frostLanceLength;
    this.active = false;
    this.age = 0;
    this._target = {
      origin: new THREE.Vector3(),
      direction: new THREE.Vector3(1, 0, 0),
      distance: this.config.frostLanceLength,
    };
    this._stateTarget = { lock: 0, cancel: 0, blocked: 0, commit: 0 };
    this._releaseTimer = 0;

    this.geometry = createAimArrowGeometry();
    this.material = createAimArrowMaterial(this.noiseAtlas, this.config);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'AimArrow_DC1_TerrainRibbon';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.group.add(this.mesh);
  }

  _normalizeMode(mode) {
    const m = String(mode || this.mode || 'frost_lance').toLowerCase();
    if (m === 'cinder_fall' || m === 'cinderfall' || m === 'fire' || m === '3' || m === 'meteor') {
      return 'cinder_fall';
    }
    return 'frost_lance';
  }

  // Accepts `direction`, or the controller's `dirX/dirZ`, or `yaw`.
  _readDirection(options) {
    const d = options.direction;
    if (d && (Number.isFinite(d.x ?? d[0]) || Number.isFinite(d.z ?? d[2]))) {
      return { x: d.x ?? d[0] ?? 0, z: d.z ?? d[2] ?? 0 };
    }
    if (Number.isFinite(options.dirX) && Number.isFinite(options.dirZ)) {
      return { x: options.dirX, z: options.dirZ };
    }
    if (Number.isFinite(options.yaw)) {
      return { x: Math.sin(options.yaw), z: Math.cos(options.yaw) };
    }
    return null;
  }

  _readState(options) {
    const s = options.lockState ?? options.state;
    if (s === undefined) return;
    const t = this._stateTarget;
    t.lock = s === 'locked' ? 1 : 0;
    t.cancel = s === 'cancel' ? 1 : 0;
    t.blocked = s === 'blocked' ? 1 : 0;
  }

  _applyAimState(options = {}) {
    const { origin, mode, distance } = options;
    const direction = this._readDirection(options);
    this._readState(options);
    if (origin) {
      const ox = origin.x ?? origin[0] ?? this.origin.x;
      const oz = origin.z ?? origin[2] ?? this.origin.z;
      const oy = this.getGroundHeight(ox, oz);
      this.origin.set(ox, oy, oz);
    } else {
      this.origin.y = this.getGroundHeight(this.origin.x, this.origin.z);
    }

    if (direction) {
      const len = Math.hypot(direction.x, direction.z) || 1.0;
      this.direction.set(direction.x / len, 0, direction.z / len);
    }
    this.side.set(-this.direction.z, 0, this.direction.x);

    if (mode !== undefined) {
      this.mode = this._normalizeMode(mode);
    }

    const c = this.config;
    if (this.mode === 'cinder_fall') {
      const rawDist =
        distance !== undefined && Number.isFinite(distance)
          ? distance
          : Number.isFinite(this.distance)
            ? this.distance
            : c.cinderFallDefaultDistance;
      this.distance = clamp(rawDist, c.minDistance, c.maxDistance);
      this.length = this.distance;
      this.material.uniforms.uMode.value = 1.0;
    } else {
      this.length = c.frostLanceLength;
      if (distance !== undefined && Number.isFinite(distance)) {
        this.distance = clamp(distance, c.minDistance, c.maxDistance);
      } else {
        this.distance = c.frostLanceLength;
      }
      this.material.uniforms.uMode.value = 0.0;
    }

    this.material.uniforms.uLength.value = this.length;
    this._target.origin.copy(this.origin);
    this._target.direction.copy(this.direction);
    this._target.distance = this.distance;
    this._confromRibbonToTerrain();
  }

  // Sets the aim goal; `update(dt)` glides toward it so snaps read as a quick slide, not a pop.
  updateAim(options = {}) {
    if (!this.active) return this.show(options);
    const nextMode = options.mode !== undefined ? this._normalizeMode(options.mode) : this.mode;
    if (nextMode !== this.mode) return this.show({ ...options, keepState: true });
    this._readState(options);
    const t = this._target;
    if (options.origin) {
      const ox = options.origin.x ?? options.origin[0] ?? t.origin.x;
      const oz = options.origin.z ?? options.origin[2] ?? t.origin.z;
      t.origin.set(ox, this.getGroundHeight(ox, oz), oz);
    }
    const dir = this._readDirection(options);
    if (dir) {
      const len = Math.hypot(dir.x, dir.z) || 1.0;
      t.direction.set(dir.x / len, 0, dir.z / len);
    }
    if (Number.isFinite(options.distance)) {
      t.distance = clamp(options.distance, this.config.minDistance, this.config.maxDistance);
    }
    this._releaseTimer = 0;
    return this;
  }

  setAim(options = {}) {
    return this.updateAim(options);
  }

  _stepTowardTarget(dt) {
    const t = this._target;
    const k = 1.0 - Math.exp(-22.0 * dt);
    let changed = false;
    // Origin follows the Mage rigidly; only yaw and reticle distance are smoothed.
    if (this.origin.distanceToSquared(t.origin) > 1e-8) {
      this.origin.copy(t.origin);
      changed = true;
    }
    const curYaw = Math.atan2(this.direction.x, this.direction.z);
    const tgtYaw = Math.atan2(t.direction.x, t.direction.z);
    let dYaw = tgtYaw - curYaw;
    while (dYaw > Math.PI) dYaw -= TAU;
    while (dYaw < -Math.PI) dYaw += TAU;
    if (Math.abs(dYaw) > 1e-4) {
      const yaw = Math.abs(dYaw) < 1e-3 ? tgtYaw : curYaw + dYaw * k;
      this.direction.set(Math.sin(yaw), 0, Math.cos(yaw));
      this.side.set(-this.direction.z, 0, this.direction.x);
      changed = true;
    }
    if (this.mode === 'cinder_fall' && Math.abs(t.distance - this.distance) > 1e-3) {
      this.distance += (t.distance - this.distance) * k;
      this.length = this.distance;
      this.material.uniforms.uLength.value = this.length;
      changed = true;
    }
    return changed;
  }

  _stepState(dt) {
    const u = this.material.uniforms;
    const s = this._stateTarget;
    const k = 1.0 - Math.exp(-14.0 * dt);
    const prevLock = u.uLock.value;
    u.uLock.value += (s.lock - u.uLock.value) * k;
    u.uCancel.value += (s.cancel - u.uCancel.value) * k;
    u.uBlocked.value += (s.blocked - u.uBlocked.value) * k;
    u.uCommit.value += (s.commit - u.uCommit.value) * (1.0 - Math.exp(-30.0 * dt));
    return Math.abs(u.uLock.value - prevLock) > 1e-3;
  }

  _confromRibbonToTerrain() {
    const c = this.config;
    const isFire = this.mode === 'cinder_fall';
    const L = Math.max(3.0, this.length);
    const yBaseOffset = c.groundOffset ?? 0.012;

    const posArr = this.geometry.attributes.position.array;
    const normArr = this.geometry.attributes.normal.array;
    const coordArr = this.geometry.attributes.aRibbonCoord.array;
    const bpArr = this.geometry.attributes.aBlueprint.array;
    const vertCount = this.geometry.attributes.position.count;

    const ox = this.origin.x;
    const oz = this.origin.z;
    const dx = this.direction.x;
    const dz = this.direction.z;
    const sx = this.side.x;
    const sz = this.side.z;

    // Shaft & Spearhead dimensions along the aim ray
    const shaftStart = 0.55;
    const headApex = isFire ? Math.max(shaftStart + 1.35, L - 0.55) : L;
    const headLen = isFire ? 1.65 : 2.25;
    const headBase = Math.max(shaftStart + 0.50, headApex - headLen);
    const maxBarbHalfW = isFire ? 0.92 : 1.12;
    // Target rings cinch ~12% when the reticle is snapped onto an enemy.
    const lockTighten = 1.0 - 0.12 * clamp(this.material.uniforms.uLock.value, 0.0, 1.0);

    for (let i = 0; i < vertCount; i++) {
      const bOff = i * 4;
      const pOff = i * 3;
      const partId = bpArr[bOff + 0];
      const u = bpArr[bOff + 1];
      const colIdx = Math.round(bpArr[bOff + 2]);
      const latOrR = bpArr[bOff + 3];

      let alongM = 0.0;
      let latM = 0.0;
      let localH = 0.0;
      let wnx = 0.0;
      let wny = 1.0;
      let wnz = 0.0;

      if (partId < 0.5) {
        // PART 0: 3D Extruded Beveled Shaft (from shaftStart to headBase + 0.18m)
        const prof = SHAFT_PROFILE[colIdx] || SHAFT_PROFILE[3];
        const rIdx = Math.round(u * SHAFT_ROWS);
        const endCapScale = rIdx === 0 ? 0.0 : rIdx === 1 ? 0.72 : 1.0;
        const shaftHalfW = isFire
          ? 0.25 + 0.06 * u
          : 0.24 + 0.14 * u;

        alongM = shaftStart + u * (headBase + 0.18 - shaftStart);
        latM = latOrR * shaftHalfW;
        localH = prof.h * endCapScale;

        // Transform cross-section normal (nx along lateral side, ny up) to world space
        wnx = sx * prof.nx;
        wny = prof.ny;
        wnz = sz * prof.nx;
      } else if (partId < 1.5) {
        // PART 1: 3D Sculpted Swept-Wing Chevron Spearhead (from headBase to headApex)
        const prof = SHAFT_PROFILE[colIdx] || SHAFT_PROFILE[3];
        const rIdx = Math.round(u * HEAD_ROWS);
        const tipEnv = 1.0 - u; // 1 at barb base -> 0 at apex tip
        const halfW = Math.max(0.025, tipEnv * maxBarbHalfW);
        // Swept V-chevron: outer barbs sweep backward by |latFrac| * 0.55m
        const barbSweepBack = Math.abs(latOrR) * (isFire ? 0.46 : 0.62) * tipEnv;

        alongM = headBase + u * (headApex - headBase) - barbSweepBack;
        latM = latOrR * halfW;

        const endCapScale =
          rIdx === 0 || rIdx === HEAD_ROWS
            ? 0.0
            : rIdx === 1
              ? 0.88
              : 1.0 - Math.pow(u, 2.2) * 0.32;
        localH = prof.h * 1.18 * endCapScale;

        // Rotate normal slightly forward toward the spear bevel
        const fwdTilt = 0.22;
        wnx = sx * prof.nx + dx * fwdTilt;
        wny = prof.ny;
        wnz = sz * prof.nx + dz * fwdTilt;
      } else if (partId < 2.5) {
        // PART 2: Outer 3D Beveled Target Ring (Cinder Fall crater rim / Frost Lance diamond collar)
        const prof = RING_PROFILE[colIdx] || RING_PROFILE[2];
        const ang = u * TAU;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        // 8 sculpted crown battlements in Cinder Fall; 4 glacial star points in Frost Lance
        const crownLobes = isFire ? Math.cos(ang * 8.0) : Math.cos(ang * 4.0);
        const baseRingR =
          (isFire
            ? 1.78 + 0.08 * Math.max(0.0, crownLobes)
            : 0.78 + 0.14 * Math.abs(Math.cos(ang * 2.0))) * lockTighten;
        const ringHalfThick = isFire ? 0.16 : 0.12;
        const centerAlong = isFire ? L : L - 0.85;

        const rActual = baseRingR + latOrR * ringHalfThick;
        alongM = centerAlong + cosA * rActual;
        latM = sinA * rActual;
        localH = prof.h * (isFire ? 1.08 + 0.22 * Math.max(0.0, crownLobes) : 0.92);

        const radDirX = dx * cosA + sx * sinA;
        const radDirZ = dz * cosA + sz * sinA;
        wnx = radDirX * prof.nr;
        wny = prof.ny;
        wnz = radDirZ * prof.nr;
      } else {
        // PART 3: Inner 3D Beveled Bullseye Ring (at tip)
        const prof = RING_PROFILE[colIdx] || RING_PROFILE[2];
        const ang = u * TAU;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        const baseRingR = (isFire ? 0.82 : 0.36) * lockTighten;
        const ringHalfThick = isFire ? 0.12 : 0.085;
        const centerAlong = isFire ? L : L - 0.85;

        const rActual = baseRingR + latOrR * ringHalfThick;
        alongM = centerAlong + cosA * rActual;
        latM = sinA * rActual;
        localH = prof.h * (isFire ? 0.95 : 0.78);

        const radDirX = dx * cosA + sx * sinA;
        const radDirZ = dz * cosA + sz * sinA;
        wnx = radDirX * prof.nr;
        wny = prof.ny;
        wnz = radDirZ * prof.nr;
      }

      const wx = ox + dx * alongM + sx * latM;
      const wz = oz + dz * alongM + sz * latM;
      const wy = this.getGroundHeight(wx, wz) + yBaseOffset + localH;

      posArr[pOff + 0] = wx;
      posArr[pOff + 1] = wy;
      posArr[pOff + 2] = wz;

      const nLen = Math.hypot(wnx, wny, wnz) || 1.0;
      normArr[pOff + 0] = wnx / nLen;
      normArr[pOff + 1] = wny / nLen;
      normArr[pOff + 2] = wnz / nLen;

      coordArr[bOff + 0] = alongM;
      coordArr[bOff + 1] = latM;
      coordArr[bOff + 2] = localH;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.aRibbonCoord.needsUpdate = true;
  }

  show(options = {}) {
    const fresh = !this.active && !options.keepState;
    this._stateTarget.commit = 0;
    this._releaseTimer = 0;
    this._applyAimState(options);
    if (fresh) {
      const u = this.material.uniforms;
      u.uLock.value = this._stateTarget.lock;
      u.uCancel.value = this._stateTarget.cancel;
      u.uBlocked.value = this._stateTarget.blocked;
      u.uCommit.value = 0;
    }
    this.active = true;
    this.group.visible = true;
    return this;
  }

  update(dt = 0.016, options = null) {
    if (options && typeof options === 'object') {
      this.updateAim(options);
    }
    if (!this.active || !this.group.visible) return this;
    if (Number.isFinite(dt)) {
      this.age += dt;
      this.material.uniforms.uTime.value = this.age;
      const moved = this._stepTowardTarget(dt);
      const lockAnimating = this._stepState(dt);
      if (moved || lockAnimating) this._confromRibbonToTerrain();
      if (this._releaseTimer > 0) {
        this._releaseTimer -= dt;
        if (this._releaseTimer <= 0) this.hide();
      }
    }
    return this;
  }

  /**
   * Release-E: keeps the arrow on its final aim in a bright committed state for
   * `holdSeconds` (until the cast clip's release frame), then hides it.
   */
  release({ holdSeconds = 0 } = {}) {
    if (!this.active || !(holdSeconds > 0)) return this.hide();
    this._stateTarget.commit = 1;
    this._stateTarget.cancel = 0;
    this._releaseTimer = Math.min(1.0, holdSeconds);
    return this;
  }

  seek(timeSeconds = 0.0, options = null) {
    if (options && typeof options === 'object') {
      this._applyAimState(options);
    } else {
      this._confromRibbonToTerrain();
    }
    this.active = true;
    this.age = Math.max(0.0, timeSeconds);
    this.material.uniforms.uTime.value = this.age;
    this.group.visible = true;
    return this;
  }

  hide() {
    this.active = false;
    this.group.visible = false;
    this._releaseTimer = 0;
    this._stateTarget.commit = 0;
    return this;
  }

  setLighting({ sunDir, daylight = 1.0 } = {}) {
    if (sunDir) this.material.uniforms.uSunDir.value.copy(sunDir).normalize();
    if (Number.isFinite(daylight)) {
      this.material.uniforms.uDaylight.value = clamp(daylight, 0.0, 1.2);
    }
  }

  getTipPosition(out = new THREE.Vector3()) {
    const tx = this.origin.x + this.direction.x * this.length;
    const tz = this.origin.z + this.direction.z * this.length;
    const ty = this.getGroundHeight(tx, tz);
    return out.set(tx, ty, tz);
  }

  getStats() {
    const visible = Boolean(this.active && this.group.visible);
    return {
      active: visible,
      mode: this.mode,
      length: Number(this.length.toFixed(2)),
      distance: Number(this.distance.toFixed(2)),
      drawCalls: visible ? 1 : 0,
      gridCols: this.config.gridCols,
      gridRows: this.config.gridRows,
      vertexCount: this.geometry.attributes.position.count,
    };
  }

  clear() {
    this.age = 0;
    this.material.uniforms.uTime.value = 0;
    return this.hide();
  }

  dispose() {
    this.clear();
    this.geometry.dispose();
    this.material.dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

export function createAimArrowSystem(options = {}) {
  return new AimArrowSystem(options);
}
