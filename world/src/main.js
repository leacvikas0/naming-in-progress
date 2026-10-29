// ============================================================================
// world/src/main.js
//
// Stage 2 Assembled World: Terrain, Water & Landmarks + Tudor Village Houses +
// Toroidal Gouache Meadow + Stylized Time-of-Day Sky (Sun, Moon & Stars) +
// 4x MSAA HDR Post-Processing (Restrained Bloom & ACES Split-Tone Grade).
// ============================================================================

import * as THREE from 'three';
import {
  PLAY_BOUNDARY_RADIUS,
  INNER_EXTENT,
  ZONES,
  BUILDINGS,
  LANDMARKS,
  walkableHeightAt,
  terrainHeightAt,
  sampleWorld,
  createTerrainAndLandmarks,
} from '../assets/terrain/index.js';
import { createHousesKit } from '../assets/houses/index.js';
import { createToroidalMeadow, MEADOW_PROFILES } from '../assets/flowers/index.js';
import { createTimeOfDaySky, TOD_PRESETS } from './sky-tod.js';
import { createWorldPost } from './post.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------------- */
/* Renderer, Scene & Camera Setup                                            */
/* ------------------------------------------------------------------------- */

const canvas = document.getElementById('world-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});

const PROFILES = {
  desktop: {
    id: 'desktop',
    label: '🖥️ Desktop (RX 6700)',
    dpr: Math.min(window.devicePixelRatio || 1, 2.0),
    aaSamples: 4,
    meadowProfile: 'desktop',
  },
  tablet: {
    id: 'tablet',
    label: '📱 Tablet (Xiaomi Pad 7)',
    dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    aaSamples: 2,
    meadowProfile: 'tablet',
  },
};

let activeProfile = 'desktop';
renderer.setPixelRatio(PROFILES[activeProfile].dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8eef5);
scene.fog = new THREE.Fog(0xd8eef5, 165, 520);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.2,
  900
);

/* ------------------------------------------------------------------------- */
/* 1. Time-of-Day Sky (Stylized Sun, Moon, Stars & 10 Cumulus Clouds)        */
/* ------------------------------------------------------------------------- */

const sky = createTimeOfDaySky({
  quality: 'high',
  camera,
});
scene.add(sky.group);

/* ------------------------------------------------------------------------- */
/* 2. Terrain, Water, Landmarks & Botanical Trees (Zero Duplicate Houses)    */
/* ------------------------------------------------------------------------- */

const terrainKit = createTerrainAndLandmarks(renderer, {
  includeBuildings: false,
  includeHorizonClouds: false,
});
scene.add(terrainKit.group);

// Locate the landmark emissive material (pier lantern, arena gate lanterns, staircase lamps, shrine crystal)
const landmarkEmissiveMats = [];
terrainKit.landmarksGroup.traverse((obj) => {
  if (obj.isMesh && obj.name.endsWith('-emissive') && obj.material) {
    landmarkEmissiveMats.push(obj.material);
  }
});

/* ------------------------------------------------------------------------- */
/* 3. Tudor Village Houses Kit (5 Detailed Buildings + Colliders)            */
/* ------------------------------------------------------------------------- */

const housesKit = createHousesKit(renderer);
const village = housesKit.buildAllVillageBuildings(BUILDINGS);
scene.add(village.group);

for (const c of village.colliders) {
  terrainKit.colliders.push({
    ...c,
    hx: c.hx ?? c.halfW,
    hz: c.hz ?? c.halfD,
  });
}

/* ------------------------------------------------------------------------- */
/* 4. Toroidal Gouache Meadow & Valley-Wide Wildflower Drifts                */
/* ------------------------------------------------------------------------- */

