// ============================================================================
// world/assets/characters/index.js
//
// Stage 3 Pass 2 & Stage 5 Full Native Roster:
// KayKit Character Factory, Unified SkinnedMesh Merger, Weapon Sockets &
// 100% Native Skeletal Animation Controller (`Rig_Medium` + `Rig_Large`).
//
// Rules enforced:
// - Player heroes come ONLY from `library/kaykit-adventurers/`
//   (`Knight.glb`, `Mage.glb`, `Barbarian.glb`, `Rogue.glb`, `Rogue_Hooded.glb`).
// - Enemies come from `library/kaykit-skeletons/` and `library/enemy-candidates/`:
//   * `Rig_Medium` enemies (`Skeleton_Minion`, `Skeleton_Warrior`, `Skeleton_Rogue`,
//     `Skeleton_Mage`, `OrcRaider`, `PlantWarrior`, `Werewolf_Wolf`, `BlackKnight`,
//     `Necromancer`) use the 95 native `Rig_Medium_*` clips.
//   * `Rig_Large` bosses (`OrcBrute`, `FrostGolem`, `Skeleton_Golem`) use the
//     native `Rig_Large_*` animation packs (`Rig_Large_General.glb`,
//     `Rig_Large_MovementBasic.glb`, `Rig_Large_CombatMelee.glb`).
// - Unified SkinnedMesh + Bone-Weighted Accessory/Weapon Merger:
//   Each character + accessories + socketed weapons + outlines is consolidated
//   into 1 unified `SkinnedMesh` + 1 unified outline `SkinnedMesh` (2 draw calls
//   per visible character, 0 draw calls when `group.visible = false`).
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
export const ENEMY_CANDIDATES_BASE = '/library/enemy-candidates';

export const TARGET_CHARACTER_HEIGHT = 1.9;

/**
 * The 5 KayKit `Rig_Medium_*` animation packs (95 native clips) + 3 `Rig_Large_*`
 * animation packs (`Rig_Large_General.glb`, `Rig_Large_MovementBasic.glb`,
 * `Rig_Large_CombatMelee.glb`).
 */
