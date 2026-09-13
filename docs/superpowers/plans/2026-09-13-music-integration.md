# Music Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two AI-generated tracks to the game as a seamless, state-driven music director — title theme on character select, combat theme during a run, with crossfades, upgrade-screen ducking, and a tape-stop on death.

**Architecture:** An offline ffmpeg pipeline (`game/audio/build-music.mjs`) bakes a crossfade loop into each track and normalizes loudness, emitting `game/audio/gen/*.ogg` plus a hashed `music.json` manifest — the same shape as the existing `game/ui/` chrome pipeline. At runtime a music director inside `game/src/audio.js` decodes the Oggs, loops them with sample-accurate `loopStart`/`loopEnd`, and drives gain/filter/rate ramps. `main.js` remains the only wiring point.

**Tech Stack:** Node 24 ESM, ffmpeg (libvorbis, loudnorm, acrossfade), Web Audio API, no new dependencies.

## Global Constraints

- `main.js` is the only file that wires modules together (CONTRACT.md). Modules may import only `three`, `./events.js`, `./balance.js`.
- Do not add new CSS files. Do not restyle `index.html`.
- `library/` is gitignored; `game/audio/src/` and `game/audio/gen/` are committed.
- Music must fail silently: any fetch/decode/WebAudio failure leaves the game running with SFX only, as it does today.
- Existing synthesized SFX and the `sfx` event must keep working unchanged.
- `setMuted` must silence music and SFX together.
- Node 24 (`node --version` → v24.14.0). Windows PowerShell 5.1 shell — chain commands with `;` or `if ($?) {}`, never `&&`.

## File Structure

| File | Responsibility |
|---|---|
| `game/audio/src/title.mp3`, `combat.mp3` | committed source tracks |
| `game/audio/build-music.mjs` | loop bake + loudness + Vorbis encode + manifest |
| `game/audio/gen/title.ogg`, `combat.ogg`, `music.json` | build output; the only files the game loads |
| `game/src/audio.js` | SFX (existing) + music director (new) |
| `game/src/main.js` | state → music call wiring, `M` mute |
| `game/tests/music.test.mjs` | manifest and asset integrity |
| `package.json` | `music` script, test wiring |
| `game/src/CONTRACT.md` | document the music API and pipeline |
| `CREDITS.md` | record the music |

---

### Task 1: Sources and loop-bake pipeline

**Files:**
- Create: `game/audio/src/title.mp3`, `game/audio/src/combat.mp3` (copied from `~/Downloads`)
- Create: `game/audio/build-music.mjs`
- Create (generated): `game/audio/gen/title.ogg`, `game/audio/gen/combat.ogg`, `game/audio/gen/music.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `game/audio/gen/music.json` with the shape
  `{ generatedAt, loudness, tracks: { [name]: { file, duration, loopStart, loopEnd, fade, bytes, hash } } }`
  where `duration === loopEnd` and `hash` is 8 hex chars of the Ogg's SHA-1.

- [ ] **Step 1: Copy the sources into the project**

```powershell
New-Item -ItemType Directory -Force -Path game\audio\src | Out-Null
Copy-Item "$env:USERPROFILE\Downloads\Dungeon Adventure Title Theme (3).mp3" game\audio\src\title.mp3
Copy-Item "$env:USERPROFILE\Downloads\dungeon op 1 .mp3" game\audio\src\combat.mp3
```

- [ ] **Step 2: Write the build script**

Create `game/audio/build-music.mjs` with exactly this content:

```js
// Compile the music. Run: node game/audio/build-music.mjs   (npm run music)
//
// Both source tracks are one-shots with written endings — neither loops
// natively. This bakes a seamless loop into each one:
//
//   body   = source[0, E-F]        everything up to the crossfade
//   A      = source[E-F, E]        tail of the loop window
//   B      = source[L-F, L]        the F seconds immediately before the restart
//   baked  = body + crossfade(A -> B)
//
// The baked buffer is exactly E seconds long and the runtime restarts playback
// at position L. The crossfade ends on source time L, so the sample after the
// wrap is the sample the loop restarts on: continuous by construction, no click
// and no repeated bar.
//
// Then two-pass loudnorm to -16 LUFS / -1.5 dBTP. The sources measure -11.6 and
// -13.0 LUFS and the combat track true-peaks at +0.2 dBFS (it clips); pulling
// both down matches them to each other and leaves room for the SFX on top.
//
// Output is Vorbis in Ogg. Deterministic: same sources in, same gen/ out.
// Re-run after retuning any loop point.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "src");
const OUT = join(HERE, "gen");
const TMP = join(tmpdir(), "kilo-3d-kit-music");

