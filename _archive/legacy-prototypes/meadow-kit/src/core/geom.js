// Geometry primitives for the meadow kit.
//
// Three shapes build every plant in this pack:
//   taperedPlane() - grass blades, petals, leaves, sepals, florets
//   tube()         - stems
//   dome()         - flower centres
//
// mergeParts() welds them into one vertex-coloured geometry per species.
// finalizeGeometry() then enforces the pack-wide contract: exactly 1.0 unit
// tall, base at the origin, +Y up. That contract is what makes a daisy and a
// lupine interchangeable in the scatter system.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const AXIS = { x: 0, y: 1, z: 2 };

function widthAt(t, mode, base, tip) {
  switch (mode) {
    // Rounded petal: narrow at the base, fullest just past the middle, and a
    // blunt rounded tip (the sine is clamped short of pi so the tip keeps width).
    case "petal": {
      const s = Math.sin(Math.PI * Math.min(0.9, 0.18 + 0.82 * t));
      return base * (0.34 + 0.66 * s);
    }
    // Pointed leaf: widest at ~40%, zero at both ends.
    case "leaf":
      return base * Math.sin(Math.PI * Math.pow(t, 0.78));
    // Tapering blade, small but non-zero tip so the silhouette stays solid.
    case "blade":
    default:
      return base + (tip - base) * t;
  }
}

/**
 * A curved strip. The workhorse.
 *
 * Lies in the XY plane, base at the origin, growing toward +Y, front face +Z.
 *
 * @param {object} o
 * @param {number} o.length      strip length
 * @param {number} o.widthBase   width at t=0
 * @param {number} o.widthTip    width at t=1 (used by "blade" mode)
 * @param {number} o.segments    rows along the length
 * @param {number} o.crossSegments columns across the width (3 = V profile, 5 = smooth)
 * @param {number} o.bend        forward curl toward +Z, as a fraction of length
 * @param {number} o.lean        uniform forward tilt toward +Z, as a fraction of length
 * @param {number} o.cup         edge curl toward +Z, as a fraction of width (bowl shape)
 * @param {number} o.ruffle      edge ripple amplitude, as a fraction of width
 * @param {string} o.widthCurve  "blade" | "petal" | "leaf"
 * @param {function} o.profile   optional (t) => width, overrides widthCurve
 */
export function taperedPlane(o = {}) {
  const {
    length = 1,
    widthBase = 0.1,
    widthTip = 0.02,
    segments = 6,
    crossSegments = 3,
    bend = 0,
    lean = 0,
    cup = 0,
    ruffle = 0,
    widthCurve = "blade",
    profile = null,
  } = o;

  const cols = Math.max(2, crossSegments | 0);
  const rows = Math.max(1, segments | 0) + 1;
  const positions = [];
  const indices = [];

  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const w = profile ? profile(t) : widthAt(t, widthCurve, widthBase, widthTip);
    for (let j = 0; j < cols; j++) {
      const u = (j / (cols - 1)) * 2 - 1;
      const x = u * w * 0.5;
      const y = length * t;
      let z = bend * length * t * t + lean * length * t;
      z += cup * u * u * w;
      if (ruffle) z += ruffle * Math.sin(t * Math.PI * 4.5) * u * u * w * 1.6;
      positions.push(x, y, z);
    }
  }

  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Stem / petiole. Points are [x,y,z] in local space. */
export function tube(o = {}) {
  const { points = [[0, 0, 0], [0, 0.5, 0]], radius = 0.01, tubular = 8, radial = 5 } = o;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, Math.max(2, tubular | 0), radius, Math.max(3, radial | 0), false);
}

