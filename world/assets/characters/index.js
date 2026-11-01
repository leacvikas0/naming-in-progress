// ============================================================================
// world/assets/characters/index.js
//
// Stage 3 Pass 2: KayKit Character Factory, Unified SkinnedMesh Merger,
// Weapon Sockets & 100% Native Skeletal Animation Controller.
//
// Rules enforced:
// - Player heroes come ONLY from `library/kaykit-adventurers/`
//   (`Knight.glb`, `Mage.glb`, `Barbarian.glb`, `Rogue.glb`, `Rogue_Hooded.glb`).
// - Enemies come from `library/kaykit-skeletons/`
//   (`Skeleton_Warrior.glb`, `Skeleton_Mage.glb`, `Skeleton_Rogue.glb`, `Skeleton_Minion.glb`).
// - 100% Native Diverse Skeletal Animations via `THREE.AnimationMixer` across
//   all 5 KayKit `Rig_Medium_*` animation categories (95 native clips total).
//   Zero procedural bone-wiggling.
// - Unified SkinnedMesh + Bone-Weighted Accessory/Weapon Merger:
//   Each character + accessories + socketed weapons + outlines is consolidated
//   into 1 unified `SkinnedMesh` + 1 unified outline `SkinnedMesh` (2 draw calls
//   per equipped character!).
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  upgradeCharacterToToon,
  flattenPaletteTexture,
  makeCharacterToonGradient,
  getSharedCharacterToonGradient,
  createSkinnedOutlineMesh,
  prepareUnifiedCharacterSource,
  rebuildUnifiedCharacterSkin,
  OUTLINE_INK_HEX,
  CHARACTER_OUTLINE_THICKNESS,
  WEAPON_OUTLINE_THICKNESS,
} from './toon-skin.js';

export {
  upgradeCharacterToToon,
  flattenPaletteTexture,
  makeCharacterToonGradient,
  getSharedCharacterToonGradient,
  createSkinnedOutlineMesh,
  prepareUnifiedCharacterSource,
  rebuildUnifiedCharacterSkin,
  OUTLINE_INK_HEX,
  CHARACTER_OUTLINE_THICKNESS,
  WEAPON_OUTLINE_THICKNESS,
};

export const ADVENTURERS_BASE =
  '/library/kaykit-adventurers/KayKit-Character-Pack-Adventures-1.0-main/addons/kaykit_character_pack_adventures';
export const SKELETONS_BASE =
  '/library/kaykit-skeletons/KayKit-Character-Pack-Skeletons-1.0-main/addons/kaykit_character_pack_skeletons';

export const TARGET_CHARACTER_HEIGHT = 1.9;

/**
 * The 5 KayKit `Rig_Medium_*` animation packs and their native clip membership.
 */
export const ANIMATION_PACKS = {
  'Rig_Medium_General.glb': {
    id: 'Rig_Medium_General.glb',
    category: 'General',
    clips: [
      'Idle',
      'Idle_B',
      'Unarmed_Idle',
      'Cheer',
      'Interact',
      'Use_Item',
      'PickUp',
      'Throw',
      'Taunt',
      'Taunt_Longer',
      'Hit_A',
      'Hit_B',
      'Death_A',
      'Death_A_Pose',
      'Death_B',
      'Death_B_Pose',
      'Spawn_Air',
      'Spawn_Ground',
      'Lie_Down',
      'Lie_Idle',
      'Lie_Pose',
      'Lie_StandUp',
    ],
  },
  'Rig_Medium_MovementBasic.glb': {
    id: 'Rig_Medium_MovementBasic.glb',
    category: 'MovementBasic',
    clips: [
      'Walking_A',
      'Walking_B',
      'Walking_C',
      'Walking_Backwards',
      'Running_A',
      'Running_B',
      'Running_C',
      'Running_Strafe_Left',
      'Running_Strafe_Right',
      'Jump_Start',
      'Jump_Idle',
      'Jump_Land',
      'Jump_Full_Short',
      'Jump_Full_Long',
      'Dodge_Forward',
      'Dodge_Backward',
      'Dodge_Left',
      'Dodge_Right',
    ],
  },
  'Rig_Medium_CombatMelee.glb': {
    id: 'Rig_Medium_CombatMelee.glb',
    category: 'CombatMelee',
    clips: [
      'Idle_Combat',
      '2H_Melee_Idle',
      '1H_Melee_Attack_Slice_Horizontal',
      '1H_Melee_Attack_Slice_Diagonal',
      '1H_Melee_Attack_Chop',
      '1H_Melee_Attack_Stab',
      '1H_Melee_Attack_Jump_Chop',
      '2H_Melee_Attack_Chop',
      '2H_Melee_Attack_Slice',
      '2H_Melee_Attack_Stab',
      '2H_Melee_Attack_Spin',
      '2H_Melee_Attack_Spinning',
      'Dualwield_Melee_Attack_Chop',
      'Dualwield_Melee_Attack_Slice',
      'Dualwield_Melee_Attack_Stab',
      'Block',
      'Blocking',
      'Block_Attack',
      'Block_Hit',
      'Unarmed_Melee_Attack_Punch_A',
      'Unarmed_Melee_Attack_Punch_B',
      'Unarmed_Melee_Attack_Kick',
    ],
  },
  'Rig_Medium_CombatRanged.glb': {
    id: 'Rig_Medium_CombatRanged.glb',
    category: 'CombatRanged',
    clips: [
      'Spellcast_Shoot',
      'Spellcasting',
      'Spellcast_Raise',
      'Spellcast_Long',
      'Spellcast_Summon',
      '1H_Ranged_Aiming',
      '1H_Ranged_Shoot',
      '1H_Ranged_Shooting',
      '1H_Ranged_Reload',
      '2H_Ranged_Aiming',
      '2H_Ranged_Shoot',
      '2H_Ranged_Shooting',
      '2H_Ranged_Reload',
    ],
  },
  'Rig_Medium_Special.glb': {
    id: 'Rig_Medium_Special.glb',
    category: 'Special',
    clips: [
      'Spawn_Ground_Skeletons',
      'Skeletons_Awaken_Floor',
      'Skeletons_Awaken_Floor_Long',
      'Skeletons_Awaken_Standing',
      'Skeleton_Inactive_Standing_Pose',
      'Skeletons_Inactive_Floor_Pose',
      'Death_C_Skeletons',
      'Death_C_Skeletons_Resurrect',
      'Walking_D_Skeletons',
      'Sit_Chair_Down',
      'Sit_Chair_Idle',
      'Sit_Chair_Pose',
      'Sit_Chair_StandUp',
      'Sit_Floor_Down',
      'Sit_Floor_Idle',
      'Sit_Floor_Pose',
      'Sit_Floor_StandUp',
    ],
  },
};

