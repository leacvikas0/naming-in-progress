// ============================================================================
// world/assets/characters/index.js
//
// Stage 3 Pass 2 & Stage 5 Full Native Roster:
// KayKit Character Factory, Unified SkinnedMesh Merger, Weapon Sockets &
// 100% Native Skeletal Animation Controller (`Rig_Medium` + `Rig_Large`).
//
// Rules enforced:
// - Player heroes come ONLY from `library/kaykit-v2/adventurers-2.0/`
//   (`Knight.glb`, `Mage.glb`, `Barbarian.glb`, `Rogue.glb`, `Rogue_Hooded.glb`).
// - Enemies come from `library/kaykit-v2/skeletons-1.1/` (`Skeleton_Warrior`,
//   `Skeleton_Mage`, `Skeleton_Rogue`, `Skeleton_Minion`, `Necromancer`, `Skeleton_Golem`)
//   plus the optional `library/enemy-candidates/` packs (`OrcRaider`, `PlantWarrior`,
//   `Werewolf_Wolf`, `BlackKnight`, `OrcBrute`, `FrostGolem`). A missing candidate model
//   falls back to a same-rig KayKit skeleton with a console warning.
// - 100% Native Diverse Skeletal Animations via `THREE.AnimationMixer` from the
//   KayKit Character Animations 1.1 `Rig_Medium_*` / `Rig_Large_*` packs (the v2
//   character GLBs carry no clips). 1.0 clip names resolve via `LEGACY_CLIP_ALIASES`.
//   Zero procedural bone-wiggling. Fetch assets with `npm run fetch:kaykit`.
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

// KayKit v2 library root (fetched by `npm run fetch:kaykit`, gitignored):
// Adventurers 2.0, Skeletons 1.1 and the shared Character Animations 1.1 rigs.
export const KAYKIT_V2_BASE = '/library/kaykit-v2';
export const ADVENTURERS_BASE = `${KAYKIT_V2_BASE}/adventurers-2.0`;
export const SKELETONS_BASE = `${KAYKIT_V2_BASE}/skeletons-1.1`;
export const ANIMATIONS_BASE = `${KAYKIT_V2_BASE}/character-animations-1.1/Animations/gltf`;
// Optional extra enemy models (not shipped in every checkout)
export const ENEMY_CANDIDATES_BASE = '/library/enemy-candidates';

const ADVENTURER_CHARACTERS_DIR = `${ADVENTURERS_BASE}/Characters/gltf`;
const ADVENTURER_ASSETS_DIR = `${ADVENTURERS_BASE}/Assets/gltf`;
const SKELETON_CHARACTERS_DIR = `${SKELETONS_BASE}/characters/gltf`;
const SKELETON_ASSETS_DIR = `${SKELETONS_BASE}/assets/gltf`;

export const TARGET_CHARACTER_HEIGHT = 1.9;
export const GOLEM_TARGET_HEIGHT = 2.8;

function animationPack(rig, category, clips) {
  const rigDir = rig === 'large' ? 'Rig_Large' : 'Rig_Medium';
  const id = `${rigDir}_${category}.glb`;
  return { id, rig, category, url: `${ANIMATIONS_BASE}/${rigDir}/${id}`, clips };
}

/**
 * KayKit Character Animations 1.1 packs. Character GLBs ship without clips, so
 * every clip comes from these rig-shared packs. `rig` must match the character's
 * skeleton (Rig_Medium: heroes + skeletons + Necromancer; Rig_Large: Golem).
 */
