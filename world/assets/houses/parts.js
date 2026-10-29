import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addOutline, makeOutlineMaterial } from './materials.js';

export const TILE = {
  roof: [2.4, 1.6],
  stucco: 2.5,
  stone: 2.4,
  wood: 1.4,
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

export function scaleBoxUV(geo, w, h, d, tile = 1) {
  const uv = geo.attributes.uv;
  const faces = [
    [d / tile, h / tile],
    [d / tile, h / tile],
    [w / tile, d / tile],
    [w / tile, d / tile],
    [w / tile, h / tile],
    [w / tile, h / tile],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faces[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export function box(w, h, d, material, { tile = 1, outline = 0.016, name = '' } = {}) {
  const geo = scaleBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  mesh.userData.outlineWeight = outline && !material?.userData?.noOutline ? outline : 0;
  return mesh;
}

export function cyl(
  radius,
  height,
  material,
  { radiusTop = radius, segments = 8, outline = 0.014, axis = 'y', name = '' } = {},
) {
  const geo = new THREE.CylinderGeometry(radiusTop, radius, height, segments);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  if (axis === 'z') geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  mesh.userData.outlineWeight = outline && !material?.userData?.noOutline ? outline : 0;
  return mesh;
}

export function sphere(radius, material, { sx = 1, sy = 1, sz = 1, detail = 0, outline = 0 } = {}) {
  const geo = new THREE.OctahedronGeometry(radius, detail);
  if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.outlineWeight = outline && !material?.userData?.noOutline ? outline : 0;
  return mesh;
}

export function quad(a, b, c, d, material, { uvs, outline = 0 } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c, ...d]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  const uv = uvs ?? [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv.flat()), 2));
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.outlineWeight = outline && !material?.userData?.noOutline ? outline : 0;
  return mesh;
}

export function beamBetween(a, b, width, depth, material, { tile = TILE.wood, outline = 0 } = {}) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  const mesh = box(width, length, depth, material, { tile, outline });
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

export function makeWall({
  length,
  height,
  gableRise = 0,
  thickness = 0.38,
  holes = [],
  material,
  tile = TILE.stucco,
  outline = 0.022,
}) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.lineTo(length / 2, 0);
  shape.lineTo(length / 2, height);
  if (gableRise > 0) shape.lineTo(0, height + gableRise);
  shape.lineTo(-length / 2, height);
  shape.closePath();

  for (const hole of holes) {
    const { x, y, w, h, arch = 0 } = hole;
    const path = new THREE.Path();
    if (arch > 0) {
      const r = arch;
      const rectH = h - r;
      path.moveTo(x - r, y);
      path.lineTo(x + r, y);
      path.lineTo(x + r, y + rectH);
      path.absarc(x, y + rectH, r, 0, Math.PI, false);
      path.lineTo(x - r, y);
    } else {
      path.moveTo(x - w / 2, y);
      path.lineTo(x + w / 2, y);
      path.lineTo(x + w / 2, y + h);
      path.lineTo(x - w / 2, y + h);
      path.lineTo(x - w / 2, y);
    }
    shape.holes.push(path);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 6,
  });
  geo.translate(0, 0, -thickness);
  scaleUV(geo, 1 / tile, 1 / tile);

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.outlineWeight = outline;
  return mesh;
}

export function gableWall({ width, rise, thickness = 0.3, material, tile = TILE.stucco, outline = 0.022 }) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness);
  scaleUV(geo, 1 / tile, 1 / tile);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.outlineWeight = outline;
  return mesh;
}

/* --------------------------------------------------------------- roof tiles */

let TILE_GEOMETRY = null;

/**
 * 4-triangle 3D clay roof tile (top sloped face + thick front eave lip face).
 */
export function getTileGeometry() {
  if (TILE_GEOMETRY) return TILE_GEOMETRY;
  const hw = 0.24; // 0.48m wide
  const hl = 0.22; // 0.44m long
  const tTop = 0.012;
  const tBot = 0.054;

  const p0 = [-hw, -hl, 0];
  const p1 = [hw, -hl, 0];
  const p2 = [hw, -hl, tBot];
  const p3 = [-hw, -hl, tBot];
  const p4 = [-hw, hl, tTop];
  const p5 = [hw, hl, tTop];

  const positions = new Float32Array([
    // Front eave lip (2 tris)
    ...p0, ...p1, ...p2,
    ...p0, ...p2, ...p3,
    // Top sloped face (2 tris)
    ...p3, ...p2, ...p5,
    ...p3, ...p5, ...p4,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  TILE_GEOMETRY = geometry;
  return TILE_GEOMETRY;
}

const TILE_VARIANTS = 6;
const tileEntries = [];

/**
 * Lay real 3D clay tiles over one roof plane.
 */
export function tileRoof({ a, b, d, width, length, seed = 1, skipFn = null }) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const D = new THREE.Vector3(...d);
  const u = new THREE.Vector3().subVectors(B, A).normalize();
  const v = new THREE.Vector3().subVectors(D, A).normalize();
  const n = new THREE.Vector3().crossVectors(u, v).normalize();
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));

  const tileW = 0.48;
  const tileL = 0.44;
  const step = 0.39;
  const cols = Math.ceil(width / tileW) + 1;
  const rows = Math.ceil(length / step) + 1;

  const rng = mulberry32(seed);
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * tileW * 0.5;
    for (let c = 0; c < cols; c++) {
      const cu = c * tileW + tileW / 2 + offset;
      if (cu > width + 0.02) continue;
      const cv = r * step + tileL / 2;
      if (cv > length + 0.02) continue;
      pos.copy(A).addScaledVector(u, cu).addScaledVector(v, cv).addScaledVector(n, 0.003);
      const colorIndex = Math.floor(rng() * TILE_VARIANTS);
      if (skipFn && skipFn(pos, cu, cv)) continue;
      matrix.compose(pos, quat, one);
      tileEntries.push({ matrix: matrix.clone(), colorIndex });
    }
  }
}

export function finalizeRoofTiles(add, materials) {
  if (!tileEntries.length) return null;
  const geometry = getTileGeometry();
  const count = tileEntries.length;
  const mesh = new THREE.InstancedMesh(geometry, materials.roofTileInstanced, count);
  const palette = materials.roofTileColors;
  for (let i = 0; i < count; i++) {
    const { matrix, colorIndex } = tileEntries[i];
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, palette[colorIndex % palette.length]);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.noMerge = true;
  mesh.userData.isRoofTiles = true;
  mesh.name = 'roof-tiles';
  add(mesh);
  tileEntries.length = 0;
  return mesh;
}

/* ------------------------------------------------------------------ windows */

function stoneJambs(group, { w, h, stone, count = 2 }) {
  for (const sx of [-1, 1]) {
    const bh = h / count;
    for (let i = 0; i < count; i++) {
      const block = box(0.22, bh - 0.016, 0.14, stone, { tile: TILE.stone, outline: 0 });
      block.position.set(sx * (w / 2 + 0.11), bh * (i + 0.5), 0.02);
      group.add(block);
    }
  }
}

function stoneArch(group, { w, h, stone }) {
  const count = 5;
  const radius = w / 2 + 0.14;
  const centerY = h - 0.5;
  for (let i = 0; i < count; i++) {
    const angle = THREE.MathUtils.lerp(
      THREE.MathUtils.degToRad(150),
      THREE.MathUtils.degToRad(30),
      i / (count - 1),
    );
    const block = box(0.22, 0.2, 0.13, stone, { tile: TILE.stone, outline: 0.008 });
    block.position.set(Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 0.018);
    block.rotation.z = angle - Math.PI / 2;
    group.add(block);
  }
}

function windowShutters(group, { w, h, materials, shutterWidth = 0.32, hasJambs = true }) {
  const shH = h - 0.04;
  const jambOffset = hasJambs ? 0.22 : 0.04;
  for (const sx of [-1, 1]) {
    const cx = sx * (w / 2 + jambOffset + shutterWidth / 2 + 0.015);
    const panel = box(shutterWidth, shH, 0.06, materials.shutterBlue, {
      tile: TILE.wood,
      outline: 0.01,
    });
    panel.position.set(cx, h / 2, 0.055);
    group.add(panel);

    for (const ry of [0.22, 0.78]) {
      const batten = box(shutterWidth - 0.04, 0.07, 0.025, materials.shutterBlueDark, {
        tile: TILE.wood,
        outline: 0,
      });
      batten.position.set(cx, h * ry, 0.09);
      group.add(batten);
    }
  }
}

