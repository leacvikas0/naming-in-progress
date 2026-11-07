# AGENTS.md — Mandatory Operating Contract for All Agents & Subagents

> **STOP AND READ FIRST:** Before exploring, planning, writing code, or critiquing anything in this repository, every agent and subagent MUST read these four documents in order:
> 1. [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md) — The game vision, hardware targets (`RX 6700` Desktop + `Xiaomi Pad 7` Tablet), romantic Gemini Live voice-judged mechanics ("Artorious, God of Love"), expanded valley + toroidal boundary wrap rule, and the strict **5-Stage Build Order**.
> 2. [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md) — The non-negotiable 3D blockout rule, truly blind `/10` critic protocol (never prime critics, inspect PNGs before code), and 2-Pass Parallel Subagent Asset Workflow.
> 3. [`GIT-DISCIPLINE.md`](file:///C:/Users/silen/projects/kilo-3d-kit/GIT-DISCIPLINE.md) — Clean root structure, git worktree isolation, atomic commit checkpoints, and plan tracking.
> 4. [`docs/superpowers/plans/2026-11-02-haru-machi-locked-master-plan.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-11-02-haru-machi-locked-master-plan.md) — The active locked 5-Wave Master Execution Plan (Zero-Spoiler, Uncontaminated) and verbatim design prompts.
> 5. [`docs/superpowers/plans/2026-10-29-haru-machi-coop-continuation.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-10-29-haru-machi-coop-continuation.md) — Historical stage progression and recovery checklist.

---

## Non-Negotiable Hard Bans

1. **BANNED CODE:** Never read, import, or copy code from `C:\Users\silen\Downloads\world 1` or `_archive/legacy-game/src/world.js`.
2. **BANNED ENVIRONMENT PROPS:** Never use `library/kenney-*` or `library/kaykit-dungeon` prop GLBs for houses, trees, rocks, or village scenery.
3. **CHARACTERS & MOTION RULE:** Player characters come from `library/kaykit-adventurers` only. Enemies come from `library/kaykit-skeletons` and downloaded CC0 rigged glTF packs. All characters and enemies must use **100% native diverse skeletal animations**—never procedural bone-wiggling.
4. **VFX REFERENCE:** Spell and miracle VFX in Stage 4 must meet a cinematic quality bar. Use `_archive/legacy-game/src/{ice-lance-vfx,glacial-crown-vfx,thunder-vfx}.js` and `docs/experiments/2026-09-16-vfx-libraries.md` (`three.quarks` `0.16.0` + post-processing bloom) as reference craft.
5. **BLIND CRITICS (`judging-3d-scenes`):** Any critic or Pass 2 Critic-Fixer subagent MUST first read [`judging-3d-scenes/SKILL.md`](file:///C:/Users/silen/.gemini/antigravity-acp/t3-home/config/skills/judging-3d-scenes/SKILL.md), inspect rendered PNGs via `view_file` **before** reading source code, never be given the previous critic's report or self-praising prompts, and never be reused across rounds.
6. **MANDATORY UI & HUD SKILL (`frontend-design`):** Before designing, editing, or critiquing any UI, game HUD, title/landing screen, modal, or typography (`world/src/ui/*.js`), every agent and subagent MUST first read [`frontend-design/SKILL.md`](file:///C:/Users/silen/.gemini/antigravity-acp/t3-home/config/skills/frontend-design/SKILL.md). Never generate dark MMO/souls-like UI over our sunlit cel-shaded valley, never use AI-generated portrait slop without real 3D character reference renders, and always inspect actual reference screenshots before generating concepts or CSS.

## Code and image retrieval for the assembled world

For code-navigation tasks, the local `vera_gemma` MCP uses EmbeddingGemma 2 Q8. Query with explicit `repo: C:/Users/silen/game-dev/haru-machi`.

- Start assembled-world behavioral searches with `path: ["world/src/*.js", "world/assets/**/*.js", "world/tools/*.mjs"]`, `limit: 5`, and `compact: true`. This prioritizes the assembled world over the blockout and house reference kit. Expand scope deliberately for blockout, house3d, or documentation tasks.
- Use exact search for known symbols, then read current source and follow imports/references before editing. File-level search results are leads, and may point to a related caller rather than the implementation.
- `.veraignore` excludes archived code, asset binaries/caches and the outdated root README. The archive ban in this file applies to all search and indexing tools.
- `gemma_images` has indexed `world/shots/assembled-v2`: search by visual description, then inspect the returned evidence. Images require explicit `index_images` refresh after new captures. Existing screenshots may depict an older source revision.
- The current app is `world/index.html`; run `node world/tools/serve.mjs` (optional `PORT` environment variable). The root package's old game/test commands refer to archived locations; inspect commands before choosing one.
- `window.__WORLD__` exposes scene, renderer, camera, view/shot selection and stats for runtime verification. Screenshots and diagnostics complement source retrieval. A single view or reported FPS does not establish overall quality or hardware performance.
- Read `docs/experiments/2026-10-30-gemma-retrieval.md` for the measured scope, limitations and local diagnostic artifacts. Preserve the mandatory blind-critic workflow above whenever performing visual critique.
