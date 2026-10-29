// Throwaway check for the atmosphere modules. No WebGL, no server.
//
//   node scratch/agent-fx/verify.mjs
//   node scratch/agent-fx/verify.mjs --view     (also prints ASCII silhouettes)
//
// Asserts: both factories return groups full of meshes, triangle counts are
// sane, update(0) and update(1.5) run clean, instances stay inside the meadow,
// and the motion actually moves something. --view projects the real geometry
// into a character grid so the wing layout can be eyeballed.

import * as THREE from "three";
import { resolveConfig } from "../../src/core/config.js";
import { createScatter } from "../../src/core/scatter.js";
import { createTerrain } from "../../src/ground/terrain.js";
import { createWind } from "../../src/core/wind.js";
import { createMaterialFactory } from "../../src/core/materials.js";
import { createMotes } from "../../src/fx/motes.js";
import { createButterflies } from "../../src/fx/butterflies.js";

const VIEW = process.argv.includes("--view");
const config = resolveConfig({});
const terrain = createTerrain(config);
const scatter = createScatter(config);
const heightAt = terrain.heightAt;
const factory = createMaterialFactory({ config, wind: createWind(config) });

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL ${label}\n       ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function trianglesOf(object) {
  const geo = object.geometry;
  const per = Math.floor((geo.index ? geo.index.count : geo.attributes.position.count) / 3);
  return object.isInstancedMesh ? per * object.count : per;
}

function census(group) {
  let meshes = 0;
  let instanced = 0;
  let tris = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (o.isInstancedMesh) instanced++;
    tris += trianglesOf(o);
  });
  return { meshes, instanced, tris };
}

// --- motes ----------------------------------------------------------------
console.log("motes");
// No materials passed on purpose: this exercises the standalone fallback.
const motes = createMotes({ config, scatter, heightAt });
const moteStats = census(motes.group);
console.log(
  `  ${moteStats.meshes} mesh(es), ${moteStats.instanced} instanced, ${moteStats.tris} triangles`
);

check("group contains an InstancedMesh", () => {
  assert(moteStats.instanced === 1, `expected 1 InstancedMesh, got ${moteStats.instanced}`);
  assert(moteStats.meshes === 1, `expected 1 mesh, got ${moteStats.meshes}`);
});

const moteMesh = motes.group.children.find((o) => o.isInstancedMesh);

check("count matches the recipe", () => {
  assert(
    moteMesh.count === config.recipe.species.motes.count,
    `expected ${config.recipe.species.motes.count}, got ${moteMesh.count}`
  );
});

check("per-mote colour is live (instanceColor present)", () => {
  assert(moteMesh.instanceColor, "no instanceColor — every mote would be one flat colour");
  const c = moteMesh.instanceColor.array;
  const first = [c[0], c[1], c[2]];
  let differs = false;
  for (let i = 3; i < c.length; i += 3) {
    if (Math.abs(c[i] - first[0]) > 1e-4 || Math.abs(c[i + 1] - first[1]) > 1e-4) differs = true;
  }
  assert(differs, "all motes share one tint");
});

function readInstances(mesh) {
  const m = new THREE.Matrix4();
  const out = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    out.push({
      x: m.elements[12],
      y: m.elements[13],
      z: m.elements[14],
      // Uniform scale only, but the matrix is rotated, so read it back properly.
      s: m.getMaxScaleOnAxis(),
    });
  }
  return out;
}

const before = readInstances(moteMesh);

check("update(0) and update(1.5) do not throw", () => {
  motes.update(0);
  motes.update(1.5);
});

const after = readInstances(moteMesh);

check("motes actually drift", () => {
  let moved = 0;
  for (let i = 0; i < before.length; i++) {
    const d = Math.hypot(after[i].x - before[i].x, after[i].z - before[i].z);
    if (d > 1e-3) moved++;
  }
  assert(moved > before.length * 0.8, `only ${moved}/${before.length} motes moved`);
});

check("motes stay inside the meadow", () => {
  const hw = config.area.width / 2 + 1e-6;
  const hd = config.area.depth / 2 + 1e-6;
  for (const p of after) {
    assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), "non-finite position");
    assert(Math.abs(p.x) <= hw, `x=${p.x.toFixed(2)} outside ±${hw}`);
    assert(Math.abs(p.z) <= hd, `z=${p.z.toFixed(2)} outside ±${hd}`);
  }
});

check("mote size is 0.012-0.036 m", () => {
  for (const p of after) {
    assert(p.s >= 0.011 && p.s <= 0.037, `mote scale ${p.s.toFixed(4)} outside the spec range`);
  }
});

