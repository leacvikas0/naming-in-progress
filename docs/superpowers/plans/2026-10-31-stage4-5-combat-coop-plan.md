# Haru-machi Stage 4 & 5 Combat, Opaque VFX Suite, Sword Breathing & Co-Op Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete, rock-solid, visually breathtaking 2-player co-op action RPG experience in `Haru-machi` by morning—featuring Genshin-style PC (`PointerLock`) and Xiaomi Pad 7 (`3:2` Smart Soft-Lock) controls, 4 hardware-opaque Mage spells (`Frost Lance`, `Shatterlance`, `Cinder Fall`, `Storm Lance`), 3 *Demon Slayer*-style Knight Sword Breathing infusions (`Glacial Tide`, `Hinokami Sunfire`, `Thunderclap Wisteria`), 3 physical combo detonations (`Shatterblow`, `Solar Flare`, `Thunderchain`), a 3-Act Day-to-Night valley expedition with pooled Skeleton waves and *The Hollow Sovereign* Shrine Boss, and Cloudflare Worker + local WebSocket co-op sync (`Pachgaon <-> Sonipat`).

**Architecture:** Modular ES-module Three.js (`0.170.0`) client in `world/` backed by hardware-opaque (`transparent: false`), zero-idle-draw VFX systems in `world/assets/vfx/`, a pure-JS testable combat/wave/synergy engine in `world/src/combat/`, and an identical JSON WebSocket room protocol (`/api/room/:code/websocket`) running in both `world/tools/serve.mjs` (zero-dependency `node:crypto` RFC 6455) and `worker/room-do.js` (Cloudflare `CoopRoomDO` Durable Object).

**Tech Stack:** Three.js `0.170.0`, custom GLSL cel/toon shaders sampling `128×128` `NoiseAtlas`, Node.js `http`/`crypto` RFC 6455 WebSocket server, Cloudflare Workers + Durable Objects, Playwright headless Chromium verification, and `judging-3d-scenes` blind visual critics.

