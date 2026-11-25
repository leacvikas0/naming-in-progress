#!/usr/bin/env python3
"""
sfx-foley/harness/build_nature_sacred_sfx.py

Replaces all Tibetan singing bowl drones and metallic/harp rings across sacred
prayer, stone inspection, divine verdicts, and perfect dodge with Option 1
("Pure Breath & Nature" — sunlit Ghibli valley aesthetic):

  1. `world/assets/audio/sfx/ambience/amb_commune_celestial.mp3` (~10.0s loop, -21 LUFS)
  2. `world/assets/audio/sfx/sacred/commune_start.mp3`            (~0.85s, soft)
  3. `world/assets/audio/sfx/sacred/stone_inspect.mp3`            (~0.70s, soft)
  4. `world/assets/audio/sfx/sacred/heal_verdict.mp3`             (~1.25s, warm & uplifting)
  5. `world/assets/audio/sfx/sacred/miracle_verdict.mp3`          (~2.00s, cinematic & awe-inspiring)
  6. `world/assets/audio/sfx/shield/perfect_dodge_time_dilation.mp3` (~0.65s, crisp & tactile)

Uses ONLY organic non-ringing recordings from `sfx-foley/raw-elements/`,
learned public-domain designs via `earshot`, and gentle low-Q sculpted air
filtering. Zero Tibetan bowls, zero sine/modal bells, zero harp plucks, zero
metallic partials.

Run with the earshot Python 3.12 environment:
  C:/Users/silen/.gemini/config/skills/earshot/.venv/Scripts/python.exe sfx-foley/harness/build_nature_sacred_sfx.py
"""

from __future__ import annotations

import math
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from build_code_sfx_bank import (
    GAME_SFX_DIR,
    SR,
    export_mp3_and_wav,
    extract_doppler_slice,
    extract_slice,
    master_and_normalize,
    mix_layer,
    smoothstep,
    static_biquad,
    zdf_svf_tv,
)
from sfx_bank_builder import colored_noise, db_to_lin
from earshot import api as earshot_api
from earshot.make import make as earshot_make


TARGET_PATHS: List[Path] = [
    GAME_SFX_DIR / "ambience" / "amb_commune_celestial.mp3",
    GAME_SFX_DIR / "sacred" / "commune_start.mp3",
    GAME_SFX_DIR / "sacred" / "stone_inspect.mp3",
    GAME_SFX_DIR / "sacred" / "heal_verdict.mp3",
    GAME_SFX_DIR / "sacred" / "miracle_verdict.mp3",
    GAME_SFX_DIR / "shield" / "perfect_dodge_time_dilation.mp3",
]


# ---------------------------------------------------------------------------
# Pure-Nature Organic Layer Builders
# ---------------------------------------------------------------------------

def render_earshot_layer(
    recipe: dict,
    dur_s: float,
    fade_in_s: float = 0.015,
    fade_out_s: float = 0.080,
    hpf_hz: float | None = 90.0,
    lpf_hz: float | None = 3600.0,
    pan_offset: float = 0.0,
    reverse: bool = False,
) -> np.ndarray:
    """Render an earshot learned organic design to 48 kHz stereo with smooth edges and filtering."""
    with tempfile.TemporaryDirectory() as tmpdir:
        out_wav = Path(tmpdir) / "layer.wav"
        earshot_make(recipe=recipe, out=str(out_wav))
        data, _ = sf.read(str(out_wav), always_2d=True)
    data = data.astype(np.float64)
    if data.shape[1] == 1:
        data = np.column_stack([data[:, 0], data[:, 0]])
    else:
        data = data[:, :2]

    n_target = max(32, int(round(dur_s * SR)))
    if len(data) < n_target:
        pad = np.zeros((n_target - len(data), 2), dtype=np.float64)
        data = np.vstack([data, pad])
    else:
        data = data[:n_target].copy()

    if reverse:
        data = data[::-1].copy()

    for ch in (0, 1):
        if hpf_hz is not None and hpf_hz > 20.0:
            data[:, ch] = static_biquad(data[:, ch], "highpass", hpf_hz, 0.707)
        if lpf_hz is not None and lpf_hz < SR * 0.46:
            data[:, ch] = static_biquad(data[:, ch], "lowpass", lpf_hz, 0.707)

    t = np.arange(n_target, dtype=np.float64) / SR
    env = np.ones(n_target, dtype=np.float64)
    if fade_in_s > 0.0005:
        env *= smoothstep(0.0, fade_in_s, t)
    if fade_out_s > 0.0005:
        env *= 1.0 - smoothstep(max(0.0, dur_s - fade_out_s), dur_s, t)
    data *= env[:, None]

    if abs(pan_offset) > 0.01:
        mono = 0.5 * (data[:, 0] + data[:, 1])
        side = 0.5 * (data[:, 0] - data[:, 1])
        p = float(np.clip(pan_offset, -0.9, 0.9))
        gl = math.cos((p + 1.0) * math.pi * 0.25) * 1.414
        gr = math.sin((p + 1.0) * math.pi * 0.25) * 1.414
        data[:, 0] = mono * gl + side * 0.55
        data[:, 1] = mono * gr - side * 0.55

    pk = float(np.max(np.abs(data)))
    if pk > 1e-6:
        data /= pk
    return data


def apply_tv_lowpass_stereo(
    stereo: np.ndarray,
    fc_arr: np.ndarray,
    q: float = 0.78,
) -> np.ndarray:
    """Zero-delay-feedback time-varying lowpass sweep on stereo audio (low-Q, zero ring)."""
    n = len(stereo)
    fc = fc_arr[:n] if len(fc_arr) >= n else np.pad(fc_arr, (0, n - len(fc_arr)), mode="edge")
    out = np.empty_like(stereo)
    q_arr = np.full(n, float(q), dtype=np.float64)
    for ch in (0, 1):
        out[:, ch] = zdf_svf_tv(stereo[:, ch], fc, q_arr, mode="low")
    return out


