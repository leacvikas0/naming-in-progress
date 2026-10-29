import * as THREE from 'three';
import {
  box,
  beamBetween,
  cyl,
  quad,
  makeWall,
  gableWall,
  windowUnit,
  doorUnit,
  quoinCorner,
  quoinPilaster,
  mergeStatic,
  TILE,
} from './parts.js';

/**
 * Red Roof House — a two-storey, cross-gabled medieval cottage.
 *
 * Plan (metres, +z is the front):
 *
 *        back  z=-4.2   +------------------+
 *                       |                  |
 *              side     |                  |   side
 *        x=-5.8         |                  |   x=+5.8
 *                       +------------------+  front z=+4.2
 *                          plinth 0.55, eaves 6.35, ridge 9.4
 *
 * Main ridge runs along X. Both side walls are gable ends. A cross-gable
 * (gablet) sits over the centre bay and its roof oversails the facade. A
 * dormer sits on the right front slope and the chimney rises beside the ridge.
 */

const W = 11.6;
const D = 8.4;
const T = 0.38;

const PLINTH = 0.55;
const EAVE = 6.35;
const RIDGE = 9.9;
const WALL_H = EAVE - PLINTH; // 5.8
const FLOOR = 3.55;
const BAY_HALF = 2.55;

const ROOF_EAVE_Y = 6.2;
const ROOF_EAVE_Z = 4.75;
const ROOF_HALF_X = 6.25;
const ROOF_RISE = RIDGE - ROOF_EAVE_Y;
const ROOF_SLOPE = Math.hypot(ROOF_RISE, ROOF_EAVE_Z);
const ROOF_ANGLE = Math.atan2(ROOF_RISE, ROOF_EAVE_Z);

const GABLE_HALF = 2.35;
const GABLE_WALL_Z = 4.21;
const GABLE_ROOF_HALF = 2.9;
const GABLE_ROOF_LEN = Math.hypot(GABLE_ROOF_HALF, ROOF_RISE);
const GABLE_ROOF_ANGLE = Math.atan2(ROOF_RISE, GABLE_ROOF_HALF);
const GABLE_ROOF_FRONT = 4.95;
const GABLE_ROOF_BACK = 0.05;

const DORMER_X = 3.3;
const DORMER_FRONT = 3.85;
const DORMER_BASE = 6.85;
const DORMER_EAVE = 7.85;
const DORMER_APEX = 8.85;
const DORMER_ROOF_HALF = 0.95;
const DORMER_ROOF_BACK = 0.8;
const DORMER_ROOF_FRONT = 4.15;

const WINDOW = {
  front: { w: 1.2, h: 1.6 },
  frontUpper: { w: 1.15, h: 1.5 },
  centre: { w: 1.3, h: 1.65, cols: 3 },
  side: { w: 1.15, h: 1.5 },
  back: { w: 1.15, h: 1.5 },
  dormer: { w: 0.72, h: 0.9, cols: 2, rows: 2, arch: false },
};

/* --------------------------------------------------------------- roof tiles */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let TILE_GEOMETRY = null;

/**
 * One clay tile: 0.32 x 0.20 m, with a thick rounded lip at the eave edge and
 * a thin top edge. Courses overlap by 0.03 m, so every row steps over the one
 * below and casts a real shadow line.
 */
function getTileGeometry() {
  if (TILE_GEOMETRY) return TILE_GEOMETRY;
  const w = 0.32;
  const l = 0.2;
  const tTop = 0.014;
  const tBot = 0.042;
  const r = 0.022;
  const hw = w / 2;

  // Side profile in (slope, thickness), counter-clockwise.
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
  // End caps.
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i + 1, i);
    indices.push(n, n + i, n + i + 1);
  }
  // Side faces.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, n + j, n + i);
    indices.push(i, j, n + j);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  // Bake flat, per-face normals: MeshToonMaterial ignores flatShading.
  TILE_GEOMETRY = geometry.toNonIndexed();
  TILE_GEOMETRY.computeVertexNormals();
  return TILE_GEOMETRY;
}

const TILE_VARIANTS = 6;
const tileBuckets = Array.from({ length: TILE_VARIANTS }, () => []);

/**
 * Lay real, thick clay tiles over one roof plane.
 * a and b are the eave corners, d is the ridge corner above a.
 * Tiles are bucketed into six flat cel colours; `finalizeRoofTiles` builds one
 * InstancedMesh per colour, which keeps the whole roof at six draw calls.
 */
