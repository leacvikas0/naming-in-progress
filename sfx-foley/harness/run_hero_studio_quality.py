import argparse
import asyncio
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
import soundfile as sf

sys.path.insert(0, "C:/Users/silen/.gemini/antigravity-acp/media-tools")
from media_client import MediaClient

OUT_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/sfx-foley/tts-test")
WORLD_DIR = Path("C:/Users/silen/projects/kilo-3d-kit/world/assets/audio/tts-test")
SR = 48000


def clean_master_only(in_mp3: Path, out_mp3: Path, target_rms_db: float = -12.0, peak_ceil_db: float = -1.0) -> dict:
    """Pure clean mastering (HPF + gentle level + true peak ceiling) with ZERO pitch/formant vocoder distortion."""
    with tempfile.TemporaryDirectory() as td:
        td_p = Path(td)
        rw = td_p / "r.wav"
        pw = td_p / "p.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(in_mp3), "-ar", str(SR), "-ac", "1", str(rw)], check=True)
        x, sr = sf.read(str(rw))
        x = x.astype(np.float64)

        sos = signal.butter(3, 75.0, btype="highpass", fs=sr, output="sos")
        y = signal.sosfiltfilt(sos, x)

        # Gentle RMS leveling (2:1 above -21 dB) so dodges & attacks balance cleanly
        att = math.exp(-1.0 / (0.005 * sr))
        rel = math.exp(-1.0 / (0.115 * sr))
        env = np.zeros_like(y)
        cur = 0.0
        ax = np.abs(y)
        for i in range(len(y)):
            v = ax[i]
            cur = att * cur + (1.0 - att) * v if v > cur else rel * cur + (1.0 - rel) * v
            env[i] = cur
        thresh = 10.0 ** (-21.0 / 20.0)
        gain = np.where(env > thresh, (thresh * (env / thresh) ** 0.5) / np.maximum(env, 1e-9), 1.0)
        y = y * gain

        act = y[np.abs(y) > 0.012]
        cur_rms = float(np.sqrt(np.mean(act ** 2))) if len(act) else 0.05
        y = y * min(20.0, (10.0 ** (target_rms_db / 20.0)) / max(cur_rms, 1e-9))

        ceil_lin = 10.0 ** (peak_ceil_db / 20.0)
        abs_p = np.abs(y)
        peak_env = np.copy(abs_p)
        for i in range(len(y) - 2, -1, -1):
            peak_env[i] = max(abs_p[i], peak_env[i + 1] * 0.992)
        cur_p = 0.0
        rel_p = math.exp(-1.0 / (0.045 * sr))
        for i in range(len(y)):
            cur_p = max(peak_env[i], cur_p * rel_p)
            peak_env[i] = cur_p
        y = y * np.where(peak_env > ceil_lin, ceil_lin / np.maximum(peak_env, 1e-9), 1.0)
        pk = float(np.max(np.abs(y)))
        if pk > ceil_lin:
            y = y * (ceil_lin / pk)

        # Estimate F0
        y24 = signal.resample_poly(y, 1, 2)
        sr24 = 24000
        win, hop = int(0.04 * sr24), int(0.01 * sr24)
        f0s = []
        for i in range(0, len(y24) - win, hop):
            seg = y24[i : i + win]
            if np.sqrt(np.mean(seg ** 2)) < 0.04:
                continue
            seg = seg - np.mean(seg)
            ac = np.correlate(seg, seg, mode="full")[len(seg) - 1 :]
            lo, hi = int(sr24 / 500), int(sr24 / 70)
            pidx = np.argmax(ac[lo:hi]) + lo
            if ac[pidx] > 0.35 * ac[0]:
                f0s.append(sr24 / pidx)
        med_f0 = float(np.median(f0s)) if f0s else 0.0

        sf.write(str(pw), y.astype(np.float32), sr, subtype="PCM_16")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(pw), "-c:a", "libmp3lame", "-b:a", "192k", str(out_mp3)], check=True)
        shutil.copy2(str(out_mp3), str(WORLD_DIR / out_mp3.name))
        act_m = y[np.abs(y) > 0.02]
        rms_db = 20.0 * math.log10(max(float(np.sqrt(np.mean(act_m ** 2))) if len(act_m) else 1e-9, 1e-9))
        return {"durationSec": round(len(y) / sr, 3), "rmsDb": round(rms_db, 2), "medianF0Hz": round(med_f0, 1)}


