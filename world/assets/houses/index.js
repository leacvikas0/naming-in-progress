import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTextures, createTexturesAsync } from './textures.js';
import { createMaterials, makeOutlineMaterial, setHouseCutoutPlayerPos } from './materials.js';
export { setHouseCutoutPlayerPos };
import {
  TILE,
  box,
  cyl,
  sphere,
  quad,
  beamBetween,
  tileRoof,
  makeWall,
  windowUnit,
  doorUnit,
  quoinCorner,
  quoinPilaster,
  buildTimberFrame,
  buildMainGableRoof,
  buildLanternUnit,
  buildFrontSteps,
  computeDormerSpec,
  buildDormerUnit,
  buildChimneyUnit,
  buildPitchedDoorHood,
  buildFlushCrossGable,
  buildGreenhouseLeanTo,
  buildWoodenBarrel,
  buildCabbageHead,
  finalizeRoofTiles,
} from './parts.js';

function createLocalTimeSlicer(opts = {}) {
  if (opts && opts._isTimeSlicer) return opts;
  const yieldFrame =
    typeof opts.yieldFrame === 'function'
      ? opts.yieldFrame
      : () => new Promise((r) => setTimeout(r, 0));
  const sliceBudgetMs = Number(opts.sliceBudgetMs) > 0 ? Number(opts.sliceBudgetMs) : 5.0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let sliceStart = now();
  return {
    _isTimeSlicer: true,
    sliceBudgetMs,
    yieldFrame,
    async maybeYield(force = false) {
      if (force || now() - sliceStart >= sliceBudgetMs) {
        await yieldFrame();
        sliceStart = now();
      }
    },
  };
}

