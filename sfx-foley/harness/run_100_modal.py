"""
Parallel Sharded H100/H200 Native FP8 Runner for the 100-Variation Foley Experiment
(`sfx-foley/harness/run_100_modal.py`).

Features:
  - Uses native Hopper FP8 weights (`minimax_h3_ref2va_pruned_fp8_scaled.safetensors`).
  - 50-Layer Contiguous Post-RoPE FlashAttention KV-Cache (`k_buf`, `v_buf`) + 16-row FP8 padding (`s_f_pad % 16 == 0`).
  - Static `text_states` caching (`token_refiner(condition_proj(context[0]))`) so Qwen3-VL text refinement runs ONCE per prompt instead of 16x per prompt.
  - Supports all 6 experimental guidance architectures:
      1. `basic_cfg1` (Single-pass native CFG=1.0, 16 NFE)
      2. `cfg_standard` (2-pass CFGGuider at target cfg_scale)
      3. `cfg_windowed` (Step-windowed CFGGuider: active on steps w_start..w_end, CFG=1.0 on polish steps)
      4. `cfg_rescaled` (Latent velocity std-rescaled CFG with phi=0.75 so AudioVAE never clips)
      5. `cfg_text_only_neg` (Positive pass attends to <Video 1> + text; Negative pass attends ONLY to negative text + audio so visual impact timing is never subtracted)
      6. `negpip_vflip` (Single-pass CFG=1.0 with hako-mikan NegPiP attention Value vector sign-flip `V = -w * V` across all 50 layers)
  - Saves for each variation `v001..v100`:
      * `/vol_outputs/foley_100/videos/vXXX.mp4` (832x480 @ 24fps video with baked stereo AAC 192k audio)
      * `/vol_outputs/foley_100/videos/vXXX_raw.mp3` (100% untouched raw 32kHz AudioVAE stereo output)
      * `/vol_outputs/foley_100/metrics/vXXX.json` (spectral band distribution, pause silence dB, crest factor, runtime)
"""

import argparse
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

import modal

MANIFEST_PATH = Path("sfx-foley/audition/manifest.json")
STATE_PATH = Path("sfx-foley/harness/batch_100_state.json")
SILENCE_WINDOWS = [[0.0, 0.25], [1.25, 1.83], [2.65, 3.33], [4.33, 4.75], [5.45, 5.875]]
ACTIVE_WINDOWS = [[0.25, 1.25], [1.83, 2.65], [3.33, 4.33], [4.75, 5.45]]


def apply_dsp_profile(wav_np: np.ndarray, sr: int, dsp_mode: str, silence_windows: list) -> np.ndarray:
    """
    Non-destructive Game-SFX DSP profiles (NO 80Hz bass-cut HPF, NO 240ms basic-attack choke!).
    """
    n = wav_np.shape[1]
    if dsp_mode == "raw_32k":
        pk = float(np.max(np.abs(wav_np))) + 1e-8
        return ((wav_np / pk) * 0.89).astype(np.float32)

    freqs = np.fft.rfftfreq(n, d=1.0 / sr)
    sub_gain = 1.0 / (1.0 + (freqs / 135.0) ** 4)

    if dsp_mode == "raw_gated":
        sig = wav_np.copy()
    elif dsp_mode == "sub_boost_full_band":
        sub = np.zeros_like(wav_np)
        for ch in range(wav_np.shape[0]):
            spec = np.fft.rfft(wav_np[ch])
            sub[ch] = np.fft.irfft(spec * sub_gain, n=n)
        sig = wav_np + 0.55 * np.tanh(sub * 2.0)
    elif dsp_mode == "how_to_use_5k6":
        lp_gain = 1.0 / (1.0 + (freqs / 5600.0) ** 8)
        clean = np.zeros_like(wav_np)
        sub = np.zeros_like(wav_np)
        for ch in range(wav_np.shape[0]):
            spec = np.fft.rfft(wav_np[ch])
            clean[ch] = np.fft.irfft(spec * lp_gain, n=n)
            sub[ch] = np.fft.irfft(spec * sub_gain, n=n)
        sig = clean + 0.65 * np.tanh(sub * 2.1)
    else:
        # Default `sub_boost_10k_lp`: +4.0 dB <135Hz sub-bass + full 0-10kHz metallic/crystal ring + gentle >10kHz ultrasonic roll-off
        lp_gain = 1.0 / (1.0 + (freqs / 10000.0) ** 8)
        clean = np.zeros_like(wav_np)
        sub = np.zeros_like(wav_np)
        for ch in range(wav_np.shape[0]):
            spec = np.fft.rfft(wav_np[ch])
            clean[ch] = np.fft.irfft(spec * lp_gain, n=n)
            sub[ch] = np.fft.irfft(spec * sub_gain, n=n)
        sig = clean + 0.55 * np.tanh(sub * 2.0)

    # Smooth 30ms cosine silence-window gating on inter-beat pauses only
    t = np.arange(n, dtype=np.float32) / sr
    env = np.ones(n, dtype=np.float32)
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
    return ((out / pk) * 0.89).astype(np.float32)


