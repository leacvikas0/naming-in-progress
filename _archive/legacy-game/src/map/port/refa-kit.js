// ============================================================================
// REFA KIT — verbatim port of reference scene A's botanical asset engine.
//
// Source (read-only): C:\Users\silen\Downloads\ai_studio_code (31).html
// (three r160, 1574 lines)
//
//   SeededRandom ................................. source 192-204
//   BotanicalGeometryBuilder ..................... source 249-614
//   BotanicalAssetLibrary ........................ source 621-814
//   MOOD_PRESETS ................................. source 819-859
//   sharedUniforms ............................... source 861-878
//   sharedGLSL ................................... source 880-933
//   createBotanicalMaterial ...................... source 935-1135
//   applyPreset (mood-btn handler) ............... source 1489-1499
//
// The geometry math, every constant, the merged attribute layout
// (position, normal, uv, aPartId, aSwayWeight, aPetalCoord), the shader
// source, the uniform names and the palette hex values are copied unchanged.
//
// Only adaptations (three r160 -> r0.170):
//   * `import * as THREE from 'three'` instead of the page's importmap global.
//   * No DOM / window / renderer / scene / HUD / inspector / animation loop.
//   * Builders are exported and built lazily instead of running at module scope.
//   * The material factory is `createRefaMaterial(preset, overrides)`; the
//     ShaderMaterial itself is the source's `createBotanicalMaterial()` verbatim.
//   * `THREE.sRGBEncoding`-era calls: none were used by this source.
// ============================================================================

import * as THREE from "three";

// ============================================================================
// MODULE 1: DETERMINISTIC SEEDED PRNG
// (source A lines 192-204 — TerrainNoise is NOT ported, it belongs to the
// reference terrain, not to the botanical assets)
// ============================================================================
export class SeededRandom {
  constructor(seed = 1337) {
    this.s = seed % 2147483647;
    if (this.s <= 0) this.s += 2147483646;
  }
  next() {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
}

// ============================================================================
// MODULE 2: BOTANICAL 3D GEOMETRY BUILDER
// Builds manifold, multi-part 3D plant geometry with custom vertex attributes:
//   aPartId:
//     0.0 = 3D Tapered Stem & Branching Pedicels
//     1.0 = 3D V-Folded Lanceolate Leaves & 5-Pointed Calyx Sepal Cups
//     2.0 = 3D Fused Corolla Bell Tube & 5 Cupped, Recurved Petals
//     3.0 = Inner Golden Stamens / Anthers
//     4.0 = 3D Star-Wildflower Pearl-White Ray Petals
// (source A lines 249-614, verbatim)
// ============================================================================
export class BotanicalGeometryBuilder {

  /**
   * Self-contained, deterministic geometry merger so all sub-parts of a flower
   * compile into a single reusable BufferGeometry with 1 draw call.
   */
  static mergeSubGeometries(geometries) {
    let totalVerts = 0;
    for (const g of geometries) {
      totalVerts += g.attributes.position.count;
    }

    const position = new Float32Array(totalVerts * 3);
    const normal = new Float32Array(totalVerts * 3);
    const uv = new Float32Array(totalVerts * 2);
    const aPartId = new Float32Array(totalVerts);
    const aSwayWeight = new Float32Array(totalVerts);
    const aPetalCoord = new Float32Array(totalVerts * 2);

    let offset = 0;
    for (const g of geometries) {
      const count = g.attributes.position.count;
      position.set(g.attributes.position.array, offset * 3);
      normal.set(g.attributes.normal.array, offset * 3);
      uv.set(g.attributes.uv.array, offset * 2);
      aPartId.set(g.attributes.aPartId.array, offset);
      aSwayWeight.set(g.attributes.aSwayWeight.array, offset);
      aPetalCoord.set(g.attributes.aPetalCoord.array, offset * 2);
      offset += count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setAttribute('aPartId', new THREE.BufferAttribute(aPartId, 1));
    merged.setAttribute('aSwayWeight', new THREE.BufferAttribute(aSwayWeight, 1));
    merged.setAttribute('aPetalCoord', new THREE.BufferAttribute(aPetalCoord, 2));
    merged.computeBoundingSphere();
    return merged;
  }

  static tagGeometry(geo, partId, swayFn, petalCoordFn = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.computeVertexNormals();

    const count = g.attributes.position.count;
    const pos = g.attributes.position;
    const uvs = g.attributes.uv;

    const partArr = new Float32Array(count);
    const swayArr = new Float32Array(count);
    const petalArr = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const u = uvs ? uvs.getX(i) : 0.5;
      const v = uvs ? uvs.getY(i) : 0.5;

      partArr[i] = partId;
      swayArr[i] = swayFn(x, y, z, u, v);

      if (petalCoordFn) {
        const pc = petalCoordFn(x, y, z, u, v);
        petalArr[i * 2] = pc[0];
        petalArr[i * 2 + 1] = pc[1];
      } else {
        petalArr[i * 2] = (u - 0.5) * 2.0;
        petalArr[i * 2 + 1] = v;
      }
    }

    g.setAttribute('aPartId', new THREE.BufferAttribute(partArr, 1));
    g.setAttribute('aSwayWeight', new THREE.BufferAttribute(swayArr, 1));
    g.setAttribute('aPetalCoord', new THREE.BufferAttribute(petalArr, 2));
    return g;
  }

