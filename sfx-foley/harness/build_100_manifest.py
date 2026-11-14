"""
Generates the 100-variation experimental manifest (`sfx-foley/audition/manifest.json` and `manifest.js`)
for `04_knight_glacial_and_sunfire_breathing.mp4` (141 frames, 5.875s @ 24fps, 832x480).

Four Visual Action Beats in `04_knight_glacial_and_sunfire_breathing.mp4`:
  - Beat 1 (00:00.250 - 00:01.250): Glacial Breathing Awakening (giant blue-white Ice Dragon head materializes & ice coats the blade)
  - Beat 2 (00:01.830 - 00:02.650): Glacial Sword Slash (Knight slashes the glowing blue ice-coated broadsword downward)
  - Beat 3 (00:03.330 - 00:04.330): Sunfire Breathing Awakening (giant crimson-gold Fire Dragon erupts & flame coats the blade)
  - Beat 4 (00:04.750 - 00:05.450): Sunfire Sword Slash (Knight steps forward and slashes the blazing orange-gold flame sword downward)
  - Silence Windows: [0.00-0.25], [1.25-1.83], [2.65-3.33], [4.33-4.75], [5.45-5.875]
"""

import json
from pathlib import Path

OUT_DIR = Path("sfx-foley/audition")
OUT_DIR.mkdir(parents=True, exist_ok=True)
(OUT_DIR / "videos").mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Prompt Builders (Clean, Zero Meadow/Petal Visual Fluff vs. Full Scene)
# ---------------------------------------------------------------------------

def build_focused_ref_prompt(summary_sfx: str, b1_ice_dragon: str, b2_ice_slash: str, b3_fire_dragon: str, b4_fire_slash: str, overall_sfx: str) -> str:
    """
    Follows the proven `how-to-use.md` 6-section `ref-en.txt` schema with zero outdoor-meadow/petal filler
    so Qwen3-VL tokens focus 100% on the 4 combat actions and their physical acoustics.
    """
    return (
        "subject_definitions:\n"
        "<Subject 1> is the combat arena in <Video 1>.\n"
        "<Subject 2> is the armored Knight wielding an iron broadsword in <Video 1>.\n"
        "<Subject 3> is the erupting blue glacier Ice Dragon and frost-coated blade in <Video 1>.\n"
        "<Subject 4> is the erupting crimson-gold Fire Dragon and flame-coated blade in <Video 1>.\n"
        "<Video 1> is the source video for the target video edit.\n\n"
        "summary:\n"
        f"[video editing] The target video is an edited version of <Video 1>. {summary_sfx}\n\n"
        "retention_analysis:\n"
        "<Subject 1> (appears throughout): fully_preserved - the arena is retained.\n"
        "<Subject 2> (appears throughout): fully_preserved - the Knight's armor and weapon timing are retained.\n"
        "<Subject 3> (appears in [Shot 1]): fully_preserved - the Ice Dragon and ice blade geometry are retained.\n"
        "<Subject 4> (appears in [Shot 1]): fully_preserved - the Fire Dragon and flame blade geometry are retained.\n"
        "<Video 1> (cut and pacing structure): fully_preserved - the camera framing and action timing are retained 1:1.\n\n"
        "detailed_description:\n"
        "The target video is in a 3D CG animated game style.\n\n"
        "[Shot 1, 00:00.000-00:00.250] Complete silence before the first technique.\n\n"
        f"[Shot 1, 00:00.250-00:01.250] As <Subject 3> erupts from <Subject 2>'s broadsword, {b1_ice_dragon}\n\n"
        "[Shot 1, 00:01.250-00:01.830] Complete silence with zero wind, zero mist, and zero rumble.\n\n"
        f"[Shot 1, 00:01.830-00:02.650] As <Subject 2> strikes downward with the ice-coated blade, {b2_ice_slash}\n\n"
        "[Shot 1, 00:02.650-00:03.330] Complete silence during the stance transition.\n\n"
        f"[Shot 1, 00:03.330-00:04.330] As <Subject 4> erupts in crimson-gold flames from <Subject 2>'s blade, {b3_fire_dragon}\n\n"
        "[Shot 1, 00:04.330-00:04.750] Complete silence with zero background hiss.\n\n"
        f"[Shot 1, 00:04.750-00:05.450] As <Subject 2> steps forward and strikes downward with the flame-coated blade, {b4_fire_slash}\n\n"
        "[Shot 1, 00:05.450-00:05.875] Complete silence until the end of the clip.\n\n"
        "overall_soundscape:\n"
        f"{overall_sfx} No ambient wind, no room reverb, no background noise between the four attacks, no dialogue.\n\n"
        "non_diegetic_music:\n"
        "N/A"
    )


def build_prose_ref_prompt(summary_sfx: str, b1_ice_dragon: str, b2_ice_slash: str, b3_fire_dragon: str, b4_fire_slash: str, overall_sfx: str) -> str:
    """Inline prose timestamp format (without bracketed [Shot 1, start-end] splits)."""
    return (
        "subject_definitions:\n"
        "<Subject 1> is the stone combat path in <Video 1>.\n"
        "<Subject 2> is the armored Knight wielding a broadsword in <Video 1>.\n"
        "<Subject 3> is the blue-and-white Ice Dragon visual effect and frost blade in <Video 1>.\n"
        "<Subject 4> is the crimson-and-gold Fire Dragon visual effect and flame blade in <Video 1>.\n"
        "<Video 1> is the source video for the target video edit.\n\n"
        "summary:\n"
        f"[video editing] The target video is an edited version of <Video 1> featuring <Subject 2> performing <Subject 3> and <Subject 4> combat techniques. {summary_sfx}\n\n"
        "retention_analysis:\n"
        "<Subject 1> (appears in [Shot 1]): fully_preserved\n"
        "<Subject 2> (appears in [Shot 1]): fully_preserved\n"
        "<Subject 3> (appears in [Shot 1]): fully_preserved\n"
        "<Subject 4> (appears in [Shot 1]): fully_preserved\n"
        "<Video 1> (cut and pacing structure): fully_preserved\n\n"
        "detailed_description:\n"
        "The target video is in a 3D animated game style.\n"
        "[Shot 1] From 00:00.000 to 00:00.250, <Subject 2> stands in complete silence. "
        f"At 00:00.250, <Subject 3> materializes from the broadsword: {b1_ice_dragon} "
        "From 00:01.250 to 00:01.830, complete silence. "
        f"At 00:01.830, <Subject 2> slashes the frost blade downward: {b2_ice_slash} "
        "From 00:02.650 to 00:03.330, complete silence. "
        f"At 00:03.330, <Subject 4> erupts in fire from the blade: {b3_fire_dragon} "
        "From 00:04.330 to 00:04.750, complete silence. "
        f"At 00:04.750, <Subject 2> slashes the flame blade downward: {b4_fire_slash} "
        "From 00:05.450 to 00:05.875, complete silence.\n\n"
        "overall_soundscape:\n"
        f"{overall_sfx} Studio game sound effects with complete silence between the four combat events.\n\n"
        "non_diegetic_music:\n"
        "N/A"
    )


