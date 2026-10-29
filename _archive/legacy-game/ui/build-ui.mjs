// Compile the pixel chrome. Run: node game/ui/build-ui.mjs
//
// Emits game/ui/gen/*.png (9-slice frames, keycaps, icons, font preview)
// and game/ui/gen/PixelChrome-Regular.ttf. Deterministic output — safe to
// diff and re-run.
//
// AI-assisted art: game/ui/art/*.png are pixel-art imports produced by
// tools/import-sprite.mjs from generated sheets (see game/ui/art/SOURCES.md).
// This build COPIES them into gen/ so the game has one asset directory.
// To regenerate one, run import-sprite.mjs with the flags in SOURCES.md.

import { writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Surface } from "./lib/pixel.mjs";
import { buildPixelFontTTF } from "./lib/ttf.mjs";
import { glyphList, GLYPHS, ROWS } from "./lib/font.mjs";
import { ICONS, buildIcon } from "./lib/icons.mjs";
import { P, TIERS } from "./lib/palette.mjs";
import {
  frameSlab,
  frameOrnate,
  frameButton,
  frameTrough,
  frameRoster,
  frameDivider,
  dividerBoss,
  frameKeycap,
  frameWell,
  frameTroughGold,
} from "./lib/frames.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "gen");
const ART = join(HERE, "art");
mkdirSync(OUT, { recursive: true });

const written = [];

function emit(name, surface, scale = 1) {
  const s = scale > 1 ? surface.scale(scale) : surface;
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, s.toPNG());
  written.push({ name: `${name}.png`, w: s.width, h: s.height, bytes: s.toPNG().length });
  return s;
}

/* ---------------- frames ---------------- */

emit("frame-slab", frameSlab({}));
emit("frame-slab-dark", frameSlab({ fill: P.stoneLo, fill2: P.stoneDk, hi: P.stoneLit, lo: P.iron0 }));
emit("frame-slab-deep", frameSlab({ fill: P.stoneDeep, fill2: "#1a1611", hi: P.stoneLo, lo: "#120f0b", stud: false }));
emit("frame-slab-iron", frameSlab({ fill: P.iron2, fill2: P.iron1, hi: P.iron3, lo: P.iron0, stud: false }));
emit("frame-trough", frameTrough({}));
emit("frame-trough-gold", frameTroughGold());
emit("frame-roster", frameRoster({ selected: false }));
emit("frame-roster-selected", frameRoster({ selected: true }));
emit("frame-keycap", frameKeycap({}));
emit("frame-keycap-hot", frameKeycap({ hot: true }));

for (const tier of Object.keys(TIERS)) {
  emit(`frame-ornate-${tier}`, frameOrnate({ tier }));
  emit(`frame-button-${tier}`, frameButton({ tier }));
  emit(`frame-well-${tier}`, frameWell({ tier }));
  emit(`frame-divider-${tier}`, frameDivider({ tier }));
  emit(`divider-boss-${tier}`, dividerBoss({ tier }));
  emit(`frame-roster-selected-${tier}`, frameRoster({ selected: true, tier }));
  emit(`frame-keycap-${tier}`, frameKeycap({ hot: true, tier }));
}

emit("frame-button-gold", frameButton({ tier: "common" }));
emit("frame-divider", frameDivider({}));
emit("divider-boss", dividerBoss({}));

/* ---------------- icons ---------------- */

for (const [name, rows] of Object.entries(ICONS)) {
  emit(`icon-${name}`, buildIcon(rows));
}

/* ---------------- AI-assisted sigils ---------------- */

// game/ui/art/*.png are the reviewed, grid-snapped class sigils. Copy them
// through so gen/ is the single directory the game reads from.
const artFiles = existsSync(ART) ? readdirSync(ART).filter((f) => f.endsWith(".png")) : [];
for (const file of artFiles) {
  const src = join(ART, file);
  const dest = join(OUT, file);
  copyFileSync(src, dest);
  written.push({ name: file, w: 0, h: 0, bytes: 0, copied: true });
}