function tileRoof({ a, b, d, width, length, seed = 1 }) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const D = new THREE.Vector3(...d);
  const u = new THREE.Vector3().subVectors(B, A).normalize();
  const v = new THREE.Vector3().subVectors(D, A).normalize();
  const n = new THREE.Vector3().crossVectors(u, v).normalize();
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));

  const tileW = 0.32;
  const tileL = 0.2;
  const step = 0.17; // 0.03 overlap with the course below
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
      pos.copy(A).addScaledVector(u, cu).addScaledVector(v, cv).addScaledVector(n, 0.002);
      matrix.compose(pos, quat, one);
      tileBuckets[Math.floor(rng() * TILE_VARIANTS)].push(matrix.clone());
    }
  }
}

function finalizeRoofTiles(add, materials) {
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

export function buildHouse(materials) {
  const house = new THREE.Group();
  const add = (object) => {
    house.add(object);
    return object;
  };
  const place = (object, x, y, z, rotY = 0) => {
    object.position.set(x, y, z);
    object.rotation.y = rotY;
    house.add(object);
    return object;
  };

  buildPlinth(add, materials);
  buildWalls(add, materials);
  buildWindows(place, materials);
  buildTimber(add, materials);
  buildGablet(add, materials);
  buildRoof(add, materials);
  buildDormer(place, add, materials);
  buildChimney(add, materials);
  buildDoorFurniture(add, materials);
  buildLantern(add, materials);
  finalizeRoofTiles(add, materials);

  mergeStatic(house, { outline: 0.018 });
  return house;
}

/* --------------------------------------------------------------- foundation */

function buildPlinth(add, materials) {
  const base = box(W + 0.36, PLINTH, D + 0.36, materials.stone, { tile: TILE.stone, outline: 0.02 });
  base.position.set(0, PLINTH / 2, 0);
  add(base);

  const cap = box(W + 0.5, 0.08, D + 0.5, materials.stoneTrim, { tile: TILE.stone, outline: 0.018 });
  cap.position.set(0, PLINTH + 0.04, 0);
  add(cap);

  // Quoins wrap the four corners; pilasters define the centre bay.
  const corners = [
    { x: -W / 2, z: D / 2, ox: -1, oz: 1 },
    { x: W / 2, z: D / 2, ox: 1, oz: 1 },
    { x: -W / 2, z: -D / 2, ox: -1, oz: -1 },
    { x: W / 2, z: -D / 2, ox: 1, oz: -1 },
  ];
  for (const corner of corners) {
    add(quoinCorner(materials, { ...corner, from: PLINTH, to: EAVE, course: 0.42 }));
  }
  for (const x of [-BAY_HALF, BAY_HALF]) {
    add(quoinPilaster(materials, { x, from: PLINTH, to: EAVE, z: D / 2, side: x < 0 ? -1 : 1 }));
  }
}

/* -------------------------------------------------------------------- walls */

function buildWalls(add, materials) {
  const frontHoles = [
    { x: 0, y: 0, w: 1.5, h: 2.7, arch: 0.75 },
    { x: -3.9, y: 0.75, w: WINDOW.front.w, h: WINDOW.front.h },
    { x: 3.9, y: 0.75, w: WINDOW.front.w, h: WINDOW.front.h },
    { x: 0, y: 3.4, w: WINDOW.centre.w, h: WINDOW.centre.h },
    { x: -3.9, y: 3.6, w: WINDOW.frontUpper.w, h: WINDOW.frontUpper.h },
    { x: 3.9, y: 3.6, w: WINDOW.frontUpper.w, h: WINDOW.frontUpper.h },
  ];
  const backHoles = [
    { x: 0, y: 0, w: 1.15, h: 2.35, arch: 0.575 },
    { x: -3.6, y: 0.75, w: WINDOW.back.w, h: WINDOW.back.h },
    { x: 3.6, y: 0.75, w: WINDOW.back.w, h: WINDOW.back.h },
    { x: 0, y: 3.6, w: WINDOW.back.w, h: WINDOW.back.h },
    { x: -3.6, y: 3.6, w: WINDOW.back.w, h: WINDOW.back.h },
    { x: 3.6, y: 3.6, w: WINDOW.back.w, h: WINDOW.back.h },
  ];
  const sideHoles = [
    { x: -1.9, y: 0.75, w: WINDOW.side.w, h: WINDOW.side.h },
    { x: 1.9, y: 0.75, w: WINDOW.side.w, h: WINDOW.side.h },
    { x: -1.9, y: 3.6, w: WINDOW.side.w, h: WINDOW.side.h },
    { x: 1.9, y: 3.6, w: WINDOW.side.w, h: WINDOW.side.h },
  ];

  const front = makeWall({ length: W, height: WALL_H, thickness: T, holes: frontHoles, material: materials.stucco });
  front.position.set(0, PLINTH, D / 2);
  add(front);

  const back = makeWall({ length: W, height: WALL_H, thickness: T, holes: backHoles, material: materials.stucco });
  back.position.set(0, PLINTH, -D / 2);
  back.rotation.y = Math.PI;
  add(back);

  const left = makeWall({
    length: D,
    height: WALL_H,
    gableRise: RIDGE - EAVE,
    thickness: T,
    holes: sideHoles,
    material: materials.stucco,
  });
  left.position.set(-W / 2, PLINTH, 0);
  left.rotation.y = -Math.PI / 2;
  add(left);

  const right = makeWall({
    length: D,
    height: WALL_H,
    gableRise: RIDGE - EAVE,
    thickness: T,
    holes: sideHoles,
    material: materials.stucco,
  });
  right.position.set(W / 2, PLINTH, 0);
  right.rotation.y = Math.PI / 2;
  add(right);
}

/* ------------------------------------------------------------------ windows */

function buildWindows(place, materials) {
  // Front elevation.
  place(windowUnit(materials, WINDOW.front), -3.9, 1.3, D / 2);
  place(windowUnit(materials, WINDOW.front), 3.9, 1.3, D / 2);
  place(windowUnit(materials, WINDOW.frontUpper), -3.9, 4.15, D / 2);
  place(windowUnit(materials, WINDOW.frontUpper), 3.9, 4.15, D / 2);
  place(windowUnit(materials, WINDOW.centre), 0, 3.95, D / 2);

  // Rear elevation.
  place(windowUnit(materials, WINDOW.back), -3.6, 1.3, -D / 2, Math.PI);
  place(windowUnit(materials, WINDOW.back), 3.6, 1.3, -D / 2, Math.PI);
  place(windowUnit(materials, WINDOW.back), 0, 4.15, -D / 2, Math.PI);
  place(windowUnit(materials, WINDOW.back), -3.6, 4.15, -D / 2, Math.PI);
  place(windowUnit(materials, WINDOW.back), 3.6, 4.15, -D / 2, Math.PI);
  place(doorUnit(materials, { w: 1.15, h: 2.35 }), 0, PLINTH, -D / 2, Math.PI);

  // Side elevations — two windows per floor, both sides.
  for (const z of [-1.9, 1.9]) {
    place(windowUnit(materials, WINDOW.side), -W / 2, 1.3, z, -Math.PI / 2);
    place(windowUnit(materials, WINDOW.side), -W / 2, 4.15, z, -Math.PI / 2);
    place(windowUnit(materials, WINDOW.side), W / 2, 1.3, z, Math.PI / 2);
    place(windowUnit(materials, WINDOW.side), W / 2, 4.15, z, Math.PI / 2);
  }

  // Dormer.
  place(windowUnit(materials, WINDOW.dormer), DORMER_X, 7.05, DORMER_FRONT);
}

/* -------------------------------------------------------------- timber frame */

function buildTimber(add, materials) {
  const wood = TILE.wood;
  const beam = (w, h, d, x, y, z, rot = 0) => {
    const m = box(w, h, d, materials.timber, { tile: wood, outline: 0.014 });
    m.position.set(x, y, z);
    m.rotation.z = rot;
    add(m);
    return m;
  };

  // Front and back: sill beam, floor beam, eave beam, corner posts and braces.
  for (const z of [D / 2 + 0.05, -D / 2 - 0.05]) {
    beam(W, 0.26, 0.12, 0, FLOOR, z);
    beam(W, 0.24, 0.12, 0, EAVE - 0.15, z);
    for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) {
      beam(0.26, WALL_H, 0.14, x, PLINTH + WALL_H / 2, z);
    }
    for (const sx of [-1, 1]) {
      add(
        beamBetween(
          [sx * (W / 2 - 0.2), 5.05, z + 0.02],
          [sx * (W / 2 - 1.2), EAVE - 0.24, z + 0.02],
          0.16,
          0.1,
          materials.timber,
        ),
      );
    }
  }

  // Side walls: rails, corner posts, mid post, gable king post and struts.
  for (const x of [-W / 2 - 0.06, W / 2 + 0.06]) {
    const rail = (h, y) => {
      const m = box(0.12, h, D, materials.timber, { tile: wood, outline: 0.014 });
      m.position.set(x, y, 0);
      add(m);
    };
    rail(0.26, FLOOR);
    rail(0.24, EAVE - 0.15);

    for (const z of [-D / 2 + 0.08, D / 2 - 0.08, 0]) {
      const post = box(0.14, WALL_H, 0.26, materials.timber, { tile: wood, outline: 0.014 });
      post.position.set(x, PLINTH + WALL_H / 2, z);
      add(post);
    }

    const king = box(0.16, 2.9, 0.2, materials.timber, { tile: wood, outline: 0.014 });
    king.position.set(x, 7.9, 0);
    add(king);

    for (const sz of [-1, 1]) {
      add(beamBetween([x, 7.1, 0], [x, 7.95, sz * 1.95], 0.14, 0.1, materials.timber));
    }
  }
}