// Loop points, in seconds against the source file.
//   intro = 0 .. loopStart        played once
//   loop  = loopStart .. loopEnd  repeated forever
//   fade  = crossfade baked into the tail
//
// Chosen from the measured structure (docs/superpowers/specs/2026-09-13-*):
//   title  — body runs 8-166s; the 7.5s near-silent break stays in the intro.
//   combat — climax runs 156.6-172s and the outro starts at 172s, so the loop
//            keeps the climax; the 8s blend softens the drop back to the top.
const TRACKS = {
  title: { src: "title.mp3", loopStart: 16, loopEnd: 166, fade: 6 },
  combat: { src: "combat.mp3", loopStart: 10, loopEnd: 172, fade: 8 },
};

const LOUDNESS = { I: -16, TP: -1.5, LRA: 11 };
const QUALITY = "5";

function ff(args, level = "error") {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", level, "-y", ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr || r.stdout}`);
  return `${r.stdout || ""}${r.stderr || ""}`;
}

function probeDuration(file) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" }
  );
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}`);
  return Number.parseFloat(r.stdout.trim());
}

// body + crossfade(tail -> pre), written as a WAV at source sample rate.
function bake({ loopStart: L, loopEnd: E, fade: F }, src, dest) {
  const graph = [
    `[0:a]atrim=0:${E - F},asetpts=PTS-STARTPTS[body]`,
    `[0:a]atrim=${E - F}:${E},asetpts=PTS-STARTPTS[tail]`,
    `[0:a]atrim=${L - F}:${L},asetpts=PTS-STARTPTS[pre]`,
    `[tail][pre]acrossfade=d=${F}:c1=qsin:c2=qsin[x]`,
    `[body][x]concat=n=2:v=0:a=1[out]`,
  ].join(";");
  ff(["-i", src, "-filter_complex", graph, "-map", "[out]", "-ar", "44100", "-ac", "2", dest]);
}

// Pass 1: measure the baked buffer so pass 2 can apply a linear, dynamics-
// preserving gain instead of the default dynamic mode.
function measure(wav) {
  const out = ff(
    [
      "-i", wav,
      "-af",
      `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:print_format=json`,
      "-f", "null", "-",
    ],
    "info"
  );
  const match = out.match(/\{[^{}]*"input_i"[\s\S]*?\}/);
  if (!match) throw new Error("loudnorm produced no JSON");
  return JSON.parse(match[0]);
}

function encode(wav, ogg, m) {
  const filter = [
    `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}`,
    `measured_I=${m.input_i}`,
    `measured_TP=${m.input_tp}`,
    `measured_LRA=${m.input_lra}`,
    `measured_thresh=${m.input_thresh}`,
    `offset=${m.target_offset}`,
    "linear=true",
  ].join(":");
  ff(["-i", wav, "-af", filter, "-c:a", "libvorbis", "-q:a", QUALITY, ogg]);
}

function main() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    loudness: LOUDNESS,
    tracks: {},
  };

  for (const [name, track] of Object.entries(TRACKS)) {
    const src = join(SRC, track.src);
    const wav = join(TMP, `${name}.wav`);
    const ogg = join(OUT, `${name}.ogg`);

    console.log(`bake  ${name}`);
    bake(track, src, wav);

    const measured = probeDuration(wav);
    if (Math.abs(measured - track.loopEnd) > 0.1) {
      throw new Error(`${name}: baked ${measured.toFixed(3)}s, expected ${track.loopEnd}s`);
    }

    const m = measure(wav);
    console.log(
      `      in ${Number(m.input_i).toFixed(1)} LUFS / ${Number(m.input_tp).toFixed(1)} dBTP` +
        ` -> ${LOUDNESS.I} LUFS / ${LOUDNESS.TP} dBTP`
    );
    encode(wav, ogg, m);

    const bytes = readFileSync(ogg);
    manifest.tracks[name] = {
      file: `${name}.ogg`,
      duration: track.loopEnd,
      loopStart: track.loopStart,
      loopEnd: track.loopEnd,
      fade: track.fade,
      bytes: statSync(ogg).size,
      hash: createHash("sha1").update(bytes).digest("hex").slice(0, 8),
    };
    console.log(
      `      ${name}.ogg  ${(statSync(ogg).size / 1048576).toFixed(2)} MB` +
        `  ${track.loopStart}-${track.loopEnd}s  hash ${manifest.tracks[name].hash}`
    );
  }

  writeFileSync(join(OUT, "music.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  rmSync(TMP, { recursive: true, force: true });
  console.log(`\nmusic.json  ${Object.keys(manifest.tracks).length} tracks -> ${OUT}`);
}

main();
```

