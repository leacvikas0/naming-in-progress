import * as THREE from "three";

// Sunpetal Vale scenery helper.
//
// This is a private world helper, imported only by world.js. It is the single
// documented exception to the "a module may not import another game module"
// rule in CONTRACT.md: it is not a gameplay peer (no events, no player, no
// enemies), it consumes only already-loaded templates, and it owns no state the
// world API exposes.
//
// Everything repeated is batched with InstancedMesh by geometry+material, split
// into a few spatial cells so offscreen ground cover can be frustum-culled.
// Sway is a vertex-shader offset driven by one shared time uniform, so the
// per-frame CPU cost is a single float write.

const TAU = Math.PI * 2;
const CELL = 48;
const START = { x: 0, z: 6 };
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const TREE_SPECIES = [
  { key: "treeSmall1", min: 1.2, max: 1.9, weight: 14 },
  { key: "treeSmall2", min: 1.4, max: 2.2, weight: 10 },
  { key: "treeBroad1", min: 1.1, max: 1.7, weight: 24 },
  { key: "treeBroad2", min: 1.15, max: 1.65, weight: 22 },
  { key: "treeRound1", min: 1.0, max: 1.5, weight: 20 },
  { key: "treeRound2", min: 0.95, max: 1.15, weight: 8 },
];

const SHRUB_SPECIES = [
  { key: "bush1", min: 0.8, max: 1.5, weight: 28 },
  { key: "bush2", min: 0.9, max: 1.7, weight: 28 },
  { key: "bush3", min: 0.9, max: 1.8, weight: 24 },
  { key: "fern", min: 0.28, max: 0.5, weight: 20 },
];

const FLOWER_SPECIES = [
  { key: "flowerPink", min: 0.16, max: 0.3, weight: 44 },
  { key: "flowerCream", min: 0.14, max: 0.26, weight: 32 },
  { key: "clover", min: 0.3, max: 0.55, weight: 24 },
];

const GRASS_SPECIES = [
  { key: "grass1", weight: 55 },
  { key: "grass2", weight: 45 },
];

const ROCK_SPECIES = [
  { key: "rock1", weight: 40 },
  { key: "rock2", weight: 34 },
  { key: "rock3", weight: 26 },
];

