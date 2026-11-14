"""
Hot-Reloadable Foley Worker (`sfx-foley/harness/foley_worker.py`).

Executed inside the live `h200_foley_console.py` container against already-loaded models in `state`.
If a bug occurs or we tweak prompts, we simply edit this file and re-run via `h200_ctl.py` —
ZERO model reload time, and the 50-layer Post-RoPE Video KV-Cache stays cached in `state["video_cache"]`!
"""

import subprocess
import time
import wave
from pathlib import Path
import cv2
import numpy as np
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
from comfy_extras.nodes_minimax_h3 import FPS, MiniMaxH3SigmaShift, _empty_av_latent
from comfy_extras.nodes_custom_sampler import BasicScheduler, CFGGuider, KSamplerSelect, RandomNoise, SamplerCustomAdvanced
from comfy_extras.nodes_audio import VAEDecodeAudio
from flash_attn import flash_attn_func


def unwrap(out):
    return out.result if hasattr(out, "result") else out


def build_official_ref_en_prompt(
    summary_sfx: str,
    beat1_dragon_ice: str,
    beat2_minimal_swing: str,
    beat3_dragon_fire: str,
    beat4_minimal_swing: str,
    overall_sfx: str,
) -> str:
    return (
        "subject_definitions:\n"
        "<Subject 1> is the sunlit village cobblestone path environment in <Video 1>, featuring grey stone pavers, a dirt road leading into green meadow grass with purple wildflowers on the left, a red-roofed timber-frame Tudor cottage on the right, distant green hills under a bright blue sky, and drifting pink cherry blossom petals.\n"
        "<Subject 2> is the chibi Knight character in <Video 1>, wearing dark charcoal-grey plate armor, a visor helmet, a red wax seal on the chest, a flowing crimson cape, a left-hand iron shield, and a right-hand broadsword.\n"
        "<Subject 3> is the blue-and-white cel-shaded Ice Dragon sword-breathing visual effect and ice-coated blade in <Video 1>.\n"
        "<Subject 4> is the orange-and-crimson cel-shaded Fire Dragon sword-breathing visual effect and flame-coated blade in <Video 1>.\n"
        "<Video 1> is the source video for the target video edit.\n\n"
        "summary:\n"
        f"[video editing] The target video is an edited version of <Video 1> showing <Subject 2> on <Subject 1> performing <Subject 3> and <Subject 4> sword techniques. {summary_sfx}\n\n"
        "retention_analysis:\n"
        "<Subject 1> (appears in [Shot 1]): fully_preserved - the sunlit cobblestone path, Tudor cottage, meadow grass, wildflowers, and drifting petals are retained.\n"
        "<Subject 2> (appears in [Shot 1]): fully_preserved - the Knight's charcoal plate armor, crimson cape, shield, and sword choreography are retained.\n"
        "<Subject 3> (appears in [Shot 1]): fully_preserved - the blue-and-white Ice Dragon head and crystalline ice blade geometry are retained.\n"
        "<Subject 4> (appears in [Shot 1]): fully_preserved - the crimson-and-gold Fire Dragon head and blazing flame blade geometry are retained.\n"
        "<Video 1> (cut and pacing structure): fully_preserved - the locked medium camera framing and exact action timing are retained 1:1.\n\n"
        "detailed_description:\n"
        "The target video is in a stylized cel-shaded 3D animated game style with bright natural daylight.\n"
        "[Shot 1] A locked medium full shot establishes <Subject 1>, the sunlit grey cobblestone path with the red-roofed Tudor cottage on the right and green meadow grass with purple wildflowers on the left, while <Subject 2>, the chibi Knight in dark charcoal plate armor and a crimson cape, stands in the center foreground. From 00:00.000 to 00:00.250, <Subject 2> holds a ready stance in complete silence. "
        f"At 00:00.250, <Subject 2> swings the broadsword horizontally to the right as <Subject 3>, the giant blue-and-white Ice Dragon head with jagged white fangs, coils across the upper right of the frame; this special technique begins with a grounded, minimal steel impact transient and expands into {beat1_dragon_ice} "
        "At 00:01.250, <Subject 3> vanishes and <Subject 2> holds the glowing blue ice-coated sword at his side in complete silence until 00:01.830. "
        f"At 00:01.830, <Subject 2> performs a compact, basic vertical sword swing with the blue ice-coated blade, producing a short, minimal, grounded game sound: {beat2_minimal_swing} "
        "At 00:02.650, <Subject 2> returns to an idle stance in complete silence until 00:03.330. "
        f"At 00:03.330, <Subject 2> slashes upward as <Subject 4>, the giant crimson-and-gold Fire Dragon head, erupts from the orange flame-coated blade across the upper right of the frame; this special technique begins with a grounded metallic strike transient and expands into {beat3_dragon_fire} "
        "At 00:04.330, <Subject 2> pauses holding the glowing orange-gold flame sword in complete silence until 00:04.750. "
        f"At 00:04.750, <Subject 2> steps forward into a basic overhead sword cleave as <Subject 4> flares briefly, producing a short, minimal, grounded impact sound: {beat4_minimal_swing} "
        "From 00:05.450 to 00:05.875, the scene ends in complete silence.\n\n"
        "overall_soundscape:\n"
        f"{overall_sfx} Complete silence between the four actions. No airy white-noise whooshes, no wind hiss, no room tone, no dialogue.\n\n"
        "non_diegetic_music:\n"
        "N/A"
    )


