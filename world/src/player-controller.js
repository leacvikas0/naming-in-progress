// ============================================================================
// world/src/player-controller.js
//
// Stage 4 & 5 / Wave 2B Live World Integration:
// - Co-Op Hero Duo (`Knight` + `Mage`) with 100% Native Skeletal Animations
//   played from `startTime: 0` with `hopVy: 0` (zero mid-air jitter, zero cut swings).
// - 1-Input Swing Buffer, Smooth Mash Speed Ramp (`1.00x -> 1.30x`), and
//   Contact-Frame Hit Detection (`contactFrac: 0.40..0.46`), with zero routine
//   camera shake on normal attacks.
// - Knight Kit: 4-hit combo, Hold Shield Block (80% DR + protects Mage), `Tab`
//   `ice`/`fire` toggle, `E` Power Sword (`13s` active / `18s` cooldown = `5s`
//   downtime), `Q` Sky-Lightning Awakening (`10s` `2.0x` damage), XP leveling.
// - Mage Kit (90 HP fragile glass cannon): 3-bolt soft-lock combo, Hold
//   stationary `Shatterlance` (max 3 consecutive before automatic fallback to
//   normal bolts), `Tab` `frost_lance`/`cinder_fall` toggle, `Hold E`/`Release E`
//   terrain-conforming Spellbook Aim Arrow (`14.5m` vs `3..16m`, `8.5s` cd),
//   and `Q` `6.0s` stationary vulnerable Storm Cataclysm.
// ============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let ToonSkin = null;

function setCharacterVerdictShaderState(charRootOrInstance, state = {}) {
  if (typeof ToonSkin?.setCharacterVerdictShaderState === 'function') {
    return ToonSkin.setCharacterVerdictShaderState(charRootOrInstance, state);
  }
  const root = charRootOrInstance?.group || charRootOrInstance?.modelRoot || charRootOrInstance;
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      const u = mat?.userData?.verdictUniforms || mat?.uniforms;
      if (!u) continue;
      if (state.groundClipY !== undefined && u.uGroundClipY) u.uGroundClipY.value = state.groundClipY;
      if (state.dissolveProgress !== undefined && u.uDissolveProgress)
        u.uDissolveProgress.value = state.dissolveProgress;
      if (state.dissolveBaseY !== undefined && u.uDissolveBaseY)
        u.uDissolveBaseY.value = state.dissolveBaseY;
      if (state.monochromeOverride !== undefined && u.uMonochromeOverride)
        u.uMonochromeOverride.value = state.monochromeOverride;
    }
  });
}
import {
  clamp,
  shortestAngleDiff,
  HERO_STATS,
  BREATHING_STYLES,
  SPELLS,
  SPELL_BY_SLOT,
  ACT_DEFINITIONS,
  ALTAR_STELE_POS,
  COMMUNE_MAX_DISTANCE,
  COMMUNE_RESURRECT_DISTANCE,
  selectSoftLockTarget,
  isSoftLockable,
  resolveShrineObstacles,
  DASH_COOLDOWN,
  DASH_IFRAMES,
  PERFECT_DODGE_ICD,
  strideTimeScale,
} from './combat/combat-balance.js';
import {
  KNIGHT_COMBO_SPECS,
  MAGE_COMBO_SPECS,
  MAGE_CHARGED_SHATTERLANCE_SPEC,
  MAGE_E_CAST_SPECS,
  MAGE_AIM_HOLD_SPEC,
  MAGE_AIM_ASSIST,
  mageAimDirectionalSpeed,
  composeMageSkillAim,
  createCombatActionAimController,
} from './combat/combat-action-aim.js';
import { SACRED_INSCRIPTION_STONES } from './net/room-progression.js';

export { KNIGHT_COMBO_SPECS, MAGE_COMBO_SPECS, MAGE_CHARGED_SHATTERLANCE_SPEC };

function createPlazaSanctuarySteleMesh(walkableHeightAt) {
  const parts = [];
  const paintPart = (geo, hexColor, isRotRing = 0.0) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const ringFlag = new Float32Array(count);
    const col = new THREE.Color(hexColor);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      ringFlag[i] = isRotRing;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aIsRing', new THREE.BufferAttribute(ringFlag, 1));
    parts.push(g);
  };

  const baseLower = new THREE.CylinderGeometry(0.96, 1.12, 0.22, 8);
  baseLower.translate(0, 0.11, 0);
  paintPart(baseLower, '#525b66', 0.0);

  const baseUpper = new THREE.CylinderGeometry(0.72, 0.86, 0.2, 8);
  baseUpper.translate(0, 0.32, 0);
  paintPart(baseUpper, '#646f7d', 0.0);

  const steleBody = new THREE.BoxGeometry(0.88, 1.78, 0.26);
  steleBody.translate(0, 1.28, 0);
  paintPart(steleBody, '#5d6875', 0.0);

  const recessedSlate = new THREE.BoxGeometry(0.66, 1.32, 0.29);
  recessedSlate.translate(0, 1.28, 0);
  paintPart(recessedSlate, '#1e2631', 0.0);

  const pediment = new THREE.BoxGeometry(1.04, 0.22, 0.34);
  pediment.translate(0, 2.24, 0);
  paintPart(pediment, '#687382', 0.0);

  const goldTrimTop = new THREE.BoxGeometry(0.92, 0.07, 0.31);
  goldTrimTop.translate(0, 2.02, 0);
  paintPart(goldTrimTop, '#f59e0b', 0.0);

  const goldTrimBot = new THREE.BoxGeometry(0.92, 0.07, 0.31);
  goldTrimBot.translate(0, 0.54, 0);
  paintPart(goldTrimBot, '#f59e0b', 0.0);

  const wisteriaLeft = new THREE.DodecahedronGeometry(0.22, 0);
  wisteriaLeft.scale(0.85, 1.35, 0.85);
  wisteriaLeft.translate(-0.42, 1.98, 0.12);
  paintPart(wisteriaLeft, '#c084fc', 0.0);

  const wisteriaRight = new THREE.DodecahedronGeometry(0.22, 0);
  wisteriaRight.scale(0.85, 1.35, 0.85);
  wisteriaRight.translate(0.42, 1.98, 0.12);
  paintPart(wisteriaRight, '#c084fc', 0.0);

  const crownStar = new THREE.OctahedronGeometry(0.18, 0);
  crownStar.scale(0.9, 1.45, 0.9);
  crownStar.translate(0, 2.58, 0);
  paintPart(crownStar, '#fde047', 1.0);

  const groundRingOuter = new THREE.RingGeometry(1.26, 1.42, 24);
  groundRingOuter.rotateX(-Math.PI * 0.5);
  groundRingOuter.translate(0, 0.035, 0);
  paintPart(groundRingOuter, '#fbbf24', 1.0);

  const groundRingInner = new THREE.RingGeometry(0.98, 1.08, 16);
  groundRingInner.rotateX(-Math.PI * 0.5);
  groundRingInner.translate(0, 0.038, 0);
  paintPart(groundRingInner, '#fde047', 1.0);

  const mergedGeo = mergeGeometries(parts, false);
  mergedGeo.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    name: 'SanctuaryAltarSteleCelMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uInkColor: { value: new THREE.Color('#18131a') },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float aIsRing;
      uniform float uTime;
      varying vec3 vColor;
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;
      varying float vIsRing;

      void main() {
        vColor = color;
        vIsRing = aIsRing;
        vec3 pos = position;
        vec3 nrm = normal;
        if (aIsRing > 0.5) {
          float ang = uTime * 0.85;
          float c = cos(ang);
          float s = sin(ang);
          pos.xz = mat2(c, -s, s, c) * pos.xz;
          nrm.xz = mat2(c, -s, s, c) * nrm.xz;
          if (pos.y > 1.5) {
            pos.y += sin(uTime * 2.6) * 0.06;
          }
        }
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * nrm);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uInkColor;
      varying vec3 vColor;
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;
      varying float vIsRing;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(vViewDir);
        float ndotl = dot(N, uSunDir) * 0.5 + 0.5;
        float ndotv = abs(dot(N, V));
        float cel = step(0.38, ndotl) * 0.32 + step(0.72, ndotl) * 0.36 + 0.52;
        vec3 shaded = vColor * mix(cel, 1.18, vIsRing);
        float inkRim = (1.0 - step(0.18, ndotv)) * (1.0 - vIsRing * 0.65);
        gl_FragColor = vec4(mix(shaded, uInkColor, inkRim * 0.85), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(mergedGeo, mat);
  mesh.name = 'plazaSanctuaryAltarSteleMesh';
  mesh.userData.isVfx = true;
  const sy = walkableHeightAt(ALTAR_STELE_POS.x, ALTAR_STELE_POS.z);
  mesh.position.set(ALTAR_STELE_POS.x, sy, ALTAR_STELE_POS.z);
  mesh.rotation.y = 0.18;
  return mesh;
}

