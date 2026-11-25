// ============================================================================
// world/src/main.js
//
// Stage 5 Assembled World & Live Co-Op Action RPG:
// - Terrain, Water & Landmarks + Tudor Village Houses + Toroidal Gouache Meadow
// - Stylized Time-of-Day Sky (Sun, Moon & Stars) + 4x MSAA HDR Post-Processing
// - Stage 3–5 Co-Op Heroes (Knight & Mage), Pooled Skeleton Waves & Boss Sovereign
// - Complete Stage 4 Opaque VFX & *Demon Slayer* Sword Breathing Suite
// - Hybrid PointerLock + Drag-Orbit PC Controls & Xiaomi Pad 7 (3:2) Touch HUD
// - Cloudflare / Local WebSocket 2-Player Co-Op Room Pairing (`?room=LOVE`)
// - Sanctuary Lobby, Plaza Inscribed Stele Riddle (`GET /api/altar`), and
//   Hold-to-Commune Voice Prayer Flow (`POST /api/commune`)
// ============================================================================

import * as THREE from 'three';

let PLAY_BOUNDARY_RADIUS = 165;
let INNER_EXTENT = 300;
let ZONES = { plaza: { x: 0, z: 0, radius: 30 }, arena: { x: 74, z: -2, radius: 18 }, shrine: { x: 0, z: -86, radius: 18 } };
let BUILDINGS = [];
let INSCRIPTION_STONES = [];
let walkableHeightAt = () => 0;
let terrainHeightAt = () => 0;
let sampleWorld = () => ({ foliageMask: 0 });

let evalVerdictSky = () => ({ active: false, weight: 0, front: 0, clear: 0, compression: 0, windTimeScale: 1, monochrome: 0 });
let evalChannelSky = evalVerdictSky;
let evalChannelReleaseSky = evalVerdictSky;
let evalSmiteSky = evalVerdictSky;
let evalBlessingSky = evalVerdictSky;
let idleVerdictSky = () => ({ active: false, weight: 0, front: 0, clear: 0, compression: 0, windTimeScale: 1, monochrome: 0 });
let VERDICT_SKY_TAILS = {};

let createAppFlow = null;
let FLOW_STEPS = {
  TITLE: 'title',
  LOADING: 'loading',
  CREATE_JOIN: 'create_join',
  FLOWER_LOBBY: 'flower_lobby',
  IN_GAME: 'in_game',
};
let getOpeningCameraPose = (step) => ({
  mode: step === 'flower_lobby' ? 'lobby' : 'vista',
  pos: [0, 4.5, 136.5],
  target: [0, 5.0, 24.0],
  fov: 50,
});

let UNSPOILED_SACRED_POEM_BY_STONE_ID = null;
let SPELL_BY_SLOT = {};

const TOD_PRESETS = Object.freeze({
  midnight: { t: 0.0 },
  dawn: { t: 0.2 },
  day: { t: 0.34 },
  afternoon: { t: 0.54 },
  evening: { t: 0.76 },
  twilight: { t: 0.84 },
  night: { t: 0.96 },
});

if (typeof document !== 'undefined') {
  let legacyHideStyle = document.getElementById('amarante-legacy-hud-cleanup');
  if (!legacyHideStyle) {
    legacyHideStyle = document.createElement('style');
    legacyHideStyle.id = 'amarante-legacy-hud-cleanup';
    legacyHideStyle.textContent = `
      body.sculpted-hud-mounted #top-bar {
        display: flex !important;
      }
      body.sculpted-hud-mounted #top-bar .top-col-left,
      body.sculpted-hud-mounted #party-status-card,
      body.sculpted-hud-mounted #coop-room-pill,
      body.sculpted-hud-mounted #act-objective-pill,
      body.sculpted-hud-mounted #bottom-bar,
      body.sculpted-hud-mounted #stele-interact-prompt,
      body.sculpted-hud-mounted #altar-stele-modal,
      body.sculpted-hud-mounted #sanctuary-lobby {
        display: none !important;
      }
      body.sculpted-hud-mounted #boss-hud-bar.visible {
        display: flex !important;
      }
      body.sculpted-hud-mounted #combat-banner.visible {
        display: inline-flex !important;
      }
    `;
    document.head.appendChild(legacyHideStyle);
  }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function shortestAngleDiff(target, current) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------------- */
/* Renderer, Scene & Camera Setup                                            */
/* ------------------------------------------------------------------------- */

const canvas = document.getElementById('world-canvas');
let renderer = null;

const PROFILES = {
  desktop: {
    id: 'desktop',
    label: 'Desktop (RX 6700)',
    dpr: 1.0,
    aaSamples: 4,
    meadowProfile: 'desktop',
    maxGrassTufts: 34000,
  },
  tablet: {
    id: 'tablet',
    label: 'Tablet (Xiaomi Pad 7)',
    dpr:
      typeof window !== 'undefined'
        ? Math.min(Math.max(window.devicePixelRatio || 1, 1.25), 1.35)
        : 1.35,
    aaSamples: 0,
    meadowProfile: 'tablet',
    maxGrassTufts: 6800,
  },
};

function detectInitialDeviceProfile() {
  if (typeof window === 'undefined') return 'desktop';
  const params = new URLSearchParams(window.location?.search || '');
  const explicit = params.get('profile');
  if (explicit === 'tablet' || explicit === 'desktop') return explicit;
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
  const hasCoarsePrimary = Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
  const hasFinePrimary = Boolean(window.matchMedia?.('(pointer: fine)')?.matches);
  const hasTouchInput =
    typeof navigator !== 'undefined' &&
    ((navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window);
  const isTouchTablet =
    isMobileUa ||
    hasCoarsePrimary ||
    (hasTouchInput && !hasFinePrimary && window.innerWidth <= 1920);
  return isTouchTablet ? 'tablet' : 'desktop';
}

let activeProfile = detectInitialDeviceProfile();
if (typeof window !== 'undefined') {
  const onFirstTouchAutoSwitch = () => {
    const params = new URLSearchParams(window.location?.search || '');
    if (params.get('profile') !== 'desktop' && activeProfile !== 'tablet') {
      setProfile('tablet');
    }
    window.removeEventListener('touchstart', onFirstTouchAutoSwitch);
  };
  window.addEventListener('touchstart', onFirstTouchAutoSwitch, { passive: true });
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8eef5);
scene.fog = new THREE.Fog(0xd8eef5, 340, 880);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.2,
  900
);

/* ------------------------------------------------------------------------- */
/* Non-Blocking Frame-Budget Slicer & Early Opening Flow Curtain             */
/* ------------------------------------------------------------------------- */

const isFastBoot =
  typeof window !== 'undefined' &&
  (Boolean(window.__vt) || Boolean(window.__SKIP_BOOT_SPLASH__));
const BOOT_SLICE_BUDGET_MS = isFastBoot ? 14.0 : 11.5;

if (typeof window !== 'undefined' && window.__WORLD_VISUAL_READY__ === undefined) {
  window.__WORLD_VISUAL_READY__ = false;
}

let lastBootHeartbeatRafAt = Date.now();
if (!isFastBoot && typeof requestAnimationFrame === 'function') {
  const bootHeartbeat = () => {
    lastBootHeartbeatRafAt = Date.now();
    if (typeof window !== 'undefined' && window.__WORLD_VISUAL_READY__ === false) {
      requestAnimationFrame(bootHeartbeat);
    }
  };
  requestAnimationFrame(bootHeartbeat);
}

const yieldBootSlice = () => {
  if (
    !isFastBoot &&
    typeof requestAnimationFrame === 'function' &&
    Date.now() - lastBootHeartbeatRafAt >= 13
  ) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      requestAnimationFrame(finish);
      setTimeout(finish, 30);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
};

function createBootSlicer(budgetMs = BOOT_SLICE_BUDGET_MS) {
  let sliceStart = Date.now();
  return {
    sliceBudgetMs: budgetMs,
    yieldFrame: yieldBootSlice,
    async maybeYield() {
      if (Date.now() - sliceStart >= budgetMs) {
        await yieldBootSlice();
        sliceStart = Date.now();
      }
    },
    async yieldNow() {
      await yieldBootSlice();
      sliceStart = Date.now();
    },
    reset() {
      sliceStart = Date.now();
    },
  };
}

const bootSlicer = createBootSlicer();

let sky = null;
let terrainKit = null;
const landmarkEmissiveMats = [];
let housesKit = null;
let setHouseCutoutPlayerPos = () => {};
let village = null;
let meadow = null;
let buildMeadowForProfile = () => {};
let stoneDecals = null;
let post = null;
let coopSystem = null;
let player = null;
let STAGE5_GAMEPLAY_SHOTS = null;
let playWideSurroundDivineVoice = () => null;
let damageNumbers = null;
let touchHud = null;
let sculptedHud = null;
let appFlow = null;
let communeClient = null;
let devStageOverride = null;

async function indexLosslessGeometryAsync(geo, slicer) {
  if (!geo || geo.index || !geo.attributes?.position) return geo;
  const pos = geo.attributes.position;
  const vCount = pos.count;
  if (vCount < 6 || vCount % 3 !== 0) return geo;

  const norm = geo.attributes.normal || null;
  const uv = geo.attributes.uv || null;
  const col = geo.attributes.color || null;
  const extraAttrs = [];
  for (const k of Object.keys(geo.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') {
      if (geo.attributes[k]) extraAttrs.push(geo.attributes[k]);
    }
  }

  const buckets = new Map();
  const indices = new Uint32Array(vCount);
  const keepIndices = new Int32Array(vCount);
  const outIdxOfSrc = new Int32Array(vCount);
  let uniqueCount = 0;

  const sameVert = (a, b) => {
    if (
      Math.round(pos.getX(a) * 500) !== Math.round(pos.getX(b) * 500) ||
      Math.round(pos.getY(a) * 500) !== Math.round(pos.getY(b) * 500) ||
      Math.round(pos.getZ(a) * 500) !== Math.round(pos.getZ(b) * 500)
    ) {
      return false;
    }
    if (
      norm &&
      (Math.round(norm.getX(a) * 100) !== Math.round(norm.getX(b) * 100) ||
        Math.round(norm.getY(a) * 100) !== Math.round(norm.getY(b) * 100) ||
        Math.round(norm.getZ(a) * 100) !== Math.round(norm.getZ(b) * 100))
    ) {
      return false;
    }
    if (
      uv &&
      (Math.round(uv.getX(a) * 200) !== Math.round(uv.getX(b) * 200) ||
        Math.round(uv.getY(a) * 200) !== Math.round(uv.getY(b) * 200))
    ) {
      return false;
    }
    if (
      col &&
      (Math.round(col.getX(a) * 100) !== Math.round(col.getX(b) * 100) ||
        Math.round(col.getY(a) * 100) !== Math.round(col.getY(b) * 100) ||
        Math.round(col.getZ(a) * 100) !== Math.round(col.getZ(b) * 100))
    ) {
      return false;
    }
    for (let e = 0; e < extraAttrs.length; e++) {
      const attr = extraAttrs[e];
      if (Math.round(attr.getX(a) * 100) !== Math.round(attr.getX(b) * 100)) return false;
    }
    return true;
  };

  for (let i = 0; i < vCount; i++) {
    let h =
      (Math.imul(Math.round(pos.getX(i) * 500), 73856093) ^
        Math.imul(Math.round(pos.getY(i) * 500), 19349663) ^
        Math.imul(Math.round(pos.getZ(i) * 500), 83492791)) |
      0;
    if (norm) {
      h =
        (Math.imul(h ^ Math.round(norm.getX(i) * 100), 16777619) ^
          Math.imul(Math.round(norm.getY(i) * 100), 2246822519) ^
          Math.round(norm.getZ(i) * 100)) |
        0;
    }
    if (uv) {
      h =
        (Math.imul(h ^ Math.round(uv.getX(i) * 200), 2654435761) ^
          Math.round(uv.getY(i) * 200)) |
        0;
    }
    if (col) {
      h =
        (Math.imul(h ^ Math.round(col.getX(i) * 100), 3266489917) ^
          Math.imul(Math.round(col.getY(i) * 100), 668265263) ^
          Math.round(col.getZ(i) * 100)) |
        0;
    }
    for (let e = 0; e < extraAttrs.length; e++) {
      h = Math.imul(h ^ Math.round(extraAttrs[e].getX(i) * 100), 16777619) | 0;
    }

    const bucket = buckets.get(h);
    let idx = -1;
    if (bucket !== undefined) {
      if (typeof bucket === 'number') {
        if (sameVert(bucket, i)) {
          idx = outIdxOfSrc[bucket];
        } else {
          buckets.set(h, [bucket, i]);
        }
      } else {
        for (let b = 0; b < bucket.length; b++) {
          const cand = bucket[b];
          if (sameVert(cand, i)) {
            idx = outIdxOfSrc[cand];
            break;
          }
        }
        if (idx === -1) bucket.push(i);
      }
    } else {
      buckets.set(h, i);
    }

    if (idx === -1) {
      idx = uniqueCount++;
      keepIndices[idx] = i;
      outIdxOfSrc[i] = idx;
    }
    indices[i] = idx;
    if (slicer && (i & 127) === 127) await slicer.maybeYield();
  }

  if (uniqueCount >= vCount * 0.92) return geo;

  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const itemSize = attr.itemSize;
    const ArrType = attr.array.constructor;
    const nextArr = new ArrType(uniqueCount * itemSize);
    for (let u = 0; u < uniqueCount; u++) {
      const srcIdx = keepIndices[u] * itemSize;
      const dstIdx = u * itemSize;
      for (let c = 0; c < itemSize; c++) {
        nextArr[dstIdx + c] = attr.array[srcIdx + c];
      }
      if (slicer && (u & 255) === 255) await slicer.maybeYield();
    }
    out.setAttribute(name, new THREE.BufferAttribute(nextArr, itemSize, attr.normalized));
  }
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  if (geo.boundingBox) out.computeBoundingBox();
  return out;
}

