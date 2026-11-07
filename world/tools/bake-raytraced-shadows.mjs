/**
 * Offline 3D Raytraced Cel-Shadow & 360° Contact AO Baker
 * (`world/tools/bake-raytraced-shadows.mjs`)
 *
 * Extracts all static shadow-casting 3D triangles in world space from:
 * - `createHousesKit` (`world/assets/houses/index.js`): 5 Tudor cottages, pitched roofs,
 *   cross-gables, dormers, chimneys, porches, conservatory, forge shed, waterwheel & sails
 * - `buildLandmarks` (`world/assets/terrain/landmarks.js`): Roofed stone well, bollards,
 *   wooden pier & boat, 24-segment arena fence, 56-step shrine staircase balustrades &
 *   lanterns, Romanesque Shrine Archway, 52+ chiseled limestone boulders, dry-stone walls,
 *   roadside split-rail fences, and 3 Sacred Inscription Stones
 * - `buildBotanicalTrees` (`world/assets/terrain/trees.js`): 69 gnarled trunks, spreading
 *   umbrella boughs, star-burst Gouache leaf-cluster cards, and 3D shingled Wisteria/Sakura racemes
 *
 * Indexes all triangles into a 128x128 2D spatial grid across `[-170..+170]m` (`340m x 340m`)
 * and bakes a 4-channel RGBA PNG at `world/assets/terrain/baked-shadows-ao.png`:
 *
 * Channel Convention (`0 = 0.0` unshadowed/unoccluded, `255 = 1.0` full shadow / full AO):
 * - `R`: Morning / Day Sun (`normalize(-0.55, 0.68, -0.48)`) — casts shadows right (+X) & forward (+Z)
 * - `G`: Golden Hour Sunset Sun (`normalize(-0.74, 0.42, -0.52)`) — longer sunset roof & tree shadows
 * - `B`: Twilight / Night Moon (`normalize(0.48, 0.62, -0.62)`) — moonlit shadows
 * - `A`: 360° Ground-Contact Ambient Occlusion (`0.05m <= triY - groundY <= 2.4m`, `0.0m..1.35m` reach)
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import { createHousesKit } from '../assets/houses/index.js';
import { buildBotanicalTrees } from '../assets/terrain/trees.js';
import { buildLandmarks } from '../assets/terrain/landmarks.js';
import { buildTerrainAndWater } from '../assets/terrain/terrain-water.js';
import {
  BUILDINGS,
  TREES,
  INNER_EXTENT,
  terrainHeightAt,
} from '../assets/terrain/geography.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BAKE_SIZE = 1024; // 1024x1024 RGBA (with 1.5-texel SDF cel contour gradient)
const WORLD_SPAN = INNER_EXTENT * 2; // 340.0m (-170..+170)
const GRID_RES = 128; // 128x128 spatial acceleration grid across [-170..+170]m
const CELL_SIZE = WORLD_SPAN / GRID_RES; // 2.65625m per cell

function normalize3(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

// 3 Time-of-Day Light Directions (Rays trace from ground TOWARD the light source)
// Artistic Ghibli sun elevations so 8.5m Tudor roofs, chimneys, and trees cast sweeping shadows across plazas & roads:
const DIR_DAY = normalize3(-0.68, 0.38, -0.62);
const DIR_GOLDEN = normalize3(-0.78, 0.24, -0.58);
const DIR_NIGHT = normalize3(0.58, 0.38, -0.72);

/**
 * Build a 5-ray jittered cone around a primary light direction `dir`
 * so the baked shadow edge has a smooth ~1.5-texel gradient for `smoothstep` cel-stepping.
 */
function buildConeRays(dir, spread = 0.028) {
  const [dx, dy, dz] = dir;
  // Orthonormal tangent basis (tx, ty, tz) and (bx, by, bz)
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dy) > 0.9) {
    ux = 1; uy = 0; uz = 0;
  }
  let tx = uy * dz - uz * dy;
  let ty = uz * dx - ux * dz;
  let tz = ux * dy - uy * dx;
  const tLen = Math.hypot(tx, ty, tz) || 1;
  tx /= tLen; ty /= tLen; tz /= tLen;

  const bx = dy * tz - dz * ty;
  const by = dz * tx - dx * tz;
  const bz = dx * ty - dy * tx;

  const offsets = [
    [0.0, 0.0, 0.36],       // Center ray (highest weight)
    [spread, 0.0, 0.16],    // +Tangent
    [-spread, 0.0, 0.16],   // -Tangent
    [0.0, spread, 0.16],    // +Bitangent
    [0.0, -spread, 0.16],   // -Bitangent
  ];

  return offsets.map(([ox, oy, weight]) => {
    const [rx, ry, rz] = normalize3(
      dx + tx * ox + bx * oy,
      dy + ty * ox + by * oy,
      dz + tz * ox + bz * oy
    );
    return { dx: rx, dy: ry, dz: rz, weight };
  });
}

const CONE_DAY = buildConeRays(DIR_DAY, 0.026);
const CONE_GOLDEN = buildConeRays(DIR_GOLDEN, 0.024);
const CONE_NIGHT = buildConeRays(DIR_NIGHT, 0.026);

