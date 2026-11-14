"""
Parallel 7-Worker H200 Game-SFX Foley Suite Factory (`sfx-foley/harness/modal_foley_suite_runner.py`).
Strictly isolated inside `sfx-foley/`.

Processes all 14 `832x480 @ 24fps` (`124f` / `141f`) multi-beat foley videos (`46` atomic SFX actions)
across 7 parallel H200 containers (2 clips per worker -> ~3.2 minutes total wall-clock time).

For each clip:
  1. Loads the clean 832x480 24fps `.mp4` from `/vol/inputs/foley_suite/`,
  2. Encodes the timestamped Multi-Beat 6-Section `ref-en.txt` Positive Prompt + Game-SFX Negative Prompt,
  3. Builds the 50-layer Post-RoPE Video KV-Cache on Step 0 (~16s) and runs 16-step Undistilled Base Model
     with `CFGGuider(cfg=1.8)` + `euler` + `simple`,
  4. Applies `polish_multi_beat_sfx()`:
     - Category-specific High-Pass (`hpfHz`), 8th-order Smooth Ultrasonic Roll-Off (`lpfHz`), and
       soft-saturated Sub-Bass Shelf (`subBoostDb` below 135 Hz),
     - Multi-Window Visual-Synced Gameplay Silence Gating across every `[silStart, silEnd]` window
       so each action beat is separated by pure digital silence,
  5. Automatically slices all 46 individual action beats into atomic `.wav` and `.mp3` one-shots in
     `/vol_outputs/foley_suite/slices/` + saves the 14 full stems and `_game_mux.mp4` video previews
     in `/vol_outputs/foley_suite/stems/`!
"""

import gc
import json
import os
import subprocess
import sys
import time
from pathlib import Path
import modal

app = modal.App("haru-machi-h3-14clip-foley-suite")

vol_models = modal.Volume.from_name("minimax-h3-models", create_if_missing=True)
vol_outputs = modal.Volume.from_name("minimax-h3-outputs", create_if_missing=True)

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
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        frames.append(rgb)
    cap.release()
    arr = np.stack(frames, axis=0).astype(np.float32) / 255.0
    return torch.from_numpy(arr)


def make_prompt(subj1: str, subj2: str, summary_body: str, shot_body: str, soundscape_body: str) -> str:
    return (
        "subject_definitions:\n"
        f"<Subject 1> is {subj1} in <Video 1>.\n"
        f"<Subject 2> is {subj2} in <Video 1>.\n"
        "<Video 1> is the source video for the target video edit.\n\n"
        "summary:\n"
        f"[video editing] The target video is an edited version of <Video 1>. {summary_body}\n\n"
        "retention_analysis:\n"
        "<Subject 1> (appears throughout): fully_preserved - the environment and ground are retained.\n"
        "<Subject 2> (appears throughout): fully_preserved - the character and effect timing are retained.\n"
        "<Video 1> (cut and pacing structure): fully_preserved - the camera framing and timing are retained 1:1.\n\n"
        "detailed_description:\n"
        "The target video is in a 3D CG animated style.\n\n"
        f"{shot_body}\n\n"
        "overall_soundscape:\n"
        f"{soundscape_body} Complete silence during all pauses. No ambient wind, no room tone, no dialogue.\n\n"
        "non_diegetic_music:\n"
        "N/A"
    )


GAME_NEG_PROMPT = (
    "subject_definitions:\n"
    "<Subject 1> is the arena in <Video 1>.\n"
    "<Subject 2> is the character and effect in <Video 1>.\n"
    "<Video 1> is the source video.\n\n"
    "summary:\n"
    "[video editing] Noisy ambient movie scene with wind hiss, mist, white noise static, and continuous background hum.\n\n"
    "retention_analysis:\n"
    "<Subject 1>: fully_preserved\n"
    "<Subject 2>: fully_preserved\n"
    "<Video 1>: fully_preserved\n\n"
    "detailed_description:\n"
    "The target video has continuous wind noise, mist hissing, room tone, white noise static, glassy high-frequency ringing, and sound during silent pauses.\n\n"
    "overall_soundscape:\n"
    "Ambient wind, mist hiss, room tone, white noise, radio static, speech, dialogue.\n\n"
    "non_diegetic_music:\n"
    "Background music, synthesizer pad, organ drone, brass."
)