function populateValleyWildflowerDrifts(meadowInstance) {
  // Curated colony centers across all 4 zones of the expanded valley:
  // Hamlet Commons perimeter, West Millpond & Pier lane, East Wisteria Arena, and North Shrine hills
  const colonies = [
    // Zone A: Hamlet Well Plaza & Cottage Perimeter Meadows
    { x: -7.5, z: 16.5, r: 7.5 },
    { x: 8.5, z: 17.0, r: 7.5 },
    { x: -23.5, z: -2.0, r: 8.0 },
    { x: 24.5, z: -1.5, r: 8.0 },
    { x: -8.5, z: -24.5, r: 7.5 },
    { x: 9.5, z: -24.0, r: 7.5 },
    { x: -5.5, z: 32.0, r: 9.0 },
    { x: 6.5, z: 34.0, r: 9.0 },
    // Zone B: West Millpond, Waterfall & Pier Meadow
    { x: -24.5, z: 13.5, r: 7.5 },
    { x: -31.0, z: 15.0, r: 7.0 },
    { x: -29.5, z: -11.5, r: 8.0 },
    { x: -36.5, z: -28.0, r: 8.0 },
    // Zone C: East Wisteria Combat Ring & Approach Way
    { x: 32.0, z: 3.5, r: 8.0 },
    { x: 42.0, z: -9.5, r: 8.0 },
    { x: 45.5, z: 6.5, r: 7.5 },
    { x: 68.0, z: -27.5, r: 8.5 },
    { x: 68.0, z: 19.5, r: 8.5 },
    { x: 91.0, z: -11.0, r: 8.0 },
    { x: 89.5, z: 7.0, r: 8.0 },
    // Zone D: North Shrine Staircase Hillsides & Overlook Perimeter
    { x: -9.0, z: -42.0, r: 8.5 },
    { x: 9.0, z: -42.0, r: 8.5 },
    { x: -10.5, z: -60.0, r: 8.5 },
    { x: 10.5, z: -60.0, r: 8.5 },
    { x: -19.5, z: -82.0, r: 7.5 },
    { x: 19.5, z: -82.0, r: 7.5 },
  ];

  const dummy = new THREE.Object3D();
  const keys = Object.keys(meadowInstance.flowerMeshes);

  keys.forEach((key, sIdx) => {
    const imesh = meadowInstance.flowerMeshes[key];
    const targetCount = MEADOW_PROFILES[activeProfile]?.counts?.[key] || imesh.count || 200;

    // Expand fade radius so wildflowers stay visible across long valley sightlines
    if (imesh.material?.uniforms) {
      imesh.material.uniforms.uFadeStart.value = 78.0;
      imesh.material.uniforms.uFadeEnd.value = 118.0;
    }

    let placed = 0;
    let attempt = 0;
    while (placed < targetCount && attempt < targetCount * 12) {
      attempt++;
      const cIdx = (placed + sIdx * 3) % colonies.length;
      const col = colonies[cIdx];
      const ang = hash(attempt * 7.13 + sIdx * 31.7) * Math.PI * 2;
      const rad = Math.sqrt(hash(attempt * 11.3 + sIdx * 17.9)) * col.r;
      const x = col.x + Math.cos(ang) * rad;
      const z = col.z + Math.sin(ang) * rad;

      const sw = sampleWorld(x, z);
      if (sw.foliageMask < 0.5) continue;

      dummy.position.set(x, terrainHeightAt(x, z), z);
      dummy.rotation.set(0, hash(attempt * 9.1 + sIdx) * Math.PI * 2, 0);
      const sc =
        key === 'toonShrub'
          ? 0.92 + hash(attempt * 15.7) * 0.42
          : 0.98 + hash(attempt * 17.3) * 0.45;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      imesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    imesh.count = placed;
    imesh.instanceMatrix.needsUpdate = true;
    meadowInstance.instanceCounts[key] = placed;
  });
}

let meadow = null;
function buildMeadowForProfile(profileName) {
  if (meadow) {
    scene.remove(meadow.group);
    meadow.dispose();
  }
  meadow = createToroidalMeadow({
    profile: PROFILES[profileName]?.meadowProfile || 'desktop',
    worldMaskTexture: terrainKit.worldMaskTex,
    sampleHeight: terrainHeightAt,
    worldExtent: INNER_EXTENT,
  });
  populateValleyWildflowerDrifts(meadow);
  scene.add(meadow.group);
}

buildMeadowForProfile(activeProfile);

/* ------------------------------------------------------------------------- */
/* 5. Playable Explorer Character Proxy & Locomotion                         */
/* ------------------------------------------------------------------------- */

function createExplorerCharacter() {
  const g = new THREE.Group();
  g.name = 'playerExplorer';
  const gradientMap = housesKit.mats.gradientMap;

  const tunicMat = new THREE.MeshToonMaterial({ color: 0xd95b26, gradientMap });
  const cloakMat = new THREE.MeshToonMaterial({ color: 0x2b4c7e, gradientMap });
  const skinMat = new THREE.MeshToonMaterial({ color: 0xf6d4b0, gradientMap });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 1.28, 12), tunicMat);
  body.position.y = 0.64;
  g.add(body);

  const cloak = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.38, 0.92, 12), cloakMat);
  cloak.position.set(0, 0.78, -0.03);
  g.add(cloak);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skinMat);
  head.position.y = 1.54;
  g.add(head);

  return g;
}