export const ANIMATION_PACKS = Object.fromEntries(
  [
    animationPack('medium', 'General', [
      'Death_A', 'Death_A_Pose', 'Death_B', 'Death_B_Pose', 'Hit_A', 'Hit_B', 'Idle_A', 'Idle_B',
      'Interact', 'PickUp', 'Spawn_Air', 'Spawn_Ground', 'T-Pose', 'Throw', 'Use_Item',
    ]),
    animationPack('medium', 'MovementBasic', [
      'Jump_Full_Long', 'Jump_Full_Short', 'Jump_Idle', 'Jump_Land', 'Jump_Start',
      'Running_A', 'Running_B', 'Walking_A', 'Walking_B', 'Walking_C',
    ]),
    animationPack('medium', 'MovementAdvanced', [
      'Crawling', 'Crouching', 'Dodge_Backward', 'Dodge_Forward', 'Dodge_Left', 'Dodge_Right',
      'Running_HoldingBow', 'Running_HoldingRifle', 'Running_Strafe_Left', 'Running_Strafe_Right',
      'Sneaking', 'Walking_Backwards',
    ]),
    animationPack('medium', 'CombatMelee', [
      'Melee_1H_Attack_Chop', 'Melee_1H_Attack_Jump_Chop', 'Melee_1H_Attack_Slice_Diagonal',
      'Melee_1H_Attack_Slice_Horizontal', 'Melee_1H_Attack_Stab', 'Melee_2H_Attack_Chop',
      'Melee_2H_Attack_Slice', 'Melee_2H_Attack_Spin', 'Melee_2H_Attack_Spinning', 'Melee_2H_Attack_Stab',
      'Melee_2H_Idle', 'Melee_Block', 'Melee_Block_Attack', 'Melee_Block_Hit', 'Melee_Blocking',
      'Melee_Dualwield_Attack_Chop', 'Melee_Dualwield_Attack_Slice', 'Melee_Dualwield_Attack_Stab',
      'Melee_Unarmed_Attack_Kick', 'Melee_Unarmed_Attack_Punch_A', 'Melee_Unarmed_Idle',
    ]),
    animationPack('medium', 'CombatRanged', [
      'Ranged_1H_Aiming', 'Ranged_1H_Reload', 'Ranged_1H_Shoot', 'Ranged_1H_Shooting',
      'Ranged_2H_Aiming', 'Ranged_2H_Reload', 'Ranged_2H_Shoot', 'Ranged_2H_Shooting',
      'Ranged_Bow_Aiming_Idle', 'Ranged_Bow_Draw', 'Ranged_Bow_Draw_Up', 'Ranged_Bow_Idle',
      'Ranged_Bow_Release', 'Ranged_Bow_Release_Up', 'Ranged_Magic_Raise', 'Ranged_Magic_Shoot',
      'Ranged_Magic_Spellcasting', 'Ranged_Magic_Spellcasting_Long', 'Ranged_Magic_Summon',
    ]),
    animationPack('medium', 'Simulation', [
      'Cheering', 'Lie_Down', 'Lie_Idle', 'Lie_StandUp', 'Push_Ups', 'Sit_Chair_Down', 'Sit_Chair_Idle',
      'Sit_Chair_StandUp', 'Sit_Floor_Down', 'Sit_Floor_Idle', 'Sit_Floor_StandUp', 'Sit_Ups', 'Waving',
    ]),
    animationPack('medium', 'Special', [
      'EXPERIMENTAL_Medium_Transform', 'Skeletons_Awaken_Floor', 'Skeletons_Awaken_Floor_Long',
      'Skeletons_Awaken_Standing', 'Skeletons_Death', 'Skeletons_Death_Pose', 'Skeletons_Death_Resurrect',
      'Skeletons_Idle', 'Skeletons_Inactive_Floor_Pose', 'Skeletons_Inactive_Standing_Pose',
      'Skeletons_Spawn_Ground', 'Skeletons_Taunt', 'Skeletons_Taunt_Longer', 'Skeletons_Walking',
    ]),
    animationPack('medium', 'Tools', [
      'Chop', 'Chopping', 'Dig', 'Digging', 'Fishing_Bite', 'Fishing_Cast', 'Fishing_Catch', 'Fishing_Idle',
      'Fishing_Reeling', 'Fishing_Struggling', 'Fishing_Tug', 'Hammer', 'Hammering', 'Holding_A',
      'Holding_B', 'Holding_C', 'Lockpick', 'Lockpicking', 'Pickaxe', 'Pickaxing', 'Saw', 'Sawing',
      'Work_A', 'Work_B', 'Work_C', 'Working_A', 'Working_B', 'Working_C',
    ]),
    animationPack('large', 'General', ['Death_A', 'Death_A_Pose', 'Hit_A', 'Idle_A', 'Idle_B', 'T-Pose']),
    animationPack('large', 'MovementBasic', ['Running_A', 'Walking_A']),
    animationPack('large', 'MovementAdvanced', ['Dodge_Backwards', 'Dodge_Forward', 'Dodge_Left', 'Dodge_Right']),
    animationPack('large', 'CombatMelee', [
      'Melee_1H_Slash', 'Melee_1H_Stab', 'Melee_2H_Attack', 'Melee_2H_Idle', 'Melee_2H_Slam', 'Melee_Block',
      'Melee_Block_Attack', 'Melee_Block_Hit', 'Melee_Blocking', 'Melee_Dualwield_Slash',
      'Melee_Dualwield_SlashCombo', 'Melee_Unarmed_Idle', 'Melee_Unarmed_Kick', 'Melee_Unarmed_Punch',
      'Melee_Unarmed_Smash',
    ]),
    animationPack('large', 'Simulation', ['Flexing']),
    animationPack('large', 'Special', ['EXPERIMENTAL_Large_Transform']),
  ].map((pack) => [pack.rig === 'large' ? `large:${pack.id}` : pack.id, pack])
);

/**
 * KayKit 1.0 clip names (still used by shot presets, sword-vfx timing tables and
 * enemy poses) -> ordered 1.1 candidates. The first candidate present in the
 * character's rig bank wins; trailing entries are Rig_Large fallbacks.
 * Entries marked `sub` have no exact 1.1 equivalent.
 */
