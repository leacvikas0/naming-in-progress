// Drifting petals and pollen — the dust in the light.
//
// Atmosphere, not geometry. ~190 flakes, four triangles each, riding the wind
// in one InstancedMesh. They are meant to be *almost* invisible: if you can
// count them, the opacity is too high.
//
// Two rules keep this cheap and predictable:
//
//   1. One InstancedMesh, one draw call. Per-mote colour rides on
//      instanceColor rather than a second material.
//   2. Position is a pure function of `time` — never an accumulator. Pausing,
//      seeking or stepping the clock lands exactly where a real-time run would,
//      and a dropped frame cannot make the field lurch.
//
// The flakes wrap inside the meadow bounds, so the wind carries them across the
// field forever instead of sweeping them off the edge.

import * as THREE from "three";
import { mergeParts, taperedPlane, transform, combine } from "../core/geom.js";
import { makeRng } from "../core/rng.js";
import { speciesCol } from "../core/palette.js";
import { createWind } from "../core/wind.js";
import { createMaterialFactory } from "../core/materials.js";

const TAU = Math.PI * 2;

// --- tuning (metres, seconds, radians) --------------------------------------
const DRIFT = 0.16; // downwind metres per second at the scatter's speed 1
const CROSS_WIND = 0.55; // rad/s of the sideways wander
const BOB = 0.8; // rad/s of the vertical bob
const BOB_GAIN = 0.6; // bob amplitude as a fraction of the mote's wobble
const SPIN = [0.45, 0.8, 0.45]; // max tumble rate per axis (rad/s)
const OPACITY = 0.3; // one material, so one opacity for the whole field

/** Wrap a coordinate into [-half, half). */
function wrap(v, half) {
  const span = half * 2;
  return (((v + half) % span) + span) % span - half;
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
export function createMotes({ config, scatter, heightAt, materials } = {}) {
  const spec = config.recipe.species.motes ?? {};
  const count = Math.max(0, spec.count | 0);
  const height = spec.height ?? [0.4, 2.6];
  const size = spec.size ?? [0.012, 0.036];

  // The meadow hands us its shared factory. When this module is used on its
  // own (tests, previews) build a private one so it still works.
  const wind = materials ? null : createWind(config);
  const factory = materials || createMaterialFactory({ config, wind });
  const ownsMaterials = !materials;

  const group = new THREE.Group();
  group.name = "meadow:motes";

  const geometries = [];
  const ownedMaterials = [];

  function dispose() {
    for (const g of geometries) g.dispose();
    for (const m of ownedMaterials) m.dispose();
    group.clear();
    group.removeFromParent();
    if (ownsMaterials) factory.dispose();
  }

  if (count === 0) return { group, update() {}, dispose };

  // --- geometry: two crossed slivers, 4 triangles ---------------------------
  // Flat on purpose: the material is unlit, so only the silhouette reads. Two
  // slivers at right angles mean a mote never disappears when it turns edge-on.
  const sliver = () =>
    taperedPlane({
      length: 1,
      widthBase: 0.62,
      widthTip: 0.3,
      widthCurve: "blade",
      segments: 1,
      crossSegments: 2,
    });

  const centre = transform({ position: [0, -0.5, 0] });
  const geometry = mergeParts([
    { geo: sliver(), matrix: centre, sway: 0 },
    {
      geo: sliver(),
      matrix: combine(transform({ rotation: [0, Math.PI / 2, 0] }), centre),
      sway: 0,
    },
  ]);
  geometries.push(geometry);

  // --- material -------------------------------------------------------------
  // `mote` is a transparent MeshBasicMaterial with depthWrite off — exactly
  // right for dust. Per-mote tint needs instanceColor, and three only folds
  // instanceColor into the fragment when the material declares vertex colours,
  // so clone the shared material and switch that on. mergeParts already gave
  // the geometry a white `color` attribute, so the tint is all that shows.
  const material = factory.get("mote", { color: "#ffffff", opacity: OPACITY }).clone();
  material.vertexColors = true;
  material.needsUpdate = true;
  ownedMaterials.push(material);

  // --- instances ------------------------------------------------------------
  const points = scatter.samplePoints(count, {
    minY: height[0],
    maxY: height[1],
    heightAt,
  });

  const rng = makeRng(config.seed ^ 0x6d07e5);
  const tints = [
    speciesCol("motes", "warm"),
    speciesCol("motes", "pink"),
    speciesCol("motes", "cool"),
  ];

  const motes = points.map((p) => {
    const r = rng.next();
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      phase: p.phase,
      speed: p.speed,
      // Sideways wander uses the scatter's own per-point variation, so the
      // drift varies the same way the placement does.
      wobble: p.drift * 0.35,
      size: rng.range(size[0], size[1]),
      tilt: [rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)],
      spin: [
        rng.range(-SPIN[0], SPIN[0]),
        rng.range(-SPIN[1], SPIN[1]),
        rng.range(-SPIN[2], SPIN[2]),
      ],
      // Mostly warm pollen, some pink petals, a little cool dust.
      tint: r < 0.46 ? tints[0] : r < 0.76 ? tints[1] : tints[2],
      // Never darken past ~86%: a dark speck over bright grass reads as dirt.
      shade: rng.range(0.86, 1.0),
    };
  });

  const mesh = new THREE.InstancedMesh(geometry, material, motes.length);
  mesh.name = "motes";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // The instances move every frame, so a sphere computed once from their
  // starting positions would go stale. Give it the envelope they can reach:
  // the whole meadow, from the lowest to the highest mote.
  mesh.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, (height[0] + height[1]) / 2, 0),
    Math.hypot(config.area.width, config.area.depth) / 2 + height[1]
  );

  const colour = new THREE.Color();
  for (let i = 0; i < motes.length; i++) {
    colour.copy(motes[i].tint).multiplyScalar(motes[i].shade);
    mesh.setColorAt(i, colour);
  }
  mesh.instanceColor.needsUpdate = true;

  group.add(mesh);

  // --- animation ------------------------------------------------------------
  const windDir = config.windDir; // Vector2: .x is world x, .y is world z
  const halfW = config.area.width / 2;
  const halfD = config.area.depth / 2;

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "XYZ");
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  function update(time) {
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const t = time * m.speed;

      // Downwind travel wrapped inside the meadow, plus a slow cross-wind
      // wander so the field does not read as one sliding sheet.
      const travel = t * DRIFT;
      const cross = Math.sin(t * CROSS_WIND + m.phase) * m.wobble;
      const x = wrap(m.x + windDir.x * travel - windDir.y * cross, halfW);
      const z = wrap(m.z + windDir.y * travel + windDir.x * cross, halfD);

      // Two vertical frequencies: a slow ride on the air plus a light flutter.
      const y =
        m.y +
        Math.sin(t * BOB + m.phase) * m.wobble * BOB_GAIN +
        Math.sin(t * 2.3 + m.phase * 2.1) * 0.018;

      euler.set(
        m.tilt[0] + time * m.spin[0],
        m.tilt[1] + time * m.spin[1],
        m.tilt[2] + time * m.spin[2]
      );
      quat.setFromEuler(euler);
      position.set(x, y, z);
      scale.setScalar(m.size);
      matrix.compose(position, quat, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0); // never render a frame of empty atmosphere

  return { group, update, dispose };
}