function runSync(gen) {
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

async function runAsync(gen, slicer) {
  let step = gen.next();
  while (!step.done) {
    await slicer.maybeYield();
    step = gen.next();
  }
  return step.value;
}

function* mergeGeometriesGen(geometries) {
  if (!geometries || geometries.length === 0) return null;
  if (geometries.length === 1) return mergeGeometries(geometries, false);

  const g0 = geometries[0];
  const isIndexed = g0.index !== null;
  const attrNames = Object.keys(g0.attributes);
  if (Object.keys(g0.morphAttributes || {}).length > 0) {
    return mergeGeometries(geometries, false);
  }

  let totalVerts = 0;
  let totalIndices = 0;
  const attrMeta = {};
  for (const name of attrNames) {
    const a = g0.attributes[name];
    attrMeta[name] = {
      TypedArray: a.array.constructor,
      itemSize: a.itemSize,
      normalized: a.normalized,
      totalLen: 0,
    };
  }

  for (let i = 0; i < geometries.length; i++) {
    const g = geometries[i];
    if ((g.index !== null) !== isIndexed) return mergeGeometries(geometries, false);
    const pos = g.attributes.position;
    if (!pos) return mergeGeometries(geometries, false);
    totalVerts += pos.count;
    if (isIndexed) totalIndices += g.index.count;
    if (Object.keys(g.attributes).length !== attrNames.length) {
      return mergeGeometries(geometries, false);
    }
    for (let k = 0; k < attrNames.length; k++) {
      const name = attrNames[k];
      const a = g.attributes[name];
      const m = attrMeta[name];
      if (!a || a.array.constructor !== m.TypedArray || a.itemSize !== m.itemSize) {
        return mergeGeometries(geometries, false);
      }
      m.totalLen += a.count * m.itemSize;
    }
  }

  const merged = new THREE.BufferGeometry();

  if (isIndexed) {
    const IdxArray = totalVerts <= 65535 ? Uint16Array : Uint32Array;
    const outIdx = new IdxArray(totalIndices);
    let idxCursor = 0;
    let vertOffset = 0;
    let sinceYield = 0;
    for (let i = 0; i < geometries.length; i++) {
      const g = geometries[i];
      const srcIdx = g.index.array;
      const cnt = g.index.count;
      for (let j = 0; j < cnt; j++) {
        outIdx[idxCursor++] = srcIdx[j] + vertOffset;
      }
      vertOffset += g.attributes.position.count;
      sinceYield += cnt;
      if (sinceYield >= 1200) {
        sinceYield = 0;
        yield;
      }
    }
    merged.setIndex(new THREE.BufferAttribute(outIdx, 1));
    yield;
  }

  for (const name of attrNames) {
    const m = attrMeta[name];
    const outArr = new m.TypedArray(m.totalLen);
    let offset = 0;
    let sinceYield = 0;
    for (let i = 0; i < geometries.length; i++) {
      const srcAttr = geometries[i].attributes[name];
      const expected = srcAttr.count * m.itemSize;
      const srcArr =
        srcAttr.array.length === expected
          ? srcAttr.array
          : srcAttr.array.subarray(0, expected);
      outArr.set(srcArr, offset);
      offset += expected;
      sinceYield += srcAttr.count;
      if (sinceYield >= 1200 || (i & 7) === 7) {
        sinceYield = 0;
        yield;
      }
    }
    merged.setAttribute(name, new THREE.BufferAttribute(outArr, m.itemSize, m.normalized));
  }

  return merged;
}

function* buildCoreShellGen(
  add,
  place,
  materials,
  {
    w,
    d,
    wallH,
    roofH,
    plinthH = 0.55,
    subDepth = 1.5,
    floorY = null,
    stoneLowerH = 0,
    winSideX = 2.8,
    upperWins = false,
    centerUpperWin = false,
    sideWinLeft = true,
    sideWinRight = true,
    pilasters = false,
    skipRightGableCenter = false,
    seed = 10,
    skipFront = null,
  },
) {
  const eaveY = plinthH + wallH;
  const ridgeY = eaveY + roofH;
  const doorW = 1.44;
  const doorH = 2.38;
  const winW = 1.1;
  const winH = 1.36;
  const groundWinY = 0.58;
  const upperWinY = 3.36;
  const centerUpperWinY = 3.42;

  const totalH = plinthH + subDepth;
  const plinthBase = box(w + 0.36, totalH, d + 0.36, materials.stone, { tile: TILE.stone, outline: 0.02 });
  plinthBase.position.set(0, plinthH - totalH / 2, 0);
  add(plinthBase);

  const plinthCap = box(w + 0.5, 0.08, d + 0.5, materials.stoneTrim, { tile: TILE.stone, outline: 0.014 });
  plinthCap.position.set(0, plinthH + 0.04, 0);
  add(plinthCap);
  yield;

  const plinthCorners = [
    { x: -w / 2, z: d / 2, ox: -1, oz: 1 },
    { x: w / 2, z: d / 2, ox: 1, oz: 1 },
    { x: -w / 2, z: -d / 2, ox: -1, oz: -1 },
    { x: w / 2, z: -d / 2, ox: 1, oz: -1 },
  ];
  for (let ci = 0; ci < plinthCorners.length; ci++) {
    add(quoinCorner(materials, { ...plinthCorners[ci], from: plinthH, to: eaveY }));
    if (ci % 2 === 1) yield;
  }

  if (pilasters) {
    for (const px of [-2.18, 2.18]) {
      add(quoinPilaster(materials, { x: px, from: plinthH, to: eaveY, z: d / 2, side: Math.sign(px) }));
      yield;
    }
  }

  const frontHoles = [
    { x: 0, y: 0, w: doorW, h: doorH, arch: doorW / 2 },
    { x: -winSideX, y: groundWinY, w: winW, h: winH },
    { x: winSideX, y: groundWinY, w: winW, h: winH },
  ];
  if (upperWins) {
    frontHoles.push(
      { x: -winSideX, y: upperWinY, w: winW, h: 1.32 },
      { x: winSideX, y: upperWinY, w: winW, h: 1.32 },
    );
  }
  if (centerUpperWin) {
    frontHoles.push({ x: 0, y: centerUpperWinY, w: 1.14, h: 1.32 });
  }

  const backHoles = [
    { x: -winSideX * 0.9, y: groundWinY + 0.04, w: winW, h: 1.34 },
    { x: winSideX * 0.9, y: groundWinY + 0.04, w: winW, h: 1.34 },
  ];
  if (upperWins) {
    backHoles.push({ x: 0, y: upperWinY, w: winW, h: 1.32 });
  }

  const leftHoles = sideWinLeft ? [{ x: 0, y: groundWinY + 0.04, w: winW, h: 1.34 }] : [];
  const rightHoles = sideWinRight ? [{ x: 0, y: groundWinY + 0.04, w: winW, h: 1.34 }] : [];

  if (stoneLowerH > 0) {
    const upperH = wallH - stoneLowerH;
    const lowFront = makeWall({ length: w, height: stoneLowerH, holes: frontHoles, material: materials.stone, tile: TILE.stone });
    lowFront.position.set(0, plinthH, d / 2);
    add(lowFront);
    yield;

    const upFront = makeWall({ length: w, height: upperH, material: materials.stucco });
    upFront.position.set(0, plinthH + stoneLowerH, d / 2);
    add(upFront);
    yield;

    const lowBack = makeWall({ length: w, height: stoneLowerH, holes: backHoles, material: materials.stone, tile: TILE.stone });
    lowBack.position.set(0, plinthH, -d / 2);
    lowBack.rotation.y = Math.PI;
    add(lowBack);
    yield;

    const upBack = makeWall({ length: w, height: upperH, material: materials.stucco });
    upBack.position.set(0, plinthH + stoneLowerH, -d / 2);
    upBack.rotation.y = Math.PI;
    add(upBack);
    yield;

    const sides = [
      [-1, -Math.PI / 2, leftHoles],
      [1, Math.PI / 2, rightHoles],
    ];
    for (let si = 0; si < sides.length; si++) {
      const [sx, rotY, sHoles] = sides[si];
      const lowSide = makeWall({ length: d, height: stoneLowerH, holes: sHoles, material: materials.stone, tile: TILE.stone });
      lowSide.position.set((sx * w) / 2, plinthH, 0);
      lowSide.rotation.y = rotY;
      add(lowSide);
      yield;

      const upSide = makeWall({ length: d, height: upperH, gableRise: roofH, material: materials.stucco });
      upSide.position.set((sx * w) / 2, plinthH + stoneLowerH, 0);
      upSide.rotation.y = rotY;
      add(upSide);
      yield;
    }

    const ledge = box(w + 0.44, 0.14, d + 0.44, materials.stoneTrim, { tile: TILE.stone, outline: 0.014 });
    ledge.position.set(0, plinthH + stoneLowerH + 0.02, 0);
    add(ledge);
  } else {
    const front = makeWall({ length: w, height: wallH, holes: frontHoles, material: materials.stucco });
    front.position.set(0, plinthH, d / 2);
    add(front);
    yield;

    const back = makeWall({ length: w, height: wallH, holes: backHoles, material: materials.stucco });
    back.position.set(0, plinthH, -d / 2);
    back.rotation.y = Math.PI;
    add(back);
    yield;

    const left = makeWall({ length: d, height: wallH, gableRise: roofH, holes: leftHoles, material: materials.stucco });
    left.position.set(-w / 2, plinthH, 0);
    left.rotation.y = -Math.PI / 2;
    add(left);
    yield;

    const right = makeWall({ length: d, height: wallH, gableRise: roofH, holes: rightHoles, material: materials.stucco });
    right.position.set(w / 2, plinthH, 0);
    right.rotation.y = Math.PI / 2;
    add(right);
    yield;
  }

  place(doorUnit(materials, { w: doorW, h: doorH }), 0, plinthH, d / 2);
  yield;

  place(windowUnit(materials, { w: winW, h: winH, seed: seed + 1 }), -winSideX, plinthH + groundWinY, d / 2);
  yield;
  place(windowUnit(materials, { w: winW, h: winH, seed: seed + 2 }), winSideX, plinthH + groundWinY, d / 2);
  yield;

  if (upperWins) {
    place(windowUnit(materials, { w: winW, h: 1.32, seed: seed + 3 }), -winSideX, plinthH + upperWinY, d / 2);
    yield;
    place(windowUnit(materials, { w: winW, h: 1.32, seed: seed + 4 }), winSideX, plinthH + upperWinY, d / 2);
    yield;
  }
  if (centerUpperWin) {
    place(windowUnit(materials, { w: 1.14, h: 1.32, cols: 3, shutters: false, seed: seed + 5 }), 0, plinthH + centerUpperWinY, d / 2);
    yield;
  }

  place(windowUnit(materials, { w: winW, h: 1.34, seed: seed + 6 }), -winSideX * 0.9, plinthH + groundWinY + 0.04, -d / 2, Math.PI);
  yield;
  place(windowUnit(materials, { w: winW, h: 1.34, seed: seed + 7 }), winSideX * 0.9, plinthH + groundWinY + 0.04, -d / 2, Math.PI);
  yield;
  if (upperWins) {
    place(windowUnit(materials, { w: winW, h: 1.32, seed: seed + 8 }), 0, plinthH + upperWinY, -d / 2, Math.PI);
    yield;
  }
  if (sideWinLeft) {
    place(windowUnit(materials, { w: winW, h: 1.34, seed: seed + 9 }), -w / 2, plinthH + groundWinY + 0.04, 0, -Math.PI / 2);
    yield;
  }
  if (sideWinRight) {
    place(windowUnit(materials, { w: winW, h: 1.34, seed: seed + 10 }), w / 2, plinthH + groundWinY + 0.04, 0, Math.PI / 2);
    yield;
  }

  buildTimberFrame(add, materials, {
    w,
    d,
    plinthH,
    eaveY,
    ridgeY,
    floorY,
    hasStoneLower: stoneLowerH > 0,
    skipRightGableCenter,
    sideWinLeft,
    upperWins,
  });
  yield;

  buildMainGableRoof(add, materials, { w, d, eaveY: eaveY - 0.12, ridgeY, seed: seed + 20, skipFront });
  yield;

  buildLanternUnit(add, materials, { x: 1.22, y: plinthH + 1.98, z: d / 2 });
}

function* mergeStaticGen(
  root,
  { outline = 0.018, materials = null, plinthH = null, eaveY = null } = {},
) {
  root.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const meshes = [];
  const outlineGeos = [];
  const oldOutlines = [];
  const roofInstancedList = [];

  const isInsideNoMerge = (obj) => {
    let curr = obj.parent;
    while (curr && curr !== root) {
      if (curr.userData?.noMerge) return true;
      curr = curr.parent;
    }
    return false;
  };

  // Iterative pre-order DFS matching Object3D.traverse order
  const stack = [root];
  while (stack.length > 0) {
    const obj = stack.pop();
    for (let i = obj.children.length - 1; i >= 0; i--) {
      stack.push(obj.children[i]);
    }
    if (obj === root || isInsideNoMerge(obj)) continue;
    if (obj.isInstancedMesh && obj.userData?.isRoofTiles) {
      roofInstancedList.push(obj);
      continue;
    }
    if (!obj.isMesh || obj.isInstancedMesh) continue;
    if (obj.userData.isOutline) {
      oldOutlines.push(obj);
      continue;
    }
    if (Array.isArray(obj.material)) continue;
    meshes.push(obj);
  }
  yield;

  for (let oi = 0; oi < oldOutlines.length; oi++) {
    const outMesh = oldOutlines[oi];
    const local = new THREE.Matrix4().multiplyMatrices(invRoot, outMesh.matrixWorld);
    let oGeo = outMesh.geometry.clone();
    oGeo.applyMatrix4(local);
    if (oGeo.index) oGeo = oGeo.toNonIndexed();
    if (!oGeo.attributes.normal) oGeo.computeVertexNormals();
    const vCount = oGeo.attributes.position.count;
    if (!oGeo.attributes.aOutline) {
      const arr = new Float32Array(vCount).fill(outline);
      oGeo.setAttribute('aOutline', new THREE.BufferAttribute(arr, 1));
    }
    for (const k of Object.keys(oGeo.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'aOutline') oGeo.deleteAttribute(k);
    }
    outlineGeos.push(oGeo);
    outMesh.parent?.remove(outMesh);
    if (oi > 0 && oi % 4 === 0) yield;
  }

  const rootEaveY = eaveY ?? root.userData?.eaveY ?? null;
  const rootPlinthH = plinthH ?? root.userData?.plinthH ?? 0.55;

  let sinceYieldMeshes = 0;
  let sinceYieldVerts = 0;
  for (let mi = 0; mi < meshes.length; mi++) {
    const mesh = meshes[mi];
    const local = new THREE.Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld);
    let geo = mesh.geometry.clone();
    geo.applyMatrix4(local);
    if (geo.index) geo = geo.toNonIndexed();
    if (!geo.attributes.normal || mesh.material.flatShading) geo.computeVertexNormals();

    const vCount = geo.attributes.position.count;
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vCount * 2), 2));
    }
    if (!geo.attributes.color) {
      const col = mesh.material.color ?? new THREE.Color(0xffffff);
      const colors = new Float32Array(vCount * 3);
      for (let i = 0; i < vCount; i++) {
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    const targetMat = mesh.material.userData?.bucketMat || mesh.material;
    const meshEaveY = mesh.userData?.eaveY ?? rootEaveY;
    const meshPlinthH = mesh.userData?.plinthH ?? rootPlinthH;
    const isUnlitBasic = mesh.material?.toneMapped === false || targetMat?.toneMapped === false;

    if (meshEaveY !== null && !mesh.userData?.aoBaked && !isUnlitBasic) {
      const posAttr = geo.attributes.position;
      const colAttr = geo.attributes.color;
      const eaveStart = meshEaveY - 0.55;
      const groundTop = meshPlinthH + 0.45; // 1.0m when plinthH = 0.55

      for (let i = 0; i < vCount; i++) {
        const vy = posAttr.getY(i);
        let r = colAttr.getX(i);
        let g = colAttr.getY(i);
        let b = colAttr.getZ(i);

        if (vy >= eaveStart && vy <= meshEaveY + 0.28) {
          const u = THREE.MathUtils.clamp((vy - eaveStart) / 0.55, 0, 1);
          const tEave = u * u * (3 - 2 * u);
          r *= 1 - tEave * 0.2;
          g *= 1 - tEave * 0.22;
          b *= 1 - tEave * 0.26;
        }

        if (vy <= groundTop) {
          const u = THREE.MathUtils.clamp((groundTop - vy) / 0.45, 0, 1);
          const tGround = u * u * (3 - 2 * u);
          r *= 1 - tGround * 0.15;
          g *= 1 - tGround * 0.15;
          b *= 1 - tGround * 0.16;
        }

        colAttr.setXYZ(i, r, g, b);
      }
      colAttr.needsUpdate = true;
    }

    for (const k of Object.keys(geo.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') {
        geo.deleteAttribute(k);
      }
    }
    geo.clearGroups();

    const outWeight = mesh.userData.outlineWeight ?? 0;
    if (outWeight > 0 && !mesh.material?.userData?.noOutline) {
      const oGeo = new THREE.BufferGeometry();
      oGeo.setAttribute('position', geo.attributes.position.clone());
      oGeo.setAttribute('normal', geo.attributes.normal.clone());
      oGeo.setAttribute('aOutline', new THREE.BufferAttribute(new Float32Array(vCount).fill(outWeight), 1));
      outlineGeos.push(oGeo);
    }

    const key = targetMat.uuid;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: targetMat, geos: [], meshes: [], cast: false, receive: false };
      buckets.set(key, bucket);
    }
    bucket.geos.push(geo);
    bucket.meshes.push(mesh);
    bucket.cast = bucket.cast || mesh.castShadow;
    bucket.receive = bucket.receive || mesh.receiveShadow;

    sinceYieldMeshes++;
    sinceYieldVerts += vCount;
    if (sinceYieldMeshes >= 2 || sinceYieldVerts >= 300) {
      sinceYieldMeshes = 0;
      sinceYieldVerts = 0;
      yield;
    }
  }

  for (const bucket of buckets.values()) {
    const merged =
      bucket.geos.length === 1 ? bucket.geos[0] : yield* mergeGeometriesGen(bucket.geos);
    if (!merged) continue;
    for (const mesh of bucket.meshes) mesh.parent?.remove(mesh);

    const mergedMesh = new THREE.Mesh(merged, bucket.material);
    mergedMesh.castShadow = bucket.cast;
    mergedMesh.receiveShadow = bucket.receive;
    mergedMesh.name = 'merged';
    if (rootEaveY !== null) mergedMesh.userData.aoBaked = true;
    root.add(mergedMesh);
    yield;
  }

  if (outlineGeos.length > 0) {
    const mergedOutlineGeo =
      outlineGeos.length === 1 ? outlineGeos[0] : yield* mergeGeometriesGen(outlineGeos);
    if (mergedOutlineGeo) {
      const outMat = materials?.sharedOutline || makeOutlineMaterial(outline);
      const outMesh = new THREE.Mesh(mergedOutlineGeo, outMat);
      outMesh.name = `${root.name || 'group'}-outline`;
      outMesh.castShadow = false;
      outMesh.receiveShadow = false;
      outMesh.userData.isOutline = true;
      root.add(outMesh);
    }
    yield;
  }

  if (roofInstancedList.length > 1) {
    let totalTiles = 0;
    for (const im of roofInstancedList) totalTiles += im.count;
    const first = roofInstancedList[0];
    const combined = new THREE.InstancedMesh(first.geometry, first.material, totalTiles);
    const mLocal = new THREE.Matrix4();
    const mInst = new THREE.Matrix4();
    const mOut = new THREE.Matrix4();
    const col = new THREE.Color(0xffffff);
    let cursor = 0;
    let sinceYieldTiles = 0;
    for (const im of roofInstancedList) {
      mLocal.multiplyMatrices(invRoot, im.matrixWorld);
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, mInst);
        mOut.multiplyMatrices(mLocal, mInst);
        combined.setMatrixAt(cursor, mOut);
        if (im.instanceColor) {
          im.getColorAt(i, col);
          combined.setColorAt(cursor, col);
        }
        cursor++;
        sinceYieldTiles++;
        if (sinceYieldTiles >= 120) {
          sinceYieldTiles = 0;
          yield;
        }
      }
      im.parent?.remove(im);
    }
    combined.instanceMatrix.needsUpdate = true;
    if (combined.instanceColor) combined.instanceColor.needsUpdate = true;
    combined.castShadow = true;
    combined.receiveShadow = true;
    combined.userData.noMerge = true;
    combined.userData.isRoofTiles = true;
    combined.name = 'roof-tiles-combined';
    root.add(combined);
  }

  return root;
}

