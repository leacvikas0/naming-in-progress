// Broad-leaf plantain — the lush foreground foliage.
//
// A rosette of 6–7 broad, oblong leaves radiating from one point. They rise,
// arch outward and flatten at the tip. Width at the middle is ~60% of length
// and the tip is blunt, not pointed: a plantain leaf is a paddle, not a
// dagger. The leaves overlap near the base, so from above the clump reads as a
// mass of green rather than a star of blades.
//
// Each leaf carries a narrow raised midrib that follows the same centreline,
// sitting just proud of the surface. It is only ~8% of the leaf width and
// barely lighter than the blade, so it reads as a ridge rather than a stripe.

import { makeBlade, makeClump, gradient3, mix } from "./grassBlade.js";
import { speciesCol } from "../core/palette.js";
import { makeRng } from "../core/rng.js";

export const spec = {
  id: "broadLeaf",
  label: "Broad-leaf plantain",
  layer: "grass",
  material: "leaf",
  density: 1.55,
  scale: [0.42, 0.85], // metres of actual height
  clump: 0.34,

  build({ seed = 1 } = {}) {
    const rng = makeRng((seed | 0) ^ 0xb10a);
    const C = (key) => speciesCol("broadLeaf", key);

    // base -> mid -> tip. The root end is nearly the darkest green in the
    // palette so the rosette has weight where it meets the ground.
    const leafRamp = gradient3(C("base"), C("mid"), C("tip"), { mid: 0.55, power: 0.8 });
    // The midrib is only a shade off the blade — a lighter band at the
    // strongest, sinking back into leaf colour at both ends.
    const veinRamp = gradient3(
      mix(C("mid"), C("vein"), 0.4),
      mix(C("mid"), C("vein"), 0.85),
      mix(C("tip"), C("vein"), 0.35),
      { mid: 0.5, power: 0.9 }
    );

    return makeClump({
      rng,
      count: rng.int(6, 7),
      radius: 0.012,
      radiusJitter: 0.9,
      spread: 0.24,
      spreadJitter: 0.5,
      angleJitter: 0.24,
      sway: (t) => 0.05 + t * 0.55,
      makePart: ({ rng }) => {
        const length = rng.range(0.6, 0.95);
        const width = length * rng.range(0.52, 0.66);

        const blade = {
          length,
          width,
          widthCurve: "petal", // rounded, blunt tip
          segments: 8,
          crossSegments: 5,
          bend: rng.range(-0.34, -0.16), // negative = arches away from the face
          cup: rng.range(0.05, 0.1), // just enough fold to catch the ramp
          ruffle: rng.range(0.015, 0.035),
          arc: -rng.range(0.05, 0.25),
          roll: rng.range(-0.25, 0.25),
          twist: rng.range(-0.12, 0.12),
        };

        // Same curve, same roll: a narrow ridge riding on the leaf's own
        // centreline. "leaf" profile so it fades out at both ends instead of
        // ending in a cut edge.
        const veinGeo = makeBlade({
          ...blade,
          width: width * 0.08,
          widthCurve: "leaf",
          crossSegments: 3,
          cup: -0.15,
          ruffle: 0,
        });
        veinGeo.translate(0, 0, 0.003);

        return [
          { geo: makeBlade(blade), colorFn: leafRamp },
          { geo: veinGeo, colorFn: veinRamp },
        ];
      },
    });
  },
};
