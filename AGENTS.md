# AGENTS.md — Mandatory Operating Contract for All Agents & Subagents

> **STOP AND READ FIRST:** Before exploring, planning, writing code, or critiquing anything in this repository, every agent and subagent MUST read these four documents in order:
> 1. [`SOUL.md`](file:///C:/Users/silen/projects/kilo-3d-kit/SOUL.md) — The game vision, hardware targets (`RX 6700` Desktop + `Xiaomi Pad 7` Tablet), romantic Gemini Live voice-judged mechanics ("Artorious, God of Love"), expanded valley + toroidal boundary wrap rule, and the strict **5-Stage Build Order**.
> 2. [`METHODOLOGY.md`](file:///C:/Users/silen/projects/kilo-3d-kit/METHODOLOGY.md) — The non-negotiable 3D blockout rule, truly blind `/10` critic protocol (never prime critics, inspect PNGs before code), and 2-Pass Parallel Subagent Asset Workflow.
> 3. [`GIT-DISCIPLINE.md`](file:///C:/Users/silen/projects/kilo-3d-kit/GIT-DISCIPLINE.md) — Clean root structure, git worktree isolation, atomic commit checkpoints, and plan tracking.
> 4. [`docs/superpowers/plans/2026-10-29-haru-machi-coop-continuation.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/plans/2026-10-29-haru-machi-coop-continuation.md) — The active step-by-step continuation plan and current state on disk.

---

## Non-Negotiable Hard Bans

1. **BANNED CODE:** Never read, import, or copy code from `C:\Users\silen\Downloads\world 1` or `_archive/legacy-game/src/world.js`.
2. **BANNED ENVIRONMENT PROPS:** Never use `library/kenney-*` or `library/kaykit-dungeon` prop GLBs for houses, trees, rocks, or village scenery.
3. **CHARACTERS & MOTION RULE:** Player characters come from `library/kaykit-adventurers` only. Enemies come from `library/kaykit-skeletons` and downloaded CC0 rigged glTF packs. All characters and enemies must use **100% native diverse skeletal animations**—never procedural bone-wiggling.
4. **VFX REFERENCE:** Spell and miracle VFX in Stage 4 must meet a cinematic quality bar. Use `_archive/legacy-game/src/{ice-lance-vfx,glacial-crown-vfx,thunder-vfx}.js` and `docs/experiments/2026-09-16-vfx-libraries.md` (`three.quarks` `0.16.0` + post-processing bloom) as reference craft.
5. **BLIND CRITICS:** Any critic subagent must inspect rendered PNGs via `view_file` **before** reading source code, must never be given the previous critic's report or self-praising prompts, and must never be reused across rounds.