// 16 Azimuthal 360° Ground-Contact AO Rays (2 rings of 8 directions at shallow upward elevation)
const AO_RAYS = [];
for (let i = 0; i < 16; i++) {
  const ang = (i / 16) * Math.PI * 2;
  const elev = i % 2 === 0 ? 0.24 : 0.46;
  const horiz = Math.sqrt(1.0 - elev * elev);
  AO_RAYS.push({
    dx: Math.cos(ang) * horiz,
    dy: elev,
    dz: Math.sin(ang) * horiz,
  });
}

/* ------------------------------------------------------------------------- */
/* 1. Extract All Static 3D Shadow-Casting Triangles in World Space          */
/* ------------------------------------------------------------------------- */

console.log('[Bake] Constructing 3D Houses, Landmarks, Cliff Buttresses & Botanical Trees...');
const tStart = performance.now();

const housesKit = createHousesKit(null);
const village = housesKit.buildAllVillageBuildings(BUILDINGS);
village.group.updateMatrixWorld(true);

const landmarksSys = buildLandmarks({ includeBuildings: false });
landmarksSys.group.updateMatrixWorld(true);

const treesSys = buildBotanicalTrees();
treesSys.group.updateMatrixWorld(true);

const terrainSys = buildTerrainAndWater(null, {
  includeBuildings: false,
  includeHorizonClouds: false,
  includeConeMountains: false,
});
terrainSys.horizonGroup.updateMatrixWorld(true);

// Triangle storage arrays (packed into Float32Array / Uint8Array after collection)
// kind: 0 = solid architecture/boulder/wall/fence/trunk, 1 = gouache leaf card, 2 = 3D wisteria/sakura raceme
const rawTris = [];

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function pushTriangle(v0, v1, v2, kind = 0, cardCoords = null, triSeed = 0, castsAO = true) {
  const minX = Math.min(v0.x, v1.x, v2.x);
  const maxX = Math.max(v0.x, v1.x, v2.x);
  const minY = Math.min(v0.y, v1.y, v2.y);
  const maxY = Math.max(v0.y, v1.y, v2.y);
  const minZ = Math.min(v0.z, v1.z, v2.z);
  const maxZ = Math.max(v0.z, v1.z, v2.z);

  if (maxX < -INNER_EXTENT || minX > INNER_EXTENT || maxZ < -INNER_EXTENT || minZ > INNER_EXTENT) {
    return;
  }

  // Skip degenerate zero-area triangles
  const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
  const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  if (nx * nx + ny * ny + nz * nz < 1e-8) return;

  rawTris.push({
    v0x: v0.x, v0y: v0.y, v0z: v0.z,
    e1x, e1y, e1z,
    e2x, e2y, e2z,
    minX, maxX, minY, maxY, minZ, maxZ,
    kind,
    castsAO: castsAO ? 1 : 0,
    lx0: cardCoords ? cardCoords[0] : 0,
    ly0: cardCoords ? cardCoords[1] : 0,
    lx1: cardCoords ? cardCoords[2] : 0,
    ly1: cardCoords ? cardCoords[3] : 0,
    lx2: cardCoords ? cardCoords[4] : 0,
    ly2: cardCoords ? cardCoords[5] : 0,
    seed: triSeed,
  });
}

function extractSolidGroupTriangles(rootGroup, { isLandmarks = false } = {}) {
  let countBefore = rawTris.length;
  rootGroup.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData?.isOutline || child.name?.includes('outline')) return;
    if (child.name?.endsWith('-emissive') || child.userData?.unlit) return;
    if (child.material?.side === THREE.BackSide) return;

    const geo = child.geometry;
    const pos = geo?.attributes?.position;
    if (!pos) return;
    const mat = child.matrixWorld;
    const index = geo.index;
    const triCount = index ? index.count / 3 : pos.count / 3;

    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      _v0.fromBufferAttribute(pos, i0).applyMatrix4(mat);
      _v1.fromBufferAttribute(pos, i1).applyMatrix4(mat);
      _v2.fromBufferAttribute(pos, i2).applyMatrix4(mat);

      const relY0 = _v0.y - terrainHeightAt(_v0.x, _v0.z);
      const relY1 = _v1.y - terrainHeightAt(_v1.x, _v1.z);
      const relY2 = _v2.y - terrainHeightAt(_v2.x, _v2.z);
      const maxRelY = Math.max(relY0, relY1, relY2);
      const minRelY = Math.min(relY0, relY1, relY2);

      // Skip flat ground curb rings / flush surface discs (maxRelY < 0.14m)
      if (maxRelY < 0.14) continue;

      const cx = (_v0.x + _v1.x + _v2.x) / 3;
      const cz = (_v0.z + _v1.z + _v2.z) / 3;

      // On the Northern Shrine Staircase ramp (z = -17.5..-71.8, |x| < 5.65),
      // skip the flush stair tread boxes and low inner divider spines so they don't self-shadow the ramp,
      // while keeping the stone wing balustrades (|x| >= 5.65), bastions, and lantern pillars!
      if (isLandmarks && Math.abs(cx) < 5.65 && cz <= -17.5 && cz >= -71.8 && maxRelY < 0.85) {
        continue;
      }

      const castsAO = minRelY <= 2.4 && maxRelY >= 0.05;
      pushTriangle(_v0, _v1, _v2, 0, null, t, castsAO);
    }
  });
  return rawTris.length - countBefore;
}

