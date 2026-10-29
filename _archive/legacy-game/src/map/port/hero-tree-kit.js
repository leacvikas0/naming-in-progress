// ============================================================================
// hero-tree-kit.js — the landmark broadleaf tree of Sunpetal Vale.
//
// One tree, built as a reusable module. It is NOT the meadow's instanced tree
// family (that lives in refb-kit.js / kit.js); this is the destination tree at
// the end of the path: a thick flared trunk that splits into four boughs at
// ~37 % of its height, carrying a wide, layered canopy of small painted leaf
// rosettes.
//
// Contract
//   createHeroTree({
//     seed = 1, palette = "summer", height = 10, lean = 0,
//     leafDensity = 1, leafScale = 1, lod = false,
//   }) => { group, update(elapsed), setLod?(near), dispose(), stats }
//
//   - origin at the trunk base, y = 0, +Z forward; the group itself carries no
//     transform (the caller places it).
//   - deterministic: everything derives from one seeded mulberry32. No
//     Math.random(), no Date, no globals.
//   - stats = { leaves, triangles, draws } (+ a few diagnostics).
//   - palettes: "summer" | "autumn" | "blossom" | a custom object.
//   - materials are lit by the scene (MeshStandardMaterial bark, MeshToonMaterial
//     leaves with an authored diffuse ramp). No emissive. Fog is respected.
//   - one merged bark geometry, one instanced leaf mesh (two when lod is on).
//
// Art notes
//   Bark: tan / pink-brown, vertical striations from a procedural canvas
//   texture, warm sun side and cool shadow side from a baked vertex-colour AO
//   pass. Leaves: four painted rosette variants in one 2x2 atlas (one draw
//   call), tinted per instance so the sun side goes yellow-green and the shade
//   side goes cool teal-green, with interior cards darkened to give the canopy
//   volume instead of a flat ball of noise.
//
// This module imports only `three`. Canvas textures are allowed (no DOM beyond
// an offscreen <canvas>).
// ============================================================================

import * as THREE from "three";

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// The Sunpetal Vale sun (sky.js: azimuth 2.32, elevation 0.56). The scene's
// DirectionalLight does the actual shading; this copy is only used to bake the
// per-leaf sun/shade tint so the canopy's two-tone read matches the light rig.
const SUN_DIR = new THREE.Vector3(
  Math.cos(2.32) * Math.cos(0.56),
  Math.sin(0.56),
  Math.sin(2.32) * Math.cos(0.56)
).normalize();

/* ------------------------------------------------------------------------- */
/* deterministic helpers                                                     */
/* ------------------------------------------------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function randomDirection(rng) {
  const y = rng() * 2 - 1;
  const a = rng() * TAU;
  const s = Math.sqrt(Math.max(0, 1 - y * y));
  return new THREE.Vector3(s * Math.cos(a), y, s * Math.sin(a));
}

/* ------------------------------------------------------------------------- */
/* palettes                                                                  */
/* ------------------------------------------------------------------------- */

// Hex numbers, authored in sRGB (THREE.Color converts for the lit materials,
// and the canvas textures are drawn in sRGB byte space directly).
const PALETTES = {
  summer: {
    name: "summer",
    bark: {
      base: 0xb18a68,
      light: 0xdcbb92,
      dark: 0x76523a,
      pink: 0xb9826c,
      deep: 0x563b2a,
      moss: 0x6f8a58,
    },
    leaf: {
      base: 0x4e7b47,
      mid: 0x88b354,
      tip: 0xd0e87e,
      shadeBase: 0x3a6354,
      shadeMid: 0x5f8f66,
      shadeTip: 0x94c07e,
      vein: 0x446d40,
    },
    tint: { sun: [1.08, 1.05, 0.84], shade: [0.78, 0.92, 0.97] },
    // grayscale diffuse ramp sampled by MeshToonMaterial (0 = away, 1 = facing)
    ramp: [0.30, 0.44, 0.70, 0.92, 1.0],
  },
  autumn: {
    name: "autumn",
    bark: {
      base: 0xa98263,
      light: 0xd6b28b,
      dark: 0x71503a,
      pink: 0xb07a62,
      deep: 0x523829,
      moss: 0x7a8a50,
    },
    leaf: {
      base: 0x8a5a2c,
      mid: 0xd39a40,
      tip: 0xf7d472,
      shadeBase: 0x6b4a2c,
      shadeMid: 0xa87338,
      shadeTip: 0xcf9c48,
      vein: 0x6e4a28,
    },
    tint: { sun: [1.10, 1.00, 0.80], shade: [0.88, 0.82, 0.88] },
    ramp: [0.32, 0.48, 0.72, 0.93, 1.0],
  },
  blossom: {
    name: "blossom",
    bark: {
      base: 0xa07b66,
      light: 0xcfae94,
      dark: 0x6c4e3e,
      pink: 0xa97a72,
      deep: 0x4f3830,
      moss: 0x74885a,
    },
    leaf: {
      base: 0xb96e8a,
      mid: 0xf0b3c8,
      tip: 0xffe6ef,
      shadeBase: 0x8d5a72,
      shadeMid: 0xc78fa6,
      shadeTip: 0xe8b7c8,
      vein: 0x9a5f78,
    },
    tint: { sun: [1.06, 1.00, 0.97], shade: [0.90, 0.85, 0.94] },
    ramp: [0.36, 0.52, 0.74, 0.92, 1.0],
  },
};

