// ============================================================================
// world/src/combat/commune-client.js
//
// Wave 3 30-Second Tap-to-Speak `Commune` Client, Diegetic Crimson Rose Ring
// Timer (`r = 1.65m`, 24 Rose Clusters & 48 Shedding Petals), Immediate
// Microphone Track Release, Single-Ceremony Lock & Wide Surround-Sound Divine
// Voice Playback for Haru-machi.
//
// Visual & Audio Contract:
// - Tap `Commune` to start speaking, tap again to send, `30.0s` max
//   (`MAX_COMMUNE_SECONDS = 30.0`) — zero 8–15s local retry nonsense.
// - Diegetic Crimson Rose Ring Timer: 24 hardware-opaque cel-shaded Crimson
//   Rose clusters (`#9e1326` outer, `#e32636` inner cup, `#1b4d2e` foliage)
//   and 48 shedding crimson petals at `r = 1.65m` around the speaker's feet.
//   As `elapsed` advances `0s -> 30s`, `remainingFraction = 1.0 - elapsed / 30.0`
//   and roses progressively shed their petals into an upward spiral breeze.
// - Immediate Microphone Track Release (`stopAllMicTracksImmediately()`):
//   Calls `track.stop()` on every `MediaStream` track synchronously on stop,
//   30s timeout, cancel, or error BEFORE network I/O begins.
// - Wide Surround-Sound Divine Voice (`playWideSurroundDivineVoice`):
//   Haas `14ms` L/R micro-delay stereo widener + `185Hz` low-shelf warmth +
//   cathedral stereo impulse convolver (`2.4s`), playing ONLY when
//   `shouldSpeakAloud !== false`.
// ============================================================================

import * as THREE from 'three';