function buildWeldedCloudGeometry(srcGeo, cellSize = 1.6) {
  if (!srcGeo?.attributes?.position) return srcGeo;
  const pos = srcGeo.attributes.position;
  const norm = srcGeo.attributes.normal;
  const meta = srcGeo.attributes.aCloudMeta;
  const vCount = pos.count;
  const idxArr = srcGeo.index ? srcGeo.index.array : null;
  const triCount = idxArr ? idxArr.length / 3 : Math.floor(vCount / 3);

  const invCellXZ = 1.0 / cellSize;
  const invCellY = 1.0 / (cellSize * 0.35);
  const clusterMap = new Map();
  const vertToCluster = new Int32Array(vCount).fill(-1);
  const sumPos = [];
  const sumNorm = [];
  const sumMeta = [];
  const counts = [];
  let clusterCount = 0;

  const getCluster = (vi) => {
    let ci = vertToCluster[vi];
    if (ci !== -1) return ci;
    const x = pos.getX(vi);
    const y = pos.getY(vi);
    const z = pos.getZ(vi);
    const hFactor = meta ? meta.getX(vi) : 0.5;
    const phase = meta ? Math.round(meta.getZ(vi) * 10) : 0;
    const hBucket = Math.round(hFactor * 10);
    const nyBucket = norm ? Math.round(norm.getY(vi) * 4) : 0;
    const key = `${Math.round(x * invCellXZ)},${Math.round(y * invCellY)},${Math.round(z * invCellXZ)},${hBucket},${nyBucket},${phase}`;
    ci = clusterMap.get(key);
    if (ci === undefined) {
      ci = clusterCount++;
      clusterMap.set(key, ci);
      sumPos.push(0, 0, 0);
      sumNorm.push(0, 0, 0);
      sumMeta.push(0, 0, 0);
      counts.push(0);
    }
    vertToCluster[vi] = ci;
    const c3 = ci * 3;
    sumPos[c3] += x;
    sumPos[c3 + 1] += y;
    sumPos[c3 + 2] += z;
    if (norm) {
      sumNorm[c3] += norm.getX(vi);
      sumNorm[c3 + 1] += norm.getY(vi);
      sumNorm[c3 + 2] += norm.getZ(vi);
    }
    if (meta) {
      sumMeta[c3] += meta.getX(vi);
      sumMeta[c3 + 1] += meta.getY(vi);
      sumMeta[c3 + 2] += meta.getZ(vi);
    }
    counts[ci] += 1;
    return ci;
  };

  const outIdx = [];
  const seenTris = new Set();
  for (let t = 0; t < triCount; t++) {
    const i0 = idxArr ? idxArr[t * 3] : t * 3;
    const i1 = idxArr ? idxArr[t * 3 + 1] : t * 3 + 1;
    const i2 = idxArr ? idxArr[t * 3 + 2] : t * 3 + 2;
    const a = getCluster(i0);
    const b = getCluster(i1);
    const c = getCluster(i2);
    if (a === b || b === c || c === a) continue;
    const min = Math.min(a, b, c);
    const max = Math.max(a, b, c);
    const mid = a + b + c - min - max;
    const tk = `${min},${mid},${max}`;
    if (seenTris.has(tk)) continue;
    seenTris.add(tk);
    outIdx.push(a, b, c);
  }

  const outPos = new Float32Array(clusterCount * 3);
  const outNorm = new Float32Array(clusterCount * 3);
  const outMeta = new Float32Array(clusterCount * 3);
  for (let i = 0; i < clusterCount; i++) {
    const inv = 1.0 / Math.max(1, counts[i]);
    const c3 = i * 3;
    outPos[c3] = sumPos[c3] * inv;
    outPos[c3 + 1] = sumPos[c3 + 1] * inv;
    outPos[c3 + 2] = sumPos[c3 + 2] * inv;
    const nx = sumNorm[c3];
    const ny = sumNorm[c3 + 1];
    const nz = sumNorm[c3 + 2];
    const nLen = Math.hypot(nx, ny, nz) || 1.0;
    outNorm[c3] = nx / nLen;
    outNorm[c3 + 1] = ny / nLen;
    outNorm[c3 + 2] = nz / nLen;
    outMeta[c3] = sumMeta[c3] * inv;
    outMeta[c3 + 1] = sumMeta[c3 + 1] * inv;
    outMeta[c3 + 2] = sumMeta[c3 + 2] * inv;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  if (meta) {
    geo.setAttribute('aCloudMeta', new THREE.BufferAttribute(outMeta, 3));
  }
  geo.setIndex(outIdx);
  geo.computeBoundingSphere();
  return geo;
}

async function buildWeldedCloudGeometryAsync(srcGeo, cellSize = 1.6, slicer = null) {
  if (!srcGeo?.attributes?.position) return srcGeo;
  if (!slicer) return buildWeldedCloudGeometry(srcGeo, cellSize);
  const pos = srcGeo.attributes.position;
  const norm = srcGeo.attributes.normal;
  const meta = srcGeo.attributes.aCloudMeta;
  const vCount = pos.count;
  const idxArr = srcGeo.index ? srcGeo.index.array : null;
  const triCount = idxArr ? idxArr.length / 3 : Math.floor(vCount / 3);

  const invCellXZ = 1.0 / cellSize;
  const invCellY = 1.0 / (cellSize * 0.35);
  const clusterMap = new Map();
  const vertToCluster = new Int32Array(vCount).fill(-1);
  const sumPos = [];
  const sumNorm = [];
  const sumMeta = [];
  const counts = [];
  let clusterCount = 0;

  const getCluster = (vi) => {
    let ci = vertToCluster[vi];
    if (ci !== -1) return ci;
    const x = pos.getX(vi);
    const y = pos.getY(vi);
    const z = pos.getZ(vi);
    const hFactor = meta ? meta.getX(vi) : 0.5;
    const phase = meta ? Math.round(meta.getZ(vi) * 10) : 0;
    const hBucket = Math.round(hFactor * 10);
    const nyBucket = norm ? Math.round(norm.getY(vi) * 4) : 0;
    const key = `${Math.round(x * invCellXZ)},${Math.round(y * invCellY)},${Math.round(z * invCellXZ)},${hBucket},${nyBucket},${phase}`;
    ci = clusterMap.get(key);
    if (ci === undefined) {
      ci = clusterCount++;
      clusterMap.set(key, ci);
      sumPos.push(0, 0, 0);
      sumNorm.push(0, 0, 0);
      sumMeta.push(0, 0, 0);
      counts.push(0);
    }
    vertToCluster[vi] = ci;
    const c3 = ci * 3;
    sumPos[c3] += x;
    sumPos[c3 + 1] += y;
    sumPos[c3 + 2] += z;
    if (norm) {
      sumNorm[c3] += norm.getX(vi);
      sumNorm[c3 + 1] += norm.getY(vi);
      sumNorm[c3 + 2] += norm.getZ(vi);
    }
    if (meta) {
      sumMeta[c3] += meta.getX(vi);
      sumMeta[c3 + 1] += meta.getY(vi);
      sumMeta[c3 + 2] += meta.getZ(vi);
    }
    counts[ci] += 1;
    return ci;
  };

  const outIdx = [];
  const seenTris = new Set();
  for (let t = 0; t < triCount; t++) {
    const i0 = idxArr ? idxArr[t * 3] : t * 3;
    const i1 = idxArr ? idxArr[t * 3 + 1] : t * 3 + 1;
    const i2 = idxArr ? idxArr[t * 3 + 2] : t * 3 + 2;
    const a = getCluster(i0);
    const b = getCluster(i1);
    const c = getCluster(i2);
    if (a === b || b === c || c === a) continue;
    const min = Math.min(a, b, c);
    const max = Math.max(a, b, c);
    const mid = a + b + c - min - max;
    const tk = `${min},${mid},${max}`;
    if (!seenTris.has(tk)) {
      seenTris.add(tk);
      outIdx.push(a, b, c);
    }
    if ((t & 255) === 255) await slicer.maybeYield();
  }

  const outPos = new Float32Array(clusterCount * 3);
  const outNorm = new Float32Array(clusterCount * 3);
  const outMeta = new Float32Array(clusterCount * 3);
  for (let i = 0; i < clusterCount; i++) {
    const inv = 1.0 / Math.max(1, counts[i]);
    const c3 = i * 3;
    outPos[c3] = sumPos[c3] * inv;
    outPos[c3 + 1] = sumPos[c3 + 1] * inv;
    outPos[c3 + 2] = sumPos[c3 + 2] * inv;
    const nx = sumNorm[c3];
    const ny = sumNorm[c3 + 1];
    const nz = sumNorm[c3 + 2];
    const nLen = Math.hypot(nx, ny, nz) || 1.0;
    outNorm[c3] = nx / nLen;
    outNorm[c3 + 1] = ny / nLen;
    outNorm[c3 + 2] = nz / nLen;
    outMeta[c3] = sumMeta[c3] * inv;
    outMeta[c3 + 1] = sumMeta[c3 + 1] * inv;
    outMeta[c3 + 2] = sumMeta[c3 + 2] * inv;
    if ((i & 511) === 511) await slicer.maybeYield();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  if (meta) {
    geo.setAttribute('aCloudMeta', new THREE.BufferAttribute(outMeta, 3));
  }
  geo.setIndex(outIdx);
  geo.computeBoundingSphere();
  return geo;
}

function buildWeldedHorizonGeometry(srcGeo, cellSize = 15.0) {
  if (!srcGeo?.attributes?.position) return srcGeo;
  const pos = srcGeo.attributes.position;
  const norm = srcGeo.attributes.normal;
  const col = srcGeo.attributes.color;
  const vCount = pos.count;
  const idxArr = srcGeo.index ? srcGeo.index.array : null;
  const triCount = idxArr ? idxArr.length / 3 : Math.floor(vCount / 3);

  const invCell = 1.0 / cellSize;
  const clusterMap = new Map();
  const vertToCluster = new Int32Array(vCount).fill(-1);
  const sumPos = [];
  const sumNorm = [];
  const sumCol = [];
  const counts = [];
  let clusterCount = 0;

  const getCluster = (vi, isNearHydro) => {
    let ci = vertToCluster[vi];
    if (ci !== -1) return ci;
    const x = pos.getX(vi);
    const y = pos.getY(vi);
    const z = pos.getZ(vi);
    const nx = norm ? norm.getX(vi) : 0;
    const ny = norm ? norm.getY(vi) : 1;
    const nz = norm ? norm.getZ(vi) : 0;
    const r = col ? col.getX(vi) : 1;
    const g = col ? col.getY(vi) : 1;
    const b = col ? col.getZ(vi) : 1;

    const key = isNearHydro
      ? `H:${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)},${Math.round(nx * 50)},${Math.round(ny * 50)},${Math.round(nz * 50)},${Math.round(r * 50)},${Math.round(g * 50)},${Math.round(b * 50)}`
      : `M:${Math.round(x * invCell)},${Math.round(y * invCell)},${Math.round(z * invCell)},${Math.round(r * 10)},${Math.round(g * 10)},${Math.round(b * 10)}`;

    ci = clusterMap.get(key);
    if (ci === undefined) {
      ci = clusterCount++;
      clusterMap.set(key, ci);
      sumPos.push(0, 0, 0);
      sumNorm.push(0, 0, 0);
      sumCol.push(0, 0, 0);
      counts.push(0);
    }
    vertToCluster[vi] = ci;
    const c3 = ci * 3;
    sumPos[c3] += x;
    sumPos[c3 + 1] += y;
    sumPos[c3 + 2] += z;
    sumNorm[c3] += nx;
    sumNorm[c3 + 1] += ny;
    sumNorm[c3 + 2] += nz;
    sumCol[c3] += r;
    sumCol[c3 + 1] += g;
    sumCol[c3 + 2] += b;
    counts[ci] += 1;
    return ci;
  };

  const outIdx = [];
  const seenTris = new Set();
  for (let t = 0; t < triCount; t++) {
    const i0 = idxArr ? idxArr[t * 3] : t * 3;
    const i1 = idxArr ? idxArr[t * 3 + 1] : t * 3 + 1;
    const i2 = idxArr ? idxArr[t * 3 + 2] : t * 3 + 2;
    const cx = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3;
    const cz = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
    const rDist = Math.hypot(cx, cz);
    const isNearHydro = rDist <= 185.0;

    if (!isNearHydro && norm && rDist > 265.0) {
      const cnx = (norm.getX(i0) + norm.getX(i1) + norm.getX(i2)) / 3;
      const cnz = (norm.getZ(i0) + norm.getZ(i1) + norm.getZ(i2)) / 3;
      const radialDot = (cx * cnx + cz * cnz) / Math.max(1.0, rDist);
      if (radialDot > 0.32) continue;
    }

    const a = getCluster(i0, isNearHydro);
    const b = getCluster(i1, isNearHydro);
    const c = getCluster(i2, isNearHydro);
    if (a === b || b === c || c === a) continue;
    const min = Math.min(a, b, c);
    const max = Math.max(a, b, c);
    const mid = a + b + c - min - max;
    const tk = `${min},${mid},${max}`;
    if (seenTris.has(tk)) continue;
    seenTris.add(tk);
    outIdx.push(a, b, c);
  }

  const outPos = new Float32Array(clusterCount * 3);
  const outNorm = new Float32Array(clusterCount * 3);
  const outCol = new Float32Array(clusterCount * 3);
  for (let i = 0; i < clusterCount; i++) {
    const inv = 1.0 / Math.max(1, counts[i]);
    const c3 = i * 3;
    outPos[c3] = sumPos[c3] * inv;
    outPos[c3 + 1] = sumPos[c3 + 1] * inv;
    outPos[c3 + 2] = sumPos[c3 + 2] * inv;
    const nx = sumNorm[c3];
    const ny = sumNorm[c3 + 1];
    const nz = sumNorm[c3 + 2];
    const nLen = Math.hypot(nx, ny, nz) || 1.0;
    outNorm[c3] = nx / nLen;
    outNorm[c3 + 1] = ny / nLen;
    outNorm[c3 + 2] = nz / nLen;
    outCol[c3] = sumCol[c3] * inv;
    outCol[c3 + 1] = sumCol[c3 + 1] * inv;
    outCol[c3 + 2] = sumCol[c3 + 2] * inv;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  if (col) {
    geo.setAttribute('color', new THREE.BufferAttribute(outCol, 3));
  }
  geo.setIndex(outIdx);
  geo.computeBoundingSphere();
  return geo;
}

async function buildWeldedHorizonGeometryAsync(srcGeo, cellSize = 15.0, slicer = null) {
  if (!srcGeo?.attributes?.position) return srcGeo;
  if (!slicer) return buildWeldedHorizonGeometry(srcGeo, cellSize);
  const pos = srcGeo.attributes.position;
  const norm = srcGeo.attributes.normal;
  const col = srcGeo.attributes.color;
  const vCount = pos.count;
  const idxArr = srcGeo.index ? srcGeo.index.array : null;
  const triCount = idxArr ? idxArr.length / 3 : Math.floor(vCount / 3);

  const invCell = 1.0 / cellSize;
  const clusterMap = new Map();
  const vertToCluster = new Int32Array(vCount).fill(-1);
  const sumPos = [];
  const sumNorm = [];
  const sumCol = [];
  const counts = [];
  let clusterCount = 0;

  const getCluster = (vi, isNearHydro) => {
    let ci = vertToCluster[vi];
    if (ci !== -1) return ci;
    const x = pos.getX(vi);
    const y = pos.getY(vi);
    const z = pos.getZ(vi);
    const nx = norm ? norm.getX(vi) : 0;
    const ny = norm ? norm.getY(vi) : 1;
    const nz = norm ? norm.getZ(vi) : 0;
    const r = col ? col.getX(vi) : 1;
    const g = col ? col.getY(vi) : 1;
    const b = col ? col.getZ(vi) : 1;

    const key = isNearHydro
      ? `H:${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)},${Math.round(nx * 50)},${Math.round(ny * 50)},${Math.round(nz * 50)},${Math.round(r * 50)},${Math.round(g * 50)},${Math.round(b * 50)}`
      : `M:${Math.round(x * invCell)},${Math.round(y * invCell)},${Math.round(z * invCell)},${Math.round(r * 10)},${Math.round(g * 10)},${Math.round(b * 10)}`;

    ci = clusterMap.get(key);
    if (ci === undefined) {
      ci = clusterCount++;
      clusterMap.set(key, ci);
      sumPos.push(0, 0, 0);
      sumNorm.push(0, 0, 0);
      sumCol.push(0, 0, 0);
      counts.push(0);
    }
    vertToCluster[vi] = ci;
    const c3 = ci * 3;
    sumPos[c3] += x;
    sumPos[c3 + 1] += y;
    sumPos[c3 + 2] += z;
    sumNorm[c3] += nx;
    sumNorm[c3 + 1] += ny;
    sumNorm[c3 + 2] += nz;
    sumCol[c3] += r;
    sumCol[c3 + 1] += g;
    sumCol[c3 + 2] += b;
    counts[ci] += 1;
    return ci;
  };

  const outIdx = [];
  const seenTris = new Set();
  for (let t = 0; t < triCount; t++) {
    const i0 = idxArr ? idxArr[t * 3] : t * 3;
    const i1 = idxArr ? idxArr[t * 3 + 1] : t * 3 + 1;
    const i2 = idxArr ? idxArr[t * 3 + 2] : t * 3 + 2;
    const cx = (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3;
    const cz = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
    const rDist = Math.hypot(cx, cz);
    const isNearHydro = rDist <= 185.0;

    let skip = false;
    if (!isNearHydro && norm && rDist > 265.0) {
      const cnx = (norm.getX(i0) + norm.getX(i1) + norm.getX(i2)) / 3;
      const cnz = (norm.getZ(i0) + norm.getZ(i1) + norm.getZ(i2)) / 3;
      const radialDot = (cx * cnx + cz * cnz) / Math.max(1.0, rDist);
      if (radialDot > 0.32) skip = true;
    }

    if (!skip) {
      const a = getCluster(i0, isNearHydro);
      const b = getCluster(i1, isNearHydro);
      const c = getCluster(i2, isNearHydro);
      if (a !== b && b !== c && c !== a) {
        const min = Math.min(a, b, c);
        const max = Math.max(a, b, c);
        const mid = a + b + c - min - max;
        const tk = `${min},${mid},${max}`;
        if (!seenTris.has(tk)) {
          seenTris.add(tk);
          outIdx.push(a, b, c);
        }
      }
    }
    if ((t & 255) === 255) await slicer.maybeYield();
  }

  const outPos = new Float32Array(clusterCount * 3);
  const outNorm = new Float32Array(clusterCount * 3);
  const outCol = new Float32Array(clusterCount * 3);
  for (let i = 0; i < clusterCount; i++) {
    const inv = 1.0 / Math.max(1, counts[i]);
    const c3 = i * 3;
    outPos[c3] = sumPos[c3] * inv;
    outPos[c3 + 1] = sumPos[c3 + 1] * inv;
    outPos[c3 + 2] = sumPos[c3 + 2] * inv;
    const nx = sumNorm[c3];
    const ny = sumNorm[c3 + 1];
    const nz = sumNorm[c3 + 2];
    const nLen = Math.hypot(nx, ny, nz) || 1.0;
    outNorm[c3] = nx / nLen;
    outNorm[c3 + 1] = ny / nLen;
    outNorm[c3 + 2] = nz / nLen;
    outCol[c3] = sumCol[c3] * inv;
    outCol[c3 + 1] = sumCol[c3 + 1] * inv;
    outCol[c3 + 2] = sumCol[c3 + 2] * inv;
    if ((i & 511) === 511) await slicer.maybeYield();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  if (col) {
    geo.setAttribute('color', new THREE.BufferAttribute(outCol, 3));
  }
  geo.setIndex(outIdx);
  geo.computeBoundingSphere();
  return geo;
}

function buildTabletRoofTileGeometry() {
  const hw = 0.24;
  const hl = 0.22;
  const tTop = 0.012;
  const tBot = 0.054;
  const positions = new Float32Array([
    -hw, -hl, tBot,
     hw, -hl, tBot,
     hw,  hl, tTop,
    -hw,  hl, tTop,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

let _staticSceneIndexed = false;
let roofTilesCombinedMesh = null;

function applyProfileToStaticMeshes(profileName) {
  const isTablet = profileName === 'tablet';

  sky?.group?.traverse?.((obj) => {
    if (obj.isMesh && obj.name === 'todCumulusRing') {
      if (isTablet && !obj.userData._tabletGeo && obj.userData._desktopGeo) {
        obj.userData._tabletGeo = buildWeldedCloudGeometry(obj.userData._desktopGeo, 1.6);
      }
      if (obj.userData._tabletGeo && obj.userData._desktopGeo) {
        obj.geometry = isTablet ? obj.userData._tabletGeo : obj.userData._desktopGeo;
      }
    }
  });

  terrainKit?.group?.traverse?.((obj) => {
    if (!obj.isMesh) return;
    if (
      obj.userData?.isOutline ||
      obj.name?.toLowerCase().includes('outline') ||
      obj.material?.side === THREE.BackSide
    ) {
      obj.visible = !isTablet;
      return;
    }
    if (isTablet && obj.userData._needsTabletHorizonWeld && !obj.userData._tabletGeo && obj.userData._desktopGeo) {
      obj.userData._tabletGeo = buildWeldedHorizonGeometry(obj.userData._desktopGeo, 15.0);
    }
    if (obj.userData._tabletGeo && obj.userData._desktopGeo) {
      obj.geometry = isTablet ? obj.userData._tabletGeo : obj.userData._desktopGeo;
    }
  });

  village?.group?.traverse?.((obj) => {
    if (!obj.isMesh) return;
    if (
      obj.name === 'village-buildings-outline' ||
      obj.userData?.isOutline ||
      (obj.name?.toLowerCase().includes('outline') && obj.material?.side === THREE.BackSide)
    ) {
      obj.visible = !isTablet;
      return;
    }
    if (obj.isInstancedMesh && (obj.name === 'roof-tiles-combined' || obj.userData?.isRoofTiles)) {
      roofTilesCombinedMesh = obj;
      if (isTablet && !obj.userData._tabletGeo && obj.userData._desktopGeo) {
        obj.userData._tabletGeo = buildTabletRoofTileGeometry();
      }
      if (obj.userData._tabletGeo && obj.userData._desktopGeo) {
        obj.geometry = isTablet ? obj.userData._tabletGeo : obj.userData._desktopGeo;
      }
    }
  });
}

function syncStaticSceneProfile(profileName) {
  applyProfileToStaticMeshes(profileName);
}

async function syncStaticSceneProfileAsync(profileName, slicer) {
  const isTablet = profileName === 'tablet';

  if (!_staticSceneIndexed) {
    _staticSceneIndexed = true;
    const staticRoots = [sky?.group, terrainKit?.group, village?.group];
    const staticMeshes = [];
    for (const root of staticRoots) {
      if (!root) continue;
      root.traverse((obj) => {
        if (obj.isMesh && obj.geometry) staticMeshes.push(obj);
      });
    }
    for (let m = 0; m < staticMeshes.length; m++) {
      const obj = staticMeshes[m];
      if (obj.name === 'todCumulusRing') {
        if (obj.material) obj.material.side = THREE.FrontSide;
        const indexedDesktop = await indexLosslessGeometryAsync(obj.geometry, slicer);
        obj.userData._desktopGeo = indexedDesktop;
        if (isTablet) {
          obj.userData._tabletGeo = await buildWeldedCloudGeometryAsync(indexedDesktop, 1.6, slicer);
        }
        obj.geometry = indexedDesktop;
        await slicer.maybeYield();
        continue;
      }
      let isAlpineHorizon = false;
      let p = obj;
      while (p) {
        if (p.name === 'sky-and-alpine-horizon') {
          isAlpineHorizon = true;
          break;
        }
        p = p.parent;
      }
      if (
        isAlpineHorizon &&
        !obj.userData?.isOutline &&
        !obj.name?.toLowerCase().includes('outline') &&
        obj.geometry.attributes?.position?.count > 10000
      ) {
        const indexedDesktop = await indexLosslessGeometryAsync(obj.geometry, slicer);
        obj.userData._desktopGeo = indexedDesktop;
        obj.userData._needsTabletHorizonWeld = true;
        if (isTablet) {
          obj.userData._tabletGeo = await buildWeldedHorizonGeometryAsync(indexedDesktop, 15.0, slicer);
        }
        obj.geometry = indexedDesktop;
        await slicer.maybeYield();
        continue;
      }
      if (obj.isInstancedMesh && (obj.name === 'roof-tiles-combined' || obj.userData?.isRoofTiles)) {
        const indexedDesktop = await indexLosslessGeometryAsync(obj.geometry, slicer);
        obj.userData._desktopGeo = indexedDesktop;
        if (isTablet) {
          obj.userData._tabletGeo = buildTabletRoofTileGeometry();
        }
        obj.geometry = indexedDesktop;
        await slicer.maybeYield();
        continue;
      }
      if (!obj.geometry.index) {
        obj.geometry = await indexLosslessGeometryAsync(obj.geometry, slicer);
      }
      await slicer.maybeYield();
    }
  }

  applyProfileToStaticMeshes(profileName);
}

/* ------------------------------------------------------------------------- */
/* 4. Toroidal Gouache Meadow & Valley-Wide Wildflower Drifts                */
/* ------------------------------------------------------------------------- */

const WILDFLOWER_DRIFT_COLONIES = [
  // Zone E: Southern Flower Field Lobby (0, 128) — Roadside Verge & Meadow Drifts (Option 3 + Option 4 framing!)
  { x: -5.4, z: 135.5, r: 4.8 },
  { x: 5.4, z: 135.5, r: 4.8 },
  { x: -6.2, z: 129.0, r: 5.2 },
  { x: 6.2, z: 129.0, r: 5.2 },
  { x: -5.8, z: 122.0, r: 5.2 },
  { x: 5.8, z: 122.0, r: 5.2 },
  { x: -11.5, z: 133.5, r: 8.5 },
  { x: 11.5, z: 133.5, r: 8.5 },
  { x: -14.0, z: 121.0, r: 9.0 },
  { x: 14.0, z: 121.0, r: 9.0 },
  { x: -8.5, z: 140.5, r: 8.5 },
  { x: 8.5, z: 140.5, r: 8.5 },
  { x: -16.5, z: 102.0, r: 8.5 },
  { x: 11.5, z: 98.0, r: 8.5 },
  { x: -24.0, z: 82.0, r: 8.5 },
  { x: 16.5, z: 76.0, r: 8.5 },
  { x: -12.5, z: 58.0, r: 8.5 },
  { x: 26.5, z: 48.0, r: 8.5 },
  // Zone A: Hamlet Well Plaza & Cottage Perimeter Meadows
  { x: -7.5, z: 16.5, r: 7.5 },
  { x: 8.5, z: 17.0, r: 7.5 },
  { x: -23.5, z: -2.0, r: 8.0 },
  { x: 24.5, z: -1.5, r: 8.0 },
  { x: -18.5, z: 22.5, r: 7.5 },
  { x: 19.5, z: 22.0, r: 7.5 },
  { x: -5.5, z: 32.0, r: 9.0 },
  { x: 6.5, z: 34.0, r: 9.0 },
  // Zone B: West Millpond, Waterfall & Pier Meadow
  { x: -24.5, z: 13.5, r: 7.5 },
  { x: -31.0, z: 15.0, r: 7.0 },
  { x: -29.5, z: -11.5, r: 8.0 },
  { x: -36.5, z: -28.0, r: 8.0 },
  { x: -82.0, z: -12.0, r: 8.5 },
  { x: -86.0, z: 12.0, r: 8.5 },
  // Zone C: East Wisteria Combat Ring & Approach Way
  { x: 32.0, z: 3.5, r: 8.0 },
  { x: 42.0, z: -9.5, r: 8.0 },
  { x: 45.5, z: 6.5, r: 7.5 },
  { x: 68.0, z: -27.5, r: 8.5 },
  { x: 68.0, z: 19.5, r: 8.5 },
  { x: 91.0, z: -11.0, r: 8.0 },
  { x: 89.5, z: 7.0, r: 8.0 },
  { x: 98.0, z: -20.0, r: 8.5 },
  { x: 98.0, z: 15.0, r: 8.5 },
  // Zone D: Outer North Shrine Summit & Far Valley Meadows (zero flowers on staircase hillside!)
  { x: -42.0, z: -46.0, r: 7.0 },
  { x: 42.0, z: -46.0, r: 7.0 },
  { x: -38.5, z: -64.0, r: 7.0 },
  { x: 38.5, z: -64.0, r: 7.0 },
  { x: -21.5, z: -84.0, r: 7.0 },
  { x: 21.5, z: -84.0, r: 7.0 },
  { x: -16.0, z: -96.0, r: 7.0 },
  { x: 16.0, z: -96.0, r: 7.0 },
];

let flowersMod = null;
let treeShadowData = null;

function populateSpeciesDriftSync(meadowInstance, key, sIdx, dummy, MEADOW_PROFILES) {
  const imesh = meadowInstance.flowerMeshes[key];
  if (imesh?.material?.uniforms?.uIsToroidal?.value > 0.5) return;
  if (imesh.material?.uniforms) {
    imesh.material.uniforms.uFadeStart.value = 158.0;
    imesh.material.uniforms.uFadeEnd.value = 172.0;
  }
  if (key === 'crimsonRose' || imesh.userData?.lockedSacredRings) return;
  const targetCount = MEADOW_PROFILES[activeProfile]?.counts?.[key] || imesh.count || 200;

  let placed = 0;
  let attempt = 0;
  while (placed < targetCount && attempt < targetCount * 12) {
    attempt++;
    const cIdx = (placed + sIdx * 3) % WILDFLOWER_DRIFT_COLONIES.length;
    const col = WILDFLOWER_DRIFT_COLONIES[cIdx];
    const ang = hash(attempt * 7.13 + sIdx * 31.7) * Math.PI * 2;
    const rad = Math.sqrt(hash(attempt * 11.3 + sIdx * 17.9)) * col.r;
    const x = col.x + Math.cos(ang) * rad;
    const z = col.z + Math.sin(ang) * rad;

    if (z < -15.0 && z > -73.0 && Math.abs(x) < 35.0) continue;
    const sw = sampleWorld(x, z);
    if (sw.foliageMask < 0.5) continue;
    if (key === 'toonShrub' && z > 110.0 && Math.abs(x) < 6.2) continue;

    dummy.position.set(x, terrainHeightAt(x, z), z);
    const rotY =
      key === 'toonShrub'
        ? 0.58 + (hash(attempt * 9.1 + sIdx) - 0.5) * 0.95
        : hash(attempt * 9.1 + sIdx) * Math.PI * 2;
    dummy.rotation.set(0, rotY, 0);
    const sc =
      key === 'toonShrub'
        ? 1.06 + hash(attempt * 15.7) * 0.44
        : 1.02 + hash(attempt * 17.3) * 0.46;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    imesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  imesh.count = placed;
  imesh.instanceMatrix.needsUpdate = true;
  meadowInstance.instanceCounts[key] = placed;
}

function populateValleyWildflowerDrifts(meadowInstance) {
  const dummy = new THREE.Object3D();
  const keys = Object.keys(meadowInstance.flowerMeshes);
  keys.forEach((key, sIdx) =>
    populateSpeciesDriftSync(meadowInstance, key, sIdx, dummy, flowersMod.MEADOW_PROFILES)
  );
  meadowInstance.rebuildFlowerSectors?.();
}

async function populateValleyWildflowerDriftsAsync(meadowInstance, slicer) {
  const dummy = new THREE.Object3D();
  const keys = Object.keys(meadowInstance.flowerMeshes);
  for (let sIdx = 0; sIdx < keys.length; sIdx++) {
    const key = keys[sIdx];
    const imesh = meadowInstance.flowerMeshes[key];
    if (imesh?.material?.uniforms?.uIsToroidal?.value > 0.5) continue;
    if (imesh.material?.uniforms) {
      imesh.material.uniforms.uFadeStart.value = 158.0;
      imesh.material.uniforms.uFadeEnd.value = 172.0;
    }
    if (key === 'crimsonRose' || imesh.userData?.lockedSacredRings) continue;
    const targetCount = flowersMod.MEADOW_PROFILES[activeProfile]?.counts?.[key] || imesh.count || 200;

    let placed = 0;
    let attempt = 0;
    while (placed < targetCount && attempt < targetCount * 12) {
      attempt++;
      const cIdx = (placed + sIdx * 3) % WILDFLOWER_DRIFT_COLONIES.length;
      const col = WILDFLOWER_DRIFT_COLONIES[cIdx];
      const ang = hash(attempt * 7.13 + sIdx * 31.7) * Math.PI * 2;
      const rad = Math.sqrt(hash(attempt * 11.3 + sIdx * 17.9)) * col.r;
      const x = col.x + Math.cos(ang) * rad;
      const z = col.z + Math.sin(ang) * rad;

      if (!(z < -15.0 && z > -73.0 && Math.abs(x) < 35.0)) {
        const sw = sampleWorld(x, z);
        if (sw.foliageMask >= 0.5 && !(key === 'toonShrub' && z > 110.0 && Math.abs(x) < 6.2)) {
          dummy.position.set(x, terrainHeightAt(x, z), z);
          const rotY =
            key === 'toonShrub'
              ? 0.58 + (hash(attempt * 9.1 + sIdx) - 0.5) * 0.95
              : hash(attempt * 9.1 + sIdx) * Math.PI * 2;
          dummy.rotation.set(0, rotY, 0);
          const sc =
            key === 'toonShrub'
              ? 1.06 + hash(attempt * 15.7) * 0.44
              : 1.02 + hash(attempt * 17.3) * 0.46;
          dummy.scale.set(sc, sc, sc);
          dummy.updateMatrix();
          imesh.setMatrixAt(placed, dummy.matrix);
          placed++;
        }
      }
      if ((attempt & 127) === 127) await slicer.maybeYield();
    }
    imesh.count = placed;
    imesh.instanceMatrix.needsUpdate = true;
    meadowInstance.instanceCounts[key] = placed;
    await slicer.maybeYield();
  }
  meadowInstance.rebuildFlowerSectors?.();
}

buildMeadowForProfile = function buildMeadowForProfileImpl(profileName) {
  if (!flowersMod || !terrainKit || !treeShadowData) return;
  if (meadow) {
    scene.remove(meadow.group);
    meadow.dispose();
  }
  const cfg = PROFILES[profileName] || PROFILES.desktop;
  meadow = flowersMod.createToroidalMeadow({
    profile: cfg.meadowProfile || 'desktop',
    worldMaskTexture: terrainKit.worldMaskTex,
    sampleHeight: terrainHeightAt,
    worldExtent: INNER_EXTENT,
    treeShadows: treeShadowData.treeShadowVecs,
    treeCount: treeShadowData.treeCount,
  });
  if (meadow.grassMesh) {
    if (profileName === 'tablet') {
      meadow.grassMesh.geometry = flowersMod.buildGrassTuft({ profile: profileName });
    }
    if (cfg.maxGrassTufts) {
      meadow.grassMesh.count = Math.min(meadow.grassMesh.count, cfg.maxGrassTufts);
      meadow.instanceCounts.grassTuft = meadow.grassMesh.count;
    }
  }
  populateValleyWildflowerDrifts(meadow);
  scene.add(meadow.group);
};

async function buildMeadowForProfileAsync(profileName, slicer) {
  if (meadow) {
    scene.remove(meadow.group);
    meadow.dispose();
  }
  const cfg = PROFILES[profileName] || PROFILES.desktop;
  const meadowOpts = {
    profile: cfg.meadowProfile || 'desktop',
    worldMaskTexture: terrainKit.worldMaskTex,
    sampleHeight: terrainHeightAt,
    worldExtent: INNER_EXTENT,
    treeShadows: treeShadowData.treeShadowVecs,
    treeCount: treeShadowData.treeCount,
    yieldFrame: slicer.yieldFrame,
    sliceBudgetMs: slicer.sliceBudgetMs,
  };
  meadow =
    typeof flowersMod.createToroidalMeadowAsync === 'function'
      ? await flowersMod.createToroidalMeadowAsync(meadowOpts)
      : flowersMod.createToroidalMeadow(meadowOpts);
  await slicer.maybeYield();
  if (meadow.grassMesh) {
    if (profileName === 'tablet') {
      meadow.grassMesh.geometry = flowersMod.buildGrassTuft({ profile: profileName });
    }
    if (cfg.maxGrassTufts) {
      meadow.grassMesh.count = Math.min(meadow.grassMesh.count, cfg.maxGrassTufts);
      meadow.instanceCounts.grassTuft = meadow.grassMesh.count;
    }
  }
  await populateValleyWildflowerDriftsAsync(meadow, slicer);
  scene.add(meadow.group);
}

/* ------------------------------------------------------------------------- */
/* 5. Collision Resolution & Whispering Mountain Mist Boundary Turnback      */
/* ------------------------------------------------------------------------- */

let lastMistBannerTime = -999;

function resolveCollisions(px, pz, radius) {
  let x = px;
  let z = pz;
  let wrapped = false;

  const rDist = Math.hypot(x, z);
  if (rDist > PLAY_BOUNDARY_RADIUS) {
    // Whispering Mountain Mist Turnback: instead of teleporting across the map,
    // the permanent mountain mist gently guides the traveler back toward the sunlit sanctuary.
    const angle = Math.atan2(z, x);
    const turnbackR = PLAY_BOUNDARY_RADIUS - 2.2;
    x = Math.cos(angle) * turnbackR;
    z = Math.sin(angle) * turnbackR;
    wrapped = true;
    if (typeof performance !== 'undefined' && performance.now() - lastMistBannerTime > 6500) {
      lastMistBannerTime = performance.now();
      showCombatBanner(
        {
          title: 'The Mountain Mist Thickens',
          subtitle: 'A warm breeze gently guides you back toward the valley of Haru-machi.',
        },
        3200
      );
    }
  }

  for (const c of terrainKit?.colliders || []) {
    if (c.type === 'circle') {
      const dx = x - c.x;
      const dz = z - c.z;
      const minD = c.r + radius;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) {
        x += (dx / d) * (minD - d);
        z += (dz / d) * (minD - d);
      }
    } else if (c.type === 'obb') {
      const hx = c.hx ?? c.halfW ?? 4.0;
      const hz = c.hz ?? c.halfD ?? 4.0;
      const rotY = c.rotY || 0;
      const cos = Math.cos(rotY);
      const sin = Math.sin(rotY);
      const lx = (x - c.x) * cos - (z - c.z) * sin;
      const lz = (x - c.x) * sin + (z - c.z) * cos;
      const cx = clamp(lx, -hx, hx);
      const cz = clamp(lz, -hz, hz);
      const dx = lx - cx;
      const dz = lz - cz;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        let nx = 0;
        let nz = 0;
        if (d > 1e-5) {
          nx = dx / d;
          nz = dz / d;
        } else {
          const penX = hx - Math.abs(lx);
          const penZ = hz - Math.abs(lz);
          if (penX < penZ) nx = lx >= 0 ? 1 : -1;
          else nz = lz >= 0 ? 1 : -1;
        }
        const push = radius - d;
        const lxNew = lx + nx * push;
        const lzNew = lz + nz * push;
        x = c.x + lxNew * cos + lzNew * sin;
        z = c.z - lxNew * sin + lzNew * cos;
      }
    }
  }

  return { x, z, wrapped };
}

/* ------------------------------------------------------------------------- */
/* 6. Stage 5 HUD DOM Elements & Reactive Updater                            */
/* ------------------------------------------------------------------------- */

const hudEl = document.getElementById('hud');
const debugDevPill = document.getElementById('debug-dev-pill');
const statsEl = document.getElementById('stats-readout');
const viewSelect = document.getElementById('view-select');
const hudSwapHeroBtn = document.getElementById('hud-swap-hero-btn');
const hudHeroName = document.getElementById('hud-hero-name');

const knightBarRow = document.getElementById('knight-bar-row');
const mageBarRow = document.getElementById('mage-bar-row');
const knightHpFill = document.getElementById('knight-hp-fill');
const knightShieldFill = document.getElementById('knight-shield-fill');
const knightHpText = document.getElementById('knight-hp-text');
const mageHpFill = document.getElementById('mage-hp-fill');
const mageShieldFill = document.getElementById('mage-shield-fill');
const mageHpText = document.getElementById('mage-hp-text');
const knightBreathingBadge = document.getElementById('knight-breathing-badge');

const coopStatusDot = document.getElementById('coop-status-dot');
const coopStatusLabel = document.getElementById('coop-status-label');
const coopRoomBtn = document.getElementById('coop-room-btn');
const coopRoomCodeEl = document.getElementById('coop-room-code');
const coopShareBtn = document.getElementById('coop-share-btn');

const actStageTag = document.getElementById('act-stage-tag');
const actObjectiveText = document.getElementById('act-objective-text');
const bossHudBar = document.getElementById('boss-hud-bar');
const bossNameLabel = document.getElementById('boss-name-label');
const bossAegisBadge = document.getElementById('boss-aegis-badge');
const bossHpFill = document.getElementById('boss-hp-fill');

const combatBanner = document.getElementById('combat-banner');
const combatBannerTitle = document.getElementById('combat-banner-title');
const combatBannerSub = document.getElementById('combat-banner-sub');

const ultQBtn = document.getElementById('ult-q-btn');
const resonancePctEl = document.getElementById('resonance-pct');
const communeRBtn = document.getElementById('commune-r-btn');
const communeSubLbl = document.getElementById('commune-sub-lbl');

const steleInteractPrompt = document.getElementById('stele-interact-prompt');
const altarSteleModal = document.getElementById('altar-stele-modal');
const altarSteleTitle = document.getElementById('altar-stele-title');
const altarStelePoem = document.getElementById('altar-stele-poem');
const altarSteleCloseBtn = document.getElementById('altar-stele-close-btn');

const sanctuaryLobby = document.getElementById('sanctuary-lobby');
const lobbyMicSelect = document.getElementById('lobby-mic-select');
const lobbyMicRefreshBtn = document.getElementById('lobby-mic-refresh-btn');
const lobbyEnterBtn = document.getElementById('lobby-enter-btn');

const victoryModal = document.getElementById('victory-modal');
const replayExpeditionBtn = document.getElementById('replay-expedition-btn');

let bannerHideTimer = null;

function showCombatBanner({ title = '', subtitle = '' } = {}, durationMs = 3600) {
  if (!combatBanner) return;
  if (combatBannerTitle) combatBannerTitle.textContent = title;
  if (combatBannerSub) combatBannerSub.textContent = subtitle;
  combatBanner.classList.add('visible');
  if (bannerHideTimer) clearTimeout(bannerHideTimer);
  if (durationMs > 0) {
    bannerHideTimer = setTimeout(() => {
      combatBanner.classList.remove('visible');
    }, durationMs);
  }
}

const BREATHING_ICON_MAP = {
  none: 'Steel Wind',
  rime: 'Glacial Tide',
  solar: 'Hinokami Sunfire',
  tempest: 'Thunderclap Wisteria',
  eclipse: 'Sun & Tide Eclipse',
};

function updateCombatHud(snapshot) {
  if (!snapshot) return;

  // 1. Knight & Mage HP + Shield Bars
  const k = snapshot.knight;
  const m = snapshot.mage;
  if (k) {
    const kPct = clamp((k.hp / Math.max(1, k.maxHp)) * 100, 0, 100);
    const kShieldPct = clamp((k.shield / Math.max(1, k.maxHp)) * 100, 0, 100);
    if (knightHpFill) knightHpFill.style.width = `${kPct.toFixed(1)}%`;
    if (knightShieldFill) knightShieldFill.style.width = `${kShieldPct.toFixed(1)}%`;
    if (knightHpText) {
      knightHpText.textContent = k.shield > 0 ? `${k.hp}+${k.shield}` : `${k.hp}/${k.maxHp}`;
    }
    if (knightBreathingBadge) {
      const styleId = k.breathingStyle || 'none';
      knightBreathingBadge.dataset.style = styleId;
      const baseLabel = BREATHING_ICON_MAP[styleId] || BREATHING_ICON_MAP.none;
      knightBreathingBadge.textContent =
        styleId !== 'none' && k.breathingTimer > 0
          ? `${baseLabel} · ${k.breathingTimer.toFixed(0)}s`
          : baseLabel;
    }
  }

  if (m) {
    const mPct = clamp((m.hp / Math.max(1, m.maxHp)) * 100, 0, 100);
    const mShieldPct = clamp((m.shield / Math.max(1, m.maxHp)) * 100, 0, 100);
    if (mageHpFill) mageHpFill.style.width = `${mPct.toFixed(1)}%`;
    if (mageShieldFill) mageShieldFill.style.width = `${mShieldPct.toFixed(1)}%`;
    if (mageHpText) {
      mageHpText.textContent = m.shield > 0 ? `${m.hp}+${m.shield}` : `${m.hp}/${m.maxHp}`;
    }

    // 2. 4-Spell Deck Cooldown Overlays
    for (let slot = 1; slot <= 4; slot++) {
      const spell = SPELL_BY_SLOT[slot];
      const btn = document.querySelector(`.spell-slot-btn[data-spell-slot="${slot}"]`);
      const cdEl = document.querySelector(`[data-cd-slot="${slot}"]`);
      if (spell && btn && cdEl) {
        const rem = m.spellCooldowns?.[spell.id] || 0;
        const onCd = rem > 0.08;
        btn.classList.toggle('on-cooldown', onCd);
        cdEl.textContent = onCd ? `${rem.toFixed(1)}s` : '';
      }
    }
  }

  // 3. Heart Resonance & Q Ultimate Button
  const resPct = clamp(snapshot.heartResonance ?? 0, 0, 100);
  if (resonancePctEl) {
    resonancePctEl.textContent = resPct >= 100 ? '100% READY!' : `${resPct}% Resonance`;
  }
  if (ultQBtn) {
    ultQBtn.classList.toggle('ult-ready', resPct >= 100);
  }

  // 4. Open-Valley Sacred Stones & Strongholds Objective Pill
  if (actStageTag && actObjectiveText) {
    const actId = snapshot.actId;
    const mask = Number(snapshot.stonesSolvedMask ?? 0) & 0b111;
    const solvedCount =
      ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0);
    const stageCount = Math.max(solvedCount, Number(snapshot.unlockedStage || 0));
    if (actId === 'victory_dawn') {
      actStageTag.textContent = 'Victory';
      actObjectiveText.textContent =
        'Dawn Over Amarante — All 3 Sacred Stones Awakened & Apex Finale Vanquished';
    } else if (stageCount >= 3 || mask === 0b111) {
      actStageTag.textContent = 'Apex Finale';
      actObjectiveText.textContent =
        'Sacred Stones (3/3) — Survive the Apex Finale Assault Together';
    } else if (stageCount === 2) {
      actStageTag.textContent = 'Sacred Stones (2/3)';
      actObjectiveText.textContent =
        'Clear the Final Stronghold & Awaken the 3rd Sacred Stone';
    } else if (stageCount === 1) {
      actStageTag.textContent = 'Sacred Stones (1/3)';
      actObjectiveText.textContent =
        'Explore the Valley Strongholds — Whispering Grove & Hidden Lovers\u2019 Wall';
    } else {
      actStageTag.textContent = 'Sacred Stones (0/3)';
      actObjectiveText.textContent =
        'Village Well Stronghold — Clear Guardians, Read [G] & Commune [V]';
    }
  }

  // 5. Boss Bar
  if (bossHudBar) {
    if (snapshot.boss) {
      bossHudBar.classList.add('visible');
      if (bossNameLabel) bossNameLabel.textContent = snapshot.boss.name;
      const bPct = clamp((snapshot.boss.hp / Math.max(1, snapshot.boss.maxHp)) * 100, 0, 100);
      if (bossHpFill) bossHpFill.style.width = `${bPct.toFixed(1)}%`;
      if (bossAegisBadge) {
        bossAegisBadge.textContent =
          snapshot.boss.aegisActive && snapshot.boss.aegisLayers > 0
            ? `Bone Aegis x ${snapshot.boss.aegisLayers}`
            : `${snapshot.boss.hp} / ${snapshot.boss.maxHp} HP`;
      }
    } else {
      bossHudBar.classList.remove('visible');
    }
  }

  // 6. Victory Dawn Modal
  if (victoryModal) {
    victoryModal.classList.toggle('visible', snapshot.actId === 'victory_dawn');
  }

  // 7. Sync Sculpted Stone-and-Brass HUD
  if (sculptedHud) {
    const activeRole = coopSystem?.player?.activeHeroId || 'Knight';
    const activeHeroState = coopSystem?.heroStates?.[activeRole];
    const activeEl =
      (activeRole === 'Knight' ? k?.selectedElement : m?.selectedElement) ||
      activeHeroState?.selectedElement ||
      'ice';
    const eCd =
      activeRole === 'Knight'
        ? Math.max(0, k?.powerSwordCd ?? k?.powerSwordCooldown ?? 0)
        : Math.max(
            0,
            m?.skillCd ??
              m?.spellCooldowns?.[activeEl === 'fire' ? 'cinder_fall' : 'frost_lance'] ??
              0
          );
    const qCd =
      activeRole === 'Knight'
        ? Math.max(0, k?.ultCd ?? k?.ultimateCooldown ?? 0)
        : Math.max(0, m?.ultCd ?? m?.stormCataclysmCooldown ?? 0);
    const eBuffRem =
      activeRole === 'Knight'
        ? Math.max(0, k?.powerSwordTimer || k?.breathingTimer || 0)
        : 0;
    const activeSwordBuffElement = k?.ultActive
      ? 'eclipse'
      : k?.powerSwordActive
        ? k?.summonedElement || (k?.breathingStyle === 'solar' ? 'fire' : 'ice')
        : null;
    const activeQEnergyPct =
      activeRole === 'Knight' ? (k?.qEnergyPct ?? 0) : (m?.qEnergyPct ?? 0);
    const rCd = snapshot.miracleReady ? 0 : Math.max(0, snapshot.modeAHealCd || 0);

    sculptedHud.updatePartyStatus({
      activeRole,
      activeElement: activeEl,
      activeSwordBuffElement,
      qEnergyPct: activeQEnergyPct,
      miracleReady: Boolean(snapshot.miracleReady),
      communeChannelActive: Boolean(snapshot.communeChannelActive),
      verdictSequenceActive: Boolean(snapshot.verdictSequence?.active),
      knight: k
        ? {
            level: k.level || 1,
            hp: k.hp,
            maxHp: k.maxHp,
            shield: k.shield || 0,
            qEnergy: k.qEnergy || 0,
            qEnergyMax: k.qEnergyMax || 100,
            qEnergyPct: k.qEnergyPct || 0,
            summonedElement: k.summonedElement || null,
          }
        : undefined,
      mage: m
        ? {
            level: m.level || 1,
            hp: m.hp,
            maxHp: m.maxHp,
            shield: m.shield || 0,
            qEnergy: m.qEnergy || 0,
            qEnergyMax: m.qEnergyMax || 160,
            qEnergyPct: m.qEnergyPct || 0,
          }
        : undefined,
      cooldowns: {
        E: eCd,
        Q: qCd,
        R: rCd,
        eBuffRemaining: eBuffRem,
        activeSwordBuffElement,
      },
    });
  }
}

let wasPeerLinked = false;

function updateCoopPill(roomState) {
  if (!roomState) return;
  const linked = Boolean(roomState.peerConnected);
  const justLinked = linked && !wasPeerLinked;
  wasPeerLinked = linked;

  if (coopStatusDot) {
    coopStatusDot.classList.toggle('linked', linked);
  }
  if (coopStatusLabel) {
    coopStatusLabel.textContent = linked
      ? `Co-Op Linked (${roomState.role})`
      : 'Wingman AI';
  }
    if (sculptedHud && typeof sculptedHud.setRoomState === 'function') {
      sculptedHud.setRoomState({
        roomCode: roomState.room || coopSystem?.coopClient?.getRoomCode?.() || 'LOVE',
        roomPhrase:
          roomState.roomPhrase ||
          coopSystem?.coopClient?.getState?.()?.roomPhrase ||
          appFlow?.getState?.()?.roomPhrase ||
          roomState.room ||
          'LOVE',
        shareUrl: coopSystem?.coopClient?.getShareUrl?.() || '',
        peerConnected: linked,
        role: roomState.role || coopSystem?.player?.activeHeroId || 'Knight',
      });
    }
    if (coopRoomCodeEl && roomState.room) {
      coopRoomCodeEl.textContent = roomState.room;
    }

  const players = Array.isArray(roomState.players) ? roomState.players : [];
  const localPlayer =
    players.find((p) => p && roomState.clientId && p.clientId === roomState.clientId) ||
    players.find((p) => p && Boolean(p.isHost) === Boolean(roomState.isHost)) ||
    null;
  const peerPlayer =
    players.find(
      (p) =>
        p &&
        p !== localPlayer &&
        (!roomState.clientId || p.clientId !== roomState.clientId)
    ) || null;

  const localRole = localPlayer?.role || roomState.role || 'Knight';
  const localPlayerName = String(
    localPlayer?.playerName ||
      localPlayer?.name ||
      appFlow?.getState?.()?.playerName ||
      ''
  ).trim();
  const partnerPlayerName = String(
    peerPlayer?.playerName ||
      peerPlayer?.name ||
      roomState.peerName ||
      roomState.partnerName ||
      ''
  ).trim();
  const partnerClaimed = Boolean(
    peerPlayer?.claimed || peerPlayer?.ready || roomState.peerReady
  );
  const guestReady = Boolean(peerPlayer?.ready ?? roomState.peerReady);

  if (sculptedHud) {
    sculptedHud.setPeerConnected?.(linked);
    const kName =
      localRole === 'Knight'
        ? localPlayerName || 'Knight'
        : partnerPlayerName || 'Knight';
    const mName =
      localRole === 'Mage'
        ? localPlayerName || 'Mage'
        : partnerPlayerName || 'Mage';
    sculptedHud.setPlayerNames({
      Knight: kName,
      Mage: mName,
      knight: kName,
      mage: mName,
      peerConnected: linked,
    });
  }

  if (appFlow) {
    appFlow.setLobbyState({
      roomPhrase: roomState.roomPhrase || roomState.room,
      isHost: Boolean(roomState.isHost),
      localRole,
      playerName: localPlayerName || undefined,
      partnerName: partnerPlayerName,
      partnerClaimed: linked ? partnerClaimed : false,
      guestReady: linked ? guestReady : false,
      peerConnected: linked,
      playerCount: linked ? 2 : 1,
      expeditionStarted: Boolean(roomState.expeditionStarted),
    });

    if (
      roomState.expeditionStarted === true &&
      linked &&
      appFlow.getStep() !== FLOW_STEPS.IN_GAME
    ) {
      appFlow.skipToGame();
      camState.mode = 'player';
      sculptedHud?.setVisible(true);
      updateCamera();
      try {
        coopSystem?.coopClient?.requestFullSnapshot?.();
      } catch {
        // ignore if coopSystem is still initializing
      }
    }
  }

  if (roomState.expeditionStarted === true && justLinked) {
    try {
      coopSystem?.coopClient?.requestFullSnapshot?.();
    } catch {
      // ignore if coopSystem is still initializing
    }
  }

  if (sculptedHud && roomState.progression) {
    const effStage =
      devStageOverride !== null
        ? devStageOverride
        : Math.max(
            Number(roomState.progression.unlockedStage || 0),
            Number(coopSystem?.campaignLoop?.getUnlockedStage?.() || 0)
          );
    sculptedHud.setProgressionState({
      communeDiscovered: Boolean(roomState.progression.communeDiscovered || effStage >= 1),
      iceUnlocked: Boolean(roomState.progression.iceUnlocked || effStage >= 1),
      fireUnlocked: Boolean(roomState.progression.fireUnlocked || effStage >= 2),
      ultimateUnlocked: Boolean(roomState.progression.ultimateUnlocked || effStage >= 3),
      unlockedStage: effStage,
      stonesSolved: Math.max(Number(roomState.progression.stonesSolved || 0), effStage),
      stonesSolvedMask: roomState.progression.stonesSolvedMask,
      stone1Solved: roomState.progression.stone1Solved || effStage >= 1,
      stone2Solved: roomState.progression.stone2Solved || effStage >= 2,
      stone3Solved: roomState.progression.stone3Solved || effStage >= 3,
      activeElement:
        coopSystem?.heroStates?.[coopSystem?.player?.activeHeroId]?.selectedElement ||
        roomState.progression.activeElement,
    });
  }
  if (roomState.progression) {
    const effStage =
      devStageOverride !== null
        ? devStageOverride
        : Math.max(
            Number(roomState.progression.unlockedStage || 0),
            Number(coopSystem?.campaignLoop?.getUnlockedStage?.() || 0)
          );
    // May run during createCoopPlayerSystem (coopSystem still in TDZ); the
    // post-construction updateCoopPill call below re-applies it.
    try {
      coopSystem.setUnlockedStage(effStage);
      coopSystem.campaignLoop?.setUnlockedStage?.(
        effStage,
        roomState.progression.stonesSolvedMask
      );
    } catch {
      /* not constructed yet */
    }
  }
}

function playDivineVerdictVoice(judgment) {
  if (!judgment) return null;
  return playWideSurroundDivineVoice(judgment);
}

// Declare camState & camera vectors BEFORE createSculptedHud / createAppFlow
// so applyOpeningFlowCameraAndPoses() never hits a TDZ ReferenceError on boot!
const camState = {
  mode: 'player',
  yaw: Math.PI + 0.18,
  pitch: 0.10,
  dist: 8.6,
  baseFov: 50,
  sensitivity: 'high',
  orbitCooldown: 0,
  vistaPos: new THREE.Vector3(5.2, 3.8, 23.2),
  vistaTarget: new THREE.Vector3(-3.2, 5.8, -16.0),
};

let activeViewId = 'plaza';
let elapsed = 0;
let windElapsed = 0;
let activeGameplayShotSpec = null;
const _meadowFocus = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _camShake = new THREE.Vector3();
const _camImpactPos = new THREE.Vector3();
const _camImpactLook = new THREE.Vector3();
const _camImpactFov = { value: 0 };
const _vfxLookOffset = new THREE.Vector3();

const STONE_ID_TO_LEGACY = Object.freeze({
  site1_well: 'stone_plaza',
  site1: 'stone_plaza',
  stone_plaza: 'stone_plaza',
  plaza: 'stone_plaza',
  well: 'stone_plaza',
  site2_platform: 'stone_grove',
  site2: 'stone_grove',
  stone_grove: 'stone_grove',
  grove: 'stone_grove',
  platform: 'stone_grove',
  site3_wall: 'stone_pier',
  site3: 'stone_pier',
  stone_pier: 'stone_pier',
  pier: 'stone_pier',
  wall: 'stone_pier',
  cottage_wall: 'stone_pier',
});

function normalizeLegacyStoneId(idOrObj) {
  const raw =
    typeof idOrObj === 'object' && idOrObj !== null
      ? idOrObj.legacyId || idOrObj.id || idOrObj.siteId || idOrObj.siteKey
      : idOrObj;
  const key = String(raw || '').trim().toLowerCase();
  return STONE_ID_TO_LEGACY[key] || 'stone_plaza';
}

const stoneGazeState = {
  activeStoneId: null,
  nearbyStone: null,
  inspectActive: false,
  inspectBlend: 0,
  inspectPos: new THREE.Vector3(),
  inspectTarget: new THREE.Vector3(),
  inspectFov: 38,
  shoulderBlend: 0,
  cameraLookDot: 0,
  inActiveMeleeDanger: false,
  stones: {
    stone_plaza: { id: 'stone_plaza', canonicalId: 'site1_well', gazeElapsed: 0, unlocked: false },
    stone_pier: { id: 'stone_pier', canonicalId: 'site3_wall', gazeElapsed: 0, unlocked: false },
    stone_grove: { id: 'stone_grove', canonicalId: 'site2_platform', gazeElapsed: 0, unlocked: false },
  },
};

function isTextInputFocused() {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    Boolean(el.isContentEditable)
  );
}

export function isUiOverlayBlockingInput() {
  if (isTextInputFocused()) return true;
  if (appFlow && typeof appFlow.isInGame === 'function' && !appFlow.isInGame()) {
    return true;
  }
  if (sculptedHud?.isModalOpen?.()) return true;
  return false;
}

/* ------------------------------------------------------------------------- */
/* 6B. Pure 3D Inscribed Stone Geometry (SVG Borders + 3D Vector Font Poems) */
/* ------------------------------------------------------------------------- */

let SPOILER_SAFE_STONE_POEMS = null;

function getSpoilerSafeStonePoems() {
  if (SPOILER_SAFE_STONE_POEMS) return SPOILER_SAFE_STONE_POEMS;
  const src = UNSPOILED_SACRED_POEM_BY_STONE_ID || {};
  SPOILER_SAFE_STONE_POEMS = Object.freeze({
    stone_plaza: Object.freeze({
      title: src.stone_plaza?.title || '',
      lines: src.stone_plaza?.lines || [],
      secondStanza: src.stone_plaza?.secondStanza || [],
    }),
    stone_grove: Object.freeze({
      title: src.stone_grove?.title || '',
      lines: src.stone_grove?.lines || [],
      secondStanza: src.stone_grove?.secondStanza || [],
    }),
    stone_pier: Object.freeze({
      name: "Hidden Lovers' Wall of the Mill Courtyard",
      title: src.stone_pier?.title || '',
      lines: src.stone_pier?.lines || [],
      secondStanza: src.stone_pier?.secondStanza || [],
    }),
  });
  return SPOILER_SAFE_STONE_POEMS;
}

/**
 * Builds a high-contrast, deeply chiseled 3D Inscription Plaque Mesh for each stone
 * (`stone_plaza`, `stone_grove`, `stone_pier`) offset +10mm along the surface normal
 * with polygonOffset so it is never occluded by the stone mesh at any camera distance.
 */
async function buildCrisp3DCarvedPoemMeshAsync(stoneId, poemObj, maxAnisotropy = 8, slicer = null) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const lines = poemObj?.lines || [];
  const isWell = stoneId === 'stone_plaza';
  const isGrove = stoneId === 'stone_grove';

  ctx.textBaseline = 'middle';
  const fontSize = isWell ? 70 : 80;
  const lineH = isWell ? 114 : 122;
  const startY = (canvas.height - (lines.length - 1) * lineH) * 0.5;

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '');
    const y = startY + i * lineH + (i >= 4 ? (isWell ? 10 : 14) : isWell ? -10 : -14);

    ctx.font = `700 ${fontSize}px "Playfair Display", "Cormorant Garamond", Georgia, serif`;
    ctx.textAlign = 'center';
    const cx = canvas.width * 0.5;
    // Sunlit lower-right chiseled bevel lip
    ctx.fillStyle = 'rgba(255, 250, 235, 0.94)';
    ctx.fillText(line, cx + 3.0, y + 3.0);
    // Deep chiseled V-groove dark sepia / gilded bronze
    ctx.fillStyle = isGrove ? '#291c0e' : '#1e1610';
    ctx.fillText(line, cx, y);
    if (slicer) await slicer.maybeYield();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });

  let geo = null;
  let mesh = null;
  if (stoneId === 'stone_pier') {
    // Centered inside the smooth recessed stone tablet on the Lovers' Wall (max z = 0.2069m -> +17mm @ 0.224m)
    geo = new THREE.PlaneGeometry(1.88, 0.90);
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0.0, 0.77, 0.224);
  } else if (stoneId === 'stone_grove') {
    // Centered strictly inside the flat recessed Whispering Grove floor tablet (max y = 0.1604m -> +19.6mm @ 0.180m)
    geo = new THREE.PlaneGeometry(2.04, 1.28);
    geo.rotateX(-Math.PI * 0.5);
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0.0, 0.180, 0.02);
  } else {
    // Proud of the curved sandstone plaque of the Village Well (max r = 1.2197m -> +16.3mm @ r = 1.236m)
    geo = new THREE.CylinderGeometry(1.236, 1.236, 0.44, 48, 1, true, -0.44, 0.88);
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0.0, 0.49, 0.0);
  }
  mesh.name = `MonumentCalligraphy_${stoneId}`;
  mesh.renderOrder = 6;
  return mesh;
}

