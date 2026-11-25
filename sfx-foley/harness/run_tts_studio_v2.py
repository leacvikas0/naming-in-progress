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
OUT_DIR.mkdir(parents=True, exist_ok=True)
WORLD_DIR.mkdir(parents=True, exist_ok=True)
MANIFEST_PATH = OUT_DIR / "audition_v2_manifest.json"

STUDIO_BOOTH = (
    "Pristine 24-bit studio voice-over booth recording on a Neumann U87 condenser microphone "
    "with dead-quiet isolation, warm close proximity, crisp vocal detail, zero room echo."
)


def studio_master_vocal(in_mp3: Path, out_mp3: Path, target_rms_db: float = -13.5, peak_ceil_db: float = -1.2) -> dict:
    """
    Transparent studio broadcast voice mastering:
    - Resample to 48 kHz WAV
    - 80 Hz 4th-order HPF (cuts plosive/stand rumble)
    - Surgical -1.8 dB @ 320 Hz boxiness scoop
    - Smooth +1.8 dB @ 4.8 kHz condenser air presence shelf
    - Soft-knee vocal dynamics leveling (2.2:1) so yells and breaths sit evenly upfront
    - Target active RMS (~ -13.5 dBFS) + smooth true-peak ceiling (-1.2 dBFS)
    """
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        raw_wav = td_path / "raw.wav"
        proc_wav = td_path / "proc.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(in_mp3), "-ar", "48000", "-ac", "1", str(raw_wav)],
            check=True,
        )
        x, sr = sf.read(str(raw_wav))
        x = x.astype(np.float64)

        raw_peak_db = 20.0 * math.log10(max(float(np.max(np.abs(x))), 1e-9))
        act_raw = x[np.abs(x) > 0.015]
        raw_rms_db = 20.0 * math.log10(max(float(np.sqrt(np.mean(act_raw ** 2))) if len(act_raw) else 1e-9, 1e-9))

        # 1. 80 Hz HPF
        sos_hp = signal.butter(4, 80.0, btype="highpass", fs=sr, output="sos")
        y = signal.sosfiltfilt(sos_hp, x)

        # 2. Gentle studio EQ: remove 320 Hz mud, add 4.8 kHz Neumann condenser air
        def peaking_eq(sig, f0, q, gain_db):
            a = 10.0 ** (gain_db / 40.0)
            w0 = 2.0 * math.pi * f0 / sr
            alpha = math.sin(w0) / (2.0 * q)
            b0 = 1.0 + alpha * a
            b1 = -2.0 * math.cos(w0)
            b2 = 1.0 - alpha * a
            a0 = 1.0 + alpha / a
            a1 = -2.0 * math.cos(w0)
            a2 = 1.0 - alpha / a
            return signal.lfilter([b0 / a0, b1 / a0, b2 / a0], [1.0, a1 / a0, a2 / a0], sig)

        y = peaking_eq(y, 320.0, 1.1, -1.8)
        y = peaking_eq(y, 4800.0, 0.75, 1.8)
        y = peaking_eq(y, 175.0, 0.85, 1.1)

        # 3. Two-stage studio vocal dynamics:
        #    Stage A: Smooth RMS leveling (2.6:1 above -22 dB) brings softer efforts up cleanly
        env = np.zeros_like(y)
        att = math.exp(-1.0 / (0.004 * sr))
        rel = math.exp(-1.0 / (0.110 * sr))
        cur = 0.0
        abs_y = np.abs(y)
        for i in range(len(y)):
            v = abs_y[i]
            cur = att * cur + (1.0 - att) * v if v > cur else rel * cur + (1.0 - rel) * v
            env[i] = cur

        thresh = 10.0 ** (-22.0 / 20.0)
        ratio = 2.6
        gain_env = np.ones_like(y)
        over = env > thresh
        gain_env[over] = (thresh * (env[over] / thresh) ** (1.0 / ratio)) / np.maximum(env[over], 1e-9)
        y = y * gain_env

        #    Stage B: Clean fast lookahead limiter (2ms attack, 45ms release) + makeup to target_rms_db
        act = y[np.abs(y) > 0.015]
        cur_rms = float(np.sqrt(np.mean(act ** 2))) if len(act) else 0.05
        target_lin = 10.0 ** (target_rms_db / 20.0)
        y = y * min(6.5, target_lin / max(cur_rms, 1e-9))

        ceil_lin = 10.0 ** (peak_ceil_db / 20.0)
        look = max(1, int(0.002 * sr))
        abs_p = np.abs(y)
        peak_env = np.copy(abs_p)
        # Forward max window approximation via rolling tail + 1-pole decay
        cur_p = 0.0
        rel_p = math.exp(-1.0 / (0.045 * sr))
        for i in range(len(y) - 1, -1, -1):
            peak_env[i] = max(abs_p[i], peak_env[i + 1] * 0.992) if i + 1 < len(y) else abs_p[i]
        for i in range(len(y)):
            cur_p = max(peak_env[i], cur_p * rel_p)
            peak_env[i] = cur_p

        lim_gain = np.where(peak_env > ceil_lin, ceil_lin / np.maximum(peak_env, 1e-9), 1.0)
        y = y * lim_gain
        # Final micro-pass for sub-sample inter-sample peaks
        p_final = float(np.max(np.abs(y)))
        if p_final > ceil_lin:
            y = y * (ceil_lin / p_final)

        # Clean micro fades
        fade_n = min(int(0.012 * sr), len(y) // 10)
        if fade_n > 1:
            y[:fade_n] *= np.linspace(0.0, 1.0, fade_n)
            y[-fade_n:] *= np.linspace(1.0, 0.0, fade_n)

        master_peak_db = 20.0 * math.log10(max(float(np.max(np.abs(y))), 1e-9))
        act_m = y[np.abs(y) > 0.02]
        master_rms_db = 20.0 * math.log10(max(float(np.sqrt(np.mean(act_m ** 2))) if len(act_m) else 1e-9, 1e-9))

        sf.write(str(proc_wav), y.astype(np.float32), sr, subtype="PCM_16")
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(proc_wav), "-c:a", "libmp3lame", "-b:a", "192k", str(out_mp3)],
            check=True,
        )
        return {
            "rawPeakDb": round(raw_peak_db, 2),
            "rawActiveRmsDb": round(raw_rms_db, 2),
            "masterPeakDb": round(master_peak_db, 2),
            "masterActiveRmsDb": round(master_rms_db, 2),
            "durationSec": round(len(y) / sr, 3),
        }


