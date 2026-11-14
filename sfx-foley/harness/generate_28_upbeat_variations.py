import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "C:/Users/silen/.gemini/antigravity-acp/media-tools")
from media_client import MediaClient

OUT_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/world/assets/audio/music/audition")
OUT_DIR.mkdir(parents=True, exist_ok=True)

UPBEAT_28_TRACKS = [
    (
        "30_28v1_playful_dulcimer_english_horn_guitar_116bpm",
        "28-V1: Playful Hammered Dulcimer, Warm English Horn, Bouncy Guitar & Cello (116 BPM)",
        "Pristine 24-bit audiophile studio master recorded in a modern dry acoustic studio with Neumann condenser microphones, crystal-clear high-frequency air, crisp transients, wide stereo separation, and zero background hiss or mud. Performed by a tight 4-instrument acoustic quartet. Upbeat, warm, playful, and energetic sunlit fantasy main theme at 116 BPM in G major ninth and D Mixolydian, around 80 seconds. A shimmering close-miked hammered dulcimer and bouncy fingerstyle steel-string acoustic guitar lock into an infectious, smiling, joyful groove over a nimble plucked double bass. A warm, velvety English horn (cor anglais) and a rich solo cello trade a super-catchy, playful, uplifting melodic hook full of charm and forward momentum—bright, cozy, and happy, never sad or mournful. Purely instrumental; no vocals.",
    ),
    (
        "31_28v2_dulcimer_kalimba_woody_clarinet_groove_118bpm",
        "28-V2 (28x26 Hybrid): Hammered Dulcimer, Wooden Kalimba, Playful Clarinet & Guitar (118 BPM)",
        "Pristine 24-bit audiophile studio master recorded in a modern dry acoustic studio with close-miked precision, crisp transients, wide stereo imaging, and zero noise floor. Performed by an intimate 4-instrument acoustic ensemble. Lively, warm, playful, and sunny fantasy village main theme at 118 BPM in F Lydian and major ninth, around 80 seconds. Combines the sparkling wooden strikes of a close-miked hammered dulcimer with a tactile wooden kalimba (thumb piano) and a crisp, bouncy fingerpicked nylon-and-steel acoustic guitar groove. A warm, woody clarinet and sweet oboe trade a cheeky, irresistibly catchy, upbeat earworm melody, answered by warm pizzicato and bowed cello. Joyful, tactile, energetic, and crystal-clear studio fidelity. Purely instrumental; no vocals.",
    ),
    (
        "32_28v3_dulcimer_marimba_flute_and_cello_bounce_120bpm",
        "28-V3 (28x27 Hybrid): Hammered Dulcimer, Rosewood Marimba, 12-String Guitar & Flute (120 BPM)",
        "Pristine 24-bit audiophile studio master recorded in a modern dry acoustic studio with close-miked precision, sparkling clarity, wide stereo separation, and zero distortion. Upbeat, buoyant, warm, and playful sunlit adventure main theme at 120 BPM in E major ninth, around 80 seconds. A close-miked hammered dulcimer and warm rosewood marimba (played with soft yarn mallets) interlock with a bright, rhythmic 12-string acoustic guitar and bouncy acoustic bass. Above the groove, a warm wooden alto flute and expressive solo cello trade a joyful, spirited, hummable main theme hook. Energetic, sunny, cozy, and impeccably clean studio mix. Purely instrumental; no vocals.",
    ),
    (
        "33_28v4_upbeat_dulcimer_oboe_harp_and_pizzicato_115bpm",
        "28-V4: Upbeat Hammered Dulcimer, Playful Oboe d'Amore, Celtic Harp & Pizzicato Cello (115 BPM)",
        "Pristine 24-bit audiophile studio master recorded in a quiet, dry modern recording studio with close-miked condenser microphones, crisp acoustic transients, and wide stereo separation. Warm, playful, charming, and energetic fantasy main theme at 115 BPM in A major ninth, around 80 seconds. Driven by a bouncy, smiling rhythm of close-miked hammered dulcimer, sparkling Celtic harp, crisp fingerpicked acoustic guitar, and playful pizzicato cello. A warm, velvety oboe d'amore and wooden flute play a super-catchy, lighthearted, whistleable call-and-response melody that radiates warmth and fun. Purely instrumental; no vocals.",
    ),
    (
        "34_26v1_upbeat_kalimba_bass_clarinet_marimba_guitar_116bpm",
        "26-V1: Energetic Kalimba, Woody Bass Clarinet, Marimba, Harp & Guitar Groove (116 BPM)",
        "Pristine 24-bit audiophile studio master recorded in a modern dry studio room with close-miked precision, crystal-clear instrument separation, and zero mud. Playful, warm, upbeat, and cozy fantasy main theme at 116 BPM in G major ninth, around 80 seconds. A tight, head-nodding acoustic groove of wooden kalimba (thumb piano), warm rosewood marimba, sparkling harp, and syncopated fingerstyle guitar with light brushed shaker. A rich, woody clarinet and bass clarinet sing a super-catchy, playful, bouncing melody with wit and warmth, joined by a sunny solo violin and cello counter-melody. Purely instrumental; no vocals.",
    ),
    (
        "35_28v5_sunlit_dulcimer_guitar_english_horn_strut_118bpm",
        "28-V5: Sunlit Hammered Dulcimer, Acoustic Guitar Strut, English Horn & Singing Cello (118 BPM)",
        "Pristine 24-bit audiophile studio master recorded in a modern dry acoustic studio with close-miked precision, wide dynamic range, and crystal-clear stereo separation. Joyful, warm, playful, and adventurous fantasy valley main theme at 118 BPM in D Mixolydian and G major ninth, around 80 seconds. Opens immediately with an infectious, upbeat acoustic strut played on close-miked hammered dulcimer, crisp steel-string acoustic guitar, and warm hand-tapped wooden percussion. A warm, expressive English horn and a singing solo cello trade a bright, unforgettable, hummable adventure melody full of sunshine, playfulness, and heart. Purely instrumental; no vocals.",
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
    print("=== Generating Upbeat 28/26/27 Batch 1 (30, 31, 32) ===", flush=True)
    res_1 = await asyncio.gather(*(run_one(s, t, p) for s, t, p in UPBEAT_28_TRACKS[:3]))
    print("=== Generating Upbeat 28/26/27 Batch 2 (33, 34, 35) ===", flush=True)
    res_2 = await asyncio.gather(*(run_one(s, t, p) for s, t, p in UPBEAT_28_TRACKS[3:]))
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
    print("ALL 6 UPBEAT 28/26/27 VARIATIONS COMPLETE!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
