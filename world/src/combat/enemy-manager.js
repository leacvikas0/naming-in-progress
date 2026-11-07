// ============================================================================
// world/src/combat/enemy-manager.js
//
// Stage 5 / Wave 2B Pooled Enemy Manager:
// - Pre-allocates a fixed pool of 6 KayKit Skeleton character instances at boot:
//   2 Skeleton_Warrior, 1 Skeleton_Minion, 1 Skeleton_Rogue, 1 Skeleton_Mage,
//   and 1 Boss Sovereign (1.42x scale with obsidian-crimson-gold cellOverrides).
// - Enforces Max 5 Concurrent Visible Enemies (<= 10 draw calls): inactive,
//   queued, or dead pool slots stay at `slot.char.group.visible = false` (0 draws).
// - Implements 3-Attacker Token AI, standoff strafe-orbiting (3.2..4.5m),
//   Ice Sword slow (movement, attack speed & outgoing damage), Fire Sword
//   persistent burn DoT, knockback/launch physics with `walkableHeightAt` &
//   `resolveCollisions` (plus Shrine pedestal/planters), 70ms local
//   animation-mixer hitstop, and deterministic `setFrozenForShot()`.
// - Keeps `telegraphRingMesh.visible = false` (zero red under-enemy indicator clutter).
// ============================================================================

import * as THREE from 'three';
import {
  createCharactersKit,
  TARGET_CHARACTER_HEIGHT,
} from '../../assets/characters/index.js';
import {
  clamp,
  shortestAngleDiff,
  MAX_CONCURRENT_ENEMIES,
  MAX_ATTACK_TOKENS,
  ENEMY_ARCHETYPES,
  ACT_DEFINITIONS,
  resolveShrineObstacles,
  allocateAttackTokens,
  applyHitAndResolveDetonation,
} from './combat-balance.js';

export const BOSS_SOVEREIGN_CELL_OVERRIDES = {
  r0c3: [42, 30, 52],
  r1c0: [204, 24, 44],
  r1c2: [248, 196, 68],
};

