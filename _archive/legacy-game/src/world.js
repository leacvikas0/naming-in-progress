import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ASSETS, VALE_PALETTE, CONFIG, pickWeighted } from "./balance.js";
import { createScenery } from "./vale-scenery.js";
import { LAYOUT } from "./vale-layout.js";

// Sunpetal Vale world.
//
// Outdoor valley replacing the 48 x 48 dungeon: 96 x 96 m, flat walkable ground
// at y = 0, a soft path loop, a west lake outside the playable rectangle, a
// broken arch shrine to the north, a traveller's camp to the east, and a
// perimeter of clustered woods and distant hills.
//
// CONTRACT.md's "a module may not import another game module" rule has exactly
// one exception, recorded in that file: vale-scenery.js is a private world
// helper, not a gameplay peer. vale-layout.js is pure static data (no imports).
//
// Everything loaded here is loaded once. ready resolves only after the essential
// templates are usable, and a failed essential load rejects with a useful error
// instead of starting an empty map.

// Ground colour field: a coarse vertex-coloured grid whose colours are smoothly
// interpolated, so warm/cool variation reads as soft drifts of meadow rather
// than tiles. Cell size is metres; the base plane underneath guarantees full
// coverage, so no gap can ever show through.
const GROUND_CELL = 8;
const GROUND_Y = 0;
const SPAWN_TRIES = 40;
const COLLIDER_PAD = 0.7;
const HAZARD_PAD = 0.5;
const PATH_SEGMENTS = 260;

// The valley reuses the dungeon coin for the existing FX module.
const COIN_KEY = "coin";

// How far a prop sits above y = 0 for its own origin, if its base is not at 0.
const PATH_TINTS = [0xddcba1, 0xd7c49a, 0xe1d2ab, 0xd2c096];

