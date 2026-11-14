import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "C:/Users/silen/.gemini/antigravity-acp/media-tools")
from media_client import MediaClient

OUT_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/world/assets/audio/music/audition")
OUT_DIR.mkdir(parents=True, exist_ok=True)

WORLD_TRACKS = [
    (
        "07_wisteria_valley_acoustic_breeze",
        "Wisteria Valley Breeze: Classical Guitar, Wooden Flute, Harp & Cello (104 BPM)",
        "Sunlit, nostalgic, and breezy acoustic chamber piece at 104 BPM, around 80 seconds, scored for a hand-painted sunlit valley with drifting wisteria petals, a turning wooden windmill, and warm limestone ruins. Close-miked fingerpicked nylon-string classical guitar and delicate acoustic harp playing flowing Dorian and Lydian suspended ninth arpeggios. A warm, breathy wooden concert flute and a rich, expressive solo cello trade a wistful, romantic, and adventurous melody, supported by a gentle plucked double bass and soft hand-played wooden frame drum. 100% acoustic wooden and string instruments; no drum kit, no hi-hats, no electric guitar, no electric piano, no brass. Purely instrumental; no vocals.",
    ),
    (
        "08_rain_on_warm_limestone_piano_strings",
        "Rain on Warm Limestone: Sunlit Acoustic Piano, Violin & Cello Waltz (6/8, 112 BPM)",
        "Graceful, sunlit, and deeply romantic acoustic chamber waltz in 6/8 time at 112 BPM, around 80 seconds. Intimate close-miked acoustic grand piano playing sparkling, spacious major-ninth and suspended impressionist voicings with lots of breathing room and sunlight, joined by a soaring, lyrical solo violin and warm solo cello singing a heartfelt, buoyant melody in counterpoint. Gentle pizzicato strings and delicate acoustic guitar add light forward motion. Evokes a sunlit European hillside village, ancient carved stone wells, and two companions walking side by side. 100% acoustic chamber instruments; no drum set, no electric instruments, no brass. Purely instrumental; no vocals.",
    ),
    (
        "09_windmill_plaza_acoustic_folk_strut",
        "Windmill Plaza Walk: Acoustic Guitar, Mandola, Violin & Frame Drum (116 BPM)",
        "Light, playful, and mature acoustic folk-chamber piece in D Dorian and G Mixolydian at 116 BPM, around 80 seconds. Crisp close-miked fingerstyle acoustic guitars and wooden mandola playing an infectious, sunny interlocking rhythm, accompanied by a warm bowed cello, plucked upright bass, and a light hand-played bodhran frame drum. A spirited, witty duet between a wooden alto flute and a lyrical solo violin dances on top with sophisticated modal turnarounds. Warm, organic, earthy, and full of charm and wanderlust—never childish or nursery-rhyme simple. 100% acoustic instruments; no modern drum kit, no snare or cymbals, no electric instruments. Purely instrumental; no vocals.",
    ),
    (
        "10_sunlit_meadow_blade_and_spell_duet",
        "Sunlit Meadow Skirmish: Percussive Acoustic Guitar, Cello & Violin Duet (132 BPM)",
        "Urgent, exhilarating, and stylish acoustic chamber battle piece in E Dorian at 132 BPM, around 80 seconds. Driving percussive flamenco-and-classical acoustic guitar strumming, rapid cascading acoustic piano and harp runs, deep resonant hand-played taiko and wooden frame drums, and a thrilling virtuoso duet between a fiery solo violin and a gritty, expressive solo cello trading rapid phrases like a swordfighter and a mage fighting side by side in a sunlit flower meadow. Heroic, agile, refined, and purely acoustic—no rock drum kit, no electric guitar, no heavy brass. Purely instrumental; no vocals.",
    ),
]


async def run_one(slug, title, prompt):
    print(f"[START] {slug} ({title})...", flush=True)
    client = MediaClient()
    res = await client.audio(prompt, str(OUT_DIR), "lyria-3.5", kind="music")
    src = Path(res["path"])
    dst = OUT_DIR / f"{slug}.mp3"
    if dst.exists():
        dst.unlink()
    shutil.move(str(src), str(dst))
    res["path"] = str(dst)
    res["slug"] = slug
    res["title"] = title
    res["prompt"] = prompt
    print(
        f"[DONE] {slug}: {res['duration_seconds']}s, {res['sample_rate']}Hz, {res['size_bytes']} bytes -> {dst.name}",
        flush=True,
    )
    return res


async def main():
    print("=== Generating Batch A (07, 08, 09) ===", flush=True)
    res_a = await asyncio.gather(*(run_one(s, t, p) for s, t, p in WORLD_TRACKS[:3]))
    print("=== Generating Batch B (10) ===", flush=True)
    res_b = await asyncio.gather(*(run_one(s, t, p) for s, t, p in WORLD_TRACKS[3:]))
    all_res = list(res_a) + list(res_b)
    manifest_path = OUT_DIR / "manifest.json"
    existing = []
    if manifest_path.exists():
        try:
            existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            existing = []
    by_slug = {item["slug"]: item for item in existing}
    for item in all_res:
        by_slug[item["slug"]] = item
    manifest_path.write_text(json.dumps(list(by_slug.values()), indent=2), encoding="utf-8")
    print("ALL WORLD-MATCHED TRACKS COMPLETE!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
