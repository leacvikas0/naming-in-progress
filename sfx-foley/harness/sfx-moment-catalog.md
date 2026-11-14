# Haru-machi / Amarante — Complete Game-SFX Moment Catalog, Mixing Architecture & Action Sprite-Sheet Plan

**Target Pipeline:** MiniMax H3 Video-to-Audio (`minimax_h3_ref2va_pruned_int8_convrot.safetensors`, `16` steps, `euler` + `simple`, `shift_video = 12.0`, `shift_audio = 4.0`, `CFGGuider = 1.8`, `polish_game_sfx()` DSP chain)  
**Capture Format:** `832×480` (`26×32` by `15×32`), `24.0 fps`, `17k + 5` exact frame counts (`124f = 5.17s`, `141f = 5.88s`, `158f = 6.58s`, `192f = 8.00s`), 0% HUD overlay, Frame 0 inside sunlit 3D valley.

---

## 1. Codebase Audio Audit & Existing Stems Inventory (`sfx-foley/stems/`)

### 1.1 Codebase Audio Hook Audit
An audit of `world/src/combat/combat-sfx.js`, `world/src/player-controller.js`, `world/src/combat/campaign-loop.js`, `world/src/combat/enemy-manager.js`, `world/src/combat/commune-client.js`, `world/src/verdict-sky-choreo.js`, and `world/src/main.js` reveals the following runtime sound triggers:

| Source Module | Function / Event | Current Implementation | Target V2A Upgrade |
| :--- | :--- | :--- | :--- |
| `combat-sfx.js:117` | `playSwordSlash(comboIndex, breathingStyle)` | WebAudio bandpass noise + sine/triangle oscillator | Sliced one-shots from `03_knight_basic_sword_combos` & `04_knight_glacial_and_sunfire_breathing` |
| `combat-sfx.js:156` | `playHeavyFinisher(breathingStyle)` | WebAudio bandpass noise + low triangle drop | `combo4` whirlwind & dragon slash finishers from `03` & `04` |
| `combat-sfx.js:184` | `playBreathingIgnition(breathingStyle)` | WebAudio noise sweep + 3-note triangle chord | Elemental sword ignition whoosh + crystal/flame lock from `04` |
| `combat-sfx.js:211` | `playSpellCast(spellId)` | WebAudio synth approximations | Ready-to-use 20 stems in `sfx-foley/stems/{frost,shatter,cinder,storm}_v1..v5.wav` + hold-charge loop from `06` |
| `combat-sfx.js:259` | `playDetonation(detonationId)` | Sine sub-drop + filtered noise | `Shatterblow`, `Solar Flare`, and `Thunderchain` cross-element bursts from `07_coop_elemental_detonations` |
| `combat-sfx.js:299` | `playShieldChime()` | 3-note sine arpeggio (`D5-A5-D6`) | Physical shield raise, melee/bolt block clang & parry impact from `05`, plus Sacred Stone / Field Heal chimes from `13` |
| `combat-sfx.js:313` | `playPerfectDodge()` | High sine chirp + bandpass noise | Time-dilation crystalline ping + vacuum whoosh from `02_dodge_rolls_and_perfect_dodge` |
| `combat-sfx.js:325` | `playEnemyWindup(kind)` | Synth tone (`heavy`, `area`, `cast`, `melee`) | Archetype-specific telegraphs, attacks & deaths across all 9 enemy/boss rigs (`09`–`12`) |
| `combat-sfx.js:339` | `playPlayerHit()` / `playEnemyHit()` | Single sawtooth/triangle blip | Material-honest blade-to-bone, blade-to-plate, blade-to-flesh impacts & player damage thud (`08`) |
| `combat-sfx.js:347` | `playCouplesUltimate()` | Sub sine drop + C-major triangle chord | Knight `Q` Twin-Element Awakening (`05`), Mage `Q` Starfall Meteor Shower (`06`), & Couples Cataclysm (`06_couples_ultimate_cataclysm.wav`) |
| `commune-client.js:485` | `playWideSurroundDivineVoice(judgment)` | Haas `14ms` stereo widener + `185Hz` warmth shelf + `2.4s` cathedral convolver | Layered over Crimson Rose Ring bloom (`13`), Mode A Field Heal (`13`), Mode B Briar Resurrection (`00_briar_blessing_resurrection.wav`), or Divine Smite (`01_divine_smite_sub_plus_warm_wind.wav`) |
| `player-controller.js:1840` | `stepLocomotionRates(dt)` & `triggerAction('dash')` | Silent (no footstep or cloth roll audio) | Surface-aware footsteps (`Meadow Grass`, `Cobblestone Plaza`, `Stone Steps`) (`01`) + Knight/Mage dodge rolls (`02`) |

---

### 1.2 Existing Ready-to-Use Stems in `sfx-foley/stems/` (28 `.wav` Stems)

