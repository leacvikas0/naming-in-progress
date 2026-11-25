// ============================================================================
// world/src/combat/combat-sfx.js
//
// Causal, Phase-Locked WebAudio Combat SFX, Foley & Voice Engine:
// - Pre-decodes 48 kHz physical foley & voice bank (`world/assets/audio/sfx/`)
//   into WebAudio `AudioBuffer`s with zero-click first-gesture unlock.
// - Strict Causal Ownership & Interruption Engine (`interruptActor(actorId)`):
//   * Every playing sound and voice is tagged with `actorId` ('Knight', 'Mage',
//     or `enemy.instanceId`) and a causal `category` ('attack', 'cast', 'charge',
//     'ult', 'windup', 'voice', 'impact', 'death').
//   * If an actor dies, is staggered/parried/interrupted, dodges out of an
//     attack, or cancels aim while attacking/casting/charging/speaking an
//     attack line, their active attack/cast/charge/windup sounds and attack
//     voices are immediately choked (`28ms` exponential ramp to silence + stop)
//     and any pending phase timers for that actor are cancelled before the
//     hit/stagger/death sound plays.
// - Atomic Phase-Separated Spells, Bolts & Ultimates:
//   * Mage Bolts: `mage_bolt_cast_1..3` / `mage_bolt_nova_cast` on release +
//     `mage_bolt_impact_1..3` / `mage_nova_impact` on target contact.
//   * Mage Spells: `spell_<id>_cast` / `_launch` / `_release` on cast +
//     flight-synced `spell_<id>_erupt` / `_impact` at ground/target impact.
//   * Mage [Q] Starfall: `mage_q_ult` invocation seal (interruptible during
//     0.8s cast pose) + per-meteor `mage_q_meteor` sky-tear -> crater slam.
//   * Knight [Q] Twin-Element Ult: 3 phase-locked cues (`knight_q_phase1_coil`
//     at 0.00s, `knight_q_phase2_cut1` at 0.38s, `knight_q_phase3_crossbite`
//     at 0.70s), interruptible if Knight is downed mid-ult.
// - Dedicated Hero & Monster Death Foley (`death_foley_*`) + Death Voices
//   (`voice_*_death`) for every hero and enemy archetype (including skeleton
//   bone-pile collapse vs final bone shatter).
// ============================================================================

