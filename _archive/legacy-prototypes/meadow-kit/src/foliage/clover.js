// White clover — the low pale pom-poms that fill the gaps in the meadow.
//
// Structure follows daisy.js. Deliberately short and wide: the stem only
// reaches 0.27 local units and a three-lobed leaf spreads out below it, so
// after finalizeGeometry() normalises the height the plant reads as a low
// clump rather than a stem with a flower on top.
//
// Local space: base at the origin, growing +Y, ~0.32 units tall before
// finalizeGeometry() rescales it to exactly 1.0.

import { taperedPlane, tube, dome, transform, combine, mergeParts } from "../core/geom.js";
import { speciesCol } from "../core/palette.js";
import { makeRng } from "../core/rng.js";

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // 2.39996 — even sphere distribution

/** A palette colour, nudged. Never invents a hex. */
function shade(color, { h = 0, s = 0, l = 0, mul = 1 } = {}) {
  const c = color.clone();
  if (h || s || l) c.offsetHSL(h, s, l);
  if (mul !== 1) c.multiplyScalar(mul);
  return c;
}

/**
 * Rounded lobe profile for a floret: half width at the base, widest at 55%,
 * elliptical (not blunt, not pointed) at the tip. Lay a few dozen of these
 * over a ball and the silhouette stays soft instead of faceted.
 */
function lobe(width) {
  return (t) => {
    if (t < 0.55) return width * (0.5 + 0.5 * Math.sin((Math.PI / 2) * (t / 0.55)));
    const u = (t - 0.55) / 0.45;
    return width * Math.sqrt(Math.max(0, 1 - u * u));
  };
}

export const spec = {
  id: "clover",
  label: "White clover",
  layer: "flower",
  material: "leaf",
  density: 1.9,
  scale: [0.1, 0.18], // metres of actual height
  clump: 0.26,

  build({ seed = 1 } = {}) {
    const rng = makeRng((seed | 0) ^ 0xc10e3);
    const C = (key) => speciesCol("clover", key);
    const parts = [];

    const stemH = 0.27;
    const headPos = [0.012, stemH, 0.01];
    const stemLight = shade(C("stem"), { l: 0.12 });

    // --- stem: short, so the whole plant stays low -------------------------
    parts.push({
      geo: tube({
        points: [
          [0, 0, 0],
          [0.004, stemH * 0.45, 0.004],
          [0.009, stemH * 0.8, 0.008],
          headPos,
        ],
        radius: 0.0052,
        tubular: 6,
        radial: 4,
      }),
      color: C("stem"),
      color2: stemLight,
      sway: (t) => 0.04 + t * 0.7,
    });

    // --- three-lobed leaf: three rounded leaflets from one point ----------
    // Lifted off the ground on a short petiole, leaflets broad and rounded,
    // and their bases run past the meeting point so the centre is solid
    // instead of three points touching — a clover leaf, not a starfish.
    const node = [-0.045, 0.1, 0.02];
    parts.push({
      geo: tube({
        points: [
          [0.002, 0.012, 0],
          [-0.018, 0.05, 0.008],
          node,
        ],
        radius: 0.0038,
        tubular: 4,
        radial: 3,
      }),
      color: C("stem"),
      color2: stemLight,
      sway: (t) => 0.04 + t * 0.55,
    });

    const leafBase = rng.range(0, TAU);
    const leafLight = shade(C("stem"), { l: 0.16 });
    for (let i = 0; i < 3; i++) {
      const yaw = leafBase + (i / 3) * TAU + rng.range(-0.1, 0.1);
      const tilt = Math.PI / 2 - rng.range(0.06, 0.18); // slightly raised
      // start a little behind the node so the three leaflets overlap there
      const back = 0.014;
      parts.push({
        geo: taperedPlane({
          length: rng.range(0.11, 0.12),
          widthBase: rng.range(0.095, 0.105),
          widthCurve: "petal",
          segments: 5,
          crossSegments: 5,
          cup: 0.34,
          bend: 0.12,
        }),
        color: C("stem"),
        color2: leafLight,
        gradientPower: 0.9,
        matrix: transform({
          position: [node[0] - Math.sin(yaw) * back, node[1], node[2] - Math.cos(yaw) * back],
          rotation: [tilt, yaw, 0],
          order: "YXZ",
        }),
        sway: (t) => 0.04 + t * 0.7,
      });
    }

    // --- flower head: a pom-pom of tiny florets packed into a ball ---------
    const head = transform({ position: headPos });

    // A pale core carries the ball silhouette and stops the head showing
    // through between florets; the florets cover it almost completely.
    const CORE_R = 0.036;
    const CORE_H = 0.028;
    const AXES = [
      [0, 0, 0], // +Z
      [0, Math.PI, 0], // -Z
      [0, Math.PI / 2, 0], // +X
      [0, -Math.PI / 2, 0], // -X
      [-Math.PI / 2, 0, 0], // +Y
      [Math.PI / 2, 0, 0], // -Y
    ];
    for (const rot of AXES) {
      parts.push({
        geo: dome({ radius: CORE_R, height: CORE_H, segments: 14 }),
        color: C("petal"),
        color2: shade(C("petal"), { mul: 0.86 }),
        gradientAxis: "z",
        matrix: combine(head, transform({ rotation: rot, order: "YXZ" })),
        sway: 0.85,
      });
    }

    // Florets: many small rounded lobes packed over the ball, each lying on
    // the surface with its face outward and wrapping with the curvature.
    // Heavy overlap is the point — no single petal may break the silhouette,
    // so the head reads as a soft pom-pom from any angle.
    const floretCount = rng.int(16, 20);
    for (let i = 0; i < floretCount; i++) {
      const v = 1 - ((i + 0.5) * 2) / floretCount; // 1 .. -1
      const r = Math.sqrt(Math.max(0, 1 - v * v));
      const phi = i * GOLDEN + rng.range(-0.2, 0.2);
      const dx = r * Math.cos(phi);
      const dz = r * Math.sin(phi);
      // Euler angles that point the floret's face (+Z) along the radius while
      // its length (+Y) runs along the surface. roll ~ 0 lays the lobe upward
      // along the ball, which is how a clover head's florets layer.
      const pitch = -Math.asin(Math.max(-1, Math.min(1, v)));
      const yaw = Math.PI / 2 - phi;
      const roll = rng.range(-0.4, 0.4);
      const width = rng.range(0.038, 0.045);
      parts.push({
        geo: taperedPlane({
          length: rng.range(0.028, 0.034),
          widthBase: width,
          profile: lobe(width),
          segments: 3,
          crossSegments: 3,
          cup: 0.18,
          bend: -0.5,
        }),
        color: C("petal"),
        color2: C("petalTip"),
        gradientPower: 2.4, // only the top face catches petalTip
        matrix: combine(
          head,
          transform({
            position: [dx * 0.037, v * 0.037, dz * 0.037],
            rotation: [pitch, yaw, roll],
            order: "YXZ",
          })
        ),
        sway: (t) => 0.72 + t * 0.18,
      });
    }

    return mergeParts(parts);
  },
};