function shouldMaskStoneSpoilers() {
  if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location?.search || '');
    if (params.get('maskSpoilers') === '1') return true;
  }
  return false;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

const monumentShaderMats = [];

function createSacredStoneCalligraphyDecals(targetScene, sampleGroundY, GLTFLoaderCtor, slicer = null) {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'sacredStoneCalligraphyDecalsGroup';
  targetScene.add(rootGroup);

  const gltfLoader = new GLTFLoaderCtor();
  const decalEntries = {};
  const useExposedPreview = shouldMaskStoneSpoilers();
  const suffix = useExposedPreview ? 'exposed' : 'live';

  const MODEL_PATHS = {
    stone_plaza: `./assets/models/inscriptions/site1-well-${suffix}.glb`,
    stone_grove: `./assets/models/inscriptions/site2-grove-${suffix}.glb`,
    stone_pier: `./assets/models/inscriptions/site3-wall-${suffix}.glb`,
  };

  const loadJobs = [];
  const glbProgressBySite = { stone_plaza: 0, stone_grove: 0, stone_pier: 0 };
  const reportGlbDownloadProgress = () => {
    if (typeof window === 'undefined' || typeof window.__setBootProgress !== 'function') return;
    const avg =
      (glbProgressBySite.stone_plaza +
        glbProgressBySite.stone_grove +
        glbProgressBySite.stone_pier) /
      3;
    const baseFloor = window.__BOOT_PROGRESS_FLOOR__ || 0.50;
    if (baseFloor >= 0.48 && baseFloor < 0.64) {
      window.__setBootProgress(Math.max(baseFloor, 0.52 + avg * 0.08), 0.68);
    }
  };

  const spoilerPoems = getSpoilerSafeStonePoems();
  for (const st of INSCRIPTION_STONES) {
    const fallbackVerse = spoilerPoems[st.id] || spoilerPoems.stone_plaza;

    const holder = new THREE.Group();
    holder.name = `stoneCalligraphy3D_${st.id}`;
    const sy = sampleGroundY(st.x, st.z);
    holder.position.set(st.x, sy, st.z);
    holder.rotation.y = st.rotY || 0;
    rootGroup.add(holder);

    const mountTargets = [];
    let wellWaterMesh = null;
    if (st.id === 'stone_plaza') {
      // Site 1: Mounted at the Village Well (0, 0, 0)
      const wellGroup = new THREE.Group();
      wellGroup.position.set(0 - st.x, 0 - sy, 0 - st.z);
      holder.add(wellGroup);
      mountTargets.push(wellGroup);

      // Luminous Ghibli Wellspring Water surface inside the well cylinder (`y = 0.38m`, `r = 0.88m`)
      const wellWaterGeo = new THREE.CircleGeometry(0.88, 48);
      wellWaterGeo.rotateX(-Math.PI * 0.5);
      const wellWaterMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 1.25 },
          uSunDir: {
            value: sky?.activeLightDir
              ? sky.activeLightDir.clone()
              : new THREE.Vector3(-0.38, 0.80, 0.46).normalize(),
          },
          uDaylight: { value: sky?.state?.daylight ?? 1.0 },
          uLightTint: {
            value: sky?.state?.worldTint
              ? sky.state.worldTint.clone()
              : new THREE.Color(1, 1, 1),
          },
          uFogColor: {
            value: sky?.state?.fogColor
              ? sky.state.fogColor.clone()
              : new THREE.Color(0xd8eef5),
          },
        },
        vertexShader: /* glsl */ `
          varying vec2 vWellUv;
          varying vec3 vWorldPos;
          void main() {
            vWellUv = position.xz;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uSunDir;
          uniform float uDaylight;
          uniform vec3 uLightTint;
          varying vec2 vWellUv;
          varying vec3 vWorldPos;

          float hash21(vec2 p) {
            p = fract(p * vec2(234.34, 435.345));
            p += dot(p, p + 34.23);
            return fract(p.x * p.y);
          }

          float noise2(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
              mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }

          void main() {
            float r = length(vWellUv);
            float n1 = noise2(vWellUv * 4.8 + vec2(uTime * 0.18, -uTime * 0.14));
            float n2 = noise2(vWellUv * 9.5 - vec2(uTime * 0.22, uTime * 0.19));
            float nCombine = n1 * 0.6 + n2 * 0.4;

            // Deep emerald-cerulean center -> luminous aqua-teal mid -> shallow stone rim
            vec3 deepCol = vec3(0.07, 0.30, 0.38);
            vec3 midCol = vec3(0.14, 0.48, 0.56);
            vec3 shallowCol = vec3(0.26, 0.64, 0.68);
            vec3 col = mix(deepCol, midCol, smoothstep(0.05, 0.58, r + (n1 - 0.5) * 0.12));
            col = mix(col, shallowCol, smoothstep(0.52, 0.78, r));

            // Concentric spring ripples & caustic network
            float rippleWave = sin(r * 26.0 - uTime * 1.8 + nCombine * 4.2);
            float rippleRing = smoothstep(0.62, 0.92, rippleWave) * (1.0 - smoothstep(0.72, 0.85, r));
            float caustic = smoothstep(0.64, 0.86, nCombine) * (1.0 - smoothstep(0.74, 0.86, r));
            col += vec3(0.24, 0.42, 0.44) * (rippleRing * 0.42 + caustic * 0.38);

            // Soft sky/sunlight specular shimmer on the water surface
            float spec = smoothstep(0.72, 0.94, noise2(vWellUv * 6.2 + vec2(0.4, -0.6) + uTime * 0.12));
            col += vec3(0.35, 0.46, 0.48) * spec * 0.35;

            // Crisp foam meniscus ring & dark wet-brick shadow around the masonry wall
            float foamLine = smoothstep(0.75, 0.79, r) * (1.0 - smoothstep(0.79, 0.82, r));
            col = mix(col, vec3(0.72, 0.88, 0.90), foamLine * 0.55);
            float wallShadow = smoothstep(0.76, 0.86, r);
            col *= 1.0 - wallShadow * 0.48;

            // Time-of-Day atmosphere sync (Day / Sunset / Starlit Night)
            float dayLuma = dot(uLightTint, vec3(0.3333));
            float isNight = 1.0 - smoothstep(0.35, 0.65, dayLuma);
            float isEvening = smoothstep(0.08, 0.22, uLightTint.r - uLightTint.b) * (1.0 - isNight);
            col = mix(col, col * vec3(1.10, 0.76, 0.62), isEvening * 0.55);
            col = mix(col, col * vec3(0.38, 0.50, 0.82), isNight * 0.58);
            col *= uLightTint;

            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      });
      monumentShaderMats.push(wellWaterMat);
      wellWaterMesh = new THREE.Mesh(wellWaterGeo, wellWaterMat);
      wellWaterMesh.name = 'Site1_WellSpringWater';
      wellWaterMesh.position.set(0, 0.38, 0);
      wellGroup.add(wellWaterMesh);
    } else if (st.id === 'stone_grove') {
      // Site 2: Mounted atop the Far East Whispering Grove Sanctuary Dais (142, sy, 44)
      const groveGroup = new THREE.Group();
      groveGroup.position.set(0, 0, 0);
      groveGroup.rotation.y = -(st.rotY || 0);
      holder.add(groveGroup);
      mountTargets.push(groveGroup);
    } else if (st.id === 'stone_pier') {
      // Site 3: Mounted at the Southwest Lovers' Wall Sanctuary (-124.0, sy, 84.0, rotY = 0.45)
      const cottageWallGroup = new THREE.Group();
      const cwX = st.x;
      const cwZ = st.z;
      const cwY = sampleGroundY(cwX, cwZ);
      holder.position.set(cwX, cwY, cwZ);
      holder.rotation.y = st.rotY ?? 0.45;
      holder.add(cottageWallGroup);
      mountTargets.push(cottageWallGroup);
    }

    const worldX = st.id === 'stone_plaza' ? 0.0 : st.x;
    const worldZ = st.id === 'stone_plaza' ? 0.0 : st.z;
    const worldY = sampleGroundY(worldX, worldZ);

    const entry = {
      id: st.id,
      worldX,
      worldY,
      worldZ,
      holder,
      mountTargets,
      wellWaterMesh,
      lodSets: [],
      materials: [],
      title: fallbackVerse.title,
      lines: [...fallbackVerse.lines],
      secondStanza: [...fallbackVerse.secondStanza],
      redraw() {},
    };
    decalEntries[st.id] = entry;

    const url = MODEL_PATHS[st.id];
    const fallbackUrl = `./assets/models/inscriptions/${
      st.id === 'stone_plaza'
        ? 'site1-well-exposed.glb'
        : st.id === 'stone_grove'
          ? 'site2-grove-exposed.glb'
          : 'site3-wall-exposed.glb'
    }`;

    const siteIdValue =
      st.id === 'stone_plaza' ? 1.0 : st.id === 'stone_grove' ? 2.0 : 3.0;

    const createGhibliMonumentShaderMaterial = (_srcMat, hasColorAttr) => {
      const mat = new THREE.ShaderMaterial({
        side: THREE.FrontSide,
        uniforms: {
          uHasVertexColor: { value: hasColorAttr ? 1.0 : 0.0 },
          uSiteId: { value: siteIdValue },
          uSunDir: {
            value: sky?.activeLightDir
              ? sky.activeLightDir.clone()
              : new THREE.Vector3(-0.38, 0.80, 0.46).normalize(),
          },
          uDaylight: { value: sky?.state?.daylight ?? 1.0 },
          uLightTint: {
            value: sky?.state?.worldTint
              ? sky.state.worldTint.clone()
              : new THREE.Color(1, 1, 1),
          },
          uFogColor: {
            value: sky?.state?.fogColor
              ? sky.state.fogColor.clone()
              : new THREE.Color(0xd8eef5),
          },
          uFogNear: { value: 185.0 },
          uFogFar: { value: 580.0 },
        },
        vertexShader: /* glsl */ `
          ${hasColorAttr ? 'attribute vec4 color;' : ''}
          varying vec3 vLocalPos;
          varying vec3 vLocalNormal;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying vec3 vColor;
          varying float vViewDist;
          void main() {
            vLocalPos = position.xyz;
            vLocalNormal = normalize(normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * normal);
            vColor = ${hasColorAttr ? 'color.rgb' : 'vec3(0.68, 0.59, 0.45)'};
            vec4 mv = viewMatrix * wp;
            vViewDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uSiteId;
          uniform vec3 uSunDir;
          uniform float uDaylight;
          uniform vec3 uLightTint;
          uniform vec3 uFogColor;
          uniform float uFogNear;
          uniform float uFogFar;
          varying vec3 vLocalPos;
          varying vec3 vLocalNormal;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying vec3 vColor;
          varying float vViewDist;

          float hash31(vec3 p) {
            p = fract(p * vec3(443.897, 441.423, 437.195));
            p += dot(p, p.yzx + 19.19);
            return fract((p.x + p.y) * p.z);
          }

          float noise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(
                mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
                mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x),
                f.y
              ),
              mix(
                mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
                mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x),
                f.y
              ),
              f.z
            );
          }

          void main() {
            vec3 n = normalize(vWorldNormal);
            vec3 ln = normalize(vLocalNormal);

            vec3 sunDir = normalize(uSunDir);
            vec3 localKey = normalize(vec3(-0.34, 0.68, 0.65));
            float ndl = mix(dot(ln, localKey), dot(n, sunDir), 0.22);
            float hemi = n.y * 0.5 + 0.5;

            float lum = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
            bool isPoemDark = (lum < 0.085 && vColor.r >= vColor.g);
            bool isPoemLip = (lum > 0.75);
            bool isBotanicalGreen = (vColor.g > vColor.r * 1.03 && vColor.g > vColor.b * 1.20);

            // Multi-scale 3D procedural travertine / sandstone grain & micro-pitting
            float strata = noise3(vec3(vLocalPos.x * 3.2 + vLocalPos.y * 1.5, vLocalPos.y * 6.5, vLocalPos.z * 3.2));
            float medGrain = noise3(vLocalPos * 14.0 + vec3(2.3, 5.1, 1.7));
            float fineGrain = noise3(vLocalPos * 42.0);
            float microPit = smoothstep(0.75, 0.94, noise3(vLocalPos * 68.0));

            vec3 col = vColor;

            if (isPoemDark) {
              // Deep chiseled V-groove serif inscription
              float cutGrain = 0.94 + (fineGrain - 0.5) * 0.10;
              float cutLight = 0.86 + 0.18 * clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
              col *= cutGrain * cutLight;
            } else if (isPoemLip) {
              // Sunlit lower-right bevel edge of chiseled letters
              col *= 0.95 + 0.14 * clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
            } else if (isBotanicalGreen) {
              // Natural mortar-joint & crevice moss (velvety matte micro-grain)
              float mossTex = 0.90 + (medGrain - 0.5) * 0.14 + (fineGrain - 0.5) * 0.12;
              float mossLight = 0.68 + 0.38 * smoothstep(-0.40, 0.75, ndl) + 0.08 * hemi;
              col *= mossLight * mossTex;
            } else {
              // Smoothly sculpted warm sandstone / travertine relief, honed plaque & quarried ashlar blocks
              float diffuse = smoothstep(-0.55, 0.85, ndl);
              float reliefShade = 0.64 + 0.40 * diffuse + 0.10 * hemi;

              // Subtle travertine strata veining, medium mottling, fine sand grain, and micro-pits
              float stoneTex = 0.96 + (strata - 0.5) * 0.06 + (medGrain - 0.5) * 0.05 + (fineGrain - 0.5) * 0.05 - microPit * 0.05;
              col *= reliefShade * stoneTex;

              // Soft grazing rim warmth on upward-facing sculpted petals, leaves & coping rims
              vec3 viewDir = normalize(cameraPosition - vWorldPos);
              float rim = pow(1.0 - max(0.0, dot(n, viewDir)), 3.0) * max(0.0, n.y) * max(0.0, ndl);
              col += vec3(0.09, 0.07, 0.05) * rim;
            }

            // Full Day / Evening / Night environment shading modulation (matching trees.js & terrain-water.js!)
            float dayLuma = dot(uLightTint, vec3(0.3333));
            float isNight = 1.0 - smoothstep(0.35, 0.65, dayLuma);
            float isEvening = smoothstep(0.08, 0.22, uLightTint.r - uLightTint.b) * (1.0 - isNight);
            col = mix(col, col * vec3(1.06, 0.72, 0.58), isEvening * 0.58);
            col = mix(col, col * vec3(0.36, 0.46, 0.76), isNight * 0.62);
            col *= uLightTint;

            float fogFactor = smoothstep(uFogNear, uFogFar, vViewDist);
            col = mix(col, uFogColor, fogFactor);

            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      });
      monumentShaderMats.push(mat);
      entry.materials.push(mat);
      return mat;
    };

    const attachScene = async (gltf) => {
      if (!gltf?.scene) return;
      gltf.scene.updateMatrixWorld(true);

      const bakedLods = { lod_inspect: null, lod_near: null, lod_far: null };
      const fallbackMeshes = [];

      gltf.scene.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        const nameLower = String(child.name || child.parent?.name || '').toLowerCase();
        if (nameLower === 'lod_inspect' || nameLower.endsWith('_inspect')) {
          bakedLods.lod_inspect = child.geometry;
        } else if (nameLower === 'lod_near' || nameLower.endsWith('_near')) {
          bakedLods.lod_near = child.geometry;
        } else if (nameLower === 'lod_far' || nameLower.endsWith('_far')) {
          bakedLods.lod_far = child.geometry;
        } else {
          fallbackMeshes.push(child.geometry);
        }
      });

      const inspectGeo = bakedLods.lod_inspect || fallbackMeshes[0] || bakedLods.lod_near || bakedLods.lod_far;
      const nearGeo = bakedLods.lod_near || inspectGeo || bakedLods.lod_far;
      const farGeo = bakedLods.lod_far || nearGeo || inspectGeo;
      if (!inspectGeo && !nearGeo && !farGeo) return;

      for (const g of [inspectGeo, nearGeo, farGeo]) {
        if (!g) continue;
        if (!g.attributes.color) {
          const altColor =
            g.attributes._col_baked ||
            g.attributes.col_baked ||
            g.attributes._col_curvature ||
            g.attributes.col_curvature ||
            null;
          if (altColor) {
            g.setAttribute('color', altColor);
          }
        }
        if (!g.attributes.normal) {
          g.computeVertexNormals();
        }
        if (!g.boundingSphere) {
          g.computeBoundingSphere();
        }
        if (slicer) await slicer.maybeYield();
      }

      const hasColorAttr = Boolean((inspectGeo || nearGeo || farGeo)?.attributes?.color);
      const unifiedMat = createGhibliMonumentShaderMaterial(null, hasColorAttr);
      const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 8;

      for (const target of mountTargets) {
        const inspectStoneMesh = new THREE.Mesh(inspectGeo, unifiedMat);
        inspectStoneMesh.name = `UnifiedMonument_${st.id}_inspect`;
        inspectStoneMesh.frustumCulled = true;
        inspectStoneMesh.visible = false;
        target.add(inspectStoneMesh);

        const nearStoneMesh = new THREE.Mesh(nearGeo, unifiedMat);
        nearStoneMesh.name = `UnifiedMonument_${st.id}`;
        nearStoneMesh.frustumCulled = true;
        nearStoneMesh.visible = false;
        target.add(nearStoneMesh);

        const farStoneMesh = new THREE.Mesh(farGeo, unifiedMat);
        farStoneMesh.name = `UnifiedMonument_${st.id}_far`;
        farStoneMesh.frustumCulled = true;
        farStoneMesh.visible = true;
        target.add(farStoneMesh);

        if (slicer) await slicer.maybeYield();
        const calligraphyMesh = await buildCrisp3DCarvedPoemMeshAsync(
          st.id,
          fallbackVerse,
          maxAniso,
          slicer
        );
        if (calligraphyMesh) {
          target.add(calligraphyMesh);
        }

        entry.lodSets.push({
          target,
          inspectStoneMesh,
          nearStoneMesh,
          farStoneMesh,
          calligraphyMesh,
        });
      }
      updateMonumentLodForCamera(camera);
    };

    const loadWithProgress = (targetUrl) =>
      new Promise((resolve, reject) => {
        gltfLoader.load(
          targetUrl,
          (gltf) => {
            glbProgressBySite[st.id] = 1.0;
            reportGlbDownloadProgress();
            resolve(gltf);
          },
          (ev) => {
            if (ev && ev.lengthComputable && ev.total > 0) {
              glbProgressBySite[st.id] = Math.min(0.98, ev.loaded / ev.total);
            } else if (ev && ev.loaded > 0) {
              glbProgressBySite[st.id] = Math.min(0.92, ev.loaded / (1.8 * 1024 * 1024));
            }
            reportGlbDownloadProgress();
          },
          (err) => reject(err)
        );
      });

    const job = (async () => {
      try {
        const gltf = await loadWithProgress(url);
        if (slicer) await slicer.maybeYield();
        await attachScene(gltf);
      } catch {
        if (url !== fallbackUrl) {
          try {
            const gltf2 = await loadWithProgress(fallbackUrl);
            if (slicer) await slicer.maybeYield();
            await attachScene(gltf2);
          } catch {
            // ignore missing optional stone model
          }
        }
      }
    })();
    loadJobs.push(job);
  }

  function updateMonumentLodForCamera(cam) {
    const cx = cam?.position?.x ?? 0;
    const cy = cam?.position?.y ?? 0;
    const cz = cam?.position?.z ?? 0;
    const activeLegacyId = stoneGazeState.activeStoneId
      ? normalizeLegacyStoneId(stoneGazeState.activeStoneId)
      : null;
    for (const st of INSCRIPTION_STONES) {
      const entry = decalEntries[st.id];
      if (!entry || !entry.lodSets || entry.lodSets.length === 0) continue;
      const dist = Math.hypot(cx - entry.worldX, cy - entry.worldY, cz - entry.worldZ);
      const matchesActive = activeLegacyId === entry.id;
      const isInspect =
        (stoneGazeState.inspectActive && matchesActive) ||
        (stoneGazeState.inspectBlend > 0.01 && matchesActive) ||
        dist <= 9.5;
      const isNear = !isInspect && dist <= 22.0;
      const isFar = !isInspect && !isNear;
      const hideFarOnTablet = activeProfile === 'tablet' && !isInspect && dist > 82.0;
      if (entry.wellWaterMesh) {
        entry.wellWaterMesh.visible = !hideFarOnTablet;
      }

      for (const set of entry.lodSets) {
        if (set.inspectStoneMesh) set.inspectStoneMesh.visible = isInspect;
        if (set.nearStoneMesh) set.nearStoneMesh.visible = isNear;
        if (set.farStoneMesh) set.farStoneMesh.visible = isFar && !hideFarOnTablet;
        if (set.calligraphyMesh) set.calligraphyMesh.visible = dist <= 32.0 || isInspect;
      }
    }
  }

  return {
    group: rootGroup,
    entries: decalEntries,
    updateLod: updateMonumentLodForCamera,
    readyPromise: Promise.allSettled(loadJobs),
  };
}