def apply_stereo_pan_curve(stereo: np.ndarray, pan_arr: np.ndarray) -> np.ndarray:
    """Smoothly move a stereo texture across the stereo field without losing width."""
    n = len(stereo)
    p = pan_arr[:n] if len(pan_arr) >= n else np.pad(pan_arr, (0, n - len(pan_arr)), mode="edge")
    mono = 0.5 * (stereo[:, 0] + stereo[:, 1])
    side = 0.5 * (stereo[:, 0] - stereo[:, 1])
    theta = (np.clip(p, -0.92, 0.92) + 1.0) * (math.pi * 0.25)
    out = np.empty_like(stereo)
    out[:, 0] = mono * np.cos(theta) * 1.35 + side * 0.50
    out[:, 1] = mono * np.sin(theta) * 1.35 - side * 0.50
    return out


def sculpted_breath_air(
    dur_s: float,
    alpha: float = 1.25,
    hpf_hz: float = 55.0,
    lpf_hz_or_arr: float | np.ndarray = 650.0,
    q: float = 0.75,
    fade_in_s: float = 0.04,
    fade_out_s: float = 0.15,
    seed: int = 101,
) -> np.ndarray:
    """Decorrelated stereo organic air/breath layer sculpted purely via low-Q filtering."""
    n = max(64, int(round(dur_s * SR)))
    rng_l = np.random.default_rng(seed)
    rng_r = np.random.default_rng(seed + 997)
    out = np.column_stack([colored_noise(n, alpha, rng_l), colored_noise(n, alpha, rng_r)])
    for ch in (0, 1):
        if hpf_hz > 20.0:
            out[:, ch] = static_biquad(out[:, ch], "highpass", hpf_hz, 0.707)
        if isinstance(lpf_hz_or_arr, np.ndarray):
            fc = lpf_hz_or_arr[:n] if len(lpf_hz_or_arr) >= n else np.pad(lpf_hz_or_arr, (0, n - len(lpf_hz_or_arr)), mode="edge")
            out[:, ch] = zdf_svf_tv(out[:, ch], fc, np.full(n, q), mode="low")
        else:
            out[:, ch] = static_biquad(out[:, ch], "lowpass", float(lpf_hz_or_arr), q)
    t = np.arange(n, dtype=np.float64) / SR
    env = smoothstep(0.0, max(0.002, fade_in_s), t) * (1.0 - smoothstep(max(0.0, dur_s - fade_out_s), dur_s, t))
    out *= env[:, None]
    pk = float(np.max(np.abs(out)))
    if pk > 1e-6:
        out /= pk
    return out


def make_seamless_loop(stereo: np.ndarray, xfade_s: float = 1.8) -> np.ndarray:
    """Equal-power sin^2 / cos^2 crossfade wrap for seamless ambience looping."""
    xf = int(round(xfade_s * SR))
    if len(stereo) <= xf * 2:
        return stereo
    body = stereo[:-xf].copy()
    tail = stereo[-xf:].copy()
    u = np.linspace(0.0, 1.0, xf)[:, None]
    w_in = np.sin(u * math.pi * 0.5) ** 2
    w_out = np.cos(u * math.pi * 0.5) ** 2
    body[:xf] = body[:xf] * w_in + tail * w_out
    return body


def match_lufs_exact(stereo: np.ndarray, target_lufs: float, max_true_peak_db: float = -1.5) -> np.ndarray:
    """Level a stereo signal to exact BS.1770 LUFS using earshot's integrated meter."""
    stereo = stereo - np.mean(stereo, axis=0, keepdims=True)
    cur_lufs = float(earshot_api.measure(stereo.astype(np.float32), light=True).get("lufs", -24.0))
    gain = db_to_lin(target_lufs - cur_lufs)
    out = stereo * gain
    lim = db_to_lin(max_true_peak_db)
    pk = float(np.max(np.abs(out)))
    if pk > lim:
        out = np.tanh(out / lim) * lim
    return out


# ---------------------------------------------------------------------------
# 1. `amb_commune_celestial.mp3` (~10.0s seamless loop, -21.0 LUFS)
# ---------------------------------------------------------------------------