  /**
   * 1. True 3D Tapered Cylindrical Stem / Pedicel along a 3D Curve
   */
  static createTaperedStem(curve, radiusBottom, radiusTop, tubularSegs, radialSegs, maxHeight = 1.4) {
    const frames = curve.computeFrenetFrames(tubularSegs, false);
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= tubularSegs; i++) {
      const v = i / tubularSegs;
      const pt = curve.getPointAt(v);
      const N = frames.normals[i];
      const B = frames.binormals[i];
      const r = radiusBottom * (1.0 - v) + radiusTop * v;

      for (let j = 0; j <= radialSegs; j++) {
        const u = j / radialSegs;
        const theta = u * Math.PI * 2;
        const cosT = Math.cos(theta), sinT = Math.sin(theta);

        const vx = pt.x + r * (cosT * N.x + sinT * B.x);
        const vy = pt.y + r * (cosT * N.y + sinT * B.y);
        const vz = pt.z + r * (cosT * N.z + sinT * B.z);

        positions.push(vx, vy, vz);
        uvs.push(u, v);
      }
    }

    const stride = radialSegs + 1;
    for (let i = 0; i < tubularSegs; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        indices.push(a, b, d, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    return this.tagGeometry(
      geo,
      0.0,
      (x, y) => Math.pow(Math.max(0, y / maxHeight), 1.4),
      (x, y, z, u, v) => [0.0, v]
    );
  }

  /**
   * 2. True 3D Folded Lanceolate Leaf (V-shaped midrib cross-section & arch)
   */
  static create3DLanceolateLeaf(length, width, archPitch, yawAngle, droop, baseOrigin, maxHeight = 1.4) {
    const lengthSegs = 6;
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= lengthSegs; i++) {
      const v = i / lengthSegs;
      const profile = Math.sin(Math.pow(v, 0.72) * Math.PI) * (1.0 - 0.15 * v);
      const halfW = width * 0.5 * profile;

      const reach = v * length * Math.cos(archPitch);
      const lift = v * length * Math.sin(archPitch) - Math.pow(v, 2.15) * droop * length;

      // V-crease depth gives the leaf real 3D volume from every viewing angle
      const creaseDepth = halfW * 0.34;

      const rowPts = [
        [-halfW, lift + creaseDepth, reach, 0.0],
        [0.0,    lift,               reach, 0.5],
        [halfW,  lift + creaseDepth, reach, 1.0]
      ];

      const cosY = Math.cos(yawAngle), sinY = Math.sin(yawAngle);
      for (const [lx, ly, lz, u] of rowPts) {
        const wx = baseOrigin.x + (lx * cosY + lz * sinY);
        const wy = baseOrigin.y + ly;
        const wz = baseOrigin.z + (-lx * sinY + lz * cosY);
        positions.push(wx, wy, wz);
        uvs.push(u, v);
      }
    }

    for (let i = 0; i < lengthSegs; i++) {
      const r0 = i * 3;
      const r1 = (i + 1) * 3;
      indices.push(r0, r1, r0 + 1, r1, r1 + 1, r0 + 1);
      indices.push(r0 + 1, r1 + 1, r0 + 2, r1 + 1, r1 + 2, r0 + 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    return this.tagGeometry(
      geo,
      1.0,
      (x, y, z, u, v) => Math.pow(Math.max(0, y / maxHeight), 1.3) + v * 0.15,
      (x, y, z, u, v) => [Math.abs(u - 0.5) * 2.0, v]
    );
  }

  /**
   * 3. Complete 3D Bellflower / Phlox Blossom (Floret):
   *    - Part A: 5-pointed Green Calyx (Sepal Cup)
   *    - Part B: Fused 3D Corolla Bell Tube flaring into 5 Cupped, Recurved 3D Petals
   *    - Part C: Inner Golden Stamens / Anthers
   */
  static create3DFloret(scale, openness, matrix, maxHeight = 1.4) {
    const subGeos = [];

    // --- PART A: 5-Pointed Green Calyx (Sepal Cup) ---
    const sepalCount = 5;
    const calyxPos = [];
    const calyxUvs = [];
    const calyxIdx = [];
    let cVert = 0;

    for (let s = 0; s < sepalCount; s++) {
      const baseAngle = (s / sepalCount) * Math.PI * 2;
      const span = ((Math.PI * 2) / sepalCount) * 0.55;
      const r0 = 0.024 * scale;
      const rMid = 0.056 * scale;
      const rTip = 0.078 * scale;
      const hMid = 0.048 * scale;
      const hTip = 0.105 * scale;

      const p0 = [Math.cos(baseAngle) * r0, 0, Math.sin(baseAngle) * r0];
      const pL = [Math.cos(baseAngle - span) * rMid, hMid, Math.sin(baseAngle - span) * rMid];
      const pR = [Math.cos(baseAngle + span) * rMid, hMid, Math.sin(baseAngle + span) * rMid];
      const pTip = [Math.cos(baseAngle) * rTip, hTip, Math.sin(baseAngle) * rTip];

      calyxPos.push(...p0, ...pL, ...pR, ...pTip);
      calyxUvs.push(0.5, 0.0, 0.0, 0.5, 1.0, 0.5, 0.5, 1.0);
      calyxIdx.push(cVert, cVert + 1, cVert + 3, cVert, cVert + 3, cVert + 2);
      cVert += 4;
    }

    const calyxGeo = new THREE.BufferGeometry();
    calyxGeo.setAttribute('position', new THREE.Float32BufferAttribute(calyxPos, 3));
    calyxGeo.setAttribute('uv', new THREE.Float32BufferAttribute(calyxUvs, 2));
    calyxGeo.setIndex(calyxIdx);
    calyxGeo.applyMatrix4(matrix);
    subGeos.push(
      this.tagGeometry(
        calyxGeo,
        1.0,
        (x, y) => Math.pow(Math.max(0, y / maxHeight), 1.4),
        (x, y, z, u, v) => [Math.abs(u - 0.5) * 2.0, v * 0.5]
      )
    );

    // --- PART B: Fused 3D Corolla Tube + 5 Cupped, Recurved Petals ---
    const petals = 5;
    const uSteps = 4; // Across each petal [-1..+1] (3D cupped curve + midrib crease)
    const vSteps = 6; // Along flower [0 = calyx base, 0.34 = throat rim, 1.0 = curled petal tip]

    const corollaPos = [];
    const corollaUvs = [];
    const corollaIdx = [];
    let pVertOffset = 0;

    for (let p = 0; p < petals; p++) {
      const petalCenterAngle = (p / petals) * Math.PI * 2 + 0.31;
      const sectorSpan = (Math.PI * 2) / petals;

      for (let iv = 0; iv <= vSteps; iv++) {
        const v = iv / vSteps;
        const isLobe = Math.max(0.0, (v - 0.32) / 0.68);
        const lobeWidthProfile = Math.sin(Math.pow(isLobe, 0.7) * Math.PI);

        const angularHalfWidth = (sectorSpan * 0.5) * (
          v <= 0.34
            ? 1.0
            : (1.0 - isLobe) * 0.94 + lobeWidthProfile * 1.22 * openness
        );

        const tubeRadius = (0.026 + v * 0.115) * scale;
        const lobeFlare = Math.pow(isLobe, 1.4) * 0.26 * openness * scale;
        const baseRadius = tubeRadius + lobeFlare;

        const yTube = v * 0.24 * scale;
        const yRecurve = Math.sin(isLobe * Math.PI * 0.78) * 0.085 * scale - Math.pow(isLobe, 2.3) * 0.06 * scale;
        const yBase = yTube + yRecurve;

        for (let iu = 0; iu <= uSteps; iu++) {
          const uNorm = (iu / uSteps) * 2.0 - 1.0;
          const theta = petalCenterAngle + uNorm * angularHalfWidth;

          const cupDepth = (1.0 - uNorm * uNorm) * isLobe * 0.036 * scale;
          const midribGroove = (1.0 - Math.abs(uNorm)) * isLobe * 0.014 * scale;
          const r = baseRadius - cupDepth + midribGroove;
          const y = yBase + (uNorm * uNorm) * isLobe * 0.02 * scale;

          const vx = Math.cos(theta) * r;
          const vz = Math.sin(theta) * r;

          corollaPos.push(vx, y, vz);
          corollaUvs.push(iu / uSteps, v);
        }
      }

      const rowStride = uSteps + 1;
      for (let iv = 0; iv < vSteps; iv++) {
        for (let iu = 0; iu < uSteps; iu++) {
          const a = pVertOffset + iv * rowStride + iu;
          const b = pVertOffset + (iv + 1) * rowStride + iu;
          const c = pVertOffset + (iv + 1) * rowStride + (iu + 1);
          const d = pVertOffset + iv * rowStride + (iu + 1);
          corollaIdx.push(a, b, d, b, c, d);
        }
      }
      pVertOffset += (vSteps + 1) * (uSteps + 1);
    }

    const corollaGeo = new THREE.BufferGeometry();
    corollaGeo.setAttribute('position', new THREE.Float32BufferAttribute(corollaPos, 3));
    corollaGeo.setAttribute('uv', new THREE.Float32BufferAttribute(corollaUvs, 2));
    corollaGeo.setIndex(corollaIdx);
    corollaGeo.applyMatrix4(matrix);
    subGeos.push(
      this.tagGeometry(
        corollaGeo,
        2.0,
        (x, y, z, u, v) => Math.pow(Math.max(0, y / maxHeight), 1.4) + v * 0.08,
        (x, y, z, u, v) => [(u - 0.5) * 2.0, v]
      )
    );

    // --- PART C: Inner Golden Stamens / Anthers ---
    const stamenCount = 5;
    const stamenPos = [];
    const stamenUvs = [];
    const stamenIdx = [];
    let sVert = 0;

    for (let s = 0; s < stamenCount; s++) {
      const a = (s / stamenCount) * Math.PI * 2 + 0.35;
      const rBase = 0.012 * scale;
      const rTip = 0.036 * scale;
      const h0 = 0.04 * scale;
      const h1 = 0.175 * scale;
      const w = 0.012 * scale;

      const tx = -Math.sin(a) * w, tz = Math.cos(a) * w;
      const bx = Math.cos(a) * rBase, bz = Math.sin(a) * rBase;
      const ex = Math.cos(a) * rTip, ez = Math.sin(a) * rTip;

      stamenPos.push(
        bx - tx, h0, bz - tz,
        bx + tx, h0, bz + tz,
        ex + tx, h1, ez + tz,
        ex - tx, h1, ez - tz
      );
      stamenUvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      stamenIdx.push(sVert, sVert + 1, sVert + 2, sVert, sVert + 2, sVert + 3);
      sVert += 4;
    }

    const stamenGeo = new THREE.BufferGeometry();
    stamenGeo.setAttribute('position', new THREE.Float32BufferAttribute(stamenPos, 3));
    stamenGeo.setAttribute('uv', new THREE.Float32BufferAttribute(stamenUvs, 2));
    stamenGeo.setIndex(stamenIdx);
    stamenGeo.applyMatrix4(matrix);
    subGeos.push(
      this.tagGeometry(
        stamenGeo,
        3.0,
        (x, y) => Math.pow(Math.max(0, y / maxHeight), 1.4),
        (x, y, z, u, v) => [0.0, v]
      )
    );

    return this.mergeSubGeometries(subGeos);
  }

  static create3DBud(scale, matrix, maxHeight = 1.4) {
    return this.create3DFloret(scale * 0.65, 0.24, matrix, maxHeight);
  }
}

/** Standalone alias of the static merger (exported for kit consumers). */
export const mergeSubGeometries = (geometries) =>
  BotanicalGeometryBuilder.mergeSubGeometries(geometries);

// ============================================================================
// MODULE 3: REUSABLE BOTANICAL ASSET FACTORY
// Builds the finished 3D asset variations once at startup so they can be
// inspected on the turntable or instanced across the meadow.
// (source A lines 621-814, verbatim; seeds are the source's own seeds)
// ============================================================================
export const REFA_STALK_SEEDS = [101, 227, 389, 541];
export const REFA_WILDFLOWER_SEEDS = [701, 823, 947];
export const REFA_GRASS_SEEDS = [1103, 1237, 1381];

export class BotanicalAssetLibrary {
  constructor() {
    this.heroFlowerVariants = [];
    this.wildflowerVariants = [];
    this.grassTuftVariants = [];
    this.buildAllAssets();
  }

  buildAllAssets() {
    const stalkSeeds = REFA_STALK_SEEDS;
    for (let i = 0; i < stalkSeeds.length; i++) {
      this.heroFlowerVariants.push(this.buildHeroFlowerStalkVariant(stalkSeeds[i], i));
    }

    const wildSeeds = REFA_WILDFLOWER_SEEDS;
    for (let i = 0; i < wildSeeds.length; i++) {
      this.wildflowerVariants.push(this.build3DWildflowerVariant(wildSeeds[i]));
    }

    const grassSeeds = REFA_GRASS_SEEDS;
    for (let i = 0; i < grassSeeds.length; i++) {
      this.grassTuftVariants.push(this.build3DGrassTuftVariant(grassSeeds[i]));
    }
  }

  buildHeroFlowerStalkVariant(seed, variantIndex) {
    const rng = new SeededRandom(seed);
    const parts = [];
    const stalkHeight = rng.range(1.22, 1.46);

    // 1. Main S-Curved 3D Stem (Rachis)
    const leanX = rng.range(-0.11, 0.11);
    const leanZ = rng.range(-0.11, 0.11);
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(leanX * 0.4, stalkHeight * 0.35, leanZ * 0.4),
      new THREE.Vector3(-leanX * 0.25, stalkHeight * 0.72, -leanZ * 0.25),
      new THREE.Vector3(leanX * 0.45, stalkHeight, leanZ * 0.45)
    ]);

    parts.push(
      BotanicalGeometryBuilder.createTaperedStem(stemCurve, 0.028, 0.009, 10, 6, stalkHeight)
    );

    // 2. Basal Rosette & Cauline 3D Folded Lanceolate Leaves
    const leafCount = 7 + (variantIndex % 3);
    for (let l = 0; l < leafCount; l++) {
      const isCauline = l >= 5;
      const stemT = isCauline ? rng.range(0.14, 0.34) : rng.range(0.01, 0.08);
      const origin = stemCurve.getPointAt(stemT);
      const yaw = (l / leafCount) * Math.PI * 2 + rng.range(-0.22, 0.22);
      const length = isCauline ? rng.range(0.36, 0.50) : rng.range(0.52, 0.74);
      const width = isCauline ? rng.range(0.085, 0.11) : rng.range(0.105, 0.145);
      const archPitch = rng.range(0.52, 0.92);
      const droop = rng.range(0.30, 0.55);

      parts.push(
        BotanicalGeometryBuilder.create3DLanceolateLeaf(
          length, width, archPitch, yaw, droop, origin, stalkHeight
        )
      );
    }

    // 3. Lush Spiraled Cluster of 9 to 11 Full 3D Florets on Branching Pedicels
    const floretCount = 9 + (variantIndex % 3);
    const dummy = new THREE.Object3D();

    for (let f = 0; f < floretCount; f++) {
      const progress = f / (floretCount - 1);
      const stemT = 0.35 + progress * 0.57;
      const nodePt = stemCurve.getPointAt(stemT);

      // Golden-angle phyllotaxis spiral around the stem
      const azimuth = f * 2.39996 + rng.range(-0.18, 0.18);
      const pedicelLen = (0.145 - progress * 0.05) * rng.range(0.88, 1.14);
      const pedicelLift = rng.range(0.35, 0.65);

      const tipPt = new THREE.Vector3(
        nodePt.x + Math.cos(azimuth) * pedicelLen,
        nodePt.y + pedicelLen * pedicelLift,
        nodePt.z + Math.sin(azimuth) * pedicelLen
      );

      const pedicelCurve = new THREE.CatmullRomCurve3([
        nodePt,
        nodePt.clone().lerp(tipPt, 0.5).add(new THREE.Vector3(0, 0.015, 0)),
        tipPt
      ]);
      parts.push(
        BotanicalGeometryBuilder.createTaperedStem(pedicelCurve, 0.010, 0.006, 3, 4, stalkHeight)
      );

      dummy.position.copy(tipPt);
      const lookTarget = tipPt.clone().add(
        new THREE.Vector3(
          Math.cos(azimuth) * 1.0,
          rng.range(0.28, 0.88),
          Math.sin(azimuth) * 1.0
        )
      );
      dummy.lookAt(lookTarget);
      dummy.rotateX(Math.PI * 0.5);
      dummy.rotateY(rng.range(0, Math.PI * 2));
      dummy.updateMatrix();

      const floretScale = (1.24 - progress * 0.28) * rng.range(0.94, 1.12);
      const openness = 1.08 - progress * 0.20;

      parts.push(
        BotanicalGeometryBuilder.create3DFloret(floretScale, openness, dummy.matrix, stalkHeight)
      );
    }

    // 4. Apical Unopened 3D Buds at the Crown
    for (let b = 0; b < 2; b++) {
      const budT = 0.94 + b * 0.05;
      const budPt = stemCurve.getPointAt(budT);
      dummy.position.copy(budPt);
      dummy.rotation.set(rng.range(-0.25, 0.25), b * Math.PI, rng.range(-0.25, 0.25));
      dummy.updateMatrix();
      parts.push(BotanicalGeometryBuilder.create3DBud(0.90 - b * 0.15, dummy.matrix, stalkHeight));
    }

    return BotanicalGeometryBuilder.mergeSubGeometries(parts);
  }

