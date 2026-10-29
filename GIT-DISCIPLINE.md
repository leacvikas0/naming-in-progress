# GIT-DISCIPLINE.md — Git, Worktrees & Project Organization Rules

> **Mandatory Reading for Every Agent:** Because this is Vikas's long-term side project that he returns to whenever he wants to build and have fun, the workspace must stay self-documented, clean, and recoverable at any point in time.

---

## 1. Clean Workspace Architecture

Only active project files live at the repository root:

| Path | Purpose |
|---|---|
| [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md) | Vision, 5-stage build sequence, romantic voice-judged mechanics, and locked vs. open design choices |
| [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md) | Blockout-first protocol, blind `/10` critic rules, and 2-pass parallel subagent asset workflow |
| [`GIT-DISCIPLINE.md`](file:///C:/Users/silen/projects/kilo-3d-kit/GIT-DISCIPLINE.md) | Git commit, branch, worktree, and documentation hygiene (this file) |
| [`AGENTS.md`](file:///C:/Users/silen/projects/kilo-3d-kit/AGENTS.md) | Entry instructions forcing every spawned agent to read `SOUL.md`, `METHODOLOGY.md`, and `GIT-DISCIPLINE.md` first |
| `world/` | The clean-sheet 3D scene map, blockout (`world/blockout.html`), and isolated 2-pass asset modules (`world/assets/{houses,flowers,terrain,characters,vfx}/`) |
| `house3d/` | Reference Tudor cottage procedural kit (`materials.js`, `textures.js`, `parts.js`, `house.js`) |
| `library/` & `catalog/` | Local CC0 KayKit character/skeleton GLB packs (`kaykit-adventurers`, `kaykit-skeletons`) |
| `docs/` | Specs (`docs/superpowers/specs/`), Implementation Plans (`docs/superpowers/plans/`), Mood References (`docs/refs/`), and Technical Experiments (`docs/experiments/`) |
| `.worktrees/` | Git worktrees for isolated feature/subagent branches (gitignored) |
| `_archive/` | All legacy dungeon/prototype folders (`_archive/legacy-game/`, `_archive/legacy-prototypes/`). Note: `_archive/legacy-game/src/*-vfx.js` is preserved as a read-only shader reference for Stage 4 VFX |

**Rule:** Never dump scratch scripts, temporary screenshots, or experimental one-off HTML files into the repository root.

---

## 2. Git Worktrees for Parallel Subagents & Features

When running parallel subagents or multi-file feature stages that could conflict, isolate work using Git worktrees or strict directory sandboxes:

1. **Subagent Native Workspace Isolation:**
   - When invoking subagents via `invoke_subagent` that modify shared paths, set `Workspace: "share"` or `Workspace: "branch"`, OR create a git worktree under `.worktrees/<stage-or-asset>`:
     ```powershell
     git worktree add .worktrees/asset-houses -b feat/asset-houses
     ```
2. **Per-Asset Directory Sandbox (Within a Single Checkout):**
   - When 3 asset builders run concurrently on separate asset families, each subagent is strictly restricted to `world/assets/<asset-id>/` and must use an ephemeral port (`server.listen(0, '127.0.0.1')`) for its Playwright screenshot runner so parallel runs never collide.
3. **Merging Back:**
   - A worktree or asset module is merged/committed to the main branch **only** after its Pass 2 `verify.mjs` passes with zero console errors and the lead agent completes visual sign-off (`view_file` on `shots/pass2/*.png`).

---

## 3. Atomic Commit & Checkpoint Discipline

Never leave half-finished work uncommitted at the end of a session:

1. **Commit at Every Stage Gate:**
   - `feat(map): ...` — When the 3D blockout / expanded map passes its blind critic gate and user sign-off.
   - `feat(asset-<name>): ...` — When an asset module completes Pass 1 + Pass 2 (`CRITIQUE-AND-SCOPE.md`, `verify.mjs`, `shots/pass2/`).
   - `feat(characters): ...` — When the KayKit heroes & enemy rigs pass native animation verification.
   - `feat(vfx): ...` — When a cinematic spell/miracle VFX module passes its 2-pass visual gate.
   - `feat(coop): ...` — When Cloudflare Worker / Durable Object / Gemini Live voice mechanics pass integration tests.
2. **Living Continuation Plan:**
   - Every time a task or pass completes, check off its `[x]` box in [`docs/superpowers/plans/2026-10-29-haru-machi-coop-continuation.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-10-29-haru-machi-coop-continuation.md) before committing so Vikas can open the plan months later and see the exact state in 5 seconds.
