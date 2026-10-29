import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addOutline } from './materials.js';

/**
 * Reusable architectural pieces for the house.
 *
 * UV contract: every texture tile covers a known number of metres, and each
 * geometry scales its own UVs by that physical size. Materials therefore keep
 * `map.repeat = (1, 1)` and the texture density stays consistent everywhere.
 */

export const TILE = {
  roof: [2.4, 1.6],
  stucco: 2.5,
  stone: 2.4,
  wood: 1.4,
};

export function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

/** BoxGeometry UVs are 0..1 per face — rescale them to metres / tile. */
export function scaleBoxUV(geo, w, h, d, tile = 1) {
  const uv = geo.attributes.uv;
  const faces = [
    [d / tile, h / tile], // +x
    [d / tile, h / tile], // -x
    [w / tile, d / tile], // +y
    [w / tile, d / tile], // -y
    [w / tile, h / tile], // +z
    [w / tile, h / tile], // -z
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
  if (outline) addOutline(mesh, outline);
  return mesh;
}

export function cyl(radius, height, material, { segments = 12, outline = 0.014, axis = 'y' } = {}) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, segments);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  if (axis === 'z') geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (outline) addOutline(mesh, outline);
  return mesh;
}

/** Quad from four world-space corners, wound so the normal faces the viewer. */
export function quad(a, b, c, d, material, { uvs, outline = 0 } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c, ...d]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  const uv = uvs ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv.flat()), 2));
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (outline) addOutline(mesh, outline);
  return mesh;
}

/** A beam of length |b - a| running from a to b. */
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

/**
 * Extruded wall panel. Local space: x along the wall, y up from the wall base,
 * outer face at z = 0, thickness extruded to z = -thickness.
 * Holes are { x, y, w, h, arch } where `arch` is the radius of an arched top.
 */
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
    curveSegments: 24,
  });
  geo.translate(0, 0, -thickness);
  scaleUV(geo, 1 / tile, 1 / tile);

  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, outline);
  return mesh;
}

/** Simple triangular gable infill (local origin bottom-centre, facing +z). */
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

/* ------------------------------------------------------------------ windows */

function stoneJambs(group, { w, h, stone, count = 3 }) {
  for (const sx of [-1, 1]) {
    const bh = h / count;
    for (let i = 0; i < count; i++) {
      const block = box(0.26, bh - 0.014, 0.16, stone, { tile: TILE.stone, outline: 0.014 });
      block.position.set(sx * (w / 2 + 0.13), bh * (i + 0.5), 0.02);
      group.add(block);
    }
  }
}

function stoneArch(group, { w, h, stone }) {
  const count = 7;
  const radius = w / 2 + 0.3;
  const centerY = h - 0.55;
  for (let i = 0; i < count; i++) {
    const angle = THREE.MathUtils.lerp(
      THREE.MathUtils.degToRad(155),
      THREE.MathUtils.degToRad(25),
      i / (count - 1),
    );
    const block = box(0.3, 0.26, 0.16, stone, { tile: TILE.stone, outline: 0.014 });
    block.position.set(Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 0.02);
    block.rotation.z = angle - Math.PI / 2;
    group.add(block);
  }
}

function windowSill(group, { w, materials }) {
  const sill = box(w + 0.55, 0.12, 0.36, materials.timber, { tile: TILE.wood, outline: 0.014 });
  sill.position.set(0, -0.05, 0.06);
  group.add(sill);
  for (const sx of [-1, 1]) {
    const bracket = box(0.1, 0.2, 0.18, materials.timberDark, { tile: TILE.wood, outline: 0.01 });
    bracket.position.set(sx * (w / 2 - 0.08), -0.2, 0.03);
    group.add(bracket);
  }
}

/**
 * Window assembly. Local origin: bottom-centre of the opening, wall face at z=0,
 * outward = +z. The caller positions/rotates it on a wall.
 */
export function windowUnit(materials, {
  w = 1.2,
  h = 1.6,
  cols = 2,
  rows = 3,
  sill = true,
  arch = true,
  frame = materials.timber,
  stone = materials.stoneTrim,
  glass = materials.glass,
} = {}) {
  const group = new THREE.Group();

  // Timber lining hides the stucco cut faces inside the wall thickness.
  const lining = (lw, lh, x, y) => {
    const bar = box(lw, lh, 0.22, materials.timberDark, { tile: TILE.wood, outline: 0.01 });
    bar.position.set(x, y, -0.11);
    group.add(bar);
  };
  lining(0.06, h, -w / 2 + 0.03, h / 2);
  lining(0.06, h, w / 2 - 0.03, h / 2);
  lining(w, 0.06, 0, h - 0.03);
  lining(w, 0.06, 0, 0.03);

  // Opaque painted glass, recessed behind the frame.
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), glass);
  pane.position.set(0, h / 2, -0.22);
  group.add(pane);

  const bar = (bw, bh, x, y) => {
    const m = box(bw, bh, 0.09, frame, { tile: TILE.wood, outline: 0.012 });
    m.position.set(x, y, -0.165);
    group.add(m);
  };
  const f = 0.085;
  bar(w, f, 0, f / 2);
  bar(w, f, 0, h - f / 2);
  bar(f, h, -w / 2 + f / 2, h / 2);
  bar(f, h, w / 2 - f / 2, h / 2);
  for (let c = 1; c < cols; c++) bar(0.055, h, -w / 2 + (w / cols) * c, h / 2);
  for (let r = 1; r < rows; r++) bar(w, 0.055, 0, (h / rows) * r);

  stoneJambs(group, { w, h, stone });
  if (arch) stoneArch(group, { w, h, stone });
  if (sill) windowSill(group, { w, materials });

  return group;
}

