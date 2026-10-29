// Butterflies — five of them, no more.
//
// Garnish, not a feature. Each butterfly is a tiny three-part rig (a body and
// two wing pairs) riding a lazy closed loop around a seeded anchor, with the
// wings flapping on a fast sine about the body axis.
//
// The flap is CPU work, and deliberately so: five butterflies is fifteen small
// matrices a frame — nothing next to the instanced field. A shader flap would
// have to encode two mirror-image hinges in one geometry for no measurable gain.
//
// Local frame: +Z forward, +Y up, +X right. Wings lie in the XZ plane and
// rotate about Z, so a positive angle lifts the left wing and drops the right.

import * as THREE from "three";
import { taperedPlane, tube, transform, combine, mergeParts } from "../core/geom.js";
import { makeRng } from "../core/rng.js";
import { speciesCol } from "../core/palette.js";
import { createWind } from "../core/wind.js";
import { createMaterialFactory } from "../core/materials.js";

const TAU = Math.PI * 2;

// --- tuning ----------------------------------------------------------------
const FLAP_AMP = 0.62; // radians either side of the rest angle
const FLAP_REST = 0.12; // resting dihedral
const FLAP_HZ = [8.2, 11.6]; // per-butterfly wingbeat, 8-12 Hz as specced
const LOOP = [0.34, 0.62]; // metres of loop radius
const RATE = [0.14, 0.26]; // rad/s around the loop — one lap per 24-45 s
const SIZE = [0.86, 1.0]; // per-butterfly scale of the authored geometry
const PINK_SHARE = 0.72; // the rest use the `.wingAlt` variant

// A wing is authored growing +Y, then laid flat:
//   +Y -> +X (span), +X -> +Z (chord), +Z -> +Y (face up).
// Ry(sweep) then swings it fore or aft inside that plane.
const LAY_FLAT = transform({ rotation: [-Math.PI / 2, 0, -Math.PI / 2], order: "YXZ" });

const FORE = {
  length: 0.03,
  width: 0.021,
  sweep: -0.34, // forward: the forewing reaches ahead of the body
  root: [0.004, 0.0022, 0.0045],
  cup: 0.14,
  bend: 0.07,
};

const HIND = {
  length: 0.023,
  width: 0.017,
  sweep: 0.52, // aft: the hindwing trails behind
  root: [0.0035, 0.0018, -0.0055],
  cup: 0.1,
  bend: 0.04,
};

function wingMatrix({ root, sweep, mirror }) {
  const placed = combine(
    transform({ position: root }),
    combine(transform({ rotation: [0, sweep, 0] }), LAY_FLAT)
  );
  // Mirroring is baked into the geometry (never a negative mesh scale), so the
  // right wing is a true mirror of the left rather than a rotated copy.
  return mirror ? combine(transform({ scale: [-1, 1, 1] }), placed) : placed;
}

/** One side of a butterfly: forewing + hindwing welded into one strip pair. */
function buildWing({ colours, mirror = false }) {
  return mergeParts([
    {
      geo: taperedPlane({
        length: FORE.length,
        widthBase: FORE.width,
        widthCurve: "petal",
        segments: 3,
        crossSegments: 3,
        cup: FORE.cup,
        bend: FORE.bend,
      }),
      color: colours.wing,
      color2: colours.tip,
      gradientPower: 1.3,
      matrix: wingMatrix({ ...FORE, mirror }),
      sway: 0,
    },
    {
      geo: taperedPlane({
        length: HIND.length,
        widthBase: HIND.width,
        widthCurve: "petal",
        segments: 3,
        crossSegments: 3,
        cup: HIND.cup,
        bend: HIND.bend,
      }),
      color: colours.wing,
      color2: colours.tip,
      gradientPower: 1.6,
      matrix: wingMatrix({ ...HIND, mirror }),
      sway: 0,
    },
  ]);
}

function buildBody({ colours }) {
  return mergeParts([
    {
      geo: tube({
        points: [
          [0, -0.013, 0],
          [0, 0.0004, 0.001],
          [0, 0.001, 0.012],
        ],
        radius: 0.0023,
        tubular: 3,
        radial: 3,
      }),
      color: colours.body,
      color2: colours.bodyLit,
      gradientAxis: "z",
      sway: 0,
    },
  ]);
}

/**
 * @param {object} o
 * @param {object} o.config    resolved config from resolveConfig()
 * @param {object} o.scatter   from createScatter()
 * @param {Function} o.heightAt  ground height sampler
 * @param {object} [o.materials] shared material factory; a private one is
 *                               built when omitted so the module runs alone
 * @returns {{group: THREE.Group, update: Function, dispose: Function}}
 */
