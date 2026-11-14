# Argon × Hydrogen Swarm Master Plan (v2 — Post-Audit): Clean Sword/Dragon Video Stock, Multi-DSP Foley Audition & Live Gameplay Polish

**Date:** 2026-11-13
**Lead Planner, Orchestrator & Critical Verifiers (`Argon`):** `custom-gemini-4-argon` (High Thinking — Lead Planning, Architecture, & All Blind Video/Audio/Code Verification)
**Fast Execution Workhorse Pool (`Hydrogen`):** `custom-gemini-4-hydrogen-xhigh` (Extra-High Thinking — Codebase Research, Coding, Video Capture, Modal GPU Execution, & Stall Monitor)
**Quality Gate:** `Hydrogen` workhorses research, code, capture video, and run Modal batches; **`Argon` Verifiers** critically inspect the rendered videos, audio stems, and diffs on a `/10` scale (looping `Hydrogen` until `Argon` scores $\ge 8.0 / 10$).

---

## 1. Swarm Operating Architecture & Non-Colliding File Ownership

### 1.1 Strict `Argon` vs `Hydrogen` Role Split
- **`Argon` (`custom-gemini-4-argon` — Lead Planner & High-Bar Critical Verifier):**
  1. **`coordinator` (Me — Lead Planner & Orchestrator):** Owns high-level planning, next-step strategy, task decomposition, and direct collaboration with Vikas.
  2. **Critical Review & Verification Agents (`plan-critic-motion`, `plan-critic-audio`, `video-verifier`, `code-verifier`):** Always pinned to **`Argon`**. Whenever a video is recorded, audio is processed, or code is written by a `Hydrogen` workhorse, an **`Argon` Verifier** inspects the actual rendered `.mp4`, contact sheet, audio waveform/metrics, and code diff to score it `/10`.
- **`Hydrogen` (`custom-gemini-4-hydrogen-xhigh` — The Fast, Responsive Workhorse for 90% of Volume):**
  1. **Codebase Research Scouts:** Fast parallel exploration of files, shaders, and animation tracks.
  2. **Coding & Implementation (`stock-author-03`, `stock-author-04`, `dsp-v2a-author`, `audition-ui-author`, `gameplay-sfx-author`):** Writes and refines the JS/Python code in isolated `workspace: "share"` branches.
  3. **Recording & Capturing Videos:** Runs headless browser/Playwright + `ffmpeg` capture scripts (`capture-pure-sword-preview.mjs`, `capture-dragon-fire-ice-preview.mjs`) and generates contact sheets.
  4. **Running Modal GPU Jobs & CPU DSP Batches:** Launches `run_100_modal.py`, monitors Modal containers, downloads lossless `_raw.wav` stems, and runs the 5-preset CPU DSP matrix.
  5. **Monitoring Bee (`monitor`):** Pinned to **`Hydrogen`** so background stall-checking never wastes `Argon` capacity.

### 1.2 Explicit File Ownership & Workspace Matrix (Zero File Collisions)

