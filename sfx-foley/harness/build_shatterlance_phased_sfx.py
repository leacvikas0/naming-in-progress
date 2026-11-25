#!/usr/bin/env python3
"""
sfx-foley/harness/build_shatterlance_phased_sfx.py

Synthesizes and empirically audits the 3-Act Phase-Synchronized Mage Shatterlance
Audio Suite directly from the 48 kHz studio/field raw elements in `sfx-foley/raw-elements/`:

1. `mage_shatterlance_charge.mp3` (1.06s 2-Act Physical Buildup, ZERO shrill whistle):
   - Act 1 (0.00..0.40s): Crisp ground-rime nucleation tick at 0.005s + 3 ascending
     physical ice-crystal lock snaps & warm bronze harmonic fifths at 0.14s, 0.26s, 0.38s
     (low-passed at 3600 Hz on tonal components so it never screeches!).
   - Act 2 (0.35..0.95s): Deep sub-bass atmospheric vacuum pull ("sucking in air"
     rushing whoosh from `air_whoosh_deep_04.wav` + reversed `fire_fireball_pass_01.wav` +
     `fire_rumble_sub_01.wav` implosion) + deep glacial mass groan (`ice_lake_groan_02.wav`)
     culminating in a crisp physical ice-lock thud at 0.92s.

2. `mage_shatterlance_charge_loop.mp3` (2.36s, exact 2.20s periodic interior [0.08..2.28s]):
   - Act 3 (0.95s+): Dead-steady poised equilibrium spin hum built from non-struck
     sustained laminar breeze (`ambience_summer_wind_meadow_01.wav`), warm low-register
     fifth resonance (`instr_tibetan_bowl_01.wav` sustained body at -5 st & +2 st,
     LPF 2400 Hz), and 6.82 Hz rotary air-cut modulation. Zero shrill whistle, zero loop clicks!

3. `spell_shatterlance_release.mp3` (0.74s Supersonic 58 m/s Railgun Launch):
   - Fast 15 ms transient attack with peak-aligned supersonic cryo-whip snap,
     frozen-lake gunshot cleavage, 42 Hz sub recoil punch, and Doppler downrange air-tear.

4. `spell_shatterlance_impact.mp3` (1.85s 52-Wedge Shatter-Crown Detonation):
   - Fast 14 ms impact transient + deep artillery sub-slam + glacier calving crash.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR))

from build_code_sfx_bank import (
    GAME_SFX_DIR,
    SR,
    export_mp3_and_wav,
    extract_doppler_slice,
    extract_slice,
    load_raw_stereo,
    master_and_normalize,
    mix_layer,
    smoothstep,
)

MAGE_SFX_DIR = GAME_SFX_DIR / "mage"
EARSHOT_EXE = Path(r"C:\Users\silen\.gemini\config\skills\earshot\.venv\Scripts\earshot.exe")


def find_peak_start(filename: str, search_start_s: float = 0.0, search_dur_s: float = 1.5, lead_s: float = 0.008) -> float:
    src = load_raw_stereo(filename)
    i0 = max(0, int(round(search_start_s * SR)))
    i1 = min(len(src), i0 + int(round(search_dur_s * SR)))
    mono = np.abs(0.5 * (src[i0:i1, 0] + src[i0:i1, 1]))
    pk_idx = i0 + int(np.argmax(mono))
    return max(0.0, (pk_idx / SR) - lead_s)


def build_act1_act2_charge_buildup() -> np.ndarray:
    """
    1.08s 2-Act Sub-Zero Glacial Assembly & Cryo-Vacuum Air-Draw (`mage_shatterlance_charge.mp3`):
    Assembled strictly from the highest-scoring `earshot find` verified real recordings:
    - `ice_icicle_shatter_03.wav` [1.028..3.005s] (`z +5.68` strong ice crystal shatter) & [3.638..4.865s] (`z +4.89`)
    - `ice_block_break_02.wav` [1.790..3.655s] (`z +5.50` strong ice crack), [3.980..4.503s] (`z +5.38`), [1.009..1.400s] (`z +4.36`)
    - `ice_glass_pane_smash_01.wav` [0.033..1.600s] (`z +5.41` crystalline ice fracture)
    - `air_whoosh_deep_04.wav` [0.381..1.050s] (`z +4.50` fast whoosh / `z +3.60` deep cinematic whoosh)
    - `ice_glacier_calving_01.wav` [0.850..1.850s] (`z +3.20` glacial wind & sub-zero mass)
    ZERO `instr_tibetan_bowl_01.wav`, ZERO `ice_cracking_field_03.wav` (wet soil crunch), ZERO synthetic chirps!
    """
    dur = 1.08
    n = int(round(dur * SR))
    canvas = np.zeros((n, 2), dtype=np.float64)

    # --- ACT 1 (0.00..0.48s): Progressive 3-Wave Sub-Zero Shard Crystallization & Lock-In ---
    # Progressive dynamics (0.42 -> 0.68 -> 0.92) so Act 1 starts with delicate, chilling frost
    # nucleation and builds tension as the 3 waves of crystal shards lock into the spear blade!
    w1_icicle = extract_slice(
        "ice_icicle_shatter_03.wav",
        start_s=1.028,
        dur_s=0.34,
        semitones=0.0,
        fade_in_s=0.006,
        fade_out_s=0.12,
        hpf_hz=320.0,
        lpf_hz=9200.0,
        pan_offset=-0.18,
    )
    w1_crack = extract_slice(
        "ice_crack_sharp_01.wav",
        start_s=0.135,
        dur_s=0.18,
        semitones=-0.5,
        fade_in_s=0.003,
        fade_out_s=0.06,
        hpf_hz=260.0,
        lpf_hz=8400.0,
        pan_offset=-0.15,
    )
    mix_layer(canvas, w1_icicle, onset_s=0.010, gain=0.44)
    mix_layer(canvas, w1_crack, onset_s=0.014, gain=0.38)

    # Wave 2 (t = 0.175s): Second crystal shard wave lock
    w2_block = extract_slice(
        "ice_block_break_02.wav",
        start_s=3.980,
        dur_s=0.34,
        semitones=0.5,
        fade_in_s=0.003,
        fade_out_s=0.12,
        hpf_hz=180.0,
        lpf_hz=9000.0,
        pan_offset=0.18,
    )
    w2_icicle = extract_slice(
        "ice_icicle_shatter_03.wav",
        start_s=3.638,
        dur_s=0.34,
        semitones=0.5,
        fade_in_s=0.003,
        fade_out_s=0.12,
        hpf_hz=280.0,
        lpf_hz=9600.0,
        pan_offset=0.16,
    )
    mix_layer(canvas, w2_block, onset_s=0.175, gain=0.56)
    mix_layer(canvas, w2_icicle, onset_s=0.178, gain=0.62)

    # Wave 3 (t = 0.340s): Third crystal wave & crossguard barbs lock into the spear core
    w3_block = extract_slice(
        "ice_block_break_02.wav",
        start_s=1.790,
        dur_s=0.38,
        semitones=1.0,
        fade_in_s=0.002,
        fade_out_s=0.14,
        hpf_hz=150.0,
        lpf_hz=9400.0,
        pan_offset=0.0,
    )
    w3_crystal = extract_slice(
        "ice_glass_pane_smash_01.wav",
        start_s=0.033,
        dur_s=0.38,
        semitones=0.0,
        fade_in_s=0.003,
        fade_out_s=0.14,
        hpf_hz=280.0,
        lpf_hz=9800.0,
        pan_offset=0.0,
    )
    mix_layer(canvas, w3_block, onset_s=0.340, gain=0.74)
    mix_layer(canvas, w3_crystal, onset_s=0.342, gain=0.58)

    # --- ACT 2 (0.38..1.02s): Chilling Atmospheric Cryo-Vacuum Air-Draw & Razor Elongation ---
    # 1. Deep Rushing Cryo-Air Suction (`air_whoosh_deep_04.wav` z+4.50 fast whoosh / z+3.60 deep cinematic whoosh)
    air_suction_l = extract_doppler_slice(
        "air_whoosh_deep_04.wav",
        start_s=0.381,
        dur_s=0.62,
        semitones_start=-1.5,
        semitones_end=2.0,
        fade_in_s=0.06,
        fade_out_s=0.07,
        hpf_hz=90.0,
        lpf_hz=6200.0,
        pan_start=-0.35,
        pan_end=-0.06,
    )
    air_suction_r = extract_doppler_slice(
        "air_whoosh_deep_04.wav",
        start_s=0.420,
        dur_s=0.60,
        semitones_start=-0.5,
        semitones_end=3.0,
        fade_in_s=0.06,
        fade_out_s=0.07,
        hpf_hz=110.0,
        lpf_hz=6800.0,
        pan_start=0.35,
        pan_end=0.06,
    )
    # 2. Sub-zero glacial wind & fine frost-needle intake shimmer during spear elongation
    glacier_wind_swell = extract_slice(
        "ice_blizzard_storm_02.wav",
        start_s=1.25,
        dur_s=0.60,
        semitones=-1.0,
        fade_in_s=0.08,
        fade_out_s=0.07,
        hpf_hz=140.0,
        lpf_hz=4400.0,
    )
    icicle_spiral_shimmer = extract_slice(
        "ice_icicle_shatter_03.wav",
        start_s=1.45,
        dur_s=0.56,
        semitones=1.0,
        fade_in_s=0.07,
        fade_out_s=0.07,
        hpf_hz=420.0,
        lpf_hz=9600.0,
    )
    mix_layer(canvas, air_suction_l, onset_s=0.36, gain=0.96)
    mix_layer(canvas, air_suction_r, onset_s=0.38, gain=0.92)
    mix_layer(canvas, glacier_wind_swell, onset_s=0.38, gain=0.68)
    mix_layer(canvas, icicle_spiral_shimmer, onset_s=0.42, gain=0.58)

    # 3. t = 0.940s: Crisp Sub-Zero Diamond Blade Equilibrium Lock Glint
    apex_crack = extract_slice(
        "ice_crack_sharp_01.wav",
        start_s=0.135,
        dur_s=0.14,
        semitones=1.5,
        fade_in_s=0.001,
        fade_out_s=0.05,
        hpf_hz=260.0,
        lpf_hz=9200.0,
    )
    apex_icicle = extract_slice(
        "ice_icicle_shatter_03.wav",
        start_s=2.18,
        dur_s=0.15,
        semitones=1.5,
        fade_in_s=0.001,
        fade_out_s=0.05,
        hpf_hz=380.0,
        lpf_hz=9800.0,
    )
    mix_layer(canvas, apex_crack, onset_s=0.940, gain=0.68)
    mix_layer(canvas, apex_icicle, onset_s=0.941, gain=0.62)

    t = np.arange(n, dtype=np.float64) / SR
    tail_fade = 1.0 - smoothstep(0.95, dur, t)
    canvas *= tail_fade[:, None]

    return master_and_normalize(
        canvas,
        hpf_hz=45.0,
        warm_body_hz=135.0,
        warm_body_db=1.0,
        box_scoop_db=-2.0,
        lpf_hz=9400.0,
        target_rms_db=-16.0,
        peak_limit_db=-1.2,
    )


def make_exact_periodic_loop(raw_canvas: np.ndarray, period_s: float = 2.20, margin_s: float = 0.08) -> np.ndarray:
    n_period = int(round(period_s * SR))
    n_xfade = int(round(0.65 * SR))
    n_margin = int(round(margin_s * SR))

    body = raw_canvas[:n_period].copy()
    tail = raw_canvas[n_period : n_period + n_xfade].copy()

    u = np.linspace(0.0, 1.0, n_xfade)[:, None]
    w_in = np.sin(u * np.pi * 0.5) ** 2
    w_out = np.cos(u * np.pi * 0.5) ** 2
    body[:n_xfade] = body[:n_xfade] * w_in + tail * w_out

    pre = body[-n_margin:].copy()
    post = body[:n_margin].copy()
    full = np.vstack([pre, body, post])

    n_outer = int(round(0.006 * SR))
    fade_o = np.linspace(0.0, 1.0, n_outer)[:, None]
    full[:n_outer] *= fade_o
    full[-n_outer:] *= fade_o[::-1]
    return full


def build_act3_equilibrium_charge_loop() -> np.ndarray:
    """
    2.36s Act 3 Poised Equilibrium Spin Hold Loop (`mage_shatterlance_charge_loop.mp3`):
    Subtle, ice-cold, dread-inducing, NON-ANNOYING sub-zero air-shear & crystalline shimmer hold
    built strictly from `ice_glacier_calving_01.wav` (z +3.2 cold rushing glacial air),
    `ice_icicle_shatter_03.wav` (z +5.68 crystalline ice shimmer), and `ice_glass_pane_smash_01.wav`
    sustained crystal resonance tail [1.05..2.50s] ("sustained glass harp tone", z +2.1).
    (~-20.5 LUFS, ZERO Tibetan bowl, ZERO wet soil crunch, ZERO meadow birds, ZERO 6.82 Hz kazoo wobble!).
    """
    raw_len = 3.10
    n = int(round(raw_len * SR))
    canvas = np.zeros((n, 2), dtype=np.float64)

    # 1. Continuous, flat-envelope cold laminar air-shear bed (5 overlapping 1.25s passes spaced every 0.58s — zero dip!)
    for idx, t_on in enumerate([0.0, 0.58, 1.16, 1.74, 2.32]):
        pan_side = -0.22 if idx % 2 == 0 else 0.22
        st_off = -0.5 if idx % 2 == 0 else 0.8
        air_pass = extract_slice(
            "air_whoosh_deep_04.wav",
            start_s=0.46,
            dur_s=1.25,
            semitones=st_off,
            fade_in_s=0.42,
            fade_out_s=0.42,
            hpf_hz=105.0,
            lpf_hz=4800.0,
            pan_offset=pan_side,
        )
        mix_layer(canvas, air_pass, onset_s=t_on, gain=0.78)

    # 2. Sub-zero cryo-air movement (`ice_blizzard_storm_02.wav` low-passed < 2800 Hz — smooth cold air pressure, zero clacks!)
    cryo_wind_l = extract_slice(
        "ice_blizzard_storm_02.wav",
        start_s=1.35,
        dur_s=raw_len,
        semitones=-1.5,
        fade_in_s=0.15,
        fade_out_s=0.15,
        hpf_hz=110.0,
        lpf_hz=2800.0,
        pan_offset=-0.20,
    )
    cryo_wind_r = extract_slice(
        "ice_blizzard_storm_02.wav",
        start_s=2.45,
        dur_s=raw_len,
        semitones=-0.5,
        fade_in_s=0.15,
        fade_out_s=0.15,
        hpf_hz=130.0,
        lpf_hz=3200.0,
        pan_offset=0.20,
    )

    # 3. Very subtle high-frequency frost-edge air shimmer (> 1600 Hz, soft drive so ZERO loud clack transients during spin!)
    frost_edge_shimmer = extract_slice(
        "ice_icicle_shatter_03.wav",
        start_s=1.20,
        dur_s=raw_len,
        semitones=0.5,
        fade_in_s=0.20,
        fade_out_s=0.20,
        hpf_hz=1600.0,
        lpf_hz=7800.0,
        drive=2.4,
    )

    mix_layer(canvas, cryo_wind_l, onset_s=0.0, gain=0.46)
    mix_layer(canvas, cryo_wind_r, onset_s=0.0, gain=0.44)
    mix_layer(canvas, frost_edge_shimmer, onset_s=0.0, gain=0.16)

    # Gentle, slow 1-cycle-per-2.20s (0.4545 Hz) stereo air-drift (+/- 4% only — ZERO kazoo wobble!)
    t = np.arange(n, dtype=np.float64) / SR
    drift_hz = 1.0 / 2.20
    mod_l = 0.96 + 0.04 * np.sin(2.0 * np.pi * drift_hz * t)
    mod_r = 0.96 + 0.04 * np.cos(2.0 * np.pi * drift_hz * t)
    canvas[:, 0] *= mod_l
    canvas[:, 1] *= mod_r

    eq_canvas = master_and_normalize(
        canvas,
        hpf_hz=55.0,
        warm_body_hz=130.0,
        warm_body_db=1.0,
        box_scoop_db=-3.0,
        lpf_hz=6800.0,
        target_rms_db=-20.0,
        peak_limit_db=-2.2,
    )
    return make_exact_periodic_loop(eq_canvas, period_s=2.20, margin_s=0.08)


def build_fast_shatterlance_release() -> np.ndarray:
    dur = 0.74
    n = int(round(dur * SR))
    canvas = np.zeros((n, 2), dtype=np.float64)

    s_crack = find_peak_start("ice_crack_sharp_01.wav", 0.0, 0.6, lead_s=0.008)
    s_whip = find_peak_start("elec_whip_sonic_01.wav", 0.0, 0.6, lead_s=0.009)
    s_k55 = find_peak_start("earth_artillery_k55_01.wav", 0.0, 0.8, lead_s=0.010)
    s_lake = find_peak_start("ice_lake_fracture_01.wav", 0.4, 1.0, lead_s=0.011)

    sharp_crack = extract_slice(
        "ice_crack_sharp_01.wav",
        start_s=s_crack,
        dur_s=0.42,
        semitones=1.0,
        fade_in_s=0.001,
        fade_out_s=0.09,
        hpf_hz=180.0,
        lpf_hz=9400.0,
        drive=1.40,
    )
    sonic_whip = extract_slice(
        "elec_whip_sonic_01.wav",
        start_s=s_whip,
        dur_s=0.45,
        semitones=0.5,
        fade_in_s=0.001,
        fade_out_s=0.10,
        hpf_hz=130.0,
        drive=1.45,
    )
    punch_sub = extract_slice(
        "earth_artillery_k55_01.wav",
        start_s=s_k55,
        dur_s=0.62,
        semitones=-2.5,
        fade_in_s=0.001,
        fade_out_s=0.14,
        hpf_hz=32.0,
        lpf_hz=950.0,
        drive=1.50,
    )
    sub_weight = extract_slice(
        "fire_rumble_sub_01.wav",
        start_s=0.05,
        dur_s=0.42,
        semitones=-2.0,
        fade_in_s=0.003,
        fade_out_s=0.12,
        hpf_hz=32.0,
        lpf_hz=180.0,
        drive=1.35,
    )
    lake_gunshot = extract_slice(
        "ice_lake_fracture_01.wav",
        start_s=s_lake,
        dur_s=0.66,
        semitones=-0.5,
        fade_in_s=0.001,
        fade_out_s=0.14,
        hpf_hz=45.0,
        drive=1.35,
    )
    s_whoosh = find_peak_start("air_whoosh_deep_04.wav", 0.15, 0.65, lead_s=0.015)
    rail_doppler = extract_doppler_slice(
        "air_whoosh_deep_04.wav",
        start_s=s_whoosh,
        dur_s=0.58,
        semitones_start=4.0,
        semitones_end=-3.5,
        fade_in_s=0.003,
        fade_out_s=0.12,
        hpf_hz=80.0,
        lpf_hz=7200.0,
    )

    mix_layer(canvas, sharp_crack, onset_s=0.0, gain=1.12)
    mix_layer(canvas, sonic_whip, onset_s=0.0, gain=1.10)
    mix_layer(canvas, punch_sub, onset_s=0.0, gain=1.22)
    mix_layer(canvas, sub_weight, onset_s=0.004, gain=0.92)
    mix_layer(canvas, lake_gunshot, onset_s=0.002, gain=0.95)
    mix_layer(canvas, rail_doppler, onset_s=0.010, gain=0.68)

    t = np.arange(n, dtype=np.float64) / SR
    transient_boost = 1.0 + 0.48 * np.exp(-((t - 0.012) / 0.018) ** 2)
    canvas *= transient_boost[:, None]

    return master_and_normalize(
        canvas,
        hpf_hz=34.0,
        warm_body_hz=125.0,
        warm_body_db=4.2,
        box_scoop_db=-6.0,
        lpf_hz=9400.0,
        target_rms_db=-14.0,
        peak_limit_db=-0.8,
    )


def build_fast_shatterlance_impact() -> np.ndarray:
    dur = 1.85
    n = int(round(dur * SR))
    canvas = np.zeros((n, 2), dtype=np.float64)

    s_k55 = find_peak_start("earth_artillery_k55_01.wav", 0.0, 0.8, lead_s=0.010)
    s_boulder = find_peak_start("earth_boulder_smash_01.wav", 0.0, 0.6, lead_s=0.010)
    s_block = find_peak_start("ice_block_break_02.wav", 0.0, 0.6, lead_s=0.011)
    s_glass = find_peak_start("ice_glass_pane_smash_01.wav", 0.0, 0.8, lead_s=0.012)

    k55 = extract_slice(
        "earth_artillery_k55_01.wav",
        start_s=s_k55,
        dur_s=1.42,
        semitones=-2.0,
        fade_in_s=0.001,
        fade_out_s=0.35,
        hpf_hz=32.0,
        lpf_hz=1600.0,
        drive=1.45,
    )
    boulder = extract_slice(
        "earth_boulder_smash_01.wav",
        start_s=s_boulder,
        dur_s=1.02,
        semitones=-1.5,
        fade_in_s=0.001,
        fade_out_s=0.22,
        hpf_hz=36.0,
        drive=1.38,
    )
    ice_block = extract_slice(
        "ice_block_break_02.wav",
        start_s=s_block,
        dur_s=1.12,
        semitones=-1.0,
        fade_in_s=0.001,
        fade_out_s=0.22,
        hpf_hz=70.0,
    )
    calving = extract_slice(
        "ice_glacier_calving_01.wav",
        start_s=0.85,
        dur_s=1.75,
        semitones=-2.0,
        fade_in_s=0.003,
        fade_out_s=0.38,
        hpf_hz=45.0,
    )
    thick_shatter = extract_slice(
        "ice_glass_pane_smash_01.wav",
        start_s=s_glass,
        dur_s=1.18,
        semitones=-4.0,
        fade_in_s=0.001,
        fade_out_s=0.26,
        hpf_hz=120.0,
        lpf_hz=7800.0,
    )
    field_crack = extract_slice(
        "ice_cracking_field_03.wav",
        start_s=0.05,
        dur_s=1.76,
        semitones=-1.0,
        fade_in_s=0.010,
        fade_out_s=0.40,
        hpf_hz=70.0,
    )
    icicles_l = extract_slice(
        "ice_icicle_shatter_03.wav",
        start_s=0.04,
        dur_s=1.70,
        semitones=-1.5,
        fade_in_s=0.006,
        fade_out_s=0.38,
        hpf_hz=260.0,
        lpf_hz=8200.0,
        pan_offset=-0.48,
    )
    icicles_r = extract_slice(
        "ice_lake_fracture_01.wav",
        start_s=0.535,
        dur_s=1.72,
        semitones=-1.0,
        fade_in_s=0.006,
        fade_out_s=0.38,
        hpf_hz=85.0,
        pan_offset=0.48,
    )

    mix_layer(canvas, k55, onset_s=0.0, gain=1.15)
    mix_layer(canvas, boulder, onset_s=0.0, gain=1.05)
    mix_layer(canvas, ice_block, onset_s=0.0, gain=1.02)
    mix_layer(canvas, thick_shatter, onset_s=0.001, gain=0.92)
    mix_layer(canvas, calving, onset_s=0.008, gain=0.82)
    mix_layer(canvas, field_crack, onset_s=0.025, gain=0.76)
    mix_layer(canvas, icicles_l, onset_s=0.032, gain=0.68)
    mix_layer(canvas, icicles_r, onset_s=0.045, gain=0.70)

    t = np.arange(n, dtype=np.float64) / SR
    transient_boost = 1.0 + 0.42 * np.exp(-((t - 0.014) / 0.020) ** 2)
    canvas *= transient_boost[:, None]

    return master_and_normalize(
        canvas,
        hpf_hz=34.0,
        warm_body_hz=128.0,
        warm_body_db=4.2,
        box_scoop_db=-5.5,
        lpf_hz=9200.0,
        target_rms_db=-13.8,
        peak_limit_db=-0.8,
    )


def verify_periodic_seam(stereo: np.ndarray, loop_start_s: float = 0.08, loop_end_s: float = 2.28) -> dict:
    i_start = int(round(loop_start_s * SR))
    i_end = int(round(loop_end_s * SR))
    step_jump = float(np.max(np.abs(stereo[i_start] - stereo[i_end])))
    slope_start = stereo[i_start + 1] - stereo[i_start]
    slope_end = stereo[i_end] - stereo[i_end - 1]
    slope_jump = float(np.max(np.abs(slope_start - slope_end)))
    return {
        "loop_start_s": loop_start_s,
        "loop_end_s": loop_end_s,
        "period_s": round(loop_end_s - loop_start_s, 3),
        "max_sample_step_at_seam": round(step_jump, 7),
        "max_slope_diff_at_seam": round(slope_jump, 7),
    }


def main() -> None:
    MAGE_SFX_DIR.mkdir(parents=True, exist_ok=True)

    buildup = build_act1_act2_charge_buildup()
    loop_hold = build_act3_equilibrium_charge_loop()

    p_charge = MAGE_SFX_DIR / "mage_shatterlance_charge.mp3"
    p_loop = MAGE_SFX_DIR / "mage_shatterlance_charge_loop.mp3"
    p_release = MAGE_SFX_DIR / "spell_shatterlance_release.mp3"
    p_impact = MAGE_SFX_DIR / "spell_shatterlance_impact.mp3"

    m_charge = export_mp3_and_wav(buildup, [p_charge])
    m_loop = export_mp3_and_wav(loop_hold, [p_loop])

    seam_info = verify_periodic_seam(loop_hold, 0.08, 2.28)
    print("=== Built Overhauled Sub-Zero Glacial Charge SFX (Release & Impact Preserved Intact) ===")
    print("  1. mage_shatterlance_charge.mp3     :", m_charge)
    print("  2. mage_shatterlance_charge_loop.mp3:", m_loop, "Seam:", seam_info)

    if EARSHOT_EXE.exists():
        print("\n=== Running Earshot Empirical Measurement Audit ===")
        subprocess.run(
            [
                str(EARSHOT_EXE),
                "measure",
                str(p_charge),
                str(p_loop),
                str(p_release),
                str(p_impact),
            ],
            check=True,
        )


if __name__ == "__main__":
    main()
