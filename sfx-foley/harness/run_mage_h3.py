"""
Dedicated Warm-Mastered MiniMax H3 V2A Pipeline for Mage Spells & Attacks
(`sfx-foley/harness/run_mage_h3.py`).

Uses a SINGLE warm H200 container + exact CACHED_H3_IMAGE (0s image rebuild):
  1. Loads Qwen3-VL 32B & Video VAE ONCE to encode all 6 newly recorded Mage clips
     (`mage_h3_01` .. `mage_h3_06`), then cleanly unloads them.
  2. Loads `minimax_h3_ref2va_pruned_fp8_scaled.safetensors` & Audio VAE ONCE and builds
     the 50-layer Post-RoPE FlashAttention KV-Cache per clip across 16 steps (`cfg=1.8`).
  3. Applies `warm_cinema_foley_polish()`:
     - Category HPF (`38..85 Hz` rumble control)
     - Anti-Fizz Warm Cinema LPF (`8.8..9.4 kHz` smooth roll-off) + gentle `3.4 kHz` `-2.0 dB`
       de-harsh dip + `195 Hz` `+1.8 dB` tactile acoustic body
     - SPL differential transient snap on spell releases & meteor/lightning/ice impacts
     - Multi-window visual-synced digital silence gating (`cos^2` fades)
     - Single-pass `48 kHz` WAV + `320 kbps` MP3 + `_game_mux.mp4` + atomic beat slices.
  4. Saves to `/vol_outputs/mage_h3_lab/{stems,slices}` and commits after every clip.
"""

import gc
import os
import subprocess
import sys
import time
import wave
from pathlib import Path

os.environ["PYTHONIOENCODING"] = "utf-8"
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

import modal

app = modal.App("haru-machi-mage-h3-foley")

vol_models = modal.Volume.from_name("minimax-h3-models", create_if_missing=True)
vol_outputs = modal.Volume.from_name("minimax-h3-outputs", create_if_missing=True)

# Exact cached image definition from foley_service.py / h200_ctl.py (0s rebuild)
image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-devel-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install(
        "git",
        "wget",
        "curl",
        "libgl1",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "ffmpeg",
        "ninja-build",
        "build-essential",
    )
    .pip_install(
        "huggingface_hub[hf_transfer]",
        "hf_transfer",
        "safetensors",
        "websocket-client",
        "ninja",
        "packaging",
        "wheel",
        "psutil",
    )
    .env(
        {
            "HF_HUB_ENABLE_HF_TRANSFER": "1",
            "HF_TOKEN": "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",
            "PYTHONUNBUFFERED": "1",
            "CUDA_HOME": "/usr/local/cuda",
            "MAX_JOBS": "4",
        }
    )
    .run_commands(
        "pip install --no-cache-dir torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128",
        "pip install --no-cache-dir flash-attn==2.8.3 --no-build-isolation",
        "git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git /comfyui",
        "pip install --no-cache-dir -r /comfyui/requirements.txt",
        "pip install --no-cache-dir torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128",
        "git clone --depth 1 https://github.com/Jalen-Brunson/ComfyUI-MiniMax-H3-PDD-Acc.git /comfyui/custom_nodes/ComfyUI-MiniMax-H3-PDD-Acc",
        "git clone --depth 1 https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git /comfyui/custom_nodes/ComfyUI-VideoHelperSuite",
        "cd /comfyui/custom_nodes/ComfyUI-VideoHelperSuite && pip install --no-cache-dir -r requirements.txt",
        "git clone --depth 1 https://github.com/ltdrdata/ComfyUI-Manager.git /comfyui/custom_nodes/ComfyUI-Manager",
        "git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git /comfyui/custom_nodes/ComfyUI-KJNodes",
    )
)

COMFY_PATH = Path("/comfyui")
VOL_ROOT = Path("/vol")


def make_prompt(subj1: str, subj2: str, summary_body: str, shot_body: str, soundscape_body: str) -> str:
    return (
        "subject_definitions:\n"
        f"<Subject 1> is {subj1} in <Video 1>.\n"
        f"<Subject 2> is {subj2} in <Video 1>.\n"
        "<Video 1> is the source video for the target video edit.\n\n"
        "summary:\n"
        f"[video editing] The target video is an edited version of <Video 1>. {summary_body}\n\n"
        "retention_analysis:\n"
        "<Subject 1> (appears in [Shot 1]): fully_preserved - the courtyard, sky, fences, trees, and target dummy are retained.\n"
        "<Subject 2> (appears in [Shot 1]): fully_preserved - the Mage, staff, crystal projectiles, and elemental magic timing are retained.\n"
        "<Video 1> (cut and pacing structure): fully_preserved - framing and event timing are retained 1:1.\n\n"
        "detailed_description:\n"
        "The target video is in a stylized 3D animated game style.\n"
        f"[Shot 1] {shot_body}\n\n"
        "overall_soundscape:\n"
        f"{soundscape_body} Anechoic foley studio clarity with zero room tone, zero ambient wind, and complete digital silence during all pauses.\n\n"
        "non_diegetic_music:\n"
        "N/A"
    )


GAME_NEG_PROMPT = (
    "subject_definitions:\n"
    "<Subject 1> is the courtyard in <Video 1>.\n"
    "<Subject 2> is the Mage and spell effect in <Video 1>.\n"
    "<Video 1> is the source video.\n\n"
    "summary:\n"
    "[video editing] Muddy ambient scene with background music, piano chords, synth pads, dialogue, radio fizz, brittle harsh treble hiss, wind noise, and continuous noise during pauses.\n\n"
    "retention_analysis:\n"
    "<Subject 1>: fully_preserved\n"
    "<Subject 2>: fully_preserved\n"
    "<Video 1>: fully_preserved\n\n"
    "detailed_description:\n"
    "The target video is in a 3D animated style.\n"
    "[Shot 1] Background music, synthesizer chords, harp music, dialogue, speech, grunts, continuous wind hiss, radio static, brittle white-noise fizz, harsh ultrasonic ringing, and noise during silent gaps.\n\n"
    "overall_soundscape:\n"
    "Background music, synthesizer pad, wind noise, static hiss, brittle digital fizz, speech, dialogue.\n\n"
    "non_diegetic_music:\n"
    "Background music, synthesizer pad, piano, organ, brass, drums."
)