/* ------------------------------------------------------------------------- */
/* 7. Stage 3–5 Co-Op Player System, Shader Prewarm & Early AppFlow Curtain  */
/* ------------------------------------------------------------------------- */

function mountOpeningAppFlowEarly() {
  appFlow = createAppFlow({
    container: document.getElementById('hud'),
    onCreateWorld: ({ roomPhrase, role }) => {
      if (!coopSystem) return;
      coopSystem.combatSfx?.playUi?.('click');
      if (role) {
        coopSystem.coopClient.setPreferredRole(role);
      }
      coopSystem.coopClient.setRoomCode(roomPhrase);
      updateCoopPill({
        ...coopSystem.coopClient.getState(),
        roomPhrase,
      });
    },
    onJoinWorld: ({ roomPhrase, role }) => {
      if (!coopSystem) return;
      coopSystem.combatSfx?.playUi?.('click');
      if (role) {
        coopSystem.coopClient.setPreferredRole(role);
      }
      coopSystem.coopClient.setRoomCode(roomPhrase);
      updateCoopPill({
        ...coopSystem.coopClient.getState(),
        roomPhrase,
      });
    },
    onRoleSelect: (nextRole) => {
      if (!coopSystem) return;
      coopSystem.combatSfx?.playUi?.('hero_swap');
      if (typeof coopSystem.coopClient.sendLobbyClaim !== 'function') {
        coopSystem.coopClient.setPreferredRole(nextRole);
      }
    },
    onLobbyClaim: (claim = {}) => {
      if (!coopSystem) return;
      if (typeof coopSystem.coopClient.sendLobbyClaim === 'function') {
        coopSystem.coopClient.sendLobbyClaim(claim);
      } else if (claim.role) {
        coopSystem.coopClient.setPreferredRole(claim.role);
      }
    },
    onToggleReady: (ready, flowState) => {
      if (!coopSystem) return;
      coopSystem.combatSfx?.playUi?.('click');
      coopSystem.coopClient.sendLobbyClaim?.({
        role: flowState?.localRole || coopSystem.player?.activeHeroId || 'Knight',
        playerName: flowState?.playerName || '',
        claimed: Boolean(ready),
      });
      coopSystem.coopClient.setReady?.(ready);
    },
    onStartGame: (payload = {}) => {
      if (!coopSystem) return;
      coopSystem.combatSfx?.playUi?.('modal_open');
      const isPeerConnected = Boolean(
        payload?.peerConnected || coopSystem.coopClient?.getState?.()?.peerConnected
      );
      const chosenRole =
        payload?.localRole || payload?.role || appFlow?.getState?.()?.localRole;
      if (
        chosenRole &&
        coopSystem.player.activeHeroId !== chosenRole &&
        !isPeerConnected
      ) {
        coopSystem.swapActiveHero();
      }
      const activeRole = coopSystem.player.activeHeroId || 'Knight';
      const pName = String(
        payload?.playerName || appFlow?.getState?.()?.playerName || ''
      ).trim();
      const partnerName = String(
        payload?.partnerName || appFlow?.getState?.()?.partnerName || ''
      ).trim();
      const kName =
        payload?.knightName ||
        (activeRole === 'Knight' ? pName || 'Knight' : partnerName || 'Knight');
      const mName =
        payload?.mageName ||
        (activeRole === 'Mage' ? pName || 'Mage' : partnerName || 'Mage');
      sculptedHud?.setPlayerNames?.({
        Knight: kName,
        Mage: mName,
        knight: kName,
        mage: mName,
        primaryName: pName || activeRole,
        partnerName: partnerName || (activeRole === 'Knight' ? 'Mage' : 'Knight'),
        playerName: pName || activeRole,
        localRole: activeRole,
        peerConnected: isPeerConnected,
      });

      const urlParams = new URLSearchParams(window.location?.search || '');
      const hasExplicitUrlDev =
        urlParams.get('dev') === '1' || urlParams.get('stage') === '3';
      if (payload?.soloTest || hasExplicitUrlDev) {
        if (devStageOverride === null) {
          devStageOverride = 3;
        }
      } else {
        devStageOverride = null;
      }

      if (devStageOverride === null) {
        coopSystem.setUnlockedStage?.(0);
        coopSystem.campaignLoop?.setUnlockedStage?.(0, 0);
        if (coopSystem.campaignLoop?.combatHeroes?.Knight) {
          coopSystem.campaignLoop.combatHeroes.Knight.qEnergy = 0;
          coopSystem.campaignLoop.combatHeroes.Knight.qEnergyPct = 0;
        }
        if (coopSystem.campaignLoop?.combatHeroes?.Mage) {
          coopSystem.campaignLoop.combatHeroes.Mage.qEnergy = 0;
          coopSystem.campaignLoop.combatHeroes.Mage.qEnergyPct = 0;
        }
        if (
          !payload?.fromRemoteExpeditionStart &&
          !coopSystem.coopClient?.getState?.()?.expeditionStarted
        ) {
          coopSystem.coopClient.startExpedition({ resetProgression: true });
        }
        sculptedHud?.setProgressionState?.({
          communeDiscovered: false,
          iceUnlocked: false,
          fireUnlocked: false,
          ultimateUnlocked: false,
          unlockedStage: 0,
          stonesSolved: 0,
          stonesSolvedMask: 0,
          stone1Solved: false,
          stone2Solved: false,
          stone3Solved: false,
        });
        updateCombatHud(coopSystem.campaignLoop.getStateSnapshot(coopSystem.heroStates));
      } else {
        const stage = devStageOverride;
        const updated = coopSystem.coopClient.progression.setUnlocks({
          communeDiscovered: stage >= 1,
          iceUnlocked: stage >= 1,
          fireUnlocked: stage >= 2,
          ultimateUnlocked: stage >= 3,
          stone1Solved: false,
          stone2Solved: false,
          stone3Solved: false,
          stonesSolvedMask: 0,
        });
        coopSystem.setUnlockedStage?.(stage);
        coopSystem.campaignLoop?.setUnlockedStage?.(stage, 0);
        if (stage >= 3) {
          if (coopSystem.campaignLoop?.combatHeroes?.Knight) {
            coopSystem.campaignLoop.combatHeroes.Knight.qEnergy = 100;
            coopSystem.campaignLoop.combatHeroes.Knight.qEnergyPct = 1.0;
          }
          if (coopSystem.campaignLoop?.combatHeroes?.Mage) {
            coopSystem.campaignLoop.combatHeroes.Mage.qEnergy = 160;
            coopSystem.campaignLoop.combatHeroes.Mage.qEnergyPct = 1.0;
          }
        }
        coopSystem.coopClient.startExpedition();
        sculptedHud?.setProgressionState?.(updated);
        updateCombatHud(coopSystem.campaignLoop.getStateSnapshot(coopSystem.heroStates));
      }
      coopSystem.teleportLeaderAndPartner(0.0, 124.0, Math.PI);
      camState.mode = 'player';
      camState.yaw = Math.PI;
      camState.pitch = 0.14;
      camState.dist = 8.4;
      sculptedHud?.setVisible(true);
      updateCoopPill(coopSystem.coopClient.getState());
      updateCamera();
    },
    onFlowStepChanged: (step) => {
      if (coopSystem) {
        applyOpeningFlowCameraAndPoses(step, { renderNow: Boolean(window.__WORLD_VISUAL_READY__) });
      }
    },
  });
  if (typeof window !== 'undefined') {
    window.__APP_FLOW__ = appFlow;
  }
}

async function prewarmAllVfxAndSceneShadersAsync() {
  if (!scene || !renderer || !camera) return;

  // Wait briefly if bakedShadowAO PNG hasn't swapped in yet so it warms in boot rather than mid-dissolve
  const aoTex = terrainKit?.bakedShadowAOTex;
  if (aoTex && aoTex.userData && !aoTex.userData.loaded && typeof document !== 'undefined') {
    const aoWaitStart = Date.now();
    while (!aoTex.userData.loaded && Date.now() - aoWaitStart < 120) {
      await bootSlicer.yieldNow();
    }
  }

  // 1. Decode any HTMLImageElement textures off the main thread, then upload each unique texture within slice budget
  const uniqueTextures = new Set();
  const collectTex = (val) => {
    if (val && val.isTexture) uniqueTextures.add(val);
  };
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      collectTex(mat.map);
      collectTex(mat.gradientMap);
      collectTex(mat.alphaMap);
      collectTex(mat.emissiveMap);
      collectTex(mat.normalMap);
      collectTex(mat.roughnessMap);
      if (mat.uniforms) {
        for (const u of Object.values(mat.uniforms)) {
          collectTex(u?.value);
        }
      }
    }
  });

  for (const tx of uniqueTextures) {
    if (typeof HTMLImageElement !== 'undefined' && tx.image instanceof HTMLImageElement) {
      try {
        await tx.image.decode?.();
      } catch {
        // ignore decode error
      }
      await bootSlicer.maybeYield();
    }
    try {
      renderer.initTexture(tx);
    } catch {
      // ignore
    }
    await bootSlicer.maybeYield();
  }

  // 2. Compile one representative mesh per unique material in ONE parallel batch against composer renderTarget1
  const allMeshes = [];
  const seenMatKeys = new Set();
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const key = `${obj.isSkinnedMesh ? 'S' : obj.isInstancedMesh ? 'I' : 'M'}:${mats
      .map((mt) => mt?.uuid || '')
      .join(',')}`;
    if (!seenMatKeys.has(key)) {
      seenMatKeys.add(key);
      allMeshes.push(obj);
    }
  });

  const toggledVisSet = new Set();
  const restoredCounts = [];
  const restoredCulls = [];

  for (let i = 0; i < allMeshes.length; i++) {
    const m = allMeshes[i];
    let cur = m;
    while (cur && cur !== scene) {
      if (!cur.visible) {
        toggledVisSet.add(cur);
        cur.visible = true;
      }
      cur = cur.parent;
    }
    if (m.isInstancedMesh && m.count === 0 && (m.instanceMatrix?.count ?? 1) > 0) {
      restoredCounts.push(m);
      m.count = 1;
    }
    if (m.frustumCulled) {
      restoredCulls.push(m);
      m.frustumCulled = false;
    }
  }

  const prevTarget = renderer.getRenderTarget();
  try {
    if (post?.composer?.renderTarget1) {
      renderer.setRenderTarget(post.composer.renderTarget1);
    }
    if (typeof window !== 'undefined' && typeof window.__setBootProgress === 'function') {
      window.__setBootProgress(0.93, 0.98);
    }
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(scene, camera);
    } else {
      renderer.compile(scene, camera);
    }
  } catch {
    // ignore prewarm compile errors on restricted contexts
  } finally {
    renderer.setRenderTarget(prevTarget);
    for (let i = 0; i < restoredCulls.length; i++) restoredCulls[i].frustumCulled = true;
    for (let i = 0; i < restoredCounts.length; i++) restoredCounts[i].count = 0;
    for (const node of toggledVisSet) node.visible = false;
  }

  if (typeof window !== 'undefined' && typeof window.__setBootProgress === 'function') {
    window.__setBootProgress(0.97, 0.99);
  }
  await bootSlicer.maybeYield();

  // 3. Compile post-processing final ToneGrade quad against default framebuffer
  const gradeQuadMesh = post?.gradePass?.fsQuad?._mesh;
  if (gradeQuadMesh) {
    const prevTarget2 = renderer.getRenderTarget();
    try {
      if (post?.gradePass?.uniforms?.tDepth) {
        const depthTex = post.composer?.readBuffer?.depthTexture || null;
        post.gradePass.uniforms.tDepth.value = depthTex;
        if (post.gradePass.uniforms.uAtmosphere) {
          post.gradePass.uniforms.uAtmosphere.value = depthTex ? 1.0 : 0.0;
        }
      }
      renderer.setRenderTarget(null);
      renderer.compile(gradeQuadMesh, camera);
    } catch {
      // ignore
    } finally {
      renderer.setRenderTarget(prevTarget2);
    }
    await bootSlicer.maybeYield();
  }
}

/* ------------------------------------------------------------------------- */
/* 7A. Wire 3D Floating Genshin Damage Numbers (`damage-numbers.js`)         */
/* ------------------------------------------------------------------------- */

function initDamageNumbersSystem(DamageNumbersModule) {
  const createDamageNumbers =
    DamageNumbersModule.createDamageNumbers ||
    DamageNumbersModule.createDamageNumbersOverlay;
  damageNumbers = createDamageNumbers({
    container: document.getElementById('hud'),
    camera,
  });

  if (coopSystem?.enemyManager) {
    const origApplyHitToEnemy = coopSystem.enemyManager.applyHitToEnemy;
    if (typeof origApplyHitToEnemy === 'function') {
      coopSystem.enemyManager.applyHitToEnemy = function wrappedApplyHitToEnemy(
        enemy,
        hitSpec = {}
      ) {
        const res = origApplyHitToEnemy(enemy, hitSpec);
        if (res) {
          emitFloatingDamageForEnemyHit(enemy, res, hitSpec);
        }
        return res;
      };
    }

    const origApplyAreaOrLineHit = coopSystem.enemyManager.applyAreaOrLineHit;
    if (typeof origApplyAreaOrLineHit === 'function') {
      coopSystem.enemyManager.applyAreaOrLineHit = function wrappedApplyAreaOrLineHit(
        opts = {}
      ) {
        const hits = origApplyAreaOrLineHit(opts);
        if (Array.isArray(hits)) {
          for (const h of hits) {
            if (h?.enemy && h?.result) {
              emitFloatingDamageForEnemyHit(h.enemy, h.result, opts.hitSpec || {});
            }
          }
        }
        return hits;
      };
    }
  }

  coopSystem?.campaignLoop?.setOnFriendlyFireHit?.((targetHeroState, info = {}) => {
    if (damageNumbers && targetHeroState && info.damageDealt > 0 && !stoneGazeState.inspectActive) {
      damageNumbers.spawnDamageNumber({
        amount: info.damageDealt,
        element: info.element || 'fire',
        source: info.source || 'friendly_fire',
        isCrit: true,
        label: 'ROASTED!',
        mergeKey: `friendly_fire_${info.heroId || 'Knight'}_${Date.now()}`,
        duration: 1.05,
        worldPos: {
          x: targetHeroState.x ?? 0,
          y: targetHeroState.y ?? 0,
          z: targetHeroState.z ?? 0,
          heightOffset: 1.85,
        },
      });
    }
    sculptedHud?.triggerDamagePulse?.({
      role: info.heroId || 'Knight',
      damage: info.damageDealt || 15,
      blocked: false,
    });
    if (coopSystem?.campaignLoop && coopSystem?.heroStates) {
      updateCombatHud(coopSystem.campaignLoop.getStateSnapshot(coopSystem.heroStates));
    }
  });

  coopSystem?.campaignLoop?.setOnPlayerDamaged?.((targetHeroState, info = {}) => {
    const dmg = Number(info.damageDealt || 0);
    const absorbed = Number(info.absorbed || 0);
    const blocked = Boolean(info.blockedByShield || (dmg === 0 && absorbed > 0));
    if (damageNumbers && targetHeroState && (dmg > 0 || absorbed > 0) && !stoneGazeState.inspectActive) {
      damageNumbers.spawnDamageNumber({
        amount: dmg > 0 ? dmg : absorbed,
        element: blocked ? 'player-blocked' : 'player-hit',
        source: info.source || 'enemy_attack',
        isCrit: false,
        label: blocked ? 'BLOCKED' : '',
        mergeKey: null,
        duration: blocked ? 0.78 : 0.92,
        worldPos: {
          x: targetHeroState.x ?? 0,
          y: targetHeroState.y ?? 0,
          z: targetHeroState.z ?? 0,
          heightOffset: 1.92,
        },
      });
    }
    sculptedHud?.triggerDamagePulse?.({
      role: info.heroId || 'Knight',
      damage: dmg > 0 ? dmg : absorbed,
      blocked,
    });
    if (coopSystem?.campaignLoop && coopSystem?.heroStates) {
      updateCombatHud(coopSystem.campaignLoop.getStateSnapshot(coopSystem.heroStates));
    }
  });
}

function resolveHitDamageElement(hitSpec = {}, result = {}) {
  const inf = String(hitSpec.infusion || hitSpec.applyMark || '').toLowerCase();
  const src = String(hitSpec.source || result.source || '').toLowerCase();
  if (hitSpec.knightUltActive || inf === 'eclipse') {
    return src === 'combo2' || src === 'combo4' ? 'ice' : 'fire';
  }
  if (inf === 'solar' || src.includes('cinder') || src.includes('fire') || src.includes('burn')) {
    return 'fire';
  }
  if (
    inf === 'rime' ||
    src.includes('frost') ||
    src.includes('shatter') ||
    src.includes('ice') ||
    src.includes('mage_attack') ||
    src.includes('mage_heavy')
  ) {
    return 'ice';
  }
  if (
    inf === 'tempest' ||
    src.includes('storm') ||
    src.includes('lightning') ||
    src.includes('cataclysm')
  ) {
    return 'lightning';
  }
  return 'physical';
}

const PEAK_DAMAGE_SOURCES = new Set([
  'shatterlance',
  'frost_lance',
  'cinder_fall',
  'storm_lance',
  'combo4',
  'heavy',
  'charged',
  'intercept',
  'mage_heavy',
  'couples_ultimate',
  'storm_cataclysm',
]);

function emitFloatingDamageForEnemyHit(enemy, result, hitSpec = {}) {
  if (!damageNumbers || !enemy || !result || stoneGazeState.inspectActive) return;
  const dmg = Number(result.damageDealt || 0);
  if (dmg <= 0) return;

  const src = String(hitSpec.source || result.source || '').toLowerCase();

  // 1. Cross-Element or Finisher Detonation: ONE consolidated callout per explosion
  //    (result.damageDealt already includes the detonation bonus damage!)
  if (result.detonation) {
    const det = result.detonation;
    const detEl =
      det.id === 'solar_flare'
        ? 'fire'
        : det.id === 'shatterblow' || det.id === 'rime_shatter'
          ? 'ice'
          : 'lightning';
    damageNumbers.spawnDamageNumber({
      amount: dmg,
      element: detEl,
      source: det.id || 'detonation',
      isCrit: true,
      label: String(det.label || '').replace(/!/g, ''),
      mergeKey: `detonation_${det.id || 'burst'}`,
      duration: 1.05,
      worldPos: {
        x: det.x ?? enemy.x,
        y: det.y ?? enemy.y,
        z: det.z ?? enemy.z,
        heightOffset: (enemy.isBoss ? 2.25 : 1.75) + 0.2,
      },
    });
    return;
  }

  // 2. Mage Q Sky Meteor Shower (`storm_cataclysm`): ONE single accumulating total counter
  //    above the meteor zone instead of per-meteor per-enemy spam!
  if (src === 'storm_cataclysm') {
    damageNumbers.spawnDamageNumber({
      amount: dmg,
      element: 'fire',
      source: 'storm_cataclysm',
      isCrit: true,
      label: 'STARFALL',
      mergeKey: 'storm_cataclysm_total',
      duration: 1.25,
      worldPos: {
        x: enemy.x,
        y: enemy.y,
        z: enemy.z,
        heightOffset: 2.15,
      },
    });
    return;
  }

  // 3. All Melee Combos, Staff Bolts, Peak Finishers & Signature Skills:
  //    Pop crisp damage numbers on every hit so enemies feel visceral and responsive!
  const isPeakMoment =
    PEAK_DAMAGE_SOURCES.has(src) ||
    Boolean(result.killed && (enemy.isBoss || enemy.isElite));

  const element = resolveHitDamageElement(hitSpec, result);
  damageNumbers.spawnDamageNumber({
    amount: dmg,
    element,
    source: src,
    isCrit: isPeakMoment,
    mergeKey: isPeakMoment
      ? `peak_${src}_${enemy.instanceId || enemy.slotIndex || 0}`
      : null,
    duration: isPeakMoment ? 0.85 : 0.72,
    worldPos: {
      x: enemy.x,
      y: enemy.y,
      z: enemy.z,
      heightOffset: enemy.isBoss ? 2.15 : 1.72,
    },
  });
}

/* ------------------------------------------------------------------------- */
/* 7B. Wave 3 30s Commune Client (with 3D Crimson Rose Ring Timer)           */
/* ------------------------------------------------------------------------- */

let selectedLobbyRole = 'Knight';
let selectedMicDeviceId = '';

function initCommuneClientSystem(createCommuneClientFn) {
  communeClient = createCommuneClientFn({
    scene,
    getGroundHeight: walkableHeightAt,
    coopClient: coopSystem.coopClient,
    endpoint: '/api/commune',
    getContextState: () => {
      const speakerRole = coopSystem.player.activeHeroId || 'Knight';
      const partnerRole = speakerRole === 'Knight' ? 'Mage' : 'Knight';
      const snap = coopSystem.campaignLoop.getStateSnapshot(coopSystem.heroStates);
      const speakerHero = speakerRole === 'Knight' ? snap.knight : snap.mage;
      const partnerHero = partnerRole === 'Knight' ? snap.knight : snap.mage;
      const nearStone = coopSystem.getNearestInscriptionStone?.(6.2) || null;
      const stoneContested = nearStone
        ? Boolean(
            coopSystem.campaignLoop?.isStoneContested?.(nearStone, coopSystem.heroStates)
          )
        : false;
      const nearbyLivingCount =
        coopSystem.campaignLoop?.getNearbyLivingEnemies?.(player, 18.0)?.length ??
        (coopSystem.enemyManager?.activeEnemies?.length || 0);
      const progState = coopSystem.coopClient.getProgressionState();
      const resolvedCommuneMode =
        snap.communeMode === 'divine_miracle' || (snap.miracleReady && !nearStone)
          ? 'divine_miracle'
          : 'normal';
      const effectiveNearStoneId = !stoneContested && nearStone?.id ? nearStone.id : null;
      return {
        room: coopSystem.coopClient.getRoomCode(),
        speakerRole,
        partnerRole,
        nearStoneId: effectiveNearStoneId,
        communeMode: resolvedCommuneMode,
        miracleReady: Boolean(snap.miracleReady),
        stonesSolvedMask: snap.stonesSolvedMask ?? progState?.stonesSolvedMask ?? 0,
        gameState: {
          actId: snap.actId,
          distance: coopSystem.getHeroDistance(),
          speakerHp: speakerHero?.hp ?? 100,
          speakerMaxHp: speakerHero?.maxHp ?? 100,
          partnerHp: partnerHero?.hp ?? 100,
          partnerMaxHp: partnerHero?.maxHp ?? 100,
          partnerDowned: Boolean(partnerHero?.downed),
          inCombat: nearbyLivingCount > 0,
          nearbyEnemies: nearbyLivingCount,
          nearStoneId: effectiveNearStoneId,
          nearestStoneSiteId: effectiveNearStoneId,
          stoneContested,
          communeMode: resolvedCommuneMode,
          miracleReady: Boolean(snap.miracleReady),
          modeAHealCd: snap.modeAHealCd || 0,
          modeBMiracleCd: snap.modeBMiracleCd || 0,
          stoneGuessCd: snap.stoneGuessCd || 0,
          stonesSolvedMask: snap.stonesSolvedMask ?? progState?.stonesSolvedMask ?? 0,
        },
        progressionState: progState,
      };
    },
    onStateChange: (communeSnapshot) => {
      const isListening = communeSnapshot.state === 'listening';
      const isJudging = communeSnapshot.state === 'judging';
      const isSpeaking = communeSnapshot.state === 'speaking';
      communeRBtn?.classList.toggle('channeling', isListening || isSpeaking);
      if (communeSubLbl) {
        communeSubLbl.textContent = isListening
          ? `Listening (${Math.ceil(communeSnapshot.remainingSeconds)}s)`
          : isJudging
            ? 'Judging...'
            : isSpeaking
              ? 'The Sovereign Speaks...'
              : 'Tap [V]';
      }
      if (isJudging) {
        coopSystem?.setCommuneSuspense?.(true);
      }
      if (isSpeaking && communeSnapshot.judgment) {
        coopSystem?.setCommuneSuspense?.(true);
        if (communeSnapshot.preClimax) {
          coopSystem?.combatSfx?.playCommuneStart?.(coopSystem?.player?.activeHeroId || 'Knight');
        }
        const quote =
          communeSnapshot.judgment.divine_quote ||
          communeSnapshot.judgment.subtitle ||
          '';
        if (quote) {
          showCombatBanner(
            {
              title: 'THE SOVEREIGN · GOD OF LOVE',
              subtitle: quote,
              kind:
                String(communeSnapshot.judgment.verdict || '').toLowerCase() === 'smite' ||
                String(communeSnapshot.judgment.prayerMode || '').toLowerCase() === 'smite'
                  ? 'warning'
                  : 'blessing',
            },
            8000
          );
        }
      }
      sculptedHud?.setCommuneState({
        listening: isListening,
        judging: isJudging,
        speaking: isSpeaking,
        elapsedSeconds: communeSnapshot.elapsed,
        maxSeconds: communeSnapshot.maxDuration,
        micRms: communeSnapshot.micRms ?? 0,
        micBands: communeSnapshot.micBands || null,
      });
    },
    onVerdict: (judgment) => {
      const speakerRole = coopSystem.player.activeHeroId || 'Knight';
      const updatedProg = coopSystem.coopClient.progression.applyVerdictProgression(judgment);
      sculptedHud?.setProgressionState(updatedProg);
      const res = coopSystem.applyCommuneVerdict(judgment, speakerRole);
      const kGain = Number(res?.knightGain || 0);
      const mGain = Number(res?.mageGain || 0);
      const isNegativeDelta =
        Number(judgment?.hpDeltaPct) < 0 ||
        Number(judgment?.hpDelta) < 0 ||
        Number(res?.hpDelta) < 0;
      const isHealVerdict =
        !isNegativeDelta &&
        (kGain > 0 ||
          mGain > 0 ||
          res?.prayerMode === 'awakening' ||
          res?.prayerMode === 'divine_miracle');
      if (isHealVerdict) {
        const pulseRole =
          kGain > 0 && mGain > 0 ? 'both' : kGain > 0 ? 'Knight' : mGain > 0 ? 'Mage' : 'both';
        sculptedHud?.triggerHealPulse?.({
          role: pulseRole,
          amount: Math.max(kGain, mGain, Number(judgment?.hpDelta || 0)),
        });
      }
    },
    onCancel: () => {
      coopSystem.cancelCommuneChannel();
    },
  });
}

async function openAltarSteleModal(explicitStone = null) {
  const stone =
    explicitStone ||
    coopSystem.getNearestInscriptionStone() || {
      id: 'stone_plaza',
      index: 1,
      name: 'Weathered Stele of the Town Plaza',
    };

  // Reading ANY Sacred Inscription Stone unlocks Commune and selects the sequential riddle stage!
  const readInfo = coopSystem.coopClient.sendStoneRead(stone.id || stone);
  sculptedHud?.setProgressionState(readInfo.state);
  if (stoneGazeState.stones[readInfo.stoneId]) {
    stoneGazeState.stones[readInfo.stoneId].gazeElapsed = 3.0;
    stoneGazeState.stones[readInfo.stoneId].unlocked = true;
    stoneDecals.entries[readInfo.stoneId]?.redraw(1.0, true);
  }

  if (steleInteractPrompt) steleInteractPrompt.classList.remove('visible');
  return readInfo;
}

function closeAltarSteleModal() {
  altarSteleModal?.classList.remove('visible');
  sculptedHud?.closeInscriptionModal?.();
}

if (steleInteractPrompt) {
  steleInteractPrompt.addEventListener('click', (e) => {
    e.stopPropagation();
    openAltarSteleModal();
  });
}

if (altarSteleCloseBtn) {
  altarSteleCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAltarSteleModal();
  });
}

async function startCommuneHold() {
  const curState = communeClient.getState().state;
  const speakerRole = coopSystem.player.activeHeroId || 'Knight';

  // If already listening in hands-free mode, a second press triggers beginPress (stop & send or safe cancel)
  if (curState === 'listening') {
    if (typeof communeClient.beginPress === 'function') {
      const res = await communeClient.beginPress({ speakerRole });
      if (communeClient.getState().state === 'judging') {
        coopSystem.setCommuneSuspense(true);
      }
      return res;
    }
    return finishCommuneHold();
  }

  if (curState !== 'idle') {
    sculptedHud?.setCommuneState({ listening: curState === 'listening' });
    return;
  }
  if (coopSystem.campaignLoop?.verdictSequence?.active) {
    sculptedHud?.setCommuneState({ listening: false });
    return;
  }

  if (camState.mode === 'vista') {
    camState.mode = 'player';
    updateViewButtons();
  }

  const chanRes = coopSystem.startCommuneChannel(speakerRole, { camera });
  if (chanRes && chanRes.allowed === false) {
    sculptedHud?.setCommuneState({ listening: false, judging: false, speaking: false });
    return chanRes;
  }

  const startRes =
    typeof communeClient.beginPress === 'function'
      ? await communeClient.beginPress({
          speakerRole,
          deviceId: selectedMicDeviceId || undefined,
          speakerPos: { x: player.x, y: player.y, z: player.z },
        })
      : await communeClient.startCommune({
          speakerRole,
          deviceId: selectedMicDeviceId || undefined,
          speakerPos: { x: player.x, y: player.y, z: player.z },
        });
  if (startRes && startRes.ok === false && communeClient.getState().state === 'idle') {
    coopSystem.cancelCommuneChannel({ broadcast: false });
    sculptedHud?.setCommuneState({ listening: false, judging: false, speaking: false });
  }
  return startRes;
}

