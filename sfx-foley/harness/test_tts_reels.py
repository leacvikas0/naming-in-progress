import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "C:/Users/silen/.gemini/antigravity-acp/media-tools")
from media_client import MediaClient

OUT_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/sfx-foley/tts-test")
OUT_DIR.mkdir(parents=True, exist_ok=True)

REELS = [
    (
        "test_01_chibi_knight_puck",
        "Puck",
        "Voice acting session for an adorable, stubby-bodied, big-headed chibi kid knight wearing an oversized iron helmet that is slightly too heavy for him. Bright, childish, scrappy 10-year-old hero energy trying very hard to sound brave while swinging a chunky sword. Light forward youthful voice, quick punchy squeak-grunts on swings, a startled yelp on dodges, cute winded huffs while sprinting, and sweet innocent sincerity when whispering a prayer. Close-miked studio takes separated cleanly by pauses.",
        "<breath> Hah! <long pause> Yah!! <long pause> Hup—whoa! <long pause> <gasp> Hff—hff—hff... <long pause> Ow! <long pause> <sigh> Please... help us...",
    ),
    (
        "test_02_chibi_monster_fenrir",
        "Fenrir",
        "Character voice actor playing a cartoonishly grumpy, big-headed chibi monster—heavy cheeky huffs, goofy nasal snorts when appearing, clumsy chugging breaths when chasing, and loud theatrical cartoon bully grunts when swinging an axe. Playful stylized animation energy, never realistic horror.",
        "<gasp> Hrmph?! <long pause> Huh—huh—huh! <long pause> Bwaaahhh!! <long pause> Oof—urgh!",
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
    res["path"] = str(dst)
    res["slug"] = slug
    res["voice"] = voice
    print(
        f"[DONE] {slug}: {res['duration_seconds']}s, {res['sample_rate']}Hz, {res['size_bytes']} bytes -> {dst.name}",
        flush=True,
    )
    return res


async def main():
    # Strict <= 2 concurrent calls per user instruction
    results = await asyncio.gather(*(run_one(*r) for r in REELS))
    (OUT_DIR / "manifest.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("TTS 2-CALL TEST COMPLETE!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