function resolvePalette(palette) {
  if (palette === undefined || palette === null || palette === "summer") return PALETTES.summer;
  if (typeof palette === "string") return PALETTES[palette] || PALETTES.summer;
  if (typeof palette !== "object") return PALETTES.summer;
  const base = PALETTES.summer;
  const out = {
    name: palette.name || "custom",
    bark: { ...base.bark, ...(palette.bark || {}) },
    leaf: { ...base.leaf, ...(palette.leaf || {}) },
    tint: {
      sun: palette.tint?.sun ? [...palette.tint.sun] : [...base.tint.sun],
      shade: palette.tint?.shade ? [...palette.tint.shade] : [...base.tint.shade],
    },
    ramp: palette.ramp ? [...palette.ramp] : [...base.ramp],
  };
  return out;
}

/* ------------------------------------------------------------------------- */
/* canvas textures                                                           */
/* ------------------------------------------------------------------------- */

function createCanvas(w, h) {
  if (typeof document === "undefined" || !document.createElement) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function hexRGB(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function cssRGB(rgb) {
  return `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
}

function cssRGBA(rgb, a) {
  return `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`;
}

function scaleRGB(rgb, k) {
  return [
    Math.max(0, Math.min(255, rgb[0] * k)),
    Math.max(0, Math.min(255, rgb[1] * k)),
    Math.max(0, Math.min(255, rgb[2] * k)),
  ];
}

// One painted leaf: a pointed ovate blade with a base->tip gradient, a midrib,
// three pairs of side veins and a thin lit rim on one edge. Deliberately
// painterly, not a flat colour fill.
function drawLeaf(ctx, x, y, angle, len, width, colors) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const grad = ctx.createLinearGradient(0, 0, 0, len);
  grad.addColorStop(0, colors.base);
  grad.addColorStop(0.55, colors.mid);
  grad.addColorStop(1, colors.tip);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(width * 0.95, len * 0.16, width * 0.70, len * 0.66, 0, len);
  ctx.bezierCurveTo(-width * 0.70, len * 0.66, -width * 0.95, len * 0.16, 0, 0);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // veins
  ctx.save();
  ctx.globalAlpha = 0.30;
  ctx.strokeStyle = colors.vein;
  ctx.lineWidth = Math.max(1, len * 0.022);
  ctx.beginPath();
  ctx.moveTo(0, len * 0.05);
  ctx.lineTo(0, len * 0.9);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, len * 0.011);
  for (let v = 1; v <= 3; v++) {
    const vy = len * (0.16 + v * 0.17);
    const vw = width * (0.6 - v * 0.1);
    ctx.beginPath();
    ctx.moveTo(0, vy);
    ctx.quadraticCurveTo(vw * 0.55, vy + len * 0.07, vw, vy + len * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, vy);
    ctx.quadraticCurveTo(-vw * 0.55, vy + len * 0.07, -vw, vy + len * 0.15);
    ctx.stroke();
  }
  ctx.restore();

  // thin lit rim along the left edge — the painterly "sun catches the blade"
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = colors.tip;
  ctx.lineWidth = Math.max(1, len * 0.016);
  ctx.beginPath();
  ctx.moveTo(-width * 0.06, len * 0.03);
  ctx.bezierCurveTo(-width * 0.9, len * 0.2, -width * 0.66, len * 0.64, 0, len * 0.98);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

// A rosette of leaves radiating from a small stem. Back leaves are painted in
// the cooler shade ramp so the cluster already has painted depth before any
// lighting touches it. Four variants live in the 2x2 atlas.
function drawLeafCluster(ctx, size, pal, rng, variant) {
  const cx = size * 0.5;
  const cy = size * 0.5;
  const counts = [9, 11, 8, 10];
  const count = counts[variant % counts.length];

  const lit = {
    base: cssRGB(hexRGB(pal.leaf.base)),
    mid: cssRGB(hexRGB(pal.leaf.mid)),
    tip: cssRGB(hexRGB(pal.leaf.tip)),
    vein: cssRGB(hexRGB(pal.leaf.vein)),
  };
  const shade = {
    base: cssRGB(hexRGB(pal.leaf.shadeBase)),
    mid: cssRGB(hexRGB(pal.leaf.shadeMid)),
    tip: cssRGB(hexRGB(pal.leaf.shadeTip)),
    vein: cssRGB(hexRGB(pal.leaf.vein)),
  };

  const backCount = Math.max(2, Math.round(count * 0.42));
  const frontCount = count - backCount;

  // back ring: shorter, darker, pushed out a little
  for (let i = 0; i < backCount; i++) {
    const a = (i / backCount) * TAU + rng() * 0.5 + variant * 0.7;
    const len = size * (0.235 + rng() * 0.05);
    const width = size * (0.095 + rng() * 0.02);
    const r = size * (0.035 + rng() * 0.02);
    drawLeaf(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, a - Math.PI / 2, len, width, shade);
  }
  // front ring: longer, warm, on top
  for (let i = 0; i < frontCount; i++) {
    const a = (i / frontCount) * TAU + 0.35 + rng() * 0.4 + variant * 0.4;
    const len = size * (0.27 + rng() * 0.055);
    const width = size * (0.105 + rng() * 0.022);
    const r = size * (0.02 + rng() * 0.03);
    drawLeaf(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, a - Math.PI / 2, len, width, lit);
  }
  // a couple of small young leaves near the centre
  for (let i = 0; i < 2; i++) {
    const a = rng() * TAU;
    drawLeaf(
      ctx,
      cx + Math.cos(a) * size * 0.02,
      cy + Math.sin(a) * size * 0.02,
      a - Math.PI / 2,
      size * (0.14 + rng() * 0.05),
      size * (0.07 + rng() * 0.015),
      lit
    );
  }
  // dark knot where the stem joins
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = cssRGB(hexRGB(pal.bark.deep));
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.022, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function makeLeafAtlas(pal, seed) {
  const canvas = createCanvas(1024, 1024);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const quadrant = 512;
  for (let q = 0; q < 4; q++) {
    const col = q % 2;
    const row = (q / 2) | 0;
    ctx.save();
    ctx.translate(col * quadrant, row * quadrant);
    ctx.beginPath();
    ctx.rect(0, 0, quadrant, quadrant);
    ctx.clip();
    drawLeafCluster(ctx, quadrant, pal, rng, q);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// Bark: warm tan base, tileable-in-x tonal columns, hundreds of wavy vertical
// striations (dark crevices + pale ridges + a few pink fibres), knots and a
// handful of short horizontal checks. Drawn in sRGB byte space.
function makeBarkTexture(pal, seed) {
  const W = 512;
  const H = 1024;
  const canvas = createCanvas(W, H);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const rng = mulberry32((seed ^ 0x51ed270b) >>> 0);

  const base = hexRGB(pal.bark.base);
  const light = hexRGB(pal.bark.light);
  const dark = hexRGB(pal.bark.dark);
  const pink = hexRGB(pal.bark.pink);

  // 1. broad vertical tonal columns (periodic in x so the trunk seam is clean)
  const bands = [];
  for (let i = 0; i < 4; i++) {
    bands.push({ k: 1 + i, phase: rng() * TAU, amp: 0.05 + rng() * 0.045 });
  }
  for (let x = 0; x < W; x++) {
    let v = 0;
    for (const b of bands) v += Math.sin((TAU * b.k * x) / W + b.phase) * b.amp;
    const c = scaleRGB(base, 1 + v);
    ctx.fillStyle = cssRGB(c);
    ctx.fillRect(x, 0, 1, H);
  }

  // 2. vertical striations. A path is periodic in y (integer cycles) so the
  //    texture tiles vertically; paths near the left/right edge are repeated at
  //    x +/- W so the horizontal wrap is clean too.
  const strokeStreak = (x0, amp, cycles, phase, width, colour, alpha) => {
    const drawAt = (dx) => {
      ctx.beginPath();
      for (let y = 0; y <= H; y += 8) {
        const x = x0 + dx + Math.sin((TAU * cycles * y) / H + phase) * amp;
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    ctx.strokeStyle = cssRGBA(colour, alpha);
    ctx.lineWidth = width;
    drawAt(0);
    if (x0 < 24) drawAt(W);
    if (x0 > W - 24) drawAt(-W);
  };

  for (let i = 0; i < 360; i++) {
    const x0 = rng() * W;
    const amp = 1 + rng() * 7;
    const cycles = 1 + Math.floor(rng() * 3);
    const phase = rng() * TAU;
    const width = 0.6 + rng() * 3.4;
    const isDark = rng() < 0.64;
    const colour = isDark ? dark : rng() < 0.22 ? pink : light;
    const alpha = isDark ? 0.05 + rng() * 0.16 : 0.04 + rng() * 0.12;
    strokeStreak(x0, amp, cycles, phase, width, colour, alpha);
  }
  // fine fibres
  for (let i = 0; i < 420; i++) {
    const x0 = rng() * W;
    const colour = rng() < 0.6 ? dark : light;
    strokeStreak(x0, 0.5 + rng() * 2.5, 1 + Math.floor(rng() * 4), rng() * TAU, 0.5 + rng() * 0.9, colour, 0.03 + rng() * 0.05);
  }

  // 3. knots — a few dark eyes with concentric ridges
  for (let i = 0; i < 3; i++) {
    const kx = 60 + rng() * (W - 120);
    const ky = 80 + rng() * (H - 160);
    const rx = 12 + rng() * 20;
    const ry = rx * (0.5 + rng() * 0.5);
    for (let ring = 3; ring >= 0; ring--) {
      const t = ring / 3;
      ctx.strokeStyle = cssRGBA(t < 0.5 ? dark : light, 0.16 + (1 - t) * 0.18);
      ctx.lineWidth = 1 + (1 - t) * 2.5;
      ctx.beginPath();
      ctx.ellipse(kx, ky, rx * (0.35 + t * 0.8), ry * (0.35 + t * 0.8), 0.3, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = cssRGBA(dark, 0.32);
    ctx.beginPath();
    ctx.ellipse(kx, ky, rx * 0.28, ry * 0.28, 0.3, 0, TAU);
    ctx.fill();
  }

  // 4. a handful of short horizontal checks (bark cracking across the grain)
  for (let i = 0; i < 26; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const len = 6 + rng() * 26;
    const tilt = (rng() - 0.5) * 0.35;
    ctx.strokeStyle = cssRGBA(dark, 0.12 + rng() * 0.14);
    ctx.lineWidth = 0.8 + rng() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(tilt) * len, y + Math.sin(tilt) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Grayscale diffuse ramp for MeshToonMaterial. Sampled in linear space (no
// colour-space conversion): this is a light response, not an albedo.
function makeToonRamp(pal) {
  const W = 64;
  const canvas = createCanvas(W, 1);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const stops = pal.ramp;
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  for (let i = 0; i < stops.length; i++) {
    const v = Math.max(0, Math.min(1, stops[i])) * 255;
    grad.addColorStop(i / (stops.length - 1), `rgb(${v | 0},${v | 0},${v | 0})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------------- */
/* bark geometry                                                             */
/* ------------------------------------------------------------------------- */

// Accumulates tapered tubes into a single indexed geometry. Rings are framed
// by parallel transport so a branch that bends from vertical to horizontal does
// not twist. UVs: u around the tube, v along it. Vertex colours carry baked AO.
class BarkBuilder {
  constructor() {
    this.position = [];
    this.uv = [];
    this.color = [];
    this.index = [];
    this.count = 0;
    this.seams = [];
  }

  addTube(points, radiusAt, sides, opts = {}) {
    const {
      flatten = 1,
      uvScale = 2.3,
      uRepeat = 1.5,
      radialNoise = 0.04,
      phase = 0,
      colorFn = null,
      seed = 1,
    } = opts;

    const n = points.length;
    if (n < 2 || sides < 3) return;

    // tangents
    const tangents = [];
    for (let i = 0; i < n; i++) {
      const t = new THREE.Vector3();
      if (i === 0) t.subVectors(points[1], points[0]);
      else if (i === n - 1) t.subVectors(points[n - 1], points[n - 2]);
      else t.subVectors(points[i + 1], points[i - 1]);
      if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
      tangents.push(t.normalize());
    }

    // parallel-transported frame
    const ref = Math.abs(tangents[0].y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(tangents[0], ref).normalize();
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3();
    let acc = 0;
    const rings = [];

    for (let i = 0; i < n; i++) {
      if (i > 0) {
        quat.setFromUnitVectors(tangents[i - 1], tangents[i]);
        right.applyQuaternion(quat);
        right.addScaledVector(tangents[i], -right.dot(tangents[i])).normalize();
        acc += points[i].distanceTo(points[i - 1]);
      }
      up.crossVectors(right, tangents[i]).normalize();

      const t = i / (n - 1);
      const radius = radiusAt(t);
      const ring = [];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * TAU + phase;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const noise =
          1 + (hash3(i * 1.73 + seed, k * 2.31 + seed * 0.7, seed * 0.31) - 0.5) * radialNoise * 2;
        const r = radius * noise;
        const px = points[i].x + (right.x * ca + up.x * sa) * r;
        const py = points[i].y + (right.y * ca + up.y * sa) * r * flatten;
        const pz = points[i].z + (right.z * ca + up.z * sa) * r;
        this.position.push(px, py, pz);
        this.uv.push((k / sides) * uRepeat, acc / uvScale);
        const c = colorFn ? colorFn(t, k / sides, i) : null;
        if (c) this.color.push(c.r, c.g, c.b);
        else this.color.push(1, 1, 1);
        ring.push(this.count++);
      }
      rings.push(ring);
      this.seams.push([ring[0], ring[sides]]);
    }

    // quads (winding chosen so the outward face is front-facing)
    for (let i = 0; i < n - 1; i++) {
      const r0 = rings[i];
      const r1 = rings[i + 1];
      for (let k = 0; k < sides; k++) {
        this.index.push(r0[k], r1[k], r1[k + 1], r0[k], r1[k + 1], r0[k + 1]);
      }
    }
  }

  toGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.color, 3));
    geo.setIndex(this.index);
    geo.computeVertexNormals();

    // weld the normal across the duplicated seam vertices so the tube has no
    // visible lighting crease where u wraps
    const normal = geo.getAttribute("normal");
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const [i0, i1] of this.seams) {
      a.fromBufferAttribute(normal, i0);
      b.fromBufferAttribute(normal, i1);
      a.add(b).normalize();
      normal.setXYZ(i0, a.x, a.y, a.z);
      normal.setXYZ(i1, a.x, a.y, a.z);
    }
    normal.needsUpdate = true;
    return geo;
  }
}