MAGE_CLIP_SPECS = [
    {
        "id": "mage_h3_01_bolts_and_nova",
        "video": "mage_h3_01_bolts_and_nova.mp4",
        "n_frames": 124,
        "seed": 101,
        "hpf_hz": 82.0,
        "lpf_hz": 9000.0,
        "sub_db": 1.8,
        "transient_amt": 0.42,
        "silence_windows": [[0.0, 0.22], [1.06, 1.38], [2.23, 2.55], [3.48, 3.80], [4.90, 5.167]],
        "beats": [
            {"id": "mage_bolt_combo1", "startSec": 0.23, "endSec": 1.05},
            {"id": "mage_bolt_combo2", "startSec": 1.39, "endSec": 2.22},
            {"id": "mage_bolt_combo3", "startSec": 2.56, "endSec": 3.47},
            {"id": "mage_bolt_combo4_nova", "startSec": 3.81, "endSec": 4.88},
        ],
        "prompt": make_prompt(
            "the sunlit dirt arena courtyard with the skeleton warrior target on the right",
            "the chibi Mage casting flying golden-blue crystal bolts and a starlight crystal nova orb from her staff",
            "It adds four tight, distinct tactile crystal-projectile launches and bone-impact shatters separated by complete silence.",
            (
                "From 00:00.000 to 00:00.250, complete silence. "
                "At 00:00.250, <Subject 2> snaps her staff forward launching a single glowing golden-cyan crystal bolt: a brief, woody oak-staff whip flicker, tight fluttering star-crystal dart travel, and a dry quartz crystal crack against skeleton bone by 00:01.000. "
                "From 00:01.080 to 00:01.400, complete silence. "
                "At 00:01.420, <Subject 2> fires two rapid crystalline starlight bolts: a nimble twin crystal-chime flick, fast air-slicing zip, and crisp double quartz-on-bone snap by 00:02.200. "
                "From 00:02.250 to 00:02.560, complete silence. "
                "At 00:02.580, <Subject 2> thrusts both hands firing a broad three-trail crystal volley: a warm low-mid resonant arcane release, weighty fluttering projectile rush, and a punchy multi-shard crystal burst on armor by 00:03.440. "
                "From 00:03.500 to 00:03.810, complete silence. "
                "At 00:03.830, <Subject 2> unleashes the heavy Starlight Nova orb: a deep, full-bodied wooden staff thump and warm glass pressure launch ending in a forceful crystalline nova pop and cascading solid ice-glass shards hitting the dirt ground by 00:04.860. "
                "From 00:04.920 to 00:05.167, complete silence."
            ),
            "Tactile woody staff cast flicks, crisp airborne crystal zips, and punchy quartz-shard impacts with zero synth pads or shrill static.",
        ),
    },
    {
        "id": "mage_h3_02_frost_lance",
        "video": "mage_h3_02_frost_lance.mp4",
        "n_frames": 124,
        "seed": 202,
        "hpf_hz": 44.0,
        "lpf_hz": 8900.0,
        "sub_db": 3.2,
        "transient_amt": 0.48,
        "silence_windows": [[0.0, 0.22], [2.58, 2.96], [4.90, 5.167]],
        "beats": [
            {"id": "mage_e_frost_lance_corridor", "startSec": 0.23, "endSec": 2.54},
            {"id": "mage_e_frost_lance_apex_close", "startSec": 2.97, "endSec": 4.86},
        ],
        "prompt": make_prompt(
            "the dirt courtyard with tall sapphire glacier crystals erupting from the ground toward the target",
            "the chibi Mage summoning the Frost Lance sweeping glacier corridor and colossal ice monoliths",
            "It adds a sweeping ground-rupturing glacier surge and an up-close towering glacier monolith eruption separated by complete silence.",
            (
                "From 00:00.000 to 00:00.250, complete silence. "
                "From 00:00.250 to 00:02.540, <Subject 2> slams her arcane energy downward triggering Frost Lance across the arena: a crisp initial freeze-lock snap, a deep tectonic rumbling crack tearing rapidly through earth and stone beneath erupting blue ice blades, culminating at 00:00.900 in a massive glacier crown monolith explosion and clear frozen lake-ice settling creaks. "
                "From 00:02.580 to 00:02.980, complete silence. "
                "From 00:03.000 to 00:04.860, a second close-up Frost Lance tears right into the foreground: a sharp sub-zero flash-freeze fissure crack, heavy interlocking glacier boulders grinding upward out of earth, and solid chunks of clear ice snapping open. "
                "From 00:04.920 to 00:05.167, complete silence."
            ),
            "Ground-splitting ice fissure rumble, heavy solid glacier monolith upheaval, and dry clear river-ice fracture foley.",
        ),
    },
    {
        "id": "mage_h3_03_shatterlance",
        "video": "mage_h3_03_shatterlance.mp4",
        "n_frames": 124,
        "seed": 303,
        "hpf_hz": 40.0,
        "lpf_hz": 9200.0,
        "sub_db": 3.8,
        "transient_amt": 0.52,
        "silence_windows": [[0.0, 0.22], [4.00, 5.167]],
        "beats": [
            {"id": "mage_shatterlance_charge", "startSec": 0.23, "endSec": 1.48},
            {"id": "mage_shatterlance_launch_shatter", "startSec": 1.46, "endSec": 3.92},
            {"id": "mage_shatterlance_full", "startSec": 0.23, "endSec": 3.92},
        ],
        "prompt": make_prompt(
            "the courtyard arena with a skeleton warrior target on the right",
            "the chibi Mage gathering 32 spiraling ice shards into a giant 4-meter fluted ice great-lance and firing it at supersonic speed",
            "It adds a tense spiraling crystal vortex assembly followed cleanly by a thunderous cryo-railgun launch and shattering ice-star explosion.",
            (
                "From 00:00.000 to 00:00.250, complete silence. "
                "From 00:00.250 to 00:01.480, as <Subject 2> holds her staff aloft, 32 glowing ice shards spiral inward locking around the hovering fluted great-lance: tight rhythmic crystal-on-crystal clicks, rising dense sub-bass vacuum tension, and taut frosted glass groaning under compression. "
                "At 00:01.500, the giant fluted great-lance shoots straight across the screen at supersonic velocity, detonating into the target and carving a massive white frost star into the dirt: a whip-fast air-punch release boom, thick shattering glacier armor explosion, and dozens of jagged ice wedges clattering across stone and earth until 00:03.900. "
                "From 00:04.000 to 00:05.167, complete silence."
            ),
            "Compressing spiraling ice-block locking clicks rising into a punchy supersonic cryo-railgun detonation and falling ice debris.",
        ),
    },
    {
        "id": "mage_h3_04_cinder_fall",
        "video": "mage_h3_04_cinder_fall.mp4",
        "n_frames": 124,
        "seed": 404,
        "hpf_hz": 38.0,
        "lpf_hz": 8800.0,
        "sub_db": 4.2,
        "transient_amt": 0.50,
        "silence_windows": [[0.0, 0.22], [2.58, 3.12], [4.92, 5.167]],
        "beats": [
            {"id": "mage_e_cinder_fall_wide", "startSec": 0.23, "endSec": 2.54},
            {"id": "mage_e_cinder_fall_impact_close", "startSec": 3.14, "endSec": 4.88},
        ],
        "prompt": make_prompt(
            "the sunlit dirt arena with a skeleton warrior target",
            "the chibi Mage hurling a blazing parabolic volcanic boulder asteroid that smashes into a lava crater and scatters burning basalt boulders",
            "It adds two full parabolic volcanic meteor launches and chest-hitting basalt-magma crater detonations separated by complete silence.",
            (
                "From 00:00.000 to 00:00.250, complete silence. "
                "At 00:00.250, <Subject 2> hurls a roaring lava-ribbed asteroid high across the air: a heavy flame-torch ignition whoosh and roaring downward meteor rush that slams into the dirt ground at 00:00.720 with an earth-shaking sub-bass basalt explosion, fracturing rock boulders bouncing once on the ground, and crackling hearth logs flaring until 00:02.500. "
                "From 00:02.580 to 00:03.140, complete silence. "
                "At 00:03.170, a second flaming volcanic meteor arcs overhead and smashes directly beside the camera: a concentrated pressurized flame streak culminating at 00:03.620 in a forceful volcanic rock detonation, tumbling heavy stone chunks, and warm charcoal embers snapping until 00:04.880. "
                "From 00:04.920 to 00:05.167, complete silence."
            ),
            "Heavy pressurized magma meteor flight, chest-thumping volcanic boulder impact, and tactile tumbling basalt stone and forge embers.",
        ),
    },
    {
        "id": "mage_h3_05_storm_lance",
        "video": "mage_h3_05_storm_lance.mp4",
        "n_frames": 124,
        "seed": 505,
        "hpf_hz": 42.0,
        "lpf_hz": 9100.0,
        "sub_db": 3.8,
        "transient_amt": 0.55,
        "silence_windows": [[0.0, 0.22], [2.26, 2.78], [4.82, 5.167]],
        "beats": [
            {"id": "mage_storm_lance_wide", "startSec": 0.23, "endSec": 2.22},
            {"id": "mage_storm_lance_cluster_close", "startSec": 2.80, "endSec": 4.78},
        ],
        "prompt": make_prompt(
            "the courtyard arena with three skeleton warriors on the right",
            "the chibi Mage firing an instantaneous cyan-gold helical lightning great-spear that arcs between targets and erupts dark obsidian fulgurite pillars",
            "It adds two sharp high-voltage thunderclap lightning lance strikes and erupting volcanic glass pillars separated by complete silence.",
            (
                "From 00:00.000 to 00:00.250, complete silence. "
                "At 00:00.250, a blinding helical lightning great-spear flashes across the courtyard, arcing across all three skeletons and punching jagged dark obsidian fulgurite pillars from the blackened earth: an immediate snappy high-voltage arc whip-crack, a deep chest-thumping dry thunderclap boom, three rapid electrical spark jumps, and glassy obsidian crystal pillars groaning and fracturing until 00:02.200. "
                "From 00:02.260 to 00:02.800, complete silence. "
                "At 00:02.830, a second close-range lightning great-spear strikes directly into the cluster: a tight ozone static snap, forceful lightning thunderburst, and dark obsidian fulgurite crystal spires fracturing cleanly until 00:04.760. "
                "From 00:04.830 to 00:05.167, complete silence."
            ),
            "Clean dry lightning thunderclap booms, distinct multi-arc electrical transformer snaps, and dense obsidian glass fracturing foley.",
        ),
    },
    {
        "id": "mage_h3_06_starfall_ultimate",
        "video": "mage_h3_06_starfall_ultimate.mp4",
        "n_frames": 141,
        "seed": 606,
        "hpf_hz": 38.0,
        "lpf_hz": 8800.0,
        "sub_db": 4.2,
        "transient_amt": 0.48,
        "silence_windows": [[0.0, 0.22], [1.48, 1.80], [5.28, 5.875]],
        "beats": [
            {"id": "mage_q_starfall_invocation", "startSec": 0.23, "endSec": 1.46},
            {"id": "mage_q_starfall_barrage_stem", "startSec": 1.82, "endSec": 5.24},
            {"id": "mage_q_starfall_single_meteor", "startSec": 2.15, "endSec": 3.05},
        ],
        "prompt": make_prompt(
            "the sunlit dirt arena with a large golden magic circle on the ground",
            "the chibi Mage raising her staff to invoke Sky Meteor Shower and calling down five rhythmic burning sky-meteors across the 8-meter ring",
            "It adds a clear, grounded celestial ring invocation followed by five crisp diagonal whistling sky-meteors slamming into rock.",
            (
                "From 00:00.000 to 00:00.250, complete silence. "
                "From 00:00.250 to 00:01.460, <Subject 2> raises her wooden staff high, sealing the glowing golden magic ring onto the dirt courtyard: a firm stone seal-lock thud, warm bronze temple bell harmonic resonance sweeping outward, and dense rising sky-wind pressure building overhead. "
                "From 00:01.480 to 00:01.810, complete silence holding the eye of the storm. "
                "From 00:01.830 to 00:05.240, five heavy burning meteors plummet diagonally down from the sky at steady intervals onto the outer ring: each meteor delivers a brief sharp atmospheric whistle followed immediately by a punchy, earth-shaking sub-bass boulder explosion smashing into stone slabs with dry flying basalt rubble. "
                "From 00:05.280 to 00:05.875, complete silence."
            ),
            "Grounded golden circle invocation bell and seal thump followed by crisp individual sky-meteor whistles and rock-shattering mortar booms.",
        ),
    },
]