/**
 * Semantic dictionary of 100% native skeletal animations mapped to real
 * `Rig_Medium` clips (plus `Rig_Medium_*` canonical aliases and weaponStyle overrides).
 */
export const SEMANTIC_ANIMATIONS = {
  // Locomotion
  idle: {
    candidates: ['Idle_Combat', 'Idle', '2H_Melee_Idle'],
    byStyle: {
      '2h': ['2H_Melee_Idle', 'Idle_Combat', 'Idle'],
      dual: ['Idle_Combat', 'Idle'],
      '1h': ['Idle_Combat', 'Idle'],
      magic: ['Idle_Combat', 'Idle'],
    },
    aliases: ['General_Idle'],
    loop: true,
  },
  walk: {
    candidates: ['Walking_A', 'Walking_B', 'Walking_C'],
    aliases: ['MovementBasic_Walk'],
    loop: true,
  },
  run: {
    candidates: ['Running_A', 'Running_B'],
    aliases: ['MovementBasic_Run'],
    loop: true,
  },
  sprint: {
    candidates: ['Running_C', 'Running_B', 'Running_A'],
    aliases: ['MovementBasic_Sprint'],
    loop: true,
  },
  dash: {
    candidates: ['Dodge_Forward', 'Dodge_Right', 'Dodge_Left', 'Dodge_Backward'],
    aliases: ['MovementBasic_Dash', 'Dodge_Forward'],
    loop: false,
  },
  jump_start: {
    candidates: ['Jump_Start'],
    aliases: ['MovementBasic_Jump_Start'],
    loop: false,
  },
  jump_idle: {
    candidates: ['Jump_Idle'],
    aliases: ['MovementBasic_Jump_Idle'],
    loop: true,
  },
  jump_land: {
    candidates: ['Jump_Land'],
    aliases: ['MovementBasic_Jump_Land'],
    loop: false,
  },

  // Melee Combat
  combo1: {
    candidates: ['1H_Melee_Attack_Slice_Horizontal'],
    aliases: ['Melee_1H_Attack_Slice_Horizontal'],
    loop: false,
  },
  combo2: {
    candidates: ['1H_Melee_Attack_Slice_Diagonal'],
    aliases: ['Melee_1H_Attack_Slice_Diagonal'],
    loop: false,
  },
  combo3: {
    candidates: ['1H_Melee_Attack_Chop'],
    aliases: ['Melee_1H_Attack_Chop'],
    loop: false,
  },
  combo4: {
    candidates: ['1H_Melee_Attack_Jump_Chop', '2H_Melee_Attack_Chop'],
    aliases: ['Melee_1H_Attack_Jump_Chop'],
    loop: false,
  },
  stab: {
    candidates: ['1H_Melee_Attack_Stab'],
    aliases: ['Melee_1H_Attack_Stab'],
    loop: false,
  },
  charged: {
    candidates: ['2H_Melee_Attack_Spinning', '1H_Melee_Attack_Jump_Chop'],
    aliases: ['Melee_1H_Attack_Spin', 'Melee_2H_Attack_Spin'],
    loop: false,
  },
  shield_bash: {
    candidates: ['Block_Attack'],
    aliases: ['Melee_Shield_Bash'],
    loop: false,
  },
  block: {
    candidates: ['Blocking', 'Block'],
    aliases: ['Melee_Block'],
    loop: true,
  },
  parry: {
    candidates: ['Block_Attack', 'Block_Hit'],
    aliases: ['Melee_Parry'],
    loop: false,
  },

  // Ranged / Magic / Romantic Co-Op Invocations
  mage_attack1: {
    candidates: ['Spellcast_Shoot'],
    aliases: ['Mage_Attack_1'],
    loop: false,
  },
  mage_attack2: {
    candidates: ['1H_Ranged_Shoot', '2H_Ranged_Shoot'],
    aliases: ['Mage_Attack_2'],
    loop: false,
  },
  mage_attack3: {
    candidates: ['Spellcast_Raise'],
    aliases: ['Mage_Attack_3'],
    loop: false,
  },
  mage_heavy: {
    candidates: ['Throw', 'Spellcast_Long'],
    aliases: ['Mage_Heavy'],
    loop: false,
  },
  cast_shoot: {
    candidates: ['Spellcast_Shoot'],
    aliases: ['Ranged_Magic_Shoot'],
    loop: false,
  },
  cast_spell: {
    candidates: ['Spellcasting', 'Spellcast_Long'],
    aliases: ['Ranged_Magic_Spellcasting'],
    loop: true,
  },
  pray_channel: {
    candidates: ['Spellcast_Raise', 'Interact'],
    aliases: ['Ranged_Magic_Raise', 'Special_Interact'],
    loop: false,
  },
  burst_aoe: {
    candidates: ['Spellcast_Summon', 'Spellcast_Long'],
    aliases: ['Ranged_Magic_Summon'],
    loop: false,
  },
  cheer: {
    candidates: ['Cheer'],
    aliases: ['General_Cheer'],
    loop: false,
  },
  wave: {
    candidates: ['Interact', 'Cheer', 'Use_Item'],
    aliases: ['General_Wave'],
    loop: false,
  },

  // Reactions & States
  hit_A: {
    candidates: ['Hit_A'],
    aliases: ['General_Hit_A'],
    loop: false,
  },
  hit_B: {
    candidates: ['Hit_B'],
    aliases: ['General_Hit_B'],
    loop: false,
  },
  downed: {
    candidates: ['Death_A', 'Death_B', 'Death_C_Skeletons'],
    aliases: ['General_Death_A'],
    loop: false,
  },
  revive: {
    candidates: ['Spawn_Air', 'Lie_StandUp', 'Death_C_Skeletons_Resurrect'],
    aliases: ['General_Spawn_Air', 'General_StandUp'],
    loop: false,
  },
  spawn: {
    candidates: ['Spawn_Ground', 'Spawn_Ground_Skeletons', 'Skeletons_Awaken_Floor'],
    aliases: ['General_Spawn_Ground'],
    loop: false,
  },
  taunt: {
    candidates: ['Taunt', 'Taunt_Longer'],
    aliases: ['General_Taunt'],
    loop: false,
  },
};