| Category | Stem Filename | Duration | Active Window | Description & In-Game Mapping |
| :--- | :--- | :---: | :---: | :--- |
| **Frost Lance (`1` / Ice `E`)** | `frost_v1_lake_ice_split.wav` | `5.17s` (`124f`) | `0.20s–1.60s` | Sub-bass boom + thick frozen lake-ice sheet splitting + solid ice blocks |
| **Frost Lance (`1` / Ice `E`)** | `frost_v2_flash_freeze_crunch.wav` | `5.17s` (`124f`) | `0.20s–1.60s` | Deep bass shockwave + rapid flash-freeze crystallization crunch |
| **Frost Lance (`1` / Ice `E`)** | `frost_v3_glacier_cleave_shatter.wav` | `5.17s` (`124f`) | `0.20s–1.60s` | Concussive sub-drop + heavy ice-axe cleaving solid block ice |
| **Frost Lance (`1` / Ice `E`)** | `frost_v4_cryo_shockwave_bite.wav` | `5.17s` (`124f`) | `0.20s–1.60s` | Tight sub-bass vacuum implosion thud + biting ice-sheet fracture crack |
| **Frost Lance (`1` / Ice `E`)** | `frost_v5_avalanching_ice_wall.wav` | `5.17s` (`124f`) | `0.20s–1.60s` | Earth-shaking low bass boom + deep glacier-ice groan & sharp crack |
| **Shatterlance (`2` / Hold-LMB)** | `shatter_v1_ice_railgun_detonate.wav` | `5.17s` (`124f`) | `0.25s–1.80s` | Crisp ice shards locking in mid-air $\rightarrow$ massive sub-bass railgun boom |
| **Shatterlance (`2` / Hold-LMB)** | `shatter_v2_cryo_spear_artillery.wav` | `5.17s` (`124f`) | `0.25s–1.80s` | Tight frost crystal charge $\rightarrow$ deep artillery bass slam & lake-ice whip-crack |
| **Shatterlance (`2` / Hold-LMB)** | `shatter_v3_glacier_javelin_crush.wav` | `5.17s` (`124f`) | `0.25s–1.80s` | Solid ice blocks grinding into spear $\rightarrow$ concussive sub-bass shockwave |
| **Shatterlance (`2` / Hold-LMB)** | `shatter_v4_subzero_sniper_crack.wav` | `5.17s` (`124f`) | `0.25s–1.80s` | Fast crystal facet snap-lock $\rightarrow$ supersonic air whip & ice fracture |
| **Shatterlance (`2` / Hold-LMB)** | `shatter_v5_heavy_ice_breaker.wav` | `5.17s` (`124f`) | `0.25s–1.80s` | Deep glacier compression creak $\rightarrow$ chest-hitting bass boom & solid ice burst |
| **Cinder Fall (`3` / Fire `E`)** | `cinder_v1_magma_meteor_slam.wav` | `5.88s` (`141f`) | `0.00s–2.00s` | Descending fireball whoosh $\rightarrow$ earth-shaking sub-bass explosion & boulder smash |
| **Cinder Fall (`3` / Fire `E`)** | `cinder_v2_heavy_mortar_impact.wav` | `5.88s` (`141f`) | `0.00s–2.00s` | Fast mortar flame drop $\rightarrow$ concussive deep bass slam & granite shatter |
| **Cinder Fall (`3` / Fire `E`)** | `cinder_v3_volcanic_boulder_crush.wav` | `5.88s` (`141f`) | `0.00s–2.00s` | Roaring fire dive $\rightarrow$ deep sub-bass shockwave & rock-on-rock crushing impact |
| **Cinder Fall (`3` / Fire `E`)** | `cinder_v4_siege_catapult_blast.wav` | `5.88s` (`141f`) | `0.00s–2.00s` | Fast air-and-fire whip $\rightarrow$ explosive low-end bass boom & stone slab fracture |
| **Cinder Fall (`3` / Fire `E`)** | `cinder_v5_molten_anvil_strike.wav` | `5.88s` (`141f`) | `0.00s–2.00s` | Compact flame dive $\rightarrow$ chest-hitting low-frequency slam & lava rock split |
| **Storm Lance (`4`)** | `storm_v1_thunder_whip_crack.wav` | `5.17s` (`124f`) | `0.20s–1.40s` | Punchy sub-bass thunder clap + high-voltage lightning whip-crack & obsidian split |
| **Storm Lance (`4`)** | `storm_v2_plasma_spear_shock.wav` | `5.17s` (`124f`) | `0.20s–1.40s` | Concussive low-end bass shockwave + crisp electric arc snap & stone fracture |
| **Storm Lance (`4`)** | `storm_v3_chain_lightning_slam.wav` | `5.17s` (`124f`) | `0.20s–1.40s` | Deep sub-bass thunder thud + 3 rapid electrical arc snaps & rock crunch |
| **Storm Lance (`4`)** | `storm_v4_fulgurite_rail_strike.wav` | `5.17s` (`124f`) | `0.20s–1.40s` | Heavy sub-bass drop + sharp transformer arc crack & volcanic glass split |
| **Storm Lance (`4`)** | `storm_v5_tempest_bolt_detonate.wav` | `5.17s` (`124f`) | `0.20s–1.40s` | Close-range lightning bolt snap + chest-hitting thunder boom & ground fracture |
| **Divine Verdicts** | `00_briar_blessing_resurrection.wav` | `8.00s` (`192f`) | `0.00s–4.80s` | Mode B Briar Dome Resurrection: cloth drop, dry wooden branches creaking/snapping, deep earth thump, silence pause, emerging footsteps |
| **Divine Verdicts** | `01_divine_smite_sub_plus_warm_wind.wav` | `5.17s` (`124f`) | `0.85s–3.40s` | Divine Smite (`rose_gommage`): `<180 Hz` sub-bass vacuum drop at `0.9s` + warm wind & 240-petal erosion |
| **Divine Verdicts** | `01_divine_smite_wind_erosion.wav` | `5.17s` (`124f`) | `0.85s–3.40s` | Pure petal wind erosion layer for Divine Smite |
| **Core Combat** | `02_knight_sword_combos.wav` | `5.88s` (`141f`) | `0.20s–5.20s` | Early prototype 4-hit steel-on-wood slashes + spinning frost cleave (upgraded in `03` & `04` below) |
| **Core Combat** | `03_mage_normal_bolts.wav` | `5.17s` (`124f`) | `0.20s–4.60s` | 4 crisp Mage staff bolt launches & ice-crack impacts (`mage_attack1..3`) |
| **Core Combat** | `04_cinder_fall_meteor.wav` | `5.88s` (`141f`) | `0.20s–2.20s` | Base Cinder Fall meteor impact |
| **Core Combat** | `05_storm_and_shatterlance.wav` | `6.58s` (`158f`) | `0.20s–5.80s` | Paired Storm Lance + Shatterlance showcase stem |
| **Core Combat** | `06_couples_ultimate_cataclysm.wav` | `5.88s` (`141f`) | `0.15s–4.80s` | Call-and-Response Couples Ultimate (`performCouplesUltimate`): boulder thud + glacier crack + rapid spinning sword slashes |
| **Ambient Valley** | `07_valley_watermill_and_breeze.wav` | `5.17s` (`124f`) | `0.00s–5.17s` | Shot 1 rushing waterfall & creaking timber watermill (`0.0–2.6s`) $\rightarrow$ Shot 2 gentle valley breeze (`2.6–5.17s`) |

