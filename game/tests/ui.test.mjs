// UI asset integrity tests. Verifies the generated chrome is real, non-empty,
// correctly sized, on-palette, and that the font parses as valid sfnt.
// Run: node game/tests/ui.test.mjs

import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = join(HERE, "..", "ui", "gen");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("ui chrome assets");

/* ---------------- png decode (minimal, for verification) ---------------- */

function decodePNG(buf) {
  assert.equal(buf.readUInt32BE(0), 0x89504e47, "png signature");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "bit depth 8");
      assert.equal(data[9], 6, "color type RGBA");
      assert.equal(data[12], 0, "not interlaced");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + len;
  }
  assert.ok(width > 0 && height > 0, "IHDR present");

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  assert.equal(raw.length, (stride + 1) * height, "raw size matches dimensions");

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (stride + 1)], 0, `filter type 0 on row ${y}`);
    raw.copy(pixels, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  }
  return { width, height, pixels };
}

function alphaStats({ width, height, pixels }) {
  let opaque = 0;
  let transparent = 0;
  const colors = new Set();
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a === 0) {
      transparent++;
      continue;
    }
    opaque++;
    colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  }
  return { opaque, transparent, colors: colors.size, total: width * height };
}

/* ---------------- required assets ---------------- */

const REQUIRED = [
  "frame-slab.png",
  "frame-slab-dark.png",
  "frame-slab-deep.png",
  "frame-slab-iron.png",
  "frame-trough.png",
  "frame-trough-gold.png",
  "frame-roster.png",
  "frame-roster-selected.png",
  "frame-keycap.png",
  "frame-keycap-hot.png",
  "frame-ornate-common.png",
  "frame-ornate-rare.png",
  "frame-ornate-epic.png",
  "frame-button-common.png",
  "frame-button-rare.png",
  "frame-button-epic.png",
  "frame-well-common.png",
  "frame-well-rare.png",
  "frame-well-epic.png",
  "frame-divider-common.png",
  "frame-divider-rare.png",
  "frame-divider-epic.png",
  "divider-boss.png",
  "divider-boss-common.png",
  "divider-boss-rare.png",
  "divider-boss-epic.png",
  "icon-knight.png",
  "icon-barbarian.png",
  "icon-rogue.png",
  "icon-mage.png",
  "icon-hp.png",
  "icon-dmg.png",
  "icon-spd.png",
  "icon-coin.png",
  "icon-skull.png",
  "icon-rune.png",
  "icon-flask.png",
  "icon-shield.png",
  "icon-clock.png",
  "icon-star.png",
  "sigil-knight.png",
  "sigil-barbarian.png",
  "sigil-rogue.png",
  "sigil-mage.png",
  "PixelChrome-Regular.ttf",
];

test("every required asset exists", () => {
  const missing = REQUIRED.filter((f) => !existsSync(join(GEN, f)));
  assert.equal(missing.length, 0, `missing: ${missing.join(", ")}`);
});

test("frames are exactly the source size the border-image slices expect", () => {
  // These numbers are load-bearing: they must match border-image-slice in
  // game/style.css. A mismatch silently blurs or clips every panel.
  const expect = {
    "frame-slab.png": [32, 32],
    "frame-slab-dark.png": [32, 32],
    "frame-slab-deep.png": [32, 32],
    "frame-slab-iron.png": [32, 32],
    "frame-trough.png": [20, 20],
    "frame-trough-gold.png": [20, 20],
    "frame-roster.png": [24, 18],
    "frame-roster-selected.png": [24, 18],
    "frame-keycap.png": [22, 22],
    "frame-ornate-common.png": [40, 40],
    "frame-button-common.png": [56, 28],
    "frame-divider-common.png": [128, 12],
    "divider-boss.png": [12, 12],
    "icon-knight.png": [16, 16],
    "sigil-knight.png": [32, 32],
    "sigil-barbarian.png": [32, 32],
    "sigil-rogue.png": [32, 32],
    "sigil-mage.png": [32, 32],
  };
  for (const [file, [w, h]] of Object.entries(expect)) {
    const img = decodePNG(readFileSync(join(GEN, file)));
    assert.equal(img.width, w, `${file} width`);
    assert.equal(img.height, h, `${file} height`);
  }
});