export function createWorld(options = {}) {
  const { scene, config, rng, loader } = options;
  const random = typeof rng === "function" ? rng : Math.random;
  const vale = config?.vale ?? CONFIG.vale;
  const arenaW = config?.arena?.w ?? 96;
  const arenaD = config?.arena?.d ?? 96;
  const inset = config?.arena?.wallInset ?? 2;
  const halfW = arenaW / 2;
  const halfD = arenaD / 2;
  const bounds = {
    minX: -halfW + inset,
    maxX: halfW - inset,
    minZ: -halfD + inset,
    maxZ: halfD - inset,
  };

  const group = new THREE.Group();
  group.name = "world";
  const groundGroup = new THREE.Group();
  groundGroup.name = "worldGround";
  const pathGroup = new THREE.Group();
  pathGroup.name = "worldPath";
  const waterGroup = new THREE.Group();
  waterGroup.name = "worldWater";
  const landmarkGroup = new THREE.Group();
  landmarkGroup.name = "worldLandmarks";
  const sceneryGroup = new THREE.Group();
  sceneryGroup.name = "worldScenery";
  const lightGroup = new THREE.Group();
  lightGroup.name = "worldLights";
  group.add(groundGroup, pathGroup, waterGroup, landmarkGroup, sceneryGroup, lightGroup);

  const colliders = [];
  const hazards = [];
  const coinTemplate = new THREE.Group();
  coinTemplate.name = "coinTemplate";

  /* ---------------- path field ---------------- */

  // Paths are visual ground treatments, not corridors: nothing here creates a
  // collider. The distance field is also handed to the scenery helper so path
  // centres stay bare and props stay off the route.
  const pathSegments = [];
  function addPath(ax, az, bx, bz, width) {
    pathSegments.push({ ax, az, bx, bz, half: width / 2 });
  }
  const loop = vale.loopPath ?? [];
  for (let i = 0; i < loop.length - 1; i++) {
    addPath(loop[i][0], loop[i][1], loop[i + 1][0], loop[i + 1][1], vale.loopWidth ?? 3.4);
  }
  for (const spoke of vale.spokes ?? []) {
    addPath(spoke.from[0], spoke.from[1], spoke.to[0], spoke.to[1], spoke.width ?? 2.8);
  }

  function pathDistance(x, z) {
    let best = Infinity;
    for (const s of pathSegments) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 0 ? ((x - s.ax) * dx + (z - s.az) * dz) / len2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const px = s.ax + dx * t;
      const pz = s.az + dz * t;
      const d = Math.hypot(x - px, z - pz) - s.half;
      if (d < best) best = d;
    }
    return best;
  }

  /* ---------------- ground ---------------- */

  // Soft colour drift over the meadow. This is a full-coverage vertex-coloured
  // grid laid on the base plane: neighbouring vertices interpolate, so the
  // variation reads as broad warm/cool drifts of grass instead of tiles. (An
  // earlier version scattered rotated quads per tile; the gaps between them
  // showed the base plane through as pale shards and dominated every view.)
  const groundW = arenaW + 8;
  const groundD = arenaD + 8;
  const gridCols = Math.round(groundW / GROUND_CELL);
  const gridRows = Math.round(groundD / GROUND_CELL);
  const gridPositions = [];
  const gridColors = [];
  const gridIndices = [];
  const baseColor = new THREE.Color(VALE_PALETTE.grass);
  const grassWarm = new THREE.Color(VALE_PALETTE.grassWarm);
  const grassCool = new THREE.Color(VALE_PALETTE.grassCool);
  const driftScratch = new THREE.Color();

  for (let iz = 0; iz <= gridRows; iz++) {
    for (let ix = 0; ix <= gridCols; ix++) {
      const x = -groundW / 2 + ix * GROUND_CELL;
      const z = -groundD / 2 + iz * GROUND_CELL;
      gridPositions.push(x, GROUND_Y + 0.012, z);
      // Two low-frequency waves pick the warm/cool mix, so colour changes over
      // tens of metres and never forms a visible cell boundary.
      const warm = 0.5 + 0.5 * Math.sin(x * 0.055 + z * 0.021 + 1.7);
      const cool = 0.5 + 0.5 * Math.sin(z * 0.047 - x * 0.026 + 4.1);
      driftScratch.copy(baseColor);
      driftScratch.lerp(grassWarm, warm * 0.55);
      driftScratch.lerp(grassCool, cool * 0.35);
      const k = 0.97 + 0.03 * Math.sin(x * 0.31 + z * 0.27);
      gridColors.push(driftScratch.r * k, driftScratch.g * k, driftScratch.b * k);
    }
  }
  // Counter-clockwise seen from above (+Y) so each quad faces the sky; the
  // material is FrontSide and a reversed winding culls the whole layer.
  for (let iz = 0; iz < gridRows; iz++) {
    for (let ix = 0; ix < gridCols; ix++) {
      const a = iz * (gridCols + 1) + ix;
      const b = a + 1;
      const c = a + gridCols + 1;
      const d = c + 1;
      gridIndices.push(a, c, b, b, c, d);
    }
  }

  // The base plane covers the whole valley but stops short of the lake, so the
  // water is genuinely below the ground line rather than hidden by it. The lake
  // bed then fills the gap, slightly below the water surface.
  const lake = vale.lake ?? { minX: -78, maxX: -50, minZ: -25, maxZ: 18, level: -0.35 };
  const baseGeo = new THREE.PlaneGeometry(arenaW + 8, arenaD + 8, 1, 1);
  const baseMat = new THREE.MeshStandardMaterial({
    color: VALE_PALETTE.grass,
    roughness: 1,
    metalness: 0,
  });
  const groundBase = new THREE.Mesh(baseGeo, baseMat);
  groundBase.name = "worldGroundBase";
  groundBase.rotation.x = -Math.PI / 2;
  groundBase.position.y = GROUND_Y;
  groundBase.receiveShadow = true;
  groundGroup.add(groundBase);

  // A green verge shelf that reaches to the waterline, so there is no visible
  // seam between the playable rectangle and the lake.
  const vergeW = 26;
  const vergeGeo = new THREE.PlaneGeometry(vergeW, lake.maxZ - lake.minZ + 18);
  const verge = new THREE.Mesh(vergeGeo, baseMat);
  verge.name = "worldLakeVerge";
  verge.rotation.x = -Math.PI / 2;
  verge.position.set(lake.maxX + vergeW / 2 - 0.5, GROUND_Y - 0.01, (lake.minZ + lake.maxZ) / 2);
  groundGroup.add(verge);

  const patchGeo = new THREE.BufferGeometry();
  patchGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPositions, 3));
  patchGeo.setAttribute("color", new THREE.Float32BufferAttribute(gridColors, 3));
  patchGeo.setIndex(gridIndices);
  patchGeo.computeVertexNormals();
  const patchMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const groundPatches = new THREE.Mesh(patchGeo, patchMat);
  groundPatches.name = "worldGroundPatches";
  groundPatches.receiveShadow = true;
  groundGroup.add(groundPatches);

  /* ---------------- paths ---------------- */

  // The path is a soft irregular ribbon: sample the centre lines, wobble the
  // edges, and build one triangle strip per segment with a vertex-coloured,
  // alpha-free material. It sits just above the ground so it never z-fights.
  const pathPositions = [];
  const pathColors = [];
  const pathIndices = [];
  let pathVert = 0;
  const pathColor = new THREE.Color();

  // One continuous triangle strip per path segment, with a small round cap at
  // every joint. Emitting independent quads left sawtooth notches at each step
  // and wedge gaps at every waypoint, which read as torn edges on the ground.
  // Rings are shared between steps, and a fan at each end closes the join.
  function emitPathRing(x, z, nx, nz, w) {
    const h = w / 2;
    const y = GROUND_Y + 0.02;
    const base = pathVert;
    pathPositions.push(x + nx * h, y, z + nz * h, x - nx * h, y, z - nz * h);
    pathColor.setHex(PATH_TINTS[pathRingIndex % PATH_TINTS.length]);
    pathColors.push(pathColor.r, pathColor.g, pathColor.b, pathColor.r, pathColor.g, pathColor.b);
    pathRingIndex += 1;
    pathVert += 2;
    return base;
  }

  // A filled fan at (x,z): the round cap that hides the wedge between two
  // segments of the loop. It sits a hair below the ribbon so the overlapping
  // coplanar faces never z-fight; the colours are near-identical, so the join is
  // invisible either way.
  function emitPathCap(x, z, radius) {
    const y = GROUND_Y + 0.015;
    const SEGMENTS = 12;
    const centre = pathVert;
    pathPositions.push(x, y, z);
    pathColor.setHex(PATH_TINTS[pathRingIndex % PATH_TINTS.length]);
    pathColors.push(pathColor.r, pathColor.g, pathColor.b);
    pathVert += 1;
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      pathPositions.push(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius);
      pathColors.push(pathColor.r, pathColor.g, pathColor.b);
      pathVert += 1;
    }
    for (let i = 0; i < SEGMENTS; i++) {
      pathIndices.push(centre, centre + 1 + i + 1, centre + 1 + i);
    }
  }

  // Smooth wobble: a low-frequency sine per segment rather than per-step noise,
  // so the edge drifts instead of jittering.
  function pathWobble(seedPhase, t) {
    return Math.sin(seedPhase + t * 5.1) * 0.45 + Math.sin(seedPhase * 2.3 + t * 11.7) * 0.18;
  }

  let pathRingIndex = 0;
  for (const s of pathSegments) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const steps = Math.max(2, Math.round(len / 2.5));
    const phase = random() * Math.PI * 2;
    let prevVert = -1;
    let prevW = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Interpolate position, then push sideways along the segment normal by the
      // smooth wobble. Both edges come from the same centre, so the ribbon keeps
      // a constant local width.
      const cx = s.ax + (s.bx - s.ax) * t;
      const cz = s.az + (s.bz - s.az) * t;
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const nlen = Math.hypot(dx, dz) || 1;
      const nx = -dz / nlen;
      const nz = dx / nlen;
      const wob = pathWobble(phase, t);
      const w = s.half * 2 * (0.92 + 0.1 * Math.sin(phase + t * 3.3));
      const vert = emitPathRing(cx + nx * wob, cz + nz * wob, nx, nz, w);
      if (prevVert >= 0) {
        pathIndices.push(
          prevVert, vert, prevVert + 1,
          prevVert + 1, vert, vert + 1
        );
      }
      prevVert = vert;
      prevW = w;
    }
    // Close both ends of this segment so the waypoint joins are seamless.
    emitPathCap(s.ax, s.az, prevW / 2);
    emitPathCap(s.bx, s.bz, prevW / 2);
  }

  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute("position", new THREE.Float32BufferAttribute(pathPositions, 3));
  pathGeo.setAttribute("color", new THREE.Float32BufferAttribute(pathColors, 3));
  pathGeo.setIndex(pathIndices);
  pathGeo.computeVertexNormals();
  const pathMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const pathMesh = new THREE.Mesh(pathGeo, pathMat);
  pathMesh.name = "worldPathRibbon";
  pathMesh.receiveShadow = true;
  pathGroup.add(pathMesh);

  /* ---------------- lake ---------------- */

  const lakeW = lake.maxX - lake.minX;
  const lakeD = lake.maxZ - lake.minZ;
  const lakeGeo = new THREE.PlaneGeometry(lakeW, lakeD, 1, 1);
  const lakeMat = new THREE.MeshStandardMaterial({
    color: VALE_PALETTE.water,
    roughness: 0.22,
    metalness: 0.12,
    transparent: true,
    opacity: 0.92,
  });
  const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
  lakeMesh.name = "worldLake";
  lakeMesh.rotation.x = -Math.PI / 2;
  lakeMesh.position.set((lake.minX + lake.maxX) / 2, lake.level, (lake.minZ + lake.maxZ) / 2);
  lakeMesh.receiveShadow = false;
  waterGroup.add(lakeMesh);

  // A darker bed under the surface so the water reads as depth, not a decal on
  // the grass.
  const lakeBedMat = new THREE.MeshStandardMaterial({
    color: VALE_PALETTE.waterDeep,
    roughness: 1,
    metalness: 0,
  });
  const lakeBed = new THREE.Mesh(new THREE.PlaneGeometry(lakeW + 2, lakeD + 2), lakeBedMat);
  lakeBed.rotation.x = -Math.PI / 2;
  lakeBed.position.set((lake.minX + lake.maxX) / 2, lake.level - 0.5, (lake.minZ + lake.maxZ) / 2);
  waterGroup.add(lakeBed);

  // Slow stylized surface drift: one uniform write per frame, no reallocation.
  const waterUniforms = { value: 0 };

  /* ---------------- sky ---------------- */

  // Gradient sky as a large inverted sphere with a vertex-colour ramp. Cheap,
  // no shader authoring beyond vertex colours, and unaffected by fog.
  const skyGeo = new THREE.SphereGeometry(240, 24, 16);
  const skyColors = [];
  const topColor = new THREE.Color(VALE_PALETTE.skyTop);
  const horizonColor = new THREE.Color(VALE_PALETTE.skyHorizon);
  const skyPos = skyGeo.attributes.position;
  const tmpSky = new THREE.Color();
  for (let i = 0; i < skyPos.count; i++) {
    const y = skyPos.getY(i) / 240;
    const t = Math.max(0, Math.min(1, (y + 0.15) / 0.75));
    tmpSky.copy(horizonColor).lerp(topColor, t);
    skyColors.push(tmpSky.r, tmpSky.g, tmpSky.b);
  }
  skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(skyColors, 3));
  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = "worldSky";
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  group.add(sky);

  /* ---------------- lighting ---------------- */

  // One warm directional sun and a cool hemisphere fill, per MAP-DESIGN. No
  // point lights outdoors (torchCount is 0); the dungeon's following player
  // light is removed in main.js when the outdoor world is shown.
  const hemi = new THREE.HemisphereLight(VALE_PALETTE.skyHorizon, VALE_PALETTE.canopyShadow, 1.5);
  const sun = new THREE.DirectionalLight(VALE_PALETTE.sun, vale.sun?.intensity ?? 2.5);
  const sunAz = vale.sun?.azimuth ?? 2.35;
  const sunEl = vale.sun?.elevation ?? 0.72;
  sun.position.set(
    Math.cos(sunAz) * Math.cos(sunEl) * 80,
    Math.sin(sunEl) * 80,
    Math.sin(sunAz) * Math.cos(sunEl) * 80
  );
  sun.target.position.set(0, 0, 0);
  const ambient = new THREE.AmbientLight(0xdff0ff, 0.35);
  lightGroup.add(hemi, sun, sun.target, ambient);

  if (scene) {
    scene.fog = new THREE.Fog(VALE_PALETTE.fog, vale.fog?.near ?? 42, vale.fog?.far ?? 155);
    scene.background = new THREE.Color(VALE_PALETTE.skyHorizon);
    scene.add(group);
  }

  /* ---------------- asset loading ---------------- */

  const loaderImpl = loader ?? new GLTFLoader();
  const assetCache = new Map();

  function loadAsset(url) {
    if (!url) return Promise.resolve(null);
    if (!assetCache.has(url)) {
      const pending = typeof loaderImpl.loadAsync === "function"
        ? loaderImpl.loadAsync(url)
        : new Promise((resolve, reject) => loaderImpl.load(url, resolve, undefined, reject));
      assetCache.set(url, pending.then((gltf) => gltf?.scene ?? gltf ?? null));
    }
    return assetCache.get(url);
  }

  const sceneryKeys = Object.keys(ASSETS.valley).filter((k) => k !== COIN_KEY);

  const essential = Promise.all([
    ...sceneryKeys.map(async (key) => [key, await loadAsset(ASSETS.valley[key])]),
    (async () => [COIN_KEY, await loadAsset(ASSETS.valley[COIN_KEY])])(),
  ]);

  let scenery = null;

  function buildTemplates(entries) {
    const templates = Object.fromEntries(entries);
    // The coin is not scenery; clone it into the reusable template the FX module
    // expects and scale it to the documented ~0.36 m size.
    if (templates[COIN_KEY]) {
      const coin = templates[COIN_KEY].clone(true);
      coin.name = "coinTemplateMesh";
      coin.scale.setScalar(1);
      coinTemplate.add(coin);
    }
    return templates;
  }

  function buildLandmarks(templates) {
    const place = (entry) => {
      const root = templates[entry.asset];
      if (!root) return null;
      const obj = root.clone(true);
      obj.position.set(entry.x, entry.y ?? 0, entry.z);
      obj.rotation.y = entry.rotY ?? 0;
      const s = entry.scale ?? 1;
      // Uniform scale is the norm; sx/sy/sz let a 1 m cube become a real pedestal
      // slab without needing a second asset for every proportion.
      obj.scale.set(entry.sx ?? s, entry.sy ?? s, entry.sz ?? s);
      if (entry.tint) {
        obj.traverse((o) => {
          if (!o.isMesh) return;
          o.material = o.material.clone();
          o.material.color = new THREE.Color(entry.tint);
        });
      }
      obj.name = entry.note || entry.asset;
      landmarkGroup.add(obj);
      if (entry.collider) {
        colliders.push({ x: entry.x, z: entry.z, radius: entry.collider });
      }
      return obj;
    };

    for (const entry of LAYOUT.shrine?.placements ?? []) place(entry);
    for (const entry of LAYOUT.camp?.placements ?? []) place(entry);
    for (const entry of LAYOUT.accents ?? []) place(entry);

    // The shrine floor: a thin pale disc flush with the ground. The design calls
    // for an old paved circle, not a snowfield, so it is a restrained 5.5 m and
    // tinted toward the meadow's warm stone rather than near-white.
    const shrine = vale.landmarks?.shrine ?? { x: 0, z: -31 };
    const discMat = new THREE.MeshStandardMaterial({
      color: VALE_PALETTE.pathEdge,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40), discMat);
    disc.name = "shrineFloor";
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(shrine.x, GROUND_Y + 0.03, shrine.z);
    landmarkGroup.add(disc);

    // A second, smaller ring at the camp entrance.
    const camp = vale.landmarks?.camp ?? { x: 29, z: 17 };
    const campDisc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), discMat);
    campDisc.name = "campFloor";
    campDisc.rotation.x = -Math.PI / 2;
    campDisc.position.set(camp.x - 2.4, GROUND_Y + 0.028, camp.z + 1.2);
    landmarkGroup.add(campDisc);
  }

  function buildScenery(templates) {
    scenery = createScenery({
      palette: VALE_PALETTE,
      config: vale,
      rng: random,
      templates,
      bounds,
      pathDistance,
      groundHeight: () => GROUND_Y,
    });
    sceneryGroup.add(scenery.group);
    for (const c of scenery.colliders) colliders.push(c);
  }

  const ready = essential
    .then((entries) => {
      const templates = buildTemplates(entries);
      // Essential templates: without trees and the coin there is no map. Fail
      // loudly rather than silently starting an empty scene.
      const missing = sceneryKeys.filter((k) => !templates[k]);
      if (!templates[COIN_KEY]) missing.push(COIN_KEY);
      if (missing.length) {
        throw new Error(`[world] essential valley assets failed to load: ${missing.join(", ")}`);
      }
      buildLandmarks(templates);
      buildScenery(templates);
    })
    .catch((err) => {
      console.error("[world] build failed", err);
      throw err;
    });

  /* ---------------- spawn ---------------- */

  const spawnAnchors = vale.spawnAnchors ?? [{ x: 0, z: 0 }];

  function blocked(x, z) {
    for (const c of colliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      const r = (c.radius || 0) + COLLIDER_PAD;
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (const h of hazards) {
      const dx = x - h.x;
      const dz = z - h.z;
      const r = (h.radius || 0) + HAZARD_PAD;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  function inBounds(x, z) {
    return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
  }

  // Spawns must be in bounds, on the ground, away from the player and away from
  // solid props. If random rejection fails, fall back to a checked open-clearing
  // anchor instead of returning the last rejected candidate (the old dungeon
  // behaviour, which could place an enemy inside a wall).
  function spawnPoint(spawnRng, awayFrom, minDist = 0) {
    const r = typeof spawnRng === "function" ? spawnRng : random;
    const ax = awayFrom?.x;
    const az = awayFrom?.z;
    const min2 = minDist * minDist;
    for (let i = 0; i < SPAWN_TRIES; i++) {
      const x = bounds.minX + r() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + r() * (bounds.maxZ - bounds.minZ);
      if (ax !== undefined && ax !== null) {
        const dx = x - ax;
        const dz = z - az;
        if (dx * dx + dz * dz < min2) continue;
      }
      if (blocked(x, z)) continue;
      return new THREE.Vector3(x, GROUND_Y, z);
    }
    // Fallback: pick the best checked anchor (in bounds, unblocked, far enough).
    let best = null;
    let bestScore = -Infinity;
    for (const anchor of spawnAnchors) {
      if (!inBounds(anchor.x, anchor.z)) continue;
      if (blocked(anchor.x, anchor.z)) continue;
      let score = 0;
      if (ax !== undefined && ax !== null) {
        score = Math.hypot(anchor.x - ax, anchor.z - az);
        if (score * score < min2) continue;
      }
      if (score > bestScore) {
        bestScore = score;
        best = anchor;
      }
    }
    if (best) return new THREE.Vector3(best.x, GROUND_Y, best.z);
    // Last resort that can never be blocked or out of bounds: the meadow centre,
    // which is guaranteed open by the layout rules.
    return new THREE.Vector3(0, GROUND_Y, 0);
  }

  /* ---------------- lifecycle ---------------- */

  let elapsedTime = 0;

  // Stylized water: one colour lerp against a reused scratch colour, no
  // per-frame allocation and no geometry churn.
  const waterBase = new THREE.Color(VALE_PALETTE.water);
  const waterDeep = new THREE.Color(VALE_PALETTE.waterDeep);
  const waterScratch = new THREE.Color();

  function update(dt, elapsed = 0) {
    elapsedTime = elapsed;
    if (scenery) scenery.update(dt, elapsed);
    waterUniforms.value = elapsed;
    const shimmer = 0.5 + 0.5 * Math.sin(elapsed * 0.55);
    waterScratch.copy(waterBase).lerp(waterDeep, 0.12 + shimmer * 0.1);
    lakeMat.color.copy(waterScratch);
  }

  function reset() {
    elapsedTime = 0;
    if (scenery) scenery.reset();
    lakeMat.color.copy(waterBase);
  }

  return {
    group,
    colliders,
    hazards,
    bounds,
    coinTemplate,
    torchCount: 0,
    spawnPoint,
    update,
    reset,
    ready,
    // Read-only handles used by the handoff evidence tooling and debugging.
    get scenery() {
      return scenery;
    },
    pathDistance,
    get elapsed() {
      return elapsedTime;
    },
  };
}
