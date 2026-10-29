import * as THREE from 'three';
import { addOutline } from './materials.js';

/**
 * Cel-shaded environment for the cottage: grass ground, S-curved front path and
 * stone apron, fieldstone garden wall, three layered low-poly trees, flowering
 * bushes, worn ground detail, a garden rail fence, layered distant hill ridges
 * and cartoon clouds. Metres; ground at y = 0. Props stay clear of the house
 * (x ±5.8, z ±4.2) and its work area (x ±7.5, z ±6); only the path, apron and
 * the tiny plinth weeds sit inside. Seeded (mulberry32) for a stable layout.
 */

/* -------------------------------------------------------------- seeded random */

/** mulberry32 — tiny deterministic PRNG; no bare Math.random in this module. */
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

const SEED = 0x51ce5e3d;

/** Seeded helpers; the only source of variation in this module. */
function createRandom(seed) {
  const next = mulberry32(seed);
  const range = (min, max) => min + (max - min) * next();
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(next() * list.length))];
  return { next, range, pick, chance: (probability) => next() < probability };
}

/* -------------------------------------------------------------------- geometry */

/** One texture tile in metres (mirrors the sizes baked in textures.js). */
const TILE = { grass: 5.0, path: 2.4, stone: 2.4, wood: 1.4 };

/** A box translated into place; 1 uv unit = 1 texture tile. */
function boxPart(w, h, d, x, y, z, su, sv) {
  const geometry = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  geometry.translate(x, y, z);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geometry;
}

