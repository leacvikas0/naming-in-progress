import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "C:/Users/silen/.gemini/antigravity-acp/media-tools")
from media_client import MediaClient

OUT_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/world/assets/audio/music/audition")
OUT_DIR.mkdir(parents=True, exist_ok=True)

BALANCED_TRACKS = [
    (
        "11_balanced_sunlit_valley_field",
        "11. Balanced Sunlit Valley Field: Felt Piano, Acoustic Guitar & Warm Ambient Pad (96 BPM)",
        "Restrained, well-balanced, modern open-world game exploration soundtrack at 96 BPM, around 80 seconds. Warm close-miked felt piano playing a simple, memorable, unhurried melody in G major ninth and E minor ninth with generous breathing room and pauses between phrases. Supported by a steady, gentle fingerpicked acoustic guitar pattern, a soft warm ambient synth-and-string pad bed, and a deep, calm solo cello bass line. Subtle, airy, sunlit, grounded, and modern—designed to sit comfortably underneath gameplay without virtuoso soloing, theatrical melodrama, or busy folk clichés. Purely instrumental; no vocals.",
    ),
    (
        "12_balanced_village_breeze_groove",
        "12. Balanced Meadow & Village Breeze: Acoustic Guitar, Soft Piano & Gentle Pulse (104 BPM)",
        "Balanced, light, and mature contemporary indie-game daytime exploration music at 104 BPM, around 80 seconds. Clean fingerpicked steel-and-nylon acoustic guitar and warm acoustic piano sharing a relaxed, pleasant syncopated groove over a soft, understated bass pulse and light brushed shaker. Short, tasteful, simple melodic phrases from a warm alto flute and soft strings enter gently and leave plenty of open space. Cohesive, sunny, thoughtful, and modern—neither a cartoon folk jig nor a busy jazz solo. Purely instrumental; no vocals.",
    ),
    (
        "13_balanced_sacred_stone_reflection",
        "13. Rain on Warm Limestone: Spacious Piano, Harp Harmonics & Warm Cello Bed (88 BPM)",
        "Thoughtful, luminous, and understated modern atmospheric chamber piece at 88 BPM in D Dorian and F major ninth, around 80 seconds. Sparse, resonant acoustic piano notes and delicate harp harmonics floating over a warm, steady, evolving low cello and subtle ambient pad chord progression. A gentle, restrained solo cello plays a quiet, heartfelt motif without heavy vibrato or melodrama. Calm, poetic, spacious, and modern. Purely instrumental; no vocals.",
    ),
    (
        "14_balanced_modern_kinetic_combat",
        "14. Balanced Modern Action Combat: Tight Ostinato Strings, Piano & Sub-Bass Pulse (124 BPM)",
        "Focused, well-balanced modern action-RPG combat track at 124 BPM in D minor and Dorian, around 80 seconds. A tight, controlled, driving rhythmic pulse of warm sub-bass, muted acoustic guitar, and clean cinematic percussion, locked in with a crisp, disciplined staccato cello and viola ostinato. Above the groove, a clear, memorable acoustic piano and solo violin state a cool, determined melodic hook with restraint and precision—urgent, stylish, and playable without frantic shredding or cartoonish theatrics. Purely instrumental; no vocals.",
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
    print("=== Generating Batch 1 (11, 12, 13) ===", flush=True)
    res_1 = await asyncio.gather(*(run_one(s, t, p) for s, t, p in BALANCED_TRACKS[:3]))
    print("=== Generating Batch 2 (14) ===", flush=True)
    res_2 = await asyncio.gather(*(run_one(s, t, p) for s, t, p in BALANCED_TRACKS[3:]))
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
    print("ALL BALANCED GAME TRACKS COMPLETE!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
