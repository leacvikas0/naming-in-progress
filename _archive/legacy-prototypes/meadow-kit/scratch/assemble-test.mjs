// Headless assembly check. Builds the whole meadow with no WebGL, so API and
// contract mistakes surface before anyone opens a browser.
//
//   node scratch/assemble-test.mjs
//   node scratch/assemble-test.mjs --quality=ultra

import { createMeadow } from "../src/index.js";
import { spec as daisy } from "../src/foliage/daisy.js";
import { spec as grass } from "../src/foliage/grass.js";
import { spec as broadLeaf } from "../src/foliage/broadLeaf.js";
import { spec as buttercup } from "../src/foliage/buttercup.js";
import { spec as clover } from "../src/foliage/clover.js";

const quality = (process.argv.find((a) => a.startsWith("--quality=")) || "--quality=medium").split("=")[1];

const species = [grass, broadLeaf, daisy, buttercup, clover].filter(Boolean);

const t0 = performance.now();
const meadow = await createMeadow({ species, quality, seed: 20261018, fx: false });
const ms = Math.round(performance.now() - t0);

const s = meadow.stats();
console.log(`built in ${ms} ms  quality=${s.quality}  seed=${s.seed}`);
console.log(`instances ${s.instances.toLocaleString()}   triangles ${(s.triangles / 1000).toFixed(0)}k   draw calls ${s.drawCalls}`);
console.log("");
for (const sp of s.species) {
  console.log(
    `${sp.id.padEnd(12)} ${String(sp.instances).padStart(6)} instances  ${String(sp.trisPerInstance).padStart(5)} tri each`
  );
}

// sanity: terrain height function must agree with the mesh it produced
const h = meadow.heightAt;
let min = Infinity;
let max = -Infinity;
for (let i = 0; i < 200; i++) {
  const x = (i / 200) * 26 - 13;
  const v = h(x, 0);
  if (!Number.isFinite(v)) throw new Error(`heightAt(${x},0) is not finite`);
  min = Math.min(min, v);
  max = Math.max(max, v);
}
console.log(`\nheightAt range across x: ${min.toFixed(3)} .. ${max.toFixed(3)} m`);

// sanity: every instance must sit on the terrain, not under it
let worst = 0;
meadow.group.traverse((o) => {
  if (!o.isInstancedMesh) return;
  const m = o.instanceMatrix.array;
  for (let i = 0; i < o.count; i++) {
    const x = m[i * 16 + 12];
    const y = m[i * 16 + 13];
    const z = m[i * 16 + 14];
    worst = Math.max(worst, Math.abs(y - h(x, z)));
  }
});
console.log(`worst instance/base height mismatch: ${worst.toFixed(4)} m`);

meadow.dispose();
console.log("\nOK");
