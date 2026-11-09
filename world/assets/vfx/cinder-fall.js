// ============================================================================
// world/assets/vfx/cinder-fall.js
//
// Stage 4 Pass 2: Opaque Cel-Shaded "Cinder Fall" Volcanic Meteor VFX System
//
// Visual & Engineering Contract:
// - Strictly <= 4 InstancedMeshes when active, 0 draw calls when idle (`group.visible = false`):
//     1. `asteroidMesh` (1 InstancedMesh):
//        - In-flight (`impactElapsed < 0`): Slot 0 is the single hurtling `1.08m`
//          chiseled volcanic basalt-magma asteroid monolith.
//        - On impact (`impactElapsed >= 0`): Shatters immediately into 4 jagged
//          broken boulder fragments (slots `0..3`, scale `0.48..0.64m`) that
//          burst outward/upward (`vy = 4.2..8.5 m/s`, `gravity = -22 m/s^2`),
//          bounce once on the ground (`restitution = 0.32`), settle on the
//          crater floor, cool into dark charcoal basalt, and crumble into
//          glowing ember ash via 3D `NoiseAtlas` erosion (ZERO shrinking or sinking!).
//     2. `fireWakeMesh` (1 InstancedMesh): Closed 3D flame-tongue plume hulls
//        along the in-flight wake (collapsing cleanly into the crater on impact)
//        and roaring volcanic crater fire plumes (`transparent: false`, hard
//        `discard < 0.45`, 3-band Ukiyo-e cel fire & dark soot-ink border).
//     3. `craterRocksMesh` (1 InstancedMesh): 16 tilted basalt-and-magma crater
//        rim monoliths heaved around the impact perimeter + 24 ballistic cinder
//        chunks (`vy = 4.2..8.5 m/s`, `gravity = -22 m/s^2`, `restitution = 0.32`)
//        that keep 100% scale and cool/crumble into glowing ash in place!
//     4. `craterDecalMesh` (1 InstancedMesh): Wide 3D-relieved volcanic slag
//        crater basin & 8-arm tectonic lava-rift scar grounding the entire
//        outer ring of basalt rim slabs (`transparent: false`, `discard < 0.45`).
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

/**
 * Deterministic 1-bounce ballistic trajectory (`gravity = -22 m/s^2`, `restitution = 0.32`).
 * Bounces once on `floorY` and settles cleanly on the crater floor without sinking.
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

export const CINDER_FALL_DEFAULTS = Object.freeze({
  range: 14.0, // default arena impact distance
  length: 14.0, // default aim distance alias
  minDistance: 3.0, // minimum aim distance, m
  maxDistance: 16.0, // maximum aim distance, m
  speed: 22.5, // horizontal downrange travel speed, m/s
  lifetime: 2.2, // seconds crater burns after impact
  fadeTime: 1.5, // seconds everything takes to cool & crumble

  // Trajectory
  handHeight: 2.15,
  handForward: 0.65,
  endHeight: 0.68,
  arc: 3.4,
  arcCurve: 0.85,

  // Asteroid & Crater Rim
  radius: 1.08,
  spin: 3.4,
  rimSlabCount: 16,
  cinderRockCount: 24,
  craterRadius: 3.35,
  fissureRadius: 6.85,
  trailBurnout: 0.08,

  // Linear-sRGB Palette Uniforms (passed via THREE.Color)
  colorChar: '#1c1512',
  colorRockDark: '#382b24',
  colorRockMid: '#5e493e',
  colorRockLit: '#8c7262',
  colorCrackDeep: '#d93800',
  colorCrack: '#ff7314',
  colorHot: '#fff3c4',
  colorInk: '#120c09',
  colorFlameEdge: '#d9280b',
  colorFlameMid: '#ff7b14',
  colorFlameCore: '#fff094',
  colorFlameSmoke: '#1a120f',
});

/* ------------------------------------------------------------------------- */
/* 1. Procedural Geometries (Angular Chiseled Asteroid & Flame-Tongue Hull)  */
/* ------------------------------------------------------------------------- */

export function createVolcanicAsteroidGeometry({
  subdivisions = 1,
  cuts = 11,
  cutDepth = 0.34,
  craters = 6,
  craterDepth = 0.22,
  seed = 11.7,
} = {}) {
  const baseGeo = new THREE.IcosahedronGeometry(1.0, subdivisions).toNonIndexed();
  const posAttr = baseGeo.attributes.position;

  const cutPlanes = [];
  for (let i = 0; i < cuts; i++) {
    const s = seed * 13.1 + i * 19.7;
    const theta = hash11(s + 1.1) * TAU;
    const phi = Math.acos(signedHash(s + 2.3));
    const dir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    ).normalize();
    cutPlanes.push({
      dir,
      planeDist: 1.0 - cutDepth * (0.60 + 0.55 * hash11(s + 3.9)),
    });
  }

  const craterDirs = [];
  for (let i = 0; i < craters; i++) {
    const s = seed * 29.3 + i * 37.1;
    const theta = hash11(s + 1.7) * TAU;
    const phi = Math.acos(signedHash(s + 4.1));
    craterDirs.push(
      new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize()
    );
  }

  const cavityArr = new Float32Array(posAttr.count);
  const v = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).normalize();
    let r = 1.0;
    let cav = 0.0;

    const crag =
      Math.sin(v.x * 2.8 + seed) * Math.cos(v.y * 2.4 - seed) * 0.18 +
      Math.cos(v.z * 3.5 + v.x * 1.9) * 0.14;
    r += crag;

    for (const cp of cutPlanes) {
      const proj = v.dot(cp.dir) * r;
      if (proj > cp.planeDist) {
        const bite = proj - cp.planeDist;
        r -= bite * 0.92;
        const seamEdge = Math.exp(-Math.pow((bite - 0.05) * 14.0, 2.0));
        cav = Math.max(cav, seamEdge * 0.95);
      }
    }

    for (const cd of craterDirs) {
      const ang = Math.acos(clamp(v.dot(cd), -1.0, 1.0));
      if (ang < 0.48) {
        const u = ang / 0.48;
        const bowl = (1.0 - u * u) * craterDepth;
        const rim = Math.exp(-Math.pow((u - 0.85) * 6.0, 2.0)) * 0.09;
        r -= bowl - rim;
        cav = Math.max(cav, Math.pow(1.0 - u, 1.4) * 1.0);
      }
    }

    posAttr.setXYZ(i, v.x * r, v.y * r * 0.92, v.z * r);
    cavityArr[i] = cav;
  }

  baseGeo.setAttribute('aCavity', new THREE.BufferAttribute(cavityArr, 1));
  baseGeo.computeVertexNormals();
  baseGeo.computeBoundingSphere();
  return baseGeo;
}

/**
 * Closed outward-wound 3D flame-tongue plume hull (local +Y is tongue length from 0 to 1).
 */
