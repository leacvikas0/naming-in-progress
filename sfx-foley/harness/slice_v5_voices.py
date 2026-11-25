"""
Deterministic Silence-Boundary Slicer for Approved Warm Cinema v5 Character & Enemy Voices
(`sfx-foley/harness/slice_v5_voices.py`).

Uses ONLY existing approved `v5_*.wav` files already on disk in `sfx-foley/tts-test/`.
NEVER calls TTS APIs or generates new voices.
Applies envelope/silence detection, zero-crossing padding, -1.2 dBFS peak headroom,
and single-pass `320k @ 48kHz` MP3 + uncompressed WAV export into `sfx-foley/voices-sliced/`.
"""

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path("C:/Users/silen/projects/kilo-3d-kit")
TTS_DIR = ROOT / "sfx-foley" / "tts-test"
OUT_DIR = ROOT / "sfx-foley" / "voices-sliced"

FFMPEG_BIN = (
    "C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe"
    if Path("C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe").exists()
    else "ffmpeg"
)

VOICE_SOURCES = [
    ("knight_enzo", TTS_DIR / "v5_hero_knight_enzo.wav", 0.015, 0.18, 0.18),
    ("knight_enzo_pray", TTS_DIR / "v5_hero_knight_enzo_pray.wav", 0.012, 0.24, 0.10),
    ("mage_lumi", TTS_DIR / "v5_hero_mage_lumi.wav", 0.015, 0.18, 0.18),
    ("mage_lumi_pray", TTS_DIR / "v5_hero_mage_lumi_pray.wav", 0.012, 0.24, 0.10),
    ("orc_raider", TTS_DIR / "v5_enemy_goblin.wav", 0.014, 0.18, 0.15),
    ("plant_warrior", TTS_DIR / "v5_enemy_plant_sprite.wav", 0.014, 0.18, 0.15),
    ("skeleton_warrior", TTS_DIR / "v5_enemy_skeleton.wav", 0.014, 0.20, 0.15),
    ("skeleton_minion", TTS_DIR / "v5_enemy_skeleton_minion.wav", 0.014, 0.18, 0.15),
    ("werewolf", TTS_DIR / "v5_enemy_werewolf.wav", 0.015, 0.22, 0.16),
    ("black_knight", TTS_DIR / "v5_enemy_black_knight.wav", 0.015, 0.20, 0.16),
    ("necromancer", TTS_DIR / "v5_enemy_necromancer.wav", 0.014, 0.22, 0.15),
    ("boss_brute", TTS_DIR / "v5_enemy_boss_brute.wav", 0.015, 0.24, 0.20),
    ("boss_frost_golem", TTS_DIR / "v5_enemy_boss_frost_golem.wav", 0.015, 0.24, 0.20),
]

# Explicit semantic role mapping per detected utterance index
ROLE_MAP = {
    "knight_enzo": ["atk_1", "atk_2", "finisher_1", "dodge_1", "dodge_2", "atk_3", "atk_4", "hurt_1"],
    "knight_enzo_pray": ["pray_1", "pray_2", "pray_3", "pray_4"],
    "mage_lumi": ["cast_1", "cast_2", "finisher_1", "cast_3", "dodge_1", "dodge_2", "dodge_3", "hurt_1"],
    "mage_lumi_pray": ["pray_1", "pray_2", "pray_3", "pray_4"],
    "orc_raider": ["appear", "idle_cackle", "attack", "hurt"],
    "plant_warrior": ["appear", "idle_hop", "attack", "hurt"],
    "skeleton_warrior": ["appear", "attack", "hurt"],
    "skeleton_minion": ["appear", "idle_giggle", "attack", "hurt"],
    "werewolf": ["appear", "windup_snarl", "attack_roar", "hurt", "yelp"],
    "black_knight": ["appear", "block_brace", "attack", "hurt"],
    "necromancer": ["appear", "channel_hum", "attack_cast", "hurt", "hiss"],
    "boss_brute": ["appear", "stomp_huff", "attack_heavy", "attack_finisher", "roar_phase", "hurt"],
    "boss_frost_golem": ["appear", "stomp_huff", "attack_heavy", "attack_finisher", "roar_phase", "hurt"],
}


