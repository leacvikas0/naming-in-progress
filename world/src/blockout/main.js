// ============================================================================
// world/src/blockout/main.js
//
// Interactive 3rd-Person Player Walkthrough + Multi-Angle Blockout Inspector.
// ============================================================================

import * as THREE from 'three';
import {
  ZONES,
  BUILDINGS,
  LANDMARKS,
  walkableHeightAt,
  terrainHeightAt,
  clamp,
  lerp,
} from './geography.js';
import {
  createBlockoutWorld,
  createCharacterMannequin,
} from './scene-builder.js';

const canvas = document.getElementById('blockout-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfeaf8);
scene.fog = new THREE.Fog(0xd8eef8, 95, 290);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

// Sun + Hemisphere + Rim Lighting matching house3d's clean cel-shaded look
const hemi = new THREE.HemisphereLight(0xe2f2ff, 0x7c8c58, 1.15);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d6, 2.35);
sun.position.set(-48, 76, 58);
scene.add(sun);

const fill = new THREE.DirectionalLight(0xb8d8ff, 0.65);
fill.position.set(45, 32, -40);
scene.add(fill);

// Build the 3D Blockout World
const world = createBlockoutWorld(scene);

// Create the playable 1.9m Explorer character (Gold/Crimson hero proxy)
const playerGroup = createCharacterMannequin(0xd97706);
playerGroup.name = 'playerExplorer';
scene.add(playerGroup);

const player = {
  x: 0,
  z: 22,
  y: walkableHeightAt(0, 22),
  vy: 0,
  yaw: Math.PI, // facing North (-Z) into the Hamlet Well Plaza
  speed: 7.5,
  sprintMult: 1.55,
  radius: 0.48,
  grounded: true,
};
playerGroup.position.set(player.x, player.y, player.z);
playerGroup.rotation.y = player.yaw;

// Camera state: supports both 'player' (3rd-person follow) and 'vista' (fixed/orbit overview)
const camState = {
  mode: 'player', // 'player' | 'vista'
  yaw: Math.PI,
  pitch: 0.34,
  dist: 8.8,
  vistaPos: new THREE.Vector3(0, 45, 75),
  vistaTarget: new THREE.Vector3(0, 2, -8),
};

export const VIEWS = {
  entry: {
    id: 'entry',
    label: '1 · South Road Entry (Player Walk)',
    mode: 'player',
    px: 0,
    pz: 23,
    yaw: Math.PI,
    pitch: 0.28,
    dist: 8.5,
  },
  plaza: {
    id: 'plaza',
    label: '2 · Hamlet Well Plaza & 4 Cottages',
    mode: 'player',
    px: 2.5,
    pz: 6.5,
    yaw: Math.PI + 0.35,
    pitch: 0.30,
    dist: 9.0,
  },
  mill: {
    id: 'mill',
    label: '3 · Waterfall, Watermill & Pier',
    mode: 'player',
    px: -22.2,
    pz: 7.5,
    yaw: Math.PI - 0.25,
    pitch: 0.22,
    dist: 9.2,
  },
  arena: {
    id: 'arena',
    label: '4 · East Wisteria Combat Ring',
    mode: 'player',
    px: 26.5,
    pz: -3.5,
    yaw: 1.48,
    pitch: 0.28,
    dist: 9.5,
  },
  shrine: {
    id: 'shrine',
    label: '5 · North Shrine Overlook & Vista',
    mode: 'player',
    px: 4.0,
    pz: -49.5,
    yaw: Math.PI,
    pitch: 0.24,
    dist: 9.2,
  },
  shrineLookback: {
    id: 'shrineLookback',
    label: '6 · Shrine Overlook -> Town & Lake',
    mode: 'vista',
    pos: [-1.8, 12.2, -55.0],
    target: [-10.0, -1.5, 6.0],
    fov: 54,
  },
  aerial: {
    id: 'aerial',
    label: '7 · Bird’s-Eye Masterplan',
    mode: 'vista',
    pos: [-10, 66, 76],
    target: [0, 1, -10],
    fov: 46,
  },
  topdown: {
    id: 'topdown',
    label: '8 · Top-Down Architectural Map',
    mode: 'vista',
    pos: [0, 142, -8],
    target: [0, 0, -8.1],
    fov: 44,
  },
};