- [ ] **Step 3: Run the build**

Run: `node game/audio/build-music.mjs`
Expected: two `bake` blocks, each reporting an input loudness and a written `.ogg`; ends with `music.json  2 tracks`.

- [ ] **Step 4: Verify the baked loops are real**

Run:
```powershell
node -e "const m=require('./game/audio/gen/music.json');for(const[k,t]of Object.entries(m.tracks)){console.log(k,t.duration+'s','loop',t.loopStart+'-'+t.loopEnd,'hash',t.hash)}"
```
Expected: `title 166s loop 16-166` and `combat 172s loop 10-172`, each with a non-empty hash.

Then confirm both Oggs decode and start with the OggS magic:
```powershell
ffprobe -v error -show_entries format=duration,bit_rate -of default=nw=1 game\audio\gen\title.ogg
ffprobe -v error -show_entries format=duration,bit_rate -of default=nw=1 game\audio\gen\combat.ogg
```
Expected: durations ≈ 166 and ≈ 172, bit rate ≈ 160000.

- [ ] **Step 5: Commit**

```powershell
git add game/audio
git commit -m "Add music build pipeline: crossfade loop bake + loudness normalisation"
```

---

### Task 2: Music director in audio.js

**Files:**
- Modify: `game/src/audio.js`
- Test: `game/tests/music.test.mjs` (created in Task 4)

**Interfaces:**
- Consumes: `game/audio/gen/music.json` (Task 1).
- Produces: `audio.music` with `{ load(name), prefetch(names), play(name, opts), stop(opts), setFilter(opts), state }` where
  `play(name, { fade, restart })`, `stop({ fade })`, and
  `setFilter({ gain, lowpass, rate, fade })`. `audio.music.state` returns
  `{ loaded, pending, current, gain, lowpass, rate }`.

- [ ] **Step 1: Add the music director to `createAudio`**

In `game/src/audio.js`, add these constants above `export function createAudio`:

```js
const MUSIC_MANIFEST = "/game/audio/gen/music.json";
const MUSIC_BASE = "/game/audio/gen/";
const MUSIC_OPEN = 20000;
const MUSIC_MIN_HZ = 40;
```

- [ ] **Step 2: Add the music state inside `createAudio`**

Immediately after the existing `const voices = [];` declaration, add:

