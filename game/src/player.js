import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { CONFIG, CHARACTERS, PALETTE, clamp, angleDelta } from "./balance.js";

const TARGET_HEIGHT = 1.9;
const MAX_DT = 0.1;
const KNOCKBACK_DECAY = 8;
const BLINK_HZ = 14;
const JUMP_START_TIME = 0.3;
const JUMP_LAND_TIME = 0.28;
const IDLE_CLIPS = new Set(["Idle", "Idle_B", "Unarmed_Idle", "T-Pose"]);

const ANIM = {
  idle: ["Idle", "Unarmed_Idle", "T-Pose"],
  walk: ["Walking_A", "Walking_B", "Walking_C", "Idle"],
  run: ["Running_A", "Running_B", "Walking_A", "Idle"],
  jumpStart: ["Jump_Start", "Jump_Idle", "Idle"],
  jumpIdle: ["Jump_Idle", "Jump_Start", "Idle"],
  jumpLand: ["Jump_Land", "Jump_Idle", "Idle"],
  death: ["Death_A", "Death_B", "Idle"],
  dodgeForward: ["Dodge_Forward", "Dodge_Left", "Dodge_Right", "Dodge_Backward"],
  dodgeBack: ["Dodge_Backward", "Dodge_Right", "Dodge_Left", "Dodge_Forward"],
  dodgeLeft: ["Dodge_Left", "Dodge_Forward", "Dodge_Backward", "Dodge_Right"],
  dodgeRight: ["Dodge_Right", "Dodge_Forward", "Dodge_Backward", "Dodge_Left"],
};

const gltfCache = new Map();

function boundsOf(meshes) {
  const box = new THREE.Box3();
  let found = false;
  for (const mesh of meshes) {
    if (!mesh || !mesh.geometry) continue;
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
  if (!root) throw new Error("player: gltf has no scene");
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const skinned = [];
  const rigid = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh) skinned.push(o);
    else if (o.isMesh) rigid.push(o);
  });

  const keepList = Array.isArray(keep) ? keep.filter(Boolean) : [];
  const keepMatch = (name) => !!name && keepList.some((k) => name === k);
  const firstSkin = skinned.length ? skinned[0].skeleton : null;

  for (const mesh of skinned) {
    mesh.frustumCulled = false;
    if (firstSkin && mesh.skeleton && mesh.skeleton !== firstSkin) mesh.visible = false;
  }
  for (const mesh of rigid) {
    const parentName = mesh.parent ? mesh.parent.name : "";
    mesh.visible = keepMatch(mesh.name) || keepMatch(parentName);
  }

  const source = skinned.length ? skinned : rigid;
  const box = boundsOf(source);
  if (box && box.max.y - box.min.y > 1e-4) {
    const scale = TARGET_HEIGHT / (box.max.y - box.min.y);
    root.scale.setScalar(scale);
    root.position.y = -box.min.y * scale;
  }
  root.updateMatrixWorld(true);

  return { scene: root, animations: Array.isArray(gltf.animations) ? gltf.animations : [] };
}

function loadGltf(loader, url) {
  if (loader && typeof loader.loadAsync === "function") {
    return Promise.resolve(loader.loadAsync(url));
  }
  if (loader && typeof loader.load === "function") {
    return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  }
  if (loader && loader.scene) return Promise.resolve(loader);
  return Promise.reject(new Error(`player: no usable loader for ${url}`));
}

async function loadCleanedGltf(loader, url, keep) {
  if (!gltfCache.has(url)) {
    gltfCache.set(url, loadGltf(loader, url).then((gltf) => cleanGltf(gltf, keep)));
  }
  try {
    return await gltfCache.get(url);
  } catch (err) {
    gltfCache.delete(url);
    throw err;
  }
}

function baseStats() {
  return {
    damageMult: 1,
    moveSpeedMult: 1,
    critChance: 0.05,
    range: 0,
    arc: 0,
    coinMult: 1,
    attackSpeedMult: 1,
    lifesteal: 0,
    dodgeCooldownMult: 1,
    thorns: 0,
  };
}

function approach(value, target, maxDelta) {
  const d = target - value;
  if (d > maxDelta) return value + maxDelta;
  if (d < -maxDelta) return value - maxDelta;
  return target;
}

