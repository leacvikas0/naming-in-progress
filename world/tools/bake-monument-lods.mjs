#!/usr/bin/env node
// ============================================================================
// world/tools/bake-monument-lods.mjs
//
// Offline Monument LOD Pre-Baker for Amarante (`world/assets/models/inscriptions`).
// Eliminates 100% of runtime `buildWeldedMonumentGeometry` vertex-clustering work
// during boot by pre-baking 3 cleanly culled, welded LOD meshes into each GLB:
//   - `lod_inspect` (cellSize = 0, full relief & carvings)
//   - `lod_near`    (cellSize = 0.036m)
//   - `lod_far`     (cellSize = 0.075m)
//
// Preserves exact linear vertex colors (`COLOR_0`), normals (`NORMAL`),
// positions (`POSITION`), and underground / interior well culling rules.
// ZERO-SPOILER SAFE: operates strictly on binary geometry buffers.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';

const MODELS_DIR = path.resolve(import.meta.dirname, '../assets/models/inscriptions');

const TARGETS = [
  { file: 'site1-well-exposed.glb', stoneId: 'stone_plaza' },
  { file: 'site1-well-live.glb', stoneId: 'stone_plaza' },
  { file: 'site2-grove-exposed.glb', stoneId: 'stone_grove' },
  { file: 'site2-grove-live.glb', stoneId: 'stone_grove' },
  { file: 'site3-wall-exposed.glb', stoneId: 'stone_pier' },
  { file: 'site3-wall-live.glb', stoneId: 'stone_pier' },
];

const COMPONENT_BYTE_SIZES = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_COUNTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

function readAccessorArray(json, bin, accessorIndex) {
  const acc = json.accessors[accessorIndex];
  const bv = json.bufferViews[acc.bufferView];
  const compSize = COMPONENT_BYTE_SIZES[acc.componentType];
  const numComps = TYPE_COUNTS[acc.type];
  const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const byteStride = bv.byteStride || compSize * numComps;

  const out =
    acc.componentType === 5126
      ? new Float32Array(acc.count * numComps)
      : acc.componentType === 5125
        ? new Uint32Array(acc.count * numComps)
        : acc.componentType === 5123
          ? new Uint16Array(acc.count * numComps)
          : new Float32Array(acc.count * numComps);

  for (let i = 0; i < acc.count; i++) {
    const base = byteOffset + i * byteStride;
    for (let c = 0; c < numComps; c++) {
      const off = base + c * compSize;
      if (acc.componentType === 5126) {
        out[i * numComps + c] = bin.readFloatLE(off);
      } else if (acc.componentType === 5125) {
        out[i * numComps + c] = bin.readUInt32LE(off);
      } else if (acc.componentType === 5123) {
        out[i * numComps + c] = bin.readUInt16LE(off);
      } else if (acc.componentType === 5121) {
        const val = bin.readUInt8(off);
        out[i * numComps + c] = acc.normalized ? val / 255.0 : val;
      } else if (acc.componentType === 5122) {
        const val = bin.readInt16LE(off);
        out[i * numComps + c] = acc.normalized ? Math.max(-1, val / 32767.0) : val;
      }
    }
  }
  return { data: out, numComps, count: acc.count };
}

