import * as THREE from "three";
import { MEADOW, MEADOW_LIGHT } from "./palette.js";
import {
  createGhibliBotanicalMaterial,
  REFB_SHARED_UNIFORMS,
  REFB_PALETTE,
  PartGeometryBuilder,
  createMeadowGrassTuftGeometry,
  createHeroBellflowerClumpGeometry,
  createSingleBellflowerStalkGeometry,
  createSecondaryVioletSprigGeometry,
  createChamomileDaisyClusterGeometry,
  createFacetedMeadowRockGeometry,
} from "./port/refb-kit.js";
import { createAnimeFlowerTree, setTreeSunDirection } from "./port/anime-flower-tree.js";


// Sunpetal Vale ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â meadow dressing built from the PORTED reference assets.
//
// The geometries and the material here come verbatim from the reference scene
// (see port/refb-kit.js): the 2-colour vertex ramp, the arching-leaf grass, the
// star-bellflower clumps, the chamomile daisies, the faceted rocks and the tree
// canopies built from the same leaf primitive.
//
// This module only decides WHERE they go on our 96 x 96 map, and batches them
// into instanced meshes split by spatial tile so the frustum can cull.
//
// The whole meadow is self-lit by the ported material (no scene lights), so the
// sun direction has to be handed to it explicitly and kept in sync with the sky.

const TAU = Math.PI * 2;
const PLAY_HALF = 46;
const LAKE = { cx: -66, cz: -3.5, rx: 16, rz: 22 };

const TREE_TILE = 80;
const GRASS_TILE = 48;
const GRASS_LOD_NEAR = 24;   // metres: full tuft inside, cheap tuft outside

/* -------------------------------------------------------------------------- */
/* placement noise (kept local: this module imports nothing from the game)     */
/* -------------------------------------------------------------------------- */

function hash2(ix, iz) {
  let h = ix * 374761393 + iz * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz;
}

function fbm(x, z, oct = 3) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * noise2(x * freq, z * freq);
    norm += amp;
    freq *= 2.02;
    amp *= 0.5;
  }
  return v / norm;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/* instancing                                                                 */
/* -------------------------------------------------------------------------- */

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Build one InstancedMesh from a placement list. Split out of addTiled so the
 * LOD system can build two meshes (full + cheap) that share the same matrices.
 */