WAVES = {
    "1": [
        {
            "slug": "v2_hero_knight_milo_action",
            "group": "Main Heroes",
            "character": "Chibi Knight (Milo v2 - Studio High Drama)",
            "role_desc": "Full-projection anime kid knight sword slashes, dramatic spin cry, startled evade, sprint, theatrical pain.",
            "voice": "Milo",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Energetic 9-year-old anime chibi boy knight "
                "belting full-voice combat cries from the diaphragm with exaggerated cartoon heroism and panic. "
                "Consistent bright young boy register, high dramatic contrast. Non-verbal battle vocals only, zero English words."
            ),
            "text": (
                "<breath> HYAH!! <long pause> "
                "TORYAAAH!! <long pause> "
                "HAA-YAAAHH!! <long pause> "
                "<gasp> WHOA-HUP!! <long pause> "
                "HAH-HFF-HAH!! <long pause> "
                "GUWAAAH-KHH!!"
            ),
        },
        {
            "slug": "v2_hero_mage_lumi_action",
            "group": "Main Heroes",
            "character": "Chibi Mage (Lumi v2 - Studio High Drama)",
            "role_desc": "Sparkling high-energy anime chibi witch belting spell blasts, dramatic Starfall cry, squeaky dodge, flinch.",
            "voice": "Lumi",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Spirited anime chibi kid witch "
                "projecting loud, sparkling, super-theatrical spell-cast cries and dramatic battle yelps at full energy. "
                "Consistent bright cute high young register. Ultra-expressive non-verbal vocals only, zero English words."
            ),
            "text": (
                "<breath> PEI-YAH!! <long pause> "
                "HAAAH!! <long pause> "
                "KYAAAAHH!! <long pause> "
                "<gasp> EEK-HUP!! <long pause> "
                "HFF-HAH-HFF!! <long pause> "
                "AIYAAA-KHH!!"
            ),
        },
    ],
    "2": [
        {
            "slug": "v2_hero_knight_elio_action",
            "group": "Main Heroes",
            "character": "Chibi Knight Alt (Elio v2 - Heroic Squire Drama)",
            "role_desc": "Fierce, dramatic young hero squire option with explosive lunges and heroic grit.",
            "voice": "Elio",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Brave young anime action-RPG knight belting "
                "fierce, high-stakes combat shouts and dramatic evades at full vocal projection. "
                "Consistent earnest youthful hero tone. Non-verbal shouts only, zero English words."
            ),
            "text": (
                "<breath> HAH!! <long pause> "
                "SEYAAH!! <long pause> "
                "RYAAAAHH!! <long pause> "
                "<gasp> HUP-WAH!! <long pause> "
                "HUH-HAH-HUH!! <long pause> "
                "GWAAAH-UGH!!"
            ),
        },
        {
            "slug": "v2_hero_mage_rina_action",
            "group": "Main Heroes",
            "character": "Chibi Mage Alt (Rina v2 - Mischievous Witch Drama)",
            "role_desc": "Bold playful anime witch alt belting dramatic spells, cheeky cackle evade, theatrical hurt.",
            "voice": "Rina",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Confident, mischievous young anime chibi witch "
                "delivering loud dramatic arcade-game magic cries, playful giggles, and panicked dodges at full voice. "
                "Consistent bright youthful voice. Non-verbal vocals only, zero real words."
            ),
            "text": (
                "<breath> YAH!! <long pause> "
                "SHAAAH!! <long pause> "
                "FWOOOAAAHH!! <long pause> "
                "<chuckle> WHEE-HUP!! <long pause> "
                "<gasp> KYA-EEP!! <long pause> "
                "OWAAAH-KHH!!"
            ),
        },
    ],
    "3": [
        {
            "slug": "v2_enemy_goblin_gero",
            "group": "Goblins & Pack",
            "character": "Green Goblin Raider (Gero v2 - Unhinged Gremlin)",
            "role_desc": "Over-the-top mischievous green goblin: manic notice, crazy chasing cackles, wild screech chop, slapstick KO.",
            "voice": "Gero",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Wild, theatrical cartoon chibi green goblin boss-of-mischief "
                "belting unhinged animated creature vocals at full volume: greedy startled snort, manic chasing cackle, "
                "feral screeching chop, and hilarious dramatic defeat cry. Non-verbal vocals only, zero words."
            ),
            "text": (
                "<gasp> KEH-KEH?! <long pause> "
                "GYE-HEH-HEH-HEH!! <long pause> "
                "GYAAAAHHH!! <long pause> "
                "GUWAAAH-BLEH!!"
            ),
        },
        {
            "slug": "v2_enemy_wolf_zeno",
            "group": "Goblins & Pack",
            "character": "Werewolf / Pack Hunter (Zeno v2 - Feral Comic Beast)",
            "role_desc": "Loud snarling cartoon beast for red-shirt chibi Wolf & pack ambushes: deep snarl, chasing growls, pounce roar, yelp.",
            "voice": "Zeno",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Fierce yet stylized cartoon goblin-wolf creature "
                "projecting dramatic creature snarls, aggressive lunging snaps, and theatrical impact yelps at full power. "
                "Pure animal vocalizations only, NEVER speak any readable English words."
            ),
            "text": (
                "GRRRR-AH?! <long pause> "
                "HFF-GRR-HUFF!! <long pause> "
                "RAAAAWWWRR!! <long pause> "
                "KYAAAW-URGH!!"
            ),
        },
    ],
    "4": [
        {
            "slug": "v2_enemy_plant_arlo",
            "group": "Goblins & Pack",
            "character": "Leaf-Hood Forest Sprite (Arlo v2 - Deku Gremlin)",
            "role_desc": "Super expressive forest sprout sprite: startled hoot, hyper bouncing battle hops, big spit-dart blast, dramatic wilt.",
            "voice": "Arlo",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Hyper-expressive, mischievous Deku-style woodland sprite "
                "projecting loud playful cartoon creature hoots, excited hopping battle chirps, forceful puff attacks, "
                "and melodramatic pathetic defeat squeak. Wordless creature vocals only, zero English words."
            ),
            "text": (
                "<gasp> HOO-HOO?! <long pause> "
                "PIP-PIP-YAH!! <long pause> "
                "PTOO-WAAAH!! <long pause> "
                "MEEEW-OHHH..."
            ),
        },
        {
            "slug": "v2_enemy_skeleton_charon",
            "group": "Goblins & Pack",
            "character": "Skeleton Legion (Charon v2 - Dramatic Halloween Undead)",
            "role_desc": "Spooky comic cartoon skeleton belting hollow battle hisses, manic cackles, big axe roar, bone-clatter groan.",
            "voice": "Charon",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Theatrical spooky Halloween cartoon skeleton warrior "
                "projecting bold raspy undead gasps, wicked chattering laughter, fierce skeletal battle screams, "
                "and melodramatic crumbling groans at full booth projection. Zero English words."
            ),
            "text": (
                "<gasp> KHK-HAA?! <long pause> "
                "KE-KE-KE-KEH!! <long pause> "
                "KHAAAAAHH!! <long pause> "
                "UUURRRK-KHHH!!"
            ),
        },
    ],
    "5": [
        {
            "slug": "v2_enemy_necromage_umbriel",
            "group": "Elites & Bosses",
            "character": "Skeleton Mage / Necromancer (Umbriel v2 - Theatrical Dark Caster)",
            "role_desc": "Loud smug comic dark wizard: sinister evil cackle, surging ritual resonance, explosive cast shriek, thwarted villain yell.",
            "voice": "Umbriel",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Over-the-top theatrical anime dark wizard boss "
                "performing wicked booming villain cackles, intense humming spell buildup, piercing blast shouts, "
                "and outraged comedic stagger gasps. Wordless dramatic vocals only, zero English words."
            ),
            "text": (
                "NYEH-HEH-HEH-HAA!! <long pause> "
                "HMMM-RAAAH... <long pause> "
                "ZSHAAAAHH!! <long pause> "
                "GAH-KHH-TSK!!"
            ),
        },
        {
            "slug": "v2_enemy_boss_alnilam",
            "group": "Elites & Bosses",
            "character": "Heavy Brute / Golem Boss (Alnilam v2 - Earthshaker Giant)",
            "role_desc": "Monumental cartoon brute boss flexing, heavy roaring charge, seismic slam bellow, staggered giant groan.",
            "voice": "Alnilam",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Towering cartoon ogre brute boss belting "
                "massive chest-thumping flex huffs, booming stomping charge grunts, earth-shaking ground-slam roar, "
                "and dramatic dizzy giant collapse groan. Wordless monster roars only, zero English words."
            ),
            "text": (
                "HMPH-GRRAAH!! <long pause> "
                "HUF! HAH! HRRAAH!! <long pause> "
                "GWOOOOOAAAHH!! <long pause> "
                "UUUURRRGGGHH!!"
            ),
        },
    ],
    "6": [
        {
            "slug": "v2_enemy_wolf_zeno",
            "group": "Goblins & Pack",
            "character": "Werewolf / Pack Hunter (Zeno v2 - Feral Comic Beast)",
            "role_desc": "Loud snarling cartoon beast for red-shirt chibi Wolf & pack ambushes: deep snarl, chasing growls, pounce roar, yelp.",
            "voice": "Zeno",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Fierce yet stylized cartoon goblin-wolf creature "
                "projecting dramatic creature snarls, aggressive lunging snaps, and theatrical impact yelps at full power. "
                "Pure animal vocalizations only, NEVER speak any readable English words."
            ),
            "text": (
                "GRRRR-AH?! <long pause> "
                "HFF-GRR-HUFF!! <long pause> "
                "RAAAAWWWRR!! <long pause> "
                "KYAAAW-URGH!!"
            ),
        },
        {
            "slug": "v2_enemy_black_knight_orus",
            "group": "Elites & Bosses",
            "character": "Armored Black Knight Elite (Orus v2 - Iron Plate Commander)",
            "role_desc": "Dramatic full-projection chibi dark knight: proud helmet snort, heavy shield ram, fierce cleave shout, clang stagger.",
            "voice": "Orus",
            "instructions": (
                f"{STUDIO_BOOTH} Acting direction: Dramatic theatrical cartoon dark knight speaking inside an iron bucket helm. "
                "Full booth projection: arrogant helmet huff, heavy shield-bash exertion, piercing war cleave, "
                "and stunned groan. Short wordless shouts only, zero English words."
            ),
            "text": (
                "HMPH-HMM?! <long pause> "
                "HRRAAAH!! <long pause> "
                "KRAAAAHH!! <long pause> "
                "UURRGH-KHH!!"
            ),
        },
    ],
}


