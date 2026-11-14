import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "C:/Users/silen/.gemini/antigravity-acp/media-tools")
from media_client import MediaClient, audio_metadata

OUT_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/world/assets/audio/music/audition")
OUT_DIR.mkdir(parents=True, exist_ok=True)

BATCH_1 = [
    (
        "01_sunlit_shibuya_jazz_bossa",
        "Shibuya Jazz-Bossa & Fender Rhodes (108 BPM)",
        "Breezy, sunlit contemporary Japanese jazz-bossa and Shibuya-kei instrumental groove at 108 BPM, around 80 seconds. Warm vintage Fender Rhodes electric piano playing sophisticated major-ninth, thirteenth, and altered jazz chord voicings, crisp close-miked fingerstyle nylon-string acoustic guitar, melodic walking upright bass, and a tight, light brushed snare and hi-hat pocket. A warm, lyrical solo alto flute and expressive solo violin trade playful, sophisticated melodies. Bright, sunny, witty, romantic, and effortlessly cool adult musicianship with rich jazz harmony. Purely instrumental; no vocals.",
    ),
    (
        "02_mathpop_neo_soul_breeze",
        "Sunlit Math-Pop & Neo-Soul Groove (114 BPM)",
        "Uplifting, sunlit Japanese instrumental math-pop and neo-soul groove at 114 BPM, around 80 seconds, in the style of Toconoma and Toe. Clean, glassy hollow-body electric guitar and crisp acoustic guitar playing interlocking, syncopated major-ninth and add9 chord riffs, warm Fender Rhodes pads, a bouncy, melodic fingerstyle electric bassline with deep pocket, and crisp, dry live studio drums with tight rimshots and ghost notes. Fresh, kinetic, breezy, fun, and deeply sophisticated modern musicianship. Purely instrumental; no vocals.",
    ),
    (
        "03_mediterranean_chamber_strut",
        "European Art-House Chamber-Jazz Strut (116 BPM)",
        "Playful, sunlit European art-house chamber-jazz and acoustic groove at 116 BPM, around 80 seconds. Crisp close-miked acoustic guitars playing a buoyant syncopated rhythm, warm dampened felt piano where you hear the wooden hammers, nimble upright double bass, light brushed percussion, and a charismatic, soaring solo violin melody with sophisticated major-seventh, suspended-second, and modal jazz turnarounds. Warm, charming, witty, light on its feet, and unmistakably mature. Purely instrumental; no vocals.",
    ),
]

BATCH_2 = [
    (
        "04_stylish_jazz_fusion_skirmish",
        "Stylish Flamenco & Jazz-Fusion Skirmish (128 BPM)",
        "High-energy, stylish acoustic jazz-fusion and modern Spanish nylon-guitar groove at 128 BPM, around 80 seconds. Virtuoso percussive nylon-string guitar strumming and rapid melodic runs, funky driving fingerstyle electric bassline, tight syncopated live jazz-funk drum kit with crisp snare and ride cymbal, warm vintage electric piano chord stabs, and a fiery, charismatic solo violin lead. Exhilarating, playful, razor-sharp, and confident adult groove. Purely instrumental; no vocals.",
    ),
    (
        "05_city_breeze_upbeat_adventure",
        "Upbeat Jazz-Fusion Valley Adventure (122 BPM)",
        "Bright, infectious 1980s Japanese jazz-fusion adventure groove at 122 BPM in E major ninth, around 80 seconds. Clean singing hollow-body lead guitar and bright vintage electric piano playing a joyful, sophisticated syncopated melody over a tight, bouncy slap-and-fingerstyle funk-jazz bassline, crisp live studio drums, and warm flute and flugelhorn harmony accents. Sunny, exhilarating, high-craft, and full of forward momentum. Purely instrumental; no vocals.",
    ),
    (
        "06_intimate_sunset_duet_groove",
        "Golden-Hour Lo-Fi Jazz & Cello Groove (96 BPM)",
        "Warm, romantic golden-hour instrumental jazz-hop and chamber groove at 96 BPM, around 80 seconds. Close-miked dampened felt piano playing lush bittersweet major-ninth and thirteenth chords, a soulful, expressive solo cello and fingerpicked nylon guitar trading intimate melodies, warm upright acoustic bass, and a laid-back, head-nodding brushed jazz drum beat. Deeply soulful, light, cozy, romantic, and mature. Purely instrumental; no vocals.",
    ),
]


async def run_one(slug, title, prompt):
    dst = OUT_DIR / f"{slug}.mp3"
    if dst.exists() and dst.stat().st_size > 100_000:
        meta = await audio_metadata(dst)
        print(f"[SKIP EXISTING] {slug}: {meta['duration_seconds']}s ({dst.stat().st_size}B)", flush=True)
        return {
            "slug": slug,
            "title": title,
            "prompt": prompt,
            "path": str(dst),
            "size_bytes": dst.stat().st_size,
            **meta,
        }
    print(f"[START] {slug} ({title})...", flush=True)
    client = MediaClient()
    res = await client.audio(prompt, str(OUT_DIR), "lyria-3.5", kind="music")
    src = Path(res["path"])
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
    manifest = []
    manifest_path = OUT_DIR / "manifest.json"
    for batch_idx, batch in enumerate([BATCH_1, BATCH_2], start=1):
        print(f"=== Running Batch {batch_idx} (3 concurrent tracks) ===", flush=True)
        results = await asyncio.gather(*(run_one(s, t, p) for s, t, p in batch))
        manifest.extend(results)
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"ALL {len(manifest)} TRACKS COMPLETE -> {manifest_path}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