export function createPlayer(options = {}) {
  const { scene, world, events, config, hero, loader = new GLTFLoader() } = options;
  const H = hero || CHARACTERS.knight;
  const cfg = { ...CONFIG.player, ...(config && config.player ? config.player : {}) };
  const comboClips = Array.isArray(H.combo) && H.combo.length ? H.combo : ["Unarmed_Melee_Attack_Punch_A"];
  const comboSwings = Array.isArray(H.swing) && H.swing.length ? H.swing : [0.3];
  const comboLen = comboClips.length;
  const heroHp = Number.isFinite(H.hp) ? H.hp : 100;
  const heroDamage = Number.isFinite(H.damage) ? H.damage : 1;
  const heroRange = Number.isFinite(H.range) ? H.range : 2;
  const heroArc = Number.isFinite(H.arc) ? H.arc : 2;
  const heroMoveSpeed = Number.isFinite(H.moveSpeed) ? H.moveSpeed : 5;

  const group = new THREE.Group();
  group.name = "player";
  if (scene && typeof scene.add === "function") scene.add(group);

  const position = group.position;
  const home = new THREE.Vector3(0, 0, 0);
  const facing = new THREE.Vector3(0, 0, 1);

  const stats = baseStats();
  let hp = heroHp;
  let maxHp = heroHp;
  let alive = true;

  let model = null;
  let mixer = null;
  let actions = null;
  let current = null;

  let vx = 0;
  let vz = 0;
  let vy = 0;
  let grounded = true;
  let kbx = 0;
  let kbz = 0;

  let dodging = false;
  let dodgeT = 0;
  let dodgeIFramesT = 0;
  let dodgeCdT = 0;
  let dodgeCdTotal = Math.max(0.05, cfg.dodgeCooldown);
  const dodgeDir = new THREE.Vector3(0, 0, 1);

  let attacking = false;
  let attackElapsed = 0;
  let attackDur = 0;
  let impactFired = true;
  let swingIndex = -1;
  let comboIndex = 0;
  let comboWindowT = 0;
  let queuedAttack = false;
  let lungeT = 0;

  let hurtInvulnT = 0;
  let jumpPhase = "none";
  let jumpPhaseT = 0;
  let currentAimYaw = null;

  const projectiles = [];
  const BLAST_SPEED = 22;
  const blastGeo = new THREE.SphereGeometry(0.24, 10, 8);
  const blastMat = new THREE.MeshBasicMaterial({ color: PALETTE.arcane, transparent: true, opacity: 0.95 });

  function spawnBlastMesh(pos) {
    const mesh = new THREE.Mesh(blastGeo, blastMat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(1);
    if (scene && typeof scene.add === "function") scene.add(mesh);
    return mesh;
  }

  function removeBlastMesh(mesh) {
    if (!mesh) return;
    if (mesh.parent) mesh.parent.remove(mesh);
    if (mesh.material && mesh.material !== blastMat) mesh.material.dispose();
    if (mesh.geometry && mesh.geometry !== blastGeo) mesh.geometry.dispose();
  }

  function resolveBlast(p) {
    emit("player-attack", {
      origin: p.pos.clone(),
      dir: facing,
      range: p.radius,
      arc: Math.PI * 2,
      damage: p.damage,
      heavy: true,
      crit: p.crit,
    });
    emit("player-blast", { position: p.pos.clone(), radius: p.radius, color: PALETTE.arcane });
    emit("sfx", { name: "explode", position: p.pos.clone() });
  }

  function updateProjectiles(step) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.pos.addScaledVector(p.vel, step);
      p.life -= step;
      let hitWorld = false;
      if (world && Array.isArray(world.colliders)) {
        for (const c of world.colliders) {
          const dx = p.pos.x - c.x;
          const dz = p.pos.z - c.z;
          if (dx * dx + dz * dz < (c.radius + 0.3) * (c.radius + 0.3)) {
            hitWorld = true;
            break;
          }
        }
      }
      if (world && world.bounds) {
        const b = world.bounds;
        if (p.pos.x < b.minX || p.pos.x > b.maxX || p.pos.z < b.minZ || p.pos.z > b.maxZ) hitWorld = true;
      }
      if (p.mesh) {
        p.mesh.position.copy(p.pos);
        p.mesh.scale.setScalar(1 + Math.sin(p.life * 30) * 0.12);
      }
      if (hitWorld || p.life <= 0) {
        resolveBlast(p);
        removeBlastMesh(p.mesh);
        projectiles.splice(i, 1);
      }
    }
  }

  function clearProjectiles() {
    for (const p of projectiles) removeBlastMesh(p.mesh);
    projectiles.length = 0;
  }

  function emit(name, payload) {
    if (events && typeof events.emit === "function") events.emit(name, payload);
  }

  function playAnim(candidates, opts = {}) {
    if (!mixer || !actions) return null;
    let action = null;
    for (const name of candidates) {
      if (!name) continue;
      const found = actions.get(name);
      if (found) {
        action = found;
        break;
      }
    }
    if (!action) return null;

    const idleish = IDLE_CLIPS.has(action.getClip().name);
    let loop = opts.loop !== false;
    let clampWhenFinished = !!opts.clamp;
    if (!loop && idleish && opts.idleLoop !== false) {
      loop = true;
      clampWhenFinished = false;
    }
    const fade = Number.isFinite(opts.fade) ? opts.fade : 0.15;
    if (!opts.force && current === action && action.isRunning()) return action;

    const prev = current;
    action.enabled = true;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = clampWhenFinished;
    let timeScale = Number.isFinite(opts.timeScale) ? opts.timeScale : 1;
    const clipDur = action.getClip().duration;
    if (opts.fit && !idleish && clipDur > 0.05 && opts.fit > 0.01) timeScale = clipDur / opts.fit;
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.reset();
    if (fade > 0) action.fadeIn(fade);
    action.play();
    if (prev && prev !== action) {
      if (fade > 0) prev.fadeOut(fade);
      else prev.stop();
    }
    current = action;
    return action;
  }

  function attachModel(clean) {
    if (!clean || !clean.scene) return;
    const instance = cloneSkeleton(clean.scene);
    instance.traverse((o) => {
      if (o.isSkinnedMesh) o.frustumCulled = false;
    });
    model = instance;
    group.add(instance);

    const clips = Array.isArray(clean.animations) ? clean.animations : [];
    if (clips.length) {
      mixer = new THREE.AnimationMixer(instance);
      actions = new Map();
      for (const clip of clips) {
        if (clip && clip.name && !actions.has(clip.name)) actions.set(clip.name, mixer.clipAction(clip));
      }
    }
    current = null;
    if (!alive) {
      playAnim(ANIM.death, { loop: false, clamp: true, fade: 0, force: true });
    } else {
      updateAnim(false);
    }
  }

  function swingDuration(i) {
    const fallback = Number.isFinite(comboSwings[comboSwings.length - 1]) ? comboSwings[comboSwings.length - 1] : 0.3;
    const base = Number.isFinite(comboSwings[i]) ? comboSwings[i] : fallback;
    const speed = stats.attackSpeedMult > 0.05 ? stats.attackSpeedMult : 1;
    return Math.max(0.05, base / speed);
  }

  function fireImpact() {
    const crit = Math.random() < stats.critChance;
    let damage = heroDamage * stats.damageMult;
    if (crit) damage *= 2;
    if (H.style === "blast") {
      const origin = position.clone();
      origin.y = 1.1;
      const dir = facing.clone();
      const range = heroRange + stats.range;
      projectiles.push({
        pos: origin.clone(),
        vel: dir.clone().multiplyScalar(BLAST_SPEED),
        life: range / BLAST_SPEED,
        damage,
        crit,
        radius: Number.isFinite(H.blastRadius) ? H.blastRadius : 2.4,
        mesh: spawnBlastMesh(origin),
      });
      emit("player-cast", { position: origin.clone(), color: PALETTE.arcane });
      emit("sfx", { name: "cast", position: origin.clone() });
      return;
    }
    emit("player-attack", {
      origin: position.clone(),
      dir: facing,
      range: heroRange + stats.range,
      arc: heroArc + stats.arc,
      damage,
      heavy: swingIndex === comboLen - 1,
      crit,
    });
  }

  function startSwing(i) {
    const idx = clamp(Math.floor(i), 0, comboLen - 1);
    const dur = swingDuration(idx);
    attacking = true;
    attackElapsed = 0;
    attackDur = dur;
    impactFired = false;
    swingIndex = idx;
    comboIndex = idx + 1;
    comboWindowT = 0;
    queuedAttack = false;
    lungeT = Math.min(0.18, dur * 0.5);
    if (currentAimYaw !== null) {
      group.rotation.y = currentAimYaw;
      facing.set(Math.sin(group.rotation.y), 0, Math.cos(group.rotation.y));
    }
    const heavy = idx === comboLen - 1;
    emit("sfx", {
      name: heavy ? "swing-heavy" : "swing",
      position: position.clone(),
      pitch: 0.94 + Math.random() * 0.12,
      volume: heavy ? 0.95 : 0.8,
    });
    playAnim([comboClips[idx], "Idle"], { loop: false, clamp: true, fade: 0.12, fit: dur });
  }

  function handleAttackInput() {
    if (attacking) {
      queuedAttack = true;
      return;
    }
    if (dodging) return;
    startSwing(comboIndex < comboLen ? comboIndex : 0);
  }

  function updateAttack(step) {
    if (!attacking) return;
    attackElapsed += step;
    if (!impactFired && attackElapsed >= attackDur * 0.45) {
      impactFired = true;
      fireImpact();
    }
    if (attackElapsed >= attackDur) {
      attacking = false;
      comboWindowT = cfg.comboWindow;
      if (queuedAttack) {
        queuedAttack = false;
        startSwing(comboIndex < comboLen ? comboIndex : 0);
      }
    }
  }

  function dodgeCandidates(dir) {
    const dot = dir.x * facing.x + dir.z * facing.z;
    const cross = facing.x * dir.z - facing.z * dir.x;
    if (dot > 0.5) return ANIM.dodgeForward;
    if (dot < -0.5) return ANIM.dodgeBack;
    return cross > 0 ? ANIM.dodgeLeft : ANIM.dodgeRight;
  }

  function startDodge(ix, iz, wantsMove) {
    dodging = true;
    dodgeT = cfg.dodgeTime;
    dodgeIFramesT = cfg.dodgeIFrames;
    dodgeCdTotal = Math.max(0.05, cfg.dodgeCooldown * stats.dodgeCooldownMult);
    dodgeCdT = dodgeCdTotal;
    if (wantsMove) dodgeDir.set(ix, 0, iz).normalize();
    else dodgeDir.copy(facing);
    attacking = false;
    queuedAttack = false;
    comboWindowT = 0;
    lungeT = 0;
    emit("player-dodged", {});
    emit("sfx", { name: "dodge", position: position.clone() });
    playAnim(dodgeCandidates(dodgeDir), { loop: false, fade: 0.1, fit: cfg.dodgeTime });
  }

  function updateDodge(step) {
    if (!dodging) return;
    dodgeT -= step;
    if (dodgeT <= 0) {
      dodgeT = 0;
      dodging = false;
    }
  }

  function startJump() {
    vy = cfg.jumpSpeed;
    grounded = false;
    attacking = false;
    queuedAttack = false;
    comboWindowT = 0;
    lungeT = 0;
    jumpPhase = "start";
    jumpPhaseT = JUMP_START_TIME;
    emit("player-jumped", {});
    emit("sfx", { name: "jump", position: position.clone() });
    playAnim(ANIM.jumpStart, { loop: false, clamp: true, fade: 0.12, fit: JUMP_START_TIME });
  }

  function land() {
    grounded = true;
    vy = 0;
    position.y = 0;
    jumpPhase = "land";
    jumpPhaseT = JUMP_LAND_TIME;
    emit("player-landed", {});
    emit("sfx", { name: "land", position: position.clone() });
    playAnim(ANIM.jumpLand, { loop: false, clamp: true, fade: 0.12, fit: JUMP_LAND_TIME });
  }

  function updateJump(step) {
    if (!grounded) {
      vy -= cfg.gravity * step;
      position.y += vy * step;
      if (position.y <= 0) {
        position.y = 0;
        vy = 0;
        land();
      }
    }
    if (jumpPhase === "start") {
      jumpPhaseT -= step;
      if (jumpPhaseT <= 0) jumpPhase = "idle";
    } else if (jumpPhase === "land") {
      jumpPhaseT -= step;
      if (jumpPhaseT <= 0) jumpPhase = "none";
    }
  }

  function constrain() {
    const b = world && world.bounds;
    const r = Number.isFinite(cfg.radius) ? cfg.radius : 0.55;
    if (b) {
      position.x = clamp(position.x, b.minX + r, b.maxX - r);
      position.z = clamp(position.z, b.minZ + r, b.maxZ - r);
    }
    const colliders = world && world.colliders;
    if (Array.isArray(colliders)) {
      for (const c of colliders) {
        const dx = position.x - c.x;
        const dz = position.z - c.z;
        const min = (c.radius || 0) + r;
        const d = Math.hypot(dx, dz);
        if (d < min) {
          if (d > 1e-5) {
            const push = min - d;
            position.x += (dx / d) * push;
            position.z += (dz / d) * push;
          } else {
            position.x += min;
          }
        }
      }
    }
    if (grounded) position.y = 0;
  }

  function updateMovement(step, ix, iz, wantsMove, sprint) {
    const maxSpeed = heroMoveSpeed * stats.moveSpeedMult * (sprint && wantsMove ? cfg.sprintMult : 1);
    if (dodging) {
      vx = dodgeDir.x * cfg.dodgeSpeed;
      vz = dodgeDir.z * cfg.dodgeSpeed;
    } else if (lungeT > 0 && grounded) {
      vx = facing.x * cfg.lunge;
      vz = facing.z * cfg.lunge;
    } else if (attacking) {
      vx = approach(vx, 0, cfg.decel * step);
      vz = approach(vz, 0, cfg.decel * step);
    } else if (wantsMove) {
      vx = approach(vx, ix * maxSpeed, cfg.accel * step);
      vz = approach(vz, iz * maxSpeed, cfg.accel * step);
    } else {
      vx = approach(vx, 0, cfg.decel * step);
      vz = approach(vz, 0, cfg.decel * step);
    }

    position.x += (vx + kbx) * step;
    position.z += (vz + kbz) * step;

    if (kbx !== 0 || kbz !== 0) {
      const decay = Math.exp(-KNOCKBACK_DECAY * step);
      kbx *= decay;
      kbz *= decay;
      if (Math.abs(kbx) < 0.02) kbx = 0;
      if (Math.abs(kbz) < 0.02) kbz = 0;
    }

    constrain();
  }

  function updateAnim(sprint) {
    if (!mixer) return;
    if (attacking || dodging) return;
    if (jumpPhase === "start" || jumpPhase === "land") return;
    if (!grounded) {
      playAnim(ANIM.jumpIdle, { fade: 0.15 });
      return;
    }
    const speed = Math.hypot(vx, vz);
    if (speed > 0.5) {
      const base = heroMoveSpeed * stats.moveSpeedMult;
      const running = sprint || speed > base * 0.8;
      playAnim(running ? ANIM.run : ANIM.walk, { fade: 0.15 });
    } else {
      playAnim(ANIM.idle, { fade: 0.18 });
    }
  }

  function tickTimers(step) {
    if (lungeT > 0) {
      lungeT -= step;
      if (lungeT < 0) lungeT = 0;
    }
    if (dodgeIFramesT > 0) {
      dodgeIFramesT -= step;
      if (dodgeIFramesT < 0) dodgeIFramesT = 0;
    }
    if (dodgeCdT > 0) {
      dodgeCdT -= step;
      if (dodgeCdT < 0) dodgeCdT = 0;
    }
    if (comboWindowT > 0) {
      comboWindowT -= step;
      if (comboWindowT <= 0) {
        comboWindowT = 0;
        if (!attacking) comboIndex = 0;
      }
    }
    if (hurtInvulnT > 0) {
      hurtInvulnT -= step;
      if (hurtInvulnT <= 0) {
        hurtInvulnT = 0;
        if (model && alive) model.visible = true;
      } else if (model) {
        model.visible = Math.floor(hurtInvulnT * BLINK_HZ) % 2 === 0;
      }
    }
  }

  function update(dt, input) {
    let step = Number(dt);
    if (!Number.isFinite(step) || step < 0) step = 0;
    if (step > MAX_DT) step = MAX_DT;

    if (!alive) {
      if (mixer) mixer.update(step);
      return;
    }

    const inp = input || {};
    const move = inp.move || {};
    let ix = Number(move.x);
    let iz = Number(move.z);
    if (!Number.isFinite(ix)) ix = 0;
    if (!Number.isFinite(iz)) iz = 0;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) {
      ix /= mag;
      iz /= mag;
    }
    const wantsMove = mag > 1e-4;

    const aim = inp.aim;
    let aimYaw = null;
    if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)) {
      const dx = aim.x - position.x;
      const dz = aim.z - position.z;
      if (dx * dx + dz * dz > 0.25) aimYaw = Math.atan2(dx, dz);
      else if (Math.abs(aim.x) > 1e-6 || Math.abs(aim.z) > 1e-6) aimYaw = Math.atan2(aim.x, aim.z);
    }
    currentAimYaw = aimYaw;

    // Face the direction of travel (Genshin-style); attacks turn toward the look direction.
    let targetYaw = null;
    let turnRate = Math.max(0, cfg.turnSpeed);
    if (attacking && aimYaw !== null) {
      targetYaw = aimYaw;
      turnRate *= 1.6;
    } else if (wantsMove) {
      targetYaw = Math.atan2(ix, iz);
    }
    if (targetYaw !== null) {
      const k = 1 - Math.exp(-turnRate * step);
      group.rotation.y += angleDelta(group.rotation.y, targetYaw) * k;
    }
    facing.set(Math.sin(group.rotation.y), 0, Math.cos(group.rotation.y));

    if (inp.dodge && grounded && !dodging && dodgeCdT <= 0) startDodge(ix, iz, wantsMove);
    if (inp.jump && grounded && !dodging) startJump();
    if (inp.attack) handleAttackInput();

    updateAttack(step);
    updateMovement(step, ix, iz, wantsMove, !!inp.sprint);
    updateJump(step);
    updateDodge(step);
    updateProjectiles(step);
    tickTimers(step);
    updateAnim(!!inp.sprint);

    if (mixer) mixer.update(step);
  }

  function damage(amount, opts) {
    if (!alive) return false;
    if (dodging || dodgeIFramesT > 0) return false;
    if (hurtInvulnT > 0) return false;
    const dmg = Number(amount);
    if (!Number.isFinite(dmg) || dmg <= 0) return false;

    hp = Math.max(0, hp - dmg);
    hurtInvulnT = cfg.hurtInvuln;

    const from = opts && opts.from;
    if (from && Number.isFinite(from.x) && Number.isFinite(from.z)) {
      let dx = position.x - from.x;
      let dz = position.z - from.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) {
        dx /= d;
        dz /= d;
        kbx += dx * cfg.knockback;
        kbz += dz * cfg.knockback;
      }
    }

    emit("player-hurt", { amount: dmg, hp });
    emit("sfx", { name: "hurt", position: position.clone() });
    if (hp <= 0) die();
    return true;
  }

  function die() {
    if (!alive) return;
    alive = false;
    dodging = false;
    attacking = false;
    queuedAttack = false;
    lungeT = 0;
    vx = 0;
    vz = 0;
    vy = 0;
    grounded = true;
    position.y = 0;
    jumpPhase = "none";
    if (model) model.visible = true;
    playAnim(ANIM.death, { loop: false, clamp: true, fade: 0.08, force: true });
    emit("player-died", {});
    emit("sfx", { name: "death", position: position.clone() });
  }

  function heal(n) {
    if (!alive) return 0;
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return 0;
    const before = hp;
    hp = Math.min(maxHp, hp + v);
    return hp - before;
  }

  function addMaxHp(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v === 0) return maxHp;
    maxHp = Math.max(1, maxHp + v);
    if (hp > maxHp) hp = maxHp;
    return maxHp;
  }

  function resetStats() {
    Object.assign(stats, baseStats());
  }

  function respawn(pos) {
    alive = true;
    resetStats();
    maxHp = heroHp;
    hp = maxHp;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) home.set(pos.x, 0, pos.z);
    position.copy(home);
    position.y = 0;
    vx = 0;
    vz = 0;
    vy = 0;
    kbx = 0;
    kbz = 0;
    grounded = true;
    dodging = false;
    dodgeT = 0;
    dodgeIFramesT = 0;
    dodgeCdT = 0;
    attacking = false;
    queuedAttack = false;
    swingIndex = -1;
    comboIndex = 0;
    comboWindowT = 0;
    lungeT = 0;
    hurtInvulnT = 0;
    jumpPhase = "none";
    jumpPhaseT = 0;
    clearProjectiles();
    group.rotation.y = 0;
    facing.set(0, 0, 1);
    if (model) model.visible = true;
    if (mixer) {
      current = null;
      playAnim(ANIM.idle, { fade: 0, force: true });
    }
  }

  if (H && H.glb) {
    loadCleanedGltf(loader, H.glb, H.keep)
      .then((clean) => attachModel(clean))
      .catch((err) => {
        console.error(`[player] failed to load ${H.glb}:`, err);
      });
  }

  return {
    group,
    position,
    get hp() {
      return hp;
    },
    get maxHp() {
      return maxHp;
    },
    get alive() {
      return alive;
    },
    stats,
    hero: H,
    radius: Number.isFinite(cfg.radius) ? cfg.radius : 0.55,
    update,
    damage,
    heal,
    addMaxHp,
    respawn,
    get dodgeCooldownFrac() {
      return dodgeCdTotal > 0 ? clamp(dodgeCdT / dodgeCdTotal, 0, 1) : 0;
    },
    get isDodging() {
      return dodging;
    },
  };
}