export const MAX_COMMUNE_SECONDS = 30.0;
export const HOLD_SEND_THRESHOLD_SECONDS = 1.5;
export const SILENCE_AUTO_SEND_SECONDS = 2.2;
export const MIN_VOICED_SECONDS = 0.35;
export const MIN_SAFE_WORD_COUNT = 2;
export const CRIMSON_ROSE_RING_COUNT = 24;
export const CRIMSON_ROSE_PETAL_COUNT = 48;
export const CRIMSON_ROSE_RING_RADIUS = 1.65;

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function countSpokenWords(text) {
  if (typeof text !== 'string') return 0;
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function addPlush3DRosePetal(positions, normals, colors, {
  cx = 0,
  cy = 0,
  cz = 0,
  yaw = 0,
  pitch = 0.55,
  length = 0.11,
  width = 0.068,
  cupDepth = 0.022,
  ridgeHeight = 0.014,
  colBase,
  colMid,
  colTip,
}) {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const fn = new THREE.Vector3();

  function toWorld(lx, ly, lz) {
    const ry = ly * cosP - lz * sinP;
    const rz = ly * sinP + lz * cosP;
    const wx = cx + lx * cosY + rz * sinY;
    const wy = cy + ry;
    const wz = cz - lx * sinY + rz * cosY;
    return [wx, wy, wz];
  }

  function pushTri(p0, p1, p2, c0, c1, c2) {
    positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    colors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
    vA.fromArray(p0);
    vB.fromArray(p1);
    vC.fromArray(p2);
    e1.subVectors(vB, vA);
    e2.subVectors(vC, vA);
    fn.crossVectors(e1, e2);
    if (fn.y < 0) fn.negate();
    fn.y = Math.max(fn.y, 0.38);
    fn.normalize();
    normals.push(fn.x, fn.y, fn.z, fn.x, fn.y, fn.z, fn.x, fn.y, fn.z);
  }

  const B = toWorld(0, 0, 0);
  const M = toWorld(0, ridgeHeight, length * 0.54);
  const L = toWorld(-width * 0.5, cupDepth, length * 0.50);
  const R = toWorld(width * 0.5, cupDepth, length * 0.50);
  const TL = toWorld(-width * 0.30, cupDepth * 0.65, length * 0.92);
  const TR = toWorld(width * 0.30, cupDepth * 0.65, length * 0.92);
  const T = toWorld(0, -ridgeHeight * 0.35, length);

  // Upper 3D cupped face (6 triangles)
  pushTri(B, L, M, colBase, colMid, colMid);
  pushTri(B, M, R, colBase, colMid, colMid);
  pushTri(L, TL, M, colMid, colTip, colMid);
  pushTri(M, TR, R, colMid, colTip, colMid);
  pushTri(M, TL, T, colMid, colTip, colTip);
  pushTri(M, T, TR, colMid, colTip, colTip);

  // Under-hull keel for physical 3D thickness from low camera angles (2 triangles)
  const K = toWorld(0, -ridgeHeight * 0.95, length * 0.52);
  pushTri(B, K, L, colBase, colBase, colMid);
  pushTri(B, R, K, colBase, colMid, colBase);
}

function buildRoseClusterGeometry() {
  const positions = [];
  const normals = [];
  const colors = [];

  const cFoliageDark = new THREE.Color('#143d23');
  const cFoliageMid = new THREE.Color('#1f5c35');
  const cFoliageLit = new THREE.Color('#2e7d47');
  const cOuter = new THREE.Color('#7f1022');
  const cMid = new THREE.Color('#be123c');
  const cCup = new THREE.Color('#e11d48');
  const cCore = new THREE.Color('#fb7185');

  // 5 3D arched emerald basal leaves
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.32;
    addPlush3DRosePetal(positions, normals, colors, {
      cx: Math.cos(a) * 0.02,
      cy: 0.018,
      cz: Math.sin(a) * 0.02,
      yaw: a,
      pitch: 0.18,
      length: 0.16,
      width: 0.085,
      cupDepth: 0.018,
      ridgeHeight: 0.016,
      colBase: cFoliageDark,
      colMid: cFoliageMid,
      colTip: cFoliageLit,
    });
  }

  // 7 outer velvety 3D crimson petals
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    addPlush3DRosePetal(positions, normals, colors, {
      cx: Math.cos(a) * 0.025,
      cy: 0.042,
      cz: Math.sin(a) * 0.025,
      yaw: a,
      pitch: 0.46,
      length: 0.135,
      width: 0.092,
      cupDepth: 0.028,
      ridgeHeight: 0.018,
      colBase: cOuter,
      colMid: cMid,
      colTip: cCup,
    });
  }

  // 6 mid cupped scarlet-crimson petals
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.28;
    addPlush3DRosePetal(positions, normals, colors, {
      cx: Math.cos(a) * 0.018,
      cy: 0.065,
      cz: Math.sin(a) * 0.018,
      yaw: a,
      pitch: 0.72,
      length: 0.105,
      width: 0.076,
      cupDepth: 0.026,
      ridgeHeight: 0.015,
      colBase: cMid,
      colMid: cCup,
      colTip: cCore,
    });
  }

  // 4 inner tight rose-heart bud petals
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.52;
    addPlush3DRosePetal(positions, normals, colors, {
      cx: 0,
      cy: 0.082,
      cz: 0,
      yaw: a,
      pitch: 1.02,
      length: 0.078,
      width: 0.056,
      cupDepth: 0.022,
      ridgeHeight: 0.012,
      colBase: cCup,
      colMid: cCore,
      colTip: cCore,
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function buildCrimsonPetalGeometry() {
  const positions = [];
  const normals = [];
  const colors = [];
  const cBase = new THREE.Color('#881327');
  const cMid = new THREE.Color('#e11d48');
  const cTip = new THREE.Color('#fb7185');

  addPlush3DRosePetal(positions, normals, colors, {
    cx: 0,
    cy: 0,
    cz: -0.045,
    yaw: 0,
    pitch: 0.22,
    length: 0.105,
    width: 0.078,
    cupDepth: 0.024,
    ridgeHeight: 0.015,
    colBase: cBase,
    colMid: cMid,
    colTip: cTip,
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

/**
 * Creates the diegetic 3D Crimson Rose Ring Timer (`r = 1.65m`, 24 Crimson Rose
 * clusters & 48 shedding crimson petals) around the speaker's feet.
 */
export function createCrimsonRoseRingTimer({
  scene = null,
  getGroundHeight = () => 0,
  radius = CRIMSON_ROSE_RING_RADIUS,
  roseCount = CRIMSON_ROSE_RING_COUNT,
  petalCount = CRIMSON_ROSE_PETAL_COUNT,
  maxSeconds = MAX_COMMUNE_SECONDS,
} = {}) {
  const group = new THREE.Group();
  group.name = 'communeCrimsonRoseRingGroup';
  group.visible = false;

  const roseGeo = buildRoseClusterGeometry();
  const petalGeo = buildCrimsonPetalGeometry();

  // Hardware-opaque cel-compatible material (Universal "Zero Glass" rule)
  const roseMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
  });

  const petalMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
  });

  const roseClustersMesh = new THREE.InstancedMesh(roseGeo, roseMat, roseCount);
  roseClustersMesh.name = 'communeCrimsonRoseClusters';
  roseClustersMesh.frustumCulled = false;

  const sheddingPetalsMesh = new THREE.InstancedMesh(petalGeo, petalMat, petalCount);
  sheddingPetalsMesh.name = 'communeSheddingCrimsonPetals';
  sheddingPetalsMesh.frustumCulled = false;

  group.add(roseClustersMesh);
  group.add(sheddingPetalsMesh);

  if (scene && typeof scene.add === 'function') {
    scene.add(group);
  }

  const dummy = new THREE.Object3D();
  let elapsed = 0;
  let remainingFraction = 1.0;
  let bloomingRoseCount = roseCount;
  let shedRoseCount = 0;
  let activeDriftingPetals = 0;
  const centerPos = { x: 0, y: 0, z: 0 };

  function updateLayout(currentElapsed, speakerPos = centerPos) {
    elapsed = clamp(Number(currentElapsed) || 0, 0, maxSeconds);
    remainingFraction = clamp(1.0 - elapsed / maxSeconds, 0.0, 1.0);
    const progress = 1.0 - remainingFraction; // 0.0 -> 1.0 over 30s

    if (speakerPos && typeof speakerPos.x === 'number') {
      centerPos.x = speakerPos.x;
      centerPos.z = speakerPos.z ?? 0;
      centerPos.y =
        typeof speakerPos.y === 'number'
          ? speakerPos.y
          : getGroundHeight(centerPos.x, centerPos.z);
    }

    let blooming = 0;
    let shed = 0;
    let driftingPetals = 0;

    // 1. Update 24 Crimson Rose clusters around the 1.65m ring
    for (let i = 0; i < roseCount; i++) {
      const fracIndex = i / roseCount;
      const angle = fracIndex * TAU;
      const rx = centerPos.x + Math.cos(angle) * radius;
      const rz = centerPos.z + Math.sin(angle) * radius;
      const ry = getGroundHeight(rx, rz);

      // Each rose i sheds as `progress` crosses `fracIndex`
      const shedWindow = 1.0 / roseCount;
      const localShed = clamp((progress - fracIndex) / shedWindow, 0.0, 1.0);

      if (localShed < 0.99) {
        blooming++;
      } else {
        shed++;
      }

      // Bloom-in over first 0.35s, then shrink head as petals shed into the wind
      const bloomIn = clamp(elapsed / 0.35, 0.2, 1.0);
      const scale = bloomIn * (1.0 - localShed * 0.78);
      const sway = Math.sin(elapsed * 2.4 + i * 0.7) * 0.08;

      dummy.position.set(rx, ry + 0.01, rz);
      dummy.rotation.set(sway, -angle + Math.PI * 0.5, sway * 0.5);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      roseClustersMesh.setMatrixAt(i, dummy.matrix);
    }
    roseClustersMesh.instanceMatrix.needsUpdate = true;

    // 2. Update 48 shedding crimson petals lifting into an upward spiral breeze
    for (let p = 0; p < petalCount; p++) {
      const parentRoseIdx = Math.floor(p / 2);
      const pairOffset = p & 1;
      const roseStartFrac = parentRoseIdx / roseCount;
      const petalAge = (progress - roseStartFrac) * maxSeconds - pairOffset * 0.22;

      const baseAngle = roseStartFrac * TAU + pairOffset * 0.14;
      if (petalAge <= 0) {
        // Resting inside its rose cup before shedding
        const rx = centerPos.x + Math.cos(baseAngle) * radius;
        const rz = centerPos.z + Math.sin(baseAngle) * radius;
        const ry = getGroundHeight(rx, rz) + 0.12;
        dummy.position.set(rx, ry, rz);
        dummy.rotation.set(0.3, baseAngle, 0.2);
        dummy.scale.set(0.001, 0.001, 0.001);
      } else {
        driftingPetals++;
        const flightFrac = clamp(petalAge / 4.5, 0.0, 1.0);
        const spiralAngle = baseAngle + flightFrac * 2.4 + pairOffset * 0.35;
        const spiralRadius =
          radius + flightFrac * 0.55 + Math.sin(petalAge * 3.1 + p) * 0.12;
        const px = centerPos.x + Math.cos(spiralAngle) * spiralRadius;
        const pz = centerPos.z + Math.sin(spiralAngle) * spiralRadius;
        const py =
          getGroundHeight(px, pz) +
          0.14 +
          flightFrac * 1.85 +
          Math.sin(petalAge * 4.2 + p) * 0.06;
        const petalScale =
          flightFrac < 0.85 ? 1.0 : Math.max(0.001, (1.0 - flightFrac) / 0.15);

        dummy.position.set(px, py, pz);
        dummy.rotation.set(
          petalAge * 2.8 + p,
          spiralAngle + petalAge * 1.9,
          petalAge * 2.1
        );
        dummy.scale.set(petalScale, petalScale, petalScale);
      }
      dummy.updateMatrix();
      sheddingPetalsMesh.setMatrixAt(p, dummy.matrix);
    }
    sheddingPetalsMesh.instanceMatrix.needsUpdate = true;

    bloomingRoseCount = blooming;
    shedRoseCount = shed;
    activeDriftingPetals = driftingPetals;
  }

  function start(speakerPos = { x: 0, y: 0, z: 0 }) {
    group.visible = true;
    updateLayout(0, speakerPos);
  }

  function update(dt, speakerPos) {
    if (!group.visible) return getVisualState();
    updateLayout(elapsed + Math.max(0, Number(dt) || 0), speakerPos);
    return getVisualState();
  }

  function setElapsed(nextElapsed, speakerPos) {
    updateLayout(nextElapsed, speakerPos);
    return getVisualState();
  }

  function stop() {
    group.visible = false;
  }

  function getVisualState() {
    return {
      visible: group.visible,
      elapsed,
      maxDuration: maxSeconds,
      remainingFraction,
      bloomingRoseCount,
      shedRoseCount,
      activeDriftingPetals,
      radius,
      totalRoses: roseCount,
      totalPetals: petalCount,
    };
  }

  function dispose() {
    group.visible = false;
    if (group.parent) {
      group.parent.remove(group);
    }
    roseGeo.dispose();
    petalGeo.dispose();
    roseMat.dispose();
    petalMat.dispose();
  }

  return {
    group,
    roseClustersMesh,
    sheddingPetalsMesh,
    start,
    update,
    setElapsed,
    stop,
    getVisualState,
    dispose,
  };
}

let sharedDivineAudioCtx = null;

function createCathedralImpulseBuffer(ctx, durationSec = 2.4, decay = 2.6) {
  const sampleRate = ctx.sampleRate || 48000;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * decay);
      // Deterministic velvet cathedral diffusion
      const seed = Math.sin((i + 1) * (ch === 0 ? 12.9898 : 78.233)) * 43758.5453;
      const noise = (seed - Math.floor(seed)) * 2.0 - 1.0;
      data[i] = noise * env * 0.35;
    }
  }
  return impulse;
}