  build3DWildflowerVariant(seed) {
    const rng = new SeededRandom(seed);
    const parts = [];
    const stemsInClump = 3;
    const maxH = 0.68;
    const dummy = new THREE.Object3D();

    for (let s = 0; s < stemsInClump; s++) {
      const angle = (s / stemsInClump) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const dist = rng.range(0.04, 0.11);
      const ox = Math.cos(angle) * dist;
      const oz = Math.sin(angle) * dist;
      const h = rng.range(0.48, 0.66);
      const leanX = ox * 1.8 + rng.range(-0.06, 0.06);
      const leanZ = oz * 1.8 + rng.range(-0.06, 0.06);

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(ox, 0, oz),
        new THREE.Vector3((ox + leanX) * 0.5, h * 0.55, (oz + leanZ) * 0.5),
        new THREE.Vector3(leanX, h, leanZ)
      ]);

      parts.push(BotanicalGeometryBuilder.createTaperedStem(curve, 0.012, 0.006, 5, 4, maxH));

      const tip = curve.getPointAt(1.0);
      dummy.position.copy(tip);
      dummy.rotation.set(rng.range(-0.32, 0.32), rng.range(0, Math.PI * 2), rng.range(-0.32, 0.32));
      dummy.updateMatrix();

      const scale = rng.range(0.62, 0.80);
      const floretGeo = BotanicalGeometryBuilder.create3DFloret(scale, 1.3, dummy.matrix, maxH);
      const partAttr = floretGeo.attributes.aPartId;
      for (let i = 0; i < partAttr.count; i++) {
        if (Math.abs(partAttr.getX(i) - 2.0) < 0.1) {
          partAttr.setX(i, 4.0); // Tag as Pearl-White Wildflower Corolla
        }
      }
      parts.push(floretGeo);
    }

