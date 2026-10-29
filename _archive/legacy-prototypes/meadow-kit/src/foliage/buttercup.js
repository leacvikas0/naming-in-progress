// Buttercup — the small warm-gold sparks scattered through the grass.
//
// Structure follows daisy.js:
//   1. build parts with taperedPlane / tube / dome
//   2. give each part a colour gradient and a sway profile
//   3. weld with mergeParts()
//   4. return ONE geometry — height normalisation happens for you
//
// Local space: base at the origin, growing +Y, ~0.65 units tall before
// finalizeGeometry() rescales it to exactly 1.0.

import * as THREE from "three";
import { taperedPlane, tube, dome, transform, combine, mergeParts } from "../core/geom.js";
import { speciesCol } from "../core/palette.js";
import { makeRng } from "../core/rng.js";

const TAU = Math.PI * 2;

/** A palette colour, nudged. Never invents a hex. */
function shade(color, { h = 0, s = 0, l = 0, mul = 1 } = {}) {
  const c = color.clone();
  if (h || s || l) c.offsetHSL(h, s, l);
  if (mul !== 1) c.multiplyScalar(mul);
  return c;
}

export const spec = {
  id: "buttercup",
  label: "Buttercup",
  layer: "flower",
  material: "petal",
  density: 2.3,
  scale: [0.16, 0.26], // metres of actual height
  clump: 0.22,

  build({ seed = 1 } = {}) {
    const rng = makeRng((seed | 0) ^ 0xb0773c);
    const C = (key) => speciesCol("buttercup", key);
    const parts = [];

    // Waxy petals: shadowed throat, warm gold body, bright rim. The toon ramp
    // has no specular term, so the bright rim plus the dark throat is what
    // reads as "glossy".
    const throat = shade(C("petalUnder"), { mul: 0.95 });
    const body = C("petal");
    const rim = C("petalTip");
    const scratch = new THREE.Color();
    const petalRamp = (t) => {
      if (t < 0.42) scratch.copy(throat).lerp(body, t / 0.42);
      else scratch.copy(body).lerp(rim, Math.pow((t - 0.42) / 0.58, 1.15));
      return scratch;
    };

    const stemH = 0.6;
    const stemTop = [0.022, stemH, 0.03];
    const stemLight = shade(C("stem"), { l: 0.1 });

    // --- main stem: slender, leaning slightly toward the camera -----------
    parts.push({
      geo: tube({
        points: [
          [0, 0, 0],
          [0.006, stemH * 0.36, 0.008],
          [0.016, stemH * 0.72, 0.022],
          stemTop,
        ],
        radius: 0.006,
        tubular: 7,
        radial: 4,
      }),
      color: C("stem"),
      color2: stemLight,
      sway: (t) => 0.05 + t * 0.9,
    });

    // --- leaves: one or two small ones low on the stem --------------------
    const leafCount = rng.chance(0.7) ? 2 : 1;
    for (let i = 0; i < leafCount; i++) {
      parts.push({
        geo: taperedPlane({
          length: rng.range(0.1, 0.13),
          widthBase: rng.range(0.042, 0.054),
          widthCurve: "leaf",
          segments: 5,
          crossSegments: 5,
          bend: -0.18,
          cup: 0.3,
        }),
        color: C("stem"),
        color2: stemLight,
        gradientPower: 0.8,
        matrix: transform({
          position: [0.002, 0.045 + i * rng.range(0.055, 0.09), 0.004],
          rotation: [rng.range(0.95, 1.2), rng.range(0, TAU), 0],
          order: "YXZ",
        }),
        sway: (t) => 0.1 + t * 0.45,
      });
    }

    // --- one flower head: five rounded petals in a shallow spoon ----------
    const flower = (head) => {
      const count = 5;
      const phase = rng.range(0, TAU);
      for (let i = 0; i < count; i++) {
        const angle = phase + (i / count) * TAU + rng.range(-0.08, 0.08);
        const lift = rng.range(0.1, 0.24); // radians above the flower plane
        const lean = rng.range(-0.06, 0.06); // sideways wobble, breaks symmetry
        parts.push({
          geo: taperedPlane({
            length: rng.range(0.08, 0.094),
            widthBase: rng.range(0.08, 0.092),
            widthCurve: "petal",
            segments: 6,
            crossSegments: 5,
            cup: -0.2, // edges lift toward the flower face: a spoon
            bend: -0.08,
            ruffle: 0.016,
          }),
          colorFn: petalRamp,
          matrix: combine(
            head,
            transform({ rotation: [Math.PI / 2 - lift, angle, lean], order: "YXZ" })
          ),
          sway: (t) => 0.75 + t * 0.25,
        });
      }

      // small gold centre — darker than the petals so the flower reads at
      // meadow distance, where the petals themselves are only a few pixels
      parts.push({
        geo: dome({ radius: 0.027, height: 0.011, segments: 12 }),
        color: shade(C("center"), { mul: 0.78 }),
        color2: C("center"),
        gradientAxis: "z",
        matrix: combine(head, transform({ rotation: [-Math.PI / 2, 0, 0], order: "YXZ" })),
        sway: 0.9,
      });

      // green calyx tucked underneath
      parts.push({
        geo: dome({ radius: 0.027, height: 0.014, segments: 10 }),
        color: C("stem"),
        color2: stemLight,
        gradientAxis: "z",
        matrix: combine(head, transform({ rotation: [Math.PI / 2, 0, 0], order: "YXZ" })),
        sway: 0.85,
      });
    };

    // main head, face tipped toward +Z so the camera sees into the cup
    flower(
      transform({
        position: stemTop,
        rotation: [rng.range(0.2, 0.35), 0, 0],
        order: "YXZ",
      })
    );

    // --- sometimes a second, lower head on a short side branch ------------
    if (rng.chance(0.65)) {
      const side = rng.sign();
      const branchY = stemH * rng.range(0.4, 0.52);
      const tip = [
        side * rng.range(0.07, 0.1),
        stemH * rng.range(0.66, 0.76),
        rng.range(-0.02, 0.04),
      ];
      parts.push({
        geo: tube({
          points: [
            [0.008, branchY, 0.012],
            [side * 0.04, branchY + (tip[1] - branchY) * 0.55, 0.02],
            tip,
          ],
          radius: 0.0042,
          tubular: 6,
          radial: 3,
        }),
        color: C("stem"),
        color2: stemLight,
        sway: (t) => 0.05 + t * 0.9,
      });
      flower(
        transform({
          position: tip,
          rotation: [rng.range(0.2, 0.35), 0, 0],
          order: "YXZ",
        })
      );
    }

    return mergeParts(parts);
  },
};
