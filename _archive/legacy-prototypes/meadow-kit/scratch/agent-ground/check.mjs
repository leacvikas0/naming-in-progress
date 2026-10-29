// Throwaway check for the ground modules (agent-ground).
//   node scratch/agent-ground/check.mjs
//
// Not part of the kit. It builds terrain + paths from the real config and asks
// the questions that matter:
//   - is heightAt finite everywhere, and what range does it span?
//   - do the mesh vertices and heightAt agree EXACTLY?
//   - does the *interpolated* mesh surface agree with heightAt (raycast)?
//   - do the ribbons sit above the ground everywhere, and never z-fight?
//   - triangle counts inside budget, normals up, nothing NaN.

import * as THREE from "three";
import { resolveConfig } from "../../src/core/config.js";
import { createTerrain } from "../../src/ground/terrain.js";
import { createPath } from "../../src/ground/path.js";

const config = resolveConfig({ quality: "high" });

// Minimal stand-in for the material factory: exercises the materials.get()
// path without dragging in wind uniforms.
const materials = {
  get(kind) {
    if (kind !== "earth") throw new Error(`unexpected material kind ${kind}`);
    return new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide });
  },
};

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const fail = [];
const ok = (cond, msg) => {
  if (!cond) fail.push(msg);
  return cond;
};

// ---------------------------------------------------------------- terrain
const t0 = performance.now();
const terrain = createTerrain(config, materials);
const tBuild = performance.now() - t0;

const g = terrain.mesh.geometry;
const pos = g.attributes.position;
const terrainTris = tris(g);

console.log(`terrain: ${terrainTris} tris, ${pos.count} verts, built in ${tBuild.toFixed(1)} ms`);
console.log(`  size ${terrain.size.width} x ${terrain.size.depth}, receiveShadow=${terrain.mesh.receiveShadow}, castShadow=${terrain.mesh.castShadow}`);
console.log(`  material ${terrain.mesh.material.type}, vertexColors=${terrain.mesh.material.vertexColors}`);

// heightAt over the whole area, on a fine grid.
let minH = Infinity;
let maxH = -Infinity;
let nonFinite = 0;
const GRID = 240;
for (let i = 0; i <= GRID; i++) {
  for (let j = 0; j <= GRID; j++) {
    const x = -terrain.size.width / 2 + (i / GRID) * terrain.size.width;
    const z = -terrain.size.depth / 2 + (j / GRID) * terrain.size.depth;
    const h = terrain.heightAt(x, z);
    if (!Number.isFinite(h)) nonFinite++;
    else {
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }
}
console.log(`  heightAt over ${(GRID + 1) ** 2} samples: min ${minH.toFixed(3)} m, max ${maxH.toFixed(3)} m, range ${(maxH - minH).toFixed(3)} m`);
console.log(`  non-finite: ${nonFinite}`);
ok(nonFinite === 0, "heightAt returned a non-finite number");

// vertex vs heightAt: the displacement uses the same call, so this must be
// bit-exact, not merely close.
let maxVertexErr = 0;
for (let i = 0; i < pos.count; i++) {
  const e = Math.abs(pos.getY(i) - terrain.heightAt(pos.getX(i), pos.getZ(i)));
  if (e > maxVertexErr) maxVertexErr = e;
}
console.log(`  vertex y vs heightAt: max |err| = ${maxVertexErr.toExponential(2)} m`);

// Independent check: raycast straight down onto the real mesh and compare with
// heightAt. This sees the *interpolated* surface, which is what a plant
// actually stands on between vertices.
const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const origin = new THREE.Vector3();
let maxRayErr = 0;
let rayMisses = 0;
let raySamples = 0;
const halfW = terrain.size.width / 2;
const halfD = terrain.size.depth / 2;
let rnd = 1234567;
const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let i = 0; i < 220; i++) {
  const x = (rand() * 2 - 1) * (halfW - 0.5);
  const z = (rand() * 2 - 1) * (halfD - 0.5);
  origin.set(x, 20, z);
  ray.set(origin, down);
  const hit = ray.intersectObject(terrain.mesh, false)[0];
  if (!hit) {
    rayMisses++;
    continue;
  }
  raySamples++;
  const e = Math.abs(hit.point.y - terrain.heightAt(x, z));
  if (e > maxRayErr) maxRayErr = e;
}
console.log(`  raycast mesh vs heightAt: ${raySamples} hits, ${rayMisses} misses, max |err| = ${maxRayErr.toFixed(4)} m`);
ok(rayMisses === 0, `raycast missed the terrain ${rayMisses} times`);
ok(maxRayErr < 0.02, `raycast/mesh disagreement ${maxRayErr.toFixed(4)} m is too large`);

