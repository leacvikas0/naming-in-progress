import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "catalog", "index.json");
const OUT = path.join(ROOT, "reports", "rig-inspect.json");

function parseGlbJson(buf) {
  if (buf.length < 20) throw new Error("too small");
  const magic = buf.toString("ascii", 0, 4);
  if (magic !== "glTF") {
    return JSON.parse(buf.toString("utf8"));
  }
  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error("GLB chunk 0 is not JSON");
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
}

function inspectDoc(doc) {
  const nodes = doc.nodes ?? [];
  const skins = doc.skins ?? [];
  const animations = doc.animations ?? [];
  const meshes = doc.meshes ?? [];
  const jointSet = new Set();
  for (const skin of skins) {
    for (const j of skin.joints ?? []) jointSet.add(j);
  }
  let skinnedPrimitives = 0;
  for (const mesh of meshes) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.attributes?.JOINTS_0) skinnedPrimitives += 1;
    }
  }
  return {
    nodes: nodes.length,
    meshes: meshes.length,
    skins: skins.length,
    skinnedPrimitives,
    joints: jointSet.size,
    jointNames: [...jointSet]
      .slice(0, 24)
      .map((i) => nodes[i]?.name ?? `node_${i}`),
    clips: animations.map((a) => ({
      name: a.name ?? "(unnamed)",
      channels: (a.channels ?? []).length,
    })),
    rigged: skins.length > 0 && skinnedPrimitives > 0,
    playable: animations.length > 0 && skins.length > 0,
  };
}

async function main() {
  const catalog = JSON.parse(await readFile(INDEX, "utf8"));
  const reports = [];
  let playable = 0;

  const candidates = catalog.assets.filter(
    (a) => a.kind === "character" || a.format === "glb" || a.format === "gltf"
  );

  // Inspect all characters, plus a handful of props to prove they are static
  const props = catalog.assets.filter((a) => a.kind === "prop").slice(0, 8);
  const chars = catalog.assets.filter((a) => a.kind === "character");
  const sample = [...chars, ...props];

  for (const asset of sample) {
    const abs = path.join(ROOT, asset.url.replace(/^\//, ""));
    try {
      const buf = await readFile(abs);
      const doc = parseGlbJson(buf);
      const info = inspectDoc(doc);
      if (info.playable) playable += 1;
      reports.push({ id: asset.id, pack: asset.pack, kind: asset.kind, ...info });
    } catch (err) {
      reports.push({
        id: asset.id,
        pack: asset.pack,
        kind: asset.kind,
        error: String(err.message || err),
      });
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    inspected: reports.length,
    playableCharacters: playable,
    note:
      "KayKit characters already ship a humanoid skeleton + clips. Kenney props are static on purpose. This script does not auto-rig.",
    reports,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(summary, null, 2));
  console.log(
    `inspected ${reports.length} files, ${playable} playable rigs -> reports/rig-inspect.json`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
