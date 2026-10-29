// Campanula — the big violet five-pointed star flowers standing above the
// grass on slender stems. Two to four flower heads on short pedicels, fanned
// across the camera side, plus a few small leaves up the stem.
//
// Local space: base at the origin, growing +Y, ~0.7 units tall before
// finalizeGeometry() rescales it to exactly 1.0.

import { taperedPlane, tube, dome, transform, combine, mergeParts } from "../core/geom.js";
import { speciesCol } from "../core/palette.js";
import { makeRng } from "../core/rng.js";
import { makeLeaf } from "./leaf.js";

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ~137.5 deg

// Pointed star petal: moderate base, widest just below the middle, sharp tip.
// (The built-in "petal" curve keeps a blunt tip, which would read as a daisy.)
function starPetal(width) {
  return (t) => width * Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * t)), 0.65) * (1 - t * t * t);
}

export const spec = {
  id: "campanula",
  label: "Campanula",
  layer: "flower",
  material: "petal",
  density: 0.52,
  scale: [0.34, 0.52], // metres of actual height
  clump: 0.42,

  build({ seed = 1 } = {}) {
    const rng = makeRng((seed | 0) ^ 0xca3f);
    const C = (key) => speciesCol("campanula", key);

    const petalCol = C("petal");
    const petalTip = C("petalTip");
    const centerCol = C("center");
    const centerShade = C("centerShade");
    const stemCol = C("stem");
    const leafTip = stemCol.clone().offsetHSL(-0.01, 0.04, 0.09);

    const parts = [];
    const stemH = rng.range(0.6, 0.68);
    const flowerCount = rng.int(2, 4);

    // --- stem: gentle S, leaning slightly with the light -------------------
    const sideBend = rng.range(-0.014, 0.014);
    const spine = [
      [0, 0, 0],
      [sideBend * 0.3, stemH * 0.24, 0.006],
      [sideBend * 0.7, stemH * 0.5, 0.014],
      [sideBend, stemH * 0.76, 0.021],
      [sideBend * 1.15, stemH, 0.026],
    ];

    const stemAt = (t) => {
      const f = Math.min(0.9999, Math.max(0, t)) * (spine.length - 1);
      const i = Math.floor(f);
      const u = f - i;
      const a = spine[i];
      const b = spine[Math.min(spine.length - 1, i + 1)];
      return [
        a[0] + (b[0] - a[0]) * u,
        a[1] + (b[1] - a[1]) * u,
        a[2] + (b[2] - a[2]) * u,
      ];
    };

    parts.push({
      geo: tube({ points: spine, radius: 0.0056, tubular: 8, radial: 4 }),
      color: stemCol,
      color2: leafTip,
      gradientPower: 0.7,
      sway: (t) => 0.05 + t * 0.9,
    });

    // --- a few small leaves up the lower stem ------------------------------
    const leafCount = rng.int(2, 3);
    for (let i = 0; i < leafCount; i++) {
      const f = 0.1 + i * 0.12 + rng.range(-0.02, 0.02);
      const p = stemAt(f);
      const angle = i * GOLDEN + rng.range(-0.35, 0.35);
      parts.push(
        makeLeaf({
          length: rng.range(0.07, 0.105),
          width: rng.range(0.026, 0.036),
          bend: -0.16,
          cup: 0.3,
          colour: stemCol,
          colourTip: leafTip,
          rng,
          position: [p[0], p[1], p[2]],
          rotation: [rng.range(0.95, 1.25), angle, 0],
          sway: (t) => 0.1 + t * 0.45,
        })
      );
    }

    // --- flower heads: 2-4, at different heights, fanned toward +Z ---------
    const flowerCount = rng.int(3, 4);
    for (let i = 0; i < flowerCount; i++) {
      const f =
        0.46 + (i / Math.max(1, flowerCount - 1)) * 0.5 + rng.range(-0.03, 0.03);
      const attach = stemAt(f);
      const faceAngle =
        (i - (flowerCount - 1) / 2) * 0.62 + rng.range(-0.14, 0.14);
      const reach = rng.range(0.045, 0.08) * (1.1 - f * 0.4);
      const rise = rng.range(0.025, 0.045);
      const headPos = [
        attach[0] + Math.sin(faceAngle) * reach,
        attach[1] + rise,
        attach[2] + Math.cos(faceAngle) * reach,
      ];

      // pedicel: a short curved stalk from the stem to the back of the head
      const mid = [
        (attach[0] + headPos[0]) * 0.5,
        (attach[1] + headPos[1]) * 0.5 + 0.007,
        (attach[2] + headPos[2]) * 0.5,
      ];
      parts.push({
        geo: tube({
          points: [attach, mid, headPos],
          radius: 0.0042,
          tubular: 5,
          radial: 3,
        }),
        color: stemCol,
        color2: leafTip,
        gradientPower: 0.7,
        sway: (t) => 0.2 + t * 0.75,
      });

      // head frame: the flower faces +Y (up) in its own space, tilted toward
      // +Z (the camera side) and spun outward, exactly like the daisy.
      const headTilt = rng.range(0.27, 0.38);
      const head = transform({
        position: headPos,
        rotation: [headTilt, faceAngle, 0],
        order: "YXZ",
      });

      // five pointed petals radiating around the head
      const petalCount = 5;
      for (let j = 0; j < petalCount; j++) {
        const angle = (j / petalCount) * TAU + rng.range(-0.06, 0.06);
        const lift = rng.range(0.06, 0.18);
        const length = rng.range(0.072, 0.09);
        const width = length * rng.range(0.5, 0.58);
        parts.push({
          geo: taperedPlane({
            length,
            widthBase: width,
            profile: starPetal(width),
            segments: 6,
            crossSegments: 5,
            bend: -0.12,
            cup: 0.22,
          }),
          color: petalCol,
          color2: petalTip,
          gradientPower: 1.15,
          matrix: combine(
            head,
            transform({ rotation: [Math.PI / 2 - lift, angle, 0], order: "YXZ" })
          ),
          sway: (t) => 0.75 + t * 0.25,
        });
      }

      // pale centre with a shaded rim
      parts.push({
        geo: dome({ radius: 0.013, height: 0.006, segments: 16 }),
        color: centerShade,
        color2: centerCol,
        gradientAxis: "z",
        matrix: combine(head, transform({ rotation: [-Math.PI / 2, 0, 0], order: "YXZ" })),
        sway: 0.92,
      });

      // green calyx tucked under the head
      parts.push({
        geo: dome({ radius: 0.022, height: 0.012, segments: 10 }),
        color: stemCol,
        color2: leafTip,
        gradientAxis: "z",
        matrix: combine(head, transform({ rotation: [Math.PI / 2, 0, 0], order: "YXZ" })),
        sway: 0.86,
      });
    }

    return mergeParts(parts);
  },
};
