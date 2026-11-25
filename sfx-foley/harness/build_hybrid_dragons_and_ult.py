#!/usr/bin/env python3
"""
sfx-foley/harness/build_hybrid_dragons_and_ult.py

Builds true Hollywood-grade Hybrid Dragon Ignitions & Knight [Q]/[X] Twin-Element Awakening
by fusing three 100% non-synth, non-buzzer organic layers:
  1. MiniMax H3 V2A Elemental Turbulence Beds (`knight_h3_lab` + `detonation_*`)
  2. Real Organic Predator/Monster Vocal Roars (`werewolf__attack_roar`, `werewolf__windup_snarl`,
     `boss_orc_brute_slam` roar) pitch/formant-sculpted & flame/water-modulated into mythic dragons
  3. Argon's Warm Forged-Steel Swings, Glacier Crystal Fractures & Refractory Pine-Charcoal Snaps
     (`sfx-foley/sword-lab/sfx_bank/`) — ZERO `jittered_glottal_velvet` buzzers!

Writes directly to:
  - `sfx-foley/sword-lab/sfx_bank/` & `sfx-foley/sword-lab/audio/`
  - `sfx-foley/knight-h3-lab/slices/slices/` & `_game_mux.mp4`
  - `world/assets/audio/sword-lab/`
"""

from __future__ import annotations

import math
import shutil
import subprocess
from pathlib import Path

import numpy as np
from scipy import signal
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SR = 48000

SWORD_BANK = ROOT / "sfx-foley" / "sword-lab" / "sfx_bank"
SWORD_AUDIO = ROOT / "sfx-foley" / "sword-lab" / "audio"
SWORD_VIDEOS = ROOT / "sfx-foley" / "sword-lab" / "videos"
SRC_VIDEOS = ROOT / "sfx-foley" / "videos"
KNIGHT_H3_SLICES = ROOT / "sfx-foley" / "knight-h3-lab" / "slices" / "slices"
KNIGHT_H3_STEMS = ROOT / "sfx-foley" / "knight-h3-lab" / "stems" / "stems"
LEGACY_SLICES = ROOT / "sfx-foley" / "slices" / "slices"
VOICES_DIR = ROOT / "sfx-foley" / "voices-sliced"


