import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ASSETS, PALETTE, pickWeighted } from "./balance.js";

const TILE = 4;
const FLOOR_Y = -0.05;
const TORCH_MOUNT_Y = 2.6;
const TORCH_INTENSITY = 10;
const TORCH_RANGE = 11;
const TORCH_DECAY = 2;
const BANNER_Y = 0.27;
const BANNER_BACK = 0.378;
const EMBER_COUNT = 60;
const SPAWN_TRIES = 40;
const COLLIDER_PAD = 0.7;
const HAZARD_PAD = 0.5;
const FOG_DENSITY = 0.028;

const FLOOR_MIX = [
  { value: "floorTile", weight: 60 },
  { value: "floorTileRocks", weight: 14 },
  { value: "floorDirt", weight: 17 },
  { value: "floorDirtRocky", weight: 9 },
];

const SPIKE_CELLS = [
  { x: 6, z: 6 },
  { x: -6, z: 6 },
  { x: 6, z: -6 },
];

const PROP_INFO = {
  barrel: { url: ASSETS.dungeon.barrel, radius: 0.9, y: 0 },
  crates: { url: ASSETS.dungeon.crates, radius: 1.13, y: 0 },
  rubble: { url: ASSETS.dungeon.rubble, radius: 4.05, y: 0 },
  shelf: { url: ASSETS.dungeon.shelf, radius: 0.5, y: 0.3 },
  chest: { url: ASSETS.dungeon.chest, radius: 0.85, y: 0 },
  column: { url: ASSETS.dungeon.column, radius: 0.35, y: 0 },
};

const DAIS_TOP = 0.2;
const DAIS_TILES = [
  { x: -2, y: 0.05, z: 18 },
  { x: 2, y: 0.05, z: 18 },
  { x: -2, y: 0.05, z: 22 },
  { x: 2, y: 0.05, z: 22 },
  { x: -2, y: 0.15, z: 20 },
  { x: 2, y: 0.15, z: 20 },
];

const PROP_LAYOUT = [
  { key: "rubble", x: -21.9, z: -16.5, rot: Math.PI / 2 },
  { key: "barrel", x: -21.5, z: -21.8, rot: 0.5 },
  { key: "barrel", x: -19.3, z: -22.2, rot: 1.2 },
  { key: "shelf", x: -11, z: -23.5, rot: 0 },
  { key: "chest", x: -22.6, z: -10.5, rot: 0.25 },
  { key: "column", x: -16, z: -16, rot: 0.1 },

  { key: "crates", x: 18, z: -22.3, rot: 0.15 },
  { key: "shelf", x: 23.5, z: -18, rot: -Math.PI / 2 },
  { key: "chest", x: 22.6, z: -13, rot: -0.35 },
  { key: "column", x: 16, z: -16, rot: -0.15 },

  { key: "rubble", x: -21.9, z: 16.5, rot: Math.PI / 2 },
  { key: "barrel", x: -21.5, z: 21.8, rot: -0.5 },
  { key: "barrel", x: -19.3, z: 22.2, rot: -1.2 },
  { key: "shelf", x: -11, z: 23.5, rot: Math.PI },
  { key: "chest", x: -22.6, z: 10.5, rot: -0.25 },
  { key: "column", x: -16, z: 16, rot: -0.1 },

  { key: "crates", x: 18, z: 22.3, rot: -0.15 },
  { key: "shelf", x: 23.5, z: 18, rot: -Math.PI / 2 },
  { key: "chest", x: 22.6, z: 13, rot: 0.35 },
  { key: "column", x: 16, z: 16, rot: 0.15 },

  { key: "chest", x: 0, z: 20, rot: 0, y: DAIS_TOP },
];