| Worker Roster Name | Model | Role Type | Workspace | Owned Files / Scope | Verification Gate |
|---|---|---|---|---|---|
| `coordinator` | **`Argon`** | **Lead & Planner** | `inherit` | Master Plan & Swarm Orchestration | Direct alignment with Vikas |
| `plan-critic-motion` | **`Argon`** | **Critical Verifier (Video & Motion)** | `inherit` | *Read-Only Verifier* (`sfx-foley/videos/*`, `world/assets/vfx/*`) | Audits Plan & rendered `.mp4` videos at `\ge 8 FPS` (`\ge 8.5/10` gate) |
| `plan-critic-audio` | **`Argon`** | **Critical Verifier (Audio & Codebase)** | `inherit` | *Read-Only Verifier* (`sfx-foley/harness/*`, `sfx-foley/audition/*`) | Audits V2A Cache, DSP Math, Stems & UI Code (`\ge 8.5/10` gate) |
| `monitor` | **`Hydrogen`** | **Monitoring Bee** | `inherit` | *Stall Monitor (`swarm_monitor`)* | Pings stalled workers on the board |
| `stock-author-03` | **`Hydrogen`** | **Coding & Video Capture Workhorse** | `share` | `world/assets/vfx/sword-vfx.js`, `world/assets/characters/index.js`, `sfx-foley/harness/capture-pure-sword-preview.mjs` | Fixes 3 visual flaws & re-records `03_knight_pure_sword_and_dodge.mp4`; verified by **`Argon`** (`plan-critic-motion`) |
| `stock-author-04` | **`Hydrogen`** | **Coding & Video Capture Workhorse** | `share` | `sfx-foley/harness/capture-dragon-fire-ice-preview.mjs` | Codes & records `04_knight_dragon_fire_and_ice_sword.mp4`; verified by **`Argon`** (`plan-critic-motion`) |
| `dsp-v2a-author` | **`Hydrogen`** | **Coding & Modal GPU Workhorse** | `share` | `sfx-foley/harness/dsp_presets.py`, `sfx-foley/harness/run_100_modal.py`, `sfx-foley/harness/build_100_manifest.py` | Codes DSP & runs Modal V2A batch; verified by **`Argon`** (`plan-critic-audio`) |
| `audition-ui-author` | **`Hydrogen`** | **Coding Workhorse (UI)** | `share` | `sfx-foley/audition/index.html`, `sfx-foley/audition/styles.css`, `sfx-foley/audition/app.js` | Codes sample-locked 5-stem WebAudio mixer; verified by **`Argon`** (`plan-critic-audio`) |
| `gameplay-sfx-author` | **`Hydrogen`** | **Coding & Gameplay Capture Workhorse** | `share` | `world/src/audio/combat-sfx.js`, `world/assets/audio/combat/*` | Wires winning stems & records 3-Beat Melee video; verified by **`Argon`** (`plan-critic-motion`) |

---

## 2. Phase 1 — Clean Video Stock Capture & Blind Visual QA (`sfx-foley/videos/`)

> **Non-Negotiable Pre-GPU Gate:** Zero Modal H100 GPU compute may be spent on Clip `03` or Clip `04` until the captured `.mp4` and `12 FPS` contact sheets pass BOTH:
> 1. An independent blind `Hydrogen` visual/motion critic scoring **$\ge 8.5 / 10$** (inspecting rendered frames at $\ge 8\text{ FPS}$ before reading code), AND
> 2. **Vikas's direct visual sign-off.**

### 2.1 Clip `03`: Pure Sword + Side-Dodge (`sfx-foley/videos/03_knight_pure_sword_and_dodge.mp4`)
- **Round 1 Blind Audit Score (`plan-critic-motion` `#5`):** `7.2 / 10` (Front-3/4 angle and `0.3s–0.4s` quaternion stumble fix passed, but 3 visual flaws held it below `8.0/10`).
- **Mandatory Fixes Required on Clip `03` Before Re-Capture (`stock-author-03`):**
  1. **Fix `combo4` Thrust Ribbon Orb Artifact (`4.167s–4.417s`, frames `100–106`):**
     - *Root Cause:* In `world/assets/vfx/sword-vfx.js:1388-1415`, `isThrust` builds a wide spiral wing (`thrustSpan = 0.78`) that curls `Melee_1H_Attack_Stab` into a floating `~0.8m` circular metallic disc/blob beside the Knight's right hand.
     - *Fix:* Clamp `thrustSpan <= 0.16` and taper the thrust geometry strictly forward along `_bladeDir` as a narrow piercing lance streak (`width = 0.14m -> 0.02m` tip) with zero lateral spiral loop.
  2. **Eliminate Upper-Right Dark Curved Sky Artifact During `Dodge_Left` Pan (`5.417s–6.917s`, frames `130–166`):**
     - *Root Cause:* When the camera pans left to follow `Dodge_Left`, the outer valley perimeter ring / cliff boundary mesh (`perimeter` or sky dome horizon skirt) enters the upper-right frustum above the mountain.
     - *Fix:* In `sfx-foley/harness/capture-pure-sword-preview.mjs`, inspect and hide any outer perimeter boundary ring or horizon skirt mesh that projects into the upper sky during the `±1.8m` lateral dodge pan, or keep the camera `lookAt` yaw locked within `±0.06 rad` so the background mountain framing never clips the sky boundary.
  3. **Smooth `combo2`/`combo3` Post-Strike Recovery (`83ms -> 180ms`) & `Dodge_Left` Footwork:**
     - *Root Cause:* In `world/assets/characters/index.js` (`stabilizeCombatRootMotion`), the cubic Hermite blend window after `strikeEnd` (`0.53s` for `Slice_Diagonal`, `0.67s` for `Chop`) transitions back to the rest guard pose too abruptly (`~83ms` = 2 frames at 24fps), and `Dodge_Left` plays at a high `timeScale` (`1.85`) that finishes the step early and glides in a crouched pose.
     - *Fix:* Widen the post-strike Hermite recovery ramp in `stabilizeCombatRootMotion` to `0.22s` (`5–6` frames at 24fps) and set `Dodge_Left` / `Dodge_Right` capture `timeScale = 1.25` over the `0.48s` lateral displacement so the feet actively step throughout the dodge.