def warm_cinema_foley_polish(
    wav_np,
    sr: int,
    hpf_hz: float,
    lpf_hz: float,
    sub_db: float,
    transient_amt: float,
    silence_windows: list,
):
    import numpy as np

    n = wav_np.shape[1]
    freqs = np.fft.rfftfreq(n, d=1.0 / sr)

    # 1. Clean low-end HPF + Anti-Fizz Warm Cinema LPF (rolls off >9 kHz diffusion hiss smoothly)
    hp_gain = 1.0 - (1.0 / (1.0 + (np.maximum(freqs, 1e-3) / max(24.0, hpf_hz)) ** 4))
    lp_gain = 1.0 / (1.0 + (freqs / max(4500.0, lpf_hz)) ** 6)

    # 2. Warm studio EQ curve: +1.8 dB @ 195 Hz body, -2.0 dB @ 3.4 kHz harsh notch, gentle -2.6 dB @ 6.2 kHz
    body_bell = 1.0 + 0.23 * np.exp(-0.5 * ((np.log2(np.maximum(freqs, 20.0) / 195.0)) / 0.55) ** 2)
    harsh_dip = 1.0 - 0.21 * np.exp(-0.5 * ((np.log2(np.maximum(freqs, 20.0) / 3400.0)) / 0.50) ** 2)
    air_tame = 1.0 - 0.25 * np.exp(-0.5 * ((np.log2(np.maximum(freqs, 20.0) / 6200.0)) / 0.48) ** 2)

    total_eq = hp_gain * lp_gain * body_bell * harsh_dip * air_tame
    sub_gain = 1.0 / (1.0 + (freqs / 128.0) ** 4)

    clean = np.zeros_like(wav_np)
    sub = np.zeros_like(wav_np)
    for ch in range(wav_np.shape[0]):
        spec = np.fft.rfft(wav_np[ch])
        clean[ch] = np.fft.irfft(spec * total_eq, n=n)
        sub[ch] = np.fft.irfft(spec * sub_gain, n=n)

    sub_weight = 0.0 if sub_db <= 0.1 else (0.11 * sub_db)
    sig = clean + sub_weight * np.tanh(sub * 1.9)

    # 3. SPL-style Differential Transient Shaper for crisp spell fire & meteor/ice impact snap
    mono_abs = np.mean(np.abs(sig), axis=0)
    k_fast = max(1, int(0.003 * sr))
    k_slow = max(1, int(0.042 * sr))
    env_fast = np.convolve(mono_abs, np.ones(k_fast, dtype=np.float32) / k_fast, mode="same")
    env_slow = np.convolve(mono_abs, np.ones(k_slow, dtype=np.float32) / k_slow, mode="same")
    trans_diff = np.maximum(0.0, env_fast - env_slow) / (env_slow + 1e-4)
    trans_gain = 1.0 + transient_amt * np.tanh(trans_diff)
    sig = sig * trans_gain[None, :]

    # 4. Gentle 20 dB noise gate below -52 dB so inter-transient air floor stays clean
    gate_rms = np.sqrt(np.convolve(mono_abs ** 2, np.ones(max(1, int(0.025 * sr)), dtype=np.float32) / max(1, int(0.025 * sr)), mode="same") + 1e-12)
    gate_gain = np.clip((gate_rms - 0.0022) / 0.0045, 0.0, 1.0)
    sig = sig * (0.25 + 0.75 * gate_gain)[None, :]

    # 5. Visual-synced silence windows with cos^2 ramps
    t = np.arange(n, dtype=np.float32) / sr
    env = np.ones(n, dtype=np.float32)
    fade_s = 0.035
    for w_start, w_end in silence_windows:
        if w_end <= w_start:
            continue
        in_win = (t >= w_start) & (t <= w_end)
        env_win = np.zeros(np.sum(in_win), dtype=np.float32)
        t_w = t[in_win]
        left_ramp = t_w < (w_start + fade_s)
        if w_start > 0.01 and np.any(left_ramp):
            env_win[left_ramp] = np.cos(0.5 * np.pi * (t_w[left_ramp] - w_start) / fade_s) ** 2
        env[in_win] = np.minimum(env[in_win], env_win)

    out = sig * env[None, :]
    # Gentle soft-clip safety + -1.2 dBFS peak normalization
    out = np.tanh(out * 0.92)
    pk = float(np.max(np.abs(out))) + 1e-8
    out = (out / pk) * 0.87
    return out.astype(np.float32)