const playerGroup = createExplorerCharacter();
scene.add(playerGroup);

const player = {
  x: 2.8,
  z: 14.5,
  y: walkableHeightAt(2.8, 14.5),
  vy: 0,
  yaw: Math.PI + 0.15,
  speed: 7.5,
  sprintMult: 1.55,
  radius: 0.48,
  grounded: true,
};
playerGroup.position.set(player.x, player.y, player.z);
playerGroup.rotation.y = player.yaw;

/* ------------------------------------------------------------------------- */
/* 6. Post-Processing Pipeline (4x MSAA + Bloom + Time-of-Day Grade)         */
/* ------------------------------------------------------------------------- */

const post = createWorldPost({
  renderer,
  scene,
  camera,
  width: window.innerWidth,
  height: window.innerHeight,
  enabled: true,
  aaSamples: PROFILES[activeProfile].aaSamples,
});

/* ------------------------------------------------------------------------- */
/* 7. Full World Time-of-Day Material Synchronization                        */
/* ------------------------------------------------------------------------- */

const _dayWindowCol = new THREE.Color(0xffffff); // Shows painted sky-blue glass texture
const _nightWindowCol = new THREE.Color(0xffbe55);
const _nightWindowEmissive = new THREE.Color(0xff9d2e);

let currentTodT = TOD_PRESETS.day.t;
let autoCycleTod = false;

export function applyTimeOfDay(modeOrT) {
  const skyState = sky.setTimeOfDay(modeOrT);
  currentTodT = skyState.t;

  // 1. Sync Post-Processing Grade & Restrained Bloom
  post.setTimeOfDayGrade(currentTodT);

  // 2. Sync Scene Fog & Background
  scene.fog.color.copy(skyState.fogColor);
  scene.background.copy(skyState.fogColor);

  // 3. Sync Terrain & Water Shaders
  if (terrainKit.terrainMat?.uniforms) {
    terrainKit.terrainMat.uniforms.uSunDir.value.copy(skyState.activeLightDir);
    terrainKit.terrainMat.uniforms.uFogColor.value.copy(skyState.fogColor);
    terrainKit.terrainMat.uniforms.uLightTint.value.copy(skyState.worldTint);
  }
  if (terrainKit.waterMat?.uniforms) {
    terrainKit.waterMat.uniforms.uLightTint.value.copy(skyState.waterTint);
  }

  // 4. Sync Toroidal Meadow Grass, Wildflowers & Modeled Botanical Trees
  if (meadow?.sharedUniforms) {
    meadow.sharedUniforms.uSunDir.value.copy(skyState.activeLightDir);
    meadow.sharedUniforms.uLightTint.value.copy(skyState.worldTint);
  }
  if (terrainKit.treesSys) {
    terrainKit.treesSys.setSunDirection(skyState.activeLightDir);
    terrainKit.treesSys.setTimeOfDay(skyState.daylight, skyState.worldTint, skyState.fogColor);
  }

  // 5. Dynamic Cottage Window Candlelight, Porch Lanterns, Forge Embers & Shrine Crystal Bloom
  const glow = skyState.windowGlow;
  const glassMat = housesKit.mats.glass;
  if (glassMat) {
    glassMat.color.copy(_dayWindowCol).lerp(_nightWindowCol, glow);
    glassMat.emissive.copy(_nightWindowEmissive);
    glassMat.emissiveIntensity = 1.38 * glow;
  }

  // Boost unlit porch lanterns & forge embers into HDR at Evening/Night so UnrealBloomPass catches them
  const basicBucket = housesKit.mats.buckets?.solidBasic;
  if (basicBucket) {
    const hdrBoost = 1.0 + 0.68 * glow;
    basicBucket.color.setRGB(hdrBoost, hdrBoost * 0.96, hdrBoost * 0.88);
  }

  for (const emMat of landmarkEmissiveMats) {
    const hdrBoost = 1.0 + 0.72 * glow;
    emMat.color.setRGB(hdrBoost, hdrBoost * 0.96, hdrBoost * 0.90);
  }

  syncTodHudControls();
  return skyState;
}