- **Exact Synchronized Choreography Timeline (`8.00s` = `192` frames `@ 24fps`, `832x480`, matching `capture-pure-sword-preview.mjs`):**
  - `0.00s – 0.25s` (Frames `0–5`): Calm front-3/4 combat ready stance (`cam offset = (-1.35m, +1.48m, -4.45m)`, `fov = 40°`).
  - `0.25s – 1.50s` (Frames `6–35`): `combo1` (`Melee_1H_Attack_Slice_Horizontal`, active cleave `0.40s–0.65s`, smooth recovery `0.65s–1.50s`).
  - `1.50s – 2.75s` (Frames `36–65`): `combo2` (`Melee_1H_Attack_Slice_Diagonal`, active cleave `1.70s–1.98s`, smooth recovery `1.98s–2.75s`).
  - `2.75s – 4.00s` (Frames `66–95`): `combo3` (`Melee_1H_Attack_Chop`, active cleave `3.05s–3.38s`, smooth recovery `3.38s–4.00s`).
  - `4.00s – 5.33s` (Frames `96–127`): `combo4` (`Melee_1H_Attack_Stab` grounded power thrust, active pierce `4.18s–4.52s`, smooth recovery `4.52s–5.33s`).
  - `5.33s – 6.50s` (Frames `128–155`): `Dodge_Left` lateral step-dodge (`5.33s–5.81s` active step, `5.81s–6.50s` guard settle).
  - `6.50s – 7.50s` (Frames `156–179`): `Dodge_Right` lateral step-dodge (`6.50s–6.98s` active step, `6.98s–7.50s` guard settle).
  - `7.50s – 8.00s` (Frames `180–191`): Clean front-3/4 ready stance hold.

### 2.2 Clip `04`: Dragon, Fire Sword & Ice Sword Showcase (`sfx-foley/videos/04_knight_dragon_fire_and_ice_sword.mp4`)
- **File Ownership:** `sfx-foley/harness/capture-dragon-fire-ice-preview.mjs` (`stock-author-04`).
- **Exact 3D Spatial Bounds of Dragon VFX (`world/assets/vfx/ultimate-vfx.js`):**
  - `playDragonSlash` (`lines 1130–1147`, duration `0.72s` + wake sparks `0.66s` = `1.38s` total): Coiled dragon erupts from the Knight and sweeps **forward `+4.80m` (`+5.87m` snout tip)** along `Knight.yaw`, `±1.45m` lateral (`2.90m` width), `y <= 2.14m`.
  - `playKnightAwakening` (`lines 1149–1182`, `[Q]` Twin-Element Eclipse Ultimate, duration `1.25s` + spark burst at `0.72s + 0.66s = 1.38s` total): Twin solar+rime dragons sweep **forward `+6.20m` (`+7.42m` snout tip)** along `Knight.yaw`, `±2.05m` lateral (`4.10m` width), `y = 0.28m..3.00m`.