function windowFlowerBox(group, { w, materials, seed = 1 }) {
  const boxW = w + 0.28;
  const boxH = 0.2;
  const boxD = 0.24;
  const yCenter = -0.19;
  const zCenter = 0.18;

  const trough = box(boxW, boxH, boxD, materials.timberDark, { tile: TILE.wood, outline: 0.01 });
  trough.position.set(0, yCenter, zCenter);
  group.add(trough);

  const rim = box(boxW + 0.05, 0.04, boxD + 0.04, materials.timber, { tile: TILE.wood, outline: 0 });
  rim.position.set(0, yCenter + boxH / 2 + 0.01, zCenter);
  group.add(rim);

  const foliageBed = box(boxW - 0.06, 0.1, boxD - 0.04, materials.leafMid, { outline: 0 });
  foliageBed.position.set(0, yCenter + boxH / 2 + 0.05, zCenter);
  group.add(foliageBed);

  const rng = mulberry32(seed);
  const flowerMats = [
    materials.flowerPink,
    materials.flowerYellow,
    materials.flowerWhite,
    materials.flowerBlue,
    materials.flowerPurple,
  ];

  const count = 4;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const fx = THREE.MathUtils.lerp(-boxW * 0.36, boxW * 0.36, t);
    const fz = zCenter + (rng() - 0.5) * 0.05;
    const flMat = flowerMats[(i + Math.floor(rng() * 3)) % flowerMats.length];
    const bloom = sphere(0.065, flMat, { sx: 1.15, sy: 0.85, sz: 1.15, outline: 0 });
    bloom.position.set(fx, yCenter + boxH / 2 + 0.12, fz + 0.02);
    group.add(bloom);
  }
}

function windowSill(group, { w, materials, hasJambs = true }) {
  const extra = hasJambs ? 0.46 : 0.22;
  const sill = box(w + extra, 0.1, 0.3, materials.timber, { tile: TILE.wood, outline: 0.01 });
  sill.position.set(0, -0.05, 0.05);
  group.add(sill);
}

/**
 * Multi-pane leaded blue window unit with optional shutters and planted flower box.
 */
export function windowUnit(
  materials,
  {
    w = 1.1,
    h = 1.36,
    cols = 2,
    rows = 3,
    sill = true,
    jambs = true,
    arch = true,
    shutters = true,
    flowerBox = true,
    shutterWidth = 0.32,
    seed = 101,
    frame = materials.timber,
    stone = materials.stoneTrim,
    glass = materials.glass,
  } = {},
) {
  const group = new THREE.Group();

  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.04), glass);
  pane.position.set(0, h / 2, -0.2);
  group.add(pane);

  const bar = (bw, bh, x, y) => {
    const m = box(bw, bh, 0.09, frame, { tile: TILE.wood, outline: 0 });
    m.position.set(x, y, -0.155);
    group.add(m);
  };
  const f = 0.08;
  bar(w, f, 0, f / 2);
  bar(w, f, 0, h - f / 2);
  bar(f, h, -w / 2 + f / 2, h / 2);
  bar(f, h, w / 2 - f / 2, h / 2);
  for (let c = 1; c < cols; c++) bar(0.052, h, -w / 2 + (w / cols) * c, h / 2);
  for (let r = 1; r < rows; r++) bar(w, 0.052, 0, (h / rows) * r);

  if (jambs) stoneJambs(group, { w, h, stone });
  if (arch) stoneArch(group, { w, h, stone });
  if (sill) windowSill(group, { w, materials, hasJambs: jambs });
  if (shutters) windowShutters(group, { w, h, materials, shutterWidth, hasJambs: jambs });
  if (flowerBox) windowFlowerBox(group, { w, materials, seed });

  return group;
}

/* --------------------------------------------------------------------- door */

export function doorUnit(materials, { w = 1.44, h = 2.38, arched = true } = {}) {
  const group = new THREE.Group();
  const r = arched ? w / 2 : 0;
  const rectH = h - r;

  for (const sx of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const bh = rectH / 2;
      const block = box(0.26, bh - 0.016, 0.32, materials.stoneTrim, { tile: TILE.stone, outline: 0.012 });
      block.position.set(sx * (w / 2 + 0.13), bh * (i + 0.5), 0.04);
      group.add(block);
    }
  }

  if (arched) {
    const count = 7;
    const radius = w / 2 + 0.14;
    for (let i = 0; i < count; i++) {
      const angle = THREE.MathUtils.lerp(Math.PI * 0.95, Math.PI * 0.05, i / (count - 1));
      const block = box(0.26, 0.24, 0.3, materials.stoneTrim, { tile: TILE.stone, outline: 0.01 });
      block.position.set(Math.cos(angle) * radius, rectH + Math.sin(angle) * radius, 0.03);
      block.rotation.z = angle - Math.PI / 2;
      group.add(block);
    }
  }

  const threshold = box(w + 0.44, 0.14, 0.5, materials.stoneTrim, { tile: TILE.stone, outline: 0.012 });
  threshold.position.set(0, -0.07, 0.18);
  group.add(threshold);

  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, rectH);
  if (arched) shape.absarc(0, rectH, r, 0, Math.PI, false);
  else shape.lineTo(-w / 2, rectH);
  shape.lineTo(-w / 2, 0);

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 6 });
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
  }
  const leaf = new THREE.Mesh(geo, materials.door);
  leaf.position.z = -0.16;
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  leaf.userData.outlineWeight = 0.014;
  group.add(leaf);

  for (const y of [rectH * 0.84, 0.36]) {
    const band = box(w - 0.16, 0.08, 0.035, materials.iron, { tile: 1, outline: 0 });
    band.position.set(0, y, -0.045);
    group.add(band);
  }

  const handle = box(0.13, 0.13, 0.04, materials.iron, { outline: 0 });
  handle.position.set(-0.26, 1.28, -0.035);
  group.add(handle);

  const plate = box(0.11, 0.19, 0.025, materials.iron, { outline: 0 });
  plate.position.set(0.28, 1.12, -0.048);
  group.add(plate);

  return group;
}

/**
 * Builds 2.3m-wide front stone steps centered at `lx = 0, lz = +d * 0.5`
 * extending out to `lz = +d * 0.5 + 1.35` and down to `y = -subDepth`.
 */