export function createWorld(options = {}) {
  const { scene, config, rng, loader } = options;
  const random = typeof rng === "function" ? rng : Math.random;
  const arenaW = config?.arena?.w ?? 48;
  const arenaD = config?.arena?.d ?? 48;
  const inset = config?.arena?.wallInset ?? 2;
  const halfW = arenaW / 2;
  const halfD = arenaD / 2;
  const wallFace = Math.min(halfW, halfD) - 0.5;
  const bounds = {
    minX: -halfW + inset,
    maxX: halfW - inset,
    minZ: -halfD + inset,
    maxZ: halfD - inset,
  };

  const group = new THREE.Group();
  group.name = "world";
  const floorGroup = new THREE.Group();
  floorGroup.name = "worldFloor";
  const wallGroup = new THREE.Group();
  wallGroup.name = "worldWalls";
  const propGroup = new THREE.Group();
  propGroup.name = "worldProps";
  const lightGroup = new THREE.Group();
  lightGroup.name = "worldLights";
  group.add(floorGroup, wallGroup, propGroup, lightGroup);

  const colliders = [];
  const hazards = [];
  const torches = [];
  const coinTemplate = new THREE.Group();
  coinTemplate.name = "coinTemplate";
  const softBlocks = [{ minX: -5, maxX: 5, minZ: 14, maxZ: halfD }];

  const spikeRots = SPIKE_CELLS.map(() => Math.floor(random() * 4) * (Math.PI / 2));
  const spikeKeys = new Set(SPIKE_CELLS.map((c) => `${c.x},${c.z}`));
  const cols = Math.round(arenaW / TILE);
  const rows = Math.round(arenaD / TILE);
  const floorTiles = [];
  const grid = [];
  for (let iz = 0; iz < rows; iz++) {
    const row = [];
    grid.push(row);
    for (let ix = 0; ix < cols; ix++) {
      const x = -halfW + TILE / 2 + ix * TILE;
      const z = -halfD + TILE / 2 + iz * TILE;
      if (spikeKeys.has(`${x},${z}`)) {
        row.push("floorSpikes");
        continue;
      }
      const avoid = new Set();
      if (ix > 0) avoid.add(row[ix - 1]);
      if (iz > 0) avoid.add(grid[iz - 1][ix]);
      let variant = pickWeighted(random, FLOOR_MIX);
      for (let t = 0; t < 4 && avoid.has(variant); t++) variant = pickWeighted(random, FLOOR_MIX);
      row.push(variant);
      floorTiles.push({ variant, x, z, rot: Math.floor(random() * 4) * (Math.PI / 2) });
    }
  }

  const slotsPerSide = cols - 1;
  const doorIndex = (slotsPerSide - 1) / 2;
  const sideDefs = [
    { rot: 0, line: -halfD, along: "x" },
    { rot: Math.PI, line: halfD, along: "x" },
    { rot: Math.PI / 2, line: -halfW, along: "z" },
    { rot: -Math.PI / 2, line: halfW, along: "z" },
  ];
  const wallSlots = [];
  for (const side of sideDefs) {
    for (let i = 0; i < slotsPerSide; i++) {
      const offset = -halfW + TILE + i * TILE;
      const kind = i === doorIndex ? "wallDoorway" : i % 2 === 1 ? "wallPillar" : "wall";
      wallSlots.push({
        kind,
        x: side.along === "x" ? offset : side.line,
        z: side.along === "x" ? side.line : offset,
        rot: side.rot,
      });
    }
  }
  const cornerSlots = [
    { x: -halfW, z: -halfD, rot: Math.PI / 2 },
    { x: halfW, z: -halfD, rot: 0 },
    { x: halfW, z: halfD, rot: -Math.PI / 2 },
    { x: -halfW, z: halfD, rot: Math.PI },
  ];

  const torchSpots = [
    { x: -12, z: -wallFace, rot: 0 },
    { x: 12, z: -wallFace, rot: 0 },
    { x: -12, z: wallFace, rot: Math.PI },
    { x: 12, z: wallFace, rot: Math.PI },
    { x: -wallFace, z: -12, rot: Math.PI / 2 },
    { x: -wallFace, z: 12, rot: Math.PI / 2 },
    { x: wallFace, z: -12, rot: -Math.PI / 2 },
    { x: wallFace, z: 12, rot: -Math.PI / 2 },
  ];

  const bannerSpots = [
    { x: -4, z: -wallFace, rot: 0 },
    { x: 4, z: wallFace, rot: Math.PI },
    { x: -wallFace, z: -4, rot: Math.PI / 2 },
    { x: wallFace, z: 4, rot: -Math.PI / 2 },
  ];

  const propInstances = [];
  for (const def of PROP_LAYOUT) {
    const info = PROP_INFO[def.key];
    if (!info) continue;
    const jitter = (random() - 0.5) * 0.24;
    propInstances.push({
      key: def.key,
      x: def.x,
      y: def.y ?? info.y,
      z: def.z,
      rot: def.rot + jitter,
    });
    colliders.push({ x: def.x, z: def.z, radius: info.radius });
  }

  for (const cell of SPIKE_CELLS) {
    hazards.push({ x: cell.x, z: cell.z, radius: 2, damage: 9, tick: 1.1 });
  }

  const emberData = [];
  for (let i = 0; i < EMBER_COUNT; i++) {
    emberData.push({
      ti: i % torchSpots.length,
      ox: (random() - 0.5) * 0.14,
      oz: 0.34 + random() * 0.16,
      phase: random(),
      speed: 0.35 + random() * 0.45,
      rise: 0.55 + random() * 0.6,
    });
  }
  const emberPositions = new Float32Array(EMBER_COUNT * 3);
  const emberColors = new Float32Array(EMBER_COUNT * 3);
  const emberGeo = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(emberPositions, 3);
  const colorAttr = new THREE.BufferAttribute(emberColors, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  emberGeo.setAttribute("position", positionAttr);
  emberGeo.setAttribute("color", colorAttr);
  const emberMaterial = new THREE.PointsMaterial({
    size: 0.07,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const emberPoints = new THREE.Points(emberGeo, emberMaterial);
  emberPoints.name = "worldEmbers";
  emberPoints.frustumCulled = false;
  lightGroup.add(emberPoints);

  const flameGeo = new THREE.ConeGeometry(0.075, 0.22, 6);
  const flameMat = new THREE.MeshBasicMaterial({
    color: PALETTE.torchCore,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x120c08, 0.28);
  const ambient = new THREE.AmbientLight(0x120d0b, 0.9);
  const sun = new THREE.DirectionalLight(0xffe3c0, 0.15);
  sun.position.set(16, 24, 10);
  group.add(hemi, ambient, sun);

  if (scene) {
    scene.fog = new THREE.FogExp2(PALETTE.fog, FOG_DENSITY);
    scene.background = new THREE.Color(PALETTE.fog);
    scene.add(group);
  }

  function instance(root, x, y, z, rot, parent, name) {
    if (!root) return null;
    const obj = root.clone(true);
    obj.position.set(x, y, z);
    obj.rotation.y = rot;
    if (name) obj.name = name;
    (parent ?? group).add(obj);
    return obj;
  }

  const assetUrls = {
    floorTile: ASSETS.dungeon.floorTile,
    floorTileRocks: ASSETS.dungeon.floorTileRocks,
    floorDirt: ASSETS.dungeon.floorDirt,
    floorDirtRocky: ASSETS.dungeon.floorDirtRocky,
    floorSpikes: ASSETS.dungeon.floorSpikes,
    wall: ASSETS.dungeon.wall,
    wallCorner: ASSETS.dungeon.wallCorner,
    wallDoorway: ASSETS.dungeon.wallDoorway,
    wallPillar: ASSETS.dungeon.wallPillar,
    torch: ASSETS.dungeon.torch,
    banner: ASSETS.dungeon.banner,
    coin: ASSETS.dungeon.coin,
    barrel: PROP_INFO.barrel.url,
    crates: PROP_INFO.crates.url,
    rubble: PROP_INFO.rubble.url,
    shelf: PROP_INFO.shelf.url,
    chest: PROP_INFO.chest.url,
    column: PROP_INFO.column.url,
  };

  const loaderImpl = loader ?? new GLTFLoader();
  const assetCache = new Map();

  function loadAsset(url) {
    if (!url) return Promise.resolve(null);
    if (!assetCache.has(url)) {
      const pending = typeof loaderImpl.loadAsync === "function"
        ? loaderImpl.loadAsync(url)
        : new Promise((resolve, reject) => loaderImpl.load(url, resolve, undefined, reject));
      assetCache.set(
        url,
        pending
          .then((gltf) => gltf?.scene ?? gltf ?? null)
          .catch((err) => {
            console.warn(`[world] failed to load ${url}`, err);
            return null;
          })
      );
    }
    return assetCache.get(url);
  }

  function build(roots) {
    for (const tile of floorTiles) {
      instance(roots[tile.variant], tile.x, FLOOR_Y, tile.z, tile.rot, floorGroup, tile.variant);
    }
    SPIKE_CELLS.forEach((cell, i) => {
      instance(roots.floorSpikes, cell.x, FLOOR_Y, cell.z, spikeRots[i], floorGroup, "spikes");
    });
    for (const slot of wallSlots) {
      instance(roots[slot.kind], slot.x, 0, slot.z, slot.rot, wallGroup, slot.kind);
    }
    for (const corner of cornerSlots) {
      instance(roots.wallCorner, corner.x, 0, corner.z, corner.rot, wallGroup, "wallCorner");
    }
    for (const spot of bannerSpots) {
      instance(roots.banner, spot.x, BANNER_Y, spot.z, spot.rot, wallGroup, "banner");
    }
    for (const tile of DAIS_TILES) {
      instance(roots.floorTile, tile.x, tile.y, tile.z, 0, propGroup, "dais");
    }
    for (const prop of propInstances) {
      instance(roots[prop.key], prop.x, prop.y, prop.z, prop.rot, propGroup, prop.key);
    }
    if (roots.coin) coinTemplate.add(roots.coin.clone(true));

    for (const spot of torchSpots) {
      const holder = new THREE.Group();
      holder.name = "torchMount";
      holder.position.set(spot.x, TORCH_MOUNT_Y, spot.z);
      holder.rotation.y = spot.rot;
      if (roots.torch) instance(roots.torch, 0, 0, 0, 0, holder, "torch");
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(0, 0.55, 0.42);
      holder.add(flame);
      const light = new THREE.PointLight(0xffa040, TORCH_INTENSITY, TORCH_RANGE, TORCH_DECAY);
      light.position.set(0, 0.5, 0.35);
      holder.add(light);
      lightGroup.add(holder);
      torches.push({
        x: spot.x,
        z: spot.z,
        rot: spot.rot,
        light,
        flame,
        p1: random() * Math.PI * 2,
        p2: random() * Math.PI * 2,
        p3: random() * Math.PI * 2,
        f1: 6.2 + random() * 2.4,
        f2: 11.5 + random() * 3.5,
        f3: 21 + random() * 6,
      });
    }
    updateEmbers();
  }

  const ready = Promise.all(
    Object.entries(assetUrls).map(async ([key, url]) => [key, await loadAsset(url)])
  )
    .then((entries) => build(Object.fromEntries(entries)))
    .catch((err) => console.error("[world] build failed", err));

  let emberTime = 0;

  function updateEmbers() {
    if (!torches.length) return;
    const positions = emberGeo.attributes.position.array;
    const colors = emberGeo.attributes.color.array;
    const er = ((PALETTE.ember >> 16) & 255) / 255;
    const eg = ((PALETTE.ember >> 8) & 255) / 255;
    const eb = (PALETTE.ember & 255) / 255;
    for (let i = 0; i < emberData.length; i++) {
      const d = emberData[i];
      const torch = torches[d.ti];
      const age = (d.phase + emberTime * d.speed) % 1;
      const sway = Math.sin(age * 9.5 + d.phase * 12.5) * 0.06;
      const lx = d.ox + sway;
      const ly = 0.38 + age * d.rise;
      const lz = d.oz;
      const c = Math.cos(torch.rot);
      const s = Math.sin(torch.rot);
      positions[i * 3] = torch.x + lx * c + lz * s;
      positions[i * 3 + 1] = TORCH_MOUNT_Y + ly;
      positions[i * 3 + 2] = torch.z - lx * s + lz * c;
      const fade = age < 0.18 ? age / 0.18 : 1 - (age - 0.18) / 0.82;
      const k = fade * fade * (0.9 + 0.1 * Math.sin(emberTime * 7 + i * 1.7));
      colors[i * 3] = er * k;
      colors[i * 3 + 1] = eg * k;
      colors[i * 3 + 2] = eb * k;
    }
    emberGeo.attributes.position.needsUpdate = true;
    emberGeo.attributes.color.needsUpdate = true;
  }

  function update(dt, elapsed = 0) {
    for (let i = 0; i < torches.length; i++) {
      const t = torches[i];
      const f = 0.92
        + 0.075 * Math.sin(elapsed * t.f1 + t.p1)
        + 0.05 * Math.sin(elapsed * t.f2 + t.p2)
        + 0.03 * Math.sin(elapsed * t.f3 + t.p3);
      t.light.intensity = TORCH_INTENSITY * f;
      t.flame.scale.set(
        0.9 + 0.12 * Math.sin(elapsed * t.f2 + t.p1),
        Math.max(f, 0.4),
        0.9 + 0.12 * Math.sin(elapsed * t.f3 + t.p2)
      );
    }
    emberTime = (emberTime + Math.min(Math.max(dt, 0), 0.1)) % 1000;
    updateEmbers();
  }

  function reset() {
    emberTime = 0;
    for (const t of torches) {
      t.light.intensity = TORCH_INTENSITY;
      t.flame.scale.set(1, 1, 1);
    }
    updateEmbers();
  }

  function blocked(x, z) {
    for (const c of colliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      const r = c.radius + COLLIDER_PAD;
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (const h of hazards) {
      const dx = x - h.x;
      const dz = z - h.z;
      const r = h.radius + HAZARD_PAD;
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (const s of softBlocks) {
      if (x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ) return true;
    }
    return false;
  }

  function spawnPoint(spawnRng, awayFrom, minDist = 0) {
    const r = typeof spawnRng === "function" ? spawnRng : random;
    const ax = awayFrom?.x;
    const az = awayFrom?.z;
    const min2 = minDist * minDist;
    let x = bounds.minX;
    let z = bounds.minZ;
    for (let i = 0; i < SPAWN_TRIES; i++) {
      x = bounds.minX + r() * (bounds.maxX - bounds.minX);
      z = bounds.minZ + r() * (bounds.maxZ - bounds.minZ);
      if (ax !== undefined && ax !== null) {
        const dx = x - ax;
        const dz = z - az;
        if (dx * dx + dz * dz < min2) continue;
      }
      if (blocked(x, z)) continue;
      break;
    }
    return new THREE.Vector3(x, 0, z);
  }

  return {
    group,
    colliders,
    hazards,
    bounds,
    coinTemplate,
    torchCount: torchSpots.length,
    spawnPoint,
    update,
    reset,
    ready,
  };
}
