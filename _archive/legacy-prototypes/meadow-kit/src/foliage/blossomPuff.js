// Blossom puff — the pale cream pom-pom near the centre of the meadow.
//
// Not a flat flower: a soft ball. A small cream core gives the head its body,
// and fourteen rounded petals are laid over it like shingles — each one starts
// on the ball surface, runs along the meridian and curls in toward the centre.
// That is what makes a pom-pom rather than a star of fins. Petals on the lower
// half start from `petalUnder` so the underside sits back in shade.
//
// Structure mirrors daisy.js: build parts -> colour + sway per part -> merge.

import { taperedPlane, tube, dome, transform, combine, mergeParts } from "../core/geom.js";
import { speciesCol } from "../core/palette.js";
import { makeRng } from "../core/rng.js";

export const spec = {
  id: "blossomPuff",
  label: "Blossom puff",
  layer: "flower",
  material: "petal",
  density: 0.48,
  scale: [0.24, 0.4], // metres of actual height
  clump: 0.3,

  build({ seed = 1 } = {}) {
    const rng = makeRng((seed | 0) ^ 0xb10550);
    const C = (key) => speciesCol("blossomPuff", key);
    const stemCol = C("stem");
    const stemLight = stemCol.clone().offsetHSL(0.01, 0.03, 0.12);
    const petalCol = C("petal");
    const petalUnder = C("petalUnder");
    const petalTip = C("petalTip");
    const parts = [];

    const centre = [0.012, 0.455, 0.014];
    const ballR = 0.046; // radius of the core the petals shingle over

    // --- short stem --------------------------------------------------------
    parts.push({
      geo: tube({
        points: [[0, 0, 0], [0.006, 0.15, 0.006], [0.012, 0.32, 0.012], [centre[0], 0.45, centre[2]]],
        radius: 0.006,
        tubular: 8,
        radial: 4,
      }),
      color: stemCol,
      color2: stemLight,
      gradientPower: 0.8,
      sway: (t) => 0.04 + t * 0.8,
    });

    // --- core: two shallow domes back to back give the head a solid body ---
    // The petals alone leave gaps; the core is what makes it a ball. It stays
    // just inside the petal tips so the silhouette is made of petals, not cone.
    parts.push({
      geo: dome({ radius: ballR, height: 0.046, segments: 12 }),
      color: petalUnder,
      color2: petalCol,
      gradientAxis: "z",
      matrix: combine(transform({ position: centre }), transform({ rotation: [-Math.PI / 2, 0, 0] })),
      sway: 0.9,
    });
    parts.push({
      geo: dome({ radius: ballR * 0.96, height: 0.038, segments: 12 }),
      color: petalUnder,
      color2: petalUnder.clone().multiplyScalar(0.9),
      gradientAxis: "z",
      matrix: combine(transform({ position: centre }), transform({ rotation: [Math.PI / 2, 0, 0] })),
      sway: 0.9,
    });

    // --- green calyx under the head ---------------------------------------
    parts.push({
      geo: dome({ radius: 0.024, height: 0.016, segments: 9 }),
      color: stemCol,
      color2: stemLight,
      gradientAxis: "z",
      matrix: combine(
        transform({ position: [centre[0], centre[1] - 0.026, centre[2]] }),
        transform({ rotation: [Math.PI / 2, 0, 0] })
      ),
      sway: 0.85,
    });

    // --- shingled petals over the ball ------------------------------------
    // Each petal's base sits on the ball at polar angle `polar`; its length
    // runs down the meridian (toward larger polar) and its cup/bend curl it
    // back toward the core, so it lies on the sphere like a scale.
    const addScale = ({ polar, azimuth, length, width, lit }) => {
      const d = [
        Math.sin(polar) * Math.cos(azimuth),
        Math.cos(polar),
        Math.sin(polar) * Math.sin(azimuth),
      ];
      // +Y of this frame points down the meridian, +Z points inward (radial).
      const yaw = Math.atan2(Math.cos(azimuth), Math.sin(azimuth));
      const frame = transform({
        position: [
          centre[0] + d[0] * ballR * 0.96,
          centre[1] + d[1] * ballR * 0.96,
          centre[2] + d[2] * ballR * 0.96,
        ],
        rotation: [polar + Math.PI / 2, yaw, 0],
        order: "YXZ",
      });

      parts.push({
        geo: taperedPlane({
          length,
          widthBase: width,
          widthCurve: "petal",
          segments: 4,
          crossSegments: 5,
          bend: 0.14, // curl back toward the ball
          cup: 0.4,
          ruffle: 0.02,
        }),
        color: lit ? petalCol : petalUnder,
        color2: lit ? petalTip : petalCol,
        gradientPower: lit ? 1.2 : 1,
        matrix: frame,
        sway: (t) => 0.6 + t * 0.4,
      });
    };

    // Many small petals, evenly over the upper hemisphere (Fibonacci spiral),
    // so the ball reads as one soft mass with no individual corners poking out.
    const petalCount = 16;
    for (let i = 0; i < petalCount; i++) {
      const z = 1 - ((i + 0.5) / petalCount) * 0.98; // 0.97 .. 0.03
      const polar = Math.acos(z) + rng.range(-0.04, 0.04);
      const azimuth = i * 2.39996 + rng.range(-0.15, 0.15);
      const s = Math.sin(polar);
      addScale({
        polar,
        azimuth,
        length: (0.022 + s * 0.012) * rng.range(0.95, 1.05),
        width: (0.032 + s * 0.01) * rng.range(0.95, 1.05),
        lit: Math.cos(polar) > 0.1,
      });
    }

    return mergeParts(parts);
  },
};