export function buildFrontSteps(
  add,
  materials,
  { doorX = 0, wallZ = 3.2, stepW = 2.24, subDepth = 1.5 } = {},
) {
  const top1 = 0.36;
  const h1 = top1 + subDepth;
  const d1 = 0.72;
  const z1 = wallZ + d1 / 2;
  const step1 = box(stepW - 0.16, h1, d1, materials.stone, { tile: TILE.stone, outline: 0.014 });
  step1.position.set(doorX, top1 - h1 / 2, z1);
  add(step1);

  const cap1 = box(stepW - 0.08, 0.06, d1 + 0.04, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  cap1.position.set(doorX, top1 + 0.01, z1);
  add(cap1);

  const top2 = 0.18;
  const h2 = top2 + subDepth;
  const d2 = 0.67;
  const z2 = wallZ + 0.68 + d2 / 2;
  const step2 = box(stepW, h2, d2, materials.stone, { tile: TILE.stone, outline: 0.014 });
  step2.position.set(doorX, top2 - h2 / 2, z2);
  add(step2);

  const cap2 = box(stepW + 0.06, 0.06, d2 + 0.04, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  cap2.position.set(doorX, top2 + 0.01, z2);
  add(cap2);

  const outerThresholdZ = Number((wallZ + 1.35).toFixed(3));
  return { x: doorX, z: outerThresholdZ, stepWidth: Number((stepW + 0.06).toFixed(2)) };
}

/* ------------------------------------------------------------------- stone */

export function quoinCorner(materials, { x, z, ox, oz, from, to, course = 0.62 }) {
  const group = new THREE.Group();
  const count = Math.floor((to - from) / course);
  for (let i = 0; i < count; i++) {
    const y = from + course * (i + 0.5);
    const even = i % 2 === 0;
    const block = even
      ? box(0.62, course - 0.03, 0.34, materials.stone, { tile: TILE.stone, outline: 0 })
      : box(0.34, course - 0.03, 0.62, materials.stone, { tile: TILE.stone, outline: 0 });
    block.position.set(
      x - ox * (even ? 0.31 : 0.15),
      y,
      z - oz * (even ? 0.15 : 0.31),
    );
    group.add(block);
  }
  return group;
}

export function quoinPilaster(materials, { x, from, to, z, side = 1, course = 0.62 }) {
  const group = new THREE.Group();
  const count = Math.floor((to - from) / course);
  for (let i = 0; i < count; i++) {
    const y = from + course * (i + 0.5);
    const even = i % 2 === 0;
    const block = box(even ? 0.54 : 0.36, course - 0.03, even ? 0.3 : 0.38, materials.stone, {
      tile: TILE.stone,
      outline: 0,
    });
    block.position.set(x - side * (even ? 0.27 : 0.18), y, z - 0.13);
    group.add(block);
  }
  return group;
}

export function buildDeepPlinth(add, materials, { w, d, plinthH = 0.55, subDepth = 1.5, eaveY = 4.5 }) {
  const totalH = plinthH + subDepth;
  const base = box(w + 0.36, totalH, d + 0.36, materials.stone, { tile: TILE.stone, outline: 0.02 });
  base.position.set(0, plinthH - totalH / 2, 0);
  add(base);

  const cap = box(w + 0.5, 0.08, d + 0.5, materials.stoneTrim, { tile: TILE.stone, outline: 0.014 });
  cap.position.set(0, plinthH + 0.04, 0);
  add(cap);

  const corners = [
    { x: -w / 2, z: d / 2, ox: -1, oz: 1 },
    { x: w / 2, z: d / 2, ox: 1, oz: 1 },
    { x: -w / 2, z: -d / 2, ox: -1, oz: -1 },
    { x: w / 2, z: -d / 2, ox: 1, oz: -1 },
  ];
  for (const corner of corners) {
    add(quoinCorner(materials, { ...corner, from: plinthH, to: eaveY }));
  }
}

/* --------------------------------------------------- shared roof & dormer */

export function buildMainGableRoof(
  add,
  materials,
  {
    w,
    d,
    eaveY,
    ridgeY,
    overhangX = 0.48,
    overhangZ = 0.55,
    seed = 10,
    skipFront = null,
    skipBack = null,
  },
) {
  const halfX = w / 2 + overhangX;
  const eaveZ = d / 2 + overhangZ;
  const rise = ridgeY - eaveY;
  const slopeLen = Math.hypot(rise, eaveZ);
  const angle = Math.atan2(rise, eaveZ);

  add(
    quad(
      [-halfX, eaveY, eaveZ],
      [halfX, eaveY, eaveZ],
      [halfX, ridgeY, 0],
      [-halfX, ridgeY, 0],
      materials.roofBase,
      { outline: 0.02 },
    ),
  );
  add(
    quad(
      [-halfX, eaveY, -eaveZ],
      [-halfX, ridgeY, 0],
      [halfX, ridgeY, 0],
      [halfX, eaveY, -eaveZ],
      materials.roofBase,
      { outline: 0.02 },
    ),
  );

  tileRoof({
    a: [-halfX, eaveY, eaveZ],
    b: [halfX, eaveY, eaveZ],
    d: [-halfX, ridgeY, 0],
    width: halfX * 2,
    length: slopeLen,
    seed: seed + 1,
    skipFn: skipFront,
  });
  tileRoof({
    a: [halfX, eaveY, -eaveZ],
    b: [-halfX, eaveY, -eaveZ],
    d: [halfX, ridgeY, 0],
    width: halfX * 2,
    length: slopeLen,
    seed: seed + 2,
    skipFn: skipBack,
  });

  add(
    quad(
      [-halfX, eaveY - 0.16, eaveZ],
      [-halfX, ridgeY - 0.16, 0],
      [halfX, ridgeY - 0.16, 0],
      [halfX, eaveY - 0.16, eaveZ],
      materials.roofSoffit,
    ),
  );
  add(
    quad(
      [-halfX, eaveY - 0.16, -eaveZ],
      [halfX, eaveY - 0.16, -eaveZ],
      [halfX, ridgeY - 0.16, 0],
      [-halfX, ridgeY - 0.16, 0],
      materials.roofSoffit,
    ),
  );

  const ridge = cyl(0.14, halfX * 2 + 0.2, materials.roofRidge, {
    axis: 'x',
    segments: 6,
    outline: 0.012,
  });
  ridge.position.set(0, ridgeY + 0.04, 0);
  add(ridge);

  for (const z of [eaveZ + 0.03, -eaveZ - 0.03]) {
    const fascia = box(halfX * 2 + 0.18, 0.22, 0.11, materials.timber, {
      tile: TILE.wood,
      outline: 0.012,
    });
    fascia.position.set(0, eaveY - 0.09, z);
    add(fascia);
  }

  for (const x of [-halfX, halfX]) {
    const out = Math.sign(x);
    for (const sz of [1, -1]) {
      const board = box(0.12, 0.25, slopeLen, materials.timber, {
        tile: TILE.wood,
        outline: 0.012,
      });
      board.position.set(x + out * 0.06, (eaveY + ridgeY) / 2 - 0.15, (sz * eaveZ) / 2);
      board.rotation.x = sz * angle;
      add(board);

      const verge = box(0.28, 0.11, slopeLen, materials.roofRidge, { outline: 0 });
      verge.position.set(x, (eaveY + ridgeY) / 2 + 0.07, (sz * eaveZ) / 2);
      verge.rotation.x = sz * angle;
      add(verge);
    }
  }
}

/**
 * Analytically computes a dormer's placement on the main front roof slope so its entire
 * front wall, window sill, and flower box sit cleanly proud (+Y/+Z) of the main roof tiles,
 * and returns a `skipFn(pos)` predicate to cull main roof tiles inside the dormer body.
 */
export function computeDormerSpec({
  x = 1.8,
  d = 6.4,
  eaveY = 4.85,
  ridgeY = 7.85,
  width = 1.56,
  wallH = 1.02,
  rise = 0.84,
  overhangZ = 0.55,
  seed = 31,
} = {}) {
  const roofEaveY = eaveY - 0.12;
  const eaveZ = d / 2 + overhangZ;
  const roofRise = ridgeY - roofEaveY;
  const zFront = d / 2 - 0.06;
  const yRoofAtFront = roofEaveY + roofRise * (1 - zFront / eaveZ);
  const baseY = yRoofAtFront + 0.08;
  const dormerEaveY = baseY + wallH;
  const apex = dormerEaveY + rise;

  // Solve where the dormer ridge (apex) and dormer eaves intersect the main roof plane
  const zBack = Math.max(0.18, eaveZ * (1 - (apex - roofEaveY) / roofRise) - 0.06);
  const zEaveBack = Math.max(zBack + 0.15, eaveZ * (1 - (dormerEaveY - roofEaveY) / roofRise) - 0.05);

  const skipFn = (pos) => {
    return (
      Math.abs(pos.x - x) < width * 0.5 - 0.06 &&
      pos.z > zBack + 0.12 &&
      pos.z < zFront + 0.08
    );
  };

  return {
    x,
    baseY,
    zFront,
    zBack,
    zEaveBack,
    width,
    wallH,
    rise,
    seed,
    skipFn,
  };
}

export function buildDormerUnit(
  add,
  place,
  materials,
  {
    x = 2.0,
    baseY = 5.0,
    zFront = 3.0,
    zBack = 0.6,
    zEaveBack = null,
    width = 1.56,
    wallH = 1.02,
    rise = 0.84,
    seed = 31,
  } = {},
) {
  const eaveY = baseY + wallH;
  const apex = eaveY + rise;
  const roofHalf = width / 2 + 0.16;
  const midY = (apex + eaveY) / 2;
  const angle = Math.atan2(rise, roofHalf);
  const roofLen = Math.hypot(roofHalf, rise);
  const roofFront = zFront + 0.24;
  const cheekBackZ = zEaveBack ?? (zFront + zBack) * 0.5;

  const winOpts = {
    w: 0.72,
    h: 0.76,
    cols: 2,
    rows: 2,
    jambs: false,
    arch: false,
    shutters: false,
    flowerBox: true,
    seed: seed + 5,
  };

  const winY = 0.24;
  const front = makeWall({
    length: width,
    height: wallH,
    gableRise: rise,
    thickness: 0.24,
    holes: [{ x: 0, y: winY, w: winOpts.w, h: winOpts.h }],
    material: materials.stucco,
    tile: TILE.stucco,
    outline: 0.016,
  });
  front.position.set(x, baseY, zFront);
  add(front);

  // Crisp timber corner posts & header on the dormer face
  for (const sx of [-1, 1]) {
    const cPost = box(0.12, wallH, 0.12, materials.timber, { tile: TILE.wood, outline: 0.01 });
    cPost.position.set(x + sx * (width / 2 - 0.05), baseY + wallH / 2, zFront + 0.02);
    add(cPost);
  }
  const tieBeam = box(width + 0.06, 0.12, 0.13, materials.timber, { tile: TILE.wood, outline: 0.01 });
  tieBeam.position.set(x, eaveY - 0.04, zFront + 0.03);
  add(tieBeam);

  // Deep side cheek walls bridging from zFront back into the main roof slope
  const cheekDepth = Math.max(0.75, zFront - cheekBackZ + 0.25);
  for (const sx of [-1, 1]) {
    const cheek = box(0.22, wallH - 0.04, cheekDepth, materials.stucco, {
      tile: TILE.stucco,
      outline: 0.012,
    });
    cheek.position.set(
      x + sx * (width / 2 - 0.11),
      baseY + (wallH - 0.04) / 2,
      zFront - cheekDepth / 2 - 0.08,
    );
    add(cheek);

    const cheekPlate = box(0.13, 0.13, cheekDepth + 0.12, materials.timber, { tile: TILE.wood, outline: 0 });
    cheekPlate.position.set(x + sx * (width / 2 - 0.05), eaveY - 0.05, zFront - cheekDepth / 2);
    add(cheekPlate);
  }

  add(
    quad(
      [x, apex, zBack],
      [x, apex, roofFront],
      [x + roofHalf, eaveY, roofFront],
      [x + roofHalf, eaveY, zBack],
      materials.roofBase,
      { outline: 0.014 },
    ),
  );
  add(
    quad(
      [x, apex, roofFront],
      [x, apex, zBack],
      [x - roofHalf, eaveY, zBack],
      [x - roofHalf, eaveY, roofFront],
      materials.roofBase,
      { outline: 0.014 },
    ),
  );

  tileRoof({
    a: [x + roofHalf, eaveY, roofFront],
    b: [x + roofHalf, eaveY, zBack],
    d: [x, apex, roofFront],
    width: roofFront - zBack,
    length: roofLen,
    seed,
  });
  tileRoof({
    a: [x - roofHalf, eaveY, zBack],
    b: [x - roofHalf, eaveY, roofFront],
    d: [x, apex, zBack],
    width: roofFront - zBack,
    length: roofLen,
    seed: seed + 1,
  });

  const ridge = cyl(0.08, roofFront - zBack + 0.06, materials.roofRidge, {
    axis: 'z',
    segments: 6,
    outline: 0,
  });
  ridge.position.set(x, apex + 0.03, (roofFront + zBack) / 2);
  add(ridge);

  for (const sx of [-1, 1]) {
    const verge = box(roofLen, 0.1, 0.22, materials.roofRidge, { outline: 0 });
    verge.position.set(x + sx * (roofHalf / 2), midY + 0.05, roofFront + 0.02);
    verge.rotation.z = -sx * angle;
    add(verge);

    const board = box(roofLen, 0.16, 0.1, materials.timber, { tile: TILE.wood, outline: 0.008 });
    board.position.set(x + sx * (roofHalf / 2), midY - 0.1, roofFront + 0.01);
    board.rotation.z = -sx * angle;
    add(board);
  }

  place(windowUnit(materials, winOpts), x, baseY + winY, zFront + 0.02);
}

export function buildChimneyUnit(
  add,
  materials,
  { x = 3.5, z = -0.6, baseY = 5.5, topY = 9.8, w = 1.0, d = 0.9 } = {},
) {
  const h = topY - baseY;
  const stack = box(w, h, d, materials.stone, { tile: TILE.stone, outline: 0.02 });
  stack.position.set(x, baseY + h / 2, z);
  add(stack);

  const band = box(w + 0.14, 0.18, d + 0.14, materials.stoneTrim, {
    tile: TILE.stone,
    outline: 0.014,
  });
  band.position.set(x, topY - 0.55, z);
  add(band);

  const cap = box(w + 0.26, 0.24, d + 0.26, materials.stoneTrim, {
    tile: TILE.stone,
    outline: 0.016,
  });
  cap.position.set(x, topY + 0.08, z);
  add(cap);

  const pot = box(w * 0.65, 0.34, d * 0.65, materials.roofRidge, { outline: 0.012 });
  pot.position.set(x, topY + 0.36, z);
  add(pot);
}

export function buildPitchedDoorHood(
  add,
  materials,
  { x = 0, y = 3.32, wallZ = 3.1, width = 2.22, rise = 0.58, depth = 0.96, seed = 41 } = {},
) {
  const halfW = width / 2;
  const frontZ = wallZ + depth;
  const backZ = wallZ - 0.05;
  const apexY = y + rise;
  const slopeLen = Math.hypot(halfW, rise);
  const angle = Math.atan2(rise, halfW);

  for (const sx of [-1, 1]) {
    const beam = box(0.14, 0.15, depth, materials.timber, { tile: TILE.wood, outline: 0 });
    beam.position.set(x + sx * (halfW - 0.14), y - 0.05, wallZ + depth / 2);
    add(beam);

    const corbel = box(0.14, 0.54, 0.15, materials.timberDark, { tile: TILE.wood, outline: 0 });
    corbel.position.set(x + sx * (halfW - 0.14), y - 0.35, wallZ + 0.08);
    add(corbel);

    add(
      beamBetween(
        [x + sx * (halfW - 0.14), y - 0.54, wallZ + 0.1],
        [x + sx * (halfW - 0.14), y - 0.06, wallZ + depth * 0.78],
        0.12,
        0.12,
        materials.timber,
      ),
    );
  }

  const tie = box(width - 0.12, 0.14, 0.14, materials.timber, { tile: TILE.wood, outline: 0.012 });
  tie.position.set(x, y - 0.03, frontZ - 0.12);
  add(tie);

  const king = box(0.14, rise - 0.06, 0.12, materials.timber, { tile: TILE.wood, outline: 0 });
  king.position.set(x, y + rise / 2 - 0.02, frontZ - 0.12);
  add(king);

  add(
    quad(
      [x, apexY, backZ],
      [x, apexY, frontZ],
      [x + halfW, y, frontZ],
      [x + halfW, y, backZ],
      materials.roofBase,
      { outline: 0.014 },
    ),
  );
  add(
    quad(
      [x, apexY, frontZ],
      [x, apexY, backZ],
      [x - halfW, y, backZ],
      [x - halfW, y, frontZ],
      materials.roofBase,
      { outline: 0.014 },
    ),
  );

  tileRoof({
    a: [x + halfW, y, frontZ],
    b: [x + halfW, y, backZ],
    d: [x, apexY, frontZ],
    width: frontZ - backZ,
    length: slopeLen,
    seed,
  });
  tileRoof({
    a: [x - halfW, y, backZ],
    b: [x - halfW, y, frontZ],
    d: [x, apexY, backZ],
    width: frontZ - backZ,
    length: slopeLen,
    seed: seed + 1,
  });

  const ridge = cyl(0.08, frontZ - backZ + 0.08, materials.roofRidge, {
    axis: 'z',
    segments: 6,
    outline: 0,
  });
  ridge.position.set(x, apexY + 0.03, (frontZ + backZ) / 2);
  add(ridge);

  for (const sx of [-1, 1]) {
    const board = box(slopeLen, 0.15, 0.09, materials.timber, { tile: TILE.wood, outline: 0.01 });
    board.position.set(x + sx * (halfW / 2), (y + apexY) / 2 - 0.07, frontZ + 0.01);
    board.rotation.z = -sx * angle;
    add(board);
  }
}

export function buildLanternUnit(add, materials, { x = 1.32, y = 2.5, z = 3.2 } = {}) {
  const arm = box(0.08, 0.08, 0.38, materials.iron, { outline: 0 });
  arm.position.set(x, y, z + 0.19);
  add(arm);

  const drop = box(0.05, 0.2, 0.05, materials.iron, { outline: 0 });
  drop.position.set(x, y - 0.16, z + 0.35);
  add(drop);

  const glow = box(0.16, 0.22, 0.16, materials.lampGlow, { outline: 0 });
  glow.position.set(x, y - 0.38, z + 0.35);
  add(glow);

  const base = box(0.22, 0.05, 0.22, materials.iron, { outline: 0 });
  base.position.set(x, y - 0.52, z + 0.35);
  add(base);

  const cap = box(0.24, 0.06, 0.24, materials.iron, { outline: 0 });
  cap.position.set(x, y - 0.25, z + 0.35);
  add(cap);
}

/* -------------------------------------------------------------------- props */

export function buildWoodenBarrel(materials, { r = 0.34, h = 0.82, openTop = false, water = false } = {}) {
  const g = new THREE.Group();
  const body = cyl(r * 0.94, h, materials.timberDark, {
    radiusTop: r * 0.94,
    segments: 8,
    outline: 0.012,
  });
  body.position.y = h / 2;
  g.add(body);

  for (const hy of [0.18, 0.82]) {
    const hoop = cyl(r * 0.97, 0.055, materials.iron, {
      radiusTop: r * 0.97,
      segments: 8,
      outline: 0,
    });
    hoop.position.y = h * hy;
    g.add(hoop);
  }

  if (openTop && water) {
    const waterDisc = cyl(r * 0.86, 0.05, materials.waterBlue, {
      segments: 8,
      outline: 0,
    });
    waterDisc.position.y = h - 0.015;
    g.add(waterDisc);
  }

  return g;
}

export function buildCabbageHead(materials, seed = 1) {
  const g = new THREE.Group();
  const rng = mulberry32(seed);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng() * 0.3;
    const leaf = sphere(0.15, i % 2 === 0 ? materials.leafDark : materials.leafMid, {
      sx: 1.3,
      sy: 0.55,
      sz: 1.0,
      outline: 0,
    });
    leaf.position.set(Math.cos(a) * 0.1, 0.07, Math.sin(a) * 0.1);
    leaf.rotation.y = -a;
    g.add(leaf);
  }
  const core = sphere(0.12, materials.cabbageCore, { sx: 1.05, sy: 0.9, sz: 1.05, outline: 0 });
  core.position.y = 0.13;
  g.add(core);
  return g;
}

/* ------------------------------------------- specialized building features */

export function buildTimberFrame(
  add,
  materials,
  {
    w,
    d,
    plinthH = 0.55,
    eaveY,
    ridgeY,
    floorY = null,
    hasStoneLower = false,
    skipRightGableCenter = false,
  },
) {
  const beam = (bw, bh, bd, x, y, z, outline = 0.012) => {
    const m = box(bw, bh, bd, materials.timber, { tile: TILE.wood, outline });
    m.position.set(x, y, z);
    add(m);
    return m;
  };

  for (const z of [d / 2 + 0.05, -d / 2 - 0.05]) {
    if (floorY && !hasStoneLower) beam(w, 0.2, 0.12, 0, floorY, z, 0.012);
    beam(w, 0.22, 0.12, 0, eaveY - 0.14, z, 0.012);
    const postStart = hasStoneLower && floorY ? floorY : plinthH;
    const postH = eaveY - postStart;
    for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) {
      beam(0.24, postH, 0.14, x, postStart + postH / 2, z, 0.012);
    }
    for (const sx of [-1, 1]) {
      add(
        beamBetween(
          [sx * (w / 2 - 0.18), eaveY - 1.1, z + Math.sign(z) * 0.01],
          [sx * (w / 2 - 1.02), eaveY - 0.22, z + Math.sign(z) * 0.01],
          0.14,
          0.1,
          materials.timber,
        ),
      );
    }
  }

  for (const x of [-w / 2 - 0.05, w / 2 + 0.05]) {
    const isRightGableChimney = skipRightGableCenter && x > 0;
    if (floorY && !hasStoneLower) beam(0.12, 0.2, d, x, floorY, 0, 0.012);
    beam(0.12, 0.22, d, x, eaveY - 0.14, 0, 0.012);

    const postStart = hasStoneLower && floorY ? floorY : plinthH;
    const postH = eaveY - postStart;
    const zPosts = isRightGableChimney ? [-d / 2 + 0.08, d / 2 - 0.08] : [-d / 2 + 0.08, d / 2 - 0.08, 0];
    for (const z of zPosts) {
      beam(0.14, postH, 0.24, x, postStart + postH / 2, z, 0.012);
    }

    const rise = ridgeY - eaveY;
    if (!isRightGableChimney) {
      const kingH = Math.max(0.8, rise - 0.22);
      beam(0.16, kingH, 0.18, x, eaveY + kingH / 2, 0, 0);
      for (const sz of [-1, 1]) {
        add(
          beamBetween(
            [x, eaveY + rise * 0.22, 0],
            [x, eaveY + rise * 0.56, sz * (d * 0.22)],
            0.14,
            0.1,
            materials.timber,
          ),
        );
      }
    } else {
      // Frame cleanly from the outer gable eaves inward to the central stone chimney stack
      for (const sz of [-1, 1]) {
        add(
          beamBetween(
            [x, eaveY + 0.04, sz * 1.75],
            [x, eaveY + rise * 0.42, sz * 0.78],
            0.14,
            0.1,
            materials.timber,
          ),
        );
      }
    }
  }
}