const ARTORIOUS_CLIP_URLS = Object.freeze({
  smite_nameless: '/world/assets/audio/artorious/smite_nameless.wav',
  smite_silence: '/world/assets/audio/artorious/smite_silence.wav',
  smite_monotone: '/world/assets/audio/artorious/smite_monotone.wav',
  smite_rushed: '/world/assets/audio/artorious/smite_rushed.wav',
  smite_cringe: '/world/assets/audio/artorious/smite_cringe.wav',
  heal_gentle: '/world/assets/audio/artorious/heal_gentle.wav',
  bless_sweet: '/world/assets/audio/artorious/bless_sweet.wav',
  bless_chivalrous: '/world/assets/audio/artorious/bless_chivalrous.wav',
  bless_amused: '/world/assets/audio/artorious/bless_amused.wav',
  miracle_dramatic: '/world/assets/audio/artorious/miracle_dramatic.wav',
  miracle_heartfelt: '/world/assets/audio/artorious/miracle_heartfelt.wav',
  miracle_desperate: '/world/assets/audio/artorious/miracle_desperate.wav',
});

function waitForAudioElementToFinish(audioEl, maxSafetyTimeoutMs = 15000, onPreClimax = null) {
  return new Promise((resolve) => {
    if (!audioEl || typeof audioEl.addEventListener !== 'function') {
      resolve({ finished: true, reason: 'no_events', duration: 0 });
      return;
    }
    let settled = false;
    let safetyTimer = null;
    let preClimaxTimer = null;
    const done = (reason = 'ended') => {
      if (settled) return;
      settled = true;
      if (safetyTimer !== null) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      if (preClimaxTimer !== null) {
        clearTimeout(preClimaxTimer);
        preClimaxTimer = null;
      }
      audioEl.removeEventListener?.('ended', onEnded);
      audioEl.removeEventListener?.('error', onError);
      resolve({
        finished: true,
        reason,
        duration: Number.isFinite(Number(audioEl.duration)) ? Number(audioEl.duration) : 0,
      });
    };
    const onEnded = () => done('ended');
    const onError = () => done('error');

    audioEl.addEventListener('ended', onEnded, { once: true });
    audioEl.addEventListener('error', onError, { once: true });
    audioEl.addEventListener(
      'loadedmetadata',
      () => {
        const dur = Number(audioEl.duration);
        if (Number.isFinite(dur) && dur > 0) {
          if (safetyTimer !== null) clearTimeout(safetyTimer);
          safetyTimer = setTimeout(() => done('duration_timeout'), Math.ceil(dur * 1000) + 600);
          if (typeof onPreClimax === 'function' && dur > 1.8) {
            if (preClimaxTimer !== null) clearTimeout(preClimaxTimer);
            preClimaxTimer = setTimeout(() => {
              if (!settled) onPreClimax(dur);
            }, Math.max(200, Math.round((dur - 1.65) * 1000)));
          }
        }
      },
      { once: true }
    );

    safetyTimer = setTimeout(() => done('max_timeout'), maxSafetyTimeoutMs);

    try {
      const playPromise = audioEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => done('play_rejected'));
      }
    } catch {
      done('play_threw');
    }
  });
}

