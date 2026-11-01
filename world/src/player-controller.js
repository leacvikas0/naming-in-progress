// ============================================================================
// world/src/player-controller.js
//
// Stage 4 & 5 Live World Integration:
// - Co-Op Hero Duo (`Knight` + `Mage`) with 100% Native Skeletal Animations
// - Complete Stage 4 Opaque VFX & *Demon Slayer* Sword Breathing Suite (`createVfxKit`)
// - Pooled 6-Skeleton + Boss Sovereign Enemy Manager (`createEnemyManager`, <= 5 visible)
// - 3-Act Valley Expedition & Shared 2-InstancedMesh Combat Indicators (`createCampaignLoop`)
// - WebAudio Synthesized Combat SFX (`createCombatSfx`)
// - Cloudflare / Local WebSocket 2-Player Co-Op Client (`createCoopClient`)
// - Deterministic `poseForShot(shotId)` (0 VFX/Indicator draws for `shoot-world.mjs`)
//   and `poseForGameplayShot(gameplayShotId)` (8 live Stage 5 combat & UI plates).
// ============================================================================

import * as THREE from 'three';
import { createCharactersKit } from '../assets/characters/index.js';
import { createVfxKit } from '../assets/vfx/index.js';
import {
  clamp,
  shortestAngleDiff,
  HERO_STATS,
  BREATHING_STYLES,
  SPELLS,
  SPELL_BY_SLOT,
  ACT_DEFINITIONS,
  selectSoftLockTarget,
  resolveShrineObstacles,
} from './combat/combat-balance.js';
import { createEnemyManager } from './combat/enemy-manager.js';
import { createCampaignLoop } from './combat/campaign-loop.js';
import { createCombatSfx } from './combat/combat-sfx.js';
import { createCoopClient } from './net/coop-client.js';

/**
 * Configures generous local bounding spheres and enables `frustumCulled = true`
 * on a unified character's `SkinnedMesh` pair so off-screen characters cost 0
 * draw calls when outside the camera frustum.
 */
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

/**
 * Deterministic architectural shot pose table for `window.__WORLD__.setShot(shotId)`.
 */
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
};

