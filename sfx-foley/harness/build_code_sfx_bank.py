#!/usr/bin/env python3
"""
sfx-foley/harness/build_code_sfx_bank.py

Physical Acoustic Foley & Multi-Layer Real-Element SFX Assembler
(Zero MiniMax H3 diffusion slush; zero clicky sine/harp/chime UI synth slop!).

Assembles all Mage spells, Meteor showers, Shatterlance spin-gather hold & shot,
Sword Dragons, Knight [Q] 3-phase Twin-Element Ult, Elemental Detonations, and
Hero/Monster Death Foley directly from the 70 verified 48 kHz studio/field
recordings in `sfx-foley/raw-elements/`.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from scipy import signal
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sfx-foley" / "sword-lab"))

from sfx_bank_builder import (
    SR,
    cinema_warm_master_eq,
    db_to_lin,
    lin_to_db,
    normalize_stereo,
    outdoor_valley_early_reflections,
    pan_stereo,
    smoothstep,
    static_biquad,
    zdf_svf_tv,
)

RAW_DIR = ROOT / "sfx-foley" / "raw-elements"
GAME_SFX_DIR = ROOT / "world" / "assets" / "audio" / "sfx"
SWORD_LAB_BANK = ROOT / "sfx-foley" / "sword-lab" / "sfx_bank"
MAGE_LAB_CURATED = ROOT / "world" / "assets" / "audio" / "mage-h3-lab" / "curated"
VOICES_SLICED_DIR = ROOT / "sfx-foley" / "voices-sliced"

_RAW_CACHE: Dict[str, np.ndarray] = {}


# ---------------------------------------------------------------------------
# Real Acoustic Stem Loading, Pitch/Time Warping & Layering Primitives
# ---------------------------------------------------------------------------

def load_raw_stereo(filename: str) -> np.ndarray:
    if filename in _RAW_CACHE:
        return _RAW_CACHE[filename]
    p = RAW_DIR / filename
    if not p.exists():
        raise FileNotFoundError(f"Missing raw element: {p}")
    data, sr_in = sf.read(str(p), always_2d=True)
    data = data.astype(np.float64)
    if data.shape[1] == 1:
        data = np.column_stack([data[:, 0], data[:, 0]])
    elif data.shape[1] > 2:
        data = data[:, :2]
    if sr_in != SR:
        n_out = max(64, int(round(len(data) * SR / sr_in)))
        data = signal.resample(data, n_out, axis=0)
    _RAW_CACHE[filename] = data
    return data


def extract_slice(
    filename: str,
    start_s: float = 0.0,
    dur_s: float = 1.0,
    semitones: float = 0.0,
    reverse: bool = False,
    fade_in_s: float = 0.008,
    fade_out_s: float = 0.045,
    hpf_hz: float | None = None,
    lpf_hz: float | None = None,
    pan_offset: float = 0.0,
    drive: float = 1.0,
) -> np.ndarray:
    """
    Slices a window from a 48 kHz studio/field recording in `sfx-foley/raw-elements/`,
    applies pitch transposition (`semitones`), optional time-reversal, filtering,
    stereo panning, and smooth fade windows.
    """
    src = load_raw_stereo(filename)
    rate = 2.0 ** (semitones / 12.0)
    n_target = max(32, int(round(dur_s * SR)))
    n_source_needed = max(32, int(round(n_target * rate)))

    i0 = max(0, int(round(start_s * SR)))
    if i0 >= len(src) - 16:
        i0 = 0
    chunk = src[i0 : i0 + n_source_needed].copy()
    if len(chunk) < n_source_needed:
        pad = np.zeros((n_source_needed - len(chunk), 2), dtype=np.float64)
        chunk = np.vstack([chunk, pad])

    if abs(semitones) > 0.01 or len(chunk) != n_target:
        u = np.linspace(0.0, len(chunk) - 1.001, n_target)
        idx0 = np.floor(u).astype(np.int64)
        frac = (u - idx0)[:, None]
        warped = (1.0 - frac) * chunk[idx0] + frac * chunk[idx0 + 1]
    else:
        warped = chunk

    if reverse:
        warped = warped[::-1].copy()

    for ch in (0, 1):
        if hpf_hz is not None and hpf_hz > 20.0:
            warped[:, ch] = static_biquad(warped[:, ch], "highpass", hpf_hz, 0.707)
        if lpf_hz is not None and lpf_hz < SR * 0.46:
            warped[:, ch] = static_biquad(warped[:, ch], "lowpass", lpf_hz, 0.707)

    if drive > 1.05:
        warped = np.tanh(warped * drive) / math.tanh(drive)

    t = np.arange(n_target, dtype=np.float64) / SR
    env = np.ones(n_target, dtype=np.float64)
    if fade_in_s > 0.0005:
        env *= smoothstep(0.0, fade_in_s, t)
    if fade_out_s > 0.0005:
        env *= 1.0 - smoothstep(max(0.0, dur_s - fade_out_s), dur_s, t)
    warped *= env[:, None]

    if abs(pan_offset) > 0.01:
        mono = 0.5 * (warped[:, 0] + warped[:, 1])
        side = 0.5 * (warped[:, 0] - warped[:, 1])
        p = float(np.clip(pan_offset, -0.9, 0.9))
        gl = math.cos((p + 1.0) * math.pi * 0.25) * 1.414
        gr = math.sin((p + 1.0) * math.pi * 0.25) * 1.414
        warped[:, 0] = mono * gl + side * 0.6
        warped[:, 1] = mono * gr - side * 0.6

    pk = float(np.max(np.abs(warped)))
    if pk > 1e-6:
        warped /= pk
    return warped


def extract_doppler_slice(
    filename: str,
    start_s: float,
    dur_s: float,
    semitones_start: float,
    semitones_end: float,
    fade_in_s: float = 0.010,
    fade_out_s: float = 0.030,
    hpf_hz: float | None = 65.0,
    lpf_hz: float | None = 9500.0,
    pan_start: float = 0.0,
    pan_end: float = 0.0,
) -> np.ndarray:
    """
    Time-varying pitch-warped slice for real Doppler sky-dives and accelerating spin-ups.
    """
    src = load_raw_stereo(filename)
    n_target = max(32, int(round(dur_s * SR)))
    u = np.linspace(0.0, 1.0, n_target)
    st_curve = semitones_start + (semitones_end - semitones_start) * (u ** 1.35)
    rate_curve = 2.0 ** (st_curve / 12.0)
    phase = np.cumsum(rate_curve)
    phase = phase - phase[0]

    i0 = max(0, int(round(start_s * SR)))
    max_idx = len(src) - 2
    idx_f = np.clip(i0 + phase, 0.0, max_idx - 0.001)
    idx0 = np.floor(idx_f).astype(np.int64)
    frac = (idx_f - idx0)[:, None]
    warped = (1.0 - frac) * src[idx0] + frac * src[idx0 + 1]

    for ch in (0, 1):
        if hpf_hz is not None:
            warped[:, ch] = static_biquad(warped[:, ch], "highpass", hpf_hz, 0.707)
        if lpf_hz is not None:
            warped[:, ch] = static_biquad(warped[:, ch], "lowpass", lpf_hz, 0.707)

    t = np.arange(n_target, dtype=np.float64) / SR
    env = smoothstep(0.0, max(0.001, fade_in_s), t) * (1.0 - smoothstep(max(0.0, dur_s - fade_out_s), dur_s, t))
    warped *= env[:, None]

    if abs(pan_start) > 0.01 or abs(pan_end) > 0.01:
        pan_curve = np.linspace(pan_start, pan_end, n_target)
        theta = (np.clip(pan_curve, -0.95, 0.95) + 1.0) * (math.pi * 0.25)
        mono = 0.5 * (warped[:, 0] + warped[:, 1])
        side = 0.5 * (warped[:, 0] - warped[:, 1])
        warped[:, 0] = mono * np.cos(theta) * 1.414 + side * 0.5
        warped[:, 1] = mono * np.sin(theta) * 1.414 - side * 0.5

    pk = float(np.max(np.abs(warped)))
    if pk > 1e-6:
        warped /= pk
    return warped


def mix_layer(canvas: np.ndarray, layer: np.ndarray, onset_s: float = 0.0, gain: float = 1.0) -> None:
    i0 = max(0, int(round(onset_s * SR)))
    if i0 >= len(canvas):
        return
    m = min(len(canvas) - i0, len(layer))
    if m > 0:
        canvas[i0 : i0 + m] += layer[:m] * gain


def master_and_normalize(
    stereo: np.ndarray,
    hpf_hz: float = 48.0,
    warm_body_hz: float = 155.0,
    warm_body_db: float = 3.2,
    box_scoop_db: float = -5.5,
    lpf_hz: float = 9500.0,
    target_rms_db: float = -15.8,
    peak_limit_db: float = -1.0,
) -> np.ndarray:
    out = stereo.copy()
    for ch in (0, 1):
        out[:, ch] = cinema_warm_master_eq(
            out[:, ch],
            hpf_hz=hpf_hz,
            warm_body_hz=warm_body_hz,
            warm_body_db=warm_body_db,
            box_scoop_db=box_scoop_db,
            silk_cut_db=-2.2,
            lpf_hz=lpf_hz,
        )
    return normalize_stereo(out, target_rms_db=target_rms_db, peak_limit_db=peak_limit_db)


def export_mp3_and_wav(stereo: np.ndarray, mp3_paths: List[Path]) -> Dict[str, float]:
    stereo = np.clip(np.asarray(stereo, dtype=np.float64), -0.99, 0.99)
    tmp_wav = mp3_paths[0].with_suffix(".tmp.wav")
    tmp_wav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(tmp_wav), stereo.astype(np.float32), SR, subtype="PCM_16")

    first_mp3 = mp3_paths[0]
    first_mp3.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(tmp_wav),
            "-ar",
            str(SR),
            "-ac",
            "2",
            "-b:a",
            "192k",
            str(first_mp3),
        ],
        check=True,
    )
    for extra_mp3 in mp3_paths[1:]:
        extra_mp3.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(first_mp3, extra_mp3)

    if tmp_wav.exists():
        tmp_wav.unlink()

    mono = 0.5 * (stereo[:, 0] + stereo[:, 1])
    pk = float(np.max(np.abs(stereo)))
    rms = float(np.sqrt(np.mean(mono * mono)))
    freqs = np.fft.rfftfreq(len(mono), d=1.0 / SR)
    mag = np.abs(np.fft.rfft(mono))
    centroid = float(np.sum(freqs * mag) / max(float(np.sum(mag)), 1e-9))
    return {
        "duration_s": round(len(mono) / SR, 3),
        "peak_dbfs": round(lin_to_db(pk), 2),
        "rms_dbfs": round(lin_to_db(rms), 2),
        "crest_db": round(lin_to_db(pk) - lin_to_db(rms), 2),
        "centroid_hz": round(centroid, 1),
    }


# ---------------------------------------------------------------------------
# 1. Terrifying Meteors: Mage [Q] Starfall & [E] Cinder Fall
# ---------------------------------------------------------------------------

def build_mage_q_starfall_seal() -> np.ndarray:
    """
    `mage_q_starfall_seal` (1.65s, interruptible invocation):
    Tectonic sky-opening rumble + reversed fireball suction + close dry thunder tear +
    ominous deep Tibetan bronze fifth resonance and cavernous atmospheric tail.
    """
    dur = 1.65
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    suction = extract_slice("fire_fireball_pass_01.wav", start_s=0.15, dur_s=0.42, semitones=-2.5, reverse=True, fade_in_s=0.02, fade_out_s=0.05, hpf_hz=65.0)
    mix_layer(canvas, suction, onset_s=0.0, gain=0.82)

    sub_punch = extract_slice("earth_artillery_k55_01.wav", start_s=0.02, dur_s=1.35, semitones=-3.0, fade_in_s=0.005, fade_out_s=0.35, hpf_hz=32.0, lpf_hz=320.0, drive=1.45)
    sky_tear = extract_slice("elec_thunder_clap_roll_03.wav", start_s=0.02, dur_s=1.42, semitones=-2.5, fade_in_s=0.005, fade_out_s=0.38, hpf_hz=55.0, lpf_hz=6400.0)
    furnace = extract_slice("fire_furnace_roar_01.wav", start_s=0.05, dur_s=1.30, semitones=-2.0, fade_in_s=0.02, fade_out_s=0.35, hpf_hz=75.0)
    bowl_low = extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.02, dur_s=1.45, semitones=-7.0, fade_in_s=0.01, fade_out_s=0.40, hpf_hz=65.0, lpf_hz=1800.0)

    mix_layer(canvas, sub_punch, onset_s=0.14, gain=1.05)
    mix_layer(canvas, sky_tear, onset_s=0.15, gain=0.82)
    mix_layer(canvas, furnace, onset_s=0.18, gain=0.76)
    mix_layer(canvas, bowl_low, onset_s=0.15, gain=0.58)

    return master_and_normalize(canvas, hpf_hz=36.0, warm_body_hz=125.0, warm_body_db=4.2, box_scoop_db=-6.5, target_rms_db=-14.2, peak_limit_db=-0.8)


def build_mage_q_starfall_meteor() -> np.ndarray:
    """
    `mage_q_starfall_meteor` (1.58s):
      - 0.00 - 0.34s: Unmistakable high-altitude incoming missile/shell whistle scream
        (`air_missile_incoming_02.wav` + `air_incoming_shell_01.wav`) Doppler-diving from the sky!
      - 0.34 - 1.58s: Colossal bedrock artillery crater detonation (`earth_artillery_k55_01.wav`
        + `earth_boulder_smash_01.wav` + `fire_rumble_sub_01.wav` + rolling rockfall tail),
        with a deep 550 Hz midrange scoop so multiple meteors never clutter voices!
    """
    dur = 1.58
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    missile_whistle = extract_doppler_slice(
        "air_missile_incoming_02.wav",
        start_s=0.15,
        dur_s=0.34,
        semitones_start=3.5,
        semitones_end=-4.5,
        fade_in_s=0.012,
        fade_out_s=0.020,
        hpf_hz=260.0,
        lpf_hz=8200.0,
        pan_start=-0.32,
        pan_end=0.0,
    )
    shell_scream = extract_doppler_slice(
        "air_incoming_shell_01.wav",
        start_s=1.12,
        dur_s=0.34,
        semitones_start=2.5,
        semitones_end=-5.5,
        fade_in_s=0.012,
        fade_out_s=0.018,
        hpf_hz=220.0,
        lpf_hz=7800.0,
        pan_start=0.28,
        pan_end=0.0,
    )
    mix_layer(canvas, missile_whistle, onset_s=0.0, gain=0.92)
    mix_layer(canvas, shell_scream, onset_s=0.01, gain=0.84)

    i_dip0 = int(0.315 * SR)
    i_dip1 = int(0.332 * SR)
    canvas[i_dip0:i_dip1] *= 0.28

    t_imp = 0.330
    k55_sub = extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=1.22, semitones=-2.5, fade_in_s=0.002, fade_out_s=0.32, hpf_hz=32.0, lpf_hz=1800.0, drive=1.45)
    boulder_slam = extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=0.92, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.22, hpf_hz=36.0, drive=1.35)
    fire_sub = extract_slice("fire_rumble_sub_01.wav", start_s=0.05, dur_s=1.18, semitones=-2.0, fade_in_s=0.010, fade_out_s=0.35, hpf_hz=34.0, lpf_hz=420.0)
    fire_boom = extract_slice("fire_deflagration_boom_01.wav", start_s=0.0, dur_s=0.65, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.14, hpf_hz=48.0)
    shrapnel_l = extract_slice("earth_rockfall_slide_01.wav", start_s=0.04, dur_s=1.15, semitones=-0.5, fade_in_s=0.010, fade_out_s=0.32, hpf_hz=180.0, pan_offset=-0.48)
    shrapnel_r = extract_slice("earth_tumbling_rocks_03.wav", start_s=0.08, dur_s=1.12, semitones=-1.5, fade_in_s=0.012, fade_out_s=0.32, hpf_hz=160.0, pan_offset=0.48)

    mix_layer(canvas, k55_sub, onset_s=t_imp, gain=1.12)
    mix_layer(canvas, boulder_slam, onset_s=t_imp + 0.003, gain=0.96)
    mix_layer(canvas, fire_sub, onset_s=t_imp + 0.010, gain=0.92)
    mix_layer(canvas, fire_boom, onset_s=t_imp + 0.004, gain=0.84)
    mix_layer(canvas, shrapnel_l, onset_s=t_imp + 0.035, gain=0.62)
    mix_layer(canvas, shrapnel_r, onset_s=t_imp + 0.050, gain=0.62)

    return master_and_normalize(canvas, hpf_hz=34.0, warm_body_hz=118.0, warm_body_db=4.4, box_scoop_db=-7.5, target_rms_db=-14.0, peak_limit_db=-0.8)


def build_spell_cinder_fall_launch() -> np.ndarray:
    """
    `spell_cinder_fall_launch` (0.68s):
    Violent flamethrower ignition whoosh + incoming artillery shell howl hurtling toward the target.
    """
    dur = 0.68
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    whoosh = extract_doppler_slice(
        "fire_flamethrower_whoosh_02.wav",
        start_s=0.02,
        dur_s=0.64,
        semitones_start=2.0,
        semitones_end=-4.5,
        fade_in_s=0.006,
        fade_out_s=0.08,
        hpf_hz=70.0,
        lpf_hz=7500.0,
    )
    fireball = extract_slice("fire_fireball_pass_01.wav", start_s=0.38, dur_s=0.62, semitones=-1.0, fade_in_s=0.008, fade_out_s=0.09, hpf_hz=75.0)
    shell_dive = extract_doppler_slice(
        "air_incoming_shell_01.wav",
        start_s=1.12,
        dur_s=0.60,
        semitones_start=2.5,
        semitones_end=-5.5,
        fade_in_s=0.015,
        fade_out_s=0.07,
        hpf_hz=180.0,
        lpf_hz=7200.0,
    )
    punch = extract_slice("fire_deflagration_boom_02.wav", start_s=0.0, dur_s=0.45, semitones=-2.0, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=50.0)

    mix_layer(canvas, punch, onset_s=0.0, gain=0.92)
    mix_layer(canvas, whoosh, onset_s=0.005, gain=0.95)
    mix_layer(canvas, fireball, onset_s=0.015, gain=0.84)
    mix_layer(canvas, shell_dive, onset_s=0.025, gain=0.82)

    return master_and_normalize(canvas, hpf_hz=48.0, warm_body_hz=145.0, warm_body_db=3.6, target_rms_db=-14.8, peak_limit_db=-0.9)


def build_spell_cinder_fall_impact() -> np.ndarray:
    """
    `spell_cinder_fall_impact` (2.05s):
    Colossal volcanic asteroid ground slam with deep sub-bass crater concussion +
    2.0s rolling rockfall & magma roar tail.
    """
    dur = 2.05
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    k55 = extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=1.75, semitones=-2.5, fade_in_s=0.002, fade_out_s=0.40, hpf_hz=32.0, lpf_hz=2200.0, drive=1.48)
    boulder = extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=1.10, semitones=-2.0, fade_in_s=0.002, fade_out_s=0.22, hpf_hz=34.0, drive=1.45)
    mortar = extract_slice("earth_mortar_cannon_05.wav", start_s=0.02, dur_s=1.45, semitones=-2.5, fade_in_s=0.003, fade_out_s=0.30, hpf_hz=36.0, lpf_hz=2800.0)
    fire_boom = extract_slice("fire_deflagration_boom_01.wav", start_s=0.0, dur_s=0.85, semitones=-2.0, fade_in_s=0.002, fade_out_s=0.16, hpf_hz=45.0)
    sub_rumble = extract_slice("fire_rumble_sub_01.wav", start_s=0.05, dur_s=1.85, semitones=-2.0, fade_in_s=0.015, fade_out_s=0.45, hpf_hz=32.0, lpf_hz=380.0)
    collapse = extract_slice("earth_debris_collapse_03.wav", start_s=0.02, dur_s=1.70, semitones=-1.5, fade_in_s=0.015, fade_out_s=0.38, hpf_hz=60.0)
    debris_l = extract_slice("earth_rockfall_slide_01.wav", start_s=0.02, dur_s=1.80, semitones=-0.5, fade_in_s=0.012, fade_out_s=0.42, hpf_hz=150.0, pan_offset=-0.52)
    debris_r = extract_slice("earth_tumbling_rocks_03.wav", start_s=0.10, dur_s=1.80, semitones=-1.5, fade_in_s=0.015, fade_out_s=0.42, hpf_hz=150.0, pan_offset=0.52)
    furnace = extract_slice("fire_fireplace_roar_03.wav", start_s=0.2, dur_s=1.85, semitones=-1.0, fade_in_s=0.04, fade_out_s=0.45, hpf_hz=120.0)

    mix_layer(canvas, k55, onset_s=0.0, gain=1.15)
    mix_layer(canvas, boulder, onset_s=0.002, gain=1.05)
    mix_layer(canvas, mortar, onset_s=0.006, gain=0.95)
    mix_layer(canvas, fire_boom, onset_s=0.003, gain=0.92)
    mix_layer(canvas, sub_rumble, onset_s=0.020, gain=0.95)
    mix_layer(canvas, collapse, onset_s=0.040, gain=0.76)
    mix_layer(canvas, debris_l, onset_s=0.055, gain=0.70)
    mix_layer(canvas, debris_r, onset_s=0.075, gain=0.68)
    mix_layer(canvas, furnace, onset_s=0.080, gain=0.58)

    return master_and_normalize(canvas, hpf_hz=34.0, warm_body_hz=120.0, warm_body_db=4.5, box_scoop_db=-6.5, target_rms_db=-13.6, peak_limit_db=-0.7)


# ---------------------------------------------------------------------------
# 2. Mass-Grounded Ice: Shatterlance (Spin-Gather Hold + Shot) & Frost Lance
# ---------------------------------------------------------------------------

def build_spell_shatterlance_charge() -> np.ndarray:
    """
    `spell_shatterlance_charge` (1.75s loop while holding LMB):
    Ascending pitch-swept crystal/singing-bowl harmonic riser (-2 st -> +7 st) +
    accelerating spinning staff vortex whooshes + frozen-lake stress groan +
    crystallizing ice-shard convergence snaps so charge readiness is unmistakable!
    """
    dur = 1.75
    n = int(dur * SR)
    canvas = np.zeros((n, 2), dtype=np.float64)

    # 1. Ascending crystalline singing-bowl harmonic riser (signals charge building!)
    bowl_riser_l = extract_doppler_slice(
        "instr_tibetan_bowl_01.wav",
        start_s=1.20,
        dur_s=dur,
        semitones_start=-2.0,
        semitones_end=7.0,
        fade_in_s=0.06,
        fade_out_s=0.08,
        hpf_hz=180.0,
        lpf_hz=5400.0,
        pan_start=-0.35,
        pan_end=0.25,
    )
    bowl_riser_r = extract_doppler_slice(
        "instr_tibetan_bowl_strike_02.wav",
        start_s=0.35,
        dur_s=dur,
        semitones_start=3.0,
        semitones_end=12.0,
        fade_in_s=0.06,
        fade_out_s=0.08,
        hpf_hz=240.0,
        lpf_hz=6200.0,
        pan_start=0.35,
        pan_end=-0.25,
    )
    groan = extract_doppler_slice(
        "ice_lake_groan_02.wav",
        start_s=1.10,
        dur_s=dur,
        semitones_start=-2.5,
        semitones_end=3.5,
        fade_in_s=0.06,
        fade_out_s=0.08,
        hpf_hz=55.0,
        lpf_hz=4200.0,
    )
    stress = extract_slice("ice_fracture_stress_02.wav", start_s=0.25, dur_s=dur, semitones=0.5, fade_in_s=0.06, fade_out_s=0.08, hpf_hz=90.0, lpf_hz=5200.0)
    blizzard = extract_doppler_slice(
        "ice_blizzard_whistle_01.wav",
        start_s=0.50,
        dur_s=dur,
        semitones_start=-2.0,
        semitones_end=4.5,
        fade_in_s=0.06,
        fade_out_s=0.08,
        hpf_hz=140.0,
        lpf_hz=5600.0,
    )

    mix_layer(canvas, bowl_riser_l, onset_s=0.0, gain=0.78)
    mix_layer(canvas, bowl_riser_r, onset_s=0.0, gain=0.64)
    mix_layer(canvas, groan, onset_s=0.0, gain=0.88)
    mix_layer(canvas, stress, onset_s=0.0, gain=0.76)
    mix_layer(canvas, blizzard, onset_s=0.0, gain=0.58)

    # 2. 5 Accelerating & Pitch-Rising Rotational Vortex Pulses
    for idx, t_w in enumerate([0.03, 0.42, 0.78, 1.10, 1.38]):
        pan_w = -0.42 if idx % 2 == 0 else 0.42
        whoosh_p = extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=0.34, semitones=0.5 + idx * 1.4, fade_in_s=0.025, fade_out_s=0.05, hpf_hz=95.0, lpf_hz=4200.0, pan_offset=pan_w)
        mix_layer(canvas, whoosh_p, onset_s=t_w, gain=0.72 + idx * 0.05)

    # 3. Real brittle ice-shard lock snaps as shards spiral into the core
    snaps = extract_slice("ice_cracking_snap_02.wav", start_s=0.04, dur_s=dur, semitones=1.0, fade_in_s=0.05, fade_out_s=0.08, hpf_hz=200.0, lpf_hz=7200.0)
    mix_layer(canvas, snaps, onset_s=0.0, gain=0.74)

    return master_and_normalize(canvas, hpf_hz=58.0, warm_body_hz=165.0, warm_body_db=3.2, target_rms_db=-15.2, peak_limit_db=-1.0)


def build_spell_shatterlance_release() -> np.ndarray:
    """
    `spell_shatterlance_release` (0.76s):
    Supersonic railgun crack (`elec_whip_sonic_01.wav` + `ice_crack_sharp_01.wav`) +
    gunshot frozen-lake cleavage (`ice_lake_fracture_01.wav`) + artillery launch punch.
    """
    dur = 0.76
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    sonic_whip = extract_slice("elec_whip_sonic_01.wav", start_s=0.01, dur_s=0.52, semitones=0.5, fade_in_s=0.001, fade_out_s=0.10, hpf_hz=120.0, drive=1.35)
    sharp_crack = extract_slice("ice_crack_sharp_01.wav", start_s=0.0, dur_s=0.48, semitones=0.0, fade_in_s=0.001, fade_out_s=0.09, hpf_hz=140.0)
    lake_gunshot = extract_slice("ice_lake_fracture_01.wav", start_s=0.52, dur_s=0.72, semitones=-0.5, fade_in_s=0.002, fade_out_s=0.14, hpf_hz=48.0, drive=1.35)
    punch = extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=0.68, semitones=-2.0, fade_in_s=0.002, fade_out_s=0.14, hpf_hz=36.0, lpf_hz=1800.0)
    whoosh = extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=0.58, semitones=2.5, fade_in_s=0.003, fade_out_s=0.12, hpf_hz=85.0)

    mix_layer(canvas, punch, onset_s=0.0, gain=0.98)
    mix_layer(canvas, sonic_whip, onset_s=0.001, gain=0.95)
    mix_layer(canvas, sharp_crack, onset_s=0.002, gain=0.90)
    mix_layer(canvas, lake_gunshot, onset_s=0.004, gain=1.02)
    mix_layer(canvas, whoosh, onset_s=0.010, gain=0.84)

    return master_and_normalize(canvas, hpf_hz=40.0, warm_body_hz=140.0, warm_body_db=3.8, target_rms_db=-14.2, peak_limit_db=-0.8)


def build_spell_shatterlance_impact() -> np.ndarray:
    """
    `spell_shatterlance_impact` (1.88s):
    Supersonic crystalline railgun detonation + massive glacier calving crash +
    deep artillery sub-slam + 1.8s cascading icicle & frozen-lake fracture tail.
    """
    dur = 1.88
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    k55 = extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=1.45, semitones=-2.0, fade_in_s=0.002, fade_out_s=0.35, hpf_hz=34.0, lpf_hz=1600.0, drive=1.4)
    boulder = extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=1.05, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.22, hpf_hz=38.0, drive=1.35)
    calving = extract_slice("ice_glacier_calving_01.wav", start_s=0.85, dur_s=1.78, semitones=-2.0, fade_in_s=0.003, fade_out_s=0.38, hpf_hz=48.0)
    field_crack = extract_slice("ice_cracking_field_03.wav", start_s=0.05, dur_s=1.80, semitones=-1.0, fade_in_s=0.010, fade_out_s=0.40, hpf_hz=70.0)
    ice_block = extract_slice("ice_block_break_02.wav", start_s=0.0, dur_s=1.15, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.22, hpf_hz=75.0)
    thick_shatter = extract_slice("ice_glass_pane_smash_01.wav", start_s=0.12, dur_s=1.20, semitones=-4.5, fade_in_s=0.003, fade_out_s=0.26, hpf_hz=120.0, lpf_hz=7400.0)
    icicles_l = extract_slice("ice_icicle_shatter_03.wav", start_s=0.04, dur_s=1.72, semitones=-1.5, fade_in_s=0.008, fade_out_s=0.38, hpf_hz=280.0, lpf_hz=7800.0, pan_offset=-0.48)
    icicles_r = extract_slice("ice_lake_fracture_01.wav", start_s=0.50, dur_s=1.75, semitones=-1.0, fade_in_s=0.008, fade_out_s=0.38, hpf_hz=90.0, pan_offset=0.48)

    mix_layer(canvas, k55, onset_s=0.0, gain=1.08)
    mix_layer(canvas, boulder, onset_s=0.002, gain=0.98)
    mix_layer(canvas, calving, onset_s=0.004, gain=0.96)
    mix_layer(canvas, ice_block, onset_s=0.003, gain=0.95)
    mix_layer(canvas, thick_shatter, onset_s=0.008, gain=0.84)
    mix_layer(canvas, field_crack, onset_s=0.025, gain=0.80)
    mix_layer(canvas, icicles_l, onset_s=0.035, gain=0.68)
    mix_layer(canvas, icicles_r, onset_s=0.050, gain=0.72)

    return master_and_normalize(canvas, hpf_hz=36.0, warm_body_hz=130.0, warm_body_db=4.2, target_rms_db=-13.8, peak_limit_db=-0.8)


def build_spell_frost_lance_cast() -> np.ndarray:
    """`spell_frost_lance_cast` (0.64s): Frozen-lake fracture split + rushing blizzard ground wave."""
    dur = 0.64
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    fracture = extract_slice("ice_lake_fracture_01.wav", start_s=0.52, dur_s=0.60, semitones=-1.0, fade_in_s=0.003, fade_out_s=0.12, hpf_hz=50.0)
    crack = extract_slice("ice_crack_sharp_01.wav", start_s=0.0, dur_s=0.52, semitones=-1.0, fade_in_s=0.002, fade_out_s=0.10, hpf_hz=85.0)
    whoosh = extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=0.58, semitones=0.5, fade_in_s=0.006, fade_out_s=0.12, hpf_hz=70.0)
    storm = extract_slice("ice_blizzard_storm_02.wav", start_s=0.35, dur_s=0.60, semitones=-1.0, fade_in_s=0.015, fade_out_s=0.14, hpf_hz=100.0, lpf_hz=6400.0)

    mix_layer(canvas, fracture, onset_s=0.0, gain=0.98)
    mix_layer(canvas, crack, onset_s=0.004, gain=0.86)
    mix_layer(canvas, whoosh, onset_s=0.010, gain=0.85)
    mix_layer(canvas, storm, onset_s=0.020, gain=0.72)

    return master_and_normalize(canvas, hpf_hz=48.0, warm_body_hz=150.0, warm_body_db=3.6, target_rms_db=-14.8, peak_limit_db=-0.9)


def build_spell_frost_lance_erupt() -> np.ndarray:
    """
    `spell_frost_lance_erupt` (1.86s):
    Towering 14.5m glacier corridor & apex crown eruption with deep sub-bass heave and
    1.8s cascading ice-field fracture & crystalline stress groans.
    """
    dur = 1.86
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    calving = extract_slice("ice_glacier_calving_01.wav", start_s=0.80, dur_s=1.78, semitones=-2.5, fade_in_s=0.004, fade_out_s=0.38, hpf_hz=38.0, drive=1.38)
    stone = extract_slice("earth_artillery_k55_01.wav", start_s=0.02, dur_s=1.40, semitones=-2.5, fade_in_s=0.003, fade_out_s=0.32, hpf_hz=36.0, lpf_hz=2400.0)
    lake_boom = extract_slice("ice_lake_fracture_01.wav", start_s=2.45, dur_s=1.75, semitones=-2.0, fade_in_s=0.003, fade_out_s=0.38, hpf_hz=42.0)
    field_crack = extract_slice("ice_cracking_field_03.wav", start_s=0.02, dur_s=1.80, semitones=-0.5, fade_in_s=0.012, fade_out_s=0.40, hpf_hz=75.0)
    block1 = extract_slice("ice_block_break_02.wav", start_s=0.90, dur_s=1.25, semitones=-1.0, fade_in_s=0.004, fade_out_s=0.25, hpf_hz=85.0, pan_offset=-0.38)
    icicles = extract_slice("ice_icicle_shatter_03.wav", start_s=0.04, dur_s=1.68, semitones=-2.0, fade_in_s=0.010, fade_out_s=0.38, hpf_hz=220.0, lpf_hz=7200.0, pan_offset=0.38)

    mix_layer(canvas, calving, onset_s=0.0, gain=1.05)
    mix_layer(canvas, stone, onset_s=0.003, gain=0.96)
    mix_layer(canvas, lake_boom, onset_s=0.010, gain=0.95)
    mix_layer(canvas, field_crack, onset_s=0.030, gain=0.84)
    mix_layer(canvas, block1, onset_s=0.045, gain=0.80)
    mix_layer(canvas, icicles, onset_s=0.085, gain=0.72)

    return master_and_normalize(canvas, hpf_hz=36.0, warm_body_hz=132.0, warm_body_db=4.2, target_rms_db=-13.8, peak_limit_db=-0.8)


# ---------------------------------------------------------------------------
# 3. Mage Primary Combo Bolts 1-4 (Zero Harp/Chime Notes — Pure Arcane Wind & Ice/Fire Impact)
# ---------------------------------------------------------------------------

def build_mage_bolt_cast(step: int) -> np.ndarray:
    """
    `mage_bolt_cast_1..3` (0.26 - 0.30s):
    Punchy staff air-whip (`air_whoosh_deep_04.wav` + `elec_whip_heavy_02.wav`) +
    pressurized plasma-frost snap (`fire_flamethrower_whoosh_02.wav` + `ice_crack_sharp_01.wav`).
    """
    dur = 0.25 + 0.02 * step
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
    st_shift = [1.5, 3.0, 4.5][min(max(step - 1, 0), 2)]
    pan_v = -0.15 if step % 2 == 1 else 0.15

    whoosh = extract_slice("air_whoosh_deep_04.wav", start_s=0.25, dur_s=dur - 0.01, semitones=st_shift, fade_in_s=0.003, fade_out_s=0.05, hpf_hz=110.0, lpf_hz=6400.0, pan_offset=pan_v)
    jet = extract_slice("fire_flamethrower_whoosh_02.wav", start_s=0.04, dur_s=dur - 0.02, semitones=st_shift + 1.0, fade_in_s=0.003, fade_out_s=0.05, hpf_hz=160.0, lpf_hz=5800.0, pan_offset=pan_v)
    whip = extract_slice("elec_whip_heavy_02.wav", start_s=0.02, dur_s=0.18, semitones=-1.0 + step, fade_in_s=0.001, fade_out_s=0.04, hpf_hz=180.0, lpf_hz=6200.0)
    snap = extract_slice("ice_crack_sharp_01.wav", start_s=0.0, dur_s=0.20, semitones=st_shift, fade_in_s=0.002, fade_out_s=0.05, hpf_hz=220.0, lpf_hz=6500.0)

    mix_layer(canvas, whoosh, onset_s=0.0, gain=0.95)
    mix_layer(canvas, jet, onset_s=0.004, gain=0.72)
    mix_layer(canvas, whip, onset_s=0.002, gain=0.52)
    mix_layer(canvas, snap, onset_s=0.006, gain=0.58)

    return master_and_normalize(canvas, hpf_hz=85.0, warm_body_hz=180.0, warm_body_db=3.2, target_rms_db=-16.6, peak_limit_db=-1.3)


def build_mage_bolt_nova_cast() -> np.ndarray:
    """`mage_bolt_nova_cast` (0.44s): Heavy arcane-fireball pass + frozen-lake snap + artillery sub-thump."""
    dur = 0.44
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    fireball = extract_slice("fire_fireball_pass_01.wav", start_s=0.45, dur_s=0.42, semitones=0.5, fade_in_s=0.004, fade_out_s=0.08, hpf_hz=70.0)
    whoosh = extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=0.42, semitones=0.0, fade_in_s=0.004, fade_out_s=0.08, hpf_hz=75.0)
    lake_snap = extract_slice("ice_lake_fracture_01.wav", start_s=0.52, dur_s=0.40, semitones=1.0, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=90.0)
    punch = extract_slice("earth_artillery_punch_04.wav", start_s=0.14, dur_s=0.38, semitones=-1.0, fade_in_s=0.002, fade_out_s=0.08, hpf_hz=50.0, lpf_hz=1200.0)

    mix_layer(canvas, punch, onset_s=0.0, gain=0.82)
    mix_layer(canvas, fireball, onset_s=0.004, gain=0.92)
    mix_layer(canvas, whoosh, onset_s=0.006, gain=0.85)
    mix_layer(canvas, lake_snap, onset_s=0.010, gain=0.78)

    return master_and_normalize(canvas, hpf_hz=58.0, warm_body_hz=160.0, warm_body_db=3.5, target_rms_db=-15.8, peak_limit_db=-1.1)


def build_mage_bolt_impact(step: int) -> np.ndarray:
    """`mage_bolt_impact_1..3` & `mage_nova_impact` (step=4): Real ice-block & stone impact crunch."""
    is_nova = step >= 4
    dur = 0.52 if is_nova else 0.28
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    offsets = [0.0, 0.96, 2.02, 0.0]
    ice_hit = extract_slice("ice_block_break_02.wav", start_s=offsets[min(step - 1, 3)], dur_s=dur - 0.01, semitones=0.0 if not is_nova else -2.0, fade_in_s=0.002, fade_out_s=0.06, hpf_hz=75.0)
    thud = extract_slice("earth_boulder_roll_02.wav", start_s=0.02, dur_s=dur - 0.01, semitones=1.0 if not is_nova else -1.5, fade_in_s=0.002, fade_out_s=0.06, hpf_hz=55.0, lpf_hz=1400.0)
    mix_layer(canvas, ice_hit, onset_s=0.0, gain=0.95)
    mix_layer(canvas, thud, onset_s=0.002, gain=0.85)

    if is_nova:
        boom = extract_slice("fire_deflagration_boom_02.wav", start_s=0.0, dur_s=0.48, semitones=-1.0, fade_in_s=0.002, fade_out_s=0.08, hpf_hz=50.0)
        shatter = extract_slice("ice_glass_pane_smash_01.wav", start_s=0.14, dur_s=0.48, semitones=-4.5, fade_in_s=0.003, fade_out_s=0.10, hpf_hz=140.0, lpf_hz=6800.0)
        mix_layer(canvas, boom, onset_s=0.0, gain=0.90)
        mix_layer(canvas, shatter, onset_s=0.008, gain=0.78)

    return master_and_normalize(canvas, hpf_hz=52.0 if is_nova else 78.0, warm_body_hz=160.0, warm_body_db=3.4, target_rms_db=-15.6 if is_nova else -16.8, peak_limit_db=-1.2)


# ---------------------------------------------------------------------------
# 4. Sword Dragons ([E]) & Knight [Q] 3-Phase Twin-Element Ult
# ---------------------------------------------------------------------------

def build_dragon_ice(pitch_st: float = 0.0) -> np.ndarray:
    """
    `knight_e_ice_dragon_{wide,close}` (1.92s):
    Steel ignition + ferocious dragon bellow (`creature_alligator_growl_01.wav` +
    `creature_cougar_snarl_01.wav` + `creature_beast_snarl_01.wav`) + deep seismic sub-slam
    (`earth_artillery_k55_01.wav`) + 12m glacier calving & crystalline fracture tail.
    """
    dur = 1.92
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    sword = extract_slice("foley_sword_clash_01.wav", start_s=0.01, dur_s=0.65, semitones=pitch_st, fade_in_s=0.002, fade_out_s=0.14, hpf_hz=120.0, lpf_hz=7600.0)
    k55_sub = extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=1.45, semitones=-3.0 + pitch_st, fade_in_s=0.002, fade_out_s=0.35, hpf_hz=32.0, lpf_hz=280.0, drive=1.45)
    gator = extract_slice("creature_alligator_growl_01.wav", start_s=0.45, dur_s=1.65, semitones=-2.5 + pitch_st, fade_in_s=0.012, fade_out_s=0.35, hpf_hz=42.0, lpf_hz=3200.0, drive=1.45, pan_offset=-0.22)
    beast = extract_slice("creature_beast_snarl_01.wav", start_s=0.18, dur_s=1.55, semitones=-1.5 + pitch_st, fade_in_s=0.015, fade_out_s=0.35, hpf_hz=85.0, lpf_hz=5200.0, pan_offset=0.22)
    cougar = extract_slice("creature_cougar_snarl_01.wav", start_s=0.15, dur_s=1.50, semitones=-1.0 + pitch_st, fade_in_s=0.020, fade_out_s=0.35, hpf_hz=110.0, lpf_hz=5000.0)
    calving = extract_slice("ice_glacier_calving_01.wav", start_s=0.80, dur_s=1.80, semitones=-1.5 + pitch_st, fade_in_s=0.004, fade_out_s=0.38, hpf_hz=45.0)
    lake_crack = extract_slice("ice_lake_fracture_01.wav", start_s=0.50, dur_s=1.78, semitones=pitch_st, fade_in_s=0.004, fade_out_s=0.38, hpf_hz=55.0, pan_offset=-0.35)
    field_crack = extract_slice("ice_cracking_field_03.wav", start_s=0.04, dur_s=1.82, semitones=pitch_st, fade_in_s=0.015, fade_out_s=0.42, hpf_hz=90.0, pan_offset=0.35)
    blizzard = extract_slice("ice_blizzard_whistle_01.wav", start_s=0.35, dur_s=1.80, semitones=-1.0 + pitch_st, fade_in_s=0.025, fade_out_s=0.42, hpf_hz=140.0, lpf_hz=6400.0)

    mix_layer(canvas, sword, onset_s=0.0, gain=0.85)
    mix_layer(canvas, k55_sub, onset_s=0.004, gain=1.08)
    mix_layer(canvas, calving, onset_s=0.008, gain=0.95)
    mix_layer(canvas, lake_crack, onset_s=0.012, gain=0.90)
    mix_layer(canvas, gator, onset_s=0.020, gain=1.08)
    mix_layer(canvas, beast, onset_s=0.030, gain=0.92)
    mix_layer(canvas, cougar, onset_s=0.045, gain=0.82)
    mix_layer(canvas, field_crack, onset_s=0.060, gain=0.78)
    mix_layer(canvas, blizzard, onset_s=0.050, gain=0.62)

    return master_and_normalize(canvas, hpf_hz=36.0, warm_body_hz=128.0, warm_body_db=4.2, target_rms_db=-13.8, peak_limit_db=-0.8)


def build_dragon_fire(pitch_st: float = 0.0) -> np.ndarray:
    """
    `knight_e_fire_dragon_{wide,close}` (1.92s):
    Steel ignition + fierce apex dragon roar (`creature_tiger_roar_01.wav` +
    `creature_lion_roar_01.wav` + `creature_lion_deep_02.wav`) + volcanic sub-boom +
    1.9s roaring flamethrower & furnace afterburn tail.
    """
    dur = 1.92
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    sword = extract_slice("foley_sword_clash_01.wav", start_s=0.01, dur_s=0.62, semitones=-0.5 + pitch_st, fade_in_s=0.002, fade_out_s=0.14, hpf_hz=120.0, lpf_hz=7400.0)
    k55_sub = extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=1.45, semitones=-2.5 + pitch_st, fade_in_s=0.002, fade_out_s=0.35, hpf_hz=32.0, lpf_hz=300.0, drive=1.45)
    boom = extract_slice("fire_deflagration_boom_01.wav", start_s=0.0, dur_s=0.82, semitones=-1.5 + pitch_st, fade_in_s=0.003, fade_out_s=0.16, hpf_hz=40.0)
    tiger = extract_slice("creature_tiger_roar_01.wav", start_s=0.04, dur_s=1.68, semitones=-2.0 + pitch_st, fade_in_s=0.012, fade_out_s=0.36, hpf_hz=50.0, lpf_hz=4800.0, drive=1.38, pan_offset=-0.24)
    lion_deep = extract_slice("creature_lion_deep_02.wav", start_s=0.08, dur_s=1.72, semitones=-1.5 + pitch_st, fade_in_s=0.015, fade_out_s=0.38, hpf_hz=48.0, lpf_hz=3800.0, pan_offset=0.24)
    lion = extract_slice("creature_lion_roar_01.wav", start_s=0.10, dur_s=1.55, semitones=-1.5 + pitch_st, fade_in_s=0.020, fade_out_s=0.35, hpf_hz=65.0, lpf_hz=4400.0)
    torch = extract_slice("fire_flamethrower_burst_01.wav", start_s=0.05, dur_s=1.80, semitones=-1.0 + pitch_st, fade_in_s=0.010, fade_out_s=0.40, hpf_hz=80.0, pan_offset=-0.32)
    furnace = extract_slice("fire_fireplace_roar_03.wav", start_s=0.15, dur_s=1.82, semitones=-1.0 + pitch_st, fade_in_s=0.025, fade_out_s=0.42, hpf_hz=90.0, pan_offset=0.32)
    sub_rumble = extract_slice("fire_rumble_sub_01.wav", start_s=0.05, dur_s=1.78, semitones=-1.5, fade_in_s=0.015, fade_out_s=0.40, hpf_hz=34.0, lpf_hz=360.0)

    mix_layer(canvas, sword, onset_s=0.0, gain=0.82)
    mix_layer(canvas, k55_sub, onset_s=0.003, gain=1.08)
    mix_layer(canvas, boom, onset_s=0.008, gain=0.98)
    mix_layer(canvas, tiger, onset_s=0.020, gain=1.08)
    mix_layer(canvas, lion_deep, onset_s=0.030, gain=0.95)
    mix_layer(canvas, lion, onset_s=0.045, gain=0.84)
    mix_layer(canvas, torch, onset_s=0.015, gain=0.88)
    mix_layer(canvas, furnace, onset_s=0.050, gain=0.72)
    mix_layer(canvas, sub_rumble, onset_s=0.035, gain=0.85)

    return master_and_normalize(canvas, hpf_hz=36.0, warm_body_hz=125.0, warm_body_db=4.4, target_rms_db=-13.6, peak_limit_db=-0.8)


def build_knight_q_phase1_coil() -> np.ndarray:
    """`knight_q_phase1_coil` (0.64s): Wide stereo Ice (Left) & Fire (Right) twin-dragon awakening roar + sub vacuum pull."""
    dur = 0.64
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    whoosh = extract_slice("air_whoosh_deep_04.wav", start_s=0.18, dur_s=0.60, semitones=0.5, fade_in_s=0.005, fade_out_s=0.10, hpf_hz=65.0)
    sub_pull = extract_slice("fire_rumble_sub_01.wav", start_s=0.10, dur_s=0.58, semitones=-2.0, reverse=True, fade_in_s=0.015, fade_out_s=0.08, hpf_hz=36.0, lpf_hz=320.0)
    gator_l = extract_slice("creature_alligator_growl_01.wav", start_s=0.55, dur_s=0.60, semitones=-1.5, fade_in_s=0.010, fade_out_s=0.10, hpf_hz=50.0, pan_offset=-0.62)
    tiger_r = extract_slice("creature_tiger_roar_01.wav", start_s=0.05, dur_s=0.60, semitones=-1.0, fade_in_s=0.010, fade_out_s=0.10, hpf_hz=55.0, pan_offset=0.62)
    ice_l = extract_slice("ice_lake_fracture_01.wav", start_s=0.52, dur_s=0.58, semitones=0.0, fade_in_s=0.008, fade_out_s=0.10, hpf_hz=75.0, pan_offset=-0.50)
    fire_r = extract_slice("fire_flamethrower_burst_01.wav", start_s=0.05, dur_s=0.58, semitones=0.0, fade_in_s=0.008, fade_out_s=0.10, hpf_hz=75.0, pan_offset=0.50)
    bowl = extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=0.60, semitones=-5.0, fade_in_s=0.004, fade_out_s=0.12, hpf_hz=80.0, lpf_hz=2600.0)

    mix_layer(canvas, sub_pull, onset_s=0.0, gain=0.92)
    mix_layer(canvas, whoosh, onset_s=0.0, gain=0.95)
    mix_layer(canvas, bowl, onset_s=0.005, gain=0.68)
    mix_layer(canvas, gator_l, onset_s=0.010, gain=0.95)
    mix_layer(canvas, tiger_r, onset_s=0.010, gain=0.95)
    mix_layer(canvas, ice_l, onset_s=0.015, gain=0.80)
    mix_layer(canvas, fire_r, onset_s=0.015, gain=0.80)

    return master_and_normalize(canvas, hpf_hz=42.0, warm_body_hz=140.0, warm_body_db=3.8, target_rms_db=-14.2, peak_limit_db=-0.9)


def build_knight_q_phase2_cut1() -> np.ndarray:
    """`knight_q_phase2_cut1` (0.58s): First devastating X-slash solar-and-rime sonic cleave."""
    dur = 0.58
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    whoosh = extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=0.54, semitones=1.5, fade_in_s=0.003, fade_out_s=0.10, hpf_hz=70.0)
    whip = extract_slice("elec_whip_sonic_01.wav", start_s=0.01, dur_s=0.45, semitones=-1.0, fade_in_s=0.001, fade_out_s=0.09, hpf_hz=110.0)
    sword = extract_slice("foley_sword_clash_01.wav", start_s=0.01, dur_s=0.52, semitones=0.0, fade_in_s=0.002, fade_out_s=0.10, hpf_hz=120.0, lpf_hz=7600.0)
    torch = extract_slice("fire_flamethrower_whoosh_02.wav", start_s=0.02, dur_s=0.52, semitones=0.5, fade_in_s=0.004, fade_out_s=0.10, hpf_hz=85.0, pan_offset=-0.35)
    ice_snap = extract_slice("ice_lake_fracture_01.wav", start_s=0.52, dur_s=0.52, semitones=0.5, fade_in_s=0.003, fade_out_s=0.10, hpf_hz=80.0, pan_offset=0.35)
    punch = extract_slice("earth_artillery_punch_04.wav", start_s=0.12, dur_s=0.48, semitones=-2.0, fade_in_s=0.002, fade_out_s=0.10, hpf_hz=40.0, lpf_hz=900.0)

    mix_layer(canvas, punch, onset_s=0.0, gain=0.92)
    mix_layer(canvas, whoosh, onset_s=0.0, gain=0.95)
    mix_layer(canvas, whip, onset_s=0.002, gain=0.78)
    mix_layer(canvas, sword, onset_s=0.003, gain=0.92)
    mix_layer(canvas, torch, onset_s=0.006, gain=0.84)
    mix_layer(canvas, ice_snap, onset_s=0.008, gain=0.84)

    return master_and_normalize(canvas, hpf_hz=44.0, warm_body_hz=145.0, warm_body_db=3.8, target_rms_db=-14.0, peak_limit_db=-0.8)


def build_knight_q_phase3_crossbite() -> np.ndarray:
    """
    `knight_q_phase3_crossbite` (2.35s):
    Cataclysmic twin-dragon cross-bite climax with wide stereo scale, deep sub-bass artillery
    concussion, dual glacier/furnace roar, and 2.3s lingering harmonic tail.
    """
    dur = 2.35
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)

    k55 = extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=1.95, semitones=-2.5, fade_in_s=0.002, fade_out_s=0.45, hpf_hz=30.0, lpf_hz=2200.0, drive=1.48)
    mortar = extract_slice("earth_mortar_cannon_05.wav", start_s=0.02, dur_s=1.65, semitones=-2.5, fade_in_s=0.002, fade_out_s=0.38, hpf_hz=34.0, lpf_hz=2600.0, drive=1.42)
    boulder = extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=1.20, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.25, hpf_hz=36.0)
    calving_l = extract_slice("ice_glacier_calving_01.wav", start_s=0.80, dur_s=2.15, semitones=-2.0, fade_in_s=0.004, fade_out_s=0.48, hpf_hz=48.0, pan_offset=-0.58)
    fire_r = extract_slice("fire_flamethrower_burst_01.wav", start_s=0.05, dur_s=2.15, semitones=-1.5, fade_in_s=0.004, fade_out_s=0.48, hpf_hz=55.0, pan_offset=0.58)
    gator_l = extract_slice("creature_alligator_growl_01.wav", start_s=0.45, dur_s=2.05, semitones=-2.5, fade_in_s=0.010, fade_out_s=0.45, hpf_hz=44.0, pan_offset=-0.52)
    tiger_r = extract_slice("creature_tiger_roar_01.wav", start_s=0.04, dur_s=2.05, semitones=-2.0, fade_in_s=0.010, fade_out_s=0.45, hpf_hz=52.0, pan_offset=0.52)
    lion_c = extract_slice("creature_lion_deep_02.wav", start_s=0.06, dur_s=2.10, semitones=-2.0, fade_in_s=0.015, fade_out_s=0.48, hpf_hz=46.0, lpf_hz=3600.0)
    sub_tail = extract_slice("fire_rumble_sub_01.wav", start_s=0.05, dur_s=2.20, semitones=-2.0, fade_in_s=0.020, fade_out_s=0.52, hpf_hz=32.0, lpf_hz=340.0)
    ice_tail = extract_slice("ice_cracking_field_03.wav", start_s=0.05, dur_s=2.20, semitones=-1.0, fade_in_s=0.020, fade_out_s=0.52, hpf_hz=90.0, pan_offset=-0.38)

    mix_layer(canvas, k55, onset_s=0.0, gain=1.18)
    mix_layer(canvas, mortar, onset_s=0.003, gain=1.02)
    mix_layer(canvas, boulder, onset_s=0.005, gain=0.95)
    mix_layer(canvas, calving_l, onset_s=0.008, gain=0.92)
    mix_layer(canvas, fire_r, onset_s=0.008, gain=0.92)
    mix_layer(canvas, gator_l, onset_s=0.018, gain=0.98)
    mix_layer(canvas, tiger_r, onset_s=0.018, gain=0.98)
    mix_layer(canvas, lion_c, onset_s=0.025, gain=0.88)
    mix_layer(canvas, sub_tail, onset_s=0.040, gain=0.92)
    mix_layer(canvas, ice_tail, onset_s=0.060, gain=0.72)

    return master_and_normalize(canvas, hpf_hz=32.0, warm_body_hz=120.0, warm_body_db=4.5, target_rms_db=-13.4, peak_limit_db=-0.7)


def build_knight_q_full_composite() -> np.ndarray:
    n = int(3.05 * SR)
    canvas = np.zeros((n, 2), dtype=np.float64)
    mix_layer(canvas, build_knight_q_phase1_coil(), onset_s=0.0, gain=0.88)
    mix_layer(canvas, build_knight_q_phase2_cut1(), onset_s=0.38, gain=0.92)
    mix_layer(canvas, build_knight_q_phase3_crossbite(), onset_s=0.70, gain=1.00)
    return normalize_stereo(canvas, target_rms_db=-13.6, peak_limit_db=-0.7)


# ---------------------------------------------------------------------------
# 5. Elemental Detonations & Ghost Fallbacks (Extended 1.95s - 2.05s Iconic Reactions!)
# ---------------------------------------------------------------------------

def build_detonation_shatterblow() -> np.ndarray:
    dur = 1.95
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
    mix_layer(canvas, extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=1.55, semitones=-2.5, fade_in_s=0.002, fade_out_s=0.38, hpf_hz=32.0, lpf_hz=1600.0, drive=1.42), onset_s=0.0, gain=1.10)
    mix_layer(canvas, extract_slice("ice_lake_fracture_01.wav", start_s=2.45, dur_s=1.85, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.42, hpf_hz=38.0), onset_s=0.002, gain=1.05)
    mix_layer(canvas, extract_slice("ice_glacier_calving_01.wav", start_s=0.82, dur_s=1.85, semitones=-2.0, fade_in_s=0.004, fade_out_s=0.42, hpf_hz=42.0), onset_s=0.005, gain=0.96)
    mix_layer(canvas, extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=1.10, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.24, hpf_hz=38.0, lpf_hz=1400.0), onset_s=0.003, gain=0.94)
    mix_layer(canvas, extract_slice("ice_glass_pane_smash_01.wav", start_s=0.12, dur_s=1.25, semitones=-4.5, fade_in_s=0.004, fade_out_s=0.28, hpf_hz=130.0, lpf_hz=7200.0, pan_offset=-0.38), onset_s=0.010, gain=0.84)
    mix_layer(canvas, extract_slice("ice_cracking_field_03.wav", start_s=0.04, dur_s=1.85, semitones=-1.0, fade_in_s=0.015, fade_out_s=0.42, hpf_hz=85.0, pan_offset=0.38), onset_s=0.030, gain=0.80)
    mix_layer(canvas, extract_slice("ice_icicle_shatter_03.wav", start_s=0.04, dur_s=1.78, semitones=-2.0, fade_in_s=0.010, fade_out_s=0.40, hpf_hz=240.0, lpf_hz=7400.0), onset_s=0.045, gain=0.72)
    return master_and_normalize(canvas, hpf_hz=34.0, warm_body_hz=125.0, warm_body_db=4.4, target_rms_db=-13.6, peak_limit_db=-0.7)


def build_detonation_solar_flare() -> np.ndarray:
    dur = 1.95
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
    mix_layer(canvas, extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=1.60, semitones=-2.5, fade_in_s=0.002, fade_out_s=0.38, hpf_hz=32.0, lpf_hz=1800.0, drive=1.45), onset_s=0.0, gain=1.12)
    mix_layer(canvas, extract_slice("fire_deflagration_boom_01.wav", start_s=0.0, dur_s=0.88, semitones=-2.0, fade_in_s=0.002, fade_out_s=0.18, hpf_hz=38.0), onset_s=0.002, gain=1.08)
    mix_layer(canvas, extract_slice("earth_mortar_cannon_05.wav", start_s=0.02, dur_s=1.45, semitones=-2.0, fade_in_s=0.003, fade_out_s=0.32, hpf_hz=38.0, lpf_hz=2600.0), onset_s=0.004, gain=0.96)
    mix_layer(canvas, extract_slice("fire_flamethrower_burst_01.wav", start_s=0.06, dur_s=1.82, semitones=-1.5, fade_in_s=0.010, fade_out_s=0.42, hpf_hz=75.0, pan_offset=-0.42), onset_s=0.012, gain=0.90)
    mix_layer(canvas, extract_slice("fire_fireplace_roar_03.wav", start_s=0.15, dur_s=1.85, semitones=-1.0, fade_in_s=0.020, fade_out_s=0.44, hpf_hz=85.0, pan_offset=0.42), onset_s=0.030, gain=0.78)
    mix_layer(canvas, extract_slice("fire_rumble_sub_01.wav", start_s=0.05, dur_s=1.85, semitones=-2.0, fade_in_s=0.015, fade_out_s=0.44, hpf_hz=32.0, lpf_hz=360.0), onset_s=0.020, gain=0.92)
    mix_layer(canvas, extract_slice("earth_rockfall_slide_01.wav", start_s=0.02, dur_s=1.78, semitones=-0.5, fade_in_s=0.012, fade_out_s=0.40, hpf_hz=160.0), onset_s=0.045, gain=0.68)
    return master_and_normalize(canvas, hpf_hz=34.0, warm_body_hz=125.0, warm_body_db=4.4, target_rms_db=-13.6, peak_limit_db=-0.7)


def build_detonation_thunderchain() -> np.ndarray:
    dur = 2.05
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
    mix_layer(canvas, extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=1.65, semitones=-2.5, fade_in_s=0.002, fade_out_s=0.38, hpf_hz=32.0, lpf_hz=1600.0, drive=1.45), onset_s=0.0, gain=1.12)
    mix_layer(canvas, extract_slice("elec_whip_sonic_01.wav", start_s=0.01, dur_s=0.62, semitones=-1.0, fade_in_s=0.001, fade_out_s=0.12, hpf_hz=85.0, drive=1.35), onset_s=0.001, gain=1.02)
    mix_layer(canvas, extract_slice("elec_thunder_crack_close_01.wav", start_s=0.01, dur_s=1.95, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.42, hpf_hz=38.0, pan_offset=-0.35), onset_s=0.003, gain=1.08)
    mix_layer(canvas, extract_slice("elec_thunder_clap_roll_03.wav", start_s=0.02, dur_s=1.98, semitones=-2.0, fade_in_s=0.005, fade_out_s=0.45, hpf_hz=36.0, pan_offset=0.35), onset_s=0.012, gain=1.02)
    mix_layer(canvas, extract_slice("elec_hv_arc_01.wav", start_s=0.04, dur_s=1.55, semitones=-1.0, fade_in_s=0.006, fade_out_s=0.36, hpf_hz=140.0, lpf_hz=7200.0), onset_s=0.020, gain=0.76)
    mix_layer(canvas, extract_slice("earth_artillery_punch_04.wav", start_s=0.12, dur_s=0.85, semitones=-2.0, fade_in_s=0.002, fade_out_s=0.18, hpf_hz=38.0, lpf_hz=1200.0), onset_s=0.004, gain=0.95)
    return master_and_normalize(canvas, hpf_hz=34.0, warm_body_hz=125.0, warm_body_db=4.4, target_rms_db=-13.6, peak_limit_db=-0.7)


# ---------------------------------------------------------------------------
# 6. Dedicated Hero & Monster Death Foley (`death_foley_*`) + Enemy Attack Foley
# ---------------------------------------------------------------------------

def build_death_foley(archetype: str) -> np.ndarray:
    if archetype == "knight":
        dur = 0.82
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        mix_layer(canvas, extract_slice("foley_scrap_metal_crash_02.wav", start_s=0.0, dur_s=0.72, semitones=-1.0, fade_in_s=0.003, fade_out_s=0.14, hpf_hz=70.0, lpf_hz=7200.0), onset_s=0.0, gain=0.92)
        mix_layer(canvas, extract_slice("foley_sword_clash_01.wav", start_s=0.02, dur_s=0.55, semitones=-1.5, fade_in_s=0.003, fade_out_s=0.12, hpf_hz=150.0, pan_offset=0.25), onset_s=0.09, gain=0.75)
        mix_layer(canvas, extract_slice("foley_armor_drop_03.wav", start_s=0.0, dur_s=0.46, semitones=-1.0, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=65.0, pan_offset=-0.20), onset_s=0.22, gain=0.95)
        mix_layer(canvas, extract_slice("earth_boulder_roll_02.wav", start_s=0.02, dur_s=0.52, semitones=-1.0, fade_in_s=0.004, fade_out_s=0.10, hpf_hz=48.0, lpf_hz=900.0), onset_s=0.26, gain=0.90)
        return master_and_normalize(canvas, hpf_hz=50.0, warm_body_hz=155.0, warm_body_db=3.5, target_rms_db=-15.8, peak_limit_db=-1.1)

    if archetype == "mage":
        dur = 0.72
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        mix_layer(canvas, extract_slice("foley_wood_staff_clatter_01.wav", start_s=0.0, dur_s=0.66, semitones=0.0, fade_in_s=0.003, fade_out_s=0.12, hpf_hz=85.0), onset_s=0.0, gain=0.98)
        mix_layer(canvas, extract_slice("ice_icicle_shatter_03.wav", start_s=0.05, dur_s=0.52, semitones=-2.0, fade_in_s=0.005, fade_out_s=0.12, hpf_hz=280.0, lpf_hz=6800.0), onset_s=0.04, gain=0.55)
        mix_layer(canvas, extract_slice("earth_boulder_roll_02.wav", start_s=0.02, dur_s=0.48, semitones=1.0, fade_in_s=0.006, fade_out_s=0.10, hpf_hz=60.0, lpf_hz=800.0), onset_s=0.20, gain=0.82)
        return master_and_normalize(canvas, hpf_hz=60.0, warm_body_hz=165.0, warm_body_db=3.2, target_rms_db=-16.4, peak_limit_db=-1.2)

    if archetype == "skeleton_pile":
        dur = 0.62
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        mix_layer(canvas, extract_slice("foley_bones_snap_04.wav", start_s=0.0, dur_s=0.45, semitones=0.0, fade_in_s=0.002, fade_out_s=0.08, hpf_hz=90.0), onset_s=0.0, gain=0.88)
        mix_layer(canvas, extract_slice("foley_bones_rattle_01.wav", start_s=0.0, dur_s=0.58, semitones=0.0, fade_in_s=0.003, fade_out_s=0.10, hpf_hz=85.0), onset_s=0.02, gain=1.00)
        return master_and_normalize(canvas, hpf_hz=75.0, warm_body_hz=185.0, warm_body_db=3.0, target_rms_db=-16.2, peak_limit_db=-1.2)

    if archetype == "skeleton_shatter":
        dur = 0.68
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        mix_layer(canvas, extract_slice("foley_bones_skull_05.wav", start_s=0.0, dur_s=0.52, semitones=-1.0, fade_in_s=0.002, fade_out_s=0.09, hpf_hz=75.0), onset_s=0.0, gain=0.95)
        mix_layer(canvas, extract_slice("foley_bones_rattle_01.wav", start_s=0.0, dur_s=0.64, semitones=-0.5, fade_in_s=0.003, fade_out_s=0.12, hpf_hz=80.0), onset_s=0.015, gain=1.00)
        mix_layer(canvas, extract_slice("foley_armor_drop_04.wav", start_s=0.0, dur_s=0.52, semitones=0.5, fade_in_s=0.004, fade_out_s=0.10, hpf_hz=90.0), onset_s=0.08, gain=0.72)
        return master_and_normalize(canvas, hpf_hz=68.0, warm_body_hz=175.0, warm_body_db=3.2, target_rms_db=-15.8, peak_limit_db=-1.1)

    if archetype in ("orc", "werewolf"):
        dur = 0.66
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        st = -1.5 if archetype == "orc" else 0.5
        mix_layer(canvas, extract_slice("foley_bones_skull_05.wav", start_s=0.0, dur_s=0.48, semitones=st, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=70.0), onset_s=0.0, gain=0.82)
        mix_layer(canvas, extract_slice("foley_armor_drop_04.wav", start_s=0.0, dur_s=0.55, semitones=st, fade_in_s=0.004, fade_out_s=0.10, hpf_hz=65.0), onset_s=0.06, gain=0.85)
        mix_layer(canvas, extract_slice("earth_boulder_roll_02.wav", start_s=0.0, dur_s=0.56, semitones=st, fade_in_s=0.004, fade_out_s=0.10, hpf_hz=45.0, lpf_hz=1200.0), onset_s=0.10, gain=1.00)
        return master_and_normalize(canvas, hpf_hz=48.0, warm_body_hz=150.0, warm_body_db=3.6, target_rms_db=-15.8, peak_limit_db=-1.1)

    if archetype == "black_knight":
        dur = 0.80
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        mix_layer(canvas, extract_slice("foley_metal_plate_drop_01.wav", start_s=0.0, dur_s=0.74, semitones=-2.5, fade_in_s=0.003, fade_out_s=0.14, hpf_hz=60.0, lpf_hz=6800.0), onset_s=0.0, gain=0.95)
        mix_layer(canvas, extract_slice("foley_armor_drop_03.wav", start_s=0.0, dur_s=0.46, semitones=-2.0, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=55.0), onset_s=0.14, gain=0.95)
        mix_layer(canvas, extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=0.62, semitones=-1.0, fade_in_s=0.004, fade_out_s=0.12, hpf_hz=42.0, lpf_hz=1400.0), onset_s=0.18, gain=0.92)
        return master_and_normalize(canvas, hpf_hz=45.0, warm_body_hz=145.0, warm_body_db=3.8, target_rms_db=-15.4, peak_limit_db=-1.0)

    if archetype == "plant":
        dur = 0.64
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        mix_layer(canvas, extract_slice("foley_bones_crack_02.wav", start_s=0.0, dur_s=0.56, semitones=-2.0, fade_in_s=0.003, fade_out_s=0.10, hpf_hz=75.0), onset_s=0.0, gain=0.92)
        mix_layer(canvas, extract_slice("foley_wood_planks_02.wav", start_s=0.05, dur_s=0.58, semitones=-1.5, fade_in_s=0.004, fade_out_s=0.12, hpf_hz=70.0), onset_s=0.04, gain=0.95)
        mix_layer(canvas, extract_slice("earth_boulder_roll_02.wav", start_s=0.0, dur_s=0.50, semitones=0.0, fade_in_s=0.005, fade_out_s=0.10, hpf_hz=55.0, lpf_hz=1100.0), onset_s=0.12, gain=0.85)
        return master_and_normalize(canvas, hpf_hz=55.0, warm_body_hz=160.0, warm_body_db=3.4, target_rms_db=-16.0, peak_limit_db=-1.1)

    if archetype == "necromancer":
        dur = 0.72
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        mix_layer(canvas, extract_slice("foley_wood_staff_clatter_01.wav", start_s=0.0, dur_s=0.65, semitones=-2.0, fade_in_s=0.003, fade_out_s=0.12, hpf_hz=75.0), onset_s=0.0, gain=0.92)
        mix_layer(canvas, extract_slice("foley_bones_rattle_01.wav", start_s=0.0, dur_s=0.62, semitones=-1.5, fade_in_s=0.004, fade_out_s=0.12, hpf_hz=80.0), onset_s=0.04, gain=0.88)
        mix_layer(canvas, extract_slice("ice_blizzard_whistle_01.wav", start_s=0.50, dur_s=0.64, semitones=-4.0, fade_in_s=0.015, fade_out_s=0.16, hpf_hz=90.0, lpf_hz=2800.0), onset_s=0.02, gain=0.68)
        return master_and_normalize(canvas, hpf_hz=58.0, warm_body_hz=160.0, warm_body_db=3.4, target_rms_db=-16.0, peak_limit_db=-1.1)

    if archetype == "boss_brute":
        dur = 0.96
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        mix_layer(canvas, extract_slice("foley_metal_plate_drop_01.wav", start_s=0.0, dur_s=0.75, semitones=-3.5, fade_in_s=0.004, fade_out_s=0.15, hpf_hz=55.0), onset_s=0.02, gain=0.88)
        mix_layer(canvas, extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=0.85, semitones=-2.5, fade_in_s=0.003, fade_out_s=0.16, hpf_hz=36.0, drive=1.45), onset_s=0.16, gain=1.10)
        mix_layer(canvas, extract_slice("earth_debris_collapse_03.wav", start_s=0.02, dur_s=0.88, semitones=-2.0, fade_in_s=0.010, fade_out_s=0.18, hpf_hz=42.0), onset_s=0.04, gain=0.92)
        return master_and_normalize(canvas, hpf_hz=38.0, warm_body_hz=130.0, warm_body_db=4.0, target_rms_db=-14.8, peak_limit_db=-0.8)

    # boss_golem
    dur = 0.98
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
    mix_layer(canvas, extract_slice("ice_glacier_calving_01.wav", start_s=0.85, dur_s=0.92, semitones=-3.0, fade_in_s=0.004, fade_out_s=0.18, hpf_hz=40.0, drive=1.4), onset_s=0.0, gain=1.05)
    mix_layer(canvas, extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=0.88, semitones=-2.0, fade_in_s=0.003, fade_out_s=0.16, hpf_hz=38.0), onset_s=0.08, gain=1.05)
    mix_layer(canvas, extract_slice("ice_block_break_02.wav", start_s=0.0, dur_s=0.86, semitones=-2.5, fade_in_s=0.004, fade_out_s=0.16, hpf_hz=70.0), onset_s=0.02, gain=0.90)
    mix_layer(canvas, extract_slice("earth_rock_debris_02.wav", start_s=0.0, dur_s=0.88, semitones=-1.5, fade_in_s=0.010, fade_out_s=0.18, hpf_hz=140.0), onset_s=0.12, gain=0.78)
    return master_and_normalize(canvas, hpf_hz=38.0, warm_body_hz=135.0, warm_body_db=4.0, target_rms_db=-14.8, peak_limit_db=-0.8)


def build_enemy_attack_foley(kind: str) -> np.ndarray:
    if kind == "skeleton_warrior":
        dur = 0.36
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        mix_layer(canvas, extract_slice("foley_bones_snap_04.wav", start_s=0.0, dur_s=0.28, semitones=1.0, fade_in_s=0.002, fade_out_s=0.06, hpf_hz=110.0), onset_s=0.0, gain=0.78)
        mix_layer(canvas, extract_slice("air_whoosh_deep_04.wav", start_s=0.24, dur_s=0.32, semitones=2.0, fade_in_s=0.004, fade_out_s=0.06, hpf_hz=95.0), onset_s=0.03, gain=0.90)
        return master_and_normalize(canvas, hpf_hz=80.0, warm_body_hz=175.0, warm_body_db=3.0, target_rms_db=-16.6, peak_limit_db=-1.3)

    if kind == "werewolf":
        dur = 0.40
        canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
        mix_layer(canvas, extract_slice("creature_dog_growl_01.wav", start_s=0.15, dur_s=0.36, semitones=-1.5, fade_in_s=0.005, fade_out_s=0.07, hpf_hz=85.0), onset_s=0.0, gain=0.88)
        mix_layer(canvas, extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=0.35, semitones=1.5, fade_in_s=0.004, fade_out_s=0.06, hpf_hz=90.0), onset_s=0.04, gain=0.92)
        return master_and_normalize(canvas, hpf_hz=75.0, warm_body_hz=170.0, warm_body_db=3.2, target_rms_db=-16.4, peak_limit_db=-1.2)

    # boss_brute slam
    dur = 0.62
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
    mix_layer(canvas, extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=0.58, semitones=-1.5, fade_in_s=0.003, fade_out_s=0.12, hpf_hz=40.0, drive=1.35), onset_s=0.0, gain=1.05)
    mix_layer(canvas, extract_slice("earth_stone_crash_02.wav", start_s=0.0, dur_s=0.56, semitones=-1.0, fade_in_s=0.004, fade_out_s=0.12, hpf_hz=65.0), onset_s=0.015, gain=0.85)
    return master_and_normalize(canvas, hpf_hz=42.0, warm_body_hz=140.0, warm_body_db=3.8, target_rms_db=-15.2, peak_limit_db=-0.9)


def build_player_hit_heavy() -> np.ndarray:
    dur = 0.44
    canvas = np.zeros((int(dur * SR), 2), dtype=np.float64)
    mix_layer(canvas, extract_slice("earth_artillery_punch_04.wav", start_s=0.14, dur_s=0.40, semitones=-1.0, fade_in_s=0.002, fade_out_s=0.08, hpf_hz=45.0, lpf_hz=1200.0, drive=1.35), onset_s=0.0, gain=1.00)
    mix_layer(canvas, extract_slice("foley_armor_drop_03.wav", start_s=0.0, dur_s=0.38, semitones=0.0, fade_in_s=0.002, fade_out_s=0.08, hpf_hz=90.0), onset_s=0.005, gain=0.82)
    return master_and_normalize(canvas, hpf_hz=45.0, warm_body_hz=145.0, warm_body_db=3.8, target_rms_db=-15.4, peak_limit_db=-1.0)


def build_footstep_cobble(variant: int) -> np.ndarray:
    dur = 0.20
    st = [-0.5, 0.4, -0.2, 0.8][variant % 4]
    step = extract_slice("earth_stone_fall_close_03.wav", start_s=0.02 + (variant % 4) * 0.45, dur_s=dur, semitones=st, fade_in_s=0.002, fade_out_s=0.04, hpf_hz=95.0, lpf_hz=5800.0)
    return master_and_normalize(step, hpf_hz=95.0, warm_body_hz=185.0, warm_body_db=2.6, target_rms_db=-19.0, peak_limit_db=-2.2)


def build_sculpted_death_voice(src_mp3: Path, stretch: float = 1.24, pitch_drop: float = 0.88) -> np.ndarray:
    tmp_wav = src_mp3.with_suffix(".decode_tmp.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src_mp3), "-ar", str(SR), "-ac", "2", str(tmp_wav)],
        check=True,
    )
    data, _ = sf.read(str(tmp_wav), always_2d=True)
    if tmp_wav.exists():
        tmp_wav.unlink()

    mono = np.mean(data, axis=1).astype(np.float64)
    n_in = len(mono)
    n_out = max(128, int(n_in * stretch / pitch_drop))
    u = np.linspace(0.0, 1.0, n_out)
    phase = (0.94 * u + 0.06 * (u ** 1.65)) * (n_in - 1)
    idx0 = np.clip(np.floor(phase).astype(np.int64), 0, n_in - 2)
    frac = phase - idx0
    warped = (1.0 - frac) * mono[idx0] + frac * mono[idx0 + 1]

    t = np.arange(n_out, dtype=np.float64) / SR
    dur = n_out / SR
    env = smoothstep(0.0, 0.012, t) * (1.0 - smoothstep(dur * 0.68, dur, t))
    warped = cinema_warm_master_eq(warped * env, hpf_hz=85.0, warm_body_hz=175.0, warm_body_db=3.2, box_scoop_db=-5.5, lpf_hz=7800.0)
    stereo = outdoor_valley_early_reflections(pan_stereo(warped, np.zeros(n_out)), wet=0.06)
    return normalize_stereo(stereo, target_rms_db=-16.5, peak_limit_db=-1.4)


def main() -> None:
    report: Dict[str, Dict[str, float]] = {}

    def register(name: str, audio: np.ndarray, rel_targets: List[Path]) -> None:
        metrics = export_mp3_and_wav(audio, rel_targets)
        report[name] = metrics
        print(
            f"  [OK] {name:<38} dur={metrics['duration_s']:<5}s  rms={metrics['rms_dbfs']:>6} dBFS  peak={metrics['peak_dbfs']:>5} dBFS  crest={metrics['crest_db']:>5} dB  centroid={metrics['centroid_hz']:>6} Hz"
        )

    print("=== Assembling Real Acoustic Element SFX & Death Foley Bank (70 Verified Raw Stems) ===")

    # 1. Mage Bolts & Nova (Cast + Impact)
    for step in (1, 2, 3):
        register(
            f"mage_bolt_cast_{step}",
            build_mage_bolt_cast(step),
            [
                GAME_SFX_DIR / "mage" / f"mage_bolt_cast_{step}.mp3",
                GAME_SFX_DIR / "mage" / f"mage_bolt_combo{step}.mp3",
                MAGE_LAB_CURATED / f"mage_bolt_combo{step}.mp3",
                SWORD_LAB_BANK / f"mage_bolt_cast_{step}.mp3",
            ],
        )
        register(
            f"mage_bolt_impact_{step}",
            build_mage_bolt_impact(step),
            [
                GAME_SFX_DIR / "mage" / f"mage_bolt_impact_{step}.mp3",
                SWORD_LAB_BANK / f"mage_bolt_impact_{step}.mp3",
            ],
        )

    register(
        "mage_bolt_nova_cast",
        build_mage_bolt_nova_cast(),
        [
            GAME_SFX_DIR / "mage" / "mage_bolt_nova_cast.mp3",
            GAME_SFX_DIR / "mage" / "mage_bolt_combo4_nova.mp3",
            MAGE_LAB_CURATED / "mage_bolt_combo4_nova.mp3",
            SWORD_LAB_BANK / "mage_bolt_nova_cast.mp3",
        ],
    )
    register(
        "mage_nova_impact",
        build_mage_bolt_impact(4),
        [
            GAME_SFX_DIR / "mage" / "mage_nova_impact.mp3",
            SWORD_LAB_BANK / "mage_nova_impact.mp3",
        ],
    )

    # 2. Mage [E] Spells & [Hold-LMB] Shatterlance
    register(
        "spell_frost_lance_cast",
        build_spell_frost_lance_cast(),
        [
            GAME_SFX_DIR / "mage" / "spell_frost_lance_cast.mp3",
            GAME_SFX_DIR / "mage" / "mage_e_frost_lance_corridor.mp3",
            MAGE_LAB_CURATED / "mage_e_frost_lance_corridor.mp3",
        ],
    )
    register(
        "spell_frost_lance_erupt",
        build_spell_frost_lance_erupt(),
        [
            GAME_SFX_DIR / "mage" / "spell_frost_lance_erupt.mp3",
            GAME_SFX_DIR / "mage" / "mage_e_frost_lance_apex_close.mp3",
            MAGE_LAB_CURATED / "mage_e_frost_lance_apex_close.mp3",
        ],
    )
    register(
        "spell_shatterlance_charge",
        build_spell_shatterlance_charge(),
        [
            GAME_SFX_DIR / "mage" / "mage_shatterlance_charge.mp3",
            MAGE_LAB_CURATED / "mage_shatterlance_charge.mp3",
        ],
    )
    register(
        "spell_shatterlance_release",
        build_spell_shatterlance_release(),
        [
            GAME_SFX_DIR / "mage" / "spell_shatterlance_release.mp3",
            GAME_SFX_DIR / "mage" / "mage_shatterlance_launch_shatter.mp3",
            MAGE_LAB_CURATED / "mage_shatterlance_launch_shatter.mp3",
        ],
    )
    register(
        "spell_shatterlance_impact",
        build_spell_shatterlance_impact(),
        [GAME_SFX_DIR / "mage" / "spell_shatterlance_impact.mp3"],
    )
    register(
        "spell_cinder_fall_launch",
        build_spell_cinder_fall_launch(),
        [
            GAME_SFX_DIR / "mage" / "spell_cinder_fall_launch.mp3",
            GAME_SFX_DIR / "mage" / "mage_e_cinder_fall_wide.mp3",
            MAGE_LAB_CURATED / "mage_e_cinder_fall_wide.mp3",
        ],
    )
    register(
        "spell_cinder_fall_impact",
        build_spell_cinder_fall_impact(),
        [
            GAME_SFX_DIR / "mage" / "spell_cinder_fall_impact.mp3",
            GAME_SFX_DIR / "mage" / "mage_e_cinder_fall_impact_close.mp3",
            MAGE_LAB_CURATED / "mage_e_cinder_fall_impact_close.mp3",
        ],
    )

    # 3. Mage [Q] Starfall Seal & Meteor (Sky-Tear -> Bedrock Crater Slam)
    register(
        "mage_q_starfall_seal",
        build_mage_q_starfall_seal(),
        [
            GAME_SFX_DIR / "mage" / "mage_q_starfall_invocation.mp3",
            MAGE_LAB_CURATED / "mage_q_starfall_invocation.mp3",
        ],
    )
    register(
        "mage_q_starfall_meteor",
        build_mage_q_starfall_meteor(),
        [
            GAME_SFX_DIR / "mage" / "mage_q_starfall_single_meteor.mp3",
            MAGE_LAB_CURATED / "mage_q_starfall_single_meteor.mp3",
        ],
    )

    # 4. Sword Dragons ([E]) & Knight [Q] Twin-Element Ult
    register(
        "knight_e_ice_dragon_wide",
        build_dragon_ice(0.0),
        [
            GAME_SFX_DIR / "dragons" / "knight_e_ice_dragon_wide.mp3",
            MAGE_LAB_CURATED / "knight_e_ice_dragon_wide.mp3",
            SWORD_LAB_BANK / "dragon_glacial_tide_ignite.mp3",
        ],
    )
    register(
        "knight_e_ice_dragon_close",
        build_dragon_ice(0.8),
        [
            GAME_SFX_DIR / "dragons" / "knight_e_ice_dragon_close.mp3",
            MAGE_LAB_CURATED / "knight_e_ice_dragon_close.mp3",
        ],
    )
    register(
        "knight_e_fire_dragon_wide",
        build_dragon_fire(0.0),
        [
            GAME_SFX_DIR / "dragons" / "knight_e_fire_dragon_wide.mp3",
            MAGE_LAB_CURATED / "knight_e_fire_dragon_wide.mp3",
            SWORD_LAB_BANK / "dragon_hinokami_sunfire_ignite.mp3",
        ],
    )
    register(
        "knight_e_fire_dragon_close",
        build_dragon_fire(0.8),
        [
            GAME_SFX_DIR / "dragons" / "knight_e_fire_dragon_close.mp3",
            MAGE_LAB_CURATED / "knight_e_fire_dragon_close.mp3",
        ],
    )
    register("knight_q_phase1_coil", build_knight_q_phase1_coil(), [GAME_SFX_DIR / "dragons" / "knight_q_phase1_coil.mp3"])
    register("knight_q_phase2_cut1", build_knight_q_phase2_cut1(), [GAME_SFX_DIR / "dragons" / "knight_q_phase2_cut1.mp3"])
    register("knight_q_phase3_crossbite", build_knight_q_phase3_crossbite(), [GAME_SFX_DIR / "dragons" / "knight_q_phase3_crossbite.mp3"])
    register(
        "knight_q_twin_dragon_wide",
        build_knight_q_full_composite(),
        [
            GAME_SFX_DIR / "dragons" / "knight_q_twin_dragon_wide.mp3",
            GAME_SFX_DIR / "dragons" / "knight_q_twin_dragon_close.mp3",
            MAGE_LAB_CURATED / "knight_q_twin_dragon_wide.mp3",
            MAGE_LAB_CURATED / "knight_q_twin_dragon_close.mp3",
            SWORD_LAB_BANK / "knight_q_twin_element_awakening.mp3",
        ],
    )

    # 5. Elemental Detonations
    register(
        "detonation_shatterblow",
        build_detonation_shatterblow(),
        [
            GAME_SFX_DIR / "detonations" / "detonation_shatterblow.mp3",
            MAGE_LAB_CURATED / "detonation_shatterblow.mp3",
        ],
    )
    register(
        "detonation_solar_flare",
        build_detonation_solar_flare(),
        [
            GAME_SFX_DIR / "detonations" / "detonation_solar_flare.mp3",
            MAGE_LAB_CURATED / "detonation_solar_flare.mp3",
        ],
    )
    register(
        "detonation_thunderchain",
        build_detonation_thunderchain(),
        [
            GAME_SFX_DIR / "detonations" / "detonation_thunderchain.mp3",
            MAGE_LAB_CURATED / "detonation_thunderchain.mp3",
        ],
    )

    # 6. Cobblestone footsteps, heavy player hit, enemy foley
    for idx in range(1, 5):
        register(
            f"footstep_cobble_{idx}",
            build_footstep_cobble(idx - 1),
            [GAME_SFX_DIR / "foley" / f"footstep_cobble_{idx}.mp3"],
        )
    register(
        "player_hit_damage_thud",
        build_player_hit_heavy(),
        [
            GAME_SFX_DIR / "impacts" / "player_hit_damage_thud.mp3",
            MAGE_LAB_CURATED / "player_hit_damage_thud.mp3",
        ],
    )
    register(
        "enemy_skeleton_warrior_shield_and_chop",
        build_enemy_attack_foley("skeleton_warrior"),
        [
            GAME_SFX_DIR / "enemies" / "enemy_skeleton_warrior_shield_and_chop.mp3",
            MAGE_LAB_CURATED / "enemy_skeleton_warrior_shield_and_chop.mp3",
        ],
    )
    register(
        "enemy_werewolf_stalk_and_pounce",
        build_enemy_attack_foley("werewolf"),
        [
            GAME_SFX_DIR / "enemies" / "enemy_werewolf_stalk_and_pounce.mp3",
            MAGE_LAB_CURATED / "enemy_werewolf_stalk_and_pounce.mp3",
        ],
    )
    register(
        "boss_orc_brute_slam",
        build_enemy_attack_foley("boss_brute"),
        [
            GAME_SFX_DIR / "enemies" / "boss_orc_brute_slam.mp3",
            MAGE_LAB_CURATED / "boss_orc_brute_slam.mp3",
        ],
    )

    # 7. Dedicated Character & Monster Physical Death Foley
    for arch in (
        "knight",
        "mage",
        "skeleton_pile",
        "skeleton_shatter",
        "orc",
        "werewolf",
        "black_knight",
        "plant",
        "necromancer",
        "boss_brute",
        "boss_golem",
    ):
        register(
            f"death_foley_{arch}",
            build_death_foley(arch),
            [
                GAME_SFX_DIR / "deaths" / f"death_foley_{arch}.mp3",
                SWORD_LAB_BANK / f"death_foley_{arch}.mp3",
            ],
        )

    # 8. Sculpted Hero & Monster Death Vocalizations
    death_voice_recipes = [
        ("knight_enzo__death", "knight_enzo__hurt_1.mp3", 1.28, 0.87),
        ("mage_lumi__death", "mage_lumi__hurt_1.mp3", 1.25, 0.88),
        ("skeleton_warrior__death", "skeleton_warrior__hurt.mp3", 1.15, 0.86),
        ("skeleton_minion__death", "skeleton_minion__hurt.mp3", 1.22, 0.85),
        ("orc_raider__death", "orc_raider__hurt.mp3", 1.32, 0.84),
        ("plant_warrior__death", "plant_warrior__hurt.mp3", 1.26, 0.86),
        ("werewolf__death", "werewolf__yelp.mp3", 1.35, 0.82),
        ("black_knight__death", "black_knight__hurt.mp3", 1.34, 0.83),
        ("necromancer__death", "necromancer__hurt.mp3", 1.28, 0.84),
        ("boss_brute__death", "boss_brute__hurt.mp3", 1.24, 0.82),
        ("boss_frost_golem__death", "boss_frost_golem__hurt.mp3", 1.26, 0.80),
    ]
    for d_name, src_file, stretch, p_drop in death_voice_recipes:
        src_p = VOICES_SLICED_DIR / src_file
        if src_p.exists():
            register(
                d_name,
                build_sculpted_death_voice(src_p, stretch=stretch, pitch_drop=p_drop),
                [
                    GAME_SFX_DIR / "voices" / f"{d_name}.mp3",
                    VOICES_SLICED_DIR / f"{d_name}.mp3",
                ],
            )

    manifest_out = GAME_SFX_DIR / "code_sfx_bank_report.json"
    manifest_out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\n=== Saved {len(report)} Real-Element Physical SFX & Death Cues -> {manifest_out} ===")


if __name__ == "__main__":
    main()