function uvToCardLocal(u, v) {
  const lx = u >= 0.5 ? (u - 0.75) / 0.24 : (u - 0.25) / 0.24;
  const ly = (v - 0.50) / 0.48;
  return [lx, ly];
}

function extractTreeTriangles(treeGroup) {
  let countBefore = rawTris.length;
  const _instMat = new THREE.Matrix4();
  const _combinedMat = new THREE.Matrix4();
  treeGroup.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData?.isOutline || child.name?.includes('outline')) return;

    const geo = child.geometry;
    const pos = geo?.attributes?.position;
    const uv = geo?.attributes?.uv;
    const cardModes = geo?.attributes?.aCardMode;
    if (!pos) return;

    const index = geo.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    const instCount = child.isInstancedMesh ? child.count : 1;

    for (let inst = 0; inst < instCount; inst++) {
      if (child.isInstancedMesh) {
        child.getMatrixAt(inst, _instMat);
        _combinedMat.multiplyMatrices(child.matrixWorld, _instMat);
      } else {
        _combinedMat.copy(child.matrixWorld);
      }

      for (let t = 0; t < triCount; t++) {
        const i0 = index ? index.getX(t * 3) : t * 3;
        const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

        _v0.fromBufferAttribute(pos, i0).applyMatrix4(_combinedMat);
        _v1.fromBufferAttribute(pos, i1).applyMatrix4(_combinedMat);
        _v2.fromBufferAttribute(pos, i2).applyMatrix4(_combinedMat);

        const mode = child.isInstancedMesh ? 2 : (cardModes ? Math.round(cardModes.getX(i0)) : 0);
        const cx = (_v0.x + _v1.x + _v2.x) / 3;
        const cz = (_v0.z + _v1.z + _v2.z) / 3;
        const groundY = terrainHeightAt(cx, cz);
        const minRelY = Math.min(_v0.y, _v1.y, _v2.y) - groundY;
        const maxRelY = Math.max(_v0.y, _v1.y, _v2.y) - groundY;
        if (maxRelY < 0.05) continue;

        if (mode === 1 && uv) {
          const [lx0, ly0] = uvToCardLocal(uv.getX(i0), uv.getY(i0));
          const [lx1, ly1] = uvToCardLocal(uv.getX(i1), uv.getY(i1));
          const [lx2, ly2] = uvToCardLocal(uv.getX(i2), uv.getY(i2));
          const seed = ((t >> 2) * 1.37) % 6.2831853;
          pushTriangle(_v0, _v1, _v2, 1, [lx0, ly0, lx1, ly1, lx2, ly2], seed, false);
        } else if (mode === 2) {
          pushTriangle(_v0, _v1, _v2, 2, null, t + inst * 97, false);
        } else {
          // Trunk & boughs (mode === 0): cast ground Contact AO near the trunk base!
          const castsAO = minRelY <= 2.4 && maxRelY >= 0.05;
          pushTriangle(_v0, _v1, _v2, 0, null, t, castsAO);
        }
      }
    }
  });
  return rawTris.length - countBefore;
}

const houseTriCount = extractSolidGroupTriangles(village.group, { isLandmarks: false });
const landmarkTriCount = extractSolidGroupTriangles(landmarksSys.group, { isLandmarks: true });
const cliffTriCount = extractSolidGroupTriangles(terrainSys.horizonGroup, { isLandmarks: false });
const treeTriCount = extractTreeTriangles(treesSys.group);
const totalTris = rawTris.length;

console.log(
  `[Bake] Extracted ${totalTris.toLocaleString()} world-space triangles ` +
  `(Houses: ${houseTriCount.toLocaleString()}, Landmarks/Boulders/Walls: ${landmarkTriCount.toLocaleString()}, ` +
  `Waterfall Cliffs: ${cliffTriCount.toLocaleString()}, Trees/Wisteria: ${treeTriCount.toLocaleString()}).`
);

/* ------------------------------------------------------------------------- */
/* 2. Pack Triangles into TypedArrays & Build 128x128 Spatial Grid           */
/* ------------------------------------------------------------------------- */

// 15 floats per triangle for fast cache-local access:
// [0..2]: v0x, v0y, v0z
// [3..5]: e1x, e1y, e1z
// [6..8]: e2x, e2y, e2z
// [9..14]: minX, maxX, minY, maxY, minZ, maxZ
const triData = new Float32Array(totalTris * 15);
// 7 floats per triangle for leaf-card local coords + seed:
// [0..5]: lx0, ly0, lx1, ly1, lx2, ly2, [6]: seed
const triCardData = new Float32Array(totalTris * 7);
const triKind = new Uint8Array(totalTris);
const triCastsAO = new Uint8Array(totalTris);

let globalMaxCasterY = -999;

