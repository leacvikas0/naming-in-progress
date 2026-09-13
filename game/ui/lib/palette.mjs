// The one palette. Every pixel part pulls from here, so the chrome can never
// drift off-language. Values are tuned against the in-game render (warm
// torchlight, ACES tone mapping) — they are the HUD stone/iron/gold family,
// re-cut for pixel work.

export const P = {
  // iron — the outline everything is cut into
  iron0: "#0d0a07",
  iron1: "#1c1610",
  iron2: "#2b2318",
  iron3: "#3d3323",

  // stone — the slab
  stoneHi: "#b3a894", // lit edge, top
  stoneLit: "#8f8574", // lit edge, sides
  stoneMid: "#6b6355",
  stoneLo: "#4d473d",
  stoneDk: "#332e27",
  stoneDeep: "#221e19",
  groove: "#120f0b",

  // bone — lettering and highlights
  bone: "#e9dfc8",
  boneDim: "#a89a7e",
  boneDeep: "#6f6552",

  // gold — the reward metal and the UI accent
  goldHi: "#f7e2a6",
  gold: "#e8c169",
  goldMid: "#c9a24e",
  goldDk: "#8a6a28",
  goldDeep: "#5a4318",

  // blood — damage, danger, epic
  blood: "#8c2f26",
  bloodBright: "#d4574a",
  bloodDeep: "#4a1713",

  // arcane — rare tier
  arcane: "#7fd7ff",
  arcaneMid: "#3f8fb8",
  arcaneDeep: "#1b3f52",

  // life — hp bar
  life: "#93b36a",
  lifeMid: "#7d9c58",
  lifeDeep: "#4c6134",
};

export const TIERS = {
  // The tier ramp is a treasure progression: worn gold → arcane → bright gold.
  common: { hi: P.goldHi, mid: P.gold, dk: P.goldDk, deep: P.goldDeep, shadow: "#4c3a18" },
  rare: { hi: "#d8f2ff", mid: P.arcane, dk: P.arcaneMid, deep: P.arcaneDeep, shadow: "#10262f" },
  epic: { hi: "#ffeec0", mid: "#f0a03c", dk: "#a85c14", deep: "#5c3008", shadow: "#2c1604" },
};
