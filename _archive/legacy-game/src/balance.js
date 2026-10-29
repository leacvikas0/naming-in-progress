export const PALETTE = {
  fog: 0x0a0708,
  torch: 0xffa040,
  torchCore: 0xffd9a0,
  gold: 0xffd166,
  hpRed: 0xd94f4f,
  arcane: 0x7fd7ff,
  bone: 0xe8e0d0,
  steel: 0xb8c4d0,
  blood: 0x8a2b2b,
  ember: 0xff7a2a,
};

// Sunpetal Vale outdoor palette. Kept separate from PALETTE so the dungeon-era
// constants (fog, ember, torch) that effects and the title stage still read are
// never globally retinted. world.js applies these to the scene when the outdoor
// world is shown, and main.js restores the title presentation.
export const VALE_PALETTE = {
  skyTop: 0x9edbee,
  skyHorizon: 0xe5efe0,
  fog: 0xcfe3dc,
  grass: 0x8dbd68,
  grassWarm: 0xa6c877,
  grassCool: 0x7fae70,
  canopyShadow: 0x44785d,
  canopySunlit: 0xb9d77c,
  path: 0xddcba1,
  pathEdge: 0xc9b9a0,
  stone: 0xc9c9b4,
  stoneCream: 0xe6dcbe,
  water: 0x65c9ca,
  waterDeep: 0x3fa9ad,
  flowerPink: 0xf3c8da,
  flowerCream: 0xfff0b3,
  flowerLilac: 0xc6b9eb,
  sun: 0xfff1d6,
  hillFar: 0x9fb8b0,
  hillNear: 0x7fa88e,
  pollen: 0xfff0b8,
  cloud: 0xfbfdf7,
};

const DUNGEON = "/library/kaykit-dungeon/KayKit-Dungeon-Remastered-1.0-main/addons/kaykit_dungeon_remastered/Assets/gltf/";
const ADVENTURERS = "/library/kaykit-adventurers/KayKit-Character-Pack-Adventures-1.0-main/addons/kaykit_character_pack_adventures/Characters/gltf/";
const SKELETONS = "/library/kaykit-skeletons/KayKit-Character-Pack-Skeletons-1.0-main/addons/kaykit_character_pack_skeletons/Characters/gltf/";
const FOREST = "/library/kaykit-forest-free/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf/";
const NATURE_SOFT = "/library/quaternius-stylized-nature-standard/glTF/";
const TOWN = "/library/kenney-fantasy-town/Models/GLB format/";
const SURVIVAL = "/library/kenney-survival/Models/GLB format/";