def build_amb_commune_celestial() -> np.ndarray:
    """
    Still Valley Hush (~10.0s seamless loop, -21.0 LUFS):
      - Replaces the awful double-layered Tibetan bowl drone.
      - Ultra-warm low-passed meadow breeze (< 680 Hz primary warmth, zero bird chirps)
      - Delicate airy silk hiss (4.8-8.2 kHz soft breath sheen, deeply recessed)
      - Very subtle distant brook murmur (`ambience_brook_stream_01.wav`, < 820 Hz)
      - Gentle slow meditative breath swell (2 calm breaths per 10s = 5.0s cycle)
      - Wide 1.1-4.2 kHz vocal clarity pocket so player mic & Sovereign voice shine!
    """
    loop_s = 10.0
    xfade_s = 1.8
    raw_s = loop_s + xfade_s
    n_raw = int(round(raw_s * SR))

    breeze_main = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=6.0,
        dur_s=raw_s,
        semitones=-1.5,
        fade_in_s=0.08,
        fade_out_s=0.08,
        hpf_hz=55.0,
        lpf_hz=660.0,
        pan_offset=-0.10,
    )
    breeze_warm = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=8.2,
        dur_s=raw_s,
        semitones=-4.0,
        fade_in_s=0.08,
        fade_out_s=0.08,
        hpf_hz=48.0,
        lpf_hz=450.0,
        pan_offset=0.10,
    )
    earshot_wind = render_earshot_layer(
        {"name": "still_wind", "says": "warm open meadow wind", "layers": [{"sound": "wind/open", "dur": raw_s, "pitch": -4, "lowpass": 580}]},
        dur_s=raw_s,
        fade_in_s=0.08,
        fade_out_s=0.08,
        hpf_hz=55.0,
        lpf_hz=580.0,
    )
    brook_murmur = extract_slice(
        "ambience_brook_stream_01.wav",
        start_s=2.0,
        dur_s=raw_s,
        semitones=-2.5,
        fade_in_s=0.08,
        fade_out_s=0.08,
        hpf_hz=150.0,
        lpf_hz=780.0,
        pan_offset=0.14,
    )
    silk_air = sculpted_breath_air(
        raw_s,
        alpha=0.85,
        hpf_hz=4600.0,
        lpf_hz_or_arr=8200.0,
        q=0.707,
        fade_in_s=0.08,
        fade_out_s=0.08,
        seed=2026,
    )
    warm_air_floor = sculpted_breath_air(
        raw_s,
        alpha=1.65,
        hpf_hz=52.0,
        lpf_hz_or_arr=480.0,
        q=0.707,
        fade_in_s=0.08,
        fade_out_s=0.08,
        seed=3033,
    )

    canvas = np.zeros((n_raw, 2), dtype=np.float64)
    mix_layer(canvas, breeze_main, 0.0, 0.90)
    mix_layer(canvas, breeze_warm, 0.0, 0.65)
    mix_layer(canvas, earshot_wind, 0.0, 0.28)
    mix_layer(canvas, warm_air_floor, 0.0, 0.36)
    mix_layer(canvas, brook_murmur, 0.0, 0.14)
    mix_layer(canvas, silk_air, 0.0, 0.055)

    # Apply vocal pocket EQ & breath modulation BEFORE seamless loop crossfade so
    # head and tail overlap smoothly with matching phase and zero boundary click!
    for ch in (0, 1):
        canvas[:, ch] = static_biquad(canvas[:, ch], "highpass", 48.0, 0.707)
        canvas[:, ch] = static_biquad(canvas[:, ch], "peaking", 2100.0, q=0.9, gain_db=-8.0)
        canvas[:, ch] = static_biquad(canvas[:, ch], "peaking", 360.0, q=1.2, gain_db=-2.5)
        canvas[:, ch] = static_biquad(canvas[:, ch], "lowpass", 8000.0, 0.707)

    t_raw = np.arange(n_raw, dtype=np.float64) / SR
    breath_swell = 1.0 - 0.22 * np.cos(2.0 * math.pi * (2.0 / loop_s) * t_raw)
    canvas *= breath_swell[:, None]

    looped = make_seamless_loop(canvas, xfade_s=xfade_s)
    return match_lufs_exact(looped, target_lufs=-21.0, max_true_peak_db=-6.0)


# ---------------------------------------------------------------------------
# 2. `commune_start.mp3` (~0.85s, soft rising rose-petal & warm wind intake)
# ---------------------------------------------------------------------------

def build_commune_start() -> np.ndarray:
    """
    Soft rising rose-petal & warm wind intake (0.85s):
      - Replaces the 4-note harp / bronze bowl chime when pressing [R]/[V].
      - Delicate organic air-pull + velvety petal/silk brush (zero stiff paper crackle).
      - Zero bells, zero harp notes, zero rings.
    """
    dur = 0.85
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    canvas = np.zeros((n, 2), dtype=np.float64)

    # 1. Soft rising warm wind intake (sweeps 260 Hz -> 1480 Hz -> 380 Hz, peaking at 0.45s)
    lift_curve = smoothstep(0.03, 0.46, t) * (1.0 - 0.76 * smoothstep(0.48, 0.84, t))
    wind_pull = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=6.8,
        dur_s=0.82,
        semitones=0.5,
        fade_in_s=0.10,
        fade_out_s=0.26,
        hpf_hz=95.0,
        lpf_hz=2800.0,
    )
    wind_pull = apply_tv_lowpass_stereo(wind_pull, 280.0 + 1150.0 * lift_curve, q=0.78)

    breath_in = render_earshot_layer(
        {"name": "commune_in", "says": "soft rising air breath intake", "layers": [{"sound": "whoosh/soft", "dur": 0.64, "pitch": -2, "lowpass": 1750}]},
        dur_s=0.64,
        fade_in_s=0.12,
        fade_out_s=0.22,
        hpf_hz=110.0,
        lpf_hz=1750.0,
        reverse=True,
    )

    # 2. Delicate velvety rose-petal & silk rustle (soft continuous brush, zero sharp snaps)
    petal_1 = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=0.32,
        dur_s=0.46,
        semitones=1.5,
        fade_in_s=0.09,
        fade_out_s=0.20,
        hpf_hz=380.0,
        lpf_hz=2300.0,
        pan_offset=-0.24,
    )
    petal_2 = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=5.18,
        dur_s=0.46,
        semitones=2.5,
        fade_in_s=0.09,
        fade_out_s=0.20,
        hpf_hz=420.0,
        lpf_hz=2400.0,
        pan_offset=0.24,
    )
    silk_glide = render_earshot_layer(
        {"name": "commune_silk", "says": "soft cloth petal glide", "layers": [{"sound": "swipe/glide", "cut": [0.06, 0.56], "pitch": 1.5, "lowpass": 2200}]},
        dur_s=0.50,
        fade_in_s=0.09,
        fade_out_s=0.22,
        hpf_hz=280.0,
        lpf_hz=2200.0,
    )
    silk_glide = apply_stereo_pan_curve(silk_glide, np.linspace(-0.28, 0.28, len(silk_glide)))

    # 3. Warm soft breath cushion blooming gently under the petal lift
    breath_cushion = sculpted_breath_air(
        0.78,
        alpha=1.40,
        hpf_hz=90.0,
        lpf_hz_or_arr=240.0 + 620.0 * lift_curve,
        q=0.72,
        fade_in_s=0.14,
        fade_out_s=0.28,
        seed=404,
    )

    mix_layer(canvas, wind_pull, 0.0, 0.88)
    mix_layer(canvas, breath_in, 0.04, 0.44)
    mix_layer(canvas, breath_cushion, 0.04, 0.52)
    mix_layer(canvas, silk_glide, 0.14, 0.46)
    mix_layer(canvas, petal_1, 0.14, 0.28)
    mix_layer(canvas, petal_2, 0.24, 0.24)

    env_master = smoothstep(0.0, 0.045, t) * (1.0 - smoothstep(0.56, 0.84, t))
    canvas *= env_master[:, None]

    out = master_and_normalize(
        canvas,
        hpf_hz=90.0,
        warm_body_hz=195.0,
        warm_body_db=1.8,
        box_scoop_db=-6.5,
        lpf_hz=2800.0,
        target_rms_db=-23.5,
        peak_limit_db=-5.5,
    )
    return match_lufs_exact(out, target_lufs=-20.5, max_true_peak_db=-5.5)


