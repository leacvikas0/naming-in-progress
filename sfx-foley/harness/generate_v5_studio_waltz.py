import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "C:/Users/silen/.gemini/antigravity-acp/media-tools")
from media_client import MediaClient

OUT_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/world/assets/audio/music/audition")
OUT_DIR.mkdir(parents=True, exist_ok=True)

V5_STUDIO_VARIATIONS = [
    (
        "21_v5_studio_a_clean_master",
        "V5 Studio A: Direct V5 Waltz + Pristine Studio Master Quality (3/4, 106 BPM)",
        "Pristine modern studio recording quality, crystal-clear instrument separation, ultra-clean zero noise floor, high-definition audiophile master. Cozy, romantic, sunlit 3/4 waltz main theme at 106 BPM, around 80 seconds. Built around a sweeping, instantly memorable, hummable melody introduced by a warm, close-miked expressive oboe and crisp fingerpicked acoustic guitar, then joined cleanly by a warm solo violin, solo cello, and delicate acoustic harp. Steady, consistent studio mix from start to finish with crisp acoustic transients and wide stereo imaging. Purely instrumental; no vocals.",
    ),
    (
        "22_v5_studio_b_intimate_quartet_waltz",
        "V5 Studio B: Audiophile Close-Miked Acoustic Quartet Waltz (3/4, 106 BPM)",
        "Ultra-clean modern studio recording in a quiet, dry acoustic studio room with close-miked precision and wide dynamic clarity. Warm, cozy, sunlit 3/4 waltz main theme at 106 BPM in G major ninth, around 80 seconds. Performed by an intimate acoustic quartet so every note is crisp and separated: a warm, woody oboe and sweet flute trading a super-catchy, heartwarming waltz hook over a buoyant fingerpicked classical and steel-string acoustic guitar, plucked upright bass, and a rich solo cello counter-melody. Crisp studio fidelity, zero mud, zero background hiss. Purely instrumental; no vocals.",
    ),
    (
        "23_v5_studio_c_piano_oboe_guitar_waltz",
        "V5 Studio C: High-Definition Studio Waltz — Oboe, Felt Piano, Guitar & Cello (3/4, 108 BPM)",
        "High-definition studio quality recording, pristine clarity, clean studio mix with distinct stereo separation and zero distortion. Charming, warm, cozy 3/4 waltz main theme at 108 BPM, around 80 seconds. Opens with a crisp close-miked acoustic guitar and warm studio grand piano establishing a gentle, infectious 3/4 waltz pocket. A warm, expressive oboe enters with an unforgettable, singable main melody, answered cleanly by a lyrical solo violin and warm solo cello. Balanced, sunlit, romantic, and crystal-clear from beginning to end. Purely instrumental; no vocals.",
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
    print("=== Generating 3 Studio-Quality V5 Waltz Variations in Parallel ===", flush=True)
    results = await asyncio.gather(*(run_one(s, t, p) for s, t, p in V5_STUDIO_VARIATIONS))
    manifest_path = OUT_DIR / "manifest.json"
    existing = []
    if manifest_path.exists():
        try:
            existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            existing = []
    by_slug = {item["slug"]: item for item in existing}
    for item in results:
        by_slug[item["slug"]] = item
    manifest_path.write_text(json.dumps(list(by_slug.values()), indent=2), encoding="utf-8")
    print("ALL 3 STUDIO V5 VARIATIONS COMPLETE!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