let activeViewId = 'entry';

function refreshStatsReadout() {
  const statsEl = document.getElementById('stats-readout');
  if (!statsEl) return;
  const info = renderer.info.render;
  statsEl.textContent = `${currentFps} FPS · ${info.calls} draws · ${(info.triangles / 1000).toFixed(1)}k tris · Player (${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)})`;
}

function setView(id) {
  const v = VIEWS[id] || VIEWS.entry;
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
    camera.fov = v.fov || 46;
    camera.updateProjectionMatrix();
  }
  updateCamera();
  renderer.render(scene, camera);
  updateLabels();
  refreshStatsReadout();
  updateViewButtons();
}

// ============================================================================
// INPUT (WASD + Mouse Orbit + Touch Thumbstick)
// ============================================================================

const keys = new Set();
let pointerDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === '1') setView('entry');
  if (k === '2') setView('plaza');
  if (k === '3') setView('mill');
  if (k === '4') setView('arena');
  if (k === '5') setView('shrine');
  if (k === '6') setView('shrineLookback');
  if (k === '7') setView('aerial');
  if (k === '8') setView('topdown');
  if (k === 'l') toggleLabels();
  if (['w', 'a', 's', 'd', ' '].includes(k) && camState.mode === 'vista') {
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
    camState.pitch = clamp(camState.pitch + dy * 0.0045, 0.06, 1.15);
  } else {
    // Orbit around vistaTarget
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
      camState.dist = clamp(camState.dist + e.deltaY * 0.008, 4.5, 22);
    } else {
      const offset = camState.vistaPos.clone().sub(camState.vistaTarget);
      offset.multiplyScalar(clamp(1 + e.deltaY * 0.001, 0.8, 1.25));
      camState.vistaPos.copy(camState.vistaTarget).add(offset);
    }
  },
  { passive: true }
);

// ============================================================================
// COLLISION RESOLUTION & PLAYER LOCOMOTION
// ============================================================================

