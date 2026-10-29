// Offline preview renderer. No browser, no GPU, no shared Playwright tab —
// so several agents can each look at their own plant at the same time.
//
//   node tools/render.mjs --species=daisy
//   node tools/render.mjs --species=daisy --size=900 --az=35 --el=22
//   node tools/render.mjs --species=daisy --out=scratch/shots/my.png
//
// It rasterises the real geometry with a z-buffer and shades it with the SAME
// toon ramp the kit uses at runtime, so what you see here is what the meadow
// will look like.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { finalizeGeometry, triangleCount } from "../src/core/geom.js";
import { DEFAULT_PALETTE } from "../src/core/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, "..");

// ------------------------------------------------------------------ args
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "1"];
  })
);

const speciesId = args.species || "daisy";
const size = Number(args.size || 640);
const ss = Number(args.ss || 2); // supersample factor
const az = THREE_DEG(args.az ?? 32);
const el = THREE_DEG(args.el ?? 20);
const outPath = args.out
  ? path.resolve(kitRoot, args.out)
  : path.join(kitRoot, "scratch", "shots", `${speciesId}.png`);

function THREE_DEG(deg) {
  return (Number(deg) * Math.PI) / 180;
}

// ------------------------------------------------------------------ png
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ colour
function hexToLinear(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  const s = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return s.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
}

function linearToSrgb(c) {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// ------------------------------------------------------------------ load
const mod = await import(pathToFileURL(path.join(kitRoot, "src", "foliage", `${speciesId}.js`)).href);
const spec = mod.spec;
if (!spec) throw new Error(`${speciesId}.js does not export spec`);

const geo = finalizeGeometry(spec.build({ seed: Number(args.seed || 1234) }));

const pos = geo.attributes.position.array;
const col = geo.attributes.color.array;
const idx = geo.index ? geo.index.array : null;
const triCount = triangleCount(geo);

// ------------------------------------------------------------------ camera
const P = DEFAULT_PALETTE;
const sunEl = THREE_DEG(P.light.sunElevation);
const sunAz = THREE_DEG(P.light.sunAzimuth);
const sunDir = norm([
  Math.cos(sunEl) * Math.sin(sunAz),
  Math.sin(sunEl),
  Math.cos(sunEl) * Math.cos(sunAz),
]);
const steps = P.look?.toonSteps ?? [0.16, 0.24, 0.34, 0.46, 0.6, 0.76, 0.91, 1.0];

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

const camDir = norm([
  Math.cos(el) * Math.sin(az),
  Math.sin(el),
  Math.cos(el) * Math.cos(az),
]);
const worldUp = [0, 1, 0];
const right = norm(cross(worldUp, camDir));
const up = cross(camDir, right);

// centre on the bounding box
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < pos.length; i += 3) {
  minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
  minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
  minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
}
const centre = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];

// project to camera plane
const proj = new Float32Array((pos.length / 3) * 3); // sx, sy, depth
let maxAbsX = 1e-6;
let maxAbsY = 1e-6;
for (let i = 0, j = 0; i < pos.length; i += 3, j += 3) {
  const vx = pos[i] - centre[0];
  const vy = pos[i + 1] - centre[1];
  const vz = pos[i + 2] - centre[2];
  const x = vx * right[0] + vy * right[1] + vz * right[2];
  const y = vx * up[0] + vy * up[1] + vz * up[2];
  const z = vx * camDir[0] + vy * camDir[1] + vz * camDir[2];
  proj[j] = x;
  proj[j + 1] = y;
  proj[j + 2] = z;
  maxAbsX = Math.max(maxAbsX, Math.abs(x));
  maxAbsY = Math.max(maxAbsY, Math.abs(y));
}

const W = size * ss;
const H = size * ss;
const ppu = Math.min((W * 0.46) / maxAbsX, (H * 0.46) / maxAbsY);

// screen coords
const sx = new Float32Array(pos.length / 3);
const sy = new Float32Array(pos.length / 3);
for (let i = 0, j = 0; i < pos.length; i += 3, j += 3) {
  sx[j / 3] = W / 2 + proj[j] * ppu;
  sy[j / 3] = H / 2 - proj[j + 1] * ppu;
}

// ------------------------------------------------------------------ buffers
const rgb = new Float32Array(W * H * 3);
const depth = new Float32Array(W * H).fill(-Infinity);