test("class sigils are distinct, well-filled, and palette-restrained", () => {
  const seen = new Map();
  for (const name of ["knight", "barbarian", "rogue", "mage"]) {
    const file = `sigil-${name}.png`;
    const img = decodePNG(readFileSync(join(GEN, file)));
    const { opaque, total, colors } = alphaStats(img);

    // a sigil should fill a meaningful share of its 32x32 cell, but never all
    assert.ok(opaque > total * 0.12, `${file} too empty: ${opaque}/${total}`);
    assert.ok(opaque < total * 0.92, `${file} is a solid block: ${opaque}/${total}`);

    // generated imports must be quantized or they read as a shrunken photo
    assert.ok(colors <= 14, `${file} has ${colors} colors — quantization failed`);

    // no two sigils may be identical
    const key = readFileSync(join(GEN, file)).toString("base64");
    assert.ok(!seen.has(key), `${file} is identical to ${seen.get(key)}`);
    seen.set(key, file);
  }
});

test("sigils have hard alpha (no anti-aliased halo)", () => {
  // AI imports must be re-thresholded to binary alpha; semi-transparent
  // fringes both look wrong and break palette quantization.
  for (const name of ["knight", "barbarian", "rogue", "mage"]) {
    const img = decodePNG(readFileSync(join(GEN, `sigil-${name}.png`)));
    let soft = 0;
    for (let i = 3; i < img.pixels.length; i += 4) {
      const a = img.pixels[i];
      if (a > 0 && a < 255) soft++;
    }
    assert.equal(soft, 0, `sigil-${name} has ${soft} semi-transparent pixels`);
  }
});

test("ornate and button tier variants differ per tier", () => {
  for (const prefix of ["frame-ornate", "frame-button", "frame-well", "divider-boss"]) {
    const common = readFileSync(join(GEN, `${prefix}-common.png`));
    const rare = readFileSync(join(GEN, `${prefix}-rare.png`));
    const epic = readFileSync(join(GEN, `${prefix}-epic.png`));
    assert.ok(!common.equals(rare), `${prefix}: common vs rare`);
    assert.ok(!rare.equals(epic), `${prefix}: rare vs epic`);
    assert.ok(!common.equals(epic), `${prefix}: common vs epic`);
  }
});

test("frames have real pixel content (not blank)", () => {
  for (const file of REQUIRED.filter((f) => f.endsWith(".png"))) {
    const img = decodePNG(readFileSync(join(GEN, file)));
    const { opaque, total } = alphaStats(img);
    assert.ok(opaque > total * 0.1, `${file} is too empty: ${opaque}/${total}`);
  }
});

test("icons use a restrained palette (<= 14 colors)", () => {
  const names = [
    "hp", "dmg", "spd", "coin", "skull", "rune",
    "flask", "shield", "clock", "star",
  ];
  for (const name of names) {
    const img = decodePNG(readFileSync(join(GEN, `icon-${name}.png`)));
    const { colors } = alphaStats(img);
    assert.ok(colors <= 14, `icon-${name} has ${colors} colors`);
    assert.ok(colors >= 3, `icon-${name} has only ${colors} colors — flat or broken`);
  }
});

test("9-slice frames have transparent corners (so corners chisel)", () => {
  for (const file of ["frame-slab.png", "frame-ornate-common.png", "frame-keycap.png"]) {
    const img = decodePNG(readFileSync(join(GEN, file)));
    const at = (x, y) => img.pixels[(y * img.width + x) * 4 + 3];
    assert.equal(at(0, 0), 0, `${file} top-left corner transparent`);
    assert.equal(at(img.width - 1, 0), 0, `${file} top-right corner transparent`);
    assert.equal(at(0, img.height - 1), 0, `${file} bottom-left corner transparent`);
    assert.equal(at(img.width - 1, img.height - 1), 0, `${file} bottom-right corner transparent`);
    const mid = Math.floor(img.width / 2);
    assert.ok(at(mid, Math.floor(img.height / 2)) > 0, `${file} centre opaque`);
  }
});