export const ASSETS = {
  dungeon: {
    floorTile: `${DUNGEON}floor_tile_large.gltf.glb`,
    floorTileRocks: `${DUNGEON}floor_tile_large_rocks.gltf.glb`,
    floorDirt: `${DUNGEON}floor_dirt_large.gltf.glb`,
    floorDirtRocky: `${DUNGEON}floor_dirt_large_rocky.gltf.glb`,
    floorSpikes: `${DUNGEON}floor_tile_big_spikes.glb`,
    wall: `${DUNGEON}wall.gltf.glb`,
    wallCorner: `${DUNGEON}wall_corner.gltf.glb`,
    wallDoorway: `${DUNGEON}wall_doorway.glb`,
    wallPillar: `${DUNGEON}wall_pillar.gltf.glb`,
    wallBroken: `${DUNGEON}wall_broken.gltf.glb`,
    pillar: `${DUNGEON}pillar.gltf.glb`,
    column: `${DUNGEON}column.gltf.glb`,
    torch: `${DUNGEON}torch_mounted.gltf.glb`,
    torchFloor: `${DUNGEON}torch_lit.gltf.glb`,
    chest: `${DUNGEON}chest_gold.glb`,
    coin: `${DUNGEON}coin.gltf.glb`,
    banner: `${DUNGEON}banner_red.gltf.glb`,
    barrel: `${DUNGEON}barrel_large.gltf.glb`,
    crates: `${DUNGEON}crates_stacked.gltf.glb`,
    rubble: `${DUNGEON}rubble_large.gltf.glb`,
    barrier: `${DUNGEON}barrier.gltf.glb`,
    shelf: `${DUNGEON}shelf_small_candles.gltf.glb`,
    stairs: `${DUNGEON}stairs.gltf.glb`,
  },
  // Sunpetal Vale palette: 22 models across 4 CC0 packs. Every entry is under the
  // 2k prop triangle budget (KayKit Forest max 1,560; Quaternius accents 136-1,690).
  // Structures are authored on Kenney's 1 m grid and are scaled at placement.
  valley: {
    // Trees, two height bands. Tree_4_C is the 10.8 m landmark tree.
    treeBroad1: `${FOREST}Tree_2_A_Color1.gltf`,
    treeBroad2: `${FOREST}Tree_2_C_Color1.gltf`,
    treeRound1: `${FOREST}Tree_4_A_Color1.gltf`,
    treeRound2: `${FOREST}Tree_4_C_Color1.gltf`,
    treeSmall1: `${FOREST}Tree_1_A_Color1.gltf`,
    treeSmall2: `${FOREST}Tree_3_A_Color1.gltf`,
    bush1: `${FOREST}Bush_1_C_Color1.gltf`,
    bush2: `${FOREST}Bush_2_C_Color1.gltf`,
    bush3: `${FOREST}Bush_4_B_Color1.gltf`,
    grass1: `${FOREST}Grass_1_B_Color1.gltf`,
    grass2: `${FOREST}Grass_2_A_Color1.gltf`,
    rock1: `${FOREST}Rock_1_C_Color1.gltf`,
    rock2: `${FOREST}Rock_2_C_Color1.gltf`,
    rock3: `${FOREST}Rock_3_C_Color1.gltf`,
    // Soft ground accents and flowers.
    flowerPink: `${NATURE_SOFT}Flower_3_Group.gltf`,
    flowerCream: `${NATURE_SOFT}Flower_4_Group.gltf`,
    fern: `${NATURE_SOFT}Fern_1.gltf`,
    clover: `${NATURE_SOFT}Clover_1.gltf`,
    flowerBush: `${NATURE_SOFT}Bush_Common_Flowers.gltf`,
    pebble: `${NATURE_SOFT}Pebble_Round_1.gltf`,
    // Wishing Arch shrine: cream Kenney modular stone, 1 m grid.
    archHalf: `${TOWN}wall-arch-top.glb`,
    stonePillar: `${TOWN}pillar-stone.glb`,
    stoneBlock: `${TOWN}wall-block.glb`,
    stoneBlockHalf: `${TOWN}wall-block-half.glb`,
    stoneBroken: `${TOWN}wall-broken.glb`,
    stoneHalf: `${TOWN}wall-half.glb`,
    // Traveller's rest camp.
    tent: `${SURVIVAL}tent.glb`,
    bedroll: `${SURVIVAL}bedroll.glb`,
    crate: `${SURVIVAL}box-large.glb`,
    campfire: `${SURVIVAL}campfire-pit.glb`,
    barrel: `${SURVIVAL}barrel.glb`,
    signpost: `${SURVIVAL}signpost.glb`,
    coin: `${DUNGEON}coin.gltf.glb`,
  },
  characters: {
    knight: `${ADVENTURERS}Knight.glb`,
    barbarian: `${ADVENTURERS}Barbarian.glb`,
    mage: `${ADVENTURERS}Mage.glb`,
    rogue: `${ADVENTURERS}Rogue.glb`,
  },
  enemies: {
    minion: `${SKELETONS}Skeleton_Minion.glb`,
    warrior: `${SKELETONS}Skeleton_Warrior.glb`,
    rogue: `${SKELETONS}Skeleton_Rogue.glb`,
    mage: `${SKELETONS}Skeleton_Mage.glb`,
  },
};

export const ELEMENTS = {
  frost: { id: "frost", name: "Frost", color: 0x7fd7ff },
  ember: { id: "ember", name: "Ember", color: 0xff7a2a },
  shadow: { id: "shadow", name: "Shadow", color: 0x9b6fe8 },
  arcane: { id: "arcane", name: "Arcane", color: 0x7fe8c8 },
};