export function buildFlushCrossGable(
  add,
  materials,
  { d, eaveY, ridgeY, halfW = 1.98, roofHalf = 2.28, seed = 21 },
) {
  const wallZ = d / 2;
  const rise = ridgeY - eaveY;
  const frontZ = wallZ + 0.58;
  const backZ = 0.05;
  const gableFaceZ = wallZ + 0.42;
  const slopeLen = Math.hypot(roofHalf, rise);
  const angle = Math.atan2(rise, roofHalf);
  const midY = (eaveY + ridgeY) / 2;

  // Flush front gable infill sitting cleanly in front of the main roof eave plane
  const gable = gableWall({
    width: halfW * 2 + 0.14,
    rise: rise + 0.06,
    thickness: 0.48,
    material: materials.stucco,
  });
  gable.position.set(0, eaveY + 0.02, gableFaceZ);
  add(gable);

  const tie = box(halfW * 2 + 0.36, 0.22, 0.22, materials.timber, { tile: TILE.wood, outline: 0.014 });
  tie.position.set(0, eaveY + 0.04, gableFaceZ + 0.06);
  add(tie);

  const kingH = rise - 0.16;
  const king = box(0.18, kingH, 0.16, materials.timber, { tile: TILE.wood, outline: 0 });
  king.position.set(0, eaveY + 0.1 + kingH / 2, gableFaceZ + 0.06);
  add(king);

  for (const sx of [-1, 1]) {
    add(
      beamBetween(
        [0, eaveY + rise * 0.26, gableFaceZ + 0.06],
        [sx * (halfW * 0.52), eaveY + rise * 0.58, gableFaceZ + 0.06],
        0.14,
        0.1,
        materials.timber,
      ),
    );
  }

  add(
    quad(
      [0, ridgeY, backZ],
      [0, ridgeY, frontZ],
      [roofHalf, eaveY + 0.04, frontZ],
      [roofHalf, eaveY + 0.04, backZ],
      materials.roofBase,
      { outline: 0.018 },
    ),
  );
  add(
    quad(
      [0, ridgeY, frontZ],
      [0, ridgeY, backZ],
      [-roofHalf, eaveY + 0.04, backZ],
      [-roofHalf, eaveY + 0.04, frontZ],
      materials.roofBase,
      { outline: 0.018 },
    ),
  );

  tileRoof({
    a: [roofHalf, eaveY + 0.04, frontZ],
    b: [roofHalf, eaveY + 0.04, backZ],
    d: [0, ridgeY, frontZ],
    width: frontZ - backZ,
    length: slopeLen,
    seed,
  });
  tileRoof({
    a: [-roofHalf, eaveY + 0.04, backZ],
    b: [-roofHalf, eaveY + 0.04, frontZ],
    d: [0, ridgeY, backZ],
    width: frontZ - backZ,
    length: slopeLen,
    seed: seed + 1,
  });

  const ridge = cyl(0.13, frontZ - backZ + 0.1, materials.roofRidge, {
    axis: 'z',
    segments: 6,
    outline: 0.01,
  });
  ridge.position.set(0, ridgeY + 0.04, (frontZ + backZ) / 2);
  add(ridge);

  for (const sx of [-1, 1]) {
    const verge = box(slopeLen - 0.08, 0.11, 0.26, materials.roofRidge, { outline: 0 });
    verge.position.set(sx * (roofHalf / 2), midY + 0.08, frontZ + 0.03);
    verge.rotation.z = -sx * angle;
    add(verge);

    const board = box(slopeLen - 0.1, 0.2, 0.12, materials.timber, { tile: TILE.wood, outline: 0.012 });
    board.position.set(sx * (roofHalf / 2), midY - 0.08, frontZ + 0.01);
    board.rotation.z = -sx * angle;
    add(board);
  }
}