BATCHES = {
    "knight1": [
        {
            "slug": "v4_hero_knight_finn",
            "voice": "Finn",
            "instructions": (
                "Studio quality voice acting session. Male actor voicing an energetic, brave chibi boy knight "
                "swinging a sword inside an iron helmet. Unmistakably male young hero tone (never female, never high-pitched), "
                "dramatic punchy combat grunts, dodge gasp, sprint huffs, pain flinch. Zero English words."
            ),
            "text": "<breath> Hah!! <long pause> Hyah!! <long pause> Hraaah!! <long pause> <gasp> Hup! <long pause> Huh-hah-huh! <long pause> Guh-ahk!!",
        },
        {
            "slug": "v4_hero_knight_enzo",
            "voice": "Enzo",
            "instructions": (
                "Studio quality voice acting session. Male voice actor performing dramatic, scrappy anime boy hero "
                "combat efforts for a brave young male chibi knight. Distinctly masculine youthful voice, full energy, "
                "tight sword shouts, startled evade, sprint breaths, hurt grunt. Non-verbal sounds only, zero words."
            ),
            "text": "<breath> Ha!! <long pause> Toryah!! <long pause> Gyaaah!! <long pause> <gasp> Whoa-hup! <long pause> Hff-hah-hff! <long pause> Uwah-kh!!",
        },
    ],
    "knight2": [
        {
            "slug": "v4_hero_knight_riko",
            "voice": "Riko",
            "instructions": (
                "Studio quality voice acting session. Young male hero actor playing a plucky, energetic chibi boy knight "
                "in combat. Clear masculine boyish tone (never girlish), crisp explosive sword cries, evade gasp, hurt flinch. "
                "Ultra-short wordless vocalizations only, zero real words."
            ),
            "text": "<breath> Hah!! <long pause> Hyah!! <long pause> Seyaaah!! <long pause> <gasp> Hup! <long pause> Huh-hff-huh! <long pause> Gwah!!",
        },
        {
            "slug": "v4_hero_knight_puck_male",
            "voice": "Puck",
            "instructions": (
                "Studio quality voice acting session. Male voice actor with a lively, cheeky young male hero voice "
                "playing a brave chibi boy knight in oversized armor. Keep a distinctly male tone throughout. "
                "Dramatic sword slashes, evade gasp, sprint panting, impact flinch. Zero real words."
            ),
            "text": "<breath> Hah!! <long pause> Yah!! <long pause> Hraaaah!! <long pause> <gasp> Hup! <long pause> Huh-huh-hff! <long pause> Guh-khh!!",
        },
    ],
    "mage": [
        {
            "slug": "v4_hero_mage_lumi_studio",
            "voice": "Lumi",
            "instructions": (
                "Studio quality voice acting session. Female voice actress playing a cute, bubbly young anime chibi witch mage. "
                "Pristine crystal-clear studio voice with playful sparkling energy, dramatic spell release cry, cute startled evade gasp, "
                "and expressive flinch. Non-verbal vocalizations only, zero English words."
            ),
            "text": "<breath> Pei! <long pause> Yah!! <long pause> Kyaaaah!! <long pause> <gasp> Eep-hup!! <long pause> Hff-hah-hff! <long pause> Aiya-khh!!",
        },
        {
            "slug": "v4_hero_mage_kira_studio",
            "voice": "Kira",
            "instructions": (
                "Studio quality voice acting session. Female voice actress performing charming, energetic young chibi girl mage "
                "spell-casting cries and magical combat efforts. Crystal-clear studio tone, sweet expressive personality, "
                "sparkling dramatic climax cry, cute dodge gasp, hurt squeak. Zero real words."
            ),
            "text": "<breath> Eh! <long pause> Hyah!! <long pause> Haaa-yaaah!! <long pause> <gasp> Whoa-hup! <long pause> Hff-hff! <long pause> Owah-kh!!",
        },
    ],
    "knight_child1": [
        {
            "slug": "v4_hero_knight_child_puck",
            "voice": "Puck",
            "instructions": (
                "Studio quality voice acting session. Play an adorable 8-year-old little boy child pretending to be a brave chibi knight. "
                "Must sound like a young kid boy (NOT a grown man, NOT a girl): lively childish boyish shouts, cute clumsy dodge yelp, "
                "winded kid running breaths, dramatic cartoon hurt cry. Non-verbal sounds only, zero English words."
            ),
            "text": "<breath> Hah! <long pause> Yah!! <long pause> Hraaaah!! <long pause> <gasp> Hup-wah!! <long pause> Hff-hff-hff! <long pause> Owah-uhk!!",
        },
        {
            "slug": "v4_hero_knight_child_riko",
            "voice": "Riko",
            "instructions": (
                "Studio quality voice acting session. Voice an energetic 8-year-old little boy child chibi knight hero swinging a wooden/iron sword. "
                "Authentic young kid boy energy (not deep adult male, not feminine girl): cute scrappy little-boy sword yelps, "
                "startled hop gasp, playful huffs, dramatic hurt squeak. Non-verbal sounds only, zero English words."
            ),
            "text": "<breath> Hah! <long pause> Hyah!! <long pause> Toryaaah!! <long pause> <gasp> Whoop-hup! <long pause> Huh-hff-huh! <long pause> Guh-ow!!",
        },
    ],
    "knight_14yo": [
        {
            "slug": "v4_hero_knight_14yo_enzo",
            "voice": "Enzo",
            "instructions": (
                "Studio quality voice acting session. Play an energetic, heroic 14-year-old teenage boy anime knight "
                "(think Link or Tanjiro age 14). Distinctly male teen energy: bright brave sword shouts without sounding deep-adult-man or childish/squeaky, "
                "crisp dodge gasp, quick athletic sprint breaths, sharp impact flinch. Zero English words."
            ),
            "text": "<breath> Hah!! <long pause> Hyah!! <long pause> Toryaaah!! <long pause> <gasp> Whoa-hup!! <long pause> Hff-hah-hff! <long pause> Guh-ahk!!",
        },
        {
            "slug": "v4_hero_knight_14yo_riko",
            "voice": "Riko",
            "instructions": (
                "Studio quality voice acting session. Voice a spirited 14-year-old anime teenage boy knight hero in action. "
                "Clearly male adolescent voice (not childish 8-year-old, not husky grown man, never female): sharp heroic sword efforts, "
                "alert evade yelp, sprint breaths, dramatic hit grunt. Non-verbal sounds only, zero real words."
            ),
            "text": "<breath> Ha!! <long pause> Seyaaah!! <long pause> Hraaaah!! <long pause> <gasp> Hup!! <long pause> Huh-hff-huh! <long pause> Gwah-uhk!!",
        },
    ],
    "mage_14yo": [
        {
            "slug": "v4_hero_mage_14yo_lumi",
            "voice": "Lumi",
            "instructions": (
                "Studio quality voice acting session. Female voice actress playing a bright, spirited 14-year-old teenage anime mage heroine. "
                "Pristine crystal-clear studio voice with confident youthful poise (not toddler-ish, not overly adult), "
                "sparkling spell-cast cries, alert evade gasp, sharp flinch. Non-verbal sounds only, zero English words."
            ),
            "text": "<breath> Pei!! <long pause> Yah!! <long pause> Haaa-yaaah!! <long pause> <gasp> Hup-eah! <long pause> Hff-hah-hff! <long pause> Aiya-khh!!",
        },
        {
            "slug": "v4_hero_mage_14yo_rina",
            "voice": "Rina",
            "instructions": (
                "Studio quality voice acting session. Female voice actress voicing a charming, fiery 14-year-old anime witch adventurer. "
                "Studio-clean youthful feminine timbre: poised playful magic efforts, dramatic burst shout, nimble evade gasp, crisp hurt flinch. "
                "Non-verbal vocals only, zero English words."
            ),
            "text": "<breath> Hah!! <long pause> Shah!! <long pause> Fwoooaaah!! <long pause> <gasp> Eep-hup! <long pause> Hff-hff! <long pause> Owah-khh!!",
        },
    ],
    "pray_14yo": [
        {
            "slug": "v4_hero_knight_14yo_pray",
            "voice": "Riko",
            "instructions": (
                "Studio quality voice acting session. Play the same energetic 14-year-old teenage anime boy hero knight "
                "now pausing in quiet earnest prayer before a sacred monument. Gentle boyish breath, soft sincere hum, "
                "awestruck quiet gasp, warm happy relief sigh. Keep unmistakably 14-year-old male teen timbre, zero words."
            ),
            "text": "<breath> Mmm... <long pause> Ahh... <long pause> <gasp> Ooh! <long pause> <sigh> Hmh-hm...",
        },
        {
            "slug": "v4_hero_mage_14yo_pray",
            "voice": "Lumi",
            "instructions": (
                "Studio quality voice acting session. Play the same bright 14-year-old teenage anime mage girl heroine "
                "in a gentle heartfelt moment of prayer. Soft tender breath, sincere wordless hum, awestruck wonder gasp, "
                "warm happy relieved sigh and sweet soft chuckle. Zero English words."
            ),
            "text": "<breath> Hmmm... <long pause> Ahh... <long pause> <gasp> Waaah... <long pause> <sigh> <chuckle>",
        },
    ],
}


