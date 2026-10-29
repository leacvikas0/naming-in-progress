import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addOutline } from './materials.js';

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
  if (outline && !material?.userData?.noOutline) addOutline(mesh, outline);
  return mesh;
}

export function cyl(radius, height, material, { radiusTop = radius, segments = 12, outline = 0.014, axis = 'y', name = '' } = {}) {
  const geo = new THREE.CylinderGeometry(radiusTop, radius, height, segments);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  if (axis === 'z') geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  if (outline && !material?.userData?.noOutline) addOutline(mesh, outline);
  return mesh;
}

export function sphere(radius, material, { sx = 1, sy = 1, sz = 1, segments = 10, outline = 0.01 } = {}) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (outline && !material?.userData?.noOutline) addOutline(mesh, outline);
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
  if (outline && !material?.userData?.noOutline) addOutline(mesh, outline);
  return mesh;
}

export function beamBetween(a, b, width, depth, material, { tile = TILE.wood, outline = 0.014 } = {}) {
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
    curveSegments: 20,
  });
  geo.translate(0, 0, -thickness);
  scaleUV(geo, 1 / tile, 1 / tile);

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, outline);
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
  addOutline(mesh, outline);
  return mesh;
}

/* --------------------------------------------------------------- roof tiles */

let TILE_GEOMETRY = null;

export function getTileGeometry() {
  if (TILE_GEOMETRY) return TILE_GEOMETRY;
  const w = 0.32;
  const l = 0.2;
  const tTop = 0.014;
  const tBot = 0.042;
  const r = 0.022;
  const hw = w / 2;

  const profile = [
    [-l / 2, 0],
    [l / 2, 0],
    [l / 2, tTop],
    [-l / 2 + r, tBot],
    [-l / 2, tBot],
  ];
  const n = profile.length;
  const positions = [];
  const indices = [];
  for (const x of [-hw, hw]) {
    for (const [y, z] of profile) positions.push(x, y, z);
  }
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i + 1, i);
    indices.push(n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, n + j, n + i);
    indices.push(i, j, n + j);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  TILE_GEOMETRY = geometry.toNonIndexed();
  TILE_GEOMETRY.computeVertexNormals();
  return TILE_GEOMETRY;
}

const TILE_VARIANTS = 6;
const tileBuckets = Array.from({ length: TILE_VARIANTS }, () => []);

/**
 * Lay real 3D clay tiles over one roof plane.
 * `skipFn(pos, cu, cv)` optionally skips tiles hidden inside cross-gables or dormers.
 */
export function tileRoof({ a, b, d, width, length, seed = 1, skipFn = null }) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const D = new THREE.Vector3(...d);
  const u = new THREE.Vector3().subVectors(B, A).normalize();
  const v = new THREE.Vector3().subVectors(D, A).normalize();
  const n = new THREE.Vector3().crossVectors(u, v).normalize();
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));

  const tileW = 0.32;
  const tileL = 0.2;
  const step = 0.17;
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
      const pick = Math.floor(rng() * TILE_VARIANTS);
      if (skipFn && skipFn(pos, cu, cv)) continue;
      matrix.compose(pos, quat, one);
      tileBuckets[pick].push(matrix.clone());
    }
  }
}

export function finalizeRoofTiles(add, materials) {
  const geometry = getTileGeometry();
  for (let i = 0; i < TILE_VARIANTS; i++) {
    const list = tileBuckets[i];
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geometry, materials.roofTiles[i], list.length);
    for (let j = 0; j < list.length; j++) mesh.setMatrixAt(j, list[j]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.noMerge = true;
    mesh.name = `roof-tiles-${i}`;
    add(mesh);
    list.length = 0;
  }
}

/* ------------------------------------------------------------------ windows */

function stoneJambs(group, { w, h, stone, count = 3 }) {
  for (const sx of [-1, 1]) {
    const bh = h / count;
    for (let i = 0; i < count; i++) {
      const block = box(0.24, bh - 0.014, 0.15, stone, { tile: TILE.stone, outline: 0.012 });
      block.position.set(sx * (w / 2 + 0.12), bh * (i + 0.5), 0.02);
      group.add(block);
    }
  }
}