/* --------------------------------------------------------------- cross gable */

function buildGablet(add, materials) {
  const apex = RIDGE;
  const eaveY = ROOF_EAVE_Y;
  const front = GABLE_ROOF_FRONT;
  const back = GABLE_ROOF_BACK;
  const mid = (apex + eaveY) / 2;

  // Triangular infill, inset from the roof edge so the roof oversails it.
  const gable = gableWall({
    width: GABLE_HALF * 2,
    rise: apex - 6.55,
    thickness: 0.2,
    material: materials.stucco,
  });
  gable.position.set(0, 6.55, GABLE_WALL_Z);
  add(gable);

  // Tie beam, king post and two struts.
  const tie = box(GABLE_HALF * 2 + 0.5, 0.26, 0.2, materials.timber, { tile: TILE.wood, outline: 0.016 });
  tie.position.set(0, 6.7, GABLE_WALL_Z + 0.16);
  add(tie);

  const kingHeight = apex - 6.7 - 0.06;
  const king = box(0.22, kingHeight, 0.16, materials.timber, { tile: TILE.wood, outline: 0.016 });
  king.position.set(0, 6.7 + kingHeight / 2, GABLE_WALL_Z + 0.16);
  add(king);

  for (const sx of [-1, 1]) {
    add(
      beamBetween(
        [0, 7.2, GABLE_WALL_Z + 0.16],
        [sx * 1.2, 8.2, GABLE_WALL_Z + 0.16],
        0.16,
        0.1,
        materials.timber,
      ),
    );
  }

  // Dark base planes for the oversailing gablet roof.
  add(
    quad(
      [0, apex, back],
      [0, apex, front],
      [GABLE_ROOF_HALF, eaveY, front],
      [GABLE_ROOF_HALF, eaveY, back],
      materials.roofBase,
      { outline: 0.02 },
    ),
  );
  add(
    quad(
      [0, apex, front],
      [0, apex, back],
      [-GABLE_ROOF_HALF, eaveY, back],
      [-GABLE_ROOF_HALF, eaveY, front],
      materials.roofBase,
      { outline: 0.02 },
    ),
  );

  // Real tiles on the gablet.
  tileRoof({
    a: [GABLE_ROOF_HALF, eaveY, front],
    b: [GABLE_ROOF_HALF, eaveY, back],
    d: [0, apex, front],
    width: front - back,
    length: GABLE_ROOF_LEN,
    seed: 21,
  });
  tileRoof({
    a: [-GABLE_ROOF_HALF, eaveY, back],
    b: [-GABLE_ROOF_HALF, eaveY, front],
    d: [0, apex, back],
    width: front - back,
    length: GABLE_ROOF_LEN,
    seed: 22,
  });

  // Soffit under the oversailing canopy.
  add(
    quad(
      [0, apex - 0.18, back],
      [GABLE_ROOF_HALF, eaveY - 0.18, back],
      [GABLE_ROOF_HALF, eaveY - 0.18, front],
      [0, apex - 0.18, front],
      materials.roofSoffit,
    ),
  );
  add(
    quad(
      [0, apex - 0.18, front],
      [-GABLE_ROOF_HALF, eaveY - 0.18, front],
      [-GABLE_ROOF_HALF, eaveY - 0.18, back],
      [0, apex - 0.18, back],
      materials.roofSoffit,
    ),
  );

  // Ridge cap.
  const ridge = cyl(0.14, front - back, materials.roofRidge, { axis: 'z', segments: 10, outline: 0.012 });
  ridge.position.set(0, apex + 0.05, (front + back) / 2);
  add(ridge);

  // Red verge caps + timber bargeboards along the sloped front edges.
  for (const sx of [-1, 1]) {
    const verge = box(GABLE_ROOF_LEN, 0.12, 0.32, materials.roofRidge, { outline: 0.01 });
    verge.position.set(sx * (GABLE_ROOF_HALF / 2), mid + 0.08, front + 0.05);
    verge.rotation.z = -sx * GABLE_ROOF_ANGLE;
    add(verge);

    const board = box(GABLE_ROOF_LEN, 0.26, 0.12, materials.timber, { tile: TILE.wood, outline: 0.012 });
    board.position.set(sx * (GABLE_ROOF_HALF / 2), mid - 0.16, front + 0.02);
    board.rotation.z = -sx * GABLE_ROOF_ANGLE;
    add(board);
  }

  const finial = box(0.4, 0.3, 0.34, materials.roofRidge, { outline: 0.012 });
  finial.position.set(0, apex + 0.12, front + 0.04);
  add(finial);
}

