#!/usr/bin/env python3
"""
sfx-foley/harness/build_aaa_upgrades.py

Builds the remaining AAA SFX, Ambience, Ultra-Subtle Footsteps, Acoustic UI/Sacred,
Boosted Swords/Shields/Impacts, True Werewolf/Black Knight Vocals, Expanded Hero
Finisher/Hurt/Death Vocals, and All-Archetype Enemy Windup Foley directly into
`world/assets/audio/sfx/`.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import List, Tuple

import numpy as np
import soundfile as sf

from build_code_sfx_bank import (
    GAME_SFX_DIR,
    RAW_DIR,
    ROOT,
    SR,
    VOICES_SLICED_DIR,
    export_mp3_and_wav,
    extract_doppler_slice,
    extract_slice,
    master_and_normalize,
    mix_layer,
    normalize_stereo,
    smoothstep,
    static_biquad,
)

TTS_DIR = ROOT / "sfx-foley" / "tts-test"


def decode_any_audio(path: Path) -> np.ndarray:
    if path.suffix.lower() == ".wav":
        data, sr_in = sf.read(str(path), always_2d=True)
        if sr_in == SR:
            if data.shape[1] == 1:
                return np.column_stack([data[:, 0], data[:, 0]]).astype(np.float64)
            return data[:, :2].astype(np.float64)
    tmp_wav = path.with_suffix(".decode_tmp.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-ar", str(SR), "-ac", "2", str(tmp_wav)],
        check=True,
    )
    data, _ = sf.read(str(tmp_wav), always_2d=True)
    tmp_wav.unlink(missing_ok=True)
    return data[:, :2].astype(np.float64)


def make_seamless_loop(stereo: np.ndarray, xfade_s: float = 1.6) -> np.ndarray:
    xf = int(round(xfade_s * SR))
    if len(stereo) <= xf * 2:
        return stereo
    body = stereo[:-xf].copy()
    tail = stereo[-xf:].copy()
    u = np.linspace(0.0, 1.0, xf)[:, None]
    w_in = np.sin(u * np.pi * 0.5) ** 2
    w_out = np.cos(u * np.pi * 0.5) ** 2
    body[:xf] = body[:xf] * w_in + tail * w_out
    return body


# ---------------------------------------------------------------------------
# 1. Living World Ambience Loops (`world/assets/audio/sfx/ambience/`)
# ---------------------------------------------------------------------------

def build_ambience_loops() -> None:
    amb_dir = GAME_SFX_DIR / "ambience"
    amb_dir.mkdir(parents=True, exist_ok=True)

    # A. Meadow Day (gentle warm summer breeze + soft distant spring birdsong, 12.0s loop)
    raw_len = 13.6
    c_meadow = np.zeros((int(raw_len * SR), 2), dtype=np.float64)
    wind = extract_slice("ambience_summer_wind_meadow_01.wav", start_s=2.2, dur_s=raw_len, semitones=-1.0, fade_in_s=0.05, fade_out_s=0.05, hpf_hz=75.0, lpf_hz=3600.0)
    birds = extract_slice("ambience_spring_meadow_birds_01.wav", start_s=1.0, dur_s=raw_len, semitones=-0.5, fade_in_s=0.05, fade_out_s=0.05, hpf_hz=380.0, lpf_hz=5800.0)
    mix_layer(c_meadow, wind, 0.0, 0.85)
    mix_layer(c_meadow, birds, 0.0, 0.52)
    loop_meadow = normalize_stereo(make_seamless_loop(c_meadow, 1.6), target_rms_db=-24.5, peak_limit_db=-6.0)
    export_mp3_and_wav(loop_meadow, [amb_dir / "amb_meadow_day.mp3"])

    # B. Village & Brook (gentle brook stream + soft breeze, 12.0s loop)
    c_brook = np.zeros((int(raw_len * SR), 2), dtype=np.float64)
    brook = extract_slice("ambience_brook_stream_01.wav", start_s=1.0, dur_s=raw_len, semitones=-1.5, fade_in_s=0.05, fade_out_s=0.05, hpf_hz=95.0, lpf_hz=4200.0)
    wind2 = extract_slice("ambience_summer_wind_meadow_01.wav", start_s=3.5, dur_s=raw_len, semitones=-1.5, fade_in_s=0.05, fade_out_s=0.05, hpf_hz=70.0, lpf_hz=3200.0)
    mix_layer(c_brook, brook, 0.0, 0.65)
    mix_layer(c_brook, wind2, 0.0, 0.75)
    loop_brook = normalize_stereo(make_seamless_loop(c_brook, 1.6), target_rms_db=-25.0, peak_limit_db=-6.5)
    export_mp3_and_wav(loop_brook, [amb_dir / "amb_village_brook.mp3"])

    # C. Commune / Artorious Celestial Bed (warm singing-bowl fifth harmonic pad + soft wind, 10.0s loop)
    raw_c = 11.6
    c_cel = np.zeros((int(raw_c * SR), 2), dtype=np.float64)
    bowl1 = extract_slice("instr_tibetan_bowl_01.wav", start_s=1.8, dur_s=raw_c, semitones=-5.0, fade_in_s=0.08, fade_out_s=0.08, hpf_hz=80.0, lpf_hz=2400.0, pan_offset=-0.28)
    bowl2 = extract_slice("instr_tibetan_bowl_01.wav", start_s=2.4, dur_s=raw_c, semitones=2.0, fade_in_s=0.08, fade_out_s=0.08, hpf_hz=120.0, lpf_hz=3000.0, pan_offset=0.28)
    breeze = extract_slice("ambience_summer_wind_meadow_01.wav", start_s=4.0, dur_s=raw_c, semitones=-2.0, fade_in_s=0.08, fade_out_s=0.08, hpf_hz=75.0, lpf_hz=2800.0)
    mix_layer(c_cel, bowl1, 0.0, 0.85)
    mix_layer(c_cel, bowl2, 0.0, 0.62)
    mix_layer(c_cel, breeze, 0.0, 0.58)
    loop_cel = normalize_stereo(make_seamless_loop(c_cel, 1.6), target_rms_db=-22.5, peak_limit_db=-5.0)
    export_mp3_and_wav(loop_cel, [amb_dir / "amb_commune_celestial.mp3"])
    print("  [OK] Built 3 seamless ambience loops in world/assets/audio/sfx/ambience/")


# ---------------------------------------------------------------------------
# 2. Ultra-Subtle Footsteps & Smooth Tactile Dodges (`foley/`)
# ---------------------------------------------------------------------------

def build_subtle_footsteps_and_dodges() -> None:
    foley_dir = GAME_SFX_DIR / "foley"
    foley_dir.mkdir(parents=True, exist_ok=True)

    for idx in range(4):
        st = [-0.6, 0.4, -0.2, 0.7][idx]
        pan = [-0.08, 0.08, -0.06, 0.07][idx]

        # 1. Grass: whisper-soft turf brush (0.12s, zero modal resonator pings!)
        dur_g = 0.12
        c_g = np.zeros((int(dur_g * SR), 2), dtype=np.float64)
        brush = extract_slice("foley_parchment_stroke_01.wav", start_s=0.35 + idx * 1.1, dur_s=dur_g, semitones=-3.0 + st, fade_in_s=0.008, fade_out_s=0.045, hpf_hz=140.0, lpf_hz=2800.0, pan_offset=pan)
        turf = extract_slice("earth_boulder_roll_02.wav", start_s=0.04 + idx * 0.12, dur_s=0.09, semitones=2.0 + st, fade_in_s=0.004, fade_out_s=0.035, hpf_hz=110.0, lpf_hz=420.0, pan_offset=pan)
        mix_layer(c_g, brush, 0.0, 0.85)
        mix_layer(c_g, turf, 0.004, 0.45)
        out_g = master_and_normalize(c_g, hpf_hz=135.0, warm_body_hz=180.0, warm_body_db=1.5, box_scoop_db=-7.5, lpf_hz=2900.0, target_rms_db=-26.5, peak_limit_db=-9.0)
        export_mp3_and_wav(out_g, [foley_dir / f"footstep_grass_{idx + 1}.mp3"])

        # 2. Cobble: soft muted leather sole touch (0.11s, deep 450Hz scoop, zero knocking tok!)
        dur_c = 0.11
        c_c = np.zeros((int(dur_c * SR), 2), dtype=np.float64)
        sole = extract_slice("earth_stone_fall_close_03.wav", start_s=0.02 + idx * 0.45, dur_s=0.085, semitones=-1.5 + st, fade_in_s=0.004, fade_out_s=0.038, hpf_hz=150.0, lpf_hz=2400.0, pan_offset=pan)
        scuff = extract_slice("foley_parchment_stroke_01.wav", start_s=2.1 + idx * 0.8, dur_s=dur_c, semitones=-2.0 + st, fade_in_s=0.005, fade_out_s=0.04, hpf_hz=180.0, lpf_hz=2600.0, pan_offset=pan)
        mix_layer(c_c, sole, 0.0, 0.65)
        mix_layer(c_c, scuff, 0.003, 0.55)
        out_c = master_and_normalize(c_c, hpf_hz=150.0, warm_body_hz=185.0, warm_body_db=1.2, box_scoop_db=-8.5, lpf_hz=2600.0, target_rms_db=-26.2, peak_limit_db=-8.8)
        export_mp3_and_wav(out_c, [foley_dir / f"footstep_cobble_{idx + 1}.mp3"])

        # 3. Stone Path: subtle sand-grit & muted sole brush (0.12s)
        dur_s = 0.12
        c_s = np.zeros((int(dur_s * SR), 2), dtype=np.float64)
        grit = extract_slice("earth_gravel_shrapnel_01.wav", start_s=0.12 + idx * 0.4, dur_s=0.10, semitones=-1.0 + st, fade_in_s=0.005, fade_out_s=0.04, hpf_hz=170.0, lpf_hz=3100.0, pan_offset=pan)
        sole_s = extract_slice("earth_stone_fall_close_03.wav", start_s=0.47 + idx * 0.35, dur_s=0.085, semitones=-0.5 + st, fade_in_s=0.004, fade_out_s=0.038, hpf_hz=155.0, lpf_hz=2500.0, pan_offset=pan)
        mix_layer(c_s, sole_s, 0.0, 0.58)
        mix_layer(c_s, grit, 0.004, 0.62)
        out_s = master_and_normalize(c_s, hpf_hz=155.0, warm_body_hz=190.0, warm_body_db=1.2, box_scoop_db=-8.0, lpf_hz=3000.0, target_rms_db=-26.2, peak_limit_db=-8.8)
        export_mp3_and_wav(out_s, [foley_dir / f"footstep_stone_{idx + 1}.mp3"])

    # Smooth tactile Dodges (Knight leather/plate shift + air whoosh; Mage silk cloak + breeze)
    c_dk = np.zeros((int(0.42 * SR), 2), dtype=np.float64)
    mix_layer(c_dk, extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=0.38, semitones=1.0, fade_in_s=0.01, fade_out_s=0.08, hpf_hz=90.0, lpf_hz=3800.0), 0.0, 0.85)
    mix_layer(c_dk, extract_slice("foley_parchment_stroke_01.wav", start_s=2.05, dur_s=0.34, semitones=-2.0, fade_in_s=0.01, fade_out_s=0.08, hpf_hz=140.0, lpf_hz=4200.0), 0.01, 0.65)
    mix_layer(c_dk, extract_slice("foley_chain_drop_05.wav", start_s=0.02, dur_s=0.28, semitones=1.0, fade_in_s=0.01, fade_out_s=0.08, hpf_hz=180.0, lpf_hz=4800.0), 0.03, 0.42)
    export_mp3_and_wav(master_and_normalize(c_dk, hpf_hz=90.0, lpf_hz=4600.0, target_rms_db=-19.2, peak_limit_db=-3.0), [foley_dir / "dodge_knight.mp3"])

    c_dm = np.zeros((int(0.38 * SR), 2), dtype=np.float64)
    mix_layer(c_dm, extract_slice("air_whoosh_deep_04.wav", start_s=0.24, dur_s=0.34, semitones=2.5, fade_in_s=0.01, fade_out_s=0.08, hpf_hz=110.0, lpf_hz=4200.0), 0.0, 0.80)
    mix_layer(c_dm, extract_slice("foley_parchment_stroke_01.wav", start_s=6.05, dur_s=0.32, semitones=0.0, fade_in_s=0.01, fade_out_s=0.08, hpf_hz=160.0, lpf_hz=4800.0), 0.01, 0.72)
    export_mp3_and_wav(master_and_normalize(c_dm, hpf_hz=105.0, lpf_hz=4800.0, target_rms_db=-19.5, peak_limit_db=-3.2), [foley_dir / "dodge_mage.mp3"])
    print("  [OK] Built ultra-subtle footsteps & tactile dodges in world/assets/audio/sfx/foley/")


# ---------------------------------------------------------------------------
# 3. Acoustic Non-Synth UI & Sacred Verdicts (`ui/`, `sacred/`)
# ---------------------------------------------------------------------------

def build_acoustic_ui_and_sacred() -> None:
    from build_soft_ui_sfx import build_soft_tactile_ui_sfx

    ui_dir = GAME_SFX_DIR / "ui"
    sac_dir = GAME_SFX_DIR / "sacred"
    ui_dir.mkdir(parents=True, exist_ok=True)
    sac_dir.mkdir(parents=True, exist_ok=True)

    # Build all 10 soft tactile UI SFX (zero Tibetan bowl / zero metallic ring!)
    build_soft_tactile_ui_sfx()

    # stone_inspect: ancient travertine stone rub + deep resonant sanctuary bowl (1.15s)
    c_stone = np.zeros((int(1.15 * SR), 2), dtype=np.float64)
    mix_layer(c_stone, extract_slice("earth_boulder_roll_02.wav", start_s=0.02, dur_s=0.65, semitones=-2.0, fade_in_s=0.01, fade_out_s=0.18, hpf_hz=60.0, lpf_hz=1200.0), 0.0, 0.78)
    mix_layer(c_stone, extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=1.10, semitones=-3.0, fade_in_s=0.005, fade_out_s=0.30, hpf_hz=110.0, lpf_hz=4200.0), 0.02, 0.88)
    export_mp3_and_wav(master_and_normalize(c_stone, hpf_hz=65.0, lpf_hz=4400.0, target_rms_db=-16.8, peak_limit_db=-1.6), [sac_dir / "stone_inspect.mp3"])

    # commune_start: warm resonant singing bowl strike + ascending fifth shimmer + rose petal breeze (1.35s)
    c_com = np.zeros((int(1.35 * SR), 2), dtype=np.float64)
    mix_layer(c_com, extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=1.30, semitones=-2.0, fade_in_s=0.005, fade_out_s=0.32, hpf_hz=95.0, lpf_hz=4800.0, pan_offset=-0.20), 0.0, 0.92)
    mix_layer(c_com, extract_slice("instr_tibetan_bowl_01.wav", start_s=0.80, dur_s=1.25, semitones=5.0, fade_in_s=0.08, fade_out_s=0.32, hpf_hz=160.0, lpf_hz=5400.0, pan_offset=0.20), 0.08, 0.72)
    mix_layer(c_com, extract_slice("foley_parchment_stroke_01.wav", start_s=2.0, dur_s=0.95, semitones=2.0, fade_in_s=0.03, fade_out_s=0.25, hpf_hz=240.0, lpf_hz=5800.0), 0.04, 0.48)
    export_mp3_and_wav(master_and_normalize(c_com, hpf_hz=85.0, lpf_hz=5600.0, target_rms_db=-16.2, peak_limit_db=-1.4), [sac_dir / "commune_start.mp3"])

    # verdict_heal: warm acoustic singing-bowl fifths + gentle breeze bloom (1.75s, zero organ ding-ding-ding!)
    c_vheal = np.zeros((int(1.75 * SR), 2), dtype=np.float64)
    mix_layer(c_vheal, extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=1.68, semitones=0.0, fade_in_s=0.005, fade_out_s=0.40, hpf_hz=110.0, lpf_hz=5200.0, pan_offset=-0.28), 0.0, 0.90)
    mix_layer(c_vheal, extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=1.55, semitones=7.0, fade_in_s=0.008, fade_out_s=0.38, hpf_hz=180.0, lpf_hz=6000.0, pan_offset=0.28), 0.14, 0.78)
    mix_layer(c_vheal, extract_slice("instr_tibetan_bowl_01.wav", start_s=1.2, dur_s=1.50, semitones=12.0, fade_in_s=0.08, fade_out_s=0.40, hpf_hz=260.0, lpf_hz=6400.0), 0.22, 0.58)
    mix_layer(c_vheal, extract_slice("ambience_summer_wind_meadow_01.wav", start_s=3.0, dur_s=1.60, semitones=2.0, fade_in_s=0.04, fade_out_s=0.40, hpf_hz=180.0, lpf_hz=5200.0), 0.02, 0.45)
    export_mp3_and_wav(master_and_normalize(c_vheal, hpf_hz=90.0, lpf_hz=6200.0, target_rms_db=-15.4, peak_limit_db=-1.1), [sac_dir / "heal_verdict.mp3"])

    # verdict_miracle: grand cathedral bronze-bell & harmonic bloom + deep sub foundation (2.45s)
    c_vmir = np.zeros((int(2.45 * SR), 2), dtype=np.float64)
    mix_layer(c_vmir, extract_slice("earth_artillery_punch_04.wav", start_s=0.12, dur_s=0.95, semitones=-4.0, fade_in_s=0.01, fade_out_s=0.25, hpf_hz=36.0, lpf_hz=240.0), 0.0, 0.85)
    mix_layer(c_vmir, extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=2.35, semitones=-5.0, fade_in_s=0.005, fade_out_s=0.55, hpf_hz=75.0, lpf_hz=4600.0, pan_offset=-0.38), 0.0, 0.95)
    mix_layer(c_vmir, extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=2.25, semitones=2.0, fade_in_s=0.008, fade_out_s=0.52, hpf_hz=130.0, lpf_hz=5400.0, pan_offset=0.38), 0.12, 0.86)
    mix_layer(c_vmir, extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=2.10, semitones=7.0, fade_in_s=0.010, fade_out_s=0.50, hpf_hz=180.0, lpf_hz=6400.0), 0.26, 0.78)
    mix_layer(c_vmir, extract_slice("instr_tibetan_bowl_01.wav", start_s=1.0, dur_s=2.20, semitones=14.0, fade_in_s=0.10, fade_out_s=0.55, hpf_hz=280.0, lpf_hz=6800.0), 0.20, 0.65)
    export_mp3_and_wav(master_and_normalize(c_vmir, hpf_hz=40.0, warm_body_hz=140.0, warm_body_db=3.6, lpf_hz=6800.0, target_rms_db=-14.4, peak_limit_db=-0.9), [sac_dir / "miracle_verdict.mp3"])

    # verdict_smite: heavy thunder-bolt wrath + dark bronze toll + 2.2s rose-petal dissolve shimmer tail!
    c_vsmite = np.zeros((int(2.35 * SR), 2), dtype=np.float64)
    mix_layer(c_vsmite, extract_slice("earth_artillery_k55_01.wav", start_s=0.01, dur_s=1.55, semitones=-3.0, fade_in_s=0.002, fade_out_s=0.35, hpf_hz=32.0, lpf_hz=1400.0, drive=1.42), 0.0, 1.12)
    mix_layer(c_vsmite, extract_slice("elec_thunder_crack_close_01.wav", start_s=0.01, dur_s=1.85, semitones=-2.0, fade_in_s=0.002, fade_out_s=0.40, hpf_hz=40.0), 0.003, 1.05)
    mix_layer(c_vsmite, extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=2.15, semitones=-8.0, fade_in_s=0.004, fade_out_s=0.48, hpf_hz=65.0, lpf_hz=3200.0, pan_offset=-0.35), 0.01, 0.85)
    mix_layer(c_vsmite, extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=2.10, semitones=-2.0, fade_in_s=0.006, fade_out_s=0.48, hpf_hz=90.0, lpf_hz=3600.0, pan_offset=0.35), 0.03, 0.78)
    # Shimmering crimson rose-petal dissolve tail (0.35s .. 2.30s)
    mix_layer(c_vsmite, extract_slice("foley_parchment_stroke_01.wav", start_s=1.8, dur_s=1.95, semitones=3.0, fade_in_s=0.08, fade_out_s=0.45, hpf_hz=280.0, lpf_hz=6800.0, pan_offset=-0.42), 0.32, 0.75)
    mix_layer(c_vsmite, extract_slice("ice_blizzard_whistle_01.wav", start_s=0.4, dur_s=1.95, semitones=2.0, fade_in_s=0.08, fade_out_s=0.45, hpf_hz=220.0, lpf_hz=6200.0, pan_offset=0.42), 0.35, 0.65)
    export_mp3_and_wav(master_and_normalize(c_vsmite, hpf_hz=34.0, warm_body_hz=125.0, warm_body_db=4.2, target_rms_db=-13.8, peak_limit_db=-0.8), [sac_dir / "smite_verdict.mp3"])
    print("  [OK] Built acoustic non-synth UI & Sacred verdicts in ui/ and sacred/")


# ---------------------------------------------------------------------------
# 4. Boosted Swords, Shields & Hit Impacts (`swords/`, `shield/`, `impacts/`)
# ---------------------------------------------------------------------------

def build_boosted_weapons_shields_impacts() -> None:
    swords_dir = GAME_SFX_DIR / "swords"
    shield_dir = GAME_SFX_DIR / "shield"
    imp_dir = GAME_SFX_DIR / "impacts"

    # A. Boost & enrich all 36 sword swings with real steel edge & air weight (-14.5 to -13.6 dB RMS)
    for mp3_p in sorted(swords_dir.glob("*.mp3")):
        base = decode_any_audio(mp3_p)
        dur = len(base) / SR
        is_heavy = "combo4" in mp3_p.name
        is_ice = "_ice_" in mp3_p.name
        is_fire = "_fire_" in mp3_p.name
        canvas = np.zeros_like(base)
        mix_layer(canvas, base, 0.0, 1.0)
        steel = extract_slice("foley_sword_clash_01.wav", start_s=0.01, dur_s=min(dur, 0.38), semitones=-1.0 if is_heavy else 1.0, fade_in_s=0.002, fade_out_s=0.08, hpf_hz=160.0, lpf_hz=7400.0)
        whoosh = extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=min(dur, 0.42), semitones=-1.0 if is_heavy else 1.5, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=75.0, lpf_hz=4800.0)
        mix_layer(canvas, steel, 0.003, 0.55 if not is_heavy else 0.72)
        mix_layer(canvas, whoosh, 0.0, 0.65 if not is_heavy else 0.85)
        if is_ice:
            ice_edge = extract_slice("ice_cracking_snap_02.wav", start_s=0.04, dur_s=min(dur, 0.36), semitones=1.0, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=220.0, lpf_hz=7200.0)
            mix_layer(canvas, ice_edge, 0.008, 0.52)
        elif is_fire:
            fire_edge = extract_slice("fire_flamethrower_whoosh_02.wav", start_s=0.02, dur_s=min(dur, 0.40), semitones=0.5, fade_in_s=0.004, fade_out_s=0.08, hpf_hz=110.0, lpf_hz=5800.0)
            mix_layer(canvas, fire_edge, 0.006, 0.58)
        out = master_and_normalize(canvas, hpf_hz=55.0, warm_body_hz=155.0, warm_body_db=3.6, target_rms_db=-13.8 if is_heavy else -14.6, peak_limit_db=-0.9)
        export_mp3_and_wav(out, [mp3_p])

    # B. Shield Raise, Block Clang, Parry Ring & Shield Bash
    c_raise = np.zeros((int(0.38 * SR), 2), dtype=np.float64)
    mix_layer(c_raise, extract_slice("foley_armor_drop_03.wav", start_s=0.0, dur_s=0.34, semitones=0.5, fade_in_s=0.002, fade_out_s=0.08, hpf_hz=75.0), 0.0, 0.95)
    mix_layer(c_raise, extract_slice("foley_metal_plate_drop_01.wav", start_s=0.01, dur_s=0.32, semitones=1.0, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=95.0, lpf_hz=5800.0), 0.015, 0.78)
    export_mp3_and_wav(master_and_normalize(c_raise, hpf_hz=70.0, warm_body_hz=165.0, warm_body_db=3.5, target_rms_db=-15.2, peak_limit_db=-1.0), [shield_dir / "knight_shield_raise.mp3"])

    c_blk = np.zeros((int(0.62 * SR), 2), dtype=np.float64)
    mix_layer(c_blk, extract_slice("earth_artillery_punch_04.wav", start_s=0.12, dur_s=0.48, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.10, hpf_hz=40.0, lpf_hz=900.0, drive=1.4), 0.0, 1.05)
    mix_layer(c_blk, extract_slice("foley_metal_plate_drop_01.wav", start_s=0.0, dur_s=0.56, semitones=-1.0, fade_in_s=0.002, fade_out_s=0.12, hpf_hz=70.0, lpf_hz=6800.0), 0.002, 1.00)
    mix_layer(c_blk, extract_slice("foley_sword_clash_01.wav", start_s=0.01, dur_s=0.52, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.12, hpf_hz=120.0, lpf_hz=7200.0), 0.004, 0.92)
    export_mp3_and_wav(master_and_normalize(c_blk, hpf_hz=42.0, warm_body_hz=145.0, warm_body_db=4.0, target_rms_db=-13.6, peak_limit_db=-0.8), [shield_dir / "knight_shield_block_clang.mp3"])

    c_parry = np.zeros((int(0.95 * SR), 2), dtype=np.float64)
    mix_layer(c_parry, extract_slice("earth_artillery_punch_04.wav", start_s=0.12, dur_s=0.52, semitones=-1.0, fade_in_s=0.002, fade_out_s=0.12, hpf_hz=42.0, lpf_hz=1100.0, drive=1.4), 0.0, 1.00)
    mix_layer(c_parry, extract_slice("foley_sword_clash_01.wav", start_s=0.01, dur_s=0.78, semitones=1.5, fade_in_s=0.001, fade_out_s=0.18, hpf_hz=140.0, lpf_hz=8200.0), 0.001, 1.08)
    mix_layer(c_parry, extract_slice("instr_tibetan_bowl_strike_02.wav", start_s=0.01, dur_s=0.90, semitones=4.0, fade_in_s=0.003, fade_out_s=0.22, hpf_hz=180.0, lpf_hz=6800.0), 0.005, 0.72)
    export_mp3_and_wav(master_and_normalize(c_parry, hpf_hz=44.0, warm_body_hz=150.0, warm_body_db=3.8, target_rms_db=-13.5, peak_limit_db=-0.8), [shield_dir / "knight_shield_parry_ring.mp3"])

    c_bash = np.zeros((int(0.58 * SR), 2), dtype=np.float64)
    mix_layer(c_bash, extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=0.52, semitones=-1.0, fade_in_s=0.002, fade_out_s=0.12, hpf_hz=40.0, lpf_hz=1600.0, drive=1.4), 0.0, 1.05)
    mix_layer(c_bash, extract_slice("foley_metal_plate_drop_01.wav", start_s=0.0, dur_s=0.50, semitones=-1.5, fade_in_s=0.002, fade_out_s=0.12, hpf_hz=65.0), 0.003, 0.96)
    mix_layer(c_bash, extract_slice("foley_armor_drop_03.wav", start_s=0.0, dur_s=0.44, semitones=-1.0, fade_in_s=0.002, fade_out_s=0.10, hpf_hz=70.0), 0.010, 0.88)
    export_mp3_and_wav(master_and_normalize(c_bash, hpf_hz=40.0, warm_body_hz=140.0, warm_body_db=4.0, target_rms_db=-13.8, peak_limit_db=-0.8), [shield_dir / "knight_shield_bash.mp3"])

    # C. Hit Impacts: Bone, Armor, Flesh, Player Hit (Boosted from -26 dB to -13.8 dB RMS!)
    for idx in range(3):
        st = [-0.8, 0.0, 0.9][idx]
        # Bone hit: blade cut + skull/rib crack + sub punch
        cb = np.zeros((int(0.36 * SR), 2), dtype=np.float64)
        mix_layer(cb, extract_slice("earth_artillery_punch_04.wav", start_s=0.12, dur_s=0.28, semitones=st, fade_in_s=0.001, fade_out_s=0.06, hpf_hz=48.0, lpf_hz=900.0, drive=1.35), 0.0, 0.95)
        mix_layer(cb, extract_slice("foley_bones_skull_05.wav", start_s=0.0, dur_s=0.32, semitones=st, fade_in_s=0.001, fade_out_s=0.07, hpf_hz=85.0), 0.002, 1.05)
        mix_layer(cb, extract_slice("foley_bones_crack_02.wav", start_s=0.02 + idx * 0.12, dur_s=0.32, semitones=st, fade_in_s=0.002, fade_out_s=0.07, hpf_hz=95.0), 0.005, 0.92)
        mix_layer(cb, extract_slice("foley_sword_clash_01.wav", start_s=0.01, dur_s=0.24, semitones=1.5 + st, fade_in_s=0.001, fade_out_s=0.06, hpf_hz=180.0, lpf_hz=7200.0), 0.001, 0.58)
        export_mp3_and_wav(master_and_normalize(cb, hpf_hz=48.0, warm_body_hz=150.0, warm_body_db=3.8, target_rms_db=-13.8, peak_limit_db=-0.8), [imp_dir / f"hit_bone_{idx + 1}.mp3"])

        # Armor hit: heavy steel cleave + plate crash + sub punch
        ca = np.zeros((int(0.38 * SR), 2), dtype=np.float64)
        mix_layer(ca, extract_slice("earth_artillery_punch_04.wav", start_s=0.12, dur_s=0.30, semitones=-1.0 + st, fade_in_s=0.001, fade_out_s=0.06, hpf_hz=45.0, lpf_hz=900.0, drive=1.35), 0.0, 0.98)
        mix_layer(ca, extract_slice("foley_metal_plate_drop_01.wav", start_s=0.01 + idx * 0.08, dur_s=0.34, semitones=st, fade_in_s=0.001, fade_out_s=0.08, hpf_hz=80.0, lpf_hz=6800.0), 0.002, 1.02)
        mix_layer(ca, extract_slice("foley_sword_clash_01.wav", start_s=0.01, dur_s=0.30, semitones=st, fade_in_s=0.001, fade_out_s=0.07, hpf_hz=140.0, lpf_hz=7400.0), 0.001, 0.85)
        export_mp3_and_wav(master_and_normalize(ca, hpf_hz=46.0, warm_body_hz=148.0, warm_body_db=3.8, target_rms_db=-13.8, peak_limit_db=-0.8), [imp_dir / f"hit_armor_{idx + 1}.mp3"])

        # Flesh hit: heavy meaty impact + bone/leather crunch + sub punch
        cf = np.zeros((int(0.36 * SR), 2), dtype=np.float64)
        mix_layer(cf, extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=0.30, semitones=1.0 + st, fade_in_s=0.001, fade_out_s=0.06, hpf_hz=45.0, lpf_hz=1200.0, drive=1.35), 0.0, 1.02)
        mix_layer(cf, extract_slice("foley_bones_crack_02.wav", start_s=0.04 + idx * 0.10, dur_s=0.30, semitones=-1.5 + st, fade_in_s=0.002, fade_out_s=0.07, hpf_hz=80.0, lpf_hz=4800.0), 0.003, 0.88)
        mix_layer(cf, extract_slice("foley_armor_drop_04.wav", start_s=0.0, dur_s=0.28, semitones=st, fade_in_s=0.002, fade_out_s=0.06, hpf_hz=90.0), 0.004, 0.72)
        export_mp3_and_wav(master_and_normalize(cf, hpf_hz=45.0, warm_body_hz=145.0, warm_body_db=4.0, target_rms_db=-13.8, peak_limit_db=-0.8), [imp_dir / f"hit_flesh_{idx + 1}.mp3"])

    # Player Hit light & heavy
    cp = np.zeros((int(0.40 * SR), 2), dtype=np.float64)
    mix_layer(cp, extract_slice("earth_artillery_punch_04.wav", start_s=0.12, dur_s=0.36, semitones=-1.0, fade_in_s=0.002, fade_out_s=0.08, hpf_hz=42.0, lpf_hz=1100.0, drive=1.35), 0.0, 1.02)
    mix_layer(cp, extract_slice("foley_armor_drop_03.wav", start_s=0.0, dur_s=0.34, semitones=0.0, fade_in_s=0.002, fade_out_s=0.08, hpf_hz=80.0), 0.004, 0.88)
    export_mp3_and_wav(master_and_normalize(cp, hpf_hz=42.0, warm_body_hz=140.0, warm_body_db=3.8, target_rms_db=-14.0, peak_limit_db=-0.8), [imp_dir / "player_hit_thud.mp3"])
    print("  [OK] Boosted all 36 Swords, 4 Shields & 11 Hit Impacts (-14.5 to -13.6 dB RMS)")


# ---------------------------------------------------------------------------
# 5. True Creature Vocals, Expanded Hero Voices & All-Archetype Enemy Foley
# ---------------------------------------------------------------------------

def slice_voice_window(src_path: Path, start_s: float, end_s: float, target_rms_db: float = -18.0) -> np.ndarray:
    stereo = decode_any_audio(src_path)
    i0 = max(0, int(round(start_s * SR)))
    i1 = min(len(stereo), int(round(end_s * SR)))
    seg = stereo[i0:i1].copy()
    seg = seg - np.mean(seg, axis=0, keepdims=True)
    n = len(seg)
    t = np.arange(n, dtype=np.float64) / SR
    dur = max(0.05, n / SR)
    env = smoothstep(0.0, min(0.012, dur * 0.15), t) * (1.0 - smoothstep(max(0.0, dur - min(0.045, dur * 0.25)), dur, t))
    seg *= env[:, None]
    return master_and_normalize(seg, hpf_hz=85.0, warm_body_hz=185.0, warm_body_db=2.2, box_scoop_db=-4.5, lpf_hz=8400.0, target_rms_db=target_rms_db, peak_limit_db=-1.5)


def build_creature_and_hero_voices_and_enemy_foley() -> None:
    voices_dir = GAME_SFX_DIR / "voices"
    enemies_dir = GAME_SFX_DIR / "enemies"
    voices_dir.mkdir(parents=True, exist_ok=True)
    enemies_dir.mkdir(parents=True, exist_ok=True)

    # A. 100% True Canine/Wolf Werewolf Vocal Suite (ZERO human "Wuaaaah!" groan!)
    # 1. werewolf__windup_snarl: ferocious snarling wolf/dog throat growl + jaw snap
    w_snarl = np.zeros((int(0.78 * SR), 2), dtype=np.float64)
    mix_layer(w_snarl, extract_slice("creature_dog_snarl_angry_02.wav", start_s=0.05, dur_s=0.74, semitones=-1.5, fade_in_s=0.01, fade_out_s=0.12, hpf_hz=75.0, lpf_hz=6400.0, drive=1.25), 0.0, 1.05)
    mix_layer(w_snarl, extract_slice("creature_dog_growl_01.wav", start_s=0.08, dur_s=0.72, semitones=-1.0, fade_in_s=0.01, fade_out_s=0.12, hpf_hz=70.0, lpf_hz=5200.0), 0.02, 0.88)
    export_mp3_and_wav(master_and_normalize(w_snarl, hpf_hz=70.0, warm_body_hz=165.0, warm_body_db=3.4, target_rms_db=-16.2, peak_limit_db=-1.2), [voices_dir / "werewolf__windup_snarl.mp3", VOICES_SLICED_DIR / "werewolf__windup_snarl.mp3"])

    # 2. werewolf__attack_roar: savage beast pounce snarl + claw air-rip
    w_atk = np.zeros((int(0.82 * SR), 2), dtype=np.float64)
    mix_layer(w_atk, extract_slice("creature_beast_snarl_01.wav", start_s=0.15, dur_s=0.78, semitones=-0.5, fade_in_s=0.008, fade_out_s=0.14, hpf_hz=70.0, lpf_hz=6800.0, drive=1.3), 0.0, 1.08)
    mix_layer(w_atk, extract_slice("creature_dog_snarl_angry_02.wav", start_s=4.15, dur_s=0.76, semitones=-2.0, fade_in_s=0.01, fade_out_s=0.14, hpf_hz=80.0, lpf_hz=5800.0), 0.015, 0.90)
    mix_layer(w_atk, extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=0.45, semitones=2.0, fade_in_s=0.005, fade_out_s=0.08, hpf_hz=110.0), 0.04, 0.72)
    export_mp3_and_wav(master_and_normalize(w_atk, hpf_hz=68.0, warm_body_hz=160.0, warm_body_db=3.5, target_rms_db=-15.8, peak_limit_db=-1.1), [voices_dir / "werewolf__attack_roar.mp3", VOICES_SLICED_DIR / "werewolf__attack_roar.mp3"])

    # 3. werewolf__appear: eerie wolf howl + low growl
    w_app = np.zeros((int(1.15 * SR), 2), dtype=np.float64)
    mix_layer(w_app, extract_slice("creature_wolf_howl_02.wav", start_s=1.85, dur_s=1.10, semitones=-1.5, fade_in_s=0.03, fade_out_s=0.22, hpf_hz=90.0, lpf_hz=4800.0), 0.0, 0.92)
    mix_layer(w_app, extract_slice("creature_dog_growl_01.wav", start_s=0.10, dur_s=0.85, semitones=-2.0, fade_in_s=0.02, fade_out_s=0.18, hpf_hz=70.0), 0.15, 0.75)
    export_mp3_and_wav(master_and_normalize(w_app, hpf_hz=70.0, warm_body_hz=165.0, warm_body_db=3.2, target_rms_db=-17.2, peak_limit_db=-1.5), [voices_dir / "werewolf__appear.mp3", VOICES_SLICED_DIR / "werewolf__appear.mp3"])

    # 4. werewolf__hurt & werewolf__yelp & werewolf__death: canine snarl-yelp & dying wolf howl
    w_hurt = extract_slice("creature_dog_snarl_angry_02.wav", start_s=10.05, dur_s=0.52, semitones=1.5, fade_in_s=0.005, fade_out_s=0.10, hpf_hz=95.0, lpf_hz=6200.0)
    export_mp3_and_wav(master_and_normalize(w_hurt, hpf_hz=90.0, target_rms_db=-17.2, peak_limit_db=-1.5), [voices_dir / "werewolf__hurt.mp3", VOICES_SLICED_DIR / "werewolf__hurt.mp3"])

    w_yelp = extract_slice("creature_dog_snarl_angry_02.wav", start_s=8.10, dur_s=0.48, semitones=2.5, fade_in_s=0.005, fade_out_s=0.10, hpf_hz=110.0, lpf_hz=6400.0)
    export_mp3_and_wav(master_and_normalize(w_yelp, hpf_hz=100.0, target_rms_db=-17.2, peak_limit_db=-1.5), [voices_dir / "werewolf__yelp.mp3", VOICES_SLICED_DIR / "werewolf__yelp.mp3"])

    w_death = np.zeros((int(1.05 * SR), 2), dtype=np.float64)
    mix_layer(w_death, extract_doppler_slice("creature_wolf_howl_02.wav", start_s=2.10, dur_s=0.98, semitones_start=0.0, semitones_end=-5.0, fade_in_s=0.01, fade_out_s=0.22, hpf_hz=80.0, lpf_hz=4400.0), 0.0, 0.92)
    mix_layer(w_death, extract_slice("creature_beast_snarl_01.wav", start_s=0.85, dur_s=0.85, semitones=-3.0, fade_in_s=0.01, fade_out_s=0.20, hpf_hz=65.0, lpf_hz=3800.0), 0.02, 0.85)
    export_mp3_and_wav(master_and_normalize(w_death, hpf_hz=65.0, warm_body_hz=155.0, warm_body_db=3.5, target_rms_db=-16.0, peak_limit_db=-1.2), [voices_dir / "werewolf__death.mp3", VOICES_SLICED_DIR / "werewolf__death.mp3"])

    # B. Black Knight Dark Armored Voices (Replacing karate "Ksha!" with v2_enemy_black_knight_orus + plate clatter!)
    bk_orus = TTS_DIR / "v2_enemy_black_knight_orus.mp3"
    bk_v5 = TTS_DIR / "v5_enemy_black_knight.wav"
    if bk_orus.exists():
        bk_atk1 = slice_voice_window(bk_orus, 2.02, 3.12, target_rms_db=-17.5)
        mix_layer(bk_atk1, extract_slice("foley_metal_plate_drop_01.wav", start_s=0.01, dur_s=0.45, semitones=-2.0, fade_in_s=0.003, fade_out_s=0.10, hpf_hz=75.0, lpf_hz=5400.0), 0.0, 0.55)
        export_mp3_and_wav(normalize_stereo(bk_atk1, target_rms_db=-17.2, peak_limit_db=-1.4), [voices_dir / "black_knight__attack.mp3", VOICES_SLICED_DIR / "black_knight__attack.mp3"])

        bk_atk2 = slice_voice_window(bk_orus, 3.18, 4.48, target_rms_db=-17.5)
        mix_layer(bk_atk2, extract_slice("foley_chain_drop_05.wav", start_s=0.01, dur_s=0.45, semitones=-1.5, fade_in_s=0.003, fade_out_s=0.10, hpf_hz=85.0, lpf_hz=5600.0), 0.0, 0.55)
        export_mp3_and_wav(normalize_stereo(bk_atk2, target_rms_db=-17.2, peak_limit_db=-1.4), [voices_dir / "black_knight__attack_2.mp3", VOICES_SLICED_DIR / "black_knight__attack_2.mp3"])

        bk_hurt = slice_voice_window(bk_orus, 5.05, 5.85, target_rms_db=-17.5)
        export_mp3_and_wav(bk_hurt, [voices_dir / "black_knight__hurt.mp3", VOICES_SLICED_DIR / "black_knight__hurt.mp3"])

        bk_death = slice_voice_window(bk_orus, 5.05, 7.05, target_rms_db=-15.8)
        export_mp3_and_wav(bk_death, [voices_dir / "black_knight__death.mp3", VOICES_SLICED_DIR / "black_knight__death.mp3"])

    if bk_v5.exists():
        bk_atk3 = slice_voice_window(bk_v5, 2.40, 3.20, target_rms_db=-17.5)
        export_mp3_and_wav(bk_atk3, [voices_dir / "black_knight__attack_3.mp3", VOICES_SLICED_DIR / "black_knight__attack_3.mp3"])

    # C. Expanded Hero Finisher, Hurt & Dramatic Death Voices (Fixing "Seiya!" spam & weak Hero deaths!)
    k_v4_14 = TTS_DIR / "v4_hero_knight_14yo_enzo.mp3"
    k_v4 = TTS_DIR / "v4_hero_knight_enzo.mp3"
    k_t03 = TTS_DIR / "test_03_chibi_knight_dramatic_nonverbal.mp3"
    if k_v4_14.exists():
        export_mp3_and_wav(slice_voice_window(k_v4_14, 2.08, 2.66, target_rms_db=-16.8), [voices_dir / "knight_enzo__finisher_2.mp3"])
        # Dramatic multi-breath Knight death 2 + plate collapse
        kd2 = slice_voice_window(k_v4_14, 5.10, 6.38, target_rms_db=-14.2)
        export_mp3_and_wav(kd2, [voices_dir / "knight_enzo__death_2.mp3"])
    if k_v4.exists():
        export_mp3_and_wav(slice_voice_window(k_v4, 3.44, 3.86, target_rms_db=-16.8), [voices_dir / "knight_enzo__finisher_3.mp3"])
        export_mp3_and_wav(slice_voice_window(k_v4, 4.56, 4.88, target_rms_db=-17.2), [voices_dir / "knight_enzo__hurt_2.mp3"])
        # Primary dramatic Knight death 1 ("Haa... haa... Uwaaaah!", 1.90s at -14.0 dB RMS!)
        kd1 = slice_voice_window(k_v4, 6.22, 8.18, target_rms_db=-14.0)
        export_mp3_and_wav(kd1, [voices_dir / "knight_enzo__death.mp3", VOICES_SLICED_DIR / "knight_enzo__death.mp3"])
    if k_t03.exists():
        export_mp3_and_wav(slice_voice_window(k_t03, 1.98, 2.55, target_rms_db=-16.8), [voices_dir / "knight_enzo__finisher_4.mp3"])

    m_v4_14 = TTS_DIR / "v4_hero_mage_14yo_lumi.mp3"
    m_rina = TTS_DIR / "v5_hero_mage_rina.wav"
    m_t04 = TTS_DIR / "test_04_chibi_mage_dramatic_nonverbal.mp3"
    if m_v4_14.exists():
        export_mp3_and_wav(slice_voice_window(m_v4_14, 4.96, 5.36, target_rms_db=-16.8), [voices_dir / "mage_lumi__finisher_2.mp3"])
        export_mp3_and_wav(slice_voice_window(m_v4_14, 9.32, 9.84, target_rms_db=-17.2), [voices_dir / "mage_lumi__hurt_2.mp3"])
        # Primary dramatic Mage death 1 ("Aaah... Aya... Kyaaa!", 1.95s at -14.0 dB RMS!)
        md1 = slice_voice_window(m_v4_14, 9.32, 11.34, target_rms_db=-14.0)
        export_mp3_and_wav(md1, [voices_dir / "mage_lumi__death.mp3", VOICES_SLICED_DIR / "mage_lumi__death.mp3"])
    if m_rina.exists():
        export_mp3_and_wav(slice_voice_window(m_rina, 1.02, 1.48, target_rms_db=-16.8), [voices_dir / "mage_lumi__finisher_3.mp3"])
    if m_t04.exists():
        md2 = slice_voice_window(m_t04, 6.20, 8.36, target_rms_db=-14.2)
        export_mp3_and_wav(md2, [voices_dir / "mage_lumi__death_2.mp3"])

    # D. Re-level all routine attack/cast/dodge voice clips in `voices/` so NO voice sits at -10..-12 dB!
    for vp in sorted(voices_dir.glob("*.mp3")):
        nm = vp.name
        if "death" in nm:
            continue
        is_fin = "finisher" in nm or "roar" in nm
        is_atk_or_cast = any(k in nm for k in ("__atk_", "__cast_", "__dodge_", "__attack", "__appear", "__idle"))
        if is_fin or is_atk_or_cast:
            data = decode_any_audio(vp)
            target_db = -16.8 if is_fin else -18.8
            leveled = normalize_stereo(data, target_rms_db=target_db, peak_limit_db=-2.0)
            export_mp3_and_wav(leveled, [vp])

    # E. All-Archetype Enemy Windup Foley Cues (`enemies/`)
    # 1. Black Knight plate & greatsword cleave
    c_ebk = np.zeros((int(0.48 * SR), 2), dtype=np.float64)
    mix_layer(c_ebk, extract_slice("foley_metal_plate_drop_01.wav", start_s=0.01, dur_s=0.42, semitones=-2.0, fade_in_s=0.003, fade_out_s=0.10, hpf_hz=75.0, lpf_hz=5800.0), 0.0, 0.92)
    mix_layer(c_ebk, extract_slice("foley_chain_drop_05.wav", start_s=0.01, dur_s=0.38, semitones=-1.0, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=110.0), 0.02, 0.78)
    mix_layer(c_ebk, extract_slice("air_whoosh_deep_04.wav", start_s=0.20, dur_s=0.42, semitones=-1.5, fade_in_s=0.005, fade_out_s=0.09, hpf_hz=70.0), 0.04, 0.90)
    export_mp3_and_wav(master_and_normalize(c_ebk, hpf_hz=65.0, target_rms_db=-15.6, peak_limit_db=-1.1), [enemies_dir / "enemy_black_knight_plate_cleave.mp3"])

    # 2. Necromancer eerie arcane hum + bone-staff rattle
    c_enec = np.zeros((int(0.62 * SR), 2), dtype=np.float64)
    mix_layer(c_enec, extract_slice("instr_tibetan_bowl_01.wav", start_s=1.5, dur_s=0.58, semitones=-6.0, fade_in_s=0.015, fade_out_s=0.14, hpf_hz=90.0, lpf_hz=3200.0), 0.0, 0.85)
    mix_layer(c_enec, extract_slice("foley_wood_staff_clatter_01.wav", start_s=0.0, dur_s=0.48, semitones=-1.5, fade_in_s=0.003, fade_out_s=0.10, hpf_hz=95.0), 0.01, 0.82)
    mix_layer(c_enec, extract_slice("foley_bones_rattle_01.wav", start_s=0.02, dur_s=0.50, semitones=-1.0, fade_in_s=0.005, fade_out_s=0.12, hpf_hz=110.0), 0.03, 0.75)
    export_mp3_and_wav(master_and_normalize(c_enec, hpf_hz=80.0, target_rms_db=-16.0, peak_limit_db=-1.2), [enemies_dir / "enemy_necromancer_dark_chant.mp3"])

    # 3. Frost Golem glacier stomp & ice-crack windup
    c_efg = np.zeros((int(0.72 * SR), 2), dtype=np.float64)
    mix_layer(c_efg, extract_slice("ice_lake_groan_02.wav", start_s=1.15, dur_s=0.68, semitones=-3.0, fade_in_s=0.01, fade_out_s=0.15, hpf_hz=45.0, lpf_hz=3200.0), 0.0, 0.98)
    mix_layer(c_efg, extract_slice("earth_boulder_smash_01.wav", start_s=0.0, dur_s=0.62, semitones=-2.5, fade_in_s=0.003, fade_out_s=0.14, hpf_hz=38.0, lpf_hz=1400.0), 0.04, 0.95)
    mix_layer(c_efg, extract_slice("ice_cracking_snap_02.wav", start_s=0.04, dur_s=0.58, semitones=-2.0, fade_in_s=0.005, fade_out_s=0.12, hpf_hz=110.0), 0.02, 0.82)
    export_mp3_and_wav(master_and_normalize(c_efg, hpf_hz=38.0, target_rms_db=-15.0, peak_limit_db=-0.9), [enemies_dir / "boss_frost_golem_glacier_stomp.mp3"])

    # 4. Orc Raider heavy axe rush & chain rattle
    c_eorc = np.zeros((int(0.44 * SR), 2), dtype=np.float64)
    mix_layer(c_eorc, extract_slice("foley_armor_drop_04.wav", start_s=0.0, dur_s=0.38, semitones=-1.0, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=80.0), 0.0, 0.88)
    mix_layer(c_eorc, extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=0.40, semitones=0.0, fade_in_s=0.004, fade_out_s=0.08, hpf_hz=75.0), 0.03, 0.92)
    export_mp3_and_wav(master_and_normalize(c_eorc, hpf_hz=70.0, target_rms_db=-16.0, peak_limit_db=-1.2), [enemies_dir / "enemy_orc_raider_axe_rush.mp3"])

    # 5. Plant Warrior briar-vine whip & wood creak
    c_eplt = np.zeros((int(0.42 * SR), 2), dtype=np.float64)
    mix_layer(c_eplt, extract_slice("foley_wood_planks_02.wav", start_s=0.04, dur_s=0.38, semitones=1.0, fade_in_s=0.003, fade_out_s=0.08, hpf_hz=90.0), 0.0, 0.88)
    mix_layer(c_eplt, extract_slice("elec_whip_heavy_02.wav", start_s=0.02, dur_s=0.32, semitones=-2.5, fade_in_s=0.002, fade_out_s=0.07, hpf_hz=140.0, lpf_hz=4800.0), 0.02, 0.78)
    export_mp3_and_wav(master_and_normalize(c_eplt, hpf_hz=85.0, target_rms_db=-16.2, peak_limit_db=-1.2), [enemies_dir / "enemy_plant_warrior_thorn_whip.mp3"])

    # 6. Skeleton Minion dry bone-rattle slash windup
    c_eskm = np.zeros((int(0.36 * SR), 2), dtype=np.float64)
    mix_layer(c_eskm, extract_slice("foley_bones_rattle_01.wav", start_s=0.01, dur_s=0.32, semitones=1.5, fade_in_s=0.002, fade_out_s=0.07, hpf_hz=110.0), 0.0, 0.92)
    mix_layer(c_eskm, extract_slice("air_whoosh_deep_04.wav", start_s=0.24, dur_s=0.30, semitones=2.5, fade_in_s=0.003, fade_out_s=0.06, hpf_hz=110.0), 0.03, 0.82)
    export_mp3_and_wav(master_and_normalize(c_eskm, hpf_hz=95.0, target_rms_db=-16.4, peak_limit_db=-1.3), [enemies_dir / "enemy_skeleton_minion_clatter.mp3"])

    # 7. Also upgrade Werewolf pounce foley with real beast snarl + claw whoosh
    c_ewolf = np.zeros((int(0.48 * SR), 2), dtype=np.float64)
    mix_layer(c_ewolf, extract_slice("creature_dog_growl_01.wav", start_s=0.08, dur_s=0.44, semitones=-1.0, fade_in_s=0.004, fade_out_s=0.09, hpf_hz=75.0), 0.0, 0.92)
    mix_layer(c_ewolf, extract_slice("air_whoosh_deep_04.wav", start_s=0.22, dur_s=0.40, semitones=1.5, fade_in_s=0.004, fade_out_s=0.08, hpf_hz=90.0), 0.04, 0.90)
    export_mp3_and_wav(master_and_normalize(c_ewolf, hpf_hz=70.0, target_rms_db=-15.8, peak_limit_db=-1.1), [enemies_dir / "enemy_werewolf_stalk_and_pounce.mp3"])
    print("  [OK] Built true Werewolf/Black Knight/Hero voices & all-archetype enemy foley!")


def main() -> None:
    print("=== Running AAA Audio Bank Upgrades (`build_aaa_upgrades.py`) ===")
    build_ambience_loops()
    build_subtle_footsteps_and_dodges()
    build_acoustic_ui_and_sacred()
    build_boosted_weapons_shields_impacts()
    build_creature_and_hero_voices_and_enemy_foley()
    print("=== All AAA Audio Bank Upgrades Complete ===")


if __name__ == "__main__":
    main()
