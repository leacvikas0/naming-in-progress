# How to Use the Haru-machi V2A Game-SFX Pipeline (MiniMax H3)

> **NOTE FOR AGENTS:** This file contains everything you need to prepare gameplay videos, write prompts, run the H200 Video-to-Audio (V2A) generator without timeouts, and apply the Game-SFX post-processing chain. **Do not read [`why-it-works-avoid-reading-without-user-asking.md`](file:///C:/Users/silen/projects/kilo-3d-kit/sfx-foley/why-it-works-avoid-reading-without-user-asking.md) unless the user explicitly asks for the research history or mathematical proofs.**

---

## 1. Golden Rules Checklist (Read Before Running Anything)

1. **Always Inspect the Input Video First (`view_file`):**
   - Never feed a raw Playwright `recordVideo` `.webm` directly into MiniMax H3. Playwright's `recordVideo` captures `1.2s–2.9s` of white/cream loading screen at the start of `page.goto()`.
   - Either capture frames deterministically via `seek(t)` + `page.screenshot()` after `window.__WORLD_READY__` is true, or trim off the loading screen with `ffmpeg -ss <start_sec>` and verify Frame `0` is inside the 3D scene.
2. **Exact Resolution & Frame Count (`832×480` @ `24 fps`, `17k + 5` frames):**
   - **Resolution:** Always use **`832×480`** (`26×32` by `15×32`). Both width and height must be exact multiples of `32`. Never use `1280×720` (`720/32 = 22.5` causes a rounding mismatch between `ref_video` and `target_video`) or waste compute on higher resolutions since we only keep the audio track.
   - **Frame Count (`17k + 5` grid at `24 fps`):** Must be **`124` (`5.17s`), `141` (`5.88s`), `158` (`6.58s`), `175` (`7.29s`), or `192` (`8.00s`)**. Never use `<124` frames (shorter clips clip the audio waveform).
3. **Locked Model & Sampler Settings:**
   - **Checkpoint:** Undistilled Base Model (`minimax_h3_ref2va_pruned_int8_convrot.safetensors`). **Do not use LoRAs** (PDD, SMD, HyperFlow).
   - **Steps & Sampler:** **`16` steps**, `euler` sampler, `simple` scheduler, `shift_video = 12.0`, `shift_audio = 4.0`. Do not waste compute on `32` or `50` steps.
   - **Guidance:** **`CFGGuider` at `cfg = 1.8`** with the mandatory 6-section **Game-SFX Negative Prompt** (see Section 3). Never use `BasicGuider` (`CFG = 1.0`) for game SFX.
   - **50-Layer Video KV-Cache:** Enabled (`forward_cached` in [`world/tools/modal_h3_v2a_runner.py`](file:///C:/Users/silen/projects/kilo-3d-kit/world/tools/modal_h3_v2a_runner.py)). Builds the cache once per video clip on Step 0 (`~16.1s`), then generates each 16-step `CFGGuider` variation in `~60s` (`~30s` without CFG).

---

## 2. Step-by-Step Video Preparation

### Option A: Deterministic Frame Capture from Live Game (Recommended for Spells/Animations)
Capture exact `832×480` frames at `24 fps` (`124` frames = `5.17s`) using `seek(t)` so there is zero loading screen and exact frame timing:

```javascript
// Example: Capturing 124 frames (5.17s @ 24fps) at 832x480
const context = await browser.newContext({ viewport: { width: 832, height: 480 } });
// ... wait for window.__WORLD_READY__ ...
for (let f = 0; f < 124; f++) {
  await page.evaluate((frameIdx) => {
    const t = Math.max(0, (frameIdx - 6) / 24.0); // 0.25s pre-cast silence
    window.__WORLD__.coopSystem.vfxKit.frostLance.seek(t);
  }, f);
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
  fs.writeFileSync(path.join(tmpDir, `f_${String(f).padStart(4, '0')}.jpg`), buf);
}
// Encode with ffmpeg: -framerate 24 -c:v libx264 -crf 17 -pix_fmt yuv420p -an
```

### Option B: Trimming an Existing `.webm` Recording
If trimming an existing `.webm`, trim past the loading screen (`-ss`) and pad/cut to an exact `17k + 5` frame count (`124`, `141`, `158`, or `192`):

```powershell
ffmpeg -y -ss 1.55 -i world/shots/videos/03-cinder-fall-lifecycle.webm `
  -vf "fps=24,scale=832:480:flags=lanczos,tpad=stop_mode=clone:stop_duration=2.0" `
  -frames:v 141 -c:v libx264 -crf 18 -pix_fmt yuv420p -an clean_cinder_fall_141f.mp4
```

Upload the clean `.mp4` to the Modal volume `minimax-h3-models`:
```powershell
$env:PYTHONIOENCODING='utf-8'
python -m modal volume put minimax-h3-models "path/to/clean_clip_124f.mp4" "/inputs/clean_clip_124f.mp4" --force
```

---

## 3. How to Prompt MiniMax H3 for Punchy, Non-Glassy Game SFX

### Core Prompting Principles for Game Combat SFX
1. **Use the Official 6-Section `ref-en.txt` Schema** (`subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music: N/A`).
2. **Game SFX $\neq$ Movie Scene (Zero Filler):**
   - Never ask for *"quiet outdoor air"*, *"eerie cold stillness"*, *"cooling steam"*, or *"soft mist sighing"* in between or after attacks.
   - Explicitly write **`Complete silence.`** before the cast (`00:00.000-00:00.220`) and **`Complete silence.`** immediately after the impact finishes (`00:01.400-00:05.166`).
3. **Physical Material Vocabulary (How to Get Bass + Elemental Bite Without Glassy Static):**
   - **BANNED WORDS (Trigger `8–16 kHz` white-noise static or synth drones):** *"fine sand, dry leaves scattering, brittle glass shards, high-pitched chime, hollow tunnel hum, cinematic, visceral"*.
   - **FOR ICE ATTACKS (`Frost Lance`, `Shatterlance`):** Combine **low-end punch** (*"heavy sub-bass impact boom, concussive low-end bass drop"*) with **real mid-frequency ice physics** (*"thick frozen lake-ice sheet cracking and splitting open under tension, rapid flash-freeze solid ice crystallization crunch, heavy ice-axe cleaving solid block ice"*). Do not replace ice with *"dirt/stone landslide"*.
   - **FOR FIRE / METEOR (`Cinder Fall`):** *"tight descending fireball whoosh -> earth-shaking sub-bass explosion boom and heavy volcanic rock boulders smashing on stone"*.
   - **FOR LIGHTNING (`Storm Lance`):** *"punchy sub-bass thunder clap, sharp high-voltage lightning whip-crack, and dark obsidian stone spikes splitting open"*.

### Positive Prompt Template
```text
subject_definitions:
<Subject 1> is the combat arena in <Video 1>.
<Subject 2> is the erupting wall of thick blue glacier ice spikes in <Video 1>.
<Video 1> is the source video for the target video edit.

summary:
[video editing] The target video is an edited version of <Video 1>. It adds a heavy sub-bass boom and a sharp, unmistakable frozen lake-ice cracking and splitting sound on the initial eruption, followed by complete silence.

retention_analysis:
<Subject 1> (appears throughout): fully_preserved - the arena and environment are retained.
<Subject 2> (appears throughout): fully_preserved - the visual effect timing and geometry are retained.
<Video 1> (cut and pacing structure): fully_preserved - the camera framing and timing are retained 1:1.

detailed_description:
The target video is in a 3D CG animated style.

[Shot 1, 00:00.000-00:00.220] Complete silence before the attack.

[Shot 1, 00:00.220-00:01.400] As <Subject 2> erupts upward, a heavy sub-bass impact boom hits at the exact same moment as the loud, biting whip-crack of a thick frozen lake-ice sheet splitting open under tension and solid blocks of clear ice crunching and locking into place.

[Shot 1, 00:01.400-00:05.166] Complete silence with zero wind, zero mist, and zero rumble.

overall_soundscape:
A deep sub-bass impact boom combined with thick frozen lake-ice cracking, splitting, and solid ice blocks crunching on the initial eruption only. No ambient wind, no mist, no sound after the impact, no dialogue.

non_diegetic_music:
N/A
```

### Mandatory Negative Prompt Template (`CFGGuider` at `cfg = 1.8`)
Always encode this negative prompt through Qwen3-VL with the same `minimax_refs` (`<Video 1>`) and pass it to `CFGGuider.execute(model, pos_cond, neg_cond, 1.8)`:

```text
subject_definitions:
<Subject 1> is the arena in <Video 1>.
<Subject 2> is the effect in <Video 1>.
<Video 1> is the source video.

summary:
[video editing] Noisy ambient movie scene with wind hiss, mist, dull mud landslide, and lingering rumble at the end.

retention_analysis:
<Subject 1>: fully_preserved
<Subject 2>: fully_preserved
<Video 1>: fully_preserved

detailed_description:
The target video has continuous wind noise, mist hissing, room tone, white noise static, glassy high-frequency ringing, dull dirt landslide, and a second rumble or sound after 2.0 seconds.

overall_soundscape:
Ambient wind, mist hiss, room tone, white noise, radio static, sound at the end, speech, dialogue.

non_diegetic_music:
Background music, synthesizer pad, organ drone, brass.
```

---

## 4. Controlled Game-SFX Post-Processing (`polish_game_sfx`)

Every raw waveform decoded from `minimax_h3_audio_vae_fp32.safetensors` (`32 kHz` stereo) runs through `polish_game_sfx()` in [`world/tools/modal_h3_v2a_runner.py`](file:///C:/Users/silen/projects/kilo-3d-kit/world/tools/modal_h3_v2a_runner.py#L120-L157):

1. **`+4.5 dB` Sub-Bass Punch (`<135 Hz` with soft `tanh` saturation):** Extracts `<135 Hz` energy and adds `0.68 * np.tanh(sub * 2.2)` so every spell hits with deep chest weight without clipping.
2. **Texture-Preserving `5,600 Hz` Ultrasonic Roll-Off:** Uses an 8th-order smooth roll-off (`1 / (1 + (f / 5600)^8)`). This keeps **100% of the `100 Hz – 5,600 Hz` physical texture** (ice crack, frost crunch, lightning snap, wood/stone impact) intact while stripping `>6 kHz` Audio VAE ultrasonic hiss. *(Never low-pass at `2.2 kHz`, which destroys mid-high texture.)*
3. **Visual-Synced Gameplay Silence Gate (`gate_start_s` $\rightarrow$ `gate_end_s`):** Applies a clean exponential decay to `0.0` digital silence right after the active spell impact finishes (`1.45s–2.05s`), guaranteeing zero tail rumble when visual elements sink or fade out.

---

## 5. How to Run Long / Multi-Variation Batches Without Hitting the `600s` CLI Timeout

The tool harness enforces a hard `600s` timeout on synchronous `run_command` calls. To run 15–30 variations without ever timing out:

1. **Keep the Resume-Skip Check Enabled in `run_spell_worker`:**
   ```python
   pending_variations = [v for v in variations if not (out_dir / f"{v['name']}.wav").exists()]
   ```
   Every variation calls `vol_outputs.commit()` immediately after saving, so completed files are never regenerated.
2. **Launch via `Start-Process -WindowStyle Hidden` + `schedule` Timer:**
   ```powershell
   $env:PYTHONIOENCODING='utf-8'
   Start-Process -FilePath "python" `
     -ArgumentList "-m","modal","run","world/tools/modal_h3_v2a_runner.py" `
     -RedirectStandardOutput "qa-review/divine-verdict/h3-tests/modal_bg.log" `
     -RedirectStandardError "qa-review/divine-verdict/h3-tests/modal_bg_err.log" `
     -WindowStyle Hidden
   ```
   - `Start-Process` returns in `<1 second` (`exit code 0`), so the `600s` command timeout can never kill the run.
   - Use the `schedule` tool (`DurationSeconds=240`) to wake up, inspect `modal_bg.log`, verify `python -m modal container list` is empty, download the `.wav` and `_game_mux.mp4` files, and auto-open them in VLC.

---

## 6. Catalog of Generated Game-SFX Stems in [`stems/`](file:///C:/Users/silen/projects/kilo-3d-kit/sfx-foley/stems)

| Category | Stem Name | Duration | Description |
| :--- | :--- | :---: | :--- |
| **Frost Lance (`1`)** | `frost_v1_lake_ice_split.wav` | `5.17s` (active `0.2–1.6s`) | Sub-bass boom + thick frozen lake-ice sheet splitting (`"KRRR-ACK!"`) + solid ice blocks |
| **Frost Lance (`1`)** | `frost_v2_flash_freeze_crunch.wav` | `5.17s` (active `0.2–1.6s`) | Deep bass shockwave + rapid flash-freeze crystallization crunch & snow crust snap |
| **Frost Lance (`1`)** | `frost_v3_glacier_cleave_shatter.wav` | `5.17s` (active `0.2–1.6s`) | Concussive sub-drop + heavy ice-axe cleaving solid block ice |
| **Frost Lance (`1`)** | `frost_v4_cryo_shockwave_bite.wav` | `5.17s` (active `0.2–1.6s`) | Tight sub-bass vacuum implosion thud + biting ice-sheet fracture crack |
| **Frost Lance (`1`)** | `frost_v5_avalanching_ice_wall.wav` | `5.17s` (active `0.2–1.6s`) | Earth-shaking low bass boom + deep glacier-ice groan & sharp crack |
| **Shatterlance (`2`)** | `shatter_v1_ice_railgun_detonate.wav` | `5.17s` (2-beat `0.25–1.8s`) | Crisp ice shards locking in mid-air $\rightarrow$ massive sub-bass railgun boom & glacier shatter |
| **Shatterlance (`2`)** | `shatter_v2_cryo_spear_artillery.wav` | `5.17s` (2-beat `0.25–1.8s`) | Tight frost crystal charge $\rightarrow$ deep artillery bass slam & frozen lake-ice whip-crack |
| **Shatterlance (`2`)** | `shatter_v3_glacier_javelin_crush.wav` | `5.17s` (2-beat `0.25–1.8s`) | Solid ice blocks grinding into spear $\rightarrow$ concussive sub-bass shockwave & block-ice cleave |
| **Shatterlance (`2`)** | `shatter_v4_subzero_sniper_crack.wav` | `5.17s` (2-beat `0.25–1.8s`) | Fast crystal facet snap-lock $\rightarrow$ supersonic air whip, deep sub-bass boom & ice fracture |
| **Shatterlance (`2`)** | `shatter_v5_heavy_ice_breaker.wav` | `5.17s` (2-beat `0.25–1.8s`) | Deep glacier compression creak $\rightarrow$ chest-hitting bass boom & solid ice explosion |
| **Cinder Fall (`3`)** | `cinder_v1_magma_meteor_slam.wav` | `5.88s` (2-beat `0.0–2.0s`) | Tight descending fireball whoosh $\rightarrow$ earth-shaking sub-bass explosion & volcanic boulder smash |
| **Cinder Fall (`3`)** | `cinder_v2_heavy_mortar_impact.wav` | `5.88s` (2-beat `0.0–2.0s`) | Fast mortar flame drop $\rightarrow$ concussive deep bass slam & granite boulder shatter |
| **Cinder Fall (`3`)** | `cinder_v3_volcanic_boulder_crush.wav` | `5.88s` (2-beat `0.0–2.0s`) | Roaring fire dive $\rightarrow$ deep sub-bass shockwave & rock-on-rock crushing impact |
| **Cinder Fall (`3`)** | `cinder_v4_siege_catapult_blast.wav` | `5.88s` (2-beat `0.0–2.0s`) | Fast air-and-fire whip $\rightarrow$ explosive low-end bass boom & stone slab fracture |
| **Cinder Fall (`3`)** | `cinder_v5_molten_anvil_strike.wav` | `5.88s` (2-beat `0.0–2.0s`) | Compact flame dive $\rightarrow$ chest-hitting low-frequency slam & lava rock split |
| **Storm Lance (`4`)** | `storm_v1_thunder_whip_crack.wav` | `5.17s` (active `0.2–1.4s`) | Punchy sub-bass thunder clap + high-voltage lightning whip-crack & obsidian spike split |
| **Storm Lance (`4`)** | `storm_v2_plasma_spear_shock.wav` | `5.17s` (active `0.2–1.4s`) | Concussive low-end bass shockwave + crisp electric arc snap & stone fracture |
| **Storm Lance (`4`)** | `storm_v3_chain_lightning_slam.wav` | `5.17s` (active `0.2–1.4s`) | Deep sub-bass thunder thud + 3 rapid electrical arc snaps & rock crunch |
| **Storm Lance (`4`)** | `storm_v4_fulgurite_rail_strike.wav` | `5.17s` (active `0.2–1.4s`) | Heavy sub-bass drop + sharp transformer arc crack & volcanic glass split |
| **Storm Lance (`4`)** | `storm_v5_tempest_bolt_detonate.wav` | `5.17s` (active `0.2–1.4s`) | Close-range lightning bolt snap + chest-hitting thunder boom & ground fracture |
| **Core Scenes** | `00_briar_blessing_resurrection.wav` | `8.00s` | Pure foley Briar Blessing: cloth drop, dry wooden branches creaking/snapping, deep earth thump, silence pause, emerging footsteps |
| **Core Scenes** | `01_divine_smite_sub_plus_warm_wind.wav` | `5.17s` | Deep `<180 Hz` sub-bass vacuum drop at `0.9s` + warm wind & petal erosion (`1.0–3.4s`) |
| **Core Scenes** | `02_knight_sword_combos.wav` | `5.88s` | 4 separated steel-on-wood sword slashes + 360° spinning frost whirlwind cleave |
| **Core Scenes** | `03_mage_normal_bolts.wav` | `5.17s` | 4 crisp projectile launch-and-ice-crack impacts against the wooden post |
| **Core Scenes** | `06_couples_ultimate_cataclysm.wav` | `5.88s` | Simultaneous boulder thud + glacier crack followed by rapid spinning sword slashes |
| **Core Scenes** | `07_valley_watermill_and_breeze.wav` | `5.17s` | Shot 1 rushing waterfall & creaking watermill (`0.0–2.6s`) $\rightarrow$ Shot 2 gentle valley breeze (`2.6–5.17s`) |