GAME_NEG_PROMPT = (
    "subject_definitions:\n"
    "<Subject 1> is the village path in <Video 1>.\n"
    "<Subject 2> is the Knight in <Video 1>.\n"
    "<Video 1> is the source video.\n\n"
    "summary:\n"
    "[video editing] Low-quality bloated audio with generic white-noise whooshes, windy static, muddy bass rumble, and continuous noise during pauses.\n\n"
    "retention_analysis:\n"
    "<Subject 1>: fully_preserved\n"
    "<Subject 2>: fully_preserved\n"
    "<Video 1>: fully_preserved\n\n"
    "detailed_description:\n"
    "The target video is in a 3D animated style.\n"
    "[Shot 1] Loud generic air whooshing, white-noise static, pink-noise wash, wind hiss, muffled bass mud, synth drones, and background noise during silent pauses.\n\n"
    "overall_soundscape:\n"
    "Generic air whoosh, white noise, pink noise, wind hiss, mist, static, muddy rumble, speech, dialogue.\n\n"
    "non_diegetic_music:\n"
    "Background music, synthesizer pad, brass."
)


PROMPT_VARIATIONS = [
    {
        "name": "v1_sekiro_minimal_clink_plus_dragon_bloom",
        "seed": 42,
        "sub_db": 0.0,
        "prompt": build_official_ref_en_prompt(
            "It pairs minimal, short, close-miked steel-and-scabbard clicks on the basic swings with expansive, tactile ice-fracture and charcoal-ember blooms on the two dragon awakenings.",
            "a crisp, dry high-carbon steel guard click on the initial strike that blooms outward into the sharp, resonant crack of thick frozen lake ice splitting open and delicate frost crystals chiming.",
            "a very short, minimal, dry steel blade clink and a single crisp ice-cube snap with zero tail.",
            "a tight forged-steel blade tang tap on the initial strike that expands into a dry cedar-wood fire flare and crackling blacksmith forge embers.",
            "a short, minimal, grounded steel-on-wood chop click and a single dry ember pop.",
            "Minimal, close-miked steel guard clicks for basic swings contrasted with rich frozen lake-ice cracking and dry forge-ember crackling for the dragon techniques.",
        ),
    },
    {
        "name": "v2_tsushima_bamboo_steel_and_elemental_tail",
        "seed": 77,
        "sub_db": 0.0,
        "prompt": build_official_ref_en_prompt(
            "It uses ultra-clean, dry bamboo-and-steel transient clicks for the basic swings and layered glacier-ice and hearth-fire foley for the dragon techniques.",
            "a grounded leather hilt creak and silver blade ring that opens into a crisp, biting flash-freeze crystallization crunch and solid block-ice fracture.",
            "a compact, minimal 150-millisecond tempered-steel tap and brittle frost tick.",
            "a sharp metallic sword scabbard click that opens into a tight match-head ignition flare and dry pine logs snapping in a hearth.",
            "a brief, grounded iron blade tap and a crisp charcoal snap.",
            "Dry, tactile studio foley with minimal, short metallic transients on basic attacks and rich ice-crystallization and pine-hearth crackle on the dragon attacks.",
        ),
    },
    {
        "name": "v3_botw_glass_crystal_and_camp_snap",
        "seed": 108,
        "sub_db": 0.0,
        "prompt": build_official_ref_en_prompt(
            "It combines delicate, grounded weapon foley on the normal swings with crisp crystal-ice and campfire-log foley on the dragon summons.",
            "a clean, minimal steel blade ring at the moment of impact that unfolds into the clear, musical snap of solid river ice cracking and glass-like frost facets locking into place.",
            "a quiet, minimal leather-and-steel wrist flick and a tiny dry ice tick.",
            "a crisp flint-on-steel spark click at the moment of impact that unfolds into a warm, crackling burst of dry birch bark and snapping campfire kindling.",
            "a short, dry, grounded steel blade clink and a single wood-ember crack.",
            "Clean, spacious game foley with subtle, non-fatiguing basic weapon clicks and crisp river-ice and birch-campfire textures on the dragon summons.",
        ),
    },
    {
        "name": "v4_monster_hunter_tactile_metal_and_bite",
        "seed": 202,
        "sub_db": 1.0,
        "prompt": build_official_ref_en_prompt(
            "It contrasts tight, grounded iron weapon foley on basic swings with weighty block-ice cleaving and furnace-wood combustion on the dragon techniques.",
            "a solid forged-iron guard lock that expands into the heavy, unmistakable physical crunch of an ice-axe splitting a solid block of clear glacier ice.",
            "a short, tight, dry steel blade clink with a subtle frozen snow-crust tap.",
            "a firm iron-on-iron blade ring that expands into a concentrated forge-bellows coal flare and dry oak timber cracking under heat.",
            "a compact, grounded iron blade chop and a brief dry wood snap.",
            "Grounded forged-iron weapon foley paired with solid block-ice splitting and oak-timber fire crackling.",
        ),
    },
    {
        "name": "v5_ultra_dry_minimalist_precision_foley",
        "seed": 303,
        "sub_db": 0.0,
        "prompt": build_official_ref_en_prompt(
            "It delivers ultra-dry, close-miked precision foley with minimal transient clicks on normal swings and focused, artifact-free ice and fire textures on the dragon techniques.",
            "a pinpoint carbon-steel blade ring followed by a clean, dry snap of solid clear ice fracturing in a quiet foley booth.",
            "a tiny, crisp, dry metallic blade click and leather grip creak.",
            "a pinpoint tempered-steel ring followed by a clean, close-miked crackle of dry kindling wood catching flame.",
            "a tiny, crisp, dry steel blade tap and a single ember tick.",
            "Ultra-dry, close-miked foley booth recording of carbon-steel clicks, fracturing clear ice, and crackling dry kindling.",
        ),
    },
]