async def run_one(spec: dict) -> dict:
    slug = spec["slug"]
    client = MediaClient()
    res = await client.audio(
        spec["text"],
        str(OUT_DIR),
        "gemini-3.8-flash-tts",
        kind="speech",
        voice=spec["voice"],
        instructions=spec["instructions"],
        response_format="mp3",
    )
    raw = OUT_DIR / f"{slug}_raw.mp3"
    out = OUT_DIR / f"{slug}.mp3"
    if raw.exists():
        raw.unlink()
    shutil.move(str(res["path"]), str(raw))
    met = clean_master_only(raw, out, target_rms_db=-12.0, peak_ceil_db=-1.0)
    shutil.copy2(str(raw), str(WORLD_DIR / raw.name))
    print(f"[DONE] {slug} (voice={spec['voice']}) -> {met['durationSec']}s | rms={met['rmsDb']}dB | medianF0={met['medianF0Hz']}Hz", flush=True)
    return {**spec, "file": out.name, **met}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", required=True)
    args = ap.parse_args()
    specs = BATCHES[args.batch]
    assert len(specs) <= 2
    results = await asyncio.gather(*(run_one(s) for s in specs))
    mp = OUT_DIR / f"hero_v4_{args.batch}.json"
    mp.write_text(json.dumps(results, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
