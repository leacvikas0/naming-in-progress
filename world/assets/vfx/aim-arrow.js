// ============================================================================
// world/assets/vfx/aim-arrow.js
//
// Functional, Simple, Elegant 3D Ballistic Trajectory Arc & Elevated Precision Reticle
//
// Visual & Engineering Contract:
// - Clean, sleek 3D parabolic trajectory ribbon (`0.18m-0.24m` width, `0.10m`
//   vertical thickness) curving smoothly from the Mage's raised staff crystal
//   (`originGroundY + 1.45m`) through a clear ballistic peak
//   (`arcPeak = clamp(1.15 + L * 0.18, 1.35, 3.85)`) down into the elevated
//   center bullseye (`endGroundY + 0.42m`).
// - Elevated 3D Target Impact Ring (`PART 2`) & Center Bullseye Beacon (`PART 3`)
//   with a clean vertical cylinder wall (`endGroundY + 0.05m` up to `+0.56m`)
//   so the landing circle and bullseye sit unmistakably above the `40cm-70cm`
//   3D meadow grass at every distance (`0.8m` to `18.0m`).
// - Functional, modern, high-contrast warm ivory-champagne palette (`#fffaf0`
//   core with subtle silver-frost `#e2e8f0` edge for Ice, `#fff7ed` core with
//   warm amber `#fdba74` edge for Fire) — zero overly-Ghibli cartoon blue slop
//   or heavy black cartoon ink borders.
// - Single indexed `BufferGeometry` (`1` draw call active, `0` hidden,
//   `transparent: false, depthTest: true, depthWrite: true, renderOrder: 6`).
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const AIM_ARROW_DEFAULTS = Object.freeze({
  gridCols: 6,
  gridRows: 36,
  groundOffset: 0.02,
  staffHeightOffset: 1.45,
  endHeightOffset: 0.42,
  frostLanceLength: 14.5,
  cinderFallDefaultDistance: 11.5,
  shatterlanceDefaultDistance: 7.5,
  minDistance: 0.8,
  maxDistance: 18.0,
  frostHalfSpan: 1.45,
  cinderHalfSpan: 2.05,

  // Mode 'frost_lance' / 'shatterlance' ('ice') — Clean Luminous Ivory-Champagne & Subtle Frost Silver
  colorIceCore: '#fffaf0',
  colorIceMid: '#f1f5f9',
  colorIceWall: '#cbd5e1',
  colorIceInk: '#64748b',

  // Mode 'cinder_fall' ('fire') — Clean Warm Ivory & Subtle Solar Amber
  colorFireCore: '#fff7ed',
  colorFireAmber: '#fdba74',
  colorFireCrimson: '#f97316',
  colorFireInk: '#9a3412',
});

// Sleek 7-point 3D cross-section for the Parabolic Trajectory Arc (Part 0) & Pointer Tip (Part 1)
// latFrac in [-1, 1], heightM in meters (0.10m vertical thickness), normal (nx, ny)
const SHAFT_PROFILE = [
  { lat: -1.00, h: 0.000, nx: -0.92, ny: 0.39, ridge: 0.00 }, // 0: left lower edge
  { lat: -0.78, h: 0.072, nx: -0.34, ny: 0.94, ridge: 0.55 }, // 1: left beveled top shoulder
  { lat: -0.32, h: 0.088, nx: -0.10, ny: 0.99, ridge: 0.82 }, // 2: left inner crown flat
  { lat:  0.00, h: 0.100, nx:  0.00, ny: 1.00, ridge: 1.00 }, // 3: sleek central trajectory spine (+0.10m)
  { lat:  0.32, h: 0.088, nx:  0.10, ny: 0.99, ridge: 0.82 }, // 4: right inner crown flat
  { lat:  0.78, h: 0.072, nx:  0.34, ny: 0.94, ridge: 0.55 }, // 5: right beveled top shoulder
  { lat:  1.00, h: 0.000, nx:  0.92, ny: 0.39, ridge: 0.00 }, // 6: right lower edge
];

// Elevated 5-point 3D cross-section for Target Impact Ring (Part 2) & Center Bullseye Beacon (Part 3)
// Vertical cylinder wall from +0.05m up to +0.55m so it sits cleanly above 40cm-70cm meadow grass!
const RING_PROFILE = [
  { rOff: -1.00, h: 0.050, nr: -0.95, ny: 0.31, ridge: 0.08 }, // 0: inner cylinder base skirt (+0.05m)
  { rOff: -0.72, h: 0.495, nr: -0.28, ny: 0.96, ridge: 0.78 }, // 1: inner elevated rim shoulder (+0.495m)
  { rOff:  0.00, h: 0.550, nr:  0.00, ny: 1.00, ridge: 1.00 }, // 2: flat-top precision reticle crown (+0.55m)
  { rOff:  0.72, h: 0.495, nr:  0.28, ny: 0.96, ridge: 0.78 }, // 3: outer elevated rim shoulder (+0.495m)
  { rOff:  1.00, h: 0.050, nr:  0.95, ny: 0.31, ridge: 0.08 }, // 4: outer cylinder base skirt (+0.05m)
];