- **Oblique `61.7°` Front-3/4 Cinema Camera Spec (Perspective-Depth Verified Across All Dragon Extremes — Round 3):**
  - **Coordinate Basis (`Knight` at `(x_0, y_0, z_0)` facing unit forward vector $\mathbf{f} = (\sin\psi, 0, \cos\psi)$ and right vector $\mathbf{r} = (\cos\psi, 0, -\sin\psi)$):**
    $$\mathbf{p}_{\text{cam}} = \mathbf{p}_{\text{Knight}} + 4.20\,\mathbf{f} + 7.80\,\mathbf{r} + (0, 2.20, 0)$$
    $$\mathbf{p}_{\text{look}} = \mathbf{p}_{\text{Knight}} + 3.20\,\mathbf{f} + (0, 1.25, 0), \quad \text{FOV}_y = 50^\circ, \quad \text{Aspect} = \frac{832}{480} = 1.733$$
  - **Exact 3D Perspective-Depth Frustum Proof ($\mathbf{c}_z \approx -0.126\,\mathbf{f} - 0.984\,\mathbf{r}$, $\text{half\_w}/z = 0.808$, $\text{half\_h}/z = 0.466$):**
    - **Knight (`0 f, 0 r`):** $z_{\text{cam}} = 8.15\text{ m}$ ($\text{half\_w} = 6.58\text{ m}$), $x_{\text{cam}} = -3.17\text{ m}$ (`-48%` — cleanly framed on the left third of the screen at a `61.7°` front-3/4 angle).
    - **`[E]` Dragon Snout (`+5.87 f, +0.35 r`):** $z_{\text{cam}} = 7.13\text{ m}$ ($\text{half\_w} = 5.76\text{ m}$), $x_{\text{cam}} = +2.59\text{ m}$ (`+45%` right — ample `55%` margin).
    - **`[Q]` Twin-Dragon Snout (`+7.42 f, +1.55 r`):** $z_{\text{cam}} = 5.75\text{ m}$ ($\text{half\_w} = 4.65\text{ m}$), $x_{\text{cam}} = +3.97\text{ m}$ (`+85%` right — `15%` clean margin inside the right viewport edge even at closest lateral approach).
    - **Nearest Lateral Flank (`+0.75 f, +2.05 r, y = 3.0m`):** $z_{\text{cam}} = 6.06\text{ m}$ ($\text{half\_h} = 2.83\text{ m}$), zero top or side clipping.
- **Explicit Harness State Reset Protocol:**
  - Before each elemental beat in `capture-dragon-fire-ice-preview.mjs`, explicitly reset `campaignLoop.combatHeroes.Knight.skillCd = 0`, `ultCd = 0`, `qEnergy = 100`, and explicitly set `selectedElement` / `breathingStyle` (`'fire'` / `'solar'` for Phase A; `'ice'` / `'rime'` for Phase B; `'eclipse'` for Phase C) so cooldowns (`18s` `[E]`, `24s` `[Q]`) never block the staged sequence.
- **Un-Choked Choreography Timeline (`11.00s` = `264` frames `@ 24fps`, `832x480`):**
  - `0.00s – 0.50s` (Frames `0–11`): Front-3/4 ready stance in sunlit meadow.
  - `0.50s – 2.20s` (Frames `12–52`, `1.70s` window): **Hinokami Sunfire Awakening + Solar Dragon Slash (`skill` / Fire `[E]`, `style: 'solar'`):** Full `0.72s` solar dragon sweep + `0.66s` ember dissipation + `0.32s` breathing settle.
  - `2.20s – 3.50s` (Frames `53–83`, `1.30s` window): **Fire Sword `combo1` (`Slice_Horizontal`, `solar`)** + full fire ribbon follow-through.
  - `3.50s – 4.85s` (Frames `84–115`, `1.35s` window): **Fire Sword `combo2` (`Slice_Diagonal`, `solar`)** + full solar arc follow-through.
  - `4.85s – 6.55s` (Frames `116–156`, `1.70s` window): **Glacial Tide Awakening + Rime Ice Dragon Slash (`skill` / Ice `[E]`, `style: 'rime'`):** Full `0.72s` crystalline ice dragon surge + `0.66s` frost shard dissipation + `0.32s` settle.
  - `6.55s – 7.90s` (Frames `157–188`, `1.35s` window): **Ice Sword `combo3` (`Chop`, `rime`)** + full frost trail follow-through.
  - `7.90s – 10.00s` (Frames `189–239`, `2.10s` window): **Twin-Element Eclipse Ultimate (`ultimate` / `[Q]`, `style: 'eclipse'`):** Spin (`0.38s`) -> Cross-Slash 1 (`0.34s`) -> Cross-Slash 2 (`0.42s`) + `playKnightAwakening` twin solar+rime dragons (`1.38s` total with spark burst) + `0.72s` post-climax settle.
  - `10.00s – 11.00s` (Frames `240–263`, `1.00s` window): Final breathing guard stance & clean ember/frost fadeout.