SILENCE_WINDOWS = [[0.0, 0.25], [1.25, 1.83], [2.65, 3.33], [4.33, 4.75], [5.45, 5.875]]


def polish_clean_foley(wav_np, sr: int, sub_db: float, silence_windows: list):
    n = wav_np.shape[1]
    freqs = np.fft.rfftfreq(n, d=1.0 / sr)
    hp_gain = 1.0 - (1.0 / (1.0 + (np.maximum(freqs, 1e-3) / 70.0) ** 4))
    lp_gain = 1.0 / (1.0 + (freqs / 5800.0) ** 8)
    band_gain = hp_gain * lp_gain
    sub_gain = 1.0 / (1.0 + (freqs / 125.0) ** 4)

    clean = np.zeros_like(wav_np)
    sub = np.zeros_like(wav_np)
    for ch in range(wav_np.shape[0]):
        spec = np.fft.rfft(wav_np[ch])
        clean[ch] = np.fft.irfft(spec * band_gain, n=n)
        sub[ch] = np.fft.irfft(spec * sub_gain, n=n)

    sub_weight = 0.0 if sub_db <= 0.05 else (0.10 * sub_db)
    boosted = clean + sub_weight * np.tanh(sub * 1.6)

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

    out = boosted * env[None, :]
    pk = float(np.max(np.abs(out))) + 1e-8
    out = (out / pk) * 0.86
    return out.astype(np.float32)


