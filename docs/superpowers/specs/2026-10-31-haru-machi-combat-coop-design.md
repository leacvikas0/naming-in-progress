# Haru-machi — Stage 4 & 5 Combat, Spells, Sword Breathing & Co-Op Design Spec (Calibrated v2)

**Date:** 2026-10-31
**Author:** Lead Agent (Audited & Calibrated via Independent Architecture Critic Subagent `30a2fa7a1616f153cda4b9a018cf3bb8`)
**Scope:** Complete playable game loop, Genshin-style controls (PC Hybrid PointerLock + Xiaomi Pad 7 Smart Soft-Lock), 4 opaque high-weight Mage spells, 3 *Demon Slayer*-style Knight Sword Breathing infusions, native Haru-machi physical combo detonations, 3-Act Day-to-Night valley progression, and Cloudflare Worker + zero-dependency local WebSocket 2-player co-op (`Pachgaon <-> Sonipat`). *Artorious live voice judgment is deferred to tomorrow's interactive session with Vikas.*

---

## 1. Core Design Philosophy & The "Zero Glass" Visual Law

1. **No Glass, No Ghostly Transparency — 100% Solid Physical Weight:**
   - Every spell volume, crystal spire, railgun spear, volcanic boulder, lightning core, and sword slash ribbon MUST read with **opaque, chiseled physical weight** (`transparent: false, depthWrite: true` on all 3D geometry; hard cel-stepped `alphaTest` / opaque ribbons on sword arcs and fire tongues).
   - Never use semi-transparent alpha (`opacity < 1.0`) or washed-out additive meshes that turn milky over Haru-machi's bright sunlit grass and warm sandy arenas.
   - All VFX shaders sample the shared `128×128` RGBA `NoiseAtlas` (`world/assets/vfx/noise-atlas.js`) with zero per-fragment 3D Simplex noise loops, zero raw sRGB `vec3` literals in GLSL (all colors passed via `new THREE.Color('#rrggbb')` uniforms under `post.js` `OutputPass`), and zero per-frame heap allocations.

2. **Invented for Haru-machi (Unified Mark, Infuse & Detonate Loop):**
   - Instead of copying generic 4-element RPG spreadsheets, Haru-machi uses a crystal-clear, physical 2-step synergy loop between **Her 4 Valley Spells** and **His Soul-Forged Breathing Sword**:
     - **Step 1 (Her Cast / `E: Soul Infuse`):** Casting any of the 4 spells (`1: Frost Lance`, `2: Shatterlance`, `3: Cinder Fall`, `4: Storm Lance`) or tapping `E` applies a **3D Overhead Elemental Crest** (`❄️ Rime-Encased`, `☀️ Sunbranded`, or `⚡ Storm-Tethered` at `y = 2.15m`) to hit enemies for `6s` **AND** sends a `0.65s` golden-elemental surge along the **Soul Tether** into his Knight's blade, igniting his matching **Breathing Style** (`Glacial Tide`, `Hinokami Sunfire`, or `Thunderclap Wisteria`) for `12s`.
     - **Step 2 (His Finisher or Her Railgun Detonates):** Striking a marked enemy with **Knight's `combo3` (3rd-hit chop), `Heavy Breathing Finisher` (`Hold LMB` / `F`), `E` (`Chivalric Intercept`), OR Mage's `2: Shatterlance` railgun** consumes the mark and triggers a **Physical Detonation** (`SHATTERBLOW`, `SOLAR FLARE`, or `THUNDERCHAIN`) dealing `+65` AoE burst damage, breaking 1 layer of Boss **Bone Aegis**, granting `+18%` Heart Resonance, and triggering a `70ms` local animation-mixer hitstop (`mixer.timeScale = 0.05`—zero network clock drift!) + `0.14m` camera punch + flying 3D shrapnel.

---

## 2. Controls & Camera Architecture (PC + Xiaomi Pad 7 `3:2`)

### 2.1 Desktop PC Controls (Vikas — Knight Default, `Tab` to Swap in Solo)
- **Hybrid Mouse-Look Orbit Camera (`PointerLock` + Drag Fallback):**
  - Clicking `#world-canvas` requests `canvas.requestPointerLock?.()` inside a `try/catch`. When locked, `mousemove` rotates `camState.yaw` / `pitch` via `e.movementX / e.movementY`. When unlocked (e.g., after pressing `Alt` / `Esc`, or inside headless Playwright), drag-orbit fallback remains active.