for (let i = 0; i < totalTris; i++) {
  const t = rawTris[i];
  const base = i * 15;
  triData[base + 0] = t.v0x;
  triData[base + 1] = t.v0y;
  triData[base + 2] = t.v0z;
  triData[base + 3] = t.e1x;
  triData[base + 4] = t.e1y;
  triData[base + 5] = t.e1z;
  triData[base + 6] = t.e2x;
  triData[base + 7] = t.e2y;
  triData[base + 8] = t.e2z;
  triData[base + 9] = t.minX;
  triData[base + 10] = t.maxX;
  triData[base + 11] = t.minY;
  triData[base + 12] = t.maxY;
  triData[base + 13] = t.minZ;
  triData[base + 14] = t.maxZ;

  const cBase = i * 7;
  triCardData[cBase + 0] = t.lx0;
  triCardData[cBase + 1] = t.ly0;
  triCardData[cBase + 2] = t.lx1;
  triCardData[cBase + 3] = t.ly1;
  triCardData[cBase + 4] = t.lx2;
  triCardData[cBase + 5] = t.ly2;
  triCardData[cBase + 6] = t.seed;

  triKind[i] = t.kind;
  triCastsAO[i] = t.castsAO;
  if (t.maxY > globalMaxCasterY) globalMaxCasterY = t.maxY;
}

const numCells = GRID_RES * GRID_RES;
const cellBuckets = Array.from({ length: numCells }, () => []);
const cellAOBuckets = Array.from({ length: numCells }, () => []);
const cellMaxY = new Float32Array(numCells).fill(-999);

function worldToCell(w) {
  const idx = Math.floor(((w + INNER_EXTENT) / WORLD_SPAN) * GRID_RES);
  return idx < 0 ? 0 : idx >= GRID_RES ? GRID_RES - 1 : idx;
}

for (let i = 0; i < totalTris; i++) {
  const base = i * 15;
  const minX = triData[base + 9];
  const maxX = triData[base + 10];
  const maxY = triData[base + 12];
  const minZ = triData[base + 13];
  const maxZ = triData[base + 14];

  const gx0 = worldToCell(minX);
  const gx1 = worldToCell(maxX);
  const gz0 = worldToCell(minZ);
  const gz1 = worldToCell(maxZ);

  for (let gz = gz0; gz <= gz1; gz++) {
    const rowOff = gz * GRID_RES;
    for (let gx = gx0; gx <= gx1; gx++) {
      const c = rowOff + gx;
      cellBuckets[c].push(i);
      if (maxY > cellMaxY[c]) cellMaxY[c] = maxY;
    }
  }

  // Also index AO-casting triangles with a 1.35m pad so a single cell lookup finds all nearby AO triangles
  if (triCastsAO[i]) {
    const agx0 = worldToCell(minX - 1.4);
    const agx1 = worldToCell(maxX + 1.4);
    const agz0 = worldToCell(minZ - 1.4);
    const agz1 = worldToCell(maxZ + 1.4);
    for (let gz = agz0; gz <= agz1; gz++) {
      const rowOff = gz * GRID_RES;
      for (let gx = agx0; gx <= agx1; gx++) {
        cellAOBuckets[rowOff + gx].push(i);
      }
    }
  }
}

// Flatten grid buckets into contiguous Int32Arrays
const cellOffsets = new Int32Array(numCells);
const cellCounts = new Int32Array(numCells);
let totalRefs = 0;
for (let c = 0; c < numCells; c++) {
  cellOffsets[c] = totalRefs;
  cellCounts[c] = cellBuckets[c].length;
  totalRefs += cellBuckets[c].length;
}
const cellTriIndices = new Int32Array(totalRefs);
for (let c = 0; c < numCells; c++) {
  const b = cellBuckets[c];
  const off = cellOffsets[c];
  for (let k = 0; k < b.length; k++) {
    cellTriIndices[off + k] = b[k];
  }
}

const cellAOOffsets = new Int32Array(numCells);
const cellAOCounts = new Int32Array(numCells);
let totalAORefs = 0;
for (let c = 0; c < numCells; c++) {
  cellAOOffsets[c] = totalAORefs;
  cellAOCounts[c] = cellAOBuckets[c].length;
  totalAORefs += cellAOBuckets[c].length;
}
const cellAOTriIndices = new Int32Array(totalAORefs);
for (let c = 0; c < numCells; c++) {
  const b = cellAOBuckets[c];
  const off = cellAOOffsets[c];
  for (let k = 0; k < b.length; k++) {
    cellAOTriIndices[off + k] = b[k];
  }
}

// 3x3 dilated occupancy mask so empty meadow rays can early-out all 5 cone samples
const cellHasNearbyCasters = new Uint8Array(numCells);
for (let gz = 0; gz < GRID_RES; gz++) {
  for (let gx = 0; gx < GRID_RES; gx++) {
    let any = 0;
    for (let dz = -1; dz <= 1; dz++) {
      const nz = gz + dz;
      if (nz < 0 || nz >= GRID_RES) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = gx + dx;
        if (nx < 0 || nx >= GRID_RES) continue;
        if (cellCounts[nz * GRID_RES + nx] > 0) {
          any = 1;
          break;
        }
      }
      if (any) break;
    }
    cellHasNearbyCasters[gz * GRID_RES + gx] = any;
  }
}

console.log(
  `[Bake] Built ${GRID_RES}x${GRID_RES} spatial grid (${totalRefs.toLocaleString()} shadow refs, ${totalAORefs.toLocaleString()} AO refs).`
);

/* ------------------------------------------------------------------------- */
/* 3. Fast 2D DDA Grid Raytracer & 360° Ground-Contact AO Evaluator          */
/* ------------------------------------------------------------------------- */

const triRayStamp = new Int32Array(totalTris);
let currentRayId = 1;