def detect_utterances(wav_path: Path, thresh: float = 0.012, merge_gap_s: float = 0.38, min_peak: float = 0.15, min_dur_s: float = 0.14):
    x, sr = sf.read(str(wav_path))
    x = x.astype(np.float64)
    if x.ndim > 1:
        x = np.mean(x, axis=1)

    win = max(1, int(0.020 * sr))
    env = np.sqrt(np.convolve(x * x, np.ones(win) / win, mode="same") + 1e-12)
    active = env > thresh

    gap_n = int(merge_gap_s * sr)
    segs = []
    in_seg = False
    start = 0
    last_true = 0
    for i, a in enumerate(active):
        if a:
            if not in_seg:
                in_seg = True
                start = i
            last_true = i
        elif in_seg and (i - last_true) > gap_n:
            segs.append((start, last_true))
            in_seg = False
    if in_seg:
        segs.append((start, last_true))

    out = []
    for s, e in segs:
        s_pad = max(0, s - int(0.025 * sr))
        e_pad = min(len(x), e + int(0.055 * sr))
        dur = (e_pad - s_pad) / sr
        pk = float(np.max(np.abs(x[s_pad:e_pad])))
        if dur >= min_dur_s and pk >= min_peak:
            out.append({
                "s": s_pad,
                "e": e_pad,
                "startSec": round(s_pad / sr, 3),
                "endSec": round(e_pad / sr, 3),
                "durSec": round(dur, 3),
                "peak": round(pk, 3),
            })
    return x, sr, out


def analyze():
    summary = {}
    for key, p, th, gap, mpk in VOICE_SOURCES:
        if not p.exists():
            print(f"[MISSING] {p}")
            continue
        _, sr, segs = detect_utterances(p, thresh=th, merge_gap_s=gap, min_peak=mpk)
        summary[key] = segs
        print(f"=== {key} ({p.name}, segs={len(segs)}) ===")
        for idx, sg in enumerate(segs):
            print(f"  [{idx}] {sg['startSec']:.3f}s .. {sg['endSec']:.3f}s (dur={sg['durSec']:.3f}s, peak={sg['peak']:.3f})")
    return summary


def export_slices():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for key, p, th, gap, mpk in VOICE_SOURCES:
        if not p.exists():
            continue
        x, sr, segs = detect_utterances(p, thresh=th, merge_gap_s=gap, min_peak=mpk)
        roles = ROLE_MAP[key]
        while len(segs) > len(roles):
            gaps = [segs[i + 1]["s"] - segs[i]["e"] for i in range(len(segs) - 1)]
            mi = int(np.argmin(gaps))
            merged = {
                "s": segs[mi]["s"],
                "e": segs[mi + 1]["e"],
                "startSec": segs[mi]["startSec"],
                "endSec": segs[mi + 1]["endSec"],
                "durSec": round((segs[mi + 1]["e"] - segs[mi]["s"]) / sr, 3),
                "peak": max(segs[mi]["peak"], segs[mi + 1]["peak"]),
            }
            segs = segs[:mi] + [merged] + segs[mi + 2 :]

        key_entries = []
        ceil_lin = 10.0 ** (-1.5 / 20.0)  # -1.5 dBFS headroom for voice shots
        for idx, sg in enumerate(segs):
            role_lbl = roles[idx] if idx < len(roles) else f"extra_{idx}"
            seg = x[sg["s"] : sg["e"]].copy()
            # Remove any DC offset & apply smooth click-free edge fades
            seg = seg - np.mean(seg)
            fi = min(int(0.008 * sr), len(seg) // 6)
            fo = min(int(0.025 * sr), len(seg) // 4)
            if fi > 1:
                seg[:fi] *= np.linspace(0.0, 1.0, fi)
            if fo > 1:
                seg[-fo:] *= np.linspace(1.0, 0.0, fo)
            pk = float(np.max(np.abs(seg))) + 1e-9
            if pk > 0.01:
                seg = seg * (ceil_lin / pk)

            stem = f"{key}__{role_lbl}"
            wav_out = OUT_DIR / f"{stem}.wav"
            mp3_out = OUT_DIR / f"{stem}.mp3"
            sf.write(str(wav_out), seg.astype(np.float32), sr, subtype="PCM_16")
            subprocess.run(
                [FFMPEG_BIN, "-y", "-loglevel", "error", "-i", str(wav_out), "-c:a", "libmp3lame", "-b:a", "320k", str(mp3_out)],
                check=True,
            )
            key_entries.append({
                "role": role_lbl,
                "file": mp3_out.name,
                "durationSec": round(len(seg) / sr, 3),
            })
        manifest[key] = key_entries
        print(f"[SLICED] {key}: {len(key_entries)} shots -> {[e['role'] for e in key_entries]}")

    (OUT_DIR / "voice_slices_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\n[DONE] Saved manifest & {sum(len(v) for v in manifest.values())} voice slices in {OUT_DIR}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--analyze", action="store_true")
    ap.add_argument("--slice", action="store_true")
    args = ap.parse_args()
    if args.analyze or not args.slice:
        analyze()
    if args.slice:
        export_slices()
