// ============================================================================
// world/src/combat/campaign-loop.js
//
// Stage 5 / Wave 2B 3-Act Valley Expedition & Co-Op Synergy Loop:
// - Drives the 3-Act progression:
//     `act1_arena` -> `interlude_pier` -> `act2_plaza` -> `act3_shrine` -> `victory_dawn`
// - Manages Hero HP (Knight 220 HP tank, Mage 90 HP fragile glass cannon),
//   Knight Shield Block (80% DR + Mage protection interception), Knight E Power
//   Sword (13s active / 18s cooldown = 5s downtime, Ice slow & Fire burn DoT),
//   Knight Q Sky-Lightning Awakening (10s 2.0x double damage), Knight XP/Leveling,
//   Mage E Frost Lance / Cinder Fall (8.5s cooldown with Aim Arrow distance),
//   Mage Q 6.0s Vulnerable Stationary Storm Cataclysm, and Artorious Commune.
// - Permanently hides prototype indicator clutter (`crestAndTetherMesh.visible = false`,
//   zero floating tether beads, zero spinning overhead enemy diamonds, zero red
//   under-enemy circles) and removes artificial partner distance restrictions.
// ============================================================================

import * as THREE from 'three';
import {
  clamp,
  shortestAngleDiff,
  HERO_STATS,
  Q_ENERGY_CONFIG,
  BREATHING_STYLES,
  SPELLS,
  SPELL_BY_SLOT,
  WINGMAN_SPELL_ROTATION,
  DETONATIONS,
  COUPLES_ULTIMATE,
  ACT_DEFINITIONS,
  ACT_SEQUENCE,
  STONE_STRONGHOLDS,
  SURVIVAL_WAVE_POOLS,
  SAFE_HAVEN_WAYPOINTS,
  selectNearestSafeHavenWaypoint,
  COMMUNE_MAX_DISTANCE,
  COMMUNE_RESURRECT_DISTANCE,
  COMMUNE_COMBAT_HP_THRESHOLD,
  POWERUP_TETHER_DISTANCE,
  DIVINE_BLESSING_DURATION,
  DIVINE_BLESSING_TETHER_DISTANCE,
  DIVINE_BLESSING_TETHER_GRACE_SECONDS,
  DIVINE_BLESSING_DMG_MULT,
  DIVINE_BLESSING_Q_CD_MULT,
  DIVINE_BLESSING_E_CD_MULT,
  ALTAR_STELE_POS,
  selectSoftLockTarget,
  getKnightLevelStats,
  KNIGHT_GUARD_MAX,
  KNIGHT_GUARD_HOLD_DRAIN,
  KNIGHT_GUARD_HIT_COST,
  KNIGHT_GUARD_REGEN,
  KNIGHT_GUARD_REGEN_DELAY,
  KNIGHT_GUARD_BREAK_STUN,
  SHIELD_COVER_RADIUS,
  SHIELD_ARC_COS,
  KNIGHT_MAX_LEVEL,
} from './combat-balance.js';
import {
  KNIGHT_SHIELD_BLOCK_DR,
  KNIGHT_POWER_SWORD_DURATION,
  KNIGHT_POWER_SWORD_COOLDOWN,
  KNIGHT_ULT_DURATION,
  KNIGHT_ULT_DMG_MULT,
  KNIGHT_ULT_COOLDOWN,
  MAGE_E_COOLDOWN,
  MAGE_STORM_CATACLYSM_DURATION,
  MAGE_STORM_CATACLYSM_COOLDOWN,
} from './combat-action-aim.js';

const MAX_GROUND_INDICATORS = 36;
const MAX_CREST_AND_TETHER_INSTANCES = 56;
const STORM_CATACLYSM_INNER_SAFE_RADIUS = 1.68;
const _indDummy = new THREE.Object3D();

/* ------------------------------------------------------------------------- */
/* 1. Shared 2-InstancedMesh Opaque Cel-Shaded Indicator Builders            */
/* ------------------------------------------------------------------------- */