function stoneArch(group, { w, h, stone }) {
  const count = 7;
  const radius = w / 2 + 0.28;
  const centerY = h - 0.52;
  for (let i = 0; i < count; i++) {
    const angle = THREE.MathUtils.lerp(
      THREE.MathUtils.degToRad(154),
      THREE.MathUtils.degToRad(26),
      i / (count - 1),
    );
    const block = box(0.28, 0.24, 0.15, stone, { tile: TILE.stone, outline: 0.012 });
    block.position.set(Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 0.02);
    block.rotation.z = angle - Math.PI / 2;
    group.add(block);
  }
}

function windowShutters(group, { w, h, materials, shutterWidth = 0.34 }) {
  const shH = h - 0.04;
  for (const sx of [-1, 1]) {
    const cx = sx * (w / 2 + 0.24 + shutterWidth / 2 + 0.015);
    const panel = box(shutterWidth, shH, 0.06, materials.shutterBlue, {
      tile: TILE.wood,
      outline: 0.012,
    });
    panel.position.set(cx, h / 2, 0.055);
    group.add(panel);

    // Cross battens on shutter
    for (const ry of [0.22, 0.78]) {
      const batten = box(shutterWidth - 0.04, 0.07, 0.025, materials.shutterBlueDark, {
        tile: TILE.wood,
        outline: 0.008,
      });
      batten.position.set(cx, h * ry, 0.09);
      group.add(batten);

      // Iron hinge strap connecting jamb to shutter
      const strap = box(0.16, 0.04, 0.02, materials.iron, { outline: 0.006 });
      strap.position.set(sx * (w / 2 + 0.24 + 0.06), h * ry, 0.098);
      group.add(strap);
    }
  }
}

function windowFlowerBox(group, { w, materials, seed = 1 }) {
  const boxW = w + 0.32;
  const boxH = 0.22;
  const boxD = 0.26;
  const yCenter = -0.22;
  const zCenter = 0.19;

  // Planter box body & rim
  const trough = box(boxW, boxH, boxD, materials.timberDark, { tile: TILE.wood, outline: 0.012 });
  trough.position.set(0, yCenter, zCenter);
  group.add(trough);

  const rim = box(boxW + 0.06, 0.045, boxD + 0.05, materials.timber, { tile: TILE.wood, outline: 0.01 });
  rim.position.set(0, yCenter + boxH / 2 + 0.01, zCenter);
  group.add(rim);

  // Soil bed
  const soil = box(boxW - 0.08, 0.06, boxD - 0.06, materials.soil, { outline: 0.006 });
  soil.position.set(0, yCenter + boxH / 2 + 0.015, zCenter);
  group.add(soil);

  // Support brackets under planter
  for (const sx of [-1, 1]) {
    const bracket = box(0.09, 0.22, 0.22, materials.timberDark, { tile: TILE.wood, outline: 0.008 });
    bracket.position.set(sx * (w / 2 - 0.08), yCenter - 0.1, 0.11);
    group.add(bracket);
  }

  // Lush green foliage tufts + colorful blooms
  const rng = mulberry32(seed);
  const leafMats = [materials.leafDark, materials.leafMid, materials.leafLight];
  const flowerMats = [
    materials.flowerPink,
    materials.flowerYellow,
    materials.flowerWhite,
    materials.flowerBlue,
    materials.flowerPurple,
  ];

  const count = Math.max(4, Math.round(boxW / 0.24));
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const fx = THREE.MathUtils.lerp(-boxW * 0.4, boxW * 0.4, t) + (rng() - 0.5) * 0.05;
    const fz = zCenter + (rng() - 0.5) * 0.07;
    const leafR = 0.095 + rng() * 0.035;
    const leafMat = leafMats[i % leafMats.length];
    const tuft = sphere(leafR, leafMat, { sx: 1.15, sy: 0.82, sz: 1.0, outline: 0.008 });
    tuft.position.set(fx, yCenter + boxH / 2 + 0.06, fz);
    group.add(tuft);

    // Flower blossom on top of each foliage tuft
    const flMat = flowerMats[(i + Math.floor(rng() * 3)) % flowerMats.length];
    const bloom = sphere(0.052 + rng() * 0.018, flMat, { sx: 1.1, sy: 0.85, sz: 1.1, outline: 0.006 });
    bloom.position.set(
      fx + (rng() - 0.5) * 0.04,
      yCenter + boxH / 2 + 0.125 + rng() * 0.02,
      fz + 0.025,
    );
    group.add(bloom);
  }
}