```js
  const musicBuffers = new Map();
  const musicEntries = new Map();
  const musicLoading = new Set();
  const musicWanted = new Set();
  let musicManifest = null;
  let musicBus = null;
  let music = null;
  let musicPending = null;
```

- [ ] **Step 3: Add the music functions inside `createAudio`**

Add immediately before the `const SOUNDS = {` declaration:

```js
  /* ---------------- music ---------------- */

  function rampParam(param, value, now, fade) {
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + Math.max(0.01, fade));
    } catch (err) {
      try {
        param.value = value;
      } catch (err2) {}
    }
  }

  function ensureMusicBus() {
    if (!ctx || !master) return null;
    if (!musicBus) {
      musicBus = ctx.createGain();
      musicBus.gain.value = 1;
      musicBus.connect(master);
    }
    return musicBus;
  }

  // Loop end comes from the manifest, not buffer.duration: Chrome decodes
  // Vorbis through ffmpeg, which can pad the tail (ffmpeg ticket 6367), and
  // looping over that padding would click at every wrap.
  function trackEnd(entry, buffer) {
    const want = Number.isFinite(entry.duration) ? entry.duration : buffer.duration;
    return Math.max(0.1, Math.min(want, buffer.duration));
  }

  function musicState() {
    return {
      loaded: musicBuffers.size,
      pending: musicPending ? musicPending.name : null,
      current: music ? music.name : null,
      gain: music ? music.gain.gain.value : 0,
      lowpass: music ? music.lowpass.frequency.value : 0,
      rate: music ? music.source.playbackRate.value : 1,
    };
  }

  function loadMusic(name) {
    if (!ctx) {
      musicWanted.add(name);
      return Promise.resolve(null);
    }
    if (musicBuffers.has(name) || musicLoading.has(name)) return Promise.resolve(null);
    musicLoading.add(name);
    return (async () => {
      try {
        if (!musicManifest) {
          const res = await fetch(MUSIC_MANIFEST, { cache: "no-store" });
          if (!res.ok) throw new Error(`manifest ${res.status}`);
          musicManifest = await res.json();
        }
        const entry = musicManifest && musicManifest.tracks && musicManifest.tracks[name];
        if (!entry) throw new Error(`no track "${name}"`);
        const url = `${MUSIC_BASE}${entry.file}?v=${entry.hash}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${entry.file} ${res.status}`);
        const bytes = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(bytes);
        musicBuffers.set(name, buffer);
        musicEntries.set(name, entry);
        return { buffer, entry };
      } catch (err) {
        return null; // music is optional: never surface a load failure
      } finally {
        musicLoading.delete(name);
      }
    })();
  }

  function flushMusicPending() {
    if (!musicPending || !ctx) return;
    const p = musicPending;
    musicPending = null;
    playMusic(p.name, p.opts);
  }

  function playMusic(name, opts) {
    const o = opts || EMPTY_OPTS;
    const fade = Math.max(0.01, o.fade == null ? 1.5 : o.fade);
    if (!ctx || !master) {
      musicPending = { name, opts: o };
      loadMusic(name);
      return;
    }
    if (!musicBuffers.has(name)) {
      musicPending = { name, opts: o };
      loadMusic(name).then(() => flushMusicPending());
      return;
    }
    const bus = ensureMusicBus();
    if (!bus) return;

    const entry = musicEntries.get(name);
    const buffer = musicBuffers.get(name);
    const same = music && music.name === name && !o.restart;

    if (same) {
      setMusicFilter({ lowpass: MUSIC_OPEN, gain: 1, rate: 1, fade });
      return;
    }

    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = Math.max(0, Math.min(entry.loopStart, buffer.duration - 0.05));
    source.loopEnd = trackEnd(entry, buffer);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = MUSIC_OPEN;
    lowpass.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);

    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(bus);

    const from = Math.max(0, Math.min(o.from || 0, source.loopStart));
    try {
      source.start(now, from);
    } catch (err) {
      return;
    }

    const prev = music;
    music = { name, source, lowpass, gain, entry, buffer };
    if (prev) releaseMusic(prev, now, fade);
  }

  function releaseMusic(m, now, fade) {
    const out = Math.max(0.05, fade * 0.6);
    rampParam(m.gain.gain, 0, now, out);
    setTimeout(() => {
      try {
        m.source.stop();
      } catch (err) {}
      try {
        m.source.disconnect();
        m.lowpass.disconnect();
        m.gain.disconnect();
      } catch (err) {}
    }, (out + 0.2) * 1000);
  }

  function stopMusic(opts) {
    if (!music || !ctx) return;
    const fade = Math.max(0.01, (opts && opts.fade) || 1.5);
    const m = music;
    music = null;
    releaseMusic(m, ctx.currentTime, fade);
  }

  function setMusicFilter(opts) {
    if (!music || !ctx) return;
    const o = opts || EMPTY_OPTS;
    const now = ctx.currentTime;
    const fade = Math.max(0.01, o.fade == null ? 0.4 : o.fade);
    if (Number.isFinite(o.gain)) rampParam(music.gain.gain, clamp(o.gain, 0, 1), now, fade);
    if (Number.isFinite(o.lowpass)) {
      rampParam(music.lowpass.frequency, clamp(o.lowpass, MUSIC_MIN_HZ, MUSIC_OPEN), now, fade);
    }
    if (Number.isFinite(o.rate)) rampParam(music.source.playbackRate, clamp(o.rate, 0.25, 4), now, fade);
  }

  const music = {
    load: loadMusic,
    prefetch(names) {
      const list = Array.isArray(names) ? names : [names];
      for (const n of list) if (n) loadMusic(n);
    },
    play: playMusic,
    stop: stopMusic,
    setFilter: setMusicFilter,
    get state() {
      return musicState();
    },
  };
```