export const REACTIONS = {
  melt: {
    id: "melt",
    name: "Melt",
    elements: ["frost", "ember"],
    color: 0xffb066,
    damageMult: 2.2,
    radius: 2.2,
    armorBreak: { mult: 1.3, time: 4 },
  },
  overload: {
    id: "overload",
    name: "Overload",
    elements: ["ember", "shadow"],
    color: 0xd85cff,
    damageMult: 1.5,
    radius: 3.5,
    knockback: 14,
  },
  shatter: {
    id: "shatter",
    name: "Shatter",
    elements: ["frost", "shadow"],
    color: 0xa8e8ff,
    damageMult: 1.2,
    radius: 2.0,
    freeze: 1.5,
    shatterMult: 2.5,
  },
  detonate: {
    id: "detonate",
    name: "Detonate",
    elements: ["ember", "arcane"],
    color: 0xff5a1f,
    damageMult: 1.4,
    radius: 3.0,
    burn: { dps: 6, time: 4, spread: 3.5 },
  },
  frozen: {
    id: "frozen",
    name: "Frozen",
    elements: ["frost", "arcane"],
    color: 0x9fe8ff,
    damageMult: 1.0,
    radius: 2.5,
    freeze: 2.0,
  },
  void: {
    id: "void",
    name: "Void",
    elements: ["shadow", "arcane"],
    color: 0x8a5cff,
    damageMult: 1.1,
    radius: 3.0,
    pull: 9,
    mark: { time: 6, crit: 0.25 },
  },
};

export function reactionFor(elementA, elementB) {
  if (!ELEMENTS[elementA] || !ELEMENTS[elementB]) return null;
  if (elementA === elementB) return null;
  return (
    Object.values(REACTIONS).find(
      (r) => r.elements.includes(elementA) && r.elements.includes(elementB)
    ) || null
  );
}

export function auraOutcome(current, element) {
  if (!ELEMENTS[element]) return { apply: null, reaction: null };
  if (!current || !ELEMENTS[current.element]) return { apply: element, reaction: null };
  if (current.element === element) return { apply: element, reaction: null };
  const reaction = reactionFor(current.element, element);
  return { apply: element, reaction: reaction ? reaction.id : null };
}

