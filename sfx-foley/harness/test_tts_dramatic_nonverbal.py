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

REELS = [
    (
        "test_03_chibi_knight_dramatic_nonverbal",
        "Puck",
        "Voice actor for a tiny, big-headed chibi kid knight wearing an oversized iron helmet. Perform ONLY ultra-short, punchy, dramatic non-verbal vocal sounds and emotive breaths—NEVER speak any English words. Sharp explosive video-game sword-swing shouts, a startled dodge yelp, crisp pain flinches, and a trembling reverent wordless prayer hum and sigh. Close-miked, dry studio quality, compact timing separated cleanly by pauses.",
        "Hah! <long pause> Hyah! <long pause> Hraaah!! <long pause> <gasp> Hup! <long pause> Guh—ahk! <long pause> <breath> Mmm... <short pause> <sigh>",
    ),
    (
        "test_04_chibi_mage_dramatic_nonverbal",
        "Lumi",
        "Voice actor for a spirited, big-headed chibi kid mage wearing a floppy purple witch hat. Perform ONLY ultra-short, punchy, dramatic non-verbal vocal sounds and emotive breaths—NEVER speak any English words. Snappy playful wand-cast chirps, one dramatic big-blast release cry, a cute startled evade gasp, a crisp hurt flinch, and a soft tender wordless prayer sigh and hum. Close-miked, dry studio quality, compact timing separated cleanly by pauses.",
        "Eh! <long pause> Yah! <long pause> Haaaah!! <long pause> <gasp> Wah—hup! <long pause> Ahk! <long pause> <breath> Hmmm... <short pause> <sigh>",
    ),
]


async def run_one(slug, voice, instructions, text):
    print(f"[START] {slug} (voice={voice})...", flush=True)
    client = MediaClient()
    res = await client.audio(
        text,
        str(OUT_DIR),
        "gemini-3.8-flash-tts",
        kind="speech",
        voice=voice,
        instructions=instructions,
        response_format="mp3",
    )
    src = Path(res["path"])
    dst = OUT_DIR / f"{slug}.mp3"
    if dst.exists():
        dst.unlink()
    shutil.move(str(src), str(dst))
    shutil.copy2(str(dst), str(WORLD_DIR / dst.name))
    res["path"] = str(dst)
    res["slug"] = slug
    res["voice"] = voice
    print(
        f"[DONE] {slug}: {res['duration_seconds']}s, {res['sample_rate']}Hz, {res['size_bytes']} bytes -> {dst.name}",
        flush=True,
    )
    return res


async def main():
    results = await asyncio.gather(*(run_one(*r) for r in REELS))
    manifest_path = OUT_DIR / "manifest_dramatic.json"
    manifest_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    shutil.copy2(str(manifest_path), str(WORLD_DIR / manifest_path.name))
    print("DRAMATIC NON-VERBAL 2-CALL TEST COMPLETE!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