// Slope: how spiky is it? Sample the height gradient on a 10 cm grid.
let maxSlope = 0;
const step = 0.1;
for (let i = 0; i < 260; i++) {
  const x = (rand() * 2 - 1) * (halfW - 1);
  const z = (rand() * 2 - 1) * (halfD - 1);
  const dx = (terrain.heightAt(x + step, z) - terrain.heightAt(x - step, z)) / (2 * step);
  const dz = (terrain.heightAt(x, z + step) - terrain.heightAt(x, z - step)) / (2 * step);
  const s = Math.hypot(dx, dz);
  if (s > maxSlope) maxSlope = s;
}
console.log(`  steepest local grade over ${step * 2} m: ${(maxSlope * 100).toFixed(1)}% (${((Math.atan(maxSlope) * 180) / Math.PI).toFixed(1)} deg)`);

// Colour sanity: every vertex colour inside 0..1 and not washed out.
const colAttr = g.attributes.color;
let colBad = 0;
let lumMin = Infinity;
let lumMax = -Infinity;
for (let i = 0; i < colAttr.count; i++) {
  const r = colAttr.getX(i);
  const gg = colAttr.getY(i);
  const b = colAttr.getZ(i);
  if (!(r >= 0 && r <= 1 && gg >= 0 && gg <= 1 && b >= 0 && b <= 1)) colBad++;
  const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  if (lum < lumMin) lumMin = lum;
  if (lum > lumMax) lumMax = lum;
}
console.log(`  vertex colours: ${colBad} out of range, linear luminance ${lumMin.toFixed(3)}..${lumMax.toFixed(3)}`);
ok(colBad === 0, "terrain vertex colour outside 0..1");

// ---------------------------------------------------------------- paths
const paths = createPath(config, terrain.heightAt, materials);
console.log(`\npaths: ${paths.meshes.length} ribbons`);

let pathTriTotal = 0;
for (const mesh of paths.meshes) {
  const geo = mesh.geometry;
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const t = tris(geo);
  pathTriTotal += t;

  let nan = 0;
  let minGap = Infinity;
  let maxGap = -Infinity;
  let minNy = 1;
  let colOutside = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nan++;
    const gap = y - terrain.heightAt(x, z);
    if (gap < minGap) minGap = gap;
    if (gap > maxGap) maxGap = gap;
    const ny = n.getY(i);
    if (ny < minNy) minNy = ny;
    const c = geo.attributes.color;
    if (c.getX(i) < 0 || c.getX(i) > 1 || c.getY(i) < 0 || c.getY(i) > 1 || c.getZ(i) < 0 || c.getZ(i) > 1) colOutside++;
  }
  console.log(`  ${mesh.name.padEnd(20)} ${String(t).padStart(5)} tris   lift gap ${minGap.toFixed(4)}..${maxGap.toFixed(4)} m   min normal.y ${minNy.toFixed(3)}   nan ${nan}   colour-out ${colOutside}`);
  ok(t <= 4000, `${mesh.name}: ${t} tris exceeds the 4000 per-path budget`);
  ok(nan === 0, `${mesh.name}: NaN vertex`);
  ok(minGap > 0.001, `${mesh.name}: ribbon sinks below the terrain (min gap ${minGap})`);
  ok(minNy > 0, `${mesh.name}: some normals point down (min normal.y ${minNy})`);
  ok(colOutside === 0, `${mesh.name}: colour outside 0..1`);

  // The real z-fight test: the terrain mesh is interpolated, so raycast the
  // actual surface under ribbon vertices.
  const ray2 = new THREE.Raycaster();
  let worst = Infinity;
  let samples = 0;
  for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 60))) {
    origin.set(p.getX(i), 20, p.getZ(i));
    ray2.set(origin, down);
    const hit = ray2.intersectObject(terrain.mesh, false)[0];
    if (!hit) continue;
    samples++;
    worst = Math.min(worst, p.getY(i) - hit.point.y);
  }
  console.log(`    raycast gap under ribbon: ${samples} samples, worst ${worst.toFixed(4)} m`);
  ok(worst > 0.0015, `${mesh.name}: ribbon within ${worst} m of the interpolated terrain`);
}

console.log(`  total path triangles: ${pathTriTotal}`);

// ---------------------------------------------------------------- budget
const total = terrainTris + pathTriTotal;
console.log(`\ntotal ground triangles: ${total} (terrain ${terrainTris}, paths ${pathTriTotal})`);
ok(terrainTris < 80000, `terrain ${terrainTris} tris over 80k budget`);

// ---------------------------------------------------------------- dispose
terrain.dispose();
paths.dispose();

console.log(fail.length ? `\nFAIL\n  - ${fail.join("\n  - ")}` : "\nPASS: all ground checks green");
process.exit(fail.length ? 1 : 0);
