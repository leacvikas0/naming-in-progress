// Throwaway preview for the ground (agent-ground). No browser, no server.
//   node scratch/agent-ground/render-ground.mjs
//
// Rasterises the real terrain + path geometry with a perspective camera from
// the recipe, shaded with the palette's sun / hemisphere / ambient values, and
// writes PNGs to scratch/agent-ground/shots/. Same idea as tools/render.mjs,
// but perspective and for arbitrary meshes.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { resolveConfig } from "../../src/core/config.js";
import { createTerrain } from "../../src/ground/terrain.js";
import { createPath } from "../../src/ground/path.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "shots");
mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------------ png
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ colour
const linearToSrgb = (c) => {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
};
const aces = (x) => (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);

// ------------------------------------------------------------------ scene
const config = resolveConfig({ quality: "high" });
const materials = { get: () => new THREE.MeshLambertMaterial({ vertexColors: true }) };
const terrain = createTerrain(config, materials);
const paths = createPath(config, terrain.heightAt, materials);

const P = config.palette;
const sunEl = THREE.MathUtils.degToRad(P.light.sunElevation);
const sunAz = THREE.MathUtils.degToRad(P.light.sunAzimuth);
const sunDir = new THREE.Vector3(
  Math.cos(sunEl) * Math.sin(sunAz),
  Math.sin(sunEl),
  Math.cos(sunEl) * Math.cos(sunAz)
).normalize();
const sunCol = new THREE.Color(P.light.sun);
const skyCol = new THREE.Color(P.light.sky);
const bounceCol = new THREE.Color(P.light.groundBounce);
const ambCol = new THREE.Color(P.light.ambient);
const sunI = P.light.sunIntensity;
const hemiI = P.light.hemiIntensity;
const ambI = P.light.ambientIntensity;
const exposure = P.light.exposure ?? 1;

const meshes = [terrain.mesh, ...paths.meshes];

// ------------------------------------------------------------------ camera
function lookAt(eye, target) {
  const f = new THREE.Vector3().subVectors(target, eye).normalize();
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  return { eye, f, r, u };
}

