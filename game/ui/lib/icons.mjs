// 16x16 pixel art, two kinds:
//
// 1. SIGILS (class icons) — authored as pure-white alpha masks. CSS paints
//    them with `mask-image` + `background-color`, so each hero gets its own
//    accent colour while the pixels stay perfectly crisp. This is the only
//    way to tint pixel art without resampling it.
//
// 2. ICONS (stat glyphs) — full colour, because their colours carry meaning
//    (red heart = HP, gold coin = currency, cyan rune = rare tier).
//
// Authoring rule: solid 2px silhouette, a filled mid body, one bright
// highlight. Three values that survive on dark stone AND on light stone.

import { fromAscii } from "./pixel.mjs";
import { P } from "./palette.mjs";

/* ---------------- sigils: white masks ---------------- */

const MASK_LEGEND = {
  "#": "#ffffff",
};

// Knight — a great helm. Solid mass, dark visor slit, lit crown.
const KNIGHT_MASK = [
  "................",
  "....########....",
  "..############..",
  "..############..",
  "..############..",
  "..####....####..",
  "..##........##..",
  "..##........##..",
  "..##........##..",
  "..############..",
  "..############..",
  "...##########...",
  "....########....",
  "................",
  "................",
  "................",
];

// Barbarian — a single broad axe head on a haft, angled. Readable at 16px.
const BARBARIAN_MASK = [
  "................",
  ".......###......",
  "......#####.....",
  ".....#######....",
  "....########....",
  "...#########....",
  "...########.....",
  "....######......",
  ".....####.......",
  "......##........",
  "......##........",
  "......##........",
  "......##........",
  ".....####.......",
  "................",
  "................",
];

// Rogue — a hooded cowl with a dagger glint.
const ROGUE_MASK = [
  "................",
  "......####......",
  "....########....",
  "...##########...",
  "..############..",
  "..###......###..",
  "..##........##..",
  "..##........##..",
  "..############..",
  "...##########...",
  "...####..####...",
  "..###......###..",
  ".###........###.",
  ".##..........##.",
  "................",
  "................",
];

// Mage — a pointed hat with a brim.
const MAGE_MASK = [
  ".......##.......",
  ".......##.......",
  "......####......",
  "......####......",
  ".....######.....",
  "....########....",
  "...##########...",
  "..############..",
  "################",
  "....########....",
  "....########....",
  "....########....",
  ".....######.....",
  "................",
  "................",
  "................",
];

// Barbarian v2 — crossed axes, drawn so the X reads clearly.
const BARBARIAN_X = [
  "................",
  ".##..........##.",
  "####........####",
  "######....######",
  "..######..######",
  "...###########..",
  "....#########...",
  ".....#######....",
  ".....#######....",
  "....#########...",
  "..#######..####.",
  ".#####......####",
  "####..........##",
  "##..............",
  "................",
  "................",
];

export const SIGILS = {
  knight: KNIGHT_MASK,
  barbarian: BARBARIAN_X,
  rogue: ROGUE_MASK,
  mage: MAGE_MASK,
};

export function buildSigil(rows) {
  return fromAscii(rows, MASK_LEGEND);
}

/* ---------------- icons: full colour ---------------- */

const LEGEND = {
  k: P.iron0,
  K: P.iron1,
  m: P.stoneLo,
  M: P.stoneMid,
  h: P.stoneHi,
  b: P.bone,
  B: P.boneDim,
  d: P.boneDeep,
  g: P.gold,
  G: P.goldHi,
  o: P.goldDk,
  O: P.goldDeep,
  r: P.blood,
  R: P.bloodBright,
  a: P.arcane,
  A: P.arcaneMid,
  l: P.life,
  L: P.lifeMid,
};

// Heart — HP.
const HEART = [
  "................",
  "................",
  "...kkkk..kkkk...",
  "..kbbRk..kRRrk..",
  ".kbRRRRkkRRRRrk.",
  ".kRRRRRRRRRRRrk.",
  ".kRRRRRRRRRRrrk.",
  "..kRRRRRRRRrrk..",
  "...kRRRRRRrrk...",
  "....kRRRRrrk....",
  ".....kRRrrk.....",
  "......krrk......",
  ".......kk.......",
  "................",
  "................",
  "................",
];

// Sword — DMG.
const SWORD = [
  "..........kkk...",
  ".........kbhbk..",
  "........kbhhbk..",
  ".......kbhhbk...",
  "......kbhhbk....",
  ".....kbhhbk.....",
  "....kbhhbk......",
  "...kbhhbk.......",
  "..kbhhbk........",
  ".kkhhbkk........",
  "kGGGkkkk........",
  "kGkkkk..........",
  ".kkk............",
  "..k.............",
  "................",
  "................",
];