def build_direct_cue_prompt(b1_ice_dragon: str, b2_ice_slash: str, b3_fire_dragon: str, b4_fire_slash: str, overall_sfx: str) -> str:
    """Direct natural-language foley cue sheet (tests whether omitting verbose <Subject> boilerplate improves audio focus)."""
    return (
        "Game combat foley sound effects track synchronized to four weapon events with complete silence between events:\n"
        f"- 00:00.000 to 00:00.250: Complete silence.\n"
        f"- 00:00.250 to 00:01.250 (Ice Dragon Awakening): {b1_ice_dragon}\n"
        f"- 00:01.250 to 00:01.830: Complete silence.\n"
        f"- 00:01.830 to 00:02.650 (Frost Sword Slash): {b2_ice_slash}\n"
        f"- 00:02.650 to 00:03.330: Complete silence.\n"
        f"- 00:03.330 to 00:04.330 (Sunfire Dragon Awakening): {b3_fire_dragon}\n"
        f"- 00:04.330 to 00:04.750: Complete silence.\n"
        f"- 00:04.750 to 00:05.450 (Flame Sword Slash): {b4_fire_slash}\n"
        f"- 00:05.450 to 00:05.875: Complete silence.\n"
        f"Overall soundscape: {overall_sfx} No music, no dialogue, no wind hiss."
    )


# ---------------------------------------------------------------------------
# Negative Prompt Variants
# ---------------------------------------------------------------------------

NEG_PROMPTS = {
    "none": "",
    "proven_f09_full": (
        "subject_definitions:\n"
        "<Subject 1> is the arena in <Video 1>.\n"
        "<Subject 2> is the Knight in <Video 1>.\n"
        "<Video 1> is the source video.\n\n"
        "summary:\n"
        "[video editing] Noisy ambient movie scene with wind hiss, air whoosh, dull mud landslide, and lingering rumble during pauses.\n\n"
        "retention_analysis:\n"
        "<Subject 1>: fully_preserved\n"
        "<Subject 2>: fully_preserved\n"
        "<Video 1>: fully_preserved\n\n"
        "detailed_description:\n"
        "The target video has continuous wind noise, air whoosh, Doppler sweep, mist hissing, room tone, white noise static, dull dirt landslide, and lingering sound during pauses.\n\n"
        "overall_soundscape:\n"
        "Ambient wind, air whoosh, mist hiss, room tone, white noise, radio static, muddy rumble, speech, dialogue.\n\n"
        "non_diegetic_music:\n"
        "Background music, synthesizer pad, organ drone, brass."
    ),
    "anti_whoosh_preserve_highs": (
        "subject_definitions:\n"
        "<Subject 1> is the arena in <Video 1>.\n"
        "<Subject 2> is the Knight in <Video 1>.\n"
        "<Video 1> is the source video.\n\n"
        "summary:\n"
        "[video editing] Bloated windy audio with hollow air whoosh, wind gusts, and muddy low-mid boxiness.\n\n"
        "retention_analysis:\n"
        "<Subject 1>: fully_preserved\n"
        "<Subject 2>: fully_preserved\n"
        "<Video 1>: fully_preserved\n\n"
        "detailed_description:\n"
        "The target video has windy air whoosh, fan noise, hollow tube resonance, Doppler wind sweep, muffled cardboard thud, and continuous background hum between attacks.\n\n"
        "overall_soundscape:\n"
        "Windy air whoosh, breeze, fan noise, muffled cardboard boxiness, room reverb tail, dialogue, speech.\n\n"
        "non_diegetic_music:\n"
        "Background music, synthesizer pad."
    ),
    "anti_mud_and_room": (
        "subject_definitions:\n"
        "<Subject 1> is the arena in <Video 1>.\n"
        "<Subject 2> is the Knight in <Video 1>.\n"
        "<Video 1> is the source video.\n\n"
        "summary:\n"
        "[video editing] Muddy reverberant recording with cave echo, dull dirt thuds, and low-frequency hum.\n\n"
        "retention_analysis:\n"
        "<Subject 1>: fully_preserved\n"
        "<Subject 2>: fully_preserved\n"
        "<Video 1>: fully_preserved\n\n"
        "detailed_description:\n"
        "The target video has cave reverb, wet hall echo, muddy dirt landslide, booming room tone, muffled pillow impacts, and background hum.\n\n"
        "overall_soundscape:\n"
        "Cave reverb, hall echo, muddy rumble, room tone, muffled thuds, speech, dialogue.\n\n"
        "non_diegetic_music:\n"
        "Background music, orchestral strings."
    ),
    "anti_static_and_fizz": (
        "subject_definitions:\n"
        "<Subject 1> is the arena in <Video 1>.\n"
        "<Subject 2> is the Knight in <Video 1>.\n"
        "<Video 1> is the source video.\n\n"
        "summary:\n"
        "[video editing] Harsh digital white-noise static, radio hiss, and phase distortion.\n\n"
        "retention_analysis:\n"
        "<Subject 1>: fully_preserved\n"
        "<Subject 2>: fully_preserved\n"
        "<Video 1>: fully_preserved\n\n"
        "detailed_description:\n"
        "The target video has harsh white-noise static, pink-noise wash, digital bitcrush fizz, radio interference, and phase smear.\n\n"
        "overall_soundscape:\n"
        "White noise static, pink noise hiss, radio static, digital distortion, speech, dialogue.\n\n"
        "non_diegetic_music:\n"
        "Background music, synth drone."
    ),
    "minimal_one_liner": (
        "Windy air whoosh, ambient breeze, white noise static, muddy reverb tail, muffled cardboard thuds, background music, speech."
    ),
    "silence_enforcer": (
        "subject_definitions:\n"
        "<Subject 1> is the arena in <Video 1>.\n"
        "<Video 1> is the source video.\n\n"
        "summary:\n"
        "[video editing] Continuous background noise bleeding across silent pauses.\n\n"
        "retention_analysis:\n"
        "<Subject 1>: fully_preserved\n"
        "<Video 1>: fully_preserved\n\n"
        "detailed_description:\n"
        "[Shot 1, 00:00.000-00:00.250] Loud wind and background noise.\n"
        "[Shot 1, 00:01.250-00:01.830] Lingering rumble, wind hiss, and reverb tail.\n"
        "[Shot 1, 00:02.650-00:03.330] Lingering whoosh, wind hiss, and reverb tail.\n"
        "[Shot 1, 00:04.330-00:04.750] Lingering fire hiss and rumble.\n"
        "[Shot 1, 00:05.450-00:05.875] Lingering tail rumble and wind.\n\n"
        "overall_soundscape:\n"
        "Continuous noise during pauses, wind whoosh, lingering reverb tails, dialogue.\n\n"
        "non_diegetic_music:\n"
        "Background music."
    ),
}

# ---------------------------------------------------------------------------
# Sound Design Recipes (Positive Prompt Building Blocks)
# ---------------------------------------------------------------------------

