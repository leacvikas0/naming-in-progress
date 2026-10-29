import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TREES,
  terrainHeightAt,
} from './geography.js';
import {
  PALETTE,
} from './terrain-water.js';

/**
 * Real Sculpted Gnarled Branching Anime Trees (`world/assets/terrain/trees.js`).
 *
 * Adapted from `_archive/legacy-game/src/map/port/anime-flower-tree.js` and `refb-kit.js`:
 * - 6 Hero Flowering Trees (`4` Wisteria + `2` Sakura):
 *   - Sculpted gnarled S-curved `CatmullRomCurve3` trunk with 4-lobe root flares, bark ridge flutes,
 *     8 primary sweeping boughs, and recursive secondary/tertiary branches (`createTaperedBranch` + `growBranch`).
 *   - 3-tone cel-shaded bark shader with subtle vertical grain streaks, meadow ground bounce, and baked silhouette outline.
 *   - Branch-tip `foliageClusters` populated with instanced 3D V-creased leaves and instanced 3D 5-petal blossoms
 *     using cluster-normal cel shading (`uCel = 1.0`, `uRim = 1.0`, `uInk = 0.85`).
 *   - Each Wisteria tree features 28 hanging wisteria blossom raceme curtains (tapered pendulous chains of 3D blossoms
 *     draping 1.3m..2.5m below the lower boughs and swaying in the wind).
 * - 15 Green Valley Broadleaf Oak Trees (`oak`):
 *   - Sculpted multi-branched curved trunk with 4-lobe root flares and 5 sweeping primary boughs.
 *   - Topped by 13 overlapping flattened arching-leaf-fan canopy puffs (`refb-kit.js` `createTreeCanopyGeometry` recipe)
 *     plus instanced 3D outer cluster leaves with cluster-normal 3-band cel shading (`uCel = 1.0`, `uRim = 0.85`, `uInk = 0.75`).
 * - Batched across the entire valley into 5 draw calls total (<= 6 draw calls budget).
 */

const rawColor = (hex) =>
  new THREE.Color().setRGB(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255
  );

const SUN_DIR = new THREE.Vector3(-0.21, 0.28, -0.93).normalize();
const LIGHT_TINT = new THREE.Color(1, 1, 1);
const FOG_COLOR = new THREE.Color(0xd8eef5);

export const TREE_STYLE = {
  uCel: { value: 1.0 },
  uRim: { value: 0.95 },
  uInk: { value: 0.82 },
  uRimColor: { value: new THREE.Color().setRGB(1.0, 0.97, 0.88) },
  uInkColor: { value: new THREE.Color().setRGB(0.16, 0.13, 0.22) },
};

export function setTreeSunDirection(dir) {
  if (!dir) return;
  SUN_DIR.set(dir.x, dir.y, dir.z).normalize();
}

export function setTreeTimeOfDay(daylight = 1.0, lightTint = null, fogColor = null) {
  if (lightTint) LIGHT_TINT.copy(lightTint);
  if (fogColor) FOG_COLOR.copy(fogColor);
  const rimScale = 0.55 + 0.40 * Math.max(0, Math.min(1, daylight));
  TREE_STYLE.uRim.value = rimScale;
}

