// Shared blade/leaf builders.
//
// grass.js and broadLeaf.js are the same problem twice: a handful of curved
// strips radiating from a small base. This module owns the strip maths and the
// radial placement, so each species only has to describe its silhouette.
//
// Nothing here exports a `spec` — this is a helper module, not a plant.

import * as THREE from "three";
import { taperedPlane, transform, combine, mergeParts } from "../core/geom.js";

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * One curved strip. Authored at the origin, growing +Y, front face +Z.
 *
 * Everything `taperedPlane` does, plus three things a blade needs:
 *
 *   roll   spin about the strip's own long axis. Stops a tuft reading as eight
 *          identical ribbons seen edge-on: rolled blades catch the ramp on
 *          their face instead of vanishing into a line.
 *   twist  the same spin, but accumulating from base to tip, so one strip
 *          shows its face at the root and its edge at the tip.
 *   arc    a real bend about the base. `taperedPlane`'s `bend` can only drift
 *          the tip sideways (y always grows); `arc` rotates the whole
 *          cross-section, so the tip actually falls over.
 *
 * Returns a BufferGeometry. Add colour/sway through makeClump().
 */
export function makeBlade({
  length = 0.8,
  width = 0.04,
  widthTip = null,
  widthCurve = "blade",
  profile = null,
  segments = 4,
  crossSegments = 3,
  bend = 0,
  lean = 0,
  cup = 0,
  ruffle = 0,
  arc = 0,
  roll = 0,
  twist = 0,
} = {}) {
  const geo = taperedPlane({
    length,
    widthBase: width,
    widthTip: widthTip ?? Math.max(width * 0.08, 0.0015),
    widthCurve,
    profile,
    segments,
    crossSegments,
    bend,
    lean,
    cup,
    ruffle,
  });

  if (roll || twist || arc) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const t = clamp01(y / length);

      const spin = roll + twist * t;
      if (spin) {
        const c = Math.cos(spin);
        const s = Math.sin(spin);
        const nx = x * c - z * s;
        z = x * s + z * c;
        x = nx;
      }

      if (arc) {
        // Progressive bend: a little at the root, most of it near the tip.
        // Pure t² piles every degree of rotation into the last segment and
        // reads as a hard elbow; pure t (a circular arc) bends the blade so
        // early that it cannot also be tall. This blend stays upright at the
        // root and falls over at the tip, which is what a blade does.
        const a = arc * (0.35 * t + 0.65 * t * t);
        const c = Math.cos(a);
        const s = Math.sin(a);
        const ny = y * c - z * s;
        z = y * s + z * c;
        y = ny;
      }

      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  return geo;
}

/**
 * Blend two colours into a new one. For shades the palette doesn't name.
 */
export function mix(a, b, t) {
  return new THREE.Color().copy(a).lerp(b, t);
}

/**
 * Three-stop colour ramp as a (t) => THREE.Color function, for mergeParts'
 * `colorFn`. root -> mid -> tip, with `mid` placing the middle stop.
 */
export function gradient3(root, mid, tip, { mid: midAt = 0.5, power = 1 } = {}) {
  const out = new THREE.Color();
  const m = Math.min(0.999, Math.max(0.001, midAt));
  return (t) => {
    const u = Math.pow(clamp01(t), power);
    if (u < m) out.copy(root).lerp(mid, u / m);
    else out.copy(mid).lerp(tip, (u - m) / (1 - m));
    return out;
  };
}

/**
 * Place `count` strips in a rough ring and weld them into one geometry.
 *
 * Each strip is authored growing +Y with its face +Z. We rotate it -tilt about
 * X (which tips the growth outward and rolls the face skyward), then spin that
 * about Y so the whole thing points at `angle`. So a blade/leaf grows up and
 * out with its face up — the same recipe for grass and for a rosette.
 *
 * @param {object}   o
 * @param {object}   o.rng         makeRng() instance
 * @param {number}   o.count       how many strips
 * @param {number}   o.radius      base ring radius (items start off-centre)
 * @param {number}   o.radiusJitter  0..1, how much of `radius` varies per item
 * @param {number}   o.spread      outward lean in radians
 * @param {number}   o.spreadJitter  0..1, fractional variation of `spread`
 * @param {number}   o.angleJitter radians of azimuth jitter
 * @param {number}   o.startAngle  radians, phase of the ring
 * @param {function} o.sway        default sway profile for every part
 * @param {function} o.makePart    ({ i, count, rng, angle, tilt }) => part | part[]
 */
export function makeClump({
  rng,
  count = 8,
  radius = 0.02,
  radiusJitter = 0.6,
  spread = 0.3,
  spreadJitter = 0.5,
  angleJitter = 0.3,
  startAngle = 0,
  sway = (t) => t,
  makePart,
} = {}) {
  const parts = [];

  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i / count) * TAU + rng.range(-angleJitter, angleJitter);
    const r = radius * rng.range(1 - radiusJitter, 1);
    const tilt = spread * rng.range(1 - spreadJitter, 1 + spreadJitter);

    // Rotation -tilt about X sends the strip's growth toward -Z, so the base
    // ring is offset along that same -Z direction before the Y spin.
    const base = transform({
      position: [-r * Math.sin(angle), 0, -r * Math.cos(angle)],
      rotation: [-tilt, angle, 0],
      order: "YXZ",
    });

    const made = makePart({ i, count, rng, angle, tilt });
    for (const part of Array.isArray(made) ? made : [made]) {
      parts.push({
        ...part,
        matrix: part.matrix ? combine(base, part.matrix) : base,
        sway: part.sway ?? sway,
      });
    }
  }

  return mergeParts(parts);
}
