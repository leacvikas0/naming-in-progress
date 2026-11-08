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
  groundOffset: 0.016,
  staffHeightOffset: 1.15,
  endHeightOffset: 0.08,
  frostLanceLength: 14.5,
  cinderFallDefaultDistance: 11.5,
  shatterlanceDefaultDistance: 7.5,
  minDistance: 0.8,
  maxDistance: 18.0,
  frostHalfSpan: 1.45,
  cinderHalfSpan: 2.05,

  // Mode 'frost_lance' / 'shatterlance' ('ice') Linear-sRGB Uniforms
  colorIceCore: '#e8faff',
  colorIceMid: '#38bdf8',
  colorIceWall: '#0284c7',
  colorIceInk: '#18121e',

  // Mode 'cinder_fall' ('fire') Linear-sRGB Uniforms
  colorFireCore: '#fef3a8',
  colorFireAmber: '#ff6a12',
  colorFireCrimson: '#be123c',
  colorFireInk: '#18121e',
});

// 7-point 3D cross-section for the Parabolic Trajectory Arc (Part 0) & Plunge Tip (Part 1)
// latFrac in [-1, 1], heightM in meters, normal (nx, ny)
const SHAFT_PROFILE = [
  { lat: -1.00, h: 0.000, nx: -0.86, ny: 0.51, ridge: 0.0 }, // 0: left ink border edge
  { lat: -0.74, h: 0.046, nx: -0.32, ny: 0.95, ridge: 0.45 }, // 1: left beveled top shoulder
  { lat: -0.26, h: 0.038, nx: -0.12, ny: 0.99, ridge: 0.35 }, // 2: left inner flute channel
  { lat:  0.00, h: 0.074, nx:  0.00, ny: 1.00, ridge: 1.00 }, // 3: raised 3D central trajectory spine
  { lat:  0.26, h: 0.038, nx:  0.12, ny: 0.99, ridge: 0.35 }, // 4: right inner flute channel
  { lat:  0.74, h: 0.046, nx:  0.32, ny: 0.95, ridge: 0.45 }, // 5: right beveled top shoulder
  { lat:  1.00, h: 0.000, nx:  0.86, ny: 0.51, ridge: 0.0 }, // 6: right ink border edge
];

// 5-point 3D cross-section for the Closed Beveled Ground Impact Rings (Part 2 & Part 3)
const RING_PROFILE = [
  { rOff: -1.00, h: 0.000, nr: -0.82, ny: 0.57, ridge: 0.0 }, // 0: inner grounded ink skirt
  { rOff: -0.52, h: 0.064, nr: -0.24, ny: 0.97, ridge: 0.55 }, // 1: inner bevel shoulder
  { rOff:  0.00, h: 0.092, nr:  0.00, ny: 1.00, ridge: 1.00 }, // 2: crowned top ridge
  { rOff:  0.52, h: 0.064, nr:  0.24, ny: 0.97, ridge: 0.55 }, // 3: outer bevel shoulder
  { rOff:  1.00, h: 0.000, nr:  0.82, ny: 0.57, ridge: 0.0 }, // 4: outer grounded ink skirt
];

const SHAFT_ROWS = 32;
const HEAD_ROWS = 12;
const OUTER_RING_SEGS = 48;
const INNER_RING_SEGS = 32;