function enableCharacterFrustumCulling(charInstance, sphereRadius = 3.2) {
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

export const SHOT_CHARACTER_POSES = {
  'day-plaza': {
    knight: { x: 0.85, z: 11.5, rotY: 0.38, clip: 'Idle_Combat', time: 0.35 },
    mage: { x: 3.15, z: 11.6, rotY: -0.35, clip: 'cast_spell', time: 0.52 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'day-mill-pier': {
    knight: { x: -38.4, z: 9.0, rotY: -2.25, clip: 'Idle_Combat', time: 0.35 },
    mage: { x: -36.3, z: 8.0, rotY: -1.95, clip: 'cheer', time: 0.52 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'day-arena-wisteria': {
    knight: { x: 50.5, z: -5.8, rotY: 1.55, clip: 'combo1', time: 0.36 },
    mage: { x: 48.2, z: -0.2, rotY: 1.85, clip: 'cast_shoot', time: 0.34 },
    skeletonWarrior: { x: 56.5, z: -8.2, rotY: -1.35, clip: 'combo2', time: 0.38 },
    skeletonMage: { x: 60.5, z: 0.8, rotY: -1.55, clip: 'cast_shoot', time: 0.35 },
  },
  'day-shrine-arch': {
    knight: { x: -1.05, z: -76.2, rotY: 2.88, clip: 'pray_channel', time: 0.52 },
    mage: { x: 1.25, z: -76.0, rotY: -2.82, clip: 'cast_spell', time: 0.52 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'evening-sunset-vista': {
    knight: { x: -0.9, z: -36.5, rotY: -0.15, clip: 'cheer', time: 0.55 },
    mage: { x: 1.1, z: -36.5, rotY: -0.25, clip: 'wave', time: 0.45 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'night-moon-shrine': {
    knight: { x: -1.05, z: -76.2, rotY: 2.85, clip: 'pray_channel', time: 0.55 },
    mage: { x: 1.25, z: -76.0, rotY: -2.78, clip: 'burst_aoe', time: 0.62 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'night-plaza-lanterns': {
    knight: { x: 1.05, z: 8.5, rotY: 0.42, clip: 'Idle_Combat', time: 0.35 },
    mage: { x: 3.35, z: 8.9, rotY: -0.38, clip: 'cast_spell', time: 0.52 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'aerial-masterplan': {
    knight: { x: 0.0, z: 14.0, rotY: Math.PI, clip: 'idle', time: 0.35 },
    mage: { x: 2.0, z: 14.0, rotY: Math.PI, clip: 'idle', time: 0.35 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'day-flower-lobby': {
    knight: { x: -1.15, z: 128.0, rotY: Math.PI + 0.15, clip: 'wave', time: 0.45 },
    mage: { x: 1.15, z: 128.0, rotY: Math.PI - 0.15, clip: 'cheer', time: 0.52 },
    skeletonWarrior: { x: -13.5, z: 86.0, rotY: 0.25, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 15.8, z: 52.0, rotY: -0.35, clip: 'Idle_Combat', time: 0.60 },
  },
  'day-south-road-boulders': {
    knight: { x: -5.2, z: 62.5, rotY: Math.PI + 0.25, clip: 'combo1', time: 0.32 },
    mage: { x: -2.8, z: 64.0, rotY: Math.PI + 0.15, clip: 'cast_shoot', time: 0.38 },
    skeletonWarrior: { x: 14.5, z: 52.0, rotY: -1.15, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 17.2, z: 50.5, rotY: -1.25, clip: 'Idle_Combat', time: 0.60 },
  },
  'day-sacred-stone-roses': {
    knight: { x: -1.95, z: -12.2, rotY: 2.35, clip: 'Idle_Combat', time: 0.35 },
    mage: { x: 2.15, z: -12.6, rotY: -2.15, clip: 'pray_channel', time: 0.48 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
  'evening-flower-lobby': {
    knight: { x: -1.15, z: 128.0, rotY: Math.PI + 0.15, clip: 'wave', time: 0.45 },
    mage: { x: 1.15, z: 128.0, rotY: Math.PI - 0.15, clip: 'cheer', time: 0.52 },
    skeletonWarrior: { x: -13.5, z: 86.0, rotY: 0.25, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 15.8, z: 52.0, rotY: -0.35, clip: 'Idle_Combat', time: 0.60 },
  },
  'night-flower-lobby': {
    knight: { x: -1.15, z: 128.0, rotY: Math.PI + 0.15, clip: 'wave', time: 0.45 },
    mage: { x: 1.15, z: 128.0, rotY: Math.PI - 0.15, clip: 'cheer', time: 0.52 },
    skeletonWarrior: { x: -13.5, z: 86.0, rotY: 0.25, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 15.8, z: 52.0, rotY: -0.35, clip: 'Idle_Combat', time: 0.60 },
  },
  'evening-plaza': {
    knight: { x: 0.85, z: 11.5, rotY: 0.42, clip: 'Idle_Combat', time: 0.35 },
    mage: { x: 3.15, z: 11.9, rotY: -0.38, clip: 'cast_spell', time: 0.52 },
    skeletonWarrior: { x: 56.2, z: -4.6, rotY: -1.45, clip: 'Idle_Combat', time: 0.40 },
    skeletonMage: { x: 58.4, z: -1.2, rotY: -1.45, clip: 'Idle_Combat', time: 0.60 },
  },
};

export const STAGE5_GAMEPLAY_SHOTS = {
  '01-desktop-act1-sunfire-slash': {
    id: '01-desktop-act1-sunfire-slash',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'day',
    pos: [72.6, 3.15, 3.15],
    target: [73.4, 1.45, -3.75],
    fov: 45,
    actId: 'act1_arena',
    actStageTag: 'Act I',
    objectiveText: 'East Wisteria Clearing — Wave 1/2 · Wisteria Scouts',
    knight: { x: 72.65, z: -3.80, rotY: Math.PI * 0.5, clip: 'combo3', time: 0.36, hp: 208, shield: 0 },
    mage: { x: 70.35, z: -2.65, rotY: 1.42, clip: 'cast_spell', time: 0.48, hp: 90, shield: 0 },
    breathingStyle: 'solar',
    breathingTimer: 11.4,
    heartResonance: 64,
    activeSpellSlot: 3,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 4.8, storm_lance: 0 },
    banner: {
      title: 'HINOKAMI SUNFIRE · BLADE IGNITED',
      subtitle: 'Strike Sunbranded Enemies with 3rd Hit for Solar Flare!',
    },
    enemies: [
      { slotIndex: 0, archetype: 'warrior', x: 75.10, z: -3.80, rotY: -1.35, clip: 'hit_A', time: 0.18, mark: 'solar' },
      {
        slotIndex: 2,
        archetype: 'minion',
        x: 76.3,
        z: -1.75,
        rotY: -1.65,
        clip: 'combo1',
        time: 0.28,
        mark: 'solar',
        aiState: 'windup',
        telegraphProgress: 0.66,
        telegraphRadius: 1.7,
      },
      { slotIndex: 1, archetype: 'warrior', x: 77.2, z: -5.65, rotY: -1.25, clip: 'Idle_Combat', time: 0.42, mark: 'solar' },
    ],
    vfx: {
      system: 'swordVfx',
      time: 0.15,
      swordPose: {
        infusion: 'solar',
        swing: {
          type: 'combo2',
          style: 'solar',
          origin: [72.85, 0, -3.80],
          yaw: Math.PI * 0.5,
          age: 0.15,
        },
        detonation: null,
      },
    },
  },

  '02-desktop-shatterlance-railgun': {
    id: '02-desktop-shatterlance-railgun',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'day',
    pos: [65.8, 3.05, 2.55],
    target: [64.8, 1.70, -4.0],
    fov: 46,
    actId: 'act1_arena',
    actStageTag: 'Act I',
    objectiveText: 'East Wisteria Clearing — Wave 2/2 · Wisteria Warband',
    knight: { x: 64.2, z: -5.95, rotY: 1.48, clip: 'combo1', time: 0.35, hp: 196, shield: 20 },
    mage: { x: 59.8, z: -4.0, rotY: Math.PI * 0.5, clip: 'cast_spell', time: 0.38, hp: 90, shield: 20 },
    breathingStyle: 'rime',
    breathingTimer: 12.0,
    heartResonance: 78,
    activeSpellSlot: 2,
    spellCooldowns: { frost_lance: 1.8, shatterlance: 5.6, cinder_fall: 0, storm_lance: 0 },
    banner: {
      title: 'II · SHATTERLANCE RAILGUN SPEAR',
      subtitle: '7-Fluted Glacial Great-Lance Converging · Detonates Rime Marks!',
    },
    enemies: [
      { slotIndex: 0, archetype: 'warrior', x: 69.2, z: -3.85, rotY: -1.45, clip: 'Idle_Combat', time: 0.40, mark: 'rime' },
      { slotIndex: 4, archetype: 'mage', x: 71.2, z: -5.35, rotY: -1.35, clip: 'cast_shoot', time: 0.34, mark: 'rime' },
      { slotIndex: 3, archetype: 'rogue', x: 68.4, z: -2.10, rotY: -1.68, clip: 'Idle_Combat', time: 0.45, mark: 'rime' },
    ],
    vfx: {
      system: 'shatterlance',
      origin: [60.8, 0, -4.0],
      dir: [1, 0, 0],
      range: 14.5,
      time: 0.46,
    },
  },

  '03-desktop-cinder-fall-meteor': {
    id: '03-desktop-cinder-fall-meteor',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'day',
    pos: [70.6, 4.05, 5.15],
    target: [74.0, 1.75, -3.95],
    fov: 47,
    actId: 'act1_arena',
    actStageTag: 'Act I',
    objectiveText: 'East Wisteria Clearing — Wave 2/2 · Wisteria Warband',
    knight: { x: 70.4, z: -2.15, rotY: 1.48, clip: 'cheer', time: 0.42, hp: 210, shield: 0 },
    mage: { x: 68.2, z: -1.65, rotY: 1.42, clip: 'cast_spell', time: 0.54, hp: 90, shield: 0 },
    breathingStyle: 'solar',
    breathingTimer: 11.8,
    heartResonance: 86,
    activeSpellSlot: 3,
    spellCooldowns: { frost_lance: 0, shatterlance: 2.4, cinder_fall: 6.4, storm_lance: 0 },
    banner: {
      title: 'III · CINDER FALL VOLCANIC ASTEROID',
      subtitle: 'Tectonic Magma Crater Eruption · Sunbrands Pack & Ignites Hinokami Blade',
    },
    enemies: [
      { slotIndex: 0, archetype: 'warrior', x: 75.10, z: -3.80, rotY: -1.25, clip: 'hit_A', time: 0.28, dy: 0.30, mark: 'solar' },
      { slotIndex: 4, archetype: 'mage', x: 77.2, z: -5.65, rotY: -1.35, clip: 'hit_B', time: 0.24, dy: 0.14, mark: 'solar' },
      { slotIndex: 3, archetype: 'rogue', x: 73.8, z: -1.45, rotY: -1.65, clip: 'hit_A', time: 0.22, mark: 'solar' },
    ],
    vfx: {
      system: 'cinderFall',
      origin: [60.8, 0, -4.0],
      dir: [1, 0, 0],
      range: 14.0,
      time: 0.76,
    },
  },

  '04-desktop-storm-lance-fulgurite': {
    id: '04-desktop-storm-lance-fulgurite',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'day',
    pos: [66.6, 4.35, 9.15],
    target: [67.8, 1.65, -4.0],
    fov: 50,
    actId: 'act1_arena',
    actStageTag: 'Act I',
    objectiveText: 'East Wisteria Clearing — Wave 2/2 · Wisteria Warband',
    knight: { x: 63.8, z: -1.75, rotY: 1.48, clip: 'combo1', time: 0.36, hp: 220, shield: 35 },
    mage: { x: 59.8, z: -4.0, rotY: Math.PI * 0.5, clip: 'cast_shoot', time: 0.36, hp: 90, shield: 35 },
    breathingStyle: 'tempest',
    breathingTimer: 11.6,
    heartResonance: 92,
    activeSpellSlot: 4,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 1.9, storm_lance: 5.1 },
    banner: {
      title: 'IV · STORM LANCE · CHAIN FULGURITE',
      subtitle: 'Braided Lightning Spear + 3-Target Chain Arcs + Obsidian Fulgurite Monoliths',
    },
    enemies: [
      { slotIndex: 0, archetype: 'warrior', x: 75.10, z: -3.80, rotY: -1.25, clip: 'hit_A', time: 0.22, mark: 'tempest' },
      { slotIndex: 4, archetype: 'mage', x: 77.2, z: -5.65, rotY: -1.35, clip: 'hit_B', time: 0.20, mark: 'tempest' },
      { slotIndex: 2, archetype: 'minion', x: 76.5, z: -1.65, rotY: -1.65, clip: 'hit_A', time: 0.24, mark: 'tempest' },
    ],
    vfx: {
      system: 'stormLance',
      origin: [60.8, 0, -4.0],
      dir: [1, 0, 0],
      range: 14.5,
      time: 0.34,
    },
  },

  '05-tablet-pad7-touch-combat': {
    id: '05-tablet-pad7-touch-combat',
    profile: 'tablet',
    viewport: { width: 1440, height: 960 },
    tod: 'day',
    pos: [72.6, 3.25, 2.95],
    target: [73.8, 1.65, -3.75],
    fov: 45,
    actId: 'act1_arena',
    actStageTag: 'Act I · Pad 7',
    objectiveText: 'Xiaomi Pad 7 (3:2) Split Touch · Glacial Shatterblow Detonation',
    knight: { x: 72.75, z: -3.80, rotY: Math.PI * 0.5, clip: 'combo3', time: 0.38, hp: 220, shield: 35 },
    mage: { x: 70.45, z: -2.65, rotY: 1.42, clip: 'cheer', time: 0.45, hp: 90, shield: 35 },
    breathingStyle: 'rime',
    breathingTimer: 10.5,
    heartResonance: 100,
    activeSpellSlot: 1,
    spellCooldowns: { frost_lance: 2.2, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    touchDemo: { joyX: 0.62, joyY: 0.68, sprinting: true, activeAction: 'attack' },
    banner: {
      title: 'SHATTERBLOW! · GLACIAL TIDE DETONATION',
      subtitle: '+65 AoE Cryo Shrapnel Burst · +18% Heart Resonance · Cataclysm Ready!',
    },
    enemies: [
      { slotIndex: 0, archetype: 'warrior', x: 75.10, z: -3.80, rotY: -1.25, clip: 'hit_A', time: 0.28, mark: 'rime' },
      { slotIndex: 4, archetype: 'mage', x: 77.2, z: -5.65, rotY: -1.35, clip: 'hit_B', time: 0.24, mark: 'rime' },
    ],
    vfx: {
      system: 'swordVfx',
      time: 0.22,
      swordPose: {
        infusion: 'rime',
        swing: {
          type: 'combo3',
          style: 'rime',
          origin: [72.75, 0, -3.80],
          yaw: Math.PI * 0.5,
          age: 0.20,
        },
        detonation: {
          type: 'shatterblow',
          pos: [75.10, 0, -3.80],
          age: 0.22,
        },
      },
    },
  },

  '06-sunset-pier-sanctuary-interlude': {
    id: '06-sunset-pier-sanctuary-interlude',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'evening',
    pos: [-31.4, 3.85, 14.8],
    target: [-42.2, 1.35, 6.2],
    fov: 48,
    actId: 'interlude_pier',
    actStageTag: 'Interlude',
    objectiveText: 'West Millpond Pier Sanctuary — Empowered Breathing Unlocked',
    knight: { x: -38.8, z: 9.2, rotY: -0.65, clip: 'cheer', time: 0.52, hp: 220, shield: 35 },
    mage: { x: -36.4, z: 8.1, rotY: -1.25, clip: 'wave', time: 0.48, hp: 90, shield: 35 },
    breathingStyle: 'solar',
    breathingTimer: 12.0,
    heartResonance: 85,
    activeSpellSlot: null,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    banner: {
      title: 'SANCTUARY BRAZIER KINDLED',
      subtitle: 'Full Party Heal · +35 Golden Ward Shield · Empowered Breathing (+25% DMG)',
    },
    enemies: [],
    vfx: null,
  },

  '07-dusk-hamlet-plaza-defense': {
    id: '07-dusk-hamlet-plaza-defense',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'evening',
    pos: [4.8, 4.55, 16.2],
    target: [-0.8, 1.55, -1.8],
    fov: 50,
    actId: 'act2_plaza',
    actStageTag: 'Act II',
    objectiveText: 'Twilight Hamlet Well Plaza — Wave 1/1 · Twilight Vanguard',
    knight: { x: -1.35, z: 6.8, rotY: Math.PI + 0.12, clip: 'combo2', time: 0.34, hp: 204, shield: 35 },
    mage: { x: 2.35, z: 6.9, rotY: Math.PI - 0.25, clip: 'cast_spell', time: 0.46, hp: 90, shield: 35 },
    breathingStyle: 'solar',
    breathingTimer: 10.2,
    heartResonance: 90,
    activeSpellSlot: 1,
    spellCooldowns: { frost_lance: 3.2, shatterlance: 0, cinder_fall: 1.5, storm_lance: 0 },
    banner: {
      title: 'ACT II · TWILIGHT HAMLET DEFENSE',
      subtitle: '3-Token Attacker AI · Defend the Well Plaza',
    },
    enemies: [
      {
        slotIndex: 0,
        archetype: 'captain',
        scale: 1.18,
        x: -0.4,
        z: 3.4,
        rotY: 0.08,
        clip: 'combo1',
        time: 0.36,
        mark: 'solar',
        aiState: 'windup',
        telegraphProgress: 0.72,
        telegraphRadius: 2.4,
        telegraphX: -0.6,
        telegraphZ: 5.5,
      },
      {
        slotIndex: 1,
        archetype: 'warrior',
        x: -4.2,
        z: 4.2,
        rotY: 0.42,
        clip: 'combo2',
        time: 0.32,
        mark: 'rime',
        aiState: 'windup',
        telegraphProgress: 0.56,
        telegraphRadius: 1.85,
        telegraphX: -3.1,
        telegraphZ: 5.8,
      },
      { slotIndex: 2, archetype: 'warrior', x: 3.8, z: 3.9, rotY: -0.38, clip: 'Idle_Combat', time: 0.40, mark: 'tempest' },
      { slotIndex: 4, archetype: 'mage', x: 1.2, z: -6.5, rotY: 0.05, clip: 'cast_shoot', time: 0.38, mark: 'solar' },
    ],
    vfx: {
      system: 'swordVfx',
      time: 0.14,
      swordPose: {
        infusion: 'solar',
        swing: {
          type: 'combo2',
          style: 'solar',
          origin: [-1.35, 0, 6.8],
          yaw: Math.PI + 0.12,
          age: 0.14,
        },
        detonation: null,
      },
    },
  },

  '08-night-shrine-hollow-sovereign-boss': {
    id: '08-night-shrine-hollow-sovereign-boss',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'night',
    pos: [2.8, 11.3, -74.2],
    target: [-0.2, 9.5, -88.2],
    fov: 50,
    actId: 'act3_shrine',
    actStageTag: 'Act III · Boss',
    objectiveText: 'Starlit North Shrine Overlook — The Hollow Sovereign',
    knight: { x: -2.25, z: -83.0, rotY: Math.PI - 0.35, clip: 'charged', time: 0.42, hp: 220, shield: 50 },
    mage: { x: 2.95, z: -82.8, rotY: Math.PI + 0.42, clip: 'burst_aoe', time: 0.52, hp: 90, shield: 50 },
    breathingStyle: 'solar',
    breathingTimer: 12.0,
    heartResonance: 100,
    activeSpellSlot: 3,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    bossHud: {
      name: 'The Hollow Sovereign',
      hp: 680,
      maxHp: 1400,
      aegisActive: true,
      aegisLayers: 2,
    },
    banner: {
      title: 'RIME & SOLAR CATACLYSM! · BONE AEGIS SHATTERED',
      subtitle: 'Couples Resonance Ultimate Unleashed Against The Hollow Sovereign',
    },
    enemies: [
      {
        slotIndex: 5,
        isBoss: true,
        archetype: 'boss_sovereign',
        x: 0.0,
        z: -87.2,
        rotY: 0.0,
        clip: 'charged',
        time: 0.38,
        hp: 680,
        maxHp: 1400,
        aegisActive: true,
        aegisLayers: 2,
        mark: 'solar',
        aiState: 'windup',
        telegraphProgress: 0.78,
        telegraphRadius: 3.2,
        telegraphX: 0.0,
        telegraphZ: -84.6,
      },
      { slotIndex: 0, archetype: 'royal_guard', scale: 1.08, x: -4.5, z: -85.2, rotY: 0.42, clip: 'hit_A', time: 0.24, mark: 'rime' },
      { slotIndex: 1, archetype: 'royal_guard', scale: 1.08, x: 4.5, z: -85.2, rotY: -0.42, clip: 'hit_B', time: 0.24, mark: 'tempest' },
    ],
    vfx: {
      system: 'swordVfx',
      time: 0.20,
      swordPose: {
        infusion: 'solar',
        swing: {
          type: 'charged',
          style: 'solar',
          origin: [-2.25, 0, -83.0],
          yaw: Math.PI - 0.35,
          age: 0.18,
        },
        detonation: {
          type: 'solar_flare',
          pos: [0.0, 0, -85.2],
          age: 0.20,
        },
      },
    },
  },

  '09-divine-prayer-eclipse-throw': {
    id: '09-divine-prayer-eclipse-throw',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'day',
    pos: [43.2, 4.15, 6.2],
    target: [66.5, 4.95, -3.8],
    fov: 50,
    actId: 'act1_arena',
    actStageTag: 'Phase 1 · Prayer',
    objectiveText: 'Court of Dark Flowers — 4.0m Circle Prayer & 6.5m Airborne Enemy Throw',
    knight: { x: 51.2, z: -3.4, rotY: 0.92, clip: 'pray_channel', time: 0.18, hp: 68, shield: 0 },
    mage: { x: 52.6, z: -1.0, rotY: 1.05, clip: 'cast_spell', time: 0.22, hp: 26, shield: 0 },
    breathingStyle: 'none',
    breathingTimer: 0,
    heartResonance: 75,
    activeSpellSlot: null,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    eclipseState: { weight: 1.0, compression: 1.0, windTimeScale: 0.35 },
    smiteMonochrome: 0.0,
    banner: {
      title: 'COURT OF BLOODY DARK FLOWERS · SPEAK YOUR VOW',
      subtitle: 'Enemies Launched Off Their Feet (0.15x Slow-Mo) · Wind Slowed to 0.35x',
    },
    enemies: [
      {
        slotIndex: 0,
        archetype: 'warrior',
        x: 58.6,
        z: -6.8,
        dy: 3.35,
        rotY: -1.35,
        rotX: -0.78,
        rotZ: 0.46,
        clip: 'hit_B',
        time: 0.34,
        mixerTimeScale: 0.15,
      },
      {
        slotIndex: 1,
        archetype: 'warrior',
        x: 63.8,
        z: 1.4,
        dy: 3.55,
        rotY: -1.75,
        rotX: -0.74,
        rotZ: -0.48,
        clip: 'hit_B',
        time: 0.38,
        mixerTimeScale: 0.15,
      },
    ],
    vfx: {
      system: 'artoriousVfx',
      mode: 'channel',
      origin: [51.2, 0, -3.4],
      partnerPos: [52.6, 0, -1.0],
      time: 1.25,
    },
  },

  '10-divine-briar-jail-lattice': {
    id: '10-divine-briar-jail-lattice',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'day',
    pos: [0.3, 2.35, 16.4],
    target: [0.0, 2.75, -14.0],
    fov: 50,
    actId: 'act2_plaza',
    actStageTag: 'Phase 2A · Beat 1',
    objectiveText: 'Iris Manor Briar Sanctuary — Wide Asymmetric Multi-Gauge Root & Wild-Rose Net (1.98s)',
    knight: { x: -0.82, z: 9.2, rotY: 0.25, clip: 'pray_channel', time: 0.48, hp: 72, shield: 0 },
    mage: { x: 0.82, z: 9.2, rotY: -0.28, clip: 'cast_spell', time: 0.48, hp: 28, shield: 0 },
    breathingStyle: 'eclipse',
    breathingTimer: 30.0,
    heartResonance: 100,
    activeSpellSlot: null,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    eclipseState: { weight: 1.0, compression: 1.0, windTimeScale: 0.35 },
    smiteMonochrome: 0.0,
    banner: {
      title: 'DIVINE BLESSING · BRIAR ROSE SANCTUARY',
      subtitle: '36 Asymmetric Brown-Root & Wild-Rose Briar Vines Weave a Wide Net Around Both Lovers',
    },
    enemies: [],
    vfx: {
      system: 'artoriousVfx',
      mode: 'blessing',
      origin: [-0.82, 0, 9.2],
      partnerPos: [0.82, 0, 9.2],
      time: 1.98,
    },
  },

  '10a-divine-briar-net-creeping': {
    id: '10a-divine-briar-net-creeping',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'day',
    pos: [0.3, 2.35, 16.4],
    target: [0.0, 2.75, -14.0],
    fov: 50,
    actId: 'act2_plaza',
    actStageTag: 'Phase 2A · Beat 1A',
    objectiveText: 'Iris Manor Briar Sanctuary — Slow Staggered Root Creep & Net Weaving (0.96s)',
    knight: { x: -0.82, z: 9.2, rotY: 0.25, clip: 'pray_channel', time: 0.48, hp: 72, shield: 0 },
    mage: { x: 0.82, z: 9.2, rotY: -0.28, clip: 'cast_spell', time: 0.48, hp: 28, shield: 0 },
    breathingStyle: 'eclipse',
    breathingTimer: 30.0,
    heartResonance: 100,
    activeSpellSlot: null,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    eclipseState: { weight: 1.0, compression: 1.0, windTimeScale: 0.35 },
    smiteMonochrome: 0.0,
    banner: {
      title: 'DIVINE BLESSING · ROOTS CREEPING & LACING',
      subtitle: 'Thick Gnarled Brown Roots & Thin Tendrils Climb Asymmetrically Before Whipping Shut',
    },
    enemies: [],
    vfx: {
      system: 'artoriousVfx',
      mode: 'blessing',
      origin: [-0.82, 0, 9.2],
      partnerPos: [0.82, 0, 9.2],
      time: 0.96,
    },
  },

  '11-divine-underground-flower-slump': {
    id: '11-divine-underground-flower-slump',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'day',
    pos: [0.3, 2.25, 16.0],
    target: [0.0, 1.95, -14.0],
    fov: 50,
    actId: 'act2_plaza',
    actStageTag: 'Phase 2A · Beat 3',
    objectiveText: 'Underground Resurrection (2.65s..4.25s) — Quiet Crimson Flower Slump & Smooth HP Fill',
    knight: { x: -0.82, z: 9.2, rotY: 0.25, clip: 'pray_channel', time: 0.48, hp: 156, shield: 0, undergroundHidden: true },
    mage: { x: 0.82, z: 9.2, rotY: -0.28, clip: 'cast_spell', time: 0.48, hp: 58, shield: 0, undergroundHidden: true },
    breathingStyle: 'eclipse',
    breathingTimer: 30.0,
    heartResonance: 100,
    activeSpellSlot: null,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    eclipseState: { weight: 1.0, compression: 1.0, windTimeScale: 0.35 },
    smiteMonochrome: 0.0,
    banner: {
      title: 'DIVINE RESURRECTION · UNDERGROUND FLOWER SLUMP',
      subtitle: 'Kept Underground 1.6s Beneath Fallen Crimson Roses While HP Fills Smoothly to 100%',
    },
    enemies: [],
    vfx: {
      system: 'artoriousVfx',
      mode: 'blessing',
      origin: [-0.82, 0, 9.2],
      partnerPos: [0.82, 0, 9.2],
      time: 3.45,
    },
  },

  '12-divine-smite-bw-petal-dissolve': {
    id: '12-divine-smite-bw-petal-dissolve',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'day',
    pos: [0.3, 2.35, 16.0],
    target: [0.0, 2.85, -14.0],
    fov: 50,
    actId: 'act2_plaza',
    actStageTag: 'Phase 2C · Smite',
    objectiveText: 'Divine Smite (0.0x Dead Wind) — Stark B&W World & Selective Blood-Crimson Petal Dissolve',
    knight: { x: -0.85, z: 9.2, rotY: 0.25, clip: 'hit_B', time: 0.42, hp: 0, shield: 0, dissolveProgress: 0.78 },
    mage: { x: 0.78, z: 9.3, rotY: -0.45, clip: 'downed', time: 0.26, hp: 9, shield: 0, monochromeOverride: 1.0 },
    breathingStyle: 'none',
    breathingTimer: 0,
    heartResonance: 0,
    activeSpellSlot: null,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    eclipseState: { weight: 1.0, compression: 1.0, windTimeScale: 0.0 },
    smiteMonochrome: 1.0,
    banner: {
      title: 'DIVINE SMITE · BELOVED DISSOLVED INTO CRIMSON PETALS',
      subtitle: 'All Valley Wind Frozen Dead (0.0x) · Partner Dissolves (0 HP) · Speaker Reduced to 10% HP',
    },
    enemies: [],
    vfx: {
      system: 'artoriousVfx',
      mode: 'smite',
      origin: [-0.85, 0, 9.2],
      partnerPos: [0.78, 0, 9.3],
      time: 1.40,
    },
  },

  '12a-divine-smite-dying-mid-dissolve': {
    id: '12a-divine-smite-dying-mid-dissolve',
    profile: 'desktop',
    viewport: { width: 1600, height: 900 },
    tod: 'day',
    pos: [0.3, 2.35, 16.0],
    target: [0.0, 2.85, -14.0],
    fov: 50,
    actId: 'act2_plaza',
    actStageTag: 'Phase 2C · Smite Dying',
    objectiveText: 'Divine Smite Dying Mid-Dissolve — Partner Collapsing & Eroding Into Crimson Petals',
    knight: { x: -0.85, z: 9.2, rotY: 0.25, clip: 'death', time: 0.34, hp: 0, shield: 0, dissolveProgress: 0.38 },
    mage: { x: 0.78, z: 9.3, rotY: -0.45, clip: 'downed', time: 0.26, hp: 9, shield: 0, monochromeOverride: 1.0 },
    breathingStyle: 'none',
    breathingTimer: 0,
    heartResonance: 0,
    activeSpellSlot: null,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    eclipseState: { weight: 1.0, compression: 1.0, windTimeScale: 0.0 },
    smiteMonochrome: 1.0,
    banner: {
      title: 'DIVINE SMITE · BELOVED DYING & ERODING INTO PETALS',
      subtitle: 'Stark B&W World · Dying Partner Eroding Top-Down Into 240 Blood-Crimson Rose Petals',
    },
    enemies: [],
    vfx: {
      system: 'artoriousVfx',
      mode: 'smite',
      origin: [-0.85, 0, 9.2],
      partnerPos: [0.78, 0, 9.3],
      time: 0.88,
    },
  },
};

export async function createCoopPlayerSystem({
  scene,
  walkableHeightAt,
  resolveCollisions,
  arenaZone = { x: 68, z: -4, y: 0.6 },
  initialPos = { x: 2.8, z: 14.5, yaw: Math.PI + 0.15 },
  initialProfile = 'desktop',
  onHeroSwapped = null,
  onSkyTodChanged = null,
  onHudStateChanged = null,
  onBanner = null,
  onCoopStateChanged = null,
  onRemoteCommuneVerdict = null,
  yieldFrame = null,
  sliceBudgetMs = 3.2,
} = {}) {
  const yieldSlice =
    typeof window !== 'undefined' && typeof setTimeout === 'function'
      ? typeof yieldFrame === 'function'
        ? yieldFrame
        : () => new Promise((r) => setTimeout(r, 0))
      : async () => {};

  const [{ createCharactersKit }, toonSkinMod] = await Promise.all([
    import('../assets/characters/index.js'),
    import('../assets/characters/toon-skin.js'),
  ]);
  ToonSkin = toonSkinMod;
  await yieldSlice();

  const kit = createCharactersKit({ yieldFrame, sliceBudgetMs });
  // Load Rig_Medium animation packs cleanly across slices before instantiating heroes sequentially
  await kit.loadAnimationPacks('medium', { yieldFrame, sliceBudgetMs });
  await yieldSlice();

  const rootGroup = new THREE.Group();
  rootGroup.name = 'stage3CoopCharactersRoot';
  scene.add(rootGroup);

  const heroesGroup = new THREE.Group();
  heroesGroup.name = 'coopHeroesDuoGroup';
  rootGroup.add(heroesGroup);

  const sanctuarySteleMesh = createPlazaSanctuarySteleMesh(walkableHeightAt);
  sanctuarySteleMesh.visible = false;
  rootGroup.add(sanctuarySteleMesh);

  // 1. Instantiate the 2 Co-Op Heroes (Knight + Mage) sequentially with slice yields
  const knightChar = await kit.createCharacter('Knight', {
    initialClip: 'idle',
    position: [initialPos.x, walkableHeightAt(initialPos.x, initialPos.z), initialPos.z],
    rotY: initialPos.yaw,
  });
  await yieldSlice();
  const mageChar = await kit.createCharacter('Mage', {
    initialClip: 'idle',
    position: [
      initialPos.x + 1.85,
      walkableHeightAt(initialPos.x + 1.85, initialPos.z + 0.5),
      initialPos.z + 0.5,
    ],
    rotY: initialPos.yaw - 0.25,
  });
  await yieldSlice();

  enableCharacterFrustumCulling(knightChar, 3.2);
  enableCharacterFrustumCulling(mageChar, 3.2);
  heroesGroup.add(knightChar.group);
  heroesGroup.add(mageChar.group);

  // 1B. Damped Camera Impact (reserved strictly for major cataclysms, miracles & smites;
  //     NEVER triggered on routine normal attacks, bolts, shield blocks, or E skills!)
  const cameraImpact = {
    stiffness: 165,
    damping: 16,
    px: 0,
    py: 0,
    pz: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    trauma: 0,
    phase: 0,
    lastDirX: 0,
    lastDirZ: 1,
    fovOffset: 0,
    fovKickPeak: 0,
    fovKickTimer: 0,
    fovKickDuration: 0.28,
    routineImpulseCount: 0,
    cataclysmImpulseCount: 0,
  };

  function resetCameraImpact() {
    cameraImpact.px = 0;
    cameraImpact.py = 0;
    cameraImpact.pz = 0;
    cameraImpact.vx = 0;
    cameraImpact.vy = 0;
    cameraImpact.vz = 0;
    cameraImpact.trauma = 0;
    cameraImpact.phase = 0;
    cameraImpact.fovOffset = 0;
    cameraImpact.fovKickPeak = 0;
    cameraImpact.fovKickTimer = 0;
  }

  function triggerCameraImpulse({
    intensity = 0.12,
    dirX = undefined,
    dirZ = undefined,
    fovKick = 1.2,
    kind = 'cataclysm',
  } = {}) {
    if (kind === 'routine' || kind === 'normal_attack') {
      return;
    }
    cameraImpact.cataclysmImpulseCount += 1;

    const leaderYaw = heroStates?.[activeHeroId]?.yaw ?? initialPos.yaw ?? 0;
    const rawDx = dirX !== undefined ? dirX : Math.sin(leaderYaw);
    const rawDz = dirZ !== undefined ? dirZ : Math.cos(leaderYaw);
    const dLen = Math.hypot(rawDx, rawDz) || 1;
    const nx = rawDx / dLen;
    const nz = rawDz / dLen;

    const cleanIntensity = clamp(Number(intensity) || 0, 0, 0.55);
    const impulseSpeed = cleanIntensity * 7.2;

    cameraImpact.vx += nx * impulseSpeed;
    cameraImpact.vy += cleanIntensity * 3.5;
    cameraImpact.vz += nz * impulseSpeed;

    cameraImpact.trauma = clamp(cameraImpact.trauma + cleanIntensity * 0.95, 0, 0.55);
    cameraImpact.lastDirX = nx;
    cameraImpact.lastDirZ = nz;

    const cleanFov = clamp(Number(fovKick) || 0, 0, 3.0);
    if (cleanFov > 0) {
      cameraImpact.fovKickPeak = Math.max(cameraImpact.fovOffset, cleanFov);
      cameraImpact.fovKickDuration = 0.28;
      cameraImpact.fovKickTimer = 0.28;
    }
  }

  function stepCameraImpact(dt) {
    const subSteps = 2;
    const h = Math.min(Math.max(0, dt), 0.05) / subSteps;
    const k = cameraImpact.stiffness;
    const c = cameraImpact.damping;
    for (let s = 0; s < subSteps; s++) {
      const ax = -k * cameraImpact.px - c * cameraImpact.vx;
      const ay = -k * cameraImpact.py - c * cameraImpact.vy;
      const az = -k * cameraImpact.pz - c * cameraImpact.vz;
      cameraImpact.vx += ax * h;
      cameraImpact.vy += ay * h;
      cameraImpact.vz += az * h;
      cameraImpact.px += cameraImpact.vx * h;
      cameraImpact.py += cameraImpact.vy * h;
      cameraImpact.pz += cameraImpact.vz * h;
    }

    cameraImpact.phase += dt;
    cameraImpact.trauma *= Math.exp(-5.8 * dt);
    if (cameraImpact.trauma < 1e-4) cameraImpact.trauma = 0;

    if (cameraImpact.fovKickTimer > 0) {
      cameraImpact.fovKickTimer = Math.max(0, cameraImpact.fovKickTimer - dt);
      const u = 1.0 - cameraImpact.fovKickTimer / cameraImpact.fovKickDuration;
      const env =
        u < 0.18
          ? u / 0.18
          : Math.pow(Math.max(0, 1.0 - (u - 0.18) / 0.82), 2.2);
      cameraImpact.fovOffset = cameraImpact.fovKickPeak * env;
    } else {
      cameraImpact.fovOffset = 0;
      cameraImpact.fovKickPeak = 0;
    }
  }

  function getCameraImpactOffset(outPos = null, outLook = null, outFov = null) {
    const w1 = 18.0 * Math.PI * 2;
    const w2 = 27.0 * Math.PI * 2;
    const t = cameraImpact.phase;
    const env = cameraImpact.trauma * cameraImpact.trauma * 0.42;

    const waveLat = Math.sin(t * w1) * 0.65 + Math.sin(t * w2 + 1.15) * 0.35;
    const waveVert = Math.cos(t * w1 + 0.7) * 0.6 + Math.sin(t * w2 + 2.4) * 0.4;
    const waveFwd = Math.sin(t * w1 + 1.9) * 0.5;

    const perpX = -cameraImpact.lastDirZ;
    const perpZ = cameraImpact.lastDirX;

    const ox = cameraImpact.px + (perpX * waveLat + cameraImpact.lastDirX * waveFwd) * env;
    const oy = cameraImpact.py + waveVert * env * 0.85;
    const oz = cameraImpact.pz + (perpZ * waveLat + cameraImpact.lastDirZ * waveFwd) * env;

    const lx = ox * 0.62;
    const ly = oy * 0.68;
    const lz = oz * 0.62;

    if (outPos) {
      outPos.x = ox;
      outPos.y = oy;
      outPos.z = oz;
    }
    if (outLook) {
      outLook.x = lx;
      outLook.y = ly;
      outLook.z = lz;
    }
    if (outFov && typeof outFov === 'object') {
      outFov.value = cameraImpact.fovOffset;
      outFov.fov = cameraImpact.fovOffset;
      outFov.offset = cameraImpact.fovOffset;
    }

    return {
      posOffset: outPos || { x: ox, y: oy, z: oz },
      lookOffset: outLook || { x: lx, y: ly, z: lz },
      fovOffset: cameraImpact.fovOffset,
    };
  }

  // 2. Complete Stage 4 Opaque VFX & Sword Breathing Suite (`createVfxKitAsync`)
  const { createVfxKitAsync, createVfxKit } = await import('../assets/vfx/index.js');
  await yieldSlice();
  const vfxKit =
    typeof createVfxKitAsync === 'function'
      ? await createVfxKitAsync({
          scene,
          getGroundHeight: walkableHeightAt,
          onApexImpact: () => {},
          yieldFrame,
          sliceBudgetMs,
        })
      : createVfxKit({
          scene,
          getGroundHeight: walkableHeightAt,
          onApexImpact: () => {},
        });
  vfxKit.swordVfx.attachToKnight(knightChar);
  await yieldSlice();

  // 3. WebAudio Synthesized Combat SFX (`createCombatSfx`)
  const { createCombatSfx } = await import('./combat/combat-sfx.js');
  await yieldSlice();
  const combatSfx = createCombatSfx();
  await yieldSlice();

  // 4. Pooled 6-Skeleton + Boss Sovereign Enemy Manager (`createEnemyManager`)
  let campaignLoop = null;
  let localHitstopTimer = 0;
  let localHitSeq = 0;
  let lastAimBroadcastAt = 0;

  function buildWorldSyncPayload() {
    return campaignLoop ? campaignLoop.getStateSnapshot(heroStates) : null;
  }

  const { createEnemyManager } = await import('./combat/enemy-manager.js');
  await yieldSlice();
  const enemyManager = await createEnemyManager({
    scene,
    kit,
    profile: initialProfile,
    walkableHeightAt,
    resolveCollisions,
    yieldFrame,
    sliceBudgetMs,
    onEnemyKilled: (enemy, result) => {
      campaignLoop?.awardKnightKillXp?.(enemy, result);
    },
    onBossPhaseThreshold: (payload) => {
      campaignLoop?.handleBossPhaseThreshold?.(payload);
    },
    onDetonation: (det) => {
      localHitstopTimer = 0.07;
      knightChar.mixer.timeScale = 0.05;
      if (onBanner && det) {
        onBanner({
          title: `${det.label} · +${det.bonusDmg} AoE BURST`,
          subtitle: 'Elemental Mark Consumed · +20 Q Energy to Both Lovers',
          kind: 'detonation',
        });
      }
    },
    onBossAegisChanged: ({ aegisActive, aegisRaised, aegisBroken }) => {
      if (onBanner) {
        if (aegisRaised) {
          onBanner({
            title: 'THE HOLLOW SOVEREIGN RAISES BONE AEGIS!',
            subtitle: 'Break Both Shield Layers with Physical Detonations or Q: Cataclysm',
            kind: 'warning',
          });
        } else if (aegisBroken && !aegisActive) {
          onBanner({
            title: 'BONE AEGIS SHATTERED!',
            subtitle: 'The Hollow Sovereign is Staggered and Vulnerable!',
            kind: 'detonation',
          });
        }
      }
    },
    onPlayerHit: (targetHero, enemy, dmg, hitOpts = {}) => {
      const hState = heroStates[targetHero.id];
      if (campaignLoop) {
        const res = campaignLoop.handlePlayerHit(hState, enemy, dmg, {
          ...hitOpts,
          knightState: heroStates.Knight,
        });
        if (
          coopClient?.getState?.().peerConnected &&
          coopClient?.getState?.().isHost &&
          res &&
          (res.hpLost > 0 || res.absorbed > 0)
        ) {
          coopClient.sendActionEvent({
            role: targetHero.id,
            action: 'player_damaged',
            heroId: targetHero.id,
            damageDealt: res.hpLost || 0,
            absorbed: res.absorbed || 0,
            blockedByShield: Boolean(targetHero.shieldBlocking),
            enemyX: enemy?.x,
            enemyZ: enemy?.z,
            source: enemy?.currentHit?.attackId || enemy?.archetype || 'enemy_attack',
          });
          coopClient.sendWorldSync(buildWorldSyncPayload(), true);
        }
      }
    },
  });

  const skelWarrior = enemyManager.poolSlots[0].char;
  const skelMage = enemyManager.poolSlots[4].char;
  vfxKit.registerEnemyTargets([skelWarrior, skelMage]);

  // 5. State for Player 1 (Active Leader) and Player 2 (Co-Op Wingman Partner)
  const heroStates = {
    Knight: {
      id: 'Knight',
      char: knightChar,
      x: initialPos.x,
      z: initialPos.z,
      y: walkableHeightAt(initialPos.x, initialPos.z),
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: initialPos.yaw,
      vyaw: 0,
      grounded: true,
      locomotionState: 'idle',
      actionState: null,
      actionTimer: 0,
      comboIndex: 0,
      comboResetTimer: 0,
      mashTimeScale: 1.0,
      bufferedAttack: false,
      shieldBlocking: false,
      selectedElement: 'ice',
      dashDirX: 0,
      dashDirZ: 0,
      dashCooldown: 0,
      lungeRemaining: 0,
      lungeDuration: 0.22,
      praying: false,
      landTimer: 0,
      hitFlashTimer: -1,
      hitFlashBlocked: false,
      hitKnockbackX: 0,
      hitKnockbackZ: 0,
    },
    Mage: {
      id: 'Mage',
      char: mageChar,
      x: initialPos.x + 1.85,
      z: initialPos.z + 0.5,
      y: walkableHeightAt(initialPos.x + 1.85, initialPos.z + 0.5),
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: initialPos.yaw - 0.25,
      vyaw: 0,
      grounded: true,
      locomotionState: 'idle',
      actionState: null,
      actionTimer: 0,
      comboIndex: 0,
      comboResetTimer: 0,
      mashTimeScale: 1.0,
      bufferedAttack: false,
      consecutiveChargedCount: 0,
      selectedElement: 'ice',
      selectedSpell: 'frost_lance',
      dashDirX: 0,
      dashDirZ: 0,
      dashCooldown: 0,
      lungeRemaining: 0,
      lungeDuration: 0.22,
      praying: false,
      landTimer: 0,
      hitFlashTimer: -1,
      hitFlashBlocked: false,
      hitKnockbackX: 0,
      hitKnockbackZ: 0,
    },
  };

  let currentProfile = initialProfile;
  let activeHeroId = 'Knight';
  let partnerHeroId = 'Mage';
  let lastAppliedVerdictAt = 0;
  let lastKnownCamPitch = 0.14;

  function clearHeroHitFlashes() {
    for (const hSt of [heroStates.Knight, heroStates.Mage]) {
      if (!hSt) continue;
      hSt.hitFlashTimer = -1;
      hSt.hitFlashBlocked = false;
      hSt.hitKnockbackX = 0;
      hSt.hitKnockbackZ = 0;
      if (hSt.char) {
        ToonSkin?.setCharacterHitFlash?.(hSt.char, 0);
      }
    }
  }

  // 6. 3-Act Valley Expedition & Synergy Loop (`createCampaignLoop`)
  const { createCampaignLoop } = await import('./combat/campaign-loop.js');
  await yieldSlice();
  campaignLoop = createCampaignLoop({
    scene,
    walkableHeightAt,
    enemyManager,
    vfxKit,
    combatSfx,
    getProgressionState: () => coopClient?.getProgressionState?.(),
    onSkyTodChanged,
    onBanner,
    onHudStateChanged,
    onDetonation: (det) => {
      localHitstopTimer = 0.07;
      knightChar.mixer.timeScale = 0.05;
      if (onBanner && det) {
        onBanner({
          title: `${det.label} · +${det.bonusDmg} AoE BURST`,
          subtitle: 'Elemental Mark Detonated · +20 Q Energy to Both Lovers',
          kind: 'detonation',
        });
      }
    },
  });

  campaignLoop.setOnLocalEnemyHit(({ enemy, hitSpec, result, attackerRole, attackerPos }) => {
    if (!result || result.damageDealt <= 0) return;
    localHitstopTimer = Math.max(localHitstopTimer, result.detonation ? 0.07 : 0.035);
    const st = coopClient?.getState?.();
    if (st?.peerConnected && !st.isHost) {
      const hitId = `${st.clientId || 'guest'}_${++localHitSeq}`;
      const payload = {
        hitId,
        instanceId: enemy.instanceId,
        slotIndex: enemy.slotIndex,
        spawnGen: enemy.spawnGen || enemy.slot?.spawnGen || 1,
        dmg: result.damageDealt,
        baseDmg: hitSpec?.baseDmg ?? result.damageDealt,
        source: hitSpec?.source || 'guest_hit',
        mark: hitSpec?.applyMark || result.markApplied || null,
        detonatesMark: Boolean(hitSpec?.detonatesMark || result.detonation),
        infusion: hitSpec?.infusion || null,
        impulseX: Number((enemy.vx || 0).toFixed(2)),
        impulseZ: Number((enemy.vz || 0).toFixed(2)),
        attackerRole: attackerRole || activeHeroId,
        attackerPos: attackerPos
          ? { x: Number(attackerPos.x.toFixed(2)), z: Number(attackerPos.z.toFixed(2)) }
          : {
              x: Number(heroStates[activeHeroId].x.toFixed(2)),
              z: Number(heroStates[activeHeroId].z.toFixed(2)),
            },
      };
      if (typeof coopClient.sendEnemyHit === 'function') {
        coopClient.sendEnemyHit(payload);
      } else {
        coopClient.sendActionEvent({
          role: attackerRole || activeHeroId,
          action: 'enemy_hit',
          ...payload,
        });
      }
    }
  });

  campaignLoop.setOnPartnerRevived((evt) => {
    const st = coopClient?.getState?.();
    if (!st?.peerConnected || !st.isHost) return;
    if (evt?.partyWipeRebirth) {
      coopClient.sendActionEvent({
        role: activeHeroId,
        action: 'party_wipe_rebirth',
        x: evt.x,
        z: evt.z,
      });
    } else if (evt?.revivedHeroId) {
      if (typeof coopClient.sendRevivePartner === 'function') {
        coopClient.sendRevivePartner({
          revivedHeroId: evt.revivedHeroId,
          saviorHeroId: evt.saviorHeroId,
          hp: evt.hp,
          shield: evt.shield,
        });
      } else {
        coopClient.sendActionEvent({
          role: evt.saviorHeroId || activeHeroId,
          action: 'revive_partner',
          revivedHeroId: evt.revivedHeroId,
          saviorHeroId: evt.saviorHeroId,
          hp: evt.hp,
          shield: evt.shield,
        });
      }
    }
    coopClient.sendWorldSync(buildWorldSyncPayload(), true);
  });

  // 6B. Wave 2B Action Buffer, Mash Ramp, Contact-Frame Hit Detection & Spellbook Aim Controller
  const actionAim = createCombatActionAimController({
    walkableHeightAt,
    onSwingStarted: (swing, hCtrl) => {
      const st = heroStates[swing.heroId];
      if (!st) return;
      st.comboIndex = swing.comboIndex;
      st.comboResetTimer = hCtrl.comboResetTimer;
      st.mashTimeScale = swing.mashTimeScale;
      st.bufferedAttack = hCtrl.bufferedAttack;

      // Soft-lock orientation at swing start so the character faces the target
      const maxRange =
        swing.heroId === 'Knight'
          ? 5.5
          : swing.kind === 'charged'
            ? SPELLS.shatterlance.range
            : HERO_STATS.Mage.boltRange;
      if (swing.heroId === 'Mage') {
        // Mage turns (animated, before the release frame) instead of snapping.
        const target = mageSoftLock(st, maxRange, mageAimRayYaw(st));
        mageRt.faceYaw = target ? Math.atan2(target.x - st.x, target.z - st.z) : mageAimRayYaw(st);
      } else {
        const softTarget = selectSoftLockTarget(
          st,
          st.yaw,
          enemyManager.activeEnemies,
          { maxRange: 5.5, partnerPos: heroStates.Mage }
        );
        st.lastSwingTarget = softTarget || null;
        knightRt.faceYaw = softTarget ? Math.atan2(softTarget.x - st.x, softTarget.z - st.z) : null;
        knightRt.recoveryOpen = false;
      }

      // Smooth per-frame lunge velocity up to contactTime (replaces frame-0 teleport snap!)
      if (swing.stepDist > 0 && !swing.stationary) {
        st.lungeRemaining = swing.stepDist;
        st.lungeDuration = Math.max(0.14, swing.contactTime || 0.22);
      } else {
        st.lungeRemaining = 0;
      }
      // Strictly zero hopVy on all combo swings (fixes 4th-hit mid-air jitter)
      if (st.grounded) {
        st.vy = 0;
      }
      applyTransform(st);

      if (swing.heroId === 'Mage') {
        startMageSwingClip(st, swing);
      } else {
        const knightClip = pickHeroClip(st, swing.nativeClip, swing.clip) || swing.clip;
        const ultAtkMult = campaignLoop.combatHeroes.Knight.ultActive ? 1.35 : 1.0;
        const effectiveAnimScale = (swing.animTimeScale ?? swing.timeScale) * ultAtkMult;
        const effectiveVisDur = (swing.visualDuration ?? swing.duration) / ultAtkMult;
        startOneShotAction(st, knightClip, effectiveVisDur, {
          startTime: swing.animStartTime ?? 0,
          timeScale: effectiveAnimScale,
          fade: 0.07,
        });

        const activeStyle =
          campaignLoop.combatHeroes.Knight.sunSwornBreathing &&
          campaignLoop.combatHeroes.Knight.breathingStyle === 'none'
            ? 'eclipse'
            : campaignLoop.combatHeroes.Knight.breathingStyle || 'none';
        vfxKit.swordVfx?.triggerSwing?.(
          swing.clip,
          { x: st.x, y: st.y, z: st.z },
          knightRt.faceYaw ?? st.yaw,
          activeStyle,
          { duration: swing.duration / ultAtkMult }
        );
        if (
          swing.clip === 'combo4' &&
          (campaignLoop.combatHeroes.Knight.powerSwordActive ||
            campaignLoop.combatHeroes.Knight.ultActive)
        ) {
          vfxKit.ultimateVfx?.playDragonSlash?.(
            { x: st.x, y: st.y, z: st.z },
            { yaw: knightRt.faceYaw ?? st.yaw, style: activeStyle, duration: 0.72 }
          );
        }
      }

      coopClient.sendActionEvent({
        role: swing.heroId,
        action: swing.kind === 'charged' ? 'mage_heavy' : swing.clip,
        x: st.x,
        y: st.y,
        z: st.z,
        yaw: st.yaw,
      });
    },
    onContactHit: (swing, hCtrl) => {
      const st = heroStates[swing.heroId];
      const partner = heroStates[swing.heroId === 'Knight' ? 'Mage' : 'Knight'];
      if (!st) return;
      st.bufferedAttack = hCtrl.bufferedAttack;
      st.mashTimeScale = hCtrl.mashTimeScale;

      if (swing.heroId === 'Knight') {
        knightRt.recoveryOpen = true;
        const swingRes = campaignLoop.performKnightSwing(
          swing.clip,
          st,
          st.yaw,
          partner,
          { skipTriggerSwing: true }
        );
        if (swingRes?.swingYaw !== undefined) {
          st.yaw = swingRes.swingYaw;
          applyTransform(st);
        }
      } else if (swing.kind === 'charged') {
        campaignLoop.combatHeroes.Mage.consecutiveChargedCount =
          hCtrl.consecutiveChargedCount;
        st.consecutiveChargedCount = hCtrl.consecutiveChargedCount;
        campaignLoop.castSpell('shatterlance', st, st.yaw, partner, {
          ignoreCooldown: true,
        });
      } else {
        campaignLoop.combatHeroes.Mage.consecutiveChargedCount = 0;
        st.consecutiveChargedCount = 0;
        campaignLoop.performMageBoltAttack(swing.comboIndex, st, partner);
      }
      if (swing.heroId === 'Mage') onMageReleaseFrame();

      syncSharedPlayerFromLeader();
      onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
    },
    onSwingFinished: (swing, hCtrl) => {
      const st = heroStates[swing.heroId];
      if (!st) return;
      st.bufferedAttack = hCtrl.bufferedAttack;
      st.mashTimeScale = hCtrl.mashTimeScale;
    },
    onShieldBlockChanged: (blocking) => {
      heroStates.Knight.shieldBlocking = blocking;
      knightRt.shieldHoldElapsed = 0;
      campaignLoop.setKnightShieldBlocking(blocking);
      if (blocking) {
        combatSfx?.playShieldBlock?.('raise');
        vfxKit.swordVfx?.endSwing?.();
        heroStates.Knight.lungeRemaining = 0;
        heroStates.Knight.actionState = 'block';
        heroStates.Knight.actionTimer = 999;
        heroStates.Knight.char.play('block', {
          loop: true,
          fade: 0.08,
          startTime: 0,
          timeScale: 1.0,
          force: true,
        });
        onBanner?.({
          title: 'SHIELD BLOCK · FRONTAL BULWARK',
          subtitle: '80% Incoming Damage Reduction · Protecting the Mage Behind You',
          kind: 'blessing',
        });
      } else if (heroStates.Knight.actionState === 'block') {
        heroStates.Knight.actionState = null;
        heroStates.Knight.actionTimer = 0;
      }
      coopClient?.sendActionEvent?.({
        role: 'Knight',
        action: blocking ? 'block_start' : 'block_end',
        shieldBlocking: Boolean(blocking),
        x: heroStates.Knight.x,
        y: heroStates.Knight.y,
        z: heroStates.Knight.z,
        yaw: heroStates.Knight.yaw,
      });
    },
    onElementToggled: (payload) => {
      campaignLoop.toggleHeroElement(payload.heroId);
      combatSfx?.playUi?.(payload.element === 'fire' ? 'tab_fire' : 'tab_ice');
      if (payload.heroId === 'Knight') {
        heroStates.Knight.selectedElement = payload.element;
        onBanner?.({
          title:
            payload.element === 'fire'
              ? 'ATTUNED ELEMENT · HINOKAMI SUNFIRE'
              : 'ATTUNED ELEMENT · GLACIAL TIDE',
          subtitle:
            payload.element === 'fire'
              ? 'Press [C] to Ignite Fire Sword (Bonus Strike + Persistent Burn DoT)'
              : 'Press [C] to Ignite Ice Sword (Slows Enemy Speed, Attack & Damage)',
          kind: 'act',
        });
      } else {
        heroStates.Mage.selectedSpell = payload.spellId;
        heroStates.Mage.selectedElement = payload.element;
        onBanner?.({
          title:
            payload.spellId === 'cinder_fall'
              ? 'SPELLBOOK [C] · CINDER FALL METEOR'
              : 'SPELLBOOK [C] · FROST LANCE GLACIER',
          subtitle:
            payload.spellId === 'cinder_fall'
              ? 'Hold [C] to Aim Meteor Distance (3..16m) · Release [C] to Cast (8.5s CD)'
              : 'Hold [C] to Aim Glacier Line (14.5m) · Release [C] to Cast (8.5s CD)',
          kind: 'act',
        });
      }
      if (typeof coopClient?.sendElementToggle === 'function') {
        coopClient.sendElementToggle({
          role: payload.heroId,
          element: payload.element,
          spellId: payload.spellId,
        });
      } else {
        coopClient?.sendActionEvent?.({
          role: payload.heroId,
          action: 'element_toggle',
          element: payload.element,
          spellId: payload.spellId,
        });
      }
    },
    onAimChanged: (aim, phase, castResult = null) => {
      const aimArrow = vfxKit?.aimArrow;
      const arrowPayload = {
        ...aim,
        direction: { x: aim.dirX, y: 0, z: aim.dirZ },
        mode: aim.spellId,
        style: aim.spellId === 'cinder_fall' ? 'fire' : 'ice',
      };
      if (phase === 'hide') {
        // Hold the committed arrow until the cast clip's release frame spawns the spell.
        if (castResult?.scheduled && typeof aimArrow?.release === 'function') {
          aimArrow.release({ holdSeconds: castResult.releaseIn });
        } else {
          aimArrow?.hide?.();
        }
        if (!aim.isReleasingCast || aim.spellId !== 'shatterlance') {
          vfxKit?.shatterlance?.cancelCharge?.();
          combatSfx?.cancelSpellCharge?.('shatterlance');
        }
        if (heroStates.Mage.actionState === 'cast_hold') {
          heroStates.Mage.actionState = null;
          heroStates.Mage.actionTimer = 0;
        }
      } else if (phase === 'show') {
        if (typeof aimArrow?.show === 'function') {
          aimArrow.show(arrowPayload);
        } else if (typeof aimArrow?.setAim === 'function') {
          aimArrow.setAim(arrowPayload);
        }
        if (aim.spellId === 'shatterlance') {
          combatSfx?.playSpellCharge?.('shatterlance');
          vfxKit?.shatterlance?.updateChargeHold?.({
            origin: { x: heroStates.Mage.x, y: heroStates.Mage.y, z: heroStates.Mage.z },
            yaw: aim.yaw ?? heroStates.Mage.yaw,
            dirX: aim.dirX,
            dirZ: aim.dirZ,
            direction: { x: aim.dirX, y: 0, z: aim.dirZ },
            active: true,
            dt: 0,
          });
        }
      } else {
        if (typeof aimArrow?.updateAim === 'function') {
          aimArrow.updateAim(arrowPayload);
        } else if (typeof aimArrow?.setAim === 'function') {
          aimArrow.setAim(arrowPayload);
        } else if (typeof aimArrow?.show === 'function') {
          aimArrow.show(arrowPayload);
        }
        if (aim.spellId === 'shatterlance') {
          vfxKit?.shatterlance?.updateChargeHold?.({
            origin: { x: heroStates.Mage.x, y: heroStates.Mage.y, z: heroStates.Mage.z },
            yaw: aim.yaw ?? heroStates.Mage.yaw,
            dirX: aim.dirX,
            dirZ: aim.dirZ,
            direction: { x: aim.dirX, y: 0, z: aim.dirZ },
            active: true,
            dt: 0,
          });
        }
      }
      if (activeHeroId === 'Mage' && coopClient?.getState?.().peerConnected) {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (phase === 'show' || phase === 'hide' || nowMs - lastAimBroadcastAt >= 66) {
          lastAimBroadcastAt = nowMs;
          const aimMsg = {
            role: 'Mage',
            active: phase !== 'hide' && Boolean(aim?.active),
            phase,
            spellId: aim?.spellId || heroStates.Mage.selectedSpell || 'frost_lance',
            yaw: aim?.yaw ?? heroStates.Mage.yaw,
            distance: aim?.distance ?? 9.5,
            dirX: aim?.dirX ?? Math.sin(aim?.yaw ?? heroStates.Mage.yaw),
            dirZ: aim?.dirZ ?? Math.cos(aim?.yaw ?? heroStates.Mage.yaw),
            origin: { x: heroStates.Mage.x, y: heroStates.Mage.y, z: heroStates.Mage.z },
            targetPos: aim?.targetPos || null,
            releaseIn: castResult?.releaseIn ?? 0,
          };
          if (typeof coopClient.sendAimState === 'function') {
            coopClient.sendAimState(aimMsg);
          } else {
            coopClient.sendActionEvent({
              ...aimMsg,
              action: 'aim_state',
            });
          }
        }
      }
    },
    onAimCast: (castPayload) => beginMageSkillCast(castPayload),
  });

  // ---------------------------------------------------------------------------
  // Knight & Mage aim / cast runtime: sticky soft-lock, animated turn-to-target,
  // native 1.1 clip choice, release-frame spell spawning and dash/move cancel windows.
  // ---------------------------------------------------------------------------
  let lastKnownCamYaw = 0;
  const knightRt = {
    faceYaw: null,
    recoveryOpen: false,
    pendingUltSlam: 0,
    pendingUltCross2: 0,
    shieldHoldElapsed: 0,
  };
  const mageRt = {
    faceYaw: null, // facing goal while an attack owns the Mage's orientation
    pendingCast: null, // { payload, spec, timer, target } until the E clip's release frame
    queuedDash: false, // dash pressed during a wind-up: fires right after release
    dashAfterRelease: false,
    recoveryOpen: false, // after a release frame: dash/move may cut the clip
    chargedSwap: null, // { swing, at, clip } Shatterlance wind-up -> thrust hand-off
    aimSource: 'desktop', // 'desktop' | 'touch' | 'auto'
    composeAim: false, // true: aim is composed here each frame; false: main.js drives yaw/distance
    touch: null, // { dx, dy, overButton, leftButton } from the E button drag
    aimTarget: null,
    autoTarget: null,
    autoYaw: 0,
    lockedViaTouchStart: false,
    manualDragMoved: false,
    initialTouchCamYaw: 0,
    initialTouchDist: 14.5,
    shatterHoldElapsed: 0,
  };

  function heroHasClip(st, key) {
    const a = st?.char?.anim;
    return Boolean(key && a && (a.semanticActions?.has(key) || a.rawActions?.has(key)));
  }

  // First playable clip: KayKit 1.1 names first, semantic keys as fallback.
  function pickHeroClip(st, ...keys) {
    for (const k of keys.flat()) {
      if (heroHasClip(st, k)) return k;
    }
    return null;
  }

  function mageAimRayYaw(st) {
    return st.moveInputYaw ?? lastKnownCamYaw ?? st.yaw;
  }

  function mageSoftLock(st, maxRange, aimYaw) {
    const target = selectSoftLockTarget(st, aimYaw, enemyManager.activeEnemies, {
      maxRange,
      partnerPos: heroStates.Knight,
      selfId: 'Mage',
      partnerTarget: heroStates.Knight.lastSwingTarget || null,
    });
    st.softLockTarget = target || null;
    return target;
  }

  function startMageSwingClip(st, swing) {
    mageRt.recoveryOpen = false;
    mageRt.chargedSwap = null;
    const isCharged = swing.kind === 'charged';
    const first = isCharged
      ? pickHeroClip(st, swing.windupClip, swing.nativeClip, swing.clip, swing.fallbackClip)
      : pickHeroClip(st, swing.nativeClip, swing.clip);
    if (!first) return;
    startOneShotAction(st, first, swing.duration, {
      startTime: 0,
      timeScale: swing.timeScale,
      fade: swing.fade ?? 0.07,
    });
    if (isCharged && first === swing.windupClip) {
      const thrust = pickHeroClip(st, swing.nativeClip, swing.fallbackClip);
      if (thrust) {
        mageRt.chargedSwap = {
          swing,
          at: Math.max(0, swing.contactTime - swing.nativeReleaseOffset),
          clip: thrust,
        };
      }
    }
  }

  function onMageReleaseFrame() {
    mageRt.recoveryOpen = true;
    if (mageRt.queuedDash) {
      mageRt.queuedDash = false;
      mageRt.dashAfterRelease = true;
    }
  }

  function beginMageSkillCast(payload) {
    const mage = heroStates.Mage;
    const combat = campaignLoop.combatHeroes.Mage;
    const isShatter = payload?.spellId === 'shatterlance';
    if (!isShatter && !isAbilityUnlocked('skillE')) {
      return { locked: true };
    }
    if (combat.downed || (!isShatter && combat.skillCd > 0.05)) {
      vfxKit?.shatterlance?.cancelCharge?.();
      return combat.downed
        ? { blocked: true }
        : { onCooldown: true, cooldownRemaining: combat.skillCd };
    }
    const spec = MAGE_E_CAST_SPECS[payload.spellId] || MAGE_E_CAST_SPECS.frost_lance;
    const clip = pickHeroClip(mage, spec.nativeClip, spec.fallbackClip);
    mageRt.recoveryOpen = false;
    mageRt.chargedSwap = null;
    if (clip) {
      startOneShotAction(mage, clip, spec.lock, {
        startTime: 0,
        timeScale: spec.timeScale,
        fade: spec.fade,
      });
    }
    mageRt.pendingCast = {
      payload,
      spec,
      timer: spec.releaseTime,
      target: payload.lockState === 'locked' ? mageRt.aimTarget : null,
    };
    mageRt.aimTarget = null;
    return { scheduled: true, releaseIn: spec.releaseTime, clip };
  }

  function fireMageSkillCast() {
    const { payload, target } = mageRt.pendingCast;
    mageRt.pendingCast = null;
    const mageState = heroStates.Mage;
    let { yaw, distance, targetPos } = payload;
    // A locked Cinder Fall follows its enemy through the wind-up (still clamped to 3..16 m).
    if (payload.spellId === 'cinder_fall' && target && isSoftLockable(target)) {
      const dx = target.x - mageState.x;
      const dz = target.z - mageState.z;
      yaw = Math.atan2(dx, dz);
      distance = clamp(Math.hypot(dx, dz), MAGE_AIM_ASSIST.cinderMin, MAGE_AIM_ASSIST.cinderMax);
      const tx = mageState.x + Math.sin(yaw) * distance;
      const tz = mageState.z + Math.cos(yaw) * distance;
      targetPos = { x: tx, y: walkableHeightAt(tx, tz), z: tz };
    }
    mageState.yaw = yaw;
    applyTransform(mageState);
    if (payload.spellId === 'shatterlance') {
      mageState.consecutiveChargedCount = (mageState.consecutiveChargedCount || 0) + 1;
      campaignLoop.combatHeroes.Mage.consecutiveChargedCount = mageState.consecutiveChargedCount;
    }
    const res = campaignLoop.performPartnerSkill('Mage', heroStates, {
      spellId: payload.spellId,
      yaw,
      distance,
      targetPos,
    });
    coopClient.sendSpellCast({
      spellId: payload.spellId,
      origin: { x: mageState.x, y: mageState.y, z: mageState.z },
      yaw,
      distance,
      targetPos,
    });
    onMageReleaseFrame();
    onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
    return res;
  }

  function beginShatterlanceHoldVisuals(mageState) {
    if (!mageState) return;
    actionAim.cancelSwing('Mage');
    mageState.lungeRemaining = 0;
    mageState.actionState = null;
    mageState.actionTimer = 0;
    mageRt.recoveryOpen = false;
    mageRt.shatterHoldElapsed = 0;
    const spinHoldClip = pickHeroClip(
      mageState,
      'Ranged_Magic_Spellcasting',
      'cast_spell',
      MAGE_AIM_HOLD_SPEC.nativeClip,
      'idle'
    );
    if (spinHoldClip) {
      mageState.locomotionState = `mage_aim:shatter:${spinHoldClip}`;
      mageState.char?.play?.(spinHoldClip, {
        loop: true,
        fade: 0.08,
        startTime: 0,
        timeScale: 0.78,
        force: true,
      });
    }
  }

  function refreshMageSkillAim(isInitialShow = false) {
    const mage = heroStates.Mage;
    const spellId = actionAim.aimState.active
      ? actionAim.aimState.spellId
      : mage.selectedSpell || actionAim.heroes.Mage.selectedSpell || 'frost_lance';
    const isShatter = spellId === 'shatterlance';
    const aim = composeMageSkillAim({
      source: mageRt.aimSource,
      spellId,
      origin: mage,
      camYaw: lastKnownCamYaw,
      pitch: lastKnownCamPitch,
      facingYaw: mageRt.autoYaw,
      touch: mageRt.touch,
      autoTarget: mageRt.autoTarget,
      current: mageRt.aimTarget,
      enemies: enemyManager.activeEnemies,
      onCooldown: !isShatter && campaignLoop.combatHeroes.Mage.skillCd > 0.05,
      isTargetable: isSoftLockable,
    });
    mageRt.aimTarget = aim.target || null;
    let resolvedDistance = aim.distance;
    if (isShatter) {
      if (aim.lockState === 'locked' && aim.target) {
        resolvedDistance = clamp(
          Math.hypot((aim.target.x ?? mage.x) - mage.x, (aim.target.z ?? mage.z) - mage.z),
          0.8,
          18.0
        );
      } else if (mageRt.aimSource === 'touch' && mageRt.touch) {
        const dragLen = Math.hypot(Number(mageRt.touch.dx) || 0, Number(mageRt.touch.dy) || 0);
        if (dragLen >= MAGE_AIM_ASSIST.touchDeadzonePx) {
          const t = clamp(
            (dragLen - MAGE_AIM_ASSIST.touchDeadzonePx) / MAGE_AIM_ASSIST.touchRangePx,
            0,
            1
          );
          resolvedDistance = 3.0 + t * (16.0 - 3.0);
        } else {
          resolvedDistance = 14.5;
        }
      } else {
        resolvedDistance = 14.5;
      }
    }
    const params = {
      origin: { x: mage.x, y: mage.y, z: mage.z },
      yaw: aim.yaw,
      pitch: lastKnownCamPitch,
      distance: resolvedDistance,
      spellId,
      lockState: aim.lockState,
      lockTargetId: aim.target?.instanceId ?? aim.target?.id ?? null,
    };
    return isInitialShow ? actionAim.startSkillAim(params) : actionAim.updateSkillAim(params);
  }

  // Facing owned by aim / attacks: exponential turn (~0.12 s to settle) so the
  // Mage visibly pivots onto the target before the release frame.
  function stepMageFacing(st, dt) {
    if (st.actionState === 'dash') return false;
    const sw = actionAim.heroes.Mage.activeSwing;
    let goal = null;
    if (actionAim.aimState.active) {
      goal = actionAim.aimState.yaw;
    } else if (mageRt.pendingCast) {
      goal = mageRt.pendingCast.payload.yaw;
    } else if (sw && !sw.contactFired) {
      const t = st.softLockTarget;
      if (t && isSoftLockable(t)) mageRt.faceYaw = Math.atan2(t.x - st.x, t.z - st.z);
      goal = mageRt.faceYaw;
    } else if (sw) {
      goal = mageRt.faceYaw;
    }
    if (goal === null || goal === undefined) {
      mageRt.faceYaw = null;
      return false;
    }
    st.yaw += shortestAngleDiff(goal, st.yaw) * (1 - Math.exp(-24 * dt));
    return true;
  }

  function stepKnightFacing(st, dt) {
    if (st.actionState === 'dash') return false;
    const sw = actionAim.heroes.Knight.activeSwing;
    let goal = null;
    if (sw && !sw.contactFired) {
      const t = st.lastSwingTarget;
      if (t && isSoftLockable(t)) knightRt.faceYaw = Math.atan2(t.x - st.x, t.z - st.z);
      goal = knightRt.faceYaw;
    } else if (sw) {
      goal = knightRt.faceYaw;
    }
    if (goal === null || goal === undefined) {
      knightRt.faceYaw = null;
      return false;
    }
    st.yaw += shortestAngleDiff(goal, st.yaw) * (1 - Math.exp(-22 * dt));
    return true;
  }

  // Strafe/back-pedal clips while aiming; when holding Shatterlance stationary, plays the
  // looping staff-spinning & energy-gathering clip (`Ranged_Magic_Spellcasting` / `cast_spell`).
  function playMageAimLocomotion(st, moveX, moveZ, moving) {
    const spec = MAGE_AIM_HOLD_SPEC;
    const isShatterCharge = actionAim.aimState.spellId === 'shatterlance';
    let key;
    let loop = true;
    let timeScale = 1.0;
    if (!moving) {
      if (isShatterCharge) {
        key = pickHeroClip(
          st,
          'Ranged_Magic_Spellcasting',
          'cast_spell',
          spec.nativeClip,
          spec.fallbackClip,
          'idle'
        );
        loop = true;
        timeScale = 0.78 + 0.44 * clamp((mageRt.shatterHoldElapsed || 0) / 0.85, 0, 1);
      } else {
        key = pickHeroClip(st, spec.nativeClip, spec.fallbackClip, 'idle');
        loop = false;
      }
      st.mageAimDir = null;
    } else {
      const fwd = moveX * Math.sin(st.yaw) + moveZ * Math.cos(st.yaw);
      const right = -moveX * Math.cos(st.yaw) + moveZ * Math.sin(st.yaw);
      const a = Math.atan2(right, fwd);
      const CENTER = { forward: 0, right: Math.PI / 2, backward: Math.PI, left: -Math.PI / 2 };
      // Keep the current clip until the input is 15° past the sector edge, so diagonals don't flicker.
      const cur = st.mageAimDir;
      if (!cur || Math.abs(shortestAngleDiff(a, CENTER[cur])) > Math.PI / 4 + (15 * Math.PI) / 180) {
        const af = Math.abs(a);
        st.mageAimDir = af <= Math.PI / 4 ? 'forward' : af >= (3 * Math.PI) / 4 ? 'backward' : a > 0 ? 'right' : 'left';
      }
      key = pickHeroClip(st, spec.locomotion[st.mageAimDir], 'run');
    }
    if (!key) return;
    const loco = `mage_aim:${isShatterCharge ? 'shatter' : 'skill'}:${key}`;
    if (st.locomotionState === loco && st.char.anim.currentKey === key) return;
    st.locomotionState = loco;
    st.char.play(key, {
      loop,
      clampWhenFinished: !loop,
      fade: loop ? 0.12 : spec.fade,
      startTime: 0,
      timeScale,
    });
  }

  // Feet-to-ground matching for every hero (leader, remote peer, wingman): measured ground speed /
  // the clip's native stride. Capped so fast movement reads as a quick chibi scurry, not a blur.
  const HERO_STRIDE_MAX_RATE = 2.4;
  function detectFootstepSurface(x, z) {
    if (Math.hypot(x, z) <= 28.0) return 'cobble';
    if ((z <= -14.0 && z >= -72.0 && Math.abs(x) <= 5.5) || Math.hypot(x, z + 86.0) <= 15.5) {
      return 'stone';
    }
    return 'grass';
  }
  function stepLocomotionRates(dt) {
    for (const st of [heroStates.Knight, heroStates.Mage]) {
      if (!st?.char?.anim) continue;
      const px = st._strideX ?? st.x;
      const pz = st._strideZ ?? st.z;
      st._strideX = st.x;
      st._strideZ = st.z;
      const inst = dt > 1e-4 ? Math.hypot(st.x - px, st.z - pz) / dt : 0;
      // Ignore teleports/respawns.
      const v = inst > 30 ? 0 : inst;
      st.groundSpeed = (st.groundSpeed ?? v) + (v - (st.groundSpeed ?? v)) * (1 - Math.exp(-12 * dt));
      if (st.actionState || !st.grounded) {
        st._footstepDist = 0;
        continue;
      }
      if (st.id === activeHeroId && !st.shieldBlocking && !st.praying && st.groundSpeed > 1.35) {
        st._footstepDist = (st._footstepDist || 0) + st.groundSpeed * dt;
        if (st._footstepDist >= 2.25) {
          st._footstepDist -= 2.25;
          combatSfx?.playFootstep?.(detectFootstepSurface(st.x, st.z), st.id);
        }
      }
      const clipName = st.char.anim.currentClipName;
      const action = st.char.anim.rawActions?.get(clipName);
      if (!action || action.loop !== THREE.LoopRepeat) continue;
      if (st.locomotionState?.startsWith('mage_aim:shatter:') && st.groundSpeed < 0.25) {
        action.setEffectiveTimeScale(
          0.78 + 0.44 * clamp((mageRt.shatterHoldElapsed || 0) / 0.85, 0, 1)
        );
        continue;
      }
      const ts = strideTimeScale(clipName, st.groundSpeed, { rig: 'medium', max: HERO_STRIDE_MAX_RATE });
      if (ts !== 1.0) action.setEffectiveTimeScale(ts);
    }
  }

  function stepKnightActionRuntime(dt, controlLocked) {
    if (controlLocked || campaignLoop.combatHeroes.Knight.downed) {
      knightRt.pendingUltSlam = 0;
      knightRt.pendingUltCross2 = 0;
      knightRt.recoveryOpen = false;
      knightRt.shieldHoldElapsed = 0;
      return;
    }
    if (heroStates.Knight.shieldBlocking) {
      knightRt.shieldHoldElapsed = (knightRt.shieldHoldElapsed || 0) + dt;
    } else {
      knightRt.shieldHoldElapsed = 0;
    }
    if (knightRt.pendingUltSlam > 0) {
      knightRt.pendingUltSlam -= dt;
      if (knightRt.pendingUltSlam <= 0) {
        knightRt.pendingUltSlam = 0;
        const cut1Clip =
          pickHeroClip(heroStates.Knight, 'Melee_1H_Attack_Slice_Diagonal', 'combo2') || 'combo2';
        startOneShotAction(heroStates.Knight, cut1Clip, 0.34, {
          startTime: 0,
          timeScale: 1.75,
          fade: 0.05,
        });
        heroStates.Knight.lungeRemaining = 0.55;
        heroStates.Knight.lungeDuration = 0.22;
        combatSfx?.playKnightUltimate?.('cut1');
        vfxKit.swordVfx?.triggerSwing?.(
          'combo2',
          { x: heroStates.Knight.x, y: heroStates.Knight.y, z: heroStates.Knight.z },
          heroStates.Knight.yaw,
          'eclipse',
          { duration: 0.34 }
        );
      }
    }
    if (knightRt.pendingUltCross2 > 0) {
      knightRt.pendingUltCross2 -= dt;
      if (knightRt.pendingUltCross2 <= 0) {
        knightRt.pendingUltCross2 = 0;
        const cut2Clip =
          pickHeroClip(heroStates.Knight, 'Melee_1H_Attack_Slice_Horizontal', 'combo1') || 'combo1';
        startOneShotAction(heroStates.Knight, cut2Clip, 0.42, {
          startTime: 0,
          timeScale: 1.75,
          fade: 0.05,
        });
        heroStates.Knight.lungeRemaining = 0.45;
        heroStates.Knight.lungeDuration = 0.20;
        combatSfx?.playKnightUltimate?.('cut2');
        vfxKit.swordVfx?.triggerSwing?.(
          'combo1',
          { x: heroStates.Knight.x, y: heroStates.Knight.y, z: heroStates.Knight.z },
          heroStates.Knight.yaw,
          'eclipse',
          { duration: 0.42 }
        );
      }
    }
  }

  function stepMageActionRuntime(dt, controlLocked) {
    const mage = heroStates.Mage;
    if (controlLocked || campaignLoop.combatHeroes.Mage.downed) {
      mageRt.pendingCast = null;
      mageRt.queuedDash = false;
      mageRt.dashAfterRelease = false;
      mageRt.chargedSwap = null;
      return;
    }
    if (mageRt.pendingCast) {
      mageRt.pendingCast.timer -= dt;
      if (mageRt.pendingCast.timer <= 0) fireMageSkillCast();
    }
    const swap = mageRt.chargedSwap;
    const sw = actionAim.heroes.Mage.activeSwing;
    if (swap) {
      if (sw !== swap.swing) {
        mageRt.chargedSwap = null;
      } else if (sw.elapsed >= swap.at) {
        mageRt.chargedSwap = null;
        startOneShotAction(mage, swap.clip, Math.max(0.05, sw.duration - sw.elapsed), {
          startTime: 0,
          timeScale: 1.0,
          fade: 0.08,
        });
      }
    }
    if (mageRt.dashAfterRelease) {
      mageRt.dashAfterRelease = false;
      if (activeHeroId === 'Mage') triggerAction('dash');
    }
    if (actionAim.aimState.active && activeHeroId === 'Mage' && mageRt.composeAim) {
      refreshMageSkillAim();
    }
    // Sticky lock lapses once the combo window closes.
    if (!sw && !actionAim.aimState.active && actionAim.heroes.Mage.comboResetTimer <= 0) {
      mage.softLockTarget = null;
    }
  }

  vfxKit?.mageBolt?.setTargetResolver?.((pt) => {
    let best = null;
    let bestD = 1.6;
    for (const e of enemyManager.activeEnemies) {
      if (!e || e.active === false) continue;
      const d = Math.hypot(e.x - pt.x, e.z - pt.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  });

  function getHeroDistance() {
    return Math.hypot(
      heroStates.Knight.x - heroStates.Mage.x,
      heroStates.Knight.z - heroStates.Mage.z
    );
  }

  function getNearestInscriptionStone(maxRadius = ALTAR_STELE_POS.triggerRadius || 5.2) {
    const leader = heroStates[activeHeroId] || heroStates.Knight;
    let best = null;
    let bestDist = maxRadius;

    const physicalSites = [
      // Site 1: Village Well Carved Keystone at (0, 0)
      {
        ...SACRED_INSCRIPTION_STONES[0],
        id: SACRED_INSCRIPTION_STONES[0]?.id || 'site1_well',
        siteId: SACRED_INSCRIPTION_STONES[0]?.siteId || 'site1_well',
        legacyId: SACRED_INSCRIPTION_STONES[0]?.legacyId || 'stone_plaza',
        siteKey: 'well',
        rotY: 0.0,
        position: {
          x: SACRED_INSCRIPTION_STONES[0]?.x ?? 0.0,
          y: 0.0,
          z: SACRED_INSCRIPTION_STONES[0]?.z ?? 0.0,
        },
      },
      // Site 2: Whispering Grove Circular Floor Medallion at (142, 44)
      {
        ...SACRED_INSCRIPTION_STONES[1],
        id: SACRED_INSCRIPTION_STONES[1]?.id || 'site2_platform',
        siteId: SACRED_INSCRIPTION_STONES[1]?.siteId || 'site2_platform',
        legacyId: SACRED_INSCRIPTION_STONES[1]?.legacyId || 'stone_grove',
        siteKey: 'grove',
        rotY: 0.0,
        position: {
          x: SACRED_INSCRIPTION_STONES[1]?.x ?? 142.0,
          y: 0.52,
          z: SACRED_INSCRIPTION_STONES[1]?.z ?? 44.0,
        },
      },
      // Site 3: Southwest Hidden Lovers' Wall at (-124.0, 84.0, rotY = 0.45)
      {
        ...SACRED_INSCRIPTION_STONES[2],
        id: SACRED_INSCRIPTION_STONES[2]?.id || 'site3_wall',
        siteId: SACRED_INSCRIPTION_STONES[2]?.siteId || 'site3_wall',
        legacyId: SACRED_INSCRIPTION_STONES[2]?.legacyId || 'stone_pier',
        siteKey: 'cottage_wall',
        rotY: 0.45,
        position: {
          x: SACRED_INSCRIPTION_STONES[2]?.x ?? -124.0,
          y: 0.72,
          z: SACRED_INSCRIPTION_STONES[2]?.z ?? 84.0,
        },
      },
    ];

    for (const stone of physicalSites) {
      if (!stone?.position) continue;
      const isGroveSite = stone.legacyId === 'stone_grove' || stone.id === 'site2_platform';
      const siteRadius = isGroveSite ? Math.max(bestDist, 5.6) : bestDist;
      const d = Math.hypot(leader.x - stone.position.x, leader.z - stone.position.z);
      if (d <= siteRadius && d <= bestDist + (isGroveSite ? 1.1 : 0)) {
        bestDist = Math.min(bestDist, d);
        best = { ...stone, distance: Number(d.toFixed(2)) };
      }
    }
    if (!best) {
      const dLegacy = Math.hypot(leader.x - ALTAR_STELE_POS.x, leader.z - ALTAR_STELE_POS.z);
      if (dLegacy <= bestDist) {
        best = {
          ...SACRED_INSCRIPTION_STONES[0],
          id: SACRED_INSCRIPTION_STONES[0]?.id || 'site1_well',
          siteId: SACRED_INSCRIPTION_STONES[0]?.siteId || 'site1_well',
          legacyId: SACRED_INSCRIPTION_STONES[0]?.legacyId || 'stone_plaza',
          siteKey: 'well',
          rotY: 0.0,
          position: {
            x: SACRED_INSCRIPTION_STONES[0]?.x ?? ALTAR_STELE_POS.x ?? 0.0,
            y: 0.0,
            z: SACRED_INSCRIPTION_STONES[0]?.z ?? ALTAR_STELE_POS.z ?? 0.0,
          },
          distance: Number(dLegacy.toFixed(2)),
        };
      }
    }
    return best;
  }

  function isNearAltarStele() {
    return Boolean(getNearestInscriptionStone());
  }

  const communeChannel = {
    active: false,
    speakerRole: activeHeroId,
    localInitiated: false,
  };

  function isPlayerControlLocked() {
    return Boolean(campaignLoop.isControlLocked?.() || communeChannel.active);
  }

  function startCommuneChannel(
    speakerRole = activeHeroId,
    { broadcast = true, camera = null, force = false } = {}
  ) {
    ensureCombatUnfrozen();
    const normSpeaker =
      String(speakerRole || activeHeroId).toLowerCase() === 'mage' ? 'Mage' : 'Knight';
    const normPartner = normSpeaker === 'Knight' ? 'Mage' : 'Knight';

    const gate = campaignLoop.canCommuneTogether(heroStates);
    if (!force && !gate.allowed) {
      if (gate.reason === 'too_far') {
        const maxD = Number(gate.maxDist || 6.0).toFixed(1);
        onBanner?.({
          title: `STAND WITHIN ${maxD}m TO PRAY`,
          subtitle: `Move closer to your beloved (${gate.distance.toFixed(1)}m / ${maxD}m max) to open the Court of Dark Flowers.`,
          kind: 'warning',
        });
      } else if (gate.reason === 'combat_hp_too_high') {
        onBanner?.({
          title: 'DIVINE PRAYER LOCKED IN COMBAT',
          subtitle:
            'In battle, the God of Love answers only when a lover is Downed or below 35% HP!',
          kind: 'warning',
        });
      } else {
        onBanner?.({
          title: 'CANNOT CHANNEL PRAYER',
          subtitle: 'Both lovers have fallen — awaiting Sanctuary Stone rebirth.',
          kind: 'warning',
        });
      }
      return {
        allowed: false,
        tooFar: gate.reason === 'too_far',
        reason: gate.reason,
        distance: Number(gate.distance.toFixed(2)),
        maxDist: gate.maxDist,
        speakerRole: normSpeaker,
      };
    }

    if (heroStates.Knight.shieldBlocking) {
      actionAim.releaseHeavy('Knight');
    }
    actionAim.cancelSkillAim();

    const speakerState = heroStates[normSpeaker];
    const partnerState = heroStates[normPartner];

    communeChannel.active = true;
    communeChannel.speakerRole = normSpeaker;
    communeChannel.localInitiated = Boolean(broadcast);

    speakerState.praying = true;
    speakerState.actionState = null;
    speakerState.actionTimer = 0;
    speakerState.char.play('cast_spell', { loop: true, fade: 0.12, force: true });

    if (!campaignLoop.combatHeroes[normPartner]?.downed) {
      partnerState.praying = true;
      partnerState.actionState = null;
      partnerState.actionTimer = 0;
      partnerState.char.play('pray_channel', { loop: true, fade: 0.14, force: true });
    }

    const chRes = campaignLoop.setCommuneChannelActive(true, heroStates);
    combatSfx?.playCommuneStart?.(normSpeaker);
    vfxKit.artoriousVfx?.startChannel?.(speakerState, partnerState, {
      camera,
      communeMode: chRes?.communeMode || 'normal',
    });

    applyTransform(speakerState);
    applyTransform(partnerState);

    if (broadcast) {
      coopClient.sendCommuneState({
        state: 'channel',
        speakerRole: normSpeaker,
        speakerPos: { x: speakerState.x, y: speakerState.y, z: speakerState.z },
        partnerPos: { x: partnerState.x, y: partnerState.y, z: partnerState.z },
      });
    }

    return {
      allowed: true,
      tooFar: false,
      reason: null,
      distance: Number(gate.distance.toFixed(2)),
      maxDist: gate.maxDist,
      speakerRole: normSpeaker,
    };
  }

  function setCommuneSuspense(active = true, { broadcast = true } = {}) {
    vfxKit.artoriousVfx?.setSuspense?.(Boolean(active));
    if (broadcast) {
      coopClient.sendCommuneState({
        state: 'suspense',
        active: Boolean(active),
        speakerRole: activeHeroId,
      });
    }
  }

  function resetPrayingHeroToIdle(hSt, wasPraying = false) {
    if (!hSt) return;
    const isPrayAction =
      hSt.actionState === 'cast_spell' ||
      hSt.actionState === 'pray_channel' ||
      hSt.actionState === 'pray';
    if (wasPraying || isPrayAction) {
      if (hSt.actionState !== 'hit_b' && hSt.actionState !== 'death') {
        hSt.actionState = null;
        hSt.actionTimer = 0;
        hSt.lungeRemaining = 0;
      }
    }
    if (
      !campaignLoop.combatHeroes[hSt.id]?.downed &&
      !hSt.actionState &&
      hSt.actionState !== 'hit_b' &&
      hSt.actionState !== 'death'
    ) {
      const curClip = hSt.char?.anim?.currentKey;
      if (
        wasPraying ||
        isPrayAction ||
        curClip === 'cast_spell' ||
        curClip === 'pray_channel' ||
        curClip === 'pray'
      ) {
        hSt.locomotionState = null;
        playHeroLocomotionClip(hSt, 'idle');
      }
    }
  }

  function cancelCommuneChannel({ broadcast = true } = {}) {
    const wasKnightPraying = Boolean(heroStates.Knight.praying);
    const wasMagePraying = Boolean(heroStates.Mage.praying);
    communeChannel.active = false;
    communeChannel.localInitiated = false;
    vfxKit.artoriousVfx?.setSuspense?.(false);
    if (vfxKit.artoriousVfx?.stopChannel) {
      vfxKit.artoriousVfx.stopChannel();
    } else {
      vfxKit.artoriousVfx?.clear?.();
    }
    campaignLoop.setCommuneChannelActive(false);
    heroStates.Knight.praying = false;
    heroStates.Mage.praying = false;
    knightChar.group.visible = true;
    mageChar.group.visible = true;
    if (vfxKit?.swordVfx?.group) {
      vfxKit.swordVfx.group.visible = true;
    }
    setCharacterVerdictShaderState(knightChar, {
      groundClipY: -9999,
      dissolveProgress: 0,
      dissolveBaseY: 0,
      monochromeOverride: 0,
    });
    setCharacterVerdictShaderState(mageChar, {
      groundClipY: -9999,
      dissolveProgress: 0,
      dissolveBaseY: 0,
      monochromeOverride: 0,
    });
    resetPrayingHeroToIdle(heroStates.Knight, wasKnightPraying || true);
    resetPrayingHeroToIdle(heroStates.Mage, wasMagePraying || true);
    applyTransform(heroStates.Knight);
    applyTransform(heroStates.Mage);
    onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
    if (broadcast) {
      coopClient.sendCommuneState({
        state: 'cancel',
        speakerRole: activeHeroId,
      });
    }
  }

  function applyCommuneVerdict(judgment = {}, speakerRole = activeHeroId) {
    ensureCombatUnfrozen();
    lastAppliedVerdictAt = Date.now();
    const wasKnightPraying = Boolean(heroStates.Knight.praying);
    const wasMagePraying = Boolean(heroStates.Mage.praying);
    communeChannel.active = false;
    communeChannel.localInitiated = false;
    vfxKit.artoriousVfx?.setSuspense?.(false);
    heroStates.Knight.praying = false;
    heroStates.Mage.praying = false;

    const res = campaignLoop.applyCommuneVerdict(judgment, speakerRole, heroStates);
    const nonCutsceneMode =
      !res?.sequenceActive ||
      ['retry', 'penalty', 'pat', 'field_heal', 'awakening'].includes(res?.prayerMode);
    if (nonCutsceneMode && !res?.sequenceActive) {
      if (vfxKit.artoriousVfx?.stopChannel) {
        vfxKit.artoriousVfx.stopChannel();
      } else {
        vfxKit.artoriousVfx?.clear?.();
      }
      resetPrayingHeroToIdle(heroStates.Knight, wasKnightPraying);
      resetPrayingHeroToIdle(heroStates.Mage, wasMagePraying);
    }

    applyTransform(heroStates.Knight);
    applyTransform(heroStates.Mage);

    const verdict = String(judgment?.verdict || 'smite').toLowerCase();
    if (res?.prayerMode !== 'retry') {
      triggerCameraImpulse({
        intensity: verdict === 'miracle' ? 0.32 : verdict === 'smite' ? 0.28 : 0.18,
        fovKick: verdict === 'miracle' ? 2.8 : verdict === 'smite' ? 2.2 : 1.4,
        kind: 'cataclysm',
      });
    }

    return res;
  }

  // 7. WebSocket 2-Player Co-Op Client (`createCoopClient`)
  const remotePartnerTarget = {
    active: false,
    x: heroStates.Mage.x,
    y: heroStates.Mage.y,
    z: heroStates.Mage.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: heroStates.Mage.yaw,
    vyaw: 0,
    grounded: true,
    clip: 'idle',
    actionState: null,
    shieldBlocking: false,
    element: 'ice',
    receivedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  };

  function handleRemoteElementToggle(msg) {
    const role = msg.role === 'Knight' ? 'Knight' : 'Mage';
    const nextEl = msg.element === 'fire' ? 'fire' : 'ice';
    const nextSpell =
      msg.spellId || (nextEl === 'fire' ? 'cinder_fall' : 'frost_lance');
    if (campaignLoop.combatHeroes[role]) {
      campaignLoop.combatHeroes[role].selectedElement = nextEl;
      if (role === 'Mage') {
        campaignLoop.combatHeroes.Mage.selectedSpell = nextSpell;
      }
    }
    if (actionAim.heroes[role]) {
      actionAim.heroes[role].selectedElement = nextEl;
      if (role === 'Mage') {
        actionAim.heroes.Mage.selectedSpell = nextSpell;
      }
    }
    if (heroStates[role]) {
      heroStates[role].selectedElement = nextEl;
      if (role === 'Mage') {
        heroStates.Mage.selectedSpell = nextSpell;
      }
    }
    onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
  }

  function handleRemoteAimState(msg) {
    if (activeHeroId === 'Mage') return;
    const aimArrow = vfxKit?.aimArrow;
    if (!aimArrow) return;
    const phase = msg.phase || (msg.active ? 'update' : 'hide');
    if (phase === 'hide' || msg.active === false) {
      if (msg.releaseIn > 0 && typeof aimArrow.release === 'function') {
        aimArrow.release({ holdSeconds: msg.releaseIn });
      } else {
        aimArrow.hide?.();
      }
      vfxKit?.shatterlance?.cancelCharge?.();
      return;
    }
    const spellId = msg.spellId || heroStates.Mage.selectedSpell || 'frost_lance';
    const yaw = msg.yaw ?? heroStates.Mage.yaw;
    const dirX = msg.dirX ?? Math.sin(yaw);
    const dirZ = msg.dirZ ?? Math.cos(yaw);
    const origin = msg.origin || {
      x: heroStates.Mage.x,
      y: heroStates.Mage.y,
      z: heroStates.Mage.z,
    };
    const arrowPayload = {
      active: true,
      spellId,
      origin,
      yaw,
      distance: msg.distance ?? 9.5,
      dirX,
      dirZ,
      direction: { x: dirX, y: 0, z: dirZ },
      targetPos: msg.targetPos || null,
      mode: spellId,
      style: spellId === 'cinder_fall' ? 'fire' : 'ice',
    };
    if (phase === 'show' && typeof aimArrow.show === 'function') {
      aimArrow.show(arrowPayload);
    } else if (typeof aimArrow.updateAim === 'function') {
      aimArrow.updateAim(arrowPayload);
    } else if (typeof aimArrow.setAim === 'function') {
      aimArrow.setAim(arrowPayload);
    } else if (typeof aimArrow.show === 'function') {
      aimArrow.show(arrowPayload);
    }
    if (spellId === 'shatterlance') {
      vfxKit?.shatterlance?.updateChargeHold?.({
        origin,
        yaw,
        dirX,
        dirZ,
        direction: { x: dirX, y: 0, z: dirZ },
        active: true,
        dt: 0.016,
      });
    }
  }

  function handleRemoteRevivePartner(msg) {
    const revivedId =
      msg.revivedHeroId === 'Knight' || msg.revivedHeroId === 'Mage'
        ? msg.revivedHeroId
        : activeHeroId;
    const cHero = campaignLoop.combatHeroes[revivedId];
    if (cHero) {
      cHero.downed = false;
      cHero.reviveTimer = 0;
      cHero.hp = msg.hp ?? Math.round(cHero.maxHp * 0.55);
      cHero.shield = Math.max(cHero.shield || 0, msg.shield ?? 45);
      cHero.shieldTimer = Math.max(cHero.shieldTimer || 0, 8.0);
    }
    const hSt = heroStates[revivedId];
    if (hSt) {
      hSt.actionState = null;
      hSt.actionTimer = 0;
      playHeroLocomotionClip(hSt, 'idle');
    }
    combatSfx.playMiracle?.();
    onBanner?.({
      title: `${revivedId.toUpperCase()} REVIVED BY PARTNER!`,
      subtitle: '55% HP Restored · +45 Protective Shield',
      kind: 'blessing',
    });
    onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
  }

  const { createCoopClient } = await import('./net/coop-client.js');
  await yieldSlice();
  const coopClient = createCoopClient({
    preferredRole: activeHeroId,
    onRoomState: (roomState) => {
      if (
        (roomState.peerConnected || roomState.connected) &&
        roomState.role &&
        roomState.role !== activeHeroId
      ) {
        activeHeroId = roomState.role;
        partnerHeroId = activeHeroId === 'Knight' ? 'Mage' : 'Knight';
        syncSharedPlayerFromLeader();
        onHeroSwapped?.(activeHeroId, partnerHeroId);
      }
      remotePartnerTarget.active = Boolean(roomState.peerConnected);
      if (roomState.peerConnected && roomState.isHost) {
        coopClient.sendWorldSync(buildWorldSyncPayload(), true);
      }
      onCoopStateChanged?.(roomState);
    },
    onExpeditionStarted: () => {
      ensureCombatUnfrozen();
      const st = coopClient.getState();
      if (!st.peerConnected || st.isHost) {
        if (enemyManager.activeEnemies.length === 0 && !campaignLoop.roadVanguardSpawned) {
          campaignLoop.startExpedition({ x: 0, z: 102 });
        }
        coopClient.sendWorldSync(buildWorldSyncPayload(), true);
      }
    },
    onPeerHeroState: (msg) => {
      const peerRole = msg.role === 'Knight' ? 'Knight' : 'Mage';
      if (peerRole === activeHeroId) return;
      remotePartnerTarget.active = true;
      remotePartnerTarget.receivedAt =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (typeof msg.x === 'number') remotePartnerTarget.x = msg.x;
      if (typeof msg.y === 'number') remotePartnerTarget.y = msg.y;
      if (typeof msg.z === 'number') remotePartnerTarget.z = msg.z;
      if (typeof msg.vx === 'number') remotePartnerTarget.vx = msg.vx;
      if (typeof msg.vy === 'number') remotePartnerTarget.vy = msg.vy;
      if (typeof msg.vz === 'number') remotePartnerTarget.vz = msg.vz;
      if (typeof msg.yaw === 'number') remotePartnerTarget.yaw = msg.yaw;
      if (typeof msg.vyaw === 'number') remotePartnerTarget.vyaw = msg.vyaw;
      if (typeof msg.grounded === 'boolean') remotePartnerTarget.grounded = msg.grounded;
      if (msg.clip) remotePartnerTarget.clip = msg.clip;
      if (msg.actionState !== undefined) remotePartnerTarget.actionState = msg.actionState;

      const peerHero = heroStates[peerRole];
      if (!peerHero) return;

      if (peerRole === 'Knight' && typeof msg.shieldBlocking === 'boolean') {
        remotePartnerTarget.shieldBlocking = msg.shieldBlocking;
        if (peerHero.shieldBlocking !== msg.shieldBlocking) {
          peerHero.shieldBlocking = msg.shieldBlocking;
          campaignLoop.setKnightShieldBlocking(msg.shieldBlocking);
          if (msg.shieldBlocking) {
            peerHero.actionState = 'block';
            peerHero.actionTimer = 999;
            peerHero.char.play('block', { loop: true, fade: 0.08, startTime: 0, force: true });
          } else if (peerHero.actionState === 'block') {
            peerHero.actionState = null;
            peerHero.actionTimer = 0;
          }
        }
      }

      if (msg.element === 'fire' || msg.element === 'ice') {
        remotePartnerTarget.element = msg.element;
        peerHero.selectedElement = msg.element;
        if (campaignLoop.combatHeroes[peerRole]) {
          campaignLoop.combatHeroes[peerRole].selectedElement = msg.element;
        }
        if (peerRole === 'Mage') {
          const sp = msg.element === 'fire' ? 'cinder_fall' : 'frost_lance';
          peerHero.selectedSpell = sp;
          if (campaignLoop.combatHeroes.Mage) {
            campaignLoop.combatHeroes.Mage.selectedSpell = sp;
          }
        }
      }

      // Critical Animation Fix: Never let periodic hero_state.clip updates overwrite an active one-shot attack/cast animation!
      if (
        msg.clip &&
        (!peerHero.actionState || peerHero.actionTimer <= 0) &&
        !peerHero.shieldBlocking &&
        !peerHero.praying
      ) {
        playHeroLocomotionClip(peerHero, msg.clip);
      }
    },
    onPeerSpellCast: (msg) => {
      const spellId = msg.spellId || msg.spell || 'frost_lance';
      const caster = heroStates.Mage;
      const yaw = msg.yaw ?? caster.yaw;
      if (msg.origin && typeof msg.origin.x === 'number' && typeof msg.origin.z === 'number') {
        caster.x = msg.origin.x;
        caster.z = msg.origin.z;
        caster.y = walkableHeightAt(caster.x, caster.z);
        remotePartnerTarget.x = caster.x;
        remotePartnerTarget.z = caster.z;
        remotePartnerTarget.y = caster.y;
      }
      caster.yaw = yaw;
      remotePartnerTarget.yaw = yaw;
      applyTransform(caster);
      if (activeHeroId !== 'Mage') {
        vfxKit?.aimArrow?.hide?.();
        vfxKit?.shatterlance?.cancelCharge?.();
      }
      startOneShotAction(caster, 'cast_spell', 0.62, {
        startTime: 0,
        timeScale: 1.0,
        fade: 0.08,
      });
      campaignLoop.castSpell(spellId, msg.origin || caster, yaw, heroStates.Knight, {
        distance: msg.distance,
        targetPos: msg.targetPos,
        ignoreCooldown: true,
        remoteVisualOnly: true,
      });
    },
    onPeerAction: (msg) => {
      if (msg.action === 'element_toggle') {
        handleRemoteElementToggle(msg);
        return;
      }
      if (msg.action === 'aim_state') {
        handleRemoteAimState(msg);
        return;
      }
      if (msg.action === 'revive_partner') {
        handleRemoteRevivePartner(msg);
        return;
      }
      if (msg.action === 'party_wipe_rebirth') {
        const rx = typeof msg.x === 'number' ? msg.x : 0;
        const rz = typeof msg.z === 'number' ? msg.z : 122;
        for (const hId of ['Knight', 'Mage']) {
          const hSt = heroStates[hId];
          const cH = campaignLoop.combatHeroes[hId];
          hSt.x = hId === 'Knight' ? rx : rx + 1.85;
          hSt.z = hId === 'Knight' ? rz : rz + 0.5;
          hSt.y = walkableHeightAt(hSt.x, hSt.z);
          hSt.actionState = null;
          hSt.actionTimer = 0;
          applyTransform(hSt);
          playHeroLocomotionClip(hSt, 'idle');
          if (cH) {
            cH.downed = false;
            cH.reviveTimer = 0;
            cH.hp = cH.maxHp;
            cH.shield = 60;
            cH.shieldTimer = 8.0;
          }
        }
        combatSfx.playMiracle?.();
        onBanner?.({
          title: 'REBORN AT THE VALLEY GATE',
          subtitle: 'Both Lovers Restored to Full HP + 60 Shield',
          kind: 'blessing',
        });
        onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
        return;
      }
      if (msg.action === 'detonation') {
        localHitstopTimer = 0.07;
        knightChar.mixer.timeScale = 0.05;
        onBanner?.({
          title: `${msg.label || 'ELEMENTAL DETONATION'} · +${msg.bonusDmg || 42} AoE BURST`,
          subtitle: 'Elemental Mark Detonated · +20 Q Energy to Both Lovers',
          kind: 'detonation',
        });
        return;
      }
      if (msg.action === 'player_damaged') {
        const victimId = msg.heroId === 'Knight' ? 'Knight' : 'Mage';
        const victimSt = heroStates[victimId];
        if (victimSt) {
          victimSt.hitFlashTimer = 0.18;
          victimSt.hitFlashBlocked = Boolean(msg.blockedByShield);
          if (victimId === activeHeroId && !msg.blockedByShield && (msg.damageDealt || 0) > 0) {
            const kClip =
              victimId === 'Knight'
                ? pickHeroClip(victimSt, 'Hit_B', 'Hit_A', 'hit') || 'hit'
                : pickHeroClip(victimSt, 'Hit_A', 'hit') || 'hit';
            if (!victimSt.actionState) {
              startOneShotAction(victimSt, kClip, 0.28, { startTime: 0, timeScale: 1.25, fade: 0.05 });
            }
          }
        }
        return;
      }
      if (msg.action === 'enemy_hit') {
        const st = coopClient.getState();
        if (!st.peerConnected || st.isHost) {
          const hitRes = campaignLoop.applyRemoteEnemyHit(msg, heroStates);
          if (hitRes?.accepted) {
            if (hitRes.detonation) {
              coopClient.sendActionEvent({
                role: msg.attackerRole || 'Mage',
                action: 'detonation',
                label: hitRes.detonation.label,
                bonusDmg: hitRes.detonation.bonusDmg,
              });
            }
            coopClient.sendWorldSync(buildWorldSyncPayload(), true);
            onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
          }
        }
        return;
      }

      const role = msg.role === 'Knight' ? 'Knight' : 'Mage';
      if (role === activeHeroId) return;
      const st = heroStates[role];
      if (!st) return;

      if (typeof msg.x === 'number' && typeof msg.z === 'number') {
        st.x = msg.x;
        st.z = msg.z;
        st.y = walkableHeightAt(st.x, st.z);
        remotePartnerTarget.x = msg.x;
        remotePartnerTarget.z = msg.z;
        remotePartnerTarget.y = st.y;
      }
      if (typeof msg.yaw === 'number') {
        st.yaw = msg.yaw;
        remotePartnerTarget.yaw = msg.yaw;
      }
      applyTransform(st);

      if (
        msg.action === 'combo1' ||
        msg.action === 'combo2' ||
        msg.action === 'combo3' ||
        msg.action === 'combo4'
      ) {
        const swingSpec = KNIGHT_COMBO_SPECS.find((s) => s.clip === msg.action);
        const knightClip =
          pickHeroClip(st, swingSpec?.nativeClip, msg.action) || msg.action;
        startOneShotAction(st, knightClip, swingSpec?.visualDuration || 0.56, {
          startTime: swingSpec?.animStartTime ?? 0,
          timeScale: swingSpec?.animTimeScale ?? 1.0,
          fade: 0.07,
        });
        if (role === 'Knight') {
          campaignLoop.performKnightSwing(msg.action, st, msg.yaw ?? st.yaw, heroStates.Mage, {
            remoteVisualOnly: true,
          });
          if (
            msg.action === 'combo4' &&
            (campaignLoop.combatHeroes.Knight.powerSwordActive ||
              campaignLoop.combatHeroes.Knight.ultActive)
          ) {
            const activeStyle =
              campaignLoop.combatHeroes.Knight.breathingStyle || 'solar';
            vfxKit.ultimateVfx?.playDragonSlash?.(
              { x: st.x, y: st.y, z: st.z },
              { yaw: msg.yaw ?? st.yaw, style: activeStyle, duration: 0.72 }
            );
          }
        }
      } else if (
        msg.action === 'block' ||
        msg.action === 'shield_block' ||
        msg.action === 'block_start'
      ) {
        st.shieldBlocking = true;
        remotePartnerTarget.shieldBlocking = true;
        campaignLoop.setKnightShieldBlocking(true);
        vfxKit.swordVfx?.endSwing?.();
        st.actionState = 'block';
        st.actionTimer = 999;
        st.char.play('block', { loop: true, fade: 0.08, startTime: 0, force: true });
      } else if (msg.action === 'block_end' || msg.action === 'shield_block_end') {
        st.shieldBlocking = false;
        remotePartnerTarget.shieldBlocking = false;
        campaignLoop.setKnightShieldBlocking(false);
        if (st.actionState === 'block') {
          st.actionState = null;
          st.actionTimer = 0;
        }
        playHeroLocomotionClip(st, 'idle');
      } else if (msg.action === 'dash') {
        const dashClip =
          pickHeroClip(st, msg.clip, 'Dodge_Forward', 'Dodge_Backward', 'dash') || 'dash';
        const dur = msg.dashDuration || (role === 'Knight' ? 0.44 : 0.38);
        st.dashDirX = typeof msg.dashDirX === 'number' ? msg.dashDirX : Math.sin(st.yaw);
        st.dashDirZ = typeof msg.dashDirZ === 'number' ? msg.dashDirZ : Math.cos(st.yaw);
        st.dashDuration = dur;
        startOneShotAction(st, dashClip, dur, {
          startTime: 0,
          timeScale: role === 'Knight' ? 1.85 : 1.45,
          fade: 0.05,
        });
        st.actionState = 'dash';
      } else if (
        msg.action === 'mage_attack1' ||
        msg.action === 'mage_attack2' ||
        msg.action === 'mage_attack3' ||
        msg.action === 'mage_heavy'
      ) {
        const cIdx =
          msg.action === 'mage_heavy'
            ? 3
            : msg.action === 'mage_attack3'
              ? 2
              : msg.action === 'mage_attack2'
                ? 1
                : 0;
        startOneShotAction(st, msg.action === 'mage_heavy' ? 'cast_spell' : msg.action, 0.52, {
          startTime: 0,
          timeScale: 1.0,
          fade: 0.07,
        });
        if (cIdx === 3) {
          campaignLoop.castSpell('shatterlance', st, msg.yaw ?? st.yaw, heroStates.Knight, {
            ignoreCooldown: true,
            remoteVisualOnly: true,
          });
        } else {
          campaignLoop.performMageBoltAttack(cIdx, st, heroStates.Knight, {
            remoteVisualOnly: true,
          });
        }
      } else if (msg.action === 'skill') {
        if (role === 'Knight') {
          const el = msg.element || st.selectedElement || 'ice';
          st.selectedElement = el;
          campaignLoop.combatHeroes.Knight.selectedElement = el;
          const res = campaignLoop.performPartnerSkill('Knight', heroStates, {
            element: el,
            remoteVisualOnly: true,
          });
          const eClip =
            pickHeroClip(st, 'Melee_1H_Attack_Slice_Diagonal', 'combo2') || 'combo1';
          startOneShotAction(st, eClip, 0.68, {
            startTime: 0,
            timeScale: 1.35,
            fade: 0.07,
          });
          const bStyle = res?.breathingStyle || (el === 'fire' ? 'solar' : 'lunar');
          vfxKit.swordVfx.triggerSwing('combo2', st, st.yaw, bStyle);
          vfxKit.ultimateVfx?.playDragonSlash?.(
            { x: st.x, y: st.y, z: st.z },
            { yaw: st.yaw, style: bStyle, duration: 0.72 }
          );
        } else {
          campaignLoop.performPartnerSkill('Mage', heroStates, {
            spellId: msg.spellId || st.selectedSpell,
            yaw: msg.yaw ?? st.yaw,
            distance: msg.distance,
            targetPos: msg.targetPos,
            remoteVisualOnly: true,
          });
        }
      } else if (msg.action === 'ultimate') {
        if (role === 'Knight') {
          const spinClip =
            pickHeroClip(
              st,
              'Melee_2H_Attack_Spinning',
              'Melee_2H_Attack_Spin',
              'charged'
            ) || 'charged';
          startOneShotAction(st, spinClip, 0.56, {
            startTime: 0,
            timeScale: 1.55,
            fade: 0.06,
          });
          campaignLoop.performKnightUltimate(heroStates, {
            requireEnergy: false,
            remoteVisualOnly: true,
          });
        } else {
          startOneShotAction(st, 'burst_aoe', 0.8, {
            startTime: 0,
            timeScale: 1.0,
            fade: 0.08,
          });
          campaignLoop.performMageStormCataclysm(heroStates, {
            requireEnergy: false,
            remoteVisualOnly: true,
          });
        }
      }
    },
    onEnemyHit: (msg) => {
      const st = coopClient.getState();
      if (st.peerConnected && !st.isHost) return;
      const hitRes = campaignLoop.applyRemoteEnemyHit(msg, heroStates);
      if (hitRes?.accepted) {
        if (hitRes.detonation) {
          coopClient.sendActionEvent({
            role: msg.attackerRole || 'Mage',
            action: 'detonation',
            label: hitRes.detonation.label,
            bonusDmg: hitRes.detonation.bonusDmg,
          });
        }
        coopClient.sendWorldSync(buildWorldSyncPayload(), true);
        onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
      }
    },
    onWorldSync: (msg) => {
      const st = coopClient.getState();
      if (st.peerConnected && st.isHost) return;
      ensureCombatUnfrozen();
      campaignLoop.applyRemoteStateSync(msg, heroStates);
    },
    onElementToggle: (msg) => {
      handleRemoteElementToggle(msg);
    },
    onAimState: (msg) => {
      handleRemoteAimState(msg);
    },
    onRevivePartner: (msg) => {
      handleRemoteRevivePartner(msg);
    },
    onSnapshotRequest: () => {
      const st = coopClient.getState();
      if (!st.peerConnected || st.isHost) {
        const snap = buildWorldSyncPayload();
        if (typeof coopClient.sendFullSnapshot === 'function') {
          coopClient.sendFullSnapshot(snap);
        } else {
          coopClient.sendWorldSync(snap, true);
        }
      }
    },
    onFullSnapshot: (msg) => {
      const st = coopClient.getState();
      if (st.peerConnected && st.isHost) return;
      ensureCombatUnfrozen();
      const snap = msg?.snapshot || msg;
      campaignLoop.applyRemoteStateSync(snap, heroStates);
    },
    onCommuneState: (msg) => {
      const peerSpeaker = msg.speakerRole || msg.fromRole || partnerHeroId;
      if (msg.state === 'channel') {
        startCommuneChannel(peerSpeaker, { broadcast: false, force: true });
      } else if (msg.state === 'suspense') {
        setCommuneSuspense(msg.active !== false, { broadcast: false });
      } else if (msg.state === 'cancel') {
        cancelCommuneChannel({ broadcast: false });
      }
    },
    onCommuneVerdict: async (msg) => {
      if (communeChannel.localInitiated || Date.now() - lastAppliedVerdictAt < 2500) return;
      const judgment = msg.judgment || msg;
      const speakerRole = msg.speakerRole || msg.fromRole || partnerHeroId;
      if (onRemoteCommuneVerdict) {
        await onRemoteCommuneVerdict(judgment, speakerRole);
      }
      applyCommuneVerdict(judgment, speakerRole);
    },
  });

  const player = {
    x: initialPos.x,
    z: initialPos.z,
    y: walkableHeightAt(initialPos.x, initialPos.z),
    vy: 0,
    yaw: initialPos.yaw,
    speed: 7.5,
    sprintMult: 1.55,
    radius: 0.48,
    grounded: true,
    get activeHeroId() {
      return activeHeroId;
    },
    get partnerHeroId() {
      return partnerHeroId;
    },
  };

  function syncSharedPlayerFromLeader() {
    const leader = heroStates[activeHeroId];
    player.x = leader.x;
    player.y = leader.y;
    player.z = leader.z;
    player.vy = leader.vy;
    player.yaw = leader.yaw;
    player.grounded = leader.grounded;
  }

  function applyTransform(st) {
    const levY = vfxKit?.artoriousVfx ? vfxKit.artoriousVfx.getHeroLevitationOffset(st.id) : 0.0;
    st.char.group.position.set(st.x, st.y + levY, st.z);
    st.char.group.rotation.y = st.yaw;
  }

  function playHeroLocomotionClip(st, nextLoco) {
    if (st.actionState) return;
    const isOnce = nextLoco === 'jump_start' || nextLoco === 'jump_land';
    const curAct = st.char.anim?.rawActions?.get(st.char.anim?.currentClipName);
    const actHealthy =
      Boolean(curAct && curAct.isRunning()) &&
      (isOnce || curAct.loop === THREE.LoopRepeat);
    if (st.locomotionState === nextLoco && st.char.anim.currentKey === nextLoco && actHealthy) {
      return;
    }
    st.locomotionState = nextLoco;
    st.char.play(nextLoco, {
      loop: !isOnce,
      fade: isOnce ? 0.08 : 0.14,
      startTime: 0,
      timeScale: nextLoco === 'sprint' ? 1.22 : 1.0,
      force: !actHealthy,
    });
  }

  function startOneShotAction(
    st,
    clipKey,
    duration,
    { startTime = 0, timeScale = 1.0, fade = 0.07 } = {}
  ) {
    st.actionState = clipKey;
    st.actionTimer = duration;
    st.char.play(clipKey, {
      loop: false,
      fade,
      startTime,
      timeScale,
      force: true,
    });
  }

  function ensureCombatUnfrozen() {
    if (enemyManager.frozenShotId) {
      enemyManager.setFrozenForShot(null);
    }
    sanctuarySteleMesh.visible = true;
    campaignLoop.setIndicatorsHiddenForShot(false, heroStates);
  }

  // Stone-progression gate shared by desktop keys and touch. Defaults to fully
  // unlocked so offline/dev sessions without room progression stay playable.
  let unlockedStage = 3;
  let manualStageSet = false;
  const STAGE_FOR_ABILITY = { skillE: 1, spell: 1, tabToggle: 2, ultimateQ: 3 };
  function setUnlockedStage(stage) {
    manualStageSet = true;
    unlockedStage = Math.max(0, Math.min(3, Math.floor(Number(stage) || 0)));
  }
  function isAbilityUnlocked(kind) {
    const req = STAGE_FOR_ABILITY[kind] ?? 0;
    const effStage = manualStageSet
      ? unlockedStage
      : typeof campaignLoop?.getUnlockedStage === 'function'
        ? Number(campaignLoop.getUnlockedStage())
        : unlockedStage;
    return effStage >= req;
  }

  function triggerSpell(slotOrId, options = {}) {
    ensureCombatUnfrozen();
    if (isPlayerControlLocked()) {
      return { blockedByControlLock: true };
    }
    if (!isAbilityUnlocked('spell')) return { locked: true };
    const spell =
      typeof slotOrId === 'number'
        ? SPELL_BY_SLOT[slotOrId]
        : SPELLS[slotOrId] || SPELL_BY_SLOT[Number(slotOrId)] || SPELLS.frost_lance;
    if (!spell) return null;

    const mageState = heroStates.Mage;
    const knightState = heroStates.Knight;
    const leader = heroStates[activeHeroId];

    const softTarget =
      leader.id === 'Mage'
        ? mageSoftLock(leader, spell.range, leader.yaw)
        : selectSoftLockTarget(leader, leader.yaw, enemyManager.activeEnemies, {
            maxRange: spell.range,
            partnerPos: knightState,
          });

    let aimYaw = options.yaw ?? leader.yaw;
    if (softTarget && options.yaw === undefined) {
      aimYaw = Math.atan2(softTarget.x - mageState.x, softTarget.z - mageState.z);
    }

    const res = campaignLoop.castSpell(spell.id, mageState, aimYaw, knightState, options);
    if (!res || res.onCooldown) return res;

    mageState.yaw = res.targetYaw ?? aimYaw;
    applyTransform(mageState);
    const castClip =
      spell.slot === 2 || spell.slot === 4
        ? pickHeroClip(mageState, 'Ranged_Magic_Shoot', 'cast_shoot')
        : pickHeroClip(mageState, 'Ranged_1H_Shoot', 'cast_spell');
    startOneShotAction(mageState, castClip || 'cast_spell', 0.62, {
      startTime: 0,
      timeScale: 1.0,
      fade: 0.08,
    });

    coopClient.sendSpellCast({
      spellId: spell.id,
      origin: { x: mageState.x, y: mageState.y, z: mageState.z },
      yaw: mageState.yaw,
      distance: res.distance,
      targetPos: res.targetPos,
    });

    onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
    return res;
  }

  function launchMageFrostLance() {
    return triggerSpell(1);
  }

  function advanceHeroStep(st, dist) {
    if (!dist || dist <= 0) return;
    const fx = Math.sin(st.yaw);
    const fz = Math.cos(st.yaw);
    let next = resolveCollisions(st.x + fx * dist, st.z + fz * dist, player.radius);
    if (campaignLoop.currentActId === 'act3_shrine' || next.z < -68.0) {
      const shr = resolveShrineObstacles(
        next.x,
        next.z,
        player.radius,
        campaignLoop.currentActId === 'act3_shrine'
      );
      next = { ...next, x: shr.x, z: shr.z };
    }
    st.x = next.x;
    st.z = next.z;
    if (st.grounded) {
      st.y = walkableHeightAt(st.x, st.z);
    }
  }

  function toggleElement(heroId = activeHeroId) {
    if (isPlayerControlLocked()) return { blockedByControlLock: true };
    if (!isAbilityUnlocked('tabToggle')) return { locked: true };
    return actionAim.toggleElement(heroId);
  }

  function startSkillAim(opts = {}) {
    if (isPlayerControlLocked()) return { blockedByControlLock: true };
    const mageState = heroStates.Mage;
    const chosenSpell = opts.spellId || mageState.selectedSpell || 'frost_lance';
    if (chosenSpell !== 'shatterlance' && !isAbilityUnlocked('skillE')) return { locked: true };
    if (typeof opts.camYaw === 'number') lastKnownCamYaw = opts.camYaw;
    if (typeof opts.camPitch === 'number') lastKnownCamPitch = opts.camPitch;
    const useTouchCompose = opts.source === 'touch' && Boolean(opts.touch);
    const legacyParams =
      !useTouchCompose &&
      (opts.yaw !== undefined || opts.distance !== undefined || opts.touchTarget || opts.origin);
    if (legacyParams) {
      // Camera-driven (over-the-shoulder) aim OR explicit yaw/distance hold aim:
      if (mageRt.pendingCast) return { busy: true };
      mageRt.composeAim = false;
      mageRt.recoveryOpen = false;
      mageRt.aimSource = opts.source || (currentProfile === 'tablet' ? 'touch' : 'desktop');
      mageRt.touch = null;
      mageRt.aimTarget = null;
      mageRt.lockedViaTouchStart = false;
      mageRt.manualDragMoved = false;
      mageRt.initialTouchCamYaw = opts.yaw ?? lastKnownCamYaw;
      mageRt.initialTouchDist = opts.distance ?? 14.5;
      if (chosenSpell === 'shatterlance') {
        beginShatterlanceHoldVisuals(mageState);
      }

      const originPos = opts.origin || { x: mageState.x, y: mageState.y, z: mageState.z };
      let initYaw = opts.yaw ?? mageState.yaw;
      let initDistance = opts.distance;
      let initLockState = opts.lockState || 'free';
      let initLockTargetId = opts.lockTargetId || null;

      // On touch / tablet hold (including Hold Attack Shatterlance with minimal drag),
      // soft-lock cleanly onto an in-range enemy in front so parabolic AimArrow snaps on press.
      if (mageRt.aimSource === 'touch' && !opts.touchTarget) {
        const softRange =
          chosenSpell === 'cinder_fall' || chosenSpell === 'shatterlance' ? 16.0 : 14.5;
        const softTarget = mageSoftLock(mageState, softRange, initYaw);
        if (softTarget) {
          const dx = softTarget.x - originPos.x;
          const dz = softTarget.z - originPos.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.6) {
            initYaw = Math.atan2(dx, dz);
            if (chosenSpell === 'shatterlance') {
              initDistance = clamp(d, 0.8, 18.0);
            } else if (chosenSpell === 'cinder_fall') {
              initDistance = clamp(d, 3.0, 16.0);
            } else {
              initDistance = 14.5;
            }
            initLockState = 'locked';
            initLockTargetId = softTarget.instanceId ?? softTarget.id ?? null;
            mageRt.aimTarget = softTarget;
            mageRt.lockedViaTouchStart = true;
          }
        }
      }

      return actionAim.startSkillAim({
        origin: originPos,
        yaw: initYaw,
        pitch: opts.pitch ?? lastKnownCamPitch,
        distance: initDistance,
        touchTarget: opts.touchTarget,
        spellId: chosenSpell,
        lockState: initLockState,
        lockTargetId: initLockTargetId,
      });
    }
    // One E at a time: the previous cast still has to reach its release frame.
    if (mageRt.pendingCast) return { busy: true };
    mageRt.composeAim = true;
    mageRt.aimSource = opts.source || (opts.touch ? 'touch' : 'desktop');
    mageRt.touch =
      opts.touch ||
      (mageRt.aimSource === 'touch'
        ? { dx: 0, dy: 0, overButton: false, leftButton: false }
        : null);
    mageRt.aimTarget = null;
    mageRt.autoYaw = mageState.yaw;
    mageRt.lockedViaTouchStart = false;
    mageRt.manualDragMoved = false;
    const softRange = chosenSpell === 'cinder_fall' || chosenSpell === 'shatterlance' ? 16.0 : 14.5;
    mageRt.autoTarget =
      mageRt.aimSource === 'desktop'
        ? null
        : mageSoftLock(mageState, softRange, mageAimRayYaw(mageState));
    if (chosenSpell === 'shatterlance') {
      beginShatterlanceHoldVisuals(mageState);
    } else if (mageRt.recoveryOpen && actionAim.cancelRecovery('Mage').cancelled) {
      // Raising the staff to aim may cut an already-released attack's recovery.
      mageState.actionState = null;
      mageState.actionTimer = 0;
    }
    if (actionAim.aimState) actionAim.aimState.spellId = chosenSpell;
    return refreshMageSkillAim(true);
  }

  function updateSkillAim(opts = {}) {
    if (typeof opts?.camYaw === 'number') lastKnownCamYaw = opts.camYaw;
    if (typeof opts?.camPitch === 'number') lastKnownCamPitch = opts.camPitch;
    if (opts && (opts.touch || opts.source === 'touch')) {
      const hasTouchPayload = Boolean(opts.touch);
      if (hasTouchPayload) {
        mageRt.composeAim = true;
        mageRt.aimSource = 'touch';
        mageRt.touch = opts.touch;
      } else {
        mageRt.aimSource = 'touch';
      }
      if (mageRt.composeAim || hasTouchPayload) {
        if (!actionAim.aimState.active) {
          if (isPlayerControlLocked() || mageRt.pendingCast) {
            return { ...actionAim.aimState };
          }
          const mageState = heroStates.Mage;
          const chosenSpell = opts.spellId || mageState.selectedSpell || 'frost_lance';
          if (chosenSpell !== 'shatterlance' && !isAbilityUnlocked('skillE')) {
            return { locked: true };
          }
          mageRt.aimTarget = null;
          mageRt.autoYaw = mageState.yaw;
          mageRt.lockedViaTouchStart = false;
          mageRt.manualDragMoved = false;
          const softRange =
            chosenSpell === 'cinder_fall' || chosenSpell === 'shatterlance' ? 16.0 : 14.5;
          mageRt.autoTarget = mageSoftLock(mageState, softRange, mageAimRayYaw(mageState));
          if (chosenSpell === 'shatterlance') {
            beginShatterlanceHoldVisuals(mageState);
          } else if (mageRt.recoveryOpen && actionAim.cancelRecovery('Mage').cancelled) {
            mageState.actionState = null;
            mageState.actionTimer = 0;
          }
          if (actionAim.aimState) actionAim.aimState.spellId = chosenSpell;
          return refreshMageSkillAim(true);
        }
        if (opts.spellId && actionAim.aimState) {
          actionAim.aimState.spellId = opts.spellId;
        }
        return refreshMageSkillAim(false);
      }
    }
    if (!actionAim.aimState.active && !isPlayerControlLocked() && !mageRt.pendingCast) {
      if (opts.yaw !== undefined || opts.distance !== undefined || opts.origin || opts.touchTarget) {
        return startSkillAim(opts);
      }
    }
    if (
      mageRt.composeAim &&
      actionAim.aimState.active &&
      opts.yaw === undefined &&
      opts.distance === undefined &&
      !opts.origin &&
      !opts.touchTarget
    ) {
      return refreshMageSkillAim(false);
    }
    if (mageRt.lockedViaTouchStart) {
      const yawChanged =
        opts.yaw !== undefined &&
        Math.abs(shortestAngleDiff(opts.yaw, mageRt.initialTouchCamYaw ?? opts.yaw)) > 0.025;
      const distChanged =
        opts.distance !== undefined &&
        Math.abs(Number(opts.distance) - Number(mageRt.initialTouchDist ?? opts.distance)) > 0.35;
      if (yawChanged || distChanged || opts.touchTarget) {
        mageRt.lockedViaTouchStart = false;
        mageRt.manualDragMoved = true;
        mageRt.aimTarget = null;
      } else if (opts.yaw !== undefined && !mageRt.manualDragMoved) {
        const { yaw: _y, distance: _d, ...restOpts } = opts;
        return actionAim.updateSkillAim(restOpts);
      }
    }
    return actionAim.updateSkillAim(opts);
  }

  function releaseSkillAim(opts = null) {
    if (isPlayerControlLocked()) {
      mageRt.lockedViaTouchStart = false;
      mageRt.manualDragMoved = false;
      mageRt.aimTarget = null;
      actionAim.cancelSkillAim();
      return { blockedByControlLock: true };
    }
    if (typeof opts?.camYaw === 'number') lastKnownCamYaw = opts.camYaw;
    if (typeof opts?.camPitch === 'number') lastKnownCamPitch = opts.camPitch;
    if (opts && opts.touch) {
      mageRt.aimSource = 'touch';
      mageRt.touch = opts.touch;
      mageRt.lockedViaTouchStart = false;
      mageRt.manualDragMoved = false;
      if (actionAim.aimState.active) refreshMageSkillAim();
      return actionAim.releaseSkillAim();
    }
    if (mageRt.composeAim && actionAim.aimState.active && (!opts || opts.distance === undefined)) {
      refreshMageSkillAim();
      mageRt.lockedViaTouchStart = false;
      mageRt.manualDragMoved = false;
      return actionAim.releaseSkillAim();
    }
    const preserveTouchLock = Boolean(
      mageRt.lockedViaTouchStart &&
        !mageRt.manualDragMoved &&
        actionAim.aimState.lockState === 'locked'
    );
    mageRt.lockedViaTouchStart = false;
    mageRt.manualDragMoved = false;
    if (preserveTouchLock) {
      return actionAim.releaseSkillAim(null);
    }
    const hasLegacy = opts && (opts.yaw !== undefined || opts.distance !== undefined || opts.touchTarget);
    return actionAim.releaseSkillAim(hasLegacy ? opts : null);
  }

  function triggerAction(actionType, actionOptions = {}) {
    ensureCombatUnfrozen();
    const leader = heroStates[activeHeroId];
    const partner = heroStates[partnerHeroId];

    // 100% Control Lockout during Prayer, 2.5s Blessing/Resurrection, and 2.8s Smite
    if (isPlayerControlLocked()) {
      return { blockedByControlLock: true };
    }

    // Disallow actions only during Mage's 0.8s Sky Meteor Shower cast pose (she is freely mobile after 0.8s!)
    if (
      leader.id === 'Mage' &&
      campaignLoop.combatHeroes.Mage.stormCataclysmCastTimer > 0 &&
      actionType !== 'toggleElement'
    ) {
      return { blockedByStormCataclysm: true };
    }

    if (actionType === 'toggleElement' || actionType === 'toggle_element' || actionType === 'tab') {
      return toggleElement(actionOptions.heroId || activeHeroId);
    }
    if (actionType === 'skill' && !isAbilityUnlocked('skillE')) return { locked: true };
    if (actionType === 'ultimate' && !isAbilityUnlocked('ultimateQ')) return { locked: true };

    if (actionType === 'skillAimStart' || actionType === 'skill_aim_start') {
      if (activeHeroId === 'Mage') {
        return startSkillAim(actionOptions);
      }
      return triggerAction('skill', actionOptions);
    }

    if (actionType === 'skillAimRelease' || actionType === 'skill_aim_release') {
      if (activeHeroId === 'Mage') {
        return releaseSkillAim(actionOptions);
      }
      return null;
    }

    if (actionType === 'shatterlance_aim_start') {
      if (activeHeroId === 'Mage') {
        return startSkillAim({
          ...actionOptions,
          spellId: 'shatterlance',
          distance: actionOptions.distance,
        });
      }
      return null;
    }

    if (actionType === 'shatterlance_aim_release') {
      if (
        activeHeroId === 'Mage' &&
        actionAim.aimState.active &&
        actionAim.aimState.spellId === 'shatterlance'
      ) {
        return releaseSkillAim(actionOptions);
      }
      return null;
    }

    if (
      actionType === 'shield_block_end' ||
      actionType === 'heavy_release' ||
      actionType === 'release_heavy'
    ) {
      return actionAim.releaseHeavy(activeHeroId);
    }

    if (actionType === 'jump') {
      if (leader.grounded) {
        if (leader.id === 'Knight' && leader.shieldBlocking) {
          actionAim.releaseHeavy('Knight');
        }
        actionAim.cancelSwing(leader.id);
        if (leader.id === 'Knight') {
          vfxKit.swordVfx?.endSwing?.();
        }
        leader.lungeRemaining = 0;
        leader.vy = 7.4;
        leader.grounded = false;
        leader.actionState = null;
        leader.actionTimer = 0;
        playHeroLocomotionClip(leader, 'jump_start');
      }
      return;
    }

    if (actionType === 'dash') {
      const dashHero = campaignLoop.combatHeroes[activeHeroId];
      if (leader.id === 'Knight' && leader.shieldBlocking) {
        actionAim.releaseHeavy('Knight');
      }

      const refYaw =
        typeof actionOptions?.camYaw === 'number'
          ? actionOptions.camYaw
          : typeof lastKnownCamYaw === 'number'
            ? lastKnownCamYaw
            : leader.yaw;
      let chosenDodgeYaw = null;
      if (typeof actionOptions?.dodgeYaw === 'number' && Number.isFinite(actionOptions.dodgeYaw)) {
        chosenDodgeYaw = actionOptions.dodgeYaw;
      } else if (
        typeof actionOptions?.swipeDx === 'number' &&
        typeof actionOptions?.swipeDy === 'number' &&
        Math.hypot(actionOptions.swipeDx, actionOptions.swipeDy) > 1e-3
      ) {
        const sLen = Math.hypot(actionOptions.swipeDx, actionOptions.swipeDy) || 1;
        const fwd = -actionOptions.swipeDy / sLen;
        const right = actionOptions.swipeDx / sLen;
        const fx = Math.sin(refYaw);
        const fz = Math.cos(refYaw);
        const rx = -fz;
        const rz = fx;
        const wx = fx * fwd + rx * right;
        const wz = fz * fwd + rz * right;
        chosenDodgeYaw = Math.atan2(wx, wz);
      } else if (leader.moveInputYaw !== null && leader.moveInputYaw !== undefined) {
        chosenDodgeYaw = leader.moveInputYaw;
      }

      if (leader.actionState === 'dash') {
        if (actionOptions?.steerActiveDash && chosenDodgeYaw !== null) {
          leader.dashDirX = Math.sin(chosenDodgeYaw);
          leader.dashDirZ = Math.cos(chosenDodgeYaw);
          const rel = shortestAngleDiff(chosenDodgeYaw, refYaw);
          if (Math.abs(rel) < Math.PI * 0.28) {
            leader.yaw = chosenDodgeYaw;
          }
          return { steered: true };
        }
        return { onDashCooldown: true };
      }
      if (dashHero.downed || dashHero.dashCd > 0) {
        return { blocked: true, cooldown: dashHero.dashCd };
      }

      let dodgeClip = 'dash';
      if (leader.id === 'Mage') {
        // If Mage is holding Shatterlance or skill aim, Dodge immediately aborts the charge/aim!
        if (actionAim.aimState.active) {
          actionAim.cancelSkillAim();
          actionAim.cancelSwing('Mage');
          vfxKit?.shatterlance?.cancelCharge?.();
          combatSfx?.cancelSpellCharge?.('shatterlance');
          mageRt.pendingCast = null;
          mageRt.queuedDash = false;
          mageRt.dashAfterRelease = false;
          mageRt.recoveryOpen = false;
          mageRt.chargedSwap = null;
          mageRt.lockedViaTouchStart = false;
          mageRt.manualDragMoved = false;
          mageRt.aimTarget = null;
        } else if (actionAim.isInReleaseWindup('Mage') || mageRt.pendingCast) {
          // Dash never eats a normal bolt/skill release frame: queue it through the wind-up, then cut recovery.
          mageRt.queuedDash = true;
          return { queued: true };
        }
        actionAim.cancelRecovery('Mage');
        mageRt.recoveryOpen = false;
        mageRt.chargedSwap = null;
        if (chosenDodgeYaw !== null) {
          const baseYaw = actionAim.aimState.active ? leader.yaw : refYaw;
          const rel = shortestAngleDiff(chosenDodgeYaw, baseYaw);
          const a = Math.abs(rel);
          const key =
            a < Math.PI * 0.28
              ? 'Dodge_Forward'
              : a > Math.PI * 0.72
                ? 'Dodge_Backward'
                : rel > 0
                  ? 'Dodge_Left'
                  : 'Dodge_Right';
          dodgeClip = pickHeroClip(leader, key, 'dash') || 'dash';
          leader.dashDirX = Math.sin(chosenDodgeYaw);
          leader.dashDirZ = Math.cos(chosenDodgeYaw);
          if (!actionAim.aimState.active) {
            leader.yaw = key === 'Dodge_Forward' ? chosenDodgeYaw : refYaw;
          }
        } else {
          dodgeClip = pickHeroClip(leader, 'Dodge_Backward', 'dash') || 'dash';
          leader.dashDirX = -Math.sin(leader.yaw);
          leader.dashDirZ = -Math.cos(leader.yaw);
        }
        leader.dashDuration = 0.38;
        startOneShotAction(leader, dodgeClip, 0.38, {
          startTime: 0.02,
          timeScale: 1.45,
          fade: 0.05,
        });
        leader.actionState = 'dash';
      } else {
        actionAim.cancelSwing('Knight');
        vfxKit.swordVfx?.endSwing?.();
        leader.lungeRemaining = 0;
        knightRt.recoveryOpen = false;
        knightRt.pendingUltSlam = 0;
        knightRt.pendingUltCross2 = 0;
        if (chosenDodgeYaw !== null) {
          const rel = shortestAngleDiff(chosenDodgeYaw, refYaw);
          const a = Math.abs(rel);
          const key =
            a < Math.PI * 0.28
              ? 'Dodge_Forward'
              : a > Math.PI * 0.72
                ? 'Dodge_Backward'
                : rel > 0
                  ? 'Dodge_Left'
                  : 'Dodge_Right';
          dodgeClip = pickHeroClip(leader, key, 'dash') || 'dash';
          leader.dashDirX = Math.sin(chosenDodgeYaw);
          leader.dashDirZ = Math.cos(chosenDodgeYaw);
          if (key === 'Dodge_Forward') {
            leader.yaw = chosenDodgeYaw;
          } else {
            leader.yaw = refYaw;
          }
        } else {
          dodgeClip = pickHeroClip(leader, 'Dodge_Forward', 'dash') || 'dash';
          leader.dashDirX = Math.sin(leader.yaw);
          leader.dashDirZ = Math.cos(leader.yaw);
        }
        leader.dashDuration = 0.44;
        startOneShotAction(leader, dodgeClip, 0.44, {
          startTime: 0,
          timeScale: 1.85,
          fade: 0.05,
        });
        leader.actionState = 'dash';
      }
      dashHero.iframeTimer = DASH_IFRAMES;
      dashHero.dashCd = DASH_COOLDOWN;

      const dodgeRes = dashHero.dodgeIcd > 0 ? { triggered: false } : enemyManager.checkPerfectDodge(leader);
      if (dodgeRes.triggered) {
        campaignLoop.awardPerfectDodgeEnergy?.(activeHeroId);
        dashHero.dodgeIcd = PERFECT_DODGE_ICD;
        dashHero.perfectDodgeBuff = true;
        campaignLoop.addResonance(dodgeRes.resonanceGain || 20);
        combatSfx.playPerfectDodge(activeHeroId);
        onBanner?.({
          title: 'PERFECT DODGE · TIME DILATION',
          subtitle: 'Attacker Slowed to 0.30× · +12 Q Energy · Next Strike Empowered (+35% DMG)',
          kind: 'blessing',
        });
      } else {
        combatSfx?.playDodge?.(activeHeroId);
      }
      coopClient.sendActionEvent({
        role: activeHeroId,
        action: 'dash',
        clip: dodgeClip,
        dashDirX: leader.dashDirX,
        dashDirZ: leader.dashDirZ,
        dashDuration: leader.dashDuration,
        x: leader.x,
        y: leader.y,
        z: leader.z,
        yaw: leader.yaw,
      });
      onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
      return;
    }

    if (actionType === 'attack' || actionType === 'shield_bash') {
      if (
        leader.id === 'Knight' &&
        (actionType === 'shield_bash' ||
          (leader.shieldBlocking && (knightRt.shieldHoldElapsed || 0) >= 0.08))
      ) {
        if (leader.shieldBlocking) {
          actionAim.releaseHeavy('Knight');
        }
        combatSfx?.playShieldBlock?.('bash');
        const bashClip =
          pickHeroClip(leader, 'Melee_Block_Attack', 'Melee_1H_Attack_Chop', 'combo1') || 'combo1';
        startOneShotAction(leader, bashClip, 0.42, {
          startTime: 0,
          timeScale: 1.45,
          fade: 0.05,
        });
        leader.lungeRemaining = 0.48;
        leader.lungeDuration = 0.16;
        const bashRes = campaignLoop.performKnightSwing(
          'combo1',
          leader,
          leader.yaw,
          partner,
          { skipTriggerSwing: false }
        );
        syncSharedPlayerFromLeader();
        onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
        return { shieldBash: true, ...bashRes };
      }
      const res = actionAim.pressAttack(leader.id);
      leader.bufferedAttack = res.bufferedAttack;
      leader.mashTimeScale = res.mashTimeScale;
      syncSharedPlayerFromLeader();
      onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
      return res;
    }

    if (
      actionType === 'heavy' ||
      actionType === 'charged' ||
      actionType === 'shield_block'
    ) {
      const res = actionAim.pressHeavy(leader.id);
      if (leader.id === 'Mage') {
        leader.consecutiveChargedCount = res.consecutiveChargedCount;
        campaignLoop.combatHeroes.Mage.consecutiveChargedCount =
          res.consecutiveChargedCount;
      }
      syncSharedPlayerFromLeader();
      onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
      return res;
    }

    if (actionType === 'skill') {
      if (activeHeroId === 'Knight') {
        if (leader.shieldBlocking) {
          actionAim.releaseHeavy('Knight');
        }
        actionAim.cancelSwing('Knight');
        knightRt.recoveryOpen = false;
        const res = campaignLoop.performPartnerSkill('Knight', heroStates, actionOptions);
        if (res && !res.onCooldown) {
          const eClip =
            pickHeroClip(leader, 'Melee_1H_Attack_Slice_Diagonal', 'combo2') || 'combo1';
          startOneShotAction(leader, eClip, 0.68, {
            startTime: 0,
            timeScale: 1.35,
            fade: 0.07,
          });
          applyTransform(leader);
          leader.char.update(0);
          vfxKit.swordVfx.triggerSwing(
            'combo2',
            leader,
            leader.yaw,
            campaignLoop.combatHeroes.Knight.breathingStyle
          );
          vfxKit.ultimateVfx?.playDragonSlash?.(
            { x: leader.x, y: leader.y, z: leader.z },
            {
              yaw: leader.yaw,
              style: campaignLoop.combatHeroes.Knight.breathingStyle || 'solar',
              duration: 0.72,
            }
          );
          onBanner?.({
            title:
              res.element === 'fire'
                ? 'POWER SWORD · HINOKAMI SUNFIRE (13s)'
                : 'POWER SWORD · GLACIAL TIDE (13s)',
            subtitle:
              res.element === 'fire'
                ? `13.0s Active / ${res.totalCooldown}s CD (${res.downtime}s Downtime) · Bonus Fire Strike + Burn DoT`
                : `13.0s Active / ${res.totalCooldown}s CD (${res.downtime}s Downtime) · Slows Enemy Speed, Attack & Damage`,
            kind: 'blessing',
          });
          coopClient.sendActionEvent({
            role: 'Knight',
            action: 'skill',
            element: res.element,
            breathingStyle: campaignLoop.combatHeroes.Knight.breathingStyle,
            x: leader.x,
            y: leader.y,
            z: leader.z,
            yaw: leader.yaw,
          });
        }
        syncSharedPlayerFromLeader();
        onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
        return res;
      }

      // Mage E: if already aiming, release; otherwise cast immediately at default/soft-lock range
      if (actionAim.aimState.active) {
        return releaseSkillAim(actionOptions);
      }
      // Quick-cast: auto-snap onto the soft-lock target, then release.
      startSkillAim({ source: 'auto', ...actionOptions });
      return releaseSkillAim(actionOptions);
    }

    if (actionType === 'ultimate') {
      if (activeHeroId === 'Knight') {
        if (leader.shieldBlocking) {
          actionAim.releaseHeavy('Knight');
        }
        actionAim.cancelSwing('Knight');
        knightRt.recoveryOpen = false;
        vfxKit.swordVfx?.endSwing?.();
        const softTarget = selectSoftLockTarget(
          heroStates.Knight,
          heroStates.Knight.yaw,
          enemyManager.activeEnemies,
          { maxRange: 7.5, partnerPos: heroStates.Mage }
        );
        if (
          softTarget &&
          !campaignLoop.combatHeroes.Knight.downed &&
          campaignLoop.combatHeroes.Knight.ultCd <= 0.05 &&
          campaignLoop.combatHeroes.Knight.qEnergy >= campaignLoop.combatHeroes.Knight.qEnergyMax
        ) {
          heroStates.Knight.yaw = Math.atan2(
            softTarget.x - heroStates.Knight.x,
            softTarget.z - heroStates.Knight.z
          );
          player.yaw = heroStates.Knight.yaw;
          applyTransform(heroStates.Knight);
        }
        const res = campaignLoop.performKnightUltimate(heroStates, { requireEnergy: true });
        if (res && !res.onCooldown && !res.notEnoughEnergy) {
          if (softTarget) {
            heroStates.Knight.yaw = Math.atan2(
              softTarget.x - heroStates.Knight.x,
              softTarget.z - heroStates.Knight.z
            );
            player.yaw = heroStates.Knight.yaw;
            applyTransform(heroStates.Knight);
          }
          const spinClip =
            pickHeroClip(
              heroStates.Knight,
              'Melee_2H_Attack_Spinning',
              'Melee_2H_Attack_Spin',
              'charged'
            ) || 'charged';
          startOneShotAction(heroStates.Knight, spinClip, 0.38, {
            startTime: 0,
            timeScale: 1.55,
            fade: 0.06,
          });
          knightRt.pendingUltSlam = 0.38;
          knightRt.pendingUltCross2 = 0.70;
          triggerCameraImpulse({
            intensity: 0.24,
            dirX: Math.sin(leader.yaw),
            dirZ: Math.cos(leader.yaw),
            fovKick: 2.0,
            kind: 'cataclysm',
          });
          coopClient.sendActionEvent({
            role: 'Knight',
            action: 'ultimate',
            x: leader.x,
            y: leader.y,
            z: leader.z,
          });
          syncSharedPlayerFromLeader();
          onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
        }
        return res;
      }

      // Mage Q: 6.0s Sky Meteor Shower (0.8s cast pose, then freely mobile!)
      const res = campaignLoop.performMageStormCataclysm(heroStates, { requireEnergy: true });
      if (res && !res.onCooldown && !res.notEnoughEnergy) {
        heroStates.Mage.actionState = 'burst_aoe';
        heroStates.Mage.actionTimer = 0.8;
        heroStates.Mage.char.play('burst_aoe', {
          loop: false,
          fade: 0.08,
          startTime: 0,
          timeScale: 1.0,
          force: true,
        });
        triggerCameraImpulse({
          intensity: 0.26,
          dirX: Math.sin(leader.yaw),
          dirZ: Math.cos(leader.yaw),
          fovKick: 2.2,
          kind: 'cataclysm',
        });
        coopClient.sendActionEvent({
          role: 'Mage',
          action: 'ultimate',
          x: leader.x,
          y: leader.y,
          z: leader.z,
        });
        onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
      }
      return res;
    }

    if (actionType === 'cast') {
      return triggerSpell(1);
    }
  }

  // Browser input hooks for `mouseup` / `pointerup` Shield Block release.
  // (`keydown` / `keyup` for `Tab` and `E` are handled authoritatively in `main.js`.)
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('mouseup', () => {
      if (heroStates.Knight.shieldBlocking) {
        actionAim.releaseHeavy('Knight');
      }
    });

    window.addEventListener('pointerup', () => {
      if (heroStates.Knight.shieldBlocking) {
        actionAim.releaseHeavy('Knight');
      }
    });
  }

  function setPraying(active = false) {
    if (active) {
      startCommuneChannel(activeHeroId);
    } else {
      cancelCommuneChannel();
    }
  }

  function swapActiveHero() {
    if (coopClient.getState().peerConnected) return activeHeroId;
    if (isPlayerControlLocked()) return activeHeroId;
    const nextHeroId = activeHeroId === 'Knight' ? 'Mage' : 'Knight';
    if (campaignLoop.combatHeroes[nextHeroId]?.downed) {
      onBanner?.({
        title: `${nextHeroId.toUpperCase()} IS DOWNED`,
        subtitle: 'Stand within 2.8m for 2.5s to revive your fallen partner!',
        kind: 'warning',
      });
      return activeHeroId;
    }
    const prevLeader = heroStates[activeHeroId];
    prevLeader.praying = false;
    if (prevLeader.id === 'Knight' && prevLeader.shieldBlocking) {
      actionAim.releaseHeavy('Knight');
    }
    actionAim.cancelSkillAim();
    mageRt.lockedViaTouchStart = false;
    mageRt.manualDragMoved = false;
    mageRt.aimTarget = null;
    activeHeroId = nextHeroId;
    partnerHeroId = activeHeroId === 'Knight' ? 'Mage' : 'Knight';
    combatSfx?.playUi?.('hero_swap');
    syncSharedPlayerFromLeader();
    coopClient.swapRoles();
    if (onHeroSwapped) {
      onHeroSwapped(activeHeroId, partnerHeroId);
    }
    onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
    return activeHeroId;
  }

  function teleportLeaderAndPartner(x, z, yaw = Math.PI) {
    ensureCombatUnfrozen();
    clearHeroHitFlashes();
    const leader = heroStates[activeHeroId];
    const partner = heroStates[partnerHeroId];

    leader.x = x;
    leader.z = z;
    leader.y = walkableHeightAt(x, z);
    leader.vy = 0;
    leader.yaw = yaw;
    leader.grounded = true;
    leader.lungeRemaining = 0;
    leader.dashCooldown = 0;
    leader.comboStep = 0;
    leader.comboResetTimer = 0;
    if (leader.shieldBlocking) {
      actionAim.releaseHeavy(leader.id);
    }
    actionAim.cancelSwing(leader.id, { resetCombo: true });
    if (leader.id === 'Knight') {
      vfxKit.swordVfx?.endSwing?.();
      knightRt.recoveryOpen = false;
      knightRt.pendingUltSlam = 0;
      knightRt.pendingUltCross2 = 0;
    }
    leader.actionState = null;
    leader.actionTimer = 0;
    leader.praying = false;
    applyTransform(leader);
    playHeroLocomotionClip(leader, 'idle');

    const wingAngle = yaw - 2.1;
    const wx = x + Math.sin(wingAngle) * 2.15;
    const wz = z + Math.cos(wingAngle) * 2.15;
    partner.x = wx;
    partner.z = wz;
    partner.y = walkableHeightAt(wx, wz);
    partner.vy = 0;
    partner.yaw = yaw - 0.22;
    partner.wingAnchorYaw = yaw;
    partner.wingmanMoving = false;
    partner.wingmanLoco = 'idle';
    partner.grounded = true;
    partner.lungeRemaining = 0;
    partner.dashCooldown = 0;
    partner.actionState = null;
    partner.actionTimer = 0;
    applyTransform(partner);
    playHeroLocomotionClip(partner, 'idle');

    syncSharedPlayerFromLeader();
  }

  function update(dt, { keys, joyState, camYaw = 0, camPitch = undefined, camera } = {}) {
    ensureCombatUnfrozen();

    if (typeof camPitch === 'number') {
      lastKnownCamPitch = camPitch;
    }

    if (sanctuarySteleMesh.material?.uniforms?.uTime) {
      sanctuarySteleMesh.material.uniforms.uTime.value += dt;
    }

    const leader = heroStates[activeHeroId];
    const partner = heroStates[partnerHeroId];
    const prevLeaderX = leader.x;
    const prevLeaderY = leader.y;
    const prevLeaderZ = leader.z;
    const prevLeaderYaw = leader.yaw;
    // Downed heroes can't act; they wait for a partner revive.
    const controlLocked =
      isPlayerControlLocked() || Boolean(campaignLoop.combatHeroes[activeHeroId]?.downed);

    // Guard broke (or block was refused) inside the campaign loop: drop the local block pose.
    if (heroStates.Knight.shieldBlocking && !campaignLoop.combatHeroes.Knight.shieldBlocking) {
      actionAim.releaseHeavy('Knight');
      heroStates.Knight.shieldBlocking = false;
    }

    // Advance 1-input swing buffer, mash speed ramp, and contact-frame hit detection
    if (!controlLocked) {
      const knightUltAtkMult =
        activeHeroId === 'Knight' && campaignLoop.combatHeroes.Knight.ultActive ? 1.35 : 1.0;
      actionAim.update(dt * knightUltAtkMult);
      leader.bufferedAttack = actionAim.heroes[leader.id].bufferedAttack;
      leader.mashTimeScale = actionAim.heroes[leader.id].mashTimeScale;

      // Camera-driven aim (mouse / shoulder touch): the camera owns yaw unless soft-locked on touch hold; the Mage's facing eases onto it.
      if (actionAim.aimState.active && activeHeroId === 'Mage') {
        if (!mageRt.composeAim) {
          if (
            mageRt.lockedViaTouchStart &&
            !mageRt.manualDragMoved &&
            mageRt.aimTarget &&
            isSoftLockable(mageRt.aimTarget)
          ) {
            const dx = mageRt.aimTarget.x - heroStates.Mage.x;
            const dz = mageRt.aimTarget.z - heroStates.Mage.z;
            const d = Math.hypot(dx, dz);
            const aimSpell = actionAim.aimState.spellId;
            const lockDist =
              aimSpell === 'shatterlance'
                ? clamp(d, 0.8, 18.0)
                : aimSpell === 'cinder_fall'
                  ? clamp(d, 3.0, 16.0)
                  : 14.5;
            actionAim.updateSkillAim({
              origin: { x: heroStates.Mage.x, y: heroStates.Mage.y, z: heroStates.Mage.z },
              yaw: d > 0.2 ? Math.atan2(dx, dz) : actionAim.aimState.yaw,
              pitch: lastKnownCamPitch,
              distance: lockDist,
              lockState: 'locked',
              lockTargetId: mageRt.aimTarget.instanceId ?? mageRt.aimTarget.id ?? null,
            });
          } else {
            const aimYaw =
              mageRt.aimSource !== 'touch' && typeof camYaw === 'number'
                ? camYaw
                : actionAim.aimState.yaw ?? heroStates.Mage.yaw;
            actionAim.updateSkillAim({
              origin: { x: heroStates.Mage.x, y: heroStates.Mage.y, z: heroStates.Mage.z },
              yaw: aimYaw,
              pitch: lastKnownCamPitch,
            });
          }
        }
        const activeAimYaw = actionAim.aimState.yaw ?? heroStates.Mage.yaw;
        if (actionAim.aimState.spellId === 'shatterlance') {
          mageRt.shatterHoldElapsed = (mageRt.shatterHoldElapsed || 0) + dt;
          vfxKit?.shatterlance?.updateChargeHold?.({
            origin: { x: heroStates.Mage.x, y: heroStates.Mage.y, z: heroStates.Mage.z },
            yaw: activeAimYaw,
            dirX: actionAim.aimState.dirX,
            dirZ: actionAim.aimState.dirZ,
            direction: { x: actionAim.aimState.dirX, y: 0, z: actionAim.aimState.dirZ },
            active: true,
            dt,
          });
        }
      }
    }
    lastKnownCamYaw = camYaw;
    stepKnightActionRuntime(dt, controlLocked);
    stepMageActionRuntime(dt, controlLocked);

    if (localHitstopTimer > 0) {
      localHitstopTimer = Math.max(0, localHitstopTimer - dt);
      if (localHitstopTimer <= 0) {
        knightChar.mixer.timeScale = 1.0;
      }
    }

    if (!controlLocked && Math.hypot(player.x - leader.x, player.z - leader.z) > 0.05) {
      leader.x = player.x;
      leader.z = player.z;
      leader.y = walkableHeightAt(leader.x, leader.z);
      leader.yaw = player.yaw;
    }

    if (leader.comboResetTimer > 0) {
      leader.comboResetTimer = Math.max(0, leader.comboResetTimer - dt);
    }
    if (leader.dashCooldown > 0) {
      leader.dashCooldown = Math.max(0, leader.dashCooldown - dt);
    }
    if (partner.dashCooldown > 0) {
      partner.dashCooldown = Math.max(0, partner.dashCooldown - dt);
    }

    // 1. Gather Keyboard + Touch Joystick input (zeroed during control lockout!)
    let fwd = 0;
    let right = 0;
    if (!controlLocked) {
      if (keys) {
        if (keys.has('w') || keys.has('arrowup')) fwd += 1;
        if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
        if (keys.has('d') || keys.has('arrowright')) right += 1;
        if (keys.has('a') || keys.has('arrowleft')) right -= 1;
      }
      if (joyState && joyState.magnitude > 0.08) {
        fwd += joyState.y;
        right += joyState.x;
      }
    }

    const rawMag = Math.hypot(fwd, right);
    const moveMag = controlLocked ? 0 : clamp(rawMag, 0, 1);
    const isSprinting =
      !controlLocked &&
      (Boolean(keys && keys.has('shift')) || Boolean(joyState && joyState.sprinting));

    // Never allow stationary shield_block (actionTimer = 999) to freeze leg animations while moving or sprinting!
    if (leader.id === 'Knight' && leader.shieldBlocking && (moveMag > 0.08 || isSprinting)) {
      actionAim.releaseHeavy('Knight');
    }

    let didWrap = false;

    // Knight: movement after a swing's chain window cuts the tail recovery cleanly without skating.
    if (
      leader.id === 'Knight' &&
      !controlLocked &&
      moveMag > 0.12 &&
      knightRt.recoveryOpen &&
      leader.actionState &&
      leader.actionState !== 'dash' &&
      !leader.shieldBlocking &&
      !actionAim.heroes.Knight.bufferedAttack &&
      !actionAim.heroes.Knight.activeSwing
    ) {
      leader.actionState = null;
      leader.actionTimer = 0;
      knightRt.recoveryOpen = false;
    }

    // Mage: movement cuts an already-released attack/cast's recovery (never the wind-up).
    if (
      leader.id === 'Mage' &&
      !controlLocked &&
      moveMag > 0.12 &&
      mageRt.recoveryOpen &&
      leader.actionState &&
      leader.actionState !== 'dash' &&
      !actionAim.heroes.Mage.bufferedAttack &&
      !actionAim.isInReleaseWindup('Mage') &&
      !mageRt.pendingCast &&
      !campaignLoop.combatHeroes.Mage.stormCataclysmActive
    ) {
      actionAim.cancelRecovery('Mage');
      mageRt.recoveryOpen = false;
      leader.actionState = null;
      leader.actionTimer = 0;
    }
    const knightOwnsFacing = leader.id === 'Knight' && !controlLocked && stepKnightFacing(leader, dt);
    const mageOwnsFacing = leader.id === 'Mage' && !controlLocked && stepMageFacing(leader, dt);
    const mageAiming = leader.id === 'Mage' && actionAim.aimState.active;
    leader.moveInputYaw = null;

    // 2. Update Active Hero (Leader)
    const isMageStationaryCast =
      leader.id === 'Mage' &&
      (campaignLoop.combatHeroes.Mage.stormCataclysmCastTimer > 0 ||
        actionAim.heroes.Mage.activeSwing?.stationary);

    // Smooth per-frame lunge velocity during active melee swings (zero frame-0 snap!)
    if (!controlLocked && leader.lungeRemaining > 1e-4) {
      const lungeSpeed = leader.lungeRemaining / Math.max(0.06, leader.lungeDuration || 0.2);
      const step = Math.min(leader.lungeRemaining, lungeSpeed * dt * 1.65);
      leader.lungeRemaining = Math.max(0, leader.lungeRemaining - step);
      advanceHeroStep(leader, step);
    }

    if (leader.actionTimer > 0 && !leader.shieldBlocking) {
      leader.actionTimer = Math.max(0, leader.actionTimer - dt);
      if (leader.actionState === 'dash' && !controlLocked) {
        const dashProg = clamp(leader.actionTimer / (leader.dashDuration || 0.42), 0, 1);
        const dashSpeed = player.speed * (0.95 + 1.55 * Math.sin(dashProg * Math.PI * 0.5));
        let next = resolveCollisions(
          leader.x + leader.dashDirX * dashSpeed * dt,
          leader.z + leader.dashDirZ * dashSpeed * dt,
          player.radius
        );
        if (campaignLoop.currentActId === 'act3_shrine' || next.z < -68.0) {
          const shr = resolveShrineObstacles(
            next.x,
            next.z,
            player.radius,
            campaignLoop.currentActId === 'act3_shrine'
          );
          next = { ...next, x: shr.x, z: shr.z };
        }
        leader.x = next.x;
        leader.z = next.z;
        didWrap = next.wrapped;
      }
      if (leader.actionTimer <= 0) {
        leader.actionState = null;
        leader.lungeRemaining = 0;
      }
    }

    if (
      !controlLocked &&
      moveMag > 1e-3 &&
      leader.actionState !== 'dash' &&
      !isMageStationaryCast
    ) {
      if (leader.id === 'Mage') {
        actionAim.notifyHeroMoved('Mage');
        leader.consecutiveChargedCount = 0;
        campaignLoop.combatHeroes.Mage.consecutiveChargedCount = 0;
      }

      const nx = right / (rawMag || 1);
      const nz = fwd / (rawMag || 1);
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const rx = -fz;
      const rz = fx;
      const moveX = fx * nz + rx * nx;
      const moveZ = fz * nz + rz * nx;

      leader.moveInputYaw = Math.atan2(moveX, moveZ);
      leader.moveVecX = moveX;
      leader.moveVecZ = moveZ;

      // Damp WASD movement to 0.18x during active melee attacks so feet stay planted and never skate!
      const blockMult = leader.shieldBlocking ? 0.35 : 1.0;
      const actionMult = leader.actionState && !leader.shieldBlocking && !mageAiming ? 0.18 : 1.0;
      const aimMult = mageAiming
        ? MAGE_AIM_HOLD_SPEC.moveSpeedMult * mageAimDirectionalSpeed(shortestAngleDiff(leader.moveInputYaw, leader.yaw))
        : 1.0;
      const ultMoveMult =
        leader.id === 'Knight' && campaignLoop.combatHeroes.Knight.ultActive ? 1.35 : 1.0;
      const spd =
        player.speed *
        (isSprinting && !mageAiming ? player.sprintMult : moveMag < 0.55 ? 0.56 : 1.0) *
        blockMult *
        actionMult *
        aimMult *
        ultMoveMult;

      let next = resolveCollisions(
        leader.x + moveX * spd * dt,
        leader.z + moveZ * spd * dt,
        player.radius
      );
      if (campaignLoop.currentActId === 'act3_shrine' || next.z < -68.0) {
        const shr = resolveShrineObstacles(
          next.x,
          next.z,
          player.radius,
          campaignLoop.currentActId === 'act3_shrine'
        );
        next = { ...next, x: shr.x, z: shr.z };
      }
      leader.x = next.x;
      leader.z = next.z;
      didWrap = next.wrapped;

      const activeSw = actionAim.heroes[leader.id]?.activeSwing;
      const lockYawForStrike = Boolean(
        activeSw && !activeSw.contactFired && activeSw.elapsed < activeSw.contactTime
      );
      if (mageAiming && !mageRt.composeAim) {
        // Keep the aim origin glued to the strafing Mage without dropping touch soft-lock.
        const preserveAimYaw =
          mageRt.aimSource === 'touch' || mageRt.lockedViaTouchStart || typeof camYaw !== 'number';
        actionAim.updateSkillAim({
          origin: { x: leader.x, y: walkableHeightAt(leader.x, leader.z), z: leader.z },
          yaw: preserveAimYaw ? actionAim.aimState.yaw ?? leader.yaw : camYaw,
          pitch: lastKnownCamPitch,
        });
      }
      if (!mageOwnsFacing && !knightOwnsFacing && !lockYawForStrike) {
        const targetYaw = Math.atan2(moveX, moveZ);
        leader.yaw += shortestAngleDiff(targetYaw, leader.yaw) * Math.min(1, 14 * dt);
      }
    }

    // Vertical physics & Jump state transitions
    const floorY = walkableHeightAt(leader.x, leader.z);
    if (didWrap) {
      leader.y = floorY;
      leader.vy = 0;
      leader.grounded = true;
    } else if (
      !controlLocked &&
      keys &&
      keys.has(' ') &&
      leader.grounded &&
      !leader.praying &&
      !isMageStationaryCast
    ) {
      triggerAction('jump');
    }

    if (!leader.grounded) {
      leader.vy -= 19.0 * dt;
      leader.y += leader.vy * dt;
      if (leader.vy < 1.5 && leader.locomotionState === 'jump_start') {
        playHeroLocomotionClip(leader, 'jump_idle');
      }
      if (leader.y <= floorY) {
        leader.y = floorY;
        leader.vy = 0;
        leader.grounded = true;
        leader.landTimer = 0.18;
        playHeroLocomotionClip(leader, 'jump_land');
      }
    } else {
      leader.y = floorY;
      if (leader.landTimer > 0) {
        leader.landTimer = Math.max(0, leader.landTimer - dt);
      }
    }

    if (
      !controlLocked &&
      !campaignLoop.combatHeroes[leader.id]?.downed &&
      leader.grounded &&
      !leader.actionState &&
      !leader.shieldBlocking &&
      !leader.praying &&
      leader.landTimer <= 0
    ) {
      if (mageAiming) {
        playMageAimLocomotion(leader, leader.moveVecX || 0, leader.moveVecZ || 0, moveMag >= 0.08);
      } else if (moveMag < 0.08) {
        playHeroLocomotionClip(leader, 'idle');
      } else if (isSprinting) {
        playHeroLocomotionClip(leader, 'sprint');
      } else {
        // Partial stick still moves at ~4 m/s, so it uses the run cycle (stride-matched) rather than an 8x walk.
        playHeroLocomotionClip(leader, 'run');
      }
    }

    // Track instantaneous velocity & angular velocity on leader for projective dead-reckoning
    if (dt > 1e-4 && !didWrap) {
      leader.vx = (leader.x - prevLeaderX) / dt;
      leader.vz = (leader.z - prevLeaderZ) / dt;
      leader.vyaw = shortestAngleDiff(leader.yaw, prevLeaderYaw) / dt;
    } else {
      leader.vx = 0;
      leader.vz = 0;
      leader.vyaw = 0;
    }

    // 3. Update Co-Op Partner (Remote Peer Interpolation OR Solo Wingman Follow AI)
    const coopState = coopClient.getState();
    const isPeerLinked = Boolean(coopState.peerConnected);
    const isAuthoritativeHost = !isPeerLinked || Boolean(coopState.isHost);

    if (partner.actionTimer > 0 && !partner.shieldBlocking) {
      partner.actionTimer = Math.max(0, partner.actionTimer - dt);
      if (isPeerLinked && partner.actionState === 'dash') {
        const dashProg = clamp(partner.actionTimer / (partner.dashDuration || 0.42), 0, 1);
        const dashSpeed = player.speed * (0.95 + 1.55 * Math.sin(dashProg * Math.PI * 0.5));
        const nextDash = resolveCollisions(
          partner.x + (partner.dashDirX || 0) * dashSpeed * dt,
          partner.z + (partner.dashDirZ || 0) * dashSpeed * dt,
          player.radius * 0.9
        );
        partner.x = nextDash.x;
        partner.z = nextDash.z;
        remotePartnerTarget.x = nextDash.x;
        remotePartnerTarget.z = nextDash.z;
      }
      if (partner.actionTimer <= 0) {
        partner.actionState = null;
      }
    }

    const blessingActive = Boolean(campaignLoop.isDivineBlessingActive?.());
    const leaderDowned = Boolean(campaignLoop.combatHeroes[leader.id]?.downed);
    if (leaderDowned && !partner._wasLeaderDowned) {
      partner._wasLeaderDowned = true;
      partner._leaderDownedGraceTimer = 1.65;
      partner.actionState = null;
      partner.actionTimer = 0;
      partner.wingmanMoving = false;
      partner.wingmanLoco = 'idle';
      playHeroLocomotionClip(partner, 'idle');
    } else if (!leaderDowned) {
      partner._wasLeaderDowned = false;
      partner._leaderDownedGraceTimer = 0;
    }
    if (partner._leaderDownedGraceTimer > 0) {
      partner._leaderDownedGraceTimer = Math.max(0, partner._leaderDownedGraceTimer - dt);
    }
    if (isPeerLinked) {
      if (remotePartnerTarget.active && !campaignLoop.verdictSequence?.active) {
        const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const age = Math.min(
          0.10,
          Math.max(0, (nowMs - (remotePartnerTarget.receivedAt || nowMs)) * 0.001)
        );
        const projX = remotePartnerTarget.x + (remotePartnerTarget.vx || 0) * age;
        const projZ = remotePartnerTarget.z + (remotePartnerTarget.vz || 0) * age;
        const blend = 1 - Math.exp(-18 * dt);
        const errDist = Math.hypot(projX - partner.x, projZ - partner.z);
        if (errDist > 12.0) {
          partner.x = projX;
          partner.z = projZ;
        } else {
          partner.x += (projX - partner.x) * blend;
          partner.z += (projZ - partner.z) * blend;
        }
        const groundY = walkableHeightAt(partner.x, partner.z);
        if (
          remotePartnerTarget.grounded === false &&
          typeof remotePartnerTarget.y === 'number'
        ) {
          partner.y += (Math.max(groundY, remotePartnerTarget.y) - partner.y) * blend;
          partner.grounded = false;
        } else {
          partner.y = groundY;
          partner.grounded = true;
        }
        const projYaw =
          remotePartnerTarget.yaw + (remotePartnerTarget.vyaw || 0) * age * 0.5;
        partner.yaw += shortestAngleDiff(projYaw, partner.yaw) * blend;
      }
    } else if (!isPlayerControlLocked() && !campaignLoop.combatHeroes[partner.id]?.downed) {
      const catActive = Boolean(
        partner.id === 'Knight' &&
          campaignLoop.combatHeroes.Mage?.stormCataclysmActive &&
          campaignLoop.combatHeroes.Mage?.stormCataclysmCenter
      );
      const catCenter = campaignLoop.combatHeroes.Mage?.stormCataclysmCenter;
      const leaderSwinging = Boolean(
        (leader.actionState && leader.actionState !== 'dash') ||
          actionAim.heroes[leader.id]?.activeSwing ||
          leader.lungeRemaining > 1e-4
      );
      const leaderInCombatCombo = Boolean(
        leaderSwinging || (actionAim.heroes[leader.id]?.comboResetTimer || 0) > 0
      );
      if (partner.wingAnchorYaw === undefined || partner.wingAnchorYaw === null) {
        partner.wingAnchorYaw = leader.yaw;
      } else if (catActive || blessingActive || leaderDowned || (!leaderInCombatCombo && moveMag > 0.25)) {
        // Only rotate the wingman's anchor angle when the leader is genuinely travelling (never during melee swings or turns-in-place!)
        partner.wingAnchorYaw +=
          shortestAngleDiff(leader.yaw, partner.wingAnchorYaw) * Math.min(1, 6 * dt);
      }
      const effectiveRefYaw =
        catActive || blessingActive || leaderDowned ? leader.yaw : partner.wingAnchorYaw;
      const wingOffsetAngle = catActive ? effectiveRefYaw - 1.32 : effectiveRefYaw - 2.1;
      const wingOffsetDist = catActive
        ? 9.15
        : leaderDowned
          ? 1.15
          : blessingActive
            ? 1.45
            : 2.15;
      const refX = catActive ? catCenter.x : leader.x;
      const refZ = catActive ? catCenter.z : leader.z;
      const targetWingX = refX + Math.sin(wingOffsetAngle) * wingOffsetDist;
      const targetWingZ = refZ + Math.cos(wingOffsetAngle) * wingOffsetDist;
      const dxW = targetWingX - partner.x;
      const dzW = targetWingZ - partner.z;
      const distW = Math.hypot(dxW, dzW);
      const heroDist = Math.hypot(leader.x - partner.x, leader.z - partner.z);

      if ((catActive || leaderDowned) && partner.actionState && distW > 1.2) {
        partner.actionState = null;
        partner.actionTimer = 0;
      }

      if (!catActive && (didWrap || distW > 18.0 || (blessingActive && distW > 3.6))) {
        partner.x = targetWingX;
        partner.z = targetWingZ;
        partner.y = walkableHeightAt(partner.x, partner.z);
        partner.yaw = leader.yaw - 0.22;
        partner.wingAnchorYaw = leader.yaw;
        partner.wingmanMoving = false;
        partner.wingmanLoco = 'idle';
        playHeroLocomotionClip(partner, 'idle');
      } else if (!partner.actionState && !leader.praying && !(partner._leaderDownedGraceTimer > 0)) {
        // Hysteresis deadband: never start or continue micro-following while the leader is attacking nearby!
        const startFollowDist = catActive
          ? 1.15
          : leaderDowned
            ? 0.55
            : blessingActive
              ? 0.95
              : leaderInCombatCombo
                ? 3.4
                : 1.75;
        const stopFollowDist = catActive ? 0.45 : leaderDowned ? 0.25 : blessingActive ? 0.28 : 0.42;

        if (!partner.wingmanMoving) {
          const farFromLeader =
            catActive ||
            leaderDowned ||
            blessingActive ||
            heroDist > (leaderInCombatCombo ? 3.6 : 2.65);
          if (distW > startFollowDist && farFromLeader) {
            partner.wingmanMoving = true;
          }
        } else if (
          distW <= stopFollowDist + 0.03 ||
          (!catActive && !leaderDowned && !blessingActive && leaderInCombatCombo && heroDist <= 3.2)
        ) {
          partner.wingmanMoving = false;
          partner.wingmanLoco = 'idle';
        }

        if (partner.wingmanMoving && distW > stopFollowDist) {
          const dirX = dxW / distW;
          const dirZ = dzW / distW;
          const partnerSpd =
            catActive || blessingActive
              ? player.speed * player.sprintMult * 1.25
              : distW > 4.2
                ? player.speed * player.sprintMult
                : distW > 1.55
                  ? player.speed * 1.02
                  : player.speed * 0.56;
          const step = Math.min(distW - stopFollowDist, partnerSpd * dt);
          const nextP = resolveCollisions(
            partner.x + dirX * step,
            partner.z + dirZ * step,
            player.radius * 0.9
          );
          partner.x = nextP.x;
          partner.z = nextP.z;
          partner.y = walkableHeightAt(partner.x, partner.z);

          const moveYaw = Math.atan2(dirX, dirZ);
          const settleYaw = leader.yaw - 0.22;
          const blendToSettle = clamp((1.05 - distW) / 0.65, 0, 1);
          const pTargetYaw =
            moveYaw + shortestAngleDiff(settleYaw, moveYaw) * blendToSettle;
          partner.yaw += shortestAngleDiff(pTargetYaw, partner.yaw) * Math.min(1, 10 * dt);

          let nextLoco = partner.wingmanLoco || 'walk';
          if (catActive || distW > 4.5 || (isSprinting && moveMag > 0.2)) {
            nextLoco = 'sprint';
          } else if (nextLoco === 'sprint' && distW > 3.2) {
            nextLoco = 'sprint';
          } else if (distW > 1.85 || moveMag > 0.55) {
            nextLoco = 'run';
          } else if (nextLoco === 'run' && distW > 1.1) {
            nextLoco = 'run';
          } else {
            nextLoco = 'walk';
          }
          partner.wingmanLoco = nextLoco;
          playHeroLocomotionClip(partner, nextLoco);
        } else {
          partner.wingmanMoving = false;
          partner.wingmanLoco = 'idle';
          partner.y = walkableHeightAt(partner.x, partner.z);
          const hasNearbyEnemy = enemyManager?.activeEnemies?.some(
            (e) => e && !e.dead && e.active && Math.hypot(e.x - partner.x, e.z - partner.z) <= 15.5
          );
          if (!leaderInCombatCombo && !hasNearbyEnemy) {
            partner.yaw += shortestAngleDiff(leader.yaw - 0.22, partner.yaw) * Math.min(1, 4 * dt);
          }
          playHeroLocomotionClip(partner, 'idle');
        }
      }
    }

    // 4. Update 3-Act Campaign Loop & Pooled Enemy AI, then Hero Skeletons, then Stage 4 Opaque VFX Kit
    campaignLoop.update(dt, {
      heroStates,
      activeHeroId,
      soloWingmanActive: !isPeerLinked,
      isHost: isAuthoritativeHost,
      isGuest: isPeerLinked && !isAuthoritativeHost,
      camera,
    });

    for (const hSt of [leader, partner]) {
      if (!hSt) continue;
      if (hSt.hitKnockbackX || hSt.hitKnockbackZ) {
        const kbx = hSt.hitKnockbackX || 0;
        const kbz = hSt.hitKnockbackZ || 0;
        hSt.hitKnockbackX = 0;
        hSt.hitKnockbackZ = 0;
        let nextKb = resolveCollisions(hSt.x + kbx, hSt.z + kbz, player.radius);
        if (campaignLoop.currentActId === 'act3_shrine' || nextKb.z < -68.0) {
          const shr = resolveShrineObstacles(
            nextKb.x,
            nextKb.z,
            player.radius,
            campaignLoop.currentActId === 'act3_shrine'
          );
          nextKb = { ...nextKb, x: shr.x, z: shr.z };
        }
        hSt.x = nextKb.x;
        hSt.z = nextKb.z;
        if (hSt.grounded) {
          hSt.y = walkableHeightAt(hSt.x, hSt.z);
        }
      }
      if ((hSt.hitFlashTimer || 0) > 0) {
        hSt.hitFlashTimer = Math.max(0, hSt.hitFlashTimer - dt);
        const flashHex = hSt.hitFlashBlocked ? 0x7dd3fc : 0xff2a4b;
        ToonSkin?.setCharacterHitFlash?.(hSt.char, hSt.hitFlashTimer / 0.18, flashHex);
      } else if (hSt.hitFlashTimer === 0) {
        hSt.hitFlashTimer = -1;
        ToonSkin?.setCharacterHitFlash?.(hSt.char, 0);
      }
    }

    applyTransform(leader);
    applyTransform(partner);
    leader.char.update(dt);
    partner.char.update(dt);
    syncSharedPlayerFromLeader();

    vfxKit.update(dt);

    coopClient.sendHeroState({
      role: activeHeroId,
      x: leader.x,
      y: leader.y,
      z: leader.z,
      vx: leader.vx || 0,
      vy: leader.vy || 0,
      vz: leader.vz || 0,
      yaw: leader.yaw,
      vyaw: leader.vyaw || 0,
      grounded: Boolean(leader.grounded),
      clip: leader.char.anim.currentKey,
      actionState: leader.actionState,
      shieldBlocking: Boolean(leader.shieldBlocking),
      element:
        activeHeroId === 'Knight'
          ? campaignLoop.combatHeroes.Knight.selectedElement
          : campaignLoop.combatHeroes.Mage.selectedElement,
    });

    if (isPeerLinked && isAuthoritativeHost) {
      coopClient.sendWorldSync(buildWorldSyncPayload());
    }

    // 4B. Sync Underground Visibility, Sword VFX Sheath, and Character Ground-Clip / Dissolve Shaders
    const vfx = vfxKit.artoriousVfx;
    const vSeq = campaignLoop.verdictSequence;
    const kLevY = vfx?.active ? vfx.getHeroLevitationOffset('Knight') : 0.0;
    const mLevY = vfx?.active ? vfx.getHeroLevitationOffset('Mage') : 0.0;
    knightChar.group.position.y = heroStates.Knight.y + kLevY;
    mageChar.group.position.y = heroStates.Mage.y + mLevY;

    const isUnderground = Boolean(
      vfx?.isHeroUndergroundHidden?.() ||
        (vSeq?.active &&
          vSeq.kind === 'blessing' &&
          vSeq.elapsed >= 2.65 &&
          vSeq.elapsed < 4.25)
    );

    if (isUnderground) {
      knightChar.group.visible = false;
      mageChar.group.visible = false;
      if (vfxKit.swordVfx?.group) {
        vfxKit.swordVfx.group.visible = false;
      }
    } else {
      knightChar.group.visible = true;
      mageChar.group.visible = true;
      if (vfxKit.swordVfx?.group) {
        vfxKit.swordVfx.group.visible = true;
      }
    }

    const kSmiteDissolvedDead =
      vSeq?.kind === 'smite' &&
      vSeq?.dissolveRole === 'Knight' &&
      campaignLoop.combatHeroes.Knight.downed;
    const mSmiteDissolvedDead =
      vSeq?.kind === 'smite' &&
      vSeq?.dissolveRole === 'Mage' &&
      campaignLoop.combatHeroes.Mage.downed;

    if (vSeq?.active && vSeq.kind === 'smite') {
      const dissProg =
        vfx?.getCharacterDissolveProgress?.() ||
        clamp((vSeq.elapsed - 0.15) / 2.0, 0, 1);
      const kIsVictim = vSeq.dissolveRole === 'Knight';
      const mIsVictim = vSeq.dissolveRole === 'Mage';
      setCharacterVerdictShaderState(knightChar, {
        groundClipY: -9999,
        dissolveProgress: kIsVictim ? dissProg : 0,
        dissolveBaseY: heroStates.Knight.y,
        monochromeOverride: kIsVictim ? 0 : 1.0,
      });
      setCharacterVerdictShaderState(mageChar, {
        groundClipY: -9999,
        dissolveProgress: mIsVictim ? dissProg : 0,
        dissolveBaseY: heroStates.Mage.y,
        monochromeOverride: mIsVictim ? 0 : 1.0,
      });
    } else if (kSmiteDissolvedDead || mSmiteDissolvedDead) {
      if (kSmiteDissolvedDead) knightChar.group.visible = false;
      if (mSmiteDissolvedDead) mageChar.group.visible = false;
      setCharacterVerdictShaderState(knightChar, {
        groundClipY: -9999,
        dissolveProgress: kSmiteDissolvedDead ? 1.0 : 0,
        dissolveBaseY: heroStates.Knight.y,
        monochromeOverride: 0,
      });
      setCharacterVerdictShaderState(mageChar, {
        groundClipY: -9999,
        dissolveProgress: mSmiteDissolvedDead ? 1.0 : 0,
        dissolveBaseY: heroStates.Mage.y,
        monochromeOverride: 0,
      });
    } else if (kLevY < -0.02 || mLevY < -0.02) {
      setCharacterVerdictShaderState(knightChar, {
        groundClipY: walkableHeightAt(heroStates.Knight.x, heroStates.Knight.z) - 0.02,
        dissolveProgress: 0,
        dissolveBaseY: heroStates.Knight.y,
        monochromeOverride: 0,
      });
      setCharacterVerdictShaderState(mageChar, {
        groundClipY: walkableHeightAt(heroStates.Mage.x, heroStates.Mage.z) - 0.02,
        dissolveProgress: 0,
        dissolveBaseY: heroStates.Mage.y,
        monochromeOverride: 0,
      });
    } else {
      setCharacterVerdictShaderState(knightChar, {
        groundClipY: -9999,
        dissolveProgress: 0,
        dissolveBaseY: 0,
        monochromeOverride: 0,
      });
      setCharacterVerdictShaderState(mageChar, {
        groundClipY: -9999,
        dissolveProgress: 0,
        dissolveBaseY: 0,
        monochromeOverride: 0,
      });
    }

    stepLocomotionRates(dt);
    stepCameraImpact(dt);
  }

  function resetTransientVisualEffects() {
    clearHeroHitFlashes();
    resetCameraImpact();
    actionAim.cancelSkillAim();
    mageRt.lockedViaTouchStart = false;
    mageRt.manualDragMoved = false;
    mageRt.aimTarget = null;
    vfxKit?.shatterlance?.cancelCharge?.();
    combatSfx?.cancelSpellCharge?.('shatterlance');
    if (knightChar?.group) {
      setCharacterVerdictShaderState(knightChar, {
        groundClipY: -9999,
        dissolveProgress: 0,
        dissolveBaseY: 0,
        monochromeOverride: 0,
      });
    }
    if (mageChar?.group) {
      setCharacterVerdictShaderState(mageChar, {
        groundClipY: -9999,
        dissolveProgress: 0,
        dissolveBaseY: 0,
        monochromeOverride: 0,
      });
    }
  }

  function poseForShot(shotId, fallbackPlayerPos = null, camera = null) {
    resetTransientVisualEffects();
    communeChannel.active = false;
    knightChar.group.visible = true;
    mageChar.group.visible = true;
    if (vfxKit.swordVfx?.group) vfxKit.swordVfx.group.visible = true;
    setCharacterVerdictShaderState(knightChar, {
      groundClipY: -9999,
      dissolveProgress: 0,
      dissolveBaseY: 0,
      monochromeOverride: 0,
    });
    setCharacterVerdictShaderState(mageChar, {
      groundClipY: -9999,
      dissolveProgress: 0,
      dissolveBaseY: 0,
      monochromeOverride: 0,
    });

    const preset = SHOT_CHARACTER_POSES[shotId] || SHOT_CHARACTER_POSES['day-plaza'];

    const kx = preset.knight?.x ?? (fallbackPlayerPos ? fallbackPlayerPos[0] : 1.5);
    const kz = preset.knight?.z ?? (fallbackPlayerPos ? fallbackPlayerPos[1] : 11.5);
    const kRot = preset.knight?.rotY ?? (fallbackPlayerPos ? fallbackPlayerPos[2] : Math.PI);
    const kClip = preset.knight?.clip || 'Idle_Combat';
    const kTime = preset.knight?.time ?? 0.35;

    const mx = preset.mage?.x ?? kx + 1.8;
    const mz = preset.mage?.z ?? kz + 0.4;
    const mRot = preset.mage?.rotY ?? kRot - 0.35;
    const mClip = preset.mage?.clip || 'cast_spell';
    const mTime = preset.mage?.time ?? 0.52;

    const kState = heroStates.Knight;
    kState.x = kx;
    kState.z = kz;
    kState.y = walkableHeightAt(kx, kz);
    kState.vy = 0;
    kState.yaw = kRot;
    kState.grounded = true;
    kState.actionState = null;
    kState.actionTimer = 0;
    kState.praying = false;
    applyTransform(kState);
    knightChar.mixer.timeScale = 1.0;
    knightChar.poseAt(kClip, kTime);

    const mState = heroStates.Mage;
    mState.x = mx;
    mState.z = mz;
    mState.y = walkableHeightAt(mx, mz);
    mState.vy = 0;
    mState.yaw = mRot;
    mState.grounded = true;
    mState.actionState = null;
    mState.actionTimer = 0;
    mState.praying = false;
    applyTransform(mState);
    mageChar.mixer.timeScale = 1.0;
    mageChar.poseAt(mClip, mTime);

    sanctuarySteleMesh.visible = false;
    vfxKit.clear();
    vfxKit.swordVfx.setInfusion('none', 0);
    campaignLoop.setIndicatorsHiddenForShot(true, heroStates);
    enemyManager.setFrozenForShot(shotId, camera);

    rootGroup.updateMatrixWorld(true);
    enemyManager.rootGroup.updateMatrixWorld(true);
    syncSharedPlayerFromLeader();
  }

  function poseForGameplayShot(gameplayShotId, camera = null) {
    clearHeroHitFlashes();
    resetCameraImpact();
    communeChannel.active = false;
    sanctuarySteleMesh.visible = false;
    const spec =
      STAGE5_GAMEPLAY_SHOTS[gameplayShotId] ||
      STAGE5_GAMEPLAY_SHOTS['01-desktop-act1-sunfire-slash'];

    const kSpec = spec.knight;
    const kState = heroStates.Knight;
    kState.x = kSpec.x;
    kState.z = kSpec.z;
    kState.y = walkableHeightAt(kSpec.x, kSpec.z);
    kState.vy = 0;
    kState.yaw = kSpec.rotY;
    kState.grounded = true;
    kState.actionState = null;
    kState.actionTimer = 0;
    applyTransform(kState);
    knightChar.mixer.timeScale = 1.0;
    knightChar.poseAt(kSpec.clip || 'Idle_Combat', kSpec.time ?? 0.36);

    const mSpec = spec.mage;
    const mState = heroStates.Mage;
    mState.x = mSpec.x;
    mState.z = mSpec.z;
    mState.y = walkableHeightAt(mSpec.x, mSpec.z);
    mState.vy = 0;
    mState.yaw = mSpec.rotY;
    mState.grounded = true;
    mState.actionState = null;
    mState.actionTimer = 0;
    applyTransform(mState);
    mageChar.mixer.timeScale = 1.0;
    mageChar.poseAt(mSpec.clip || 'cast_spell', mSpec.time ?? 0.45);

    rootGroup.updateMatrixWorld(true);
    syncSharedPlayerFromLeader();

    campaignLoop.applyRemoteStateSync({
      actId: spec.actId || 'act1_arena',
      actTriggered: true,
      heartResonance: spec.heartResonance ?? 75,
    });
    campaignLoop.combatHeroes.Knight.empoweredBreathing =
      spec.actId === 'act2_plaza' || spec.actId === 'act3_shrine';

    enemyManager.setFrozenForShot(null);
    enemyManager.clearAllEnemies();
    enemyManager.setCurrentActId(spec.actId || 'act1_arena');

    if (Array.isArray(spec.enemies)) {
      for (const eSpec of spec.enemies) {
        const spawned = enemyManager.spawnImmediateFromSpec(eSpec);
        if (spawned) {
          const gy = walkableHeightAt(eSpec.x, eSpec.z) + (eSpec.dy || 0);
          spawned.x = eSpec.x;
          spawned.y = gy;
          spawned.z = eSpec.z;
          spawned.yaw = eSpec.rotY ?? 0;
          spawned.mark = eSpec.mark || null;
          spawned.markTimer = eSpec.mark ? 6.0 : 0;
          if (eSpec.hp !== undefined) spawned.hp = eSpec.hp;
          if (eSpec.maxHp !== undefined) spawned.maxHp = eSpec.maxHp;
          if (eSpec.aegisActive !== undefined) {
            spawned.aegisActive = eSpec.aegisActive;
            spawned.aegisLayers = eSpec.aegisLayers ?? 2;
            spawned.aegisTriggered = true;
          }
          if (eSpec.aiState === 'windup') {
            spawned.aiState = 'windup';
            spawned.telegraphProgress = eSpec.telegraphProgress ?? 0.65;
            spawned.windupTimer = spawned.windupDuration * spawned.telegraphProgress;
            spawned.telegraphRadius = eSpec.telegraphRadius ?? spawned.telegraphRadius;
            spawned.telegraphX = eSpec.telegraphX ?? eSpec.x;
            spawned.telegraphZ = eSpec.telegraphZ ?? eSpec.z;
            spawned.telegraphY = walkableHeightAt(spawned.telegraphX, spawned.telegraphZ) + 0.04;
          }
          if (eSpec.scale && !spawned.isBoss) {
            spawned.group.scale.setScalar(eSpec.scale);
          }
          spawned.group.position.set(spawned.x, spawned.y, spawned.z);
          spawned.group.rotation.set(eSpec.rotX ?? 0, spawned.yaw, eSpec.rotZ ?? 0, 'YXZ');
          spawned.group.visible = true;
          spawned.char.mixer.timeScale = eSpec.mixerTimeScale ?? 1.0;
          spawned.char.poseAt(eSpec.clip || 'Idle_Combat', eSpec.time ?? 0.35);
        }
      }
    }
    enemyManager.rootGroup.visible = true;
    enemyManager.rootGroup.updateMatrixWorld(true);

    campaignLoop.combatHeroes.Knight.hp = kSpec.hp ?? 220;
    campaignLoop.combatHeroes.Knight.shield = kSpec.shield ?? 0;
    campaignLoop.combatHeroes.Knight.shieldTimer = kSpec.shield ? 8.0 : 0;
    campaignLoop.combatHeroes.Mage.hp = mSpec.hp ?? HERO_STATS.Mage.maxHp;
    campaignLoop.combatHeroes.Mage.shield = mSpec.shield ?? 0;
    campaignLoop.combatHeroes.Mage.shieldTimer = mSpec.shield ? 8.0 : 0;

    if (spec.spellCooldowns) {
      Object.assign(campaignLoop.combatHeroes.Mage.spellCooldowns, spec.spellCooldowns);
    }

    campaignLoop.setKnightBreathing(spec.breathingStyle || 'none', spec.breathingTimer ?? 13.0);
    campaignLoop.tetherSurge.active = Boolean(spec.breathingStyle && spec.breathingStyle !== 'none');
    campaignLoop.tetherSurge.style = spec.breathingStyle || 'solar';
    campaignLoop.tetherSurge.progress = 0.52;

    campaignLoop.setIndicatorsHiddenForShot(false, heroStates);

    vfxKit.clear();
    vfxKit.swordVfx.setInfusion(spec.breathingStyle || 'none', spec.breathingTimer ?? 13.0);

    if (spec.vfx) {
      const v = spec.vfx;
      if (v.system === 'swordVfx' && v.swordPose) {
        const sp = structuredClone(v.swordPose);
        if (sp.swing?.origin) {
          sp.swing.origin[1] = walkableHeightAt(sp.swing.origin[0], sp.swing.origin[2]);
        }
        if (sp.detonation?.pos) {
          sp.detonation.pos[1] = walkableHeightAt(sp.detonation.pos[0], sp.detonation.pos[2]);
        }
        vfxKit.swordVfx.seek(v.time ?? 0.16, sp);
      } else if (v.system === 'shatterlance') {
        const oy = walkableHeightAt(v.origin[0], v.origin[2]);
        vfxKit.shatterlance.cast(
          { x: v.origin[0], y: oy, z: v.origin[2] },
          { x: v.dir[0], y: 0, z: v.dir[2] },
          { range: v.range ?? 14.5, seed: 1.0 }
        );
        vfxKit.shatterlance.seek(v.time ?? 0.46);
      } else if (v.system === 'cinderFall') {
        const oy = walkableHeightAt(v.origin[0], v.origin[2]);
        vfxKit.cinderFall.cast(
          { x: v.origin[0], y: oy, z: v.origin[2] },
          { x: v.dir[0], y: 0, z: v.dir[2] },
          { range: v.range ?? 14.0, distance: v.range ?? 14.0, seed: 1.0 }
        );
        vfxKit.cinderFall.seek(v.time ?? 0.76);
      } else if (v.system === 'stormLance') {
        const oy = walkableHeightAt(v.origin[0], v.origin[2]);
        vfxKit.stormLance.cast(
          { x: v.origin[0], y: oy, z: v.origin[2] },
          { x: v.dir[0], y: 0, z: v.dir[2] },
          { range: v.range ?? 14.5, seed: 1.0 }
        );
        vfxKit.stormLance.seek(v.time ?? 0.34);
      } else if (v.system === 'frostLance') {
        const oy = walkableHeightAt(v.origin[0], v.origin[2]);
        vfxKit.frostLance.cast(
          { x: v.origin[0], y: oy, z: v.origin[2] },
          { x: v.dir[0], y: 0, z: v.dir[2] },
          { range: v.range ?? 14.5, seed: 1.0 }
        );
        vfxKit.frostLance.seek(v.time ?? 0.72);
      } else if (v.system === 'artoriousVfx' && vfxKit.artoriousVfx) {
        const orig = v.origin
          ? { x: v.origin[0], y: walkableHeightAt(v.origin[0], v.origin[2]), z: v.origin[2] }
          : kState;
        const part = v.partnerPos
          ? {
              x: v.partnerPos[0],
              y: walkableHeightAt(v.partnerPos[0], v.partnerPos[2]),
              z: v.partnerPos[2],
            }
          : mState;
        if (v.mode === 'channel') {
          vfxKit.artoriousVfx.startChannel(orig, part, { camera });
        } else if (v.mode === 'smite') {
          vfxKit.artoriousVfx.triggerSmite(orig, part, { camera });
        } else {
          vfxKit.artoriousVfx.triggerBlessing(orig, part, { camera });
        }
        vfxKit.artoriousVfx.seek(v.time ?? 0.5, { camera });
      }
    }

    const vfx = vfxKit.artoriousVfx;
    const kLevY = vfx?.active ? vfx.getHeroLevitationOffset('Knight') : 0.0;
    const mLevY = vfx?.active ? vfx.getHeroLevitationOffset('Mage') : 0.0;
    knightChar.group.position.y = kState.y + kLevY;
    mageChar.group.position.y = mState.y + mLevY;

    const isUnderground = Boolean(
      kSpec.undergroundHidden ||
        mSpec.undergroundHidden ||
        vfx?.isHeroUndergroundHidden?.()
    );
    knightChar.group.visible = !isUnderground;
    mageChar.group.visible = !isUnderground;
    if (vfxKit.swordVfx?.group) {
      vfxKit.swordVfx.group.visible = !isUnderground;
    }

    setCharacterVerdictShaderState(knightChar, {
      groundClipY: kLevY < -0.02 ? kState.y - 0.02 : -9999,
      dissolveProgress: kSpec.dissolveProgress ?? 0,
      dissolveBaseY: kState.y,
      monochromeOverride: kSpec.monochromeOverride ?? 0,
    });
    setCharacterVerdictShaderState(mageChar, {
      groundClipY: mLevY < -0.02 ? mState.y - 0.02 : -9999,
      dissolveProgress: mSpec.dissolveProgress ?? 0,
      dissolveBaseY: mState.y,
      monochromeOverride: mSpec.monochromeOverride ?? 0,
    });

    return spec;
  }

  return {
    kit,
    rootGroup,
    heroesGroup,
    sanctuarySteleMesh,
    arenaEnemiesGroup: enemyManager.rootGroup,
    knight: knightChar,
    mage: mageChar,
    skeletonWarrior: skelWarrior,
    skeletonMage: skelMage,
    vfxKit,
    frostLance: vfxKit.frostLance,
    enemyManager,
    campaignLoop,
    combatSfx,
    coopClient,
    communeChannel,
    actionAim,
    aimState: actionAim.aimState,
    cameraImpact,
    triggerCameraImpulse,
    getCameraImpactOffset,
    resetCameraImpact,
    clearHeroHitFlashes,
    resetTransientVisualEffects,
    launchMageFrostLance,
    triggerSpell,
    toggleElement,
    startSkillAim,
    updateSkillAim,
    releaseSkillAim,
    heroStates,
    player,
    triggerAction,
    setUnlockedStage,
    isAbilityUnlocked,
    setPraying,
    getHeroDistance,
    getNearestInscriptionStone,
    isNearAltarStele,
    startCommuneChannel,
    setCommuneSuspense,
    cancelCommuneChannel,
    applyCommuneVerdict,
    swapActiveHero,
    teleportLeaderAndPartner,
    setProfile: (nextProfile) => {
      if (nextProfile) currentProfile = nextProfile;
      enemyManager.setProfile?.(nextProfile);
    },
    get soloWingmanActive() {
      return !coopClient.getState().peerConnected;
    },
    poseForShot,
    poseForGameplayShot,
    update,
  };
}
