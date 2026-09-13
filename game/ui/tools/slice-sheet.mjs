// Slice a sprite sheet into separate PNGs by finding connected components of
// opaque pixels. Used to split AI-generated icon sheets into individual icons
// before grid import.
//
// Usage: node game/ui/tools/slice-sheet.mjs <input.png> <out-dir> <prefix> [--min-area N]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { Surface } from "../lib/pixel.mjs";
import { decodePNGToSurface } from "../lib/png-decode.mjs";

function parseArgs(argv) {
  const out = { minArea: 400, key: "auto", split: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--min-area") out.minArea = parseInt(argv[++i], 10);
    else if (a === "--key") out.key = argv[++i];
    else if (a === "--split") out.split = argv[++i];
    else rest.push(a);
  }
  out.input = rest[0];
  out.outDir = rest[1];
  out.prefix = rest[2] || "slice";
  return out;
}

function detectBackground(surf) {
  const counts = new Map();
  const add = (x, y) => {
    const c = surf.get(x, y);
    if (!c) return;
    const k = `${c[0]},${c[1]},${c[2]}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  };
  for (let x = 0; x < surf.width; x++) {
    add(x, 0);
    add(x, surf.height - 1);
  }
  for (let y = 0; y < surf.height; y++) {
    add(0, y);
    add(surf.width - 1, y);
  }
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

function keyBackground(surf, keyColor, tolerance) {
  const [kr, kg, kb] = keyColor;
  const w = surf.width;
  const h = surf.height;
  const isBg = (x, y) => {
    const c = surf.get(x, y);
    if (!c) return true;
    return Math.max(Math.abs(c[0] - kr), Math.abs(c[1] - kg), Math.abs(c[2] - kb)) <= tolerance;
  };

  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) stack.push([0, y], [w - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx] || !isBg(x, y)) continue;
    visited[idx] = 1;
    surf.set(x, y, null);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return surf;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const buf = readFileSync(args.input);
  let surf = decodePNGToSurface(buf);
  const keyColor = args.key === "auto" ? detectBackground(surf) : args.key.split(",").map(Number);
  surf = keyBackground(surf, keyColor, 40);

  const w = surf.width;
  const h = surf.height;

  /* ---- regular grid split: the reliable path for sheets laid out on a grid ---- */
  if (args.split) {
    const [cols, rows] = args.split.split("x").map(Number);
    if (!cols || !rows) throw new Error("--split must look like 2x2");
    mkdirSync(args.outDir, { recursive: true });

    // find the tight content bounds of each cell, so icons are not padded
    // by however the model happened to space them
    const cellW = Math.floor(w / cols);
    const cellH = Math.floor(h / rows);
    const written = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = c * cellW;
        const y0 = r * cellH;
        const x1 = c === cols - 1 ? w - 1 : (c + 1) * cellW - 1;
        const y1 = r === rows - 1 ? h - 1 : (r + 1) * cellH - 1;

        let minX = x1;
        let minY = y1;
        let maxX = x0;
        let maxY = y0;
        let found = false;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            if (surf.alphaAt(x, y) > 24) {
              found = true;
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (!found) {
          console.log(`  cell ${r},${c} empty — skipped`);
          continue;
        }

        const pad = 4;
        const cx0 = Math.max(x0, minX - pad);
        const cy0 = Math.max(y0, minY - pad);
        const cx1 = Math.min(x1, maxX + pad);
        const cy1 = Math.min(y1, maxY + pad);
        const cw = cx1 - cx0 + 1;
        const chh = cy1 - cy0 + 1;

        const piece = new Surface(cw, chh);
        for (let y = cy0; y <= cy1; y++) {
          for (let x = cx0; x <= cx1; x++) {
            const col = surf.get(x, y);
            if (col) piece.set(x - cx0, y - cy0, col);
          }
        }
        const name = `${args.prefix}-${r * cols + c + 1}.png`;
        writeFileSync(join(args.outDir, name), piece.toPNG());
        written.push({ name, w: cw, h: chh });
      }
    }

    console.log(`key color  rgb(${keyColor.join(",")})`);
    console.log(`split      ${cols}x${rows} → ${written.length} cells`);
    for (const f of written) console.log(`  ${f.name.padEnd(22)} ${f.w}x${f.h}`);
    return;
  }

  // connected components on the alpha mask
  const label = new Int32Array(w * h).fill(-1);
  const components = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== -1) continue;
      if (surf.alphaAt(x, y) <= 24) continue;
      const id = components.length;
      const stack = [[x, y]];
      const pixels = [];
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      label[y * w + x] = id;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        pixels.push([cx, cy]);
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (label[ni] !== -1) continue;
          if (surf.alphaAt(nx, ny) <= 24) continue;
          label[ni] = id;
          stack.push([nx, ny]);
        }
      }
      components.push({ id, pixels, minX, minY, maxX, maxY, area: pixels.length });
    }
  }

  const big = components.filter((c) => c.area >= args.minArea);
  // reading order: top-to-bottom, then left-to-right
  big.sort((a, b) => {
    const rowA = Math.floor(a.minY / (h / 2));
    const rowB = Math.floor(b.minY / (h / 2));
    if (rowA !== rowB) return rowA - rowB;
    return a.minX - b.minX;
  });

  mkdirSync(args.outDir, { recursive: true });
  const written = [];
  big.forEach((c, i) => {
    const pad = 6;
    const x0 = Math.max(0, c.minX - pad);
    const y0 = Math.max(0, c.minY - pad);
    const x1 = Math.min(w - 1, c.maxX + pad);
    const y1 = Math.min(h - 1, c.maxY + pad);
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;

    const piece = new Surface(cw, ch);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (label[y * w + x] === c.id) {
          const col = surf.get(x, y);
          if (col) piece.set(x - x0, y - y0, col);
        }
      }
    }
    const name = `${args.prefix}-${i + 1}.png`;
    writeFileSync(join(args.outDir, name), piece.toPNG());
    written.push({ name, w: cw, h: ch, area: c.area });
  });

  console.log(`key color  rgb(${keyColor.join(",")})`);
  console.log(`components ${components.length}, kept ${written.length} (min-area ${args.minArea})`);
  for (const f of written) console.log(`  ${f.name.padEnd(22)} ${f.w}x${f.h}  ${f.area} px`);
}

main();