function resolveCollisions(px, pz, radius) {
  let x = px;
  let z = pz;
  for (const c of world.colliders) {
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
      const cos = Math.cos(-c.rotY);
      const sin = Math.sin(-c.rotY);
      const lx = (x - c.x) * cos - (z - c.z) * sin;
      const lz = (x - c.x) * sin + (z - c.z) * cos;
      const cx = clamp(lx, -c.hx, c.hx);
      const cz = clamp(lz, -c.hz, c.hz);
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
          const penX = c.hx - Math.abs(lx);
          const penZ = c.hz - Math.abs(lz);
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
  x = clamp(x, -92, 92);
  z = clamp(z, -92, 92);
  return { x, z };
}

function updatePlayer(dt) {
  let fwd = 0;
  let right = 0;
  if (keys.has('w') || keys.has('arrowup')) fwd += 1;
  if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
  if (keys.has('d') || keys.has('arrowright')) right += 1;
  if (keys.has('a') || keys.has('arrowleft')) right -= 1;

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

    const targetYaw = Math.atan2(moveX, moveZ);
    let diff = (targetYaw - player.yaw) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    player.yaw += diff * Math.min(1, 14 * dt);
  }

  const floorY = walkableHeightAt(player.x, player.z);
  if (keys.has(' ') && player.grounded) {
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

function updateCamera() {
  if (camState.mode === 'player') {
    const h = 1.6 + Math.sin(camState.pitch) * camState.dist;
    const flat = Math.cos(camState.pitch) * camState.dist;
    camera.position.set(
      player.x - Math.sin(camState.yaw) * flat,
      player.y + h,
      player.z - Math.cos(camState.yaw) * flat
    );
    camera.lookAt(player.x, player.y + 1.35, player.z);
  } else {
    camera.position.copy(camState.vistaPos);
    camera.lookAt(camState.vistaTarget);
  }
}

// ============================================================================
// 3D WORLD-SPACE ARCHITECTURAL LABELS (DOM Overlay Projected from 3D)
// ============================================================================

const labelContainer = document.getElementById('world-labels');
let labelsVisible = true;

const LABEL_POINTS = [
  ...BUILDINGS.map((b) => ({
    title: b.name,
    sub: `${b.role} · y=${b.y.toFixed(1)}m`,
    pos: new THREE.Vector3(b.x, b.y + b.wallH + b.roofH + 1.4, b.z),
    kind: 'building',
  })),
  {
    title: 'Hamlet Roofed Well Plaza',
    sub: 'Zone A Hub (0, 0) · y=0.0m',
    pos: new THREE.Vector3(0, 4.4, 0),
    kind: 'zone',
  },
  {
    title: '5.4m Waterfall & Timber Flume',
    sub: 'Zone B Hydro Drop · y=+4.2m -> -1.2m',
    pos: new THREE.Vector3(-33.5, 6.2, -18.5),
    kind: 'zone',
  },
  {
    title: 'Lakeside Wooden Pier',
    sub: 'Zone B Dock (-27, 7.5) · y=-0.35m',
    pos: new THREE.Vector3(-27, 2.2, 7.5),
    kind: 'zone',
  },
  {
    title: 'Wisteria Combat Ring',
    sub: 'Zone C Arena (42, -4) · y=+0.6m · r=16m',
    pos: new THREE.Vector3(42, 6.2, -4),
    kind: 'zone',
  },
  {
    title: 'Northern Shrine Arch & Medallion',
    sub: 'Zone D Overlook (4, -56) · y=+6.5m',
    pos: new THREE.Vector3(4, 12.8, -59),
    kind: 'zone',
  },
];

const labelNodes = LABEL_POINTS.map((item) => {
  const el = document.createElement('div');
  el.className = `world-label ${item.kind}`;
  el.innerHTML = `<strong>${item.title}</strong><span>${item.sub}</span>`;
  if (labelContainer) labelContainer.appendChild(el);
  return { ...item, el };
});

function toggleLabels(force) {
  labelsVisible = typeof force === 'boolean' ? force : !labelsVisible;
  if (labelContainer) {
    labelContainer.style.display = labelsVisible ? 'block' : 'none';
  }
}

const projVec = new THREE.Vector3();
function updateLabels() {
  if (!labelsVisible || !labelContainer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (const item of labelNodes) {
    projVec.copy(item.pos).project(camera);
    if (projVec.z > 1.0 || projVec.z < -1.0) {
      item.el.style.display = 'none';
      continue;
    }
    const sx = (projVec.x * 0.5 + 0.5) * w;
    const sy = (-projVec.y * 0.5 + 0.5) * h;
    if (sx < -100 || sx > w + 100 || sy < -60 || sy > h + 60) {
      item.el.style.display = 'none';
      continue;
    }
    item.el.style.display = 'flex';
    item.el.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
  }
}

// ============================================================================
// UI BAR & TELEMETRY
// ============================================================================

const viewBar = document.getElementById('view-buttons');
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

function updateViewButtons() {
  if (!viewBar) return;
  for (const btn of viewBar.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.view === activeViewId);
  }
}

const clock = new THREE.Clock();
let elapsed = 0;
let frames = 0;
let fpsTime = 0;
let currentFps = 60;
const statsEl = document.getElementById('stats-readout');

setView('entry');

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  frames++;
  fpsTime += dt;

  if (camState.mode === 'player') {
    updatePlayer(dt);
  }
  world.update(dt, elapsed);
  updateCamera();
  renderer.render(scene, camera);
  updateLabels();

  if (fpsTime >= 0.4) {
    currentFps = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
    if (statsEl) {
      const info = renderer.info.render;
      statsEl.textContent = `${currentFps} FPS · ${info.calls} draws · ${(info.triangles / 1000).toFixed(1)}k tris · Player (${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)})`;
    }
  }
}

animate();

window.__BLOCKOUT__ = {
  scene,
  camera,
  renderer,
  player,
  camState,
  VIEWS,
  setView,
  toggleLabels,
  getStats() {
    const info = renderer.info.render;
    return {
      fps: currentFps,
      draws: info.calls,
      triangles: info.triangles,
      playerPos: { x: player.x, y: player.y, z: player.z },
    };
  },
};