---

## 2. Priority Tiers, Frequency Lanes & Polyphony Mixing Rules

To prevent muddying the mix during 5-enemy strongholds + 2-player co-op spell detonations, every SFX stem is assigned to a strict **Priority Tier**, **Frequency Lane**, and **Voice Polyphony Cap**:

| Priority Tier | Category | Ducking / Sidechain Authority | Frequency Lane (`HPF` / `LPF` / Shelf) | Max Concurrent Voices |
| :---: | :--- | :--- | :--- | :---: |
| **Tier 0 (Apex)** | **Artorious Voice, Mode B Briar Miracle, Divine Smite, Stone Awakenings** | Ducks Tiers 2–5 by `-6 dB`; commands full sub-bass (`35–120 Hz`) + vocal clarity (`250 Hz–4.5 kHz`) | Sub-bass `35 Hz` HPF; `185 Hz` `+4.5 dB` warmth shelf; `5,600 Hz` 8th-order roll-off | `1` ceremony lock |
| **Tier 1 (Cataclysm)** | **Knight `Q` Twin-Element Ult, Mage `Q` Starfall Meteor Shower, Co-Op Detonations (`Shatterblow`, `Solar Flare`, `Thunderchain`), Boss Phase Roars** | Ducks Tiers 3–5 by `-3.5 dB`; full `+4.5 dB` `<135 Hz` sub-bass tanh punch | `40 Hz` HPF; `+4.5 dB` `<135 Hz` sub shelf; `5,600 Hz` LPF | `2` (1 Ult + 1 Detonation) |
| **Tier 2 (Hero Kit)** | **Knight `E` Glacial/Sunfire Ignition & Swings, Mage `E` Spells & Hold-LMB `Shatterlance`, Basic Sword Combos `1..4`, Shield Block/Parry, Hit Confirmations** | Never ducked by enemies; crisp mid-high transient bite (`800 Hz–4.8 kHz`) + tight low-mid body (`95–250 Hz`) | Basic swings: `95 Hz` HPF (leaves `<90 Hz` sub lane clean for Tier 1); `E` skills: `45 Hz` HPF; `5,600 Hz` LPF | `3` (1 Knight + 1 Mage + 1 Hit) |
| **Tier 3 (Enemies)** | **All 9 Enemy & Boss Archetypes (Windup Telegraphs, Melee/Ranged Attacks, Shield Clangs, Bone Piles, Deaths)** | Unblockable/Heavy telegraphs boost `1.2–3.2 kHz` presence so players hear attacks from off-screen; regular mob hits high-passed at `110 Hz` (Boss slams keep `45 Hz` sub weight) | Pack mobs: `110 Hz` HPF, `5,200 Hz` LPF; Bosses (`OrcBrute`, `FrostGolem`, `Skeleton_Golem`): `42 Hz` HPF | `3` (matches `MAX_ATTACK_TOKENS = 3`) |
| **Tier 4 (Foley)** | **Footsteps (`Grass`, `Cobblestone`, `Stone Steps`), Dodge Rolls (`Knight` plate vs `Mage` silk), Perfect Dodge Ping** | Low-level tactile grounding (`-12 dBFS` peak for footsteps, `-6 dBFS` for dodge rolls, `-3 dBFS` for Perfect Dodge ping) | Footsteps & cloth: `160 Hz` HPF, `4,800 Hz` LPF (zero sub-bass rumble); Perfect Dodge: `80 Hz` HPF | `2` (round-robin 4-step pool) |
| **Tier 5 (World)** | **Sacred Stone `[G]` Inspect Resonance, Wellspring Water Ripple, Watermill & Valley Breeze** | Spatialized distance attenuation (`refDistance = 3.5m`, `maxDistance = 24.0m`); fully muted during Divine Smite (`windTimeScale = 0.0`) | Ambient water/breeze: `120 Hz` HPF, `4,500 Hz` LPF | `2` ambient loops |

---

## 3. Complete Catalog of New "Action Sprite-Sheet" Video Clips (`sfx-foley/videos/`)

