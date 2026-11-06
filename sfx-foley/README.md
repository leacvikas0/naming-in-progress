# `sfx-foley/` — Haru-machi Video-to-Audio (V2A) Game-SFX & Foley Pipeline

> **AGENT ROUTING RULE (READ THIS FIRST):**
> 1. **Need to generate, polish, or wire Game SFX / Foley?** Read **ONLY** [`how-to-use.md`](file:///C:/Users/silen/projects/kilo-3d-kit/sfx-foley/how-to-use.md). It contains the complete operational recipe, video prep rules, prompt & negative-prompt templates, post-processing chain, timeout-proof Modal launch commands, and the catalog of ready-to-use `.wav` stems in [`stems/`](file:///C:/Users/silen/projects/kilo-3d-kit/sfx-foley/stems).
> 2. **DO NOT READ [`why-it-works-avoid-reading-without-user-asking.md`](file:///C:/Users/silen/projects/kilo-3d-kit/sfx-foley/why-it-works-avoid-reading-without-user-asking.md) unless the user explicitly asks about the underlying math, research experiments, KV-cache derivations, or spectral benchmarks.** This keeps your context window lean and fast.

---

## Directory Contents

| Path | Purpose | Who Should Read It |
| :--- | :--- | :--- |
| [`how-to-use.md`](file:///C:/Users/silen/projects/kilo-3d-kit/sfx-foley/how-to-use.md) | **Actionable Production Guide:** Video prep (`832×480`, `24fps`, `17k+5` frames), 16-step Base Model + 50-layer Video KV-Cache + `CFGGuider(1.8)` Negative Prompt recipe, `polish_game_sfx()` DSP chain, and timeout-proof Modal execution. | **All agents doing audio/SFX work** |
| [`why-it-works-avoid-reading-without-user-asking.md`](file:///C:/Users/silen/projects/kilo-3d-kit/sfx-foley/why-it-works-avoid-reading-without-user-asking.md) | **Deep Research & Empirical Benchmarks:** Why H3 sounds glassy out of the box, FFT spectrum tables, local CPU waveform correlations (`98.43%` cache reuse match), `16` vs `32` vs `50` steps, `euler` vs `heun`/`dpmpp_2m`, flow-shift math, and KV-cache internals. | **Only read when the user explicitly asks** |
| [`stems/`](file:///C:/Users/silen/projects/kilo-3d-kit/sfx-foley/stems) | **Ready-to-Use Game-SFX `.wav` Stems & `_game_mux.mp4` Previews:** All 20 creative elemental spell variations (`Frost Lance`, `Shatterlance`, `Cinder Fall`, `Storm Lance`) + core scene/combat stems. | **Game audio engine & VLC audition** |
| [`../world/tools/modal_h3_v2a_runner.py`](file:///C:/Users/silen/projects/kilo-3d-kit/world/tools/modal_h3_v2a_runner.py) | **Production Modal H200 Runner:** Implements the 50-layer post-RoPE Video KV-Cache, `CFGGuider(1.8)` Negative Prompting, `polish_game_sfx()`, and resume-skip batching. | **Runner script** |