test("frame edges are solid so border-image slicing never shows a gap", () => {
  // Every pixel along the outer edge of a frame must be opaque except the
  // chiselled corner pixels. A transparent gap would let the panel behind
  // bleed through mid-stretch.
  const expect = {
    "frame-slab.png": 10,
    "frame-ornate-common.png": 14,
    "frame-keycap.png": 6,
  };
  for (const [file, border] of Object.entries(expect)) {
    const img = decodePNG(readFileSync(join(GEN, file)));
    const at = (x, y) => img.pixels[(y * img.width + x) * 4 + 3];
    const mid = Math.floor(img.width / 2);
    const midY = Math.floor(img.height / 2);
    for (const [label, x, y] of [
      ["top edge", mid, 0],
      ["bottom edge", mid, img.height - 1],
      ["left edge", 0, midY],
      ["right edge", img.width - 1, midY],
      ["top-left slice", border - 1, 0],
      ["top-right slice", img.width - border, 0],
      ["bottom-left slice", border - 1, img.height - 1],
      ["bottom-right slice", img.width - border, img.height - 1],
    ]) {
      assert.ok(at(x, y) > 0, `${file} ${label} opaque at ${x},${y}`);
    }
  }
});

test("keycap hot variant differs from the cold variant", () => {
  const cold = readFileSync(join(GEN, "frame-keycap.png"));
  const hot = readFileSync(join(GEN, "frame-keycap-hot.png"));
  assert.ok(!cold.equals(hot), "hot keycap must be visually distinct");
});

/* ---------------- font ---------------- */

test("PixelChrome-Regular.ttf is a valid sfnt", () => {
  const buf = readFileSync(join(GEN, "PixelChrome-Regular.ttf"));
  const tag = buf.readUInt32BE(0);
  assert.equal(tag, 0x00010000, "sfnt version");
  const numTables = buf.readUInt16BE(4);
  assert.ok(numTables >= 8, `numTables = ${numTables}`);

  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const b = 12 + i * 16;
    const name = buf.toString("latin1", b, b + 4);
    const offset = buf.readUInt32BE(b + 8);
    const length = buf.readUInt32BE(b + 12);
    assert.ok(offset + length <= buf.length, `${name} stays inside the file`);
    tables.set(name, { offset, length });
  }
  for (const required of ["head", "cmap", "glyf", "loca", "hmtx", "hhea", "maxp", "name", "post", "OS/2"]) {
    assert.ok(tables.has(required), `missing table ${required}`);
  }
});

test("font head table checksum adjustment is correct", () => {
  const buf = readFileSync(join(GEN, "PixelChrome-Regular.ttf"));
  const numTables = buf.readUInt16BE(4);
  let headOffset = 0;
  for (let i = 0; i < numTables; i++) {
    const b = 12 + i * 16;
    if (buf.toString("latin1", b, b + 4) === "head") headOffset = buf.readUInt32BE(b + 8);
  }
  const stored = buf.readUInt32BE(headOffset + 8);

  const copy = Buffer.from(buf);
  copy.writeUInt32BE(0, headOffset + 8);
  let sum = 0;
  for (let i = 0; i < copy.length; i += 4) {
    const word = copy.readUInt32BE(i);
    sum = (sum + word) >>> 0;
  }
  const expected = (0xb1b0afba - sum) >>> 0;
  assert.equal(stored, expected, "checkSumAdjustment must satisfy the sfnt magic sum");
});