def load_video_frames_tensor(mp4_path: Path, max_frames: int):
    import cv2
    import numpy as np
    import torch

    cap = cv2.VideoCapture(str(mp4_path))
    frames = []
    while len(frames) < max_frames:
        ok, bgr = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    cap.release()
    if len(frames) == 0:
        raise RuntimeError(f"Failed to read video frames from {mp4_path}")
    arr = np.stack(frames, axis=0).astype(np.float32) / 255.0
    return torch.from_numpy(arr)


def link_models_to_comfy():
    mapping = {
        VOL_ROOT / "diffusion_models": COMFY_PATH / "models" / "diffusion_models",
        VOL_ROOT / "text_encoders": COMFY_PATH / "models" / "text_encoders",
        VOL_ROOT / "vae": COMFY_PATH / "models" / "vae",
        VOL_ROOT / "pdd_acc": COMFY_PATH / "models" / "pdd_acc",
        VOL_ROOT / "loras": COMFY_PATH / "models" / "loras",
    }
    for src_dir, dst_dir in mapping.items():
        dst_dir.mkdir(parents=True, exist_ok=True)
        if src_dir.exists():
            for f in src_dir.glob("*.safetensors"):
                dst_file = dst_dir / f.name
                if dst_file.exists() or dst_file.is_symlink():
                    dst_file.unlink()
                dst_file.symlink_to(f)