/**
 * Inn centered front porch canopy (`w: 4.1m`) over `lx = 0, lz = +d/2` with timber support posts
 * at `lx = -1.72` and `lx = +1.72` cleanly straddling outside the 2.3m-wide stone steps,
 * plus hanging tavern sign positioned cleanly in the stucco bay between the right porch post
 * and the right ground-floor window shutter, and outdoor 4-legged wooden picnic table + 2 benches.
 */
export function buildInnPorchAndProps(
  add,
  materials,
  { d = 7.4, subDepth = 1.5, seed = 51 } = {},
) {
  const wallZ = d / 2;
  const porchW = 4.1;
  const halfW = porchW / 2; // 2.05m
  const depth = 1.58;
  const frontZ = wallZ + depth;
  const postZ = wallZ + 1.24;
  const eaveY = 2.94;
  const rise = 0.5;
  const apexY = eaveY + rise; // 3.44m — leaves clear daylight below the 2nd-story center window box
  const slopeLen = Math.hypot(halfW, rise);
  const angle = Math.atan2(rise, halfW);

  // Two timber support posts at lx = -1.72 and +1.72 (straddling 2.3m steps at [-1.15, +1.15])
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

  // Hanging tavern sign mounted off the right porch post (x = 1.72 -> signX = 2.11, width = 0.48 -> x in [1.87, 2.35],
  // cleanly inside the open bay before the ground-floor right window's left shutter at x = 2.61)
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

  // Outdoor wooden picnic table with 4 legs + 2 benches to the left of the porch (lx = -3.65)
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

/**
 * Herbalist `-X` side glass-and-timber lean-to greenhouse conservatory
 * with stone plinth base, complete 4-corner & wall-junction timber framing,
 * front conservatory doorway + step, central stone walkway aisle, and 2 herb planter benches.
 */
export function buildGreenhouseLeanTo(
  add,
  materials,
  { wallX = -4.3, subDepth = 1.5, seed = 61 } = {},
) {
  const spanX = 2.48;
  const lenZ = 4.4;
  const outX = wallX - spanX;
  const midX = wallX - spanX / 2;
  const plinthTop = 0.68;
  const eaveY = 2.44;
  const wallJoinY = 3.56;
  const rise = wallJoinY - eaveY;
  const slopeLen = Math.hypot(spanX, rise);
  const slopeAngle = Math.atan2(rise, spanX);
  const doorW = 0.92;
  const doorHalfW = doorW / 2;
  const zFront = lenZ / 2;
  const zBack = -lenZ / 2;

  // Deep sub-grade foundation block (top at floor level y = 0.18 so doorway is step-accessible)
  const floorY = 0.18;
  const subH = floorY + subDepth;
  const subBase = box(spanX + 0.18, subH, lenZ + 0.18, materials.stone, { tile: TILE.stone, outline: 0.016 });
  subBase.position.set(midX, floorY - subH / 2, 0);
  add(subBase);

  const floor = box(spanX - 0.12, 0.06, lenZ - 0.12, materials.stoneDark, { tile: TILE.stone, outline: 0 });
  floor.position.set(midX, floorY + 0.03, 0);
  add(floor);

  // Front stone step at the conservatory doorway (x = midX, z = zFront + 0.26)
  const stepH = floorY + subDepth;
  const gStep = box(doorW + 0.28, stepH, 0.48, materials.stoneTrim, { tile: TILE.stone, outline: 0.012 });
  gStep.position.set(midX, floorY - stepH / 2, zFront + 0.24);
  add(gStep);

  // Perimeter stone knee-wall from floorY (0.18) to plinthTop (0.68), split on +Z for the doorway
  const kneeH = plinthTop - floorY;
  const kneeT = 0.24;
  const westKnee = box(kneeT, kneeH, lenZ + 0.12, materials.stone, { tile: TILE.stone, outline: 0.012 });
  westKnee.position.set(outX + kneeT / 2 - 0.04, floorY + kneeH / 2, 0);
  add(westKnee);
  const westCap = box(kneeT + 0.08, 0.06, lenZ + 0.2, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  westCap.position.set(outX + kneeT / 2 - 0.04, plinthTop + 0.03, 0);
  add(westCap);

  const northKnee = box(spanX, kneeH, kneeT, materials.stone, { tile: TILE.stone, outline: 0.012 });
  northKnee.position.set(midX, floorY + kneeH / 2, zBack + kneeT / 2 - 0.04);
  add(northKnee);
  const northCap = box(spanX + 0.1, 0.06, kneeT + 0.08, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  northCap.position.set(midX, plinthTop + 0.03, zBack + kneeT / 2 - 0.04);
  add(northCap);

  const sideWingW = (spanX - doorW) / 2;
  for (const [wx, wLen] of [
    [outX + sideWingW / 2, sideWingW],
    [wallX - sideWingW / 2, sideWingW],
  ]) {
    const fKnee = box(wLen, kneeH, kneeT, materials.stone, { tile: TILE.stone, outline: 0.012 });
    fKnee.position.set(wx, floorY + kneeH / 2, zFront - kneeT / 2 + 0.04);
    add(fKnee);
    const fCap = box(wLen + 0.06, 0.06, kneeT + 0.08, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
    fCap.position.set(wx, plinthTop + 0.03, zFront - kneeT / 2 + 0.04);
    add(fCap);
  }

  // Two herb planter benches flanking the central stone walkway aisle
  const rng = mulberry32(seed);
  const leafMats = [materials.leafDark, materials.leafMid, materials.leafLight];
  const flowerMats = [materials.flowerPurple, materials.flowerYellow, materials.flowerPink, materials.flowerWhite];

  for (const px of [wallX - 0.44, outX + 0.48]) {
    const trough = box(0.54, 0.52, lenZ - 0.88, materials.timberDark, { tile: TILE.wood, outline: 0.01 });
    trough.position.set(px, floorY + 0.3, -0.1);
    add(trough);

    const soil = box(0.44, 0.08, lenZ - 0.98, materials.soil, { outline: 0 });
    soil.position.set(px, floorY + 0.56, -0.1);
    add(soil);

    for (let i = 0; i < 4; i++) {
      const hz = THREE.MathUtils.lerp(-lenZ * 0.32, lenZ * 0.28, i / 3);
      const bush = sphere(0.22 + rng() * 0.04, leafMats[i % 3], { sx: 1.1, sy: 0.95, sz: 1.05, outline: 0 });
      bush.position.set(px + (rng() - 0.5) * 0.05, floorY + 0.72, hz);
      add(bush);

      const bloom = sphere(0.08, flowerMats[i % 4], { outline: 0 });
      bloom.position.set(px + (rng() - 0.5) * 0.06, floorY + 0.9, hz + 0.02);
      add(bloom);
    }
  }

  // Outer (-X) vertical mullions & sloped rafters
  const postH = eaveY - plinthTop;
  const zStations = [-lenZ / 2, -lenZ / 6, lenZ / 6, lenZ / 2];
  for (const z of zStations) {
    const post = box(0.13, postH, 0.13, materials.timber, { tile: TILE.wood, outline: 0.012 });
    post.position.set(outX + 0.06, plinthTop + postH / 2, z);
    add(post);

    const rafter = box(slopeLen + 0.14, 0.13, 0.12, materials.timber, { tile: TILE.wood, outline: 0.012 });
    rafter.position.set(midX, (eaveY + wallJoinY) / 2, z);
    rafter.rotation.z = slopeAngle;
    add(rafter);
  }

  // Wall-junction vertical posts where the greenhouse meets the cottage (-X) wall on front & back
  const wallPostH = wallJoinY - plinthTop;
  for (const z of [-lenZ / 2, lenZ / 2]) {
    const wPost = box(0.14, wallPostH, 0.14, materials.timber, { tile: TILE.wood, outline: 0.012 });
    wPost.position.set(wallX - 0.06, plinthTop + wallPostH / 2, z);
    add(wPost);
  }

  // Rear gable central mullion post
  const rearMidH = postH + rise * 0.5 - 0.06;
  const rearMidPost = box(0.11, rearMidH, 0.11, materials.timber, { tile: TILE.wood, outline: 0.01 });
  rearMidPost.position.set(midX, plinthTop + rearMidH / 2, zBack);
  add(rearMidPost);

  // Front conservatory doorway frame & glass-and-timber door on +Z face
  const doorHeaderY = 2.18;
  for (const sx of [-1, 1]) {
    const jx = midX + sx * doorHalfW;
    const tFrac = (jx - (outX + 0.06)) / (spanX - 0.06);
    const topY = eaveY + tFrac * rise - 0.04;
    const jH = topY - floorY;
    const jamb = box(0.12, jH, 0.13, materials.timber, { tile: TILE.wood, outline: 0.012 });
    jamb.position.set(jx, floorY + jH / 2, zFront);
    add(jamb);
  }
  const doorHeader = box(doorW + 0.12, 0.12, 0.14, materials.timber, { tile: TILE.wood, outline: 0.01 });
  doorHeader.position.set(midX, doorHeaderY, zFront);
  add(doorHeader);

  const doorKick = box(doorW - 0.08, 0.52, 0.07, materials.timberDark, { tile: TILE.wood, outline: 0.01 });
  doorKick.position.set(midX, floorY + 0.28, zFront - 0.02);
  add(doorKick);

  for (const sx of [-1, 1]) {
    const stile = box(0.08, doorHeaderY - floorY - 0.08, 0.07, materials.timber, { tile: TILE.wood, outline: 0 });
    stile.position.set(midX + sx * (doorHalfW - 0.07), floorY + (doorHeaderY - floorY) / 2, zFront - 0.02);
    add(stile);
  }
  const doorLatch = box(0.08, 0.14, 0.09, materials.iron, { outline: 0 });
  doorLatch.position.set(midX + doorHalfW - 0.12, floorY + 0.95, zFront + 0.02);
  add(doorLatch);

  const eavePlate = box(0.15, 0.15, lenZ + 0.18, materials.timber, { tile: TILE.wood, outline: 0.012 });
  eavePlate.position.set(outX + 0.06, eaveY, 0);
  add(eavePlate);

  const ledger = box(0.14, 0.16, lenZ + 0.18, materials.timber, { tile: TILE.wood, outline: 0.012 });
  ledger.position.set(wallX - 0.06, wallJoinY, 0);
  add(ledger);

  const midRail = box(0.09, 0.09, lenZ, materials.timber, { tile: TILE.wood, outline: 0 });
  midRail.position.set(outX + 0.06, plinthTop + postH * 0.52, 0);
  add(midRail);

  const sideGlass = box(0.03, postH - 0.1, lenZ - 0.12, materials.conservatoryGlass, { outline: 0 });
  sideGlass.position.set(outX + 0.06, plinthTop + postH / 2, 0);
  add(sideGlass);

  const roofGlass = box(slopeLen - 0.08, 0.03, lenZ - 0.12, materials.conservatoryGlass, { outline: 0 });
  roofGlass.position.set(midX, (eaveY + wallJoinY) / 2, 0);
  roofGlass.rotation.z = slopeAngle;
  add(roofGlass);

  for (const sz of [-1, 1]) {
    const zEnd = sz * (lenZ / 2 - 0.04);
    const endGlass = quad(
      [outX + 0.06, plinthTop, zEnd],
      [wallX, plinthTop, zEnd],
      [wallX, wallJoinY, zEnd],
      [outX + 0.06, eaveY, zEnd],
      materials.conservatoryGlass,
      { outline: 0 },
    );
    add(endGlass);
  }
}

/**
 * Smithy `+X` heavy stone forge chimney (centered on the `+X` gable) + open `+X` timber-post forge shed
 * with raised eave clearance, waist-height stone hearth & glowing orange ember coals,
 * freestanding iron anvil on timber stump with generous workspace around it, quench barrel, and cooperage barrels.
 */
export function buildForgeShedAndHearth(
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

  // Heavy stepped stone forge chimney centered on the +X gable wall (chimZ = 0)
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

  // Waist-high stone forge hearth extending forward (+X) from the chimney so coals are 100% visible under the shed roof
  const hearthX = wallX + 1.14;
  const hearthTableH = 0.76;
  const hearthBase = box(1.52, hearthTableH, 1.68, materials.stoneDark, { tile: TILE.stone, outline: 0.014 });
  hearthBase.position.set(hearthX, padTop + hearthTableH / 2, chimZ);
  add(hearthBase);

  const hearthRim = box(1.62, 0.1, 1.78, materials.stoneTrim, { tile: TILE.stone, outline: 0.01 });
  hearthRim.position.set(hearthX, padTop + hearthTableH + 0.04, chimZ);
  add(hearthRim);

  // Side stone cheeks framing the open firebox mouth
  for (const sz of [-1, 1]) {
    const cheek = box(0.95, 0.72, 0.24, materials.stone, { tile: TILE.stone, outline: 0.01 });
    cheek.position.set(hearthX - 0.12, padTop + hearthTableH + 0.4, chimZ + sz * 0.68);
    add(cheek);
  }

  // Corbeled stone smoke hood well below the shed roof rafters
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

  // Shaped iron anvil on a heavy banded timber stump placed in the open front-center workspace
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

  // Water quench barrel beside the anvil workspace, cooperage barrels stacked at rear
  place(buildWoodenBarrel(materials, { r: 0.35, h: 0.82, openTop: true, water: true }), wallX + 1.12, padTop, 2.02);

  place(buildWoodenBarrel(materials, { r: 0.34, h: 0.82 }), wallX + 2.25, padTop, -1.55);
  place(buildWoodenBarrel(materials, { r: 0.34, h: 0.82 }), wallX + 2.25, padTop, -2.28);
  place(buildWoodenBarrel(materials, { r: 0.31, h: 0.76 }), wallX + 2.25, padTop + 0.82, -1.92);

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

  // Sloped shed roof base + upward-facing 3D clay tiles (skipping tiles inside the chimney stack)
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

/**
 * Gardener attached `+X` side low dry-stone walled kitchen garden (`ox: +6.5, oz: 0, w: 4.4, d: 5.6`)
 * with a clear stone-flagged walkway path leading straight through the wooden picket gate
 * between two raised North-South soil beds and a rear bed planted with lush cabbages.
 */
export function buildKitchenGarden(
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

  // Central stone-flagged garden walkway leading inward from the front picket gate
  const pathLen = gd - 1.85;
  const walkway = box(0.96, 0.05, pathLen, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  walkway.position.set(gateX, padTop + 0.025, zMax - wallT - pathLen / 2 + 0.12);
  add(walkway);

  // Two North-South raised soil beds flanking the central walkway + one rear transverse bed
  const sideBedW = 1.12;
  const sideBedD = 3.05;
  const sideBedZ = gz + 0.32;
  const beds = [
    { bx: xMin + 0.84, bz: sideBedZ, bw: sideBedW, bd: sideBedD, cols: 2, rows: 3 },
    { bx: xMax - 0.96, bz: sideBedZ, bw: sideBedW, bd: sideBedD, cols: 2, rows: 3 },
    { bx: midX - 0.06, bz: zMin + 0.92, bw: spanX - 0.95, bd: 0.98, cols: 4, rows: 1 },
  ];

  beds.forEach(({ bx, bz, bw, bd, cols, rows }, bIdx) => {
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
  });
}

/**
 * Watermill 5.1m-diameter 12-paddle wooden waterwheel mounted on the `-X` wall
 * at `lx = -b.w * 0.5 - 0.72, ly = 0.85`, complete with a stone-lined millrace trough,
 * wooden headrace water chute, flowing water surface, and iron pillow-block axle bearings.
 */
export function buildWaterwheelAssembly(
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

  // Heavy cast-iron axle pillow-block bearings on both the outer stone pier and inner mill wall
  const outerBearing = box(0.42, 0.36, 0.52, materials.iron, { outline: 0.01 });
  outerBearing.position.set(pierX + 0.18, wheelY, 0);
  add(outerBearing);

  const wallBearing = box(0.36, 0.48, 0.58, materials.stoneTrim, { tile: TILE.stone, outline: 0 });
  wallBearing.position.set(wallX - 0.12, wheelY, 0);
  add(wallBearing);

  if (!inValley) {
    // Stone-lined millrace raceway trough beneath and around the waterwheel (for standalone y=0 preview)
    const raceLenZ = 5.65;
    const raceSpanX = wallX - pierX + 0.32;
    const raceWallTop = 0.24;
    const raceWallH = raceWallTop + subDepth;

    // Outer & inner stone millrace channel walls (trimmed cleanly without corner overlap)
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

    // Flowing water surface inside the stone millrace trough + tailrace whitewater foam
    const waterBed = box(raceSpanX - 0.24, subDepth + 0.06, raceLenZ - 0.28, materials.waterBlue, { outline: 0 });
    waterBed.position.set(wheelX, 0.06 - (subDepth + 0.06) / 2, 0);
    add(waterBed);

    for (const fz of [-1.45, 0.0, 1.45, 2.15]) {
      const foam = box(0.68, 0.03, 0.42, materials.flowerWhite, { outline: 0 });
      foam.position.set(wheelX, 0.075, fz);
      add(foam);
    }

    // Elevated timber headrace water flume feeding water from the rear (-Z) onto the wheel
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

  // Rotating waterwheel group (5.1m diameter -> 2.55m outer paddle radius)
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
    const hub = cyl(0.42, 0.14, materials.iron, { axis: 'x', segments: 8, outline: 0 });
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
      outline: 0.012,
    });
    paddle.position.set(0, sinA * pr, cosA * pr);
    paddle.rotation.x = -a + 0.22;
    wAdd(paddle);
  }

  mergeStatic(wheelGroup, { outline: 0.012, materials });
  add(wheelGroup);
  return wheelGroup;
}

export function buildCoreShell(
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

  buildDeepPlinth(add, materials, { w, d, plinthH, subDepth, eaveY });
  if (pilasters) {
    for (const px of [-2.18, 2.18]) {
      add(quoinPilaster(materials, { x: px, from: plinthH, to: eaveY, z: d / 2, side: Math.sign(px) }));
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

    const upFront = makeWall({ length: w, height: upperH, material: materials.stucco });
    upFront.position.set(0, plinthH + stoneLowerH, d / 2);
    add(upFront);

    const lowBack = makeWall({ length: w, height: stoneLowerH, holes: backHoles, material: materials.stone, tile: TILE.stone });
    lowBack.position.set(0, plinthH, -d / 2);
    lowBack.rotation.y = Math.PI;
    add(lowBack);

    const upBack = makeWall({ length: w, height: upperH, material: materials.stucco });
    upBack.position.set(0, plinthH + stoneLowerH, -d / 2);
    upBack.rotation.y = Math.PI;
    add(upBack);

    for (const [sx, rotY, sHoles] of [[-1, -Math.PI / 2, leftHoles], [1, Math.PI / 2, rightHoles]]) {
      const lowSide = makeWall({ length: d, height: stoneLowerH, holes: sHoles, material: materials.stone, tile: TILE.stone });
      lowSide.position.set((sx * w) / 2, plinthH, 0);
      lowSide.rotation.y = rotY;
      add(lowSide);

      const upSide = makeWall({ length: d, height: upperH, gableRise: roofH, material: materials.stucco });
      upSide.position.set((sx * w) / 2, plinthH + stoneLowerH, 0);
      upSide.rotation.y = rotY;
      add(upSide);
    }

    const ledge = box(w + 0.44, 0.14, d + 0.44, materials.stoneTrim, { tile: TILE.stone, outline: 0.014 });
    ledge.position.set(0, plinthH + stoneLowerH + 0.02, 0);
    add(ledge);
  } else {
    const front = makeWall({ length: w, height: wallH, holes: frontHoles, material: materials.stucco });
    front.position.set(0, plinthH, d / 2);
    add(front);

    const back = makeWall({ length: w, height: wallH, holes: backHoles, material: materials.stucco });
    back.position.set(0, plinthH, -d / 2);
    back.rotation.y = Math.PI;
    add(back);

    const left = makeWall({ length: d, height: wallH, gableRise: roofH, holes: leftHoles, material: materials.stucco });
    left.position.set(-w / 2, plinthH, 0);
    left.rotation.y = -Math.PI / 2;
    add(left);

    const right = makeWall({ length: d, height: wallH, gableRise: roofH, holes: rightHoles, material: materials.stucco });
    right.position.set(w / 2, plinthH, 0);
    right.rotation.y = Math.PI / 2;
    add(right);
  }

  place(doorUnit(materials, { w: doorW, h: doorH }), 0, plinthH, d / 2);
  place(windowUnit(materials, { w: winW, h: winH, seed: seed + 1 }), -winSideX, plinthH + groundWinY, d / 2);
  place(windowUnit(materials, { w: winW, h: winH, seed: seed + 2 }), winSideX, plinthH + groundWinY, d / 2);

  if (upperWins) {
    place(windowUnit(materials, { w: winW, h: 1.32, seed: seed + 3 }), -winSideX, plinthH + upperWinY, d / 2);
    place(windowUnit(materials, { w: winW, h: 1.32, seed: seed + 4 }), winSideX, plinthH + upperWinY, d / 2);
  }
  if (centerUpperWin) {
    place(windowUnit(materials, { w: 1.14, h: 1.32, cols: 3, shutters: false, seed: seed + 5 }), 0, plinthH + centerUpperWinY, d / 2);
  }

  place(windowUnit(materials, { w: winW, h: 1.34, seed: seed + 6 }), -winSideX * 0.9, plinthH + groundWinY + 0.04, -d / 2, Math.PI);
  place(windowUnit(materials, { w: winW, h: 1.34, seed: seed + 7 }), winSideX * 0.9, plinthH + groundWinY + 0.04, -d / 2, Math.PI);
  if (upperWins) {
    place(windowUnit(materials, { w: winW, h: 1.32, seed: seed + 8 }), 0, plinthH + upperWinY, -d / 2, Math.PI);
  }
  if (sideWinLeft) {
    place(windowUnit(materials, { w: winW, h: 1.34, seed: seed + 9 }), -w / 2, plinthH + groundWinY + 0.04, 0, -Math.PI / 2);
  }
  if (sideWinRight) {
    place(windowUnit(materials, { w: winW, h: 1.34, seed: seed + 10 }), w / 2, plinthH + groundWinY + 0.04, 0, Math.PI / 2);
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
  });
  buildMainGableRoof(add, materials, { w, d, eaveY: eaveY - 0.12, ridgeY, seed: seed + 20, skipFront });
  buildLanternUnit(add, materials, { x: 1.22, y: plinthH + 1.98, z: d / 2 });
}

/* ------------------------------------------------------------------ merging */

export function mergeStatic(root, { outline = 0.018, materials = null } = {}) {
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

  root.traverse((obj) => {
    if (obj === root || isInsideNoMerge(obj)) return;
    if (obj.isInstancedMesh && obj.userData?.isRoofTiles) {
      roofInstancedList.push(obj);
      return;
    }
    if (!obj.isMesh || obj.isInstancedMesh) return;
    if (obj.userData.isOutline) {
      oldOutlines.push(obj);
      return;
    }
    if (Array.isArray(obj.material)) return;
    meshes.push(obj);
  });

  for (const outMesh of oldOutlines) {
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
  }

  for (const mesh of meshes) {
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

    const targetMat = mesh.material.userData?.bucketMat || mesh.material;
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
  }

  for (const bucket of buckets.values()) {
    const merged = bucket.geos.length === 1 ? bucket.geos[0] : mergeGeometries(bucket.geos, false);
    if (!merged) continue;
    for (const mesh of bucket.meshes) mesh.parent?.remove(mesh);

    const mergedMesh = new THREE.Mesh(merged, bucket.material);
    mergedMesh.castShadow = bucket.cast;
    mergedMesh.receiveShadow = bucket.receive;
    mergedMesh.name = 'merged';
    root.add(mergedMesh);
  }

  if (outlineGeos.length > 0) {
    const mergedOutlineGeo =
      outlineGeos.length === 1 ? outlineGeos[0] : mergeGeometries(outlineGeos, false);
    if (mergedOutlineGeo) {
      const outMat = materials?.sharedOutline || makeOutlineMaterial(outline);
      const outMesh = new THREE.Mesh(mergedOutlineGeo, outMat);
      outMesh.name = `${root.name || 'group'}-outline`;
      outMesh.castShadow = false;
      outMesh.receiveShadow = false;
      outMesh.userData.isOutline = true;
      root.add(outMesh);
    }
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
