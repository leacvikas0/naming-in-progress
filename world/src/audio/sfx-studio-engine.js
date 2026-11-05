// ============================================================================
// world/src/audio/sfx-studio-engine.js
//
// Hybrid Real-Foley + Musical Sub-Bass & Spatial Impulse Audio Director.
// Combines real recorded foley samples (Openverse/Freesound CC0 & CC-BY +
// local studio impacts) with analog WaveShaper saturation, StereoPanner
// trajectories, distance-based speed-of-sound / air-absorption physics,
// and an outdoor valley ConvolverNode impulse response.
// ============================================================================

export const FOLEY_MANIFEST = {
  // Real recorded foley from Openverse/Freesound
  'sword-whoosh': 'sfx/foley/sword-whoosh.mp3',
  'sword-clash': 'sfx/foley/sword-clash.mp3',
  'flesh-armor-hit': 'sfx/foley/flesh-armor-hit.mp3',
  'fire-whoosh': 'sfx/foley/fire-whoosh.mp3',
  'vine-whip': 'sfx/foley/vine-whip.mp3',
  'wood-creak': 'sfx/foley/wood-creak.mp3',
  'foliage-rustle': 'sfx/foley/foliage-rustle.mp3',
  'earth-thud': 'sfx/foley/earth-thud.mp3',
  'deep-rumble': 'sfx/foley/deep-rumble.mp3',
  'singing-bowl': 'sfx/foley/singing-bowl.mp3',
  'heartbeat': 'sfx/foley/heartbeat.mp3',
  'wind-gust': 'sfx/foley/wind-gust.mp3',
  'meteor-crash': 'sfx/foley/meteor-crash.mp3',
  'ice-crack': 'sfx/foley/ice-crack.mp3',
  'petals-flutter': 'sfx/foley/petals-flutter.mp3',
  'cello-harmonic': 'sfx/foley/cello-harmonic.mp3',
  'whip-crack': 'sfx/foley/whip-crack.mp3',
  // Existing studio transient & bass layers
  'whoosh-cinematic': 'sfx/whoosh-cinematic.mp3',
  'whoosh-short': 'sfx/whoosh-short.mp3',
  'whoosh': 'sfx/whoosh.mp3',
  'impact-bass-1': 'sfx/impact-bass-1.mp3',
  'impact-bass-2': 'sfx/impact-bass-2.mp3',
  'riser': 'sfx/riser.mp3',
  'chime': 'sfx/chime.mp3',
  'sparkle': 'sfx/sparkle.mp3',
};

function makeWarmSaturationCurve(drive = 1.8) {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

function buildValleyImpulseResponse(ctx, duration = 2.1, decay = 2.8) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    // Early canyon/stone plaza reflections (12ms, 26ms, 47ms, 78ms)
    const earlyTaps = ch === 0 ? [0.012, 0.029, 0.051, 0.084] : [0.015, 0.033, 0.058, 0.091];
    earlyTaps.forEach((tap, idx) => {
      const i = Math.floor(tap * sr);
      if (i < len) data[i] = (0.35 - idx * 0.06) * (idx % 2 === 0 ? 1 : -1);
    });
    // Smooth LP-filtered diffuse valley tail
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decay) * Math.min(1, i / (sr * 0.018));
      const white = Math.random() * 2 - 1;
      lp = lp * 0.78 + white * 0.22;
      data[i] += lp * env * 0.38;
    }
  }
  return buf;
}

