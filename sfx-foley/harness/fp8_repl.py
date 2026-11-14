"""
Interactive FP8 Benchmark & Resident REPL (`sfx-foley/harness/fp8_repl.py`).
Run inside the persistent `work` tmux session via:
  python sfx-foley/harness/h200_ctl.py send "python -u -i /tmp/fp8_repl.py"
"""

import gc
import os
import subprocess
import sys
import time
import traceback
import wave
from pathlib import Path
import cv2
import numpy as np

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
import torch

COMFY_PATH = Path("/comfyui")
VOL_ROOT = Path("/vol")

# 1. Verify FP8 checkpoint on /vol/diffusion_models/
fp8_path = VOL_ROOT / "diffusion_models" / "minimax_h3_ref2va_pruned_fp8_scaled.safetensors"
aria2_ctrl = Path(str(fp8_path) + ".aria2")
if aria2_ctrl.exists() or not fp8_path.exists() or fp8_path.stat().st_size < 20_950_000_000:
    print("[FP8 REPL] Completing/verifying minimax_h3_ref2va_pruned_fp8_scaled.safetensors...", flush=True)
    from huggingface_hub import hf_hub_download
    import shutil
    dl = hf_hub_download(
        repo_id="Comfy-Org/MiniMax-H3",
        filename="diffusion_models/minimax_h3_ref2va_pruned_fp8_scaled.safetensors",
        local_dir="/tmp/hf_fp8",
        local_dir_use_symlinks=False,
        token=os.environ.get("HF_TOKEN"),
    )
    shutil.move(str(dl), str(fp8_path))
    if aria2_ctrl.exists():
        aria2_ctrl.unlink()
    shutil.rmtree("/tmp/hf_fp8", ignore_errors=True)
    subprocess.run(["sync", "/vol"], check=False)

print(f"[FP8 REPL] Verified {fp8_path.name} ({fp8_path.stat().st_size / 1e9:.2f} GB)", flush=True)

# 2. Symlink models into /comfyui/models/
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
sys.path.insert(0, "/tmp")

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
from comfy_extras.nodes_custom_sampler import BasicScheduler, CFGGuider, KSamplerSelect, RandomNoise, SamplerCustomAdvanced
from comfy_extras.nodes_audio import VAEDecodeAudio
from flash_attn import flash_attn_func
from foley_service import GAME_NEG_PROMPT, PROMPT_VARIATIONS, SILENCE_WINDOWS, polish_clean_foley


def unwrap(out):
    return out.result if hasattr(out, "result") else out


t0 = time.perf_counter()
with torch.inference_mode():
    print("[FP8 REPL] Loading Qwen3-VL 32B + VAEs + MiniMax-H3 FP8_SCALED...", flush=True)
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

    tokens = clip_model.tokenize(GAME_NEG_PROMPT, minimax_ref_items=ref_items)
    cond = clip_model.encode_from_tokens_scheduled(tokens)
    neg_cond = node_helpers.conditioning_set_values(cond, {"minimax_refs": ref_blocks})

    comfy.model_management.unload_all_models()
    gc.collect()
    torch.cuda.empty_cache()

KV_CACHE = {}
STATE = {"cache_built": False, "n_stat": 0}
print(f"[FP8 REPL] Ready in {time.perf_counter() - t0:.1f}s on {torch.cuda.get_device_name(0)}!", flush=True)


def run_fp8_bench(var_indices=(0, 3), n_steps=16):
    try:
        out_dir = VOL_ROOT / "outputs" / "foley_lab_04_fp8"
        out_dir.mkdir(parents=True, exist_ok=True)
        vars_to_run = [PROMPT_VARIATIONS[i] for i in var_indices]

        with torch.inference_mode():
            t_enc = time.perf_counter()
            comfy.model_management.unload_all_models()
            torch.cuda.empty_cache()
            encoded_vars = []
            for v in vars_to_run:
                tok = clip_model.tokenize(v["prompt"], minimax_ref_items=ref_items)
                c = clip_model.encode_from_tokens_scheduled(tok)
                pc = node_helpers.conditioning_set_values(c, {"minimax_refs": ref_blocks})
                encoded_vars.append((v, pc))
            comfy.model_management.unload_all_models()
            gc.collect()
            torch.cuda.empty_cache()
            print(f"[FP8 Bench] Encoded {len(encoded_vars)} prompt(s) in {time.perf_counter() - t_enc:.1f}s", flush=True)

            model_obj = unwrap(MiniMaxH3SigmaShift.execute(unet_fp8, 12.0, 4.0))[0]
            sigmas = unwrap(BasicScheduler.execute(model_obj, "simple", n_steps, 1.0))[0]
            sampler = unwrap(KSamplerSelect.execute("euler"))[0]
            dit = unet_fp8.model.diffusion_model
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

                if not STATE["cache_built"]:
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
                    STATE["n_stat"] = n_stat
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
                        KV_CACHE[layer_idx] = (k_buf, v_buf)

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

                    STATE["cache_built"] = True
                    print(f"    [FP8 Step 0] Built 50-Layer FlashAttention KV-Cache ONCE in {time.perf_counter() - t_bake:.2f}s (n_stat={n_stat})", flush=True)
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
                n_stat = STATE["n_stat"]
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

                    k_buf, v_buf = KV_CACHE[layer_idx]
                    total_len = n_stat + s_f
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

            for idx, (v_spec, pos_cond) in enumerate(encoded_vars, 1):
                v_name = v_spec["name"]
                v_seed = v_spec["seed"]
                print(f"[FP8 Sampling] ({idx}/{len(encoded_vars)}) {v_name} (seed={v_seed}, steps={n_steps})...", flush=True)
                guider = unwrap(CFGGuider.execute(model_obj, pos_cond, neg_cond, 1.8))[0]
                noise = unwrap(RandomNoise.execute(v_seed))[0]
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

                polished_np = polish_clean_foley(raw_np, sr, v_spec["sub_db"], SILENCE_WINDOWS)
                for suffix, arr in (("_fp8", polished_np), ("_fp8_raw", raw_np)):
                    stem = f"{v_name}{suffix}"
                    wav_p = out_dir / f"{stem}.wav"
                    mp3_p = out_dir / f"{stem}.mp3"
                    pcm16 = (arr.T * 32767.0).astype(np.int16)
                    with wave.open(str(wav_p), "wb") as wf:
                        wf.setnchannels(pcm16.shape[1])
                        wf.setsampwidth(2)
                        wf.setframerate(sr)
                        wf.writeframes(pcm16.tobytes())
                    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav_p), "-b:a", "192k", str(mp3_p)], check=True)

                print(f"    ===> [FP8 RESULT] {v_name}: {el:.2f}s ({el / (n_steps * 2):.3f}s per CFG pass)!", flush=True)

    except Exception:
        traceback.print_exc()
    finally:
        unet_fp8.model.diffusion_model._forward = orig_dit_forward


run_fp8_bench((0, 3), 16)