export function createFlameTongueHullGeometry({ rings = 10, sides = 8 } = {}) {
  const ringPts = [];
  for (let r = 0; r < rings; r++) {
    const v = r / (rings - 1);
    const rad = Math.sin(Math.pow(v, 0.72) * Math.PI) * (1.0 - 0.32 * v);
    const curlX = Math.pow(v, 1.8) * 0.18;
    const pts = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * TAU;
      pts.push({
        pos: [Math.cos(ang) * rad * 0.52 + curlX, v, Math.sin(ang) * rad * 0.52],
        u: s / sides,
        v,
      });
    }
    ringPts.push(pts);
  }

  const baseCenter = [0, -0.04, 0];
  const tipCenter = [0.20, 1.05, 0];
  const positions = [];
  const uvs = [];

  const pushTriCCW = (a, b, c, uvA, uvB, uvC) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
  };

  for (let r = 0; r < rings - 1; r++) {
    const row0 = ringPts[r];
    const row1 = ringPts[r + 1];
    for (let s = 0; s < sides; s++) {
      const sNext = (s + 1) % sides;
      const a = row0[s];
      const b = row1[s];
      const c = row1[sNext];
      const d = row0[sNext];
      pushTriCCW(a.pos, b.pos, c.pos, [a.u, a.v], [b.u, b.v], [c.u, c.v]);
      pushTriCCW(a.pos, c.pos, d.pos, [a.u, a.v], [c.u, c.v], [d.u, d.v]);
    }
  }

  const firstRow = ringPts[0];
  const lastRow = ringPts[rings - 1];
  for (let s = 0; s < sides; s++) {
    const sNext = (s + 1) % sides;
    pushTriCCW(
      baseCenter,
      firstRow[s].pos,
      firstRow[sNext].pos,
      [0.5, 0.0],
      [firstRow[s].u, 0.0],
      [firstRow[sNext].u, 0.0]
    );
    pushTriCCW(
      lastRow[s].pos,
      tipCenter,
      lastRow[sNext].pos,
      [lastRow[s].u, 1.0],
      [0.5, 1.0],
      [lastRow[sNext].u, 1.0]
    );
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

function createBasaltMagmaMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'CinderFallBasaltMagmaMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uColorChar: { value: new THREE.Color(config.colorChar) },
      uColorRockDark: { value: new THREE.Color(config.colorRockDark) },
      uColorRockMid: { value: new THREE.Color(config.colorRockMid) },
      uColorRockLit: { value: new THREE.Color(config.colorRockLit) },
      uColorCrackDeep: { value: new THREE.Color(config.colorCrackDeep) },
      uColorCrack: { value: new THREE.Color(config.colorCrack) },
      uColorHot: { value: new THREE.Color(config.colorHot) },
      uColorInk: { value: new THREE.Color(config.colorInk) },
    },
    vertexShader: /* glsl */ `
      attribute float aCavity;
      attribute vec4 aInstanceMeta; // x: seed, y: heat (0..1.5), z: dissolveProgress (0..1), w: isSlab (0..1)

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying float vCavity;
      varying vec4 vMeta;

      void main() {
        vLocalPos = position;
        vCavity = aCavity;
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
      uniform vec3 uColorChar;
      uniform vec3 uColorRockDark;
      uniform vec3 uColorRockMid;
      uniform vec3 uColorRockLit;
      uniform vec3 uColorCrackDeep;
      uniform vec3 uColorCrack;
      uniform vec3 uColorHot;
      uniform vec3 uColorInk;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPos;
      varying float vCavity;
      varying vec4 vMeta;

      void main() {
        float seed = vMeta.x;
        float heat = max(0.0, vMeta.y);
        float dissolveProgress = clamp(vMeta.z, 0.0, 1.0);
        float isSlab = vMeta.w;

        // 1. Crisp Derivative-Flat Facet Normal so every polyhedral rock plane reads distinctly
        vec3 dN = cross(dFdx(vWorldPos), dFdy(vWorldPos));
        vec3 N = length(dN) > 1e-8 ? normalize(dN) : normalize(vWorldNormal);
        if (dot(N, vWorldNormal) < 0.0) N = -N;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(vec3(uSunDir.x, max(0.42, uSunDir.y), uSunDir.z));

        float ndl = dot(N, L) * 0.5 + 0.5;
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        // 2. Sample Low-Frequency Tectonic Fault Mask (B) and Coarse Fracture Seams (R)
        vec2 uvMacro = vLocalPos.xz * 0.34 + vec2(vLocalPos.y * 0.31 + seed * 0.41, seed * 0.79);
        vec2 uvFault = vLocalPos.xy * 0.48 + vec2(vLocalPos.z * 0.42 - seed * 0.29, seed * 0.53);
        vec4 nMacro = texture2D(uNoiseAtlas, uvMacro);
        vec4 nFault = texture2D(uNoiseAtlas, uvFault + (nMacro.gb - 0.5) * 0.28);

        // 3. 3D Ash Crumble Dissolve (after heat cools to 0, erode in place without shrinking!)
        float crumbleVal = nMacro.b * 0.55 + nFault.g * 0.45;
        if (crumbleVal < dissolveProgress) discard;

        // 4. 4-Band Derivative-Flat Basalt Cel Shading (high-contrast volcanic stone plates)
        float facetLift = 0.65 + 0.35 * ndv;
        float rockScore = clamp(ndl * 0.76 * facetLift + (nMacro.g - 0.5) * 0.16, 0.0, 1.0);
        vec3 rockCol = uColorChar;
        rockCol = mix(rockCol, uColorRockDark, step(0.26, rockScore));
        rockCol = mix(rockCol, uColorRockMid, step(0.50, rockScore));
        rockCol = mix(rockCol, uColorRockLit, step(0.74, rockScore));

        // 5. Tectonic Magma Fissures (cools down to 0 first so orange veins turn into dark charcoal stone!)
        //    When in-flight (heat > 1.35), keep ~55% craggy dark volcanic basalt plates in high contrast
        //    against blazing white-hot/solar-orange magma fissures and a super-heated leading edge!
        float inFlightFire = smoothstep(1.30, 1.75, heat);
        float ramGlow = smoothstep(0.05, 0.75, -vLocalPos.y);
        float basalGlow = isSlab * smoothstep(0.42, -0.15, vLocalPos.y);
        float tectonicGate = smoothstep(0.38, 0.74, nMacro.b + vCavity * 0.75 + basalGlow * 0.75 + inFlightFire * 0.22);
        float seamLine = smoothstep(0.56 - inFlightFire * 0.14, 0.86, nFault.r) * tectonicGate;
        float cavityMagma = smoothstep(0.40 - inFlightFire * 0.12, 0.82, vCavity) * smoothstep(0.28, 0.75, nFault.b);
        float bowShock = inFlightFire * ramGlow * smoothstep(0.32, 0.68, nMacro.b + vCavity * 0.5);
        float magmaMask = clamp(
          (seamLine * 0.95 + cavityMagma * 0.85 + basalGlow * 0.68 + bowShock * 0.85) * clamp(heat, 0.0, 1.45),
          0.0,
          1.0
        );

        vec3 magmaCol = mix(uColorCrackDeep, uColorCrack * 1.15, smoothstep(0.18, 0.52, magmaMask));
        magmaCol = mix(magmaCol, uColorHot * 1.30, smoothstep(0.58, 0.88, magmaMask));

        vec3 finalColor = mix(rockCol * mix(0.86, 1.0, uDaylight), magmaCol, smoothstep(0.22, 0.48, magmaMask));

        // 6. Glowing Ember Orange Ash Edge (0.06-wide border right next to dissolveProgress)
        float ashEdge = step(0.001, dissolveProgress) * (1.0 - smoothstep(dissolveProgress, dissolveProgress + 0.06, crumbleVal));
        finalColor = mix(finalColor, uColorCrack * 1.35, ashEdge);

        // 7. Crisp Dark Charred Ink Silhouette Rim so the jagged rock facets pop against the sky and fire
        float inkRim = 1.0 - smoothstep(0.14, 0.24, ndv);
        finalColor = mix(finalColor, uColorInk, inkRim * (1.0 - max(magmaMask * 0.55, ashEdge)));

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

function createFireWakeCutoutMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'CinderFallFireWakeCutoutMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uColorFlameEdge: { value: new THREE.Color(config.colorFlameEdge) },
      uColorFlameMid: { value: new THREE.Color(config.colorFlameMid) },
      uColorFlameCore: { value: new THREE.Color(config.colorFlameCore) },
      uColorFlameSmoke: { value: new THREE.Color(config.colorFlameSmoke) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aWakeMeta; // x: age01, y: heat, z: seed, w: intensity
      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vMeta = aWakeMeta;

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
      uniform vec3 uColorFlameEdge;
      uniform vec3 uColorFlameMid;
      uniform vec3 uColorFlameCore;
      uniform vec3 uColorFlameSmoke;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        float age = clamp(vMeta.x, 0.0, 1.0);
        float heat = vMeta.y;
        float seed = vMeta.z;
        float intensity = vMeta.w;
        if (intensity <= 0.01 || age >= 1.0) discard;

        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = clamp(dot(N, V), 0.0, 1.0);

        float isCometWake = smoothstep(1.35, 1.65, heat);

        // Longitudinal high-speed flame streaks scrolling from the rock head (vUv.y = 0) to the tail tip (vUv.y = 1)
        vec2 scrollUv = vec2(
          vUv.x * (1.15 + isCometWake * 1.10) + seed * 0.37,
          vUv.y * (0.95 - isCometWake * 0.25) - uTime * (2.4 + isCometWake * 2.2) + seed * 0.71
        );
        vec4 n0 = texture2D(uNoiseAtlas, scrollUv);
        vec4 n1 = texture2D(uNoiseAtlas, scrollUv * 1.85 + vec2(0.29, -uTime * (1.5 + isCometWake * 1.6)));

        float tongueWave = n0.b * 0.62 + n1.g * 0.38;
        float tipErode = smoothstep(1.0, 0.12, vUv.y) * 0.80 + 0.22;
        float erodedMask = (tongueWave * 0.68 + max(ndv, isCometWake * 0.62) * 0.48) * tipErode * (1.0 - age * 0.35) * intensity;

        if (erodedMask < 0.45) discard;

        // Continuous temperature gradient along the comet tail: white-gold at rock base (vUv.y = 0) -> orange -> crimson tip (vUv.y = 1)
        float fireBand = (erodedMask - 0.45) / 0.55 + heat * 0.22 * pow(1.0 - vUv.y, 1.25);
        vec3 col = uColorFlameEdge;
        col = mix(col, uColorFlameMid, step(0.24, fireBand));
        col = mix(col, uColorFlameCore * 1.22, step(0.58, fireBand));

        float inkBorder = 1.0 - smoothstep(0.45, 0.52, erodedMask);
        float silhouetteInk = 1.0 - smoothstep(0.14, 0.24, ndv);
        float smokeEdge = max(inkBorder, silhouetteInk * 0.85) * mix(1.0, smoothstep(0.25, 0.85, vUv.y) * 0.55, isCometWake);
        col = mix(col, uColorFlameSmoke, smokeEdge);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createCraterDecalMaterial(noiseAtlas, sharedUniforms, config) {
  return new THREE.ShaderMaterial({
    name: 'CinderFallCraterDecalMaterial',
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
      uColorChar: { value: new THREE.Color(config.colorChar) },
      uColorRockDark: { value: new THREE.Color(config.colorRockDark) },
      uColorRockMid: { value: new THREE.Color(config.colorRockMid) },
      uColorCrackDeep: { value: new THREE.Color(config.colorCrackDeep) },
      uColorCrack: { value: new THREE.Color(config.colorCrack) },
      uColorHot: { value: new THREE.Color(config.colorHot) },
      uColorInk: { value: new THREE.Color(config.colorInk) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aDecalMeta; // x: age01, y: reach, z: seed, w: heat
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
      uniform vec3 uColorChar;
      uniform vec3 uColorRockDark;
      uniform vec3 uColorRockMid;
      uniform vec3 uColorCrackDeep;
      uniform vec3 uColorCrack;
      uniform vec3 uColorHot;
      uniform vec3 uColorInk;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying vec3 vWorldPos;

      float slagHeightAt(vec2 q) {
        vec4 n0 = texture2D(uNoiseAtlas, q * 0.12);
        vec4 n1 = texture2D(uNoiseAtlas, q * 0.31 + vec2(0.41, 0.19));
        return n0.b * 0.65 + n1.g * 0.35;
      }

      void main() {
        float age = clamp(vMeta.x, 0.0, 1.0);
        float reach = vMeta.y;
        float seed = vMeta.z;
        float heat = vMeta.w;
        if (reach <= 0.01 || age >= 1.0) discard;

        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p) / max(0.15, reach);
        float ang = atan(p.y, p.x);

        vec2 wPos = vWorldPos.xz;
        vec4 n0 = texture2D(uNoiseAtlas, wPos * 0.14 + vec2(seed * 0.37, seed * 0.61));
        vec4 n1 = texture2D(uNoiseAtlas, wPos * 0.32 + vec2(0.23, 0.51));

        float armWave = cos(ang * 8.0 + (n0.b - 0.5) * 2.6 + r * 1.4);
        float armMask = smoothstep(0.54, 0.94, armWave) * smoothstep(1.06, 0.20, r);
        float basinLobes = 0.78 + (n0.b - 0.5) * 0.24 + (n1.g - 0.5) * 0.12;
        float basinMask = smoothstep(basinLobes, basinLobes - 0.28, r);

        float fadeOut = 1.0 - smoothstep(0.70, 1.0, age);
        float totalMask = max(basinMask * 0.92, armMask * 0.96) * fadeOut;

        if (totalMask < 0.45) discard;

        float e = 0.18;
        float h  = slagHeightAt(wPos);
        float hx = slagHeightAt(wPos + vec2(e, 0.0));
        float hy = slagHeightAt(wPos + vec2(0.0, e));
        vec3 nrm = normalize(vec3((h - hx) / e * 0.42, 1.0, (h - hy) / e * 0.42));
        vec3 lightDir = normalize(vec3(uSunDir.x, max(0.38, uSunDir.y), uSunDir.z));
        float lambert = clamp(dot(nrm, lightDir), 0.0, 1.0);

        vec3 rockBase = mix(uColorChar, uColorRockDark, step(0.38, lambert * 0.7 + h * 0.3));
        rockBase = mix(rockBase, uColorRockMid, step(0.68, lambert * 0.7 + h * 0.3));

        float centralRing = smoothstep(0.38, 0.22, abs(r - 0.24 + (n0.b - 0.5) * 0.10));
        float riftLine = smoothstep(0.76, 0.94, armWave) * smoothstep(0.95, 0.14, r);
        float concentricRing = smoothstep(0.055, 0.0, abs(r - 0.54 + (n0.b - 0.5) * 0.07));
        float vorFault = smoothstep(0.74, 0.92, n1.r) * smoothstep(0.65, 0.15, r);
        float lavaFactor = clamp((max(riftLine, vorFault * 0.85) + centralRing * 0.72 + concentricRing * 0.78) * min(1.05, heat), 0.0, 1.0);

        vec3 lavaCol = uColorCrackDeep;
        lavaCol = mix(lavaCol, uColorCrack * 1.06, step(0.42, lavaFactor));
        lavaCol = mix(lavaCol, uColorHot * 1.18, step(0.76, lavaFactor));
        vec3 col = mix(rockBase * mix(0.84, 0.98, uDaylight), lavaCol, step(0.28, lavaFactor));

        float border = 1.0 - smoothstep(0.45, 0.53, totalMask);
        col = mix(col, uColorInk, border * (1.0 - step(0.28, lavaFactor) * 0.5));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. Pooled, Deterministic CinderFallSystem (<= 4 Draw Calls)               */
/* ------------------------------------------------------------------------- */

const MAX_ASTEROID_CORES = 20; // Supports up to 5 overlapping sky-barrage meteors + 4 shattered boulder fragments each!
const MAX_FIRE_TONGUES = 140; // Wake plumes (in-flight) + roaring crater eruption fire tongues across overlapping meteors
const MAX_CRATER_ROCKS = 140; // Crater rim basalt monoliths + ballistic cinder chunks across overlapping meteors
const MAX_CRATER_DECALS = 6;

const BALLISTIC_GRAVITY = -22.0;
const BALLISTIC_RESTITUTION = 0.32;

const _dummy = new THREE.Object3D();
const _pos = new THREE.Vector3();
const _nextPos = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _bounceState = { y: 0, horizT: 0, spinT: 0 };

export class CinderFallSystem {
  constructor({
    scene,
    getGroundHeight = () => 0,
    config = {},
    onApexImpact = null,
  } = {}) {
    this.scene = scene || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.config = { ...CINDER_FALL_DEFAULTS, ...config };
    this.onApexImpact = onApexImpact;

    this.noiseAtlas = getSharedNoiseAtlas();

    this.sharedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
    };

    this.group = new THREE.Group();
    this.group.name = 'CinderFallVfxRoot';
    this.group.visible = false;
    if (this.scene) {
      this.scene.add(this.group);
    }

    this.origin = new THREE.Vector3(0, 0, 0);
    this.direction = new THREE.Vector3(1, 0, 0);
    this.side = new THREE.Vector3(0, 0, 1);
    this.castLength = this.config.range;
    this.fromSky = false;
    this.skyStartHeight = 15.0;
    this.skyBarrageList = [];
    this.active = false;
    this.age = 0;

    this._shakeOffset = new THREE.Vector3();
    this._hitstopScale = 1.0;

    this._buildMeshes();
    this._seedRecords(1.0);
  }

  _buildMeshes() {
    const c = this.config;

    this.basaltMat = createBasaltMagmaMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.fireWakeMat = createFireWakeCutoutMaterial(this.noiseAtlas, this.sharedUniforms, c);
    this.craterDecalMat = createCraterDecalMaterial(this.noiseAtlas, this.sharedUniforms, c);

    // DC 1: Angular Chiseled Volcanic Basalt-Magma Asteroid (1 in-flight -> 4 shattered boulder fragments on impact)
    const asteroidGeo = createVolcanicAsteroidGeometry({
      subdivisions: 1,
      cuts: 11,
      cutDepth: 0.34,
      craters: 6,
      craterDepth: 0.22,
    });
    this.asteroidMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_ASTEROID_CORES * 4),
      4
    );
    asteroidGeo.setAttribute('aInstanceMeta', this.asteroidMetaAttr);
    this.asteroidMesh = new THREE.InstancedMesh(asteroidGeo, this.basaltMat, MAX_ASTEROID_CORES);
    this.asteroidMesh.name = 'CinderFall_DC1_BasaltAsteroid';
    this.asteroidMesh.frustumCulled = false;
    this.asteroidMesh.count = 0;
    this.group.add(this.asteroidMesh);

    // DC 2: Hard-Cutout Cel Fire-Tongue Wake & Crater Plumes
    const flameHullGeo = createFlameTongueHullGeometry({ rings: 10, sides: 8 });
    this.wakeMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_FIRE_TONGUES * 4),
      4
    );
    flameHullGeo.setAttribute('aWakeMeta', this.wakeMetaAttr);
    this.fireWakeMesh = new THREE.InstancedMesh(flameHullGeo, this.fireWakeMat, MAX_FIRE_TONGUES);
    this.fireWakeMesh.name = 'CinderFall_DC2_FireTongueWake';
    this.fireWakeMesh.frustumCulled = false;
    this.fireWakeMesh.count = 0;
    this.group.add(this.fireWakeMesh);

    // DC 3: 16 Tilted Crater Rim Basalt Monoliths + 24 Ballistic Cinder Rocks
    const slabGeo = createGlacierCrystalGeometry({
      seed: 41.9,
      sides: 7,
      taper: 0.68,
      roughness: 0.16,
      bend: 0.38,
    });
    const posCount = slabGeo.attributes.position.count;
    const cavArr = new Float32Array(posCount);
    for (let i = 0; i < posCount; i++) {
      const py = slabGeo.attributes.position.getY(i);
      cavArr[i] = clamp(1.0 - Math.max(0.0, py) * 1.25, 0.0, 1.0) * 0.72;
    }
    slabGeo.setAttribute('aCavity', new THREE.BufferAttribute(cavArr, 1));
    this.rocksMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_CRATER_ROCKS * 4),
      4
    );
    slabGeo.setAttribute('aInstanceMeta', this.rocksMetaAttr);
    this.craterRocksMesh = new THREE.InstancedMesh(slabGeo, this.basaltMat, MAX_CRATER_ROCKS);
    this.craterRocksMesh.name = 'CinderFall_DC3_CraterSlabsAndCinders';
    this.craterRocksMesh.frustumCulled = false;
    this.craterRocksMesh.count = 0;
    this.group.add(this.craterRocksMesh);

    // DC 4: Wide 3D-Relieved Volcanic Slag & Lava-Rift Crater Decal
    const decalGeo = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    this.decalMetaAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_CRATER_DECALS * 4),
      4
    );
    decalGeo.setAttribute('aDecalMeta', this.decalMetaAttr);
    this.craterDecalMesh = new THREE.InstancedMesh(decalGeo, this.craterDecalMat, MAX_CRATER_DECALS);
    this.craterDecalMesh.name = 'CinderFall_DC4_LavaVeinCraterDecal';
    this.craterDecalMesh.frustumCulled = false;
    this.craterDecalMesh.count = 0;
    this.group.add(this.craterDecalMesh);
  }

  _trajectoryAt(u, out) {
    const c = this.config;
    const t = clamp(u, 0.0, 1.0);
    const targetDist = clamp(
      this.castLength ?? c.length ?? c.range ?? 14.0,
      c.minDistance ?? 3.0,
      c.maxDistance ?? 16.0
    );
    const dist = lerp(this.fromSky ? 0.0 : c.handForward, targetDist, t);
    const x = this.origin.x + this.direction.x * dist;
    const z = this.origin.z + this.direction.z * dist;
    if (this.fromSky) {
      const endGroundY = this.getGroundHeight(x, z) + c.endHeight;
      const skyY = endGroundY + (this.skyStartHeight || 13.5) * (1.0 - t);
      out.set(x, skyY, z);
      return out;
    }
    const baseH = lerp(
      this.origin.y + c.handHeight,
      this.getGroundHeight(x, z) + c.endHeight,
      t
    );
    const arcLift = Math.pow(Math.max(0.0, Math.sin(t * Math.PI)), c.arcCurve) * c.arc;
    out.set(x, baseH + arcLift, z);
    return out;
  }

  _seedRecords(seed = 1.0) {
    const c = this.config;
    this.impactTime = this.fromSky
      ? 0.24
      : this.castLength / Math.max(1.0, c.speed); // ~0.622s for 14m at 22.5 m/s
    this.totalDuration = this.impactTime + c.lifetime + c.fadeTime;

    // 4 Jagged Shattered Boulder Fragments (`asteroidMesh` slots 0..3, scale `0.48..0.64m`)
    // Routed around the rear/flanks of the crater so Skeleton_Warrior is never blocked from the front camera!
    const boulderAngles = [-2.28, -0.78, 2.08, 2.82];
    const boulderScales = [0.64, 0.59, 0.54, 0.48];
    const boulderVys = [4.6, 5.5, 6.4, 7.6]; // vy in 4.2..8.5 m/s
    const boulderSpeeds = [2.6, 3.1, 3.4, 3.9];
    this.shatteredBoulderRecords = [];
    for (let b = 0; b < MAX_ASTEROID_CORES; b++) {
      const s = seed * 11.3 + b * 23.7;
      const ang = boulderAngles[b];
      const spd = boulderSpeeds[b];
      this.shatteredBoulderRecords.push({
        seed: 2.1 + b * 1.9,
        ang,
        startOffsetX: Math.cos(ang) * 0.55,
        startOffsetZ: Math.sin(ang) * 0.55,
        vx: Math.cos(ang) * spd,
        vz: Math.sin(ang) * spd,
        vy: boulderVys[b],
        scale: boulderScales[b],
        stagger: b * 0.035,
        spinX: signedHash(s + 1.1) * 4.8,
        spinY: signedHash(s + 2.3) * 4.8,
        spinZ: signedHash(s + 3.7) * 4.8,
      });
    }

    this.rimSlabRecords = [];
    for (let i = 0; i < c.rimSlabCount; i++) {
      const s = seed * 19.7 + i * 29.3;
      const ang = (i / c.rimSlabCount) * TAU + signedHash(s + 1.1) * 0.14;
      const isFrontWindow = ang > 0.30 && ang < 2.45;
      this.rimSlabRecords.push({
        seed: hash11(s + 2.3) * 10.0,
        ang,
        radial: c.craterRadius * (0.66 + 0.32 * hash11(s + 3.7)),
        height: (isFrontWindow ? 0.78 : 2.15) * (0.80 + 0.45 * hash11(s + 5.1)),
        radius: (isFrontWindow ? 0.44 : 0.64) + 0.28 * hash11(s + 6.9),
        lean: 0.42 + 0.26 * hash11(s + 8.3),
        stagger: hash11(s + 9.7) * 0.05,
        dissolveStagger: (hash11(s + 11.3) - 0.5) * 0.12,
      });
    }

    this.cinderRockRecords = [];
    for (let i = 0; i < c.cinderRockCount; i++) {
      const s = seed * 41.3 + i * 17.9;
      const rawU = i / c.cinderRockCount;
      const ang = lerp(2.40, TAU + 0.30, rawU) + signedHash(s + 1.3) * 0.15;
      const speed = 4.2 + 4.4 * hash11(s + 2.9);
      this.cinderRockRecords.push({
        seed: hash11(s + 4.1) * 10.0,
        ang,
        vx: Math.cos(ang) * speed,
        vz: Math.sin(ang) * speed,
        vy: 4.2 + 4.3 * hash11(s + 5.7), // vy = 4.2..8.5 m/s as specified
        size: 0.22 + 0.16 * hash11(s + 7.3),
        dissolveStagger: (hash11(s + 8.1) - 0.5) * 0.14,
        spinX: signedHash(s + 8.9) * 7.0,
        spinY: signedHash(s + 10.1) * 7.0,
        spinZ: signedHash(s + 11.7) * 7.0,
      });
    }

    this.fireTongueRecords = [];
    for (let i = 0; i < MAX_FIRE_TONGUES; i++) {
      const s = seed * 59.1 + i * 23.7;
      const isWake = i < 14;
      this.fireTongueRecords.push({
        isWake,
        seed: hash11(s + 1.7) * 10.0,
        uOffset: isWake ? i / 14 : (i - 14) / Math.max(1, MAX_FIRE_TONGUES - 14),
        ang: (i / MAX_FIRE_TONGUES) * TAU * 2.0 + signedHash(s + 3.1) * 0.35,
        radial: 0.25 + 0.75 * hash11(s + 4.9),
        scale: 0.72 + 0.65 * hash11(s + 6.3),
      });
    }
  }

  cast(origin, direction, options = {}) {
    this.fromSky = Boolean(options.fromSky || options.skyFall);
    this.skyStartHeight = Number(options.skyHeight) > 0 ? Number(options.skyHeight) : 15.0;

    if (origin) {
      this.origin.set(origin.x ?? origin[0] ?? 0, origin.y ?? origin[1] ?? 0, origin.z ?? origin[2] ?? 0);
    }
    if (direction) {
      const dx = direction.x ?? direction[0] ?? 1;
      const dz = direction.z ?? direction[2] ?? 0;
      const len = Math.hypot(dx, dz) || 1;
      this.direction.set(dx / len, 0, dz / len);
    }
    this.side.set(-this.direction.z, 0, this.direction.x);
    const c = this.config;
    const rawDist =
      options.distance ??
      options.aimDistance ??
      options.range ??
      options.length ??
      c.length ??
      c.range;
    this.castLength = clamp(rawDist, c.minDistance ?? 3.0, c.maxDistance ?? 16.0);
    if (
      this.fromSky &&
      options.targetPos &&
      Number.isFinite(options.targetPos.x) &&
      Number.isFinite(options.targetPos.z)
    ) {
      this.origin.x = options.targetPos.x - this.direction.x * this.castLength;
      this.origin.z = options.targetPos.z - this.direction.z * this.castLength;
    }
    this.origin.y = this.getGroundHeight(this.origin.x, this.origin.z);

    if (this.fromSky) {
      const seedVal = options.seed ?? 1.0 + this.skyBarrageList.length * 0.73;
      const impactTime = 0.32;
      const postDuration = 0.88;
      if (this.skyBarrageList.length >= 6) {
        this.skyBarrageList.shift();
      }
      this.skyBarrageList.push({
        originX: this.origin.x,
        originY: this.origin.y,
        originZ: this.origin.z,
        dirX: this.direction.x,
        dirZ: this.direction.z,
        sideX: this.side.x,
        sideZ: this.side.z,
        castLength: this.castLength,
        skyStartHeight: this.skyStartHeight,
        age: Number(options.initialAge) || 0.0,
        impactTime,
        postDuration,
        totalDuration: impactTime + postDuration,
        seed: seedVal,
      });
      this.active = true;
      this.age = 0;
      this.group.visible = true;
      this._renderSkyBarrage();
      return this;
    }

    this.skyBarrageList.length = 0;
    this._seedRecords(options.seed ?? 1.0);
    this.active = true;
    this.age = 0;
    this.group.visible = true;
    this.seek(0.01);
    return this;
  }

  _renderSkyBarrage() {
    const c = this.config;
    let astSlot = 0;
    let wakeSlot = 0;
    let rockSlot = 0;
    let decalSlot = 0;
    let maxShakeEnv = 0;
    let maxShakeAge = 0;

    for (let mIdx = 0; mIdx < this.skyBarrageList.length; mIdx++) {
      const m = this.skyBarrageList[mIdx];
      const timeSeconds = m.age;
      if (timeSeconds < 0) continue;
      const flightU = saturate(timeSeconds / Math.max(0.05, m.impactTime));
      const impactElapsed = timeSeconds - m.impactTime;
      const postImpactU = saturate(impactElapsed / Math.max(0.1, m.postDuration));

      const impX = m.originX + m.dirX * m.castLength;
      const impZ = m.originZ + m.dirZ * m.castLength;
      const impY = this.getGroundHeight(impX, impZ);

      const evalBarragePos = (u, out) => {
        const t = clamp(u, 0.0, 1.0);
        const dist = m.castLength * t;
        const x = m.originX + m.dirX * dist;
        const z = m.originZ + m.dirZ * dist;
        const endGroundY = this.getGroundHeight(x, z) + c.endHeight;
        const skyY = endGroundY + m.skyStartHeight * (1.0 - t);
        out.set(x, skyY, z);
        return out;
      };

      const popIn = smoothstep(0.0, 0.08, flightU);

      // 1. Asteroid Core in flight (molten fireball heat = 1.85) OR 3 shattered boulders on impact
      if (impactElapsed < 0) {
        if (astSlot < MAX_ASTEROID_CORES) {
          evalBarragePos(flightU, _pos);
          _dummy.position.copy(_pos);
          _euler.set(timeSeconds * c.spin, timeSeconds * c.spin * 0.78, timeSeconds * c.spin * 0.52);
          _dummy.quaternion.setFromEuler(_euler);
          _dummy.scale.setScalar(c.radius * 0.88 * popIn);
          _dummy.updateMatrix();
          this.asteroidMesh.setMatrixAt(astSlot, _dummy.matrix);
          this.asteroidMetaAttr.setXYZW(astSlot, m.seed, 1.85, 0.0, 0.0);
          astSlot++;
        }
      } else {
        for (let b = 0; b < 3 && astSlot < MAX_ASTEROID_CORES; b++) {
          const bRec = this.shatteredBoulderRecords[b];
          const dissolveProgress = smoothstep(0.38, 0.96, postImpactU + bRec.stagger);
          if (dissolveProgress >= 0.995) continue;
          const rockHeat = 1.22 * (1.0 - smoothstep(0.08, 0.45, postImpactU + bRec.stagger));
          const approxX = impX + bRec.startOffsetX + bRec.vx * 0.42;
          const approxZ = impZ + bRec.startOffsetZ + bRec.vz * 0.42;
          const floorY = this.getGroundHeight(approxX, approxZ) + bRec.scale * 0.44;
          evalOneBounceBallistic(
            impactElapsed,
            impY + 0.58,
            bRec.vy,
            BALLISTIC_GRAVITY,
            BALLISTIC_RESTITUTION,
            floorY,
            _bounceState
          );
          _dummy.position.set(
            impX + bRec.startOffsetX + bRec.vx * _bounceState.horizT,
            _bounceState.y,
            impZ + bRec.startOffsetZ + bRec.vz * _bounceState.horizT
          );
          _euler.set(
            0.4 + bRec.spinX * _bounceState.spinT,
            bRec.ang + m.seed + bRec.spinY * _bounceState.spinT,
            0.25 + bRec.spinZ * _bounceState.spinT
          );
          _dummy.quaternion.setFromEuler(_euler);
          _dummy.scale.set(bRec.scale * 0.95, bRec.scale * 0.85, bRec.scale * 0.95);
          _dummy.updateMatrix();
          this.asteroidMesh.setMatrixAt(astSlot, _dummy.matrix);
          this.asteroidMetaAttr.setXYZW(astSlot, bRec.seed + m.seed, rockHeat, dissolveProgress, 0.0);
          astSlot++;
        }
      }

      // 2. Coaxial Full-Length Comet Plumes (in flight ONLY, rooted behind the exposed rock head) & Crater Eruption Plumes (post-impact)
      if (impactElapsed < 0) {
        evalBarragePos(flightU, _pos);
        evalBarragePos(Math.max(0.0, flightU - 0.08), _nextPos);
        _tangent.subVectors(_nextPos, _pos);
        if (_tangent.lengthSq() < 1e-5) _tangent.set(-m.dirX, 0.72, -m.dirZ);
        _tangent.normalize();
        _quat.setFromUnitVectors(UP, _tangent);

        for (let i = 0; i < 5 && wakeSlot < MAX_FIRE_TONGUES; i++) {
          const rec = this.fireTongueRecords[i];
          const isCorePlume = i === 0;
          const behindDist = (isCorePlume ? 0.14 : 0.22 + (i - 1) * 0.14) * popIn;
          const wx = _pos.x + _tangent.x * behindDist;
          const wy = _pos.y + _tangent.y * behindDist;
          const wz = _pos.z + _tangent.z * behindDist;

          _dummy.position.set(wx, wy, wz);
          _euler.set(0, i * (Math.PI * 0.5) + timeSeconds * 3.2 + m.seed, 0);
          _dummy.quaternion.setFromEuler(_euler);
          _dummy.quaternion.premultiply(_quat);

          const widthScale = (isCorePlume ? 1.05 : 1.22 - (i - 1) * 0.08) * popIn;
          const lenScale = (isCorePlume ? 3.25 : 4.35 + (i - 1) * 0.35) * popIn;
          _dummy.scale.set(widthScale, lenScale, widthScale);
          _dummy.updateMatrix();
          this.fireWakeMesh.setMatrixAt(wakeSlot, _dummy.matrix);
          this.wakeMetaAttr.setXYZW(
            wakeSlot,
            isCorePlume ? 0.04 : 0.16 + (i - 1) * 0.06,
            isCorePlume ? 1.95 : 1.68,
            rec.seed + m.seed,
            1.0
          );
          wakeSlot++;
        }
      } else if (postImpactU < 0.85) {
        for (let i = 14; i < 24 && wakeSlot < MAX_FIRE_TONGUES; i++) {
          const rec = this.fireTongueRecords[i];
          const tCol = Math.max(0.01, impactElapsed + 0.02);
          const colFade = 1.0 - smoothstep(0.32, 0.85, postImpactU);
          const horseshoeAng = rec.ang + m.seed;
          const rDist = (0.95 + rec.radial * 1.15) * smoothstep(0.0, 0.14, tCol);
          const fx = impX + Math.cos(horseshoeAng) * rDist;
          const fz = impZ + Math.sin(horseshoeAng) * rDist;
          const fy = this.getGroundHeight(fx, fz) + 0.05;
          _dummy.position.set(fx, fy, fz);
          _pos.set(Math.cos(horseshoeAng) * 0.32, 1.0, Math.sin(horseshoeAng) * 0.32).normalize();
          _dummy.quaternion.setFromUnitVectors(UP, _pos);
          const hScale = rec.scale * (1.45 + 0.85 * (1.0 - rec.radial)) * outQuint(Math.min(1.0, tCol * 5.2)) * colFade;
          const rScale = rec.scale * 0.75 * colFade;
          _dummy.scale.set(rScale, hScale, rScale);
          _dummy.updateMatrix();
          this.fireWakeMesh.setMatrixAt(wakeSlot, _dummy.matrix);
          this.wakeMetaAttr.setXYZW(wakeSlot, postImpactU * 0.82, 1.18, rec.seed + m.seed, colFade);
          wakeSlot++;
        }
      }

      // 3. Crater Rim Monoliths & Ballistic Cinders on Impact
      if (impactElapsed >= -0.01) {
        const tImp = Math.max(0.0, impactElapsed + 0.01);
        for (let i = 0; i < 8 && rockSlot < MAX_CRATER_ROCKS; i++) {
          const slab = this.rimSlabRecords[i * 2];
          if (!slab) continue;
          const tSlab = tImp - slab.stagger;
          if (tSlab < 0) continue;
          const dissolveProgress = smoothstep(0.38, 0.95, postImpactU + slab.dissolveStagger);
          if (dissolveProgress >= 0.995) continue;
          const slabHeat = 1.24 * (1.0 - smoothstep(0.10, 0.48, postImpactU + slab.dissolveStagger));
          const emerge = outQuint(Math.min(1.0, tSlab / 0.12));
          const ang = slab.ang + m.seed;
          const sx = impX + Math.cos(ang) * slab.radial * 0.78;
          const sz = impZ + Math.sin(ang) * slab.radial * 0.78;
          const sy = this.getGroundHeight(sx, sz) - 0.14;
          _dummy.position.set(sx, sy, sz);
          _pos.set(
            Math.cos(ang) * Math.sin(slab.lean),
            Math.cos(slab.lean),
            Math.sin(ang) * Math.sin(slab.lean)
          ).normalize();
          _dummy.quaternion.setFromUnitVectors(UP, _pos);
          _dummy.scale.set(slab.radius * 0.78 * emerge, slab.height * 0.72 * emerge, slab.radius * 0.78 * emerge);
          _dummy.updateMatrix();
          this.craterRocksMesh.setMatrixAt(rockSlot, _dummy.matrix);
          this.rocksMetaAttr.setXYZW(rockSlot, slab.seed + m.seed, slabHeat, dissolveProgress, 1.0);
          rockSlot++;
        }

        for (let i = 0; i < 10 && rockSlot < MAX_CRATER_ROCKS; i++) {
          const cin = this.cinderRockRecords[i * 2];
          if (!cin) continue;
          const dissolveProgress = smoothstep(0.38, 0.95, postImpactU + cin.dissolveStagger);
          if (dissolveProgress >= 0.995) continue;
          const cinHeat = 1.15 * (1.0 - smoothstep(0.08, 0.42, postImpactU + cin.dissolveStagger));
          const approxX = impX + cin.vx * 0.38;
          const approxZ = impZ + cin.vz * 0.38;
          const floorY = this.getGroundHeight(approxX, approxZ) + cin.size * 0.40;
          evalOneBounceBallistic(
            tImp,
            impY + 0.44,
            cin.vy,
            BALLISTIC_GRAVITY,
            BALLISTIC_RESTITUTION,
            floorY,
            _bounceState
          );
          _dummy.position.set(
            impX + cin.vx * _bounceState.horizT * 0.85,
            _bounceState.y,
            impZ + cin.vz * _bounceState.horizT * 0.85
          );
          _euler.set(
            cin.spinX * _bounceState.spinT,
            cin.ang + m.seed + cin.spinY * _bounceState.spinT,
            cin.spinZ * _bounceState.spinT
          );
          _dummy.quaternion.setFromEuler(_euler);
          const sc = cin.size * 0.88;
          _dummy.scale.set(sc * 0.95, sc * 1.35, sc * 0.95);
          _dummy.updateMatrix();
          this.craterRocksMesh.setMatrixAt(rockSlot, _dummy.matrix);
          this.rocksMetaAttr.setXYZW(rockSlot, cin.seed + m.seed, cinHeat, dissolveProgress, 0.4);
          rockSlot++;
        }
      }

      // 4. Crater Lava Decal on Ground
      if (impactElapsed >= -0.02 && decalSlot < MAX_CRATER_DECALS) {
        const tCrater = Math.max(0.01, impactElapsed + 0.02);
        const reach = smoothstep(0.0, 0.14, tCrater);
        const decalHeat = 1.22 * (1.0 - smoothstep(0.30, 0.85, postImpactU));
        const castYaw = Math.atan2(m.dirX, m.dirZ) + m.seed * 0.5;
        _dummy.position.set(impX, impY + 0.042 + decalSlot * 0.003, impZ);
        _dummy.quaternion.setFromAxisAngle(UP, castYaw);
        const fRad = c.fissureRadius * 0.72;
        _dummy.scale.set(fRad, 1.0, fRad);
        _dummy.updateMatrix();
        this.craterDecalMesh.setMatrixAt(decalSlot, _dummy.matrix);
        this.decalMetaAttr.setXYZW(decalSlot, postImpactU, reach, 0.49, decalHeat);
        decalSlot++;
      }

      if (impactElapsed >= 0 && impactElapsed <= 0.35) {
        const env = Math.exp(-impactElapsed * 7.5) * 0.14;
        if (env > maxShakeEnv) {
          maxShakeEnv = env;
          maxShakeAge = impactElapsed;
        }
      }
    }

    this.asteroidMesh.count = astSlot;
    this.asteroidMesh.instanceMatrix.needsUpdate = true;
    this.asteroidMetaAttr.needsUpdate = true;

    this.fireWakeMesh.count = wakeSlot;
    this.fireWakeMesh.instanceMatrix.needsUpdate = true;
    this.wakeMetaAttr.needsUpdate = true;

    this.craterRocksMesh.count = rockSlot;
    this.craterRocksMesh.instanceMatrix.needsUpdate = true;
    this.rocksMetaAttr.needsUpdate = true;

    this.craterDecalMesh.count = decalSlot;
    this.craterDecalMesh.instanceMatrix.needsUpdate = true;
    this.decalMetaAttr.needsUpdate = true;

    if (maxShakeEnv > 0) {
      this._shakeOffset.set(
        Math.sin(maxShakeAge * 52.0) * maxShakeEnv * 0.7,
        Math.abs(Math.cos(maxShakeAge * 60.0)) * maxShakeEnv,
        Math.cos(maxShakeAge * 46.0) * maxShakeEnv * 0.7
      );
    } else {
      this._shakeOffset.set(0, 0, 0);
    }
    this._hitstopScale = 1.0;
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
    if (timeSeconds < 0 || timeSeconds > this.totalDuration + 0.1) {
      this.clear();
      return this;
    }

    this.active = true;
    this.age = timeSeconds;
    this.group.visible = true;
    this.sharedUniforms.uTime.value = timeSeconds;

    const c = this.config;
    const flightU = saturate(timeSeconds / Math.max(0.05, this.impactTime));
    const impactElapsed = timeSeconds - this.impactTime;
    const postImpactU = saturate(impactElapsed / Math.max(0.1, c.lifetime + c.fadeTime));

    const impX = this.origin.x + this.direction.x * this.castLength;
    const impZ = this.origin.z + this.direction.z * this.castLength;
    const impY = this.getGroundHeight(impX, impZ);

    // 1. Evaluate Volcanic Asteroid (DC 1):
    //    - While `impactElapsed < 0`: slot 0 is the single hurtling 1.08m molten fireball asteroid.
    //    - Instant `impactElapsed >= 0`: shatters into 4 jagged broken boulder fragments
    //      (slots 0..3, scale 0.48..0.64m) that bounce once (`restitution = 0.32`),
    //      settle on the crater floor, cool down (`heat -> 0`), and crumble into glowing ash!
    let astSlot = 0;
    const popIn = smoothstep(0.0, 0.08, flightU);
    if (impactElapsed < 0) {
      this._trajectoryAt(flightU, _pos);
      _dummy.position.copy(_pos);
      _euler.set(timeSeconds * c.spin, timeSeconds * c.spin * 0.78, timeSeconds * c.spin * 0.52);
      _dummy.quaternion.setFromEuler(_euler);
      _dummy.scale.setScalar(c.radius * popIn);
      _dummy.updateMatrix();
      this.asteroidMesh.setMatrixAt(astSlot, _dummy.matrix);
      this.asteroidMetaAttr.setXYZW(astSlot, 1.7, 1.85, 0.0, 0.0);
      astSlot++;
    } else {
      for (let b = 0; b < this.shatteredBoulderRecords.length; b++) {
        const bRec = this.shatteredBoulderRecords[b];
        const dissolveProgress = smoothstep(0.45, 0.98, postImpactU + bRec.stagger);
        if (dissolveProgress >= 0.995) continue;

        // First cool heat down to 0 so orange magma veins turn into dark charcoal stone before crumbling!
        const rockHeat = 1.22 * (1.0 - smoothstep(0.10, 0.48, postImpactU + bRec.stagger));

        const approxX = impX + bRec.startOffsetX + bRec.vx * 0.45;
        const approxZ = impZ + bRec.startOffsetZ + bRec.vz * 0.45;
        const floorY = this.getGroundHeight(approxX, approxZ) + bRec.scale * 0.46;

        evalOneBounceBallistic(
          impactElapsed,
          impY + 0.62,
          bRec.vy,
          BALLISTIC_GRAVITY,
          BALLISTIC_RESTITUTION,
          floorY,
          _bounceState
        );

        const bx = impX + bRec.startOffsetX + bRec.vx * _bounceState.horizT;
        const bz = impZ + bRec.startOffsetZ + bRec.vz * _bounceState.horizT;
        const by = _bounceState.y;

        _dummy.position.set(bx, by, bz);
        _euler.set(
          0.4 + bRec.spinX * _bounceState.spinT,
          bRec.ang + bRec.spinY * _bounceState.spinT,
          0.25 + bRec.spinZ * _bounceState.spinT
        );
        _dummy.quaternion.setFromEuler(_euler);
        // Keep boulder fragment at 100% scale (0.48..0.64m) — NEVER shrink or sink into floor!
        _dummy.scale.set(bRec.scale * 1.08, bRec.scale * 0.92, bRec.scale * 1.04);
        _dummy.updateMatrix();
        this.asteroidMesh.setMatrixAt(astSlot, _dummy.matrix);
        this.asteroidMetaAttr.setXYZW(astSlot, bRec.seed, rockHeat, dissolveProgress, 0.0);
        astSlot++;
      }
    }
    this.asteroidMesh.count = astSlot;
    this.asteroidMesh.instanceMatrix.needsUpdate = true;
    this.asteroidMetaAttr.needsUpdate = true;

    // 2. Evaluate Coaxial Full-Length Comet Fireball Plume (In-Flight) & Crater Eruption Plumes (Post-Impact) (DC 2)
    let wakeSlot = 0;

    for (let i = 0; i < 34; i++) {
      const rec = this.fireTongueRecords[i];
      if (!rec) continue;
      if (rec.isWake && impactElapsed < 0) {
        if (i >= 5) continue;
        this._trajectoryAt(flightU, _pos);
        this._trajectoryAt(Math.max(0.0, flightU - 0.08), _nextPos);
        _tangent.subVectors(_nextPos, _pos);
        if (_tangent.lengthSq() < 1e-5) _tangent.set(-this.direction.x, 0.45, -this.direction.z);
        _tangent.normalize();
        _quat.setFromUnitVectors(UP, _tangent);

        const isCorePlume = i === 0;
        const behindDist = (isCorePlume ? 0.14 : 0.22 + (i - 1) * 0.14) * popIn;
        _pos.x += _tangent.x * behindDist;
        _pos.y += _tangent.y * behindDist;
        _pos.z += _tangent.z * behindDist;

        _dummy.position.copy(_pos);
        _euler.set(0, i * (Math.PI * 0.5) + timeSeconds * 3.2, 0);
        _dummy.quaternion.setFromEuler(_euler);
        _dummy.quaternion.premultiply(_quat);

        const widthScale = (isCorePlume ? 1.08 : 1.25 - (i - 1) * 0.08) * popIn;
        const lenScale = (isCorePlume ? 3.35 : 4.45 + (i - 1) * 0.35) * popIn;
        _dummy.scale.set(widthScale, lenScale, widthScale);
        _dummy.updateMatrix();
        this.fireWakeMesh.setMatrixAt(wakeSlot, _dummy.matrix);
        this.wakeMetaAttr.setXYZW(
          wakeSlot,
          isCorePlume ? 0.04 : 0.16 + (i - 1) * 0.06,
          isCorePlume ? 1.95 : 1.68,
          rec.seed,
          1.0
        );
        wakeSlot++;
      } else if (!rec.isWake && impactElapsed >= -0.02 && postImpactU < 0.88) {
        const tCol = Math.max(0.01, impactElapsed + 0.02);
        const colFade = 1.0 - smoothstep(0.38, 0.88, postImpactU);
        const kIdx = i - 14;
        const kSpan = kIdx / Math.max(1, 34 - 15);
        const horseshoeAng = lerp(-2.65, 0.32, kSpan);
        const rDist = (1.45 + rec.radial * 1.35) * smoothstep(0.0, 0.18, tCol);
        const fx = impX + Math.cos(horseshoeAng) * rDist;
        const fz = impZ + Math.sin(horseshoeAng) * rDist;
        const fy = this.getGroundHeight(fx, fz) + 0.05;

        _dummy.position.set(fx, fy, fz);
        _pos.set(Math.cos(horseshoeAng) * 0.34, 1.0, Math.sin(horseshoeAng) * 0.34).normalize();
        _dummy.quaternion.setFromUnitVectors(UP, _pos);
        const hScale = rec.scale * (1.75 + 1.05 * (1.0 - rec.radial)) * outQuint(Math.min(1.0, tCol * 4.8)) * colFade;
        const rScale = rec.scale * 0.88 * colFade;
        _dummy.scale.set(rScale, hScale, rScale);
        _dummy.updateMatrix();
        this.fireWakeMesh.setMatrixAt(wakeSlot, _dummy.matrix);
        this.wakeMetaAttr.setXYZW(wakeSlot, postImpactU * 0.82, 1.18, rec.seed, colFade);
        wakeSlot++;
      }
    }
    this.fireWakeMesh.count = wakeSlot;
    this.fireWakeMesh.instanceMatrix.needsUpdate = true;
    this.wakeMetaAttr.needsUpdate = true;

    // 3. Evaluate 16 Tilted Crater Rim Basalt Monoliths + 24 Ballistic Cinder Chunks (DC 3)
    //    Keep 100% scale & ground height; cool heat -> 0 and crumble via dissolveProgress!
    let rockSlot = 0;
    if (impactElapsed >= -0.01) {
      const tImp = Math.max(0.0, impactElapsed + 0.01);

      // 3a. 16 Crater Rim Basalt-and-Magma Monoliths (100% scale, zero sinking!)
      for (let i = 0; i < this.rimSlabRecords.length; i++) {
        const slab = this.rimSlabRecords[i];
        const tSlab = tImp - slab.stagger;
        if (tSlab < 0) continue;

        const dissolveProgress = smoothstep(0.45, 0.98, postImpactU + slab.dissolveStagger);
        if (dissolveProgress >= 0.995) continue;

        const slabHeat = 1.24 * (1.0 - smoothstep(0.12, 0.50, postImpactU + slab.dissolveStagger));
        const emerge = outQuint(Math.min(1.0, tSlab / 0.15));
        const sx = impX + Math.cos(slab.ang) * slab.radial;
        const sz = impZ + Math.sin(slab.ang) * slab.radial;
        const sy = this.getGroundHeight(sx, sz) - 0.16;

        _dummy.position.set(sx, sy, sz);
        _pos.set(
          Math.cos(slab.ang) * Math.sin(slab.lean),
          Math.cos(slab.lean),
          Math.sin(slab.ang) * Math.sin(slab.lean)
        ).normalize();
        _dummy.quaternion.setFromUnitVectors(UP, _pos);
        _dummy.scale.set(
          slab.radius * emerge,
          slab.height * emerge,
          slab.radius * emerge
        );
        _dummy.updateMatrix();
        this.craterRocksMesh.setMatrixAt(rockSlot, _dummy.matrix);
        this.rocksMetaAttr.setXYZW(rockSlot, slab.seed, slabHeat, dissolveProgress, 1.0);
        rockSlot++;
      }

      // 3b. 24 Ballistic Cinder Chunks (`vy = 4.2..8.5 m/s`, `gravity = -22 m/s^2`, `restitution = 0.32`)
      for (let i = 0; i < this.cinderRockRecords.length; i++) {
        const cin = this.cinderRockRecords[i];
        const dissolveProgress = smoothstep(0.45, 0.98, postImpactU + cin.dissolveStagger);
        if (dissolveProgress >= 0.995) continue;

        const cinHeat = 1.15 * (1.0 - smoothstep(0.08, 0.44, postImpactU + cin.dissolveStagger));
        const approxX = impX + cin.vx * 0.45;
        const approxZ = impZ + cin.vz * 0.45;
        const floorY = this.getGroundHeight(approxX, approxZ) + cin.size * 0.42;

        evalOneBounceBallistic(
          tImp,
          impY + 0.48,
          cin.vy,
          BALLISTIC_GRAVITY,
          BALLISTIC_RESTITUTION,
          floorY,
          _bounceState
        );

        const cx = impX + cin.vx * _bounceState.horizT;
        const cz = impZ + cin.vz * _bounceState.horizT;
        const cy = _bounceState.y;

        _dummy.position.set(cx, cy, cz);
        _euler.set(
          cin.spinX * _bounceState.spinT,
          cin.ang + cin.spinY * _bounceState.spinT,
          cin.spinZ * _bounceState.spinT
        );
        _dummy.quaternion.setFromEuler(_euler);
        const sc = cin.size;
        _dummy.scale.set(sc * 0.95, sc * 1.35, sc * 0.95);
        _dummy.updateMatrix();
        this.craterRocksMesh.setMatrixAt(rockSlot, _dummy.matrix);
        this.rocksMetaAttr.setXYZW(rockSlot, cin.seed, cinHeat, dissolveProgress, 0.4);
        rockSlot++;
      }
    }
    this.craterRocksMesh.count = rockSlot;
    this.craterRocksMesh.instanceMatrix.needsUpdate = true;
    this.rocksMetaAttr.needsUpdate = true;

    // 4. Evaluate Wide 3D Volcanic Slag & Lava-Rift Crater Decal (DC 4)
    let decalSlot = 0;
    if (impactElapsed >= -0.02) {
      const tCrater = Math.max(0.01, impactElapsed + 0.02);
      const reach = smoothstep(0.0, 0.18, tCrater);
      const decalHeat = 1.22 * (1.0 - smoothstep(0.35, 0.85, postImpactU));
      const castYaw = Math.atan2(this.direction.x, this.direction.z);
      _dummy.position.set(impX, impY + 0.042, impZ);
      _dummy.quaternion.setFromAxisAngle(UP, castYaw);
      _dummy.scale.set(c.fissureRadius, 1.0, c.fissureRadius);
      _dummy.updateMatrix();
      this.craterDecalMesh.setMatrixAt(decalSlot, _dummy.matrix);
      this.decalMetaAttr.setXYZW(decalSlot, postImpactU, reach, 0.49, decalHeat);
      decalSlot++;
    }
    this.craterDecalMesh.count = decalSlot;
    this.craterDecalMesh.instanceMatrix.needsUpdate = true;
    this.decalMetaAttr.needsUpdate = true;

    // Hitstop & Camera Shake
    this._hitstopScale = Math.abs(timeSeconds - this.impactTime) <= 0.04 ? 0.05 : 1.0;
    if (impactElapsed >= 0 && impactElapsed <= 0.65) {
      const env = Math.exp(-impactElapsed * 5.8) * 0.22;
      this._shakeOffset.set(
        Math.sin(impactElapsed * 48.0) * env * 0.7,
        Math.abs(Math.cos(impactElapsed * 56.0)) * env,
        Math.cos(impactElapsed * 42.0) * env * 0.7
      );
    } else {
      this._shakeOffset.set(0, 0, 0);
    }

    return this;
  }

  update(dt) {
    if (!this.active) return;
    if (this.skyBarrageList.length > 0) {
      this.age += dt;
      this.sharedUniforms.uTime.value = this.age;
      for (let i = this.skyBarrageList.length - 1; i >= 0; i--) {
        const m = this.skyBarrageList[i];
        m.age += dt;
        if (m.age > m.totalDuration) {
          this.skyBarrageList.splice(i, 1);
        }
      }
      if (this.skyBarrageList.length === 0) {
        this.clear();
        return;
      }
      this._renderSkyBarrage();
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
        drawCalls: 0,
        activeAsteroids: 0,
        activeFireTongues: 0,
        activeCraterRocks: 0,
        activeDecals: 0,
      };
    }
    let drawCalls = 0;
    if (this.asteroidMesh.count > 0) drawCalls++;
    if (this.fireWakeMesh.count > 0) drawCalls++;
    if (this.craterRocksMesh.count > 0) drawCalls++;
    if (this.craterDecalMesh.count > 0) drawCalls++;
    return {
      active: true,
      age: Number(this.age.toFixed(3)),
      drawCalls,
      activeAsteroids: this.asteroidMesh.count,
      activeFireTongues: this.fireWakeMesh.count,
      activeCraterRocks: this.craterRocksMesh.count,
      activeDecals: this.craterDecalMesh.count,
    };
  }

  clear() {
    this.active = false;
    this.age = 0;
    this.skyBarrageList.length = 0;
    this._shakeOffset.set(0, 0, 0);
    this._hitstopScale = 1.0;
    this.group.visible = false;
    this.asteroidMesh.count = 0;
    this.fireWakeMesh.count = 0;
    this.craterRocksMesh.count = 0;
    this.craterDecalMesh.count = 0;
  }

  dispose() {
    this.clear();
    this.asteroidMesh.geometry.dispose();
    this.fireWakeMesh.geometry.dispose();
    this.craterRocksMesh.geometry.dispose();
    this.craterDecalMesh.geometry.dispose();
    this.basaltMat.dispose();
    this.fireWakeMat.dispose();
    this.craterDecalMat.dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

export function createCinderFallSystem(options = {}) {
  return new CinderFallSystem(options);
}