export const CHARACTERS = {
  knight: {
    id: "knight",
    name: "Knight",
    blurb: "Shield up, steady blade. The all-rounder.",
    style: "melee",
    glb: ASSETS.characters.knight,
    hp: 110,
    damage: 15,
    attackSpeed: 1.0,
    moveSpeed: 6.2,
    range: 2.7,
    arc: 2.5,
    combo: [
      "1H_Melee_Attack_Slice_Diagonal",
      "1H_Melee_Attack_Slice_Horizontal",
      "1H_Melee_Attack_Stab",
    ],
    swing: [0.32, 0.3, 0.36],
    color: 0x9fb4c8,
    element: "frost",
    heavy: { clip: "Block_Attack", damageMult: 1.6, knockback: 14, stun: 0.6, lunge: 0, radius: 2.7, arc: 2.4 },
    super: { id: "nova", name: "Bulwark", desc: "A 360 shockwave that hurls the dead back.", clip: "2H_Melee_Attack_Spin", duration: 0.5, damageMult: 3.0, radius: 3.5, knockback: 22, stun: 1.0 },
    keep: ["1H_Sword", "Knight_Helmet", "Knight_Cape"],
    pose: "1H_Melee_Attack_Stab",
  },
  barbarian: {
    id: "barbarian",
    name: "Barbarian",
    blurb: "Big axe, bigger swing. Slow but it lands like a mountain.",
    style: "melee",
    glb: ASSETS.characters.barbarian,
    hp: 135,
    damage: 24,
    attackSpeed: 0.74,
    moveSpeed: 5.7,
    range: 3.0,
    arc: 2.9,
    combo: ["2H_Melee_Attack_Chop", "2H_Melee_Attack_Slice", "2H_Melee_Attack_Spin"],
    swing: [0.5, 0.46, 0.55],
    color: 0xc98a5a,
    element: "ember",
    heavy: { clip: "2H_Melee_Attack_Chop", damageMult: 2.4, knockback: 20, stun: 0.6, lunge: 0.6, radius: 3.0, arc: 2.6 },
    super: { id: "whirlwind", name: "Whirlwind", desc: "Three seconds of spinning steel.", clip: "2H_Melee_Attack_Spinning", duration: 3.0, damageMult: 0.9, radius: 3.0, knockback: 9, stun: 0.3 },
    keep: ["2H_Axe", "Barbarian_Hat"],
    pose: "2H_Melee_Attack_Spin",
  },
  rogue: {
    id: "rogue",
    name: "Rogue",
    blurb: "Two knives, no patience. Fastest hands in the vale.",
    style: "melee",
    glb: ASSETS.characters.rogue,
    hp: 90,
    damage: 11,
    attackSpeed: 1.5,
    moveSpeed: 7.0,
    range: 2.4,
    arc: 2.3,
    combo: [
      "Dualwield_Melee_Attack_Chop",
      "Dualwield_Melee_Attack_Slice",
      "Dualwield_Melee_Attack_Stab",
    ],
    swing: [0.22, 0.2, 0.24],
    color: 0x6fbf8f,
    element: "shadow",
    heavy: { clip: "Dualwield_Melee_Attack_Stab", damageMult: 1.8, knockback: 10, stun: 0.6, lunge: 2.2, radius: 2.4, arc: 2.2 },
    super: { id: "flurry", name: "Shadow Flurry", desc: "Blink through five foes, four cuts each.", clip: "Dualwield_Melee_Attack_Slice", duration: 0.12, damageMult: 1.4, radius: 2.4, knockback: 6, stun: 0.2 },
    keep: ["Knife", "Knife_Offhand"],
    pose: "Dualwield_Melee_Attack_Slice",
  },
  mage: {
    id: "mage",
    name: "Mage",
    blurb: "No sword. A bolt of raw arcane that bursts where you point.",
    style: "blast",
    glb: ASSETS.characters.mage,
    hp: 85,
    damage: 18,
    attackSpeed: 0.92,
    moveSpeed: 6.0,
    range: 8.0,
    blastRadius: 2.4,
    combo: ["Spellcast_Shoot", "Spellcast_Raise"],
    swing: [0.42, 0.4],
    color: 0x8f7fe8,
    element: "arcane",
    heavy: { clip: "Spellcast_Long", damageMult: 2.0, knockback: 9, stun: 0.6, lunge: 0, radius: 3.2, arc: 1.4 },
    super: { id: "meteor", name: "Meteor", desc: "Call a star down on the marked ground.", clip: "Spellcast_Long", duration: 0.8, damageMult: 4.0, radius: 5.0, knockback: 20, stun: 0.8 },
    keep: ["2H_Staff", "Mage_Hat"],
    pose: "Spellcast_Raise",
  },
};

export const ENEMY_TYPES = {
  minion: {
    id: "minion",
    name: "Skeleton Minion",
    glb: ASSETS.enemies.minion,
    hp: 26,
    speed: 3.5,
    damage: 6,
    attackRange: 1.9,
    attackCooldown: 1.1,
    windup: 0.32,
    windupClip: "1H_Melee_Attack_Chop",
    value: 1,
    color: 0xe8e0d0,
    keep: [],
  },
  warrior: {
    id: "warrior",
    name: "Skeleton Warrior",
    glb: ASSETS.enemies.warrior,
    hp: 62,
    speed: 2.7,
    damage: 13,
    attackRange: 2.3,
    attackCooldown: 1.7,
    windup: 0.5,
    windupClip: "2H_Melee_Attack_Slice",
    value: 3,
    color: 0xc9b8a0,
    keep: ["Skeleton_Warrior_Helmet"],
  },
  rogue: {
    id: "rogue",
    name: "Skeleton Rogue",
    glb: ASSETS.enemies.rogue,
    hp: 30,
    speed: 4.3,
    damage: 8,
    attackRange: 1.8,
    attackCooldown: 1.0,
    windup: 0.26,
    windupClip: "Dualwield_Melee_Attack_Stab",
    dash: true,
    dashRange: 7.5,
    dashSpeed: 14,
    value: 2,
    color: 0xa8d8c0,
    keep: [],
  },
  mage: {
    id: "mage",
    name: "Skeleton Mage",
    glb: ASSETS.enemies.mage,
    hp: 38,
    speed: 2.2,
    damage: 9,
    attackRange: 11,
    keepDistance: 7.5,
    attackCooldown: 2.8,
    windup: 0.6,
    windupClip: "Spellcast_Shoot",
    boltSpeed: 9,
    boltRadius: 0.5,
    value: 3,
    color: 0x9fb8e8,
    keep: ["Skeleton_Mage_Hat"],
  },
};