check("motes wrap rather than all blowing away", () => {
  // Run a long way and confirm the field is still where it started.
  motes.update(600);
  const far = readInstances(moteMesh);
  const hw = config.area.width / 2 + 1e-6;
  const hd = config.area.depth / 2 + 1e-6;
  for (const p of far) {
    assert(Math.abs(p.x) <= hw && Math.abs(p.z) <= hd, "drifted out of bounds at t=600");
  }
  motes.update(0);
});

// --- butterflies ----------------------------------------------------------
console.log("\nbutterflies");
const butterflies = createButterflies({ config, scatter, heightAt, materials: factory });
const flyStats = census(butterflies.group);
console.log(
  `  ${flyStats.meshes} meshes, ${flyStats.instanced} instanced, ${flyStats.tris} triangles`
);

const flyCount = config.recipe.species.butterflies.count;

check("one root group per butterfly, three parts each", () => {
  assert(butterflies.group.children.length === flyCount, `got ${butterflies.group.children.length} roots`);
  for (const root of butterflies.group.children) {
    assert(root.children.length === 3, `${root.name} has ${root.children.length} parts`);
    const names = root.children.map((c) => c.name).sort().join(",");
    assert(names === "body,wingL,wingR", `${root.name} parts are ${names}`);
  }
});

check("wings are mirrored left/right", () => {
  const root = butterflies.group.children[0];
  const left = root.getObjectByName("wingL");
  const right = root.getObjectByName("wingR");
  left.geometry.computeBoundingBox();
  right.geometry.computeBoundingBox();
  const lb = left.geometry.boundingBox;
  const rb = right.geometry.boundingBox;
  assert(lb.max.x > 0.01, `left wing only reaches x=${lb.max.x.toFixed(3)}`);
  assert(rb.min.x < -0.01, `right wing only reaches x=${rb.min.x.toFixed(3)}`);
  assert(Math.abs(lb.max.x + rb.min.x) < 2e-3, "wings are not symmetric about the body");
});

check("right wing is an exact mirror of the left", () => {
  const root = butterflies.group.children[0];
  const sig = (geo) => {
    const p = geo.attributes.position;
    const out = [];
    for (let i = 0; i < p.count; i++) {
      out.push([Math.abs(p.getX(i)), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join(","));
    }
    return out.sort().join("|");
  };
  assert(
    sig(root.getObjectByName("wingL").geometry) === sig(root.getObjectByName("wingR").geometry),
    "the two wings are not mirror images — the right wing is rotated, not mirrored"
  );
});

check("every part's normals agree with its winding", () => {
  // The right wing is built with a negative-scale matrix. mergeParts recomputes
  // normals at the end, so they should follow the (reversed) winding — if they
  // did not, the toon shader's double-sided flip would light it inside out.
  const root = butterflies.group.children[0];
  for (const name of ["wingL", "wingR", "body"]) {
    const geo = root.getObjectByName(name).geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const idx = geo.index;
    const count = idx ? idx.count : pos.count;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const face = new THREE.Vector3();
    const avg = new THREE.Vector3();
    const v = new THREE.Vector3();
    let worst = 1;
    for (let i = 0; i < count; i += 3) {
      const ia = idx ? idx.getX(i) : i;
      const ib = idx ? idx.getX(i + 1) : i + 1;
      const ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia);
      b.fromBufferAttribute(pos, ib);
      c.fromBufferAttribute(pos, ic);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      face.crossVectors(ab, ac);
      if (face.lengthSq() < 1e-14) continue; // degenerate sliver, no normal to check
      face.normalize();
      avg.set(0, 0, 0);
      for (const j of [ia, ib, ic]) avg.add(v.fromBufferAttribute(nor, j));
      avg.normalize();
      const dot = face.dot(avg);
      if (dot < worst) worst = dot;
    }
    assert(worst > 0.2, `${name}: a normal points against its winding (dot ${worst.toFixed(2)})`);
  }
});

check("wingspan is 0.04-0.07 m", () => {
  for (const root of butterflies.group.children) {
    const left = root.getObjectByName("wingL").geometry;
    const right = root.getObjectByName("wingR").geometry;
    left.computeBoundingBox();
    right.computeBoundingBox();
    const span = (left.boundingBox.max.x - right.boundingBox.min.x) * root.scale.x;
    assert(span >= 0.04 && span <= 0.07, `wingspan ${span.toFixed(4)} m`);
  }
});

