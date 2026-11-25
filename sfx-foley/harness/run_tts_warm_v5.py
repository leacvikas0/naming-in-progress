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

ROOT = Path("C:/Users/silen/projects/kilo-3d-kit")
OUT_DIR = ROOT / "sfx-foley" / "tts-test"
WORLD_DIR = ROOT / "world" / "assets" / "audio" / "tts-test"
SR = 48000

FILM_WARM_CUE = (
    "Studio quality cinema dubbing session on a warm vintage analog tube ribbon microphone. "
    "Rich, round, full-bodied organic voice with natural chest warmth and smooth velvety highs. "
    "Never thin, never metallic, never harsh or over-bright."
)


def peaking_eq(sig: np.ndarray, f0: float, q: float, gain_db: float, sr: int = SR) -> np.ndarray:
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


def soft_noise_gate(x: np.ndarray, thresh_db: float = -42.0, sr: int = SR) -> np.ndarray:
    """Silences quiet inter-syllable AI codec floor cleanly without pumping upward."""
    att = math.exp(-1.0 / (0.004 * sr))
    rel = math.exp(-1.0 / (0.090 * sr))
    env = np.zeros_like(x)
    cur = 0.0
    ax = np.abs(x)
    for i in range(len(x)):
        v = ax[i]
        cur = att * cur + (1.0 - att) * v if v > cur else rel * cur + (1.0 - rel) * v
        env[i] = cur
    th = 10.0 ** (thresh_db / 20.0)
    g = np.clip((env - th * 0.4) / (th * 1.6), 0.0, 1.0)
    g = g * g * (3.0 - 2.0 * g)
    return x * g


def sample_locked_sub_growl(y: np.ndarray, sub_ratio: float = 0.5, cutoff_hz: float = 210.0) -> np.ndarray:
    """
    Zero-drift sample-locked subharmonic octave-divider chest growl.
    Tracks zero-crossings + exact instantaneous amplitude of `y` so chest weight is
    locked to the exact sample frame (zero phantom echo noise before/after utterances).
    """
    signs = np.sign(y)
    # Count positive-going zero crossings to flip an octave-divider square wave cleanly
    zc = (signs[1:] > 0) & (signs[:-1] <= 0)
    flip = np.ones(len(y), dtype=np.float64)
    state = 1.0
    for i in range(1, len(y)):
        if zc[i - 1]:
            state = -state
        flip[i] = state
    env = np.convolve(np.abs(y), np.ones(int(0.012 * SR)) / (0.012 * SR), mode="same")
    # Also softly synthesize half-frequency sinusoidal component via envelope * flip
    raw_sub = flip * env * 1.45
    # Nonlinear chest saturation strictly inside lowpass band
    lp = signal.sosfiltfilt(signal.butter(3, cutoff_hz, btype="lowpass", fs=SR, output="sos"), raw_sub)
    # Gate strictly above voice floor so silence stays 0.000
    mx = float(np.max(env)) + 1e-9
    gate = np.clip((env / mx - 0.08) * 2.5, 0.0, 1.0)
    return lp * gate


def varispeed_pitch(y: np.ndarray, semitones: float) -> np.ndarray:
    """
    Pure time-domain polyphase tape varispeed (ZERO STFT phase-vocoder metallic AI smear!).
    Naturally shrinks/enlarges creature vocal tract & fundamental pitch cleanly like Pixar/Nintendo SFX.
    """
    if abs(semitones) < 0.05:
        return y
    ratio = 2.0 ** (semitones / 12.0)
    up = 100
    down = max(25, int(round(100.0 * ratio)))
    return signal.resample_poly(y, up, down)


def damped_wood_resonator(x: np.ndarray, modes: list[tuple[float, float, float]]) -> np.ndarray:
    acc = np.zeros_like(x)
    for fc, q, g in modes:
        if fc >= SR * 0.44:
            continue
        w0 = 2.0 * math.pi * fc / SR
        bw = w0 / max(q, 0.5)
        r = math.exp(-0.5 * bw)
        b = [g * (1.0 - r), 0.0, -g * (1.0 - r) * 0.2]
        a = [1.0, -2.0 * r * math.cos(w0), r * r]
        acc += signal.lfilter(b, a, x)
    return acc


