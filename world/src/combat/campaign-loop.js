// ============================================================================
// world/src/combat/campaign-loop.js
//
// Stage 5 3-Act Valley Expedition & Co-Op Synergy Loop:
// - Drives the 3-Act progression:
//     `act1_arena` -> `interlude_pier` -> `act2_plaza` -> `act3_shrine` -> `victory_dawn`
// - Manages Hero HP, Golden Ward Shield, Downed & Partner Revive (2.0s within
//   3.5m or instant on wave clear), Heart Resonance (0..100%), Sword Breathing
//   infusions (`rime`, `solar`, `tempest`), and `Q: Couples Resonance Ultimate`.
// - Renders ALL world-space combat indicators using STRICTLY 2 shared
//   `InstancedMesh`es (`transparent: false, depthWrite: true` with hard
//   `alphaTest` / cel shading):
//     1. `groundIndicatorMesh` (1 InstancedMesh): Enemy Telegraph Rings
//        (y = ground + 0.04m), Sanctuary Brazier Ring on West Pier, Downed
//        Revival Ring, and Guiding Golden Petal Markers along the road.
//     2. `crestAndTetherMesh` (1 InstancedMesh): 3D Overhead Elemental Crests
//        (y = 2.15m above marked enemies: cerulean diamond for `rime`,
//        vermilion-gold sun-crest for `solar`, violet-gold octahedron for
//        `tempest`, plus Boss Bone Aegis shields) AND the waist-height
//        (y = 0.85m) Golden Soul Tether between Knight and Mage.
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
  POWERUP_TETHER_DISTANCE,
  ALTAR_STELE_POS,
  selectSoftLockTarget,
} from './combat-balance.js';

const MAX_GROUND_INDICATORS = 36;
const MAX_CREST_AND_TETHER_INSTANCES = 56;
const TETHER_BEAD_COUNT = 16;

/* ------------------------------------------------------------------------- */
/* 1. Shared 2-InstancedMesh Opaque Cel-Shaded Indicator Builders            */
/* ------------------------------------------------------------------------- */