/** Merge box parts into one geometry — keeps the mesh count low. */
function mergeParts(parts) {
  const merged = { position: [], normal: [], uv: [] };
  for (const part of parts) {
    merged.position.push(...part.attributes.position.array);
    merged.normal.push(...part.attributes.normal.array);
    merged.uv.push(...part.attributes.uv.array);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(merged.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(merged.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(merged.uv, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

/** MeshToonMaterial ignores flatShading, so bake faceted normals into geometry. */
function flatten(geometry) {
  geometry.computeVertexNormals();
  return geometry;
}

/* ------------------------------------------------------------------ the ground */

function buildGround(materials) {
  const geometry = new THREE.PlaneGeometry(120, 120, 1, 1).rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  // planar top-down UVs, 5 m grass tile
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / TILE.grass, position.getZ(i) / TILE.grass);

  const ground = new THREE.Mesh(geometry, materials.grass);
  ground.name = 'ground';
  ground.receiveShadow = true;
  return ground;
}

/* ------------------------------------------------------------------------ path */

const PATH = { startZ: 5.2, length: 14.8, halfWidth: 1.1, amplitude: 2.0, y: 0.012, segments: 40 };

/** Centre line: a gentle S from the door to the field, flat at both ends. */
function pathCenter(t) {
  const envelope = 0.5 - 0.5 * Math.cos(Math.PI * 2 * t);
  return { x: PATH.amplitude * Math.sin(Math.PI * 2 * t) * envelope, z: PATH.startZ + PATH.length * t };
}

/** Ribbon swept along the centre line, with tile-accurate UVs. */
function buildPath(materials) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let travelled = 0;
  let previous = pathCenter(0);

  for (let i = 0; i <= PATH.segments; i++) {
    const t = i / PATH.segments;
    const point = pathCenter(t);
    travelled += Math.hypot(point.x - previous.x, point.z - previous.z);
    previous = point;

    // tangent from neighbours keeps the ends of the ribbon stable
    const before = pathCenter(Math.max(0, t - 0.001));
    const after = pathCenter(Math.min(1, t + 0.001));
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1;
    const nx = -(after.z - before.z) / length; // left normal in the XZ plane
    const nz = (after.x - before.x) / length;
    const half = PATH.halfWidth + Math.sin(i * 0.9) * 0.04; // slightly hand-cut edge

    positions.push(
      point.x + nx * half, PATH.y, point.z + nz * half,
      point.x - nx * half, PATH.y, point.z - nz * half,
    );
    uvs.push(0, travelled / TILE.path, (half * 2) / TILE.path, travelled / TILE.path);
    if (i < PATH.segments) {
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const path = new THREE.Mesh(geometry, materials.path);
  path.name = 'path';
  path.receiveShadow = true;
  return path;
}

/** Four chunky stone slabs forming the apron in front of the door. */
function buildApron(materials) {
  const parts = [];
  const [w, h, d] = [1.62, 0.07, 0.82];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      parts.push(boxPart(w, h, d, (col - 0.5) * 1.72, h / 2, PATH.startZ + 0.47 + row * 0.9, w / TILE.stone, d / TILE.stone));
    }
  }
  const apron = new THREE.Mesh(mergeParts(parts), materials.stone);
  apron.name = 'door-apron';
  apron.receiveShadow = true;
  return apron;
}

/* --------------------------------------------------------------- garden wall */

/** Low fieldstone wall: two staggered courses plus overhanging cap stones. */
function buildGardenWall(rng, materials) {
  const group = new THREE.Group();
  group.name = 'garden-wall';
  const z = 8.0;
  const courseHeight = 0.26;
  const depth = 0.42;

  const fillCourse = (parts, from, to, y) => {
    const count = Math.max(2, Math.round((to - from) / 0.85));
    const step = (to - from) / count;
    for (let i = 0; i < count; i++) {
      const width = step + 0.012;
      parts.push(boxPart(width, courseHeight, depth * rng.range(0.94, 1.04), from + step * (i + 0.5), y, z,
        width / TILE.stone, courseHeight / TILE.stone));
    }
  };

  for (const [from, to] of [[-7.0, -2.2], [2.2, 7.0]]) {
    const parts = [];
    fillCourse(parts, from, to, courseHeight * 0.5);
    fillCourse(parts, from + 0.42, to - 0.42, courseHeight * 1.5);

    // flat cap stones that overhang the courses a little
    const capCount = Math.max(3, Math.round((to - from + 0.1) / 0.9));
    const capStep = (to - from + 0.1) / capCount;
    for (let i = 0; i < capCount; i++) {
      const width = capStep + 0.02;
      parts.push(boxPart(width, 0.13, 0.54, from - 0.05 + capStep * (i + 0.5), 0.585, z,
        width / TILE.stone, 0.54 / TILE.stone));
    }

    const segment = new THREE.Mesh(mergeParts(parts), materials.stone);
    segment.name = 'wall-segment';
    segment.castShadow = segment.receiveShadow = true;
    addOutline(segment, 0.03);
    group.add(segment);
  }

  return group;
}

/* ---------------------------------------------------------------------- trees */

/** Low-poly tree: tapered bark trunk, a few branches, three canopy layers. */
function buildTree(rng, materials, x, z, scale) {
  const tree = new THREE.Group();
  tree.name = 'tree';
  tree.position.set(x, 0, z);
  tree.rotation.y = rng.range(0, Math.PI * 2);

  // visible taper: wide foot, slim crown
  const trunkHeight = rng.range(3.4, 4.1) * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17 * scale, 0.38 * scale, trunkHeight, 8, 2),
    materials.bark,
  );
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = trunk.receiveShadow = true;
  addOutline(trunk, 0.03);
  tree.add(trunk);

  // a few short branches poking out of the upper trunk
  const branches = 2 + (rng.chance(0.5) ? 1 : 0);
  for (let i = 0; i < branches; i++) {
    const length = rng.range(1.0, 1.7) * scale;
    const radius = rng.range(0.06, 0.09) * scale;
    const angle = (i / branches) * Math.PI * 2 + rng.range(-0.6, 0.6);
    const lean = rng.range(0.75, 1.15);
    const direction = new THREE.Vector3(
      Math.cos(angle) * Math.sin(lean), Math.cos(lean), Math.sin(angle) * Math.sin(lean),
    );
    const baseY = trunkHeight * rng.range(0.55, 0.82);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.45, radius, length, 5, 1), materials.bark);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    branch.position.set(direction.x * length * 0.5, baseY + direction.y * length * 0.5, direction.z * length * 0.5);
    branch.castShadow = true;
    addOutline(branch, 0.02);
    tree.add(branch);
  }

  // canopy: three stacked layers of varied, slightly squashed icosahedron clumps
  const layers = [
    { count: 3, radius: [1.35, 1.75], y: trunkHeight + 0.45, spread: [1.0, 1.6] },
    { count: 2, radius: [1.0, 1.4], y: trunkHeight + 1.45, spread: [0.55, 1.0] },
    { count: 2, radius: [0.7, 1.0], y: trunkHeight + 2.25, spread: [0.15, 0.5] },
  ];
  for (let layer = 0; layer < layers.length; layer++) {
    const { count, radius, y, spread } = layers[layer];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng.range(-0.5, 0.5) + layer * 0.8;
      const distance = rng.range(...spread) * scale;
      const size = rng.range(...radius) * scale;
      // small clumps use the chunky 20-face icosahedron, big ones the 80-face one
      const geometry = flatten(new THREE.IcosahedronGeometry(size, size < 0.95 * scale ? 0 : 1));
      const clump = new THREE.Mesh(geometry, rng.pick([materials.leafA, materials.leafB, materials.leafC]));
      clump.position.set(
        Math.cos(angle) * distance,
        y + rng.range(-0.18, 0.18) * scale,
        Math.sin(angle) * distance,
      );
      clump.scale.y = rng.range(0.72, 1.0);
      clump.rotation.set(rng.range(-0.35, 0.35), rng.range(0, Math.PI), rng.range(-0.35, 0.35));
      clump.castShadow = clump.receiveShadow = true;
      addOutline(clump, 0.024);
      tree.add(clump);
    }
  }

  // bare dirt ring under the canopy
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(rng.range(1.0, 1.35) * scale, 10), materials.dirt);
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.008;
  dirt.receiveShadow = true;
  tree.add(dirt);

  return tree;
}