def warm_film_polish(wav_in: Path, out_wav: Path, out_mp3: Path, body_freq: float = 215.0, de_crisp_db: float = -3.2, monster_mode: str = "none") -> dict:
    """
    Anti-AI Warm Cinema Polish:
    - Native WAV uncompressed PCM (`24kHz -> 48kHz` polyphase resample)
    - Optional zero-phase-vocoder creature transform (`goblin`, `plant`, `skeleton`, `werewolf`, `black_knight`, `boss`, `golem`)
    - Anti-radio warm body + smooth 9.8 kHz natural cinema LPF (zero 11.7kHz AI buzz)
    """
    x, src_sr = sf.read(str(wav_in))
    x = x.astype(np.float64)
    if x.ndim > 1:
        x = np.mean(x, axis=1)

    if src_sr != SR:
        g = math.gcd(SR, src_sr)
        y = signal.resample_poly(x, SR // g, src_sr // g)
    else:
        y = x.copy()

    y = soft_noise_gate(y, thresh_db=-44.0, sr=SR)

    # Pure analog/physical creature sculptors (zero rubberband STFT smear, zero harsh waveshaping fuzz)
    if monster_mode == "goblin":
        y = varispeed_pitch(y, 4.2)  # crisp miniature gremlin snout without metallic vocoder
        y = peaking_eq(y, 1380.0, 1.4, 2.2, SR)
    elif monster_mode == "plant":
        y = varispeed_pitch(y, 5.8)  # agile Deku leaf sprite
        wood = damped_wood_resonator(y, [(690.0, 11.0, 0.32), (1380.0, 14.0, 0.22)])
        y = y * 0.78 + wood * 0.65
    elif monster_mode == "skeleton":
        y = varispeed_pitch(y, 2.5)
        y = peaking_eq(y, 190.0, 0.8, -4.5, SR)  # trim warm flesh bass without going telephone thin
        bone = damped_wood_resonator(y, [(580.0, 11.0, 0.40), (1190.0, 14.0, 0.42), (2050.0, 12.0, 0.22)])
        # Smooth hardwood rattle impulses (rounded wood resonance, not spiky AI static)
        env = np.convolve(np.abs(y), np.ones(int(0.015 * SR)) / (0.015 * SR), mode="same")
        rng = np.random.default_rng(311)
        clicks = np.zeros_like(y)
        th = float(np.max(env)) * 0.24
        i = 1
        while i < len(env) - 1:
            if env[i] > th and env[i] >= env[i - 1] and env[i] >= env[i + 1]:
                for off in (0, int(0.025 * SR)):
                    k0 = i + off
                    dur = min(int(0.022 * SR), len(y) - k0)
                    if dur > 20:
                        tt = np.arange(dur) / SR
                        f1 = 760.0 + 360.0 * rng.random()
                        f2 = 1520.0 + 480.0 * rng.random()
                        clicks[k0 : k0 + dur] += (np.sin(2 * math.pi * f1 * tt) + 0.6 * np.sin(2 * math.pi * f2 * tt)) * np.exp(-tt * 170.0) * (0.28 if off == 0 else 0.16)
                i += int(0.060 * SR)
            else:
                i += 1
        y = y * 0.55 + bone * 0.72 + clicks
    elif monster_mode == "werewolf":
        main = varispeed_pitch(y, -2.4)
        sub = sample_locked_sub_growl(main, cutoff_hz=230.0)
        main = peaking_eq(main, 900.0, 1.2, -4.2, SR)
        y = main * 0.84 + sub * 0.52
    elif monster_mode == "black_knight":
        y = varispeed_pitch(y, -1.8)
        helm = damped_wood_resonator(y, [(340.0, 14.0, 0.34), (740.0, 16.0, 0.26), (1210.0, 14.0, 0.14)])
        y = signal.sosfiltfilt(signal.butter(2, 2300.0, btype="lowpass", fs=SR, output="sos"), y * 0.65 + helm * 0.62)
    elif monster_mode == "boss":
        main = varispeed_pitch(y, -4.6)
        sub = sample_locked_sub_growl(main, cutoff_hz=195.0)
        y = main * 0.84 + sub * 0.58
    elif monster_mode == "necromancer":
        main = varispeed_pitch(y, -1.8)
        sub = sample_locked_sub_growl(main, cutoff_hz=240.0)
        rev = main[::-1]
        t_ir = np.arange(int(0.24 * SR)) / SR
        rng = np.random.default_rng(612)
        tomb = signal.sosfiltfilt(signal.butter(2, [450.0, 3200.0], btype="bandpass", fs=SR, output="sos"), rng.standard_normal(len(t_ir)) * np.exp(-t_ir * 12.0))
        pre = signal.fftconvolve(rev, tomb, mode="full")[: len(main)][::-1]
        pre = pre / (np.max(np.abs(pre)) + 1e-9) * (np.max(np.abs(main)) * 0.16)
        y = main * 0.82 + sub * 0.34 + pre

    sos_hp = signal.butter(2, 55.0, btype="highpass", fs=SR, output="sos")
    y = signal.sosfiltfilt(sos_hp, y)

    # Smooth 9.8 kHz Bessel-like gentle top rolloff to erase metallic AI vocoder edge
    sos_lp = signal.butter(2, 9800.0, btype="lowpass", fs=SR, output="sos")
    y = signal.sosfiltfilt(sos_lp, y)

    # Anti-radio EQ: balanced body support without mud, relax crispy AI 3-6kHz hash
    y = peaking_eq(y, body_freq, 0.75, 1.0, SR)
    y = peaking_eq(y, 2900.0, 0.95, de_crisp_db * 0.65, SR)
    y = peaking_eq(y, 5800.0, 0.85, de_crisp_db * 1.05, SR)

    # Pure linear makeup to target active RMS (-14.5 dB: rich natural cinema level, zero over-squash)
    act = y[np.abs(y) > 0.015]
    cur_rms = float(np.sqrt(np.mean(act ** 2))) if len(act) else 0.05
    target_rms = 10.0 ** (-14.5 / 20.0)
    gain = min(5.0, target_rms / max(cur_rms, 1e-9))
    y = y * gain

    # Clean lookahead limiter only on momentary transient spikes above -1.2 dBFS
    ceil_lin = 10.0 ** (-1.2 / 20.0)
    abs_p = np.abs(y)
    pk_env = np.copy(abs_p)
    for i in range(len(y) - 2, -1, -1):
        pk_env[i] = max(abs_p[i], pk_env[i + 1] * 0.994)
    cur_p = 0.0
    rel_p = math.exp(-1.0 / (0.050 * SR))
    for i in range(len(y)):
        cur_p = max(pk_env[i], cur_p * rel_p)
        pk_env[i] = cur_p
    y = y * np.where(pk_env > ceil_lin, ceil_lin / np.maximum(pk_env, 1e-9), 1.0)
    mx = float(np.max(np.abs(y)))
    if mx > ceil_lin:
        y = y * (ceil_lin / mx)

    fade = min(int(0.012 * SR), len(y) // 12)
    if fade > 1:
        y[:fade] *= np.linspace(0.0, 1.0, fade)
        y[-fade:] *= np.linspace(1.0, 0.0, fade)

    sf.write(str(out_wav), y.astype(np.float32), SR, subtype="PCM_16")
    # Single-pass 320 kbps CBR MP3 (max quality, zero multi-gen transcode artifacts!)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(out_wav), "-c:a", "libmp3lame", "-b:a", "320k", str(out_mp3)],
        check=True,
    )
    shutil.copy2(str(out_mp3), str(WORLD_DIR / out_mp3.name))

    # Measure 5-band balance
    freqs, _, S = signal.spectrogram(y, fs=SR, nperseg=1024, noverlap=768, mode="magnitude")
    P = np.mean(S ** 2, axis=1)
    tot = np.sum(P) + 1e-12
    bands = {
        lbl: round(float(100.0 * np.sum(P[(freqs >= lo) & (freqs < hi)]) / tot), 1)
        for lo, hi, lbl in [(0, 250, "sub250"), (250, 1000, "mid250_1k"), (1000, 4000, "pres1_4k"), (4000, 8000, "crisp4_8k"), (8000, 16000, "air8_16k")]
    }
    act_f = y[np.abs(y) > 0.015]
    rms_db = 20.0 * math.log10(max(float(np.sqrt(np.mean(act_f ** 2))) if len(act_f) else 1e-9, 1e-9))
    return {"durationSec": round(len(y) / SR, 3), "rmsDb": round(rms_db, 2), **bands}


BATCHES = {
    "heroes1": [
        {
            "slug": "v5_hero_knight_riko",
            "voice": "Riko",
            "body_freq": 195.0,
            "de_crisp_db": -3.2,
            "instructions": (
                f"{FILM_WARM_CUE} Perform committed, heroic 14-year-old male anime knight combat efforts: "
                "focused sword swing grunts, quick dodge breath, energetic rush effort, and genuine hurt flinch. "
                "Dramatic and brave without strained metallic screeching. Zero English words."
            ),
            "text": "<breath> Hah! <long pause> Hyah! <long pause> Hraaah! <long pause> <gasp> Hup! <long pause> Huh-hah! <long pause> Guh-ahk!",
        },
        {
            "slug": "v5_hero_mage_lumi",
            "voice": "Lumi",
            "body_freq": 240.0,
            "de_crisp_db": -3.8,
            "instructions": (
                f"{FILM_WARM_CUE} Perform expressive, natural 14-year-old female anime mage heroine spell efforts: "
                "playful wand cast bursts, heartfelt Starfall surge cry, startled evade gasp, and cute flinch. "
                "Velvety, animated, rich studio voice without shrill harshness or strained screaming. Zero English words."
            ),
            "text": "<breath> Pei! <long pause> Yah! <long pause> Haaa-yah! <long pause> <gasp> Hup-eah! <long pause> Hff-hah! <long pause> Aiya-ah!",
        },
    ],
    "heroes2": [
        {
            "slug": "v5_hero_knight_enzo",
            "voice": "Enzo",
            "body_freq": 190.0,
            "de_crisp_db": -2.2,
            "instructions": (
                f"{FILM_WARM_CUE} Perform brave, spirited 14-year-old male anime adventure hero efforts: "
                "punchy athletic slashes, spinning finisher shout, nimble dodge sound, impact grunt. "
                "Smooth warm vocal tone without strained buzzy peaks. Zero English words."
            ),
            "text": "<breath> Hah! <long pause> Toryah! <long pause> Seyaaah! <long pause> <gasp> Whoa-hup! <long pause> Hff-hah! <long pause> Uwah!",
        },
        {
            "slug": "v5_hero_mage_rina",
            "voice": "Rina",
            "body_freq": 235.0,
            "de_crisp_db": -2.4,
            "instructions": (
                f"{FILM_WARM_CUE} Perform charming, warm 14-year-old female anime mage casts and evades: "
                "poised staff burst, magical surge cry, playful dodge breath, flinch. "
                "Smooth rounded vocal tone without digital sibilance or harsh shrillness. Zero English words."
            ),
            "text": "<breath> Hah! <long pause> Shah! <long pause> Fwoooah! <long pause> <chuckle> Hup! <long pause> <gasp> Eep! <long pause> Owah!",
        },
    ],
    "monsters1": [
        {
            "slug": "v5_enemy_goblin",
            "voice": "Gero",
            "body_freq": 220.0,
            "de_crisp_db": -3.2,
            "monster_mode": "goblin",
            "instructions": (
                f"{FILM_WARM_CUE} Perform playful, goofy cartoon green goblin noises: cheeky snort, mischievous cackles, "
                "wildcard swing effort, and comical bump sound. Smooth rounded creature vocals without strained high screeching. Zero English words."
            ),
            "text": "<gasp> Keh? <long pause> He-he-he! <long pause> Gyah! <long pause> Bwah!",
        },
        {
            "slug": "v5_enemy_plant_sprite",
            "voice": "Arlo",
            "body_freq": 240.0,
            "de_crisp_db": -3.2,
            "monster_mode": "plant",
            "instructions": (
                f"{FILM_WARM_CUE} Perform cute expressive Deku-style tiny forest spirit creature chirps: curious woodland hoot, "
                "bouncy happy hops, crisp puff spit, and gentle wilt droop. Warm natural cartoon timbre without shrill screech. Zero English words."
            ),
            "text": "<gasp> Hoo?! <long pause> Pip-pip-yah! <long pause> Ptoo-wah! <long pause> Mmm-oh...",
        },
    ],
    "monsters2": [
        {
            "slug": "v5_enemy_skeleton",
            "voice": "Charon",
            "body_freq": 250.0,
            "de_crisp_db": -3.0,
            "monster_mode": "skeleton",
            "instructions": (
                f"{FILM_WARM_CUE} Perform playful spooky Halloween cartoon skeleton noises: bony gasp, spooky chuckles, "
                "raspy lunge effort, hollow collapse sigh. Warm smooth organic delivery without harsh static buzz. Zero English words."
            ),
            "text": "<gasp> Khk?! <long pause> Ke-ke-keh! <long pause> Khaah! <long pause> Urrk...",
        },
        {
            "slug": "v5_enemy_werewolf",
            "voice": "Zeno",
            "body_freq": 170.0,
            "de_crisp_db": -3.2,
            "monster_mode": "werewolf",
            "instructions": (
                f"{FILM_WARM_CUE} Perform cartoon feral werewolf cub beast growls: low sniffing rumble, aggressive huff, "
                "fierce lunging bark-roar, sharp impact yelp. Warm rounded animal vocals without harsh clipping. Zero English words."
            ),
            "text": "Grrr?! <long pause> Hff-grr-huff! <long pause> Raaawrr! <long pause> Kyaaw-urgh!",
        },
    ],
    "monsters3": [
        {
            "slug": "v5_enemy_black_knight",
            "voice": "Orus",
            "body_freq": 175.0,
            "de_crisp_db": -3.0,
            "monster_mode": "black_knight",
            "instructions": (
                f"{FILM_WARM_CUE} Perform serious yet toy-scaled armored dark knight grunts: dignified visor snort, heavy shield brace, "
                "firm greatsword effort, stunned impact. Smooth full vocal weight without metallic fuzz. Zero English words."
            ),
            "text": "Hmph! <long pause> Hrrgh! <long pause> Kraaah! <long pause> Urgh!",
        },
        {
            "slug": "v5_enemy_boss_brute",
            "voice": "Alnilam",
            "body_freq": 145.0,
            "de_crisp_db": -3.0,
            "monster_mode": "boss",
            "instructions": (
                f"{FILM_WARM_CUE} Perform monumental cartoon giant ogre boss sounds: arrogant chest-thump huff, heavy stomps, "
                "deep booming ground-slam roar, and dizzy collapse groan. Rich warm cinema weight without static fizz. Zero English words."
            ),
            "text": "Hmph-hrrr! <long pause> Huh-huf! <long pause> Gwooooh! <long pause> Uuurrgh...",
        },
    ],
    "monsters4": [
        {
            "slug": "v5_enemy_necromancer",
            "voice": "Umbriel",
            "body_freq": 180.0,
            "de_crisp_db": -3.0,
            "monster_mode": "necromancer",
            "instructions": (
                f"{FILM_WARM_CUE} Perform theatrical animated dark wizard caster noises: eerie amused cackle, dark magical hum, "
                "snappy cast surge, and surprised villain hiss. Rich warm studio sound without harsh static hiss. Zero English words."
            ),
            "text": "He-he-heh... <long pause> Hmm-mmm... <long pause> Zhaah! <long pause> Gah-tsk!",
        },
        {
            "slug": "v5_hero_knight_enzo_pray",
            "voice": "Enzo",
            "body_freq": 195.0,
            "de_crisp_db": -2.2,
            "instructions": (
                f"{FILM_WARM_CUE} Perform gentle, warm 14-year-old male anime hero breathing in quiet prayer before a shrine: "
                "soft sincere breath, warm wordless prayer hum, wonder gasp, relieved warm chuckle. "
                "Close velvet film mic warmth without breath hiss. Zero English words."
            ),
            "text": "<breath> Mmm... <long pause> Ahh... <long pause> <gasp> Ooh! <long pause> <sigh> Hmh-hm...",
        },
    ],
    "extra_pack_a": [
        {
            "slug": "v5_enemy_werewolf",
            "voice": "Fenrir",
            "body_freq": 170.0,
            "de_crisp_db": -3.0,
            "monster_mode": "werewolf",
            "instructions": (
                f"{FILM_WARM_CUE} Perform clean, punchy cartoon werewolf beast growls and barks (NO sloppy wet mouth-spitting breaths): "
                "alert low growl, aggressive lunge snarl, fierce roar bark, and sharp defeat yelp. Zero English words."
            ),
            "text": "Grrr?! <long pause> Grr-rah! <long pause> Raaaawrr!! <long pause> Gyah-urgh!",
        },
        {
            "slug": "v5_enemy_skeleton_minion",
            "voice": "Gero",
            "body_freq": 270.0,
            "de_crisp_db": -3.0,
            "monster_mode": "skeleton",
            "instructions": (
                f"{FILM_WARM_CUE} Perform playful tiny cartoon skeleton minion chatter: startled bony gasp, goofy fast skull giggle, "
                "scrappy chop cry, and comedic rattle collapse. Smooth warm organic sound without static fizz. Zero English words."
            ),
            "text": "Khk?! <long pause> Ke-ke-ke-keh! <long pause> Kyah! <long pause> Urk-oh...",
        },
    ],
    "extra_pack_b": [
        {
            "slug": "v5_hero_knight_enzo_extra",
            "voice": "Enzo",
            "body_freq": 190.0,
            "de_crisp_db": -2.2,
            "instructions": (
                f"{FILM_WARM_CUE} Perform extra combat exertion variations for the same brave 14-year-old male anime knight: "
                "crisp rising slash, heavy finisher yell, quick shield-raise grunt, second dodge hop, sharp hit gasp, triumphant cheer breath. Zero English words."
            ),
            "text": "<breath> Yah!! <long pause> Hyaaaah!! <long pause> Hmph! <long pause> Hup-yah! <long pause> Gah! <long pause> Haa-hah!!",
        },
        {
            "slug": "v5_hero_mage_lumi_extra",
            "voice": "Lumi",
            "body_freq": 240.0,
            "de_crisp_db": -3.5,
            "instructions": (
                f"{FILM_WARM_CUE} Perform extra spell-casting variations for the same spirited 14-year-old female anime mage witch: "
                "quick ice-lance snap, meteor cast surge, focused charging hum, cute startled step back, sharp flinch, relieved cheer. Zero English words."
            ),
            "text": "<breath> Hah! <long pause> Shaaah! <long pause> Hmmm-yah!! <long pause> Wah-hup! <long pause> Eek! <long pause> Whee-ha!!",
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
        response_format="wav",
    )
    raw_wav = OUT_DIR / f"{slug}_raw.wav"
    out_wav = OUT_DIR / f"{slug}.wav"
    out_mp3 = OUT_DIR / f"{slug}.mp3"
    if raw_wav.exists():
        raw_wav.unlink()
    shutil.move(str(res["path"]), str(raw_wav))
    met = warm_film_polish(raw_wav, out_wav, out_mp3, body_freq=spec["body_freq"], de_crisp_db=spec["de_crisp_db"], monster_mode=spec.get("monster_mode", "none"))
    print(f"[WARM v5] {slug} -> {met['durationSec']}s rms={met['rmsDb']}dB | bands <250:{met['sub250']}% 250-1k:{met['mid250_1k']}% 1-4k:{met['pres1_4k']}% 4-8k:{met['crisp4_8k']}%", flush=True)
    return {**spec, "file": out_mp3.name, **met}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", required=True)
    args = ap.parse_args()
    specs = BATCHES[args.batch]
    assert len(specs) <= 2
    results = await asyncio.gather(*(run_one(s) for s in specs))
    (OUT_DIR / f"warm_v5_{args.batch}.json").write_text(json.dumps(results, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