export const LEGACY_CLIP_ALIASES = {
  // General
  Idle: ['Idle_A'],
  Unarmed_Idle: ['Melee_Unarmed_Idle'],
  Cheer: ['Cheering', 'Flexing'],
  Taunt: ['Skeletons_Taunt', 'Flexing'], // sub: Special pack skeleton taunt
  Taunt_Longer: ['Skeletons_Taunt_Longer', 'Flexing'], // sub
  Hit_B: ['Hit_B', 'Hit_A'],
  Death_B: ['Death_B', 'Death_A'],
  Death_B_Pose: ['Death_B_Pose', 'Death_A_Pose'],
  Lie_Pose: ['Lie_Idle'], // sub: 1.1 has no static lie pose
  // Movement
  Walking_B: ['Walking_B', 'Walking_A'],
  Walking_C: ['Walking_C', 'Walking_A'],
  Running_B: ['Running_B', 'Running_A'],
  Running_C: ['Running_B', 'Running_A'], // sub: Running_C removed
  Dodge_Backward: ['Dodge_Backward', 'Dodge_Backwards'],
  // Melee
  Idle_Combat: ['Idle_A', 'Melee_2H_Idle'], // sub: Idle_Combat removed; 1H/shield stance stays upright in Idle_A
  '2H_Melee_Idle': ['Melee_2H_Idle'],
  '1H_Melee_Attack_Slice_Horizontal': ['Melee_1H_Attack_Slice_Horizontal', 'Melee_1H_Slash'],
  '1H_Melee_Attack_Slice_Diagonal': ['Melee_1H_Attack_Slice_Diagonal', 'Melee_1H_Slash'],
  '1H_Melee_Attack_Chop': ['Melee_1H_Attack_Chop', 'Melee_2H_Attack'],
  '1H_Melee_Attack_Stab': ['Melee_1H_Attack_Stab', 'Melee_1H_Stab'],
  '1H_Melee_Attack_Jump_Chop': ['Melee_1H_Attack_Jump_Chop', 'Melee_2H_Slam'],
  '2H_Melee_Attack_Chop': ['Melee_2H_Attack_Chop', 'Melee_2H_Attack'],
  '2H_Melee_Attack_Slice': ['Melee_2H_Attack_Slice', 'Melee_2H_Attack'],
  '2H_Melee_Attack_Stab': ['Melee_2H_Attack_Stab', 'Melee_1H_Stab'],
  '2H_Melee_Attack_Spin': ['Melee_2H_Attack_Spin', 'Melee_Dualwield_SlashCombo'],
  '2H_Melee_Attack_Spinning': ['Melee_2H_Attack_Spinning', 'Melee_Dualwield_SlashCombo'],
  Dualwield_Melee_Attack_Chop: ['Melee_Dualwield_Attack_Chop', 'Melee_Dualwield_Slash'],
  Dualwield_Melee_Attack_Slice: ['Melee_Dualwield_Attack_Slice', 'Melee_Dualwield_Slash'],
  Dualwield_Melee_Attack_Stab: ['Melee_Dualwield_Attack_Stab', 'Melee_Dualwield_SlashCombo'],
  Block: ['Melee_Block'],
  Blocking: ['Melee_Blocking'],
  Block_Attack: ['Melee_Block_Attack'],
  Block_Hit: ['Melee_Block_Hit'],
  Unarmed_Melee_Attack_Punch_A: ['Melee_Unarmed_Attack_Punch_A', 'Melee_Unarmed_Punch'],
  Unarmed_Melee_Attack_Punch_B: ['Melee_Unarmed_Attack_Punch_A', 'Melee_Unarmed_Punch'], // sub: Punch_B removed
  Unarmed_Melee_Attack_Kick: ['Melee_Unarmed_Attack_Kick', 'Melee_Unarmed_Kick'],
  // Ranged / magic
  Spellcast_Shoot: ['Ranged_Magic_Shoot', 'Melee_Unarmed_Punch'],
  Spellcasting: ['Ranged_Magic_Spellcasting', 'Melee_Unarmed_Idle'],
  Spellcast_Raise: ['Ranged_Magic_Raise', 'Flexing'],
  Spellcast_Long: ['Ranged_Magic_Spellcasting_Long', 'Melee_Unarmed_Smash'],
  Spellcast_Summon: ['Ranged_Magic_Summon', 'Melee_Unarmed_Smash'],
  '1H_Ranged_Aiming': ['Ranged_1H_Aiming'],
  '1H_Ranged_Shoot': ['Ranged_1H_Shoot'],
  '1H_Ranged_Shooting': ['Ranged_1H_Shooting'],
  '1H_Ranged_Reload': ['Ranged_1H_Reload'],
  '2H_Ranged_Aiming': ['Ranged_2H_Aiming'],
  '2H_Ranged_Shoot': ['Ranged_2H_Shoot'],
  '2H_Ranged_Shooting': ['Ranged_2H_Shooting'],
  '2H_Ranged_Reload': ['Ranged_2H_Reload'],
  // Special
  Spawn_Ground_Skeletons: ['Skeletons_Spawn_Ground'],
  Skeleton_Inactive_Standing_Pose: ['Skeletons_Inactive_Standing_Pose'],
  Death_C_Skeletons: ['Skeletons_Death', 'Death_A'],
  Death_C_Skeletons_Resurrect: ['Skeletons_Death_Resurrect'],
  Walking_D_Skeletons: ['Skeletons_Walking', 'Walking_A'],
  Sit_Chair_Pose: ['Sit_Chair_Idle'], // sub: static pose removed
  Sit_Floor_Pose: ['Sit_Floor_Idle'], // sub: static pose removed
};

export const RIG_LARGE_PACK_URLS = Object.values(ANIMATION_PACKS)
  .filter((pack) => pack.rig === 'large')
  .map((pack) => pack.url);

/**
 * Semantic dictionary of 100% native skeletal animations mapped to KayKit 1.1
 * clips. Candidate lists may use 1.1 or legacy names (resolved through
 * `LEGACY_CLIP_ALIASES`). Resolution order per character: `byRig[rig]`, then
 * `byStyle[weaponStyle]`, then `candidates`. `byRig.large` supplies the Rig_Large
 * (Golem/Brute) clip set, which has no ranged/jump/spawn clips.
 */
