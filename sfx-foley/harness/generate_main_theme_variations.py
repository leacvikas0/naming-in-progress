import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "C:/Users/silen/.gemini/antigravity-acp/media-tools")
from media_client import MediaClient

OUT_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/world/assets/audio/music/audition")
OUT_DIR.mkdir(parents=True, exist_ok=True)

THEME_VARIATIONS = [
    (
        "15_theme_v1_cozy_ocarina_and_guitar",
        "Theme V1: Cozy Ocarina, Fingerstyle Guitar, Harp & Cello (102 BPM)",
        "Warm, cozy, sunlit fantasy village main theme at 102 BPM in G major ninth, around 80 seconds. Built around a super catchy, singable, heartwarming 8-bar melodic hook that repeats and sticks in your head immediately. Opens right away with the catchy main melody played on a sweet, warm clay ocarina and low wooden flute over a cozy, bouncing fingerpicked acoustic guitar and warm plucked upright bass. In the second half, a rich solo cello and sparkling Celtic harp join the melody in harmony. Cozy, nostalgic, inviting fantasy style with balanced restraint and clear melodic structure. Purely instrumental; no vocals.",
    ),
    (
        "16_theme_v2_felt_piano_pizzicato_cello",
        "Theme V2: Catchy Felt Piano, Pizzicato Strings & Warm Cello (98 BPM)",
        "Warm, cozy, and memorable fantasy adventure main theme at 98 BPM in F major and D Dorian, around 80 seconds. Designed by a master melody writer around an infectious, uplifting, hummable 8-bar piano hook. Opens immediately with close-miked warm felt piano playing the catchy main theme, supported by playful, cozy pizzicato strings, fingerpicked acoustic guitar, and soft brushed shaker. A warm, singing solo cello and gentle woodwinds answer and harmonize the main hook. Cozy, sunlit, emotional, and modern fantasy charm without overplaying. Purely instrumental; no vocals.",
    ),
    (
        "17_theme_v3_concertina_harp_and_violin",
        "Theme V3: Sunlit Concertina, Celtic Harp, Guitar & Sweet Violin Hook (108 BPM)",
        "Charming, warm, cozy European fantasy town main theme at 108 BPM, around 80 seconds. Centered on a bright, irresistibly catchy, whistleable pastoral melody traded between a warm, gentle accordion-concertina and a sweet, lyrical solo violin playing simple, memorable phrases. Backed by a cozy strumming and fingerpicking acoustic guitar groove, shimmering harp arpeggios, warm double bass, and soft hand-tapped tambourine and shaker. Sunny, welcoming, lighthearted yet mature fantasy atmosphere. Purely instrumental; no vocals.",
    ),
    (
        "18_theme_v4_wooden_marimba_guitar_flute",
        "Theme V4: Warm Wooden Marimba, Nylon Guitar & Alto Flute Groove (110 BPM)",
        "Playful, warm, cozy fantasy valley main theme at 110 BPM, around 80 seconds. Features an ultra-catchy, syncopated, earworm melodic hook played in unison by a warm wooden marimba and crisp nylon-string acoustic guitar, joined by a smooth, sunny alto flute and soft celesta chords over a relaxed, head-nodding bass and brushed hand-percussion groove. Tactile wooden warmth, deeply catchy melody, cozy fantasy world-building, and balanced modern production. Purely instrumental; no vocals.",
    ),
    (
        "19_theme_v5_oboe_lute_and_strings_waltz",
        "Theme V5: Storybook 3/4 Fantasy Waltz — Oboe, Acoustic Lute & Warm Strings (106 BPM)",
        "Cozy, romantic, sunlit fantasy waltz main theme in 3/4 time at 106 BPM, around 80 seconds. Built around a sweeping, instantly memorable, hummable storybook melody introduced by a warm, expressive oboe and fingerpicked acoustic lute and guitar, then blossoming into a lush, cozy chorus with warm chamber strings, harp, and soft French horn warmth. Nostalgic, heartfelt, graceful, and unmistakably fantasy without melodrama. Purely instrumental; no vocals.",
    ),
    (
        "20_theme_v6_wanderlust_flute_dulcimer_guitar",
        "Theme V6: Wanderlust Groove — Low Wooden Flute, Hammered Dulcimer & Strummed Guitar (104 BPM)",
        "Warm, adventurous, cozy fantasy road main theme at 104 BPM in D Mixolydian, around 80 seconds. Anchored by a laid-back, head-nodding strummed and fingerpicked acoustic guitar groove, shimmering hammered dulcimer notes, warm cello counter-melody, and soft wooden hand-drum pulse. A breathy, intimate low wooden flute leads with a super catchy, memorable, upbeat wanderlust melody that makes you want to explore a sunlit fantasy valley with a friend. Purely instrumental; no vocals.",
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
    print("=== Generating Main Theme Batch 1 (V1, V2, V3) ===", flush=True)
    res_1 = await asyncio.gather(*(run_one(s, t, p) for s, t, p in THEME_VARIATIONS[:3]))
    print("=== Generating Main Theme Batch 2 (V4, V5, V6) ===", flush=True)
    res_2 = await asyncio.gather(*(run_one(s, t, p) for s, t, p in THEME_VARIATIONS[3:]))
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
    print("ALL 6 MAIN THEME VARIATIONS COMPLETE!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