const WAVE_MODIFIERS = {
  swarm: {
    id: "swarm",
    name: "Swarm",
    desc: "One and a half times the dead, but frailer",
    countMult: 1.5,
    hpMult: 0.8,
  },
  elites: {
    id: "elites",
    name: "Elite Vanguard",
    desc: "Elites lead the wave; bonus coins on clear",
  },
  arcane: {
    id: "arcane",
    name: "Arcane Tide",
    desc: "Mage-heavy; the air crackles",
    weightAdd: { mage: 6 },
  },
  horde: {
    id: "horde",
    name: "Horde",
    desc: "A fast tide of bone, mostly minions",
    weightAdd: { minion: 14 },
    speedMult: 1.15,
  },
};

function waveModifier(n) {
  if (n % 4 === 0) return WAVE_MODIFIERS.elites;
  if (n % 5 === 2) return WAVE_MODIFIERS.swarm;
  if (n % 5 === 3) return WAVE_MODIFIERS.arcane;
  if (n % 5 === 4) return WAVE_MODIFIERS.horde;
  return null;
}

export function computeWave(n) {
  const modifier = waveModifier(n);
  let count = Math.min(4 + Math.floor(n * 1.6), 22);
  if (modifier && modifier.countMult) {
    count = Math.min(Math.round(count * modifier.countMult), 22);
  }
  let hpMult = 1 + (n - 1) * 0.12;
  if (modifier && modifier.hpMult) hpMult *= modifier.hpMult;
  const dmgMult = 1 + (n - 1) * 0.06;
  let speedMult = Math.min(1 + (n - 1) * 0.015, 1.35);
  if (modifier && modifier.speedMult) speedMult = Math.min(speedMult * modifier.speedMult, 1.35);
  const eliteCount = n % 4 === 0 ? Math.min(1 + Math.floor(n / 8), 3) : 0;

  const weights = { minion: 10 };
  if (n >= 2) weights.warrior = 4 + n * 0.4;
  if (n >= 3) weights.rogue = 3 + n * 0.5;
  if (n >= 4) weights.mage = 2 + n * 0.35;
  if (modifier && modifier.weightAdd) {
    for (const [type, w] of Object.entries(modifier.weightAdd)) {
      weights[type] = (weights[type] || 0) + w;
    }
  }

  const footCount = Math.max(count - eliteCount, 0);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const mix = [];
  const remainders = [];
  let assigned = 0;
  for (const [type, w] of Object.entries(weights)) {
    const exact = (footCount * w) / totalWeight;
    const base = Math.floor(exact);
    assigned += base;
    mix.push({ type, count: base });
    remainders.push({ type, rem: exact - base });
  }
  remainders.sort((a, b) => b.rem - a.rem);
  let leftover = footCount - assigned;
  for (const r of remainders) {
    if (leftover <= 0) break;
    const entry = mix.find((m) => m.type === r.type);
    entry.count += 1;
    leftover -= 1;
  }

  return { n, count, hpMult, dmgMult, speedMult, mix, eliteCount, modifier };
}

export const MOMENTUM_GAIN = { light: 6, heavy: 12, kill: 10, perfect: 25, reaction: 20 };

export function momentumAfter(current, gain, max) {
  return clamp(current + gain, 0, max);
}

