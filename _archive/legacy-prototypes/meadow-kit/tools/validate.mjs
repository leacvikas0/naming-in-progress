// Contract gate for species modules. Run it before you look at a render —
// it catches the mistakes that are invisible in a screenshot but break the
// scatter system.
//
//   node tools/validate.mjs
//   node tools/validate.mjs --only=daisy
//
// Every species must:
//   - build without throwing, deterministically
//   - normalise to exactly 1.0 unit tall, base on y = 0, centred on x/z
//   - carry `color` (0..1) and `aSway` (0..1) on every vertex
//   - stay inside its triangle budget

import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { finalizeGeometry, triangleCount } from "../src/core/geom.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const foliageDir = path.join(here, "..", "src", "foliage");

const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];

const BUDGET = { grass: 420, leaf: 3000, petal: 3000, stem: 900 };

const files = globSync("*.js", { cwd: foliageDir })
  .filter((f) => f !== "index.js")
  .filter((f) => !only || f === `${only}.js`)
  .sort();

if (files.length === 0) {
  console.error(`validate: no species files matched${only ? ` --only=${only}` : ""}`);
  process.exit(1);
}

const rows = [];
let failures = 0;

for (const file of files) {
  const id = file.replace(/\.js$/, "");
  const row = { id, tris: "-", height: "-", minY: "-", color: "-", sway: "-", status: "FAIL", note: "" };
  try {
    const mod = await import(pathToFileURL(path.join(foliageDir, file)).href);
    const spec = mod.spec;
    if (!spec) {
      // helper module (shared leaves, blade builders, ...) — not a species
      row.status = "helper";
      rows.push(row);
      continue;
    }
    for (const key of ["id", "label", "layer", "material", "scale", "build"]) {
      if (spec[key] == null) throw new Error(`spec missing "${key}"`);
    }
    if (!Array.isArray(spec.scale) || spec.scale.length !== 2) throw new Error("scale must be [min,max]");
    if (spec.scale[1] < spec.scale[0]) throw new Error("scale min > max");

    const a = finalizeGeometry(spec.build({ seed: 1234 }));
    const b = finalizeGeometry(spec.build({ seed: 1234 }));
    if (a.attributes.position.count !== b.attributes.position.count) {
      throw new Error("build() is not deterministic (vertex count differs between runs)");
    }

    a.computeBoundingBox();
    const bb = a.boundingBox;
    const height = bb.max.y - bb.min.y;
    const minY = bb.min.y;

    if (Math.abs(height - 1) > 1e-4) throw new Error(`height is ${height.toFixed(4)}, expected 1.0`);
    if (Math.abs(minY) > 1e-4) throw new Error(`base is at y=${minY.toFixed(4)}, expected 0`);
    if (Math.abs((bb.max.x + bb.min.x) / 2) > 2e-3) throw new Error("not centred on x");
    if (Math.abs((bb.max.z + bb.min.z) / 2) > 2e-3) throw new Error("not centred on z");

    for (const attr of ["color", "aSway", "normal"]) {
      if (!a.attributes[attr]) throw new Error(`missing "${attr}" attribute`);
    }
    if (a.attributes.color.itemSize !== 3) throw new Error("color must be vec3");
    if (a.attributes.aSway.itemSize !== 1) throw new Error("aSway must be float");

    const col = a.attributes.color.array;
    for (let i = 0; i < col.length; i++) {
      if (col[i] < -1e-3 || col[i] > 1.001) throw new Error(`color out of 0..1 at ${i}: ${col[i]}`);
    }
    const sway = a.attributes.aSway.array;
    let swayMax = 0;
    for (let i = 0; i < sway.length; i++) {
      if (sway[i] < -1e-3 || sway[i] > 1.001) throw new Error(`aSway out of 0..1 at ${i}: ${sway[i]}`);
      if (sway[i] > swayMax) swayMax = sway[i];
    }
    if (swayMax < 0.2) throw new Error("no vertex sways (max aSway < 0.2) — the plant will look frozen");

    const tris = triangleCount(a);
    const budget = BUDGET[spec.material] ?? 3000;
    if (tris > budget) throw new Error(`${tris} triangles exceeds the ${spec.material} budget of ${budget}`);

    row.tris = String(tris);
    row.height = height.toFixed(3);
    row.minY = minY.toFixed(3);
    row.color = "ok";
    row.sway = swayMax.toFixed(2);
    row.status = "PASS";
  } catch (err) {
    row.note = err.message;
    failures++;
  }
  rows.push(row);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(
  `${pad("id", 14)}${pad("tris", 7)}${pad("height", 8)}${pad("minY", 7)}${pad("color", 7)}${pad("sway", 6)}status`
);
console.log("-".repeat(62));
for (const r of rows) {
  console.log(
    `${pad(r.id, 14)}${pad(r.tris, 7)}${pad(r.height, 8)}${pad(r.minY, 7)}${pad(r.color, 7)}${pad(r.sway, 6)}${r.status}${
      r.note ? `  ${r.note}` : ""
    }`
  );
}
console.log("-".repeat(62));
const real = rows.filter((r) => r.status !== "helper");
console.log(`${real.length - failures}/${real.length} species pass${rows.length > real.length ? ` (${rows.length - real.length} helper modules)` : ""}`);

process.exit(failures === 0 ? 0 : 1);
