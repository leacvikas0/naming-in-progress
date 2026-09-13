// Regression test for the music director's gesture path.
//
// The bug: pressing a key or clicking a second time while a track was still
// loading froze the page. playMusic() scheduled `loadMusic(name).then(flush)`
// whenever the buffer was missing, and loadMusic() returned an ALREADY-RESOLVED
// promise when a load was in flight. So every gesture ran
//   flush -> playMusic -> resolved .then -> flush -> ...
// an infinite microtask chain that starves the event loop.
//
// The scenario itself lives in fixtures/music-gesture-harness.mjs and is run as
// a child process, because the failure mode is a hang: an infinite microtask
// chain prevents timers from firing, so an in-process watchdog cannot save us.
// Only an external kill can. Run: node game/tests/music-gesture.test.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(HERE, "fixtures", "music-gesture-harness.mjs");
const KILL_MS = 15000;

let passed = 0;
function test(name, fn) {
  return fn().then(
    () => {
      passed++;
      console.log(`  ok  ${name}`);
    },
    (err) => {
      console.error(`FAIL  ${name}\n      ${err.message}`);
      process.exitCode = 1;
    }
  );
}

function runHarness(mode) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HARNESS, mode], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, out, timedOut: true });
    }, KILL_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, out, timedOut: false });
    });
  });
}

console.log("music gesture path");

await test("repeated gestures during a load do not hang and start playback", async () => {
  const r = await runHarness("success");
  if (r.timedOut) throw new Error(`harness hung for ${KILL_MS}ms (the original bug)`);
  if (r.code !== 0) throw new Error(`exit ${r.code}: ${r.out.trim()}`);
  if (!r.out.includes("SURVIVED")) throw new Error(`unexpected output: ${r.out.trim()}`);
});

await test("a failed load does not hang and plays nothing", async () => {
  const r = await runHarness("failure");
  if (r.timedOut) throw new Error(`harness hung for ${KILL_MS}ms`);
  if (r.code !== 0) throw new Error(`exit ${r.code}: ${r.out.trim()}`);
  if (!r.out.includes("SURVIVED_FAILURE")) throw new Error(`unexpected output: ${r.out.trim()}`);
});

console.log(`\n${passed} passed`);