/* --------------------------------------------------------------- bushes/flowers */

const FLOWER_GEOMETRY = new THREE.SphereGeometry(1, 6, 4);

/** Rounded bush of two or three blobs, optionally dotted with tiny flowers. */
function buildBush(rng, materials, x, z, size = 1, squash = 1) {
  const bush = new THREE.Group();
  bush.name = 'bush';
  bush.position.set(x, 0, z);
  bush.rotation.y = rng.range(0, Math.PI * 2);

  const blobs = 2 + (rng.chance(0.55) ? 1 : 0);
  const greens = [materials.bushA, materials.bushB];
  const blobMeshes = [];

  for (let i = 0; i < blobs; i++) {
    const radius = rng.range(0.36, 0.64) * size;
    const angle = (i / blobs) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const distance = i === 0 ? 0 : rng.range(0.35, 0.62) * size;
    const squashY = rng.range(0.78, 1.0) * squash;
    const cx = Math.cos(angle) * distance;
    const cz = Math.sin(angle) * distance;
    const cy = radius * squashY * rng.range(0.85, 1.0);

    const blob = new THREE.Mesh(flatten(new THREE.IcosahedronGeometry(radius, 1)), rng.pick(greens));
    blob.position.set(cx, cy, cz);
    blob.scale.set(rng.range(0.9, 1.12), squashY, rng.range(0.9, 1.12));
    blob.rotation.y = rng.range(0, Math.PI * 2);
    blob.castShadow = blob.receiveShadow = true;
    addOutline(blob, 0.022);
    bush.add(blob);
    blobMeshes.push(blob);
  }

  if (rng.chance(0.7)) {
    // raycast each dot onto a blob so flowers sit on the surface, never float
    bush.updateMatrixWorld(true);
    const petals = [materials.flowerWhite, materials.flowerPink, materials.flowerYellow, materials.flowerBlue];
    const dots = 5 + Math.floor(rng.next() * 3);
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();

    for (let i = 0; i < dots; i++) {
      const blob = rng.pick(blobMeshes);
      const azimuth = rng.range(0, Math.PI * 2);
      const lift = rng.range(0.2, 1);
      const horizontal = Math.sqrt(1 - lift * lift);
      direction.set(Math.cos(azimuth) * horizontal, lift, Math.sin(azimuth) * horizontal);
      blob.getWorldPosition(origin).addScaledVector(direction, 4);
      raycaster.set(origin, direction.clone().negate());
      const hit = raycaster.intersectObject(blob, false)[0];
      if (!hit) continue;
      const flower = new THREE.Mesh(FLOWER_GEOMETRY, rng.pick(petals));
      flower.position.copy(hit.point).addScaledVector(direction, 0.012);
      flower.position.copy(bush.worldToLocal(flower.position));
      flower.scale.setScalar(rng.range(0.05, 0.075) * size);
      bush.add(flower);
    }
  }

  return bush;
}

/* ---------------------------------------------------------------- ground detail */

