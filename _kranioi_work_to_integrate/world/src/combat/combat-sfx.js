// ============================================================================
// world/src/combat/combat-sfx.js
//
// Pure WebAudio Synthesized Combat Sound Effects:
// - Sword slashes (`combo1..3`, `charged` Heavy Breathing Finisher)
// - Breathing ignition whoosh (`Glacial Tide`, `Hinokami Sunfire`, `Thunderclap Wisteria`)
// - Spell casts (`Frost Lance`, `Shatterlance`, `Cinder Fall`, `Storm Lance`)
// - Physical Detonation bass impact (`Shatterblow`, `Solar Flare`, `Thunderchain`)
// - Golden Ward Shield chime, Perfect Dodge time-dilation ping, Couples Ultimate
//   cataclysm, and Dawn Victory fanfare.
// - Automatic safe no-op in headless Node.js or restricted browser contexts.
// ============================================================================

export function createCombatSfx({ muted = false, masterVolume = 0.28 } = {}) {
  let isMuted = Boolean(muted);
  let ctx = null;
  let noiseBuffer = null;

  function ensureContext() {
    if (isMuted) return null;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      if (!ctx) {
        ctx = new AudioCtx();
      }
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (!noiseBuffer && ctx) {
        const sr = ctx.sampleRate || 44100;
        const len = Math.floor(sr * 0.6);
        noiseBuffer = ctx.createBuffer(1, len, sr);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = Math.random() * 2.0 - 1.0;
        }
      }
      return ctx;
    } catch {
      return null;
    }
  }

  function playTone({
    type = 'sine',
    freqStart = 440,
    freqEnd = 220,
    duration = 0.18,
    gainPeak = 0.25,
    delay = 0,
  } = {}) {
    const audio = ensureContext();
    if (!audio) return;
    try {
      const t0 = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freqStart), t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);

      const peak = gainPeak * masterVolume;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.018, duration * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.01);
    } catch {
      // Safe no-op
    }
  }

  function playFilteredNoise({
    filterType = 'bandpass',
    freqStart = 1200,
    freqEnd = 420,
    q = 2.0,
    duration = 0.16,
    gainPeak = 0.22,
    delay = 0,
  } = {}) {
    const audio = ensureContext();
    if (!audio || !noiseBuffer) return;
    try {
      const t0 = audio.currentTime + delay;
      const src = audio.createBufferSource();
      src.buffer = noiseBuffer;

      const filter = audio.createBiquadFilter();
      filter.type = filterType;
      filter.Q.setValueAtTime(q, t0);
      filter.frequency.setValueAtTime(Math.max(40, freqStart), t0);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + duration);

      const gain = audio.createGain();
      const peak = gainPeak * masterVolume;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.02, duration * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.destination);
      src.start(t0);
      src.stop(t0 + duration + 0.01);
    } catch {
      // Safe no-op
    }
  }

  function playSwordSlash(comboIndex = 0, breathingStyle = 'none') {
    const baseFreq = comboIndex === 2 ? 980 : comboIndex === 1 ? 820 : 680;
    playFilteredNoise({
      filterType: 'bandpass',
      freqStart: baseFreq * 1.4,
      freqEnd: 260,
      q: 2.2,
      duration: comboIndex === 2 ? 0.22 : 0.15,
      gainPeak: 0.28,
    });

    if (breathingStyle === 'rime') {
      playTone({
        type: 'triangle',
        freqStart: 1320,
        freqEnd: 1960,
        duration: 0.16,
        gainPeak: 0.16,
      });
    } else if (breathingStyle === 'solar') {
      playFilteredNoise({
        filterType: 'lowpass',
        freqStart: 760,
        freqEnd: 180,
        q: 1.4,
        duration: 0.22,
        gainPeak: 0.24,
      });
    } else if (breathingStyle === 'tempest') {
      playTone({
        type: 'sawtooth',
        freqStart: 920,
        freqEnd: 310,
        duration: 0.14,
        gainPeak: 0.15,
      });
    }
  }

  function playHeavyFinisher(breathingStyle = 'none') {
    playFilteredNoise({
      filterType: 'bandpass',
      freqStart: 1450,
      freqEnd: 190,
      q: 1.8,
      duration: 0.32,
      gainPeak: 0.36,
    });
    playTone({
      type: 'triangle',
      freqStart: 240,
      freqEnd: 68,
      duration: 0.28,
      gainPeak: 0.32,
    });
    if (breathingStyle !== 'none') {
      playTone({
        type: 'sine',
        freqStart: 880,
        freqEnd: 1480,
        duration: 0.24,
        gainPeak: 0.18,
        delay: 0.04,
      });
    }
  }

  function playBreathingIgnition(breathingStyle = 'rime') {
    playFilteredNoise({
      filterType: 'bandpass',
      freqStart: 380,
      freqEnd: 1650,
      q: 2.6,
      duration: 0.34,
      gainPeak: 0.26,
    });
    const chord =
      breathingStyle === 'solar'
        ? [440, 554.37, 659.25]
        : breathingStyle === 'tempest'
          ? [493.88, 622.25, 739.99]
          : [523.25, 659.25, 783.99];
    chord.forEach((f, idx) => {
      playTone({
        type: 'triangle',
        freqStart: f,
        freqEnd: f * 1.02,
        duration: 0.28,
        gainPeak: 0.14,
        delay: idx * 0.045,
      });
    });
  }

  function playSpellCast(spellId = 'frost_lance') {
    if (spellId === 'frost_lance') {
      playFilteredNoise({
        filterType: 'highpass',
        freqStart: 1600,
        freqEnd: 620,
        q: 2.0,
        duration: 0.28,
        gainPeak: 0.24,
      });
      playTone({ type: 'triangle', freqStart: 1046, freqEnd: 1568, duration: 0.25, gainPeak: 0.2 });
    } else if (spellId === 'shatterlance') {
      // High-velocity railgun charge + crystalline crack
      playTone({ type: 'sawtooth', freqStart: 320, freqEnd: 1860, duration: 0.18, gainPeak: 0.22 });
      playTone({
        type: 'triangle',
        freqStart: 1680,
        freqEnd: 110,
        duration: 0.26,
        gainPeak: 0.3,
        delay: 0.12,
      });
    } else if (spellId === 'cinder_fall') {
      // Volcanic meteor whistle + deep magma thud
      playTone({ type: 'sine', freqStart: 620, freqEnd: 95, duration: 0.36, gainPeak: 0.28 });
      playFilteredNoise({
        filterType: 'lowpass',
        freqStart: 680,
        freqEnd: 120,
        q: 1.5,
        duration: 0.42,
        gainPeak: 0.34,
        delay: 0.1,
      });
    } else if (spellId === 'storm_lance') {
      // Braided thunderclap snap
      playFilteredNoise({
        filterType: 'bandpass',
        freqStart: 2200,
        freqEnd: 340,
        q: 3.0,
        duration: 0.24,
        gainPeak: 0.3,
      });
      playTone({ type: 'sawtooth', freqStart: 880, freqEnd: 140, duration: 0.22, gainPeak: 0.22 });
    }
  }

  function playDetonation(detonationId = 'shatterblow') {
    // Sub-bass impact drop
    playTone({
      type: 'sine',
      freqStart: 155,
      freqEnd: 38,
      duration: 0.42,
      gainPeak: 0.45,
    });

    if (detonationId === 'shatterblow') {
      playTone({ type: 'triangle', freqStart: 1760, freqEnd: 880, duration: 0.24, gainPeak: 0.24 });
      playFilteredNoise({
        filterType: 'highpass',
        freqStart: 1800,
        freqEnd: 520,
        duration: 0.26,
        gainPeak: 0.28,
      });
    } else if (detonationId === 'solar_flare') {
      playFilteredNoise({
        filterType: 'lowpass',
        freqStart: 920,
        freqEnd: 140,
        duration: 0.38,
        gainPeak: 0.36,
      });
      playTone({ type: 'sawtooth', freqStart: 360, freqEnd: 90, duration: 0.32, gainPeak: 0.24 });
    } else {
      playTone({ type: 'sawtooth', freqStart: 1240, freqEnd: 180, duration: 0.28, gainPeak: 0.26 });
      playFilteredNoise({
        filterType: 'bandpass',
        freqStart: 1950,
        freqEnd: 280,
        duration: 0.3,
        gainPeak: 0.3,
      });
    }
  }

  function playShieldChime() {
    const notes = [587.33, 880.0, 1174.66];
    notes.forEach((f, i) => {
      playTone({
        type: 'sine',
        freqStart: f,
        freqEnd: f * 1.01,
        duration: 0.32,
        gainPeak: 0.18,
        delay: i * 0.055,
      });
    });
  }

  function playPerfectDodge() {
    playTone({ type: 'sine', freqStart: 1318.5, freqEnd: 1760, duration: 0.22, gainPeak: 0.22 });
    playFilteredNoise({
      filterType: 'bandpass',
      freqStart: 900,
      freqEnd: 260,
      duration: 0.2,
      gainPeak: 0.18,
    });
  }

  // Enemy windup cues: a distinct read per attack family (spec: pose + glint + sound).
  function playEnemyWindup(kind = 'melee') {
    if (kind === 'heavy') {
      // Unblockable / boss heavies: low rising growl + metallic ring.
      playTone({ type: 'sawtooth', freqStart: 70, freqEnd: 140, duration: 0.42, gainPeak: 0.16 });
      playTone({ type: 'sine', freqStart: 1568, freqEnd: 1480, duration: 0.3, gainPeak: 0.1, delay: 0.05 });
    } else if (kind === 'area') {
      playFilteredNoise({ filterType: 'lowpass', freqStart: 220, freqEnd: 900, duration: 0.5, gainPeak: 0.2 });
    } else if (kind === 'cast') {
      playTone({ type: 'triangle', freqStart: 330, freqEnd: 660, duration: 0.28, gainPeak: 0.1 });
    } else {
      playFilteredNoise({ filterType: 'bandpass', freqStart: 500, freqEnd: 1500, q: 3.0, duration: 0.14, gainPeak: 0.12 });
    }
  }

  function playPlayerHit() {
    playTone({ type: 'sawtooth', freqStart: 180, freqEnd: 65, duration: 0.16, gainPeak: 0.26 });
  }

  function playEnemyHit() {
    playTone({ type: 'triangle', freqStart: 310, freqEnd: 110, duration: 0.1, gainPeak: 0.18 });
  }

  function playCouplesUltimate() {
    playTone({ type: 'sine', freqStart: 180, freqEnd: 36, duration: 0.65, gainPeak: 0.48 });
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f, i) => {
      playTone({
        type: 'triangle',
        freqStart: f,
        freqEnd: f * 1.03,
        duration: 0.55,
        gainPeak: 0.2,
        delay: i * 0.06,
      });
    });
  }

  function playVictoryFanfare() {
    const fanfare = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    fanfare.forEach((f, i) => {
      playTone({
        type: 'triangle',
        freqStart: f,
        freqEnd: f,
        duration: i === fanfare.length - 1 ? 0.65 : 0.24,
        gainPeak: 0.22,
        delay: i * 0.11,
      });
    });
  }

  return {
    get muted() {
      return isMuted;
    },
    setMuted(next) {
      isMuted = Boolean(next);
    },
    playSwordSlash,
    playHeavyFinisher,
    playBreathingIgnition,
    playSpellCast,
    playDetonation,
    playShieldChime,
    playEnemyWindup,
    playPerfectDodge,
    playPlayerHit,
    playEnemyHit,
    playCouplesUltimate,
    playVictoryFanfare,
  };
}
