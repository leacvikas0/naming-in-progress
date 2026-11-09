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
  ICE_DAMAGE_REDUCTION_CAP,
  ACT_HP_SCALE,
  BOSS_HP_SCALE,
  ENEMY_ATTACKS,
  PARRY_WINDOW,
  STAGGER_SECONDS,
  SHIELD_BASH_AFTER_BLOCKS,
  ROGUE_DODGE_COOLDOWN,
  MAGE_SUMMON_COOLDOWN,
  NECRO_WARD_SECONDS,
  CAPTAIN_RALLY_SECONDS,
  CAPTAIN_RALLY_SPEED_MULT,
  MINION_REASSEMBLE_SECONDS,
  BOSS_DOWN_WINDOW,
  BOSS_P3_SPEED,
  attackTimeline,
  advanceAttackClip,
  isParryTiming,
  isInAttackArc,
  initPoise,
  tickPoise,
  resolvePreHit,
  resolvePostHit,
  canStartWindup,
  recordWindup,
  strideTimeScale,
  bossPhaseFor,
  selectBossAttack,
  tickBonePile,
  isPileFinisher,
  selectHuntTarget,
} from './combat-balance.js';

// Native clip lengths (KayKit 1.1) used when a rig/mocked kit cannot report durations.
const CLIP_FALLBACK_SECONDS = {
  Skeletons_Spawn_Ground: 3.567,
  Skeletons_Death: 2.0,
  Skeletons_Death_Resurrect: 2.7,
  Skeletons_Awaken_Floor: 2.3,
  Skeletons_Awaken_Standing: 1.0,
  Skeletons_Taunt: 1.033,
  Skeletons_Taunt_Longer: 3.0,
  Ranged_Magic_Summon: 4.3,
  Ranged_Magic_Raise: 2.1,
  Flexing: 4.3,
  Death_A: 1.667,
  Dodge_Left: 0.4,
  Dodge_Right: 0.4,
  Dodge_Backward: 0.4,
};

/** Plays a native clip, falling back to a semantic key when the rig lacks it (e.g. Rig_Large). */
function safePlay(char, clip, opts, fallback = null) {
  const has = !char.resolveClipName || char.resolveClipName(clip);
  try {
    if (has) return char.play(clip, opts) || null;
  } catch (_) {
    /* fall through to the semantic fallback */
  }
  if (!fallback) return null;
  try {
    return char.play(fallback, opts) || null;
  } catch (_) {
    return null;
  }
}

function clipSeconds(char, clip) {
  return char.getClipDuration?.(clip) || CLIP_FALLBACK_SECONDS[clip] || 1.0;
}