# ---------------------------------------------------------------------------
# 3. `stone_inspect.mp3` (~0.70s, dry weathered travertine touch + breeze settle)
# ---------------------------------------------------------------------------

def build_stone_inspect() -> np.ndarray:
    """
    Dry weathered travertine touch + hushed meadow breeze settle (0.70s):
      - Replaces the 3-note harp chime + bubbles + bronze bowl when pressing [G].
      - Gentle dry limestone/travertine grain rub (zero drum/explosion thump!)
        blending smoothly into a peaceful meadow breeze exhale.
    """
    dur = 0.70
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    canvas = np.zeros((n, 2), dtype=np.float64)

    # 1. Gentle dry weathered travertine palm rub + subtle limestone grain (0.00 - 0.24s)
    travertine_rub = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=0.32,
        dur_s=0.22,
        semitones=-4.0,
        fade_in_s=0.045,
        fade_out_s=0.10,
        hpf_hz=260.0,
        lpf_hz=1550.0,
        pan_offset=-0.06,
    )
    mineral_grit = extract_slice(
        "earth_gravel_shrapnel_01.wav",
        start_s=2.36,
        dur_s=0.22,
        semitones=-3.0,
        fade_in_s=0.045,
        fade_out_s=0.11,
        hpf_hz=320.0,
        lpf_hz=2100.0,
        pan_offset=0.06,
    )
    dry_pebble_touch = extract_slice(
        "earth_stone_fall_close_03.wav",
        start_s=3.80,
        dur_s=0.14,
        semitones=-2.5,
        fade_in_s=0.020,
        fade_out_s=0.070,
        hpf_hz=280.0,
        lpf_hz=1400.0,
    )

    # 2. Hushed meadow breeze settle (0.05 - 0.70s: calm sunlit breeze exhale, zero thump!)
    breeze_len = 0.65
    n_br = int(round(breeze_len * SR))
    t_br = np.arange(n_br, dtype=np.float64) / SR
    settle_curve = 1.0 - smoothstep(0.08, 0.58, t_br)
    meadow_settle = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=8.4,
        dur_s=breeze_len,
        semitones=-1.5,
        fade_in_s=0.10,
        fade_out_s=0.28,
        hpf_hz=120.0,
        lpf_hz=1650.0,
    )
    meadow_settle = apply_tv_lowpass_stereo(meadow_settle, 300.0 + 520.0 * settle_curve, q=0.72)

    air_cushion = sculpted_breath_air(
        0.62,
        alpha=1.40,
        hpf_hz=115.0,
        lpf_hz_or_arr=260.0 + 360.0 * settle_curve[: int(round(0.62 * SR))],
        q=0.707,
        fade_in_s=0.08,
        fade_out_s=0.28,
        seed=309,
    )

    mix_layer(canvas, travertine_rub, 0.0, 0.42)
    mix_layer(canvas, mineral_grit, 0.015, 0.34)
    mix_layer(canvas, dry_pebble_touch, 0.035, 0.22)
    mix_layer(canvas, meadow_settle, 0.04, 0.92)
    mix_layer(canvas, air_cushion, 0.06, 0.46)

    env_master = smoothstep(0.0, 0.032, t) * (1.0 - smoothstep(0.42, 0.69, t))
    canvas *= env_master[:, None]

    out = master_and_normalize(
        canvas,
        hpf_hz=110.0,
        warm_body_hz=195.0,
        warm_body_db=1.2,
        box_scoop_db=-7.2,
        lpf_hz=1950.0,
        target_rms_db=-23.5,
        peak_limit_db=-6.0,
    )
    return match_lufs_exact(out, target_lufs=-20.8, max_true_peak_db=-6.0)


# ---------------------------------------------------------------------------
# 4. `heal_verdict.mp3` (~1.25s, golden breeze wash + fluttering petal lift + sub-warmth)
# ---------------------------------------------------------------------------

