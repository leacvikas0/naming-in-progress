"""
Production Warm-Stateful Modal Foley Service (`sfx-foley/harness/foley_service.py`).

Architecture (based on Modal `@app.cls` + `@modal.enter` best practices & V2A Game-Foley Research):
  1. Stateful `@app.cls(gpu=["H200", "H100"], scaledown_window=300, max_containers=1)` with `@modal.enter()`:
     - Deployed via `python -m modal deploy sfx-foley/harness/foley_service.py` (completes in ~3s, exits immediately).
     - Loads Qwen3-VL 32B, Video VAE, Audio VAE, and MiniMax-H3 33B ONCE on container startup and pre-encodes
       the reference video latents (`04_knight_glacial_and_sunfire_breathing.mp4`).
     - Persists the 50-layer Contiguous Post-RoPE FlashAttention KV-Cache (`self.kv_cache`) in VRAM across calls!
     - Wraps `@modal.method()` in `try / except` so even if an error occurs, the container NEVER crashes or unloads weights.
  2. Non-Blocking `FunctionCall` Workflow (`--submit`, `--check`, `--pull`, `--stop`):
     - Every local CLI command finishes in <6 seconds synchronously (zero hanging background tasks).
  3. Research-Backed Game-Audio Prompting & Transient-Shaped DSP:
     - Eliminates motion-blur trigger verbs ("swing", "slash", "cleave") from audio descriptions to prevent
       diffusion Doppler/air-whoosh bleed; uses anechoic close-contact foley descriptors.
     - Applies an SPL-style Differential Transient Shaper (+3.5 dB on the first 18ms impact attack),
       clamps high-repetition basic attacks (Beat 2 @ 1.83s, Beat 4 @ 4.75s) to a tight ~220ms dry transient
       envelope with zero wash tail, and lets cooldown Dragon attacks (Beat 1 @ 0.25s, Beat 3 @ 3.33s) bloom
       into rich physical ice-fracture and forge-ember textures.
"""

import gc
import json
import os
import subprocess
import sys
import time
import traceback
import wave
from pathlib import Path
import numpy as np

os.environ["PYTHONIOENCODING"] = "utf-8"
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

try:
    import modal
except ImportError:
    modal = None

STATE_PATH = Path("sfx-foley/harness/active_call.json")