/* --------------------------------------------------------------------- door */

export function doorUnit(materials, { w = 1.5, h = 2.7, arched = true } = {}) {
  const group = new THREE.Group();
  const r = arched ? w / 2 : 0;
  const rectH = h - r;

  // Stone jambs.
  const jambCount = 3;
  for (const sx of [-1, 1]) {
    const bh = rectH / jambCount;
    for (let i = 0; i < jambCount; i++) {
      const block = box(0.3, bh - 0.014, 0.34, materials.stoneTrim, { tile: TILE.stone, outline: 0.016 });
      block.position.set(sx * (w / 2 + 0.15), bh * (i + 0.5), 0.05);
      group.add(block);
    }
  }

  // Semicircular voussoir arch.
  if (arched) {
    const count = 13;
    const radius = w / 2 + 0.17;
    for (let i = 0; i < count; i++) {
      const angle = THREE.MathUtils.lerp(Math.PI * 0.99, Math.PI * 0.01, i / (count - 1));
      const block = box(0.22, 0.34, 0.32, materials.stoneTrim, { tile: TILE.stone, outline: 0.014 });
      block.position.set(Math.cos(angle) * radius, rectH + Math.sin(angle) * radius, 0.04);
      block.rotation.z = angle - Math.PI / 2;
      group.add(block);
    }
  }

  // Stone threshold.
  const threshold = box(w + 0.5, 0.16, 0.55, materials.stoneTrim, { tile: TILE.stone, outline: 0.016 });
  threshold.position.set(0, -0.08, 0.2);
  group.add(threshold);

  // Arched plank door leaf.
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, rectH);
  if (arched) shape.absarc(0, rectH, r, 0, Math.PI, false);
  else shape.lineTo(-w / 2, rectH);
  shape.lineTo(-w / 2, 0);

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 24 });
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

  // Iron straps with rivets.
  const strap = (y) => {
    const band = box(w - 0.16, 0.09, 0.035, materials.iron, { tile: 1, outline: 0.008 });
    band.position.set(0, y, -0.045);
    group.add(band);
    for (let i = 0; i < 5; i++) {
      const rivet = cyl(0.017, 0.03, materials.iron, { segments: 6, outline: 0, axis: 'z' });
      rivet.position.set(-w / 2 + 0.18 + i * ((w - 0.36) / 4), y, -0.04);
      group.add(rivet);
    }
  };
  strap(rectH * 0.86);
  strap(0.38);

  // Ring handle + keyhole escutcheon.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 8, 18), materials.iron);
  ring.position.set(-0.3, 1.45, -0.03);
  ring.castShadow = true;
  addOutline(ring, 0.008);
  group.add(ring);
  const mount = box(0.1, 0.13, 0.03, materials.iron, { outline: 0.008 });
  mount.position.set(-0.3, 1.58, -0.045);
  group.add(mount);

  const plate = box(0.13, 0.22, 0.025, materials.iron, { outline: 0.008 });
  plate.position.set(0.33, 1.2, -0.048);
  group.add(plate);
  const keyhole = box(0.035, 0.08, 0.012, materials.interior, { outline: 0 });
  keyhole.position.set(0.33, 1.21, -0.032);
  group.add(keyhole);

  return group;
}

/* ------------------------------------------------------------------- stone */

/** Staggered corner quoins. (ox, oz) is the outward normal of the corner. */
export function quoinCorner(materials, { x, z, ox, oz, from, to, course = 0.42 }) {
  const group = new THREE.Group();
  const count = Math.floor((to - from) / course);
  for (let i = 0; i < count; i++) {
    const y = from + course * (i + 0.5);
    const even = i % 2 === 0;
    const block = even
      ? box(0.64, course - 0.02, 0.34, materials.stone, { tile: TILE.stone, outline: 0.016 })
      : box(0.34, course - 0.02, 0.64, materials.stone, { tile: TILE.stone, outline: 0.016 });
    block.position.set(
      x - ox * (even ? 0.32 : 0.15),
      y,
      z - oz * (even ? 0.15 : 0.32),
    );
    group.add(block);
  }
  return group;
}

/** Alternating stone blocks that read as quoins on a flat facade. */
export function quoinPilaster(materials, { x, from, to, z, side = 1, course = 0.42 }) {
  const group = new THREE.Group();
  const count = Math.floor((to - from) / course);
  for (let i = 0; i < count; i++) {
    const y = from + course * (i + 0.5);
    const even = i % 2 === 0;
    const block = box(even ? 0.62 : 0.4, course - 0.02, even ? 0.32 : 0.42, materials.stone, {
      tile: TILE.stone,
      outline: 0.016,
    });
    block.position.set(x - side * (even ? 0.31 : 0.2), y, z - 0.13);
    group.add(block);
  }
  return group;
}

/* ------------------------------------------------------------------ merging */

/**
 * Collapse a built group into one mesh per material. Keeps draw calls low and
 * lets a single inverted-hull outline cover each material. Meshes with material
 * arrays or `userData.noMerge` are left alone.
 */
export function mergeStatic(root, { outline = 0.018 } = {}) {
  root.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const meshes = [];

  root.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.userData.isOutline || obj.userData.noMerge) return;
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
      console.warn('[house] merge skipped for material', bucket.material.uuid, error);
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