**Spec:** [`docs/superpowers/specs/2026-10-31-haru-machi-combat-coop-design.md`](file:///C:/Users/silen/projects/kilo-3d-kit/docs/superpowers/specs/2026-10-31-haru-machi-combat-coop-design.md)

## Global Constraints

- **Universal "Zero Glass" Visual Weight Rule:** Every 3D spell volume (`Frost Lance`, `Shatterlance`, `Cinder Fall`, `Storm Lance`) and sword sheath/debris mesh MUST use `transparent: false, depthWrite: true, side: THREE.FrontSide` (or hard-cutout `alphaTest` cel-eroded ribbons for slash arcs and flame tongues). Never use semi-transparent alpha (`opacity < 1.0`) or washed-out additive meshes.
- **Linear-sRGB Uniforms Under `OutputPass`:** Always pass shader palette colors via `new THREE.Color('#rrggbb')` uniforms; never hardcode raw sRGB `vec3` literals in GLSL.
- **Strict Draw-Call Budget (`tablet <= 48`, `desktop <= 60`):**
  - Every VFX system (`frost-lance`, `shatterlance`, `cinder-fall`, `storm-lance`, `sword-vfx`) MUST set `group.visible = false` when inactive (`0` draw calls when idle).
  - Each new spell (`shatterlance`, `cinder-fall`, `storm-lance`) MUST use `<= 4` `InstancedMesh`es when active.
  - All combat indicators (Ground Telegraph Rings, 3D Overhead Elemental Crests at `y = 2.15m`, Golden Soul Tether, Guiding Petal Markers) MUST share `<= 2` `InstancedMesh`es total.
  - Pooled active enemies MUST be capped at `<= 5` concurrent visible skeletons (`<= 10` draw calls), keeping inactive pool members at `group.visible = false`.
- **Safe Weapon Socket Attachment (`toon-skin.js`):** Guard `rebuildUnifiedCharacterSkin` in `world/assets/characters/toon-skin.js` with `if (obj.userData?.isVfx) return;`, attach the Knight's Blade Sheath Mesh to `knight.equippedWeapons['handSlot.r']` (which already carries `position: [0, 0.04, 0], quaternion: [0, -1, 0, 0]`), and spawn Ukiyo-e Slash Arc Ribbons in world space (`y = 1.05m`, `yaw = knight.yaw`).
- **HUD & Shot Compatibility (`#hud` & `window.__WORLD__`):** Mount 100% of DOM UI inside `#hud` so `window.__WORLD__.toggleHud(false)` hides all UI cleanly for `shoot-world.mjs`. Preserve `window.__WORLD__.setShot(shotId)` and `setView(id)`.

## Review Focus

1. **VFX Idle Draw Leak:** If any new spell or sword slash mesh stays `visible = true` when inactive, `node world/tools/shoot-world.mjs` will exceed `48` tablet draw calls and fail—verified by `world/assets/vfx/verify.mjs` and `world/tools/shoot-world.mjs`.
2. **Weapon Baking Eating Blade Sheath:** Adding a mesh inside `handSlot.r` without `userData.isVfx = true` causes `toon-skin.js` to hide it (`visible = false`) if unified skinning is rebuilt—verified by unit check in `world/assets/vfx/verify.mjs`.
3. **Enemies Spawning Outside Arena Fence or Inside Well/Shrine Obstacles:** Spawn coordinates in `world/src/combat/combat-balance.js` must strictly use `ZONES.arena` `(68, -4)`, `LANDMARKS.pier` `(-42, 8.5)`, `LANDMARKS.well` ring road `r = 9.5..12.5m` around `(0, 0)`, and `ZONES.shrine` `(0, -85.5)`—verified by `world/tools/test-combat-sim.mjs`.
4. **Static Server Without WebSockets:** Opening `world/index.html` under `shoot-world.mjs` (plain HTTP without WebSocket upgrade) must fall back to Solo Wingman mode with `0` console errors—verified by `world/tools/shoot-world.mjs`.
5. **Keybind `1–4` Conflict:** Pressing `1–4` in combat must cast Spells 1–4 rather than triggering `setView()` camera teleports—verified in `world/src/main.js` and `world/tools/test-combat-sim.mjs`.

---

### Task 1: Complete Stage 4 Opaque VFX Suite (`shatterlance.js`, `cinder-fall.js`, `storm-lance.js`, `sword-vfx.js`) & Blind Pass 2 Critique

**Files:**
- Modify: `world/assets/characters/toon-skin.js`, `world/assets/characters/index.js`
- Create: `world/assets/vfx/shatterlance.js`
- Create: `world/assets/vfx/cinder-fall.js`
- Create: `world/assets/vfx/storm-lance.js`
- Create: `world/assets/vfx/sword-vfx.js`
- Modify: `world/assets/vfx/index.js`, `world/assets/vfx/preview.html`, `world/assets/vfx/shoot.mjs`, `world/assets/vfx/verify.mjs`

**Interfaces:**
- Consumes: `getSharedNoiseAtlas()` and `createGlacierCrystalGeometry()` from `world/assets/vfx/frost-lance.js` / `noise-atlas.js`.
- Produces:
  - `createShatterlanceSystem({ scene, getGroundHeight, config })` (`<= 4` opaque `InstancedMesh`es when active, `0` when idle)
  - `createCinderFallSystem({ scene, getGroundHeight, config })` (`<= 4` opaque `InstancedMesh`es when active, `0` when idle)
  - `createStormLanceSystem({ scene, getGroundHeight, config })` (`<= 3` opaque `InstancedMesh`es when active, `0` when idle)
  - `createSwordVfxSystem({ scene, getGroundHeight })` (`attachToKnight(knightChar)`, `setInfusion(style, duration)`, `triggerSwing(swingType, origin, yaw, styleOverride)`, `triggerDetonation(type, pos)`, `seek(timeSeconds, poseConfig)`, `update(dt)`, `clear()`, `dispose()`)
  - Extended `createVfxKit({ scene, getGroundHeight })` in `world/assets/vfx/index.js` exposing all 4 spells + `swordVfx`.

- [ ] **Step 1: Add `userData.isVfx` guard in `world/assets/characters/toon-skin.js` and `cellOverrides` option passthrough in `world/assets/characters/index.js`**
- [ ] **Step 2: Implement `shatterlance.js`, `cinder-fall.js`, `storm-lance.js`, and `sword-vfx.js` (Pass 1 Builder) and wire showcase modes into `world/assets/vfx/preview.html`, `shoot.mjs`, and `verify.mjs`**
- [ ] **Step 3: Capture Pass 1 plates (`node world/assets/vfx/shoot.mjs pass1-suite`) and dispatch a fresh, truly blind Pass 2 VFX Critic-Fixer subagent (`judging-3d-scenes`) to inspect the PNGs before reading code, fix any visual defects, and verify `node world/assets/vfx/verify.mjs`**
- [ ] **Step 4: Commit (`feat(vfx): add opaque shatterlance, cinder-fall, storm-lance, and demon slayer sword breathing vfx`)**

---

### Task 2: Pure Combat Balance, Pooled Enemy Manager, 3-Act Campaign Loop & Headless Sim Test

**Files:**
- Create: `world/src/combat/combat-balance.js`
- Create: `world/src/combat/enemy-manager.js`
- Create: `world/src/combat/campaign-loop.js`
- Create: `world/src/combat/combat-sfx.js`
- Test: `world/tools/test-combat-sim.mjs`

**Interfaces:**
- `combat-balance.js` exports:
  - `HERO_STATS`, `SPELLS` (`frost_lance`, `shatterlance`, `cinder_fall`, `storm_lance`), `BREATHING_STYLES` (`none`, `rime`, `solar`, `tempest`), `DETONATIONS` (`shatterblow`, `solar_flare`, `thunderchain`), `ENEMY_ARCHETYPES`, `ACT_DEFINITIONS` (exact `geography.js` coordinates).
  - Pure functions: `selectSoftLockTarget(origin, forwardYaw, enemies, options)`, `resolveDamageAndMark(enemy, hitSpec)`, `allocateAttackTokens(enemies, maxTokens = 3)`, `createCombatSimulationState()`.
- `enemy-manager.js` exports:
  - `createEnemyManager({ scene, kit, walkableHeightAt, resolveCollisions, onEnemyDamaged, onEnemyKilled, onPlayerHit })` managing the 6-slot pre-allocated Skeleton + Boss Sovereign pool (`max 5 concurrent visible`).
- `campaign-loop.js` exports:
  - `createCampaignLoop({ scene, walkableHeightAt, enemyManager, coopSystem, onActChanged, onSkyTodChanged, onBanner })` + shared 2-`InstancedMesh` combat indicator renderer (Ground Telegraph Rings, 3D Overhead Elemental Crests at `y = 2.15m`, Golden Soul Tether, Guiding Petal Markers).

- [ ] **Step 1: Write `world/tools/test-combat-sim.mjs` testing soft-lock cone acquisition, spell mark + sword infusion, all 3 physical detonations, 3-token enemy cap, Boss Bone Aegis shield break, downed/revive, and full 3-Act progression**
- [ ] **Step 2: Implement `world/src/combat/combat-balance.js`, `enemy-manager.js`, `campaign-loop.js`, and `combat-sfx.js`**
- [ ] **Step 3: Run `node world/tools/test-combat-sim.mjs` and verify 100% pass with 0 errors**
- [ ] **Step 4: Commit (`feat(combat): add 3-act valley expedition, pooled enemy AI, and sword-spell detonation engine`)**

---

### Task 3: Zero-Dependency WebSocket Co-Op Server (`serve.mjs` + Cloudflare `worker/`) & 2-Client Sync Test

**Files:**
- Create: `wrangler.toml`
- Create: `worker/index.js`
- Create: `worker/room-do.js`
- Modify: `world/tools/serve.mjs`
- Create: `world/src/net/coop-client.js`
- Test: `world/tools/test-coop-room.mjs`

**Interfaces:**
- WebSocket endpoint: `/api/room/:code/websocket` supporting `join`, `swap_roles`, `hero_state`, `spell_cast`, `action_event`, `enemy_hit`, and `world_sync`.
- `createCoopClient({ onRoomState, onPeerHeroState, onPeerSpellCast, onPeerAction, onEnemyHit, onWorldSync })` with automatic `connect(roomCode)` and seamless offline/solo fallback.

- [ ] **Step 1: Write `world/tools/test-coop-room.mjs` spinning up `serve.mjs` on an ephemeral port and connecting 2 WebSocket clients (`Knight` + `Mage`) to verify room pairing, role swap, cross-player spell-to-sword infusion, and boss damage sync**
- [ ] **Step 2: Implement `wrangler.toml`, `worker/index.js`, `worker/room-do.js`, RFC 6455 WebSocket upgrade in `world/tools/serve.mjs`, and `world/src/net/coop-client.js`**
- [ ] **Step 3: Run `node world/tools/test-coop-room.mjs` and verify 100% pass**
- [ ] **Step 4: Commit (`feat(coop): add cloudflare durable object room and zero-dep websocket sync`)**

---

### Task 4: Live World Integration, Genshin PC/Pad 7 Controls, & Blind Full-Game Visual Critic Gate

**Files:**
- Modify: `world/index.html`
- Modify: `world/src/touch-hud.js`
- Modify: `world/src/player-controller.js`
- Modify: `world/src/main.js`
- Create: `world/tools/shoot-stage5-gameplay.mjs`

- [ ] **Step 1: Upgrade `world/index.html`, `world/src/touch-hud.js`, `world/src/player-controller.js`, and `world/src/main.js` with Hybrid `PointerLock` camera, `1–4` Spell Deck, `E` Partner Skill, `Q` Resonance Ultimate, Co-Op Room Code/Share Pill inside `#hud`, and deterministic `setShot()` combat poses**
- [ ] **Step 2: Run `node world/tools/shoot-world.mjs` to verify all 8 architectural views, `0` console errors, and `tablet <= 48` / `desktop <= 60` draw calls**
- [ ] **Step 3: Run `node world/tools/shoot-stage5-gameplay.mjs` to capture 8 live gameplay & UI plates across Desktop (`1600×900`) and Xiaomi Pad 7 (`1440×960` `3:2`) in `world/shots/stage5-gameplay/`**
- [ ] **Step 4: Dispatch a fresh, truly blind Stage 5 Gameplay Critic subagent (`judging-3d-scenes`) to inspect `world/shots/stage5-gameplay/*.png` before reading code, fix any visual/UX flaws it flags, re-verify, update `docs/superpowers/plans/2026-10-29-haru-machi-coop-continuation.md`, and commit (`feat(game): complete stage 4-5 combat loop, genshin controls, and coop integration`)**