/** Worn dirt, a few stones and tiny weeds: keeps the lawn from reading flat. */
function buildGroundDetails(rng, materials, root) {
  const group = new THREE.Group();
  group.name = 'ground-details';

  // irregular dirt patches hugging the path edges
  for (const z of [6.9, 8.4, 10.6, 12.4, 14.9, 17.2]) {
    const centre = pathCenter((z - PATH.startZ) / PATH.length);
    const side = rng.chance(0.5) ? 1 : -1;
    const rx = rng.range(0.45, 0.85);
    const rz = rng.range(0.35, 0.6);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1, 9), materials.dirt);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rng.range(0, Math.PI);
    patch.scale.set(rx, rz, 1);
    patch.position.set(centre.x + side * (PATH.halfWidth + 0.3 + rx * 0.8), 0.006, z);
    patch.receiveShadow = true;
    group.add(patch);
  }

  // small faceted stones, half sunk into the grass
  for (const [sx, sz] of [[-2.55, 7.3], [2.75, 8.9], [-2.3, 11.3], [2.6, 13.2], [3.9, 7.15], [-3.7, 14.4]]) {
    const radius = rng.range(0.11, 0.22);
    const stone = new THREE.Mesh(flatten(new THREE.IcosahedronGeometry(radius, 0)), materials.stone);
    stone.position.set(sx, radius * 0.4, sz);
    stone.scale.set(rng.range(0.9, 1.3), rng.range(0.6, 0.85), rng.range(0.9, 1.3));
    stone.rotation.y = rng.range(0, Math.PI * 2);
    stone.castShadow = stone.receiveShadow = true;
    group.add(stone);
  }

  // tiny grass tufts tucked against the plinth
  for (const [tx, tz] of [[-5.55, 4.5], [5.6, 4.45], [-6.2, 1.2]]) {
    for (let i = 0; i < 4; i++) {
      const height = rng.range(0.16, 0.3);
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, height, 4),
        rng.chance(0.5) ? materials.leafC : materials.leafB,
      );
      const angle = rng.range(0, Math.PI * 2);
      const lean = rng.range(0.12, 0.35);
      blade.position.set(tx + Math.cos(angle) * rng.range(0, 0.09), height * 0.5, tz + Math.sin(angle) * rng.range(0, 0.09));
      blade.rotation.set(Math.sin(angle) * lean, 0, -Math.cos(angle) * lean);
      blade.receiveShadow = true;
      group.add(blade);
    }
  }

  root.add(group);
}

/* ---------------------------------------------------------------------- fence */

/** Short timber rail fence along the front-right garden. */
function buildFence(materials) {
  const fence = new THREE.Group();
  fence.name = 'garden-fence';
  const x = 3.5;
  const startZ = 9.6;
  const spacing = 1.15;
  const posts = 4;

  for (let i = 0; i < posts; i++) {
    const post = new THREE.Mesh(boxPart(0.13, 1.0, 0.13, 0, 0, 0, 0.13 / TILE.wood, 1.0 / TILE.wood), materials.timber);
    post.position.set(x, 0.5, startZ + i * spacing);
    post.castShadow = post.receiveShadow = true;
    addOutline(post, 0.02);
    fence.add(post);
  }

  const span = spacing * (posts - 1);
  for (const height of [0.42, 0.78]) {
    const rail = new THREE.Mesh(boxPart(0.07, 0.1, span + 0.3, 0, 0, 0, (span + 0.3) / TILE.wood, 0.1 / TILE.wood), materials.timberDark);
    rail.position.set(x, height, startZ + span / 2);
    rail.castShadow = rail.receiveShadow = true;
    fence.add(rail);
  }

  return fence;
}

/* ---------------------------------------------------------------------- hills */

/** Layered distant ridges; the nearest carries a row of tree silhouettes. */
function buildHills(rng, materials, root) {
  const ridges = [
    { angle: 210, radius: 46, layers: [
      { material: materials.hillNear, lumps: 3, width: [14, 18], height: [12, 14], depth: [9, 12], push: 0 },
      { material: materials.hillMid, lumps: 2, width: [17, 21], height: [15, 18], depth: [11, 14], push: 5 },
    ] },
    { angle: 228, radius: 58, layers: [
      { material: materials.hillMid, lumps: 3, width: [18, 23], height: [16, 19], depth: [13, 16], push: 0 },
      { material: materials.hillFar, lumps: 2, width: [22, 27], height: [20, 24], depth: [15, 18], push: 5 },
    ] },
    { angle: 242, radius: 66, layers: [
      { material: materials.hillFar, lumps: 2, width: [26, 32], height: [24, 28], depth: [17, 20], push: 0 },
    ] },
  ];

  const crests = [];

  for (const [ridgeIndex, ridge] of ridges.entries()) {
    const group = new THREE.Group();
    group.name = 'hill-ridge';
    const angle = THREE.MathUtils.degToRad(ridge.angle);

    for (const layer of ridge.layers) {
      for (let i = 0; i < layer.lumps; i++) {
        const width = rng.range(...layer.width);
        const height = rng.range(...layer.height);
        const depth = rng.range(...layer.depth);
        const offset = (i - (layer.lumps - 1) / 2) * width * 0.62;
        const radius = ridge.radius + layer.push;
        const cx = Math.cos(angle) * radius - Math.sin(angle) * offset;
        const cz = Math.sin(angle) * radius + Math.cos(angle) * offset;

        const hill = new THREE.Mesh(flatten(new THREE.IcosahedronGeometry(1, 1)), layer.material);
        hill.scale.set(width, height, depth);
        // base sunk into the ground; long axis follows the ridge line
        hill.position.set(cx, -height * 0.28, cz);
        hill.rotation.y = -angle - Math.PI / 2 + rng.range(-0.15, 0.15);
        group.add(hill);

        if (ridgeIndex === 0 && layer === ridge.layers[0]) crests.push({ cx, cz, width, height, angle });
      }
    }

    root.add(group);
  }

  // little dark tree silhouettes dotted along the nearest crest
  for (let i = 0; i < 7; i++) {
    const crest = crests[i % crests.length];
    const offset = rng.range(-0.62, 0.62) * crest.width;
    const surface = -0.28 * crest.height + crest.height * Math.sqrt(Math.max(0, 1 - (offset / crest.width) ** 2));
    const height = rng.range(2.2, 3.6);
    const bump = new THREE.Mesh(
      new THREE.ConeGeometry(rng.range(0.7, 1.1), height, 5),
      rng.chance(0.3) ? materials.bushA : materials.leafC,
    );
    bump.position.set(
      crest.cx - Math.sin(crest.angle) * offset,
      surface - 0.6 + height / 2,
      crest.cz + Math.cos(crest.angle) * offset,
    );
    root.add(bump);
  }
}