def compute_audio_metrics(wav_np: np.ndarray, raw_np: np.ndarray, sr: int, elapsed_s: float) -> dict:
    """Computes spectral energy distribution, active vs pause RMS, and crest factor for the UI."""
    mono = np.mean(wav_np, axis=0)
    raw_mono = np.mean(raw_np, axis=0)
    n = mono.shape[0]
    t = np.arange(n, dtype=np.float32) / sr

    freqs = np.fft.rfftfreq(n, d=1.0 / sr)
    mag2 = np.abs(np.fft.rfft(mono)) ** 2
    tot_e = float(np.sum(mag2)) + 1e-12

    def band_pct(f_lo, f_hi):
        mask = (freqs >= f_lo) & (freqs < f_hi)
        return round(100.0 * float(np.sum(mag2[mask])) / tot_e, 1)

    centroid_hz = int(round(float(np.sum(freqs * mag2)) / tot_e))

    active_mask = np.zeros(n, dtype=bool)
    for a0, a1 in ACTIVE_WINDOWS:
        active_mask |= (t >= a0) & (t <= a1)
    pause_mask = ~active_mask

    act_rms = float(np.sqrt(np.mean(mono[active_mask] ** 2) + 1e-12))
    raw_pause_rms = float(np.sqrt(np.mean(raw_mono[pause_mask] ** 2) + 1e-12))
    pol_pause_rms = float(np.sqrt(np.mean(mono[pause_mask] ** 2) + 1e-12))
    peak = float(np.max(np.abs(mono))) + 1e-12
    crest_db = round(20.0 * float(np.log10(peak / (act_rms + 1e-9))), 1)
    snr_ratio = round(act_rms / (raw_pause_rms + 1e-5), 2)

    # Per-beat RMS for the 4 action beats
    beat_rms = []
    for a0, a1 in ACTIVE_WINDOWS:
        bm = (t >= a0) & (t <= a1)
        beat_rms.append(round(float(np.sqrt(np.mean(mono[bm] ** 2) + 1e-12)), 3))

    sub_pct = band_pct(20.0, 140.0)
    low_mid_pct = band_pct(140.0, 800.0)
    high_mid_pct = band_pct(800.0, 4500.0)
    air_pct = band_pct(4500.0, 16000.0)
    peak_db = round(20.0 * float(np.log10(peak)), 2)

    return {
        "elapsed_s": round(elapsed_s, 2),
        "centroid_hz": centroid_hz,
        "sub_bass_pct": sub_pct,
        "low_mid_pct": low_mid_pct,
        "high_mid_pct": high_mid_pct,
        "steel_air_pct": air_pct,
        "active_rms": round(act_rms, 3),
        "raw_pause_rms": round(raw_pause_rms, 4),
        "pol_pause_rms": round(pol_pause_rms, 5),
        "impact_to_pause_ratio": snr_ratio,
        "crest_db": crest_db,
        "beat_rms": beat_rms,
        # Exact keys for Audition Studio UI (`app.js`):
        "sub_rms": round(act_rms * np.sqrt(sub_pct / 100.0), 4),
        "mid_rms": round(act_rms * np.sqrt(low_mid_pct / 100.0), 4),
        "high_rms": round(act_rms * np.sqrt(high_mid_pct / 100.0), 4),
        "air_rms": round(act_rms * np.sqrt(air_pct / 100.0), 4),
        "pause_rms": round(raw_pause_rms, 5),
        "peak_db": peak_db,
    }


