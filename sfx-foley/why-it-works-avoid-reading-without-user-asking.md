# Why the MiniMax H3 V2A Pipeline Works (Deep Research & Empirical Benchmarks)

> **STOP — AGENT CONTEXT RULE:**
> **Do NOT read this file during normal tasks unless the user explicitly asks you to explain or modify the underlying mathematical derivations, KV-cache internals, or experimental benchmarks.** For all production SFX generation and integration, read [`how-to-use.md`](file:///C:/Users/silen/projects/kilo-3d-kit/sfx-foley/how-to-use.md) instead.

---

## 1. Executive Summary of What We Solved

MiniMax H3 (`Ref2VA`, ~33B omni-modal packed-sequence Diffusion Transformer) generates synchronized video and stereo `32 kHz` audio jointly. When used naively for game Video-to-Audio (V2A), three major problems occur:
1. **Slow Runtime (`~270s` per 16-step clip on H200):** Because `96.7%` of the packed sequence consists of visual tokens (`ref_img` + `target_video`), standard joint denoising spends nearly all its FLOPs recomputing visual attention even when you only want the audio track.
2. **"Glassy" High-Frequency Static (`8–16 kHz` Ringing):** Both the 8-step PDD acceleration LoRA and naive prompting produce harsh, phasey `4–16 kHz` sheen from the `32 kHz` Audio VAE (`minimax_h3_audio_vae_fp32.safetensors`), often with `0%` sub-bass (`<250 Hz`).
3. **Unwanted Visual-Motion Noise During Disappearance Animations:** When a visual effect fades or sinks into the ground at the end of a clip (such as Frost Lance's 210 glacier pillars sinking at `3.0–4.3s`), the model's visual cross-attention sees large moving geometry and generates a second loud rumble—even when the positive text prompt asks for silence.

Below is the exact mathematical and empirical record of how we solved all three problems.

---

## 2. How the 50-Layer Post-RoPE Video KV-Cache Works (And Why It Is `96–99%` Exact)

### 2.1 Token Layout & Timestep Pinning in `MiniMaxH3Model._forward`
For an `832×480` (`124`-frame = `5.17s` @ `24 fps`) `Ref2VA` run, `PackedLayout` builds a single flat sequence of `~25,800` tokens across 4 contiguous segments:

```text
Packed Sequence (S ≈ 25,800 tokens):
┌──────────────────┬──────────────────────────┬──────────────────┬──────────────────────────┐
│  text (~510)     │  ref_img (12,480)        │  audio (414)     │  video (12,480)          │
│  1.9% of tokens  │  48.4% of tokens         │  1.6% of tokens  │  48.4% of tokens         │
│  seg_t = t_v     │  seg_t = 0.999 (pinned!) │  seg_t = t_a     │  seg_t = 0.999 (pinned!) │
└──────────────────┴──────────────────────────┴──────────────────┴──────────────────────────┘
```

When we lock `target_video` (`video_x = z_ref_video.clone()`, `denoise_mask = 0`), look at the AdaLN timestep dictionary `seg_t` inside `MiniMaxH3Model._forward`:

```python
vis_aug = float(payload.get("visual_cond_noise_aug", VISUAL_COND_TIMESTEP)) # 0.999
seg_t = {
    "text":    t_v,                            # Varies per step: 0.00 -> 0.98
    "audio":   t_a,                            # Varies per step: 0.00 -> 0.99
    "ref_img": max(t_v, vis_aug),              # Pinned at 0.999 on EVERY step!
    "video":   max(t_v, VISUAL_COND_TIMESTEP), # Pinned at 0.999 on EVERY step!
}
```

Because both `ref_img` (`12,480` tokens) and locked `video` (`12,480` tokens) have constant input latents (`z_ref_video`) AND constant AdaLN timestep (`0.999`) across every diffusion step:
- On **Step 0** (`~16.1s` for `124` frames on H200), we run the full `25,800`-token sequence through all 50 `DiTBlock` layers and save the post-RMSNorm, post-3D-RoPE key and value tensors `(K_stat, V_stat)` for `ref_img` and `video` at every layer `0..49`.
- We also save the audio segment's 3D RoPE coordinates `cached_audio_pos["pos_aud"] = layout.position_ids[aa:ab].clone()` on Step 0 so that if a subsequent prompt has a different `text_len`, the audio tokens keep their exact temporal RoPE alignment relative to the cached video tokens.
- On **Steps 1..15** (and on all subsequent variations/prompts for that video), we only project and normalize the `~920` `[text + audio]` tokens (`3.3%` of the sequence!) and concatenate `K_stat, V_stat` inside FlashAttention:
  $$Q = Q_{\text{text+aud}}, \quad K = [K_{\text{stat}} \;\|\; K_{\text{text+aud}}], \quad V = [V_{\text{stat}} \;\|\; V_{\text{text+aud}}]$$
- This reduces each step from **`16.8s` to `1.95s` (`8.6×` speedup)**.

### 2.2 Why We Keep the KV-Cache in H200 VRAM Instead of Saving It to Disk
- Size of the 50-layer `(K_stat, V_stat)` cache for `124` frames (`24,960` visual tokens, `40` heads × `128` dim, `bfloat16`):
  $$50 \times 2 \times 24,960 \times 5,120 \times 2\text{ bytes} \approx 25.5\text{ GB}$$
- Writing or downloading `25.5 GB` over disk/network takes minutes, whereas computing Step 0 in H200 HBM3e VRAM takes **`16.1 seconds` (`~$0.018`)** and stays in VRAM for `0.0s` across all variations in a batch.

### 2.3 Local CPU Verification: Does Reusing the Step-0 KV-Cache Across Steps and Across Different Prompts Degrade the Audio?
In Layers 1..49 on Step 0, the `24,960` visual tokens attend to the full sequence (including `3.3%` `[text + audio]` tokens). To test whether that `3.3%` cross-attention causes any drift across steps or across different prompts, we measured the raw `32,000 Hz` sample-by-sample waveform correlation, 20ms RMS envelope correlation, and STFT spectrogram correlation across three pairs of outputs:

| Controlled Comparison Pair | Raw `32 kHz` Waveform Correlation | Loudness Envelope Correlation | STFT Spectrogram Correlation | Runtime Difference |
| :--- | :---: | :---: | :---: | :--- |
| **1. Uncached vs. Step-0 KV-Cache (8-step)** (`run1` vs `run2`) | **`97.42%`** (`0.9742`) | **`99.90%`** (`0.9990`) | **`99.35%`** (`0.9935`) | `140s` vs `26s` |
| **2. Uncached vs. Step-0 KV-Cache (16-step Base)** (`exp_smite_04` vs `exp_smite_02`) | **`95.68%`** (`0.9568`) | **`96.40%`** (`0.9640`) | **`96.26%`** (`0.9626`) | `268s` vs `32s` (**8.4× faster**) |
| **3. Own-Prompt Cache (`nat2`) vs. Reused Cello-Prompt Cache (`theme5`)** | **`98.43%`** (`0.9843`) | **`99.23%`** (`0.9923`) | **`98.94%`** (`0.9894`) | `0.0s` cache rebuild cost |

**Why Test 3 achieved a `98.43%` phase-locked waveform match:** Because MiniMax H3 uses separate AdaLN modality projections (`seg_tag`: `video=0`, `text=1`, `audio=2`) and strong 3D RoPE locality, the `24,960` visual tokens attend almost exclusively to neighboring video tokens—they barely attend to text or audio tokens at all. Meanwhile, the audio tokens attend directly to the **fresh `text_states`** injected at every layer (`h_fast = torch.cat([text_states, audio_embed], dim=0)`).

---

## 3. Why Sounds Came Out "Glassy" — And What the 9-Way Frost Lance Lab Proved

### 3.1 Spectral Diagnosis of the Initial "Glassy" Batch
When we measured the FFT frequency distribution of our initial Divine Smite generation (`sfx_01_smite_wind_erosion_s42.wav`, which prompted for *"crisp dry rustling of thousands of dry leaves, petals, and fine sand grains"*), we found:
- **Bass (`<250 Hz`):** `0.0%`
- **Midrange Body (`250–2,000 Hz`):** `1.6%`
- **Upper Mids (`2,000–8,000 Hz`):** `38.3%`
- **Ultrasonic/Brittle Treble (`8,000–16,000 Hz`):** **`60.1%`** (Spectral Centroid = **`8,181 Hz`**!)

Words like *"fine sand, dry leaves, crisp, brittle, shards, glass"* map to `4–16 kHz` white noise with zero low-frequency fundamental, which decodes through the `32 kHz` neural Audio VAE as harsh metallic static.

### 3.2 Controlled 9-Way Sampling & Guidance Experiment (`F01`–`F09` on `clean_frost_lance_124f.mp4`)
We tested step counts (`16`, `32`, `50`), flow shifts (`shift_audio = 2.0, 3.0, 5.0`), schedulers (`simple`, `beta`, and tail-cutoff `0.45 -> 0.0`), 2nd-order ODE solvers (`dpmpp_2m`, `heun`), online distillation LoRAs (`SMD-8step`, `HyperFlow-8step`), and **`CFGGuider` with a Qwen3-VL Negative Prompt**:

| Run ID | Settings Tested | Waveform Corr vs `F01` (16-step) | Centroid | Bass (`<250Hz`) | Mid (`250–2k`) | Harsh (`2–8k`) | Eruption RMS (`0.2–1.5s`) | Sink/Fade RMS (`3.0–4.8s`) | **Eruption-to-Fade Ratio** |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`F01_base_16step_s3`** | `16` steps, `euler`, `simple`, `shift_a=3.0`, `CFG=1.0` | `100.0%` | `2,154 Hz` | `88.4%` | `10.0%` | `1.4%` | `0.257` | `0.092` | `2.79×` |
| **`F02_steps_32_s3`** | **`32` steps**, `euler`, `simple`, `shift_a=3.0` | **`99.06%`** | `2,084 Hz` | `89.8%` | `8.8%` | `1.3%` | `0.270` | `0.101` | `2.67×` |
| **`F03_steps_50_s3`** | **`50` steps**, `euler`, `simple`, `shift_a=3.0` | **`98.35%`** | `2,065 Hz` | `90.0%` | `8.7%` | `1.2%` | `0.272` | `0.103` | `2.65×` |
| **`F04_shift_audio_5`** | `shift_audio = 5.0` (`24` steps) | **`99.71%`** | `2,077 Hz` | `88.3%` | `10.3%` | `1.3%` | `0.252` | `0.097` | `2.58×` |
| **`F05_shift_audio_2`** | `shift_audio = 2.0` (`24` steps) | **`99.12%`** | `2,175 Hz` | `89.6%` | `8.8%` | `1.4%` | `0.272` | `0.099` | `2.76×` |
| **`F06_beta_scheduler`** | `beta` scheduler (`24` steps) | **`99.08%`** | `2,080 Hz` | `88.9%` | `9.7%` | `1.3%` | `0.261` | `0.097` | `2.68×` |
| **`F07_sampler_dpmpp_2m`** | 2nd-Order `dpmpp_2m` (`24` steps) | **`96.75%`** | `1,999 Hz` | `91.0%` | `7.8%` | `1.1%` | `0.280` | `0.110` | `2.55×` |
| **`F08_sampler_heun`** | 2nd-Order `heun` (`16` steps / `32` NFE) | **`98.79%`** | `2,059 Hz` | `89.5%` | `9.2%` | `1.2%` | `0.262` | `0.101` | `2.60×` |
| **`F09_cfg_neg_prompt`** | **`CFGGuider(cfg=1.6)` + Qwen3-VL Negative Prompt** | **`94.08%`** | **`1,724 Hz`** | **`93.2%`** | `6.1%` | **`0.6%`** | **`0.295`** | **`0.047`** | **`6.20×` (!)** |

### 3.3 Four Key Laws Established by the Data
1. **Why `32` Steps, `50` Steps, `heun`, `dpmpp_2m`, and `beta` Scheduler Are `96.8%–99.7%` Identical to `16` Steps:**
   - As documented on the `MiniMaxAI/MiniMax-H3` model card, the released base checkpoints are already **flow-straightened (CFG-distilled)** during training.
   - Because the ODE trajectory from $\sigma = 1.0 \to 0.0$ is already nearly a straight line, taking `32` or `50` steps along that line—or using a 2nd-order curved solver (`heun` / `dpmpp_2m`)—lands at the exact same destination (`98.4%–99.1%` sample-level correlation). Therefore, **`16` steps (`euler`, `simple`) is already converged**.
2. **Why Tail-Cut Sigmas (`0.45 -> 0.0`) and Online LoRAs (`SMD`, `HyperFlow`, `PDD`) Should Not Be Used:**
   - Truncating the last 4 steps on the base model (`exp_frost_03_warm_cached_tailcut`) left unfinished mid-frequency latent energy that decoded as an artificial brassy/organ drone.
   - Online LoRAs on HuggingFace are either visual-only or step-distillation adapters (`PDD`, `SMD`, `HyperFlow`, `PTD`) whose key shapes target the unpruned BF16 model (`WARNING: lora key not loaded` on `int8_convrot`) and degrade high-frequency audio fidelity.
3. **Why `CFGGuider(cfg=1.6–1.8)` with a Qwen3-VL Negative Prompt Was the Breakthrough:**
   - At `CFG = 1.0` (`BasicGuider`), the visual motion of 210 giant glacier pillars sinking into the ground at `3.0–4.3s` overrides the positive prompt's request for silence and generates a second rumble (`fade_rms = 0.092–0.110`).
   - With `CFGGuider(cfg=1.6–1.8)`, the sampler evaluates both `pos_cond` and `neg_cond` (`v = v_neg + cfg * (v_pos - v_neg)`) and actively subtracts the negative prompt's velocity vector (*"ambient wind, mist hiss, room tone, white noise static, glassy high-frequency ringing, dull dirt landslide, and a second rumble or sound after 2.0 seconds"*). This cut `2–8 kHz` harshness in half (`1.4% -> 0.6%`) and cut the unwanted end-rumble in half (`0.092 -> 0.047`, raising the Eruption-to-Fade ratio from `2.79×` to **`6.20×`**).
4. **Why `polish_game_sfx()` Rolls Off Above `5,600 Hz` Instead of `2,200 Hz`:**
   - A `2,200 Hz` low-pass removes `8–16 kHz` VAE hiss, but it also strips the `1,500–5,500 Hz` band where physical texture lives (the snap of freezing lake ice, crystal facet clicks, and electric arc whip-cracks).
   - Keeping **`0 Hz – 5,600 Hz` 100% intact** (`lp_gain = 1 / (1 + (f / 5600)^8)`), adding a **`+4.5 dB` soft-saturated sub-bass shelf below `135 Hz`**, and applying a **visual-synced silence gate** right after the active impact window preserves all physical elemental texture while delivering chest-hitting bass and pure digital silence between attacks.
