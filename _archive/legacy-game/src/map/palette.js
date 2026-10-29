// Sunpetal Vale Ã¢â‚¬â€ "Anime Meadow" background palette.
//
// One source of truth for every module in game/src/map/. These are linear-ish
// authored sRGB hex values chosen for a high-key, late-afternoon anime meadow:
// saturated but pastel greens, cool blue shadows, warm cream sunlight, and a
// lavender-blue aerial haze on everything distant.
//
// Art rules (see handoff/map-bg/SPEC.md):
//   - Three tones per material family: light / mid / shadow. Never a fourth.
//   - Sun-facing surfaces drift toward yellow-green; shadowed surfaces drift
//     toward blue-green. That contrast is what reads as "anime".
//   - Distance desaturates and cools; near field stays punchy.
//   - No textures. Colour comes from vertex colours, flat shading and light.

export const MEADOW = {
  // --- sky & atmosphere -----------------------------------------------------
  // The dome is graded by ACES in the post grade, which desaturates hard in the
  // shoulder, so these are authored deeper/more saturated than the sky is meant
  // to READ. Round 1 measured the top of the gameplay frame at #6293cd; round 2
  // raises the value toward the reference's #66a5e5 (critic Fix 8).
  skyZenith: 0x1a6bcc,
  skyMid: 0x5aa2e0,
  skyHorizon: 0xeef2fb,
  skySunGlow: 0xfff0c2,
  // Warm WHITE sun, not cream and not orange: the warmth in the reference comes
  // from the light, never from a grade.
  sun: 0xfff6e2,
  sunDisc: 0xffd489,
  ambientSky: 0xbfe2ff,
  ambientGround: 0x8fbc6b,
  fog: 0xdde8ef,
  cloudLight: 0xffffff,
  cloudShadow: 0xcbdcef,

  // --- ground ---------------------------------------------------------------
  // Ground ramp: cooler (hue ~100 instead of ~76) and now clearly darker than
  // the tuft palette, so the lit ground reads as a dark base with bright tips
  // standing on it. The near field measured 16 % too bright and 29 % under-
  // saturated against the reference's #6f8b55; these values are that correction.
  grassBase: 0x5f8f4a,
  grassWarm: 0x7d9f57,
  grassCool: 0x5f8668,
  grassShadow: 0x3c5f50,
  grassTip: 0xc6dd97,
  moss: 0x50796a,
  // Path: desaturated, orange taken out.
  dirt: 0xa88a55,
  path: 0x9e814c,
  pathEdge: 0x6f5c3e,
  pathStone: 0xb3ada0,
  pathWet: 0x86735a,

  // Stone trio copied from the reference rock shading (top sun / slate / shadow)
  // plus its moss cap. Used by boulders and stepping stones.
  stoneTop: 0xcfc2b0,
  stoneMid: 0x8b93a4,
  stoneShadow: 0x53697a,
  stoneMoss: 0x557f68,

  // --- flowers --------------------------------------------------------------
  flowerPink: 0xf7b8d3,
  flowerCream: 0xfff1b8,
  flowerLilac: 0xc0a8f0,
  flowerWhite: 0xfdfbff,
  flowerGold: 0xffd76b,
  flowerBlue: 0x9fc6f2,

  // --- foliage --------------------------------------------------------------
  trunk: 0x8a6244,
  trunkDark: 0x5f4331,
  trunkPale: 0xd8c9a8,
  canopyLight: 0xb8dd6c,
  canopyMid: 0x77b74f,
  canopyDark: 0x3f7a4c,
  canopyRim: 0xeaf7ab,
  coniferLight: 0x5fa368,
  coniferDark: 0x336b4b,
  bushLight: 0x8cc65e,
  bushMid: 0x62a052,
  bushDark: 0x3d7749,
  fern: 0x6fae54,

  // --- water ----------------------------------------------------------------
  water: 0x5fc9c9,
  waterDeep: 0x2f8f9a,
  waterShallow: 0x9fe6dd,
  waterFoam: 0xe6fdf8,

  // --- distance -------------------------------------------------------------
  // This is the aerial perspective: cool and pale. The ridges bake their own
  // haze in sky.js, so these read as "distance" without any fog chunk.
  hillNear: 0x7fa79b,
  hillMid: 0x7ea3b2,
  hillFar: 0x8faec6,
  ridgeFar: 0x7f9cba,

  // --- particles ------------------------------------------------------------
  pollen: 0xfff3c4,
  petal: 0xffd9e8,
};

// Light rig constants shared by the preview and, later, world.js.
//
// ROUND 5: the sun moved IN FRONT of the viewer and down to 17 degrees, so it
// is actually visible above the tree line. That is the change the reference
// cannot make (a painted background has no sun disc) but a game scene wants:
// a low warm sun over the treeline, long light across the meadow, and clouds
// with lit edges.
//
// Azimuth -1.10 rad puts it 24 degrees left of the gameplay camera's forward
// axis, elevation 0.30 rad (17 deg) puts it just above the canopy in frame.
// Because the sun is low, N.L on the flat meadow is 0.30 instead of 0.70, so
// sunIntensity was raised 2.2 -> 3.6 to keep the same exposure on the grass.
export const MEADOW_LIGHT = {
  sunAzimuth: -1.35,
  sunElevation: 0.34,
  sunIntensity: 5.0,
  hemiIntensity: 1.2,
  ambientIntensity: 0.18,
  // At 55 m nothing fogs, so the tree line (56.5 m) stays crisp and saturated
  // like the reference; the far meadow is ~25 % hazed at 120 m. 35/210 washed
  // the tree line out -- do not use it.
  fogNear: 55,
  fogFar: 320,
  exposure: 0.92,
};
