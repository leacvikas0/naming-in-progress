import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import {
  CONFIG,
  CHARACTERS,
  PALETTE,
  computeWave,
  rollUpgrades,
  makeRng,
  clamp,
  damp,
  angleDelta,
  moveBasis,
} from "./balance.js";
import { events } from "./events.js";
import { createWorld } from "./world.js";
import { createPlayer } from "./player.js";
import { createEnemies } from "./enemies.js";
import { createFX } from "./fx.js";
import { createHUD } from "./hud.js";
import { createAudio } from "./audio.js";

const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.fog);
scene.fog = new THREE.FogExp2(PALETTE.fog, 0.026);

const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 220);
camera.position.set(0, 9, 12);

const loader = new GLTFLoader();
const rng = makeRng(CONFIG.run.seed);

const playerLight = new THREE.PointLight(0xffd9a0, 14, 12, 2);
playerLight.position.set(0, 2.6, 0);
scene.add(playerLight);

const audio = createAudio({ events });
const fx = createFX({ scene, camera, events, rng, world: null });
const hud = createHUD({ events, characters: CHARACTERS });

let world = null;
let player = null;
let enemies = null;

const state = {
  phase: "loading",
  heroId: null,
  wave: 0,
  coins: 0,
  score: 0,
  kills: 0,
  combo: 0,
  comboTimer: 0,
  pendingUpgrades: [],
  waveActive: false,
  intermissionT: 0,
  runT: 0,
};

const input = {
  keys: new Set(),
  attack: false,
  aim: new THREE.Vector3(0, 0, 1),
  mouse: new THREE.Vector2(0, 0),
  hasPointer: false,
  locked: false,
};

const camState = {
  yaw: 0,
  pitch: 0.62,
  target: new THREE.Vector3(),
  shakeOffset: new THREE.Vector3(),
};

const LOOK_SENSITIVITY = 0.0026;

function isGameplay() {
  return state.phase === "playing" || state.phase === "upgrade";
}

function requestLock() {
  if (!isGameplay()) return;
  if (document.pointerLockElement === canvas) return;
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        try {
          const retry = canvas.requestPointerLock();
          if (retry && typeof retry.catch === "function") retry.catch(() => {});
        } catch {
          /* pointer lock unavailable (headless, iframe) — mouse look degrades to free cursor */
        }
      });
    }
  } catch {
    /* pointer lock unavailable */
  }
}

document.addEventListener("pointerlockchange", () => {
  input.locked = document.pointerLockElement === canvas;
  if (!input.locked) {
    input.keys.clear();
    input.attack = false;
  }
});

function hexOf(n) {
  return `#${(n >>> 0).toString(16).padStart(6, "0")}`;
}

/* ---------------- input ---------------- */

addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  input.keys.add(k);
  if (k === " ") e.preventDefault();
  if (k === "r" && state.phase === "dead") startRun(state.heroId || "knight");
  if (k === "escape" && input.locked) document.exitPointerLock();
  audio.unlock();
});

addEventListener("keyup", (e) => {
  input.keys.delete(e.key.toLowerCase());
});

addEventListener("blur", () => {
  input.keys.clear();
  input.attack = false;
});

canvas.addEventListener("mousemove", (e) => {
  if (input.locked) {
    camState.yaw -= e.movementX * LOOK_SENSITIVITY;
    camState.pitch = clamp(
      camState.pitch + e.movementY * LOOK_SENSITIVITY,
      CONFIG.camera.pitchMin,
      CONFIG.camera.pitchMax
    );
  } else {
    input.mouse.set(e.clientX, e.clientY);
    input.hasPointer = true;
  }
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    audio.unlock();
    if (!input.locked) {
      requestLock();
    } else {
      input.attack = true;
    }
  }
});

