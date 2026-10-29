// PNG decode. Counterpart to pixel.mjs's encoder — same filter/format rules
// (8-bit RGBA, non-interlaced), so the round trip is exact.
//
// Used by tools/import-sprite.mjs to bring AI-generated pixel art onto the
// project's strict pixel grid.

import { inflateSync } from "node:zlib";
import { Surface } from "./pixel.mjs";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decode a PNG buffer into { width, height, data: Uint8ClampedArray (RGBA) }. */
export function decodePNG(buf) {
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIGNATURE[i]) throw new Error("decodePNG: bad signature");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  let palette = null;
  let trns = null;

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      trns = Buffer.from(data);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + len;
  }

  if (interlace !== 0) throw new Error("decodePNG: interlaced PNGs are not supported");
  if (bitDepth !== 8) throw new Error(`decodePNG: unsupported bit depth ${bitDepth}`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`decodePNG: unsupported color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (raw.length !== expected) {
    throw new Error(`decodePNG: expected ${expected} bytes of image data, got ${raw.length}`);
  }

  // undo per-scanline filtering
  const lines = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const line = lines.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let value = src[x];
      if (filter === 1) value = (value + a) & 0xff;
      else if (filter === 2) value = (value + b) & 0xff;
      else if (filter === 3) value = (value + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) value = (value + paeth(a, b, c)) & 0xff;
      else if (filter !== 0) throw new Error(`decodePNG: bad filter ${filter} on row ${y}`);
      line[x] = value;
    }
    prev = line;
  }

  // expand to RGBA
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    if (colorType === 6) {
      out[d] = lines[s];
      out[d + 1] = lines[s + 1];
      out[d + 2] = lines[s + 2];
      out[d + 3] = lines[s + 3];
    } else if (colorType === 2) {
      out[d] = lines[s];
      out[d + 1] = lines[s + 1];
      out[d + 2] = lines[s + 2];
      out[d + 3] = 255;
    } else if (colorType === 0) {
      out[d] = out[d + 1] = out[d + 2] = lines[s];
      out[d + 3] = 255;
    } else if (colorType === 4) {
      out[d] = out[d + 1] = out[d + 2] = lines[s];
      out[d + 3] = lines[s + 1];
    } else if (colorType === 3) {
      const idx = lines[s];
      out[d] = palette[idx * 3];
      out[d + 1] = palette[idx * 3 + 1];
      out[d + 2] = palette[idx * 3 + 2];
      out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }

  return { width, height, data: out };
}

/** Decode a PNG buffer straight into a Surface. */
export function decodePNGToSurface(buf) {
  const img = decodePNG(buf);
  const s = new Surface(img.width, img.height);
  s.data.set(img.data);
  return s;
}
