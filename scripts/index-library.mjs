import { mkdir, readdir, writeFile, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIBRARY = path.join(ROOT, "library");
const OUT = path.join(ROOT, "catalog", "index.json");
const PACKS = JSON.parse(
  await readFile(path.join(ROOT, "scripts", "packs.json"), "utf8")
);
const PACK_META = Object.fromEntries(PACKS.map((p) => [p.id, p]));

async function walk(dir, acc = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function slug(packId, rel) {
  return `${packId}/${rel}`;
}

function inferKind(pack, rel, ext) {
  const hero =
    /\/Characters\//i.test(rel) ||
    /mini-characters/i.test(pack.id) ||
    /skeletons/i.test(pack.id);
  if (pack.kind === "character" && (hero || ext === ".glb")) {
    if (/Assets\/gltf\//i.test(rel) && pack.id.startsWith("kaykit-adventurers")) {
      return "prop";
    }
    if (pack.id === "kaykit-adventurers") {
      return /\/Characters\//i.test(rel) && ext === ".glb" ? "character" : "prop";
    }
    if (pack.id === "kaykit-skeletons") {
      return /\/Characters\//i.test(rel) && ext === ".glb" ? "character" : "prop";
    }
    if (pack.id === "kenney-mini-characters") return "character";
    if (pack.id === "kenney-mini-dungeon" && /character/i.test(rel)) {
      return "character";
    }
  }
  if (pack.kind === "mixed" && /character/i.test(rel)) return "character";
  return "prop";
}

async function main() {
  const assets = [];
  const packCounts = {};

  for (const pack of PACKS) {
    const packDir = path.join(LIBRARY, pack.id);
    const files = await walk(packDir);
    packCounts[pack.id] = 0;
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext !== ".glb" && ext !== ".gltf") continue;
      const rel = path.relative(packDir, file).replaceAll("\\", "/");
      const info = await stat(file);
      const kind = inferKind(pack, rel, ext);
      assets.push({
        id: slug(pack.id, rel),
        pack: pack.id,
        name: path.basename(file, ext),
        relPath: rel,
        url: `/library/${pack.id}/${rel}`,
        bytes: info.size,
        format: ext.slice(1),
        author: pack.author,
        license: pack.license,
        style: pack.style,
        kind,
        rigged: kind === "character",
      });
      packCounts[pack.id] += 1;
    }
  }

  assets.sort((a, b) => a.id.localeCompare(b.id));
  const styles = [...new Set(assets.map((a) => a.style))].sort();
  const catalog = {
    generatedAt: new Date().toISOString(),
    styleBible: "Kenney low-poly + KayKit (human CC0, no AI catalogues)",
    counts: {
      total: assets.length,
      props: assets.filter((a) => a.kind === "prop").length,
      characters: assets.filter((a) => a.kind === "character").length,
      packs: Object.values(packCounts).filter((n) => n > 0).length,
    },
    styles,
    packs: packCounts,
    assets,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(catalog, null, 2));
  console.log(
    `indexed ${assets.length} meshes across ${catalog.counts.packs} packs -> catalog/index.json`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