/* --------------------------------------------------------------------- roof */

function buildRoof(add, materials) {
  const halfX = ROOF_HALF_X;
  const eaveY = ROOF_EAVE_Y;
  const eaveZ = ROOF_EAVE_Z;

  // Dark base planes. The real tiles sit on top, so every gap between tiles
  // reads as a shadow line instead of a hole in the roof.
  add(
    quad(
      [-halfX, eaveY, eaveZ],
      [halfX, eaveY, eaveZ],
      [halfX, RIDGE, 0],
      [-halfX, RIDGE, 0],
      materials.roofBase,
      { outline: 0.02 },
    ),
  );
  add(
    quad(
      [-halfX, eaveY, -eaveZ],
      [-halfX, RIDGE, 0],
      [halfX, RIDGE, 0],
      [halfX, eaveY, -eaveZ],
      materials.roofBase,
      { outline: 0.02 },
    ),
  );

  // Real clay tiles, 0.32 x 0.18 m, staggered row by row.
  tileRoof({
    a: [-halfX, eaveY, eaveZ],
    b: [halfX, eaveY, eaveZ],
    d: [-halfX, RIDGE, 0],
    width: halfX * 2,
    length: ROOF_SLOPE,
    seed: 11,
  });
  tileRoof({
    a: [halfX, eaveY, -eaveZ],
    b: [-halfX, eaveY, -eaveZ],
    d: [halfX, RIDGE, 0],
    width: halfX * 2,
    length: ROOF_SLOPE,
    seed: 12,
  });

  // Soffits.
  add(
    quad(
      [-halfX, eaveY - 0.18, eaveZ],
      [-halfX, RIDGE - 0.18, 0],
      [halfX, RIDGE - 0.18, 0],
      [halfX, eaveY - 0.18, eaveZ],
      materials.roofSoffit,
    ),
  );
  add(
    quad(
      [-halfX, eaveY - 0.18, -eaveZ],
      [halfX, eaveY - 0.18, -eaveZ],
      [halfX, RIDGE - 0.18, 0],
      [-halfX, RIDGE - 0.18, 0],
      materials.roofSoffit,
    ),
  );

  // Ridge cap.
  const ridge = cyl(0.15, halfX * 2 + 0.2, materials.roofRidge, { axis: 'x', segments: 10, outline: 0.012 });
  ridge.position.set(0, RIDGE + 0.04, 0);
  add(ridge);

  // Eave fascias and rafter tails.
  for (const z of [eaveZ + 0.03, -eaveZ - 0.03]) {
    const fascia = box(halfX * 2 + 0.2, 0.24, 0.12, materials.timber, { tile: TILE.wood, outline: 0.014 });
    fascia.position.set(0, eaveY - 0.1, z);
    add(fascia);

    for (let x = -5.6; x <= 5.61; x += 0.8) {
      const rafter = box(0.1, 0.16, 0.62, materials.timberDark, { tile: TILE.wood, outline: 0.008 });
      rafter.position.set(x, eaveY - 0.06, Math.sign(z) * (eaveZ - 0.3));
      add(rafter);
    }
  }

  // Corner brackets under the eaves.
  for (const z of [D / 2 + 0.06, -D / 2 - 0.06]) {
    for (const sx of [-1, 1]) {
      add(
        beamBetween(
          [sx * (W / 2 - 0.25), 5.25, z],
          [sx * (W / 2 - 0.95), eaveY - 0.23, z],
          0.14,
          0.1,
          materials.timber,
        ),
      );
    }
  }

  // Bargeboards + red verge caps on the four gable-end roof edges.
  for (const x of [-halfX, halfX]) {
    const out = Math.sign(x);
    for (const sz of [1, -1]) {
      const board = box(0.12, 0.26, ROOF_SLOPE, materials.timber, { tile: TILE.wood, outline: 0.012 });
      board.position.set(x + out * 0.07, (eaveY + RIDGE) / 2 - 0.16, (sz * eaveZ) / 2);
      board.rotation.x = sz * ROOF_ANGLE;
      add(board);

      const verge = box(0.3, 0.12, ROOF_SLOPE, materials.roofRidge, { outline: 0.01 });
      verge.position.set(x, (eaveY + RIDGE) / 2 + 0.08, (sz * eaveZ) / 2);
      verge.rotation.x = sz * ROOF_ANGLE;
      add(verge);
    }
  }
}

