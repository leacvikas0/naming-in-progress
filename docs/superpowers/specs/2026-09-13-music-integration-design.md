# Music integration — Dungeon of the Lost Bones

Date: 2026-09-13
Status: approved, implementing

## Goal

Add two AI-generated music tracks to the game as a scored, state-driven system:

| Track | Source file | Plays on |
|---|---|---|
| Title theme | `Dungeon Adventure Title Theme (3).mp3` | character select |
| Combat theme | `dungeon op 1 .mp3` | during a run |

The tracks become a *music director*, not two files on shuffle: they crossfade on
run start, duck and filter behind the upgrade screen, tape-stop on death, and
loop seamlessly for as long as a run lasts.

## Measured source properties

Both 44.1 kHz stereo MP3, 192 kbps.

| | Title | Combat |
|---|---|---|
| Duration | 177.68 s | 180.56 s |
| Integrated loudness | −11.6 LUFS | −13.0 LUFS |
| True peak | −0.1 dBFS | **+0.2 dBFS (clipping)** |
| Tempo (est.) | ~120 BPM | ~140 BPM |
| Head | fade-in from silence over ~1 s | starts at ~−25 dB, no silence |
| Tail | fades from ~166 s, silent by 176 s | full energy to ~172 s, fade to silence by 180 s |

Neither track loops natively — both are one-shots with written endings. The
combat track clips on the source and must be attenuated.

### Structure

**Title** — intro phrase 0–8 s ending in a near-silent break at 7.5 s (−49.8 dB,
the quietest point in the file), body 8–166 s, wind-down from ~166 s.

**Combat** — build 0–60 s (−19.5 → −14.6 dB), main 60–120 s (−12.5 → −11.6 dB),
breakdown 120–155 s (−16.0 → −17.5 dB), a dramatic near-silent pause at
155.1–156.1 s (−32 → −40 dB), climax 156.6–172 s (−11.7 dB, the loudest
section), outro fade 172–180.6 s.

## 1. Offline pipeline — `game/audio/`

Mirrors the `game/ui/` pattern: committed sources, a deterministic build script,
generated output in `gen/` as the only directory the game reads.

```
game/audio/
  src/title.mp3          committed source
  src/combat.mp3         committed source
  build-music.mjs        trim → loop-bake → loudnorm → Vorbis
  gen/title.ogg          the only files the game loads
  gen/combat.ogg
  gen/music.json         manifest: duration, loopStart, content hash
```

`npm run music` runs the build.

### Loop bake

The core operation. Given a chosen loop window `[L, E]` and crossfade length `F`:

```
A      = source[E-F, E]              # tail of the loop window
B      = source[L-F, L]              # F seconds immediately before the loop restart
baked  = source[0, E-F] + crossfade(A → B)
```

The baked buffer is `E` seconds long. `B` ends exactly at source time `L`, and the
runtime restarts at buffer position `L` — so the sample after the crossfade is the
sample the loop restarts on. **Seamless by construction**: no click, no repeated
bar, no split files. Equal-power (`qsin`) crossfade.

Chosen points (constants in `build-music.mjs`, trivially re-tunable):

| Track | Intro (played once) | Loop window | Crossfade |
|---|---|---|---|
| title | 0 → 16.0 s | 16.0 → 166.0 s (150 s) | 6.0 s |
| combat | 0 → 10.0 s | 10.0 → 172.0 s (162 s) | 8.0 s |

Title: `L = 16` puts the restart inside the body (10–16 s and 160–166 s are both
~−19 dB body material), so the blend is body-to-body. The 7.5 s break stays in the
intro.

Combat: `E = 172` cuts exactly where the outro begins, so the climax is retained
in every loop iteration. `F = 8` spreads the ~7 dB climax→opening drop over a
gradual transition.

### Loudness

Two-pass `loudnorm` to **−16 LUFS integrated, −1.5 dBTP**. Title gets −4.4 dB,
combat −3 dB. Both stay in linear mode (peak after gain is below target), so
dynamics are preserved and the combat clipping is fixed. The two tracks end up at
matched loudness.

Output: Ogg Vorbis, `libvorbis -q:a 5` (~160 kbps). ~3.3 MB per track.

## 2. Runtime — music director in `audio.js`

Additive to the existing module. All sound effects keep working unchanged.

### Loading

`fetch("/game/audio/gen/music.json", { cache: "no-store" })`, then
`decodeAudioData` per track. The manifest carries a content hash per file, which
is appended to the Ogg URL — same cache-busting problem the UI chrome solved with
`asset-urls.css`, solved here with `no-store` on the manifest.

Combat is decoded lazily during the title screen so it is ready before the run.

**Failure is silent**: if fetch, decode, or WebAudio is unavailable, music does
not play and the game runs exactly as it does today. No error surface.

### Graph

```
source → lowpass → trackGain → musicBus → master → destination
```

One chain per playing track so two tracks can crossfade independently.
`musicBus` sits under the existing `master`, so `setMuted` silences music and SFX
together.