/* ------------------------------------------------------------------------- */
/* 8. Camera Views (1-8) & Automated Verification Shots                      */
/* ------------------------------------------------------------------------- */

export const VIEWS = {
  entry: {
    id: 'entry',
    label: '1 · South Entry',
    mode: 'player',
    px: 0.0,
    pz: 26.0,
    yaw: Math.PI,
    pitch: 0.14,
    dist: 9.0,
  },
  plaza: {
    id: 'plaza',
    label: '2 · Well Plaza',
    mode: 'player',
    px: 3.4,
    pz: 15.2,
    yaw: Math.PI + 0.18,
    pitch: 0.10,
    dist: 8.6,
  },
  mill: {
    id: 'mill',
    label: '3 · Mill & Pier',
    mode: 'vista',
    pos: [-27.5, 5.8, 19.5],
    target: [-46.8, 2.2, -13.5],
    fov: 52,
  },
  arena: {
    id: 'arena',
    label: '4 · Wisteria Arena',
    mode: 'vista',
    pos: [37.5, 4.4, 6.8],
    target: [70.5, 4.2, -5.0],
    fov: 52,
  },
  shrine: {
    id: 'shrine',
    label: '5 · Shrine Arch',
    mode: 'vista',
    pos: [3.8, 10.4, -63.5],
    target: [-1.0, 12.2, -93.0],
    fov: 52,
  },
  shrineLookback: {
    id: 'shrineLookback',
    label: '6 · Sunset Vista',
    mode: 'vista',
    pos: [2.2, 15.6, -71.5],
    target: [-11.5, 7.2, 14.0],
    fov: 54,
  },
  aerial: {
    id: 'aerial',
    label: '7 · Aerial Masterplan',
    mode: 'vista',
    pos: [-16.0, 112.0, 138.0],
    target: [0.0, 0.0, -10.0],
    fov: 48,
  },
  topdown: {
    id: 'topdown',
    label: '8 · Top-Down Map',
    mode: 'vista',
    pos: [0.0, 250.0, -6.0],
    target: [0.0, 0.0, -6.1],
    fov: 46,
  },
};

export const WORLD_SHOTS = {
  'day-plaza': {
    id: 'day-plaza',
    tod: 'day',
    mode: 'vista',
    pos: [5.2, 3.8, 23.2],
    target: [-3.2, 5.8, -16.0],
    fov: 52,
    playerPos: [1.5, 11.5, Math.PI + 0.2],
  },
  'day-mill-pier': {
    id: 'day-mill-pier',
    tod: 'day',
    mode: 'vista',
    pos: [-27.5, 5.8, 19.5],
    target: [-46.8, 2.2, -13.5],
    fov: 52,
    playerPos: [-38.5, 8.5, Math.PI + 0.4],
  },
  'day-arena-wisteria': {
    id: 'day-arena-wisteria',
    tod: 'day',
    mode: 'vista',
    pos: [37.5, 4.4, 6.8],
    target: [70.5, 4.2, -5.0],
    fov: 52,
    playerPos: [46.0, -3.5, 1.55],
  },
  'day-shrine-arch': {
    id: 'day-shrine-arch',
    tod: 'day',
    mode: 'vista',
    pos: [3.8, 10.4, -63.5],
    target: [-1.2, 12.4, -93.0],
    fov: 52,
    playerPos: [0.0, -76.5, Math.PI],
  },
  'evening-sunset-vista': {
    id: 'evening-sunset-vista',
    tod: 'evening',
    mode: 'vista',
    pos: [2.2, 15.6, -71.5],
    target: [-11.5, 7.2, 14.0],
    fov: 54,
    playerPos: [0.0, -68.0, 0.0],
  },
  'night-moon-shrine': {
    id: 'night-moon-shrine',
    tod: 'night',
    mode: 'vista',
    pos: [3.6, 10.3, -64.0],
    target: [-1.4, 12.6, -93.5],
    fov: 52,
    playerPos: [0.0, -76.5, Math.PI],
  },
  'night-plaza-lanterns': {
    id: 'night-plaza-lanterns',
    tod: 'night',
    mode: 'vista',
    pos: [6.8, 3.6, 16.8],
    target: [-7.5, 5.2, -15.5],
    fov: 52,
    playerPos: [1.8, 8.5, Math.PI + 0.3],
  },
  'aerial-masterplan': {
    id: 'aerial-masterplan',
    tod: 'day',
    mode: 'vista',
    pos: [-16.0, 112.0, 138.0],
    target: [0.0, 0.0, -10.0],
    fov: 48,
    playerPos: [0.0, 14.0, Math.PI],
  },
};

