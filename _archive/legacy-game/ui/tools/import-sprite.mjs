// Import AI-generated pixel art onto the project's strict pixel grid.
//
// The image model gives us good SHAPES but wrong PIXEL DIMENSIONS — it draws
// "pixel art" at 1254x1254 with 4-6px blocks that are not aligned to anything.
// This tool recovers the true grid, then re-renders the art at an exact
// authoring size (16x16 / 24x24 / 32x32) with a quantized palette, so the
// result is indistinguishable from hand-authored art.
//
// Usage:
//   node game/ui/tools/import-sprite.mjs <input.png> <out-name> \
//     --grid 16 --colors 10 --trim --key <r,g,b|auto>

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

import { Surface, parseColor, hex } from "../lib/pixel.mjs";
import { decodePNGToSurface } from "../lib/png-decode.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = join(HERE, "..", "gen");

/* ---------------- args ---------------- */

function parseArgs(argv) {
  const out = { grid: 16, colors: 12, trim: false, key: "auto", pad: 1, out: null, input: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--grid") out.grid = parseInt(argv[++i], 10);
    else if (a === "--colors") out.colors = parseInt(argv[++i], 10);
    else if (a === "--trim") out.trim = true;
    else if (a === "--pad") out.pad = parseInt(argv[++i], 10);
    else if (a === "--key") out.key = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else rest.push(a);
  }
  out.input = rest[0];
  if (!out.out) out.out = rest[1];
  return out;
}

/* ---------------- background keying ---------------- */

/**
 * Detect the background color: the most common color along the border ring.
 * Returns null when the border is already transparent (pre-keyed input).
 */