function windowSill(group, { w, materials, hasFlowerBox = false }) {
  const sill = box(w + 0.52, 0.11, 0.34, materials.timber, { tile: TILE.wood, outline: 0.012 });
  sill.position.set(0, -0.05, 0.06);
  group.add(sill);
  if (!hasFlowerBox) {
    for (const sx of [-1, 1]) {
      const bracket = box(0.1, 0.18, 0.16, materials.timberDark, { tile: TILE.wood, outline: 0.01 });
      bracket.position.set(sx * (w / 2 - 0.08), -0.18, 0.03);
      group.add(bracket);
    }
  }
}

/**
 * Multi-pane leaded blue window unit with optional shutters and planted flower box.
 */
export function windowUnit(
  materials,
  {
    w = 1.15,
    h = 1.5,
    cols = 2,
    rows = 3,
    sill = true,
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

  // Timber reveal lining inside the wall opening
  const lining = (lw, lh, x, y) => {
    const bar = box(lw, lh, 0.22, materials.timberDark, { tile: TILE.wood, outline: 0.01 });
    bar.position.set(x, y, -0.11);
    group.add(bar);
  };
  lining(0.06, h, -w / 2 + 0.03, h / 2);
  lining(0.06, h, w / 2 - 0.03, h / 2);
  lining(w, 0.06, 0, h - 0.03);
  lining(w, 0.06, 0, 0.03);

  // Painted glass pane recessed behind the muntins
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), glass);
  pane.position.set(0, h / 2, -0.22);
  group.add(pane);

  const bar = (bw, bh, x, y) => {
    const m = box(bw, bh, 0.09, frame, { tile: TILE.wood, outline: 0.01 });
    m.position.set(x, y, -0.165);
    group.add(m);
  };
  const f = 0.08;
  bar(w, f, 0, f / 2);
  bar(w, f, 0, h - f / 2);
  bar(f, h, -w / 2 + f / 2, h / 2);
  bar(f, h, w / 2 - f / 2, h / 2);
  for (let c = 1; c < cols; c++) bar(0.052, h, -w / 2 + (w / cols) * c, h / 2);
  for (let r = 1; r < rows; r++) bar(w, 0.052, 0, (h / rows) * r);

  stoneJambs(group, { w, h, stone });
  if (arch) stoneArch(group, { w, h, stone });
  if (sill) windowSill(group, { w, materials, hasFlowerBox: flowerBox });
  if (shutters) windowShutters(group, { w, h, materials, shutterWidth });
  if (flowerBox) windowFlowerBox(group, { w, materials, seed });

  return group;
}

/* --------------------------------------------------------------------- door */