Each clip below is deterministically staged at **`832×480` @ `24.0 fps`** with **0% HUD** and **explicit silence windows** between action beats so a single MiniMax H3 V2A pass yields 3–4 cleanly separated, zero-bleed game-engine one-shots (`sfx-foley/videos/slice-manifest.json`).

---

### Category 1: Character Locomotion & Foley (Tier 4)

#### Clip `01_locomotion_footsteps_surfaces`
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 4` · `HPF 160 Hz` / `LPF 4,800 Hz` · Polyphony: `1` per hero (4-variation round-robin)
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.25s]`, Frames `0–5`):** Knight stands still in sunlit emerald meadow (`(18.0, 24.0)`).
  - **Beat 1 (`[0.25s, 1.50s]`, Frames `6–36`) — `footstep_meadow_grass_1..4`:** Knight runs forward across dense meadow grass (`Running_A`), planting 4 distinct boot steps on soft turf with subtle greave clinks.
  - **Silence 1 (`[1.50s, 2.00s]`, Frames `36–48`):** Complete stillness (`Idle_A`).
  - **Beat 2 (`[2.00s, 3.25s]`, Frames `48–78`) — `footstep_cobblestone_plaza_1..4`:** Camera & Knight cut to Cobblestone Town Plaza (`(0.0, 11.5)`), running 4 crisp iron-shod boot steps across fitted stone pavers.
  - **Silence 2 (`[3.25s, 3.75s]`, Frames `78–90`):** Complete stillness (`Idle_A`).
  - **Beat 3 (`[3.75s, 5.00s]`, Frames `90–120`) — `footstep_stone_steps_mage_1..4`:** Mage runs up the North Shrine carved stone steps (`(0.0, -28.0)`, `Running_A`), planting 4 lighter leather-heel stone steps + soft robe swish.
  - **Silence 3 (`[5.00s, 5.88s]`, Frames `120–140`):** Complete stillness at top of steps.

