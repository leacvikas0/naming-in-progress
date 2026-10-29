// Ground plane — the base every other asset in the meadow stands on.
//
// Two rules drive this whole file:
//
//   1. heightAt() is the single source of truth. The mesh is displaced with the
//      exact same function the scatter system calls, so a plant placed with
//      heightAt() can never float above or sink into the ground.
//
//   2. Ground near a path is dead flat. A trail that rides every 7 m swell
//      reads as a ribbon floating over the field; a flat corridor reads as
//      ground that has been walked on. The path ribbon samples heightAt() every
//      12 cm, and inside that corridor heightAt() is a plane, so the two agree
//      to the millimetre no matter how the mesh is tessellated.
//
// Everything is analytic: no heightmap, no texture, no state. Same config in,
// same ground out, on every machine.

import * as THREE from "three";
import { groundCol } from "../core/palette.js";
import { fbm2D } from "../core/rng.js";

// --- tuning ----------------------------------------------------------------

const PATH_SAMPLES = 200; // polyline resolution used for distance-to-path
const FLAT_RADIUS = 1.5; // metres of perfectly flat ground around a centreline
const FLAT_FADE = 3.4; // metres over which the relief fades back in
const SOIL_FALLOFF = 3; // higher = the soil tint hugs the path more tightly
const RELIEF_GAIN = 2.6; // shape() peaks at ±0.099 on this seed, so this lands on ±relief

const GRASS_SCALE = 5.6; // metres per grass-colour drift
const DRY_SCALE = 3.4; // metres per dry-grass patch
const SOIL_PATCH_SCALE = 2.9; // metres per ragged soil edge

// The slope runs diagonally so no edge of the plane reads as a ruled line.
const SLOPE_X = 0.78;
const SLOPE_Z = 0.62;

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Shared earth material, or a plain Lambert fallback when no factory is passed. */
function earthMaterial(materials) {
  if (materials && typeof materials.get === "function") {
    return { material: materials.get("earth"), owned: false };
  }
  return {
    material: new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true }),
    owned: true,
  };
}

/**
 * @param {object} config resolved config from resolveConfig()
 * @param {object} [materials] material factory; defaults to config.materials
 * @returns {{mesh: THREE.Mesh, heightAt: (x:number,z:number)=>number,
 *            size: {width:number, depth:number}, pathDistance: Function, dispose: Function}}
 */