const CUE_PATHS = {
  // 1. Warm Swords (36 variations: steel, rime/ice, solar/fire x combo1..4 x varA/B/C)
  sword_none_c1: [
    './assets/audio/sfx/swords/sword_steel_combo1_varA.mp3',
    './assets/audio/sfx/swords/sword_steel_combo1_varB.mp3',
    './assets/audio/sfx/swords/sword_steel_combo1_varC.mp3',
  ],
  sword_none_c2: [
    './assets/audio/sfx/swords/sword_steel_combo2_varA.mp3',
    './assets/audio/sfx/swords/sword_steel_combo2_varB.mp3',
    './assets/audio/sfx/swords/sword_steel_combo2_varC.mp3',
  ],
  sword_none_c3: [
    './assets/audio/sfx/swords/sword_steel_combo3_varA.mp3',
    './assets/audio/sfx/swords/sword_steel_combo3_varB.mp3',
    './assets/audio/sfx/swords/sword_steel_combo3_varC.mp3',
  ],
  sword_heavy_none: [
    './assets/audio/sfx/swords/sword_steel_combo4_heavy_varA.mp3',
    './assets/audio/sfx/swords/sword_steel_combo4_heavy_varB.mp3',
    './assets/audio/sfx/swords/sword_steel_combo4_heavy_varC.mp3',
  ],
  sword_rime_c1: [
    './assets/audio/sfx/swords/sword_ice_combo1_varA.mp3',
    './assets/audio/sfx/swords/sword_ice_combo1_varB.mp3',
    './assets/audio/sfx/swords/sword_ice_combo1_varC.mp3',
  ],
  sword_rime_c2: [
    './assets/audio/sfx/swords/sword_ice_combo2_varA.mp3',
    './assets/audio/sfx/swords/sword_ice_combo2_varB.mp3',
    './assets/audio/sfx/swords/sword_ice_combo2_varC.mp3',
  ],
  sword_rime_c3: [
    './assets/audio/sfx/swords/sword_ice_combo3_varA.mp3',
    './assets/audio/sfx/swords/sword_ice_combo3_varB.mp3',
    './assets/audio/sfx/swords/sword_ice_combo3_varC.mp3',
  ],
  sword_heavy_rime: [
    './assets/audio/sfx/swords/sword_ice_combo4_heavy_varA.mp3',
    './assets/audio/sfx/swords/sword_ice_combo4_heavy_varB.mp3',
    './assets/audio/sfx/swords/sword_ice_combo4_heavy_varC.mp3',
  ],
  sword_solar_c1: [
    './assets/audio/sfx/swords/sword_fire_combo1_varA.mp3',
    './assets/audio/sfx/swords/sword_fire_combo1_varB.mp3',
    './assets/audio/sfx/swords/sword_fire_combo1_varC.mp3',
  ],
  sword_solar_c2: [
    './assets/audio/sfx/swords/sword_fire_combo2_varA.mp3',
    './assets/audio/sfx/swords/sword_fire_combo2_varB.mp3',
    './assets/audio/sfx/swords/sword_fire_combo2_varC.mp3',
  ],
  sword_solar_c3: [
    './assets/audio/sfx/swords/sword_fire_combo3_varA.mp3',
    './assets/audio/sfx/swords/sword_fire_combo3_varB.mp3',
    './assets/audio/sfx/swords/sword_fire_combo3_varC.mp3',
  ],
  sword_heavy_solar: [
    './assets/audio/sfx/swords/sword_fire_combo4_heavy_varA.mp3',
    './assets/audio/sfx/swords/sword_fire_combo4_heavy_varB.mp3',
    './assets/audio/sfx/swords/sword_fire_combo4_heavy_varC.mp3',
  ],

  // 2. Sword Dragon Ignitions ([E]) & Phase-Locked Knight [Q] Twin-Element Ult
  dragon_ice: [
    './assets/audio/sfx/dragons/knight_e_ice_dragon_wide.mp3',
    './assets/audio/sfx/dragons/knight_e_ice_dragon_close.mp3',
  ],
  dragon_fire: [
    './assets/audio/sfx/dragons/knight_e_fire_dragon_wide.mp3',
    './assets/audio/sfx/dragons/knight_e_fire_dragon_close.mp3',
  ],
  knight_q_phase1: ['./assets/audio/sfx/dragons/knight_q_phase1_coil.mp3'],
  knight_q_phase2: ['./assets/audio/sfx/dragons/knight_q_phase2_cut1.mp3'],
  knight_q_phase3: ['./assets/audio/sfx/dragons/knight_q_phase3_crossbite.mp3'],
  knight_q_ult: [
    './assets/audio/sfx/dragons/knight_q_twin_dragon_wide.mp3',
    './assets/audio/sfx/dragons/knight_q_twin_dragon_close.mp3',
  ],

  // 3. Shield, Parry, Bash & Perfect Dodge Time Dilation Bowl
  shield_raise: ['./assets/audio/sfx/shield/knight_shield_raise.mp3'],
  shield_block: ['./assets/audio/sfx/shield/knight_shield_block_clang.mp3'],
  shield_parry: ['./assets/audio/sfx/shield/knight_shield_parry_ring.mp3'],
  shield_bash: ['./assets/audio/sfx/shield/knight_shield_bash.mp3'],
  perfect_dodge: ['./assets/audio/sfx/shield/perfect_dodge_time_dilation.mp3'],

  // 4. Atomic Phase-Split Mage Bolts & Spells (Cast/Launch vs Impact/Erupt)
  mage_bolt_1: ['./assets/audio/sfx/mage/mage_bolt_cast_1.mp3'],
  mage_bolt_2: ['./assets/audio/sfx/mage/mage_bolt_cast_2.mp3'],
  mage_bolt_3: ['./assets/audio/sfx/mage/mage_bolt_cast_3.mp3'],
  mage_bolt_nova: ['./assets/audio/sfx/mage/mage_bolt_nova_cast.mp3'],
  mage_bolt_impact_1: ['./assets/audio/sfx/mage/mage_bolt_impact_1.mp3'],
  mage_bolt_impact_2: ['./assets/audio/sfx/mage/mage_bolt_impact_2.mp3'],
  mage_bolt_impact_3: ['./assets/audio/sfx/mage/mage_bolt_impact_3.mp3'],
  mage_nova_impact: ['./assets/audio/sfx/mage/mage_nova_impact.mp3'],

  spell_frost_lance_cast: ['./assets/audio/sfx/mage/spell_frost_lance_cast.mp3'],
  spell_frost_lance_erupt: ['./assets/audio/sfx/mage/spell_frost_lance_erupt.mp3'],
  spell_frost_lance: [
    './assets/audio/sfx/mage/mage_e_frost_lance_corridor.mp3',
    './assets/audio/sfx/mage/mage_e_frost_lance_apex_close.mp3',
  ],

  spell_shatterlance_charge: ['./assets/audio/sfx/mage/mage_shatterlance_charge.mp3'],
  spell_shatterlance_charge_loop: ['./assets/audio/sfx/mage/mage_shatterlance_charge_loop.mp3'],
  spell_shatterlance_release: ['./assets/audio/sfx/mage/spell_shatterlance_release.mp3'],
  spell_shatterlance_impact: ['./assets/audio/sfx/mage/spell_shatterlance_impact.mp3'],
  spell_shatterlance: ['./assets/audio/sfx/mage/mage_shatterlance_launch_shatter.mp3'],

  spell_cinder_fall_launch: ['./assets/audio/sfx/mage/spell_cinder_fall_launch.mp3'],
  spell_cinder_fall_impact: ['./assets/audio/sfx/mage/spell_cinder_fall_impact.mp3'],
  spell_cinder_fall: [
    './assets/audio/sfx/mage/mage_e_cinder_fall_wide.mp3',
    './assets/audio/sfx/mage/mage_e_cinder_fall_impact_close.mp3',
  ],

  spell_storm_lance_cast: ['./assets/audio/sfx/mage/spell_storm_lance_cast.mp3'],
  spell_storm_lance_impact: ['./assets/audio/sfx/mage/spell_storm_lance_impact.mp3'],
  spell_storm_lance: [
    './assets/audio/sfx/mage/mage_storm_lance_wide.mp3',
    './assets/audio/sfx/mage/mage_storm_lance_cluster_close.mp3',
  ],

  mage_q_ult: ['./assets/audio/sfx/mage/mage_q_starfall_invocation.mp3'],
  mage_q_meteor: ['./assets/audio/sfx/mage/mage_q_starfall_single_meteor.mp3'],

  // 5. Elemental Detonations
  detonation_shatterblow: ['./assets/audio/sfx/detonations/detonation_shatterblow.mp3'],
  detonation_solar_flare: ['./assets/audio/sfx/detonations/detonation_solar_flare.mp3'],
  detonation_thunderchain: ['./assets/audio/sfx/detonations/detonation_thunderchain.mp3'],

  // 6. Combat Hit Impacts & Player Damage
  hit_bone: [
    './assets/audio/sfx/impacts/hit_bone_1.mp3',
    './assets/audio/sfx/impacts/hit_bone_2.mp3',
    './assets/audio/sfx/impacts/hit_bone_3.mp3',
  ],
  hit_armor: [
    './assets/audio/sfx/impacts/hit_armor_1.mp3',
    './assets/audio/sfx/impacts/hit_armor_2.mp3',
    './assets/audio/sfx/impacts/hit_armor_3.mp3',
  ],
  hit_flesh: [
    './assets/audio/sfx/impacts/hit_flesh_1.mp3',
    './assets/audio/sfx/impacts/hit_flesh_2.mp3',
    './assets/audio/sfx/impacts/hit_flesh_3.mp3',
  ],
  player_hit: ['./assets/audio/sfx/impacts/player_hit_thud.mp3'],
  player_hit_heavy: ['./assets/audio/sfx/impacts/player_hit_damage_thud.mp3'],

  // 7. Dodges & Surface-Matched Single Footsteps
  dodge_knight: ['./assets/audio/sfx/foley/dodge_knight.mp3'],
  dodge_mage: ['./assets/audio/sfx/foley/dodge_mage.mp3'],
  footstep_grass: [
    './assets/audio/sfx/foley/footstep_grass_1.mp3',
    './assets/audio/sfx/foley/footstep_grass_2.mp3',
    './assets/audio/sfx/foley/footstep_grass_3.mp3',
    './assets/audio/sfx/foley/footstep_grass_4.mp3',
  ],
  footstep_cobble: [
    './assets/audio/sfx/foley/footstep_cobble_1.mp3',
    './assets/audio/sfx/foley/footstep_cobble_2.mp3',
    './assets/audio/sfx/foley/footstep_cobble_3.mp3',
    './assets/audio/sfx/foley/footstep_cobble_4.mp3',
  ],
  footstep_stone: [
    './assets/audio/sfx/foley/footstep_stone_1.mp3',
    './assets/audio/sfx/foley/footstep_stone_2.mp3',
    './assets/audio/sfx/foley/footstep_stone_3.mp3',
    './assets/audio/sfx/foley/footstep_stone_4.mp3',
  ],

  // 8. Light Ghibli Tactile HUD/UI & Sacred Stones/Prayers
  ui_hover: ['./assets/audio/sfx/ui/ui_hover.mp3'],
  ui_click: ['./assets/audio/sfx/ui/ui_click.mp3'],
  ui_tab_ice: ['./assets/audio/sfx/ui/ui_element_tab_ice.mp3'],
  ui_tab_fire: ['./assets/audio/sfx/ui/ui_element_tab_fire.mp3'],
  ui_hero_swap: ['./assets/audio/sfx/ui/ui_hero_swap.mp3'],
  ui_locked: ['./assets/audio/sfx/ui/ui_locked_thud.mp3'],
  ui_modal_open: ['./assets/audio/sfx/ui/ui_modal_open.mp3'],
  ui_modal_close: ['./assets/audio/sfx/ui/ui_modal_close.mp3'],
  ui_level_up: ['./assets/audio/sfx/ui/ui_level_up.mp3'],
  ui_victory: ['./assets/audio/sfx/ui/ui_victory_fanfare.mp3'],

  stone_inspect: ['./assets/audio/sfx/sacred/stone_inspect.mp3'],
  commune_start: ['./assets/audio/sfx/sacred/commune_start.mp3'],
  verdict_heal: ['./assets/audio/sfx/sacred/heal_verdict.mp3'],
  verdict_miracle: ['./assets/audio/sfx/sacred/miracle_verdict.mp3'],
  verdict_smite: ['./assets/audio/sfx/sacred/smite_verdict.mp3'],

  // 8B. Living World Ambience Loops (`ambience/`)
  amb_meadow: ['./assets/audio/sfx/ambience/amb_meadow_day.mp3'],
  amb_brook: ['./assets/audio/sfx/ambience/amb_village_brook.mp3'],
  amb_commune: ['./assets/audio/sfx/ambience/amb_commune_celestial.mp3'],

  // 9. Monster/Boss Foley Accents (All Archetypes)
  enemy_foley_skeleton_warrior: ['./assets/audio/sfx/enemies/enemy_skeleton_warrior_shield_and_chop.mp3'],
  enemy_foley_skeleton_minion: ['./assets/audio/sfx/enemies/enemy_skeleton_minion_clatter.mp3'],
  enemy_foley_werewolf: ['./assets/audio/sfx/enemies/enemy_werewolf_stalk_and_pounce.mp3'],
  enemy_foley_black_knight: ['./assets/audio/sfx/enemies/enemy_black_knight_plate_cleave.mp3'],
  enemy_foley_necromancer: ['./assets/audio/sfx/enemies/enemy_necromancer_dark_chant.mp3'],
  enemy_foley_orc_raider: ['./assets/audio/sfx/enemies/enemy_orc_raider_axe_rush.mp3'],
  enemy_foley_plant_warrior: ['./assets/audio/sfx/enemies/enemy_plant_warrior_thorn_whip.mp3'],
  enemy_foley_boss_brute: ['./assets/audio/sfx/enemies/boss_orc_brute_slam.mp3'],
  enemy_foley_boss_golem: ['./assets/audio/sfx/enemies/boss_frost_golem_glacier_stomp.mp3'],

  // 10. Dedicated Hero & Enemy Physical Death Foley (`death_foley_*`)
  death_foley_knight: ['./assets/audio/sfx/deaths/death_foley_knight.mp3'],
  death_foley_mage: ['./assets/audio/sfx/deaths/death_foley_mage.mp3'],
  death_foley_skeleton_pile: ['./assets/audio/sfx/deaths/death_foley_skeleton_pile.mp3'],
  death_foley_skeleton_shatter: ['./assets/audio/sfx/deaths/death_foley_skeleton_shatter.mp3'],
  death_foley_orc: ['./assets/audio/sfx/deaths/death_foley_orc.mp3'],
  death_foley_werewolf: ['./assets/audio/sfx/deaths/death_foley_werewolf.mp3'],
  death_foley_black_knight: ['./assets/audio/sfx/deaths/death_foley_black_knight.mp3'],
  death_foley_plant: ['./assets/audio/sfx/deaths/death_foley_plant.mp3'],
  death_foley_necromancer: ['./assets/audio/sfx/deaths/death_foley_necromancer.mp3'],
  death_foley_boss_brute: ['./assets/audio/sfx/deaths/death_foley_boss_brute.mp3'],
  death_foley_boss_golem: ['./assets/audio/sfx/deaths/death_foley_boss_golem.mp3'],

  // 11. Approved v5 Hero & Enemy Voices + Multi-Variation Finishers & Dramatic Deaths
  voice_knight_atk: [
    './assets/audio/sfx/voices/knight_enzo__atk_1.mp3',
    './assets/audio/sfx/voices/knight_enzo__atk_2.mp3',
    './assets/audio/sfx/voices/knight_enzo__atk_3.mp3',
    './assets/audio/sfx/voices/knight_enzo__atk_4.mp3',
  ],
  voice_knight_finisher: [
    './assets/audio/sfx/voices/knight_enzo__finisher_1.mp3',
    './assets/audio/sfx/voices/knight_enzo__finisher_2.mp3',
    './assets/audio/sfx/voices/knight_enzo__finisher_3.mp3',
    './assets/audio/sfx/voices/knight_enzo__finisher_4.mp3',
  ],
  voice_knight_dodge: [
    './assets/audio/sfx/voices/knight_enzo__dodge_1.mp3',
    './assets/audio/sfx/voices/knight_enzo__dodge_2.mp3',
  ],
  voice_knight_hurt: [
    './assets/audio/sfx/voices/knight_enzo__hurt_1.mp3',
    './assets/audio/sfx/voices/knight_enzo__hurt_2.mp3',
  ],
  voice_knight_death: [
    './assets/audio/sfx/voices/knight_enzo__death.mp3',
    './assets/audio/sfx/voices/knight_enzo__death_2.mp3',
  ],
  voice_knight_pray: [
    './assets/audio/sfx/voices/knight_enzo_pray__pray_1.mp3',
    './assets/audio/sfx/voices/knight_enzo_pray__pray_2.mp3',
    './assets/audio/sfx/voices/knight_enzo_pray__pray_3.mp3',
  ],

  voice_mage_cast: [
    './assets/audio/sfx/voices/mage_lumi__cast_1.mp3',
    './assets/audio/sfx/voices/mage_lumi__cast_2.mp3',
    './assets/audio/sfx/voices/mage_lumi__cast_3.mp3',
  ],
  voice_mage_finisher: [
    './assets/audio/sfx/voices/mage_lumi__finisher_1.mp3',
    './assets/audio/sfx/voices/mage_lumi__finisher_2.mp3',
    './assets/audio/sfx/voices/mage_lumi__finisher_3.mp3',
  ],
  voice_mage_dodge: [
    './assets/audio/sfx/voices/mage_lumi__dodge_1.mp3',
    './assets/audio/sfx/voices/mage_lumi__dodge_2.mp3',
    './assets/audio/sfx/voices/mage_lumi__dodge_3.mp3',
  ],
  voice_mage_hurt: [
    './assets/audio/sfx/voices/mage_lumi__hurt_1.mp3',
    './assets/audio/sfx/voices/mage_lumi__hurt_2.mp3',
  ],
  voice_mage_death: [
    './assets/audio/sfx/voices/mage_lumi__death.mp3',
    './assets/audio/sfx/voices/mage_lumi__death_2.mp3',
  ],
  voice_mage_pray: [
    './assets/audio/sfx/voices/mage_lumi_pray__pray_1.mp3',
    './assets/audio/sfx/voices/mage_lumi_pray__pray_2.mp3',
    './assets/audio/sfx/voices/mage_lumi_pray__pray_3.mp3',
  ],

  voice_skeleton_warrior_appear: ['./assets/audio/sfx/voices/skeleton_warrior__appear.mp3'],
  voice_skeleton_warrior_attack: ['./assets/audio/sfx/voices/skeleton_warrior__attack.mp3'],
  voice_skeleton_warrior_hurt: ['./assets/audio/sfx/voices/skeleton_warrior__hurt.mp3'],
  voice_skeleton_warrior_death: ['./assets/audio/sfx/voices/skeleton_warrior__death.mp3'],

  voice_skeleton_minion_appear: [
    './assets/audio/sfx/voices/skeleton_minion__appear.mp3',
    './assets/audio/sfx/voices/skeleton_minion__idle_giggle.mp3',
  ],
  voice_skeleton_minion_attack: ['./assets/audio/sfx/voices/skeleton_minion__attack.mp3'],
  voice_skeleton_minion_hurt: ['./assets/audio/sfx/voices/skeleton_minion__hurt.mp3'],
  voice_skeleton_minion_death: ['./assets/audio/sfx/voices/skeleton_minion__death.mp3'],

  voice_orc_raider_appear: [
    './assets/audio/sfx/voices/orc_raider__appear.mp3',
    './assets/audio/sfx/voices/orc_raider__idle_cackle.mp3',
  ],
  voice_orc_raider_attack: ['./assets/audio/sfx/voices/orc_raider__attack.mp3'],
  voice_orc_raider_hurt: ['./assets/audio/sfx/voices/orc_raider__hurt.mp3'],
  voice_orc_raider_death: ['./assets/audio/sfx/voices/orc_raider__death.mp3'],

  voice_plant_warrior_appear: [
    './assets/audio/sfx/voices/plant_warrior__appear.mp3',
    './assets/audio/sfx/voices/plant_warrior__idle_hop.mp3',
  ],
  voice_plant_warrior_attack: ['./assets/audio/sfx/voices/plant_warrior__attack.mp3'],
  voice_plant_warrior_hurt: ['./assets/audio/sfx/voices/plant_warrior__hurt.mp3'],
  voice_plant_warrior_death: ['./assets/audio/sfx/voices/plant_warrior__death.mp3'],

  voice_werewolf_appear: ['./assets/audio/sfx/voices/werewolf__appear.mp3'],
  voice_werewolf_windup: ['./assets/audio/sfx/voices/werewolf__windup_snarl.mp3'],
  voice_werewolf_attack: ['./assets/audio/sfx/voices/werewolf__attack_roar.mp3'],
  voice_werewolf_hurt: [
    './assets/audio/sfx/voices/werewolf__hurt.mp3',
    './assets/audio/sfx/voices/werewolf__yelp.mp3',
  ],
  voice_werewolf_death: ['./assets/audio/sfx/voices/werewolf__death.mp3'],

  voice_black_knight_appear: [
    './assets/audio/sfx/voices/black_knight__appear.mp3',
    './assets/audio/sfx/voices/black_knight__block_brace.mp3',
  ],
  voice_black_knight_attack: [
    './assets/audio/sfx/voices/black_knight__attack.mp3',
    './assets/audio/sfx/voices/black_knight__attack_2.mp3',
    './assets/audio/sfx/voices/black_knight__attack_3.mp3',
  ],
  voice_black_knight_hurt: ['./assets/audio/sfx/voices/black_knight__hurt.mp3'],
  voice_black_knight_death: ['./assets/audio/sfx/voices/black_knight__death.mp3'],

  voice_necromancer_appear: [
    './assets/audio/sfx/voices/necromancer__appear.mp3',
    './assets/audio/sfx/voices/necromancer__channel_hum.mp3',
  ],
  voice_necromancer_attack: [
    './assets/audio/sfx/voices/necromancer__attack_cast.mp3',
    './assets/audio/sfx/voices/necromancer__hiss.mp3',
  ],
  voice_necromancer_hurt: ['./assets/audio/sfx/voices/necromancer__hurt.mp3'],
  voice_necromancer_death: ['./assets/audio/sfx/voices/necromancer__death.mp3'],

  voice_boss_brute_appear: [
    './assets/audio/sfx/voices/boss_brute__appear.mp3',
    './assets/audio/sfx/voices/boss_brute__stomp_huff.mp3',
  ],
  voice_boss_brute_attack: [
    './assets/audio/sfx/voices/boss_brute__attack_heavy.mp3',
    './assets/audio/sfx/voices/boss_brute__attack_finisher.mp3',
  ],
  voice_boss_brute_roar: ['./assets/audio/sfx/voices/boss_brute__roar_phase.mp3'],
  voice_boss_brute_hurt: ['./assets/audio/sfx/voices/boss_brute__hurt.mp3'],
  voice_boss_brute_death: ['./assets/audio/sfx/voices/boss_brute__death.mp3'],

  voice_boss_frost_golem_appear: [
    './assets/audio/sfx/voices/boss_frost_golem__appear.mp3',
    './assets/audio/sfx/voices/boss_frost_golem__stomp_huff.mp3',
  ],
  voice_boss_frost_golem_attack: [
    './assets/audio/sfx/voices/boss_frost_golem__attack_heavy.mp3',
    './assets/audio/sfx/voices/boss_frost_golem__attack_finisher.mp3',
  ],
  voice_boss_frost_golem_roar: ['./assets/audio/sfx/voices/boss_frost_golem__roar_phase.mp3'],
  voice_boss_frost_golem_hurt: ['./assets/audio/sfx/voices/boss_frost_golem__hurt.mp3'],
  voice_boss_frost_golem_death: ['./assets/audio/sfx/voices/boss_frost_golem__death.mp3'],
};