RECIPES = {
    "glacier_titan_and_forge_anvil": {
        "title": "Glacier Lake Split & Blacksmith Anvil Forge",
        "summary": "It pairs heavy sub-bass impacts with thick frozen lake-ice cracking and forged high-carbon steel rings.",
        "b1": "a deep sub-bass impact boom hits alongside the sharp, resonant whip-crack of a thick frozen lake-ice sheet splitting open under tension and solid clear ice blocks locking into place.",
        "b2": "a crisp, resonant high-carbon steel broadsword ring and a sharp, solid block-ice cleave impact cut cleanly with zero wind wash.",
        "b3": "a punchy sub-bass ignition thud and a forged steel tang ring erupt into the roar of a blacksmith's coal forge bellows and dry oak logs snapping under intense heat.",
        "b4": "a heavy forged-iron sword strike rings out with a tight, explosive charcoal-ember crack and zero trailing hiss.",
        "overall": "Punchy sub-bass weight combined with thick frozen lake-ice splitting, resonant high-carbon steel sword rings, and crisp blacksmith forge-fire crackling.",
    },
    "sekiro_katana_ring_and_elemental_bite": {
        "title": "Sekiro Tempered Steel Resonance & Elemental Bite",
        "summary": "It delivers unmistakable tempered steel sword resonance paired with biting flash-freeze crystallization and concentrated fire ignition.",
        "b1": "a clear, musical tempered-steel blade ring triggers a rapid flash-freeze crystallization crunch and the deep groan of solid glacier ice fracturing.",
        "b2": "a razor-sharp, metallic steel katana slash rings with a bright harmonic overtone and a single crisp ice-shatter snap.",
        "b3": "a firm iron sword guard lock sparks into a concentrated oil-torch ignition flare and dense hardwood embers popping.",
        "b4": "a fast, grounded tempered-steel blade strike snaps with a dry, punchy flame-burst transient and clean decay.",
        "overall": "Crisp, harmonic tempered-steel sword acoustics paired with solid glacier crystallization and tight oil-torch fire ignition.",
    },
    "demon_slayer_breathing_forms": {
        "title": "Anime Elemental Breathing Forms (Glacial Surge & Sunfire Arc)",
        "summary": "It brings expressive anime elemental breathing sound design with pressurized cryo-geyser surges and solar-flare sword ignitions.",
        "b1": "a deep sub-bass pressure drop and ringing steel blade draw unleash a surging glacier-ice cascade and interlocking frost crystal chimes.",
        "b2": "a swift, slicing steel blade transient cuts with a crisp, biting frost-edge snap.",
        "b3": "a resonant bronze-and-steel sword ring ignites into a roaring solar-fire flare and pressurized furnace flame burst.",
        "b4": "a decisive, weighty steel sword cleave lands with a concentrated fire-whip snap and instant silence.",
        "overall": "Expressive anime combat sound design combining deep sub-bass pressure drops, ringing steel blade draws, glacier-ice cascades, and roaring solar-flame ignitions.",
    },
    "monster_hunter_greatsword_weight": {
        "title": "Monster Hunter Heavy Greatsword & Elemental Cleave",
        "summary": "It emphasizes chest-hitting low-end physical weight, heavy iron weapon mass, solid block-ice cleaving, and volcanic magma cracking.",
        "b1": "a chest-hitting sub-bass thud and heavy cast-iron greatsword lock expand into the massive physical crunch of an icebreaker cleaving solid pack ice.",
        "b2": "a weighty, grounded iron broadsword chop lands with a solid ice-block split and tight low-end thump.",
        "b3": "a heavy iron-on-stone impact boom erupts into a pressurized magma-vent flare and cracking volcanic basalt rock.",
        "b4": "a heavy forged-iron broadsword slam hits with a tight coal-furnace detonation pop and zero tail wash.",
        "overall": "Heavy, chest-hitting sub-bass impacts, weighty cast-iron broadsword strikes, solid pack-ice cleaving, and volcanic coal-furnace combustion.",
    },
    "tsushima_bamboo_steel_and_hearth": {
        "title": "Ghost of Tsushima Grounded Steel, River Ice & Pine Hearth",
        "summary": "It uses organic, close-miked acoustic recordings of folded steel, cracking river ice, leather armor grip, and snapping pine logs.",
        "b1": "a tight leather hilt grip creak and folded-steel blade ring open into the crisp, natural snap of thick frozen river ice cracking across the surface.",
        "b2": "a clean, close-miked folded-steel sword cut and brittle river-ice tap finish with a tight, dry decay.",
        "b3": "a sharp flint-against-steel spark click ignites a warm, crackling burst of resinous pine logs and dry cedar kindling in a stone hearth.",
        "b4": "a grounded iron blade cut and a sharp pine-log ember snap cut off cleanly.",
        "overall": "Organic, close-miked acoustic foley of folded steel blades, leather grip creaks, cracking river ice, flint sparks, and snapping pine hearth logs.",
    },
    "botw_crystalline_quartz_and_campfire": {
        "title": "Zelda Crystalline Quartz Chime & Birch Campfire Snap",
        "summary": "It blends clear, musical quartz-and-ice acoustics with warm, tactile birch-bark fire crackling and clean sword foley.",
        "b1": "a pure silver blade chime and deep bass pulse blossom into the clear, musical fracture of solid glacier ice and resonant quartz crystal facets locking together.",
        "b2": "a nimble, articulate steel sword slash rings with a bright crystalline frost transient.",
        "b3": "a crisp steel tang click sparks a rich, roaring burst of dry birch bark catching flame and heavy campfire logs popping.",
        "b4": "a clean, articulate steel sword strike lands with a warm, punchy wood-fire crack.",
        "overall": "Articulate, clean game sound design blending silver-steel sword rings, musical glacier-ice and quartz fractures, and dry birch campfire crackling.",
    },
    "industrial_cryo_and_blowtorch": {
        "title": "Liquid Nitrogen Cryo-Fracture & Pressurized Blowtorch",
        "summary": "It uses high-contrast physical recordings of liquid-nitrogen metal contraction, shattering block ice, and pressurized gas-torch ignition.",
        "b1": "a deep sub-bass implosion thump and high-tension metal contraction ping trigger the violent, brittle fracture of sub-zero frozen steel and thick block ice.",
        "b2": "a surgical, ultra-crisp hardened-steel blade strike snaps through solid ice with zero air drag.",
        "b3": "a sharp piezoelectric spark click unleashes a deep, roaring pressurized gas-blowtorch flame ignition and searing iron resonance.",
        "b4": "a fast hardened-steel blade strike lands with a concentrated blowtorch flame pop and immediate cutoff.",
        "overall": "High-contrast physical foley combining sub-zero metal contraction pings, shattering block ice, and roaring pressurized gas-blowtorch ignitions.",
    },
    "elden_ring_boss_arena_resonance": {
        "title": "Elden Ring Dark Fantasy Steel, Hoarfrost Stomp & Giant's Flame",
        "summary": "It delivers dramatic dark-fantasy weapon weight with hoarfrost ground-shatter bass and deep oil-cauldron fire eruptions.",
        "b1": "a resonant cathedral-steel broadsword ring and deep sub-bass ground thud unleash a jagged hoarfrost ice-crust shatter across stone.",
        "b2": "a heavy tempered-broadsword cleave rings out with a biting frost-crust crunch.",
        "b3": "a deep bronze-and-iron blade chime erupts into a massive oil-cauldron fire bloom and roaring furnace draft.",
        "b4": "a decisive broadsword slash impacts with a deep, punchy oil-fire burst and crisp metallic ring.",
        "overall": "Dramatic dark-fantasy combat acoustics with cathedral-steel sword resonance, hoarfrost stone-and-ice shatter, and deep oil-cauldron flame eruptions.",
    },
    "arcade_fighting_game_hyper_punch": {
        "title": "Hyper-Punchy Fighting Game Transients (Street Fighter / Guilty Gear)",
        "summary": "It maximizes immediate transient punch, sub-bass chest thump, and unmistakable elemental read on every single frame.",
        "b1": "an explosive sub-bass impact drop and bright steel clash immediately lock into a dense, crunchy glacier-ice shatter.",
        "b2": "a snappy, high-impact steel slash transient hits with a tight ice-crystal crack and instant gate.",
        "b3": "a punchy low-end bass slam and metallic spark ignite a roaring, saturated fireball burst.",
        "b4": "a tight, percussive steel slash hits with a concentrated flame detonation pop and instant silence.",
        "overall": "Hyper-punchy fighting-game sound effects with big sub-bass drops, sharp metallic clashes, crunchy ice shatters, and tight fireball bursts.",
    },
    "pure_acoustic_foley_stage_master": {
        "title": "Pure Foley Stage Master (Heavy Prop Physics, Zero Synth)",
        "summary": "It relies strictly on heavy real-world foley stage props: blacksmith anvils, 50-pound ice blocks, broadswords, and roaring hearth fires.",
        "b1": "a close-miked broadsword ringing against an iron block is followed immediately by a heavy steel pick splitting a 50-pound block of solid clear ice.",
        "b2": "a single decisive broadsword slash rings with pure metallic sustain and a sharp ice-block tap.",
        "b3": "a close-miked flint-and-steel strike ignites a dry cedar bonfire roaring in a stone fireplace with loud timber snaps.",
        "b4": "a single decisive broadsword slash rings with a sharp cedar-log fire crack and clean silence.",
        "overall": "100% authentic foley stage prop recordings of broadswords, 50-pound clear ice blocks, iron anvils, and roaring cedar fireplace timber.",
    },
}