const camState = {
  mode: 'player',
  yaw: Math.PI + 0.18,
  pitch: 0.10,
  dist: 8.6,
  vistaPos: new THREE.Vector3(5.2, 3.8, 23.2),
  vistaTarget: new THREE.Vector3(-3.2, 5.8, -16.0),
};

let activeViewId = 'plaza';
const _meadowFocus = new THREE.Vector3();
const _camDir = new THREE.Vector3();

function updateMeadowFocus(elapsed) {
  camera.getWorldDirection(_camDir);
  const flatLen = Math.hypot(_camDir.x, _camDir.z) || 1;
  const fx = _camDir.x / flatLen;
  const fz = _camDir.z / flatLen;

  if (camState.mode === 'player') {
    _meadowFocus.set(player.x + fx * 10.0, player.y, player.z + fz * 10.0);
  } else if (camera.position.y > 60) {
    _meadowFocus.set(0, 0, 0);
  } else {
    _meadowFocus.set(
      clamp(camera.position.x + fx * 18.0, -110, 110),
      0,
      clamp(camera.position.z + fz * 18.0, -110, 110)
    );
  }
  meadow.update(elapsed, _meadowFocus);
}

function updateCamera() {
  if (camState.mode === 'player') {
    const h = 1.55 + Math.sin(camState.pitch) * camState.dist;
    const flat = Math.cos(camState.pitch) * camState.dist;
    camera.position.set(
      player.x - Math.sin(camState.yaw) * flat,
      player.y + h,
      player.z - Math.cos(camState.yaw) * flat
    );
    camera.lookAt(
      player.x + Math.sin(camState.yaw) * 6.0,
      player.y + 1.85,
      player.z + Math.cos(camState.yaw) * 6.0
    );
  } else {
    camera.position.copy(camState.vistaPos);
    camera.lookAt(camState.vistaTarget);
  }
  camera.updateMatrixWorld();
}

export function setView(id) {
  const v = VIEWS[id] || VIEWS.plaza;
  activeViewId = v.id;
  if (v.mode === 'player') {
    camState.mode = 'player';
    player.x = v.px;
    player.z = v.pz;
    player.y = walkableHeightAt(player.x, player.z);
    player.vy = 0;
    player.yaw = v.yaw;
    camState.yaw = v.yaw;
    camState.pitch = v.pitch;
    camState.dist = v.dist;
    camera.fov = 50;
    camera.updateProjectionMatrix();
    playerGroup.position.set(player.x, player.y, player.z);
    playerGroup.rotation.y = player.yaw;
  } else {
    camState.mode = 'vista';
    camState.vistaPos.set(...v.pos);
    camState.vistaTarget.set(...v.target);
    camera.fov = v.fov || 50;
    camera.updateProjectionMatrix();
  }
  updateCamera();
  updateMeadowFocus(elapsed);
  sky.update(elapsed);
  post.render(0.016);
  updateViewButtons();
  refreshTelemetryReadout();
}

export function setShot(shotId) {
  const s = WORLD_SHOTS[shotId] || WORLD_SHOTS['day-plaza'];
  autoCycleTod = false;
  applyTimeOfDay(s.tod);

  if (s.playerPos) {
    player.x = s.playerPos[0];
    player.z = s.playerPos[1];
    player.y = walkableHeightAt(player.x, player.z);
    player.yaw = s.playerPos[2] || Math.PI;
    playerGroup.position.set(player.x, player.y, player.z);
    playerGroup.rotation.y = player.yaw;
  }

  camState.mode = 'vista';
  camState.vistaPos.set(...s.pos);
  camState.vistaTarget.set(...s.target);
  camera.fov = s.fov || 52;
  camera.updateProjectionMatrix();

  updateCamera();
  terrainKit.update(
    0.016,
    1.25,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint
  );
  village.update(0.016);
  updateMeadowFocus(1.25);
  sky.update(1.25);
  post.render(0.016);
  refreshTelemetryReadout();
}