---

## 3. Phase 2 — Uncontaminated V2A Caching, 5-Preset Causal DSP & Sample-Locked Audition (`sfx-foley/`)

### 3.1 Mathematically Invariant Video KV-Cache & Lossless Stem Pipeline (`run_100_modal.py`)
1. **Uncontaminated Video+Ref-Only KV-Cache Bake (`plan-critic-audio` `#4` Axis A Fix #1):**
   - *Bug in v1:* During `not state["cache_built"]`, `flash_attn_func(q, k, v, causal=False)` ran bidirectional attention over `[text, ref, video, audio]`, contaminating layers `1..49` cached video K/V with Variation #1's prompt and noise seed.
   - *Fix in v2:* Build `kv_cache` in a dedicated **1-pass pre-bake step before the variation loop** where the token sequence contains **only `[ref_latent, video_latent]`** (`s_f = 0`, zero text/audio tokens, asserting `VISUAL_COND_TIMESTEP >= 1.0` and skipping `dit.final_layer` during the `s_f = 0` pre-bake). Because video and reference latents attend exclusively to each other across all 50 DiT blocks, `k_buf` and `v_buf` (`n_stat` tokens) are **100% mathematically invariant** across all prompts, negative prompts, CFG scales, and random seeds!
   - *VRAM Scaling by Clip Length:* For `832x480` video at `24fps`, `n_stat` scales linearly with frame count (`141f` = `5.875s` $\rightarrow$ `~382 MB`; Clip `03` `192f` = `8.00s` $\rightarrow$ `~520 MB`; Clip `04` `264f` = `11.00s` $\rightarrow$ `~715 MB` — all well within H100 `80 GB` VRAM).
2. **Pre-Cached `refined_text_states` & Shared `audio_embed` (`Axis A Fix #2`):**
   - Pre-compute `dit.token_refiner(dit.condition_proj(ts))` **once** per unique positive/negative prompt before the 16-step Euler loop (eliminating 16–32 redundant `token_refiner` evaluations per clip), and compute `audio_patch_proj(audio_x)` once per Euler step (sharing it across positive and negative passes).
3. **Clip-Affinity Batching & Lossless Master Stem (`Axis A Fixes #3–4`):**
   - Parameterize `run_100_modal.py` with `--video`, `--manifest`, dynamic `n_frames`, and per-clip `ACTIVE_WINDOWS` / `SILENCE_WINDOWS`.
   - Shard by **clip affinity** (Worker 1 runs all Clip `03` prompt/sampler variations; Worker 2 runs all Clip `04` prompt/sampler variations — zero redundant Qwen3-VL reloads or KV-cache rebuilds).
   - Never run DSP-only variations on GPU: save each raw AudioVAE output as a **lossless 32 kHz 24-bit/float WAV (`<id>_raw.wav`)** and generate all 5 DSP presets locally on CPU in `< 0.15s`.

### 3.2 Multi-Preset Causal IIR & Active-Window Loudness-Matched DSP (`sfx-foley/harness/dsp_presets.py`)
To eliminate loudness bias, Gibbs pre-ringing, and mono phase cancellation (`plan-critic-audio` `#4` Axis B fixes):
- **Universal Rules Across All Presets (`DSP-0..4`):**
  1. **Causal Minimum-Phase IIR Only:** All filtering uses `scipy.signal.butter(..., output='sos')` and Robert Bristow-Johnson (RBJ) biquad sections via causal `scipy.signal.sosfilt` (never zero-phase `sosfiltfilt` or brick-wall FFT bins that cause pre-ringing before sword transients, and removing the legacy `run_100_modal.py:96` right-edge step-click bug).
  2. **M/S Low-End Anchor (`DSP-1..4`):** Convert stereo $(L, R) \to (M, S) = (\frac{L+R}{2}, \frac{L-R}{2})$, apply a 2nd-order `120 Hz` Butterworth HPF to the Side channel $S$, and convert back to $(L, R)$ so uncorrelated AudioVAE sub-bass never phase-cancels on `Xiaomi Pad 7` speakers.
  3. **Active-Window ITU-R BS.1770-4 K-Weighted Loudness Normalization + True-Peak Limiter (`ALL 5 Presets`):** Measure integrated K-weighted loudness **strictly over the union of `ACTIVE_WINDOWS`** (ignoring silent pause windows so sparse clips are not over-boosted), normalize every preset (`DSP-0..4`) to **`-18.0 LUFS` active** ($\pm 0.1\text{ LU}$), and pass through a `4x` polyphase-oversampled, `2ms`-lookahead True-Peak Limiter ceiling at **`-1.0 dBFS`**.

- **The 5 Switchable Presets (generated per variation from `<id>_raw.wav`):**
  1. **`DSP-0: Raw Reference (`raw`)`**
     - Untouched AudioVAE frequency/dynamic response, loudness-matched to `-18.0 LUFS` active (`-1.0 dBFS` true-peak ceiling) for level-matched A/B testing.
  2. **`DSP-1: Tail-Preserving Action Envelope Gate + Sub-Cut (`clean_gate`)`**
     - `75 Hz` 2nd-order Butterworth HPF + `120 Hz` M/S Side-HPF.
     - Smooth action-window expander: opens `25ms` before `w_start` (`[w_start - 0.025, w_start]` raised-cosine attack), holds at `0.0 dB` through **`w_end + 180ms`** (preserving steel ring and fire/ice decay tails), and releases over **`220ms` raised-cosine** to a `-12.0 dB` floor (bridging any inter-window gap `< 0.35s` so side-dodges never pump room tone).
  3. **`DSP-2: Crisp Blade Transient Shaper (`transient_snap`)`**
     - `60 Hz` 2nd-order HPF + `120 Hz` M/S Side-HPF.
     - Dual-envelope differential SPL transient designer: fast envelope ($\tau_{\text{atk}} = 0.8\text{ ms}, \tau_{\text{rel}} = 15\text{ ms}$) minus slow envelope ($\tau_{\text{atk}} = 35\text{ ms}, \tau_{\text{rel}} = 120\text{ ms}$), soft-gated above `-34 dBFS` (so quiet hiss is never boosted), smoothed with a `12ms` gain filter up to `+3.5 dB` max attack snap.
     - RBJ presence bell `+2.2 dB` at `3.6 kHz` ($Q = 1.2$) + `12.5 kHz` 2nd-order Butterworth LPF (taming 32 kHz VAE upper-band breathiness).
  4. **`DSP-3: Warm Ghibli Cinema Foley (`ghibli_warm`)`**
     - `55 Hz` 2nd-order HPF + `120 Hz` M/S Side-HPF.
     - RBJ body bell `+1.5 dB` at `170 Hz` ($Q = 0.7$, leather/cloth/footwork weight) + mud cut `-1.5 dB` at `320 Hz` ($Q = 1.0$).
     - Dynamic de-harshing bell at `6.2 kHz` ($Q = 0.9$, attenuating up to `-3.0 dB` when `4.8–7.5 kHz` sidechain RMS exceeds `-22 dBFS`) + **`4x` polyphase-oversampled** soft saturation $y = \tanh(1.15 x) / \tanh(1.15)$.
  5. **`DSP-4: Elemental Dragon Dynamic Contour (`elemental_contour`)`**
     - `38 Hz` 4th-order (`24 dB/oct`) Butterworth sub-protector HPF + `120 Hz` M/S Side-HPF.
     - Low-band soft-knee compressor (`< 140 Hz` **LR4** Linkwitz-Riley 4th-order split via two cascaded 2nd-order Butterworth LPF/HPF so LP+HP sum flat at `0°` phase difference without a `140 Hz` notch; `2.5:1` ratio above `-16 dBFS`, `10ms` attack / `80ms` release) + `+2.0 dB` `75 Hz` low-shelf (anchoring Dragon fire combustion roar without clipping).
     - `+1.8 dB` `5.2 kHz` RBJ high-shelf ($Q = 0.8$, crystalline ice-shatter air) + `12.5 kHz` 2nd-order LPF + `250ms` tail-preserving gate.

### 3.3 Sample-Locked 5-Stem Web Audio Mixer in Audition Studio (`sfx-foley/audition/`)
To allow Vikas to switch between `DSP-0..4` and A/B variations at the **exact same video millisecond with zero stutter** (`plan-critic-audio` `#4` Axis C fixes):
1. **Single Continuous `<video muted>` + 5 Synchronized `AudioBufferSourceNode`s:**
   - The `<video>` element is kept muted and plays continuously; switching DSP presets (`DSP-0..4` via pill bar or hotkeys `5 / 6 / 7 / 8 / 9` and `[ / ]`) **never** calls `video.load()` or resets `video.currentTime`.
   - When a variation is selected, all 5 level-matched stems (`raw`, `clean_gate`, `transient_snap`, `ghibli_warm`, `elemental_contour`) are decoded via `audioCtx.decodeAudioData()` into cached `AudioBuffer`s and started in sample-accurate lockstep (`sourceNode.start(when, offset)`) feeding 5 `GainNode`s.
   - Switching from Preset $i$ to Preset $j$ executes an Equal-Power / exponential `5ms` crossfade (`gain_i.setTargetAtTime(0, now, 0.005)`, `gain_j.setTargetAtTime(1, now, 0.005)`) — **zero click, zero video freeze, `< 1ms` timestamp lock** (with clean `AudioBufferSourceNode` respawning on `seek`/`pause`/`beat-loop` and a `250ms` drift watchdog re-anchoring if drift exceeds `20ms`).
2. **Pre-Cached `[A]` / `[B]` Buffers for Instant `[C]` Compare:**
   - Pinning `[A]` and `[B]` on the same clip keeps both variations' `AudioBuffer` sets decoded in memory so pressing `[C]` crossfades between Variation A and Variation B on the live running video without reloading `<video>`.
3. **Dynamic Multi-Clip (`03` & `04`) Selector & Beat Grid:**
   - Replace hardcoded `141` frames and 4 static beat buttons in `index.html` / `app.js` with a top Clip Selector (`Clip 03: Pure Sword & Dodge (8.0s, 192f)` vs `Clip 04: Dragon, Fire & Ice (11.0s, 264f)`) that dynamically renders `.beat-buttons-grid` from the active clip's `beats` array in `manifest.json`.
   - Fix `updateCatalogRowNoteIndicator` (`app.js:1127`) to update the single row's DOM badge in-place instead of re-rendering the 100-row table on every keystroke.

---

## 4. Phase 3 — Live Game Integration & Mandatory Gameplay Video QA (`world/src/audio/combat-sfx.js`)

1. **Human Audition Sign-Off Gate:**
   - Once Vikas auditions the Clip `03` and Clip `04` stems in `http://127.0.0.1:4174/` and picks the winning variation + DSP preset for each combat beat (`combo1..4`, `Dodge_Left/Right`, Fire `[E]` Dragon Slash, Ice `[E]` Dragon Slash, Eclipse `[Q]` Awakening), `gameplay-sfx-author` slices the winning stems by beat window (with `15ms` onset pre-roll and `220ms` cosine tail fade) into `world/assets/audio/combat/` and wires them into `world/src/audio/combat-sfx.js`.
2. **Mandatory Live Gameplay Video QA (`METHODOLOGY.md` Rule 9 & `judging-gameplay`):**
   - Record a live `.webm`/`.mp4` gameplay clip covering the **3-Beat Close-Quarters Visceral Combat Audit** (Beat 1: Basic `combo1–4` slashes & side-dodges against skeleton warriors; Beat 2: Player damage feedback; Beat 3: Fire/Ice `[E]` & `[Q]` Dragon slashes).
   - A fresh blind `Hydrogen` gameplay critic (`judging-gameplay`) inspects the recorded video + audio at `6–8 FPS` before final sign-off.