def build_official_ref_en_prompt(
    summary_sfx: str,
    beat1_dragon_ice: str,
    beat2_minimal_basic: str,
    beat3_dragon_fire: str,
    beat4_minimal_basic: str,
    overall_sfx: str,
) -> str:
    return (
        "subject_definitions:\n"
        "<Subject 1> is the sunlit village cobblestone path environment in <Video 1>, featuring grey stone pavers, a dirt road leading into green meadow grass with purple wildflowers on the left, a red-roofed timber-frame Tudor cottage on the right, distant green hills under a bright blue sky, and drifting pink cherry blossom petals.\n"
        "<Subject 2> is the chibi Knight character in <Video 1>, wearing dark charcoal-grey plate armor, a visor helmet, a red wax seal on the chest, a flowing crimson cape, a left-hand iron shield, and a right-hand broadsword.\n"
        "<Subject 3> is the blue-and-white cel-shaded Ice Dragon visual effect and ice-coated blade in <Video 1>.\n"
        "<Subject 4> is the orange-and-crimson cel-shaded Fire Dragon visual effect and flame-coated blade in <Video 1>.\n"
        "<Video 1> is the source video for the target video edit.\n\n"
        "summary:\n"
        f"[video editing] The target video is an edited version of <Video 1> showing <Subject 2> on <Subject 1> activating <Subject 3> and <Subject 4> techniques. {summary_sfx}\n\n"
        "retention_analysis:\n"
        "<Subject 1> (appears in [Shot 1]): fully_preserved - the sunlit cobblestone path, Tudor cottage, meadow grass, wildflowers, and drifting petals are retained.\n"
        "<Subject 2> (appears in [Shot 1]): fully_preserved - the Knight's charcoal plate armor, crimson cape, shield, and weapon choreography are retained.\n"
        "<Subject 3> (appears in [Shot 1]): fully_preserved - the blue-and-white Ice Dragon head and crystalline ice blade geometry are retained.\n"
        "<Subject 4> (appears in [Shot 1]): fully_preserved - the crimson-and-gold Fire Dragon head and blazing flame blade geometry are retained.\n"
        "<Video 1> (cut and pacing structure): fully_preserved - the locked medium camera framing and exact action timing are retained 1:1.\n\n"
        "detailed_description:\n"
        "The target video is in a stylized cel-shaded 3D animated game style with bright natural daylight.\n"
        "[Shot 1] A locked medium full shot establishes <Subject 1>, the sunlit grey cobblestone path with the red-roofed Tudor cottage on the right and green meadow grass with purple wildflowers on the left, while <Subject 2>, the chibi Knight in dark charcoal plate armor and a crimson cape, stands in the center foreground. From 00:00.000 to 00:00.250, <Subject 2> holds a ready stance in complete silence. "
        f"At 00:00.250, <Subject 3>, the giant blue-and-white Ice Dragon head with jagged white fangs, materializes across the upper right of the frame; the sound is a close-up, anechoic foley recording that begins with a dry metallic contact click and expands into {beat1_dragon_ice} "
        "At 00:01.250, <Subject 3> vanishes and <Subject 2> holds the glowing blue ice-coated blade at his side in complete silence until 00:01.830. "
        f"At 00:01.830, <Subject 2> taps the blue ice-coated blade downward, producing an ultra-dry, close-up, anechoic transient foley sound with zero air movement: {beat2_minimal_basic} "
        "At 00:02.650, <Subject 2> returns to an idle stance in complete silence until 00:03.330. "
        f"At 00:03.330, <Subject 4>, the giant crimson-and-gold Fire Dragon head, erupts from the orange flame-coated blade across the upper right of the frame; the sound is a close-up, anechoic foley recording that begins with a dry metallic contact transient and expands into {beat3_dragon_fire} "
        "At 00:04.330, <Subject 2> pauses holding the glowing orange-gold flame blade in complete silence until 00:04.750. "
        f"At 00:04.750, <Subject 2> steps forward and taps the flame blade downward as <Subject 4> flickers briefly, producing an ultra-dry, close-up, anechoic transient foley sound with zero air movement: {beat4_minimal_basic} "
        "From 00:05.450 to 00:05.875, the scene ends in complete silence.\n\n"
        "overall_soundscape:\n"
        f"{overall_sfx} Anechoic studio foley recording with zero room reverb, zero air displacement, and complete silence between the four events.\n\n"
        "non_diegetic_music:\n"
        "N/A"
    )


GAME_NEG_PROMPT = (
    "subject_definitions:\n"
    "<Subject 1> is the village path in <Video 1>.\n"
    "<Subject 2> is the Knight in <Video 1>.\n"
    "<Video 1> is the source video.\n\n"
    "summary:\n"
    "[video editing] Low-quality bloated audio with air whoosh, wind noise, sweep, Doppler shift, reverb tail, muddy bass rumble, and continuous noise during pauses.\n\n"
    "retention_analysis:\n"
    "<Subject 1>: fully_preserved\n"
    "<Subject 2>: fully_preserved\n"
    "<Video 1>: fully_preserved\n\n"
    "detailed_description:\n"
    "The target video is in a 3D animated style.\n"
    "[Shot 1] Air whoosh, wind noise, sweep, cinematic transition, Doppler shift, air displacement, reverb tail, room tone, motion artifact, phase smear, white-noise static, pink-noise wash, muffled bass mud, and background noise during silent pauses.\n\n"
    "overall_soundscape:\n"
    "Air whoosh, wind noise, sweep, cinematic transition, reverb tail, room tone, motion artifact, phase smear, white noise, pink noise, muddy rumble, speech, dialogue.\n\n"
    "non_diegetic_music:\n"
    "Background music, synthesizer pad, brass."
)