function* buildInnPorchAndPropsGen(
  add,
  materials,
  { d = 7.4, subDepth = 1.5, seed = 51 } = {},
) {
  const wallZ = d / 2;
  const porchW = 4.1;
  const halfW = porchW / 2;
  const depth = 1.58;
  const frontZ = wallZ + depth;
  const postZ = wallZ + 1.24;
  const eaveY = 2.94;
  const rise = 0.5;
  const apexY = eaveY + rise;
  const slopeLen = Math.hypot(halfW, rise);
  const angle = Math.atan2(rise, halfW);

  for (const px of [-1.72, 1.72]) {
    const plinthTotalH = 0.34 + subDepth;
    const ped = box(0.34, plinthTotalH, 0.34, materials.stoneTrim, { tile: TILE.stone, outline: 0.014 });
    ped.position.set(px, 0.34 - plinthTotalH / 2, postZ);
    add(ped);

    const postH = eaveY - 0.34;
    const post = box(0.22, postH, 0.22, materials.timber, { tile: TILE.wood, outline: 0.014 });
    post.position.set(px, 0.34 + postH / 2, postZ);
    add(post);

    add(
      beamBetween(
        [px, eaveY - 0.62, postZ],
        [px - Math.sign(px) * 0.52, eaveY - 0.06, postZ],
        0.12,
        0.12,
        materials.timber,
      ),
    );
    add(
      beamBetween(
        [px, eaveY - 0.6, postZ],
        [px, eaveY - 0.06, postZ - 0.54],
        0.12,
        0.12,
        materials.timber,
      ),
    );

    const sidePlate = box(0.17, 0.16, depth, materials.timber, { tile: TILE.wood, outline: 0 });
    sidePlate.position.set(px, eaveY - 0.05, wallZ + depth / 2);
    add(sidePlate);
  }
  yield;

  const tie = box(porchW - 0.16, 0.18, 0.17, materials.timber, { tile: TILE.wood, outline: 0.014 });
  tie.position.set(0, eaveY - 0.03, postZ);
  add(tie);

  const king = box(0.15, rise - 0.05, 0.13, materials.timber, { tile: TILE.wood, outline: 0 });
  king.position.set(0, eaveY + rise / 2, postZ);
  add(king);

  add(
    quad(
      [0, apexY, wallZ - 0.05],
      [0, apexY, frontZ],
      [halfW, eaveY, frontZ],
      [halfW, eaveY, wallZ - 0.05],
      materials.roofBase,
      { outline: 0.016 },
    ),
  );
  add(
    quad(
      [0, apexY, frontZ],
      [0, apexY, wallZ - 0.05],
      [-halfW, eaveY, wallZ - 0.05],
      [-halfW, eaveY, frontZ],
      materials.roofBase,
      { outline: 0.016 },
    ),
  );

  tileRoof({
    a: [halfW, eaveY, frontZ],
    b: [halfW, eaveY, wallZ - 0.05],
    d: [0, apexY, frontZ],
    width: frontZ - (wallZ - 0.05),
    length: slopeLen,
    seed,
  });
  tileRoof({
    a: [-halfW, eaveY, wallZ - 0.05],
    b: [-halfW, eaveY, frontZ],
    d: [0, apexY, wallZ - 0.05],
    width: frontZ - (wallZ - 0.05),
    length: slopeLen,
    seed: seed + 1,
  });

  const ridge = cyl(0.085, depth + 0.12, materials.roofRidge, { axis: 'z', segments: 6, outline: 0 });
  ridge.position.set(0, apexY + 0.03, wallZ + depth / 2);
  add(ridge);

  for (const sx of [-1, 1]) {
    const board = box(slopeLen, 0.16, 0.1, materials.timber, { tile: TILE.wood, outline: 0.01 });
    board.position.set(sx * (halfW / 2), (eaveY + apexY) / 2 - 0.07, frontZ + 0.01);
    board.rotation.z = -sx * angle;
    add(board);
  }
  yield;

  const signX = 2.11;
  const signY = 2.68;
  const signZ = postZ + 0.04;
  const arm = box(0.66, 0.065, 0.065, materials.iron, { outline: 0.008 });
  arm.position.set(1.72 + 0.33, signY, signZ);
  add(arm);

  add(beamBetween([1.81, signY - 0.3, signZ], [signX + 0.08, signY, signZ], 0.045, 0.045, materials.iron));

  for (const cx of [-0.14, 0.14]) {
    const chain = box(0.03, 0.12, 0.03, materials.iron, { outline: 0 });
    chain.position.set(signX + cx, signY - 0.09, signZ);
    add(chain);
  }

  const boardFrame = box(0.48, 0.44, 0.065, materials.timberDark, { tile: TILE.wood, outline: 0.012 });
  boardFrame.position.set(signX, signY - 0.36, signZ);
  add(boardFrame);

  const boardFace = box(0.36, 0.32, 0.085, materials.timberLight, { tile: TILE.wood, outline: 0 });
  boardFace.position.set(signX, signY - 0.36, signZ);
  add(boardFace);

  const emblem = cyl(0.1, 0.1, materials.signGold, { axis: 'z', segments: 8, outline: 0 });
  emblem.position.set(signX, signY - 0.36, signZ);
  add(emblem);
  yield;

  const tx = -3.65;
  const tz = wallZ + 1.18;
  const padH = 0.08 + subDepth;
  const patio = box(2.35, padH, 1.95, materials.stone, { tile: TILE.stone, outline: 0.012 });
  patio.position.set(tx, 0.08 - padH / 2, tz);
  add(patio);

  const tableTopY = 0.82;
  const top = box(1.68, 0.08, 0.78, materials.timber, { tile: TILE.wood, outline: 0.012 });
  top.position.set(tx, tableTopY, tz);
  add(top);

  const legH = tableTopY - 0.08;
  for (const lx of [-0.66, 0.66]) {
    for (const lz of [-0.28, 0.28]) {
      const leg = box(0.1, legH, 0.1, materials.timberDark, { tile: TILE.wood, outline: 0 });
      leg.position.set(tx + lx, 0.08 + legH / 2, tz + lz);
      add(leg);
    }
  }

  const benchY = 0.48;
  const benchLegH = benchY - 0.08;
  for (const bz of [-0.62, 0.62]) {
    const seat = box(1.58, 0.065, 0.3, materials.timber, { tile: TILE.wood, outline: 0.01 });
    seat.position.set(tx, benchY, tz + bz);
    add(seat);
    for (const lx of [-0.58, 0.58]) {
      const bLeg = box(0.09, benchLegH, 0.24, materials.timberDark, { tile: TILE.wood, outline: 0 });
      bLeg.position.set(tx + lx, 0.08 + benchLegH / 2, tz + bz);
      add(bLeg);
    }
  }
}