const flapSample = [];
check("update(0) and update(1.5) do not throw", () => {
  butterflies.update(0);
  flapSample.push(butterflies.group.children[0].getObjectByName("wingL").rotation.z);
  butterflies.update(1.5);
});

check("wings flap", () => {
  const root = butterflies.group.children[0];
  const wingL = root.getObjectByName("wingL");
  const a = wingL.rotation.z;
  assert(Math.abs(a - flapSample[0]) > 0.05, "left wing did not move between t=0 and t=1.5");
  assert(wingL.rotation.z === -root.getObjectByName("wingR").rotation.z, "wings are not mirrored in the flap");
});

check("flap rate is 8-12 Hz", () => {
  // Count zero crossings of the wing angle over one second of simulated time.
  const root = butterflies.group.children[0];
  const wingL = root.getObjectByName("wingL");
  let crossings = 0;
  let prev = null;
  for (let i = 0; i <= 240; i++) {
    butterflies.update(i / 240);
    const v = wingL.rotation.z - 0.12; // subtract the resting dihedral
    if (prev !== null && Math.sign(v) !== Math.sign(prev)) crossings++;
    prev = v;
  }
  const hz = crossings / 2; // two crossings per cycle
  assert(hz >= 7.5 && hz <= 12.5, `wingbeat measured ${hz.toFixed(1)} Hz`);
  console.log(`  (measured ${hz.toFixed(1)} Hz wingbeat)`);
  butterflies.update(0);
});

check("butterflies stay over the meadow and above the ground", () => {
  for (let i = 0; i <= 400; i++) {
    butterflies.update(i * 0.5);
    for (const root of butterflies.group.children) {
      const p = root.position;
      assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), "non-finite position");
      assert(Math.abs(p.x) < config.area.width / 2, `x=${p.x.toFixed(2)} off the meadow`);
      assert(Math.abs(p.z) < config.area.depth / 2, `z=${p.z.toFixed(2)} off the meadow`);
      assert(p.y > heightAt(p.x, p.z) + 0.2, `${root.name} is in the grass at y=${p.y.toFixed(2)}`);
    }
  }
  butterflies.update(0);
});

check("materials come from the shared factory when passed one", () => {
  const root = butterflies.group.children[0];
  const mat = root.getObjectByName("wingL").material;
  assert(mat === factory.get("wing"), "wing material is not the shared one");
});

// --- ASCII silhouettes ----------------------------------------------------
function gather(root) {
  root.updateMatrixWorld(true);
  const tris = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const tri = [];
      for (let k = 0; k < 3; k++) {
        const j = idx ? idx.getX(i + k) : i + k;
        v.fromBufferAttribute(pos, j).applyMatrix4(o.matrixWorld);
        tri.push([v.x, v.y, v.z]);
      }
      tris.push({ tri, label: o.name === "body" ? "B" : o.name === "wingL" ? "L" : "R" });
    }
  });
  return tris;
}

function raster(tris, project, cols = 62, rows = 26) {
  const pts = tris.flatMap((t) => t.tri.map(project));
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [u, v] of pts) {
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  const du = Math.max(maxU - minU, 1e-6);
  const dv = Math.max(maxV - minV, 1e-6);
  const scale = Math.min((cols - 1) / du, (rows - 1) / dv);
  const offU = (cols - 1 - du * scale) / 2;
  const offV = (rows - 1 - dv * scale) / 2;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(" "));
  const toCell = ([u, v]) => [(u - minU) * scale + offU, (v - minV) * scale + offV];

  for (const { tri, label } of tris) {
    const p = tri.map(project).map(toCell);
    const x0 = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0])));
    const x1 = Math.min(cols - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])));
    const y1 = Math.min(rows - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const d = (p[1][1] - p[2][1]) * (p[0][0] - p[2][0]) + (p[2][0] - p[1][0]) * (p[0][1] - p[2][1]);
        if (Math.abs(d) < 1e-12) continue;
        const a = ((p[1][1] - p[2][1]) * (px - p[2][0]) + (p[2][0] - p[1][0]) * (py - p[2][1])) / d;
        const b = ((p[2][1] - p[0][1]) * (px - p[2][0]) + (p[0][0] - p[2][0]) * (py - p[2][1])) / d;
        const c = 1 - a - b;
        if (a < -0.001 || b < -0.001 || c < -0.001) continue;
        grid[rows - 1 - y][x] = label;
      }
    }
  }
  return grid.map((r) => r.join(""));
}