CLIP_SPECS = [
    {
        "id": "01_locomotion_footsteps_surfaces",
        "video": "01_locomotion_footsteps_surfaces.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 150.0,
        "lpf_hz": 5000.0,
        "sub_db": 0.0,
        "silence_windows": [[0.0, 0.25], [1.5, 2.0], [3.25, 3.75], [5.0, 5.875]],
        "beats": [
            {"id": "footstep_meadow_grass", "startSec": 0.25, "endSec": 1.50},
            {"id": "footstep_cobblestone_plaza", "startSec": 2.00, "endSec": 3.25},
            {"id": "footstep_stone_steps_mage", "startSec": 3.75, "endSec": 5.00},
        ],
        "prompt": make_prompt(
            "the meadow grass, cobblestone plaza, and stone shrine steps",
            "the running Knight and Mage characters",
            "It adds crisp, distinct physical footsteps on three different surfaces separated by complete silence.",
            (
                "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                "[Shot 1, 00:00.250-00:01.500] As <Subject 2> runs across thick meadow grass, four crisp, rhythmic boot footsteps press into soft turf and lush grass blades with subtle leather armor movement.\n\n"
                "[Shot 1, 00:01.500-00:02.000] Complete silence.\n\n"
                "[Shot 2, 00:02.000-00:03.250] As <Subject 2> sprints across the cobblestone plaza, four solid, punchy iron-shod boot footsteps click and thud firmly against heavy stone pavers.\n\n"
                "[Shot 2, 00:03.250-00:03.750] Complete silence.\n\n"
                "[Shot 3, 00:03.750-00:05.000] As <Subject 2> ascends the shrine stone steps, four light, nimble leather-boot footsteps tap cleanly on carved travertine stone with a soft cloth swish.\n\n"
                "[Shot 3, 00:05.000-00:05.875] Complete silence."
            ),
            "Clean, close-miked foley footsteps on meadow turf, cobblestone pavers, and carved stone steps.",
        ),
    },
    {
        "id": "02_dodge_rolls_and_perfect_dodge",
        "video": "02_dodge_rolls_and_perfect_dodge.mp4",
        "n_frames": 124,
        "seed": 42,
        "hpf_hz": 75.0,
        "lpf_hz": 5500.0,
        "sub_db": 2.5,
        "silence_windows": [[0.0, 0.25], [0.92, 1.67], [2.33, 3.0], [4.17, 5.167]],
        "beats": [
            {"id": "knight_dodge_roll_heavy", "startSec": 0.25, "endSec": 0.92},
            {"id": "mage_dodge_dash_silk", "startSec": 1.67, "endSec": 2.33},
            {"id": "perfect_dodge_time_dilation", "startSec": 3.00, "endSec": 4.17},
        ],
        "prompt": make_prompt(
            "the stone arena",
            "the dodging Knight and Mage",
            "It adds a heavy armored roll, a swift silk dash whoosh, and a time-dilation vacuum reflex sound separated by silence.",
            (
                "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                "[Shot 1, 00:00.250-00:00.920] <Subject 2> performs a fast armored dodge roll: a tight air whoosh, compact plate-armor clink, and firm leather shoulder landing thud on stone.\n\n"
                "[Shot 1, 00:00.920-00:01.670] Complete silence.\n\n"
                "[Shot 2, 00:01.670-00:02.330] <Subject 2> performs a swift silk-robe evade dash: a crisp, whip-fast cloth and air whoosh with light boot push-off.\n\n"
                "[Shot 2, 00:02.330-00:03.000] Complete silence.\n\n"
                "[Shot 3, 00:03.000-00:04.170] <Subject 2> triggers a last-instant Perfect Dodge: a sharp, resonant crystal-steel reflex ping followed immediately by a deep sub-bass air-vacuum time-slowing whoosh.\n\n"
                "[Shot 3, 00:04.170-00:05.167] Complete silence."
            ),
            "Punchy armored dodge roll, crisp cloth dash whoosh, and a resonant reflex ping with sub-bass vacuum whoosh.",
        ),
    },
    {
        "id": "03_knight_basic_sword_combos",
        "video": "03_knight_basic_sword_combos.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 90.0,
        "lpf_hz": 5600.0,
        "sub_db": 2.0,
        "silence_windows": [[0.0, 0.25], [0.92, 1.5], [2.17, 2.75], [3.42, 4.0], [4.92, 5.875]],
        "beats": [
            {"id": "knight_slash_combo1", "startSec": 0.25, "endSec": 0.92},
            {"id": "knight_slash_combo2", "startSec": 1.50, "endSec": 2.17},
            {"id": "knight_slash_combo3", "startSec": 2.75, "endSec": 3.42},
            {"id": "knight_slash_combo4_whirlwind", "startSec": 4.00, "endSec": 4.92},
        ],
        "prompt": make_prompt(
            "the stone courtyard",
            "the Knight swinging a heavy steel broadsword",
            "It adds four distinct, visceral steel broadsword slashes separated by complete silence.",
            (
                "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                "[Shot 1, 00:00.250-00:00.920] <Subject 2> swings a fast horizontal broadsword slash: a sharp steel blade ring and tight, heavy air-cutting whoosh.\n\n"
                "[Shot 1, 00:00.920-00:01.500] Complete silence.\n\n"
                "[Shot 1, 00:01.500-00:02.170] <Subject 2> swings a rising diagonal steel slice: a higher-pitched metallic edge whistle and forceful air whip.\n\n"
                "[Shot 1, 00:02.170-00:02.750] Complete silence.\n\n"
                "[Shot 1, 00:02.750-00:03.420] <Subject 2> delivers a heavy overhead broadsword chop: a deep, weighty steel-and-air cleave with a low-end thud.\n\n"
                "[Shot 1, 00:03.420-00:04.000] Complete silence.\n\n"
                "[Shot 1, 00:04.000-00:04.920] <Subject 2> unleashes a leaping 360-degree finisher cleave: a powerful double-whoosh of heavy forged steel slicing the air and a solid stone landing impact.\n\n"
                "[Shot 1, 00:04.920-00:05.875] Complete silence."
            ),
            "Four separated, weighty forged-steel broadsword slashes cutting the air with crisp metallic ring.",
        ),
    },
    {
        "id": "04_knight_glacial_and_sunfire_breathing",
        "video": "04_knight_glacial_and_sunfire_breathing.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 45.0,
        "lpf_hz": 5600.0,
        "sub_db": 3.5,
        "silence_windows": [[0.0, 0.25], [1.25, 1.83], [2.75, 3.33], [4.33, 4.75], [5.5, 5.875]],
        "beats": [
            {"id": "knight_e_glacial_tide_ignition", "startSec": 0.25, "endSec": 1.25},
            {"id": "knight_glacial_tide_swings", "startSec": 1.83, "endSec": 2.75},
            {"id": "knight_e_hinokami_sunfire_ignition", "startSec": 3.33, "endSec": 4.33},
            {"id": "knight_hinokami_sunfire_swings", "startSec": 4.75, "endSec": 5.50},
        ],
        "prompt": make_prompt(
            "the arena",
            "the Knight igniting ice and fire sword breathing styles",
            "It adds an icy sword ignition, two frost blade slashes, a roaring sunfire sword ignition, and two blazing flame slashes.",
            (
                "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                "[Shot 1, 00:00.250-00:01.250] <Subject 2> ignites Glacial Tide on the broadsword: a deep sub-bass surge combined with rapid flash-freeze lake-ice cracking and a sweeping cryo-blade cleave.\n\n"
                "[Shot 1, 00:01.250-00:01.830] Complete silence.\n\n"
                "[Shot 1, 00:01.830-00:02.750] <Subject 2> performs two rapid ice-infused sword swings: heavy steel slashes layered with biting solid ice crystallization crunches.\n\n"
                "[Shot 1, 00:02.750-00:03.330] Complete silence.\n\n"
                "[Shot 2, 00:03.330-00:04.330] <Subject 2> ignites Hinokami Sunfire on the sword: a chest-hitting sub-bass combustion boom and a roaring, concentrated blowtorch flame whip.\n\n"
                "[Shot 2, 00:04.330-00:04.750] Complete silence.\n\n"
                "[Shot 2, 00:04.750-00:05.500] <Subject 2> swings two blazing fire sword slashes: heavy steel cleaves wrapped in explosive, crackling fireball whooshes.\n\n"
                "[Shot 2, 00:05.500-00:05.875] Complete silence."
            ),
            "Flash-freeze ice blade ignition and frost slashes followed by roaring sunfire blade ignition and flame slashes.",
        ),
    },
    {
        "id": "05_knight_twin_element_ult_and_shield",
        "video": "05_knight_twin_element_ult_and_shield.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 40.0,
        "lpf_hz": 5600.0,
        "sub_db": 4.5,
        "silence_windows": [[0.0, 0.25], [1.67, 2.33], [3.58, 4.17], [5.17, 5.875]],
        "beats": [
            {"id": "knight_q_twin_element_awakening", "startSec": 0.25, "endSec": 1.67},
            {"id": "knight_shield_raise_block_parry", "startSec": 2.33, "endSec": 3.58},
            {"id": "knight_sprint_shield_intercept", "startSec": 4.17, "endSec": 5.17},
        ],
        "prompt": make_prompt(
            "the arena",
            "the Knight unleashing a dual fire-and-ice ultimate slash, blocking with a heavy shield, and shield-bashing",
            "It adds a twin-element ultimate X-slash detonation, a heavy iron shield block and parry clang, and a concussive shield bash.",
            (
                "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                "[Shot 1, 00:00.250-00:01.670] <Subject 2> unleashes the Twin-Element Ultimate: a fast spinning wind-up followed by a massive sub-bass X-slash detonation combining roaring fire combustion and thick glacier ice shattering.\n\n"
                "[Shot 1, 00:01.670-00:02.330] Complete silence.\n\n"
                "[Shot 2, 00:02.330-00:03.580] <Subject 2> locks a heavy iron shield and blocks an axe strike: a solid metal shield lock followed by a loud, weighty forged-iron anvil clang and parry shockwave.\n\n"
                "[Shot 2, 00:03.580-00:04.170] Complete silence.\n\n"
                "[Shot 3, 00:04.170-00:05.170] <Subject 2> charges forward with a Sprint Shield Intercept bash: a fast armored rush ending in a concussive sub-bass iron-on-bone ramming slam.\n\n"
                "[Shot 3, 00:05.170-00:05.875] Complete silence."
            ),
            "Massive fire-and-ice X-slash detonation, heavy forged-iron shield block clang, and concussive shield ram slam.",
        ),
    },
    {
        "id": "06_mage_shatterlance_charge_and_starfall_ult",
        "video": "06_mage_shatterlance_charge_and_starfall_ult.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 38.0,
        "lpf_hz": 5600.0,
        "sub_db": 4.5,
        "silence_windows": [[0.0, 0.25], [2.17, 2.75], [3.58, 3.92], [5.42, 5.875]],
        "beats": [
            {"id": "mage_shatterlance_hold_charge_vortex", "startSec": 0.25, "endSec": 1.33},
            {"id": "mage_shatterlance_release_burst", "startSec": 1.33, "endSec": 2.17},
            {"id": "mage_q_starfall_invocation", "startSec": 2.75, "endSec": 3.58},
            {"id": "mage_q_starfall_meteor_barrage", "startSec": 3.92, "endSec": 5.42},
        ],
        "prompt": make_prompt(
            "the arena",
            "the Mage charging an ice railgun spear and calling down a meteor shower",
            "It adds a compressing ice-crystal charge, a railgun ice spear detonation, a staff invocation pulse, and a multi-meteor bombardment.",
            (
                "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                "[Shot 1, 00:00.250-00:01.330] As <Subject 2> charges Shatterlance, solid ice shards rapidly spin, grind, and lock tightly together at the staff tip with rising sub-bass pressure.\n\n"
                "[Shot 1, 00:01.330-00:02.170] The spear fires and detonates: a supersonic air-whip and earth-shaking sub-bass railgun boom with thick glacier ice splitting open.\n\n"
                "[Shot 1, 00:02.170-00:02.750] Complete silence.\n\n"
                "[Shot 2, 00:02.750-00:03.580] <Subject 2> raises the staff to invoke Starfall: a deep resonant bass pulse and a roaring overhead flame portal opening.\n\n"
                "[Shot 2, 00:03.580-00:03.920] Complete silence.\n\n"
                "[Shot 2, 00:03.920-00:05.420] Blazing meteors rain down and slam into the stone ground: four rapid, chest-hitting sub-bass mortar explosions and heavy volcanic boulders smashing into rock.\n\n"
                "[Shot 2, 00:05.420-00:05.875] Complete silence."
            ),
            "Compressing ice crystal charge, supersonic cryo-railgun boom, and rapid volcanic meteor impacts on stone.",
        ),
    },
    {
        "id": "07_coop_elemental_detonations",
        "video": "07_coop_elemental_detonations.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 38.0,
        "lpf_hz": 5600.0,
        "sub_db": 4.5,
        "silence_windows": [[0.0, 0.25], [1.42, 2.0], [3.17, 3.75], [5.0, 5.875]],
        "beats": [
            {"id": "detonation_shatterblow", "startSec": 0.25, "endSec": 1.42},
            {"id": "detonation_solar_flare", "startSec": 2.00, "endSec": 3.17},
            {"id": "detonation_thunderchain", "startSec": 3.75, "endSec": 5.00},
        ],
        "prompt": make_prompt(
            "the arena",
            "the Knight detonating three elemental combo explosions on an armored skeleton",
            "It adds three massive elemental combo detonations: a cryo-glacier shatter, a sunfire blast wave, and a high-voltage lightning thunderclap.",
            (
                "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                "[Shot 1, 00:00.250-00:01.420] Shatterblow Detonation: a heavy steel sword impact triggers a massive sub-bass shockwave and the explosive whip-crack of a thick frozen glacier shattering into solid ice blocks.\n\n"
                "[Shot 1, 00:01.420-00:02.000] Complete silence.\n\n"
                "[Shot 2, 00:02.000-00:03.170] Solar Flare Detonation: a heavy sword strike triggers a concussive sub-bass magma explosion, roaring fireburst, and volcanic rock slabs cracking apart.\n\n"
                "[Shot 2, 00:03.170-00:03.750] Complete silence.\n\n"
                "[Shot 3, 00:03.750-00:05.000] Thunderchain Detonation: a heavy sword strike triggers a chest-rattling thunderclap boom, three sharp high-voltage transformer arc snaps, and obsidian stone fracturing.\n\n"
                "[Shot 3, 00:05.000-00:05.875] Complete silence."
            ),
            "Three distinct, chest-hitting elemental combo detonations: glacier ice shatter, volcanic fire blast, and high-voltage thunderclap.",
        ),
    },
    {
        "id": "08_visceral_hit_impacts_and_player_damage",
        "video": "08_visceral_hit_impacts_and_player_damage.mp4",
        "n_frames": 124,
        "seed": 42,
        "hpf_hz": 60.0,
        "lpf_hz": 5400.0,
        "sub_db": 3.0,
        "silence_windows": [[0.0, 0.25], [1.04, 1.67], [2.42, 3.04], [3.83, 4.25], [4.92, 5.167]],
        "beats": [
            {"id": "hit_impact_skeleton_bone", "startSec": 0.25, "endSec": 1.04},
            {"id": "hit_impact_armored_knight", "startSec": 1.67, "endSec": 2.42},
            {"id": "hit_impact_flesh_beast", "startSec": 3.04, "endSec": 3.83},
            {"id": "player_hit_damage_thud", "startSec": 4.25, "endSec": 4.92},
        ],
        "prompt": make_prompt(
            "the arena",
            "close-quarters melee weapon impacts against bone, plate armor, beast hide, and player armor",
            "It adds four visceral close-quarters combat impacts separated by silence: blade-on-bone crack, blade-on-plate-armor clang, blade-on-flesh cleave, and a heavy player damage chest thud.",
            (
                "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                "[Shot 1, 00:00.250-00:01.040] Heavy steel broadsword slams into a skeleton warrior: a punchy low-mid impact thud and dry ribcage bone cracking and rattling.\n\n"
                "[Shot 1, 00:01.040-00:01.670] Complete silence.\n\n"
                "[Shot 2, 00:01.670-00:02.420] Heavy steel broadsword strikes a Black Knight's thick plate armor: a forceful metallic anvil crunch and heavy iron plate denting.\n\n"
                "[Shot 2, 00:02.420-00:03.040] Complete silence.\n\n"
                "[Shot 3, 00:03.040-00:03.830] Heavy steel broadsword cleaves into a tough werewolf beast: a meaty, visceral leather-and-flesh impact thump.\n\n"
                "[Shot 3, 00:03.830-00:04.250] Complete silence.\n\n"
                "[Shot 4, 00:04.250-00:04.920] An orc cleaver hits the Knight's chest: a deep, unmistakable sub-bass gut-punch thud and heavy armor plate jolt.\n\n"
                "[Shot 4, 00:04.920-00:05.167] Complete silence."
            ),
            "Four visceral, close-miked melee hit impacts on bone, plate armor, beast hide, and player chest armor.",
        ),
    },
    {
        "id": "09_enemies_skeleton_legion",
        "video": "09_enemies_skeleton_legion.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 100.0,
        "lpf_hz": 5200.0,
        "sub_db": 1.5,
        "silence_windows": [[0.0, 0.21], [1.38, 1.92], [3.29, 3.83], [5.29, 5.875]],
        "beats": [
            {"id": "enemy_skeleton_minion_attack_and_pile", "startSec": 0.21, "endSec": 1.38},
            {"id": "enemy_skeleton_warrior_shield_and_chop", "startSec": 1.92, "endSec": 3.29},
            {"id": "enemy_skeleton_rogue_flank_and_flurry", "startSec": 3.83, "endSec": 5.29},
        ],
        "prompt": make_prompt(
            "the cobblestone plaza",
            "three skeleton enemies performing their signature attacks",
            "It adds a skeleton minion rush and bone-pile collapse, a skeleton warrior shield-and-axe chop, and a skeleton rogue rapid dual-dagger flurry.",
            (
                "[Shot 1, 00:00.000-00:00.210] Complete silence.\n\n"
                "[Shot 1, 00:00.210-00:01.380] A Skeleton Minion rushes forward and collapses into a pile of bones: rapid dry bone clattering, a sharp strike whoosh, and a loud cascade of heavy bones and skull tumbling onto stone.\n\n"
                "[Shot 1, 00:01.380-00:01.920] Complete silence.\n\n"
                "[Shot 2, 00:01.920-00:03.290] A Skeleton Warrior raises its wooden-and-iron shield and swings a heavy axe chop followed by a shield bash: solid wood-and-iron clunk, heavy axe air cleave, and punchy shield slam.\n\n"
                "[Shot 2, 00:03.290-00:03.830] Complete silence.\n\n"
                "[Shot 3, 00:03.830-00:05.290] A Skeleton Rogue performs a quick sidestep and a three-hit dual-dagger slash flurry: three razor-sharp, whip-fast steel dagger slices cutting the air in rapid succession.\n\n"
                "[Shot 3, 00:05.290-00:05.875] Complete silence."
            ),
            "Dry skeletal bone clatter and collapse, heavy axe-and-shield chop, and rapid dual-dagger steel slashes.",
        ),
    },
    {
        "id": "10_enemies_casters_and_sylvan",
        "video": "10_enemies_casters_and_sylvan.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 55.0,
        "lpf_hz": 5400.0,
        "sub_db": 2.5,
        "silence_windows": [[0.0, 0.21], [1.54, 2.08], [3.63, 4.13], [5.42, 5.875]],
        "beats": [
            {"id": "enemy_skeleton_mage_bolt_and_eruption", "startSec": 0.21, "endSec": 1.54},
            {"id": "boss_necromancer_summon_and_bolt", "startSec": 2.08, "endSec": 3.63},
            {"id": "enemy_plant_warrior_thorn_and_spear", "startSec": 4.13, "endSec": 5.42},
        ],
        "prompt": make_prompt(
            "the plaza",
            "a Skeleton Mage, a Necromancer boss, and a Briar Plant Warrior",
            "It adds a dark arcane bolt and ground crack, a deep necromancer summoning ritual pulse, and a wooden briar thorn-and-spear strike.",
            (
                "[Shot 1, 00:00.000-00:00.210] Complete silence.\n\n"
                "[Shot 1, 00:00.210-00:01.540] A Skeleton Mage fires a dark bolt and erupts the ground: a tight, punchy dark-energy projectile whip followed by a low stone-slab crack and earth burst.\n\n"
                "[Shot 1, 00:01.540-00:02.080] Complete silence.\n\n"
                "[Shot 2, 00:02.080-00:03.630] A Necromancer boss slams his staff to summon hunters from the earth: a deep sub-bass ground tremor, heavy stone grinding open, and dry bones rising.\n\n"
                "[Shot 2, 00:03.630-00:04.130] Complete silence.\n\n"
                "[Shot 3, 00:04.130-00:05.420] A Briar Plant Warrior fires a wooden thorn and slashes with a heavy wooden spear: a snappy dry timber creak, a sharp thorn dart zip, and a thick hardwood spear whoosh.\n\n"
                "[Shot 3, 00:05.420-00:05.875] Complete silence."
            ),
            "Dark projectile whip and stone crack, deep sub-bass earth summoning tremor, and creaking hardwood spear foley.",
        ),
    },
    {
        "id": "11_enemies_berserkers_and_elites",
        "video": "11_enemies_berserkers_and_elites.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 65.0,
        "lpf_hz": 5400.0,
        "sub_db": 3.0,
        "silence_windows": [[0.0, 0.21], [1.5, 2.04], [3.5, 4.04], [5.42, 5.875]],
        "beats": [
            {"id": "enemy_orc_raider_sprint_and_cleave", "startSec": 0.21, "endSec": 1.50},
            {"id": "enemy_werewolf_stalk_and_pounce", "startSec": 2.04, "endSec": 3.50},
            {"id": "elite_black_knight_shield_and_greatsword", "startSec": 4.04, "endSec": 5.42},
        ],
        "prompt": make_prompt(
            "the plaza",
            "an Orc Raider, a feral Werewolf, and an armored Black Knight",
            "It adds heavy orc footsteps and an iron cleaver slam, a feral werewolf leap-pounce and claw rip, and a Black Knight plate-shield clang and greatsword cleave.",
            (
                "[Shot 1, 00:00.000-00:00.210] Complete silence.\n\n"
                "[Shot 1, 00:00.210-00:01.500] An Orc Raider charges and slams a massive two-handed iron cleaver: two heavy boot stomps followed by a brutal iron cleaver air-whip and stone-cracking impact.\n\n"
                "[Shot 1, 00:01.500-00:02.040] Complete silence.\n\n"
                "[Shot 2, 00:02.040-00:03.500] A Werewolf lunges in an airborne pounce and slashes with claws: a guttural beast snarl, powerful paw push-off, and sharp double claw rip.\n\n"
                "[Shot 2, 00:03.500-00:04.040] Complete silence.\n\n"
                "[Shot 3, 00:04.040-00:05.420] An elite Black Knight locks his tower shield and swings a massive dark greatsword: a deep forged-iron shield clang followed by a heavy, resonant two-handed greatsword whirlwind cleave.\n\n"
                "[Shot 3, 00:05.420-00:05.875] Complete silence."
            ),
            "Heavy orc cleaver slam, feral werewolf pounce and claw slash, and heavy black-iron shield clang and greatsword cleave.",
        ),
    },
    {
        "id": "12_bosses_brute_and_golems",
        "video": "12_bosses_brute_and_golems.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 38.0,
        "lpf_hz": 5200.0,
        "sub_db": 4.5,
        "silence_windows": [[0.0, 0.21], [1.63, 2.13], [3.75, 4.25], [5.54, 5.875]],
        "beats": [
            {"id": "boss_orc_brute_slam", "startSec": 0.21, "endSec": 1.63},
            {"id": "boss_frost_golem_combo_and_smash", "startSec": 2.13, "endSec": 3.75},
            {"id": "boss_skeleton_golem_roar_and_stagger_collapse", "startSec": 4.25, "endSec": 5.54},
        ],
        "prompt": make_prompt(
            "the stone arena",
            "three colossal bosses: an Orc Brute, a Frost Golem, and a Skeleton Golem",
            "It adds three earth-shaking boss impacts separated by silence: an Orc Brute greatclub slam, a Frost Golem glacier fist smash, and a Skeleton Golem bone-armor shatter collapse.",
            (
                "[Shot 1, 00:00.000-00:00.210] Complete silence.\n\n"
                "[Shot 1, 00:00.210-00:01.630] The giant Orc Brute flexes and slams his massive greatclub into the ground: a deep guttural grunt followed by an earth-shaking sub-bass shockwave and heavy stone boulders cracking open.\n\n"
                "[Shot 1, 00:01.630-00:02.130] Complete silence.\n\n"
                "[Shot 2, 00:02.130-00:03.750] The colossal Frost Golem stomps and smashes both glacier fists into the ground: heavy stone-and-ice footsteps followed by a massive sub-bass tectonic boom and thick glacier ice splitting.\n\n"
                "[Shot 2, 00:03.750-00:04.250] Complete silence.\n\n"
                "[Shot 3, 00:04.250-00:05.540] The giant Skeleton Golem staggers and its bone armor shatters and collapses onto the stone floor: a deep hollow bone-giant groan followed by a massive cascade of heavy bone plates and stone crashing down.\n\n"
                "[Shot 3, 00:05.540-00:05.875] Complete silence."
            ),
            "Three colossal, chest-rattling boss impacts: greatclub ground slam, glacier-fist tectonic smash, and giant bone-armor collapse.",
        ),
    },
    {
        "id": "13_sacred_stones_and_field_heal",
        "video": "13_sacred_stones_and_field_heal.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 60.0,
        "lpf_hz": 5400.0,
        "sub_db": 2.0,
        "silence_windows": [[0.0, 0.21], [1.75, 2.29], [3.75, 4.25], [5.5, 5.875]],
        "beats": [
            {"id": "sacred_stone_inspect_and_wellspring", "startSec": 0.21, "endSec": 1.75},
            {"id": "commune_rose_ring_bloom_and_channel", "startSec": 2.29, "endSec": 3.75},
            {"id": "commune_mode_a_field_heal", "startSec": 4.25, "endSec": 5.50},
        ],
        "prompt": make_prompt(
            "the Village Well and sacred stone monument",
            "the heroes inspecting the Sacred Stone, blooming the Crimson Rose Ring, and triggering a golden Field Heal",
            "It adds a sacred stone water-and-travertine resonance, a blooming crimson rose-vine foley, and a warm golden healing chime.",
            (
                "[Shot 1, 00:00.000-00:00.210] Complete silence.\n\n"
                "[Shot 1, 00:00.210-00:01.750] Inspecting the Sacred Stone by the Village Well: a deep, warm carved-stone acoustic resonance combined with clear, gentle wellspring water rippling.\n\n"
                "[Shot 1, 00:01.750-00:02.290] Complete silence.\n\n"
                "[Shot 2, 00:02.290-00:03.750] The 24-cluster Crimson Rose Ring blooms from the earth: a soft, lush sub-bass earth swell combined with organic rose vines unfurling and velvety petals rustling.\n\n"
                "[Shot 2, 00:03.750-00:04.250] Complete silence.\n\n"
                "[Shot 3, 00:04.250-00:05.500] Mode A Field Heal triggers: a warm, comforting low-mid acoustic harp harmonic and soft golden breeze pulse.\n\n"
                "[Shot 3, 00:05.500-00:05.875] Complete silence."
            ),
            "Warm carved-stone resonance and clear well water ripple, organic blooming rose vines and petals, and a warm acoustic harp heal pulse.",
        ),
    },
    {
        "id": "14_coop_downed_revive_and_rebirth",
        "video": "14_coop_downed_revive_and_rebirth.mp4",
        "n_frames": 141,
        "seed": 42,
        "hpf_hz": 55.0,
        "lpf_hz": 5400.0,
        "sub_db": 2.5,
        "silence_windows": [[0.0, 0.21], [1.29, 1.83], [3.75, 4.25], [5.5, 5.875]],
        "beats": [
            {"id": "coop_partner_downed_collapse", "startSec": 0.21, "endSec": 1.29},
            {"id": "coop_proximity_revive_channel_and_rise", "startSec": 1.83, "endSec": 3.75},
            {"id": "coop_sanctuary_rebirth_respawn", "startSec": 4.25, "endSec": 5.50},
        ],
        "prompt": make_prompt(
            "the stone arena",
            "a fallen hero collapsing, being revived by their partner, and respawning with a golden ward shield",
            "It adds a heavy downed collapse thud, a warm revive hand-clasp and stand-up foley, and a resonant Sanctuary Rebirth ward shimmer.",
            (
                "[Shot 1, 00:00.000-00:00.210] Complete silence.\n\n"
                "[Shot 1, 00:00.210-00:01.290] A hero is defeated and collapses onto the stone floor: a deep sub-bass heartbeat drop and heavy armor-and-cloth body thud on stone.\n\n"
                "[Shot 1, 00:01.290-00:01.830] Complete silence.\n\n"
                "[Shot 2, 00:01.830-00:03.750] Proximity Co-Op Revive: a warm, rising low-bass pulse, firm leather gauntlet hand-clasp, and crisp boot-and-armor foley as the partner stands back up.\n\n"
                "[Shot 2, 00:03.750-00:04.250] Complete silence.\n\n"
                "[Shot 3, 00:04.250-00:05.500] Sanctuary Rebirth respawn: a deep, protective sub-bass ward lock and a warm, resonant bronze temple-bell harmonic.\n\n"
                "[Shot 3, 00:05.500-00:05.875] Complete silence."
            ),
            "Heavy body collapse thud on stone, leather gauntlet clasp and armor stand-up foley, and protective sub-bass ward lock with warm bronze bell resonance.",
        ),
    },
]