function detectBackground(surf) {
  const counts = new Map();
  const add = (x, y) => {
    const c = surf.get(x, y);
    if (!c) return;
    const k = `${c[0]},${c[1]},${c[2]}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  };
  const w = surf.width;
  const h = surf.height;
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, 1);
    add(x, h - 1);
    add(x, h - 2);
  }
  for (let y = 0; y < h; y++) {
    add(0, y);
    add(1, y);
    add(w - 1, y);
    add(w - 2, y);
  }
  if (!counts.size) return null;
  let best = null;
  let bestCount = -1;
  for (const [k, n] of counts) {
    if (n > bestCount) {
      bestCount = n;
      best = k.split(",").map(Number);
    }
  }
  return best;
}

/**
 * Key out the background with a soft tolerance, then de-fringe: pixels that
 * are a blend between the subject and the key colour get pulled toward the
 * nearest subject tone instead of keeping a halo.
 */
function keyBackground(surf, keyColor, tolerance = 46) {
  const [kr, kg, kb] = keyColor;
  const w = surf.width;
  const h = surf.height;

  const isBg = (x, y) => {
    const c = surf.get(x, y);
    if (!c) return true;
    const d = Math.max(Math.abs(c[0] - kr), Math.abs(c[1] - kg), Math.abs(c[2] - kb));
    return d <= tolerance;
  };

  // flood from the border so interior details that happen to match the key
  // colour (e.g. a black visor on a black background) are NOT erased
  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) {
    stack.push([x, 0], [x, h - 1]);
  }
  for (let y = 0; y < h; y++) {
    stack.push([0, y], [w - 1, y]);
  }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    if (!isBg(x, y)) continue;
    visited[idx] = 1;
    surf.set(x, y, null);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // de-fringe: any remaining pixel that is partly key-coloured loses the tint
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = surf.get(x, y);
      if (!c) continue;
      const d = Math.max(Math.abs(c[0] - kr), Math.abs(c[1] - kg), Math.abs(c[2] - kb));
      if (d < tolerance * 2.2) {
        // pull toward the local subject average
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nc = surf.get(x + dx, y + dy);
            if (!nc) continue;
            const nd = Math.max(Math.abs(nc[0] - kr), Math.abs(nc[1] - kg), Math.abs(nc[2] - kb));
            if (nd <= tolerance * 2.2) continue;
            r += nc[0];
            g += nc[1];
            b += nc[2];
            n++;
          }
        }
        if (n > 0) surf.set(x, y, [Math.round(r / n), Math.round(g / n), Math.round(b / n), c[3]]);
      }
    }
  }

  return surf;
}

/* ---------------- grid recovery ---------------- */

function contentBounds(surf) {
  let minX = surf.width;
  let minY = surf.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < surf.height; y++) {
    for (let x = 0; x < surf.width; x++) {
      if (surf.alphaAt(x, y) > 24) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("import-sprite: no opaque content found");
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Estimate the art's native pixel-block size.
 *
 * Autocorrelation is useless here: adjacent pixels inside a block always
 * agree, so lag-1 scores highest and always wins. Instead, find the x and y
 * positions where alpha flips, and take the GCD of their spacings — block
 * boundaries are all integer multiples of the true block size.
 */
function estimateBlockSize(surf, bounds) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const { minX, minY, maxX, maxY } = bounds;

  const collect = (axis) => {
    const positions = [];
    const outer = axis === "x" ? maxX - minX : maxY - minY;
    const inner = axis === "x" ? maxY - minY : maxX - minX;
    let prev = null;
    for (let i = 0; i <= outer; i++) {
      for (let j = 0; j <= inner; j++) {
        const x = axis === "x" ? minX + i : minX + j;
        const y = axis === "x" ? minY + j : minY + i;
        const on = surf.alphaAt(x, y) > 24;
        if (prev !== null && on !== prev) positions.push(i);
        prev = on;
        if (on) break; // only the first transition per line
      }
      prev = null;
    }
    return positions;
  };

  const spacings = [];
  for (const axis of ["x", "y"]) {
    const pos = collect(axis);
    for (let i = 1; i < pos.length; i++) {
      const d = pos[i] - pos[i - 1];
      if (d > 0) spacings.push(d);
    }
  }
  if (!spacings.length) return { block: 1, confidence: 0 };

  // Ignore 1-2px spacings: those are anti-aliasing residue on the silhouette,
  // not real block boundaries. Real blocks are several pixels wide.
  const counts = new Map();
  for (const d of spacings) {
    if (d < 3) continue;
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  if (!counts.size) return { block: 1, confidence: 0 };

  // Cluster near-identical spacings (±2) and take the strongest cluster mean.
  const sorted = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  const clusters = [];
  for (const [d, n] of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && d - last.max <= 2) {
      last.max = d;
      last.weight += n;
      last.sum += d * n;
    } else {
      clusters.push({ min: d, max: d, weight: n, sum: d * n });
    }
  }
  clusters.sort((a, b) => b.weight - a.weight);
  const winner = clusters[0];
  const block = Math.max(1, Math.round(winner.sum / winner.weight));
  const confidence = winner.weight / [...counts.values()].reduce((a, b) => a + b, 0);

  return { block, confidence };
}

/**
 * Downsample onto the target grid by box-averaging each cell.
 *
 * Alpha is BINARY, not averaged: pixel art has hard edges. A cell is either
 * part of the shape or it is not. Averaging alpha produces a grey halo that
 * both looks wrong and multiplies the distinct colours, which defeats
 * quantization.
 */
function resample(surf, bounds, targetGrid, pad = 1) {
  const inner = targetGrid - pad * 2;
  const out = new Surface(targetGrid, targetGrid);

  const cellW = bounds.w / inner;
  const cellH = bounds.h / inner;

  for (let gy = 0; gy < inner; gy++) {
    for (let gx = 0; gx < inner; gx++) {
      const sx0 = bounds.minX + gx * cellW;
      const sy0 = bounds.minY + gy * cellH;
      const sx1 = bounds.minX + (gx + 1) * cellW;
      const sy1 = bounds.minY + (gy + 1) * cellH;

      let r = 0;
      let g = 0;
      let b = 0;
      let aSum = 0;
      let weight = 0;

      const x0 = Math.floor(sx0);
      const x1 = Math.ceil(sx1);
      const y0 = Math.floor(sy0);
      const y1 = Math.ceil(sy1);

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (x < 0 || y < 0 || x >= surf.width || y >= surf.height) continue;
          const ox = Math.min(x + 1, sx1) - Math.max(x, sx0);
          const oy = Math.min(y + 1, sy1) - Math.max(y, sy0);
          if (ox <= 0 || oy <= 0) continue;
          const wgt = ox * oy;
          const c = surf.get(x, y);
          const alpha = c ? c[3] / 255 : 0;
          aSum += alpha * wgt;
          weight += wgt;
          if (c && alpha > 0) {
            r += c[0] * alpha * wgt;
            g += c[1] * alpha * wgt;
            b += c[2] * alpha * wgt;
          }
        }
      }

      if (weight === 0) continue;
      const coverage = aSum / weight;
      if (coverage < 0.5) continue; // hard edge: fully on or fully off
      const norm = Math.max(1e-6, aSum);
      out.set(gx + pad, gy + pad, [
        Math.round(r / norm),
        Math.round(g / norm),
        Math.round(b / norm),
        255,
      ]);
    }
  }

  return out;
}

/* ---------------- palette quantization ---------------- */

/**
 * Median-cut quantization to at most `maxColors` entries, then map every
 * pixel to its nearest palette entry. This is what makes the result read as
 * deliberate pixel art rather than a photo shrink.
 */
function quantize(surf, maxColors) {
  const pixels = [];
  for (let y = 0; y < surf.height; y++) {
    for (let x = 0; x < surf.width; x++) {
      const c = surf.get(x, y);
      if (c) pixels.push([c[0], c[1], c[2]]);
    }
  }
  if (!pixels.length) return surf;

  const unique = new Map();
  for (const p of pixels) {
    const k = `${p[0]},${p[1]},${p[2]}`;
    unique.set(k, (unique.get(k) || 0) + 1);
  }
  if (unique.size <= maxColors) return surf;

  let boxes = [
    [...unique.entries()].map(([k, n]) => {
      const [r, g, b] = k.split(",").map(Number);
      return { r, g, b, n };
    }),
  ];

  while (boxes.length < maxColors) {
    let target = -1;
    let targetRange = 0;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.length < 2) continue;
      let rMin = 255;
      let rMax = 0;
      let gMin = 255;
      let gMax = 0;
      let bMin = 255;
      let bMax = 0;
      for (const p of box) {
        rMin = Math.min(rMin, p.r);
        rMax = Math.max(rMax, p.r);
        gMin = Math.min(gMin, p.g);
        gMax = Math.max(gMax, p.g);
        bMin = Math.min(bMin, p.b);
        bMax = Math.max(bMax, p.b);
      }
      const range = Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
      if (range > targetRange) {
        targetRange = range;
        target = i;
      }
    }
    if (target < 0) break;

    const box = boxes[target];
    let rMin = 255;
    let rMax = 0;
    let gMin = 255;
    let gMax = 0;
    let bMin = 255;
    let bMax = 0;
    for (const p of box) {
      rMin = Math.min(rMin, p.r);
      rMax = Math.max(rMax, p.r);
      gMin = Math.min(gMin, p.g);
      gMax = Math.max(gMax, p.g);
      bMin = Math.min(bMin, p.b);
      bMax = Math.max(bMax, p.b);
    }
    const rr = rMax - rMin;
    const gr = gMax - gMin;
    const br = bMax - bMin;
    const axis = rr >= gr && rr >= br ? "r" : gr >= br ? "g" : "b";
    box.sort((a, b) => a[axis] - b[axis]);
    let total = 0;
    for (const p of box) total += p.n;
    let acc = 0;
    let split = 1;
    for (let i = 0; i < box.length; i++) {
      acc += box[i].n;
      if (acc >= total / 2) {
        split = Math.max(1, Math.min(box.length - 1, i));
        break;
      }
    }
    boxes.splice(target, 1, box.slice(0, split), box.slice(split));
  }

  const palette = boxes
    .filter((box) => box.length)
    .map((box) => {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (const p of box) {
        r += p.r * p.n;
        g += p.g * p.n;
        b += p.b * p.n;
        n += p.n;
      }
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    });

  for (let y = 0; y < surf.height; y++) {
    for (let x = 0; x < surf.width; x++) {
      const c = surf.get(x, y);
      if (!c) continue;
      let best = palette[0];
      let bestD = Infinity;
      for (const p of palette) {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      surf.set(x, y, [best[0], best[1], best[2], c[3]]);
    }
  }

  return surf;
}

/* ---------------- main ---------------- */

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.out) {
    console.error("usage: import-sprite.mjs <input.png> <out-name> [--grid N] [--colors N] [--trim] [--pad N] [--key auto|r,g,b]");
    process.exit(1);
  }

  const buf = readFileSync(args.input);
  let surf = decodePNGToSurface(buf);
  console.log(`input      ${basename(args.input)}  ${surf.width}x${surf.height}`);

  const keyColor = args.key === "auto" ? detectBackground(surf) : parseColor(args.key);
  if (keyColor) {
    console.log(`key color  rgb(${keyColor[0]},${keyColor[1]},${keyColor[2]})`);
    surf = keyBackground(surf, keyColor);
  } else {
    console.log("key color  none (border already transparent)");
  }

  const bounds = contentBounds(surf);
  console.log(`content    ${bounds.w}x${bounds.h} at ${bounds.minX},${bounds.minY}`);

  const { block, confidence } = estimateBlockSize(surf, bounds);
  const nativeGrid = Math.round(bounds.w / block);
  console.log(
    `block est  ${block}px (confidence ${(confidence * 100).toFixed(0)}%) → native grid ≈ ${nativeGrid}x${Math.round(bounds.h / block)}`
  );

  const target = resample(surf, bounds, args.grid, args.pad);
  const quantized = quantize(target, args.colors);

  const outPath = join(GEN, `${args.out}.png`);
  writeFileSync(outPath, quantized.toPNG());

  const opaque = quantized.opaqueCount();
  console.log(`output     ${args.out}.png  ${quantized.width}x${quantized.height}  ${opaque} opaque px  ${quantized.palette().length} colors`);
  console.log(`→ ${outPath}`);
}

main();