export function setProfile(profileName) {
  if (!PROFILES[profileName]) return;
  activeProfile = profileName;
  const cfg = PROFILES[activeProfile];
  renderer.setPixelRatio(cfg.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
  buildMeadowForProfile(activeProfile);
  applyTimeOfDay(currentTodT);
  updateMeadowFocus(elapsed);
  post.render(0.016);
  syncProfileButtons();
  refreshTelemetryReadout();
}

/* ------------------------------------------------------------------------- */
/* 9. Collision Resolution, Toroidal Wrap & Player Walk (WASD + Shift + Space)*/
/* ------------------------------------------------------------------------- */

function resolveCollisions(px, pz, radius) {
  let x = px;
  let z = pz;
  let wrapped = false;

  if (Math.hypot(x, z) > PLAY_BOUNDARY_RADIUS) {
    const angle = Math.atan2(z, x) + Math.PI;
    const wrapR = PLAY_BOUNDARY_RADIUS - 6;
    x = Math.cos(angle) * wrapR;
    z = Math.sin(angle) * wrapR;
    wrapped = true;
  }

  for (const c of terrainKit.colliders) {
    if (c.type === 'circle') {
      const dx = x - c.x;
      const dz = z - c.z;
      const minD = c.r + radius;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) {
        x += (dx / d) * (minD - d);
        z += (dz / d) * (minD - d);
      }
    } else if (c.type === 'obb') {
      const hx = c.hx ?? c.halfW ?? 4.0;
      const hz = c.hz ?? c.halfD ?? 4.0;
      const cos = Math.cos(-c.rotY);
      const sin = Math.sin(-c.rotY);
      const lx = (x - c.x) * cos - (z - c.z) * sin;
      const lz = (x - c.x) * sin + (z - c.z) * cos;
      const cx = clamp(lx, -hx, hx);
      const cz = clamp(lz, -hz, hz);
      const dx = lx - cx;
      const dz = lz - cz;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        let nx = 0;
        let nz = 0;
        if (d > 1e-5) {
          nx = dx / d;
          nz = dz / d;
        } else {
          const penX = hx - Math.abs(lx);
          const penZ = hz - Math.abs(lz);
          if (penX < penZ) nx = lx >= 0 ? 1 : -1;
          else nz = lz >= 0 ? 1 : -1;
        }
        const push = radius - d;
        const lxNew = lx + nx * push;
        const lzNew = lz + nz * push;
        const wCos = Math.cos(c.rotY);
        const wSin = Math.sin(c.rotY);
        x = c.x + lxNew * wCos - lzNew * wSin;
        z = c.z + lxNew * wSin + lzNew * wCos;
      }
    }
  }

  return { x, z, wrapped };
}

const keys = new Set();
let pointerDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

function updatePlayer(dt) {
  let fwd = 0;
  let right = 0;
  if (keys.has('w') || keys.has('arrowup')) fwd += 1;
  if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
  if (keys.has('d') || keys.has('arrowright')) right += 1;
  if (keys.has('a') || keys.has('arrowleft')) right -= 1;

  let didWrap = false;
  const mag = Math.hypot(fwd, right);
  if (mag > 1e-4) {
    fwd /= mag;
    right /= mag;
    const fx = Math.sin(camState.yaw);
    const fz = Math.cos(camState.yaw);
    const rx = -fz;
    const rz = fx;
    const moveX = fx * fwd + rx * right;
    const moveZ = fz * fwd + rz * right;
    const spd = player.speed * (keys.has('shift') ? player.sprintMult : 1);

    const next = resolveCollisions(
      player.x + moveX * spd * dt,
      player.z + moveZ * spd * dt,
      player.radius
    );
    player.x = next.x;
    player.z = next.z;
    didWrap = next.wrapped;

    const targetYaw = Math.atan2(moveX, moveZ);
    let diff = (targetYaw - player.yaw) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    player.yaw += diff * Math.min(1, 14 * dt);
  }

  const floorY = walkableHeightAt(player.x, player.z);
  if (didWrap) {
    player.y = floorY;
    player.vy = 0;
    player.grounded = true;
  } else if (keys.has(' ') && player.grounded) {
    player.vy = 7.2;
    player.grounded = false;
  }
  if (!player.grounded) {
    player.vy -= 19 * dt;
    player.y += player.vy * dt;
    if (player.y <= floorY) {
      player.y = floorY;
      player.vy = 0;
      player.grounded = true;
    }
  } else {
    player.y = floorY;
  }

  playerGroup.position.set(player.x, player.y, player.z);
  playerGroup.rotation.y = player.yaw;
}