def save_mage_clip_and_slices(decoded_audio, src_mp4: Path, clip_spec: dict, base_out_dir: Path):
    import numpy as np

    stems_dir = base_out_dir / "stems"
    slices_dir = base_out_dir / "slices"
    stems_dir.mkdir(parents=True, exist_ok=True)
    slices_dir.mkdir(parents=True, exist_ok=True)

    waveform = decoded_audio["waveform"]
    sr = int(decoded_audio.get("sample_rate", 32000))
    if waveform.ndim == 3:
        waveform = waveform[0]
    raw_np = waveform.detach().cpu().float().clamp(-1.0, 1.0).numpy()
    if raw_np.shape[0] == 1:
        raw_np = np.repeat(raw_np, 2, axis=0)

    polished_np = warm_cinema_foley_polish(
        raw_np,
        sr,
        clip_spec["hpf_hz"],
        clip_spec["lpf_hz"],
        clip_spec["sub_db"],
        clip_spec["transient_amt"],
        clip_spec["silence_windows"],
    )

    cid = clip_spec["id"]
    full_wav = stems_dir / f"{cid}.wav"
    full_mp3 = stems_dir / f"{cid}.mp3"
    mux_mp4 = stems_dir / f"{cid}_game_mux.mp4"

    pcm16 = (polished_np.T * 32767.0).astype(np.int16)
    with wave.open(str(full_wav), "wb") as wf:
        wf.setnchannels(pcm16.shape[1])
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm16.tobytes())

    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(full_wav), "-ar", "48000", "-b:a", "320k", str(full_mp3)],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", str(src_mp4), "-i", str(full_wav),
            "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest",
            str(mux_mp4),
        ],
        check=True,
    )

    slice_results = []
    n_total = polished_np.shape[1]
    for beat in clip_spec["beats"]:
        bid = beat["id"]
        s_idx = max(0, int((beat["startSec"] - 0.015) * sr))
        e_idx = min(n_total, int((beat["endSec"] + 0.05) * sr))
        seg = polished_np[:, s_idx:e_idx].copy()
        seg_len = seg.shape[1]
        if seg_len > int(0.05 * sr):
            fi = int(0.008 * sr)
            fo = int(0.035 * sr)
            seg[:, :fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)[None, :]
            seg[:, -fo:] *= np.linspace(1.0, 0.0, fo, dtype=np.float32)[None, :]
        pk = float(np.max(np.abs(seg))) + 1e-8
        if pk > 0.01:
            seg = (seg / pk) * 0.87

        s_wav = slices_dir / f"{bid}.wav"
        s_mp3 = slices_dir / f"{bid}.mp3"
        s_pcm = (seg.T * 32767.0).astype(np.int16)
        with wave.open(str(s_wav), "wb") as wf:
            wf.setnchannels(s_pcm.shape[1])
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(s_pcm.tobytes())
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(s_wav), "-ar", "48000", "-b:a", "320k", str(s_mp3)],
            check=True,
        )
        slice_results.append({"id": bid, "duration_s": round(seg_len / sr, 2)})

    print(f"[DONE MAGE CLIP] {cid} -> saved stem + mux + {len(slice_results)} slices", flush=True)
    return {"clip_id": cid, "slices": slice_results}


