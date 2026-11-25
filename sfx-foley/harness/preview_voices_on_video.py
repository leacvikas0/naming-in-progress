#!/usr/bin/env python3
"""
sfx-foley/harness/preview_voices_on_video.py (v5 Warm Cinema Video Sync)

Rebuilds all 4 gameplay video previews straight from uncompressed 48 kHz `v5_*.wav`
stems (ZERO STFT rubberband artifacts, ZERO 155 Hz radio HPF, ZERO MP3 double-transcode),
encoded in a single 320 kbps AAC pass for crystal-clear cinema-grade game preview.
"""

import math
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
import soundfile as sf

SR = 48000
ROOT = Path("C:/Users/silen/projects/kilo-3d-kit")
TTS_DIR = ROOT / "sfx-foley" / "tts-test"
SWORD_VID_DIR = ROOT / "sfx-foley" / "sword-lab" / "videos"
SRC_VID_DIR = ROOT / "sfx-foley" / "videos"


def load_48k_wav(path: Path) -> np.ndarray:
    if path.suffix.lower() == ".wav":
        x, s = sf.read(str(path))
        x = x.astype(np.float64)
        if x.ndim > 1:
            x = np.mean(x, axis=1)
        if s != SR:
            g = math.gcd(SR, s)
            return signal.resample_poly(x, SR // g, s // g)
        return x
    with tempfile.TemporaryDirectory() as td:
        w = Path(td) / "a.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-ar", str(SR), "-ac", "1", str(w)], check=True)
        x, _ = sf.read(str(w))
        return x.astype(np.float64)


def peaking_eq(sig: np.ndarray, f0: float, q: float, gain_db: float) -> np.ndarray:
    a = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * f0 / SR
    alpha = math.sin(w0) / (2.0 * q)
    b0 = 1.0 + alpha * a
    b1 = -2.0 * math.cos(w0)
    b2 = 1.0 - alpha * a
    a0 = 1.0 + alpha / a
    a1 = -2.0 * math.cos(w0)
    a2 = 1.0 - alpha / a
    return signal.lfilter([b0 / a0, b1 / a0, b2 / a0], [1.0, a1 / a0, a2 / a0], sig)


def warm_courtyard_slice(x: np.ndarray, t0: float, t1: float) -> np.ndarray:
    """Slice cleanly at micro fades without radio HPF; preserve chest warmth + 2% open sunlit air."""
    i0 = max(0, int(t0 * SR))
    i1 = min(len(x), int(t1 * SR))
    seg = x[i0:i1].copy()
    if len(seg) < 64:
        return seg
    # Ultra-subtle outdoor sunlit air reflection (no metallic helm taps)
    ir = np.zeros(int(0.055 * SR))
    ir[0] = 1.0
    ir[int(0.011 * SR)] = 0.045
    ir[int(0.024 * SR)] = 0.025
    y = signal.fftconvolve(seg, ir, mode="full")[: len(seg)]
    fade = min(int(0.016 * SR), len(y) // 4)
    if fade > 1:
        y[:fade] *= np.linspace(0.0, 1.0, fade)
        y[-fade:] *= np.linspace(1.0, 0.0, fade)
    return y / max(float(np.max(np.abs(y))), 1e-6)


def mux(video_in: Path, audio_mono: np.ndarray, out_mp4: Path, gain: float = 0.88) -> None:
    y = np.clip(audio_mono * gain, -0.96, 0.96).astype(np.float32)
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "mix.wav"
        sf.write(str(wav), y, SR, subtype="PCM_16")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(video_in), "-i", str(wav), "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-shortest", str(out_mp4)],
            check=True,
        )


def build_knight_preview() -> None:
    # Start from Argon's synced sword track, gently de-crisped (+1.8dB @ 185Hz warm wind, -2.5dB @ 4.8kHz, 8.8kHz rolloff)
    sword_raw = load_48k_wav(SWORD_VID_DIR / "03_pure_steel_argon_mux.mp4")
    sword_warm = peaking_eq(sword_raw, 185.0, 0.85, 1.8)
    sword_warm = peaking_eq(sword_warm, 4800.0, 0.9, -2.6)
    sword_warm = signal.sosfiltfilt(signal.butter(2, 8800.0, btype="lowpass", fs=SR, output="sos"), sword_warm)

    enzo = load_48k_wav(TTS_DIR / "v5_hero_knight_enzo.wav")
    b1 = warm_courtyard_slice(enzo, 0.25, 0.44)   # "Hah!"
    b2 = warm_courtyard_slice(enzo, 1.04, 1.42)   # "Toyah!"
    b3 = warm_courtyard_slice(enzo, 2.05, 2.55)   # "Seyah!"
    b4 = warm_courtyard_slice(enzo, 3.94, 4.24)   # "Whoa-hup!" finisher burst
    d1 = warm_courtyard_slice(enzo, 4.64, 4.83)   # Dodge "Hup!"
    d2 = warm_courtyard_slice(enzo, 5.29, 5.45)   # Dodge "Uh!"

    mix = sword_warm.copy() * 0.82
    for clip, t_on, amp in [(b1, 0.28, 0.48), (b2, 1.50, 0.50), (b3, 2.76, 0.54), (b4, 4.02, 0.54), (d1, 5.33, 0.44), (d2, 6.50, 0.42)]:
        i0 = int(t_on * SR)
        m = min(len(clip), len(mix) - i0)
        if m > 0:
            mix[i0 : i0 + m] += clip[:m] * amp

    out_mp4 = TTS_DIR / "preview_03_knight_14yo_voice_and_sword.mp4"
    mux(SRC_VID_DIR / "03_knight_pure_sword_and_dodge.mp4", mix, out_mp4)
    print(f"[VIDEO OK] {out_mp4.name}", flush=True)