/**
 * Builds the multi-part 3D beveled geometry for the PUBG-style Parabolic Trajectory Arc
 * and 3D Ground Impact Ring (1 single indexed BufferGeometry, 1 draw call active, 0 hidden).
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
  // PART 0: 3D Parabolic Trajectory Arc Ribbon (SHAFT_ROWS = 32, 7 cols)
  // ---------------------------------------------------------------------------
  const shaftCols = SHAFT_PROFILE.length; // 7
  const shaftStartV = positions.length / 3;
  for (let r = 0; r <= SHAFT_ROWS; r++) {
    const u = r / SHAFT_ROWS;
    const endCapScale = r === 0 ? 0.0 : r === 1 ? 0.72 : 1.0;
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
      indices.push(a, b, d);
      indices.push(b, e, d);
    }
  }

  // ---------------------------------------------------------------------------
  // PART 1: 3D Ballistic Impact Chevron Plunge Head (HEAD_ROWS = 12, 7 cols)
  // ---------------------------------------------------------------------------
  const headStartV = positions.length / 3;
  for (let r = 0; r <= HEAD_ROWS; r++) {
    const u = r / HEAD_ROWS;
    const endCapScale = r === 0 || r === HEAD_ROWS ? 0.0 : r === 1 ? 0.85 : 1.0 - Math.pow(u, 2.2) * 0.35;
    for (let c = 0; c < shaftCols; c++) {
      const p = SHAFT_PROFILE[c];
      const v01 = c / (shaftCols - 1);
      const headH = p.h * 1.18 * endCapScale;
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
  // PART 2: Outer 3D Cel-Shaded Ground Impact Ring (48 segs x 5 cols)
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
  // PART 3: Inner 3D Beveled Bullseye Target Ring (32 segs x 5 cols)
  // ---------------------------------------------------------------------------
  const innerRingStartV = positions.length / 3;
  for (let s = 0; s <= INNER_RING_SEGS; s++) {
    const u = s / INNER_RING_SEGS;
    for (let c = 0; c < ringCols; c++) {
      const p = RING_PROFILE[c];
      const v01 = c / (ringCols - 1);
      pushVert(u, v01, 3, c, p.rOff, p.h * 0.88, p.nr, p.ny, 0.0, p.ridge);
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
      uMode: { value: 0.0 }, // 0.0 = ice ('frost_lance' / 'shatterlance'), 1.0 = fire ('cinder_fall')
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
      attribute vec4 aRibbonCoord; // x: alongMeters, y: lateralMeters, z: localHeightM, w: ridgeMetric
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
        float profileEdge = abs(vBlueprint.w);
        float isFire = step(0.5, uMode);

        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(vec3(uSunDir.x, max(0.45, uSunDir.y), uSunDir.z));
        float ndl = dot(N, L) * 0.5 + 0.5;
        float topFacing = clamp(abs(N.y), 0.0, 1.0);

        // Gouache noise + PUBG ballistic chevron pulses scrolling from staff tip to landing ring
        vec4 nSample = texture2D(
          uNoiseAtlas,
          vec2(alongM * 0.32 - uTime * 0.85, latM * 0.55 + 0.37)
        );
        float isArcOrHead = step(partId, 1.5);
        float scrollWave = fract(uParam * 6.5 - abs(vBlueprint.w) * 0.55 - uTime * 2.35);
        float chevronPulse = step(0.26, scrollWave) * (1.0 - step(0.68, scrollWave));
        float ringPulse = (1.0 - isArcOrHead) * step(0.35, fract(uParam * 8.0 - uTime * 1.4));
        float flowHighlight = chevronPulse * isArcOrHead * smoothstep(0.02, 0.055, hM) + ringPulse * 0.35;

        // Crisp dark cel ink framing (#18121e) along outer borders & base skirt (Zero Glass rule)
        float skirtInk = max(1.0 - smoothstep(0.008, 0.026, hM), smoothstep(0.78, 0.94, profileEdge));
        float sideWallFactor = 1.0 - smoothstep(0.52, 0.86, topFacing);
        float spineCrown = smoothstep(0.58, 0.90, ridgeMetric) * smoothstep(0.032, 0.068, hM);

        vec3 col;
        if (isFire < 0.5) {
          // Ice Mode ('frost_lance' & 'shatterlance'): Vibrant Icy Cyan (#38bdf8) + Glacial Core (#e8faff) + Dark Ink (#18121e)
          vec3 topGouache = mix(uIceMid * 0.94, uIceMid * 1.12, step(0.48, ndl + (nSample.g - 0.5) * 0.14));
          col = mix(topGouache, uIceWall, sideWallFactor * 0.85);
          float coreMask = clamp(spineCrown + flowHighlight * 0.78 + step(1.5, partId) * smoothstep(0.68, 0.94, ridgeMetric) * 0.88, 0.0, 1.0);
          col = mix(col, uIceCore * 1.14, step(0.40, coreMask));
          col = mix(col, uIceInk, step(0.52, skirtInk) * 0.95);
        } else {
          // Fire Mode ('cinder_fall'): Blazing Solar (#ff6a12) + Sunlit Gold Core (#fef3a8) + Dark Ink (#18121e)
          vec3 topGouache = mix(uFireCrimson * 1.04, uFireAmber * 1.12, step(0.44, ndl + ridgeMetric * 0.25 + (nSample.g - 0.5) * 0.14));
          col = mix(topGouache, uFireCrimson * 0.80, sideWallFactor * 0.85);
          float coreMask = clamp(spineCrown + flowHighlight * 0.80 + step(1.5, partId) * smoothstep(0.68, 0.94, ridgeMetric) * 0.90, 0.0, 1.0);
          col = mix(col, uFireCore * 1.15, step(0.40, coreMask));
          col = mix(col, uFireInk, step(0.52, skirtInk) * 0.95);
        }

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
    this.direction = new THREE.Vector3(0, 0, 1);
    this.side = new THREE.Vector3(-1, 0, 0);
    this.yaw = 0;
    this.mode = 'frost_lance';
    this.distance = this.config.frostLanceLength;
    this.length = this.config.frostLanceLength;
    this.customWidth = null;
    this.customRadius = null;
    this.active = false;
    this.age = 0;

    this.geometry = createAimArrowGeometry();
    this.material = createAimArrowMaterial(this.noiseAtlas, this.config);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'AimArrow_DC1_TerrainRibbon';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.group.add(this.mesh);
  }

  _normalizeMode(modeOrSpell) {
    const m = String(modeOrSpell || this.mode || 'frost_lance').toLowerCase();
    if (m === 'cinder_fall' || m === 'cinderfall' || m === 'fire' || m === 'solar' || m === '3' || m === 'meteor') {
      return 'cinder_fall';
    }
    if (m === 'shatterlance' || m === 'shatter_lance' || m === 'heavy' || m === 'charged' || m === '2') {
      return 'shatterlance';
    }
    return 'frost_lance';
  }

  _applyAimState({
    origin,
    direction,
    dirX,
    dirZ,
    yaw,
    targetPos,
    mode,
    spellType,
    spellId,
    style,
    element,
    length,
    distance,
    width,
    radius,
  } = {}) {
    if (origin) {
      const ox = origin.x ?? origin[0] ?? this.origin.x;
      const oz = origin.z ?? origin[2] ?? this.origin.z;
      const oy = this.getGroundHeight(ox, oz);
      this.origin.set(ox, oy, oz);
    } else {
      this.origin.y = this.getGroundHeight(this.origin.x, this.origin.z);
    }

    // Resolve forward direction from ANY of `direction`, `(dirX, dirZ)`, `yaw`, or `targetPos`
    let resolvedDx = null;
    let resolvedDz = null;
    if (direction && (direction.x !== undefined || direction.z !== undefined || Array.isArray(direction))) {
      const dx = Number(direction.x ?? direction[0] ?? 0);
      const dz = Number(direction.z ?? direction[2] ?? 0);
      if (Math.hypot(dx, dz) > 1e-5) {
        resolvedDx = dx;
        resolvedDz = dz;
      }
    }
    if (resolvedDx === null && Number.isFinite(dirX) && Number.isFinite(dirZ) && Math.hypot(dirX, dirZ) > 1e-5) {
      resolvedDx = Number(dirX);
      resolvedDz = Number(dirZ);
    }
    if (resolvedDx === null && Number.isFinite(yaw)) {
      resolvedDx = Math.sin(Number(yaw));
      resolvedDz = Math.cos(Number(yaw));
    }
    if (
      resolvedDx === null &&
      targetPos &&
      Number.isFinite(targetPos.x) &&
      Number.isFinite(targetPos.z)
    ) {
      const dx = Number(targetPos.x) - this.origin.x;
      const dz = Number(targetPos.z) - this.origin.z;
      if (Math.hypot(dx, dz) > 1e-5) {
        resolvedDx = dx;
        resolvedDz = dz;
      }
    }

    if (resolvedDx !== null && resolvedDz !== null) {
      const len = Math.hypot(resolvedDx, resolvedDz) || 1.0;
      this.direction.set(resolvedDx / len, 0, resolvedDz / len);
      this.yaw = Math.atan2(this.direction.x, this.direction.z);
    }
    this.side.set(-this.direction.z, 0, this.direction.x);

    const modeHint = mode ?? spellType ?? spellId ?? style ?? element;
    if (modeHint !== undefined) {
      this.mode = this._normalizeMode(modeHint);
    }

    if (Number.isFinite(width) && width > 0) {
      this.customWidth = Number(width);
    }
    if (Number.isFinite(radius) && radius > 0) {
      this.customRadius = Number(radius);
    }

    const c = this.config;
    const rawDist =
      distance !== undefined && Number.isFinite(distance)
        ? Number(distance)
        : length !== undefined && Number.isFinite(length)
          ? Number(length)
          : null;

    if (this.mode === 'cinder_fall') {
      const fallback = Number.isFinite(this.distance) ? this.distance : c.cinderFallDefaultDistance;
      this.distance = clamp(rawDist ?? fallback, c.minDistance, c.maxDistance);
      this.length = this.distance;
      this.material.uniforms.uMode.value = 1.0;
    } else if (this.mode === 'shatterlance') {
      const fallback = Number.isFinite(this.distance) ? this.distance : c.shatterlanceDefaultDistance;
      this.distance = clamp(rawDist ?? fallback, c.minDistance, c.maxDistance);
      this.length = this.distance;
      this.material.uniforms.uMode.value = 0.0;
    } else {
      // 'frost_lance' / 'ice' — supports explicit dynamic distance (0.8..18.0m) or default 14.5m
      const resolved = rawDist !== null ? clamp(rawDist, c.minDistance, c.maxDistance) : c.frostLanceLength;
      this.distance = resolved;
      this.length = resolved;
      this.material.uniforms.uMode.value = 0.0;
    }

    this.material.uniforms.uLength.value = this.length;
    this._confromRibbonToTerrain();
  }

  _confromRibbonToTerrain() {
    const c = this.config;
    const isFire = this.mode === 'cinder_fall';
    const isShatter = this.mode === 'shatterlance';
    const L = clamp(this.length, c.minDistance, c.maxDistance);
    const yBaseOffset = c.groundOffset ?? 0.016;

    const posArr = this.geometry.attributes.position.array;
    const normArr = this.geometry.attributes.normal.array;
    const coordArr = this.geometry.attributes.aRibbonCoord.array;
    const bpArr = this.geometry.attributes.aBlueprint.array;
    const vertCount = this.geometry.attributes.position.count;

    const ox = this.origin.x;
    const oz = this.origin.z;
    const originGroundY = this.getGroundHeight(ox, oz);
    const dx = this.direction.x;
    const dz = this.direction.z;
    const sx = this.side.x;
    const sz = this.side.z;

    // PUBG-Style 3D Parabolic Trajectory parameters from staff tip to ground landing point
    const startY = originGroundY + (c.staffHeightOffset ?? 1.15);
    const endGroundX = ox + dx * L;
    const endGroundZ = oz + dz * L;
    const endGroundY = this.getGroundHeight(endGroundX, endGroundZ);
    const endY = endGroundY + (c.endHeightOffset ?? 0.08);
    const arcPeak = clamp(0.32 + L * 0.135, 0.36, 2.55);

    const shaftStart = Math.min(0.38, L * 0.25);
    const headLen = Math.min(1.15, Math.max(0.28, L * 0.28));
    const headApex = L;
    const headBase = Math.max(shaftStart + 0.12, headApex - headLen);

    const evalParabolaY = (alongDist) => {
      const t = clamp((alongDist - shaftStart) / Math.max(0.15, L - shaftStart), 0.0, 1.0);
      const linY = startY + (endY - startY) * t;
      return linY + 4.0 * arcPeak * t * (1.0 - t);
    };

    const evalParabolaSlope = (alongDist) => {
      const span = Math.max(0.15, L - shaftStart);
      const t = clamp((alongDist - shaftStart) / span, 0.0, 1.0);
      return ((endY - startY) + 4.0 * arcPeak * (1.0 - 2.0 * t)) / span;
    };

    const baseRibbonHalfW = this.customWidth
      ? clamp(this.customWidth * 0.12, 0.12, 0.36)
      : isFire
        ? 0.20
        : isShatter
          ? 0.18
          : 0.21;

    const outerRingRadius = this.customRadius
      ? clamp(this.customRadius, 0.55, 3.2)
      : isFire
        ? 1.72
        : isShatter
          ? 1.38
          : 1.08;

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
      let wy = 0.0;
      let wnx = 0.0;
      let wny = 1.0;
      let wnz = 0.0;

      if (partId < 0.5) {
        // PART 0: 3D Parabolic Trajectory Arc Ribbon (from staff height down to headBase)
        const prof = SHAFT_PROFILE[colIdx] || SHAFT_PROFILE[3];
        const rIdx = Math.round(u * SHAFT_ROWS);
        const endCapScale = rIdx === 0 ? 0.0 : rIdx === 1 ? 0.72 : 1.0;
        const shaftHalfW = baseRibbonHalfW * (0.72 + 0.38 * u);

        alongM = shaftStart + u * (headBase + 0.08 - shaftStart);
        latM = latOrR * shaftHalfW;
        localH = prof.h * endCapScale;

        const wx = ox + dx * alongM + sx * latM;
        const wz = oz + dz * alongM + sz * latM;
        const groundY = this.getGroundHeight(wx, wz) + yBaseOffset;
        const arcY = evalParabolaY(alongM);
        wy = Math.max(groundY + localH, arcY + localH);

        const slope = evalParabolaSlope(alongM);
        wnx = sx * prof.nx - dx * slope * prof.ny;
        wny = prof.ny;
        wnz = sz * prof.nx - dz * slope * prof.ny;

        posArr[pOff + 0] = wx;
        posArr[pOff + 1] = wy;
        posArr[pOff + 2] = wz;
      } else if (partId < 1.5) {
        // PART 1: 3D Ballistic Plunge Chevron Spearhead into Ground Impact Ring Center
        const prof = SHAFT_PROFILE[colIdx] || SHAFT_PROFILE[3];
        const rIdx = Math.round(u * HEAD_ROWS);
        const tipEnv = 1.0 - u;
        const maxBarbHalfW = baseRibbonHalfW * 2.35;
        const halfW = Math.max(0.025, tipEnv * maxBarbHalfW);
        const barbSweepBack = Math.abs(latOrR) * Math.min(0.38, headLen * 0.42) * tipEnv;

        alongM = headBase + u * (headApex - headBase) - barbSweepBack;
        latM = latOrR * halfW;

        const endCapScale =
          rIdx === 0 || rIdx === HEAD_ROWS
            ? 0.0
            : rIdx === 1
              ? 0.88
              : 1.0 - Math.pow(u, 2.2) * 0.32;
        localH = prof.h * 1.22 * endCapScale;

        const wx = ox + dx * alongM + sx * latM;
        const wz = oz + dz * alongM + sz * latM;
        const groundY = this.getGroundHeight(wx, wz) + yBaseOffset;
        const arcY = evalParabolaY(alongM);
        wy = Math.max(groundY + localH, arcY + localH);

        const slope = evalParabolaSlope(alongM);
        wnx = sx * prof.nx - dx * slope * prof.ny;
        wny = prof.ny;
        wnz = sz * prof.nx - dz * slope * prof.ny;

        posArr[pOff + 0] = wx;
        posArr[pOff + 1] = wy;
        posArr[pOff + 2] = wz;
      } else if (partId < 2.5) {
        // PART 2: Outer 3D Cel-Shaded Ground Impact Ring (Centered at Landing Point L)
        const prof = RING_PROFILE[colIdx] || RING_PROFILE[2];
        const ang = u * TAU;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        const crownLobes = isFire ? Math.cos(ang * 8.0) : Math.cos(ang * 6.0);
        const baseRingR = outerRingRadius + 0.08 * Math.max(0.0, crownLobes);
        const ringHalfThick = isFire ? 0.16 : 0.14;
        const centerAlong = L;

        const rActual = baseRingR + latOrR * ringHalfThick;
        alongM = centerAlong + cosA * rActual;
        latM = sinA * rActual;
        localH = prof.h * (1.05 + 0.20 * Math.max(0.0, crownLobes));

        const wx = ox + dx * alongM + sx * latM;
        const wz = oz + dz * alongM + sz * latM;
        wy = this.getGroundHeight(wx, wz) + yBaseOffset + localH;

        const radDirX = dx * cosA + sx * sinA;
        const radDirZ = dz * cosA + sz * sinA;
        wnx = radDirX * prof.nr;
        wny = prof.ny;
        wnz = radDirZ * prof.nr;

        posArr[pOff + 0] = wx;
        posArr[pOff + 1] = wy;
        posArr[pOff + 2] = wz;
      } else {
        // PART 3: Inner 3D Beveled Bullseye Ring (Centered at Landing Point L)
        const prof = RING_PROFILE[colIdx] || RING_PROFILE[2];
        const ang = u * TAU;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        const baseRingR = outerRingRadius * 0.46;
        const ringHalfThick = isFire ? 0.12 : 0.10;
        const centerAlong = L;

        const rActual = baseRingR + latOrR * ringHalfThick;
        alongM = centerAlong + cosA * rActual;
        latM = sinA * rActual;
        localH = prof.h * 0.92;

        const wx = ox + dx * alongM + sx * latM;
        const wz = oz + dz * alongM + sz * latM;
        wy = this.getGroundHeight(wx, wz) + yBaseOffset + localH;

        const radDirX = dx * cosA + sx * sinA;
        const radDirZ = dz * cosA + sz * sinA;
        wnx = radDirX * prof.nr;
        wny = prof.ny;
        wnz = radDirZ * prof.nr;

        posArr[pOff + 0] = wx;
        posArr[pOff + 1] = wy;
        posArr[pOff + 2] = wz;
      }

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
    this._applyAimState(options);
    this.active = true;
    this.group.visible = true;
    return this;
  }

  setAim(options = {}) {
    return this.show(options);
  }

  updateAim(options = {}) {
    return this.update(0.016, options);
  }

  update(dt = 0.016, options = null) {
    if (options && typeof options === 'object') {
      this._applyAimState(options);
      this.active = true;
      this.group.visible = true;
    }
    if (!this.active || !this.group.visible) return this;
    if (Number.isFinite(dt)) {
      this.age += dt;
      this.material.uniforms.uTime.value = this.age;
    }
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