async function toggleCommuneTap() {
  const curState = communeClient.getState().state;
  const speakerRole = coopSystem.player.activeHeroId || 'Knight';

  if (curState === 'listening') {
    const res = await communeClient.tapCommune({ speakerRole });
    if (communeClient.getState().state === 'judging') {
      coopSystem.setCommuneSuspense(true);
    }
    return res;
  }

  if (curState !== 'idle') {
    sculptedHud?.setCommuneState({ listening: curState === 'listening' });
    return { ok: false, state: curState };
  }
  if (coopSystem.campaignLoop?.verdictSequence?.active) {
    sculptedHud?.setCommuneState({ listening: false });
    return { ok: false, reason: 'verdict_sequence_active' };
  }

  if (camState.mode === 'vista') {
    camState.mode = 'player';
    updateViewButtons();
  }

  const chanRes = coopSystem.startCommuneChannel(speakerRole, { camera });
  if (chanRes && chanRes.allowed === false) {
    sculptedHud?.setCommuneState({ listening: false, judging: false, speaking: false });
    return chanRes;
  }

  const tapRes = await communeClient.tapCommune({
    speakerRole,
    deviceId: selectedMicDeviceId || undefined,
    speakerPos: { x: player.x, y: player.y, z: player.z },
  });
  if (tapRes && tapRes.ok === false && communeClient.getState().state === 'idle') {
    coopSystem.cancelCommuneChannel({ broadcast: false });
    sculptedHud?.setCommuneState({ listening: false, judging: false, speaking: false });
  }
  return tapRes;
}

async function finishCommuneHold() {
  if (communeClient.getState().state !== 'listening') return;
  const speakerRole = coopSystem.player.activeHeroId || 'Knight';
  if (typeof communeClient.endPress === 'function') {
    const res = await communeClient.endPress({ speakerRole });
    if (communeClient.getState().state === 'judging') {
      coopSystem.setCommuneSuspense(true);
    }
    return res;
  }
  coopSystem.setCommuneSuspense(true);
  await communeClient.stopAndSendCommune({
    speakerRole,
  });
}

/* ------------------------------------------------------------------------- */
/* 7C. Wave 4 Sculpted See-Through Ring HUD & Opening Flow                   */
/* ------------------------------------------------------------------------- */

const _lobbyProjVec = new THREE.Vector3();
const _lobbyRaycaster = new THREE.Raycaster();
const _lobbyPointerNdc = new THREE.Vector2();
let eAimDragDistance = 14.5;

function projectWorldPointToScreen(wx, wy, wz) {
  const width = window.innerWidth || 1440;
  const height = window.innerHeight || 900;
  _lobbyProjVec.set(wx, wy, wz).project(camera);
  const x = (_lobbyProjVec.x * 0.5 + 0.5) * width;
  const y = (-_lobbyProjVec.y * 0.5 + 0.5) * height;
  const xPct = clamp((x / Math.max(1, width)) * 100, 8, 92);
  const yPct = clamp((y / Math.max(1, height)) * 100, 10, 90);
  return {
    x,
    y,
    xPct,
    yPct,
    visible: _lobbyProjVec.z <= 1.0,
  };
}

function updateFlowerLobbyHeroProjections() {
  if (!appFlow || appFlow.getStep?.() !== FLOW_STEPS.FLOWER_LOBBY) return;
  const kGrp = coopSystem?.knight?.group;
  const mGrp = coopSystem?.mage?.group;
  if (!kGrp || !mGrp) return;

  const kHead = projectWorldPointToScreen(
    kGrp.position.x,
    kGrp.position.y + 2.45,
    kGrp.position.z
  );
  const kChest = projectWorldPointToScreen(
    kGrp.position.x,
    kGrp.position.y + 1.25,
    kGrp.position.z
  );
  const mHead = projectWorldPointToScreen(
    mGrp.position.x,
    mGrp.position.y + 2.75,
    mGrp.position.z
  );
  const mChest = projectWorldPointToScreen(
    mGrp.position.x,
    mGrp.position.y + 1.25,
    mGrp.position.z
  );

  appFlow.setHeroScreenPositions?.({
    knight: {
      x: kChest.x,
      y: kChest.y,
      xPct: kChest.xPct,
      yPct: kChest.yPct,
      headX: kHead.x,
      headY: kHead.y,
      headXPct: kHead.xPct,
      headYPct: kHead.yPct,
      chestX: kChest.x,
      chestY: kChest.y,
      visible: kChest.visible,
    },
    mage: {
      x: mChest.x,
      y: mChest.y,
      xPct: mChest.xPct,
      yPct: mChest.yPct,
      headX: mHead.x,
      headY: mHead.y,
      headXPct: mHead.xPct,
      headYPct: mHead.yPct,
      chestX: mChest.x,
      chestY: mChest.y,
      visible: mChest.visible,
    },
  });
}

function tryRaycastFlowerLobbyHero(clientX, clientY) {
  if (!appFlow || appFlow.getStep?.() !== FLOW_STEPS.FLOWER_LOBBY) return null;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || window.innerWidth || 1440);
  const height = Math.max(1, rect.height || window.innerHeight || 900);
  _lobbyPointerNdc.x = ((clientX - rect.left) / width) * 2 - 1;
  _lobbyPointerNdc.y = -((clientY - rect.top) / height) * 2 + 1;

  camera.updateMatrixWorld(true);
  _lobbyRaycaster.setFromCamera(_lobbyPointerNdc, camera);

  const kGrp = coopSystem?.knight?.group;
  const mGrp = coopSystem?.mage?.group;
  const targets = [];
  if (kGrp) {
    kGrp.updateMatrixWorld(true);
    targets.push({ role: 'Knight', group: kGrp });
  }
  if (mGrp) {
    mGrp.updateMatrixWorld(true);
    targets.push({ role: 'Mage', group: mGrp });
  }

  let bestRole = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const hits = _lobbyRaycaster.intersectObject(t.group, true);
    if (hits.length > 0 && hits[0].distance < bestDist) {
      bestDist = hits[0].distance;
      bestRole = t.role;
    }
  }

  if (!bestRole) {
    for (const t of targets) {
      const chest = projectWorldPointToScreen(
        t.group.position.x,
        t.group.position.y + 1.15,
        t.group.position.z
      );
      const dx = clientX - chest.x;
      const dy = clientY - chest.y;
      if (Math.abs(dx) <= 84 && Math.abs(dy) <= 145) {
        const d = Math.hypot(dx, dy);
        if (d < bestDist) {
          bestDist = d;
          bestRole = t.role;
        }
      }
    }
  }

  if (bestRole) {
    if (typeof appFlow.claimCharacter === 'function') {
      appFlow.claimCharacter(bestRole);
    } else if (typeof appFlow.selectRole === 'function') {
      appFlow.selectRole(bestRole);
    }
  }
  return bestRole;
}

function getLiveDodgeInputOptions(extraOpts = {}) {
  if (
    typeof extraOpts?.swipeDx === 'number' &&
    typeof extraOpts?.swipeDy === 'number' &&
    Math.hypot(extraOpts.swipeDx, extraOpts.swipeDy) > 1e-3
  ) {
    return { ...extraOpts, camYaw: camState.yaw };
  }
  let dx = 0;
  let dy = 0;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  const activeJoy =
    sculptedHud?.joyState?.magnitude > 0.08 ? sculptedHud.joyState : touchHud?.joyState;
  if (activeJoy && activeJoy.magnitude > 0.08) {
    dx += activeJoy.x;
    dy -= activeJoy.y;
  }
  if (Math.hypot(dx, dy) > 1e-3) {
    return { ...extraOpts, swipeDx: dx, swipeDy: dy, camYaw: camState.yaw };
  }
  return { ...extraOpts, camYaw: camState.yaw };
}

function initSculptedHudSystem(createSculptedHudFn) {
  sculptedHud = createSculptedHudFn({
    container: document.getElementById('hud'),
    initialProfile: activeProfile,
    initialRole: coopSystem.player.activeHeroId || 'Knight',
    onAction: (actionName, actionOpts = {}) => {
      if (camState.mode === 'vista') {
        camState.mode = 'player';
        updateViewButtons();
      }
      if (actionName === 'attack') {
        coopSystem.triggerAction('attack');
      } else if (actionName === 'heavy' || actionName === 'block_start') {
        if (coopSystem.player.activeHeroId === 'Knight') {
          coopSystem.triggerAction('heavy');
        }
      } else if (actionName === 'block_end') {
        coopSystem.actionAim?.releaseHeavy?.('Knight');
      } else if (actionName === 'shatterlance_release') {
        coopSystem.triggerAction('shatterlance_aim_release', {
          distance: eAimDragDistance,
          yaw: camState.yaw,
          pitch: camState.pitch,
        });
      } else if (actionName === 'dash') {
        coopSystem.triggerAction('dash', getLiveDodgeInputOptions(actionOpts));
      } else if (actionName === 'jump') {
        coopSystem.triggerAction('jump');
      } else if (actionName === 'skill_e') {
        coopSystem.triggerAction('skill');
      } else if (actionName === 'ultimate') {
        coopSystem.triggerAction('ultimate');
      }
    },
    onAimStart: (payload = {}) => {
      if (coopSystem.player.activeHeroId === 'Mage') {
        const isTouchSlotE = Boolean(
          payload?.slot === 'E' && (payload?.source === 'touch' || payload?.touch)
        );
        const isShatter = payload?.spellId === 'shatterlance' || payload?.slot === 'Attack';
        const activeSpell =
          coopSystem.heroStates?.Mage?.selectedSpell ||
          (coopSystem.heroStates?.Mage?.selectedElement === 'fire' ? 'cinder_fall' : 'frost_lance');
        if (isTouchSlotE) {
          coopSystem.startSkillAim({
            source: 'touch',
            spellId: activeSpell,
            camYaw: camState.yaw,
            camPitch: camState.pitch,
            touch: payload.touch || { dx: 0, dy: 0, overButton: true, leftButton: false },
          });
          return;
        }
        eAimDragDistance = isShatter ? 14.5 : activeSpell === 'frost_lance' ? 14.5 : 9.5;
        coopSystem.startSkillAim({
          spellId: isShatter ? 'shatterlance' : activeSpell,
          yaw: camState.yaw,
          pitch: camState.pitch,
          distance: eAimDragDistance,
        });
      }
    },
    onAimMove: (payload = {}) => {
      if (coopSystem.player.activeHeroId === 'Mage') {
        const { clientY, dx = 0, dy = 0, slot, source, touch } = payload || {};
        if (slot === 'E' && (source === 'touch' || touch)) {
          coopSystem.updateSkillAim({
            touch: touch || { dx, dy: -dy, overButton: false, leftButton: true },
            camYaw: camState.yaw,
            camPitch: camState.pitch,
          });
          return;
        }
        const minD = 0.8;
        const maxD = 18.0;
        const yawSens = source === 'touch' ? 0.0042 : 0.0055;
        const pitchSens = source === 'touch' ? 0.0026 : 0.0032;
        if (typeof dx === 'number' && Math.abs(dx) > 0) {
          camState.yaw -= dx * yawSens;
          coopSystem.heroStates.Mage.yaw = camState.yaw;
        }
        if (typeof dy === 'number' && Math.abs(dy) > 0) {
          eAimDragDistance = clamp(eAimDragDistance - dy * 0.095, minD, maxD);
          camState.pitch = clamp(camState.pitch + dy * pitchSens, 0.04, 1.15);
        } else if (typeof clientY === 'number') {
          const normY =
            1.0 - clamp(clientY / Math.max(1, window.innerHeight || 900), 0, 1);
          eAimDragDistance = clamp(minD + normY * (maxD - minD), minD, maxD);
        }
        coopSystem.updateSkillAim({
          distance: eAimDragDistance,
          yaw: camState.yaw,
          pitch: camState.pitch,
        });
      }
    },
    onAimRelease: (payload = {}) => {
      if (coopSystem.player.activeHeroId === 'Mage') {
        const { slot, source, touch, dx = 0, dy = 0 } = payload || {};
        if (slot === 'E' && (source === 'touch' || touch)) {
          coopSystem.releaseSkillAim({
            touch: touch || { dx, dy: -dy, overButton: false, leftButton: true },
            camYaw: camState.yaw,
            camPitch: camState.pitch,
          });
          return;
        }
        coopSystem.releaseSkillAim({
          distance: eAimDragDistance,
          yaw: camState.yaw,
          pitch: camState.pitch,
        });
      }
    },
    onToggleElement: () => {
      const res = coopSystem.toggleElement(coopSystem.player.activeHeroId);
      if (res?.element) {
        sculptedHud.setElement(res.element);
      }
    },
    onCommuneToggle: () => {
      toggleCommuneTap();
    },
    onReadStone: () => {
      openAltarSteleModal();
    },
    onSwapHero: () => {
      const isTwoPlayerConnected = Boolean(
        appFlow?.getState?.()?.peerConnected ||
          coopSystem?.coopClient?.getState?.()?.peerConnected
      );
      if (isTwoPlayerConnected) {
        return false;
      }
      const before = coopSystem.player.activeHeroId;
      coopSystem.swapActiveHero();
      return coopSystem.player.activeHeroId !== before;
    },
    onDevUnlockNextStage: (nextStage) => {
      // DEV_SOLO_TEST_REMOVE_FOR_PROD: Sync room progression state with Dev Stage button
      devStageOverride = nextStage;
      const mask = nextStage >= 3 ? 0b111 : nextStage === 2 ? 0b011 : nextStage === 1 ? 0b001 : 0;
      const updated = coopSystem.coopClient.progression.setUnlocks({
        communeDiscovered: nextStage >= 1,
        iceUnlocked: nextStage >= 1,
        fireUnlocked: nextStage >= 2,
        ultimateUnlocked: nextStage >= 3,
        stone1Solved: nextStage >= 1,
        stone2Solved: nextStage >= 2,
        stone3Solved: nextStage >= 3,
        stonesSolvedMask: mask,
      });
      coopSystem.setUnlockedStage?.(nextStage);
      coopSystem.campaignLoop?.setUnlockedStage?.(nextStage, mask);
      sculptedHud?.setProgressionState(updated);
      updateCombatHud(coopSystem.campaignLoop.getStateSnapshot(coopSystem.heroStates));
    },
    onSelectTimeOfDay: (todChoice) => {
      if (todChoice === 'auto') {
        autoCycleTod = true;
      } else {
        autoCycleTod = false;
        applyTimeOfDay(todChoice);
      }
    },
    onSelectProfile: (profChoice) => {
      setProfile(profChoice);
    },
    onCameraOrbit: (dx, dy, meta) => {
      applyCameraOrbitDelta(dx, dy, meta);
    },
    onChangeCameraSensitivity: (preset) => {
      if (preset === 'low' || preset === 'medium' || preset === 'high') {
        camState.sensitivity = preset;
      }
    },
    onCopyRoomInvite: async () => {
      const shareUrl = coopSystem?.coopClient?.getShareUrl?.() || window.location.href;
      try {
        await navigator.clipboard?.writeText(shareUrl);
      } catch {
        // ignore clipboard fallback
      }
      coopSystem?.combatSfx?.playUi?.('click');
      return shareUrl;
    },
    onEditRoomCode: () => {
      const current = coopSystem?.coopClient?.getRoomCode?.() || 'LOVE';
      const entered = window.prompt('Enter Co-Op Room Phrase or Code:', current);
      if (entered) {
        coopSystem.coopClient.setRoomCode(entered);
        updateCoopPill(coopSystem.coopClient.getState());
      }
    },
    onUiSfx: (kind) => {
      coopSystem?.combatSfx?.playUi?.(kind);
    },
  });

  if (sculptedHud) {
    const syncHeroElementState = (el) => {
      if (el !== 'ice' && el !== 'fire') return;
      const spell = el === 'fire' ? 'cinder_fall' : 'frost_lance';
      if (coopSystem?.heroStates?.Knight) coopSystem.heroStates.Knight.selectedElement = el;
      if (coopSystem?.heroStates?.Mage) {
        coopSystem.heroStates.Mage.selectedElement = el;
        coopSystem.heroStates.Mage.selectedSpell = spell;
      }
      if (coopSystem?.actionAim?.heroes?.Knight) {
        coopSystem.actionAim.heroes.Knight.selectedElement = el;
      }
      if (coopSystem?.actionAim?.heroes?.Mage) {
        coopSystem.actionAim.heroes.Mage.selectedElement = el;
        coopSystem.actionAim.heroes.Mage.selectedSpell = spell;
      }
      if (coopSystem?.campaignLoop?.combatHeroes?.Knight) {
        coopSystem.campaignLoop.combatHeroes.Knight.selectedElement = el;
      }
      if (coopSystem?.campaignLoop?.combatHeroes?.Mage) {
        coopSystem.campaignLoop.combatHeroes.Mage.selectedElement = el;
        coopSystem.campaignLoop.combatHeroes.Mage.selectedSpell = spell;
      }
      if (coopSystem?.coopClient?.progression?.state) {
        coopSystem.coopClient.progression.state.activeElement = el;
      }
    };
    const origSetElement = sculptedHud.setElement;
    sculptedHud.setElement = (el) => {
      syncHeroElementState(el);
      return origSetElement(el);
    };
    const origSetProgressionState = sculptedHud.setProgressionState;
    sculptedHud.setProgressionState = (patch = {}) => {
      if (typeof patch?.unlockedStage === 'number') {
        coopSystem?.setUnlockedStage?.(patch.unlockedStage);
        coopSystem?.campaignLoop?.setUnlockedStage?.(patch.unlockedStage, patch.stonesSolvedMask);
      }
      if (patch?.activeElement === 'ice' || patch?.activeElement === 'fire') {
        syncHeroElementState(patch.activeElement);
      }
      return origSetProgressionState(patch);
    };
  }

  // Auto-unlock Stage 3 test abilities when `?dev=1`, `?nolobby=1`, or `?stage=3` is in URL
  if (typeof window !== 'undefined') {
    const bootParams = new URLSearchParams(window.location?.search || '');
    if (bootParams.get('dev') === '1' || bootParams.get('nolobby') === '1' || bootParams.get('stage') === '3') {
      devStageOverride = 3;
      const preSolved = bootParams.get('solved') === '1';
      const mask = preSolved ? 0b111 : 0;
      const updated = coopSystem.coopClient.progression.setUnlocks({
        communeDiscovered: true,
        iceUnlocked: true,
        fireUnlocked: true,
        ultimateUnlocked: true,
        stone1Solved: preSolved,
        stone2Solved: preSolved,
        stone3Solved: preSolved,
        stonesSolvedMask: mask,
      });
      coopSystem.setUnlockedStage?.(3);
      coopSystem.campaignLoop?.setUnlockedStage?.(3, mask);
      if (coopSystem.campaignLoop?.combatHeroes?.Knight) {
        coopSystem.campaignLoop.combatHeroes.Knight.qEnergy = 100;
        coopSystem.campaignLoop.combatHeroes.Knight.qEnergyPct = 1.0;
      }
      if (coopSystem.campaignLoop?.combatHeroes?.Mage) {
        coopSystem.campaignLoop.combatHeroes.Mage.qEnergy = 160;
        coopSystem.campaignLoop.combatHeroes.Mage.qEnergyPct = 1.0;
      }
      sculptedHud?.setProgressionState(updated);
    }
  }
}

function applyOpeningFlowCameraAndPoses(step, { renderNow = false } = {}) {
  if (step === FLOW_STEPS.IN_GAME) {
    camState.mode = 'player';
    sculptedHud?.setVisible(true);
    updateCoopPill(coopSystem?.coopClient?.getState?.());
    updateCamera();
    return;
  }
  sculptedHud?.setVisible(false);
  coopSystem?.clearHeroHitFlashes?.();
  if (coopSystem?.heroStates) {
    for (const hSt of [coopSystem.heroStates.Knight, coopSystem.heroStates.Mage]) {
      if (!hSt) continue;
      hSt.hitFlashTimer = -1;
      hSt.hitKnockbackX = 0;
      hSt.hitKnockbackZ = 0;
      hSt.actionState = null;
      hSt.actionTimer = 0;
    }
  }
  const pose = getOpeningCameraPose(step, walkableHeightAt);
  camState.mode = 'vista';
  camState.vistaPos.set(...pose.pos);
  camState.vistaTarget.set(...pose.target);
  camState.baseFov = pose.fov || 48;
  camera.fov = pose.fov || 48;
  camera.updateProjectionMatrix();

  if (step === FLOW_STEPS.FLOWER_LOBBY) {
    const kP = {
      x: -1.65,
      z: 132.8,
      yaw: 0.22,
      ...(pose.knightLobbyPos || {}),
      x: -1.65,
      z: 132.8,
      yaw: 0.22,
    };
    kP.y = walkableHeightAt(kP.x, kP.z);

    const mP = {
      x: 0.75,
      z: 133.0,
      yaw: -0.18,
      ...(pose.mageLobbyPos || {}),
      x: 0.75,
      z: 133.0,
      yaw: -0.18,
    };
    mP.y = walkableHeightAt(mP.x, mP.z);

    // Ensure camera sits cleanly in front of (z >= 138.2) the wildflowers duo so both heroes are framed head-to-toe
    const minLobbyCamZ = Math.max(kP.z, mP.z) + 5.2;
    if (camState.vistaPos.z < minLobbyCamZ) {
      const camGroundY = walkableHeightAt(0, minLobbyCamZ);
      camState.vistaPos.set(-0.25, camGroundY + 1.68, minLobbyCamZ);
      camState.vistaTarget.set(
        -0.35,
        (kP.y + mP.y) * 0.5 + 1.18,
        (kP.z + mP.z) * 0.5
      );
    }

    coopSystem.heroStates.Knight.x = kP.x;
    coopSystem.heroStates.Knight.z = kP.z;
    coopSystem.heroStates.Knight.y = kP.y;
    coopSystem.heroStates.Knight.yaw = kP.yaw;
    coopSystem.knight.group.position.set(kP.x, kP.y, kP.z);
    coopSystem.knight.group.rotation.y = kP.yaw;
    coopSystem.knight.play('wave', {
      loop: false,
      clampWhenFinished: true,
      fade: 0,
      startTime: 0,
      force: true,
    });

    coopSystem.heroStates.Mage.x = mP.x;
    coopSystem.heroStates.Mage.z = mP.z;
    coopSystem.heroStates.Mage.y = mP.y;
    coopSystem.heroStates.Mage.yaw = mP.yaw;
    coopSystem.mage.group.position.set(mP.x, mP.y, mP.z);
    coopSystem.mage.group.rotation.y = mP.yaw;
    coopSystem.mage.play('cheer', {
      loop: false,
      clampWhenFinished: true,
      fade: 0,
      startTime: 0,
      force: true,
    });
  }
  updateCamera();
  if (renderNow && step !== FLOW_STEPS.IN_GAME && renderer && post) {
    post.render(0);
  }
  if (step === FLOW_STEPS.FLOWER_LOBBY) {
    updateFlowerLobbyHeroProjections();
  }
}

function initTouchHudAndButtons(createTouchHudFn) {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/world/sw.js').catch(() => {});
  }

  touchHud = createTouchHudFn({
    hudRoot: document.getElementById('hud'),
    onCameraOrbit: (dx, dy, meta) => {
      applyCameraOrbitDelta(dx, dy, { inputType: 'touch', ...(meta || {}) });
    },
    onAction: (actionType) => {
      if (!coopSystem) return;
      if (camState.mode === 'vista') {
        camState.mode = 'player';
        updateViewButtons();
      }
      coopSystem.triggerAction(actionType);
    },
    onCommuneStart: () => {
      startCommuneHold();
    },
    onCommuneEnd: () => {
      finishCommuneHold();
    },
  });

  if (communeRBtn) {
    communeRBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      try {
        communeRBtn.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      startCommuneHold();
    });
    const endCommuneBtn = (e) => {
      e.stopPropagation();
      finishCommuneHold();
    };
    communeRBtn.addEventListener('pointerup', endCommuneBtn);
    communeRBtn.addEventListener('pointercancel', endCommuneBtn);
  }

  if (hudSwapHeroBtn) {
    hudSwapHeroBtn.addEventListener('click', () => {
      const isTwoPlayerConnected = Boolean(
        appFlow?.getState?.()?.peerConnected ||
          coopSystem?.coopClient?.getState?.()?.peerConnected
      );
      if (!isTwoPlayerConnected) {
        coopSystem?.swapActiveHero?.();
      }
    });
  }

  // Wire 4-Spell Deck Buttons (`1..4`) & `Q` Couples Ultimate Button
  document.querySelectorAll('.spell-slot-btn').forEach((btn) => {
    const slot = Number(btn.dataset.spellSlot);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!coopSystem) return;
      if (camState.mode === 'vista') {
        camState.mode = 'player';
        updateViewButtons();
      }
      coopSystem.triggerSpell(slot);
    });
  });

  if (ultQBtn) {
    ultQBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!coopSystem) return;
      if (camState.mode === 'vista') {
        camState.mode = 'player';
        updateViewButtons();
      }
      coopSystem.triggerAction('ultimate');
    });
  }

  // Wire Co-Op Room Code Edit & Share Link Buttons
  if (coopRoomBtn) {
    coopRoomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!coopSystem?.coopClient) return;
      const current = coopSystem.coopClient.getRoomCode();
      const entered = window.prompt('Enter 4-letter Co-Op Room Code:', current);
      if (entered) {
        const norm = coopSystem.coopClient.setRoomCode(entered);
        if (coopRoomCodeEl) coopRoomCodeEl.textContent = norm;
        updateCoopPill(coopSystem.coopClient.getState());
      }
    });
  }

  if (coopShareBtn) {
    coopShareBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!coopSystem?.coopClient) return;
      const shareUrl = coopSystem.coopClient.getShareUrl();
      try {
        await navigator.clipboard?.writeText(shareUrl);
      } catch {
        // ignore clipboard fallback
      }
      const prev = coopShareBtn.textContent;
      coopShareBtn.textContent = 'Copied!';
      setTimeout(() => {
        coopShareBtn.textContent = prev;
      }, 1500);
    });
  }

  if (replayExpeditionBtn) {
    replayExpeditionBtn.addEventListener('click', () => {
      if (!coopSystem) return;
      coopSystem.campaignLoop.resetCampaign();
      coopSystem.setUnlockedStage?.(0);
      coopSystem.campaignLoop?.setUnlockedStage?.(0, 0);
      coopSystem.coopClient?.startExpedition?.({ resetProgression: true });
      sculptedHud?.setProgressionState?.({
        communeDiscovered: false,
        iceUnlocked: false,
        fireUnlocked: false,
        ultimateUnlocked: false,
        unlockedStage: 0,
        stonesSolved: 0,
        stonesSolvedMask: 0,
        stone1Solved: false,
        stone2Solved: false,
        stone3Solved: false,
      });
      coopSystem.teleportLeaderAndPartner(0.0, 124.0, Math.PI);
      if (victoryModal) victoryModal.classList.remove('visible');
      updateCombatHud(coopSystem.campaignLoop.getStateSnapshot(coopSystem.heroStates));
    });
  }

  if (coopSystem?.coopClient) {
    updateCoopPill(coopSystem.coopClient.getState());
  }
  touchHud.setProfileMode(activeProfile);
  updateCombatHud(coopSystem.campaignLoop.getStateSnapshot());
  updateCoopPill(coopSystem.coopClient.getState());
}

/* ------------------------------------------------------------------------- */
/* 8. Post-Processing Pipeline (4x MSAA + Bloom + Time-of-Day Grade)         */
/* ------------------------------------------------------------------------- */


/* ------------------------------------------------------------------------- */
/* 9. Full World Time-of-Day Material Synchronization                        */
/* ------------------------------------------------------------------------- */

const _dayWindowCol = new THREE.Color(0xffffff);
const _nightWindowCol = new THREE.Color(0xffbe55);
const _nightWindowEmissive = new THREE.Color(0xff9d2e);

let currentTodT = TOD_PRESETS.day.t;
let autoCycleTod = false;

function syncEnvironmentPolarity() {
  if (typeof document === 'undefined') return 'day';
  const ecWeight = Number(sky?.state?.eclipseWeight ?? 0);
  const mode = sky?.state?.mode || 'day';
  let polarity = 'day';
  if (ecWeight > 0.35) {
    polarity = 'eclipse';
  } else if (mode === 'evening') {
    polarity = 'golden';
  } else if (mode === 'night' || mode === 'twilight' || currentTodT >= 0.80) {
    polarity = 'night';
  } else {
    polarity = 'day';
  }
  if (document.body && document.body.dataset.envPolarity !== polarity) {
    document.body.dataset.envPolarity = polarity;
  }
  if (
    document.documentElement &&
    document.documentElement.dataset.envPolarity !== polarity
  ) {
    document.documentElement.dataset.envPolarity = polarity;
  }
  return polarity;
}

export function applyTimeOfDay(modeOrT) {
  if (!sky || !post || !terrainKit || !housesKit) return null;
  const skyState = sky.setTimeOfDay(modeOrT);
  currentTodT = skyState.t;

  // 1. Sync Post-Processing Grade & Restrained Bloom
  post.setTimeOfDayGrade(currentTodT);
  post.setAtmosphere({ fogColor: skyState.fogColor, lightDir: skyState.activeLightDir });

  // 2. Sync Scene Fog & Background
  scene.fog.color.copy(skyState.fogColor);
  scene.background.copy(skyState.fogColor);

  // 3. Sync Terrain & Water Shaders
  if (terrainKit.terrainMat?.uniforms) {
    terrainKit.terrainMat.uniforms.uSunDir.value.copy(skyState.activeLightDir);
    terrainKit.terrainMat.uniforms.uFogColor.value.copy(skyState.fogColor);
    terrainKit.terrainMat.uniforms.uLightTint.value.copy(skyState.worldTint);
  }
  if (terrainKit.waterMat?.uniforms) {
    terrainKit.waterMat.uniforms.uLightTint.value.copy(skyState.waterTint);
    if (terrainKit.waterMat.uniforms.uSunDir) {
      terrainKit.waterMat.uniforms.uSunDir.value.copy(skyState.activeLightDir);
    }
    if (terrainKit.waterMat.uniforms.uHorizonReflect) {
      terrainKit.waterMat.uniforms.uHorizonReflect.value.copy(skyState.fogColor);
    }
  }

  // 4. Sync Toroidal Meadow Grass, Wildflowers & Modeled Botanical Trees
  if (meadow?.sharedUniforms) {
    meadow.sharedUniforms.uSunDir.value.copy(skyState.activeLightDir);
    meadow.sharedUniforms.uLightTint.value.copy(skyState.worldTint);
  }
  if (terrainKit.treesSys) {
    terrainKit.treesSys.setSunDirection(skyState.activeLightDir);
    terrainKit.treesSys.setTimeOfDay(skyState.daylight, skyState.worldTint, skyState.fogColor);
  }

  // 5. Dynamic Cottage Window Candlelight, Porch Lanterns, Forge Embers & Shrine Crystal Bloom
  const glow = skyState.windowGlow;
  const glassMat = housesKit.mats.glass;
  if (glassMat) {
    glassMat.color.copy(_dayWindowCol).lerp(_nightWindowCol, glow);
    glassMat.emissive.copy(_nightWindowEmissive);
    glassMat.emissiveIntensity = 1.38 * glow;
  }

  const basicBucket = housesKit.mats.buckets?.solidBasic;
  if (basicBucket) {
    const hdrBoost = 1.0 + 0.68 * glow;
    basicBucket.color.setRGB(hdrBoost, hdrBoost * 0.96, hdrBoost * 0.88);
  }

  for (const emMat of landmarkEmissiveMats) {
    const hdrBoost = 1.0 + 0.72 * glow;
    emMat.color.setRGB(hdrBoost, hdrBoost * 0.96, hdrBoost * 0.90);
  }

  // 6. Sync Complete Stage 4 Opaque VFX Suite & Combat Indicators Lighting
  if (coopSystem?.vfxKit) {
    coopSystem.vfxKit.setLighting({
      sunDir: skyState.activeLightDir,
      daylight: skyState.daylight,
    });
  }
  if (coopSystem?.sanctuarySteleMesh?.material?.uniforms?.uSunDir) {
    coopSystem.sanctuarySteleMesh.material.uniforms.uSunDir.value.copy(
      skyState.activeLightDir
    );
  }
  if (coopSystem?.campaignLoop?.crestAndTetherMesh?.material?.uniforms?.uSunDir) {
    coopSystem.campaignLoop.crestAndTetherMesh.material.uniforms.uSunDir.value.copy(
      skyState.activeLightDir
    );
  }
  if (typeof monumentShaderMats !== 'undefined' && Array.isArray(monumentShaderMats)) {
    for (const mat of monumentShaderMats) {
      if (mat?.uniforms) {
        if (mat.uniforms.uSunDir) mat.uniforms.uSunDir.value.copy(skyState.activeLightDir);
        if (mat.uniforms.uDaylight) mat.uniforms.uDaylight.value = skyState.daylight;
        if (mat.uniforms.uLightTint) mat.uniforms.uLightTint.value.copy(skyState.worldTint);
        if (mat.uniforms.uFogColor) mat.uniforms.uFogColor.value.copy(skyState.fogColor);
      }
    }
  }

  syncTodHudControls();
  syncEnvironmentPolarity();
  return skyState;
}

