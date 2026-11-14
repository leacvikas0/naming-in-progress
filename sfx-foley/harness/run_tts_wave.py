import argparse
import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "C:/Users/silen/.gemini/antigravity-acp/media-tools")
from media_client import MediaClient

OUT_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/sfx-foley/tts-test")
WORLD_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/world/assets/audio/tts-test")
OUT_DIR.mkdir(parents=True, exist_ok=True)
WORLD_DIR.mkdir(parents=True, exist_ok=True)
MANIFEST_PATH = OUT_DIR / "audition_manifest.json"


WAVES = {
    "1": [
        {
            "slug": "hero_knight_milo_action",
            "group": "Main Heroes",
            "character": "Chibi Knight (Option A - Milo)",
            "role_desc": "Scrappy brave 9-year-old boy hero in an oversized helmet. Combat attacks, dodge, sprint pants, hit flinch.",
            "voice": "Milo",
            "instructions": (
                "Voice actor performing combat exertion cues for a cheerful, scrappy 9-year-old anime chibi boy knight "
                "swinging a chunky broadsword. Stay in one bright youthful boyish register throughout. "
                "Ultra-short dramatic non-verbal efforts only, dry studio close-mic, never speak any real words."
            ),
            "text": (
                "Hah! <long pause> "
                "Hyah! <long pause> "
                "Toryaaah!! <long pause> "
                "<gasp> Hup! <long pause> "
                "Huh-huh-huh! <long pause> "
                "Guh-ahk!"
            ),
        },
        {
            "slug": "hero_knight_tavi_action",
            "group": "Main Heroes",
            "character": "Chibi Knight / Sprite Alt (Tavi)",
            "role_desc": "Lighter, hyper-energetic child voice. Attacks, dodge, sprint, hit.",
            "voice": "Tavi",
            "instructions": (
                "Voice actor performing crisp action-game combat grunts for a tiny, energetic chibi boy knight. "
                "Consistent bright youthful pitch from start to end, snappy cartoonish enthusiasm. "
                "Ultra-short non-verbal vocal sounds only, dry close-mic studio, zero spoken words."
            ),
            "text": (
                "Eh! <long pause> "
                "Yah! <long pause> "
                "Hyaaaah!! <long pause> "
                "Whoop-hup! <long pause> "
                "Hff-hff-hff! <long pause> "
                "Owah!"
            ),
        },
    ],
    "2": [
        {
            "slug": "hero_mage_lumi_action",
            "group": "Main Heroes",
            "character": "Chibi Mage (Option A - Lumi)",
            "role_desc": "Bubbly spirited chibi kid witch casting frost lances, Starfall burst cry, nimble evade, flinch.",
            "voice": "Lumi",
            "instructions": (
                "Voice actor performing bubbly, spirited anime action-game voice efforts for a tiny chibi girl mage "
                "casting magic bolts and starfire bursts. Stay in one cheerful playful high young register throughout, dry close-mic studio. "
                "Ultra-short dramatic non-verbal chirps and bursts only, zero real words."
            ),
            "text": (
                "Pei! <long pause> "
                "Hyah! <long pause> "
                "Kyaaaah!! <long pause> "
                "<gasp> Hop-hup! <long pause> "
                "Hff-hff! <long pause> "
                "Aiee-khh!"
            ),
        },
        {
            "slug": "hero_mage_rina_alt",
            "group": "Main Heroes",
            "character": "Chibi Mage (Option B - Rina)",
            "role_desc": "Alternative cheerful mischievous anime chibi mage girl (snappy casts, giggle dodge, hurt).",
            "voice": "Rina",
            "instructions": (
                "Voice actor performing cute lively action-game spell efforts for a tiny cheerful chibi mage girl "
                "in a floppy witch hat. Consistent bright expressive young anime tone throughout, dry close-mic studio. "
                "Ultra-short dramatic non-verbal vocal cues only, never say any real words."
            ),
            "text": (
                "Hah! <long pause> "
                "Yaaah! <long pause> "
                "Fwoooah!! <long pause> "
                "<chuckle> Hup! <long pause> "
                "<gasp> Eep! <long pause> "
                "Owah-khh!"
            ),
        },
    ],
    "3": [
        {
            "slug": "enemy_goblin_gero",
            "group": "Goblins & Enemies",
            "character": "Green Goblin Raider (Option A - Gero)",
            "role_desc": "Cheeky, frantic neon-green chibi goblin with mohawk & axe. Beats: Appear -> Chase -> Attack -> Hit/Death.",
            "voice": "Gero",
            "instructions": (
                "Character voice actor playing a mischievous, scrappy, big-headed cartoon chibi goblin holding a chunky axe. "
                "Wild animated gremlin energy: sneaky startled spot-you snort, frantic greedy panting chase, feral goblin slash shriek, "
                "and slapstick hurt groan. Ultra-short non-verbal monster sounds only, dry close-mic, zero English words."
            ),
            "text": (
                "Keh?! <long pause> "
                "Heh-heh-heh! <long pause> "
                "Gyaaaah!! <long pause> "
                "Gwah-urk!"
            ),
        },
        {
            "slug": "enemy_goblin_zeno",
            "group": "Goblins & Enemies",
            "character": "Goblin / Werewolf Pack (Option B - Zeno)",
            "role_desc": "Snarly hyper pack gremlin / red-shirt wolf energy. Beats: Appear -> Chase -> Attack -> Hit.",
            "voice": "Zeno",
            "instructions": (
                "Character voice actor playing a hyper, snarly cartoon chibi goblin-wolf beast pouncing in melee. "
                "Theatrical stylized animation energy: curious low growl, frantic sniffing pant, ferocious lunge snap, "
                "and dramatic yelp on impact. Ultra-short non-verbal creature sounds only, dry studio, never speak words."
            ),
            "text": (
                "Grrr?! <long pause> "
                "Hff-grr-hff! <long pause> "
                "Raaaahhh!! <long pause> "
                "Yelp-ugh!"
            ),
        },
    ],
    "4": [
        {
            "slug": "enemy_skeleton_charon",
            "group": "Goblins & Enemies",
            "character": "Skeleton Legion (Minion/Warrior - Charon)",
            "role_desc": "Big-skulled rattling undead chibi skeleton. Beats: Pop from ground -> Chitter rush -> Axe swing -> Crumble.",
            "voice": "Charon",
            "instructions": (
                "Character voice actor playing a quirky, creepy-cute cartoon chibi skeleton warrior clattering out of the ground. "
                "Dry raspy spooky undead energy, playful Halloween cartoon tone (never realistic horror): startled bony gasp, "
                "rattling chitter laugh, hollow battle hiss, and falling-apart groan. Non-verbal vocal sounds only, zero words."
            ),
            "text": (
                "Khk?! <long pause> "
                "Ke-ke-keh! <long pause> "
                "Khaaaah!! <long pause> "
                "Urrk-khh..."
            ),
        },
        {
            "slug": "enemy_plant_sprite_arlo",
            "group": "Goblins & Enemies",
            "character": "Leaf Hood Forest Sprite (PlantWarrior - Arlo)",
            "role_desc": "Tiny glowing-eyed forest sprout sprite with a flower staff. Beats: Peek chirp -> Hop chase -> Thorn spit -> Wilt.",
            "voice": "Arlo",
            "instructions": (
                "Character voice actor playing an adorable tiny forest sprout creature hiding under a leafy hood. "
                "Playful Deku-scrub woodland creature sounds: curious owl-like chirp, bouncy excited hop squeaks, "
                "snappy puff-spit attack sound, and cute sad droop. Dramatic short non-verbal creature vocals only, zero words."
            ),
            "text": (
                "Hoo?! <long pause> "
                "Pip-pip-pip! <long pause> "
                "Ptoo-yah!! <long pause> "
                "Mew-oh..."
            ),
        },
    ],
    "5": [
        {
            "slug": "enemy_necromage_umbriel",
            "group": "Elites & Bosses",
            "character": "Skeleton Mage / Necromancer (Umbriel)",
            "role_desc": "Floppy witch-hat Skeleton Mage & smug Necromancer boss. Beats: Appear cackle -> Chant -> Spell blast -> Foiled gasp.",
            "voice": "Umbriel",
            "instructions": (
                "Character voice actor playing a theatrical, smug cartoon chibi necromancer wizard waving a skull staff. "
                "Mischievous wicked cackle, eerie wordless humming windup, dramatic spell detonation cry, "
                "and flustered villain flinch. Non-verbal dramatic sounds only, dry close-mic studio, zero real words."
            ),
            "text": (
                "Nyeh-heh-heh! <long pause> "
                "Hmm-mmm-hmm... <long pause> "
                "Zhaaaah!! <long pause> "
                "Gah-tchk!"
            ),
        },
        {
            "slug": "enemy_boss_brute_alnilam",
            "group": "Elites & Bosses",
            "character": "Heavy Brute / Black Knight / Golem (Alnilam)",
            "role_desc": "Towering OrcBrute flexing chest scars, BlackKnight elite, & Golem slams. Beats: Chest flex -> Stomp -> Slam roar -> Stagger.",
            "voice": "Alnilam",
            "instructions": (
                "Character voice actor playing a giant, thick-necked cartoon chibi ogre brute boss flexing his muscles. "
                "Deep booming comic-bully energy: arrogant chest-flex huff, heavy stomping charge breaths, "
                "massive ground-smash roar, and dazed stagger groan. Short dramatic non-verbal roars only, zero words."
            ),
            "text": (
                "Hmph-hmrr! <long pause> "
                "Huh! Huf! Huh! <long pause> "
                "GWOOOOHH!! <long pause> "
                "Urrgghh..."
            ),
        },
    ],
    "6": [
        {
            "slug": "hero_knight_milo_pray",
            "group": "Main Heroes",
            "character": "Chibi Knight Pray & Commune Emote (Milo Soft)",
            "role_desc": "Separate soft register take for Milo (same boy voice, gentle earnest prayer hums, wonder gasp, relieved sigh, happy chuckle).",
            "voice": "Milo",
            "instructions": (
                "Young 9-year-old boy voice actor performing soft, earnest, close-miked gentle vocal breaths, "
                "quiet trembling wordless prayer hums, a soft gasp of wonder, and a warm relieved sigh. "
                "Keep a consistent gentle young boyish voice throughout. Zero real words."
            ),
            "text": (
                "<breath> Mmm... <long pause> "
                "Ahh... <long pause> "
                "<gasp> Ooh! <long pause> "
                "<sigh> Hmh-hm! <chuckle>"
            ),
        },
        {
            "slug": "hero_mage_lumi_pray",
            "group": "Main Heroes",
            "character": "Chibi Mage Pray & Commune Emote (Lumi Soft)",
            "role_desc": "Separate soft register take for Lumi (tender childlike prayer hum, wonder gasp, warm relieved sigh, bright giggle).",
            "voice": "Lumi",
            "instructions": (
                "Young girl anime voice actor performing soft, tender, close-miked gentle vocal breaths, "
                "sweet trembling wordless prayer hums, an awestruck wonder gasp, and a warm happy sigh. "
                "Keep a consistent gentle young girl voice throughout. Zero real words."
            ),
            "text": (
                "<breath> Hmmm... <long pause> "
                "Ahh... <long pause> "
                "<gasp> Waaah... <long pause> "
                "<sigh> <chuckle>"
            ),
        },
    ],
    "7": [
        {
            "slug": "hero_knight_elio_action",
            "group": "Main Heroes",
            "character": "Chibi Knight (Option B - Elio)",
            "role_desc": "Alternative brave young boy knight direction (slightly warmer/fuller youthful hero energy vs Milo).",
            "voice": "Elio",
            "instructions": (
                "Voice actor performing crisp action-game combat exertions for a brave young anime chibi boy knight "
                "wearing an oversized iron helmet. Stay in one bright earnest boyish register throughout, "
                "short punchy non-verbal battle efforts only, dry studio close-mic, zero English words."
            ),
            "text": (
                "Ha! <long pause> "
                "Hyah! <long pause> "
                "Hyaaaah!! <long pause> "
                "<gasp> Hup! <long pause> "
                "Huh-huh! <long pause> "
                "Uhk-ah!"
            ),
        },
        {
            "slug": "enemy_black_knight_orus",
            "group": "Elites & Bosses",
            "character": "Armored Black Knight Elite (Orus)",
            "role_desc": "Chibi dark-plated knight with tall red plume & tower shield. Beats: Guard brace -> Shield push -> Heavy greatsword chop -> Stagger.",
            "voice": "Orus",
            "instructions": (
                "Character voice actor playing a stubby, theatrical chibi dark knight speaking from inside a thick iron bucket helmet. "
                "Serious yet playful cartoon villain energy: proud helmet-muffled snort, shield-brace effort, sharp knightly cleave shout, "
                "and iron-clang stagger groan. Ultra-short non-verbal efforts only, dry studio, zero words."
            ),
            "text": (
                "Hmph! <long pause> "
                "Hrrgh! <long pause> "
                "Kraaah!! <long pause> "
                "Urgh-hm!"
            ),
        },
    ],
}