export function doorUnit(materials, { w = 1.5, h = 2.65, arched = true } = {}) {
  const group = new THREE.Group();
  const r = arched ? w / 2 : 0;
  const rectH = h - r;

  const jambCount = 3;
  for (const sx of [-1, 1]) {
    const bh = rectH / jambCount;
    for (let i = 0; i < jambCount; i++) {
      const block = box(0.28, bh - 0.014, 0.34, materials.stoneTrim, { tile: TILE.stone, outline: 0.016 });
      block.position.set(sx * (w / 2 + 0.14), bh * (i + 0.5), 0.05);
      group.add(block);
    }
  }

  if (arched) {
    const count = 13;
    const radius = w / 2 + 0.16;
    for (let i = 0; i < count; i++) {
      const angle = THREE.MathUtils.lerp(Math.PI * 0.99, Math.PI * 0.01, i / (count - 1));
      const block = box(0.22, 0.32, 0.32, materials.stoneTrim, { tile: TILE.stone, outline: 0.014 });
      block.position.set(Math.cos(angle) * radius, rectH + Math.sin(angle) * radius, 0.04);
      block.rotation.z = angle - Math.PI / 2;
      group.add(block);
    }
  }

  const threshold = box(w + 0.48, 0.16, 0.54, materials.stoneTrim, { tile: TILE.stone, outline: 0.016 });
  threshold.position.set(0, -0.08, 0.2);
  group.add(threshold);

  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, rectH);
  if (arched) shape.absarc(0, rectH, r, 0, Math.PI, false);
  else shape.lineTo(-w / 2, rectH);
  shape.lineTo(-w / 2, 0);

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 20 });
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
  }
  const leaf = new THREE.Mesh(geo, materials.door);
  leaf.position.z = -0.16;
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  addOutline(leaf, 0.014);
  group.add(leaf);

  const strap = (y) => {
    const band = box(w - 0.16, 0.085, 0.035, materials.iron, { tile: 1, outline: 0.008 });
    band.position.set(0, y, -0.045);
    group.add(band);
    for (let i = 0; i < 5; i++) {
      const rivet = cyl(0.016, 0.03, materials.iron, { segments: 6, outline: 0, axis: 'z' });
      rivet.position.set(-w / 2 + 0.18 + i * ((w - 0.36) / 4), y, -0.04);
      group.add(rivet);
    }
  };
  strap(rectH * 0.85);
  strap(0.38);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.016, 8, 16), materials.iron);
  ring.position.set(-0.28, 1.38, -0.03);
  ring.castShadow = true;
  addOutline(ring, 0.008);
  group.add(ring);

  const mount = box(0.1, 0.12, 0.03, materials.iron, { outline: 0.008 });
  mount.position.set(-0.28, 1.5, -0.045);
  group.add(mount);

  const plate = box(0.12, 0.21, 0.025, materials.iron, { outline: 0.008 });
  plate.position.set(0.31, 1.18, -0.048);
  group.add(plate);

  const keyhole = box(0.035, 0.075, 0.012, materials.interior, { outline: 0 });
  keyhole.position.set(0.31, 1.19, -0.032);
  group.add(keyhole);

  return group;
}

/**
 * Builds front stone steps extending down to `y = -subDepth` (-1.5m) so they never float,
 * and returns the exact front-step threshold offset `{ x, z }`.
 */
export function buildFrontSteps(
  add,
  materials,
  { doorX = 0, wallZ = 3.2, stepW = 2.15, plinthH = 0.55, subDepth = 1.5 } = {},
) {
  // Upper step: top at y = 0.36, spans z from wallZ to wallZ + 0.58
  const top1 = 0.36;
  const h1 = top1 + subDepth;
  const d1 = 0.58;
  const z1 = wallZ + d1 / 2;
  const step1 = box(stepW - 0.16, h1, d1, materials.stone, { tile: TILE.stone, outline: 0.014 });
  step1.position.set(doorX, top1 - h1 / 2, z1);
  add(step1);

  const cap1 = box(stepW - 0.1, 0.06, d1 + 0.05, materials.stoneTrim, { tile: TILE.stone, outline: 0.012 });
  cap1.position.set(doorX, top1 + 0.01, z1);
  add(cap1);

  // Lower outer step: top at y = 0.18, spans z from wallZ + 0.54 to wallZ + 1.06
  const top2 = 0.18;
  const h2 = top2 + subDepth;
  const d2 = 0.52;
  const z2 = wallZ + 0.54 + d2 / 2;
  const step2 = box(stepW, h2, d2, materials.stone, { tile: TILE.stone, outline: 0.014 });
  step2.position.set(doorX, top2 - h2 / 2, z2);
  add(step2);

  const cap2 = box(stepW + 0.06, 0.06, d2 + 0.05, materials.stoneTrim, { tile: TILE.stone, outline: 0.012 });
  cap2.position.set(doorX, top2 + 0.01, z2);
  add(cap2);

  const outerThresholdZ = Number((wallZ + 0.54 + d2).toFixed(3));
  return { x: doorX, z: outerThresholdZ, stepWidth: stepW + 0.06 };
}