// Opaque crimson petal-crack ground decal for AREA attacks only (no alpha, no fog, discard cutout).
function createPetalCrackDecal() {
  const mat = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uProgress: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float petalR = 0.8 + 0.2 * cos(a * 6.0);
        float edge = r / petalR;
        bool outline = edge > 0.93 && edge < 1.0;
        float crackW = 0.07 + 0.06 * (1.0 - r);
        float crack = abs(sin(a * 4.5 + sin(r * 11.0) * 0.55));
        bool cracks = crack < crackW && edge < uProgress;
        float ring = abs(edge - uProgress * 0.9);
        bool front = ring < 0.025 && uProgress < 0.98;
        if (!(outline || cracks || front)) discard;
        vec3 deep = vec3(0.36, 0.02, 0.06);
        vec3 hot = vec3(0.98, 0.16, 0.22);
        vec3 col = outline ? mix(deep, hot, uProgress * 0.6) : mix(hot, vec3(1.0, 0.55, 0.45), step(0.98, uProgress));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'enemyAreaPetalCrackDecal';
  mesh.renderOrder = 2;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

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

  // Fixed pool (indices 0/4/5 are relied on by shot poses: Warrior, Mage, boss). Hidden slots
  // cost no draw calls or mixer updates; MAX_CONCURRENT_ENEMIES caps what is visible.
  const POOL_LAYOUT = [
    ['Skeleton_Warrior', false],
    ['Skeleton_Warrior', false],
    ['Skeleton_Minion', false],
    ['Skeleton_Rogue', false],
    ['Skeleton_Mage', false],
    ['Skeleton_Golem', true],
    ['Skeleton_Minion', false],
    ['Skeleton_Minion', false],
    ['Skeleton_Rogue', false],
    ['Necromancer', false],
  ];
  const pooledChars = await Promise.all(
    POOL_LAYOUT.map(([charId, isBoss]) =>
      charKit.createCharacter(charId, isBoss ? { outlineThickness: 0.015, initialClip: 'idle' } : { initialClip: 'idle' })
    )
  );

  const rawPoolSpec = POOL_LAYOUT.map(([charId, isBoss], i) => ({
    slotIndex: i,
    poolRole: charId,
    char: pooledChars[i],
    isBossSlot: isBoss,
  }));

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
  let nextInstanceSeq = 1;
  let currentActId = 'act1_arena';
  let frozenShotId = null;
  const arenaCenterVec = new THREE.Vector3(
    ACT_DEFINITIONS.act1_arena.center.x,
    ACT_DEFINITIONS.act1_arena.center.y,
    ACT_DEFINITIONS.act1_arena.center.z
  );

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
      const bossSlot = poolSlots.find((s) => s.isBossSlot);
      return bossSlot && !bossSlot.busy ? bossSlot : null;
    }

    let roleExists = false;
    for (let i = 0; i < poolSlots.length; i++) {
      const s = poolSlots[i];
      if (s.isBossSlot || s.poolRole !== archetypeSpec.poolRole) continue;
      roleExists = true;
      if (!s.busy) return s;
    }
    // Wait for a matching rig rather than wearing the wrong model; only fall back if none exists.
    if (roleExists) return null;
    for (let i = 0; i < poolSlots.length; i++) {
      if (!poolSlots[i].busy && !poolSlots[i].isBossSlot) return poolSlots[i];
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

    const scale = slot.isBossSlot ? 1.0 : arch.scale || 1.0;
    slot.char.group.scale.setScalar(scale);
    slot.char.group.position.set(clampedPos.x, groundY, clampedPos.z);
    const initialYaw = spawnSpec.rotY ?? Math.atan2(-clampedPos.x, -clampedPos.z);
    slot.char.group.rotation.y = initialYaw;
    slot.char.group.visible = !frozenShotId;
    slot.char.mixer.timeScale = 1.0;
    let spawnAnimTimer = 0.48;
    if (spawnSpec.dormant) {
      const pose = spawnSpec.dormant === 'standing' ? 'Skeletons_Inactive_Standing_Pose' : 'Skeletons_Inactive_Floor_Pose';
      safePlay(slot.char, pose, { loop: true, fade: 0, force: true }, 'idle');
      spawnAnimTimer = 0;
    } else if (arch.isBoss) {
      safePlay(slot.char, 'Flexing', { loop: false, fade: 0.08, timeScale: 1.6, force: true }, 'spawn');
      spawnAnimTimer = 1.6;
    } else if (arch.reassembles) {
      safePlay(slot.char, 'Skeletons_Spawn_Ground', { loop: false, fade: 0.05, timeScale: 2.0, force: true }, 'spawn');
      spawnAnimTimer = 1.5;
    } else {
      slot.char.play('spawn', { loop: false, fade: 0.08, timeScale: 1.35, force: true });
    }

    const orbitSign = (nextInstanceSeq % 2 === 0 ? 1 : -1) * (0.75 + (nextInstanceSeq % 3) * 0.18);

    const enemy = {
      instanceId: spawnSpec.instanceId || `enemy_${nextInstanceSeq++}`,
      archetype: arch.id,
      name: arch.name,
      slotIndex: slot.slotIndex,
      slot,
      char: slot.char,
      group: slot.char.group,
      hp: Math.round(arch.maxHp * actHpScale(arch)),
      maxHp: Math.round(arch.maxHp * actHpScale(arch)),
      dmg: arch.dmg,
      speed: arch.speed,
      attackRange: arch.attackRange,
      windupDuration: arch.windupDuration,
      attackCooldown: arch.attackCooldown,
      telegraphRadius: arch.telegraphRadius,
      radius,
      isRanged: Boolean(arch.isRanged),
      isElite: Boolean(arch.isElite),
      isBoss: Boolean(arch.isBoss),
      aegisTriggerHpRatio: arch.aegisTriggerHpRatio ?? 0.5,
      aegisLayersMax: arch.aegisLayersMax ?? 2,
      aegisDmgReduction: arch.aegisDmgReduction ?? 0.85,
      // Aegis is a phase: it rises at aegisTriggerHpRatio, not at spawn.
      aegisTriggered: false,
      aegisActive: false,
      aegisLayers: 0,
      x: clampedPos.x,
      y: groundY,
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
      spawnAnimTimer,
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
      targetHeroId: 'Knight',
      // Encounter-design state (see combat-balance.js §4b)
      rig: slot.isBossSlot ? 'large' : 'medium',
      attacks: arch.attacks || ['warrior_chop'],
      reassembles: Boolean(arch.reassembles),
      shieldWall: Boolean(arch.shieldWall),
      hunter: Boolean(arch.hunter),
      summons: Boolean(arch.summons),
      wards: Boolean(arch.wards),
      rallies: Boolean(arch.rallies),
      attack: null,
      lastAttackId: null,
      stateTimer: 0,
      shieldUp: false,
      shieldDownTimer: 0,
      blockedHits: 0,
      counterReady: false,
      dodgeCooldown: 0,
      summonCooldown: 5.0 + (slot.slotIndex % 3),
      eruptionCooldown: 4.0,
      wardCooldown: 4.0,
      rallyCooldown: 6.0,
      rallyTimer: 0,
      tauntCooldown: 2.0 + (slot.slotIndex % 4),
      invulnTimer: 0,
      isPile: false,
      pileTimer: 0,
      behaviour: 'strafe',
      behaviourTimer: 0.6 + (slot.slotIndex % 3) * 0.4,
      phase: 'p1',
      downTimer: 0,
      rising: false,
      lastContact: null,
      wakeRadius: spawnSpec.wakeRadius ?? 6.5,
      tokenIneligible: false,
    };
    initPoise(enemy, arch.poise || 0);
    if (spawnSpec.dormant) {
      enemy.aiState = 'dormant';
      enemy.dormantKind = spawnSpec.dormant;
      enemy.tokenIneligible = true;
    } else if (spawnAnimTimer > 0.6) {
      enemy.aiState = 'awakening';
      enemy.stateTimer = spawnAnimTimer;
      enemy.tokenIneligible = true;
    }

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

    // One pass over the queue: specs whose rig is still busy are re-queued, not retried forever.
    const pending = spawnQueue;
    spawnQueue = [];
    for (let i = 0; i < pending.length; i++) {
      if (activeEnemies.length >= MAX_CONCURRENT_ENEMIES) {
        spawnQueue.push(pending[i]);
      } else {
        spawnImmediateFromSpec(pending[i]);
      }
    }
  }

  function clearAllEnemies() {
    spawnQueue = [];
    activeEnemies = [];
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

  const LOCO_FALLBACK = {
    Skeletons_Walking: 'walk',
    Walking_A: 'walk',
    Running_A: 'run',
    Running_Strafe_Left: 'walk',
    Running_Strafe_Right: 'walk',
    Walking_Backwards: 'walk',
    Melee_Blocking: 'idle',
  };

  /**
   * Looping locomotion with stride matching: the clip's timeScale follows the enemy's actual
   * ground speed / the clip's native stride so feet don't slide. Accepts semantic keys too.
   */
  function playEnemyLocomotion(enemy, clipKey, groundSpeed = null) {
    if (enemy.dead || enemy.spawnAnimTimer > 0 || enemy.attackAnimTimer > 0) return;
    const mixerScale = Math.max(0.05, enemy.char.mixer.timeScale || 1.0);
    const scale = enemy.group.scale.x || 1.0;
    const clipName = enemy.char.resolveClipName?.(clipKey) || clipKey;
    const ts =
      groundSpeed === null
        ? 1.0
        : strideTimeScale(clipName, groundSpeed, { rig: enemy.rig, scale }) / mixerScale;
    if (enemy.char.anim.currentKey === clipKey && enemy.locoAction) {
      enemy.locoAction.setEffectiveTimeScale?.(ts);
      return;
    }
    if (enemy.char.anim.currentKey === clipKey) return;
    enemy.locoAction = safePlay(enemy.char, clipKey, { loop: true, fade: 0.18, timeScale: ts }, LOCO_FALLBACK[clipKey] || 'idle');
  }

  function actHpScale(arch) {
    if (arch.isBoss) return BOSS_HP_SCALE;
    return ACT_HP_SCALE[currentActId] ?? 1.0;
  }

  function markEnemyDeadAndNotify(e, result = {}) {
    if (e.deathTimer > 0) return;
    e.dead = true;
    e.hasAttackToken = false;
    e.aiState = 'dead';
    e.windupTimer = 0;
    e.telegraphProgress = 0;
    const deathAction = e.char.play('downed', { loop: false, fade: 0.08, force: true });
    // Hold the slot until the native death clip has played out.
    const clipDur = deathAction?.getClip?.()?.duration || 0;
    e.deathTimer = clamp(clipDur + 0.2, 0.58, 2.4);
    if (onEnemyKilled && !e.xpAwarded) {
      e.xpAwarded = true;
      onEnemyKilled(e, result);
    }
  }

  function noDamageResult(extra = {}) {
    return { damageDealt: 0, killed: false, detonation: null, aegisRaised: false, aegisBroken: false, ...extra };
  }

  function applyHitToEnemy(enemy, hitSpec = {}) {
    if (!enemy || enemy.dead || !enemy.active) return null;

    if (enemy.aiState === 'dormant') wakeEnemy(enemy);

    // Bone piles ignore physical hits; detonations / Mage spells finish them for good.
    if (enemy.isPile) {
      if (!isPileFinisher(hitSpec, null)) return noDamageResult({ pileImmune: true });
      finishPile(enemy, hitSpec);
      return noDamageResult({ killed: true, finishedPile: true });
    }

    const pre = resolvePreHit(enemy, hitSpec);
    if (pre === 'dodge') {
      enemyDodge(enemy, hitSpec.attackerPos, 'side');
      return noDamageResult({ dodged: true });
    }
    if (pre === 'blocked') {
      enemy.blockedHits++;
      if (enemy.blockedHits >= SHIELD_BASH_AFTER_BLOCKS) {
        enemy.blockedHits = 0;
        enemy.counterReady = true;
      }
      enemy.hitstopTimer = Math.max(enemy.hitstopTimer, 0.03);
      enemy.attackAnimTimer = 0.3;
      safePlay(enemy.char, 'Melee_Block_Hit', { loop: false, fade: 0.05, force: true }, 'hit_A');
      enemy.char.mixer.timeScale = 0.05;
      return noDamageResult({ blocked: true });
    }
    if (pre === 'pierce' || pre === 'guardbreak') {
      enemy.shieldUp = false;
      enemy.shieldDownTimer = 3.0;
    }

    const hpBefore = enemy.hp;
    const result = applyHitAndResolveDetonation(enemy, hitSpec, activeEnemies);
    if (enemy.invulnTimer > 0) {
      if (result.detonation) {
        enemy.invulnTimer = 0; // Necromancer wards break on detonation
      } else {
        enemy.hp = hpBefore;
        enemy.dead = false;
        result.damageDealt = 0;
        result.killed = false;
        result.warded = true;
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

    if (enemy.isBoss && result.aegisRaised) bossAegisRoar(enemy);
    if (enemy.isBoss && result.aegisBroken && !enemy.aegisActive) bossDownWindow(enemy);

    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if ((e.dead || e.hp <= 0) && e.deathTimer <= 0 && !e.isPile) {
        const finisher = e === enemy ? isPileFinisher(hitSpec, result) : Boolean(result.detonation);
        if (e.reassembles && !finisher) {
          collapseToPile(e);
        } else {
          markEnemyDeadAndNotify(e, result);
        }
      }
    }

    if (!enemy.dead && !enemy.isPile && result.damageDealt > 0) {
      let reaction = resolvePostHit(enemy, hitSpec, result.damageDealt);
      if (pre === 'guardbreak') reaction = 'stagger';
      if (enemy.aiState === 'down' || enemy.aiState === 'roar') reaction = 'none';
      if (reaction === 'interrupt' || reaction === 'stagger') {
        const secs =
          reaction === 'interrupt' && !enemy.isElite && !enemy.isBoss
            ? STAGGER_SECONDS.trash
            : enemy.isBoss
              ? STAGGER_SECONDS.boss
              : enemy.isElite
                ? STAGGER_SECONDS.elite
                : STAGGER_SECONDS.trash;
        enterStagger(enemy, secs, (enemy.slotIndex + Math.round(enemy.hp)) % 2 ? 'Hit_B' : 'Hit_A');
      } else if (reaction === 'flinch' && enemy.aiState === 'orbit') {
        enemy.attackAnimTimer = 0.32;
        safePlay(enemy.char, enemy.slotIndex % 2 ? 'Hit_B' : 'Hit_A', { loop: false, fade: 0.06, force: true }, 'hit_A');
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
    maxTargets = 99,
    hitSpec = {},
  } = {}) {
    if (!origin) return [];
    const hits = [];
    const candidates = [];

    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (!e || e.dead || e.hp <= 0 || !e.active) continue;
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

  /* ----------------------------------------------------------------------- */
  /* Encounter behaviours (2026-11-09 combat encounter design)                */
  /* ----------------------------------------------------------------------- */
  const TOKENLESS_STATES = new Set(['dormant', 'awakening', 'pile', 'stagger', 'down', 'roar', 'cast']);
  const STANDOFF_BEHAVIOURS = ['strafe', 'backoff', 'strafe', 'flank', 'taunt'];
  let simTime = 0;
  let rngState = 0x2f6b1d;
  const windupLog = [];
  const knightBlock = { active: false, startAt: -99 };
  let onParryHandler = null;
  let onWindupHandler = null;
  const decals = [];
  for (let i = 0; i < 4; i++) {
    const mesh = createPetalCrackDecal();
    rootGroup.add(mesh);
    decals.push({ mesh, owner: null, ttl: 0 });
  }

  function rand() {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 4294967296;
  }

  function acquireDecal(x, z, radius) {
    const d = decals.find((it) => !it.owner && it.ttl <= 0);
    if (!d) return null;
    d.owner = true;
    d.mesh.position.set(x, walkableHeightAt(x, z) + 0.035, z);
    d.mesh.scale.set(radius, radius, 1);
    d.mesh.material.uniforms.uProgress.value = 0;
    d.mesh.visible = true;
    return d;
  }

  function releaseDecal(d) {
    d.owner = null;
    d.ttl = 0;
    d.mesh.visible = false;
  }

  function cancelAttack(e) {
    if (e.attack?.decal) releaseDecal(e.attack.decal);
    e.attack = null;
    e.windupTimer = 0;
    e.telegraphProgress = 0;
  }

  function enterStagger(e, secs, clip = 'Hit_A') {
    cancelAttack(e);
    e.aiState = 'stagger';
    e.stateTimer = secs;
    e.attackAnimTimer = 0;
    e.shieldUp = false;
    e.hasAttackToken = false;
    safePlay(e.char, clip, { loop: false, fade: 0.05, force: true }, 'hit_A');
  }

  function wakeEnemy(e) {
    if (e.aiState !== 'dormant') return;
    const clip = e.dormantKind === 'standing' ? 'Skeletons_Awaken_Standing' : 'Skeletons_Awaken_Floor';
    safePlay(e.char, clip, { loop: false, fade: 0.1, timeScale: 1.25, force: true }, 'spawn');
    e.aiState = 'awakening';
    e.stateTimer = clipSeconds(e.char, clip) / 1.25;
    e.cooldownTimer = Math.max(e.cooldownTimer, 0.6);
    // One sleeper waking rouses its neighbours so the ambush springs together.
    for (let i = 0; i < activeEnemies.length; i++) {
      const o = activeEnemies[i];
      if (o !== e && o.aiState === 'dormant' && Math.hypot(o.x - e.x, o.z - e.z) < 5.5) wakeEnemy(o);
    }
  }

  function collapseToPile(e) {
    cancelAttack(e);
    e.dead = false;
    e.hp = 1;
    e.isPile = true;
    e.aiState = 'pile';
    e.pileTimer = MINION_REASSEMBLE_SECONDS;
    e.pileFrozen = false;
    e.hasAttackToken = false;
    e.tokenIneligible = true;
    e.mark = null;
    e.burnTimer = 0;
    safePlay(e.char, 'Skeletons_Death', { loop: false, fade: 0.08, force: true }, 'downed');
  }

  function finishPile(e, hitSpec = {}) {
    e.isPile = false;
    e.hp = 0;
    e.dead = true;
    e.pileFrozen = hitSpec.spellId === 'frost_lance';
    e.hasAttackToken = false;
    e.aiState = 'dead';
    // Frozen piles linger a moment as ice-locked bones; Cinder Fall / detonations scatter them.
    e.deathTimer = e.pileFrozen ? 1.2 : 0.45;
    if (onEnemyKilled && !e.xpAwarded) {
      e.xpAwarded = true;
      onEnemyKilled(e, { killed: true, source: hitSpec.source, finishedPile: true });
    }
  }

  function reassemble(e) {
    e.isPile = false;
    e.hp = Math.round(e.maxHp * 0.5);
    e.aiState = 'awakening';
    safePlay(e.char, 'Skeletons_Death_Resurrect', { loop: false, fade: 0.06, timeScale: 1.3, force: true }, 'spawn');
    e.stateTimer = clipSeconds(e.char, 'Skeletons_Death_Resurrect') / 1.3;
  }

  function enemyDodge(e, fromPos, kind = 'side') {
    let clip;
    let sx;
    let sz;
    if (kind === 'back') {
      clip = 'Dodge_Backward';
      sx = -Math.sin(e.yaw);
      sz = -Math.cos(e.yaw);
    } else {
      const left = rand() < 0.5;
      clip = left ? 'Dodge_Left' : 'Dodge_Right';
      // Character-left for a +Z-facing rig is +X rotated by yaw.
      sx = Math.cos(e.yaw) * (left ? 1 : -1);
      sz = -Math.sin(e.yaw) * (left ? 1 : -1);
    }
    e.vx = sx * 8.5;
    e.vz = sz * 8.5;
    e.dodgeCooldown = kind === 'back' ? 3.0 : ROGUE_DODGE_COOLDOWN;
    e.attackAnimTimer = 0.4;
    safePlay(e.char, clip, { loop: false, fade: 0.04, force: true }, 'dodge');
  }

  function parryEnemy(e) {
    enterStagger(e, e.isBoss ? STAGGER_SECONDS.boss : STAGGER_SECONDS.parry, 'Hit_B');
    e.hitstopTimer = Math.max(e.hitstopTimer, 0.09);
    e.char.mixer.timeScale = 0.05;
    e.lastContact = null;
    e.parriedCount = (e.parriedCount || 0) + 1;
    onParryHandler?.(e);
  }

  /**
   * Knight block edge from the campaign loop. Raising the shield within PARRY_WINDOW after an
   * enemy contact frame is a late parry (the pre-contact half is checked at the contact frame).
   */
  function notifyKnightBlock(active) {
    const was = knightBlock.active;
    knightBlock.active = Boolean(active);
    if (!knightBlock.active || was) return 0;
    knightBlock.startAt = simTime;
    let n = 0;
    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      const c = e.lastContact;
      if (!c || e.dead || c.heroId !== 'Knight' || !c.blockable) continue;
      if (isParryTiming(simTime, c.t, PARRY_WINDOW)) {
        parryEnemy(e);
        n++;
      }
    }
    return n;
  }

  function startCast(e, clip, castFrac, effect, timeScale = 1.0, fallback = 'cast_spell') {
    cancelAttack(e);
    const dur = clipSeconds(e.char, clip) / timeScale;
    e.aiState = 'cast';
    e.stateTimer = dur;
    e.castAt = dur * (1 - castFrac);
    e.castEffect = effect;
    e.shieldUp = false;
    safePlay(e.char, clip, { loop: false, fade: 0.1, force: true, timeScale }, fallback);
  }

  function aliveCount(pred) {
    let n = 0;
    for (let i = 0; i < activeEnemies.length; i++) {
      const o = activeEnemies[i];
      if (o.active && !o.dead && pred(o)) n++;
    }
    return n;
  }

  function freeSlotFor(role) {
    return poolSlots.some((s) => !s.busy && s.poolRole === role);
  }

  function summonMinions(e) {
    for (let k = 0; k < 2; k++) {
      const a = e.yaw + (k ? 0.9 : -0.9);
      spawnImmediateFromSpec({ archetype: 'minion', x: e.x + Math.sin(a) * 2.2, z: e.z + Math.cos(a) * 2.2 });
    }
  }

  function bossAegisRoar(e) {
    cancelAttack(e);
    e.aiState = 'roar';
    safePlay(e.char, 'Flexing', { loop: false, fade: 0.1, force: true, timeScale: 1.4 }, 'spawn');
    e.stateTimer = clipSeconds(e.char, 'Flexing') / 1.4;
    const adds = [
      { archetype: 'necromancer', dx: 3.8, dz: -3.0 },
      { archetype: 'minion', dx: -3.4, dz: 2.2 },
      { archetype: 'minion', dx: 3.0, dz: 2.6 },
    ];
    for (const s of adds) spawnImmediateFromSpec({ archetype: s.archetype, x: e.x + s.dx, z: e.z + s.dz });
  }

  function bossDownWindow(e) {
    cancelAttack(e);
    e.aiState = 'down';
    e.downTimer = BOSS_DOWN_WINDOW;
    e.rising = false;
    safePlay(e.char, 'Death_A', { loop: false, fade: 0.12, force: true }, 'downed');
  }

  function updateAttackAim(e, target) {
    const a = e.attack;
    const atk = a.atk;
    a.aimX = target.x;
    a.aimZ = target.z;
    if (atk.area) {
      if (atk.areaAtTarget) {
        a.areaX = target.x;
        a.areaZ = target.z;
      } else {
        const off = (atk.areaOffset || 0) * (e.group.scale.x || 1);
        a.areaX = e.x + Math.sin(e.yaw) * off;
        a.areaZ = e.z + Math.cos(e.yaw) * off;
      }
      e.telegraphX = a.areaX;
      e.telegraphZ = a.areaZ;
      if (a.decal) a.decal.mesh.position.set(a.areaX, walkableHeightAt(a.areaX, a.areaZ) + 0.035, a.areaZ);
    } else {
      e.telegraphX = atk.ranged ? target.x : e.x + Math.sin(e.yaw) * atk.range * 0.55;
      e.telegraphZ = atk.ranged ? target.z : e.z + Math.cos(e.yaw) * atk.range * 0.55;
    }
  }

  function startAttack(e, atkId, target) {
    const atk = ENEMY_ATTACKS[atkId];
    if (!atk) return false;
    const speed = e.isBoss && e.phase === 'p3' ? BOSS_P3_SPEED : 1.0;
    const dur = clipSeconds(e.char, atk.clip);
    const tl = attackTimeline(atk, dur, speed);
    e.attack = { id: atkId, atk, dur, tl, clipT: 0, t: 0, contactIdx: 0, speed, recoverT: 0, decal: null, action: null, targetHeroId: target.id || e.targetHeroId };
    e.aiState = 'windup';
    e.windupTimer = 0;
    e.windupDuration = tl.contactTimes[0];
    e.telegraphProgress = 0.02;
    e.telegraphRadius = atk.radius || atk.range;
    e.shieldUp = false;
    e.lastAttackId = atkId;
    e.attackAnimTimer = 0;
    e.attack.action = safePlay(
      e.char,
      atk.clip,
      { loop: false, fade: 0.1, force: true, timeScale: (atk.windupSlow ?? 1) * speed },
      e.isBoss ? 'charged' : 'combo1'
    );
    updateAttackAim(e, target);
    if (atk.area && !atk.noDecal) e.attack.decal = acquireDecal(e.attack.areaX, e.attack.areaZ, atk.radius);
    recordWindup(windupLog, e.attack.targetHeroId, simTime);
    onWindupHandler?.(e, atkId, atk);
    return true;
  }

  function resolveContact(e, idx, knight, mage) {
    const a = e.attack;
    const atk = a.atk;
    if (a.decal) {
      a.decal.mesh.material.uniforms.uProgress.value = 1;
      a.decal.owner = null;
      a.decal.ttl = 0.3;
      a.decal = null;
    }
    const heroes = [knight, mage];
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (!h || h.downed || (h.iframeTimer || 0) > 0) continue;
      const hid = h.id || (i === 0 ? 'Knight' : 'Mage');
      let hit;
      if (atk.area) hit = Math.hypot(h.x - a.areaX, h.z - a.areaZ) <= atk.radius + 0.35;
      else if (atk.ranged) hit = hid === a.targetHeroId && Math.hypot(h.x - a.aimX, h.z - a.aimZ) <= atk.aimRadius;
      else hit = isInAttackArc(e, e.yaw, h, atk.range * (e.group.scale.x || 1) + 0.35, atk.arcDeg);
      if (!hit) continue;
      const blockable = atk.blockable !== false;
      if (hid === 'Knight' && blockable && knightBlock.active && isParryTiming(knightBlock.startAt, simTime)) {
        parryEnemy(e);
        return;
      }
      e.lastContact = { heroId: hid, t: simTime, blockable };
      if (onPlayerHit) {
        const dmgReduction = clamp(e.iceSlowFactor || 0, 0, ICE_DAMAGE_REDUCTION_CAP);
        const dmg = Math.max(1, Math.round(atk.dmg * (1.0 - dmgReduction)));
        // Read by campaign-loop handlePlayerHit (unblockable Captain chop etc.).
        e.currentHit = { attackId: a.id, contactIdx: idx, unblockable: !blockable, area: Boolean(atk.area) };
        onPlayerHit(h, e, dmg);
        e.currentHit = null;
      }
    }
  }

  function tickAttack(e, dt, target, knight, mage) {
    const a = e.attack;
    const m = Math.max(0, e.char.mixer.timeScale ?? 1);
    if (e.aiState === 'recover') {
      a.recoverT -= dt * m;
      if (a.recoverT <= 0) {
        cancelAttack(e);
        e.aiState = 'orbit';
        e.cooldownTimer = e.attackCooldown * (0.8 + rand() * 0.4) * (e.isBoss && e.phase === 'p3' ? 0.7 : 1.0);
      }
      return;
    }
    const r = advanceAttackClip(a.atk, a.dur, a.clipT, dt * m, a.speed);
    a.clipT = r.clipT;
    a.t += dt * m;
    a.action?.setEffectiveTimeScale?.(r.timeScale);
    e.windupTimer = a.t;
    e.telegraphProgress = clamp(a.t / Math.max(0.01, a.tl.contactTimes[0]), 0, 1);
    if (a.contactIdx === 0 && a.clipT < a.tl.slowEndClip && target) updateAttackAim(e, target);
    if (a.decal) a.decal.mesh.material.uniforms.uProgress.value = e.telegraphProgress;
    if (a.atk.lunge && a.contactIdx === 0 && target && a.clipT >= a.tl.slowEndClip - 0.25) {
      const d = Math.hypot(target.x - e.x, target.z - e.z);
      if (d > 1.3) {
        const step = Math.min(d - 1.2, 7.5 * dt * m);
        const np = applyEnemySpatialConstraints(e.x + ((target.x - e.x) / d) * step, e.z + ((target.z - e.z) / d) * step, e.radius);
        e.x = np.x;
        e.z = np.z;
      }
    }
    for (let i = 0; i < r.crossed.length; i++) {
      if (!e.attack) return; // parried
      resolveContact(e, r.crossed[i], knight, mage);
      if (e.attack) e.attack.contactIdx = r.crossed[i] + 1;
    }
    if (e.attack && r.finished) {
      e.aiState = 'recover';
      e.attack.recoverT = a.atk.recovery ?? 0.4;
    }
  }

  function chooseAttack(e, dist) {
    const sc = e.group.scale.x || 1;
    if (e.isBoss) {
      const id = selectBossAttack(e.phase, rand(), e.lastAttackId);
      if (dist <= ENEMY_ATTACKS[id].range * 0.9) return id;
      return dist <= ENEMY_ATTACKS.boss_2h.range * 0.9 ? 'boss_2h' : null;
    }
    const ok = e.attacks.filter((id) => {
      const atk = ENEMY_ATTACKS[id];
      if (!atk) return false;
      if (atk.cooldown && e.eruptionCooldown > 0) return false;
      if (atk.lunge) return dist >= atk.minDist && dist <= atk.lunge + atk.range;
      const reach = atk.area && !atk.areaAtTarget ? atk.radius : atk.range;
      return dist <= reach * sc * 0.92;
    });
    if (!ok.length) return null;
    let id = ok.find((x) => ENEMY_ATTACKS[x].cooldown) || ok.find((x) => ENEMY_ATTACKS[x].lunge);
    if (!id) {
      const pool = ok.length > 1 ? ok.filter((x) => x !== e.lastAttackId) : ok;
      id = pool[Math.floor(rand() * pool.length)];
    }
    if (ENEMY_ATTACKS[id].cooldown) e.eruptionCooldown = ENEMY_ATTACKS[id].cooldown;
    return id;
  }

  function moveBy(e, vx, vz, dt) {
    const np = applyEnemySpatialConstraints(e.x + vx * dt, e.z + vz * dt, e.radius);
    const moved = Math.hypot(np.x - e.x, np.z - e.z) / Math.max(1e-4, dt);
    e.x = np.x;
    e.z = np.z;
    e.y = walkableHeightAt(e.x, e.z);
    return moved;
  }

  function preferredRange(e) {
    if (e.isRanged) return e.attackRange * 0.8;
    const atk = ENEMY_ATTACKS[e.attacks.find((id) => !ENEMY_ATTACKS[id]?.lunge) || e.attacks[0]];
    return Math.max(1.4, (atk?.range || e.attackRange) * (e.group.scale.x || 1) * 0.8);
  }

  function approach(e, dt, dist, dirX, dirZ, mv) {
    const want = preferredRange(e);
    const walkClip = e.reassembles ? 'Skeletons_Walking' : 'Walking_A';
    if (dist > want) {
      let speed;
      let clip;
      if (e.shieldWall && e.shieldDownTimer <= 0 && dist < 7) {
        e.shieldUp = true;
        speed = 1.0 * mv;
        clip = 'Melee_Blocking';
      } else {
        e.shieldUp = false;
        const run = dist > 4.5;
        speed = (run ? e.speed : 1.6) * mv;
        clip = run ? 'Running_A' : walkClip;
      }
      const step = Math.min(dist - want * 0.95, speed * dt);
      const moved = moveBy(e, dirX * (step / dt), dirZ * (step / dt), dt);
      playEnemyLocomotion(e, clip, moved);
    } else {
      e.shieldUp = e.shieldWall && e.shieldDownTimer <= 0;
      playEnemyLocomotion(e, e.shieldUp ? 'Melee_Blocking' : 'idle');
    }
  }

  function standoff(e, dt, target, dist, dirX, dirZ, mv) {
    e.shieldUp = e.shieldWall && e.shieldDownTimer <= 0;
    if (e.isRanged && dist < 5.0) {
      const moved = moveBy(e, -dirX * 1.4 * mv, -dirZ * 1.4 * mv, dt);
      playEnemyLocomotion(e, 'Walking_Backwards', moved);
      return;
    }
    if (e.shieldUp) {
      // Shield wall holds formation: slow guarded advance to the standoff ring.
      if (dist > e.standoffDist + 0.4) {
        const moved = moveBy(e, dirX * 0.9 * mv, dirZ * 0.9 * mv, dt);
        playEnemyLocomotion(e, 'Melee_Blocking', moved);
      } else {
        playEnemyLocomotion(e, 'Melee_Blocking');
      }
      return;
    }
    e.behaviourTimer -= dt;
    if (e.behaviourTimer <= 0) {
      e.behaviourIdx = (e.behaviourIdx || 0) + 1;
      e.behaviour = STANDOFF_BEHAVIOURS[(e.behaviourIdx + e.slotIndex) % STANDOFF_BEHAVIOURS.length];
      e.behaviourTimer = 1.2 + rand() * 1.4;
      if (e.behaviour === 'strafe' && rand() < 0.35) e.orbitSpeed = -e.orbitSpeed;
    }
    if (e.behaviour === 'taunt') {
      e.behaviour = 'strafe';
      if (e.tauntCooldown <= 0 && !e.isBoss && dist > 2.5) {
        e.tauntCooldown = 7.0;
        startCast(e, 'Skeletons_Taunt', 0, null, 1.0, 'idle');
        return;
      }
    }
    if (e.behaviour === 'backoff') {
      if (dist < e.standoffDist + 1.5) {
        const moved = moveBy(e, -dirX * 1.3 * mv, -dirZ * 1.3 * mv, dt);
        playEnemyLocomotion(e, 'Walking_Backwards', moved);
      } else {
        playEnemyLocomotion(e, 'idle');
      }
      return;
    }
    let sign = e.orbitSpeed >= 0 ? 1 : -1;
    if (e.behaviour === 'flank' && Number.isFinite(target.yaw)) {
      // Circle toward the hero's back.
      const bx = target.x - Math.sin(target.yaw) * 2.0 - e.x;
      const bz = target.z - Math.cos(target.yaw) * 2.0 - e.z;
      sign = -dirZ * bx + dirX * bz >= 0 ? 1 : -1;
    }
    const radial = clamp((dist - e.standoffDist) * 1.5, -1.5, 1.5);
    const tang = (e.behaviour === 'flank' ? 3.0 : 2.3) * mv;
    const vx = dirX * radial * mv + -dirZ * sign * tang;
    const vz = dirZ * radial * mv + dirX * sign * tang;
    const moved = moveBy(e, vx, vz, dt);
    if (e.isBoss) {
      playEnemyLocomotion(e, 'Walking_A', moved);
      return;
    }
    // Character-right for a +Z-facing rig is -X rotated by yaw.
    const rightDot = vx * -Math.cos(e.yaw) + vz * Math.sin(e.yaw);
    playEnemyLocomotion(e, rightDot >= 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left', moved);
  }

  function thinkOrbit(e, dt, target, dist, dirX, dirZ, slowMult) {
    if (e.attack) cancelAttack(e);
    const mv = slowMult * (e.rallyTimer > 0 ? CAPTAIN_RALLY_SPEED_MULT : 1.0);
    if (e.isBoss) e.phase = bossPhaseFor(e.hp / Math.max(1, e.maxHp), e.aegisTriggered);
    const heroId = target.id || 'Knight';

    if (e.counterReady && dist <= ENEMY_ATTACKS.shield_bash.range + 0.6) {
      e.counterReady = false;
      startAttack(e, 'shield_bash', target);
      return;
    }
    if (e.wards && e.dodgeCooldown <= 0 && dist < 3.2) {
      enemyDodge(e, target, 'back');
      return;
    }
    if (
      e.summons &&
      e.summonCooldown <= 0 &&
      aliveCount((o) => o.archetype === 'minion') < 3 &&
      freeSlotFor('Skeleton_Minion') &&
      activeEnemies.length < MAX_CONCURRENT_ENEMIES
    ) {
      e.summonCooldown = MAGE_SUMMON_COOLDOWN;
      startCast(e, 'Ranged_Magic_Summon', 0.5, () => summonMinions(e), 1.6);
      return;
    }
    if (e.wards && e.wardCooldown <= 0) {
      const ally = activeEnemies.find(
        (o) => o.active && !o.dead && !o.isPile && (o.shieldWall || o.archetype === 'captain') && o.invulnTimer <= 0 && Math.hypot(o.x - e.x, o.z - e.z) < 12
      );
      if (ally) {
        e.wardCooldown = 9.0;
        startCast(e, 'Ranged_Magic_Raise', 0.55, () => {
          if (ally.active && !ally.dead) ally.invulnTimer = NECRO_WARD_SECONDS;
        }, 1.4);
        return;
      }
    }
    if (e.rallies && !e.hasAttackToken && e.rallyCooldown <= 0) {
      e.rallyCooldown = 16.0;
      startCast(e, 'Skeletons_Taunt_Longer', 0.5, () => {
        for (let i = 0; i < activeEnemies.length; i++) {
          const o = activeEnemies[i];
          if (o.active && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < 12) o.rallyTimer = CAPTAIN_RALLY_SECONDS;
        }
      }, 1.5, 'idle');
      return;
    }

    if (e.hasAttackToken) {
      if (e.cooldownTimer <= 0) {
        const atkId = chooseAttack(e, dist);
        if (atkId && canStartWindup(windupLog, heroId, simTime)) {
          startAttack(e, atkId, target);
          return;
        }
      }
      approach(e, dt, dist, dirX, dirZ, mv);
      return;
    }
    standoff(e, dt, target, dist, dirX, dirZ, mv);
  }

  function thinkEnemy(e, dt, target, slowMult, knight, mage) {
    const dx = target.x - e.x;
    const dz = target.z - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    const dirX = dx / dist;
    const dirZ = dz / dist;

    let turnRate = 10;
    switch (e.aiState) {
      case 'dormant': {
        const near = [knight, mage].some((h) => h && !h.downed && Math.hypot(h.x - e.x, h.z - e.z) < e.wakeRadius);
        if (near) wakeEnemy(e);
        return;
      }
      case 'awakening':
      case 'stagger':
      case 'roar':
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) e.aiState = 'orbit';
        turnRate = e.aiState === 'roar' ? 2 : 0;
        break;
      case 'pile':
        if (tickBonePile(e, dt) === 'reassemble') reassemble(e);
        return;
      case 'down':
        e.downTimer -= dt;
        if (!e.rising && e.downTimer <= 1.0) {
          // Rise: Death_A reversed back to standing.
          e.rising = true;
          const dur = clipSeconds(e.char, 'Death_A');
          safePlay(e.char, 'Death_A', { loop: false, fade: 0.05, force: true, timeScale: -dur / 1.0, startTime: dur - 0.001 }, 'idle');
        }
        if (e.downTimer <= 0) {
          e.aiState = 'orbit';
          e.cooldownTimer = 0.8;
        }
        return;
      case 'cast':
        e.stateTimer -= dt;
        if (e.castEffect && e.stateTimer <= e.castAt) {
          const fx = e.castEffect;
          e.castEffect = null;
          fx();
        }
        if (e.stateTimer <= 0) e.aiState = 'orbit';
        turnRate = 4;
        break;
      case 'windup':
      case 'recover':
        if (!e.attack) {
          e.aiState = 'orbit';
          break;
        }
        turnRate = e.aiState === 'windup' && e.attack.contactIdx === 0 && e.attack.clipT < e.attack.tl.slowEndClip ? 5 : 0;
        tickAttack(e, dt, target, knight, mage);
        break;
      default:
        thinkOrbit(e, dt, target, dist, dirX, dirZ, slowMult);
    }
    if (turnRate > 0) {
      e.yaw += shortestAngleDiff(Math.atan2(dx, dz), e.yaw) * Math.min(1, turnRate * dt * slowMult);
    }
  }

  function update(dt, heroStates = {}, camera = null) {
    telegraphRingMesh.visible = false;
    telegraphRingMesh.count = 0;

    if (!frozenShotId) simTime += dt;
    for (let i = 0; i < decals.length; i++) {
      const d = decals[i];
      if (frozenShotId) {
        d.mesh.visible = false;
      } else if (!d.owner && d.ttl > 0) {
        d.ttl -= dt;
        if (d.ttl <= 0) d.mesh.visible = false;
      }
    }

    if (frozenShotId) {
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
      e.dodgeCooldown = Math.max(0, e.dodgeCooldown - dt);
      e.summonCooldown = Math.max(0, e.summonCooldown - dt);
      e.eruptionCooldown = Math.max(0, e.eruptionCooldown - dt);
      e.wardCooldown = Math.max(0, e.wardCooldown - dt);
      e.rallyCooldown = Math.max(0, e.rallyCooldown - dt);
      e.rallyTimer = Math.max(0, e.rallyTimer - dt);
      e.invulnTimer = Math.max(0, e.invulnTimer - dt);
      e.tauntCooldown = Math.max(0, e.tauntCooldown - dt);
      e.shieldDownTimer = Math.max(0, e.shieldDownTimer - dt);
      tickPoise(e, dt);
      e.tokenIneligible = TOKENLESS_STATES.has(e.aiState);

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
      if (knight && mage) {
        if (knight.downed && !mage.downed) targetHero = mage;
        else if (mage.downed && !knight.downed) targetHero = knight;
        else {
          const dk = Math.hypot(e.x - knight.x, e.z - knight.z);
          const dm = Math.hypot(e.x - mage.x, e.z - mage.z);
          targetHero = dm + 1.2 < dk ? mage : knight;
        }
      }
      if (e.hunter) targetHero = selectHuntTarget(e, knight, mage) || targetHero;
      if (targetHero) {
        e.targetHeroId = targetHero.id || 'Knight';
        e.distToTarget = Math.hypot(e.x - targetHero.x, e.z - targetHero.z);
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
        thinkEnemy(e, dt, targetHero, slowMult, knight, mage);
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
          const clampedE = applyEnemySpatialConstraints(e.x + nx, e.z + nz, e.radius);
          const clampedO = applyEnemySpatialConstraints(o.x - nx, o.z - nz, o.radius);
          e.x = clampedE.x;
          e.z = clampedE.z;
          o.x = clampedO.x;
          o.z = clampedO.z;
        }
      }

      const finalClamped = applyEnemySpatialConstraints(e.x, e.z, e.radius);
      e.x = finalClamped.x;
      e.z = finalClamped.z;
      if (e.grounded) {
        e.y = walkableHeightAt(e.x, e.z);
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
    poolSlots,
    get activeEnemies() {
      return activeEnemies;
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
    setCurrentActId(actId) {
      currentActId = actId;
    },
    get simTime() {
      return simTime;
    },
    get areaDecals() {
      return decals.map((d) => d.mesh);
    },
    notifyKnightBlock,
    setOnParry(fn) {
      onParryHandler = typeof fn === 'function' ? fn : null;
    },
    setOnWindup(fn) {
      onWindupHandler = typeof fn === 'function' ? fn : null;
    },
    startAttack,
    wakeEnemy,
    spawnWave,
    spawnImmediateFromSpec,
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
