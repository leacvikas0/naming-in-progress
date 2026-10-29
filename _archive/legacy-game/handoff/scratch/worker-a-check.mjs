// Throwaway verification for game/src/vale-scenery.js.
// Builds stub templates from primitives (no GLTF, no network), then asserts the
// module's contract: interface shape, tree budget, allocation-free update,
// deterministic rebuild, and reset parity.
import * as THREE from "three";
import { createScenery } from "../../src/vale-scenery.js";
import { CONFIG, VALE_PALETTE, ASSETS, makeRng } from "../../src/balance.js";

const KEYS = Object.keys(ASSETS.valley).filter((k) => k !== "coin");

function stubTemplates() {
  const out = {};
  for (const key of KEYS) {
    const root = new THREE.Group();
    // Two-mesh "tree": trunk box + canopy sphere, matching real multi-mesh glTF.
    const trunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.6, 0.3),
      new THREE.MeshBasicMaterial({ name: "trunk" })
    );
    trunk.position.y = 0.8;
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1, 6, 4),
      new THREE.MeshBasicMaterial({ name: "canopy" })
    );
    canopy.position.y = 2.2;
    root.add(trunk, canopy);
    out[key] = root;
  }
  return out;
}

const bounds = { minX: -46, maxX: 46, minZ: -46, maxZ: 46 };

// Real path distance approximation for the loop + spokes, used only by this check.
const waypoints = CONFIG.vale.loopPath;
function pathDistance(x, z) {
  let best = Infinity;
  const pts = [...waypoints, [0, 6], [0, -31], [-31, -4], [29, 17], [-23, 22]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

function build() {
  return createScenery({
    palette: VALE_PALETTE,
    config: CONFIG.vale,
    rng: makeRng(CONFIG.vale.seed),
    templates: stubTemplates(),
    bounds,
    pathDistance,
    groundHeight: () => 0,
  });
}

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}

console.log("vale-scenery.js");

const scenery = build();

check("returns the frozen interface", () => {
  for (const key of ["group", "update", "reset", "colliders", "stats"]) {
    if (!(key in scenery)) throw new Error(`missing ${key}`);
  }
  if (typeof scenery.update !== "function") throw new Error("update not a function");
  if (typeof scenery.reset !== "function") throw new Error("reset not a function");
  if (!Array.isArray(scenery.colliders)) throw new Error("colliders not an array");
  if (!(scenery.group instanceof THREE.Group)) throw new Error("group not a THREE.Group");
});

check("group is populated with instanced batches", () => {
  if (scenery.group.children.length === 0) throw new Error("group empty");
  const instanced = scenery.group.children.filter((c) => c.isInstancedMesh);
  if (instanced.length === 0) throw new Error("no InstancedMesh batches");
  for (const m of instanced) {
    if (m.count === 0) throw new Error(`empty batch ${m.name}`);
  }
  console.log(`      batches=${instanced.length} children=${scenery.group.children.length}`);
});

check("tree count is in the 80-120 design band", () => {
  const { trees } = scenery.stats;
  console.log(`      trees=${trees} shrubs=${scenery.stats.shrubs} grass=${scenery.stats.grassClumps} flowers=${scenery.stats.flowerClumps}`);
  if (trees < 80 || trees > 120) throw new Error(`trees=${trees} outside 80-120`);
});

check("ground cover meets the requested clump counts", () => {
  const { grassClumps, flowerClumps, shrubs } = scenery.stats;
  if (grassClumps < 900) throw new Error(`grassClumps=${grassClumps} too low`);
  if (flowerClumps < 250) throw new Error(`flowerClumps=${flowerClumps} too low`);
  if (shrubs < 120) throw new Error(`shrubs=${shrubs} too low`);
});

check("colliders are few and inside the playable rectangle", () => {
  const c = scenery.colliders;
  console.log(`      colliders=${c.length}`);
  // The design asks for "a small circular collider" only for solid trunks and
  // boulders near walkable space; it gives no number. 60 is a sanity ceiling.
  if (c.length > 60) throw new Error(`colliders=${c.length} > 60`);
  for (const col of c) {
    if (!Number.isFinite(col.x) || !Number.isFinite(col.z) || !Number.isFinite(col.radius)) {
      throw new Error("collider has non-finite field");
    }
    if (col.x < bounds.minX - 2 || col.x > bounds.maxX + 2 || col.z < bounds.minZ - 2 || col.z > bounds.maxZ + 2) {
      throw new Error(`collider outside bounds: ${col.x},${col.z}`);
    }
  }
});

check("nothing is planted on the player start", () => {
  // The player starts at (0,6); no collider may sit within 2 m of it.
  for (const col of scenery.colliders) {
    const d = Math.hypot(col.x - 0, col.z - 6);
    if (d < 2.0) throw new Error(`collider at player start: ${col.x},${col.z} d=${d.toFixed(2)}`);
  }
});

check("update() runs without throwing and allocates no children", () => {
  const before = scenery.group.children.length;
  const infoBefore = scenery.group.children.map((c) => c.count);
  for (let i = 0; i < 60; i++) scenery.update(1 / 60, i / 60);
  if (scenery.group.children.length !== before) throw new Error("children changed during update");
  const infoAfter = scenery.group.children.map((c) => c.count);
  if (infoBefore.join(",") !== infoAfter.join(",")) throw new Error("instance counts changed during update");
});

check("reset() restores pollen to the initial positions", () => {
  const pollen = scenery.group.children.find((c) => c.name === "valePollen");
  if (!pollen) throw new Error("no pollen points");
  // reset() first so the captured baseline is the true initial state, not
  // wherever a previous check left the motes.
  scenery.reset();
  const arr = pollen.geometry.attributes.position.array;
  const initial = Array.from(arr);
  for (let i = 0; i < 30; i++) scenery.update(1 / 60, 0.5 + i * 0.1);
  const moved = Array.from(arr);
  if (initial.join(",") === moved.join(",")) throw new Error("pollen did not move during update");
  scenery.reset();
  const restored = Array.from(arr);
  for (let i = 0; i < initial.length; i++) {
    if (Math.abs(initial[i] - restored[i]) > 1e-6) {
      throw new Error(`pollen[${i}] ${initial[i]} != ${restored[i]} after reset`);
    }
  }
});

check("a rebuild with the same seed is deterministic", () => {
  const a = build();
  const b = build();
  if (a.stats.trees !== b.stats.trees) throw new Error("tree count differs");
  if (a.stats.grassClumps !== b.stats.grassClumps) throw new Error("grass count differs");
  if (a.colliders.length !== b.colliders.length) throw new Error("collider count differs");
  const sig = (s) => s.group.children.filter((c) => c.isInstancedMesh).map((c) => `${c.name}:${c.count}`).join("|");
  if (sig(a) !== sig(b)) throw new Error("batch signature differs");
  if (a.stats.trees !== scenery.stats.trees) throw new Error("rebuild tree count differs from first build");
});

check("a missing template is skipped, not fatal", () => {
  const templates = stubTemplates();
  delete templates.treeBroad1;
  delete templates.flowerPink;
  const s = createScenery({
    palette: VALE_PALETTE,
    config: CONFIG.vale,
    rng: makeRng(99),
    templates,
    bounds,
    pathDistance,
    groundHeight: () => 0,
  });
  if (!(s.group instanceof THREE.Group)) throw new Error("no group");
  if (s.stats.trees < 50) throw new Error(`trees=${s.stats.trees} collapsed when a species failed`);
});

console.log(failures === 0 ? "\nall scenery checks passed" : `\n${failures} FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
