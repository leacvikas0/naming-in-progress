// Worn dirt trails.
//
// Each path is one ribbon: 7 columns sampled every 12 cm along the curve. Three
// things make it read as walked-on ground rather than a painted stripe:
//
//   1. the cross-section is crowned, and the edges settle back down onto the
//      terrain instead of ending in a floating lip
//   2. the width breathes and the centreline wanders a few centimetres, both
//      on low-frequency noise, so the silhouette is never a ruler edge
//   3. the outer edge colour feathers into the grass, so there is no hard line
//      where the ribbon stops
//
// terrain.js keeps the ground flat within 1.5 m of every centreline, so the
// ribbon can ride a constant `lift` above heightAt() and never z-fight the
// mesh — and the ground the feather fades into is the same plane.

import * as THREE from "three";
import { groundCol } from "../core/palette.js";

// --- tuning ----------------------------------------------------------------

const COLUMNS = 7; // across the width: enough for a crown, a rut and a feather
const SPACING = 0.12; // metres between cross-sections
const CROWN = 0.014; // centre of the ribbon above its edges (metres)
const EDGE_SINK = 0.62; // how much of `lift` the edge gives back
const RUT_AT = 0.5; // |u| where the wheel ruts run
const RUT_WIDTH = 0.17; // gaussian width of a rut, in u
const RUT_DEPTH = 0.0035; // metres
const FEATHER_CAP = 0.6; // feather band, as a fraction of the half width