export function createTerrain(config, materials = config.materials) {
  const area = config.area;
  // resolveConfig() exposes the terrain block either flattened or on the
  // recipe; accept both so this module does not care which.
  const T = config.terrain ?? config.recipe.terrain;
  const noise = config.noise;
  const halfW = area.width / 2;
  const halfD = area.depth / 2;

  // --- distance to the path centrelines ------------------------------------
  // One polyline per path, with a padded bbox so most samples skip the loop
  // entirely. Distances beyond the bbox are treated as "far" — the relief is
  // fully on and the soil tint is zero there, which is exactly what the far
  // side of the bbox would have returned anyway.
  const pathTables = (config.paths || []).map((p) => {
    const pts = p.curve.getPoints(PATH_SAMPLES);
    const flat = new Float32Array(pts.length * 2);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i].x;
      const z = pts[i].z;
      flat[i * 2] = x;
      flat[i * 2 + 1] = z;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const pad = FLAT_RADIUS + FLAT_FADE;
    return {
      pts: flat,
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
    };
  });

  /** Metres to the nearest path centreline, or Infinity if there are no paths. */
  function pathDistance(x, z) {
    let best = Infinity;
    for (let t = 0; t < pathTables.length; t++) {
      const table = pathTables[t];
      if (x < table.minX || x > table.maxX || z < table.minZ || z > table.maxZ) continue;
      const p = table.pts;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i];
        const az = p[i + 1];
        const dx = p[i + 2] - ax;
        const dz = p[i + 3] - az;
        const len2 = dx * dx + dz * dz;
        let u = len2 > 1e-12 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const ex = ax + dx * u - x;
        const ez = az + dz * u - z;
        const d2 = ex * ex + ez * ez;
        if (d2 < best) best = d2;
      }
    }
    return best === Infinity ? Infinity : Math.sqrt(best);
  }

  // --- height field ---------------------------------------------------------
  // Tilt is a plane, so it survives mesh interpolation exactly; only the noise
  // is flattened near paths. That is what keeps the corridor from cutting a
  // step into the overall slope.
  function slope(x, z) {
    return T.tilt * (x * SLOPE_X + z * SLOPE_Z);
  }

  // Two scales: broad 7-8 m swells plus a finer 3-4 m roll. Both are value
  // noise smoothed to C1, so the surface is soft everywhere — no spikes.
  function reliefShape(x, z) {
    const s = 1 / T.reliefScale;
    const broad = fbm2D(noise, x * s * 0.55 + 11.7, z * s * 0.55 - 6.3, 2);
    const fine = fbm2D(noise, x * s * 1.4 - 4.2, z * s * 1.4 + 9.1, 3);
    return (broad - 0.5) * 1.25 + (fine - 0.5) * 0.6;
  }

  // One scratch record: heightAt() is called tens of thousands of times by the
  // scatter system, and this keeps it allocation-free.
  const scratch = { h: 0, d: 0, shape: 0, calm: 1 };

  function sample(x, z, out = scratch) {
    const d = pathDistance(x, z);
    const calm = smoothstep(FLAT_RADIUS, FLAT_RADIUS + FLAT_FADE, d);
    const shape = reliefShape(x, z);
    out.d = d;
    out.shape = shape;
    out.calm = calm;
    out.h = slope(x, z) + T.relief * RELIEF_GAIN * shape * calm;
    return out;
  }

  function heightAt(x, z) {
    return sample(x, z).h;
  }

  // --- colour ---------------------------------------------------------------
  // Linear RGB (THREE.Color converts the sRGB palette on construction). The
  // ground is mostly hidden by grass instances, so it is biased deep-to-mid;
  // grassLit only shows where the noise lifts it, which reads as sun on a rise.
  const cDeep = groundCol("grassDeep");
  const cMid = groundCol("grassMid");
  const cLit = groundCol("grassLit");
  const cDry = groundCol("grassDry");
  const cSoil = groundCol("soil");
  const tmp = new THREE.Color();

  function groundColor(x, z, s, out) {
    const n = fbm2D(noise, x / GRASS_SCALE + 7.3, z / GRASS_SCALE - 2.1, 3);
    // The ground sits around grassMid on average. That matters: the path
    // ribbon feathers its rim to grassMid, so a ground that averaged darker
    // would give the trail a pale green outline instead of losing its edge.
    out.copy(cMid);
    out.lerp(cDeep, smoothstep(0.55, 0.15, n) * 0.85);
    out.lerp(cLit, smoothstep(0.66, 0.95, n) * 0.8);

    // Grain at about a metre, so the plane never reads as one flat tone.
    const grain = noise(x / 1.15 + 3.7, z / 1.15 - 9.4);
    out.multiplyScalar(0.9 + 0.2 * grain);

    // Dry grass in a few patches — a hint of straw, never a yellow field.
    const dry = fbm2D(noise, x / DRY_SCALE - 21.7, z / DRY_SCALE + 13.4, 2);
    out.lerp(cDry, smoothstep(0.64, 0.8, dry) * 0.5);

    // Worn ground: strongest at the path, gone by soilRadius. The patch noise
    // makes the edge ragged — a clean ring around a trail looks painted on.
    if (s.d < T.soilRadius) {
      const patch = 0.55 + 0.45 * noise(x / SOIL_PATCH_SCALE + 31.1, z / SOIL_PATCH_SCALE - 17.3);
      const soil =
        Math.pow(1 - smoothstep(0, T.soilRadius, s.d), SOIL_FALLOFF) * T.soilStrength * patch;
      out.lerp(cSoil, clamp01(soil));
    }

    // Higher ground catches a touch more light; hollows sit a shade deeper.
    out.multiplyScalar(0.94 + 0.12 * clamp01(s.shape * 0.5 + 0.5));
    return out;
  }

  // --- mesh -----------------------------------------------------------------
  const segments = Math.max(1, T.segments | 0);
  const geo = new THREE.PlaneGeometry(area.width, area.depth, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const s = sample(x, z);
    pos.setY(i, s.h);
    groundColor(x, z, s, tmp);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const { material, owned } = earthMaterial(materials);

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "meadow:terrain";
  mesh.receiveShadow = true; // ground catches the meadow's shadows
  mesh.castShadow = false; // a single plane casting onto itself is just acne
  mesh.userData.size = { width: area.width, depth: area.depth };
  mesh.userData.halfW = halfW;
  mesh.userData.halfD = halfD;

  return {
    mesh,
    heightAt,
    size: { width: area.width, depth: area.depth },
    // Handy for anything that wants to know how worn the ground is; the path
    // ribbon and the terrain both use this same distance field.
    pathDistance,
    dispose() {
      geo.dispose();
      if (owned) material.dispose();
    },
  };
}