if (VIEW) {
  const root = butterflies.group.children[0];
  const wingL = root.getObjectByName("wingL");
  const wingR = root.getObjectByName("wingR");
  butterflies.update(0);

  // Render in the butterfly's own frame — its heading is a yaw, which would
  // otherwise rotate the whole planform in the picture.
  const savedPos = root.position.clone();
  const savedQuat = root.quaternion.clone();
  root.position.set(0, 0, 0);
  root.quaternion.identity();

  // True planform: hold the wings flat so the top view is the actual outline.
  console.log("\nplanform, wings flat (L = left wing, R = right, B = body; +Z forward is up the page)");
  wingL.rotation.z = 0;
  wingR.rotation.z = 0;
  for (const line of raster(gather(root), ([x, , z]) => [x, z])) console.log(`  |${line}|`);

  console.log("\nplanform, wings raised 0.8 rad");
  wingL.rotation.z = 0.8;
  wingR.rotation.z = -0.8;
  for (const line of raster(gather(root), ([x, , z]) => [x, z])) console.log(`  |${line}|`);

  console.log("\nside view, wings raised 0.8 rad (looking along -X)");
  for (const line of raster(gather(root), ([, y, z]) => [z, y])) console.log(`  |${line}|`);

  // Restore the real animation before anything else reads the rig.
  root.position.copy(savedPos);
  root.quaternion.copy(savedQuat);
  butterflies.update(0);
}

// --- determinism ----------------------------------------------------------
console.log("\ndeterminism");
check("two fresh builds are identical", () => {
  // The scatter draws from the meadow-wide rng, so a fair test gives each build
  // its own resolved config + scatter instead of replaying on a half-consumed
  // one. Same seed + same call order => same atmosphere.
  function build() {
    const c = resolveConfig({});
    const s = createScatter(c);
    const t = createTerrain(c);
    const m = createMotes({ config: c, scatter: s, heightAt: t.heightAt });
    const b = createButterflies({ config: c, scatter: s, heightAt: t.heightAt });
    m.update(2.5);
    b.update(2.5);
    const out = {
      motes: readInstances(m.group.children[0]),
      flies: b.group.children.map((r) => [r.position.x, r.position.y, r.position.z]),
      flap: b.group.children[0].getObjectByName("wingL").rotation.z,
    };
    m.dispose();
    b.dispose();
    t.dispose();
    return out;
  }

  const a = build();
  const b = build();
  for (let i = 0; i < a.motes.length; i++) {
    assert(Math.abs(a.motes[i].x - b.motes[i].x) < 1e-9, `mote ${i} differs between builds`);
  }
  for (let i = 0; i < a.flies.length; i++) {
    assert(Math.abs(a.flies[i][0] - b.flies[i][0]) < 1e-9, `butterfly ${i} differs between builds`);
  }
  assert(Math.abs(a.flap - b.flap) < 1e-9, "wing angle differs between builds");
});

// --- dispose --------------------------------------------------------------
console.log("\ndispose");
check("dispose is clean and repeatable", () => {
  const a = createMotes({ config, scatter, heightAt });
  const b = createButterflies({ config, scatter, heightAt });
  a.dispose();
  b.dispose();
  assert(a.group.children.length === 0, "motes group still has children");
  assert(b.group.children.length === 0, "butterflies group still has children");
});

// --- integration: the real createMeadow path -------------------------------
console.log("\nintegration (createMeadow)");
const { createMeadow } = await import("../../src/index.js");
const { spec: daisySpec } = await import("../../src/foliage/daisy.js");
const { spec: grassSpec } = await import("../../src/foliage/grass.js");
const meadow = await createMeadow({ species: [grassSpec, daisySpec], quality: "low", fx: true });

check("createMeadow mounts both fx groups", () => {
  const names = meadow.group.children.map((c) => c.name);
  assert(names.includes("meadow:motes"), `no motes group in [${names.join(", ")}]`);
  assert(names.includes("meadow:butterflies"), `no butterflies group in [${names.join(", ")}]`);
});

check("meadow.update drives the fx without throwing", () => {
  meadow.update(0);
  meadow.update(1.5);
  meadow.update(37.25);
});

check("meadow.dispose releases the fx", () => {
  meadow.dispose();
});

// --- summary --------------------------------------------------------------
console.log("\n--- totals ---");
console.log(`motes        ${moteStats.tris} triangles, ${moteStats.meshes} draw call(s)`);
console.log(`butterflies  ${flyStats.tris} triangles, ${flyStats.meshes} draw call(s)`);
console.log(`combined     ${moteStats.tris + flyStats.tris} triangles`);

motes.dispose();
butterflies.dispose();
terrain.dispose();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nOK");