/* ------------------------------------------------------------------------- */
/* 10. Camera Views (1-8) & Automated Verification Shots                     */
/* ------------------------------------------------------------------------- */

export const VIEWS = {
  entry: {
    id: 'entry',
    label: '1 · South Entry',
    mode: 'player',
    px: 0.0,
    pz: 26.0,
    yaw: Math.PI,
    pitch: 0.14,
    dist: 9.0,
  },
  plaza: {
    id: 'plaza',
    label: '2 · Well Plaza',
    mode: 'player',
    px: 3.4,
    pz: 15.2,
    yaw: Math.PI + 0.18,
    pitch: 0.10,
    dist: 8.6,
  },
  mill: {
    id: 'mill',
    label: '3 · Mill & Pier',
    mode: 'vista',
    pos: [-27.5, 5.8, 19.5],
    target: [-46.8, 2.2, -13.5],
    fov: 52,
  },
  arena: {
    id: 'arena',
    label: '4 · Wisteria Arena',
    mode: 'vista',
    pos: [37.5, 4.4, 6.8],
    target: [70.5, 4.2, -5.0],
    fov: 52,
  },
  shrine: {
    id: 'shrine',
    label: '5 · Shrine Arch',
    mode: 'vista',
    pos: [3.8, 10.4, -63.5],
    target: [-1.0, 12.2, -93.0],
    fov: 52,
  },
  shrineLookback: {
    id: 'shrineLookback',
    label: '6 · Sunset Vista',
    mode: 'vista',
    pos: [2.2, 15.6, -71.5],
    target: [-11.5, 7.2, 14.0],
    fov: 54,
  },
  aerial: {
    id: 'aerial',
    label: '7 · Aerial Masterplan',
    mode: 'vista',
    pos: [-16.0, 112.0, 138.0],
    target: [0.0, 0.0, -10.0],
    fov: 48,
  },
  topdown: {
    id: 'topdown',
    label: '8 · Top-Down Map',
    mode: 'vista',
    pos: [0.0, 250.0, -6.0],
    target: [0.0, 0.0, -6.1],
    fov: 46,
  },
};

export const WORLD_SHOTS = {
  'day-plaza': {
    id: 'day-plaza',
    tod: 'day',
    mode: 'vista',
    pos: [5.2, 3.8, 23.2],
    target: [-3.2, 5.8, -16.0],
    fov: 52,
    playerPos: [1.4, 11.5, 0.52],
  },
  'day-mill-pier': {
    id: 'day-mill-pier',
    tod: 'day',
    mode: 'vista',
    pos: [-27.5, 5.8, 19.5],
    target: [-46.8, 2.2, -13.5],
    fov: 52,
    playerPos: [-38.2, 8.9, -2.25],
  },
  'day-arena-wisteria': {
    id: 'day-arena-wisteria',
    tod: 'day',
    mode: 'vista',
    pos: [37.5, 4.4, 6.8],
    target: [70.5, 4.2, -5.0],
    fov: 52,
    playerPos: [47.2, -1.8, 1.85],
  },
  'day-shrine-arch': {
    id: 'day-shrine-arch',
    tod: 'day',
    mode: 'vista',
    pos: [3.8, 10.4, -63.5],
    target: [-1.2, 12.4, -93.0],
    fov: 52,
    playerPos: [-0.7, -76.2, 2.88],
  },
  'evening-sunset-vista': {
    id: 'evening-sunset-vista',
    tod: 'evening',
    mode: 'vista',
    pos: [2.2, 15.6, -71.5],
    target: [-11.5, 7.2, 14.0],
    fov: 54,
    playerPos: [-0.6, -61.5, -0.18],
  },
  'night-moon-shrine': {
    id: 'night-moon-shrine',
    tod: 'night',
    mode: 'vista',
    pos: [3.6, 10.3, -64.0],
    target: [-1.4, 12.6, -93.5],
    fov: 52,
    playerPos: [-0.7, -76.2, 2.85],
  },
  'night-plaza-lanterns': {
    id: 'night-plaza-lanterns',
    tod: 'night',
    mode: 'vista',
    pos: [6.8, 3.6, 16.8],
    target: [-7.5, 5.2, -15.5],
    fov: 52,
    playerPos: [1.6, 8.5, 0.55],
  },
  'aerial-masterplan': {
    id: 'aerial-masterplan',
    tod: 'day',
    mode: 'vista',
    pos: [-18.0, 128.0, 162.0],
    target: [0.0, 0.0, 12.0],
    fov: 50,
    playerPos: [0.0, 14.0, Math.PI],
  },
  'day-flower-lobby': {
    id: 'day-flower-lobby',
    tod: 'day',
    mode: 'vista',
    pos: [0.0, 4.4, 142.0],
    target: [0.0, 2.2, 82.0],
    fov: 52,
    playerPos: [-1.2, 128.0, Math.PI],
  },
  'day-south-road-boulders': {
    id: 'day-south-road-boulders',
    tod: 'day',
    mode: 'vista',
    pos: [-18.5, 4.2, 78.0],
    target: [6.0, 1.8, 38.0],
    fov: 52,
    playerPos: [-4.5, 62.0, Math.PI + 0.15],
  },
  'day-sacred-stone-roses': {
    id: 'day-sacred-stone-roses',
    tod: 'day',
    mode: 'vista',
    pos: [0.4, 2.75, -7.8],
    target: [0.0, 1.25, -14.0],
    fov: 50,
    playerPos: [-1.95, -12.2, 2.35],
  },
  'evening-flower-lobby': {
    id: 'evening-flower-lobby',
    tod: 'evening',
    mode: 'vista',
    pos: [0.0, 4.4, 142.0],
    target: [0.0, 2.2, 82.0],
    fov: 52,
    playerPos: [-1.2, 128.0, Math.PI],
  },
  'evening-plaza': {
    id: 'evening-plaza',
    tod: 'evening',
    mode: 'vista',
    pos: [5.2, 3.8, 23.2],
    target: [-3.2, 5.8, -16.0],
    fov: 52,
    playerPos: [1.4, 11.5, 0.52],
  },
  'night-flower-lobby': {
    id: 'night-flower-lobby',
    tod: 'night',
    mode: 'vista',
    pos: [0.0, 4.4, 142.0],
    target: [0.0, 2.2, 82.0],
    fov: 52,
    playerPos: [-1.2, 128.0, Math.PI],
  },
};

// Verdict sky clock: drives verdict-sky-choreo.js from the prayer channel / verdictSequence and
// keeps running through the post-unlock release so the sky never pops back to day.
const verdictSkyClock = {
  phase: 'idle',
  t: 0,
  entryFront: 0,
  boltSeed: 0.37,
  snap: null,
  out: idleVerdictSky(),
  preview: null,
};
const _eclipseAtmoFog = new THREE.Color(0.03, 0.006, 0.012);
const _atmoFogMix = new THREE.Color();

function resetVerdictSky() {
  verdictSkyClock.phase = 'idle';
  verdictSkyClock.t = 0;
  verdictSkyClock.out = idleVerdictSky();
  verdictSkyClock.preview = null;
  sky.setVerdictSky?.(null);
}

function applyVerdictSky(out, dt = 0) {
  sky.setEclipseState?.({
    weight: out.weight,
    compression: out.compression,
    windTimeScale: out.windTimeScale,
    camera,
    dt,
  });
  sky.setVerdictSky?.(out);
  post.setSmiteMonochrome?.(out.monochrome);
  // Depth atmosphere sinks into the eclipse instead of keeping the daytime haze
  const fogU = post.params?.grade?.uFogColor?.value;
  if (fogU && sky.state?.fogColor) {
    // Switch as the curtains cross the horizon band, where distant terrain sits
    const s01 = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
    const cover = out.weight * s01(0.72, 0.92, out.front) * (1 - s01(0.8, 0.95, out.clear));
    fogU.copy(_atmoFogMix.copy(sky.state.fogColor).lerp(_eclipseAtmoFog, cover));
  }
}

function syncPrayerEclipseAndMonochrome(dt = 0) {
  if (coopSystem?.sanctuarySteleMesh) {
    coopSystem.sanctuarySteleMesh.visible = false;
  }
  if (activeGameplayShotSpec) {
    syncEnvironmentPolarity();
    return;
  }
  const c = verdictSkyClock;
  if (c.preview) {
    const out = evalVerdictSky(c.preview.kind, c.preview.t, c.preview.kind === 'channel' ? 0 : 1);
    out.boltSeed = c.boltSeed;
    applyVerdictSky(out, dt);
    syncEnvironmentPolarity();
    return;
  }
  const cLoop = coopSystem?.campaignLoop;
  const vSeq = cLoop?.verdictSequence;
  const communeState = communeClient?.getState?.()?.state;
  const hudCommune = sculptedHud?.getState?.()?.commune;
  const inPrayerChannel = Boolean(
    cLoop?.communeChannelActive ||
      coopSystem?.communeChannel?.active ||
      communeState === 'listening' ||
      communeState === 'judging' ||
      communeState === 'speaking' ||
      hudCommune?.listening ||
      hudCommune?.partnerListening
  );
  const isModeBMiracleChannel = Boolean(
    inPrayerChannel && cLoop?.communeMode === 'divine_miracle'
  );
  const isAwakeningEclipse = Boolean((cLoop?.awakeningEclipseTimer || 0) > 0);

  const cur = c.out;
  const coverage = cur.weight > 0 ? cur.front * (1 - cur.clear) : 0;
  if (vSeq?.active && (vSeq.kind === 'smite' || vSeq.kind === 'blessing')) {
    if (c.phase !== vSeq.kind) {
      c.phase = vSeq.kind;
      c.entryFront = coverage;
      c.boltSeed = Math.random();
    }
    c.t = vSeq.elapsed || 0;
  } else if (isModeBMiracleChannel || isAwakeningEclipse) {
    if (c.phase !== 'channel') {
      c.phase = 'channel';
      c.t = 0;
      c.entryFront = coverage;
    } else {
      c.t += dt;
    }
  } else if (c.phase === 'channel') {
    c.phase = 'channelRelease';
    c.t = 0;
    c.snap = { ...cur };
  } else if (c.phase !== 'idle') {
    c.t += dt;
    if (c.t >= VERDICT_SKY_TAILS[c.phase]) {
      c.phase = 'idle';
      c.t = 0;
    }
  }

  let out;
  if (c.phase === 'channel') out = evalChannelSky(c.t, c.entryFront);
  else if (c.phase === 'channelRelease') out = evalChannelReleaseSky(c.t, c.snap);
  else if (c.phase === 'smite') out = evalSmiteSky(c.t, c.entryFront);
  else if (c.phase === 'blessing') out = evalBlessingSky(c.t, c.entryFront);
  else out = idleVerdictSky();
  out.boltSeed = c.boltSeed;
  c.out = out;
  applyVerdictSky(out, dt);
  syncEnvironmentPolarity();
}

// Deterministic verdict-sky preview for captures: { kind: 'channel'|'smite'|'blessing', t } or null
function setVerdictSkyPreview(spec = null) {
  verdictSkyClock.preview = spec && spec.kind ? { kind: String(spec.kind), t: Number(spec.t) || 0 } : null;
  syncPrayerEclipseAndMonochrome(0);
}

function syncCharacterGroundShadows() {
  const tArr = terrainKit?.terrainMat?.uniforms?.uCharShadows?.value;
  const mArr = meadow?.sharedUniforms?.uCharShadows?.value;
  if (!tArr && !mArr) return;

  const setSlot = (idx, x, z, r, active) => {
    if (tArr && tArr[idx]) tArr[idx].set(x, z, r, active);
    if (mArr && mArr[idx]) mArr[idx].set(x, z, r, active);
  };

  const getCharDissolve = (charObj) => {
    let d = 0;
    const root = charObj?.group;
    if (root && typeof root.traverse === 'function') {
      root.traverse((o) => {
        if (!o.isMesh || !o.material || d > 0) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const u = m?.userData?.verdictUniforms || m?.uniforms;
        if (u?.uDissolveProgress?.value > 0) d = u.uDissolveProgress.value;
      });
    }
    return clamp(d, 0, 1);
  };

  const kGrp = coopSystem?.knight?.group;
  const kGroundY = kGrp ? walkableHeightAt(kGrp.position.x, kGrp.position.z) : 0;
  const kDiss = getCharDissolve(coopSystem?.knight);
  const kSubmerged = !kGrp || !kGrp.visible || kGrp.position.y < kGroundY - 0.15 || kDiss > 0.92;
  if (kGrp && !kSubmerged) {
    setSlot(0, kGrp.position.x + kDiss * 0.35, kGrp.position.z, 0.72 * (1.0 - kDiss * 0.75), 1.0 - kDiss);
  } else {
    setSlot(0, 9999.0, 9999.0, 0.72, 0.0);
  }

  const mGrp = coopSystem?.mage?.group;
  const mGroundY = mGrp ? walkableHeightAt(mGrp.position.x, mGrp.position.z) : 0;
  const mDiss = getCharDissolve(coopSystem?.mage);
  const mSubmerged = !mGrp || !mGrp.visible || mGrp.position.y < mGroundY - 0.15 || mDiss > 0.92;
  if (mGrp && !mSubmerged) {
    setSlot(1, mGrp.position.x + mDiss * 0.35, mGrp.position.z, 0.74 * (1.0 - mDiss * 0.75), 1.0 - mDiss);
  } else {
    setSlot(1, 9999.0, 9999.0, 0.74, 0.0);
  }

  const pool =
    coopSystem?.enemyManager?.allPoolSlots ||
    coopSystem?.enemyManager?.poolSlots ||
    coopSystem?.enemyManager?.pool ||
    [];
  let filled = 0;
  for (let i = 0; i < pool.length && filled < 8; i++) {
    const slot = pool[i];
    const eGrp = slot?.char?.group;
    if (eGrp && eGrp.visible && slot.busy !== false) {
      const r = slot.isBoss || slot.isBossSlot ? 1.12 : 0.70;
      setSlot(2 + filled, eGrp.position.x, eGrp.position.z, r, 1.0);
      filled++;
    }
  }
  while (filled < 8) {
    setSlot(2 + filled, 9999.0, 9999.0, 0.70, 0.0);
    filled++;
  }
}

function updateMeadowFocus(simTime) {
  syncCharacterGroundShadows();
  camera.getWorldDirection(_camDir);
  const flatLen = Math.hypot(_camDir.x, _camDir.z) || 1;
  const fx = _camDir.x / flatLen;
  const fz = _camDir.z / flatLen;

  if (camState.mode === 'player') {
    if (activeProfile === 'tablet') {
      _meadowFocus.set(
        camera.position.x + fx * 22.0,
        player.y,
        camera.position.z + fz * 22.0
      );
    } else {
      _meadowFocus.set(player.x + fx * 10.0, player.y, player.z + fz * 10.0);
    }
  } else if (camera.position.y > 60) {
    _meadowFocus.set(0, 0, 20);
  } else {
    const baseFwd = activeProfile === 'tablet' ? 22.0 : 12.0;
    const fwdOffset = baseFwd + Math.max(0, camera.position.y - 5.0) * 0.85;
    _meadowFocus.set(
      clamp(camera.position.x + fx * fwdOffset, -158, 158),
      0,
      clamp(camera.position.z + fz * fwdOffset, -158, 158)
    );
  }
  meadow.update(simTime, _meadowFocus, camera);
  const isTabletSouthernLobbyVista =
    activeProfile === 'tablet' &&
    ((camera?.position?.z ?? 0) > 105.0 ||
      (appFlow && typeof appFlow.isInGame === 'function' && !appFlow.isInGame()));
  if (roofTilesCombinedMesh) {
    roofTilesCombinedMesh.visible = !isTabletSouthernLobbyVista;
  }
  if (meadow?.grassMesh && activeProfile === 'tablet') {
    const targetTufts = isTabletSouthernLobbyVista
      ? 4500
      : PROFILES.tablet.maxGrassTufts || 6400;
    if (meadow.grassMesh.count !== targetTufts) {
      if (meadow.grassMesh.userData) {
        meadow.grassMesh.userData.allowCountShrink = true;
      }
      meadow.grassMesh.count = targetTufts;
      if (meadow.instanceCounts) {
        meadow.instanceCounts.grassTuft = targetTufts;
      }
    }
  }
  stoneDecals?.updateLod?.(camera);
  if (typeof monumentShaderMats !== 'undefined' && Array.isArray(monumentShaderMats)) {
    for (const mat of monumentShaderMats) {
      if (mat?.uniforms?.uTime) {
        mat.uniforms.uTime.value = simTime;
      }
    }
  }
}

function updateCamera() {
  if (coopSystem?.vfxKit) {
    coopSystem.vfxKit.getCameraShakeOffset(_camShake);
  } else {
    _camShake.set(0, 0, 0);
  }

  if (coopSystem?.getCameraImpactOffset) {
    coopSystem.getCameraImpactOffset(_camImpactPos, _camImpactLook, _camImpactFov);
  } else {
    _camImpactPos.set(0, 0, 0);
    _camImpactLook.set(0, 0, 0);
    _camImpactFov.value = 0;
  }

  _vfxLookOffset.set(0, 0, 0);
  let lookDipY =
    coopSystem?.vfxKit?.artoriousVfx?.getCameraLookOffset?.(_vfxLookOffset)?.y || 0;
  if (lookDipY === 0) {
    const vSeq = coopSystem?.campaignLoop?.verdictSequence;
    if (
      vSeq?.active &&
      vSeq.kind === 'blessing' &&
      vSeq.elapsed >= 2.10 &&
      vSeq.elapsed < 4.25
    ) {
      lookDipY = -0.68;
    }
  }

  if (camState.mode === 'player') {
    setHouseCutoutPlayerPos(player.x, player.y + 1.15, player.z);
    const isMageAim = Boolean(
      coopSystem?.player?.activeHeroId === 'Mage' &&
        coopSystem?.actionAim?.aimState?.active
    );
    const targetShoulder = isMageAim ? 1.0 : 0.0;
    camState.aimShoulderBlend =
      (camState.aimShoulderBlend || 0) +
      (targetShoulder - (camState.aimShoulderBlend || 0)) * 0.22;
    const sb = camState.aimShoulderBlend;
    const sideX = -Math.cos(camState.yaw);
    const sideZ = Math.sin(camState.yaw);

    const h = 1.55 + sb * 0.68 + Math.sin(camState.pitch) * camState.dist;
    const flat = Math.cos(camState.pitch) * (camState.dist - sb * 0.65);
    const basePosX =
      player.x - Math.sin(camState.yaw) * flat + sideX * 0.72 * sb + _camShake.x + _camImpactPos.x;
    const basePosZ =
      player.z - Math.cos(camState.yaw) * flat + sideZ * 0.72 * sb + _camShake.z + _camImpactPos.z;
    const groundAtCam = walkableHeightAt(basePosX, basePosZ);
    const basePosY = Math.max(
      groundAtCam + 0.48,
      player.y + h + _camShake.y + _camImpactPos.y
    );

    const baseLookX =
      player.x + Math.sin(camState.yaw) * 6.0 + sideX * 0.48 * sb + _camShake.x * 0.6 + _camImpactLook.x;
    const baseLookY = player.y + 1.85 - sb * 0.38 + lookDipY + _camShake.y * 0.6 + _camImpactLook.y;
    const baseLookZ =
      player.z + Math.cos(camState.yaw) * 6.0 + sideZ * 0.48 * sb + _camShake.z * 0.6 + _camImpactLook.z;
    const baseFov = (camState.baseFov || 50) + (_camImpactFov.value || 0);

    const b = smoothstep(0.0, 1.0, stoneGazeState.inspectBlend || 0);
    if (b > 0.001) {
      camera.position.set(
        basePosX + (stoneGazeState.inspectPos.x - basePosX) * b,
        basePosY + (stoneGazeState.inspectPos.y - basePosY) * b,
        basePosZ + (stoneGazeState.inspectPos.z - basePosZ) * b
      );
      camera.lookAt(
        baseLookX + (stoneGazeState.inspectTarget.x - baseLookX) * b,
        baseLookY + (stoneGazeState.inspectTarget.y - baseLookY) * b,
        baseLookZ + (stoneGazeState.inspectTarget.z - baseLookZ) * b
      );
      const targetFov = baseFov + ((stoneGazeState.inspectFov || 38) - baseFov) * b;
      if (Math.abs(camera.fov - targetFov) > 1e-3) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
    } else {
      camera.position.set(basePosX, basePosY, basePosZ);
      camera.lookAt(baseLookX, baseLookY, baseLookZ);
      if (Math.abs(camera.fov - baseFov) > 1e-3) {
        camera.fov = baseFov;
        camera.updateProjectionMatrix();
      }
    }
  } else {
    setHouseCutoutPlayerPos(0, 9999, 0);
    camera.position.copy(camState.vistaPos).add(_camShake).add(_camImpactPos);
    camera.lookAt(
      camState.vistaTarget.x + _camShake.x * 0.5 + _camImpactLook.x,
      camState.vistaTarget.y + _camShake.y * 0.5 + _camImpactLook.y,
      camState.vistaTarget.z + _camShake.z * 0.5 + _camImpactLook.z
    );
  }
  camera.updateMatrixWorld();
  stoneDecals?.updateLod?.(camera);
}

export function setView(id, { skipRender = false } = {}) {
  if (!coopSystem || !sky || !post) return;
  const v = VIEWS[id] || VIEWS.plaza;
  activeViewId = v.id;
  activeGameplayShotSpec = null;
  coopSystem?.resetCameraImpact?.();
  resetVerdictSky();
  sky.setEclipseState?.({ weight: 0.0, compression: 0.0, windTimeScale: 1.0, camera });
  post.setSmiteMonochrome?.(0.0);
  if (v.mode === 'player') {
    camState.mode = 'player';
    camState.yaw = v.yaw;
    camState.pitch = v.pitch;
    camState.dist = v.dist;
    camState.baseFov = 50;
    camera.fov = 50;
    camera.updateProjectionMatrix();
    coopSystem.teleportLeaderAndPartner(v.px, v.pz, v.yaw);
  } else {
    camState.mode = 'vista';
    camState.vistaPos.set(...v.pos);
    camState.vistaTarget.set(...v.target);
    camState.baseFov = v.fov || 50;
    camera.fov = v.fov || 50;
    camera.updateProjectionMatrix();
    if (v.id === 'arena') {
      coopSystem.poseForShot('day-arena-wisteria', null, camera);
    }
  }
  updateCamera();
  syncCharacterGroundShadows();
  updateMeadowFocus(windElapsed);
  sky.update(windElapsed);
  if (!skipRender) {
    post.render(0.016);
    updateViewButtons();
    refreshTelemetryReadout();
  } else {
    updateViewButtons();
  }
}

export function setShot(shotId) {
  const s = WORLD_SHOTS[shotId] || WORLD_SHOTS['day-plaza'];
  activeGameplayShotSpec = null;
  autoCycleTod = false;
  sanctuaryLobby?.classList.remove('visible');
  closeAltarSteleModal();
  if (steleInteractPrompt) steleInteractPrompt.classList.remove('visible');
  applyTimeOfDay(s.tod);
  resetVerdictSky();
  sky.setEclipseState?.({ weight: 0.0, compression: 0.0, windTimeScale: 1.0, camera });
  post.setSmiteMonochrome?.(0.0);

  camState.mode = 'vista';
  camState.vistaPos.set(...s.pos);
  camState.vistaTarget.set(...s.target);
  camState.baseFov = s.fov || 52;
  camera.fov = s.fov || 52;
  camera.updateProjectionMatrix();

  // Clear camera shake & impact before posing architectural shot
  coopSystem.vfxKit.clear();
  coopSystem.resetCameraImpact?.();
  updateCamera();

  // Deterministically position and pose Knight, Mage, and East Arena Skeletons (0 VFX/Indicator draws)
  coopSystem.poseForShot(shotId, s.playerPos, camera);
  syncCharacterGroundShadows();

  terrainKit.update(
    0.016,
    1.25,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint,
    camera,
    activeProfile
  );
  village.update(0.016);
  updateMeadowFocus(1.25);
  sky.update(1.25);
  post.render(0.016);
  refreshTelemetryReadout();
}

export function setGameplayShot(gameplayShotId) {
  if (!gameplayShotId) {
    activeGameplayShotSpec = null;
    coopSystem?.vfxKit?.clear?.();
    coopSystem?.vfxKit?.swordVfx?.setInfusion?.('none', 0);
    coopSystem?.enemyManager?.setFrozenForShot?.(null);
    coopSystem?.campaignLoop?.setIndicatorsHiddenForShot?.(false, coopSystem?.heroStates);
    return;
  }
  const spec =
    STAGE5_GAMEPLAY_SHOTS[gameplayShotId] ||
    STAGE5_GAMEPLAY_SHOTS['01-desktop-act1-sunfire-slash'];

  activeGameplayShotSpec = spec;
  autoCycleTod = false;
  sanctuaryLobby?.classList.remove('visible');
  closeAltarSteleModal();
  if (steleInteractPrompt) steleInteractPrompt.classList.remove('visible');
  if (spec.profile && spec.profile !== activeProfile) {
    setProfile(spec.profile);
  }
  applyTimeOfDay(spec.tod || 'day');

  camState.mode = 'vista';
  camState.vistaPos.set(...spec.pos);
  camState.vistaTarget.set(...spec.target);
  camState.baseFov = spec.fov || 46;
  camera.fov = spec.fov || 46;
  camera.updateProjectionMatrix();

  coopSystem.resetCameraImpact?.();
  updateCamera();

  resetVerdictSky();
  if (spec.eclipseState) {
    sky.setEclipseState?.({ ...spec.eclipseState, camera });
  } else {
    sky.setEclipseState?.({ weight: 0.0, compression: 0.0, windTimeScale: 1.0, camera });
  }
  post.setSmiteMonochrome?.(spec.smiteMonochrome ?? 0.0);

  // Pose characters, pooled enemies, combat indicators, and Stage 4 VFX
  coopSystem.poseForGameplayShot(gameplayShotId, camera);

  // Zero out shake offset so framing is 100% deterministic
  coopSystem.vfxKit.frostLance._shakeOffset?.set(0, 0, 0);
  coopSystem.vfxKit.shatterlance._shakeOffset?.set(0, 0, 0);
  coopSystem.vfxKit.cinderFall._shakeOffset?.set(0, 0, 0);
  coopSystem.vfxKit.stormLance._shakeOffset?.set(0, 0, 0);
  coopSystem.vfxKit.swordVfx._shakeOffset?.set(0, 0, 0);
  coopSystem.resetCameraImpact?.();
  updateCamera();

  // Synchronize HUD state & Banner for the showcase shot
  const snap = coopSystem.campaignLoop.getStateSnapshot();
  snap.actId = spec.actId || snap.actId;
  snap.heartResonance = spec.heartResonance ?? 75;
  snap.boss = spec.bossHud || null;
  updateCombatHud(snap);

  if (spec.actStageTag && actStageTag) actStageTag.textContent = spec.actStageTag;
  if (spec.objectiveText && actObjectiveText) actObjectiveText.textContent = spec.objectiveText;

  document.querySelectorAll('.spell-slot-btn').forEach((btn) => {
    btn.classList.toggle('active-cast', Number(btn.dataset.spellSlot) === spec.activeSpellSlot);
  });

  if (spec.touchDemo) {
    touchHud.setDemoState(spec.touchDemo);
  } else {
    touchHud.setDemoState({ joyX: 0, joyY: 0, sprinting: false, activeAction: null });
  }

  if (spec.banner) {
    showCombatBanner(spec.banner, 0);
  } else if (combatBanner) {
    combatBanner.classList.remove('visible');
  }

  const shotWindTime = spec.eclipseState?.windTimeScale === 0 ? 0.0 : 1.25;
  syncCharacterGroundShadows();
  terrainKit.update(
    0.016,
    shotWindTime,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint,
    camera,
    activeProfile
  );
  village.update(0.016);
  updateMeadowFocus(shotWindTime);
  sky.update(shotWindTime);
  post.render(0.016);
  refreshTelemetryReadout();
  return spec;
}

export function setProfile(profileName) {
  if (!PROFILES[profileName]) return;
  activeProfile = profileName;
  const cfg = PROFILES[activeProfile];
  if (renderer) {
    renderer.setPixelRatio(cfg.dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  if (!renderer || !post || !terrainKit || !village || !meadow || !coopSystem) {
    syncProfileButtons();
    return;
  }
  post.setQuality?.({ aaSamples: cfg.aaSamples });
  post.setSize(window.innerWidth, window.innerHeight);
  syncStaticSceneProfile(activeProfile);
  buildMeadowForProfile(activeProfile);
  const pool = coopSystem?.enemyManager?.allPoolSlots || [];
  const showMobOutlines = activeProfile !== 'tablet';
  const toggleBackSideOutlines = (rootObj) => {
    rootObj?.traverse?.((obj) => {
      if (
        obj.isSkinnedMesh &&
        (obj.name?.includes('Outline') || obj.material?.side === THREE.BackSide)
      ) {
        obj.visible = showMobOutlines;
      }
    });
  };
  for (let i = 0; i < pool.length; i++) {
    const slot = pool[i];
    if (!slot) continue;
    toggleBackSideOutlines(slot.char?.modelRoot || slot.char?.group);
  }
  toggleBackSideOutlines(coopSystem?.knight?.modelRoot || coopSystem?.knight?.group);
  toggleBackSideOutlines(coopSystem?.mage?.modelRoot || coopSystem?.mage?.group);
  touchHud.setProfileMode(activeProfile);
  sculptedHud?.setProfileMode(activeProfile);
  applyTimeOfDay(currentTodT);
  updateMeadowFocus(windElapsed);
  post.render(0.016);
  syncProfileButtons();
  refreshTelemetryReadout();
}

/* ------------------------------------------------------------------------- */
/* 11. HUD Controls, Hybrid PointerLock + Drag-Orbit & Zero-Lag Input         */
/* ------------------------------------------------------------------------- */

if (viewSelect) {
  Object.values(VIEWS).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.label;
    viewSelect.appendChild(opt);
  });
  viewSelect.addEventListener('change', (e) => {
    setView(e.target.value);
    viewSelect.blur();
  });
}

document.querySelectorAll('[data-tod]').forEach((btn) => {
  btn.addEventListener('click', () => {
    autoCycleTod = false;
    applyTimeOfDay(btn.dataset.tod);
  });
});

document.querySelectorAll('[data-profile]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setProfile(btn.dataset.profile);
  });
});

function syncTodHudControls() {
  for (const btn of document.querySelectorAll('[data-tod]')) {
    btn.classList.toggle('active', btn.dataset.tod === sky.state.mode);
  }
  sculptedHud?.setTimeOfDaySelection(autoCycleTod ? 'auto' : sky.state.mode);
}