- [ ] **Step 4: Flush music work once the context exists**

In `unlock()`, after the existing `try { if (ctx.state === 'suspended' ... }` block and before the closing brace of `unlock`, add:

```js
    for (const name of [...musicWanted]) {
      musicWanted.delete(name);
      loadMusic(name);
    }
    flushMusicPending();
```

- [ ] **Step 5: Expose `music` on the returned object**

In the `return { unlock, update, play, setMuted, ... }` block at the end of `createAudio`, add `music,` after `play,`:

```js
  return {
    unlock,
    update,
    play,
    music,
    setMuted,
    get muted() {
      return muted;
    },
  };
```

- [ ] **Step 6: Verify the module still parses and SFX are untouched**

Run: `node --check game/src/audio.js`
Expected: no output (success).

- [ ] **Step 7: Commit**

```powershell
git add game/src/audio.js
git commit -m "Add music director to audio.js: crossfade, loop, filter and tape-stop"
```

---

### Task 3: Wire the game states in main.js

**Files:**
- Modify: `game/src/main.js`
- Modify: `game/index.html` (one control hint)

**Interfaces:**
- Consumes: `audio.music.play/stop/setFilter` (Task 2).
- Produces: no new exports. New module-local helpers `onFirstGesture()` and `startTitleMusic()`.

- [ ] **Step 1: Add the gesture and title-music helpers**

In `game/src/main.js`, add immediately before `/* ---------------- input ---------------- */`:

```js
let gestureSeen = false;
let titleMusicStarted = false;

// Autoplay policy: the AudioContext can only be created/resumed from a user
// gesture, so the title theme starts on the first click or keypress and the
// combat track is decoded in the background while the roster is on screen.
function onFirstGesture() {
  gestureSeen = true;
  audio.unlock();
  startTitleMusic();
}

function startTitleMusic() {
  if (titleMusicStarted || state.phase !== "title") return;
  titleMusicStarted = true;
  audio.music.play("title", { fade: 1.2 });
  audio.music.prefetch("combat");
}
```