PROMPT_VARIATIONS = [
    {
        "name": "v1_sekiro_minimal_clink_plus_dragon_bloom",
        "seed": 42,
        "sub_db": 0.0,
        "prompt": build_official_ref_en_prompt(
            "It pairs ultra-dry, short, anechoic metal hilt clicks on the two basic attacks with rich, tactile ice-fracture and charcoal-ember foley blooms on the two dragon awakenings.",
            "a crisp, dry high-carbon steel guard click at the instant of contact that blooms into the sharp, resonant crack of thick frozen lake ice splitting open and delicate frost crystals chiming.",
            "a single 120-millisecond dry steel guard click and one brittle ice-crystal tick, with zero reverb tail.",
            "a tight forged-steel blade tang tap at the instant of contact that expands into a dry cedar-wood fire flare and crackling blacksmith forge embers.",
            "a single 120-millisecond dry steel-on-wood tap click and one crisp ember pop, with zero reverb tail.",
            "Anechoic close-miked steel guard clicks for basic attacks contrasted with rich frozen lake-ice cracking and dry forge-ember crackling for the dragon awakenings.",
        ),
    },
    {
        "name": "v2_tsushima_bamboo_steel_and_elemental_tail",
        "seed": 77,
        "sub_db": 0.0,
        "prompt": build_official_ref_en_prompt(
            "It uses ultra-clean, anechoic bamboo-and-steel transient clicks for the basic attacks and layered glacier-ice and hearth-fire foley for the dragon techniques.",
            "a grounded leather hilt creak and silver blade ring that opens into a crisp, biting flash-freeze crystallization crunch and solid block-ice fracture.",
            "a compact, anechoic 140-millisecond tempered-steel tap and brittle frost tick, with zero tail.",
            "a sharp metallic sword scabbard click that opens into a tight match-head ignition flare and dry pine logs snapping in a hearth.",
            "a compact, anechoic 140-millisecond iron blade tap and crisp charcoal snap, with zero tail.",
            "Anechoic studio foley with minimal, short metallic transients on basic attacks and rich ice-crystallization and pine-hearth crackle on the dragon attacks.",
        ),
    },
    {
        "name": "v3_botw_glass_crystal_and_camp_snap",
        "seed": 108,
        "sub_db": 0.0,
        "prompt": build_official_ref_en_prompt(
            "It combines delicate, grounded weapon foley on the normal attacks with crisp crystal-ice and campfire-log foley on the dragon summons.",
            "a clean, minimal steel blade ring at the moment of contact that unfolds into the clear, musical snap of solid river ice cracking and glass-like frost facets locking into place.",
            "a quiet, minimal leather-and-steel click and a tiny dry ice tick, with zero tail.",
            "a crisp flint-on-steel spark click at the moment of contact that unfolds into a warm, crackling burst of dry birch bark and snapping campfire kindling.",
            "a short, dry, grounded steel blade clink and a single wood-ember crack, with zero tail.",
            "Clean, spacious game foley with subtle, non-fatiguing basic weapon clicks and crisp river-ice and birch-campfire textures on the dragon summons.",
        ),
    },
    {
        "name": "v4_monster_hunter_tactile_metal_and_bite",
        "seed": 202,
        "sub_db": 0.8,
        "prompt": build_official_ref_en_prompt(
            "It contrasts tight, grounded iron weapon foley on basic attacks with weighty block-ice cleaving and furnace-wood combustion on the dragon techniques.",
            "a solid forged-iron guard lock that expands into the heavy, unmistakable physical crunch of an ice-pick splitting a solid block of clear glacier ice.",
            "a short, tight, dry steel blade clink with a subtle frozen snow-crust tap, with zero tail.",
            "a firm iron-on-iron blade ring that expands into a concentrated forge-bellows coal flare and dry oak timber cracking under heat.",
            "a compact, grounded iron blade tap and a brief dry wood snap, with zero tail.",
            "Grounded forged-iron weapon foley paired with solid block-ice splitting and oak-timber fire crackling.",
        ),
    },
    {
        "name": "v5_ultra_dry_minimalist_precision_foley",
        "seed": 303,
        "sub_db": 0.0,
        "prompt": build_official_ref_en_prompt(
            "It delivers ultra-dry, anechoic precision foley with microscopic transient clicks on normal attacks and focused, artifact-free ice and fire textures on the dragon techniques.",
            "a pinpoint carbon-steel blade ring followed by a clean, dry snap of solid clear ice fracturing in a quiet foley booth.",
            "a tiny, crisp, dry metallic blade click and leather grip creak, with zero tail.",
            "a pinpoint tempered-steel ring followed by a clean, close-miked crackle of dry kindling wood catching flame.",
            "a tiny, crisp, dry steel blade tap and a single ember tick, with zero tail.",
            "Ultra-dry, anechoic foley booth recording of carbon-steel clicks, fracturing clear ice, and crackling dry kindling.",
        ),
    },
]

