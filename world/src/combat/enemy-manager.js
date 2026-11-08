// ============================================================================
// world/src/combat/enemy-manager.js
//
// Stage 5 Multi-Archetype Pooled Enemy Manager & Strategic AI Director:
// - Pre-allocates `poolByCharId` across all 12 approved native enemy & boss GLBs
//   (`2` instances for standard pack units: `Skeleton_Minion`, `Skeleton_Warrior`,
//   `Skeleton_Rogue`, `Skeleton_Mage`, `OrcRaider`, `PlantWarrior`, `Werewolf_Wolf`;
//   `1` instance for elites/bosses: `BlackKnight`, `Necromancer`, `OrcBrute`,
//   `FrostGolem`, `Skeleton_Golem`), all initialized with `group.visible = false`
//   (0 draw calls and 0 AnimationMixer CPU cost when idle).
// - Enforces `MAX_CONCURRENT_ENEMIES = 5` (`<= 10` enemy draw calls + `1` shared
//   InstancedMesh for ranged bolts = `<= 11` combat draw calls on Xiaomi Pad 7).
// - Strategic AI:
//   * Re-evaluates target every `0.6s` (never mid-windup) via `selectEnemyTargetByThreat`
//     (hunting the Mage after she scores kills or high spell damage, while allowing
//     Knight hits/intercepts/shield-blocks to strip aggro back).
//   * `BlackKnight` Directional Frontal Shield (`Blocking` clip, 80% frontal DR within
//     ±70° cone; flanked or detonated hits deal 100% damage and stagger him).
//   * `PlantWarrior` Hybrid Ranged/Melee Switcher (thorn bolts > 6.5m, melee spear
//     thrusts < 4.5m, 1.35x Fire damage vulnerability).
//   * `Necromancer` Strict 10.0s Summon Loop (starts at summon timestamp, max 2 living
//     summons, and immediately cancels/despawns all summons when Necromancer hits 0 HP).
//   * Boss Phase Threshold callbacks at 70% and 35% HP (`onBossPhaseThreshold`).
//   * Mode B Main Divine Blessing support (`setGlobalEnemyTimeScale(scale)` and
//     `blastEnemiesFromPoint(x, z, radius, pushDist)`).
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
  selectEnemyTargetByThreat,
  applyHitAndResolveDetonation,
} from './combat-balance.js';

export const BOSS_SOVEREIGN_CELL_OVERRIDES = {
  r0c3: [42, 30, 52],
  r1c0: [204, 24, 44],
  r1c2: [248, 196, 68],
};