/**
 * Deterministic Stage 5 Gameplay & UI Showcase Plates (`shoot-stage5-gameplay.mjs`).
 */
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
    mage: { x: 70.35, z: -2.65, rotY: 1.42, clip: 'cast_spell', time: 0.48, hp: 180, shield: 0 },
    breathingStyle: 'solar',
    breathingTimer: 11.4,
    heartResonance: 64,
    activeSpellSlot: 3,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 4.8, storm_lance: 0 },
    banner: {
      title: '☀️ HINOKAMI SUNFIRE · BLADE IGNITED',
      subtitle: 'Strike Sunbranded Enemies with 3rd Hit or Hold LMB for Solar Flare!',
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
    mage: { x: 59.8, z: -4.0, rotY: Math.PI * 0.5, clip: 'cast_spell', time: 0.38, hp: 180, shield: 20 },
    breathingStyle: 'rime',
    breathingTimer: 12.0,
    heartResonance: 78,
    activeSpellSlot: 2,
    spellCooldowns: { frost_lance: 1.8, shatterlance: 5.6, cinder_fall: 0, storm_lance: 0 },
    banner: {
      title: '💎 2 · SHATTERLANCE RAILGUN SPEAR',
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
    mage: { x: 68.2, z: -1.65, rotY: 1.42, clip: 'cast_spell', time: 0.54, hp: 180, shield: 0 },
    breathingStyle: 'solar',
    breathingTimer: 11.8,
    heartResonance: 86,
    activeSpellSlot: 3,
    spellCooldowns: { frost_lance: 0, shatterlance: 2.4, cinder_fall: 6.4, storm_lance: 0 },
    banner: {
      title: '☀️ 3 · CINDER FALL VOLCANIC ASTEROID',
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
    mage: { x: 59.8, z: -4.0, rotY: Math.PI * 0.5, clip: 'cast_shoot', time: 0.36, hp: 180, shield: 35 },
    breathingStyle: 'tempest',
    breathingTimer: 11.6,
    heartResonance: 92,
    activeSpellSlot: 4,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 1.9, storm_lance: 5.1 },
    banner: {
      title: '⚡ 4 · STORM LANCE · CHAIN FULGURITE',
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
    mage: { x: 70.45, z: -2.65, rotY: 1.42, clip: 'cheer', time: 0.45, hp: 180, shield: 35 },
    breathingStyle: 'rime',
    breathingTimer: 10.5,
    heartResonance: 100,
    activeSpellSlot: 1,
    spellCooldowns: { frost_lance: 2.2, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    touchDemo: { joyX: 0.62, joyY: 0.68, sprinting: true, activeAction: 'attack' },
    banner: {
      title: '❄️ SHATTERBLOW! · GLACIAL TIDE DETONATION',
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
    mage: { x: -36.4, z: 8.1, rotY: -1.25, clip: 'wave', time: 0.48, hp: 180, shield: 35 },
    breathingStyle: 'solar',
    breathingTimer: 12.0,
    heartResonance: 85,
    activeSpellSlot: null,
    spellCooldowns: { frost_lance: 0, shatterlance: 0, cinder_fall: 0, storm_lance: 0 },
    banner: {
      title: '🌅 SANCTUARY BRAZIER KINDLED',
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
    mage: { x: 2.35, z: 6.9, rotY: Math.PI - 0.25, clip: 'cast_spell', time: 0.46, hp: 180, shield: 35 },
    breathingStyle: 'solar',
    breathingTimer: 10.2,
    heartResonance: 90,
    activeSpellSlot: 1,
    spellCooldowns: { frost_lance: 3.2, shatterlance: 0, cinder_fall: 1.5, storm_lance: 0 },
    banner: {
      title: '🛡️ ACT II · TWILIGHT HAMLET DEFENSE',
      subtitle: '3-Token Attacker AI · Dodge Opaque Ground Telegraph Rings on Cobblestones',
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
    mage: { x: 2.95, z: -82.8, rotY: Math.PI + 0.42, clip: 'burst_aoe', time: 0.52, hp: 180, shield: 50 },
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
      title: '👑 RIME & SOLAR CATACLYSM! · BONE AEGIS SHATTERED',
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
} = {}) {
  const kit = createCharactersKit();
  await kit.loadAnimationPacks();

  const rootGroup = new THREE.Group();
  rootGroup.name = 'stage3CoopCharactersRoot';
  scene.add(rootGroup);

  const heroesGroup = new THREE.Group();
  heroesGroup.name = 'coopHeroesDuoGroup';
  rootGroup.add(heroesGroup);

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

  // 2. Complete Stage 4 Opaque VFX & Sword Breathing Suite (`createVfxKit`)
  const vfxKit = createVfxKit({
    scene,
    getGroundHeight: walkableHeightAt,
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
    onDetonation: (det) => {
      localHitstopTimer = 0.07;
      knightChar.mixer.timeScale = 0.05;
      if (onBanner && det) {
        onBanner({
          title: `${det.label} · +${det.bonusDmg} AoE BURST`,
          subtitle: 'Elemental Mark Consumed · +18% Heart Resonance',
          kind: 'detonation',
        });
      }
    },
    onBossAegisChanged: ({ aegisActive, aegisLayers, aegisRaised, aegisBroken }) => {
      if (onBanner) {
        if (aegisRaised) {
          onBanner({
            title: '🛡️ THE HOLLOW SOVEREIGN RAISES BONE AEGIS!',
            subtitle: 'Break Both Shield Layers with Physical Detonations or Q: Cataclysm',
            kind: 'warning',
          });
        } else if (aegisBroken && !aegisActive) {
          onBanner({
            title: '💥 BONE AEGIS SHATTERED!',
            subtitle: 'The Hollow Sovereign is Staggered and Vulnerable!',
            kind: 'detonation',
          });
        }
      }
    },
    onPlayerHit: (targetHero, enemy, dmg) => {
      const hState = heroStates[targetHero.id];
      if (campaignLoop) {
        campaignLoop.handlePlayerHit(hState, enemy, dmg);
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
      dashDirX: 0,
      dashDirZ: 0,
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
      dashDirX: 0,
      dashDirZ: 0,
      praying: false,
      landTimer: 0,
    },
  };

  let activeHeroId = 'Knight';
  let partnerHeroId = 'Mage';

  // 6. 3-Act Valley Expedition & Synergy Loop (`createCampaignLoop`)
  campaignLoop = createCampaignLoop({
    scene,
    walkableHeightAt,
    enemyManager,
    vfxKit,
    combatSfx,
    onSkyTodChanged,
    onBanner,
    onHudStateChanged,
    onDetonation: (det) => {
      localHitstopTimer = 0.07;
      knightChar.mixer.timeScale = 0.05;
      if (onBanner && det) {
        onBanner({
          title: `${det.label} · +${det.bonusDmg} AoE BURST`,
          subtitle: 'Elemental Mark Detonated · +18% Heart Resonance',
          kind: 'detonation',
        });
      }
    },
  });

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
      startOneShotAction(caster, 'cast_spell', 0.62, { timeScale: 1.2, fade: 0.08 });
      campaignLoop.castSpell(spellId, msg.origin || caster, yaw, heroStates.Knight);
    },
    onPeerAction: (msg) => {
      const role = msg.role === 'Knight' ? 'Knight' : 'Mage';
      const st = heroStates[role];
      if (!st) return;
      if (msg.action === 'combo1' || msg.action === 'combo2' || msg.action === 'combo3' || msg.action === 'charged') {
        startOneShotAction(st, msg.action, 0.54, { timeScale: 1.24, fade: 0.08 });
        if (role === 'Knight') {
          campaignLoop.performKnightSwing(msg.action, st, msg.yaw ?? st.yaw, heroStates.Mage);
        }
      } else if (msg.action === 'skill') {
        campaignLoop.performPartnerSkill(role, heroStates);
      } else if (msg.action === 'ultimate') {
        campaignLoop.addResonance(100);
        campaignLoop.performCouplesUltimate(heroStates);
      }
    },
    onWorldSync: (msg) => {
      campaignLoop.applyRemoteStateSync(msg);
    },
  });

  // Shared `player` telemetry object mutated in-place for compatibility with `main.js`
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
    st.char.group.position.set(st.x, st.y, st.z);
    st.char.group.rotation.y = st.yaw;
  }

  function playHeroLocomotionClip(st, nextLoco) {
    if (st.actionState) return;
    if (st.locomotionState === nextLoco && st.char.anim.currentKey === nextLoco) return;
    st.locomotionState = nextLoco;
    const isOnce = nextLoco === 'jump_start' || nextLoco === 'jump_land';
    st.char.play(nextLoco, {
      loop: !isOnce,
      fade: isOnce ? 0.08 : 0.14,
      timeScale: nextLoco === 'sprint' ? 1.22 : 1.0,
    });
  }

  function startOneShotAction(st, clipKey, duration, { timeScale = 1.0, fade = 0.1 } = {}) {
    st.actionState = clipKey;
    st.actionTimer = duration;
    st.char.play(clipKey, {
      loop: false,
      fade,
      timeScale,
      force: true,
    });
  }

  function ensureCombatUnfrozen() {
    if (enemyManager.frozenShotId) {
      enemyManager.setFrozenForShot(null);
    }
    campaignLoop.setIndicatorsHiddenForShot(false, heroStates);
  }

  /**
   * Casts one of the 4 Signature Spells (`1: frost_lance`, `2: shatterlance`,
   * `3: cinder_fall`, `4: storm_lance`). Works seamlessly whether the player
   * is currently controlling Mage OR commanding Mage as their Wingman while playing Knight!
   */
  function triggerSpell(slotOrId) {
    ensureCombatUnfrozen();
    const spell =
      typeof slotOrId === 'number'
        ? SPELL_BY_SLOT[slotOrId]
        : SPELLS[slotOrId] || SPELL_BY_SLOT[Number(slotOrId)] || SPELLS.frost_lance;
    if (!spell) return null;

    const mageState = heroStates.Mage;
    const knightState = heroStates.Knight;
    const leader = heroStates[activeHeroId];

    // Determine aim direction from active leader or soft-locked enemy
    const softTarget = selectSoftLockTarget(
      leader,
      leader.yaw,
      enemyManager.activeEnemies,
      { maxRange: spell.range, partnerPos: knightState }
    );

    let aimYaw = leader.yaw;
    if (softTarget) {
      aimYaw = Math.atan2(softTarget.x - mageState.x, softTarget.z - mageState.z);
    }

    const res = campaignLoop.castSpell(spell.id, mageState, aimYaw, knightState);
    if (!res || res.onCooldown) return res;

    mageState.yaw = res.targetYaw ?? aimYaw;
    applyTransform(mageState);
    const castClip = spell.slot === 2 || spell.slot === 4 ? 'cast_shoot' : 'cast_spell';
    startOneShotAction(mageState, castClip, 0.62, { timeScale: 1.24, fade: 0.08 });

    coopClient.sendSpellCast({
      spellId: spell.id,
      origin: { x: mageState.x, y: mageState.y, z: mageState.z },
      yaw: mageState.yaw,
      targetPos: res.targetPos,
    });

    onHudStateChanged?.(campaignLoop.getStateSnapshot());
    return res;
  }

  function launchMageFrostLance() {
    return triggerSpell(1);
  }

  function triggerAction(actionType) {
    ensureCombatUnfrozen();
    const leader = heroStates[activeHeroId];
    const partner = heroStates[partnerHeroId];

    if (actionType === 'jump') {
      if (leader.grounded) {
        leader.vy = 7.4;
        leader.grounded = false;
        leader.actionState = null;
        leader.actionTimer = 0;
        playHeroLocomotionClip(leader, 'jump_start');
      }
      return;
    }

    if (actionType === 'dash') {
      leader.dashDirX = Math.sin(leader.yaw);
      leader.dashDirZ = Math.cos(leader.yaw);
      startOneShotAction(leader, 'dash', 0.32, { timeScale: 1.35, fade: 0.06 });
      campaignLoop.combatHeroes[activeHeroId].iframeTimer = 0.30;

      const dodgeRes = enemyManager.checkPerfectDodge(leader);
      if (dodgeRes.triggered) {
        campaignLoop.combatHeroes[activeHeroId].perfectDodgeBuff = true;
        campaignLoop.addResonance(dodgeRes.resonanceGain || 20);
        combatSfx.playPerfectDodge();
        onBanner?.({
          title: '⚡ PERFECT DODGE! · TIME DILATION',
          subtitle: 'Attacker Slowed to 0.30× · Next Strike Empowered (+35% DMG, +20% Resonance)',
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
      onHudStateChanged?.(campaignLoop.getStateSnapshot());
      return;
    }

    if (actionType === 'attack') {
      if (leader.comboResetTimer > 0) {
        leader.comboIndex = (leader.comboIndex + 1) % 3;
      } else {
        leader.comboIndex = 0;
      }
      leader.comboResetTimer = 1.15;

      if (leader.id === 'Knight') {
        const clips = ['combo1', 'combo2', 'combo3'];
        const clip = clips[leader.comboIndex];
        const swingRes = campaignLoop.performKnightSwing(clip, leader, leader.yaw, partner);
        if (swingRes?.swingYaw !== undefined) {
          leader.yaw = swingRes.swingYaw;
          applyTransform(leader);
        }
        startOneShotAction(leader, clip, 0.50, { timeScale: 1.28, fade: 0.07 });
        coopClient.sendActionEvent({
          role: 'Knight',
          action: clip,
          x: leader.x,
          y: leader.y,
          z: leader.z,
          yaw: leader.yaw,
        });
      } else {
        const clips = ['combo1', 'cast_shoot', 'cast_spell'];
        const clip = clips[leader.comboIndex];
        const softTarget = selectSoftLockTarget(
          leader,
          leader.yaw,
          enemyManager.activeEnemies,
          { maxRange: HERO_STATS.Mage.boltRange, partnerPos: partner }
        );
        if (softTarget) {
          leader.yaw = Math.atan2(softTarget.x - leader.x, softTarget.z - leader.z);
          applyTransform(leader);
          enemyManager.applyHitToEnemy(softTarget, {
            source: clip,
            baseDmg: HERO_STATS.Mage.boltDmg[leader.comboIndex] || 20,
            applyMark: leader.comboIndex === 2 ? 'rime' : null,
            attackerPos: leader,
          });
          campaignLoop.addResonance(5);
        }
        startOneShotAction(leader, clip, 0.50, { timeScale: 1.26, fade: 0.08 });
      }
      onHudStateChanged?.(campaignLoop.getStateSnapshot());
      return;
    }

    if (actionType === 'heavy' || actionType === 'charged') {
      if (leader.id === 'Knight') {
        const swingRes = campaignLoop.performKnightSwing('charged', leader, leader.yaw, partner);
        if (swingRes?.swingYaw !== undefined) {
          leader.yaw = swingRes.swingYaw;
          applyTransform(leader);
        }
        startOneShotAction(leader, 'charged', 0.66, { timeScale: 1.18, fade: 0.08 });
        coopClient.sendActionEvent({
          role: 'Knight',
          action: 'charged',
          x: leader.x,
          y: leader.y,
          z: leader.z,
          yaw: leader.yaw,
        });
      } else {
        triggerSpell(2);
      }
      onHudStateChanged?.(campaignLoop.getStateSnapshot());
      return;
    }

    if (actionType === 'skill') {
      const res = campaignLoop.performPartnerSkill(activeHeroId, heroStates);
      if (res && !res.onCooldown) {
        if (activeHeroId === 'Knight') {
          applyTransform(leader);
          vfxKit.swordVfx.triggerSwing(
            'intercept',
            leader,
            leader.yaw,
            campaignLoop.combatHeroes.Knight.breathingStyle
          );
          startOneShotAction(leader, 'charged', 0.56, { timeScale: 1.28, fade: 0.08 });
          onBanner?.({
            title: '🛡️ CHIVALRIC INTERCEPT · GOLDEN WARD',
            subtitle: '+35 HP Shield Granted to Both Partners · Marks Detonated',
            kind: 'blessing',
          });
        } else {
          startOneShotAction(leader, 'cast_spell', 0.60, { timeScale: 1.22, fade: 0.08 });
          onBanner?.({
            title: '✨ SOUL INFUSE · PARTNER HEALED',
            subtitle: `+${HERO_STATS.Mage.infuseHeal} HP Restored · Knight Blade Ignited`,
            kind: 'blessing',
          });
        }
        coopClient.sendActionEvent({
          role: activeHeroId,
          action: 'skill',
          x: leader.x,
          y: leader.y,
          z: leader.z,
          yaw: leader.yaw,
        });
      }
      onHudStateChanged?.(campaignLoop.getStateSnapshot());
      return;
    }

    if (actionType === 'ultimate') {
      if (campaignLoop.heartResonance < 100) {
        // Top up to 100% if already >= 65% in solo play, or notify charging
        if (campaignLoop.heartResonance >= 65) {
          campaignLoop.addResonance(100);
        } else {
          onBanner?.({
            title: `⚡ HEART RESONANCE CHARGING (${campaignLoop.heartResonance}%)`,
            subtitle: 'Cast Spells & Detonate Elemental Marks to Reach 100% Cataclysm',
            kind: 'act',
          });
          return;
        }
      }
      campaignLoop.performCouplesUltimate(heroStates);
      startOneShotAction(heroStates.Knight, 'charged', 0.75, { timeScale: 1.12, fade: 0.08 });
      startOneShotAction(heroStates.Mage, 'burst_aoe', 0.75, { timeScale: 1.12, fade: 0.08 });
      coopClient.sendActionEvent({
        role: activeHeroId,
        action: 'ultimate',
        x: leader.x,
        y: leader.y,
        z: leader.z,
      });
      onHudStateChanged?.(campaignLoop.getStateSnapshot());
      return;
    }

    if (actionType === 'cast') {
      triggerSpell(1);
    }
  }

  function setPraying() {}

  function swapActiveHero() {
    const prevLeader = heroStates[activeHeroId];
    prevLeader.praying = false;
    activeHeroId = activeHeroId === 'Knight' ? 'Mage' : 'Knight';
    partnerHeroId = activeHeroId === 'Knight' ? 'Mage' : 'Knight';
    syncSharedPlayerFromLeader();
    coopClient.swapRoles();
    if (onHeroSwapped) {
      onHeroSwapped(activeHeroId, partnerHeroId);
    }
    onHudStateChanged?.(campaignLoop.getStateSnapshot());
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
    partner.actionState = null;
    partner.actionTimer = 0;
    applyTransform(partner);
    playHeroLocomotionClip(partner, 'idle');

    syncSharedPlayerFromLeader();
  }

  function update(dt, { keys, joyState, camYaw, camera } = {}) {
    ensureCombatUnfrozen();

    const leader = heroStates[activeHeroId];
    const partner = heroStates[partnerHeroId];

    // Local 70ms animation-mixer hitstop recovery on Knight
    if (localHitstopTimer > 0) {
      localHitstopTimer = Math.max(0, localHitstopTimer - dt);
      if (localHitstopTimer <= 0) {
        knightChar.mixer.timeScale = 1.0;
      }
    }

    // Sync leader position if mutated externally by `main.js`
    if (Math.hypot(player.x - leader.x, player.z - leader.z) > 0.05) {
      leader.x = player.x;
      leader.z = player.z;
      leader.y = walkableHeightAt(leader.x, leader.z);
      leader.yaw = player.yaw;
    }

    if (leader.comboResetTimer > 0) {
      leader.comboResetTimer = Math.max(0, leader.comboResetTimer - dt);
    }

    // 1. Gather Keyboard + Touch Joystick input
    let fwd = 0;
    let right = 0;
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

    const rawMag = Math.hypot(fwd, right);
    const moveMag = clamp(rawMag, 0, 1);
    const isSprinting =
      Boolean(keys && keys.has('shift')) || Boolean(joyState && joyState.sprinting);

    let didWrap = false;

    // 2. Update Active Hero (Leader)
    if (leader.actionTimer > 0) {
      leader.actionTimer = Math.max(0, leader.actionTimer - dt);
      if (leader.actionState === 'dash') {
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
      if (leader.actionTimer <= 0) {
        leader.actionState = null;
      }
    }

    if (moveMag > 1e-3 && leader.actionState !== 'dash') {
      const nx = right / (rawMag || 1);
      const nz = fwd / (rawMag || 1);
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const rx = -fz;
      const rz = fx;
      const moveX = fx * nz + rx * nx;
      const moveZ = fz * nz + rz * nx;

      const prayMult = leader.praying ? 0.38 : 1.0;
      const actionMult = leader.actionState ? 0.35 : 1.0;
      const spd =
        player.speed *
        (isSprinting ? player.sprintMult : moveMag < 0.55 ? 0.56 : 1.0) *
        prayMult *
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

      const targetYaw = Math.atan2(moveX, moveZ);
      leader.yaw += shortestAngleDiff(targetYaw, leader.yaw) * Math.min(1, 14 * dt);
    }

    // Vertical physics & Jump state transitions
    const floorY = walkableHeightAt(leader.x, leader.z);
    if (didWrap) {
      leader.y = floorY;
      leader.vy = 0;
      leader.grounded = true;
    } else if (keys && keys.has(' ') && leader.grounded && !leader.praying) {
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

    if (leader.grounded && !leader.actionState && !leader.praying && leader.landTimer <= 0) {
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

    applyTransform(leader);
    leader.char.update(dt);
    syncSharedPlayerFromLeader();

    // Broadcast active hero state to co-op room at 20Hz
    coopClient.sendHeroState({
      role: activeHeroId,
      x: leader.x,
      y: leader.y,
      z: leader.z,
      yaw: leader.yaw,
      clip: leader.char.anim.currentKey,
    });

    // 3. Update Co-Op Partner (Remote Peer Interpolation OR Solo Wingman Follow AI)
    if (partner.actionTimer > 0) {
      partner.actionTimer = Math.max(0, partner.actionTimer - dt);
      if (partner.actionTimer <= 0) {
        partner.actionState = null;
      }
    }

    const isPeerLinked = Boolean(coopClient.getState().peerConnected && remotePartnerTarget.active);
    if (isPeerLinked) {
      partner.x += (remotePartnerTarget.x - partner.x) * Math.min(1, 12 * dt);
      partner.z += (remotePartnerTarget.z - partner.z) * Math.min(1, 12 * dt);
      partner.y = walkableHeightAt(partner.x, partner.z);
      partner.yaw += shortestAngleDiff(remotePartnerTarget.yaw, partner.yaw) * Math.min(1, 12 * dt);
    } else {
      const wingOffsetAngle = leader.yaw - 2.1; // Right-rear wingman slot
      const targetWingX = leader.x + Math.sin(wingOffsetAngle) * 2.15;
      const targetWingZ = leader.z + Math.cos(wingOffsetAngle) * 2.15;
      const dxW = targetWingX - partner.x;
      const dzW = targetWingZ - partner.z;
      const distW = Math.hypot(dxW, dzW);

      if (didWrap || distW > 18.0) {
        partner.x = targetWingX;
        partner.z = targetWingZ;
        partner.y = walkableHeightAt(partner.x, partner.z);
        partner.yaw = leader.yaw;
        playHeroLocomotionClip(partner, 'idle');
      } else if (distW > 0.65 && !partner.actionState && !leader.praying) {
        const dirX = dxW / distW;
        const dirZ = dzW / distW;
        const partnerSpd =
          distW > 4.2
            ? player.speed * player.sprintMult
            : distW > 1.75
              ? player.speed * 1.02
              : player.speed * 0.56;
        const step = Math.min(distW - 0.45, partnerSpd * dt);
        const nextP = resolveCollisions(
          partner.x + dirX * step,
          partner.z + dirZ * step,
          player.radius * 0.9
        );
        partner.x = nextP.x;
        partner.z = nextP.z;
        partner.y = walkableHeightAt(partner.x, partner.z);

        const pTargetYaw = Math.atan2(dirX, dirZ);
        partner.yaw += shortestAngleDiff(pTargetYaw, partner.yaw) * Math.min(1, 11 * dt);

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

    applyTransform(partner);
    partner.char.update(dt);

    // 4. Update 3-Act Campaign Loop, Pooled Enemy AI & Stage 4 Opaque VFX Kit
    campaignLoop.update(dt, {
      heroStates,
      soloWingmanActive: !isPeerLinked,
      camera,
    });
    vfxKit.update(dt);
  }

  /**
   * Deterministically positions and poses the Knight, Mage, and East Arena
   * Skeletons for automated architectural verification screenshots (`setShot`),
   * hiding all VFX and combat indicators so `shoot-world.mjs` stays strictly
   * within `tablet <= 48` and `desktop <= 60` draw calls.
   */
  function poseForShot(shotId, fallbackPlayerPos = null, camera = null) {
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

    // Clear all VFX & hide blade sheath and combat indicators so 0 extra draw calls leak
    vfxKit.clear();
    vfxKit.swordVfx.setInfusion('none', 0);
    campaignLoop.setIndicatorsHiddenForShot(true, heroStates);
    enemyManager.setFrozenForShot(shotId, camera);

    rootGroup.updateMatrixWorld(true);
    enemyManager.rootGroup.updateMatrixWorld(true);
    syncSharedPlayerFromLeader();
  }

  /**
   * Deterministically stages one of the 8 Stage 5 Gameplay & UI Showcase Plates
   * (`STAGE5_GAMEPLAY_SHOTS`) for `shoot-stage5-gameplay.mjs`.
   */
  function poseForGameplayShot(gameplayShotId, camera = null) {
    const spec =
      STAGE5_GAMEPLAY_SHOTS[gameplayShotId] ||
      STAGE5_GAMEPLAY_SHOTS['01-desktop-act1-sunfire-slash'];

    // 1. Pose Knight & Mage
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

    // 2. Sync Campaign Act State & Populate Pooled Enemies + Active Combat Indicators
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
          spawned.group.rotation.y = spawned.yaw;
          spawned.group.visible = true;
          spawned.char.mixer.timeScale = 1.0;
          spawned.char.poseAt(eSpec.clip || 'Idle_Combat', eSpec.time ?? 0.35);
        }
      }
    }
    enemyManager.rootGroup.visible = true;
    enemyManager.rootGroup.updateMatrixWorld(true);

    // 3. Synchronize Campaign Loop Hero Status, Breathing Blade Sheath & Shared Indicator Meshes
    campaignLoop.combatHeroes.Knight.hp = kSpec.hp ?? 220;
    campaignLoop.combatHeroes.Knight.shield = kSpec.shield ?? 0;
    campaignLoop.combatHeroes.Knight.shieldTimer = kSpec.shield ? 8.0 : 0;
    campaignLoop.combatHeroes.Mage.hp = mSpec.hp ?? 180;
    campaignLoop.combatHeroes.Mage.shield = mSpec.shield ?? 0;
    campaignLoop.combatHeroes.Mage.shieldTimer = mSpec.shield ? 8.0 : 0;

    if (spec.spellCooldowns) {
      Object.assign(campaignLoop.combatHeroes.Mage.spellCooldowns, spec.spellCooldowns);
    }

    campaignLoop.setKnightBreathing(spec.breathingStyle || 'none', spec.breathingTimer ?? 12.0);
    campaignLoop.tetherSurge.active = Boolean(spec.breathingStyle && spec.breathingStyle !== 'none');
    campaignLoop.tetherSurge.style = spec.breathingStyle || 'solar';
    campaignLoop.tetherSurge.progress = 0.52;

    campaignLoop.setIndicatorsHiddenForShot(false, heroStates);

    // 4. Pose Stage 4 Opaque VFX System at Deterministic Apex Frame
    vfxKit.clear();
    vfxKit.swordVfx.setInfusion(spec.breathingStyle || 'none', spec.breathingTimer ?? 12.0);

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
          { range: v.range ?? 14.0, seed: 1.0 }
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
      }
    }

    return spec;
  }

  return {
    kit,
    rootGroup,
    heroesGroup,
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
    launchMageFrostLance,
    triggerSpell,
    heroStates,
    player,
    triggerAction,
    setPraying,
    swapActiveHero,
    teleportLeaderAndPartner,
    poseForShot,
    poseForGameplayShot,
    update,
  };
}