function* buildForgeShedAndHearthGen(
  add,
  place,
  materials,
  { wallX = 4.5, ridgeY = 8.15, subDepth = 1.5 } = {},
) {
  const shedW = 3.25;
  const shedD = 5.3;
  const outX = wallX + shedW;
  const midX = wallX + shedW / 2;
  const padTop = 0.28;
  const eaveY = 3.12;
  const wallJoinY = 4.22;
  const rise = wallJoinY - eaveY;
  const slopeLen = Math.hypot(shedW + 0.25, rise);
  const slopeAngle = Math.atan2(rise, shedW + 0.25);

  const padH = padTop + subDepth;
  const pad = box(shedW + 0.28, padH, shedD + 0.28, materials.stone, { tile: TILE.stone, outline: 0.016 });
  pad.position.set(midX, padTop - padH / 2, 0);
  add(pad);

  const padCap = box(shedW + 0.36, 0.06, shedD + 0.36, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  padCap.position.set(midX, padTop + 0.03, 0);
  add(padCap);

  const chimX = wallX + 0.48;
  const chimZ = 0.0;
  const lowerH = 5.35 + subDepth;
  const lowerStack = box(1.42, lowerH, 1.62, materials.stone, { tile: TILE.stone, outline: 0.02 });
  lowerStack.position.set(chimX, 5.35 - lowerH / 2, chimZ);
  add(lowerStack);

  const shoulder = box(1.56, 0.22, 1.74, materials.stoneTrim, { tile: TILE.stone, outline: 0.014 });
  shoulder.position.set(chimX, 5.4, chimZ);
  add(shoulder);

  buildChimneyUnit(add, materials, {
    x: chimX - 0.08,
    z: chimZ,
    baseY: 5.4,
    topY: ridgeY + 1.05,
    w: 1.18,
    d: 1.24,
  });
  yield;

  const hearthX = wallX + 1.14;
  const hearthTableH = 0.76;
  const hearthBase = box(1.52, hearthTableH, 1.68, materials.stoneDark, { tile: TILE.stone, outline: 0.014 });
  hearthBase.position.set(hearthX, padTop + hearthTableH / 2, chimZ);
  add(hearthBase);

  const hearthRim = box(1.62, 0.1, 1.78, materials.stoneTrim, { tile: TILE.stone, outline: 0.01 });
  hearthRim.position.set(hearthX, padTop + hearthTableH + 0.04, chimZ);
  add(hearthRim);

  for (const sz of [-1, 1]) {
    const cheek = box(0.95, 0.72, 0.24, materials.stone, { tile: TILE.stone, outline: 0.01 });
    cheek.position.set(hearthX - 0.12, padTop + hearthTableH + 0.4, chimZ + sz * 0.68);
    add(cheek);
  }

  const hood = box(1.28, 0.62, 1.64, materials.stone, { tile: TILE.stone, outline: 0.014 });
  hood.position.set(hearthX - 0.08, padTop + hearthTableH + 1.05, chimZ);
  add(hood);

  const hoodLintel = box(1.36, 0.14, 1.72, materials.stoneTrim, { tile: TILE.stone, outline: 0.01 });
  hoodLintel.position.set(hearthX - 0.06, padTop + hearthTableH + 0.74, chimZ);
  add(hoodLintel);

  const coalBed = box(1.08, 0.14, 1.14, materials.coalDark, { outline: 0 });
  coalBed.position.set(hearthX + 0.14, padTop + hearthTableH + 0.1, chimZ);
  add(coalBed);

  for (const [dx, dz, r, mat] of [
    [0.12, -0.26, 0.24, materials.emberMid],
    [0.2, 0.02, 0.29, materials.emberHot],
    [0.14, 0.28, 0.23, materials.emberMid],
    [0.32, -0.08, 0.19, materials.emberHot],
  ]) {
    const ember = sphere(r, mat, { sx: 1.25, sy: 0.62, sz: 1.15, outline: 0 });
    ember.position.set(hearthX + dx, padTop + hearthTableH + 0.2, chimZ + dz);
    add(ember);
  }
  yield;

  const anvilX = wallX + 1.96;
  const anvilZ = 1.46;
  const stump = cyl(0.34, 0.62, materials.timberDark, { segments: 8, outline: 0.012 });
  stump.position.set(anvilX, padTop + 0.31, anvilZ);
  add(stump);

  const stumpBand = cyl(0.355, 0.06, materials.iron, { segments: 8, outline: 0 });
  stumpBand.position.set(anvilX, padTop + 0.5, anvilZ);
  add(stumpBand);

  const anvilFoot = box(0.46, 0.12, 0.32, materials.iron, { outline: 0 });
  anvilFoot.position.set(anvilX, padTop + 0.68, anvilZ);
  add(anvilFoot);

  const anvilWaist = box(0.32, 0.18, 0.22, materials.iron, { outline: 0 });
  anvilWaist.position.set(anvilX, padTop + 0.82, anvilZ);
  add(anvilWaist);

  const anvilFace = box(0.62, 0.15, 0.26, materials.ironLight, { outline: 0.01 });
  anvilFace.position.set(anvilX - 0.04, padTop + 0.96, anvilZ);
  add(anvilFace);

  const anvilHorn = cyl(0.03, 0.34, materials.ironLight, {
    radiusTop: 0.11,
    segments: 6,
    axis: 'x',
    outline: 0.01,
  });
  anvilHorn.position.set(anvilX + 0.42, padTop + 0.95, anvilZ);
  add(anvilHorn);

  place(buildWoodenBarrel(materials, { r: 0.35, h: 0.82, openTop: true, water: true }), wallX + 1.12, padTop, 2.02);
  place(buildWoodenBarrel(materials, { r: 0.34, h: 0.82 }), wallX + 2.25, padTop, -1.55);
  place(buildWoodenBarrel(materials, { r: 0.34, h: 0.82 }), wallX + 2.25, padTop, -2.28);
  place(buildWoodenBarrel(materials, { r: 0.31, h: 0.76 }), wallX + 2.25, padTop + 0.82, -1.92);
  yield;

  const postH = eaveY - padTop;
  for (const pz of [-shedD / 2 + 0.22, 0, shedD / 2 - 0.22]) {
    const post = box(0.2, postH, 0.2, materials.timber, { tile: TILE.wood, outline: 0.014 });
    post.position.set(outX - 0.18, padTop + postH / 2, pz);
    add(post);

    add(
      beamBetween(
        [outX - 0.18, eaveY - 0.65, pz],
        [outX - 0.75, eaveY - 0.06, pz],
        0.13,
        0.13,
        materials.timber,
      ),
    );
  }

  const eaveBeam = box(0.2, 0.2, shedD + 0.2, materials.timber, { tile: TILE.wood, outline: 0.014 });
  eaveBeam.position.set(outX - 0.18, eaveY, 0);
  add(eaveBeam);

  const roofOutX = outX + 0.16;
  const roofZ = shedD / 2 + 0.24;
  add(
    quad(
      [wallX, wallJoinY, -roofZ],
      [wallX, wallJoinY, roofZ],
      [roofOutX, eaveY - 0.1, roofZ],
      [roofOutX, eaveY - 0.1, -roofZ],
      materials.roofBase,
      { outline: 0.016 },
    ),
  );

  tileRoof({
    a: [roofOutX, eaveY - 0.09, roofZ],
    b: [roofOutX, eaveY - 0.09, -roofZ],
    d: [wallX, wallJoinY, roofZ],
    width: roofZ * 2,
    length: slopeLen,
    seed: 71,
    skipFn: (pos) => pos.x < chimX + 0.68 && Math.abs(pos.z - chimZ) < 0.82,
  });

  for (const sz of [-1, 1]) {
    const board = box(slopeLen, 0.18, 0.1, materials.timber, { tile: TILE.wood, outline: 0.01 });
    board.position.set((wallX + roofOutX) / 2, (wallJoinY + eaveY - 0.1) / 2 - 0.06, sz * roofZ);
    board.rotation.z = -slopeAngle;
    add(board);
  }
}

function* buildKitchenGardenGen(
  add,
  place,
  materials,
  { wallX = 4.1, gardenPatch = { ox: 6.5, oz: 0, w: 4.4, d: 5.6 }, subDepth = 1.5, seed = 81 } = {},
) {
  const xMin = wallX;
  const xMax = gardenPatch.ox + gardenPatch.w / 2;
  const spanX = xMax - xMin;
  const midX = (xMin + xMax) / 2;
  const gz = gardenPatch.oz || 0;
  const gd = gardenPatch.d;
  const zMin = gz - gd / 2;
  const zMax = gz + gd / 2;
  const padTop = 0.24;
  const wallH = 0.58;
  const wallT = 0.32;

  const padH = padTop + subDepth;
  const pad = box(spanX + 0.18, padH, gd + 0.18, materials.stoneDark, { tile: TILE.stone, outline: 0.014 });
  pad.position.set(midX, padTop - padH / 2, gz);
  add(pad);

  const backWall = box(spanX, wallH, wallT, materials.stone, { tile: TILE.stone, outline: 0.014 });
  backWall.position.set(midX, padTop + wallH / 2, zMin + wallT / 2);
  add(backWall);

  const backCap = box(spanX + 0.08, 0.07, wallT + 0.08, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  backCap.position.set(midX, padTop + wallH + 0.035, zMin + wallT / 2);
  add(backCap);

  const eastWall = box(wallT, wallH, gd, materials.stone, { tile: TILE.stone, outline: 0.014 });
  eastWall.position.set(xMax - wallT / 2, padTop + wallH / 2, gz);
  add(eastWall);

  const eastCap = box(wallT + 0.08, 0.07, gd + 0.08, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  eastCap.position.set(xMax - wallT / 2, padTop + wallH + 0.035, gz);
  add(eastCap);

  const gateX = midX;
  const gateW = 1.18;
  const leftW = gateX - gateW / 2 - xMin;
  const rightW = xMax - (gateX + gateW / 2);

  const frontLeft = box(leftW, wallH, wallT, materials.stone, { tile: TILE.stone, outline: 0.014 });
  frontLeft.position.set(xMin + leftW / 2, padTop + wallH / 2, zMax - wallT / 2);
  add(frontLeft);
  const frontLeftCap = box(leftW + 0.06, 0.07, wallT + 0.08, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  frontLeftCap.position.set(xMin + leftW / 2, padTop + wallH + 0.035, zMax - wallT / 2);
  add(frontLeftCap);

  const frontRight = box(rightW, wallH, wallT, materials.stone, { tile: TILE.stone, outline: 0.014 });
  frontRight.position.set(xMax - rightW / 2, padTop + wallH / 2, zMax - wallT / 2);
  add(frontRight);
  const frontRightCap = box(rightW + 0.06, 0.07, wallT + 0.08, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  frontRightCap.position.set(xMax - rightW / 2, padTop + wallH + 0.035, zMax - wallT / 2);
  add(frontRightCap);

  for (const sx of [-1, 1]) {
    const pier = box(0.38, wallH + 0.24, 0.38, materials.stoneTrim, { tile: TILE.stone, outline: 0.014 });
    pier.position.set(gateX + sx * (gateW / 2 + 0.06), padTop + (wallH + 0.24) / 2, zMax - wallT / 2);
    add(pier);
  }
  for (const ry of [0.22, 0.54]) {
    const rail = box(gateW - 0.08, 0.07, 0.05, materials.timberDark, { tile: TILE.wood, outline: 0 });
    rail.position.set(gateX, padTop + ry, zMax - wallT / 2);
    add(rail);
  }
  for (let i = -2; i <= 2; i++) {
    const picket = box(0.11, wallH + 0.06, 0.04, materials.timber, { tile: TILE.wood, outline: 0 });
    picket.position.set(gateX + i * 0.21, padTop + (wallH + 0.06) / 2 + 0.04, zMax - wallT / 2 + 0.03);
    add(picket);
  }

  const pathLen = gd - 1.85;
  const walkway = box(0.96, 0.05, pathLen, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  walkway.position.set(gateX, padTop + 0.025, zMax - wallT - pathLen / 2 + 0.12);
  add(walkway);
  yield;

  const sideBedW = 1.12;
  const sideBedD = 3.05;
  const sideBedZ = gz + 0.32;
  const beds = [
    { bx: xMin + 0.84, bz: sideBedZ, bw: sideBedW, bd: sideBedD, cols: 2, rows: 3 },
    { bx: xMax - 0.96, bz: sideBedZ, bw: sideBedW, bd: sideBedD, cols: 2, rows: 3 },
    { bx: midX - 0.06, bz: zMin + 0.92, bw: spanX - 0.95, bd: 0.98, cols: 4, rows: 1 },
  ];

  for (let bIdx = 0; bIdx < beds.length; bIdx++) {
    const { bx, bz, bw, bd, cols, rows } = beds[bIdx];
    const frameH = 0.28;
    const frame = box(bw + 0.1, frameH, bd + 0.1, materials.timberDark, { tile: TILE.wood, outline: 0.01 });
    frame.position.set(bx, padTop + frameH / 2, bz);
    add(frame);

    const soil = box(bw, frameH + 0.03, bd, materials.soil, { outline: 0 });
    soil.position.set(bx, padTop + (frameH + 0.03) / 2, bz);
    add(soil);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = cols === 1 ? bx : THREE.MathUtils.lerp(bx - bw * 0.28, bx + bw * 0.28, c / (cols - 1));
        const cz = rows === 1 ? bz : THREE.MathUtils.lerp(bz - bd * 0.34, bz + bd * 0.34, r / (rows - 1));
        place(
          buildCabbageHead(materials, seed + bIdx * 10 + r * 4 + c),
          cx,
          padTop + frameH + 0.02,
          cz,
        );
      }
    }
    yield;
  }
}

function* buildWaterwheelAssemblyGen(
  add,
  materials,
  { wallX = -3.9, wheelX = -4.62, wheelY = 0.85, subDepth = 2.6, inValley = false } = {},
) {
  const pierX = wheelX - 0.74;
  const pierTop = wheelY + 0.42;
  const pierH = pierTop + subDepth;
  const pier = box(0.58, pierH, 1.38, materials.stone, { tile: TILE.stone, outline: 0.016 });
  pier.position.set(pierX, pierTop - pierH / 2, 0);
  add(pier);

  const pierCap = box(0.68, 0.12, 1.48, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  pierCap.position.set(pierX, pierTop + 0.04, 0);
  add(pierCap);

  const outerBearing = box(0.42, 0.36, 0.52, materials.iron, { outline: 0.01 });
  outerBearing.position.set(pierX + 0.18, wheelY, 0);
  add(outerBearing);

  const wallBearing = box(0.36, 0.48, 0.58, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  wallBearing.position.set(wallX - 0.12, wheelY, 0);
  add(wallBearing);

  if (!inValley) {
    const raceLenZ = 5.65;
    const raceSpanX = wallX - pierX + 0.32;
    const raceWallTop = 0.24;
    const raceWallH = raceWallTop + subDepth;

    const outerWallX = pierX + 0.08;
    const outerRaceWall = box(0.28, raceWallH, raceLenZ, materials.stone, { tile: TILE.stone, outline: 0.014 });
    outerRaceWall.position.set(outerWallX, raceWallTop - raceWallH / 2, 0);
    add(outerRaceWall);

    const outerRaceCap = box(0.34, 0.07, raceLenZ + 0.08, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
    outerRaceCap.position.set(outerWallX, raceWallTop + 0.035, 0);
    add(outerRaceCap);

    const weirW = wallX - (outerWallX + 0.14) - 0.04;
    const weirMidX = (wallX + outerWallX + 0.14) * 0.5;
    for (const sz of [-1, 1]) {
      const endWeir = box(weirW, raceWallH, 0.28, materials.stone, { tile: TILE.stone, outline: 0.012 });
      endWeir.position.set(weirMidX, raceWallTop - raceWallH / 2, sz * (raceLenZ / 2 - 0.14));
      add(endWeir);

      const weirCap = box(weirW + 0.04, 0.07, 0.34, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
      weirCap.position.set(weirMidX, raceWallTop + 0.035, sz * (raceLenZ / 2 - 0.14));
      add(weirCap);
    }

    const waterBed = box(raceSpanX - 0.24, subDepth + 0.06, raceLenZ - 0.28, materials.waterBlue, { outline: 0 });
    waterBed.position.set(wheelX, 0.06 - (subDepth + 0.06) / 2, 0);
    add(waterBed);

    for (const fz of [-1.45, 0.0, 1.45, 2.15]) {
      const foam = box(0.68, 0.03, 0.42, materials.flowerWhite, { outline: 0 });
      foam.position.set(wheelX, 0.075, fz);
      add(foam);
    }

    const flumeZ = -2.25;
    const flumeY = 2.05;
    const flumeTrough = box(0.84, 0.26, 1.85, materials.timberDark, { tile: TILE.wood, outline: 0.012 });
    flumeTrough.position.set(wheelX, flumeY, flumeZ);
    flumeTrough.rotation.x = 0.14;
    add(flumeTrough);

    const flumeWater = box(0.66, 0.08, 1.78, materials.waterBlue, { outline: 0 });
    flumeWater.position.set(wheelX, flumeY + 0.1, flumeZ);
    flumeWater.rotation.x = 0.14;
    add(flumeWater);
  }
  yield;

  const wheelGroup = new THREE.Group();
  wheelGroup.name = 'waterwheel';
  wheelGroup.position.set(wheelX, wheelY, 0);
  wheelGroup.userData.noMerge = true;

  const wAdd = (obj) => {
    wheelGroup.add(obj);
    return obj;
  };

  const outerR = 2.55;
  const rimR = 2.34;
  const innerRimR = 1.96;
  const wheelW = 0.86;
  const halfW = wheelW / 2;
  const paddles = 12;

  wAdd(cyl(0.22, wheelW + 1.15, materials.timberDark, { axis: 'x', segments: 8, outline: 0.012 }));
  for (const sx of [-1, 1]) {
    const hub = cyl(0.42, 0.14, materials.timberDark, { axis: 'x', segments: 8, outline: 0 });
    hub.position.x = sx * (halfW - 0.04);
    wAdd(hub);
  }

  const chord = 2 * rimR * Math.sin(Math.PI / paddles) + 0.1;
  const innerChord = 2 * innerRimR * Math.sin(Math.PI / paddles) + 0.08;

  for (let i = 0; i < paddles; i++) {
    const a = (i / paddles) * Math.PI * 2;
    const midA = a + Math.PI / paddles;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const cosM = Math.cos(midA);
    const sinM = Math.sin(midA);

    if (i < 6) {
      for (const sx of [-1, 1]) {
        const spoke = box(0.1, 0.15, outerR * 1.9, materials.timber, { tile: TILE.wood, outline: 0.01 });
        spoke.position.set(sx * (halfW - 0.05), 0, 0);
        spoke.rotation.x = -a;
        wAdd(spoke);
      }
    }

    for (const sx of [-1, 1]) {
      const seg = box(0.11, chord, 0.22, materials.timberDark, { tile: TILE.wood, outline: 0.012 });
      seg.position.set(sx * (halfW - 0.05), sinM * (rimR - 0.08), cosM * (rimR - 0.08));
      seg.rotation.x = -midA;
      wAdd(seg);

      const innerSeg = box(0.08, innerChord, 0.14, materials.timber, { tile: TILE.wood, outline: 0 });
      innerSeg.position.set(sx * (halfW - 0.08), sinM * innerRimR, cosM * innerRimR);
      innerSeg.rotation.x = -midA;
      wAdd(innerSeg);
    }

    const pr = outerR - 0.22;
    const paddle = box(wheelW + 0.08, 0.085, 0.44, materials.timberLight, {
      tile: TILE.wood,
      outline: 0,
    });
    paddle.position.set(0, sinA * pr, cosA * pr);
    paddle.rotation.x = -a + 0.22;
    wAdd(paddle);

    if (i % 3 === 2) yield;
  }

  wheelGroup.traverse((c) => {
    if (c.isMesh) c.userData.outlineWeight = 0;
  });
  yield* mergeStaticGen(wheelGroup, { outline: 0, materials });
  add(wheelGroup);
  return wheelGroup;
}

function* buildWindmillTowerAndSailsGen(
  add,
  materials,
  { wallX = 3.9, subDepth = 2.6 } = {},
) {
  const tx = wallX + 3.55;
  const tz = 1.15;
  const baseTopY = 4.15;
  const towerTopY = 10.35;
  const capApexY = 12.95;
  const hubY = 9.75;
  const hubZ = tz + 1.92;

  const linkW = 2.15;
  const linkD = 2.85;
  const linkMidX = wallX + linkW * 0.5 - 0.08;
  const linkWallY = 3.45;
  const linkRidgeY = 4.45;
  const linkStoneH = 2.15 + subDepth;

  const linkBase = box(linkW, linkStoneH, linkD, materials.stone, {
    tile: TILE.stone,
    outline: 0.016,
  });
  linkBase.position.set(linkMidX, 2.15 - linkStoneH * 0.5, tz);
  add(linkBase);

  const linkTrim = box(linkW + 0.16, 0.12, linkD + 0.24, materials.stoneTrim, {
    tile: TILE.stone,
    outline: 0.012,
  });
  linkTrim.position.set(linkMidX, 2.20, tz);
  add(linkTrim);

  const linkUpper = box(linkW, linkWallY - 2.20, linkD - 0.08, materials.stuccoWarm, {
    tile: TILE.stucco,
    outline: 0.014,
  });
  linkUpper.position.set(linkMidX, 2.20 + (linkWallY - 2.20) * 0.5, tz);
  add(linkUpper);

  const linkHalfD = linkD * 0.5 + 0.28;
  add(
    quad(
      [wallX - 0.1, linkWallY, tz + linkHalfD],
      [tx - 1.2, linkWallY, tz + linkHalfD],
      [tx - 1.2, linkRidgeY, tz],
      [wallX - 0.1, linkRidgeY, tz],
      materials.roofRidge,
      { outline: 0.016 },
    ),
  );
  add(
    quad(
      [wallX - 0.1, linkWallY, tz - linkHalfD],
      [wallX - 0.1, linkRidgeY, tz],
      [tx - 1.2, linkRidgeY, tz],
      [tx - 1.2, linkWallY, tz - linkHalfD],
      materials.roofRidge,
      { outline: 0.016 },
    ),
  );

  const stoneTotalH = baseTopY + subDepth;
  const stoneBase = cyl(2.05, stoneTotalH, materials.stone, {
    radiusTop: 1.78,
    segments: 8,
    outline: 0.018,
  });
  stoneBase.position.set(tx, baseTopY - stoneTotalH / 2, tz);
  add(stoneBase);

  const plinthBelt = cyl(2.16, 0.16, materials.stoneTrim, {
    radiusTop: 2.12,
    segments: 8,
    outline: 0.012,
  });
  plinthBelt.position.set(tx, 0.58, tz);
  add(plinthBelt);

  const stoneCornice = cyl(1.92, 0.18, materials.stoneTrim, {
    radiusTop: 1.94,
    segments: 8,
    outline: 0.014,
  });
  stoneCornice.position.set(tx, baseTopY, tz);
  add(stoneCornice);

  const stageDeck = cyl(2.46, 0.12, materials.timberDark, {
    radiusTop: 2.46,
    segments: 8,
    outline: 0.014,
  });
  stageDeck.position.set(tx, baseTopY + 0.06, tz);
  add(stageDeck);
  yield;

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const px = tx + ca * 2.34;
    const pz = tz + sa * 2.34;
    if (ca < -0.65) continue;

    add(
      beamBetween(
        [tx + ca * 1.74, baseTopY - 0.78, tz + sa * 1.74],
        [tx + ca * 2.32, baseTopY + 0.02, tz + sa * 2.32],
        0.12,
        0.12,
        materials.timber,
      ),
    );
    const rPost = box(0.1, 0.78, 0.1, materials.timber, { tile: TILE.wood, outline: 0.01 });
    rPost.position.set(px, baseTopY + 0.46, pz);
    add(rPost);

    const nextA = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
    if (Math.cos(nextA) >= -0.65) {
      const npx = tx + Math.cos(nextA) * 2.34;
      const npz = tz + Math.sin(nextA) * 2.34;
      add(
        beamBetween(
          [px, baseTopY + 0.82, pz],
          [npx, baseTopY + 0.82, npz],
          0.09,
          0.09,
          materials.timberDark,
        ),
      );
    }
  }
  yield;

  const smockH = towerTopY - baseTopY;
  const smockBody = cyl(1.74, smockH, materials.stuccoWarm, {
    radiusTop: 1.36,
    segments: 8,
    outline: 0.018,
  });
  smockBody.position.set(tx, baseTopY + smockH / 2, tz);
  add(smockBody);

  const midRing = cyl(1.58, 0.16, materials.timber, {
    radiusTop: 1.56,
    segments: 8,
    outline: 0.012,
  });
  midRing.position.set(tx, baseTopY + smockH * 0.52, tz);
  add(midRing);

  const topCurb = cyl(1.46, 0.22, materials.timberDark, {
    radiusTop: 1.48,
    segments: 8,
    outline: 0.014,
  });
  topCurb.position.set(tx, towerTopY - 0.06, tz);
  add(topCurb);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    add(
      beamBetween(
        [tx + ca * 1.72, baseTopY + 0.08, tz + sa * 1.72],
        [tx + ca * 1.35, towerTopY - 0.08, tz + sa * 1.35],
        0.13,
        0.13,
        materials.timber,
      ),
    );
  }
  yield;

  const capH = capApexY - towerTopY;
  const capRoof = cyl(1.68, capH, materials.roofRidge, {
    radiusTop: 0.08,
    segments: 8,
    outline: 0.018,
  });
  capRoof.position.set(tx, towerTopY + capH / 2, tz);
  add(capRoof);

  const capSoffit = cyl(1.70, 0.14, materials.timberDark, {
    radiusTop: 1.64,
    segments: 8,
    outline: 0.012,
  });
  capSoffit.position.set(tx, towerTopY - 0.02, tz);
  add(capSoffit);

  const finialSpire = cyl(0.06, 0.72, materials.signGold, {
    radiusTop: 0.02,
    segments: 6,
    outline: 0.01,
  });
  finialSpire.position.set(tx, capApexY + 0.32, tz);
  add(finialSpire);

  const shaftBox = box(0.72, 0.72, 1.28, materials.timberDark, {
    tile: TILE.wood,
    outline: 0.014,
  });
  shaftBox.position.set(tx, hubY, tz + 1.24);
  add(shaftBox);

  const shaftHood = box(0.88, 0.16, 1.38, materials.roofRidge, { outline: 0.012 });
  shaftHood.position.set(tx, hubY + 0.40, tz + 1.26);
  add(shaftHood);

  add(
    beamBetween(
      [tx, hubY - 0.95, tz + 1.15],
      [tx, hubY - 0.28, tz + 1.78],
      0.14,
      0.14,
      materials.timber,
    ),
  );
  yield;

  const sailsGroup = new THREE.Group();
  sailsGroup.name = 'windmill-sails';
  sailsGroup.position.set(tx, hubY, hubZ);
  sailsGroup.rotation.z = 0.42;
  sailsGroup.userData.noMerge = true;

  const sAdd = (obj) => {
    sailsGroup.add(obj);
    return obj;
  };

  sAdd(cyl(0.28, 0.62, materials.timberDark, { axis: 'z', segments: 8, outline: 0 }));
  const hubCap = cyl(0.18, 0.76, materials.timber, { axis: 'z', segments: 8, outline: 0 });
  hubCap.position.z = 0.08;
  sAdd(hubCap);

  const sailSpan = 3.55;
  const sailPitch = 0.24;

  for (let i = 0; i < 4; i++) {
    const armAngle = (i * Math.PI) / 2;
    const armHolder = new THREE.Group();
    armHolder.rotation.z = armAngle;

    const stock = box(0.13, sailSpan, 0.13, materials.timberDark, {
      tile: TILE.wood,
      outline: 0,
    });
    stock.position.set(0, sailSpan * 0.5, 0);
    armHolder.add(stock);

    const panelGroup = new THREE.Group();
    panelGroup.position.set(0, 2.12, 0);
    panelGroup.rotation.y = sailPitch;

    const panelLen = 2.82;
    const panelW = 0.88;

    const canvasSheet = box(panelW - 0.06, panelLen - 0.08, 0.04, materials.sailCanvas, {
      tile: TILE.stucco,
      outline: 0,
    });
    canvasSheet.position.set(0.28, 0, 0.0);
    panelGroup.add(canvasSheet);

    for (const rx of [-0.16, 0.28, 0.72]) {
      const rail = box(0.05, panelLen, 0.065, materials.timber, {
        tile: TILE.wood,
        outline: 0,
      });
      rail.position.set(rx, 0, 0.015);
      panelGroup.add(rail);
    }

    const rungs = 7;
    for (let r = 0; r < rungs; r++) {
      const ry = -panelLen * 0.5 + (r / (rungs - 1)) * panelLen;
      const rung = box(panelW + 0.06, 0.05, 0.07, materials.timberDark, {
        tile: TILE.wood,
        outline: 0,
      });
      rung.position.set(0.28, ry, 0.018);
      panelGroup.add(rung);
    }

    armHolder.add(panelGroup);
    sailsGroup.add(armHolder);
    yield;
  }

  yield* mergeStaticGen(sailsGroup, { outline: 0, materials });
  add(sailsGroup);
  return sailsGroup;
}

// Serialize async building construction because parts.js accumulates roof tiles in a module-level queue
let _tileQueueLock = Promise.resolve();
function withTileQueueLock(fn) {
  const next = _tileQueueLock.then(fn, fn);
  _tileQueueLock = next.catch(() => {});
  return next;
}

export const VILLAGE_BUILDING_SPECS = {
  inn: {
    id: 'inn',
    name: '1. Crossroads Inn & Bakery',
    x: -15.5,
    z: -14.5,
    y: 0.0,
    w: 10.4,
    d: 7.4,
    wallH: 5.75,
    roofH: 3.4,
    rotY: Math.atan2(15.5, 14.5),
    stories: 2,
    subDepth: 1.5,
    colliderPad: 0.6,
  },
  herbalist: {
    id: 'herbalist',
    name: '2. Apothecary & Herb Conservatory',
    x: 16.5,
    z: -13.5,
    y: 0.0,
    w: 8.6,
    d: 6.4,
    wallH: 4.45,
    roofH: 3.0,
    rotY: Math.atan2(-16.5, 13.5),
    stories: 1.5,
    subDepth: 1.5,
    colliderPad: 0.5,
  },
  smithy: {
    id: 'smithy',
    name: '3. Foothill Smithy & Cooperage',
    x: 16.8,
    z: 14.2,
    y: 0.0,
    w: 9.0,
    d: 6.8,
    wallH: 4.55,
    roofH: 3.1,
    rotY: Math.atan2(-16.8, -14.2),
    stories: 1.5,
    subDepth: 1.5,
    colliderPad: 0.5,
  },
  gardener: {
    id: 'gardener',
    name: '4. Shepherd & Gardener Cottage',
    x: -15.8,
    z: 14.8,
    y: 0.0,
    w: 8.2,
    d: 6.2,
    wallH: 4.1,
    roofH: 2.9,
    rotY: Math.atan2(15.8, -14.8),
    stories: 1,
    subDepth: 1.5,
    colliderPad: 0.5,
    gardenPatch: { ox: 6.5, oz: 0.0, w: 4.4, d: 5.6 },
  },
  watermill: {
    id: 'watermill',
    name: '5. Waterfall Stream Mill',
    x: -44.0,
    z: -18.0,
    y: 0.3,
    w: 7.8,
    d: 6.4,
    wallH: 4.75,
    roofH: 3.0,
    rotY: 0.42,
    stories: 1.5,
    subDepth: 2.6,
    colliderPad: 0.5,
  },
};

export const LINEUP_SPECS = [
  { ...VILLAGE_BUILDING_SPECS.inn, x: -31.5, y: 0, z: 0, rotY: 0.12 },
  { ...VILLAGE_BUILDING_SPECS.herbalist, x: -14.5, y: 0, z: 0, rotY: 0.08 },
  { ...VILLAGE_BUILDING_SPECS.smithy, x: 0.0, y: 0, z: 0, rotY: -0.08 },
  { ...VILLAGE_BUILDING_SPECS.gardener, x: 16.0, y: 0, z: 0, rotY: -0.1 },
  { ...VILLAGE_BUILDING_SPECS.watermill, x: 34.5, y: 0.3, z: 0, rotY: 0.12 },
];

function assembleHousesKit(textures, materials) {
  function* buildVillageBuildingGen(type, opts = {}) {
    const baseSpec = VILLAGE_BUILDING_SPECS[type] || VILLAGE_BUILDING_SPECS.inn;
    const spec = { ...baseSpec, ...opts };
    const { w, d, wallH, roofH, subDepth = 1.5, colliderPad = 0.5 } = spec;
    const plinthH = 0.55;
    const eaveY = plinthH + wallH;
    const ridgeY = eaveY + roofH;

    const group = new THREE.Group();
    group.name = `house-${type}`;
    if (opts.x !== undefined || opts.y !== undefined || opts.z !== undefined) {
      group.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    }
    if (opts.rotY !== undefined) {
      group.rotation.y = opts.rotY;
    }

    const add = (obj) => {
      group.add(obj);
      return obj;
    };
    const place = (obj, x, y, z, rotY = 0) => {
      obj.position.set(x, y, z);
      obj.rotation.y = rotY;
      group.add(obj);
      return obj;
    };

    const stepInfo = buildFrontSteps(add, materials, {
      doorX: 0,
      wallZ: d * 0.5,
      stepW: 2.24,
      subDepth,
    });
    yield;

    let wheelGroup = null;
    let sailsGroup = null;

    if (type === 'inn') {
      const dormer = computeDormerSpec({
        x: 3.45,
        d,
        eaveY,
        ridgeY,
        width: 1.5,
        wallH: 1.0,
        rise: 0.82,
        seed: 140,
      });
      yield* buildCoreShellGen(add, place, materials, {
        w,
        d,
        wallH,
        roofH,
        plinthH,
        subDepth,
        floorY: 3.24,
        winSideX: 3.68,
        upperWins: true,
        centerUpperWin: true,
        pilasters: true,
        seed: 100,
        skipFront: (pos) => {
          const gableSpan = 2.08 * (1 - Math.max(0, pos.y - (eaveY - 0.12)) / roofH) - 0.24;
          return Math.abs(pos.x) < gableSpan || dormer.skipFn(pos);
        },
      });
      yield;
      buildFlushCrossGable(add, materials, {
        d,
        eaveY: eaveY - 0.12,
        ridgeY,
        halfW: 1.98,
        roofHalf: 2.28,
        seed: 130,
      });
      yield;
      buildDormerUnit(add, place, materials, dormer);
      yield;
      buildChimneyUnit(add, materials, { x: 3.85, z: -0.75, baseY: eaveY + 0.5, topY: ridgeY + 1.05 });
      yield;
      yield* buildInnPorchAndPropsGen(add, materials, { d, plinthH, subDepth, seed: 150 });
      yield;
    } else if (type === 'herbalist') {
      const dormer = computeDormerSpec({
        x: 1.72,
        d,
        eaveY,
        ridgeY,
        width: 1.54,
        wallH: 1.0,
        rise: 0.82,
        seed: 230,
      });
      yield* buildCoreShellGen(add, place, materials, {
        w,
        d,
        wallH,
        roofH,
        plinthH,
        subDepth,
        floorY: 3.1,
        winSideX: 2.65,
        sideWinLeft: false,
        seed: 200,
        skipFront: dormer.skipFn,
      });
      yield;
      buildDormerUnit(add, place, materials, dormer);
      yield;
      buildChimneyUnit(add, materials, { x: -2.85, z: -0.6, baseY: eaveY + 0.4, topY: ridgeY + 0.95 });
      buildPitchedDoorHood(add, materials, { x: 0, y: 3.3, wallZ: d / 2, width: 2.22, rise: 0.56, depth: 0.94, seed: 240 });
      yield;
      buildGreenhouseLeanTo(add, materials, { wallX: -w / 2, subDepth, seed: 250 });
      yield;
    } else if (type === 'smithy') {
      const dormer = computeDormerSpec({
        x: -1.8,
        d,
        eaveY,
        ridgeY,
        width: 1.56,
        wallH: 1.02,
        rise: 0.84,
        seed: 330,
      });
      yield* buildCoreShellGen(add, place, materials, {
        w,
        d,
        wallH,
        roofH,
        plinthH,
        subDepth,
        floorY: 3.12,
        winSideX: 2.8,
        sideWinRight: false,
        skipRightGableCenter: true,
        seed: 300,
        skipFront: dormer.skipFn,
      });
      yield;
      buildDormerUnit(add, place, materials, dormer);
      yield;
      buildPitchedDoorHood(add, materials, { x: 0, y: 3.32, wallZ: d / 2, width: 2.24, rise: 0.58, depth: 0.96, seed: 340 });
      yield;
      yield* buildForgeShedAndHearthGen(add, place, materials, { wallX: w / 2, ridgeY, subDepth, seed: 350 });
      yield;
    } else if (type === 'gardener') {
      const dormer = computeDormerSpec({
        x: -1.62,
        d,
        eaveY,
        ridgeY,
        width: 1.52,
        wallH: 0.98,
        rise: 0.8,
        seed: 430,
      });
      yield* buildCoreShellGen(add, place, materials, {
        w,
        d,
        wallH,
        roofH,
        plinthH,
        subDepth,
        floorY: 3.08,
        winSideX: 2.5,
        seed: 400,
        skipFront: dormer.skipFn,
      });
      yield;
      buildDormerUnit(add, place, materials, dormer);
      yield;
      buildChimneyUnit(add, materials, { x: -2.65, z: -0.58, baseY: eaveY + 0.35, topY: ridgeY + 0.9 });
      buildPitchedDoorHood(add, materials, { x: 0, y: 3.28, wallZ: d / 2, width: 2.22, rise: 0.56, depth: 0.96, seed: 440 });
      yield;
      yield* buildKitchenGardenGen(add, place, materials, {
        wallX: w / 2,
        gardenPatch: spec.gardenPatch || { ox: 6.5, oz: 0, w: 4.4, d: 5.6 },
        subDepth,
        seed: 450,
      });
      yield;
    } else if (type === 'watermill') {
      const dormer = computeDormerSpec({
        x: 1.52,
        d,
        eaveY,
        ridgeY,
        width: 1.52,
        wallH: 1.0,
        rise: 0.82,
        seed: 530,
      });
      yield* buildCoreShellGen(add, place, materials, {
        w,
        d,
        wallH,
        roofH,
        plinthH,
        subDepth: 2.6,
        floorY: 3.12,
        stoneLowerH: 2.55,
        winSideX: 2.42,
        sideWinLeft: false,
        seed: 500,
        skipFront: dormer.skipFn,
      });
      yield;
      buildDormerUnit(add, place, materials, dormer);
      yield;
      buildPitchedDoorHood(add, materials, { x: 0, y: 3.32, wallZ: d / 2, width: 2.2, rise: 0.56, depth: 0.94, seed: 540 });
      yield;
      wheelGroup = yield* buildWaterwheelAssemblyGen(add, materials, {
        wallX: -w * 0.5,
        wheelX: -w * 0.5 - 0.72,
        wheelY: 0.85,
        subDepth: 2.6,
        inValley: Boolean(spec.inValley || spec.hasWaterwheel),
      });
      yield;
      sailsGroup = yield* buildWindmillTowerAndSailsGen(add, materials, {
        wallX: w * 0.5,
        subDepth: 2.6,
      });
      yield;
    }

    finalizeRoofTiles(add, materials);
    yield;
    group.userData.plinthH = plinthH;
    group.userData.eaveY = eaveY;
    group.userData.ridgeY = ridgeY;
    yield* mergeStaticGen(group, { outline: 0.018, materials, plinthH, eaveY });

    const cx = spec.x ?? 0;
    const cy = spec.y ?? 0;
    const cz = spec.z ?? 0;
    const rotY = spec.rotY ?? 0;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);

    const doorDist = stepInfo.z; // d * 0.5 + 1.35
    const doorWorldOffset = new THREE.Vector3(
      Math.sin(rotY) * doorDist,
      0,
      Math.cos(rotY) * doorDist,
    );
    doorWorldOffset.localX = 0;
    doorWorldOffset.localZ = doorDist;

    const collider = {
      id: spec.id || type,
      type: 'obb',
      x: cx,
      y: cy,
      z: cz,
      w,
      d,
      halfW: w * 0.5 + colliderPad,
      halfD: d * 0.5 + colliderPad,
      hx: w * 0.5 + colliderPad,
      hz: d * 0.5 + colliderPad,
      height: ridgeY,
      rotY,
    };

    const makeWingObb = (wing, lx, lz, hx, hz, height = eaveY) => {
      const wx = cx + lx * cos + lz * sin;
      const wz = cz - lx * sin + lz * cos;
      return {
        id: `${spec.id || type}-${wing}`,
        parentId: spec.id || type,
        wing,
        type: 'obb',
        x: wx,
        y: cy,
        z: wz,
        localX: lx,
        localZ: lz,
        w: hx * 2,
        d: hz * 2,
        halfW: hx,
        halfD: hz,
        hx,
        hz,
        height,
        rotY,
      };
    };

    const wingColliders = [];
    if (type === 'inn') {
      wingColliders.push(
        makeWingObb('porch-steps', 0, d * 0.5 + 1.15, 2.35, 1.25, 3.5),
        makeWingObb('outdoor-table', -3.55, d * 0.5 + 1.35, 1.15, 1.05, 1.2),
      );
    } else if (type === 'herbalist') {
      wingColliders.push(
        makeWingObb('conservatory', -w * 0.5 - 1.25, 0.2, 1.45, 2.35, 3.6),
        makeWingObb('front-steps', 0, d * 0.5 + 0.9, 1.3, 0.95, 1.0),
      );
    } else if (type === 'smithy') {
      wingColliders.push(
        makeWingObb('forge-shed', w * 0.5 + 1.75, 0.35, 1.85, 2.35, 4.3),
        makeWingObb('front-steps', 0, d * 0.5 + 0.9, 1.3, 0.95, 1.0),
      );
    } else if (type === 'gardener') {
      wingColliders.push(
        makeWingObb(
          'kitchen-garden',
          spec.gardenPatch?.ox ?? 6.5,
          spec.gardenPatch?.oz ?? 0,
          2.35,
          2.95,
          1.2,
        ),
        makeWingObb('front-steps', 0, d * 0.5 + 0.9, 1.3, 0.95, 1.0),
      );
    } else if (type === 'watermill') {
      wingColliders.push(
        makeWingObb('waterwheel', -w * 0.5 - 0.85, 0, 1.15, 2.45, 3.5),
        makeWingObb('front-steps', 0, d * 0.5 + 0.9, 1.3, 0.95, 1.0),
      );
    }

    const colliders = [collider, ...wingColliders];

    const update = (dt = 0) => {
      if (wheelGroup) wheelGroup.rotation.x += dt * 1.15;
      if (sailsGroup) sailsGroup.rotation.z -= dt * 0.65;
    };

    return { group, doorWorldOffset, collider, wingColliders, colliders, update };
  }

  function buildVillageBuilding(type, opts = {}) {
    return runSync(buildVillageBuildingGen(type, opts));
  }

  function buildVillageBuildingAsync(type, opts = {}) {
    return withTileQueueLock(() =>
      runAsync(buildVillageBuildingGen(type, opts), createLocalTimeSlicer(opts)),
    );
  }

  function* buildAllVillageBuildingsGen(buildingsSpec = Object.values(VILLAGE_BUILDING_SPECS)) {
    const group = new THREE.Group();
    group.name = 'village-buildings';
    const buildings = [];
    const colliders = [];
    const updaters = [];

    for (const spec of buildingsSpec) {
      const id = spec.id || spec.type;
      const built = yield* buildVillageBuildingGen(id, spec);
      group.add(built.group);
      buildings.push({ id, spec, ...built });
      colliders.push(...built.colliders);
      updaters.push(built.update);
      yield;
    }

    // Batch all 5 static building shells, outlines, and roof tiles into <= 15 draw calls total
    yield* mergeStaticGen(group, { outline: 0.018, materials });

    const update = (dt = 0) => {
      for (const fn of updaters) fn(dt);
    };

    return { group, buildings, colliders, update };
  }

  function buildAllVillageBuildings(buildingsSpec = Object.values(VILLAGE_BUILDING_SPECS)) {
    return runSync(buildAllVillageBuildingsGen(buildingsSpec));
  }

  function buildAllVillageBuildingsAsync(buildingsSpec, maybeOpts = {}) {
    let specs = Object.values(VILLAGE_BUILDING_SPECS);
    let opts = maybeOpts || {};
    if (Array.isArray(buildingsSpec)) {
      specs = buildingsSpec;
    } else if (
      buildingsSpec &&
      typeof buildingsSpec === 'object' &&
      typeof buildingsSpec[Symbol.iterator] !== 'function'
    ) {
      opts = buildingsSpec;
    } else if (buildingsSpec && typeof buildingsSpec[Symbol.iterator] === 'function') {
      specs = Array.from(buildingsSpec);
    }
    return withTileQueueLock(() =>
      runAsync(buildAllVillageBuildingsGen(specs), createLocalTimeSlicer(opts)),
    );
  }

  return {
    textures,
    materials,
    mats: materials,
    buildVillageBuilding,
    buildVillageBuildingAsync,
    createBuilding: buildVillageBuilding,
    createBuildingAsync: buildVillageBuildingAsync,
    buildAllVillageBuildings,
    buildAllVillageBuildingsAsync,
  };
}

export function createHousesKit(renderer = null) {
  const textures = createTextures(renderer);
  const materials = createMaterials(textures);
  return assembleHousesKit(textures, materials);
}

export async function createHousesKitAsync(renderer = null, opts = {}) {
  const slicer = createLocalTimeSlicer(opts);
  const textures = await createTexturesAsync(renderer, {
    yieldFrame: slicer.yieldFrame,
    sliceBudgetMs: slicer.sliceBudgetMs,
  });
  await slicer.maybeYield(true);
  const materials = createMaterials(textures);
  await slicer.maybeYield(true);
  return assembleHousesKit(textures, materials);
}