/**
 * Verified weapon descriptors with Pass 2 audited grip offsets & quaternions
 * in `handslot.r` and `handslot.l` bone spaces.
 */
export const WEAPON_SPECS = {
  'sword_1handed.gltf': {
    id: 'sword_1handed.gltf',
    url: `${ADVENTURERS_BASE}/Assets/gltf/sword_1handed.gltf`,
    role: 'knight',
    slot: 'handSlot.r',
    position: [0, 0.04, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
  'shield_badge.gltf': {
    id: 'shield_badge.gltf',
    url: `${ADVENTURERS_BASE}/Assets/gltf/shield_badge.gltf`,
    role: 'knight',
    slot: 'handSlot.l',
    position: [0, 0.017, 0.16],
    quaternion: [0, 0, 0, 1],
    scale: 1.0,
    cellOverrides: {
      r1c5: [212, 32, 46], // Royal crimson shield emblem field matching Knight's cape
    },
  },
  'staff.gltf': {
    id: 'staff.gltf',
    url: `${ADVENTURERS_BASE}/Assets/gltf/staff.gltf`,
    role: 'mage',
    slot: 'handSlot.r',
    position: [0, 0.06, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
  'spellbook_open.gltf': {
    id: 'spellbook_open.gltf',
    url: `${ADVENTURERS_BASE}/Assets/gltf/spellbook_open.gltf`,
    role: 'mage',
    slot: 'handSlot.l',
    // Spine (z = -0.088) rests in left palm; open pages (z = +0.134) face outward (+Y of handslot.l)
    position: [0, 0.19, 0.05],
    quaternion: [0, 0.7071068, 0.7071068, 0],
    scale: 1.0,
  },
  'axe_2handed.gltf': {
    id: 'axe_2handed.gltf',
    url: `${ADVENTURERS_BASE}/Assets/gltf/axe_2handed.gltf`,
    role: 'barbarian',
    slot: 'handSlot.r',
    position: [0, 0.04, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
  'dagger.gltf': {
    id: 'dagger.gltf',
    url: `${ADVENTURERS_BASE}/Assets/gltf/dagger.gltf`,
    role: 'rogue',
    slot: 'handSlot.r',
    // Offset +0.065m along handle so crossguard sits cleanly above the fist
    position: [0, 0.065, 0],
    quaternion: [0, -1, 0, 0],
    leftPosition: [0, 0.065, 0],
    leftQuaternion: [0, 0, 0, 1],
    scale: 1.0,
  },
  'Skeleton_Blade.gltf': {
    id: 'Skeleton_Blade.gltf',
    url: `${SKELETONS_BASE}/Assets/gltf/Skeleton_Blade.gltf`,
    role: 'skeleton',
    slot: 'handSlot.r',
    position: [0, 0.04, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
  'Skeleton_Shield_Large_A.gltf': {
    id: 'Skeleton_Shield_Large_A.gltf',
    url: `${SKELETONS_BASE}/Assets/gltf/Skeleton_Shield_Large_A.gltf`,
    role: 'skeleton',
    slot: 'handSlot.l',
    position: [0, 0.017, 0.165],
    quaternion: [0, 0, 0, 1],
    scale: 1.0,
  },
  'Skeleton_Staff.gltf': {
    id: 'Skeleton_Staff.gltf',
    url: `${SKELETONS_BASE}/Assets/gltf/Skeleton_Staff.gltf`,
    role: 'skeleton',
    slot: 'handSlot.r',
    // Rotates horned skull top (-X) to face forward (+Z) and lifts lower shaft clear of robe/legs
    position: [0, 0.14, 0],
    quaternion: [0, 0.7071068, 0, 0.7071068],
    scale: 1.0,
  },
  'Skeleton_Dagger.gltf': {
    id: 'Skeleton_Dagger.gltf',
    url: `${ADVENTURERS_BASE}/Assets/gltf/dagger.gltf`,
    role: 'skeleton',
    slot: 'handSlot.r',
    position: [0, 0.065, 0],
    quaternion: [0, -1, 0, 0],
    leftPosition: [0, 0.065, 0],
    leftQuaternion: [0, 0, 0, 1],
    scale: 1.0,
    cellOverrides: {
      r0c3: [108, 116, 126],
      r1c2: [124, 132, 142],
      r0c6: [88, 72, 62],
    },
  },
  'Skeleton_Axe.gltf': {
    id: 'Skeleton_Axe.gltf',
    url: `${SKELETONS_BASE}/Assets/gltf/Skeleton_Axe.gltf`,
    role: 'skeleton',
    slot: 'handSlot.r',
    // Grips the wooden shaft (+0.20m) below the wide double-bladed stone head so blade never overlaps the wrist
    position: [0, 0.20, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
};

/**
 * Complete Character Roster (5 Adventurer Heroes + 4 Skeleton Enemies).
 */
export const CHARACTER_ROSTER = {
  Knight: {
    id: 'Knight',
    faction: 'adventurer',
    role: 'knight',
    weaponStyle: '1h',
    glb: `${ADVENTURERS_BASE}/Characters/gltf/Knight.glb`,
    keepAccessories: ['Knight_Helmet', 'Knight_Cape'],
    weapons: {
      'handSlot.r': 'sword_1handed.gltf',
      'handSlot.l': 'shield_badge.gltf',
    },
  },
  Mage: {
    id: 'Mage',
    faction: 'adventurer',
    role: 'mage',
    weaponStyle: 'magic',
    glb: `${ADVENTURERS_BASE}/Characters/gltf/Mage.glb`,
    keepAccessories: ['Mage_Hat', 'Mage_Cape'],
    weapons: {
      'handSlot.r': 'staff.gltf',
      'handSlot.l': 'spellbook_open.gltf',
    },
  },
  Barbarian: {
    id: 'Barbarian',
    faction: 'adventurer',
    role: 'barbarian',
    weaponStyle: '2h',
    glb: `${ADVENTURERS_BASE}/Characters/gltf/Barbarian.glb`,
    keepAccessories: ['Barbarian_Hat', 'Barbarian_Cape'],
    weapons: {
      'handSlot.r': 'axe_2handed.gltf',
      'handSlot.l': null,
    },
  },
  Rogue: {
    id: 'Rogue',
    faction: 'adventurer',
    role: 'rogue',
    weaponStyle: 'dual',
    glb: `${ADVENTURERS_BASE}/Characters/gltf/Rogue.glb`,
    keepAccessories: ['Rogue_Cape'],
    weapons: {
      'handSlot.r': 'dagger.gltf',
      'handSlot.l': 'dagger.gltf',
    },
  },
  Rogue_Hooded: {
    id: 'Rogue_Hooded',
    faction: 'adventurer',
    role: 'rogue_hooded',
    weaponStyle: 'dual',
    glb: `${ADVENTURERS_BASE}/Characters/gltf/Rogue_Hooded.glb`,
    keepAccessories: ['Rogue_Cape'],
    weapons: {
      'handSlot.r': 'dagger.gltf',
      'handSlot.l': 'dagger.gltf',
    },
  },
  Skeleton_Warrior: {
    id: 'Skeleton_Warrior',
    faction: 'skeleton',
    role: 'skeleton',
    weaponStyle: '1h',
    glb: `${SKELETONS_BASE}/Characters/gltf/Skeleton_Warrior.glb`,
    keepAccessories: ['Skeleton_Warrior_Helmet'],
    weapons: {
      'handSlot.r': 'Skeleton_Blade.gltf',
      'handSlot.l': 'Skeleton_Shield_Large_A.gltf',
    },
  },
  Skeleton_Mage: {
    id: 'Skeleton_Mage',
    faction: 'skeleton',
    role: 'skeleton',
    weaponStyle: 'magic',
    glb: `${SKELETONS_BASE}/Characters/gltf/Skeleton_Mage.glb`,
    keepAccessories: ['Skeleton_Mage_Hat'],
    weapons: {
      'handSlot.r': 'Skeleton_Staff.gltf',
      'handSlot.l': null,
    },
  },
  Skeleton_Rogue: {
    id: 'Skeleton_Rogue',
    faction: 'skeleton',
    role: 'skeleton',
    weaponStyle: '1h',
    glb: `${SKELETONS_BASE}/Characters/gltf/Skeleton_Rogue.glb`,
    keepAccessories: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'],
    weapons: {
      'handSlot.r': 'Skeleton_Dagger.gltf',
      'handSlot.l': null,
    },
  },
  Skeleton_Minion: {
    id: 'Skeleton_Minion',
    faction: 'skeleton',
    role: 'skeleton',
    weaponStyle: '1h',
    glb: `${SKELETONS_BASE}/Characters/gltf/Skeleton_Minion.glb`,
    keepAccessories: [],
    weapons: {
      'handSlot.r': 'Skeleton_Axe.gltf',
      'handSlot.l': null,
    },
  },
};

export const ADVENTURER_IDS = ['Knight', 'Mage', 'Barbarian', 'Rogue', 'Rogue_Hooded'];
export const SKELETON_IDS = ['Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue', 'Skeleton_Minion'];

const rawGltfPromises = new Map();
let masterClipBankPromise = null;

function resolveCharacterSpec(idOrName) {
  if (!idOrName) return CHARACTER_ROSTER.Knight;
  if (CHARACTER_ROSTER[idOrName]) return CHARACTER_ROSTER[idOrName];
  const lower = String(idOrName).toLowerCase();
  for (const spec of Object.values(CHARACTER_ROSTER)) {
    if (spec.id.toLowerCase() === lower || spec.role === lower) {
      return spec;
    }
  }
  throw new Error(`[characters] Unknown character ID: ${idOrName}`);
}

function loadRawGltf(loader, url) {
  if (!rawGltfPromises.has(url)) {
    rawGltfPromises.set(
      url,
      loader.loadAsync(url).catch((err) => {
        rawGltfPromises.delete(url);
        throw err;
      })
    );
  }
  return rawGltfPromises.get(url);
}

/**
 * Loads the complete 95-clip `Rig_Medium` master animation library (spanning all
 * 5 `Rig_Medium_*` animation categories: General, MovementBasic, CombatMelee,
 * CombatRanged, Special).
 */
export async function loadAnimationPacks(loader = new GLTFLoader()) {
  if (!masterClipBankPromise) {
    masterClipBankPromise = Promise.all([
      loadRawGltf(loader, CHARACTER_ROSTER.Knight.glb),
      loadRawGltf(loader, CHARACTER_ROSTER.Skeleton_Warrior.glb),
    ]).then(([knightGltf, skelGltf]) => {
      const clipMap = new Map();
      for (const clip of knightGltf.animations || []) {
        if (clip && clip.name) clipMap.set(clip.name, clip);
      }
      for (const clip of skelGltf.animations || []) {
        if (clip && clip.name && !clipMap.has(clip.name)) {
          clipMap.set(clip.name, clip);
        }
      }
      return {
        packs: ANIMATION_PACKS,
        clipsByName: clipMap,
        allClips: Array.from(clipMap.values()),
      };
    });
  }
  return masterClipBankPromise;
}

function stripEmbeddedHandSlotMeshes(root, keepAccessories = []) {
  const keepSet = new Set(keepAccessories);
  const toRemove = [];

  root.traverse((obj) => {
    if (!obj.isMesh || obj.isSkinnedMesh) return;
    const keep = keepSet.has(obj.name) || (obj.parent && keepSet.has(obj.parent.name));
    if (!keep) {
      toRemove.push(obj);
    }
  });

  for (const mesh of toRemove) {
    if (mesh && mesh.parent) {
      mesh.parent.remove(mesh);
    }
  }
}

function normalizeCharacterScale(root, targetHeight = TARGET_CHARACTER_HEIGHT) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3();
  let found = false;
  root.traverse((obj) => {
    if (!obj.isSkinnedMesh || !obj.geometry) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    const bb = obj.geometry.boundingBox;
    if (!bb) return;
    obj.updateWorldMatrix(true, false);
    box.union(bb.clone().applyMatrix4(obj.matrixWorld));
    found = true;
  });

  if (found && box.max.y > 1e-4) {
    const scale = targetHeight / box.max.y;
    root.scale.setScalar(scale);
    // KayKit Rig_Medium animations are authored relative to y = 0.0 as the ground plane;
    // keep root.position.y at 0.0 so boots sit flush on the ground instead of sinking!
    root.position.y = 0.0;
  }
  root.updateMatrixWorld(true);
}

function ensureBoneSockets(root) {
  const sockets = {
    'handSlot.r': null,
    'handSlot.l': null,
    'handslot.r': null,
    'handslot.l': null,
    head: null,
    chest: null,
  };

  root.traverse((obj) => {
    const lower = (obj.name || '').toLowerCase();
    if ((lower === 'handslot.r' || lower === 'handslotr' || lower === 'hand_slot_r') && !sockets['handslot.r']) {
      sockets['handslot.r'] = obj;
    } else if ((lower === 'handslot.l' || lower === 'handslotl' || lower === 'hand_slot_l') && !sockets['handslot.l']) {
      sockets['handslot.l'] = obj;
    } else if (lower === 'head' && !sockets.head) {
      sockets.head = obj;
    } else if (lower === 'chest' && !sockets.chest) {
      sockets.chest = obj;
    }
  });

  if (!sockets['handslot.r'] || !sockets['handslot.l']) {
    root.traverse((obj) => {
      const lower = (obj.name || '').toLowerCase();
      if ((lower === 'hand.r' || lower === 'handr') && !sockets['handslot.r']) {
        sockets['handslot.r'] = obj;
      } else if ((lower === 'hand.l' || lower === 'handl') && !sockets['handslot.l']) {
        sockets['handslot.l'] = obj;
      }
    });
  }

  if (sockets['handslot.r']) {
    let slotR = sockets['handslot.r'].getObjectByName('handSlot.r');
    if (!slotR) {
      slotR = new THREE.Group();
      slotR.name = 'handSlot.r';
      sockets['handslot.r'].add(slotR);
    }
    sockets['handSlot.r'] = slotR;
  }

  if (sockets['handslot.l']) {
    let slotL = sockets['handslot.l'].getObjectByName('handSlot.l');
    if (!slotL) {
      slotL = new THREE.Group();
      slotL.name = 'handSlot.l';
      sockets['handslot.l'].add(slotL);
    }
    sockets['handSlot.l'] = slotL;
  }

  return sockets;
}

/**
 * Loads a weapon `.gltf`, attaches it into `handSlot.r` or `handSlot.l`, and
 * rebuilds the character's unified `SkinnedMesh` if unified mode is active.
 */
export async function attachWeaponToSocket(
  characterSockets,
  slotName,
  weaponFile,
  loader = new GLTFLoader(),
  roleOverride = null,
  options = {}
) {
  if (!weaponFile) return null;
  const spec = WEAPON_SPECS[weaponFile];
  if (!spec) {
    throw new Error(`[characters] Unknown weapon file: ${weaponFile}`);
  }

  const normalizedSlot = slotName.toLowerCase() === 'handslot.l' ? 'handSlot.l' : 'handSlot.r';
  const socketNode = characterSockets[normalizedSlot] || characterSockets[normalizedSlot.toLowerCase()];
  if (!socketNode) {
    throw new Error(`[characters] Missing bone socket ${normalizedSlot}`);
  }

  while (socketNode.children.length > 0) {
    socketNode.remove(socketNode.children[0]);
  }

  const gltf = await loadRawGltf(loader, spec.url);
  const weaponRoot = gltf.scene.clone(true);
  weaponRoot.name = weaponFile;
  weaponRoot.userData.weaponId = weaponFile;
  weaponRoot.userData.slot = normalizedSlot;

  const isLeft = normalizedSlot === 'handSlot.l';
  const pos = isLeft && spec.leftPosition ? spec.leftPosition : spec.position;
  const quat = isLeft && spec.leftQuaternion ? spec.leftQuaternion : spec.quaternion;

  weaponRoot.position.set(pos[0], pos[1], pos[2]);
  weaponRoot.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
  weaponRoot.scale.setScalar(spec.scale ?? 1.0);

  const isUnified = !!characterSockets.__rebuildUnifiedSkin;

  upgradeCharacterToToon(weaponRoot, {
    role: roleOverride || spec.role,
    isWeapon: true,
    skipOutlines: isUnified,
    outlineThickness: WEAPON_OUTLINE_THICKNESS,
    cellOverrides: spec.cellOverrides,
  });

  socketNode.add(weaponRoot);
  socketNode.updateMatrixWorld(true);

  if (isUnified && !options.deferRebuild) {
    characterSockets.__rebuildUnifiedSkin();
  }

  return weaponRoot;
}

/**
 * Builds the `THREE.AnimationMixer` and weapon-style-aware semantic clip
 * dictionary for a character instance.
 */
export function createCharacterAnimationController(instanceRoot, clipBank, options = {}) {
  const weaponStyle = options.weaponStyle || '1h';
  const mixer = new THREE.AnimationMixer(instanceRoot);
  const rawActions = new Map();
  const semanticActions = new Map();
  const semanticClips = new Map();

  for (const clip of clipBank.allClips) {
    if (!clip || !clip.name) continue;
    const action = mixer.clipAction(clip);
    rawActions.set(clip.name, action);
  }

  for (const [semKey, def] of Object.entries(SEMANTIC_ANIMATIONS)) {
    const candidateList = (def.byStyle && def.byStyle[weaponStyle]) || def.candidates;
    let matchedClip = null;
    for (const candidateName of candidateList) {
      const clip = clipBank.clipsByName.get(candidateName);
      if (clip) {
        matchedClip = clip;
        break;
      }
    }
    if (!matchedClip) continue;

    const action = rawActions.get(matchedClip.name) || mixer.clipAction(matchedClip);
    semanticClips.set(semKey, matchedClip);
    semanticActions.set(semKey, action);

    for (const alias of def.aliases || []) {
      semanticClips.set(alias, matchedClip);
      semanticActions.set(alias, action);
      if (!rawActions.has(alias)) {
        rawActions.set(alias, action);
      }
    }
  }

  let currentAction = null;
  let currentKey = null;

  function resolveAction(keyOrClipName) {
    if (!keyOrClipName) return null;
    if (semanticActions.has(keyOrClipName)) {
      return {
        action: semanticActions.get(keyOrClipName),
        clip: semanticClips.get(keyOrClipName),
        def: SEMANTIC_ANIMATIONS[keyOrClipName] || null,
      };
    }
    if (rawActions.has(keyOrClipName)) {
      const act = rawActions.get(keyOrClipName);
      return {
        action: act,
        clip: act.getClip(),
        def: null,
      };
    }
    return null;
  }

  function play(keyOrClipName, playOptions = {}) {
    const resolved = resolveAction(keyOrClipName);
    if (!resolved) {
      throw new Error(`[characters] Unknown animation clip or semantic key: ${keyOrClipName}`);
    }

    const { action, def } = resolved;
    const loop = playOptions.loop !== undefined ? playOptions.loop : def ? def.loop : true;
    const fade = playOptions.fade !== undefined ? playOptions.fade : 0.14;
    const clampWhenFinished =
      playOptions.clampWhenFinished !== undefined ? playOptions.clampWhenFinished : !loop;
    const timeScale = playOptions.timeScale !== undefined ? playOptions.timeScale : 1.0;

    if (!playOptions.force && currentAction === action && action.isRunning()) {
      return action;
    }

    const prev = currentAction;
    action.enabled = true;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = clampWhenFinished;
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1.0);
    action.reset();

    if (playOptions.startTime !== undefined) {
      action.time = playOptions.startTime;
    }

    if (fade > 0 && prev && prev !== action) {
      action.fadeIn(fade);
      prev.fadeOut(fade);
    } else {
      if (prev && prev !== action) prev.stop();
    }

    action.play();
    currentAction = action;
    currentKey = keyOrClipName;
    return action;
  }

  /**
   * Deterministically samples a specific native skeletal animation at an exact
   * timestamp `timeSeconds` and updates all bone & skinned mesh matrices.
   */
  function poseAt(keyOrClipName, timeSeconds = 0) {
    const resolved = resolveAction(keyOrClipName);
    if (!resolved) {
      throw new Error(`[characters] Unknown animation clip for poseAt: ${keyOrClipName}`);
    }

    mixer.stopAllAction();
    const { action, clip } = resolved;
    action.reset();
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveWeight(1.0);
    action.setEffectiveTimeScale(1.0);
    action.play();

    const duration = clip.duration > 1e-4 ? clip.duration : 1.0;
    const clampedT = ((timeSeconds % duration) + duration) % duration;
    mixer.setTime(clampedT);
    instanceRoot.updateMatrixWorld(true);

    currentAction = action;
    currentKey = keyOrClipName;
    return {
      key: keyOrClipName,
      clipName: clip.name,
      duration: Number(duration.toFixed(3)),
      sampledTime: Number(clampedT.toFixed(3)),
    };
  }

  function update(dt) {
    mixer.update(dt);
  }

  return {
    mixer,
    rawActions,
    semanticActions,
    semanticClips,
    play,
    poseAt,
    update,
    get currentKey() {
      return currentKey;
    },
    get currentClipName() {
      return currentAction ? currentAction.getClip().name : null;
    },
  };
}

/**
 * Instantiates a cel-shaded, outlined KayKit Adventurer or Skeleton character
 * consolidated into 1 unified `SkinnedMesh` + 1 unified outline `SkinnedMesh`
 * with default socketed weapons and 100% native skeletal animation controller.
 */
export async function createCharacter(idOrName, options = {}) {
  const spec = resolveCharacterSpec(idOrName);
  const loader = options.loader || new GLTFLoader();

  const [charGltf, clipBank] = await Promise.all([
    loadRawGltf(loader, spec.glb),
    loadAnimationPacks(loader),
  ]);

  const group = new THREE.Group();
  group.name = `character-${spec.id}`;

  const modelRoot = cloneSkeleton(charGltf.scene);
  modelRoot.name = `${spec.id}-rig`;

  stripEmbeddedHandSlotMeshes(modelRoot, spec.keepAccessories);
  normalizeCharacterScale(modelRoot, options.targetHeight ?? TARGET_CHARACTER_HEIGHT);

  const sockets = ensureBoneSockets(modelRoot);

  const toonOpts = {
    role: spec.role,
    outlineThickness: options.outlineThickness ?? CHARACTER_OUTLINE_THICKNESS,
    cellOverrides: options.cellOverrides || null,
  };

  // Capture bind-pose skinned parts & rigid accessories before attaching weapons or posing
  prepareUnifiedCharacterSource(modelRoot, toonOpts);
  sockets.__rebuildUnifiedSkin = () => rebuildUnifiedCharacterSkin(modelRoot, sockets, toonOpts);

  const weaponsCfg = {
    ...spec.weapons,
    ...(options.weapons || {}),
  };

  const equippedWeapons = {
    'handSlot.r': null,
    'handSlot.l': null,
  };

  if (weaponsCfg['handSlot.r']) {
    equippedWeapons['handSlot.r'] = await attachWeaponToSocket(
      sockets,
      'handSlot.r',
      weaponsCfg['handSlot.r'],
      loader,
      spec.role,
      { deferRebuild: true }
    );
  }
  if (weaponsCfg['handSlot.l']) {
    equippedWeapons['handSlot.l'] = await attachWeaponToSocket(
      sockets,
      'handSlot.l',
      weaponsCfg['handSlot.l'],
      loader,
      spec.role,
      { deferRebuild: true }
    );
  }

  // Merge all body parts + accessories + equipped weapons into 1 SkinnedMesh + 1 Outline SkinnedMesh
  const toonStats = rebuildUnifiedCharacterSkin(modelRoot, sockets, toonOpts);

  group.add(modelRoot);

  const anim = createCharacterAnimationController(modelRoot, clipBank, {
    weaponStyle: options.weaponStyle || spec.weaponStyle || '1h',
  });
  const initialClip = options.initialClip || 'idle';
  const initialTime = options.initialTime;
  if (initialTime !== undefined) {
    anim.poseAt(initialClip, initialTime);
  } else {
    anim.play(initialClip, { fade: 0 });
    anim.update(0.016);
  }

  if (options.position) {
    group.position.set(options.position[0], options.position[1] || 0, options.position[2]);
  }
  if (options.rotY !== undefined) {
    group.rotation.y = options.rotY;
  }
  group.updateMatrixWorld(true);

  return {
    id: spec.id,
    faction: spec.faction,
    role: spec.role,
    spec,
    group,
    modelRoot,
    sockets,
    equippedWeapons,
    anim,
    mixer: anim.mixer,
    toonStats,
    play: anim.play,
    poseAt: anim.poseAt,
    update: anim.update,
  };
}

/**
 * Convenience factory for the Stage 3 Character & Native Motion kit.
 */
export function createCharactersKit(options = {}) {
  const loader = options.loader || new GLTFLoader();
  return {
    CHARACTER_ROSTER,
    ADVENTURER_IDS,
    SKELETON_IDS,
    WEAPON_SPECS,
    ANIMATION_PACKS,
    SEMANTIC_ANIMATIONS,
    loadAnimationPacks: () => loadAnimationPacks(loader),
    createCharacter: (id, opts = {}) => createCharacter(id, { loader, ...opts }),
  };
}