function syncProfileButtons() {
  for (const btn of document.querySelectorAll('[data-profile]')) {
    btn.classList.toggle('active', btn.dataset.profile === activeProfile);
  }
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('profile-tablet', activeProfile === 'tablet');
    document.body.classList.toggle('profile-desktop', activeProfile !== 'tablet');
  }
  if (typeof stoneWorldReadBtn !== 'undefined' && stoneWorldReadBtn) {
    const isTabletPrompt = activeProfile === 'tablet';
    stoneWorldReadBtn.classList.toggle('is-touch-prompt', isTabletPrompt);
    const label = isTabletPrompt ? 'Read' : 'G';
    if (stoneWorldReadBtn.textContent !== label) {
      stoneWorldReadBtn.textContent = label;
    }
    stoneWorldReadBtn.setAttribute('aria-label', label);
  }
}

function updateViewButtons() {
  if (viewSelect && viewSelect.value !== activeViewId) {
    viewSelect.value = activeViewId;
  }
}

function toggleHud(visible) {
  if (!hudEl) return;
  hudEl.style.display = visible ? 'block' : 'none';
  sculptedHud?.setVisible(visible);
}

const keys = new Set();
const DOUBLE_TAP_DODGE_MS = 290;
const DOUBLE_TAP_MAX_HOLD_MS = 340;
const DOUBLE_TAP_DIRECTIONS = {
  a: { dir: 'left', swipeDx: -1, swipeDy: 0 },
  arrowleft: { dir: 'left', swipeDx: -1, swipeDy: 0 },
  d: { dir: 'right', swipeDx: 1, swipeDy: 0 },
  arrowright: { dir: 'right', swipeDx: 1, swipeDy: 0 },
  s: { dir: 'back', swipeDx: 0, swipeDy: 1 },
  arrowdown: { dir: 'back', swipeDx: 0, swipeDy: 1 },
};
const dirTapTracker = {
  dir: null,
  firstDownAt: 0,
  released: false,
  releasedAt: 0,
};
function resetDirectionalDoubleTap() {
  dirTapTracker.dir = null;
  dirTapTracker.firstDownAt = 0;
  dirTapTracker.released = false;
  dirTapTracker.releasedAt = 0;
}
let pointerDragging = false;
let lastMouseX = null;
let lastMouseY = null;
let lmbHoldTimer = null;
let lmbHoldPending = false;
let lmbHoldSimElapsed = 0;

function firePendingLmbHoldUpgrade() {
  if (!lmbHoldPending) return;
  lmbHoldPending = false;
  if (lmbHoldTimer) {
    clearTimeout(lmbHoldTimer);
    lmbHoldTimer = null;
  }
  if (pointerDragging && !coopSystem?.campaignLoop?.isControlLocked?.()) {
    if (coopSystem.player.activeHeroId === 'Mage') {
      eAimDragDistance = 14.5;
      coopSystem.triggerAction('shatterlance_aim_start', {
        yaw: camState.yaw,
        pitch: camState.pitch,
        distance: eAimDragDistance,
      });
    } else {
      const isMovingOrDashing =
        keys.has('shift') ||
        keys.has('w') ||
        keys.has('a') ||
        keys.has('s') ||
        keys.has('d') ||
        keys.has(' ');
      if (!isMovingOrDashing) {
        coopSystem.triggerAction('heavy');
      }
    }
  }
}

const ORBIT_SENSITIVITY_MULT = Object.freeze({
  low: 0.62,
  medium: 0.85,
  high: 1.18,
});

function applyCameraOrbitDelta(dx, dy, meta = {}) {
  const numDx = Number(dx);
  const numDy = Number(dy);
  if (!Number.isFinite(numDx) || !Number.isFinite(numDy)) return;

  const isTouch =
    meta?.inputType === 'touch' || (activeProfile === 'tablet' && meta?.inputType !== 'mouse');
  camState.orbitCooldown = 0.75;

  let dYaw = 0;
  let dPitch = 0;
  if (isTouch) {
    const vw = clamp(Number(meta?.viewportWidth || window.innerWidth || 1180), 560, 2200);
    const vh = clamp(Number(meta?.viewportHeight || window.innerHeight || 787), 360, 1400);
    const dtMs = clamp(Number(meta?.dtMs || 16), 6, 120);
    const sensKey = meta?.sensitivity || camState.sensitivity || 'high';
    const sensMult = ORBIT_SENSITIVITY_MULT[sensKey] ?? ORBIT_SENSITIVITY_MULT.high;
    const instSpeed = Math.hypot(numDx, numDy) / dtMs;
    const accel = 1.0 + 1.05 * smoothstep(0.22, 1.45, instSpeed);
    const pitchAccel = 0.85 + 0.35 * smoothstep(0.22, 1.45, instSpeed);
    dYaw = (numDx / vw) * (4.15 * sensMult * accel);
    dPitch = (numDy / vh) * (2.15 * sensMult * pitchAccel);
  } else {
    dYaw = numDx * 0.0048;
    dPitch = numDy * 0.0042;
  }

  if (camState.mode === 'player') {
    camState.yaw -= dYaw;
    camState.pitch = clamp(camState.pitch + dPitch, 0.04, 1.15);
  } else {
    const offset = camState.vistaPos.clone().sub(camState.vistaTarget);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta -= dYaw;
    sph.phi = clamp(sph.phi - dPitch, 0.08, Math.PI * 0.47);
    offset.setFromSpherical(sph);
    camState.vistaPos.copy(camState.vistaTarget).add(offset);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'F3') {
    e.preventDefault();
    debugDevPill?.classList.toggle('visible');
    return;
  }

  if (!coopSystem || !player) return;

  if (e.key === 'F4') {
    const isDevMode =
      debugDevPill?.classList.contains('visible') ||
      new URLSearchParams(location.search).has('debug') ||
      new URLSearchParams(location.search).has('nolobby');
    if (!isDevMode) return;
    // DEV_SOLO_TEST_REMOVE_FOR_PROD: Cycle unlocked stage 0 -> 1 -> 2 -> 3 -> 0
    e.preventDefault();
    const curProg = coopSystem.coopClient.getProgressionState();
    const curStage = devStageOverride !== null ? devStageOverride : (curProg?.unlockedStage || 0);
    const nextStage = (curStage + 1) % 4;
    devStageOverride = nextStage;
    const mask = nextStage >= 3 ? 0b111 : nextStage === 2 ? 0b011 : nextStage === 1 ? 0b001 : 0;
    const updated = coopSystem.coopClient.progression.setUnlocks({
      communeDiscovered: nextStage >= 1,
      iceUnlocked: nextStage >= 1,
      fireUnlocked: nextStage >= 2,
      ultimateUnlocked: nextStage >= 3,
      stone1Solved: nextStage >= 1,
      stone2Solved: nextStage >= 2,
      stone3Solved: nextStage >= 3,
      stonesSolvedMask: mask,
    });
    coopSystem.setUnlockedStage?.(nextStage);
    coopSystem.campaignLoop?.setUnlockedStage?.(nextStage, mask);
    sculptedHud?.setProgressionState(updated);
    updateCombatHud(coopSystem.campaignLoop.getStateSnapshot(coopSystem.heroStates));
    return;
  }

  if (stoneGazeState.inspectActive) {
    const kExit = e.key.toLowerCase();
    if (
      e.key === 'Escape' ||
      kExit === 'g' ||
      kExit === 'f' ||
      kExit === 'c' ||
      kExit === 'e' ||
      kExit === ' ' ||
      kExit === 'w' ||
      kExit === 'a' ||
      kExit === 's' ||
      kExit === 'd'
    ) {
      e.preventDefault();
      exitStoneInspection();
      return;
    }
  }

  if (e.key === 'Escape' && altarSteleModal?.classList.contains('visible')) {
    closeAltarSteleModal();
    return;
  }

  if (e.key === 'Escape' && communeClient?.getState?.()?.state === 'listening') {
    e.preventDefault();
    communeClient.cancelCommune({ reason: 'escape_cancel' });
    return;
  }

  const cStateSnap = communeClient?.getState?.();
  if (
    cStateSnap?.state === 'idle' &&
    !cStateSnap.partnerCommuning &&
    (coopSystem?.communeChannel?.localInitiated ||
      !coopSystem?.coopClient?.getState?.()?.peerConnected) &&
    (coopSystem?.campaignLoop?.communeChannelActive || coopSystem?.communeChannel?.active) &&
    !coopSystem?.campaignLoop?.verdictSequence?.active
  ) {
    coopSystem.cancelCommuneChannel({ broadcast: false });
  }

  if (isUiOverlayBlockingInput()) {
    return;
  }

  const k = e.key.toLowerCase();
  const wasPressed = keys.has(k);
  keys.add(k);

  const prog = coopSystem.coopClient.getProgressionState() || {};
  const hudState = sculptedHud?.getState?.() || {};
  const loopStage = Number(coopSystem?.campaignLoop?.getUnlockedStage?.() || 0);
  const communeReady = Boolean(
    prog.communeDiscovered ||
      prog.unlockedStage >= 1 ||
      hudState.communeDiscovered ||
      hudState.unlockedStage >= 1 ||
      loopStage >= 1
  );
  const eSkillReady = Boolean(
    prog.unlockedStage >= 1 ||
      prog.iceUnlocked ||
      prog.fireUnlocked ||
      hudState.unlockedStage >= 1 ||
      hudState.iceUnlocked ||
      hudState.fireUnlocked ||
      loopStage >= 1
  );
  const tabToggleReady = Boolean(
    prog.unlockedStage >= 2 ||
      (prog.iceUnlocked && prog.fireUnlocked) ||
      hudState.unlockedStage >= 2 ||
      (hudState.iceUnlocked && hudState.fireUnlocked) ||
      loopStage >= 2
  );
  const qUltReady = Boolean(
    prog.unlockedStage >= 3 ||
      prog.ultimateUnlocked ||
      hudState.unlockedStage >= 3 ||
      hudState.ultimateUnlocked ||
      loopStage >= 3
  );

  if (!wasPressed && k === 'v') {
    if (!communeReady) return;
    activeGameplayShotSpec = null;
    startCommuneHold();
    return;
  }

  if (coopSystem?.campaignLoop?.isControlLocked?.()) {
    return;
  }

  if (k === 'tab') {
    e.preventDefault();
    if (e.altKey) {
      const isTwoPlayerConnected = Boolean(appFlow?.getState?.()?.peerConnected);
      if (!isTwoPlayerConnected) {
        coopSystem.swapActiveHero();
      }
    } else if (tabToggleReady) {
      const res = coopSystem.toggleElement(coopSystem.player.activeHeroId);
      if (res?.element) {
        sculptedHud?.setElement(res.element);
      }
    }
    return;
  }

  if (!wasPressed && k === 'g') {
    if (stoneGazeState.inspectActive) {
      exitStoneInspection();
    } else {
      const near = coopSystem.getNearestInscriptionStone(5.6);
      if (near) {
        enterStoneInspection(near);
      }
    }
    return;
  }

  const devKeys =
    debugDevPill?.classList.contains('visible') || new URLSearchParams(location.search).has('debug');

  // Alt + 1..8 camera presets are debug-only (F3 dev panel or ?debug)
  if (e.altKey) {
    if (!devKeys) return;
    if (k === '1') setView('entry');
    else if (k === '2') setView('plaza');
    else if (k === '3') setView('mill');
    else if (k === '4') setView('arena');
    else if (k === '5') setView('shrine');
    else if (k === '6') setView('shrineLookback');
    else if (k === '7') setView('aerial');
    else if (k === '8') setView('topdown');
    return;
  }

  if (devKeys && k === '5') setView('shrine');
  else if (devKeys && k === '6') setView('shrineLookback');
  else if (devKeys && k === '7') setView('aerial');
  else if (devKeys && k === '8') setView('topdown');
  else if (!wasPressed && k === 'c') {
    if (!eSkillReady) return;
    activeGameplayShotSpec = null;
    if (camState.mode === 'vista') camState.mode = 'player';
    if (coopSystem.player.activeHeroId === 'Mage') {
      const activeMageSpell =
        coopSystem.heroStates?.Mage?.selectedSpell ||
        (coopSystem.heroStates?.Mage?.selectedElement === 'fire'
          ? 'cinder_fall'
          : 'frost_lance');
      eAimDragDistance = activeMageSpell === 'frost_lance' ? 14.5 : 14.5;
      coopSystem.startSkillAim({
        source: 'desktop',
        spellId: activeMageSpell,
        camYaw: camState.yaw,
        camPitch: camState.pitch,
      });
    } else {
      coopSystem.triggerAction('skill');
    }
  } else if (!wasPressed && k === 'q') {
    if (!qUltReady) return;
    activeGameplayShotSpec = null;
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerAction('ultimate');
  } else if (!wasPressed && k === 'f') {
    activeGameplayShotSpec = null;
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerAction('heavy');
  } else if (devKeys && k === 't') {
    autoCycleTod = false;
    const order = ['day', 'evening', 'twilight', 'night'];
    const nextIdx = (order.indexOf(sky.state.mode) + 1) % order.length;
    applyTimeOfDay(order[nextIdx]);
  } else if (devKeys && k === 'p') {
    autoCycleTod = !autoCycleTod;
    syncTodHudControls();
  } else if (!wasPressed && k === 'h') {
    toggleHud(hudEl && hudEl.style.display === 'none');
  } else if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(k)) {
    if (coopSystem.player.activeHeroId !== 'Mage') {
      lmbHoldPending = false;
      if (lmbHoldTimer) {
        clearTimeout(lmbHoldTimer);
        lmbHoldTimer = null;
      }
    }
    if (camState.mode === 'vista') {
      activeGameplayShotSpec = null;
      camState.mode = 'player';
      updateViewButtons();
    }
    const dirTap = DOUBLE_TAP_DIRECTIONS[k];
    if (dirTap && !e.repeat && !wasPressed && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (
        dirTapTracker.dir === dirTap.dir &&
        dirTapTracker.released &&
        now - dirTapTracker.releasedAt <= DOUBLE_TAP_DODGE_MS
      ) {
        resetDirectionalDoubleTap();
        activeGameplayShotSpec = null;
        if (camState.mode === 'vista') camState.mode = 'player';
        lmbHoldPending = false;
        if (lmbHoldTimer) {
          clearTimeout(lmbHoldTimer);
          lmbHoldTimer = null;
        }
        coopSystem.triggerAction('dash', {
          swipeDx: dirTap.swipeDx,
          swipeDy: dirTap.swipeDy,
          camYaw: camState.yaw,
        });
      } else {
        dirTapTracker.dir = dirTap.dir;
        dirTapTracker.firstDownAt = now;
        dirTapTracker.released = false;
        dirTapTracker.releasedAt = 0;
      }
    }
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (!coopSystem || !player) return;
  const dirTap = DOUBLE_TAP_DIRECTIONS[k];
  if (dirTap) {
    if (isUiOverlayBlockingInput() || stoneGazeState.inspectActive) {
      resetDirectionalDoubleTap();
    } else if (dirTapTracker.dir === dirTap.dir && !dirTapTracker.released) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - dirTapTracker.firstDownAt <= DOUBLE_TAP_MAX_HOLD_MS) {
        dirTapTracker.released = true;
        dirTapTracker.releasedAt = now;
      } else {
        resetDirectionalDoubleTap();
      }
    }
  }
  if (isUiOverlayBlockingInput()) return;
  if (k === 'v') {
    finishCommuneHold();
  } else if (
    k === 'f' &&
    coopSystem?.player?.activeHeroId === 'Knight'
  ) {
    coopSystem.triggerAction('release_heavy');
  } else if (
    k === 'c' &&
    coopSystem.player.activeHeroId === 'Mage' &&
    coopSystem.actionAim?.aimState?.active
  ) {
    if (coopSystem.actionAim.aimState.spellId === 'shatterlance') {
      coopSystem.releaseSkillAim({
        distance: eAimDragDistance,
        yaw: camState.yaw,
        pitch: camState.pitch,
      });
    } else {
      coopSystem.releaseSkillAim({
        camYaw: camState.yaw,
        camPitch: camState.pitch,
      });
    }
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (appFlow && appFlow.getStep?.() === FLOW_STEPS.FLOWER_LOBBY) {
    if (e.button === 0) {
      tryRaycastFlowerLobbyHero(e.clientX, e.clientY);
    }
    return;
  }
  if (!coopSystem || !player) return;
  if (isUiOverlayBlockingInput()) return;
  if (coopSystem?.campaignLoop?.isControlLocked?.()) return;
  if (e.button === 2) {
    e.preventDefault();
    activeGameplayShotSpec = null;
    if (camState.mode === 'vista') {
      camState.mode = 'player';
      updateViewButtons();
    }
    pointerDragging = false;
    lmbHoldPending = false;
    if (lmbHoldTimer) {
      clearTimeout(lmbHoldTimer);
      lmbHoldTimer = null;
    }
    coopSystem.triggerAction('dash');
    return;
  }

  if (e.button !== 0) return;

  // Request Genshin-style PointerLock inside try/catch (graceful fallback in headless browsers)
  try {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  } catch {
    // ignore
  }

  pointerDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  activeGameplayShotSpec = null;

  if (camState.mode === 'vista') {
    camState.mode = 'player';
    updateViewButtons();
  }

  // Zero-lag 0ms LMB attack + Hold (140ms Mage Shatterlance Aim / 280ms Knight Shield Block)
  const atkRes = coopSystem.triggerAction('attack');
  if (lmbHoldTimer) clearTimeout(lmbHoldTimer);
  if (atkRes?.shieldBash) {
    lmbHoldPending = false;
    lmbHoldSimElapsed = 0;
    return;
  }
  lmbHoldPending = true;
  lmbHoldSimElapsed = 0;
  const holdDelay = coopSystem.player.activeHeroId === 'Mage' ? 140 : 280;
  lmbHoldTimer = setTimeout(() => {
    lmbHoldTimer = null;
    if (!(typeof window.__FIXED_DT__ === 'number' && window.__FIXED_DT__ > 0)) {
      firePendingLmbHoldUpgrade();
    }
  }, holdDelay);
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mouseup', () => {
  pointerDragging = false;
  lmbHoldPending = false;
  if (lmbHoldTimer) {
    clearTimeout(lmbHoldTimer);
    lmbHoldTimer = null;
  }
  if (!coopSystem || !player) return;
  if (
    coopSystem?.player?.activeHeroId === 'Knight' &&
    coopSystem?.heroStates?.Knight?.shieldBlocking
  ) {
    coopSystem.triggerAction('release_heavy');
  }
  if (
    coopSystem?.player?.activeHeroId === 'Mage' &&
    coopSystem.actionAim?.aimState?.active &&
    coopSystem.actionAim.aimState.spellId === 'shatterlance'
  ) {
    coopSystem.triggerAction('shatterlance_aim_release', {
      distance: eAimDragDistance,
      yaw: camState.yaw,
      pitch: camState.pitch,
    });
  }
});

window.addEventListener('blur', () => {
  keys.clear();
  resetDirectionalDoubleTap();
  pointerDragging = false;
  lmbHoldPending = false;
  if (lmbHoldTimer) {
    clearTimeout(lmbHoldTimer);
    lmbHoldTimer = null;
  }
  const cSnap = communeClient?.getState?.();
  if (cSnap?.state === 'listening' && cSnap?.pressHeld) {
    communeClient.endPress({ speakerRole: coopSystem?.player?.activeHeroId || 'Knight' });
  }
  if (!coopSystem) return;
  if (coopSystem?.heroStates?.Knight?.shieldBlocking) {
    coopSystem.triggerAction('release_heavy');
  }
});

window.addEventListener('mousemove', (e) => {
  if (!coopSystem || !player) return;
  const isMageAiming =
    coopSystem?.player?.activeHeroId === 'Mage' &&
    Boolean(coopSystem.actionAim?.aimState?.active);
  const hasPrevMouse = lastMouseX !== null && lastMouseY !== null;
  const rawDx = hasPrevMouse ? e.clientX - lastMouseX : 0;
  const rawDy = hasPrevMouse ? e.clientY - lastMouseY : 0;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  if (document.pointerLockElement === canvas) {
    const mx = e.movementX || rawDx || 0;
    const my = e.movementY || rawDy || 0;
    applyCameraOrbitDelta(mx, my);
    if (isMageAiming) {
      if (coopSystem.actionAim?.aimState?.spellId === 'shatterlance') {
        eAimDragDistance = clamp(eAimDragDistance - my * 0.085, 0.8, 18.0);
        coopSystem.updateSkillAim({
          distance: eAimDragDistance,
          yaw: camState.yaw,
          pitch: camState.pitch,
        });
      } else {
        coopSystem.updateSkillAim({
          camYaw: camState.yaw,
          camPitch: camState.pitch,
        });
      }
    }
    return;
  }
  if (!pointerDragging && !isMageAiming) return;
  applyCameraOrbitDelta(rawDx, rawDy);
  if (isMageAiming) {
    if (coopSystem.actionAim?.aimState?.spellId === 'shatterlance') {
      eAimDragDistance = clamp(eAimDragDistance - rawDy * 0.085, 0.8, 18.0);
      coopSystem.updateSkillAim({
        distance: eAimDragDistance,
        yaw: camState.yaw,
        pitch: camState.pitch,
      });
    } else {
      coopSystem.updateSkillAim({
        camYaw: camState.yaw,
        camPitch: camState.pitch,
      });
    }
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (isUiOverlayBlockingInput()) return;
    if (camState.mode === 'player') {
      camState.dist = clamp(camState.dist + e.deltaY * 0.008, 4.5, 24);
    } else {
      const offset = camState.vistaPos.clone().sub(camState.vistaTarget);
      offset.multiplyScalar(clamp(1 + e.deltaY * 0.001, 0.8, 1.25));
      camState.vistaPos.copy(camState.vistaTarget).add(offset);
    }
  },
  { passive: true }
);

function syncViewportDimensions() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const w = Math.max(1, Math.round(vv?.width || window.innerWidth || 1280));
  const h = Math.max(1, Math.round(vv?.height || window.innerHeight || 720));
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--app-vw', `${w}px`);
    document.documentElement.style.setProperty('--app-vh', `${h}px`);
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer?.setSize?.(w, h);
  post?.setSize?.(w, h);
  if (appFlow && appFlow.getStep?.() === FLOW_STEPS.FLOWER_LOBBY) {
    updateFlowerLobbyHeroProjections();
  }
}

window.addEventListener('resize', syncViewportDimensions);
window.addEventListener('orientationchange', () => {
  setTimeout(syncViewportDimensions, 80);
  setTimeout(syncViewportDimensions, 260);
});
if (typeof window !== 'undefined' && window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncViewportDimensions);
}

/* ------------------------------------------------------------------------- */
/* 12. Main Loop, Performance Measurement & Telemetry API                     */
/* ------------------------------------------------------------------------- */

let evaluateMaliG68Frame = null;

const clock = new THREE.Clock();
let frames = 0;
let telemetryTimer = 0;
let mobileTelemetryTimer = 0;
const mobileFrameMsHistory = [];
let lastSampledSceneDraws = 0;
let lastSampledSceneTris = 0;
let measuredFps = 144;
let avgFrameMs = 2.4;

function getMaliG68Report() {
  stoneDecals?.updateLod?.(camera);
  if (typeof evaluateMaliG68Frame === 'function') {
    return evaluateMaliG68Frame({
      scene,
      renderer,
      post,
      camera,
      profile: activeProfile,
    });
  }
  return null;
}

function getSceneStats() {
  stoneDecals?.updateLod?.(camera);
  renderer.info.autoReset = false;
  renderer.info.reset();
  post.render(0.016);
  const totalCalls = renderer.info.render.calls;
  const totalTris = renderer.info.render.triangles;
  renderer.info.autoReset = true;

  const postDraws = post.bloomPass?.enabled ? 11 : 1;
  const postTris = postDraws * 2;
  const sceneDraws = Math.max(1, totalCalls - postDraws);
  const sceneTris = Math.max(0, totalTris - postTris);
  lastSampledSceneDraws = sceneDraws;
  lastSampledSceneTris = sceneTris;

  return {
    profile: activeProfile,
    timeOfDay: sky.state.mode,
    todT: Number(currentTodT.toFixed(3)),
    fps: measuredFps,
    frameMs: avgFrameMs,
    draws: sceneDraws,
    composerDraws: totalCalls,
    triangles: sceneTris,
    bloomStrength: Number(post.params.bloomStrength.toFixed(2)),
    activeHero: player.activeHeroId,
    partnerHero: player.partnerHeroId,
    playerPos: {
      x: Number(player.x.toFixed(1)),
      y: Number(player.y.toFixed(1)),
      z: Number(player.z.toFixed(1)),
    },
  };
}

function measurePerformance(iterations = 24) {
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const simTime = 1.25 + i * (1 / 144);
    terrainKit.update(
      1 / 144,
      simTime,
      sky.activeLightDir,
      sky.state.daylight,
      sky.state.fogColor,
      sky.state.worldTint,
      camera,
      activeProfile
    );
    village.update(1 / 144);
    updateMeadowFocus(simTime);
    sky.update(simTime);
    post.render(1 / 144);
  }
  const t1 = performance.now();
  avgFrameMs = Number(((t1 - t0) / iterations).toFixed(2));
  measuredFps = avgFrameMs <= 6.94 ? 144 : Math.min(144, Math.round(1000 / avgFrameMs));
  return { avgFrameMs, measuredFps };
}

function refreshTelemetryReadout(drawsOverride = null) {
  if (!statsEl) return;
  const sceneDraws = drawsOverride ?? getSceneStats().draws;
  statsEl.textContent = `${measuredFps} FPS · ${sceneDraws} draws`;
}

let stoneWorldReadBtn = null;
let stoneInspectExitOverlay = null;

export function setCameraOrbit(yaw, pitch = 0.14, dist = 7.8) {
  camState.mode = 'player';
  if (typeof yaw === 'number') camState.yaw = yaw;
  if (typeof pitch === 'number') camState.pitch = clamp(pitch, 0.04, 1.15);
  if (typeof dist === 'number') camState.dist = clamp(dist, 3.5, 24.0);
  updateCamera();
}

function initStoneInspectionUi() {
  if (typeof document === 'undefined' || stoneWorldReadBtn) return;

  const style = document.createElement('style');
  style.id = 'amarante-stone-inspect-ui-style';
  style.textContent = `
    #stone-world-read-btn {
      position: fixed;
      z-index: 880;
      transform: translate(-50%, -50%) scale(0.92);
      opacity: 0;
      pointer-events: none;
      width: 42px;
      height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, rgba(250, 244, 230, 0.96) 0%, rgba(224, 212, 190, 0.96) 100%);
      border: 2px solid rgba(112, 95, 74, 0.92);
      box-shadow:
        0 6px 18px rgba(24, 18, 12, 0.38),
        inset 0 1.5px 0 rgba(255, 252, 244, 0.9);
      color: #362c22;
      font-family: 'EB Garamond', 'Palatino Linotype', Georgia, serif;
      font-size: 19px;
      font-weight: 700;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      transition: opacity 0.16s ease, transform 0.16s ease;
    }
    body.profile-tablet #stone-world-read-btn,
    #stone-world-read-btn.is-touch-prompt {
      width: auto;
      min-width: 78px;
      height: 44px;
      padding: 0 16px;
      border-radius: 999px;
      font-size: 16px;
      letter-spacing: 0.02em;
    }
    #stone-world-read-btn.is-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, -50%) scale(1);
    }
    #stone-world-read-btn:hover {
      transform: translate(-50%, -52%) scale(1.06);
    }
    #stone-world-read-btn:active {
      transform: translate(-50%, -49%) scale(0.96);
    }
    #stone-inspect-exit-overlay {
      position: fixed;
      inset: 0;
      z-index: 940;
      background: transparent;
      opacity: 0;
      pointer-events: none;
      cursor: pointer;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding-bottom: max(22px, env(safe-area-inset-bottom, 22px));
      transition: opacity 0.18s ease;
    }
    #stone-inspect-exit-overlay.is-active {
      opacity: 1;
      pointer-events: auto;
    }
    .stone-inspect-exit-pill {
      display: none;
      padding: 8px 18px;
      border-radius: 999px;
      background: rgba(252, 249, 242, 0.90);
      border: 1.5px solid #c8b79a;
      box-shadow: 0 6px 20px rgba(24, 20, 14, 0.22);
      color: #2f261d;
      font-family: "Plus Jakarta Sans", "Outfit", system-ui, sans-serif;
      font-size: 0.84rem;
      font-weight: 700;
      pointer-events: none;
    }
    body.profile-tablet .stone-inspect-exit-pill {
      display: inline-flex;
    }
  `;
  document.head.appendChild(style);

  stoneWorldReadBtn = document.createElement('button');
  stoneWorldReadBtn.id = 'stone-world-read-btn';
  stoneWorldReadBtn.type = 'button';
  const initLabel = activeProfile === 'tablet' ? 'Read' : 'G';
  stoneWorldReadBtn.setAttribute('aria-label', initLabel);
  stoneWorldReadBtn.textContent = initLabel;
  stoneWorldReadBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  stoneWorldReadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (stoneGazeState.nearbyStone) {
      enterStoneInspection(stoneGazeState.nearbyStone);
    }
  });
  document.body.appendChild(stoneWorldReadBtn);

  stoneInspectExitOverlay = document.createElement('div');
  stoneInspectExitOverlay.id = 'stone-inspect-exit-overlay';
  stoneInspectExitOverlay.innerHTML = '<span class="stone-inspect-exit-pill">Tap anywhere to return</span>';
  stoneInspectExitOverlay.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    exitStoneInspection();
  });
  document.body.appendChild(stoneInspectExitOverlay);
  syncProfileButtons();
}

export function enterStoneInspection(stone = null) {
  const targetStone =
    stone || stoneGazeState.nearbyStone || coopSystem.getNearestInscriptionStone(6.0);
  if (!targetStone) return null;

  if (coopSystem?.campaignLoop?.isStoneContested?.(targetStone, coopSystem?.heroStates)) {
    coopSystem?.combatSfx?.playUi?.('locked');
    showCombatBanner(
      {
        title: 'SACRED STONE SEALED BY GUARDIANS',
        subtitle: 'Defeat all nearby enemies before reading the Sacred Inscription!',
        kind: 'warning',
      },
      3200
    );
    return null;
  }
  coopSystem?.combatSfx?.playStoneInspect?.();

  try {
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  } catch {
    // ignore
  }

  const canonicalLegacyId = normalizeLegacyStoneId(targetStone);
  const siteKey =
    canonicalLegacyId === 'stone_grove'
      ? 'grove'
      : canonicalLegacyId === 'stone_pier'
        ? 'cottage_wall'
        : 'well';

  if (siteKey === 'well') {
    stoneGazeState.inspectPos.set(0.0, 0.50, 2.76);
    stoneGazeState.inspectTarget.set(0.0, 0.49, 1.24);
    stoneGazeState.inspectFov = 38;
  } else if (siteKey === 'grove') {
    const gx = targetStone.position?.x ?? 142.0;
    const gz = targetStone.position?.z ?? 44.0;
    const sy = terrainHeightAt(gx, gz);
    stoneGazeState.inspectPos.set(gx, sy + 2.85, gz + 0.18);
    stoneGazeState.inspectTarget.set(gx, sy + 0.180, gz + 0.02);
    stoneGazeState.inspectFov = 40;
  } else {
    const wx = targetStone.position?.x ?? -124.0;
    const wz = targetStone.position?.z ?? 84.0;
    const wy = terrainHeightAt(wx, wz);
    const rotY = targetStone.rotY ?? 0.45;
    const nx = Math.sin(rotY);
    const nz = Math.cos(rotY);
    stoneGazeState.inspectPos.set(wx + nx * 3.12, wy + 1.00, wz + nz * 3.12);
    stoneGazeState.inspectTarget.set(wx, wy + 0.88, wz);
    stoneGazeState.inspectFov = 42;
  }

  stoneGazeState.inspectActive = true;
  stoneGazeState.activeStoneId = canonicalLegacyId;
  coopSystem?.campaignLoop?.setStoneInspecting?.(true);
  damageNumbers?.clear?.();
  if (typeof document !== 'undefined') {
    document
      .querySelectorAll('#amarante-damage-numbers-layer .am-dmg-pop')
      .forEach((el) => el.remove());
  }
  const inspectStoneX =
    targetStone.position?.x ??
    (siteKey === 'grove' ? 142.0 : siteKey === 'cottage_wall' ? -124.0 : 0.0);
  const inspectStoneZ =
    targetStone.position?.z ??
    (siteKey === 'grove' ? 44.0 : siteKey === 'cottage_wall' ? 84.0 : 0.0);
  const activeEnemies = coopSystem?.enemyManager?.activeEnemies || [];
  for (let i = 0; i < activeEnemies.length; i++) {
    const e = activeEnemies[i];
    if (!e || !e.dead) continue;
    if (Math.hypot((e.x ?? 0) - inspectStoneX, (e.z ?? 0) - inspectStoneZ) <= 10.0) {
      if (e.char?.group) e.char.group.visible = false;
      e.deathTimer = Math.min(e.deathTimer ?? 0, 0.01);
    }
  }
  coopSystem?.combatSfx?.setAmbienceState?.('stone');
  stoneDecals?.updateLod?.(camera);
  keys.clear();
  sculptedHud?.resetJoystick?.();
  sculptedHud?.setVisible(false);

  if (stoneWorldReadBtn) {
    stoneWorldReadBtn.classList.remove('is-visible');
  }

  if (stoneInspectExitOverlay) {
    const pill = stoneInspectExitOverlay.querySelector('.stone-inspect-exit-pill');
    if (pill) {
      pill.textContent =
        activeProfile === 'tablet' ? 'Tap anywhere to return' : 'Click anywhere or press Esc to return';
    }
    stoneInspectExitOverlay.classList.add('is-active');
  }

  const readInfo = coopSystem.coopClient.sendStoneRead(targetStone.id || canonicalLegacyId);
  sculptedHud?.setProgressionState(readInfo.state);
  if (stoneGazeState.stones[canonicalLegacyId]) {
    stoneGazeState.stones[canonicalLegacyId].gazeElapsed = 3.0;
    stoneGazeState.stones[canonicalLegacyId].unlocked = true;
  }

  return targetStone;
}

