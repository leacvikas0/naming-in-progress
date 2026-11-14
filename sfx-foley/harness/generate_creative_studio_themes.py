import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "C:/Users/silen/.gemini/antigravity-acp/media-tools")
from media_client import MediaClient

OUT_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/world/assets/audio/music/audition")
OUT_DIR.mkdir(parents=True, exist_ok=True)

CREATIVE_STUDIO_TRACKS = [
    (
        "24_studio_handpan_koto_flute_and_cello",
        "Creative Studio 1: Handpan (Hang Drum), Japanese Koto, Bamboo Flute & Cello (104 BPM)",
        "Ultra-clean modern audiophile studio recording in a quiet, dry acoustic studio room with close-miked precision, crisp transients, wide stereo separation, and zero background hiss. Performed by an intimate 4-instrument acoustic ensemble. Warm, cozy, sunlit fantasy valley main theme at 104 BPM in G Lydian and major ninth, around 80 seconds. A tuned bronze handpan (hang drum) played with soft fingertips and a close-miked Japanese koto pluck a hypnotic, warm, bouncing groove. Above them, a breathy bamboo shakuhachi flute and a rich, warm solo cello trade an irresistibly catchy, singable, heartwarming main melody. Tactile, magical, crystal-clear studio separation from start to finish. Purely instrumental; no vocals.",
    ),
    (
        "25_studio_ronroco_bandoneon_nyckelharpa_waltz",
        "Creative Studio 2: Andean Ronroco, Warm Bandoneon, Nyckelharpa & Upright Bass Waltz (3/4, 108 BPM)",
        "Ultra-clean modern audiophile studio recording in a quiet, dry acoustic studio room with close-miked precision, crisp transients, wide stereo separation, and zero background hiss. Performed by an intimate 4-instrument acoustic quartet. Cozy, romantic, sunlit 3/4 fantasy waltz main theme at 108 BPM, around 80 seconds. A close-miked wooden ronroco and acoustic guitar play a sparkling, buoyant 3/4 waltz rhythm with plucked upright double bass. A warm, breathing bandoneon-concertina and an expressive Swedish nyckelharpa (keyed fiddle with resonant sympathetic strings) trade an unforgettable, whistleable, charming melody. Earthy, wooden, creative, and crystal-clear studio master. Purely instrumental; no vocals.",
    ),
    (
        "26_studio_kalimba_bass_clarinet_harp_guitar",
        "Creative Studio 3: Thumb Piano (Kalimba), Woody Bass Clarinet, Celtic Harp & Guitar (102 BPM)",
        "Ultra-clean modern audiophile studio recording in a quiet, dry acoustic studio room with close-miked precision, crisp transients, wide stereo separation, and zero background hiss. Performed by an intimate 4-instrument acoustic quartet. Warm, cozy, playful fantasy village main theme at 102 BPM, around 80 seconds. Opens with a tactile close-miked wooden kalimba (thumb piano), sparkling Celtic harp, and fingerpicked nylon-string guitar playing a super-catchy syncopated hook. A warm, velvety, woody clarinet and bass clarinet in its rich low-mid register enters right in front of the microphone to sing the main theme, answered by a warm solo cello. Cozy, unique, intimate studio perfection. Purely instrumental; no vocals.",
    ),
    (
        "27_studio_marimba_vibraphone_12string_flute",
        "Creative Studio 4: Rosewood Marimba, Soft Vibraphone, 12-String Guitar & Alto Flute (108 BPM)",
        "Ultra-clean modern audiophile studio recording in a quiet, dry acoustic studio room with close-miked precision, crisp transients, wide stereo separation, and zero background hiss. Performed by an intimate 4-instrument acoustic ensemble. Sunlit, breezy, cozy fantasy main theme at 108 BPM in E major ninth, around 80 seconds. Warm rosewood marimba played with soft yarn mallets and mellow vibraphone bells interlock with a crisp close-miked 12-string acoustic guitar and warm acoustic bass. A smooth, expressive alto flute and solo violin trade a bright, uplifting, earworm melodic hook with plenty of breathing room. Shimmering, tactile, and crystal-clear studio mix. Purely instrumental; no vocals.",
    ),
    (
        "28_studio_hammered_dulcimer_duduk_guitar_cello",
        "Creative Studio 5: Hammered Dulcimer, Warm Apricot-Wood Duduk, Guitar & Cello (100 BPM)",
        "Ultra-clean modern audiophile studio recording in a quiet, dry acoustic studio room with close-miked precision, crisp transients, wide stereo separation, and zero background hiss. Performed by an intimate 4-instrument acoustic quartet. Deeply warm, cozy, nostalgic fantasy valley main theme at 100 BPM in D Dorian and F major ninth, around 80 seconds. A close-miked hammered dulcimer (santoor) and fingerpicked steel-string acoustic guitar create a shimmering, sunlit rhythmic bed over a warm plucked bass. A soulful, velvety apricot-wood duduk and warm English horn sing a deeply memorable, hummable, heartwarming melody, answered in harmony by a close-miked solo cello. Pure studio magic, zero mud. Purely instrumental; no vocals.",
    ),
    (
        "29_studio_una_corda_ piano_archlute_viola_waltz",
        "Creative Studio 6: Felt Una-Corda Piano, Plucked Archlute, Solo Viola & Wooden Flute Waltz (3/4, 106 BPM)",
        "Ultra-clean modern audiophile studio recording in a quiet, dry acoustic studio room with close-miked precision, crisp transients, wide stereo separation, and zero background hiss. Performed by an intimate 4-instrument chamber quartet. Cozy, graceful, sunlit 3/4 fantasy waltz main theme at 106 BPM, around 80 seconds. Intimate close-miked felt una-corda piano (where you softly hear the wool felt and wooden hammers) and a resonant plucked archlute-theorbo establish a warm, buoyant 3/4 waltz pulse. A rich, dark-toned solo viola and a sweet wooden traverso flute trade a super-catchy, romantic waltz melody in crisp studio counterpoint. Purely instrumental; no vocals.",
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
    print("=== Generating Creative Studio Batch 1 (24, 25, 26) ===", flush=True)
    res_1 = await asyncio.gather(*(run_one(s, t, p) for s, t, p in CREATIVE_STUDIO_TRACKS[:3]))
    print("=== Generating Creative Studio Batch 2 (27, 28, 29) ===", flush=True)
    res_2 = await asyncio.gather(*(run_one(s, t, p) for s, t, p in CREATIVE_STUDIO_TRACKS[3:]))
    all_res = list(res_1) + list(res_2)
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
    print("ALL 6 CREATIVE STUDIO TRACKS COMPLETE!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