const PRIORITY_CRITICAL_CUES = new Set([
  'knight_q_phase1',
  'knight_q_phase2',
  'knight_q_phase3',
  'knight_q_ult',
  'mage_q_ult',
  'mage_q_meteor',
  'dragon_ice',
  'dragon_fire',
  'spell_frost_lance_cast',
  'spell_frost_lance_erupt',
  'spell_shatterlance_charge',
  'spell_shatterlance_charge_loop',
  'spell_shatterlance_release',
  'spell_shatterlance_impact',
  'spell_cinder_fall_launch',
  'spell_cinder_fall_impact',
  'spell_storm_lance_cast',
  'spell_storm_lance_impact',
  'detonation_shatterblow',
  'detonation_solar_flare',
  'detonation_thunderchain',
  'sword_none_c1',
  'sword_rime_c1',
  'sword_solar_c1',
  'mage_bolt_1',
  'mage_bolt_nova',
  'mage_bolt_impact_1',
  'mage_nova_impact',
  'shield_block',
  'shield_parry',
  'perfect_dodge',
  'player_hit',
  'hit_bone',
  'hit_armor',
  'death_foley_knight',
  'death_foley_mage',
  'death_foley_skeleton_pile',
  'death_foley_skeleton_shatter',
  'ui_click',
  'ui_tab_ice',
  'ui_tab_fire',
  'stone_inspect',
  'commune_start',
  'verdict_heal',
  'verdict_miracle',
  'verdict_smite',
  'amb_meadow',
  'amb_brook',
  'amb_commune',
  'enemy_foley_skeleton_warrior',
  'enemy_foley_skeleton_minion',
  'enemy_foley_werewolf',
  'enemy_foley_black_knight',
  'enemy_foley_necromancer',
  'enemy_foley_orc_raider',
  'enemy_foley_plant_warrior',
  'enemy_foley_boss_brute',
  'enemy_foley_boss_golem',
]);

// Categories of active actor sounds that MUST cut off immediately when the actor
// is interrupted, staggered, parried, dodges out of an action, or dies.
const INTERRUPTIBLE_CATEGORIES = new Set([
  'attack',
  'cast',
  'charge',
  'ult',
  'windup',
  'voice_attack',
]);

function createOpenAirValleyImpulse(ctx, durationSec = 0.88, decay = 3.5) {
  const sr = ctx.sampleRate || 48000;
  const len = Math.max(1, Math.floor(sr * durationSec));
  const buf = ctx.createBuffer(2, len, sr);
  const earlyTapsL = [
    [Math.floor(sr * 0.017), 0.34],
    [Math.floor(sr * 0.033), 0.24],
    [Math.floor(sr * 0.056), 0.16],
  ];
  const earlyTapsR = [
    [Math.floor(sr * 0.021), 0.34],
    [Math.floor(sr * 0.039), 0.24],
    [Math.floor(sr * 0.064), 0.16],
  ];
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const taps = ch === 0 ? earlyTapsL : earlyTapsR;
    for (const [idx, amp] of taps) {
      if (idx < len) data[idx] += amp;
    }
    let lp = 0;
    let rng = ch === 0 ? 0x9e3779b9 : 0x85ebca6b;
    const invSr = 1 / sr;
    const invRamp = 1 / (sr * 0.012);
    for (let i = 0; i < len; i++) {
      const t = i * invSr;
      const ramp = i * invRamp;
      const env = Math.exp(-t * decay) * (ramp < 1 ? ramp : 1);
      rng ^= rng << 13;
      rng ^= rng >>> 17;
      rng ^= rng << 5;
      const white = (rng >>> 0) * 4.656612873077393e-10 - 1.0;
      lp = lp * 0.78 + white * 0.22;
      data[i] += lp * env * 0.28;
    }
  }
  return buf;
}

const AMBIENCE_MODE_PRESETS = {
  title: { meadow: 0.25, brook: 0.12, commune: 0.04, lpfHz: 14000 },
  lobby: { meadow: 0.25, brook: 0.12, commune: 0.04, lpfHz: 14500 },
  valley: { meadow: 0.26, brook: 0.14, commune: 0.0, lpfHz: 16000 },
  combat: { meadow: 0.15, brook: 0.08, commune: 0.0, lpfHz: 15000 },
  stone: { meadow: 0.18, brook: 0.10, commune: 0.22, lpfHz: 12000 },
  commune: { meadow: 0.15, brook: 0.08, commune: 0.34, lpfHz: 11000 },
  pause: { meadow: 0.17, brook: 0.09, commune: 0.0, lpfHz: 920 },
};

