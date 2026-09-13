import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CONFIG, ENEMY_TYPES, clamp, angleDelta, makeRng, pickWeighted } from "./balance.js";

const gltfCache = new Map();
const readyCache = new Map();

const DEATH_FADE = 0.8;
const HIT_FLASH = 0.09;
const ELITE_HP_MULT = 2.2;
const ELITE_DMG_MULT = 1.35;
const ELITE_SCALE = 1.15;
const ELITE_TINT = new THREE.Color(0xff9a3c);
const KNOCKBACK_DECAY = 8;
const MAX_DT = 0.1;
const BASE_RADIUS = 0.35;
const TARGET_HEIGHT = 1.9;

const ANIM = {
  idle: ["Idle", "Idle_B", "Unarmed_Idle", "Skeleton_Inactive_Standing_Pose", "T-Pose"],
  walk: ["Walking_A", "Walking_B", "Walking_C", "Walking_D_Skeletons", "Running_A", "Idle", "T-Pose"],
  run: ["Running_A", "Running_B", "Walking_A", "Idle", "T-Pose"],
  deathA: ["Death_A", "Death_B", "Death_C_Skeletons", "Death_A_Pose", "T-Pose"],
  deathB: ["Death_B", "Death_A", "Death_C_Skeletons", "T-Pose"],
  deathC: ["Death_C_Skeletons", "Death_C_Pose", "Death_A", "T-Pose"],
};

function meshList(root) {
  const skinned = [];
  const rigid = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh) skinned.push(o);
    else if (o.isMesh) rigid.push(o);
  });
  return { skinned, rigid };
}

function boundsOf(meshes) {
  const box = new THREE.Box3();
  let found = false;
  for (const mesh of meshes) {
    if (!mesh.geometry) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (!bb) continue;
    mesh.updateWorldMatrix(true, false);
    box.union(bb.clone().applyMatrix4(mesh.matrixWorld));
    found = true;
  }
  return found ? box : null;
}

function cleanGltf(gltf, keep) {
  const root = gltf && gltf.scene ? gltf.scene : null;
  if (!root) throw new Error("enemies: gltf has no scene");
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const { skinned, rigid } = meshList(root);
  const firstSkin = skinned.length ? skinned[0].skeleton : null;
  const keepList = Array.isArray(keep) ? keep : [];
  const keepMatch = (name) => !!name && keepList.some((k) => k && (name === k || name.includes(k)));

  for (const mesh of skinned) {
    mesh.frustumCulled = false;
    if (firstSkin && mesh.skeleton && mesh.skeleton !== firstSkin) mesh.visible = false;
  }
  for (const mesh of rigid) {
    mesh.visible = keepMatch(mesh.name) || (mesh.parent ? keepMatch(mesh.parent.name) : false);
  }

  const box = boundsOf(skinned.length ? skinned : rigid);
  if (box && box.max.y - box.min.y > 1e-4) {
    const scale = TARGET_HEIGHT / (box.max.y - box.min.y);
    root.scale.setScalar(scale);
    root.position.y = -box.min.y * scale;
  }
  root.updateMatrixWorld(true);
  return { scene: root, animations: Array.isArray(gltf.animations) ? gltf.animations : [] };
}

async function loadGltf(loader, url) {
  if (loader && typeof loader.loadAsync === "function") return loader.loadAsync(url);
  if (loader && typeof loader.load === "function") {
    return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  }
  if (loader && loader.scene) return loader;
  throw new Error(`enemies: no usable loader for ${url}`);
}

async function loadCleanedGltf(loader, url, keep) {
  const ready = readyCache.get(url);
  if (ready) return ready;
  if (!gltfCache.has(url)) {
    gltfCache.set(url, loadGltf(loader, url).then((gltf) => cleanGltf(gltf, keep)));
  }
  try {
    const clean = await gltfCache.get(url);
    readyCache.set(url, clean);
    return clean;
  } catch (err) {
    gltfCache.delete(url);
    throw err;
  }
}