- [ ] **Step 2: Route the existing gesture handlers through it**

In the `keydown` listener, replace `audio.unlock();` with `onFirstGesture();`.

In the `canvas` `mousedown` listener, replace `audio.unlock();` with `onFirstGesture();`.

- [ ] **Step 3: Start the title theme when boot finishes after a gesture**

At the end of `boot()`, replace:

```js
  hud.hideLoading();
  state.phase = "title";
```

with:

```js
  hud.hideLoading();
  state.phase = "title";
  if (gestureSeen) startTitleMusic();
```

- [ ] **Step 4: Drive music from the run lifecycle**

In `startRun()`, after the existing `events.emit("sfx", { name: "start" });` line, add:

```js
  titleMusicStarted = true;
  audio.music.play("combat", { fade: 1.5, restart: true });
```

In `startWave()`, after `events.emit("sfx", { name: "wave" });`, add:

```js
  audio.music.setFilter({ lowpass: 20000, gain: 1, fade: 0.6 });
```

In `endWave()`, replace the `if (state.wave % CONFIG.combat.upgradeEvery === 0) { ... } else { ... }` body so the upgrade branch also ducks the music:

```js
  if (state.wave % CONFIG.combat.upgradeEvery === 0) {
    const cards = rollUpgrades(rng, 3);
    state.pendingUpgrades = cards;
    state.phase = "upgrade";
    hud.showUpgrades(cards);
    events.emit("sfx", { name: "upgrade" });
    audio.music.setFilter({ lowpass: 800, gain: 0.35, fade: 0.4 });
    document.exitPointerLock();
  } else {
    state.intermissionT = CONFIG.combat.intermission;
    audio.music.setFilter({ gain: 0.8, fade: 6 });
  }
```

In `pickUpgrade()`, after `hud.showToast(`${card.name} acquired`);`, add:

```js
  audio.music.setFilter({ lowpass: 20000, gain: 1, fade: 0.6 });
```

In `endRun()`, after `events.emit("run-ended", stats);`, add:

```js
  audio.music.setFilter({ rate: 0.55, lowpass: 400, gain: 0.25, fade: 1.2 });
```

- [ ] **Step 5: Add the `M` mute key**

In the `keydown` listener, after the existing `if (k === "escape" && input.locked) document.exitPointerLock();` line, add:

```js
  if (k === "m") {
    audio.setMuted(!audio.muted);
    hud.showToast(audio.muted ? "Sound muted" : "Sound on");
  }
```

- [ ] **Step 6: Document the key on the title screen**

In `game/index.html`, in the `.controls-line.title-controls` paragraph, add after the `Esc` span:

```html
            <span><b class="px-keycap">M</b> mute</span>
```

- [ ] **Step 7: Verify the module parses**

Run: `node --check game/src/main.js`
Expected: no output (success).

- [ ] **Step 8: Commit**

```powershell
git add game/src/main.js game/index.html
git commit -m "Wire music to run states and add M mute"
```

---

### Task 4: Music integrity test

**Files:**
- Create: `game/tests/music.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `game/audio/gen/music.json` (Task 1).
- Produces: `npm run test:music`, and `npm test` includes it.

- [ ] **Step 1: Write the test**

Create `game/tests/music.test.mjs` with exactly this content:

```js
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
```

- [ ] **Step 2: Run the test**

Run: `node game/tests/music.test.mjs`
Expected: all tests `ok`, ending with `N passed` and exit code 0.

- [ ] **Step 3: Wire it into package.json**

In `package.json`, add `"music": "node game/audio/build-music.mjs"` before the `"test"` entry, add `"test:music": "node game/tests/music.test.mjs"` after `"test:ui"`, and extend `test` to include it:

```json
    "music": "node game/audio/build-music.mjs",
    "ui": "node game/ui/build-ui.mjs",
    "test": "node game/tests/balance.test.mjs && node game/tests/controls.test.mjs && node game/tests/ui.test.mjs && node game/tests/music.test.mjs",
    "test:controls": "node game/tests/controls.test.mjs",
    "test:ui": "node game/tests/ui.test.mjs",
    "test:music": "node game/tests/music.test.mjs"
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: balance, controls, ui and music all pass; no failures.