function buildWeldedMonumentData(srcPos, srcNorm, srcCol, triIndices, cellSize) {
  if (!triIndices || triIndices.length === 0) return null;

  if (cellSize <= 0) {
    const remap = new Map();
    const outPos = [];
    const outNorm = [];
    const outCol = [];
    const outIdx = [];
    let nextIdx = 0;
    for (let k = 0; k < triIndices.length; k++) {
      const vi = triIndices[k];
      let ni = remap.get(vi);
      if (ni === undefined) {
        ni = nextIdx++;
        remap.set(vi, ni);
        const p3 = vi * 3;
        const c4 = vi * 4;
        outPos.push(srcPos[p3], srcPos[p3 + 1], srcPos[p3 + 2]);
        outNorm.push(srcNorm[p3], srcNorm[p3 + 1], srcNorm[p3 + 2]);
        outCol.push(srcCol[c4], srcCol[c4 + 1], srcCol[c4 + 2]);
      }
      outIdx.push(ni);
    }
    return {
      positions: new Float32Array(outPos),
      normals: new Float32Array(outNorm),
      colors: new Float32Array(outCol),
      indices: new Uint32Array(outIdx),
    };
  }

  const invCell = 1.0 / cellSize;
  const clusterMap = new Map();
  const vertToCluster = new Map();
  const sumPos = [];
  const sumNorm = [];
  const sumCol = [];
  const counts = [];
  let clusterCount = 0;

  for (let k = 0; k < triIndices.length; k++) {
    const vi = triIndices[k];
    let ci = vertToCluster.get(vi);
    if (ci === undefined) {
      const p3 = vi * 3;
      const c4 = vi * 4;
      const x = srcPos[p3];
      const y = srcPos[p3 + 1];
      const z = srcPos[p3 + 2];
      const r = srcCol[c4];
      const g = srcCol[c4 + 1];
      const b = srcCol[c4 + 2];
      const isMoss = g > r * 1.03 && g > b * 1.2 ? 1 : 0;
      const gx = Math.round(x * invCell);
      const gy = Math.round(y * invCell);
      const gz = Math.round(z * invCell);
      const key = `${gx},${gy},${gz},${isMoss}`;
      ci = clusterMap.get(key);
      if (ci === undefined) {
        ci = clusterCount++;
        clusterMap.set(key, ci);
        sumPos.push(0, 0, 0);
        sumNorm.push(0, 0, 0);
        sumCol.push(0, 0, 0);
        counts.push(0);
      }
      vertToCluster.set(vi, ci);
      const cp3 = ci * 3;
      sumPos[cp3] += x;
      sumPos[cp3 + 1] += y;
      sumPos[cp3 + 2] += z;
      sumNorm[cp3] += srcNorm[p3];
      sumNorm[cp3 + 1] += srcNorm[p3 + 1];
      sumNorm[cp3 + 2] += srcNorm[p3 + 2];
      sumCol[cp3] += r;
      sumCol[cp3 + 1] += g;
      sumCol[cp3 + 2] += b;
      counts[ci] += 1;
    }
  }

  const outPos = new Float32Array(clusterCount * 3);
  const outNorm = new Float32Array(clusterCount * 3);
  const outCol = new Float32Array(clusterCount * 3);
  for (let i = 0; i < clusterCount; i++) {
    const inv = 1.0 / Math.max(1, counts[i]);
    const p3 = i * 3;
    outPos[p3] = sumPos[p3] * inv;
    outPos[p3 + 1] = sumPos[p3 + 1] * inv;
    outPos[p3 + 2] = sumPos[p3 + 2] * inv;
    const nx = sumNorm[p3];
    const ny = sumNorm[p3 + 1];
    const nz = sumNorm[p3 + 2];
    const nLen = Math.hypot(nx, ny, nz) || 1.0;
    outNorm[p3] = nx / nLen;
    outNorm[p3 + 1] = ny / nLen;
    outNorm[p3 + 2] = nz / nLen;
    outCol[p3] = sumCol[p3] * inv;
    outCol[p3 + 1] = sumCol[p3 + 1] * inv;
    outCol[p3 + 2] = sumCol[p3 + 2] * inv;
  }

  const outIdx = [];
  const seenTris = new Set();
  for (let k = 0; k < triIndices.length; k += 3) {
    const a = vertToCluster.get(triIndices[k]);
    const b = vertToCluster.get(triIndices[k + 1]);
    const c = vertToCluster.get(triIndices[k + 2]);
    if (a === b || b === c || c === a) continue;
    const min = Math.min(a, b, c);
    const max = Math.max(a, b, c);
    const mid = a + b + c - min - max;
    const tk = `${min},${mid},${max}`;
    if (seenTris.has(tk)) continue;
    seenTris.add(tk);
    outIdx.push(a, b, c);
  }

  return {
    positions: outPos,
    normals: outNorm,
    colors: outCol,
    indices: new Uint32Array(outIdx),
  };
}