function makeInstanced(geometry, material, placements, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    tmpPos.set(p.x, p.y, p.z);
    if (p.tiltX || p.tiltZ) {
      tmpQuat.setFromEuler(new THREE.Euler(p.tiltX || 0, p.yaw || 0, p.tiltZ || 0, "YXZ"));
    } else {
      tmpQuat.setFromAxisAngle(Y_AXIS, p.yaw || 0);
    }
    const s = p.scale ?? 1;
    tmpScale.set(s * (p.sx ?? 1), s * (p.sy ?? 1), s * (p.sz ?? 1));
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    mesh.setMatrixAt(i, tmpMatrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * Cheap grass tuft for distance: 4 blades instead of 7-9, two segments instead
 * of three (~24 tris instead of 70-90). Same grass palette and per-variant
 * blade proportions as the full tuft in createMeadowGrassTuftGeometry, so the
 * LOD swap changes only blade count, not colour or blade shape. Swapped in past
 * GRASS_LOD_NEAR metres, where a tuft is ~10 screen pixels tall.
 */
function createLowGrassTuft(variant = 0) {
  const rand = mulberry32(9001 + variant * 733);
  const b = new PartGeometryBuilder();
  const bladeCount = 4;
  // The full builder only branches on variant 1 (tall accent); variants 0 and
  // 2 are both the short turf, so the low tuft must branch the same way.
  const isTall = variant === 1;
  for (let i = 0; i < bladeCount; i++) {
    const yaw = (i / bladeCount) * Math.PI * 2 + (rand() - 0.5) * 0.45;
    const rOff = 0.02 + rand() * 0.09;
    b.addArchingLeaf({
      baseX: Math.cos(yaw) * rOff,
      baseY: 0.0,
      baseZ: Math.sin(yaw) * rOff,
      yaw,
      pitch: isTall ? 0.62 + rand() * 0.32 : 0.52 + rand() * 0.35,
      length: isTall ? 0.48 + rand() * 0.28 : 0.24 + rand() * 0.15,
      width: isTall ? 0.068 + rand() * 0.025 : 0.058 + rand() * 0.022,
      arch: isTall ? 0.32 : 0.22,
      fold: 0.01,
      segments: 2,
      colBaseSun: REFB_PALETTE.grassRootSun,
      colTipSun: i % 2 === 0 ? REFB_PALETTE.grassSunBright : REFB_PALETTE.grassSunMid,
      colBaseShd: REFB_PALETTE.grassShadeDeep,
      colTipShd: REFB_PALETTE.grassShadeMid,
      windScale: isTall ? 0.75 : 0.45,
    });
  }
  return b.toGeometry(false);
}

/**
 * Batch placements into one InstancedMesh per spatial tile.
 * A placement is { x, y, z, yaw, scale, tiltX?, tiltZ? }.
 */
function addTiled(group, geometry, material, placements, tileSize, name, opts = {}) {
  if (!placements.length) return 0;
  const tiles = new Map();
  for (const p of placements) {
    const key = `${Math.floor(p.x / tileSize)},${Math.floor(p.z / tileSize)}`;
    let list = tiles.get(key);
    if (!list) tiles.set(key, (list = []));
    list.push(p);
  }

  let made = 0;
  for (const list of tiles.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.name = name;
    mesh.castShadow = opts.castShadow === true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      tmpPos.set(p.x, p.y, p.z);
      if (p.tiltX || p.tiltZ) {
        tmpQuat.setFromEuler(new THREE.Euler(p.tiltX || 0, p.yaw || 0, p.tiltZ || 0, "YXZ"));
      } else {
        tmpQuat.setFromAxisAngle(Y_AXIS, p.yaw || 0);
      }
      const s = p.scale ?? 1;
      tmpScale.set(s * (p.sx ?? 1), s * (p.sy ?? 1), s * (p.sz ?? 1));
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    made += 1;
  }
  return made;
}

/* -------------------------------------------------------------------------- */
/* main factory                                                               */
/* -------------------------------------------------------------------------- */

export function createMeadowKit(options = {}) {
  const {
    rng,
    seed = 20261017,
    heightAt = () => 0,
    pathDistance = () => 999,
    sunDir,
    quality = "high",
    canopyIntensity = 0.28,
    // Scenes that place their own landmark tree at (0, -38.5) can suppress the
    // default centre feature tree. Used by handoff/map-bg/preview-tree.html.
    centreTree = true,
  } = options;

  const random = typeof rng === "function" ? rng : mulberry32(seed);

  const group = new THREE.Group();
  group.name = "meadowKit";

  const colliders = [];
  const stats = {
    instances: 0,
    triangles: 0,
    drawCalls: 0,
    trees: 0,
    grass: 0,
    flowers: 0,
    rocks: 0,
    grassLodTris: 0,
  };

  // Sun direction drives the ramp and the canopy rim. Keep it in sync with the
  // sky: the ported material is self-lit, so this is the only "light" it gets.
  if (sunDir) REFB_SHARED_UNIFORMS.uSunDir.value.copy(sunDir).normalize();
  if (sunDir) setTreeSunDirection(sunDir);
  REFB_SHARED_UNIFORMS.uCanopyIntensity.value = canopyIntensity;
  // B's "-z aerial depth fade" is a 26 m diorama trick; on a 96 m map it washes
  // the whole northern meadow pale. Real scene fog does that job for us.
  REFB_SHARED_UNIFORMS.uDepthFade.value = 0;

  // Stamen colour is baked into the flower geometry, so it has to be overridden
  // before any of it is built. The ported palette stores display-referred
  // numbers with no colour-space conversion (rawColor()), so match that with
  // setRGB -- setStyle would convert sRGB->linear and turn these cream values
  // dark brown. Saturated gold/orange read as neon dots on every lily.
  // Round 3: move the grass RAMP's hue, not just its value. The tufts were hue 78
  // (yellow-green); hue 93-95 needs G much closer to R. These are display-referred
  // numbers (REFB_PALETTE is built with rawColor), hence setRGB, not setStyle.
  REFB_PALETTE.grassSunBright.setRGB(0xb8 / 255, 0xe6 / 255, 0x9c / 255); // #b8e69c hue 97 val 0.90
  REFB_PALETTE.grassSunMid.setRGB(0x8f / 255, 0xb9 / 255, 0x6f / 255); // #8fb96f hue 94
  REFB_PALETTE.grassRootSun.setRGB(0x6f / 255, 0x94 / 255, 0x55 / 255); // #6f9455 hue 95
  REFB_PALETTE.grassShadeMid.setRGB(0x47 / 255, 0x70 / 255, 0x5c / 255); // #47705c
  REFB_PALETTE.grassShadeDeep.setRGB(0x3a / 255, 0x5c / 255, 0x50 / 255); // #3a5c50

  REFB_PALETTE.stamenGold.setRGB(0xf2 / 255, 0xe2 / 255, 0xb0 / 255);
  REFB_PALETTE.stamenOrange.setRGB(0xe2 / 255, 0xc8 / 255, 0x90 / 255);

  /* ---------------- materials (one per role) ---------------- */

  const matFoliage = createGhibliBotanicalMaterial({ fog: true, isPetal: false, isRock: false, isTerrain: false, flipBackfaces: false });
  const matPetal = createGhibliBotanicalMaterial({ fog: true, isPetal: true, isRock: false, isTerrain: false, flipBackfaces: false });
  const matRock = createGhibliBotanicalMaterial({ fog: true, isPetal: false, isRock: true, isTerrain: false });

  /* ---------------- geometry ---------------- */

  const grassGeos = [0, 1, 2].map((v) => createMeadowGrassTuftGeometry(v));
  const bellGeos = [0, 1, 2].map((v) => createHeroBellflowerClumpGeometry(v));
  const stalkGeos = [0, 1, 2].map((v) => createSingleBellflowerStalkGeometry(v));
  const violetGeos = [0, 1, 2].map((v) => createSecondaryVioletSprigGeometry(v));
  const daisyGeos = [0, 1, 2].map((v) => createChamomileDaisyClusterGeometry(v));
  const rockGeos = [0, 1, 2].map((v) => {
    const geo = createFacetedMeadowRockGeometry(v);
    // The reference rocks are authored for a close-up diorama and are very
    // light. At map scale they read as white eggs, so the baked ramp is pulled
    // down a touch (the geometry itself is untouched).
    for (const name of ["color", "aShadowColor"]) {
      const attr = geo.getAttribute(name);
      if (!attr) continue;
      for (let i = 0; i < attr.count; i++) {
        attr.setXYZ(i, attr.getX(i) * 0.82, attr.getY(i) * 0.82, attr.getZ(i) * 0.84);
      }
      attr.needsUpdate = true;
    }
    return geo;
  });

  function triCount(geo) {
    const idx = geo.index;
    return (idx ? idx.count : geo.attributes.position.count) / 3;
  }

  /* ---------------- placement helpers ---------------- */

  const inLake = (x, z) => {
    const nx = (x - LAKE.cx) / LAKE.rx;
    const nz = (z - LAKE.cz) / LAKE.rz;
    return Math.hypot(nx, nz) < 1.08;
  };

  // Meadow clearing: the open combat area. Grass stays short here, no trees.
  function clearingMask(x, z) {
    const d = Math.hypot(x, z);
    return smoothstep(26, 14, d);
  }

  // Flower drift field: a low-frequency noise that says where a colour patch
  // lives. Same field is used by the ground shader's flower speckle, so the 3D
  // flowers land on ground that is already tinted for them.
  function drift(x, z, offset = 0) {
    return fbm(x * 0.055 + offset, z * 0.055 - offset, 3);
  }

  /* ---------------- grass ---------------- */

  const grassPlacements = [[], [], []];
  const grassTarget = quality === "low" ? 3800 : 7500;
  let placed = 0;
  let guard = 0;
  while (placed < grassTarget && guard < grassTarget * 8) {
    guard += 1;
    // Two thirds of the field lands inside the playable square (where the
    // player and the camera live); the rest dresses the scenic ring.
    let x;
    let z;
    if (random() < 0.68) {
      x = (random() * 2 - 1) * PLAY_HALF;
      z = (random() * 2 - 1) * PLAY_HALF;
    } else {
      x = (random() * 2 - 1) * (PLAY_HALF + 34);
      z = (random() * 2 - 1) * (PLAY_HALF + 34);
    }
    if (inLake(x, z)) continue;
    const pd = pathDistance(x, z);
    if (pd < 0.5) continue;

    const meadow = clearingMask(x, z);
    // Short turf inside the combat clearing, tall arching grass on the verges.
    const tall = 1 - meadow;
    const s = (0.66 + random() * 0.46) * (0.95 + tall * 0.55);
    const cluster = fbm(x * 0.25 + 6, z * 0.25 - 4, 2);
    const boost = cluster > 0.52 ? 1.2 : 1;
    const variant = random() < 0.5 ? 0 : random() < 0.6 ? 1 : 2;
    grassPlacements[variant].push({
      x,
      y: heightAt(x, z),
      z,
      yaw: random() * TAU,
      tiltX: (random() - 0.5) * 0.1,
      tiltZ: (random() - 0.5) * 0.1,
      scale: s * boost,
      sy: (0.9 + random() * 0.35) * (meadow ? 0.78 : 1.05),
    });
    placed += 1;
  }

  // Near-field pass. clearingMask() deliberately flattens the grass inside 14 m
  // of the origin (tall = 0 -> scale x0.95, sy x0.78), which left the camera's
  // own foreground as bare ground. This pass ignores the clearing and stands the
  // tufts up. It is ONE pass, not two: round 2's split (1800 + 600) left a density
  // and colour step at the boundary. The box is tapered over its last 2.5 m so its
  // front edge does not project a hard line across the eye/lake views. The tufts
  // join the existing per-tile InstancedMeshes: no new draw calls, full LOD.
  // 1750, not the plan's 2600: the wider box (+-16) and the tighter 1.2 m taper
  // made the pass ACCEPT far more tufts than the plan projected, which put the
  // view at 1,058,886 tris. The detail now comes from the 1,200 low-tuft fine
  // layer below, which costs 24 tris a blade instead of 70.
  const nearCount = 1750;
  for (let i = 0; i < nearCount; i++) {
    const x = -16 + random() * 32; // +-16 m
    const z = -2 + random() * 18.5; // z -2 .. 16.5 (eye camera at z=18 has grass 1.5 m ahead)
    const edge = Math.min(16 - Math.abs(x), z + 2, 16.5 - z);
    if (random() > smoothstep(0, 1.2, edge)) continue;
    if (inLake(x, z)) continue;
    if (pathDistance(x, z) < 0.9) continue; // keep the path corridor clear
    const variant = random() < 0.5 ? 0 : random() < 0.6 ? 1 : 2;
    // Three size classes, so the near field does not read as one stamped rosette.
    const sizeClass = random() < 0.34 ? 0.85 : random() < 0.5 ? 1.0 : 1.15;
    grassPlacements[variant].push({
      x,
      y: heightAt(x, z),
      z,
      yaw: random() * TAU,
      tiltX: (random() - 0.5) * 0.1,
      tiltZ: (random() - 0.5) * 0.1,
      scale: (0.6 + random() * 0.5) * sizeClass,
      sy: 1.05 + random() * 0.2,
    });
    placed += 1;
  }

  // Framing fringe: tall blades 1.5-3 m from the lens so the bottom edge of the
  // frame is crossed by grass instead of being an empty plane. 28, not 40: they
  // now sit inside a dense pass and the rest were wasted triangles.
  for (let i = 0; i < 28; i++) {
    const x = -7 + random() * 14;
    const z = 11.0 + random() * 1.5;
    if (pathDistance(x, z) < 1.0) continue;
    grassPlacements[1].push({
      x,
      y: heightAt(x, z),
      z,
      yaw: random() * TAU,
      tiltX: (random() - 0.5) * 0.08,
      tiltZ: (random() - 0.5) * 0.08,
      scale: 1.0 + random() * 0.4,
      sy: 1.15,
    });
  }

  // Fine layer: 1,200 LOW tufts (24 tris) at half the blades' size, same box and
  // same taper. This is the detail lever: shrinking the coverage pass is what
  // lost the near-field gradient in round 3, so the structure stays and the fine
  // blades are added on top.
  const finePlacements = [[], [], []];
  for (let i = 0; i < 1200; i++) {
    const x = -16 + random() * 32;
    const z = -2 + random() * 18.5;
    const edge = Math.min(16 - Math.abs(x), z + 2, 16.5 - z);
    if (random() > smoothstep(0, 1.2, edge)) continue;
    if (inLake(x, z)) continue;
    if (pathDistance(x, z) < 0.9) continue;
    finePlacements[random() < 0.5 ? 0 : random() < 0.6 ? 1 : 2].push({
      x, y: heightAt(x, z), z,
      yaw: random() * TAU,
      tiltX: (random() - 0.5) * 0.12,
      tiltZ: (random() - 0.5) * 0.12,
      scale: 0.30 + random() * 0.20,
      sy: 1.0 + random() * 0.2,
    });
  }

  // Shrine patch: the shrine camera sits at z = -22, outside the near box, so its
  // own foreground was bare. Same low tuft, same taper.
  const shrinePlacements = [[], [], []];
  for (let i = 0; i < 500; i++) {
    const x = -12 + random() * 24;
    const z = -40 + random() * 22;
    const edge = Math.min(12 - Math.abs(x), z + 40, -18 - z);
    if (random() > smoothstep(0, 1.2, edge)) continue;
    if (inLake(x, z)) continue;
    if (pathDistance(x, z) < 0.9) continue;
    shrinePlacements[random() < 0.5 ? 0 : random() < 0.6 ? 1 : 2].push({
      x, y: heightAt(x, z), z,
      yaw: random() * TAU,
      tiltX: (random() - 0.5) * 0.12,
      tiltZ: (random() - 0.5) * 0.12,
      scale: 0.40 + random() * 0.30,
      sy: 1.0 + random() * 0.2,
    });
  }

  // Grass is 79% of the triangle budget, so it is the one family that gets a
  // distance LOD. Each spatial tile holds two InstancedMeshes built from the
  // SAME matrices: the reference tuft (70 tris) and a cheap tuft (30 tris).
  // update() shows one of the pair based on camera distance. Off-screen tiles
  // are frustum-culled as whole meshes, which is why the tiles are 24 m.
  const lowGrassGeos = [0, 1, 2].map((v) => createLowGrassTuft(v));
  for (let v = 0; v < 3; v++) {
    if (finePlacements[v].length) {
      const calls = addTiled(group, lowGrassGeos[v], matFoliage, finePlacements[v], GRASS_TILE, "kitGrassFine" + v);
      stats.drawCalls += calls;
      stats.instances += finePlacements[v].length;
      stats.grass += finePlacements[v].length;
      stats.triangles += triCount(lowGrassGeos[v]) * finePlacements[v].length;
    }
    if (shrinePlacements[v].length) {
      const calls = addTiled(group, lowGrassGeos[v], matFoliage, shrinePlacements[v], GRASS_TILE, "kitGrassShrine" + v);
      stats.drawCalls += calls;
      stats.instances += shrinePlacements[v].length;
      stats.grass += shrinePlacements[v].length;
      stats.triangles += triCount(lowGrassGeos[v]) * shrinePlacements[v].length;
    }
  }
  const grassLod = [];
  for (let v = 0; v < 3; v++) {
    const list = grassPlacements[v];
    if (!list.length) continue;
    const tiles = new Map();
    for (const p of list) {
      const key = `${Math.floor(p.x / GRASS_TILE)},${Math.floor(p.z / GRASS_TILE)}`;
      let arr = tiles.get(key);
      if (!arr) tiles.set(key, (arr = []));
      arr.push(p);
    }
    for (const arr of tiles.values()) {
      const full = makeInstanced(grassGeos[v], matFoliage, arr, `kitGrass${v}`);
      const low = makeInstanced(lowGrassGeos[v], matFoliage, arr, `kitGrassLow${v}`);
      low.visible = false;
      group.add(full, low);
      let cx = 0;
      let cz = 0;
      for (const p of arr) {
        cx += p.x;
        cz += p.z;
      }
      grassLod.push({ full, low, x: cx / arr.length, z: cz / arr.length });
      stats.instances += arr.length;
      stats.grass += arr.length;
      stats.triangles += triCount(grassGeos[v]) * arr.length;
      stats.grassLodTris += triCount(lowGrassGeos[v]) * arr.length;
    }
  }
  stats.drawCalls += grassLod.length; // one mesh of each pair draws at a time

  /* ---------------- flowers ---------------- */

  // Bellflower drifts: a handful of pockets, one dominant colour per pocket.
  // The reference places flowers as "compositional islands", never as confetti.
  const driftCentres = [];
  const driftCount = quality === "low" ? 7 : 14;
  for (let i = 0; i < driftCount; i++) {
    // Deterministic pockets around the meadow edge, plus one in the middle.
    const a = (i / driftCount) * TAU + 0.7;
    const r = i === 0 ? 6 : 17 + random() * 20;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inLake(x, z)) continue;
    driftCentres.push({ x, z, r: 5.5 + random() * 6.5, bell: i % 3, daisy: (i + 1) % 3 });
  }

  const bellPlacements = [[], [], []];
  const stalkPlacements = [[], [], []];
  const violetPlacements = [[], [], []];
  const daisyPlacements = [[], [], []];

  for (const c of driftCentres) {
    const count = quality === "low" ? 26 : 58;
    for (let i = 0; i < count; i++) {
      const a = random() * TAU;
      const r = Math.sqrt(random()) * c.r;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (inLake(x, z)) continue;
      if (pathDistance(x, z) < 1.1) continue;
      // Thin the central band: 58 clumps per pocket at 2.5-3 m tall filled the
      // frame between the camera and the tree line and hid the path.
      if (Math.abs(x) < 10 && z > -32 && random() < 0.55) continue;
      const y = heightAt(x, z);
      const roll = random();
      // Near the camera the clumps were 2.5-3 m tall; the tree-line band
      // (z <= -30) reads well and keeps its size.
      const clumpScale = z > -30 ? 0.48 + random() * 0.18 : 0.85 + random() * 0.45;
      const base = { x, y, z, yaw: random() * TAU, scale: clumpScale };
      if (roll < 0.42) {
        bellPlacements[c.bell].push({ ...base, sy: 0.9 + random() * 0.3 });
      } else if (roll < 0.62) {
        stalkPlacements[Math.floor(random() * 3)].push({ ...base, scale: 0.9 + random() * 0.5 });
      } else if (roll < 0.8) {
        violetPlacements[Math.floor(random() * 3)].push({ ...base, scale: 0.8 + random() * 0.4 });
      } else {
        daisyPlacements[c.daisy].push({ ...base, scale: 0.85 + random() * 0.45 });
      }
    }
  }

  // A few hero clumps framing the player start, like the reference foreground.
  for (let i = 0; i < (quality === "low" ? 3 : 7); i++) {
    const a = -0.4 + i * 0.22;
    const r = 7.5 + random() * 2.5;
    const x = Math.sin(a) * r;
    const z = 5.5 + Math.cos(a) * 2.2;
    if (inLake(x, z)) continue;
    bellPlacements[i % 3].push({
      x, y: heightAt(x, z), z,
      yaw: random() * TAU,
      // Was 1.15-1.55: at 8 m from the lens those hero clumps stood 2.5-3 m and
      // dominated the lower frame.
      scale: 0.62 + random() * 0.22,
    });
  }

  const flowerFamilies = [
    { geos: bellGeos, lists: bellPlacements, mat: matPetal, name: "kitBellflower" },
    { geos: stalkGeos, lists: stalkPlacements, mat: matPetal, name: "kitBellStalk" },
    { geos: violetGeos, lists: violetPlacements, mat: matPetal, name: "kitViolet" },
    { geos: daisyGeos, lists: daisyPlacements, mat: matPetal, name: "kitDaisy" },
  ];
  for (const fam of flowerFamilies) {
    for (let v = 0; v < 3; v++) {
      const list = fam.lists[v];
      const calls = addTiled(group, fam.geos[v], fam.mat, list, GRASS_TILE, `${fam.name}${v}`);
      stats.drawCalls += calls;
      stats.instances += list.length;
      stats.flowers += list.length;
      stats.triangles += triCount(fam.geos[v]) * list.length;
    }
  }

  /* ---------------- rocks ---------------- */

  const rockPlacements = [[], [], []];
  // Shoreline: bigger, half-sunk boulders on the waterline, with gaps. Small
  // evenly spaced rocks read as a pearl necklace, which is worse than no rocks.
  const shoreCount = quality === "low" ? 12 : 22;
  for (let i = 0; i < shoreCount; i++) {
    const a = (i / shoreCount) * TAU + (random() - 0.5) * 0.22;
    const out = (random() - 0.5) * 3.2;
    const x = LAKE.cx + Math.cos(a) * (LAKE.rx + 0.9 + out);
    const z = LAKE.cz + Math.sin(a) * (LAKE.rz + 0.9 + out);
    if (random() < 0.18) continue;
    const scale = 1.1 + random() * 1.9;
    rockPlacements[i % 3].push({
      x,
      y: Math.max(heightAt(x, z), -0.55) - scale * 0.22,
      z,
      yaw: random() * TAU,
      scale,
    });
  }
  // Meadow accents: a few clusters for gameplay composition.
  const rockClusters = [
    [34, -12], [24, 30], [-36, 8], [-20, -34], [12, -38], [40, 40], [-42, 34],
  ];
  for (let c = 0; c < rockClusters.length; c++) {
    const [cx, cz] = rockClusters[c];
    const n = 2 + Math.floor(random() * 2);
    for (let i = 0; i < n; i++) {
      const x = cx + (random() - 0.5) * 3.5;
      const z = cz + (random() - 0.5) * 3.5;
      if (inLake(x, z)) continue;
      if (pathDistance(x, z) < 2.2) continue;
      rockPlacements[c % 3].push({
        x, y: heightAt(x, z) - 0.12, z,
        yaw: random() * TAU,
        scale: 0.7 + random() * 1.2,
      });
    }
  }
  for (let v = 0; v < 3; v++) {
    const list = rockPlacements[v];
    const calls = addTiled(group, rockGeos[v], matRock, list, GRASS_TILE, `kitRock${v}`, { castShadow: false });
    stats.drawCalls += calls;
    stats.instances += list.length;
    stats.rocks += list.length;
    stats.triangles += triCount(rockGeos[v]) * list.length;
  }

  /* ---------------- trees (procedural flowering trees) ---------------- */

  // Each tree is unique (procedural trunk + instanced leaves/flowers), so they
  // are built once and kept as objects. Two LOD tiers: full detail near the
  // playable meadow, a light tier for the perimeter woods.
  const TREE_LOD = {
    // The shrine tree is the source page's tree, untouched: original counts and
    // authored scale. Everything else trades density for the triangle budget.
    // Round 2 thins the leaf cards so blossom dominates the canopy; flowerCount
    // is per-tree in the ported builder and is unchanged.
    hero: { leafCount: 2600, flowerCount: 1450, natural: true },
    full: { leafCount: 600, flowerCount: 180, leafScale: 1.25, barkDetail: 0.8 },
    low: { leafCount: 350, flowerCount: 80, leafScale: 1.7, barkDetail: 0.55 },
  };

  const treeObjects = [];

  function addTree(x, z, scale, tier = "low") {
    const lod = TREE_LOD[tier];
    const t = createAnimeFlowerTree({
      seed: 101 + stats.trees * 37,
      leafCount: lod.leafCount,
      flowerCount: lod.flowerCount,
      height: 12.5 * scale,
      natural: lod.natural === true,
      leafScale: lod.leafScale ?? 1,
      barkDetail: lod.barkDetail ?? 1,
    });
    t.group.position.set(x, heightAt(x, z), z);
    t.group.rotation.y = random() * TAU;
    group.add(t.group);
    treeObjects.push(t);
    stats.trees += 1;
    stats.drawCalls += t.stats.draws;
    stats.instances += 1;
    stats.triangles += t.stats.triangles;
    if (Math.abs(x) < PLAY_HALF && Math.abs(z) < PLAY_HALF) {
      colliders.push({ x, z, radius: Math.max(0.5, 0.55 * scale) });
    }
  }

  const tierFor = (x, z) => (Math.hypot(x, z) < 56 ? "full" : "low");

  // 1. Feature trees: the composition anchors, always full detail.
  if (centreTree) addTree(0, -38.5, 1.0, "hero");
  addTree(-9.5, -36.5, 0.95, "full");
  addTree(10.5, -36.0, 0.95, "full");
  addTree(-41.5, -9.5, 1.0, "full");
  addTree(39.5, 23.0, 1.0, "full");
  addTree(-29.0, 27.5, 0.95, "full");
  addTree(-17.0, 28.5, 0.9, "full");

  // 2. Woodland wall: clustered silhouettes outside the playable square.
  const wallClusters = quality === "low" ? 4 : 5;
  for (let c = 0; c < wallClusters; c++) {
    const a = (c / wallClusters) * TAU + random() * 0.4;
    const radius = 54 + random() * 32;
    const cx = Math.cos(a) * radius;
    const cz = Math.sin(a) * radius;
    const n = 2 + Math.floor(random() * 2);
    for (let i = 0; i < n; i++) {
      const x = cx + (random() - 0.5) * 12;
      const z = cz + (random() - 0.5) * 12;
      if (inLake(x, z)) continue;
      addTree(x, z, 0.85 + random() * 0.3, "low");
    }
  }

  // 3. Inner scatter between the wall and the playable edge.
  for (let i = 0; i < (quality === "low" ? 3 : 4); i++) {
    const a = random() * TAU;
    const r = 50 + random() * 18;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inLake(x, z)) continue;
    addTree(x, z, 0.85 + random() * 0.2, "low");
  }

  // 4. Interior pockets near the square edge, off path and clearings.
  let pockets = 0;
  for (let attempt = 0; attempt < 3000 && pockets < (quality === "low" ? 4 : 5); attempt++) {
    const x = (random() * 2 - 1) * PLAY_HALF;
    const z = (random() * 2 - 1) * PLAY_HALF;
    const edge = Math.min(PLAY_HALF - Math.abs(x), PLAY_HALF - Math.abs(z));
    if (edge > 12 || edge < 1.5) continue;
    if (inLake(x, z)) continue;
    if (pathDistance(x, z) < 6) continue;
    if (Math.hypot(x, z) < 20) continue;
    addTree(x, z, 0.9 + random() * 0.15, tierFor(x, z));
    pockets += 1;
  }

  /* ---------------- animation ---------------- */

  function update(elapsed, camera) {
    const t = Number.isFinite(elapsed) ? elapsed : 0;
    REFB_SHARED_UNIFORMS.uTime.value = t;

    // Tree wind: each flowering tree owns its leaf/flower time uniforms.
    for (let i = 0; i < treeObjects.length; i++) treeObjects[i].update(t);

    if (camera && camera.position && grassLod.length) {
      const cx = camera.position.x;
      const cz = camera.position.z;
      const near2 = GRASS_LOD_NEAR * GRASS_LOD_NEAR;
      for (let i = 0; i < grassLod.length; i++) {
        const e = grassLod[i];
        const dx = cx - e.x;
        const dz = cz - e.z;
        const near = dx * dx + dz * dz < near2;
        if (e.full.visible !== near) {
          e.full.visible = near;
          e.low.visible = !near;
        }
      }
    }
  }

  const treeAnchors = treeObjects.map((t) => ({
    x: t.group.position.x,
    z: t.group.position.z,
  }));

  return {
    group,
    update,
    treeAnchors,
    colliders,
    stats,
    materials: { foliage: matFoliage, petal: matPetal, rock: matRock },
  };
}

export default createMeadowKit;