/**
 * Traces a single ray `(ox, oy, oz) + t * (dx, dy, dz)` through the 128x128 spatial grid.
 * Returns `{ shadow: 0..1, touchedNearCaster: boolean }`.
 */
function traceShadowRay(ox, oy, oz, dx, dy, dz, maxDist = 28.0) {
  const rayId = ++currentRayId;
  const tLimit = Math.min(maxDist, Math.max(1.5, (globalMaxCasterY - oy) / Math.max(0.1, dy)));

  let gx = Math.floor(((ox + INNER_EXTENT) / WORLD_SPAN) * GRID_RES);
  let gz = Math.floor(((oz + INNER_EXTENT) / WORLD_SPAN) * GRID_RES);
  if (gx < 0 || gx >= GRID_RES || gz < 0 || gz >= GRID_RES) {
    return { shadow: 0.0, touchedNearCaster: false };
  }

  const stepX = dx >= 0 ? 1 : -1;
  const stepZ = dz >= 0 ? 1 : -1;
  const invDx = Math.abs(dx) > 1e-6 ? 1.0 / dx : 1e12;
  const invDz = Math.abs(dz) > 1e-6 ? 1.0 / dz : 1e12;

  const nextBoundX = -INNER_EXTENT + (dx >= 0 ? gx + 1 : gx) * CELL_SIZE;
  const nextBoundZ = -INNER_EXTENT + (dz >= 0 ? gz + 1 : gz) * CELL_SIZE;
  let tMaxX = (nextBoundX - ox) * invDx;
  let tMaxZ = (nextBoundZ - oz) * invDz;
  const tDeltaX = Math.abs(CELL_SIZE * invDx);
  const tDeltaZ = Math.abs(CELL_SIZE * invDz);

  let tCurr = 0.0;
  let shadow = 0.0;
  let touchedNearCaster = false;

  while (tCurr < tLimit && gx >= 0 && gx < GRID_RES && gz >= 0 && gz < GRID_RES) {
    const cellIdx = gz * GRID_RES + gx;
    if (cellHasNearbyCasters[cellIdx]) {
      touchedNearCaster = true;
    }

    const count = cellCounts[cellIdx];
    const tNext = Math.min(tLimit, tMaxX < tMaxZ ? tMaxX : tMaxZ);
    const rayYEnter = oy + tCurr * dy;

    if (count > 0 && rayYEnter <= cellMaxY[cellIdx] + 0.05) {
      const rayYExit = oy + tNext * dy;
      const off = cellOffsets[cellIdx];

      for (let k = 0; k < count; k++) {
        const tri = cellTriIndices[off + k];
        if (triRayStamp[tri] === rayId) continue;
        triRayStamp[tri] = rayId;

        const base = tri * 15;
        // Fast vertical AABB cull along this ray segment
        if (rayYEnter > triData[base + 12] + 0.1 || rayYExit < triData[base + 11] - 0.5) {
          continue;
        }

        // Möller–Trumbore ray-triangle intersection
        const v0x = triData[base + 0], v0y = triData[base + 1], v0z = triData[base + 2];
        const e1x = triData[base + 3], e1y = triData[base + 4], e1z = triData[base + 5];
        const e2x = triData[base + 6], e2y = triData[base + 7], e2z = triData[base + 8];

        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-7 && det < 1e-7) continue;
        const invDet = 1.0 / det;

        const tx = ox - v0x;
        const ty = oy - v0y;
        const tz = oz - v0z;
        const u = (tx * px + ty * py + tz * pz) * invDet;
        if (u < 0.0 || u > 1.0) continue;

        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * invDet;
        if (v < 0.0 || u + v > 1.0) continue;

        const tHit = (e2x * qx + e2y * qy + e2z * qz) * invDet;
        if (tHit <= 0.04 || tHit > tLimit) continue;

        const kind = triKind[tri];
        if (kind === 0) {
          // Solid architecture, boulder, wall, fence, shrine arch, or tree trunk/bough
          return { shadow: 1.0, touchedNearCaster: true };
        } else if (kind === 1) {
          // Gouache leaf-cluster card: evaluate star-burst leaf silhouette & natural canopy gaps
          const cBase = tri * 7;
          const w0 = 1.0 - u - v;
          const lx = w0 * triCardData[cBase + 0] + u * triCardData[cBase + 2] + v * triCardData[cBase + 4];
          const ly = w0 * triCardData[cBase + 1] + u * triCardData[cBase + 3] + v * triCardData[cBase + 5];
          const rCard = Math.hypot(lx, ly);
          const ang = Math.atan2(ly, lx);
          const seed = triCardData[cBase + 6];
          const rMax = 0.85 + 0.15 * Math.cos(ang * 12.0 + seed) + 0.08 * Math.sin(ang * 5.0 - seed);
          if (rCard <= rMax) {
            // Subtle leaf-gap perforation in outer fringe so dappled sunlight filters through
            const gapCheck = Math.sin(lx * 6.8 + seed) * Math.cos(ly * 6.8 - seed * 1.3);
            if (rCard > 0.46 && gapCheck > 0.58) {
              shadow += 0.22;
            } else {
              shadow += 0.68;
            }
            if (shadow >= 0.98) {
              return { shadow: 1.0, touchedNearCaster: true };
            }
          }
        } else {
          // 3D Shingled-Petal Wisteria / Sakura Raceme
          shadow += 0.64;
          if (shadow >= 0.98) {
            return { shadow: 1.0, touchedNearCaster: true };
          }
        }
      }
    }

    if (tMaxX < tMaxZ) {
      tCurr = tMaxX;
      tMaxX += tDeltaX;
      gx += stepX;
    } else {
      tCurr = tMaxZ;
      tMaxZ += tDeltaZ;
      gz += stepZ;
    }
  }

  return { shadow: Math.min(1.0, shadow), touchedNearCaster };
}

