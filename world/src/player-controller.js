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
import { createCharactersKit } from '../assets/characters/index.js';
import * as ToonSkin from '../assets/characters/toon-skin.js';
import { createVfxKit } from '../assets/vfx/index.js';

function setCharacterVerdictShaderState(charRootOrInstance, state = {}) {
  if (typeof ToonSkin.setCharacterVerdictShaderState === 'function') {
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
  resolveShrineObstacles,
} from './combat/combat-balance.js';
import {
  KNIGHT_COMBO_SPECS,
  MAGE_COMBO_SPECS,
  MAGE_CHARGED_SHATTERLANCE_SPEC,
  createCombatActionAimController,
} from './combat/combat-action-aim.js';
import { createEnemyManager } from './combat/enemy-manager.js';
import { createCampaignLoop } from './combat/campaign-loop.js';
import { createCombatSfx } from './combat/combat-sfx.js';
import { createCoopClient } from './net/coop-client.js';
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
  onHeroSwapped = null,
  onSkyTodChanged = null,
  onHudStateChanged = null,
  onBanner = null,
  onCoopStateChanged = null,
  onRemoteCommuneVerdict = null,
} = {}) {
  const kit = createCharactersKit();
  await kit.loadAnimationPacks();

  const rootGroup = new THREE.Group();
  rootGroup.name = 'stage3CoopCharactersRoot';
  scene.add(rootGroup);

  const heroesGroup = new THREE.Group();
  heroesGroup.name = 'coopHeroesDuoGroup';
  rootGroup.add(heroesGroup);

  const sanctuarySteleMesh = createPlazaSanctuarySteleMesh(walkableHeightAt);
  sanctuarySteleMesh.visible = false;
  rootGroup.add(sanctuarySteleMesh);

  // 1. Instantiate the 2 Co-Op Heroes (Knight + Mage)
  const [knightChar, mageChar] = await Promise.all([
    kit.createCharacter('Knight', {
      initialClip: 'idle',
      position: [initialPos.x, walkableHeightAt(initialPos.x, initialPos.z), initialPos.z],
      rotY: initialPos.yaw,
    }),
    kit.createCharacter('Mage', {
      initialClip: 'idle',
      position: [
        initialPos.x + 1.85,
        walkableHeightAt(initialPos.x + 1.85, initialPos.z + 0.5),
        initialPos.z + 0.5,
      ],
      rotY: initialPos.yaw - 0.25,
    }),
  ]);

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

  // 2. Complete Stage 4 Opaque VFX & Sword Breathing Suite (`createVfxKit`)
  const vfxKit = createVfxKit({
    scene,
    getGroundHeight: walkableHeightAt,
    onApexImpact: () => {},
  });
  vfxKit.swordVfx.attachToKnight(knightChar);

  // 3. WebAudio Synthesized Combat SFX (`createCombatSfx`)
  const combatSfx = createCombatSfx();

  // 4. Pooled 6-Skeleton + Boss Sovereign Enemy Manager (`createEnemyManager`)
  let campaignLoop = null;
  let localHitstopTimer = 0;

  const enemyManager = await createEnemyManager({
    scene,
    kit,
    walkableHeightAt,
    resolveCollisions,
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
        campaignLoop.handlePlayerHit(hState, enemy, dmg, {
          ...hitOpts,
          knightState: heroStates.Knight,
        });
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
      vy: 0,
      yaw: initialPos.yaw,
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
    },
    Mage: {
      id: 'Mage',
      char: mageChar,
      x: initialPos.x + 1.85,
      z: initialPos.z + 0.5,
      y: walkableHeightAt(initialPos.x + 1.85, initialPos.z + 0.5),
      vy: 0,
      yaw: initialPos.yaw - 0.25,
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
    },
  };

  let activeHeroId = 'Knight';
  let partnerHeroId = 'Mage';
  let lastAppliedVerdictAt = 0;
  let lastKnownCamPitch = 0.14;

  // 6. 3-Act Valley Expedition & Synergy Loop (`createCampaignLoop`)
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

      // Soft-lock orientation at swing start for Knight melee swings only;
      // Mage keeps camera yaw at 0ms so Hold-LMB upgrades cleanly into Shatterlance aim,
      // while tap bolts still acquire soft-lock targets at onContactHit!
      if (swing.heroId === 'Knight') {
        const partner = heroStates.Mage;
        const softTarget = selectSoftLockTarget(
          st,
          st.yaw,
          enemyManager.activeEnemies,
          { maxRange: 7.5, partnerPos: partner }
        );
        if (softTarget) {
          st.yaw = Math.atan2(softTarget.x - st.x, softTarget.z - st.z);
        }
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

      startOneShotAction(st, swing.clip, swing.duration, {
        startTime: swing.animStartTime ?? swing.startTime ?? 0,
        timeScale: swing.animTimeScale ?? swing.timeScale,
        fade: 0.06,
      });

      if (swing.heroId === 'Knight') {
        const activeStyle =
          campaignLoop.combatHeroes.Knight.sunSwornBreathing &&
          campaignLoop.combatHeroes.Knight.breathingStyle === 'none'
            ? 'eclipse'
            : campaignLoop.combatHeroes.Knight.breathingStyle || 'none';
        vfxKit.swordVfx?.triggerSwing?.(
          swing.clip,
          { x: st.x, y: st.y, z: st.z },
          st.yaw,
          activeStyle,
          { duration: swing.duration }
        );
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
      campaignLoop.setKnightShieldBlocking(blocking);
      if (blocking) {
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
    },
    onElementToggled: (payload) => {
      campaignLoop.toggleHeroElement(payload.heroId);
      if (payload.heroId === 'Knight') {
        heroStates.Knight.selectedElement = payload.element;
        onBanner?.({
          title:
            payload.element === 'fire'
              ? 'ATTUNED ELEMENT · HINOKAMI SUNFIRE'
              : 'ATTUNED ELEMENT · GLACIAL TIDE',
          subtitle:
            payload.element === 'fire'
              ? 'Press [E] to Ignite Fire Sword (Bonus Strike + Persistent Burn DoT)'
              : 'Press [E] to Ignite Ice Sword (Slows Enemy Speed, Attack & Damage)',
          kind: 'act',
        });
      } else {
        heroStates.Mage.selectedSpell = payload.spellId;
        heroStates.Mage.selectedElement = payload.element;
        onBanner?.({
          title:
            payload.spellId === 'cinder_fall'
              ? 'SPELLBOOK [E] · CINDER FALL METEOR'
              : 'SPELLBOOK [E] · FROST LANCE GLACIER',
          subtitle:
            payload.spellId === 'cinder_fall'
              ? 'Hold [E] to Aim Meteor Distance (3..16m) · Release [E] to Cast (8.5s CD)'
              : 'Hold [E] to Aim Glacier Line (14.5m) · Release [E] to Cast (8.5s CD)',
          kind: 'act',
        });
      }
    },
    onAimChanged: (aim, phase) => {
      const aimArrow = vfxKit?.aimArrow;
      const arrowPayload = {
        ...aim,
        direction: { x: aim.dirX, y: 0, z: aim.dirZ },
        mode: aim.spellId,
        style: aim.spellId === 'cinder_fall' ? 'fire' : 'ice',
      };
      if (phase === 'hide') {
        aimArrow?.hide?.();
        if (!aim.isReleasingCast || aim.spellId !== 'shatterlance') {
          vfxKit?.shatterlance?.cancelCharge?.();
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
          vfxKit?.shatterlance?.updateChargeHold?.({
            origin: { x: heroStates.Mage.x, y: heroStates.Mage.y, z: heroStates.Mage.z },
            yaw: aim.yaw ?? heroStates.Mage.yaw,
            dirX: aim.dirX,
            dirZ: aim.dirZ,
            direction: { x: aim.dirX, y: 0, z: aim.dirZ },
            chargeProgress: 0.25,
            active: true,
            dt: 0.016,
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
            dt: 0.016,
          });
        }
      }
    },
    onAimCast: (castPayload) => {
      const mageState = heroStates.Mage;
      if (castPayload.spellId !== 'shatterlance') {
        vfxKit?.shatterlance?.cancelCharge?.();
      }
      mageState.yaw = castPayload.yaw;
      applyTransform(mageState);
      startOneShotAction(mageState, 'cast_spell', 0.62, {
        startTime: 0,
        timeScale: 1.0,
        fade: 0.08,
      });
      if (castPayload.spellId === 'shatterlance') {
        mageState.consecutiveChargedCount = (mageState.consecutiveChargedCount || 0) + 1;
        campaignLoop.combatHeroes.Mage.consecutiveChargedCount = mageState.consecutiveChargedCount;
      }
      const res = campaignLoop.performPartnerSkill('Mage', heroStates, {
        spellId: castPayload.spellId,
        yaw: castPayload.yaw,
        distance: castPayload.distance,
        targetPos: castPayload.targetPos,
      });
      coopClient.sendSpellCast({
        spellId: castPayload.spellId,
        origin: { x: mageState.x, y: mageState.y, z: mageState.z },
        yaw: mageState.yaw,
        distance: castPayload.distance,
        targetPos: castPayload.targetPos,
      });
      onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
      return res;
    },
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
        siteKey: 'well',
        rotY: 0.0,
        position: { x: 0.0, y: 0.0, z: 0.0 },
      },
      // Site 2: Whispering Grove Circular Floor Medallion at (44, 16)
      {
        ...SACRED_INSCRIPTION_STONES[1],
        siteKey: 'grove',
        rotY: 0.0,
        position: { x: 44.0, y: 0.42, z: 16.0 },
      },
      // Site 3: Secluded Cottage Ornamental Wall at (-21.6, 20.4, rotY = 0.45)
      {
        ...SACRED_INSCRIPTION_STONES[2],
        siteKey: 'cottage_wall',
        rotY: 0.45,
        position: { x: -21.6, y: 0.0, z: 20.4 },
      },
    ];

    for (const stone of physicalSites) {
      if (!stone?.position) continue;
      const siteRadius = stone.id === 'stone_grove' ? Math.max(bestDist, 5.6) : bestDist;
      const d = Math.hypot(leader.x - stone.position.x, leader.z - stone.position.z);
      if (d <= siteRadius && d <= bestDist + (stone.id === 'stone_grove' ? 1.1 : 0)) {
        bestDist = Math.min(bestDist, d);
        best = { ...stone, distance: Number(d.toFixed(2)) };
      }
    }
    if (!best) {
      const dLegacy = Math.hypot(leader.x - ALTAR_STELE_POS.x, leader.z - ALTAR_STELE_POS.z);
      if (dLegacy <= bestDist) {
        best = {
          ...SACRED_INSCRIPTION_STONES[0],
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
        onBanner?.({
          title: 'STAND WITHIN 4.0m TO PRAY',
          subtitle: `Move closer to your beloved (${gate.distance.toFixed(1)}m / 4.0m max) to open the Court of Dark Flowers.`,
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

  function cancelCommuneChannel({ broadcast = true } = {}) {
    communeChannel.active = false;
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
    applyTransform(heroStates.Knight);
    applyTransform(heroStates.Mage);
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
    communeChannel.active = false;
    heroStates.Knight.praying = false;
    heroStates.Mage.praying = false;

    const res = campaignLoop.applyCommuneVerdict(judgment, speakerRole, heroStates);
    applyTransform(heroStates.Knight);
    applyTransform(heroStates.Mage);

    const verdict = String(judgment?.verdict || 'smite').toLowerCase();
    triggerCameraImpulse({
      intensity: verdict === 'miracle' ? 0.32 : verdict === 'smite' ? 0.28 : 0.18,
      fovKick: verdict === 'miracle' ? 2.8 : verdict === 'smite' ? 2.2 : 1.4,
      kind: 'cataclysm',
    });

    return res;
  }

  // 7. WebSocket 2-Player Co-Op Client (`createCoopClient`)
  const remotePartnerTarget = {
    active: false,
    x: heroStates.Mage.x,
    y: heroStates.Mage.y,
    z: heroStates.Mage.z,
    yaw: heroStates.Mage.yaw,
    clip: 'idle',
  };

  const coopClient = createCoopClient({
    preferredRole: activeHeroId,
    onRoomState: (roomState) => {
      if (roomState.peerConnected && roomState.role && roomState.role !== activeHeroId) {
        activeHeroId = roomState.role;
        partnerHeroId = activeHeroId === 'Knight' ? 'Mage' : 'Knight';
        syncSharedPlayerFromLeader();
        onHeroSwapped?.(activeHeroId, partnerHeroId);
      }
      remotePartnerTarget.active = Boolean(roomState.peerConnected);
      onCoopStateChanged?.(roomState);
    },
    onPeerHeroState: (msg) => {
      const peerRole = msg.role === 'Knight' ? 'Knight' : 'Mage';
      if (peerRole === activeHeroId) return;
      remotePartnerTarget.active = true;
      if (typeof msg.x === 'number') remotePartnerTarget.x = msg.x;
      if (typeof msg.y === 'number') remotePartnerTarget.y = msg.y;
      if (typeof msg.z === 'number') remotePartnerTarget.z = msg.z;
      if (typeof msg.yaw === 'number') remotePartnerTarget.yaw = msg.yaw;
      if (msg.clip && heroStates[peerRole]) {
        playHeroLocomotionClip(heroStates[peerRole], msg.clip);
      }
    },
    onPeerSpellCast: (msg) => {
      const spellId = msg.spellId || msg.spell || 'frost_lance';
      const caster = heroStates.Mage;
      const yaw = msg.yaw ?? caster.yaw;
      startOneShotAction(caster, 'cast_spell', 0.62, {
        startTime: 0,
        timeScale: 1.0,
        fade: 0.08,
      });
      campaignLoop.castSpell(spellId, msg.origin || caster, yaw, heroStates.Knight, {
        distance: msg.distance,
        targetPos: msg.targetPos,
      });
    },
    onPeerAction: (msg) => {
      const role = msg.role === 'Knight' ? 'Knight' : 'Mage';
      const st = heroStates[role];
      if (!st) return;
      if (
        msg.action === 'combo1' ||
        msg.action === 'combo2' ||
        msg.action === 'combo3' ||
        msg.action === 'combo4'
      ) {
        startOneShotAction(st, msg.action, 0.56, {
          startTime: 0,
          timeScale: 1.0,
          fade: 0.07,
        });
        if (role === 'Knight') {
          campaignLoop.performKnightSwing(msg.action, st, msg.yaw ?? st.yaw, heroStates.Mage);
        }
      } else if (msg.action === 'block' || msg.action === 'shield_block') {
        campaignLoop.setKnightShieldBlocking(true);
        st.char.play('block', { loop: true, fade: 0.08, startTime: 0, force: true });
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
          });
        } else {
          campaignLoop.performMageBoltAttack(cIdx, st, heroStates.Knight);
        }
      } else if (msg.action === 'skill') {
        campaignLoop.performPartnerSkill(role, heroStates);
      } else if (msg.action === 'ultimate') {
        if (role === 'Knight') {
          campaignLoop.performKnightUltimate(heroStates);
        } else {
          campaignLoop.performMageStormCataclysm(heroStates);
        }
      }
    },
    onWorldSync: (msg) => {
      campaignLoop.applyRemoteStateSync(msg);
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
    onCommuneVerdict: (msg) => {
      if (Date.now() - lastAppliedVerdictAt < 1500) return;
      const judgment = msg.judgment || msg;
      const speakerRole = msg.speakerRole || msg.fromRole || partnerHeroId;
      applyCommuneVerdict(judgment, speakerRole);
      onRemoteCommuneVerdict?.(judgment, speakerRole);
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

  function triggerSpell(slotOrId, options = {}) {
    ensureCombatUnfrozen();
    if (isPlayerControlLocked()) {
      return { blockedByControlLock: true };
    }
    const spell =
      typeof slotOrId === 'number'
        ? SPELL_BY_SLOT[slotOrId]
        : SPELLS[slotOrId] || SPELL_BY_SLOT[Number(slotOrId)] || SPELLS.frost_lance;
    if (!spell) return null;

    const mageState = heroStates.Mage;
    const knightState = heroStates.Knight;
    const leader = heroStates[activeHeroId];

    const softTarget = selectSoftLockTarget(
      leader,
      leader.yaw,
      enemyManager.activeEnemies,
      { maxRange: spell.range, partnerPos: knightState }
    );

    let aimYaw = options.yaw ?? leader.yaw;
    if (softTarget && options.yaw === undefined) {
      aimYaw = Math.atan2(softTarget.x - mageState.x, softTarget.z - mageState.z);
    }

    const res = campaignLoop.castSpell(spell.id, mageState, aimYaw, knightState, options);
    if (!res || res.onCooldown) return res;

    mageState.yaw = res.targetYaw ?? aimYaw;
    applyTransform(mageState);
    const castClip = spell.slot === 2 || spell.slot === 4 ? 'cast_shoot' : 'cast_spell';
    startOneShotAction(mageState, castClip, 0.62, {
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
    return actionAim.toggleElement(heroId);
  }

  function startSkillAim(opts = {}) {
    if (isPlayerControlLocked()) return { blockedByControlLock: true };
    const mageState = heroStates.Mage;
    const chosenSpell = opts.spellId || heroStates.Mage.selectedSpell || 'frost_lance';
    if (typeof opts.yaw === 'number') {
      mageState.yaw = opts.yaw;
      applyTransform(mageState);
    }
    if (chosenSpell === 'shatterlance') {
      actionAim.cancelSwing('Mage');
      mageState.lungeRemaining = 0;
      mageState.actionState = 'cast_hold';
      mageState.actionTimer = 999;
      mageState.char.play('cast_spell', {
        loop: true,
        fade: 0.06,
        startTime: 0,
        timeScale: 0.85,
        force: true,
      });
      applyTransform(mageState);
    }
    return actionAim.startSkillAim({
      origin: opts.origin || { x: mageState.x, y: mageState.y, z: mageState.z },
      yaw: opts.yaw ?? mageState.yaw,
      pitch: opts.pitch ?? lastKnownCamPitch,
      distance: opts.distance,
      touchTarget: opts.touchTarget,
      spellId: chosenSpell,
    });
  }

  function updateSkillAim(opts = {}) {
    return actionAim.updateSkillAim(opts);
  }

  function releaseSkillAim(opts = null) {
    if (isPlayerControlLocked()) {
      actionAim.cancelSkillAim();
      return { blockedByControlLock: true };
    }
    return actionAim.releaseSkillAim(opts);
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
      if (leader.id === 'Knight' && leader.shieldBlocking) {
        actionAim.releaseHeavy('Knight');
      }
      actionAim.cancelSwing(leader.id);
      if (leader.id === 'Knight') {
        vfxKit.swordVfx?.endSwing?.();
      }
      leader.lungeRemaining = 0;

      // Prevent rapid Shift taps from re-locking Dodge_Forward while already dashing or on dash cooldown;
      // instead cancel any attack action cleanly so WASD + Shift transitions smoothly into sprint!
      if (leader.dashCooldown > 0 || leader.actionState === 'dash') {
        if (leader.actionState !== 'dash') {
          leader.actionState = null;
          leader.actionTimer = 0;
        }
        return { onDashCooldown: true };
      }

      leader.dashCooldown = 0.58;
      leader.dashDirX = Math.sin(leader.yaw);
      leader.dashDirZ = Math.cos(leader.yaw);
      startOneShotAction(leader, 'dash', 0.30, {
        startTime: 0.04,
        timeScale: 1.25,
        fade: 0.06,
      });
      campaignLoop.combatHeroes[activeHeroId].iframeTimer = 0.3;

      const dodgeRes = enemyManager.checkPerfectDodge(leader);
      if (dodgeRes.triggered) {
        campaignLoop.awardPerfectDodgeEnergy?.(activeHeroId);
        campaignLoop.addResonance(dodgeRes.resonanceGain || 20);
        combatSfx.playPerfectDodge();
        onBanner?.({
          title: 'PERFECT DODGE · TIME DILATION',
          subtitle: 'Attacker Slowed to 0.30× · +12 Q Energy · Next Strike Empowered (+35% DMG)',
          kind: 'blessing',
        });
      }
      coopClient.sendActionEvent({
        role: activeHeroId,
        action: 'dash',
        x: leader.x,
        y: leader.y,
        z: leader.z,
        yaw: leader.yaw,
      });
      onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
      return;
    }

    if (actionType === 'attack') {
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
        const res = campaignLoop.performPartnerSkill('Knight', heroStates, actionOptions);
        if (res && !res.onCooldown) {
          startOneShotAction(leader, 'combo1', 0.46, {
            startTime: 0.04,
            timeScale: 1.25,
            fade: 0.06,
          });
          applyTransform(leader);
          leader.char.update(0);
          vfxKit.swordVfx.triggerSwing(
            'combo1',
            leader,
            leader.yaw,
            campaignLoop.combatHeroes.Knight.breathingStyle
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
      startSkillAim(actionOptions);
      return releaseSkillAim(actionOptions);
    }

    if (actionType === 'ultimate') {
      if (activeHeroId === 'Knight') {
        if (leader.shieldBlocking) {
          actionAim.releaseHeavy('Knight');
        }
        actionAim.cancelSwing('Knight');
        vfxKit.swordVfx?.endSwing?.();
        const res = campaignLoop.performKnightUltimate(heroStates, { requireEnergy: true });
        if (res && !res.onCooldown && !res.notEnoughEnergy) {
          startOneShotAction(heroStates.Knight, 'pray_channel', 0.68, {
            startTime: 0,
            timeScale: 1.05,
            fade: 0.08,
          });
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
    if (isPlayerControlLocked()) return activeHeroId;
    const prevLeader = heroStates[activeHeroId];
    prevLeader.praying = false;
    if (prevLeader.id === 'Knight' && prevLeader.shieldBlocking) {
      actionAim.releaseHeavy('Knight');
    }
    actionAim.cancelSkillAim();
    activeHeroId = activeHeroId === 'Knight' ? 'Mage' : 'Knight';
    partnerHeroId = activeHeroId === 'Knight' ? 'Mage' : 'Knight';
    syncSharedPlayerFromLeader();
    coopClient.swapRoles();
    if (onHeroSwapped) {
      onHeroSwapped(activeHeroId, partnerHeroId);
    }
    onHudStateChanged?.(campaignLoop.getStateSnapshot(heroStates));
    return activeHeroId;
  }

  function teleportLeaderAndPartner(x, z, yaw = Math.PI) {
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
    }
    leader.actionState = null;
    leader.actionTimer = 0;
    leader.praying = false;
    applyTransform(leader);
    playHeroLocomotionClip(leader, 'idle');

    const wingAngle = yaw - 1.85;
    const wx = x + Math.sin(wingAngle) * 1.95;
    const wz = z + Math.cos(wingAngle) * 1.95;
    partner.x = wx;
    partner.z = wz;
    partner.y = walkableHeightAt(wx, wz);
    partner.vy = 0;
    partner.yaw = yaw - 0.18;
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
    const controlLocked = isPlayerControlLocked();

    // Advance 1-input swing buffer, mash speed ramp, and contact-frame hit detection
    if (!controlLocked) {
      actionAim.update(dt);
      leader.bufferedAttack = actionAim.heroes[leader.id].bufferedAttack;
      leader.mashTimeScale = actionAim.heroes[leader.id].mashTimeScale;

      if (actionAim.aimState.active && activeHeroId === 'Mage') {
        const aimYaw = typeof camYaw === 'number' ? camYaw : actionAim.aimState.yaw ?? heroStates.Mage.yaw;
        heroStates.Mage.yaw = aimYaw;
        applyTransform(heroStates.Mage);
        actionAim.updateSkillAim({
          origin: { x: heroStates.Mage.x, y: heroStates.Mage.y, z: heroStates.Mage.z },
          yaw: aimYaw,
          pitch: lastKnownCamPitch,
        });
        if (actionAim.aimState.spellId === 'shatterlance') {
          heroStates.Mage.actionState = 'cast_hold';
          heroStates.Mage.actionTimer = 999;
          vfxKit?.shatterlance?.updateChargeHold?.({
            origin: { x: heroStates.Mage.x, y: heroStates.Mage.y, z: heroStates.Mage.z },
            yaw: aimYaw,
            dirX: actionAim.aimState.dirX,
            dirZ: actionAim.aimState.dirZ,
            direction: { x: actionAim.aimState.dirX, y: 0, z: actionAim.aimState.dirZ },
            active: true,
            dt,
          });
        }
      }
    }

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
        const dashSpeed = player.speed * 2.05;
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
      if (leader.actionTimer <= 0 && !campaignLoop.combatHeroes.Mage.stormCataclysmActive) {
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

      // Damp WASD movement to 0.18x during active melee attacks so feet stay planted and never skate!
      const isMageAimingNow = Boolean(leader.id === 'Mage' && actionAim.aimState.active);
      const blockMult = leader.shieldBlocking ? 0.35 : isMageAimingNow ? 0.55 : 1.0;
      const actionMult =
        leader.actionState && !leader.shieldBlocking && !isMageAimingNow ? 0.18 : 1.0;
      const spd =
        player.speed *
        (isSprinting && !isMageAimingNow ? player.sprintMult : moveMag < 0.55 ? 0.56 : 1.0) *
        blockMult *
        actionMult;

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
        isMageAimingNow ||
          (activeSw && !activeSw.contactFired && activeSw.elapsed < activeSw.contactTime)
      );
      if (isMageAimingNow) {
        leader.yaw = typeof camYaw === 'number' ? camYaw : actionAim.aimState.yaw ?? leader.yaw;
        applyTransform(leader);
        actionAim.updateSkillAim({
          origin: { x: leader.x, y: walkableHeightAt(leader.x, leader.z), z: leader.z },
          yaw: leader.yaw,
          pitch: lastKnownCamPitch,
        });
      } else if (!lockYawForStrike) {
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
      if (moveMag < 0.08) {
        playHeroLocomotionClip(leader, 'idle');
      } else if (isSprinting) {
        playHeroLocomotionClip(leader, 'sprint');
      } else if (moveMag < 0.55) {
        playHeroLocomotionClip(leader, 'walk');
      } else {
        playHeroLocomotionClip(leader, 'run');
      }
    }

    // 3. Update Co-Op Partner (Remote Peer Interpolation OR Solo Wingman Follow AI)
    if (partner.actionTimer > 0) {
      partner.actionTimer = Math.max(0, partner.actionTimer - dt);
      if (partner.actionTimer <= 0) {
        partner.actionState = null;
      }
    }

    const isPeerLinked = Boolean(coopClient.getState().peerConnected && remotePartnerTarget.active);
    const blessingActive = Boolean(campaignLoop.isDivineBlessingActive?.());
    if (isPeerLinked) {
      if (!controlLocked) {
        partner.x += (remotePartnerTarget.x - partner.x) * Math.min(1, 12 * dt);
        partner.z += (remotePartnerTarget.z - partner.z) * Math.min(1, 12 * dt);
        partner.y = walkableHeightAt(partner.x, partner.z);
        partner.yaw += shortestAngleDiff(remotePartnerTarget.yaw, partner.yaw) * Math.min(1, 12 * dt);
      }
    } else if (!controlLocked && !campaignLoop.combatHeroes[partner.id]?.downed) {
      const wingOffsetAngle = leader.yaw - 2.1;
      const wingOffsetDist = blessingActive ? 1.45 : 2.15;
      const targetWingX = leader.x + Math.sin(wingOffsetAngle) * wingOffsetDist;
      const targetWingZ = leader.z + Math.cos(wingOffsetAngle) * wingOffsetDist;
      const dxW = targetWingX - partner.x;
      const dzW = targetWingZ - partner.z;
      const distW = Math.hypot(dxW, dzW);

      if (didWrap || distW > 18.0 || (blessingActive && distW > 3.6)) {
        partner.x = targetWingX;
        partner.z = targetWingZ;
        partner.y = walkableHeightAt(partner.x, partner.z);
        partner.yaw = leader.yaw;
        playHeroLocomotionClip(partner, 'idle');
      } else if (distW > (blessingActive ? 0.45 : 0.65) && !partner.actionState && !leader.praying) {
        const dirX = dxW / distW;
        const dirZ = dzW / distW;
        const partnerSpd = blessingActive
          ? player.speed * player.sprintMult * 1.25
          : distW > 4.2
            ? player.speed * player.sprintMult
            : distW > 1.75
              ? player.speed * 1.02
              : player.speed * 0.56;
        const step = Math.min(distW - (blessingActive ? 0.25 : 0.45), partnerSpd * dt);
        const nextP = resolveCollisions(
          partner.x + dirX * step,
          partner.z + dirZ * step,
          player.radius * 0.9
        );
        partner.x = nextP.x;
        partner.z = nextP.z;
        partner.y = walkableHeightAt(partner.x, partner.z);

        const pTargetYaw = Math.atan2(dirX, dirZ);
        partner.yaw += shortestAngleDiff(pTargetYaw, partner.yaw) * Math.min(1, 14 * dt);

        if (distW > 4.2 || (isSprinting && moveMag > 0.2)) {
          playHeroLocomotionClip(partner, 'sprint');
        } else if (distW > 1.75 || moveMag > 0.55) {
          playHeroLocomotionClip(partner, 'run');
        } else {
          playHeroLocomotionClip(partner, 'walk');
        }
      } else if (!partner.actionState && !leader.praying) {
        partner.y = walkableHeightAt(partner.x, partner.z);
        partner.yaw += shortestAngleDiff(leader.yaw - 0.22, partner.yaw) * Math.min(1, 5 * dt);
        playHeroLocomotionClip(partner, 'idle');
      }
    }

    // 4. Update 3-Act Campaign Loop & Pooled Enemy AI, then Hero Skeletons, then Stage 4 Opaque VFX Kit
    campaignLoop.update(dt, {
      heroStates,
      activeHeroId,
      soloWingmanActive: !isPeerLinked,
      camera,
    });

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
      yaw: leader.yaw,
      clip: leader.char.anim.currentKey,
    });

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

    stepCameraImpact(dt);
  }

  function poseForShot(shotId, fallbackPlayerPos = null, camera = null) {
    resetCameraImpact();
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
    launchMageFrostLance,
    triggerSpell,
    toggleElement,
    startSkillAim,
    updateSkillAim,
    releaseSkillAim,
    heroStates,
    player,
    triggerAction,
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
    poseForShot,
    poseForGameplayShot,
    update,
  };
}