function createPRNG(seed) {
  let s = (seed >>> 0) || 1337;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 3D V-creased botanical leaf geometry (6 triangles) adapted from `anime-flower-tree.js`.
 */
function createSingle3DLeafGeometry() {
  const positions = [
    0.0,  0.00, 0.00, // 0: base petiole
    0.0,  0.03, 0.20, // 1: midrib lower
    0.0,  0.02, 0.37, // 2: midrib upper
    0.0, -0.02, 0.52, // 3: drooping pointed tip
   -0.15, 0.06, 0.17, // 4: left lower belly
   -0.13, 0.05, 0.33, // 5: left upper shoulder
    0.15, 0.06, 0.17, // 6: right lower belly
    0.13, 0.05, 0.33, // 7: right upper shoulder
  ];
  const indices = [
    0, 1, 4,
    4, 1, 5,
    5, 1, 2,
    5, 2, 3,
    0, 6, 1,
    1, 6, 7,
    1, 7, 2,
    2, 7, 3,
  ];
  const uvs = [
    0.5, 0.0,
    0.5, 0.42,
    0.5, 0.74,
    0.5, 1.0,
    0.0, 0.35,
    0.08, 0.68,
    1.0, 0.35,
    0.92, 0.68,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 3D 5-petal cupped anime blossom geometry with raised golden stamen core (12 triangles)
 * adapted from `anime-flower-tree.js`.
 */
function createSingle5PetalFlowerGeometry(flowerPalette) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  const fp = flowerPalette || {};
  const cStamen = rawColor(fp.stamen ?? 0xf6e388);
  const cThroat = rawColor(fp.throat ?? 0x8e64c8);
  const cMid = rawColor(fp.mid ?? 0xba8ef2);
  const cTip = rawColor(fp.tip ?? 0xe8d2ff);

  // Center throat vertex (0)
  positions.push(0, 0.015, 0);
  colors.push(cThroat.r, cThroat.g, cThroat.b);
  uvs.push(0.5, 0.0);

  let vIdx = 1;
  const numPetals = 5;

  for (let p = 0; p < numPetals; p++) {
    const baseAngle = (p / numPetals) * Math.PI * 2;
    const cos = Math.cos(baseAngle);
    const sin = Math.sin(baseAngle);
    const rot = (x, y, z) => [x * cos - z * sin, y, x * sin + z * cos];

    const pL = rot(-0.135, 0.085, 0.21);
    const pR = rot(0.135, 0.085, 0.21);
    const pT = rot(0.0, 0.055, 0.36);

    positions.push(...pL, ...pR, ...pT);
    colors.push(
      cMid.r, cMid.g, cMid.b,
      cMid.r, cMid.g, cMid.b,
      cTip.r, cTip.g, cTip.b
    );
    uvs.push(0.0, 0.58, 1.0, 0.58, 0.5, 1.0);

    indices.push(
      0, vIdx, vIdx + 1,
      vIdx, vIdx + 2, vIdx + 1
    );
    vIdx += 3;
  }

  // Raised golden stamen crown (2 tris)
  const stBase = vIdx;
  positions.push(
    -0.055, 0.065, -0.04,
     0.055, 0.065, -0.04,
     0.0,   0.095,  0.055,
     0.0,   0.065, -0.065
  );
  for (let k = 0; k < 4; k++) {
    colors.push(cStamen.r, cStamen.g, cStamen.b);
    uvs.push(0.5, 0.1);
  }
  indices.push(
    stBase, stBase + 1, stBase + 2,
    stBase + 1, stBase + 3, stBase + 2
  );

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts a tapered, fluted `CatmullRomCurve3` trunk or bough with 4-lobe root flares,
 * plus an optional reversed-winding inverted-hull ink outline shell.
 */
function createTaperedBranch(points, rStart, rEnd, radialSegs, tubularSegs, includeOutline = false, outlineThickness = 0.026) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegs, false);
  const positions = [];
  const normals = [];
  const uvs = [];
  const isOutlineAttr = [];
  const indices = [];

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const pt = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    let rootFlare = 0.0;
    if (rStart > 0.35 && t < 0.25) {
      rootFlare = Math.pow(1.0 - t / 0.25, 2.0) * 0.32 * rStart;
    }
    const baseR = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.82));

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);

      const ridge = Math.sin(theta * 5.0 + t * 4.2) * 0.065 * baseR;
      const rootLobe = rootFlare * (0.55 + 0.45 * Math.cos(theta * 4.0));
      const r = baseR + ridge + rootLobe;

      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      const unx = nx / nLen;
      const uny = ny / nLen;
      const unz = nz / nLen;

      positions.push(
        pt.x + r * unx,
        pt.y + r * uny,
        pt.z + r * unz
      );
      normals.push(unx, uny, unz);
      uvs.push(u, t);
      isOutlineAttr.push(0.0);
    }
  }

  const ringStride = radialSegs + 1;
  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);
      // Outward-facing winding on the Frenet tube (N x B = +T)
      indices.push(a, d, b, b, d, c);
    }
  }

  // Optional baked reversed-winding outline shell for crisp anime trunk/bough silhouettes
  if (includeOutline) {
    const baseVertCount = positions.length / 3;
    for (let v = 0; v < baseVertCount; v++) {
      const vx = positions[v * 3];
      const vy = positions[v * 3 + 1];
      const vz = positions[v * 3 + 2];
      const nx = normals[v * 3];
      const ny = normals[v * 3 + 1];
      const nz = normals[v * 3 + 2];
      positions.push(
        vx + nx * outlineThickness,
        vy + ny * outlineThickness,
        vz + nz * outlineThickness
      );
      normals.push(nx, ny, nz);
      uvs.push(uvs[v * 2], uvs[v * 2 + 1]);
      isOutlineAttr.push(1.0);
    }
    for (let i = 0; i < tubularSegs; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = baseVertCount + i * ringStride + j;
        const b = baseVertCount + (i + 1) * ringStride + j;
        const c = baseVertCount + (i + 1) * ringStride + (j + 1);
        const d = baseVertCount + i * ringStride + (j + 1);
        // Reversed winding so FrontSide culling renders only the back-facing silhouette hull
        indices.push(a, b, d, b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aIsOutline', new THREE.Float32BufferAttribute(isOutlineAttr, 1));
  geo.setIndex(indices);
  return { geometry: geo, curve };
}

/**
 * Builds the overlapping sculpted Ghibli foliage lobes + arching-leaf-fan canopy puffs
 * for a Green Valley Broadleaf Oak tree so the crown is 100% opaque, lush, and volumetric.
 */
function buildOakCanopyPuffsGeometry(seed, worldPos, scale, boughTips) {
  const rand = createPRNG(seed);
  const positions = [];
  const normals = [];
  const colors = [];
  const shadowColors = [];
  const crownCenters = [];
  const indices = [];
  let vCount = 0;

  const cLight = rawColor(0xbce06c);
  const cMid = rawColor(0x6cad4c);
  const cDark = rawColor(0x3f7a4c);
  const cRim = rawColor(0xeaf7ab);
  const cShdBase = rawColor(0x345950);
  const cShdTip = rawColor(0x46725e);

  const crownWorld = [worldPos.x, worldPos.y + 4.6 * scale, worldPos.z];

  const addV = (wx, wy, wz, hFrac) => {
    const sc = cDark
      .clone()
      .lerp(cMid, Math.min(1, hFrac * 1.4))
      .lerp(cLight, Math.max(0, (hFrac - 0.35) * 1.45))
      .lerp(cRim, Math.max(0, (hFrac - 0.72) * 0.8));
    const shc = cShdBase.clone().lerp(cShdTip, hFrac);
    positions.push(wx, wy, wz);
    const nx = wx - crownWorld[0];
    const ny = (wy - crownWorld[1]) * 1.2 + 0.5 * scale;
    const nz = wz - crownWorld[2];
    const nLen = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / nLen, ny / nLen, nz / nLen);
    colors.push(sc.r, sc.g, sc.b);
    shadowColors.push(shc.r, shc.g, shc.b);
    crownCenters.push(crownWorld[0], crownWorld[1], crownWorld[2]);
    return vCount++;
  };

  // 1. 7 Overlapping Sculpted Multi-Ring Broadleaf Cloud Lobes anchored on the bough tips & crown
  const lobes = [
    { x: 0.0, y: 5.55 * scale, z: 0.0, rx: 1.95 * scale, ry: 1.25 * scale, rz: 1.90 * scale, hBase: 0.55 },
  ];
  for (let i = 0; i < boughTips.length; i++) {
    const bt = boughTips[i];
    lobes.push({
      x: bt.x * 0.92,
      y: bt.y + 0.18 * scale,
      z: bt.z * 0.92,
      rx: (1.58 + (i % 2) * 0.22) * scale,
      ry: (1.05 + (i % 2) * 0.14) * scale,
      rz: (1.55 + ((i + 1) % 2) * 0.20) * scale,
      hBase: 0.25 + (i / boughTips.length) * 0.35,
    });
  }
  // Low center collar lobe burying the main trunk fork
  lobes.push({ x: 0.0, y: 3.95 * scale, z: 0.0, rx: 1.75 * scale, ry: 0.95 * scale, rz: 1.75 * scale, hBase: 0.15 });

  const S = 8;
  for (let lIdx = 0; lIdx < lobes.length; lIdx++) {
    const d = lobes[lIdx];
    const cx = worldPos.x + d.x;
    const cy = worldPos.y + d.y;
    const cz = worldPos.z + d.z;
    const rot = lIdx * 0.75 + rand() * 0.4;

    const vTop = addV(cx, cy + d.ry, cz, Math.min(1.0, d.hBase + 0.42));
    const vBot = addV(cx, cy - d.ry * 0.58, cz, Math.max(0.0, d.hBase - 0.15));
    const rUpper = [];
    const rMid = [];
    const rLower = [];

    for (let i = 0; i < S; i++) {
      const a = (i / S) * Math.PI * 2 + rot;
      const scallop = 1.0 + 0.10 * Math.sin(i * 3.0 + lIdx);
      const ca = Math.cos(a) * scallop;
      const sa = Math.sin(a) * scallop;

      rUpper.push(
        addV(cx + ca * d.rx * 0.72, cy + d.ry * 0.56, cz + sa * d.rz * 0.72, Math.min(1.0, d.hBase + 0.30))
      );
      rMid.push(
        addV(cx + ca * d.rx * 1.04, cy + d.ry * 0.04, cz + sa * d.rz * 1.04, Math.min(1.0, d.hBase + 0.12))
      );
      rLower.push(
        addV(cx + ca * d.rx * 0.78, cy - d.ry * 0.42, cz + sa * d.rz * 0.78, Math.max(0.0, d.hBase - 0.08))
      );
    }

    for (let i = 0; i < S; i++) {
      const n = (i + 1) % S;
      indices.push(vTop, rUpper[i], rUpper[n]);
      indices.push(rUpper[i], rMid[i], rMid[n], rUpper[i], rMid[n], rUpper[n]);
      indices.push(rMid[i], rLower[i], rLower[n], rMid[i], rLower[n], rMid[n]);
      indices.push(rLower[i], vBot, rLower[n]);
    }
  }

  // 2. Plus 18 Broad Arching Leaf Fans radiating from the lobe perimeters for ruffled Ghibli silhouette edges
  for (let f = 0; f < 18; f++) {
    const d = lobes[f % lobes.length];
    const yaw = (f / 18) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const sideX = -sinY;
    const sideZ = cosY;

    const bx = worldPos.x + d.x + cosY * d.rx * 0.55;
    const by = worldPos.y + d.y + (rand() - 0.3) * d.ry * 0.5;
    const bz = worldPos.z + d.z + sinY * d.rz * 0.55;
    const len = (1.15 + rand() * 0.35) * scale;
    const wid = (0.72 + rand() * 0.18) * scale;
    const pitch = 0.25 + rand() * 0.35;
    const arch = 0.34;
    const fold = 0.06 * scale;

    const samplePt = (t) => {
      const profile = Math.sin(Math.pow(t, 0.72) * Math.PI);
      const halfW = wid * 0.5 * profile;
      const reach = len * t * Math.cos(pitch + t * arch * 0.6);
      const lift = len * (t * Math.sin(pitch) - t * t * arch);
      const cx = bx + cosY * reach;
      const cy = by + lift;
      const cz = bz + sinY * reach;
      return {
        center: [cx, cy, cz],
        left: [cx + sideX * halfW, cy + fold * profile, cz + sideZ * halfW],
        right: [cx - sideX * halfW, cy + fold * profile, cz - sideZ * halfW],
      };
    };

    const r0 = samplePt(0.0);
    const r1 = samplePt(0.45);
    const r2 = samplePt(1.0);
    const v0 = addV(r0.center[0], r0.center[1], r0.center[2], d.hBase + 0.1);
    const v1L = addV(r1.left[0], r1.left[1], r1.left[2], d.hBase + 0.25);
    const v1R = addV(r1.right[0], r1.right[1], r1.right[2], d.hBase + 0.25);
    const v2 = addV(r2.center[0], r2.center[1], r2.center[2], Math.min(1.0, d.hBase + 0.4));

    indices.push(v0, v1R, v1L, v1L, v1R, v2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aShadowColor', new THREE.Float32BufferAttribute(shadowColors, 3));
  geo.setAttribute('aCrownCenter', new THREE.Float32BufferAttribute(crownCenters, 3));
  geo.setIndex(indices);
  return geo;
}

export function buildBotanicalTrees(opts = {}) {
  const colliders = opts.colliders || [];
  const root = new THREE.Group();
  root.name = 'botanical-trees';

  const allBarkGeometries = [];
  const allOakPuffGeometries = [];

  // Per-instance accumulators for batched 3D leaves and 3D 5-petal blossoms
  const leafInstances = [];     // { matrix, normal, crownCenter, colorVar }
  const wisteriaInstances = []; // { matrix, normal, crownCenter, phase }
  const sakuraInstances = [];   // { matrix, normal, crownCenter, phase }

  const dummy = new THREE.Object3D();

  // 1. Build each tree in `TREES` (4 Wisteria Hero Trees, 2 Sakura Hero Trees, 15 Broadleaf Oak Trees)
  TREES.forEach((t, treeIdx) => {
    const ty = terrainHeightAt(t.x, t.z);
    const isHero = t.kind === 'wisteria' || t.kind === 'sakura';
    const isWisteria = t.kind === 'wisteria';
    const s = (t.scale || 1.0) * (isHero ? 1.18 : 1.08);
    const rand = createPRNG(1009 + treeIdx * 137);
    const randRange = (min, max) => min + rand() * (max - min);

    const worldOrigin = new THREE.Vector3(t.x, ty, t.z);
    const yawRot = (treeIdx * 1.85) % (Math.PI * 2);
    const cosYaw = Math.cos(yawRot);
    const sinYaw = Math.sin(yawRot);
    const toWorldVec = (lx, ly, lz) =>
      new THREE.Vector3(
        worldOrigin.x + (lx * cosYaw - lz * sinYaw) * s,
        worldOrigin.y + ly * s,
        worldOrigin.z + (lx * sinYaw + lz * cosYaw) * s
      );
    const rotateDir = (dx, dy, dz) =>
      new THREE.Vector3(
        dx * cosYaw - dz * sinYaw,
        dy,
        dx * sinYaw + dz * cosYaw
      ).normalize();

    if (isHero) {
      // --- HERO FLOWERING TREE (Wisteria / Sakura) ---
      // Sculpted Gnarled S-Curved Trunk centered at (0, -0.1, 0) so shrine planter trees sit squarely inside the planter
      const trunkPts = [
        toWorldVec(0.0, -0.12, 0.0),
        toWorldVec(-0.18, 1.15, 0.10),
        toWorldVec(0.28, 2.38, -0.06),
        toWorldVec(0.14, 3.50, 0.02),
      ];
      const trunkObj = createTaperedBranch(trunkPts, 0.58 * s, 0.36 * s, 10, 12, true, 0.028);
      allBarkGeometries.push(trunkObj.geometry);

      // 4 Sculpted Surface Root Buttress Spurs at the base
      for (let r = 0; r < 4; r++) {
        const ra = (r / 4) * Math.PI * 2 + 0.35;
        const rootPts = [
          toWorldVec(Math.cos(ra) * 0.25, 0.72, Math.sin(ra) * 0.25),
          toWorldVec(Math.cos(ra) * 0.65, 0.22, Math.sin(ra) * 0.65),
          toWorldVec(Math.cos(ra) * 0.98, -0.10, Math.sin(ra) * 0.98),
        ];
        allBarkGeometries.push(
          createTaperedBranch(rootPts, 0.24 * s, 0.11 * s, 5, 5, false).geometry
        );
      }

      const foliageClusters = [];
      const lowerBoughCurves = [];

      const growBranch = (startPos, dir, length, rStart, rEnd, depth) => {
        const mid1 = startPos.clone().addScaledVector(dir, length * 0.35);
        mid1.y += length * 0.06;
        mid1.x += randRange(-0.16, 0.16) * length;
        mid1.z += randRange(-0.16, 0.16) * length;

        const mid2 = startPos.clone().addScaledVector(dir, length * 0.72);
        mid2.y += length * 0.10;
        mid2.x += randRange(-0.20, 0.20) * length;
        mid2.z += randRange(-0.20, 0.20) * length;

        const endPos = startPos.clone().addScaledVector(dir, length);
        endPos.y += length * 0.12;

        const radialSegs = depth === 1 ? 7 : 5;
        const tubularSegs = depth === 1 ? 8 : 5;
        const { geometry, curve } = createTaperedBranch(
          [startPos, mid1, mid2, endPos],
          rStart,
          rEnd,
          radialSegs,
          tubularSegs,
          depth === 1,
          0.022
        );
        allBarkGeometries.push(geometry);

        if (depth === 1) {
          lowerBoughCurves.push(curve);
        }

        if (depth >= 2) {
          foliageClusters.push({
            center: curve.getPointAt(0.62),
            radius: randRange(0.95, 1.32) * s,
          });
          foliageClusters.push({
            center: endPos.clone(),
            radius: randRange(1.12, 1.52) * s,
          });
          return;
        }

        const numChildren = 3;
        for (let i = 0; i < numChildren; i++) {
          const spawnT = i === 0 ? randRange(0.52, 0.68) : randRange(0.78, 0.96);
          const spawnPos = curve.getPointAt(spawnT);
          const spawnRadius = THREE.MathUtils.lerp(rStart, rEnd, spawnT) * 0.78;

          const angleStep = (i - 1) * 0.85 + randRange(-0.22, 0.22);
          const childDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angleStep);
          childDir.y = THREE.MathUtils.clamp(childDir.y + randRange(-0.06, 0.22), 0.14, 0.82);
          childDir.normalize();

          growBranch(
            spawnPos,
            childDir,
            length * randRange(0.68, 0.84),
            spawnRadius,
            spawnRadius * 0.52,
            depth + 1
          );
        }
      };

      const primaryBoughs = [
        { t: 0.78, dir: [-0.82, 0.45,  0.15], len: 2.65 * s, r: 0.26 * s },
        { t: 0.94, dir: [-0.55, 0.72, -0.25], len: 2.85 * s, r: 0.27 * s },
        { t: 1.00, dir: [-0.12, 0.92,  0.18], len: 2.70 * s, r: 0.25 * s },
        { t: 1.00, dir: [ 0.28, 0.88, -0.22], len: 2.65 * s, r: 0.24 * s },
        { t: 0.88, dir: [ 0.76, 0.55,  0.22], len: 2.85 * s, r: 0.27 * s },
        { t: 0.72, dir: [ 0.88, 0.35, -0.25], len: 2.45 * s, r: 0.22 * s },
        { t: 0.92, dir: [ 0.05, 0.65, -0.75], len: 2.50 * s, r: 0.22 * s },
        { t: 0.90, dir: [-0.15, 0.62,  0.75], len: 2.35 * s, r: 0.21 * s },
      ];

      for (const b of primaryBoughs) {
        const origin = trunkObj.curve.getPointAt(b.t);
        growBranch(origin, rotateDir(...b.dir), b.len, b.r, b.r * 0.56, 1);
      }

      const crownCenter = new THREE.Vector3(worldOrigin.x, worldOrigin.y + 4.8 * s, worldOrigin.z);

      // Populate 3D Leaves inside the branch-tip foliageClusters
      const heroLeafCount = 340;
      const leafScale = 1.65 * (s / 1.35);
      for (let i = 0; i < heroLeafCount; i++) {
        const cluster = foliageClusters[i % foliageClusters.length];
        const u = rand();
        const v = rand();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = cluster.radius * Math.cbrt(rand()) * 0.96;

        const offset = new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta) * 0.78,
          r * Math.cos(phi)
        );
        const pos = cluster.center.clone().add(offset);
        dummy.position.copy(pos);

        const outDir = offset.clone().normalize();
        if (outDir.lengthSq() < 0.001) outDir.set(0, 1, 0);
        dummy.lookAt(pos.clone().add(outDir));
        dummy.rotateZ(randRange(-0.6, 0.6));
        dummy.rotateX(randRange(-0.35, 0.45));
        dummy.scale.setScalar(randRange(0.82, 1.38) * leafScale);
        dummy.updateMatrix();

        const crownDir = pos.clone().sub(crownCenter).normalize();
        const smoothNormal = outDir.lerp(crownDir, 0.48).normalize();
        leafInstances.push({
          matrix: dummy.matrix.clone(),
          normal: [smoothNormal.x, smoothNormal.y, smoothNormal.z],
          crownCenter: [crownCenter.x, crownCenter.y, crownCenter.z],
          colorVar: rand(),
        });
      }

      // Populate 3D 5-Petal Blossoms across the canopy clusters
      const heroFlowerCount = 310;
      const flowerScale = 1.95 * (s / 1.35);
      const targetFlowerArr = isWisteria ? wisteriaInstances : sakuraInstances;

      for (let i = 0; i < heroFlowerCount; i++) {
        const cluster = foliageClusters[i % foliageClusters.length];
        const u = rand();
        const v = rand();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = cluster.radius * randRange(0.58, 1.12);

        const offset = new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta) * 0.82 + 0.08 * s,
          r * Math.cos(phi)
        );
        const pos = cluster.center.clone().add(offset);
        dummy.position.copy(pos);

        const outDir = offset.clone().normalize();
        outDir.y = Math.max(outDir.y, -0.2);
        outDir.normalize();

        dummy.lookAt(pos.clone().add(outDir));
        dummy.rotateX(Math.PI * 0.5 + randRange(-0.3, 0.3));
        dummy.rotateY(randRange(0, Math.PI * 2));
        dummy.scale.setScalar(randRange(0.88, 1.45) * flowerScale);
        dummy.updateMatrix();

        targetFlowerArr.push({
          matrix: dummy.matrix.clone(),
          normal: [outDir.x, outDir.y, outDir.z],
          crownCenter: [crownCenter.x, crownCenter.y, crownCenter.z],
          phase: rand(),
        });
      }

      // For Wisteria Hero Trees: 28 Hanging Wisteria Blossom Raceme Curtains!
      // Tapered pendulous chains of 3D blossoms hanging 1.2m..2.4m below the lower boughs
      if (isWisteria) {
        const curtainCount = 28;
        const tiersPerCurtain = 6;
        for (let c = 0; c < curtainCount; c++) {
          const boughCurve = lowerBoughCurves[c % lowerBoughCurves.length];
          const boughT = 0.38 + (c / curtainCount) * 0.58;
          const anchor = boughCurve.getPointAt(boughT);
          const jitterAng = c * 2.39996 + randRange(-0.3, 0.3);
          const jitterRad = randRange(0.18, 0.85) * s;
          const topX = anchor.x + Math.cos(jitterAng) * jitterRad;
          const topY = anchor.y - 0.12 * s;
          const topZ = anchor.z + Math.sin(jitterAng) * jitterRad;
          const curtainLen = randRange(1.25, 2.35) * (s / 1.35);
          const phaseBase = rand();

          for (let tier = 0; tier < tiersPerCurtain; tier++) {
            const frac = tier / (tiersPerCurtain - 1);
            const wy = topY - frac * curtainLen;
            const swayOff = Math.sin(frac * Math.PI) * 0.06 * s;
            const wx = topX + Math.cos(jitterAng + tier) * swayOff;
            const wz = topZ + Math.sin(jitterAng + tier) * swayOff;

            dummy.position.set(wx, wy, wz);
            const aim = new THREE.Vector3(
              Math.cos(jitterAng + tier * 1.9) * 0.65,
              -0.45 + (1.0 - frac) * 0.35,
              Math.sin(jitterAng + tier * 1.9) * 0.65
            ).normalize();
            dummy.lookAt(dummy.position.clone().add(aim));
            dummy.rotateX(Math.PI * 0.38);
            dummy.rotateY(tier * 1.25 + rand() * 0.5);
            // Taper gracefully from wide top cluster to delicate pointed bottom tip
            const taper = THREE.MathUtils.lerp(1.42, 0.68, Math.pow(frac, 0.85));
            dummy.scale.setScalar(flowerScale * taper);
            dummy.updateMatrix();

            wisteriaInstances.push({
              matrix: dummy.matrix.clone(),
              normal: [aim.x, 0.35 - frac * 0.3, aim.z],
              crownCenter: [crownCenter.x, crownCenter.y, crownCenter.z],
              phase: phaseBase + frac * 0.35,
            });
          }
        }
      }

      if (colliders) {
        colliders.push({ type: 'circle', x: t.x, z: t.z, r: 0.9 * (t.scale || 1.0) });
      }
    } else {
      // --- GREEN VALLEY BROADLEAF OAK TREE (`oak`) ---
      // Multi-branched curved trunk with 4-lobe root flare + 5 sweeping boughs
      const trunkPts = [
        toWorldVec(0.0, -0.10, 0.0),
        toWorldVec(-0.12, 1.05, 0.06),
        toWorldVec(0.16, 2.15, -0.05),
        toWorldVec(0.06, 3.25, 0.02),
      ];
      const trunkObj = createTaperedBranch(trunkPts, 0.44 * s, 0.24 * s, 8, 9, true, 0.024);
      allBarkGeometries.push(trunkObj.geometry);

      const oakBoughs = [
        { t: 0.68, dir: [-0.78, 0.52,  0.22], len: 1.95 * s, r: 0.19 * s },
        { t: 0.82, dir: [ 0.74, 0.56, -0.25], len: 2.05 * s, r: 0.19 * s },
        { t: 0.90, dir: [ 0.18, 0.64,  0.74], len: 1.85 * s, r: 0.17 * s },
        { t: 0.94, dir: [-0.24, 0.68, -0.70], len: 1.90 * s, r: 0.17 * s },
        { t: 1.00, dir: [ 0.08, 0.92,  0.12], len: 1.75 * s, r: 0.16 * s },
      ];

      const boughTipsLocal = [];
      const oakClusters = [];
      for (const b of oakBoughs) {
        const origin = trunkObj.curve.getPointAt(b.t);
        const dir = rotateDir(...b.dir);
        const mid = origin.clone().addScaledVector(dir, b.len * 0.52);
        mid.y += b.len * 0.08;
        const end = origin.clone().addScaledVector(dir, b.len);
        end.y += b.len * 0.12;
        const { geometry } = createTaperedBranch([origin, mid, end], b.r, b.r * 0.45, 5, 5, true, 0.018);
        allBarkGeometries.push(geometry);

        boughTipsLocal.push({
          x: end.x - worldOrigin.x,
          y: end.y - worldOrigin.y,
          z: end.z - worldOrigin.z,
        });
        oakClusters.push({ center: end.clone(), radius: 1.25 * s });
      }

      // 13 Overlapping Flattened Arching-Leaf-Fan Canopy Puffs (`refb-kit.js` recipe)
      allOakPuffGeometries.push(
        buildOakCanopyPuffsGeometry(2003 + treeIdx * 97, worldOrigin, s, boughTipsLocal)
      );

      // Plus 75 outer 3D cluster leaves around the bough tips for crisp organic leaf silhouettes
      const crownCenter = new THREE.Vector3(worldOrigin.x, worldOrigin.y + 4.4 * s, worldOrigin.z);
      const oakLeafCount = 75;
      const oakLeafScale = 1.65 * s;
      for (let i = 0; i < oakLeafCount; i++) {
        const cluster = oakClusters[i % oakClusters.length];
        const u = rand();
        const v = rand();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = cluster.radius * (0.65 + 0.45 * rand());
        const offset = new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta) * 0.76 + 0.25 * s,
          r * Math.cos(phi)
        );
        const pos = cluster.center.clone().add(offset);
        dummy.position.copy(pos);

        const outDir = pos.clone().sub(crownCenter).normalize();
        dummy.lookAt(pos.clone().add(outDir));
        dummy.rotateZ(randRange(-0.6, 0.6));
        dummy.rotateX(randRange(-0.3, 0.4));
        dummy.scale.setScalar(randRange(0.85, 1.32) * oakLeafScale);
        dummy.updateMatrix();

        leafInstances.push({
          matrix: dummy.matrix.clone(),
          normal: [outDir.x, outDir.y, outDir.z],
          crownCenter: [crownCenter.x, crownCenter.y, crownCenter.z],
          colorVar: rand(),
        });
      }

      if (colliders) {
        colliders.push({ type: 'circle', x: t.x, z: t.z, r: 0.6 * (t.scale || 1.0) });
      }
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Draw Call 1: Merged Sculpted Bark (3-Tone Cel Bark + Silhouette Outline) */
  /* ------------------------------------------------------------------------ */

  const mergedBarkGeo = mergeGeometries(allBarkGeometries, false);
  const barkMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR },
      uLightTint: { value: LIGHT_TINT },
      uFogColor: { value: FOG_COLOR },
      uFogNear: { value: 165.0 },
      uFogFar: { value: 520.0 },
      uInkColor: TREE_STYLE.uInkColor,
    },
    vertexShader: /* glsl */ `
      attribute float aIsOutline;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vViewDist;
      varying float vIsOutline;
      void main() {
        vUv = uv;
        vIsOutline = aIsOutline;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vViewDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uLightTint;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uInkColor;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vViewDist;
      varying float vIsOutline;
      void main() {
        if (vIsOutline > 0.5) {
          vec3 inkLin = pow(uInkColor, vec3(2.2)) * uLightTint;
          float fogF = smoothstep(uFogNear, uFogFar, vViewDist);
          gl_FragColor = vec4(mix(inkLin, uFogColor, fogF), 1.0);
          return;
        }
        float ndl = dot(normalize(vNormal), normalize(uSunDir)) * 0.5 + 0.5;
        float band1 = smoothstep(0.28, 0.36, ndl);
        float band2 = smoothstep(0.60, 0.68, ndl);
        float grain = sin(vUv.x * 38.0 + sin(vUv.y * 12.0) * 2.4) * 0.5 + 0.5;
        float streak = smoothstep(0.32, 0.72, grain) * 0.055;

        // Warm-cool Ghibli hardwood bark ramp (display-referred)
        vec3 shadowBark = vec3(0.39, 0.33, 0.30);
        vec3 midBark    = vec3(0.53, 0.45, 0.38);
        vec3 litBark    = vec3(0.66, 0.58, 0.48);
        vec3 col = mix(shadowBark, midBark, band1);
        col = mix(col, litBark, band2) - streak;

        float bounce = smoothstep(3.5, 0.0, vWorldPos.y) * max(0.0, -vNormal.y + 0.4) * 0.08;
        col += vec3(0.35, 0.55, 0.28) * bounce;

        vec3 linearCol = pow(clamp(col, 0.0, 1.0), vec3(2.2)) * uLightTint;
        float fogFactor = smoothstep(uFogNear, uFogFar, vViewDist);
        gl_FragColor = vec4(mix(linearCol, uFogColor, fogFactor), 1.0);
      }
    `,
  });
  const barkMesh = new THREE.Mesh(mergedBarkGeo, barkMat);
  barkMesh.name = 'trees-sculpted-bark';
  barkMesh.frustumCulled = false;
  root.add(barkMesh);

  /* ------------------------------------------------------------------------ */
  /* Draw Call 2: Merged Oak Arching-Leaf-Fan Canopy Puffs (3-Band Cel)       */
  /* ------------------------------------------------------------------------ */

  const mergedOakPuffsGeo = mergeGeometries(allOakPuffGeometries, false);
  const oakPuffMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR },
      uTime: { value: 0 },
      uLightTint: { value: LIGHT_TINT },
      uFogColor: { value: FOG_COLOR },
      uFogNear: { value: 165.0 },
      uFogFar: { value: 520.0 },
      uCel: TREE_STYLE.uCel,
      uRim: TREE_STYLE.uRim,
      uInk: { value: 0.72 },
      uRimColor: TREE_STYLE.uRimColor,
      uInkColor: TREE_STYLE.uInkColor,
    },
    side: THREE.DoubleSide,
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec3 aShadowColor;
      attribute vec3 aCrownCenter;
      uniform float uTime;
      varying vec3 vColorSun;
      varying vec3 vColorShd;
      varying vec3 vCrownCenter;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vViewDist;
      void main() {
        vColorSun = color;
        vColorShd = aShadowColor;
        vCrownCenter = aCrownCenter;
        vec3 pos = position;
        float wave = sin(uTime * 1.9 + pos.x * 0.6 + pos.z * 0.6) * 0.05;
        pos.x += wave;
        pos.z += wave * 0.6;
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vViewDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uLightTint;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uCel;
      uniform float uRim;
      uniform float uInk;
      uniform vec3 uRimColor;
      uniform vec3 uInkColor;
      varying vec3 vColorSun;
      varying vec3 vColorShd;
      varying vec3 vCrownCenter;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vViewDist;
      void main() {
        vec3 N = normalize(vNormal);
        float ndl = dot(N, normalize(uSunDir)) * 0.5 + 0.5;
        float celBand = 0.5 * smoothstep(0.36, 0.44, ndl) + 0.5 * smoothstep(0.62, 0.70, ndl);
        float lightFactor = mix(smoothstep(0.24, 0.72, ndl), celBand, uCel);

        vec3 col = mix(vColorShd, vColorSun, lightFactor);
        vec3 deepShd = vColorShd * vec3(0.80, 0.86, 0.95);
        col = mix(deepShd, col, smoothstep(0.14, 0.26, ndl));

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 canN = normalize(vWorldPos - vCrownCenter + vec3(0.0, 0.001, 0.0));
        float fres = 1.0 - clamp(abs(dot(canN, V)), 0.0, 1.0);
        col = mix(col, uInkColor, smoothstep(0.72, 0.96, fres) * uInk * 0.65);

        float rim = smoothstep(0.52, 0.88, fres) * smoothstep(0.35, 0.70, ndl);
        col = mix(col, uRimColor, rim * uRim * 0.48);

        vec3 linearCol = pow(clamp(col, 0.0, 1.0), vec3(2.2)) * uLightTint;
        float fogFactor = smoothstep(uFogNear, uFogFar, vViewDist);
        gl_FragColor = vec4(mix(linearCol, uFogColor, fogFactor), 1.0);
      }
    `,
  });
  const oakPuffsMesh = new THREE.Mesh(mergedOakPuffsGeo, oakPuffMat);
  oakPuffsMesh.name = 'trees-oak-canopy-puffs';
  oakPuffsMesh.frustumCulled = false;
  root.add(oakPuffsMesh);

  /* ------------------------------------------------------------------------ */
  /* Draw Call 3: Batched 3D Leaves (`createSingle3DLeafGeometry`)            */
  /* ------------------------------------------------------------------------ */

  const leafGeo = createSingle3DLeafGeometry();
  const totalLeaves = leafInstances.length;
  const leafClusterNormals = new Float32Array(totalLeaves * 3);
  const leafCrownCenters = new Float32Array(totalLeaves * 3);
  const leafColorVars = new Float32Array(totalLeaves);

  const leafMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR },
      uTime: { value: 0 },
      uLightTint: { value: LIGHT_TINT },
      uFogColor: { value: FOG_COLOR },
      uFogNear: { value: 165.0 },
      uFogFar: { value: 520.0 },
      uWindDir: { value: new THREE.Vector3(1, 0, 0.35).normalize() },
      uLeafShadow: { value: rawColor(0x47775c) },
      uLeafMid: { value: rawColor(0x669c5e) },
      uLeafSunlit: { value: rawColor(0x88b85c) },
      uLeafTip: { value: rawColor(0xb4d678) },
      uCel: TREE_STYLE.uCel,
      uRim: TREE_STYLE.uRim,
      uInk: TREE_STYLE.uInk,
      uRimColor: TREE_STYLE.uRimColor,
      uInkColor: TREE_STYLE.uInkColor,
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aClusterNormal;
      attribute vec3 aCrownCenter;
      attribute float aColorVar;
      uniform float uTime;
      uniform vec3 uWindDir;
      varying vec3 vClusterNormal;
      varying vec3 vFaceNormal;
      varying vec3 vCrownCenter;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vColorVar;
      varying float vViewDist;
      void main() {
        vUv = uv;
        vColorVar = aColorVar;
        vCrownCenter = aCrownCenter;
        vec3 pos = position;
        vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

        float windWave = sin(uTime * 2.2 + worldOrigin.x * 0.45 + worldOrigin.z * 0.45 + worldOrigin.y * 0.35);
        float detailFlutter = cos(uTime * 4.2 + worldOrigin.x * 1.4 + aColorVar * 10.0) * 0.35;
        float bend = (windWave + detailFlutter) * 0.08 * uv.y;
        pos.x += uWindDir.x * bend * 1.1;
        pos.z += uWindDir.z * bend * 1.1;
        pos.y += bend * 0.35;

        vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        vClusterNormal = normalize(aClusterNormal);
        vFaceNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vViewDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uLightTint;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uLeafShadow;
      uniform vec3 uLeafMid;
      uniform vec3 uLeafSunlit;
      uniform vec3 uLeafTip;
      uniform float uCel;
      uniform float uRim;
      uniform float uInk;
      uniform vec3 uRimColor;
      uniform vec3 uInkColor;
      varying vec3 vClusterNormal;
      varying vec3 vFaceNormal;
      varying vec3 vCrownCenter;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vColorVar;
      varying float vViewDist;
      void main() {
        vec3 blendedNormal = normalize(mix(vFaceNormal, vClusterNormal, 0.76));
        float ndl = dot(blendedNormal, normalize(uSunDir)) * 0.5 + 0.5;
        float heightGrad = clamp((vWorldPos.y - (vCrownCenter.y - 2.6)) / 5.2, 0.0, 1.0);

        float rampIn = ndl + heightGrad * 0.14 + (vColorVar - 0.5) * 0.10;
        float celBand = 0.5 * smoothstep(0.38, 0.46, rampIn) + 0.5 * smoothstep(0.62, 0.70, rampIn);
        float lightBand = mix(smoothstep(0.28, 0.68, rampIn), celBand, uCel);

        vec3 col = mix(uLeafShadow, uLeafMid, smoothstep(0.18, 0.46, ndl));
        col = mix(col, uLeafSunlit, lightBand);

        float tipBright = smoothstep(0.5, 1.0, vUv.y) * 0.12;
        float centerVein = (1.0 - smoothstep(0.0, 0.08, abs(vUv.x - 0.5))) * 0.06;
        col = mix(col, uLeafTip, tipBright + centerVein);

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 canN = normalize(vWorldPos - vCrownCenter + vec3(0.0, 0.001, 0.0));
        float fres = 1.0 - clamp(abs(dot(canN, V)), 0.0, 1.0);
        col = mix(col, uInkColor, smoothstep(0.72, 0.96, fres) * uInk * 0.75);

        float rim = smoothstep(0.50, 0.86, fres) * smoothstep(0.20, 0.60, ndl);
        col = mix(col, uRimColor, rim * uRim * 0.52);

        vec3 linearCol = pow(clamp(col, 0.0, 1.0), vec3(2.2)) * uLightTint;
        float fogFactor = smoothstep(uFogNear, uFogFar, vViewDist);
        gl_FragColor = vec4(mix(linearCol, uFogColor, fogFactor), 1.0);
      }
    `,
  });

  const leavesMesh = new THREE.InstancedMesh(leafGeo, leafMat, totalLeaves);
  leavesMesh.name = 'trees-instanced-3d-leaves';
  leavesMesh.frustumCulled = false;

  for (let i = 0; i < totalLeaves; i++) {
    const inst = leafInstances[i];
    leavesMesh.setMatrixAt(i, inst.matrix);
    leafClusterNormals[i * 3] = inst.normal[0];
    leafClusterNormals[i * 3 + 1] = inst.normal[1];
    leafClusterNormals[i * 3 + 2] = inst.normal[2];
    leafCrownCenters[i * 3] = inst.crownCenter[0];
    leafCrownCenters[i * 3 + 1] = inst.crownCenter[1];
    leafCrownCenters[i * 3 + 2] = inst.crownCenter[2];
    leafColorVars[i] = inst.colorVar;
  }
  leafGeo.setAttribute('aClusterNormal', new THREE.InstancedBufferAttribute(leafClusterNormals, 3));
  leafGeo.setAttribute('aCrownCenter', new THREE.InstancedBufferAttribute(leafCrownCenters, 3));
  leafGeo.setAttribute('aColorVar', new THREE.InstancedBufferAttribute(leafColorVars, 1));
  root.add(leavesMesh);

  /* ------------------------------------------------------------------------ */
  /* Helper to build Batched 5-Petal Blossom InstancedMesh (Wisteria & Sakura)*/
  /* ------------------------------------------------------------------------ */

  const buildBlossomBatch = (name, instances, palette) => {
    const flowerGeo = createSingle5PetalFlowerGeometry(palette);
    const count = instances.length;
    const clusterNormals = new Float32Array(count * 3);
    const crownCenters = new Float32Array(count * 3);
    const phases = new Float32Array(count);

    const flowerMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: SUN_DIR },
        uTime: { value: 0 },
        uLightTint: { value: LIGHT_TINT },
        uFogColor: { value: FOG_COLOR },
        uFogNear: { value: 165.0 },
        uFogFar: { value: 520.0 },
        uCel: TREE_STYLE.uCel,
        uRim: TREE_STYLE.uRim,
        uInk: TREE_STYLE.uInk,
        uRimColor: TREE_STYLE.uRimColor,
        uInkColor: TREE_STYLE.uInkColor,
      },
      side: THREE.DoubleSide,
      vertexColors: true,
      vertexShader: /* glsl */ `
        attribute vec3 aClusterNormal;
        attribute vec3 aCrownCenter;
        attribute float aPhase;
        uniform float uTime;
        varying vec3 vColor;
        varying vec3 vClusterNormal;
        varying vec3 vFaceNormal;
        varying vec3 vCrownCenter;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        varying float vViewDist;
        void main() {
          vColor = color;
          vUv = uv;
          vCrownCenter = aCrownCenter;
          vec3 pos = position;
          vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 2.4 + worldOrigin.x * 0.55 + worldOrigin.z * 0.55 + aPhase * 6.28);
          pos.y += sway * 0.045 * uv.y;
          pos.x += cos(uTime * 2.0 + aPhase * 6.28) * 0.04 * uv.y;
          vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          vClusterNormal = normalize(aClusterNormal);
          vFaceNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vec4 mv = viewMatrix * wp;
          vViewDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform vec3 uLightTint;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uCel;
        uniform float uRim;
        uniform float uInk;
        uniform vec3 uRimColor;
        uniform vec3 uInkColor;
        varying vec3 vColor;
        varying vec3 vClusterNormal;
        varying vec3 vFaceNormal;
        varying vec3 vCrownCenter;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        varying float vViewDist;
        void main() {
          vec3 norm = normalize(mix(vFaceNormal, vClusterNormal, 0.68));
          float ndl = dot(norm, normalize(uSunDir)) * 0.5 + 0.5;
          float celBand = 0.5 * smoothstep(0.34, 0.42, ndl) + 0.5 * smoothstep(0.58, 0.66, ndl);
          float lightFactor = mix(smoothstep(0.18, 0.75, ndl), celBand, uCel);

          vec3 shadowTint = vColor * vec3(0.72, 0.68, 0.88);
          vec3 sunlitTint = vColor * vec3(1.12, 1.07, 1.14);
          vec3 finalCol = mix(shadowTint, sunlitTint, lightFactor);
          float crease = (1.0 - smoothstep(0.0, 0.09, abs(vUv.x - 0.5))) * 0.07 * vUv.y;
          finalCol -= vec3(0.08, 0.12, 0.04) * crease;

          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 canN = normalize(vWorldPos - vCrownCenter + vec3(0.0, 0.001, 0.0));
          float fres = 1.0 - clamp(abs(dot(canN, V)), 0.0, 1.0);
          finalCol = mix(finalCol, uInkColor, smoothstep(0.72, 0.96, fres) * uInk * 0.72);
          float rim = smoothstep(0.52, 0.88, fres) * smoothstep(0.15, 0.58, ndl);
          finalCol = mix(finalCol, uRimColor, rim * uRim * 0.52);

          vec3 linearCol = pow(clamp(finalCol, 0.0, 1.0), vec3(2.2)) * uLightTint;
          float fogFactor = smoothstep(uFogNear, uFogFar, vViewDist);
          gl_FragColor = vec4(mix(linearCol, uFogColor, fogFactor), 1.0);
        }
      `,
    });

    const imesh = new THREE.InstancedMesh(flowerGeo, flowerMat, count);
    imesh.name = name;
    imesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      const inst = instances[i];
      imesh.setMatrixAt(i, inst.matrix);
      clusterNormals[i * 3] = inst.normal[0];
      clusterNormals[i * 3 + 1] = inst.normal[1];
      clusterNormals[i * 3 + 2] = inst.normal[2];
      crownCenters[i * 3] = inst.crownCenter[0];
      crownCenters[i * 3 + 1] = inst.crownCenter[1];
      crownCenters[i * 3 + 2] = inst.crownCenter[2];
      phases[i] = inst.phase;
    }

    flowerGeo.setAttribute('aClusterNormal', new THREE.InstancedBufferAttribute(clusterNormals, 3));
    flowerGeo.setAttribute('aCrownCenter', new THREE.InstancedBufferAttribute(crownCenters, 3));
    flowerGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    root.add(imesh);
    return { imesh, flowerMat };
  };

  // Draw Call 4: All Wisteria Canopy Blossoms + 112 Hanging Wisteria Raceme Curtains
  const wisteriaBatch = buildBlossomBatch('trees-wisteria-blossoms', wisteriaInstances, {
    stamen: 0xfbe580,
    throat: 0x7d4ec4,
    mid: 0xb180ee,
    tip: 0xe6c8ff,
  });

  // Draw Call 5: All Sakura Canopy Blossoms
  const sakuraBatch = buildBlossomBatch('trees-sakura-blossoms', sakuraInstances, {
    stamen: 0xf8dc68,
    throat: 0xd86e96,
    mid: 0xf6a8c4,
    tip: 0xffe4ef,
  });

  return {
    group: root,
    colliders,
    setSunDirection: setTreeSunDirection,
    setTimeOfDay: setTreeTimeOfDay,
    update(_dt, elapsed = 0, sunDir = null, daylight = null, fogColor = null, lightTint = null) {
      const t = Number.isFinite(elapsed) ? elapsed : 0;
      oakPuffMat.uniforms.uTime.value = t;
      leafMat.uniforms.uTime.value = t;
      wisteriaBatch.flowerMat.uniforms.uTime.value = t;
      sakuraBatch.flowerMat.uniforms.uTime.value = t;
      if (sunDir) setTreeSunDirection(sunDir);
      if (daylight !== null || lightTint || fogColor) {
        setTreeTimeOfDay(daylight ?? 1.0, lightTint, fogColor);
      }
    },
  };
}