@app.function(
    image=image,
    gpu="H200",
    memory=98304,
    cpu=4,
    timeout=900,
    volumes={"/vol": vol_models, "/vol_outputs": vol_outputs},
)
def run_all_mage_h3(force_regen: bool = True) -> list:
    link_models_to_comfy()
    sys.path.insert(0, str(COMFY_PATH))
    sys.path.insert(0, str(COMFY_PATH / "custom_nodes"))

    import torch
    import comfy.ldm.common_dit
    import comfy.model_management
    import comfy.nested_tensor
    import comfy.quant_ops
    import node_helpers
    import nodes
    from comfy.ldm.minimax.model import (
        AUDIO_COND_TIMESTEP,
        VISUAL_COND_TIMESTEP,
        PackedLayout,
        _mod_gate,
        _mod_scale_shift,
        pack_audio,
        patchify_video,
        rope_rotation_table,
        time_shift_sigma,
        unpack_audio,
    )
    from comfy_extras.nodes_minimax_h3 import FPS, MiniMaxH3SigmaShift, _empty_av_latent
    from comfy_extras.nodes_custom_sampler import (
        BasicScheduler,
        CFGGuider,
        KSamplerSelect,
        RandomNoise,
        SamplerCustomAdvanced,
    )
    from comfy_extras.nodes_audio import VAEDecodeAudio
    from flash_attn import flash_attn_func

    def unwrap(out):
        return out.result if hasattr(out, "result") else out

    base_out_dir = Path("/vol_outputs/mage_h3_lab")
    stems_dir = base_out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)

    pending = (
        MAGE_CLIP_SPECS
        if force_regen
        else [c for c in MAGE_CLIP_SPECS if not (stems_dir / f"{c['id']}.mp3").exists()]
    )
    if not pending:
        print("All Mage clips already generated!", flush=True)
        return []

    results = []
    with torch.inference_mode():
        t_start = time.perf_counter()
        print(f"[Phase 1] Loading Qwen3-VL 32B + Video VAE for {len(pending)} Mage clips...", flush=True)
        clip_model = unwrap(
            nodes.CLIPLoader().load_clip("qwen3vl_32b_minimax_h3_int8_convrot.safetensors", "minimax", "default")
        )[0]
        video_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_video_vae_fp16.safetensors"))[0]
        audio_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_audio_vae_fp32.safetensors"))[0]

        prepared = []
        for c_spec in pending:
            inp_mp4 = VOL_ROOT / "inputs" / "mage_h3_suite" / c_spec["video"]
            n_frames = c_spec["n_frames"]
            frames_t = load_video_frames_tensor(inp_mp4, max_frames=n_frames)
            empty_av_latent, _ = _empty_av_latent(832, 480, n_frames)
            z_ref_video = video_vae.encode(frames_t[:n_frames])
            sample_idx = list(range(0, n_frames, FPS // 2))
            qwen_frames = frames_t[sample_idx].clone()
            del frames_t

            ref_items = [{"type": "video", "data": qwen_frames, "timestamps": [i / 2.0 for i in range(len(sample_idx))]}]
            ref_blocks = [{
                "kind": "video",
                "latent_t": z_ref_video.shape[2],
                "latent_h": 480 // 16,
                "latent_w": 832 // 16,
                "ref_audio_t": 0,
                "latent": z_ref_video,
                "audio_latent": None,
            }]

            def encode_p(p_text):
                tokens = clip_model.tokenize(p_text, minimax_ref_items=ref_items)
                cond = clip_model.encode_from_tokens_scheduled(tokens)
                return node_helpers.conditioning_set_values(cond, {"minimax_refs": ref_blocks})

            pos_cond = encode_p(c_spec["prompt"])
            neg_cond = encode_p(GAME_NEG_PROMPT)
            _, empty_aud_lat = empty_av_latent["samples"].unbind()[:2]
            prepared.append((c_spec, inp_mp4, z_ref_video, empty_aud_lat, pos_cond, neg_cond))
            print(f"  Encoded {c_spec['id']} ({n_frames}f)", flush=True)

        del clip_model, video_vae
        comfy.model_management.unload_all_models()
        gc.collect()
        torch.cuda.empty_cache()

        print(f"[Phase 2] Loading H3 FP8 Base UNET ({time.perf_counter() - t_start:.1f}s elapsed)...", flush=True)
        unet_base = unwrap(
            nodes.UNETLoader().load_unet("minimax_h3_ref2va_pruned_fp8_scaled.safetensors", "default")
        )[0]
        model_obj = unwrap(MiniMaxH3SigmaShift.execute(unet_base, 12.0, 4.0))[0]
        sigmas = unwrap(BasicScheduler.execute(model_obj, "simple", 16, 1.0))[0]
        sampler = unwrap(KSamplerSelect.execute("euler"))[0]
        dit = unet_base.model.diffusion_model

        for c_spec, inp_mp4, z_ref_video, empty_aud_lat, pos_cond, neg_cond in prepared:
            cid = c_spec["id"]
            kv_cache = {}
            prompt_fast_cache = {}
            state = {"cache_built": False, "n_stat": 0}

            def forward_cached(x, timestep, context, transformer_options={}, minimax_payload=None, denoise_mask=None, audio_denoise_mask=None, **kwargs):
                video_x, audio_x = x[0], x[1]
                orig_t, orig_h, orig_w = video_x.shape[2], video_x.shape[3], video_x.shape[4]
                video_x = comfy.ldm.common_dit.pad_to_patch_size(video_x, dit.patch_size)
                payload = minimax_payload or {}
                device = video_x.device
                dtype = context.dtype

                latent_t, lat_h, lat_w = video_x.shape[2], video_x.shape[3], video_x.shape[4]
                audio_t = audio_x.shape[-1]
                text_len = context.shape[1]
                layout = PackedLayout(text_len, latent_t, lat_h, lat_w, audio_t, keyframes=payload.get("keyframes"), refs=payload.get("refs"))

                shift_v = float(transformer_options.get("minimax_h3_sigma_shift_video", dit.sigma_shift_video))
                shift_a = float(transformer_options.get("minimax_h3_sigma_shift_audio", dit.sigma_shift_audio))
                sigma_v = (timestep.flatten()[0] / 1000.0).float().clamp(min=1e-6)
                t_v = float(1.0 - sigma_v)
                t_a = float(1.0 - time_shift_sigma(sigma_v, shift_v, shift_a))

                vis_aug = float(payload.get("visual_cond_noise_aug", VISUAL_COND_TIMESTEP))
                aud_aug = float(payload.get("audio_cond_noise_aug", AUDIO_COND_TIMESTEP))
                seg_t = {
                    "text": t_v, "video": max(t_v, VISUAL_COND_TIMESTEP), "audio": t_a,
                    "cond": max(t_v, vis_aug), "ref_img": max(t_v, vis_aug),
                    "cond_audio": max(t_a, aud_aug), "ref_audio": max(t_a, aud_aug),
                }
                unique_t = sorted({t_v, t_a} | {seg_t[k] for _, _, k in layout.segments})
                t_row = {t: i for i, t in enumerate(unique_t)}
                seg_tag = {"text": 1, "video": 0, "audio": 2, "cond": 0, "ref_img": 0, "cond_audio": 2, "ref_audio": 2}
                text_tags = payload.get("text_token_tags")

                t_vals = torch.tensor(unique_t, dtype=torch.float32, device=device)
                if dit.use_adaln_curves:
                    table = comfy.model_management.cast_to(dit.adaln_t_table, device=device)
                    pos = t_vals.clamp(0.0, 1.0) * (table.shape[0] - 1)
                    i0 = pos.floor().long().clamp(max=table.shape[0] - 2)
                    t_emb = torch.lerp(table[i0], table[i0 + 1], (pos - i0).unsqueeze(1))
                else:
                    t_emb = dit.time_embedder(t_vals).to(dtype)

                text_seg = next(s for s in layout.segments if s[2] == "text")
                ref_seg = next(s for s in layout.segments if s[2] == "ref_img")
                aud_seg = next(s for s in layout.segments if s[2] == "audio")
                vid_seg = next(s for s in layout.segments if s[2] == "video")

                if not state["cache_built"]:
                    mod_segments = []
                    for a, b, kind in layout.segments:
                        row_base = t_row[seg_t[kind]] * 3
                        if kind == "text" and text_tags is not None:
                            tags = text_tags.view(-1).tolist()
                            run_start = 0
                            for i in range(1, b - a + 1):
                                if i == b - a or tags[i] != tags[run_start]:
                                    mod_segments.append((a + run_start, a + i, row_base + int(tags[run_start])))
                                    run_start = i
                        else:
                            mod_segments.append((a, b, row_base + seg_tag[kind]))

                    img_update = layout.img_update.to(device)
                    video_rows = patchify_video(video_x.to(torch.float32), dit.patch_size)
                    audio_rows = pack_audio(audio_x.to(torch.float32))
                    cond_video_rows = dit._cond_video_rows(payload, device)
                    all_video_rows = torch.empty(img_update.shape[0], video_rows.shape[1], dtype=torch.float32, device=device)
                    all_video_rows[~img_update] = cond_video_rows
                    all_video_rows[img_update] = video_rows

                    video_embed = dit.video_patch_proj(all_video_rows).to(dtype)
                    audio_embed = dit.audio_patch_proj(audio_rows).to(dtype)
                    text_states = context[0]
                    if text_states.shape[-1] != dit.hidden_size:
                        text_states = dit.token_refiner(dit.condition_proj(text_states), transformer_options=transformer_options)

                    h = torch.empty(layout.seq_len, dit.hidden_size, dtype=dtype, device=device)
                    voff = aoff = 0
                    for a, b, kind in layout.segments:
                        n = b - a
                        if kind == "text":
                            h[a:b] = text_states
                        elif kind in ("cond", "ref_img", "video"):
                            h[a:b] = video_embed[voff:voff + n]
                            voff += n
                        else:
                            h[a:b] = audio_embed[aoff:aoff + n]
                            aoff += n

                    rope_freqs = rope_rotation_table(dit.rope_freqs(layout.position_ids, device), dtype)
                    ra, rb, _ = ref_seg
                    va, vb, _ = vid_seg
                    aa, ab, _ = aud_seg
                    ta, tb, _ = text_seg
                    n_stat = (rb - ra) + (vb - va)
                    state["n_stat"] = n_stat
                    max_fast_tokens = (tb - ta) + (ab - aa) + 512

                    for layer_idx, block in enumerate(dit.blocks):
                        shift_msa, scale_msa, gate_msa, shift_mlp, scale_mlp, gate_mlp = block.adaln_proj(t_emb)
                        h_norm = _mod_scale_shift(block.norm1(h), shift_msa, scale_msa, mod_segments)
                        attn_mod = block.attn
                        s = h_norm.shape[0]
                        q, k, v = attn_mod.qkv_proj(h_norm).split(attn_mod.heads * attn_mod.head_dim, dim=-1)
                        del h_norm
                        v = v.view(1, s, attn_mod.heads, attn_mod.head_dim)
                        q = q.view(1, s, attn_mod.heads, attn_mod.head_dim)
                        k = k.view(1, s, attn_mod.heads, attn_mod.head_dim)
                        qw = comfy.model_management.cast_to(attn_mod.q_norm.weight, device=device)
                        kw = comfy.model_management.cast_to(attn_mod.k_norm.weight, device=device)
                        rot = rope_freqs.shape[-3] * 2
                        comfy.quant_ops.ck.rms_rope_split_half_(q, k, rope_freqs, qw, kw, epsilon=attn_mod.q_norm.eps, rot_dim=rot)

                        k_buf = torch.empty((1, n_stat + max_fast_tokens, attn_mod.heads, attn_mod.head_dim), dtype=dtype, device=device)
                        v_buf = torch.empty((1, n_stat + max_fast_tokens, attn_mod.heads, attn_mod.head_dim), dtype=dtype, device=device)
                        k_buf[:, : (rb - ra)].copy_(k[:, ra:rb])
                        k_buf[:, (rb - ra) : n_stat].copy_(k[:, va:vb])
                        v_buf[:, : (rb - ra)].copy_(v[:, ra:rb])
                        v_buf[:, (rb - ra) : n_stat].copy_(v[:, va:vb])
                        kv_cache[layer_idx] = (k_buf, v_buf)

                        attn_raw = flash_attn_func(q, k, v, causal=False)
                        del q, k, v
                        attn_out = attn_mod.out_proj(attn_raw.view(s, attn_mod.heads * attn_mod.head_dim))
                        del attn_raw

                        h = _mod_gate(h, gate_msa, attn_out, mod_segments)
                        del attn_out
                        h_norm2 = _mod_scale_shift(block.norm2(h), shift_mlp, scale_mlp, mod_segments)
                        mlp_out = block.mlp(h_norm2)
                        del h_norm2
                        h = _mod_gate(h, gate_mlp, mlp_out, mod_segments)
                        del mlp_out

                    state["cache_built"] = True
                    video_seg = (va, vb, t_row[seg_t["video"]])
                    audio_seg = (aa, ab, t_row[seg_t["audio"]])
                    _, a_out = dit.final_layer(h, t_emb, video_seg, audio_seg, sigma_v, transformer_options.get("sample_sigmas"), (shift_v, shift_a))
                    audio_out = unpack_audio(a_out)
                    video_zero = torch.zeros_like(video_x[:, :, :orig_t, :orig_h, :orig_w])
                    return [video_zero, -audio_out.to(audio_x.dtype)]

                ta, tb, _ = text_seg
                aa, ab, _ = aud_seg
                n_text = tb - ta
                n_aud = ab - aa
                n_stat = state["n_stat"]
                s_f = n_text + n_aud
                pad_16 = (16 - (s_f % 16)) % 16
                s_f_pad = s_f + pad_16

                mod_segments_fast = []
                row_base_t = t_row[seg_t["text"]] * 3
                if text_tags is not None:
                    tags = text_tags.view(-1).tolist()
                    run_start = 0
                    for i in range(1, n_text + 1):
                        if i == n_text or tags[i] != tags[run_start]:
                            mod_segments_fast.append((run_start, i, row_base_t + int(tags[run_start])))
                            run_start = i
                else:
                    mod_segments_fast.append((0, n_text, row_base_t + seg_tag["text"]))
                mod_segments_fast.append((n_text, s_f_pad, t_row[seg_t["audio"]] * 3 + seg_tag["audio"]))

                audio_rows = pack_audio(audio_x.to(torch.float32))
                audio_embed = dit.audio_patch_proj(audio_rows).to(dtype)
                text_states = context[0]
                if text_states.shape[-1] != dit.hidden_size:
                    text_states = dit.token_refiner(dit.condition_proj(text_states), transformer_options=transformer_options)

                pos_key = (ta, tb, aa, ab)
                if pos_key not in prompt_fast_cache:
                    pos_fast = torch.cat([layout.position_ids[ta:tb], layout.position_ids[aa:ab]], dim=0)
                    prompt_fast_cache[pos_key] = rope_rotation_table(dit.rope_freqs(pos_fast, device), dtype)
                rope_fast = prompt_fast_cache[pos_key]

                if pad_16 > 0:
                    pad_zeros = torch.zeros((pad_16, dit.hidden_size), dtype=dtype, device=device)
                    h_fast = torch.cat([text_states, audio_embed, pad_zeros], dim=0)
                else:
                    h_fast = torch.cat([text_states, audio_embed], dim=0)

                for layer_idx, block in enumerate(dit.blocks):
                    shift_msa, scale_msa, gate_msa, shift_mlp, scale_mlp, gate_mlp = block.adaln_proj(t_emb)
                    h_norm = _mod_scale_shift(block.norm1(h_fast), shift_msa, scale_msa, mod_segments_fast)
                    attn_mod = block.attn
                    q, k, v = attn_mod.qkv_proj(h_norm).split(attn_mod.heads * attn_mod.head_dim, dim=-1)
                    v = v[:s_f].view(1, s_f, attn_mod.heads, attn_mod.head_dim)
                    q = q[:s_f].view(1, s_f, attn_mod.heads, attn_mod.head_dim)
                    k = k[:s_f].view(1, s_f, attn_mod.heads, attn_mod.head_dim)
                    qw = comfy.model_management.cast_to(attn_mod.q_norm.weight, device=device)
                    kw = comfy.model_management.cast_to(attn_mod.k_norm.weight, device=device)
                    rot = rope_fast.shape[-3] * 2
                    comfy.quant_ops.ck.rms_rope_split_half_(q, k, rope_fast, qw, kw, epsilon=attn_mod.q_norm.eps, rot_dim=rot)

                    k_buf, v_buf = kv_cache[layer_idx]
                    total_len = n_stat + s_f
                    if total_len > k_buf.shape[1]:
                        new_cap = total_len + 2048
                        new_k = torch.empty((1, new_cap, attn_mod.heads, attn_mod.head_dim), dtype=dtype, device=device)
                        new_v = torch.empty((1, new_cap, attn_mod.heads, attn_mod.head_dim), dtype=dtype, device=device)
                        new_k[:, :n_stat].copy_(k_buf[:, :n_stat])
                        new_v[:, :n_stat].copy_(v_buf[:, :n_stat])
                        k_buf, v_buf = new_k, new_v
                        kv_cache[layer_idx] = (k_buf, v_buf)

                    k_buf[:, n_stat:total_len].copy_(k)
                    v_buf[:, n_stat:total_len].copy_(v)

                    attn_raw = flash_attn_func(q, k_buf[:, :total_len], v_buf[:, :total_len], causal=False)
                    attn_flat = attn_raw.view(s_f, attn_mod.heads * attn_mod.head_dim)
                    if pad_16 > 0:
                        attn_flat = torch.nn.functional.pad(attn_flat, (0, 0, 0, pad_16))
                    attn_out = attn_mod.out_proj(attn_flat)

                    h_fast = _mod_gate(h_fast, gate_msa, attn_out, mod_segments_fast)
                    h_norm2 = _mod_scale_shift(block.norm2(h_fast), shift_mlp, scale_mlp, mod_segments_fast)
                    h_fast = _mod_gate(h_fast, gate_mlp, block.mlp(h_norm2), mod_segments_fast)

                dummy_video_seg = (0, 1, t_row[seg_t["video"]])
                audio_seg_fast = (n_text, n_text + n_aud, t_row[seg_t["audio"]])
                _, a_out = dit.final_layer(h_fast[:s_f], t_emb, dummy_video_seg, audio_seg_fast, sigma_v, transformer_options.get("sample_sigmas"), (shift_v, shift_a))
                audio_out = unpack_audio(a_out)
                video_zero = torch.zeros_like(video_x[:, :, :orig_t, :orig_h, :orig_w])
                return [video_zero, -audio_out.to(audio_x.dtype)]

            dit._forward = forward_cached

            def make_lat():
                return {
                    "samples": comfy.nested_tensor.NestedTensor((z_ref_video.clone(), empty_aud_lat.clone())),
                    "noise_mask": comfy.nested_tensor.NestedTensor((torch.zeros_like(z_ref_video), torch.ones_like(empty_aud_lat))),
                }

            print(f"[Sampling {cid}] 16-step H3 V2A (seed={c_spec['seed']}, cfg=1.8)...", flush=True)
            guider = unwrap(CFGGuider.execute(model_obj, pos_cond, neg_cond, 1.8))[0]
            noise = unwrap(RandomNoise.execute(c_spec["seed"]))[0]
            t0 = time.perf_counter()
            _, den = unwrap(
                SamplerCustomAdvanced.execute(
                    noise=noise, guider=guider, sampler=sampler, sigmas=sigmas, latent_image=make_lat()
                )
            )
            el = time.perf_counter() - t0
            aud = unwrap(VAEDecodeAudio.execute(vae=audio_vae, samples=den))[0]
            st = save_mage_clip_and_slices(aud, inp_mp4, c_spec, base_out_dir)
            st["elapsed_s"] = round(el, 1)
            vol_outputs.commit()
            results.append(st)

            kv_cache.clear()
            prompt_fast_cache.clear()
            gc.collect()
            torch.cuda.empty_cache()

    return results


@app.local_entrypoint()
def main():
    res = run_all_mage_h3.remote(force_regen=True)
    print(f"Mage H3 pipeline complete! Generated {len(res)} clips:", res, flush=True)