// Columns are packed toward the rim, where the feather needs resolution, and
// spaced out through the crown, where the profile is a gentle quadratic.
const U = [-1, -0.8, -0.52, 0, 0.52, 0.8, 1];

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// Deterministic per-vertex jitter. Sampling the noise field for pebbles would
// put them on the vertex grid, which reads as a regular dot pattern down the
// trail; a hash gives specks that land anywhere.
function hash2(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

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
 * @param {(x:number, z:number)=>number} heightAt the terrain height field
 * @param {object} [materials] material factory; defaults to config.materials
 * @returns {{group: THREE.Group, meshes: THREE.Mesh[], dispose: Function}}
 */
export function createPath(config, heightAt, materials = config.materials) {
  const noise = config.noise;
  const paths = config.paths || [];

  const { material, owned } = earthMaterial(materials);
  const group = new THREE.Group();
  group.name = "meadow:paths";
  const meshes = [];

  // Sun direction on the ground plane, matching render.mjs / the scene lights:
  // x = sin(azimuth), z = cos(azimuth). The side of the trail facing it is the
  // side that reads lit.
  const sunAz = THREE.MathUtils.degToRad(config.palette?.light?.sunAzimuth ?? 34);
  const sunX = Math.sin(sunAz);
  const sunZ = Math.cos(sunAz);

  const cMid = groundCol("pathMid");
  const cLit = groundCol("pathLit");
  const cDeep = groundCol("pathDeep");
  const cSpeck = groundCol("pathSpeck");
  const cGrass = groundCol("grassMid");
  const tmp = new THREE.Color();

  for (let pi = 0; pi < paths.length; pi++) {
    const path = paths[pi];
    const curve = path.curve;

    const rows = Math.max(2, Math.ceil(curve.getLength() / SPACING));
    const pts = curve.getSpacedPoints(rows); // arc-length spaced, rows + 1 points
    const halfBase = path.width * 0.5;

    // A literal 0.9 m feather on a 0.6 m half-width would erase the dirt
    // entirely, so the band is capped — the trail keeps a solid core and the
    // outer third fades into grass.
    const feather = Math.max(0.05, Math.min(path.feather, halfBase * FEATHER_CAP));

    // Per-path noise offsets, so the two trails do not wander in step.
    const seedX = 3.7 + pi * 17.3;
    const seedZ = -8.1 - pi * 11.9;

    const vertCount = (rows + 1) * COLUMNS;
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices = [];

    for (let i = 0; i <= rows; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(rows, i + 1)];

      // Tangent and its perpendicular in the XZ plane. The curve lives flat in
      // XZ, so there is no frame twist to manage.
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const nx = -tz;
      const nz = tx;

      // The centreline drifts on two scales, and each side breathes on its own
      // noise, so the two edges never run parallel — a trail is not a stripe.
      const wobble = (noise(p.x * 0.55 + seedX, p.z * 0.55 + seedZ) - 0.5) * 0.3;
      const wobbleFine = (noise(p.x * 2.4 - seedZ, p.z * 2.4 + seedX) - 0.5) * 0.12;
      const cx = p.x + nx * (wobble + wobbleFine);
      const cz = p.z + nz * (wobble + wobbleFine);

      const halfLeft = halfBase * (0.78 + 0.44 * noise(p.x * 1.5 + seedX + 5.1, p.z * 1.5 + seedZ - 3.7));
      const halfRight = halfBase * (0.78 + 0.44 * noise(p.x * 1.5 - seedX + 11.9, p.z * 1.5 + seedZ + 7.3));
      // A last ragged centimetre on both rims, at a scale the eye reads as
      // grass encroaching rather than as a wobbling edge.
      const ragged = (noise(p.x * 2.6 - seedX, p.z * 2.6 - seedZ) - 0.5) * 0.12;

      // The feather is not a constant width: it swells and pinches along the
      // trail, so the dirt/grass boundary wanders in and out on its own. This
      // is what stops the ribbon from reading as a shape with an outline.
      const featherL = feather * (0.5 + 1.0 * noise(p.x * 2.3 + seedZ, p.z * 2.3 + seedX));
      const featherR = feather * (0.5 + 1.0 * noise(p.x * 2.3 - seedZ + 7.7, p.z * 2.3 + seedX - 4.3));

      // > 0 means the +u side of the ribbon faces the sun.
      const sunSide = nx * sunX + nz * sunZ;

      for (let j = 0; j < COLUMNS; j++) {
        const u = U[j];
        const halfW = (u < 0 ? halfLeft : halfRight) + ragged;
        const lat = u * halfW;
        const x = cx + nx * lat;
        const z = cz + nz * lat;

        // Ground height at the vertex itself, not at the centreline: the
        // meadow has a slight overall tilt, and across a 1.2 m ribbon that is
        // 2 cm — enough to bury one edge if we used the centre height.
        const h = heightAt(x, z);

        const u2 = u * u;
        const rut = Math.exp(-(((Math.abs(u) - RUT_AT) / RUT_WIDTH) ** 2));
        const y =
          h +
          path.lift * (1 - EDGE_SINK * u2 * u2) + // edges settle toward the ground
          CROWN * (1 - u2) - // crown, so the middle catches the light
          RUT_DEPTH * rut; // shallow wheel ruts

        const o = (i * COLUMNS + j) * 3;
        positions[o] = x;
        positions[o + 1] = y;
        positions[o + 2] = z;

        // --- colour -------------------------------------------------------
        tmp.copy(cMid);

        // Two scales of mottling: broad damp and dry stretches, then grain.
        const broad = noise(x * 0.8 + seedZ, z * 0.8 - seedX);
        const grain = noise(x * 1.9 - seedZ, z * 1.9 + seedX);
        tmp.lerp(cDeep, 0.22 * broad);
        tmp.lerp(cLit, 0.3 * smoothstep(0.5, 0.9, grain));

        // Dirt gathers darker toward the rim. Without this the grass feather
        // reads as a dark outline drawn around a pale stripe.
        tmp.lerp(cDeep, 0.3 * smoothstep(0.3, 1, Math.abs(u)));

        // The side of the trail facing the sun.
        tmp.lerp(cLit, 0.45 * Math.max(0, sunSide * u));

        // Ruts sit deeper and dirtier.
        tmp.lerp(cDeep, rut * 0.5);

        // A few pebbles, as vertex-colour specks.
        const pebble = hash2(i * 73 + pi * 1013, j * 131 + 7);
        tmp.lerp(cSpeck, smoothstep(0.86, 0.96, pebble) * 0.5);

        // Feather last, so it wins at the rim: the outermost column is grass,
        // and the blend inward is the trail disappearing into the field.
        const edgeDist = halfW * (1 - Math.abs(u));
        tmp.lerp(cGrass, 1 - smoothstep(0, feather, edgeDist));

        colors[o] = tmp.r;
        colors[o + 1] = tmp.g;
        colors[o + 2] = tmp.b;
      }
    }

    // Counter-clockwise seen from above, so the FrontSide material faces up.
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < COLUMNS - 1; j++) {
        const a = i * COLUMNS + j;
        const b = a + 1;
        const c = a + COLUMNS;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `meadow:path:${path.id}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.pathId = path.id;
    mesh.userData.triangles = indices.length / 3;

    group.add(mesh);
    meshes.push(mesh);
  }

  return {
    group,
    meshes,
    dispose() {
      for (const mesh of meshes) {
        group.remove(mesh);
        mesh.geometry.dispose();
      }
      meshes.length = 0;
      if (owned) material.dispose();
    },
  };
}
