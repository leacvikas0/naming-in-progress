// Pixel-art primitives + dependency-free PNG encoder.
// Everything the UI chrome is made of is authored here and compiled to PNG
// by game/ui/build-ui.mjs. Deterministic: no Math.random, no timestamps.

import { deflateSync } from "node:zlib";

/* ---------------- colors ---------------- */

const colorCache = new Map();

export function parseColor(input) {
  if (input === null || input === undefined) return null;
  if (Array.isArray(input)) {
    const [r, g, b, a = 255] = input;
    return [r | 0, g | 0, b | 0, a | 0];
  }
  const key = String(input).trim();
  const hit = colorCache.get(key);
  if (hit !== undefined) return hit;

  let s = key;
  if (s.startsWith("#")) s = s.slice(1);
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (s.length === 6) s += "ff";
  if (s.length !== 8) throw new Error(`parseColor: bad color "${input}"`);
  const n = Number.parseInt(s, 16);
  if (!Number.isFinite(n)) throw new Error(`parseColor: bad color "${input}"`);
  const out = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  colorCache.set(key, out);
  return out;
}

export function hex(rgba) {
  if (!rgba) return "none";
  const [r, g, b, a] = rgba;
  const p = (v) => v.toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}${a === 255 ? "" : p(a)}`;
}

/* ---------------- surface ---------------- */

export class Surface {
  constructor(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`Surface: bad size ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  index(x, y) {
    return (y * this.width + x) * 4;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  set(x, y, color) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`Surface.set: non-integer coords ${x},${y}`);
    }
    if (!this.inBounds(x, y)) return this;
    const i = this.index(x, y);
    const c = color === null || color === undefined ? null : Array.isArray(color) ? color : parseColor(color);
    if (!c) {
      this.data[i] = 0;
      this.data[i + 1] = 0;
      this.data[i + 2] = 0;
      this.data[i + 3] = 0;
    } else {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
      this.data[i + 3] = c[3] ?? 255;
    }
    return this;
  }

  get(x, y) {
    if (!this.inBounds(x, y)) return null;
    const i = this.index(x, y);
    const d = this.data;
    if (d[i + 3] === 0) return null;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  alphaAt(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.data[this.index(x, y) + 3];
  }

  clone() {
    const out = new Surface(this.width, this.height);
    out.data.set(this.data);
    return out;
  }

  fill(color) {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) this.set(x, y, color);
    return this;
  }

  clear() {
    this.data.fill(0);
    return this;
  }

  rect(x, y, w, h, color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
    return this;
  }

  stroke(x, y, w, h, color) {
    for (let i = 0; i < w; i++) {
      this.set(x + i, y, color);
      this.set(x + i, y + h - 1, color);
    }
    for (let j = 0; j < h; j++) {
      this.set(x, y + j, color);
      this.set(x + w - 1, y + j, color);
    }
    return this;
  }

  hline(x, y, len, color) {
    for (let i = 0; i < len; i++) this.set(x + i, y, color);
    return this;
  }

  vline(x, y, len, color) {
    for (let j = 0; j < len; j++) this.set(x, y + j, color);
    return this;
  }

  blit(src, dx, dy) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const c = src.get(x, y);
        if (c) this.set(dx + x, dy + y, c);
      }
    }
    return this;
  }

  flipX() {
    const out = new Surface(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.get(this.width - 1 - x, y);
        if (c) out.set(x, y, c);
      }
    }
    return out;
  }

  flipY() {
    const out = new Surface(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, this.height - 1 - y);
        if (c) out.set(x, y, c);
      }
    }
    return out;
  }

  rotate90() {
    const out = new Surface(this.height, this.width);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        if (c) out.set(this.height - 1 - y, x, c);
      }
    }
    return out;
  }

  scale(n) {
    if (!Number.isInteger(n) || n < 1) throw new Error("scale: n must be a positive integer");
    const out = new Surface(this.width * n, this.height * n);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.set(x * n + i, y * n + j, c);
      }
    }
    return out;
  }

  /** Count of non-transparent pixels — used by tests to catch empty art. */
  opaqueCount() {
    let n = 0;
    for (let i = 3; i < this.data.length; i += 4) if (this.data[i] > 0) n++;
    return n;
  }

  /** Distinct opaque colors — used by tests to keep the palette honest. */
  palette() {
    const set = new Set();
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] === 0) continue;
      set.add(`${this.data[i]},${this.data[i + 1]},${this.data[i + 2]},${this.data[i + 3]}`);
    }
    return [...set];
  }

  toPNG() {
    return encodePNG(this);
  }

  /** Horizontal ASCII preview — for debugging in the terminal. */
  toAscii(legend) {
    const lines = [];
    for (let y = 0; y < this.height; y++) {
      let line = "";
      for (let x = 0; x < this.width; x++) {
        const c = this.get(x, y);
        if (!c) {
          line += ".";
          continue;
        }
        const key = hex(c);
        line += legend && legend[key] ? legend[key] : "#";
      }
      lines.push(line);
    }
    return lines.join("\n");
  }
}

/* ---------------- ascii authoring ---------------- */

/**
 * Build a Surface from rows of characters.
 * legend maps a character to a color. "." is always transparent.
 * Every row must be the same length.
 */
export function fromAscii(rows, legend) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("fromAscii: no rows");
  const width = rows[0].length;
  for (const row of rows) {
    if (row.length !== width) throw new Error(`fromAscii: ragged rows (${row.length} vs ${width})`);
  }
  const surf = new Surface(width, rows.length);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      if (ch === ".") continue;
      const color = legend[ch];
      if (color === undefined) throw new Error(`fromAscii: no legend for "${ch}"`);
      if (color !== null) surf.set(x, y, color);
    }
  }
  return surf;
}

/* ---------------- png ---------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(surface) {
  const { width, height, data } = surface;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(data.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- deterministic noise ---------------- */

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