/* --------------------------------------------------------------------- clouds */

/** Cartoon clouds: clusters of flattened spheres high above the valley. */
function buildClouds(rng, materials, root) {
  const puffGeometry = new THREE.SphereGeometry(1, 8, 6);
  const placements = [
    { angle: 196, radius: 36, y: 20 }, { angle: 238, radius: 50, y: 25 },
    { angle: 152, radius: 42, y: 22 }, { angle: 286, radius: 54, y: 28 },
  ];

  for (const spot of placements) {
    const cloud = new THREE.Group();
    cloud.name = 'cloud';
    const angle = THREE.MathUtils.degToRad(spot.angle);
    cloud.position.set(Math.cos(angle) * spot.radius, spot.y, Math.sin(angle) * spot.radius);
    cloud.rotation.y = rng.range(0, Math.PI * 2);

    const puffs = 4 + Math.floor(rng.next() * 3);
    for (let i = 0; i < puffs; i++) {
      const puff = new THREE.Mesh(puffGeometry, materials.cloud);
      puff.position.set((i - (puffs - 1) / 2) * rng.range(2.2, 4.2) * 0.9, rng.range(-0.5, 1.1), rng.range(-1.2, 1.2));
      puff.scale.set(rng.range(2.0, 3.4), rng.range(0.9, 1.5), rng.range(1.6, 2.6));
      cloud.add(puff);
    }

    root.add(cloud);
  }
}

/* ------------------------------------------------------------------- assembly */

/**
 * Build the whole environment.
 *
 * @param {object} materials shared cel materials from `createMaterials`
 * @param {object} textures  shared canvas textures (maps already live on the
 *                           materials; accepted for builder-signature parity)
 * @returns {THREE.Group} ground, path, props, hills and clouds in one group
 */
export function buildEnvironment(materials, textures) {
  const rng = createRandom(SEED);
  const root = new THREE.Group();
  root.name = 'environment';

  // ground and the route to the door
  root.add(buildGround(materials));
  root.add(buildPath(materials));
  root.add(buildApron(materials));
  root.add(buildGardenWall(rng, materials));

  // trees: left and back of the plot, clear of the hero view from +x/+z
  const trees = [[-11.9, 2.4, 1.1], [8.6, -9.8, 0.98], [-9.3, -9.8, 0.95]];
  for (const [x, z, scale] of trees) root.add(buildTree(rng, materials, x, z, scale));

  // bushes hug the plinth and path; small ones sit between the keep-out box
  // (z ±6) and the garden wall, the rest flank the path behind the wall.
  // last value squashes (flat) or stretches (tall) the bush silhouette
  const bushes = [
    [-8.9, 3.4, 1.0, 0.72], [9.0, 3.0, 1.0, 1.18], [-8.7, -1.8, 0.9, 0.88], [9.2, -5.0, 1.0, 1.22],
    [-4.6, 6.95, 0.68, 0.78], [4.5, 6.95, 0.68, 1.15],
    [-3.4, 9.5, 1.0, 0.92], [5.2, 9.7, 0.95, 1.05], [-8.5, -7.5, 1.0, 0.8],
  ];
  for (const [x, z, size, squash] of bushes) root.add(buildBush(rng, materials, x, z, size, squash));

  root.add(buildFence(materials));
  buildGroundDetails(rng, materials, root);
  buildHills(rng, materials, root);
  buildClouds(rng, materials, root);

  return root;
}