async def run_one(spec: dict) -> dict:
    slug = spec["slug"]
    voice = spec["voice"]
    print(f"[START] {slug} (voice={voice})...", flush=True)
    client = MediaClient()
    res = await client.audio(
        spec["text"],
        str(OUT_DIR),
        "gemini-3.8-flash-tts",
        kind="speech",
        voice=voice,
        instructions=spec["instructions"],
        response_format="mp3",
    )
    src = Path(res["path"])
    raw_copy = OUT_DIR / f"{slug}_raw.mp3"
    mastered = OUT_DIR / f"{slug}.mp3"
    if raw_copy.exists():
        raw_copy.unlink()
    shutil.move(str(src), str(raw_copy))

    met = studio_master_vocal(raw_copy, mastered, target_rms_db=-11.2, peak_ceil_db=-1.0)
    shutil.copy2(str(mastered), str(WORLD_DIR / mastered.name))
    shutil.copy2(str(raw_copy), str(WORLD_DIR / raw_copy.name))

    entry = {
        **spec,
        "file": mastered.name,
        "rawFile": raw_copy.name,
        "duration_seconds": met["durationSec"],
        "metrics": met,
    }
    print(
        f"[DONE] {slug}: {met['durationSec']}s | rawRMS={met['rawActiveRmsDb']}dB -> studioRMS={met['masterActiveRmsDb']}dB (peak {met['masterPeakDb']}dB)",
        flush=True,
    )
    return entry


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wave", required=True)
    args = parser.parse_args()
    specs = WAVES[args.wave]
    assert len(specs) <= 2, "Strict <= 2 concurrent TTS requests per wave!"
    results = await asyncio.gather(*(run_one(s) for s in specs))

    existing = {}
    if MANIFEST_PATH.exists():
        try:
            for item in json.loads(MANIFEST_PATH.read_text(encoding="utf-8")):
                existing[item["slug"]] = item
        except Exception:
            existing = {}
    for item in results:
        existing[item["slug"]] = item
    merged = list(existing.values())
    MANIFEST_PATH.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    shutil.copy2(str(MANIFEST_PATH), str(WORLD_DIR / MANIFEST_PATH.name))
    print(f"[STUDIO V2 WAVE {args.wave}] complete!", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