/* ------------------------------------------------------------------- dormer */

function buildDormer(place, add, materials) {
  const width = 1.7;
  const eaveY = DORMER_BASE + 0.9;
  const apex = DORMER_APEX;
  const mid = (apex + eaveY) / 2;
  const angle = Math.atan2(apex - eaveY, DORMER_ROOF_HALF);
  const roofLen = Math.hypot(DORMER_ROOF_HALF, apex - eaveY);

  const front = makeWall({
    length: width,
    height: 0.9,
    gableRise: 1.05,
    thickness: 0.24,
    holes: [{ x: 0, y: 0.2, w: WINDOW.dormer.w, h: WINDOW.dormer.h }],
    material: materials.stucco,
    tile: TILE.stucco,
    outline: 0.018,
  });
  front.position.set(DORMER_X, DORMER_BASE, DORMER_FRONT);
  add(front);

  // Side cheeks stay below the mini roof so nothing pokes through the tiles.
  for (const sx of [-1, 1]) {
    const cheek = box(0.2, 0.78, 0.9, materials.stucco, { tile: TILE.stucco, outline: 0.014 });
    cheek.position.set(DORMER_X + sx * 0.82, DORMER_BASE + 0.39, 3.4);
    add(cheek);
  }

  // Roof base, extended back into the main slope.
  add(
    quad(
      [DORMER_X, apex, DORMER_ROOF_BACK],
      [DORMER_X, apex, DORMER_ROOF_FRONT],
      [DORMER_X + DORMER_ROOF_HALF, eaveY, DORMER_ROOF_FRONT],
      [DORMER_X + DORMER_ROOF_HALF, eaveY, DORMER_ROOF_BACK],
      materials.roofBase,
      { outline: 0.014 },
    ),
  );
  add(
    quad(
      [DORMER_X, apex, DORMER_ROOF_FRONT],
      [DORMER_X, apex, DORMER_ROOF_BACK],
      [DORMER_X - DORMER_ROOF_HALF, eaveY, DORMER_ROOF_BACK],
      [DORMER_X - DORMER_ROOF_HALF, eaveY, DORMER_ROOF_FRONT],
      materials.roofBase,
      { outline: 0.014 },
    ),
  );

  // Real tiles on the dormer.
  tileRoof({
    a: [DORMER_X + DORMER_ROOF_HALF, eaveY, DORMER_ROOF_FRONT],
    b: [DORMER_X + DORMER_ROOF_HALF, eaveY, DORMER_ROOF_BACK],
    d: [DORMER_X, apex, DORMER_ROOF_FRONT],
    width: DORMER_ROOF_FRONT - DORMER_ROOF_BACK,
    length: roofLen,
    seed: 31,
  });
  tileRoof({
    a: [DORMER_X - DORMER_ROOF_HALF, eaveY, DORMER_ROOF_BACK],
    b: [DORMER_X - DORMER_ROOF_HALF, eaveY, DORMER_ROOF_FRONT],
    d: [DORMER_X, apex, DORMER_ROOF_BACK],
    width: DORMER_ROOF_FRONT - DORMER_ROOF_BACK,
    length: roofLen,
    seed: 32,
  });

  const ridge = cyl(0.08, DORMER_ROOF_FRONT - DORMER_ROOF_BACK, materials.roofRidge, {
    axis: 'z',
    segments: 8,
    outline: 0.008,
  });
  ridge.position.set(DORMER_X, apex + 0.03, (DORMER_ROOF_FRONT + DORMER_ROOF_BACK) / 2);
  add(ridge);

  // Red verge caps + timber bargeboards.
  for (const sx of [-1, 1]) {
    const verge = box(roofLen, 0.1, 0.24, materials.roofRidge, { outline: 0.008 });
    verge.position.set(DORMER_X + sx * (DORMER_ROOF_HALF / 2), mid + 0.06, DORMER_ROOF_FRONT + 0.03);
    verge.rotation.z = -sx * angle;
    add(verge);

    const board = box(roofLen, 0.2, 0.1, materials.timber, { tile: TILE.wood, outline: 0.008 });
    board.position.set(DORMER_X + sx * (DORMER_ROOF_HALF / 2), mid - 0.12, DORMER_ROOF_FRONT + 0.01);
    board.rotation.z = -sx * angle;
    add(board);
  }

  place(windowUnit(materials, WINDOW.dormer), DORMER_X, 7.05, DORMER_FRONT);
}