def load_stereo_48k(path: Path) -> np.ndarray:
    wav_p = path.with_suffix(".wav")
    src = wav_p if wav_p.exists() else path
    data, sr = sf.read(str(src), dtype="float64")
    if data.ndim == 1:
        data = np.stack([data, data], axis=1)
    if sr != SR:
        g = math.gcd(SR, sr)
        data = signal.resample_poly(data, SR // g, sr // g, axis=0)
    return data


def pitch_shift_stereo(audio: np.ndarray, pitch_ratio: float) -> np.ndarray:
    """Resamples stereo audio by `pitch_ratio` (<1.0 = deeper/larger creature, >1.0 = higher/faster)."""
    n_in = len(audio)
    n_out = max(16, int(round(n_in / max(pitch_ratio, 0.25))))
    x_old = np.linspace(0.0, 1.0, n_in)
    x_new = np.linspace(0.0, 1.0, n_out)
    out = np.empty((n_out, 2), dtype=np.float64)
    for ch in (0, 1):
        out[:, ch] = np.interp(x_new, x_old, audio[:, ch])
    return out


def butter_band(audio: np.ndarray, hpf_hz: float = 42.0, lpf_hz: float = 8800.0) -> np.ndarray:
    nyq = 0.5 * SR
    y = audio.copy()
    if hpf_hz > 20.0:
        sos_hp = signal.butter(2, min(hpf_hz / nyq, 0.9), btype="highpass", output="sos")
        y = signal.sosfilt(sos_hp, y, axis=0)
    if lpf_hz < nyq * 0.95:
        sos_lp = signal.butter(3, min(lpf_hz / nyq, 0.95), btype="lowpass", output="sos")
        y = signal.sosfilt(sos_lp, y, axis=0)
    return y


def biquad_peak(audio: np.ndarray, fc: float, q: float, gain_db: float) -> np.ndarray:
    w0 = 2.0 * math.pi * fc / SR
    A = 10.0 ** (gain_db / 40.0)
    alpha = math.sin(w0) / (2.0 * q)
    cosw = math.cos(w0)
    b0 = 1.0 + alpha * A
    b1 = -2.0 * cosw
    b2 = 1.0 - alpha * A
    a0 = 1.0 + alpha / A
    a1 = -2.0 * cosw
    a2 = 1.0 - alpha / A
    b = np.array([b0 / a0, b1 / a0, b2 / a0], dtype=np.float64)
    a = np.array([1.0, a1 / a0, a2 / a0], dtype=np.float64)
    return signal.lfilter(b, a, audio, axis=0)


def warm_cinema_master(audio: np.ndarray, hpf_hz: float = 45.0, lpf_hz: float = 8800.0, target_rms_db: float = -16.0) -> np.ndarray:
    y = audio - np.mean(audio, axis=0, keepdims=True)
    y = butter_band(y, hpf_hz=hpf_hz, lpf_hz=lpf_hz)
    # Warm 165 Hz chest body + 375 Hz vocal anti-masking pocket + 3.4 kHz smooth silk dip
    y = biquad_peak(y, 165.0, 1.15, 3.0)
    y = biquad_peak(y, 375.0, 2.0, -5.8)
    y = biquad_peak(y, 3400.0, 1.2, -2.4)

    mono = 0.5 * (y[:, 0] + y[:, 1])
    pk = float(np.max(np.abs(y))) + 1e-9
    active = mono[np.abs(mono) > pk * 0.05]
    rms = float(np.sqrt(np.mean(active * active))) if len(active) > 64 else float(np.sqrt(np.mean(mono * mono))) + 1e-9
    target_rms = 10.0 ** (target_rms_db / 20.0)
    y = y * (target_rms / max(rms, 1e-7))
    max_pk = 10.0 ** (-1.1 / 20.0)
    new_pk = float(np.max(np.abs(y)))
    if new_pk > max_pk:
        y = np.tanh(y / max_pk) * max_pk
    return y


def smooth_env(n: int, attack_s: float = 0.012, release_s: float = 0.14) -> np.ndarray:
    env = np.ones(n, dtype=np.float64)
    na = min(n // 3, max(4, int(attack_s * SR)))
    nr = min(n // 2, max(8, int(release_s * SR)))
    env[:na] = np.sin(np.linspace(0.0, 0.5 * math.pi, na)) ** 2
    env[-nr:] = np.cos(np.linspace(0.0, 0.5 * math.pi, nr)) ** 2
    return env[:, None]


def place_layer(canvas: np.ndarray, clip: np.ndarray, onset_s: float, gain: float = 1.0, pan: float = 0.0) -> None:
    i0 = int(round(onset_s * SR))
    if i0 >= len(canvas):
        return
    if i0 < 0:
        clip = clip[-i0:]
        i0 = 0
    m = min(len(clip), len(canvas) - i0)
    if m <= 0:
        return
    seg = clip[:m].copy()
    if abs(pan) > 1e-3:
        mono = 0.5 * (seg[:, 0] + seg[:, 1])
        theta = (np.clip(pan, -1.0, 1.0) + 1.0) * (math.pi * 0.25)
        seg[:, 0] = mono * math.cos(theta)
        seg[:, 1] = mono * math.sin(theta)
    canvas[i0 : i0 + m] += seg * gain


def save_wav_and_mp3(audio: np.ndarray, wav_path: Path, mp3_path: Path, bitrate: str = "320k") -> None:
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    mp3_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(wav_path), np.clip(audio, -0.99, 0.99).astype(np.float32), SR, subtype="PCM_16")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-ar", str(SR), "-b:a", bitrate, str(mp3_path)],
        check=True,
    )


def mux_video(audio: np.ndarray, src_mp4: Path, dst_mp4: Path) -> None:
    if not src_mp4.exists():
        return
    dst_mp4.parent.mkdir(parents=True, exist_ok=True)
    tmp_wav = dst_mp4.with_suffix(".tmp.wav")
    sf.write(str(tmp_wav), np.clip(audio, -0.99, 0.99).astype(np.float32), SR, subtype="PCM_16")
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(src_mp4), "-i", str(tmp_wav),
            "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest",
            str(dst_mp4),
        ],
        check=True,
    )
    tmp_wav.unlink(missing_ok=True)


