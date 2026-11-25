#!/usr/bin/env python3
"""
sfx-foley/harness/sculpt_character_voices_v3.py

Transforms raw dry 48kHz studio vocal stems (`v2_*_raw.mp3`) into non-human,
character-accurate game creature & stylized chibi hero voices (`v3_*.mp3`)
matching the actual KayKit 3D models (Skeletons, PlantWarrior Deku Sprite,
Green Goblin, Red-Shirt Wolf, Plumed BlackKnight, Necromancer, OrcBrute/FrostGolem,
Toon Chibi Knight & Witch).

Uses zero API calls: combines ffmpeg Rubberband (`formant=shifted/preserved`)
with physical acoustic resonators, gated beast subharmonics, reverse shadow echoes,
helmet cavity convolution, and transient-synced bone/leaf/armor foley.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
import soundfile as sf

SR = 48000
ROOT = Path("C:/Users/silen/projects/kilo-3d-kit")
OUT_DIR = ROOT / "sfx-foley" / "tts-test"
WORLD_DIR = ROOT / "world" / "assets" / "audio" / "tts-test"
MANIFEST_PATH = OUT_DIR / "audition_v3_manifest.json"


# ---------------------------------------------------------------------------
# Core DSP Primitives
# ---------------------------------------------------------------------------

def load_wav_48k(src_mp3: Path) -> np.ndarray:
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "in.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src_mp3), "-ar", str(SR), "-ac", "1", str(wav)],
            check=True,
        )
        x, _ = sf.read(str(wav))
        return x.astype(np.float64)


def rubberband_morph(x: np.ndarray, pitch_st: float, formant_scale: float | None = None, tempo: float = 1.0) -> np.ndarray:
    """
    Use ffmpeg Rubberband for crystal-clear pitch and vocal-tract formant scaling.
    When `formant_scale` is None, shifts formants together with pitch (`formant=shifted`),
    which cleanly shrinks/enlarges physical head/vocal-tract anatomy in one clean pass.
    """
    p_ratio = 2.0 ** (pitch_st / 12.0)
    with tempfile.TemporaryDirectory() as td:
        in_w = Path(td) / "in.wav"
        mid_w = Path(td) / "mid.wav"
        out_w = Path(td) / "out.wav"
        sf.write(str(in_w), np.clip(x, -0.99, 0.99).astype(np.float32), SR, subtype="PCM_16")

        if formant_scale is None or abs(formant_scale - p_ratio) < 0.03:
            flt = (
                f"rubberband=pitch={p_ratio:.5f}:tempo={tempo:.5f}:"
                "formant=shifted:pitchq=quality:transients=crisp:detector=compound:phase=laminar:smoothing=on"
            )
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(in_w), "-af", flt, str(out_w)], check=True)
        else:
            # Independent vocal-tract anatomy (formant_scale) vs vocal-cord pitch (p_ratio)
            flt1 = (
                f"rubberband=pitch={formant_scale:.5f}:tempo=1.0:"
                "formant=shifted:pitchq=quality:transients=crisp:smoothing=on"
            )
            p_corr = p_ratio / max(formant_scale, 0.25)
            flt2 = (
                f"rubberband=pitch={p_corr:.5f}:tempo={tempo:.5f}:"
                "formant=preserved:pitchq=quality:transients=crisp:smoothing=on"
            )
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(in_w), "-af", flt1, str(mid_w)], check=True)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mid_w), "-af", flt2, str(out_w)], check=True)

        y, _ = sf.read(str(out_w))
        return y.astype(np.float64)


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


def match_len(a: np.ndarray, n: int) -> np.ndarray:
    if len(a) == n:
        return a
    if len(a) > n:
        return a[:n]
    out = np.zeros(n, dtype=a.dtype)
    out[: len(a)] = a
    return out


def butter_hp(sig: np.ndarray, fc: float, order: int = 4) -> np.ndarray:
    sos = signal.butter(order, fc, btype="highpass", fs=SR, output="sos")
    return signal.sosfiltfilt(sos, sig)


def butter_lp(sig: np.ndarray, fc: float, order: int = 4) -> np.ndarray:
    sos = signal.butter(order, fc, btype="lowpass", fs=SR, output="sos")
    return signal.sosfiltfilt(sos, sig)


def butter_bp(sig: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, [lo, hi], btype="bandpass", fs=SR, output="sos")
    return signal.sosfiltfilt(sos, sig)


def smooth_env(x: np.ndarray, att_ms: float = 4.0, rel_ms: float = 80.0) -> np.ndarray:
    att = math.exp(-1.0 / (max(att_ms, 0.5) * 0.001 * SR))
    rel = math.exp(-1.0 / (max(rel_ms, 1.0) * 0.001 * SR))
    out = np.zeros_like(x)
    cur = 0.0
    ax = np.abs(x)
    for i in range(len(x)):
        v = ax[i]
        cur = att * cur + (1.0 - att) * v if v > cur else rel * cur + (1.0 - rel) * v
        out[i] = cur
    return out


def modal_bank(x: np.ndarray, modes: list[tuple[float, float, float]]) -> np.ndarray:
    """Excites damped resonant modes (freq_hz, q, gain) in parallel to simulate skull/metal/wood cavities."""
    acc = np.zeros_like(x)
    for fc, q, g in modes:
        if fc >= SR * 0.45:
            continue
        w0 = 2.0 * math.pi * fc / SR
        bw = w0 / max(q, 0.5)
        r = math.exp(-0.5 * bw)
        b = [g * (1.0 - r), 0.0, -g * (1.0 - r) * 0.25]
        a = [1.0, -2.0 * r * math.cos(w0), r * r]
        acc += signal.lfilter(b, a, x)
    return acc


def detect_syllable_peaks(env: np.ndarray, thresh_ratio: float = 0.22, min_gap_ms: float = 55.0) -> list[int]:
    """Find clean speech/grunt transient onsets for synced bone/armor/leaf foley."""
    peak_max = float(np.max(env)) + 1e-9
    thresh = peak_max * thresh_ratio
    gap = int(min_gap_ms * 0.001 * SR)
    hits = []
    i = 1
    while i < len(env) - 1:
        if env[i] > thresh and env[i] >= env[i - 1] and env[i] >= env[i + 1]:
            # Walk back 8ms to hit onset attack
            hits.append(max(0, i - int(0.006 * SR)))
            i += gap
        else:
            i += 1
    return hits


def master_save_mp3(y: np.ndarray, out_mp3: Path, target_rms_db: float = -12.0, peak_ceil_db: float = -1.0) -> dict:
    # Subtle studio cleanup + RMS leveling + clean lookahead peak ceiling
    y = butter_hp(y, 75.0, order=2)
    env = smooth_env(y, 4.0, 110.0)
    thresh = 10.0 ** (-22.0 / 20.0)
    gain_env = np.ones_like(y)
    over = env > thresh
    gain_env[over] = (thresh * (env[over] / thresh) ** (1.0 / 2.4)) / np.maximum(env[over], 1e-9)
    y = y * gain_env

    act = y[np.abs(y) > 0.015]
    cur_rms = float(np.sqrt(np.mean(act ** 2))) if len(act) else 0.05
    y = y * min(8.0, (10.0 ** (target_rms_db / 20.0)) / max(cur_rms, 1e-9))

    ceil_lin = 10.0 ** (peak_ceil_db / 20.0)
    abs_p = np.abs(y)
    peak_env = np.copy(abs_p)
    for i in range(len(y) - 2, -1, -1):
        peak_env[i] = max(abs_p[i], peak_env[i + 1] * 0.992)
    cur_p = 0.0
    rel_p = math.exp(-1.0 / (0.045 * SR))
    for i in range(len(y)):
        cur_p = max(peak_env[i], cur_p * rel_p)
        peak_env[i] = cur_p
    y = y * np.where(peak_env > ceil_lin, ceil_lin / np.maximum(peak_env, 1e-9), 1.0)
    p_fin = float(np.max(np.abs(y)))
    if p_fin > ceil_lin:
        y = y * (ceil_lin / p_fin)

    fade_n = min(int(0.010 * SR), len(y) // 12)
    if fade_n > 1:
        y[:fade_n] *= np.linspace(0.0, 1.0, fade_n)
        y[-fade_n:] *= np.linspace(1.0, 0.0, fade_n)

    peak_db = 20.0 * math.log10(max(float(np.max(np.abs(y))), 1e-9))
    act_m = y[np.abs(y) > 0.02]
    rms_db = 20.0 * math.log10(max(float(np.sqrt(np.mean(act_m ** 2))) if len(act_m) else 1e-9, 1e-9))

    with tempfile.TemporaryDirectory() as td:
        w = Path(td) / "m.wav"
        sf.write(str(w), y.astype(np.float32), SR, subtype="PCM_16")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(w), "-c:a", "libmp3lame", "-b:a", "192k", str(out_mp3)],
            check=True,
        )
    shutil.copy2(str(out_mp3), str(WORLD_DIR / out_mp3.name))
    return {
        "durationSec": round(len(y) / SR, 3),
        "peakDb": round(peak_db, 2),
        "activeRmsDb": round(rms_db, 2),
    }


# ---------------------------------------------------------------------------
# Character-Specific Acoustic Sculptors (Zero-Human-Booth Guarantee)
# ---------------------------------------------------------------------------

def sculpt_chibi_knight(x: np.ndarray, pitch_st: float = 2.8, tract: float = 1.18, soft_pray: bool = False) -> np.ndarray:
    """Toon-Link / stylized big-headed Chibi Knight with open steel helm shimmer."""
    m = rubberband_morph(x, pitch_st=pitch_st, formant_scale=tract)
    # Remove boxy teenage nasal chestiness, lift cute bright forward anime projection
    m = peaking_eq(m, 340.0, 1.1, -2.5)
    m = peaking_eq(m, 2600.0, 0.9, 2.0)
    if soft_pray:
        return butter_hp(m, 115.0, 3)
    # Subtle open visor rim early-reflection warmth (-17 dB) + soft plate-armor rustle on spikes
    helm_modes = modal_bank(m, [(580.0, 12.0, 0.045), (1290.0, 16.0, 0.035), (2180.0, 18.0, 0.025)])
    env = smooth_env(m, 5.0, 60.0)
    rng = np.random.default_rng(101)
    armor_f = np.zeros_like(m)
    for idx in detect_syllable_peaks(env, 0.35, 160.0):
        dur = min(int(0.065 * SR), len(m) - idx)
        if dur > 20:
            t = np.arange(dur) / SR
            clink = (np.sin(2 * math.pi * 2450 * t) * 0.4 + np.sin(2 * math.pi * 3820 * t) * 0.35) * np.exp(-t * 58.0)
            leather = butter_bp(rng.standard_normal(dur), 900.0, 2900.0) * np.exp(-t * 36.0) * 0.45
            armor_f[idx : idx + dur] += (clink * 0.25 + leather) * 0.14
    return butter_hp(m + helm_modes + armor_f, 125.0, 3)


def sculpt_chibi_mage(x: np.ndarray, pitch_st: float = 1.8, tract: float = 1.11) -> np.ndarray:
    """Bubbly miniature chibi witch with subtle crystalline sparkle aura on spell peaks."""
    m = rubberband_morph(x, pitch_st=pitch_st, formant_scale=tract)
    m = peaking_eq(m, 380.0, 1.2, -2.0)
    m = peaking_eq(m, 4400.0, 0.8, 2.2)
    env = smooth_env(m, 6.0, 75.0)
    # Delicate wand magic dust halo strictly following energetic spell cries
    hi_shimmer = match_len(rubberband_morph(m, pitch_st=12.0, formant_scale=1.35), len(m))
    hi_shimmer = butter_bp(hi_shimmer, 2800.0, 7200.0)
    gate = np.clip((env / (float(np.max(env)) + 1e-9) - 0.18) * 1.4, 0.0, 1.0)
    return butter_hp(m + hi_shimmer * gate * 0.16, 150.0, 3)


def sculpt_goblin(x: np.ndarray) -> np.ndarray:
    """Neon green chibi Goblin: shrunken 0.72x skull tract (+5.8st), nasal snarl & vocal-fry rasp."""
    m = rubberband_morph(x, pitch_st=5.8, formant_scale=1.38)
    m = butter_hp(m, 200.0, 4)
    m = peaking_eq(m, 340.0, 1.0, -5.0)
    m = peaking_eq(m, 1650.0, 1.8, 4.8)  # Cheeky goblin nasal buzz
    # Gated 64 Hz gremlin throat flutter / asymmetric rasp strictly on energetic cries
    env = smooth_env(m, 3.0, 45.0)
    t = np.arange(len(m)) / SR
    lfo = 0.65 + 0.35 * np.sin(2.0 * math.pi * 62.0 * t + 0.6 * np.sin(2.0 * math.pi * 17.0 * t))
    grit = np.tanh(m * 3.8) - 0.25 * (m ** 2)
    gate = np.clip((env / (float(np.max(env)) + 1e-9) - 0.14) * 1.8, 0.0, 1.0)
    rasped = m * (1.0 - 0.45 * gate) + (grit * lfo) * (0.42 * gate)
    snout = modal_bank(rasped, [(940.0, 7.5, 0.12), (1880.0, 9.0, 0.10)])
    return butter_hp(rasped + snout, 185.0, 3)


def sculpt_plant_sprite(x: np.ndarray) -> np.ndarray:
    """Korok / Deku leaf-hood sprout sprite: tiny 1.62x crystal-reed tract (+8.5st) + dry leaf & seed pops."""
    m = rubberband_morph(x, pitch_st=8.5, formant_scale=1.62)
    m = butter_hp(m, 290.0, 4)
    # Hollow woody acorn/bamboo tube resonance (gives Deku wood-instrument character, zero human cat meow)
    wood_pipe = modal_bank(m, [(760.0, 15.0, 0.26), (1520.0, 18.0, 0.20), (2420.0, 14.0, 0.10)])
    env = smooth_env(m, 4.0, 55.0)
    rng = np.random.default_rng(202)
    leaf_foley = np.zeros_like(m)
    for idx in detect_syllable_peaks(env, 0.20, 70.0):
        dur = min(int(0.055 * SR), len(m) - idx)
        if dur > 20:
            t = np.arange(dur) / SR
            marimba = np.sin(2 * math.pi * (860.0 + 380.0 * rng.random()) * t) * np.exp(-t * 68.0)
            leaf_rustle = butter_bp(rng.standard_normal(dur), 2800.0, 6800.0) * np.exp(-t * 48.0)
            leaf_foley[idx : idx + dur] += marimba * 0.24 + leaf_rustle * 0.22
    out = m * 0.72 + wood_pipe * 0.65 + leaf_foley
    return butter_hp(out, 260.0, 3)


def sculpt_skeleton(x: np.ndarray) -> np.ndarray:
    """Fleshless bone skull creature: zero chest bass (>350Hz), rigid bone cavity comb + clattering jaw clicks."""
    m = rubberband_morph(x, pitch_st=3.8, formant_scale=1.24)
    m = butter_hp(m, 360.0, 4)
    # Strip smooth vowel warmth, sculpt brittle skeletal bone chatter
    m = peaking_eq(m, 540.0, 1.1, -6.5)
    t = np.arange(len(m)) / SR
    jaw_clatter = 0.68 + 0.32 * np.sin(2.0 * math.pi * 74.0 * t + 0.9 * np.sin(2.0 * math.pi * 23.0 * t))
    dry_skull = modal_bank(m * jaw_clatter, [(680.0, 14.0, 0.36), (1380.0, 18.0, 0.42), (2460.0, 16.0, 0.28), (3650.0, 14.0, 0.18)])
    # Sync crisp dry knuckle/teeth clicks onto speech bursts
    env = smooth_env(m, 3.0, 40.0)
    rng = np.random.default_rng(303)
    bone_clicks = np.zeros_like(m)
    for idx in detect_syllable_peaks(env, 0.16, 48.0):
        for sub_off in (0, int(0.022 * SR), int(0.044 * SR)):
            k0 = idx + sub_off
            dur = min(int(0.018 * SR), len(m) - k0)
            if dur > 12 and rng.random() < 0.82:
                tt = np.arange(dur) / SR
                f1 = 1350.0 + 750.0 * rng.random()
                f2 = 2750.0 + 950.0 * rng.random()
                click = (
                    np.sin(2 * math.pi * f1 * tt) * np.exp(-tt * 220.0)
                    + 0.7 * np.sin(2 * math.pi * f2 * tt) * np.exp(-tt * 290.0)
                    + 0.4 * butter_bp(rng.standard_normal(dur), 1800.0, 5200.0) * np.exp(-tt * 240.0)
                )
                bone_clicks[k0 : k0 + dur] += click * (0.28 if sub_off == 0 else 0.15)
    return butter_hp(m * 0.42 + dry_skull * 0.85 + bone_clicks, 310.0, 4)


def sculpt_werewolf(x: np.ndarray) -> np.ndarray:
    """Cartoon canine werewolf monster: lowered beast jaw (0.76x), vowel scoop, -1 oct gated snarl & fang hiss."""
    main = rubberband_morph(x, pitch_st=-3.2, formant_scale=0.76)
    main = peaking_eq(main, 920.0, 1.3, -6.5)  # Kills human-spoken vowel mouth feel
    main = peaking_eq(main, 260.0, 1.0, 3.5)   # Snout chest growl
    growl_sub = match_len(rubberband_morph(x, pitch_st=-11.5, formant_scale=0.66), len(main))
    growl_sub = butter_lp(growl_sub, 380.0, 3)

    env = smooth_env(main, 4.0, 65.0)
    gate = np.clip((env / (float(np.max(env)) + 1e-9) - 0.16) * 1.6, 0.0, 1.0)
    t = np.arange(len(main)) / SR
    snarl_mod = 0.65 + 0.35 * np.sin(2.0 * math.pi * 34.0 * t)
    rng = np.random.default_rng(404)
    fang_air = butter_bp(rng.standard_normal(len(main)), 2200.0, 5800.0) * env * 1.55

    # Sharp non-linear beast crunch strictly during intense pounce roars
    crunch = np.tanh(main * 2.8) * gate * snarl_mod
    return butter_hp(main * 0.72 + crunch * 0.38 + growl_sub * gate * 0.65 + fang_air * 0.55, 65.0, 2)


def sculpt_black_knight(x: np.ndarray) -> np.ndarray:
    """Iron-bucket closed plate armor knight: physical steel helmet cavity IR + visor muffling + armor clink."""
    m = rubberband_morph(x, pitch_st=-1.8, formant_scale=0.88)
    # Build genuine short steel-bucket early-reflection impulse response
    ir_len = int(0.055 * SR)
    ir = np.zeros(ir_len, dtype=np.float64)
    ir[0] = 0.45
    taps = [(0.0014, 0.52), (0.0024, -0.44), (0.0038, 0.36), (0.0055, -0.28), (0.0082, 0.22), (0.0125, -0.15), (0.019, 0.09)]
    for sec, amp in taps:
        idx = int(sec * SR)
        if idx < ir_len:
            ir[idx] += amp
    helm_conv = signal.fftconvolve(m, ir, mode="full")[: len(m)]
    iron_ring = modal_bank(helm_conv, [(360.0, 16.0, 0.30), (790.0, 20.0, 0.24), (1320.0, 18.0, 0.14)])
    visor_muffled = butter_lp(helm_conv + iron_ring, 2450.0, 3)

    # Armor plate clinks on heavy exertions
    env = smooth_env(m, 5.0, 70.0)
    rng = np.random.default_rng(505)
    clinks = np.zeros_like(m)
    for idx in detect_syllable_peaks(env, 0.32, 130.0):
        dur = min(int(0.08 * SR), len(m) - idx)
        if dur > 20:
            tt = np.arange(dur) / SR
            ping = (np.sin(2 * math.pi * 1950 * tt) + 0.6 * np.sin(2 * math.pi * 3140 * tt)) * np.exp(-tt * 55.0)
            clinks[idx : idx + dur] += ping * 0.14
    return butter_hp(visor_muffled + clinks, 95.0, 3)


def sculpt_necromancer(x: np.ndarray) -> np.ndarray:
    """Supernatural cursed lich/witch caster: ghostly reverse inhale shadow + -5st wraith double + spectral hiss."""
    dry = rubberband_morph(x, pitch_st=-2.2, formant_scale=0.86)
    shadow = match_len(rubberband_morph(x, pitch_st=-5.5, formant_scale=0.72), len(dry))
    shadow = butter_lp(shadow, 1100.0, 2)

    # Ghostly reverse pre-whisper ("sucked-in spectral curse" before every cackle/shout)
    rev = dry[::-1]
    t_ir = np.arange(int(0.32 * SR)) / SR
    rng = np.random.default_rng(606)
    tomb_ir = (rng.standard_normal(len(t_ir)) * np.exp(-t_ir * 9.5))
    tomb_ir = butter_bp(tomb_ir, 550.0, 4800.0)
    pre_whisper = signal.fftconvolve(rev, tomb_ir, mode="full")[: len(dry)][::-1]
    pre_whisper = pre_whisper / (np.max(np.abs(pre_whisper)) + 1e-9) * (np.max(np.abs(dry)) * 0.24)

    # Shivering eerie tremolo on shadow double
    tt = np.arange(len(dry)) / SR
    wraith_mod = 0.72 + 0.28 * np.sin(2.0 * math.pi * 19.0 * tt)
    airy_hiss = butter_bp(match_len(rubberband_morph(x, pitch_st=10.0, formant_scale=1.25), len(dry)), 2200.0, 6200.0)
    return butter_hp(dry * 0.78 + shadow * wraith_mod * 0.56 + pre_whisper + airy_hiss * 0.20, 90.0, 2)


def sculpt_boss_brute(x: np.ndarray) -> np.ndarray:
    """Colossal 10-foot OrcBrute boss: -5.5st & huge 0.66x chest cavity + sub-monster chest rumble."""
    giant = rubberband_morph(x, pitch_st=-5.5, formant_scale=0.66)
    sub = match_len(rubberband_morph(x, pitch_st=-11.0, formant_scale=0.58), len(giant))
    sub = butter_lp(sub, 240.0, 3)
    env = smooth_env(giant, 6.0, 90.0)
    gate = np.clip((env / (float(np.max(env)) + 1e-9) - 0.14) * 1.4, 0.0, 1.0)
    t = np.arange(len(giant)) / SR
    chest_rasp = np.tanh(giant * 2.2) * (0.75 + 0.25 * np.sin(2 * math.pi * 42.0 * t))
    giant = peaking_eq(giant, 145.0, 0.9, 3.8)
    giant = peaking_eq(giant, 780.0, 1.1, -3.5)
    return butter_hp(giant * 0.75 + chest_rasp * 0.35 + sub * gate * 0.70, 48.0, 2)


def sculpt_frost_golem(x: np.ndarray) -> np.ndarray:
    """Living 2.85m glacier crystal boss: colossal 0.72x boulder body + frozen lake-ice groans & crystal shards."""
    colossus = rubberband_morph(x, pitch_st=-4.6, formant_scale=0.72)
    # Strip soft meatiness and ring through fractured alpine crystal + cold cavern
    colossus = peaking_eq(colossus, 380.0, 1.1, -4.0)
    ice_ring = modal_bank(
        colossus,
        [(430.0, 24.0, 0.22), (1180.0, 36.0, 0.25), (2190.0, 42.0, 0.20), (3490.0, 48.0, 0.14)],
    )
    env = smooth_env(colossus, 6.0, 90.0)
    gate = np.clip((env / (float(np.max(env)) + 1e-9) - 0.16) * 1.5, 0.0, 1.0)
    rng = np.random.default_rng(707)
    shards = np.zeros_like(colossus)
    for idx in detect_syllable_peaks(env, 0.22, 110.0):
        for n_sp in range(3):
            k0 = idx + int(n_sp * 0.028 * SR)
            dur = min(int(0.065 * SR), len(colossus) - k0)
            if dur > 20:
                tt = np.arange(dur) / SR
                f_cryo = 1800.0 + 2900.0 * rng.random()
                shards[k0 : k0 + dur] += (
                    np.sin(2 * math.pi * f_cryo * tt) * np.exp(-tt * 72.0)
                    + 0.4 * butter_bp(rng.standard_normal(dur), 2600.0, 6800.0) * np.exp(-tt * 90.0)
                ) * 0.20
    return butter_hp(colossus * 0.76 + ice_ring * 0.62 + shards + butter_lp(colossus, 160.0, 2) * gate * 0.55, 52.0, 2)


# ---------------------------------------------------------------------------
# Runner Matrix
# ---------------------------------------------------------------------------

def main() -> None:
    jobs = [
        {
            "slug": "v3_hero_knight_chibi_mild",
            "group": "Main Heroes",
            "character": "Chibi Knight (Milo v3 Mild Toon)",
            "v2Compare": "v2_hero_knight_milo_action.mp3",
            "src": "v2_hero_knight_milo_action_raw.mp3",
            "desc": "+2.6st pitch & 1.16x smaller chibi head + subtle open silver-helmet shimmer & armor rustle (Toon Link balance).",
            "fn": lambda x: sculpt_chibi_knight(x, pitch_st=2.6, tract=1.16),
            "target_rms": -12.0,
        },
        {
            "slug": "v3_hero_knight_chibi_bold",
            "group": "Main Heroes",
            "character": "Chibi Knight (Milo v3 Bold Chibi)",
            "v2Compare": "v2_hero_knight_milo_action.mp3",
            "src": "v2_hero_knight_milo_action_raw.mp3",
            "desc": "+4.2st pitch & 1.28x smaller toy-chibi anatomy + open helm resonance (unmistakably miniature 3D chibi Knight).",
            "fn": lambda x: sculpt_chibi_knight(x, pitch_st=4.2, tract=1.28),
            "target_rms": -12.0,
        },
        {
            "slug": "v3_hero_mage_chibi",
            "group": "Main Heroes",
            "character": "Chibi Mage (Lumi v3 Sparkling Witch)",
            "v2Compare": "v2_hero_mage_lumi_action.mp3",
            "src": "v2_hero_mage_lumi_action_raw.mp3",
            "desc": "+1.8st pitch & 1.12x chibi head scale + gated crystal magic air-halo synced to Starfall cries.",
            "fn": sculpt_chibi_mage,
            "target_rms": -12.0,
        },
        {
            "slug": "v3_hero_knight_pray",
            "group": "Main Heroes",
            "character": "Chibi Knight Prayer (Milo Chibi Soft)",
            "v2Compare": "v2_hero_knight_milo_pray.mp3",
            "src": "hero_knight_milo_pray.mp3",
            "desc": "Matched +2.8st / 1.17x chibi tract scale on prayer hums, wonder gasp & chuckle so Pray matches Combat identically.",
            "fn": lambda x: sculpt_chibi_knight(x, pitch_st=2.8, tract=1.17, soft_pray=True),
            "target_rms": -14.2,
        },
        {
            "slug": "v3_hero_mage_pray",
            "group": "Main Heroes",
            "character": "Chibi Mage Prayer (Lumi Chibi Soft)",
            "v2Compare": "v2_hero_mage_lumi_pray.mp3",
            "src": "hero_mage_lumi_pray.mp3",
            "desc": "Matched +1.8st / 1.12x chibi tract scale on gentle wordless prayer hum, wonder gasp & giggle.",
            "fn": sculpt_chibi_mage,
            "target_rms": -14.2,
        },
        {
            "slug": "v3_enemy_goblin",
            "group": "Goblins & Pack",
            "character": "Green Goblin Raider (Gremlin Sculpt)",
            "v2Compare": "v2_enemy_goblin_gero.mp3",
            "src": "v2_enemy_goblin_gero_raw.mp3",
            "desc": "+5.8st pitch + 1.38x tiny goblin snout formants + gated 62 Hz gremlin throat rasp (zero adult-man sound).",
            "fn": sculpt_goblin,
            "target_rms": -12.0,
        },
        {
            "slug": "v3_enemy_plant_sprite",
            "group": "Goblins & Pack",
            "character": "Leaf-Hood Sprite (PlantWarrior Deku)",
            "v2Compare": "v2_enemy_plant_arlo.mp3",
            "src": "v2_enemy_plant_arlo_raw.mp3",
            "desc": "+8.5st & 1.62x tiny forest spirit tract + woody Deku reed-flute tube resonance + dry seed/leaf burst foley.",
            "fn": sculpt_plant_sprite,
            "target_rms": -12.2,
        },
        {
            "slug": "v3_enemy_skeleton",
            "group": "Goblins & Pack",
            "character": "Skeleton Legion (Hollow Bone Rattle)",
            "v2Compare": "v2_enemy_skeleton_charon.mp3",
            "src": "enemy_skeleton_charon.mp3",
            "desc": "360Hz flesh-strip + dry osseous skull cavity comb (680/1380/2460Hz) + synced dry bone/teeth clack impulses.",
            "fn": sculpt_skeleton,
            "target_rms": -12.0,
        },
        {
            "slug": "v3_enemy_werewolf",
            "group": "Goblins & Pack",
            "character": "Red-Shirt Wolf Hunter (Feral Canine)",
            "v2Compare": "v2_enemy_wolf_zeno.mp3",
            "src": "v2_enemy_wolf_zeno_raw.mp3",
            "desc": "0.76x lowered canine snout + vowel scoop + gated -11.5st animalistic chest snarl & sharp fang-air hiss.",
            "fn": sculpt_werewolf,
            "target_rms": -12.0,
        },
        {
            "slug": "v3_enemy_black_knight",
            "group": "Elites & Bosses",
            "character": "Black Knight Elite (Iron Bucket Helm)",
            "v2Compare": "v2_enemy_black_knight_orus.mp3",
            "src": "v2_enemy_black_knight_orus_raw.mp3",
            "desc": "8-tap cast-iron enclosed helmet convolution + visor LPF 2.4kHz + impact cuirass clinks.",
            "fn": sculpt_black_knight,
            "target_rms": -12.0,
        },
        {
            "slug": "v3_enemy_necromancer",
            "group": "Elites & Bosses",
            "character": "Necromancer / Skeleton Mage (Spectral)",
            "v2Compare": "v2_enemy_necromage_umbriel.mp3",
            "src": "v2_enemy_necromage_umbriel_raw.mp3",
            "desc": "Reverse spectral pre-whisper shadow draw-in + wobbling -5.5st wraith double + ghostly upper hiss aura.",
            "fn": sculpt_necromancer,
            "target_rms": -12.2,
        },
        {
            "slug": "v3_enemy_boss_brute",
            "group": "Elites & Bosses",
            "character": "OrcBrute Boss (10ft Giant Monster)",
            "v2Compare": "v2_enemy_boss_alnilam.mp3",
            "src": "v2_enemy_boss_alnilam_raw.mp3",
            "desc": "-5.5st pitch + colossal 0.66x ogre ribcage formants + gated sub-octave monster rumble.",
            "fn": sculpt_boss_brute,
            "target_rms": -11.8,
        },
        {
            "slug": "v3_enemy_boss_frost_golem",
            "group": "Elites & Bosses",
            "character": "Frost Golem Boss (Crystalline Glacier)",
            "v2Compare": "v2_enemy_boss_alnilam.mp3",
            "src": "v2_enemy_boss_alnilam_raw.mp3",
            "desc": "Colossal 0.72x boulder body fused through resonant crystal cavities & synced glacier shard fractures.",
            "fn": sculpt_frost_golem,
            "target_rms": -12.0,
        },
    ]

    out_manifest = []
    for j in jobs:
        src_p = OUT_DIR / j["src"]
        out_p = OUT_DIR / f"{j['slug']}.mp3"
        x = load_wav_48k(src_p)
        y = j["fn"](x)
        met = master_save_mp3(y, out_p, target_rms_db=j["target_rms"], peak_ceil_db=-1.0)
        entry = {
            "slug": j["slug"],
            "file": out_p.name,
            "v2Compare": j["v2Compare"],
            "group": j["group"],
            "character": j["character"],
            "desc": j["desc"],
            **met,
        }
        out_manifest.append(entry)
        print(f"[SCULPT v3] {j['slug']:30s} -> {met['durationSec']}s | rms={met['activeRmsDb']}dB peak={met['peakDb']}dB", flush=True)

    MANIFEST_PATH.write_text(json.dumps(out_manifest, indent=2), encoding="utf-8")
    shutil.copy2(str(MANIFEST_PATH), str(WORLD_DIR / MANIFEST_PATH.name))
    print(f"[DONE] Sculpted {len(out_manifest)} character-native v3 voices.", flush=True)


if __name__ == "__main__":
    main()