function encodeGlbWithLods(lods) {
  const bufferChunks = [];
  let totalBytes = 0;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];

  const appendBytes = (typedArray, target) => {
    const pad = (4 - (totalBytes % 4)) % 4;
    if (pad > 0) {
      bufferChunks.push(Buffer.alloc(pad));
      totalBytes += pad;
    }
    const raw = Buffer.from(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength
    );
    const bvIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: totalBytes,
      byteLength: raw.byteLength,
      ...(target ? { target } : {}),
    });
    bufferChunks.push(raw);
    totalBytes += raw.byteLength;
    return bvIdx;
  };

  for (let li = 0; li < lods.length; li++) {
    const { name, data } = lods[li];
    const vertCount = Math.floor(data.positions.length / 3);

    // Compute exact POSITION min/max required by glTF 2.0 spec
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertCount; i++) {
      const p3 = i * 3;
      const x = data.positions[p3];
      const y = data.positions[p3 + 1];
      const z = data.positions[p3 + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    const posBv = appendBytes(data.positions, 34962);
    const posAcc = accessors.length;
    accessors.push({
      bufferView: posBv,
      componentType: 5126,
      count: vertCount,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });

    const normBv = appendBytes(data.normals, 34962);
    const normAcc = accessors.length;
    accessors.push({
      bufferView: normBv,
      componentType: 5126,
      count: vertCount,
      type: 'VEC3',
    });

    const colBv = appendBytes(data.colors, 34962);
    const colAcc = accessors.length;
    accessors.push({
      bufferView: colBv,
      componentType: 5126,
      count: vertCount,
      type: 'VEC3',
    });

    const useU16 = vertCount <= 65535;
    const idxArray = useU16 ? new Uint16Array(data.indices) : data.indices;
    const idxBv = appendBytes(idxArray, 34963);
    const idxAcc = accessors.length;
    accessors.push({
      bufferView: idxBv,
      componentType: useU16 ? 5123 : 5125,
      count: idxArray.length,
      type: 'SCALAR',
    });

    const meshIdx = meshes.length;
    meshes.push({
      name: `${name}_Mesh`,
      primitives: [
        {
          attributes: {
            POSITION: posAcc,
            NORMAL: normAcc,
            COLOR_0: colAcc,
          },
          indices: idxAcc,
          mode: 4,
        },
      ],
    });
    nodes.push({
      name,
      mesh: meshIdx,
    });
  }

  const binPad = (4 - (totalBytes % 4)) % 4;
  if (binPad > 0) {
    bufferChunks.push(Buffer.alloc(binPad));
    totalBytes += binPad;
  }
  const binChunk = Buffer.concat(bufferChunks);

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'Amarante-Monument-LOD-Baker/1.0',
    },
    scene: 0,
    scenes: [
      {
        name: 'MonumentLODs',
        nodes: nodes.map((_, idx) => idx),
      },
    ],
    nodes,
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binChunk.byteLength }],
  };

  let jsonStr = JSON.stringify(gltfJson);
  while (Buffer.byteLength(jsonStr, 'utf8') % 4 !== 0) {
    jsonStr += ' ';
  }
  const jsonChunk = Buffer.from(jsonStr, 'utf8');

  const totalFileLen = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
  const out = Buffer.alloc(totalFileLen);
  out.writeUInt32LE(0x46546c67, 0); // 'glTF'
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalFileLen, 8);
  out.writeUInt32LE(jsonChunk.byteLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonChunk.copy(out, 20);
  const binHdrOff = 20 + jsonChunk.byteLength;
  out.writeUInt32LE(binChunk.byteLength, binHdrOff);
  out.writeUInt32LE(0x004e4942, binHdrOff + 4); // 'BIN\0'
  binChunk.copy(out, binHdrOff + 8);
  return out;
}