function createGroundIndicatorInstancedMesh() {
  const geo = new THREE.PlaneGeometry(2.0, 2.0, 1, 1);
  geo.rotateX(-Math.PI * 0.5);

  // Per-instance metadata: x = kind (0: ring, 1: petal chevron), y = fillProgress (0..1), z = pulsePhase, w = ringThickness
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
        float kind = vMeta.x;
        float progress = clamp(vMeta.y, 0.0, 1.0);
        float phase = vMeta.z;
        float rimWidth = vMeta.w;

        // Kind 1: Guiding Golden Petal / Directional Chevron Marker
        if (kind > 0.5) {
          vec2 p = vLocalXZ;
          // Pointed sakura/wisteria petal silhouette pointing along +Z
          float zNorm = (p.y + 0.85) * 0.55;
          float widthCurve = sin(clamp(zNorm, 0.0, 1.0) * 3.14159265) * 0.68;
          float notch = smoothstep(0.55, 0.95, zNorm) * abs(p.x) * 0.35;
          float dPetal = abs(p.x) - (widthCurve - notch);
          if (zNorm < 0.02 || zNorm > 0.98 || dPetal > 0.0) {
            discard;
          }
          float isOutline = step(-0.11, dPetal);
          float isInnerHighlight = step(dPetal, -0.32) * step(0.25, zNorm) * step(zNorm, 0.78);
          vec3 col = mix(vColor, uHotCoreColor, isInnerHighlight * 0.55);
          col = mix(col, uInkColor, isOutline);
          gl_FragColor = vec4(col, 1.0);
          return;
        }

        // Kind 0: Opaque Cel-Shaded Telegraph / Sanctuary / Revival Ring
        float r = length(vLocalXZ);
        if (r > 1.0) {
          discard;
        }

        float ang = atan(vLocalXZ.x, vLocalXZ.y);
        float segWave = step(0.0, sin(ang * 8.0 + phase));

        bool inOuterRim = r >= (1.0 - rimWidth);
        bool inFillBand = r <= progress && r >= max(0.08, progress - rimWidth * 1.45);
        bool inCenterSpoke = r <= progress && (abs(sin(ang * 4.0 + phase * 0.5)) < 0.14) && (r > 0.18);
        bool inInnerHub = r <= 0.16;

        if (!inOuterRim && !inFillBand && !inCenterSpoke && !inInnerHub) {
          discard;
        }

        // Crisp dark ink framing on ring edges
        bool isInkEdge =
          r > 0.955 ||
          (inOuterRim && r < (1.0 - rimWidth + 0.035)) ||
          (inFillBand && abs(r - progress) < 0.035);

        vec3 baseCol = vColor;
        if (inFillBand || inInnerHub) {
          baseCol = mix(vColor, uHotCoreColor, 0.42 + 0.18 * segWave);
        } else if (inOuterRim && segWave > 0.5) {
          baseCol = mix(vColor, uHotCoreColor, 0.25);
        }

        vec3 finalCol = isInkEdge ? uInkColor : baseCol;
        gl_FragColor = vec4(finalCol, 1.0);
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
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;
      varying vec3 vColor;

      void main() {
        vColor = instanceColor;
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        mat3 normalMat = mat3(modelMatrix * instanceMatrix);
        vWorldNormal = normalize(normalMat * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uInkColor;
      uniform vec3 uCoreHighlight;

      varying vec3 vWorldNormal;
      varying vec3 vViewDir;
      varying vec3 vColor;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(vViewDir);
        float ndotl = dot(N, uSunDir) * 0.5 + 0.5;
        float ndotv = max(0.0, dot(N, V));

        // 3-band cel shading + crisp silhouette ink rim
        float celBand = step(0.42, ndotl) * 0.35 + step(0.74, ndotl) * 0.45 + 0.40;
        vec3 shaded = vColor * celBand;
        shaded = mix(shaded, uCoreHighlight, step(0.82, ndotl) * 0.38);

        // Hard ink outline on grazing facets for solid anime readability
        float inkRim = 1.0 - step(0.22, ndotv);
        vec3 outCol = mix(shaded, uInkColor, inkRim * 0.88);
        gl_FragColor = vec4(outCol, 1.0);
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

  // Strictly 2 shared InstancedMeshes for all world-space combat indicators
  const groundInd = createGroundIndicatorInstancedMesh();
  const crestInd = createCrestAndTetherInstancedMesh();
  indicatorGroup.add(groundInd.mesh);
  indicatorGroup.add(crestInd.mesh);

  // Pre-allocated THREE.Color palette objects (zero per-frame heap allocations)
  const PALETTE = {
    telegraphWarn: new THREE.Color('#ff4d2e'),
    telegraphHot: new THREE.Color('#ffbd2e'),
    sanctuaryGold: new THREE.Color('#fbbf24'),
    reviveEmerald: new THREE.Color('#34d399'),
    petalGold: new THREE.Color('#fcd34d'),
    crestRime: new THREE.Color('#38bdf8'),
    crestSolar: new THREE.Color('#ff6a12'),
    crestTempest: new THREE.Color('#c084fc'),
    aegisCrimson: new THREE.Color('#e11d48'),
    aegisGold: new THREE.Color('#facc15'),
    tetherIdle: new THREE.Color('#f59e0b'),
    tetherEmpowered: new THREE.Color('#fde047'),
  };

  const _dummy = new THREE.Object3D();
  const _colorTmp = new THREE.Color();

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
    },
    Mage: {
      id: 'Mage',
      hp: HERO_STATS.Mage.maxHp,
      maxHp: HERO_STATS.Mage.maxHp,
      shield: 0,
      shieldTimer: 0,
      downed: false,
      reviveProgress: 0,
      empoweredBreathing: false,
      ascendedMagicFlow: false,
      ascendedMagicTimer: 0,
      partnerMagicMult: 1.0,
      partnerBuffTimer: 0,
      perfectDodgeBuff: false,
      iframeTimer: 0,
      infuseCd: 0,
      spellCooldowns: {
        frost_lance: 0,
        shatterlance: 0,
        cinder_fall: 0,
        storm_lance: 0,
      },
    },
  };

  // Alias map so `this.state[speakerKey]` works with 'Knight'/'Mage' or 'knight'/'mage'
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
  let communeChannelActive = false;
  let indicatorsHiddenForShot = false;

  function getPartnerDistance(posA, posB) {
    if (!posA || !posB) return 0;
    return Math.hypot((posA.x ?? 0) - (posB.x ?? 0), (posA.z ?? 0) - (posB.z ?? 0));
  }

  function isWithinPowerupTether(posA, posB) {
    if (!posA || !posB) return true;
    return getPartnerDistance(posA, posB) <= POWERUP_TETHER_DISTANCE;
  }

  function canCommuneTogether(heroStates) {
    const k = heroStates?.Knight || heroStates?.knight;
    const m = heroStates?.Mage || heroStates?.mage;
    const dist = getPartnerDistance(k, m);
    const anyDowned = Boolean(combatHeroes.Knight.downed || combatHeroes.Mage.downed);
    const bothDowned = Boolean(combatHeroes.Knight.downed && combatHeroes.Mage.downed);
    const maxDist = anyDowned ? COMMUNE_RESURRECT_DISTANCE : COMMUNE_MAX_DISTANCE;
    return {
      allowed: !bothDowned && dist <= maxDist,
      distance: dist,
      maxDist,
      anyDowned,
      bothDowned,
    };
  }

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

    // MageBoltSystem adds handForward (0.55m) and handHeight (1.24m) to origin;
    // subtract them so startX/startY/startZ lands at the exact handSlot.r staff tip!
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

  function emitBanner(title, subtitle = '', kind = 'act') {
    if (onBanner) {
      onBanner({ title, subtitle, kind });
    }
  }

  function addResonance(amount) {
    heartResonance = clamp(heartResonance + amount, 0, 100);
    return heartResonance;
  }

  function setKnightBreathing(styleId, duration = HERO_STATS.Mage.infuseDuration) {
    const validStyle = BREATHING_STYLES[styleId] ? styleId : 'none';
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

  function reviveAllInstant() {
    for (const h of Object.values(combatHeroes)) {
      if (h.downed) {
        h.downed = false;
        h.reviveProgress = 0;
        h.hp = Math.max(h.hp, Math.round(h.maxHp * 0.65));
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
    setKnightBreathing('solar', HERO_STATS.Mage.infuseDuration);

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
    if (h.downed || h.iframeTimer > 0) return;

    let rem = rawDmg;
    if (h.shield > 0) {
      const absorbed = Math.min(h.shield, rem);
      h.shield -= absorbed;
      rem -= absorbed;
    }
    h.hp = Math.max(0, h.hp - rem);
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
        'Run Within 4.8m of Your Beloved and Hold [R] Commune to Resurrect!',
        'warning'
      );
    }
  }

  /**
   * Evaluates and applies the Ancient God of Love's Commune Verdict (`smite`,
   * `heal`, `blessing`, `miracle`) to the speaker and partner.
   */
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
      vfxKit?.artoriousVfx?.triggerSmite?.(speakerPos);
      speakerHero.shield = 0;
      speakerHero.shieldTimer = 0;
      speakerHero.downed = false;
      // Drop the speaker's HP straight to 1 HP (never 0, always terrifying 1 HP!)
      state[speakerKey].hp = Math.max(1, Math.min(state[speakerKey].hp, 1));

      if (speakerEntity) {
        speakerEntity.actionState = 'hit_b';
        speakerEntity.actionTimer = 0.58;
        speakerEntity.praying = false;
        speakerEntity.char?.play?.('hit_b', { loop: false, fade: 0.06, force: true });
      }
      if (partnerEntity) {
        partnerEntity.praying = false;
      }
      combatSfx?.playPlayerHit?.();
      emitBanner(
        'DIVINE SMITE · 1 HP REMAINING!',
        judgment?.divine_quote ||
          judgment?.subtitle ||
          'Your prayer displeased the Ancient God of Love!',
        'warning'
      );
      onHudStateChanged?.(getStateSnapshot());
      return { verdict: 'smite', speakerRole: speakerKey, speakerHp: state[speakerKey].hp };
    }

    if (verdict === 'heal') {
      const healAmt = Number(judgment?.partner_heal) || 55;
      const wasDowned = partnerHero.downed;
      if (partnerHero.downed && judgment?.resurrect_partner !== false) {
        partnerHero.downed = false;
        partnerHero.reviveProgress = 0;
        partnerHero.hp = Math.min(partnerHero.maxHp, healAmt);
      } else if (!partnerHero.downed) {
        partnerHero.hp = Math.min(partnerHero.maxHp, partnerHero.hp + healAmt);
      }

      vfxKit?.artoriousVfx?.triggerHeal?.(speakerPos, partnerPos);

      combatHeroes.Mage.partnerMagicMult = Number(judgment?.partner_magic_mult) || 1.25;
      combatHeroes.Mage.partnerBuffTimer = Math.max(combatHeroes.Mage.partnerBuffTimer, 15.0);
      combatHeroes.Knight.partnerSwordMult = Number(judgment?.partner_sword_mult) || 1.20;
      combatHeroes.Knight.partnerBuffTimer = Math.max(combatHeroes.Knight.partnerBuffTimer, 15.0);

      if (speakerEntity) {
        speakerEntity.praying = false;
        speakerEntity.char?.play?.('cheer', { loop: false, fade: 0.1, force: true });
      }
      if (partnerEntity) {
        partnerEntity.praying = false;
        partnerEntity.char?.play?.(wasDowned ? 'revive' : 'cheer', {
          loop: false,
          fade: 0.1,
          force: true,
        });
      }

      addResonance(25);
      combatSfx?.playShieldChime?.();
      emitBanner(
        wasDowned ? 'DIVINE RESURRECTION · BELOVED REVIVED' : 'DIVINE GRACE · BELOVED HEALED',
        judgment?.divine_quote ||
          judgment?.subtitle ||
          `+${healAmt} HP Restored · 15s Tether Power-Up Active`,
        'blessing'
      );
      onHudStateChanged?.(getStateSnapshot());
      return {
        verdict: 'heal',
        partnerRole: partnerKey,
        partnerHp: partnerHero.hp,
        resurrected: wasDowned && !partnerHero.downed,
      };
    }

    if (verdict === 'blessing') {
      const healAmt = Number(judgment?.partner_heal) || 80;
      const wasDowned = partnerHero.downed;
      partnerHero.downed = false;
      partnerHero.reviveProgress = 0;
      partnerHero.hp = Math.min(
        partnerHero.maxHp,
        (wasDowned ? 0 : partnerHero.hp) + healAmt
      );

      speakerHero.downed = false;
      speakerHero.reviveProgress = 0;
      speakerHero.hp = Math.min(speakerHero.maxHp, speakerHero.hp + 30);

      vfxKit?.artoriousVfx?.triggerBlessing?.(speakerPos, partnerPos);

      // 22s Ascended Magic Flow on Mage + 22s Sun-Sworn Sword Breathing on Knight
      combatHeroes.Mage.ascendedMagicFlow = true;
      combatHeroes.Mage.ascendedMagicTimer = 22.0;
      combatHeroes.Mage.partnerMagicMult = Number(judgment?.partner_magic_mult) || 1.75;
      combatHeroes.Mage.partnerBuffTimer = 22.0;
      combatHeroes.Mage.empoweredBreathing = true;

      combatHeroes.Knight.sunSwornBreathing = true;
      combatHeroes.Knight.sunSwornTimer = 22.0;
      combatHeroes.Knight.partnerSwordMult = Number(judgment?.partner_sword_mult) || 1.60;
      combatHeroes.Knight.partnerBuffTimer = 22.0;
      combatHeroes.Knight.empoweredBreathing = true;

      setKnightBreathing('eclipse', 22.0);

      if (speakerEntity) {
        speakerEntity.praying = false;
        speakerEntity.char?.play?.('cheer', { loop: false, fade: 0.1, force: true });
      }
      if (partnerEntity) {
        partnerEntity.praying = false;
        partnerEntity.char?.play?.(wasDowned ? 'revive' : 'cheer', {
          loop: false,
          fade: 0.1,
          force: true,
        });
      }

      // Crack 1 layer of Boss Bone Aegis if in range
      if (enemyManager) {
        enemyManager.applyAreaOrLineHit({
          origin: speakerPos,
          radius: 15.0,
          hitSpec: {
            source: 'divine_blessing',
            baseDmg: 95,
            applyMark: 'eclipse',
            empoweredBreathing: true,
            attackerPos: speakerPos,
          },
        });
      }

      addResonance(50);
      combatSfx?.playShieldChime?.();
      emitBanner(
        'SANCTUARY BLESSING · SUN & TIDE ECLIPSE',
        judgment?.divine_quote ||
          judgment?.subtitle ||
          '22s Ascended Magic Flow (1.75x) + Sun & Tide Eclipse Blade (1.60x)',
        'blessing'
      );
      onHudStateChanged?.(getStateSnapshot());
      return {
        verdict: 'blessing',
        partnerHp: partnerHero.hp,
        speakerHp: speakerHero.hp,
      };
    }

    // verdict === 'miracle'
    const wasKnightDowned = combatHeroes.Knight.downed;
    const wasMageDowned = combatHeroes.Mage.downed;
    combatHeroes.Knight.downed = false;
    combatHeroes.Knight.reviveProgress = 0;
    combatHeroes.Mage.downed = false;
    combatHeroes.Mage.reviveProgress = 0;

    combatHeroes.Knight.hp = combatHeroes.Knight.maxHp;
    combatHeroes.Mage.hp = combatHeroes.Mage.maxHp;
    combatHeroes.Knight.shield = 40;
    combatHeroes.Knight.shieldTimer = 25.0;
    combatHeroes.Mage.shield = 40;
    combatHeroes.Mage.shieldTimer = 25.0;

    // 30s of God-Tier Ascended Magic Flow (2.2x) + Sun & Tide Eclipse Breathing (1.85x)
    combatHeroes.Mage.ascendedMagicFlow = true;
    combatHeroes.Mage.ascendedMagicTimer = 30.0;
    combatHeroes.Mage.partnerMagicMult = Number(judgment?.partner_magic_mult) || 2.2;
    combatHeroes.Mage.partnerBuffTimer = 30.0;
    combatHeroes.Mage.empoweredBreathing = true;

    combatHeroes.Knight.sunSwornBreathing = true;
    combatHeroes.Knight.sunSwornTimer = 30.0;
    combatHeroes.Knight.partnerSwordMult = Number(judgment?.partner_sword_mult) || 1.85;
    combatHeroes.Knight.partnerBuffTimer = 30.0;
    combatHeroes.Knight.empoweredBreathing = true;

    setKnightBreathing('eclipse', 30.0);
    heartResonance = 100;

    let enemyCenter = null;
    if (enemyManager && enemyManager.activeEnemies.length > 0) {
      const boss = enemyManager.activeEnemies.find((e) => e.isBoss && !e.dead);
      const refEnemy = boss || enemyManager.activeEnemies[0];
      if (refEnemy) {
        enemyCenter = { x: refEnemy.x, y: refEnemy.y || 0, z: refEnemy.z };
      }
    }

    vfxKit?.artoriousVfx?.triggerMiracle?.(speakerPos, partnerPos, enemyCenter);

    if (speakerEntity) {
      speakerEntity.praying = false;
      speakerEntity.char?.play?.(wasKnightDowned || wasMageDowned ? 'revive' : 'cheer', {
        loop: false,
        fade: 0.1,
        force: true,
      });
    }
    if (partnerEntity) {
      partnerEntity.praying = false;
      partnerEntity.char?.play?.(wasKnightDowned || wasMageDowned ? 'revive' : 'cheer', {
        loop: false,
        fade: 0.1,
        force: true,
      });
    }

    // Shatter all layers of the Act III Boss's Bone Aegis + deal massive AoE damage to nearby skeletons
    if (enemyManager) {
      for (const e of enemyManager.activeEnemies) {
        if (e && !e.dead && e.isBoss) {
          e.aegisLayers = 0;
          e.aegisActive = false;
          e.stunTimer = Math.max(e.stunTimer || 0, 3.5);
        }
      }
      enemyManager.applyAreaOrLineHit({
        origin: enemyCenter || speakerPos,
        radius: 18.0,
        hitSpec: {
          source: 'divine_miracle',
          baseDmg: 260,
          applyMark: 'eclipse',
          detonatesMark: true,
          empoweredBreathing: true,
          attackerPos: speakerPos,
        },
      });
    }

    combatSfx?.playCouplesUltimate?.();
    emitBanner(
      'DIVINE MIRACLE · THE HEAVENS PART FOR YOU BOTH!',
      judgment?.divine_quote ||
        judgment?.subtitle ||
        'Full Restore + 40 Shield · Bone Aegis Shattered · 30s Eclipse Flow · Cataclysm 100%!',
      'ultimate'
    );
    onHudStateChanged?.(getStateSnapshot());
    return {
      verdict: 'miracle',
      knightHp: combatHeroes.Knight.hp,
      mageHp: combatHeroes.Mage.hp,
      heartResonance,
    };
  }

  function castSpell(spellIdOrSlot, casterPos, aimYaw, partnerPos = null) {
    const spell =
      typeof spellIdOrSlot === 'number'
        ? SPELL_BY_SLOT[spellIdOrSlot]
        : SPELLS[spellIdOrSlot];
    if (!spell || combatHeroes.Mage.downed) return null;

    if ((combatHeroes.Mage.spellCooldowns[spell.id] || 0) > 0.05) {
      return { onCooldown: true, spell };
    }

    const withinTether = isWithinPowerupTether(casterPos, partnerPos);
    const cdMult =
      combatHeroes.Mage.ascendedMagicFlow && withinTether ? 0.45 : 1.0;
    combatHeroes.Mage.spellCooldowns[spell.id] = Number((spell.cd * cdMult).toFixed(2));
    addResonance(spell.resonanceGain);
    setKnightBreathing(
      combatHeroes.Knight.sunSwornBreathing ? 'eclipse' : spell.infusion,
      Math.max(HERO_STATS.Mage.infuseDuration, combatHeroes.Knight.sunSwornTimer)
    );

    if (combatSfx?.playSpellCast) {
      combatSfx.playSpellCast(spell.id);
    }

    const enemies = enemyManager ? enemyManager.activeEnemies : [];
    const softTarget = selectSoftLockTarget(casterPos, aimYaw, enemies, {
      maxRange: spell.range,
      partnerPos,
    });

    let targetYaw = aimYaw;
    let targetPos = null;
    if (softTarget) {
      const dx = softTarget.x - casterPos.x;
      const dz = softTarget.z - casterPos.z;
      targetYaw = Math.atan2(dx, dz);
      targetPos = { x: softTarget.x, y: softTarget.y, z: softTarget.z };
    } else {
      const tx = casterPos.x + Math.sin(aimYaw) * Math.min(10.5, spell.range * 0.75);
      const tz = casterPos.z + Math.cos(aimYaw) * Math.min(10.5, spell.range * 0.75);
      targetPos = { x: tx, y: walkableHeightAt(tx, tz), z: tz };
    }

    const dirX = Math.sin(targetYaw);
    const dirZ = Math.cos(targetYaw);
    const origin = {
      x: casterPos.x + dirX * 0.9,
      y: walkableHeightAt(casterPos.x, casterPos.z),
      z: casterPos.z + dirZ * 0.9,
    };

    // Trigger corresponding Stage 4 Opaque VFX system if wired
    if (vfxKit) {
      const sysMap = {
        frost_lance: vfxKit.frostLance,
        shatterlance: vfxKit.shatterlance,
        cinder_fall: vfxKit.cinderFall,
        storm_lance: vfxKit.stormLance,
      };
      const sys = sysMap[spell.id];
      if (sys?.cast) {
        sys.cast(origin, { x: dirX, y: 0, z: dirZ }, { range: spell.range, targetPos });
      }
    }

    // Resolve authoritative damage + Elemental Crest mark + Shatterlance detonation
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
          range: spell.range,
          width: spell.width || 2.6,
          hitSpec: commonHitSpec,
        });
      }

      for (const h of hits) {
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

    return { spell, targetYaw, targetPos, softTarget, hits };
  }

  function performKnightSwing(swingType, knightPos, knightYaw, partnerPos = null) {
    if (combatHeroes.Knight.downed) return null;

    const withinTether = isWithinPowerupTether(knightPos, partnerPos);
    if (
      combatHeroes.Knight.sunSwornBreathing &&
      withinTether &&
      combatHeroes.Knight.breathingStyle === 'none'
    ) {
      setKnightBreathing('eclipse', Math.max(4.0, combatHeroes.Knight.sunSwornTimer));
    }

    const activeStyle = withinTether ? combatHeroes.Knight.breathingStyle : 'none';

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

    const withinTether = isWithinPowerupTether(mageState, partnerPos);
    const ascendedActive = Boolean(combatHeroes.Mage.ascendedMagicFlow && withinTether);

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

    // Fire Starlight Bolt Volley from staff tip (`handSlot.r`):
    // When Ascended Magic Flow is active (within 6.5m of partner), every tap fires
    // BOTH the 3-bolt converging starlight fan AND the Starlight Nova Orb!
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
        // Charged Starlight Nova Orb + 3-bolt converging fan when Ascended
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
        // 3-Bolt Converging Starlight Fan Volley that applies 'rime' mark
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

  function performPartnerSkill(activeHeroId, heroStates) {
    const knightState = heroStates?.Knight;
    const mageState = heroStates?.Mage;

    if (activeHeroId === 'Knight') {
      if (combatHeroes.Knight.interceptCd > 0.05 || combatHeroes.Knight.downed) {
        return { onCooldown: true };
      }
      combatHeroes.Knight.interceptCd = HERO_STATS.Knight.interceptCd;
      combatHeroes.Knight.shield = HERO_STATS.Knight.interceptShield;
      combatHeroes.Knight.shieldTimer = HERO_STATS.Knight.interceptDuration;
      combatHeroes.Mage.shield = HERO_STATS.Knight.interceptShield;
      combatHeroes.Mage.shieldTimer = HERO_STATS.Knight.interceptDuration;

      if (combatSfx?.playShieldChime) {
        combatSfx.playShieldChime();
      }

      const enemies = enemyManager ? enemyManager.activeEnemies : [];
      const threat = selectSoftLockTarget(
        knightState || { x: 0, z: 0 },
        knightState?.yaw || 0,
        enemies,
        { maxRange: HERO_STATS.Knight.interceptRange, partnerPos: mageState }
      );

      let hits = [];
      if (threat && knightState) {
        const dx = threat.x - knightState.x;
        const dz = threat.z - knightState.z;
        const d = Math.hypot(dx, dz) || 1;
        const step = Math.min(d - 1.25, HERO_STATS.Knight.interceptRange);
        if (step > 0) {
          knightState.x += (dx / d) * step;
          knightState.z += (dz / d) * step;
          knightState.y = walkableHeightAt(knightState.x, knightState.z);
          knightState.yaw = Math.atan2(dx, dz);
        }
      }

      if (enemyManager && knightState) {
        hits = enemyManager.applyAreaOrLineHit({
          origin: knightState,
          radius: 4.0,
          hitSpec: {
            source: 'intercept',
            baseDmg: HERO_STATS.Knight.interceptDmg,
            infusion: combatHeroes.Knight.breathingStyle,
            empoweredBreathing: combatHeroes.Knight.empoweredBreathing,
            knockback: HERO_STATS.Knight.interceptKnockback,
            attackerPos: knightState,
          },
        });
        for (const h of hits) {
          addResonance(h.result?.resonanceGain || 8);
          if (h.result?.detonation) {
            vfxKit?.swordVfx?.triggerDetonation?.(h.result.detonation.id, h.result.detonation);
            combatSfx?.playDetonation?.(h.result.detonation.id);
            onDetonation?.(h.result.detonation, h.enemy);
          }
        }
      }
      return { skill: 'chivalric_intercept', shield: HERO_STATS.Knight.interceptShield, hits };
    }

    // Mage E: Soul Infuse (heals partner + ignites Knight's blade + marks nearby enemies)
    if (combatHeroes.Mage.infuseCd > 0.05 || combatHeroes.Mage.downed) {
      return { onCooldown: true };
    }
    combatHeroes.Mage.infuseCd = HERO_STATS.Mage.infuseCd;
    combatHeroes.Knight.hp = Math.min(
      combatHeroes.Knight.maxHp,
      combatHeroes.Knight.hp + HERO_STATS.Mage.infuseHeal
    );
    combatHeroes.Mage.hp = Math.min(
      combatHeroes.Mage.maxHp,
      combatHeroes.Mage.hp + Math.round(HERO_STATS.Mage.infuseHeal * 0.65)
    );

    const nextStyle =
      combatHeroes.Knight.breathingStyle === 'rime'
        ? 'solar'
        : combatHeroes.Knight.breathingStyle === 'solar'
          ? 'tempest'
          : 'rime';
    setKnightBreathing(nextStyle, HERO_STATS.Mage.infuseDuration);
    addResonance(14);

    if (enemyManager && mageState) {
      enemyManager.applyAreaOrLineHit({
        origin: knightState || mageState,
        radius: 6.5,
        hitSpec: {
          source: 'soul_infuse',
          baseDmg: 24,
          applyMark: nextStyle,
          empoweredBreathing: combatHeroes.Mage.empoweredBreathing,
          attackerPos: mageState,
        },
      });
    }
    return { skill: 'soul_infuse', style: nextStyle, heal: HERO_STATS.Mage.infuseHeal };
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
      Math.max(HERO_STATS.Mage.infuseDuration, combatHeroes.Knight.sunSwornTimer || 16.0)
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

    // Beat 1 (t = 0.00s — Combined Fire + Frost Vortex & Sun & Tide Eclipse Whirlwind):
    // - Mage combines Frost Vortex (Frost Lance) + Volcanic Fire Meteor (Cinder Fall) simultaneously for 2x Double Damage!
    // - Knight unleashes 360° Sun & Tide Eclipse ('eclipse' Fire & Water mixed) Whirlwind Spin ('charged')!
    // - Enemies within 12m are pulled into the vortex epicenter and rooted for 1.25s awaiting Beat 2!
    if (vfxKit) {
      vfxKit.frostLance?.cast?.(
        castOrigin,
        { x: dirX, y: 0, z: dirZ },
        { range: mageToImpactDist }
      );
      vfxKit.cinderFall?.cast?.(
        castOrigin,
        { x: dirX, y: 0, z: dirZ },
        { range: mageToImpactDist }
      );
      fireMageStaffVolleyVfx(mageState, { x: impX, y: impY + 1.0, z: impZ }, 2);
      vfxKit.swordVfx?.triggerSwing?.(
        'charged',
        { x: knightState.x, y: knightState.y ?? walkableHeightAt(knightState.x, knightState.z), z: knightState.z },
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
      // Combine Fire + Frost Vortex for 2x Double Damage (COUPLES_ULTIMATE.dmg * 2 = 360 total):
      // In live VFX sessions, Beat 1 deals COUPLES_ULTIMATE.dmg (180) Frost Vortex damage and Beat 2 deals COUPLES_ULTIMATE.dmg (180) Fire + Eclipse Cataclysm damage!
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

  function updateIndicatorsInstancedMeshes(heroStates) {
    if (indicatorsHiddenForShot) {
      groundInd.mesh.count = 0;
      groundInd.mesh.visible = false;
      crestInd.mesh.count = 0;
      crestInd.mesh.visible = false;
      return;
    }

    const knight = heroStates?.Knight;
    const mage = heroStates?.Mage;
    const enemies = enemyManager ? enemyManager.activeEnemies : [];
    const act = ACT_DEFINITIONS[currentActId];

    // -----------------------------------------------------------------------
    // 1. Populate `groundIndicatorMesh` (Telegraph Rings, Pier Sanctuary Ring,
    //    Plaza Stele Astrolabe Ring, Downed Revival Ring, and Guiding Petals)
    // -----------------------------------------------------------------------
    let gCount = 0;
    const metaArr = groundInd.metaArray;

    function pushGroundInstance(x, y, z, radius, rotY, kind, progress, phase, rimWidth, color) {
      if (gCount >= MAX_GROUND_INDICATORS) return;
      const idx = gCount++;
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, rotY, 0);
      _dummy.scale.set(radius, 1.0, radius);
      _dummy.updateMatrix();
      groundInd.mesh.setMatrixAt(idx, _dummy.matrix);
      groundInd.mesh.setColorAt(idx, color);

      const mBase = idx * 4;
      metaArr[mBase] = kind;
      metaArr[mBase + 1] = progress;
      metaArr[mBase + 2] = phase;
      metaArr[mBase + 3] = rimWidth;
    }

    // 1A. Enemy Windup Telegraph Rings (y = ground + 0.04m)
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.dead || !e.active || e.aiState !== 'windup') continue;
      _colorTmp.copy(PALETTE.telegraphWarn).lerp(PALETTE.telegraphHot, e.telegraphProgress);
      pushGroundInstance(
        e.telegraphX,
        e.telegraphY,
        e.telegraphZ,
        e.telegraphRadius,
        elapsed * 1.4,
        0.0,
        clamp(e.telegraphProgress, 0.08, 1.0),
        elapsed * 4.0 + i,
        0.13,
        _colorTmp
      );
    }

    // 1B. Town Plaza Weathered Sanctuary Stele Rotating Golden Astrolabe Ring at (2.6, 7.2)
    {
      const sy = walkableHeightAt(ALTAR_STELE_POS.x, ALTAR_STELE_POS.z) + 0.045;
      const stelePulse = 0.48 + 0.18 * Math.sin(elapsed * 2.4);
      pushGroundInstance(
        ALTAR_STELE_POS.x,
        sy,
        ALTAR_STELE_POS.z,
        1.75,
        elapsed * 0.65,
        0.0,
        stelePulse,
        elapsed * 1.8,
        0.14,
        PALETTE.sanctuaryGold
      );
    }

    // 1B-2. West Millpond Pier Sanctuary Brazier Ring
    if (currentActId === 'interlude_pier' || !combatHeroes.Knight.empoweredBreathing) {
      const pierCenter = ACT_DEFINITIONS.interlude_pier.center;
      const py = walkableHeightAt(pierCenter.x, pierCenter.z) + 0.05;
      const pulse = 0.35 + 0.25 * Math.sin(elapsed * 3.2);
      pushGroundInstance(
        pierCenter.x,
        py,
        pierCenter.z,
        currentActId === 'interlude_pier' ? 3.8 : 2.4,
        elapsed * 0.8,
        0.0,
        pulse,
        elapsed * 2.5,
        0.14,
        PALETTE.sanctuaryGold
      );
    }

    // 1C. Downed Hero Commune Resurrection Ring (radius = 4.8m)
    for (const [id, ch] of Object.entries(combatHeroes)) {
      const pos = id === 'Knight' ? knight : mage;
      if (ch.downed && pos) {
        pushGroundInstance(
          pos.x,
          walkableHeightAt(pos.x, pos.z) + 0.05,
          pos.z,
          COMMUNE_RESURRECT_DISTANCE,
          elapsed * 1.6,
          0.0,
          clamp(ch.reviveProgress, 0.16, 1.0),
          elapsed * 3.0,
          0.12,
          PALETTE.reviveEmerald
        );
      }
    }

    // 1D. Guiding Golden Petal Markers along the road toward the active Act zone
    if (act && !actTriggered && Array.isArray(act.guidePath)) {
      for (let i = 0; i < act.guidePath.length; i++) {
        const pt = act.guidePath[i];
        const nextPt = act.guidePath[i + 1] || act.center;
        const dirYaw = Math.atan2(nextPt.x - pt.x, nextPt.z - pt.z);
        const bobScale = 0.52 + 0.08 * Math.sin(elapsed * 3.4 - i * 0.7);
        const gy = walkableHeightAt(pt.x, pt.z) + 0.06;
        pushGroundInstance(
          pt.x,
          gy,
          pt.z,
          bobScale,
          dirYaw,
          1.0,
          1.0,
          elapsed * 2.0 + i,
          0.12,
          PALETTE.petalGold
        );
      }
    }

    groundInd.mesh.count = gCount;
    groundInd.mesh.visible = gCount > 0;
    if (gCount > 0) {
      groundInd.mesh.instanceMatrix.needsUpdate = true;
      if (groundInd.mesh.instanceColor) groundInd.mesh.instanceColor.needsUpdate = true;
      groundInd.metaAttr.needsUpdate = true;
      groundInd.mesh.material.uniforms.uTime.value = elapsed;
    }

    // -----------------------------------------------------------------------
    // 2. Populate `crestAndTetherMesh` strictly for 3D Overhead Enemy
    //    Elemental Crests (y = 2.15m) and Boss Bone Aegis Shields
    // -----------------------------------------------------------------------
    let cCount = 0;

    function pushCrestInstance(x, y, z, sx, sy, sz, rx, ry, rz, color) {
      if (cCount >= MAX_CREST_AND_TETHER_INSTANCES) return;
      const idx = cCount++;
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(rx, ry, rz);
      _dummy.scale.set(sx, sy, sz);
      _dummy.updateMatrix();
      crestInd.mesh.setMatrixAt(idx, _dummy.matrix);
      crestInd.mesh.setColorAt(idx, color);
    }

    // 2A. 3D Overhead Elemental Crests (y = 2.15m above marked enemies) + Boss Bone Aegis Shields
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.dead || !e.active) continue;

      if (e.mark) {
        const crestY = e.y + (e.isBoss ? 2.85 : 2.15) + Math.sin(elapsed * 4.2 + i) * 0.08;
        const spinY = elapsed * 2.8 + i;

        if (e.mark === 'rime') {
          // Cerulean Ice Diamond
          pushCrestInstance(
            e.x,
            crestY,
            e.z,
            0.24,
            0.42,
            0.24,
            0.0,
            spinY,
            0.0,
            PALETTE.crestRime
          );
        } else if (e.mark === 'solar') {
          // Vermilion-Gold Sun-Crest (central core + 2 crossed solar flares)
          pushCrestInstance(
            e.x,
            crestY,
            e.z,
            0.30,
            0.30,
            0.30,
            0.35,
            spinY,
            0.35,
            PALETTE.crestSolar
          );
          pushCrestInstance(
            e.x,
            crestY,
            e.z,
            0.44,
            0.12,
            0.12,
            0.0,
            -spinY * 1.4,
            0.78,
            PALETTE.sanctuaryGold
          );
        } else if (e.mark === 'tempest') {
          // Violet-Gold Storm Octahedron
          pushCrestInstance(
            e.x,
            crestY,
            e.z,
            0.28,
            0.36,
            0.28,
            0.45 * Math.sin(elapsed * 6.0),
            spinY * 1.8,
            0.25,
            PALETTE.crestTempest
          );
        } else if (e.mark === 'eclipse') {
          // Intertwined Fire & Water Eclipse Crest (Cerulean Diamond + Vermilion-Gold Sun-Crest)
          pushCrestInstance(
            e.x,
            crestY,
            e.z,
            0.26,
            0.44,
            0.26,
            0.0,
            spinY,
            0.0,
            PALETTE.crestRime
          );
          pushCrestInstance(
            e.x,
            crestY,
            e.z,
            0.44,
            0.14,
            0.14,
            0.35,
            -spinY * 1.5,
            0.78,
            PALETTE.crestSolar
          );
        }
      }

      // Boss Bone Aegis Orbiting Shields
      if (e.isBoss && e.aegisActive && e.aegisLayers > 0) {
        const shieldTotal = e.aegisLayers * 2;
        for (let s = 0; s < shieldTotal; s++) {
          const ang = elapsed * 2.4 + (s / shieldTotal) * Math.PI * 2;
          const rOrbit = 1.45;
          const sx = e.x + Math.cos(ang) * rOrbit;
          const sz = e.z + Math.sin(ang) * rOrbit;
          const sy = e.y + 1.55 + Math.sin(elapsed * 4.0 + s) * 0.1;
          pushCrestInstance(
            sx,
            sy,
            sz,
            0.22,
            0.46,
            0.12,
            0.15,
            -ang + Math.PI * 0.5,
            0.0,
            s % 2 === 0 ? PALETTE.aegisCrimson : PALETTE.aegisGold
          );
        }
      }
    }

    crestInd.mesh.count = enemyManager ? cCount : Math.max(cCount, TETHER_BEAD_COUNT);
    crestInd.mesh.visible = cCount > 0;
    if (cCount > 0) {
      crestInd.mesh.instanceMatrix.needsUpdate = true;
      if (crestInd.mesh.instanceColor) crestInd.mesh.instanceColor.needsUpdate = true;
    }
  }

  function update(dt, { heroStates, soloWingmanActive = true, camera = null } = {}) {
    elapsed += dt;
    hudDirtyTimer += dt;

    const knight = heroStates?.Knight;
    const mage = heroStates?.Mage;

    // 1. Tick Cooldowns, Shield Timers, I-Frames, Commune Power-Up Timers & Tether Surge
    for (const h of Object.values(combatHeroes)) {
      if (h.shieldTimer > 0) {
        h.shieldTimer = Math.max(0, h.shieldTimer - dt);
        if (h.shieldTimer <= 0) h.shield = 0;
      }
      if (h.iframeTimer > 0) {
        h.iframeTimer = Math.max(0, h.iframeTimer - dt);
      }
      if (h.partnerBuffTimer > 0) {
        h.partnerBuffTimer = Math.max(0, h.partnerBuffTimer - dt);
        if (h.partnerBuffTimer <= 0) {
          if (h.id === 'Knight') h.partnerSwordMult = 1.0;
          if (h.id === 'Mage') h.partnerMagicMult = 1.0;
        }
      }
    }

    if (combatHeroes.Knight.sunSwornTimer > 0) {
      combatHeroes.Knight.sunSwornTimer = Math.max(0, combatHeroes.Knight.sunSwornTimer - dt);
      if (combatHeroes.Knight.sunSwornTimer <= 0) {
        combatHeroes.Knight.sunSwornBreathing = false;
      }
    }

    if (combatHeroes.Mage.ascendedMagicTimer > 0) {
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

    // 1B. Advance 4-Beat Couples Resonance Ultimate Choreography (`ultimateSequence`)
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
            knight.vy = 4.2;
            knight.grounded = false;
            knight.actionState = 'combo4';
            knight.actionTimer = 0.56;
            knight.char?.play?.('combo4', {
              loop: false,
              fade: 0.06,
              startTime: 0.52,
              timeScale: 1.18,
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

    // 2. Downed State & Sincere Resurrection Rules:
    //    - If BOTH heroes are downed simultaneously, after 3.5s they revive at 60% HP
    //      at the nearest Sanctuary stone.
    //    - If ONE hero is downed, they remain on the ground playing 'death' (Death_A)
    //      until their surviving partner runs within 4.8m and Communes to resurrect them!
    if (knight && mage) {
      const distKM = Math.hypot(knight.x - mage.x, knight.z - mage.z);
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

          for (const [id, ch] of Object.entries(combatHeroes)) {
            ch.downed = false;
            ch.reviveProgress = 0;
            ch.hp = Math.round(ch.maxHp * 0.6);
            ch.shield = 30;
            ch.shieldTimer = 5.0;
            const st = id === 'Knight' ? knight : mage;
            st.actionState = null;
            st.actionTimer = 0;
            st.char?.play?.('revive', { loop: false, fade: 0.1, force: true });
          }
          combatSfx?.playShieldChime?.();
          emitBanner(
            'SANCTUARY REBIRTH',
            'Both Lovers Restored to 60% HP at the Nearest Sanctuary Stone',
            'blessing'
          );
        }
      } else {
        bothDownedTimer = 0;
        for (const [id, ch] of Object.entries(combatHeroes)) {
          if (ch.downed) {
            // Pulse emerald revival ring when partner is within 4.8m to signal Commune readiness
            ch.reviveProgress =
              distKM <= COMMUNE_RESURRECT_DISTANCE
                ? 0.58 + 0.32 * Math.sin(elapsed * 4.5)
                : 0.18;
          } else {
            ch.reviveProgress = 0;
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
            ? { ...knight, downed: combatHeroes.Knight.downed, iframeTimer: combatHeroes.Knight.iframeTimer }
            : null,
          Mage: mage
            ? { ...mage, downed: combatHeroes.Mage.downed, iframeTimer: combatHeroes.Mage.iframeTimer }
            : null,
        },
        camera
      );

      // Check if current wave is cleared
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

    // 4. Smart Solo Wingman AI (auto-casts rotating spell every 4.5s + fires Starlight Bolts between casts!)
    if (
      soloWingmanActive &&
      enemyManager &&
      enemyManager.activeEnemies.length > 0 &&
      mage &&
      !combatHeroes.Mage.downed &&
      !communeChannelActive
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
          mage.actionTimer = 0.56;
          mage.char?.play?.('cast_spell', { loop: false, fade: 0.08, timeScale: 1.24, force: true });
          castSpell(nextSpellId, mage, yaw, knight);
        }
      } else if (wingmanBoltTimer <= 0) {
        wingmanBoltTimer = 1.12;
        const bIdx = wingmanBoltIdx % 3;
        wingmanBoltIdx++;
        const boltClip =
          bIdx === 0 ? 'mage_attack1' : bIdx === 1 ? 'mage_attack2' : 'mage_attack3';
        const boltStartTime = bIdx === 2 ? 0.12 : 0.04;
        const boltTimeScale = bIdx === 2 ? 1.50 : 1.45;
        const boltDuration = bIdx === 2 ? 0.52 : 0.46;

        const boltRes = performMageBoltAttack(bIdx, mage, knight);
        if (boltRes) {
          mage.actionState = boltClip;
          mage.actionTimer = boltDuration;
          mage.char?.play?.(boltClip, {
            loop: false,
            fade: 0.07,
            startTime: boltStartTime,
            timeScale: boltTimeScale,
            force: true,
          });
        }
      }
    }

    // 5. Update the 2 shared InstancedMeshes (`groundIndicatorMesh` + `crestAndTetherMesh`)
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
      withinTetherRange: dist <= POWERUP_TETHER_DISTANCE,
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
      setKnightBreathing(syncPayload.knightBreathing, 12.0);
    }
  }

  function resetCampaign() {
    combatHeroes.Knight.hp = combatHeroes.Knight.maxHp;
    combatHeroes.Knight.shield = 0;
    combatHeroes.Knight.downed = false;
    combatHeroes.Knight.reviveProgress = 0;
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
    addResonance,
    setKnightBreathing,
    startWave,
    transitionToAct,
    activatePierSanctuary,
    handlePlayerHit,
    applyCommuneVerdict,
    canCommuneTogether,
    getPartnerDistance,
    isWithinPowerupTether,
    setCommuneChannelActive,
    castSpell,
    performKnightSwing,
    performMageBoltAttack,
    performPartnerSkill,
    performCouplesUltimate,
    getStateSnapshot,
    applyRemoteStateSync,
    resetCampaign,
    setIndicatorsHiddenForShot,
    updateIndicatorsInstancedMeshes,
    update,
  };
}