- **Camera-Relative Locomotion (`WASD`):**
  - `W/A/S/D` moves relative to camera `yaw`; character turns smoothly into movement direction and snaps toward camera aim or soft-locked target on attack/cast.
- **Zero-Lag Action Bindings:**
  - `LMB (mousedown)`: Immediately fires **3-Hit Sword Combo** (`combo1 -> combo2 -> combo3`, `22 / 26 / 38 dmg`, `+35%` when Breathing-infused) with `0ms` input delay.
  - `LMB (Hold >= 0.28s)` or `F`: Promotes/chains into **Heavy Breathing Finisher** (`charged` clip — `56 AoE dmg`, detonates any enemy mark).
  - `RMB` or `Shift`: **Dash-Dodge** (`dash` clip — burst movement with `0.30s` i-frames; dodging within `0.25s` of an enemy telegraph landing triggers **Perfect Dodge**: slows the attacking enemy's mixer to `0.30×` for `0.6s`, adds `+20%` Heart Resonance, and empowers the next attack).
  - `E`: **Chivalric Intercept** (`6s CD`) — Warps/lunges toward partner or nearest threat (`up to 9m`), deals `34 AoE dmg` + `3.8m` knockback, detonates marks, and grants both partners a **35 HP Golden Ward Shield** for `6s`.
  - `Q`: **Couples Resonance Ultimate** (`100% Heart Resonance`) — Unleashes a simultaneous **Rime + Solar Cataclysm** (`180 AoE dmg` across `10m`, full party heal, shatters Boss shield).
  - `1 / 2 / 3 / 4`: Casts Spells 1–4 (`Frost Lance`, `Shatterlance`, `Cinder Fall`, `Storm Lance`). When playing as Knight in Solo mode, pressing `1–4` commands your Mage wingman to cast that spell at your target and immediately infuse your sword.
  - `Alt+1..8` (or `<select id="view-select">`): Camera preset switching (freeing `1–4` exclusively for combat spells).

### 2.2 Xiaomi Pad 7 Tablet Controls (Wife — Mage Default, `3:2` Aspect Ratio)
- **Left Floating Dynamic Thumbstick:**
  - Touching anywhere in the bottom-left zone anchors the joystick at the initial touch point; pulling to `>= 78%` engages **Sprint**.
- **Right-Screen Camera Orbit + Gentle Auto-Follow:**
  - Dragging on the right side orbits the camera. While moving via thumbstick without right-side touch drag, `camState.yaw` gently aligns behind movement direction (`1.8 rad/s`).
- **Smart Cone Soft-Lock (`75°` cone, `20m` range):**
  - Tapping any Attack or Spell button automatically acquires the priority enemy inside a `75°` forward cone (or nearest enemy within `8m` attacking either partner).
- **Split Ergonomic Touch Layout (`world/src/touch-hud.js` inside `#hud`):**
  - **Bottom-Right Action Arc (`right: 24px, bottom: 24px`):** Primary **Attack (`82px`, Tap + Hold)** surrounded by **`Dash` (`58px`)**, **`E: Partner Skill` (`62px`)**, **`Jump` (`52px`)**, and **`Q: Ultimate` (`66px`)**.
  - **Bottom-Center-Right 4-Spell Deck (`right: 220px, bottom: 20px`):** Horizontal 4-pill Spell Bar (`1: Frost`, `2: Shatter`, `3: Cinder`, `4: Storm`) with solid color badges, keycap numbers, and cooldown sweeps—usable on both Desktop and Tablet.

---

## 3. Opaque VFX Suite, Sword Breathing & Draw-Call Budget (`world/assets/vfx/`)

### 3.1 Draw-Call & Visibility Contract (`tablet <= 48`, `desktop <= 60`)
- Every VFX system (`frost-lance`, `shatterlance`, `cinder-fall`, `storm-lance`, `sword-vfx`) sets `group.visible = false` when idle (`0 draw calls`).
- Each new spell (`shatterlance`, `cinder-fall`, `storm-lance`) uses **`<= 4` `InstancedMesh`es** when active.
- All combat indicators (Ground Telegraph Rings, Golden Soul Tether, Guiding Petal Markers, and 3D Overhead Enemy Elemental Crests at `y = 2.15m`) share **2 `InstancedMesh`es total**.

### 3.2 The 4 Signature Spells
1. **❄️ `1: Frost Lance` (`world/assets/vfx/frost-lance.js`, `CD: 4.5s`, `42 dmg`, `14.5m`):**
   - Existing 9/10 verified Parted Glacial V-Canyon + 4.5m Cathedral Crown. Applies `❄️ Rime-Encased` + `Glacial Tide` sword infusion.
2. **💎 `2: Shatterlance` (`world/assets/vfx/shatterlance.js`, `CD: 6.0s`, `58 dmg`, `18.0m`):**
   - **4 Opaque `InstancedMesh`es:** (1) 18 spiraling intake crystal shards (`transparent: false`), (2) `3.8m` 7-fluted railgun great-lance with `#8fe3ff` glowing flute seams + shock collar (`transparent: false`), (3) 36 ballistic shatter wedges on impact (`fragInherit = 0.45`, gravity `-19 m/s²`), (4) world-space frost-track & star-fissure ground relief decal. Detonates any marked enemy for **`SHATTERBLOW`** and grants `Glacial Tide` blade.
3. **☀️ `3: Cinder Fall` (`world/assets/vfx/cinder-fall.js`, `CD: 7.0s`, `54 AoE dmg`, `4.2m` radius at up to `16m`):**
   - **4 Opaque `InstancedMesh`es:** (1) Chiseled volcanic basalt asteroid (`radius = 0.85m`, `transparent: false`, `#1f1916` charred stone facets + `#ff6a12 -> #fff3d0` magma cracks), (2) hard-cutout (`alphaTest`) cel-stepped fire-tongue wake plumes, (3) 16 tilted basalt-and-magma crater rim slabs + 24 ballistic cinder rocks, (4) glowing lava-vein tectonic crater decal. Applies `☀️ Sunbranded` + `Hinokami Sunfire` blade.
4. **⚡ `4: Storm Lance` (`world/assets/vfx/storm-lance.js`, `CD: 5.5s`, `46 dmg`, `16m` + 3-target chain):**
   - **3 Opaque `InstancedMesh`es:** (1) 16 braided, camera-aligned jagged lightning ribbons (`transparent: false`, `#2e1065` deep violet border + `#38bdf8` cyan mid + `#fef08a` white-gold core) + chain arcs, (2) 14 solid obsidian-and-gold fulgurite ground spikes (`transparent: false`), (3) radial fulgurite discharge ground scar. Applies `⚡ Storm-Tethered` + `Thunderclap Wisteria` blade.

### 3.3 *Demon Slayer* Sword Breathing & Physical Detonations (`world/assets/vfx/sword-vfx.js`)
- **Blade Sheath Attachment (Safe with `toon-skin.js`):**
  - Attached directly to `knight.equippedWeapons['handSlot.r']` (which already carries the audited `position: [0, 0.04, 0], quaternion: [0, -1, 0, 0]` transform) with `userData.isVfx = true` so `toon-skin.js` never hides or bakes it.
- **World-Space Ukiyo-e Slash Arc Ribbon (`transparent: false` + hard `alphaTest` cel erosion):**
  - Driven in world space at `y = 1.05m`, `yaw = knight.yaw` with deterministic swing-plane tilt (`combo1`: `tiltZ = -0.10`, `combo2`: `tiltZ = +0.58`, `combo3`: `tiltZ = +1.42`, `charged`: `360°` ring `radius = 3.0m`).
  - Three palettes: **Hinokami Sunfire (`solar`)**, **Glacial Tide (`rime`)**, **Thunderclap Wisteria (`tempest`)**, plus crisp steel-wind (`none`).
- **3 Physical Detonation Bursts (`triggerDetonation(type, pos)`):**
  - `shatterblow`: 18 opaque 3D cerulean crystal wedges exploding outward + frost shock ring.
  - `solar_flare`: Upward volcanic magma pillar + 16 burning basalt cinders launching enemies (`vy = 7.5`).
  - `thunderchain`: Radial violet-gold lightning web snapping enemies inward toward the Knight.

---

## 4. Pooled Enemy Manager & 3-Act Valley Expedition (`world/src/combat/`)

### 4.1 Pooled Enemy System (`world/src/combat/enemy-manager.js`)
- Pre-allocates a fixed pool of **6 KayKit Skeleton instances** at boot (`2 Skeleton_Warrior`, `1 Skeleton_Minion`, `1 Skeleton_Rogue`, `1 Skeleton_Mage`, plus `1 Boss Sovereign` scaled `1.42×` with obsidian-crimson-gold `cellOverrides`).
- **Max 5 Concurrent Visible Enemies (`<= 10` draw calls):** Inactive pool slots stay at `group.visible = false` (`0` draws). Waves with `> 5` total enemies spawn remaining enemies from the pool as active ones fall.
- **Max 3 Attack Tokens + Ground Telegraph Rings:** At most 3 enemies can wind up an attack simultaneously; others strafe-orbit at `3.2..4.5m`. Every enemy windup projects an opaque filling telegraph ring on the ground (`0.65s` warning) before damage resolves.

### 4.2 Exact `geography.js` Coordinates for the 3-Act Loop (`world/src/combat/campaign-loop.js`)
1. **Start — Hamlet South Entry / Well Plaza (`(0.0, 14.0)`, `Day`):**
   - Guiding Golden Petal Markers lead east along the road to `Zone C`.
2. **Act I — East Wisteria Combat Ring (`center: (68.0, -4.0)`, `spawnR: 6.0..15.0m`, `Day`):**
   - **Wave 1:** 4 Skeletons (`2 Minions, 2 Warriors`).
   - **Wave 2:** 6 Skeletons (`2 Warriors, 2 Rogues, 2 Mages`, capped at 5 concurrent).
3. **Sunset Interlude — West Millpond Pier (`brazier: (-42.0, 8.5, y = -0.23)`, `Evening Sunset`):**
   - Sky transitions to `evening`. Approaching within `4.5m` of the Pier Sanctuary Brazier heals both partners to `100%`, refills Shield, grants `+50%` Resonance, and unlocks **Empowered Breathing (`+25%` damage)**.
4. **Act II — Twilight Hamlet Plaza Defense (`center: (0.0, 0.0)`, `spawnR: 9.5..12.5m` on cobble ring road, `Evening Dusk`):**
   - **Wave 3 (Twilight Vanguard):** 6 Skeletons (`1 Elite Captain + 3 Warriors + 2 Mages`).
5. **Act III — Starlit North Shrine Boss Duel (`center: (0.0, -85.5, y = 8.0)`, `arenaR <= 12.8m`, `Starlit Night`):**
   - Sky transitions to `night`. **The Hollow Sovereign** (`HP: 1400`, `1.42×` scale) + 2 Royal Guards await before the Shrine Arch (`avoiding pedestal (-5.8, -87.8) and planters (±10.6, -90.8)`).
   - At `50% HP`, the Sovereign raises a 2-layer **Bone Aegis** broken by 2 Physical Detonations (`Shatterblow`, `Solar Flare`, `Thunderchain`, or `Q: Couples Ultimate`).
   - Victory triggers **Dawn Celebration** + **Replay Expedition** button.

---

## 5. Zero-Dependency Local + Cloudflare Workers Co-Op (`worker/` & `world/tools/serve.mjs`)

- **Identical WebSocket Room Protocol (`/api/room/:code/websocket`):**
  - Implemented in `worker/room-do.js` (`CoopRoomDO` for Cloudflare Workers) AND directly in `world/tools/serve.mjs` using Node's built-in `node:crypto` RFC 6455 handshake + frame codec (zero external npm packages required!).
  - Graceful fallback: if the page is opened on a static server without WebSockets (e.g., `shoot-world.mjs`), `coop-client.js` silently stays in **Solo + Smart Wingman AI Mode** with zero console errors.
  - In **Solo / Wingman Mode**, the AI partner automatically follows in formation, attacks nearby skeletons, and casts a rotating spell (`Frost Lance -> Cinder Fall -> Storm Lance -> Shatterlance`) every `4.5s` in combat so your Knight sword stays infused and enemies stay marked for detonations!