// Boot with speed lines — SPD.
const BOOT = [
  "................",
  "......kkkk......",
  ".....khMMhk.....",
  ".....khMMhk.....",
  ".....khMMhk.....",
  ".....khMMhk.....",
  "....kkhMMkk.....",
  "...khMMMMMMk....",
  "...kMMMMMMMMk...",
  "...kkkkkkkkkk...",
  "..kk...kk..kk...",
  ".kGk...kGk..kGk.",
  ".kk....kk...kk..",
  "................",
  "................",
  "................",
];

// Coin — struck gold disc with a stamped skull boss.
//
// The first pass used a near-black interior, which merged with the dark stone
// slab and read as a featureless box at 16px. The body is now solid gold with
// only a small dark boss, so the silhouette reads as currency on any panel.
const COIN = [
  "................",
  "................",
  "....kkkkkkk.....",
  "...kGGGGGGGk....",
  "..kGGgggggGGk...",
  "..kGggggggggk...",
  "..kGggkkkggggk..",
  "..kGgkGkGkgggk..",
  "..kGggkkkggggk..",
  "..kGgkGkGkgggk..",
  "..kGgggggggggk..",
  "..kGggggggggGk..",
  "...kGGooooGGk...",
  "....kkkkkkk.....",
  "................",
  "................",
];

// Skull — kills / death.
const SKULL = [
  "................",
  "....kkkkkkkk....",
  "...kbbbbbbbbk...",
  "..kbhbbbbbbBbk..",
  "..kbhkkkkkkBBk..",
  "..kbkkkkkkkBBk..",
  "..kbkkkkkkkBBk..",
  "..kbkkkkkkkBBk..",
  "..kbhbbbbbbBBk..",
  "...kbhbbbbBBk...",
  "....kbkbkbBk....",
  "....kkkkkkkk....",
  "................",
  "................",
  "................",
  "................",
];

// Rune — rare tier gem.
const RUNE = [
  "................",
  ".......kk.......",
  "......kaak......",
  ".....kaAAak.....",
  "....kaAAAAak....",
  "...kaAAaaAAak...",
  "..kaAAa..aAAak..",
  "..kaAa....aAak..",
  "..kaAa....aAak..",
  "..kaAAa..aAAak..",
  "...kaAAaaAAak...",
  "....kaAAAAak....",
  ".....kaAAak.....",
  "......kaak......",
  ".......kk.......",
  "................",
];

// Flask — potion / upgrade.
const FLASK = [
  "................",
  "......kkkk......",
  "......kbbk......",
  "......kbbk......",
  "......kkkk......",
  ".....kkaakk.....",
  "....kkaaaakk....",
  "...kkaaaaaakk...",
  "...kaAAAAAAak...",
  "...kaAAAAAAak...",
  "...kAaAAAAaAk...",
  "....kAAAAAAk....",
  ".....kkkkkk.....",
  "................",
  "................",
  "................",
];

// Shield — defence.
const SHIELD = [
  "................",
  "...kkkkkkkkkk...",
  "..khMMMMMMMMhk..",
  "..kMhMMMMMMhMk..",
  "..kMMhMMMMhMMk..",
  "..kMMMhhhhMMMk..",
  "..kMMhMMMMhMMk..",
  "..kMhMMMMMMhMk..",
  "...kMMMMMMMMk...",
  "....kMMMMMMk....",
  ".....kMMMMk.....",
  "......kMMk......",
  ".......kk.......",
  "................",
  "................",
  "................",
];

// Clock — cooldown / time.
const CLOCK = [
  "................",
  "....kkkkkkkk....",
  "...khMMMMMMhk...",
  "..khMMMMMMMMhk..",
  "..kMMMkkMMMMMk..",
  "..kMMMkkMMMMMk..",
  "..kMMMkkkMMMMk..",
  "..kMMMkkMMMMMk..",
  "..kMMMMMMMMMMk..",
  "..khMMMMMMMMhk..",
  "...khMMMMMMhk...",
  "....kkkkkkkk....",
  "................",
  "................",
  "................",
  "................",
];

// Star — score.
const STAR = [
  "................",
  ".......kk.......",
  "......kGGk......",
  "......kGgk......",
  ".....kGGggk.....",
  "kkkkkGGGGggkkkkk",
  ".kGGGGGGgggggggk",
  "..kGGGGGggggggk.",
  "...kGGGGgggggk..",
  "...kGGgkkkgggk..",
  "..kGGgk...kggk..",
  ".kGGk.....kkkk..",
  ".kkk............",
  "................",
  "................",
  "................",
];

export const ICONS = {
  hp: HEART,
  dmg: SWORD,
  spd: BOOT,
  coin: COIN,
  skull: SKULL,
  rune: RUNE,
  flask: FLASK,
  shield: SHIELD,
  clock: CLOCK,
  star: STAR,
};

export function buildIcon(rows) {
  return fromAscii(rows, LEGEND);
}

export function iconNames() {
  return Object.keys(ICONS);
}

export function sigilNames() {
  return Object.keys(SIGILS);
}