#### Clip `02_dodge_rolls_and_perfect_dodge`
- **Target Spec:** `124 frames` (`5.17s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 4` (Dodges: `HPF 140 Hz`) / `Tier 2` (Perfect Dodge: `HPF 80 Hz`) · Polyphony: `2`
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.25s]`, Frames `0–5`):** Knight in combat stance on plaza flagstones.
  - **Beat 1 (`[0.25s, 0.90s]`, Frames `6–21`) — `knight_dodge_roll_heavy`:** Knight performs a fast forward/side dodge (`Dodge_Forward`), heavy articulated plate-armor clatter + leather strap whoosh + boot plant.
  - **Silence 1 (`[0.90s, 1.65s]`, Frames `21–39`):** Complete stillness.
  - **Beat 2 (`[1.65s, 2.30s]`, Frames `39–55`) — `mage_dodge_dash_silk`:** Mage performs an agile lateral evade (`Dodge_Right`), crisp silk-cloak snap + light air-step whoosh.
  - **Silence 2 (`[2.30s, 3.00s]`, Frames `55–72`):** Complete stillness; `Skeleton_Warrior` steps in front of Knight.
  - **Beat 3 (`[3.00s, 4.15s]`, Frames `72–99`) — `perfect_dodge_time_dilation`:** `Skeleton_Warrior` swings its axe; Knight dodges at the exact last-moment window (`checkPerfectDodge`), slowing the skeleton to `0.30×` mid-swing with a tight sub-bass air-vacuum thud + crisp crystalline time-dilation ping.
  - **Silence 3 (`[4.15s, 5.17s]`, Frames `99–123`):** Complete stillness.

---

### Category 2: Knight Combat & Sword Breathing (Tier 1 & Tier 2)

#### Clip `03_knight_basic_sword_combos`
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 2` · `HPF 95 Hz` (`combo1..3`), `HPF 55 Hz` (`combo4` finisher) / `LPF 5,600 Hz` · Polyphony: `2`
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.25s]`, Frames `0–5`):** Knight in close 3/4 front-side framing (`dist = 4.8m`).
  - **Beat 1 (`[0.25s, 0.95s]`, Frames `6–22`) — `knight_slash_combo1`:** `Melee_1H_Attack_Slice_Horizontal` — crisp horizontal broadsword air-whip + steel ring.
  - **Silence 1 (`[0.95s, 1.50s]`, Frames `22–36`):** Complete stillness (`Idle_A`).
  - **Beat 2 (`[1.50s, 2.20s]`, Frames `36–52`) — `knight_slash_combo2`:** `Melee_1H_Attack_Slice_Diagonal` — higher-pitched rising diagonal steel cut.
  - **Silence 2 (`[2.20s, 2.75s]`, Frames `52–66`):** Complete stillness (`Idle_A`).
  - **Beat 3 (`[2.75s, 3.45s]`, Frames `66–82`) — `knight_slash_combo3`:** `Melee_1H_Attack_Chop` — heavy downward overhead sword cleave.
  - **Silence 3 (`[3.45s, 4.00s]`, Frames `82–96`):** Complete stillness (`Idle_A`).
  - **Beat 4 (`[4.00s, 4.95s]`, Frames `96–118`) — `knight_slash_combo4_whirlwind`:** `Melee_1H_Attack_Jump_Chop` — full-body leaping finisher slash + heavy boot-and-blade thud.
  - **Silence 4 (`[4.95s, 5.88s]`, Frames `118–140`):** Complete stillness.

#### Clip `04_knight_glacial_and_sunfire_breathing`
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 2` · `HPF 50 Hz` / `LPF 5,600 Hz` · Polyphony: `2`
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.25s]`, Frames `0–5`):** Knight close-up with un-infused sword.
  - **Beat 1 (`[0.25s, 1.25s]`, Frames `6–30`) — `knight_e_glacial_tide_ignition`:** Pressing `[E]` (`rime` / Ice): flash-freeze crystallization lock along the steel blade + surging cyan `playDragonSlash('rime')` arc.
  - **Silence 1 (`[1.25s, 1.85s]`, Frames `30–44`):** Complete stillness (frost aura held).
  - **Beat 2 (`[1.85s, 2.75s]`, Frames `44–66`) — `knight_glacial_tide_swings`:** 2 rapid `Glacial Tide` sword slashes (`combo2 -> combo3`) carving opaque cyan ice ribbons through the air with biting frost-crack transients.
  - **Silence 2 (`[2.75s, 3.35s]`, Frames `66–80`):** Complete stillness.
  - **Beat 3 (`[3.35s, 4.35s]`, Frames `80–104`) — `knight_e_hinokami_sunfire_ignition`:** Pressing `[E]` (`solar` / Fire): explosive torch-whip flame ignition + roaring crimson-gold `playDragonSlash('solar')` dragon arc.
  - **Silence 3 (`[4.35s, 4.75s]`, Frames `104–114`):** Complete stillness.
  - **Beat 4 (`[4.75s, 5.50s]`, Frames `114–132`) — `knight_hinokami_sunfire_swings`:** 2 blazing `Hinokami Sunfire` sword cleaves (`combo3 -> combo4`) with deep fire-whoosh and ember crackle.
  - **Silence 4 (`[5.50s, 5.88s]`, Frames `132–140`):** Complete stillness.

#### Clip `05_knight_twin_element_ult_and_shield`
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 1` (Twin-Element `Q`: `HPF 40 Hz` + `+4.5 dB` sub) / `Tier 2` (Shield/Parry/Intercept: `HPF 75 Hz`)
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.25s]`, Frames `0–5`):** Knight facing target dummy in close framing.
  - **Beat 1 (`[0.25s, 1.70s]`, Frames `6–40`) — `knight_q_twin_element_awakening`:** Knight unleashes `[Q]` (`performKnightUltimate` — *Tanjiro Twin-Element Sword*): `0.38s` spin-gather as twin fire-and-ice dragons coil upward $\rightarrow$ `0.38s` first X-slash lunge $\rightarrow$ `0.70s` second X-slash cross-bite detonation (`playKnightAwakening('eclipse')`).
  - **Silence 1 (`[1.70s, 2.30s]`, Frames `40–55`):** Complete stillness.
  - **Beat 2 (`[2.30s, 3.60s]`, Frames `55–86`) — `knight_shield_raise_block_parry`:** Knight raises heater shield (`[F]` `Melee_Blocking` leather-and-iron brace), blocks a heavy skeleton axe strike with a resonant steel-on-iron clang, and immediately parries (`Melee_Block_Attack`), staggering the attacker back.
  - **Silence 2 (`[3.60s, 4.20s]`, Frames `86–100`):** Complete stillness.
  - **Beat 3 (`[4.20s, 5.15s]`, Frames `100–123`) — `knight_sprint_shield_intercept`:** Knight dashes forward and slams his shield into an enemy (`shield_bash`), sending it skidding backward `3.8m` with a concussive armor-plate thud.
  - **Silence 3 (`[5.15s, 5.88s]`, Frames `123–140`):** Complete stillness.

---

### Category 3: Mage Combat & Ultimate (Tier 1 & Tier 2)

#### Clip `06_mage_shatterlance_charge_and_starfall_ult`
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 2` (Charge Vortex: `HPF 110 Hz`) / `Tier 1` (`Q` Starfall Cataclysm: `HPF 38 Hz` + `+4.5 dB` sub)
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.25s]`, Frames `0–5`):** Mage in close 3/4 over-the-shoulder framing (`dist = 5.2m`).
  - **Beat 1 (`[0.25s, 1.35s]`, Frames `6–32`) — `mage_shatterlance_hold_charge_vortex`:** Mage holds Attack (`shatterlance_aim_start` + `updateChargeHold`), spinning a faceted crystalline ice vortex at her staff tip with rising glacier-tension creaks and locking crystal facets.
  - **Beat 2 (`[1.35s, 2.15s]`, Frames `32–51`) — `mage_shatterlance_release_burst`:** Releasing Attack (`shatterlance_aim_release`) fires the 7-fluted piercing ice lance and erupts 3D ground crystals at the landing ring.
  - **Silence 1 (`[2.15s, 2.75s]`, Frames `51–66`):** Complete stillness; camera pulls back to frame the `8.4m` bombardment zone.
  - **Beat 3 (`[2.75s, 3.60s]`, Frames `66–86`) — `mage_q_starfall_invocation`:** Mage presses `[Q]` (`performMageStormCataclysm`), raising her staff for `0.8s` (`burst_aoe` / `Ranged_Magic_Summon`) as the `8.4m` outer golden ring and `1.68m` inner safe circle ignite on the ground.
  - **Silence 2 (`[3.60s, 3.90s]`, Frames `86–93`):** Brief eye-of-the-storm pause.
  - **Beat 4 (`[3.90s, 5.45s]`, Frames `93–130`) — `mage_q_starfall_meteor_barrage`:** Multiple blazing cel-shaded volcanic meteors streak down at `72°` and slam into the `8.4m` annular ring around the mobile Mage, leaving glowing magma craters.
  - **Silence 3 (`[5.45s, 5.88s]`, Frames `130–140`):** Complete stillness.

---

### Category 4: Co-Op Elemental Detonations & Visceral Hit Impacts (Tier 1 & Tier 2)

#### Clip `07_coop_elemental_detonations`
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 1` · `HPF 38 Hz` / `+4.5 dB` `<135 Hz` sub-bass punch / `LPF 5,600 Hz` · Polyphony: `2`
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.25s]`, Frames `0–5`):** Close framing on Rime-marked `Skeleton_Warrior` (`mark = 'rime'`).
  - **Beat 1 (`[0.25s, 1.40s]`, Frames `6–33`) — `detonation_shatterblow`:** Heavy strike triggers `Shatterblow` (`swordVfx.triggerDetonation('shatterblow')`) — massive sub-bass cryo-implosion + thick glacier-ice block shattering outward.
  - **Silence 1 (`[1.40s, 2.00s]`, Frames `33–48`):** Complete stillness.
  - **Beat 2 (`[2.00s, 3.15s]`, Frames `48–75`) — `detonation_solar_flare`:** Heavy strike on Solar-marked enemy triggers `Solar Flare` (`swordVfx.triggerDetonation('solar_flare')`) — chest-hitting sub-bass volcanic detonation + roaring sunfire pillar burst.
  - **Silence 2 (`[3.15s, 3.75s]`, Frames `75–90`):** Complete stillness.
  - **Beat 3 (`[3.75s, 5.00s]`, Frames `90–120`) — `detonation_thunderchain`:** Tempest-marked pack triggers `Thunderchain` (`swordVfx.triggerDetonation('thunderchain')` + `stormLance.cast`) — vacuum pull thud + high-voltage braided lightning whip-crack and obsidian spikes splitting open.
  - **Silence 3 (`[5.00s, 5.88s]`, Frames `120–140`):** Complete stillness.

#### Clip `08_visceral_hit_impacts_and_player_damage`
- **Target Spec:** `124 frames` (`5.17s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 2` · `HPF 65 Hz` / `LPF 5,400 Hz` · Polyphony: `3`
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.25s]`, Frames `0–5`):** Close-quarters 1.2m melee framing.
  - **Beat 1 (`[0.25s, 1.05s]`, Frames `6–25`) — `hit_impact_skeleton_bone`:** Knight slashes `Skeleton_Warrior` at point-blank — crisp steel-on-bone ribcage crack, dry bone rattle & white-crimson hit-flash (`Hit_A`).
  - **Silence 1 (`[1.05s, 1.65s]`, Frames `25–39`):** Complete stillness.
  - **Beat 2 (`[1.65s, 2.45s]`, Frames `39–58`) — `hit_impact_armored_knight`:** Knight slashes `BlackKnight` — heavy steel-on-obsidian-plate clang, metallic ring & knockback recoil.
  - **Silence 2 (`[2.45s, 3.05s]`, Frames `58–73`):** Complete stillness.
  - **Beat 3 (`[3.05s, 3.85s]`, Frames `73–92`) — `hit_impact_flesh_beast`:** Knight slashes `Werewolf_Wolf` / `OrcRaider` — meaty heavy blade-on-hide thud & visceral flinch (`Hit_B`).
  - **Silence 3 (`[3.85s, 4.25s]`, Frames `92–102`):** Complete stillness.
  - **Beat 4 (`[4.25s, 4.90s]`, Frames `102–117`) — `player_hit_damage_thud`:** `OrcRaider` lands an unblocked close-quarters cleaver hit on the Knight (`handlePlayerHit`), triggering a punchy low-mid chest thud, plate-mail groan & `hit_A` flinch.
  - **Silence 4 (`[4.90s, 5.17s]`, Frames `117–123`):** Complete stillness.

