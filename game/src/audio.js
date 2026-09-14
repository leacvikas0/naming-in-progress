const MASTER_VOLUME = 0.5;
const MAX_VOICES = 24;
const REF_DISTANCE = 12;
const PAN_DISTANCE = 9;
const EMPTY_OPTS = {};

const MUSIC_MANIFEST = "/game/audio/gen/music.json";
const MUSIC_BASE = "/game/audio/gen/";
const MUSIC_OPEN = 20000;
const MUSIC_MIN_HZ = 40;

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

export function createAudio({ events } = {}) {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let noiseFailed = false;
  let muted = false;

  const listener = { x: 0, y: 0, z: 0 };
  const voices = [];

  const musicBuffers = new Map();
  const musicEntries = new Map();
  const musicLoading = new Map();
  const musicFailed = new Set();
  const musicWanted = new Set();
  let musicManifest = null;
  let musicBus = null;
  let currentTrack = null;
  let musicPending = null;

  function unlock() {
    if (!ctx) {
      try {
        const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : MASTER_VOLUME;
        master.connect(ctx.destination);
        noiseBuffer = null;
        noiseFailed = false;
      } catch (err) {
        ctx = null;
        master = null;
        return;
      }
    }
    try {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const pending = ctx.resume();
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      }
    } catch (err) {}
    for (const name of [...musicWanted]) {
      musicWanted.delete(name);
      loadMusic(name);
    }
    flushMusicPending();
  }

  function update(dt, listenerPos) {
    if (!listenerPos) return;
    try {
      listener.x = listenerPos.x || 0;
      listener.y = listenerPos.y || 0;
      listener.z = listenerPos.z || 0;
    } catch (err) {}
  }

  function setMuted(value) {
    muted = !!value;
    if (!ctx || !master) return;
    try {
      const now = ctx.currentTime;
      const gain = master.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(muted ? 0 : MASTER_VOLUME, now + 0.06);
    } catch (err) {
      try {
        master.gain.value = muted ? 0 : MASTER_VOLUME;
      } catch (err2) {}
    }
  }

  function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    if (noiseFailed) return null;
    try {
      const length = Math.max(1, Math.floor(ctx.sampleRate * 2));
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch (err) {
      noiseBuffer = null;
      noiseFailed = true;
    }
    return noiseBuffer;
  }

  function makeOsc(reg, type, freq, t0, duration, peak, dest, opts) {
    const o = opts || EMPTY_OPTS;
    const osc = ctx.createOscillator();
    osc.type = type;
    const attack = Math.max(0.002, Math.min(o.attack != null ? o.attack : 0.005, duration * 0.5));
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (o.endFreq && o.endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.endFreq), t0 + duration);
    }
    if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    if (o.hold && o.hold > attack) gain.gain.setValueAtTime(Math.max(peak, 0.0001), t0 + o.hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
    reg.nodes.push(osc, gain);
    reg.sources.push(osc);
    return osc;
  }

  function makeNoise(reg, t0, duration, peak, dest, opts) {
    const buf = getNoiseBuffer();
    if (!buf) return null;
    const o = opts || EMPTY_OPTS;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const attack = Math.max(0.002, Math.min(o.attack != null ? o.attack : 0.004, duration * 0.5));
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    if (o.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = o.filter;
      filter.frequency.setValueAtTime(Math.max(20, o.f0 || 1000), t0);
      if (o.f1) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + duration);
      filter.Q.setValueAtTime(o.q != null ? o.q : 1, t0);
      src.connect(filter);
      filter.connect(gain);
      reg.nodes.push(filter);
    } else {
      src.connect(gain);
    }
    gain.connect(dest);
    src.start(t0, Math.random() * Math.max(0, buf.duration - 0.25));
    src.stop(t0 + duration + 0.03);
    reg.nodes.push(src, gain);
    reg.sources.push(src);
    return src;
  }

  function acquireVoice(endTime) {
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].end < now) voices.splice(i, 1);
    }
    if (voices.length >= MAX_VOICES) return null;
    const record = { end: endTime };
    voices.push(record);
    return record;
  }

  /* ---------------- music ---------------- */

  function rampParam(param, value, now, fade) {
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + Math.max(0.01, fade));
    } catch (err) {
      try {
        param.value = value;
      } catch (err2) {}
    }
  }

  function ensureMusicBus() {
    if (!ctx || !master) return null;
    if (!musicBus) {
      musicBus = ctx.createGain();
      musicBus.gain.value = 1;
      musicBus.connect(master);
    }
    return musicBus;
  }

  // Loop end comes from the manifest, not buffer.duration: Chrome decodes
  // Vorbis through ffmpeg, which can pad the tail (ffmpeg ticket 6367), and
  // looping over that padding would click at every wrap.
  function trackEnd(entry, buffer) {
    const want = Number.isFinite(entry.duration) ? entry.duration : buffer.duration;
    return Math.max(0.1, Math.min(want, buffer.duration));
  }

  function musicState() {
    return {
      loaded: musicBuffers.size,
      pending: musicPending ? musicPending.name : null,
      current: currentTrack ? currentTrack.name : null,
      gain: currentTrack ? currentTrack.gain.gain.value : 0,
      lowpass: currentTrack ? currentTrack.lowpass.frequency.value : 0,
      rate: currentTrack ? currentTrack.source.playbackRate.value : 1,
    };
  }

  function loadMusic(name) {
    if (!ctx) {
      musicWanted.add(name);
      return Promise.resolve(false);
    }
    if (musicBuffers.has(name)) return Promise.resolve(true);
    // A failed track stays failed: retrying on every gesture is how the
    // pending-flush path turned into an infinite loop.
    if (musicFailed.has(name)) return Promise.resolve(false);
    // Return the IN-FLIGHT promise, not a fresh resolved one. Returning a
    // resolved promise here made `playMusic().then(flush)` re-enter itself on
    // every gesture while a load was still running.
    const inFlight = musicLoading.get(name);
    if (inFlight) return inFlight;

    const load = (async () => {
      try {
        if (!musicManifest) {
          const res = await fetch(MUSIC_MANIFEST, { cache: "no-store" });
          if (!res.ok) throw new Error(`manifest ${res.status}`);
          musicManifest = await res.json();
        }
        const entry = musicManifest && musicManifest.tracks && musicManifest.tracks[name];
        if (!entry) throw new Error(`no track "${name}"`);
        const url = `${MUSIC_BASE}${entry.file}?v=${entry.hash}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${entry.file} ${res.status}`);
        const bytes = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(bytes);
        musicBuffers.set(name, buffer);
        musicEntries.set(name, entry);
        return true;
      } catch (err) {
        musicFailed.add(name); // music is optional: never surface a load failure
        return false;
      } finally {
        musicLoading.delete(name);
      }
    })();

    musicLoading.set(name, load);
    return load;
  }

  function flushMusicPending() {
    if (!musicPending || !ctx) return;
    const p = musicPending;
    musicPending = null;
    playMusic(p.name, p.opts);
  }

  function releaseMusic(m, now, fade) {
    const out = Math.max(0.05, fade * 0.6);
    rampParam(m.gain.gain, 0, now, out);
    setTimeout(() => {
      try {
        m.source.stop();
      } catch (err) {}
      try {
        m.source.disconnect();
        m.lowpass.disconnect();
        m.gain.disconnect();
      } catch (err) {}
    }, (out + 0.2) * 1000);
  }

  function playMusic(name, opts) {
    const o = opts || EMPTY_OPTS;
    const fade = Math.max(0.01, o.fade == null ? 1.5 : o.fade);
    if (!ctx || !master) {
      musicPending = { name, opts: o };
      loadMusic(name);
      return;
    }
    if (!musicBuffers.has(name)) {
      musicPending = { name, opts: o };
      // Only flush on success. Flushing after a failed load would re-enter
      // playMusic, which fails again and schedules another flush: an infinite
      // microtask chain that starves the event loop and freezes the tab.
      loadMusic(name).then((ok) => {
        if (ok) flushMusicPending();
      });
      return;
    }
    const bus = ensureMusicBus();
    if (!bus) return;

    const entry = musicEntries.get(name);
    const buffer = musicBuffers.get(name);
    const same = currentTrack && currentTrack.name === name && !o.restart;

    if (same) {
      setMusicFilter({ lowpass: MUSIC_OPEN, gain: 1, rate: 1, fade });
      return;
    }

    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = Math.max(0, Math.min(entry.loopStart, buffer.duration - 0.05));
    source.loopEnd = trackEnd(entry, buffer);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = MUSIC_OPEN;
    lowpass.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);

    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(bus);

    const from = Math.max(0, Math.min(o.from || 0, source.loopStart));
    try {
      source.start(now, from);
    } catch (err) {
      return;
    }

    const prev = currentTrack;
    currentTrack = { name, source, lowpass, gain, entry, buffer };
    if (prev) releaseMusic(prev, now, fade);
  }

  function stopMusic(opts) {
    if (!currentTrack || !ctx) return;
    const fade = Math.max(0.01, (opts && opts.fade) || 1.5);
    const m = currentTrack;
    currentTrack = null;
    releaseMusic(m, ctx.currentTime, fade);
  }

  function setMusicFilter(opts) {
    if (!currentTrack || !ctx) return;
    const o = opts || EMPTY_OPTS;
    const now = ctx.currentTime;
    const fade = Math.max(0.01, o.fade == null ? 0.4 : o.fade);
    if (Number.isFinite(o.gain)) rampParam(currentTrack.gain.gain, clamp(o.gain, 0, 1), now, fade);
    if (Number.isFinite(o.lowpass)) {
      rampParam(currentTrack.lowpass.frequency, clamp(o.lowpass, MUSIC_MIN_HZ, MUSIC_OPEN), now, fade);
    }
    if (Number.isFinite(o.rate)) {
      rampParam(currentTrack.source.playbackRate, clamp(o.rate, 0.25, 4), now, fade);
    }
  }

  const music = {
    load: loadMusic,
    prefetch(names) {
      const list = Array.isArray(names) ? names : [names];
      for (const n of list) if (n) loadMusic(n);
    },
    play: playMusic,
    stop: stopMusic,
    setFilter: setMusicFilter,
    get state() {
      return musicState();
    },
  };

  const SOUNDS = {
    swing: {
      duration: 0.12,
      volume: 0.8,
      fn(t0, out, pitch, reg) {
        makeNoise(reg, t0, 0.12, 0.55, out, {
          filter: 'bandpass',
          f0: 2600 * pitch,
          f1: 480 * pitch,
          q: 1.6,
          attack: 0.012,
          rate: pitch,
        });
      },
    },

    'swing-heavy': {
      duration: 0.25,
      volume: 0.9,
      fn(t0, out, pitch, reg) {
        makeNoise(reg, t0, 0.25, 0.6, out, {
          filter: 'bandpass',
          f0: 1150 * pitch,
          f1: 180 * pitch,
          q: 2.2,
          attack: 0.02,
          rate: pitch,
        });
        makeOsc(reg, 'square', 95 * pitch, t0 + 0.14, 0.1, 0.16, out, { endFreq: 54 * pitch, attack: 0.006 });
      },
    },

    heavy: {
      duration: 0.34,
      volume: 1,
      fn(t0, out, pitch, reg) {
        makeNoise(reg, t0, 0.34, 0.65, out, {
          filter: 'bandpass',
          f0: 800 * pitch,
          f1: 120 * pitch,
          q: 2.6,
          attack: 0.03,
          rate: pitch,
        });
        makeOsc(reg, 'square', 78 * pitch, t0 + 0.16, 0.16, 0.22, out, { endFreq: 42 * pitch, attack: 0.008 });
        makeOsc(reg, 'sine', 150 * pitch, t0 + 0.14, 0.2, 0.2, out, { endFreq: 60 * pitch, attack: 0.006 });
      },
    },

    hit: {
      duration: 0.12,
      volume: 1,
      fn(t0, out, pitch, reg) {
        makeNoise(reg, t0, 0.07, 0.5, out, {
          filter: 'lowpass',
          f0: 2400 * pitch,
          f1: 350 * pitch,
          q: 0.9,
          attack: 0.002,
          rate: pitch,
        });
        makeOsc(reg, 'sine', 120 * pitch, t0, 0.12, 0.6, out, { endFreq: 70 * pitch, attack: 0.002 });
      },
    },

    crit: {
      duration: 0.16,
      volume: 1,
      fn(t0, out, pitch, reg) {
        makeNoise(reg, t0, 0.07, 0.5, out, {
          filter: 'lowpass',
          f0: 2600 * pitch,
          f1: 400 * pitch,
          q: 0.9,
          attack: 0.002,
          rate: pitch,
        });
        makeOsc(reg, 'sine', 120 * pitch, t0, 0.12, 0.55, out, { endFreq: 70 * pitch, attack: 0.002 });
        makeOsc(reg, 'triangle', 900 * pitch, t0 + 0.01, 0.15, 0.3, out, { endFreq: 1400 * pitch, attack: 0.004 });
        makeOsc(reg, 'sine', 1800 * pitch, t0 + 0.02, 0.12, 0.12, out, { endFreq: 2600 * pitch, attack: 0.004 });
      },
    },

    kill: {
      duration: 0.35,
      volume: 1,
      fn(t0, out, pitch, reg) {
        makeOsc(reg, 'sine', 110 * pitch, t0, 0.25, 0.6, out, { endFreq: 46 * pitch, attack: 0.002 });
        makeOsc(reg, 'sawtooth', 220 * pitch, t0, 0.35, 0.28, out, { endFreq: 80 * pitch, attack: 0.004 });
        makeNoise(reg, t0, 0.08, 0.25, out, {
          filter: 'lowpass',
          f0: 900 * pitch,
          f1: 200 * pitch,
          q: 0.7,
          attack: 0.002,
          rate: pitch,
        });
      },
    },

    hurt: {
      duration: 0.18,
      volume: 0.9,
      fn(t0, out, pitch, reg) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(700 * pitch, t0);
        filter.frequency.exponentialRampToValueAtTime(300 * pitch, t0 + 0.18);
        filter.Q.setValueAtTime(6, t0);
        reg.nodes.push(filter);
        filter.connect(out);
        makeOsc(reg, 'square', 90 * pitch, t0, 0.18, 0.5, filter, { endFreq: 70 * pitch, attack: 0.004 });
        makeOsc(reg, 'square', 92.5 * pitch, t0, 0.18, 0.35, filter, { endFreq: 72 * pitch, attack: 0.004, detune: 12 });
      },
    },

    dodge: {
      duration: 0.15,
      volume: 0.7,
      fn(t0, out, pitch, reg) {
        makeNoise(reg, t0, 0.15, 0.4, out, {
          filter: 'highpass',
          f0: 700 * pitch,
          f1: 2600 * pitch,
          q: 0.8,
          attack: 0.03,
          rate: pitch,
        });
      },
    },

    jump: {
      duration: 0.14,
      volume: 0.8,
      fn(t0, out, pitch, reg) {
        makeOsc(reg, 'sine', 300 * pitch, t0, 0.14, 0.4, out, { endFreq: 600 * pitch, attack: 0.006 });
      },
    },

    land: {
      duration: 0.12,
      volume: 0.9,
      fn(t0, out, pitch, reg) {
        makeOsc(reg, 'sine', 100 * pitch, t0, 0.12, 0.55, out, { endFreq: 55 * pitch, attack: 0.002 });
        makeNoise(reg, t0, 0.08, 0.22, out, {
          filter: 'lowpass',
          f0: 800 * pitch,
          f1: 200 * pitch,
          q: 0.7,
          attack: 0.002,
          rate: pitch,
        });
      },
    },

    coin: {
      duration: 0.12,
      volume: 0.7,
      fn(t0, out, pitch, reg) {
        makeOsc(reg, 'sine', 1200 * pitch, t0, 0.055, 0.3, out, { attack: 0.002 });
        makeOsc(reg, 'sine', 1800 * pitch, t0 + 0.05, 0.07, 0.3, out, { attack: 0.002 });
        makeOsc(reg, 'sine', 2400 * pitch, t0 + 0.05, 0.07, 0.08, out, { attack: 0.002 });
      },
    },

    wave: {
      duration: 1.2,
      volume: 0.9,
      fn(t0, out, pitch, reg) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, t0);
        filter.frequency.exponentialRampToValueAtTime(900, t0 + 0.5);
        filter.frequency.exponentialRampToValueAtTime(400, t0 + 1.2);
        filter.Q.setValueAtTime(1.2, t0);
        reg.nodes.push(filter);
        filter.connect(out);
        makeOsc(reg, 'sawtooth', 110 * pitch, t0, 1.2, 0.22, filter, { attack: 0.28, hold: 0.8 });
        makeOsc(reg, 'sawtooth', 165 * pitch, t0, 1.2, 0.18, filter, { attack: 0.3, hold: 0.8 });
        makeOsc(reg, 'sawtooth', 110 * pitch, t0, 1.2, 0.14, filter, { attack: 0.32, hold: 0.8, detune: 9 });
        makeOsc(reg, 'sine', 55 * pitch, t0, 1.2, 0.2, out, { attack: 0.25, hold: 0.8 });
      },
    },

    upgrade: {
      duration: 0.5,
      volume: 0.8,
      fn(t0, out, pitch, reg) {
        const notes = [523.25, 659.25, 783.99];
        for (let i = 0; i < notes.length; i++) {
          makeOsc(reg, 'sine', notes[i] * pitch, t0 + i * 0.11, 0.24, 0.26, out, { attack: 0.01 });
          makeOsc(reg, 'triangle', notes[i] * 2 * pitch, t0 + i * 0.11, 0.16, 0.06, out, { attack: 0.01 });
        }
      },
    },

    death: {
      duration: 1.4,
      volume: 1,
      fn(t0, out, pitch, reg) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200 * pitch, t0);
        filter.frequency.exponentialRampToValueAtTime(160 * pitch, t0 + 1.4);
        filter.Q.setValueAtTime(1, t0);
        reg.nodes.push(filter);
        filter.connect(out);
        makeOsc(reg, 'sawtooth', 440 * pitch, t0, 1.4, 0.3, filter, { endFreq: 82 * pitch, attack: 0.02 });
        makeOsc(reg, 'sawtooth', 523.25 * pitch, t0, 1.4, 0.22, filter, {
          endFreq: 98 * pitch,
          attack: 0.025,
          detune: -8,
        });
        makeOsc(reg, 'sine', 55 * pitch, t0 + 0.2, 1.2, 0.22, out, { endFreq: 30 * pitch, attack: 0.05 });
      },
    },

    // Bright metallic sting; callers shift `pitch` per reaction type.
    reaction: {
      duration: 0.5,
      volume: 1,
      fn(t0, out, pitch, reg) {
        makeOsc(reg, 'triangle', 880 * pitch, t0, 0.3, 0.3, out, { endFreq: 1320 * pitch, attack: 0.004 });
        makeOsc(reg, 'sine', 1320 * pitch, t0 + 0.03, 0.32, 0.22, out, { endFreq: 1980 * pitch, attack: 0.004 });
        makeOsc(reg, 'sine', 2640 * pitch, t0 + 0.06, 0.3, 0.1, out, { endFreq: 3300 * pitch, attack: 0.006 });
        makeNoise(reg, t0, 0.16, 0.22, out, {
          filter: 'highpass',
          f0: 2400 * pitch,
          f1: 4200 * pitch,
          q: 1.4,
          attack: 0.003,
          rate: pitch,
        });
      },
    },

    swap: {
      duration: 0.42,
      volume: 0.9,
      fn(t0, out, pitch, reg) {
        makeNoise(reg, t0, 0.26, 0.45, out, {
          filter: 'bandpass',
          f0: 420 * pitch,
          f1: 2600 * pitch,
          q: 1.1,
          attack: 0.05,
          rate: pitch,
        });
        makeOsc(reg, 'sine', 660 * pitch, t0 + 0.1, 0.3, 0.28, out, { endFreq: 990 * pitch, attack: 0.006 });
        makeOsc(reg, 'sine', 990 * pitch, t0 + 0.18, 0.24, 0.18, out, { endFreq: 1480 * pitch, attack: 0.006 });
      },
    },

    super: {
      duration: 1.1,
      volume: 1,
      fn(t0, out, pitch, reg) {
        makeOsc(reg, 'sine', 65 * pitch, t0, 0.9, 0.8, out, { endFreq: 30 * pitch, attack: 0.004 });
        makeOsc(reg, 'sawtooth', 98 * pitch, t0 + 0.02, 0.8, 0.3, out, { endFreq: 46 * pitch, attack: 0.01 });
        makeNoise(reg, t0, 0.7, 0.6, out, {
          filter: 'lowpass',
          f0: 3600 * pitch,
          f1: 110 * pitch,
          q: 0.9,
          attack: 0.004,
          rate: pitch,
        });
        makeNoise(reg, t0 + 0.05, 0.16, 0.26, out, {
          filter: 'highpass',
          f0: 1700 * pitch,
          f1: 600 * pitch,
          q: 0.6,
          attack: 0.002,
          rate: pitch,
        });
        makeOsc(reg, 'triangle', 520 * pitch, t0 + 0.08, 0.5, 0.14, out, { endFreq: 780 * pitch, attack: 0.02 });
      },
    },

    freeze: {
      duration: 0.24,
      volume: 0.85,
      fn(t0, out, pitch, reg) {
        makeOsc(reg, 'sine', 1980 * pitch, t0, 0.1, 0.26, out, { endFreq: 2640 * pitch, attack: 0.002 });
        makeOsc(reg, 'triangle', 1320 * pitch, t0 + 0.05, 0.14, 0.16, out, { endFreq: 1760 * pitch, attack: 0.003 });
        makeNoise(reg, t0, 0.06, 0.2, out, {
          filter: 'highpass',
          f0: 3200 * pitch,
          f1: 5200 * pitch,
          q: 1.2,
          attack: 0.002,
          rate: pitch,
        });
      },
    },

    'enemy-windup': {
      duration: 0.2,
      volume: 0.7,
      fn(t0, out, pitch, reg) {
        const offsets = [0, 0.06, 0.115, 0.16];
        for (let i = 0; i < offsets.length; i++) {
          makeNoise(reg, t0 + offsets[i], 0.035, 0.28 - i * 0.03, out, {
            filter: 'bandpass',
            f0: (2800 + i * 500) * pitch,
            f1: (1800 + i * 300) * pitch,
            q: 3,
            attack: 0.003,
            rate: pitch,
          });
        }
      },
    },

    cast: {
      duration: 0.3,
      volume: 0.8,
      fn(t0, out, pitch, reg) {
        const carrier = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();
        const gain = ctx.createGain();
        carrier.type = 'sine';
        mod.type = 'sine';
        carrier.frequency.setValueAtTime(420 * pitch, t0);
        carrier.frequency.exponentialRampToValueAtTime(1150 * pitch, t0 + 0.3);
        mod.frequency.setValueAtTime(180 * pitch, t0);
        mod.frequency.exponentialRampToValueAtTime(340 * pitch, t0 + 0.3);
        modGain.gain.setValueAtTime(220 * pitch, t0);
        modGain.gain.exponentialRampToValueAtTime(520 * pitch, t0 + 0.3);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.34, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
        mod.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(gain);
        gain.connect(out);
        mod.start(t0);
        carrier.start(t0);
        mod.stop(t0 + 0.33);
        carrier.stop(t0 + 0.33);
        reg.nodes.push(carrier, mod, modGain, gain);
        reg.sources.push(carrier, mod);
      },
    },

    explode: {
      duration: 0.5,
      volume: 1,
      fn(t0, out, pitch, reg) {
        makeNoise(reg, t0, 0.5, 0.7, out, {
          filter: 'lowpass',
          f0: 3200 * pitch,
          f1: 120 * pitch,
          q: 0.8,
          attack: 0.005,
          rate: pitch,
        });
        makeOsc(reg, 'sine', 75 * pitch, t0, 0.4, 0.65, out, { endFreq: 36 * pitch, attack: 0.003 });
        makeNoise(reg, t0 + 0.02, 0.12, 0.3, out, {
          filter: 'highpass',
          f0: 1500 * pitch,
          f1: 500 * pitch,
          q: 0.6,
          attack: 0.002,
          rate: pitch,
        });
      },
    },

    'ui-click': {
      duration: 0.05,
      volume: 0.5,
      fn(t0, out, pitch, reg) {
        makeOsc(reg, 'square', 800 * pitch, t0, 0.05, 0.18, out, { endFreq: 640 * pitch, attack: 0.002 });
      },
    },

    start: {
      duration: 1.5,
      volume: 1,
      fn(t0, out, pitch, reg) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400 * pitch, t0);
        filter.frequency.exponentialRampToValueAtTime(700 * pitch, t0 + 1.1);
        filter.Q.setValueAtTime(1, t0);
        reg.nodes.push(filter);
        filter.connect(out);
        makeOsc(reg, 'sawtooth', 220 * pitch, t0 + 0.1, 1.35, 0.24, filter, { attack: 0.12, hold: 0.7 });
        makeOsc(reg, 'sawtooth', 330 * pitch, t0 + 0.1, 1.35, 0.18, filter, { attack: 0.14, hold: 0.7, detune: 6 });
        makeOsc(reg, 'sine', 110 * pitch, t0 + 0.1, 1.35, 0.22, out, { attack: 0.12, hold: 0.7 });
        makeOsc(reg, 'sine', 130 * pitch, t0, 0.3, 0.6, out, { endFreq: 48 * pitch, attack: 0.002 });
        makeNoise(reg, t0, 0.14, 0.3, out, {
          filter: 'lowpass',
          f0: 900 * pitch,
          f1: 250 * pitch,
          q: 0.7,
          attack: 0.002,
          rate: pitch,
        });
        makeOsc(reg, 'sine', 110 * pitch, t0 + 0.42, 0.3, 0.45, out, { endFreq: 44 * pitch, attack: 0.002 });
        makeNoise(reg, t0 + 0.42, 0.12, 0.22, out, {
          filter: 'lowpass',
          f0: 800 * pitch,
          f1: 220 * pitch,
          q: 0.7,
          attack: 0.002,
          rate: pitch,
        });
      },
    },
  };

  function play(name, opts) {
    if (!ctx || !master || muted) return;
    const def = SOUNDS[name];
    if (!def) return;
    try {
      const o = opts || EMPTY_OPTS;
      const pitch = clamp(o.pitch == null ? 1 : o.pitch, 0.25, 4);
      let volume = clamp(o.volume == null ? 1 : o.volume, 0, 1) * def.volume;
      let pan = 0;
      if (o.position) {
        const dx = (o.position.x || 0) - listener.x;
        const dy = (o.position.y || 0) - listener.y;
        const dz = (o.position.z || 0) - listener.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        volume *= REF_DISTANCE / (REF_DISTANCE + dist);
        pan = clamp(dx / PAN_DISTANCE, -1, 1);
      }
      if (volume <= 0.001) return;

      const t0 = ctx.currentTime + 0.004;
      const record = acquireVoice(t0 + def.duration + 0.5);
      if (!record) return;

      const reg = { nodes: [], sources: [] };
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = volume;
      reg.nodes.push(voiceGain);
      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        voiceGain.connect(panner);
        panner.connect(master);
        reg.nodes.push(panner);
      } else {
        voiceGain.connect(master);
      }

      let failed = false;
      try {
        def.fn(t0, voiceGain, pitch, reg);
      } catch (err) {
        failed = true;
      }

      let cleaned = false;
      const finish = () => {
        if (cleaned) return;
        cleaned = true;
        const index = voices.indexOf(record);
        if (index !== -1) voices.splice(index, 1);
        for (let i = 0; i < reg.nodes.length; i++) {
          try {
            reg.nodes[i].disconnect();
          } catch (err) {}
        }
      };

      if (failed || reg.sources.length === 0) {
        finish();
        return;
      }

      let remaining = reg.sources.length;
      for (let i = 0; i < reg.sources.length; i++) {
        reg.sources[i].onended = () => {
          remaining -= 1;
          if (remaining <= 0) finish();
        };
      }
      setTimeout(finish, (def.duration + 0.8) * 1000);
    } catch (err) {}
  }

  if (events && typeof events.on === 'function') {
    try {
      events.on('sfx', (payload) => {
        if (payload && typeof payload.name === 'string') play(payload.name, payload);
      });
    } catch (err) {}
  }

  return {
    unlock,
    update,
    play,
    music,
    setMuted,
    get muted() {
      return muted;
    },
  };
}