- [ ] **Step 5: Commit**

```powershell
git add game/tests/music.test.mjs package.json
git commit -m "Add music asset integrity test"
```

---

### Task 5: Documentation

**Files:**
- Modify: `game/src/CONTRACT.md`
- Modify: `CREDITS.md`
- Modify: `docs/superpowers/specs/2026-09-13-music-integration-design.md`

**Interfaces:**
- Consumes: the finished API from Tasks 2-4.
- Produces: nothing executable.

- [ ] **Step 1: Document the music API in CONTRACT.md**

In `game/src/CONTRACT.md`, immediately after the existing `### audio.js` block (which ends with the sound-name list), insert:

````markdown
### Music (inside audio.js)

`audio.music` is a state-driven music director layered on the same AudioContext as
the SFX. It is not a second module: `main.js` calls it, and it never imports
another game module.

```js
audio.music.load(name)                  // fetch + decode, deferred until unlock()
audio.music.prefetch(names)             // background decode
audio.music.play(name, { fade, restart, from })
audio.music.stop({ fade })
audio.music.setFilter({ gain, lowpass, rate, fade })
audio.music.state                       // { loaded, pending, current, gain, lowpass, rate }
```

Tracks are `"title"` and `"combat"`. Signal path per track:
`source -> lowpass -> trackGain -> musicBus -> master`, so `setMuted` silences
music and SFX together.

Two invariants:

1. **Loop points come from the manifest, never `buffer.duration`.** Chrome decodes
   Vorbis through ffmpeg, which can pad the decoded tail (ffmpeg ticket 6367);
   looping to `buffer.duration` would play that padding at every wrap.
2. **Music failure is silent.** Any fetch, decode or WebAudio error leaves the
   game running with SFX only. Never surface a music error to the player.

### Music pipeline

Sources are one-shots, so `game/audio/build-music.mjs` bakes a crossfade loop
into each track (`body + crossfade(tail -> pre)`) and normalizes to
−16 LUFS / −1.5 dBTP, then encodes Vorbis.

- `game/audio/src/` — committed sources
- `game/audio/gen/` — build output; **the only directory the game reads**
- `node game/audio/build-music.mjs` — regenerate `gen/` (also `npm run music`)

Loop points are the `TRACKS` constants at the top of the build script. Re-run
`npm run music && npm run test:music` after retuning any of them.
````

- [ ] **Step 2: Record the music in CREDITS.md**

Append to `CREDITS.md`:

```markdown
## Music

Two tracks — "Dungeon Adventure Title Theme" and "dungeon op 1" — are
AI-generated audio supplied by the project owner, and are integrated as the
title and combat themes. Loudness-normalized and loop-baked by
`game/audio/build-music.mjs`.
```

- [ ] **Step 3: Correct the spec's event line**

In `docs/superpowers/specs/2026-09-13-music-integration-design.md`, replace the
`upgrade-offer` sentence with:

```markdown
Music calls live directly in `main.js` (no new event is needed: the director is
driven by explicit calls, exactly like `hud.showTitle()`).
```

- [ ] **Step 4: Commit**

```powershell
git add game/src/CONTRACT.md CREDITS.md docs/superpowers
git commit -m "Document the music director, pipeline and credits"
```

---

### Task 6: Runtime verification in the browser

**Files:**
- No source changes. Verification only.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified running game.

- [ ] **Step 1: Start the server**

Run: `npm run view` (background). Expected: serving on `http://localhost:4173`.

- [ ] **Step 2: Load the game and confirm the title theme starts on gesture**

