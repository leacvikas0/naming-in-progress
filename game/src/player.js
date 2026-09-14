import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {
  CONFIG,
  CHARACTERS,
  ELEMENTS,
  MOMENTUM_GAIN,
  PALETTE,
  clamp,
  angleDelta,
  momentumAfter,
} from "./balance.js";

const TARGET_HEIGHT = 1.9;
const MAX_DT = 0.1;
const KNOCKBACK_DECAY = 8;
const BLINK_HZ = 14;
const JUMP_START_TIME = 0.3;
const JUMP_LAND_TIME = 0.28;
const HEAVY_COOLDOWN = 1.0;
const HEAVY_DUR = 0.75;
const HEAVY_LUNGE_TIME = 0.3;
const SUPER_ENTRY = 1.2;
const NOVA_RECOVER = 0.5;
const WHIRLWIND_TIME = 3.0;
const WHIRLWIND_TICK = 0.35;
const FLURRY_HITS = 4;
const FLURRY_BLINKS = 5;
const FLURRY_GAP = 0.1;
const FLURRY_STEP = 2.2;
const METEOR_DELAY = 0.8;
const METEOR_RANGE = 7.0;
const METEOR_RECOVER = 0.3;
const PERFECT_DODGE_CD = 0.25;
const SUPER_BUFFER = 0.5;
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
    reactionMult: 1,
    auraMult: 1,
    momentumMult: 1,
    swapCooldownMult: 1,
    executeMult: 0,
    reactionHeal: 0,
    perfectT: 0,
    swapSpeedMult: 1,
    swapSpeedTime: 0,
  };
}

function approach(value, target, maxDelta) {
  const d = target - value;
  if (d > maxDelta) return value + maxDelta;
  if (d < -maxDelta) return value - maxDelta;
  return target;
}