def build_heal_verdict() -> np.ndarray:
    """
    Golden breeze wash + fluttering petal lift + gentle soft sub-warmth bloom (1.25s):
      - Replaces the 6-note harp cascade / bronze bowls on field heal.
      - Smooth rising golden sunlight breeze + silky petal lift + warm chest bloom.
      - Zero transient pops, zero bells, zero chimes.
    """
    dur = 1.25
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    canvas = np.zeros((n, 2), dtype=np.float64)

    # 1. Uplifting golden breeze wash (gentle rising swell peaking at 0.44s, trailing silkily)
    lift_arc = smoothstep(0.05, 0.44, t) * (1.0 - 0.72 * smoothstep(0.50, 1.22, t))
    breeze_l = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=6.4,
        dur_s=1.22,
        semitones=-0.5,
        fade_in_s=0.14,
        fade_out_s=0.44,
        hpf_hz=90.0,
        lpf_hz=2800.0,
        pan_offset=-0.26,
    )
    breeze_r = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=14.0,
        dur_s=1.20,
        semitones=1.0,
        fade_in_s=0.14,
        fade_out_s=0.44,
        hpf_hz=110.0,
        lpf_hz=3000.0,
        pan_offset=0.26,
    )
    fc_gold = 340.0 + 1850.0 * lift_arc
    breeze_l = apply_tv_lowpass_stereo(breeze_l, fc_gold, q=0.78)
    breeze_r = apply_tv_lowpass_stereo(breeze_r, fc_gold * 1.12, q=0.78)

    golden_swell = render_earshot_layer(
        {"name": "heal_swell", "says": "warm sunlit wind breeze swell", "layers": [{"sound": "whoosh/soft", "dur": 0.96, "pitch": 0.5, "lowpass": 2200}]},
        dur_s=0.96,
        fade_in_s=0.16,
        fade_out_s=0.38,
        hpf_hz=100.0,
        lpf_hz=2200.0,
    )

    # 2. Silky fluttering petal lift (velvety cloth glides + soft continuous leaf/petal rustle)
    silk_1 = render_earshot_layer(
        {"name": "heal_silk1", "says": "soft fluttering silk glide", "layers": [{"sound": "swipe/glide", "cut": [0.05, 0.65], "pitch": 1.5, "lowpass": 2600}]},
        dur_s=0.60,
        fade_in_s=0.10,
        fade_out_s=0.25,
        hpf_hz=260.0,
        lpf_hz=2600.0,
    )
    silk_1 = apply_stereo_pan_curve(silk_1, np.linspace(-0.36, 0.24, len(silk_1)))

    silk_2 = render_earshot_layer(
        {"name": "heal_silk2", "says": "warm lifting cloth flutter", "layers": [{"sound": "swipe/cloth", "cut": [0.06, 0.62], "pitch": 2.5, "lowpass": 2800}]},
        dur_s=0.56,
        fade_in_s=0.10,
        fade_out_s=0.24,
        hpf_hz=300.0,
        lpf_hz=2800.0,
    )
    silk_2 = apply_stereo_pan_curve(silk_2, np.linspace(0.36, -0.22, len(silk_2)))

    # Smooth continuous petal rustle segments only (avoid sharp pop transients!)
    petal_Specs = [
        (0.32, 0.44, 0.5, 0.10, -0.30, 0.24),
        (3.88, 0.44, 1.5, 0.24, 0.30, 0.24),
        (5.20, 0.44, 2.5, 0.38, -0.15, 0.22),
    ]
    for st_s, d_s, semi, onset, pan_v, g_v in petal_Specs:
        flut = extract_slice(
            "foley_parchment_stroke_01.wav",
            start_s=st_s,
            dur_s=d_s,
            semitones=semi,
            fade_in_s=0.085,
            fade_out_s=0.20,
            hpf_hz=340.0,
            lpf_hz=2600.0,
            pan_offset=pan_v,
        )
        mix_layer(canvas, flut, onset, g_v)

    # 3. Gentle soft sub-warmth bloom (slow comforted chest warmth, zero punch/thud)
    n_sub = int(round(1.10 * SR))
    t_sub = np.arange(n_sub, dtype=np.float64) / SR
    sub_arc = smoothstep(0.08, 0.42, t_sub) * (1.0 - smoothstep(0.50, 1.08, t_sub))
    sub_warmth = sculpted_breath_air(
        1.10,
        alpha=1.65,
        hpf_hz=60.0,
        lpf_hz_or_arr=150.0 + 165.0 * sub_arc,
        q=0.72,
        fade_in_s=0.18,
        fade_out_s=0.44,
        seed=505,
    )

    # 4. Sunlit airy shimmer tail (soft 3.4-6.8 kHz silk air breath glow)
    sun_shimmer = sculpted_breath_air(
        1.00,
        alpha=0.80,
        hpf_hz=3300.0,
        lpf_hz_or_arr=6800.0,
        q=0.707,
        fade_in_s=0.22,
        fade_out_s=0.50,
        seed=606,
    )

    mix_layer(canvas, breeze_l, 0.0, 0.88)
    mix_layer(canvas, breeze_r, 0.02, 0.84)
    mix_layer(canvas, golden_swell, 0.04, 0.44)
    mix_layer(canvas, silk_1, 0.12, 0.42)
    mix_layer(canvas, silk_2, 0.28, 0.36)
    mix_layer(canvas, sub_warmth, 0.04, 0.62)
    mix_layer(canvas, sun_shimmer, 0.22, 0.16)

    env_master = smoothstep(0.0, 0.045, t) * (1.0 - smoothstep(0.84, 1.24, t))
    canvas *= env_master[:, None]

    out = master_and_normalize(
        canvas,
        hpf_hz=60.0,
        warm_body_hz=175.0,
        warm_body_db=2.2,
        box_scoop_db=-6.5,
        lpf_hz=4200.0,
        target_rms_db=-20.5,
        peak_limit_db=-3.0,
    )
    return match_lufs_exact(out, target_lufs=-17.5, max_true_peak_db=-3.0)


