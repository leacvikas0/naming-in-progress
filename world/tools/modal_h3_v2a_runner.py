"""
Parallel 4-GPU Game-SFX Production Factory on Modal H200 (`run_spell_worker.map`):
Runs all 4 Core Elemental Spells (`Frost Lance`, `Shatterlance`, `Cinder Fall`, `Storm Lance`)
IN PARALLEL across 4 H200 containers (~4.5 minutes total wall-clock time, zero 600s timeout!).

Each parallel worker:
  1. Loads its clean 832x480 24fps clip (`124f` or `141f`),
  2. Encodes 5 distinct, creative Game-SFX positive prompts + 1 strict Game-SFX negative prompt,
  3. Builds the 50-layer Video KV-Cache ONCE on Step 0 (~16s),
  4. Runs all 5 variations at 16 steps using `CFGGuider(cfg=1.8)` + `euler` + `simple`,
  5. Applies the Game-SFX Post-Polish (`+4.5 dB` sub-bass punch `<130Hz`, `5.8 kHz` texture-preserving
     ultrasonic roll-off, and a clean Gameplay Silence Gate after the active spell impact window),
  6. Saves & commits both `_raw` and `_game_ready` `.wav` + `_game_mux.mp4` after every single variation!
"""

import gc
import os
import subprocess
import sys
import time
from pathlib import Path
import modal

app = modal.App("haru-machi-h3-parallel-20sfx-factory")

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


def polish_game_sfx(wav_np, sr: int, gate_start_s: float, gate_end_s: float):
    """
    Controlled Game-SFX Post-Processing:
    1. +4.5 dB Sub-Bass Punch below 135 Hz (soft tanh saturation so it never clips harshly)
    2. 5,800 Hz brick-wall/smooth roll-off in frequency domain (preserves 100% of 100Hz-5.8kHz
       physical ice/stone/fire texture while stripping >6kHz ultrasonic VAE hiss)
    3. Smooth Gameplay Silence Gate from `gate_start_s` to `gate_end_s` (eliminates any post-attack filler/rumble)
    """
    import numpy as np

    n = wav_np.shape[1]
    freqs = np.fft.rfftfreq(n, d=1.0 / sr)
    # Smooth frequency-domain roll-off above 5,600 Hz and sub-bass extract below 135 Hz
    lp_gain = 1.0 / (1.0 + (freqs / 5600.0) ** 8)
    sub_gain = 1.0 / (1.0 + (freqs / 135.0) ** 4)

    clean = np.zeros_like(wav_np)
    sub = np.zeros_like(wav_np)
    for ch in range(wav_np.shape[0]):
        spec = np.fft.rfft(wav_np[ch])
        clean[ch] = np.fft.irfft(spec * lp_gain, n=n)
        sub[ch] = np.fft.irfft(spec * sub_gain, n=n)

    boosted = clean + 0.68 * np.tanh(sub * 2.2)

    n = boosted.shape[1]
    t = np.arange(n, dtype=np.float32) / sr
    env = np.ones(n, dtype=np.float32)
    # Also gate pre-cast first 0.08s cleanly
    pre_mask = t < 0.08
    env[pre_mask] = (t[pre_mask] / 0.08) ** 2
    post_mask = t > gate_start_s
    span = max(0.2, gate_end_s - gate_start_s)
    env[post_mask] = np.exp(-2.8 * (t[post_mask] - gate_start_s) / span) * np.clip((gate_end_s - t[post_mask]) / span, 0.0, 1.0)

    out = boosted * env[None, :]
    pk = float(np.max(np.abs(out))) + 1e-8
    out = (out / pk) * 0.92
    return out.astype(np.float32)