function evalConeShadow(ox, oy, oz, coneRays, maxDist = 28.0) {
  // Trace center ray first; if it doesn't even pass near any caster cell, all 5 cone rays are 0!
  const c0 = coneRays[0];
  const first = traceShadowRay(ox, oy, oz, c0.dx, c0.dy, c0.dz, maxDist);
  if (!first.touchedNearCaster && first.shadow === 0.0) {
    return 0.0;
  }
  let acc = first.shadow * c0.weight;
  for (let i = 1; i < coneRays.length; i++) {
    const r = coneRays[i];
    const res = traceShadowRay(ox, oy, oz, r.dx, r.dy, r.dz, maxDist);
    acc += res.shadow * r.weight;
  }
  return Math.min(1.0, acc);
}

/**
 * Computes 2D point-to-triangle XZ distance squared for exact ground-contact proximity AO.
 */
function pointToTriXZDistSq(px, pz, ax, az, bx, bz, cx, cz) {
  const v0x = cx - ax, v0z = cz - az;
  const v1x = bx - ax, v1z = bz - az;
  const v2x = px - ax, v2z = pz - az;

  const dot00 = v0x * v0x + v0z * v0z;
  const dot01 = v0x * v1x + v0z * v1z;
  const dot02 = v0x * v2x + v0z * v2z;
  const dot11 = v1x * v1x + v1z * v1z;
  const dot12 = v1x * v2x + v1z * v2z;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) > 1e-8) {
    const invDenom = 1.0 / denom;
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
    if (u >= 0.0 && v >= 0.0 && u + v <= 1.0) {
      return 0.0; // Inside triangle XZ projection
    }
  }

  // Minimum distance to the 3 edges in XZ
  const segDistSq = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-8) return (px - x0) * (px - x0) + (pz - z0) * (pz - z0);
    let t = ((px - x0) * dx + (pz - z0) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = x0 + t * dx - px;
    const qz = z0 + t * dz - pz;
    return qx * qx + qz * qz;
  };

  return Math.min(
    segDistSq(ax, az, bx, bz),
    segDistSq(bx, bz, cx, cz),
    segDistSq(cx, cz, ax, az)
  );
}

/**
 * Evaluates Channel A: 360° Ground-Contact Ambient Occlusion within 0.0m..1.35m of every
 * house foundation, boulder base, dry-stone wall, fence post, well base, shrine arch, and tree trunk.
 */
function evalContactAO(wx, groundY, wz) {
  const gx = worldToCell(wx);
  const gz = worldToCell(wz);
  const cellIdx = gz * GRID_RES + gx;
  const count = cellAOCounts[cellIdx];
  if (count === 0) return 0.0;

  const off = cellAOOffsets[cellIdx];
  const maxReach = 1.35;
  const maxReachSq = maxReach * maxReach;

  // 1. Exact 2D distance-to-base proximity AO for all near-ground triangles (0.05m <= triY - groundY <= 2.4m)
  let proxAO = 0.0;
  for (let k = 0; k < count; k++) {
    const tri = cellAOTriIndices[off + k];
    const base = tri * 15;
    if (
      wx < triData[base + 9] - maxReach ||
      wx > triData[base + 10] + maxReach ||
      wz < triData[base + 13] - maxReach ||
      wz > triData[base + 14] + maxReach
    ) {
      continue;
    }

    const minY = triData[base + 11] - groundY;
    const maxY = triData[base + 12] - groundY;
    if (maxY < 0.05 || minY > 2.4) continue;

    const ax = triData[base + 0], az = triData[base + 2];
    const bx = ax + triData[base + 3], bz = az + triData[base + 5];
    const cx = ax + triData[base + 6], cz = az + triData[base + 8];

    const dSq = pointToTriXZDistSq(wx, wz, ax, az, bx, bz, cx, cz);
    if (dSq < maxReachSq) {
      const d = Math.sqrt(dSq);
      const t = 1.0 - d / maxReach;
      // Smooth hermite falloff weighted by how close the triangle sits to the ground
      const groundWeight = minY < 0.85 ? 1.0 : Math.max(0.0, 1.0 - (minY - 0.85) / 1.55);
      const aoContrib = t * t * (3.0 - 2.0 * t) * groundWeight;
      if (aoContrib > proxAO) proxAO = aoContrib;
    }
  }

  // 2. 16-Ray 360° Low-Hemisphere Raytraced Contact Occlusion (captures crevices & wall corners)
  let rayHits = 0.0;
  const oy = groundY + 0.14;
  for (let r = 0; r < AO_RAYS.length; r++) {
    const ray = AO_RAYS[r];
    const dx = ray.dx, dy = ray.dy, dz = ray.dz;
    let bestHit = 0.0;

    for (let k = 0; k < count; k++) {
      const tri = cellAOTriIndices[off + k];
      const base = tri * 15;
      if (oy > triData[base + 12] + 0.1 || oy + maxReach * dy < triData[base + 11] - 0.1) continue;

      const v0x = triData[base + 0], v0y = triData[base + 1], v0z = triData[base + 2];
      const e1x = triData[base + 3], e1y = triData[base + 4], e1z = triData[base + 5];
      const e2x = triData[base + 6], e2y = triData[base + 7], e2z = triData[base + 8];

      const px = dy * e2z - dz * e2y;
      const py = dz * e2x - dx * e2z;
      const pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-7 && det < 1e-7) continue;
      const invDet = 1.0 / det;

      const tx = wx - v0x, ty = oy - v0y, tz = wz - v0z;
      const u = (tx * px + ty * py + tz * pz) * invDet;
      if (u < 0.0 || u > 1.0) continue;

      const qx = ty * e1z - tz * e1y;
      const qy = tz * e1x - tx * e1z;
      const qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * invDet;
      if (v < 0.0 || u + v > 1.0) continue;

      const tHit = (e2x * qx + e2y * qy + e2z * qz) * invDet;
      if (tHit > 0.02 && tHit < maxReach) {
        const w = 1.0 - tHit / maxReach;
        if (w > bestHit) bestHit = w;
        if (bestHit > 0.9) break;
      }
    }
    rayHits += bestHit;
  }
  const rayAO = Math.min(1.0, (rayHits / AO_RAYS.length) * 2.2);

  return Math.min(1.0, Math.max(proxAO * 0.92, Math.min(1.0, proxAO * 0.65 + rayAO * 0.65)));
}