# ---------------------------------------------------------------------------
# 5. `miracle_verdict.mp3` (~2.00s, grand valley wind crest + petal storm + sub-air swell)
# ---------------------------------------------------------------------------

def build_miracle_verdict() -> np.ndarray:
    """
    Deep valley wind crest + sweeping petal storm rush + warm resonant sub-air swell (2.00s):
      - Replaces the Tibetan bronze bell bowl on divine miracles & awakenings.
      - Slow, awe-inspiring sky-parting breath crest (no explosion/pop bursts!).
      - Wide stereo petal storm rush + warm sub-air swell + silky airy shimmer.
    """
    dur = 2.00
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    canvas = np.zeros((n, 2), dtype=np.float64)

    # 1. Warm resonant sub-air swell (slow sky-parting breath blooming smoothly to 0.62s)
    crest_arc = smoothstep(0.06, 0.62, t) * (1.0 - 0.78 * smoothstep(0.68, 1.96, t))
    deep_air = extract_slice(
        "air_whoosh_deep_04.wav",
        start_s=0.18,
        dur_s=1.65,
        semitones=-4.5,
        fade_in_s=0.24,
        fade_out_s=0.65,
        hpf_hz=40.0,
        lpf_hz=460.0,
    )
    whoosh_deep_es = render_earshot_layer(
        {"name": "miracle_sub", "says": "deep warm air swell", "layers": [{"sound": "whoosh/deep", "dur": 1.75, "pitch": -4, "lowpass": 420}]},
        dur_s=1.75,
        fade_in_s=0.26,
        fade_out_s=0.68,
        hpf_hz=42.0,
        lpf_hz=420.0,
    )
    sub_breath = sculpted_breath_air(
        1.85,
        alpha=1.75,
        hpf_hz=44.0,
        lpf_hz_or_arr=85.0 + 155.0 * crest_arc,
        q=0.82,
        fade_in_s=0.24,
        fade_out_s=0.72,
        seed=707,
    )

    # 2. Deep valley wind crest (majestic sunlit wind sweeping across the mountains)
    wind_open_es = render_earshot_layer(
        {"name": "miracle_open_wind", "says": "grand open valley wind crest", "layers": [{"sound": "wind/open", "dur": 1.88, "pitch": -2, "lowpass": 2400}]},
        dur_s=1.88,
        fade_in_s=0.24,
        fade_out_s=0.68,
        hpf_hz=72.0,
        lpf_hz=2400.0,
    )
    wind_open_es = apply_tv_lowpass_stereo(wind_open_es, 320.0 + 1650.0 * crest_arc, q=0.78)

    valley_wind_l = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=6.0,
        dur_s=1.95,
        semitones=-1.0,
        fade_in_s=0.22,
        fade_out_s=0.68,
        hpf_hz=75.0,
        lpf_hz=3000.0,
        pan_offset=-0.34,
    )
    valley_wind_r = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=13.8,
        dur_s=1.92,
        semitones=1.0,
        fade_in_s=0.24,
        fade_out_s=0.68,
        hpf_hz=90.0,
        lpf_hz=3200.0,
        pan_offset=0.34,
    )
    fc_valley = 340.0 + 2250.0 * crest_arc
    valley_wind_l = apply_tv_lowpass_stereo(valley_wind_l, fc_valley, q=0.80)
    valley_wind_r = apply_tv_lowpass_stereo(valley_wind_r, fc_valley * 1.12, q=0.80)

    # 3. Sweeping petal storm rush (smooth stereo-swirling silk & soft leaf gusts, zero snaps!)
    storm_cloth_1 = render_earshot_layer(
        {"name": "miracle_cloth1", "says": "sweeping silk petal storm", "layers": [{"sound": "swipe/glide", "cut": [0.06, 0.70], "pitch": 0, "lowpass": 2400}]},
        dur_s=0.64,
        fade_in_s=0.14,
        fade_out_s=0.28,
        hpf_hz=220.0,
        lpf_hz=2400.0,
    )
    storm_cloth_1 = apply_stereo_pan_curve(storm_cloth_1, np.linspace(-0.62, 0.62, len(storm_cloth_1)))

    storm_cloth_2 = render_earshot_layer(
        {"name": "miracle_cloth2", "says": "sweeping silk petal swirl", "layers": [{"sound": "swipe/cloth", "cut": [0.06, 0.64], "pitch": 1.5, "lowpass": 2600}]},
        dur_s=0.58,
        fade_in_s=0.14,
        fade_out_s=0.26,
        hpf_hz=240.0,
        lpf_hz=2600.0,
    )
    storm_cloth_2 = apply_stereo_pan_curve(storm_cloth_2, np.linspace(0.62, -0.58, len(storm_cloth_2)))

    # Continuous velvety petal sweeps (using soft brush sections only, slow fade-ins!)
    petal_flurries = [
        (0.32, 0.56, -0.5, 0.16, -0.45, 0.24),
        (3.88, 0.58, 0.5, 0.30, 0.45, 0.26),
        (5.20, 0.58, 1.5, 0.46, -0.32, 0.24),
        (8.75, 0.58, 2.0, 0.62, 0.32, 0.22),
    ]
    for st_s, d_s, semi, onset, pan_v, g_v in petal_flurries:
        pf = extract_slice(
            "foley_parchment_stroke_01.wav",
            start_s=st_s,
            dur_s=d_s,
            semitones=semi,
            fade_in_s=0.10,
            fade_out_s=0.25,
            hpf_hz=300.0,
            lpf_hz=2600.0,
            pan_offset=pan_v,
        )
        mix_layer(canvas, pf, onset, g_v)

    # 4. Silky airy shimmer (gentle golden-sky breeze sheen peaking at 0.72s & drifting peacefully)
    silky_shimmer = sculpted_breath_air(
        1.72,
        alpha=0.82,
        hpf_hz=3100.0,
        lpf_hz_or_arr=7200.0,
        q=0.707,
        fade_in_s=0.28,
        fade_out_s=0.78,
        seed=808,
    )

    mix_layer(canvas, sub_breath, 0.0, 0.76)
    mix_layer(canvas, deep_air, 0.02, 0.58)
    mix_layer(canvas, whoosh_deep_es, 0.06, 0.52)
    mix_layer(canvas, wind_open_es, 0.04, 0.68)
    mix_layer(canvas, valley_wind_l, 0.03, 0.76)
    mix_layer(canvas, valley_wind_r, 0.05, 0.74)
    mix_layer(canvas, storm_cloth_1, 0.22, 0.34)
    mix_layer(canvas, storm_cloth_2, 0.46, 0.32)
    mix_layer(canvas, silky_shimmer, 0.26, 0.20)

    env_master = smoothstep(0.0, 0.065, t) * (1.0 - smoothstep(1.36, 1.98, t))
    canvas *= env_master[:, None]

    # Vocal-clarity pocket around 1.8 kHz so Artorious's voice stays noble & intelligible
    for ch in (0, 1):
        canvas[:, ch] = static_biquad(canvas[:, ch], "peaking", 1850.0, q=0.95, gain_db=-3.8)

    out = master_and_normalize(
        canvas,
        hpf_hz=44.0,
        warm_body_hz=140.0,
        warm_body_db=2.6,
        box_scoop_db=-6.5,
        lpf_hz=5000.0,
        target_rms_db=-19.2,
        peak_limit_db=-2.0,
    )
    return match_lufs_exact(out, target_lufs=-16.2, max_true_peak_db=-2.0)