def build_mage_preview() -> None:
    lumi = load_48k_wav(TTS_DIR / "v5_hero_mage_lumi.wav")
    # 06_mage_shatterlance_charge_and_starfall_ult.mp4 duration = 5.875s
    c1 = warm_courtyard_slice(lumi, 0.72, 0.96)   # "Pay!"
    c2 = warm_courtyard_slice(lumi, 2.04, 2.26)   # "Yah!" lance fire
    c3 = warm_courtyard_slice(lumi, 3.22, 4.54)   # "Haaa... yah!!" Starfall meteor surge
    c4 = warm_courtyard_slice(lumi, 6.04, 6.20)   # little evade hop

    mix = np.zeros(int(5.875 * SR), dtype=np.float64)
    for clip, t_on, amp in [(c1, 0.30, 0.50), (c2, 1.18, 0.62), (c3, 2.75, 0.68), (c4, 4.45, 0.46)]:
        i0 = int(t_on * SR)
        m = min(len(clip), len(mix) - i0)
        if m > 0:
            mix[i0 : i0 + m] += clip[:m] * amp

    out_mp4 = TTS_DIR / "preview_06_mage_14yo_lumi_voice.mp4"
    mux(SRC_VID_DIR / "06_mage_shatterlance_charge_and_starfall_ult.mp4", mix, out_mp4)
    print(f"[VIDEO OK] {out_mp4.name}", flush=True)


def build_enemy_previews() -> None:
    umb = load_48k_wav(TTS_DIR / "v5_enemy_necromancer.wav")
    plt = load_48k_wav(TTS_DIR / "v5_enemy_plant_sprite.wav")
    mix10 = np.zeros(int(5.875 * SR), dtype=np.float64)
    p10 = [
        (warm_courtyard_slice(umb, 0.50, 1.85), 0.25, 0.58),   # Skeleton Mage wicked chuckle
        (warm_courtyard_slice(umb, 4.10, 4.45), 1.15, 0.54),   # Skeleton Mage cast "Zah!"
        (warm_courtyard_slice(umb, 2.46, 3.72), 2.15, 0.64),   # Necromancer cursed drone
        (warm_courtyard_slice(plt, 0.66, 0.94), 4.12, 0.56),   # PlantWarrior woodland "Hoo?!"
        (warm_courtyard_slice(plt, 1.76, 2.40), 4.62, 0.64),   # PlantWarrior "Pip-pip yah!"
        (warm_courtyard_slice(plt, 3.78, 3.96), 5.15, 0.56),   # PlantWarrior puff "Too!"
    ]
    for clip, t_on, amp in p10:
        i0 = int(t_on * SR)
        m = min(len(clip), len(mix10) - i0)
        if m > 0:
            mix10[i0 : i0 + m] += clip[:m] * amp
    out10 = TTS_DIR / "preview_10_casters_sylvan_voices.mp4"
    mux(SRC_VID_DIR / "10_enemies_casters_and_sylvan.mp4", mix10, out10)
    print(f"[VIDEO OK] {out10.name}", flush=True)

    gob = load_48k_wav(TTS_DIR / "v5_enemy_goblin.wav")
    wlf = load_48k_wav(TTS_DIR / "v5_enemy_werewolf.wav")
    blk = load_48k_wav(TTS_DIR / "v5_enemy_black_knight.wav")
    mix11 = np.zeros(int(5.875 * SR), dtype=np.float64)
    p11 = [
        (warm_courtyard_slice(gob, 0.76, 0.98), 0.22, 0.56),   # Goblin "Geh!"
        (warm_courtyard_slice(gob, 2.24, 2.78), 0.68, 0.62),   # Goblin giggles + shriek
        (warm_courtyard_slice(gob, 3.76, 4.02), 1.15, 0.62),   # Goblin lunge "Kyah-bwah!"
        (warm_courtyard_slice(wlf, 0.22, 0.60), 2.06, 0.56),   # Werewolf breath snarl
        (warm_courtyard_slice(wlf, 1.48, 3.22), 2.45, 0.68),   # Werewolf deep beast roar
        (warm_courtyard_slice(blk, 0.20, 0.42), 4.05, 0.58),   # BlackKnight armored "Hmph!"
        (warm_courtyard_slice(blk, 2.52, 3.16), 4.55, 0.68),   # BlackKnight visor bellow "HRRGH!"
    ]
    for clip, t_on, amp in p11:
        i0 = int(t_on * SR)
        m = min(len(clip), len(mix11) - i0)
        if m > 0:
            mix11[i0 : i0 + m] += clip[:m] * amp
    out11 = TTS_DIR / "preview_11_goblin_wolf_blackknight.mp4"
    mux(SRC_VID_DIR / "11_enemies_berserkers_and_elites.mp4", mix11, out11)
    print(f"[VIDEO OK] {out11.name}", flush=True)


if __name__ == "__main__":
    build_knight_preview()
    build_mage_preview()
    build_enemy_previews()