export const SEMANTIC_ANIMATIONS = {
  // Locomotion
  idle: {
    candidates: ['Idle_Combat', 'Idle_A', 'Melee_2H_Idle', 'Idle_B'],
    byStyle: {
      '2h': ['Melee_2H_Idle', 'Idle_A'],
      dual: ['Idle_A'],
      '1h': ['Idle_A'],
      magic: ['Idle_A'], // Idle_Combat is a 2H guard stance in 1.1; casters stay relaxed
      unarmed: ['Melee_Unarmed_Idle', 'Idle_A'],
    },
    byRig: { large: ['Melee_2H_Idle', 'Idle_A'] },
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
    candidates: ['Running_B', 'Running_A'],
    aliases: ['MovementBasic_Sprint'],
    loop: true,
  },
  walk_back: {
    candidates: ['Walking_Backwards', 'Walking_A'],
    loop: true,
  },
  strafe_left: {
    candidates: ['Running_Strafe_Left', 'Running_A'],
    byRig: { large: ['Walking_A'] },
    loop: true,
  },
  strafe_right: {
    candidates: ['Running_Strafe_Right', 'Running_A'],
    byRig: { large: ['Walking_A'] },
    loop: true,
  },
  dash: {
    candidates: ['Dodge_Forward', 'Dodge_Right', 'Dodge_Left', 'Dodge_Backward', 'Running_A'],
    aliases: ['MovementBasic_Dash', 'Dodge_Forward'],
    loop: false,
  },
  dodge_forward: { candidates: ['Dodge_Forward', 'Running_A'], loop: false },
  dodge_back: { candidates: ['Dodge_Backward', 'Dodge_Backwards', 'Walking_Backwards'], loop: false },
  dodge_left: { candidates: ['Dodge_Left', 'Dodge_Forward'], loop: false },
  dodge_right: { candidates: ['Dodge_Right', 'Dodge_Forward'], loop: false },
  jump_start: {
    candidates: ['Jump_Start', 'Idle_A'],
    byRig: { large: ['Dodge_Forward'] },
    aliases: ['MovementBasic_Jump_Start'],
    loop: false,
  },
  jump_idle: {
    candidates: ['Jump_Idle', 'Idle_A'],
    byRig: { large: ['Idle_A'] },
    aliases: ['MovementBasic_Jump_Idle'],
    loop: true,
  },
  jump_land: {
    candidates: ['Jump_Land', 'Idle_A'],
    byRig: { large: ['Hit_A'] },
    aliases: ['MovementBasic_Jump_Land'],
    loop: false,
  },

  // Melee Combat
  combo1: {
    candidates: [
      'Melee_1H_Attack_Slice_Horizontal',
      'Melee_1H_Slash',
      'Melee_2H_Attack',
      'Melee_Unarmed_Punch',
    ],
    byStyle: {
      '1h': ['Melee_1H_Attack_Slice_Horizontal', 'Melee_1H_Slash'],
      '2h': ['Melee_2H_Attack_Slice', 'Melee_1H_Attack_Slice_Horizontal', 'Melee_2H_Attack'],
      unarmed: ['Melee_Unarmed_Attack_Punch_A', 'Melee_1H_Attack_Slice_Horizontal', 'Melee_Unarmed_Punch'],
      dual: ['Melee_Dualwield_Attack_Slice', 'Melee_1H_Attack_Slice_Horizontal', 'Melee_Dualwield_Slash'],
    },
    byRig: { large: ['Melee_2H_Attack'] },
    aliases: ['Melee_1H_Attack_Slice_Horizontal'],
    loop: false,
  },
  combo2: {
    candidates: [
      'Melee_1H_Attack_Slice_Diagonal',
      'Melee_2H_Attack',
      'Melee_1H_Slash',
      'Melee_Unarmed_Smash',
    ],
    byStyle: {
      '1h': ['Melee_1H_Attack_Slice_Diagonal', 'Melee_1H_Slash'],
      '2h': ['Melee_2H_Attack_Chop', 'Melee_1H_Attack_Slice_Diagonal', 'Melee_2H_Attack'],
      unarmed: ['Melee_Unarmed_Attack_Kick', 'Melee_1H_Attack_Slice_Diagonal', 'Melee_Unarmed_Smash'],
      dual: ['Melee_Dualwield_Attack_Chop', 'Melee_1H_Attack_Slice_Diagonal', 'Melee_Dualwield_SlashCombo'],
    },
    byRig: { large: ['Melee_1H_Slash'] },
    aliases: ['Melee_1H_Attack_Slice_Diagonal'],
    loop: false,
  },
  combo3: {
    candidates: ['Melee_1H_Attack_Chop', 'Melee_2H_Slam', 'Melee_Unarmed_Smash'],
    byRig: { large: ['Melee_Dualwield_Slash'] },
    aliases: ['Melee_1H_Attack_Chop'],
    loop: false,
  },
  combo4: {
    candidates: [
      'Melee_1H_Attack_Stab',
      'Melee_1H_Attack_Chop',
      'Melee_1H_Attack_Slice_Diagonal',
      'Melee_2H_Slam',
      'Melee_Unarmed_Smash',
    ],
    byRig: { large: ['Melee_2H_Slam'] },
    aliases: ['Melee_1H_Attack_Jump_Chop', 'Melee_1H_Attack_Stab_Finisher'],
    loop: false,
  },
  stab: {
    candidates: ['Melee_1H_Attack_Stab', 'Melee_1H_Stab', 'Melee_Unarmed_Punch'],
    byRig: { large: ['Melee_1H_Stab'] },
    aliases: ['Melee_1H_Attack_Stab'],
    loop: false,
  },
  pounce: {
    candidates: ['Melee_1H_Attack_Jump_Chop', 'Melee_Unarmed_Attack_Kick', 'Melee_2H_Slam'],
    aliases: ['Jump_Chop'],
    loop: false,
  },
  charged: {
    candidates: [
      'Melee_2H_Attack_Spinning',
      'Melee_2H_Attack_Spin',
      'Melee_2H_Attack_Chop',
      'Melee_2H_Slam',
      'Melee_Unarmed_Smash',
      'Melee_2H_Attack',
    ],
    byRig: { large: ['Melee_2H_Slam'] },
    aliases: ['Melee_1H_Attack_Spin', 'Melee_2H_Attack_Spin'],
    loop: false,
  },
  shield_bash: {
    candidates: ['Melee_Block_Attack'],
    aliases: ['Melee_Shield_Bash'],
    loop: false,
  },
  block: {
    candidates: ['Melee_Blocking', 'Melee_Block'],
    aliases: ['Melee_Block', 'Blocking'],
    loop: true,
  },
  parry: {
    candidates: ['Melee_Block_Attack', 'Melee_Block_Hit'],
    aliases: ['Melee_Parry'],
    loop: false,
  },

  // Ranged / Magic / Romantic Co-Op Invocations
  mage_attack1: {
    candidates: ['Ranged_Magic_Shoot', 'Melee_Unarmed_Punch'],
    byRig: { large: ['Melee_Unarmed_Punch'] },
    aliases: ['Mage_Attack_1'],
    loop: false,
  },
  mage_attack2: {
    candidates: ['Ranged_1H_Shoot', 'Ranged_2H_Shoot', 'Melee_2H_Attack'],
    byRig: { large: ['Melee_Unarmed_Kick'] },
    aliases: ['Mage_Attack_2'],
    loop: false,
  },
  mage_attack3: {
    candidates: ['Ranged_Magic_Raise', 'Melee_2H_Slam'],
    byRig: { large: ['Melee_Unarmed_Smash'] },
    aliases: ['Mage_Attack_3'],
    loop: false,
  },
  mage_heavy: {
    candidates: ['Throw', 'Ranged_Magic_Spellcasting_Long', 'Melee_2H_Slam'],
    byRig: { large: ['Melee_Unarmed_Smash'] },
    aliases: ['Mage_Heavy'],
    loop: false,
  },
  cast_shoot: {
    candidates: ['Ranged_Magic_Shoot', 'Ranged_2H_Shoot', 'Ranged_1H_Shoot', 'Melee_Unarmed_Smash', 'Melee_2H_Slam'],
    byRig: { large: ['Melee_Unarmed_Punch'] },
    aliases: ['Ranged_Magic_Shoot'],
    loop: false,
  },
  ranged_shoot: {
    candidates: ['Ranged_2H_Shoot', 'Ranged_1H_Shoot', 'Ranged_Magic_Shoot', 'Melee_1H_Stab'],
    aliases: ['2H_Ranged_Shoot', '1H_Ranged_Shoot'],
    loop: false,
  },
  cast_spell: {
    candidates: ['Ranged_Magic_Spellcasting', 'Ranged_Magic_Spellcasting_Long', 'Idle_B'],
    byRig: { large: ['Melee_Unarmed_Idle'] },
    aliases: ['Ranged_Magic_Spellcasting'],
    loop: true,
  },
  pray_channel: {
    candidates: ['Ranged_Magic_Raise', 'Interact', 'Idle_B'],
    byRig: { large: ['Flexing'] },
    aliases: ['Ranged_Magic_Raise', 'Special_Interact'],
    loop: false,
  },
  burst_aoe: {
    candidates: ['Ranged_Magic_Summon', 'Ranged_Magic_Spellcasting_Long', 'Melee_2H_Slam', 'Melee_Unarmed_Smash'],
    byRig: { large: ['Melee_Unarmed_Smash'] },
    aliases: ['Ranged_Magic_Summon', 'Spellcast_Summon'],
    loop: false,
  },
  cheer: {
    candidates: ['Cheering', 'Idle_B'],
    byRig: { large: ['Flexing'] },
    aliases: ['General_Cheer'],
    loop: false,
  },
  wave: {
    candidates: ['Waving', 'Interact', 'Cheering', 'Use_Item', 'Idle_B'],
    byRig: { large: ['Flexing'] },
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
    aliases: ['General_Hit_B', 'Hit_B'],
    loop: false,
  },
  hit_b: {
    candidates: ['Hit_B', 'Hit_A'],
    loop: false,
  },
  downed: {
    candidates: ['Death_A', 'Death_B', 'Skeletons_Death'],
    aliases: ['General_Death_A'],
    loop: false,
  },
  death: {
    candidates: ['Death_A', 'Death_B', 'Skeletons_Death'],
    loop: false,
  },
  revive: {
    candidates: ['Spawn_Ground', 'Lie_StandUp', 'Cheering', 'Idle_A'],
    byRig: { large: ['Flexing'] },
    aliases: ['General_Spawn_Ground', 'General_StandUp'],
    loop: false,
  },
  spawn: {
    candidates: [
      'Spawn_Ground',
      'Skeletons_Spawn_Ground',
      'Skeletons_Awaken_Floor',
      'Idle_A',
      'Melee_2H_Idle',
    ],
    byRig: { large: ['Melee_Unarmed_Smash'] },
    aliases: ['General_Spawn_Ground'],
    loop: false,
  },
  taunt: {
    candidates: ['Skeletons_Taunt', 'Skeletons_Taunt_Longer', 'Melee_Unarmed_Smash', 'Idle_B'],
    byRig: { large: ['Flexing'] },
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
    url: `${ADVENTURER_ASSETS_DIR}/sword_1handed.gltf`,
    role: 'knight',
    slot: 'handSlot.r',
    position: [0, 0.04, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
  'shield_badge.gltf': {
    id: 'shield_badge.gltf',
    url: `${ADVENTURER_ASSETS_DIR}/shield_badge.gltf`,
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
    url: `${ADVENTURER_ASSETS_DIR}/staff.gltf`,
    role: 'mage',
    slot: 'handSlot.r',
    position: [0, 0.06, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
  'spellbook_open.gltf': {
    id: 'spellbook_open.gltf',
    url: `${ADVENTURER_ASSETS_DIR}/spellbook_open.gltf`,
    role: 'mage',
    slot: 'handSlot.l',
    position: [0, 0.19, 0.05],
    quaternion: [0, 0.7071068, 0.7071068, 0],
    scale: 1.0,
  },
  'axe_2handed.gltf': {
    id: 'axe_2handed.gltf',
    url: `${ADVENTURER_ASSETS_DIR}/axe_2handed.gltf`,
    role: 'barbarian',
    slot: 'handSlot.r',
    position: [0, 0.04, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
  'dagger.gltf': {
    id: 'dagger.gltf',
    url: `${ADVENTURER_ASSETS_DIR}/dagger.gltf`,
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
    url: `${SKELETON_ASSETS_DIR}/Skeleton_Blade.gltf`,
    role: 'skeleton',
    slot: 'handSlot.r',
    position: [0, 0.04, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
  'Skeleton_Shield_Large_A.gltf': {
    id: 'Skeleton_Shield_Large_A.gltf',
    url: `${SKELETON_ASSETS_DIR}/Skeleton_Shield_Large_A.gltf`,
    role: 'skeleton',
    slot: 'handSlot.l',
    position: [0, 0.017, 0.165],
    quaternion: [0, 0, 0, 1],
    scale: 1.0,
  },
  'Skeleton_Staff.gltf': {
    id: 'Skeleton_Staff.gltf',
    url: `${SKELETON_ASSETS_DIR}/Skeleton_Staff.gltf`,
    role: 'skeleton',
    slot: 'handSlot.r',
    position: [0, 0.14, 0],
    quaternion: [0, 0.7071068, 0, 0.7071068],
    scale: 1.0,
  },
  'Skeleton_Dagger.gltf': {
    id: 'Skeleton_Dagger.gltf',
    url: `${ADVENTURER_ASSETS_DIR}/dagger.gltf`,
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
    url: `${SKELETON_ASSETS_DIR}/Skeleton_Axe.gltf`,
    role: 'skeleton',
    slot: 'handSlot.r',
    position: [0, 0.20, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
  },
  'Skeleton_Crossbow.gltf': {
    id: 'Skeleton_Crossbow.gltf',
    url: `${SKELETON_ASSETS_DIR}/Skeleton_Crossbow.gltf`,
    role: 'skeleton',
    slot: 'handSlot.r',
    position: [0, 0.05, 0.06],
    quaternion: [0, -1, 0, 0],
    scale: 0.92,
  },
  'Skeleton_Golem_Axe_Large.gltf': {
    id: 'Skeleton_Golem_Axe_Large.gltf',
    url: `${SKELETON_ASSETS_DIR}/Skeleton_Golem_Axe_Large.gltf`,
    role: 'skeleton',
    slot: 'handSlot.r',
    // Authored for Rig_Large hands (2x the Medium Skeleton_Golem_Axe)
    position: [0, 0.0, 0],
    quaternion: [0, -1, 0, 0],
    scale: 1.0,
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
 * Complete Character Roster (5 Adventurer Heroes + 4 Skeleton Enemies + 6 external enemy
 * candidates + 2 Skeleton elites).
 */
export const CHARACTER_ROSTER = {
  Knight: {
    id: 'Knight',
    faction: 'adventurer',
    role: 'knight',
    rig: 'medium',
    weaponStyle: '1h',
    glb: `${ADVENTURER_CHARACTERS_DIR}/Knight.glb`,
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
    rig: 'medium',
    weaponStyle: 'magic',
    glb: `${ADVENTURER_CHARACTERS_DIR}/Mage.glb`,
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
    rig: 'medium',
    weaponStyle: '2h',
    glb: `${ADVENTURER_CHARACTERS_DIR}/Barbarian.glb`,
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
    rig: 'medium',
    weaponStyle: 'dual',
    glb: `${ADVENTURER_CHARACTERS_DIR}/Rogue.glb`,
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
    rig: 'medium',
    weaponStyle: 'dual',
    glb: `${ADVENTURER_CHARACTERS_DIR}/Rogue_Hooded.glb`,
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
    rig: 'medium',
    weaponStyle: '1h',
    glb: `${SKELETON_CHARACTERS_DIR}/Skeleton_Warrior.glb`,
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
    rig: 'medium',
    weaponStyle: 'magic',
    glb: `${SKELETON_CHARACTERS_DIR}/Skeleton_Mage.glb`,
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
    rig: 'medium',
    weaponStyle: '1h',
    glb: `${SKELETON_CHARACTERS_DIR}/Skeleton_Rogue.glb`,
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
    rig: 'medium',
    weaponStyle: '1h',
    glb: `${SKELETON_CHARACTERS_DIR}/Skeleton_Minion.glb`,
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
    rig: 'medium',
    weaponStyle: '2h',
    glb: `${ENEMY_CANDIDATES_BASE}/OrcRaider.glb`,
    fallbackId: 'Skeleton_Warrior',
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
    rig: 'medium',
    weaponStyle: '1h',
    glb: `${ENEMY_CANDIDATES_BASE}/PlantWarrior.glb`,
    fallbackId: 'Skeleton_Rogue',
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
    rig: 'medium',
    weaponStyle: 'unarmed',
    glb: `${ENEMY_CANDIDATES_BASE}/Werewolf_Wolf.glb`,
    fallbackId: 'Skeleton_Minion',
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
    rig: 'medium',
    weaponStyle: '1h',
    glb: `${ENEMY_CANDIDATES_BASE}/BlackKnight.glb`,
    fallbackId: 'Skeleton_Warrior',
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
    rig: 'medium',
    weaponStyle: 'magic',
    targetHeight: 2.35,
    glb: `${SKELETON_CHARACTERS_DIR}/Necromancer.glb`,
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
    rig: 'large',
    weaponStyle: '2h',
    targetHeight: 2.55,
    glb: `${ENEMY_CANDIDATES_BASE}/OrcBrute.glb`,
    fallbackId: 'Skeleton_Golem',
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
    rig: 'large',
    weaponStyle: 'unarmed',
    targetHeight: 2.85,
    glb: `${ENEMY_CANDIDATES_BASE}/FrostGolem.glb`,
    fallbackId: 'Skeleton_Golem',
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
    rig: 'large',
    weaponStyle: '2h',
    targetHeight: GOLEM_TARGET_HEIGHT,
    glb: `${SKELETON_CHARACTERS_DIR}/Skeleton_Golem.glb`,
    keepAccessories: ['Skeleton_Golem_Jaw', 'Skeleton_Golem_Eyes'],
    weapons: {
      'handSlot.r': 'Skeleton_Golem_Axe_Large.gltf',
      'handSlot.l': null,
    },
  },
};

export const CHARACTER_DEFS = CHARACTER_ROSTER;

export const ADVENTURER_IDS = ['Knight', 'Mage', 'Barbarian', 'Rogue', 'Rogue_Hooded'];
export const SKELETON_IDS = ['Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue', 'Skeleton_Minion'];
export const ELITE_SKELETON_IDS = ['Necromancer', 'Skeleton_Golem'];
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
const missingModelUrls = new Set();
const clipBankPromises = new Map();
const loadedClipBanks = new Map();
const adaptedClipBanks = new Map();

const rigKeyOf = (rig) => (String(rig || '').toLowerCase().includes('large') ? 'large' : 'medium');

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
 * Loads a character GLB. Optional enemy-candidate models may be absent from a
 * checkout; those specs name a same-rig `fallbackId` KayKit skeleton that is
 * used instead (with one console warning) so the game never crashes on spawn.
 */
async function loadCharacterModel(loader, spec) {
  const fallback = spec.fallbackId ? CHARACTER_ROSTER[spec.fallbackId] : null;
  if (!fallback || !missingModelUrls.has(spec.glb)) {
    try {
      return { gltf: await loadRawGltf(loader, spec.glb), spec };
    } catch (err) {
      if (!fallback) throw err;
      missingModelUrls.add(spec.glb);
      console.warn(
        `[characters] ${spec.id} model unavailable (${spec.glb}); using ${fallback.id} model instead.`,
        err?.message || err
      );
    }
  }
  return {
    gltf: await loadRawGltf(loader, fallback.glb),
    spec: {
      ...spec,
      glb: fallback.glb,
      textureUrl: null,
      keepAccessories: fallback.keepAccessories,
      fallbackFor: spec.id,
    },
  };
}

function trackBoneName(trackName) {
  const dot = trackName.lastIndexOf('.');
  return dot > 0 ? trackName.slice(0, dot) : trackName;
}

/**
 * Finds a clip by exact 1.1 name, falling back to `LEGACY_CLIP_ALIASES` for 1.0 names.
 */
function findBankClip(clipsByName, name) {
  if (!name) return null;
  const direct = clipsByName.get(name);
  if (direct) return direct;
  for (const candidate of LEGACY_CLIP_ALIASES[name] || []) {
    const clip = clipsByName.get(candidate);
    if (clip) return clip;
  }
  return null;
}

/**
 * Loads every KayKit 1.1 animation pack for one rig (`'medium'` default, or
 * `'large'` for the Golem) into a shared clip bank. Duplicate names (T-Pose)
 * keep the first pack's clip.
 */
export async function loadAnimationPacks(loader = new GLTFLoader(), rig = 'medium') {
  const rigKey = rigKeyOf(rig);
  if (!clipBankPromises.has(rigKey)) {
    const packs = Object.values(ANIMATION_PACKS).filter((pack) => pack.rig === rigKey);
    const promise = Promise.all(packs.map((pack) => loadRawGltf(loader, pack.url))).then((gltfs) => {
      const clipsByName = new Map();
      const clipPack = new Map();
      gltfs.forEach((gltf, i) => {
        for (const clip of gltf.animations || []) {
          if (clip && clip.name && !clipsByName.has(clip.name)) {
            clipsByName.set(clip.name, stabilizeCombatRootMotion(clip));
            clipPack.set(clip.name, packs[i].id);
          }
        }
      });
      // Pack mannequin rest translations, used to re-base clips onto each character's own bone lengths
      const restPositions = new Map();
      gltfs[0]?.scene.traverse((obj) => {
        if (obj.isBone && !restPositions.has(obj.name)) restPositions.set(obj.name, obj.position.clone());
      });
      const bank = {
        rig: rigKey,
        packs: Object.fromEntries(packs.map((pack) => [pack.id, pack])),
        clipsByName,
        clipPack,
        allClips: Array.from(clipsByName.values()),
        restPositions,
      };
      loadedClipBanks.set(rigKey, bank);
      return bank;
    });
    promise.catch(() => clipBankPromises.delete(rigKey));
    clipBankPromises.set(rigKey, promise);
  }
  return clipBankPromises.get(rigKey);
}

/**
 * Lists the native clips of an already-loaded rig bank as `{ name, duration, pack, rig }`.
 * Returns `[]` until `loadAnimationPacks` (or `createCharacter`) has resolved for that rig.
 */
export function listAvailableClips(rig = 'medium') {
  const bank = loadedClipBanks.get(rigKeyOf(rig));
  if (!bank) return [];
  return bank.allClips.map((clip) => ({
    name: clip.name,
    duration: Number(clip.duration.toFixed(3)),
    pack: bank.clipPack.get(clip.name),
    rig: bank.rig,
  }));
}

/**
 * Resolves a semantic key, 1.0 legacy name or 1.1 clip name to the 1.1 clip name
 * for a rig without instantiating a character (null if unknown or not loaded).
 */
export function resolveClipNameForRig(keyOrName, { rig = 'medium', weaponStyle = '1h' } = {}) {
  const bank = loadedClipBanks.get(rigKeyOf(rig));
  if (!bank || !keyOrName) return null;
  const def = SEMANTIC_ANIMATIONS[keyOrName];
  if (def) {
    for (const name of semanticCandidates(def, bank.rig, weaponStyle)) {
      const clip = findBankClip(bank.clipsByName, name);
      if (clip) return clip.name;
    }
  }
  return findBankClip(bank.clipsByName, keyOrName)?.name ?? null;
}

function semanticCandidates(def, rig, weaponStyle) {
  return [...(def.byRig?.[rig] || []), ...(def.byStyle?.[weaponStyle] || []), ...(def.candidates || [])];
}

/**
 * Shifts translation tracks by (character rest - pack rest) for bones whose
 * rest offset differs (e.g. Skeleton_Golem head vs the Rig_Large mannequin),
 * so shared clips keep each character's proportions. Cached per character.
 */
function adaptClipBankToRig(bank, modelRoot, cacheKey) {
  const key = `${bank.rig}:${cacheKey}`;
  if (adaptedClipBanks.has(key)) return adaptedClipBanks.get(key);

  const deltas = new Map();
  modelRoot.traverse((obj) => {
    const packRest = obj.isBone && bank.restPositions.get(obj.name);
    if (packRest && packRest.distanceToSquared(obj.position) > 1e-8) {
      deltas.set(obj.name, obj.position.clone().sub(packRest));
    }
  });

  let adapted = bank;
  if (deltas.size) {
    const clipsByName = new Map();
    for (const [name, clip] of bank.clipsByName) {
      let changed = false;
      const tracks = clip.tracks.map((track) => {
        const delta = track.name.endsWith('.position') && deltas.get(trackBoneName(track.name));
        if (!delta) return track;
        changed = true;
        const shifted = track.clone();
        for (let i = 0; i < shifted.values.length; i += 3) {
          shifted.values[i] += delta.x;
          shifted.values[i + 1] += delta.y;
          shifted.values[i + 2] += delta.z;
        }
        return shifted;
      });
      clipsByName.set(name, changed ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : clip);
    }
    adapted = { ...bank, clipsByName, allClips: Array.from(clipsByName.values()) };
  }
  adaptedClipBanks.set(key, adapted);
  return adapted;
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
  const rig = rigKeyOf(options.rig || clipBank.rig);
  const mixer = new THREE.AnimationMixer(instanceRoot);
  const rawActions = new Map();
  const semanticActions = new Map();
  const semanticClips = new Map();

  for (const clip of clipBank.allClips) {
    if (!clip || !clip.name) continue;
    const action = mixer.clipAction(clip);
    rawActions.set(clip.name, action);
  }

  // 1.0 clip names keep playing through their 1.1 substitutes
  for (const legacyName of Object.keys(LEGACY_CLIP_ALIASES)) {
    if (rawActions.has(legacyName)) continue;
    const clip = findBankClip(clipBank.clipsByName, legacyName);
    if (clip) rawActions.set(legacyName, rawActions.get(clip.name));
  }

  for (const [semKey, def] of Object.entries(SEMANTIC_ANIMATIONS)) {
    let matchedClip = null;
    for (const candidateName of semanticCandidates(def, rig, weaponStyle)) {
      matchedClip = findBankClip(clipBank.clipsByName, candidateName);
      if (matchedClip) break;
    }
    if (!matchedClip) continue;

    const action = rawActions.get(matchedClip.name) || mixer.clipAction(matchedClip);
    semanticClips.set(semKey, matchedClip);
    semanticActions.set(semKey, action);

    for (const alias of def.aliases || []) {
      // Never shadow a real 1.1 clip of the same name
      if (clipBank.clipsByName.has(alias)) continue;
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
    // reset() first: a finished clamped LoopOnce action is paused, and setting the
    // time scale while paused would pin _effectiveTimeScale at 0 (frozen replays).
    action.reset();
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1.0);

    if (playOptions.startTime !== undefined) {
      action.time = playOptions.startTime;
    } else if (timeScale < 0) {
      action.time = action.getClip().duration; // reverse playback starts at the clip end
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

  /** 1.1 clip name a semantic key / legacy / 1.1 name plays on this rig, or null. */
  function resolveClipName(keyOrClipName) {
    return resolveAction(keyOrClipName)?.clip?.name ?? null;
  }

  /** Native clip length in seconds (before timeScale), or null if unknown. */
  function getClipDuration(keyOrClipName) {
    const clip = resolveAction(keyOrClipName)?.clip;
    return clip ? clip.duration : null;
  }

  function listClips() {
    return clipBank.allClips.map((clip) => ({ name: clip.name, duration: Number(clip.duration.toFixed(3)) }));
  }

  return {
    mixer,
    rig,
    rawActions,
    semanticActions,
    semanticClips,
    play,
    poseAt,
    update,
    resolveClipName,
    getClipDuration,
    listClips,
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
  const baseSpec = resolveCharacterSpec(idOrName);
  const rigKey = rigKeyOf(baseSpec.rig);
  const loader = options.loader || new GLTFLoader();
  const [{ gltf: charGltf, spec }, rigClipBank] = await Promise.all([
    loadCharacterModel(loader, baseSpec),
    loadAnimationPacks(loader, rigKey),
  ]);
  const clipBank = adaptClipBankToRig(rigClipBank, charGltf.scene, spec.glb);
  const externalTex = spec.textureUrl ? await loadExternalTexture(spec.textureUrl) : null;

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
  normalizeCharacterScale(modelRoot, options.targetHeight ?? spec.targetHeight ?? TARGET_CHARACTER_HEIGHT);

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
    rig: rigKey,
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
    rig: rigKey,
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
    resolveClipName: anim.resolveClipName,
    getClipDuration: anim.getClipDuration,
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
    ELITE_SKELETON_IDS,
    WEAPON_SPECS,
    ANIMATION_PACKS,
    SEMANTIC_ANIMATIONS,
    LEGACY_CLIP_ALIASES,
    loadAnimationPacks: (rig = 'medium') => loadAnimationPacks(loader, rig),
    listAvailableClips,
    resolveClipNameForRig,
    createCharacter: (id, opts = {}) => createCharacter(id, { loader, ...opts }),
  };
}