# ---------------------------------------------------------------------------
# 6. `perfect_dodge_time_dilation.mp3` (~0.65s, crisp wind-cut + tight time-dip air drop)
# ---------------------------------------------------------------------------

def build_perfect_dodge_time_dilation() -> np.ndarray:
    """
    Crisp wind-cut whoosh + tight low-end time-dip air drop (0.65s):
      - Replaces the struck crystal-bronze singing bowl!
      - Instantaneous crisp wind-cut (peaks at ~0.04-0.08s) followed immediately by
        a smooth filter-swept low-end time-dip air drop (0.08-0.46s).
      - Zero pitch-warp scratch, zero late-peak mud, zero temple bowl ring!
    """
    dur = 0.65
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    canvas = np.zeros((n, 2), dtype=np.float64)

    # 1. Instantaneous crisp wind-cut whoosh (0.00 - 0.24s, peaks at ~40-70ms!)
    cut_whoosh = render_earshot_layer(
        {"name": "pd_cut", "says": "crisp fast air cut whoosh", "layers": [{"sound": "whoosh/fast", "dur": 0.28, "pitch": 2.5, "lowpass": 7600}]},
        dur_s=0.28,
        fade_in_s=0.002,
        fade_out_s=0.09,
        hpf_hz=260.0,
        lpf_hz=7600.0,
        pan_offset=-0.10,
    )
    cloak_flick = render_earshot_layer(
        {"name": "pd_flick", "says": "crisp cloth air flick", "layers": [{"sound": "swipe/flick", "cut": [0.05, 0.27], "pitch": 2.0, "lowpass": 6800}]},
        dur_s=0.22,
        fade_in_s=0.003,
        fade_out_s=0.08,
        hpf_hz=340.0,
        lpf_hz=6800.0,
        pan_offset=0.14,
    )
    # Slice air_whoosh_deep_04 starting at 0.56s (right on its main rush, skipping 0.34s pre-roll!)
    air_slice = extract_slice(
        "air_whoosh_deep_04.wav",
        start_s=0.56,
        dur_s=0.24,
        semitones=4.5,
        fade_in_s=0.004,
        fade_out_s=0.09,
        hpf_hz=320.0,
        lpf_hz=7200.0,
    )

    # 2. Tight low-end time-dip air drop (0.04 - 0.48s: clean downward lowpass cutoff dip!)
    air_dip = extract_slice(
        "air_whoosh_deep_04.wav",
        start_s=0.55,
        dur_s=0.46,
        semitones=-3.0,
        fade_in_s=0.015,
        fade_out_s=0.22,
        hpf_hz=50.0,
        lpf_hz=2400.0,
    )
    t_dp = np.arange(len(air_dip), dtype=np.float64) / SR
    dip_fc = 1750.0 * np.exp(-t_dp / 0.085) + 125.0
    air_dip = apply_tv_lowpass_stereo(air_dip, dip_fc, q=0.72)

    whoosh_deep_dip = render_earshot_layer(
        {"name": "pd_deep", "says": "tight deep air drop", "layers": [{"sound": "whoosh/deep", "cut": [0.18, 0.58], "pitch": -3.0, "lowpass": 480}]},
        dur_s=0.40,
        fade_in_s=0.016,
        fade_out_s=0.18,
        hpf_hz=50.0,
        lpf_hz=480.0,
    )

    # Subtle tight sub-air pressure drop cushion peaking right after the cut (~0.08s)
    n_sub = int(round(0.28 * SR))
    t_sub = np.arange(n_sub, dtype=np.float64) / SR
    sub_fc = 72.0 + 185.0 * np.exp(-t_sub / 0.055)
    sub_drop = sculpted_breath_air(
        0.28,
        alpha=1.50,
        hpf_hz=50.0,
        lpf_hz_or_arr=sub_fc,
        q=0.78,
        fade_in_s=0.014,
        fade_out_s=0.14,
        seed=909,
    )
    sub_drop *= (smoothstep(0.0, 0.025, t_sub) * np.exp(-np.maximum(t_sub - 0.025, 0.0) / 0.080))[:, None]
    pk_s = float(np.max(np.abs(sub_drop)))
    if pk_s > 1e-6:
        sub_drop /= pk_s

    mix_layer(canvas, cut_whoosh, 0.0, 1.15)
    mix_layer(canvas, cloak_flick, 0.002, 0.78)
    mix_layer(canvas, air_slice, 0.0, 0.85)
    mix_layer(canvas, air_dip, 0.045, 0.62)
    mix_layer(canvas, whoosh_deep_dip, 0.050, 0.36)
    mix_layer(canvas, sub_drop, 0.045, 0.34)

    env_master = smoothstep(0.0, 0.003, t) * (1.0 - smoothstep(0.42, 0.64, t))
    canvas *= env_master[:, None]

    out = master_and_normalize(
        canvas,
        hpf_hz=50.0,
        warm_body_hz=135.0,
        warm_body_db=1.2,
        box_scoop_db=-6.8,
        lpf_hz=7600.0,
        target_rms_db=-19.0,
        peak_limit_db=-1.8,
    )
    return match_lufs_exact(out, target_lufs=-16.5, max_true_peak_db=-1.8)


