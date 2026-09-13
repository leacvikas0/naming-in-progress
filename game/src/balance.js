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

const DUNGEON = "/library/kaykit-dungeon/KayKit-Dungeon-Remastered-1.0-main/addons/kaykit_dungeon_remastered/Assets/gltf/";
const ADVENTURERS = "/library/kaykit-adventurers/KayKit-Character-Pack-Adventures-1.0-main/addons/kaykit_character_pack_adventures/Characters/gltf/";
const SKELETONS = "/library/kaykit-skeletons/KayKit-Character-Pack-Skeletons-1.0-main/addons/kaykit_character_pack_skeletons/Characters/gltf/";

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
    keep: ["2H_Axe", "Barbarian_Hat"],
    pose: "2H_Melee_Attack_Spin",
  },
  rogue: {
    id: "rogue",
    name: "Rogue",
    blurb: "Two knives, no patience. Fastest hands in the dungeon.",
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

export function computeWave(n) {
  const count = Math.min(4 + Math.floor(n * 1.6), 22);
  const hpMult = 1 + (n - 1) * 0.12;
  const dmgMult = 1 + (n - 1) * 0.06;
  const speedMult = Math.min(1 + (n - 1) * 0.015, 1.35);
  const eliteCount = n % 4 === 0 ? Math.min(1 + Math.floor(n / 8), 3) : 0;

  const weights = { minion: 10 };
  if (n >= 2) weights.warrior = 4 + n * 0.4;
  if (n >= 3) weights.rogue = 3 + n * 0.5;
  if (n >= 4) weights.mage = 2 + n * 0.35;

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

  return { n, count, hpMult, dmgMult, speedMult, mix, eliteCount };
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
  arena: { w: 48, d: 48, wallInset: 2 },
  camera: { dist: 7.6, height: 1.85, pitchMin: -0.18, pitchMax: 1.0, damp: 9, fov: 55 },
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
    enemyKnockback: 3.2,
    enemyKnockbackHeavy: 6,
    maxAlive: 18,
    spawnBatch: 4,
    spawnInterval: 1.15,
    spawnTelegraph: 0.7,
    intermission: 4.0,
    upgradeEvery: 3,
    coinMagnet: 9,
    coinLifetime: 14,
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