export function createCombatSfx({ muted = false, masterVolume = 0.68 } = {}) {
  let isMuted = Boolean(muted);
  let volume = Math.max(0, Math.min(1.5, Number(masterVolume) || 0.68));
  let ctx = null;
  let masterGain = null;
  let compressor = null;
  let reverbConvolver = null;
  let reverbReturnGain = null;
  let ambLowpass = null;
  let ambMeadowGain = null;
  let ambBrookGain = null;
  let ambCommuneGain = null;
  let ambMeadowSrc = null;
  let ambBrookSrc = null;
  let ambCommuneSrc = null;
  let currentAmbienceMode = 'valley';
  let preloadStarted = false;
  let heroDeathSilenceUntilMs = 0;

  const bufferCache = new Map(); // url -> AudioBuffer
  const inflightMap = new Map(); // url -> Promise<AudioBuffer|null>
  const failedUrls = new Set();
  const rrState = new Map(); // cueKey -> lastIndex
  const lastCueTime = new Map(); // cueKey -> timestamp ms
  const lastHeroVoiceTime = new Map(); // `${heroId}_${category}` -> timestamp ms
  const activeFamilyNodes = new Map(); // family -> Array<{ gainNode, baseGain, stopAt }>
  const activeLoops = new Map(); // key -> { src, gainNode, actorId }

  // Causal Actor Ownership & Interruption state
  const activeActorNodes = new Map(); // actorId -> Array<{ src, gainNode, category, cueKey, stopAt }>
  const activeActorTimers = new Map(); // actorId -> Set<timeoutId>

  let playedCount = 0;
  let lastPlayedCue = null;
  const playedByCue = {};
  let interruptedCount = 0;
  const interruptedByActor = {};

  function nowMs() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function recordPlayStat(cueKey) {
    playedCount += 1;
    lastPlayedCue = cueKey;
    playedByCue[cueKey] = (playedByCue[cueKey] || 0) + 1;
  }

  function resolveActorId(actorOrId) {
    if (!actorOrId) return null;
    if (typeof actorOrId === 'string') {
      const lower = actorOrId.toLowerCase();
      if (lower === 'knight') return 'Knight';
      if (lower === 'mage') return 'Mage';
      return actorOrId;
    }
    if (typeof actorOrId === 'object') {
      if (actorOrId.instanceId) return String(actorOrId.instanceId);
      if (actorOrId.id) {
        const lower = String(actorOrId.id).toLowerCase();
        if (lower === 'knight') return 'Knight';
        if (lower === 'mage') return 'Mage';
        return String(actorOrId.id);
      }
      if (actorOrId.slotIndex !== undefined) return `enemy_slot_${actorOrId.slotIndex}`;
      if (actorOrId.archetype) return `enemy_${actorOrId.archetype}`;
    }
    return null;
  }

  function scheduleActorTimer(actorId, fn, delayMs) {
    const cleanActor = resolveActorId(actorId);
    const tid = setTimeout(() => {
      if (cleanActor && activeActorTimers.has(cleanActor)) {
        activeActorTimers.get(cleanActor).delete(tid);
      }
      if (!isMuted) fn();
    }, Math.max(0, delayMs));
    if (cleanActor) {
      let set = activeActorTimers.get(cleanActor);
      if (!set) {
        set = new Set();
        activeActorTimers.set(cleanActor, set);
      }
      set.add(tid);
    }
    return tid;
  }

  function clearActorTimers(actorId) {
    const cleanActor = resolveActorId(actorId);
    if (!cleanActor) return 0;
    const set = activeActorTimers.get(cleanActor);
    if (!set || set.size === 0) return 0;
    let cleared = 0;
    for (const tid of set) {
      clearTimeout(tid);
      cleared += 1;
    }
    set.clear();
    return cleared;
  }

  function applyAmbienceTargets(mode = currentAmbienceMode, rampSec = 0.35) {
    currentAmbienceMode = AMBIENCE_MODE_PRESETS[mode] ? mode : 'valley';
    if (!ctx || !ambMeadowGain || !ambBrookGain || !ambCommuneGain || !ambLowpass) return;
    const preset = AMBIENCE_MODE_PRESETS[currentAmbienceMode];
    const now = ctx.currentTime;
    const tau = Math.max(0.04, rampSec * 0.35);
    const muteFactor = isMuted ? 0.0 : 1.0;
    try {
      ambMeadowGain.gain.setTargetAtTime(preset.meadow * muteFactor, now, tau);
      ambBrookGain.gain.setTargetAtTime(preset.brook * muteFactor, now, tau);
      ambCommuneGain.gain.setTargetAtTime(preset.commune * muteFactor, now, tau);
      ambLowpass.frequency.setTargetAtTime(preset.lpfHz, now, tau);
    } catch {
      // ignore
    }
  }

  function tryStartAmbienceStem(stemKey, buf) {
    if (!ctx || !buf || isMuted) return;
    try {
      if (stemKey === 'amb_meadow' && !ambMeadowSrc && ambMeadowGain) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(ambMeadowGain);
        src.start(0);
        ambMeadowSrc = src;
      } else if (stemKey === 'amb_brook' && !ambBrookSrc && ambBrookGain) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(ambBrookGain);
        src.start(0);
        ambBrookSrc = src;
      } else if (stemKey === 'amb_commune' && !ambCommuneSrc && ambCommuneGain) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(ambCommuneGain);
        src.start(0);
        ambCommuneSrc = src;
      }
    } catch {
      // ignore
    }
  }

  function ensureContext() {
    if (isMuted) return null;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      if (!ctx) {
        ctx = new AudioCtx();
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-10, ctx.currentTime);
        compressor.knee.setValueAtTime(12, ctx.currentTime);
        compressor.ratio.setValueAtTime(3.5, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.14, ctx.currentTime);

        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(volume, ctx.currentTime);
        compressor.connect(masterGain);
        masterGain.connect(ctx.destination);

        // Shared Open-Air Valley Stereo Reverb Send
        if (typeof ctx.createConvolver === 'function') {
          reverbConvolver = ctx.createConvolver();
          reverbConvolver.buffer = createOpenAirValleyImpulse(ctx, 0.88, 3.5);
          reverbReturnGain = ctx.createGain();
          reverbReturnGain.gain.setValueAtTime(0.92, ctx.currentTime);
          reverbConvolver.connect(reverbReturnGain);
          reverbReturnGain.connect(compressor);
        }

        // Living World Ambience Bus (Meadow + Brook + Commune -> Lowpass -> Compressor)
        if (typeof ctx.createBiquadFilter === 'function') {
          ambLowpass = ctx.createBiquadFilter();
          ambLowpass.type = 'lowpass';
          ambLowpass.frequency.setValueAtTime(15000, ctx.currentTime);
          ambLowpass.connect(compressor);

          const preset = AMBIENCE_MODE_PRESETS[currentAmbienceMode] || AMBIENCE_MODE_PRESETS.valley;
          ambMeadowGain = ctx.createGain();
          ambMeadowGain.gain.setValueAtTime(preset.meadow, ctx.currentTime);
          ambMeadowGain.connect(ambLowpass);

          ambBrookGain = ctx.createGain();
          ambBrookGain.gain.setValueAtTime(preset.brook, ctx.currentTime);
          ambBrookGain.connect(ambLowpass);

          ambCommuneGain = ctx.createGain();
          ambCommuneGain.gain.setValueAtTime(preset.commune, ctx.currentTime);
          ambCommuneGain.connect(ambLowpass);
        }
      }
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (!preloadStarted) {
        preloadStarted = true;
        preloadCriticalBuffers();
      }
      return ctx;
    } catch {
      return null;
    }
  }

  function loadBufferUrl(url) {
    if (!url || typeof window === 'undefined' || typeof fetch !== 'function') {
      return Promise.resolve(null);
    }
    if (bufferCache.has(url)) {
      return Promise.resolve(bufferCache.get(url));
    }
    if (inflightMap.has(url)) {
      return inflightMap.get(url);
    }
    const audio = ensureContext();
    if (!audio) return Promise.resolve(null);

    const p = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((ab) => audio.decodeAudioData(ab))
      .then((decoded) => {
        bufferCache.set(url, decoded);
        inflightMap.delete(url);
        if (url === CUE_PATHS.amb_meadow?.[0]) tryStartAmbienceStem('amb_meadow', decoded);
        if (url === CUE_PATHS.amb_brook?.[0]) tryStartAmbienceStem('amb_brook', decoded);
        if (url === CUE_PATHS.amb_commune?.[0]) tryStartAmbienceStem('amb_commune', decoded);
        return decoded;
      })
      .catch(() => {
        failedUrls.add(url);
        inflightMap.delete(url);
        return null;
      });

    inflightMap.set(url, p);
    return p;
  }

  function preloadCriticalBuffers() {
    if (typeof window === 'undefined') return;
    // Load ambience stems first so Title/Valley never sits in -inf dB silence
    for (const ambKey of ['amb_meadow', 'amb_brook', 'amb_commune']) {
      const u = CUE_PATHS[ambKey]?.[0];
      if (u) loadBufferUrl(u);
    }
    const queue = [];
    for (const cueKey of PRIORITY_CRITICAL_CUES) {
      const list = CUE_PATHS[cueKey];
      if (!list) continue;
      for (const url of list) {
        queue.push(url);
      }
    }
    for (const list of Object.values(CUE_PATHS)) {
      for (const url of list) {
        if (!bufferCache.has(url) && !inflightMap.has(url)) {
          queue.push(url);
        }
      }
    }
    let cursor = 0;
    const drainBatch = () => {
      if (isMuted || !ctx) return;
      let loaded = 0;
      while (cursor < queue.length && loaded < 4) {
        const url = queue[cursor++];
        if (!bufferCache.has(url) && !inflightMap.has(url)) {
          loadBufferUrl(url);
          loaded++;
        }
      }
      if (cursor < queue.length) {
        setTimeout(drainBatch, 90);
      }
    };
    setTimeout(drainBatch, 60);
  }

  function setAmbienceState(mode = 'valley', { rampSec = 0.35 } = {}) {
    currentAmbienceMode = AMBIENCE_MODE_PRESETS[mode] ? mode : 'valley';
    // Defer creating WebAudio context & fetching ~150 MP3s until first user interaction or sound playback
    if (!ctx) return;
    applyAmbienceTargets(currentAmbienceMode, rampSec);
    for (const ambKey of ['amb_meadow', 'amb_brook', 'amb_commune']) {
      const u = CUE_PATHS[ambKey]?.[0];
      if (u && bufferCache.has(u)) {
        tryStartAmbienceStem(ambKey, bufferCache.get(u));
      }
    }
  }

  function preloadAll() {
    ensureContext();
    const promises = [];
    for (const list of Object.values(CUE_PATHS)) {
      for (const url of list) {
        promises.push(loadBufferUrl(url));
      }
    }
    return Promise.all(promises);
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const unlockOnce = () => {
      const audio = ensureContext();
      if (audio) {
        applyAmbienceTargets(currentAmbienceMode, 0.35);
      }
      if (audio && audio.state === 'running') {
        window.removeEventListener('pointerdown', unlockOnce, true);
        window.removeEventListener('keydown', unlockOnce, true);
        window.removeEventListener('touchstart', unlockOnce, true);
      }
    };
    window.addEventListener('pointerdown', unlockOnce, true);
    window.addEventListener('keydown', unlockOnce, true);
    window.addEventListener('touchstart', unlockOnce, true);
  }

  function pickVariationUrl(cueKey) {
    const list = CUE_PATHS[cueKey];
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];
    const lastIdx = rrState.get(cueKey) ?? -1;
    let nextIdx = (lastIdx + 1) % list.length;
    if (list.length >= 3 && Math.random() < 0.35) {
      nextIdx = (lastIdx + 2) % list.length;
    }
    rrState.set(cueKey, nextIdx);
    return list[nextIdx];
  }

  function duckFamilyTail(family, audio) {
    if (!family || !audio) return;
    const list = activeFamilyNodes.get(family);
    if (!list || list.length === 0) return;
    const now = audio.currentTime;
    const alive = [];
    for (const item of list) {
      if (item.stopAt <= now) continue;
      try {
        item.gainNode.gain.cancelScheduledValues(now);
        item.gainNode.gain.setValueAtTime(Math.max(0.0001, item.gainNode.gain.value), now);
        item.gainNode.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, item.baseGain * 0.18),
          now + 0.028
        );
        alive.push(item);
      } catch {
        // ignore
      }
    }
    activeFamilyNodes.set(family, alive.slice(-4));
  }

  function registerActorNode(actorId, nodeEntry) {
    const cleanActor = resolveActorId(actorId);
    if (!cleanActor) return;
    const now = ctx ? ctx.currentTime : 0;
    const list = (activeActorNodes.get(cleanActor) || []).filter((it) => it.stopAt > now);
    list.push(nodeEntry);
    activeActorNodes.set(cleanActor, list.slice(-10));
  }

  /**
   * Immediately cuts off (`fadeSec = 0.028s`) any active attack, cast, charge,
   * windup, ultimate, or attack-voice sound owned by `actorOrId`, and cancels
   * any pending phase timers for that actor.
   */
  function interruptActor(
    actorOrId,
    { fadeSec = 0.028, categories = INTERRUPTIBLE_CATEGORIES } = {}
  ) {
    const cleanActor = resolveActorId(actorOrId);
    if (!cleanActor) return 0;

    let choked = clearActorTimers(cleanActor);

    // Also stop any active charge loop owned by this actor
    if (cleanActor === 'Mage') {
      for (const [lk] of activeLoops.entries()) {
        if (lk.startsWith('charge_')) {
          stopLoop(lk, fadeSec);
          choked += 1;
        }
      }
    }

    const list = activeActorNodes.get(cleanActor);
    if (list && list.length > 0 && ctx) {
      const now = ctx.currentTime;
      const keep = [];
      for (const item of list) {
        if (item.stopAt <= now) continue;
        if (!categories || categories.has(item.category)) {
          try {
            item.gainNode.gain.cancelScheduledValues(now);
            item.gainNode.gain.setValueAtTime(Math.max(0.0001, item.gainNode.gain.value), now);
            item.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + fadeSec);
            item.src.stop(now + fadeSec + 0.008);
            choked += 1;
          } catch {
            // ignore
          }
        } else {
          keep.push(item);
        }
      }
      activeActorNodes.set(cleanActor, keep);
    }

    if (choked > 0) {
      interruptedCount += choked;
      interruptedByActor[cleanActor] = (interruptedByActor[cleanActor] || 0) + choked;
    }
    return choked;
  }

  function resolveDefaultReverbSend(category, cueKey) {
    if (category === 'footstep' || cueKey.startsWith('ui_')) return 0.0;
    if (category === 'ult' || category === 'death' || category === 'voice_death' || cueKey.startsWith('verdict_')) {
      return 0.22;
    }
    if (
      category === 'cast' ||
      category === 'attack' ||
      category === 'impact' ||
      category === 'windup' ||
      category === 'roar' ||
      category.startsWith('voice_')
    ) {
      return 0.15;
    }
    return 0.12;
  }

  function playBufferNode(
    audio,
    buf,
    {
      gain = 0.75,
      rate = 1.0,
      pan = 0.0,
      family = null,
      delay = 0,
      loop = false,
      loopStart = undefined,
      loopEnd = undefined,
      fadeInSec = 0,
      loopKey = null,
      actorId = null,
      category = 'sfx',
      cueKey = '',
      reverbSend = undefined,
    } = {}
  ) {
    try {
      const t0 = audio.currentTime + Math.max(0, delay);
      if (family) {
        duckFamilyTail(family, audio);
      }

      const src = audio.createBufferSource();
      src.buffer = buf;
      src.loop = Boolean(loop);
      if (loop && typeof loopStart === 'number' && loopStart >= 0) {
        src.loopStart = loopStart;
      }
      if (loop && typeof loopEnd === 'number' && loopEnd > (loopStart || 0)) {
        src.loopEnd = Math.min(buf.duration || loopEnd, loopEnd);
      }
      src.playbackRate.setValueAtTime(Math.max(0.5, Math.min(1.6, rate)), t0);

      const gainNode = audio.createGain();
      const effGain = Math.max(0.001, Math.min(1.6, gain));
      if (fadeInSec > 0.002) {
        gainNode.gain.setValueAtTime(0.0001, audio.currentTime);
        gainNode.gain.setValueAtTime(0.0001, t0);
        gainNode.gain.linearRampToValueAtTime(effGain, t0 + fadeInSec);
      } else {
        gainNode.gain.setValueAtTime(effGain, t0);
      }

      let lastNode = src;
      lastNode.connect(gainNode);
      lastNode = gainNode;

      if (typeof audio.createStereoPanner === 'function' && Math.abs(pan) > 0.02) {
        const panner = audio.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-0.85, Math.min(0.85, pan)), t0);
        lastNode.connect(panner);
        lastNode = panner;
      }

      lastNode.connect(compressor || audio.destination);

      const wetAmt =
        typeof reverbSend === 'number'
          ? reverbSend
          : resolveDefaultReverbSend(category, cueKey);
      if (reverbConvolver && wetAmt > 0.01) {
        const sendNode = audio.createGain();
        sendNode.gain.setValueAtTime(wetAmt, t0);
        lastNode.connect(sendNode);
        sendNode.connect(reverbConvolver);
      }

      src.start(t0);

      const dur = (buf.duration || 0.5) / Math.max(0.5, rate);
      const stopAt = loop ? t0 + 24.0 : t0 + dur;

      if (loopKey) {
        stopLoop(loopKey);
        activeLoops.set(loopKey, { src, gainNode, actorId: resolveActorId(actorId), startAt: t0 });
      } else if (family) {
        const list = activeFamilyNodes.get(family) || [];
        list.push({ gainNode, baseGain: effGain, stopAt });
        activeFamilyNodes.set(family, list.slice(-6));
      }

      if (actorId) {
        registerActorNode(actorId, { src, gainNode, category, cueKey, stopAt });
      }
      return src;
    } catch {
      return null;
    }
  }

  function stopLoop(loopKey, fadeSec = 0.035) {
    const entry = activeLoops.get(loopKey);
    if (!entry) return false;
    activeLoops.delete(loopKey);
    try {
      const now = ctx ? ctx.currentTime : 0;
      if (entry.startAt && entry.startAt > now + 0.005) {
        // Node hasn't started playing yet; mute and cancel immediately
        entry.gainNode.gain.cancelScheduledValues(now);
        entry.gainNode.gain.setValueAtTime(0.0001, now);
        entry.src.stop(now);
        return true;
      }
      entry.gainNode.gain.cancelScheduledValues(now);
      entry.gainNode.gain.setValueAtTime(Math.max(0.0001, entry.gainNode.gain.value), now);
      entry.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + fadeSec);
      entry.src.stop(now + fadeSec + 0.01);
      return true;
    } catch {
      return false;
    }
  }

  function playCue(
    cueKey,
    {
      gain = 0.78,
      pitchJitter = 0.03,
      rateBase = 1.0,
      pan = 0.0,
      minIntervalMs = 28,
      family = null,
      delay = 0,
      actorId = null,
      category = 'sfx',
      reverbSend = undefined,
    } = {}
  ) {
    recordPlayStat(cueKey);
    if (isMuted) return false;
    const tMs = nowMs();
    const prevMs = lastCueTime.get(cueKey) || -99999;
    if (minIntervalMs > 0 && tMs - prevMs < minIntervalMs) {
      return false;
    }
    lastCueTime.set(cueKey, tMs);

    const audio = ensureContext();
    if (!audio) return false;

    const url = pickVariationUrl(cueKey);
    if (!url) return false;

    const jitter = pitchJitter > 0 ? 1.0 + (Math.random() * 2 - 1) * pitchJitter : 1.0;
    const rate = rateBase * jitter;

    const cached = bufferCache.get(url);
    if (cached) {
      playBufferNode(audio, cached, {
        gain,
        rate,
        pan,
        family,
        delay,
        actorId,
        category,
        cueKey,
        reverbSend,
      });
      return true;
    }

    const reqAt = nowMs();
    loadBufferUrl(url).then((buf) => {
      if (buf && !isMuted && nowMs() - reqAt < 220) {
        playBufferNode(audio, buf, {
          gain,
          rate,
          pan,
          family,
          delay,
          actorId,
          category,
          cueKey,
          reverbSend,
        });
      }
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Hero & Monster Voice + Death Helpers
  // ---------------------------------------------------------------------------

  function playHeroVoice(heroId = 'Knight', category = 'atk', { gain = undefined, force = false } = {}) {
    const isMage = String(heroId || 'Knight').toLowerCase() === 'mage';
    const cleanHero = isMage ? 'Mage' : 'Knight';
    const prefix = isMage ? 'voice_mage' : 'voice_knight';
    const cueKey = `${prefix}_${category}`;
    if (!CUE_PATHS[cueKey]) return false;

    const tMs = nowMs();
    // Respect Hero Death isolation: never let the partner shout over a dying Hero!
    if (category !== 'death' && tMs < heroDeathSilenceUntilMs) {
      return false;
    }

    const isRoutineBark = category === 'atk' || category === 'cast';
    const heroVoiceKey = `${cleanHero}_${category}`;
    const prevHeroVoiceMs = lastHeroVoiceTime.get(heroVoiceKey) || -99999;
    const requiredHeroCooldownMs =
      category === 'death'
        ? 80
        : force
          ? 160
          : isRoutineBark
            ? 1150
            : category === 'dodge'
              ? 750
              : 420;
    if (tMs - prevHeroVoiceMs < requiredHeroCooldownMs) {
      return false;
    }
    lastHeroVoiceTime.set(heroVoiceKey, tMs);

    const defaultGain =
      category === 'death'
        ? 0.96
        : category === 'hurt'
          ? 0.56
          : category === 'finisher'
            ? 0.50
            : category === 'pray'
              ? 0.48
              : 0.40;
    const effGain = typeof gain === 'number' ? gain : defaultGain;
    const isAttackVoice = category === 'atk' || category === 'cast' || category === 'finisher';
    return playCue(cueKey, {
      gain: effGain,
      pitchJitter: 0.015,
      minIntervalMs: requiredHeroCooldownMs,
      family: `${prefix}_voice`,
      actorId: cleanHero,
      category: isAttackVoice ? 'voice_attack' : `voice_${category}`,
    });
  }

  function resolveEnemyVoicePrefix(enemyOrArch) {
    const raw = String(
      enemyOrArch?.archetype || enemyOrArch?.charId || enemyOrArch?.poolRole || enemyOrArch || ''
    ).toLowerCase();
    if (raw.includes('frost_golem') || raw.includes('skeleton_golem') || raw.includes('golem')) {
      return 'voice_boss_frost_golem';
    }
    if (raw.includes('brute') || raw.includes('boss_orc')) {
      return 'voice_boss_brute';
    }
    if (raw.includes('werewolf') || raw.includes('wolf')) {
      return 'voice_werewolf';
    }
    if (raw.includes('black_knight')) {
      return 'voice_black_knight';
    }
    if (raw.includes('necromancer') || raw.includes('skeleton_mage') || raw.includes('mage')) {
      return 'voice_necromancer';
    }
    if (raw.includes('orc')) {
      return 'voice_orc_raider';
    }
    if (raw.includes('plant')) {
      return 'voice_plant_warrior';
    }
    if (raw.includes('minion')) {
      return 'voice_skeleton_minion';
    }
    return 'voice_skeleton_warrior';
  }

  function resolveEnemyDeathFoleyCue(enemyOrArch, { intoPile = false, finishedPile = false } = {}) {
    if (intoPile) return 'death_foley_skeleton_pile';
    if (finishedPile) return 'death_foley_skeleton_shatter';
    const raw = String(
      enemyOrArch?.archetype || enemyOrArch?.charId || enemyOrArch?.poolRole || enemyOrArch || ''
    ).toLowerCase();
    if (raw.includes('frost_golem') || raw.includes('skeleton_golem') || raw.includes('golem')) {
      return 'death_foley_boss_golem';
    }
    if (raw.includes('brute') || raw.includes('boss_orc')) {
      return 'death_foley_boss_brute';
    }
    if (raw.includes('black_knight')) {
      return 'death_foley_black_knight';
    }
    if (raw.includes('werewolf') || raw.includes('wolf')) {
      return 'death_foley_werewolf';
    }
    if (raw.includes('orc')) {
      return 'death_foley_orc';
    }
    if (raw.includes('plant') || raw.includes('demon_tree')) {
      return 'death_foley_plant';
    }
    if (raw.includes('necromancer') || raw.includes('skeleton_mage') || raw.includes('mage')) {
      return 'death_foley_necromancer';
    }
    return 'death_foley_skeleton_shatter';
  }

  // ---------------------------------------------------------------------------
  // Public Game Combat, Interruption, Death & UI SFX API
  // ---------------------------------------------------------------------------

  function playSwordSlash(comboIndex = 0, breathingStyle = 'none') {
    const style =
      breathingStyle === 'solar' || breathingStyle === 'fire'
        ? 'solar'
        : breathingStyle === 'rime' || breathingStyle === 'ice'
          ? 'rime'
          : breathingStyle === 'eclipse'
            ? comboIndex % 2 === 0
              ? 'solar'
              : 'rime'
            : 'none';
    const cNum = Math.max(1, Math.min(3, (Number(comboIndex) || 0) + 1));
    playCue(`sword_${style}_c${cNum}`, {
      gain: style === 'none' ? 0.92 : 0.96,
      pitchJitter: 0.035,
      minIntervalMs: 42,
      family: 'knight_sword',
      actorId: 'Knight',
      category: 'attack',
    });
    if (breathingStyle === 'eclipse') {
      const twinStyle = style === 'solar' ? 'rime' : 'solar';
      playCue(`sword_${twinStyle}_c${cNum}`, {
        gain: 0.64,
        pitchJitter: 0.04,
        minIntervalMs: 42,
        delay: 0.018,
        actorId: 'Knight',
        category: 'attack',
      });
    }
    if (
      (comboIndex === 0 && Math.random() < 0.42) ||
      (comboIndex === 2 && Math.random() < 0.52)
    ) {
      playHeroVoice('Knight', 'atk', { gain: 0.38 });
    }
  }

  function playHeavyFinisher(breathingStyle = 'none') {
    const style =
      breathingStyle === 'solar' || breathingStyle === 'fire'
        ? 'solar'
        : breathingStyle === 'rime' || breathingStyle === 'ice'
          ? 'rime'
          : 'none';
    playCue(`sword_heavy_${style}`, {
      gain: 1.02,
      pitchJitter: 0.025,
      minIntervalMs: 55,
      family: 'knight_sword',
      actorId: 'Knight',
      category: 'attack',
    });
    if (breathingStyle === 'eclipse') {
      playCue('sword_heavy_rime', {
        gain: 0.72,
        pitchJitter: 0.03,
        minIntervalMs: 55,
        delay: 0.02,
        actorId: 'Knight',
        category: 'attack',
      });
    }
    playHeroVoice('Knight', 'finisher', { gain: 0.48, force: true });
  }

  function playBreathingIgnition(breathingStyle = 'rime', options = {}) {
    if (options?.passive) {
      const tabCue = breathingStyle === 'solar' || breathingStyle === 'fire' ? 'ui_tab_fire' : 'ui_tab_ice';
      playCue(tabCue, { gain: 0.64, minIntervalMs: 120 });
      return;
    }
    const isFire = breathingStyle === 'solar' || breathingStyle === 'fire';
    if (breathingStyle === 'eclipse') {
      playCue('dragon_ice', {
        gain: 0.94,
        pitchJitter: 0.02,
        minIntervalMs: 120,
        pan: -0.25,
        actorId: 'Knight',
        category: 'cast',
      });
      playCue('dragon_fire', {
        gain: 0.96,
        pitchJitter: 0.02,
        minIntervalMs: 120,
        pan: 0.25,
        delay: 0.03,
        actorId: 'Knight',
        category: 'cast',
      });
    } else {
      playCue(isFire ? 'dragon_fire' : 'dragon_ice', {
        gain: 1.04,
        pitchJitter: 0.025,
        minIntervalMs: 120,
        family: 'knight_dragon',
        actorId: 'Knight',
        category: 'cast',
      });
    }
    playHeroVoice('Knight', 'finisher', { gain: 0.46 });
  }

  function playMageBolt(comboIndex = 0, { ascended = false } = {}) {
    if (comboIndex >= 3 || ascended) {
      playCue('mage_bolt_nova', {
        gain: 0.98,
        pitchJitter: 0.025,
        minIntervalMs: 50,
        family: 'mage_bolt',
        actorId: 'Mage',
        category: 'attack',
      });
      playHeroVoice('Mage', 'finisher', { gain: 0.48, force: true });
    } else {
      const idx = Math.max(1, Math.min(3, (Number(comboIndex) || 0) + 1));
      playCue(`mage_bolt_${idx}`, {
        gain: 0.90,
        pitchJitter: 0.035,
        minIntervalMs: 42,
        family: 'mage_bolt',
        actorId: 'Mage',
        category: 'attack',
      });
      if (
        (comboIndex === 0 && Math.random() < 0.42) ||
        (comboIndex === 2 && Math.random() < 0.52)
      ) {
        playHeroVoice('Mage', 'cast', { gain: 0.36 });
      }
    }
  }

  function playMageBoltImpact(comboIndex = 0, { ascended = false, pan = 0.0 } = {}) {
    if (comboIndex >= 3 || ascended) {
      playCue('mage_nova_impact', {
        gain: 0.98,
        pitchJitter: 0.03,
        pan,
        minIntervalMs: 45,
        family: 'mage_bolt_impact',
        category: 'impact',
      });
    } else {
      const idx = Math.max(1, Math.min(3, (Number(comboIndex) || 0) + 1));
      playCue(`mage_bolt_impact_${idx}`, {
        gain: 0.88,
        pitchJitter: 0.04,
        pan,
        minIntervalMs: 38,
        family: 'mage_bolt_impact',
        category: 'impact',
      });
    }
  }

  function playSpellCharge(spellId = 'shatterlance') {
    recordPlayStat(`charge_${spellId}`);
    if (isMuted) return false;
    const audio = ensureContext();
    if (!audio) return false;

    // Cleanly stop any prior charge buildup or equilibrium hold loop before starting a fresh charge
    cancelSpellCharge(spellId);

    const buildupUrl = CUE_PATHS.spell_shatterlance_charge?.[0];
    const holdLoopUrl = CUE_PATHS.spell_shatterlance_charge_loop?.[0] || buildupUrl;
    if (!buildupUrl) return false;

    const buildupKey = `charge_buildup_${spellId}`;
    const loopKey = `charge_${spellId}`;

    // 1. Phase 1 & 2 (0.00..0.95s): One-shot 3-wave ascending shard nucleation & lock chimes
    //    followed by deep sub-bass atmospheric vacuum pull & rising cryo-turbine spin-up!
    const startBuildup = (buf) => {
      playBufferNode(audio, buf, {
        gain: 0.88,
        rate: 1.0,
        loop: false,
        loopKey: buildupKey,
        actorId: 'Mage',
        category: 'charge',
        cueKey: 'spell_shatterlance_charge',
      });
    };

    const cachedBuildup = bufferCache.get(buildupUrl);
    if (cachedBuildup) {
      startBuildup(cachedBuildup);
    } else {
      const reqAt = nowMs();
      loadBufferUrl(buildupUrl).then((buf) => {
        if (buf && !isMuted && nowMs() - reqAt < 250) {
          startBuildup(buf);
        }
      });
    }

    // 2. Phase 3 (0.88s+): Seamless periodic equilibrium overcharge hold loop
    //    (`loopStart = 0.08s, loopEnd = 2.28s` for zero MP3 padding gap and zero seam clicks)
    const startHoldLoop = (buf, delaySec) => {
      playBufferNode(audio, buf, {
        gain: 0.78,
        rate: 1.0,
        delay: delaySec,
        fadeInSec: 0.14,
        loop: true,
        loopStart: 0.08,
        loopEnd: 2.28,
        loopKey,
        actorId: 'Mage',
        category: 'charge',
        cueKey: 'spell_shatterlance_charge_loop',
      });
    };

    if (holdLoopUrl) {
      const cachedLoop = bufferCache.get(holdLoopUrl);
      if (cachedLoop) {
        startHoldLoop(cachedLoop, 0.88);
      } else {
        const reqAt = nowMs();
        loadBufferUrl(holdLoopUrl).then((buf) => {
          if (!buf || isMuted) return;
          const elapsedSec = (nowMs() - reqAt) * 0.001;
          // Only schedule if the charge wasn't already cancelled during buffer load
          if (activeLoops.has(buildupKey) || elapsedSec < 0.05) {
            startHoldLoop(buf, Math.max(0.02, 0.88 - elapsedSec));
          }
        });
      }
    }

    return true;
  }

  function updateSpellCharge(spellId = 'shatterlance', { holdTime = 0, chargeProgress = 0 } = {}) {
    if (isMuted || !ctx) return false;
    const entry = activeLoops.get(`charge_${spellId}`);
    if (!entry || !entry.src) return false;
    try {
      const now = ctx.currentTime;
      const steadyRate = 1.0 + Math.min(0.04, Math.max(0, chargeProgress - 0.95) * 0.4);
      entry.src.playbackRate.setTargetAtTime(steadyRate, now, 0.06);
      return true;
    } catch {
      return false;
    }
  }

  function cancelSpellCharge(spellId = 'shatterlance') {
    const stoppedBuildup = stopLoop(`charge_buildup_${spellId}`, 0.028);
    const stoppedHold = stopLoop(`charge_${spellId}`, 0.028);
    return Boolean(stoppedBuildup || stoppedHold);
  }

  function playSpellImpact(spellId = 'frost_lance', { pan = 0.0 } = {}) {
    const impactMap = {
      frost_lance: 'spell_frost_lance_erupt',
      shatterlance: 'spell_shatterlance_impact',
      cinder_fall: 'spell_cinder_fall_impact',
      storm_lance: 'spell_storm_lance_impact',
    };
    const cueKey = impactMap[spellId] || 'spell_frost_lance_erupt';
    return playCue(cueKey, {
      gain: 1.05,
      pitchJitter: 0.025,
      pan,
      minIntervalMs: 55,
      family: 'mage_spell_impact',
      category: 'impact',
    });
  }

  function playSpellCast(spellId = 'frost_lance', options = {}) {
    cancelSpellCharge('shatterlance');
    const castMap = {
      frost_lance: 'spell_frost_lance_cast',
      shatterlance: 'spell_shatterlance_release',
      cinder_fall: 'spell_cinder_fall_launch',
      storm_lance: 'spell_storm_lance_cast',
    };
    const castCue = castMap[spellId] || 'spell_frost_lance_cast';
    playCue(castCue, {
      gain: 0.98,
      pitchJitter: 0.025,
      minIntervalMs: 60,
      family: 'mage_spell_cast',
      actorId: 'Mage',
      category: 'cast',
    });

    if (spellId === 'shatterlance') {
      playHeroVoice('Mage', 'finisher', { gain: 0.46 });
    } else {
      playHeroVoice('Mage', 'cast', { gain: 0.42, force: true });
    }

    // Schedule phase-synced impact via owned `scheduleActorTimer('Mage', ...)` so
    // `interruptActor('Mage')` cleanly cancels delayed spell impacts on stun/death!
    if (!options?.skipScheduledImpact) {
      const dist = Number(options?.distance) || 12.0;
      const delayMs =
        spellId === 'cinder_fall'
          ? Math.max(140, Math.min(620, Math.round((dist / 22.5) * 1000)))
          : spellId === 'shatterlance'
            ? Math.max(110, Math.min(260, Math.round((dist / 58.0) * 1000)))
            : spellId === 'storm_lance'
              ? 65
              : 185;
      scheduleActorTimer(
        'Mage',
        () => {
          playSpellImpact(spellId);
        },
        delayMs
      );
    }
  }

  function playDetonation(detonationId = 'shatterblow') {
    const map = {
      shatterblow: 'detonation_shatterblow',
      solar_flare: 'detonation_solar_flare',
      thunderchain: 'detonation_thunderchain',
      eclipse: 'detonation_solar_flare',
    };
    const cueKey = map[detonationId] || 'detonation_shatterblow';
    playCue(cueKey, {
      gain: 1.08,
      pitchJitter: 0.02,
      minIntervalMs: 65,
      family: 'detonation',
      category: 'impact',
    });
    if (detonationId === 'eclipse') {
      playCue('detonation_shatterblow', {
        gain: 0.88,
        pitchJitter: 0.02,
        minIntervalMs: 65,
        delay: 0.025,
        category: 'impact',
      });
    }
  }

  function playShieldBlock(kind = 'block') {
    if (kind === 'raise') {
      // Raising shield cancels any active sword swing audio on the Knight
      interruptActor('Knight', { categories: new Set(['attack']) });
    }
    const map = {
      raise: 'shield_raise',
      block: 'shield_block',
      clang: 'shield_block',
      parry: 'shield_parry',
      bash: 'shield_bash',
      intercept: 'shield_bash',
    };
    const cueKey = map[kind] || 'shield_block';
    playCue(cueKey, {
      gain: kind === 'raise' ? 0.86 : 1.02,
      pitchJitter: 0.03,
      minIntervalMs: 55,
      family: 'shield',
    });
  }

  function playShieldChime() {
    playShieldBlock('parry');
  }

  function playDodge(heroId = 'Knight') {
    const isMage = String(heroId || 'Knight').toLowerCase() === 'mage';
    const cleanHero = isMage ? 'Mage' : 'Knight';
    // Dodging immediately cancels any active attack/cast/charge sound on that hero
    interruptActor(cleanHero, { categories: new Set(['attack', 'cast', 'charge', 'voice_attack']) });
    playCue(isMage ? 'dodge_mage' : 'dodge_knight', {
      gain: 0.44,
      pitchJitter: 0.04,
      minIntervalMs: 90,
      family: 'dodge',
      actorId: cleanHero,
      category: 'dodge',
    });
    if (Math.random() < 0.45) {
      playHeroVoice(cleanHero, 'dodge', { gain: 0.36 });
    }
  }

  function playPerfectDodge(heroId = 'Knight') {
    const isMage = String(heroId || 'Knight').toLowerCase() === 'mage';
    const cleanHero = isMage ? 'Mage' : 'Knight';
    interruptActor(cleanHero, { categories: new Set(['attack', 'cast', 'charge', 'voice_attack']) });
    playCue('perfect_dodge', {
      gain: 0.98,
      pitchJitter: 0.015,
      minIntervalMs: 120,
      family: 'perfect_dodge',
    });
  }

  function playKnightUltimate(phase = 'full') {
    if (phase === 'cut1') {
      clearActorTimers('Knight');
      playCue('knight_q_phase2', {
        gain: 1.02,
        pitchJitter: 0.02,
        minIntervalMs: 40,
        pan: -0.22,
        family: 'ultimate',
        actorId: 'Knight',
        category: 'ult',
      });
      return;
    }
    if (phase === 'cut2') {
      clearActorTimers('Knight');
      playCue('knight_q_phase3', {
        gain: 1.08,
        pitchJitter: 0.02,
        minIntervalMs: 40,
        pan: 0.18,
        family: 'ultimate',
        actorId: 'Knight',
        category: 'ult',
      });
      return;
    }
    clearActorTimers('Knight');
    playCue('knight_q_phase1', {
      gain: 1.04,
      pitchJitter: 0.015,
      minIntervalMs: 120,
      family: 'ultimate',
      actorId: 'Knight',
      category: 'ult',
    });
    playHeroVoice('Knight', 'finisher', { gain: 0.52, force: true });
    // Fallback phase timers in case `cut1` / `cut2` are not driven by `player-controller.js`
    scheduleActorTimer(
      'Knight',
      () => {
        playCue('knight_q_phase2', {
          gain: 1.00,
          pitchJitter: 0.02,
          minIntervalMs: 40,
          pan: -0.22,
          family: 'ultimate',
          actorId: 'Knight',
          category: 'ult',
        });
      },
      380
    );
    scheduleActorTimer(
      'Knight',
      () => {
        playCue('knight_q_phase3', {
          gain: 1.08,
          pitchJitter: 0.02,
          minIntervalMs: 40,
          pan: 0.18,
          family: 'ultimate',
          actorId: 'Knight',
          category: 'ult',
        });
      },
      700
    );
  }

  function playMageUltimate() {
    cancelSpellCharge('shatterlance');
    playCue('mage_q_ult', {
      gain: 1.04,
      pitchJitter: 0.015,
      minIntervalMs: 180,
      family: 'ultimate',
      actorId: 'Mage',
      category: 'ult',
    });
    playHeroVoice('Mage', 'finisher', { gain: 0.52, force: true });
  }

  function playStarfallMeteor(meteorIndex = 0) {
    if (meteorIndex > 0 && meteorIndex % 2 !== 0) return;
    const pan = ((meteorIndex % 5) - 2) * 0.18;
    playCue('mage_q_meteor', {
      gain: meteorIndex === 0 ? 1.02 : 0.88,
      pitchJitter: 0.055,
      pan,
      minIntervalMs: 135,
      family: 'starfall_meteor',
      category: 'impact',
    });
  }

  function playCouplesUltimate(heroOrKind = 'couples') {
    const k = String(heroOrKind || 'couples').toLowerCase();
    if (k === 'knight') {
      playKnightUltimate('full');
      return;
    }
    if (k === 'mage') {
      playMageUltimate();
      return;
    }
    playKnightUltimate('full');
    playMageUltimate();
  }

  const ENEMY_FOLEY_BY_VOICE_PREFIX = {
    voice_werewolf: 'enemy_foley_werewolf',
    voice_black_knight: 'enemy_foley_black_knight',
    voice_necromancer: 'enemy_foley_necromancer',
    voice_boss_brute: 'enemy_foley_boss_brute',
    voice_boss_frost_golem: 'enemy_foley_boss_golem',
    voice_orc_raider: 'enemy_foley_orc_raider',
    voice_plant_warrior: 'enemy_foley_plant_warrior',
    voice_skeleton_minion: 'enemy_foley_skeleton_minion',
    voice_skeleton_warrior: 'enemy_foley_skeleton_warrior',
  };

  function playEnemyWindup(kind = 'melee', enemy = null) {
    const actorId = resolveActorId(enemy);
    const vPref = resolveEnemyVoicePrefix(enemy);
    const foleyCue = ENEMY_FOLEY_BY_VOICE_PREFIX[vPref] || 'enemy_foley_skeleton_warrior';

    if (vPref === 'voice_werewolf') {
      playCue('voice_werewolf_windup', {
        gain: 0.78,
        pitchJitter: 0.03,
        minIntervalMs: 240,
        actorId,
        category: 'windup',
      });
      playCue(foleyCue, {
        gain: 0.84,
        pitchJitter: 0.03,
        minIntervalMs: 260,
        actorId,
        category: 'windup',
      });
      return;
    }

    if (kind === 'heavy' || enemy?.isBoss) {
      const roarCue = `${vPref}_roar`;
      if (CUE_PATHS[roarCue]) {
        playCue(roarCue, {
          gain: 0.64,
          pitchJitter: 0.025,
          minIntervalMs: 380,
          actorId,
          category: 'windup',
        });
      } else if (CUE_PATHS[`${vPref}_attack`]) {
        playCue(`${vPref}_attack`, {
          gain: 0.56,
          pitchJitter: 0.03,
          minIntervalMs: 260,
          actorId,
          category: 'windup',
        });
      }
      if (CUE_PATHS[foleyCue]) {
        playCue(foleyCue, {
          gain: 0.90,
          pitchJitter: 0.025,
          minIntervalMs: 360,
          actorId,
          category: 'windup',
        });
      }
      return;
    }

    const atkCue = `${vPref}_attack`;
    if (CUE_PATHS[atkCue]) {
      playCue(atkCue, {
        gain: 0.46,
        pitchJitter: 0.04,
        minIntervalMs: 260,
        family: 'enemy_voice',
        actorId,
        category: 'windup',
      });
    }
    if (CUE_PATHS[foleyCue]) {
      playCue(foleyCue, {
        gain: 0.80,
        pitchJitter: 0.035,
        minIntervalMs: 260,
        actorId,
        category: 'windup',
      });
    }
  }

  function playEnemyDeath(enemy, { intoPile = false, finishedPile = false } = {}) {
    const actorId = resolveActorId(enemy);
    // 1. Immediately choke any active windup/attack/roar sound owned by this dying enemy!
    if (actorId) {
      interruptActor(actorId);
    }

    // 2. Play physical collapse / bone-pile / armor-crash foley
    const foleyCue = resolveEnemyDeathFoleyCue(enemy, { intoPile, finishedPile });
    playCue(foleyCue, {
      gain: enemy?.isBoss ? 1.02 : 0.92,
      pitchJitter: 0.035,
      minIntervalMs: 55,
      family: 'enemy_death_foley',
      category: 'death',
    });

    // 3. Play dedicated death vocal cry (unless finishing an already-collapsed bone pile)
    if (!finishedPile) {
      const vPref = resolveEnemyVoicePrefix(enemy);
      const deathVoiceCue = CUE_PATHS[`${vPref}_death`] ? `${vPref}_death` : `${vPref}_hurt`;
      if (CUE_PATHS[deathVoiceCue]) {
        playCue(deathVoiceCue, {
          gain: intoPile ? 0.56 : enemy?.isBoss ? 0.80 : 0.68,
          rateBase: intoPile ? 1.04 : 0.96,
          pitchJitter: 0.035,
          minIntervalMs: 90,
          family: 'enemy_death_voice',
          category: 'death',
        });
      }
    }
  }

  function playHeroDeath(heroId = 'Knight') {
    const isMage = String(heroId || 'Knight').toLowerCase() === 'mage';
    const cleanHero = isMage ? 'Mage' : 'Knight';
    const partnerHero = isMage ? 'Knight' : 'Mage';
    // 1. Immediately choke any active attack/cast/charge/ult sound and attack voice on BOTH heroes
    //    and enforce a 2.4s hero-death vocal isolation window so the AI partner never yells over the death!
    heroDeathSilenceUntilMs = nowMs() + 2400;
    interruptActor(cleanHero);
    interruptActor(partnerHero, { categories: new Set(['voice_attack']) });

    // 2. Play hero physical collapse foley (plate armor & sword clatter vs ash staff & silk collapse)
    playCue(isMage ? 'death_foley_mage' : 'death_foley_knight', {
      gain: 1.04,
      pitchJitter: 0.02,
      minIntervalMs: 120,
      family: 'hero_death_foley',
      actorId: cleanHero,
      category: 'death',
    });

    // 3. Play dramatic hero death vocalization at full emotional prominence
    playHeroVoice(cleanHero, 'death', { gain: 1.05, force: true });
  }

  function playEnemyEvent(enemy, event = 'attack') {
    const actorId = resolveActorId(enemy);
    const vPref = resolveEnemyVoicePrefix(enemy);
    if (event === 'appear' || event === 'spawn') {
      const cue = `${vPref}_appear`;
      if (CUE_PATHS[cue]) {
        playCue(cue, {
          gain: 0.52,
          pitchJitter: 0.04,
          minIntervalMs: 420,
          family: 'enemy_appear',
          actorId,
          category: 'appear',
        });
      }
      return;
    }
    if (event === 'roar' || event === 'phase') {
      const cue = CUE_PATHS[`${vPref}_roar`] ? `${vPref}_roar` : `${vPref}_attack`;
      if (CUE_PATHS[cue]) {
        playCue(cue, { gain: 0.72, pitchJitter: 0.02, minIntervalMs: 300, actorId, category: 'roar' });
      }
      return;
    }
    if (event === 'death') {
      playEnemyDeath(enemy, { intoPile: Boolean(enemy?.isPile) });
      return;
    }
    if (event === 'hurt') {
      const cue = `${vPref}_hurt`;
      if (CUE_PATHS[cue]) {
        playCue(cue, {
          gain: 0.52,
          pitchJitter: 0.04,
          minIntervalMs: 260,
          family: 'enemy_hurt',
          actorId,
          category: 'hurt',
        });
      }
    }
  }

  function playEnemyHit(enemyOrMaterial = 'bone', options = {}) {
    let mat = 'bone';
    if (typeof enemyOrMaterial === 'string') {
      mat = enemyOrMaterial;
    } else if (enemyOrMaterial && typeof enemyOrMaterial === 'object') {
      const arch = String(enemyOrMaterial.archetype || enemyOrMaterial.charId || '').toLowerCase();
      if (
        arch.includes('black_knight') ||
        arch.includes('golem') ||
        enemyOrMaterial.frontalShieldBlocked
      ) {
        mat = 'armor';
      } else if (
        arch.includes('werewolf') ||
        arch.includes('orc') ||
        arch.includes('brute') ||
        arch.includes('plant')
      ) {
        mat = 'flesh';
      } else {
        mat = 'bone';
      }
    }
    const cueKey = mat === 'armor' ? 'hit_armor' : mat === 'flesh' ? 'hit_flesh' : 'hit_bone';
    playCue(cueKey, {
      gain: 0.98,
      pitchJitter: 0.045,
      minIntervalMs: 36,
      family: 'enemy_hit_impact',
      category: 'impact',
    });

    if (enemyOrMaterial && typeof enemyOrMaterial === 'object') {
      if (options?.killed || enemyOrMaterial.dead || enemyOrMaterial.hp <= 0) {
        playEnemyDeath(enemyOrMaterial, { intoPile: false });
      } else if (enemyOrMaterial.isPile && enemyOrMaterial.aiState === 'pile') {
        // Collapsing into a bone pile is handled by `onEnemyDeath` callback, avoid duplicate hurt grunt
      } else if (Math.random() < 0.88) {
        playEnemyEvent(enemyOrMaterial, 'hurt');
      }
    }
  }

  function playPlayerHit(options = {}) {
    if (options?.blockedByShield) {
      playShieldBlock('block');
      return;
    }
    const heroId = options?.heroId || 'Knight';
    const cleanHero = String(heroId).toLowerCase() === 'mage' ? 'Mage' : 'Knight';

    // Taking unblocked HP damage immediately interrupts any active attack/cast/charge sound on that hero!
    if ((options?.damageDealt ?? 1) > 0) {
      interruptActor(cleanHero, {
        categories: new Set(['attack', 'cast', 'charge', 'voice_attack']),
      });
    }

    const heavy = Boolean(options?.heavy || (options?.damageDealt && options.damageDealt >= 22));
    playCue(heavy ? 'player_hit_heavy' : 'player_hit', {
      gain: 0.96,
      pitchJitter: 0.025,
      minIntervalMs: 85,
      family: 'player_hit',
      category: 'impact',
    });

    if (!options?.killed) {
      playHeroVoice(cleanHero, 'hurt', { gain: 0.58 });
    }
  }

  function playFootstep(surface = 'grass', heroId = 'Knight') {
    const s = String(surface || 'grass').toLowerCase();
    const cueKey = s.includes('cobble')
      ? 'footstep_cobble'
      : s.includes('stone') || s.includes('shrine')
        ? 'footstep_stone'
        : 'footstep_grass';
    const isMage = String(heroId || 'Knight').toLowerCase() === 'mage';
    playCue(cueKey, {
      gain: isMage ? 0.11 : 0.13,
      rateBase: isMage ? 1.05 : 0.98,
      pitchJitter: 0.045,
      minIntervalMs: 210,
      family: 'footstep',
      category: 'footstep',
      reverbSend: 0.0,
    });
  }

  function playStoneInspect() {
    setAmbienceState('stone', { rampSec: 0.45 });
    playCue('stone_inspect', { gain: 0.84, pitchJitter: 0.015, minIntervalMs: 250 });
  }

  function playCommuneStart(heroId = 'Knight') {
    interruptActor('Knight');
    interruptActor('Mage');
    setAmbienceState('commune', { rampSec: 0.40 });
    playCue('commune_start', { gain: 0.84, pitchJitter: 0.015, minIntervalMs: 250 });
    playHeroVoice(heroId, 'pray', { gain: 0.48 });
  }

  function playMiracle() {
    playCue('verdict_miracle', { gain: 0.96, pitchJitter: 0.01, minIntervalMs: 250 });
  }

  function playVerdict(kind = 'heal') {
    const k = String(kind || 'heal').toLowerCase();
    const cueKey =
      k.includes('smite') || k.includes('penalty')
        ? 'verdict_smite'
        : k.includes('miracle') || k.includes('blessing') || k.includes('awakening')
          ? 'verdict_miracle'
          : 'verdict_heal';
    playCue(cueKey, { gain: 0.96, pitchJitter: 0.01, minIntervalMs: 200, family: 'verdict' });
    setAmbienceState('valley', { rampSec: 1.2 });
  }

  function playLevelUp() {
    playCue('ui_level_up', { gain: 0.86, pitchJitter: 0.01, minIntervalMs: 250 });
  }

  function playVictoryFanfare() {
    playCue('ui_victory', { gain: 0.92, pitchJitter: 0.01, minIntervalMs: 400 });
  }

  function playUi(kind = 'click') {
    if (kind === 'modal_open' || kind === 'pause_open') {
      setAmbienceState('pause', { rampSec: 0.28 });
    } else if (kind === 'modal_close' || kind === 'pause_close') {
      setAmbienceState('valley', { rampSec: 0.35 });
    }
    const map = {
      hover: 'ui_hover',
      click: 'ui_click',
      tab_ice: 'ui_tab_ice',
      tab_fire: 'ui_tab_fire',
      hero_swap: 'ui_hero_swap',
      swap: 'ui_hero_swap',
      locked: 'ui_locked',
      cooldown: 'ui_locked',
      modal_open: 'ui_modal_open',
      pause_open: 'ui_modal_open',
      modal_close: 'ui_modal_close',
      pause_close: 'ui_modal_close',
      level_up: 'ui_level_up',
      victory: 'ui_victory',
    };
    const cueKey = map[kind] || 'ui_click';
    const gain =
      kind === 'hover'
        ? 0.36
        : kind === 'click'
          ? 0.78
          : kind === 'hero_swap' || kind === 'swap'
            ? 0.56
            : kind === 'modal_open' || kind === 'pause_open' || kind === 'modal_close' || kind === 'pause_close'
              ? 0.62
              : 0.72;
    playCue(cueKey, {
      gain,
      pitchJitter: kind === 'hover' || kind === 'click' ? 0.025 : 0.01,
      minIntervalMs: kind === 'hover' ? 55 : 40,
      family: 'ui',
      reverbSend: 0.0,
    });
  }

  function getStats() {
    let totalDefinedUrls = 0;
    for (const list of Object.values(CUE_PATHS)) {
      totalDefinedUrls += list.length;
    }
    return {
      muted: isMuted,
      contextState: ctx ? ctx.state : 'uninitialized',
      ambienceMode: currentAmbienceMode,
      totalDefinedCues: Object.keys(CUE_PATHS).length,
      totalDefinedUrls,
      loadedBuffers: bufferCache.size,
      inflightBuffers: inflightMap.size,
      failedUrls: [...failedUrls],
      playedCount,
      lastPlayedCue,
      playedByCue: { ...playedByCue },
      interruptedCount,
      interruptedByActor: { ...interruptedByActor },
    };
  }

  return {
    get muted() {
      return isMuted;
    },
    setMuted(next) {
      isMuted = Boolean(next);
      applyAmbienceTargets(currentAmbienceMode, 0.05);
      if (isMuted && activeLoops.size > 0) {
        for (const k of [...activeLoops.keys()]) {
          stopLoop(k, 0.02);
        }
      }
    },
    get masterVolume() {
      return volume;
    },
    setMasterVolume(next) {
      volume = Math.max(0, Math.min(1.5, Number(next) || 0));
      if (masterGain && ctx) {
        masterGain.gain.setValueAtTime(volume, ctx.currentTime);
      }
    },
    preloadAll,
    setAmbienceState,
    getStats,
    interruptActor,
    playSwordSlash,
    playHeavyFinisher,
    playBreathingIgnition,
    playMageBolt,
    playMageBoltImpact,
    playSpellCharge,
    updateSpellCharge,
    cancelSpellCharge,
    playSpellCast,
    playSpellImpact,
    playDetonation,
    playShieldBlock,
    playShieldChime,
    playDodge,
    playPerfectDodge,
    playKnightUltimate,
    playMageUltimate,
    playStarfallMeteor,
    playCouplesUltimate,
    playEnemyWindup,
    playEnemyEvent,
    playEnemyHit,
    playEnemyDeath,
    playPlayerHit,
    playHeroDeath,
    playHeroVoice,
    playFootstep,
    playStoneInspect,
    playCommuneStart,
    playMiracle,
    playVerdict,
    playLevelUp,
    playVictoryFanfare,
    playUi,
  };
}
