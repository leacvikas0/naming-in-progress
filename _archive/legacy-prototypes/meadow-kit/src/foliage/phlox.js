// Phlox — the low, soft pink head of the meadow.
//
// A short stem carries a loose dome of six tiny five-petal florets. Each
// floret faces outward from the cluster so the whole thing reads as one
// rounded pink head rather than a handful of separate flowers.
//
// Structure mirrors daisy.js: build parts -> colour + sway per part -> merge.

import { taperedPlane, tube, dome, transform, combine, mergeParts } from "../core/geom.js";
import { speciesCol } from "../core/palette.js";
import { makeRng } from "../core/rng.js";

const TAU = Math.PI * 2;

export const spec = {
  id: "phlox",
  label: "Phlox",
  layer: "flower",
  material: "petal",
  density: 1.25,
  scale: [0.14, 0.24], // metres of actual height
  clump: 0.24,

  build({ seed = 1 } = {}) {
    const rng = makeRng((seed | 0) ^ 0x9f10c5);
    const C = (key) => speciesCol("phlox", key);
    const stemCol = C("stem");
    const stemLight = stemCol.clone().offsetHSL(0.01, 0.03, 0.12);
    const leafLight = stemCol.clone().offsetHSL(0.005, 0.02, 0.18);
    const parts = [];

    const cluster = [0.012, 0.5, 0.014];
    const sway = (t) => 0.04 + t * 0.85;

    // --- short stem --------------------------------------------------------
    parts.push({
      geo: tube({
        points: [[0, 0, 0], [0.005, 0.16, 0.005], [0.01, 0.34, 0.01], cluster],
        radius: 0.0055,
        tubular: 8,
        radial: 4,
      }),
      color: stemCol,
      color2: stemLight,
      gradientPower: 0.8,
      sway,
    });

    // --- a few small, narrow leaves, angled up and curled ----------------
    for (let i = 0; i < 4; i++) {
      const y = 0.09 + i * 0.095;
      const s0 = 0.04 + (y / cluster[1]) * 0.85;
      parts.push({
        geo: taperedPlane({
          length: rng.range(0.05, 0.075),
          widthBase: rng.range(0.012, 0.014),
          widthCurve: "leaf",
          segments: 3,
          crossSegments: 3,
          bend: 0.12,
          cup: 0.22,
        }),
        color: stemCol,
        color2: leafLight,
        gradientPower: 0.9,
        matrix: transform({
          position: [0.003 * i, y, 0.003 * i],
          rotation: [rng.range(0.72, 0.9), i * 2.4 + rng.range(-0.3, 0.3), 0],
          order: "YXZ",
        }),
        sway: (t) => s0 + t * (0.88 - s0),
      });
    }

    // --- receptacle: a small green calyx the florets sit on ---------------
    // Kept small and tucked under the florets — it should not read as a cup.
    parts.push({
      geo: dome({ radius: 0.019, height: 0.013, segments: 9 }),
      color: stemCol,
      color2: stemLight,
      gradientAxis: "z",
      matrix: combine(
        transform({ position: [cluster[0], cluster[1] - 0.012, cluster[2]] }),
        transform({ rotation: [-Math.PI / 2, 0, 0], order: "YXZ" })
      ),
      sway: 0.82,
    });

    // --- one five-petal floret, facing +Y of its frame --------------------
    // The frame's +Y is pointed along the outward direction d, so the petals
    // (which grow in the frame's XZ plane) form a disc facing outward.
    const addFloret = ({ azimuth, polar, radius, size }) => {
      const d = [
        Math.sin(polar) * Math.cos(azimuth),
        Math.cos(polar),
        Math.sin(polar) * Math.sin(azimuth),
      ];
      const yaw = Math.atan2(Math.cos(azimuth), Math.sin(azimuth));
      const frame = transform({
        position: [
          cluster[0] + d[0] * radius,
          cluster[1] + d[1] * radius,
          cluster[2] + d[2] * radius,
        ],
        rotation: [polar, yaw, 0],
        scale: [size, size, size],
        order: "YXZ",
      });

      const petalCount = 5;
      for (let i = 0; i < petalCount; i++) {
        const lift = rng.range(0.1, 0.17);
        const local = transform({
          rotation: [Math.PI / 2 - lift, (i / petalCount) * TAU + rng.range(-0.05, 0.05), 0],
          order: "YXZ",
        });
        parts.push({
          geo: taperedPlane({
            length: rng.range(0.03, 0.037),
            widthBase: rng.range(0.024, 0.028),
            widthCurve: "petal",
            segments: 5,
            crossSegments: 5,
            bend: -0.05,
            cup: 0.2,
            ruffle: 0.03,
          }),
          color: C("petal"),
          color2: C("petalTip"),
          gradientPower: 1.25,
          matrix: combine(frame, local),
          sway: (t) => 0.55 + t * 0.4,
        });
      }

      // tiny pale centre
      parts.push({
        geo: dome({ radius: 0.0062, height: 0.0032, segments: 7 }),
        color: C("center"),
        matrix: combine(frame, transform({ rotation: [-Math.PI / 2, 0, 0], order: "YXZ" })),
        sway: 0.9,
      });
    };

    // Seven florets packed over the top of the cluster: one closes the crown,
    // the rest ring the sides at staggered azimuths. Tight and low, so the head
    // reads as one rounded mass of small flowers rather than a loose spray.
    const polars = [0.1, 0.36, 0.54, 0.72, 0.88, 1.02, 1.15];
    for (let i = 0; i < polars.length; i++) {
      addFloret({
        azimuth: i * 2.39996 + rng.range(-0.2, 0.2),
        polar: polars[i] + rng.range(-0.04, 0.04),
        radius: (i === 0 ? 0.018 : 0.028) + rng.range(-0.003, 0.003),
        size: rng.range(0.96, 1.04),
      });
    }

    return mergeParts(parts);
  },
};