export function exitStoneInspection() {
  if (!stoneGazeState.inspectActive) return;
  stoneGazeState.inspectActive = false;
  coopSystem?.campaignLoop?.setStoneInspecting?.(false);
  coopSystem?.combatSfx?.playUi?.('modal_close');
  coopSystem?.combatSfx?.setAmbienceState?.('valley');
  stoneDecals?.updateLod?.(camera);
  if (stoneInspectExitOverlay) {
    stoneInspectExitOverlay.classList.remove('is-active');
  }
  if (hudEl && hudEl.style.display !== 'none') {
    sculptedHud?.setVisible(true);
  }
}

function updateSacredStoneGaze(dt) {
  // 1. Advance smooth camera inspection blend (0 -> 1 on inspect, 1 -> 0 on exit)
  const targetBlend = stoneGazeState.inspectActive ? 1.0 : 0.0;
  const blendStep = 1.0 - Math.exp(-8.5 * Math.max(0.001, dt));
  stoneGazeState.inspectBlend += (targetBlend - stoneGazeState.inspectBlend) * blendStep;
  if (Math.abs(targetBlend - stoneGazeState.inspectBlend) < 0.002) {
    stoneGazeState.inspectBlend = targetBlend;
  }

  // Hide local hero meshes during close-up stone inspection so their bodies never block the tablet
  const hideHeroes = stoneGazeState.inspectBlend > 0.25 && camState.mode === 'player';
  if (coopSystem?.knight?.group) {
    coopSystem.knight.group.visible = !hideHeroes;
  }
  if (coopSystem?.mage?.group) {
    coopSystem.mage.group.visible = !hideHeroes;
  }

  const nearStone = coopSystem.getNearestInscriptionStone(5.5);
  stoneGazeState.nearbyStone = nearStone;

  const stoneContested = nearStone
    ? Boolean(coopSystem?.campaignLoop?.isStoneContested?.(nearStone, coopSystem?.heroStates))
    : Boolean((coopSystem?.campaignLoop?.getNearbyLivingEnemies?.(player, 16.0)?.length || 0) > 0);
  stoneGazeState.inActiveMeleeDanger = stoneContested;

  // Only reveal [R] Commune button when the stone is uncontested (never while guardians are still alive!)
  if (nearStone && !stoneContested && camState.mode === 'player') {
    if (!coopSystem.coopClient.getProgressionState()?.communeDiscovered) {
      const updated = coopSystem.coopClient.progression.setUnlocks({ communeDiscovered: true });
      sculptedHud?.setProgressionState(updated);
    }
  }

  if (stoneGazeState.inspectActive && stoneContested) {
    exitStoneInspection();
  }

  // Position the world-projected "Read Carved Stone" button right near the stone ONLY when no enemies contest it!
  const showReadBtn = Boolean(
    camState.mode === 'player' &&
      nearStone &&
      !stoneContested &&
      !stoneGazeState.inspectActive &&
      stoneGazeState.inspectBlend <= 0.02 &&
      !isUiOverlayBlockingInput() &&
      !coopSystem?.campaignLoop?.isControlLocked?.() &&
      !coopSystem?.campaignLoop?.verdictSequence?.active
  );

  if (stoneWorldReadBtn) {
    if (showReadBtn && nearStone?.position) {
      const sx = nearStone.position.x;
      const sz = nearStone.position.z;
      const sy = terrainHeightAt(sx, sz);
      const anchorY =
        nearStone.siteKey === 'well'
          ? sy + 1.15
          : nearStone.siteKey === 'grove'
            ? sy + 0.85
            : sy + 1.85;
      const proj = projectWorldPointToScreen(sx, anchorY, sz);
      const clampedX = clamp(proj.xPct, 24, 76);
      const clampedY = clamp(proj.yPct, 22, 74);
      stoneWorldReadBtn.style.left = `${clampedX.toFixed(1)}%`;
      stoneWorldReadBtn.style.top = `${clampedY.toFixed(1)}%`;
      const isTabletPrompt = activeProfile === 'tablet';
      stoneWorldReadBtn.classList.toggle('is-touch-prompt', isTabletPrompt);
      const label = isTabletPrompt ? 'Read' : 'G';
      if (stoneWorldReadBtn.textContent !== label) {
        stoneWorldReadBtn.textContent = label;
      }
      stoneWorldReadBtn.setAttribute('aria-label', label);
      stoneWorldReadBtn.classList.add('is-visible');
    } else {
      stoneWorldReadBtn.classList.remove('is-visible');
    }
  }

  if (steleInteractPrompt) {
    steleInteractPrompt.classList.remove('visible');
  }
}

let bootAudioGated = false;

function releaseBootAudioGateIfReady() {
  if (!bootAudioGated) return;
  bootAudioGated = false;
  coopSystem?.combatSfx?.setMasterVolume?.(0.68);
  const step = appFlow?.getStep?.();
  if (step === FLOW_STEPS.FLOWER_LOBBY) {
    coopSystem?.combatSfx?.setAmbienceState?.('lobby');
  } else if (step === FLOW_STEPS.IN_GAME) {
    coopSystem?.combatSfx?.setAmbienceState?.('valley');
  } else {
    coopSystem?.combatSfx?.setAmbienceState?.('title');
  }
}

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  const veilEl =
    typeof document !== 'undefined' ? document.getElementById('af-pixel-veil') : null;
  const veilT = typeof window !== 'undefined' ? (window.__BOOT_VEIL_T__ ?? 1) : 1;
  const inOpeningVeil =
    Boolean(veilEl && !veilEl.classList.contains('is-resolved')) &&
    (!appFlow || appFlow.getStep?.() === FLOW_STEPS.TITLE) &&
    !activeGameplayShotSpec &&
    typeof window.__FIXED_DT__ !== 'number' &&
    !window.__SKIP_BOOT_SPLASH__;

  // While Beat 1 (writing Amarante, 0..0.45) and Beat 2 (glide up + Sun-Clock bloom, 0.45..0.56)
  // are still on solid pitch-black (#050507), keep background 3D rendering & game audio 100% silent.
  if (inOpeningVeil && veilT < 0.56) {
    return;
  }
  if (bootAudioGated && (!inOpeningVeil || veilT >= 0.58)) {
    releaseBootAudioGateIfReady();
  }
  const timeScale =
    typeof window.__TIME_SCALE__ === 'number' && window.__TIME_SCALE__ > 0
      ? window.__TIME_SCALE__
      : 1.0;
  const dt =
    typeof window.__FIXED_DT__ === 'number' && window.__FIXED_DT__ > 0
      ? window.__FIXED_DT__
      : Math.min(rawDt, 0.05) * timeScale;
  elapsed += dt;
  frames++;
  telemetryTimer += dt;

  if (lmbHoldPending && pointerDragging) {
    lmbHoldSimElapsed += dt;
    const holdThresholdSec = coopSystem?.player?.activeHeroId === 'Mage' ? 0.14 : 0.28;
    if (lmbHoldSimElapsed >= holdThresholdSec) {
      firePendingLmbHoldUpgrade();
    }
  }

  if (autoCycleTod) {
    applyTimeOfDay((currentTodT + dt * 0.025) % 1.0);
  }

  communeClient?.update(dt, { x: player.x, y: player.y, z: player.z });

  const animCommuneSnap = communeClient?.getState?.();
  if (
    animCommuneSnap?.state === 'idle' &&
    !animCommuneSnap.partnerCommuning &&
    (coopSystem?.communeChannel?.localInitiated ||
      !coopSystem?.coopClient?.getState?.()?.peerConnected) &&
    (coopSystem?.campaignLoop?.communeChannelActive || coopSystem?.communeChannel?.active) &&
    !coopSystem?.campaignLoop?.verdictSequence?.active
  ) {
    coopSystem.cancelCommuneChannel({ broadcast: false });
  }

  if (camState.mode === 'player') {
    if (isUiOverlayBlockingInput() && keys.size > 0) {
      keys.clear();
    }
    const activeJoy =
      sculptedHud?.joyState?.magnitude > 0.05 ? sculptedHud.joyState : touchHud.joyState;
    const isOrbiting = Boolean(sculptedHud?.isOrbitDragging || touchHud.isOrbitDragging);
    if (isOrbiting) {
      camState.orbitCooldown = 0.75;
    } else if ((camState.orbitCooldown || 0) > 0) {
      camState.orbitCooldown = Math.max(0, camState.orbitCooldown - dt);
    }

    if (
      activeJoy.magnitude > 0.12 &&
      !isOrbiting &&
      (camState.orbitCooldown || 0) <= 0 &&
      !coopSystem?.campaignLoop?.isControlLocked?.()
    ) {
      camState.yaw += shortestAngleDiff(player.yaw, camState.yaw) * Math.min(1, 1.6 * dt);
    }

    coopSystem.update(dt, {
      keys,
      joyState: activeJoy,
      camYaw: camState.yaw,
      camPitch: camState.pitch,
      camera,
    });

    updateSacredStoneGaze(dt);
    if (
      !stoneGazeState.inspectActive &&
      !coopSystem?.campaignLoop?.communeChannelActive &&
      !coopSystem?.campaignLoop?.verdictSequence?.active
    ) {
      const isPaused = Boolean(sculptedHud?.isPauseModalOpen?.());
      if (isPaused) {
        coopSystem?.combatSfx?.setAmbienceState?.('pause');
      } else {
        const nearbyEnemies =
          coopSystem?.campaignLoop?.getNearbyLivingEnemies?.(player, 24.0)?.length || 0;
        coopSystem?.combatSfx?.setAmbienceState?.(nearbyEnemies > 0 ? 'combat' : 'valley');
      }
    }
  } else {
    stoneGazeState.activeStoneId = null;
    stoneGazeState.shoulderBlend = 0;
    if (appFlow && appFlow.getStep() === FLOW_STEPS.FLOWER_LOBBY) {
      coopSystem?.combatSfx?.setAmbienceState?.('lobby');
      coopSystem.knight?.update(dt);
      coopSystem.mage?.update(dt);
    } else if (appFlow && appFlow.getStep() === FLOW_STEPS.TITLE) {
      coopSystem?.combatSfx?.setAmbienceState?.('title');
    } else if (
      coopSystem?.vfxKit &&
      !coopSystem.enemyManager?.frozenShotId &&
      !activeGameplayShotSpec
    ) {
      coopSystem.vfxKit.update(dt);
    }
  }

  syncPrayerEclipseAndMonochrome(dt);

  const windScale = sky.getWindTimeScale ? sky.getWindTimeScale() : 1.0;
  windElapsed += dt * windScale;

  updateCamera();
  terrainKit.update(
    dt,
    windElapsed,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint,
    camera,
    activeProfile
  );
  village.update(dt);
  if (appFlow && appFlow.getStep?.() === FLOW_STEPS.FLOWER_LOBBY) {
    updateFlowerLobbyHeroProjections();
  }
  damageNumbers?.update(dt, camera);
  updateMeadowFocus(windElapsed);
  sky.update(windElapsed);

  const sampleDrawsThisFrame = telemetryTimer >= 0.5;
  if (sampleDrawsThisFrame) {
    renderer.info.autoReset = false;
    renderer.info.reset();
  }
  post.render(dt);

  if (sampleDrawsThisFrame) {
    const postDraws = post.bloomPass?.enabled ? 11 : 1;
    const postTris = postDraws * 2;
    const sceneDraws = Math.max(1, renderer.info.render.calls - postDraws);
    const sceneTris = Math.max(0, renderer.info.render.triangles - postTris);
    lastSampledSceneDraws = sceneDraws;
    lastSampledSceneTris = sceneTris;
    renderer.info.autoReset = true;
    measuredFps = Math.min(144, Math.round(frames / telemetryTimer));
    frames = 0;
    telemetryTimer = 0;
    refreshTelemetryReadout(sceneDraws);
  }

  const frameWallMs = rawDt * 1000;
  if (frameWallMs > 0 && frameWallMs < 1000) {
    mobileFrameMsHistory.push(frameWallMs);
    if (mobileFrameMsHistory.length > 240) {
      mobileFrameMsHistory.shift();
    }
  }
  mobileTelemetryTimer += rawDt;
  if (
    mobileTelemetryTimer >= 2.5 &&
    ((activeProfile === 'tablet' && !navigator.webdriver) ||
      (typeof window !== 'undefined' && window.__ENABLE_MOBILE_TELEMETRY__))
  ) {
    mobileTelemetryTimer = 0;
    const samples =
      mobileFrameMsHistory.length > 0
        ? [...mobileFrameMsHistory].sort((a, b) => a - b)
        : [avgFrameMs];
    mobileFrameMsHistory.length = 0;
    const sumMs = samples.reduce((acc, v) => acc + v, 0);
    const avgMs = Number((sumMs / samples.length).toFixed(2));
    const p95Idx = Math.min(samples.length - 1, Math.floor(samples.length * 0.95));
    const p95FrameMs = Number(samples[p95Idx].toFixed(2));
    const maxFrameMs = Number(samples[samples.length - 1].toFixed(2));
    const maliRep = getMaliG68Report();
    const payload = {
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      dpr: renderer.getPixelRatio(),
      fps: measuredFps,
      avgFrameMs: avgMs,
      p95FrameMs,
      maxFrameMs,
      draws: lastSampledSceneDraws || maliRep?.totalDrawCalls || 0,
      triangles: lastSampledSceneTris || maliRep?.totalTrianglesSubmitted || 0,
      maliPredictedMs: maliRep?.predictedFrameMs ?? null,
    };
    fetch('/api/mobile-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
}

function prewarmGpuProcessOffMainThread() {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof Blob === 'undefined') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    let worker = null;
    let blobUrl = null;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        worker?.terminate();
      } catch {
        // ignore
      }
      try {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      } catch {
        // ignore
      }
      resolve();
    };
    const timer = setTimeout(finish, 900);
    try {
      const code =
        'self.onmessage=()=>{try{const oc=new OffscreenCanvas(1,1);oc.getContext("webgl2")||oc.getContext("webgl");}catch(e){}self.postMessage(1);};';
      blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      worker = new Worker(blobUrl);
      worker.onmessage = () => {
        clearTimeout(timer);
        finish();
      };
      worker.onerror = () => {
        clearTimeout(timer);
        finish();
      };
      worker.postMessage(1);
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

async function bootWorldAsync() {
  bootSlicer.reset();
  await bootSlicer.maybeYield();

  // Kick off module imports in parallel so browser fetches/revalidates module graph concurrently
  // while the main thread builds each stage within the 60 FPS frame slice budget.
  const geoModPromise = import('../assets/terrain/geography.js');
  const verdictSkyModPromise = import('./verdict-sky-choreo.js');
  const combatBalModPromise = import('./combat/combat-balance.js');
  const gltfModPromise = import('three/addons/loaders/GLTFLoader.js');
  const skyModPromise = import('./sky-tod.js');
  const terrainModPromise = import('../assets/terrain/index.js');
  const housesModPromise = import('../assets/houses/index.js');
  const flowersModPromise = import('../assets/flowers/index.js');
  const postModPromise = import('./post.js');
  const pcModPromise = import('./player-controller.js');
  const dmgModPromise = import('./ui/damage-numbers.js');
  const communeModPromise = import('./combat/commune-client.js');
  const sculptedHudModPromise = import('./ui/sculpted-hud.js');
  const touchHudModPromise = import('./touch-hud.js');
  const maliModPromise = import('./perf/mali-g68-emulator.js').catch(() => null);

  // 0A. Lazy-load Geography, Verdict Sky & Combat Balance data slices without synchronous module-eval spikes
  const geoMod = await geoModPromise;
  PLAY_BOUNDARY_RADIUS = geoMod.PLAY_BOUNDARY_RADIUS;
  INNER_EXTENT = geoMod.INNER_EXTENT;
  ZONES = geoMod.ZONES;
  BUILDINGS = geoMod.BUILDINGS;
  INSCRIPTION_STONES = geoMod.INSCRIPTION_STONES;
  walkableHeightAt = geoMod.walkableHeightAt;
  terrainHeightAt = geoMod.terrainHeightAt;
  sampleWorld = geoMod.sampleWorld;
  await bootSlicer.maybeYield();

  // Start Sacred Stone GLB downloads early in parallel with procedural geometry construction
  const gltfMod = await gltfModPromise;
  await bootSlicer.maybeYield();
  stoneDecals = createSacredStoneCalligraphyDecals(
    scene,
    terrainHeightAt,
    gltfMod.GLTFLoader,
    bootSlicer
  );
  await bootSlicer.maybeYield();

  const verdictSkyMod = await verdictSkyModPromise;
  evalVerdictSky = verdictSkyMod.evalVerdictSky;
  evalChannelSky = verdictSkyMod.evalChannelSky;
  evalChannelReleaseSky = verdictSkyMod.evalChannelReleaseSky;
  evalSmiteSky = verdictSkyMod.evalSmiteSky;
  evalBlessingSky = verdictSkyMod.evalBlessingSky;
  idleVerdictSky = verdictSkyMod.idleVerdictSky;
  VERDICT_SKY_TAILS = verdictSkyMod.VERDICT_SKY_TAILS;
  verdictSkyClock.out = idleVerdictSky();
  await bootSlicer.maybeYield();

  const combatBalMod = await combatBalModPromise;
  SPELL_BY_SLOT = combatBalMod.SPELL_BY_SLOT;
  await bootSlicer.maybeYield();

  // 0B. WebGLRenderer (deferred out of static module evaluation so #haru-boot-splash animates uninterrupted)
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(PROFILES[activeProfile].dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Keep linear HDR into EffectComposer; post.js performs the single unified filmic view transform
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = false;
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.14, 0.22);
  await bootSlicer.maybeYield();

  // 1. Time-of-Day Sky (Stylized Sun, Moon, Stars & Cumulus Clouds)
  const skyMod = await skyModPromise;
  await bootSlicer.maybeYield();
  sky = await skyMod.createTimeOfDaySkyAsync({
    quality: 'high',
    camera,
    yieldFrame: bootSlicer.yieldFrame,
    sliceBudgetMs: bootSlicer.sliceBudgetMs,
  });
  scene.add(sky.group);
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.22, 0.34);
  await bootSlicer.maybeYield();

  // 2. Terrain, Water, Landmarks & Botanical Trees
  const terrainMod = await terrainModPromise;
  await bootSlicer.maybeYield();
  treeShadowData = terrainMod.buildTreeShadowUniformArray();
  await bootSlicer.maybeYield();
  terrainKit = await terrainMod.createTerrainAndLandmarksAsync(renderer, {
    includeBuildings: false,
    includeHorizonClouds: false,
    yieldFrame: bootSlicer.yieldFrame,
    sliceBudgetMs: bootSlicer.sliceBudgetMs,
  });
  scene.add(terrainKit.group);
  terrainKit.landmarksGroup?.traverse?.((obj) => {
    if (obj.isMesh && obj.name.endsWith('-emissive') && obj.material) {
      landmarkEmissiveMats.push(obj.material);
    }
  });
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.34, 0.46);
  await bootSlicer.maybeYield();

  // 3. Tudor Village Houses Kit (5 Detailed Buildings + Colliders)
  const housesMod = await housesModPromise;
  await bootSlicer.maybeYield();
  setHouseCutoutPlayerPos = housesMod.setHouseCutoutPlayerPos || (() => {});
  housesKit =
    typeof housesMod.createHousesKitAsync === 'function'
      ? await housesMod.createHousesKitAsync(renderer, {
          yieldFrame: bootSlicer.yieldFrame,
          sliceBudgetMs: bootSlicer.sliceBudgetMs,
        })
      : housesMod.createHousesKit(renderer);
  await bootSlicer.maybeYield();
  village = await housesKit.buildAllVillageBuildingsAsync(BUILDINGS, {
    yieldFrame: bootSlicer.yieldFrame,
    sliceBudgetMs: bootSlicer.sliceBudgetMs,
  });
  scene.add(village.group);
  for (const c of village.colliders) {
    terrainKit.colliders.push({
      ...c,
      hx: c.hx ?? c.halfW,
      hz: c.hz ?? c.halfD,
    });
  }
  await bootSlicer.maybeYield();

  // 3B. Lossless geometry indexing + profile mesh/LOD binding
  await syncStaticSceneProfileAsync(activeProfile, bootSlicer);
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.45, 0.52);
  await bootSlicer.maybeYield();

  // 4. Toroidal Gouache Meadow & Wildflower Drifts
  flowersMod = await flowersModPromise;
  await bootSlicer.maybeYield();
  await buildMeadowForProfileAsync(activeProfile, bootSlicer);
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.52, 0.62);
  await bootSlicer.maybeYield();

  // 6. HDR Post-Processing Composer
  const postMod = await postModPromise;
  await bootSlicer.maybeYield();
  post = postMod.createWorldPost({
    renderer,
    scene,
    camera,
    width: window.innerWidth,
    height: window.innerHeight,
    enabled: true,
    aaSamples: PROFILES[activeProfile].aaSamples,
  });
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.58, 0.78);
  await bootSlicer.maybeYield();

  // 7. Co-Op Heroes (Knight + Mage), Weapons, VFX & Campaign Loop
  const pcMod = await pcModPromise;
  await bootSlicer.maybeYield();
  STAGE5_GAMEPLAY_SHOTS = pcMod.STAGE5_GAMEPLAY_SHOTS;
  coopSystem = await pcMod.createCoopPlayerSystem({
    scene,
    walkableHeightAt,
    resolveCollisions,
    arenaZone: ZONES.arena,
    initialPos: { x: 2.8, z: 14.5, yaw: Math.PI + 0.15 },
    initialProfile: activeProfile,
    onHeroSwapped: (newHeroId) => {
      if (hudHeroName) {
        hudHeroName.textContent = newHeroId;
      }
      if (knightBarRow) knightBarRow.classList.toggle('is-leader', newHeroId === 'Knight');
      if (mageBarRow) mageBarRow.classList.toggle('is-leader', newHeroId === 'Mage');
      sculptedHud?.setActiveRole(newHeroId);
    },
    onSkyTodChanged: (nextTod) => {
      applyTimeOfDay(nextTod);
    },
    onHudStateChanged: (snapshot) => {
      updateCombatHud(snapshot);
    },
    onBanner: (bannerObj) => {
      showCombatBanner(bannerObj, 4200);
    },
    onCoopStateChanged: (roomState) => {
      updateCoopPill(roomState);
    },
    onRemoteCommuneVerdict: async (judgment) => {
      const vp = playDivineVerdictVoice(judgment);
      if (vp?.played && !vp?.simulatedHeadless && vp?.finished) {
        coopSystem?.setCommuneSuspense?.(true, { broadcast: false });
        const quote = judgment?.divine_quote || judgment?.subtitle || '';
        if (quote) {
          showCombatBanner(
            {
              title: 'THE SOVEREIGN · GOD OF LOVE',
              subtitle: quote,
              kind:
                String(judgment?.verdict || '').toLowerCase() === 'smite' ||
                String(judgment?.prayerMode || '').toLowerCase() === 'smite'
                  ? 'warning'
                  : 'blessing',
            },
            8000
          );
        }
        await vp.finished;
      }
      const updatedProg = coopSystem.coopClient.progression.applyVerdictProgression(judgment);
      sculptedHud?.setProgressionState(updatedProg);
      const pMode = String(judgment?.prayerMode || '').toLowerCase();
      const negRemote =
        Number(judgment?.hpDeltaPct) < 0 || Number(judgment?.hpDelta) < 0;
      if (
        !negRemote &&
        (pMode === 'field_heal' || pMode === 'divine_miracle' || pMode === 'awakening')
      ) {
        sculptedHud?.triggerHealPulse?.({
          role: 'both',
          amount: Number(judgment?.hpDelta || 0),
        });
      }
    },
    yieldFrame: bootSlicer.yieldFrame,
    sliceBudgetMs: bootSlicer.sliceBudgetMs,
  });
  player = coopSystem.player;
  // Gate background game audio while the opening black veil is still writing 'Amarante'
  if (
    typeof window !== 'undefined' &&
    !window.__SKIP_BOOT_SPLASH__ &&
    (!appFlow || appFlow.getStep?.() === FLOW_STEPS.TITLE) &&
    (window.__BOOT_VEIL_T__ ?? 0) < 0.58
  ) {
    bootAudioGated = true;
    coopSystem?.combatSfx?.setMasterVolume?.(0);
    coopSystem?.combatSfx?.setAmbienceState?.('title');
  }
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.80, 0.88);
  await bootSlicer.maybeYield();

  // 8. Wire Damage Numbers, Commune Client, Sculpted HUD, Touch HUD & Mali Emulator
  const dmgMod = await dmgModPromise;
  await bootSlicer.maybeYield();
  initDamageNumbersSystem(dmgMod);
  await bootSlicer.maybeYield();

  const communeMod = await communeModPromise;
  await bootSlicer.maybeYield();
  playWideSurroundDivineVoice = communeMod.playWideSurroundDivineVoice || (() => null);
  initCommuneClientSystem(communeMod.createCommuneClient);
  await bootSlicer.maybeYield();

  const sculptedHudMod = await sculptedHudModPromise;
  await bootSlicer.maybeYield();
  initSculptedHudSystem(sculptedHudMod.createSculptedHud);
  await bootSlicer.maybeYield();

  const touchHudMod = await touchHudModPromise;
  await bootSlicer.maybeYield();
  initTouchHudAndButtons(touchHudMod.createTouchHud);
  await bootSlicer.maybeYield();

  try {
    const maliMod = await maliModPromise;
    evaluateMaliG68Frame = maliMod?.evaluateMaliG68Frame || maliMod?.default || null;
  } catch {
    evaluateMaliG68Frame = null;
  }
  await bootSlicer.maybeYield();

  initStoneInspectionUi();
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.86, 0.92);
  await bootSlicer.maybeYield();

  // 9. Wait for Sacred Stone monument GLBs before prewarming & Frame 0 render
  await stoneDecals.readyPromise;
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.91, 0.96);
  await bootSlicer.maybeYield();

  applyTimeOfDay('day');
  if (appFlow && appFlow.getStep() !== FLOW_STEPS.IN_GAME) {
    applyOpeningFlowCameraAndPoses(appFlow.getStep());
  } else {
    setView('plaza', { skipRender: true });
  }
  syncProfileButtons();
  await bootSlicer.maybeYield();

  // 10. Prewarm textures + visible & pooled shader programs in parallel batch
  await prewarmAllVfxAndSceneShadersAsync();
  await bootSlicer.maybeYield();

  // Render initial Frame 0 cleanly before marking visual ready for veil dissolve
  syncPrayerEclipseAndMonochrome(0);
  updateCamera();
  syncCharacterGroundShadows();
  await bootSlicer.maybeYield();

  terrainKit.update(
    0.016,
    windElapsed,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint,
    camera,
    activeProfile
  );
  village.update(0.016);
  updateMeadowFocus(windElapsed);
  sky.update(windElapsed);
  await bootSlicer.maybeYield();

  renderer.info.autoReset = false;
  renderer.info.reset();
  post.render(0.016);
  const f0PostDraws = post.bloomPass?.enabled ? 11 : 1;
  const f0Draws = Math.max(1, renderer.info.render.calls - f0PostDraws);
  const f0Tris = Math.max(0, renderer.info.render.triangles - f0PostDraws * 2);
  lastSampledSceneDraws = f0Draws;
  lastSampledSceneTris = f0Tris;
  renderer.info.autoReset = true;
  refreshTelemetryReadout(f0Draws);

  if (typeof window !== 'undefined') {
    window.__setBootProgress?.(1.0, 1.0);
    window.__WORLD_VISUAL_READY__ = true;
  }

  clock.start();
  requestAnimationFrame(animate);

  if (typeof window !== 'undefined') {
    window.__WORLD_READY__ = true;
    window.__WORLD__ = {
      ready: true,
      scene,
      camera,
      renderer,
      sky,
      post,
      terrainKit,
      housesKit,
      village,
      meadow,
      coopSystem,
      vfxKit: coopSystem.vfxKit,
      frostLance: coopSystem.frostLance,
      enemyManager: coopSystem.enemyManager,
      campaignLoop: coopSystem.campaignLoop,
      coopClient: coopSystem.coopClient,
      progression: coopSystem.coopClient.progression,
      communeClient,
      sculptedHud,
      appFlow,
      get activeProfile() {
        return activeProfile;
      },
      get devStageOverride() {
        return devStageOverride;
      },
      touchHud,
      damageNumbers,
      stoneGazeState,
      stoneDecals,
      isUiOverlayBlockingInput,
      tryRaycastFlowerLobbyHero,
      player,
      camState,
      VIEWS,
      WORLD_SHOTS,
      STAGE5_GAMEPLAY_SHOTS,
      openAltarSteleModal,
      closeAltarSteleModal,
      enterStoneInspection,
      exitStoneInspection,
      startCommuneHold,
      finishCommuneHold,
      setView,
      setCameraOrbit,
      setShot,
      setGameplayShot,
      setVerdictSkyPreview,
      setTimeOfDay: applyTimeOfDay,
      setProfile,
      toggleHud,
      measurePerformance,
      getStats: getSceneStats,
      getMaliG68Report,
    };
  }
}

async function startMainBootAsync() {
  bootSlicer.reset();
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.08, 0.16);
  const gpuWarmupPromise = prewarmGpuProcessOffMainThread();
  if (typeof window !== 'undefined') {
    window.__GPU_WARMUP_PROMISE__ = gpuWarmupPromise;
  }
  await bootSlicer.maybeYield();

  if (!UNSPOILED_SACRED_POEM_BY_STONE_ID) {
    const poemsMod = await import('./ui/sacred-poems-unspoiled.js');
    UNSPOILED_SACRED_POEM_BY_STONE_ID = poemsMod.UNSPOILED_SACRED_POEM_BY_STONE_ID;
    await bootSlicer.maybeYield();
  }

  const appFlowMod = await import('./ui/app-flow.js');
  createAppFlow = appFlowMod.createAppFlow;
  FLOW_STEPS = appFlowMod.FLOW_STEPS;
  getOpeningCameraPose = appFlowMod.getOpeningCameraPose;
  await bootSlicer.maybeYield();

  mountOpeningAppFlowEarly();
  if (typeof window !== 'undefined') window.__setBootProgress?.(0.11, 0.20);
  await bootSlicer.maybeYield();

  await gpuWarmupPromise;
  await bootWorldAsync();
}

await startMainBootAsync();