export function createButterflies({ config, scatter, heightAt, materials } = {}) {
  const spec = config.recipe.species.butterflies ?? {};
  const count = Math.max(0, spec.count | 0);
  const height = spec.height ?? [0.5, 1.4];

  const wind = materials ? null : createWind(config);
  const factory = materials || createMaterialFactory({ config, wind });
  const ownsMaterials = !materials;

  const group = new THREE.Group();
  group.name = "meadow:butterflies";

  const geometries = [];

  function dispose() {
    for (const g of geometries) g.dispose();
    group.clear();
    group.removeFromParent();
    if (ownsMaterials) factory.dispose();
  }

  if (count === 0) return { group, update() {}, dispose };

  // --- geometry: two colour variants, shared by all five butterflies ---------
  const wing = speciesCol("butterfly", "wing");
  const wingTip = speciesCol("butterfly", "wingTip");
  const wingAlt = speciesCol("butterfly", "wingAlt");
  const bodyCol = speciesCol("butterfly", "body");
  // The body is a dark brown tube; a lighter head end keeps it from reading as
  // a black dash. Derived, not a new hex.
  const bodyLit = bodyCol.clone().offsetHSL(-0.02, -0.06, 0.14);

  const variants = [
    { wing, tip: wingTip },
    { wing: wingAlt, tip: wingTip },
  ].map((colours) => {
    const left = buildWing({ colours, mirror: false });
    const right = buildWing({ colours, mirror: true });
    geometries.push(left, right);
    return { left, right };
  });

  const bodyGeometry = buildBody({ colours: { body: bodyCol, bodyLit } });
  geometries.push(bodyGeometry);

  // One toon material for every part: colours are baked into vertex colours, so
  // the body, the pink wings and the amber wings all share the draw state. It
  // is double-sided already, which is what a paper-thin wing needs.
  const material = factory.get("wing");

  // --- instances ------------------------------------------------------------
  const anchors = scatter.samplePoints(count, {
    minY: height[0],
    maxY: height[1],
    heightAt,
  });

  const rng = makeRng(config.seed ^ 0xb077e2);
  const halfW = config.area.width / 2;
  const halfD = config.area.depth / 2;

  const butterflies = [];

  for (let i = 0; i < anchors.length; i++) {
    const p = anchors[i];
    const loop = rng.range(LOOP[0], LOOP[1]);

    const root = new THREE.Group();
    root.name = `butterfly:${i}`;
    root.scale.setScalar(rng.range(SIZE[0], SIZE[1]));
    root.rotation.order = "YXZ";

    const variant = variants[rng.next() < PINK_SHARE ? 0 : 1];
    const wingL = new THREE.Mesh(variant.left, material);
    const wingR = new THREE.Mesh(variant.right, material);
    const body = new THREE.Mesh(bodyGeometry, material);
    wingL.name = "wingL";
    wingR.name = "wingR";
    body.name = "body";
    root.add(body, wingL, wingR);

    butterflies.push({
      root,
      wingL,
      wingR,
      // Loop geometry. Anchors are pulled inward so the whole loop stays over
      // the meadow instead of hanging off the edge.
      ax: THREE.MathUtils.clamp(p.x, -halfW + loop, halfW - loop),
      az: THREE.MathUtils.clamp(p.z, -halfD + loop, halfD - loop),
      ay: p.y,
      phase: p.phase,
      radiusX: loop,
      radiusZ: loop * rng.range(0.75, 1.15),
      rate: rng.range(RATE[0], RATE[1]),
      bob: rng.range(0.08, 0.16),
      flapHz: rng.range(FLAP_HZ[0], FLAP_HZ[1]),
      flapPhase: rng.range(0, TAU),
      pitch: rng.range(0.08, 0.16),
    });

    group.add(root);
  }

  // --- animation ------------------------------------------------------------
  function update(time) {
    if (wind) wind.update(time);

    for (let i = 0; i < butterflies.length; i++) {
      const b = butterflies[i];

      // A slow closed loop: a circle in XZ with a small figure-eight wobble,
      // and a two-per-lap rise and dip so it rides the air.
      const ang = b.phase + time * b.rate;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const ride = ang * 2 + b.phase;

      b.root.position.set(
        b.ax + cos * b.radiusX + Math.sin(ride) * b.radiusX * 0.1,
        b.ay + Math.sin(ride) * b.bob + Math.sin(time * 0.8 + b.phase) * b.bob * 0.3,
        b.az + sin * b.radiusZ
      );

      // Heading from the analytic velocity (the common `rate` cancels), so the
      // butterfly always faces the way it is actually travelling.
      const vx = -sin * b.radiusX + Math.cos(ride) * b.radiusX * 0.2;
      const vz = cos * b.radiusZ;
      // Nose up while climbing. Positive rotation.x pitches the nose down.
      const pitch = -Math.cos(ride) * b.pitch;
      b.root.rotation.set(pitch, Math.atan2(vx, vz), 0);

      // The wingbeat: a sine plus a touch of second harmonic, which makes the
      // downstroke read faster than the recovery without a second curve.
      const beat = time * b.flapHz * TAU + b.flapPhase;
      const flap = Math.sin(beat) + 0.18 * Math.sin(beat * 2);
      const lift = FLAP_REST + flap * FLAP_AMP;
      b.wingL.rotation.z = lift;
      b.wingR.rotation.z = -lift;
    }
  }

  update(0);

  return { group, update, dispose };
}