export const UPGRADES = [
  { id: "whetstone", name: "Whetstone", desc: "+20% attack damage", tier: "common", apply: (p) => { p.stats.damageMult *= 1.2; } },
  { id: "boots", name: "Swift Boots", desc: "+12% move speed", tier: "common", apply: (p) => { p.stats.moveSpeedMult *= 1.12; } },
  { id: "ironheart", name: "Iron Heart", desc: "+30 max health, heal 30", tier: "common", apply: (p) => { p.addMaxHp(30); p.heal(30); } },
  { id: "keen", name: "Keen Edge", desc: "+10% critical chance", tier: "common", apply: (p) => { p.stats.critChance += 0.1; } },
  { id: "reach", name: "Long Reach", desc: "+0.6 attack range", tier: "common", apply: (p) => { p.stats.range += 0.6; } },
  { id: "wide", name: "Wide Arc", desc: "+0.5 swing arc", tier: "common", apply: (p) => { p.stats.arc += 0.5; } },
  { id: "greed", name: "Lucky Coin", desc: "+30% coins", tier: "common", apply: (p) => { p.stats.coinMult *= 1.3; } },
  { id: "frenzy", name: "Frenzy", desc: "+18% attack speed", tier: "rare", apply: (p) => { p.stats.attackSpeedMult *= 1.18; } },
  { id: "vampire", name: "Vampiric Edge", desc: "Heal 10% of damage dealt", tier: "rare", apply: (p) => { p.stats.lifesteal += 0.1; } },
  { id: "shadowstep", name: "Shadow Step", desc: "-30% dodge cooldown", tier: "rare", apply: (p) => { p.stats.dodgeCooldownMult *= 0.7; } },
  { id: "thorns", name: "Spiked Mail", desc: "Reflect 12 damage to attackers", tier: "rare", apply: (p) => { p.stats.thorns += 12; } },
  { id: "titan", name: "Titan's Grip", desc: "+40% damage, -12% move speed", tier: "epic", apply: (p) => { p.stats.damageMult *= 1.4; p.stats.moveSpeedMult *= 0.88; } },
  { id: "glass", name: "Glass Cannon", desc: "+60% damage, -35 max health", tier: "epic", apply: (p) => { p.addMaxHp(-35); p.stats.damageMult *= 1.6; } },
  { id: "reaper", name: "Reaper's Cadence", desc: "+30% attack speed, +8% crit", tier: "epic", apply: (p) => { p.stats.attackSpeedMult *= 1.3; p.stats.critChance += 0.08; } },
  { id: "focus", name: "Elemental Focus", desc: "Reactions deal +40% damage", tier: "rare", apply: (p) => { p.stats.reactionMult *= 1.4; } },
  { id: "aura", name: "Lingering Aura", desc: "Aura duration +50%", tier: "common", apply: (p) => { p.stats.auraMult *= 1.5; } },
  { id: "reactionary", name: "Reactionary", desc: "Reactions heal 6", tier: "rare", apply: (p) => { p.stats.reactionHeal += 6; } },
  { id: "core", name: "Momentum Core", desc: "+25% momentum gain", tier: "rare", apply: (p) => { p.stats.momentumMult *= 1.25; } },
  { id: "swiftswap", name: "Swift Swap", desc: "Swap cooldown -40%, +15% move speed for 2s after swap", tier: "common", apply: (p) => { p.stats.swapCooldownMult *= 0.6; p.stats.swapSpeedMult *= 1.15; p.stats.swapSpeedTime += 2; } },
  { id: "executioner", name: "Executioner", desc: "+30% damage to enemies under 30% hp", tier: "epic", apply: (p) => { p.stats.executeMult += 0.3; } },
];

const TIER_WEIGHT = { common: 60, rare: 30, epic: 10 };