/** Shallow dome facing +Z. Flower centres. */
export function dome(o = {}) {
  const { radius = 0.05, height = 0.02, segments = 10 } = o;
  const n = Math.max(3, segments | 0);
  const positions = [0, 0, height];
  const indices = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  }
  for (let i = 0; i < n; i++) {
    indices.push(0, 1 + i, 1 + ((i + 1) % n));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Compose a Matrix4 from plain arrays.
 * rotation is [x,y,z] in radians; `order` picks the Euler convention
 * ("YXZ" is the useful one for pointing a +Y petal outward then spinning it).
 */
export function transform(o = {}) {
  const { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], order = "XYZ" } = o;
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation[0], rotation[1], rotation[2], order)
  );
  return new THREE.Matrix4().compose(
    new THREE.Vector3(position[0], position[1], position[2]),
    q,
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

/** Matrix multiply helper: parent * child, both Matrix4. */
export function combine(parent, child) {
  return new THREE.Matrix4().multiplyMatrices(parent, child);
}

function stripUv(g) {
  delete g.attributes.uv;
  delete g.attributes.uv1;
  delete g.attributes.uv2;
  delete g.attributes.tangent;
  return g;
}

/**
 * Weld parts into one geometry with `color` and `aSway` vertex attributes.
 *
 * Each part:
 *   { geo, color, color2?, colorFn?, gradientAxis?, gradientPower?, sway?, matrix? }
 *
 *   color        base colour (hex string or THREE.Color)
 *   color2       optional second colour, blended along gradientAxis
 *   colorFn      optional (t) => THREE.Color, full control, wins over color2
 *   gradientAxis "y" (default) | "x" | "z", measured on the part before matrix
 *   sway         0..1 constant, or (t) => 0..1. Default: t along +Y.
 *   matrix       optional transform() result, applied last
 */
export function mergeParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("mergeParts: needs at least one part");
  }

  const prepared = parts.map((part) => {
    if (!part || !part.geo) throw new Error("mergeParts: every part needs a `geo`");
    const g = stripUv(part.geo.clone());

    if (!g.attributes.normal) g.computeVertexNormals();
    g.computeBoundingBox();

    const pos = g.attributes.position;
    const n = pos.count;
    const axisName = part.gradientAxis || "y";
    const ai = AXIS[axisName] ?? 1;
    const bb = g.boundingBox;
    const min = bb.min.getComponent(ai);
    const span = Math.max(bb.max.getComponent(ai) - min, 1e-6);

    const c1 = part.color != null ? new THREE.Color(part.color) : new THREE.Color(0xffffff);
    const c2 = part.color2 != null ? new THREE.Color(part.color2) : null;
    const colorFn = part.colorFn || null;
    const power = part.gradientPower ?? 1;

    const colors = new Float32Array(n * 3);
    const sway = new Float32Array(n);
    const swayFn = part.sway;
    const swayConst = typeof swayFn === "number" ? swayFn : null;

    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t = THREE.MathUtils.clamp((pos.getComponent(i, ai) - min) / span, 0, 1);
      if (colorFn) {
        tmp.copy(colorFn(t));
      } else if (c2) {
        tmp.copy(c1).lerp(c2, Math.pow(t, power));
      } else {
        tmp.copy(c1);
      }
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;

      if (swayConst != null) sway[i] = swayConst;
      else if (typeof swayFn === "function") sway[i] = swayFn(t);
      else sway[i] = t;
    }

    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("aSway", new THREE.BufferAttribute(sway, 1));

    if (part.matrix) g.applyMatrix4(part.matrix);
    return g;
  });

  // mergeGeometries needs a uniform indexed/non-indexed state.
  const anyPlain = prepared.some((g) => !g.index);
  const ready = anyPlain ? prepared.map((g) => (g.index ? g.toNonIndexed() : g)) : prepared;

  const merged = mergeGeometries(ready, false);
  if (!merged) throw new Error("mergeParts: mergeGeometries returned null (attribute mismatch)");
  merged.computeVertexNormals();
  return merged;
}

/**
 * Enforce the pack contract. Runs on every species after build(), so a species
 * author cannot accidentally ship something the scatter system can't place.
 *
 * - exactly 1.0 unit tall
 * - base sits on y = 0
 * - horizontally centred on the origin
 * - has color + aSway, valid normals, no NaN
 */
export function finalizeGeometry(geo, { height = 1 } = {}) {
  if (!geo.attributes.color) {
    const n = geo.attributes.position.count;
    const white = new Float32Array(n * 3).fill(1);
    geo.setAttribute("color", new THREE.BufferAttribute(white, 3));
  }
  if (!geo.attributes.aSway) {
    const n = geo.attributes.position.count;
    const sway = new Float32Array(n);
    geo.setAttribute("aSway", new THREE.BufferAttribute(sway, 1));
  }

  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const h = bb.max.y - bb.min.y;
  if (!Number.isFinite(h) || h <= 1e-6) {
    throw new Error("finalizeGeometry: geometry has no height (nothing to scale)");
  }
  const s = height / h;

  geo.translate(
    -((bb.max.x + bb.min.x) / 2),
    -bb.min.y,
    -((bb.max.z + bb.min.z) / 2)
  );
  geo.scale(s, s, s);

  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.computeVertexNormals();

  const p = geo.attributes.position.array;
  for (let i = 0; i < p.length; i++) {
    if (!Number.isFinite(p[i])) throw new Error("finalizeGeometry: NaN in positions");
  }
  return geo;
}

export function triangleCount(geo) {
  const n = geo.index ? geo.index.count : geo.attributes.position.count;
  return Math.floor(n / 3);
}
