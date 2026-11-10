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
// - Enforces `MAX_CONCURRENT_ENEMIES = 8` visible rigs (hidden pool slots cost no draw calls or
//   mixer updates) plus `1` shared InstancedMesh for ranged bolts.
// - Encounter design: three-beat attacks (wind-up, contact frame, punishable recovery), poise and
//   stagger, Knight parry, crowd turn-taking, shield-wall elites, bone piles, Rogue/Werewolf hunters,
//   Skeleton Mage / Necromancer casters and the phased Skeleton Golem boss (see combat-balance.js §4b).
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
  SHIELD_COVER_RADIUS,
  ACT_HP_SCALE,
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
  applyPoiseDamage,
  registerMashHit,
  canScheduleContacts,
  scheduleContacts,
  unscheduleContacts,
  contactMoments,
  inKnightFrontArc,
  knightShieldCovers,
  MASH_COUNTER_EXPIRY,
  MASH_WINDOW,
  PARRY_POISE_FRACTION,
  DODGE_OPENING_SECONDS,
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

  // Fixed pool. Indices 0/4/5 are relied on by shot poses (Warrior, Mage, boss); hidden slots
  // cost no draw calls or mixer updates, MAX_CONCURRENT_ENEMIES caps what is visible.
  const creationSpecs = [
    { charId: 'Skeleton_Warrior', poolRole: 'Skeleton_Warrior', isBossSlot: false },
    { charId: 'Skeleton_Warrior', poolRole: 'Skeleton_Warrior', isBossSlot: false },
    { charId: 'Skeleton_Minion', poolRole: 'Skeleton_Minion', isBossSlot: false },
    { charId: 'Skeleton_Rogue', poolRole: 'Skeleton_Rogue', isBossSlot: false },
    { charId: 'Skeleton_Mage', poolRole: 'Skeleton_Mage', isBossSlot: false },
    {
      charId: 'Skeleton_Golem',
      poolRole: 'Skeleton_Golem',
      isBossSlot: true,
      targetHeight: 2.8,
      outlineThickness: 0.015,
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
    {
      charId: 'FrostGolem',
      poolRole: 'FrostGolem',
      isBossSlot: true,
      targetHeight: 2.85,
      outlineThickness: 0.015,
      cellOverrides: BOSS_SOVEREIGN_CELL_OVERRIDES,
    },
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
  const poolByRole = {};
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
    if (!poolByRole[spec.poolRole]) {
      poolByRole[spec.poolRole] = [];
    }
    poolByRole[spec.poolRole].push(slot);
    return slot;
  });

  // `poolSlots` is the 10-slot primary view (shot poses, legacy tests); `allPoolSlots` holds all
  // 19 pre-allocated native archetype rigs, looked up by `poolByRole`.
  const poolSlots = allPoolSlots.slice(0, 10);

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
        const iceMult = 1.0 - clamp(e.iceSlowFactor || 0, 0, 0.25);
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

    const isStringArg = typeof archetypeSpec === 'string';
    const roleKey = isStringArg
      ? archetypeSpec
      : archetypeSpec?.poolRole || archetypeSpec?.charId || 'Skeleton_Warrior';
    const matchingBuckets = poolByRole[roleKey] || poolByCharId[roleKey];
    if (Array.isArray(matchingBuckets)) {
      for (let i = 0; i < matchingBuckets.length; i++) {
        if (!matchingBuckets[i].busy) {
          return matchingBuckets[i];
        }
      }
      // Elites and bosses wait for their own rig; pack units borrow a spare body so a surge never stalls.
      if (!isStringArg && (archetypeSpec?.isBoss || archetypeSpec?.isElite)) return null;
    }

    if (!isStringArg && archetypeSpec?.isBoss) {
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
    let spawnAnimTimer = 0.48;
    if (spawnSpec.dormant) {
      const pose = spawnSpec.dormant === 'standing' ? 'Skeletons_Inactive_Standing_Pose' : 'Skeletons_Inactive_Floor_Pose';
      safePlay(slot.char, pose, { loop: true, fade: 0, force: true }, 'idle');
      spawnAnimTimer = 0;
    } else if (arch.isBoss) {
      safePlay(slot.char, 'Flexing', { loop: false, fade: 0.08, timeScale: 1.6 * globalEnemyTimeScale, force: true }, 'spawn');
      spawnAnimTimer = 1.6;
    } else if (arch.reassembles) {
      safePlay(slot.char, 'Skeletons_Spawn_Ground', { loop: false, fade: 0.05, timeScale: 2.0 * globalEnemyTimeScale, force: true }, 'spawn');
      spawnAnimTimer = 1.5;
    } else {
      slot.char.play('spawn', { loop: false, fade: 0.08, timeScale: 1.35 * globalEnemyTimeScale, force: true });
    }

    const orbitSign = (nextInstanceSeq % 2 === 0 ? 1 : -1) * (1.55 + (nextInstanceSeq % 3) * 0.275);
    const summonCooldownVal = Number(arch.summonCooldown ?? arch.batSummonCooldown ?? 0);
    const maxSummonsVal = Number(arch.maxActiveSummons ?? arch.maxActiveBats ?? 0);
    const initSummonTimer = Number(
      spawnSpec.initialSummonCooldown ?? spawnSpec.initialBatCooldown ?? 0
    );

    const startHp = spawnSpec.maxHp ?? Math.round(arch.maxHp * actHpScale(arch));

    const enemy = {
      instanceId: spawnSpec.instanceId || `enemy_${nextInstanceSeq++}`,
      archetype: arch.id,
      charId: slot.charId,
      name: arch.name,
      slotIndex: slot.slotIndex,
      slot,
      char: slot.char,
      group: slot.char.group,
      hp: startHp,
      maxHp: startHp,
      dmg: arch.dmg,
      speed: arch.speed,
      qEnergyReward: arch.qEnergyReward ?? 20,
      attackRange: arch.attackRange,
      meleeAttackRange: arch.meleeAttackRange ?? 2.8,
      rangedMinDist: arch.rangedMinDist ?? 6.5,
      meleeMaxDist: arch.meleeMaxDist ?? 4.5,
      isHybridRangedMelee: Boolean(arch.isHybridRangedMelee),
      usingRangedMode: Boolean(arch.isRanged || arch.isHybridRangedMelee),
      projectileSpeed: arch.projectileSpeed ?? 14.5,
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
      // Aegis is a phase: it rises at aegisTriggerHpRatio, not at spawn.
      aegisTriggered: false,
      aegisActive: false,
      aegisLayers: 0,
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
      detonationCdTimer: 0,
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
      cooldownTimer: 0.18 + (slot.slotIndex % 3) * 0.12,
      hasAttackToken: false,
      orbitSpeed: orbitSign,
      standoffDist: arch.isRanged
        ? 6.6 + (slot.slotIndex % 2) * 1.1
        : 2.15 + (slot.slotIndex % 3) * 0.32,
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
      // Encounter-design state (see combat-balance.js §4b)
      rig: slot.char.rig || (slot.isBossSlot ? 'large' : 'medium'),
      attacks: arch.attacks || ['warrior_chop'],
      reassembles: Boolean(arch.reassembles),
      shieldWall: Boolean(arch.shieldWall),
      hunter: Boolean(arch.hunter),
      dodges: arch.dodges ?? Boolean(arch.hunter),
      counterAtk: arch.counterAttack || (arch.shieldWall ? 'shield_bash' : null),
      counterTimer: 0,
      mashHits: 0,
      mashLastAt: -99,
      guardCycle: 1.2,
      guarding: true,
      huntFlankSign: 0,
      eruptionHold: 0,
      leapCooldown: 3.0,
      forceLeap: false,
      leapLift: 0,
      flankBias: false,
      summons: Boolean(arch.summons),
      wards: Boolean(arch.wards),
      rallies: Boolean(arch.rallies),
      // Contact damage scales with the archetype's tuned dmg (30 = the reference attack table).
      attackDmgScale: clamp((arch.dmg || 30) / 30, 0.4, 1.0),
      mageShielded: false,
      attack: null,
      lastAttackId: null,
      stateTimer: 0,
      shieldUp: false,
      shieldDownTimer: 0,
      blockedHits: 0,
      counterReady: false,
      dodgeCooldown: 0,
      casterSummonTimer: 5.0 + (slot.slotIndex % 3),
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
    const effectiveKey =
      enemy.shieldGuarding && (clipKey === 'idle' || clipKey === 'walk') ? 'block' : clipKey;
    const mixerScale = Math.max(0.05, enemy.char.mixer.timeScale || 1.0);
    const scale = enemy.group.scale.x || 1.0;
    const clipName = enemy.char.resolveClipName?.(effectiveKey) || effectiveKey;
    const ts =
      groundSpeed === null
        ? 1.0
        : strideTimeScale(clipName, groundSpeed, { rig: enemy.rig, scale }) / mixerScale;
    if (enemy.char.anim.currentKey === effectiveKey && enemy.locoAction) {
      enemy.locoAction.setEffectiveTimeScale?.(ts);
      return;
    }
    if (enemy.char.anim.currentKey === effectiveKey) return;
    enemy.locoAction = safePlay(enemy.char, effectiveKey, { loop: true, fade: 0.18, timeScale: ts }, LOCO_FALLBACK[effectiveKey] || 'idle');
  }

  // Act HP escalation for regular enemies; bosses are authored at their final HP
  function actHpScale(arch) {
    if (arch.isBoss) return 1.0;
    return ACT_HP_SCALE[currentActId] ?? 1.0;
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
    e.hasAttackToken = false;
    e.aiState = 'dead';
    e.windupTimer = 0;
    e.telegraphProgress = 0;

    if (e.archetype === 'demon_tree' || e.archetype === 'grove_necromancer') {
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

    const source = hitSpec.source || 'combo1';
    const isMagicHit = Boolean(
      SPELLS_SET.has(source) ||
        source.startsWith('mage_') ||
        source === 'storm_cataclysm' ||
        hitSpec.attackerRole === 'Mage' ||
        hitSpec.heroId === 'Mage'
    );
    const attackerRole = isMagicHit ? 'Mage' : 'Knight';

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
      if (!isMagicHit) {
        enemy.blockedHits++;
        if (enemy.counterAtk && registerMashHit(enemy, simTime)) armCounter(enemy);
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
      enemy.counterReady = false;
      enemy.mashHits = 0;
    }

    const hpBefore = enemy.hp;

    const wasInWindup = enemy.aiState === 'windup';
    const savedWindupTimer = enemy.windupTimer;
    const savedTelegraphProgress = enemy.telegraphProgress;

    const result = applyHitAndResolveDetonation(enemy, hitSpec, activeEnemies);
    result.killerRole = attackerRole;
    result.isMagicKill = isMagicHit;
    result.isSwordKill = !isMagicHit;

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

    // Elite & Boss Windup Super-Armor: basic hits and non-detonation skills do NOT interrupt windup
    const canBreakWindupSuperArmor = Boolean(
      result.detonation ||
        result.guardShattered ||
        source === 'intercept' ||
        source === 'couples_ultimate'
    );
    if (wasInWindup && (enemy.isElite || enemy.isBoss) && !canBreakWindupSuperArmor) {
      enemy.stunTimer = 0;
      enemy.aiState = 'windup';
      enemy.windupTimer = savedWindupTimer;
      enemy.telegraphProgress = savedTelegraphProgress;
    }

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

    // Greedy strings against an unguarded elite draw its hyper-armoured counter too.
    if (
      result.damageDealt > 0 &&
      !isMagicHit &&
      enemy.isElite &&
      enemy.counterAtk &&
      (enemy.aiState === 'orbit' || enemy.aiState === 'windup') &&
      registerMashHit(enemy, simTime)
    ) {
      armCounter(enemy);
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
      // Detonations already stun (stunTimer); they must not also stack a poise stagger.
      if (enemy.aiState === 'down' || enemy.aiState === 'roar' || result.detonation) reaction = 'none';
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
      } else if (result.frontalShieldBlocked && enemy.aiState !== 'windup') {
        enemy.attackAnimTimer = 0.24;
        enemy.char.play('parry', { loop: false, fade: 0.05, force: true });
      } else if (result.guardShattered && enemy.aiState !== 'windup') {
        enemy.attackAnimTimer = 0.45;
        enemy.char.play('hit_B', { loop: false, fade: 0.06, force: true });
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
        // The whiffed swing leaves an opening: fodder stumbles, elites drop guard and lose poise.
        if (e.isBoss) {
          e.shieldDownTimer = Math.max(e.shieldDownTimer, DODGE_OPENING_SECONDS);
        } else if (e.isElite) {
          applyPoiseDamage(e, (e.poiseMax || 0) * 0.25);
          e.shieldDownTimer = Math.max(e.shieldDownTimer, DODGE_OPENING_SECONDS);
        } else {
          enterStagger(e, DODGE_OPENING_SECONDS, 'Hit_A');
          e.shieldDownTimer = Math.max(e.shieldDownTimer, DODGE_OPENING_SECONDS);
        }
        return {
          triggered: true,
          opening: true,
          enemy: e,
          resonanceGain: 20,
          qEnergyGain: 12,
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
  const contactLog = [];
  const heroSnap = { knight: null, mage: null };
  const pinned = { Knight: false, Mage: false };
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
    if (e.attack) unscheduleContacts(contactLog, e.instanceId);
    e.leapLift = 0;
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

  function armCounter(e) {
    e.counterReady = true;
    e.counterTimer = MASH_COUNTER_EXPIRY;
  }

  function parryEnemy(e) {
    // A clean parry also chips poise; breaking an elite's poise this way leaves it open longer.
    const broke = applyPoiseDamage(e, (e.poiseMax || 0) * PARRY_POISE_FRACTION);
    const secs = e.isBoss ? STAGGER_SECONDS.boss : broke ? STAGGER_SECONDS.parry * 1.5 : STAGGER_SECONDS.parry;
    enterStagger(e, secs, 'Hit_B');
    e.shieldDownTimer = Math.max(e.shieldDownTimer, secs);
    e.counterReady = false;
    e.mashHits = 0;
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
    return (poolByRole[role] || []).some((s) => !s.busy);
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
    e.stunTimer = 0; // the down window replaces the aegis-break stun so its timer runs in full
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
    if (atk.cooldown) {
      e.eruptionCooldown = atk.cooldown;
      e.eruptionHold = 0;
    }
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
    scheduleContacts(contactLog, e.attack.targetHeroId, e.instanceId, absoluteContacts(e, atk, tl, target), simTime);
    onWindupHandler?.(e, atkId, atk);
    return true;
  }

  function absoluteContacts(e, atk, tl, target) {
    const travel = atk.ranged ? Math.hypot(target.x - e.x, target.z - e.z) / (e.projectileSpeed || 14.5) : 0;
    return contactMoments(tl, travel).map((t) => simTime + t);
  }

  /** Windup limiter + contact-frame fairness gate; on refusal the enemy retries a beat later. */
  function tryStartAttack(e, atkId, target) {
    const atk = ENEMY_ATTACKS[atkId];
    if (!atk) return false;
    const heroId = target.id || e.targetHeroId || 'Knight';
    if (!canStartWindup(windupLog, heroId, simTime)) return false;
    const speed = e.isBoss && e.phase === 'p3' ? BOSS_P3_SPEED : 1.0;
    const tl = attackTimeline(atk, clipSeconds(e.char, atk.clip), speed);
    if (!canScheduleContacts(contactLog, heroId, e.instanceId, absoluteContacts(e, atk, tl, target))) {
      e.cooldownTimer = Math.max(e.cooldownTimer, 0.12);
      return false;
    }
    return startAttack(e, atkId, target);
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
    if (atk.ranged) {
      // Bolts are real projectiles aimed where the hero stood when the aim locked: dodgeable.
      const owner = e;
      const dirX = Math.sin(e.yaw);
      const dirZ = Math.cos(e.yaw);
      const aimHero = a.targetHeroId === 'Mage' ? mage : knight;
      spawnEnemyProjectile({
        owner,
        kind: e.archetype === 'plant_warrior' ? 'thorn_bolt' : 'arcane_bolt',
        origin: { x: e.x + dirX * 0.7, y: e.y + 1.25 * (e.group.scale.x || 1), z: e.z + dirZ * 0.7 },
        targetPos: {
          x: a.aimX,
          y: (aimHero?.y ?? walkableHeightAt(a.aimX, a.aimZ)) + 1.05,
          z: a.aimZ,
        },
        speed: e.projectileSpeed || 14.5,
        dmg: Math.max(1, Math.round(atk.dmg * e.attackDmgScale)),
        radius: 0.42,
        targetHeroId: a.targetHeroId,
      });
      return;
    }
    const heroes = [knight, mage];
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (!h || h.downed || (h.iframeTimer || 0) > 0) continue;
      const hid = h.id || (i === 0 ? 'Knight' : 'Mage');
      let hit;
      if (atk.ranged) continue;
      if (atk.area) hit = Math.hypot(h.x - a.areaX, h.z - a.areaZ) <= atk.radius + 0.35;
      else hit = isInAttackArc(e, e.yaw, h, atk.range * (e.group.scale.x || 1) + 0.35, atk.arcDeg);
      if (!hit) continue;
      const blockable = atk.blockable !== false;
      if (hid === 'Knight' && blockable && knightBlock.active && isParryTiming(knightBlock.startAt, simTime)) {
        parryEnemy(e);
        return;
      }
      e.lastContact = { heroId: hid, t: simTime, blockable };
      if (onPlayerHit) {
        const dmg = Math.max(1, Math.round(atk.dmg * e.attackDmgScale));
        // Read by campaign-loop handlePlayerHit (unblockable Captain chop etc.).
        e.currentHit = { attackId: a.id, contactIdx: idx, unblockable: !blockable, area: Boolean(atk.area), guardDmg: atk.guardDmg || 0 };
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
        const step = Math.min(d - 1.2, (a.atk.lungeSpeed || 7.5) * dt * m);
        const np = applyEnemySpatialConstraints(e.x + ((target.x - e.x) / d) * step, e.z + ((target.z - e.z) / d) * step, e.radius);
        e.x = np.x;
        e.z = np.z;
      }
      if (a.atk.leap) {
        const start = a.tl.slowEndClip - 0.25;
        const end = a.atk.contacts[0] * a.dur;
        e.leapLift = 1.7 * Math.sin(Math.PI * clamp((a.clipT - start) / Math.max(0.05, end - start), 0, 1));
      }
    }
    for (let i = 0; i < r.crossed.length; i++) {
      if (!e.attack) return; // parried
      e.leapLift = 0;
      resolveContact(e, r.crossed[i], knight, mage);
      if (e.attack) e.attack.contactIdx = r.crossed[i] + 1;
    }
    if (e.attack && r.finished) {
      e.aiState = 'recover';
      e.attack.recoverT = a.atk.recovery ?? 0.4;
    }
  }

  function chooseAttack(e, dist, heroId = 'Knight') {
    const sc = e.group.scale.x || 1;
    if (e.archetype === 'boss_sovereign') {
      const leap = ENEMY_ATTACKS.boss_leap_slam;
      if (e.forceLeap || (e.phase !== 'p1' && e.leapCooldown <= 0 && dist >= leap.minDist && dist <= 13)) {
        e.forceLeap = false;
        e.leapCooldown = 7.0;
        return 'boss_leap_slam';
      }
      const id = selectBossAttack(e.phase, rand(), e.lastAttackId);
      if (dist <= ENEMY_ATTACKS[id].range * 0.9) return id;
      return dist <= ENEMY_ATTACKS.boss_2h.range * 0.9 ? 'boss_2h' : null;
    }
    const ok = e.attacks.filter((id) => {
      const atk = ENEMY_ATTACKS[id];
      if (!atk) return false;
      if (e.isHybridRangedMelee && Boolean(atk.ranged) !== e.usingRangedMode) return false;
      // Casters time eruptions for pinned heroes (or after holding the cast for 4 s).
      if (atk.cooldown && (e.eruptionCooldown > 0 || !(pinned[heroId] || e.eruptionHold >= 4))) return false;
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
    if (e.isHybridRangedMelee && e.usingRangedMode) return e.rangedMinDist + 1.0;
    if (e.isRanged) return e.attackRange * 0.8;
    const melee = e.isHybridRangedMelee
      ? e.attacks.filter((id) => !ENEMY_ATTACKS[id]?.ranged && !ENEMY_ATTACKS[id]?.area)
      : e.attacks;
    const atk = ENEMY_ATTACKS[melee.find((id) => !ENEMY_ATTACKS[id]?.lunge) || melee[0]];
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
    if (e.shieldWall && e.shieldDownTimer <= 0) {
      // Shield walls alternate guarding and sidestepping (shield down) so none just stands in the clump.
      e.guardCycle -= dt;
      if (e.guardCycle <= 0) {
        e.guarding = !e.guarding;
        e.guardCycle = e.guarding ? 1.4 + rand() * 0.8 : 1.0 + rand() * 0.7;
      }
    }
    e.shieldUp = e.shieldWall && e.shieldDownTimer <= 0 && e.guarding;
    if ((e.isRanged || (e.isHybridRangedMelee && e.usingRangedMode)) && dist < 5.0) {
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
      e.behaviour =
        e.flankBias && !e.isRanged && rand() < 0.75
          ? 'flank'
          : STANDOFF_BEHAVIOURS[(e.behaviourIdx + e.slotIndex) % STANDOFF_BEHAVIOURS.length];
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
        return;
      }
      e.behaviour = 'strafe'; // already clear of the fight: keep circling instead of standing
    }
    let sign = e.orbitSpeed >= 0 ? 1 : -1;
    if (e.behaviour === 'flank' && Number.isFinite(target.yaw)) {
      // Circle toward the hero's back.
      const bx = target.x - Math.sin(target.yaw) * 2.0 - e.x;
      const bz = target.z - Math.cos(target.yaw) * 2.0 - e.z;
      sign = -dirZ * bx + dirX * bz >= 0 ? 1 : -1;
    }
    const radial = clamp((dist - e.standoffDist) * 1.5, -1.5, 1.5);
    const tang = (e.behaviour === 'flank' ? 3.6 : 2.3) * mv;
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

  /** Mage sheltered by the shield: circle the Knight at ~5 m toward the side that leaves his front arc. */
  function huntProbe(e, dt, mv) {
    const k = heroSnap.knight;
    const dx = e.x - k.x;
    const dz = e.z - k.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;
    if (!e.huntFlankSign || e.behaviourTimer <= 0) {
      const cross = Math.sin(k.yaw || 0) * dz - Math.cos(k.yaw || 0) * dx;
      e.huntFlankSign = cross >= 0 ? 1 : -1;
      e.behaviourTimer = 1.5;
    }
    e.behaviourTimer -= dt;
    const radial = clamp((5.2 - dist) * 1.4, -2.2, 2.2);
    const tang = e.speed * 0.55 * mv;
    const vx = nx * radial * mv - nz * e.huntFlankSign * tang;
    const vz = nz * radial * mv + nx * e.huntFlankSign * tang;
    const moved = moveBy(e, vx, vz, dt);
    const rightDot = vx * -Math.cos(e.yaw) + vz * Math.sin(e.yaw);
    playEnemyLocomotion(e, rightDot >= 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left', moved);
  }

  function thinkOrbit(e, dt, target, dist, dirX, dirZ, slowMult) {
    if (e.attack) cancelAttack(e);
    // Mid-dodge / flinch / shield-block reaction: let the reaction clip and its velocity play out
    // instead of approach()/standoff() overwriting them next frame.
    if (e.attackAnimTimer > 0) return;
    const mv = slowMult * (e.rallyTimer > 0 ? CAPTAIN_RALLY_SPEED_MULT : 1.0);
    if (e.isBoss) e.phase = bossPhaseFor(e.hp / Math.max(1, e.maxHp), e.aegisTriggered);
    const heroId = target.id || 'Knight';

    if (e.isHybridRangedMelee) {
      if (dist > e.rangedMinDist) e.usingRangedMode = true;
      else if (dist < e.meleeMaxDist) e.usingRangedMode = false;
    }

    if (e.isStationary) {
      if (e.cooldownTimer <= 0) {
        const atkId = chooseAttack(e, dist, heroId);
        if (atkId && tryStartAttack(e, atkId, target)) return;
      }
      playEnemyLocomotion(e, 'idle');
      return;
    }

    if (e.counterReady && e.counterAtk) {
      const cAtk = ENEMY_ATTACKS[e.counterAtk];
      if (cAtk && dist <= cAtk.range * (e.group.scale.x || 1) + 0.6 && tryStartAttack(e, e.counterAtk, target)) {
        e.counterReady = false;
        return;
      }
    }
    if (e.wards && e.dodgeCooldown <= 0 && dist < 3.2) {
      enemyDodge(e, target, 'back');
      return;
    }
    if (
      e.summons &&
      e.casterSummonTimer <= 0 &&
      aliveCount((o) => o.archetype === 'skeleton_minion') < 3 &&
      freeSlotFor('Skeleton_Minion') &&
      activeEnemies.length < MAX_CONCURRENT_ENEMIES
    ) {
      e.casterSummonTimer = MAGE_SUMMON_COOLDOWN;
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

    // Hunters give up on a Mage who is sheltering behind the Knight's raised shield.
    const huntBlocked = e.hunter && heroId === 'Mage' && e.mageShielded && heroSnap.knight;
    if (e.hasAttackToken && !huntBlocked) {
      if (e.cooldownTimer <= 0) {
        const atkId = chooseAttack(e, dist, heroId);
        if (atkId && tryStartAttack(e, atkId, target)) return;
      }
      approach(e, dt, dist, dirX, dirZ, mv);
      return;
    }
    if (huntBlocked) {
      huntProbe(e, dt, mv);
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
          e.forceLeap = true; // the first move after standing back up is a leaping slam
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
          // Windup forced from outside (no attack record): hold it for its nominal duration.
          e.windupTimer += dt * slowMult;
          if (e.aiState !== 'windup' || e.windupTimer >= e.windupDuration) {
            e.aiState = 'orbit';
            e.windupTimer = 0;
          }
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

  /** A hero is pinned while melee attackers are on him and he is guarding, outnumbered, or facing a shield wall. */
  function updatePinned(knight, mage) {
    heroSnap.knight = knight || null;
    heroSnap.mage = mage || null;
    for (const [id, hero] of [['Knight', knight], ['Mage', mage]]) {
      let engaged = 0;
      let wall = false;
      if (hero && !hero.downed) {
        for (let i = 0; i < activeEnemies.length; i++) {
          const o = activeEnemies[i];
          if (o.dead || !o.active || o.isRanged || o.isPile || o.aiState === 'dormant') continue;
          if (Math.hypot(o.x - hero.x, o.z - hero.z) > 3.4) continue;
          engaged++;
          if (o.shieldWall) wall = true;
        }
      }
      pinned[id] = engaged >= 2 || (engaged >= 1 && (wall || Boolean(hero?.shieldBlocking)));
    }
  }

  /** Enemies crowding the Knight's front while an ally already holds it swing round to his flanks. */
  function markFlankers(knight) {
    let frontHeld = false;
    if (knight) {
      for (let i = 0; i < activeEnemies.length; i++) {
        const o = activeEnemies[i];
        if (o.hasAttackToken && !o.dead && o.targetHeroId !== 'Mage' && !o.isRanged && inKnightFrontArc(knight, o)) {
          frontHeld = true;
          break;
        }
      }
    }
    for (let i = 0; i < activeEnemies.length; i++) {
      const o = activeEnemies[i];
      o.flankBias = Boolean(
        frontHeld &&
          !o.hasAttackToken &&
          !o.isBoss &&
          !o.isRanged &&
          o.targetHeroId !== 'Mage' &&
          inKnightFrontArc(knight, o)
      );
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

      const iceTimeMult = (1.0 - clamp(e.iceSlowFactor || 0, 0, 0.25)) * globalEnemyTimeScale;

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
      if (e.detonationCdTimer > 0) {
        e.detonationCdTimer = Math.max(0, e.detonationCdTimer - dt);
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
        e.cooldownTimer = Math.max(0, e.cooldownTimer - dt * globalEnemyTimeScale);
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
      e.dodgeCooldown = Math.max(0, e.dodgeCooldown - dt);
      e.casterSummonTimer = Math.max(0, e.casterSummonTimer - dt);
      e.eruptionCooldown = Math.max(0, e.eruptionCooldown - dt);
      e.wardCooldown = Math.max(0, e.wardCooldown - dt);
      e.rallyCooldown = Math.max(0, e.rallyCooldown - dt);
      e.rallyTimer = Math.max(0, e.rallyTimer - dt);
      e.invulnTimer = Math.max(0, e.invulnTimer - dt);
      e.tauntCooldown = Math.max(0, e.tauntCooldown - dt);
      e.shieldDownTimer = Math.max(0, e.shieldDownTimer - dt);
      e.leapCooldown = Math.max(0, e.leapCooldown - dt);
      if (e.counterReady && (e.counterTimer -= dt) <= 0) e.counterReady = false;
      if (e.mashHits > 0 && simTime - e.mashLastAt > MASH_WINDOW) e.mashHits = 0;
      if (e.attacks.includes('mage_eruption') && e.eruptionCooldown <= 0 && !e.attack) e.eruptionHold += dt;
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
      if (e.hunter && e.aiState !== 'windup') {
        const hunted = selectHuntTarget(e, knight, mage);
        if (hunted) {
          e.targetHeroId = hunted === mage ? 'Mage' : 'Knight';
          e.huntingMage = e.targetHeroId === 'Mage';
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

    updatePinned(knight, mage);
    allocateAttackTokens(activeEnemies, MAX_ATTACK_TOKENS, { knight });
    markFlankers(knight);

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
          : 1.0 - clamp(e.iceSlowFactor || 0, 0, 0.25);
      const slowMult = baseSlowMult * globalEnemyTimeScale;

      if (e.stunTimer <= 0 && e.knockdownTimer <= 0 && e.hitstopTimer <= 0 && e.grounded && targetHero) {
        e.mageShielded = knightShieldCovers(knight, mage, e);
        thinkEnemy(e, dt, targetHero, slowMult, knight, mage);
        if (e.directionalShieldConeDeg > 0) {
          e.shieldGuarding = e.stunTimer <= 0 && (e.aiState === 'orbit' || e.aiState === 'cast');
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

      if (!e.isStationary && e.char?.group) {
        const heroList = [knight, mage];
        for (let hIdx = 0; hIdx < heroList.length; hIdx++) {
          const h = heroList[hIdx];
          if (!h || h.downed) continue;
          const hdx = e.x - h.x;
          const hdz = e.z - h.z;
          const minHeroSep = (e.radius || 0.5) + 0.52;
          const hd = Math.hypot(hdx, hdz);
          if (hd < minHeroSep) {
            const push = minHeroSep - hd;
            const nx = hd > 1e-4 ? hdx / hd : Math.sin(e.yaw || 0);
            const nz = hd > 1e-4 ? hdz / hd : Math.cos(e.yaw || 0);
            const clampedH = applyEnemySpatialConstraints(
              e.x + nx * push,
              e.z + nz * push,
              e.radius
            );
            e.x = clampedH.x;
            e.z = clampedH.z;
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
          e.y = baseGroundY + (e.leapLift || 0);
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
          const minBlastOut = Math.max(dist + 7.5, 11.2, targetPush * 0.9);
          const pushedPos = applyEnemySpatialConstraints(
            cx + nx * minBlastOut,
            cz + nz * minBlastOut,
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
      if (e.isStationary) continue;
      const dx = e.x - cx;
      const dz = e.z - cz;
      const d = Math.hypot(dx, dz);
      const minDist = Math.max(wardRadius, 8.5) + (e.radius || 0.5);
      if (d < minDist) {
        const nx = d > 1e-4 ? dx / d : 1.0;
        const nz = d > 1e-4 ? dz / d : 0.0;
        const targetDist = minDist + 0.35;
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
