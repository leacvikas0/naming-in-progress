// Regression harness for the music director's gesture path.
//
// The bug: playMusic() scheduled `loadMusic(name).then(flushMusicPending)` when
// a track was not yet decoded. loadMusic() returns an already-resolved promise
// when a load is already in flight, so a second gesture during the load ran
// flush -> playMusic -> resolved .then -> flush forever: an infinite microtask
// chain that starves the event loop and freezes the page.
//
// Run as a child process with a timeout, because the failure mode is a hang —
// a timer never fires once the microtask queue takes over. Prints SURVIVED and
// exits 0 when the director behaves; anything else is a failure.

import { createAudio } from "../../src/audio.js";

/* ---------------- fake Web Audio ---------------- */

function param(value) {
  return {
    value,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  };
}

function node(extra) {
  return Object.assign(
    {
      connect() {},
      disconnect() {},
    },
    extra
  );
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = "running";
    this.destination = node();
  }
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return node({ gain: param(1) });
  }
  createBufferSource() {
    return node({
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: param(1),
      start() {},
      stop() {},
    });
  }
  createBiquadFilter() {
    return node({ type: "lowpass", frequency: param(20000), Q: param(0.7) });
  }
  createOscillator() {
    return node({ type: "sine", frequency: param(440), detune: param(0), start() {}, stop() {} });
  }
  createStereoPanner() {
    return node({ pan: param(0) });
  }
  createBuffer() {
    return { duration: 0.01, getChannelData: () => new Float32Array(8) };
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 166, numberOfChannels: 2, sampleRate: 44100 });
  }
}

globalThis.AudioContext = FakeAudioContext;

/* ---------------- fake network ---------------- */

const MANIFEST = {
  tracks: {
    title: { file: "title.ogg", duration: 166, loopStart: 16, loopEnd: 166, hash: "abc12345" },
    combat: { file: "combat.ogg", duration: 172, loopStart: 10, loopEnd: 172, hash: "def67890" },
  },
};

// A real async boundary: the fetch resolves on a timer, so the second gesture
// lands while the load is genuinely in flight.
globalThis.fetch = (url) =>
  new Promise((resolve) =>
    setTimeout(() => {
      if (String(url).endsWith("music.json")) {
        resolve({ ok: true, json: async () => MANIFEST });
      } else {
        resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) });
      }
    }, 60)
  );

/* ---------------- the gesture sequence ---------------- */

const MODE = process.argv[2] || "success";

if (MODE === "failure") {
  // A load that never succeeds must also not loop: flushing after a failed
  // load re-entered playMusic, which failed again and scheduled another flush.
  globalThis.fetch = () => Promise.resolve({ ok: false, status: 404 });
}

const audio = createAudio({ events: { on() {} } });

audio.unlock(); // creates the context
audio.music.play("title", { fade: 1.2 }); // starts loading; resolves in 60ms
audio.unlock(); // second gesture during the load — the original hang
audio.unlock(); // and a third, to be sure

setTimeout(() => {
  const s = audio.music.state;
  if (MODE === "failure") {
    if (s.current !== null) {
      console.error("UNEXPECTED_PLAYBACK", JSON.stringify(s));
      process.exit(3);
    }
    console.log("SURVIVED_FAILURE", JSON.stringify(s));
    process.exit(0);
  }
  if (s.current !== "title") {
    console.error("NOT_PLAYING", JSON.stringify(s));
    process.exit(3);
  }
  console.log("SURVIVED", JSON.stringify(s));
  process.exit(0);
}, 400);

setTimeout(() => {
  console.error("TIMEOUT");
  process.exit(4);
}, 3000);
