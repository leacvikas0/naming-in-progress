// ============================================================================
// world/assets/vfx/shatterlance.js
//
// Stage 4 Pass 2: Opaque Subsurface-Lit "Shatterlance" Railgun Spear VFX System
//
// Visual & Engineering Contract:
// - Strictly <= 4 InstancedMeshes when active, 0 draw calls when idle (`group.visible = false`):
//     1. `intakeShardsMesh` (1 InstancedMesh): 32 chiseled 3D glacier crystal shards
//        & aerodynamic frost-intake splinters (`transparent: false`):
//          - Act 1 (0.00..0.40s): 3 harmonic waves of frost shards nucleating from
//            cold ground rime below/around the focus axis, rising along curved
//            ascending trajectories and snap-locking into the nascent spear-seed core.
//          - Act 2 (0.36..0.95s): Atmospheric vacuum air-draw — 3D helical intake
//            streams of frost splinters & outer crystals pulled radially + axially
//            from a wide perimeter into the 7 spiral flutes as angular velocity
//            ramps up and the Great-Lance physically elongates forward.
//          - Act 3 (0.95s+): Outer intake shards finish absorbing into the completed
//            lance so the razor-poised 4.1m Great-Lance spins cleanly on-axis with
//            only subtle recessed flute-core micro-glints ("then it just spins").
//     2. `greatLanceMesh` (1 InstancedMesh): 4.1m 7-fluted railgun great-lance
//        with sculpted glacial facets, coalescence weld-flash seams, helical flute
//        luminescence, and slim coaxial breech stabilizer ring (`transparent: false`).
//     3. `shatterWedgesMesh` (1 InstancedMesh): Fan-shaped directional railgun
//        shatter-crown spires + ballistic downrange 3D crystal splinters
//        (`fragInherit = 0.45`, gravity `-19 m/s^2`, `transparent: false`).
//     4. `groundDecalMesh` (1 InstancedMesh): World-space 3D height-field
//        snow-rime nucleation sigil, railgun slipstream corridor & 8-pointed
//        star-fissure impact frost sheet (`transparent: false` with hard grain-eroded
//        `discard` < 0.45).
// - Unified with Locked `V1` Glacial Subsurface Optics: `transparent: false,
//   depthWrite: true, side: THREE.FrontSide`, horizontal-azimuth optical
//   thickness (`dot(horizN, horizV)`), permanent subsurface inner light
//   (`uColorCore`), internal fracture planes & feather-frost veins.
// - Zero raw sRGB vec3 literals in GLSL; all palette colors passed via `THREE.Color`.
// - Zero per-frame heap allocations during `updateChargeHold`, `update`, or `seek`.
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

/**
 * Analytical C1-continuous phase integral of the 3-Act turbine spin velocity:
 * - Act 1 (0.00..0.42s): Deliberate, heavy magnetic facet-alignment drift (omega1 = 1.15 rad/s)
 * - Act 2 (0.42..0.98s): Smooth S-curve cryo-vortex acceleration (1.15 -> 16.5 rad/s)
 * - Act 3 (0.98s+): Dead-steady lethal equilibrium spin (omegaMax = 16.5 rad/s)
 */
const SPIN_ACT1_END = 0.48;
const SPIN_ACT2_END = 1.04;
const SPIN_OMEGA_1 = 1.25;
const SPIN_OMEGA_MAX = 16.5;

function evaluateIntegratedSpinPhase(t) {
  if (t <= 0) return 0;
  if (t <= SPIN_ACT1_END) {
    return SPIN_OMEGA_1 * t;
  }
  const dur2 = SPIN_ACT2_END - SPIN_ACT1_END;
  if (t <= SPIN_ACT2_END) {
    const u = (t - SPIN_ACT1_END) / dur2;
    const accelIntegral = dur2 * (u * u * u - 0.5 * u * u * u * u);
    return SPIN_OMEGA_1 * t + (SPIN_OMEGA_MAX - SPIN_OMEGA_1) * accelIntegral;
  }
  const phaseAtAct2End =
    SPIN_OMEGA_1 * SPIN_ACT2_END + (SPIN_OMEGA_MAX - SPIN_OMEGA_1) * dur2 * 0.5;
  return phaseAtAct2End + SPIN_OMEGA_MAX * (t - SPIN_ACT2_END);
}

function evaluateInstantaneousOmega(t) {
  if (t <= SPIN_ACT1_END) return SPIN_OMEGA_1;
  if (t >= SPIN_ACT2_END) return SPIN_OMEGA_MAX;
  const s = smoothstep(SPIN_ACT1_END, SPIN_ACT2_END, t);
  return lerp(SPIN_OMEGA_1, SPIN_OMEGA_MAX, s);
}

export const SHATTERLANCE_DEFAULTS = Object.freeze({
  range: 14.3, // default arena target distance
  speed: 58.0, // railgun flight speed, m/s
  assembly: 0.65, // standalone cast Beat 1: spiraling shard convergence & lance assembly
  lifetime: 0.55, // Beat 3: impact hold duration
  fadeTime: 1.45, // Beat 4: ballistic wedge & frost-plate fade

  // 3-Act Hold-to-Charge Choreography Timing (seconds)
  act1AscendDuration: 0.50, // Act 1: 3-wave chiseled shard assembly & crystal lock
  act2GrowthEnd: 1.04, // Act 2: tight cryo-vacuum air-draw spin-up & razor elongation

  // Hero-proportioned Razor Glacial Spear dimensions (sleek, dimensional 3D cut-diamond ice lance)
  lanceLength: 1.78,
  lanceRadius: 0.145,
  lanceHeight: 1.25,
  hoverForward: 1.18,
  facets: 6,
  swell: 0.24,
  tailWidth: 0.18,
  tipCurve: 1.05,
  fluteDepth: 0.32,
  fluteTwist: 0.0,

  // Intake shard & tight cryo-vacuum air-draw vortex
  intakeCount: 32,
  intakeSphere: 0.65,
  intakeSpread: 0.55,
  intakeStagger: 0.48,
  intakeEase: 2.4,
  intakeSize: 0.20,

  // Impact break & ballistic shatter wedges (preserved intact!)
  fragmentCount: 52,
  fragInherit: 0.45,
  fragSpeed: 8.6,
  fragGravity: -19.0,
  fragDrag: 0.72,
  fragSize: 0.42,
  sheetRadius: 5.6,

  // High-Contrast Abyssal-to-Diamond Sub-Zero Glacial Palette (passed via THREE.Color)
  colorCore: '#1e64a8',
  colorDeep: '#0b2b59',
  colorMid: '#246eb0',
  colorIce: '#6ed4ff',
  colorRim: '#f4feff',
  colorSeam: '#c8f6ff',
  colorInk: '#051329',
  colorSheetBase: '#78bae3',
  colorSheetDeep: '#447ea8',
  colorSheetEdge: '#f4fcff',
});

/* ------------------------------------------------------------------------- */
/* 1. Hard-Faceted Chiseled Polyhedral Glacial Spear + Swept Crystal Barbs   */
/*    Non-indexed flat-faceted triangles (ZERO twist, ZERO rounded carrot!)  */
/* ------------------------------------------------------------------------- */

