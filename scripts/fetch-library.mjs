import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  rm,
  readdir,
  copyFile,
  stat,
  cp,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(ROOT, "_tmp");
const LIBRARY = path.join(ROOT, "library");
const PACKS = JSON.parse(
  await readFile(path.join(ROOT, "scripts", "packs.json"), "utf8")
);

const KEEP = new Set([
  ".glb",
  ".gltf",
  ".bin",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".ktx2",
]);

const UA = { "User-Agent": "kilo-3d-kit/0.2 (local CC0 library fetch)" };

async function download(url, file) {
  const res = await fetch(url, { headers: UA, redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  await pipeline(res.body, createWriteStream(file));
}

async function kenneyZipUrl(slug) {
  const res = await fetch(`https://kenney.nl/assets/${slug}`, { headers: UA });
  if (!res.ok) throw new Error(`Kenney page ${slug} -> ${res.status}`);
  const html = await res.text();
  const match = html.match(
    /https:\/\/kenney\.nl\/media\/pages\/assets\/[^"'\\\s]+\.zip/
  );
  if (!match) throw new Error(`No zip URL on Kenney page ${slug}`);
  return match[0];
}

function unzip(zipFile, outDir) {
  const tar = spawnSync("tar", ["-xf", zipFile, "-C", outDir], {
    encoding: "utf8",
  });
  if (tar.status !== 0) {
    throw new Error(`tar extract failed: ${tar.stderr || tar.stdout}`);
  }
}

async function walk(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

async function countMeshes(dir) {
  try {
    const files = await walk(dir);
    return files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ext === ".glb" || ext === ".gltf";
    }).length;
  } catch {
    return 0;
  }
}

async function extractKeepers(extractRoot, dest) {
  await mkdir(dest, { recursive: true });
  const files = await walk(extractRoot);
  let copied = 0;
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!KEEP.has(ext)) continue;
    const rel = path.relative(extractRoot, file);
    const target = path.join(dest, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(file, target);
    copied += 1;
  }
  if (copied === 0) {
    await cp(extractRoot, dest, { recursive: true });
  }
  return copied;
}

async function resolveUrl(pack) {
  if (pack.kenneySlug) return kenneyZipUrl(pack.kenneySlug);
  if (pack.github) {
    return `https://codeload.github.com/${pack.github}/zip/refs/heads/main`;
  }
  if (pack.url) return pack.url;
  throw new Error(`Pack ${pack.id} has no source`);
}

async function main() {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  await mkdir(LIBRARY, { recursive: true });

  for (const pack of PACKS) {
    const dest = path.join(LIBRARY, pack.id);
    const existing = await countMeshes(dest);
    if (existing > 0) {
      console.log(`skip ${pack.id} (${existing} meshes already)`);
      continue;
    }
    try {
      const url = await resolveUrl(pack);
      const zip = path.join(TMP, `${pack.id}.zip`);
      const extract = path.join(TMP, pack.id);
      console.log(`fetch ${pack.id}`);
      await download(url, zip);
      const size = (await stat(zip)).size;
      console.log(`  zip ${Math.round(size / 1024)} KB`);
      await mkdir(extract, { recursive: true });
      unzip(zip, extract);
      await rm(dest, { recursive: true, force: true });
      const n = await extractKeepers(extract, dest);
      const meshes = await countMeshes(dest);
      console.log(`  kept ${n} files, ${meshes} meshes`);
      if (meshes === 0) {
        console.warn(`  warn: no gltf/glb in ${pack.id}`);
      }
    } catch (err) {
      console.warn(`  fail ${pack.id}: ${err.message}`);
    }
  }

  await rm(TMP, { recursive: true, force: true });
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