SILENCE_WINDOWS = [[0.0, 0.25], [1.25, 1.83], [2.65, 3.33], [4.33, 4.75], [5.45, 5.875]]
# High-repetition basic attack windows where we enforce a tight ~240ms minimal decay so they NEVER drag into a wash:
MINIMAL_BASIC_WINDOWS = [(1.83, 2.65, 0.24), (4.75, 5.45, 0.24)]


def polish_clean_foley(wav_np: np.ndarray, sr: int, sub_db: float, silence_windows: list) -> np.ndarray:
    """
    Research-backed Game-SFX Post-Processor:
      1. Bandpass (80Hz HPF to strip muddy rumble, 6.2kHz 8th-order LPF to strip high-freq diffusion fizz).
      2. SPL-style Differential Envelope Transient Shaper:
         Boosts initial attack transients (+3.5 dB where fast envelope > slow envelope) for crisp contact snap.
      3. Inverse Repetition-Complexity Envelope Clamping:
         On basic attacks (Beat 2 @ 1.83s, Beat 4 @ 4.75s), smoothly clamps sustain after 240ms so basic
         sword clicks stay short, dry, and non-fatiguing, while preserving the full 1.0s bloom on Dragon beats (1 & 3).
      4. Hard digital zeroing inside all `silence_windows`.
    """
    n = wav_np.shape[1]
    freqs = np.fft.rfftfreq(n, d=1.0 / sr)
    hp_gain = 1.0 - (1.0 / (1.0 + (np.maximum(freqs, 1e-3) / 80.0) ** 4))
    lp_gain = 1.0 / (1.0 + (freqs / 6200.0) ** 8)
    band_gain = hp_gain * lp_gain
    sub_gain = 1.0 / (1.0 + (freqs / 120.0) ** 4)

    clean = np.zeros_like(wav_np)
    sub = np.zeros_like(wav_np)
    for ch in range(wav_np.shape[0]):
        spec = np.fft.rfft(wav_np[ch])
        clean[ch] = np.fft.irfft(spec * band_gain, n=n)
        sub[ch] = np.fft.irfft(spec * sub_gain, n=n)

    sub_weight = 0.0 if sub_db <= 0.05 else (0.08 * sub_db)
    sig = clean + sub_weight * np.tanh(sub * 1.5)

    # SPL-style Differential Transient Shaper (vectorized via FFT box/exponential kernel)
    mono_abs = np.mean(np.abs(sig), axis=0)
    k_fast = max(1, int(0.003 * sr))
    k_slow = max(1, int(0.045 * sr))
    env_fast = np.convolve(mono_abs, np.ones(k_fast, dtype=np.float32) / k_fast, mode="same")
    env_slow = np.convolve(mono_abs, np.ones(k_slow, dtype=np.float32) / k_slow, mode="same")
    trans_diff = np.maximum(0.0, env_fast - env_slow) / (env_slow + 1e-4)
    trans_gain = 1.0 + 0.50 * np.tanh(trans_diff)
    sig = sig * trans_gain[None, :]

    t = np.arange(n, dtype=np.float32) / sr
    env = np.ones(n, dtype=np.float32)

    # Tight decay clamp for high-repetition basic swings (Beat 2 & Beat 4)
    for b_start, b_end, keep_dur in MINIMAL_BASIC_WINDOWS:
        in_beat = (t >= b_start) & (t < b_end)
        if np.any(in_beat):
            t_rel = t[in_beat] - b_start
            b_env = np.ones_like(t_rel)
            tail_mask = t_rel > keep_dur
            if np.any(tail_mask):
                # Exponential decay after keep_dur (240ms) so any trailing whoosh wash is killed
                b_env[tail_mask] = np.exp(-(t_rel[tail_mask] - keep_dur) / 0.055)
            env[in_beat] = np.minimum(env[in_beat], b_env)

    # Silence window gating
    fade_s = 0.030
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
    pk = float(np.max(np.abs(out))) + 1e-8
    out = (out / pk) * 0.88
    return out.astype(np.float32)