    return BotanicalGeometryBuilder.mergeSubGeometries(parts);
  }

  build3DGrassTuftVariant(seed) {
    const rng = new SeededRandom(seed);
    const parts = [];
    const bladeCount = 6;
    const maxH = 0.88;

    for (let b = 0; b < bladeCount; b++) {
      const yaw = (b / bladeCount) * Math.PI * 2 + rng.range(-0.32, 0.32);
      const dist = rng.range(0.02, 0.08);
      const origin = new THREE.Vector3(Math.cos(yaw) * dist, 0, Math.sin(yaw) * dist);
      const length = rng.range(0.62, 0.95);
      const width = rng.range(0.09, 0.135);
      const archPitch = rng.range(0.92, 1.30);
      const droop = rng.range(0.28, 0.48);

      parts.push(
        BotanicalGeometryBuilder.create3DLanceolateLeaf(
          length, width, archPitch, yaw, droop, origin, maxH
        )
      );
    }

    return BotanicalGeometryBuilder.mergeSubGeometries(parts);
  }
}

// ---------------------------------------------------------------------------
// Lazy singleton: the source built every asset once at startup; we build on
// first use so importing this module has no geometry cost.
// ---------------------------------------------------------------------------
let _library = null;
function library() {
  if (_library === null) _library = new BotanicalAssetLibrary();
  return _library;
}