def build_100_variations() -> list[dict]:
    variations = []

    def add_var(
        group_id: str,
        group_title: str,
        title: str,
        hypothesis: str,
        prompt: str,
        neg_key: str,
        guidance_mode: str,
        cfg_scale: float,
        seed: int,
        sampler_name: str = "euler",
        n_steps: int = 16,
        shift_video: float = 12.0,
        shift_audio: float = 4.0,
        dsp_mode: str = "sub_boost_10k_lp",
        neg_has_video: bool = True,
        negpip_weight: float = 0.0,
        window_range: tuple = (0, 16),
        rescale_phi: float = 0.0,
        recipe_key: str = "glacier_titan_and_forge_anvil",
    ):
        idx = len(variations) + 1
        vid_id = f"v{idx:03d}"
        variations.append({
            "id": vid_id,
            "index": idx,
            "group_id": group_id,
            "group_title": group_title,
            "title": title,
            "hypothesis": hypothesis,
            "recipe_key": recipe_key,
            "prompt": prompt,
            "neg_key": neg_key,
            "neg_prompt": NEG_PROMPTS[neg_key],
            "guidance_mode": guidance_mode,  # "basic_cfg1", "cfg_standard", "cfg_windowed", "cfg_rescaled", "cfg_text_only_neg", "negpip_vflip"
            "cfg_scale": cfg_scale,
            "seed": seed,
            "sampler_name": sampler_name,
            "n_steps": n_steps,
            "shift_video": shift_video,
            "shift_audio": shift_audio,
            "dsp_mode": dsp_mode,
            "neg_has_video": neg_has_video,
            "negpip_weight": negpip_weight,
            "window_range": list(window_range),
            "rescale_phi": rescale_phi,
            "video_Path": f"videos/{vid_id}.mp4",
            "raw_audio_path": f"videos/{vid_id}_raw.mp3",
        })

    # =========================================================================
    # GROUP 01 (#001-#010): Guidance & Negative Conditioning Architecture Lab
    # Same 2 anchor recipes (Glacier Titan & Sekiro Steel) on fixed seed 42
    # tested across 5 guidance modes head-to-head.
    # =========================================================================
    for r_key, r_label in [("glacier_titan_and_forge_anvil", "Glacier+Forge"), ("sekiro_katana_ring_and_elemental_bite", "Sekiro Steel")]:
        r = RECIPES[r_key]
        p = build_focused_ref_prompt(r["summary"], r["b1"], r["b2"], r["b3"], r["b4"], r["overall"])
        add_var(
            "G01", "Guidance Architecture A/B",
            f"{r_label} — Pure Native CFG=1.0 (No Negative)",
            "Baseline single-pass native generation (BasicGuider, CFG=1.0) with zero negative subtraction.",
            p, "none", "basic_cfg1", 1.0, 42, recipe_key=r_key
        )
        add_var(
            "G01", "Guidance Architecture A/B",
            f"{r_label} — Gentle CFGGuider (1.35)",
            "Tests gentle 2-pass latent velocity subtraction (CFG=1.35) to suppress air whoosh without over-driving AudioVAE.",
            p, "proven_f09_full", "cfg_standard", 1.35, 42, recipe_key=r_key
        )
        add_var(
            "G01", "Guidance Architecture A/B",
            f"{r_label} — Proven F09 Sweet Spot CFGGuider (1.65)",
            "Tests our empirical F09 benchmark sweet spot (CFG=1.65) with the 6-section Qwen3-VL negative prompt.",
            p, "proven_f09_full", "cfg_standard", 1.65, 42, recipe_key=r_key
        )
        add_var(
            "G01", "Guidance Architecture A/B",
            f"{r_label} — Step-Windowed CFG=1.65 (Steps 2..11 Only)",
            "Applies anti-whoosh negative guidance ONLY during material-formation steps (2..11) and turns it OFF (CFG=1.0) on steps 12..15 so high-frequency steel ring isn't scrubbed.",
            p, "proven_f09_full", "cfg_windowed", 1.65, 42, window_range=(2, 11), recipe_key=r_key
        )
        add_var(
            "G01", "Guidance Architecture A/B",
            f"{r_label} — Std-Rescaled CFG=1.80 (Phi=0.75)",
            "Subtracts negative velocity at CFG=1.80 then rescales latent velocity std back to match v_pos so AudioVAE never clips.",
            p, "proven_f09_full", "cfg_rescaled", 1.80, 42, rescale_phi=0.75, recipe_key=r_key
        )

    # =========================================================================
    # GROUP 02 (#011-#020): Negative Prompt Vocabulary & NegPiP V-Flip Lab
    # Tests WHAT we subtract (Anti-Whoosh only vs Anti-Mud vs Text-Only Neg vs NegPiP).
    # =========================================================================
    r1 = RECIPES["glacier_titan_and_forge_anvil"]
    p1 = build_focused_ref_prompt(r1["summary"], r1["b1"], r1["b2"], r1["b3"], r1["b4"], r1["overall"])
    r2 = RECIPES["sekiro_katana_ring_and_elemental_bite"]
    p2 = build_focused_ref_prompt(r2["summary"], r2["b1"], r2["b2"], r2["b3"], r2["b4"], r2["overall"])

    for p, r_key, r_short, seed in [(p1, "glacier_titan_and_forge_anvil", "Glacier", 77), (p2, "sekiro_katana_ring_and_elemental_bite", "Sekiro", 77)]:
        add_var(
            "G02", "Negative Vocabulary & NegPiP",
            f"{r_short} — Anti-Whoosh Only Neg (Preserves Highs)",
            "Negative prompt targets ONLY windy air whoosh and cardboard boxiness—never mentions 'high-frequency ringing' so blade harmonics stay bright.",
            p, "anti_whoosh_preserve_highs", "cfg_standard", 1.60, seed, recipe_key=r_key
        )
        add_var(
            "G02", "Negative Vocabulary & NegPiP",
            f"{r_short} — Anti-Mud & Room Reverb Neg",
            "Negative prompt targets cave reverb, dirt landslide, and muffled pillow thuds to maximize close-up transient definition.",
            p, "anti_mud_and_room", "cfg_standard", 1.60, seed, recipe_key=r_key
        )
        add_var(
            "G02", "Negative Vocabulary & NegPiP",
            f"{r_short} — Text-Only Negative (No <Video 1> in Neg)",
            "Keeps <Video 1> in the positive pass ONLY and omits <Video 1> from the negative pass so subtracting v_neg never subtracts visual impact timing!",
            p, "minimal_one_liner", "cfg_text_only_neg", 1.55, seed, neg_has_video=False, recipe_key=r_key
        )
        add_var(
            "G02", "Negative Vocabulary & NegPiP",
            f"{r_short} — NegPiP Single-Pass Attention V-Flip (-0.75)",
            "Implements hako-mikan's NegPiP: single pass (CFG=1.0) where negative text tokens have their Attention Value vectors inverted (V = -0.75 * V) in all 50 layers.",
            p, "anti_whoosh_preserve_highs", "negpip_vflip", 1.0, seed, negpip_weight=0.75, recipe_key=r_key
        )
        add_var(
            "G02", "Negative Vocabulary & NegPiP",
            f"{r_short} — Timestamped Pause-Silence Enforcer Neg",
            "Negative prompt explicitly places noise inside the 5 pause timestamps so CFG actively zeroes out inter-beat bleed.",
            p, "silence_enforcer", "cfg_standard", 1.60, seed, recipe_key=r_key
        )

    # =========================================================================
    # GROUP 03 (#021-#030): Proven `how-to-use.md` Heavy Sub-Bass + Glacier/Forge Physics
    # =========================================================================
    g03_specs = [
        ("Lake-Ice Whip-Crack & Coal Forge Roar (CFG 1.65)", "glacier_titan_and_forge_anvil", "anti_whoosh_preserve_highs", "cfg_standard", 1.65, 42),
        ("Lake-Ice Whip-Crack & Coal Forge Roar (Windowed CFG)", "glacier_titan_and_forge_anvil", "anti_whoosh_preserve_highs", "cfg_windowed", 1.65, 108),
        ("Lake-Ice Whip-Crack & Coal Forge Roar (Native CFG 1.0)", "glacier_titan_and_forge_anvil", "none", "basic_cfg1", 1.0, 202),
        ("Icebreaker Pack-Ice Cleave & Magma Vent (CFG 1.60)", "monster_hunter_greatsword_weight", "anti_whoosh_preserve_highs", "cfg_standard", 1.60, 42),
        ("Icebreaker Pack-Ice Cleave & Magma Vent (Windowed CFG)", "monster_hunter_greatsword_weight", "anti_whoosh_preserve_highs", "cfg_windowed", 1.65, 77),
        ("Icebreaker Pack-Ice Cleave & Magma Vent (Native CFG 1.0)", "monster_hunter_greatsword_weight", "none", "basic_cfg1", 1.0, 303),
        ("Hoarfrost Ground-Shatter & Oil Cauldron Bloom (CFG 1.60)", "elden_ring_boss_arena_resonance", "anti_whoosh_preserve_highs", "cfg_standard", 1.60, 42),
        ("Hoarfrost Ground-Shatter & Oil Cauldron Bloom (Windowed)", "elden_ring_boss_arena_resonance", "anti_whoosh_preserve_highs", "cfg_windowed", 1.65, 108),
        ("Sub-Zero Cryo Implosion & Blowtorch Roar (CFG 1.60)", "industrial_cryo_and_blowtorch", "anti_whoosh_preserve_highs", "cfg_standard", 1.60, 77),
        ("Sub-Zero Cryo Implosion & Blowtorch Roar (Text-Only Neg)", "industrial_cryo_and_blowtorch", "minimal_one_liner", "cfg_text_only_neg", 1.50, 202),
    ]
    for title, r_key, neg_k, g_mode, cfg_val, seed in g03_specs:
        r = RECIPES[r_key]
        p = build_focused_ref_prompt(r["summary"], r["b1"], r["b2"], r["b3"], r["b4"], r["overall"])
        add_var(
            "G03", "Heavy Sub-Bass & Elemental Physics",
            title,
            f"Applies proven heavy sub-bass + physical ice/fire fracture vocabulary ({r['title']}) with full-bandwidth steel highs.",
            p, neg_k, g_mode, cfg_val, seed,
            neg_has_video=(g_mode != "cfg_text_only_neg"),
            window_range=(2, 11) if g_mode == "cfg_windowed" else (0, 16),
            recipe_key=r_key,
        )

    # =========================================================================
    # GROUP 04 (#031-#040): High-Carbon Steel & Swordsmanship Weight
    # =========================================================================
    g04_custom = [
        (
            "High-Carbon Katana Harmonic Ring + Glacier Snap",
            "a bright, sustained high-carbon steel sword draw ring hits with a deep sub-bass thump and thick glacier ice cracking open.",
            "a resonant, musical steel katana slash rings out with a crisp ice-crystal edge cleave.",
            "a sharp forged-steel guard lock rings into a roaring blacksmith furnace flare and crackling charcoal.",
            "a decisive, ringing high-carbon steel sword cut snaps with a tight flame burst.",
            "Resonant high-carbon steel sword harmonics paired with deep glacier-ice cracks and roaring furnace fire.",
            42, "cfg_standard", 1.60
        ),
        (
            "Heavy Broadsword Anvil Ring + Frost Shatter",
            "a heavy iron broadsword striking an anvil rings out alongside a concussive sub-bass boom and frozen lake ice splitting.",
            "a solid steel-on-ice broadsword chop rings with clear metallic sustain and brittle ice fracture.",
            "a heavy forged-steel tang ring ignites a pressurized coal-forge fire roar and timber snap.",
            "a weighty broadsword cleave rings with a sharp iron transient and dry wood-ember pop.",
            "Heavy broadsword anvil resonance, frozen lake-ice splitting, and pressurized coal-forge fire.",
            77, "cfg_windowed", 1.65
        ),
        (
            "Silver Rapier Chime + Diamond-Ice Facet Lock",
            "a pure, ringing silver-steel blade chime and deep bass pulse trigger a rapid cascade of diamond-hard ice facets locking into place.",
            "a fast, whip-sharp silver blade cut rings with a high crystalline frost ping.",
            "a bright silver guard click erupts into a roaring white-hot blowtorch flame and snapping birch embers.",
            "a crisp silver-steel slash rings with a tight, punchy flame ignition snap.",
            "Bright silver-steel blade chimes, diamond-ice facet cascades, and white-hot blowtorch fire.",
            108, "cfg_standard", 1.55
        ),
        (
            "Folded Tamahagane Steel + River Ice & Hearth Pine",
            RECIPES["tsushima_bamboo_steel_and_hearth"]["b1"],
            RECIPES["tsushima_bamboo_steel_and_hearth"]["b2"],
            RECIPES["tsushima_bamboo_steel_and_hearth"]["b3"],
            RECIPES["tsushima_bamboo_steel_and_hearth"]["b4"],
            RECIPES["tsushima_bamboo_steel_and_hearth"]["overall"],
            42, "cfg_standard", 1.60
        ),
        (
            "Folded Tamahagane Steel + River Ice (Windowed CFG)",
            RECIPES["tsushima_bamboo_steel_and_hearth"]["b1"],
            RECIPES["tsushima_bamboo_steel_and_hearth"]["b2"],
            RECIPES["tsushima_bamboo_steel_and_hearth"]["b3"],
            RECIPES["tsushima_bamboo_steel_and_hearth"]["b4"],
            RECIPES["tsushima_bamboo_steel_and_hearth"]["overall"],
            202, "cfg_windowed", 1.65
        ),
        (
            "Cathedral Greatsword + Hoarfrost Stomp (Seed 303)",
            RECIPES["elden_ring_boss_arena_resonance"]["b1"],
            RECIPES["elden_ring_boss_arena_resonance"]["b2"],
            RECIPES["elden_ring_boss_arena_resonance"]["b3"],
            RECIPES["elden_ring_boss_arena_resonance"]["b4"],
            RECIPES["elden_ring_boss_arena_resonance"]["overall"],
            303, "cfg_standard", 1.60
        ),
        (
            "Sekiro Parry Clang + Flash-Freeze & Oil Torch (Seed 404)",
            RECIPES["sekiro_katana_ring_and_elemental_bite"]["b1"],
            RECIPES["sekiro_katana_ring_and_elemental_bite"]["b2"],
            RECIPES["sekiro_katana_ring_and_elemental_bite"]["b3"],
            RECIPES["sekiro_katana_ring_and_elemental_bite"]["b4"],
            RECIPES["sekiro_katana_ring_and_elemental_bite"]["overall"],
            404, "cfg_standard", 1.60
        ),
        (
            "Sekiro Parry Clang + Flash-Freeze (Native CFG=1.0, Seed 404)",
            RECIPES["sekiro_katana_ring_and_elemental_bite"]["b1"],
            RECIPES["sekiro_katana_ring_and_elemental_bite"]["b2"],
            RECIPES["sekiro_katana_ring_and_elemental_bite"]["b3"],
            RECIPES["sekiro_katana_ring_and_elemental_bite"]["b4"],
            RECIPES["sekiro_katana_ring_and_elemental_bite"]["overall"],
            404, "basic_cfg1", 1.0
        ),
        (
            "Zelda Master Sword Quartz Chime & Campfire (CFG 1.60)",
            RECIPES["botw_crystalline_quartz_and_campfire"]["b1"],
            RECIPES["botw_crystalline_quartz_and_campfire"]["b2"],
            RECIPES["botw_crystalline_quartz_and_campfire"]["b3"],
            RECIPES["botw_crystalline_quartz_and_campfire"]["b4"],
            RECIPES["botw_crystalline_quartz_and_campfire"]["overall"],
            108, "cfg_standard", 1.60
        ),
        (
            "Zelda Master Sword Quartz Chime & Campfire (Windowed CFG)",
            RECIPES["botw_crystalline_quartz_and_campfire"]["b1"],
            RECIPES["botw_crystalline_quartz_and_campfire"]["b2"],
            RECIPES["botw_crystalline_quartz_and_campfire"]["b3"],
            RECIPES["botw_crystalline_quartz_and_campfire"]["b4"],
            RECIPES["botw_crystalline_quartz_and_campfire"]["overall"],
            512, "cfg_windowed", 1.65
        ),
    ]
    for title, b1, b2, b3, b4, ov, seed, g_mode, cfg_val in g04_custom:
        p = build_focused_ref_prompt(ov, b1, b2, b3, b4, ov)
        add_var(
            "G04", "Forged Steel & Swordsmanship",
            title,
            "Prioritizes unmistakable metallic sword resonance and harmonic steel ring alongside elemental ice/fire impact.",
            p, "none" if g_mode == "basic_cfg1" else "anti_whoosh_preserve_highs",
            g_mode, cfg_val, seed,
            window_range=(2, 11) if g_mode == "cfg_windowed" else (0, 16),
            recipe_key="sekiro_katana_ring_and_elemental_bite",
        )

    # =========================================================================
    # GROUP 05 (#041-#050): Stylized Anime Elemental Breathing & Hyper-Impact
    # =========================================================================
    for idx_i, (r_key, seed, g_mode, cfg_val, tag) in enumerate([
        ("demon_slayer_breathing_forms", 42, "cfg_standard", 1.60, "CFG 1.60"),
        ("demon_slayer_breathing_forms", 77, "cfg_windowed", 1.65, "Windowed 2..11"),
        ("demon_slayer_breathing_forms", 108, "basic_cfg1", 1.0, "Native CFG 1.0"),
        ("demon_slayer_breathing_forms", 202, "cfg_rescaled", 1.80, "Rescaled CFG 1.80"),
        ("demon_slayer_breathing_forms", 303, "negpip_vflip", 1.0, "NegPiP V-Flip"),
        ("arcade_fighting_game_hyper_punch", 42, "cfg_standard", 1.60, "CFG 1.60"),
        ("arcade_fighting_game_hyper_punch", 77, "cfg_windowed", 1.65, "Windowed 2..11"),
        ("arcade_fighting_game_hyper_punch", 108, "basic_cfg1", 1.0, "Native CFG 1.0"),
        ("arcade_fighting_game_hyper_punch", 202, "cfg_rescaled", 1.80, "Rescaled CFG 1.80"),
        ("arcade_fighting_game_hyper_punch", 303, "cfg_text_only_neg", 1.55, "Text-Only Neg"),
    ]):
        r = RECIPES[r_key]
        p = build_focused_ref_prompt(r["summary"], r["b1"], r["b2"], r["b3"], r["b4"], r["overall"])
        neg_k = "none" if g_mode == "basic_cfg1" else ("minimal_one_liner" if g_mode == "cfg_text_only_neg" else "anti_whoosh_preserve_highs")
        add_var(
            "G05", "Anime Breathing & Hyper-Impact",
            f"{r['title']} ({tag}, s{seed})",
            f"Tests stylized anime / fighting-game elemental power and sub-bass punch under {tag}.",
            p, neg_k, g_mode, cfg_val, seed,
            neg_has_video=(g_mode != "cfg_text_only_neg"),
            negpip_weight=0.75 if g_mode == "negpip_vflip" else 0.0,
            window_range=(2, 11) if g_mode == "cfg_windowed" else (0, 16),
            rescale_phi=0.75 if g_mode == "cfg_rescaled" else 0.0,
            recipe_key=r_key,
        )

    # =========================================================================
    # GROUP 06 (#051-#060): Concrete Foley Stage Props (50lb Ice Block, Anvil, Blowtorch)
    # =========================================================================
    for r_key, seed, g_mode, cfg_val, label in [
        ("pure_acoustic_foley_stage_master", 42, "cfg_standard", 1.60, "Foley Stage Master — CFG 1.60 (s42)"),
        ("pure_acoustic_foley_stage_master", 77, "cfg_windowed", 1.65, "Foley Stage Master — Windowed CFG (s77)"),
        ("pure_acoustic_foley_stage_master", 108, "basic_cfg1", 1.0, "Foley Stage Master — Native CFG 1.0 (s108)"),
        ("pure_acoustic_foley_stage_master", 202, "cfg_text_only_neg", 1.55, "Foley Stage Master — Text-Only Neg (s202)"),
        ("pure_acoustic_foley_stage_master", 303, "negpip_vflip", 1.0, "Foley Stage Master — NegPiP V-Flip (s303)"),
        ("industrial_cryo_and_blowtorch", 42, "cfg_windowed", 1.65, "Liquid Nitrogen & Blowtorch — Windowed CFG (s42)"),
        ("industrial_cryo_and_blowtorch", 108, "basic_cfg1", 1.0, "Liquid Nitrogen & Blowtorch — Native CFG 1.0 (s108)"),
        ("industrial_cryo_and_blowtorch", 303, "cfg_standard", 1.60, "Liquid Nitrogen & Blowtorch — Anti-Mud Neg (s303)"),
        ("monster_hunter_greatsword_weight", 404, "cfg_standard", 1.60, "Cast-Iron Anvil & Pack-Ice Cleave — CFG 1.60 (s404)"),
        ("monster_hunter_greatsword_weight", 512, "cfg_windowed", 1.65, "Cast-Iron Anvil & Pack-Ice Cleave — Windowed (s512)"),
    ]:
        r = RECIPES[r_key]
        p = build_focused_ref_prompt(r["summary"], r["b1"], r["b2"], r["b3"], r["b4"], r["overall"])
        neg_k = "none" if g_mode == "basic_cfg1" else ("minimal_one_liner" if g_mode == "cfg_text_only_neg" else "anti_mud_and_room")
        add_var(
            "G06", "Concrete Foley Stage Props",
            label,
            "Uses concrete physical foley objects (50lb clear ice blocks, iron anvils, pressurized gas blowtorches, cedar logs) that AudioVAE decodes with high realism.",
            p, neg_k, g_mode, cfg_val, seed,
            neg_has_video=(g_mode != "cfg_text_only_neg"),
            negpip_weight=0.75 if g_mode == "negpip_vflip" else 0.0,
            window_range=(2, 11) if g_mode == "cfg_windowed" else (0, 16),
            recipe_key=r_key,
        )

    # =========================================================================
    # GROUP 07 (#061-#070): Prompt Structure & Syntax Lab (Bracketed vs Prose vs Direct Cues)
    # =========================================================================
    for r_key, r_name in [("glacier_titan_and_forge_anvil", "Glacier+Forge"), ("sekiro_katana_ring_and_elemental_bite", "Sekiro Steel")]:
        r = RECIPES[r_key]
        p_bracket = build_focused_ref_prompt(r["summary"], r["b1"], r["b2"], r["b3"], r["b4"], r["overall"])
        p_prose = build_prose_ref_prompt(r["summary"], r["b1"], r["b2"], r["b3"], r["b4"], r["overall"])
        p_direct = build_direct_cue_prompt(r["b1"], r["b2"], r["b3"], r["b4"], r["overall"])

        add_var(
            "G07", "Prompt Syntax & Structure Lab",
            f"{r_name} — Bracketed [Shot 1, t0-t1] Schema (CFG 1.60)",
            "Tests explicit bracketed [Shot 1, 00:00.250-00:01.250] lines (from how-to-use.md) with zero outdoor scenery description.",
            p_bracket, "anti_whoosh_preserve_highs", "cfg_standard", 1.60, 108, recipe_key=r_key
        )
        add_var(
            "G07", "Prompt Syntax & Structure Lab",
            f"{r_name} — Inline Prose Timestamps Schema (CFG 1.60)",
            "Tests continuous paragraph prose ('At 00:00.250... From 00:01.250 to 00:01.830...') inside [Shot 1].",
            p_prose, "anti_whoosh_preserve_highs", "cfg_standard", 1.60, 108, recipe_key=r_key
        )
        add_var(
            "G07", "Prompt Syntax & Structure Lab",
            f"{r_name} — Direct Foley Cue Sheet (No <Subject> Tags, CFG 1.60)",
            "Tests whether removing <Subject> XML tags and feeding a pure timestamped foley cue sheet improves Qwen3-VL audio focus.",
            p_direct, "minimal_one_liner", "cfg_text_only_neg", 1.55, 108, neg_has_video=False, recipe_key=r_key
        )
        add_var(
            "G07", "Prompt Syntax & Structure Lab",
            f"{r_name} — Direct Foley Cue Sheet (Native CFG=1.0)",
            "Tests pure timestamped foley cue sheet in single-pass native CFG=1.0 mode.",
            p_direct, "none", "basic_cfg1", 1.0, 108, recipe_key=r_key
        )
        add_var(
            "G07", "Prompt Syntax & Structure Lab",
            f"{r_name} — Bracketed Schema + Positive-Only Negation (CFG=1.0)",
            "Tests Comfy-Org's official recommendation: single-pass CFG=1.0 with explicit negative constraints ('no wind, no whoosh, no reverb') written inside the positive prompt.",
            p_bracket, "none", "basic_cfg1", 1.0, 108, recipe_key=r_key
        )

    # =========================================================================
    # GROUP 08 (#071-#080): Sampler (`euler` vs `res_multistep`) & `shift_audio` Lab
    # Official Comfy-Org MiniMax-H3 templates use `res_multistep`, 20 steps, shift_audio=3.0!
    # =========================================================================
    r_g8 = RECIPES["glacier_titan_and_forge_anvil"]
    p_g8 = build_focused_ref_prompt(r_g8["summary"], r_g8["b1"], r_g8["b2"], r_g8["b3"], r_g8["b4"], r_g8["overall"])
    sampler_tests = [
        ("Official Comfy-Org Recipe: res_multistep, 20 steps, shift_a=3.0, CFG=1.0", "res_multistep", 20, 3.0, "basic_cfg1", 1.0, "none"),
        ("Official res_multistep, 20 steps, shift_a=3.0 + CFG=1.60", "res_multistep", 20, 3.0, "cfg_standard", 1.60, "anti_whoosh_preserve_highs"),
        ("Official res_multistep, 20 steps, shift_a=3.0 + Windowed CFG", "res_multistep", 20, 3.0, "cfg_windowed", 1.65, "anti_whoosh_preserve_highs"),
        ("res_multistep, 16 steps, shift_a=4.0 + CFG=1.60", "res_multistep", 16, 4.0, "cfg_standard", 1.60, "anti_whoosh_preserve_highs"),
        ("euler, 20 steps, shift_a=3.0 + CFG=1.60", "euler", 20, 3.0, "cfg_standard", 1.60, "anti_whoosh_preserve_highs"),
        ("euler, 16 steps, shift_a=2.0 (Fast Audio Schedule) + CFG=1.60", "euler", 16, 2.0, "cfg_standard", 1.60, "anti_whoosh_preserve_highs"),
        ("euler, 16 steps, shift_a=2.5 + CFG=1.60", "euler", 16, 2.5, "cfg_standard", 1.60, "anti_whoosh_preserve_highs"),
        ("euler, 16 steps, shift_a=3.0 + CFG=1.60", "euler", 16, 3.0, "cfg_standard", 1.60, "anti_whoosh_preserve_highs"),
        ("euler, 16 steps, shift_a=5.0 (Heavy Early Structure) + CFG=1.60", "euler", 16, 5.0, "cfg_standard", 1.60, "anti_whoosh_preserve_highs"),
        ("euler, 16 steps, shift_a=6.0 + Windowed CFG", "euler", 16, 6.0, "cfg_windowed", 1.65, "anti_whoosh_preserve_highs"),
    ]
    for title, s_name, steps, sh_a, g_mode, cfg_val, neg_k in sampler_tests:
        add_var(
            "G08", "Sampler & Flow-Shift Lab",
            title,
            f"Tests sampler={s_name}, steps={steps}, shift_audio={sh_a} to compare official Comfy-Org res_multistep against euler across audio flow schedules.",
            p_g8, neg_k, g_mode, cfg_val, 42,
            sampler_name=s_name, n_steps=steps, shift_audio=sh_a,
            window_range=(2, 12) if g_mode == "cfg_windowed" else (0, steps),
            recipe_key="glacier_titan_and_forge_anvil",
        )

    # =========================================================================
    # GROUP 09 (#081-#090): DSP & Spectral Bandwidth Lab (Raw 32kHz vs Sub-Bass vs Roll-Offs)
    # Tests 5 DSP profiles across 2 distinct seeds/recipes so we hear raw AudioVAE vs DSP.
    # =========================================================================
    dsp_profiles = [
        ("raw_32k", "100% Untouched Raw 32kHz AudioVAE (Zero Filters, Zero Gates)"),
        ("raw_gated", "Raw 32kHz Full-Bandwidth + Pause Silence Gate Only"),
        ("sub_boost_full_band", "+4.0dB Sub-Bass (<135Hz) + Full 16kHz Highs (No Low-Pass)"),
        ("sub_boost_10k_lp", "+4.0dB Sub-Bass (<135Hz) + Gentle 10kHz Silk Roll-Off"),
        ("how_to_use_5k6", "Proven how-to-use.md (+4.5dB Sub-Bass + 5.6kHz 8th-Order LPF)"),
    ]
    for r_key, r_short, seed in [("glacier_titan_and_forge_anvil", "Glacier+Forge", 144), ("sekiro_katana_ring_and_elemental_bite", "Sekiro Steel", 144)]:
        r = RECIPES[r_key]
        p = build_focused_ref_prompt(r["summary"], r["b1"], r["b2"], r["b3"], r["b4"], r["overall"])
        for dsp_key, dsp_desc in dsp_profiles:
            add_var(
                "G09", "DSP & Bandwidth Autopsy",
                f"{r_short} — {dsp_desc}",
                f"Isolates post-processing impact ({dsp_key}) on a fresh generation (seed 144) so you can hear what comes from the neural AudioVAE vs DSP.",
                p, "anti_whoosh_preserve_highs", "cfg_windowed", 1.65, seed,
                dsp_mode=dsp_key, window_range=(2, 11), recipe_key=r_key
            )
            seed += 13  # distinct seed per run so all 100 clips are unique neural generations

    # =========================================================================
    # GROUP 10 (#091-#100): Multi-Seed Championship Run (Top Hybrid Recipes)
    # Combines official `res_multistep` / `euler` + Anti-Whoosh Windowed/Standard CFG + Full-Band Sub-Bass
    # =========================================================================
    championship_specs = [
        ("Champ #1: Glacier+Forge + res_multistep 20s + Windowed CFG (s11)", "glacier_titan_and_forge_anvil", "res_multistep", 20, 3.0, "cfg_windowed", 1.65, 11),
        ("Champ #2: Glacier+Forge + res_multistep 20s + CFG 1.60 (s88)", "glacier_titan_and_forge_anvil", "res_multistep", 20, 3.0, "cfg_standard", 1.60, 88),
        ("Champ #3: Sekiro Steel + res_multistep 20s + Windowed CFG (s11)", "sekiro_katana_ring_and_elemental_bite", "res_multistep", 20, 3.0, "cfg_windowed", 1.65, 11),
        ("Champ #4: Sekiro Steel + res_multistep 20s + CFG 1.60 (s88)", "sekiro_katana_ring_and_elemental_bite", "res_multistep", 20, 3.0, "cfg_standard", 1.60, 88),
        ("Champ #5: Anime Breathing + res_multistep 20s + Windowed CFG (s55)", "demon_slayer_breathing_forms", "res_multistep", 20, 3.0, "cfg_windowed", 1.65, 55),
        ("Champ #6: Monster Hunter Weight + res_multistep 20s + CFG 1.60 (s66)", "monster_hunter_greatsword_weight", "res_multistep", 20, 3.5, "cfg_standard", 1.60, 66),
        ("Champ #7: Tsushima Steel & Hearth + res_multistep 20s + Windowed (s99)", "tsushima_bamboo_steel_and_hearth", "res_multistep", 20, 3.0, "cfg_windowed", 1.65, 99),
        ("Champ #8: Zelda Quartz & Campfire + res_multistep 20s + CFG 1.55 (s123)", "botw_crystalline_quartz_and_campfire", "res_multistep", 20, 3.0, "cfg_standard", 1.55, 123),
        ("Champ #9: Elden Ring Hoarfrost & Flame + euler 16s + Windowed (s777)", "elden_ring_boss_arena_resonance", "euler", 16, 3.5, "cfg_windowed", 1.65, 777),
        ("Champ #10: Foley Stage Master + res_multistep 20s + Text-Only Neg (s999)", "pure_acoustic_foley_stage_master", "res_multistep", 20, 3.0, "cfg_text_only_neg", 1.55, 999),
    ]
    for title, r_key, s_name, steps, sh_a, g_mode, cfg_val, seed in championship_specs:
        r = RECIPES[r_key]
        p = build_focused_ref_prompt(r["summary"], r["b1"], r["b2"], r["b3"], r["b4"], r["overall"])
        neg_k = "minimal_one_liner" if g_mode == "cfg_text_only_neg" else "anti_whoosh_preserve_highs"
        add_var(
            "G10", "Championship Multi-Seed Matrix",
            title,
            "Combines our strongest physical material recipes with res_multistep/euler, anti-whoosh guidance, and full-bandwidth sub-bass polish.",
            p, neg_k, g_mode, cfg_val, seed,
            sampler_name=s_name, n_steps=steps, shift_audio=sh_a,
            neg_has_video=(g_mode != "cfg_text_only_neg"),
            window_range=(2, 12) if g_mode == "cfg_windowed" else (0, steps),
            recipe_key=r_key,
        )

    assert len(variations) == 100, f"Expected 100 variations, got {len(variations)}"
    return variations