/* ------------------------------------------------------------------- stone */

export function quoinCorner(materials, { x, z, ox, oz, from, to, course = 0.42 }) {
  const group = new THREE.Group();
  const count = Math.floor((to - from) / course);
  for (let i = 0; i < count; i++) {
    const y = from + course * (i + 0.5);
    const even = i % 2 === 0;
    const block = even
      ? box(0.62, course - 0.02, 0.34, materials.stone, { tile: TILE.stone, outline: 0.016 })
      : box(0.34, course - 0.02, 0.62, materials.stone, { tile: TILE.stone, outline: 0.016 });
    block.position.set(
      x - ox * (even ? 0.31 : 0.15),
      y,
      z - oz * (even ? 0.15 : 0.31),
    );
    group.add(block);
  }
  return group;
}

export function quoinPilaster(materials, { x, from, to, z, side = 1, course = 0.42 }) {
  const group = new THREE.Group();
  const count = Math.floor((to - from) / course);
  for (let i = 0; i < count; i++) {
    const y = from + course * (i + 0.5);
    const even = i % 2 === 0;
    const block = box(even ? 0.58 : 0.38, course - 0.02, even ? 0.32 : 0.4, materials.stone, {
      tile: TILE.stone,
      outline: 0.016,
    });
    block.position.set(x - side * (even ? 0.29 : 0.19), y, z - 0.13);
    group.add(block);
  }
  return group;
}

/**
 * Deep stone foundation plinth extending from `y = -1.5` up to `y = plinthH` (+0.55)
 * so buildings never float on sloped terrain.
 */
export function buildDeepPlinth(add, materials, { w, d, plinthH = 0.55, subDepth = 1.5, eaveY = 4.5 }) {
  const totalH = plinthH + subDepth;
  const base = box(w + 0.36, totalH, d + 0.36, materials.stone, { tile: TILE.stone, outline: 0.02 });
  base.position.set(0, plinthH - totalH / 2, 0);
  add(base);

  const cap = box(w + 0.5, 0.08, d + 0.5, materials.stoneTrim, { tile: TILE.stone, outline: 0.018 });
  cap.position.set(0, plinthH + 0.04, 0);
  add(cap);

  const corners = [
    { x: -w / 2, z: d / 2, ox: -1, oz: 1 },
    { x: w / 2, z: d / 2, ox: 1, oz: 1 },
    { x: -w / 2, z: -d / 2, ox: -1, oz: -1 },
    { x: w / 2, z: -d / 2, ox: 1, oz: -1 },
  ];
  for (const corner of corners) {
    add(quoinCorner(materials, { ...corner, from: plinthH, to: eaveY, course: 0.42 }));
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

  // Dark base planes under 3D clay tiles
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

  // Staggered 3D clay roof tiles
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

  // Soffits
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

  // Ridge cap
  const ridge = cyl(0.14, halfX * 2 + 0.2, materials.roofRidge, {
    axis: 'x',
    segments: 10,
    outline: 0.012,
  });
  ridge.position.set(0, ridgeY + 0.04, 0);
  add(ridge);

  // Eave fascias and rafter tails
  for (const z of [eaveZ + 0.03, -eaveZ - 0.03]) {
    const fascia = box(halfX * 2 + 0.18, 0.22, 0.11, materials.timber, {
      tile: TILE.wood,
      outline: 0.014,
    });
    fascia.position.set(0, eaveY - 0.09, z);
    add(fascia);

    const rafterSpan = Math.floor(w / 0.85);
    for (let i = -rafterSpan; i <= rafterSpan; i++) {
      const rx = i * 0.82;
      if (Math.abs(rx) > halfX - 0.3) continue;
      const rafter = box(0.1, 0.15, 0.55, materials.timberDark, {
        tile: TILE.wood,
        outline: 0.008,
      });
      rafter.position.set(rx, eaveY - 0.06, Math.sign(z) * (eaveZ - 0.28));
      add(rafter);
    }
  }

  // Bargeboards + red verge caps on the four gable-end edges
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

      const verge = box(0.28, 0.11, slopeLen, materials.roofRidge, { outline: 0.01 });
      verge.position.set(x, (eaveY + ridgeY) / 2 + 0.07, (sz * eaveZ) / 2);
      verge.rotation.x = sz * angle;
      add(verge);
    }
  }
}