/** A's 4 hero flower stalk variants (0..3), seeds [101, 227, 389, 541]. */
export function buildFlowerStalkGeometry(variant = 0) {
  return library().heroFlowerVariants[variant % REFA_STALK_SEEDS.length];
}

/** A's 3 star-wildflower variants (0..2), seeds [701, 823, 947]. */
export function buildWildflowerGeometry(variant = 0) {
  return library().wildflowerVariants[variant % REFA_WILDFLOWER_SEEDS.length];
}

/** A's 3 grass tuft variants (0..2), seeds [1103, 1237, 1381]. */
export function buildGrassTuftGeometry(variant = 0) {
  return library().grassTuftVariants[variant % REFA_GRASS_SEEDS.length];
}

// ============================================================================
// MODULE 4: RICH MID-EVENING / TWILIGHT ATMOSPHERE & 3D BOTANICAL SHADERS
// (source A lines 819-1135, verbatim)
// ============================================================================
export const REFA_PRESETS = {
  twilight: {
    skyBg: new THREE.Color('#071824'),
    skyAmbient: new THREE.Color('#244d70'),
    groundAmbient: new THREE.Color('#07221d'),
    sunColor: new THREE.Color('#ffe6bd'),
    sunDir: new THREE.Vector3(-0.55, 0.52, -0.65).normalize(),
    grassShadow: new THREE.Color('#0b3830'),
    grassLit: new THREE.Color('#42a333'),
    grassTip: new THREE.Color('#9df03a'),
    petalShadow: new THREE.Color('#3b2d85'),
    petalLit: new THREE.Color('#b86bf2'),
    petalRim: new THREE.Color('#ff9ce9')
  },
  dusk: {
    skyBg: new THREE.Color('#121626'),
    skyAmbient: new THREE.Color('#3e3e6b'),
    groundAmbient: new THREE.Color('#0d211b'),
    sunColor: new THREE.Color('#ffc488'),
    sunDir: new THREE.Vector3(-0.65, 0.42, -0.63).normalize(),
    grassShadow: new THREE.Color('#10382c'),
    grassLit: new THREE.Color('#57ab2b'),
    grassTip: new THREE.Color('#c2f238'),
    petalShadow: new THREE.Color('#4a2b7c'),
    petalLit: new THREE.Color('#cf6af5'),
    petalRim: new THREE.Color('#ffb0e4')
  },
  moonlight: {
    skyBg: new THREE.Color('#040e1a'),
    skyAmbient: new THREE.Color('#18365c'),
    groundAmbient: new THREE.Color('#05171a'),
    sunColor: new THREE.Color('#b0deff'),
    sunDir: new THREE.Vector3(-0.45, 0.62, -0.64).normalize(),
    grassShadow: new THREE.Color('#072629'),
    grassLit: new THREE.Color('#227859'),
    grassTip: new THREE.Color('#60d48e'),
    petalShadow: new THREE.Color('#282268'),
    petalLit: new THREE.Color('#7f58e8'),
    petalRim: new THREE.Color('#c69cff')
  }
};