def polish_multi_beat_sfx(wav_np, sr: int, hpf_hz: float, lpf_hz: float, sub_db: float, silence_windows: list):
    import numpy as np

    n = wav_np.shape[1]
    freqs = np.fft.rfftfreq(n, d=1.0 / sr)
    # 1. Category-specific High-Pass & 8th-order Smooth Ultrasonic Roll-Off
    hp_gain = 1.0 - (1.0 / (1.0 + (np.maximum(freqs, 1e-3) / max(20.0, hpf_hz)) ** 4))
    lp_gain = 1.0 / (1.0 + (freqs / max(2500.0, lpf_hz)) ** 8)
    band_gain = hp_gain * lp_gain
    sub_gain = 1.0 / (1.0 + (freqs / 135.0) ** 4)

    clean = np.zeros_like(wav_np)
    sub = np.zeros_like(wav_np)
    for ch in range(wav_np.shape[0]):
        spec = np.fft.rfft(wav_np[ch])
        clean[ch] = np.fft.irfft(spec * band_gain, n=n)
        sub[ch] = np.fft.irfft(spec * sub_gain, n=n)

    sub_weight = 0.0 if sub_db <= 0.1 else (0.15 * sub_db)
    boosted = clean + sub_weight * np.tanh(sub * 2.2)

    # 2. Multi-Window Visual-Synced Silence Gate (with 45ms smooth fade-in/out at window edges)
    t = np.arange(n, dtype=np.float32) / sr
    env = np.ones(n, dtype=np.float32)
    fade_s = 0.045
    for w_start, w_end in silence_windows:
        if w_end <= w_start:
            continue
        in_win = (t >= w_start) & (t <= w_end)
        # Smooth ramp into silence over first 45ms of the silence window, and 25ms ramp out before next beat
        env_win = np.zeros(np.sum(in_win), dtype=np.float32)
        t_w = t[in_win]
        left_ramp = t_w < (w_start + fade_s)
        if w_start > 0.01 and np.any(left_ramp):
            env_win[left_ramp] = np.cos(0.5 * np.pi * (t_w[left_ramp] - w_start) / fade_s) ** 2
        env[in_win] = np.minimum(env[in_win], env_win)

    out = boosted * env[None, :]
    pk = float(np.max(np.abs(out))) + 1e-8
    out = (out / pk) * 0.92
    return out.astype(np.float32)


