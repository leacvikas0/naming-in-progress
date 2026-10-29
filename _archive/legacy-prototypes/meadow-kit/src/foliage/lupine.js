// Lupine — the vertical violet-blue spires. A slightly curved stem with
// 15-25 small three-lobed florets spiralling up its top 60% on the golden
// angle, shrinking toward the tip, plus palmate leaves near the base.
//
// Local space: base at the origin, growing +Y, ~0.8 units tall before
// finalizeGeometry() rescales it to exactly 1.0.

import { taperedPlane, tube, transform, combine, mergeParts } from "../core/geom.js";
import { speciesCol } from "../core/palette.js";
import { makeRng } from "../core/rng.js";
import { makeLeaf } from "./leaf.js";

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ~137.5 deg

export const spec = {
  id: "lupine",
  label: "Lupine",
  layer: "flower",
  material: "petal",
  density: 0.72,
  scale: [0.45, 0.72], // metres of actual height
  clump: 0.46,

  build({ seed = 1 } = {}) {
    const rng = makeRng((seed | 0) ^ 0x1b51ee);
    const C = (key) => speciesCol("lupine", key);

    const stemCol = C("stem");
    const stemTip = stemCol.clone().offsetHSL(-0.01, 0.05, 0.09);

    const parts = [];
    const H = rng.range(0.72, 0.85);

    // --- stem: tall, slender, a gentle lean and curve ----------------------
    const bendX = rng.range(-0.022, 0.022);
    const bendZ = rng.range(0.004, 0.022);

    // 1 in 4 plants is the blue variant instead of violet.
    const blue = rng.chance(0.25);
    const deep = blue ? C("blueFloret").clone().multiplyScalar(0.78) : C("floretDeep");
    const mid = blue ? C("blueFloret") : C("floret");
    const tip = blue ? C("blueTip") : C("floretTip");

    // Continuous colour along the spike: deep at the bottom, tip at the top.
    const colourAt = (u) => {
      const s = Math.min(1, Math.max(0, u));
      return s < 0.5
        ? deep.clone().lerp(mid, s * 2)
        : mid.clone().lerp(tip, (s - 0.5) * 2);
    };

    const spine = [
      [0, 0, 0],
      [bendX * 0.2, H * 0.28, bendZ * 0.2],
      [bendX * 0.55, H * 0.58, bendZ * 0.55],
      [bendX * 0.85, H * 0.82, bendZ * 0.85],
      [bendX, H, bendZ],
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
      geo: tube({ points: spine, radius: 0.0052, tubular: 9, radial: 4 }),
      color: stemCol,
      color2: stemTip,
      gradientPower: 0.7,
      sway: (t) => 0.04 + t * 0.8,
    });

    // --- the spike: florets spiralling up the top 60% of the stem ----------
    const floretCount = rng.int(18, 20);
    const spikeBottom = 0.31; // fraction of H where the raceme starts
    for (let i = 0; i < floretCount; i++) {
      const s = i / Math.max(1, floretCount - 1); // 0 at the bottom, 1 at the tip
      const f = spikeBottom + s * (1 - spikeBottom);
      const p = stemAt(f);

      // golden-angle spiral around the stem
      const angle = i * GOLDEN + rng.range(-0.08, 0.08);
      const outward = [Math.sin(angle), 0, Math.cos(angle)];

      // big and deep low down, small and pale at the tip
      const size = (0.058 - s * 0.03) * rng.range(0.94, 1.06);
      const tilt = 1.42 - s * 0.48; // face outward low down, upright at the tip
      const radial = 0.0025 + 0.0045 * (1 - s);
      const base = [
        p[0] + outward[0] * radial,
        p[1] + rng.range(-0.004, 0.004),
        p[2] + outward[2] * radial,
      ];

      const frame = transform({
        position: base,
        rotation: [tilt, angle, 0],
        order: "YXZ",
      });

      const tint = s * 0.85 + rng.range(-0.03, 0.03);
      const cBase = colourAt(tint);
      const cTip = colourAt(tint + 0.3);
      const floretSway = (t) => Math.min(0.97, 0.05 + s * 0.8 + t * 0.12);

      // A floret is a little five-petal bloom whose face looks radially out
      // from the stem: front florets show their faces to the camera, side
      // florets read as soft scallops on the spike silhouette. Rounded
      // "petal" tips, a deep cup and five lobes keep the raceme soft rather
      // than spiky; the petal at the top of the fan is the banner.
      const petalCount = 5;
      for (let j = 0; j < petalCount; j++) {
        const pa = Math.PI + (j / petalCount) * TAU + rng.range(-0.06, 0.06);
        const banner = j === 0;
        const len = size * (banner ? 1.08 : rng.range(0.88, 1.0));
        const wid = len * (banner ? 0.86 : 0.78);
        const lift = rng.range(0.05, 0.16);
        parts.push({
          geo: taperedPlane({
            length: len,
            widthBase: wid,
            widthCurve: "petal",
            segments: 4,
            crossSegments: 4,
            bend: -0.08,
            cup: 0.45,
          }),
          color: cBase,
          color2: cTip,
          gradientPower: 1.3,
          matrix: combine(
            frame,
            transform({ rotation: [Math.PI / 2 - lift, pa, 0], order: "YXZ" })
          ),
          sway: floretSway,
        });
      }
    }

    // --- 2-3 palmate leaves near the base ----------------------------------
    const leafCount = rng.int(2, 3);
    for (let i = 0; i < leafCount; i++) {
      const angle = i * (TAU / leafCount) + rng.range(-0.35, 0.35) + 0.35;
      const y = rng.range(0.02, 0.12);
      const petiole = rng.range(0.032, 0.055);
      const tipPos = [
        Math.sin(angle) * petiole * 0.72,
        y + petiole * 0.6,
        Math.cos(angle) * petiole * 0.72,
      ];

      parts.push({
        geo: tube({
          points: [[0, y, 0], tipPos],
          radius: 0.0028,
          tubular: 3,
          radial: 3,
        }),
        color: stemCol,
        color2: stemTip,
        sway: (t) => 0.08 + t * 0.42,
      });

      // palmate: five leaflets fanning out from the end of the petiole
      const leafletCount = 5;
      for (let j = 0; j < leafletCount; j++) {
        const leafletAngle =
          angle + (j / (leafletCount - 1) - 0.5) * 2.1 + rng.range(-0.08, 0.08);
        const len = rng.range(0.058, 0.085);
        parts.push(
          makeLeaf({
            length: len,
            width: len * 0.44,
            bend: -0.1,
            cup: 0.26,
            colour: stemCol,
            colourTip: stemTip,
            rng,
            position: tipPos,
            rotation: [rng.range(0.85, 1.1), leafletAngle, 0],
            segments: 4,
            crossSegments: 3,
            sway: (t) => 0.1 + t * 0.5,
          })
        );
      }
    }

    return mergeParts(parts);
  },
};