# ---------------------------------------------------------------------------
# Audit & Verification Helpers
# ---------------------------------------------------------------------------

def measure_ring_prominence(mp3_path: Path) -> Dict[str, float]:
    tmp = mp3_path.with_suffix(".tmp_audit.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3_path), "-ar", str(SR), "-ac", "1", str(tmp)],
        check=True,
    )
    y, sr = sf.read(str(tmp))
    tmp.unlink(missing_ok=True)

    def _band_ring(sig: np.ndarray) -> Tuple[float, float]:
        spec = np.abs(np.fft.rfft(sig)) ** 2
        freqs = np.fft.rfftfreq(len(sig), 1.0 / sr)
        mask = (freqs >= 120.0) & (freqs <= 4500.0)
        ss, sfq = spec[mask], freqs[mask]
        max_p, max_h = 1.0, 0.0
        for f0 in np.geomspace(140.0, 4000.0, 40):
            wm = (sfq >= f0 / 1.15) & (sfq <= f0 * 1.15)
            if np.sum(wm) >= 5:
                ws, wf = ss[wm], sfq[wm]
                iw = int(np.argmax(ws))
                pr = float(ws[iw] / (np.median(ws) + 1e-12))
                if pr > max_p:
                    max_p, max_h = pr, float(wf[iw])
        return max_p, max_h

    ring_all, hz_all = _band_ring(y)
    tail_sig = y[int(0.22 * sr) :] if len(y) > int(0.45 * sr) else y
    ring_tail, hz_tail = _band_ring(tail_sig)

    m = earshot_api.measure(str(mp3_path))
    return {
        "dur_s": round(float(m.get("duration", len(y) / sr)), 3),
        "lufs": round(float(m.get("lufs", -24.0)), 1),
        "tp_db": round(float(m.get("true_peak_dbtp", -1.0)), 1),
        "harm": round(float(m.get("harmonic_ratio", 0.0)), 3),
        "f0": m.get("f0_hz"),
        "cent_hz": int(m.get("centroid_hz", 0)),
        "bright_hz": int(m.get("brightness_hz", 0)),
        "ring_max_x": round(ring_all, 1),
        "ring_hz": round(hz_all, 1),
        "tail_ring_x": round(ring_tail, 1),
        "tail_hz": round(hz_tail, 1),
    }


def build_all_nature_sacred_sfx() -> List[Path]:
    specs = [
        ("amb_commune_celestial", build_amb_commune_celestial, TARGET_PATHS[0]),
        ("commune_start", build_commune_start, TARGET_PATHS[1]),
        ("stone_inspect", build_stone_inspect, TARGET_PATHS[2]),
        ("heal_verdict", build_heal_verdict, TARGET_PATHS[3]),
        ("miracle_verdict", build_miracle_verdict, TARGET_PATHS[4]),
        ("perfect_dodge_time_dilation", build_perfect_dodge_time_dilation, TARGET_PATHS[5]),
    ]
    built: List[Path] = []
    for name, fn, out_p in specs:
        audio = fn()
        export_mp3_and_wav(audio, [out_p])
        built.append(out_p)
        print(f"  [OK] Built {name:30s} -> {out_p.relative_to(GAME_SFX_DIR.parent.parent.parent.parent)}")
    return built


def print_audit_table() -> None:
    print("\n=== PURE BREATH & NATURE SACRED SFX AUDIT (ZERO BOWLS / ZERO HARP / ZERO CHIMES) ===")
    print(
        f"{'File':34s} | {'Dur(s)':>6s} | {'LUFS':>6s} | {'TP dB':>5s} | {'Harm':>5s} | {'f0':>6s} | {'MaxRing':>13s} | {'TailRing':>13s}"
    )
    print("-" * 112)
    for p in TARGET_PATHS:
        r = measure_ring_prominence(p)
        f0_s = str(r["f0"]) if r["f0"] is not None else "None"
        print(
            f"{p.name:34s} | {r['dur_s']:6.3f} | {r['lufs']:6.1f} | {r['tp_db']:5.1f} | "
            f"{r['harm']:5.3f} | {f0_s:>6s} | {r['ring_max_x']:6.1f}x@{r['ring_hz']:4.0f}Hz | {r['tail_ring_x']:6.1f}x@{r['tail_hz']:4.0f}Hz"
        )


if __name__ == "__main__":
    print("=== Building Option 1 (Pure Breath & Nature) Sacred & Perfect-Dodge SFX ===")
    build_all_nature_sacred_sfx()
    print_audit_table()