/* ---------------- font ---------------- */

const ttf = buildPixelFontTTF({
  family: "PixelChrome",
  style: "Regular",
  upem: 16,
  px: 2,
  ascent: 14,
  descent: 2,
  glyphs: glyphList(),
});
writeFileSync(join(OUT, "PixelChrome-Regular.ttf"), ttf);
written.push({ name: "PixelChrome-Regular.ttf", w: 0, h: 0, bytes: ttf.length });

/* ---------------- font specimen (visual QA of the face itself) ---------------- */

{
  const cellW = 5;
  const cellH = ROWS;
  const glyphsPerRow = 18;
  const entries = Object.entries(GLYPHS);
  const rows = Math.ceil(entries.length / glyphsPerRow);
  const gap = 2;
  const s = new Surface(glyphsPerRow * (cellW + gap) + gap, rows * (cellH + gap + 2) + gap);
  s.fill("#181410");

  entries.forEach(([ch, g], i) => {
    const gx = gap + (i % glyphsPerRow) * (cellW + gap);
    const gy = gap + Math.floor(i / glyphsPerRow) * (cellH + gap + 2);
    for (let y = 0; y < g.rows.length; y++) {
      for (let x = 0; x < g.rows[y].length; x++) {
        if (g.rows[y][x] === "#") s.set(gx + x, gy + y, P.bone);
      }
    }
  });

  emit("font-specimen", s, 4);
}

/* ---------------- summary ---------------- */

// Emit a hashed-URL manifest for every asset.
//
// The dev server sends an ETag but no Cache-Control, so browsers fall back to
// heuristic caching and will happily serve a PNG from a previous build. That
// produced a real bug: the accent was changed from gold to verdigris, the
// files on disk were correct, but the page kept drawing the old colours.
// Appending a content hash to each URL makes every rebuild a new URL.
{
  const files = readdirSync(OUT).filter((f) => /\.(png|ttf)$/.test(f));
  const vars = [];
  for (const file of files.sort()) {
    const buf = readFileSync(join(OUT, file));
    const hash = createHash("sha1").update(buf).digest("hex").slice(0, 8);
    // Variable names drop the redundant "frame-" prefix so the CSS reads
    // `var(--px-slab)`, not `var(--px-frame-slab)`. The prefix is an artifact
    // of the source filename, not something the stylesheet should know about.
    const name = file
      .replace(/\.(png|ttf)$/, "")
      .replace(/^frame-/, "")
      .replace(/[^a-zA-Z0-9-]/g, "-");
    // Site-root-absolute URL. A url() inside a CSS custom property is NOT
    // resolved where it is defined — it is substituted as a token and resolved
    // where the variable is USED. Since chrome.css lives at /game/ and
    // asset-urls.css lives at /game/ui/gen/, a relative URL would resolve
    // differently per consumer (and break entirely). Absolute paths are
    // resolution-independent, which is what a shared token needs.
    vars.push(`  --px-${name}: url("/game/ui/gen/${file}?v=${hash}");`);
  }
  const css = [
    "/* GENERATED by game/ui/build-ui.mjs - do not edit.",
    "   Content-hashed asset URLs so a rebuild is never served from cache.",
    "   URLs are site-root-absolute because a custom-property url() resolves",
    "   at the point of USE, not definition. */",
    ":root {",
    ...vars,
    "}",
    "",
  ].join("\n");
  writeFileSync(join(OUT, "asset-urls.css"), css, "utf8");
  console.log(`asset-urls.css  ${files.length} hashed urls`);
}

console.log(`pixel chrome → ${OUT}`);
for (const f of written) {
  const size = f.copied ? "art" : f.w ? `${f.w}x${f.h}` : "ttf";
  const bytes = f.copied ? "" : `${String(f.bytes).padStart(7)} B`;
  console.log(`  ${f.name.padEnd(28)} ${size.padStart(9)}  ${bytes}`);
}
console.log(`\n${written.length} files.`);