Navigate to `http://localhost:4173/game/`. Click the page once, then evaluate:

```js
() => ({ phase: window.__game.state.phase, music: window.__game.hud ? undefined : undefined, audio: window.__game.audio })
```

The game does not currently expose `audio` on `window.__game`. Add it: in
`game/src/main.js`, in the `window.__game` object, add

```js
  get audio() {
    return audio;
  },
```

then re-run and evaluate:

```js
() => window.__game.audio.music.state
```

Expected: `{ loaded: >= 1, pending: null, current: "title", gain: ~1, lowpass: 20000, rate: 1 }`.

- [ ] **Step 3: Confirm combat decodes and the transition fires**

Evaluate:

```js
async () => {
  const before = window.__game.audio.music.state;
  window.__game.startRun("knight");
  await new Promise((r) => setTimeout(r, 2500));
  return { before, after: window.__game.audio.music.state };
}
```

Expected: `after.current === "combat"`, `after.loaded === 2`, `after.gain` ramping
toward 1, `after.rate === 1`.

- [ ] **Step 4: Confirm the upgrade duck and restore**

Evaluate:

```js
async () => {
  window.__game.pickUpgrade(window.__game.state.pendingUpgrades[0]?.id ?? "none");
  const a = window.__game.audio.music.state;
  return { lowpass: a.lowpass, gain: a.gain };
}
```

Expected: after a duck has been applied, `lowpass` ≈ 20000 and `gain` ≈ 1 once
restored (this step exercises the restore path).

- [ ] **Step 5: Confirm the death tape-stop**

Evaluate:

```js
async () => {
  window.__game.player.damage(99999);
  await new Promise((r) => setTimeout(r, 2200));
  const s = window.__game.audio.music.state;
  return { phase: window.__game.state.phase, rate: s.rate, lowpass: s.lowpass, gain: s.gain };
}
```

Expected: `phase === "dead"`, `rate` ≈ 0.55, `lowpass` ≈ 400, `gain` ≈ 0.25.

- [ ] **Step 6: Confirm no console errors and the loop is seamless**

Collect console messages for the session. Expected: no errors from `audio.js`.

Loop seam check (numerical): decode `game/audio/gen/combat.ogg` and confirm the
last 50 ms and the first 50 ms at `loopStart` have comparable RMS and no
discontinuity:

```powershell
ffmpeg -hide_banner -i game\audio\gen\combat.ogg -ss 171.95 -t 0.05 -af astats=metadata=1 -f null - 2>&1 | Select-String "RMS level"
ffmpeg -hide_banner -i game\audio\gen\combat.ogg -ss 10 -t 0.05 -af astats=metadata=1 -f null - 2>&1 | Select-String "RMS level"
```

Expected: the two RMS levels are within ~6 dB of each other — the crossfade
landed on material of similar energy, so the wrap is not a jump.

- [ ] **Step 7: Commit the debug hook**

```powershell
git add game/src/main.js
git commit -m "Expose audio on window.__game for runtime QA"
```

---

## Self-Review

**Spec coverage:** loop bake (Task 1), loudness −16 LUFS / −1.5 dBTP (Task 1),
manifest with hashes (Task 1), music director API (Task 2), padding guard via
manifest duration (Task 2), silent failure (Task 2), state map — title, descend,
upgrade duck/restore, wave dip/restore, death tape-stop, retry restart (Task 3),
`M` mute (Task 3), integrity test (Task 4), docs and credits (Task 5), runtime
verification including the seam check (Task 6). No gaps.

**Placeholders:** none.

**Type consistency:** `loopStart`/`loopEnd`/`duration`/`fade`/`hash`/`file` are
written in Task 1 and read with the same names in Tasks 2 and 4.
`setFilter` takes `{ gain, lowpass, rate, fade }` in Task 2 and is called with
those keys in Task 3. `play(name, { fade, restart })` matches both the definition
and the call sites.