// Authored name kept for readability against the source.
const MOOD_PRESETS = REFA_PRESETS;

export const REFA_UNIFORMS = {
  uTime: { value: 0 },
  uWindStrength: { value: 0.75 },
  uTranslucency: { value: 0.95 },
  uPlayerPos: { value: new THREE.Vector3(0, 0, 2) },
  uInspectorMode: { value: 0.0 },
  uSkyBg: { value: MOOD_PRESETS.twilight.skyBg.clone() },
  uSkyAmbient: { value: MOOD_PRESETS.twilight.skyAmbient.clone() },
  uGroundAmbient: { value: MOOD_PRESETS.twilight.groundAmbient.clone() },
  uSunColor: { value: MOOD_PRESETS.twilight.sunColor.clone() },
  uSunDir: { value: MOOD_PRESETS.twilight.sunDir.clone() },
  uGrassShadow: { value: MOOD_PRESETS.twilight.grassShadow.clone() },
  uGrassLit: { value: MOOD_PRESETS.twilight.grassLit.clone() },
  uGrassTip: { value: MOOD_PRESETS.twilight.grassTip.clone() },
  uPetalShadow: { value: MOOD_PRESETS.twilight.petalShadow.clone() },
  uPetalLit: { value: MOOD_PRESETS.twilight.petalLit.clone() },
  uPetalRim: { value: MOOD_PRESETS.twilight.petalRim.clone() }
};

const sharedUniforms = REFA_UNIFORMS;

const sharedGLSL = /* glsl */ `
  uniform float uTime;
  uniform float uWindStrength;
  uniform float uTranslucency;
  uniform vec3 uPlayerPos;
  uniform float uInspectorMode;

  uniform vec3 uSkyBg;
  uniform vec3 uSkyAmbient;
  uniform vec3 uGroundAmbient;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;

  uniform vec3 uGrassShadow;
  uniform vec3 uGrassLit;
  uniform vec3 uGrassTip;
  uniform vec3 uPetalShadow;
  uniform vec3 uPetalLit;
  uniform vec3 uPetalRim;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Diagonal dappled evening light bands filtering through canopy leaves
  float getEveningCanopyLight(vec2 worldXZ) {
    if (uInspectorMode > 0.5) return 0.88;

    mat2 rot = mat2(0.82, -0.57, 0.57, 0.82);
    vec2 p = rot * worldXZ;
    float drift = uTime * 0.10;

    float bands = sin(p.y * 0.44 + valueNoise(p * 0.18 + drift) * 2.6) * 0.5 + 0.5;
    float dapple = valueNoise(p * 0.52 - vec2(drift, drift * 0.5));
    float fine = valueNoise(p * 1.25 + vec2(drift * 0.6, -drift * 0.7));

    float mask = bands * 0.56 + dapple * 0.31 + fine * 0.13;
    float topVignette = smoothstep(-20.0, -5.0, worldXZ.y);
    mask *= mix(0.32, 1.05, topVignette);

    return smoothstep(0.35, 0.62, mask);
  }
`;

function createBotanicalMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: sharedUniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${sharedGLSL}
      attribute float aPartId;
      attribute float aSwayWeight;
      attribute vec2 aPetalCoord;

      varying float vPartId;
      varying float vSwayWeight;
      varying vec2 vPetalCoord;
      varying float vInstanceHue;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vPartId = aPartId;
        vSwayWeight = aSwayWeight;
        vPetalCoord = aPetalCoord;

        vec3 pos = position;
        vec3 norm = normal;

        #ifdef USE_INSTANCING
          vec4 instOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec2 worldXZ = instOrigin.xz;
          vInstanceHue = hash21(worldXZ * 1.73);
        #else
          vec2 worldXZ = vec2(0.5, 0.5);
          vInstanceHue = 0.35;
        #endif

        // 1. Natural Whole-Stalk & Leaf Wind Sway
        float windPhase = worldXZ.x * 0.42 + worldXZ.y * 0.35 + uTime * 1.85;
        float primaryWave = sin(windPhase) + cos(windPhase * 0.65) * 0.5;
        float petalFlutter = (aPartId > 1.5)
          ? sin(uTime * 4.8 + pos.x * 16.0 + pos.z * 16.0) * 0.007 * aPetalCoord.y
          : 0.0;

        float bend = aSwayWeight * uWindStrength * 0.13;
        pos.x += primaryWave * bend + petalFlutter;
        pos.z += primaryWave * bend * 0.7 + petalFlutter;

        // 2. Interactive Player / Cursor Physical Parting
        if (uInspectorMode < 0.5) {
          vec2 toPlant = worldXZ - uPlayerPos.xz;
          float dist = length(toPlant);
          float radius = 2.5;
          if (dist < radius && dist > 0.001) {
            float push = pow(1.0 - dist / radius, 1.75) * 0.95 * aSwayWeight;
            vec2 dir = normalize(toPlant);
            pos.x += dir.x * push;
            pos.z += dir.y * push;
            pos.y -= push * 0.22;
          }
        }

        #ifdef USE_INSTANCING
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(pos, 1.0);
          mat3 normalMat = mat3(modelMatrix * instanceMatrix);
        #else
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          mat3 normalMat = mat3(modelMatrix);
        #endif

        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize(normalMat * norm);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      ${sharedGLSL}
      varying float vPartId;
      varying float vSwayWeight;
      varying vec2 vPetalCoord;
      varying float vInstanceHue;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec3 N = normalize(vWorldNormal);
        if (!gl_FrontFacing) N = -N;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);

        float canopySun = getEveningCanopyLight(vWorldPos.xz);

        // Stylized upward-blended normal for grass tufts, true 3D surface normal for flower petals
        vec3 shadingN = (vPartId < 1.5)
          ? normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.45))
          : N;

        float NdotL = dot(shadingN, L);
        float wrappedDiff = clamp((NdotL + 0.48) / 1.48, 0.0, 1.0);
        float hemiFactor = shadingN.y * 0.5 + 0.5;
        vec3 ambientIrradiance = mix(uGroundAmbient, uSkyAmbient, hemiFactor);

        // Backlit subsurface scattering & 3D edge fresnel
        float backLight = pow(clamp(dot(V, -L + shadingN * 0.35), 0.0, 1.0), 2.6);
        float fresnelRim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.8);

        vec3 baseShadow = vec3(0.0);
        vec3 baseLit = vec3(0.0);
        float sssWeight = 0.0;
        float specStrength = 0.08;

        if (vPartId < 0.5) {
          // PART 0.0: 3D Tapered Stem & Branching Pedicels
          float hGrad = clamp(vSwayWeight, 0.0, 1.0);
          baseShadow = mix(uGrassShadow * 0.85, uGrassShadow * 1.35, hGrad);
          baseLit = mix(uGrassLit * 0.65, uGrassLit * 0.98, hGrad);
          sssWeight = 0.18 * hGrad;
        }
        else if (vPartId < 1.5) {
          // PART 1.0: 3D V-Folded Lanceolate Leaves, Grass Blades & 5-Pointed Calyx Sepals
          float edgeDist = clamp(vPetalCoord.x, 0.0, 1.0);
          float bladeProgress = clamp(vPetalCoord.y, 0.0, 1.0);
          float midribShade = mix(0.84, 1.08, smoothstep(0.0, 0.45, edgeDist));

          baseShadow = mix(uGrassShadow, uGrassShadow * 1.7 + vec3(0.0, 0.09, 0.07), bladeProgress) * midribShade;
          vec3 midGreen = mix(uGrassLit, uGrassTip, smoothstep(0.22, 0.95, bladeProgress));
          baseLit = midGreen * midribShade;

          sssWeight = 0.58 * bladeProgress;
          specStrength = 0.15;
        }
        else if (vPartId < 2.5) {
          // PART 2.0: 3D Fused Corolla Bell Tube & 5 Curled Petals
          float uNorm = vPetalCoord.x; // [-1 .. +1] across petal width
          float vNorm = vPetalCoord.y; // [0 = calyx base .. 0.35 = throat .. 1.0 = petal tip]

          // Delicate botanical petal veins radiating from the bell throat
          float veinWave = sin(uNorm * 18.0) * 0.5 + 0.5;
          float veinMask = smoothstep(0.15, 0.78, vNorm) * (1.0 - smoothstep(0.75, 1.0, vNorm));
          float veinDetail = mix(1.0, 0.87, veinWave * veinMask * 0.45);

          float throatMask = smoothstep(0.12, 0.52, vNorm);
          float edgeFade = smoothstep(0.2, 0.95, abs(uNorm));

          vec3 hueShiftShadow = mix(uPetalShadow, uPetalShadow * vec3(1.28, 0.88, 1.08), vInstanceHue);
          vec3 hueShiftLit = mix(uPetalLit, uPetalRim, vInstanceHue * 0.55 + edgeFade * 0.38);

          vec3 deepThroat = hueShiftShadow * 0.58;
          baseShadow = mix(deepThroat, hueShiftShadow * 1.28, throatMask) * veinDetail;
          baseLit = mix(deepThroat * 1.35, hueShiftLit, throatMask) * veinDetail;

          // Luminous inner throat ring where tube flares into the 5 lobes
          float nectarGuide = exp(-pow((vNorm - 0.36) * 7.0, 2.0)) * (1.0 - abs(uNorm) * 0.65);
          baseLit += vec3(0.26, 0.18, 0.35) * nectarGuide;

          sssWeight = 0.95 * smoothstep(0.18, 1.0, vNorm);
          specStrength = 0.24;
        }
        else if (vPartId < 3.5) {
          // PART 3.0: Inner Golden Stamens / Pollen Anthers
          baseShadow = vec3(0.55, 0.36, 0.06);
          baseLit = vec3(1.15, 0.86, 0.22);
          sssWeight = 0.45;
        }
        else {
          // PART 4.0: 3D Star-Wildflower Pearl-White Ray Petals
          float vNorm = vPetalCoord.y;
          float throatMask = smoothstep(0.15, 0.48, vNorm);
          baseShadow = mix(vec3(0.42, 0.36, 0.14), vec3(0.28, 0.50, 0.62), throatMask);
          baseLit = mix(vec3(1.02, 0.84, 0.24), vec3(1.02, 1.00, 0.92), throatMask);
          sssWeight = 0.85 * throatMask;
          specStrength = 0.18;
        }

        float directLightFactor = canopySun * (0.36 + 0.64 * wrappedDiff);
        vec3 color = mix(baseShadow + ambientIrradiance * 0.42, baseLit * uSunColor, directLightFactor);

        vec3 sssColor = (vPartId > 1.5 && vPartId < 2.5) ? uPetalRim : uGrassTip;
        float translucencyTerm = (backLight * 0.65 + fresnelRim * 0.48) * (0.25 + 0.75 * canopySun) * sssWeight * uTranslucency;
        color += sssColor * translucencyTerm * 0.48;

        vec3 H = normalize(L + V);
        float spec = pow(clamp(dot(shadingN, H), 0.0, 1.0), 22.0) * specStrength * canopySun;
        color += uSunColor * spec;

        if (uInspectorMode < 0.5) {
          float pDist = length(vWorldPos - uPlayerPos);
          float lantern = smoothstep(2.8, 0.2, pDist) * clamp(vSwayWeight + 0.2, 0.0, 1.0);
          color += vec3(0.35, 0.55, 0.32) * lantern * 0.38;

          float camDist = length(vWorldPos.xz);
          float fogFactor = smoothstep(16.0, 24.5, camDist);
          color = mix(color, uSkyBg, fogFactor);
        }

        // Soft filmic highlight compression so bright petals & tips never clip harshly
        color = color / (1.0 + color * 0.14);

        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
}