/**
 * Plays Artorious's rare voice clips through a WebAudio stereo widener
 * (phase-pure centered dry vocal + Haas `14ms` L/R early-reflection send into
 * open-air sanctuary impulse). Respects the Rare Speech Rule (`shouldSpeakAloud`) and
 * returns a `finished` Promise that resolves only after the voice clip ends
 * so gameplay verdict actions (`applyCommuneVerdict`) wait for His dialogue.
 */
export function playWideSurroundDivineVoice(verdictOrAudioUrl, options = {}) {
  const isObject = verdictOrAudioUrl && typeof verdictOrAudioUrl === 'object';
  const shouldSpeak = isObject
    ? verdictOrAudioUrl.shouldSpeakAloud !== false
    : true;
  const audioUrl = isObject
    ? verdictOrAudioUrl.audioUrl ||
      (verdictOrAudioUrl.clip_id ? ARTORIOUS_CLIP_URLS[verdictOrAudioUrl.clip_id] : null)
    : verdictOrAudioUrl;

  const stereoSpec = {
    haasDelayMs: 14,
    lowShelfHz: 185,
    lowShelfGainDb: 3.2,
    cathedralDecaySec: 2.4,
    stereoWidth: 0.88,
  };

  if (!shouldSpeak || !audioUrl) {
    return {
      played: false,
      reason: !shouldSpeak ? 'rare_speech_silent_decree' : 'no_audio_url',
      finished: Promise.resolve({ finished: true, played: false }),
      ...stereoSpec,
    };
  }

  const AudioCtx =
    options.AudioContextClass ||
    (typeof window !== 'undefined' &&
      (window.AudioContext || window.webkitAudioContext)) ||
    null;

  if (!AudioCtx || typeof Audio === 'undefined') {
    return {
      played: true,
      simulatedHeadless: true,
      audioUrl,
      finished: Promise.resolve({ finished: true, played: true, simulatedHeadless: true }),
      ...stereoSpec,
    };
  }

  try {
    if (!sharedDivineAudioCtx) {
      sharedDivineAudioCtx = new AudioCtx();
    }
    const ctx = sharedDivineAudioCtx;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }

    const audioEl = new Audio(audioUrl);
    audioEl.crossOrigin = 'anonymous';
    const source = ctx.createMediaElementSource(audioEl);

    // 1. Warmth Low-Shelf Filter (185 Hz, +3.2 dB)
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = stereoSpec.lowShelfHz;
    lowShelf.gain.value = stereoSpec.lowShelfGainDb;

    // 2. Stereo Early-Reflection Spread (0ms Left, 14ms Right micro-delay on WET send only —
    //    dry direct vocal stays 100% phase-pure at 0ms so "s"/"t" transients never comb-filter!)
    const delayLeft = ctx.createDelay(0.1);
    delayLeft.delayTime.value = 0.0;
    const delayRight = ctx.createDelay(0.1);
    delayRight.delayTime.value = stereoSpec.haasDelayMs / 1000;

    const merger = ctx.createChannelMerger(2);
    lowShelf.connect(delayLeft);
    lowShelf.connect(delayRight);
    delayLeft.connect(merger, 0, 0);
    delayRight.connect(merger, 0, 1);

    // 3. Open-Air Sanctuary Convolver (1.65s warm natural decay)
    const convolver = ctx.createConvolver();
    convolver.buffer = createCathedralImpulseBuffer(
      ctx,
      1.65,
      3.4
    );

    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.90;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.22;

    source.connect(lowShelf);
    lowShelf.connect(dryGain);
    merger.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(ctx.destination);
    wetGain.connect(ctx.destination);

    const finished = waitForAudioElementToFinish(audioEl, 15000, options.onPreClimax);

    return {
      played: true,
      audioUrl,
      audioElement: audioEl,
      finished,
      ...stereoSpec,
    };
  } catch {
    let finished = Promise.resolve({ finished: true, fallbackAudio: true });
    try {
      if (typeof Audio !== 'undefined') {
        const fbAudio = new Audio(audioUrl);
        fbAudio.volume = 0.92;
        finished = waitForAudioElementToFinish(fbAudio);
      }
    } catch {
      // ignore fallback audio error
    }
    return {
      played: true,
      fallbackAudio: true,
      audioUrl,
      finished,
      ...stereoSpec,
    };
  }
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    if (!blob || blob.size === 0 || typeof FileReader === 'undefined') {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

/**
 * Creates the 30-second Hybrid Hold / Tap-Tap + Silence Auto-Send `Commune`
 * Client with `< 2` Words Safe Cancel State Machine, Diegetic Crimson Rose Ring
 * Timer, immediate `track.stop()` microphone release, single-ceremony lock, and
 * wide surround-sound divine voice playback.
 */
export function createCommuneClient({
  scene = null,
  getGroundHeight = () => 0,
  coopClient = null,
  endpoint = '/api/commune',
  getContextState = null,
  onStateChange = null,
  onVerdict = null,
  onCancel = null,
  useWallClockTimeout = true,
  mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : null,
  MediaRecorderClass = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  AudioContextClass = null,
} = {}) {
  const roseRingTimer = createCrimsonRoseRingTimer({
    scene,
    getGroundHeight,
    radius: CRIMSON_ROSE_RING_RADIUS,
    roseCount: CRIMSON_ROSE_RING_COUNT,
    petalCount: CRIMSON_ROSE_PETAL_COUNT,
    maxSeconds: MAX_COMMUNE_SECONDS,
  });

  let state = 'idle'; // 'idle' | 'listening' | 'judging'
  let inputMode = 'hold_check'; // 'hold_check' | 'hands_free'
  let pressHeld = false;
  let voicedSeconds = 0;
  let silenceAfterSpeechSeconds = 0;
  let hasSpokenWords = false;
  let explicitWordCount = null;
  let lastOptions = {};

  let elapsed = 0;
  let activeStream = null;
  let activeRecorder = null;
  let recordedChunks = [];
  let recordedMimeType = 'audio/webm';
  let autoSendTimeoutId = null;
  let partnerCommuning = false;
  let partnerSpeakerRole = null;
  let micTracksStoppedCount = 0;
  let currentSpeakerPos = { x: 0, y: 0, z: 0 };
  let pendingTranscriptHint = '';
  let pendingAudioBase64 = '';
  let sessionSeq = 0;

  let micAudioCtx = null;
  let micSourceNode = null;
  let micAnalyserNode = null;
  let micRmsBuffer = null;

  let onStateChangeHandler = onStateChange;
  let onVerdictHandler = onVerdict;
  let onCancelHandler = onCancel;

  function emitState(extra = {}) {
    onStateChangeHandler?.({
      state,
      inputMode,
      pressHeld,
      voicedSeconds,
      spokenDurationSeconds: voicedSeconds,
      silenceAfterSpeechSeconds,
      hasSpokenWords,
      elapsed,
      maxDuration: MAX_COMMUNE_SECONDS,
      remainingSeconds: Math.max(0, MAX_COMMUNE_SECONDS - elapsed),
      remainingFraction: clamp(1.0 - elapsed / MAX_COMMUNE_SECONDS, 0, 1),
      partnerCommuning,
      partnerSpeakerRole,
      timerVisuals: roseRingTimer.getVisualState(),
      ...extra,
    });
  }

  function disconnectMicAnalyser() {
    if (micSourceNode) {
      try {
        micSourceNode.disconnect?.();
      } catch {
        // ignore
      }
      micSourceNode = null;
    }
    if (micAnalyserNode) {
      try {
        micAnalyserNode.disconnect?.();
      } catch {
        // ignore
      }
      micAnalyserNode = null;
    }
    micRmsBuffer = null;
  }

  function attachMicAnalyser(stream) {
    disconnectMicAnalyser();
    if (!stream) return;
    const hasAudio =
      typeof stream.getAudioTracks === 'function'
        ? stream.getAudioTracks().length > 0
        : typeof stream.getTracks === 'function'
          ? stream.getTracks().length > 0
          : false;
    if (!hasAudio) return;

    const AudioCtx =
      AudioContextClass ||
      (typeof window !== 'undefined' &&
        (window.AudioContext || window.webkitAudioContext)) ||
      null;
    if (!AudioCtx) return;

    try {
      if (!micAudioCtx) {
        micAudioCtx = new AudioCtx();
      }
      if (micAudioCtx.state === 'suspended' && typeof micAudioCtx.resume === 'function') {
        micAudioCtx.resume().catch(() => {});
      }
      const source = micAudioCtx.createMediaStreamSource(stream);
      const analyser = micAudioCtx.createAnalyser();
      analyser.fftSize = analyser.fftSize || 256;
      source.connect(analyser);
      micSourceNode = source;
      micAnalyserNode = analyser;
      micRmsBuffer = new Float32Array(analyser.fftSize || 256);
    } catch {
      disconnectMicAnalyser();
    }
  }

  function sampleLiveMicRms() {
    if (!micAnalyserNode || !activeStream) return null;
    try {
      if (typeof micAnalyserNode.getFloatTimeDomainData === 'function') {
        if (!micRmsBuffer || micRmsBuffer.length !== (micAnalyserNode.fftSize || 256)) {
          micRmsBuffer = new Float32Array(micAnalyserNode.fftSize || 256);
        }
        micAnalyserNode.getFloatTimeDomainData(micRmsBuffer);
        let sumSq = 0;
        for (let i = 0; i < micRmsBuffer.length; i++) {
          const s = Number(micRmsBuffer[i]) || 0;
          sumSq += s * s;
        }
        return Math.sqrt(sumSq / Math.max(1, micRmsBuffer.length));
      }
      if (typeof micAnalyserNode.getByteTimeDomainData === 'function') {
        const len = micAnalyserNode.fftSize || 256;
        const byteBuf = new Uint8Array(len);
        micAnalyserNode.getByteTimeDomainData(byteBuf);
        let sumSq = 0;
        for (let i = 0; i < len; i++) {
          const s = (byteBuf[i] - 128) / 128;
          sumSq += s * s;
        }
        return Math.sqrt(sumSq / Math.max(1, len));
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Immediately stops every `MediaStreamTrack` on the active microphone stream
   * BEFORE network I/O so Bluetooth headsets never remain stuck in call mode.
   */
  function stopAllMicTracksImmediately() {
    if (autoSendTimeoutId !== null) {
      clearTimeout(autoSendTimeoutId);
      autoSendTimeoutId = null;
    }
    disconnectMicAnalyser();
    if (activeStream) {
      const stream = activeStream;
      activeStream = null;
      try {
        const tracks = typeof stream.getTracks === 'function' ? stream.getTracks() : [];
        for (const track of tracks) {
          if (track && typeof track.stop === 'function') {
            track.stop();
            micTracksStoppedCount++;
          }
        }
      } catch {
        // ignore track stop error
      }
    }
  }

  function hasActiveMicTracks() {
    if (!activeStream || typeof activeStream.getTracks !== 'function') return false;
    return activeStream.getTracks().some((t) => t.readyState !== 'ended');
  }

  async function startCommune(options = {}) {
    if (partnerCommuning) {
      emitState({ reason: 'commune_busy', activeSpeakerRole: partnerSpeakerRole });
      return { ok: false, started: false, error: 'commune_busy' };
    }
    if (state !== 'idle') {
      return { ok: false, started: false, error: `already_${state}` };
    }

    const mySeq = ++sessionSeq;
    lastOptions = { ...options };
    state = 'listening';
    inputMode = options.inputMode || 'hold_check';
    pressHeld = Boolean(options.pressHeld);
    voicedSeconds = 0;
    silenceAfterSpeechSeconds = 0;
    hasSpokenWords = false;
    explicitWordCount = typeof options.wordCount === 'number' ? options.wordCount : null;
    elapsed = 0;
    recordedChunks = [];
    pendingTranscriptHint = options.transcriptHint ?? '';
    pendingAudioBase64 = options.audioBase64 ?? '';

    if (options.speakerPos) {
      currentSpeakerPos = { ...options.speakerPos };
    }

    // Start the diegetic 3D Crimson Rose Ring Timer (r = 1.65m, 24 roses, 48 petals)
    roseRingTimer.start(currentSpeakerPos);

    // Notify partner of non-spoiler channel state only (zero audio / transcript)
    const speakerRole = options.speakerRole || coopClient?.getState?.()?.role || 'Knight';
    coopClient?.sendCommuneState?.({
      state: 'channel',
      speakerRole,
    });

    emitState({ speakerRole });

    // Schedule 30.0s max auto-send timer
    const enableTimeout =
      options.useWallClockTimeout !== undefined
        ? options.useWallClockTimeout !== false
        : useWallClockTimeout !== false;
    if (enableTimeout) {
      autoSendTimeoutId = setTimeout(() => {
        if (state === 'listening' && sessionSeq === mySeq) {
          stopAndSendCommune({ autoTriggeredByTimeout: true });
        }
      }, MAX_COMMUNE_SECONDS * 1000);
    }

    // Acquire microphone if available
    if (mediaDevices && typeof mediaDevices.getUserMedia === 'function') {
      try {
        const constraints = options.deviceId
          ? {
              audio: {
                deviceId: { exact: options.deviceId },
                echoCancellation: true,
                noiseSuppression: true,
              },
            }
          : { audio: { echoCancellation: true, noiseSuppression: true } };

        const stream = await mediaDevices.getUserMedia(constraints);
        // If user already tapped to stop or cancelled before getUserMedia resolved,
        // stop every track immediately!
        if (state !== 'listening' || sessionSeq !== mySeq) {
          const tracks = typeof stream.getTracks === 'function' ? stream.getTracks() : [];
          for (const t of tracks) {
            t.stop();
            micTracksStoppedCount++;
          }
          return { ok: true, started: true };
        }

        activeStream = stream;
        attachMicAnalyser(stream);

        if (MediaRecorderClass) {
          const recorder = new MediaRecorderClass(stream);
          activeRecorder = recorder;
          if (typeof recorder.addEventListener === 'function') {
            recorder.addEventListener('dataavailable', (ev) => {
              if (ev?.data && ev.data.size > 0) {
                recordedChunks.push(ev.data);
              }
            });
          } else {
            recorder.ondataavailable = (ev) => {
              if (ev?.data && ev.data.size > 0) {
                recordedChunks.push(ev.data);
              }
            };
          }
          recorder.start(120);
        }
      } catch {
        stopAllMicTracksImmediately();
      }
    }

    return { ok: true, started: true, maxDuration: MAX_COMMUNE_SECONDS };
  }

  function cancelCommune(cancelOpts = {}) {
    const reason = cancelOpts?.reason || 'cancelled';
    const ctxState = (typeof getContextState === 'function' ? getContextState() : null) || {};
    const speakerRole =
      cancelOpts?.speakerRole ||
      lastOptions?.speakerRole ||
      ctxState.speakerRole ||
      coopClient?.getState?.()?.role ||
      'Knight';

    sessionSeq++;
    stopAllMicTracksImmediately();
    if (activeRecorder && activeRecorder.state !== 'inactive') {
      try {
        activeRecorder.stop();
      } catch {
        // ignore
      }
    }
    activeRecorder = null;
    recordedChunks = [];
    pendingTranscriptHint = '';
    pendingAudioBase64 = '';
    pressHeld = false;
    inputMode = 'hold_check';
    voicedSeconds = 0;
    silenceAfterSpeechSeconds = 0;
    hasSpokenWords = false;
    explicitWordCount = null;
    roseRingTimer.stop();
    state = 'idle';
    elapsed = 0;
    coopClient?.sendCommuneState?.({
      state: 'cancel',
      reason,
      speakerRole,
    });
    const cancelPayload = {
      cancelled: true,
      reason,
      speakerRole,
      ...(cancelOpts?.transcript !== undefined ? { transcript: cancelOpts.transcript } : {}),
    };
    emitState(cancelPayload);
    if (cancelOpts?.notifyCancel !== false) {
      onCancelHandler?.(cancelPayload);
    }
    return {
      ok: false,
      sent: false,
      ...cancelPayload,
    };
  }

  async function stopAndSendCommune(options = {}) {
    if (state !== 'listening') {
      return { ok: false, sent: false, error: 'not_listening' };
    }

    const ctxState = (typeof getContextState === 'function' ? getContextState() : null) || {};
    const speakerRole =
      options.speakerRole ||
      lastOptions?.speakerRole ||
      ctxState.speakerRole ||
      coopClient?.getState?.()?.role ||
      'Knight';
    const partnerRole =
      options.partnerRole ||
      lastOptions?.partnerRole ||
      ctxState.partnerRole ||
      (speakerRole === 'Knight' ? 'Mage' : 'Knight');
    const room =
      options.room ||
      lastOptions?.room ||
      ctxState.room ||
      coopClient?.getRoomCode?.() ||
      'LOVE';

    // Stop MediaRecorder if active before evaluating recordedChunks
    const recorder = activeRecorder;
    activeRecorder = null;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        if (typeof recorder.addEventListener === 'function') {
          recorder.addEventListener('stop', finish, { once: true });
        } else {
          recorder.onstop = finish;
        }
        try {
          recorder.stop();
        } catch {
          finish();
        }
        setTimeout(finish, 50);
      });
    }

    // IMMEDIATELY release all microphone tracks BEFORE any network I/O!
    stopAllMicTracksImmediately();

    const hasExplicitTranscript =
      options.transcriptHint !== undefined ||
      (typeof pendingTranscriptHint === 'string' && pendingTranscriptHint.length > 0);
    const transcriptHint = String(
      options.transcriptHint !== undefined ? options.transcriptHint : pendingTranscriptHint || ''
    );
    const audioBase64Override = options.audioBase64 ?? pendingAudioBase64 ?? '';
    const forceVerdict = Boolean(options.forceVerdict || lastOptions?.forceVerdict);

    if (typeof options.wordCount === 'number') {
      explicitWordCount = options.wordCount;
    }

    // Accidental Empty Tap Safe-Cancel Rule (< 2 words = Zero Smite):
    // 1. Explicit transcriptHint has < 2 words (or explicit wordCount < 2), OR
    // 2. No transcriptHint / audioBase64 override passed and !hasSpokenWords && recordedChunks.length === 0
    const hintWords = countSpokenWords(transcriptHint);
    const tooFewWordsExplicit =
      (hasExplicitTranscript && hintWords < MIN_SAFE_WORD_COUNT) ||
      (explicitWordCount !== null && explicitWordCount < MIN_SAFE_WORD_COUNT);
    const emptySilentCapture =
      !hasExplicitTranscript &&
      !audioBase64Override &&
      !hasSpokenWords &&
      recordedChunks.length === 0;

    if (!forceVerdict && (tooFewWordsExplicit || emptySilentCapture)) {
      return cancelCommune({
        reason: 'empty_or_accidental_tap',
        speakerRole,
        ...(hasExplicitTranscript ? { transcript: transcriptHint } : {}),
      });
    }

    state = 'judging';
    pressHeld = false;
    roseRingTimer.stop();

    emitState({
      speakerRole,
      autoTriggeredByTimeout: Boolean(options.autoTriggeredByTimeout),
      autoTriggeredBySilence: Boolean(options.autoTriggeredBySilence),
    });

    let audioBase64 = audioBase64Override;
    if (!audioBase64 && recordedChunks.length > 0 && typeof Blob !== 'undefined') {
      const blob = new Blob(recordedChunks, { type: recordedMimeType });
      audioBase64 = await blobToBase64(blob);
    }
    recordedChunks = [];
    pendingTranscriptHint = '';
    pendingAudioBase64 = '';

    const payload = {
      room,
      speakerRole,
      partnerRole,
      audioBase64,
      mimeType: recordedMimeType,
      transcriptHint,
      gameState: options.gameState || lastOptions?.gameState || ctxState.gameState || {},
      progressionState:
        options.progressionState || lastOptions?.progressionState || ctxState.progressionState || {},
    };

    try {
      let verdictPacket = null;
      if (fetchImpl) {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        verdictPacket = await res.json();
      } else {
        verdictPacket = {
          ok: true,
          verdict: 'blessing',
          hpDelta: 60,
          shouldSpeakAloud: false,
          audioUrl: null,
        };
      }

      const judgment = verdictPacket?.judgment || verdictPacket;
      const responseTranscript =
        typeof judgment?.transcript === 'string'
          ? judgment.transcript
          : typeof verdictPacket?.transcript === 'string'
            ? verdictPacket.transcript
            : null;
      const isServerSafeCancel =
        Boolean(verdictPacket?.safeCancel || judgment?.safeCancel) ||
        (typeof responseTranscript === 'string' &&
          countSpokenWords(responseTranscript) < MIN_SAFE_WORD_COUNT &&
          !forceVerdict);

      if (isServerSafeCancel) {
        return cancelCommune({
          reason: 'empty_or_accidental_tap',
          speakerRole,
          transcript: responseTranscript ?? '',
        });
      }

      const voicePlayback = playWideSurroundDivineVoice(judgment, {
        AudioContextClass,
        onPreClimax: () => {
          if (state === 'speaking') {
            emitState({ judgment, voicePlayback, speaking: true, preClimax: true });
          }
        },
      });

      if (voicePlayback?.played && !voicePlayback?.simulatedHeadless && voicePlayback?.finished) {
        state = 'speaking';
        emitState({ judgment, voicePlayback, speaking: true });
        await voicePlayback.finished;
        if (state !== 'speaking') {
          return {
            ok: false,
            sent: false,
            cancelledDuringSpeech: true,
            judgment,
            voicePlayback,
          };
        }
      }

      state = 'idle';
      elapsed = 0;
      inputMode = 'hold_check';
      pressHeld = false;
      coopClient?.sendCommuneState?.({
        state: 'idle',
        speakerRole,
      });
      emitState({ judgment, voicePlayback });
      onVerdictHandler?.(judgment, voicePlayback);

      return {
        ok: true,
        sent: true,
        judgment,
        voicePlayback,
      };
    } catch (err) {
      state = 'idle';
      elapsed = 0;
      inputMode = 'hold_check';
      pressHeld = false;
      coopClient?.sendCommuneState?.({
        state: 'idle',
        speakerRole,
      });
      emitState({ error: String(err?.message || err) });
      return {
        ok: false,
        sent: false,
        error: String(err?.message || err),
      };
    }
  }

  async function stopAndSendOrCancel(options = {}) {
    return stopAndSendCommune(options);
  }

  /**
   * Smart Hybrid Input Start (`beginPress`):
   * - If `state === 'idle'`, starts listening in `hold_check` mode with `pressHeld = true`.
   * - If already `state === 'listening'` in `hands_free` mode (second tap), immediately
   *   calls `stopAndSendOrCancel(options)`.
   */
  async function beginPress(options = {}) {
    if (state === 'idle') {
      const res = await startCommune({
        ...options,
        inputMode: 'hold_check',
        pressHeld: true,
      });
      inputMode = 'hold_check';
      pressHeld = true;
      voicedSeconds = 0;
      silenceAfterSpeechSeconds = 0;
      hasSpokenWords = false;
      return res;
    }
    if (state === 'listening') {
      if (inputMode === 'hands_free' || !pressHeld) {
        return stopAndSendOrCancel(options);
      }
      return { ok: true, state, inputMode, pressHeld };
    }
    return { ok: false, state, error: 'commune_judging_in_progress' };
  }

  /**
   * Smart Hybrid Input Release (`endPress`):
   * - If held `>= 1.5s` (`HOLD_SEND_THRESHOLD_SECONDS`), immediately calls `stopAndSendOrCancel(options)`.
   * - If tapped `< 1.5s`, switches `inputMode = 'hands_free'` and stays in `'listening'` mode
   *   until a second tap or `2.2s` of silence after speaking.
   */
  async function endPress(options = {}) {
    if (state !== 'listening' || !pressHeld) {
      return { ok: false, state };
    }
    pressHeld = false;
    if (elapsed >= HOLD_SEND_THRESHOLD_SECONDS) {
      return stopAndSendOrCancel(options);
    }
    inputMode = 'hands_free';
    emitState({ inputMode });
    return {
      ok: true,
      state,
      inputMode,
      elapsed,
    };
  }

  /**
   * Updates Voice Activity Detection (`voicedSeconds`, `silenceAfterSpeechSeconds`, `hasSpokenWords`).
   * In `hands_free` mode, auto-triggers `stopAndSendOrCancel()` after `2.2s` of post-speech silence.
   */
  function reportVoiceActivity({
    rms = 0,
    dt = 0,
    wordCount = null,
    transcriptHint = null,
  } = {}) {
    if (typeof transcriptHint === 'string') {
      pendingTranscriptHint = transcriptHint;
    }
    if (typeof wordCount === 'number') {
      explicitWordCount = wordCount;
      if (wordCount >= MIN_SAFE_WORD_COUNT) {
        hasSpokenWords = true;
      }
    }

    const cleanRms = Math.max(0, Number(rms) || 0);
    const step = Math.max(0, Number(dt) || 0);

    if (cleanRms >= 0.025) {
      voicedSeconds += step;
      silenceAfterSpeechSeconds = 0;
      if (voicedSeconds >= MIN_VOICED_SECONDS) {
        hasSpokenWords = true;
      }
    } else if (hasSpokenWords) {
      silenceAfterSpeechSeconds += step;
    }

    if (
      state === 'listening' &&
      inputMode === 'hands_free' &&
      hasSpokenWords &&
      silenceAfterSpeechSeconds >= SILENCE_AUTO_SEND_SECONDS
    ) {
      stopAndSendOrCancel({ autoTriggeredBySilence: true });
    }

    return {
      state,
      inputMode,
      voicedSeconds,
      spokenDurationSeconds: voicedSeconds,
      silenceAfterSpeechSeconds,
      hasSpokenWords,
    };
  }

  /**
   * Tap `Commune` once to start speaking (`state: 'listening'`), tap a second
   * time to immediately stop and send (`state: 'judging' -> 'idle'`).
   */
  async function tapCommune(options = {}) {
    if (state === 'idle') {
      const res = await startCommune({
        ...options,
        inputMode: 'hands_free',
        pressHeld: false,
      });
      inputMode = 'hands_free';
      pressHeld = false;
      return res;
    }
    if (state === 'listening') {
      return stopAndSendOrCancel(options);
    }
    return { ok: false, error: 'commune_judging_in_progress' };
  }

  function update(dt, speakerPos) {
    if (speakerPos) {
      currentSpeakerPos = { ...speakerPos };
    }
    if (state !== 'listening') {
      return roseRingTimer.getVisualState();
    }
    const step = Math.max(0, Number(dt) || 0);
    elapsed = Math.min(MAX_COMMUNE_SECONDS, elapsed + step);
    const visuals = roseRingTimer.setElapsed(elapsed, currentSpeakerPos);

    // Wire live WebAudio AnalyserNode RMS sampling whenever activeStream has live audio tracks
    const liveRms = sampleLiveMicRms();
    if (liveRms !== null) {
      reportVoiceActivity({ rms: liveRms, dt: step });
    }

    if (state === 'listening' && elapsed >= MAX_COMMUNE_SECONDS) {
      stopAndSendOrCancel({ autoTriggeredByTimeout: true });
    }
    return visuals;
  }

  function setPartnerCommuneState(msg = {}) {
    const remoteState = String(msg.state || '').toLowerCase();
    if (remoteState === 'channel' || remoteState === 'listening') {
      partnerCommuning = true;
      partnerSpeakerRole = msg.speakerRole || msg.fromRole || 'Mage';
    } else if (remoteState === 'idle' || remoteState === 'complete' || remoteState === 'cancel') {
      partnerCommuning = false;
      partnerSpeakerRole = null;
    }
    emitState();
  }

  function getState() {
    return {
      state,
      inputMode,
      pressHeld,
      voicedSeconds,
      spokenDurationSeconds: voicedSeconds,
      silenceAfterSpeechSeconds,
      hasSpokenWords,
      elapsed,
      maxDuration: MAX_COMMUNE_SECONDS,
      remainingSeconds: Math.max(0, MAX_COMMUNE_SECONDS - elapsed),
      remainingFraction: clamp(1.0 - elapsed / MAX_COMMUNE_SECONDS, 0, 1),
      partnerCommuning,
      partnerSpeakerRole,
      micTracksStoppedCount,
      hasActiveMicTracks: hasActiveMicTracks(),
      timerVisuals: roseRingTimer.getVisualState(),
    };
  }

  function dispose() {
    cancelCommune({ notifyCancel: false });
    roseRingTimer.dispose();
  }

  return {
    beginPress,
    endPress,
    reportVoiceActivity,
    stopAndSendOrCancel,
    tapCommune,
    toggleCommune: tapCommune,
    startCommune,
    stopAndSendCommune,
    cancelCommune,
    stopAllMicTracksImmediately,
    hasActiveMicTracks,
    update,
    setPartnerCommuneState,
    getState,
    getTimerVisualState: () => roseRingTimer.getVisualState(),
    roseRingTimer,
    dispose,
    get onCancel() {
      return onCancelHandler;
    },
    set onCancel(fn) {
      onCancelHandler = fn;
    },
    get onVerdict() {
      return onVerdictHandler;
    },
    set onVerdict(fn) {
      onVerdictHandler = fn;
    },
    get onStateChange() {
      return onStateChangeHandler;
    },
    set onStateChange(fn) {
      onStateChangeHandler = fn;
    },
  };
}
