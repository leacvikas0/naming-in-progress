#!/usr/bin/env python3
"""
sfx-foley/harness/build_runtime_audio_bank.py

Consolidates all verified, audited, warm-mastered audio into the clean runtime bank:
  `world/assets/audio/sfx/` + `world/assets/audio/sfx/sfx-manifest.json`

Sources:
  1. `sfx-foley/sword-lab/sfx_bank/`
     - 36 Warm-De-Crisped Swords (`steel`, `ice`, `fire` x `combo1..4` x `varA/B/C`)
     - 4 Shield/Parry/Bash + Perfect Dodge Bowl
     - 10 Light Ghibli HUD/UI (fixed non-MIDI Karplus-Strong harp & ceramic ticks)
     - 5 Sacred Stones & Prayer Ceremony (fixed non-buzzer harp/droplets/roots)
     - 10 Dodge Rolls + Bone/Armor/Flesh/Player Hit Impacts
  2. `sfx-foley/knight-h3-lab/slices/`
     - Real MiniMax H3 V2A Knight Sword Dragons ([E] Glacial Tide & Hinokami Sunfire)
     - Real MiniMax H3 V2A Knight [Q]/[X] Twin-Element Dragon Awakening Ult
  3. `sfx-foley/mage-h3-lab/slices/`
     - 14 Real MiniMax H3 V2A Mage Bolts (`combo1..3`, `nova`), `Frost Lance`, `Shatterlance`,
       `Cinder Fall`, `Storm Lance`, and `Q: Starfall` Invocation + Meteors
  4. `sfx-foley/slices/slices/` (strictly audited H3 keepers only -> anti-fizz `9.0 kHz` smoothed)
     - 3 Detonations (`shatterblow`, `solar_flare`, `thunderchain`)
     - Single-step footsteps peak-sliced cleanly from 4-step real H3 tracks:
       `footstep_grass_1..4`, `footstep_cobble_1..4`, `footstep_stone_1..4`
     - Keeper enemy/boss action foley (`boss_orc_brute_slam`, `enemy_werewolf_stalk_and_pounce`,
       `enemy_skeleton_warrior_shield_and_chop`, etc.) + H3 impact variations
  5. `sfx-foley/voices-sliced/`
     - All 65 approved `v5` Enzo, Lumi, and Monster/Boss vocal shots (`voice_slices_manifest.json`)
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List

import numpy as np
from scipy import signal
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "world" / "assets" / "audio" / "sfx"
SWORD_LAB_BANK = ROOT / "sfx-foley" / "sword-lab" / "sfx_bank"
KNIGHT_H3_SLICES = ROOT / "sfx-foley" / "knight-h3-lab" / "slices" / "slices"
MAGE_H3_SLICES = ROOT / "sfx-foley" / "mage-h3-lab" / "slices" / "slices"
LEGACY_H3_SLICES = ROOT / "sfx-foley" / "slices" / "slices"
VOICES_SLICED = ROOT / "sfx-foley" / "voices-sliced"

SR = 48000


def _encode_clean_mp3(audio: np.ndarray, sr: int, dst_mp3: Path, bitrate: str = "192k") -> float:
    dst_mp3.parent.mkdir(parents=True, exist_ok=True)
    tmp_wav = dst_mp3.with_suffix(".tmp.wav")
    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=1)
    audio = audio - np.mean(audio, axis=0, keepdims=True)
    pk = float(np.max(np.abs(audio))) + 1e-8
    if pk > 0.89:
        audio = (audio / pk) * 0.89
    sf.write(str(tmp_wav), audio.astype(np.float32), sr, subtype="PCM_16")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp_wav), "-ar", str(SR), "-b:a", bitrate, str(dst_mp3)],
        check=True,
    )
    tmp_wav.unlink(missing_ok=True)
    return round(len(audio) / float(sr), 3)


def _butter_eq(audio: np.ndarray, sr: int, hpf_hz: float = 42.0, lpf_hz: float = 9000.0) -> np.ndarray:
    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=1)
    y = audio.astype(np.float64)
    nyq = 0.5 * sr
    if hpf_hz > 20.0:
        sos_hp = signal.butter(2, min(hpf_hz / nyq, 0.9), btype="highpass", output="sos")
        y = signal.sosfilt(sos_hp, y, axis=0)
    if lpf_hz < nyq * 0.95:
        sos_lp = signal.butter(3, min(lpf_hz / nyq, 0.95), btype="lowpass", output="sos")
        y = signal.sosfilt(sos_lp, y, axis=0)
    return y


def _polish_and_copy(src_audio: Path, dst_mp3: Path, hpf_hz: float = 42.0, lpf_hz: float = 9000.0, gain_db: float = 0.0) -> float:
    wav_cand = src_audio.with_suffix(".wav")
    src = wav_cand if wav_cand.exists() else src_audio
    data, sr = sf.read(str(src), dtype="float32")
    y = _butter_eq(data, sr, hpf_hz=hpf_hz, lpf_hz=lpf_hz)
    if abs(gain_db) > 0.05:
        y *= 10.0 ** (gain_db / 20.0)
    return _encode_clean_mp3(y, sr, dst_mp3, bitrate="192k")


def _slice_4steps_file(src_path: Path, dst_dir: Path, prefix: str, hpf_hz: float = 150.0, lpf_hz: float = 8200.0) -> List[Dict]:
    wav_cand = src_path.with_suffix(".wav")
    src = wav_cand if wav_cand.exists() else src_path
    data, sr = sf.read(str(src), dtype="float32")
    y = _butter_eq(data, sr, hpf_hz=hpf_hz, lpf_hz=lpf_hz)
    mono = np.mean(np.abs(y), axis=1)

    # Smooth RMS envelope (~15ms) to locate the 4 clearest footstep impact peaks
    win_len = max(16, int(0.015 * sr))
    env = np.convolve(mono, np.ones(win_len) / win_len, mode="same")
    min_sep = int(0.24 * sr)
    peaks: List[int] = []
    # Mask sorted maxima greedily >= 0.24s apart
    order = np.argsort(env)[::-1]
    for idx in order:
        if len(peaks) >= 4:
            break
        if env[idx] < float(np.max(env)) * 0.22:
            break
        if all(abs(int(idx) - p) >= min_sep for p in peaks):
            peaks.append(int(idx))
    peaks.sort()

    # Fallback equal split if recording differs unexpectedly
    if len(peaks) < 3:
        step = len(y) // 4
        peaks = [int((k + 0.35) * step) for k in range(4)]

    results = []
    pre_s = int(0.030 * sr)
    post_s = int(0.185 * sr)
    for k, pk_idx in enumerate(peaks[:4]):
        s0 = max(0, pk_idx - pre_s)
        s1 = min(len(y), pk_idx + post_s)
        if k + 1 < len(peaks):
            # Stop at midpoint energy valley before next step
            mid = (pk_idx + peaks[k + 1]) // 2
            s1 = min(s1, mid)
        seg = y[s0:s1].copy()
        fi = min(int(0.004 * sr), len(seg) // 4)
        fo = min(int(0.028 * sr), len(seg) // 3)
        if fi > 2:
            seg[:fi] *= np.linspace(0.0, 1.0, fi)[:, None]
        if fo > 2:
            seg[-fo:] *= np.linspace(1.0, 0.0, fo)[:, None]
        # Per-step RMS normalize to uniform gentle footstep floor
        rms = float(np.sqrt(np.mean(seg * seg))) + 1e-7
        seg = seg * (0.095 / rms)
        seg = np.clip(seg, -0.75, 0.75)

        out_name = f"{prefix}_{k + 1}.mp3"
        dur_s = _encode_clean_mp3(seg, sr, dst_dir / out_name, bitrate="160k")
        results.append({"name": out_name, "url": f"./assets/audio/sfx/foley/{out_name}", "durationSec": dur_s})
    return results


def _copy_if_exists(src: Path, dst: Path) -> bool:
    if not src.exists():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: Dict[str, object] = {
        "schemaVersion": "1.0.0-amarante-runtime-sfx",
        "cues": {},
        "voices": {},
    }
    cues: Dict[str, List[str]] = {}

    def add_cue(key: str, url: str):
        cues.setdefault(key, []).append(url)

    # 1. Warm Swords (`sword-lab/sfx_bank`)
    swords_dst = OUT_DIR / "swords"
    for style_key, file_prefix in [("none", "steel"), ("rime", "ice"), ("solar", "fire")]:
        for combo_idx, c_name in [(0, "combo1"), (1, "combo2"), (2, "combo3"), (3, "combo4_heavy")]:
            for var_tag in ("varA", "varB", "varC"):
                fn = f"sword_{file_prefix}_{c_name}_{var_tag}.mp3"
                if _copy_if_exists(SWORD_LAB_BANK / fn, swords_dst / fn):
                    cue_id = (
                        f"sword_heavy_{style_key}"
                        if combo_idx == 3
                        else f"sword_{style_key}_c{combo_idx + 1}"
                    )
                    add_cue(cue_id, f"./assets/audio/sfx/swords/{fn}")

    # 2. Knight Dragons ([E]) & [Q]/[X] Ult (`knight-h3-lab` H3 V2A!)
    dragons_dst = OUT_DIR / "dragons"
    for fn, cue_id in [
        ("knight_e_ice_dragon_wide.mp3", "dragon_ice"),
        ("knight_e_ice_dragon_close.mp3", "dragon_ice"),
        ("knight_e_fire_dragon_wide.mp3", "dragon_fire"),
        ("knight_e_fire_dragon_close.mp3", "dragon_fire"),
        ("knight_q_twin_dragon_wide.mp3", "knight_q_ult"),
        ("knight_q_twin_dragon_close.mp3", "knight_q_ult"),
    ]:
        src_p = KNIGHT_H3_SLICES / fn
        if _copy_if_exists(src_p, dragons_dst / fn):
            add_cue(cue_id, f"./assets/audio/sfx/dragons/{fn}")

    # 3. Shield, Parry, Bash & Time Dilation (`sword-lab/sfx_bank`)
    shield_dst = OUT_DIR / "shield"
    for fn, cue_id in [
        ("knight_shield_raise.mp3", "shield_raise"),
        ("knight_shield_block_clang.mp3", "shield_block"),
        ("knight_shield_parry_ring.mp3", "shield_parry"),
        ("knight_shield_bash.mp3", "shield_bash"),
        ("perfect_dodge_time_dilation.mp3", "perfect_dodge"),
    ]:
        if _copy_if_exists(SWORD_LAB_BANK / fn, shield_dst / fn):
            add_cue(cue_id, f"./assets/audio/sfx/shield/{fn}")

    # 4. Mage H3 V2A Spells & Bolts (`mage-h3-lab/slices/slices`)
    mage_dst = OUT_DIR / "mage"
    for fn, cue_id in [
        ("mage_bolt_combo1.mp3", "mage_bolt_1"),
        ("mage_bolt_combo2.mp3", "mage_bolt_2"),
        ("mage_bolt_combo3.mp3", "mage_bolt_3"),
        ("mage_bolt_combo4_nova.mp3", "mage_bolt_nova"),
        ("mage_e_frost_lance_corridor.mp3", "spell_frost_lance"),
        ("mage_e_frost_lance_apex_close.mp3", "spell_frost_lance"),
        ("mage_shatterlance_charge.mp3", "spell_shatterlance_charge"),
        ("mage_shatterlance_launch_shatter.mp3", "spell_shatterlance"),
        ("mage_e_cinder_fall_wide.mp3", "spell_cinder_fall"),
        ("mage_e_cinder_fall_impact_close.mp3", "spell_cinder_fall"),
        ("mage_storm_lance_wide.mp3", "spell_storm_lance"),
        ("mage_storm_lance_cluster_close.mp3", "spell_storm_lance"),
        ("mage_q_starfall_invocation.mp3", "mage_q_ult"),
        ("mage_q_starfall_single_meteor.mp3", "mage_q_meteor"),
    ]:
        if _copy_if_exists(MAGE_H3_SLICES / fn, mage_dst / fn):
            add_cue(cue_id, f"./assets/audio/sfx/mage/{fn}")

    # 5. Elemental Detonations (Audited H3 slices with 8.9 kHz smooth anti-fizz LPF)
    det_dst = OUT_DIR / "detonations"
    for src_name, cue_id in [
        ("detonation_shatterblow.mp3", "detonation_shatterblow"),
        ("detonation_solar_flare.mp3", "detonation_solar_flare"),
        ("detonation_thunderchain.mp3", "detonation_thunderchain"),
    ]:
        src_p = LEGACY_H3_SLICES / src_name
        if src_p.exists() or src_p.with_suffix(".wav").exists():
            _polish_and_copy(src_p, det_dst / src_name, hpf_hz=36.0, lpf_hz=8900.0)
            add_cue(cue_id, f"./assets/audio/sfx/detonations/{src_name}")

    # 6. Combat Impacts & Player Hit (`sword-lab` crisp 3-var impacts + H3 impact variations!)
    imp_dst = OUT_DIR / "impacts"
    for fn, cue_id in [
        ("hit_bone_1.mp3", "hit_bone"),
        ("hit_bone_2.mp3", "hit_bone"),
        ("hit_bone_3.mp3", "hit_bone"),
        ("hit_armor_1.mp3", "hit_armor"),
        ("hit_armor_2.mp3", "hit_armor"),
        ("hit_armor_3.mp3", "hit_armor"),
        ("hit_flesh_1.mp3", "hit_flesh"),
        ("hit_flesh_2.mp3", "hit_flesh"),
        ("hit_flesh_3.mp3", "hit_flesh"),
        ("player_hit_thud.mp3", "player_hit"),
    ]:
        if _copy_if_exists(SWORD_LAB_BANK / fn, imp_dst / fn):
            add_cue(cue_id, f"./assets/audio/sfx/impacts/{fn}")

    for src_name, cue_id in [
        ("hit_impact_skeleton_bone.mp3", "hit_bone"),
        ("hit_impact_armored_knight.mp3", "hit_armor"),
        ("hit_impact_flesh_beast.mp3", "hit_flesh"),
        ("player_hit_damage_thud.mp3", "player_hit_heavy"),
    ]:
        src_p = LEGACY_H3_SLICES / src_name
        if src_p.exists() or src_p.with_suffix(".wav").exists():
            _polish_and_copy(src_p, imp_dst / src_name, hpf_hz=50.0, lpf_hz=8800.0)
            add_cue(cue_id, f"./assets/audio/sfx/impacts/{src_name}")

    # 7. Locomotion (Dodges + Crisp Peak-Sliced Single Footsteps from Real H3 Tracks!)
    foley_dst = OUT_DIR / "foley"
    foley_dst.mkdir(parents=True, exist_ok=True)
    for fn, cue_id in [("dodge_knight.mp3", "dodge_knight"), ("dodge_mage.mp3", "dodge_mage")]:
        if _copy_if_exists(SWORD_LAB_BANK / fn, foley_dst / fn):
            add_cue(cue_id, f"./assets/audio/sfx/foley/{fn}")
    for src_name, cue_id in [
        ("knight_dodge_roll_heavy.mp3", "dodge_knight"),
        ("mage_dodge_dash_silk.mp3", "dodge_mage"),
    ]:
        src_p = LEGACY_H3_SLICES / src_name
        if src_p.exists() or src_p.with_suffix(".wav").exists():
            _polish_and_copy(src_p, foley_dst / src_name, hpf_hz=85.0, lpf_hz=8800.0)
            add_cue(cue_id, f"./assets/audio/sfx/foley/{src_name}")

    for src_name, pref, cue_id in [
        ("footstep_meadow_grass.mp3", "footstep_grass", "footstep_grass"),
        ("footstep_cobblestone_plaza.mp3", "footstep_cobble", "footstep_cobble"),
        ("footstep_stone_steps_mage.mp3", "footstep_stone", "footstep_stone"),
    ]:
        src_p = LEGACY_H3_SLICES / src_name
        if src_p.exists() or src_p.with_suffix(".wav").exists():
            sliced = _slice_4steps_file(src_p, foley_dst, pref, hpf_hz=150.0, lpf_hz=8400.0)
            for s in sliced:
                add_cue(cue_id, s["url"])

    # 8. HUD/UI & Sacred Stones/Prayers (`sword-lab/sfx_bank` Fixed Acoustic Studio Set!)
    ui_dst = OUT_DIR / "ui"
    for fn, cue_id in [
        ("ui_hover.mp3", "ui_hover"),
        ("ui_click.mp3", "ui_click"),
        ("ui_element_tab_ice.mp3", "ui_tab_ice"),
        ("ui_element_tab_fire.mp3", "ui_tab_fire"),
        ("ui_hero_swap.mp3", "ui_hero_swap"),
        ("ui_locked_thud.mp3", "ui_locked"),
        ("ui_modal_open.mp3", "ui_modal_open"),
        ("ui_modal_close.mp3", "ui_modal_close"),
        ("ui_level_up.mp3", "ui_level_up"),
        ("ui_victory_fanfare.mp3", "ui_victory"),
    ]:
        if _copy_if_exists(SWORD_LAB_BANK / fn, ui_dst / fn):
            add_cue(cue_id, f"./assets/audio/sfx/ui/{fn}")

    sacred_dst = OUT_DIR / "sacred"
    for fn, cue_id in [
        ("stone_inspect.mp3", "stone_inspect"),
        ("commune_start.mp3", "commune_start"),
        ("heal_verdict.mp3", "verdict_heal"),
        ("miracle_verdict.mp3", "verdict_miracle"),
        ("smite_verdict.mp3", "verdict_smite"),
    ]:
        if _copy_if_exists(SWORD_LAB_BANK / fn, sacred_dst / fn):
            add_cue(cue_id, f"./assets/audio/sfx/sacred/{fn}")

    # 9. Enemy Foley Keepers + All 65 Approved v5 Voices
    enemies_dst = OUT_DIR / "enemies"
    for src_name, cue_id in [
        ("enemy_skeleton_warrior_shield_and_chop.mp3", "enemy_foley_skeleton_warrior"),
        ("enemy_werewolf_stalk_and_pounce.mp3", "enemy_foley_werewolf"),
        ("boss_orc_brute_slam.mp3", "enemy_foley_boss_brute"),
    ]:
        src_p = LEGACY_H3_SLICES / src_name
        if src_p.exists() or src_p.with_suffix(".wav").exists():
            _polish_and_copy(src_p, enemies_dst / src_name, hpf_hz=45.0, lpf_hz=8800.0)
            add_cue(cue_id, f"./assets/audio/sfx/enemies/{src_name}")

    voices_dst = OUT_DIR / "voices"
    v_manifest_path = VOICES_SLICED / "voice_slices_manifest.json"
    voices_map: Dict[str, Dict[str, List[str]]] = {}
    if v_manifest_path.exists():
        v_raw = json.loads(v_manifest_path.read_text(encoding="utf-8"))
        for actor, items in v_raw.items():
            actor_map: Dict[str, List[str]] = {}
            for item in items:
                fn = item["file"]
                role = item["role"]
                if _copy_if_exists(VOICES_SLICED / fn, voices_dst / fn):
                    url = f"./assets/audio/sfx/voices/{fn}"
                    actor_map.setdefault(role, []).append(url)
            voices_map[actor] = actor_map

    manifest["cues"] = cues
    manifest["voices"] = voices_map
    manifest["summary"] = {
        "totalCueGroups": len(cues),
        "totalCueFiles": sum(len(v) for v in cues.values()),
        "totalVoiceActors": len(voices_map),
        "totalVoiceFiles": sum(len(urls) for roles in voices_map.values() for urls in roles.values()),
    }
    (OUT_DIR / "sfx-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("[RUNTIME BANK READY]", json.dumps(manifest["summary"], indent=2))


if __name__ == "__main__":
    main()