export function createPlayer(options = {}) {
  const { scene, world, events, config, hero, partner, loader = new GLTFLoader() } = options;
  const cfg = { ...CONFIG.player, ...(config && config.player ? config.player : {}) };
  const momentumMax = Number.isFinite(cfg.momentumMax) && cfg.momentumMax > 0 ? cfg.momentumMax : 100;

  const hpOf = (def) => (Number.isFinite(def && def.hp) ? def.hp : 100);
  const startingDef = hero || CHARACTERS.knight;
  let partnerDef = partner || null;
  if (!partnerDef || partnerDef === startingDef || partnerDef.id === startingDef.id) {
    partnerDef = Object.values(CHARACTERS).find((c) => c.id !== startingDef.id) || startingDef;
  }

  const party = [
    { def: startingDef, hp: hpOf(startingDef), maxHp: hpOf(startingDef) },
    { def: partnerDef, hp: hpOf(partnerDef), maxHp: hpOf(partnerDef) },
  ];
  let activeIdx = 0;

  const group = new THREE.Group();
  group.name = "player";
  if (scene && typeof scene.add === "function") scene.add(group);

  const position = group.position;
  const home = new THREE.Vector3(0, 0, 0);
  const facing = new THREE.Vector3(0, 0, 1);

  const stats = baseStats();
  let alive = true;

  let model = null;
  let mixer = null;
  let actions = null;
  let current = null;
  let attachedUrl = null;

  // Active hero and its derived numbers. `useHero` keeps them in step with the
  // party slot that is currently on the field.
  let H = party[0].def;
  let comboClips = ["Unarmed_Melee_Attack_Punch_A"];
  let comboSwings = [0.3];
  let comboLen = 1;
  let heroDamage = 1;
  let heroRange = 2;
  let heroArc = 2;
  let heroMoveSpeed = 5;

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
  let attackKind = "light";
  let attackElapsed = 0;
  let attackDur = 0;
  let impactFired = true;
  let swingIndex = -1;
  let comboIndex = 0;
  let comboWindowT = 0;
  let queuedAttack = false;
  let lungeT = 0;
  let lungeSpeed = cfg.lunge;

  let heavyCdT = 0;
  let heavyCdTotal = Number.isFinite(cfg.heavyCooldown) ? Math.max(0.05, cfg.heavyCooldown) : HEAVY_COOLDOWN;

  let momentum = 0;
  let swapCdT = 0;
  let swapCdTotal = Math.max(0.05, cfg.swapCooldown);
  let swapIFramesT = 0;
  let swapSpeedT = 0;
  let perfectDodgeCdT = 0;

  let superActive = false;
  let superEntryT = 0;
  let superT = 0;
  let superDef = null;
  let superHitT = 0;
  let superHits = 0;
  let superBlinks = 0;
  let superFired = false;
  const superAim = new THREE.Vector3();

  let prevSwap = false;
  let prevSuper = false;
  let prevHeavy = false;
  let superBufferT = 0;
  let prevSuperActive = false;

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
    emit(
      "player-attack",
      attackPayload({
        origin: p.pos,
        kind: "light",
        heavy: true,
        stun: 0,
        knockback: CONFIG.combat.enemyKnockbackHeavy,
        damage: p.damage,
        crit: p.crit,
        range: p.radius,
        arc: Math.PI * 2,
      })
    );
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

  function detachModel() {
    if (model && model.parent) model.parent.remove(model);
    if (mixer) mixer.stopAllAction();
    model = null;
    mixer = null;
    actions = null;
    current = null;
    attachedUrl = null;
  }

  function attachModel(clean) {
    if (!clean || !clean.scene) return;
    detachModel();
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

  function ensureModel(def) {
    if (!def || !def.glb) return;
    const url = def.glb;
    if (attachedUrl === url) return;
    loadCleanedGltf(loader, url, def.keep)
      .then((clean) => {
        if (H !== def || attachedUrl === url) return;
        attachModel(clean);
        attachedUrl = url;
      })
      .catch((err) => {
        console.error(`[player] failed to load ${url}:`, err);
      });
  }

  function useHero(idx) {
    const entry = party[idx];
    if (!entry) return;
    const changed = entry.def !== H;
    activeIdx = idx;
    H = entry.def;
    comboClips = Array.isArray(H.combo) && H.combo.length ? H.combo : ["Unarmed_Melee_Attack_Punch_A"];
    comboSwings = Array.isArray(H.swing) && H.swing.length ? H.swing : [0.3];
    comboLen = comboClips.length;
    heroDamage = Number.isFinite(H.damage) ? H.damage : 1;
    heroRange = Number.isFinite(H.range) ? H.range : 2;
    heroArc = Number.isFinite(H.arc) ? H.arc : 2;
    heroMoveSpeed = Number.isFinite(H.moveSpeed) ? H.moveSpeed : 5;
    swingIndex = -1;
    if (!changed && attachedUrl === H.glb) return;
    detachModel();
    ensureModel(H);
  }

  function perfectMult() {
    return stats.perfectT > 0 ? cfg.perfectDamageMult : 1;
  }

  function rollDamage(mult) {
    const crit = Math.random() < stats.critChance;
    let damage = heroDamage * stats.damageMult * mult * perfectMult();
    if (crit) damage *= 2;
    return { damage, crit };
  }

  function attackPayload(opts) {
    return {
      origin: (opts.origin || position).clone(),
      dir: facing,
      range: opts.range,
      arc: opts.arc,
      damage: opts.damage,
      heavy: !!opts.heavy,
      crit: !!opts.crit,
      element: H.element,
      kind: opts.kind,
      stun: Number.isFinite(opts.stun) ? opts.stun : 0,
      knockback: Number.isFinite(opts.knockback) ? opts.knockback : 0,
      reactionMult: stats.reactionMult,
      auraMult: stats.auraMult,
      executeMult: stats.executeMult,
      reactionHeal: stats.reactionHeal,
    };
  }

  function superReadyNow() {
    return momentumMax > 0 && momentum >= momentumMax;
  }

  function emitMomentum() {
    emit("momentum", { value: momentum, max: momentumMax, ready: superReadyNow() });
  }

  function gainMomentum(base) {
    if (!alive) return;
    const mult = stats.momentumMult > 0 ? stats.momentumMult : 1;
    const next = momentumAfter(momentum, base * mult, momentumMax);
    if (next === momentum) return;
    momentum = next;
    emitMomentum();
  }

  function spendMomentum() {
    if (momentum === 0) return;
    momentum = 0;
    emitMomentum();
  }

  function swingDuration(i) {
    const fallback = Number.isFinite(comboSwings[comboSwings.length - 1]) ? comboSwings[comboSwings.length - 1] : 0.3;
    const base = Number.isFinite(comboSwings[i]) ? comboSwings[i] : fallback;
    const speed = stats.attackSpeedMult > 0.05 ? stats.attackSpeedMult : 1;
    return Math.max(0.05, base / speed);
  }

  function fireImpact() {
    const { damage, crit } = rollDamage(1);
    gainMomentum(MOMENTUM_GAIN.light);
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
    emit(
      "player-attack",
      attackPayload({
        kind: "light",
        heavy: swingIndex === comboLen - 1,
        stun: 0,
        knockback: swingIndex === comboLen - 1 ? CONFIG.combat.enemyKnockbackHeavy : 0,
        damage,
        crit,
        range: heroRange + stats.range,
        arc: heroArc + stats.arc,
      })
    );
  }

  function fireHeavyImpact() {
    const def = H.heavy || {};
    const mult = Number.isFinite(def.damageMult) ? def.damageMult : 1;
    const { damage, crit } = rollDamage(mult);
    gainMomentum(MOMENTUM_GAIN.heavy);
    emit(
      "player-attack",
      attackPayload({
        kind: "heavy",
        heavy: true,
        stun: Number.isFinite(def.stun) ? def.stun : 0,
        knockback: Number.isFinite(def.knockback) ? def.knockback : 0,
        damage,
        crit,
        range: Number.isFinite(def.radius) ? def.radius : heroRange + stats.range,
        arc: Number.isFinite(def.arc) ? def.arc : heroArc + stats.arc,
      })
    );
    emit("sfx", { name: "heavy", position: position.clone() });
  }

  function fireSuperHit(origin, range, arc, knockback, stun, mult) {
    const { damage, crit } = rollDamage(mult);
    emit(
      "player-attack",
      attackPayload({
        origin,
        kind: "super",
        heavy: false,
        stun,
        knockback,
        damage,
        crit,
        range,
        arc,
      })
    );
  }

  function fireMeteor(def) {
    const mult = Number.isFinite(def.damageMult) ? def.damageMult : 1;
    const radius = Number.isFinite(def.radius) ? def.radius : 5;
    const el = ELEMENTS[H.element];
    const { damage, crit } = rollDamage(mult);
    const point = superAim.clone();
    emit("player-blast", { position: point.clone(), radius, color: el ? el.color : PALETTE.arcane });
    emit(
      "player-attack",
      attackPayload({
        origin: point,
        kind: "super",
        heavy: false,
        stun: Number.isFinite(def.stun) ? def.stun : 0,
        knockback: Number.isFinite(def.knockback) ? def.knockback : 0,
        damage,
        crit,
        range: radius,
        arc: Math.PI * 2,
      })
    );
    emit("sfx", { name: "explode", position: point.clone() });
  }

  function blinkStep() {
    position.x += facing.x * FLURRY_STEP;
    position.z += facing.z * FLURRY_STEP;
    constrain();
  }

  function endSuper() {
    superActive = false;
    superEntryT = 0;
    superT = 0;
    superDef = null;
    superFired = false;
  }

  function startSuper(aim) {
    if (!alive || superActive || !superReadyNow()) return false;
    const def = H.super;
    if (!def) return false;
    if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)) superAim.set(aim.x, 0, aim.z);
    else superAim.copy(position).addScaledVector(facing, METEOR_RANGE);
    superAim.y = 0;
    superActive = true;
    superEntryT = SUPER_ENTRY;
    superT = 0;
    superDef = def;
    superHitT = 0;
    superHits = 0;
    superBlinks = 0;
    superFired = false;
    spendMomentum();
    attacking = false;
    attackKind = "light";
    queuedAttack = false;
    dodging = false;
    dodgeT = 0;
    lungeT = 0;
    const el = ELEMENTS[H.element];
    emit("super-used", { hero: H.id, position: position.clone(), color: el ? el.color : PALETTE.arcane });
    playAnim([def.clip, ...comboClips, "Idle"], {
      loop: def.id === "whirlwind",
      clamp: true,
      fade: 0.12,
    });
    return true;
  }

  function updateSuper(step) {
    if (!superActive) return;
    if (superEntryT > 0) {
      superEntryT -= step;
      if (superEntryT > 0) return;
      superEntryT = 0;
      superT = 0;
      superHitT = 0;
      superHits = 0;
      superBlinks = 0;
      superFired = false;
    }
    superT += step;
    const def = superDef;
    if (!def) {
      endSuper();
      return;
    }
    const mult = Number.isFinite(def.damageMult) ? def.damageMult : 1;
    const radius = Number.isFinite(def.radius) ? def.radius : 2.5;
    const knockback = Number.isFinite(def.knockback) ? def.knockback : 0;
    const stun = Number.isFinite(def.stun) ? def.stun : 0;

    if (def.id === "whirlwind") {
      superHitT -= step;
      if (superHitT <= 0) {
        superHitT = WHIRLWIND_TICK;
        fireSuperHit(position, radius, Math.PI * 2, knockback, stun, mult);
      }
      if (superT >= WHIRLWIND_TIME) endSuper();
      return;
    }
    if (def.id === "flurry") {
      superHitT -= step;
      if (superHitT <= 0) {
        superHitT = FLURRY_GAP;
        fireSuperHit(position, radius, Math.PI * 2, knockback, stun, mult);
        superHits += 1;
        if (superHits >= FLURRY_HITS) {
          superHits = 0;
          superBlinks += 1;
          if (superBlinks >= FLURRY_BLINKS) endSuper();
          else blinkStep();
        }
      }
      return;
    }
    if (def.id === "meteor") {
      if (!superFired && superT >= METEOR_DELAY) {
        superFired = true;
        fireMeteor(def);
      }
      if (superFired && superT >= METEOR_DELAY + METEOR_RECOVER) endSuper();
      return;
    }
    // nova (and any unknown shape): one instant 360 hit, short recovery.
    if (!superFired) {
      superFired = true;
      fireSuperHit(position, radius, Math.PI * 2, knockback, stun, mult);
    }
    if (superT >= NOVA_RECOVER) endSuper();
  }

  function startSwing(i) {
    const idx = clamp(Math.floor(i), 0, comboLen - 1);
    const dur = swingDuration(idx);
    attacking = true;
    attackKind = "light";
    attackElapsed = 0;
    attackDur = dur;
    impactFired = false;
    swingIndex = idx;
    comboIndex = idx + 1;
    comboWindowT = 0;
    queuedAttack = false;
    lungeT = Math.min(0.18, dur * 0.5);
    lungeSpeed = cfg.lunge;
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

  function startHeavy() {
    if (!alive || superActive || dodging || attacking || heavyCdT > 0) return false;
    const def = H.heavy;
    if (!def || !def.clip) return false;
    attacking = true;
    attackKind = "heavy";
    attackElapsed = 0;
    attackDur = HEAVY_DUR;
    impactFired = false;
    swingIndex = -1;
    comboIndex = 0;
    comboWindowT = 0;
    queuedAttack = false;
    const lunge = Number.isFinite(def.lunge) ? def.lunge : 0;
    lungeT = lunge > 0 ? HEAVY_LUNGE_TIME : 0;
    lungeSpeed = lunge > 0 ? lunge / HEAVY_LUNGE_TIME : cfg.lunge;
    if (currentAimYaw !== null) {
      group.rotation.y = currentAimYaw;
      facing.set(Math.sin(group.rotation.y), 0, Math.cos(group.rotation.y));
    }
    emit("sfx", {
      name: "swing-heavy",
      position: position.clone(),
      pitch: 0.9 + Math.random() * 0.1,
      volume: 0.95,
    });
    playAnim([def.clip, ...comboClips, "Idle"], { loop: false, clamp: true, fade: 0.12, fit: attackDur });
    return true;
  }

  function handleAttackInput() {
    if (superActive) return;
    if (attacking) {
      if (attackKind === "light") queuedAttack = true;
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
      if (attackKind === "heavy") fireHeavyImpact();
      else fireImpact();
    }
    if (attackElapsed >= attackDur) {
      attacking = false;
      if (attackKind === "heavy") {
        attackKind = "light";
        heavyCdT = heavyCdTotal;
      } else {
        comboWindowT = cfg.comboWindow;
        if (queuedAttack) {
          queuedAttack = false;
          startSwing(comboIndex < comboLen ? comboIndex : 0);
        }
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
    attackKind = "light";
    queuedAttack = false;
    comboWindowT = 0;
    lungeT = 0;
    emit("player-dodged", {});
    emit("sfx", { name: "dodge", position: position.clone() });
    // clamp: hold the final frame at full weight until updateAnim fades the
    // next clip in. Without it three.js disables the action the moment it ends
    // (weight -> 0) before anything replaces it, and the skeleton blends
    // toward its bind pose for a frame: arms snap to the sides mid-dodge.
    playAnim(dodgeCandidates(dodgeDir), { loop: false, clamp: true, fade: 0.1, fit: cfg.dodgeTime });
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
    attackKind = "light";
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
    const swapBoost = swapSpeedT > 0 && stats.swapSpeedMult > 0 ? stats.swapSpeedMult : 1;
    const maxSpeed = heroMoveSpeed * stats.moveSpeedMult * swapBoost * (sprint && wantsMove ? cfg.sprintMult : 1);
    if (dodging) {
      vx = dodgeDir.x * cfg.dodgeSpeed;
      vz = dodgeDir.z * cfg.dodgeSpeed;
    } else if (lungeT > 0 && grounded) {
      vx = facing.x * lungeSpeed;
      vz = facing.z * lungeSpeed;
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
    if (attacking || dodging || superActive) return;
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
    if (swapIFramesT > 0) {
      swapIFramesT -= step;
      if (swapIFramesT < 0) swapIFramesT = 0;
    }
    if (swapCdT > 0) {
      swapCdT -= step;
      if (swapCdT < 0) swapCdT = 0;
    }
    if (heavyCdT > 0) {
      heavyCdT -= step;
      if (heavyCdT < 0) heavyCdT = 0;
    }
    if (perfectDodgeCdT > 0) {
      perfectDodgeCdT -= step;
      if (perfectDodgeCdT < 0) perfectDodgeCdT = 0;
    }
    if (swapSpeedT > 0) {
      swapSpeedT -= step;
      if (swapSpeedT < 0) swapSpeedT = 0;
    }
    if (stats.perfectT > 0) {
      stats.perfectT -= step;
      if (stats.perfectT < 0) stats.perfectT = 0;
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

    const swapPressed = !!inp.swap && !prevSwap;
    const heavyPressed = !!inp.heavy && !prevHeavy;
    if (inp.super) superBufferT = SUPER_BUFFER;
    prevSwap = !!inp.swap;
    prevSuper = !!inp.super;
    prevHeavy = !!inp.heavy;

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

    if (swapPressed) swap();
    if (superBufferT > 0) {
      // A super pressed while the bar is still filling should fire the moment
      // it arms, the way a held input reads in game.
      superBufferT -= step;
      if (superReadyNow() && !superActive && startSuper(aim)) superBufferT = 0;
      else if (superBufferT < 0) superBufferT = 0;
    }
    if (heavyPressed) startHeavy();

    if (inp.dodge && grounded && !dodging && dodgeCdT <= 0 && !superActive) {
      const heavyWindup = attacking && attackKind === "heavy" && !impactFired;
      if (!heavyWindup) startDodge(ix, iz, wantsMove);
    }
    if (inp.jump && grounded && !dodging && !superActive) startJump();
    if (inp.attack) handleAttackInput();

    updateAttack(step);
    updateSuper(step);
    updateMovement(step, ix, iz, wantsMove, !!inp.sprint);
    updateJump(step);
    updateDodge(step);
    updateProjectiles(step);
    tickTimers(step);
    updateAnim(!!inp.sprint);

    if (mixer) mixer.update(step);
  }

  function perfectDodge() {
    if (perfectDodgeCdT > 0) return;
    perfectDodgeCdT = PERFECT_DODGE_CD;
    stats.perfectT = Number.isFinite(cfg.perfectWindow) ? cfg.perfectWindow : 3;
    emit("perfect-dodge", { position: position.clone() });
    emit("sfx", { name: "dodge", position: position.clone(), pitch: 1.3 });
    gainMomentum(MOMENTUM_GAIN.perfect);
  }

  function damage(amount, opts) {
    if (!alive) return false;
    if (superEntryT > 0) return false;
    const dmg = Number(amount);
    if (!Number.isFinite(dmg) || dmg <= 0) return false;
    if (dodging || dodgeIFramesT > 0) {
      perfectDodge();
      return false;
    }
    if (swapIFramesT > 0) return false;
    if (hurtInvulnT > 0) return false;

    const entry = party[activeIdx];
    entry.hp = Math.max(0, entry.hp - dmg);
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

    emit("player-hurt", { amount: dmg, hp: entry.hp });
    emit("sfx", { name: "hurt", position: position.clone() });
    if (entry.hp <= 0) {
      const other = 1 - activeIdx;
        if (party[other].hp > 0) swapTo(other, true);
      else die();
    }
    return true;
  }

  function die() {
    if (!alive) return;
    alive = false;
    dodging = false;
    attacking = false;
    attackKind = "light";
    superActive = false;
    superEntryT = 0;
    superDef = null;
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

  // `forced` skips the liveness/cooldown guards: it is used by the auto-swap
  // that fires when the active hero falls, which must never be blocked by a
  // swap cooldown the player happened to be on.
  function swapTo(idx, forced) {
    const to = party[idx];
    if (!to || idx === activeIdx || to.hp <= 0) return false;
    if (!forced) {
      if (!alive || superActive) return false;
      if (swapCdT > 0) return false;
    }
    const from = party[activeIdx];
    useHero(idx);
    superActive = false;
    superEntryT = 0;
    superDef = null;
    attacking = false;
    attackKind = "light";
    queuedAttack = false;
    dodging = false;
    dodgeT = 0;
    lungeT = 0;
    comboIndex = 0;
    comboWindowT = 0;
    swapIFramesT = Math.max(swapIFramesT, Number.isFinite(cfg.swapIFrames) ? cfg.swapIFrames : 0.25);
    const cdMult = stats.swapCooldownMult > 0 ? stats.swapCooldownMult : 1;
    swapCdTotal = Math.max(0.05, (Number.isFinite(cfg.swapCooldown) ? cfg.swapCooldown : 1.5) * cdMult);
    swapCdT = swapCdTotal;
    if (stats.swapSpeedTime > 0) swapSpeedT = stats.swapSpeedTime;
    const el = ELEMENTS[to.def.element];
    emit("swap", {
      from: from.def.id,
      to: to.def.id,
      element: to.def.element,
      color: el ? el.color : PALETTE.arcane,
    });
    emit("sfx", { name: "swap", position: position.clone() });
    return true;
  }

  function swap() {
    if (!alive || superActive) return false;
    if (swapCdT > 0) return false;
    return swapTo(1 - activeIdx);
  }

  function heal(n) {
    if (!alive) return 0;
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return 0;
    const entry = party[activeIdx];
    const before = entry.hp;
    entry.hp = Math.min(entry.maxHp, entry.hp + v);
    return entry.hp - before;
  }

  function addMaxHp(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v === 0) return party[activeIdx].maxHp;
    for (const entry of party) {
      entry.maxHp = Math.max(1, entry.maxHp + v);
      if (entry.hp > entry.maxHp) entry.hp = entry.maxHp;
    }
    return party[activeIdx].maxHp;
  }

  function resetStats() {
    Object.assign(stats, baseStats());
  }

  function respawn(pos) {
    alive = true;
    resetStats();
    for (const entry of party) {
      entry.maxHp = hpOf(entry.def);
      entry.hp = entry.maxHp;
    }
    momentum = 0;
    emitMomentum();
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
    attackKind = "light";
    queuedAttack = false;
    swingIndex = -1;
    comboIndex = 0;
    comboWindowT = 0;
    lungeT = 0;
    hurtInvulnT = 0;
    jumpPhase = "none";
    jumpPhaseT = 0;
    swapCdT = 0;
    swapIFramesT = 0;
    swapSpeedT = 0;
    heavyCdT = 0;
    perfectDodgeCdT = 0;
    superActive = false;
    superEntryT = 0;
    superDef = null;
    clearProjectiles();
    useHero(0);
    group.rotation.y = 0;
    facing.set(0, 0, 1);
  }

  if (events && typeof events.on === "function") {
    events.on("enemy-died", () => {
      gainMomentum(MOMENTUM_GAIN.kill);
    });
    events.on("reaction", () => {
      gainMomentum(MOMENTUM_GAIN.reaction);
    });
  }

  useHero(0);
  if (party[1].def && party[1].def.glb) {
    // Warm the partner's GLTF so the first swap attaches without a fetch.
    loadCleanedGltf(loader, party[1].def.glb, party[1].def.keep).catch(() => {});
  }

  return {
    group,
    position,
    get hp() {
      return party[activeIdx].hp;
    },
    get maxHp() {
      return party[activeIdx].maxHp;
    },
    get alive() {
      return alive;
    },
    stats,
    get hero() {
      return H;
    },
    get activeHero() {
      return H;
    },
    get party() {
      return party;
    },
    get partyAlive() {
      return (party[0].hp > 0 ? 1 : 0) + (party[1].hp > 0 ? 1 : 0);
    },
    get activeIndex() {
      return activeIdx;
    },
    get momentum() {
      return momentum;
    },
    get superReady() {
      return superReadyNow();
    },
    get swapCooldownFrac() {
      return swapCdTotal > 0 ? clamp(swapCdT / swapCdTotal, 0, 1) : 0;
    },
    radius: Number.isFinite(cfg.radius) ? cfg.radius : 0.55,
    update,
    damage,
    heal,
    addMaxHp,
    respawn,
    swap,
    swapTo,
    get dodgeCooldownFrac() {
      return dodgeCdTotal > 0 ? clamp(dodgeCdT / dodgeCdTotal, 0, 1) : 0;
    },
    get isDodging() {
      return dodging;
    },
  };
}