export const MULTI_ARCHETYPE_POOL_CONFIG = Object.freeze([
  { charId: 'Skeleton_Warrior', count: 2, isBossSlot: false },
  { charId: 'Skeleton_Minion', count: 2, isBossSlot: false },
  { charId: 'Skeleton_Rogue', count: 2, isBossSlot: false },
  { charId: 'Skeleton_Mage', count: 2, isBossSlot: false },
  { charId: 'OrcRaider', count: 2, isBossSlot: false },
  { charId: 'PlantWarrior', count: 2, isBossSlot: false },
  { charId: 'Werewolf_Wolf', count: 2, isBossSlot: false },
  { charId: 'BlackKnight', count: 1, isBossSlot: false },
  { charId: 'Necromancer', count: 1, isBossSlot: true },
  { charId: 'OrcBrute', count: 1, isBossSlot: true },
  { charId: 'FrostGolem', count: 1, isBossSlot: true },
  { charId: 'Skeleton_Golem', count: 1, isBossSlot: true },
]);

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
  onBossPhaseThreshold = null,
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

  // Build creation specs so the first 6 slots match legacy index expectations
  // (`0,1: Skeleton_Warrior`, `2: Skeleton_Minion`, `3: Skeleton_Rogue`, `4: Skeleton_Mage`, `5: FrostGolem/Boss`)
  // followed by all remaining multi-archetype instances (`poolByCharId`).
  const creationSpecs = [
    { charId: 'Skeleton_Warrior', poolRole: 'Skeleton_Warrior', isBossSlot: false },
    { charId: 'Skeleton_Warrior', poolRole: 'Skeleton_Warrior', isBossSlot: false },
    { charId: 'Skeleton_Minion', poolRole: 'Skeleton_Minion', isBossSlot: false },
    { charId: 'Skeleton_Rogue', poolRole: 'Skeleton_Rogue', isBossSlot: false },
    { charId: 'Skeleton_Mage', poolRole: 'Skeleton_Mage', isBossSlot: false },
    {
      charId: 'FrostGolem',
      poolRole: 'Boss_Sovereign',
      isBossSlot: true,
      targetHeight: 2.85,
      outlineThickness: 0.015,
      cellOverrides: BOSS_SOVEREIGN_CELL_OVERRIDES,
    },
    { charId: 'Skeleton_Minion', poolRole: 'Skeleton_Minion', isBossSlot: false },
    { charId: 'Skeleton_Rogue', poolRole: 'Skeleton_Rogue', isBossSlot: false },
    { charId: 'Skeleton_Mage', poolRole: 'Skeleton_Mage', isBossSlot: false },
    { charId: 'OrcRaider', poolRole: 'OrcRaider', isBossSlot: false },
    { charId: 'OrcRaider', poolRole: 'OrcRaider', isBossSlot: false },
    { charId: 'PlantWarrior', poolRole: 'PlantWarrior', isBossSlot: false },
    { charId: 'PlantWarrior', poolRole: 'PlantWarrior', isBossSlot: false },
    { charId: 'Werewolf_Wolf', poolRole: 'Werewolf_Wolf', isBossSlot: false },
    { charId: 'Werewolf_Wolf', poolRole: 'Werewolf_Wolf', isBossSlot: false },
    { charId: 'BlackKnight', poolRole: 'BlackKnight', isBossSlot: false },
    { charId: 'Necromancer', poolRole: 'Necromancer', isBossSlot: true, targetHeight: 2.35 },
    { charId: 'OrcBrute', poolRole: 'OrcBrute', isBossSlot: true, targetHeight: 2.55 },
    { charId: 'Skeleton_Golem', poolRole: 'Skeleton_Golem', isBossSlot: true, targetHeight: 2.65 },
  ];

  const createdChars = await Promise.all(
    creationSpecs.map((spec) =>
      charKit.createCharacter(spec.charId, {
        initialClip: 'idle',
        targetHeight: spec.targetHeight,
        outlineThickness: spec.outlineThickness,
        cellOverrides: spec.cellOverrides,
      })
    )
  );

  const poolByCharId = {};
  const allPoolSlots = createdChars.map((charInst, slotIndex) => {
    const spec = creationSpecs[slotIndex];
    enableCharacterFrustumCulling(charInst, spec.isBossSlot ? 4.8 : 3.4);
    charInst.group.visible = false;
    rootGroup.add(charInst.group);
    const slot = {
      slotIndex,
      charId: spec.charId,
      poolRole: spec.poolRole,
      isBossSlot: spec.isBossSlot,
      char: charInst,
      busy: false,
      enemy: null,
    };
    if (!poolByCharId[spec.charId]) {
      poolByCharId[spec.charId] = [];
    }
    poolByCharId[spec.charId].push(slot);
    return slot;
  });

  // Alias `Boss_Sovereign` in `poolByCharId` to `FrostGolem`
  poolByCharId.Boss_Sovereign = poolByCharId.FrostGolem;

  // Keep `poolSlots` as a 6-element slice view for legacy tests (`assert.equal(em.poolSlots.length, 6)`)
  // while `allPoolSlots` and `poolByCharId` hold all 19 pre-allocated native archetype instances.
  const poolSlots = allPoolSlots.slice(0, 6);

  let activeEnemies = [];
  let spawnQueue = [];
  let activeProjectiles = [];
  let nextInstanceSeq = 1;
  let currentActId = 'act1_arena';
  let frozenShotId = null;
  let globalEnemyTimeScale = 1.0;

  const globalThreatState = {
    killStreakTimers: {
      Knight: 0,
      Mage: 0,
    },
  };

  const arenaCenterVec = new THREE.Vector3(
    ACT_DEFINITIONS.act1_arena.center.x,
    ACT_DEFINITIONS.act1_arena.center.y,
    ACT_DEFINITIONS.act1_arena.center.z
  );

  // Pooled 3D Dodgeable Spell/Thorn Bolts for Ranged Enemies (`Skeleton_Mage`, `PlantWarrior`, `Necromancer`)
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

  function setGlobalEnemyTimeScale(scale = 1.0) {
    globalEnemyTimeScale = clamp(Number(scale) || 1.0, 0.02, 2.0);
    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (e && !e.dead && e.char?.mixer) {
        const iceMult = 1.0 - clamp(e.iceSlowFactor || 0, 0, 0.75);
        e.char.mixer.timeScale = iceMult * globalEnemyTimeScale;
      }
    }
    return globalEnemyTimeScale;
  }

  function getGlobalEnemyTimeScale() {
    return globalEnemyTimeScale;
  }

  function spawnEnemyProjectile({
    owner = null,
    origin = { x: 0, y: 1.25, z: 0 },
    targetPos = { x: 0, y: 1.05, z: 5.0 },
    speed = 11.5,
    dmg = 18,
    radius = 0.42,
    targetHeroId = 'Knight',
    kind = 'arcane_bolt',
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
      kind,
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
      maxAge: 2.4,
    };
    activeProjectiles.push(bolt);
    return bolt;
  }

  function getVisibleCount() {
    let count = 0;
    for (let i = 0; i < allPoolSlots.length; i++) {
      if (allPoolSlots[i].char.group.visible) count++;
    }
    return count;
  }

  function acquireSlot(archetypeSpec) {
    const activeVisible = allPoolSlots.filter((s) => s.busy && s.char.group.visible).length;
    if (activeVisible >= MAX_CONCURRENT_ENEMIES) return null;

    const desiredCharId = archetypeSpec.charId || archetypeSpec.poolRole || 'Skeleton_Warrior';
    const matchingBuckets = poolByCharId[desiredCharId];
    if (Array.isArray(matchingBuckets)) {
      for (let i = 0; i < matchingBuckets.length; i++) {
        if (!matchingBuckets[i].busy) {
          return matchingBuckets[i];
        }
      }
    }

    if (archetypeSpec.isBoss) {
      for (let i = 0; i < allPoolSlots.length; i++) {
        if (!allPoolSlots[i].busy && allPoolSlots[i].isBossSlot) {
          return allPoolSlots[i];
        }
      }
    }

    for (let i = 0; i < allPoolSlots.length; i++) {
      if (!allPoolSlots[i].busy && !allPoolSlots[i].isBossSlot) {
        return allPoolSlots[i];
      }
    }

    for (let i = 0; i < allPoolSlots.length; i++) {
      if (!allPoolSlots[i].busy) {
        return allPoolSlots[i];
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
      if (d > maxR && d <= maxR + 12.0 && d > 1e-5) {
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
    const arch =
      ENEMY_ARCHETYPES[spawnSpec.archetype] ||
      ENEMY_ARCHETYPES[spawnSpec.charId] ||
      ENEMY_ARCHETYPES.warrior;
    const slot = acquireSlot(arch);
    if (!slot) {
      spawnQueue.push(spawnSpec);
      return null;
    }

    const radius = arch.isBoss ? 0.85 : arch.isElite ? 0.65 : 0.52;
    const clampedPos = applyEnemySpatialConstraints(spawnSpec.x, spawnSpec.z, radius);
    const groundY = walkableHeightAt(clampedPos.x, clampedPos.z);

    const initialY = arch.isFlying ? groundY + (arch.hoverHeight ?? 2.35) : groundY;
    const scale = slot.isBossSlot && arch.id === 'boss_sovereign' ? 1.0 : arch.scale || 1.0;
    slot.char.group.scale.setScalar(scale);
    slot.char.group.position.set(clampedPos.x, initialY, clampedPos.z);
    const initialYaw = spawnSpec.rotY ?? Math.atan2(-clampedPos.x, -clampedPos.z);
    slot.char.group.rotation.y = initialYaw;
    slot.char.group.visible = !frozenShotId;
    slot.char.mixer.timeScale = globalEnemyTimeScale;
    slot.char.play('spawn', {
      loop: false,
      fade: 0.08,
      timeScale: 1.35 * globalEnemyTimeScale,
      force: true,
    });

    const orbitSign = (nextInstanceSeq % 2 === 0 ? 1 : -1) * (0.75 + (nextInstanceSeq % 3) * 0.18);
    const summonCooldownVal = Number(arch.summonCooldown ?? arch.batSummonCooldown ?? 0);
    const maxSummonsVal = Number(arch.maxActiveSummons ?? arch.maxActiveBats ?? 0);
    const initSummonTimer = Number(
      spawnSpec.initialSummonCooldown ?? spawnSpec.initialBatCooldown ?? 0
    );

    const enemy = {
      instanceId: spawnSpec.instanceId || `enemy_${nextInstanceSeq++}`,
      archetype: arch.id,
      charId: slot.charId,
      name: arch.name,
      slotIndex: slot.slotIndex,
      slot,
      char: slot.char,
      group: slot.char.group,
      hp: spawnSpec.maxHp ?? arch.maxHp,
      maxHp: spawnSpec.maxHp ?? arch.maxHp,
      dmg: arch.dmg,
      speed: arch.speed,
      qEnergyReward: arch.qEnergyReward ?? 20,
      attackRange: arch.attackRange,
      meleeAttackRange: arch.meleeAttackRange ?? 2.8,
      rangedMinDist: arch.rangedMinDist ?? 6.5,
      meleeMaxDist: arch.meleeMaxDist ?? 4.5,
      isHybridRangedMelee: Boolean(arch.isHybridRangedMelee),
      usingRangedMode: Boolean(arch.isRanged || arch.isHybridRangedMelee),
      projectileSpeed: arch.projectileSpeed ?? 11.5,
      fireVulnerabilityMult: arch.fireVulnerabilityMult ?? 1.0,
      directionalShieldConeDeg: arch.directionalShieldConeDeg ?? 0,
      directionalShieldDr: arch.directionalShieldDr ?? 0.80,
      shieldGuarding: Boolean(arch.directionalShieldConeDeg > 0),
      isFlanker: Boolean(arch.isFlanker),
      isPounceHunter: Boolean(arch.isPounceHunter),
      windupDuration: arch.windupDuration,
      attackCooldown: arch.attackCooldown,
      telegraphRadius: arch.telegraphRadius,
      radius,
      isRanged: Boolean(arch.isRanged),
      isStationary: Boolean(arch.isStationary),
      isFlying: Boolean(arch.isFlying),
      isSummon: Boolean(arch.isSummon || spawnSpec.summonedByInstanceId),
      summonedByInstanceId: spawnSpec.summonedByInstanceId || null,
      hoverHeight: arch.hoverHeight ?? 2.35,
      swoopHeight: arch.swoopHeight ?? 1.2,
      preferredTarget: spawnSpec.preferredTarget || arch.preferredTarget || null,
      summonCooldown: summonCooldownVal,
      maxActiveSummons: maxSummonsVal,
      summonArchetypes: arch.summonArchetypes || null,
      summonCooldownTimer: initSummonTimer,
      batSummonCooldown: summonCooldownVal,
      maxActiveBats: maxSummonsVal,
      batSummonTimer: initSummonTimer,
      isElite: Boolean(arch.isElite),
      isBoss: Boolean(arch.isBoss || spawnSpec.isBoss),
      phase70Triggered: false,
      phase35Triggered: false,
      aegisTriggerHpRatio: arch.aegisTriggerHpRatio ?? 0.5,
      aegisLayersMax: arch.aegisLayersMax ?? (arch.hasBoneAegis ? 2 : 0),
      aegisDmgReduction: arch.aegisDmgReduction ?? 0.85,
      aegisTriggered: Boolean(arch.hasBoneAegis),
      aegisActive: Boolean(arch.hasBoneAegis),
      aegisLayers: arch.hasBoneAegis ? (arch.aegisLayersMax ?? 2) : 0,
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
      targetHeroId: spawnSpec.preferredTarget || arch.preferredTarget || 'Knight',
      huntingMage: Boolean((spawnSpec.preferredTarget || arch.preferredTarget) === 'Mage'),
      aggroPulseTimer: 0,
      threatEvalTimer: 0.15 + (slot.slotIndex % 4) * 0.12,
      damageThreat: { Knight: 0, Mage: 0 },
      killStreakTimers: {
        Knight: globalThreatState.killStreakTimers.Knight,
        Mage: globalThreatState.killStreakTimers.Mage,
      },
      tauntHitTimer: 0,
      interceptTauntTimer: 0,
    };

    slot.busy = true;
    slot.enemy = enemy;
    activeEnemies.push(enemy);
    return enemy;
  }

  function releaseSlot(enemy) {
    if (!enemy) return;
    const slot = allPoolSlots[enemy.slotIndex];
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
    for (let i = 0; i < allPoolSlots.length; i++) {
      const s = allPoolSlots[i];
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
    const effectiveKey =
      enemy.shieldGuarding && (clipKey === 'idle' || clipKey === 'walk') ? 'block' : clipKey;
    if (enemy.char.anim.currentKey === effectiveKey) return;
    const slowMult = (1.0 - clamp(enemy.iceSlowFactor || 0, 0, 0.75)) * globalEnemyTimeScale;
    enemy.char.play(effectiveKey, {
      loop: true,
      fade: 0.15,
      timeScale: (enemy.isBoss ? 0.92 : 1.0) * slowMult,
    });
  }

  function checkAndFireBossPhaseThresholds(enemy) {
    if (!enemy || !enemy.isBoss || enemy.maxHp <= 0) return;
    const hpRatio = enemy.hp / enemy.maxHp;
    if (!enemy.phase70Triggered && hpRatio <= 0.70) {
      enemy.phase70Triggered = true;
      onBossPhaseThreshold?.({ enemy, phasePct: 0.70 });
    }
    if (!enemy.phase35Triggered && hpRatio <= 0.35) {
      enemy.phase35Triggered = true;
      onBossPhaseThreshold?.({ enemy, phasePct: 0.35 });
    }
  }

  function markEnemyDeadAndNotify(e, result = {}) {
    if (e.deathTimer > 0) return;
    e.dead = true;
    e.deathTimer = 0.58;
    e.hasAttackToken = false;
    e.aiState = 'dead';
    e.windupTimer = 0;
    e.telegraphProgress = 0;

    if (e.archetype === 'demon_tree' || e.archetype === 'necromancer') {
      groveTreeVanquished = true;
      // Immediately cancel pending summons and despawn all living summons of this boss
      spawnQueue = spawnQueue.filter((sp) => sp.summonedByInstanceId !== e.instanceId);
      for (let i = activeEnemies.length - 1; i >= 0; i--) {
        const s = activeEnemies[i];
        if (
          s &&
          s !== e &&
          !s.dead &&
          (s.summonedByInstanceId === e.instanceId ||
            (e.archetype === 'demon_tree' && s.archetype === 'summoned_bat'))
        ) {
          s.hp = 0;
          s.dead = true;
          s.xpAwarded = true;
          releaseSlot(s);
        }
      }
    }

    // Record +55 KillStreakThreat for 8.0s on all surviving enemies within 22.0m
    const killerRole =
      result?.killerRole ||
      (result?.isMagicKill ? 'Mage' : result?.isSwordKill ? 'Knight' : null);
    if (killerRole === 'Mage' || killerRole === 'Knight') {
      globalThreatState.killStreakTimers[killerRole] = 8.0;
      for (let i = 0; i < activeEnemies.length; i++) {
        const other = activeEnemies[i];
        if (other && !other.dead && other.active) {
          const d = Math.hypot(other.x - e.x, other.z - e.z);
          if (d <= 22.0) {
            other.killStreakTimers[killerRole] = 8.0;
          }
        }
      }
    }

    e.char.play('downed', { loop: false, fade: 0.08, force: true });
    if (onEnemyKilled && !e.xpAwarded) {
      e.xpAwarded = true;
      onEnemyKilled(e, result);
    }
  }

  function applyHitToEnemy(enemy, hitSpec = {}) {
    if (!enemy || enemy.dead || !enemy.active) return null;

    const source = hitSpec.source || 'combo1';
    const isMagicHit = Boolean(
      SPELLS_SET.has(source) ||
        source.startsWith('mage_') ||
        source === 'storm_cataclysm' ||
        hitSpec.attackerRole === 'Mage' ||
        hitSpec.heroId === 'Mage'
    );
    const attackerRole = isMagicHit ? 'Mage' : 'Knight';

    const result = applyHitAndResolveDetonation(enemy, hitSpec, activeEnemies);
    result.killerRole = attackerRole;
    result.isMagicKill = isMagicHit;
    result.isSwordKill = !isMagicHit;

    // Update dynamic threat scores on this enemy
    if (result.damageDealt > 0) {
      enemy.damageThreat[attackerRole] =
        (enemy.damageThreat[attackerRole] || 0) + result.damageDealt * 0.8;
      if (attackerRole === 'Knight' && enemy.targetHeroId === 'Mage') {
        enemy.tauntHitTimer = 5.0;
        enemy.damageThreat.Mage = (enemy.damageThreat.Mage || 0) * 0.2;
        if (enemy.killStreakTimers) enemy.killStreakTimers.Mage = 0;
        globalThreatState.killStreakTimers.Mage = 0;
        enemy.targetHeroId = 'Knight';
        enemy.huntingMage = false;
      }
      if (source === 'intercept') {
        enemy.interceptTauntTimer = 6.0;
        enemy.tauntHitTimer = Math.max(enemy.tauntHitTimer || 0, 5.0);
        enemy.damageThreat.Mage = (enemy.damageThreat.Mage || 0) * 0.1;
        if (enemy.killStreakTimers) enemy.killStreakTimers.Mage = 0;
        globalThreatState.killStreakTimers.Mage = 0;
        enemy.targetHeroId = 'Knight';
        enemy.huntingMage = false;
        if (enemy.aiState === 'windup') {
          enemy.aiState = 'orbit';
          enemy.windupTimer = 0;
          enemy.telegraphProgress = 0;
        }
      }
    }

    // Fire Boss Phase Threshold callbacks (70% and 35% HP -> +35 Q Energy to both heroes)
    if (Array.isArray(result.bossPhasesCrossed) && result.bossPhasesCrossed.length > 0) {
      for (let pIdx = 0; pIdx < result.bossPhasesCrossed.length; pIdx++) {
        onBossPhaseThreshold?.({
          enemy,
          phasePct: result.bossPhasesCrossed[pIdx],
        });
      }
    }

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
            checkAndFireBossPhaseThresholds(other);
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
      if (result.frontalShieldBlocked) {
        enemy.attackAnimTimer = 0.24;
        enemy.char.play('parry', { loop: false, fade: 0.05, force: true });
      } else if (result.guardShattered) {
        enemy.attackAnimTimer = 0.45;
        enemy.char.play('hit_B', { loop: false, fade: 0.06, force: true });
      } else {
        enemy.attackAnimTimer = 0.32;
        enemy.char.play('hit_A', { loop: false, fade: 0.06, force: true });
      }
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
          qEnergyGain: 12,
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
        allPoolSlots[0].char.group.visible = show;
        allPoolSlots[4].char.group.visible = show;
      }
      return;
    }

    const knight = heroStates.Knight;
    const mage = heroStates.Mage;
    const scaledDt = dt * globalEnemyTimeScale;

    if (globalThreatState.killStreakTimers.Knight > 0) {
      globalThreatState.killStreakTimers.Knight = Math.max(
        0,
        globalThreatState.killStreakTimers.Knight - dt
      );
    }
    if (globalThreatState.killStreakTimers.Mage > 0) {
      globalThreatState.killStreakTimers.Mage = Math.max(
        0,
        globalThreatState.killStreakTimers.Mage - dt
      );
    }

    // 0. Advance 3D Dodgeable Ranged Enemy Projectiles (scaled by globalEnemyTimeScale during Mode B!)
    if (activeProjectiles.length > 0) {
      const remainingBolts = [];
      for (let i = 0; i < activeProjectiles.length; i++) {
        const p = activeProjectiles[i];
        p.x += p.vx * scaledDt;
        p.y += p.vy * scaledDt;
        p.z += p.vz * scaledDt;
        p.age += scaledDt;

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
        checkAndFireBossPhaseThresholds(e);
        if (e.hp <= 0) {
          markEnemyDeadAndNotify(e, {
            killed: true,
            source: 'fire_burn',
            killerRole: 'Knight',
            isSwordKill: true,
            damageDealt: burnDmg,
          });
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

      const iceTimeMult = (1.0 - clamp(e.iceSlowFactor || 0, 0, 0.75)) * globalEnemyTimeScale;

      if (e.prayerAirborneSlowMo && !e.grounded) {
        if (e.slowTimer > 0) {
          e.slowTimer = Math.max(0, e.slowTimer - dt);
        }
        e.char.mixer.timeScale = Math.min(0.15, iceTimeMult);
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
        if (e.stunTimer <= 0 && e.directionalShieldConeDeg > 0) {
          e.shieldGuarding = true;
        }
      }
      if (e.knockdownTimer > 0) {
        e.knockdownTimer = Math.max(0, e.knockdownTimer - dt);
      }
      if (e.cooldownTimer > 0) {
        e.cooldownTimer = Math.max(0, e.cooldownTimer - dt * iceTimeMult);
      }

      // Decay dynamic threat timers (12%/s on RecentDamageThreat, 8.0s on KillStreakThreat)
      const dmgDecay = Math.max(0, 1.0 - 0.12 * dt);
      e.damageThreat.Knight = (e.damageThreat.Knight || 0) * dmgDecay;
      e.damageThreat.Mage = (e.damageThreat.Mage || 0) * dmgDecay;
      if (e.killStreakTimers.Knight > 0) {
        e.killStreakTimers.Knight = Math.max(0, e.killStreakTimers.Knight - dt);
      }
      if (e.killStreakTimers.Mage > 0) {
        e.killStreakTimers.Mage = Math.max(0, e.killStreakTimers.Mage - dt);
      }
      if (e.tauntHitTimer > 0) {
        e.tauntHitTimer = Math.max(0, e.tauntHitTimer - dt);
      }
      if (e.interceptTauntTimer > 0) {
        e.interceptTauntTimer = Math.max(0, e.interceptTauntTimer - dt);
      }
      if (e.aggroPulseTimer > 0) {
        e.aggroPulseTimer = Math.max(0, e.aggroPulseTimer - dt);
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

      // Re-evaluate Dynamic Threat target every 0.6s (never mid-windup!)
      e.threatEvalTimer -= dt;
      if (e.aiState !== 'windup' && (e.threatEvalTimer <= 0 || !e.targetHeroId)) {
        e.threatEvalTimer = 0.6;
        const chosen = selectEnemyTargetByThreat(e, heroStates, globalThreatState);
        if (chosen) {
          if (chosen.shiftedToMage && chosen.huntingMage) {
            e.huntingMage = true;
            e.aggroPulseTimer = 0.6;
          } else if (chosen.targetHeroId === 'Knight') {
            e.huntingMage = false;
          } else {
            e.huntingMage = Boolean(chosen.huntingMage);
          }
          e.targetHeroId = chosen.targetHeroId;
        }
      }

      const activeTargetHero =
        (e.targetHeroId === 'Mage' ? mage : knight) || knight || mage;
      if (activeTargetHero) {
        e.distToTarget = Math.hypot(e.x - activeTargetHero.x, e.z - activeTargetHero.z);
      }

      // Necromancer & Night Demon Tree Strict 10.0s Summon Cooldown
      // (starts at the moment of summoning, never resets on summon death, max 2 living summons)
      const summonCdConfig = e.summonCooldown || e.batSummonCooldown || 0;
      if (summonCdConfig > 0) {
        if (e.summonCooldownTimer > 0) {
          e.summonCooldownTimer = Math.max(0, e.summonCooldownTimer - dt * iceTimeMult);
        }
        e.batSummonTimer = e.summonCooldownTimer;

        const isDemonTree = e.archetype === 'demon_tree';
        const activeSummonCount = activeEnemies.filter(
          (b) =>
            b &&
            !b.dead &&
            b.active &&
            (b.summonedByInstanceId === e.instanceId ||
              (isDemonTree && b.archetype === 'summoned_bat'))
        ).length;
        const maxSummons = e.maxActiveSummons || e.maxActiveBats || 2;

        if (
          e.summonCooldownTimer <= 0 &&
          activeSummonCount < maxSummons &&
          activeEnemies.length < MAX_CONCURRENT_ENEMIES
        ) {
          e.summonCooldownTimer = summonCdConfig;
          e.batSummonTimer = summonCdConfig;
          const toSummon = Math.min(
            maxSummons - activeSummonCount,
            MAX_CONCURRENT_ENEMIES - activeEnemies.length
          );
          const summonPool =
            Array.isArray(e.summonArchetypes) && e.summonArchetypes.length > 0
              ? e.summonArchetypes
              : ['summoned_bat'];

          for (let bIdx = 0; bIdx < toSummon; bIdx++) {
            const side = (activeSummonCount + bIdx) % 2 === 0 ? -1 : 1;
            const chosenSummonArch = isDemonTree
              ? 'summoned_bat'
              : summonPool[(activeSummonCount + bIdx) % summonPool.length];
            spawnImmediateFromSpec({
              archetype: chosenSummonArch,
              x: e.x + side * 2.2,
              z: e.z + 1.8,
              summonedByInstanceId: e.instanceId,
              preferredTarget: 'Mage',
            });
          }
          e.char.play(isDemonTree ? 'cast_shoot' : 'burst_aoe', {
            loop: false,
            fade: 0.1,
            force: true,
          });
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
      const baseSlowMult =
        e.slowTimer > 0 && !e.iceSlowFactor
          ? e.slowFactor > 0
            ? 1.0 - clamp(e.slowFactor, 0, 0.85)
            : 0.3
          : 1.0 - clamp(e.iceSlowFactor || 0, 0, 0.75);
      const slowMult = baseSlowMult * globalEnemyTimeScale;

      if (e.stunTimer <= 0 && e.knockdownTimer <= 0 && e.hitstopTimer <= 0 && e.grounded && targetHero) {
        const dx = targetHero.x - e.x;
        const dz = targetHero.z - e.z;
        const dist = Math.hypot(dx, dz) || 1;
        const dirX = dx / dist;
        const dirZ = dz / dist;
        const desiredYaw = Math.atan2(dx, dz);

        // PlantWarrior Hybrid Ranged/Melee mode switching (> 6.5m ranged thorns, < 4.5m melee spear)
        if (e.isHybridRangedMelee && e.aiState !== 'windup') {
          if (dist > (e.rangedMinDist || 6.5)) {
            e.usingRangedMode = true;
          } else if (dist < (e.meleeMaxDist || 4.5)) {
            e.usingRangedMode = false;
          }
        } else if (!e.isHybridRangedMelee) {
          e.usingRangedMode = Boolean(e.isRanged);
        }

        const effectiveAttackRange =
          e.isHybridRangedMelee && !e.usingRangedMode
            ? e.meleeAttackRange || 2.8
            : e.attackRange;

        // Lock melee aim rotation during the final 0.26s of windup so late dodges are never tracked
        const lockWindupAim =
          e.aiState === 'windup' &&
          !e.usingRangedMode &&
          e.windupDuration - e.windupTimer <= 0.26;
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
            if (e.directionalShieldConeDeg > 0) {
              e.shieldGuarding = true;
            }

            const dmgReduction = clamp(e.iceSlowFactor || 0, 0, 0.75);
            const outgoingDmg = Math.max(1, Math.round(e.dmg * (1.0 - dmgReduction)));

            if (e.usingRangedMode) {
              const castDirX = Math.sin(e.yaw);
              const castDirZ = Math.cos(e.yaw);
              spawnEnemyProjectile({
                owner: e,
                kind: e.archetype === 'plant_warrior' ? 'thorn_bolt' : 'arcane_bolt',
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
                speed: e.projectileSpeed || 11.5,
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
          if (dist <= effectiveAttackRange * 1.15 && e.cooldownTimer <= 0) {
            e.aiState = 'windup';
            e.windupTimer = 0;
            e.telegraphProgress = 0.02;
            e.telegraphX = e.x + dirX * (effectiveAttackRange * 0.55);
            e.telegraphZ = e.z + dirZ * (effectiveAttackRange * 0.55);
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
          if (dist > effectiveAttackRange * 0.92) {
            const step = Math.min(dist - effectiveAttackRange * 0.8, e.speed * slowMult * dt);
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
            e.shieldGuarding = false;
            e.telegraphX = e.usingRangedMode
              ? targetHero.x
              : e.x + dirX * (effectiveAttackRange * 0.55);
            e.telegraphZ = e.usingRangedMode
              ? targetHero.z
              : e.z + dirZ * (effectiveAttackRange * 0.55);
            e.telegraphY = walkableHeightAt(e.telegraphX, e.telegraphZ) + 0.04;

            let atkClip = 'combo1';
            if (e.usingRangedMode) {
              atkClip = e.isHybridRangedMelee ? 'ranged_shoot' : 'cast_shoot';
            } else if (e.isHybridRangedMelee) {
              atkClip = 'stab';
            } else if (e.isPounceHunter) {
              atkClip = 'pounce';
            } else if (e.isBoss) {
              atkClip = 'charged';
            } else {
              atkClip = e.slotIndex % 2 === 0 ? 'combo1' : 'combo2';
            }

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
      for (let i = 0; i < allPoolSlots.length; i++) {
        const s = allPoolSlots[i];
        s.char.group.visible = Boolean(s.busy && s.enemy && !s.enemy.dead);
      }
      return;
    }

    for (let i = 0; i < allPoolSlots.length; i++) {
      allPoolSlots[i].char.group.visible = false;
      allPoolSlots[i].char.group.scale.setScalar(1.0);
      allPoolSlots[i].char.mixer.timeScale = 1.0;
    }

    if (Array.isArray(customPoses) && customPoses.length > 0) {
      const count = Math.min(customPoses.length, MAX_CONCURRENT_ENEMIES);
      for (let i = 0; i < count; i++) {
        const p = customPoses[i];
        const slot = p.isBoss ? allPoolSlots[5] : allPoolSlots[p.slotIndex ?? (i % 5)];
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

    const slotW = allPoolSlots[0];
    const slotM = allPoolSlots[4];

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

        e.aiState = 'orbit';
        e.windupTimer = 0;
        e.telegraphProgress = 0;
        e.hasAttackToken = false;

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

  /**
   * Mode B Main Divine Blessing radial shockwave (`12.0m` radius, `12.0m` push distance):
   * Hurls all nearby enemies outward and cancels active windups.
   */
  function blastEnemiesFromPoint(xOrCenter, zOrRadius = 0, radius = 12.0, pushDist = 12.0) {
    let cx = 0;
    let cz = 0;
    let effRadius = radius;
    let effPushDist = pushDist;

    if (xOrCenter && typeof xOrCenter === 'object') {
      cx = Number(xOrCenter.x ?? 0);
      cz = Number(xOrCenter.z ?? 0);
      if (typeof zOrRadius === 'number' && zOrRadius > 0) effRadius = zOrRadius;
      if (typeof radius === 'number' && radius > 0) effPushDist = radius;
    } else {
      cx = Number(xOrCenter || 0);
      cz = Number(zOrRadius || 0);
    }

    const r = Math.max(0.5, Number(effRadius) || 12.0);
    const targetPush = Math.max(1.0, Number(effPushDist) || 12.0);
    const blasted = [];

    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (!e || e.dead || e.hp <= 0 || !e.active) continue;
      const dx = e.x - cx;
      const dz = e.z - cz;
      const dist = Math.hypot(dx, dz);
      if (dist <= r) {
        const nx = dist > 1e-4 ? dx / dist : 1.0;
        const nz = dist > 1e-4 ? dz / dist : 0.0;
        const distFrac = clamp(dist / r, 0, 1);

        e.aiState = 'orbit';
        e.windupTimer = 0;
        e.telegraphProgress = 0;
        e.hasAttackToken = false;

        if (!e.isStationary) {
          const pushedPos = applyEnemySpatialConstraints(
            cx + nx * Math.max(dist + 3.5, targetPush * 0.65),
            cz + nz * Math.max(dist + 3.5, targetPush * 0.65),
            e.radius
          );
          e.x = pushedPos.x;
          e.z = pushedPos.z;
          e.vy = 8.5 + (1.0 - distFrac) * 3.5;
          e.grounded = false;
          e.vx = nx * Math.max(10.5, targetPush);
          e.vz = nz * Math.max(10.5, targetPush);
          e.prayerAirborneSlowMo = true;
        }

        e.stunTimer = Math.max(e.stunTimer || 0, 2.8);
        e.knockdownTimer = Math.max(e.knockdownTimer || 0, 2.5);
        e.cooldownTimer = Math.max(e.cooldownTimer || 0, 2.8);
        e.char.play('Hit_B', {
          fade: 0.06,
          loop: false,
          timeScale: 0.15,
          force: true,
        });
        e.char.mixer.timeScale = Math.min(0.15, globalEnemyTimeScale);
        e.group.position.set(e.x, e.y, e.z);
        blasted.push(e);
      }
    }

    return {
      blastedCount: blasted.length,
      thrownCount: blasted.length,
      enemies: blasted,
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
      if (!e.grounded || e.isStationary) continue;
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
    allPoolSlots,
    poolByCharId,
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
    get globalEnemyTimeScale() {
      return globalEnemyTimeScale;
    },
    setCurrentActId(actId) {
      currentActId = actId;
    },
    setGlobalEnemyTimeScale,
    getGlobalEnemyTimeScale,
    blastEnemiesFromPoint,
    acquireSlot,
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

const SPELLS_SET = new Set([
  'frost_lance',
  'shatterlance',
  'cinder_fall',
  'storm_lance',
]);
