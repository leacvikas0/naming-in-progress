// Throwaway verification for game/src/vale-layout.js.
// Asserts the layout is valid static data: every asset key exists, the walkable
// rectangle and its paths stay open, and the shrine arch opening is walkable.
//
// Two clearances are deliberately distinguished, because the design intends them:
//   - nothing solid within 3 m of a path centre line (the route must stay open);
//   - landmark furniture may sit INSIDE its own clearing, but the reserved
//     centre of the shrine (10 m diameter testing space) must stay empty.
import { SHRINE, CAMP, LAYOUT } from "../../src/vale-layout.js";
import { ASSETS, CONFIG } from "../../src/balance.js";

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

const validKeys = new Set(Object.keys(ASSETS.valley));
const all = [
  ...SHRINE.placements.map((p) => ({ ...p, where: "shrine" })),
  ...CAMP.placements.map((p) => ({ ...p, where: "camp" })),
  ...LAYOUT.accents.map((p) => ({ ...p, where: "accent" })),
];

const loop = CONFIG.vale.loopPath;
const spokes = CONFIG.vale.spokes;

function distToSegments(x, z, segments) {
  let best = Infinity;
  for (const s of segments) {
    const [ax, az] = s.a;
    const [bx, bz] = s.b;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

const loopSegs = [];
for (let i = 0; i < loop.length - 1; i++) {
  loopSegs.push({ a: loop[i], b: loop[i + 1] });
}
const spokeSegs = (spokes || []).map((s) => ({ a: s.from, b: s.to }));
const allPathSegs = [...loopSegs, ...spokeSegs];

function distToPath(x, z) {
  return Math.min(distToSegments(x, z, loopSegs), distToSegments(x, z, spokeSegs));
}

console.log("vale-layout.js");

check("exports the expected shape", () => {
  if (!SHRINE || !Array.isArray(SHRINE.placements)) throw new Error("SHRINE.placements missing");
  if (!CAMP || !Array.isArray(CAMP.placements)) throw new Error("CAMP.placements missing");
  if (!Array.isArray(LAYOUT.accents)) throw new Error("LAYOUT.accents missing");
  if (LAYOUT.shrine !== SHRINE) throw new Error("LAYOUT.shrine is not SHRINE");
  if (LAYOUT.camp !== CAMP) throw new Error("LAYOUT.camp is not CAMP");
});

check("every asset key exists in ASSETS.valley", () => {
  for (const p of all) {
    if (!validKeys.has(p.asset)) throw new Error(`${p.where}: unknown asset key "${p.asset}"`);
  }
});

check("asset references are bare keys, never URLs", () => {
  for (const p of all) {
    if (typeof p.asset !== "string" || p.asset.includes("/")) {
      throw new Error(`${p.where}: asset is not a bare key: ${p.asset}`);
    }
  }
});

check("every placement has finite coordinates and a positive scale", () => {
  for (const p of all) {
    for (const k of ["x", "z", "scale"]) {
      if (!Number.isFinite(p[k])) throw new Error(`${p.where}/${p.asset}: ${k} not finite`);
    }
    if (p.scale <= 0) throw new Error(`${p.where}/${p.asset}: scale ${p.scale} not positive`);
    if (p.y !== undefined && (!Number.isFinite(p.y) || p.y < 0)) {
      throw new Error(`${p.where}/${p.asset}: y=${p.y} is below the ground plane`);
    }
  }
});

check("ground-level props sit on the ground; only arch spans are elevated", () => {
  // The legitimate elevated pieces are the arch haunch and its broken stub, which
  // must rest on the piers. The bedroll is a documented exception: its glTF origin
  // sits 0.05 m below its base, so it is raised 0.16 m at scale 3.2 to lie flat.
  // Everything else is a ground prop at y = 0.
  for (const p of all) {
    if (!p.y) continue;
    if (p.note === "bedroll") {
      if (p.y < 0.1 || p.y > 0.25) throw new Error(`bedroll y=${p.y} outside the 0.1-0.25 lift band`);
      continue;
    }
    const isSpan = /span|stub/.test(p.note || "");
    if (!isSpan) throw new Error(`${p.where}/${p.asset}: unexpected y=${p.y} ("${p.note}")`);
    if (p.y < 2.5 || p.y > 4.0) throw new Error(`${p.where}/${p.asset}: span y=${p.y} outside pier height`);
  }
});

check("no solid prop within 3 m of a path centre line", () => {
  const viol = all
    .filter((p) => p.collider)
    .map((p) => ({ p, d: distToPath(p.x, p.z) }))
    .filter((r) => r.d < 3);
  if (viol.length) {
    throw new Error(viol.map((v) => `${v.p.where}/${v.p.asset}@(${v.p.x},${v.p.z}) d=${v.d.toFixed(2)}`).join("; "));
  }
});

check("the shrine arch opening is walkable", () => {
  const piers = SHRINE.placements.filter((p) => /pier/.test(p.note || ""));
  if (piers.length !== 2) throw new Error(`expected 2 piers, found ${piers.length}`);
  const [a, b] = piers;
  const centreDist = Math.hypot(a.x - b.x, a.z - b.z);
  const gap = centreDist - (a.collider + b.collider);
  console.log(`      pier centres ${centreDist.toFixed(2)} m apart, collider gap ${gap.toFixed(2)} m`);
  // Hero radius is 0.55; enemies are similar. 1.2 m clear is the real minimum.
  if (gap < 1.2) throw new Error(`walkable gap ${gap.toFixed(2)} m too narrow`);
});

check("the shrine keeps its 10 m testing space empty", () => {
  // No collider (piers included) inside a 5 m radius of the clearing centre.
  // The design reserves this for the future spellbook interaction.
  for (const p of SHRINE.placements) {
    if (!p.collider) continue;
    const d = Math.hypot(p.x - SHRINE.centre.x, p.z - SHRINE.centre.z);
    if (d < 5) throw new Error(`${p.asset} collider inside the reserved testing space (d=${d.toFixed(2)})`);
  }
});

check("the camp keeps a walkable middle", () => {
  for (const p of CAMP.placements) {
    if (!p.collider) continue;
    const d = Math.hypot(p.x - CAMP.centre.x, p.z - CAMP.centre.z);
    if (d < 3.0) throw new Error(`${p.asset} collider in the camp middle (d=${d.toFixed(2)})`);
  }
});

check("colliders are all inside the playable rectangle", () => {
  const b = { minX: -46, maxX: 46, minZ: -46, maxZ: 46 };
  for (const p of all) {
    if (!p.collider) continue;
    if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) {
      throw new Error(`${p.where}/${p.asset}@(${p.x},${p.z}) outside bounds`);
    }
  }
});

check("accents never crowd a landmark centre", () => {
  for (const p of LAYOUT.accents) {
    for (const [name, c] of Object.entries(CONFIG.vale.landmarks)) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < 5) throw new Error(`accent ${p.asset}@(${p.x},${p.z}) only ${d.toFixed(2)} m from ${name}`);
    }
  }
});

const solid = all.filter((p) => p.collider);
console.log(`\n      placements: shrine=${SHRINE.placements.length} camp=${CAMP.placements.length} accents=${LAYOUT.accents.length}`);
console.log(`      solid colliders: ${solid.length}`);

console.log(failures === 0 ? "\nall layout checks passed" : `\n${failures} FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