// ---------------------------------------------------------------------------
// Mood application — copied from A's `.mood-btn` handler (source 1489-1499).
// The uniforms object is shared, exactly as authored (the terrain shader used
// the same block in the source). Call applyRefaPreset() to change mood on every
// material created from this kit at once.
// ---------------------------------------------------------------------------
const PRESET_COLOR_KEYS = [
  'skyBg', 'skyAmbient', 'groundAmbient', 'sunColor',
  'grassShadow', 'grassLit', 'grassTip',
  'petalShadow', 'petalLit', 'petalRim'
];

let _currentPreset = 'twilight';

export function applyRefaPreset(preset = 'twilight', overrides = null) {
  const p = typeof preset === 'string' ? REFA_PRESETS[preset] : preset;
  if (!p) throw new Error(`[refa-kit] unknown preset: ${preset}`);

  sharedUniforms.uSkyBg.value.copy(p.skyBg);
  sharedUniforms.uSkyAmbient.value.copy(p.skyAmbient);
  sharedUniforms.uGroundAmbient.value.copy(p.groundAmbient);
  sharedUniforms.uSunColor.value.copy(p.sunColor);
  sharedUniforms.uSunDir.value.copy(p.sunDir);
  sharedUniforms.uGrassShadow.value.copy(p.grassShadow);
  sharedUniforms.uGrassLit.value.copy(p.grassLit);
  sharedUniforms.uGrassTip.value.copy(p.grassTip);
  sharedUniforms.uPetalShadow.value.copy(p.petalShadow);
  sharedUniforms.uPetalLit.value.copy(p.petalLit);
  sharedUniforms.uPetalRim.value.copy(p.petalRim);

  if (overrides) {
    for (const key of PRESET_COLOR_KEYS) {
      const v = overrides[key];
      if (v == null) continue;
      const u = sharedUniforms['u' + key[0].toUpperCase() + key.slice(1)];
      if (!u) continue;
      if (v.isColor) u.value.copy(v);
      else u.value.set(v);
    }
    if (overrides.sunDir != null) {
      const d = overrides.sunDir;
      if (d.isVector3) sharedUniforms.uSunDir.value.copy(d);
      else if (Array.isArray(d)) sharedUniforms.uSunDir.value.set(d[0], d[1], d[2]).normalize();
    }
  }

  if (typeof preset === 'string') _currentPreset = preset;
  return sharedUniforms;
}

export function getRefaPresetName() {
  return _currentPreset;
}

/**
 * A's botanical ShaderMaterial, unchanged, with the mood preset applied.
 *
 * @param {'twilight'|'dusk'|'moonlight'|object} preset  mood preset name (or a
 *        custom preset object with the same keys as REFA_PRESETS entries)
 * @param {object|null} overrides  optional palette overrides, e.g.
 *        { petalLit: '#c07bff', sunDir: [-0.5, 0.5, -0.7] }
 * @returns {THREE.ShaderMaterial}
 */
export function createRefaMaterial(preset = 'twilight', overrides = null) {
  const material = createBotanicalMaterial();
  applyRefaPreset(preset, overrides);
  return material;
}