function render({ eye, target, fov = 42, width = 900, height = 600, name, albedo = false, exposure: expo = 0.34 }) {
  const cam = lookAt(new THREE.Vector3(...eye), new THREE.Vector3(...target));
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const aspect = width / height;

  const SS = 2; // supersample
  const W = width * SS;
  const H = height * SS;
  const rgb = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);

  // background wash, sky to fog
  const bgTop = new THREE.Color(P.light.background);
  const bgBot = new THREE.Color(P.light.fog);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      rgb[o] = bgTop.r + (bgBot.r - bgTop.r) * t;
      rgb[o + 1] = bgTop.g + (bgBot.g - bgTop.g) * t;
      rgb[o + 2] = bgTop.b + (bgBot.b - bgTop.b) * t;
    }
  }

  const v = new THREE.Vector3();
  const tmpN = new THREE.Vector3();

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    const nrm = geo.attributes.normal.array;
    const idx = geo.index ? geo.index.array : null;
    const triCount = idx ? idx.length / 3 : pos.length / 9;
    const count = pos.length / 3;

    // project every vertex once
    const sx = new Float32Array(count);
    const sy = new Float32Array(count);
    const sz = new Float32Array(count); // view depth
    const okVert = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      v.set(pos[i * 3] - cam.eye.x, pos[i * 3 + 1] - cam.eye.y, pos[i * 3 + 2] - cam.eye.z);
      const zc = v.dot(cam.f);
      const xc = v.dot(cam.r);
      const yc = v.dot(cam.u);
      if (zc < 0.25) {
        okVert[i] = 0;
        continue;
      }
      okVert[i] = 1;
      sz[i] = zc;
      sx[i] = W / 2 + ((xc / zc) * W) / (2 * tanHalf * aspect);
      sy[i] = H / 2 - ((yc / zc) * H) / (2 * tanHalf);
    }

    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx[t * 3] : t * 3;
      const i1 = idx ? idx[t * 3 + 1] : t * 3 + 1;
      const i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
      if (!okVert[i0] || !okVert[i1] || !okVert[i2]) continue;

      const ax = sx[i0], ay = sy[i0];
      const bx = sx[i1], by = sy[i1];
      const cx = sx[i2], cy = sy[i2];
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-9) continue;

      const minPX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const maxPX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minPY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const maxPY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      if (minPX > maxPX || minPY > maxPY) continue;

      const inv = 1 / area;
      const invZ0 = 1 / sz[i0], invZ1 = 1 / sz[i1], invZ2 = 1 / sz[i2];

      for (let y = minPY; y <= maxPY; y++) {
        for (let x = minPX; x <= maxPX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) * inv;
          const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;

          const iz = invZ0 * w0 + invZ1 * w1 + invZ2 * w2;
          const z = 1 / iz;
          const o = y * W + x;
          if (z >= depth[o]) continue;
          depth[o] = z;

          // perspective-correct weights
          const b0 = (w0 * invZ0) / iz;
          const b1 = (w1 * invZ1) / iz;
          const b2 = (w2 * invZ2) / iz;

          tmpN.set(
            nrm[i0 * 3] * b0 + nrm[i1 * 3] * b1 + nrm[i2 * 3] * b2,
            nrm[i0 * 3 + 1] * b0 + nrm[i1 * 3 + 1] * b1 + nrm[i2 * 3 + 1] * b2,
            nrm[i0 * 3 + 2] * b0 + nrm[i1 * 3 + 2] * b1 + nrm[i2 * 3 + 2] * b2
          ).normalize();

          const ndl = Math.max(0, tmpN.dot(sunDir));
          const up = tmpN.y * 0.5 + 0.5;

          const ar = col[i0 * 3] * b0 + col[i1 * 3] * b1 + col[i2 * 3] * b2;
          const ag = col[i0 * 3 + 1] * b0 + col[i1 * 3 + 1] * b1 + col[i2 * 3 + 1] * b2;
          const ab = col[i0 * 3 + 2] * b0 + col[i1 * 3 + 2] * b1 + col[i2 * 3 + 2] * b2;

          const lr = sunCol.r * sunI * ndl + (bounceCol.r + (skyCol.r - bounceCol.r) * up) * hemiI + ambCol.r * ambI;
          const lg = sunCol.g * sunI * ndl + (bounceCol.g + (skyCol.g - bounceCol.g) * up) * hemiI + ambCol.g * ambI;
          const lb = sunCol.b * sunI * ndl + (bounceCol.b + (skyCol.b - bounceCol.b) * up) * hemiI + ambCol.b * ambI;

          if (albedo) {
            // Unlit pass: what the vertex colours actually are, so the colour
            // design can be judged without the scene lighting in the way.
            rgb[o * 3] = ar;
            rgb[o * 3 + 1] = ag;
            rgb[o * 3 + 2] = ab;
          } else {
            rgb[o * 3] = aces(ar * lr * expo);
            rgb[o * 3 + 1] = aces(ag * lg * expo);
            rgb[o * 3 + 2] = aces(ab * lb * expo);
          }
        }
      }
    }
  }

  // resolve with 2x box downsample done in one pass (render at 2x)
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const o = ((y * SS + dy) * W + (x * SS + dx)) * 3;
          r += rgb[o];
          g += rgb[o + 1];
          b += rgb[o + 2];
        }
      }
      const n = SS * SS;
      const o = (y * width + x) * 4;
      out[o] = Math.round(linearToSrgb(r / n) * 255);
      out[o + 1] = Math.round(linearToSrgb(g / n) * 255);
      out[o + 2] = Math.round(linearToSrgb(b / n) * 255);
      out[o + 3] = 255;
    }
  }

  const file = path.join(outDir, `${name}.png`);
  writeFileSync(file, encodePng(width, height, out));
  console.log(`${name}.png  ${width}x${height}  eye ${eye.join(",")}`);
}

const cam = config.recipe.camera;
render({
  eye: cam.position,
  target: cam.target,
  fov: cam.fov,
  width: 900,
  height: 600,
  name: "ground-recipe",
});

// higher, looking down the main path: shows the ribbon shape and its edges
render({
  eye: [6.5, 5.5, 9.5],
  target: [-1.5, 0.2, -2.0],
  fov: 40,
  width: 900,
  height: 600,
  name: "ground-high",
});

// eye level beside the trail: the view that shows whether the edge reads
render({
  eye: [2.6, 1.15, 1.4],
  target: [0.2, 0.35, -3.2],
  fov: 45,
  width: 900,
  height: 600,
  name: "ground-close",
});

// albedo-only passes: the colour design with the lighting taken out
render({
  eye: [6.5, 5.5, 9.5],
  target: [-1.5, 0.2, -2.0],
  fov: 40,
  width: 900,
  height: 600,
  name: "ground-high-albedo",
  albedo: true,
});

render({
  eye: [2.6, 1.15, 1.4],
  target: [0.2, 0.35, -3.2],
  fov: 45,
  width: 900,
  height: 600,
  name: "ground-close-albedo",
  albedo: true,
});

// from above: the only view that shows whether a trail reads as a trail and
// not as a stripe
render({
  eye: [0, 17, 2.0],
  target: [0, 0, 0],
  fov: 55,
  width: 900,
  height: 900,
  name: "ground-top-albedo",
  albedo: true,
});

