// Sunpetal Vale — style presets for the 2x2 comparison sheet.
//
// Four candidate directions for the final look, all driven from the SAME scene
// by writing uniforms between viewport renders. Nothing here rebuilds geometry:
// every lever already exists in a shader and defaults to the shipped look, so
// "Painted" with all-zero levers is exactly the meadow we already had.
//
// The levers, and why each one exists:
//
//   cel        0..1  quantise the lit factor into three flat tones
//   rim        0..1  fresnel rim light on the sun side
//   ink        0..1  dark contour where leaf cards turn edge-on to the camera
//   groundCel  0..1  narrow the meadow's cloud-shadow pockets into drawn shapes
//   fog        [near, far, colour]  aerial perspective
//   grade      saturation / contrast / lift / vignette / haze
//   bloom      strength / radius / threshold
//
// A cel transition is 0.1 wide on purpose. A true hard step aliases into a
// staircase at 1080p and reads as a posterise filter, not as drawn light.

import { TREE_STYLE } from "./port/anime-flower-tree.js";

export const STYLES = [
  {
    id: "painted",
    label: "Painted",
    blurb: "Smooth ramps, painterly ground. The shipped look, refined.",
    cel: 0.0,
    rim: 0.0,
    ink: 0.0,
    groundCel: 0.25,
    fog: [58, 300, 0xdde8ef],
    exposure: 1.1,
    grade: { sat: 1.62, contrast: 1.0, lift: 0.004, vignette: 0.10, haze: 0.010 },
    bloom: [0.12, 0.85, 0.90],
    posterize: 0.0,
    warm: [1.006, 1.0, 0.990],
    cool: [0.968, 0.988, 1.022],
  },
  {
    id: "cinematic",
    label: "Cinematic",
    blurb: "Hard S-curve, teal shadows against warm highlights, deep vignette.",
    cel: 0.0,
    rim: 0.15,
    ink: 0.0,
    groundCel: 0.35,
    fog: [70, 340, 0xcfd9e4],
    exposure: 1.02,
    // The contrast and the split tone ARE this pipeline: shadows pulled to
    // teal, highlights pushed to cream, corners crushed.
    grade: { sat: 1.34, contrast: 1.26, lift: 0.0, vignette: 0.34, haze: 0.004 },
    bloom: [0.22, 0.58, 0.80],
    posterize: 0.0,
    warm: [1.045, 1.0, 0.952],
    cool: [0.900, 0.980, 1.075],
  },
  {
    id: "graphic",
    label: "Graphic",
    blurb: "Posterised colour bands, drawn outline, no bloom. Print, not render.",
    cel: 1.0,
    rim: 0.0,
    ink: 0.0,
    outline: 0.7,
    groundCel: 1.0,
    fog: [55, 320, 0xdde8ef],
    exposure: 1.0,
    grade: { sat: 1.9, contrast: 1.1, lift: 0.0, vignette: 0.06, haze: 0.0 },
    bloom: [0.03, 0.8, 0.95],
    posterize: 1.0,
    warm: [1.0, 1.0, 1.0],
    cool: [0.95, 0.98, 1.05],
  },
  {
    id: "dreamy",
    label: "Dreamy",
    blurb: "Heavy bloom and halation, lifted blacks, everything glowing.",
    cel: 0.2,
    rim: 0.55,
    ink: 0.0,
    groundCel: 0.3,
    fog: [34, 230, 0xe8eefb],
    exposure: 1.16,
    grade: { sat: 1.18, contrast: 0.92, lift: 0.036, vignette: 0.20, haze: 0.070 },
    bloom: [0.62, 0.95, 0.58],
    posterize: 0.0,
    warm: [1.02, 1.0, 0.98],
    cool: [0.955, 0.985, 1.04],
  },
];

const WARM = [1.004, 1.0, 0.994];
const COOL = [0.966, 0.986, 1.024];

/**
 * Push one preset into a live meadow + one post chain.
 *
 * @param {object} bg        value returned by createMeadowBackground()
 * @param {object} style     one entry of STYLES
 * @param {object} scene     the scene (owns the fog)
 * @param {object} post      value returned by createMeadowPost(), or null
 * @param {object} renderer  the WebGLRenderer (owns toneMappingExposure)
 */
export function applyStyle(bg, style, scene, post, renderer) {
  const cel = style.cel ?? 0;
  const rim = style.rim ?? 0;

  /* ---- foliage / grass / blossom material ---- */
  const mats = bg?.kit?.materials ?? {};
  for (const key of ["foliage", "petal", "rock"]) {
    const u = mats[key]?.uniforms;
    if (!u) continue;
    if (u.uCel) u.uCel.value = cel;
    if (u.uRim) u.uRim.value = rim;
  }

  /* ---- trees (one shared uniform set for all ~30 of them) ---- */
  TREE_STYLE.uCel.value = cel;
  TREE_STYLE.uRim.value = rim;
  TREE_STYLE.uInk.value = style.ink ?? 0;

  /* ---- meadow floor ---- */
  const groundCel = bg?.terrain?.uniforms?.groundCel;
  if (groundCel) groundCel.value = style.groundCel ?? 0;

  /* ---- aerial perspective ---- */
  if (scene?.fog && style.fog) {
    const [near, far, color] = style.fog;
    scene.fog.near = near;
    scene.fog.far = far;
    scene.fog.color.setHex(color);
  }

  /* ---- exposure ---- */
  if (renderer) renderer.toneMappingExposure = style.exposure ?? 1.1;

  if (!post) return;

  /* ---- grade ---- */
  const g = post.params.grade;
  if (g) {
    const s = style.grade ?? {};
    if (s.sat !== undefined) g.uSaturation.value = s.sat;
    if (s.contrast !== undefined) g.uContrast.value = s.contrast;
    if (s.lift !== undefined) g.uLift.value = s.lift;
    if (s.vignette !== undefined) g.uVignette.value = s.vignette;
    if (s.haze !== undefined) g.uHaze.value = s.haze;
    if (g.uOutline) g.uOutline.value = style.outline ?? 0;
    if (g.uPosterize) g.uPosterize.value = style.posterize ?? 0;
    g.uWarmHigh.value.set(...(style.warm ?? WARM));
    g.uCoolShadow.value.set(...(style.cool ?? COOL));
  }

  /* ---- bloom ---- */
  if (style.bloom && typeof post.setBloom === "function") {
    post.setBloom(...style.bloom);
  }
}

export default STYLES;
