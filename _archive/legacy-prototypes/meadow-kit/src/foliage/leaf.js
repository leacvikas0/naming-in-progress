// Shared leaf builder — a helper, not a species (it exports no `spec`, so the
// validator skips it as a helper module).
//
// makeLeaf() returns a mergeParts()-ready part, so a species just pushes it
// into its parts array. Both campanula and lupine reuse it for foliage.

import { taperedPlane, transform } from "../core/geom.js";

/**
 * One pointed leaf, base at `position`, growing along the transformed +Y.
 *
 * @param {object} o
 * @param {number} o.length         leaf length (local units)
 * @param {number} o.width          widest leaf width
 * @param {number} o.bend           curl toward +Z as a fraction of length (negative curls back)
 * @param {number} o.cup            edge curl toward +Z as a fraction of width
 * @param {THREE.Color} o.colour    colour at the base (required)
 * @param {THREE.Color} [o.colourTip] colour at the tip; defaults to `colour`
 * @param {object} [o.rng]          seeded rng for slight shape jitter
 * @param {number[]} [o.position]   where the leaf base sits
 * @param {number[]} [o.rotation]   euler radians, [x, y, z]
 * @param {string} [o.order]        euler order, default "YXZ" (spin around the stem last)
 * @param {number} [o.segments]
 * @param {number} [o.crossSegments]
 * @param {number} [o.gradientPower]
 * @param {number|function} [o.sway]
 * @returns {{geo: object, color: THREE.Color, color2: THREE.Color, gradientPower: number, sway: function|number, matrix: object}}
 */
export function makeLeaf({
  length = 0.2,
  width = 0.055,
  bend = -0.2,
  cup = 0.34,
  colour,
  colourTip,
  rng = null,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  order = "YXZ",
  segments = 5,
  crossSegments = 5,
  gradientPower = 0.8,
  sway = (t) => 0.1 + t * 0.45,
} = {}) {
  if (colour == null) throw new Error("makeLeaf: `colour` is required");

  // A little per-leaf variation so a cluster does not look stamped.
  const lenJitter = rng ? rng.range(0.92, 1.08) : 1;
  const widJitter = rng ? rng.range(0.9, 1.1) : 1;

  return {
    geo: taperedPlane({
      length: length * lenJitter,
      widthBase: width * widJitter,
      widthCurve: "leaf",
      segments,
      crossSegments,
      bend,
      cup,
    }),
    color: colour,
    color2: colourTip ?? colour,
    gradientPower,
    sway,
    matrix: transform({ position, rotation, order }),
  };
}