export function createStudioAudioDirector({ basePath = './audio' } = {}) {
  let ctx = null;
  let masterBus = null;
  let compressor = null;
  let reverbNode = null;
  let reverbReturn = null;
  let warmCurve = null;
  const buffers = new Map();
  let activeNodes = [];
  let loadingPromise = null;

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
    warmCurve = makeWarmSaturationCurve(1.65);

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 12;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;

    masterBus = ctx.createGain();
    masterBus.gain.value = 0.92;

    reverbNode = ctx.createConvolver();
    reverbNode.buffer = buildValleyImpulseResponse(ctx, 2.2, 2.6);
    reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.34;

    masterBus.connect(compressor);
    reverbNode.connect(reverbReturn);
    reverbReturn.connect(compressor);
    compressor.connect(ctx.destination);
    return ctx;
  }

  async function preloadAll(onProgress) {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      const audio = ensureContext();
      const entries = Object.entries(FOLEY_MANIFEST);
      let loaded = 0;
      await Promise.all(
        entries.map(async ([key, relPath]) => {
          try {
            const res = await fetch(`${basePath}/${relPath}`);
            if (!res.ok) return;
            const arr = await res.arrayBuffer();
            const decoded = await audio.decodeAudioData(arr);
            buffers.set(key, decoded);
          } catch {
            // Optional fallback sample may not exist
          } finally {
            loaded++;
            onProgress?.(loaded, entries.length, key);
          }
        })
      );
      return buffers.size;
    })();
    return loadingPromise;
  }

  function stopAllActive() {
    for (const n of activeNodes) {
      try {
        n.stop(0);
      } catch {
        // ignore
      }
    }
    activeNodes = [];
  }

  /**
   * Plays a real recorded foley sample with pitch/formant control, offset/trim,
   * dynamic filter envelope, stereo panning, analog saturation, and valley reverb send.
   */
  function playSample(
    key,
    {
      delay = 0,
      offset = 0,
      duration = null,
      rate = 1.0,
      rateEnd = null,
      gain = 0.7,
      attack = 0.006,
      release = 0.12,
      filterType = 'lowpass',
      freqStart = 18000,
      freqEnd = null,
      q = 0.9,
      pan = 0,
      panEnd = null,
      reverbSend = 0.18,
      saturate = false,
    } = {}
  ) {
    const audio = ensureContext();
    const buf = buffers.get(key);
    if (!buf) return;

    const t0 = audio.currentTime + Math.max(0, delay);
    const maxDur = Math.max(0.05, (buf.duration - offset) / Math.max(0.25, rate));
    const playDur = duration ? Math.min(duration, maxDur) : maxDur;

    const src = audio.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate, t0);
    if (rateEnd !== null && rateEnd !== rate) {
      src.playbackRate.exponentialRampToValueAtTime(Math.max(0.15, rateEnd), t0 + playDur);
    }

    const filter = audio.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, t0);
    filter.frequency.setValueAtTime(Math.max(30, freqStart), t0);
    if (freqEnd !== null && freqEnd !== freqStart) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + playDur);
    }

    const panner = audio.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t0);
    if (panEnd !== null && panEnd !== pan) {
      panner.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, panEnd)), t0 + playDur);
    }

    const env = audio.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + Math.min(attack, playDur * 0.35));
    const relStart = Math.max(t0 + attack, t0 + playDur - release);
    env.gain.setValueAtTime(gain, relStart);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + playDur);

    let chain = src;
    if (saturate && warmCurve) {
      const shaper = audio.createWaveShaper();
      shaper.curve = warmCurve;
      shaper.oversample = '2x';
      chain.connect(shaper);
      chain = shaper;
    }
    chain.connect(filter);
    filter.connect(panner);
    panner.connect(env);
    env.connect(masterBus);

    if (reverbSend > 0.01 && reverbNode) {
      const send = audio.createGain();
      send.gain.value = reverbSend;
      env.connect(send);
      send.connect(reverbNode);
    }

    src.start(t0, offset, duration ? duration * Math.max(rate, rateEnd || rate) + 0.05 : undefined);
    src.stop(t0 + playDur + 0.03);
    activeNodes.push(src);
  }

  /**
   * Physical cinema subwoofer membrane thump (42-72Hz with soft-clipped harmonic body,
   * never an audible high-pitched synth beep).
   */
  function playSubMembrane({
    delay = 0,
    freqStart = 82,
    freqEnd = 36,
    duration = 0.38,
    gain = 0.55,
    pan = 0,
  } = {}) {
    const audio = ensureContext();
    const t0 = audio.currentTime + Math.max(0, delay);
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), t0 + duration);

    const lp = audio.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(115, t0);

    const shaper = audio.createWaveShaper();
    shaper.curve = warmCurve;

    const panner = audio.createStereoPanner();
    panner.pan.setValueAtTime(pan, t0);

    const env = audio.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(shaper);
    shaper.connect(lp);
    lp.connect(panner);
    panner.connect(env);
    env.connect(masterBus);

    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
    activeNodes.push(osc);
  }

  // ==========================================================================
  // SCENE 1: BRIAR OPTION 09 (BLESSING & UNDERGROUND RESURRECTION)
  // Beat markers in `clip-blessing-resurrection.webm`:
  //   0.05s: Prayer Channel (0.35x wind, creeping roots)
  //   1.20s: Beat 1A — Roots Creeping & Lacing
  //   2.85s: Beat 1B — Fast Briar Whip & Chestnut Bower Lock!
  //   3.76s: Beat 2  — Downward Wrench & Deep Underground Plunge (-3.05m)!
  //   4.45s: Beat 3  — Subterranean Flower Slump & Smooth HP Fill
  //   6.38s: Beat 4  — Side-by-Side Pop-Up & 64-Petal Scatter!
  // ==========================================================================
  function triggerBriarCue(beatId, optionNum = 1) {
    // 5 Distinct Sound Direction Styles for Briar Option 09:
    // Option 1: Witcher 3 Iris Manor — Heavy Gnarled Chestnut Bark, Whip Snaps & Deep Earth Tomb
    // Option 2: Sacred Botanical Cathedral — Warm Tibetan Singing Bowl, Woody Roots & Subterranean Heartbeat
    // Option 3: Visceral Thicket — Crisp Whip-Crack Lattice, Heavy Soil Submerge & Lush Cello Bloom
    // Option 4: Dark Eclipse Ritual — Tectonic Rumble, Snapping Briars & Resonant Bell Awakening
    // Option 5: Pure Organic Foley — Intimate Close-Mic Wood Creaks, Thick Foliage & Soft Petal Burst
    const opt = Number(optionNum) || 1;

    if (beatId === 'prayer_start') {
      playSample('wind-gust', { offset: 0.4, duration: 1.3, rate: 0.72, gain: 0.32, freqStart: 1200, reverbSend: 0.35 });
      playSample('wood-creak', { offset: 0.1, duration: 1.1, rate: 0.78, gain: 0.38, freqStart: 1800, pan: -0.25 });
      if (opt === 2 || opt === 4) {
        playSample('singing-bowl', { offset: 0.1, duration: 1.4, rate: opt === 2 ? 0.65 : 0.52, gain: 0.25, reverbSend: 0.5 });
      }
    } else if (beatId === 'root_creep') {
      // Staggered woody roots creeping across cobblestones
      playSample('wood-creak', { offset: 0.05, duration: 1.5, rate: 0.85, rateEnd: 1.08, gain: 0.62, pan: -0.35, saturate: true });
      playSample('wood-creak', { delay: 0.32, offset: 0.4, duration: 1.3, rate: 0.68, rateEnd: 0.92, gain: 0.58, pan: 0.35, saturate: true });
      playSample('foliage-rustle', { delay: 0.15, offset: 0.2, duration: 1.4, rate: 0.88, gain: 0.48, freqStart: 2800 });
      if (opt === 4) {
        playSample('deep-rumble', { offset: 0.2, duration: 1.5, rate: 0.85, gain: 0.45, freqStart: 420 });
      }
    } else if (beatId === 'briar_whip_lock') {
      // Fast Briar Whip & Interlocking Chestnut Lattice!
      const whipCount = opt === 3 ? 5 : 4;
      for (let i = 0; i < whipCount; i++) {
        const d = i * 0.11;
        const p = (i % 2 === 0 ? -0.55 : 0.55) * (1 - i * 0.12);
        playSample('vine-whip', { delay: d, rate: 0.78 + i * 0.12, gain: 0.72, pan: p, saturate: true, reverbSend: 0.22 });
        if (opt === 3 && buffers.has('whip-crack')) {
          playSample('whip-crack', { delay: d + 0.04, rate: 0.85 + i * 0.08, gain: 0.44, pan: -p, freqStart: 3600 });
        }
      }
      playSample('whoosh-cinematic', { delay: 0.05, offset: 0.1, duration: 0.85, rate: 1.15, gain: 0.65, saturate: true });
      playSample('foliage-rustle', { delay: 0.08, offset: 0.1, duration: 0.9, rate: 1.18, gain: 0.68, saturate: true });
      playSample('wood-creak', { delay: 0.22, offset: 0.6, duration: 0.75, rate: 0.62, gain: 0.75, freqStart: 1400, saturate: true });
      playSample('impact-bass-1', { delay: 0.38, rate: opt === 1 ? 0.82 : 0.95, gain: 0.78, saturate: true });
      playSubMembrane({ delay: 0.38, freqStart: 76, freqEnd: 34, duration: 0.48, gain: 0.68 });
    } else if (beatId === 'earth_plunge') {
      // Beat 2: Downward Wrench & -3.05m Underground Submerge!
      playSample('whoosh-cinematic', { offset: 0.15, duration: 0.62, rate: 0.92, rateEnd: 0.48, gain: 0.82, freqStart: 2200, freqEnd: 240, saturate: true });
      playSample('earth-thud', { delay: 0.14, offset: 0.02, duration: 0.85, rate: opt === 1 ? 0.76 : 0.88, gain: 0.92, freqStart: 950, freqEnd: 160, saturate: true, reverbSend: 0.28 });
      playSample('meteor-crash', { delay: 0.16, offset: 0.05, duration: 0.65, rate: 0.58, gain: 0.56, freqStart: 780, freqEnd: 180 });
      playSample('impact-bass-2', { delay: 0.18, rate: 0.75, gain: 0.88, saturate: true });
      playSubMembrane({ delay: 0.15, freqStart: 88, freqEnd: 28, duration: 0.62, gain: 0.85 });
    } else if (beatId === 'underground_heal') {
      // Beat 3: Subterranean Quiet Slump & Smooth HP Fill (Muffled underwater/earth warmth + heartbeat/harmonic)
      playSample('deep-rumble', { offset: 0.1, duration: 1.75, rate: 0.68, gain: 0.42, freqStart: 240, reverbSend: 0.4 });
      if (opt === 1 || opt === 2 || opt === 3) {
        // Double muffled subterranean heartbeat
        playSample('heartbeat', { delay: 0.10, rate: 0.85, gain: 0.75, freqStart: 320 });
        playSample('heartbeat', { delay: 0.78, rate: 0.92, gain: 0.82, freqStart: 380 });
        playSubMembrane({ delay: 0.12, freqStart: 58, freqEnd: 34, duration: 0.28, gain: 0.52 });
        playSubMembrane({ delay: 0.80, freqStart: 62, freqEnd: 36, duration: 0.28, gain: 0.58 });
      }
      if (opt === 2 || opt === 4) {
        playSample('singing-bowl', { delay: 0.08, offset: 0.2, duration: 1.8, rate: opt === 2 ? 0.74 : 0.58, gain: 0.48, freqStart: 680, freqEnd: 1600, reverbSend: 0.55 });
      } else if (opt === 3 && buffers.has('cello-harmonic')) {
        playSample('cello-harmonic', { delay: 0.05, offset: 0.1, duration: 1.8, rate: 0.72, rateEnd: 0.96, gain: 0.55, freqStart: 540, freqEnd: 1800, reverbSend: 0.50 });
      } else {
        playSample('riser', { offset: 6.8, duration: 1.75, rate: 0.82, gain: 0.42, freqStart: 360, freqEnd: 1900, reverbSend: 0.45 });
      }
    } else if (beatId === 'pop_up_emerge') {
      // Beat 4: Side-by-Side Pop-Up & 64-Petal Scatter!
      playSample('earth-thud', { offset: 0.02, duration: 0.45, rate: 1.18, gain: 0.68, freqStart: 2400 });
      playSample('whoosh-short', { rate: 1.12, gain: 0.72, reverbSend: 0.3 });
      playSample('foliage-rustle', { offset: 0.1, duration: 0.85, rate: 1.32, gain: 0.74, freqStart: 4800, reverbSend: 0.35 });
      if (buffers.has('petals-flutter')) {
        playSample('petals-flutter', { offset: 0.05, duration: 0.85, rate: 1.15, gain: 0.65, pan: -0.3, panEnd: 0.4, reverbSend: 0.35 });
      }
      if (opt === 2 || opt === 4) {
        playSample('chime', { rate: opt === 2 ? 0.88 : 0.74, gain: 0.52, freqStart: 3400, reverbSend: 0.55 });
      } else if (opt === 3) {
        playSample('sparkle', { rate: 0.82, gain: 0.45, freqStart: 3200, reverbSend: 0.48 });
      }
      playSubMembrane({ freqStart: 74, freqEnd: 40, duration: 0.35, gain: 0.62 });
    }
  }

  // ==========================================================================
  // SCENE 2: DIVINE SMITE (0.0x DEAD-WIND SILENCE DROP & LEFT->RIGHT WIND PETAL EROSION)
  // Beat markers in `clip-smite-dissolve.webm`:
  //   0.05s: Prayer Channel
  //   0.90s: Vacuum Dead-Wind Drop (0.0x wind freeze + B&W monochrome snap)
  //   1.12s: Left-to-Right Wind Gust Onset (Pan -0.90 -> +0.20) + Body Erosion
  //   1.85s: Peak Rightward Petal Sweep & Disappearance (Pan -0.10 -> +0.95)
  // ==========================================================================
  function triggerSmiteCue(beatId, optionNum = 1) {
    // Option 1: Ghost of Tsushima Gale — Deep Vacuum Drop + Howling Stereo Wind + Crisp Dry Petal Rush
    // Option 2: Clair Obscur Elegy — Mournful Bowed Cello Harmonic + Velvet Wind Sweep (Left -> Right)
    // Option 3: Cold Obsidian Verdict — Low Temple Bell Toll + Razor-Sharp Freezing Wind Gust
    // Option 4: Breathless Heart-Stop — Last Muffled Heartbeat + Sudden Silence + Whispering Petal Drift
    // Option 5: Storm-Torn Rose — Heavy Sub-Bass Implosion + Whip-Snap Gust + Cascading Foliage Flutter
    const opt = Number(optionNum) || 1;

    if (beatId === 'smite_channel') {
      playSample('wind-gust', { offset: 0.2, duration: 0.82, rate: 0.78, gain: 0.34, freqStart: 1400 });
    } else if (beatId === 'vacuum_drop') {
      // Sudden dead-wind vacuum drop at 0.90s!
      stopAllActive();
      playSample('impact-bass-2', { rate: 0.68, duration: 0.55, gain: 0.88, freqStart: 420, freqEnd: 45, saturate: true });
      playSubMembrane({ freqStart: 92, freqEnd: 24, duration: 0.55, gain: 0.88 });
      if (opt === 3) {
        playSample('singing-bowl', { offset: 0.02, duration: 2.2, rate: 0.48, gain: 0.58, freqStart: 900, reverbSend: 0.6 });
      } else if (opt === 4) {
        playSample('heartbeat', { rate: 0.72, gain: 0.85, freqStart: 280 });
      } else if (opt === 2 && buffers.has('cello-harmonic')) {
        playSample('cello-harmonic', { offset: 0.05, duration: 2.4, rate: 0.64, rateEnd: 0.58, gain: 0.62, pan: -0.3, panEnd: 0.5, reverbSend: 0.55 });
      }
    } else if (beatId === 'wind_petal_sweep_1') {
      // Left-to-Right Wind Gust Onset (sweeping from Left -0.90 to Center/Right +0.35)
      playSample('wind-gust', {
        offset: 0.3,
        duration: 1.9,
        rate: opt === 3 ? 1.18 : 0.94,
        rateEnd: 1.28,
        gain: 0.85,
        attack: 0.08,
        freqStart: 620,
        freqEnd: 4200,
        pan: -0.92,
        panEnd: 0.45,
        reverbSend: 0.32,
        saturate: true,
      });
      playSample('whoosh-cinematic', {
        offset: 0.05,
        duration: 1.2,
        rate: 0.78,
        rateEnd: 1.15,
        gain: 0.68,
        pan: -0.88,
        panEnd: 0.25,
        reverbSend: 0.25,
      });
      playSample('foliage-rustle', {
        delay: 0.08,
        offset: 0.15,
        duration: 1.5,
        rate: 1.22,
        rateEnd: 1.48,
        gain: 0.72,
        freqStart: 3800,
        pan: -0.85,
        panEnd: 0.55,
        reverbSend: 0.28,
      });
      if (buffers.has('petals-flutter')) {
        playSample('petals-flutter', {
          delay: 0.12,
          offset: 0.05,
          duration: 1.4,
          rate: 1.15,
          rateEnd: 1.42,
          gain: 0.68,
          pan: -0.80,
          panEnd: 0.60,
          reverbSend: 0.30,
        });
      }
      if (opt === 5) {
        playSample('vine-whip', { delay: 0.05, rate: 0.72, gain: 0.64, pan: -0.75 });
      }
    } else if (beatId === 'wind_petal_sweep_2') {
      // Peak Rightward Acceleration & Subtle Vanishing into the Right Horizon (Pan 0.0 -> +0.98, fading highs)
      playSample('wind-gust', {
        offset: 1.2,
        duration: 1.6,
        rate: 1.25,
        rateEnd: 0.82,
        gain: 0.64,
        attack: 0.05,
        release: 0.65,
        freqStart: 3600,
        freqEnd: 480,
        pan: 0.10,
        panEnd: 0.98,
        reverbSend: 0.48,
      });
      playSample('foliage-rustle', {
        offset: 0.6,
        duration: 1.35,
        rate: 1.45,
        rateEnd: 0.95,
        gain: 0.54,
        release: 0.55,
        freqStart: 4200,
        freqEnd: 620,
        pan: 0.25,
        panEnd: 0.98,
        reverbSend: 0.45,
      });
    }
  }

  // ==========================================================================
  // SCENE 3: KNIGHT 4-HIT SWORD COMBO + ELEMENTAL FINISHER
  // Beat markers in `01-knight-sword-combos.webm`:
  //   0.38s: Hit 1 — Horizontal Sunfire Slice
  //   1.20s: Hit 2 — Diagonal Rising Slash
  //   2.02s: Hit 3 — Overhead Cleave
  //   2.84s: Hit 4 — Jump Slam Finisher
  //   3.68s: Heavy 360° Glacial Spin Finisher
  // ==========================================================================
  function triggerKnightComboCue(hitIndex, optionNum = 1) {
    // Option 1: Heavy Steel & Bone Crunch (Dark Souls / Witcher 3 Physical Weight)
    // Option 2: Hinokami Sunfire & Glacial Breath (Ufotable Flame/Ice Whoosh + Crisp Blade)
    // Option 3: Harmonic Katana Resonance (Ghost of Tsushima Singing Steel + Deep Taiko Sub)
    // Option 4: Brutal Greatsword Cleave (Low-Pitched Heavy Iron + Armor Shatter)
    // Option 5: Crisp Duelist Parry & Slice (Fast High-Transient Air Cut + Tight Sub Punch)
    const opt = Number(optionNum) || 1;
    const h = Number(hitIndex) || 1;
    // Musical pitch escalation across hits 1 -> 2 -> 3 -> 4 -> 5
    const pitchStep = [1.0, 0.94, 1.04, 1.14, 0.86, 0.78][h] || 1.0;
    const panPos = h % 2 === 1 ? -0.22 : 0.22;

    if (h <= 3) {
      // Air cut whoosh + physical steel/armor contact 65ms later
      playSample('sword-whoosh', {
        rate: (opt === 4 ? 0.78 : opt === 5 ? 1.18 : 0.96) * pitchStep,
        gain: 0.78,
        pan: panPos,
        saturate: true,
        reverbSend: 0.16,
      });
      playSample('flesh-armor-hit', {
        delay: 0.055,
        rate: (opt === 4 ? 0.76 : 0.95) * pitchStep,
        gain: 0.82,
        pan: panPos * 0.5,
        saturate: true,
        reverbSend: 0.18,
      });
      if (opt === 1 || opt === 3 || opt === 5) {
        playSample('sword-clash', {
          delay: 0.06,
          rate: (opt === 3 ? 1.12 : 0.92) * pitchStep,
          gain: opt === 3 ? 0.62 : 0.46,
          freqStart: opt === 3 ? 6500 : 3800,
          pan: panPos,
          reverbSend: opt === 3 ? 0.34 : 0.16,
        });
      }
      if (opt === 2) {
        // Roaring Sunfire follow-through
        playSample('fire-whoosh', {
          delay: 0.02,
          offset: 0.15,
          duration: 0.52,
          rate: 1.05 * pitchStep,
          gain: 0.68,
          pan: panPos,
          saturate: true,
        });
      }
      playSubMembrane({
        delay: 0.055,
        freqStart: 68 + h * 6,
        freqEnd: 36,
        duration: 0.24,
        gain: 0.48 + h * 0.06,
      });
    } else if (h === 4) {
      // 4th-Hit Jump Slam Finisher!
      playSample('whoosh-cinematic', { offset: 0.1, duration: 0.55, rate: 1.08, gain: 0.82, saturate: true });
      playSample('fire-whoosh', { offset: 0.1, duration: 0.75, rate: 0.92, gain: 0.78, saturate: true });
      playSample('earth-thud', { delay: 0.14, offset: 0.02, duration: 0.68, rate: 0.88, gain: 0.90, saturate: true, reverbSend: 0.28 });
      playSample('sword-clash', { delay: 0.14, rate: 0.82, gain: 0.68, reverbSend: 0.28 });
      playSample('impact-bass-1', { delay: 0.15, rate: 0.88, gain: 0.85, saturate: true });
      playSubMembrane({ delay: 0.14, freqStart: 88, freqEnd: 30, duration: 0.48, gain: 0.82 });
    } else {
      // Hit 5: 360° Glacial Tide Heavy Spin Finisher!
      playSample('whoosh-cinematic', { offset: 0.05, duration: 0.75, rate: 0.95, gain: 0.85, pan: -0.6, panEnd: 0.6, saturate: true });
      playSample('sword-whoosh', { delay: 0.08, rate: 0.84, gain: 0.82, pan: 0.5, panEnd: -0.5 });
      playSample('ice-crack', { delay: 0.16, offset: 0.05, duration: 0.95, rate: 0.96, gain: 0.88, reverbSend: 0.36, saturate: true });
      playSample('impact-bass-2', { delay: 0.18, rate: 0.85, gain: 0.86, saturate: true });
      if (opt === 3) {
        playSample('singing-bowl', { delay: 0.16, offset: 0.05, duration: 1.2, rate: 1.15, gain: 0.45, reverbSend: 0.45 });
      }
      playSubMembrane({ delay: 0.16, freqStart: 92, freqEnd: 28, duration: 0.55, gain: 0.86 });
    }
  }

  // ==========================================================================
  // SCENE 4: MAGE DISTANCE-DYNAMIC SPELL (`CINDER FALL` METEOR & CRATER SHATTER)
  // Includes real-time Distance Physics (`near` = 3m, `mid` = 9m, `far` = 16m)!
  // Beat markers in `03-cinder-fall-lifecycle.webm`:
  //   0.25s: Cast Launch & Molten Arc Whoosh
  //   0.88s: Primary Meteor Crater Impact & Shockwave!
  //   1.52s: Secondary Bouncing Magma Chunk Shatter
  //   2.45s: Cooling Magma Veins & Subterranean Vent Rumble
  // ==========================================================================
  function triggerDistanceSpellCue(beatId, optionNum = 1, distanceMode = 'near') {
    // Option 1: Tectonic Volcanic Boulder (Heavy Rock Shatter + Deep Magma Sub-Bass)
    // Option 2: Glacial Shatterlance Hybrid (Crystalline Ice Crack + Sub-Zero Shockwave)
    // Option 3: Celestial Temple Bell & Meteor (Resonant Bronze Harmonic + Earth Impact)
    // Option 4: Siege Artillery Thunderclap (Sharp Whip-Crack Transient + Rolling Valley Echo)
    // Option 5: Visceral Close-Foley Debris (Intense Fire Roar + Multi-Rock Scatter)
    const opt = Number(optionNum) || 1;

    // Distance Physics Law (3m Near vs 9m Mid vs 16m Far):
    // - Speed-of-sound air travel delay: 0ms (3m), 26ms (9m), 52ms (16m)
    // - Air absorption low-pass filter: 16000Hz (3m), 5200Hz (9m), 2100Hz (16m)
    // - Direct transient gain vs Valley Convolver reverb send
    const distSpec =
      distanceMode === 'far'
        ? { airDelay: 0.052, lpCutoff: 2100, directGain: 0.54, subGain: 0.46, reverbSend: 0.62, panSpread: 0.18 }
        : distanceMode === 'mid'
          ? { airDelay: 0.026, lpCutoff: 5200, directGain: 0.78, subGain: 0.68, reverbSend: 0.38, panSpread: 0.35 }
          : { airDelay: 0.0, lpCutoff: 16500, directGain: 1.0, subGain: 0.95, reverbSend: 0.18, panSpread: 0.55 };

    if (beatId === 'cast_launch') {
      // Cast launch happens at the Mage's hands (always near the player!)
      playSample('fire-whoosh', { offset: 0.05, duration: 0.68, rate: 1.15, rateEnd: 0.72, gain: 0.72, pan: -0.2, panEnd: 0.15, saturate: true });
      playSample('whoosh-cinematic', { offset: 0.05, duration: 0.62, rate: 1.22, rateEnd: 0.68, gain: 0.65 });
      if (opt === 2) {
        playSample('ice-crack', { offset: 0.02, duration: 0.45, rate: 1.35, gain: 0.55 });
      }
    } else if (beatId === 'crater_impact') {
      const d = distSpec.airDelay;
      const g = distSpec.directGain;
      const lp = distSpec.lpCutoff;
      const rev = distSpec.reverbSend;

      // Primary physical impact at target distance!
      playSample('earth-thud', {
        delay: d,
        offset: 0.01,
        duration: 1.1,
        rate: opt === 1 ? 0.74 : 0.84,
        gain: 0.95 * g,
        freqStart: lp,
        freqEnd: Math.min(lp, 260),
        reverbSend: rev,
        saturate: true,
      });
      playSample('meteor-crash', {
        delay: d + 0.01,
        offset: 0.02,
        duration: 1.25,
        rate: opt === 4 ? 0.92 : 0.78,
        gain: 0.88 * g,
        freqStart: lp,
        reverbSend: rev,
        saturate: true,
      });
      playSample('impact-bass-2', {
        delay: d,
        rate: 0.76,
        gain: 0.92 * distSpec.subGain,
        freqStart: Math.min(lp, 900),
        reverbSend: rev * 0.7,
        saturate: true,
      });
      playSubMembrane({
        delay: d,
        freqStart: 90,
        freqEnd: 26,
        duration: 0.65,
        gain: 0.92 * distSpec.subGain,
      });

      if (opt === 2) {
        // Crystalline Glacier Shatter layer
        playSample('ice-crack', {
          delay: d + 0.015,
          offset: 0.02,
          duration: 1.2,
          rate: 0.88,
          gain: 0.85 * g,
          freqStart: lp,
          reverbSend: rev * 1.1,
        });
      } else if (opt === 3) {
        // Resonant Bronze Temple Bell + Meteor
        playSample('singing-bowl', {
          delay: d + 0.01,
          offset: 0.02,
          duration: 1.8,
          rate: 0.56,
          gain: 0.62 * g,
          freqStart: lp,
          reverbSend: Math.min(0.75, rev + 0.25),
        });
      } else if (opt === 4) {
        // Siege Artillery Whip-Snap + Thunder Rumble
        playSample('vine-whip', { delay: d, rate: 0.65, gain: 0.78 * g, freqStart: lp, reverbSend: rev });
        playSample('deep-rumble', { delay: d + 0.04, offset: 0.05, duration: 1.6, rate: 0.82, gain: 0.75 * g, reverbSend: rev * 1.2 });
      } else if (opt === 5) {
        // Intense Fire Roar + Multi-Rock Scatter
        playSample('fire-whoosh', { delay: d, offset: 0.2, duration: 1.3, rate: 0.75, gain: 0.84 * g, freqStart: lp, reverbSend: rev, saturate: true });
      }
    } else if (beatId === 'chunk_bounce') {
      const d = distSpec.airDelay;
      const g = distSpec.directGain;
      const lp = distSpec.lpCutoff;
      const rev = distSpec.reverbSend;
      const p = distSpec.panSpread;

      playSample('meteor-crash', { delay: d, offset: 0.15, duration: 0.65, rate: 1.18, gain: 0.58 * g, freqStart: lp, pan: -p, reverbSend: rev });
      playSample('meteor-crash', { delay: d + 0.14, offset: 0.35, duration: 0.55, rate: 1.34, gain: 0.48 * g, freqStart: lp, pan: p, reverbSend: rev });
      if (opt === 2) {
        playSample('ice-crack', { delay: d + 0.06, offset: 0.4, duration: 0.6, rate: 1.28, gain: 0.52 * g, freqStart: lp, pan: p * 0.6, reverbSend: rev });
      }
    } else if (beatId === 'magma_cool') {
      const d = distSpec.airDelay;
      const g = distSpec.directGain;
      playSample('deep-rumble', { delay: d, offset: 0.3, duration: 1.2, rate: 0.68, gain: 0.46 * g, freqStart: Math.min(distSpec.lpCutoff, 680), reverbSend: distSpec.reverbSend });
    }
  }

  return {
    preloadAll,
    stopAllActive,
    triggerBriarCue,
    triggerSmiteCue,
    triggerKnightComboCue,
    triggerDistanceSpellCue,
  };
}