/* ------------------------------------------------------------------------- */
/* 4. Raytrace All 4 Channels Across BAKE_SIZE x BAKE_SIZE                   */
/* ------------------------------------------------------------------------- */

console.log(`[Bake] Raytracing ${BAKE_SIZE}x${BAKE_SIZE} RGBA channels (R=Day, G=Golden, B=Night, A=Contact AO)...`);

const rawFloatRGBA = new Float32Array(BAKE_SIZE * BAKE_SIZE * 4);

for (let iz = 0; iz < BAKE_SIZE; iz++) {
  const wz = ((iz + 0.5) / BAKE_SIZE - 0.5) * WORLD_SPAN;
  // Smooth border fade near +-166..170m so outer skirt clamp has zero edge seam
  const edgeFadeZ = 1.0 - THREE.MathUtils.smoothstep(Math.abs(wz), 163.0, 169.5);

  if (iz % 128 === 0) {
    console.log(`  ... row ${iz}/${BAKE_SIZE} (${((iz / BAKE_SIZE) * 100).toFixed(0)}%)`);
  }

  for (let ix = 0; ix < BAKE_SIZE; ix++) {
    const wx = ((ix + 0.5) / BAKE_SIZE - 0.5) * WORLD_SPAN;
    const edgeFadeX = 1.0 - THREE.MathUtils.smoothstep(Math.abs(wx), 163.0, 169.5);
    const borderFade = edgeFadeX * edgeFadeZ;
    if (borderFade <= 0.001) continue;

    const groundY = terrainHeightAt(wx, wz);
    const oy = groundY + 0.09;

    const shdDay = evalConeShadow(wx, oy, wz, CONE_DAY, 44.0) * borderFade;
    const shdGolden = evalConeShadow(wx, oy, wz, CONE_GOLDEN, 58.0) * borderFade;
    const shdNight = evalConeShadow(wx, oy, wz, CONE_NIGHT, 44.0) * borderFade;
    const contactAO = evalContactAO(wx, groundY, wz) * borderFade;

    const idx = (iz * BAKE_SIZE + ix) * 4;
    rawFloatRGBA[idx + 0] = shdDay;
    rawFloatRGBA[idx + 1] = shdGolden;
    rawFloatRGBA[idx + 2] = shdNight;
    rawFloatRGBA[idx + 3] = contactAO;
  }
}

/* ------------------------------------------------------------------------- */
/* 5. Separable 1.5-Texel Anti-Aliased SDF Contour Smoothing Pass            */
/* ------------------------------------------------------------------------- */

console.log('[Bake] Applying separable 1.5-texel Gaussian contour filter for razor-sharp smoothstep cel edges...');

const tempFloatRGBA = new Float32Array(BAKE_SIZE * BAKE_SIZE * 4);
const outUint8RGBA = new Uint8Array(BAKE_SIZE * BAKE_SIZE * 4);

// 5-tap separable Gaussian kernel (sigma ~ 1.15 texels => ~1.5-texel transition band)
const K0 = 0.38;
const K1 = 0.24;
const K2 = 0.07;

// Horizontal pass
for (let iz = 0; iz < BAKE_SIZE; iz++) {
  const rowOff = iz * BAKE_SIZE;
  for (let ix = 0; ix < BAKE_SIZE; ix++) {
    const xM2 = Math.max(0, ix - 2);
    const xM1 = Math.max(0, ix - 1);
    const xP1 = Math.min(BAKE_SIZE - 1, ix + 1);
    const xP2 = Math.min(BAKE_SIZE - 1, ix + 2);

    const iM2 = (rowOff + xM2) * 4;
    const iM1 = (rowOff + xM1) * 4;
    const i0  = (rowOff + ix) * 4;
    const iP1 = (rowOff + xP1) * 4;
    const iP2 = (rowOff + xP2) * 4;

    for (let c = 0; c < 4; c++) {
      tempFloatRGBA[i0 + c] =
        rawFloatRGBA[i0 + c] * K0 +
        (rawFloatRGBA[iM1 + c] + rawFloatRGBA[iP1 + c]) * K1 +
        (rawFloatRGBA[iM2 + c] + rawFloatRGBA[iP2 + c]) * K2;
    }
  }
}