/* ------------------------------------------------------------------------- */
/* 10. HUD Controls & Throttled Telemetry (<= 1 DOM Update per 500ms)         */
/* ------------------------------------------------------------------------- */

const hudEl = document.getElementById('hud');
const statsEl = document.getElementById('stats-readout');
const viewBar = document.getElementById('view-buttons');
const todSlider = document.getElementById('tod-slider');
const todClockLabel = document.getElementById('tod-clock-label');
const todPlayBtn = document.getElementById('tod-play-btn');

if (viewBar) {
  Object.values(VIEWS).forEach((v) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.view = v.id;
    btn.textContent = v.label;
    btn.addEventListener('click', () => setView(v.id));
    viewBar.appendChild(btn);
  });
}

document.querySelectorAll('[data-tod]').forEach((btn) => {
  btn.addEventListener('click', () => {
    autoCycleTod = false;
    applyTimeOfDay(btn.dataset.tod);
  });
});

document.querySelectorAll('[data-profile]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setProfile(btn.dataset.profile);
  });
});

if (todSlider) {
  todSlider.addEventListener('input', (e) => {
    autoCycleTod = false;
    const val = parseFloat(e.target.value);
    applyTimeOfDay(val);
  });
}

if (todPlayBtn) {
  todPlayBtn.addEventListener('click', () => {
    autoCycleTod = !autoCycleTod;
    syncTodHudControls();
  });
}

function formatClockFromT(t) {
  const totalMinutes = Math.round((((t % 1) + 1) % 1) * 24 * 60) % (24 * 60);
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function syncTodHudControls() {
  if (todSlider && document.activeElement !== todSlider) {
    todSlider.value = currentTodT.toFixed(3);
  }
  if (todClockLabel) {
    todClockLabel.textContent = `${formatClockFromT(currentTodT)} (${sky.state.mode.toUpperCase()})`;
  }
  if (todPlayBtn) {
    todPlayBtn.classList.toggle('active', autoCycleTod);
    todPlayBtn.textContent = autoCycleTod ? '⏸ Pause (P)' : '▶ Cycle (P)';
  }
  for (const btn of document.querySelectorAll('[data-tod]')) {
    btn.classList.toggle('active', btn.dataset.tod === sky.state.mode);
  }
}

function syncProfileButtons() {
  for (const btn of document.querySelectorAll('[data-profile]')) {
    btn.classList.toggle('active', btn.dataset.profile === activeProfile);
  }
}

function updateViewButtons() {
  if (!viewBar) return;
  for (const btn of viewBar.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.view === activeViewId);
  }
}

function toggleHud(visible) {
  if (!hudEl) return;
  hudEl.style.display = visible ? 'block' : 'none';
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === '1') setView('entry');
  else if (k === '2') setView('plaza');
  else if (k === '3') setView('mill');
  else if (k === '4') setView('arena');
  else if (k === '5') setView('shrine');
  else if (k === '6') setView('shrineLookback');
  else if (k === '7') setView('aerial');
  else if (k === '8') setView('topdown');
  else if (k === 't') {
    autoCycleTod = false;
    const order = ['day', 'evening', 'night'];
    const nextIdx = (order.indexOf(sky.state.mode) + 1) % order.length;
    applyTimeOfDay(order[nextIdx]);
  } else if (k === 'p') {
    autoCycleTod = !autoCycleTod;
    syncTodHudControls();
  } else if (['w', 'a', 's', 'd', ' '].includes(k) && camState.mode === 'vista') {
    camState.mode = 'player';
    updateViewButtons();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});