export function buildDormerUnit(
  add,
  place,
  materials,
  {
    x = 2.0,
    baseY = 5.0,
    zFront = 2.8,
    zBack = 0.4,
    width = 1.65,
    wallH = 0.88,
    rise = 0.96,
    seed = 31,
  } = {},
) {
  const eaveY = baseY + wallH;
  const apex = eaveY + rise;
  const roofHalf = width / 2 + 0.14;
  const midY = (apex + eaveY) / 2;
  const angle = Math.atan2(rise, roofHalf);
  const roofLen = Math.hypot(roofHalf, rise);
  const roofFront = zFront + 0.26;

  const winOpts = {
    w: 0.72,
    h: 0.86,
    cols: 2,
    rows: 2,
    arch: false,
    shutters: false,
    flowerBox: true,
    seed: seed + 5,
  };

  const front = makeWall({
    length: width,
    height: wallH,
    gableRise: rise,
    thickness: 0.24,
    holes: [{ x: 0, y: 0.18, w: winOpts.w, h: winOpts.h }],
    material: materials.stucco,
    tile: TILE.stucco,
    outline: 0.018,
  });
  front.position.set(x, baseY, zFront);
  add(front);

  const cheekDepth = Math.max(0.6, (zFront - zBack) * 0.45);
  for (const sx of [-1, 1]) {
    const cheek = box(0.2, wallH - 0.08, cheekDepth, materials.stucco, {
      tile: TILE.stucco,
      outline: 0.014,
    });
    cheek.position.set(x + sx * (width / 2 - 0.1), baseY + (wallH - 0.08) / 2, zFront - cheekDepth / 2 - 0.12);
    add(cheek);
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
    seed: seed,
  });
  tileRoof({
    a: [x - roofHalf, eaveY, zBack],
    b: [x - roofHalf, eaveY, roofFront],
    d: [x, apex, zBack],
    width: roofFront - zBack,
    length: roofLen,
    seed: seed + 1,
  });

  const ridge = cyl(0.08, roofFront - zBack, materials.roofRidge, {
    axis: 'z',
    segments: 8,
    outline: 0.008,
  });
  ridge.position.set(x, apex + 0.03, (roofFront + zBack) / 2);
  add(ridge);

  for (const sx of [-1, 1]) {
    const verge = box(roofLen, 0.1, 0.22, materials.roofRidge, { outline: 0.008 });
    verge.position.set(x + sx * (roofHalf / 2), midY + 0.05, roofFront + 0.02);
    verge.rotation.z = -sx * angle;
    add(verge);

    const board = box(roofLen, 0.18, 0.1, materials.timber, { tile: TILE.wood, outline: 0.008 });
    board.position.set(x + sx * (roofHalf / 2), midY - 0.11, roofFront + 0.01);
    board.rotation.z = -sx * angle;
    add(board);
  }

  place(windowUnit(materials, winOpts), x, baseY + 0.18, zFront);
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
    outline: 0.016,
  });
  band.position.set(x, topY - 0.55, z);
  add(band);

  const cap = box(w + 0.26, 0.24, d + 0.26, materials.stoneTrim, {
    tile: TILE.stone,
    outline: 0.018,
  });
  cap.position.set(x, topY + 0.08, z);
  add(cap);

  const pot = box(w * 0.65, 0.34, d * 0.65, materials.roofRidge, { outline: 0.014 });
  pot.position.set(x, topY + 0.36, z);
  add(pot);
}

