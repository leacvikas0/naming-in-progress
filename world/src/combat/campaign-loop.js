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
  HERO_STATS,
  BREATHING_STYLES,
  SPELLS,
  SPELL_BY_SLOT,
  WINGMAN_SPELL_ROTATION,
  DETONATIONS,
  COUPLES_ULTIMATE,
  ACT_DEFINITIONS,
  ACT_SEQUENCE,
  COMMUNE_MAX_DISTANCE,
  COMMUNE_RESURRECT_DISTANCE,
  COMMUNE_COMBAT_HP_THRESHOLD,
  POWERUP_TETHER_DISTANCE,
  DIVINE_BLESSING_DURATION,
  DIVINE_BLESSING_TETHER_DISTANCE,
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

/* ------------------------------------------------------------------------- */
/* 1. Shared 2-InstancedMesh Opaque Cel-Shaded Indicator Builders            */
/* ------------------------------------------------------------------------- */

function createGroundIndicatorInstancedMesh() {
  const geo = new THREE.PlaneGeometry(2.0, 2.0, 1, 1);
  geo.rotateX(-Math.PI * 0.5);

  const metaArray = new Float32Array(MAX_GROUND_INDICATORS * 4);
  const metaAttr = new THREE.InstancedBufferAttribute(metaArray, 4);
  metaAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aIndicatorMeta', metaAttr);

  const mat = new THREE.ShaderMaterial({
    name: 'CombatGroundIndicatorCelMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uInkColor: { value: new THREE.Color('#1a1218') },
      uHotCoreColor: { value: new THREE.Color('#fff5d6') },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aIndicatorMeta;
      varying vec2 vLocalXZ;
      varying vec3 vColor;
      varying vec4 vMeta;

      void main() {
        vLocalXZ = position.xz;
        vColor = instanceColor;
        vMeta = aIndicatorMeta;
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uInkColor;
      uniform vec3 uHotCoreColor;

      varying vec2 vLocalXZ;
      varying vec3 vColor;
      varying vec4 vMeta;

      void main() {
        gl_FragColor = vec4(vColor, 1.0);
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, MAX_GROUND_INDICATORS);
  mesh.name = 'combatGroundIndicatorInstancedMesh';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
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
  onActChanged = null,
  onWaveChanged = null,
  onSkyTodChanged = null,
  onBanner = null,
  onDetonation = null,
  onInfusionChanged = null,
  onHudStateChanged = null,
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
      selectedElement: 'ice', // 'ice' | 'fire'
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
      consecutiveChargedCount: 0,
      skillCd: 0,
      stormCataclysmActive: false,
      stormCataclysmTimer: 0,
      stormCataclysmWaveTimer: 0,
      ultCd: 0,
      empoweredBreathing: false,
      ascendedMagicFlow: false,
      ascendedMagicTimer: 0,
      partnerMagicMult: 1.0,
      partnerBuffTimer: 0,
      perfectDodgeBuff: false,
      iframeTimer: 0,
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
  let wingmanCastTimer = 1.6;
  let wingmanSpellIdx = 0;
  let wingmanBoltTimer = 0.75;
  let wingmanBoltIdx = 0;
  let bothDownedTimer = 0;
  let lastHeroStates = null;
  const PARTNER_REVIVE_RADIUS = 2.5;
  const PARTNER_REVIVE_SECONDS = 2.5;
  const PARTNER_REVIVE_HP = 0.35;
  let communeChannelActive = false;
  let indicatorsHiddenForShot = false;
  let divineBlessingActive = false;
  let divineBlessingTimer = 0;

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

  function awardKnightKillXp(enemy) {
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
    return combatHeroes.Knight.level;
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

    const inCombat = Boolean(
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
      const nextStyle = combatHeroes.Knight.selectedElement === 'fire' ? 'solar' : 'rime';
      if (combatHeroes.Knight.powerSwordActive && combatHeroes.Knight.powerSwordTimer > 0) {
        setKnightBreathing(nextStyle, combatHeroes.Knight.powerSwordTimer);
      }
      onHudStateChanged?.(getStateSnapshot());
      return {
        heroId: 'Knight',
        element: combatHeroes.Knight.selectedElement,
        breathingStyle: nextStyle,
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
    onHudStateChanged?.(getStateSnapshot());
    return k.shieldBlocking;
  }

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

    if (onSkyTodChanged && act.tod) {
      onSkyTodChanged(act.tod);
    }
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

  function handlePlayerHit(targetHeroState, enemy, rawDmg) {
    const heroId = targetHeroState?.id || 'Knight';
    const h = combatHeroes[heroId] || combatHeroes.Knight;
    if (
      divineBlessingActive ||
      communeChannelActive ||
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
      combatHeroes.Knight.shieldBlocking &&
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
    if (
      heroId === 'Knight' &&
      combatHeroes.Knight.shieldBlocking &&
      isInKnightFrontArc(enemy)
    ) {
      effectiveDmg = Math.max(
        1,
        Math.round(rawDmg * (1.0 - KNIGHT_SHIELD_BLOCK_DR))
      );
      drainKnightGuard(rawDmg * KNIGHT_GUARD_HIT_COST);
    }

    let rem = effectiveDmg;
    let absorbed = 0;
    if (h.shield > 0) {
      absorbed = Math.min(h.shield, rem);
      h.shield -= absorbed;
      rem -= absorbed;
    }

    // Mage Q 6.0s Storm Cataclysm vulnerability: 1 unprotected hit immediately downs her!
    if (heroId === 'Mage' && combatHeroes.Mage.stormCataclysmActive && rem > 0) {
      h.hp = 0;
      h.downed = true;
      h.reviveProgress = 0;
      combatHeroes.Mage.stormCataclysmActive = false;
      combatHeroes.Mage.stormCataclysmTimer = 0;
      if (targetHeroState?.char?.play) {
        targetHeroState.char.play('death', { loop: false, fade: 0.1, force: true });
      }
      if (combatSfx?.playPlayerHit) {
        combatSfx.playPlayerHit();
      }
      emitBanner(
        'STORM CATACLYSM SHATTERED · MAGE DOWNED!',
        'Unprotected during Storm Cataclysm! Use Commune to Resurrect!',
        'warning'
      );
      return {
        absorbed,
        hpLost: effectiveDmg - absorbed,
        downed: true,
        cataclysmInterrupted: true,
        interceptedByKnight: false,
      };
    }

    h.hp = Math.max(0, h.hp - rem);
    const partnerOfHit = combatHeroes[heroId === 'Knight' ? 'Mage' : 'Knight'];
    if (rem > 0 && partnerOfHit?.downed) partnerOfHit.reviveProgress *= 0.5;
    if (combatSfx?.playPlayerHit) {
      combatSfx.playPlayerHit();
    }
    if (h.hp <= 0) {
      h.hp = 0;
      h.downed = true;
      h.reviveProgress = 0;
      if (targetHeroState?.char?.play) {
        targetHeroState.char.play('death', { loop: false, fade: 0.1, force: true });
      }
      emitBanner(
        `${heroId.toUpperCase()} HAS FALLEN!`,
        'Stand beside your beloved to lift them back up, or pray.',
        'warning'
      );
    }
    return { absorbed, hpLost: rem, downed: h.downed, interceptedByKnight: false };
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
    const partnerPos = partnerEntity || {
      x: (speakerPos.x ?? 2.8) + 1.8,
      y: speakerPos.y ?? 0,
      z: (speakerPos.z ?? 14.5) + 0.5,
    };

    communeChannelActive = false;

    if (verdict === 'smite') {
      clearDivineBlessing();
      const partnerAlreadyDowned = Boolean(partnerHero.downed);
      const dissolveRole = partnerAlreadyDowned ? speakerKey : partnerKey;

      verdictSequence.active = true;
      verdictSequence.kind = 'smite';
      verdictSequence.verdict = 'smite';
      verdictSequence.elapsed = 0;
      verdictSequence.duration = 2.8;
      verdictSequence.beat = 1;
      verdictSequence.speakerRole = speakerKey;
      verdictSequence.dissolveRole = dissolveRole;

      if (partnerAlreadyDowned) {
        // Case 2: Partner was ALREADY dead/downed when Smite hit -> Speaker dissolves & dies (Total Party Wipe)
        speakerHero.shield = 0;
        speakerHero.shieldTimer = 0;
        speakerHero.hp = 0;
        speakerHero.downed = true;
        speakerHero.reviveProgress = 0;
        vfxKit?.artoriousVfx?.triggerSmite?.(speakerPos, partnerPos);
        if (speakerEntity) {
          speakerEntity.praying = false;
          speakerEntity.actionState = 'death';
          speakerEntity.actionTimer = 2.8;
          speakerEntity.char?.play?.('death', { loop: false, fade: 0.08, force: true });
        }
        if (partnerEntity) {
          partnerEntity.praying = false;
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
        verdict: 'smite',
        speakerRole: speakerKey,
        dissolveRole,
        speakerHp: speakerHero.hp,
        partnerHp: partnerHero.hp,
        totalPartyWipe: Boolean(combatHeroes.Knight.downed && combatHeroes.Mage.downed),
      };
    }

    // Unified 4.80s 4-Beat Blessing / Heal / Miracle Sequence (ZERO direct enemy damage!)
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

    if (verdict === 'heal') {
      vfxKit?.artoriousVfx?.triggerHeal?.(speakerPos, partnerPos);
      addResonance(25);
    } else if (verdict === 'miracle') {
      vfxKit?.artoriousVfx?.triggerMiracle?.(speakerPos, partnerPos);
      heartResonance = 100;
    } else {
      vfxKit?.artoriousVfx?.triggerBlessing?.(speakerPos, partnerPos);
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
        'Briar Sanctuary Encloses You Both · 30s Proximity Blessing (<= 5.0m Tether: Invincible, 2x DMG, Fast CD)',
      'blessing'
    );
    onHudStateChanged?.(getStateSnapshot(heroStates));
    return {
      verdict,
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
    setKnightBreathing(
      combatHeroes.Knight.sunSwornBreathing ? 'eclipse' : spell.infusion,
      Math.max(KNIGHT_POWER_SWORD_DURATION, combatHeroes.Knight.sunSwornTimer)
    );

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
      } else {
        hits = enemyManager.applyAreaOrLineHit({
          origin: casterPos,
          direction: { x: dirX, z: dirZ },
          range: effectiveRange,
          width: spell.width || 2.6,
          hitSpec: commonHitSpec,
        });
      }

      for (const h of hits) {
        if (h.result?.killed) {
          awardKnightKillXp(h.enemy);
        }
        if (h.result?.detonation) {
          addResonance(DETONATIONS[h.result.detonation.id]?.resonanceGain || 18);
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

    return {
      spell,
      distance: effectiveRange,
      targetYaw,
      targetPos,
      softTarget,
      hits,
    };
  }

  function performKnightSwing(swingType, knightPos, knightYaw, partnerPos = null) {
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
      vfxKit.swordVfx.triggerSwing(
        swingType,
        { x: knightPos.x, y: knightPos.y, z: knightPos.z },
        swingYaw,
        activeStyle
      );
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

      for (const h of hits) {
        addResonance(h.result?.resonanceGain || 4);
        if (h.result?.killed) {
          awardKnightKillXp(h.enemy);
        }
        if (h.result?.detonation) {
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
            applyMark: 'rime',
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
            applyMark: 'rime',
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

      for (const h of hits) {
        if (h.result?.killed) {
          awardKnightKillXp(h.enemy);
        }
        if (h.result?.detonation) {
          addResonance(DETONATIONS[h.result.detonation.id]?.resonanceGain || 18);
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
   * - Mage: Casts selected `E` spell (`frost_lance` or `cinder_fall`) at aimed distance
   *   with an `8.5s` cooldown.
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

      combatHeroes.Knight.powerSwordActive = true;
      combatHeroes.Knight.powerSwordTimer = KNIGHT_POWER_SWORD_DURATION; // 13.0s
      combatHeroes.Knight.powerSwordCd = effectiveTotalCd;
      combatHeroes.Knight.interceptCd = effectiveTotalCd;
      setKnightBreathing(styleId, KNIGHT_POWER_SWORD_DURATION);
      addResonance(12);

      return {
        skill: 'power_sword',
        element: elem,
        breathingStyle: styleId,
        activeDuration: KNIGHT_POWER_SWORD_DURATION,
        totalCooldown: effectiveTotalCd,
        cooldown: effectiveTotalCd,
        downtime: effectiveDowntime,
      };
    }

    // Mage E: Cast selected spell (frost_lance or cinder_fall) with 8.5s cooldown (4.25s during Blessing)
    if (combatHeroes.Mage.skillCd > 0.05 || combatHeroes.Mage.downed) {
      return { onCooldown: true, cooldownRemaining: combatHeroes.Mage.skillCd };
    }
    const spellId = options.spellId || combatHeroes.Mage.selectedSpell || 'frost_lance';
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

  /**
   * Knight `Q` (`ultimate` — Sky-Lightning Awakening):
   * Plays native sword-raise pose (`pray_channel` / `burst_aoe`), calls down
   * fiery/water sky-lightning onto his blade, and grants `10.0s` of `2.0x` double damage (`24s` cd, `8.0s` during Blessing).
   */
  function performKnightUltimate(heroStates) {
    if (combatHeroes.Knight.downed) return null;
    if (combatHeroes.Knight.ultCd > 0.05) {
      return { onCooldown: true, cooldownRemaining: combatHeroes.Knight.ultCd };
    }

    const effectiveUltCd = divineBlessingActive
      ? Number((KNIGHT_ULT_COOLDOWN * DIVINE_BLESSING_Q_CD_MULT).toFixed(2))
      : KNIGHT_ULT_COOLDOWN;

    combatHeroes.Knight.ultActive = true;
    combatHeroes.Knight.ultTimer = KNIGHT_ULT_DURATION; // 10.0s
    combatHeroes.Knight.ultDmgMult = KNIGHT_ULT_DMG_MULT; // 2.0x
    combatHeroes.Knight.ultCd = effectiveUltCd; // 24.0s (8.0s during Blessing)

    const elem = combatHeroes.Knight.selectedElement || 'ice';
    const styleId = elem === 'fire' ? 'solar' : 'rime';
    setKnightBreathing(
      styleId,
      Math.max(combatHeroes.Knight.breathingTimer, KNIGHT_ULT_DURATION)
    );

    const kPos = heroStates?.Knight || { x: 0, y: 0, z: 0, yaw: 0 };
    const dirX = Math.sin(kPos.yaw || 0);
    const dirZ = Math.cos(kPos.yaw || 0);

    if (vfxKit) {
      vfxKit.stormLance?.cast?.(
        { x: kPos.x, y: walkableHeightAt(kPos.x, kPos.z), z: kPos.z },
        { x: dirX, y: 0, z: dirZ },
        { range: 8.5 }
      );
      vfxKit.swordVfx?.triggerSwing?.('charged', kPos, kPos.yaw || 0, styleId);
    }
    combatSfx?.playCouplesUltimate?.();

    let hits = [];
    if (enemyManager) {
      hits = enemyManager.applyAreaOrLineHit({
        origin: kPos,
        radius: 6.5,
        hitSpec: {
          source: 'knight_sky_lightning',
          baseDmg: 75,
          infusion: styleId,
          knightLevel: combatHeroes.Knight.level,
          knightUltActive: true,
          ultDmgMult: KNIGHT_ULT_DMG_MULT,
          partnerSwordMult: combatHeroes.Knight.partnerSwordMult,
          detonatesMark: true,
          attackerPos: kPos,
        },
      });
      for (const h of hits) {
        if (h.result?.killed) {
          awardKnightKillXp(h.enemy);
        }
      }
    }

    emitBanner(
      'SKY-LIGHTNING AWAKENING · 2.0× BLADE',
      `10.0s Double Sword Damage (${elem === 'fire' ? 'Hinokami Sunfire' : 'Glacial Tide'})`,
      'ultimate'
    );

    return {
      ultimate: 'knight_sky_lightning',
      poseClip: 'pray_channel',
      duration: KNIGHT_ULT_DURATION,
      dmgMult: KNIGHT_ULT_DMG_MULT,
      cooldown: effectiveUltCd,
      hits,
    };
  }

  /**
   * Mage `Q` (`ultimate` — 6.0s Vulnerable Storm Cataclysm):
   * Freezes the Mage in place for `6.0s` channeling a massive multi-wave Storm
   * Cataclysm across enemies, during which 1 unprotected hit immediately downs her!
   */
  function performMageStormCataclysm(heroStates) {
    if (combatHeroes.Mage.downed) return null;
    if (combatHeroes.Mage.ultCd > 0.05) {
      return { onCooldown: true, cooldownRemaining: combatHeroes.Mage.ultCd };
    }

    const effectiveCataclysmCd = divineBlessingActive
      ? Number((MAGE_STORM_CATACLYSM_COOLDOWN * DIVINE_BLESSING_Q_CD_MULT).toFixed(2))
      : MAGE_STORM_CATACLYSM_COOLDOWN;

    combatHeroes.Mage.stormCataclysmActive = true;
    combatHeroes.Mage.stormCataclysmTimer = MAGE_STORM_CATACLYSM_DURATION; // 6.0s
    combatHeroes.Mage.stormCataclysmWaveTimer = 0;
    combatHeroes.Mage.ultCd = effectiveCataclysmCd; // 24.0s (8.0s during Blessing)

    const mPos = heroStates?.Mage || { x: 0, y: 0, z: 0, yaw: 0 };
    const dirX = Math.sin(mPos.yaw || 0);
    const dirZ = Math.cos(mPos.yaw || 0);

    if (vfxKit?.stormLance?.cast) {
      vfxKit.stormLance.cast(
        { x: mPos.x, y: walkableHeightAt(mPos.x, mPos.z), z: mPos.z },
        { x: dirX, y: 0, z: dirZ },
        { range: 14.5 }
      );
    }
    combatSfx?.playCouplesUltimate?.();

    let hits = [];
    if (enemyManager) {
      hits = enemyManager.applyAreaOrLineHit({
        origin: mPos,
        radius: HERO_STATS.Mage.stormCataclysmRadius,
        hitSpec: {
          source: 'storm_cataclysm',
          baseDmg: HERO_STATS.Mage.stormCataclysmWaveDmg,
          applyMark: 'tempest',
          detonatesMark: true,
          empoweredBreathing: true,
          partnerMagicMult: combatHeroes.Mage.partnerMagicMult,
          attackerPos: mPos,
        },
      });
      for (const h of hits) {
        if (h.result?.killed) {
          awardKnightKillXp(h.enemy);
        }
      }
    }

    emitBanner(
      'STORM CATACLYSM · 6.0s CHANNEL!',
      'Knight Must Shield Her — 1 Unprotected Hit Downs the Mage!',
      'ultimate'
    );

    return {
      ultimate: 'storm_cataclysm',
      stationary: true,
      vulnerableOneHitDown: true,
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
   * Permanently hides floating tether beads, spinning overhead enemy diamonds,
   * and red under-enemy circles (`crestAndTetherMesh.visible = false`,
   * `groundIndicatorMesh.visible = false`).
   */
  function updateIndicatorsInstancedMeshes() {
    groundInd.mesh.count = 0;
    groundInd.mesh.visible = false;
    crestInd.mesh.count = 0;
    crestInd.mesh.visible = false;
  }

  function update(dt, { heroStates, soloWingmanActive = true, camera = null } = {}) {
    elapsed += dt;
    hudDirtyTimer += dt;

    const knight = heroStates?.Knight;
    const mage = heroStates?.Mage;
    if (knight && mage) lastHeroStates = heroStates;

    // 0. Advance Divine Verdict Sequence (2.50s 4-Beat Blessing/Resurrection OR 2.80s Smite)
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
            knight.x =
              verdictSequence.startKnightX +
              (targetKX - verdictSequence.startKnightX) * fillU;
            knight.z =
              verdictSequence.startKnightZ +
              (targetKZ - verdictSequence.startKnightZ) * fillU;
            knight.y = walkableHeightAt(knight.x, knight.z);
          }
          if (mage) {
            mage.x =
              verdictSequence.startMageX +
              (targetMX - verdictSequence.startMageX) * fillU;
            mage.z =
              verdictSequence.startMageZ +
              (targetMZ - verdictSequence.startMageZ) * fillU;
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
          // 4.80s complete: unlock controls, finalize 100% Max HP & side-by-side pop-up, start 30s Blessing
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
          }
        }
      }
    }

    // 0B. 30-Second Proximity Blessing Tether (<= 5.0m Rule)
    if (divineBlessingActive) {
      const dist = knight && mage ? getPartnerDistance(knight, mage) : 0;
      if (dist > DIVINE_BLESSING_TETHER_DISTANCE) {
        clearDivineBlessing();
        emitBanner(
          'DIVINE BLESSING BROKEN · TETHER SNAPPED',
          'Moved further than 5.0m apart — Invincibility & Double Damage ended!',
          'warning'
        );
      } else if (!blessingActivatedThisFrame) {
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

    // 1. Tick Cooldowns, Shield Timers, I-Frames, Power Sword (13s/18s) & Ultimates
    for (const h of Object.values(combatHeroes)) {
      if (h.shieldTimer > 0) {
        h.shieldTimer = Math.max(0, h.shieldTimer - dt);
        if (h.shieldTimer <= 0) h.shield = 0;
      }
      if (h.iframeTimer > 0) {
        h.iframeTimer = Math.max(0, h.iframeTimer - dt);
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

    // Mage 6.0s Vulnerable Stationary Storm Cataclysm pulses
    if (combatHeroes.Mage.stormCataclysmActive && combatHeroes.Mage.stormCataclysmTimer > 0) {
      combatHeroes.Mage.stormCataclysmTimer = Math.max(
        0,
        combatHeroes.Mage.stormCataclysmTimer - dt
      );
      combatHeroes.Mage.stormCataclysmWaveTimer += dt;
      if (combatHeroes.Mage.stormCataclysmWaveTimer >= 1.0) {
        combatHeroes.Mage.stormCataclysmWaveTimer -= 1.0;
        const mPos = mage || { x: 0, y: 0, z: 0, yaw: 0 };
        if (vfxKit?.stormLance?.cast) {
          vfxKit.stormLance.cast(
            { x: mPos.x, y: walkableHeightAt(mPos.x, mPos.z), z: mPos.z },
            { x: Math.sin(mPos.yaw || 0), y: 0, z: Math.cos(mPos.yaw || 0) },
            { range: 14.5 }
          );
        }
        if (enemyManager) {
          const hits = enemyManager.applyAreaOrLineHit({
            origin: mPos,
            radius: HERO_STATS.Mage.stormCataclysmRadius,
            hitSpec: {
              source: 'storm_cataclysm',
              baseDmg: HERO_STATS.Mage.stormCataclysmWaveDmg,
              applyMark: 'tempest',
              detonatesMark: true,
              empoweredBreathing: true,
              partnerMagicMult: combatHeroes.Mage.partnerMagicMult,
              attackerPos: mPos,
            },
          });
          for (const h of hits) {
            if (h.result?.killed) {
              awardKnightKillXp(h.enemy);
            }
          }
        }
      }
      if (combatHeroes.Mage.stormCataclysmTimer <= 0) {
        combatHeroes.Mage.stormCataclysmActive = false;
      }
    }

    if (tetherSurge.active) {
      tetherSurge.progress += dt / tetherSurge.duration;
      if (tetherSurge.progress >= 1.0) {
        tetherSurge.active = false;
      }
    }

    // 1A. Sacred 6m Commune Ward Pushback while channeling or in suspense
    if (
      (communeChannelActive ||
        (vfxKit?.artoriousVfx?.active && vfxKit.artoriousVfx.mode === 'channel')) &&
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

    // 2. Downed State & Resurrection Rules (wait until Smite/Blessing cinematic finishes)
    if (knight && mage && !verdictSequence.active && !smiteWipeCompletedThisFrame) {
      if (combatHeroes.Knight.downed && combatHeroes.Mage.downed) {
        bothDownedTimer += dt;
        combatHeroes.Knight.reviveProgress = clamp(bothDownedTimer / 3.5, 0, 1);
        combatHeroes.Mage.reviveProgress = clamp(bothDownedTimer / 3.5, 0, 1);
        if (bothDownedTimer >= 3.5) {
          bothDownedTimer = 0;
          const sanctuaries = [
            { x: ALTAR_STELE_POS.x, z: ALTAR_STELE_POS.z + 2.2 },
            { x: -37.2, z: 8.5 },
            { x: -0.9, z: -76.5 },
          ];
          let nearest = sanctuaries[0];
          let bestDist = Infinity;
          for (const s of sanctuaries) {
            const d = Math.hypot(knight.x - s.x, knight.z - s.z);
            if (d < bestDist) {
              bestDist = d;
              nearest = s;
            }
          }
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
            ch.reviveProgress = 0;
            ch.hp = ch.maxHp;
            ch.shield = 0;
            ch.shieldTimer = 0;
            const st = id === 'Knight' ? knight : mage;
            st.actionState = null;
            st.actionTimer = 0;
            st.char?.play?.('revive', { loop: false, fade: 0.1, force: true });
          }
          combatSfx?.playShieldChime?.();
          emitBanner(
            'THE VALLEY FALLS SILENT',
            'You regroup at the sanctuary stone. The battle begins anew when you return.',
            'warning'
          );
        }
      } else {
        bothDownedTimer = 0;
        // Partner revive: stand beside your fallen partner; taking damage sets it back.
        for (const [id, ch] of Object.entries(combatHeroes)) {
          if (!ch.downed) {
            ch.reviveProgress = 0;
            continue;
          }
          const downedSt = id === 'Knight' ? knight : mage;
          const reviverSt = id === 'Knight' ? mage : knight;
          const near =
            Math.hypot(downedSt.x - reviverSt.x, downedSt.z - reviverSt.z) <= PARTNER_REVIVE_RADIUS;
          // Clamp so a long sim/tab-out step can't complete a revive instantly.
          const step = Math.min(dt, 0.1) / PARTNER_REVIVE_SECONDS;
          ch.reviveProgress = clamp(ch.reviveProgress + (near ? step : -step * 0.5), 0, 1);
          if (ch.reviveProgress >= 1) {
            ch.downed = false;
            ch.reviveProgress = 0;
            ch.hp = Math.round(ch.maxHp * PARTNER_REVIVE_HP);
            ch.iframeTimer = Math.max(ch.iframeTimer, 1.0);
            downedSt.char?.play?.('revive', { loop: false, fade: 0.1, force: true });
            combatSfx?.playShieldChime?.();
            emitBanner(`${id.toUpperCase()} RISES AGAIN`, 'Carried back by love alone.', 'blessing');
          }
        }
      }
    }

    // 3. Check Act Trigger Proximity & Wave Clear Progression
    const act = ACT_DEFINITIONS[currentActId];
    const leaderPos = knight || mage;
    if (act && leaderPos && !actTriggered && currentActId !== 'victory_dawn') {
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

    // 4. Smart Solo Wingman AI (plays full native clips from startTime: 0)
    if (
      soloWingmanActive &&
      enemyManager &&
      enemyManager.activeEnemies.length > 0 &&
      mage &&
      !combatHeroes.Mage.downed &&
      !combatHeroes.Mage.stormCataclysmActive &&
      !isControlLocked()
    ) {
      wingmanCastTimer -= dt;
      wingmanBoltTimer -= dt;

      if (wingmanCastTimer <= 0 && combatHeroes.Knight.breathingStyle === 'none') {
        wingmanCastTimer = 9.0;
        wingmanBoltTimer = 1.15;
        const nextSpellId =
          WINGMAN_SPELL_ROTATION[wingmanSpellIdx % WINGMAN_SPELL_ROTATION.length];
        wingmanSpellIdx++;
        combatHeroes.Mage.spellCooldowns[nextSpellId] = 0;
        const target = enemyManager.activeEnemies[0];
        if (target) {
          const yaw = Math.atan2(target.x - mage.x, target.z - mage.z);
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
          castSpell(nextSpellId, mage, yaw, knight);
        }
      } else if (wingmanBoltTimer <= 0) {
        wingmanBoltTimer = 1.12;
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
      controlLocked: isControlLocked(),
      verdictSequence: { ...verdictSequence },
      knight: { ...combatHeroes.Knight },
      mage: {
        ...combatHeroes.Mage,
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

  function resetCampaign() {
    clearDivineBlessing();
    verdictSequence.active = false;
    verdictSequence.kind = null;
    verdictSequence.elapsed = 0;
    verdictSequence.beat = 0;

    combatHeroes.Knight.hp = combatHeroes.Knight.maxHp;
    combatHeroes.Knight.shield = 0;
    combatHeroes.Knight.downed = false;
    combatHeroes.Knight.reviveProgress = 0;
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
    combatHeroes.Mage.consecutiveChargedCount = 0;
    combatHeroes.Mage.skillCd = 0;
    combatHeroes.Mage.stormCataclysmActive = false;
    combatHeroes.Mage.stormCataclysmTimer = 0;
    combatHeroes.Mage.stormCataclysmWaveTimer = 0;
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
    heartResonance = 25;
    transitionToAct('act1_arena');
  }

  function setIndicatorsHiddenForShot(hidden, heroStates = null) {
    indicatorsHiddenForShot = Boolean(hidden);
    updateIndicatorsInstancedMeshes(heroStates);
  }

  function setCommuneChannelActive(active) {
    communeChannelActive = Boolean(active);
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
    isControlLocked,
    isDivineBlessingActive,
    getDivineBlessingRemaining,
    activateDivineBlessing,
    clearDivineBlessing,
    addResonance,
    awardKnightKillXp,
    setKnightBreathing,
    toggleHeroElement,
    setKnightShieldBlocking,
    startWave,
    transitionToAct,
    activatePierSanctuary,
    handlePlayerHit,
    applyCommuneVerdict,
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
    updateIndicatorsInstancedMeshes,
    update,
  };
}
