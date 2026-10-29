// Field daisy — the reference asset for this pack.
//
// This file is the template every other species follows. Read it before
// writing a new plant:
//   1. build parts with taperedPlane / tube / dome
//   2. give each part a colour gradient and a sway profile
//   3. weld with mergeParts()
//   4. return ONE geometry — height normalisation happens for you
//
// Local space: base at the origin, growing +Y, roughly 0.7 units tall before
// finalizeGeometry() rescales it to exactly 1.0.

import { taperedPlane, tube, dome, transform, combine, mergeParts } from "../core/geom.js";
import { speciesCol } from "../core/palette.js";
import { makeRng } from "../core/rng.js";

const TAU = Math.PI * 2;

export const spec = {
  id: "daisy",
  label: "Field daisy",
  layer: "flower",
  material: "petal",
  density: 3.1,
  scale: [0.2, 0.32], // metres of actual height
  clump: 0.2,

  build({ seed = 1 } = {}) {
    const rng = makeRng((seed | 0) ^ 0xd4157);
    const C = (key) => speciesCol("daisy", key);
    const parts = [];

    const headY = 0.64;
    const headTilt = 0.3; // radians, leans the face toward +Z (the camera side)

    // --- stem: gentle S, darker at the root -------------------------------
    parts.push({
      geo: tube({
        points: [
          [0, 0, 0],
          [0.008, headY * 0.42, 0.012],
          [0.016, headY * 0.78, 0.03],
          [0.02, headY, 0.045],
        ],
        radius: 0.0072,
        tubular: 7,
        radial: 4,
      }),
      color: C("stem"),
      color2: "#7da85c",
      sway: (t) => 0.04 + t * 0.9,
    });

    // --- leaves: three, spiralling around the stem -------------------------
    for (let i = 0; i < 3; i++) {
      const angle = i * (TAU / 3) + rng.range(-0.32, 0.32);
      const y = 0.055 + i * 0.052;
      parts.push({
        geo: taperedPlane({
          length: rng.range(0.17, 0.21),
          widthBase: rng.range(0.05, 0.062),
          widthCurve: "leaf",
          segments: 5,
          crossSegments: 5,
          bend: -0.2,
          cup: 0.34,
        }),
        color: C("stem"),
        color2: "#93b46a",
        gradientPower: 0.75,
        matrix: transform({ position: [0, y, 0], rotation: [1.05, angle, 0], order: "YXZ" }),
        sway: (t) => 0.08 + t * 0.45,
      });
    }

    // --- head frame: everything below is placed relative to this ----------
    const head = transform({
      position: [0.02, headY, 0.045],
      rotation: [headTilt, 0, 0],
      order: "YXZ",
    });

    // --- 12 petals, each with its own lift and length ----------------------
    const petalCount = 12;
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * TAU + rng.range(-0.07, 0.07);
      const lift = rng.range(0.1, 0.26); // 0 = flat, higher = cup upward
      const local = transform({
        rotation: [Math.PI / 2 - lift, angle, 0],
        order: "YXZ",
      });
      parts.push({
        geo: taperedPlane({
          length: rng.range(0.085, 0.1),
          widthBase: rng.range(0.038, 0.046),
          widthCurve: "petal",
          segments: 6,
          crossSegments: 5,
          cup: 0.3,
          bend: -0.15,
          ruffle: 0.05,
        }),
        color: C("petal"),
        color2: C("petalTip"),
        gradientPower: 1.4,
        matrix: combine(head, local),
        sway: (t) => 0.65 + t * 0.35,
      });
    }

    // --- centre disc ------------------------------------------------------
    parts.push({
      geo: dome({ radius: 0.026, height: 0.011, segments: 14 }),
      color: C("centerShade"),
      color2: C("center"),
      gradientAxis: "z",
      matrix: combine(head, transform({ rotation: [-Math.PI / 2, 0, 0], order: "YXZ" })),
      sway: 0.9,
    });

    // --- green calyx tucked under the head --------------------------------
    parts.push({
      geo: dome({ radius: 0.03, height: 0.016, segments: 12 }),
      color: C("stem"),
      color2: "#7da85c",
      gradientAxis: "z",
      matrix: combine(head, transform({ rotation: [Math.PI / 2, 0, 0], order: "YXZ" })),
      sway: 0.8,
    });

    return mergeParts(parts);
  },
};