def load_video_frames_tensor(mp4_path: Path, max_frames: int):
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


def run_job(state: dict, smoke: bool = False, var_idx: int = None):
    clip_model = state["clip_model"]
    video_vae = state["video_vae"]
    audio_vae = state["audio_vae"]
    unet_base = state["unet_base"]
    video_cache = state["video_cache"]

    out_dir = Path("/vol/outputs/foley_lab_04")
    out_dir.mkdir(parents=True, exist_ok=True)
    inp_mp4 = Path("/vol/inputs/foley_suite/04_knight_glacial_and_sunfire_breathing.mp4")
    n_frames = 141
    clip_key = "04_knight_glacial_and_sunfire_breathing_141"

    t_job0 = time.perf_counter()

    def encode_p(p_text, ref_items, ref_blocks):
        tokens = clip_model.tokenize(p_text, minimax_ref_items=ref_items)
        cond = clip_model.encode_from_tokens_scheduled(tokens)
        return node_helpers.conditioning_set_values(cond, {"minimax_refs": ref_blocks})

    # 1. Reuse or compute Video VAE latents + Qwen frames + neg_cond in warm VRAM
    if clip_key not in video_cache:
        t_v = time.perf_counter()
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
        _, empty_aud_lat = empty_av_latent["samples"].unbind()[:2]
        neg_cond = encode_p(GAME_NEG_PROMPT, ref_items, ref_blocks)
        video_cache[clip_key] = {
            "z_ref_video": z_ref_video,
            "empty_aud_lat": empty_aud_lat,
            "ref_items": ref_items,
            "ref_blocks": ref_blocks,
            "neg_cond": neg_cond,
            "kv_cache": {},
            "cache_built": False,
            "n_stat": 0,
        }
        print(f"[Warm Cache] Encoded Video VAE latents + neg_cond in {time.perf_counter() - t_v:.1f}s", flush=True)
    else:
        print(f"[Warm Cache] Reusing resident Video VAE latents + neg_cond for {clip_key} (0.0s)!", flush=True)

    vc = video_cache[clip_key]
    z_ref_video = vc["z_ref_video"]
    empty_aud_lat = vc["empty_aud_lat"]
    ref_items = vc["ref_items"]
    ref_blocks = vc["ref_blocks"]
    neg_cond = vc["neg_cond"]
    kv_cache = vc["kv_cache"]

    if smoke:
        vars_to_run = PROMPT_VARIATIONS[:1]
    elif var_idx is not None:
        vars_to_run = [PROMPT_VARIATIONS[int(var_idx)]]
    else:
        vars_to_run = PROMPT_VARIATIONS

    n_steps = 2 if smoke else 16

    t_enc = time.perf_counter()
    comfy.model_management.unload_all_models()
    torch.cuda.empty_cache()
    encoded_vars = [(v, encode_p(v["prompt"], ref_items, ref_blocks)) for v in vars_to_run]
    comfy.model_management.unload_all_models()
    torch.cuda.empty_cache()
    print(f"[Text Encode] Encoded {len(encoded_vars)} pos prompt(s) in {time.perf_counter() - t_enc:.1f}s", flush=True)

    model_obj = unwrap(MiniMaxH3SigmaShift.execute(unet_base, 12.0, 4.0))[0]
    sigmas = unwrap(BasicScheduler.execute(model_obj, "simple", n_steps, 1.0))[0]
    sampler = unwrap(KSamplerSelect.execute("euler"))[0]
    dit = unet_base.model.diffusion_model

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

        if not vc["cache_built"]:
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
            vc["n_stat"] = n_stat
            # Dynamic headroom beyond actual (n_text + n_aud) so k_buf never truncates!
            init_fast = (tb - ta) + (ab - aa)
            max_fast_tokens = max(6144, init_fast + 2048)

            for layer_idx, block in enumerate(dit.blocks):
                shift_msa, scale_msa, gate_msa, shift_mlp, scale_mlp, gate_mlp = block.adaln_proj(t_emb)
                h_norm = _mod_scale_shift(block.norm1(h), shift_msa, scale_msa, mod_segments)
                attn_mod = block.attn
                s = h_norm.shape[0]
                q, k, v = attn_mod.qkv_proj(h_norm).split(attn_mod.heads * attn_mod.head_dim, dim=-1)
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
                attn_out = attn_mod.out_proj(attn_raw.view(s, attn_mod.heads * attn_mod.head_dim))

                h = _mod_gate(h, gate_msa, attn_out, mod_segments)
                h_norm2 = _mod_scale_shift(block.norm2(h), shift_mlp, scale_mlp, mod_segments)
                h = _mod_gate(h, gate_mlp, block.mlp(h_norm2), mod_segments)

            vc["cache_built"] = True
            print(f"    [Step 0] Built Contiguous FlashAttention KV-Cache ONCE in {time.perf_counter() - t_bake:.1f}s (n_stat={n_stat}, fast_cap={max_fast_tokens})", flush=True)
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
        n_stat = vc["n_stat"]

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
        pos_fast = torch.cat([layout.position_ids[ta:tb], layout.position_ids[aa:ab]], dim=0)
        rope_fast = rope_rotation_table(dit.rope_freqs(pos_fast, device), dtype)

        for layer_idx, block in enumerate(dit.blocks):
            shift_msa, scale_msa, gate_msa, shift_mlp, scale_mlp, gate_mlp = block.adaln_proj(t_emb)
            h_norm = _mod_scale_shift(block.norm1(h_fast), shift_msa, scale_msa, mod_segments_fast)
            attn_mod = block.attn
            s_f = h_norm.shape[0]
            q, k, v = attn_mod.qkv_proj(h_norm).split(attn_mod.heads * attn_mod.head_dim, dim=-1)
            v = v.view(1, s_f, attn_mod.heads, attn_mod.head_dim)
            q = q.view(1, s_f, attn_mod.heads, attn_mod.head_dim)
            k = k.view(1, s_f, attn_mod.heads, attn_mod.head_dim)
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
            attn_out = attn_mod.out_proj(attn_raw.view(s_f, attn_mod.heads * attn_mod.head_dim))

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

    results = []
    for idx, (v_spec, pos_cond) in enumerate(encoded_vars, 1):
        v_name = v_spec["name"]
        v_seed = v_spec["seed"]
        print(f"\n[Sampling] ({idx}/{len(encoded_vars)}) {v_name} (seed={v_seed}, steps={n_steps}, cfg=1.8)...", flush=True)
        guider = unwrap(CFGGuider.execute(model_obj, pos_cond, neg_cond, 1.8))[0]
        noise = unwrap(RandomNoise.execute(v_seed))[0]
        t_v0 = time.perf_counter()
        _, den = unwrap(SamplerCustomAdvanced.execute(
            noise=noise, guider=guider, sampler=sampler, sigmas=sigmas, latent_image=make_lat()
        ))
        el = time.perf_counter() - t_v0
        aud = unwrap(VAEDecodeAudio.execute(vae=audio_vae, samples=den))[0]

        if not smoke:
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
                    "ffmpeg", "-y", "-v", "error", "-i", str(inp_mp4), "-i", str(wav_p),
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(mux_p)
                ], check=True)

        print(f"    -> {v_name} finished in {el:.1f}s!", flush=True)
        results.append({"name": v_name, "elapsed_s": round(el, 1), "smoke": smoke})

    print(f"\n[Done] Completed {len(results)} variation(s) in {time.perf_counter() - t_job0:.1f}s!", flush=True)
    return results