// Vertical pass + uint8 quantization
for (let iz = 0; iz < BAKE_SIZE; iz++) {
  const zM2 = Math.max(0, iz - 2) * BAKE_SIZE;
  const zM1 = Math.max(0, iz - 1) * BAKE_SIZE;
  const z0  = iz * BAKE_SIZE;
  const zP1 = Math.min(BAKE_SIZE - 1, iz + 1) * BAKE_SIZE;
  const zP2 = Math.min(BAKE_SIZE - 1, iz + 2) * BAKE_SIZE;

  for (let ix = 0; ix < BAKE_SIZE; ix++) {
    const iM2 = (zM2 + ix) * 4;
    const iM1 = (zM1 + ix) * 4;
    const i0  = (z0 + ix) * 4;
    const iP1 = (zP1 + ix) * 4;
    const iP2 = (zP2 + ix) * 4;

    for (let c = 0; c < 4; c++) {
      const val =
        tempFloatRGBA[i0 + c] * K0 +
        (tempFloatRGBA[iM1 + c] + tempFloatRGBA[iP1 + c]) * K1 +
        (tempFloatRGBA[iM2 + c] + tempFloatRGBA[iP2 + c]) * K2;
      if (c === 3) {
        // Encode Contact AO in [128..255] (255 = 0.0 AO open ground, 128 = 1.0 full AO;
        // decoded in GLSL as `clamp((1.0 - baked.a) * 2.0, 0.0, 1.0)`) so browser HTMLImageElement
        // premultiplied-alpha PNG decoding never zeroes out R, G, B where Contact AO is 0!
        outUint8RGBA[i0 + 3] = Math.max(128, Math.min(255, Math.round(255 * (1.0 - 0.5 * val))));
      } else {
        outUint8RGBA[i0 + c] = Math.max(0, Math.min(255, Math.round(val * 255)));
      }
    }
  }
}

/* ------------------------------------------------------------------------- */
/* 6. Encode 8-Bit RGBA PNG via Built-In `node:zlib`                         */
/* ------------------------------------------------------------------------- */

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(typeStr, dataBuf) {
  const typeBuf = Buffer.from(typeStr, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(dataBuf.length, 0);
  const crcInput = Buffer.concat([typeBuf, dataBuf]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
}

function encodeRGBA8Png(width, height, rgbaData) {
  const rowBytes = width * 4;
  const rawScanlines = Buffer.alloc((rowBytes + 1) * height);

  // Use PNG Sub filter (filter type 1) for compact lossless compression on smooth gradients
  for (let y = 0; y < height; y++) {
    const dstRow = y * (rowBytes + 1);
    rawScanlines[dstRow] = 1; // Filter type 1: Sub
    const srcRow = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const curr = rgbaData[srcRow + x];
      const left = x >= 4 ? rgbaData[srcRow + x - 4] : 0;
      rawScanlines[dstRow + 1 + x] = (curr - left) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 8 bits per channel
  ihdr[9] = 6;  // Color type 6: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const compressed = zlib.deflateSync(rawScanlines, { level: 6 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const outPath = path.resolve(__dirname, '../assets/terrain/baked-shadows-ao.png');
const pngBuf = encodeRGBA8Png(BAKE_SIZE, BAKE_SIZE, outUint8RGBA);
fs.writeFileSync(outPath, pngBuf);

// Gather channel diagnostics
let nonZeroR = 0, nonZeroG = 0, nonZeroB = 0, nonZeroA = 0;
for (let i = 0; i < BAKE_SIZE * BAKE_SIZE; i++) {
  if (outUint8RGBA[i * 4 + 0] > 16) nonZeroR++;
  if (outUint8RGBA[i * 4 + 1] > 16) nonZeroG++;
  if (outUint8RGBA[i * 4 + 2] > 16) nonZeroB++;
  if (outUint8RGBA[i * 4 + 3] < 247) nonZeroA++;
}
const totalTexels = BAKE_SIZE * BAKE_SIZE;
const elapsedSec = ((performance.now() - tStart) / 1000).toFixed(2);

console.log(
  `[Bake] Wrote ${outPath} (${(pngBuf.length / 1024).toFixed(1)} KB) in ${elapsedSec}s:\n` +
  `  - Channel R (Day Sun):         ${((nonZeroR / totalTexels) * 100).toFixed(2)}% shadowed texels\n` +
  `  - Channel G (Golden Hour Sun): ${((nonZeroG / totalTexels) * 100).toFixed(2)}% shadowed texels\n` +
  `  - Channel B (Night Moon):      ${((nonZeroB / totalTexels) * 100).toFixed(2)}% shadowed texels\n` +
  `  - Channel A (360° Contact AO): ${((nonZeroA / totalTexels) * 100).toFixed(2)}% occluded texels`
);