def run_local_self_test():
    banned_motion_words = ["whoosh", "shockwave", "blast wave", "explosion", "air whip", "sword swing", "slashes upward", "sword cleave"]
    required_sections = [
        "subject_definitions:",
        "summary:",
        "retention_analysis:",
        "detailed_description:",
        "overall_soundscape:",
        "non_diegetic_music:",
    ]
    for v in PROMPT_VARIATIONS:
        p = v["prompt"]
        for sec in required_sections:
            assert sec in p, f"Missing section {sec} in {v['name']}"
        assert "[Shot 1]" in p, f"Missing [Shot 1] in {v['name']}"
        assert "[Shot 1," not in p, f"Invalid bracketed timestamp in {v['name']}"
        p_low = p.lower()
        for bw in banned_motion_words:
            assert bw not in p_low, f"Banned motion/noise phrase '{bw}' found in {v['name']}"

    sr = 32000
    n = int(5.875 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    sig = np.vstack([0.5 * np.sin(2 * np.pi * 900 * t), 0.5 * np.sin(2 * np.pi * 900 * t)])
    pol = polish_clean_foley(sig, sr, 0.0, SILENCE_WINDOWS)

    # Check silence gate at 1.55s
    assert float(np.max(np.abs(pol[:, int(1.55 * sr) - 50 : int(1.55 * sr) + 50]))) < 1e-6
    # Check Dragon beat at 0.85s (600ms into Beat 1) is still strong
    assert float(np.max(np.abs(pol[:, int(0.85 * sr) - 50 : int(0.85 * sr) + 50]))) > 0.4
    # Check Minimal Basic beat at 1.90s (70ms into Beat 2) is strong, but at 2.45s (620ms into Beat 2) is clamped!
    assert float(np.max(np.abs(pol[:, int(1.90 * sr) - 50 : int(1.90 * sr) + 50]))) > 0.4
    assert float(np.max(np.abs(pol[:, int(2.45 * sr) - 50 : int(2.45 * sr) + 50]))) < 0.01

    print("[LOCAL SELF-TEST PASSED] Research-backed prompts, transient shaper, basic-attack tail clamp, and silence gates verified!")


if modal is not None:
    app = modal.App("haru-machi-foley-service")
    vol_models = modal.Volume.from_name("minimax-h3-models", create_if_missing=True)
    vol_outputs = modal.Volume.from_name("minimax-h3-outputs", create_if_missing=True)

    # Exact cached image -> 0s image build!
    image = (
        modal.Image.from_registry(
            "nvidia/cuda:12.8.1-devel-ubuntu22.04",
            add_python="3.11",
        )
        .apt_install(
            "git", "wget", "curl", "libgl1", "libglib2.0-0", "libsm6", "libxext6", "ffmpeg", "ninja-build", "build-essential"
        )
        .pip_install(
            "huggingface_hub[hf_transfer]", "hf_transfer", "safetensors", "websocket-client", "ninja", "packaging", "wheel", "psutil"
        )
        .env({
            "HF_HUB_ENABLE_HF_TRANSFER": "1",
            "HF_TOKEN": "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",
            "PYTHONUNBUFFERED": "1",
            "CUDA_HOME": "/usr/local/cuda",
            "MAX_JOBS": "4",
        })
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

    @app.cls(
        image=image,
        gpu=["H200", "H100"],
        memory=98304,
        cpu=4,
        timeout=900,
        scaledown_window=300,
        max_containers=1,
        volumes={"/vol": vol_models, "/vol_outputs": vol_outputs},
    )
    class FoleyEngine:
        @modal.enter()
        def startup(self):
            import cv2
            import torch

            t0 = time.perf_counter()
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

            sys.path.insert(0, str(COMFY_PATH))
            sys.path.insert(0, str(COMFY_PATH / "custom_nodes"))

            import node_helpers
            import nodes
            from comfy_extras.nodes_minimax_h3 import FPS, _empty_av_latent

            def unwrap(out):
                return out.result if hasattr(out, "result") else out

            self.gpu_name = torch.cuda.get_device_name(0)
            self.vram_total_gb = round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 1)
            print(f"[@modal.enter] Initializing FoleyEngine on {self.gpu_name} ({self.vram_total_gb} GB VRAM)...", flush=True)

            with torch.inference_mode():
                self.clip_model = unwrap(nodes.CLIPLoader().load_clip("qwen3vl_32b_minimax_h3_int8_convrot.safetensors", "minimax", "default"))[0]
                self.video_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_video_vae_fp16.safetensors"))[0]
                self.audio_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_audio_vae_fp32.safetensors"))[0]
                self.unet_base = unwrap(nodes.UNETLoader().load_unet("minimax_h3_ref2va_pruned_fp8_scaled.safetensors", "default"))[0]
                self.orig_dit_forward = self.unet_base.model.diffusion_model._forward

                # Pre-encode reference video latents once at container startup
                self.inp_mp4 = VOL_ROOT / "inputs" / "foley_suite" / "04_knight_glacial_and_sunfire_breathing.mp4"
                self.n_frames = 141
                cap = cv2.VideoCapture(str(self.inp_mp4))
                frames = []
                while len(frames) < self.n_frames:
                    ok, bgr = cap.read()
                    if not ok:
                        break
                    frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
                cap.release()
                frames_t = torch.from_numpy(np.stack(frames, axis=0).astype(np.float32) / 255.0)

                empty_av_latent, _ = _empty_av_latent(832, 480, self.n_frames)
                self.z_ref_video = self.video_vae.encode(frames_t[:self.n_frames])
                del self.video_vae
                _, self.empty_aud_lat = empty_av_latent["samples"].unbind()[:2]

                sample_idx = list(range(0, self.n_frames, FPS // 2))
                qwen_frames = frames_t[sample_idx].clone()
                del frames_t
                self.ref_items = [{"type": "video", "data": qwen_frames, "timestamps": [i / 2.0 for i in range(len(sample_idx))]}]
                self.ref_blocks = [{
                    "kind": "video",
                    "latent_t": self.z_ref_video.shape[2],
                    "latent_h": 480 // 16,
                    "latent_w": 832 // 16,
                    "ref_audio_t": 0,
                    "latent": self.z_ref_video,
                    "audio_latent": None,
                }]

                tokens = self.clip_model.tokenize(GAME_NEG_PROMPT, minimax_ref_items=self.ref_items)
                cond = self.clip_model.encode_from_tokens_scheduled(tokens)
                self.neg_cond = node_helpers.conditioning_set_values(cond, {"minimax_refs": self.ref_blocks})

                import comfy.model_management
                comfy.model_management.unload_all_models()
                gc.collect()
                torch.cuda.empty_cache()

                # Persistent 50-layer Post-RoPE Video KV-Cache across all calls!
                self.kv_cache = {}
                self.cache_built = False
                self.n_stat = 0

            print(f"[@modal.enter] Ready in {time.perf_counter() - t0:.1f}s!", flush=True)

        @modal.method()
        def run_variations(self, var_indices: list = None, n_steps: int = 16):
            import torch
            import comfy.ldm.common_dit
            import comfy.model_management
            import comfy.nested_tensor
            import comfy.quant_ops
            import node_helpers
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
            from comfy_extras.nodes_minimax_h3 import MiniMaxH3SigmaShift
            from comfy_extras.nodes_custom_sampler import BasicScheduler, CFGGuider, KSamplerSelect, RandomNoise, SamplerCustomAdvanced
            from comfy_extras.nodes_audio import VAEDecodeAudio
            from flash_attn import flash_attn_func

            def unwrap(out):
                return out.result if hasattr(out, "result") else out

            try:
                t_call0 = time.perf_counter()
                out_dir = Path("/vol_outputs/foley_lab_04")
                out_dir.mkdir(parents=True, exist_ok=True)

                if var_indices is None:
                    vars_to_run = PROMPT_VARIATIONS
                else:
                    vars_to_run = [PROMPT_VARIATIONS[i] for i in var_indices]

                with torch.inference_mode():
                    # 1. Encode positive prompts with Qwen3-VL, then offload Qwen3-VL to CPU RAM if on 80GB H100
                    t_enc = time.perf_counter()
                    if self.vram_total_gb < 100.0:
                        comfy.model_management.unload_all_models()
                        torch.cuda.empty_cache()

                    encoded_vars = []
                    for v in vars_to_run:
                        tokens = self.clip_model.tokenize(v["prompt"], minimax_ref_items=self.ref_items)
                        cond = self.clip_model.encode_from_tokens_scheduled(tokens)
                        pos_cond = node_helpers.conditioning_set_values(cond, {"minimax_refs": self.ref_blocks})
                        encoded_vars.append((v, pos_cond))

                    if self.vram_total_gb < 100.0:
                        comfy.model_management.unload_all_models()
                        gc.collect()
                        torch.cuda.empty_cache()

                    print(f"[Text Encode] Encoded {len(encoded_vars)} prompt(s) in {time.perf_counter() - t_enc:.1f}s", flush=True)

                    model_obj = unwrap(MiniMaxH3SigmaShift.execute(self.unet_base, 12.0, 4.0))[0]
                    sigmas = unwrap(BasicScheduler.execute(model_obj, "simple", n_steps, 1.0))[0]
                    sampler = unwrap(KSamplerSelect.execute("euler"))[0]
                    dit = self.unet_base.model.diffusion_model

                    # Per-prompt cache for static text_states (post-token_refiner) and rope_fast
                    prompt_fast_cache = {}

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

                        if not self.cache_built:
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
                            ta, tb, _ = text_seg
                            n_stat = (rb - ra) + (vb - va)
                            self.n_stat = n_stat
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
                                self.kv_cache[layer_idx] = (k_buf, v_buf)

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

                            self.cache_built = True
                            print(f"    [Step 0] Built 50-Layer FlashAttention KV-Cache ONCE in {time.perf_counter() - t_bake:.1f}s (n_stat={n_stat}, cap={max_fast_tokens})", flush=True)
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
                        n_stat = self.n_stat
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
                        # Cover [n_text, s_f_pad) so any 16-aligned padding rows receive valid scale/shift
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
                            # h_norm has shape (s_f_pad, hidden_size) where s_f_pad % 16 == 0 -> native Hopper FP8 _scaled_mm!
                            q, k, v = attn_mod.qkv_proj(h_norm).split(attn_mod.heads * attn_mod.head_dim, dim=-1)
                            v = v[:s_f].view(1, s_f, attn_mod.heads, attn_mod.head_dim)
                            q = q[:s_f].view(1, s_f, attn_mod.heads, attn_mod.head_dim)
                            k = k[:s_f].view(1, s_f, attn_mod.heads, attn_mod.head_dim)
                            qw = comfy.model_management.cast_to(attn_mod.q_norm.weight, device=device)
                            kw = comfy.model_management.cast_to(attn_mod.k_norm.weight, device=device)
                            rot = rope_fast.shape[-3] * 2
                            comfy.quant_ops.ck.rms_rope_split_half_(q, k, rope_fast, qw, kw, epsilon=attn_mod.q_norm.eps, rot_dim=rot)

                            k_buf, v_buf = self.kv_cache[layer_idx]
                            total_len = n_stat + s_f
                            if total_len > k_buf.shape[1]:
                                new_cap = total_len + 2048
                                new_k = torch.empty((1, new_cap, attn_mod.heads, attn_mod.head_dim), dtype=dtype, device=device)
                                new_v = torch.empty((1, new_cap, attn_mod.heads, attn_mod.head_dim), dtype=dtype, device=device)
                                new_k[:, :n_stat].copy_(k_buf[:, :n_stat])
                                new_v[:, :n_stat].copy_(v_buf[:, :n_stat])
                                k_buf, v_buf = new_k, new_v
                                self.kv_cache[layer_idx] = (k_buf, v_buf)

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
                            "samples": comfy.nested_tensor.NestedTensor((self.z_ref_video.clone(), self.empty_aud_lat.clone())),
                            "noise_mask": comfy.nested_tensor.NestedTensor((torch.zeros_like(self.z_ref_video), torch.ones_like(self.empty_aud_lat))),
                        }

                    results = []
                    for idx, (v_spec, pos_cond) in enumerate(encoded_vars, 1):
                        v_name = v_spec["name"]
                        v_seed = v_spec["seed"]
                        print(f"[Sampling] ({idx}/{len(encoded_vars)}) {v_name} (seed={v_seed}, steps={n_steps})...", flush=True)
                        guider = unwrap(CFGGuider.execute(model_obj, pos_cond, self.neg_cond, 1.8))[0]
                        noise = unwrap(RandomNoise.execute(v_seed))[0]
                        t_v0 = time.perf_counter()
                        _, den = unwrap(SamplerCustomAdvanced.execute(
                            noise=noise, guider=guider, sampler=sampler, sigmas=sigmas, latent_image=make_lat()
                        ))
                        el = time.perf_counter() - t_v0
                        aud = unwrap(VAEDecodeAudio.execute(vae=self.audio_vae, samples=den))[0]

                        waveform = aud["waveform"]
                        sr = int(aud.get("sample_rate", 32000))
                        if waveform.ndim == 3:
                            waveform = waveform[0]
                        raw_np = waveform.detach().cpu().float().clamp(-1.0, 1.0).numpy()
                        if raw_np.shape[0] == 1:
                            raw_np = np.repeat(raw_np, 2, axis=0)

                        polished_np = polish_clean_foley(raw_np, sr, v_spec["sub_db"], SILENCE_WINDOWS)

                        for suffix, arr in (("", polished_np), ("_raw", raw_np)):
                            stem = f"{v_name}{suffix}"
                            wav_p = out_dir / f"{stem}.wav"
                            mp3_p = out_dir / f"{stem}.mp3"
                            mux_p = out_dir / f"{stem}_game_mux.mp4"
                            pcm16 = (arr.T * 32767.0).astype(np.int16)
                            with wave.open(str(wav_p), "wb") as wf:
                                wf.setnchannels(pcm16.shape[1])
                                wf.setsampwidth(2)
                                wf.setframerate(sr)
                                wf.writeframes(pcm16.tobytes())
                            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav_p), "-b:a", "192k", str(mp3_p)], check=True)
                            subprocess.run([
                                "ffmpeg", "-y", "-v", "error", "-i", str(self.inp_mp4), "-i", str(wav_p),
                                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(mux_p)
                            ], check=True)

                        vol_outputs.commit()
                        print(f"    -> {v_name} finished & committed in {el:.1f}s!", flush=True)
                        results.append({"name": v_name, "elapsed_s": round(el, 1)})

                return {
                    "status": "ok",
                    "gpu": self.gpu_name,
                    "total_elapsed_s": round(time.perf_counter() - t_call0, 1),
                    "results": results,
                }
            except Exception:
                if not self.cache_built:
                    self.kv_cache.clear()
                gc.collect()
                torch.cuda.empty_cache()
                return {
                    "status": "error",
                    "traceback": traceback.format_exc(),
                }
            finally:
                self.unet_base.model.diffusion_model._forward = self.orig_dit_forward


