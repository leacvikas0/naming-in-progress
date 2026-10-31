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

  let actIndex = 0;
  let currentActId = ACT_SEQUENCE[0];
  let waveIndex = -1;
  let actTriggered = false;
  let heartResonance = 25;
  let elapsed = 0;
  let hudDirtyTimer = 0;
  let wingmanCastTimer = 1.6;
  let wingmanSpellIdx = 0;
  let indicatorsHiddenForShot = false;

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
      h.downed = true;
      h.reviveProgress = 0;
      if (targetHeroState?.char?.play) {
        targetHeroState.char.play('downed', { loop: false, fade: 0.1, force: true });
      }
      emitBanner(
        `${heroId.toUpperCase()} IS DOWNED!`,
        'Stand Within 3.5m for 2.0s or Clear the Wave to Revive',
        'warning'
      );
    }
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

    combatHeroes.Mage.spellCooldowns[spell.id] = spell.cd;
    addResonance(spell.resonanceGain);
    setKnightBreathing(spell.infusion, HERO_STATS.Mage.infuseDuration);

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
      if (spell.id === 'cinder_fall' || spell.id === 'storm_lance') {
        hits = enemyManager.applyAreaOrLineHit({
          origin: targetPos,
          radius: spell.chainRadius || spell.radius || 4.2,
          maxTargets: spell.chainCount ? spell.chainCount + 1 : 99,
          hitSpec: {
            source: spell.id,
            baseDmg: spell.dmg,
            applyMark: spell.mark,
            detonatesMark: Boolean(spell.detonatesMark),
            empoweredBreathing: combatHeroes.Mage.empoweredBreathing,
            attackerPos: casterPos,
          },
        });
      } else {
        hits = enemyManager.applyAreaOrLineHit({
          origin: casterPos,
          direction: { x: dirX, z: dirZ },
          range: spell.range,
          width: spell.width || 2.6,
          hitSpec: {
            source: spell.id,
            baseDmg: spell.dmg,
            applyMark: spell.mark,
            detonatesMark: Boolean(spell.detonatesMark),
            empoweredBreathing: combatHeroes.Mage.empoweredBreathing,
            attackerPos: casterPos,
          },
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
    } else if (swingType === 'charged' || swingType === 'heavy') {
      baseDmg = HERO_STATS.Knight.heavyDmg;
      range = 4.6;
    }

    if (vfxKit?.swordVfx?.triggerSwing) {
      vfxKit.swordVfx.triggerSwing(
        swingType,
        { x: knightPos.x, y: knightPos.y, z: knightPos.z },
        swingYaw,
        combatHeroes.Knight.breathingStyle
      );
    }
    if (combatSfx) {
      if (swingType === 'charged' || swingType === 'heavy') {
        combatSfx.playHeavyFinisher?.(combatHeroes.Knight.breathingStyle);
      } else {
        combatSfx.playSwordSlash?.(
          swingType === 'combo3' ? 2 : swingType === 'combo2' ? 1 : 0,
          combatHeroes.Knight.breathingStyle
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
          infusion: combatHeroes.Knight.breathingStyle,
          empoweredBreathing: combatHeroes.Knight.empoweredBreathing,
          perfectDodgeBuff: combatHeroes.Knight.perfectDodgeBuff,
          attackerPos: knightPos,
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

    setKnightBreathing('solar', HERO_STATS.Mage.infuseDuration);
    if (combatSfx?.playCouplesUltimate) {
      combatSfx.playCouplesUltimate();
    }

    const center = heroStates?.Knight || { x: 0, y: 0, z: 0 };
    if (vfxKit?.swordVfx?.triggerDetonation) {
      vfxKit.swordVfx.triggerDetonation('shatterblow', center);
      vfxKit.swordVfx.triggerDetonation('solar_flare', center);
    }

    let hits = [];
    if (enemyManager) {
      hits = enemyManager.applyAreaOrLineHit({
        origin: center,
        radius: COUPLES_ULTIMATE.radius,
        hitSpec: {
          source: 'couples_ultimate',
          baseDmg: COUPLES_ULTIMATE.dmg,
          detonatesMark: true,
          empoweredBreathing: true,
          attackerPos: center,
        },
      });
    }

    emitBanner(
      'RIME & SOLAR CATACLYSM!',
      'Couples Resonance Ultimate · Full Party Heal & Bone Aegis Shattered',
      'ultimate'
    );
    return { ultimate: true, hits };
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
    //    Downed Revival Ring, and Guiding Golden Petal Markers)
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

    // 1B. West Millpond Pier Sanctuary Brazier Ring
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

    // 1C. Downed Hero Revival Ring (radius = 3.5m)
    for (const [id, ch] of Object.entries(combatHeroes)) {
      const pos = id === 'Knight' ? knight : mage;
      if (ch.downed && pos) {
        pushGroundInstance(
          pos.x,
          walkableHeightAt(pos.x, pos.z) + 0.05,
          pos.z,
          3.5,
          elapsed * 1.6,
          0.0,
          clamp(ch.reviveProgress, 0.12, 1.0),
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
    // 2. Populate `crestAndTetherMesh` (3D Overhead Elemental Crests at
    //    y = 2.15m, Boss Bone Aegis Shields, and Waist-Height y = 0.85m
    //    Golden Soul Tether between Knight and Mage)
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
        }
      }

      // Boss Bone Aegis Orbiting Shields (at <= 50% HP)
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

    // 2B. Waist-Height (y = 0.85m) Golden Soul Tether between Knight and Mage
    if (knight && mage) {
      const distKM = Math.hypot(knight.x - mage.x, knight.z - mage.z);
      if (distKM > 0.35 && distKM < 28.0) {
        const infusionColor =
          tetherSurge.style === 'rime'
            ? PALETTE.crestRime
            : tetherSurge.style === 'solar'
              ? PALETTE.crestSolar
              : tetherSurge.style === 'tempest'
                ? PALETTE.crestTempest
                : PALETTE.tetherEmpowered;

        const baseColor =
          combatHeroes.Knight.breathingStyle !== 'none'
            ? PALETTE.tetherEmpowered
            : PALETTE.tetherIdle;

        const dx = knight.x - mage.x;
        const dz = knight.z - mage.z;
        const tetherYaw = Math.atan2(dx, dz);

        for (let b = 0; b < TETHER_BEAD_COUNT; b++) {
          const t = (b + 0.5) / TETHER_BEAD_COUNT; // 0 at Mage -> 1 at Knight
          const bx = mage.x + dx * t;
          const bz = mage.z + dz * t;
          const sag = Math.sin(t * Math.PI) * Math.min(0.28, distKM * 0.04);
          const waveY = Math.sin(elapsed * 4.5 - t * 8.0) * 0.035;
          const by =
            (mage.y ?? walkableHeightAt(mage.x, mage.z)) * (1.0 - t) +
            (knight.y ?? walkableHeightAt(knight.x, knight.z)) * t +
            0.85 -
            sag +
            waveY;

          let beadScale = combatHeroes.Knight.breathingStyle !== 'none' ? 0.075 : 0.052;
          _colorTmp.copy(baseColor);

          if (tetherSurge.active) {
            const dSurge = Math.abs(t - tetherSurge.progress);
            const surgeFactor = Math.max(0, 1.0 - dSurge * 4.2);
            beadScale += surgeFactor * 0.11;
            _colorTmp.lerp(infusionColor, surgeFactor * 0.88);
          }

          pushCrestInstance(
            bx,
            by,
            bz,
            beadScale * 0.85,
            beadScale * 0.85,
            beadScale * 1.65,
            0.0,
            tetherYaw,
            elapsed * 2.0 + b * 0.4,
            _colorTmp
          );
        }
      }
    }

    crestInd.mesh.count = cCount;
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

    // 1. Tick Cooldowns, Shield Timers, I-Frames, Breathing Timer & Tether Surge
    for (const h of Object.values(combatHeroes)) {
      if (h.shieldTimer > 0) {
        h.shieldTimer = Math.max(0, h.shieldTimer - dt);
        if (h.shieldTimer <= 0) h.shield = 0;
      }
      if (h.iframeTimer > 0) {
        h.iframeTimer = Math.max(0, h.iframeTimer - dt);
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

    // 2. Partner Proximity Revive (2.0s within 3.5m)
    if (knight && mage) {
      const distKM = Math.hypot(knight.x - mage.x, knight.z - mage.z);
      for (const [id, ch] of Object.entries(combatHeroes)) {
        const partnerCh = id === 'Knight' ? combatHeroes.Mage : combatHeroes.Knight;
        const heroState = id === 'Knight' ? knight : mage;
        if (ch.downed && !partnerCh.downed && distKM <= 3.5) {
          ch.reviveProgress = Math.min(1.0, ch.reviveProgress + dt / 2.0);
          if (ch.reviveProgress >= 1.0) {
            ch.downed = false;
            ch.reviveProgress = 0;
            ch.hp = Math.round(ch.maxHp * 0.65);
            ch.shield = 25;
            ch.shieldTimer = 5.0;
            heroState.char?.play?.('revive', { loop: false, fade: 0.1, force: true });
            combatSfx?.playShieldChime?.();
            emitBanner(`${id.toUpperCase()} REVIVED!`, 'Golden Ward Restored', 'blessing');
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

    // 4. Smart Solo Wingman AI (auto-casts rotating spell every 4.5s in combat so Knight's blade stays infused!)
    if (
      soloWingmanActive &&
      enemyManager &&
      enemyManager.activeEnemies.length > 0 &&
      mage &&
      !combatHeroes.Mage.downed
    ) {
      wingmanCastTimer -= dt;
      if (wingmanCastTimer <= 0) {
        wingmanCastTimer = 4.5;
        const nextSpellId =
          WINGMAN_SPELL_ROTATION[wingmanSpellIdx % WINGMAN_SPELL_ROTATION.length];
        wingmanSpellIdx++;
        combatHeroes.Mage.spellCooldowns[nextSpellId] = 0;
        const target = enemyManager.activeEnemies[0];
        if (target) {
          const yaw = Math.atan2(target.x - mage.x, target.z - mage.z);
          mage.yaw = yaw;
          mage.char?.play?.('cast_spell', { loop: false, fade: 0.1, force: true });
          castSpell(nextSpellId, mage, yaw, knight);
        }
      }
    }

    // 5. Update the 2 shared InstancedMeshes (`groundIndicatorMesh` + `crestAndTetherMesh`)
    updateIndicatorsInstancedMeshes(heroStates);

    if (hudDirtyTimer >= 0.12 && onHudStateChanged) {
      hudDirtyTimer = 0;
      onHudStateChanged(getStateSnapshot());
    }
  }

  function getStateSnapshot() {
    const act = ACT_DEFINITIONS[currentActId];
    const boss =
      enemyManager?.activeEnemies?.find((e) => e.isBoss && !e.dead) || null;
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
    setKnightBreathing('none', 0);

    combatHeroes.Mage.hp = combatHeroes.Mage.maxHp;
    combatHeroes.Mage.shield = 0;
    combatHeroes.Mage.downed = false;
    combatHeroes.Mage.reviveProgress = 0;
    combatHeroes.Mage.empoweredBreathing = false;
    for (const k of Object.keys(combatHeroes.Mage.spellCooldowns)) {
      combatHeroes.Mage.spellCooldowns[k] = 0;
    }

    heartResonance = 25;
    transitionToAct('act1_arena');
  }

  function setIndicatorsHiddenForShot(hidden, heroStates = null) {
    indicatorsHiddenForShot = Boolean(hidden);
    updateIndicatorsInstancedMeshes(heroStates);
  }

  return {
    indicatorGroup,
    groundIndicatorMesh: groundInd.mesh,
    crestAndTetherMesh: crestInd.mesh,
    combatHeroes,
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
    castSpell,
    performKnightSwing,
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
