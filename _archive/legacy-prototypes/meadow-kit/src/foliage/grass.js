// Meadow grass — the base layer of the whole pack.
//
// A tuft of 7–9 blades from a base radius of about 2.5 cm, splayed around the
// full circle, every blade with its own height, width, curl, roll and twist.
// Nothing here is a starfish: the blades are mostly upright, the outward lean
// stays under ~30°, and the per-blade roll means no two present the same face
// to the light.
//
// One in five blades is sun-bleached (dryTip) instead of green — that is what
// keeps a field of this from reading as flat green paint.

import { makeBlade, makeClump, gradient3, mix } from "./grassBlade.js";
import { speciesCol } from "../core/palette.js";
import { makeRng } from "../core/rng.js";

export const spec = {
  id: "grass",
  label: "Meadow grass",
  layer: "grass",
  material: "grass",
  density: 9.0,
  scale: [0.3, 0.55], // metres of actual height
  clump: 0.28,

  build({ seed = 1 } = {}) {
    const rng = makeRng((seed | 0) ^ 0x6a55);
    const C = (key) => speciesCol("grass", key);

    // Root stays dark on both ramps; only the tip changes for a bleached blade.
    // The dry tip is pulled halfway back to the green tip: at full strength a
    // tan blade on a 3%-wide ribbon reads as a dead stick.
    const green = gradient3(C("base"), C("mid"), C("tip"), { mid: 0.52, power: 0.85 });
    const dry = gradient3(C("base"), C("mid"), mix(C("tip"), C("dryTip"), 0.55), {
      mid: 0.6,
      power: 0.9,
    });

    // Narrow collar, then width held almost constant to t=0.8, then a rounded
    // blunt tip. A linear taper to a point is what makes a field of these read
    // as agave spikes; meadow grass is a ribbon that stops, not a dagger.
    // (taperedPlane's `profile` is an absolute width, so it gets `w`.)
    const bladeProfile = (w) => (t) => {
      if (t < 0.18) return w * (0.55 + 0.45 * (t / 0.18));
      if (t < 0.8) return w * (1 - 0.1 * ((t - 0.18) / 0.62));
      const u = (t - 0.8) / 0.2;
      return w * 0.9 * (1 - 0.7 * u * u);
    };

    return makeClump({
      rng,
      count: rng.int(12, 15),
      radius: 0.03,
      radiusJitter: 0.85,
      spread: 0.2,
      spreadJitter: 0.6,
      angleJitter: 0.42,
      sway: (t) => 0.02 + t * 0.98,
      makePart: ({ rng }) => {
        // a tuft is short blades and tall blades, not one height: the
        // shortest here is about half the tallest
        const length = rng.range(0.45, 0.95);
        const tall = (length - 0.45) / 0.5; // 0 = shortest, 1 = tallest
        // 3–4% of length, so the blade is a ribbon at every size
        const width = length * rng.range(0.03, 0.042);

        return {
          geo: makeBlade({
            length,
            width,
            profile: bladeProfile(width),
            segments: 5,
            crossSegments: 3,
            cup: rng.range(0.25, 0.5),
            bend: rng.range(-0.16, -0.03),
            lean: rng.range(-0.1, 0.08),
            // negative = away from the face normal, i.e. arching out of the
            // tuft and falling over rather than curling back over the centre.
            // The short blades carry most of the arch, so the tall ones stay
            // up and the silhouette is a fountain instead of a splayed star.
            arc: -(0.12 + (1 - tall) * 0.55),
            roll: rng.range(-0.6, 0.6),
            twist: rng.range(-0.35, 0.35),
          }),
          colorFn: rng.chance(0.2) ? dry : green,
        };
      },
    });
  },
};
