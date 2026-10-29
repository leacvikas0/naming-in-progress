# Concurrent map and spell tasks

The user manages two DeepSeek sessions. Files are shared immediately; do not
reset, stash, revert or overwrite another session's changes. This is ownership
coordination, not an instruction to implement either task in this document.

| Owner | Exclusive runtime files |
|---|---|
| Map / Sunpetal Vale | world.js, main.js, balance.js, vale-scenery.js, optional vale-layout.js |
| Spell / Frost Lance | player.js, enemies.js, fx.js, ice-lance-config.js, ice-lance-vfx.js, optional ice-lance-logic.js |

All paths above are under game/src/. Other hero behavior and existing public
function signatures stay compatible. The map agent may update CONTRACT.md's
environment prose. Spell agent records its event/helper additions in its own
handoff docs for the map owner/Codex to consolidate later; do not both edit it.

Spell tests belong in game/tests/ice-lance.test.mjs; run directly with Node,
without editing package.json. Preserve the existing test harness patterns.
Map progress stays in game/handoff/PROGRESS.md; spell progress stays in
game/handoff/ice-lance/PROGRESS.md. Each agent owns its own evidence files.

The spell agent must not tune main's frame loop/renderer, scene lighting, terrain,
or balance.js. A small spell-only config helper is explicitly allowed while the
map owner is editing balance.js. Likewise private spell helpers imported by
player/enemies/fx are a narrow allowed exception to the frozen module import rule;
peer gameplay modules still may not import each other. Keep the shared event bus.

Neither agent should run broad formatters or commit all working-tree changes.
Use an already-running server if one exists; otherwise choose a free local port,
serve the repository root, and record that port. Never kill another session's
server or manipulate its browser tab. Distinguish concurrent changes when
reporting failures. Once both tasks finish, Codex reviews their combined behavior.