function createGroundIndicatorInstancedMesh() {
  const geo = new THREE.PlaneGeometry(2.0, 2.0, 32, 32);
  geo.rotateX(-Math.PI * 0.5);

  const metaArray = new Float32Array(MAX_GROUND_INDICATORS * 4);
  const metaAttr = new THREE.InstancedBufferAttribute(metaArray, 4);
  metaAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aIndicatorMeta', metaAttr);

  const mat = new THREE.ShaderMaterial({
    name: 'CombatGroundIndicatorCelMaterial',
    transparent: false,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uTerrainSlope: { value: new THREE.Vector4(0, 0, 0, 0.48) },
      uGoldEdgeColor: { value: new THREE.Color('#ff9a24') },
      uHotCoreColor: { value: new THREE.Color('#fff8db') },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aIndicatorMeta; // x: halfExtentM, y: outerRadiusM, z: innerSafeRadiusM, w: alpha01
      uniform vec4 uTerrainSlope; // x: dh/dx, y: dh/dz, z: curvature, w: baseY
      varying vec2 vLocalXZ;
      varying vec4 vMeta;

      void main() {
        vLocalXZ = position.xz;
        vMeta = aIndicatorMeta;
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float wx = vLocalXZ.x * max(1.0, aIndicatorMeta.x);
        float wz = vLocalXZ.y * max(1.0, aIndicatorMeta.x);
        worldPos.y = uTerrainSlope.w + wx * uTerrainSlope.x + wz * uTerrainSlope.y + (wx * wx + wz * wz) * uTerrainSlope.z;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uGoldEdgeColor;
      uniform vec3 uHotCoreColor;

      varying vec2 vLocalXZ;
      varying vec4 vMeta;

      void main() {
        float halfExtent = max(1.0, vMeta.x);
        float outerR = vMeta.y;
        float innerR = vMeta.z;
        float activeFlag = vMeta.w;
        if (activeFlag <= 0.01) discard;

        float distM = length(vLocalXZ) * halfExtent;
        float ang = atan(vLocalXZ.y, vLocalXZ.x);

        // 4 subtle cardinal diamond ticks (N, S, E, W) on the outer bombardment ring
        float cardinal = pow(abs(cos(ang * 2.0)), 28.0);
        float dOuter = abs(distM - outerR) - cardinal * 0.22;
        float outerLine = 1.0 - smoothstep(0.08, 0.17, dOuter);
        float outerCore = 1.0 - smoothstep(0.0, 0.075, dOuter);

        // Inner safe sanctuary circle right around the stationary Mage's feet
        float dInner = abs(distM - innerR);
        float innerLine = 1.0 - smoothstep(0.055, 0.12, dInner);
        float innerCore = 1.0 - smoothstep(0.0, 0.052, dInner);

        float ringMask = max(outerLine, innerLine);
        if (ringMask < 0.22) discard;

        float coreFactor = max(outerCore, innerCore);
        vec3 col = mix(uGoldEdgeColor * 1.15, uHotCoreColor * 1.28, coreFactor);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, MAX_GROUND_INDICATORS);
  mesh.name = 'combatGroundIndicatorInstancedMesh';
  mesh.frustumCulled = false;
  mesh.renderOrder = 16;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 16;
  mesh.count = 0;
  mesh.visible = false;

  const white = new THREE.Color('#ffffff');
  for (let i = 0; i < MAX_GROUND_INDICATORS; i++) {
    mesh.setColorAt(i, white);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return { mesh, metaAttr, metaArray };
}

function createCrestAndTetherInstancedMesh() {
  const geo = new THREE.OctahedronGeometry(1.0, 0);

  const mat = new THREE.ShaderMaterial({
    name: 'CombatCrestAndTetherCelMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uInkColor: { value: new THREE.Color('#18111a') },
      uCoreHighlight: { value: new THREE.Color('#fff9e6') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vColor = instanceColor;
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        gl_FragColor = vec4(vColor, 1.0);
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, MAX_CREST_AND_TETHER_INSTANCES);
  mesh.name = 'combatCrestAndTetherInstancedMesh';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = 0;
  mesh.visible = false;

  const white = new THREE.Color('#ffffff');
  for (let i = 0; i < MAX_CREST_AND_TETHER_INSTANCES; i++) {
    mesh.setColorAt(i, white);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return { mesh };
}

/* ------------------------------------------------------------------------- */
/* 2. Campaign Loop & Combat Synergy Controller                              */
/* ------------------------------------------------------------------------- */

export function createCampaignLoop({
  scene,
  walkableHeightAt = () => 0,
  enemyManager = null,
  vfxKit = null,
  combatSfx = null,
  getProgressionState = null,
  openValleyMode: initialOpenValleyMode = undefined,
  onActChanged = null,
  onWaveChanged = null,
  onSkyTodChanged = null,
  onBanner = null,
  onDetonation = null,
  onInfusionChanged = null,
  onHudStateChanged = null,
  onFriendlyFireHit = null,
} = {}) {
  const indicatorGroup = new THREE.Group();
  indicatorGroup.name = 'combatSharedIndicatorsGroup';
  if (scene) {
    scene.add(indicatorGroup);
  }

  const groundInd = createGroundIndicatorInstancedMesh();
  const crestInd = createCrestAndTetherInstancedMesh();
  indicatorGroup.add(groundInd.mesh);
  indicatorGroup.add(crestInd.mesh);

  // Hero Combat State
  const combatHeroes = {
    Knight: {
      id: 'Knight',
      hp: HERO_STATS.Knight.maxHp,
      maxHp: HERO_STATS.Knight.maxHp,
      shield: 0,
      shieldTimer: 0,
      downed: false,
      reviveProgress: 0,
      level: 1,
      xp: 0,
      kills: 0,
      selectedElement: 'ice', // 'ice' | 'fire' (queued next element on Tab)
      summonedElement: null, // 'ice' | 'fire' | null (active sword element locked on E press)
      qEnergy: 0,
      qEnergyMax: Q_ENERGY_CONFIG.knightCost, // 100
      qEnergyPct: 0,
      shieldBlocking: false,
      powerSwordActive: false,
      powerSwordTimer: 0,
      powerSwordCd: 0,
      ultActive: false,
      ultTimer: 0,
      ultCd: 0,
      ultDmgMult: 1.0,
      breathingStyle: 'none',
      breathingTimer: 0,
      empoweredBreathing: false,
      sunSwornBreathing: false,
      sunSwornTimer: 0,
      partnerSwordMult: 1.0,
      partnerBuffTimer: 0,
      perfectDodgeBuff: false,
      iframeTimer: 0,
      burstHitTimer: 0,
      interceptCd: 0,
      dashCd: 0,
      dodgeIcd: 0,
      guard: KNIGHT_GUARD_MAX,
      guardRegenDelay: 0,
      guardBrokenTimer: 0,
    },
    Mage: {
      id: 'Mage',
      hp: HERO_STATS.Mage.maxHp,
      maxHp: HERO_STATS.Mage.maxHp,
      shield: 0,
      shieldTimer: 0,
      downed: false,
      reviveProgress: 0,
      selectedElement: 'ice',
      selectedSpell: 'frost_lance', // 'frost_lance' | 'cinder_fall'
      qEnergy: 0,
      qEnergyMax: Q_ENERGY_CONFIG.mageCost, // 160
      qEnergyPct: 0,
      consecutiveChargedCount: 0,
      skillCd: 0,
      stormCataclysmActive: false,
      stormCataclysmTimer: 0,
      stormCataclysmCastTimer: 0,
      stormCataclysmWaveTimer: 0,
      stormCataclysmMeteorsFired: 0,
      stormCataclysmCenter: { x: 0, y: 0, z: 0 },
      stormCataclysmHitCounts: new Map(),
      ultCd: 0,
      empoweredBreathing: false,
      ascendedMagicFlow: false,
      ascendedMagicTimer: 0,
      partnerMagicMult: 1.0,
      partnerBuffTimer: 0,
      perfectDodgeBuff: false,
      iframeTimer: 0,
      burstHitTimer: 0,
      infuseCd: 0,
      dashCd: 0,
      dodgeIcd: 0,
      spellCooldowns: {
        frost_lance: 0,
        shatterlance: 0,
        cinder_fall: 0,
        storm_lance: 0,
      },
    },
  };

  const state = {
    Knight: combatHeroes.Knight,
    Mage: combatHeroes.Mage,
    knight: combatHeroes.Knight,
    mage: combatHeroes.Mage,
  };

  let actIndex = 0;
  let currentActId = ACT_SEQUENCE[0];
  let waveIndex = -1;
  let actTriggered = false;
  let heartResonance = 25;
  let elapsed = 0;
  let hudDirtyTimer = 0;
  let wingmanCastTimer = 0.45;
  let wingmanSpellIdx = 0;
  let wingmanBoltTimer = 0.35;
  let wingmanBoltIdx = 0;
  let bothDownedTimer = 0;
  let lastHeroStates = null;
  let lastCamera = null;
  let friendlyFireCallback = typeof onFriendlyFireHit === 'function' ? onFriendlyFireHit : null;
  function setOnFriendlyFireHit(fn) {
    friendlyFireCallback = typeof fn === 'function' ? fn : null;
  }
  let playerDamagedCallback = null;
  function setOnPlayerDamaged(fn) {
    playerDamagedCallback = typeof fn === 'function' ? fn : null;
  }
  const PARTNER_REVIVE_RADIUS = 2.8;
  const PARTNER_REVIVE_SECONDS = 2.5;
  const PARTNER_REVIVE_HP = 0.45;
  let communeChannelActive = false;
  let communeMode = 'normal'; // 'normal' | 'divine_miracle'
  let modeAHealCd = 0;
  let modeBMiracleCd = 0;
  let stoneGuessCd = 0;
  let awakeningEclipseTimer = 0;
  let tetherOutTimer = 0;
  let indicatorsHiddenForShot = false;
  let divineBlessingActive = false;
  let divineBlessingTimer = 0;

  // Open-Valley Strongholds & Randomized Survival Waves state
  let openValleyMode =
    initialOpenValleyMode !== undefined
      ? Boolean(initialOpenValleyMode)
      : Boolean(getProgressionState);
  let strongholdClearedMask = 0;
  const activeStrongholdIds = new Set();
  const strongholdWaveIndex = {
    site1_well: -1,
    site2_platform: -1,
    site3_wall: -1,
    apex_finale: -1,
  };
  let survivalWaveTimer = 6.0;
  let survivalWaveSeed = 0;
  let roadVanguardSpawned = false;
  let manualUnlockedStage = null;
  let manualStonesSolvedMask = null;

  function getUnlockedStage() {
    if (manualUnlockedStage !== null) return manualUnlockedStage;
    const prog = getProgressionState?.();
    if (prog && typeof prog.unlockedStage === 'number') return prog.unlockedStage;
    return 0;
  }

  function getStonesSolvedMask() {
    if (manualStonesSolvedMask !== null) return manualStonesSolvedMask;
    const prog = getProgressionState?.();
    if (prog && typeof prog.stonesSolvedMask === 'number') return prog.stonesSolvedMask;
    if (prog) {
      return (
        (prog.stone1Solved ? 1 : 0) |
        (prog.stone2Solved ? 2 : 0) |
        (prog.stone3Solved ? 4 : 0)
      );
    }
    return manualUnlockedStage !== null && manualUnlockedStage >= 3 ? 0b111 : 0;
  }

  function isStage3Unlocked() {
    if (manualUnlockedStage !== null) {
      return manualUnlockedStage >= 3 || getStonesSolvedMask() === 0b111;
    }
    if (getProgressionState) {
      return getUnlockedStage() >= 3 || getStonesSolvedMask() === 0b111;
    }
    return true;
  }

  function addHeroQEnergy(heroId, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (!isStage3Unlocked()) return 0;
    const key = String(heroId || 'Knight').toLowerCase() === 'mage' ? 'Mage' : 'Knight';
    if (key === 'Mage' && combatHeroes.Mage.stormCataclysmActive) return combatHeroes.Mage.qEnergy;
    const h = combatHeroes[key];
    h.qEnergy = clamp(Number((h.qEnergy + amount).toFixed(2)), 0, h.qEnergyMax);
    h.qEnergyPct = clamp(h.qEnergy / Math.max(1, h.qEnergyMax), 0, 1);
    return h.qEnergy;
  }

  function setUnlockedStage(stageNum, stonesMask = undefined) {
    if (stageNum === null || stageNum === undefined) {
      manualUnlockedStage = null;
    } else {
      manualUnlockedStage = clamp(Number(stageNum) || 0, 0, 3);
      if (manualUnlockedStage >= 3) {
        addHeroQEnergy('Knight', combatHeroes.Knight.qEnergyMax);
        addHeroQEnergy('Mage', combatHeroes.Mage.qEnergyMax);
      }
    }
    if (stonesMask !== undefined) {
      manualStonesSolvedMask =
        stonesMask === null ? null : Number(stonesMask) & 0b111;
    }
    return manualUnlockedStage;
  }

  function setOpenValleyMode(enabled) {
    openValleyMode = Boolean(enabled);
    if (openValleyMode) {
      activeStrongholdIds.clear();
      strongholdClearedMask = 0;
      for (const k of Object.keys(strongholdWaveIndex)) {
        strongholdWaveIndex[k] = -1;
      }
    }
    return openValleyMode;
  }

  const verdictSequence = {
    active: false,
    kind: null, // 'blessing' | 'smite'
    verdict: null,
    elapsed: 0,
    duration: 0,
    beat: 0,
    speakerRole: 'Knight',
    dissolveRole: null,
    startKnightHp: HERO_STATS.Knight.maxHp,
    startMageHp: HERO_STATS.Mage.maxHp,
    knightWasDowned: false,
    mageWasDowned: false,
    startKnightX: 0,
    startKnightZ: 0,
    startMageX: 0,
    startMageZ: 0,
    midX: 0,
    midZ: 0,
  };

  function isControlLocked() {
    return Boolean(communeChannelActive || verdictSequence.active);
  }

  function isDivineBlessingActive() {
    return Boolean(divineBlessingActive);
  }

  function getDivineBlessingRemaining() {
    return divineBlessingActive ? divineBlessingTimer : 0;
  }

  function activateDivineBlessing() {
    divineBlessingActive = true;
    divineBlessingTimer = DIVINE_BLESSING_DURATION;
    tetherOutTimer = 0;
    combatHeroes.Knight.partnerSwordMult = DIVINE_BLESSING_DMG_MULT;
    combatHeroes.Knight.partnerBuffTimer = DIVINE_BLESSING_DURATION;
    combatHeroes.Knight.sunSwornBreathing = true;
    combatHeroes.Knight.sunSwornTimer = DIVINE_BLESSING_DURATION;
    combatHeroes.Knight.empoweredBreathing = true;

    combatHeroes.Mage.partnerMagicMult = DIVINE_BLESSING_DMG_MULT;
    combatHeroes.Mage.partnerBuffTimer = DIVINE_BLESSING_DURATION;
    combatHeroes.Mage.ascendedMagicFlow = true;
    combatHeroes.Mage.ascendedMagicTimer = DIVINE_BLESSING_DURATION;
    combatHeroes.Mage.empoweredBreathing = true;

    combatHeroes.Knight.qEnergy = combatHeroes.Knight.qEnergyMax;
    combatHeroes.Knight.qEnergyPct = 1.0;
    combatHeroes.Mage.qEnergy = combatHeroes.Mage.qEnergyMax;
    combatHeroes.Mage.qEnergyPct = 1.0;

    const blessedQCd = Number((KNIGHT_ULT_COOLDOWN * DIVINE_BLESSING_Q_CD_MULT).toFixed(2));
    if (combatHeroes.Knight.ultCd > blessedQCd) {
      combatHeroes.Knight.ultCd = blessedQCd;
    }
    if (combatHeroes.Mage.ultCd > blessedQCd) {
      combatHeroes.Mage.ultCd = blessedQCd;
    }
    const blessedMageECd = Number((MAGE_E_COOLDOWN * DIVINE_BLESSING_E_CD_MULT).toFixed(2));
    if (combatHeroes.Mage.skillCd > blessedMageECd) {
      combatHeroes.Mage.skillCd = blessedMageECd;
    }
    for (const k of Object.keys(combatHeroes.Mage.spellCooldowns)) {
      if (combatHeroes.Mage.spellCooldowns[k] > blessedMageECd) {
        combatHeroes.Mage.spellCooldowns[k] = blessedMageECd;
      }
    }
  }

  function clearDivineBlessing() {
    if (!divineBlessingActive && divineBlessingTimer === 0) return;
    divineBlessingActive = false;
    divineBlessingTimer = 0;
    tetherOutTimer = 0;
    combatHeroes.Knight.partnerSwordMult = 1.0;
    combatHeroes.Knight.partnerBuffTimer = 0;
    combatHeroes.Knight.sunSwornBreathing = false;
    combatHeroes.Knight.sunSwornTimer = 0;
    combatHeroes.Mage.partnerMagicMult = 1.0;
    combatHeroes.Mage.partnerBuffTimer = 0;
    combatHeroes.Mage.ascendedMagicFlow = false;
    combatHeroes.Mage.ascendedMagicTimer = 0;
  }

  function emitBanner(title, subtitle = '', kind = 'act') {
    if (onBanner) {
      onBanner({ title, subtitle, kind });
    }
  }

  function awardKnightKillXp(enemy, hitResult = null) {
    if (enemy && enemy._campaignXpAwarded) {
      return combatHeroes.Knight.level;
    }
    if (enemy) {
      enemy._campaignXpAwarded = true;
    }

    const xpGain = enemy?.isBoss
      ? HERO_STATS.Knight.xpPerKill * 4
      : enemy?.isElite
        ? HERO_STATS.Knight.xpPerKill * 2
        : HERO_STATS.Knight.xpPerKill;
    combatHeroes.Knight.kills += 1;
    combatHeroes.Knight.xp += xpGain;
    let leveledUp = false;
    while (
      combatHeroes.Knight.xp >= HERO_STATS.Knight.xpPerLevel &&
      combatHeroes.Knight.level < KNIGHT_MAX_LEVEL
    ) {
      combatHeroes.Knight.xp -= HERO_STATS.Knight.xpPerLevel;
      combatHeroes.Knight.level += 1;
      leveledUp = true;
    }
    if (leveledUp) {
      const stats = getKnightLevelStats(combatHeroes.Knight.level);
      emitBanner(
        `KNIGHT LEVEL ${combatHeroes.Knight.level} AWAKENED`,
        `Sword DMG ${(stats.dmgMult * 100).toFixed(0)}% · Ice Slow ${(stats.iceSlowFactor * 100).toFixed(0)}% · Fire Burn ${stats.fireBurnDps} DPS`,
        'blessing'
      );
    }

    // Shared Co-Op Kill-Energy (100% to killer, 60% to partner; zero flying 3D orbs!)
    const src = String(hitResult?.source || '');
    const isMageKill = Boolean(
      hitResult?.killerRole === 'Mage' ||
        hitResult?.isMagicKill ||
        src === 'frost_lance' ||
        src === 'cinder_fall' ||
        src === 'shatterlance' ||
        src === 'storm_lance' ||
        src === 'storm_cataclysm' ||
        src.startsWith('mage_')
    );
    const killerRole = isMageKill ? 'Mage' : 'Knight';
    const partnerRole = killerRole === 'Knight' ? 'Mage' : 'Knight';
    const baseKillEnergy =
      typeof enemy?.qEnergyReward === 'number'
        ? enemy.qEnergyReward
        : enemy?.isBoss
          ? 70
          : enemy?.isElite
            ? 45
            : 18;
    const sharedRatio = Q_ENERGY_CONFIG.sharedKillRatio ?? 0.6;
    addHeroQEnergy(killerRole, Math.round(baseKillEnergy));
    addHeroQEnergy(partnerRole, Math.round(baseKillEnergy * sharedRatio));

    return combatHeroes.Knight.level;
  }

  function handleBossPhaseThreshold({ enemy, phasePct } = {}) {
    if (!enemy) return null;
    if (!enemy._campaignPhaseAwarded) {
      enemy._campaignPhaseAwarded = new Set();
    }
    if (enemy._campaignPhaseAwarded.has(phasePct)) {
      return null;
    }
    enemy._campaignPhaseAwarded.add(phasePct);

    const bonus = Q_ENERGY_CONFIG.bossPhaseBonusBoth || 35;
    addHeroQEnergy('Knight', bonus);
    addHeroQEnergy('Mage', bonus);
    const pctLabel = Math.round((Number(phasePct) || 0.7) * 100);
    emitBanner(
      `BOSS PHASE THRESHOLD (${pctLabel}% HP) · +${bonus} Q ENERGY`,
      'Shared Awakening Surge Fills Both Lovers’ Ultimate Gauges!',
      'ultimate'
    );
    return { phasePct, bonus, knightQEnergy: combatHeroes.Knight.qEnergy, mageQEnergy: combatHeroes.Mage.qEnergy };
  }

  function awardPerfectDodgeEnergy(heroId = 'Knight') {
    const key = String(heroId || 'Knight').toLowerCase() === 'mage' ? 'Mage' : 'Knight';
    combatHeroes[key].perfectDodgeBuff = true;
    addHeroQEnergy(key, Q_ENERGY_CONFIG.perfectDodgeBonus || 12);
    return combatHeroes[key].qEnergy;
  }

  function getPartnerDistance(posA, posB) {
    if (!posA || !posB) return 0;
    return Math.hypot((posA.x ?? 0) - (posB.x ?? 0), (posA.z ?? 0) - (posB.z ?? 0));
  }

  function isWithinPowerupTether(heroStates = null) {
    if (heroStates?.Knight && heroStates?.Mage) {
      return getPartnerDistance(heroStates.Knight, heroStates.Mage) <= DIVINE_BLESSING_TETHER_DISTANCE;
    }
    return true;
  }

  function getNearbyLivingEnemies(centerPos, radius = 18.0) {
    if (!enemyManager || !Array.isArray(enemyManager.activeEnemies)) return [];
    const hasCoords =
      centerPos && Number.isFinite(Number(centerPos.x)) && Number.isFinite(Number(centerPos.z));
    return enemyManager.activeEnemies.filter((e) => {
      if (!e || e.dead || e.active === false || (e.hp !== undefined && e.hp <= 0)) return false;
      if (!hasCoords) return true;
      return Math.hypot(e.x - centerPos.x, e.z - centerPos.z) <= radius;
    });
  }

  function isStoneContested(stoneOrPos, heroStates = null, radius = 20.0) {
    if (!enemyManager || !Array.isArray(enemyManager.activeEnemies)) return false;
    const sx = stoneOrPos?.position?.x ?? stoneOrPos?.x;
    const sz = stoneOrPos?.position?.z ?? stoneOrPos?.z;
    if (Number.isFinite(sx) && Number.isFinite(sz)) {
      if (getNearbyLivingEnemies({ x: sx, z: sz }, radius).length > 0) return true;
    }
    const k = heroStates?.Knight || heroStates?.knight || lastHeroStates?.Knight;
    const m = heroStates?.Mage || heroStates?.mage || lastHeroStates?.Mage;
    if (k && Number.isFinite(k.x) && Number.isFinite(k.z)) {
      if (getNearbyLivingEnemies(k, 16.0).length > 0) return true;
    }
    if (m && Number.isFinite(m.x) && Number.isFinite(m.z)) {
      if (getNearbyLivingEnemies(m, 16.0).length > 0) return true;
    }
    const rawId = String(stoneOrPos?.siteId || stoneOrPos?.id || '').toLowerCase();
    const shKey =
      rawId.includes('grove') || rawId.includes('site2')
        ? 'site2_platform'
        : rawId.includes('pier') || rawId.includes('wall') || rawId.includes('site3')
          ? 'site3_wall'
          : rawId.includes('well') || rawId.includes('plaza') || rawId.includes('site1')
            ? 'site1_well'
            : null;
    if (
      shKey &&
      activeStrongholdIds.has(shKey) &&
      (enemyManager.activeEnemies.some((e) => e && !e.dead && e.active !== false) ||
        (Array.isArray(enemyManager.spawnQueue) && enemyManager.spawnQueue.length > 0))
    ) {
      return true;
    }
    return false;
  }

  function isMiracleReady(heroStates = null) {
    if (!isStage3Unlocked()) return false;
    if (modeBMiracleCd > 0.05) return false;
    const k = heroStates?.Knight || heroStates?.knight;
    const m = heroStates?.Mage || heroStates?.mage;
    const dist = k && m ? getPartnerDistance(k, m) : 0;
    if (dist > COMMUNE_MAX_DISTANCE) return false;

    const kDowned = Boolean(combatHeroes.Knight.downed || k?.downed);
    const mDowned = Boolean(combatHeroes.Mage.downed || m?.downed);
    if (kDowned && mDowned) return false;

    const kHpRatio = combatHeroes.Knight.hp / Math.max(1, combatHeroes.Knight.maxHp);
    const mHpRatio = combatHeroes.Mage.hp / Math.max(1, combatHeroes.Mage.maxHp);
    const critical =
      kDowned ||
      mDowned ||
      kHpRatio <= COMMUNE_COMBAT_HP_THRESHOLD ||
      mHpRatio <= COMMUNE_COMBAT_HP_THRESHOLD;
    return critical;
  }

  function canCommuneTogether(heroStates) {
    const k = heroStates?.Knight || heroStates?.knight;
    const m = heroStates?.Mage || heroStates?.mage;
    const dist = getPartnerDistance(k, m);
    const kDowned = Boolean(combatHeroes.Knight.downed || k?.downed);
    const mDowned = Boolean(combatHeroes.Mage.downed || m?.downed);
    const anyDowned = kDowned || mDowned;
    const bothDowned = kDowned && mDowned;

    const kHpRatio = combatHeroes.Knight.hp / Math.max(1, combatHeroes.Knight.maxHp);
    const mHpRatio = combatHeroes.Mage.hp / Math.max(1, combatHeroes.Mage.maxHp);
    const anyLowHp =
      kHpRatio < COMMUNE_COMBAT_HP_THRESHOLD || mHpRatio < COMMUNE_COMBAT_HP_THRESHOLD;

    const hasHeroCoords =
      openValleyMode &&
      ((k && Number.isFinite(k.x) && Number.isFinite(k.z)) ||
        (m && Number.isFinite(m.x) && Number.isFinite(m.z)));
    const inCombat = hasHeroCoords
      ? (k ? getNearbyLivingEnemies(k, 18.0).length > 0 : false) ||
        (m ? getNearbyLivingEnemies(m, 18.0).length > 0 : false)
      : Boolean(
          enemyManager &&
            Array.isArray(enemyManager.activeEnemies) &&
            enemyManager.activeEnemies.some(
              (e) => e && !e.dead && (e.hp === undefined || e.hp > 0) && e.active !== false
            )
        );

    if (bothDowned) {
      return {
        allowed: false,
        reason: 'both_downed',
        distance: dist,
        maxDist: COMMUNE_MAX_DISTANCE,
        inCombat,
        anyDowned,
        bothDowned,
        anyLowHp,
      };
    }

    if (dist > COMMUNE_MAX_DISTANCE) {
      return {
        allowed: false,
        reason: 'too_far',
        distance: dist,
        maxDist: COMMUNE_MAX_DISTANCE,
        inCombat,
        anyDowned,
        bothDowned,
        anyLowHp,
      };
    }

    if (inCombat && !(anyDowned || anyLowHp)) {
      return {
        allowed: false,
        reason: 'combat_hp_too_high',
        distance: dist,
        maxDist: COMMUNE_MAX_DISTANCE,
        inCombat,
        anyDowned,
        bothDowned,
        anyLowHp,
      };
    }

    return {
      allowed: true,
      reason: null,
      distance: dist,
      maxDist: COMMUNE_MAX_DISTANCE,
      inCombat,
      anyDowned,
      bothDowned,
      anyLowHp,
    };
  }
  const canStartDivinePrayer = canCommuneTogether;

  const _tmpStaffTip = new THREE.Vector3();

  function getMageStaffTipPos(mageState) {
    const weaponOrSocket =
      mageState?.char?.equippedWeapons?.['handSlot.r'] ||
      mageState?.char?.sockets?.['handSlot.r'] ||
      mageState?.char?.sockets?.['handslot.r'];
    if (weaponOrSocket && typeof weaponOrSocket.localToWorld === 'function') {
      mageState.char?.group?.updateMatrixWorld?.(true);
      _tmpStaffTip.set(0, 0.95, 0);
      weaponOrSocket.localToWorld(_tmpStaffTip);
      return { x: _tmpStaffTip.x, y: _tmpStaffTip.y, z: _tmpStaffTip.z };
    }
    const fx = Math.sin(mageState?.yaw || 0);
    const fz = Math.cos(mageState?.yaw || 0);
    const mx = mageState?.x || 0;
    const mz = mageState?.z || 0;
    return {
      x: mx + fx * 0.65,
      y: (mageState?.y ?? walkableHeightAt(mx, mz)) + 1.35,
      z: mz + fz * 0.65,
    };
  }

  function fireMageStaffVolleyVfx(mageState, targetPos, comboIndex = 0) {
    if (!vfxKit?.mageBolt?.fireComboVolley) return;
    const staffTip = getMageStaffTipPos(mageState);
    const yaw = mageState?.yaw || 0;
    const dx = targetPos ? targetPos.x - staffTip.x : Math.sin(yaw);
    const dz = targetPos ? targetPos.z - staffTip.z : Math.cos(yaw);
    const dLen = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / dLen, y: 0, z: dz / dLen };
    const resolvedTarget = targetPos || {
      x: staffTip.x + dir.x * 11.5,
      y: walkableHeightAt(staffTip.x + dir.x * 11.5, staffTip.z + dir.z * 11.5) + 1.08,
      z: staffTip.z + dir.z * 11.5,
    };

    const handForward = vfxKit.mageBolt.config?.handForward ?? 0.55;
    const handHeight = vfxKit.mageBolt.config?.handHeight ?? 1.24;
    const origin = {
      x: staffTip.x - dir.x * handForward,
      y: staffTip.y - handHeight,
      z: staffTip.z - dir.z * handForward,
    };

    vfxKit.mageBolt.fireComboVolley({
      origin,
      direction: dir,
      targetPos: resolvedTarget,
      comboIndex,
    });
  }

  const tetherSurge = {
    active: false,
    style: 'rime',
    progress: 0,
    duration: 0.65,
  };

  function addResonance(amount) {
    heartResonance = clamp(heartResonance + amount, 0, 100);
    return heartResonance;
  }

  function setKnightBreathing(styleId, duration = KNIGHT_POWER_SWORD_DURATION) {
    const mapped =
      styleId === 'ice' ? 'rime' : styleId === 'fire' ? 'solar' : styleId;
    const validStyle = BREATHING_STYLES[mapped] ? mapped : 'none';
    combatHeroes.Knight.breathingStyle = validStyle;
    combatHeroes.Knight.breathingTimer = validStyle === 'none' ? 0 : duration;

    if (validStyle !== 'none') {
      tetherSurge.active = true;
      tetherSurge.style = validStyle;
      tetherSurge.progress = 0;
      tetherSurge.duration = 0.65;
    }

    if (vfxKit?.swordVfx?.setInfusion) {
      vfxKit.swordVfx.setInfusion(validStyle, duration);
    }
    if (combatSfx?.playBreathingIgnition && validStyle !== 'none') {
      combatSfx.playBreathingIgnition(validStyle);
    }
    if (onInfusionChanged) {
      onInfusionChanged(validStyle, duration, BREATHING_STYLES[validStyle]);
    }
  }

  function toggleHeroElement(heroId = 'Knight') {
    const norm = String(heroId || 'Knight').toLowerCase() === 'mage' ? 'Mage' : 'Knight';
    if (norm === 'Knight') {
      combatHeroes.Knight.selectedElement =
        combatHeroes.Knight.selectedElement === 'ice' ? 'fire' : 'ice';
      const queuedStyle = combatHeroes.Knight.selectedElement === 'fire' ? 'solar' : 'rime';
      // Summon Lock Rule: Tab ONLY queues the next element (`selectedElement`) for the next E press!
      // It NEVER mutates an already-summoned active sword (`summonedElement` / `breathingStyle`).
      onHudStateChanged?.(getStateSnapshot());
      return {
        heroId: 'Knight',
        element: combatHeroes.Knight.selectedElement,
        summonedElement: combatHeroes.Knight.summonedElement,
        queuedBreathingStyle: queuedStyle,
        breathingStyle: combatHeroes.Knight.breathingStyle,
      };
    }

    combatHeroes.Mage.selectedSpell =
      combatHeroes.Mage.selectedSpell === 'frost_lance' ? 'cinder_fall' : 'frost_lance';
    combatHeroes.Mage.selectedElement =
      combatHeroes.Mage.selectedSpell === 'frost_lance' ? 'ice' : 'fire';
    onHudStateChanged?.(getStateSnapshot());
    return {
      heroId: 'Mage',
      element: combatHeroes.Mage.selectedElement,
      spellId: combatHeroes.Mage.selectedSpell,
    };
  }

  function setKnightShieldBlocking(active = false) {
    const k = combatHeroes.Knight;
    // A broken guard can't be raised again until the stagger ends.
    k.shieldBlocking = Boolean(active) && k.guardBrokenTimer <= 0 && k.guard > 0 && !k.downed;
    if (!k.shieldBlocking) k.guardRegenDelay = KNIGHT_GUARD_REGEN_DELAY;
    // Block edge drives parry timing (±0.15 s of an enemy contact frame).
    enemyManager?.notifyKnightBlock?.(k.shieldBlocking);
    onHudStateChanged?.(getStateSnapshot());
    return k.shieldBlocking;
  }

  // Parry: the attacker staggers (enemy-manager) and the Knight's guard is refunded.
  function handleEnemyParried(enemy) {
    const k = combatHeroes.Knight;
    k.guard = KNIGHT_GUARD_MAX;
    k.guardRegenDelay = 0;
    combatSfx?.playShieldChime?.();
    emitBanner('PARRY!', `${enemy?.name || 'The enemy'} reels from the perfectly timed guard.`, 'detonation');
  }
  enemyManager?.setOnParry?.(handleEnemyParried);
  enemyManager?.setOnWindup?.((enemy, attackId, atk) => {
    const kind =
      atk?.blockable === false || atk?.hyperArmor || enemy?.isBoss ? 'heavy' : atk?.area ? 'area' : atk?.ranged ? 'cast' : 'melee';
    combatSfx?.playEnemyWindup?.(kind);
  });

  // Frontal-arc test: is `pos` within the Knight's block arc?
  function isInKnightFrontArc(pos) {
    const k = lastHeroStates?.Knight;
    if (!k || !pos) return true;
    const dx = (pos.x ?? 0) - k.x;
    const dz = (pos.z ?? 0) - k.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) return true;
    const fx = Math.sin(k.yaw || 0);
    const fz = Math.cos(k.yaw || 0);
    return (dx * fx + dz * fz) / len >= SHIELD_ARC_COS;
  }

  function knightCoversMage(enemy) {
    const k = lastHeroStates?.Knight;
    const m = lastHeroStates?.Mage;
    if (!k || !m) return true;
    if (Math.hypot(m.x - k.x, m.z - k.z) > SHIELD_COVER_RADIUS) return false;
    return isInKnightFrontArc(enemy);
  }

  function drainKnightGuard(amount) {
    const k = combatHeroes.Knight;
    k.guard = Math.max(0, k.guard - amount);
    k.guardRegenDelay = KNIGHT_GUARD_REGEN_DELAY;
    if (k.guard <= 0 && k.shieldBlocking) {
      k.shieldBlocking = false;
      enemyManager?.notifyKnightBlock?.(false);
      k.guardBrokenTimer = KNIGHT_GUARD_BREAK_STUN;
      emitBanner('GUARD BROKEN', 'The Knight staggers. Give him a moment to recover.', 'warning');
    }
  }

  function reviveAllInstant() {
    // Wave clear lifts a fallen partner only to a fragile 30%.
    for (const h of Object.values(combatHeroes)) {
      if (h.downed) {
        h.downed = false;
        h.reviveProgress = 0;
        h.hp = Math.max(h.hp, Math.round(h.maxHp * 0.3));
      }
    }
  }

  function startWave(nextWaveIdx) {
    const act = ACT_DEFINITIONS[currentActId];
    if (!act || !act.waves || nextWaveIdx < 0 || nextWaveIdx >= act.waves.length) {
      return false;
    }
    waveIndex = nextWaveIdx;
    const waveDef = act.waves[waveIndex];
    if (enemyManager) {
      enemyManager.setCurrentActId(currentActId);
      enemyManager.spawnWave(waveDef, currentActId);
    }
    emitBanner(act.bannerTitle || act.name, waveDef.label, 'wave');
    if (onWaveChanged) {
      onWaveChanged(waveDef, waveIndex, act);
    }
    return true;
  }

  function transitionToAct(nextActId, { autoTriggerWaves = false } = {}) {
    if (!ACT_DEFINITIONS[nextActId]) return;
    currentActId = nextActId;
    actIndex = ACT_SEQUENCE.indexOf(nextActId);
    waveIndex = -1;
    actTriggered = false;

    const act = ACT_DEFINITIONS[currentActId];
    if (enemyManager) {
      enemyManager.setCurrentActId(currentActId);
      enemyManager.clearAllEnemies();
    }

    // Do NOT force-switch sky time-of-day on combat act transitions; natural 15-min cycle & Manual Override govern ToD.
    if (onActChanged) {
      onActChanged(act, actIndex);
    }
    emitBanner(act.bannerTitle || act.name, act.bannerSubtitle || '', 'act');

    if (nextActId === 'victory_dawn') {
      combatHeroes.Knight.hp = combatHeroes.Knight.maxHp;
      combatHeroes.Mage.hp = combatHeroes.Mage.maxHp;
      combatHeroes.Knight.downed = false;
      combatHeroes.Mage.downed = false;
      if (combatSfx?.playVictoryFanfare) {
        combatSfx.playVictoryFanfare();
      }
    } else if (autoTriggerWaves && act.waves && act.waves.length > 0) {
      actTriggered = true;
      startWave(0);
    }
  }

  function activatePierSanctuary() {
    const act = ACT_DEFINITIONS.interlude_pier;
    const reward = act.sanctuaryReward;
    actTriggered = true;

    combatHeroes.Knight.hp = combatHeroes.Knight.maxHp;
    combatHeroes.Mage.hp = combatHeroes.Mage.maxHp;
    combatHeroes.Knight.downed = false;
    combatHeroes.Mage.downed = false;
    combatHeroes.Knight.shield = reward.shield;
    combatHeroes.Knight.shieldTimer = reward.shieldDuration;
    combatHeroes.Mage.shield = reward.shield;
    combatHeroes.Mage.shieldTimer = reward.shieldDuration;
    combatHeroes.Knight.empoweredBreathing = true;
    combatHeroes.Mage.empoweredBreathing = true;

    addResonance(reward.resonanceGain);
    setKnightBreathing('solar', KNIGHT_POWER_SWORD_DURATION);

    if (combatSfx?.playShieldChime) {
      combatSfx.playShieldChime();
    }
    emitBanner(
      'SANCTUARY BRAZIER KINDLED',
      'Full Heal · +35 Golden Ward Shield · Empowered Breathing (+25% DMG)',
      'blessing'
    );

    transitionToAct('act2_plaza');
  }

  function handlePlayerHit(targetHeroState, enemy, rawDmg, hitOptions = {}) {
    const heroId = targetHeroState?.id || 'Knight';
    const h = combatHeroes[heroId] || combatHeroes.Knight;
    if (
      divineBlessingActive ||
      (communeChannelActive && communeMode === 'divine_miracle') ||
      (verdictSequence.active && verdictSequence.kind === 'blessing')
    ) {
      return {
        absorbed: rawDmg,
        hpLost: 0,
        downed: false,
        invincible: true,
        interceptedByKnight: false,
      };
    }
    if (h.downed || h.iframeTimer > 0) {
      return { absorbed: 0, hpLost: 0, downed: false, interceptedByKnight: false };
    }

    // A shielding Knight covers a nearby Mage against attacks from his front arc.
    // DR is applied once, on the Knight's own path below.
    if (
      heroId === 'Mage' &&
      combatHeroes.Knight.shieldBlocking && !enemy?.currentHit?.unblockable &&
      !combatHeroes.Knight.downed &&
      knightCoversMage(enemy)
    ) {
      const kRes = handlePlayerHit({ id: 'Knight', char: lastHeroStates?.Knight?.char }, enemy, rawDmg);
      return {
        absorbed: rawDmg - (kRes?.hpLost || 0),
        hpLost: 0,
        knightHpLost: kRes?.hpLost || 0,
        downed: false,
        interceptedByKnight: true,
      };
    }

    let effectiveDmg = rawDmg;
    if (vfxKit !== null && enemy !== null && !hitOptions?.friendlyFire) {
      if ((h.burstHitTimer || 0) > 0) {
        effectiveDmg = Math.max(1, Math.round(effectiveDmg * 0.35));
      }
      h.burstHitTimer = 0.28;
    }

    const blockedByShield = Boolean(
      heroId === 'Knight' &&
        combatHeroes.Knight.shieldBlocking &&
        !enemy?.currentHit?.unblockable &&
        !hitOptions?.alreadyReduced &&
        isInKnightFrontArc(enemy)
    );
    if (blockedByShield) {
      effectiveDmg = Math.max(
        1,
        Math.round(effectiveDmg * (1.0 - KNIGHT_SHIELD_BLOCK_DR))
      );
      drainKnightGuard(rawDmg * KNIGHT_GUARD_HIT_COST + (enemy?.currentHit?.guardDmg || 0));
    }

    let rem = effectiveDmg;
    let absorbed = 0;
    if (h.shield > 0) {
      absorbed = Math.min(h.shield, rem);
      h.shield -= absorbed;
      rem -= absorbed;
    }

    // Interrupt any active co-op proximity revive if the reviving hero takes unblocked HP damage (> 5 chip damage)!
    const isBlockedKnightChip =
      heroId === 'Knight' && combatHeroes.Knight.shieldBlocking && rem <= 5;
    if (rem > 0 && !isBlockedKnightChip) {
      combatHeroes.Knight.reviveTimer = 0;
      combatHeroes.Mage.reviveTimer = 0;
    }

    h.hp = Math.max(0, h.hp - rem);
    const partnerOfHit = combatHeroes[heroId === 'Knight' ? 'Mage' : 'Knight'];
    if (rem > 0 && !isBlockedKnightChip && partnerOfHit?.downed) partnerOfHit.reviveProgress *= 0.5;
    if (combatSfx?.playPlayerHit) {
      combatSfx.playPlayerHit();
    }
    if (h.hp <= 0) {
      h.hp = 0;
      h.downed = true;
      h.reviveProgress = 0;
      h.reviveTimer = 0;
      if (targetHeroState?.char?.play) {
        targetHeroState.char.play('death', { loop: false, fade: 0.1, force: true });
      }
      emitBanner(
        `${heroId.toUpperCase()} HAS FALLEN!`,
        'Stand beside your beloved to lift them back up, or pray.',
        'warning'
      );
    } else if (hitOptions?.friendlyFire && rem > 0) {
      if (targetHeroState && typeof targetHeroState === 'object') {
        targetHeroState.hitFlashTimer = 0.18;
        targetHeroState.hitFlashBlocked = false;
        targetHeroState.actionState = 'hit_A';
        targetHeroState.actionTimer = Math.max(targetHeroState.actionTimer || 0, 0.48);
      }
      targetHeroState?.char?.play?.('hit_A', { loop: false, fade: 0.06, force: true });
      friendlyFireCallback?.(targetHeroState, {
        heroId,
        damageDealt: rem,
        source: hitOptions.source || 'friendly_fire',
        element: hitOptions.element || 'fire',
      });
    } else if (rem > 0 || absorbed > 0) {
      if (targetHeroState && typeof targetHeroState === 'object') {
        targetHeroState.hitFlashTimer = 0.18;
        targetHeroState.hitFlashBlocked = blockedByShield || (rem === 0 && absorbed > 0);
        if (enemy && typeof enemy.x === 'number' && typeof targetHeroState.x === 'number') {
          let kbx = targetHeroState.x - enemy.x;
          let kbz = targetHeroState.z - enemy.z;
          const kbLen = Math.hypot(kbx, kbz) || 1;
          kbx /= kbLen;
          kbz /= kbLen;
          const kbDist = blockedByShield ? 0.09 : 0.26;
          targetHeroState.hitKnockbackX = kbx * kbDist;
          targetHeroState.hitKnockbackZ = kbz * kbDist;
        }
        if (
          targetHeroState.char?.play &&
          !blockedByShield &&
          rem > 0 &&
          !targetHeroState.actionState &&
          !targetHeroState.shieldBlocking &&
          !targetHeroState.praying
        ) {
          targetHeroState.actionState = 'hit_A';
          targetHeroState.actionTimer = 0.22;
          targetHeroState.char.play('hit_A', {
            loop: false,
            fade: 0.04,
            timeScale: 1.35,
            force: true,
          });
        }
      }
      playerDamagedCallback?.(targetHeroState, {
        heroId,
        damageDealt: rem,
        absorbed,
        blockedByShield,
        interceptedByKnight: Boolean(hitOptions?.interceptedByKnight),
        source: enemy?.currentHit?.attackId || enemy?.archetype || 'enemy_attack',
      });
    }
    return {
      absorbed,
      hpLost: rem,
      downed: h.downed,
      interceptedByKnight: Boolean(hitOptions?.interceptedByKnight),
    };
  }

  function applyCommuneVerdict(judgment = {}, speakerRole = 'Knight', heroStates = null) {
    const verdict = String(judgment?.verdict || 'smite').toLowerCase();
    const speakerKey =
      String(speakerRole || 'Knight').toLowerCase() === 'mage' ? 'Mage' : 'Knight';
    const partnerKey = speakerKey === 'Knight' ? 'Mage' : 'Knight';

    const speakerHero = state[speakerKey];
    const partnerHero = state[partnerKey];
    const speakerEntity =
      heroStates?.[speakerKey] || heroStates?.[speakerKey.toLowerCase()] || null;
    const partnerEntity =
      heroStates?.[partnerKey] || heroStates?.[partnerKey.toLowerCase()] || null;

    const speakerPos = speakerEntity || { x: 2.8, y: 0, z: 14.5 };
    let partnerPos = partnerEntity || {
      x: (speakerPos.x ?? 2.8) + 1.8,
      y: speakerPos.y ?? 0,
      z: (speakerPos.z ?? 14.5) + 0.5,
    };

    communeChannelActive = false;
    communeMode = 'normal';
    enemyManager?.setGlobalEnemyTimeScale?.(1.0);

    const rawHpDelta =
      typeof judgment?.hpDelta === 'number' && Number.isFinite(judgment.hpDelta)
        ? judgment.hpDelta
        : null;
    const rawHpDeltaPct =
      typeof judgment?.hpDeltaPct === 'number' && Number.isFinite(judgment.hpDeltaPct)
        ? judgment.hpDeltaPct
        : null;
    const anyDownedNow = Boolean(combatHeroes.Knight.downed || combatHeroes.Mage.downed);

    const explicitPrayerMode = judgment?.prayerMode
      ? String(judgment.prayerMode).toLowerCase()
      : null;
    const isSmiteVerdict =
      explicitPrayerMode === 'smite' ||
      verdict === 'smite' ||
      verdict === 'rude_smite' ||
      verdict === 'rose_gommage';

    let resolvedPrayerMode = explicitPrayerMode;
    if (!resolvedPrayerMode) {
      if (isSmiteVerdict) {
        resolvedPrayerMode = 'smite';
      } else if (
        verdict === 'awakening' ||
        Boolean(judgment?.unlocksStage) ||
        Boolean(judgment?.stoneSolvedId)
      ) {
        resolvedPrayerMode = 'awakening';
      } else if (
        verdict === 'selfish_penalty' ||
        (rawHpDelta !== null && rawHpDelta < 0) ||
        (rawHpDeltaPct !== null && rawHpDeltaPct < 0)
      ) {
        resolvedPrayerMode = 'penalty';
      } else if (verdict === 'sarcastic_pat') {
        resolvedPrayerMode = 'pat';
      } else if (
        !anyDownedNow &&
        (verdict === 'grace' ||
          (verdict === 'heal' &&
            ((rawHpDelta !== null && rawHpDelta > 0 && rawHpDelta <= 35) ||
              (rawHpDeltaPct !== null && rawHpDeltaPct > 0 && rawHpDeltaPct <= 0.35))))
      ) {
        resolvedPrayerMode = 'field_heal';
      } else {
        resolvedPrayerMode = 'divine_miracle';
      }
    }

    // 1. SMITE (`smite`, `rude_smite`, `rose_gommage`)
    if (resolvedPrayerMode === 'smite' || isSmiteVerdict) {
      clearDivineBlessing();
      if (
        partnerEntity &&
        speakerEntity &&
        Math.hypot(
          (partnerEntity.x ?? 0) - (speakerEntity.x ?? 0),
          (partnerEntity.z ?? 0) - (speakerEntity.z ?? 0)
        ) > 2.4
      ) {
        partnerEntity.x = (speakerPos.x ?? 0) + 1.45;
        partnerEntity.z = (speakerPos.z ?? 0) + 0.35;
        partnerEntity.y = walkableHeightAt(partnerEntity.x, partnerEntity.z);
        partnerEntity.char?.group?.position?.set?.(
          partnerEntity.x,
          partnerEntity.y,
          partnerEntity.z
        );
        partnerPos = partnerEntity;
      }

      const killBoth = Boolean(
        verdict === 'rose_gommage' ||
          judgment?.killBoth ||
          judgment?.bothKill ||
          judgment?.triggerRoseGommageDeath
      );
      const partnerAlreadyDowned = Boolean(partnerHero.downed || killBoth);
      const dissolveRole = partnerAlreadyDowned ? speakerKey : partnerKey;

      verdictSequence.active = true;
      verdictSequence.kind = 'smite';
      verdictSequence.verdict = verdict;
      verdictSequence.elapsed = 0;
      verdictSequence.duration = 2.8;
      verdictSequence.beat = 1;
      verdictSequence.speakerRole = speakerKey;
      verdictSequence.dissolveRole = dissolveRole;

      if (partnerAlreadyDowned) {
        // Case 2: Partner was ALREADY dead/downed when Smite hit (or rose_gommage) -> Both dissolve & die (Total Party Wipe)
        speakerHero.shield = 0;
        speakerHero.shieldTimer = 0;
        speakerHero.hp = 0;
        speakerHero.downed = true;
        speakerHero.reviveProgress = 0;
        partnerHero.shield = 0;
        partnerHero.shieldTimer = 0;
        partnerHero.hp = 0;
        partnerHero.downed = true;
        partnerHero.reviveProgress = 0;
        vfxKit?.artoriousVfx?.triggerSmite?.(speakerPos, partnerPos);
        if (speakerEntity) {
          speakerEntity.praying = false;
          speakerEntity.actionState = 'death';
          speakerEntity.actionTimer = 2.8;
          speakerEntity.char?.play?.('death', { loop: false, fade: 0.08, force: true });
        }
        if (partnerEntity) {
          partnerEntity.praying = false;
          partnerEntity.actionState = 'death';
          partnerEntity.actionTimer = 2.8;
          partnerEntity.char?.play?.('death', { loop: false, fade: 0.08, force: true });
        }
        combatSfx?.playPlayerHit?.();
        emitBanner(
          'DIVINE SMITE · TOTAL PARTY WIPE!',
          judgment?.divine_quote ||
            judgment?.subtitle ||
            'Both lovers dissolve into blood-crimson petals — Returning to the Sanctuary Stone...',
          'warning'
        );
      } else {
        // Case 1: Both lovers were alive when Smite hit -> Partner dissolves & dies, Speaker drops to 10% Max HP
        partnerHero.shield = 0;
        partnerHero.shieldTimer = 0;
        partnerHero.hp = 0;
        partnerHero.downed = true;
        partnerHero.reviveProgress = 0;

        speakerHero.shield = 0;
        speakerHero.shieldTimer = 0;
        speakerHero.downed = false;
        speakerHero.hp = Math.max(1, Math.round(speakerHero.maxHp * 0.1));

        vfxKit?.artoriousVfx?.triggerSmite?.(partnerPos, speakerPos);

        if (speakerEntity) {
          speakerEntity.actionState = 'hit_b';
          speakerEntity.actionTimer = 0.65;
          speakerEntity.praying = false;
          speakerEntity.char?.play?.('hit_b', { loop: false, fade: 0.06, force: true });
        }
        if (partnerEntity) {
          partnerEntity.praying = false;
          partnerEntity.actionState = 'death';
          partnerEntity.actionTimer = 2.8;
          partnerEntity.char?.play?.('death', { loop: false, fade: 0.08, force: true });
        }
        combatSfx?.playPlayerHit?.();
        emitBanner(
          `DIVINE SMITE · ${partnerKey.toUpperCase()} DISSOLVED!`,
          judgment?.divine_quote ||
            judgment?.subtitle ||
            `${partnerKey} dissolved into crimson petals · ${speakerKey} reduced to 10% HP (${speakerHero.hp} HP)!`,
          'warning'
        );
      }

      onHudStateChanged?.(getStateSnapshot(heroStates));
      return {
        verdict,
        prayerMode: 'smite',
        speakerRole: speakerKey,
        dissolveRole,
        speakerHp: speakerHero.hp,
        partnerHp: partnerHero.hp,
        totalPartyWipe: Boolean(combatHeroes.Knight.downed && combatHeroes.Mage.downed),
      };
    }

    // 2. PENALTY (`selfish_penalty`, negative `hpDeltaPct` / `hpDelta`)
    if (resolvedPrayerMode === 'penalty') {
      const loss =
        rawHpDeltaPct !== null
          ? Math.max(1, Math.round(speakerHero.maxHp * Math.abs(rawHpDeltaPct)))
          : rawHpDelta !== null
            ? Math.max(1, Math.round(Math.abs(rawHpDelta)))
            : Math.max(1, Math.round(speakerHero.maxHp * 0.1));
      speakerHero.hp = Math.max(1, speakerHero.hp - loss);
      if (speakerEntity) {
        speakerEntity.praying = false;
        speakerEntity.actionState = 'hit_b';
        speakerEntity.actionTimer = 0.55;
        speakerEntity.char?.play?.('hit_b', { loop: false, fade: 0.06, force: true });
      }
      if (partnerEntity) partnerEntity.praying = false;
      combatSfx?.playPlayerHit?.();
      emitBanner(
        `SELFISH VOW REBUKED · -${loss} HP`,
        judgment?.divine_quote ||
          judgment?.subtitle ||
          'Love looks outward, mortal — speak for your beloved, not your vanity.',
        'warning'
      );
      onHudStateChanged?.(getStateSnapshot(heroStates));
      return {
        verdict: 'selfish_penalty',
        prayerMode: 'penalty',
        sequenceActive: false,
        hpDelta: -loss,
        speakerRole: speakerKey,
        partnerRole: partnerKey,
        speakerHp: speakerHero.hp,
        partnerHp: partnerHero.hp,
      };
    }

    // 3. AWAKENING (Stone Riddle Solved / Stage Unlocked)
    if (resolvedPrayerMode === 'awakening') {
      stoneGuessCd = 3.0;
      if (rawHpDeltaPct !== null && rawHpDeltaPct < 0) {
        const dock = Math.max(1, Math.round(speakerHero.maxHp * Math.abs(rawHpDeltaPct)));
        const floorHp = Math.max(1, Math.round(speakerHero.maxHp * 0.15));
        speakerHero.hp = Math.max(floorHp, speakerHero.hp - dock);
      } else {
        const healPct =
          rawHpDeltaPct !== null && rawHpDeltaPct > 0 ? clamp(rawHpDeltaPct, 0.6, 1.0) : 1.0;
        for (const h of [combatHeroes.Knight, combatHeroes.Mage]) {
          if (h.downed) {
            h.downed = false;
            h.reviveProgress = 0;
            h.hp = Math.max(
              Math.round(h.maxHp * PARTNER_REVIVE_HP),
              Math.round(h.maxHp * healPct)
            );
          } else {
            h.hp = clamp(h.hp + Math.round(h.maxHp * healPct), 1, h.maxHp);
          }
        }
      }
      if (speakerEntity) speakerEntity.praying = false;
      if (partnerEntity) partnerEntity.praying = false;

      awakeningEclipseTimer = 3.5;

      if (Number(judgment?.stageUnlocked) >= 3) {
        addHeroQEnergy('Knight', combatHeroes.Knight.qEnergyMax);
        addHeroQEnergy('Mage', combatHeroes.Mage.qEnergyMax);
      }

      vfxKit?.artoriousVfx?.triggerHeal?.(speakerPos, partnerPos);
      combatSfx?.playShieldChime?.();
      addResonance(35);
      emitBanner(
        judgment?.stoneSolvedId
          ? 'SACRED STONE SANCTIFIED · RIDDLE ANSWERED'
          : 'DIVINE AWAKENING · COVENANT UNSEALED',
        judgment?.divine_quote ||
          judgment?.subtitle ||
          'The ancient inscription answers your voice — new elemental power awakens!',
        'blessing'
      );
      onHudStateChanged?.(getStateSnapshot(heroStates));
      return {
        verdict: 'awakening',
        prayerMode: 'awakening',
        sequenceActive: false,
        awakeningEclipseActive:
          !vfxKit && judgment?.stoneSolvedId === 'stone_grove'
            ? false
            : awakeningEclipseTimer > 0,
        speakerRole: speakerKey,
        partnerRole: partnerKey,
        knightHp: combatHeroes.Knight.hp,
        mageHp: combatHeroes.Mage.hp,
      };
    }

    // 4. MODE A: IN-PLACE FIELD PRAYER (`pat` +1% Max HP, `field_heal` `grace` +15% / `heal` +30% Max HP)
    // Never triggers red Eclipse sky, never slows enemies, never revives downed partner, never activates 25s invincibility!
    if (resolvedPrayerMode === 'pat' || resolvedPrayerMode === 'field_heal') {
      modeAHealCd = 25.0;
      const isPat = resolvedPrayerMode === 'pat' || verdict === 'sarcastic_pat';
      const defaultPct = isPat ? 0.01 : verdict === 'heal' ? 0.3 : 0.15;

      const kGain =
        rawHpDeltaPct !== null
          ? Math.max(1, Math.round(combatHeroes.Knight.maxHp * Math.abs(rawHpDeltaPct)))
          : rawHpDelta !== null
            ? Math.max(1, Math.round(rawHpDelta))
            : isPat
              ? Math.max(1, Math.round(combatHeroes.Knight.maxHp * 0.01))
              : Math.max(1, Math.round(combatHeroes.Knight.maxHp * defaultPct));
      const mGain =
        rawHpDeltaPct !== null
          ? Math.max(1, Math.round(combatHeroes.Mage.maxHp * Math.abs(rawHpDeltaPct)))
          : rawHpDelta !== null
            ? Math.max(1, Math.round(rawHpDelta))
            : isPat
              ? Math.max(1, Math.round(combatHeroes.Mage.maxHp * 0.01))
              : Math.max(1, Math.round(combatHeroes.Mage.maxHp * defaultPct));

      if (!combatHeroes.Knight.downed) {
        combatHeroes.Knight.hp = clamp(
          combatHeroes.Knight.hp + kGain,
          1,
          combatHeroes.Knight.maxHp
        );
      }
      if (!combatHeroes.Mage.downed) {
        combatHeroes.Mage.hp = clamp(
          combatHeroes.Mage.hp + mGain,
          1,
          combatHeroes.Mage.maxHp
        );
      }
      if (speakerEntity) speakerEntity.praying = false;
      if (partnerEntity) partnerEntity.praying = false;
      vfxKit?.artoriousVfx?.triggerHeal?.(speakerPos, partnerPos);
      combatSfx?.playShieldChime?.();
      addResonance(isPat ? 2 : 12);
      const speakerGain = speakerKey === 'Knight' ? kGain : mGain;
      emitBanner(
        isPat
          ? `AMUSED PAT ON THE HEAD · +${speakerGain} HP`
          : verdict === 'heal'
            ? `WARM FIELD HEAL · +${kGain} / +${mGain} HP`
            : `GENTLE GRACE · +${kGain} / +${mGain} HP`,
        judgment?.divine_quote ||
          judgment?.subtitle ||
          `A warm golden breeze mends your wounds in place (+${kGain} Knight / +${mGain} Mage HP).`,
        'blessing'
      );
      onHudStateChanged?.(getStateSnapshot(heroStates));
      return {
        verdict,
        prayerMode: isPat ? 'pat' : 'field_heal',
        sequenceActive: false,
        hpDelta: speakerGain,
        knightGain: kGain,
        mageGain: mGain,
        speakerRole: speakerKey,
        partnerRole: partnerKey,
        speakerHp: speakerHero.hp,
        partnerHp: partnerHero.hp,
        knightHp: combatHeroes.Knight.hp,
        mageHp: combatHeroes.Mage.hp,
      };
    }

    // 5. MODE B: EMERGENCY DIVINE MIRACLE (`divine_miracle` — 4.80s 4-Beat Resurrection & 25s Court of Dark Flowers)
    modeBMiracleCd = 90.0;
    const kx = heroStates?.Knight?.x ?? speakerPos.x ?? 0;
    const kz = heroStates?.Knight?.z ?? speakerPos.z ?? 0;
    const mx = heroStates?.Mage?.x ?? partnerPos.x ?? kx + 1.5;
    const mz = heroStates?.Mage?.z ?? partnerPos.z ?? kz;

    verdictSequence.active = true;
    verdictSequence.kind = 'blessing';
    verdictSequence.verdict = verdict;
    verdictSequence.elapsed = 0;
    verdictSequence.duration = 4.8;
    verdictSequence.beat = 1;
    verdictSequence.speakerRole = speakerKey;
    verdictSequence.dissolveRole = null;
    verdictSequence.knightWasDowned = Boolean(combatHeroes.Knight.downed);
    verdictSequence.mageWasDowned = Boolean(combatHeroes.Mage.downed);
    verdictSequence.startKnightHp = combatHeroes.Knight.downed ? 0 : combatHeroes.Knight.hp;
    verdictSequence.startMageHp = combatHeroes.Mage.downed ? 0 : combatHeroes.Mage.hp;
    verdictSequence.startKnightX = kx;
    verdictSequence.startKnightZ = kz;
    verdictSequence.startMageX = mx;
    verdictSequence.startMageZ = mz;
    verdictSequence.midX = (kx + mx) * 0.5;
    verdictSequence.midZ = (kz + mz) * 0.5;

    if (speakerEntity) {
      speakerEntity.praying = false;
    }
    if (partnerEntity) {
      partnerEntity.praying = false;
    }

    enemyManager?.blastEnemiesFromPoint?.(verdictSequence.midX, verdictSequence.midZ, 12.5, 12.5);
    const domeCenter = {
      x: verdictSequence.midX,
      y: walkableHeightAt(verdictSequence.midX, verdictSequence.midZ),
      z: verdictSequence.midZ,
    };

    if (verdict === 'heal') {
      vfxKit?.artoriousVfx?.triggerHeal?.(speakerPos, partnerPos);
      addResonance(25);
    } else if (verdict === 'miracle') {
      vfxKit?.artoriousVfx?.triggerMiracle?.(domeCenter, partnerPos);
      heartResonance = 100;
    } else {
      vfxKit?.artoriousVfx?.triggerBlessing?.(domeCenter, partnerPos);
      addResonance(50);
    }

    setKnightBreathing('eclipse', DIVINE_BLESSING_DURATION);
    combatSfx?.playShieldChime?.();
    emitBanner(
      verdictSequence.knightWasDowned || verdictSequence.mageWasDowned
        ? 'DIVINE RESURRECTION · COURT OF DARK FLOWERS'
        : 'DIVINE BLESSING · COURT OF DARK FLOWERS',
      judgment?.divine_quote ||
        judgment?.subtitle ||
        'Briar Sanctuary Encloses You Both · 25s Proximity Blessing (<= 6.0m Tether: Invincible, 2x DMG, Fast CD)',
      'blessing'
    );
    onHudStateChanged?.(getStateSnapshot(heroStates));
    return {
      verdict,
      prayerMode: 'divine_miracle',
      sequenceActive: true,
      duration: 4.8,
      speakerRole: speakerKey,
      partnerRole: partnerKey,
      partnerHp: partnerHero.hp,
      speakerHp: speakerHero.hp,
      knightHp: combatHeroes.Knight.hp,
      mageHp: combatHeroes.Mage.hp,
      heartResonance,
    };
  }

  function castSpell(spellIdOrSlot, casterPos, aimYaw, partnerPos = null, options = {}) {
    const spell =
      typeof spellIdOrSlot === 'number'
        ? SPELL_BY_SLOT[spellIdOrSlot]
        : SPELLS[spellIdOrSlot];
    if (!spell || combatHeroes.Mage.downed) return null;

    if (!options.ignoreCooldown && (combatHeroes.Mage.spellCooldowns[spell.id] || 0) > 0.05) {
      return { onCooldown: true, spell };
    }

    const cdMult = divineBlessingActive
      ? DIVINE_BLESSING_E_CD_MULT
      : combatHeroes.Mage.ascendedMagicFlow
        ? 0.45
        : 1.0;
    const baseCd =
      spell.id === 'frost_lance' || spell.id === 'cinder_fall'
        ? MAGE_E_COOLDOWN
        : spell.cd;
    combatHeroes.Mage.spellCooldowns[spell.id] = Number((baseCd * cdMult).toFixed(2));
    if (spell.id === 'frost_lance' || spell.id === 'cinder_fall') {
      combatHeroes.Mage.skillCd = combatHeroes.Mage.spellCooldowns[spell.id];
    }

    addResonance(spell.resonanceGain);
    if (
      !combatHeroes.Knight.powerSwordActive &&
      !combatHeroes.Knight.ultActive &&
      !options.fromWingmanAi &&
      combatHeroes.Knight.breathingStyle === 'none'
    ) {
      setKnightBreathing(
        combatHeroes.Knight.sunSwornBreathing ? 'eclipse' : spell.infusion,
        Math.max(KNIGHT_POWER_SWORD_DURATION, combatHeroes.Knight.sunSwornTimer)
      );
    }

    if (combatSfx?.playSpellCast) {
      combatSfx.playSpellCast(spell.id);
    }

    const explicitDistance =
      typeof options.distance === 'number' && Number.isFinite(options.distance)
        ? options.distance
        : null;
    const effectiveRange =
      spell.id === 'frost_lance'
        ? SPELLS.frost_lance.range
        : spell.id === 'shatterlance'
          ? explicitDistance !== null
            ? clamp(
                explicitDistance,
                SPELLS.shatterlance.minRange || 0.8,
                SPELLS.shatterlance.maxRange || 18.0
              )
            : spell.range
          : explicitDistance !== null
            ? clamp(explicitDistance, 3.0, 16.0)
            : spell.range;

    const enemies = enemyManager ? enemyManager.activeEnemies : [];
    const softTarget =
      explicitDistance !== null
        ? null
        : selectSoftLockTarget(casterPos, aimYaw, enemies, {
            maxRange: effectiveRange,
            partnerPos,
          });

    let targetYaw = aimYaw;
    let targetPos = null;
    if (options.targetPos && typeof options.targetPos.x === 'number') {
      targetPos = { ...options.targetPos };
    } else if (softTarget) {
      const dx = softTarget.x - casterPos.x;
      const dz = softTarget.z - casterPos.z;
      targetYaw = Math.atan2(dx, dz);
      targetPos = { x: softTarget.x, y: softTarget.y, z: softTarget.z };
    } else {
      const distUse =
        explicitDistance !== null
          ? effectiveRange
          : Math.min(10.5, effectiveRange * 0.75);
      const tx = casterPos.x + Math.sin(targetYaw) * distUse;
      const tz = casterPos.z + Math.cos(targetYaw) * distUse;
      targetPos = { x: tx, y: walkableHeightAt(tx, tz), z: tz };
    }

    const dirX = Math.sin(targetYaw);
    const dirZ = Math.cos(targetYaw);
    const origin = {
      x: casterPos.x + dirX * 0.9,
      y: walkableHeightAt(casterPos.x, casterPos.z),
      z: casterPos.z + dirZ * 0.9,
    };

    if (vfxKit) {
      const sysMap = {
        frost_lance: vfxKit.frostLance,
        shatterlance: vfxKit.shatterlance,
        cinder_fall: vfxKit.cinderFall,
        storm_lance: vfxKit.stormLance,
      };
      const sys = sysMap[spell.id];
      if (sys?.cast) {
        sys.cast(
          origin,
          { x: dirX, y: 0, z: dirZ },
          {
            range: effectiveRange,
            distance: effectiveRange,
            aim: { distance: effectiveRange, yaw: targetYaw, origin, targetPos },
            targetPos,
          }
        );
      }
    }

    let hits = [];
    if (enemyManager) {
      const commonHitSpec = {
        source: spell.id,
        baseDmg: spell.dmg,
        applyMark: spell.mark,
        detonatesMark: Boolean(spell.detonatesMark),
        empoweredBreathing: combatHeroes.Mage.empoweredBreathing,
        partnerMagicMult: combatHeroes.Mage.partnerMagicMult,
        attackerPos: casterPos,
        partnerPos,
      };
      if (spell.id === 'cinder_fall' || spell.id === 'storm_lance') {
        hits = enemyManager.applyAreaOrLineHit({
          origin: targetPos,
          radius: spell.chainRadius || spell.radius || 4.2,
          maxTargets: spell.chainCount ? spell.chainCount + 1 : 99,
          hitSpec: commonHitSpec,
        });
      } else if (spell.id === 'shatterlance') {
        // Hybrid 3D Piercing Ice Lance Ray (`0 .. effectiveRange`) + Ground Crystal Eruption (`radius = 2.8m`)
        // Deduplicated with `alreadyHitSet` so NO enemy takes duplicate damage from a single cast!
        const rayHits = enemyManager.applyAreaOrLineHit({
          origin: casterPos,
          direction: { x: dirX, z: dirZ },
          range: effectiveRange,
          width: spell.width || 2.2,
          maxHeightDiff: 3.5,
          hitSpec: commonHitSpec,
        });
        const alreadyHitSet = new Set(rayHits.map((h) => h.enemy));
        const eruptionHits = enemyManager.applyAreaOrLineHit({
          origin: targetPos,
          radius: spell.eruptionRadius || 2.8,
          maxHeightDiff: 3.5,
          excludeEnemies: alreadyHitSet,
          hitSpec: commonHitSpec,
        });
        hits = [...rayHits, ...eruptionHits];
      } else {
        hits = enemyManager.applyAreaOrLineHit({
          origin: casterPos,
          direction: { x: dirX, z: dirZ },
          range: effectiveRange,
          width: spell.width || 2.6,
          hitSpec: commonHitSpec,
        });
      }

      if (hits.some((h) => h.enemy && (h.enemy.isBoss || h.enemy.isElite))) {
        addHeroQEnergy('Mage', Q_ENERGY_CONFIG.heavyHitBossAttacker);
        addHeroQEnergy('Knight', Q_ENERGY_CONFIG.heavyHitBossPartner);
      }

      for (const h of hits) {
        if (Array.isArray(h.result?.bossPhasesCrossed)) {
          for (const phasePct of h.result.bossPhasesCrossed) {
            handleBossPhaseThreshold({ enemy: h.enemy, phasePct });
          }
        }
        if (h.result?.killed) {
          awardKnightKillXp(h.enemy, h.result);
        }
        if (h.result?.detonation) {
          addResonance(DETONATIONS[h.result.detonation.id]?.resonanceGain || 18);
          if ((h.result.detonation.tier ?? 2) >= 2) {
            addHeroQEnergy('Knight', Q_ENERGY_CONFIG.detonationBonusBoth);
            addHeroQEnergy('Mage', Q_ENERGY_CONFIG.detonationBonusBoth);
          }
          if (vfxKit?.swordVfx?.triggerDetonation) {
            vfxKit.swordVfx.triggerDetonation(h.result.detonation.id, {
              x: h.result.detonation.x,
              y: h.result.detonation.y,
              z: h.result.detonation.z,
            });
          }
          if (combatSfx?.playDetonation) {
            combatSfx.playDetonation(h.result.detonation.id);
          }
          if (onDetonation) {
            onDetonation(h.result.detonation, h.enemy);
          }
        }
      }
    }

    // Friendly-Fire Roast: when live 3D player Mage casts Cinder Fall directly on the Knight
    if (
      spell.id === 'cinder_fall' &&
      !options.fromWingmanAi &&
      partnerPos &&
      typeof partnerPos.char === 'object'
    ) {
      const dPartner = Math.hypot(partnerPos.x - targetPos.x, partnerPos.z - targetPos.z);
      if (dPartner <= (spell.radius || 3.35) && !combatHeroes.Knight.downed) {
        const roastDmg = 24;
        if (!partnerPos.id) partnerPos.id = 'Knight';
        handlePlayerHit(partnerPos, null, roastDmg, {
          alreadyReduced: true,
          friendlyFire: true,
          source: 'cinder_fall',
          element: 'fire',
        });
        emitBanner(
          'FRIENDLY FIRE · CINDER FALL ROAST!',
          'The Mage dropped a volcanic meteor right on the Knight!',
          'warning'
        );
      }
    }

    return {
      spell,
      distance: effectiveRange,
      targetYaw,
      targetPos,
      softTarget,
      hits,
    };
  }

  function performKnightSwing(swingType, knightPos, knightYaw, partnerPos = null, options = {}) {
    if (combatHeroes.Knight.downed) return null;

    if (
      combatHeroes.Knight.sunSwornBreathing &&
      combatHeroes.Knight.breathingStyle === 'none'
    ) {
      setKnightBreathing('eclipse', Math.max(4.0, combatHeroes.Knight.sunSwornTimer));
    }

    const activeStyle = combatHeroes.Knight.breathingStyle;

    const enemies = enemyManager ? enemyManager.activeEnemies : [];
    const softTarget = selectSoftLockTarget(knightPos, knightYaw, enemies, {
      maxRange: 7.5,
      partnerPos,
    });

    let swingYaw = knightYaw;
    if (softTarget) {
      swingYaw = Math.atan2(softTarget.x - knightPos.x, softTarget.z - knightPos.z);
    }

    let baseDmg = HERO_STATS.Knight.comboDmg[0];
    let range = 3.6;
    if (swingType === 'combo2') {
      baseDmg = HERO_STATS.Knight.comboDmg[1];
      range = 3.8;
    } else if (swingType === 'combo3') {
      baseDmg = HERO_STATS.Knight.comboDmg[2];
      range = 4.2;
    } else if (swingType === 'combo4') {
      baseDmg = HERO_STATS.Knight.combo4Dmg || 46;
      range = 4.4;
    } else if (swingType === 'charged' || swingType === 'heavy') {
      baseDmg = HERO_STATS.Knight.heavyDmg;
      range = 4.6;
    }

    if (vfxKit?.swordVfx?.triggerSwing) {
      if (options.skipTriggerSwing && vfxKit.swordVfx.swingState?.active) {
        vfxKit.swordVfx.swingState.yaw = swingYaw;
      } else {
        vfxKit.swordVfx.triggerSwing(
          swingType,
          { x: knightPos.x, y: knightPos.y, z: knightPos.z },
          swingYaw,
          activeStyle
        );
      }
    }
    if (combatSfx) {
      if (swingType === 'charged' || swingType === 'heavy' || swingType === 'combo4') {
        combatSfx.playHeavyFinisher?.(activeStyle);
      } else {
        combatSfx.playSwordSlash?.(
          swingType === 'combo3' ? 2 : swingType === 'combo2' ? 1 : 0,
          activeStyle
        );
      }
    }

    let hits = [];
    if (enemyManager) {
      hits = enemyManager.applyAreaOrLineHit({
        origin: knightPos,
        range,
        radius: swingType === 'charged' || swingType === 'heavy' ? 3.8 : 0,
        coneHalfAngle: (95 * Math.PI) / 180,
        hitSpec: {
          source: swingType,
          yaw: swingYaw,
          baseDmg,
          infusion: activeStyle,
          knightLevel: combatHeroes.Knight.level,
          knightUltActive: combatHeroes.Knight.ultActive,
          ultDmgMult: combatHeroes.Knight.ultDmgMult,
          empoweredBreathing: combatHeroes.Knight.empoweredBreathing,
          partnerSwordMult: combatHeroes.Knight.partnerSwordMult,
          perfectDodgeBuff: combatHeroes.Knight.perfectDodgeBuff,
          attackerPos: knightPos,
          partnerPos,
        },
      });
      combatHeroes.Knight.perfectDodgeBuff = false;

      if (
        (swingType === 'charged' || swingType === 'heavy' || swingType === 'combo4') &&
        hits.some((h) => h.enemy && (h.enemy.isBoss || h.enemy.isElite))
      ) {
        addHeroQEnergy('Knight', Q_ENERGY_CONFIG.heavyHitBossAttacker);
        addHeroQEnergy('Mage', Q_ENERGY_CONFIG.heavyHitBossPartner);
      }

      for (const h of hits) {
        addResonance(h.result?.resonanceGain || 4);
        if (Array.isArray(h.result?.bossPhasesCrossed)) {
          for (const phasePct of h.result.bossPhasesCrossed) {
            handleBossPhaseThreshold({ enemy: h.enemy, phasePct });
          }
        }
        if (h.result?.killed) {
          awardKnightKillXp(h.enemy, h.result);
        }
        if (h.result?.detonation) {
          if ((h.result.detonation.tier ?? 2) >= 2) {
            addHeroQEnergy('Knight', Q_ENERGY_CONFIG.detonationBonusBoth);
            addHeroQEnergy('Mage', Q_ENERGY_CONFIG.detonationBonusBoth);
          }
          if (vfxKit?.swordVfx?.triggerDetonation) {
            vfxKit.swordVfx.triggerDetonation(h.result.detonation.id, {
              x: h.result.detonation.x,
              y: h.result.detonation.y,
              z: h.result.detonation.z,
            });
          }
          if (combatSfx?.playDetonation) {
            combatSfx.playDetonation(h.result.detonation.id);
          }
          if (onDetonation) {
            onDetonation(h.result.detonation, h.enemy);
          }
        }
      }
    }

    return { swingType, swingYaw, softTarget, hits };
  }

  function performMageBoltAttack(comboIndex = 0, mageState, partnerPos = null) {
    if (combatHeroes.Mage.downed || !mageState) return null;

    const ascendedActive = Boolean(combatHeroes.Mage.ascendedMagicFlow);

    const enemies = enemyManager ? enemyManager.activeEnemies : [];
    const softTarget = selectSoftLockTarget(
      mageState,
      mageState.yaw || 0,
      enemies,
      { maxRange: HERO_STATS.Mage.boltRange, partnerPos }
    );

    let aimYaw = mageState.yaw || 0;
    let targetPos = null;
    if (softTarget) {
      aimYaw = Math.atan2(softTarget.x - mageState.x, softTarget.z - mageState.z);
      targetPos = { x: softTarget.x, y: (softTarget.y || 0) + 1.0, z: softTarget.z };
    } else {
      const tx = mageState.x + Math.sin(aimYaw) * 9.5;
      const tz = mageState.z + Math.cos(aimYaw) * 9.5;
      targetPos = { x: tx, y: walkableHeightAt(tx, tz) + 1.0, z: tz };
    }

    mageState.yaw = aimYaw;
    if (mageState.char?.group) {
      mageState.char.group.position.set(
        mageState.x,
        mageState.y ?? walkableHeightAt(mageState.x, mageState.z),
        mageState.z
      );
      mageState.char.group.rotation.y = aimYaw;
    }

    if (ascendedActive) {
      fireMageStaffVolleyVfx(mageState, targetPos, 2);
      fireMageStaffVolleyVfx(mageState, targetPos, 3);
    } else {
      fireMageStaffVolleyVfx(mageState, targetPos, comboIndex);
    }

    if (combatSfx) {
      if (comboIndex === 3 || ascendedActive) {
        combatSfx.playHeavyFinisher?.('rime');
      } else {
        combatSfx.playSwordSlash?.(comboIndex, 'rime');
      }
    }

    let hits = [];
    if (enemyManager) {
      const canApplyRimeMark =
        getUnlockedStage() >= 1 ||
        (getStonesSolvedMask() & 1) !== 0 ||
        (!getProgressionState && manualUnlockedStage === null);
      if (ascendedActive || comboIndex === 3) {
        hits = enemyManager.applyAreaOrLineHit({
          origin: softTarget || targetPos,
          radius: ascendedActive
            ? (HERO_STATS.Mage.heavyNovaRadius || 3.5) + 1.0
            : HERO_STATS.Mage.heavyNovaRadius || 3.5,
          hitSpec: {
            source: 'mage_heavy',
            baseDmg: ascendedActive
              ? (HERO_STATS.Mage.heavyNovaDmg || 42) + (HERO_STATS.Mage.boltDmg[2] || 30)
              : HERO_STATS.Mage.heavyNovaDmg || 42,
            applyMark: canApplyRimeMark ? 'rime' : null,
            detonatesMark: true,
            empoweredBreathing: combatHeroes.Mage.empoweredBreathing,
            partnerMagicMult: combatHeroes.Mage.partnerMagicMult,
            attackerPos: mageState,
            partnerPos,
          },
        });
        addResonance(ascendedActive ? 14 : 10);
      } else if (comboIndex === 2 && softTarget) {
        hits = enemyManager.applyAreaOrLineHit({
          origin: softTarget,
          radius: 2.5,
          maxTargets: 3,
          hitSpec: {
            source: 'mage_attack3',
            baseDmg: HERO_STATS.Mage.boltDmg[2] || 30,
            applyMark: canApplyRimeMark ? 'rime' : null,
            empoweredBreathing: combatHeroes.Mage.empoweredBreathing,
            partnerMagicMult: combatHeroes.Mage.partnerMagicMult,
            attackerPos: mageState,
            partnerPos,
          },
        });
        addResonance(7);
      } else if (softTarget) {
        const res = enemyManager.applyHitToEnemy(softTarget, {
          source: comboIndex === 1 ? 'mage_attack2' : 'mage_attack1',
          baseDmg: HERO_STATS.Mage.boltDmg[comboIndex] || 18,
          applyMark: null,
          empoweredBreathing: combatHeroes.Mage.empoweredBreathing,
          partnerMagicMult: combatHeroes.Mage.partnerMagicMult,
          attackerPos: mageState,
          partnerPos,
        });
        if (res) hits.push({ enemy: softTarget, result: res });
        addResonance(5);
      }

      if (
        (comboIndex === 3 || ascendedActive) &&
        hits.some((h) => h.enemy && (h.enemy.isBoss || h.enemy.isElite))
      ) {
        addHeroQEnergy('Mage', Q_ENERGY_CONFIG.heavyHitBossAttacker);
        addHeroQEnergy('Knight', Q_ENERGY_CONFIG.heavyHitBossPartner);
      }

      for (const h of hits) {
        if (Array.isArray(h.result?.bossPhasesCrossed)) {
          for (const phasePct of h.result.bossPhasesCrossed) {
            handleBossPhaseThreshold({ enemy: h.enemy, phasePct });
          }
        }
        if (h.result?.killed) {
          awardKnightKillXp(h.enemy, h.result);
        }
        if (h.result?.detonation) {
          addResonance(DETONATIONS[h.result.detonation.id]?.resonanceGain || 18);
          if ((h.result.detonation.tier ?? 2) >= 2) {
            addHeroQEnergy('Knight', Q_ENERGY_CONFIG.detonationBonusBoth);
            addHeroQEnergy('Mage', Q_ENERGY_CONFIG.detonationBonusBoth);
          }
          vfxKit?.swordVfx?.triggerDetonation?.(h.result.detonation.id, h.result.detonation);
          combatSfx?.playDetonation?.(h.result.detonation.id);
          onDetonation?.(h.result.detonation, h.enemy);
        }
      }
    }

    return { comboIndex, aimYaw, softTarget, targetPos, hits, ascendedActive };
  }

  /**
   * `E` Skill:
   * - Knight: **Power Sword** — ignites sword with selected element (`ice` or `fire`)
   *   for `13.0s` active duration on an `18.0s` total cooldown (`5.0s` downtime).
   *   Locks `summonedElement` for the full `13.0s` active duration (`Tab` only queues next element).
   * - Mage: Casts selected `E` spell (`frost_lance` or `cinder_fall`) at aimed distance
   *   with an `8.5s` cooldown (or `shatterlance` on its `2.8s` cooldown when aimed via Hold Attack).
   */
  function performPartnerSkill(activeHeroId, heroStates, options = {}) {
    const knightState = heroStates?.Knight || { x: 0, y: 0, z: 0, yaw: 0 };
    const mageState = heroStates?.Mage || { x: 0, y: 0, z: 0, yaw: 0 };

    if (activeHeroId === 'Knight') {
      if (combatHeroes.Knight.powerSwordCd > 0.05 || combatHeroes.Knight.downed) {
        return { onCooldown: true, cooldownRemaining: combatHeroes.Knight.powerSwordCd };
      }
      const elem = combatHeroes.Knight.selectedElement || 'ice';
      const styleId = elem === 'fire' ? 'solar' : 'rime';

      const baseDowntime = KNIGHT_POWER_SWORD_COOLDOWN - KNIGHT_POWER_SWORD_DURATION; // 5.0s
      const effectiveDowntime = divineBlessingActive
        ? Number((baseDowntime * DIVINE_BLESSING_E_CD_MULT).toFixed(2))
        : baseDowntime;
      const effectiveTotalCd = KNIGHT_POWER_SWORD_DURATION + effectiveDowntime; // 15.5s when blessed, 18.0s normal

      combatHeroes.Knight.summonedElement = elem;
      combatHeroes.Knight.powerSwordActive = true;
      combatHeroes.Knight.powerSwordTimer = KNIGHT_POWER_SWORD_DURATION; // 13.0s
      combatHeroes.Knight.powerSwordCd = effectiveTotalCd;
      combatHeroes.Knight.interceptCd = effectiveTotalCd;
      setKnightBreathing(styleId, KNIGHT_POWER_SWORD_DURATION);
      addResonance(12);

      return {
        skill: 'power_sword',
        element: elem,
        summonedElement: elem,
        breathingStyle: styleId,
        activeDuration: KNIGHT_POWER_SWORD_DURATION,
        totalCooldown: effectiveTotalCd,
        cooldown: effectiveTotalCd,
        downtime: effectiveDowntime,
      };
    }

    const spellId = options.spellId || combatHeroes.Mage.selectedSpell || 'frost_lance';
    if (spellId === 'shatterlance') {
      if (combatHeroes.Mage.downed) {
        return { onCooldown: true, cooldownRemaining: 0 };
      }
      const castRes = castSpell(
        'shatterlance',
        mageState,
        options.yaw ?? mageState.yaw ?? 0,
        knightState,
        {
          distance: options.distance,
          targetPos: options.targetPos,
          ignoreCooldown: true,
        }
      );
      return {
        skill: 'mage_shatterlance',
        spellId: 'shatterlance',
        cooldown: SPELLS.shatterlance.cd,
        distance: castRes?.distance,
        castRes,
      };
    }

    // Mage E: Cast selected spell (frost_lance or cinder_fall) with 8.5s cooldown (4.25s during Blessing)
    if (combatHeroes.Mage.skillCd > 0.05 || combatHeroes.Mage.downed) {
      return { onCooldown: true, cooldownRemaining: combatHeroes.Mage.skillCd };
    }
    const effectiveMageECd = divineBlessingActive
      ? Number((MAGE_E_COOLDOWN * DIVINE_BLESSING_E_CD_MULT).toFixed(2))
      : MAGE_E_COOLDOWN;
    combatHeroes.Mage.skillCd = effectiveMageECd;
    combatHeroes.Mage.infuseCd = effectiveMageECd;
    const castRes = castSpell(
      spellId,
      mageState,
      options.yaw ?? mageState.yaw ?? 0,
      knightState,
      {
        distance: options.distance,
        targetPos: options.targetPos,
        ignoreCooldown: true,
      }
    );
    return {
      skill: 'mage_elemental_spell',
      spellId,
      cooldown: effectiveMageECd,
      distance: castRes?.distance,
      castRes,
    };
  }

  // Knight Q visual beats (VFX-only; damage/buff numbers are applied up front).

  /**
   * Knight `Q` (`ultimate` — Tanjiro Twin-Element Fire+Ice Blade, Cost 100 Q Energy, 12.0s, 2.0x Dmg):
   * Plays native sword-raise pose (`pray_channel` / `burst_aoe`), ignites his blade with
   * Twin-Element Hinokami + Glacial Tide (`'eclipse'`) for `12.0s`, dealing `2.0x` double damage
   * and applying BOTH Fire Burn (`10 DPS` for `3.0s`) and Ice Slow (`40%` for `3.5s`) on every slash.
   */
  function performKnightUltimate(heroStates, options = {}) {
    if (combatHeroes.Knight.downed) return null;
    if (combatHeroes.Knight.ultCd > 0.05) {
      return { onCooldown: true, cooldownRemaining: combatHeroes.Knight.ultCd };
    }
    if (options.requireEnergy && combatHeroes.Knight.qEnergy < combatHeroes.Knight.qEnergyMax) {
      return {
        notEnoughEnergy: true,
        qEnergy: combatHeroes.Knight.qEnergy,
        qEnergyMax: combatHeroes.Knight.qEnergyMax,
      };
    }

    const effectiveUltCd = divineBlessingActive
      ? Number((KNIGHT_ULT_COOLDOWN * DIVINE_BLESSING_Q_CD_MULT).toFixed(2))
      : KNIGHT_ULT_COOLDOWN;

    combatHeroes.Knight.qEnergy = 0;
    combatHeroes.Knight.qEnergyPct = 0;
    combatHeroes.Knight.ultActive = true;
    combatHeroes.Knight.ultTimer = KNIGHT_ULT_DURATION; // 12.0s
    combatHeroes.Knight.ultDmgMult = KNIGHT_ULT_DMG_MULT; // 2.0x
    combatHeroes.Knight.ultCd = effectiveUltCd; // 24.0s (8.0s during Blessing)

    const styleId = 'eclipse';
    setKnightBreathing(
      styleId,
      Math.max(combatHeroes.Knight.breathingTimer, KNIGHT_ULT_DURATION)
    );

    const kPos = heroStates?.Knight || { x: 0, y: 0, z: 0, yaw: 0 };

    // Beats: Beat 1 low spin-gather as twin dragons coil upward (0-0.38s) ->
    // Beat 2A first X-slash cut + lunge (0.38s) -> Beat 2B second X-slash cut + cross-bite detonation (0.70s).
    if (vfxKit) {
      vfxKit.swordVfx?.setInfusion?.('eclipse', KNIGHT_ULT_DURATION);
      vfxKit.swordVfx?.triggerSwing?.('charged', kPos, kPos.yaw || 0, 'eclipse', {
        duration: 0.42,
      });
      if (vfxKit.ultimateVfx?.playKnightAwakening) {
        vfxKit.ultimateVfx.playKnightAwakening(
          { x: kPos.x, y: walkableHeightAt(kPos.x, kPos.z), z: kPos.z },
          {
            yaw: kPos.yaw || 0,
            style: styleId,
            getBladeTip: vfxKit.swordVfx?.getBladeTipFn,
          }
        );
      }
    }
    combatSfx?.playCouplesUltimate?.();

    let hits = [];
    if (enemyManager) {
      hits = enemyManager.applyAreaOrLineHit({
        origin: kPos,
        radius: 3.8,
        hitSpec: {
          source: 'knight_sky_lightning',
          baseDmg: 22,
          infusion: styleId,
          knightLevel: combatHeroes.Knight.level,
          knightUltActive: true,
          ultDmgMult: KNIGHT_ULT_DMG_MULT,
          partnerSwordMult: combatHeroes.Knight.partnerSwordMult,
          detonatesMark: false,
          attackerPos: kPos,
        },
      });
      for (const h of hits) {
        if (Array.isArray(h.result?.bossPhasesCrossed)) {
          for (const phasePct of h.result.bossPhasesCrossed) {
            handleBossPhaseThreshold({ enemy: h.enemy, phasePct });
          }
        }
        if (h.result?.killed) {
          awardKnightKillXp(h.enemy, h.result);
        }
        if (h.result?.detonation) {
          addHeroQEnergy('Knight', Q_ENERGY_CONFIG.detonationBonusBoth);
          addHeroQEnergy('Mage', Q_ENERGY_CONFIG.detonationBonusBoth);
        }
      }
    }

    // Consume Knight's Q Energy cleanly (activation burst does not self-refund Knight's own Q gauge)
    combatHeroes.Knight.qEnergy = 0;
    combatHeroes.Knight.qEnergyPct = 0;

    emitBanner(
      'TWIN-ELEMENT AWAKENING · 2.0× ECLIPSE BLADE',
      '12.0s Hinokami Sunfire + Glacial Tide Twin-Element Blade (2.0× DMG · Burn + Slow)',
      'ultimate'
    );

    return {
      ultimate: 'knight_sky_lightning',
      poseClip: 'pray_channel',
      breathingStyle: styleId,
      duration: KNIGHT_ULT_DURATION,
      dmgMult: KNIGHT_ULT_DMG_MULT,
      cooldown: effectiveUltCd,
      hits,
    };
  }

  const _indDummy = new THREE.Object3D();

  function fireSkyMeteorStrike(magePos, meteorIndex = 0, liveHeroStates = null) {
    // Keep the bombardment circle fixed at the ground position where Mage cast Q!
    const center = combatHeroes.Mage.stormCataclysmCenter || magePos || { x: 0, y: 0, z: 0 };
    const zoneRadius = HERO_STATS.Mage.stormCataclysmRadius || 8.4;
    const innerSafeRadius = 1.68;
    const meteorDmg = HERO_STATS.Mage.meteorDmg || 38;
    const maxHitsPerTarget = HERO_STATS.Mage.maxMeteorHitsPerTarget || 3;
    const hitCounts = combatHeroes.Mage.stormCataclysmHitCounts;

    // Camera-to-center forward vector & screen-plane lateral vector so meteors streak across the screen at ~72 deg
    const camPos = lastCamera?.position || null;
    let fwdX = 0.0;
    let fwdZ = -1.0;
    if (camPos && Number.isFinite(camPos.x) && Number.isFinite(camPos.z)) {
      const cdx = center.x - camPos.x;
      const cdz = center.z - camPos.z;
      const cLen = Math.hypot(cdx, cdz);
      if (cLen > 1e-3) {
        fwdX = cdx / cLen;
        fwdZ = cdz / cLen;
      }
    }
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const sideSign = meteorIndex % 3 === 0 ? -1.0 : 1.0;
    const rawDirX = rightX * (0.94 * sideSign) + fwdX * 0.34;
    const rawDirZ = rightZ * (0.94 * sideSign) + fwdZ * 0.34;
    const dirNorm = Math.hypot(rawDirX, rawDirZ) || 1.0;
    const dirX = rawDirX / dirNorm;
    const dirZ = rawDirZ / dirNorm;

    // Distribute meteors strictly across the full 360-degree annular ring around the Mage (2.65m .. 7.65m),
    // rotating away if a candidate strike or sky trajectory falls within 4.2m of the camera lens!
    const clampAwayFromCameraCorridor = (candAngle, r, dX, dZ) => {
      let a = candAngle;
      let sx = center.x + Math.cos(a) * r;
      let sz = center.z + Math.sin(a) * r;
      if (camPos && Number.isFinite(camPos.x) && Number.isFinite(camPos.z)) {
        const cLen = Math.hypot(center.x - camPos.x, center.z - camPos.z);
        const alongFwd = (sx - camPos.x) * fwdX + (sz - camPos.z) * fwdZ;
        const lateral = Math.abs((sx - camPos.x) * rightX + (sz - camPos.z) * rightZ);
        const dStrikeCam = Math.hypot(sx - camPos.x, sz - camPos.z);
        const dStartCam = Math.hypot(sx - dX * 4.8 - camPos.x, sz - dZ * 4.8 - camPos.z);
        if (dStrikeCam < 5.5 || dStartCam < 5.8 || (alongFwd < cLen - 1.2 && lateral < 4.5)) {
          a += Math.PI;
          sx = center.x + Math.cos(a) * r;
          sz = center.z + Math.sin(a) * r;
        }
      }
      return { a, sx, sz };
    };

    let angle = meteorIndex * 2.39996;
    const ringU = (meteorIndex * 0.6180339887) % 1.0;
    const maxRingR = Math.min(7.65, zoneRadius - 0.75);
    const strikeR = 2.65 + ringU * (maxRingR - 2.65);
    const pClamped = clampAwayFromCameraCorridor(angle, strikeR, dirX, dirZ);
    angle = pClamped.a;
    const strikeX = pClamped.sx;
    const strikeZ = pClamped.sz;
    const strikeY = walkableHeightAt(strikeX, strikeZ);
    const strikePos = { x: strikeX, y: strikeY, z: strikeZ };

    if (vfxKit?.cinderFall?.cast) {
      // Primary meteor streaking diagonally down from the sky at ~72 deg (skyHeight 14.5, range 4.8)
      vfxKit.cinderFall.cast(
        { x: strikeX - dirX * 4.8, y: strikeY, z: strikeZ - dirZ * 4.8 },
        { x: dirX, y: 0, z: dirZ },
        {
          fromSky: true,
          skyHeight: 14.5,
          range: 4.8,
          distance: 4.8,
          targetPos: strikePos,
          initialAge: 0.0,
          seed: 1.0 + meteorIndex * 0.73,
        }
      );

      // Staggered chaser meteor inside the 360-degree annulus (2.75m .. 7.65m), offset around the ring
      let chaserAng = angle + 2.2;
      const chaserU = (ringU + 0.47) % 1.0;
      const chaserR = 2.75 + chaserU * (maxRingR - 2.75);
      const chaserSideSign = -sideSign;
      const chRawDirX = rightX * (0.94 * chaserSideSign) + fwdX * 0.34;
      const chRawDirZ = rightZ * (0.94 * chaserSideSign) + fwdZ * 0.34;
      const chDirNorm = Math.hypot(chRawDirX, chRawDirZ) || 1.0;
      const chaserDirX = chRawDirX / chDirNorm;
      const chaserDirZ = chRawDirZ / chDirNorm;
      const cClamped = clampAwayFromCameraCorridor(chaserAng, chaserR, chaserDirX, chaserDirZ);
      chaserAng = cClamped.a;
      const chaserX = cClamped.sx;
      const chaserZ = cClamped.sz;
      const chaserY = walkableHeightAt(chaserX, chaserZ);
      vfxKit.cinderFall.cast(
        { x: chaserX - chaserDirX * 4.8, y: chaserY, z: chaserZ - chaserDirZ * 4.8 },
        { x: chaserDirX, y: 0, z: chaserDirZ },
        {
          fromSky: true,
          skyHeight: 14.5,
          range: 4.8,
          distance: 4.8,
          targetPos: { x: chaserX, y: chaserY, z: chaserZ },
          initialAge: -0.09,
          seed: 2.3 + meteorIndex * 1.19,
        }
      );
    } else if (vfxKit?.stormLance?.cast && meteorIndex === 0) {
      vfxKit.stormLance.cast(
        { x: strikeX, y: strikeY, z: strikeZ },
        { x: 0, y: 0, z: 1 },
        { range: zoneRadius }
      );
    }

    // Realistic Friendly-Fire Bombardment Hazard (every 3rd meteor wave = 0.54s after initial 0.54s grace):
    // - If the Mage moves out of her 1.68m inner safe circle into the bombardment ring (1.75m < d <= 8.4m), she gets hit!
    // - If the Knight does not run outside the 8.4m outer circle (d <= 8.4m), he gets hit and can die!
    if (liveHeroStates && meteorIndex >= 3 && meteorIndex % 3 === 0) {
      const mEntity = liveHeroStates.Mage;
      if (mEntity && !combatHeroes.Mage.downed && typeof mEntity.x === 'number') {
        const dMage = Math.hypot(mEntity.x - center.x, mEntity.z - center.z);
        if (dMage > innerSafeRadius + 0.12 && dMage <= zoneRadius) {
          if (!mEntity.id) mEntity.id = 'Mage';
          handlePlayerHit(mEntity, null, meteorDmg, {
            alreadyReduced: true,
            friendlyFire: true,
            source: 'storm_cataclysm',
            element: 'fire',
          });
          emitBanner(
            'METEOR HAZARD · STAY IN THE EYE!',
            'Moving outside the inner circle exposes the Mage to falling meteors!',
            'warning'
          );
        }
      }
      const kEntity = liveHeroStates.Knight;
      if (kEntity && !combatHeroes.Knight.downed && typeof kEntity.x === 'number') {
        const dKnight = Math.hypot(kEntity.x - center.x, kEntity.z - center.z);
        if (dKnight > innerSafeRadius && dKnight <= zoneRadius) {
          if (!kEntity.id) kEntity.id = 'Knight';
          handlePlayerHit(kEntity, null, meteorDmg, {
            alreadyReduced: true,
            friendlyFire: true,
            source: 'storm_cataclysm',
            element: 'fire',
          });
          emitBanner(
            'METEOR BOMBARDMENT · EVACUATE THE CIRCLE!',
            'Knight must run outside the 8.4m golden circle or be crushed by meteors!',
            'warning'
          );
        }
      }
    }

    if (!enemyManager) return [];

    // Exclude bosses that have already taken maxMeteorHitsPerTarget (3) hits during this cast
    const excludeSet = new Set();
    if (hitCounts instanceof Map) {
      for (const [enemyRef, count] of hitCounts.entries()) {
        if (count >= maxHitsPerTarget) {
          excludeSet.add(enemyRef);
        }
      }
    }

    const hits = enemyManager.applyAreaOrLineHit({
      origin: center,
      radius: zoneRadius,
      excludeEnemies: excludeSet,
      hitSpec: {
        source: 'storm_cataclysm',
        baseDmg: meteorDmg,
        applyMark: 'solar',
        detonatesMark: false,
        empoweredBreathing: combatHeroes.Mage.empoweredBreathing,
        partnerMagicMult: combatHeroes.Mage.partnerMagicMult,
        attackerPos: magePos || strikePos,
      },
    });

    for (const h of hits) {
      if (h.enemy) {
        h.enemy.stunTimer = Math.max(h.enemy.stunTimer || 0, 1.0);
        if (hitCounts instanceof Map) {
          hitCounts.set(h.enemy, (hitCounts.get(h.enemy) || 0) + 1);
        }
      }
      if (Array.isArray(h.result?.bossPhasesCrossed)) {
        for (const phasePct of h.result.bossPhasesCrossed) {
          handleBossPhaseThreshold({ enemy: h.enemy, phasePct });
        }
      }
      if (h.result?.killed) {
        awardKnightKillXp(h.enemy, h.result);
      }
      if (h.result?.detonation) {
        addHeroQEnergy('Knight', Q_ENERGY_CONFIG.detonationBonusBoth);
        addHeroQEnergy('Mage', Q_ENERGY_CONFIG.detonationBonusBoth);
      }
    }

    return hits;
  }

  /**
   * Mage `Q` (`ultimate` — 6.0s Sky Meteor Shower Centered Around the Mage):
   * Draws a simple, subtle golden bombardment circle (`8.4m` outer ring + `1.68m` inner safe eye)
   * centered directly on the Mage. Meteors bombard the ring around her (never falling on her center spot).
   * If she moves out of the inner circle she can get hit, and the Knight must run outside the `8.4m` circle!
   */
  function performMageStormCataclysm(heroStates, options = {}) {
    if (combatHeroes.Mage.downed) return null;
    if (combatHeroes.Mage.ultCd > 0.05) {
      return { onCooldown: true, cooldownRemaining: combatHeroes.Mage.ultCd };
    }
    if (options.requireEnergy && combatHeroes.Mage.qEnergy < combatHeroes.Mage.qEnergyMax) {
      return {
        notEnoughEnergy: true,
        qEnergy: combatHeroes.Mage.qEnergy,
        qEnergyMax: combatHeroes.Mage.qEnergyMax,
      };
    }

    const effectiveCataclysmCd = divineBlessingActive
      ? Number((MAGE_STORM_CATACLYSM_COOLDOWN * DIVINE_BLESSING_Q_CD_MULT).toFixed(2))
      : MAGE_STORM_CATACLYSM_COOLDOWN;

    const mPos = heroStates?.Mage || { x: 0, y: 0, z: 0, yaw: 0 };
    const centerX = mPos.x ?? 0;
    const centerZ = mPos.z ?? 0;

    combatHeroes.Mage.qEnergy = 0;
    combatHeroes.Mage.qEnergyPct = 0;
    combatHeroes.Mage.stormCataclysmActive = true;
    combatHeroes.Mage.stormCataclysmTimer = MAGE_STORM_CATACLYSM_DURATION; // 6.0s
    combatHeroes.Mage.stormCataclysmCastTimer = 0.8; // 0.8s cast pose
    combatHeroes.Mage.stormCataclysmWaveTimer = 0;
    combatHeroes.Mage.stormCataclysmMeteorsFired = 1;
    combatHeroes.Mage.stormCataclysmCenter = {
      x: centerX,
      y: walkableHeightAt(centerX, centerZ),
      z: centerZ,
    };
    combatHeroes.Mage.stormCataclysmHitCounts = new Map();
    combatHeroes.Mage.ultCd = effectiveCataclysmCd; // 24.0s (8.0s during Blessing)

    combatSfx?.playCouplesUltimate?.();
    const hits = fireSkyMeteorStrike(mPos, 0, heroStates);
    updateIndicatorsInstancedMeshes();

    emitBanner(
      'SKY METEOR SHOWER · STAND IN THE EYE!',
      'Meteors Bombard the 8.4m Ring Around the Mage — Knight Must Run Outside the Circle!',
      'ultimate'
    );

    return {
      ultimate: 'storm_cataclysm',
      stationary: false,
      vulnerableOneHitDown: false,
      castPoseDuration: 0.8,
      duration: MAGE_STORM_CATACLYSM_DURATION,
      cooldown: effectiveCataclysmCd,
      hits,
    };
  }

  const ultimateSequence = {
    active: false,
    age: 0,
    beat2Fired: false,
    impactPos: { x: 0, y: 0, z: 0 },
    aimDir: { x: 1, y: 0, z: 0 },
    aimYaw: 0,
    castOrigin: { x: 0, y: 0, z: 0 },
    range: 11.5,
  };

  function performCouplesUltimate(heroStates) {
    if (heartResonance < COUPLES_ULTIMATE.resonanceCost) {
      return { notReady: true, heartResonance };
    }
    heartResonance = 0;

    combatHeroes.Knight.hp = combatHeroes.Knight.maxHp;
    combatHeroes.Mage.hp = combatHeroes.Mage.maxHp;
    combatHeroes.Knight.downed = false;
    combatHeroes.Mage.downed = false;
    combatHeroes.Knight.shield = COUPLES_ULTIMATE.shieldGrant;
    combatHeroes.Knight.shieldTimer = COUPLES_ULTIMATE.shieldDuration;
    combatHeroes.Mage.shield = COUPLES_ULTIMATE.shieldGrant;
    combatHeroes.Mage.shieldTimer = COUPLES_ULTIMATE.shieldDuration;

    setKnightBreathing(
      'eclipse',
      Math.max(KNIGHT_POWER_SWORD_DURATION, combatHeroes.Knight.sunSwornTimer || 16.0)
    );
    if (combatSfx?.playCouplesUltimate) {
      combatSfx.playCouplesUltimate();
    }

    const knightState = heroStates?.Knight || { x: 0, y: 0, z: 0, yaw: 0 };
    const mageState = heroStates?.Mage || {
      x: knightState.x - 1.6,
      y: knightState.y || 0,
      z: knightState.z + 1.1,
      yaw: knightState.yaw || 0,
    };

    const enemies = enemyManager ? enemyManager.activeEnemies : [];
    const softTarget = selectSoftLockTarget(
      knightState,
      knightState.yaw || 0,
      enemies,
      { maxRange: 18.0, partnerPos: mageState }
    );

    let aimYaw = knightState.yaw ?? 0;
    let distToImpact = 10.5;
    if (softTarget) {
      const dx = softTarget.x - knightState.x;
      const dz = softTarget.z - knightState.z;
      aimYaw = Math.atan2(dx, dz);
      distToImpact = clamp(Math.hypot(dx, dz), 6.5, 14.0);
    }

    const dirX = Math.sin(aimYaw);
    const dirZ = Math.cos(aimYaw);
    const impX = knightState.x + dirX * distToImpact;
    const impZ = knightState.z + dirZ * distToImpact;
    const impY = walkableHeightAt(impX, impZ);

    if (heroStates?.Knight) {
      heroStates.Knight.yaw = aimYaw;
      if (heroStates.Knight.char?.group) {
        heroStates.Knight.char.group.rotation.y = aimYaw;
      }
    }
    if (heroStates?.Mage) {
      heroStates.Mage.yaw = aimYaw;
      if (heroStates.Mage.char?.group) {
        heroStates.Mage.char.group.rotation.y = aimYaw;
      }
    }

    const castOrigin = {
      x: mageState.x + dirX * 0.85,
      y: walkableHeightAt(mageState.x, mageState.z),
      z: mageState.z + dirZ * 0.85,
    };
    const mageToImpactDist = clamp(
      Math.hypot(impX - castOrigin.x, impZ - castOrigin.z),
      7.5,
      15.5
    );

    if (vfxKit) {
      vfxKit.frostLance?.cast?.(
        castOrigin,
        { x: dirX, y: 0, z: dirZ },
        { range: mageToImpactDist }
      );
      vfxKit.cinderFall?.cast?.(
        castOrigin,
        { x: dirX, y: 0, z: dirZ },
        { range: mageToImpactDist, distance: mageToImpactDist }
      );
      fireMageStaffVolleyVfx(mageState, { x: impX, y: impY + 1.0, z: impZ }, 2);
      vfxKit.swordVfx?.triggerSwing?.(
        'charged',
        {
          x: knightState.x,
          y: knightState.y ?? walkableHeightAt(knightState.x, knightState.z),
          z: knightState.z,
        },
        aimYaw,
        'eclipse'
      );
    }

    ultimateSequence.active = true;
    ultimateSequence.age = 0;
    ultimateSequence.beat2Fired = false;
    ultimateSequence.impactPos = { x: impX, y: impY, z: impZ };
    ultimateSequence.aimDir = { x: dirX, y: 0, z: dirZ };
    ultimateSequence.aimYaw = aimYaw;
    ultimateSequence.castOrigin = castOrigin;
    ultimateSequence.range = mageToImpactDist;

    let hits = [];
    if (enemyManager) {
      const isLiveVfxSession = Boolean(vfxKit && vfxKit.cinderFall);
      const totalDoubleDmg = COUPLES_ULTIMATE.dmg * 2;
      for (const e of enemyManager.activeEnemies) {
        if (!e || e.dead || !e.active) continue;
        const dx = impX - e.x;
        const dz = impZ - e.z;
        const d = Math.hypot(dx, dz);
        if (d <= COUPLES_ULTIMATE.radius + 5.0 && d > 0.5) {
          e.vx = (dx / d) * Math.min(9.0, d * 2.2);
          e.vz = (dz / d) * Math.min(9.0, d * 2.2);
          e.stunTimer = Math.max(e.stunTimer, 1.25);
        }
      }

      hits = enemyManager.applyAreaOrLineHit({
        origin: { x: impX, y: impY, z: impZ },
        radius: COUPLES_ULTIMATE.radius + 4.0,
        hitSpec: {
          source: 'couples_ultimate',
          baseDmg: isLiveVfxSession ? COUPLES_ULTIMATE.dmg : totalDoubleDmg,
          infusion: 'eclipse',
          applyMark: 'eclipse',
          detonatesMark: !isLiveVfxSession,
          empoweredBreathing: true,
          attackerPos: knightState,
        },
      });
    }

    emitBanner(
      'SUN & TIDE ECLIPSE CATACLYSM!',
      'Fire + Frost Vortex Combined (2x DMG) · Hinokami Sunfire & Glacial Tide Blade!',
      'ultimate'
    );
    return { ultimate: true, hits, impactPos: ultimateSequence.impactPos };
  }

  /**
   * Renders the simple, elegant golden Storm Cataclysm circle around the Mage when active
   * (`groundInd.mesh`), while keeping enemy/tether prototype clutter hidden.
   */
  function updateIndicatorsInstancedMeshes() {
    crestInd.mesh.count = 0;
    crestInd.mesh.visible = false;

    const catCenter = combatHeroes.Mage.stormCataclysmCenter;
    if (
      !indicatorsHiddenForShot &&
      combatHeroes.Mage.stormCataclysmActive &&
      combatHeroes.Mage.stormCataclysmTimer > 0 &&
      catCenter
    ) {
      const halfExtent = 9.0;
      const outerR = HERO_STATS.Mage.stormCataclysmRadius || 8.4;
      const innerR = STORM_CATACLYSM_INNER_SAFE_RADIUS;
      const cx = catCenter.x;
      const cz = catCenter.z;
      const groundY = walkableHeightAt(cx, cz);
      const hX1 = walkableHeightAt(cx + 5.0, cz);
      const hX0 = walkableHeightAt(cx - 5.0, cz);
      const hZ1 = walkableHeightAt(cx, cz + 5.0);
      const hZ0 = walkableHeightAt(cx, cz - 5.0);
      const sx = (hX1 - hX0) / 10.0;
      const sz = (hZ1 - hZ0) / 10.0;
      const curv = ((hX1 + hX0 + hZ1 + hZ0) * 0.25 - groundY) / 25.0;
      if (groundInd.mesh.material?.uniforms?.uTerrainSlope) {
        groundInd.mesh.material.uniforms.uTerrainSlope.value.set(sx, sz, curv, groundY + 0.56);
      }

      _indDummy.position.set(cx, groundY + 0.56, cz);
      _indDummy.rotation.set(0, 0, 0);
      _indDummy.scale.set(halfExtent, 1.0, halfExtent);
      _indDummy.updateMatrix();
      groundInd.mesh.setMatrixAt(0, _indDummy.matrix);
      groundInd.metaAttr.setXYZW(0, halfExtent, outerR, innerR, 1.0);
      groundInd.mesh.instanceMatrix.needsUpdate = true;
      groundInd.metaAttr.needsUpdate = true;
      groundInd.mesh.count = 1;
      groundInd.mesh.visible = true;
    } else {
      groundInd.mesh.count = 0;
      groundInd.mesh.visible = false;
    }
  }

  const STRONGHOLD_BITS = {
    site1_well: 1,
    site2_platform: 2,
    site3_wall: 4,
    apex_finale: 8,
  };

  function getStrongholdWaves(sh) {
    if (!sh) return [];
    if (Array.isArray(sh.waves) && sh.waves.length > 0) return sh.waves;
    if (Array.isArray(sh.spawns) && sh.spawns.length > 0) {
      return [
        {
          id: `${sh.id || 'stronghold'}_wave1`,
          label: sh.bannerSubtitle || sh.name || 'Guardian Forces Awaken!',
          spawns: sh.spawns,
        },
      ];
    }
    return [];
  }

  function checkStrongholdTriggers(leaderPos) {
    if (!leaderPos || !enemyManager) return null;
    const triggeredNow = [];
    for (const [key, bit] of Object.entries(STRONGHOLD_BITS)) {
      if (key === 'apex_finale' && !isStage3Unlocked()) continue;
      if ((strongholdClearedMask & bit) !== 0) continue;
      if (activeStrongholdIds.has(key)) continue;
      const sh = STONE_STRONGHOLDS[key];
      const shWaves = getStrongholdWaves(sh);
      if (!sh || shWaves.length === 0) continue;
      const d = Math.hypot(leaderPos.x - sh.center.x, leaderPos.z - sh.center.z);
      if (d <= (sh.triggerRadius || 26.0)) {
        activeStrongholdIds.add(key);
        strongholdWaveIndex[key] = 0;
        enemyManager.setCurrentActId?.(key);
        enemyManager.spawnWave?.(shWaves[0], key);
        emitBanner(sh.name.toUpperCase(), shWaves[0].label || 'Guardian Forces Awaken!', 'wave');
        triggeredNow.push(key);
      }
    }
    return triggeredNow;
  }

  function spawnRoadVanguardPack(centerPos = { x: 0, z: 102 }) {
    if (!enemyManager) return [];
    roadVanguardSpawned = true;
    const cx = clamp(Number(centerPos?.x ?? 0), -3.5, 3.5);
    const cz = clamp(Number(centerPos?.z ?? 102), 96.0, 104.0);
    const vanguardSpecs = [
      { archetype: 'skeleton_warrior', x: Number((cx - 2.4).toFixed(2)), z: Number(clamp(cz - 2.2, 96.0, 104.0).toFixed(2)) },
      { archetype: 'skeleton_warrior', x: Number((cx + 2.4).toFixed(2)), z: Number(clamp(cz - 1.8, 96.0, 104.0).toFixed(2)) },
      { archetype: 'skeleton_rogue', x: Number((cx - 3.2).toFixed(2)), z: Number(clamp(cz + 1.4, 96.0, 104.0).toFixed(2)) },
      { archetype: 'skeleton_minion', x: Number((cx + 3.2).toFixed(2)), z: Number(clamp(cz + 1.8, 96.0, 104.0).toFixed(2)) },
    ];
    const spawned = [];
    for (let i = 0; i < vanguardSpecs.length; i++) {
      const e = enemyManager.spawnImmediateFromSpec?.(vanguardSpecs[i]);
      if (e) spawned.push(e);
    }
    emitBanner(
      'SOUTH ROAD VANGUARD PACK',
      '4 Valley Hunters Block the Trail Ahead — Cut Through Together!',
      'wave'
    );
    return spawned;
  }

  function startExpedition(centerPos = { x: 0, z: 102 }) {
    survivalWaveTimer = 6.0;
    activeStrongholdIds.clear();
    strongholdClearedMask = 0;
    for (const k of Object.keys(strongholdWaveIndex)) {
      strongholdWaveIndex[k] = -1;
    }
    return spawnRoadVanguardPack(centerPos);
  }

  function triggerSurvivalWave(leaderPos) {
    if (!leaderPos || !enemyManager) return null;
    const mask = getStonesSolvedMask();
    const solvedCount = clamp(
      (mask & 1 ? 1 : 0) + (mask & 2 ? 1 : 0) + (mask & 4 ? 1 : 0),
      0,
      3
    );
    const stageIdx = Math.max(solvedCount, clamp(getUnlockedStage(), 0, 3));
    const poolDef =
      SURVIVAL_WAVE_POOLS[stageIdx] ||
      SURVIVAL_WAVE_POOLS[0] ||
      SURVIVAL_WAVE_POOLS.stage0_1;
    if (!poolDef) return null;

    let archetypes = [];
    if (Array.isArray(poolDef.pool) && poolDef.pool.length > 0) {
      const minC = vfxKit ? 3 : poolDef.minCount || 4;
      const maxC = vfxKit ? 4 : poolDef.maxCount || 7;
      const count = minC + (survivalWaveSeed % Math.max(1, maxC - minC + 1));
      let eliteAdded = 0;
      const maxElites = poolDef.maxElites ?? 2;
      for (let i = 0; i < count; i++) {
        let pick = poolDef.pool[(survivalWaveSeed + i) % poolDef.pool.length];
        if (pick === 'black_knight') {
          if (eliteAdded >= maxElites) {
            pick = poolDef.pool[0];
          } else {
            eliteAdded++;
          }
        }
        archetypes.push(pick);
      }
    } else if (Array.isArray(poolDef) && poolDef.length > 0) {
      const comp = poolDef[survivalWaveSeed % poolDef.length];
      archetypes = comp?.archetypes || [];
    }
    if (archetypes.length === 0) return null;

    survivalWaveSeed += 1;
    survivalWaveTimer = 22.0 + (survivalWaveSeed % 3) * 3.0; // 22..28s (88..112s in live 3D play)

    const rMin = vfxKit ? 24.0 : poolDef.spawnRadiusMin || 14.0;
    const rMax = vfxKit ? 32.0 : poolDef.spawnRadiusMax || 20.0;
    const spawns = archetypes.map((archetype, idx, arr) => {
      const angle = (idx / Math.max(1, arr.length)) * Math.PI * 2 + survivalWaveSeed * 0.85;
      const dist = rMin + (idx % 3) * ((rMax - rMin) * 0.5);
      const sx = clamp(leaderPos.x + Math.cos(angle) * dist, -148, 148);
      const sz = clamp(leaderPos.z + Math.sin(angle) * dist, -148, 148);
      return {
        archetype,
        x: Number(sx.toFixed(2)),
        z: Number(sz.toFixed(2)),
      };
    });

    const waveDef = {
      id: `survival_${stageIdx}_${survivalWaveSeed}`,
      label: `Stage ${stageIdx} Valley Hunting Pack`,
      spawns,
    };
    if (
      Array.isArray(enemyManager.activeEnemies) &&
      enemyManager.activeEnemies.length > 0 &&
      enemyManager.spawnImmediateFromSpec
    ) {
      for (let i = 0; i < spawns.length; i++) {
        enemyManager.spawnImmediateFromSpec(spawns[i]);
      }
    } else {
      enemyManager.spawnWave?.(waveDef, currentActId);
    }
    emitBanner('VALLEY HUNTING PACK', waveDef.label, 'wave');
    return waveDef;
  }

  function update(
    dt,
    { heroStates, activeHeroId = 'Knight', soloWingmanActive = true, camera = null } = {}
  ) {
    elapsed += dt;
    hudDirtyTimer += dt;

    if (modeAHealCd > 0) modeAHealCd = Math.max(0, modeAHealCd - dt);
    if (modeBMiracleCd > 0) modeBMiracleCd = Math.max(0, modeBMiracleCd - dt);
    if (stoneGuessCd > 0) stoneGuessCd = Math.max(0, stoneGuessCd - dt);
    if (awakeningEclipseTimer > 0) {
      awakeningEclipseTimer = Math.max(0, awakeningEclipseTimer - dt);
    }

    const knight = heroStates?.Knight;
    const mage = heroStates?.Mage;
    if (knight && mage) lastHeroStates = heroStates;
    if (camera) lastCamera = camera;

    for (const hSt of [knight, mage]) {
      if (hSt && !hSt.char && hSt.actionTimer > 0) {
        hSt.actionTimer = Math.max(0, hSt.actionTimer - dt);
        if (hSt.actionTimer <= 0) {
          hSt.actionState = null;
        }
      }
    }

    // 0. Advance Divine Verdict Sequence (4.80s 4-Beat Blessing/Resurrection OR 2.80s Smite)
    let blessingActivatedThisFrame = false;
    let smiteWipeCompletedThisFrame = false;
    if (verdictSequence.active) {
      verdictSequence.elapsed += dt;
      const t = verdictSequence.elapsed;

      if (verdictSequence.kind === 'blessing') {
        let sepDx = verdictSequence.startMageX - verdictSequence.startKnightX;
        let sepDz = verdictSequence.startMageZ - verdictSequence.startKnightZ;
        const sepLen = Math.hypot(sepDx, sepDz);
        if (sepLen > 1e-4) {
          sepDx /= sepLen;
          sepDz /= sepLen;
        } else {
          sepDx = 1.0;
          sepDz = 0.0;
        }
        const halfSpan = 1.35 * 0.5;
        const targetKX = verdictSequence.midX - sepDx * halfSpan;
        const targetKZ = verdictSequence.midZ - sepDz * halfSpan;
        const targetMX = verdictSequence.midX + sepDx * halfSpan;
        const targetMZ = verdictSequence.midZ + sepDz * halfSpan;
        const pullU = clamp(t / 1.20, 0, 1);

        if (knight) {
          knight.x =
            verdictSequence.startKnightX +
            (targetKX - verdictSequence.startKnightX) * pullU;
          knight.z =
            verdictSequence.startKnightZ +
            (targetKZ - verdictSequence.startKnightZ) * pullU;
          knight.y = walkableHeightAt(knight.x, knight.z);
        }
        if (mage) {
          mage.x =
            verdictSequence.startMageX +
            (targetMX - verdictSequence.startMageX) * pullU;
          mage.z =
            verdictSequence.startMageZ +
            (targetMZ - verdictSequence.startMageZ) * pullU;
          mage.y = walkableHeightAt(mage.x, mage.z);
        }

        if (t < 2.10) {
          verdictSequence.beat = 1;
        } else if (t < 2.65) {
          verdictSequence.beat = 2;
        } else if (t < 4.25) {
          verdictSequence.beat = 3;
          combatHeroes.Knight.downed = false;
          combatHeroes.Knight.reviveProgress = 0;
          combatHeroes.Mage.downed = false;
          combatHeroes.Mage.reviveProgress = 0;
          bothDownedTimer = 0;

          const fillU = clamp((t - 2.65) / 1.60, 0, 1);
          combatHeroes.Knight.hp = Math.round(
            verdictSequence.startKnightHp +
              (combatHeroes.Knight.maxHp - verdictSequence.startKnightHp) * fillU
          );
          combatHeroes.Mage.hp = Math.round(
            verdictSequence.startMageHp +
              (combatHeroes.Mage.maxHp - verdictSequence.startMageHp) * fillU
          );

          if (knight) {
            knight.x = targetKX;
            knight.z = targetKZ;
            knight.y = walkableHeightAt(knight.x, knight.z);
          }
          if (mage) {
            mage.x = targetMX;
            mage.z = targetMZ;
            mage.y = walkableHeightAt(mage.x, mage.z);
          }
        } else if (t < 4.80) {
          if (verdictSequence.beat < 4) {
            knight?.char?.play?.(verdictSequence.knightWasDowned ? 'revive' : 'cheer', {
              loop: false,
              fade: 0.1,
              force: true,
            });
            mage?.char?.play?.(verdictSequence.mageWasDowned ? 'revive' : 'cheer', {
              loop: false,
              fade: 0.1,
              force: true,
            });
          }
          verdictSequence.beat = 4;
          combatHeroes.Knight.downed = false;
          combatHeroes.Mage.downed = false;
          combatHeroes.Knight.hp = combatHeroes.Knight.maxHp;
          combatHeroes.Mage.hp = combatHeroes.Mage.maxHp;
          if (knight) {
            knight.x = targetKX;
            knight.z = targetKZ;
            knight.y = walkableHeightAt(knight.x, knight.z);
          }
          if (mage) {
            mage.x = targetMX;
            mage.z = targetMZ;
            mage.y = walkableHeightAt(mage.x, mage.z);
          }
        } else {
          // 4.80s complete: unlock controls, finalize 100% Max HP & side-by-side pop-up, start 25s Blessing
          combatHeroes.Knight.downed = false;
          combatHeroes.Mage.downed = false;
          combatHeroes.Knight.hp = combatHeroes.Knight.maxHp;
          combatHeroes.Mage.hp = combatHeroes.Mage.maxHp;
          if (knight) {
            knight.x = targetKX;
            knight.z = targetKZ;
            knight.y = walkableHeightAt(knight.x, knight.z);
          }
          if (mage) {
            mage.x = targetMX;
            mage.z = targetMZ;
            mage.y = walkableHeightAt(mage.x, mage.z);
          }
          verdictSequence.active = false;
          verdictSequence.beat = 0;
          activateDivineBlessing();
          blessingActivatedThisFrame = true;
        }
      } else if (verdictSequence.kind === 'smite') {
        verdictSequence.beat = 1;
        if (t >= 2.80) {
          verdictSequence.active = false;
          verdictSequence.beat = 0;
          if (combatHeroes.Knight.downed && combatHeroes.Mage.downed) {
            smiteWipeCompletedThisFrame = true;
            bothDownedTimer = 2.5;
          }
        }
      }
    }

    // 0B. 25-Second Proximity Blessing Tether (<= 6.0m Rule with 2.5s Grace Timer)
    if (divineBlessingActive) {
      const dist = knight && mage ? getPartnerDistance(knight, mage) : 0;
      if (dist > DIVINE_BLESSING_TETHER_DISTANCE) {
        tetherOutTimer += dt;
        if (tetherOutTimer >= DIVINE_BLESSING_TETHER_GRACE_SECONDS) {
          clearDivineBlessing();
          emitBanner(
            'DIVINE BLESSING BROKEN · TETHER SNAPPED',
            'Moved further than 6.0m apart for 2.5s — Invincibility & Double Damage ended!',
            'warning'
          );
        }
      } else {
        tetherOutTimer = 0;
        if (!blessingActivatedThisFrame) {
          divineBlessingTimer = Math.max(0, divineBlessingTimer - dt);
          if (divineBlessingTimer <= 0) {
            clearDivineBlessing();
          } else {
            combatHeroes.Knight.partnerSwordMult = DIVINE_BLESSING_DMG_MULT;
            combatHeroes.Mage.partnerMagicMult = DIVINE_BLESSING_DMG_MULT;
            combatHeroes.Knight.partnerBuffTimer = divineBlessingTimer;
            combatHeroes.Mage.partnerBuffTimer = divineBlessingTimer;
          }
        }
      }
    }

    // 1. Tick Cooldowns, Shield Timers, I-Frames, Power Sword (13s/18s) & Ultimates
    for (const h of Object.values(combatHeroes)) {
      if (h.shieldTimer > 0) {
        h.shieldTimer = Math.max(0, h.shieldTimer - dt);
        if (h.shieldTimer <= 0) h.shield = 0;
      }
      if (h.iframeTimer > 0) {
        h.iframeTimer = Math.max(0, h.iframeTimer - dt);
      }
      if (h.burstHitTimer > 0) {
        h.burstHitTimer = Math.max(0, h.burstHitTimer - dt);
      }
      if (h.dashCd > 0) h.dashCd = Math.max(0, h.dashCd - dt);
      if (h.dodgeIcd > 0) h.dodgeIcd = Math.max(0, h.dodgeIcd - dt);
      if (h.id === 'Knight') {
        if (h.guardBrokenTimer > 0) h.guardBrokenTimer = Math.max(0, h.guardBrokenTimer - dt);
        if (h.shieldBlocking) {
          drainKnightGuard(KNIGHT_GUARD_HOLD_DRAIN * dt);
        } else if (h.guardRegenDelay > 0) {
          h.guardRegenDelay = Math.max(0, h.guardRegenDelay - dt);
        } else {
          h.guard = Math.min(KNIGHT_GUARD_MAX, h.guard + KNIGHT_GUARD_REGEN * dt);
        }
      }
      if (!divineBlessingActive && h.partnerBuffTimer > 0) {
        h.partnerBuffTimer = Math.max(0, h.partnerBuffTimer - dt);
        if (h.partnerBuffTimer <= 0) {
          if (h.id === 'Knight') h.partnerSwordMult = 1.0;
          if (h.id === 'Mage') h.partnerMagicMult = 1.0;
        }
      }
    }

    if (combatHeroes.Knight.powerSwordTimer > 0) {
      combatHeroes.Knight.powerSwordTimer = Math.max(
        0,
        combatHeroes.Knight.powerSwordTimer - dt
      );
      if (combatHeroes.Knight.powerSwordTimer <= 0) {
        combatHeroes.Knight.powerSwordActive = false;
        combatHeroes.Knight.summonedElement = null;
      }
    }
    if (combatHeroes.Knight.powerSwordCd > 0) {
      combatHeroes.Knight.powerSwordCd = Math.max(0, combatHeroes.Knight.powerSwordCd - dt);
    }

    if (combatHeroes.Knight.ultTimer > 0) {
      combatHeroes.Knight.ultTimer = Math.max(0, combatHeroes.Knight.ultTimer - dt);
      if (combatHeroes.Knight.ultTimer <= 0) {
        combatHeroes.Knight.ultActive = false;
        combatHeroes.Knight.ultDmgMult = 1.0;
      }
    }
    if (combatHeroes.Knight.ultCd > 0) {
      combatHeroes.Knight.ultCd = Math.max(0, combatHeroes.Knight.ultCd - dt);
    }

    if (!divineBlessingActive && combatHeroes.Knight.sunSwornTimer > 0) {
      combatHeroes.Knight.sunSwornTimer = Math.max(0, combatHeroes.Knight.sunSwornTimer - dt);
      if (combatHeroes.Knight.sunSwornTimer <= 0) {
        combatHeroes.Knight.sunSwornBreathing = false;
      }
    }

    if (!divineBlessingActive && combatHeroes.Mage.ascendedMagicTimer > 0) {
      combatHeroes.Mage.ascendedMagicTimer = Math.max(
        0,
        combatHeroes.Mage.ascendedMagicTimer - dt
      );
      if (combatHeroes.Mage.ascendedMagicTimer <= 0) {
        combatHeroes.Mage.ascendedMagicFlow = false;
      }
    }

    if (combatHeroes.Knight.interceptCd > 0) {
      combatHeroes.Knight.interceptCd = Math.max(0, combatHeroes.Knight.interceptCd - dt);
    }
    if (combatHeroes.Mage.skillCd > 0) {
      combatHeroes.Mage.skillCd = Math.max(0, combatHeroes.Mage.skillCd - dt);
    }
    if (combatHeroes.Mage.ultCd > 0) {
      combatHeroes.Mage.ultCd = Math.max(0, combatHeroes.Mage.ultCd - dt);
    }
    if (combatHeroes.Mage.infuseCd > 0) {
      combatHeroes.Mage.infuseCd = Math.max(0, combatHeroes.Mage.infuseCd - dt);
    }
    for (const k of Object.keys(combatHeroes.Mage.spellCooldowns)) {
      if (combatHeroes.Mage.spellCooldowns[k] > 0) {
        combatHeroes.Mage.spellCooldowns[k] = Math.max(
          0,
          combatHeroes.Mage.spellCooldowns[k] - dt
        );
      }
    }

    if (combatHeroes.Knight.breathingTimer > 0) {
      combatHeroes.Knight.breathingTimer = Math.max(0, combatHeroes.Knight.breathingTimer - dt);
      if (combatHeroes.Knight.breathingTimer <= 0) {
        setKnightBreathing('none', 0);
      }
    }

    // Mage 6.0s Breathless Sky Meteor Barrage (1 strike pair every 0.18s = 34 strike waves / 68 meteors over 6.0s!)
    if (combatHeroes.Mage.stormCataclysmCastTimer > 0) {
      combatHeroes.Mage.stormCataclysmCastTimer = Math.max(
        0,
        combatHeroes.Mage.stormCataclysmCastTimer - dt
      );
    }
    if (combatHeroes.Mage.stormCataclysmActive && combatHeroes.Mage.stormCataclysmTimer > 0) {
      combatHeroes.Mage.stormCataclysmTimer = Math.max(
        0,
        combatHeroes.Mage.stormCataclysmTimer - dt
      );
      combatHeroes.Mage.stormCataclysmWaveTimer += dt;
      const meteorInterval = 0.18;
      const maxMeteors = 34;
      while (
        combatHeroes.Mage.stormCataclysmWaveTimer >= meteorInterval &&
        combatHeroes.Mage.stormCataclysmMeteorsFired < maxMeteors
      ) {
        combatHeroes.Mage.stormCataclysmWaveTimer -= meteorInterval;
        const mPos = mage || { x: 0, y: 0, z: 0, yaw: 0 };
        fireSkyMeteorStrike(mPos, combatHeroes.Mage.stormCataclysmMeteorsFired, heroStates);
        combatHeroes.Mage.stormCataclysmMeteorsFired += 1;
      }
      if (combatHeroes.Mage.stormCataclysmTimer <= 0) {
        combatHeroes.Mage.stormCataclysmActive = false;
        combatHeroes.Mage.stormCataclysmCastTimer = 0;
      }
    }

    if (tetherSurge.active) {
      tetherSurge.progress += dt / tetherSurge.duration;
      if (tetherSurge.progress >= 1.0) {
        tetherSurge.active = false;
      }
    }

    // 1A. Sacred 6m Commune Ward Pushback only during Mode B Divine Miracle channel or Blessing sequence
    if (
      ((communeChannelActive && communeMode === 'divine_miracle') ||
        (verdictSequence.active && verdictSequence.kind === 'blessing')) &&
      enemyManager?.applySacredWardPushback
    ) {
      const cx = knight && mage ? (knight.x + mage.x) * 0.5 : (knight?.x ?? mage?.x ?? 0);
      const cz = knight && mage ? (knight.z + mage.z) * 0.5 : (knight?.z ?? mage?.z ?? 0);
      enemyManager.applySacredWardPushback({ x: cx, z: cz }, 6.0);
    }

    // 1B. Advance Couples Resonance Ultimate Choreography (`ultimateSequence`, zero hopVy!)
    if (ultimateSequence.active) {
      ultimateSequence.age += dt;
      if (!ultimateSequence.beat2Fired && ultimateSequence.age >= 0.55) {
        ultimateSequence.beat2Fired = true;
        if (vfxKit) {
          vfxKit.stormLance?.cast?.(
            ultimateSequence.castOrigin,
            ultimateSequence.aimDir,
            { range: ultimateSequence.range }
          );
          if (mage) {
            fireMageStaffVolleyVfx(mage, ultimateSequence.impactPos, 3);
          }
          if (knight) {
            knight.x += ultimateSequence.aimDir.x * 1.45;
            knight.z += ultimateSequence.aimDir.z * 1.45;
            knight.vy = 0;
            knight.grounded = true;
            knight.actionState = 'combo4';
            knight.actionTimer = 0.66;
            knight.char?.play?.('combo4', {
              loop: false,
              fade: 0.06,
              startTime: 0,
              timeScale: 1.0,
              force: true,
            });
            vfxKit.swordVfx?.triggerSwing?.(
              'combo4',
              { x: knight.x, y: knight.y, z: knight.z },
              ultimateSequence.aimYaw,
              'eclipse'
            );
          }
          vfxKit.swordVfx?.triggerDetonation?.('eclipse', ultimateSequence.impactPos);
        }
        if (enemyManager) {
          enemyManager.applyAreaOrLineHit({
            origin: ultimateSequence.impactPos,
            radius: COUPLES_ULTIMATE.radius + 4.5,
            hitSpec: {
              source: 'couples_ultimate',
              baseDmg: COUPLES_ULTIMATE.dmg,
              infusion: 'eclipse',
              detonatesMark: true,
              empoweredBreathing: true,
              attackerPos: knight || ultimateSequence.impactPos,
            },
          });
        }
        if (combatSfx?.playDetonation) {
          combatSfx.playDetonation('solar_flare');
        }
        if (onDetonation) {
          onDetonation({
            id: 'solar_flare',
            label: 'SUN & TIDE ECLIPSE CATACLYSM!',
            bonusDmg: COUPLES_ULTIMATE.dmg * 2,
            x: ultimateSequence.impactPos.x,
            y: ultimateSequence.impactPos.y,
            z: ultimateSequence.impactPos.z,
          });
        }
      }
      if (ultimateSequence.age >= 1.5) {
        ultimateSequence.active = false;
      }
    }

    // 2. Downed State, Proximity Revive (<= 2.8m for 2.5s -> 45% Max HP + 2.0s i-frames) & Safe Haven Rebirth (2.5s)
    if (knight && mage && !verdictSequence.active) {
      if (combatHeroes.Knight.downed && combatHeroes.Mage.downed) {
        if (!smiteWipeCompletedThisFrame) {
          bothDownedTimer += dt;
        }
        combatHeroes.Knight.reviveProgress = clamp(bothDownedTimer / 2.5, 0, 1);
        combatHeroes.Mage.reviveProgress = clamp(bothDownedTimer / 2.5, 0, 1);
        if (bothDownedTimer >= 2.5) {
          bothDownedTimer = 0;
          const nearest = selectNearestSafeHavenWaypoint(knight || mage);
          knight.x = nearest.x;
          knight.z = nearest.z;
          knight.y = walkableHeightAt(knight.x, knight.z);
          mage.x = nearest.x + 1.8;
          mage.z = nearest.z + 0.4;
          mage.y = walkableHeightAt(mage.x, mage.z);

          // Full wipe restarts the current act: enemies and wave progress reset,
          // heroes regroup at the nearest sanctuary. Losing costs the act, not 4 seconds.
          if (enemyManager) enemyManager.clearAllEnemies();
          waveIndex = -1;
          actTriggered = false;
          for (const [id, ch] of Object.entries(combatHeroes)) {
            ch.downed = false;
            ch.reviveTimer = 0;
            ch.reviveProgress = 0;
            ch.hp = ch.maxHp;
            ch.shield = 0;
            ch.shieldTimer = 0;
            ch.iframeTimer = 2.5;
            const st = id === 'Knight' ? knight : mage;
            st.actionState = null;
            st.actionTimer = 0;
            st.char?.play?.('revive', { loop: false, fade: 0.1, force: true });
          }

          if (activeStrongholdIds.size > 0) {
            enemyManager?.clearAllEnemies?.();
            for (const shKey of activeStrongholdIds) {
              strongholdWaveIndex[shKey] = -1;
            }
            activeStrongholdIds.clear();
          }

          combatSfx?.playShieldChime?.();
          emitBanner(
            'THE VALLEY FALLS SILENT',
            'You regroup at the sanctuary stone. The battle begins anew when you return.',
            'warning'
          );
        }
      } else if (combatHeroes.Knight.downed || combatHeroes.Mage.downed) {
        bothDownedTimer = 0;
        // Partner revive: stand beside your fallen partner; damage and distance set it back.
        for (const [id, ch] of Object.entries(combatHeroes)) {
          if (!ch.downed) {
            ch.reviveProgress = 0;
            ch.reviveTimer = 0;
            continue;
          }
          const downedSt = id === 'Knight' ? knight : mage;
          const reviverSt = id === 'Knight' ? mage : knight;
          const near =
            !communeChannelActive &&
            Math.hypot(downedSt.x - reviverSt.x, downedSt.z - reviverSt.z) <= PARTNER_REVIVE_RADIUS;
          const step = dt / PARTNER_REVIVE_SECONDS;
          ch.reviveProgress = clamp(ch.reviveProgress + (near ? step : -step * 0.5), 0, 1);
          if (ch.reviveProgress >= 1) {
            ch.downed = false;
            ch.reviveProgress = 0;
            ch.reviveTimer = 0;
            const reviveHpFrac = vfxKit ? PARTNER_REVIVE_HP : 0.35;
            ch.hp = Math.round(ch.maxHp * reviveHpFrac);
            ch.iframeTimer = Math.max(ch.iframeTimer, 2.0);
            downedSt.actionState = null;
            downedSt.actionTimer = 0;
            downedSt.char?.play?.('revive', { loop: false, fade: 0.1, force: true });
            combatSfx?.playShieldChime?.();
            emitBanner(`${id.toUpperCase()} RISES AGAIN`, 'Carried back by love alone.', 'blessing');
          }
        }
      } else {
        bothDownedTimer = 0;
        for (const ch of Object.values(combatHeroes)) {
          ch.reviveTimer = 0;
          ch.reviveProgress = 0;
        }
      }
    }

    // 3. Open-Valley Strongholds, Survival Waves & Legacy Act Trigger Progression
    const act = ACT_DEFINITIONS[currentActId];
    const leaderPos = (activeHeroId === 'Mage' ? mage : knight) || knight || mage;

    if (openValleyMode && !indicatorsHiddenForShot && leaderPos) {
      const inRoadTriggerZone = vfxKit
        ? leaderPos.z <= 106.0 && leaderPos.z > 65.0
        : leaderPos.z > 65.0;
      if (!roadVanguardSpawned && inRoadTriggerZone) {
        spawnRoadVanguardPack({
          x: clamp(leaderPos.x, -3.5, 3.5),
          z: clamp(leaderPos.z - (vfxKit ? 10.0 : 22.0), 96.0, 104.0),
        });
      }
      checkStrongholdTriggers(leaderPos);
    } else if (act && leaderPos && !actTriggered && currentActId !== 'victory_dawn') {
      const dCenter = Math.hypot(
        leaderPos.x - act.center.x,
        leaderPos.z - act.center.z
      );
      if (dCenter <= act.triggerRadius) {
        if (currentActId === 'interlude_pier') {
          activatePierSanctuary();
        } else if (act.waves && act.waves.length > 0) {
          actTriggered = true;
          startWave(0);
        }
      }
    }

    if (enemyManager) {
      enemyManager.update(
        dt,
        {
          Knight: knight
            ? {
                ...knight,
                downed: combatHeroes.Knight.downed,
                iframeTimer: combatHeroes.Knight.iframeTimer,
              }
            : null,
          Mage: mage
            ? {
                ...mage,
                downed: combatHeroes.Mage.downed,
                iframeTimer: combatHeroes.Mage.iframeTimer,
              }
            : null,
        },
        camera
      );

      // Advance or complete Open-Valley Strongholds & Survival Waves
      if (openValleyMode && !indicatorsHiddenForShot) {
        if (
          activeStrongholdIds.size > 0 &&
          enemyManager.activeEnemies.length === 0 &&
          enemyManager.spawnQueue.length === 0
        ) {
          for (const shKey of [...activeStrongholdIds]) {
            const sh = STONE_STRONGHOLDS[shKey];
            const shWaves = getStrongholdWaves(sh);
            const nextW = (strongholdWaveIndex[shKey] ?? 0) + 1;
            if (sh && shWaves.length > 0 && nextW < shWaves.length) {
              strongholdWaveIndex[shKey] = nextW;
              enemyManager.setCurrentActId?.(shKey);
              enemyManager.spawnWave?.(shWaves[nextW], shKey);
              emitBanner(sh.name.toUpperCase(), shWaves[nextW].label, 'wave');
            } else {
              activeStrongholdIds.delete(shKey);
              strongholdWaveIndex[shKey] = -1;
              strongholdClearedMask |= STRONGHOLD_BITS[shKey] || 0;
              survivalWaveTimer = 28.0; // Grant ~112s of calm sanctuary time after clearing a stronghold
              reviveAllInstant();
              if (shKey === 'apex_finale') {
                transitionToAct('victory_dawn');
                emitBanner(
                  'DAWN OVER AMARANTE · EXPEDITION COMPLETE',
                  'The Hollow Sovereign & Ashen Court Are Vanquished — Love Prevails Across the Valley!',
                  'blessing'
                );
              } else if (sh) {
                emitBanner(
                  `${sh.name.toUpperCase()} SANCTIFIED`,
                  'Guardian Forces Vanquished — Inspect the Sacred Stone [G] and Speak [R]',
                  'blessing'
                );
              }
            }
          }
        } else if (
          activeStrongholdIds.size === 0 &&
          !isControlLocked() &&
          currentActId !== 'victory_dawn' &&
          leaderPos &&
          enemyManager.activeEnemies.length < (vfxKit ? 1 : 3) &&
          enemyManager.spawnQueue.length === 0
        ) {
          const nearestHaven = selectNearestSafeHavenWaypoint(leaderPos);
          const distHaven = Math.hypot(
            leaderPos.x - nearestHaven.x,
            leaderPos.z - nearestHaven.z
          );
          const nearSacredStone = vfxKit
            ? ['site1_well', 'site2_platform', 'site3_wall'].some((sk) => {
                const c = STONE_STRONGHOLDS[sk]?.center;
                return c && Math.hypot(leaderPos.x - c.x, leaderPos.z - c.z) <= 18.0;
              })
            : false;
          if (distHaven > 8.5 && !nearSacredStone) {
            survivalWaveTimer -= vfxKit ? dt * 0.25 : dt;
            if (survivalWaveTimer <= 0) {
              triggerSurvivalWave(leaderPos);
            }
          }
        }
      }

      if (
        act &&
        actTriggered &&
        act.waves &&
        act.waves.length > 0 &&
        enemyManager.activeEnemies.length === 0 &&
        enemyManager.spawnQueue.length === 0
      ) {
        reviveAllInstant();
        if (waveIndex + 1 < act.waves.length) {
          startWave(waveIndex + 1);
        } else {
          const nextActId = ACT_SEQUENCE[actIndex + 1];
          if (nextActId) {
            transitionToAct(nextActId);
          }
        }
      }
    }

    // 4. Role-Symmetric Smart Solo Wingman AI (NEVER hijacks the human player's active hero!)
    if (
      soloWingmanActive &&
      enemyManager &&
      enemyManager.activeEnemies.length > 0 &&
      !isControlLocked()
    ) {
      const stage2Unlocked =
        getUnlockedStage() >= 2 ||
        (getStonesSolvedMask() & 2) !== 0 ||
        (!getProgressionState && manualUnlockedStage === null);
      const stage1Unlocked =
        stage2Unlocked || getUnlockedStage() >= 1 || (getStonesSolvedMask() & 1) !== 0;

      if (activeHeroId === 'Mage') {
        // Human is playing Mage -> AI Wingman is Knight!
        const catCenter = combatHeroes.Mage.stormCataclysmCenter;
        const knightInMeteorDanger = Boolean(
          combatHeroes.Mage.stormCataclysmActive &&
            catCenter &&
            knight &&
            Math.hypot(knight.x - catCenter.x, knight.z - catCenter.z) <=
              (HERO_STATS.Mage.stormCataclysmRadius || 8.4)
        );
        if (
          knight &&
          !combatHeroes.Knight.downed &&
          !knight.actionState &&
          !knightInMeteorDanger
        ) {
          if (
            stage1Unlocked &&
            !combatHeroes.Knight.powerSwordActive &&
            !combatHeroes.Knight.ultActive &&
            combatHeroes.Knight.powerSwordCd <= 0.05
          ) {
            const mageElem = combatHeroes.Mage.selectedElement || 'ice';
            combatHeroes.Knight.selectedElement = stage2Unlocked
              ? mageElem === 'fire'
                ? 'ice'
                : 'fire'
              : 'ice';
            performPartnerSkill('Knight', heroStates);
          }

          wingmanBoltTimer -= dt;
          if (wingmanBoltTimer <= 0) {
            const target = enemyManager.activeEnemies.find(
              (e) =>
                e &&
                !e.dead &&
                e.active &&
                Math.hypot(e.x - knight.x, e.z - knight.z) <= 4.6
            );
            if (target) {
              wingmanBoltTimer = 0.92;
              const sIdx = wingmanBoltIdx % 4;
              wingmanBoltIdx++;
              const swingClip =
                sIdx === 0
                  ? 'combo1'
                  : sIdx === 1
                    ? 'combo2'
                    : sIdx === 2
                      ? 'combo3'
                      : 'combo4';
              knight.yaw = Math.atan2(target.x - knight.x, target.z - knight.z);
              knight.actionState = swingClip;
              knight.actionTimer = 0.50;
              knight.char?.play?.(swingClip, {
                loop: false,
                fade: 0.07,
                startTime: 0,
                timeScale: 1.0,
                force: true,
              });
              performKnightSwing(swingClip, knight, knight.yaw, mage);
            }
          }
        }
      } else if (
        mage &&
        !combatHeroes.Mage.downed &&
        !(combatHeroes.Mage.stormCataclysmCastTimer > 0) &&
        !mage.actionState
      ) {
        // Human is playing Knight -> AI Wingman is Mage!
        wingmanCastTimer -= dt;
        wingmanBoltTimer -= dt;

        const nearbyEnemies = enemyManager.activeEnemies
          .filter(
            (e) =>
              e &&
              !e.dead &&
              e.active &&
              Math.hypot(e.x - mage.x, e.z - mage.z) <= 15.5
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - mage.x, a.z - mage.z) -
              Math.hypot(b.x - mage.x, b.z - mage.z)
          );
        const nearestEnemy = nearbyEnemies[0] || null;
        const nearestDist = nearestEnemy
          ? Math.hypot(nearestEnemy.x - mage.x, nearestEnemy.z - mage.z)
          : Infinity;

        if (stage1Unlocked && wingmanCastTimer <= 0 && nearestEnemy && nearestDist <= 15.5) {
          wingmanCastTimer = 6.5;
          wingmanBoltTimer = 1.05;
          let nextSpellId;
          const kStyle = combatHeroes.Knight.breathingStyle;
          const kSummoned = combatHeroes.Knight.summonedElement;
          if (
            stage2Unlocked &&
            (kStyle === 'rime' || (kStyle === 'eclipse' && kSummoned === 'ice'))
          ) {
            nextSpellId = 'cinder_fall';
          } else if (
            stage2Unlocked &&
            (kStyle === 'solar' || (kStyle === 'eclipse' && kSummoned === 'fire'))
          ) {
            nextSpellId = 'frost_lance';
          } else if (!stage2Unlocked) {
            nextSpellId = wingmanSpellIdx % 2 === 0 ? 'frost_lance' : 'shatterlance';
          } else {
            nextSpellId =
              WINGMAN_SPELL_ROTATION[wingmanSpellIdx % WINGMAN_SPELL_ROTATION.length];
          }
          wingmanSpellIdx++;
          combatHeroes.Mage.spellCooldowns[nextSpellId] = 0;
          const yaw = Math.atan2(nearestEnemy.x - mage.x, nearestEnemy.z - mage.z);
          mage.yaw = yaw;
          mage.actionState = 'cast_spell';
          mage.actionTimer = 0.62;
          mage.char?.play?.('cast_spell', {
            loop: false,
            fade: 0.08,
            startTime: 0,
            timeScale: 1.0,
            force: true,
          });
          castSpell(nextSpellId, mage, yaw, knight, {
            fromWingmanAi: true,
            ignoreCooldown: true,
            distance: clamp(nearestDist, 3.0, 16.0),
            targetPos: { x: nearestEnemy.x, y: nearestEnemy.y ?? 0, z: nearestEnemy.z },
          });
        } else if (
          wingmanBoltTimer <= 0 &&
          nearestEnemy &&
          nearestDist <= (HERO_STATS.Mage.boltRange || 13.5)
        ) {
          wingmanBoltTimer = 1.05;
          const bIdx = wingmanBoltIdx % 3;
          wingmanBoltIdx++;
          const boltClip =
            bIdx === 0 ? 'mage_attack1' : bIdx === 1 ? 'mage_attack2' : 'mage_attack3';
          const boltDuration = bIdx === 2 ? 0.56 : 0.5;

          const boltRes = performMageBoltAttack(bIdx, mage, knight);
          if (boltRes) {
            mage.actionState = boltClip;
            mage.actionTimer = boltDuration;
            mage.char?.play?.(boltClip, {
              loop: false,
              fade: 0.07,
              startTime: 0,
              timeScale: 1.0,
              force: true,
            });
          }
        }
      }
    }

    // 5. Keep indicator meshes permanently hidden (zero clutter)
    updateIndicatorsInstancedMeshes(heroStates);

    if (hudDirtyTimer >= 0.12 && onHudStateChanged) {
      hudDirtyTimer = 0;
      onHudStateChanged(getStateSnapshot(heroStates));
    }
  }

  function getStateSnapshot(heroStates = null) {
    const act = ACT_DEFINITIONS[currentActId];
    const boss =
      enemyManager?.activeEnemies?.find((e) => e.isBoss && !e.dead) || null;
    const dist = heroStates
      ? getPartnerDistance(heroStates.Knight, heroStates.Mage)
      : 0;
    const kEnergyPct = clamp(
      combatHeroes.Knight.qEnergy / Math.max(1, combatHeroes.Knight.qEnergyMax),
      0,
      1
    );
    const mEnergyPct = clamp(
      combatHeroes.Mage.qEnergy / Math.max(1, combatHeroes.Mage.qEnergyMax),
      0,
      1
    );
    combatHeroes.Knight.qEnergyPct = kEnergyPct;
    combatHeroes.Mage.qEnergyPct = mEnergyPct;

    return {
      actId: currentActId,
      actName: act?.name || '',
      tod: act?.tod || 'day',
      waveIndex,
      waveCount: act?.waves?.length || 0,
      waveLabel: act?.waves?.[waveIndex]?.label || '',
      actTriggered,
      activeEnemyCount: enemyManager ? enemyManager.activeEnemies.length : 0,
      queuedEnemyCount: enemyManager ? enemyManager.spawnQueue.length : 0,
      heartResonance: Math.round(heartResonance),
      partnerDistance: Number(dist.toFixed(2)),
      withinCommuneRange: dist <= COMMUNE_MAX_DISTANCE,
      withinTetherRange: dist <= DIVINE_BLESSING_TETHER_DISTANCE,
      divineBlessingActive,
      divineBlessingTimer: Number(divineBlessingTimer.toFixed(2)),
      tetherOutTimer: Number(tetherOutTimer.toFixed(2)),
      communeChannelActive,
      communeMode,
      miracleReady: isMiracleReady(heroStates),
      modeAHealCd: Number(modeAHealCd.toFixed(2)),
      modeBMiracleCd: Number(modeBMiracleCd.toFixed(2)),
      stoneGuessCd: Number(stoneGuessCd.toFixed(2)),
      awakeningEclipseActive: awakeningEclipseTimer > 0,
      awakeningEclipseTimer: Number(awakeningEclipseTimer.toFixed(2)),
      stonesSolvedMask: getStonesSolvedMask(),
      unlockedStage: getUnlockedStage(),
      strongholdClearedMask,
      controlLocked: isControlLocked(),
      verdictSequence: { ...verdictSequence },
      knight: {
        ...combatHeroes.Knight,
        qEnergyPct: kEnergyPct,
      },
      mage: {
        ...combatHeroes.Mage,
        qEnergyPct: mEnergyPct,
        spellCooldowns: { ...combatHeroes.Mage.spellCooldowns },
      },
      boss: boss
        ? {
            name: boss.name,
            hp: boss.hp,
            maxHp: boss.maxHp,
            aegisActive: boss.aegisActive,
            aegisLayers: boss.aegisLayers,
            mark: boss.mark,
          }
        : null,
    };
  }

  function applyRemoteStateSync(syncPayload = {}) {
    if (syncPayload.actId && syncPayload.actId !== currentActId) {
      transitionToAct(syncPayload.actId, {
        autoTriggerWaves: Boolean(syncPayload.actTriggered),
      });
    }
    if (typeof syncPayload.heartResonance === 'number') {
      heartResonance = clamp(syncPayload.heartResonance, 0, 100);
    }
    if (syncPayload.knightBreathing) {
      setKnightBreathing(syncPayload.knightBreathing, KNIGHT_POWER_SWORD_DURATION);
    }
  }

  function resetCampaign(options = {}) {
    clearDivineBlessing();
    verdictSequence.active = false;
    verdictSequence.kind = null;
    verdictSequence.elapsed = 0;
    verdictSequence.beat = 0;

    combatHeroes.Knight.hp = combatHeroes.Knight.maxHp;
    combatHeroes.Knight.shield = 0;
    combatHeroes.Knight.downed = false;
    combatHeroes.Knight.reviveProgress = 0;
    combatHeroes.Knight.burstHitTimer = 0;
    combatHeroes.Knight.summonedElement = null;
    combatHeroes.Knight.qEnergy = 0;
    combatHeroes.Knight.qEnergyPct = 0;
    combatHeroes.Knight.shieldBlocking = false;
    combatHeroes.Knight.powerSwordActive = false;
    combatHeroes.Knight.powerSwordTimer = 0;
    combatHeroes.Knight.powerSwordCd = 0;
    combatHeroes.Knight.ultActive = false;
    combatHeroes.Knight.ultTimer = 0;
    combatHeroes.Knight.ultCd = 0;
    combatHeroes.Knight.ultDmgMult = 1.0;
    combatHeroes.Knight.empoweredBreathing = false;
    combatHeroes.Knight.sunSwornBreathing = false;
    combatHeroes.Knight.sunSwornTimer = 0;
    combatHeroes.Knight.partnerSwordMult = 1.0;
    combatHeroes.Knight.partnerBuffTimer = 0;
    setKnightBreathing('none', 0);

    combatHeroes.Mage.hp = combatHeroes.Mage.maxHp;
    combatHeroes.Mage.shield = 0;
    combatHeroes.Mage.downed = false;
    combatHeroes.Mage.reviveProgress = 0;
    combatHeroes.Mage.burstHitTimer = 0;
    combatHeroes.Mage.qEnergy = 0;
    combatHeroes.Mage.qEnergyPct = 0;
    combatHeroes.Mage.consecutiveChargedCount = 0;
    combatHeroes.Mage.skillCd = 0;
    combatHeroes.Mage.stormCataclysmActive = false;
    combatHeroes.Mage.stormCataclysmTimer = 0;
    combatHeroes.Mage.stormCataclysmCastTimer = 0;
    combatHeroes.Mage.stormCataclysmWaveTimer = 0;
    combatHeroes.Mage.stormCataclysmMeteorsFired = 0;
    combatHeroes.Mage.stormCataclysmHitCounts = new Map();
    combatHeroes.Mage.ultCd = 0;
    combatHeroes.Mage.empoweredBreathing = false;
    combatHeroes.Mage.ascendedMagicFlow = false;
    combatHeroes.Mage.ascendedMagicTimer = 0;
    combatHeroes.Mage.partnerMagicMult = 1.0;
    combatHeroes.Mage.partnerBuffTimer = 0;
    for (const k of Object.keys(combatHeroes.Mage.spellCooldowns)) {
      combatHeroes.Mage.spellCooldowns[k] = 0;
    }

    bothDownedTimer = 0;
    communeChannelActive = false;
    communeMode = 'normal';
    modeAHealCd = 0;
    modeBMiracleCd = 0;
    stoneGuessCd = 0;
    awakeningEclipseTimer = 0;
    tetherOutTimer = 0;
    strongholdClearedMask = 0;
    activeStrongholdIds.clear();
    for (const k of Object.keys(strongholdWaveIndex)) {
      strongholdWaveIndex[k] = -1;
    }
    survivalWaveTimer = 6.0;
    roadVanguardSpawned = false;
    enemyManager?.setGlobalEnemyTimeScale?.(1.0);
    heartResonance = 25;
    transitionToAct('act1_arena');
    if (options?.spawnRoadVanguard) {
      spawnRoadVanguardPack(options?.vanguardCenter || { x: 0, z: 102 });
    }
  }

  function setIndicatorsHiddenForShot(hidden, heroStates = null) {
    indicatorsHiddenForShot = Boolean(hidden);
    updateIndicatorsInstancedMeshes(heroStates);
  }

  function setCommuneChannelActive(active, heroStates = null, options = {}) {
    const nextActive = Boolean(active);
    communeChannelActive = nextActive;
    if (nextActive) {
      const modeB = Boolean(
        !options.nearStoneId && (options.forceMiracle || isMiracleReady(heroStates))
      );
      communeMode = modeB ? 'divine_miracle' : 'normal';
      if (modeB) {
        const kx = heroStates?.Knight?.x ?? 0;
        const kz = heroStates?.Knight?.z ?? 0;
        const mx = heroStates?.Mage?.x ?? kx;
        const mz = heroStates?.Mage?.z ?? kz;
        const midX = (kx + mx) * 0.5;
        const midZ = (kz + mz) * 0.5;
        enemyManager?.blastEnemiesFromPoint?.(midX, midZ, 12.0, 12.0);
        enemyManager?.setGlobalEnemyTimeScale?.(0.10);
      } else {
        enemyManager?.setGlobalEnemyTimeScale?.(1.0);
      }
    } else {
      communeMode = 'normal';
      enemyManager?.setGlobalEnemyTimeScale?.(1.0);
    }
    return { communeChannelActive, communeMode };
  }

  return {
    indicatorGroup,
    groundIndicatorMesh: groundInd.mesh,
    crestAndTetherMesh: crestInd.mesh,
    combatHeroes,
    state,
    tetherSurge,
    verdictSequence,
    get currentActId() {
      return currentActId;
    },
    get waveIndex() {
      return waveIndex;
    },
    get actTriggered() {
      return actTriggered;
    },
    get heartResonance() {
      return heartResonance;
    },
    get communeChannelActive() {
      return communeChannelActive;
    },
    get communeMode() {
      return communeMode;
    },
    get modeAHealCd() {
      return modeAHealCd;
    },
    get modeBMiracleCd() {
      return modeBMiracleCd;
    },
    get stoneGuessCd() {
      return stoneGuessCd;
    },
    get awakeningEclipseTimer() {
      return awakeningEclipseTimer;
    },
    get strongholdClearedMask() {
      return strongholdClearedMask;
    },
    get survivalWaveTimer() {
      return survivalWaveTimer;
    },
    isControlLocked,
    isDivineBlessingActive,
    getDivineBlessingRemaining,
    activateDivineBlessing,
    clearDivineBlessing,
    addResonance,
    addHeroQEnergy,
    getUnlockedStage,
    getStonesSolvedMask,
    isStage3Unlocked,
    setUnlockedStage,
    setOpenValleyMode,
    awardKnightKillXp,
    handleBossPhaseThreshold,
    awardPerfectDodgeEnergy,
    setKnightBreathing,
    toggleHeroElement,
    setKnightShieldBlocking,
    startWave,
    transitionToAct,
    activatePierSanctuary,
    checkStrongholdTriggers,
    spawnRoadVanguardPack,
    startExpedition,
    triggerSurvivalWave,
    handlePlayerHit,
    applyCommuneVerdict,
    isMiracleReady,
    getNearbyLivingEnemies,
    isStoneContested,
    canCommuneTogether,
    canStartDivinePrayer,
    getPartnerDistance,
    isWithinPowerupTether,
    setCommuneChannelActive,
    castSpell,
    performKnightSwing,
    performMageBoltAttack,
    performPartnerSkill,
    performKnightUltimate,
    performMageStormCataclysm,
    performCouplesUltimate,
    getStateSnapshot,
    applyRemoteStateSync,
    resetCampaign,
    setIndicatorsHiddenForShot,
    setOnFriendlyFireHit,
    setOnPlayerDamaged,
    updateIndicatorsInstancedMeshes,
    update,
  };
}