export function createFlutedGreatLanceGeometry() {
  // Unit length along local +Z from rear pommel tip (-0.30) to needle point (+0.70), total = 1.0.
  // Cross-section is a sharp 6-sided chiseled diamond blade (flattened aspect + alternating ridge/bevel)
  // with 4 swept-forward asymmetric glacial crystal barbs around the crossguard.
  const positions = [];
  const facetUvs = []; // x: ridgeEdge (0..1), y: axial u (0..1), z: facetPlaneId (0..1)

  const pushTriCCW = (pA, pB, pC, uvA, uvB, uvC) => {
    positions.push(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], pC[0], pC[1], pC[2]);
    facetUvs.push(uvA[0], uvA[1], uvA[2], uvB[0], uvB[1], uvB[2], uvC[0], uvC[1], uvC[2]);
  };

  // 6 angular stations around the 3D diamond-hexagonal blade perimeter:
  // Full 3D polyhedral thickness so the spinning spear reads with strong 3D volume from every camera angle!
  const ANGLES = [
    0.0,
    Math.PI * 0.3333,
    Math.PI * 0.6667,
    Math.PI,
    Math.PI * 1.3333,
    Math.PI * 1.6667,
  ];
  const RAD_MULT = [1.08, 0.90, 0.90, 1.08, 0.90, 0.90];
  const IS_RIDGE = [1.0, 0.35, 1.0, 0.35, 1.0, 0.35];
  const cols = ANGLES.length;

  // Hard-stepped chiseled axial stations [z, radiusScale, axialU]
  // At lanceRadius=0.145m, main shaft (0.54) is a crisp ~15.6cm chiseled 3D diamond blade,
  // while the 4 swept crystal guard barbs flare to 1.12 (~32cm guard span) and taper to a razor needle tip!
  const RINGS = [
    [-0.22, 0.42, 0.08], // rear pommel jewel shoulder
    [-0.11, 0.30, 0.19], // recessed crystal haft neck
    [-0.01, 0.76, 0.29], // angular crossguard flare
    [0.06, 0.56, 0.36],  // forward guard step-down into blade
    [0.26, 0.48, 0.56],  // mid-blade chiseled diamond shaft
    [0.48, 0.30, 0.78],  // forward needle taper shoulder
    [0.61, 0.13, 0.91],  // sub-tip razor bevel
  ];

  const ringPts = RINGS.map(([z, rScale, u]) => {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const ang = ANGLES[c];
      const rx = Math.cos(ang) * rScale * RAD_MULT[c];
      const ry = Math.sin(ang) * rScale * RAD_MULT[c];
      row.push({
        pos: [rx, ry, z],
        ridge: IS_RIDGE[c],
        u,
        facetId: c / cols,
      });
    }
    return row;
  });

  const tailTip = [0, 0, -0.30];
  const noseTip = [0, 0, 0.70];

  // Build flat-faceted main diamond blade segments
  for (let r = 0; r < ringPts.length - 1; r++) {
    const row0 = ringPts[r];
    const row1 = ringPts[r + 1];
    for (let c = 0; c < cols; c++) {
      const cNext = (c + 1) % cols;
      const a = row0[c];
      const b = row0[cNext];
      const d = row1[c];
      const e = row1[cNext];
      const fId = ((c + (r % 2) * 0.5) % cols) / cols;

      pushTriCCW(
        a.pos,
        b.pos,
        e.pos,
        [a.ridge, a.u, fId],
        [b.ridge, b.u, fId],
        [e.ridge, e.u, fId]
      );
      pushTriCCW(
        a.pos,
        e.pos,
        d.pos,
        [a.ridge, a.u, fId],
        [e.ridge, e.u, fId],
        [d.ridge, d.u, fId]
      );
    }
  }

  // Rear pommel pyramid & forward lethal needle point
  const firstRow = ringPts[0];
  const lastRow = ringPts[ringPts.length - 1];
  for (let c = 0; c < cols; c++) {
    const cNext = (c + 1) % cols;
    const f0 = firstRow[c];
    const f1 = firstRow[cNext];
    const fId = c / cols;
    pushTriCCW(
      tailTip,
      f1.pos,
      f0.pos,
      [1.0, 0.0, fId],
      [f1.ridge, f1.u, fId],
      [f0.ridge, f0.u, fId]
    );

    const l0 = lastRow[c];
    const l1 = lastRow[cNext];
    pushTriCCW(
      l0.pos,
      l1.pos,
      noseTip,
      [l0.ridge, l0.u, fId],
      [l1.ridge, l1.u, fId],
      [1.0, 1.0, fId]
    );
  }

  // Add 4 Swept-Forward Asymmetric Chiseled Glacial Barbs around the crossguard
  // Each barb is a hard-edged 4-sided 3D crystal spur jutting forward & outward.
  const BARB_SPECS = [
    { ang: 0.45, zRear: -0.10, zFront: 0.08, zTip: 0.24, rBase: 0.44, rTip: 1.12, spread: 0.34, fId: 0.15 },
    { ang: Math.PI - 0.45, zRear: -0.10, zFront: 0.08, zTip: 0.24, rBase: 0.44, rTip: 1.12, spread: 0.34, fId: 0.40 },
    { ang: Math.PI + 0.45, zRear: -0.08, zFront: 0.10, zTip: 0.26, rBase: 0.42, rTip: 1.06, spread: 0.32, fId: 0.65 },
    { ang: TAU - 0.45, zRear: -0.08, zFront: 0.10, zTip: 0.26, rBase: 0.42, rTip: 1.06, spread: 0.32, fId: 0.90 },
  ];

  for (let b = 0; b < BARB_SPECS.length; b++) {
    const sp = BARB_SPECS[b];
    const ca = Math.cos(sp.ang);
    const sa = Math.sin(sp.ang);
    const caL = Math.cos(sp.ang + sp.spread);
    const saL = Math.sin(sp.ang + sp.spread);
    const caR = Math.cos(sp.ang - sp.spread);
    const saR = Math.sin(sp.ang - sp.spread);

    const pRear = [ca * sp.rBase, sa * sp.rBase, sp.zRear];
    const pFront = [ca * (sp.rBase * 1.05), sa * (sp.rBase * 1.05), sp.zFront];
    const pLeft = [caL * (sp.rBase * 0.95), saL * (sp.rBase * 0.95), (sp.zRear + sp.zFront) * 0.5];
    const pRight = [caR * (sp.rBase * 0.95), saR * (sp.rBase * 0.95), (sp.zRear + sp.zFront) * 0.5];
    const pTip = [ca * sp.rTip, sa * sp.rTip, sp.zTip];

    const uBase = 0.24;
    const uTip = 0.52;
    // 4 flat tetrahedral crystal faces per barb (CCW outward winding)
    pushTriCCW(pRear, pRight, pTip, [0.8, uBase, sp.fId], [0.3, uBase, sp.fId], [1.0, uTip, sp.fId]);
    pushTriCCW(pRight, pFront, pTip, [0.3, uBase, sp.fId + 0.08], [0.8, uBase, sp.fId + 0.08], [1.0, uTip, sp.fId + 0.08]);
    pushTriCCW(pFront, pLeft, pTip, [0.8, uBase, sp.fId + 0.16], [0.3, uBase, sp.fId + 0.16], [1.0, uTip, sp.fId + 0.16]);
    pushTriCCW(pLeft, pRear, pTip, [0.3, uBase, sp.fId + 0.24], [0.8, uBase, sp.fId + 0.24], [1.0, uTip, sp.fId + 0.24]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFacetUv', new THREE.Float32BufferAttribute(facetUvs, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Razor-sharp, flat-faceted 6-sided asymmetric bipyramidal diamond ice shard geometry
 * for `intakeShardsMesh` (Act 1 converging crystal daggers & Act 2 frost needles).
 * Aligned along local +Y from sharp tail (-0.42) through chiseled diamond shoulder (0.0..0.18)
 * to lethal needle point (+0.78), with zero blunt cylinder ends!
 */
export function createRazorDiamondShardGeometry() {
  const positions = [];
  const facetUvs = [];

  const pushTriCCW = (pA, pB, pC, uvA, uvB, uvC) => {
    positions.push(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], pC[0], pC[1], pC[2]);
    facetUvs.push(uvA[0], uvA[1], uvA[2], uvB[0], uvB[1], uvB[2], uvC[0], uvC[1], uvC[2]);
  };

  const ANGLES = [
    0.0,
    Math.PI * 0.3333,
    Math.PI * 0.6667,
    Math.PI,
    Math.PI * 1.3333,
    Math.PI * 1.6667,
  ];
  const RAD_MULT = [1.18, 0.78, 0.78, 1.18, 0.78, 0.78];
  const IS_RIDGE = [1.0, 0.35, 1.0, 0.35, 1.0, 0.35];
  const cols = ANGLES.length;

  // Axial stations along local +Y [y, rScale, u]
  const RINGS = [
    [-0.18, 0.24, 0.20],
    [-0.02, 0.48, 0.36],
    [0.16, 0.38, 0.52],
    [0.44, 0.18, 0.76],
  ];

  const ringPts = RINGS.map(([y, rScale, u]) => {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const ang = ANGLES[c];
      const rx = Math.cos(ang) * rScale * RAD_MULT[c];
      const rz = Math.sin(ang) * rScale * RAD_MULT[c];
      row.push({
        pos: [rx, y, rz],
        ridge: IS_RIDGE[c],
        u,
        facetId: c / cols,
      });
    }
    return row;
  });

  const tailTip = [0, -0.42, 0];
  const noseTip = [0, 0.78, 0];

  for (let r = 0; r < ringPts.length - 1; r++) {
    const row0 = ringPts[r];
    const row1 = ringPts[r + 1];
    for (let c = 0; c < cols; c++) {
      const cNext = (c + 1) % cols;
      const a = row0[c];
      const b = row0[cNext];
      const d = row1[c];
      const e = row1[cNext];
      const fId = ((c + (r % 2) * 0.5) % cols) / cols;

      // Note: around +Y axis, outward CCW order is (a, e, b) and (a, d, e)
      pushTriCCW(
        a.pos,
        e.pos,
        b.pos,
        [a.ridge, a.u, fId],
        [e.ridge, e.u, fId],
        [b.ridge, b.u, fId]
      );
      pushTriCCW(
        a.pos,
        d.pos,
        e.pos,
        [a.ridge, a.u, fId],
        [d.ridge, d.u, fId],
        [e.ridge, e.u, fId]
      );
    }
  }

  const firstRow = ringPts[0];
  const lastRow = ringPts[ringPts.length - 1];
  for (let c = 0; c < cols; c++) {
    const cNext = (c + 1) % cols;
    const f0 = firstRow[c];
    const f1 = firstRow[cNext];
    const fId = c / cols;
    pushTriCCW(
      tailTip,
      f0.pos,
      f1.pos,
      [1.0, 0.0, fId],
      [f0.ridge, f0.u, fId],
      [f1.ridge, f1.u, fId]
    );

    const l0 = lastRow[c];
    const l1 = lastRow[cNext];
    pushTriCCW(
      l0.pos,
      noseTip,
      l1.pos,
      [l0.ridge, l0.u, fId],
      [1.0, 1.0, fId],
      [l1.ridge, l1.u, fId]
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
      uCoalescencePulse: sharedUniforms.uCoalescencePulse,
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
      attribute vec4 aInstanceMeta; // x: seed, y: glowBoost, z: role (0=grounded/lance, 1=airborne/collar, 2=air-splinter), w: dissolveOrFlash

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
      uniform float uCoalescencePulse;
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
        float role = vMeta.z;
        float isAirSplinter = step(1.5, role);
        float isAirborneOrCollar = clamp(role, 0.0, 1.0);
        float rawW = vMeta.w;
        float dissolveProgress = clamp(rawW, 0.0, 1.0) * (1.0 - uIsGreatLance);
        float shardLockFlash = clamp(-rawW, 0.0, 1.0);

        // 1. Outward per-triangle normal + horizontal-azimuth optical thickness
        vec3 dN = cross(dFdx(vWorldPos), dFdy(vWorldPos));
        vec3 N = length(dN) > 1e-8 ? normalize(dN) : normalize(vWorldNormal);
        if (dot(N, vWorldNormal) < 0.0) N = -N;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 horizN = normalize(vec3(N.x, 0.0, N.z) + vec3(1e-5, 0.0, 0.0));
        vec3 horizV = normalize(vec3(V.x, 0.0, V.z) + vec3(1e-5, 0.0, 0.0));
        float ndv = clamp(mix(dot(horizN, horizV), abs(dot(N, V)), uIsGreatLance * 0.52), 0.0, 1.0);

        // 2. Optical Thickness & Fresnel
        float thickness = clamp(pow(ndv, 0.82) * 1.08, 0.0, 1.0);
        float rimAmount = pow(1.0 - ndv, 2.35);

        // 3. World-Space Internal Fracture Planes (cracks) & Local Milky Feather-Frost (veins)
        vec3 fp = vWorldPos * 0.42 + seed * 0.73;
        float r0 = texture2D(uNoiseAtlas, fp.xz + vec2(fp.y * 0.57, 0.19)).r;
        float r1 = texture2D(uNoiseAtlas, fp.xy * 1.65 + vec2(0.41, fp.z * 0.63)).r;
        float cracks = smoothstep(0.54, 0.94, 0.58 * r0 + 0.42 * r1);

        vec3 vp = vLocalPos * 0.95 + seed * 0.31;
        float v0 = texture2D(uNoiseAtlas, vp.xy + vec2(vp.z * 0.47, 0.23)).b;
        float v1 = texture2D(uNoiseAtlas, vp.yz * 1.90 + vec2(0.67, vp.x * 0.53)).b;
        float veins = smoothstep(0.44, 0.90, 0.55 * v0 + 0.45 * v1);

        // 4. Voronoi Fracture Sublimation (keeps 100% physical spire scale while sublimating in place!)
        float hLocal = clamp(vLocalPos.y, 0.0, 1.0);
        float sublimateNoise = (0.58 * r0 + 0.42 * v0) * 0.72 + (1.0 - hLocal) * 0.28;
        if (sublimateNoise < dissolveProgress) discard;

        // Deep glacial sapphire-cerulean core gradation
        vec3 deepSapphire = mix(uColorMid, uColorDeep, smoothstep(0.22, 0.86, thickness));
        vec3 body = mix(uColorIce, deepSapphire, thickness);
        body = mix(body, uColorRim, veins * 0.32);
        body = mix(body, uColorRim, cracks * 0.28);

        // Aerodynamic frost-intake splinters have a luminous cerulean-cyan core with frost-white tips
        float tipFrost = smoothstep(0.45, 0.95, hLocal);
        body = mix(body, mix(uColorIce, uColorRim, tipFrost * 0.75), isAirSplinter * 0.48);

        // 5. Basal Snow-Rime on Ground-Rooted Impact Spires
        float rimeFbm = texture2D(uNoiseAtlas, vLocalPos.xy * 1.35 + vec2(seed * 0.29, vLocalPos.z * 1.35)).b;
        float rime = smoothstep(0.48, 0.0, hLocal) * (0.5 + 0.5 * rimeFbm) * (1.0 - uIsGreatLance) * (1.0 - isAirborneOrCollar * 0.75);
        body = mix(body, uColorRim, clamp(rime, 0.0, 1.0) * 0.56);

        // 6. Crisp Hewn-Plane Facet Separation
        body *= mix(1.0, 0.60 + 0.82 * ndv, 0.86);

        // 7. Sky-Probe + Key Sun Lighting
        vec3 L = normalize(vec3(uSunDir.x, max(0.45, uSunDir.y), uSunDir.z));
        vec3 H = normalize(L + V);
        float ndl = max(dot(N, L), 0.0);
        float ndvFull = clamp(abs(dot(N, V)), 0.0, 1.0);
        float skyProbe = 0.74 + 0.28 * ndl;
        vec3 diffuseLit = body * skyProbe * mix(0.82, 0.98, uDaylight);
        float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.22 * mix(0.5, 1.0, uDaylight);

        // 8. Great-Lance & Charging Shards: Terrifying Hard-Faceted Sub-Zero Glacial Crystal Optics
        //    High dramatic contrast between deep abyssal midnight-ice facets (#061836 / #0b2b59)
        //    and razor-sharp diamond ridge bevels & specular facet glints (#f4feff) — ZERO toothpaste stripes!
        float axialU = vFacetUv.y;
        float ridgeFactor = vFacetUv.x;
        float facetPlaneId = vFacetUv.z;

        // Discrete per-facet refractive value step + directional sun facet reflection
        float facetAngleSignal = ndl * 0.62 + ndvFull * 0.38 + (facetPlaneId - 0.5) * 0.22;
        vec3 abyssalCore = mix(uColorInk, uColorDeep, 0.42);
        vec3 darkSapphireFacet = mix(abyssalCore, uColorDeep, smoothstep(0.18, 0.44, facetAngleSignal));
        vec3 midCryoFacet = mix(darkSapphireFacet, uColorMid, smoothstep(0.42, 0.68, facetAngleSignal));
        vec3 brightGlacialFacet = mix(midCryoFacet, uColorIce, smoothstep(0.66, 0.88, facetAngleSignal));

        // Razor dihedral crystal edge bevels + lethal needle-tip frost + internal fault cracks
        float sharpRidge = smoothstep(0.68, 0.96, ridgeFactor);
        float needleTipFrost = smoothstep(0.72, 0.98, axialU);
        float sharpInternalCracks = smoothstep(0.66, 0.92, cracks);
        float diamondFacetGlint = smoothstep(0.82, 0.95, max(dot(N, H), 0.0)) + smoothstep(0.86, 0.97, ndl * ndvFull);

        // Coalescence lock wave when Act 1 shards snap-lock into the crystal blade
        float weldLine = exp(-pow((axialU - uChargeProgress) * 9.5, 2.0)) * (1.0 - smoothstep(0.92, 1.0, uChargeProgress));
        float lockWave = uCoalescencePulse * exp(-pow((axialU - (0.30 + 0.40 * uChargeProgress)) * 4.5, 2.0));
        float crystalEdgeHighlight = clamp(
          sharpRidge * 0.78 +
          needleTipFrost * 0.58 +
          sharpInternalCracks * 0.48 +
          diamondFacetGlint * 0.85 +
          weldLine * 0.72 +
          lockWave * 0.90,
          0.0,
          1.0
        );

        vec3 lanceCrystalColor = mix(brightGlacialFacet, uColorRim, crystalEdgeHighlight);
        // Deepen shadowed facets on the lance so dark-to-bright contrast reads as lethal sub-zero ice
        float shadowFacetMask = 1.0 - smoothstep(0.22, 0.54, facetAngleSignal);
        lanceCrystalColor = mix(lanceCrystalColor, abyssalCore, shadowFacetMask * 0.58 * (1.0 - sharpRidge * 0.85));

        diffuseLit = mix(diffuseLit, lanceCrystalColor, uIsGreatLance);

        // Also give Act 1/2 airborne charging shards (role >= 1.5) crisp dark-core / bright-edge diamond contrast
        // while keeping ballistic impact wedges (role == 1.0) on pristine V1 subsurface glacial optics!
        float chargeShardContrast = clamp(step(1.5, role) * (1.0 - uIsGreatLance), 0.0, 1.0);
        vec3 crispShardColor = mix(
          brightGlacialFacet,
          uColorRim,
          clamp(
            sharpRidge * 0.76 +
            diamondFacetGlint * 0.80 +
            sharpInternalCracks * 0.50 +
            tipFrost * 0.60 +
            shardLockFlash * 0.95,
            0.0,
            1.0
          )
        );
        crispShardColor = mix(crispShardColor, abyssalCore, shadowFacetMask * 0.54 * (1.0 - sharpRidge * 0.85));
        diffuseLit = mix(diffuseLit, crispShardColor, chargeShardContrast * 0.92);

        // 9. Controlled Subsurface Inner Light (never washes out the dark abyssal lance/shard facets!)
        float isFacetedCrystal = max(uIsGreatLance, chargeShardContrast);
        float coreAmbientWeight = mix(0.72, 0.14, isFacetedCrystal);
        vec3 glow = uColorRim * rimAmount * mix(0.76, 0.40, isFacetedCrystal);
        glow += uColorCore * (cracks * 0.58 + veins * 0.24) * (1.15 + 0.35 * uChargeProgress);
        glow += uColorCore * coreAmbientWeight;
        glow += uColorSeam * (sharpRidge * 0.45 + diamondFacetGlint * 0.55) * isFacetedCrystal * (0.65 + 0.35 * glowMult);
        glow += uColorRim * (shardLockFlash * 0.95 + lockWave * 0.80);
        glow *= 0.44;
        glow /= (1.0 + glow * 0.35);

        vec3 finalColor = diffuseLit + uColorRim * spec * (1.0 + 1.4 * isFacetedCrystal) + glow;

        // Crisp abyssal midnight-indigo silhouette rim framing
        float inkRim = 1.0 - smoothstep(0.08, 0.24, mix(ndv, ndvFull, isFacetedCrystal * 0.65));
        finalColor = mix(finalColor, uColorInk, inkRim * mix(0.52, 0.74, isFacetedCrystal));

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
        float iceSeam = smoothstep(0.68, 0.92, n1.r) * smoothstep(0.52, 0.78, mask);
        col = mix(col, uColorSheetBase, iceSeam * 0.55);
        col = mix(col, uColorSheetEdge * 1.06, shockRing * 0.75);

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
const MAX_LANCE_PARTS = 6; // 1 main fluted lance + 1 slim breech Mach collar
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
      uCoalescencePulse: { value: 0.0 },
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

    // Seamless Hold -> Launch Handoff State (zero allocations)
    this._lastChargeHoldAt = -99999;
    this._lastChargeStepAt = -1;
    this._heldWorldPos = new THREE.Vector3();
    this._heldSpinPhase = 0;
    this._heldLengthScale = 1.0;
    this._heldRadiusScale = 1.0;
    this._hasHeldPose = false;

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

    // DC 1: Spiraling Intake Crystal Shards & Vacuum Air-Draw Splinters (razor-pointed diamond daggers!)
    const intakeGeo = createRazorDiamondShardGeometry();
    this.intakeMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INTAKE_SHARDS * 4), 4);
    intakeGeo.setAttribute('aInstanceMeta', this.intakeMetaAttr);
    this.intakeShardsMesh = new THREE.InstancedMesh(intakeGeo, this.crystalMat, MAX_INTAKE_SHARDS);
    this.intakeShardsMesh.name = 'Shatterlance_DC1_IntakeShards';
    this.intakeShardsMesh.frustumCulled = false;
    this.intakeShardsMesh.count = 0;
    this.group.add(this.intakeShardsMesh);

    // DC 2: 7-Fluted Railgun Great-Lance + Coaxial Breech Stabilizer Ring
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

    // DC 4: World-Space 3D Snow-Rime Sigil, Track & Star-Fissure Ground Relief Decal
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
    const effectiveAssembly = this.fromChargeHold ? 0.025 : c.assembly;
    const flightDuration = Math.max(0.04, this.castLength / Math.max(1.0, c.speed));
    this.flightStartTime = effectiveAssembly;
    this.impactTime = effectiveAssembly + flightDuration;
    this.totalDuration = this.impactTime + c.lifetime + c.fadeTime;

    this.intakeRecords = [];
    for (let i = 0; i < MAX_INTAKE_SHARDS; i++) {
      const s = seed * 17.3 + i * 23.1;
      const ringAng = (i / MAX_INTAKE_SHARDS) * TAU * 2.0 + signedHash(s + 1.1) * 0.22;
      const radial = (0.45 + 0.45 * hash11(s + 2.3)) * c.intakeSphere;
      const axial = lerp(-0.45, 0.55, hash11(s + 3.7));
      const stagger = (i / MAX_INTAKE_SHARDS) * c.intakeStagger * 0.72;

      // Act 1 Crystal Assembly Wave parameters (18 chiseled diamond crystal shards in 3 waves of 6)
      const waveIdx = i % 3;
      const waveStart = waveIdx * 0.125 + hash11(s + 11.3) * 0.025;
      const waveDur = 0.195 + hash11(s + 12.7) * 0.028;
      const ascendStartAngle = (i / 18.0) * TAU + signedHash(s + 14.1) * 0.22;
      const ascendStartRad = 0.30 + 0.28 * hash11(s + 15.1); // 0.30..0.58m 3D halo around staff orb
      const ascendStartDy = -0.34 + 0.50 * hash11(s + 15.9); // rises from below/around staff orb (never touching ground!)
      const ascendStartAxial = lerp(-0.38, 0.54, hash11(s + 17.3));
      const socketAxial = lerp(-0.26, 0.56, ((i % 18) + 0.5) / 18.0);
      const socketAngle = ((i % 18) / 18.0) * TAU;

      // Act 2 Tight Coaxial Vacuum Air-Draw Streamlines (24 aerodynamic frost needles in 4 helical streams of 6)
      const armIdx = i % 4;
      const armSlot = Math.floor(i / 4); // 0..7 along the arm
      const isAirSplinter = true;
      const streamBaseAng = (armIdx / 4) * TAU;
      const vacuumOuterRad = 0.26 + 0.16 * (armIdx % 2) + 0.08 * hash11(s + 19.1); // 0.26..0.50m 3D vortex envelope
      const vacuumStartAxial = lerp(-0.42, 0.72, (armSlot % 6) / 5.0);
      const vacuumTargetAxial = lerp(-0.18, 0.55, (armSlot % 6) / 5.0);
      const vacuumCycleRate = 2.05;
      const vacuumPhaseOffset = (armSlot % 6) / 6.0;

      this.intakeRecords.push({
        seed: hash11(s + 5.1) * 10.0,
        ringAng,
        radial,
        axial,
        stagger,
        size: c.intakeSize * (0.78 + 0.36 * hash11(s + 7.9)),
        spin: (4.8 + hash11(s + 9.3) * 4.2) * (i % 2 === 0 ? 1 : -1),
        waveIdx,
        waveStart,
        waveDur,
        ascendStartAngle,
        ascendStartRad,
        ascendStartDy,
        ascendStartAxial,
        socketAxial,
        socketAngle,
        isAirSplinter,
        vacuumBaseAng: streamBaseAng,
        vacuumOuterRad,
        vacuumStartAxial,
        vacuumTargetAxial,
        vacuumCycleRate,
        vacuumPhaseOffset,
      });
    }

    this.wedgeRecords = [];
    const crownCount = 26;
    for (let i = 0; i < MAX_SHATTER_WEDGES; i++) {
      const s = seed * 31.7 + i * 19.9;
      const isCrownSpike = i < crownCount;
      const rawAz = (i / (isCrownSpike ? crownCount : MAX_SHATTER_WEDGES - crownCount)) * TAU + signedHash(s + 1.3) * 0.12;
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
   * Renders the 3-Act Physical Assembly while the player holds Attack:
   * - Act 1 (0.00..0.40s): 3 waves of chiseled glacier shards crystallize from low
   *   ground mist and rise along curved trajectories, snap-locking into the slow-drifting spear-seed.
   * - Act 2 (0.36..0.95s): Smooth turbine spin-up + 3D helical vacuum air-draw
   *   (aerodynamic frost-splinters & outer crystals sucked into the 7 flutes)
   *   while the Great-Lance physically elongates forward to 4.10m.
   * - Act 3 (0.95s+): Growth completes and outer intake shards finish absorbing
   *   into the core so the razor-poised 4.10m Great-Lance & slim breech collar
   *   spin cleanly on-axis ready to fire!
   */
  updateChargeHold({
    origin,
    direction,
    dirX,
    dirZ,
    yaw,
    chargeProgress,
    active = true,
    dt = 0,
  } = {}) {
    if (!active) {
      return this.cancelCharge();
    }

    this._resolveOriginAndDirection({ origin, direction, dirX, dirZ, yaw });

    const nowStamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this.chargeHoldActive) {
      this.chargeHoldActive = true;
      this.chargeHoldTime = 0;
      this._lastChargeStepAt = -1;
    }

    if (Number.isFinite(dt) && dt > 0 && nowStamp - (this._lastChargeStepAt || -999) >= 6.0) {
      this.chargeHoldTime += Math.min(dt, 0.05);
      this._lastChargeStepAt = nowStamp;
    }
    this._lastChargeHoldAt = nowStamp;

    const t = this.chargeHoldTime;
    const prog = saturate(t / this.config.act2GrowthEnd);
    this.chargeProgress = Number.isFinite(chargeProgress) ? clamp(chargeProgress, prog, 1.0) : prog;

    this.active = true;
    this.group.visible = true;
    this.sharedUniforms.uTime.value = t;
    this.sharedUniforms.uChargeProgress.value = prog;

    this._renderStaffVortexFrame(t, prog);
    return this;
  }

  _renderStaffVortexFrame(t, prog) {
    const c = this.config;

    // 3 distinct shard-lock coalescence pulses in Act 1 (at t=0.16s, 0.29s, 0.42s)
    // plus an apex lock pulse when full physical growth finishes at t=0.96s.
    const pWave0 = Math.exp(-Math.pow((t - 0.16) / 0.038, 2.0));
    const pWave1 = Math.exp(-Math.pow((t - 0.29) / 0.042, 2.0));
    const pWave2 = Math.exp(-Math.pow((t - 0.42) / 0.045, 2.0));
    const pApexLock = Math.exp(-Math.pow((t - 0.96) / 0.050, 2.0));
    const coalescencePulse = clamp(pWave0 * 0.72 + pWave1 * 0.85 + pWave2 * 1.0 + pApexLock * 0.88, 0.0, 1.30);
    this.sharedUniforms.uCoalescencePulse.value = coalescencePulse;

    // Step-ratcheted Act 1 core emergence as the 3 shard waves snap-lock into the spear blade
    const step0 = smoothstep(0.0, 0.18, t);
    const step1 = smoothstep(0.13, 0.32, t);
    const step2 = smoothstep(0.26, 0.48, t);
    const act1Mass = 0.24 * step0 + 0.34 * step1 + 0.42 * step2;

    // Act 2 smooth cryo-vacuum elongation curve (0.42s .. 1.04s); strictly 1.0 for t >= 1.04s
    const act2Grow = smoothstep(0.42, c.act2GrowthEnd, t);
    // Act 3 equilibrium absorption curve: absorbs all intake frost needles cleanly into the spear by t=1.08s
    const act3Absorb = smoothstep(0.92, 1.08, t);

    // Physical dimensions of the central Razor Glacial Spear (respecting 1.4m KayKit Mage scale!):
    // - Act 1 (0.00..0.48s): Forms from a 0.48m crystalline core seed to 0.96m as shards lock in
    // - Act 2 (0.42..1.04s): Elongates smoothly from 0.96m to 1.78m while drawing in cold air
    // - Act 3 (1.04s+): Holds rock-steady at 1.78m length and 0.145m guard radius (~0.075m 3D diamond blade shaft)
    const lanceLen = lerp(0.48 + 0.48 * act1Mass, c.lanceLength, act2Grow);
    const lanceRad = lerp(0.078 + 0.032 * act1Mass, c.lanceRadius, act2Grow);

    // Anchor directly at the Mage's right-hand raised green staff orb (holdRight = 0.48m, holdHeight = 1.25m)
    // so the spear emanates directly from her staff tip AND is 100% visible to the right of her hat in OTS view!
    const holdRight = 0.48;
    const holdHeight = 1.25;
    const centerForward = 0.88 + 0.14 * act1Mass + 0.24 * act2Grow;
    const centerX = this.origin.x + this.direction.x * centerForward + this.side.x * holdRight;
    const centerZ = this.origin.z + this.direction.z * centerForward + this.side.z * holdRight;
    const groundAtCenter = this.getGroundHeight(centerX, centerZ);
    const centerY = groundAtCenter + holdHeight;

    const spinPhase = evaluateIntegratedSpinPhase(t);
    const instOmega = evaluateInstantaneousOmega(t);
    const omegaNorm = saturate((instOmega - SPIN_OMEGA_1) / (SPIN_OMEGA_MAX - SPIN_OMEGA_1));

    // Cache held world state for seamless zero-jump release handoff in `cast()`
    this._heldWorldPos.set(centerX, centerY, centerZ);
    this._heldSpinPhase = spinPhase;
    this._heldLengthScale = lanceLen;
    this._heldRadiusScale = lanceRad;
    this._hasHeldPose = true;

    // -------------------------------------------------------------------------
    // 1. DC 1: Compact Chiseled Shards (Act 1 Lock-In -> Act 2 Tight Coaxial Frost Needles -> Act 3 Absorbed)
    // -------------------------------------------------------------------------
    let intakeSlot = 0;
    for (let i = 0; i < 24; i++) {
      const rec = this.intakeRecords[i];
      const act1EndTime = rec.waveStart + rec.waveDur;

      if (t <= act1EndTime && i < 18) {
        // =====================================================================
        // ACT 1 (0.00..0.45s): 18 Chiseled Crystal Daggers Converge & Lock Into Spear Blade
        // =====================================================================
        if (t < rec.waveStart) continue;
        const uAsc = saturate((t - rec.waveStart) / Math.max(0.05, rec.waveDur));

        const lockSnap = inCubic(smoothstep(0.24, 1.0, uAsc));
        const curAng = lerp(rec.ascendStartAngle, rec.socketAngle + spinPhase * 0.5, smoothstep(0.18, 1.0, uAsc));
        const curRad = lerp(rec.ascendStartRad, lanceRad * 0.42, lockSnap);

        const rx = Math.cos(curAng) * curRad;
        const ry = lerp(rec.ascendStartDy, Math.sin(curAng) * (lanceRad * 0.36), smoothstep(0.10, 1.0, uAsc));
        const axialOff = lerp(rec.ascendStartAxial, rec.socketAxial * (lanceLen * 0.62), smoothstep(0.12, 1.0, uAsc));

        const wx = centerX + this.direction.x * axialOff + this.side.x * rx;
        const wz = centerZ + this.direction.z * axialOff + this.side.z * rx;
        const wy = centerY + ry;

        _dummy.position.set(wx, wy, wz);

        // Orient shard so its sharp tip rotates into alignment with the forward spear axis as it locks in!
        const forwardBias = lerp(0.55, 1.85, lockSnap);
        const inwardPull = (1.0 - lockSnap) * 0.45;
        const aimDx = this.direction.x * forwardBias - this.side.x * Math.cos(curAng) * inwardPull;
        const aimDy = -ry * inwardPull;
        const aimDz = this.direction.z * forwardBias - this.side.z * Math.cos(curAng) * inwardPull;
        _pos.set(aimDx, aimDy, aimDz);
        if (_pos.lengthSq() > 1e-5) {
          _pos.normalize();
          _quat.setFromUnitVectors(UP, _pos);
        } else {
          _quat.identity();
        }
        _rotQuat.setFromAxisAngle(UP, rec.seed + uAsc * 0.9);
        _dummy.quaternion.copy(_quat).multiply(_rotQuat);

        const birthGrow = smoothstep(0.0, 0.20, uAsc);
        const mergeTaper = 1.0 - 0.62 * smoothstep(0.84, 1.0, uAsc);
        const sc = rec.size * birthGrow * mergeTaper;
        // Bold chiseled 3D diamond crystal shard (width ~0.065m, length ~0.26m)
        _dummy.scale.set(sc * 0.36, sc * 1.38, sc * 0.36);
        _dummy.updateMatrix();
        this.intakeShardsMesh.setMatrixAt(intakeSlot, _dummy.matrix);

        const lockFlash = smoothstep(0.70, 0.94, uAsc) * (1.0 - smoothstep(0.95, 1.0, uAsc));
        const mOff = intakeSlot * 4;
        this.intakeMetaAttr.array[mOff + 0] = rec.seed;
        this.intakeMetaAttr.array[mOff + 1] = 0.95 + 0.75 * lockFlash;
        this.intakeMetaAttr.array[mOff + 2] = 2.0;
        this.intakeMetaAttr.array[mOff + 3] = -lockFlash;
        intakeSlot++;
      } else if (t > 0.36 && act3Absorb < 0.992) {
        // =====================================================================
        // ACT 2 (0.40..0.98s): Tight Coaxial Cryo-Vacuum Air-Draw Frost Needles
        // 24 razor-thin aerodynamic frost splinters spiral tightly along the spear
        // shaft (max radius <= 0.38m, strictly coaxial around centerY — ZERO dangling legs!)
        // =====================================================================
        const tVac = Math.max(0, t - 0.36);
        const rawU = (tVac * rec.vacuumCycleRate * (0.78 + 0.38 * omegaNorm) + rec.vacuumPhaseOffset) % 1.0;
        const u = lerp(rawU, 1.0, act3Absorb * act3Absorb);
        if (u >= 0.98) continue;

        const pull = Math.pow(1.0 - u, 1.25) * (1.0 - act3Absorb);
        const envScale = Math.sin(u * Math.PI) * (1.0 - act3Absorb * 0.90);
        if (envScale <= 0.03) continue;

        const outerSpan = rec.vacuumOuterRad * (0.72 + 0.28 * act2Grow);
        const coreRad = lanceRad * 0.32;
        const orbitRad = coreRad + outerSpan * pull;

        const spiralWind = 3.4 * u;
        const theta = rec.vacuumBaseAng + spinPhase * 0.65 + spiralWind;

        const rx = Math.cos(theta) * orbitRad;
        const ry = Math.sin(theta) * orbitRad * 0.92;

        const startAx = rec.vacuumStartAxial * (0.65 + 0.35 * act2Grow);
        const endAx = rec.vacuumTargetAxial * (lanceLen * 0.42);
        const axialOff = lerp(startAx, endAx, u);

        const wx = centerX + this.direction.x * axialOff + this.side.x * rx;
        const wz = centerZ + this.direction.z * axialOff + this.side.z * rx;
        const wy = centerY + ry;

        _dummy.position.set(wx, wy, wz);

        // Align needle tightly along the forward helical flow around the spear axis
        const tx = -Math.sin(theta) * orbitRad * 1.4 - Math.cos(theta) * outerSpan * 0.75;
        const ty = (Math.cos(theta) * orbitRad * 1.4 - Math.sin(theta) * outerSpan * 0.75) * 0.92;
        const tz = 0.52;

        const worldTanX = this.direction.x * tz + this.side.x * tx;
        const worldTanY = ty;
        const worldTanZ = this.direction.z * tz + this.side.z * tx;
        _pos.set(worldTanX, worldTanY, worldTanZ);
        if (_pos.lengthSq() > 1e-5) {
          _pos.normalize();
          _quat.setFromUnitVectors(UP, _pos);
        } else {
          _quat.identity();
        }
        _rotQuat.setFromAxisAngle(UP, t * rec.spin);
        _dummy.quaternion.copy(_quat).multiply(_rotQuat);

        // Crisp aerodynamic frost needle (~0.028m width x ~0.22m length)
        const wSc = rec.size * 0.16 * (0.45 + 0.55 * envScale);
        const lSc = rec.size * 1.18 * (0.50 + 0.50 * envScale);
        _dummy.scale.set(wSc, lSc, wSc);

        _dummy.updateMatrix();
        this.intakeShardsMesh.setMatrixAt(intakeSlot, _dummy.matrix);

        const absorbFlash = smoothstep(0.72, 0.96, u) * 0.85;
        const mOff = intakeSlot * 4;
        this.intakeMetaAttr.array[mOff + 0] = rec.seed;
        this.intakeMetaAttr.array[mOff + 1] = 1.15 + 0.40 * omegaNorm;
        this.intakeMetaAttr.array[mOff + 2] = 2.0;
        this.intakeMetaAttr.array[mOff + 3] = -absorbFlash;
        intakeSlot++;
      }
    }
    this.intakeShardsMesh.count = intakeSlot;
    this.intakeShardsMesh.instanceMatrix.needsUpdate = true;
    this.intakeMetaAttr.needsUpdate = true;

    // -------------------------------------------------------------------------
    // 2. DC 2: Razor-Faceted Glacial Spear + Compact Counter-Spinning Crystal Guard Collar
    // -------------------------------------------------------------------------
    let lanceSlot = 0;

    // Slot 0: Primary 1.80m Chiseled Diamond Glacial Spear Body
    _quat.setFromUnitVectors(_forwardZ, this.direction);
    _rotQuat.setFromAxisAngle(_forwardZ, spinPhase);
    _quat.multiply(_rotQuat);

    _dummy.position.set(centerX, centerY, centerZ);
    _dummy.quaternion.copy(_quat);
    _dummy.scale.set(lanceRad, lanceRad, lanceLen);
    _dummy.updateMatrix();
    this.greatLanceMesh.setMatrixAt(lanceSlot, _dummy.matrix);
    this.lanceMetaAttr.setXYZW(lanceSlot, 1.1, 1.05 + 0.35 * prog + 0.50 * coalescencePulse, 0.0, 0.0);
    lanceSlot++;

    // Slot 1: Compact Faceted Crystal Guard Crown at the Breech (locks in at t=0.22s)
    if (t >= 0.20) {
      const collarAppear = smoothstep(0.20, 0.40, t);
      const collarCompress = lerp(1.18, 0.92, act2Grow);
      const collarAxial = -lanceLen * 0.12;
      _quat.setFromUnitVectors(_forwardZ, this.direction);
      _rotQuat.setFromAxisAngle(_forwardZ, -spinPhase * 0.85 + Math.PI * 0.25);
      _quat.multiply(_rotQuat);
      _dummy.position.set(
        centerX + this.direction.x * collarAxial,
        centerY,
        centerZ + this.direction.z * collarAxial
      );
      _dummy.quaternion.copy(_quat);
      const c1Rad = lanceRad * collarCompress * collarAppear;
      _dummy.scale.set(c1Rad, c1Rad, (0.24 + 0.14 * act2Grow) * collarAppear);
      _dummy.updateMatrix();
      this.greatLanceMesh.setMatrixAt(lanceSlot, _dummy.matrix);
      this.lanceMetaAttr.setXYZW(lanceSlot, 2.7, 1.15 + 0.30 * prog, 1.0, 0.0);
      lanceSlot++;
    }

    this.greatLanceMesh.count = lanceSlot;
    this.greatLanceMesh.instanceMatrix.needsUpdate = true;
    this.lanceMetaAttr.needsUpdate = true;

    // -------------------------------------------------------------------------
    // 3. DC 3: Keep Shatter Wedges at 0 during charge hold
    // -------------------------------------------------------------------------
    this.shatterWedgesMesh.count = 0;
    this.shatterWedgesMesh.instanceMatrix.needsUpdate = true;

    // -------------------------------------------------------------------------
    // 4. DC 4: ZERO ground starfish puddle during charge hold!
    // -------------------------------------------------------------------------
    this.groundDecalMesh.count = 0;
    this.groundDecalMesh.instanceMatrix.needsUpdate = true;
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
    const nowStamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const recentHold = this._hasHeldPose && nowStamp - (this._lastChargeHoldAt || -99999) < 400;
    const wasHoldingCharge = Boolean(this.chargeHoldActive || options.fromChargeHold || recentHold);
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
    const effectiveAssembly = this.fromChargeHold ? 0.025 : c.assembly;
    const startHoverDist = this.fromChargeHold
      ? Math.min(1.26, this.castLength * 0.45)
      : Math.min(c.hoverForward, this.castLength * 0.45);
    const startRightOff = this.fromChargeHold ? 0.48 : 0.0;
    const assemblyU = saturate(timeSeconds / Math.max(0.02, effectiveAssembly));
    const flightDuration = Math.max(0.04, this.castLength / Math.max(1.0, c.speed));
    const flightU = saturate((timeSeconds - effectiveAssembly) / flightDuration);
    const rightOff = startRightOff * (1.0 - flightU);
    const impactElapsed = timeSeconds - this.impactTime;
    const postImpactU = saturate(impactElapsed / Math.max(0.1, c.lifetime + c.fadeTime));

    this.sharedUniforms.uChargeProgress.value = timeSeconds < effectiveAssembly ? assemblyU : 1.0;
    this.sharedUniforms.uCoalescencePulse.value =
      timeSeconds < effectiveAssembly ? Math.sin(assemblyU * Math.PI) * 0.65 : 0.0;

    const impX = this.origin.x + this.direction.x * this.castLength;
    const impZ = this.origin.z + this.direction.z * this.castLength;
    const impY = this.getGroundHeight(impX, impZ);

    // 1. Evaluate Spiraling Coaxial Intake Shards (DC 1)
    let intakeSlot = 0;
    if (!this.fromChargeHold && timeSeconds <= this.impactTime + 0.02) {
      const hoverDist = lerp(startHoverDist, this.castLength, flightU);
      const centerX = this.origin.x + this.direction.x * hoverDist + this.side.x * rightOff;
      const centerZ = this.origin.z + this.direction.z * hoverDist + this.side.z * rightOff;
      const centerY = this.getGroundHeight(centerX, centerZ) + c.lanceHeight;

      for (let i = 0; i < 24; i++) {
        const rec = this.intakeRecords[i];
        const shardProgress = saturate((assemblyU - rec.stagger) / Math.max(0.15, 1.0 - rec.stagger));
        if (shardProgress >= 0.992 && timeSeconds > effectiveAssembly + 0.03) continue;

        const pull = 1.0 - Math.pow(shardProgress, c.intakeEase);
        const swirlAng = rec.ringAng + timeSeconds * 4.2;
        const rad = rec.radial * (0.45 + 0.55 * pull);
        const ax = rec.axial * (0.45 + 0.55 * pull);

        const rx = Math.cos(swirlAng) * rad;
        const ry = Math.sin(swirlAng) * rad * 0.85;

        const wx = centerX + this.direction.x * ax + this.side.x * rx;
        const wz = centerZ + this.direction.z * ax + this.side.z * rx;
        const wy = Math.max(this.getGroundHeight(wx, wz) + 0.35, centerY + ry);

        _dummy.position.set(wx, wy, wz);
        const targetX = centerX + this.direction.x * (ax * 0.35 + 0.65);
        const targetY = centerY;
        const targetZ = centerZ + this.direction.z * (ax * 0.35 + 0.65);
        _pos.set(targetX - wx, targetY - wy, targetZ - wz);
        if (_pos.lengthSq() > 1e-4) {
          _pos.normalize();
          _quat.setFromUnitVectors(UP, _pos);
        } else {
          _quat.identity();
        }
        _rotQuat.setFromAxisAngle(UP, timeSeconds * rec.spin);
        _dummy.quaternion.copy(_quat).multiply(_rotQuat);

        const sc = rec.size * (0.50 + 0.50 * Math.sin(shardProgress * Math.PI * 0.85 + 0.2));
        _dummy.scale.set(sc * 0.26, sc * 1.25, sc * 0.26);
        _dummy.updateMatrix();
        this.intakeShardsMesh.setMatrixAt(intakeSlot, _dummy.matrix);

        const mOff = intakeSlot * 4;
        this.intakeMetaAttr.array[mOff + 0] = rec.seed;
        this.intakeMetaAttr.array[mOff + 1] = 0.65 + 0.55 * shardProgress;
        this.intakeMetaAttr.array[mOff + 2] = 1.0;
        this.intakeMetaAttr.array[mOff + 3] = 0.0;
        intakeSlot++;
      }
    }
    this.intakeShardsMesh.count = intakeSlot;
    this.intakeShardsMesh.instanceMatrix.needsUpdate = true;
    this.intakeMetaAttr.needsUpdate = true;

    // 2. Evaluate Razor-Faceted Glacial Spear (DC 2)
    let lanceSlot = 0;
    const lanceVisible = timeSeconds <= this.impactTime + 0.02;
    if (lanceVisible) {
      const dist = lerp(startHoverDist, this.castLength, flightU);
      const lx =
        this.fromChargeHold && this._hasHeldPose
          ? lerp(this._heldWorldPos.x, impX, flightU)
          : this.origin.x + this.direction.x * dist + this.side.x * rightOff;
      const lz =
        this.fromChargeHold && this._hasHeldPose
          ? lerp(this._heldWorldPos.z, impZ, flightU)
          : this.origin.z + this.direction.z * dist + this.side.z * rightOff;
      const ly =
        this.fromChargeHold && this._hasHeldPose
          ? lerp(this._heldWorldPos.y, impY + c.lanceHeight * 0.85, flightU)
          : this.getGroundHeight(lx, lz) + c.lanceHeight;

      _quat.setFromUnitVectors(_forwardZ, this.direction);
      const baseSpin = this.fromChargeHold && this._hasHeldPose ? this._heldSpinPhase : 0.0;
      const rollAng =
        baseSpin +
        (this.fromChargeHold
          ? timeSeconds * SPIN_OMEGA_MAX
          : evaluateIntegratedSpinPhase(timeSeconds * 1.25));
      _rotQuat.setFromAxisAngle(_forwardZ, rollAng);
      _quat.multiply(_rotQuat);

      const fullLanceLen = Math.min(c.lanceLength, Math.max(1.1, this.castLength * 0.78));
      const lenScale =
        this.fromChargeHold && this._hasHeldPose
          ? lerp(this._heldLengthScale, fullLanceLen, smoothstep(0.0, 0.35, flightU))
          : fullLanceLen * Math.pow(Math.max(0.28, assemblyU), 0.48);
      const radScale =
        this.fromChargeHold && this._hasHeldPose
          ? lerp(this._heldRadiusScale, c.lanceRadius, smoothstep(0.0, 0.35, flightU))
          : c.lanceRadius * Math.pow(Math.max(0.36, assemblyU), 0.88);

      // Slot 0: Primary 1.80m Razor-Faceted Glacial Spear
      _dummy.position.set(lx, ly, lz);
      _dummy.quaternion.copy(_quat);
      _dummy.scale.set(radScale, radScale, lenScale);
      _dummy.updateMatrix();
      this.greatLanceMesh.setMatrixAt(lanceSlot, _dummy.matrix);
      this.lanceMetaAttr.setXYZW(lanceSlot, 1.1, 1.15, 0.0, 0.0);
      lanceSlot++;
    }
    this.greatLanceMesh.count = lanceSlot;
    this.greatLanceMesh.instanceMatrix.needsUpdate = true;
    this.lanceMetaAttr.needsUpdate = true;

    // 3. Evaluate Directional Railgun Shatter-Crown & Ballistic 3D Wedges (DC 3)
    let wedgeSlot = 0;
    if (impactElapsed >= -0.02) {
      const tBreak = Math.max(0.0, impactElapsed + 0.02);

      for (let i = 0; i < MAX_SHATTER_WEDGES; i++) {
        const rec = this.wedgeRecords[i];
        const dissolveProgress = smoothstep(0.45, 0.98, postImpactU + (i / MAX_SHATTER_WEDGES) * 0.08);
        if (dissolveProgress >= 0.995) continue;

        if (rec.isCrownSpike) {
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

    // 4. Evaluate 3D Snow-Rime Slipstream & Star-Fissure Impact Ground Decal (DC 4)
    //    (ZERO muzzle starfish puddle in front of the Mage!)
    let decalSlot = 0;
    const castYaw = Math.atan2(this.direction.x, this.direction.z);
    const totalAge01 = clamp(timeSeconds / Math.max(0.2, this.totalDuration), 0.0, 0.999);

    const trackReach = timeSeconds < effectiveAssembly ? 0.0 : clamp(flightU, 0.0, 1.0);
    if (trackReach > 0.04) {
      const midDist = this.castLength * 0.52;
      const tx = this.origin.x + this.direction.x * midDist;
      const tz = this.origin.z + this.direction.z * midDist;
      const ty = this.getGroundHeight(tx, tz) + 0.04;
      _dummy.position.set(tx, ty, tz);
      _dummy.quaternion.setFromAxisAngle(UP, castYaw);
      _dummy.scale.set(1.65, 1.0, this.castLength * 0.52);
      _dummy.updateMatrix();
      this.groundDecalMesh.setMatrixAt(decalSlot, _dummy.matrix);
      this.decalMetaAttr.setXYZW(decalSlot, totalAge01, 0.0, 0.37, trackReach);
      decalSlot++;
    }

    if (impactElapsed >= -0.02) {
      const plateGrow = smoothstep(0.0, 0.18, Math.max(0.01, impactElapsed + 0.02));
      const iy = impY + 0.045;
      _dummy.position.set(impX, iy, impZ);
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
      const nowStamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (Number.isFinite(dt) && dt > 0 && nowStamp - (this._lastChargeStepAt || -999) >= 6.0) {
        this.chargeHoldTime += Math.min(dt, 0.05);
        this._lastChargeStepAt = nowStamp;
      }
      this._lastChargeHoldAt = nowStamp;
      const prog = saturate(this.chargeHoldTime / this.config.act2GrowthEnd);
      this.chargeProgress = prog;
      this.sharedUniforms.uTime.value = this.chargeHoldTime;
      this.sharedUniforms.uChargeProgress.value = prog;
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
      chargeProgress: Number(this.chargeProgress.toFixed(3)),
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
    this.sharedUniforms.uCoalescencePulse.value = 0.0;
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
