import { resolveConfig } from "../../src/core/config.js";
import { createTerrain } from "../../src/ground/terrain.js";
const config = resolveConfig({});
const T = config.recipe.terrain;
const terrain = createTerrain(config);
let min = Infinity, max = -Infinity, n = 0, sum = 0, sum2 = 0;
for (let i = 0; i <= 300; i++) for (let j = 0; j <= 300; j++) {
  const x = -13 + (i / 300) * 26, z = -13 + (j / 300) * 26;
  const d = terrain.pathDistance(x, z);
  if (d < 6) continue;                       // only fully-relaxed ground
  const rel = terrain.heightAt(x, z) - T.tilt * (x * 0.78 + z * 0.62);
  min = Math.min(min, rel); max = Math.max(max, rel); n++; sum += rel; sum2 += rel * rel;
}
const mean = sum / n, sd = Math.sqrt(sum2 / n - mean * mean);
console.log(`relief only: min ${min.toFixed(3)} max ${max.toFixed(3)} mean ${mean.toFixed(4)} sd ${sd.toFixed(3)}  (relief setting ${T.relief})`);
console.log(`peak/relief = ${(max / T.relief).toFixed(2)}, p95-ish |relief| = ${(2*sd).toFixed(3)}`);