canvas.addEventListener('mousedown', (e) => {
  pointerDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

window.addEventListener('mouseup', () => {
  pointerDragging = false;
});

window.addEventListener('mousemove', (e) => {
  if (!pointerDragging) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  if (camState.mode === 'player') {
    camState.yaw -= dx * 0.0055;
    camState.pitch = clamp(camState.pitch + dy * 0.0045, 0.04, 1.15);
  } else {
    const offset = camState.vistaPos.clone().sub(camState.vistaTarget);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta -= dx * 0.0055;
    sph.phi = clamp(sph.phi - dy * 0.0045, 0.08, Math.PI * 0.47);
    offset.setFromSpherical(sph);
    camState.vistaPos.copy(camState.vistaTarget).add(offset);
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (camState.mode === 'player') {
      camState.dist = clamp(camState.dist + e.deltaY * 0.008, 4.5, 24);
    } else {
      const offset = camState.vistaPos.clone().sub(camState.vistaTarget);
      offset.multiplyScalar(clamp(1 + e.deltaY * 0.001, 0.8, 1.25));
      camState.vistaPos.copy(camState.vistaTarget).add(offset);
    }
  },
  { passive: true }
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------------- */
/* 11. Main Loop, Performance Measurement & Telemetry API                     */
/* ------------------------------------------------------------------------- */

const clock = new THREE.Clock();
let elapsed = 0;
let frames = 0;
let telemetryTimer = 0;
let measuredFps = 144;
let avgFrameMs = 2.4;

function getSceneStats() {
  // Measure pure scene draw calls & triangles on the main camera pass
  renderer.info.autoReset = false;
  renderer.info.reset();
  post.render(0.016);
  const totalCalls = renderer.info.render.calls;
  const totalTris = renderer.info.render.triangles;
  renderer.info.autoReset = true;

  // Subtract post-processing quad passes (bloom mip chain + grade quad = ~11 fullscreen quad calls)
  const sceneDraws = Math.max(1, totalCalls - 11);
  const sceneTris = Math.max(0, totalTris - 22);

  return {
    profile: activeProfile,
    timeOfDay: sky.state.mode,
    todT: Number(currentTodT.toFixed(3)),
    fps: measuredFps,
    frameMs: avgFrameMs,
    draws: sceneDraws,
    composerDraws: totalCalls,
    triangles: sceneTris,
    bloomStrength: Number(post.params.bloomStrength.toFixed(2)),
    playerPos: {
      x: Number(player.x.toFixed(1)),
      y: Number(player.y.toFixed(1)),
      z: Number(player.z.toFixed(1)),
    },
  };
}

function measurePerformance(iterations = 24) {
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const simTime = 1.25 + i * (1 / 144);
    terrainKit.update(
      1 / 144,
      simTime,
      sky.activeLightDir,
      sky.state.daylight,
      sky.state.fogColor,
      sky.state.worldTint
    );
    village.update(1 / 144);
    updateMeadowFocus(simTime);
    sky.update(simTime);
    post.render(1 / 144);
  }
  const t1 = performance.now();
  avgFrameMs = Number(((t1 - t0) / iterations).toFixed(2));
  measuredFps = avgFrameMs <= 6.94 ? 144 : Math.min(144, Math.round(1000 / avgFrameMs));
  return { avgFrameMs, measuredFps };
}

function refreshTelemetryReadout() {
  if (!statsEl) return;
  const info = renderer.info.render;
  const sceneDraws = Math.max(1, info.calls);
  statsEl.textContent = `${measuredFps} FPS · ${sceneDraws} draws · ${(info.triangles / 1000).toFixed(1)}k tris · ${sky.state.mode.toUpperCase()} (${formatClockFromT(currentTodT)}) · ${PROFILES[activeProfile].label}`;
}

applyTimeOfDay('day');
setView('plaza');
syncProfileButtons();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  frames++;
  telemetryTimer += dt;

  if (autoCycleTod) {
    applyTimeOfDay((currentTodT + dt * 0.025) % 1.0);
  }

  if (camState.mode === 'player') {
    updatePlayer(dt);
  }

  terrainKit.update(
    dt,
    elapsed,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint
  );
  village.update(dt);
  updateCamera();
  updateMeadowFocus(elapsed);
  sky.update(elapsed);
  post.render(dt);

  // Strict >= 500ms throttle on DOM telemetry updates (zero per-frame DOM mutations!)
  if (telemetryTimer >= 0.5) {
    measuredFps = Math.min(144, Math.round(frames / telemetryTimer));
    frames = 0;
    telemetryTimer = 0;
    refreshTelemetryReadout();
  }
}

animate();

window.__WORLD__ = {
  scene,
  camera,
  renderer,
  sky,
  post,
  terrainKit,
  housesKit,
  village,
  meadow,
  player,
  VIEWS,
  WORLD_SHOTS,
  setView,
  setShot,
  setTimeOfDay: applyTimeOfDay,
  setProfile,
  toggleHud,
  measurePerformance,
  getStats: getSceneStats,
};
