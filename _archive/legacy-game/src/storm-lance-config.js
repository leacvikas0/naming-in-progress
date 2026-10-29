// Storm Lance — the mage's second spellbook spell.
//
// A bundle of lightning filaments snaps from the caster's hand down the aimed
// line, holds while it gutters, and blows out around a bright discharge dome at
// the impact point. Adapted from the MIT-licensed reference project
// (spellbook/src/config/abilities/thunder.js); see game/src/spellbook-LICENSE.txt.
//
// Gameplay fields mirror the Frost Lance event shape so enemies.js can resolve
// the line front with the same code: this is a very fast, narrow line spell.

export const STORM_LANCE = {
  spellId: "storm-lance",
  element: "arcane",
  shape: "line",

  /* --- the cast --- */
  range: 13, // maximum reach, metres
  minLength: 2.5, // shorter than this and the cast is refused
  speed: 105, // strike front, metres/second (almost instant)
  cooldown: 0.5, // seconds between accepted casts
  damageMult: 1.25, // one rolled mage light hit, scaled by this
  stun: 0.12, // extra stun on a contact hit
  standTime: 0.15, // the gameplay front holds briefly after arrival
  sinkTime: 0.3,
  slots: 3,
  maxFronts: 8,
  widthNear: 0.25, // damage band half-width, metres
  widthFar: 0.9,
  widthCurve: 1.0,

  /* --- where the bolt leaves the caster --- */
  handHeight: 1.28,
  handForward: 0.55,
  handSide: 0.16,
  endHeight: 0.35,
  sag: 0.22,

  /* --- the bundle of filaments --- */
  strands: 13, // separate filaments (capped at 24)
  spread: 0.45, // metres the bundle fans out at the far end
  spreadNear: 0.04,
  spreadCurve: 1.5,
  twist: 0.45,
  twistSpeed: 0.8,

  /* --- the shape of one filament --- */
  jitter: 0.5,
  jitterScale: 1.1,
  octaves: 4,
  jitterFalloff: 0.55,
  crawl: 4.0,
  pinch: 0.12,
  converge: 0.85,

  /* --- the ribbon ---
   * Two passes over one shared instanced geometry: a normal-blended blue body
   * (so the bolt stays blue over bright ground instead of washing to white) and
   * an additive white-hot core/glow. Both passes cost one draw call each. */
  width: 0.12, // half-width at the hand, metres
  widthTip: 0.7,
  widthCurve: 1.05,
  coreWidth: 1.2, // extra width on the centre filament
  bodyWidthMult: 1.45,
  coreWidthMult: 0.5,
  haloWidthMult: 2.4,
  bodyAlpha: 0.88,
  bodyOuter: "#1030c8",
  bodyInner: "#4a9bff",
  haloColor: "#2f6bff",
  haloAlpha: 0.3,
  haloFalloff: 1.4,
  coreSharp: 3.4,
  glowFalloff: 1.7,
  glowOpacity: 0.5,
  softFade: 0.78,

  /* --- flicker & restrike --- */
  restrike: 24,
  flicker: 0.3,
  flickerSpeed: 34,
  strandFlash: 0.5,
  tipGlow: 2.0,
  tipLength: 0.08,

  /* --- colour --- */
  colorCore: "#ffffff",
  colorInner: "#9fd8ff",
  colorOuter: "#1e6bff",
  glow: 1.5,
  opacity: 1.0,

  /* --- timing / impact --- */
  lifetime: 0.45, // seconds the bolt holds after landing
  fadeTime: 0.5,
  impactDome: 3.4, // metres, discharge dome at the far end
  impactDomeLife: 0.75,
  impactDomeAlpha: 0.72,
  impactRing: 3.6,
  impactSpikes: 44, // radial discharge spikes thrown off the dome
  impactSparkCount: 20,
  impactShake: 0.45,
  colorDome: "#dff2ff",
  sfx: "cast",
};


