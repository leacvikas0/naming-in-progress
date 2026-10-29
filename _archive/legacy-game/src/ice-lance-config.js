// Frost Lance — the mage's first spellbook spell.
//
// Spell-only constants, the active spell list and the small shared settings used
// by both gameplay (player/enemies) and the visual module. This file exists
// because balance.js is owned by the concurrent map task; when both tasks land
// Codex may fold these numbers into balance.js.
//
// Shape and tuning are adapted from the MIT-licensed reference project
// (spellbook/src/config/abilities/ice.js). The game runs Three.js 0.170; the
// reference runs 0.185, so only the plain parameter values were carried over.
// See game/src/spellbook-LICENSE.txt.

export const ICE_LANCE = {
  spellId: "ice-lance",
  shape: "line",
  element: "frost",

  /* --- the cast --- */
  range: 12, // maximum reach, metres
  minLength: 2.5, // shorter than this and the cast is refused
  speed: 26, // fracture front, metres/second
  cooldown: 1.0, // seconds between accepted casts (animation cadence is ~0.46 s)
  slots: 3, // concurrent visual casts; the oldest finished slot is reused
  damageMult: 1.25, // one rolled mage light hit, scaled by this
  stun: 0.15, // extra stun on a contact hit; reactions keep their own effects
  maxFronts: 8, // bounded gameplay fronts (visual slots are fewer on purpose)

  /* --- the footprint --- */
  widthNear: 0.55, // half-width at the caster, metres
  widthFar: 1.6, // half-width at the far end, metres
  widthCurve: 0.75, // <1 flares early, >1 stays narrow then opens out
  frontBias: 0.85, // <1 crowds crystals toward the impact point
  clumping: 1.35, // >1 pulls crystals toward the centre line
  scatter: 0.55, // extra lateral jitter, fraction of the local half-width

  /* --- the silhouette --- */
  heightNear: 0.35, // crystal height at the caster, metres
  heightFar: 2.4, // crystal height at the far end, metres
  heightCurve: 1.7, // how late the ramp climbs
  heightJitter: 0.55, // per-crystal height variation
  heightPeak: 1.3, // extra swell at the impact point (2.4 -> ~3.1 m tips)
  peakWidth: 0.3, // how much of the line that swell covers, 0..1
  crown: 0.55, // how much shorter the flank blades are than the spine
  rubble: 0.32, // fraction of the crystals demoted to ankle-height shards
  rubbleScale: 0.32,
  crystalCount: 96, // instances spent on one cast (spec: 72-96)
  variants: 3, // shared crystal shapes (spec: 2-3)

  /* --- an individual crystal --- */
  // Broad, faceted blades, not needles: the reference keeps ~60-70% of the
  // base radius almost to the tip and only converges at the apex.
  radius: 0.55, // base radius, metres
  radiusJitter: 0.9,
  taper: 0.62, // tip radius as a fraction of the base
  facets: 7, // prism sides (variant 0/1/2 use 7/8/6)
  roughness: 0.12, // how far facets are pushed off a clean prism
  bend: 0.62, // sideways curve from base to tip
  lean: 0.42, // radians the crystals lean away from the caster
  leanJitter: 1.5,
  twist: 1.0, // random yaw, 0..1 of a full turn

  /* --- the eruption --- */
  riseTime: 0.17, // seconds from buried to full height
  riseOvershoot: 0.26, // how far past full height the punch carries
  riseStagger: 0.09, // seconds of random delay between neighbours
  settle: 0.55, // seconds the overshoot takes to damp out
  standTime: 1.2, // seconds the field stands after the front completes
  sinkTime: 0.5, // seconds to withdraw into the floor
  birthFade: 0.45, // seconds of internal glow on a fresh crystal

  /* --- the ice material (adapted from the reference IceMaterial) --- */
  colorDeep: "#2c6d86", // the colour thick ice accumulates toward
  colorIce: "#79d0f7", // body
  colorRim: "#f2feff", // fresnel edge
  colorCore: "#638797", // the light trapped inside a fresh crystal
  opacity: 0.92,
  depthTint: 1.35, // how fast the deep tint builds with thickness
  fresnel: 2.3,
  fresnelPower: 2.4,
  translucency: 1.5, // light bleeding through from behind
  facetSharp: 0.68, // crispness of the internal facet shading
  fracture: 0.62, // internal crack planes
  fractureScale: 6.5, // cracks per metre
  veins: 0.45, // milky feather-frost inside the crystal
  veinScale: 3.2,
  glint: 1.1, // pinpoint surface highlights
  glintScale: 34,
  glintSpeed: 0.7,
  frostLine: 0.45, // rime banding climbing the crystal
  glow: 1.0, // overall emissive gain
  edgeGlow: 1.25, // brightness of the silhouette rim
  birthGlow: 1.8, // extra glow on a crystal that has just erupted

  /* --- frost footprint on the ground --- */
  colorFrost: "#f0f9ff", // the lit face of the snow
  colorFrostEdge: "#79b6dd", // what it goes in its own shadow
  frostAlpha: 0.72,
  frostSpread: 1.5, // patch radius, x the local half-width
  frostPatches: 18, // patches laid along one cast

  /* --- chips, mist and glints --- */
  chipCount: 2, // chips spat where one crystal breaks the surface
  chipSize: 0.065,
  chipSpeed: 6.5,
  chipLife: 1.15,
  chipGravity: -14,
  colorShard: "#d8f4ff",
  mistCount: 26, // ground-fog puffs over the whole cast
  mistSize: 2.8,
  mistAlpha: 0.22,
  mistLife: 2.2,
  mistRise: 0.9,
  mistDrift: 0.5,
  colorMist: "#e8f8ff",
  sparkleCount: 44, // sparse glitter plume over the whole cast
  sparkleSize: 0.06,
  sparkleSpeed: 2.6,
  sparkleLife: 1.7,
  colorSparkle: "#eafcff",

  /* --- the impact at the far end --- */
  impactShell: 3.6, // metres, the frosted shell around the far end
  impactShellLife: 0.55,
  impactShellAlpha: 0.45,

  /* --- feedback --- */
  impactShake: 0.35,
  impactRing: 3.2, // metres, ring at the far end
  pulseRing: 1.1, // metres, cold pulse leaving the caster
  sfx: "cast",
};