addEventListener("mouseup", (e) => {
  if (e.button === 0) input.attack = false;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

addEventListener("wheel", (e) => {
  camState.pitch = clamp(camState.pitch + e.deltaY * 0.0012, CONFIG.camera.pitchMin, CONFIG.camera.pitchMax);
}, { passive: true });

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

/* ---------------- aim ---------------- */

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimHit = new THREE.Vector3();

// While pointer-locked the look direction drives the aim: attacks land where the
// camera points. Unlocked, fall back to the mouse raycast against the floor.
function updateAim() {
  if (!player) return;
  if (input.locked) {
    const fx = Math.sin(camState.yaw);
    const fz = Math.cos(camState.yaw);
    input.aim.set(player.position.x + fx * 10, 0, player.position.z + fz * 10);
    return;
  }
  if (!input.hasPointer) return;
  const ndc = new THREE.Vector2(
    (input.mouse.x / innerWidth) * 2 - 1,
    -(input.mouse.y / innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(groundPlane, aimHit)) {
    input.aim.copy(aimHit);
  }
}

/* ---------------- camera ---------------- */

const camDesired = new THREE.Vector3();
const camLookAt = new THREE.Vector3();

function updateCamera(dt) {
  if (!player) return;
  const p = player.position;
  const dist = CONFIG.camera.dist;
  const height = CONFIG.camera.height + Math.sin(camState.pitch) * dist;
  const flat = Math.cos(camState.pitch) * dist;

  camDesired.set(
    p.x - Math.sin(camState.yaw) * flat,
    p.y + height,
    p.z - Math.cos(camState.yaw) * flat
  );

  const k = 1 - Math.exp(-CONFIG.camera.damp * dt);
  camera.position.lerp(camDesired, k);
  camLookAt.set(p.x, p.y + 1.15, p.z);
  camera.lookAt(camLookAt);
}

/* ---------------- run flow ---------------- */

async function boot() {
  hud.showLoading("Carving the dungeon...");
  world = createWorld({ scene, config: CONFIG, rng, loader });
  await world.ready;
  fx.world = world;
  hud.showLoading("Awakening the dead...");
  hud.showTitle();
  hud.hideLoading();
  state.phase = "title";
}

function startRun(heroId) {
  const hero = CHARACTERS[heroId] || CHARACTERS.knight;
  state.heroId = hero.id;

  enemies?.clearAll();
  fx.reset();

  if (player) {
    scene.remove(player.group);
    player = null;
  }

  if (!enemies) {
    enemies = createEnemies({ scene, world, events, config: CONFIG, rng, loader });
  }

  player = createPlayer({ scene, world, events, config: CONFIG.player, hero, loader });
  player.group.position.set(0, 0, 6);

  state.wave = 0;
  state.coins = 0;
  state.score = 0;
  state.kills = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.runT = 0;
  state.waveActive = false;
  state.intermissionT = 2.2;
  state.phase = "playing";

  hud.reset();
  hud.hideTitle();
  hud.hideDeath();
  hud.hideUpgrades();
  hud.showToast(`${hero.name} descends`);

  events.emit("run-started", { hero: hero.id });
  events.emit("sfx", { name: "start" });

  requestLock();
  setTimeout(() => startWave(1), 900);
}

function startWave(n) {
  state.wave = n;
  state.waveActive = true;
  const waveDef = computeWave(n);
  const elites = waveDef.eliteCount;
  const sub = elites > 0 ? `${elites} elite${elites > 1 ? "s" : ""} among them` : "";
  hud.showWaveBanner(n, sub);
  events.emit("wave-start", { wave: n, count: waveDef.count + elites });
  events.emit("sfx", { name: "wave" });
  enemies.spawnWave(waveDef, player);
}

function endWave() {
  state.waveActive = false;
  events.emit("wave-clear", { wave: state.wave });

  if (state.wave % CONFIG.combat.upgradeEvery === 0) {
    const cards = rollUpgrades(rng, 3);
    state.pendingUpgrades = cards;
    state.phase = "upgrade";
    hud.showUpgrades(cards);
    events.emit("sfx", { name: "upgrade" });
    document.exitPointerLock();
  } else {
    state.intermissionT = CONFIG.combat.intermission;
  }
}

function pickUpgrade(id) {
  const card = state.pendingUpgrades.find((c) => c.id === id);
  if (!card || !player) return;
  card.apply(player);
  hud.addUpgradePip(card);
  hud.hideUpgrades();
  state.pendingUpgrades = [];
  state.phase = "playing";
  state.intermissionT = CONFIG.combat.intermission;
  hud.showToast(`${card.name} acquired`);
  requestLock();
}

function endRun() {
  state.phase = "dead";
  document.exitPointerLock();
  const stats = { wave: state.wave, kills: state.kills, coins: state.coins, score: state.score };
  hud.showDeath(stats);
  events.emit("run-ended", stats);
}

/* ---------------- scoring ---------------- */

function addScore(n) {
  state.score += n;
}

function addCoins(n) {
  const mult = player ? player.stats.coinMult : 1;
  state.coins += n;
  addScore(Math.round(n * 10 * mult));
}

function bumpCombo() {
  state.combo += 1;
  state.comboTimer = 2.6;
  addScore(Math.round(2 * state.combo));
}

/* ---------------- events ---------------- */

events.on("hero-selected", ({ id }) => {
  hud.setSelectedHero(id);
  state.heroId = id;
});

events.on("start-run", () => {
  startRun(state.heroId || "knight");
});

events.on("retry", () => {
  startRun(state.heroId || "knight");
});

events.on("upgrade-chosen", ({ id }) => {
  pickUpgrade(id);
});

events.on("enemy-hit", ({ crit }) => {
  bumpCombo();
});

events.on("enemy-died", () => {
  state.kills += 1;
  addScore(10);
});

events.on("coin-collected", ({ value }) => {
  addCoins(value || 1);
});

events.on("player-hurt", () => {
  state.combo = 0;
});

events.on("player-died", () => {
  setTimeout(() => endRun(), 1500);
});

/* ---------------- loop ---------------- */

const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = rawDt * fx.timeScale;
  elapsed += dt;

  updateAim();

  if (state.phase === "playing" || state.phase === "upgrade" || state.phase === "dead") {
    if (player && player.alive && state.phase !== "dead") {
      const { forward, right } = moveBasis(camState.yaw);
      let mx = 0;
      let mz = 0;
      if (input.keys.has("w")) mz += 1;
      if (input.keys.has("s")) mz -= 1;
      if (input.keys.has("d")) mx += 1;
      if (input.keys.has("a")) mx -= 1;
      const move = {
        x: forward.x * mz + right.x * mx,
        z: forward.z * mz + right.z * mx,
      };

      player.update(dt, {
        move,
        aim: input.aim,
        attack: input.attack && state.phase === "playing",
        dodge: input.keys.has(" "),
        sprint: input.keys.has("shift"),
        jump: input.keys.has("jump"),
      });
    } else if (player) {
      player.update(dt, {});
    }

    if (enemies && state.phase !== "dead") {
      enemies.update(dt, player);
    }

    if (state.phase === "playing" && state.waveActive && enemies.aliveCount === 0 && enemies.totalCount > 0) {
      endWave();
    }

    if (state.phase === "playing" && !state.waveActive && state.intermissionT > 0) {
      state.intermissionT -= dt;
      if (state.intermissionT <= 0) startWave(state.wave + 1);
    }

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
  }

  if (world) world.update(dt, elapsed);
  if (player) playerLight.position.set(player.position.x, 2.6, player.position.z);
  updateCamera(rawDt);
  if (player) {
    fx.update(rawDt, player);
    audio.update(rawDt, player.position);
  } else {
    fx.update(rawDt, null);
  }

  hud.update({
    hp: player ? player.hp : 0,
    maxHp: player ? player.maxHp : 1,
    wave: state.wave,
    enemies: enemies ? enemies.aliveCount : 0,
    coins: state.coins,
    score: state.score,
    dodgeFrac: player ? player.dodgeCooldownFrac : 0,
    combo: state.combo,
  });

  renderer.render(scene, camera);
}

frame();

window.__game = {
  get state() {
    return state;
  },
  get player() {
    return player;
  },
  get enemies() {
    return enemies;
  },
  get world() {
    return world;
  },
  startRun,
  pickUpgrade,
  get hud() {
    return hud;
  },
  get input() {
    return input;
  },
};

boot().catch((err) => {
  console.error("[main] boot failed", err);
  hud.showLoading(`Boot failed: ${err.message}`);
});