---

### Category 5: All 9 Enemy & Boss Archetypes (Tier 3 Telegraphs, Attacks & Deaths)

#### Clip `09_enemies_skeleton_legion` (`Skeleton_Minion`, `Skeleton_Warrior`, `Skeleton_Rogue`)
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 3` · `HPF 110 Hz` / `LPF 5,200 Hz` · Polyphony: `3`
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.20s]`, Frames `0–4`):** Close framing on `Skeleton_Minion`.
  - **Beat 1 (`[0.20s, 1.40s]`, Frames `5–33`) — `enemy_skeleton_minion_attack_and_pile`:** `Skeleton_Minion` rushes in with dry bone clatter, throws a snappy punch/kick (`minion_punch`), then collapses into a scattered bone pile (`Skeletons_Death`).
  - **Silence 1 (`[1.40s, 1.95s]`, Frames `33–46`):** Complete stillness; camera frames `Skeleton_Warrior`.
  - **Beat 2 (`[1.95s, 3.30s]`, Frames `46–79`) — `enemy_skeleton_warrior_shield_and_chop`:** `Skeleton_Warrior` raises iron shield (`Melee_Blocking`), telegraphs its slowed overhead windup, and cleaves downward with its iron axe (`warrior_chop`) + shield-bash counter (`Melee_Block_Attack`).
  - **Silence 2 (`[3.30s, 3.85s]`, Frames `79–92`):** Complete stillness; camera frames `Skeleton_Rogue`.
  - **Beat 3 (`[3.85s, 5.30s]`, Frames `92–127`) — `enemy_skeleton_rogue_flank_and_flurry`:** Hooded crimson-cloak `Skeleton_Rogue` side-dashes (`Dodge_Left`), unleashes a rapid 3-hit dual-dagger stab flurry (`rogue_stab`), and finishes with a leaping chop (`rogue_jump_chop`).
  - **Silence 3 (`[5.30s, 5.88s]`, Frames `127–140`):** Complete stillness.