// background: soft vertical wash
const bgTop = hexToLinear(P.light.background);
const bgBot = hexToLinear(P.light.fog);
for (let y = 0; y < H; y++) {
  const t = y / H;
  const c = [
    bgTop[0] + (bgBot[0] - bgTop[0]) * t,
    bgTop[1] + (bgBot[1] - bgTop[1]) * t,
    bgTop[2] + (bgBot[2] - bgTop[2]) * t,
  ];
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3;
    rgb[o] = c[0];
    rgb[o + 1] = c[1];
    rgb[o + 2] = c[2];
  }
}

// ------------------------------------------------------------------ raster
const vCount = pos.length / 3;
const triangles = idx ? idx.length / 3 : vCount / 3;

function shadeNormal(nx, ny, nz) {
  // double-sided: flip toward the camera
  if (nx * camDir[0] + ny * camDir[1] + nz * camDir[2] < 0) {
    nx = -nx; ny = -ny; nz = -nz;
  }
  const ndotl = Math.max(0, nx * sunDir[0] + ny * sunDir[1] + nz * sunDir[2]);
  const t = Math.min(0.9999, Math.max(0, ndotl * 0.5 + 0.5));
  const step = steps[Math.min(steps.length - 1, Math.floor(t * steps.length))];
  // hemisphere fill so shadowed petals stay pastel instead of going muddy
  const upness = ny * 0.5 + 0.5;
  const fill = 0.30 + 0.30 * upness;
  return 0.36 + fill * 0.62 * step + step * 0.34;
}

for (let t = 0; t < triangles; t++) {
  const i0 = idx ? idx[t * 3] : t * 3;
  const i1 = idx ? idx[t * 3 + 1] : t * 3 + 1;
  const i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;

  const ax = sx[i0], ay = sy[i0];
  const bx = sx[i1], by = sy[i1];
  const cx = sx[i2], cy = sy[i2];

  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (Math.abs(area) < 1e-9) continue;

  // world-space face normal
  const e1x = pos[i1 * 3] - pos[i0 * 3];
  const e1y = pos[i1 * 3 + 1] - pos[i0 * 3 + 1];
  const e1z = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
  const e2x = pos[i2 * 3] - pos[i0 * 3];
  const e2y = pos[i2 * 3 + 1] - pos[i0 * 3 + 1];
  const e2z = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];
  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const nl = Math.hypot(nx, ny, nz) || 1;
  const shade = shadeNormal(nx / nl, ny / nl, nz / nl);

  // vertex colours (linear)
  const cr = (col[i0 * 3] + col[i1 * 3] + col[i2 * 3]) / 3;
  const cg = (col[i0 * 3 + 1] + col[i1 * 3 + 1] + col[i2 * 3 + 1]) / 3;
  const cb = (col[i0 * 3 + 2] + col[i1 * 3 + 2] + col[i2 * 3 + 2]) / 3;

  const minPX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxPX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minPY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxPY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));

  const inv = 1 / area;

  for (let y = minPY; y <= maxPY; y++) {
    for (let x = minPX; x <= maxPX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) * inv;
      const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;

      const z = proj[i0 * 3 + 2] * w0 + proj[i1 * 3 + 2] * w1 + proj[i2 * 3 + 2] * w2;
      const o = y * W + x;
      if (z <= depth[o]) continue;
      depth[o] = z;

      rgb[o * 3] = cr * shade;
      rgb[o * 3 + 1] = cg * shade;
      rgb[o * 3 + 2] = cb * shade;
    }
  }
}

// ------------------------------------------------------------------ resolve
const out = Buffer.alloc(size * size * 4);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < ss; dy++) {
      for (let dx = 0; dx < ss; dx++) {
        const o = ((y * ss + dy) * W + (x * ss + dx)) * 3;
        r += rgb[o];
        g += rgb[o + 1];
        b += rgb[o + 2];
      }
    }
    const n = ss * ss;
    const o = (y * size + x) * 4;
    out[o] = Math.round(linearToSrgb(r / n) * 255);
    out[o + 1] = Math.round(linearToSrgb(g / n) * 255);
    out[o + 2] = Math.round(linearToSrgb(b / n) * 255);
    out[o + 3] = 255;
  }
}

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, encodePng(size, size, out));

console.log(`${spec.id}: ${triCount} tris, ${spec.scale[0]}-${spec.scale[1]} m -> ${path.relative(kitRoot, outPath)}`);