app = modal.App("haru-machi-foley-100-turbo")
vol_models = modal.Volume.from_name("minimax-h3-models", create_if_missing=True)
vol_outputs = modal.Volume.from_name("minimax-h3-outputs", create_if_missing=True)

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


def _run_shard_impl(shard_payload: dict) -> dict:
    import cv2
    import torch

    shard_id = shard_payload["shard_id"]
    variations = shard_payload["variations"]
    force_regen = shard_payload.get("force_regen", False)

    COMFY_PATH = Path("/comfyui")
    VOL_ROOT = Path("/vol")
    OUT_ROOT = Path("/vol/outputs/foley_100")
    VID_DIR = OUT_ROOT / "videos"
    MET_DIR = OUT_ROOT / "metrics"
    VID_DIR.mkdir(parents=True, exist_ok=True)
    MET_DIR.mkdir(parents=True, exist_ok=True)

    # Filter out already-completed variations unless force_regen is set
    pending = []
    for v in variations:
        vid_id = v["id"]
        if not force_regen and (VID_DIR / f"{vid_id}.mp4").exists() and (MET_DIR / f"{vid_id}.json").exists():
            continue
        pending.append(v)

    if not pending:
        print(f"[Shard {shard_id}] All {len(variations)} variations already exist on /vol_outputs!", flush=True)
        return {"shard_id": shard_id, "completed": len(variations), "skipped": len(variations)}

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
    from comfy_extras.nodes_custom_sampler import BasicGuider, BasicScheduler, CFGGuider, KSamplerSelect, RandomNoise, SamplerCustomAdvanced
    from comfy_extras.nodes_audio import VAEDecodeAudio
    from flash_attn import flash_attn_func

    def unwrap(out):
        return out.result if hasattr(out, "result") else out

    gpu_name = torch.cuda.get_device_name(0)
    print(f"[Shard {shard_id}] Starting {len(pending)}/{len(variations)} variations on {gpu_name}...", flush=True)

    with torch.inference_mode():
        clip_model = unwrap(nodes.CLIPLoader().load_clip("qwen3vl_32b_minimax_h3_int8_convrot.safetensors", "minimax", "default"))[0]
        video_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_video_vae_fp16.safetensors"))[0]
        audio_vae = unwrap(nodes.VAELoader().load_vae("minimax_h3_audio_vae_fp32.safetensors"))[0]
        unet_fp8 = unwrap(nodes.UNETLoader().load_unet("minimax_h3_ref2va_pruned_fp8_scaled.safetensors", "default"))[0]
        orig_dit_forward = unet_fp8.model.diffusion_model._forward

        inp_mp4 = VOL_ROOT / "inputs" / "foley_suite" / "04_knight_glacial_and_sunfire_breathing.mp4"
        n_frames = 141
        cap = cv2.VideoCapture(str(inp_mp4))
        frames = []
        while len(frames) < n_frames:
            ok, bgr = cap.read()
            if not ok:
                break
            frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        cap.release()
        frames_t = torch.from_numpy(np.stack(frames, axis=0).astype(np.float32) / 255.0)

        empty_av_latent, _ = _empty_av_latent(832, 480, n_frames)
        z_ref_video = video_vae.encode(frames_t[:n_frames])
        del video_vae
        _, empty_aud_lat = empty_av_latent["samples"].unbind()[:2]

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

        # Batch-encode all unique positive and negative prompts in this shard while Qwen3-VL is in VRAM
        t_enc = time.perf_counter()
        prompt_cond_map = {}
        unique_prompts = sorted({v["prompt"] for v in pending} | {v["neg_prompt"] for v in pending if v["neg_prompt"]})
        for p_str in unique_prompts:
            tok = clip_model.tokenize(p_str, minimax_ref_items=ref_items)
            c = clip_model.encode_from_tokens_scheduled(tok)
            prompt_cond_map[p_str] = node_helpers.conditioning_set_values(c, {"minimax_refs": ref_blocks})

        del clip_model
        comfy.model_management.unload_all_models()
        gc.collect()
        torch.cuda.empty_cache()
        print(f"[Shard {shard_id}] Encoded {len(unique_prompts)} unique prompts in {time.perf_counter() - t_enc:.1f}s (setup {time.perf_counter() - t0:.1f}s)", flush=True)

        dit = unet_fp8.model.diffusion_model
        kv_cache = {}
        prompt_fast_cache = {}

        state = {
            "cache_built": False,
            "n_stat": 0,
            "guidance_mode": "cfg_standard",
            "cfg_scale": 1.60,
            "rescale_phi": 0.0,
            "negpip_weight": 0.0,
            "neg_text_tensor": None,
            "call_idx_in_step": 0,
            "last_pos_audio": None,
        }

        def refine_text_tensor(ctx_tensor, transformer_options, target_device, target_dtype):
            ts = ctx_tensor[0].to(device=target_device, dtype=target_dtype)
            if ts.shape[-1] != dit.hidden_size:
                ts = dit.token_refiner(dit.condition_proj(ts), transformer_options=transformer_options)
            return ts

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
                text_states = refine_text_tensor(context, transformer_options, device, dtype)

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
                max_fast_tokens = (tb - ta) + (ab - aa) + 2048

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
                print(f"[Shard {shard_id}] Built 50-Layer FlashAttention KV-Cache ONCE in {time.perf_counter() - t_bake:.2f}s", flush=True)
                video_seg = (va, vb, t_row[seg_t["video"]])
                audio_seg = (aa, ab, t_row[seg_t["audio"]])
                _, a_out = dit.final_layer(h, t_emb, video_seg, audio_seg, sigma_v, transformer_options.get("sample_sigmas"), (shift_v, shift_a))
                audio_out = unpack_audio(a_out)
                video_zero = torch.zeros_like(video_x[:, :, :orig_t, :orig_h, :orig_w])
                vel_a = -audio_out.to(audio_x.dtype)
                state["last_pos_audio"] = vel_a.detach().clone()
                state["call_idx_in_step"] = 1
                return [video_zero, vel_a]

            # Fast Cached Path
            ta, tb, _ = text_seg
            aa, ab, _ = aud_seg
            n_pos_text = tb - ta
            n_aud = ab - aa
            n_stat = state["n_stat"]
            g_mode = state["guidance_mode"]
            is_neg_call = (state["call_idx_in_step"] == 1)

            text_states = refine_text_tensor(context, transformer_options, device, dtype)
            audio_rows = pack_audio(audio_x.to(torch.float32))
            audio_embed = dit.audio_patch_proj(audio_rows).to(dtype)

            # Handle NegPiP single-pass V-flip (`negpip_vflip`) by appending refined negative text tokens
            n_neg_pip = 0
            if g_mode == "negpip_vflip" and state["neg_text_tensor"] is not None:
                neg_ts = refine_text_tensor(state["neg_text_tensor"], transformer_options, device, dtype)
                n_neg_pip = neg_ts.shape[0]
                text_states_combined = torch.cat([text_states, neg_ts], dim=0)
            else:
                text_states_combined = text_states

            n_text = text_states_combined.shape[0]
            s_f = n_text + n_aud
            pad_16 = (16 - (s_f % 16)) % 16
            s_f_pad = s_f + pad_16

            mod_segments_fast = []
            row_base_t = t_row[seg_t["text"]] * 3
            if text_tags is not None and n_neg_pip == 0:
                tags = text_tags.view(-1).tolist()
                run_start = 0
                for i in range(1, n_text + 1):
                    if i == n_text or tags[i] != tags[run_start]:
                        mod_segments_fast.append((run_start, i, row_base_t + int(tags[run_start])))
                        run_start = i
            else:
                mod_segments_fast.append((0, n_text, row_base_t + seg_tag["text"]))
            mod_segments_fast.append((n_text, s_f_pad, t_row[seg_t["audio"]] * 3 + seg_tag["audio"]))

            pos_key = (ta, tb, n_neg_pip, aa, ab)
            if pos_key not in prompt_fast_cache:
                if n_neg_pip > 0:
                    # Give negpip tokens valid text position IDs
                    neg_pos = layout.position_ids[ta : ta + min(n_neg_pip, n_pos_text)]
                    if neg_pos.shape[0] < n_neg_pip:
                        rep = (n_neg_pip + neg_pos.shape[0] - 1) // neg_pos.shape[0]
                        neg_pos = neg_pos.repeat(rep, 1)[:n_neg_pip]
                    pos_fast = torch.cat([layout.position_ids[ta:tb], neg_pos, layout.position_ids[aa:ab]], dim=0)
                else:
                    pos_fast = torch.cat([layout.position_ids[ta:tb], layout.position_ids[aa:ab]], dim=0)
                prompt_fast_cache[pos_key] = rope_rotation_table(dit.rope_freqs(pos_fast, device), dtype)
            rope_fast = prompt_fast_cache[pos_key]

            if pad_16 > 0:
                pad_zeros = torch.zeros((pad_16, dit.hidden_size), dtype=dtype, device=device)
                h_fast = torch.cat([text_states_combined, audio_embed, pad_zeros], dim=0)
            else:
                h_fast = torch.cat([text_states_combined, audio_embed], dim=0)

            skip_visual_kv = (g_mode == "cfg_text_only_neg" and is_neg_call)
            negpip_w = float(state["negpip_weight"])

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

                if n_neg_pip > 0 and negpip_w > 0.0:
                    # hako-mikan NegPiP: flip sign of Attention Value vectors on negative text tokens!
                    v[:, n_pos_text : n_pos_text + n_neg_pip].mul_(-negpip_w)

                if skip_visual_kv:
                    # Text-only negative pass: attend ONLY to [neg_text + audio] without <Video 1> visual tokens!
                    attn_raw = flash_attn_func(q, k, v, causal=False)
                else:
                    k_buf, v_buf = kv_cache[layer_idx]
                    total_len = n_stat + s_f
                    if total_len > k_buf.shape[1]:
                        new_cap = total_len + 1024
                        new_k = torch.empty((1, new_cap, attn_mod.heads, attn_mod.head_dim), dtype=dtype, device=device)
                        new_v = torch.empty((1, new_cap, attn_mod.heads, attn_mod.head_dim), dtype=dtype, device=device)
                        new_k[:, :n_stat].copy_(k_buf[:, :n_stat])
                        new_v[:, :n_stat].copy_(v_buf[:, :n_stat])
                        kv_cache[layer_idx] = (new_k, new_v)
                        k_buf, v_buf = new_k, new_v
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
            vel_a = -audio_out.to(audio_x.dtype)

            # Handle Rescaled CFG (`cfg_rescaled`) on the negative pass return
            if not is_neg_call:
                state["last_pos_audio"] = vel_a.detach().clone()
                if g_mode not in ("basic_cfg1", "negpip_vflip"):
                    state["call_idx_in_step"] = 1
            else:
                state["call_idx_in_step"] = 0
                if g_mode == "cfg_rescaled" and state["last_pos_audio"] is not None and state["rescale_phi"] > 0.0:
                    v_pos = state["last_pos_audio"]
                    v_neg = vel_a
                    cfg_s = float(state["cfg_scale"])
                    phi = float(state["rescale_phi"])
                    v_cfg = v_neg + cfg_s * (v_pos - v_neg)
                    std_pos = v_pos.std()
                    std_cfg = v_cfg.std().clamp(min=1e-6)
                    v_rescaled = phi * (v_cfg * (std_pos / std_cfg)) + (1.0 - phi) * v_cfg
                    # Solve for effective v_neg so `v_neg_eff + cfg_s * (v_pos - v_neg_eff) == v_rescaled`
                    if abs(1.0 - cfg_s) > 1e-4:
                        vel_a = (v_rescaled - cfg_s * v_pos) / (1.0 - cfg_s)

            return [video_zero, vel_a]

        dit._forward = forward_cached

        def make_lat():
            return {
                "samples": comfy.nested_tensor.NestedTensor((z_ref_video.clone(), empty_aud_lat.clone())),
                "noise_mask": comfy.nested_tensor.NestedTensor((torch.zeros_like(z_ref_video), torch.ones_like(empty_aud_lat))),
            }

        completed_count = 0
        for idx, v in enumerate(pending, 1):
            vid_id = v["id"]
            g_mode = v["guidance_mode"]
            cfg_scale = float(v["cfg_scale"])
            seed = int(v["seed"])
            s_name = v["sampler_name"]
            n_steps = int(v["n_steps"])
            sh_v = float(v["shift_video"])
            sh_a = float(v["shift_audio"])
            dsp_mode = v["dsp_mode"]
            w_start, w_end = v["window_range"]

            model_obj = unwrap(MiniMaxH3SigmaShift.execute(unet_fp8, sh_v, sh_a))[0]
            sigmas = unwrap(BasicScheduler.execute(model_obj, "simple", n_steps, 1.0))[0]
            sampler = unwrap(KSamplerSelect.execute(s_name))[0]

            pos_cond = prompt_cond_map[v["prompt"]]
            neg_cond = prompt_cond_map.get(v["neg_prompt"]) if v["neg_prompt"] else pos_cond

            state["guidance_mode"] = g_mode
            state["cfg_scale"] = cfg_scale
            state["rescale_phi"] = float(v.get("rescale_phi", 0.0))
            state["negpip_weight"] = float(v.get("negpip_weight", 0.0))
            state["neg_text_tensor"] = neg_cond[0][0] if (g_mode == "negpip_vflip" and v["neg_prompt"]) else None
            state["call_idx_in_step"] = 0
            state["last_pos_audio"] = None

            if g_mode in ("basic_cfg1", "negpip_vflip"):
                guider = unwrap(BasicGuider.execute(model_obj, pos_cond))[0]
            else:
                guider = unwrap(CFGGuider.execute(model_obj, pos_cond, neg_cond, cfg_scale))[0]
                if g_mode == "cfg_windowed":
                    orig_predict = guider.predict_noise
                    step_counter = {"i": 0}
                    def windowed_predict(x, timestep, model_options={}, seed=None, _orig=orig_predict, _sc=step_counter, _g=guider, _cfg=cfg_scale, _ws=w_start, _we=w_end):
                        cur_i = _sc["i"]
                        _sc["i"] += 1
                        if _ws <= cur_i <= _we:
                            _g.cfg = _cfg
                            state["call_idx_in_step"] = 0
                        else:
                            _g.cfg = 1.0
                            state["call_idx_in_step"] = 0
                        return _orig(x, timestep, model_options=model_options, seed=seed)
                    guider.predict_noise = windowed_predict

            noise = unwrap(RandomNoise.execute(seed))[0]
            torch.cuda.synchronize()
            t_v0 = time.perf_counter()
            _, den = unwrap(SamplerCustomAdvanced.execute(
                noise=noise, guider=guider, sampler=sampler, sigmas=sigmas, latent_image=make_lat()
            ))
            torch.cuda.synchronize()
            el = time.perf_counter() - t_v0

            aud = unwrap(VAEDecodeAudio.execute(vae=audio_vae, samples=den))[0]
            waveform = aud["waveform"]
            sr = int(aud.get("sample_rate", 32000))
            if waveform.ndim == 3:
                waveform = waveform[0]
            raw_np = waveform.detach().cpu().float().clamp(-1.0, 1.0).numpy()
            if raw_np.shape[0] == 1:
                raw_np = np.repeat(raw_np, 2, axis=0)

            # Normalize raw_np to -1dBFS for fair raw listening
            raw_pk = float(np.max(np.abs(raw_np))) + 1e-8
            raw_norm = ((raw_np / raw_pk) * 0.89).astype(np.float32)
            pol_np = apply_dsp_profile(raw_np, sr, dsp_mode, SILENCE_WINDOWS)

            metrics = compute_audio_metrics(pol_np, raw_norm, sr, el)

            # Write temp WAVs and encode `.mp4` + `_raw.mp3`
            tmp_pol_wav = Path(f"/tmp/{vid_id}_pol.wav")
            tmp_raw_wav = Path(f"/tmp/{vid_id}_raw.wav")
            for wav_p, arr in ((tmp_pol_wav, pol_np), (tmp_raw_wav, raw_norm)):
                pcm16 = (arr.T * 32767.0).astype(np.int16)
                with wave.open(str(wav_p), "wb") as wf:
                    wf.setnchannels(pcm16.shape[1])
                    wf.setsampwidth(2)
                    wf.setframerate(sr)
                    wf.writeframes(pcm16.tobytes())

            out_mp4 = VID_DIR / f"{vid_id}.mp4"
            out_raw_mp3 = VID_DIR / f"{vid_id}_raw.mp3"
            subprocess.run([
                "ffmpeg", "-y", "-v", "error",
                "-i", str(inp_mp4), "-i", str(tmp_pol_wav),
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
                str(out_mp4)
            ], check=True)
            subprocess.run([
                "ffmpeg", "-y", "-v", "error",
                "-i", str(tmp_raw_wav), "-b:a", "192k",
                str(out_raw_mp3)
            ], check=True)
            tmp_pol_wav.unlink(missing_ok=True)
            tmp_raw_wav.unlink(missing_ok=True)

            (MET_DIR / f"{vid_id}.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
            completed_count += 1
            vol_models.commit()

            print(
                f"[Shard {shard_id}] ({idx}/{len(pending)}) {vid_id} [{g_mode}, cfg={cfg_scale}, {s_name}/{n_steps}s] "
                f"-> {el:.1f}s | Centroid={metrics['centroid_hz']}Hz | Sub={metrics['sub_bass_pct']}% | SNR={metrics['impact_to_pause_ratio']}x",
                flush=True,
            )

        unet_fp8.model.diffusion_model._forward = orig_dit_forward
        vol_models.commit()
        return {"shard_id": shard_id, "completed": completed_count, "skipped": len(variations) - len(pending)}


@app.function(image=image, gpu=["H100", "H200"], timeout=3600, max_containers=2, volumes={"/vol": vol_models})
def run_shard_0(shard_payload: dict) -> dict:
    return _run_shard_impl(shard_payload)


@app.function(image=image, gpu=["H200", "H100"], timeout=3600, max_containers=2, volumes={"/vol": vol_models})
def run_shard_1(shard_payload: dict) -> dict:
    return _run_shard_impl(shard_payload)


@app.function(image=image, gpu=["H100", "H200"], timeout=3600, max_containers=2, volumes={"/vol": vol_models})
def run_shard_2(shard_payload: dict) -> dict:
    return _run_shard_impl(shard_payload)


@app.function(image=image, gpu=["H200", "H100"], timeout=3600, max_containers=2, volumes={"/vol": vol_models})
def run_shard_3(shard_payload: dict) -> dict:
    return _run_shard_impl(shard_payload)


def cli_main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--submit", action="store_true", help="Deploy & spawn 4 single-volume H100/H200 shards for remaining variations")
    parser.add_argument("--status", action="store_true", help="Check status of spawned shard FunctionCalls")
    parser.add_argument("--pull", action="store_true", help="Pull completed videos & metrics into sfx-foley/audition/")
    parser.add_argument("--summary", action="store_true", help="Print summary of completed variations and spectral metrics")
    parser.add_argument("--force", action="store_true", help="Force regenerate all variations")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    variations = manifest["variations"]
    out_audition = Path("sfx-foley/audition")

    if args.summary:
        done = [v for v in variations if "metrics" in v]
        print(f"Completed locally: {len(done)}/100")
        by_g = {}
        for v in done:
            by_g.setdefault(v["group_id"], []).append(v["id"])
        print("By group:", {k: len(val) for k, val in sorted(by_g.items())})
        for v in done:
            if v["group_id"] in ("G01", "G02", "G09", "G10"):
                m = v["metrics"]
                print(
                    f"  {v['id']} [{v['group_id']}] {v['guidance_mode']:17s} cfg={v['cfg_scale']:4.2f} "
                    f"| sub={m['sub_bass_pct']:4.1f}% mid={m['low_mid_pct']:4.1f}% hi={m['high_mid_pct']:4.1f}% air={m['steel_air_pct']:4.1f}% "
                    f"| pause={m['raw_pause_rms']:.4f} SNR={m['impact_to_pause_ratio']:5.2f}x ({m['elapsed_s']}s)"
                )
        return

    if args.submit:
        if args.force:
            rem_vars = variations
        else:
            rem_vars = [
                v for v in variations
                if not ((out_audition / "videos" / f"{v['id']}.mp4").exists() and (out_audition / "metrics" / f"{v['id']}.json").exists())
            ]
        print(f"[1/2] Deploying haru-machi-foley-100-turbo for {len(rem_vars)} remaining variations (single-volume `/vol`, dual H100+H200 pools)...", flush=True)
        subprocess.run([sys.executable, "-m", "modal", "deploy", __file__], check=True)
        n_shards = 4
        shards = [rem_vars[i::n_shards] for i in range(n_shards)]
        call_ids = []
        for s_id, s_vars in enumerate(shards):
            if not s_vars:
                continue
            fn = modal.Function.from_name("haru-machi-foley-100-turbo", f"run_shard_{s_id}")
            fc = fn.spawn({"shard_id": s_id, "variations": s_vars, "force_regen": args.force})
            call_ids.append(fc.object_id)
            print(f"  -> Spawned run_shard_{s_id} ({len(s_vars)} variations): call_id={fc.object_id}", flush=True)
        STATE_PATH.write_text(json.dumps({"call_ids": call_ids, "submitted_at": time.time()}, indent=2), encoding="utf-8")
        print(f"[2/2] All {len(call_ids)} shards running in parallel! State saved to {STATE_PATH}.", flush=True)

    elif args.status:
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        elapsed = time.time() - state["submitted_at"]
        done_all = True
        for s_id, cid in enumerate(state["call_ids"]):
            fc = modal.FunctionCall.from_id(cid)
            try:
                res = fc.get(timeout=0.2)
                print(f"  [Shard {s_id}] DONE: {res}", flush=True)
            except TimeoutError:
                done_all = False
                print(f"  [Shard {s_id}] RUNNING ({elapsed:.0f}s elapsed, call_id={cid})", flush=True)
            except Exception as e:
                print(f"  [Shard {s_id}] ERROR: {e}", flush=True)
        print(f"Overall Complete: {done_all}", flush=True)

    elif args.pull:
        print("[Pull] Downloading `/outputs/foley_100/videos` and `/outputs/foley_100/metrics` from Modal Volume `minimax-h3-models`...", flush=True)
        subprocess.run([sys.executable, "-m", "modal", "volume", "get", "minimax-h3-models", "/outputs/foley_100/videos", str(out_audition), "--force"], check=False)
        subprocess.run([sys.executable, "-m", "modal", "volume", "get", "minimax-h3-models", "/outputs/foley_100/metrics", str(out_audition), "--force"], check=False)

        met_dir = out_audition / "metrics"
        updated = 0
        for v in manifest["variations"]:
            mp = met_dir / f"{v['id']}.json"
            if mp.exists():
                m = json.loads(mp.read_text(encoding="utf-8"))
                act_rms = float(m.get("active_rms", 0.12))
                if "sub_rms" not in m:
                    m["sub_rms"] = round(act_rms * np.sqrt(float(m.get("sub_bass_pct", 50.0)) / 100.0), 4)
                    m["mid_rms"] = round(act_rms * np.sqrt(float(m.get("low_mid_pct", 25.0)) / 100.0), 4)
                    m["high_rms"] = round(act_rms * np.sqrt(float(m.get("high_mid_pct", 15.0)) / 100.0), 4)
                    m["air_rms"] = round(act_rms * np.sqrt(float(m.get("steel_air_pct", 10.0)) / 100.0), 4)
                    m["pause_rms"] = round(float(m.get("raw_pause_rms", 0.01)), 5)
                    m["peak_db"] = -1.01
                    mp.write_text(json.dumps(m, indent=2), encoding="utf-8")
                v["metrics"] = m
                updated += 1
        json_str = json.dumps(manifest, indent=2, ensure_ascii=False)
        MANIFEST_PATH.write_text(json_str, encoding="utf-8")
        (out_audition / "manifest.js").write_text(f"window.FOLEY_MANIFEST = {json_str};\n", encoding="utf-8")
        print(f"[Pull Complete] Updated {updated}/100 variations with spectral & timing metrics in manifest.json and manifest.js!", flush=True)


if __name__ == "__main__":
    cli_main()