if __name__ == "__main__":
    vars_100 = build_100_variations()
    payload = {
        "clip_name": "04_knight_glacial_and_sunfire_breathing.mp4",
        "duration_s": 5.875,
        "frames": 141,
        "fps": 24,
        "resolution": "832x480",
        "beats": [
            {"id": "B1", "label": "Glacial Dragon Awakening", "start_s": 0.25, "end_s": 1.25},
            {"id": "B2", "label": "Glacial Sword Slash", "start_s": 1.83, "end_s": 2.65},
            {"id": "B3", "label": "Sunfire Dragon Awakening", "start_s": 3.33, "end_s": 4.33},
            {"id": "B4", "label": "Sunfire Sword Slash", "start_s": 4.75, "end_s": 5.45},
        ],
        "total_variations": len(vars_100),
        "variations": vars_100,
    }
    json_path = OUT_DIR / "manifest.json"
    js_path = OUT_DIR / "manifest.js"
    json_str = json.dumps(payload, indent=2, ensure_ascii=False)
    json_path.write_text(json_str, encoding="utf-8")
    js_path.write_text(f"window.FOLEY_MANIFEST = {json_str};\n", encoding="utf-8")
    print(f"[OK] Wrote {len(vars_100)} variations to {json_path} and {js_path}")