/* ------------------------------------------------------------------------- */
/* main factory                                                              */
/* ------------------------------------------------------------------------- */

// The branch skeleton is built inline below so every canopy lobe sits at the
// end of a real limb (the numbers are in "10 m tree" units, scaled by k).

export function createHeroTree(options = {}) {
  const {
    seed = 1,
    palette = "summer",
    height = 10,
    lean = 0,
    leafDensity = 1,
    leafScale = 1,
    lod = false,
  } = options;

  const pal = resolvePalette(palette);
  const rng = mulberry32(seed >>> 0);
  const k = Math.max(0.35, height / 10); // global size factor
  const leanX = Math.max(-1.5, Math.min(1.5, Number.isFinite(lean) ? lean : 0)) * k;

  const group = new THREE.Group();
  group.name = "heroTree";

  const uniforms = { uTime: { value: 0 } };
  const textures = [];

  /* ------------------------------- textures ------------------------------ */

  const leafAtlas = makeLeafAtlas(pal, seed);
  const barkTexture = makeBarkTexture(pal, seed + 17);
  const toonRamp = makeToonRamp(pal);
  if (leafAtlas) textures.push(leafAtlas);
  if (barkTexture) textures.push(barkTexture);
  if (toonRamp) textures.push(toonRamp);

  /* ------------------------------- materials ----------------------------- */

  const barkMaterial = new THREE.MeshStandardMaterial({
    map: barkTexture,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0,
    fog: true,
  });
  barkMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float swayH = clamp((position.y - 2.2) / 6.5, 0.0, 1.0);
        float sway = sin(uTime * 1.05 + position.y * 0.42) * 0.016 * swayH * swayH;
        transformed.x += sway;
        transformed.z += sway * 0.55;`
      );
  };
  barkMaterial.customProgramCacheKey = () => "hero-tree-bark-v1";

  const leafMaterial = new THREE.MeshToonMaterial({
    map: leafAtlas,
    gradientMap: toonRamp,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    fog: true,
  });
  leafMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        attribute vec3 aTint;
        attribute vec2 aUvOffset;
        attribute float aPhase;
        varying vec3 vTint;`
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vMapUv = uv * 0.5 + aUvOffset;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vTint = aTint;`
      )
      .replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        float windH = clamp((mvPosition.y - 3.4) / 6.2, 0.0, 1.0);
        float wind = sin(uTime * 1.2 + mvPosition.x * 0.5 + mvPosition.z * 0.4 + aPhase) * 0.055 * windH * windH;
        mvPosition.x += wind;
        mvPosition.z += wind * 0.5;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTint;`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        diffuseColor.rgb *= vTint;`
      );
  };
  leafMaterial.customProgramCacheKey = () => "hero-tree-leaf-v1";

  /* ------------------------------- skeleton ------------------------------ */

  const bark = new BarkBuilder();
  const barkBase = new THREE.Color(pal.bark.base);
  const barkDark = new THREE.Color(pal.bark.dark);
  const barkMoss = new THREE.Color(pal.bark.moss);
  const barkDeep = new THREE.Color(pal.bark.deep);

  const forkY = 3.75 * k;
  const fork = new THREE.Vector3(leanX, forkY, 0);

  // trunk — flared base, tapering column, gently leaning
  const TRUNK_RINGS = 22;
  const trunkPoints = [];
  for (let i = 0; i <= TRUNK_RINGS; i++) {
    const t = i / TRUNK_RINGS;
    trunkPoints.push(new THREE.Vector3(leanX * Math.pow(t, 1.7), t * forkY, 0));
  }
  const trunkRadius = (t) => {
    const flare = Math.exp(-Math.pow(t / 0.16, 2)) * 0.24;
    const taper = 0.30 * (1 - t) + 0.235 * t;
    return (taper + flare) * k;
  };
  bark.addTube(trunkPoints, trunkRadius, 14, {
    flatten: 1,
    uvScale: 2.3,
    uRepeat: 1.5,
    radialNoise: 0.045,
    seed: 11,
    colorFn: (t) => {
      const ao = 0.80 + 0.20 * smoothstep(0, 0.2, t);
      const c = barkBase.clone().multiplyScalar(ao);
      c.lerp(barkMoss, smoothstep(0.12, 0.0, t) * 0.3);
      return c;
    },
  });

  // buttress roots — flattened fins that merge the flare into the ground
  const ROOTS = 7;
  for (let i = 0; i < ROOTS; i++) {
    const a = (i / ROOTS) * TAU + (rng() - 0.5) * 0.42;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const len = (1.1 + rng() * 0.9) * k;
    const p0 = new THREE.Vector3(dir.x * 0.08 * k, 0.62 * k, dir.z * 0.08 * k);
    const p1 = new THREE.Vector3(dir.x * 0.38 * k, 0.30 * k, dir.z * 0.38 * k);
    const p2 = new THREE.Vector3(dir.x * 0.85 * k, 0.075 * k, dir.z * 0.85 * k);
    const p3 = new THREE.Vector3(dir.x * len, 0.02 * k, dir.z * len);
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
    const pts = curve.getPoints(10);
    bark.addTube(
      pts,
      (t) => (0.30 * Math.pow(1 - t, 1.15) + 0.018) * k,
      8,
      {
        flatten: 0.55,
        uvScale: 2.0,
        uRepeat: 1.0,
        radialNoise: 0.06,
        seed: 20 + i,
        colorFn: (t) => {
          const c = barkBase.clone().multiplyScalar(0.72 + 0.32 * t);
          c.lerp(barkMoss, 0.16);
          return c;
        },
      }
    );
  }

  // four main boughs
  const BOUGHS = 4;
  const boughData = [];
  for (let i = 0; i < BOUGHS; i++) {
    const yaw = (i / BOUGHS) * TAU + (rng() - 0.5) * 0.32;
    const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const reach = (2.45 + rng() * 0.4) * k;
    const rise = (2.75 + rng() * 0.35) * k;
    const p0 = fork.clone().addScaledVector(dir, 0.06 * k);
    const p1 = fork.clone().addScaledVector(dir, reach * 0.36).add(new THREE.Vector3(0, rise * 0.7, 0));
    const p2 = fork.clone().addScaledVector(dir, reach).add(new THREE.Vector3(0, rise, 0));
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    const pts = curve.getPoints(14);
    bark.addTube(
      pts,
      (t) => (0.20 * Math.pow(1 - t, 0.8) + 0.065) * k,
      10,
      {
        flatten: 1,
        uvScale: 2.2,
        uRepeat: 1.2,
        radialNoise: 0.05,
        seed: 40 + i,
        colorFn: (t) => {
          const ao = 0.92 + 0.08 * t;
          const c = barkBase.clone().multiplyScalar(ao);
          c.lerp(barkDeep, smoothstep(0.0, 0.25, t) * 0.18);
          return c;
        },
      }
    );
    boughData.push({ yaw, dir, curve, reach, rise });
  }

  /* --------------------------- canopy lobes ------------------------------ */

  const lobes = [];
  const addLobe = (center, rx, ry, rz, role) => {
    lobes.push({
      center,
      radii: new THREE.Vector3(rx * k, ry * k, rz * k),
      role,
    });
  };

  // helper: point + tangent on a bough
  const onBough = (curve, t) => ({
    p: curve.getPoint(t),
    tangent: curve.getTangent(t),
  });

  for (let i = 0; i < BOUGHS; i++) {
    const b = boughData[i];
    const forkYaw = Math.atan2(b.dir.z, b.dir.x);
    const tip = b.curve.getPoint(1);

    // --- lower skirt secondary: leaves hang at the canopy underside -------
    const s0 = onBough(b.curve, 0.44).p;
    const sHoriz = new THREE.Vector3(s0.x - fork.x, 0, s0.z - fork.z).normalize();
    const sSide = new THREE.Vector3().crossVectors(sHoriz, UP).normalize();
    const sDir = sHoriz.clone().addScaledVector(sSide, (rng() - 0.5) * 0.55).normalize();
    const sLen = (1.75 + rng() * 0.4) * k;
    const sTip = s0.clone().addScaledVector(sDir, sLen).add(new THREE.Vector3(0, 0.42 * k, 0));
    const sCtrl = s0.clone().addScaledVector(sDir, sLen * 0.5).add(new THREE.Vector3(0, 0.24 * k, 0));
    const sCurve = new THREE.QuadraticBezierCurve3(s0, sCtrl, sTip);
    bark.addTube(
      sCurve.getPoints(9),
      (t) => (0.105 * (1 - t) + 0.03) * k,
      7,
      {
        flatten: 1,
        uvScale: 2.0,
        uRepeat: 1.0,
        radialNoise: 0.05,
        seed: 60 + i * 3,
        colorFn: (t) => barkBase.clone().multiplyScalar(0.94 + 0.06 * t),
      }
    );
    addLobe(
      sTip.clone().addScaledVector(sDir, 0.38 * k).add(new THREE.Vector3(0, 0.10 * k, 0)),
      1.85, 1.12, 1.85, "skirt"
    );

    // --- mid lobe on the bough tip --------------------------------------
    const mDir = new THREE.Vector3(Math.cos(forkYaw), 0, Math.sin(forkYaw));
    addLobe(
      tip.clone().addScaledVector(mDir, 0.32 * k).add(new THREE.Vector3(0, 0.20 * k, 0)),
      1.95, 1.55, 1.95, "mid"
    );

    // --- upper secondary: lifts the canopy top ---------------------------
    const u0 = onBough(b.curve, 0.80).p;
    const uHoriz = new THREE.Vector3(u0.x - fork.x, 0, u0.z - fork.z).normalize();
    const uDir = uHoriz.clone().multiplyScalar(0.72).add(new THREE.Vector3(0, 0.70, 0)).normalize();
    const uLen = (1.35 + rng() * 0.35) * k;
    const uTip = u0.clone().addScaledVector(uDir, uLen);
    const uCtrl = u0.clone().addScaledVector(uDir, uLen * 0.5).add(new THREE.Vector3(0, 0.1 * k, 0));
    const uCurve = new THREE.QuadraticBezierCurve3(u0, uCtrl, uTip);
    bark.addTube(
      uCurve.getPoints(8),
      (t) => (0.09 * (1 - t) + 0.025) * k,
      7,
      {
        flatten: 1,
        uvScale: 2.0,
        uRepeat: 1.0,
        radialNoise: 0.05,
        seed: 80 + i * 3,
        colorFn: (t) => barkBase.clone().multiplyScalar(0.96 + 0.04 * t),
      }
    );
    addLobe(
      uTip.clone().addScaledVector(uDir, 0.16 * k),
      1.65, 1.38, 1.65, "upper"
    );
  }

  // crown: four lobes stepping in from the bough tips plus one top cap
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.78 + (rng() - 0.5) * 0.3;
    const r = (0.72 + rng() * 0.5) * k;
    addLobe(
      new THREE.Vector3(Math.cos(a) * r, (8.42 + rng() * 0.32) * k, Math.sin(a) * r),
      1.55, 1.28, 1.55, "crown"
    );
  }
  addLobe(new THREE.Vector3(leanX * 0.25, 8.72 * k, 0), 1.42, 1.3, 1.42, "crown");

  // inner fill: darker cards that close the middle of the crown and bury the
  // fork without making the silhouette a ball
  addLobe(new THREE.Vector3((rng() - 0.5) * 0.5 * k, 6.15 * k, (rng() - 0.5) * 0.5 * k), 1.72, 1.42, 1.72, "fill");
  addLobe(new THREE.Vector3((rng() - 0.5) * 0.5 * k, 7.35 * k, (rng() - 0.5) * 0.5 * k), 1.58, 1.35, 1.58, "fill");

  /* ------------------------------ leaves --------------------------------- */

  // weights by lobe volume so big lobes get proportionally more cards
  const roleWeight = { skirt: 1.0, mid: 1.15, upper: 1.0, crown: 0.9, fill: 0.72 };
  const weights = lobes.map((l) => {
    const vol = l.radii.x * l.radii.y * l.radii.z;
    return Math.pow(vol, 2 / 3) * (roleWeight[l.role] ?? 1);
  });
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;

  const targetCards = Math.max(240, Math.round(9000 * Math.max(0.05, leafDensity)));
  const placements = [];

  const UV_OFFSETS = [
    new THREE.Vector2(0, 0.5),
    new THREE.Vector2(0.5, 0.5),
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.5, 0),
  ];

  const minLeafY = 4.02 * k;
  const maxLeafY = height;
  const sunTint = pal.tint.sun;
  const shadeTint = pal.tint.shade;

  const tmpQuat = new THREE.Quaternion();
  const rollQuat = new THREE.Quaternion();
  const ax = new THREE.Vector3();
  const ay = new THREE.Vector3();

  for (let li = 0; li < lobes.length; li++) {
    const lobe = lobes[li];
    const count = Math.max(40, Math.round((targetCards * weights[li]) / weightSum));
    const { center, radii } = lobe;

    for (let i = 0; i < count; i++) {
      const dir = randomDirection(rng);
      const rr = Math.pow(rng(), 0.42); // biased toward the shell
      const pos = new THREE.Vector3(
        center.x + dir.x * radii.x * rr,
        center.y + dir.y * radii.y * rr,
        center.z + dir.z * radii.z * rr
      );

      // outward normal of the ellipsoid at this point
      const nrm = new THREE.Vector3(
        dir.x / radii.x,
        dir.y / radii.y,
        dir.z / radii.z
      ).normalize();

      // cards lie tangent to the lobe, angled slightly up, with jitter
      const cn = nrm
        .clone()
        .multiplyScalar(0.84)
        .addScaledVector(UP, 0.16 + rng() * 0.12);
      cn.x += (rng() - 0.5) * 0.32;
      cn.y += (rng() - 0.5) * 0.28;
      cn.z += (rng() - 0.5) * 0.32;
      cn.normalize();

      const quat = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, cn);
      rollQuat.setFromAxisAngle(Z_AXIS, rng() * TAU);
      quat.multiply(rollQuat);

      const shell = smoothstep(0.55, 1.0, rr);
      const s = (0.58 + rng() * 0.3 + shell * 0.12) * k * Math.max(0.1, leafScale);
      const sx = s * (0.85 + rng() * 0.35);
      const sy = s * (0.85 + rng() * 0.35);

      // vertical extent of the rotated card, so the underside can be clamped
      ax.set(1, 0, 0).applyQuaternion(quat);
      ay.set(0, 1, 0).applyQuaternion(quat);
      const extY = 0.5 * (Math.abs(ax.y) * sx + Math.abs(ay.y) * sy);
      if (pos.y - extY < minLeafY) pos.y = minLeafY + extY;
      if (pos.y + extY > maxLeafY) pos.y = maxLeafY - extY;

      // baked two-tone: sun-facing cards warm, shade-facing cards cool, and
      // interior cards darker so the canopy reads as a volume
      const facing = cn.dot(SUN_DIR);
      const sunW = smoothstep(-0.35, 0.85, facing);
      const ao = 0.55 + 0.45 * Math.pow(rr, 0.9);
      const tint = new THREE.Color(
        lerp(shadeTint[0], sunTint[0], sunW) * ao,
        lerp(shadeTint[1], sunTint[1], sunW) * ao,
        lerp(shadeTint[2], sunTint[2], sunW) * ao
      );
      tint.multiplyScalar(0.92 + rng() * 0.16);

      placements.push({
        pos,
        quat,
        sx,
        sy,
        tint,
        uv: UV_OFFSETS[(i + li * 3) % 4],
        phase: rng() * TAU,
      });
    }
  }

  /* --------------------------- leaf meshes ------------------------------- */

  function buildLeafMesh(list, name) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const count = list.length;
    const mesh = new THREE.InstancedMesh(geo, leafMaterial, count);
    mesh.name = name;
    const tints = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const phases = new Float32Array(count);
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const p = list[i];
      scale.set(p.sx, p.sy, 1);
      matrix.compose(p.pos, p.quat, scale);
      mesh.setMatrixAt(i, matrix);
      tints[i * 3] = p.tint.r;
      tints[i * 3 + 1] = p.tint.g;
      tints[i * 3 + 2] = p.tint.b;
      uvs[i * 2] = p.uv.x;
      uvs[i * 2 + 1] = p.uv.y;
      phases[i] = p.phase;
    }
    mesh.instanceMatrix.needsUpdate = true;
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 3));
    geo.setAttribute("aUvOffset", new THREE.InstancedBufferAttribute(uvs, 2));
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    return mesh;
  }

  const fullLeaves = buildLeafMesh(placements, "heroTreeLeaves");

  let lowLeaves = null;
  if (lod) {
    const lowPlacements = [];
    for (let i = 0; i < placements.length; i += 2) {
      const p = placements[i];
      lowPlacements.push({
        ...p,
        sx: p.sx * 1.22,
        sy: p.sy * 1.22,
        tint: p.tint.clone().multiplyScalar(0.98),
      });
    }
    lowLeaves = buildLeafMesh(lowPlacements, "heroTreeLeavesLow");
    lowLeaves.visible = false;
  }

  const barkGeometry = bark.toGeometry();
  const barkMesh = new THREE.Mesh(barkGeometry, barkMaterial);
  barkMesh.name = "heroTreeBark";
  barkMesh.castShadow = false;
  barkMesh.receiveShadow = false;

  group.add(barkMesh);
  group.add(fullLeaves);
  if (lowLeaves) group.add(lowLeaves);

  /* ------------------------------- stats --------------------------------- */

  const barkTriangles = barkGeometry.index.count / 3;
  const leafTriangles = placements.length * 2;
  const stats = {
    leaves: placements.length,
    triangles: barkTriangles + leafTriangles,
    draws: lod ? 3 : 2,
    barkTriangles,
    leafTriangles,
    barkVertices: barkGeometry.attributes.position.count,
    lobes: lobes.length,
    canopyRadius: 0,
    canopyUnderside: 0,
  };

  // diagnostics used by the verification harness
  {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const p of placements) {
      box.expandByPoint(p.pos);
    }
    stats.canopyRadius = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
    stats.canopyUnderside = box.min.y;
    stats.canopyOffsetXZ = Math.hypot((box.min.x + box.max.x) * 0.5, (box.min.z + box.max.z) * 0.5);
    stats.canopyTop = box.max.y;
    stats.trunkBase = new THREE.Vector3(0, 0, 0).toArray();
    stats.height = height;
    void v;
  }

  /* ------------------------------- runtime ------------------------------- */

  function update(elapsed) {
    uniforms.uTime.value = Number.isFinite(elapsed) ? elapsed : 0;
  }

  function setLod(near) {
    if (!lowLeaves) return;
    fullLeaves.visible = !!near;
    lowLeaves.visible = !near;
  }

  function dispose() {
    if (group.parent) group.parent.remove(group);
    barkGeometry.dispose();
    barkMaterial.dispose();
    leafMaterial.dispose();
    fullLeaves.geometry.dispose();
    if (lowLeaves) lowLeaves.geometry.dispose();
    for (const tex of textures) tex.dispose();
  }

  const result = { group, update, dispose, stats };
  if (lod) result.setLod = setLod;
  return result;
}

export default createHeroTree;