export const ARCHITECTURAL_SHOT_SKELETON_POSES = {
  'day-plaza': {
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'day-mill-pier': {
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'day-arena-wisteria': {
    skeletonWarrior: { x: 56.5, z: -8.2, rotY: -1.35, clip: 'combo2', time: 0.38 },
    skeletonMage: { x: 60.5, z: 0.8, rotY: -1.55, clip: 'cast_shoot', time: 0.35 },
  },
  'day-shrine-arch': {
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'evening-sunset-vista': {
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'night-moon-shrine': {
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'night-plaza-lanterns': {
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'aerial-masterplan': {
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
};

function enableCharacterFrustumCulling(charInstance, sphereRadius = 3.4) {
  if (!charInstance || !charInstance.modelRoot) return;
  const localSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), sphereRadius);
  charInstance.modelRoot.traverse((obj) => {
    if (obj.isMesh || obj.isSkinnedMesh) {
      if (obj.geometry) {
        obj.geometry.boundingSphere = localSphere.clone();
      }
      obj.boundingSphere = localSphere.clone();
      obj.frustumCulled = true;
    }
  });
}

export async function createEnemyManager({
  scene,
  kit = null,
  walkableHeightAt = () => 0,
  resolveCollisions = (x, z) => ({ x, z, wrapped: false }),
  onEnemyDamaged = null,
  onEnemyKilled = null,
  onDetonation = null,
  onBossAegisChanged = null,
  onPlayerHit = null,
} = {}) {
  const charKit = kit || createCharactersKit();
  await charKit.loadAnimationPacks();

  const rootGroup = new THREE.Group();
  rootGroup.name = 'pooledEnemyManagerGroup';
  if (scene) {
    scene.add(rootGroup);
  }

  // Red under-enemy telegraph rings are permanently hidden (Wave 2B anti-slop rule)
  const telegraphRingMesh = new THREE.Group();
  telegraphRingMesh.name = 'enemyTelegraphRingMeshHidden';
  telegraphRingMesh.visible = false;
  telegraphRingMesh.count = 0;

  // Pre-allocate the fixed 6-slot Skeleton + Boss Sovereign pool in parallel
  const [
    skelWarrior0,
    skelWarrior1,
    skelMinion,
    skelRogue,
    skelMage,
    bossSovereign,
  ] = await Promise.all([
    charKit.createCharacter('Skeleton_Warrior', { initialClip: 'idle' }),
    charKit.createCharacter('Skeleton_Warrior', { initialClip: 'idle' }),
    charKit.createCharacter('Skeleton_Minion', { initialClip: 'idle' }),
    charKit.createCharacter('Skeleton_Rogue', { initialClip: 'idle' }),
    charKit.createCharacter('Skeleton_Mage', { initialClip: 'idle' }),
    charKit.createCharacter('Skeleton_Warrior', {
      targetHeight: TARGET_CHARACTER_HEIGHT * 1.42,
      outlineThickness: 0.015,
      cellOverrides: BOSS_SOVEREIGN_CELL_OVERRIDES,
      initialClip: 'idle',
    }),
  ]);

  const rawPoolSpec = [
    { slotIndex: 0, poolRole: 'Skeleton_Warrior', char: skelWarrior0, isBossSlot: false },
    { slotIndex: 1, poolRole: 'Skeleton_Warrior', char: skelWarrior1, isBossSlot: false },
    { slotIndex: 2, poolRole: 'Skeleton_Minion', char: skelMinion, isBossSlot: false },
    { slotIndex: 3, poolRole: 'Skeleton_Rogue', char: skelRogue, isBossSlot: false },
    { slotIndex: 4, poolRole: 'Skeleton_Mage', char: skelMage, isBossSlot: false },
    { slotIndex: 5, poolRole: 'Boss_Sovereign', char: bossSovereign, isBossSlot: true },
  ];

  const poolSlots = rawPoolSpec.map((item) => {
    enableCharacterFrustumCulling(item.char, item.isBossSlot ? 4.8 : 3.4);
    item.char.group.visible = false;
    rootGroup.add(item.char.group);
    return {
      slotIndex: item.slotIndex,
      poolRole: item.poolRole,
      isBossSlot: item.isBossSlot,
      char: item.char,
      busy: false,
      enemy: null,
    };
  });

  let activeEnemies = [];
  let spawnQueue = [];
  let activeProjectiles = [];
  let nextInstanceSeq = 1;
  let currentActId = 'act1_arena';
  let frozenShotId = null;
  const arenaCenterVec = new THREE.Vector3(
    ACT_DEFINITIONS.act1_arena.center.x,
    ACT_DEFINITIONS.act1_arena.center.y,
    ACT_DEFINITIONS.act1_arena.center.z
  );

  // Pooled 3D Dodgeable Spell Bolts for Ranged Enemies (`Skeleton_Mage`, max 8 instances, 0 draws when idle)
  const MAX_ENEMY_PROJECTILES = 8;
  const projGeo = new THREE.OctahedronGeometry(0.28, 1);
  const projMat = new THREE.MeshBasicMaterial({
    color: 0xd946ef,
  });
  const enemyProjectileMesh = new THREE.InstancedMesh(
    projGeo,
    projMat,
    MAX_ENEMY_PROJECTILES
  );
  enemyProjectileMesh.name = 'enemySpellProjectileInstancedMesh';
  enemyProjectileMesh.frustumCulled = false;
  enemyProjectileMesh.visible = false;
  enemyProjectileMesh.count = 0;
  rootGroup.add(enemyProjectileMesh);
  const _projDummy = new THREE.Object3D();

  function spawnEnemyProjectile({
    owner = null,
    origin = { x: 0, y: 1.25, z: 0 },
    targetPos = { x: 0, y: 1.05, z: 5.0 },
    speed = 11.5,
    dmg = 18,
    radius = 0.42,
    targetHeroId = 'Knight',
  } = {}) {
    if (activeProjectiles.length >= MAX_ENEMY_PROJECTILES) {
      activeProjectiles.shift();
    }
    const dx = (targetPos.x ?? 0) - (origin.x ?? 0);
    const dy = (targetPos.y ?? 1.05) - (origin.y ?? 1.25);
    const dz = (targetPos.z ?? 0) - (origin.z ?? 0);
    const flatDist = Math.hypot(dx, dz) || 1;
    const travelTime = Math.max(0.18, flatDist / Math.max(1.0, speed));
    const vx = (dx / flatDist) * speed;
    const vz = (dz / flatDist) * speed;
    const vy = clamp(dy / travelTime, -6.0, 6.0);
    const bolt = {
      id: `enemy_bolt_${nextInstanceSeq++}`,
      owner,
      x: origin.x ?? 0,
      y: origin.y ?? 1.25,
      z: origin.z ?? 0,
      vx,
      vy,
      vz,
      speed,
      dmg,
      radius,
      targetHeroId,
      age: 0,
      maxAge: 2.2,
    };
    activeProjectiles.push(bolt);
    return bolt;
  }

  function getVisibleCount() {
    let count = 0;
    for (let i = 0; i < poolSlots.length; i++) {
      if (poolSlots[i].char.group.visible) count++;
    }
    return count;
  }

  function acquireSlot(archetypeSpec) {
    const activeVisible = poolSlots.filter((s) => s.busy && s.char.group.visible).length;
    if (activeVisible >= MAX_CONCURRENT_ENEMIES) return null;

    if (archetypeSpec.isBoss) {
      const bossSlot = poolSlots[5];
      if (!bossSlot.busy) return bossSlot;
    }

    for (let i = 0; i < 5; i++) {
      const s = poolSlots[i];
      if (!s.busy && s.poolRole === archetypeSpec.poolRole) {
        return s;
      }
    }

    for (let i = 0; i < 5; i++) {
      if (!poolSlots[i].busy) {
        return poolSlots[i];
      }
    }

    return null;
  }

  function applyEnemySpatialConstraints(x, z, radius = 0.55) {
    const col = resolveCollisions(x, z, radius);
    let nx = col.x;
    let nz = col.z;

    if (currentActId === 'act1_arena') {
      const cx = ACT_DEFINITIONS.act1_arena.center.x;
      const cz = ACT_DEFINITIONS.act1_arena.center.z;
      const maxR = ACT_DEFINITIONS.act1_arena.fenceRadius - 1.1;
      const dx = nx - cx;
      const dz = nz - cz;
      const d = Math.hypot(dx, dz);
      if (d > maxR && d > 1e-5) {
        nx = cx + (dx / d) * maxR;
        nz = cz + (dz / d) * maxR;
      }
    } else if (currentActId === 'act2_plaza') {
      const minWellR = 2.35 + radius;
      const dWell = Math.hypot(nx, nz);
      if (dWell < minWellR) {
        if (dWell > 1e-5) {
          nx = (nx / dWell) * minWellR;
          nz = (nz / dWell) * minWellR;
        } else {
          nz = minWellR;
        }
      }
      const plazaFenceAngles = [0.72, 2.38, -2.35, -0.74];
      const rFence = 6.05;
      const hx = 1.38;
      const hz = 0.36;
      for (let i = 0; i < plazaFenceAngles.length; i++) {
        const ang = plazaFenceAngles[i];
        const fx = Math.cos(ang) * rFence;
        const fz = Math.sin(ang) * rFence;
        const rotY = -ang + Math.PI * 0.5;
        const cos = Math.cos(-rotY);
        const sin = Math.sin(-rotY);
        const lx = (nx - fx) * cos - (nz - fz) * sin;
        const lz = (nx - fx) * sin + (nz - fz) * cos;
        const cx = clamp(lx, -hx, hx);
        const cz = clamp(lz, -hz, hz);
        const dx = lx - cx;
        const dz = lz - cz;
        const d = Math.hypot(dx, dz);
        if (d < radius) {
          let pushX = 0;
          let pushZ = 0;
          if (d > 1e-5) {
            pushX = (dx / d) * (radius - d);
            pushZ = (dz / d) * (radius - d);
          } else {
            pushZ = (lz >= 0 ? 1 : -1) * (hz + radius);
          }
          const wCos = Math.cos(rotY);
          const wSin = Math.sin(rotY);
          const nlx = lx + pushX;
          const nlz = lz + pushZ;
          nx = fx + nlx * wCos - nlz * wSin;
          nz = fz + nlx * wSin + nlz * wCos;
        }
      }
    } else if (currentActId === 'act3_shrine' || z < -68.0) {
      const shr = resolveShrineObstacles(nx, nz, radius, currentActId === 'act3_shrine');
      nx = shr.x;
      nz = shr.z;
    }

    return { x: nx, z: nz };
  }

  function spawnImmediateFromSpec(spawnSpec) {
    const arch = ENEMY_ARCHETYPES[spawnSpec.archetype] || ENEMY_ARCHETYPES.warrior;
    const slot = acquireSlot(arch);
    if (!slot) {
      spawnQueue.push(spawnSpec);
      return null;
    }

    const radius = arch.isBoss ? 0.85 : arch.isElite ? 0.65 : 0.52;
    const clampedPos = applyEnemySpatialConstraints(spawnSpec.x, spawnSpec.z, radius);
    const groundY = walkableHeightAt(clampedPos.x, clampedPos.z);

    const initialY = arch.isFlying ? groundY + (arch.hoverHeight ?? 2.35) : groundY;
    const scale = slot.isBossSlot ? 1.0 : arch.scale || 1.0;
    slot.char.group.scale.setScalar(scale);
    slot.char.group.position.set(clampedPos.x, initialY, clampedPos.z);
    const initialYaw = spawnSpec.rotY ?? Math.atan2(-clampedPos.x, -clampedPos.z);
    slot.char.group.rotation.y = initialYaw;
    slot.char.group.visible = !frozenShotId;
    slot.char.mixer.timeScale = 1.0;
    slot.char.play('spawn', { loop: false, fade: 0.08, timeScale: 1.35, force: true });

    const orbitSign = (nextInstanceSeq % 2 === 0 ? 1 : -1) * (0.75 + (nextInstanceSeq % 3) * 0.18);

    const enemy = {
      instanceId: spawnSpec.instanceId || `enemy_${nextInstanceSeq++}`,
      archetype: arch.id,
      name: arch.name,
      slotIndex: slot.slotIndex,
      slot,
      char: slot.char,
      group: slot.char.group,
      hp: arch.maxHp,
      maxHp: arch.maxHp,
      dmg: arch.dmg,
      speed: arch.speed,
      attackRange: arch.attackRange,
      windupDuration: arch.windupDuration,
      attackCooldown: arch.attackCooldown,
      telegraphRadius: arch.telegraphRadius,
      radius,
      isRanged: Boolean(arch.isRanged),
      isStationary: Boolean(arch.isStationary),
      isFlying: Boolean(arch.isFlying),
      hoverHeight: arch.hoverHeight ?? 2.35,
      swoopHeight: arch.swoopHeight ?? 1.2,
      preferredTarget: arch.preferredTarget || null,
      batSummonCooldown: arch.batSummonCooldown || 0,
      maxActiveBats: arch.maxActiveBats || 0,
      batSummonTimer: spawnSpec.initialBatCooldown ?? 0,
      isElite: Boolean(arch.isElite),
      isBoss: Boolean(arch.isBoss),
      aegisTriggerHpRatio: arch.aegisTriggerHpRatio ?? 0.5,
      aegisLayersMax: arch.aegisLayersMax ?? 2,
      aegisDmgReduction: arch.aegisDmgReduction ?? 0.85,
      aegisTriggered: Boolean(arch.isBoss),
      aegisActive: Boolean(arch.isBoss),
      aegisLayers: arch.isBoss ? (arch.aegisLayersMax ?? 2) : 0,
      x: clampedPos.x,
      y: initialY,
      z: clampedPos.z,
      yaw: initialYaw,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: true,
      dead: false,
      xpAwarded: false,
      deathTimer: 0,
      active: true,
      mark: null,
      markTimer: 0,
      stunTimer: 0,
      knockdownTimer: 0,
      prayerAirborneSlowMo: false,
      hitstopTimer: 0,
      slowTimer: 0,
      slowFactor: 0,
      iceSlowTimer: 0,
      iceSlowFactor: 0,
      burnTimer: 0,
      burnDps: 0,
      spawnAnimTimer: 0.48,
      attackAnimTimer: 0,
      aiState: 'orbit',
      windupTimer: 0,
      telegraphProgress: 0,
      telegraphX: clampedPos.x,
      telegraphY: groundY + 0.04,
      telegraphZ: clampedPos.z,
      cooldownTimer: 0.55 + (slot.slotIndex % 3) * 0.25,
      hasAttackToken: false,
      orbitSpeed: orbitSign,
      standoffDist: arch.isRanged
        ? 6.6 + (slot.slotIndex % 2) * 1.1
        : 3.3 + (slot.slotIndex % 3) * 0.55,
      distToTarget: 10.0,
      targetHeroId: arch.preferredTarget || 'Knight',
    };

    slot.busy = true;
    slot.enemy = enemy;
    activeEnemies.push(enemy);
    return enemy;
  }

  function releaseSlot(enemy) {
    if (!enemy) return;
    const slot = poolSlots[enemy.slotIndex];
    if (slot) {
      slot.busy = false;
      slot.enemy = null;
      slot.char.group.visible = false;
      slot.char.group.scale.setScalar(1.0);
      slot.char.mixer.timeScale = 1.0;
    }
    enemy.active = false;
    activeEnemies = activeEnemies.filter((e) => e !== enemy);

    while (spawnQueue.length > 0 && activeEnemies.length < MAX_CONCURRENT_ENEMIES) {
      const nextSpec = spawnQueue.shift();
      spawnImmediateFromSpec(nextSpec);
    }
  }

  let groveTreeVanquished = false;

  function clearAllEnemies() {
    spawnQueue = [];
    activeEnemies = [];
    activeProjectiles = [];
    enemyProjectileMesh.count = 0;
    enemyProjectileMesh.visible = false;
    for (let i = 0; i < poolSlots.length; i++) {
      const s = poolSlots[i];
      s.busy = false;
      s.enemy = null;
      s.char.group.visible = false;
      s.char.group.scale.setScalar(1.0);
      s.char.mixer.timeScale = 1.0;
    }
  }

  function spawnWave(waveSpec, actId = currentActId) {
    currentActId = actId || currentActId;
    clearAllEnemies();
    if (!waveSpec || !Array.isArray(waveSpec.spawns)) return [];

    for (let i = 0; i < waveSpec.spawns.length; i++) {
      spawnImmediateFromSpec(waveSpec.spawns[i]);
    }
    allocateAttackTokens(activeEnemies, MAX_ATTACK_TOKENS);
    return activeEnemies;
  }

  function playEnemyLocomotion(enemy, clipKey) {
    if (enemy.dead || enemy.spawnAnimTimer > 0 || enemy.attackAnimTimer > 0) return;
    if (enemy.char.anim.currentKey === clipKey) return;
    const slowMult = 1.0 - clamp(enemy.iceSlowFactor || 0, 0, 0.75);
    enemy.char.play(clipKey, {
      loop: true,
      fade: 0.15,
      timeScale: (enemy.isBoss ? 0.92 : 1.0) * slowMult,
    });
  }

  function markEnemyDeadAndNotify(e, result = {}) {
    if (e.deathTimer > 0) return;
    e.dead = true;
    e.deathTimer = 0.58;
    e.hasAttackToken = false;
    e.aiState = 'dead';
    e.windupTimer = 0;
    e.telegraphProgress = 0;
    if (e.archetype === 'demon_tree') {
      groveTreeVanquished = true;
    }
    e.char.play('downed', { loop: false, fade: 0.08, force: true });
    if (onEnemyKilled && !e.xpAwarded) {
      e.xpAwarded = true;
      onEnemyKilled(e, result);
    }
  }

  function applyHitToEnemy(enemy, hitSpec = {}) {
    if (!enemy || enemy.dead || !enemy.active) return null;

    const result = applyHitAndResolveDetonation(enemy, hitSpec, activeEnemies);

    const hitstopSec = result.detonation ? 0.07 : 0.035;
    enemy.hitstopTimer = Math.max(enemy.hitstopTimer, hitstopSec);
    enemy.char.mixer.timeScale = 0.05;

    if (result.detonation) {
      for (let i = 0; i < activeEnemies.length; i++) {
        const other = activeEnemies[i];
        if (!other.dead && other.active) {
          const d = Math.hypot(other.x - enemy.x, other.z - enemy.z);
          if (d <= result.detonation.radius) {
            other.hitstopTimer = Math.max(other.hitstopTimer, 0.07);
            other.char.mixer.timeScale = 0.05;
          }
        }
      }
      if (onDetonation) {
        onDetonation(result.detonation, enemy);
      }
    }

    if (result.aegisRaised || result.aegisBroken) {
      if (onBossAegisChanged) {
        onBossAegisChanged({
          enemy,
          aegisActive: enemy.aegisActive,
          aegisLayers: enemy.aegisLayers,
          aegisRaised: result.aegisRaised,
          aegisBroken: result.aegisBroken,
        });
      }
    }

    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if ((e.dead || e.hp <= 0) && e.deathTimer <= 0) {
        markEnemyDeadAndNotify(e, result);
      }
    }

    if (!enemy.dead && enemy.aiState !== 'windup' && result.damageDealt > 0) {
      enemy.attackAnimTimer = 0.32;
      enemy.char.play('hit_A', { loop: false, fade: 0.06, force: true });
    }

    if (onEnemyDamaged && result.damageDealt > 0) {
      onEnemyDamaged(enemy, result);
    }

    return result;
  }

  function applyAreaOrLineHit({
    origin,
    direction = null,
    range = 4.0,
    width = 2.6,
    radius = 0,
    coneHalfAngle = (85 * Math.PI) / 180,
    maxHeightDiff = 3.2,
    maxTargets = 99,
    excludeEnemies = null,
    hitSpec = {},
  } = {}) {
    if (!origin) return [];
    const hits = [];
    const candidates = [];

    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (!e || e.dead || e.hp <= 0 || !e.active) continue;
      if (excludeEnemies && excludeEnemies.has(e)) continue;
      if (
        origin.y !== undefined &&
        e.y !== undefined &&
        Math.abs(e.y - origin.y) > maxHeightDiff
      ) {
        continue;
      }
      const dx = e.x - origin.x;
      const dz = e.z - origin.z;
      const dist = Math.hypot(dx, dz);

      if (radius > 0) {
        if (dist <= radius + e.radius) {
          candidates.push({ enemy: e, dist });
        }
      } else if (direction && (Math.abs(direction.x) > 1e-4 || Math.abs(direction.z) > 1e-4)) {
        const dirLen = Math.hypot(direction.x, direction.z) || 1;
        const nx = direction.x / dirLen;
        const nz = direction.z / dirLen;
        const along = dx * nx + dz * nz;
        const perp = Math.abs(dx * -nz + dz * nx);
        if (along >= -0.8 && along <= range + e.radius && perp <= width * 0.5 + e.radius) {
          candidates.push({ enemy: e, dist: Math.max(0, along) });
        }
      } else {
        if (dist <= range + e.radius) {
          if (hitSpec.yaw !== undefined) {
            const ang = Math.atan2(dx, dz);
            if (Math.abs(shortestAngleDiff(ang, hitSpec.yaw)) <= coneHalfAngle) {
              candidates.push({ enemy: e, dist });
            }
          } else {
            candidates.push({ enemy: e, dist });
          }
        }
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const count = Math.min(candidates.length, maxTargets);
    for (let i = 0; i < count; i++) {
      const res = applyHitToEnemy(candidates[i].enemy, {
        ...hitSpec,
        attackerPos: hitSpec.attackerPos || origin,
      });
      if (res) hits.push({ enemy: candidates[i].enemy, result: res });
    }
    return hits;
  }

  function checkPerfectDodge(heroState) {
    if (!heroState) return { triggered: false };
    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (!e || e.dead || e.aiState !== 'windup') continue;
      const remaining = e.windupDuration - e.windupTimer;
      const d = Math.hypot(heroState.x - e.telegraphX, heroState.z - e.telegraphZ);
      if (remaining <= 0.28 && remaining >= -0.05 && d <= e.telegraphRadius + 1.8) {
        e.slowTimer = 0.6;
        e.char.mixer.timeScale = 0.3;
        e.aiState = 'orbit';
        e.windupTimer = 0;
        e.telegraphProgress = 0;
        e.cooldownTimer = e.attackCooldown * 0.85;
        return {
          triggered: true,
          enemy: e,
          resonanceGain: 20,
        };
      }
    }
    return { triggered: false };
  }

  function update(dt, heroStates = {}, camera = null) {
    telegraphRingMesh.visible = false;
    telegraphRingMesh.count = 0;

    if (frozenShotId) {
      enemyProjectileMesh.visible = false;
      enemyProjectileMesh.count = 0;
      if (camera && ARCHITECTURAL_SHOT_SKELETON_POSES[frozenShotId]) {
        const camDistSq = camera.position.distanceToSquared(arenaCenterVec);
        const show = camDistSq <= 92 * 92;
        poolSlots[0].char.group.visible = show;
        poolSlots[4].char.group.visible = show;
      }
      return;
    }

    const knight = heroStates.Knight;
    const mage = heroStates.Mage;

    // 0. Advance 3D Dodgeable Ranged Enemy Projectiles (`Skeleton_Mage` bolts)
    if (activeProjectiles.length > 0) {
      const remainingBolts = [];
      for (let i = 0; i < activeProjectiles.length; i++) {
        const p = activeProjectiles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.age += dt;

        const floorY = walkableHeightAt(p.x, p.z);
        if (p.age >= p.maxAge || p.y <= floorY + 0.12) {
          continue;
        }

        // Physical Knight Shield Block Interception along projectile path
        let consumed = false;
        if (knight && !knight.downed && knight.shieldBlocking) {
          const dk = Math.hypot(p.x - knight.x, p.z - knight.z);
          if (dk <= 1.25) {
            const incomingYaw = Math.atan2(-p.vx, -p.vz);
            const shieldArcOk =
              knight.yaw === undefined ||
              Math.abs(shortestAngleDiff(incomingYaw, knight.yaw)) <= (105 * Math.PI) / 180;
            if (shieldArcOk) {
              if (onPlayerHit) {
                onPlayerHit(knight, p.owner, p.dmg, {
                  projectile: true,
                  interceptedByKnight: true,
                });
              }
              consumed = true;
            }
          }
        }

        if (!consumed) {
          const heroCandidates = [knight, mage].filter(
            (h) => h && !h.downed && (h.iframeTimer || 0) <= 0
          );
          for (let hIdx = 0; hIdx < heroCandidates.length; hIdx++) {
            const h = heroCandidates[hIdx];
            const dh = Math.hypot(p.x - h.x, p.z - h.z);
            const hY = h.y ?? walkableHeightAt(h.x, h.z);
            if (dh <= (h.radius || 0.48) + p.radius && Math.abs(p.y - (hY + 1.0)) <= 1.35) {
              if (onPlayerHit) {
                onPlayerHit(h, p.owner, p.dmg, { projectile: true });
              }
              consumed = true;
              break;
            }
          }
        }

        if (!consumed) {
          remainingBolts.push(p);
        }
      }
      activeProjectiles = remainingBolts;

      enemyProjectileMesh.count = activeProjectiles.length;
      enemyProjectileMesh.visible = activeProjectiles.length > 0;
      for (let i = 0; i < activeProjectiles.length; i++) {
        const p = activeProjectiles[i];
        _projDummy.position.set(p.x, p.y, p.z);
        _projDummy.rotation.set(p.age * 7.5, p.age * 9.2, 0);
        _projDummy.scale.setScalar(1.0);
        _projDummy.updateMatrix();
        enemyProjectileMesh.setMatrixAt(i, _projDummy.matrix);
      }
      if (activeProjectiles.length > 0) {
        enemyProjectileMesh.instanceMatrix.needsUpdate = true;
      }
    } else {
      enemyProjectileMesh.count = 0;
      enemyProjectileMesh.visible = false;
    }

    const toRelease = [];
    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (!e || !e.active) continue;

      if (e.dead) {
        e.deathTimer -= dt;
        e.char.update(dt);
        if (e.deathTimer <= 0) {
          toRelease.push(e);
        }
        continue;
      }

      // Tick persistent Fire Sword Burn DoT
      if (e.burnTimer > 0 && e.burnDps > 0) {
        const tickDt = Math.min(dt, e.burnTimer);
        e.burnTimer = Math.max(0, e.burnTimer - dt);
        const burnDmg = e.burnDps * tickDt;
        e.hp = Math.max(0, Number((e.hp - burnDmg).toFixed(2)));
        if (e.hp <= 0) {
          markEnemyDeadAndNotify(e, { killed: true, source: 'fire_burn', damageDealt: burnDmg });
          continue;
        }
      }

      // Tick Knight Ice Sword Slow
      if (e.iceSlowTimer > 0) {
        e.iceSlowTimer = Math.max(0, e.iceSlowTimer - dt);
        if (e.iceSlowTimer <= 0) {
          e.iceSlowFactor = 0;
          e.slowFactor = 0;
        }
      }

      const iceTimeMult = 1.0 - clamp(e.iceSlowFactor || 0, 0, 0.75);

      if (e.prayerAirborneSlowMo && !e.grounded) {
        if (e.slowTimer > 0) {
          e.slowTimer = Math.max(0, e.slowTimer - dt);
        }
        e.char.mixer.timeScale = 0.15;
      } else if (e.hitstopTimer > 0) {
        e.hitstopTimer = Math.max(0, e.hitstopTimer - dt);
        if (e.hitstopTimer <= 0) {
          e.char.mixer.timeScale =
            e.slowTimer > 0 && e.slowFactor !== 0.85
              ? Math.min(0.3, iceTimeMult)
              : iceTimeMult;
        }
      } else if (e.slowTimer > 0) {
        e.slowTimer = Math.max(0, e.slowTimer - dt);
        if (e.slowTimer <= 0 && !e.iceSlowTimer) {
          e.slowFactor = 0;
        }
        e.char.mixer.timeScale =
          e.slowTimer > 0 && e.slowFactor !== 0.85
            ? Math.min(0.3, iceTimeMult)
            : iceTimeMult;
      } else {
        e.char.mixer.timeScale = iceTimeMult;
      }

      if (e.spawnAnimTimer > 0) e.spawnAnimTimer = Math.max(0, e.spawnAnimTimer - dt);
      if (e.attackAnimTimer > 0) e.attackAnimTimer = Math.max(0, e.attackAnimTimer - dt);
      if (e.markTimer > 0) {
        e.markTimer = Math.max(0, e.markTimer - dt);
        if (e.markTimer <= 0) e.mark = null;
      }
      if (e.stunTimer > 0) {
        e.stunTimer = Math.max(0, e.stunTimer - dt);
      }
      if (e.knockdownTimer > 0) {
        e.knockdownTimer = Math.max(0, e.knockdownTimer - dt);
      }
      if (e.cooldownTimer > 0) {
        e.cooldownTimer = Math.max(0, e.cooldownTimer - dt * iceTimeMult);
      }

      if (!e.grounded || Math.hypot(e.vx, e.vz) > 0.05) {
        const nextPos = applyEnemySpatialConstraints(
          e.x + e.vx * dt,
          e.z + e.vz * dt,
          e.radius
        );
        e.x = nextPos.x;
        e.z = nextPos.z;
        const dragRate = !e.grounded ? 2.8 : 6.5;
        const drag = Math.max(0, 1.0 - dragRate * dt);
        e.vx *= drag;
        e.vz *= drag;
        if (Math.hypot(e.vx, e.vz) <= 0.05) {
          e.vx = 0;
          e.vz = 0;
        }
      } else {
        e.vx = 0;
        e.vz = 0;
      }

      const groundY = walkableHeightAt(e.x, e.z);
      if (!e.grounded) {
        e.vy -= 19.0 * dt;
        e.y += e.vy * dt;
        if (e.y <= groundY) {
          e.y = groundY;
          e.vy = 0;
          e.grounded = true;
          if (e.prayerAirborneSlowMo) {
            e.prayerAirborneSlowMo = false;
            e.char.mixer.timeScale = iceTimeMult;
          }
        } else if (e.prayerAirborneSlowMo) {
          e.char.mixer.timeScale = 0.15;
        }
      } else {
        e.y = groundY;
        if (e.prayerAirborneSlowMo) {
          e.prayerAirborneSlowMo = false;
          e.char.mixer.timeScale = iceTimeMult;
        }
      }

      let targetHero = knight || mage;
      if (e.preferredTarget === 'Mage' && mage && !mage.downed) {
        targetHero = mage;
      } else if (e.preferredTarget === 'Knight' && knight && !knight.downed) {
        targetHero = knight;
      } else if (knight && mage) {
        if (knight.downed && !mage.downed) targetHero = mage;
        else if (mage.downed && !knight.downed) targetHero = knight;
        else {
          const dk = Math.hypot(e.x - knight.x, e.z - knight.z);
          const dm = Math.hypot(e.x - mage.x, e.z - mage.z);
          targetHero = dm + 1.2 < dk ? mage : knight;
        }
      }
      if (targetHero) {
        e.targetHeroId = targetHero.id || 'Knight';
        e.distToTarget = Math.hypot(e.x - targetHero.x, e.z - targetHero.z);
      }

      // Night Demon Tree 10.0s Bat Summon Cooldown (measured from summon timestamp, max 2 active bats)
      if (e.batSummonCooldown > 0) {
        if (e.batSummonTimer > 0) {
          e.batSummonTimer = Math.max(0, e.batSummonTimer - dt * iceTimeMult);
        }
        const activeBatCount = activeEnemies.filter(
          (b) => b && !b.dead && b.active && b.archetype === 'summoned_bat'
        ).length;
        const maxBats = e.maxActiveBats || 2;
        if (
          e.batSummonTimer <= 0 &&
          activeBatCount < maxBats &&
          activeEnemies.length < MAX_CONCURRENT_ENEMIES
        ) {
          e.batSummonTimer = e.batSummonCooldown;
          const toSummon = Math.min(
            maxBats - activeBatCount,
            MAX_CONCURRENT_ENEMIES - activeEnemies.length
          );
          for (let bIdx = 0; bIdx < toSummon; bIdx++) {
            const side = (activeBatCount + bIdx) % 2 === 0 ? -1 : 1;
            spawnImmediateFromSpec({
              archetype: 'summoned_bat',
              x: e.x + side * 2.2,
              z: e.z + 1.8,
            });
          }
          e.char.play('cast_shoot', { loop: false, fade: 0.1, force: true });
        }
      }
    }

    for (let i = 0; i < toRelease.length; i++) {
      releaseSlot(toRelease[i]);
    }

    allocateAttackTokens(activeEnemies, MAX_ATTACK_TOKENS);

    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (!e || e.dead || !e.active) continue;

      const targetHero =
        (e.targetHeroId === 'Mage' ? mage : knight) || knight || mage;
      const slowMult =
        e.slowTimer > 0 && !e.iceSlowFactor
          ? e.slowFactor > 0
            ? 1.0 - clamp(e.slowFactor, 0, 0.85)
            : 0.3
          : 1.0 - clamp(e.iceSlowFactor || 0, 0, 0.75);

      if (e.stunTimer <= 0 && e.knockdownTimer <= 0 && e.hitstopTimer <= 0 && e.grounded && targetHero) {
        const dx = targetHero.x - e.x;
        const dz = targetHero.z - e.z;
        const dist = Math.hypot(dx, dz) || 1;
        const dirX = dx / dist;
        const dirZ = dz / dist;
        const desiredYaw = Math.atan2(dx, dz);

        // Lock melee aim rotation during the final 0.26s of windup so late dodges are never tracked
        const lockWindupAim =
          e.aiState === 'windup' && !e.isRanged && e.windupDuration - e.windupTimer <= 0.26;
        if (!lockWindupAim) {
          e.yaw += shortestAngleDiff(desiredYaw, e.yaw) * Math.min(1, 10 * dt * slowMult);
        }

        if (e.aiState === 'windup') {
          e.windupTimer += dt * slowMult;
          e.telegraphProgress = clamp(e.windupTimer / e.windupDuration, 0, 1);
          e.telegraphY = walkableHeightAt(e.telegraphX, e.telegraphZ) + 0.04;

          if (e.windupTimer >= e.windupDuration) {
            e.aiState = 'orbit';
            e.windupTimer = 0;
            e.telegraphProgress = 0;
            e.cooldownTimer = e.attackCooldown;
            e.attackAnimTimer = 0.45;

            const dmgReduction = clamp(e.iceSlowFactor || 0, 0, 0.75);
            const outgoingDmg = Math.max(1, Math.round(e.dmg * (1.0 - dmgReduction)));

            if (e.isRanged) {
              // Ranged enemy (`Skeleton_Mage`) fires a real 3D dodgeable spell projectile (11.5 m/s)
              const castDirX = Math.sin(e.yaw);
              const castDirZ = Math.cos(e.yaw);
              spawnEnemyProjectile({
                owner: e,
                origin: {
                  x: e.x + castDirX * 0.7,
                  y: e.y + 1.25,
                  z: e.z + castDirZ * 0.7,
                },
                targetPos: {
                  x: targetHero.x,
                  y: (targetHero.y ?? walkableHeightAt(targetHero.x, targetHero.z)) + 1.05,
                  z: targetHero.z,
                },
                speed: 11.5,
                dmg: outgoingDmg,
                radius: 0.42,
                targetHeroId: targetHero.id || 'Knight',
              });
            } else {
              const hitDist = Math.hypot(
                targetHero.x - e.telegraphX,
                targetHero.z - e.telegraphZ
              );
              if (
                hitDist <= e.telegraphRadius + 0.45 &&
                !targetHero.downed &&
                (targetHero.iframeTimer || 0) <= 0
              ) {
                if (onPlayerHit) {
                  onPlayerHit(targetHero, e, outgoingDmg);
                }
              }
            }
          }
        } else if (e.isStationary) {
          // Stationary Night Demon Tree: never translates x/z; slams roots when heroes enter range
          if (dist <= e.attackRange * 1.15 && e.cooldownTimer <= 0) {
            e.aiState = 'windup';
            e.windupTimer = 0;
            e.telegraphProgress = 0.02;
            e.telegraphX = e.x + dirX * (e.attackRange * 0.55);
            e.telegraphZ = e.z + dirZ * (e.attackRange * 0.55);
            e.telegraphY = walkableHeightAt(e.telegraphX, e.telegraphZ) + 0.04;
            e.attackAnimTimer = e.windupDuration + 0.25;
            e.char.play('charged', {
              loop: false,
              fade: 0.1,
              timeScale: 0.85 * slowMult,
              force: true,
            });
          } else {
            playEnemyLocomotion(e, 'idle');
          }
        } else if (e.hasAttackToken) {
          if (dist > e.attackRange * 0.92) {
            const step = Math.min(dist - e.attackRange * 0.8, e.speed * slowMult * dt);
            const nextPos = applyEnemySpatialConstraints(
              e.x + dirX * step,
              e.z + dirZ * step,
              e.radius
            );
            e.x = nextPos.x;
            e.z = nextPos.z;
            e.y = walkableHeightAt(e.x, e.z);
            playEnemyLocomotion(e, dist > 5.0 ? 'run' : 'walk');
          } else if (e.cooldownTimer <= 0) {
            e.aiState = 'windup';
            e.windupTimer = 0;
            e.telegraphProgress = 0.02;
            e.telegraphX = e.isRanged ? targetHero.x : e.x + dirX * (e.attackRange * 0.55);
            e.telegraphZ = e.isRanged ? targetHero.z : e.z + dirZ * (e.attackRange * 0.55);
            e.telegraphY = walkableHeightAt(e.telegraphX, e.telegraphZ) + 0.04;
            const atkClip = e.isRanged
              ? 'cast_shoot'
              : e.isBoss
                ? 'charged'
                : e.slotIndex % 2 === 0
                  ? 'combo1'
                  : 'combo2';
            e.attackAnimTimer = e.windupDuration + 0.25;
            e.char.play(atkClip, {
              loop: false,
              fade: 0.1,
              timeScale: 0.85 * slowMult,
              force: true,
            });
          } else {
            playEnemyLocomotion(e, 'idle');
          }
        } else {
          const radialErr = dist - e.standoffDist;
          const radialSpeed = clamp(radialErr * 1.8, -e.speed * 0.65, e.speed * 0.85) * slowMult;
          const tangX = -dirZ * e.orbitSpeed * slowMult;
          const tangZ = dirX * e.orbitSpeed * slowMult;
          const vxMove = dirX * radialSpeed + tangX * 1.45;
          const vzMove = dirZ * radialSpeed + tangZ * 1.45;

          const nextPos = applyEnemySpatialConstraints(
            e.x + vxMove * dt,
            e.z + vzMove * dt,
            e.radius
          );
          e.x = nextPos.x;
          e.z = nextPos.z;
          e.y = walkableHeightAt(e.x, e.z);
          playEnemyLocomotion(e, Math.hypot(vxMove, vzMove) > 0.6 ? 'walk' : 'idle');
        }
      }

      for (let j = i + 1; j < activeEnemies.length; j++) {
        const o = activeEnemies[j];
        if (!o || o.dead || !o.active) continue;
        const sdx = e.x - o.x;
        const sdz = e.z - o.z;
        const minSep = e.radius + o.radius + 0.35;
        const sd = Math.hypot(sdx, sdz);
        if (sd < minSep && sd > 1e-4) {
          const push = (minSep - sd) * 0.5;
          const nx = (sdx / sd) * push;
          const nz = (sdz / sd) * push;
          if (!e.isStationary) {
            const clampedE = applyEnemySpatialConstraints(e.x + nx, e.z + nz, e.radius);
            e.x = clampedE.x;
            e.z = clampedE.z;
          }
          if (!o.isStationary) {
            const clampedO = applyEnemySpatialConstraints(o.x - nx, o.z - nz, o.radius);
            o.x = clampedO.x;
            o.z = clampedO.z;
          }
        }
      }

      const finalClamped = applyEnemySpatialConstraints(e.x, e.z, e.radius);
      e.x = finalClamped.x;
      e.z = finalClamped.z;
      if (e.grounded) {
        const baseGroundY = walkableHeightAt(e.x, e.z);
        if (e.isFlying) {
          // Flying bats hover at 2.35m and swoop down to 1.20m during their attack window so Knight melee can cleave them!
          const inSwoopWindow = e.aiState === 'windup' || e.attackAnimTimer > 0;
          e.y = baseGroundY + (inSwoopWindow ? (e.swoopHeight ?? 1.2) : (e.hoverHeight ?? 2.35));
        } else {
          e.y = baseGroundY;
        }
        e.group.rotation.set(0, e.yaw, 0, 'YXZ');
      } else if (e.prayerAirborneSlowMo) {
        const airTilt = clamp((e.y - walkableHeightAt(e.x, e.z)) / 1.4, 0.25, 1.0);
        e.group.rotation.set(
          (e.airPitch ?? -0.72) * airTilt,
          e.yaw,
          (e.airRoll ?? 0.36) * airTilt,
          'YXZ'
        );
      } else {
        e.group.rotation.set(0, e.yaw, 0, 'YXZ');
      }

      e.group.position.set(e.x, e.y, e.z);
      e.char.update(dt);
    }
  }

  function setFrozenForShot(shotId = null, camera = null, customPoses = null) {
    frozenShotId = shotId;
    enemyProjectileMesh.visible = false;
    enemyProjectileMesh.count = 0;
    if (!shotId) {
      for (let i = 0; i < poolSlots.length; i++) {
        const s = poolSlots[i];
        s.char.group.visible = Boolean(s.busy && s.enemy && !s.enemy.dead);
      }
      return;
    }

    for (let i = 0; i < poolSlots.length; i++) {
      poolSlots[i].char.group.visible = false;
      poolSlots[i].char.group.scale.setScalar(1.0);
      poolSlots[i].char.mixer.timeScale = 1.0;
    }

    if (Array.isArray(customPoses) && customPoses.length > 0) {
      const count = Math.min(customPoses.length, MAX_CONCURRENT_ENEMIES);
      for (let i = 0; i < count; i++) {
        const p = customPoses[i];
        const slot = p.isBoss ? poolSlots[5] : poolSlots[p.slotIndex ?? (i % 5)];
        const y = p.y ?? walkableHeightAt(p.x, p.z);
        slot.char.group.scale.setScalar(p.scale ?? 1.0);
        slot.char.group.position.set(p.x, y, p.z);
        slot.char.group.rotation.y = p.rotY ?? 0;
        slot.char.poseAt(p.clip || 'Idle_Combat', p.time ?? 0.38);
        slot.char.group.visible = true;
      }
      rootGroup.updateMatrixWorld(true);
      return;
    }

    const preset =
      ARCHITECTURAL_SHOT_SKELETON_POSES[shotId] ||
      ARCHITECTURAL_SHOT_SKELETON_POSES['day-arena-wisteria'];
    const sw = preset.skeletonWarrior;
    const sm = preset.skeletonMage;

    const slotW = poolSlots[0];
    const slotM = poolSlots[4];

    slotW.char.group.position.set(sw.x, walkableHeightAt(sw.x, sw.z), sw.z);
    slotW.char.group.rotation.y = sw.rotY;
    slotW.char.poseAt(sw.clip, sw.time);

    slotM.char.group.position.set(sm.x, walkableHeightAt(sm.x, sm.z), sm.z);
    slotM.char.group.rotation.y = sm.rotY;
    slotM.char.poseAt(sm.clip, sm.time);

    let show = shotId === 'day-arena-wisteria';
    if (camera) {
      const camDistSq = camera.position.distanceToSquared(arenaCenterVec);
      show = camDistSq <= 92 * 92;
    }
    slotW.char.group.visible = show;
    slotM.char.group.visible = show;
    rootGroup.updateMatrixWorld(true);
  }

  /**
   * Frame 37 Prayer Start: Launches all living enemies within `throwRadius` (`6.5m`)
   * off their feet into an airborne arc (`vy = 8.8..12.2 m/s`, radial `vx/vz = 11.5 m/s`,
   * `0.15x` slow-mo `'Hit_B'`), dealing ZERO (`0`) HP damage and cancelling any active windup.
   */
  function applyPrayerAirborneThrow(centerPos, throwRadius = 6.5) {
    if (!centerPos) return { thrownCount: 0, enemies: [] };
    const cx = centerPos.x ?? 0;
    const cz = centerPos.z ?? 0;
    const radius = Math.max(0.1, Number(throwRadius) || 6.5);
    const thrownEnemies = [];

    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (!e || e.dead || e.hp <= 0 || !e.active) continue;
      const dx = e.x - cx;
      const dz = e.z - cz;
      const dist = Math.hypot(dx, dz);
      if (dist <= radius) {
        const nx = dist > 1e-4 ? dx / dist : 1.0;
        const nz = dist > 1e-4 ? dz / dist : 0.0;
        const distFrac = clamp(dist / radius, 0, 1);

        // Zero HP damage; cancel any active windup immediately
        e.aiState = 'orbit';
        e.windupTimer = 0;
        e.telegraphProgress = 0;
        e.hasAttackToken = false;

        // Launch off their feet into an airborne arc with backward pitch/roll tilt
        e.vy = 8.8 + (1.0 - distFrac) * 3.4;
        e.grounded = false;
        e.vx = nx * 11.5;
        e.vz = nz * 11.5;
        e.airPitch = -0.74;
        e.airRoll = (i % 2 === 0 ? 1 : -1) * 0.42;
        e.stunTimer = Math.max(e.stunTimer || 0, 2.6);
        e.knockdownTimer = Math.max(e.knockdownTimer || 0, 2.4);
        e.slowTimer = Math.max(e.slowTimer || 0, 3.0);
        e.slowFactor = 0.85;
        e.prayerAirborneSlowMo = true;
        e.attackAnimTimer = Math.max(e.attackAnimTimer || 0, 2.4);
        e.cooldownTimer = Math.max(e.cooldownTimer || 0, 2.6);

        e.yaw = Math.atan2(-nx, -nz);
        e.group.rotation.set(e.airPitch, e.yaw, e.airRoll, 'YXZ');
        e.char.play('Hit_B', {
          fade: 0.06,
          loopOnce: true,
          loop: false,
          timeScale: 0.15,
          force: true,
        });
        e.char.mixer.timeScale = 0.15;
        thrownEnemies.push(e);
      }
    }

    return {
      thrownCount: thrownEnemies.length,
      enemies: thrownEnemies,
    };
  }

  function applySacredWardPushback(centerPos, wardRadius = 6.5, options = {}) {
    if (!centerPos) return options?.initialBurst ? { thrownCount: 0, enemies: [] } : 0;
    if (options?.initialBurst || centerPos?.initialBurst) {
      return applyPrayerAirborneThrow(centerPos, wardRadius);
    }

    let pushedCount = 0;
    const cx = centerPos.x ?? 0;
    const cz = centerPos.z ?? 0;

    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (!e || e.dead || !e.active) continue;
      if (!e.grounded) continue;
      const dx = e.x - cx;
      const dz = e.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < wardRadius) {
        const nx = d > 1e-4 ? dx / d : 1.0;
        const nz = d > 1e-4 ? dz / d : 0.0;
        const targetDist = wardRadius + 0.35;
        const nextPos = applyEnemySpatialConstraints(
          cx + nx * targetDist,
          cz + nz * targetDist,
          e.radius
        );
        e.x = nextPos.x;
        e.z = nextPos.z;
        e.y = walkableHeightAt(e.x, e.z);
        e.vx = nx * 4.5;
        e.vz = nz * 4.5;
        if (e.aiState === 'windup') {
          e.aiState = 'orbit';
          e.windupTimer = 0;
          e.telegraphProgress = 0;
        }
        e.cooldownTimer = Math.max(e.cooldownTimer, 0.85);
        e.group.position.set(e.x, e.y, e.z);
        pushedCount++;
      }
    }
    return pushedCount;
  }

  return {
    rootGroup,
    telegraphRingMesh,
    enemyProjectileMesh,
    poolSlots,
    get activeEnemies() {
      return activeEnemies;
    },
    get activeProjectiles() {
      return activeProjectiles;
    },
    get spawnQueue() {
      return spawnQueue;
    },
    get visibleCount() {
      return getVisibleCount();
    },
    get frozenShotId() {
      return frozenShotId;
    },
    get currentActId() {
      return currentActId;
    },
    get groveTreeVanquished() {
      return groveTreeVanquished;
    },
    setCurrentActId(actId) {
      currentActId = actId;
    },
    spawnWave,
    spawnImmediateFromSpec,
    spawnEnemyProjectile,
    clearAllEnemies,
    applyHitToEnemy,
    applyAreaOrLineHit,
    checkPerfectDodge,
    applyPrayerAirborneThrow,
    applySacredWardPushback,
    setFrozenForShot,
    update,
  };
}