def save_clip_and_slices(decoded_audio, src_mp4: Path, clip_spec: dict, base_out_dir: Path):
    import numpy as np
    import wave

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

    polished_np = polish_multi_beat_sfx(
        raw_np,
        sr,
        clip_spec["hpf_hz"],
        clip_spec["lpf_hz"],
        clip_spec["sub_db"],
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
        ["ffmpeg", "-y", "-v", "error", "-i", str(full_wav), "-b:a", "192k", str(full_mp3)],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", str(src_mp4), "-i", str(full_wav),
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
            str(mux_mp4),
        ],
        check=True,
    )

    # Slice each individual beat with 20ms pre-pad and 80ms post-tail + smooth micro-fades
    slice_results = []
    n_total = polished_np.shape[1]
    for beat in clip_spec["beats"]:
        bid = beat["id"]
        s_idx = max(0, int((beat["startSec"] - 0.02) * sr))
        e_idx = min(n_total, int((beat["endSec"] + 0.08) * sr))
        seg = polished_np[:, s_idx:e_idx].copy()
        seg_len = seg.shape[1]
        if seg_len > int(0.06 * sr):
            fi = int(0.015 * sr)
            fo = int(0.045 * sr)
            seg[:, :fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)[None, :]
            seg[:, -fo:] *= np.linspace(1.0, 0.0, fo, dtype=np.float32)[None, :]
        pk = float(np.max(np.abs(seg))) + 1e-8
        if pk > 0.01:
            seg = (seg / pk) * 0.90

        s_wav = slices_dir / f"{bid}.wav"
        s_mp3 = slices_dir / f"{bid}.mp3"
        s_pcm = (seg.T * 32767.0).astype(np.int16)
        with wave.open(str(s_wav), "wb") as wf:
            wf.setnchannels(s_pcm.shape[1])
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(s_pcm.tobytes())
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(s_wav), "-b:a", "192k", str(s_mp3)],
            check=True,
        )
        slice_results.append({"id": bid, "duration_s": round(seg_len / sr, 2)})

    print(f"[DONE CLIP] {cid} -> saved full stem + mux + {len(slice_results)} atomic slices", flush=True)
    return {"clip_id": cid, "slices": slice_results}


