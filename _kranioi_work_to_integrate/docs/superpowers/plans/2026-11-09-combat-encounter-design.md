# Haru-machi — Combat Encounter & Enemy Design (2026-11-09)

Owner direction: enemies must use their animations properly so fights feel challenging and alive,
not "things clobbering in your face". Genshin-punchy, forgiving on trash, with real spikes on
elites and the boss; hard-but-fair without divine help. Assets: KayKit Skeletons 1.1 +
Character Animations 1.1 (`library/kaykit-v2`, fetched by `npm run fetch:kaykit`).

Defaults chosen for questions the owner hasn't answered yet (easy to flip):
- Warnings come from pose, weapon glint and a distinct sound per attack. Area attacks only
  (eruptions, boss slam) also get an opaque crimson petal-crack ground decal. No generic red
  circles; the locked plan removed those.
- Minions reassemble.
- Rogue hunts the *most exposed* hero (the Mage when she is more than 6 m from the Knight),
  so staying together is rewarded rather than her being permanently chased.

## Shared rules
1. **Three-beat attacks.** Windup (the real clip, slowed during the anticipation segment; readable
   pose plus glint and sound), then active frames (damage only on the clip's contact fraction),
   then recovery (punishable). Per-attack data: clip, contactFrac, windupSlow, recovery,
   range/arc, blockable, interruptible.
2. **Hit reactions.**
   - Trash: light hits play Hit_A/Hit_B and interrupt a windup before the contact frame.
   - Elites and boss: poise bar, stagger only when it breaks.
   - Shield-up Warrior: Melee_Block_Hit and no damage from the front.
   - Knight block within ±0.15 s of the contact frame is a **parry**: attacker staggers, and the
     Knight's guard is refunded.
3. **Turn-taking crowd.** At most 3 attack tokens. Everyone else strafes
   (Running_Strafe_L/R), backs off (Walking_Backwards), taunts (Skeletons_Taunt) or flanks.
   No more than 2 enemies start a windup on the same hero within 0.4 s.
4. **Locomotion** `timeScale` follows ground speed divided by the clip's native stride, so feet
   don't slide.
5. **Spell interactions.**
   - Frost freezes a bone pile (no reassembly).
   - Cinder Fall destroys piles.
   - Storm chains between skeletons within 4 m.
   - Shatterlance pierces shields.
6. **Ambush staging.** Dormant skeletons in Skeletons_Inactive_* poses or sitting around the
   valley wake with Skeletons_Awaken_* when you get close.

## Roster
| Enemy | Role | Key clips | Counterplay |
|---|---|---|---|
| Minion | Horde pressure | Skeletons_Walking, Melee_Unarmed_Attack_Punch_A, Melee_Unarmed_Attack_Kick, Skeletons_Spawn_Ground, Skeletons_Death, then Skeletons_Death_Resurrect after 6 s | Finish the bone pile with a detonation or Mage spell |
| Warrior | Shield wall | Melee_Blocking (advance), Melee_Block_Hit, Melee_Block_Attack (shield-bash counter after 3 blocked hits), Melee_1H_Attack_Chop / Slice | Flank, Knight heavy / Shatterlance guard-break |
| Rogue | Hunter | Running_Strafe_*, Dodge_Left/Right (sidesteps Mage bolts, 4 s cooldown), Melee_1H_Attack_Jump_Chop (gap-close), Melee_Dualwield_Attack_Stab flurry, Skeletons_Taunt | Knight front-arc cover; stay together |
| Skeleton Mage | Controller | Walking_Backwards (kites), Ranged_Magic_Shoot (bolt), Ranged_Magic_Spellcasting_Long (eruption, one hit interrupts), Ranged_Magic_Summon (2 minions, 14 s cooldown) | Priority target / interrupt |
| Captain (Warrior rig, elite) | Rhythm test | Melee_2H_Attack_Spin (jump/dash out), Melee_2H_Attack_Chop (unblockable, crimson glint), delayed swings, Skeletons_Taunt_Longer (rally: +15% speed to allies for 6 s) | Block lights, dodge heavies |
| Necromancer (elite, Act 3) | Summoner | Ranged_Magic_Summon, Ranged_Magic_Raise (wards a Warrior: 3 s invulnerable), Dodge_Backward | Kill first; wards break on detonation |
| **Skeleton Golem — Hollow Sovereign (boss)** | Climax (Rig_Large) | Melee_2H_Attack, Melee_Dualwield_SlashCombo, Melee_2H_Slam (area), Melee_Unarmed_Smash (slow area), Flexing (phase taunt), Hit_A, Death_A | Phases below |

Boss phases:
- **P1 (100–50%):** sword combos and slam.
- **50%:** Flexing roar, Aegis rises (2 layers), and the Necromancer and minions arrive.
- **Aegis break:** 4 s down window. Death_A played and held, then reversed to stand. This is
  the Couples Ultimate opening.
- **P3 (below 33%):** faster combos plus Unarmed_Smash.

## Acts
- **Act 1 Arena:** minions with reassembly teach "finish with combos", then two shield Warriors.
- **Act 2 Plaza (dusk):** Rogues hunting the exposed hero, plus a Skeleton Mage on the well steps.
- **Act 3 Shrine (night):** dormant ambush, then Captain and Necromancer, then the Golem boss.

Target length is 2–3 minutes per act.