const SHAFT_ROWS = 32;
const HEAD_ROWS = 12;
const OUTER_RING_SEGS = 48;
const INNER_RING_SEGS = 32;

/**
 * Builds the 4-part 3D geometry for the Parabolic Trajectory Arc and Elevated
 * Ground Reticle (1 single indexed BufferGeometry, 1 draw call active, 0 hidden).
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
  // PART 0: Sleek 3D Parabolic Trajectory Arc Ribbon (SHAFT_ROWS = 32, 7 cols)
  // ---------------------------------------------------------------------------
  const shaftCols = SHAFT_PROFILE.length; // 7
  const shaftStartV = positions.length / 3;
  for (let r = 0; r <= SHAFT_ROWS; r++) {
    const u = r / SHAFT_ROWS;
    const endCapScale = r === 0 ? 0.0 : r === 1 ? 0.78 : 1.0;
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
  // PART 1: Clean Tapered Terminal Pointer into Bullseye Center (HEAD_ROWS = 12, 7 cols)
  // ---------------------------------------------------------------------------
  const headStartV = positions.length / 3;
  for (let r = 0; r <= HEAD_ROWS; r++) {
    const u = r / HEAD_ROWS;
    const endCapScale = r === HEAD_ROWS ? 0.0 : 1.0 - Math.pow(u, 1.8) * 0.35;
    for (let c = 0; c < shaftCols; c++) {
      const p = SHAFT_PROFILE[c];
      const v01 = c / (shaftCols - 1);
      const headH = p.h * endCapScale;
      pushVert(u, v01, 1, c, p.lat, headH, p.nx, p.ny, 0.0, p.ridge);
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
  // PART 2: Elevated Precision Outer Target Ring (48 segs x 5 cols)
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
  // PART 3: Elevated Center Bullseye Beacon Ring (32 segs x 5 cols)
  // ---------------------------------------------------------------------------
  const innerRingStartV = positions.length / 3;
  for (let s = 0; s <= INNER_RING_SEGS; s++) {
    const u = s / INNER_RING_SEGS;
    for (let c = 0; c < ringCols; c++) {
      const p = RING_PROFILE[c];
      const v01 = c / (ringCols - 1);
      pushVert(u, v01, 3, c, p.rOff, p.h * 1.04, p.nr, p.ny, 0.0, p.ridge);
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
        float hM = vCoord.z;
        float ridgeMetric = clamp(vCoord.w, 0.0, 1.0);
        float partId = vBlueprint.x;
        float uParam = vBlueprint.y;
        float profileEdge = abs(vBlueprint.w);
        float isFire = step(0.5, uMode);

        vec3 N = normalize(vWorldNormal);
        float topFacing = clamp(abs(N.y), 0.0, 1.0);

        // Clean forward-flowing chevron segments along the trajectory arc
        // and crisp 4-cardinal precision tick accents on the target ring
        float isArcOrHead = step(partId, 1.5);
        float chevronPhase = fract(uParam * 8.0 - profileEdge * 0.35 - uTime * 1.85);
        float chevronBand = smoothstep(0.18, 0.28, chevronPhase) * (1.0 - smoothstep(0.68, 0.78, chevronPhase));
        float cardinalTicks = (1.0 - isArcOrHead) * smoothstep(0.72, 0.92, abs(cos(uParam * 12.56637)));

        float crownMask = smoothstep(0.45, 0.82, ridgeMetric);
        float sideTrim = smoothstep(0.76, 0.96, profileEdge) * (1.0 - topFacing * 0.5);
        float lowerSkirt = (1.0 - isArcOrHead) * (1.0 - smoothstep(0.18, 0.44, hM));

        vec3 col;
        if (isFire < 0.5) {
          // Clean Luminous Warm Ivory-Champagne (#fffaf0) + Subtle Frost-Silver Edge (#e2e8f0 / #cbd5e1)
          vec3 edgeCol = mix(uIceWall, uIceMid, crownMask);
          vec3 brightCore = uIceCore * 1.12;
          float coreBlend = clamp(crownMask * 0.76 + chevronBand * isArcOrHead * 0.38 + cardinalTicks * 0.35, 0.0, 1.0);
          col = mix(edgeCol, brightCore, coreBlend);
          col = mix(col, uIceInk, max(sideTrim * 0.45, lowerSkirt * 0.55));
        } else {
          // Clean Luminous Warm Ivory (#fff7ed) + Subtle Solar Amber Edge (#fdba74 / #f97316)
          vec3 edgeCol = mix(uFireCrimson, uFireAmber, crownMask);
          vec3 brightCore = uFireCore * 1.14;
          float coreBlend = clamp(crownMask * 0.74 + chevronBand * isArcOrHead * 0.40 + cardinalTicks * 0.35, 0.0, 1.0);
          col = mix(edgeCol, brightCore, coreBlend);
          col = mix(col, uFireInk, max(sideTrim * 0.45, lowerSkirt * 0.55));
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
    this.mesh.renderOrder = 6;
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
    const yBaseOffset = c.groundOffset ?? 0.02;

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

    // Clean 3D Parabolic Trajectory from raised staff crystal (+1.45m) to elevated bullseye (+0.42m)
    const startY = originGroundY + (c.staffHeightOffset ?? 1.45);
    const endGroundX = ox + dx * L;
    const endGroundZ = oz + dz * L;
    const endGroundY = this.getGroundHeight(endGroundX, endGroundZ);
    const endY = endGroundY + (c.endHeightOffset ?? 0.42);
    const arcPeak = clamp(1.15 + L * 0.18, 1.35, 3.85);

    const shaftStart = Math.min(0.42, L * 0.22);
    const headLen = Math.min(0.72, Math.max(0.22, L * 0.18));
    const headApex = L;
    const headBase = Math.max(shaftStart + 0.10, headApex - headLen);

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

    // Sleek 0.18m-0.24m full ribbon width (half-width 0.09m-0.12m)
    const baseRibbonHalfW = this.customWidth
      ? clamp(this.customWidth * 0.08, 0.08, 0.14)
      : isFire
        ? 0.115
        : isShatter
          ? 0.095
          : 0.105;

    const outerRingRadius = this.customRadius
      ? clamp(this.customRadius, 0.55, 3.2)
      : isFire
        ? 1.55
        : isShatter
          ? 1.25
          : 1.05;

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
        // PART 0: Sleek 3D Parabolic Trajectory Arc Ribbon (from staff crystal to headBase)
        const prof = SHAFT_PROFILE[colIdx] || SHAFT_PROFILE[3];
        const rIdx = Math.round(u * SHAFT_ROWS);
        const endCapScale = rIdx === 0 ? 0.0 : rIdx === 1 ? 0.78 : 1.0;
        const shaftHalfW = baseRibbonHalfW * (0.82 + 0.22 * Math.sin(u * Math.PI));

        alongM = shaftStart + u * (headBase - shaftStart);
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
        // PART 1: Clean Tapered Terminal Pointer into Center Bullseye (no cartoon surfboard barbs!)
        const prof = SHAFT_PROFILE[colIdx] || SHAFT_PROFILE[3];
        const rIdx = Math.round(u * HEAD_ROWS);
        const taper = 1.0 - Math.pow(u, 1.35) * 0.78;
        const halfW = Math.max(0.02, baseRibbonHalfW * 1.04 * taper);

        alongM = headBase + u * (headApex - headBase);
        latM = latOrR * halfW;

        const endCapScale = rIdx === HEAD_ROWS ? 0.0 : 1.0 - Math.pow(u, 1.8) * 0.35;
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
      } else if (partId < 2.5) {
        // PART 2: Elevated Precision Outer Target Ring (+0.55m top crown above 70cm meadow grass)
        const prof = RING_PROFILE[colIdx] || RING_PROFILE[2];
        const ang = u * TAU;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        const baseRingR = outerRingRadius;
        const ringHalfThick = isFire ? 0.105 : 0.095;
        const centerAlong = L;

        const rActual = baseRingR + latOrR * ringHalfThick;
        alongM = centerAlong + cosA * rActual;
        latM = sinA * rActual;
        localH = prof.h;

        const wx = ox + dx * alongM + sx * latM;
        const wz = oz + dz * alongM + sz * latM;
        const sampleGroundY = Math.max(endGroundY, this.getGroundHeight(wx, wz));
        wy = sampleGroundY + localH;

        const radDirX = dx * cosA + sx * sinA;
        const radDirZ = dz * cosA + sz * sinA;
        wnx = radDirX * prof.nr;
        wny = prof.ny;
        wnz = radDirZ * prof.nr;

        posArr[pOff + 0] = wx;
        posArr[pOff + 1] = wy;
        posArr[pOff + 2] = wz;
      } else {
        // PART 3: Elevated Center Bullseye Beacon Ring (+0.57m top crown at Landing Center L)
        const prof = RING_PROFILE[colIdx] || RING_PROFILE[2];
        const ang = u * TAU;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);

        const baseRingR = outerRingRadius * 0.32;
        const ringHalfThick = 0.075;
        const centerAlong = L;

        const rActual = baseRingR + latOrR * ringHalfThick;
        alongM = centerAlong + cosA * rActual;
        latM = sinA * rActual;
        localH = prof.h * 1.04;

        const wx = ox + dx * alongM + sx * latM;
        const wz = oz + dz * alongM + sz * latM;
        const sampleGroundY = Math.max(endGroundY, this.getGroundHeight(wx, wz));
        wy = sampleGroundY + localH;

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