function pickWeighted(rng, entries) {
  const total = entries.reduce((a, e) => a + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

function cellKey(x, z) {
  return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
}

export function createScenery(options = {}) {
  const {
    palette = {},
    config = {},
    rng = Math.random,
    templates = {},
    bounds = { minX: -46, maxX: 46, minZ: -46, maxZ: 46 },
    pathDistance = () => 999,
    groundHeight = () => 0,
  } = options;

  const group = new THREE.Group();
  group.name = "valeScenery";

  const swayTime = { value: 0 };
  const colliders = [];
  const stats = { trees: 0, shrubs: 0, grassClumps: 0, flowerClumps: 0, batches: 0, instances: 0 };

  /* ---------------- geometry extraction ---------------- */

  // A loaded glTF root can contain several meshes (trunk + canopy, leaves +
  // flowers). Batch each mesh separately, preserving its transform relative to
  // the template root so the assembled silhouette is identical.
  const partCache = new Map();
  function partsOf(key) {
    if (partCache.has(key)) return partCache.get(key);
    const root = templates[key];
    if (!root) {
      partCache.set(key, []);
      return [];
    }
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const parts = [];
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!material) return;
      parts.push({
        geometry: obj.geometry,
        material,
        matrix: new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld),
      });
    });
    partCache.set(key, parts);
    return parts;
  }

  /* ---------------- shader sway ---------------- */

  // One uniform object shared by every swaying material; update() writes it once.
  // Amplitude is in local units per unit of geometry height, so a 10 m tree top
  // moves more than a 0.3 m grass blade.
  const swayCache = new WeakMap();
  function swayedMaterial(base, amplitude) {
    let byAmp = swayCache.get(base);
    if (!byAmp) {
      byAmp = new Map();
      swayCache.set(base, byAmp);
    }
    if (byAmp.has(amplitude)) return byAmp.get(amplitude);
    const mat = base.clone();
    const amp = amplitude.toFixed(4);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSwayTime = swayTime;
      shader.vertexShader =
        "uniform float uSwayTime;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float swayPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
            float swayH = max(transformed.y, 0.0);
            float swayAmp = ${amp} * swayH;
            transformed.x += sin(uSwayTime * 1.15 + swayPhase) * swayAmp;
            transformed.z += cos(uSwayTime * 0.93 + swayPhase * 1.3) * swayAmp * 0.6;
          #endif`
        );
    };
    mat.customProgramCacheKey = () => `vale-sway-${amp}`;
    byAmp.set(amplitude, mat);
    return mat;
  }

  /* ---------------- instanced batching ---------------- */

  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const partMat = new THREE.Matrix4();

  // placements: { x, z, scale, rotY, y, tint: [r,g,b] }
  function buildSpecies(key, placements, opts = {}) {
    if (!placements.length) return;
    const parts = partsOf(key);
    if (!parts.length) return;

    const cells = new Map();
    for (const p of placements) {
      const k = cellKey(p.x, p.z);
      let list = cells.get(k);
      if (!list) cells.set(k, (list = []));
      list.push(p);
    }

    for (const part of parts) {
      const material = opts.sway ? swayedMaterial(part.material, opts.sway) : part.material;
      for (const list of cells.values()) {
        const mesh = new THREE.InstancedMesh(part.geometry, material, list.length);
        mesh.name = `${key}:${part.material.name || "mat"}`;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          tmpPos.set(p.x, p.y + (p.y === 0 ? 0 : 0), p.z);
          tmpQuat.setFromAxisAngle(Y_AXIS, p.rotY);
          tmpScale.setScalar(p.scale);
          tmpMat.compose(tmpPos, tmpQuat, tmpScale);
          tmpMat.multiply(part.matrix);
          mesh.setMatrixAt(i, tmpMat);
          if (p.tint) {
            tmpColor.setRGB(p.tint[0], p.tint[1], p.tint[2]);
            mesh.setColorAt(i, tmpColor);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        group.add(mesh);
        stats.batches += 1;
        stats.instances += list.length;
      }
    }
  }

  /* ---------------- placement helpers ---------------- */

  const clearings = [
    { x: 0, z: 0, r: 21 },        // Sunpetal Meadow combat clearing
    { x: 0, z: -31, r: 12 },      // Wishing Arch shrine
    { x: -31, z: -4, r: 10 },     // lakeside overlook
    { x: 29, z: 17, r: 11 },      // traveller's rest
    { x: -23, z: 22, r: 9 },      // Petal Walk
  ];

  function clearingDistance(x, z) {
    let best = Infinity;
    for (const c of clearings) {
      const d = Math.hypot(x - c.x, z - c.z) - c.r;
      if (d < best) best = d;
    }
    const ds = Math.hypot(x - START.x, z - START.z) - 4;
    return Math.min(best, ds);
  }

  const lake = config.lake || { minX: -75, maxX: -48, minZ: -25, maxZ: 18 };
  function inLake(x, z, pad = 0) {
    return (
      x > lake.minX - pad && x < lake.maxX + pad &&
      z > lake.minZ - pad && z < lake.maxZ + pad
    );
  }

  function insideBounds(x, z, pad = 0) {
    return (
      x > bounds.minX - pad && x < bounds.maxX + pad &&
      z > bounds.minZ - pad && z < bounds.maxZ + pad
    );
  }

  function treeAccept(x, z) {
    if (inLake(x, z, 6)) return false;
    if (clearingDistance(x, z) < 2.5) return false;
    if (pathDistance(x, z) < 5.2) return false;
    return true;
  }

  /* ---------------- trees ---------------- */

  const treeLists = new Map();
  function addTree(key, x, z, scale, rotY, tint) {
    let list = treeLists.get(key);
    if (!list) treeLists.set(key, (list = []));
    list.push({ x, z, y: groundHeight(x, z), scale, rotY, tint });
    stats.trees += 1;
    if (insideBounds(x, z, -1.5) && pathDistance(x, z) > 4.5) {
      colliders.push({ x, z, radius: Math.max(0.45, 0.5 * scale) });
    }
  }

  function treeTint() {
    return [
      0.92 + rng() * 0.16,
      0.94 + rng() * 0.12,
      0.92 + rng() * 0.14,
    ];
  }

  function plantCluster(cx, cz, count, spread, species, scaleMin, scaleMax) {
    for (let i = 0; i < count; i++) {
      const a = rng() * TAU;
      const r = Math.sqrt(rng()) * spread;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (!treeAccept(x, z)) continue;
      const s = scaleMin + rng() * (scaleMax - scaleMin);
      addTree(species.key, x, z, s, rng() * TAU, treeTint());
    }
  }

  // 1. Feature trees: the composition anchors named in MAP-DESIGN.md.
  addTree("treeRound2", 0, -38.5, 1.1, 0.4, treeTint());      // old spreading tree behind the arch
  addTree("treeBroad2", -9.5, -36.5, 1.3, 1.2, treeTint());
  addTree("treeBroad2", 10.5, -36.0, 1.25, 2.4, treeTint());
  addTree("treeBroad1", -41.5, -9.5, 1.45, 0.8, treeTint());  // overlook tree leaning to the lake
  addTree("treeRound1", 39.5, 23.0, 1.5, 3.1, treeTint());    // camp shade
  addTree("treeBroad1", -29.0, 27.5, 1.35, 1.7, treeTint());  // petal walk pair
  addTree("treeRound1", -17.0, 28.5, 1.2, 0.2, treeTint());

  // 2. Backdrop ring: clustered silhouettes beyond the bounds, the distant woods.
  for (let c = 0; c < 10; c++) {
    const angle = (c / 10) * TAU + rng() * 0.35;
    const radius = 56 + rng() * 26;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const species = pickWeighted(rng, TREE_SPECIES);
    plantCluster(cx, cz, 3 + Math.floor(rng() * 4), 5.5, species, species.min * 1.05, species.max * 1.1);
  }

  // 3. Perimeter belt: framing right at the walkable edge so the clamp reads as
  //    a scenic verge, not a wall. Clustered with gaps.
  for (let c = 0; c < 9; c++) {
    const angle = (c / 9) * TAU + 0.22 + rng() * 0.3;
    const radius = 47 + rng() * 7;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const species = pickWeighted(rng, TREE_SPECIES);
    plantCluster(cx, cz, 3 + Math.floor(rng() * 3), 4.0, species, species.min, species.max);
  }

  // 4. Interior pockets: a few clusters inside the rectangle near the edges,
  //    found by deterministic rejection sampling against paths and clearings.
  let pockets = 0;
  for (let attempt = 0; attempt < 4000 && pockets < 17; attempt++) {
    const x = bounds.minX + rng() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);
    const edge = Math.min(
      x - bounds.minX, bounds.maxX - x,
      z - bounds.minZ, bounds.maxZ - z
    );
    if (edge > 13 || edge < 1) continue;
    if (clearingDistance(x, z) < 3) continue;
    if (pathDistance(x, z) < 6) continue;
    if (inLake(x, z, 4)) continue;
    const species = pickWeighted(rng, TREE_SPECIES);
    addTree(species.key, x, z, species.min + rng() * (species.max - species.min), rng() * TAU, treeTint());
    pockets += 1;
  }

  for (const [key, list] of treeLists) buildSpecies(key, list, { sway: 0.011 });

  /* ---------------- shrubs and ferns ---------------- */

  const shrubLists = new Map();
  function addShrub(key, x, z, scale, rotY, tint) {
    let list = shrubLists.get(key);
    if (!list) shrubLists.set(key, (list = []));
    list.push({ x, z, y: 0, scale, rotY, tint });
    stats.shrubs += 1;
  }

  const targetShrubs = config.shrubClusters ?? 190;
  let shrubs = 0;
  for (let attempt = 0; attempt < 14000 && shrubs < targetShrubs; attempt++) {
    const x = bounds.minX - 8 + rng() * (bounds.maxX - bounds.minX + 16);
    const z = bounds.minZ - 8 + rng() * (bounds.maxZ - bounds.minZ + 16);
    if (inLake(x, z, 1.5)) continue;
    if (Math.hypot(x - START.x, z - START.z) < 4) continue;
    const pd = pathDistance(x, z);
    if (pd < 2.2) continue;
    const edge = clearingDistance(x, z);
    const shoulder = pd < 8;
    const edgeRing = edge > -0.5 && edge < 7;
    const perimeter = Math.max(Math.abs(x), Math.abs(z)) > 33;
    if (!(shoulder || edgeRing || perimeter)) continue;
    if (!shoulder && !edgeRing && rng() > 0.55) continue;
    const species = pickWeighted(rng, SHRUB_SPECIES);
    const s = species.min + rng() * (species.max - species.min);
    addShrub(species.key, x, z, s, rng() * TAU, [0.9 + rng() * 0.2, 0.92 + rng() * 0.16, 0.88 + rng() * 0.2]);
    shrubs += 1;
  }
  for (const [key, list] of shrubLists) buildSpecies(key, list, { sway: 0.02 });

  /* ---------------- grass and flowers ---------------- */

  const grassLists = new Map();
  function addGrass(key, x, z, scale, rotY, tint) {
    let list = grassLists.get(key);
    if (!list) grassLists.set(key, (list = []));
    list.push({ x, z, y: 0, scale, rotY, tint });
    stats.grassClumps += 1;
  }

  const targetGrass = config.grassClumps ?? 1400;
  let grass = 0;
  for (let attempt = 0; attempt < 40000 && grass < targetGrass; attempt++) {
    const x = bounds.minX - 6 + rng() * (bounds.maxX - bounds.minX + 12);
    const z = bounds.minZ - 6 + rng() * (bounds.maxZ - bounds.minZ + 12);
    if (inLake(x, z, 1)) continue;
    if (Math.hypot(x - START.x, z - START.z) < 2.5) continue;
    const pd = pathDistance(x, z);
    if (pd < 1.4) continue; // path centres stay almost bare
    const species = pickWeighted(rng, GRASS_SPECIES);
    // Combat meadow keeps grass low; shoulders and verges may be taller.
    const inMeadow = clearingDistance(x, z) < 0;
    const maxH = inMeadow ? (config.meadowGrassMax ?? 0.35) : 0.95;
    const baseH = species.key === "grass2" ? 0.92 : 0.54;
    const height = (inMeadow ? 0.22 : 0.35) + rng() * (maxH - (inMeadow ? 0.22 : 0.35));
    addGrass(species.key, x, z, height / baseH, rng() * TAU, [
      0.88 + rng() * 0.22,
      0.92 + rng() * 0.16,
      0.85 + rng() * 0.2,
    ]);
    grass += 1;
  }
  for (const [key, list] of grassLists) buildSpecies(key, list, { sway: 0.09 });

  const flowerLists = new Map();
  function addFlower(key, x, z, scale, rotY, tint) {
    let list = flowerLists.get(key);
    if (!list) flowerLists.set(key, (list = []));
    list.push({ x, z, y: 0, scale, rotY, tint });
    stats.flowerClumps += 1;
  }

  const targetFlowers = config.flowerClumps ?? 320;
  let flowers = 0;
  for (let attempt = 0; attempt < 22000 && flowers < targetFlowers; attempt++) {
    const x = bounds.minX - 4 + rng() * (bounds.maxX - bounds.minX + 8);
    const z = bounds.minZ - 4 + rng() * (bounds.maxZ - bounds.minZ + 8);
    if (inLake(x, z, 1)) continue;
    if (Math.hypot(x - START.x, z - START.z) < 3) continue;
    const pd = pathDistance(x, z);
    if (pd < 2.0) continue;
    const petalWalk = Math.hypot(x + 23, z - 22) < 10;
    const camp = Math.hypot(x - 29, z - 17) < 12;
    if (!(pd < 9 || petalWalk || camp)) continue;
    if (!petalWalk && !camp && rng() > 0.42) continue;
    const species = pickWeighted(rng, FLOWER_SPECIES);
    const s = species.min + rng() * (species.max - species.min);
    addFlower(species.key, x, z, s, rng() * TAU, [1, 1, 1]);
    flowers += 1;
  }
  for (const [key, list] of flowerLists) buildSpecies(key, list, { sway: 0.06 });

  /* ---------------- rocks and shoreline ---------------- */

  const rockLists = new Map();
  function addRock(key, x, z, scale, rotY) {
    let list = rockLists.get(key);
    if (!list) rockLists.set(key, (list = []));
    list.push({ x, z, y: 0, scale, rotY, tint: null });
  }

  // Perimeter rock shoulders, clustered, mostly outside the walkable rectangle.
  for (let c = 0; c < 12; c++) {
    const angle = (c / 12) * TAU + rng() * 0.4;
    const radius = 47 + rng() * 6;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const count = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const x = cx + (rng() - 0.5) * 7;
      const z = cz + (rng() - 0.5) * 7;
      if (inLake(x, z, 2)) continue;
      const species = pickWeighted(rng, ROCK_SPECIES);
      addRock(species.key, x, z, 0.9 + rng() * 1.8, rng() * TAU);
    }
  }

  // Scalloped lake shore: rocks plus reed tufts along the near bank.
  const shoreCount = 34;
  for (let i = 0; i < shoreCount; i++) {
    const t = i / shoreCount;
    const z = lake.minZ - 1.5 + t * (lake.maxZ - lake.minZ + 3) + (rng() - 0.5) * 1.2;
    const x = lake.maxX + 0.9 + Math.sin(t * 7.3) * 1.1 + rng() * 0.7;
    if (rng() < 0.62) {
      const species = pickWeighted(rng, ROCK_SPECIES);
      addRock(species.key, x, z, 0.7 + rng() * 1.1, rng() * TAU);
    } else {
      addGrass("grass2", x, z, 1.4 + rng() * 0.9, rng() * TAU, [0.86, 0.95, 0.8]);
    }
  }
  // Far bank: a thin line of rocks so the water edge is legible from the overlook.
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const z = lake.minZ - 1 + t * (lake.maxZ - lake.minZ + 2);
    const x = lake.minX - 0.6 - rng() * 1.4;
    const species = pickWeighted(rng, ROCK_SPECIES);
    addRock(species.key, x, z, 1.0 + rng() * 1.6, rng() * TAU);
  }

  for (const [key, list] of rockLists) buildSpecies(key, list);

  // The shoreline reeds were appended to the grass lists after the grass batches
  // were built, so rebuild that species once with the complete list.
  for (const [key, list] of grassLists) {
    // Remove the earlier grass batches for this key, then rebuild with reeds.
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      if (child.isInstancedMesh && child.name.startsWith(`${key}:`)) {
        group.remove(child);
        child.dispose();
        stats.batches -= 1;
        stats.instances -= child.count;
      }
    }
    buildSpecies(key, list, { sway: 0.09 });
  }

  /* ---------------- distant hills ---------------- */

  // A far silhouette ring, well beyond the backdrop trees. These are soft
  // hemispheres whose bulk sits below the horizon line; they must read as haze
  // on the skyline, not as green walls around the meadow.
  const hillGeo = new THREE.SphereGeometry(1, 10, 6);
  const hillMat = new THREE.MeshStandardMaterial({
    color: palette.hillNear ?? 0x7fa88e,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const HILLS = 18;
  const hills = new THREE.InstancedMesh(hillGeo, hillMat, HILLS);
  hills.name = "valeHills";
  hills.frustumCulled = false;
  const hillColor = new THREE.Color();
  for (let i = 0; i < HILLS; i++) {
    const angle = (i / HILLS) * TAU + rng() * 0.18;
    const radius = 175 + rng() * 45;
    const height = 14 + rng() * 16;
    const width = 60 + rng() * 40;
    tmpPos.set(Math.cos(angle) * radius, -height * 0.55, Math.sin(angle) * radius);
    tmpQuat.setFromAxisAngle(Y_AXIS, rng() * TAU);
    tmpScale.set(width, height, width * (0.7 + rng() * 0.5));
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    hills.setMatrixAt(i, tmpMat);
    const far = radius > 200;
    hillColor.setHex(far ? (palette.hillFar ?? 0x9fb8b0) : (palette.hillNear ?? 0x7fa88e));
    const k = 0.94 + rng() * 0.1;
    hillColor.multiplyScalar(k);
    hills.setColorAt(i, hillColor);
  }
  hills.instanceMatrix.needsUpdate = true;
  if (hills.instanceColor) hills.instanceColor.needsUpdate = true;
  hills.computeBoundingSphere();
  group.add(hills);
  stats.batches += 1;

  /* ---------------- clouds ---------------- */

  // Clouds are a few large, flat, stylized clusters high above and well OUTSIDE
  // the playable square. They must never sit over the meadow: at 32-48 m they
  // would fill the aerial and gameplay sightlines with opaque spheres.
  const puffGeo = new THREE.SphereGeometry(1, 7, 5);
  const cloudMat = new THREE.MeshBasicMaterial({
    color: palette.cloud ?? 0xfbfdf7,
    transparent: true,
    opacity: 0.85,
    fog: true,
    depthWrite: false,
  });
  const PUFFS = 24;
  const clouds = new THREE.InstancedMesh(puffGeo, cloudMat, PUFFS);
  clouds.name = "valeClouds";
  clouds.frustumCulled = false;
  for (let i = 0; i < PUFFS; i++) {
    const cluster = Math.floor(i / 4);
    const angle = (cluster / 6) * TAU + 0.4;
    // 120-170 m out: beyond the hills, never overhead.
    const radius = 120 + rng() * 50;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const cy = 52 + rng() * 22;
    const w = 12 + rng() * 16;
    tmpPos.set(cx + (rng() - 0.5) * w * 1.4, cy + (rng() - 0.5) * 4, cz + (rng() - 0.5) * w);
    tmpQuat.identity();
    // Flattened: a cloud is a soft pancake, not a ball.
    tmpScale.set(w, w * (0.22 + rng() * 0.12), w * (0.7 + rng() * 0.3));
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    clouds.setMatrixAt(i, tmpMat);
  }
  clouds.instanceMatrix.needsUpdate = true;
  clouds.computeBoundingSphere();
  group.add(clouds);
  stats.batches += 1;

  /* ---------------- pollen motes ---------------- */

  const POLLEN = 220;
  const pollenPositions = new Float32Array(POLLEN * 3);
  const pollenSeeds = [];
  for (let i = 0; i < POLLEN; i++) {
    const anchor = clearings[i % clearings.length];
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * (anchor.r + 6);
    const seed = {
      x0: anchor.x + Math.cos(a) * r,
      z0: anchor.z + Math.sin(a) * r,
      y0: 0.4 + rng() * 2.6,
      drift: 0.5 + rng() * 1.6,
      phase: rng() * TAU,
      speed: 0.18 + rng() * 0.22,
    };
    pollenSeeds.push(seed);
    pollenPositions[i * 3] = seed.x0;
    pollenPositions[i * 3 + 1] = seed.y0;
    pollenPositions[i * 3 + 2] = seed.z0;
  }
  const pollenGeo = new THREE.BufferGeometry();
  const pollenAttr = new THREE.BufferAttribute(pollenPositions, 3);
  pollenAttr.setUsage(THREE.DynamicDrawUsage);
  pollenGeo.setAttribute("position", pollenAttr);
  const pollenMat = new THREE.PointsMaterial({
    color: palette.pollen ?? 0xfff0b8,
    size: 0.1,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pollen = new THREE.Points(pollenGeo, pollenMat);
  pollen.name = "valePollen";
  pollen.frustumCulled = false;
  group.add(pollen);
  stats.batches += 1;

  /* ---------------- animation ---------------- */

  function updatePollen(elapsed) {
    const arr = pollenGeo.attributes.position.array;
    for (let i = 0; i < POLLEN; i++) {
      const s = pollenSeeds[i];
      arr[i * 3] = s.x0 + Math.sin(elapsed * s.speed + s.phase) * s.drift;
      arr[i * 3 + 1] = s.y0 + Math.sin(elapsed * s.speed * 0.8 + s.phase * 1.7) * 0.55;
      arr[i * 3 + 2] = s.z0 + Math.cos(elapsed * s.speed * 0.9 + s.phase) * s.drift * 0.8;
    }
    pollenGeo.attributes.position.needsUpdate = true;
  }

  updatePollen(0);
  const pollenInitial = Float32Array.from(pollenGeo.attributes.position.array);

  function update(dt, elapsed) {
    const t = Number.isFinite(elapsed) ? elapsed : 0;
    swayTime.value = t;
    updatePollen(t);
  }

  function reset() {
    swayTime.value = 0;
    // Restore the exact initial buffer rather than recomputing it: recomputation
    // is only equal if elapsed is exactly 0, and retry must not drift.
    pollenGeo.attributes.position.array.set(pollenInitial);
    pollenGeo.attributes.position.needsUpdate = true;
  }

  return { group, update, reset, colliders, stats };
}