export function buildPitchedDoorHood(
  add,
  materials,
  { x = 0, y = 3.35, wallZ = 3.1, width = 2.25, rise = 0.68, depth = 1.05, seed = 41 } = {},
) {
  const halfW = width / 2;
  const frontZ = wallZ + depth;
  const backZ = wallZ - 0.05;
  const apexY = y + rise;
  const slopeLen = Math.hypot(halfW, rise);
  const angle = Math.atan2(rise, halfW);

  // Wall ledger + side eaves beams + angled knee braces
  for (const sx of [-1, 1]) {
    const beam = box(0.14, 0.16, depth, materials.timber, { tile: TILE.wood, outline: 0.012 });
    beam.position.set(x + sx * (halfW - 0.16), y - 0.06, wallZ + depth / 2);
    add(beam);

    const corbel = box(0.14, 0.58, 0.16, materials.timberDark, { tile: TILE.wood, outline: 0.012 });
    corbel.position.set(x + sx * (halfW - 0.16), y - 0.38, wallZ + 0.08);
    add(corbel);

    add(
      beamBetween(
        [x + sx * (halfW - 0.16), y - 0.58, wallZ + 0.1],
        [x + sx * (halfW - 0.16), y - 0.08, wallZ + depth * 0.78],
        0.12,
        0.12,
        materials.timber,
      ),
    );
  }

  // Front tie beam + king post
  const tie = box(width - 0.12, 0.15, 0.14, materials.timber, { tile: TILE.wood, outline: 0.012 });
  tie.position.set(x, y - 0.04, frontZ - 0.12);
  add(tie);

  const king = box(0.14, rise - 0.06, 0.12, materials.timber, { tile: TILE.wood, outline: 0.012 });
  king.position.set(x, y + rise / 2 - 0.02, frontZ - 0.12);
  add(king);

  // Roof planes + 3D tiles
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
    seed: seed,
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
    segments: 8,
    outline: 0.01,
  });
  ridge.position.set(x, apexY + 0.03, (frontZ + backZ) / 2);
  add(ridge);

  for (const sx of [-1, 1]) {
    const board = box(slopeLen, 0.16, 0.09, materials.timber, { tile: TILE.wood, outline: 0.01 });
    board.position.set(x + sx * (halfW / 2), (y + apexY) / 2 - 0.08, frontZ + 0.01);
    board.rotation.z = -sx * angle;
    add(board);
  }
}

export function buildLanternUnit(add, materials, { x = 1.4, y = 2.6, z = 3.2 } = {}) {
  const arm = box(0.08, 0.08, 0.38, materials.iron, { outline: 0.008 });
  arm.position.set(x, y, z + 0.19);
  add(arm);

  const drop = box(0.05, 0.2, 0.05, materials.iron, { outline: 0.006 });
  drop.position.set(x, y - 0.16, z + 0.35);
  add(drop);

  const glow = box(0.16, 0.22, 0.16, materials.lampGlow, { outline: 0 });
  glow.position.set(x, y - 0.38, z + 0.35);
  add(glow);

  const base = box(0.22, 0.05, 0.22, materials.iron, { outline: 0.008 });
  base.position.set(x, y - 0.52, z + 0.35);
  add(base);

  const cap = box(0.24, 0.06, 0.24, materials.iron, { outline: 0.008 });
  cap.position.set(x, y - 0.25, z + 0.35);
  add(cap);
}

/* -------------------------------------------------------------------- props */