/* ----------------------------------------------------------------- chimney */

function buildChimney(add, materials) {
  const stack = box(1.0, 4.2, 0.9, materials.stone, { tile: TILE.stone, outline: 0.02 });
  stack.position.set(4.75, 8.45, -0.7);
  add(stack);

  const band = box(1.1, 0.18, 1.0, materials.stoneTrim, { tile: TILE.stone, outline: 0.016 });
  band.position.set(4.75, 9.9, -0.7);
  add(band);

  const cap = box(1.24, 0.26, 1.14, materials.stoneTrim, { tile: TILE.stone, outline: 0.018 });
  cap.position.set(4.75, 10.55, -0.7);
  add(cap);

  const pot = box(0.82, 0.3, 0.72, materials.roofRidge, { outline: 0.014 });
  pot.position.set(4.75, 10.83, -0.7);
  add(pot);
}

/* ------------------------------------------------------------ door furniture */

function buildDoorFurniture(add, materials) {
  placeFrontDoor(add, materials);
}

function placeFrontDoor(add, materials) {
  // Front door sits in the centre bay; its stone surround is part of the unit.
  const door = doorUnit(materials, { w: 1.5, h: 2.7 });
  door.position.set(0, PLINTH, D / 2);
  add(door);

  // Two stone steps in front of the threshold.
  for (let i = 0; i < 2; i++) {
    const step = box(2.4 - i * 0.2, 0.16, 0.5 + i * 0.25, materials.stone, {
      tile: TILE.stone,
      outline: 0.014,
    });
    step.position.set(0, 0.08 + i * 0.16, D / 2 + 0.62 + i * 0.2);
    add(step);
  }
}

/* ------------------------------------------------------------------ lantern */

function buildLantern(add, materials) {
  const x = 1.62;
  const y = 2.72;

  const arm = box(0.08, 0.08, 0.42, materials.iron, { outline: 0.008 });
  arm.position.set(x, y, D / 2 + 0.2);
  add(arm);

  const drop = box(0.05, 0.22, 0.05, materials.iron, { outline: 0.006 });
  drop.position.set(x, y - 0.18, D / 2 + 0.4);
  add(drop);

  const glow = box(0.17, 0.24, 0.17, materials.lampGlow, { outline: 0 });
  glow.position.set(x, y - 0.42, D / 2 + 0.4);
  add(glow);

  const base = box(0.24, 0.06, 0.24, materials.iron, { outline: 0.008 });
  base.position.set(x, y - 0.57, D / 2 + 0.4);
  add(base);

  const cap = box(0.26, 0.06, 0.26, materials.iron, { outline: 0.008 });
  cap.position.set(x, y - 0.28, D / 2 + 0.4);
  add(cap);
}