export function createEnemies({ scene, world, events, config = CONFIG, rng, loader = new GLTFLoader() } = {}) {
  const cfg = config || CONFIG;
  const combat = { ...CONFIG.combat, ...(cfg.combat || {}) };
  const playerCfg = { ...CONFIG.player, ...(cfg.player || {}) };
  const rand = typeof rng === "function" ? rng : makeRng(((cfg.run && cfg.run.seed) ?? CONFIG.run.seed) + 7919);

  const group = new THREE.Group();
  group.name = "enemies";
  if (scene && typeof scene.add === "function") scene.add(group);

  const enemies = [];
  const projectiles = [];
  const telegraphs = [];
  const spawnQueue = [];

  let activePlayer = null;
  let waveStats = { hpMult: 1, dmgMult: 1, speedMult: 1, wave: 0 };
  let spawnTimer = 0;
  let waveSpawned = 0;
  let aliveN = 0;
  let lastEmittedAlive = 0;
  let nextId = 1;
  let killCount = 0;

  function emit(name, payload) {
    if (events && typeof events.emit === "function") events.emit(name, payload);
  }

  function emitCount() {
    if (aliveN !== lastEmittedAlive) {
      lastEmittedAlive = aliveN;
      emit("enemy-count", { alive: aliveN });
    }
  }

  function randomPointInBounds() {
    const b = (world && world.bounds) || { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
    return new THREE.Vector3(b.minX + rand() * (b.maxX - b.minX), 0, b.minZ + rand() * (b.maxZ - b.minZ));
  }

  function pickSpawnPoint(player) {
    const p = player && player.position ? player.position : new THREE.Vector3();
    let v = null;
    if (world && typeof world.spawnPoint === "function") {
      try {
        v = world.spawnPoint(rand, p, 8);
      } catch (err) {
        v = null;
      }
    }
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.z)) v = randomPointInBounds();
    return new THREE.Vector3(v.x, 0, v.z);
  }

  function buildQueue(def) {
    const mix = Array.isArray(def.mix) && def.mix.length ? def.mix : [{ type: "minion", count: def.count ?? 1 }];
    const queue = [];
    for (const entry of mix) {
      const type = ENEMY_TYPES[entry.type];
      if (!type) continue;
      const n = Math.max(0, Math.floor(entry.count || 0));
      for (let i = 0; i < n; i++) queue.push({ type, elite: false });
    }
    const elites = Math.max(0, Math.floor(def.eliteCount || 0));
    const weighted = mix
      .filter((entry) => entry.count > 0 && ENEMY_TYPES[entry.type])
      .map((entry) => ({ weight: entry.count, value: entry.type }));
    for (let i = 0; i < elites; i++) {
      const typeId = weighted.length ? pickWeighted(rand, weighted) : "minion";
      const type = ENEMY_TYPES[typeId] || ENEMY_TYPES.minion;
      if (type) queue.push({ type, elite: true });
    }
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
    return queue;
  }

  function spawnWave(waveDef, player) {
    const def = waveDef || {};
    if (player) activePlayer = player;
    waveStats = {
      hpMult: Number.isFinite(def.hpMult) ? def.hpMult : 1,
      dmgMult: Number.isFinite(def.dmgMult) ? def.dmgMult : 1,
      speedMult: Number.isFinite(def.speedMult) ? def.speedMult : 1,
      wave: def.n ?? 0,
    };
    spawnQueue.length = 0;
    spawnQueue.push(...buildQueue(def));
    spawnTimer = 0;
    waveSpawned = 0;
    lastEmittedAlive = aliveN;
    const preload = new Set();
    for (const entry of spawnQueue) {
      const type = entry.type;
      if (type && !preload.has(type.glb)) {
        preload.add(type.glb);
        loadCleanedGltf(loader, type.glb, type.keep)
          .then((clean) => readyCache.set(type.glb, clean))
          .catch(() => {});
      }
    }
  }

  function createTelegraph(pos, item) {
    const geo = new THREE.RingGeometry(0.5, 0.72, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4a1e,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.03, pos.z);
    mesh.scale.setScalar(0.35);
    group.add(mesh);
    telegraphs.push({ pos: pos.clone(), item, mesh, t: 0, dur: Math.max(0.05, combat.spawnTelegraph) });
    emit("sfx", { name: "enemy-windup", position: new THREE.Vector3(pos.x, 0.5, pos.z), pitch: 0.75 + rand() * 0.2, volume: 0.7 });
  }

  function queueTelegraphs() {
    const batch = Math.max(1, Math.floor(combat.spawnBatch || 1));
    for (let i = 0; i < batch && spawnQueue.length > 0; i++) {
      const item = spawnQueue.shift();
      createTelegraph(pickSpawnPoint(activePlayer), item);
    }
  }

  function playAnim(e, candidates, opts = {}) {
    if (!e.actions || !e.mixer) return;
    let action = null;
    for (const name of candidates) {
      if (!name) continue;
      const found = e.actions.get(name);
      if (found) {
        action = found;
        break;
      }
    }
    if (!action) return;
    const loop = opts.loop !== false;
    const fade = opts.fade ?? 0.15;
    if (!opts.force && e.curAction === action && action.isRunning()) return;
    const prev = e.curAction;
    action.enabled = true;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !!opts.clamp;
    action.setEffectiveTimeScale(opts.timeScale ?? 1);
    action.setEffectiveWeight(1);
    action.reset();
    if (fade > 0) action.fadeIn(fade);
    action.play();
    if (prev && prev !== action) {
      if (fade > 0) prev.fadeOut(fade);
      else prev.stop();
    }
    e.curAction = action;
  }

  function windupCandidates(type) {
    return [type.windupClip, "1H_Melee_Attack_Chop", "Spellcast_Shoot", "Idle", "T-Pose"];
  }

  function playDeath(e) {
    const r = rand();
    const keys = r < 0.6 ? ANIM.deathA : r < 0.85 ? ANIM.deathB : ANIM.deathC;
    playAnim(e, keys, { loop: false, clamp: true, fade: 0.08, force: true });
  }

  function attachModel(e, clean) {
    if (e.dead || !clean || !clean.scene) return;
    const inst = cloneSkeleton(clean.scene);
    inst.traverse((o) => {
      if (o.isSkinnedMesh) o.frustumCulled = false;
      if (!o.isMesh || !o.visible) return;
      if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone());
      else if (o.material) o.material = o.material.clone();
      const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const mat of list) {
        e.mats.push({
          mat,
          base: mat.emissive ? mat.emissive.clone() : null,
          baseIntensity: mat.emissiveIntensity ?? 1,
          baseOpacity: mat.opacity ?? 1,
        });
      }
    });
    if (e.elite) {
      for (const entry of e.mats) {
        if (!entry.base) continue;
        entry.base.lerp(ELITE_TINT, 0.55);
        entry.baseIntensity = Math.max(entry.baseIntensity, 0.35);
        entry.mat.emissive.copy(entry.base);
        entry.mat.emissiveIntensity = entry.baseIntensity;
      }
    }
    e.model = inst;
    e.group.add(inst);
    const clips = clean.animations || [];
    if (clips.length) {
      e.mixer = new THREE.AnimationMixer(inst);
      e.actions = new Map();
      for (const clip of clips) {
        if (!e.actions.has(clip.name)) e.actions.set(clip.name, e.mixer.clipAction(clip));
      }
    }
    playAnim(e, ANIM.idle, { fade: 0, force: true });
    if (e.dying) playDeath(e);
  }

  function spawnEnemy(item, pos) {
    const type = item.type;
    const elite = !!item.elite;
    const scale = elite ? ELITE_SCALE : 1;
    const hp = type.hp * waveStats.hpMult * (elite ? ELITE_HP_MULT : 1);
    const e = {
      id: nextId++,
      type,
      elite,
      group: new THREE.Group(),
      model: null,
      mixer: null,
      actions: null,
      curAction: null,
      mats: [],
      hp,
      maxHp: hp,
      damage: type.damage * waveStats.dmgMult * (elite ? ELITE_DMG_MULT : 1),
      speed: type.speed * waveStats.speedMult,
      radius: BASE_RADIUS * scale,
      state: "chase",
      stateT: 0,
      attackCd: 0.25 + rand() * 0.5,
      dashCd: 0.8 + rand() * 0.8,
      dashing: false,
      dashT: 0,
      dashDir: new THREE.Vector3(),
      kx: 0,
      kz: 0,
      stun: 0,
      flashT: 0,
      emissiveMode: "base",
      dying: false,
      dead: false,
      solid: true,
      fadeT: 0,
    };
    e.group.name = `enemy-${type.id}${elite ? "-elite" : ""}`;
    e.group.position.set(pos.x, 0, pos.z);
    e.group.rotation.y = rand() * Math.PI * 2;
    e.group.scale.setScalar(scale);
    group.add(e.group);
    enemies.push(e);
    aliveN++;
    waveSpawned++;

    emit("enemy-spawned", { position: new THREE.Vector3(pos.x, 0.05, pos.z), type: type.id });
    emit("sfx", { name: "explode", position: new THREE.Vector3(pos.x, 0.6, pos.z), pitch: 0.6 + rand() * 0.3, volume: 0.5 });
    emitCount();

    const ready = readyCache.get(type.glb);
    if (ready) attachModel(e, ready);
    else {
      loadCleanedGltf(loader, type.glb, type.keep)
        .then((clean) => {
          readyCache.set(type.glb, clean);
          if (!e.dead) attachModel(e, clean);
        })
        .catch((err) => {
          console.error(`[enemies] failed to load ${type.glb}:`, err);
        });
    }
    return e;
  }

  function faceToward(e, dx, dz, dt, rate) {
    if (Math.abs(dx) < 1e-5 && Math.abs(dz) < 1e-5) return;
    const target = Math.atan2(dx, dz);
    const current = e.group.rotation.y;
    e.group.rotation.y = current + angleDelta(current, target) * Math.min(1, rate * dt);
  }

  function updateEmissive(e) {
    const mode = e.flashT > 0 ? "hit" : e.state === "windup" ? "windup" : "base";
    if (mode === "base" && e.emissiveMode === "base") return;
    e.emissiveMode = mode;
    const pulse = mode === "windup" ? 0.5 + 0.5 * Math.sin(e.stateT * 30) : 0;
    for (const entry of e.mats) {
      if (!entry.base) continue;
      if (mode === "hit") {
        entry.mat.emissive.setRGB(1, 1, 1);
        entry.mat.emissiveIntensity = 1.6;
      } else if (mode === "windup") {
        entry.mat.emissive.setRGB(1, 0.16, 0.06);
        entry.mat.emissiveIntensity = 0.4 + pulse;
      } else {
        entry.mat.emissive.copy(entry.base);
        entry.mat.emissiveIntensity = entry.baseIntensity;
      }
    }
  }

  function startWindup(e) {
    e.state = "windup";
    e.stateT = 0;
    playAnim(e, windupCandidates(e.type), { loop: false, clamp: true, fade: 0.06, force: true });
    emit("enemy-attack", { position: e.group.position.clone() });
    emit("sfx", { name: "enemy-windup", position: e.group.position.clone(), pitch: 0.9 + rand() * 0.25 });
  }

  function fireBolt(e, player) {
    const from = e.group.position.clone();
    from.y = 1.1;
    const dir = new THREE.Vector3(player.position.x - from.x, 0, player.position.z - from.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const radius = e.type.boltRadius || 0.5;
    const geo = new THREE.SphereGeometry(radius, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0x9fd7ff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    group.add(mesh);
    projectiles.push({ mesh, vel: dir.multiplyScalar(e.type.boltSpeed), radius, damage: e.damage, life: 4 });
    emit("sfx", { name: "cast", position: from.clone(), pitch: 1, volume: 0.9 });
  }

  function resolveAttack(e, player) {
    e.state = "chase";
    e.stateT = 0;
    e.attackCd = e.type.attackCooldown;
    const pos = e.group.position.clone();
    if (e.type.boltSpeed) {
      fireBolt(e, player);
      return;
    }
    const reach = e.type.attackRange + (player.radius ?? playerCfg.radius ?? 0.55);
    const d = Math.hypot(player.position.x - pos.x, player.position.z - pos.z);
    if (d <= reach) {
      if (typeof player.damage === "function") player.damage(e.damage, { from: pos.clone() });
      emit("sfx", { name: "hit", position: pos.clone(), pitch: 0.85, volume: 0.85 });
    } else {
      emit("sfx", { name: "swing", position: pos.clone(), volume: 0.4 });
    }
  }

  function moveAI(e, dt, dx, dz, dist) {
    const type = e.type;
    const len = dist > 1e-5 ? dist : 1;
    const nx = dx / len;
    const nz = dz / len;
    let mx = 0;
    let mz = 0;
    if (type.dash) {
      if (e.dashing) {
        e.dashT -= dt;
        mx = e.dashDir.x;
        mz = e.dashDir.z;
        if (dist <= type.attackRange * 0.75 || e.dashT <= 0) e.dashing = false;
      } else if (e.dashCd <= 0 && dist <= type.dashRange && dist > type.attackRange * 0.85) {
        e.dashing = true;
        e.dashT = 0.65;
        e.dashCd = 2.2;
        e.dashDir.set(nx, 0, nz);
        emit("sfx", { name: "dodge", position: e.group.position.clone(), pitch: 0.7, volume: 0.6 });
        mx = nx;
        mz = nz;
      } else if (dist > type.attackRange * 0.85) {
        mx = nx;
        mz = nz;
      }
    } else if (type.keepDistance) {
      if (dist < type.keepDistance * 0.9) {
        mx = -nx;
        mz = -nz;
      } else if (dist > type.keepDistance * 1.35 && dist > type.attackRange * 0.9) {
        mx = nx;
        mz = nz;
      }
    } else if (dist > type.attackRange * 0.85) {
      mx = nx;
      mz = nz;
    }
    if (mx !== 0 || mz !== 0) {
      const speed = e.dashing ? e.type.dashSpeed || e.speed : e.speed;
      e.group.position.x += mx * speed * dt;
      e.group.position.z += mz * speed * dt;
      return true;
    }
    return false;
  }

  function updateEnemy(e, dt, player) {
    if (e.mixer) e.mixer.update(dt);
    if (e.flashT > 0) e.flashT -= dt;
    if (e.mats.length) updateEmissive(e);

    if (e.dying) {
      e.fadeT -= dt;
      const k = clamp(e.fadeT / DEATH_FADE, 0, 1);
      for (const entry of e.mats) {
        entry.mat.transparent = true;
        entry.mat.depthWrite = false;
        entry.mat.opacity = entry.baseOpacity * k;
      }
      if (e.fadeT <= 0) removeEnemy(e);
      return;
    }

    if (e.stun > 0) e.stun -= dt;
    if (e.kx !== 0 || e.kz !== 0) {
      e.group.position.x += e.kx * dt;
      e.group.position.z += e.kz * dt;
      const decay = Math.exp(-KNOCKBACK_DECAY * dt);
      e.kx *= decay;
      e.kz *= decay;
      if (Math.abs(e.kx) < 0.05 && Math.abs(e.kz) < 0.05) {
        e.kx = 0;
        e.kz = 0;
      }
    }

    if (!player || !player.position) return;
    const dx = player.position.x - e.group.position.x;
    const dz = player.position.z - e.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (e.stun > 0) return;

    if (e.state === "windup") {
      e.stateT += dt;
      faceToward(e, dx, dz, dt, 14);
      if (e.stateT >= e.type.windup) resolveAttack(e, player);
      return;
    }

    e.attackCd -= dt;
    e.dashCd -= dt;
    const moving = moveAI(e, dt, dx, dz, dist);
    if (moving) faceToward(e, dx, dz, dt, 9);

    if (!e.dashing && e.attackCd <= 0 && dist <= e.type.attackRange) {
      startWindup(e);
      return;
    }

    if (e.dashing) playAnim(e, ANIM.run, { fade: 0.08 });
    else if (moving) playAnim(e, ANIM.walk, { fade: 0.15 });
    else playAnim(e, ANIM.idle, { fade: 0.2 });
  }

  function separate() {
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (a.dying) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (b.dying) continue;
        let dx = b.group.position.x - a.group.position.x;
        let dz = b.group.position.z - a.group.position.z;
        const min = a.radius + b.radius;
        let d = Math.hypot(dx, dz);
        if (d >= min) continue;
        if (d < 1e-4) {
          dx = rand() - 0.5;
          dz = rand() - 0.5;
          d = Math.hypot(dx, dz) || 1;
        }
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.group.position.x -= nx * push;
        a.group.position.z -= nz * push;
        b.group.position.x += nx * push;
        b.group.position.z += nz * push;
      }
    }
  }

  function constrain(e) {
    const p = e.group.position;
    const b = world && world.bounds;
    if (b) {
      p.x = clamp(p.x, b.minX + e.radius, b.maxX - e.radius);
      p.z = clamp(p.z, b.minZ + e.radius, b.maxZ - e.radius);
    }
    const colliders = world && world.colliders;
    if (Array.isArray(colliders)) {
      for (const c of colliders) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const min = (c.radius || 0) + e.radius;
        const d = Math.hypot(dx, dz);
        if (d < min) {
          if (d > 1e-5) {
            const push = min - d;
            p.x += (dx / d) * push;
            p.z += (dz / d) * push;
          } else {
            p.x += min;
          }
        }
      }
    }
    p.y = 0;
  }

  function updateProjectiles(dt) {
    const player = activePlayer;
    const b = world && world.bounds;
    const colliders = world && world.colliders;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      let remove = p.life <= 0;
      if (!remove && player && player.position) {
        const pr = playerCfg.radius ?? player.radius ?? 0.55;
        const d = Math.hypot(p.mesh.position.x - player.position.x, p.mesh.position.z - player.position.z);
        if (d <= pr + p.radius) {
          if (typeof player.damage === "function") player.damage(p.damage, { from: p.mesh.position.clone() });
          emit("sfx", { name: "explode", position: p.mesh.position.clone(), pitch: 1.2, volume: 0.7 });
          remove = true;
        }
      }
      if (!remove && b && (p.mesh.position.x < b.minX || p.mesh.position.x > b.maxX || p.mesh.position.z < b.minZ || p.mesh.position.z > b.maxZ)) {
        remove = true;
      }
      if (!remove && Array.isArray(colliders)) {
        for (const c of colliders) {
          const d = Math.hypot(p.mesh.position.x - c.x, p.mesh.position.z - c.z);
          if (d <= (c.radius || 0) + p.radius) {
            remove = true;
            break;
          }
        }
      }
      if (remove) {
        group.remove(p.mesh);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        if (p.mesh.material) p.mesh.material.dispose();
        projectiles.splice(i, 1);
      }
    }
  }

  function killEnemy(e) {
    if (e.dying || e.dead) return;
    e.dying = true;
    e.solid = false;
    e.state = "dying";
    e.fadeT = DEATH_FADE;
    e.kx = 0;
    e.kz = 0;
    killCount += 1;
    const pos = e.group.position.clone();
    pos.y = 1;
    emit("enemy-died", { position: pos, value: e.type.value, color: e.type.color });
    emit("sfx", { name: "kill", position: e.group.position.clone() });
    playDeath(e);
  }

  function removeEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    group.remove(e.group);
    for (const entry of e.mats) {
      if (entry.mat && typeof entry.mat.dispose === "function") entry.mat.dispose();
    }
    const idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
    aliveN = Math.max(0, aliveN - 1);
    emitCount();
  }

  function damageEnemy(enemy, amount, opts = {}) {
    if (!enemy || enemy.dead || enemy.dying || !enemy.solid) return false;
    const dmg = Number.isFinite(amount) ? amount : 0;
    enemy.hp -= dmg;
    enemy.flashT = HIT_FLASH;
    const pos = enemy.group.position.clone();
    pos.y = 1;
    emit("enemy-hit", { position: pos, amount: dmg, crit: !!opts.crit, color: enemy.type.color });
    emit("sfx", { name: opts.crit ? "crit" : "hit", position: enemy.group.position.clone() });
    emit("hitstop", { duration: opts.crit ? combat.hitstopCrit : combat.hitstopHit });
    emit("shake", { amount: opts.crit ? combat.shakeCrit : combat.shakeHit });
    if (opts.dir && Number.isFinite(opts.dir.x) && Number.isFinite(opts.dir.z)) {
      const len = Math.hypot(opts.dir.x, opts.dir.z) || 1;
      const kb = opts.heavy ? combat.enemyKnockbackHeavy : combat.enemyKnockback;
      enemy.kx += (opts.dir.x / len) * kb;
      enemy.kz += (opts.dir.z / len) * kb;
      enemy.stun = Math.max(enemy.stun, opts.heavy ? 0.3 : 0.18);
      if (enemy.state === "windup") {
        enemy.state = "chase";
        enemy.stateT = 0;
        enemy.attackCd = Math.max(enemy.attackCd, 0.25);
      }
    }
    if (enemy.hp <= 0) killEnemy(enemy);
    return true;
  }

  function onPlayerAttack(payload) {
    if (!payload || !payload.origin || !payload.dir) return;
    const origin = payload.origin;
    const dir = payload.dir;
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return;
    const dl = Math.hypot(dir.x, dir.z);
    if (dl < 1e-6) return;
    const ux = dir.x / dl;
    const uz = dir.z / dl;
    const range = Number.isFinite(payload.range) ? payload.range : 2;
    const halfArc = Math.max(0, Number.isFinite(payload.arc) ? payload.arc : 2) / 2;
    const damage = Number.isFinite(payload.damage) ? payload.damage : 0;
    const heavy = !!payload.heavy;
    const crit = !!payload.crit;
    for (const e of [...enemies]) {
      if (e.dead || e.dying || !e.solid) continue;
      const dx = e.group.position.x - origin.x;
      const dz = e.group.position.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.radius) continue;
      if (dist > 1e-4) {
        const cos = clamp((dx * ux + dz * uz) / dist, -1, 1);
        if (Math.acos(cos) > halfArc) continue;
      }
      damageEnemy(e, damage, { crit, heavy, dir: { x: ux, z: uz } });
    }
  }

  function update(dt, player) {
    let step = Number(dt);
    if (!Number.isFinite(step) || step < 0) step = 0;
    if (step > MAX_DT) step = MAX_DT;
    if (player) activePlayer = player;

    if (spawnQueue.length > 0) {
      spawnTimer -= step;
      if (spawnTimer <= 0 && aliveN < combat.maxAlive) {
        queueTelegraphs();
        spawnTimer = Math.max(0.05, combat.spawnInterval);
      }
    }

    for (let i = telegraphs.length - 1; i >= 0; i--) {
      const t = telegraphs[i];
      t.t += step;
      const k = clamp(t.t / t.dur, 0, 1);
      const s = 0.35 + k * 0.95;
      t.mesh.scale.set(s, s, s);
      t.mesh.material.opacity = 0.35 + 0.5 * Math.abs(Math.sin(t.t * 9));
      if (t.t >= t.dur) {
        if (aliveN < combat.maxAlive) {
          group.remove(t.mesh);
          t.mesh.geometry.dispose();
          t.mesh.material.dispose();
          telegraphs.splice(i, 1);
          spawnEnemy(t.item, t.pos);
        } else {
          t.t = t.dur;
        }
      }
    }

    for (const e of [...enemies]) updateEnemy(e, step, activePlayer);
    updateProjectiles(step);
    separate();
    for (const e of enemies) constrain(e);
    emitCount();
  }

  function clearAll() {
    for (const e of enemies) {
      e.dead = true;
      e.dying = false;
      e.solid = false;
      group.remove(e.group);
      for (const entry of e.mats) {
        if (entry.mat && typeof entry.mat.dispose === "function") entry.mat.dispose();
      }
    }
    enemies.length = 0;
    for (const t of telegraphs) {
      group.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
    }
    telegraphs.length = 0;
    for (const p of projectiles) {
      group.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    projectiles.length = 0;
    spawnQueue.length = 0;
    spawnTimer = 0;
    waveSpawned = 0;
    aliveN = 0;
    killCount = 0;
    emitCount();
  }

  if (events && typeof events.on === "function") events.on("player-attack", onPlayerAttack);

  return {
    group,
    get list() {
      return enemies;
    },
    get aliveCount() {
      return aliveN;
    },
    get totalCount() {
      return waveSpawned;
    },
    get killCount() {
      return killCount;
    },
    spawnWave,
    update,
    clearAll,
    damageEnemy,
  };
}
