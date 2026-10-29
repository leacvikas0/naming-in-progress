// Cosmos — the tall pink accent of the meadow.
//
// A slender stem with feathery, thread-like leaves and two nodding blooms.
// The signature is the petal: broad, slightly overlapping, and NOTCHED at the
// tip. The notch is built from two splayed lobes per petal (a width profile
// alone would only give a pointed tip, not the cosmos V).
//
// Structure mirrors daisy.js: build parts -> colour + sway per part -> merge.

import { taperedPlane, tube, dome, transform, combine, mergeParts } from "../core/geom.js";
import { speciesCol } from "../core/palette.js";
import { makeRng } from "../core/rng.js";

const TAU = Math.PI * 2;

export const spec = {
  id: "cosmos",
  label: "Cosmos",
  layer: "flower",
  material: "petal",
  density: 0.66,
  scale: [0.38, 0.6], // metres of actual height
  clump: 0.36,

  build({ seed = 1 } = {}) {
    const rng = makeRng((seed | 0) ^ 0xc05a05);
    const C = (key) => speciesCol("cosmos", key);
    const stemCol = C("stem");
    const stemLight = stemCol.clone().offsetHSL(0.015, 0.04, 0.1);
    const leafLight = stemCol.clone().offsetHSL(0.005, 0.03, 0.16);
    const parts = [];

    const headY = 0.72; // top of the main stem, local space
    const mainTop = [0.02, headY, 0.035];
    const sideTop = [-0.085, 0.555, 0.045];

    // --- main stem: tall, thin, a gentle S --------------------------------
    parts.push({
      geo: tube({
        points: [[0, 0, 0], [0.006, 0.24, 0.007], [0.015, 0.48, 0.02], mainTop],
        radius: 0.0062,
        tubular: 9,
        radial: 4,
      }),
      color: stemCol,
      color2: stemLight,
      gradientPower: 0.8,
      sway: (t) => 0.05 + t * 0.9,
    });

    // --- side branch carrying the second, smaller bloom -------------------
    parts.push({
      geo: tube({
        points: [[0.013, 0.43, 0.018], [-0.03, 0.49, 0.028], sideTop],
        radius: 0.0046,
        tubular: 6,
        radial: 4,
      }),
      color: stemCol,
      color2: stemLight,
      gradientPower: 0.8,
      sway: (t) => 0.6 + t * 0.32,
    });

    // --- feathery leaves: a thin rachis with three pairs of threadlets -----
    const addLeaf = ({ y, angle, size }) => {
      const frame = transform({ position: [0, y, 0], rotation: [1.12, angle, 0], order: "YXZ" });
      const s0 = 0.05 + (y / headY) * 0.9;
      const sway = (t) => s0 + t * (0.92 - s0);
      const L = 0.19 * size;
      parts.push({
        geo: taperedPlane({
          length: L,
          widthBase: 0.016 * size,
          widthTip: 0.004,
          widthCurve: "blade",
          segments: 4,
          crossSegments: 3,
          bend: 0.18,
        }),
        color: stemCol,
        color2: leafLight,
        gradientPower: 0.85,
        matrix: frame,
        sway,
      });
      for (let k = 0; k < 3; k++) {
        const t = 0.3 + k * 0.2;
        for (const side of [-1, 1]) {
          const len = (0.085 - k * 0.016) * size * rng.range(0.85, 1.08);
          const local = transform({
            position: [0, L * t, 0],
            rotation: [0, 0, side * (1.12 + k * 0.06)],
            order: "XYZ",
          });
          parts.push({
            geo: taperedPlane({
              length: len,
              widthBase: 0.011 * size,
              widthCurve: "leaf",
              segments: 3,
              crossSegments: 3,
              bend: 0.22,
              cup: 0.15,
            }),
            color: stemCol,
            color2: leafLight,
            gradientPower: 0.9,
            matrix: combine(frame, local),
            sway,
          });
        }
      }
    };

    addLeaf({ y: 0.065, angle: 0.55 + rng.range(-0.2, 0.2), size: 1 });
    addLeaf({ y: 0.155, angle: 2.7 + rng.range(-0.2, 0.2), size: 0.9 });
    addLeaf({ y: 0.25, angle: 4.9 + rng.range(-0.2, 0.2), size: 0.76 });

    // --- flower heads ------------------------------------------------------
    // One petal = two broad lobes splayed apart in the petal plane. Their
    // inner edges meet near the base and separate at the tip, which leaves
    // the V notch that makes a cosmos a cosmos.
    const addPetal = (head, { angle, lift, length, width }) => {
      const petalFrame = transform({
        rotation: [Math.PI / 2 - lift, angle, 0],
        order: "YXZ",
      });
      for (const side of [-1, 1]) {
        // Broad lobes that overlap for most of their length: the pair reads as
        // ONE petal, with the notch opening only at the very tip.
        const lobeW = width * rng.range(0.58, 0.64);
        const lobeL = length * rng.range(0.95, 1.02) * (side > 0 ? 1 : 0.97);
        const local = transform({
          position: [side * 0.005, 0, side * 0.0006],
          rotation: [0, 0, side * 0.13],
          order: "XYZ",
        });
        parts.push({
          geo: taperedPlane({
            length: lobeL,
            widthBase: lobeW,
            segments: 5,
            crossSegments: 5,
            bend: -0.1,
            cup: rng.range(0.2, 0.3),
            ruffle: 0.05,
            // widest just past the middle, blunt at both ends: a lobe, not a point
            profile: (t) => lobeW * (0.33 + 0.67 * Math.sin(Math.PI * Math.pow(t, 1.25))),
          }),
          color: C("petal"),
          color2: C("petalTip"),
          gradientPower: 1.35,
          matrix: combine(head, combine(petalFrame, local)),
          sway: (t) => 0.7 + t * 0.3,
        });
      }
    };

    const addHead = ({ position, tilt, petalCount, petalLength, petalWidth, domeRadius, domeHeight }) => {
      const head = transform({ position, rotation: [tilt, 0, 0], order: "YXZ" });
      for (let i = 0; i < petalCount; i++) {
        addPetal(head, {
          angle: (i / petalCount) * TAU + rng.range(-0.045, 0.045),
          lift: rng.range(0.11, 0.21),
          length: petalLength * rng.range(0.94, 1.04),
          width: petalWidth * rng.range(0.94, 1.04),
        });
      }
      // golden disc, shaded darker at the rim
      parts.push({
        geo: dome({ radius: domeRadius, height: domeHeight, segments: 14 }),
        color: C("centerShade"),
        color2: C("center"),
        gradientAxis: "z",
        matrix: combine(head, transform({ rotation: [-Math.PI / 2, 0, 0], order: "YXZ" })),
        sway: 0.9,
      });
      // green calyx tucked behind the head
      parts.push({
        geo: dome({ radius: domeRadius * 1.15, height: domeHeight * 1.25, segments: 10 }),
        color: stemCol,
        color2: stemLight,
        gradientAxis: "z",
        matrix: combine(head, transform({ rotation: [Math.PI / 2, 0, 0], order: "YXZ" })),
        sway: 0.85,
      });
    };

    addHead({
      position: mainTop,
      tilt: 0.3,
      petalCount: 8,
      petalLength: 0.098,
      petalWidth: 0.096,
      domeRadius: 0.029,
      domeHeight: 0.014,
    });

    addHead({
      position: sideTop,
      tilt: 0.36,
      petalCount: 8,
      petalLength: 0.072,
      petalWidth: 0.072,
      domeRadius: 0.022,
      domeHeight: 0.011,
    });

    return mergeParts(parts);
  },
};