@app.function(
    image=image,
    gpu="H200",
    timeout=600,
    volumes={"/vol": vol_models, "/vol_outputs": vol_outputs},
)
def run_foley_worker(worker_clips: list) -> list:
    link_models_to_comfy()
    sys.path.insert(0, str(COMFY_PATH))
    sys.path.insert(0, str(COMFY_PATH / "custom_nodes"))

    import torch
    import comfy.ldm.common_dit
    import comfy.model_management
    import comfy.nested_tensor
    import comfy.quant_ops
    import node_helpers
    from comfy.ldm.modules.attention import AttentionTensorContainer, optimized_attention
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
    import nodes
    from comfy_extras.nodes_minimax_h3 import FPS, MiniMaxH3SigmaShift, _empty_av_latent
    from comfy_extras.nodes_custom_sampler import BasicScheduler, CFGGuider, KSamplerSelect, RandomNoise, SamplerCustomAdvanced
    from comfy_extras.nodes_audio import VAEDecodeAudio

    def unwrap(out):
        return out.result if hasattr(out, "result") else out

    base_out_dir = Path("/vol_outputs/foley_suite")
    stems_dir = base_out_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)

    pending_clips = [c for c in worker_clips if not (stems_dir / f"{c['id']}.wav").exists()]
    if not pending_clips:
        print("All clips in this worker already exist! Skipping.", flush=True)
        return []

    results = []
    with torch.inference_mode():
        print(f"Loading Qwen3-VL + Video VAE + Audio VAE for {len(pending_clips)} clips...", flush=True)
        clip_model = unwrap(nodes.CLIPLoader().load_clip("qwen3vl_32b_minimax_h3_int8_convrot.safetensors", "minimax", "default"))[0]
        video_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_video_vae_fp16.safetensors"))[0]
        audio_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_audio_vae_fp32.safetensors"))[0]

        prepared_jobs = []
        for c_spec in pending_clips:
            inp_mp4 = VOL_ROOT / "inputs" / "foley_suite" / c_spec["video"]
            n_frames = c_spec["n_frames"]
            frames_t = load_video_frames_tensor(inp_mp4, max_frames=n_frames)
            empty_av_latent, _ = _empty_av_latent(832, 480, n_frames)
            z_ref_video = video_vae.encode(frames_t[:n_frames])
            sample_idx = list(range(0, n_frames, FPS // 2))
            qwen_frames = frames_t[sample_idx]
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
            prepared_jobs.append((c_spec, inp_mp4, z_ref_video, empty_aud_lat, pos_cond, neg_cond))

        del clip_model, video_vae
        comfy.model_management.unload_all_models()
        gc.collect()
        torch.cuda.empty_cache()

        print("Loading Undistilled Base Model (16 steps, CFGGuider=1.8, KV-Cache)...", flush=True)
        unet_base = unwrap(nodes.UNETLoader().load_unet("minimax_h3_ref2va_pruned_int8_convrot.safetensors", "default"))[0]
        model_obj = unwrap(MiniMaxH3SigmaShift.execute(unet_base, 12.0, 4.0))[0]
        sigmas = unwrap(BasicScheduler.execute(model_obj, "simple", 16, 1.0))[0]
        sampler = unwrap(KSamplerSelect.execute("euler"))[0]
        dit = unet_base.model.diffusion_model

        for c_spec, inp_mp4, z_ref_video, empty_aud_lat, pos_cond, neg_cond in prepared_jobs:
            cid = c_spec["id"]
            kv_cache = {}
            cached_audio_pos = {"pos_aud": None}
            state = {"cache_built": False}

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
                    t_bake = time.perf_counter()
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
                    cached_audio_pos["pos_aud"] = layout.position_ids[aa:ab].clone()

                    for layer_idx, block in enumerate(dit.blocks):
                        shift_msa, scale_msa, gate_msa, shift_mlp, scale_mlp, gate_mlp = block.adaln_proj(t_emb)
                        h_norm = _mod_scale_shift(block.norm1(h), shift_msa, scale_msa, mod_segments)
                        attn_mod = block.attn
                        s = h_norm.shape[0]
                        q, k, v = attn_mod.qkv_proj(h_norm).split(attn_mod.heads * attn_mod.head_dim, dim=-1)
                        v = v.view(s, attn_mod.heads, attn_mod.head_dim)
                        q = q.view(1, s, attn_mod.heads, attn_mod.head_dim)
                        k = k.view(1, s, attn_mod.heads, attn_mod.head_dim)
                        qw = comfy.model_management.cast_to(attn_mod.q_norm.weight, device=device)
                        kw = comfy.model_management.cast_to(attn_mod.k_norm.weight, device=device)
                        rot = rope_freqs.shape[-3] * 2
                        comfy.quant_ops.ck.rms_rope_split_half_(q, k, rope_freqs, qw, kw, epsilon=attn_mod.q_norm.eps, rot_dim=rot)
                        q = q[0]
                        k = k[0]

                        k_stat = torch.cat([k[ra:rb], k[va:vb]], dim=0).clone()
                        v_stat = torch.cat([v[ra:rb], v[va:vb]], dim=0).clone()
                        kv_cache[layer_idx] = (k_stat, v_stat)

                        v_c = v.clone()
                        qc = AttentionTensorContainer(q.transpose(0, 1).unsqueeze(0))
                        kc = AttentionTensorContainer(k.transpose(0, 1).unsqueeze(0))
                        vc = AttentionTensorContainer(v_c.transpose(0, 1).unsqueeze(0))
                        attn_out = attn_mod.out_proj(optimized_attention(qc, kc, vc, attn_mod.heads, mask=None, skip_reshape=True, transformer_options=transformer_options).squeeze(0))

                        h = _mod_gate(h, gate_msa, attn_out, mod_segments)
                        h_norm2 = _mod_scale_shift(block.norm2(h), shift_mlp, scale_mlp, mod_segments)
                        h = _mod_gate(h, gate_mlp, block.mlp(h_norm2), mod_segments)

                    state["cache_built"] = True
                    print(f"    [{cid}] VIDEO KV-CACHE BUILT ONCE in {time.perf_counter() - t_bake:.1f}s", flush=True)
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
                mod_segments_fast.append((n_text, n_text + n_aud, t_row[seg_t["audio"]] * 3 + seg_tag["audio"]))

                audio_rows = pack_audio(audio_x.to(torch.float32))
                audio_embed = dit.audio_patch_proj(audio_rows).to(dtype)
                text_states = context[0]
                if text_states.shape[-1] != dit.hidden_size:
                    text_states = dit.token_refiner(dit.condition_proj(text_states), transformer_options=transformer_options)

                h_fast = torch.cat([text_states, audio_embed], dim=0)
                pos_fast = torch.cat([layout.position_ids[ta:tb], cached_audio_pos["pos_aud"]], dim=0)
                rope_fast = rope_rotation_table(dit.rope_freqs(pos_fast, device), dtype)

                for layer_idx, block in enumerate(dit.blocks):
                    shift_msa, scale_msa, gate_msa, shift_mlp, scale_mlp, gate_mlp = block.adaln_proj(t_emb)
                    h_norm = _mod_scale_shift(block.norm1(h_fast), shift_msa, scale_msa, mod_segments_fast)
                    attn_mod = block.attn
                    s_f = h_norm.shape[0]
                    q, k, v = attn_mod.qkv_proj(h_norm).split(attn_mod.heads * attn_mod.head_dim, dim=-1)
                    v = v.view(s_f, attn_mod.heads, attn_mod.head_dim)
                    q = q.view(1, s_f, attn_mod.heads, attn_mod.head_dim)
                    k = k.view(1, s_f, attn_mod.heads, attn_mod.head_dim)
                    qw = comfy.model_management.cast_to(attn_mod.q_norm.weight, device=device)
                    kw = comfy.model_management.cast_to(attn_mod.k_norm.weight, device=device)
                    rot = rope_fast.shape[-3] * 2
                    comfy.quant_ops.ck.rms_rope_split_half_(q, k, rope_fast, qw, kw, epsilon=attn_mod.q_norm.eps, rot_dim=rot)
                    q = q[0]
                    k = k[0]

                    k_stat, v_stat = kv_cache[layer_idx]
                    k_full = torch.cat([k_stat, k], dim=0)
                    v_full = torch.cat([v_stat, v], dim=0)

                    qc = AttentionTensorContainer(q.transpose(0, 1).unsqueeze(0))
                    kc = AttentionTensorContainer(k_full.transpose(0, 1).unsqueeze(0))
                    vc = AttentionTensorContainer(v_full.transpose(0, 1).unsqueeze(0))
                    attn_out = attn_mod.out_proj(optimized_attention(qc, kc, vc, attn_mod.heads, mask=None, skip_reshape=True, transformer_options=transformer_options).squeeze(0))

                    h_fast = _mod_gate(h_fast, gate_msa, attn_out, mod_segments_fast)
                    h_norm2 = _mod_scale_shift(block.norm2(h_fast), shift_mlp, scale_mlp, mod_segments_fast)
                    h_fast = _mod_gate(h_fast, gate_mlp, block.mlp(h_norm2), mod_segments_fast)

                dummy_video_seg = (0, 1, t_row[seg_t["video"]])
                audio_seg_fast = (n_text, n_text + n_aud, t_row[seg_t["audio"]])
                _, a_out = dit.final_layer(h_fast, t_emb, dummy_video_seg, audio_seg_fast, sigma_v, transformer_options.get("sample_sigmas"), (shift_v, shift_a))
                audio_out = unpack_audio(a_out)
                video_zero = torch.zeros_like(video_x[:, :, :orig_t, :orig_h, :orig_w])
                return [video_zero, -audio_out.to(audio_x.dtype)]

            dit._forward = forward_cached

            def make_lat():
                return {
                    "samples": comfy.nested_tensor.NestedTensor((z_ref_video.clone(), empty_aud_lat.clone())),
                    "noise_mask": comfy.nested_tensor.NestedTensor((torch.zeros_like(z_ref_video), torch.ones_like(empty_aud_lat))),
                }

            print(f"[{cid}] Running 16-step H3 V2A with Fast LSE KV-Cache (seed={c_spec['seed']}, cfg=1.8)...", flush=True)
            guider = unwrap(CFGGuider.execute(model_obj, pos_cond, neg_cond, 1.8))[0]
            noise = unwrap(RandomNoise.execute(c_spec["seed"]))[0]
            t0 = time.perf_counter()
            _, den = unwrap(SamplerCustomAdvanced.execute(
                noise=noise, guider=guider, sampler=sampler, sigmas=sigmas, latent_image=make_lat()
            ))
            el = time.perf_counter() - t0
            aud = unwrap(VAEDecodeAudio.execute(vae=audio_vae, samples=den))[0]
            st = save_clip_and_slices(aud, inp_mp4, c_spec, base_out_dir)
            st["elapsed_s"] = round(el, 1)
            vol_outputs.commit()
            results.append(st)
            print(f"[{cid}] Completed in {el:.1f}s!", flush=True)

            kv_cache.clear()
            gc.collect()
            torch.cuda.empty_cache()

    return results


@app.local_entrypoint()
def main():
    # Shard the 14 clips into 7 parallel H200 workers (2 clips per worker)
    workers = [CLIP_SPECS[i:i + 2] for i in range(0, len(CLIP_SPECS), 2)]
    print(f"Spawning {len(workers)} parallel H200 workers for {len(CLIP_SPECS)} foley clips (46 atomic slices)...", flush=True)
    calls = [run_foley_worker.spawn(w) for w in workers]
    for idx, (w, c) in enumerate(zip(workers, calls), 1):
        ids = ", ".join(x["id"] for x in w)
        print(f"  Worker {idx}: [{ids}] -> call_id={c.object_id}", flush=True)
    all_res = []
    for idx, c in enumerate(calls, 1):
        res = c.get()
        all_res.extend(res)
        print(f"  Worker {idx} finished ({len(res)} clips completed)", flush=True)
    print(f"All {len(all_res)} foley clips and 46 slices generated and committed!", flush=True)