def main() -> None:
    # Load organic vocal & elemental building blocks
    snarl_raw = load_stereo_48k(VOICES_DIR / "werewolf__windup_snarl.wav")
    roar_raw = load_stereo_48k(VOICES_DIR / "werewolf__attack_roar.wav")
    brute_slam = load_stereo_48k(LEGACY_SLICES / "boss_orc_brute_slam.wav")
    brute_roar_seg = brute_slam[int(0.06 * SR) : int(0.96 * SR)] * smooth_env(int(0.90 * SR), 0.02, 0.16)

    h3_ice_wide = load_stereo_48k(KNIGHT_H3_SLICES / "knight_e_ice_dragon_wide.wav")
    h3_fire_wide = load_stereo_48k(KNIGHT_H3_SLICES / "knight_e_fire_dragon_wide.wav")
    h3_ult_close = load_stereo_48k(KNIGHT_H3_SLICES / "knight_q_twin_dragon_close.wav")

    sw_ice_c2 = load_stereo_48k(SWORD_BANK / "sword_ice_combo2_varA.wav")
    sw_ice_c4 = load_stereo_48k(SWORD_BANK / "sword_ice_combo4_heavy_varA.wav")
    sw_fire_c2 = load_stereo_48k(SWORD_BANK / "sword_fire_combo2_varA.wav")
    sw_fire_c4 = load_stereo_48k(SWORD_BANK / "sword_fire_combo4_heavy_varA.wav")
    sw_steel_c2 = load_stereo_48k(SWORD_BANK / "sword_steel_combo2_varA.wav")
    sw_steel_c3 = load_stereo_48k(SWORD_BANK / "sword_steel_combo3_varB.wav")

    det_ice = load_stereo_48k(LEGACY_SLICES / "detonation_shatterblow.wav")
    det_fire = load_stereo_48k(LEGACY_SLICES / "detonation_solar_flare.wav")

    # -----------------------------------------------------------------------
    # 1. Build `dragon_glacial_tide_ignite` (1.12s + varA/B/C)
    # -----------------------------------------------------------------------
    def build_ice_dragon(pitch: float = 1.0) -> np.ndarray:
        dur = 1.14
        n = int(dur * SR)
        mix = np.zeros((n, 2), dtype=np.float64)

        # Layer A: Forged Ice Blade Draw & Tidal Slash Cut (0.00s)
        place_layer(mix, pitch_shift_stereo(sw_ice_c2, pitch), 0.00, gain=0.88, pan=-0.18)
        place_layer(mix, pitch_shift_stereo(sw_ice_c4, pitch * 1.04), 0.16, gain=0.72, pan=0.16)

        # Layer B: Real Organic Glacial Dragon Roar (pitch-shifted snarl + sub-cavern throat)
        ice_roar_hi = pitch_shift_stereo(snarl_raw[: int(0.88 * SR)], 0.82 * pitch)
        ice_roar_hi = biquad_peak(butter_band(ice_roar_hi, 130.0, 5400.0), 1480.0, 1.8, 3.5)
        ice_roar_lo = pitch_shift_stereo(brute_roar_seg, 0.86 * pitch)
        ice_roar_lo = butter_band(ice_roar_lo, 55.0, 420.0)
        place_layer(mix, ice_roar_hi * smooth_env(len(ice_roar_hi), 0.025, 0.18), 0.045, gain=1.05, pan=0.06)
        place_layer(mix, ice_roar_lo * smooth_env(len(ice_roar_lo), 0.030, 0.20), 0.055, gain=0.82, pan=-0.06)

        # Layer C: H3 Crashing Ocean Wave & Glacier Shatter Tail
        h3_bed = pitch_shift_stereo(h3_ice_wide[: int(1.08 * SR)], pitch)
        place_layer(mix, h3_bed * smooth_env(len(h3_bed), 0.02, 0.20), 0.02, gain=0.68)
        ice_sh = pitch_shift_stereo(det_ice[: int(0.65 * SR)], 1.22 * pitch)
        place_layer(mix, ice_sh * smooth_env(len(ice_sh), 0.015, 0.18), 0.22, gain=0.46)

        mix *= smooth_env(n, 0.010, 0.16)
        return warm_cinema_master(mix, hpf_hz=52.0, lpf_hz=8800.0, target_rms_db=-16.0)

    # -----------------------------------------------------------------------
    # 2. Build `dragon_hinokami_sunfire_ignite` (1.12s + varA/B/C)
    # -----------------------------------------------------------------------
    def build_fire_dragon(pitch: float = 1.0) -> np.ndarray:
        dur = 1.14
        n = int(dur * SR)
        t = np.arange(n, dtype=np.float64) / SR
        mix = np.zeros((n, 2), dtype=np.float64)

        # Layer A: Oxygen-Intake Flash & Molten Sunfire Blade Cut (0.00s)
        place_layer(mix, pitch_shift_stereo(sw_fire_c2, pitch), 0.00, gain=0.85, pan=-0.18)
        place_layer(mix, pitch_shift_stereo(sw_fire_c4, pitch * 0.98), 0.14, gain=0.82, pan=0.18)

        # Layer B: Fierce Fire-Dragon Roar (flame-flutter modulated organic roar + deep furnace bellow)
        fire_roar = pitch_shift_stereo(roar_raw[: int(0.92 * SR)], 0.78 * pitch)
        t_r = np.arange(len(fire_roar), dtype=np.float64) / SR
        flame_flutter = (1.0 + 0.24 * np.sin(2.0 * math.pi * 21.0 * t_r))[:, None]
        fire_roar = biquad_peak(butter_band(fire_roar * flame_flutter, 95.0, 5200.0), 820.0, 1.5, 3.2)
        furnace_lo = pitch_shift_stereo(brute_roar_seg, 0.80 * pitch)
        furnace_lo = butter_band(furnace_lo, 52.0, 380.0)
        place_layer(mix, fire_roar * smooth_env(len(fire_roar), 0.020, 0.18), 0.04, gain=1.08, pan=-0.05)
        place_layer(mix, furnace_lo * smooth_env(len(furnace_lo), 0.025, 0.20), 0.05, gain=0.88, pan=0.08)

        # Layer C: H3 Solar Flame Jet & Magma Flare Burst
        h3_bed = pitch_shift_stereo(h3_fire_wide[: int(1.08 * SR)], pitch)
        place_layer(mix, h3_bed * smooth_env(len(h3_bed), 0.02, 0.20), 0.02, gain=0.68)
        flare_burst = pitch_shift_stereo(det_fire[: int(0.68 * SR)], 1.18 * pitch)
        place_layer(mix, flare_burst * smooth_env(len(flare_burst), 0.015, 0.18), 0.18, gain=0.48)

        mix *= smooth_env(n, 0.010, 0.16)
        return warm_cinema_master(mix, hpf_hz=48.0, lpf_hz=8700.0, target_rms_db=-15.8)

    # -----------------------------------------------------------------------
    # 3. Build `knight_q_twin_element_awakening` (1.56s, Exact 3-Beat Sync!)
    #    - 0.00-0.38s: Spin-Gather Vortex + Dual Ice (L) & Fire (R) Dragons Coiling
    #    - 0.38-0.70s: Beat 2A First X-Slash Diagonal Cleave
    #    - 0.70-1.56s: Beat 2B Second X-Slash + Twin-Dragon Cross-Bite Detonation!
    # -----------------------------------------------------------------------
    def build_knight_q_ult(pitch: float = 1.0) -> np.ndarray:
        dur = 1.56
        n = int(dur * SR)
        mix = np.zeros((n, 2), dtype=np.float64)

        # --- BEAT 1 (0.00 - 0.38s): Spin-Gather & Coiling Twin Dragons ---
        coil_ice = pitch_shift_stereo(snarl_raw[: int(0.42 * SR)], 0.94 * pitch)
        coil_fire = pitch_shift_stereo(roar_raw[: int(0.45 * SR)], 0.80 * pitch)
        place_layer(mix, coil_ice * smooth_env(len(coil_ice), 0.015, 0.08), 0.01, gain=0.82, pan=-0.55)
        place_layer(mix, coil_fire * smooth_env(len(coil_fire), 0.015, 0.08), 0.02, gain=0.85, pan=0.55)
        place_layer(mix, pitch_shift_stereo(sw_ice_c2[: int(0.38 * SR)], 1.08 * pitch), 0.02, gain=0.65, pan=-0.35)
        place_layer(mix, pitch_shift_stereo(sw_fire_c2[: int(0.38 * SR)], 1.02 * pitch), 0.05, gain=0.65, pan=0.35)

        # --- BEAT 2A (0.38 - 0.70s): First Devastating X-Slash Lunge Cleave ---
        place_layer(mix, pitch_shift_stereo(sw_steel_c2, 0.98 * pitch), 0.375, gain=0.95, pan=-0.30)
        place_layer(mix, pitch_shift_stereo(sw_fire_c2, 1.02 * pitch), 0.385, gain=0.88, pan=0.30)
        mid_snarl = pitch_shift_stereo(snarl_raw[int(0.08 * SR) : int(0.42 * SR)], 0.86 * pitch)
        place_layer(mix, mid_snarl * smooth_env(len(mid_snarl), 0.01, 0.08), 0.39, gain=0.72, pan=0.15)

        # --- BEAT 2B (0.70 - 1.56s): Second X-Slash + Twin-Dragon Cross-Bite Cataclysm ---
        place_layer(mix, pitch_shift_stereo(sw_steel_c3, 0.95 * pitch), 0.695, gain=0.98, pan=0.25)
        place_layer(mix, pitch_shift_stereo(sw_ice_c4, 0.96 * pitch), 0.700, gain=0.88, pan=-0.35)
        place_layer(mix, pitch_shift_stereo(sw_fire_c4, 0.96 * pitch), 0.705, gain=0.88, pan=0.35)

        # Intertwined Twin-Dragon Cross-Bite Roar Climax at 0.70s
        bite_roar_l = pitch_shift_stereo(roar_raw[: int(0.82 * SR)], 0.76 * pitch)
        bite_roar_r = pitch_shift_stereo(brute_roar_seg, 0.84 * pitch)
        place_layer(mix, bite_roar_l * smooth_env(len(bite_roar_l), 0.012, 0.22), 0.705, gain=1.05, pan=-0.28)
        place_layer(mix, bite_roar_r * smooth_env(len(bite_roar_r), 0.012, 0.22), 0.710, gain=1.02, pan=0.28)

        # Tier-1 Sub-Bass Shockwave & Glacier/Magma Shatter Detonation at 0.71s
        shatter_tail = det_ice[: int(0.84 * SR)] * smooth_env(int(0.84 * SR), 0.008, 0.24)
        flare_tail = det_fire[: int(0.84 * SR)] * smooth_env(int(0.84 * SR), 0.008, 0.24)
        place_layer(mix, shatter_tail, 0.708, gain=0.72, pan=-0.20)
        place_layer(mix, flare_tail, 0.712, gain=0.72, pan=0.20)

        # Subtle H3 continuous turbulent air glue underneath
        h3_glue = h3_ult_close[: min(len(h3_ult_close), n)]
        place_layer(mix, h3_glue * smooth_env(len(h3_glue), 0.02, 0.22), 0.00, gain=0.45)

        mix *= smooth_env(n, 0.010, 0.16)
        return warm_cinema_master(mix, hpf_hz=38.0, lpf_hz=8900.0, target_rms_db=-15.2)

    # Render and save all variations
    ice_main = build_ice_dragon(1.0)
    fire_main = build_fire_dragon(1.0)
    ult_main = build_knight_q_ult(1.0)
    ult_close = build_knight_q_ult(1.03)

    for tag, p in [("", 1.0), ("_varA", 0.97), ("_varB", 1.00), ("_varC", 1.035)]:
        ic = ice_main if p == 1.0 else build_ice_dragon(p)
        fi = fire_main if p == 1.0 else build_fire_dragon(p)
        save_wav_and_mp3(ic, SWORD_BANK / f"dragon_glacial_tide_ignite{tag}.wav", SWORD_BANK / f"dragon_glacial_tide_ignite{tag}.mp3")
        save_wav_and_mp3(ic, SWORD_AUDIO / f"dragon_glacial_tide_ignite{tag}.tmp.wav", SWORD_AUDIO / f"dragon_glacial_tide_ignite{tag}.mp3", bitrate="256k")
        (SWORD_AUDIO / f"dragon_glacial_tide_ignite{tag}.tmp.wav").unlink(missing_ok=True)

        save_wav_and_mp3(fi, SWORD_BANK / f"dragon_hinokami_sunfire_ignite{tag}.wav", SWORD_BANK / f"dragon_hinokami_sunfire_ignite{tag}.mp3")
        save_wav_and_mp3(fi, SWORD_AUDIO / f"dragon_hinokami_sunfire_ignite{tag}.tmp.wav", SWORD_AUDIO / f"dragon_hinokami_sunfire_ignite{tag}.mp3", bitrate="256k")
        (SWORD_AUDIO / f"dragon_hinokami_sunfire_ignite{tag}.tmp.wav").unlink(missing_ok=True)

    save_wav_and_mp3(ult_main, SWORD_BANK / "knight_q_twin_element_awakening.wav", SWORD_BANK / "knight_q_twin_element_awakening.mp3")
    save_wav_and_mp3(ult_main, SWORD_AUDIO / "knight_q_twin_element_awakening.tmp.wav", SWORD_AUDIO / "knight_q_twin_element_awakening.mp3", bitrate="256k")
    (SWORD_AUDIO / "knight_q_twin_element_awakening.tmp.wav").unlink(missing_ok=True)

    # Also update `knight-h3-lab/slices/slices/` with our hybrid mastered dragon & ult slices
    save_wav_and_mp3(ice_main, KNIGHT_H3_SLICES / "knight_e_ice_dragon_wide.wav", KNIGHT_H3_SLICES / "knight_e_ice_dragon_wide.mp3")
    save_wav_and_mp3(build_ice_dragon(1.03), KNIGHT_H3_SLICES / "knight_e_ice_dragon_close.wav", KNIGHT_H3_SLICES / "knight_e_ice_dragon_close.mp3")
    save_wav_and_mp3(fire_main, KNIGHT_H3_SLICES / "knight_e_fire_dragon_wide.wav", KNIGHT_H3_SLICES / "knight_e_fire_dragon_wide.mp3")
    save_wav_and_mp3(build_fire_dragon(1.03), KNIGHT_H3_SLICES / "knight_e_fire_dragon_close.wav", KNIGHT_H3_SLICES / "knight_e_fire_dragon_close.mp3")
    save_wav_and_mp3(ult_main, KNIGHT_H3_SLICES / "knight_q_twin_dragon_wide.wav", KNIGHT_H3_SLICES / "knight_q_twin_dragon_wide.mp3")
    save_wav_and_mp3(ult_close, KNIGHT_H3_SLICES / "knight_q_twin_dragon_close.wav", KNIGHT_H3_SLICES / "knight_q_twin_dragon_close.mp3")

    # Rebuild `strip_dragons_and_knight_ult.mp3` & muxed videos (`knight_h3_01..03_game_mux.mp4`, `04`, `05`)
    sh_raise = load_stereo_48k(SWORD_BANK / "knight_shield_raise.wav")
    sh_block = load_stereo_48k(SWORD_BANK / "knight_shield_block_clang.wav")
    sh_parry = load_stereo_48k(SWORD_BANK / "knight_shield_parry_ring.wav")
    sh_bash = load_stereo_48k(SWORD_BANK / "knight_shield_bash.wav")
    p_dodge = load_stereo_48k(SWORD_BANK / "perfect_dodge_time_dilation.wav")

    strip = np.zeros((int(8.55 * SR), 2), dtype=np.float64)
    place_layer(strip, ice_main, 0.08)
    place_layer(strip, fire_main, 1.38)
    place_layer(strip, ult_main, 2.70)
    place_layer(strip, sh_raise, 4.50)
    place_layer(strip, sh_block, 4.88)
    place_layer(strip, sh_parry, 5.45)
    place_layer(strip, sh_bash, 6.12)
    place_layer(strip, p_dodge, 7.22)
    save_wav_and_mp3(strip, SWORD_AUDIO / "strip_dragons_and_knight_ult.tmp.wav", SWORD_AUDIO / "strip_dragons_and_knight_ult.mp3", bitrate="256k")
    (SWORD_AUDIO / "strip_dragons_and_knight_ult.tmp.wav").unlink(missing_ok=True)

    # Mux `knight_h3_01..03_game_mux.mp4`
    for cid, w_clip, c_clip in [
        ("knight_h3_01_ice_dragon_sword", ice_main, build_ice_dragon(1.03)),
        ("knight_h3_02_fire_dragon_sword", fire_main, build_fire_dragon(1.03)),
        ("knight_h3_03_twin_dragon_ult", ult_main, ult_close),
    ]:
        stem = np.zeros((int(5.167 * SR), 2), dtype=np.float64)
        place_layer(stem, w_clip, 6 / 24.0)
        place_layer(stem, c_clip, 66 / 24.0)
        save_wav_and_mp3(stem, KNIGHT_H3_STEMS / f"{cid}.wav", KNIGHT_H3_STEMS / f"{cid}.mp3")
        mux_video(stem, SRC_VIDEOS / f"{cid}.mp4", KNIGHT_H3_STEMS / f"{cid}_game_mux.mp4")

    # Mux `05_ult_and_shield_argon_mux.mp4`
    mix_v05 = np.zeros((int(5.875 * SR), 2), dtype=np.float64)
    place_layer(mix_v05, ult_main, 6 / 24.0)
    place_layer(mix_v05, sh_raise, 56 / 24.0)
    place_layer(mix_v05, sh_block, 63 / 24.0)
    place_layer(mix_v05, sh_parry, 72 / 24.0)
    place_layer(mix_v05, sh_bash, 100 / 24.0)
    mux_video(mix_v05, SRC_VIDEOS / "05_knight_twin_element_ult_and_shield.mp4", SWORD_VIDEOS / "05_ult_and_shield_argon_mux.mp4")

    print("[HYBRID DRAGONS & ULT READY] Updated sword-lab & knight-h3-lab cleanly!")


if __name__ == "__main__":
    main()