#### Clip `10_enemies_casters_and_sylvan` (`Skeleton_Mage`, `Necromancer` Boss, `PlantWarrior`)
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 3` · `HPF 90 Hz` (`Skeleton_Mage` / `PlantWarrior`), `HPF 55 Hz` (`Necromancer` Boss)
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.20s]`, Frames `0–4`):** Close framing on violet-cowled `Skeleton_Mage`.
  - **Beat 1 (`[0.20s, 1.55s]`, Frames `5–37`) — `enemy_skeleton_mage_bolt_and_eruption`:** `Skeleton_Mage` raises bone staff (`Ranged_Magic_Shoot`) to fire a 3D arcane bolt, then channels `Ranged_Magic_Spellcasting_Long` as a crimson petal-crack decal erupts under the target (`mage_eruption`).
  - **Silence 1 (`[1.55s, 2.10s]`, Frames `37–50`):** Complete stillness; camera frames towering `Necromancer` boss (`grove_necromancer`).
  - **Beat 2 (`[2.10s, 3.65s]`, Frames `50–87`) — `boss_necromancer_summon_and_bolt`:** `Necromancer` raises staff in a dark summoning ritual (`Ranged_Magic_Summon` / `burst_aoe`), spawning hunter adds on the Whispering Grove medallion with a deep necrotic bass pulse & bone-chime rattle.
  - **Silence 2 (`[3.65s, 4.15s]`, Frames `87–99`):** Complete stillness; camera frames `PlantWarrior`.
  - **Beat 3 (`[4.15s, 5.45s]`, Frames `99–130`) — `enemy_plant_warrior_thorn_and_spear`:** Briar-thorned `PlantWarrior` fires a ranged thorn bolt (`Ranged_Magic_Shoot` woody bow-twang + thorn whip), then lunges forward with a melee spear slash (`warrior_slice`).
  - **Silence 3 (`[5.45s, 5.88s]`, Frames `130–140`):** Complete stillness.

#### Clip `11_enemies_berserkers_and_elites` (`OrcRaider`, `Werewolf_Wolf`, `BlackKnight` Elite)
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 3` · `HPF 70 Hz` / `LPF 5,400 Hz` · Polyphony: `3`
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.20s]`, Frames `0–4`):** Close framing on olive-tusked `OrcRaider`.
  - **Beat 1 (`[0.20s, 1.50s]`, Frames `5–36`) — `enemy_orc_raider_sprint_and_cleave`:** `OrcRaider` charges in with heavy stomping steps (`Running_A`) and swings a savage 2H axe chop (`warrior_chop`) with a guttural war-grunt & heavy iron whoosh.
  - **Silence 1 (`[1.50s, 2.05s]`, Frames `36–49`):** Complete stillness; camera frames dark-furred `Werewolf_Wolf`.
  - **Beat 2 (`[2.05s, 3.50s]`, Frames `49–84`) — `enemy_werewolf_stalk_and_pounce`:** `Werewolf_Wolf` crouches and launches into a high airborne leap-pounce (`rogue_jump_chop` with `leapLift`), landing with a feral claw-rip & ground thud.
  - **Silence 2 (`[3.50s, 4.05s]`, Frames `84–97`):** Complete stillness; camera frames obsidian-armored `BlackKnight` elite.
  - **Beat 3 (`[4.05s, 5.45s]`, Frames `97–130`) — `elite_black_knight_shield_and_greatsword`:** `BlackKnight` braces his directional tower shield (`Melee_Block_Hit` heavy iron resonance), then unleashes an unblockable 2H greatsword spin & overhead chop (`captain_spin` / `captain_chop`).
  - **Silence 3 (`[5.45s, 5.88s]`, Frames `130–140`):** Complete stillness.

#### Clip `12_bosses_brute_and_golems` (`OrcBrute`, `FrostGolem`, `Skeleton_Golem`)
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 1 / Tier 3 Boss` · `HPF 38 Hz` / `+4.5 dB` `<135 Hz` sub-bass punch / `LPF 5,200 Hz`
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.20s]`, Frames `0–4`):** Close low-angle framing on towering `OrcBrute` (`2.55m`).
  - **Beat 1 (`[0.20s, 1.65s]`, Frames `5–39`) — `boss_orc_brute_slam`:** `OrcBrute` roars (`Flexing`) and brings his massive greatclub down in a two-handed earth-cracking slam (`boss_slam`) as the crimson ground decal fractures.
  - **Silence 1 (`[1.65s, 2.15s]`, Frames `39–51`):** Complete stillness; camera frames colossal `FrostGolem` (`2.85m`).
  - **Beat 2 (`[2.15s, 3.75s]`, Frames `51–90`) — `boss_frost_golem_combo_and_smash`:** `FrostGolem` stomps forward with heavy glacier-boulder footsteps, swings a 3-hit dual-fist combo (`boss_combo`), and slams both fists into the earth (`boss_smash`) with a sub-bass ice-boulder shockwave.
  - **Silence 2 (`[3.75s, 4.25s]`, Frames `90–102`):** Complete stillness; camera frames `Skeleton_Golem` (`boss_sovereign`, `2.80m`).
  - **Beat 3 (`[4.25s, 5.55s]`, Frames `102–133`) — `boss_skeleton_golem_roar_and_stagger_collapse`:** `Skeleton_Golem` triggers its `70%`/`35%` phase-threshold roar (`Flexing`), then shatters its Bone Aegis and collapses to its knees (`Death_A` down window) with a massive ossuary bone-boulder crash.
  - **Silence 3 (`[5.55s, 5.88s]`, Frames `133–140`):** Complete stillness.