test("font cmap maps every authored glyph to a real glyph index", () => {
  const buf = readFileSync(join(GEN, "PixelChrome-Regular.ttf"));
  const numTables = buf.readUInt16BE(4);
  let cmapOffset = 0;
  let maxpOffset = 0;
  for (let i = 0; i < numTables; i++) {
    const b = 12 + i * 16;
    const name = buf.toString("latin1", b, b + 4);
    if (name === "cmap") cmapOffset = buf.readUInt32BE(b + 8);
    if (name === "maxp") maxpOffset = buf.readUInt32BE(b + 8);
  }
  const numGlyphs = buf.readUInt16BE(maxpOffset + 4);
  assert.ok(numGlyphs > 50, `numGlyphs = ${numGlyphs}`);

  const subOffset = cmapOffset + buf.readUInt32BE(cmapOffset + 8);
  assert.equal(buf.readUInt16BE(subOffset), 4, "cmap subtable format 4");
  const segCount = buf.readUInt16BE(subOffset + 6) / 2;

  const endCodes = [];
  const startCodes = [];
  const idDeltas = [];
  for (let i = 0; i < segCount; i++) {
    endCodes.push(buf.readUInt16BE(subOffset + 14 + i * 2));
    startCodes.push(buf.readUInt16BE(subOffset + 16 + segCount * 2 + i * 2));
    idDeltas.push(buf.readUInt16BE(subOffset + 16 + segCount * 4 + i * 2));
  }

  const lookup = (code) => {
    for (let i = 0; i < segCount; i++) {
      if (code <= endCodes[i] && code >= startCodes[i]) {
        return (code + idDeltas[i]) % 65536;
      }
    }
    return 0;
  };

  for (const code of [0x41, 0x5a, 0x30, 0x39, 0x20, 0x2e, 0xd7]) {
    const gid = lookup(code);
    assert.ok(gid > 0 && gid < numGlyphs, `U+${code.toString(16)} maps to gid ${gid}`);
  }
  // U+0041 'A' must not collide with U+0042 'B'
  assert.notEqual(lookup(0x41), lookup(0x42), "A and B map to different glyphs");
});

test("font loca is monotonic and ends at the glyf length", () => {
  const buf = readFileSync(join(GEN, "PixelChrome-Regular.ttf"));
  const numTables = buf.readUInt16BE(4);
  let locaOffset = 0;
  let glyfLength = 0;
  let maxpOffset = 0;
  for (let i = 0; i < numTables; i++) {
    const b = 12 + i * 16;
    const name = buf.toString("latin1", b, b + 4);
    if (name === "loca") locaOffset = buf.readUInt32BE(b + 8);
    if (name === "glyf") glyfLength = buf.readUInt32BE(b + 12);
    if (name === "maxp") maxpOffset = buf.readUInt32BE(b + 8);
  }
  const numGlyphs = buf.readUInt16BE(maxpOffset + 4);
  let prev = -1;
  for (let i = 0; i <= numGlyphs; i++) {
    const v = buf.readUInt32BE(locaOffset + i * 4);
    assert.ok(v >= prev, `loca[${i}] must be non-decreasing`);
    prev = v;
  }
  assert.equal(prev, glyfLength, "final loca entry equals glyf length");
});

/* ---------------- asset url manifest ---------------- */

test("asset-urls.css defines a hashed var for every built asset", () => {
  const cssPath = join(GEN, "asset-urls.css");
  assert.ok(existsSync(cssPath), "asset-urls.css must be generated by the build");
  const css = readFileSync(cssPath, "utf8");

  const defined = new Set();
  for (const m of css.matchAll(/--px-([a-zA-Z0-9-]+):/g)) defined.add(m[1]);
  assert.ok(defined.size > 40, `only ${defined.size} vars defined`);

  // every var must carry a content hash, or cache busting silently stops working
  for (const m of css.matchAll(/--px-([a-zA-Z0-9-]+):\s*url\("([^"]+)"\)/g)) {
    assert.match(m[2], /\?v=[0-9a-f]{8}$/, `--px-${m[1]} is missing a content hash`);
    // A custom-property url() resolves where the variable is USED, not where it
    // is defined, so it must be site-root-absolute to behave the same for every
    // consumer. A relative URL silently resolves to the wrong directory.
    assert.ok(
      m[2].startsWith("/game/ui/gen/"),
      `--px-${m[1]} must use a site-root-absolute path, got ${m[2]}`
    );
    const file = m[2].replace("/game/ui/gen/", "").split("?")[0];
    assert.ok(existsSync(join(GEN, file)), `--px-${m[1]} points at a missing file ${file}`);
  }
});