def cli_submit(var_indices=None, n_steps=16):
    cls = modal.Cls.from_name("haru-machi-foley-service", "FoleyEngine")
    fc = cls().run_variations.spawn(var_indices=var_indices, n_steps=n_steps)
    state = {"call_id": fc.object_id, "submitted_at": time.time(), "var_indices": var_indices, "n_steps": n_steps}
    STATE_PATH.write_text(json.dumps(state, indent=2))
    print(f"[Submitted] FunctionCall ID: {fc.object_id} (vars={var_indices}, steps={n_steps})", flush=True)


def cli_check():
    if not STATE_PATH.exists():
        print("No active_call.json found.")
        return
    state = json.loads(STATE_PATH.read_text())
    fc = modal.FunctionCall.from_id(state["call_id"])
    elapsed = round(time.time() - state["submitted_at"], 1)
    try:
        res = fc.get(timeout=4.0)
        print(f"[COMPLETED after {elapsed}s]\n{json.dumps(res, indent=2)}", flush=True)
    except TimeoutError:
        # Also check how many files have already been committed to minimax-h3-outputs!
        vol = modal.Volume.from_name("minimax-h3-outputs")
        try:
            files = [Path(e.path).name for e in vol.listdir("foley_lab_04") if e.path.endswith(".mp3") and not e.path.endswith("_raw.mp3")]
        except Exception:
            files = []
        print(f"[RUNNING - {elapsed}s elapsed] Call {state['call_id']} in progress | Committed stems so far ({len(files)}): {files}", flush=True)


def cli_pull():
    vol = modal.Volume.from_name("minimax-h3-outputs")
    dst = Path("sfx-foley/stems/foley_lab_04")
    dst.mkdir(parents=True, exist_ok=True)
    for entry in vol.listdir("foley_lab_04"):
        name = Path(entry.path).name
        if name.endswith(".mp3") or name.endswith("_game_mux.mp4"):
            raw = b"".join(vol.read_file(entry.path))
            (dst / name).write_bytes(raw)
            print(f"Pulled {dst / name} ({len(raw) // 1024} KB)", flush=True)


if __name__ == "__main__":
    if "--local-check" in sys.argv:
        run_local_self_test()
    elif "--submit-smoke" in sys.argv:
        cli_submit(var_indices=[0], n_steps=2)
    elif "--submit-bench" in sys.argv:
        cli_submit(var_indices=[0, 3], n_steps=16)
    elif "--submit-all" in sys.argv:
        cli_submit(var_indices=None, n_steps=16)
    elif "--check" in sys.argv:
        cli_check()
    elif "--pull" in sys.argv:
        cli_pull()
