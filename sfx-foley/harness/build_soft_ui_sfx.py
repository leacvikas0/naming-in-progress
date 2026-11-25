#!/usr/bin/env python3
"""
sfx-foley/harness/build_soft_ui_sfx.py

Rebuilds all UI SFX in `world/assets/audio/sfx/ui/*.mp3` as soft, subtle, warm,
natural tactile foley using `earshot` learned organic recordings + real studio
foley stems from `sfx-foley/raw-elements/`, with gentle low-pass filtering and
ZERO Tibetan singing bowl (`instr_tibetan_bowl_*`) or metallic bell/ring/chime.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from build_code_sfx_bank import (
    GAME_SFX_DIR,
    SR,
    export_mp3_and_wav,
    extract_slice,
    master_and_normalize,
    mix_layer,
    smoothstep,
    static_biquad,
)
from earshot import api as earshot_api
from earshot.make import make as earshot_make


def render_earshot_layer(
    recipe: dict,
    dur_s: float,
    fade_in_s: float = 0.005,
    fade_out_s: float = 0.040,
    hpf_hz: float | None = 120.0,
    lpf_hz: float | None = 2800.0,
) -> np.ndarray:
    """Renders an earshot organic tactile recipe to a 48 kHz stereo numpy array with smooth envelope and filtering."""
    with tempfile.TemporaryDirectory() as tmpdir:
        out_wav = Path(tmpdir) / "layer.wav"
        earshot_make(recipe=recipe, out=str(out_wav))
        data, sr_in = sf.read(str(out_wav), always_2d=True)
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

    pk = float(np.max(np.abs(data)))
    if pk > 1e-6:
        data /= pk
    return data


def audit_ui_file(mp3_path: Path) -> Dict[str, float]:
    tmp = mp3_path.with_suffix(".tmp_audit.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3_path), "-ar", str(SR), "-ac", "1", str(tmp)],
        check=True,
    )
    y, sr = sf.read(str(tmp))
    tmp.unlink(missing_ok=True)

    spec = np.abs(np.fft.rfft(y)) ** 2
    freqs = np.fft.rfftfreq(len(y), 1.0 / sr)
    mask = (freqs >= 180.0) & (freqs <= 3200.0)
    sub_spec = spec[mask]
    sub_freqs = freqs[mask]
    peak_idx = int(np.argmax(sub_spec))
    peak_hz = float(sub_freqs[peak_idx])

    # Local 1/3-octave narrowband ringing prominence (distinguishes metallic bell rings from broadband lowpass body)
    lo_hz = peak_hz / 1.15
    hi_hz = peak_hz * 1.15
    local_mask = (sub_freqs >= lo_hz) & (sub_freqs <= hi_hz)
    local_prom = float(sub_spec[peak_idx] / (np.median(sub_spec[local_mask]) + 1e-12))

    rms_db = float(20.0 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-12))
    m = earshot_api.measure(str(mp3_path))
    lufs = float(m.get("lufs", rms_db))
    tp_db = float(m.get("true_peak_dbtp", 0.0))

    return {
        "dur_s": len(y) / sr,
        "lufs": lufs,
        "rms_db": rms_db,
        "tp_db": tp_db,
        "peak_hz": peak_hz,
        "ring_prom_x": local_prom,
    }


def print_audit_table(label: str, ui_dir: Path) -> None:
    print(f"\n=== {label} ===")
    print(
        f"{'File':26s} | {'Dur(s)':>6s} | {'LUFS':>6s} | {'RMS dB':>7s} | "
        f"{'Peak dB':>7s} | {'Peak Hz':>8s} | {'Local Ring Prom':>15s}"
    )
    print("-" * 92)
    for p in sorted(ui_dir.glob("*.mp3")):
        r = audit_ui_file(p)
        print(
            f"{p.name:26s} | {r['dur_s']:6.3f} | {r['lufs']:6.1f} | {r['rms_db']:7.1f} | "
            f"{r['tp_db']:7.1f} | {r['peak_hz']:7.1f}Hz | {r['ring_prom_x']:14.1f}x"
        )


def build_soft_tactile_ui_sfx() -> List[Path]:
    ui_dir = GAME_SFX_DIR / "ui"
    ui_dir.mkdir(parents=True, exist_ok=True)
    built: List[Path] = []

    # 1. ui_hover.mp3: whisper-soft parchment & fingertip brush (0.070s, low-passed at 2400 Hz)
    c_hov = np.zeros((int(0.070 * SR), 2), dtype=np.float64)
    parch_hov = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=0.24,
        dur_s=0.070,
        semitones=-1.5,
        fade_in_s=0.008,
        fade_out_s=0.035,
        hpf_hz=180.0,
        lpf_hz=2400.0,
    )
    es_hov = render_earshot_layer(
        {
            "name": "ui_hover",
            "says": "soft fingertip brush on wood",
            "layers": [{"sound": "hover/fingertip", "cut": [0.04, 0.11], "lowpass": 2200}],
        },
        dur_s=0.070,
        fade_in_s=0.008,
        fade_out_s=0.035,
        hpf_hz=180.0,
        lpf_hz=2200.0,
    )
    mix_layer(c_hov, parch_hov, 0.0, 0.78)
    mix_layer(c_hov, es_hov, 0.0, 0.52)
    out_hov = master_and_normalize(
        c_hov,
        hpf_hz=180.0,
        warm_body_hz=240.0,
        warm_body_db=1.0,
        box_scoop_db=-6.5,
        lpf_hz=2400.0,
        target_rms_db=-26.5,
        peak_limit_db=-10.0,
    )
    p_hov = ui_dir / "ui_hover.mp3"
    export_mp3_and_wav(out_hov, [p_hov])
    built.append(p_hov)

    # 2. ui_click.mp3: soft muted wooden/parchment micro-tap (0.085s, low-passed at 2500 Hz)
    c_clk = np.zeros((int(0.085 * SR), 2), dtype=np.float64)
    es_clk = render_earshot_layer(
        {
            "name": "ui_click",
            "says": "soft muted wooden tap",
            "layers": [
                {"sound": "tock/wood", "cut": [0.0, 0.085], "pitch": -3, "lowpass": 2200, "gain": 0},
                {"sound": "thump/appear", "cut": [0.0, 0.070], "pitch": 2, "lowpass": 1800, "gain": -4},
            ],
        },
        dur_s=0.085,
        fade_in_s=0.004,
        fade_out_s=0.042,
        hpf_hz=140.0,
        lpf_hz=2300.0,
    )
    linen_tap = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=2.04,
        dur_s=0.080,
        semitones=-1.5,
        fade_in_s=0.005,
        fade_out_s=0.040,
        hpf_hz=180.0,
        lpf_hz=2500.0,
    )
    mix_layer(c_clk, es_clk, 0.0, 0.82)
    mix_layer(c_clk, linen_tap, 0.003, 0.58)
    out_clk = master_and_normalize(
        c_clk,
        hpf_hz=145.0,
        warm_body_hz=220.0,
        warm_body_db=1.6,
        box_scoop_db=-7.5,
        lpf_hz=2500.0,
        target_rms_db=-21.5,
        peak_limit_db=-5.5,
    )
    p_clk = ui_dir / "ui_click.mp3"
    export_mp3_and_wav(out_clk, [p_clk])
    built.append(p_clk)

    # 3. ui_locked_thud.mp3 & ui_locked.mp3: soft dry muted wood/leather thud (0.120s, zero metallic clink)
    c_lock = np.zeros((int(0.120 * SR), 2), dtype=np.float64)
    es_lock = render_earshot_layer(
        {
            "name": "ui_locked",
            "says": "soft dry muted wood and leather thud",
            "layers": [
                {"sound": "thump/appear", "pitch": -2, "lowpass": 1500, "gain": 0},
                {"sound": "thump/appear", "at": 0.045, "pitch": -5, "lowpass": 1300, "gain": -2},
            ],
        },
        dur_s=0.120,
        fade_in_s=0.005,
        fade_out_s=0.050,
        hpf_hz=105.0,
        lpf_hz=1700.0,
    )
    stone_sole = extract_slice(
        "earth_stone_fall_close_03.wav",
        start_s=0.02,
        dur_s=0.085,
        semitones=-3.0,
        fade_in_s=0.005,
        fade_out_s=0.045,
        hpf_hz=115.0,
        lpf_hz=1650.0,
    )
    leather_damp = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=4.18,
        dur_s=0.110,
        semitones=-3.0,
        fade_in_s=0.006,
        fade_out_s=0.050,
        hpf_hz=135.0,
        lpf_hz=1900.0,
    )
    mix_layer(c_lock, es_lock, 0.0, 0.80)
    mix_layer(c_lock, stone_sole, 0.002, 0.55)
    mix_layer(c_lock, leather_damp, 0.005, 0.45)
    out_lock = master_and_normalize(
        c_lock,
        hpf_hz=105.0,
        warm_body_hz=165.0,
        warm_body_db=1.8,
        box_scoop_db=-8.0,
        lpf_hz=1850.0,
        target_rms_db=-21.5,
        peak_limit_db=-5.5,
    )
    p_lock_thud = ui_dir / "ui_locked_thud.mp3"
    p_lock = ui_dir / "ui_locked.mp3"
    export_mp3_and_wav(out_lock, [p_lock_thud, p_lock])
    built.extend([p_lock_thud, p_lock])

    # 4. ui_hero_swap.mp3: soft cloth/cloak swish + gentle leather cinch (0.220s, zero bowl)
    c_swap = np.zeros((int(0.220 * SR), 2), dtype=np.float64)
    es_swap = render_earshot_layer(
        {
            "name": "ui_hero_swap",
            "says": "soft cloth cloak swish",
            "layers": [
                {"sound": "swipe/cloth", "cut": [0.02, 0.24], "pitch": -1, "lowpass": 2600, "gain": 0},
                {"sound": "thump/appear", "at": 0.04, "pitch": -2, "lowpass": 1600, "gain": -5},
            ],
        },
        dur_s=0.220,
        fade_in_s=0.014,
        fade_out_s=0.080,
        hpf_hz=120.0,
        lpf_hz=2600.0,
    )
    cloth_swish = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=2.05,
        dur_s=0.205,
        semitones=-1.5,
        fade_in_s=0.012,
        fade_out_s=0.075,
        hpf_hz=150.0,
        lpf_hz=2800.0,
    )
    leather_cinch = extract_slice(
        "earth_stone_fall_close_03.wav",
        start_s=0.47,
        dur_s=0.090,
        semitones=-2.5,
        fade_in_s=0.006,
        fade_out_s=0.045,
        hpf_hz=130.0,
        lpf_hz=1850.0,
    )
    mix_layer(c_swap, es_swap, 0.0, 0.78)
    mix_layer(c_swap, cloth_swish, 0.006, 0.72)
    mix_layer(c_swap, leather_cinch, 0.035, 0.42)
    out_swap = master_and_normalize(
        c_swap,
        hpf_hz=120.0,
        warm_body_hz=180.0,
        warm_body_db=1.6,
        box_scoop_db=-7.2,
        lpf_hz=2800.0,
        target_rms_db=-21.0,
        peak_limit_db=-5.0,
    )
    p_swap = ui_dir / "ui_hero_swap.mp3"
    export_mp3_and_wav(out_swap, [p_swap])
    built.append(p_swap)

    # 5. ui_element_tab_ice.mp3: soft crisp snow/frost brush + cool air puff (0.220s, zero bowl, zero whistle)
    c_tice = np.zeros((int(0.220 * SR), 2), dtype=np.float64)
    cool_puff = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=1.80,
        dur_s=0.210,
        semitones=2.0,
        fade_in_s=0.016,
        fade_out_s=0.085,
        hpf_hz=180.0,
        lpf_hz=3200.0,
    )
    frost_brush = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=0.35,
        dur_s=0.195,
        semitones=0.5,
        fade_in_s=0.012,
        fade_out_s=0.075,
        hpf_hz=210.0,
        lpf_hz=3300.0,
    )
    es_ice = render_earshot_layer(
        {
            "name": "ui_tab_ice",
            "says": "soft snow frost brush",
            "layers": [{"sound": "swipe/paper", "cut": [0.02, 0.22], "pitch": 1, "lowpass": 3200}],
        },
        dur_s=0.200,
        fade_in_s=0.012,
        fade_out_s=0.075,
        hpf_hz=200.0,
        lpf_hz=3200.0,
    )
    mix_layer(c_tice, cool_puff, 0.0, 0.76)
    mix_layer(c_tice, frost_brush, 0.005, 0.74)
    mix_layer(c_tice, es_ice, 0.008, 0.50)
    out_tice = master_and_normalize(
        c_tice,
        hpf_hz=165.0,
        warm_body_hz=225.0,
        warm_body_db=1.4,
        box_scoop_db=-7.0,
        lpf_hz=3200.0,
        target_rms_db=-21.0,
        peak_limit_db=-5.0,
    )
    p_tice = ui_dir / "ui_element_tab_ice.mp3"
    export_mp3_and_wav(out_tice, [p_tice])
    built.append(p_tice)

    # 6. ui_element_tab_fire.mp3: soft warm hearth ember puff + muted wood tap (0.220s, zero bowl)
    c_tfire = np.zeros((int(0.220 * SR), 2), dtype=np.float64)
    ember_puff = extract_slice(
        "fire_flamethrower_whoosh_02.wav",
        start_s=0.04,
        dur_s=0.205,
        semitones=-2.0,
        fade_in_s=0.016,
        fade_out_s=0.085,
        hpf_hz=115.0,
        lpf_hz=2600.0,
    )
    es_fire = render_earshot_layer(
        {
            "name": "ui_tab_fire",
            "says": "soft warm breath and muted wood tap",
            "layers": [
                {"sound": "tock/wood", "cut": [0.0, 0.09], "pitch": -4, "lowpass": 1900, "gain": -2},
                {"sound": "swipe/cloth", "cut": [0.02, 0.22], "pitch": -3, "lowpass": 2300, "gain": 0},
            ],
        },
        dur_s=0.210,
        fade_in_s=0.010,
        fade_out_s=0.080,
        hpf_hz=115.0,
        lpf_hz=2400.0,
    )
    warm_breeze = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=2.5,
        dur_s=0.210,
        semitones=-1.5,
        fade_in_s=0.015,
        fade_out_s=0.080,
        hpf_hz=120.0,
        lpf_hz=2500.0,
    )
    mix_layer(c_tfire, ember_puff, 0.0, 0.68)
    mix_layer(c_tfire, es_fire, 0.0, 0.72)
    mix_layer(c_tfire, warm_breeze, 0.008, 0.52)
    out_tfire = master_and_normalize(
        c_tfire,
        hpf_hz=110.0,
        warm_body_hz=175.0,
        warm_body_db=1.8,
        box_scoop_db=-7.5,
        lpf_hz=2600.0,
        target_rms_db=-20.8,
        peak_limit_db=-4.8,
    )
    p_tfire = ui_dir / "ui_element_tab_fire.mp3"
    export_mp3_and_wav(out_tfire, [p_tfire])
    built.append(p_tfire)

    # 7. ui_modal_open.mp3: soft parchment page unfurl + warm breeze breath (0.260s, zero bowl)
    c_mopen = np.zeros((int(0.260 * SR), 2), dtype=np.float64)
    page_unfurl = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=2.02,
        dur_s=0.250,
        semitones=-1.0,
        fade_in_s=0.016,
        fade_out_s=0.095,
        hpf_hz=145.0,
        lpf_hz=2800.0,
    )
    es_open = render_earshot_layer(
        {
            "name": "ui_modal_open",
            "says": "soft paper page turn",
            "layers": [{"sound": "paper/page", "cut": [0.04, 0.30], "pitch": -2, "lowpass": 2600}],
        },
        dur_s=0.250,
        fade_in_s=0.016,
        fade_out_s=0.095,
        hpf_hz=145.0,
        lpf_hz=2600.0,
    )
    breeze_open = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=2.40,
        dur_s=0.245,
        semitones=-1.0,
        fade_in_s=0.020,
        fade_out_s=0.095,
        hpf_hz=130.0,
        lpf_hz=2400.0,
    )
    mix_layer(c_mopen, page_unfurl, 0.0, 0.80)
    mix_layer(c_mopen, es_open, 0.005, 0.62)
    mix_layer(c_mopen, breeze_open, 0.010, 0.48)
    out_mopen = master_and_normalize(
        c_mopen,
        hpf_hz=135.0,
        warm_body_hz=195.0,
        warm_body_db=1.5,
        box_scoop_db=-7.2,
        lpf_hz=2800.0,
        target_rms_db=-21.5,
        peak_limit_db=-5.2,
    )
    p_mopen = ui_dir / "ui_modal_open.mp3"
    export_mp3_and_wav(out_mopen, [p_mopen])
    built.append(p_mopen)

    # 8. ui_modal_close.mp3: soft parchment page fold + muted cover settle (0.240s, zero bowl)
    c_mclose = np.zeros((int(0.240 * SR), 2), dtype=np.float64)
    page_fold = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=4.15,
        dur_s=0.230,
        semitones=-2.5,
        fade_in_s=0.014,
        fade_out_s=0.090,
        hpf_hz=135.0,
        lpf_hz=2500.0,
    )
    es_close = render_earshot_layer(
        {
            "name": "ui_modal_close",
            "says": "soft book closing",
            "layers": [{"sound": "book/close", "cut": [0.02, 0.26], "pitch": -3, "lowpass": 2200}],
        },
        dur_s=0.230,
        fade_in_s=0.014,
        fade_out_s=0.090,
        hpf_hz=125.0,
        lpf_hz=2200.0,
    )
    mix_layer(c_mclose, page_fold, 0.0, 0.82)
    mix_layer(c_mclose, es_close, 0.006, 0.58)
    out_mclose = master_and_normalize(
        c_mclose,
        hpf_hz=125.0,
        warm_body_hz=180.0,
        warm_body_db=1.6,
        box_scoop_db=-7.5,
        lpf_hz=2500.0,
        target_rms_db=-22.0,
        peak_limit_db=-5.5,
    )
    p_mclose = ui_dir / "ui_modal_close.mp3"
    export_mp3_and_wav(out_mclose, [p_mclose])
    built.append(p_mclose)

    # 9. ui_level_up.mp3: soft warm valley breeze swell + gentle parchment/cloth flourish (0.58s, zero bronze bowl, zero rumble!)
    c_lvl = np.zeros((int(0.58 * SR), 2), dtype=np.float64)
    breeze_lvl = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=3.0,
        dur_s=0.56,
        semitones=0.0,
        fade_in_s=0.065,
        fade_out_s=0.22,
        hpf_hz=135.0,
        lpf_hz=2800.0,
    )
    breeze_lvl_2 = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=5.2,
        dur_s=0.52,
        semitones=2.0,
        fade_in_s=0.055,
        fade_out_s=0.20,
        hpf_hz=160.0,
        lpf_hz=3000.0,
        pan_offset=0.15,
    )
    parchment_lvl = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=2.02,
        dur_s=0.38,
        semitones=-0.5,
        fade_in_s=0.035,
        fade_out_s=0.16,
        hpf_hz=160.0,
        lpf_hz=2900.0,
        pan_offset=-0.12,
    )
    es_lvl = render_earshot_layer(
        {
            "name": "ui_level_up",
            "says": "soft cloth and warm breath swell",
            "layers": [
                {"sound": "swipe/glide", "cut": [0.0, 0.50], "pitch": -2, "lowpass": 2500, "gain": 0},
                {"sound": "thump/appear", "at": 0.04, "pitch": -3, "lowpass": 1400, "gain": -6},
            ],
        },
        dur_s=0.50,
        fade_in_s=0.040,
        fade_out_s=0.18,
        hpf_hz=120.0,
        lpf_hz=2500.0,
    )
    mix_layer(c_lvl, breeze_lvl, 0.0, 0.85)
    mix_layer(c_lvl, breeze_lvl_2, 0.03, 0.65)
    mix_layer(c_lvl, parchment_lvl, 0.02, 0.62)
    mix_layer(c_lvl, es_lvl, 0.0, 0.58)
    out_lvl = master_and_normalize(
        c_lvl,
        hpf_hz=120.0,
        warm_body_hz=190.0,
        warm_body_db=1.6,
        box_scoop_db=-7.2,
        lpf_hz=2900.0,
        target_rms_db=-21.0,
        peak_limit_db=-5.0,
    )
    p_lvl = ui_dir / "ui_level_up.mp3"
    export_mp3_and_wav(out_lvl, [p_lvl])
    built.append(p_lvl)

    # 10. ui_victory_fanfare.mp3: soft warm valley breeze swell + gentle banner unfurl resolve (0.68s, zero bronze bowl, zero rumble!)
    c_vic = np.zeros((int(0.68 * SR), 2), dtype=np.float64)
    breeze_vic_1 = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=2.8,
        dur_s=0.66,
        semitones=-0.5,
        fade_in_s=0.075,
        fade_out_s=0.26,
        hpf_hz=135.0,
        lpf_hz=2700.0,
        pan_offset=-0.15,
    )
    breeze_vic_2 = extract_slice(
        "ambience_summer_wind_meadow_01.wav",
        start_s=5.0,
        dur_s=0.62,
        semitones=1.0,
        fade_in_s=0.070,
        fade_out_s=0.24,
        hpf_hz=155.0,
        lpf_hz=2800.0,
        pan_offset=0.15,
    )
    banner_unfurl_vic = extract_slice(
        "foley_parchment_stroke_01.wav",
        start_s=2.02,
        dur_s=0.45,
        semitones=-1.0,
        fade_in_s=0.045,
        fade_out_s=0.18,
        hpf_hz=155.0,
        lpf_hz=2700.0,
    )
    es_vic = render_earshot_layer(
        {
            "name": "ui_victory",
            "says": "soft cloth banner glide and warm settle",
            "layers": [
                {"sound": "swipe/glide", "cut": [0.0, 0.50], "pitch": -2, "lowpass": 2400, "gain": 0},
                {"sound": "thump/appear", "at": 0.05, "pitch": -3, "lowpass": 1400, "gain": -6},
            ],
        },
        dur_s=0.55,
        fade_in_s=0.045,
        fade_out_s=0.20,
        hpf_hz=125.0,
        lpf_hz=2400.0,
    )
    mix_layer(c_vic, breeze_vic_1, 0.0, 0.84)
    mix_layer(c_vic, breeze_vic_2, 0.03, 0.68)
    mix_layer(c_vic, banner_unfurl_vic, 0.03, 0.60)
    mix_layer(c_vic, es_vic, 0.01, 0.54)
    out_vic = master_and_normalize(
        c_vic,
        hpf_hz=120.0,
        warm_body_hz=185.0,
        warm_body_db=1.6,
        box_scoop_db=-7.2,
        lpf_hz=2700.0,
        target_rms_db=-21.2,
        peak_limit_db=-5.2,
    )
    p_vic = ui_dir / "ui_victory_fanfare.mp3"
    export_mp3_and_wav(out_vic, [p_vic])
    built.append(p_vic)

    return built


if __name__ == "__main__":
    ui_dir = GAME_SFX_DIR / "ui"
    built_files = build_soft_tactile_ui_sfx()
    print(f"\n[OK] Rebuilt {len(built_files)} soft tactile UI SFX files in {ui_dir}")
    print_audit_table("AFTER: SOFT TACTILE UI SFX AUDIT (EARSHOT + ORGANIC FOLEY, ZERO BOWL)", ui_dir)