### Loop playback

`source.loop = true`, `source.loopStart = L`, `source.loopEnd = duration`.
The baked crossfade makes that wrap seamless; the browser handles it
sample-accurately from the decoded PCM.

### API

```js
music.play(name, { fade = 1.5, from = 0 })  // crossfade to "title" | "combat"
music.stop({ fade = 1.5 })                  // fade out and release
music.setFilter({ lowpass, gain, rate, fade })  // smooth param moves
music.update(dt)                            // drive scheduled ramps
music.state                                 // debug snapshot
```

`play()` called while the AudioContext is still suspended is stored as pending and
flushed by `unlock()`, because autoplay policy requires a user gesture.

### State map

| Game moment | Call |
|---|---|
| First click / keypress on title screen | `play("title")` (pending until gesture) |
| Descend | `play("combat", { fade: 1.5 })` |
| Upgrade screen opens | `setFilter({ lowpass: 800, gain: 0.35, fade: 0.4 })` |
| Upgrade picked | `setFilter({ lowpass: 20000, gain: 1, fade: 0.6 })` |
| Wave cleared (non-upgrade wave) | `setFilter({ gain: 0.8, fade: 6 })` |
| Next wave starts | `setFilter({ gain: 1, fade: 0.6 })` |
| Death | `setFilter({ rate: 0.55, lowpass: 400, gain: 0.25, fade: 1.2 })` |
| Retry | `play("combat", { fade: 0.4 })`, filter reset |

### The structural win

The combat track's own three-minute arc is build → main → breakdown → climax. A
run ramps the same way. Starting the track at run start means a player who
survives deep hears the climax at the moment the run is at its most intense — the
music's shape and the run's shape agree without any dynamic-mixing system.

## 3. Wiring in `main.js`

`main.js` is the only wiring point (per CONTRACT.md), so all music calls live
there:

- `boot()`: kick off music loading.
- First gesture: `play("title")`.
- `startRun()`: `play("combat", { fade: 1.5 })`.
- `endWave()`: upgrade branch → focus filter; otherwise gentle dip.
- `startWave()`: restore gain.
- `pickUpgrade()`: restore filter.
- `endRun()`: tape-stop filter.
- `keydown`: `M` toggles `setMuted` and shows a toast.

Music calls live directly in `main.js` (no new event is needed: the director is
driven by explicit calls, exactly like `hud.showTitle()`).

## 4. Verification

`game/tests/music.test.mjs` — zero dependencies, same style as `ui.test.mjs`:

- `music.json` exists and parses.
- Every referenced Ogg exists, starts with `OggS`, and its size is plausible.
- `duration` and `loopStart` are finite, positive, and `0 < loopStart < duration`.
- The manifest's content hash matches the file on disk — a stale manifest fails.
- Loop points sit inside the track (title `loopStart < 166`, combat `< 172`).

Playwright runtime QA: buffers decoded, source states, gain/lowpass/playbackRate
at each transition, no console errors. The loop seam is verified numerically (no
click, no level jump) — the musical blend is judged by ear.

## 5. Files touched

| File | Change |
|---|---|
| `game/audio/src/*.mp3` | new — committed sources |
| `game/audio/build-music.mjs` | new — pipeline |
| `game/audio/gen/*` | new — generated Ogg + manifest |
| `game/src/audio.js` | add music director (additive) |
| `game/src/main.js` | music calls + `M` mute + `upgrade-offer` emit |
| `game/tests/music.test.mjs` | new |
| `package.json` | `music` script, test wiring |
| `game/src/CONTRACT.md` | document music API + pipeline |
| `CREDITS.md` | record the music |

## 6. Decisions

1. **Sources are committed** (8 MB) so the pipeline is reproducible — `library/` is
   gitignored, but that is for 163 MB of meshes, not 8 MB of music.
2. **`M` mutes.** `setMuted` already exists and nothing called it; a game without a
   mute key is a bug.
3. **CREDITS records the music as AI-generated**, supplied by the project owner.
4. **Ogg Vorbis** over MP3: smaller, and gapless by construction once baked.
   Supported by Chromium and Firefox. Safari only gained `.ogg` Vorbis support in
   18.4 and its `decodeAudioData` behaviour for Vorbis is unreliable before that,
   so on older Safari the music silently does not play (the designed failure
   mode). Acceptable for a locally-served project; noted rather than papered over.

5. **`loopEnd` comes from the manifest, not `buffer.duration`.** Chrome decodes
   Vorbis through ffmpeg, which can pad the tail of the decoded buffer
   (ffmpeg ticket 6367). Looping to `buffer.duration` would play that padding at
   every wrap. The manifest's `duration` is the exact intended length, so the loop
   wraps at the true musical boundary and the padding is never reached. If a
   decoder instead comes up short, the source simply stops producing at the buffer
   end and the next wrap re-anchors — the crossfade still covers the seam.
