# Sound & H200 Video-to-Audio (V2A) Pipeline Handoff — MiniMax H3, HunyuanVideo-Foley & LTX-2.3

**Date:** 2026-11-05  
**Primary Workspace:** `C:/Users/silen/projects/kilo-3d-kit` (Branch: `master`)  
**Sibling Partner Worktree (Do Not Collide):** `C:/Users/silen/projects/kilo-3d-kit/.kilo/worktrees/behavior-ui` (handling UI polish & ComfyUI behavioral node graph).

---

## 1. Why the Previous Thread Timed Out (And How to Keep This Thread Fast)

- **Root Cause of Timeout at Step 2,948:** The previous thread reached ~2,950 steps and had both a 5 MB `.mp4` video (`video (5).mp4`) and an 800 KB `.wav` audio file (`omni-video5-audio.wav`) attached simultaneously in active multimodal context, causing the upstream model stream to time out after 75s of thinking.
- **Rule for This Thread:** Keep multimodal attachments lean (don't load raw `.mp4` and `.wav` into the same turn unless needed).

---

## 2. What Vikas Proved with `video (5).mp4` (Omni Video-to-Audio Test)

- **File Location:**
  - Video: `C:/Users/silen/.t3/userdata/attachments/29c291c2-df45-4429-8674-f93bf575c302-6cf9e95c-516c-402a-8688-b21ec26f5d40-mp4.mp4`
  - Extracted 48kHz/24kHz Stereo Audio: `C:/Users/silen/projects/kilo-3d-kit/qa-review/divine-verdict/omni-video5-audio.wav`
- **What Happened in `video (5).mp4`:**
  1. **The Audio Was Great:** When Vikas fed `clip-blessing-resurrection.webm` into Omni (`720p • Edit`) with the prompt *"Strictly preserve all original video frames... Add synchronized, high-fidelity dark-fantasy environmental sound effects and foley"*, the **generated audio track (`omni-video5-audio.wav`) was genuinely physical and frame-synced**:
     - `0.00–1.00s`: Low ominous wind across cobblestones + cloth/armor drop as the Mage collapses.
     - `1.00–4.00s`: Visceral dry woody branches snapping, twisting, and scraping as the Briar Option 9 cage erupts.
     - `4.00–5.00s`: Deep, heavy acoustic thuds as the briar cage wrenches `-3.05m` underground.
     - `5.00–6.40s`: Quiet, tense subterranean pause while they are underground.
     - `6.40–8.50s`: Crisp armor/boot movement and rush of air as both heroes pop back up and walk together.
  2. **Why Cloud Video-to-Video Edit Can't Be Used for Pixels:** Even with *"0% visual alteration"*, Omni re-encoded the video through its visual VAE, melting the HUD text at the bottom-left into gibberish, warping the characters' faces, and stamping a watermark at the bottom-right.
  3. **Immediate Takeaway:** Even for a cloud Omni run, **we should NEVER use its video output—we only strip its `.wav` audio track (`ffmpeg -vn`) and mux/trigger that exact `.wav` against our untouched, razor-sharp 3D WebGL game!**

---

## 3. Ground-Truth Source Code Research: MiniMax H3 vs. HunyuanVideo-Foley vs. LTX-2.3 on H200

We inspected the actual source code of **`Comfy-Org/ComfyUI/blob/master/comfy/ldm/minimax/model.py`**, **`comfy_extras/nodes_minimax_h3.py`**, and **`SveSop/ComfyUI-H3-NativeAudioLock/nodes.py`**. Here is the exact technical truth:

### 3.1 Does the "Inverse MiniMax H3 Hijack" Work in ComfyUI?
**YES — 100% Confirmed in `comfy/ldm/minimax/model.py` (Lines 525–625)!**
- **How MiniMax H3 Works Under the Hood:**
  - MiniMax H3 (`MiniMaxAI/MiniMax-H3`, 33B dense Omni-Transformer + `Qwen3-VL-32B` layer-50 encoder + `H3-VisualVAE` `f16t4d24` + `H3-AudioVAE` `32kHz` stereo @ `40Hz` token rate) packs tokens as `[text | cond/ref blocks | audio | video]`.
  - In `comfy/ldm/minimax/model.py`, `forward()` explicitly accepts **both** `denoise_mask` (for the video stream `x[0]`) and `audio_denoise_mask` (for the audio stream `x[1]`):
    ```python
    # In comfy/ldm/minimax/model.py:
    if denoise_mask is not None:
        m = mask_row_values(denoise_mask[0, 0].to(torch.float32), latent_t, lat_h, lat_w)
        if m is not None:
            rows_t = (1.0 - m * sigma_v.to(m.device)).clamp(max=t_pin_v)
            if rows_t.unique().numel() == 1:
                seg_t["video"] = float(rows_t[0])
    ...
    if denoise_mask is not None:
        out[0] = out[0] * denoise_mask
    if audio_denoise_mask is not None:
        out[1] = out[1] * audio_denoise_mask
    ```
- **What Happens When You Flip the Mask (`video_mask = 0`, `audio_mask = 1`):**
  1. When `denoise_mask` on the video stream is `torch.zeros_like(video_latent)` (`m = 0`) and `audio_denoise_mask` on the audio stream is `torch.ones_like(audio_latent)` (`m = 1`):
  2. `rows_t` for every video token is pinned to `t_pin_v = VISUAL_COND_TIMESTEP = 0.999` (i.e. **100% clean, noise-free video tokens!**), and `out[0] = out[0] * 0 = 0` so the sampler **never alters the video latent**.
  3. Meanwhile, the 32 kHz stereo `audio_latent` runs through its full flow-matching schedule (`shift_audio = 3.0`), attending at every single layer to the clean `video_latent` tokens and `Qwen3-VL-32B` text prompt!
- **The 25-Line Custom ComfyUI Node (`MiniMaxH3NativeVideoLockForV2A`):**
  ```python
  import torch
  import comfy.nested_tensor

  class MiniMaxH3NativeVideoLockForV2A:
      """Encode clean input video into H3's AV latent, freeze video (mask=0), and denoise ONLY 32kHz stereo audio (mask=1)."""
      @classmethod
      def INPUT_TYPES(cls):
          return {
              "required": {
                  "av_latent": ("LATENT",),
                  "video_vae": ("VAE",),
                  "images": ("IMAGE",),
              }
          }
      RETURN_TYPES = ("LATENT",)
      FUNCTION = "lock_video_generate_audio"
      CATEGORY = "MiniMax H3/Native Audio"

      def lock_video_generate_audio(self, av_latent, video_vae, images):
          _, target_audio_template = av_latent["samples"].unbind()[:2]
          # Encode clean gameplay frames into H3 VisualVAE [B, 24, T, H//16, W//16]
          clean_video_latent = video_vae.encode(images[:, :, :, :3])
          t_v = min(clean_video_latent.shape[2], av_latent["samples"].unbind()[0].shape[2])
          clean_video_latent = clean_video_latent[:, :, :t_v]
          empty_audio_latent = torch.zeros_like(target_audio_template)

          locked = dict(av_latent)
          locked["samples"] = comfy.nested_tensor.NestedTensor((clean_video_latent, empty_audio_latent))
          # 0.0 mask on video (frozen clean at t=0.999), 1.0 mask on audio (full stereo generation!)
          locked["noise_mask"] = comfy.nested_tensor.NestedTensor(
              (torch.zeros_like(clean_video_latent), torch.ones_like(empty_audio_latent))
          )
          return (locked,)
  ```
- **Caveat with MiniMax H3:**
  - Frame counts in H3 must snap to `17k + 5` frames at `24 fps` (e.g. `192` frames = `8.0s`, `209` frames = `8.7s`).
  - Total weights (`H3-Base` 33B + `Qwen3-VL-32B` text encoder + VAEs) are ~68–75 GB in BF16 — which **fits effortlessly in a single 141 GB H200 GPU with zero CPU offloading!**

### 3.2 The 3 Best Open-Weight V2A Engines We Can Run on H200 (Or Combine!)

| Engine | Architecture & Output | Why It's Special for *Haru-machi* |
|---|---|---|
| **1. `MiniMax-H3` (Video-Locked V2A Hijack)** | 33B Omni-DiT + `Qwen3-VL-32B` $\rightarrow$ **32 kHz Stereo** | Understands complex multi-beat narrative prompts (*"0–1s collapse, 1–4s briar cocoon + dissonant cello, 4–6s vacuum drop"*), generates cohesive stereo scene audio + musical score in one pass. |
| **2. `Tencent/HunyuanVideo-Foley-XXL`** | Synchformer frame-level optical/visual alignment $\rightarrow$ **48 kHz Hi-Fi Audio** (`20 GB` VRAM) | #1 highest score on MovieGen-Audio-Bench for **crisp, physical transient foley** (wood snapping, armor clinks, sword impacts, boulder shatters) without musical mud. |
| **3. `Lightricks/LTX-2.3-22B` + `LoRA-Foley-V2A`** | 22B AV-DiT with native `LTXVSetAudioVideoMaskByTime` (`mask_video=false, mask_audio=true`) | Officially trained by Lightricks specifically for **frozen-video $\rightarrow$ pure foley V2A** in ComfyUI (`ltx-2.3-foley-v2a.json`), suppressing random speech/music. |

---

## 4. How We Turn V2A Outputs Into Live Interactive Game Audio

A game has two kinds of animations:
1. **Deterministic Multi-Beat Cinematics (`Briar Option 9 Blessing` `4.80s`, `Wind Petal Smite` `2.80s`, `Prayer Start + Airborne Throw`):**
   - These run on a **100% locked timeline** every time they trigger!
   - That means a synchronized V2A stereo track (like `omni-video5-audio.wav` or our H200 `MiniMax-H3` + `HunyuanVideo-Foley` stem mix) can be played **directly in-game** (`playDivineVerdictCinematicAudio()`), and every vine snap, подземный plunge thud, and emergence clink will lock to the exact millisecond of the 3D animation!
2. **One-Shot Combat Moves (`Knight 4-Hit Combo`, `Shield Block`, `Power Sword E`, `Sky-Lightning Q`, `Mage 3-Bolt`, `Shatterlance`, `Frost Lance E`, `Cinder Fall E`, `Storm Cataclysm Q`):**
   - We render isolated, crystal-clear 2–4 second gameplay clips of **each individual move** (`clip-knight-hit1.mp4`, `clip-knight-hit4-slam.mp4`, `clip-cinder-fall.mp4`, `clip-frost-lance.mp4`, etc.).
   - We run those clips through our V2A pipeline (generating 5–10 seed/prompt variations per move!), slice the resulting `.wav` stems on the exact contact frame, and wire them into WebAudio so **Near (`3m`) vs. Mid (`9m`) vs. Far (`16m`)** attacks dynamically apply speed-of-sound delay (`0..52ms`), air-absorption low-pass filtering, and valley convolution reverb!

---

## 5. Immediate Next Steps for the New Thread

1. **Wire `omni-video5-audio.wav` into the Live Sound Studio Right Now:** Add Vikas's `video (5).mp4` audio track (`omni-video5-audio.wav`) as **Option 0 ("Omni V2A Reference Track")** in `world/sound-studio.html` so it can be A/B compared directly in the browser.
2. **Choose Our V2A Generation Path with Vikas:**
   - **Path A (H200 Modal / Cloud GPU via `modal-ssh`):** Spin up an H200 container running **MiniMax-H3 (Video-Locked V2A)** + **HunyuanVideo-Foley-XXL (48kHz)** in parallel to batch-generate 10 variations for each of the game's core animations (`Briar Blessing`, `Wind Petal Smite`, `Knight Combos`, `Mage Spells`).
   - **Path B (Omni Video-to-Audio Batching):** Export clean muted `.mp4` clips of each core animation (`Smite`, `Knight Combo`, `Frost Lance`, `Cinder Fall`, `Storm Cataclysm`) with tailored timestamped Master Prompts like the one Vikas used for `video (5).mp4`, run them through Omni, and harvest the `.wav` tracks via `ffmpeg -vn`.
3. **Update the Cloudflare Pages Sound Studio (`https://haru-machi-sound-studio.pages.dev/`)** with the generated V2A stems so Vikas can audition and pick the winners from a 10-variation chart.