export const ANIMATION_PACKS = {
  'Rig_Medium_General.glb': {
    id: 'Rig_Medium_General.glb',
    rig: 'Rig_Medium',
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
    rig: 'Rig_Medium',
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
    rig: 'Rig_Medium',
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
    rig: 'Rig_Medium',
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
    rig: 'Rig_Medium',
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
  'Rig_Large_General.glb': {
    id: 'Rig_Large_General.glb',
    rig: 'Rig_Large',
    url: `${ENEMY_CANDIDATES_BASE}/Rig_Large_General.glb`,
    category: 'General',
    clips: ['Death_A', 'Death_A_Pose', 'Hit_A', 'Idle_A', 'Idle_B', 'T-Pose'],
  },
  'Rig_Large_MovementBasic.glb': {
    id: 'Rig_Large_MovementBasic.glb',
    rig: 'Rig_Large',
    url: `${ENEMY_CANDIDATES_BASE}/Rig_Large_MovementBasic.glb`,
    category: 'MovementBasic',
    clips: ['Running_A', 'T-Pose', 'Walking_A'],
  },
  'Rig_Large_CombatMelee.glb': {
    id: 'Rig_Large_CombatMelee.glb',
    rig: 'Rig_Large',
    url: `${ENEMY_CANDIDATES_BASE}/Rig_Large_CombatMelee.glb`,
    category: 'CombatMelee',
    clips: [
      'Melee_1H_Slash',
      'Melee_1H_Stab',
      'Melee_2H_Attack',
      'Melee_2H_Idle',
      'Melee_2H_Slam',
      'Melee_Block',
      'Melee_Block_Attack',
      'Melee_Block_Hit',
      'Melee_Blocking',
      'Melee_Dualwield_Slash',
      'Melee_Dualwield_SlashCombo',
      'Melee_Unarmed_Idle',
      'Melee_Unarmed_Kick',
      'Melee_Unarmed_Punch',
      'Melee_Unarmed_Smash',
    ],
  },
};

export const RIG_LARGE_PACK_URLS = [
  `${ENEMY_CANDIDATES_BASE}/Rig_Large_General.glb`,
  `${ENEMY_CANDIDATES_BASE}/Rig_Large_MovementBasic.glb`,
  `${ENEMY_CANDIDATES_BASE}/Rig_Large_CombatMelee.glb`,
];

/**
 * Semantic dictionary of 100% native skeletal animations mapped to real
 * `Rig_Medium` and `Rig_Large` clips (plus canonical aliases and weaponStyle overrides).
 */
export const SEMANTIC_ANIMATIONS = {
  // Locomotion
  idle: {
    candidates: [
      'Idle_Combat',
      'Idle',
      '2H_Melee_Idle',
      'Melee_2H_Idle',
      'Melee_Unarmed_Idle',
      'Idle_A',
      'Idle_B',
    ],
    byStyle: {
      '2h': ['2H_Melee_Idle', 'Idle_Combat', 'Idle', 'Melee_2H_Idle', 'Idle_A'],
      dual: ['Idle_Combat', 'Idle', 'Idle_A'],
      '1h': ['Idle_Combat', 'Idle', 'Melee_2H_Idle', 'Idle_A'],
      magic: ['Idle_Combat', 'Idle', 'Idle_A'],
      unarmed: ['Unarmed_Idle', 'Idle_Combat', 'Melee_Unarmed_Idle', 'Idle_A'],
    },
    aliases: ['General_Idle', 'Idle_Combat'],
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
    candidates: ['Dodge_Forward', 'Dodge_Right', 'Dodge_Left', 'Dodge_Backward', 'Running_A'],
    aliases: ['MovementBasic_Dash', 'Dodge_Forward'],
    loop: false,
  },
  jump_start: {
    candidates: ['Jump_Start', 'Idle_A'],
    aliases: ['MovementBasic_Jump_Start'],
    loop: false,
  },
  jump_idle: {
    candidates: ['Jump_Idle', 'Idle_A'],
    aliases: ['MovementBasic_Jump_Idle'],
    loop: true,
  },
  jump_land: {
    candidates: ['Jump_Land', 'Idle_A'],
    aliases: ['MovementBasic_Jump_Land'],
    loop: false,
  },

  // Melee Combat
  combo1: {
    candidates: [
      '1H_Melee_Attack_Slice_Horizontal',
      'Melee_1H_Slash',
      'Melee_2H_Attack',
      'Melee_Unarmed_Punch',
    ],
    byStyle: {
      '1h': ['1H_Melee_Attack_Slice_Horizontal', 'Melee_1H_Slash'],
      '2h': ['2H_Melee_Attack_Slice', '1H_Melee_Attack_Slice_Horizontal', 'Melee_2H_Attack'],
      unarmed: ['Unarmed_Melee_Attack_Punch_A', '1H_Melee_Attack_Slice_Horizontal', 'Melee_Unarmed_Punch'],
      dual: ['Dualwield_Melee_Attack_Slice', '1H_Melee_Attack_Slice_Horizontal', 'Melee_Dualwield_Slash'],
    },
    aliases: ['Melee_1H_Attack_Slice_Horizontal'],
    loop: false,
  },
  combo2: {
    candidates: [
      '1H_Melee_Attack_Slice_Diagonal',
      'Melee_2H_Attack',
      'Melee_1H_Slash',
      'Melee_Unarmed_Smash',
    ],
    byStyle: {
      '1h': ['1H_Melee_Attack_Slice_Diagonal', 'Melee_1H_Slash'],
      '2h': ['2H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', 'Melee_2H_Attack'],
      unarmed: ['Unarmed_Melee_Attack_Punch_B', '1H_Melee_Attack_Slice_Diagonal', 'Melee_Unarmed_Smash'],
      dual: ['Dualwield_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', 'Melee_Dualwield_SlashCombo'],
    },
    aliases: ['Melee_1H_Attack_Slice_Diagonal'],
    loop: false,
  },
  combo3: {
    candidates: ['1H_Melee_Attack_Chop', 'Melee_2H_Slam', 'Melee_Unarmed_Smash'],
    aliases: ['Melee_1H_Attack_Chop'],
    loop: false,
  },
  combo4: {
    candidates: [
      '1H_Melee_Attack_Stab',
      '1H_Melee_Attack_Chop',
      '1H_Melee_Attack_Slice_Diagonal',
      'Melee_2H_Slam',
      'Melee_Unarmed_Smash',
    ],
    aliases: ['Melee_1H_Attack_Jump_Chop', 'Melee_1H_Attack_Stab_Finisher'],
    loop: false,
  },
  stab: {
    candidates: ['1H_Melee_Attack_Stab', 'Melee_1H_Stab', 'Melee_Unarmed_Punch'],
    aliases: ['Melee_1H_Attack_Stab'],
    loop: false,
  },
  pounce: {
    candidates: ['1H_Melee_Attack_Jump_Chop', 'Unarmed_Melee_Attack_Kick', 'Melee_2H_Slam'],
    aliases: ['Jump_Chop'],
    loop: false,
  },
  charged: {
    candidates: [
      '2H_Melee_Attack_Spinning',
      '2H_Melee_Attack_Spin',
      '2H_Melee_Attack_Chop',
      'Melee_2H_Slam',
      'Melee_Unarmed_Smash',
      'Melee_2H_Attack',
    ],
    aliases: ['Melee_1H_Attack_Spin', 'Melee_2H_Attack_Spin'],
    loop: false,
  },
  shield_bash: {
    candidates: ['Block_Attack', 'Melee_Block_Attack'],
    aliases: ['Melee_Shield_Bash'],
    loop: false,
  },
  block: {
    candidates: ['Blocking', 'Block', 'Melee_Blocking', 'Melee_Block'],
    aliases: ['Melee_Block', 'Blocking'],
    loop: true,
  },
  parry: {
    candidates: ['Block_Attack', 'Block_Hit', 'Melee_Block_Attack', 'Melee_Block_Hit'],
    aliases: ['Melee_Parry'],
    loop: false,
  },

  // Ranged / Magic / Romantic Co-Op Invocations
  mage_attack1: {
    candidates: ['Spellcast_Shoot', 'Melee_Unarmed_Punch'],
    aliases: ['Mage_Attack_1'],
    loop: false,
  },
  mage_attack2: {
    candidates: ['1H_Ranged_Shoot', '2H_Ranged_Shoot', 'Melee_2H_Attack'],
    aliases: ['Mage_Attack_2'],
    loop: false,
  },
  mage_attack3: {
    candidates: ['Spellcast_Raise', 'Melee_2H_Slam'],
    aliases: ['Mage_Attack_3'],
    loop: false,
  },
  mage_heavy: {
    candidates: ['Throw', 'Spellcast_Long', 'Melee_2H_Slam'],
    aliases: ['Mage_Heavy'],
    loop: false,
  },
  cast_shoot: {
    candidates: ['Spellcast_Shoot', '2H_Ranged_Shoot', '1H_Ranged_Shoot', 'Melee_Unarmed_Smash', 'Melee_2H_Slam'],
    aliases: ['Ranged_Magic_Shoot'],
    loop: false,
  },
  ranged_shoot: {
    candidates: ['2H_Ranged_Shoot', '1H_Ranged_Shoot', 'Spellcast_Shoot', 'Melee_1H_Stab'],
    aliases: ['2H_Ranged_Shoot', '1H_Ranged_Shoot'],
    loop: false,
  },
  cast_spell: {
    candidates: ['Spellcasting', 'Spellcast_Long', 'Idle_B'],
    aliases: ['Ranged_Magic_Spellcasting'],
    loop: true,
  },
  pray_channel: {
    candidates: ['Spellcast_Raise', 'Interact', 'Idle_B'],
    aliases: ['Ranged_Magic_Raise', 'Special_Interact'],
    loop: false,
  },
  burst_aoe: {
    candidates: ['Spellcast_Summon', 'Spellcast_Long', 'Melee_2H_Slam', 'Melee_Unarmed_Smash'],
    aliases: ['Ranged_Magic_Summon', 'Spellcast_Summon'],
    loop: false,
  },
  cheer: {
    candidates: ['Cheer', 'Idle_B'],
    aliases: ['General_Cheer'],
    loop: false,
  },
  wave: {
    candidates: ['Interact', 'Cheer', 'Use_Item', 'Idle_B'],
    aliases: ['General_Wave'],
    loop: false,
  },

  // Reactions & States
  hit_A: {
    candidates: ['Hit_A'],
    aliases: ['General_Hit_A', 'hit_a', 'Hit_A'],
    loop: false,
  },
  hit_B: {
    candidates: ['Hit_B', 'Hit_A'],
    aliases: ['General_Hit_B', 'hit_b', 'Hit_B'],
    loop: false,
  },
  hit_b: {
    candidates: ['Hit_B', 'Hit_A'],
    aliases: ['General_Hit_B'],
    loop: false,
  },
  downed: {
    candidates: ['Death_A', 'Death_B', 'Death_C_Skeletons'],
    aliases: ['General_Death_A', 'death'],
    loop: false,
  },
  death: {
    candidates: ['Death_A', 'Death_B', 'Death_C_Skeletons'],
    aliases: ['General_Death_A'],
    loop: false,
  },
  revive: {
    candidates: ['Spawn_Ground', 'Lie_StandUp', 'Cheer', 'Idle_A'],
    aliases: ['General_Spawn_Ground', 'General_StandUp'],
    loop: false,
  },
  spawn: {
    candidates: [
      'Spawn_Ground',
      'Spawn_Ground_Skeletons',
      'Skeletons_Awaken_Floor',
      'Idle_A',
      'Melee_2H_Idle',
    ],
    aliases: ['General_Spawn_Ground'],
    loop: false,
  },
  taunt: {
    candidates: ['Taunt', 'Taunt_Longer', 'Melee_Unarmed_Smash', 'Idle_B'],
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
    position: [0, 0.20, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
  'Skeleton_Crossbow.gltf': {
    id: 'Skeleton_Crossbow.gltf',
    url: `${SKELETONS_BASE}/Assets/gltf/Skeleton_Crossbow.gltf`,
    role: 'skeleton',
    slot: 'handSlot.r',
    position: [0, 0.05, 0.06],
    quaternion: [0, -1, 0, 0],
    scale: 0.92,
  },
};

// Alias bare weapon names (without `.gltf`) so callers can pass either `'Skeleton_Axe'` or `'Skeleton_Axe.gltf'`
WEAPON_SPECS.Skeleton_Blade = WEAPON_SPECS['Skeleton_Blade.gltf'];
WEAPON_SPECS.Skeleton_Shield_Large_A = WEAPON_SPECS['Skeleton_Shield_Large_A.gltf'];
WEAPON_SPECS.Skeleton_Staff = WEAPON_SPECS['Skeleton_Staff.gltf'];
WEAPON_SPECS.Skeleton_Dagger = WEAPON_SPECS['Skeleton_Dagger.gltf'];
WEAPON_SPECS.Skeleton_Axe = WEAPON_SPECS['Skeleton_Axe.gltf'];
WEAPON_SPECS.Skeleton_Crossbow = WEAPON_SPECS['Skeleton_Crossbow.gltf'];

/**
 * Complete Character Roster (5 Adventurer Heroes + 4 KayKit Skeletons + 8 Native Enemy/Boss Candidates).
 */
export const CHARACTER_ROSTER = {
  Knight: {
    id: 'Knight',
    faction: 'adventurer',
    role: 'knight',
    rig: 'Rig_Medium',
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
    rig: 'Rig_Medium',
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
    rig: 'Rig_Medium',
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
    rig: 'Rig_Medium',
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
    rig: 'Rig_Medium',
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
    rig: 'Rig_Medium',
    weaponStyle: '1h',
    glb: `${SKELETONS_BASE}/Characters/gltf/Skeleton_Warrior.glb`,
    keepAccessories: ['Skeleton_Warrior_Helmet'],
    weapons: {
      'handSlot.r': 'Skeleton_Axe.gltf',
      'handSlot.l': 'Skeleton_Shield_Large_A.gltf',
    },
    alternateWeapons: ['Skeleton_Axe.gltf', 'Skeleton_Blade.gltf'],
  },
  Skeleton_Mage: {
    id: 'Skeleton_Mage',
    faction: 'skeleton',
    role: 'skeleton',
    rig: 'Rig_Medium',
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
    rig: 'Rig_Medium',
    weaponStyle: '1h',
    glb: `${SKELETONS_BASE}/Characters/gltf/Skeleton_Rogue.glb`,
    keepAccessories: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'],
    weapons: {
      'handSlot.r': 'Skeleton_Crossbow.gltf',
      'handSlot.l': null,
    },
    alternateWeapons: ['Skeleton_Crossbow.gltf', 'Skeleton_Blade.gltf', 'Skeleton_Dagger.gltf'],
  },
  Skeleton_Minion: {
    id: 'Skeleton_Minion',
    faction: 'skeleton',
    role: 'skeleton',
    rig: 'Rig_Medium',
    weaponStyle: '1h',
    glb: `${SKELETONS_BASE}/Characters/gltf/Skeleton_Minion.glb`,
    keepAccessories: [],
    weapons: {
      'handSlot.r': 'Skeleton_Blade.gltf',
      'handSlot.l': null,
    },
  },
  OrcRaider: {
    id: 'OrcRaider',
    faction: 'enemy',
    role: 'skeleton',
    rig: 'Rig_Medium',
    weaponStyle: '2h',
    glb: `${ENEMY_CANDIDATES_BASE}/OrcRaider.glb`,
    textureUrl: `${ENEMY_CANDIDATES_BASE}/orc_texture_A.png`,
    keepAccessories: ['Orc_Warpack'],
    weapons: {
      'handSlot.r': 'Skeleton_Axe.gltf',
      'handSlot.l': null,
    },
  },
  PlantWarrior: {
    id: 'PlantWarrior',
    faction: 'enemy',
    role: 'skeleton',
    rig: 'Rig_Medium',
    weaponStyle: '1h',
    glb: `${ENEMY_CANDIDATES_BASE}/PlantWarrior.glb`,
    keepAccessories: ['PlantWarrior_Cloak'],
    weapons: {
      'handSlot.r': 'Skeleton_Staff.gltf',
      'handSlot.l': null,
    },
    alternateWeapons: ['Skeleton_Staff.gltf', 'Skeleton_Blade.gltf'],
  },
  Werewolf_Wolf: {
    id: 'Werewolf_Wolf',
    faction: 'enemy',
    role: 'skeleton',
    rig: 'Rig_Medium',
    weaponStyle: 'unarmed',
    glb: `${ENEMY_CANDIDATES_BASE}/Werewolf_Wolf.glb`,
    keepAccessories: [],
    weapons: {
      'handSlot.r': null,
      'handSlot.l': null,
    },
  },
  BlackKnight: {
    id: 'BlackKnight',
    faction: 'enemy',
    role: 'skeleton',
    rig: 'Rig_Medium',
    weaponStyle: '1h',
    glb: `${ENEMY_CANDIDATES_BASE}/BlackKnight.glb`,
    keepAccessories: ['BlackKnight_Cape', 'BlackKnight_ShoulderLeft', 'BlackKnight_ShoulderRight'],
    weapons: {
      'handSlot.r': 'Skeleton_Blade.gltf',
      'handSlot.l': 'Skeleton_Shield_Large_A.gltf',
    },
  },
  Necromancer: {
    id: 'Necromancer',
    faction: 'enemy',
    role: 'skeleton',
    rig: 'Rig_Medium',
    weaponStyle: 'magic',
    targetHeight: 2.35,
    glb: `${ENEMY_CANDIDATES_BASE}/Necromancer.glb`,
    keepAccessories: ['Necromancer_Crown'],
    weapons: {
      'handSlot.r': 'Skeleton_Staff.gltf',
      'handSlot.l': null,
    },
  },
  OrcBrute: {
    id: 'OrcBrute',
    faction: 'enemy',
    role: 'skeleton',
    rig: 'Rig_Large',
    weaponStyle: '2h',
    targetHeight: 2.55,
    glb: `${ENEMY_CANDIDATES_BASE}/OrcBrute.glb`,
    keepAccessories: ['OrcBrute_Shoulderpad', 'OrcBrute_LegArmor'],
    weapons: {
      'handSlot.r': 'Skeleton_Axe.gltf',
      'handSlot.l': null,
    },
  },
  FrostGolem: {
    id: 'FrostGolem',
    faction: 'enemy',
    role: 'skeleton',
    rig: 'Rig_Large',
    weaponStyle: 'unarmed',
    targetHeight: 2.85,
    glb: `${ENEMY_CANDIDATES_BASE}/FrostGolem.glb`,
    keepAccessories: [],
    weapons: {
      'handSlot.r': null,
      'handSlot.l': null,
    },
  },
  Skeleton_Golem: {
    id: 'Skeleton_Golem',
    faction: 'enemy',
    role: 'skeleton',
    rig: 'Rig_Large',
    weaponStyle: 'unarmed',
    targetHeight: 2.65,
    glb: `${ENEMY_CANDIDATES_BASE}/Skeleton_Golem.glb`,
    keepAccessories: ['Skeleton_Golem_Jaw', 'Skeleton_Golem_Eyes'],
    weapons: {
      'handSlot.r': null,
      'handSlot.l': null,
    },
  },
};

export const CHARACTER_DEFS = CHARACTER_ROSTER;

export const ADVENTURER_IDS = ['Knight', 'Mage', 'Barbarian', 'Rogue', 'Rogue_Hooded'];
export const SKELETON_IDS = ['Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue', 'Skeleton_Minion'];
export const ENEMY_ROSTER_IDS = [
  'Skeleton_Minion',
  'Skeleton_Warrior',
  'Skeleton_Rogue',
  'Skeleton_Mage',
  'OrcRaider',
  'PlantWarrior',
  'Werewolf_Wolf',
  'BlackKnight',
  'Necromancer',
  'OrcBrute',
  'FrostGolem',
  'Skeleton_Golem',
];

const rawGltfPromises = new Map();
const externalTexturePromises = new Map();
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

function loadExternalTexture(url) {
  if (!url) return Promise.resolve(null);
  if (typeof document === 'undefined' && typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  if (!externalTexturePromises.has(url)) {
    const texLoader = new THREE.TextureLoader();
    externalTexturePromises.set(
      url,
      texLoader
        .loadAsync(url)
        .then((tex) => {
          tex.flipY = false;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          return tex;
        })
        .catch(() => null)
    );
  }
  return externalTexturePromises.get(url);
}

/**
 * Stabilizes root/hips bone position tracks on combat & locomotion clips so
 * chained combos (combo1 -> combo2 -> combo3 -> combo4) never snap forward/backward
 * in bone space or float into the air while world-space movement is driven by player-controller.js.
 */
function stabilizeCombatRootMotion(clip) {
  if (!clip || !Array.isArray(clip.tracks)) return clip;
  const name = clip.name || '';
  const isMeleeAttack =
    name.includes('Melee_') ||
    name.includes('Block') ||
    name.includes('Spellcast') ||
    name.includes('Ranged_') ||
    name.startsWith('Dodge_') ||
    name.startsWith('Jump_Land');
  const isLocomotion = name.startsWith('Walking_') || name.startsWith('Running_');
  if (!isMeleeAttack && !isLocomotion) return clip;

  for (const track of clip.tracks) {
    if (!track || !track.name || !track.name.endsWith('.position')) continue;
    const boneName = track.name.slice(0, -'.position'.length).toLowerCase();
    if (boneName !== 'hips' && boneName !== 'root') continue;
    const vals = track.values;
    if (!vals || vals.length < 3) continue;

    const restX = vals[0];
    const restY = vals[1];
    const restZ = vals[2];
    for (let i = 0; i < vals.length; i += 3) {
      vals[i] = restX;
      vals[i + 2] = restZ;
      if (isMeleeAttack) {
        vals[i + 1] = Math.max(restY - 0.08, Math.min(restY + 0.035, vals[i + 1]));
      }
    }
  }
  return clip;
}

/**
 * Loads the complete 95-clip `Rig_Medium` master animation library (spanning all
 * 5 `Rig_Medium_*` categories) AND the `Rig_Large` animation packs (`Rig_Large_General.glb`,
 * `Rig_Large_MovementBasic.glb`, `Rig_Large_CombatMelee.glb`) for large bosses.
 */
export async function loadAnimationPacks(loader = new GLTFLoader()) {
  if (!masterClipBankPromise) {
    masterClipBankPromise = Promise.all([
      loadRawGltf(loader, CHARACTER_ROSTER.Knight.glb),
      loadRawGltf(loader, CHARACTER_ROSTER.Skeleton_Warrior.glb),
      ...RIG_LARGE_PACK_URLS.map((url) => loadRawGltf(loader, url).catch(() => ({ animations: [] }))),
    ]).then(([knightGltf, skelGltf, ...largeGltfs]) => {
      const clipMap = new Map();
      for (const clip of knightGltf.animations || []) {
        if (clip && clip.name) {
          clipMap.set(clip.name, stabilizeCombatRootMotion(clip));
        }
      }
      for (const clip of skelGltf.animations || []) {
        if (clip && clip.name && !clipMap.has(clip.name)) {
          clipMap.set(clip.name, stabilizeCombatRootMotion(clip));
        }
      }

      const largeClipMap = new Map();
      for (const lGltf of largeGltfs) {
        for (const clip of lGltf?.animations || []) {
          if (clip && clip.name && clip.name !== 'T-Pose' && !largeClipMap.has(clip.name)) {
            largeClipMap.set(clip.name, stabilizeCombatRootMotion(clip));
          }
        }
      }
      // Alias `Hit_B` to `Hit_A` on Rig_Large so `play('Hit_B')` works seamlessly on large bosses
      if (largeClipMap.has('Hit_A') && !largeClipMap.has('Hit_B')) {
        largeClipMap.set('Hit_B', largeClipMap.get('Hit_A'));
      }
      if (largeClipMap.has('Idle_A') && !largeClipMap.has('Idle_Combat')) {
        largeClipMap.set(
          'Idle_Combat',
          largeClipMap.get('Melee_2H_Idle') || largeClipMap.get('Idle_A')
        );
      }

      const largeBank = {
        packs: ANIMATION_PACKS,
        clipsByName: largeClipMap.size > 0 ? largeClipMap : clipMap,
        allClips: Array.from((largeClipMap.size > 0 ? largeClipMap : clipMap).values()),
      };

      return {
        packs: ANIMATION_PACKS,
        clipsByName: clipMap,
        allClips: Array.from(clipMap.values()),
        largeClipsByName: largeClipMap,
        largeAllClips: Array.from(largeClipMap.values()),
        largeBank,
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
  const spec = WEAPON_SPECS[weaponFile] || WEAPON_SPECS[`${weaponFile}.gltf`];
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
  weaponRoot.name = spec.id;
  weaponRoot.userData.weaponId = spec.id;
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
 * dictionary for a character instance (`Rig_Medium` or `Rig_Large`).
 */
export function createCharacterAnimationController(instanceRoot, clipBank, options = {}) {
  const weaponStyle = options.weaponStyle || '1h';
  const activeBank =
    options.rig === 'Rig_Large' && clipBank?.largeBank ? clipBank.largeBank : clipBank;
  const mixer = new THREE.AnimationMixer(instanceRoot);
  const rawActions = new Map();
  const semanticActions = new Map();
  const semanticClips = new Map();

  for (const clip of activeBank.allClips) {
    if (!clip || !clip.name) continue;
    const action = mixer.clipAction(clip);
    rawActions.set(clip.name, action);
  }

  for (const [semKey, def] of Object.entries(SEMANTIC_ANIMATIONS)) {
    const styleCandidates = (def.byStyle && def.byStyle[weaponStyle]) || [];
    const candidateList = [...styleCandidates, ...(def.candidates || [])];
    let matchedClip = null;
    for (const candidateName of candidateList) {
      const clip = activeBank.clipsByName.get(candidateName);
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
    const resolved = resolveAction(keyOrClipName) || resolveAction('idle');
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
    const resolved = resolveAction(keyOrClipName) || resolveAction('idle');
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
 * Instantiates a cel-shaded, outlined KayKit Adventurer, Skeleton, or Enemy/Boss
 * consolidated into 1 unified `SkinnedMesh` + 1 unified outline `SkinnedMesh`
 * with default socketed weapons and 100% native skeletal animation controller.
 */
export async function createCharacter(idOrName, options = {}) {
  const spec = resolveCharacterSpec(idOrName);
  const loader = options.loader || new GLTFLoader();

  const [charGltf, clipBank, externalTex] = await Promise.all([
    loadRawGltf(loader, spec.glb),
    loadAnimationPacks(loader),
    spec.textureUrl ? loadExternalTexture(spec.textureUrl) : Promise.resolve(null),
  ]);

  const group = new THREE.Group();
  group.name = `character-${spec.id}`;

  const modelRoot = cloneSkeleton(charGltf.scene);
  modelRoot.name = `${spec.id}-rig`;

  if (externalTex) {
    modelRoot.traverse((obj) => {
      if ((obj.isMesh || obj.isSkinnedMesh) && obj.material && !obj.material.map && obj.material.name !== 'Glow') {
        obj.material = obj.material.clone();
        obj.material.map = externalTex;
      }
    });
  }

  stripEmbeddedHandSlotMeshes(modelRoot, spec.keepAccessories);
  normalizeCharacterScale(
    modelRoot,
    options.targetHeight ?? spec.targetHeight ?? TARGET_CHARACTER_HEIGHT
  );

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
    rig: spec.rig || 'Rig_Medium',
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
    rig: spec.rig || 'Rig_Medium',
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
 * Convenience factory for the Stage 3 & Stage 5 Character & Native Motion kit.
 */
export function createCharactersKit(options = {}) {
  const loader = options.loader || new GLTFLoader();
  return {
    CHARACTER_ROSTER,
    CHARACTER_DEFS,
    ADVENTURER_IDS,
    SKELETON_IDS,
    ENEMY_ROSTER_IDS,
    WEAPON_SPECS,
    ANIMATION_PACKS,
    SEMANTIC_ANIMATIONS,
    loadAnimationPacks: () => loadAnimationPacks(loader),
    createCharacter: (id, opts = {}) => createCharacter(id, { loader, ...opts }),
  };
}