export function buildWoodenBarrel(materials, { r = 0.34, h = 0.82, openTop = false, water = false } = {}) {
  const g = new THREE.Group();
  const body = cyl(r * 0.88, h, materials.timberDark, {
    radiusTop: r * 0.88,
    segments: 12,
    outline: 0.012,
  });
  body.position.y = h / 2;
  g.add(body);

  // Bulged middle band of staves
  const belly = cyl(r, h * 0.58, materials.timber, {
    radiusTop: r,
    segments: 12,
    outline: 0.01,
  });
  belly.position.y = h / 2;
  g.add(belly);

  // Iron hoops
  for (const hy of [0.14, 0.34, 0.66, 0.86]) {
    const rad = hy > 0.25 && hy < 0.75 ? r * 1.01 : r * 0.91;
    const hoop = cyl(rad, 0.055, materials.iron, {
      radiusTop: rad,
      segments: 12,
      outline: 0.006,
    });
    hoop.position.y = h * hy;
    g.add(hoop);
  }

  if (openTop && water) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.85, 0.035, 8, 14), materials.timberDark);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = h;
    addOutline(rim, 0.008);
    g.add(rim);

    const waterDisc = cyl(r * 0.81, 0.04, materials.waterBlue, {
      segments: 12,
      outline: 0,
    });
    waterDisc.position.y = h - 0.06;
    g.add(waterDisc);
  }

  return g;
}

export function buildCabbageHead(materials, seed = 1) {
  const g = new THREE.Group();
  const rng = mulberry32(seed);
  // Outer dark green leaves (6 radial ruffled lobes)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng() * 0.25;
    const leaf = sphere(0.14, i % 2 === 0 ? materials.leafDark : materials.leafMid, {
      sx: 1.25,
      sy: 0.55,
      sz: 0.95,
      outline: 0.008,
    });
    leaf.position.set(Math.cos(a) * 0.11, 0.07, Math.sin(a) * 0.11);
    leaf.rotation.y = -a;
    leaf.rotation.z = 0.28;
    g.add(leaf);
  }
  // Middle green head
  const mid = sphere(0.14, materials.leafLight, { sx: 1.08, sy: 0.85, sz: 1.08, outline: 0.008 });
  mid.position.y = 0.11;
  g.add(mid);

  // Inner pale heart
  const core = sphere(0.095, materials.cabbageCore, { sx: 1.0, sy: 0.92, sz: 1.0, outline: 0.008 });
  core.position.y = 0.15;
  g.add(core);

  return g;
}

/* ------------------------------------------------------------------ merging */

export function mergeStatic(root, { outline = 0.018 } = {}) {
  root.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const meshes = [];

  // Identify any subtree marked `noMerge` (such as the rotating waterwheel)
  const isInsideNoMerge = (obj) => {
    let curr = obj;
    while (curr && curr !== root) {
      if (curr.userData?.noMerge) return true;
      curr = curr.parent;
    }
    return false;
  };

  root.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.userData.isOutline || isInsideNoMerge(obj)) return;
    if (Array.isArray(obj.material)) return;
    meshes.push(obj);
  });

  for (const mesh of meshes) {
    const local = new THREE.Matrix4().multiplyMatrices(invRoot, mesh.matrixWorld);
    let geo = mesh.geometry.clone();
    geo.applyMatrix4(local);
    if (geo.index) geo = geo.toNonIndexed();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    geo.clearGroups();

    const key = mesh.material.uuid;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: mesh.material, geos: [], meshes: [], cast: false, receive: false };
      buckets.set(key, bucket);
    }
    bucket.geos.push(geo);
    bucket.meshes.push(mesh);
    bucket.cast = bucket.cast || mesh.castShadow;
    bucket.receive = bucket.receive || mesh.receiveShadow;
  }

  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) continue;
    let merged = null;
    try {
      merged = mergeGeometries(bucket.geos, false);
    } catch (error) {
      console.warn('[houses] merge skipped for material', bucket.material.uuid, error);
    }
    if (!merged) continue;

    for (const mesh of bucket.meshes) mesh.parent?.remove(mesh);

    const mergedMesh = new THREE.Mesh(merged, bucket.material);
    mergedMesh.castShadow = bucket.cast;
    mergedMesh.receiveShadow = bucket.receive;
    mergedMesh.name = 'merged';
    const weight = bucket.material.userData?.outline ?? outline;
    if (weight > 0 && !bucket.material.userData?.noOutline) addOutline(mergedMesh, weight);
    root.add(mergedMesh);
  }

  return root;
}