async def run_one(spec: dict) -> dict:
    slug = spec["slug"]
    voice = spec["voice"]
    print(f"[START] {slug} (voice={voice})...", flush=True)
    client = MediaClient()
    res = await client.audio(
        spec["text"],
        str(OUT_DIR),
        "gemini-3.8-flash-tts",
        kind="speech",
        voice=voice,
        instructions=spec["instructions"],
        response_format="mp3",
    )
    src = Path(res["path"])
    dst = OUT_DIR / f"{slug}.mp3"
    if dst.exists():
        dst.unlink()
    shutil.move(str(src), str(dst))
    shutil.copy2(str(dst), str(WORLD_DIR / dst.name))
    entry = {
        **spec,
        "file": dst.name,
        "path": str(dst),
        "duration_seconds": res["duration_seconds"],
        "sample_rate": res["sample_rate"],
        "size_bytes": res["size_bytes"],
    }
    print(
        f"[DONE] {slug} -> {res['duration_seconds']}s ({res['size_bytes']} bytes, {res['sample_rate']}Hz)",
        flush=True,
    )
    return entry


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wave", required=True)
    args = parser.parse_args()
    specs = WAVES[args.wave]
    assert len(specs) <= 2, "Strict <= 2 concurrent TTS requests per wave!"
    results = await asyncio.gather(*(run_one(s) for s in specs))

    existing = {}
    if MANIFEST_PATH.exists():
        try:
            for item in json.loads(MANIFEST_PATH.read_text(encoding="utf-8")):
                existing[item["slug"]] = item
        except Exception:
            existing = {}
    for item in results:
        existing[item["slug"]] = item
    merged = list(existing.values())
    MANIFEST_PATH.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    shutil.copy2(str(MANIFEST_PATH), str(WORLD_DIR / MANIFEST_PATH.name))
    print(f"[WAVE {args.wave}] saved {len(results)} clips cleanly.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
