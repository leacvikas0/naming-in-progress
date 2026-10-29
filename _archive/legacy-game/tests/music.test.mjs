// Music asset integrity. Verifies the built tracks are real, the manifest is
// not stale, and the loop points are inside the file. Run:
// node game/tests/music.test.mjs

import { strict as assert } from "node:assert";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = join(HERE, "..", "audio", "gen");
const MANIFEST = join(GEN, "music.json");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("music assets");

test("music.json exists and parses", () => {
  assert.ok(existsSync(MANIFEST), "run `npm run music` to build game/audio/gen/");
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  assert.ok(m.tracks && typeof m.tracks === "object", "manifest has tracks");
  assert.ok(Object.keys(m.tracks).length >= 2, "at least two tracks");
});

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { tracks: {} };

for (const [name, t] of Object.entries(manifest.tracks)) {
  test(`${name}: ogg exists, is real, and matches the manifest hash`, () => {
    const file = join(GEN, t.file);
    assert.ok(existsSync(file), `${t.file} missing`);
    const buf = readFileSync(file);
    assert.ok(buf.length > 100 * 1024, `${t.file} is only ${buf.length} bytes`);
    assert.equal(buf.toString("latin1", 0, 4), "OggS", `${t.file} is not an Ogg stream`);
    const hash = createHash("sha1").update(buf).digest("hex").slice(0, 8);
    assert.equal(hash, t.hash, `${t.file} changed since the manifest was written — re-run npm run music`);
  });

  test(`${name}: loop points are sane and inside the track`, () => {
    assert.ok(Number.isFinite(t.duration) && t.duration > 30, `${name} duration ${t.duration}`);
    assert.ok(Number.isFinite(t.loopStart) && t.loopStart > 0, `${name} loopStart ${t.loopStart}`);
    assert.ok(t.loopStart < t.loopEnd, `${name} loopStart must precede loopEnd`);
    assert.ok(t.loopEnd <= t.duration, `${name} loopEnd past the end of the file`);
    assert.ok(t.loopEnd - t.loopStart > 60, `${name} loop is too short to be a track`);
    assert.ok(t.fade > 0 && t.fade < t.loopStart, `${name} crossfade must fit before loopStart`);
  });

  test(`${name}: baked file is long enough to loop at the manifest points`, () => {
    const file = join(GEN, t.file);
    if (!existsSync(file)) return;
    const bytes = statSync(file).size;
    // ~160 kbps Vorbis: the file must be at least ~10 s of audio per 100 kB
    assert.ok(bytes / 1024 / 16 > t.duration * 0.5, `${t.file} looks truncated for ${t.duration}s`);
  });
}

console.log(`\n${passed} passed`);