test("every --px-* variable chrome.css uses is actually defined", () => {
  // This catches the class of bug where a stylesheet references a variable the
  // build never emitted: the border-image silently falls back to a white
  // border and the panel looks broken with no console error.
  const chrome = readFileSync(join(GEN, "..", "..", "chrome.css"), "utf8");
  const manifest = readFileSync(join(GEN, "asset-urls.css"), "utf8");

  const defined = new Set();
  for (const m of manifest.matchAll(/--px-([a-zA-Z0-9-]+):/g)) defined.add(m[1]);

  const used = new Set();
  for (const m of chrome.matchAll(/var\((--px-[a-zA-Z0-9-]+)\)/g)) {
    used.add(m[1].replace(/^--px-/, ""));
  }
  assert.ok(used.size > 0, "chrome.css should reference chrome variables");

  const missing = [...used].filter((name) => !defined.has(name));
  assert.equal(
    missing.length,
    0,
    `chrome.css uses undefined chrome vars: ${missing.map((n) => `--px-${n}`).join(", ")}`
  );
});

test("style.css only references chrome vars that exist", () => {
  const style = readFileSync(join(GEN, "..", "..", "style.css"), "utf8");
  const manifest = readFileSync(join(GEN, "asset-urls.css"), "utf8");
  const defined = new Set();
  for (const m of manifest.matchAll(/--px-([a-zA-Z0-9-]+):/g)) defined.add(m[1]);
  const missing = [];
  for (const m of style.matchAll(/var\((--px-[a-zA-Z0-9-]+)/g)) {
    const name = m[1].replace(/^--px-/, "");
    if (!defined.has(name)) missing.push(m[1]);
  }
  assert.equal(missing.length, 0, `style.css uses undefined chrome vars: ${missing.join(", ")}`);
});

/* ---------------- pixel-art scaling ---------------- */

test("pixel art is only ever displayed at integer scales", () => {
  // Scaling pixel art by a non-integer factor (16px source shown at 24px = 1.5x)
  // gives some source pixels 2 screen pixels and others 1. Even with
  // image-rendering: pixelated the result looks uneven and broken.
  //
  // Source sizes for every chrome asset we ship.
  const SOURCES = {
    "px-icon": [16, 16],
    "bar-sigil": [32, 32],
    "detail-sigil": [32, 32],
    "px-divider-boss": [12, 12],
    "card-icon": [32, 32],
    "death-stat img": [16, 16],
    "detail-stat img": [16, 16],
  };

  const files = ["style.css", "chrome.css"].map((f) => join(GEN, "..", "..", f));
  const offenders = [];

  for (const file of files) {
    const css = readFileSync(file, "utf8");
    // walk rule blocks so we can attribute a width to its selector
    for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = block[1].trim().split("\n").pop().trim();
      const body = block[2];
      const wMatch = body.match(/(?:^|\s)width:\s*(\d+)px/);
      if (!wMatch) continue;
      const width = parseInt(wMatch[1], 10);

      for (const [sel, [sw]] of Object.entries(SOURCES)) {
        const leaf = sel.split(" ").pop();
        if (!selector.includes(leaf)) continue;
        // integer multiple of the source, at least 1x
        if (width % sw !== 0 || width < sw) {
          offenders.push(`${selector} { width: ${width}px } vs ${sw}px source (${sel})`);
        }
      }
    }
  }

  assert.equal(
    offenders.length,
    0,
    `non-integer pixel-art scaling:\n      ${offenders.join("\n      ")}`
  );
});

console.log(`\n${passed} passed`);