---

### Category 6: Sacred Stones, Prayers (`[R]`) & Co-Op Lifecycle (Tier 0 & Tier 5)

#### Clip `13_sacred_stones_and_field_heal`
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 5` (Stone Inspect: `HPF 110 Hz`) / `Tier 0` (Rose Ring & Mode A Field Heal: `HPF 65 Hz`)
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.20s]`, Frames `0–4`):** Hero standing before Stone 1 Village Well (`(0.0, 2.7)`).
  - **Beat 1 (`[0.20s, 1.75s]`, Frames `5–42`) — `sacred_stone_inspect_and_wellspring`:** Pressing `[G]` (`enterStoneInspection`) glides the camera into close inspection of the carved travertine plaque and luminous aqua-teal Wellspring water (`y = 0.38m`) — warm carved-stone resonance + gentle spring water ripple shimmer.
  - **Silence 1 (`[1.75s, 2.30s]`, Frames `42–55`):** Camera steps back (`exitStoneInspection`), complete stillness.
  - **Beat 2 (`[2.30s, 3.75s]`, Frames `55–90`) — `commune_rose_ring_bloom_and_channel`:** Pressing `[R]` (`startCommuneChannel`) blooms the 24-cluster diegetic Crimson Rose Ring (`r = 1.65m`) around the speaker's feet while 48 crimson petals lift into a gentle spiral breeze (`artoriousVfx.startChannel`).
  - **Silence 2 (`[3.75s, 4.25s]`, Frames `90–102`):** Brief stillness before resolution.
  - **Beat 3 (`[4.25s, 5.50s]`, Frames `102–132`) — `commune_mode_a_field_heal`:** Mode A Normal Field Heal resolves in-place (`applyCommuneVerdict({ verdict: 'heal', prayerMode: 'field_heal' })` + `artoriousVfx.triggerHeal`) — warm golden rose-petal shimmer and uplifting acoustic chord mending both partners without locking controls.
  - **Silence 3 (`[5.50s, 5.88s]`, Frames `132–140`):** Complete stillness.

#### Clip `14_coop_downed_revive_and_rebirth`
- **Target Spec:** `141 frames` (`5.88s` @ `24 fps`, `832×480`)
- **Priority & Lane:** `Tier 0 / Tier 2` · `HPF 55 Hz` / `LPF 5,400 Hz` · Polyphony: `1`
- **Staged Visual Choreography & Slice Windows:**
  - **Silence 0 (`[0.00s, 0.20s]`, Frames `0–4`):** Knight and Mage standing side-by-side.
  - **Beat 1 (`[0.20s, 1.30s]`, Frames `5–31`) — `coop_partner_downed_collapse`:** Mage drops to `0 HP` (`death` / `downed`), collapsing onto the stone paving with a heavy cloth-and-wooden-staff fall thud.
  - **Silence 1 (`[1.30s, 1.85s]`, Frames `31–44`):** Complete stillness while Mage lies downed.
  - **Beat 2 (`[1.85s, 3.75s]`, Frames `44–90`) — `coop_proximity_revive_channel_and_rise`:** Knight stands within `2.8m` holding Shield Guard (`[F]`) as the proximity revive ring fills and lifts the Mage back to her feet (`revive` clip) in a rising golden harmonic swell.
  - **Silence 2 (`[3.75s, 4.25s]`, Frames `90–102`):** Complete stillness.
  - **Beat 3 (`[4.25s, 5.50s]`, Frames `102–132`) — `coop_sanctuary_rebirth_respawn`:** Both partners awaken together at the Safe Haven Waypoint (`(0.0, 18.5)`, `revive` + `cheer` + Golden Ward Shield shimmer).
  - **Silence 3 (`[5.50s, 5.88s]`, Frames `132–140`):** Complete stillness.

---

## 4. Automated Slicing & WebAudio Integration Plan

1. **Deterministic Capture (`sfx-foley/harness/capture-foley-videos.mjs`):**
   - Outputs all 14 `.mp4` videos (`832×480`, `24.0 fps`, exact `124` or `141` frames, `-crf 17`, `-an`), `4×3` contact sheets (`-sheet.jpg`), and `sfx-foley/videos/slice-manifest.json`.
2. **H200 V2A Generation (`modal_h3_v2a_runner.py`):**
   - Each `.mp4` builds its 50-layer post-RoPE Video KV-Cache once (`~16s`), generates `CFGGuider(1.8)` variations with `Complete silence.` enforced during all silence windows, and applies `polish_game_sfx()`.
3. **Zero-Crossing Atomic Slicing:**
   - Using the `[start_s, end_s]` beat windows in `sfx-foley/videos/slice-manifest.json`, each multi-beat `.wav` is sliced at the nearest zero-crossing inside the surrounding silence windows with a `10ms` cosine fade-in and `25ms` exponential fade-out into individual `.ogg`/`.wav` one-shots for `combat-sfx.js`.