export function rollUpgrades(rng, count = 3) {
  const pool = [...UPGRADES];
  const out = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((a, u) => a + TIER_WEIGHT[u.tier], 0);
    let r = rng() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= TIER_WEIGHT[pool[i].tier];
      if (r <= 0) { idx = i; break; }
      idx = i;
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export const CONFIG = {
  arena: { w: 96, d: 96, wallInset: 2 },
  camera: { dist: 7.6, height: 1.85, pitchMin: -0.18, pitchMax: 1.0, damp: 9, fov: 55 },
  // The valley is 4x the dungeon's area and viewed from a higher, wider camera:
  // enough to read the meadow, the loop path and a landmark, without losing the
  // 1.9 m hero or the enemies around him.
  cameraOutdoor: { dist: 11.5, height: 2.4, pitchMin: 0.12, pitchMax: 1.05, damp: 7, fov: 58 },
  // Sunpetal Vale environment settings. One named section rather than scattered
  // magic constants in world.js/main.js. Coordinates follow MAP-DESIGN.md:
  // north is -Z, east is +X, all walkable ground and feet at y = 0.
  vale: {
    seed: 20261017,
    // Main loop waypoints and the landmark/connection path spokes, as ground
    // treatments only (no colliders). Radius is the half-width of the soft band.
    loopPath: [
      [0, 24], [-27, 20], [-32, -9], [-18, -28], [0, -31],
      [26, -23], [30, 14], [18, 29], [0, 24],
    ],
    loopWidth: 3.4,
    spokes: [
      { from: [0, 6], to: [0, -31], width: 3.0 },     // meadow -> shrine
      { from: [0, 4], to: [-31, -4], width: 2.8 },    // meadow -> lake overlook
      { from: [8, 10], to: [29, 17], width: 2.8 },    // meadow -> camp
      { from: [0, 20], to: [-23, 22], width: 2.4 },   // meadow -> petal walk
    ],
    landmarks: {
      meadow: { x: 0, z: 0 },
      shrine: { x: 0, z: -31 },
      overlook: { x: -31, z: -4 },
      camp: { x: 29, z: 17 },
      petalWalk: { x: -23, z: 22 },
    },
    // Spawn anchors: open clearing centres checked for ground, bounds and solid
    // props. Enemies never spawn outside the playable rectangle or in scenery.
    spawnAnchors: [
      { x: 0, z: 0 }, { x: -14, z: 4 }, { x: 14, z: 2 },
      { x: -8, z: -18 }, { x: 12, z: -14 }, { x: -20, z: 12 },
      { x: 20, z: 20 }, { x: 4, z: 20 }, { x: -28, z: -2 },
      { x: 0, z: -26 }, { x: 26, z: 8 }, { x: 16, z: -26 },
    ],
    lake: { minX: -78, maxX: -50, minZ: -25, maxZ: 18, level: -0.35 },
    // Scenic backdrop may extend to roughly +/-110; nothing here is walkable.
    backdropRadius: 110,
    trees: { count: 104, near: 0.42 },
    // Combat-area ground cover: grass stays low, path centres nearly bare.
    meadowGrassMax: 0.35,
    grassClumps: 1500,
    flowerClumps: 620,
    shrubClusters: 190,
    fog: { near: 42, far: 155 },
    sun: { azimuth: 2.35, elevation: 0.72, intensity: 2.5 },
    exposure: 1.02,
  },
  player: {
    radius: 0.55,
    accel: 42,
    decel: 34,
    turnSpeed: 13,
    sprintMult: 1.45,
    jumpSpeed: 7.2,
    gravity: 19,
    dodgeSpeed: 13.5,
    dodgeTime: 0.42,
    dodgeIFrames: 0.34,
    dodgeCooldown: 1.1,
    hurtInvuln: 0.75,
    comboWindow: 0.9,
    lunge: 5.5,
    knockback: 4.5,
    momentumMax: 100,
    perfectWindow: 3,
    perfectDamageMult: 1.25,
    swapCooldown: 1.5,
    swapIFrames: 0.25,
  },
  combat: {
    hitstopHit: 0.045,
    hitstopCrit: 0.095,
    hitstopKill: 0.11,
    hitstopHurt: 0.08,
    shakeHit: 0.1,
    shakeCrit: 0.22,
    shakeKill: 0.16,
    shakeHurt: 0.3,
    enemyKnockback: 8,
    enemyKnockbackHeavy: 15,
    maxAlive: 18,
    spawnBatch: 4,
    spawnInterval: 1.15,
    spawnTelegraph: 0.7,
    intermission: 4.0,
    upgradeEvery: 3,
    coinMagnet: 9,
    coinLifetime: 14,
    maxAttackers: 3,
    standoff: 3.6,
    spikeDamage: 12,
    spikeTick: 0.9,
    auraTime: 5,
    // Between-wave recovery. Without it, damage is a one-way ratchet: every
    // wave ends lower than it began and the run dies to attrition around 6-7
    // regardless of skill. Healing the party on clear turns each wave into a
    // discrete test that can be won or lost on its own merits.
    waveClearHeal: 14,
    waveClearHealFrac: 0.12,
  },
  run: { seed: 1337 },
};

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function moveBasis(yaw) {
  const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const right = { x: -forward.z, z: forward.x };
  return { forward, right };
}

export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function pickWeighted(rng, entries) {
  const total = entries.reduce((a, e) => a + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e.value;
  }
  return entries[entries.length - 1].value;
}
