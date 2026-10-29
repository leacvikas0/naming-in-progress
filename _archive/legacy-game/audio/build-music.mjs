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
