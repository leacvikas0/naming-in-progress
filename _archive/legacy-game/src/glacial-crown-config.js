// Glacial Crown — the mage's third spellbook spell.
//
// A cold front races to the aimed point, a frozen disc snaps out, and a ring of
// tall crystal blades tears up around its boundary, leaning outward over a
// skirt of wreckage. It stands, breathes cold, then breaks into plates and
// sinks back into the floor.
//
// Adapted from the MIT-licensed reference project
// (spellbook/src/config/abilities/glacier.js); see game/src/spellbook-LICENSE.txt.
// The crystal geometry and ice material are shared with Frost Lance, which is
// what keeps this second ice spell cheap.

export const GLACIAL_CROWN = {
  spellId: "glacial-crown",
  element: "frost",
  shape: "circle",

  /* --- the cast --- */
  range: 10, // maximum distance to the aimed point, metres
  minRange: 2.5, // closer than this and the cast is refused
  speed: 44, // front speed from the caster to the aimed point
  ringSpeed: 13, // how fast the freeze ring expands across the disc, m/s
  zoneRadius: 4.6, // the footprint, metres
  cooldown: 1.6,
  damageMult: 1.25,
  stun: 0.15,
  standTime: 2.0, // seconds the crown stands after the freeze completes
  sinkTime: 1.0, // seconds it takes to break and withdraw
  slots: 3,
  maxFronts: 8,

  /* --- the ring of blades --- */
  crystalCount: 126, // instances spent on one cast
  variants: 3,
  ringShare: 0.74, // fraction seated on the boundary ring
  skirtShare: 0.26, // fraction banked as wreckage against its feet
  ringSeat: 0.94, // where the ring stands, x zoneRadius
  ringScatter: 0.14, // radial jitter of the ring
  skirtSeat: 0.68, // inner lip of the skirt, x zoneRadius
  skirtBand: 0.34, // how wide that band is
  sweepTime: 0.36, // seconds the ring takes to close around the circle
  sweepStart: 0.45, // bearing (radians) where the sweep begins, relative to the caster

  /* --- silhouette --- */
  height: 3.0, // full height of a ring blade at the crown
  heightJitter: 0.6,
  crown: 0.6, // how much shorter the outer skirt is
  rubble: 0.4,
  rubbleScale: 0.3,
  radius: 0.55,
  radiusJitter: 0.9,
  taper: 0.62,
  facets: 7,
  roughness: 0.12,
  bend: 0.62,
  lean: 0.62, // radians the ring blades lean outward
  leanJitter: 1.4,
  twist: 1.0,
  riseTime: 0.34,
  riseOvershoot: 0.22,
  settle: 0.5,
  birthFade: 0.45,

  /* --- the frozen disc --- */
  colorFrost: "#f0f9ff",
  colorFrostEdge: "#79b6dd",
  frostAlpha: 0.78,
  frostPatches: 26,
  frostSpread: 1.0,
  domeSize: 5.4, // metres, the frosted dome over the disc
  domeLife: 0.7,
  domeAlpha: 0.5,
  colorDome: "#d8f4ff",

  /* --- chips, mist and glitter --- */
  chipCount: 2,
  chipSize: 0.065,
  chipSpeed: 6.5,
  chipLife: 1.15,
  chipGravity: -14,
  colorShard: "#d8f4ff",
  mistCount: 24,
  mistSize: 2.6,
  mistAlpha: 0.2,
  mistLife: 2.4,
  mistRise: 0.9,
  mistDrift: 0.5,
  colorMist: "#e8f8ff",
  sparkleCount: 34,
  sparkleSize: 0.06,
  sparkleSpeed: 2.6,
  sparkleLife: 1.7,
  colorSparkle: "#eafcff",

  /* --- feedback --- */
  impactShake: 0.45,
  impactRing: 4.6,
  sfx: "cast",
};