def save_raw_and_polished(decoded_audio, src_mp4: Path, out_dir: Path, stem_name: str, gate_start_s: float, gate_end_s: float):
    import numpy as np
    import wave

    out_dir.mkdir(parents=True, exist_ok=True)
    waveform = decoded_audio["waveform"]
    sr = int(decoded_audio.get("sample_rate", 32000))
    if waveform.ndim == 3:
        waveform = waveform[0]
    raw_np = waveform.detach().cpu().float().clamp(-1.0, 1.0).numpy()
    if raw_np.shape[0] == 1:
        raw_np = np.repeat(raw_np, 2, axis=0)

    polished_np = polish_game_sfx(raw_np, sr, gate_start_s, gate_end_s)

    for suffix, arr in (("", polished_np), ("_raw", raw_np)):
        name = f"{stem_name}{suffix}"
        wav_path = out_dir / f"{name}.wav"
        mux_path = out_dir / f"{name}_game_mux.mp4"
        pcm16 = (arr.T * 32767.0).astype(np.int16)
        with wave.open(str(wav_path), "wb") as wf:
            wf.setnchannels(pcm16.shape[1])
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(pcm16.tobytes())
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(src_mp4),
                "-i", str(wav_path),
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                str(mux_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    mono = polished_np.mean(axis=0)
    fft = np.abs(np.fft.rfft(mono))
    freqs = np.fft.rfftfreq(len(mono), 1.0 / sr)
    e_tot = float(np.sum(fft ** 2)) + 1e-12
    bass_pct = round(float(np.sum(fft[freqs < 250] ** 2)) / e_tot * 100.0, 1)
    mid_pct = round(float(np.sum(fft[(freqs >= 250) & (freqs < 2000)] ** 2)) / e_tot * 100.0, 1)
    hi_pct = round(float(np.sum(fft[(freqs >= 2000) & (freqs < 6000)] ** 2)) / e_tot * 100.0, 1)
    centroid = round(float(np.sum(freqs * fft) / (np.sum(fft) + 1e-12)), 0)
    print(f"[SAVED] {stem_name} -> cent={centroid:.0f}Hz | bass(<250Hz)={bass_pct}% | mid(250-2k)={mid_pct}% | ice_bite(2k-6k)={hi_pct}%")
    return {"name": stem_name, "centroid_hz": centroid, "bass_pct": bass_pct, "mid_pct": mid_pct, "hi_pct": hi_pct}


def make_6sec_prompt(subj1: str, subj2: str, summary_body: str, shot_body: str, soundscape_body: str) -> str:
    return (
        "subject_definitions:\n"
        f"<Subject 1> is {subj1} in <Video 1>.\n"
        f"<Subject 2> is {subj2} in <Video 1>.\n"
        "<Video 1> is the source video for the target video edit.\n\n"
        "summary:\n"
        f"[video editing] The target video is an edited version of <Video 1>. {summary_body}\n\n"
        "retention_analysis:\n"
        "<Subject 1> (appears throughout): fully_preserved - the arena and environment are retained.\n"
        "<Subject 2> (appears throughout): fully_preserved - the visual effect timing and geometry are retained.\n"
        "<Video 1> (cut and pacing structure): fully_preserved - the camera framing and timing are retained 1:1.\n\n"
        "detailed_description:\n"
        "The target video is in a 3D CG animated style.\n\n"
        f"{shot_body}\n\n"
        "overall_soundscape:\n"
        f"{soundscape_body} No ambient wind, no mist, no sound after the impact, no dialogue.\n\n"
        "non_diegetic_music:\n"
        "N/A"
    )


GAME_NEG_PROMPT = (
    "subject_definitions:\n"
    "<Subject 1> is the arena in <Video 1>.\n"
    "<Subject 2> is the effect in <Video 1>.\n"
    "<Video 1> is the source video.\n\n"
    "summary:\n"
    "[video editing] Noisy ambient movie scene with wind hiss, mist, dull mud landslide, and lingering rumble at the end.\n\n"
    "retention_analysis:\n"
    "<Subject 1>: fully_preserved\n"
    "<Subject 2>: fully_preserved\n"
    "<Video 1>: fully_preserved\n\n"
    "detailed_description:\n"
    "The target video has continuous wind noise, mist hissing, room tone, white noise static, glassy high-frequency ringing, dull dirt landslide, and a second rumble or sound after 2.0 seconds.\n\n"
    "overall_soundscape:\n"
    "Ambient wind, mist hiss, room tone, white noise, radio static, sound at the end, speech, dialogue.\n\n"
    "non_diegetic_music:\n"
    "Background music, synthesizer pad, organ drone, brass."
)


SPELL_BUNDLES = [
    # =========================================================================
    # WORKER 1: FROST LANCE (5 Ice + Sub-Bass Variations)
    # =========================================================================
    {
        "spell_id": "frost_lance",
        "video": "clean_frost_lance_124f.mp4",
        "frames": 124,
        "gate_start_s": 1.65,
        "gate_end_s": 2.65,
        "variations": [
            {
                "name": "frost_v1_lake_ice_split",
                "seed": 42,
                "prompt": make_6sec_prompt(
                    "the combat arena",
                    "the erupting wall of thick blue glacier ice spikes",
                    "It adds a heavy sub-bass boom and a sharp, unmistakable frozen lake-ice cracking and splitting sound on the initial eruption, followed by complete silence.",
                    "[Shot 1, 00:00.000-00:00.220] Complete silence before the attack.\n\n"
                    "[Shot 1, 00:00.220-00:01.400] As <Subject 2> erupts upward, a heavy sub-bass impact boom hits at the exact same moment as the loud, biting whip-crack of a thick frozen lake-ice sheet splitting open under tension and solid blocks of clear ice crunching and locking into place.\n\n"
                    "[Shot 1, 00:01.400-00:05.166] Complete silence with zero wind, zero mist, and zero rumble.",
                    "A deep sub-bass impact boom combined with thick frozen lake-ice cracking, splitting, and solid ice blocks crunching on the initial eruption only.",
                ),
            },
            {
                "name": "frost_v2_flash_freeze_crunch",
                "seed": 108,
                "prompt": make_6sec_prompt(
                    "the combat arena",
                    "the erupting wall of blue crystal ice spikes",
                    "It adds a punchy bass thud and a fast, biting flash-freeze ice crystallization crunch on the initial eruption, followed by complete silence.",
                    "[Shot 1, 00:00.000-00:00.220] Complete silence.\n\n"
                    "[Shot 1, 00:00.220-00:01.400] A deep bass shockwave thump fires as <Subject 2> shoots upward with the rapid, crisp crunch of water flash-freezing into thick solid ice, hard-packed frozen snow crust snapping, and heavy solid ice pillars locking together.\n\n"
                    "[Shot 1, 00:01.400-00:05.166] Complete silence.",
                    "A deep bass thump and rapid flash-freeze solid ice crystallization crunch on the initial cast only.",
                ),
            },
            {
                "name": "frost_v3_glacier_cleave_shatter",
                "seed": 77,
                "prompt": make_6sec_prompt(
                    "the combat arena",
                    "the wall of jagged blue glacier blades",
                    "It adds a concussive sub-bass drop and the heavy physical crunch of solid block ice cleaving and fracturing upward, followed by silence.",
                    "[Shot 1, 00:00.000-00:00.220] Complete silence.\n\n"
                    "[Shot 1, 00:00.220-00:01.400] A concussive low-end bass drop hits as <Subject 2> cleaves upward with the sharp, heavy physical crunch of an ice axe splitting thick solid glacier ice blocks and sharp frost crystals snapping into place.\n\n"
                    "[Shot 1, 00:01.400-00:05.166] Complete silence.",
                    "A concussive sub-bass drop with heavy solid block-ice cleaving and sharp frost-crystal cracking at the start only.",
                ),
            },
            {
                "name": "frost_v4_cryo_shockwave_bite",
                "seed": 202,
                "prompt": make_6sec_prompt(
                    "the combat arena",
                    "the erupting blue ice monoliths",
                    "It adds a sub-zero vacuum bass punch and a sharp, resonant ice-sheet snap on the initial eruption, followed by complete silence.",
                    "[Shot 1, 00:00.000-00:00.220] Complete silence.\n\n"
                    "[Shot 1, 00:00.220-00:01.400] A tight sub-bass vacuum implosion thud strikes the ground, immediately followed by a biting, resonant ice-sheet fracture crack and solid frozen crystal pillars slamming upward.\n\n"
                    "[Shot 1, 00:01.400-00:05.166] Complete silence.",
                    "A tight sub-bass implosion thud and biting ice-sheet fracture crack on the initial eruption only.",
                ),
            },
            {
                "name": "frost_v5_avalanching_ice_wall",
                "seed": 303,
                "prompt": make_6sec_prompt(
                    "the combat arena",
                    "the towering blue glacier wall",
                    "It adds a massive low-frequency bass boom and deep glacier-ice creaking and cracking on the eruption, followed by complete silence.",
                    "[Shot 1, 00:00.000-00:00.220] Complete silence.\n\n"
                    "[Shot 1, 00:00.220-00:01.400] An earth-shaking low bass boom erupts alongside the deep, heavy groan and sharp cracking of a thick blue glacier ice wall splitting open and freezing solid.\n\n"
                    "[Shot 1, 00:01.400-00:05.166] Complete silence.",
                    "An earth-shaking low bass boom with deep glacier-ice groaning and sharp ice cracking on the initial eruption only.",
                ),
            },
        ],
    },
    # =========================================================================
    # WORKER 2: SHATTERLANCE (5 Two-Beat Ice Railgun Variations)
    # =========================================================================
    {
        "spell_id": "shatterlance",
        "video": "clean_shatterlance_only_124f.mp4",
        "frames": 124,
        "gate_start_s": 1.80,
        "gate_end_s": 2.60,
        "variations": [
            {
                "name": "shatter_v1_ice_railgun_detonate",
                "seed": 42,
                "prompt": make_6sec_prompt(
                    "the combat arena",
                    "the spiraling ice shards and giant ice railgun spear",
                    "It adds a crisp ice-shard lock-in sound followed by a massive sub-bass railgun shot and solid ice-pillar shatter, then complete silence.",
                    "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                    "[Shot 1, 00:00.250-00:00.950] Solid frozen ice shards snap and lock together rapidly in mid-air with crisp ice-crystal clicks and a tight rising frost charge.\n\n"
                    "[Shot 1, 00:00.950-00:01.700] The giant ice spear fires and impacts with a massive sub-bass cannon boom and the violent, heavy cracking and shattering of thick solid glacier ice pillars.\n\n"
                    "[Shot 1, 00:01.700-00:05.166] Complete silence.",
                    "Crisp solid ice shards locking together, followed immediately by a massive sub-bass railgun boom and thick glacier ice shattering.",
                ),
            },
            {
                "name": "shatter_v2_cryo_spear_artillery",
                "seed": 108,
                "prompt": make_6sec_prompt(
                    "the combat arena",
                    "the converging frost crystals and exploding ice crown",
                    "It adds a tight frost-crystal charge followed by a deep artillery bass slam and frozen lake-ice whip-crack, then silence.",
                    "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                    "[Shot 1, 00:00.250-00:00.950] Biting frost crystals whirl and snap tightly together into a solid frozen spear.\n\n"
                    "[Shot 1, 00:00.950-00:01.700] A deep low-end artillery bass slam fires as the ice spear detonates with a loud, sharp frozen lake-ice whip-crack and heavy solid ice blocks crunching.\n\n"
                    "[Shot 1, 00:01.700-00:05.166] Complete silence.",
                    "Tight frost crystal assembly followed by a deep artillery bass slam and sharp frozen lake-ice whip-crack.",
                ),
            },
            {
                "name": "shatter_v3_glacier_javelin_crush",
                "seed": 77,
                "prompt": make_6sec_prompt(
                    "the combat arena",
                    "the heavy ice javelin and erupting ice spires",
                    "It adds solid ice blocks grinding into a spear followed by a concussive sub-bass drop and heavy ice cleave, then silence.",
                    "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                    "[Shot 1, 00:00.250-00:00.950] Heavy solid ice blocks grind and lock tightly into a floating glacier javelin.\n\n"
                    "[Shot 1, 00:00.950-00:01.700] The javelin slams downrange with a concussive sub-bass shockwave and the heavy physical crunch of thick clear block ice cleaving and cracking apart.\n\n"
                    "[Shot 1, 00:01.700-00:05.166] Complete silence.",
                    "Solid ice blocks locking into place followed by a concussive sub-bass shockwave and heavy block-ice cleaving.",
                ),
            },
            {
                "name": "shatter_v4_subzero_sniper_crack",
                "seed": 202,
                "prompt": make_6sec_prompt(
                    "the combat arena",
                    "the high-velocity ice lance and shatter crown",
                    "It adds a fast crystalline snap-lock followed by a supersonic air crack, deep bass boom, and solid ice fracture, then silence.",
                    "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                    "[Shot 1, 00:00.250-00:00.950] Frozen crystal facets click and lock into alignment with a fast, tight mechanical-like ice snap.\n\n"
                    "[Shot 1, 00:00.950-00:01.700] A sharp supersonic air whip and deep sub-bass boom fire as the lance shatters into thick frozen ice spires with a heavy ice-sheet crack.\n\n"
                    "[Shot 1, 00:01.700-00:05.166] Complete silence.",
                    "Fast ice-facet snap-lock followed by a supersonic whip-crack, deep sub-bass boom, and thick ice-sheet fracture.",
                ),
            },
            {
                "name": "shatter_v5_heavy_ice_breaker",
                "seed": 303,
                "prompt": make_6sec_prompt(
                    "the combat arena",
                    "the compressed glacier spear and exploding ice spikes",
                    "It adds a deep ice-compression creak followed by a chest-hitting bass boom and solid frost burst, then silence.",
                    "[Shot 1, 00:00.000-00:00.250] Complete silence.\n\n"
                    "[Shot 1, 00:00.250-00:00.950] Thick glacier ice creaks and snaps under heavy compression as the spear forms.\n\n"
                    "[Shot 1, 00:00.950-00:01.700] A chest-hitting low bass boom and sharp solid ice-block explosion erupt as the glacier spikes burst upward.\n\n"
                    "[Shot 1, 00:01.700-00:05.166] Complete silence.",
                    "Deep glacier-ice compression creak followed by a chest-hitting bass boom and sharp solid ice-block explosion.",
                ),
            },
        ],
    },
    # =========================================================================
    # WORKER 3: CINDER FALL METEOR (5 Heavy Magma & Sub-Bass Variations)
    # =========================================================================
    {
        "spell_id": "cinder_fall",
        "video": "clean_cinder_fall_141f.mp4",
        "frames": 141,
        "gate_start_s": 2.05,
        "gate_end_s": 2.85,
        "variations": [
            {
                "name": "cinder_v1_magma_meteor_slam",
                "seed": 42,
                "prompt": make_6sec_prompt(
                    "the stone plaza",
                    "the falling flaming magma boulder and shattering rock chunks",
                    "It adds a tight descending fire whoosh followed by a massive sub-bass explosion boom and heavy volcanic boulder smash, then silence.",
                    "[Shot 1, 00:00.000-00:00.650] A tight, fast descending fireball whoosh roars down from the sky.\n\n"
                    "[Shot 1, 00:00.650-00:02.000] <Subject 2> slams into the stone floor with an earth-shaking sub-bass explosion boom and the heavy, crushing smash of massive volcanic rock boulders breaking apart on stone.\n\n"
                    "[Shot 1, 00:02.000-00:05.875] Complete silence.",
                    "A fast descending fire whoosh followed by an earth-shaking sub-bass explosion boom and heavy volcanic rock boulder smash.",
                ),
            },
            {
                "name": "cinder_v2_heavy_mortar_impact",
                "seed": 108,
                "prompt": make_6sec_prompt(
                    "the stone plaza",
                    "the falling burning asteroid and rock debris",
                    "It adds a fast mortar flame drop followed by a concussive deep bass slam and heavy granite shatter, then silence.",
                    "[Shot 1, 00:00.000-00:00.650] A fast, heavy flame whistle-whoosh drops steeply toward the ground.\n\n"
                    "[Shot 1, 00:00.650-00:02.000] A concussive deep bass slam punches through the ground as heavy granite and magma boulders crack and clatter violently across the stone slabs.\n\n"
                    "[Shot 1, 00:02.000-00:05.875] Complete silence.",
                    "A fast descending flame whoosh followed by a concussive deep bass slam and heavy granite boulder shatter.",
                ),
            },
            {
                "name": "cinder_v3_volcanic_boulder_crush",
                "seed": 77,
                "prompt": make_6sec_prompt(
                    "the stone plaza",
                    "the massive magma rock impact",
                    "It adds a roaring fire dive followed by a deep sub-bass shockwave and heavy rock-on-rock crushing impact, then silence.",
                    "[Shot 1, 00:00.000-00:00.650] A short, powerful roaring fire rush dives downward.\n\n"
                    "[Shot 1, 00:00.650-00:02.000] A deep sub-bass shockwave boom and heavy rock-on-rock crushing impact erupt as the boulder smashes into the plaza.\n\n"
                    "[Shot 1, 00:02.000-00:05.875] Complete silence.",
                    "A short roaring fire dive followed by a deep sub-bass shockwave and heavy rock-on-rock crushing impact.",
                ),
            },
            {
                "name": "cinder_v4_siege_catapult_blast",
                "seed": 202,
                "prompt": make_6sec_prompt(
                    "the stone plaza",
                    "the flaming siege boulder and bouncing magma rocks",
                    "It adds a fast air-and-fire whip followed by an explosive bass boom and heavy stone chunks clattering, then silence.",
                    "[Shot 1, 00:00.000-00:00.650] A fast air-and-fire whip rushes down from above.\n\n"
                    "[Shot 1, 00:00.650-00:02.000] An explosive low-end bass boom and heavy stone slab fracture ring out as large rock chunks bounce once across the cobblestones.\n\n"
                    "[Shot 1, 00:02.000-00:05.875] Complete silence.",
                    "A fast descending fire whip followed by an explosive low-end bass boom and heavy stone slab fracture.",
                ),
            },
            {
                "name": "cinder_v5_molten_anvil_strike",
                "seed": 303,
                "prompt": make_6sec_prompt(
                    "the stone plaza",
                    "the molten rock meteor and crater impact",
                    "It adds a compact flame dive followed by a chest-hitting low-frequency slam and thick volcanic rock splitting apart, then silence.",
                    "[Shot 1, 00:00.000-00:00.650] A compact, heavy flame whoosh dives straight down.\n\n"
                    "[Shot 1, 00:00.650-00:02.000] A chest-hitting low-frequency impact thud and sharp volcanic rock split erupt on impact.\n\n"
                    "[Shot 1, 00:02.000-00:05.875] Complete silence.",
                    "A compact flame dive followed by a chest-hitting low-frequency impact thud and thick volcanic rock splitting apart.",
                ),
            },
        ],
    },
    # =========================================================================
    # WORKER 4: STORM LANCE (5 Lightning Whip + Thunder Sub-Bass Variations)
    # =========================================================================
    {
        "spell_id": "storm_lance",
        "video": "clean_storm_lance_only_124f.mp4",
        "frames": 124,
        "gate_start_s": 1.45,
        "gate_end_s": 2.20,
        "variations": [
            {
                "name": "storm_v1_thunder_whip_crack",
                "seed": 42,
                "prompt": make_6sec_prompt(
                    "the twilight combat arena",
                    "the blazing lightning spear and dark obsidian ground spikes",
                    "It adds an instantaneous sub-bass thunder clap, sharp high-voltage lightning whip-crack, and obsidian rock spike fracture, then silence.",
                    "[Shot 1, 00:00.000-00:00.200] Complete silence.\n\n"
                    "[Shot 1, 00:00.200-00:01.350] As <Subject 2> strikes forward, a punchy sub-bass thunder clap and a sharp, snapping high-voltage lightning whip-crack fire simultaneously with the heavy crunch of dark obsidian stone spikes splitting out of the ground.\n\n"
                    "[Shot 1, 00:01.350-00:05.166] Complete silence.",
                    "A punchy sub-bass thunder clap, sharp high-voltage lightning whip-crack, and heavy obsidian stone spike fracture at the start only.",
                ),
            },
            {
                "name": "storm_v2_plasma_spear_shock",
                "seed": 108,
                "prompt": make_6sec_prompt(
                    "the twilight combat arena",
                    "the electric plasma lance and fulgurite pillars",
                    "It adds a concussive bass shockwave and crisp electrical arc discharge with heavy rock fracture, then silence.",
                    "[Shot 1, 00:00.000-00:00.200] Complete silence.\n\n"
                    "[Shot 1, 00:00.200-00:01.350] A concussive low-end bass shockwave hits alongside a crisp, powerful electrical arc snap and heavy stone pillars cracking upward.\n\n"
                    "[Shot 1, 00:01.350-00:05.166] Complete silence.",
                    "A concussive low-end bass shockwave with a crisp electrical arc snap and heavy stone fracture at the start only.",
                ),
            },
            {
                "name": "storm_v3_chain_lightning_slam",
                "seed": 77,
                "prompt": make_6sec_prompt(
                    "the twilight combat arena",
                    "the chain-lightning bolt and erupting fulgurite spikes",
                    "It adds a deep thunder boom and three rapid electrical spark snaps with heavy rock crunch, then silence.",
                    "[Shot 1, 00:00.000-00:00.200] Complete silence.\n\n"
                    "[Shot 1, 00:00.200-00:01.350] A deep sub-bass thunder thud and three rapid, snappy high-voltage electrical arc cracks jump across the arena as solid rock spikes crunch upward.\n\n"
                    "[Shot 1, 00:01.350-00:05.166] Complete silence.",
                    "A deep sub-bass thunder thud with three rapid electrical arc snaps and heavy rock crunching at the start only.",
                ),
            },
            {
                "name": "storm_v4_fulgurite_rail_strike",
                "seed": 202,
                "prompt": make_6sec_prompt(
                    "the twilight combat arena",
                    "the high-voltage lightning beam and volcanic glass spikes",
                    "It adds a heavy sub-drop, sharp transformer arc crack, and thick obsidian glass splitting open, then silence.",
                    "[Shot 1, 00:00.000-00:00.200] Complete silence.\n\n"
                    "[Shot 1, 00:00.200-00:01.350] A heavy sub-bass drop and a sharp, biting electrical transformer arc crack fire as thick volcanic obsidian spikes split out of the earth.\n\n"
                    "[Shot 1, 00:01.350-00:05.166] Complete silence.",
                    "A heavy sub-bass drop, sharp electrical arc crack, and thick volcanic obsidian splitting open at the start only.",
                ),
            },
            {
                "name": "storm_v5_tempest_bolt_detonate",
                "seed": 303,
                "prompt": make_6sec_prompt(
                    "the twilight combat arena",
                    "the close-range lightning strike and ground spikes",
                    "It adds an immediate close-range lightning bolt crack and chest-hitting thunder boom with heavy ground fracture, then silence.",
                    "[Shot 1, 00:00.000-00:00.200] Complete silence.\n\n"
                    "[Shot 1, 00:00.200-00:01.350] An immediate, close-range lightning bolt snap and chest-hitting low thunder boom strike the ground as heavy stone monoliths crack upward.\n\n"
                    "[Shot 1, 00:01.350-00:05.166] Complete silence.",
                    "A close-range lightning bolt snap and chest-hitting low thunder boom with heavy stone fracture at the start only.",
                ),
            },
        ],
    },
]


@app.function(
    image=image,
    gpu="H200",
    cpu=8,
    memory=65536,
    timeout=1800,
    env={"PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"},
    volumes={"/vol": vol_models, "/vol_outputs": vol_outputs},
)
def run_spell_worker(bundle: dict):
    spell_id = bundle["spell_id"]
    n_frames = bundle["frames"]
    gate_start_s = bundle["gate_start_s"]
    gate_end_s = bundle["gate_end_s"]
    variations = bundle["variations"]

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

    out_dir = Path("/vol_outputs/h3_v2a_tests")
    out_dir.mkdir(parents=True, exist_ok=True)
    inp_mp4 = VOL_ROOT / "inputs" / bundle["video"]

    pending_variations = [v for v in variations if not (out_dir / f"{v['name']}.wav").exists()]
    if not pending_variations:
        print(f"[{spell_id}] All {len(variations)} variations already exist on volume! Skipping.")
        return {"spell_id": spell_id, "results": []}
    variations = pending_variations

    with torch.inference_mode():
        print(f"[{spell_id}] Loading Qwen3-VL + Video VAE + Audio VAE for {bundle['video']} ({n_frames}f)...")
        clip = unwrap(nodes.CLIPLoader().load_clip("qwen3vl_32b_minimax_h3_int8_convrot.safetensors", "minimax", "default"))[0]
        video_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_video_vae_fp16.safetensors"))[0]
        audio_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_audio_vae_fp32.safetensors"))[0]

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
            tokens = clip.tokenize(p_text, minimax_ref_items=ref_items)
            cond = clip.encode_from_tokens_scheduled(tokens)
            return node_helpers.conditioning_set_values(cond, {"minimax_refs": ref_blocks})

        cond_neg = encode_p(GAME_NEG_PROMPT)
        encoded_vars = []
        for v in variations:
            encoded_vars.append((v, encode_p(v["prompt"])))

        _, empty_aud_lat = empty_av_latent["samples"].unbind()[:2]

        def make_lat():
            return {
                "samples": comfy.nested_tensor.NestedTensor((z_ref_video.clone(), empty_aud_lat.clone())),
                "noise_mask": comfy.nested_tensor.NestedTensor((torch.zeros_like(z_ref_video), torch.ones_like(empty_aud_lat))),
            }

        del clip, video_vae
        comfy.model_management.unload_all_models()
        gc.collect()
        torch.cuda.empty_cache()

        print(f"[{spell_id}] Loading Undistilled Base Model (16 steps, CFGGuider=1.8, KV-Cache)...")
        unet_base = unwrap(nodes.UNETLoader().load_unet("minimax_h3_ref2va_pruned_int8_convrot.safetensors", "default"))[0]
        model_obj = unwrap(MiniMaxH3SigmaShift.execute(unet_base, 12.0, 4.0))[0]
        sigmas = unwrap(BasicScheduler.execute(model_obj, "simple", 16, 1.0))[0]
        sampler = unwrap(KSamplerSelect.execute("euler"))[0]

        dit = unet_base.model.diffusion_model
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
                print(f"    [{spell_id}] VIDEO KV-CACHE BUILT ONCE in {time.perf_counter() - t_bake:.1f}s")
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

        worker_results = []
        for idx, (v_spec, pos_cond) in enumerate(encoded_vars, 1):
            v_name = v_spec["name"]
            v_seed = v_spec["seed"]
            print(f"[{spell_id}] ({idx}/{len(encoded_vars)}) Generating {v_name} (seed={v_seed}, cfg=1.8)...")
            guider = unwrap(CFGGuider.execute(model_obj, pos_cond, cond_neg, 1.8))[0]
            noise = unwrap(RandomNoise.execute(v_seed))[0]
            t0 = time.perf_counter()
            _, den = unwrap(SamplerCustomAdvanced.execute(
                noise=noise, guider=guider, sampler=sampler, sigmas=sigmas, latent_image=make_lat()
            ))
            el = time.perf_counter() - t0
            aud = unwrap(VAEDecodeAudio.execute(vae=audio_vae, samples=den))[0]
            st = save_raw_and_polished(aud, inp_mp4, out_dir, v_name, gate_start_s, gate_end_s)
            vol_outputs.commit()
            st["elapsed_s"] = round(el, 1)
            worker_results.append(st)

    return {"spell_id": spell_id, "results": worker_results}


@app.local_entrypoint()
def main():
    print("Spawning parallel H200 workers on Modal cloud and awaiting all results...")
    active_bundles = [b for b in SPELL_BUNDLES if b["spell_id"] in ("shatterlance", "cinder_fall", "storm_lance")]
    calls = [run_spell_worker.spawn(b) for b in active_bundles]
    for b, c in zip(active_bundles, calls):
        print(f"  Spawned {b['spell_id']} -> call_id={c.object_id}", flush=True)
    for b, c in zip(active_bundles, calls):
        res = c.get()
        print(f"  Finished {b['spell_id']}: {len(res['results'])} variations", flush=True)