async function bakeSingleGlb({ file, stoneId }) {
  const fullPath = path.join(MODELS_DIR, file);
  const buf = fs.readFileSync(fullPath);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binOff = 20 + jsonLen + 8;
  const bin = buf.subarray(binOff);

  // Idempotent: if already baked (`lod_inspect` exists), use `lod_inspect` as full-res source
  const inspectNode = (json.nodes || []).find((n) => n.name === 'lod_inspect');
  const sourcePrims = [];
  if (inspectNode && typeof inspectNode.mesh === 'number') {
    for (const p of json.meshes[inspectNode.mesh].primitives) {
      sourcePrims.push(p);
    }
  } else {
    for (const m of json.meshes || []) {
      for (const p of m.primitives || []) {
        sourcePrims.push(p);
      }
    }
  }

  const mergedPos = [];
  const mergedNorm = [];
  const mergedCol = [];
  const mergedIndices = [];
  let vertOffset = 0;

  for (const p of sourcePrims) {
    const posAcc = readAccessorArray(json, bin, p.attributes.POSITION);
    const normAcc =
      p.attributes.NORMAL !== undefined
        ? readAccessorArray(json, bin, p.attributes.NORMAL)
        : null;
    const colKey =
      p.attributes.COLOR_0 !== undefined
        ? 'COLOR_0'
        : p.attributes._COL_BAKED !== undefined
          ? '_COL_BAKED'
          : null;
    const colAcc = colKey ? readAccessorArray(json, bin, p.attributes[colKey]) : null;

    for (let i = 0; i < posAcc.count; i++) {
      mergedPos.push(
        posAcc.data[i * 3],
        posAcc.data[i * 3 + 1],
        posAcc.data[i * 3 + 2]
      );
      if (normAcc) {
        const nx = normAcc.data[i * 3];
        const ny = normAcc.data[i * 3 + 1];
        const nz = normAcc.data[i * 3 + 2];
        const len = Math.hypot(nx, ny, nz) || 1.0;
        mergedNorm.push(nx / len, ny / len, nz / len);
      } else {
        mergedNorm.push(0, 1, 0);
      }
      if (colAcc) {
        const nc = colAcc.numComps;
        const r = colAcc.data[i * nc];
        const g = colAcc.data[i * nc + 1];
        const b = colAcc.data[i * nc + 2];
        const a = nc >= 4 ? colAcc.data[i * nc + 3] : 1.0;
        mergedCol.push(r, g, b, a);
      } else {
        mergedCol.push(0.68, 0.59, 0.45, 1.0);
      }
    }

    if (p.indices !== undefined) {
      const idxAcc = readAccessorArray(json, bin, p.indices);
      for (let i = 0; i < idxAcc.count; i++) {
        mergedIndices.push(vertOffset + idxAcc.data[i]);
      }
    } else {
      for (let i = 0; i < posAcc.count; i++) {
        mergedIndices.push(vertOffset + i);
      }
    }
    vertOffset += posAcc.count;
  }

  const isPoemVert = new Uint8Array(vertOffset);
  for (let i = 0; i < vertOffset; i++) {
    const c4 = i * 4;
    const r = mergedCol[c4];
    const g = mergedCol[c4 + 1];
    const b = mergedCol[c4 + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const isPoemDark = lum < 0.085 && r >= g;
    const isPoemLip = lum > 0.75;
    if (isPoemDark || isPoemLip) {
      isPoemVert[i] = 1;
    }
  }

  const stoneIndices = [];
  const isGroveMedallion = stoneId === 'stone_grove';
  const isPlazaWell = stoneId === 'stone_plaza';

  for (let k = 0; k < mergedIndices.length; k += 3) {
    const i0 = mergedIndices[k];
    const i1 = mergedIndices[k + 1];
    const i2 = mergedIndices[k + 2];
    if (isPoemVert[i0] || isPoemVert[i1] || isPoemVert[i2]) {
      continue;
    }
    const y0 = mergedPos[i0 * 3 + 1];
    const y1 = mergedPos[i1 * 3 + 1];
    const y2 = mergedPos[i2 * 3 + 1];
    const ny0 = mergedNorm[i0 * 3 + 1];
    const ny1 = mergedNorm[i1 * 3 + 1];
    const ny2 = mergedNorm[i2 * 3 + 1];
    const cy = (y0 + y1 + y2) / 3.0;
    const cny = (ny0 + ny1 + ny2) / 3.0;

    if (y0 < 0.02 && y1 < 0.02 && y2 < 0.02 && cny < -0.7) continue;
    if (isGroveMedallion && (cy < -0.015 || cny < -0.35)) continue;
    if (!isGroveMedallion && cy < 0.04 && cny < -0.65) continue;
    if (isPlazaWell) {
      const cx = (mergedPos[i0 * 3] + mergedPos[i1 * 3] + mergedPos[i2 * 3]) / 3.0;
      const cz = (mergedPos[i0 * 3 + 2] + mergedPos[i1 * 3 + 2] + mergedPos[i2 * 3 + 2]) / 3.0;
      if (Math.hypot(cx, cz) < 0.82 && cy < 0.34) continue;
    }
    stoneIndices.push(i0, i1, i2);
  }

  const lodInspect = buildWeldedMonumentData(mergedPos, mergedNorm, mergedCol, stoneIndices, 0);
  const lodNear = buildWeldedMonumentData(mergedPos, mergedNorm, mergedCol, stoneIndices, 0.036);
  const lodFar = buildWeldedMonumentData(mergedPos, mergedNorm, mergedCol, stoneIndices, 0.075);

  const bakedBuf = encodeGlbWithLods([
    { name: 'lod_inspect', data: lodInspect },
    { name: 'lod_near', data: lodNear },
    { name: 'lod_far', data: lodFar },
  ]);

  // Verify roundtrip via Three.js GLTFLoader before writing
  const loader = new GLTFLoader();
  const ab = bakedBuf.buffer.slice(
    bakedBuf.byteOffset,
    bakedBuf.byteOffset + bakedBuf.byteLength
  );
  await new Promise((resolve, reject) => {
    loader.parse(
      ab,
      '',
      (gltf) => {
        const names = [];
        gltf.scene.traverse((o) => {
          if (o.isMesh && o.geometry?.attributes?.position) {
            names.push(`${o.name}(${o.geometry.attributes.position.count}v)`);
          }
        });
        if (names.length !== 3) {
          return reject(new Error(`Expected 3 LOD meshes in ${file}, got ${names.join(',')}`));
        }
        resolve(names);
      },
      reject
    );
  });

  fs.writeFileSync(fullPath, bakedBuf);
  console.log(
    `Baked ${file}: ` +
      `old=${(buf.byteLength / 1024).toFixed(1)}KB -> new=${(bakedBuf.byteLength / 1024).toFixed(1)}KB | ` +
      `inspect=${lodInspect.indices.length / 3}t, near=${lodNear.indices.length / 3}t, far=${lodFar.indices.length / 3}t`
  );
}

for (const tgt of TARGETS) {
  await bakeSingleGlb(tgt);
}
console.log('All 6 monument GLBs pre-baked & verified with GLTFLoader!');
