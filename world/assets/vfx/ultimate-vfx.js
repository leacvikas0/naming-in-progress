// ============================================================================
// world/assets/vfx/ultimate-vfx.js
//
// Stage 4 & 5 High-Craft 3D Ukiyo-e Twin-Element Dragon System
// (*Hinokami Sun-Dragon* & *Glacial Tide Dragon*)
//
// Visual & Engineering Contract:
// - Strictly <= 6 draw calls when active, 0 draw calls when idle:
//     1-2. `dragonHeads[0..1]` (2 Meshes): Sculpted, chiseled 3D Eastern Dragon
//          (*Ryu*) heads (~620 triangles each, local +Z forward, +Y up, +X right)
//          with tapered snout & flared nasal crest (`aPartId = 0`), articulated
//          -30° open lower jaw (`aPartId = 1`), glowing inner elemental throat
//          (`aPartId = 2`), 8 sharp upper/lower fangs (`aPartId = 3`), twin 1.20m
//          swept-back stag/dragon antler horns (`aPartId = 4`), 8 flowing Ukiyo-e
//          flame/wave mane ruff fins (`aPartId = 5`), and blazing slit dragon
//          eyes (`aPartId = 6`).
//     3-4. `dragonBodies[0..1]` (2 Dynamic BufferGeometry Meshes): 56 spine rings
//          x 10 radial tube vertices + 56 x 2 tall (0.45m) Dorsal Flame/Wave Mane
//          Fin ribbon vertices, updated every active frame along a 3D spline
//          trajectory P(s) from head (u = 0, locked to neck base) to calligraphic
//          brush tail (u = 1) with traveling sinusoidal S-wave undulation.
//     5.   `sparkMesh` (1 InstancedMesh, 48 chiseled crystal/ember shards):
//          Swirls along the dragons' wake and bursts 36 shards outward on cross-bite.
//     6.   `petalMesh` (1 InstancedMesh, 48 sacred lotus/rose petals):
//          Used for `spawnCouplesBloom` / `playCouplesUltimate`.
// - All materials use `transparent: false, depthWrite: true`, hard `discard < 0.45`
//   cutouts, and Ukiyo-e woodblock cel shading with sumi-ink borders.
// ============================================================================

import * as THREE from 'three';
import { getSharedNoiseAtlas } from './noise-atlas.js';
import { createGlacierCrystalGeometry } from './frost-lance.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

function smoothstep(a, b, x) {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function outQuint(t) {
  const u = 1 - saturate(t);
  return 1 - u * u * u * u * u;
}

function hash11(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export const ULTIMATE_PALETTES = Object.freeze({
  rime: {
    idx: 0,
    id: 'rime',
    label: 'Glacial Tide Dragon',
    core: '#f0fcff',
    body: '#56b8f5',
    deep: '#1b5694',
    ink: '#0d2c4d',
  },
  solar: {
    idx: 1,
    id: 'solar',
    label: 'Hinokami Sun-Dragon',
    core: '#fff3a1',
    body: '#ff7b14',
    deep: '#b91c1c',
    ink: '#210d06',
  },
  tempest: {
    idx: 2,
    id: 'tempest',
    label: 'Thunderclap Dragon',
    core: '#fff6cc',
    body: '#b38cf5',
    deep: '#4c1d95',
    ink: '#110720',
  },
  couples: {
    idx: 3,
    id: 'couples',
    label: 'Sacred Union',
    core: '#fff8e6',
    body: '#f2c14e',
    deep: '#c0163a',
    ink: '#1c0a12',
  },
  eclipse: {
    idx: 4,
    id: 'eclipse',
    label: 'Twin-Element Eclipse',
    core: '#fff3a1',
    body: '#ff7b14',
    deep: '#b91c1c',
    ink: '#210d06',
  },
  ivory: {
    idx: 5,
    id: 'ivory',
    label: 'Sacred Lotus Ivory',
    core: '#ffffff',
    body: '#ffe3a0',
    deep: '#c8961a',
    ink: '#24170a',
  },
  rose: {
    idx: 6,
    id: 'rose',
    label: 'Crimson Rose',
    core: '#fff1f2',
    body: '#ff4d6d',
    deep: '#9f1239',
    ink: '#1f0710',
  },
});

const PAL_KEYS = ['rime', 'solar', 'tempest', 'couples', 'eclipse', 'ivory', 'rose'];

function normalizeDragonStyle(style) {
  const s = String(style || '').toLowerCase();
  if (s === 'rime' || s === 'ice' || s === 'frost' || s === 'glacial') return 'rime';
  if (s === 'solar' || s === 'fire' || s === 'sunfire' || s === 'hinokami') return 'solar';
  if (s === 'eclipse' || s === 'dual' || s === 'sun_and_tide' || s === 'blessed') return 'eclipse';
  if (s === 'tempest' || s === 'storm' || s === 'wisteria') return 'solar';
  return 'eclipse';
}

function palIndex(style) {
  const s = String(style || '').toLowerCase();
  if (ULTIMATE_PALETTES[s]) return ULTIMATE_PALETTES[s].idx;
  if (s === 'fire' || s === 'sunfire' || s === 'hinokami') return 1;
  if (s === 'ice' || s === 'frost' || s === 'glacial') return 0;
  return 1;
}

/* ------------------------------------------------------------------------- */
/* 1. Sculpted Eastern Dragon (*Ryu*) Head & Dynamic Body Geometries         */
/* ------------------------------------------------------------------------- */

/**
 * Builds a chiseled, faceted 3D Eastern Dragon (*Ryu*) head (~610 triangles):
 * - Local `+Z` forward (snout tip at z = +0.95m), `+Y` dorsal up, `+X` right.
 * - Attributes: `position`, `normal`, `uv`, `aPartId`, `aEdgeFactor`:
 *     - `aPartId = 0`: Tapered Dragon Snout, Flared Nasal Crest, Chiseled Cheek Flares & Fierce Brow Ridges
 *     - `aPartId = 1`: Articulated Open Lower Jaw (pitched -30° downward)
 *     - `aPartId = 2`: Glowing Inner Elemental Throat & Tongue
 *     - `aPartId = 3`: 8 Sharp Upper & Lower Fangs
 *     - `aPartId = 4`: Twin Swept-Back Stag/Dragon Antler Horns (1.20m S-curve with branching tines)
 *     - `aPartId = 5`: Flowing Ukiyo-e Flame/Wave Mane Ruff (8 serrated fins ringing back of head)
 *     - `aPartId = 6`: Blazing Slit Dragon Eyes (z = +0.32m, x = ±0.22m, y = +0.18m)
 */
export function createEasternDragonHeadGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const partIds = [];
  const edgeFactors = [];

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  function pushTri(ax, ay, az, bx, by, bz, cx, cy, cz, partId, eA = 0.2, eB = 0.2, eC = 0.2, uvA = [0, 0], uvB = [0.5, 0.5], uvC = [1, 1]) {
    vA.set(ax, ay, az);
    vB.set(bx, by, bz);
    vC.set(cx, cy, cz);
    cb.subVectors(vC, vB);
    ab.subVectors(vA, vB);
    cb.cross(ab);
    if (cb.lengthSq() > 1e-10) cb.normalize();
    else cb.set(0, 1, 0);

    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    normals.push(cb.x, cb.y, cb.z, cb.x, cb.y, cb.z, cb.x, cb.y, cb.z);
    uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
    partIds.push(partId, partId, partId);
    edgeFactors.push(eA, eB, eC);
  }

  function pushQuad(a, b, c, d, partId, eA = 0.2, eB = 0.2, eC = 0.2, eD = 0.2, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    pushTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], partId, eA, eB, eC, [u0, v0], [u1, v0], [u1, v1]);
    pushTri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], partId, eA, eC, eD, [u0, v0], [u1, v1], [u0, v1]);
  }

  // -------------------------------------------------------------------------
  // Part 0: Tapered Upper Skull, Snout, Flared Nasal Crest & Cheek Flares
  // 8 stations along Z from occiput (-0.18m) to snout tip (+0.95m), 10 profile pts
  // -------------------------------------------------------------------------
  const skullStations = [
    { z: -0.18, w: 0.27, hTop: 0.25, hBot: -0.04, cheekFlare: 0.04, nasalCrest: 0.0 },
    { z: 0.02, w: 0.34, hTop: 0.30, hBot: -0.03, cheekFlare: 0.14, nasalCrest: 0.02 },
    { z: 0.22, w: 0.31, hTop: 0.32, hBot: -0.02, cheekFlare: 0.10, nasalCrest: 0.04 },
    { z: 0.42, w: 0.24, hTop: 0.25, hBot: -0.01, cheekFlare: 0.03, nasalCrest: 0.06 },
    { z: 0.60, w: 0.21, hTop: 0.22, hBot: 0.00, cheekFlare: 0.02, nasalCrest: 0.07 },
    { z: 0.76, w: 0.23, hTop: 0.26, hBot: 0.01, cheekFlare: 0.05, nasalCrest: 0.13 },
    { z: 0.88, w: 0.18, hTop: 0.28, hBot: 0.03, cheekFlare: 0.03, nasalCrest: 0.16 },
    { z: 0.95, w: 0.10, hTop: 0.21, hBot: 0.05, cheekFlare: 0.00, nasalCrest: 0.08 },
  ];

  const SKULL_COLS = 12;
  const skullRings = [];
  for (let s = 0; s < skullStations.length; s++) {
    const st = skullStations[s];
    const v = s / (skullStations.length - 1);
    const ring = [];
    for (let c = 0; c < SKULL_COLS; c++) {
      const u = c / SKULL_COLS;
      const ang = u * TAU; // 0 = top dorsal ridge, PI = ventral palate
      const sinA = Math.sin(ang);
      const cosA = Math.cos(ang);
      // Chiseled faceted profile: sharp dorsal crest (cosA > 0.7), flared cheek ridge (abs(sinA) > 0.7)
      let x = sinA * st.w;
      let y = cosA >= 0 ? lerp(0, st.hTop, Math.pow(cosA, 0.75)) : lerp(0, st.hBot, Math.pow(-cosA, 0.85));
      if (cosA > 0.82) {
        y += st.nasalCrest * (cosA - 0.82) / 0.18;
      }
      if (Math.abs(sinA) > 0.65 && cosA > -0.4 && cosA < 0.45) {
        x += Math.sign(sinA) * st.cheekFlare;
        y -= 0.02;
      }
      const edge = clamp(Math.abs(sinA) * 0.65 + Math.max(0, cosA) * 0.35, 0.1, 0.95);
      ring.push({ pos: [x, y, st.z], u, v, edge });
    }
    skullRings.push(ring);
  }

  for (let s = 0; s < skullRings.length - 1; s++) {
    const r0 = skullRings[s];
    const r1 = skullRings[s + 1];
    for (let c = 0; c < SKULL_COLS; c++) {
      const cn = (c + 1) % SKULL_COLS;
      pushQuad(
        r0[c].pos,
        r0[cn].pos,
        r1[cn].pos,
        r1[c].pos,
        0,
        r0[c].edge,
        r0[cn].edge,
        r1[cn].edge,
        r1[c].edge,
        r0[c].u,
        r0[c].v,
        r1[cn].u,
        r1[cn].v
      );
    }
  }

  // Close back of skull & front of snout
  const backCenter = [0, 0.10, -0.20];
  const snoutTipCenter = [0, 0.13, 0.97];
  const firstSkull = skullRings[0];
  const lastSkull = skullRings[skullRings.length - 1];
  for (let c = 0; c < SKULL_COLS; c++) {
    const cn = (c + 1) % SKULL_COLS;
    pushTri(
      backCenter[0], backCenter[1], backCenter[2],
      firstSkull[cn].pos[0], firstSkull[cn].pos[1], firstSkull[cn].pos[2],
      firstSkull[c].pos[0], firstSkull[c].pos[1], firstSkull[c].pos[2],
      0, 0.2, firstSkull[cn].edge, firstSkull[c].edge
    );
    pushTri(
      lastSkull[c].pos[0], lastSkull[c].pos[1], lastSkull[c].pos[2],
      lastSkull[cn].pos[0], lastSkull[cn].pos[1], lastSkull[cn].pos[2],
      snoutTipCenter[0], snoutTipCenter[1], snoutTipCenter[2],
      0, lastSkull[c].edge, lastSkull[cn].edge, 0.85
    );
  }

  // Fierce Angled Supraorbital Brow Ridges & Flared Whiskers (`aPartId = 0`)
  for (const side of [-1, 1]) {
    const b0 = [side * 0.14, 0.24, 0.46];
    const b1 = [side * 0.27, 0.28, 0.32];
    const b2 = [side * 0.34, 0.38, 0.08];
    const b3 = [side * 0.18, 0.31, 0.12];
    const bApex = [side * 0.29, 0.42, 0.22];
    pushTri(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], bApex[0], bApex[1], bApex[2], 0, 0.4, 0.85, 0.95);
    pushTri(b1[0], b1[1], b1[2], b2[0], b2[1], b2[2], bApex[0], bApex[1], bApex[2], 0, 0.85, 0.95, 0.95);
    pushTri(b2[0], b2[1], b2[2], b3[0], b3[1], b3[2], bApex[0], bApex[1], bApex[2], 0, 0.95, 0.5, 0.95);
    pushTri(b3[0], b3[1], b3[2], b0[0], b0[1], b0[2], bApex[0], bApex[1], bApex[2], 0, 0.5, 0.4, 0.95);

    // Swept-outward Ryu nasal whisker tendril
    const wBaseA = [side * 0.15, 0.10, 0.78];
    const wBaseB = [side * 0.15, 0.04, 0.72];
    const wMidA = [side * 0.36, 0.08, 0.54];
    const wMidB = [side * 0.34, 0.01, 0.48];
    const wTip = [side * 0.52, 0.06, 0.18];
    pushQuad(wBaseA, wBaseB, wMidB, wMidA, 0, 0.4, 0.4, 0.75, 0.75);
    pushQuad(wMidA, wMidB, wBaseB, wBaseA, 0, 0.75, 0.75, 0.4, 0.4);
    pushTri(wMidA[0], wMidA[1], wMidA[2], wMidB[0], wMidB[1], wMidB[2], wTip[0], wTip[1], wTip[2], 0, 0.75, 0.75, 1.0);
    pushTri(wMidB[0], wMidB[1], wMidB[2], wMidA[0], wMidA[1], wMidA[2], wTip[0], wTip[1], wTip[2], 0, 0.75, 0.75, 1.0);
  }

  // -------------------------------------------------------------------------
  // Part 1: Articulated Open Lower Jaw (pitched -30° open around z=0.04, y=-0.04)
  // -------------------------------------------------------------------------
  const jawPitch = 0.52; // ~30 degrees downward
  const cosJ = Math.cos(jawPitch);
  const sinJ = Math.sin(jawPitch);
  const toJawWorld = (lx, ly, lz) => {
    const dz = lz - 0.04;
    const dy = ly;
    return [
      lx,
      -0.04 + dy * cosJ - dz * sinJ,
      0.04 + dz * cosJ + dy * sinJ,
    ];
  };

  const jawStations = [
    { lz: 0.00, w: 0.24, hTop: 0.00, hBot: -0.11 },
    { lz: 0.22, w: 0.22, hTop: 0.00, hBot: -0.12 },
    { lz: 0.46, w: 0.18, hTop: 0.01, hBot: -0.11 },
    { lz: 0.68, w: 0.14, hTop: 0.02, hBot: -0.09 },
    { lz: 0.80, w: 0.08, hTop: 0.03, hBot: -0.07 },
  ];
  const JAW_COLS = 8;
  const jawRings = [];
  for (let s = 0; s < jawStations.length; s++) {
    const st = jawStations[s];
    const v = s / (jawStations.length - 1);
    const ring = [];
    for (let c = 0; c < JAW_COLS; c++) {
      const u = c / JAW_COLS;
      const ang = u * TAU;
      const sinA = Math.sin(ang);
      const cosA = Math.cos(ang);
      const lx = sinA * st.w;
      const ly = cosA >= 0 ? st.hTop * cosA : -st.hBot * cosA;
      const edge = clamp(Math.abs(sinA) * 0.7 + (cosA < 0 ? -cosA * 0.3 : 0.1), 0.15, 0.9);
      ring.push({ pos: toJawWorld(lx, ly, st.lz), u, v, edge });
    }
    jawRings.push(ring);
  }

  for (let s = 0; s < jawRings.length - 1; s++) {
    const r0 = jawRings[s];
    const r1 = jawRings[s + 1];
    for (let c = 0; c < JAW_COLS; c++) {
      const cn = (c + 1) % JAW_COLS;
      pushQuad(
        r0[c].pos,
        r0[cn].pos,
        r1[cn].pos,
        r1[c].pos,
        1,
        r0[c].edge,
        r0[cn].edge,
        r1[cn].edge,
        r1[c].edge,
        r0[c].u,
        r0[c].v,
        r1[cn].u,
        r1[cn].v
      );
    }
  }
  const jawTip = toJawWorld(0, -0.04, 0.88);
  const lastJaw = jawRings[jawRings.length - 1];
  for (let c = 0; c < JAW_COLS; c++) {
    const cn = (c + 1) % JAW_COLS;
    pushTri(
      lastJaw[c].pos[0], lastJaw[c].pos[1], lastJaw[c].pos[2],
      lastJaw[cn].pos[0], lastJaw[cn].pos[1], lastJaw[cn].pos[2],
      jawTip[0], jawTip[1], jawTip[2],
      1, lastJaw[c].edge, lastJaw[cn].edge, 0.95
    );
  }

  // -------------------------------------------------------------------------
  // Part 2: Glowing Inner Elemental Throat & Tongue (`aPartId = 2`)
  // -------------------------------------------------------------------------
  const t0L = [-0.15, 0.02, 0.10];
  const t0R = [0.15, 0.02, 0.10];
  const t1R = [0.14, -0.10, 0.12];
  const t1L = [-0.14, -0.10, 0.12];
  pushQuad(t0L, t0R, t1R, t1L, 2, 0.1, 0.1, 0.1, 0.1);

  // Flaming elemental tongue rising from the lower jaw floor
  const tgBaseL = toJawWorld(-0.09, 0.01, 0.14);
  const tgBaseR = toJawWorld(0.09, 0.01, 0.14);
  const tgMidL = toJawWorld(-0.07, 0.04, 0.44);
  const tgMidR = toJawWorld(0.07, 0.04, 0.44);
  const tgTipL = toJawWorld(-0.05, 0.07, 0.68);
  const tgTipR = toJawWorld(0.05, 0.07, 0.68);
  const tgCleft = toJawWorld(0.0, 0.05, 0.56);
  pushQuad(tgBaseL, tgBaseR, tgMidR, tgMidL, 2, 0.15, 0.15, 0.25, 0.25);
  pushTri(tgMidL[0], tgMidL[1], tgMidL[2], tgCleft[0], tgCleft[1], tgCleft[2], tgTipL[0], tgTipL[1], tgTipL[2], 2, 0.25, 0.4, 0.8);
  pushTri(tgCleft[0], tgCleft[1], tgCleft[2], tgMidR[0], tgMidR[1], tgMidR[2], tgTipR[0], tgTipR[1], tgTipR[2], 2, 0.4, 0.25, 0.8);

  // -------------------------------------------------------------------------
  // Part 3: 8 Sharp Upper & Lower Fangs (`aPartId = 3`)
  // -------------------------------------------------------------------------
  function addPyramidalFang(baseCenterPos, tipPos, radius) {
    const b0 = [baseCenterPos[0] - radius, baseCenterPos[1], baseCenterPos[2] - radius];
    const b1 = [baseCenterPos[0] + radius, baseCenterPos[1], baseCenterPos[2] - radius];
    const b2 = [baseCenterPos[0] + radius, baseCenterPos[1], baseCenterPos[2] + radius];
    const b3 = [baseCenterPos[0] - radius, baseCenterPos[1], baseCenterPos[2] + radius];
    pushTri(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], tipPos[0], tipPos[1], tipPos[2], 3, 0.2, 0.2, 0.9);
    pushTri(b1[0], b1[1], b1[2], b2[0], b2[1], b2[2], tipPos[0], tipPos[1], tipPos[2], 3, 0.2, 0.2, 0.9);
    pushTri(b2[0], b2[1], b2[2], b3[0], b3[1], b3[2], tipPos[0], tipPos[1], tipPos[2], 3, 0.2, 0.2, 0.9);
    pushTri(b3[0], b3[1], b3[2], b0[0], b0[1], b0[2], tipPos[0], tipPos[1], tipPos[2], 3, 0.2, 0.2, 0.9);
  }

  for (const side of [-1, 1]) {
    // Upper front canine + upper rear fang
    addPyramidalFang([side * 0.13, 0.02, 0.74], [side * 0.12, -0.15, 0.72], 0.032);
    addPyramidalFang([side * 0.17, 0.00, 0.46], [side * 0.16, -0.12, 0.44], 0.028);
    // Lower front canine + lower rear fang (attached to pitched lower jaw)
    addPyramidalFang(toJawWorld(side * 0.11, 0.02, 0.66), toJawWorld(side * 0.10, 0.17, 0.64), 0.028);
    addPyramidalFang(toJawWorld(side * 0.15, 0.01, 0.42), toJawWorld(side * 0.14, 0.13, 0.40), 0.024);
  }

  // -------------------------------------------------------------------------
  // Part 4: Twin Swept-Back Stag/Dragon Antler Horns (`aPartId = 4`)
  // Two 1.20m graceful S-curved horns (`z = +0.10 .. -1.05m`, `y = +0.25 .. +0.88m`)
  // with branching stag tines
  // -------------------------------------------------------------------------
  const HORN_SEGS = 9;
  const HORN_SIDES = 6;
  for (const side of [-1, 1]) {
    const hornRings = [];
    for (let i = 0; i <= HORN_SEGS; i++) {
      const t = i / HORN_SEGS;
      const hz = lerp(0.10, -1.05, t);
      const hy = lerp(0.25, 0.88, Math.pow(t, 0.82)) + Math.sin(t * Math.PI * 1.65) * 0.09;
      const hx = side * (lerp(0.13, 0.42, Math.pow(t, 0.75)) + Math.sin(t * Math.PI) * 0.06);
      const rad = lerp(0.068, 0.012, t);
      const ring = [];
      for (let k = 0; k < HORN_SIDES; k++) {
        const a = (k / HORN_SIDES) * TAU;
        ring.push([
          hx + Math.cos(a) * rad,
          hy + Math.sin(a) * rad,
          hz,
        ]);
      }
      hornRings.push({ ring, t, center: [hx, hy, hz] });
    }
    for (let i = 0; i < HORN_SEGS; i++) {
      const r0 = hornRings[i].ring;
      const r1 = hornRings[i + 1].ring;
      const e0 = lerp(0.25, 0.95, hornRings[i].t);
      const e1 = lerp(0.25, 0.95, hornRings[i + 1].t);
      for (let k = 0; k < HORN_SIDES; k++) {
        const kn = (k + 1) % HORN_SIDES;
        pushQuad(r0[k], r0[kn], r1[kn], r1[k], 4, e0, e0, e1, e1, k / HORN_SIDES, hornRings[i].t, (k + 1) / HORN_SIDES, hornRings[i + 1].t);
      }
    }
    // Branching stag tines at s = 2 and s = 4
    for (const [idx, tineLen, liftY, outX] of [
      [2, 0.34, 0.24, side * 0.14],
      [4, 0.28, 0.22, side * 0.12],
    ]) {
      const c = hornRings[idx].center;
      const r = 0.036;
      const tip = [c[0] + outX, c[1] + liftY, c[2] - tineLen];
      const b0 = [c[0] - r, c[1], c[2]];
      const b1 = [c[0] + r, c[1], c[2]];
      const b2 = [c[0], c[1] + r, c[2] - r];
      pushTri(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], tip[0], tip[1], tip[2], 4, 0.4, 0.4, 0.95);
      pushTri(b1[0], b1[1], b1[2], b2[0], b2[1], b2[2], tip[0], tip[1], tip[2], 4, 0.4, 0.4, 0.95);
      pushTri(b2[0], b2[1], b2[2], b0[0], b0[1], b0[2], tip[0], tip[1], tip[2], 4, 0.4, 0.4, 0.95);
    }
  }

  // -------------------------------------------------------------------------
  // Part 5: Flowing Ukiyo-e Flame/Wave Mane Ruff (`aPartId = 5`)
  // 8 swept-back serrated flame/wave fins ringing the back of the head & jaw
  // (`z = +0.05 .. -0.65m`)
  // -------------------------------------------------------------------------
  const MANE_FINS = 8;
  for (let i = 0; i < MANE_FINS; i++) {
    const frac = i / (MANE_FINS - 1);
    const ang = lerp(-Math.PI * 0.78, Math.PI * 0.78, frac); // wraps around crown & cheeks
    const sinA = Math.sin(ang);
    const cosA = Math.cos(ang);
    const bx = sinA * 0.26;
    const by = cosA * 0.22 + 0.06;
    const bz = 0.05 - Math.abs(sinA) * 0.08;

    const tx = -cosA * 0.07;
    const ty = sinA * 0.07;
    const midX = sinA * 0.42;
    const midY = cosA * 0.36 + 0.12;
    const midZ = -0.28;
    const tipX = sinA * 0.54;
    const tipY = cosA * 0.48 + 0.18;
    const tipZ = -0.65;

    const p0L = [bx - tx, by - ty, bz];
    const p0R = [bx + tx, by + ty, bz];
    const p1L = [midX - tx * 0.85, midY - ty * 0.85, midZ];
    const p1R = [midX + tx * 0.85, midY + ty * 0.85, midZ];
    const pTip = [tipX, tipY, tipZ];

    // Double-sided fin triangles so visible from all angles
    pushQuad(p0L, p0R, p1R, p1L, 5, 0.25, 0.25, 0.65, 0.65, 0, 0, 1, 0.55);
    pushQuad(p0R, p0L, p1L, p1R, 5, 0.25, 0.25, 0.65, 0.65, 0, 0, 1, 0.55);
    pushTri(p1L[0], p1L[1], p1L[2], p1R[0], p1R[1], p1R[2], pTip[0], pTip[1], pTip[2], 5, 0.65, 0.65, 1.0, [0, 0.55], [1, 0.55], [0.5, 1.0]);
    pushTri(p1R[0], p1R[1], p1R[2], p1L[0], p1L[1], p1L[2], pTip[0], pTip[1], pTip[2], 5, 0.65, 0.65, 1.0, [0, 0.55], [1, 0.55], [0.5, 1.0]);
  }

  // -------------------------------------------------------------------------
  // Part 6: Blazing Slit Dragon Eyes (`aPartId = 6`)
  // Two fierce angled eyes on the brow sides (`z = +0.32m, x = ±0.22m, y = +0.18m`)
  // -------------------------------------------------------------------------
  for (const side of [-1, 1]) {
    const ex = side * 0.235;
    const ey = 0.18;
    const ez = 0.32;
    const eFront = [ex - side * 0.02, ey - 0.025, ez + 0.095];
    const eBack = [ex + side * 0.02, ey + 0.045, ez - 0.095];
    const eTop = [ex + side * 0.015, ey + 0.055, ez + 0.01];
    const eBot = [ex + side * 0.015, ey - 0.035, ez - 0.01];
    const eApex = [ex + side * 0.042, ey + 0.01, ez];
    pushTri(eFront[0], eFront[1], eFront[2], eTop[0], eTop[1], eTop[2], eApex[0], eApex[1], eApex[2], 6, 0.1, 0.1, 0.0);
    pushTri(eTop[0], eTop[1], eTop[2], eBack[0], eBack[1], eBack[2], eApex[0], eApex[1], eApex[2], 6, 0.1, 0.1, 0.0);
    pushTri(eBack[0], eBack[1], eBack[2], eBot[0], eBot[1], eBot[2], eApex[0], eApex[1], eApex[2], 6, 0.1, 0.1, 0.0);
    pushTri(eBot[0], eBot[1], eBot[2], eFront[0], eFront[1], eFront[2], eApex[0], eApex[1], eApex[2], 6, 0.1, 0.1, 0.0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aPartId', new THREE.Float32BufferAttribute(partIds, 1));
  geometry.setAttribute('aEdgeFactor', new THREE.Float32BufferAttribute(edgeFactors, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const SPINE_RINGS = 56;
const TUBE_RADIAL = 10;
const FIN_VERTS_PER_RING = 4; // 2 for +X side, 2 for -X side of dorsal fin for crisp two-sided normals
const VERTS_PER_RING = TUBE_RADIAL + FIN_VERTS_PER_RING;

/**
 * Dynamic BufferGeometry for each serpentine Dragon Body + tall Dorsal Flame/Wave Mane Fin:
 * - `56` spine rings x `10` radial tube vertices + `56 x 2` (double-sided) tall Dorsal
 *   Flame/Wave Mane Fin ribbon vertices rising `0.45m` along the top of the spine!
 */
export function createDragonBodyBufferGeometry() {
  const totalVerts = SPINE_RINGS * VERTS_PER_RING;
  const tubeQuads = (SPINE_RINGS - 1) * TUBE_RADIAL;
  const finQuads = (SPINE_RINGS - 1) * 2;
  const totalIndices = (tubeQuads + finQuads) * 6;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const partIds = new Float32Array(totalVerts);
  const edgeFactors = new Float32Array(totalVerts);
  const indices = new Uint16Array(totalIndices);

  for (let i = 0; i < SPINE_RINGS; i++) {
    const u = i / (SPINE_RINGS - 1);
    const base = i * VERTS_PER_RING;
    for (let r = 0; r < TUBE_RADIAL; r++) {
      const v = r / TUBE_RADIAL;
      const ang = v * TAU; // 0 = dorsal top, PI = ventral belly
      const isBelly = Math.cos(ang) < -0.55;
      const vIdx = base + r;
      normals[vIdx * 3 + 1] = 1.0;
      uvs[vIdx * 2 + 0] = u;
      uvs[vIdx * 2 + 1] = v;
      partIds[vIdx] = isBelly ? 2.0 : 0.0;
      edgeFactors[vIdx] = clamp(0.18 + 0.55 * u + (1.0 - Math.abs(Math.cos(ang))) * 0.22, 0.1, 0.98);
    }

    // Dorsal Flame/Wave Mane Fin vertices (+X and -X faces)
    const fin0Base = base + TUBE_RADIAL;
    const fin0Tip = base + TUBE_RADIAL + 1;
    const fin1Base = base + TUBE_RADIAL + 2;
    const fin1Tip = base + TUBE_RADIAL + 3;

    for (const [bIdx, tIdx] of [
      [fin0Base, fin0Tip],
      [fin1Base, fin1Tip],
    ]) {
      normals[bIdx * 3 + 0] = 1.0;
      normals[tIdx * 3 + 0] = 1.0;
      uvs[bIdx * 2 + 0] = u;
      uvs[bIdx * 2 + 1] = 0.0;
      uvs[tIdx * 2 + 0] = u;
      uvs[tIdx * 2 + 1] = 1.0;
      partIds[bIdx] = 5.0;
      partIds[tIdx] = 5.0;
      edgeFactors[bIdx] = 0.25;
      edgeFactors[tIdx] = 1.0;
    }
  }

  let ptr = 0;
  for (let i = 0; i < SPINE_RINGS - 1; i++) {
    const r0 = i * VERTS_PER_RING;
    const r1 = (i + 1) * VERTS_PER_RING;
    for (let c = 0; c < TUBE_RADIAL; c++) {
      const cn = (c + 1) % TUBE_RADIAL;
      const a = r0 + c;
      const b = r0 + cn;
      const d = r1 + cn;
      const e = r1 + c;
      indices[ptr++] = a;
      indices[ptr++] = b;
      indices[ptr++] = d;
      indices[ptr++] = a;
      indices[ptr++] = d;
      indices[ptr++] = e;
    }
    // Fin side A
    const f0a = r0 + TUBE_RADIAL;
    const f0b = r0 + TUBE_RADIAL + 1;
    const f1a = r1 + TUBE_RADIAL;
    const f1b = r1 + TUBE_RADIAL + 1;
    indices[ptr++] = f0a;
    indices[ptr++] = f1a;
    indices[ptr++] = f1b;
    indices[ptr++] = f0a;
    indices[ptr++] = f1b;
    indices[ptr++] = f0b;

    // Fin side B (opposite winding)
    const g0a = r0 + TUBE_RADIAL + 2;
    const g0b = r0 + TUBE_RADIAL + 3;
    const g1a = r1 + TUBE_RADIAL + 2;
    const g1b = r1 + TUBE_RADIAL + 3;
    indices[ptr++] = g0a;
    indices[ptr++] = g0b;
    indices[ptr++] = g1b;
    indices[ptr++] = g0a;
    indices[ptr++] = g1b;
    indices[ptr++] = g1a;
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const normAttr = new THREE.BufferAttribute(normals, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  normAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', normAttr);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('aPartId', new THREE.BufferAttribute(partIds, 1));
  geometry.setAttribute('aEdgeFactor', new THREE.BufferAttribute(edgeFactors, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

export function createUltimatePetalGeometry(rows = 8, cols = 6) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const half = 0.42 * Math.sin(Math.PI * Math.pow(v, 0.78)) + 0.02;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const x = (u * 2 - 1) * half;
      const z = 0.22 * v * v - 0.5 * x * x;
      pos.push(x, v, z);
      uv.push(u, v);
    }
  }
  const row = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * row + c;
      idx.push(a, a + row, a + 1, a + row, a + row + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------------- */
/* 2. Ukiyo-e Woodblock Cel Shaders (`transparent: false, depthWrite: true`) */
/* ------------------------------------------------------------------------- */

function createUkiyoeDragonMaterial(noiseAtlas, sharedUniforms, styleKey = 'solar') {
  const pal = ULTIMATE_PALETTES[styleKey] || ULTIMATE_PALETTES.solar;
  return new THREE.ShaderMaterial({
    name: `UltimateVfx_UkiyoeDragonMaterial_${styleKey}`,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
      uSunDir: sharedUniforms.uSunDir,
      uDaylight: sharedUniforms.uDaylight,
      uAge01: { value: 0.0 },
      uColorDeep: { value: new THREE.Color(pal.deep) },
      uColorBody: { value: new THREE.Color(pal.body) },
      uColorCore: { value: new THREE.Color(pal.core) },
      uColorInk: { value: new THREE.Color(pal.ink) },
    },
    vertexShader: /* glsl */ `
      attribute float aPartId;
      attribute float aEdgeFactor;
      varying vec2 vUv;
      varying float vPartId;
      varying float vEdgeFactor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vPartId = aPartId;
        vEdgeFactor = aEdgeFactor;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoiseAtlas;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uDaylight;
      uniform float uAge01;
      uniform vec3 uColorDeep;
      uniform vec3 uColorBody;
      uniform vec3 uColorCore;
      uniform vec3 uColorInk;

      varying vec2 vUv;
      varying float vPartId;
      varying float vEdgeFactor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        int part = int(vPartId + 0.5);
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);

        float u = clamp(vUv.x, 0.0, 1.0);
        float v = clamp(vUv.y, 0.0, 1.0);

        vec2 flowUv = vec2(u * 2.8 - uTime * 2.6, v * 2.2 + uTime * 0.9);
        vec4 n0 = texture2D(uNoiseAtlas, flowUv);
        vec4 n1 = texture2D(uNoiseAtlas, flowUv * 1.85 + vec2(0.37, 0.61));
        float waveNoise = n0.b * 0.62 + n1.g * 0.38;

        // Organic licking flame tongues / Hokusai wave foam along dorsal fin (part == 5),
        // calligraphic tail tip (u > 0.68), and end-of-life dissolve (uAge01 > 0.72)
        float finErode = part == 5
          ? (1.0 - v * 0.66) + waveNoise * 0.62 * smoothstep(0.0, 0.92, 1.0 - u * 0.35)
          : 1.0 - smoothstep(0.68, 0.99, u) * 0.65 + waveNoise * 0.42;

        float lifeDissolve = 1.0 - smoothstep(0.72, 0.995, uAge01);
        float erodedMask = finErode * lifeDissolve;

        // Hard alphaTest cutout (strictly >= 0.45, zero transparent glass!)
        if (erodedMask < 0.45) discard;

        vec3 L = normalize(vec3(uSunDir.x, max(0.42, uSunDir.y), uSunDir.z));
        float ndl = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);

        vec3 col = uColorDeep;
        float rimInk = 1.0 - smoothstep(0.14, 0.25, ndv);
        float cutoutInk = 1.0 - smoothstep(0.45, 0.54, erodedMask);

        if (part == 6) {
          // Blazing slit dragon eyes
          col = uColorCore * 1.65;
          col = mix(col, uColorInk, rimInk * 0.75);
        } else if (part == 3 || part == 4) {
          // Sharp fangs & swept-back stag/dragon antler horns
          float hornGrad = smoothstep(0.15, 0.78, vEdgeFactor + ndl * 0.25);
          col = mix(uColorBody * 1.12, uColorCore * 1.38, hornGrad);
          col = mix(col, uColorInk, max(rimInk * 0.85, cutoutInk));
        } else if (part == 2) {
          // Glowing inner elemental throat & segmented ventral belly scutes
          float scuteRib = smoothstep(0.08, 0.0, abs(fract(u * 26.0) - 0.5));
          col = mix(uColorBody * 1.18, uColorCore * 1.35, step(0.38, ndl + waveNoise * 0.25));
          col = mix(col, uColorInk, max(scuteRib * 0.65, max(rimInk * 0.80, cutoutInk)));
        } else if (part == 5) {
          // Dorsal Flame/Wave Mane Fin & Head Ruff
          float tongueScore = v * 0.68 + waveNoise * 0.48;
          col = uColorDeep;
          col = mix(col, uColorBody * 1.15, step(0.36, tongueScore));
          col = mix(col, uColorCore * 1.32, step(0.68, tongueScore));
          float finRib = smoothstep(0.035, 0.0, abs(tongueScore - 0.36)) * 0.75;
          float finTipInk = smoothstep(0.88, 0.98, v);
          col = mix(col, uColorInk, max(max(cutoutInk, rimInk * 0.75), max(finRib, finTipInk * 0.85)));
        } else {
          // Sculpted Dragon Snout, Lower Jaw & Serpentine Scaled Body (part == 0 or 1)
          float scaleWave = sin(u * 38.0 + cos(v * 18.85) * 2.2) * 0.14;
          float striation = sin(v * 18.0 - u * 14.0 + n0.b * 4.8) * 0.12;
          float celScore = ndl * 0.56 + (1.0 - vEdgeFactor * 0.45) * 0.32 + waveNoise * 0.26 + scaleWave + striation;

          col = uColorDeep;
          col = mix(col, uColorBody * 1.10, step(0.42, celScore));
          col = mix(col, uColorCore * 1.26, step(0.74, celScore));

          float waveRib1 = smoothstep(0.032, 0.0, abs(celScore - 0.42)) * 0.78;
          float waveRib2 = smoothstep(0.028, 0.0, abs(celScore - 0.74)) * 0.68;
          col = mix(col, uColorInk, max(max(cutoutInk, rimInk * 0.86), max(waveRib1, waveRib2)));
        }

        gl_FragColor = vec4(col * mix(0.88, 1.0, uDaylight), 1.0);
      }
    `,
  });
}

const GLSL_PALETTE_ARRAY = /* glsl */ `
  uniform vec3 uCore[7];
  uniform vec3 uBody[7];
  uniform vec3 uDeep[7];
  uniform vec3 uInk[7];
`;

function createPaletteUniforms() {
  const mk = (key) => PAL_KEYS.map((k) => new THREE.Color(ULTIMATE_PALETTES[k][key]));
  return {
    uCore: { value: mk('core') },
    uBody: { value: mk('body') },
    uDeep: { value: mk('deep') },
    uInk: { value: mk('ink') },
  };
}

function createSparkCrystalMaterial(noiseAtlas, sharedUniforms) {
  return new THREE.ShaderMaterial({
    name: 'UltimateVfx_SparkCrystalMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
    uniforms: {
      ...createPaletteUniforms(),
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSparkMeta; // x: palIdx, y: heat, z: dissolve, w: seed
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec4 vMeta;

      void main() {
        vMeta = aSparkMeta;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vWorldNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_PALETTE_ARRAY}
      uniform sampler2D uNoiseAtlas;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec4 vMeta;

      void main() {
        int p = clamp(int(vMeta.x + 0.5), 0, 6);
        float heat = vMeta.y;
        float dissolve = clamp(vMeta.z, 0.0, 1.0);
        float seed = vMeta.w;

        vec4 n = texture2D(uNoiseAtlas, vWorldPos.xz * 0.85 + vec2(seed * 0.37, vWorldPos.y * 0.73));
        if (dissolve > 0.01 && n.b < dissolve) discard;

        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = abs(dot(N, V));

        vec3 col = uDeep[p];
        if (ndv > 0.24) col = uBody[p] * (1.15 + 0.35 * heat);
        if (ndv > 0.54) col = uCore[p] * (1.35 + 0.55 * heat);
        if (ndv < 0.16) col = uInk[p];

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function createPetalMaterial(noiseAtlas, sharedUniforms) {
  return new THREE.ShaderMaterial({
    name: 'UltimateVfx_PetalMaterial',
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      ...createPaletteUniforms(),
      uNoiseAtlas: { value: noiseAtlas },
      uTime: sharedUniforms.uTime,
    },
    vertexShader: /* glsl */ `
      attribute vec4 aPetalA; // x: palIdx, y: fade, z: seed, w: glow
      varying vec2 vUv;
      varying vec4 vA;
      void main() {
        vUv = uv;
        vA = aPetalA;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_PALETTE_ARRAY}
      uniform sampler2D uNoiseAtlas;
      varying vec2 vUv;
      varying vec4 vA;
      void main() {
        int p = clamp(int(vA.x + 0.5), 0, 6);
        float n = texture2D(uNoiseAtlas, vUv * vec2(0.6, 0.9) + vec2(vA.z)).b;
        if (n < vA.y * 1.1) discard;
        float x = abs(vUv.x * 2.0 - 1.0);
        vec3 col = mix(uCore[p] * (1.18 + vA.w * 0.4), uBody[p] * 1.15, smoothstep(0.35, 0.95, vUv.y));
        if (p == 5) col = mix(col, uDeep[6] * 1.15, smoothstep(0.78, 0.98, vUv.y));
        if (x < 0.06 && vUv.y < 0.8) col = uDeep[p];
        if (x > 0.84 || vUv.y < 0.03) col = uInk[p];
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------------- */
/* 3. UltimateVfxSystem — Twin-Element Ukiyo-e Dragon Choreography           */
/* ------------------------------------------------------------------------- */

const MAX_DRAGONS = 2;
const MAX_SPARKS = 48;
const MAX_PETALS = 48;

const _p = new THREE.Vector3();
const _pNext = new THREE.Vector3();
const _pPrev = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _right = new THREE.Vector3();
const _binorm = new THREE.Vector3();
const _headLook = new THREE.Matrix4();
const _dummy = new THREE.Object3D();
const _euler = new THREE.Euler();

export class UltimateVfxSystem {
  constructor({ scene = null, getGroundHeight = () => 0 } = {}) {
    this.scene = scene || null;
    this.getGroundHeight = typeof getGroundHeight === 'function' ? getGroundHeight : () => 0;
    this.noiseAtlas = getSharedNoiseAtlas();

    this.uTime = { value: 0 };
    this.sharedUniforms = {
      uTime: this.uTime,
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDaylight: { value: 1.0 },
    };

    this.group = new THREE.Group();
    this.group.name = 'UltimateVfxRoot';
    this.group.visible = false;
    if (this.scene) {
      this.scene.add(this.group);
    }

    this._shakeOffset = new THREE.Vector3();
    this._hitstopScale = 1.0;
    this.cataclysm = { active: false, pos: new THREE.Vector3(), timer: 0 };

    // Shared Sculpted Eastern Dragon Head geometry (~610 tris)
    this.sharedHeadGeo = createEasternDragonHeadGeometry();

    // 2 Dragon Slots: Slot 0 = Solar Dragon ('solar'), Slot 1 = Glacial Dragon ('rime')
    this.dragons = [];
    this.dragonHeads = [];
    this.dragonBodies = [];

    for (let i = 0; i < MAX_DRAGONS; i++) {
      const defaultStyle = i === 0 ? 'solar' : 'rime';
      const mat = createUkiyoeDragonMaterial(this.noiseAtlas, this.sharedUniforms, defaultStyle);

      const headMesh = new THREE.Mesh(this.sharedHeadGeo, mat);
      headMesh.name = `UltimateVfx_DragonHead_${i}`;
      headMesh.frustumCulled = false;
      headMesh.visible = false;
      headMesh.userData.isVfx = true;
      this.group.add(headMesh);

      const bodyGeo = createDragonBodyBufferGeometry();
      const bodyMesh = new THREE.Mesh(bodyGeo, mat);
      bodyMesh.name = `UltimateVfx_DragonBody_${i}`;
      bodyMesh.frustumCulled = false;
      bodyMesh.visible = false;
      bodyMesh.userData.isVfx = true;
      this.group.add(bodyMesh);

      this.dragonHeads.push(headMesh);
      this.dragonBodies.push(bodyMesh);

      this.dragons.push({
        slot: i,
        active: false,
        mode: 'awakening', // 'awakening' | 'slash'
        style: defaultStyle,
        palIdx: i === 0 ? 1 : 0,
        origin: new THREE.Vector3(),
        yaw: 0,
        age: 0,
        duration: 1.25,
        scale: 1.0,
        phase: i * Math.PI,
        handSide: i === 0 ? 1 : -1,
        biteBurstTriggered: false,
        getBladeTip: null,
        headMesh,
        bodyMesh,
        mat,
        spinePoints: Array.from({ length: SPINE_RINGS }, () => new THREE.Vector3()),
      });
    }

    // Orbiting / Bursting Ember & Frost Crystal Sparks (48 instances, 1 draw call)
    const sparkGeo = createGlacierCrystalGeometry({
      seed: 41.3,
      sides: 6,
      taper: 0.68,
      roughness: 0.12,
      bend: 0.38,
    });
    this.sparkMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPARKS * 4), 4);
    sparkGeo.setAttribute('aSparkMeta', this.sparkMetaAttr);
    this.sparkMat = createSparkCrystalMaterial(this.noiseAtlas, this.sharedUniforms);
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, this.sparkMat, MAX_SPARKS);
    this.sparkMesh.name = 'UltimateVfx_DC5_DragonSparks';
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.count = 0;
    this.sparkMesh.userData.isVfx = true;
    this.group.add(this.sparkMesh);

    this.sparkParticles = [];
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.sparkParticles.push({
        active: false,
        age: 0,
        life: 0.55,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        palIdx: i % 2,
        scale: 0.18,
        seed: (i * 1.73) % 10.0,
      });
    }

    // Sacred Lotus & Rose Petals for `spawnCouplesBloom` / `playCouplesUltimate` (48 instances, 1 draw call)
    const petalGeo = createUltimatePetalGeometry();
    this.petalMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PETALS * 4), 4);
    petalGeo.setAttribute('aPetalA', this.petalMetaAttr);
    this.petalMat = createPetalMaterial(this.noiseAtlas, this.sharedUniforms);
    this.petalMesh = new THREE.InstancedMesh(petalGeo, this.petalMat, MAX_PETALS);
    this.petalMesh.name = 'UltimateVfx_DC6_CouplesPetals';
    this.petalMesh.frustumCulled = false;
    this.petalMesh.count = 0;
    this.petalMesh.userData.isVfx = true;
    this.group.add(this.petalMesh);

    this.bloomState = {
      active: false,
      pos: new THREE.Vector3(),
      age: 0,
      life: 1.5,
      openAt: 0.45,
      flyCount: 28,
      seed: 1.37,
    };
  }

  _ground(x, z) {
    const g = this.getGroundHeight(x, z);
    return Number.isFinite(g) ? g : 0;
  }

  _applyDragonPalette(dragon, styleKey) {
    const pal = ULTIMATE_PALETTES[styleKey] || ULTIMATE_PALETTES.solar;
    dragon.style = styleKey;
    dragon.palIdx = pal.idx;
    dragon.mat.uniforms.uColorDeep.value.set(pal.deep);
    dragon.mat.uniforms.uColorBody.value.set(pal.body);
    dragon.mat.uniforms.uColorCore.value.set(pal.core);
    dragon.mat.uniforms.uColorInk.value.set(pal.ink);
  }

  /**
   * Evaluates the 3D trajectory point at normalized progress `s` (`0..1`) for a dragon:
   * - `mode === 'awakening'` (`duration = 1.25s`, Beat 1 = `0.00..0.42s`, Beat 2 = `0.42..1.25s`):
   *   - Beat 1 (`s <= 0.336` corresponding to `t = 0.00..0.42s`):
   *     Both dragons erupt from the ground on opposite sides of `origin` (`radius = 1.55m`)
   *     and spiral upward (`1.4` turns from `y = 0.25m` to `y = 2.05m`) around the Knight
   *     in a tight double-helix coil!
   *   - Beat 2 (`s > 0.336` corresponding to `t = 0.42..1.25s`):
   *     Both dragons uncoil from shoulder height and surge forward (`5.8m` along `yaw`)
   *     in a sweeping figure-8 cross-arc (`y = 1.15m`), crossing jaws at `3.6m` in front
   *     of the Knight (`t = 0.72s`, `s = 0.576`)!
   * - `mode === 'slash'` (`duration = 0.75s`):
   *   Coils around the Knight's slashing arm and whips forward `4.8m` along `yaw` in an S-curve arc!
   */
  _sampleDragonTrajectory(dragon, s, outVec) {
    const clampedS = clamp(s, 0.0, 1.0);
    const ox = dragon.origin.x;
    const oy = dragon.origin.y;
    const oz = dragon.origin.z;
    const fwdX = Math.sin(dragon.yaw);
    const fwdZ = Math.cos(dragon.yaw);
    const rightX = Math.cos(dragon.yaw);
    const rightZ = -Math.sin(dragon.yaw);
    const sideSign = dragon.handSide; // +1 for Dragon 0 (Solar), -1 for Dragon 1 (Glacial)

    if (dragon.mode === 'slash') {
      // S-curve whip forward 4.8m along `yaw` from flanking shoulder arch
      const fwdDist = lerp(-0.25, 4.8, Math.pow(clampedS, 0.82));
      const sCurveLat =
        sideSign *
        Math.cos(clampedS * Math.PI * 1.35) *
        lerp(1.45, 0.35, clampedS);
      const arcY =
        1.15 +
        Math.sin(clampedS * Math.PI) * 0.55;

      outVec.set(
        ox + fwdX * fwdDist + rightX * sCurveLat,
        oy + arcY,
        oz + fwdZ * fwdDist + rightZ * sCurveLat
      );
      return outVec;
    }

    // `mode === 'awakening'`: Open Flanking Wing-Arch (`s = 0..0.34`) -> Sweeping Figure-8 X-Cross Lunge (`s = 0.34..1.0`)
    // NEVER wraps horizontal coils behind the Knight's back, so the Knight and both Dragon Heads stay 100% visible!
    const beatSplit = 0.34;
    if (clampedS <= beatSplit) {
      const u1 = saturate(clampedS / beatSplit);
      // Rise from ground at left/right flanks (`lx = ±1.25m -> ±2.05m`), arching high over the Knight's shoulders (`ly = 0.28m -> 2.15m`)
      const lx = sideSign * (1.25 + Math.sin(u1 * Math.PI * 0.65) * 0.85);
      const lz = lerp(-0.35, 0.75, smoothstep(0.0, 1.0, u1));
      const ly = lerp(0.28, 2.15, Math.sin(u1 * Math.PI * 0.5));
      outVec.set(
        ox + rightX * lx + fwdX * lz,
        oy + ly,
        oz + rightZ * lx + fwdZ * lz
      );
      return outVec;
    }

    // Beat 2 (`s = 0.34..1.0`): Dive forward from the high flanking arches (`lz = 0.75m -> 6.2m`),
    // crossing jaws in a blazing Fire + Ice `X` at `lz = 3.4m` (`u2 = 0.45`) and soaring upward at the tail end!
    const u2 = saturate((clampedS - beatSplit) / (1.0 - beatSplit));
    const lz = lerp(0.75, 6.2, Math.pow(u2, 0.85));
    // Smooth cosine cross from `+2.02 * sideSign` through `0` (at u2 ≈ 0.45) to `-1.55 * sideSign`
    const lx = sideSign * lerp(2.02, -1.55, smoothstep(0.0, 0.88, u2));
    // Dive from `2.15m` down to chest height (`1.08m`) at the X-cross (`u2 = 0.48`), then rise to `1.85m`
    const diveU = Math.sin(u2 * Math.PI * 0.88);
    const ly = lerp(2.15, 1.85, u2) - diveU * 1.05;

    outVec.set(
      ox + rightX * lx + fwdX * lz,
      oy + ly,
      oz + rightZ * lx + fwdZ * lz
    );
    return outVec;
  }

  /**
   * Rebuilds the 56-ring dynamic serpentine body + 0.50m dorsal mane fin and positions
   * the sculpted 3D Eastern Dragon head at `u = 0` for an active dragon slot.
   */
  _updateDragonGeometry(dragon, clockTime) {
    const progress = saturate(dragon.age / Math.max(0.1, dragon.duration));
    if (progress >= 1.0) {
      dragon.active = false;
      dragon.headMesh.visible = false;
      dragon.bodyMesh.visible = false;
      return;
    }

    dragon.mat.uniforms.uAge01.value = progress;

    // Head leads along the trajectory; body spans behind the head over `bodySpanS`
    const headS = clamp(0.10 + progress * 0.90, 0.10, 1.0);
    const bodySpanS = dragon.mode === 'slash' ? 0.42 : 0.38;
    const tailS = Math.max(0.0, headS - bodySpanS * smoothstep(0.0, 0.16, progress));

    // Evaluate 56 spine points from u = 0 (head neck base) to u = 1 (tail tip)
    // with traveling sinusoidal S-wave undulation
    const spine = dragon.spinePoints;
    for (let i = 0; i < SPINE_RINGS; i++) {
      const u = i / (SPINE_RINGS - 1);
      const s = lerp(headS, tailS, u);

      this._sampleDragonTrajectory(dragon, s, _p);
      this._sampleDragonTrajectory(dragon, Math.min(1.0, s + 0.015), _pNext);
      this._sampleDragonTrajectory(dragon, Math.max(0.0, s - 0.015), _pPrev);

      _tangent.subVectors(_pNext, _pPrev);
      if (_tangent.lengthSq() < 1e-6) _tangent.set(Math.sin(dragon.yaw), 0, Math.cos(dragon.yaw));
      else _tangent.normalize();

      _right.crossVectors(_tangent, UP);
      if (_right.lengthSq() < 1e-5) _right.set(1, 0, 0);
      else _right.normalize();
      _binorm.crossVectors(_right, _tangent).normalize();

      // Traveling sinusoidal S-wave undulation (smoothly ramped from 0 at neck u=0 so head locks cleanly)
      const smoothRamp = smoothstep(0.0, 0.14, u) * (1.0 - 0.22 * u);
      const lat = Math.sin(u * 10.5 - clockTime * 18.0 + dragon.phase) * 0.22 * smoothRamp;
      const vert = Math.cos(u * 8.0 - clockTime * 18.0 + dragon.phase) * 0.11 * smoothRamp;

      spine[i]
        .copy(_p)
        .addScaledVector(_right, lat)
        .addScaledVector(_binorm, vert);
    }

    // Orient & position the sculpted 3D Eastern Dragon head at spine[0] (`u = 0`)
    _tangent.subVectors(spine[0], spine[2]);
    if (_tangent.lengthSq() < 1e-6) {
      _tangent.set(Math.sin(dragon.yaw), 0, Math.cos(dragon.yaw));
    } else {
      _tangent.normalize();
    }

    const headMesh = dragon.headMesh;
    headMesh.position.copy(spine[0]);
    _pNext.copy(spine[0]).add(_tangent);
    _headLook.lookAt(_pNext, spine[0], UP);
    headMesh.quaternion.setFromRotationMatrix(_headLook);
    const headScale = dragon.scale * 1.28 * (1.0 - 0.15 * smoothstep(0.82, 1.0, progress));
    headMesh.scale.setScalar(headScale);
    headMesh.visible = true;

    // Deform the 56-ring serpentine body tube + 0.50m dorsal flame/wave mane fin
    const geo = dragon.bodyMesh.geometry;
    const posArr = geo.attributes.position.array;
    const normArr = geo.attributes.normal.array;

    for (let i = 0; i < SPINE_RINGS; i++) {
      const u = i / (SPINE_RINGS - 1);
      const pCur = spine[i];
      const pPrev = spine[Math.max(0, i - 1)];
      const pNext = spine[Math.min(SPINE_RINGS - 1, i + 1)];

      _tangent.subVectors(pPrev, pNext);
      if (_tangent.lengthSq() < 1e-6) {
        _tangent.set(Math.sin(dragon.yaw), 0, Math.cos(dragon.yaw));
      } else {
        _tangent.normalize();
      }

      _right.crossVectors(_tangent, UP);
      if (_right.lengthSq() < 1e-5) _right.set(1, 0, 0);
      else _right.normalize();
      _binorm.crossVectors(_right, _tangent).normalize();

      // Sleek, sinuous serpent body behind head, tapering to a fine calligraphic brush point at tail
      const rTube =
        (0.20 * Math.sin(Math.pow(1.0 - u, 0.72) * Math.PI * 0.88) + 0.025 * (1.0 - u)) *
        dragon.scale;
      // Tall 0.50m Dorsal Flame/Wave Mane Fin with organic traveling wave crests
      const finH =
        (0.50 * Math.sin(Math.pow(1.0 - u, 0.65) * Math.PI * 0.92) + 0.06 * (1.0 - u)) *
        (0.84 + 0.24 * Math.sin(u * 26.0 - clockTime * 22.0 + dragon.phase)) *
        dragon.scale;
      const finSway = Math.sin(u * 19.0 - clockTime * 20.0 + dragon.phase) * 0.06;

      const base = i * VERTS_PER_RING;
      for (let c = 0; c < TUBE_RADIAL; c++) {
        const ang = (c / TUBE_RADIAL) * TAU; // 0 = dorsal top (+binorm), PI = ventral belly (-binorm)
        const sinA = Math.sin(ang);
        const cosA = Math.cos(ang);

        const nx = _right.x * sinA + _binorm.x * cosA;
        const ny = _right.y * sinA + _binorm.y * cosA;
        const nz = _right.z * sinA + _binorm.z * cosA;

        const vIdx = (base + c) * 3;
        posArr[vIdx + 0] = pCur.x + nx * rTube;
        posArr[vIdx + 1] = pCur.y + ny * rTube;
        posArr[vIdx + 2] = pCur.z + nz * rTube;

        normArr[vIdx + 0] = nx;
        normArr[vIdx + 1] = ny;
        normArr[vIdx + 2] = nz;
      }

      // Dorsal fin base & tip (sits atop dorsal spine at cosA = 1, rising `finH` along `_binorm`)
      const bx = pCur.x + _binorm.x * (rTube * 0.88);
      const by = pCur.y + _binorm.y * (rTube * 0.88);
      const bz = pCur.z + _binorm.z * (rTube * 0.88);

      const tx = bx + _binorm.x * finH + _right.x * finSway;
      const ty = by + _binorm.y * finH + _right.y * finSway;
      const tz = bz + _binorm.z * finH + _right.z * finSway;

      const f0Base = (base + TUBE_RADIAL) * 3;
      const f0Tip = (base + TUBE_RADIAL + 1) * 3;
      const f1Base = (base + TUBE_RADIAL + 2) * 3;
      const f1Tip = (base + TUBE_RADIAL + 3) * 3;

      posArr[f0Base + 0] = bx;
      posArr[f0Base + 1] = by;
      posArr[f0Base + 2] = bz;
      posArr[f0Tip + 0] = tx;
      posArr[f0Tip + 1] = ty;
      posArr[f0Tip + 2] = tz;

      posArr[f1Base + 0] = bx;
      posArr[f1Base + 1] = by;
      posArr[f1Base + 2] = bz;
      posArr[f1Tip + 0] = tx;
      posArr[f1Tip + 1] = ty;
      posArr[f1Tip + 2] = tz;

      normArr[f0Base + 0] = _right.x;
      normArr[f0Base + 1] = _right.y;
      normArr[f0Base + 2] = _right.z;
      normArr[f0Tip + 0] = _right.x;
      normArr[f0Tip + 1] = _right.y;
      normArr[f0Tip + 2] = _right.z;

      normArr[f1Base + 0] = -_right.x;
      normArr[f1Base + 1] = -_right.y;
      normArr[f1Base + 2] = -_right.z;
      normArr[f1Tip + 0] = -_right.x;
      normArr[f1Tip + 1] = -_right.y;
      normArr[f1Tip + 2] = -_right.z;
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    dragon.bodyMesh.visible = true;
  }

  _emitSpark(pos, vel, palIdx = 1, scale = 0.20, life = 0.52) {
    let best = this.sparkParticles[0];
    for (const sp of this.sparkParticles) {
      if (!sp.active) {
        best = sp;
        break;
      }
      if (sp.age > best.age) best = sp;
    }
    best.active = true;
    best.age = 0;
    best.life = life;
    best.pos.copy(pos);
    best.vel.copy(vel);
    best.palIdx = palIdx;
    best.scale = scale;
  }

  _burstSparks(center, count = 36, style = 'eclipse', speed = 7.8) {
    const norm = normalizeDragonStyle(style);
    for (let i = 0; i < count; i++) {
      const h1 = hash11(this.uTime.value * 3.7 + i * 1.31);
      const h2 = hash11(this.uTime.value * 5.3 + i * 2.17);
      const h3 = hash11(this.uTime.value * 7.1 + i * 3.43);
      const az = (i / count) * TAU + (h1 - 0.5) * 0.35;
      const el = 0.18 + h2 * 0.85;
      const sp = speed * (0.55 + 0.65 * h3);
      _tangent.set(
        Math.cos(az) * Math.cos(el) * sp,
        Math.sin(el) * sp + 1.8,
        Math.sin(az) * Math.cos(el) * sp
      );
      const pal =
        norm === 'eclipse'
          ? i % 2 === 0
            ? ULTIMATE_PALETTES.solar.idx
            : ULTIMATE_PALETTES.rime.idx
          : palIndex(norm);
      this._emitSpark(center, _tangent, pal, 0.16 + 0.10 * h1, 0.42 + 0.24 * h2);
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Public Choreography API                                                 */
  /* ----------------------------------------------------------------------- */

  /**
   * Knight Q Twin-Element Dragon Awakening (`duration = 1.25s`):
   * - Spawns TWO dragons simultaneously (`Dragon 0 = Solar Fire`, `Dragon 1 = Glacial Ice`):
   *   - Beat 1 (`t = 0.00s .. 0.42s` — Double-Helix Spiral Ascent): Both dragons erupt
   *     from the ground on opposite sides of `pos` (`radius = 1.55m`) and spiral upward
   *     (`1.4` turns from `y = 0.25m` to `y = 2.05m`) around the Knight in a tight
   *     double-helix coil!
   *   - Beat 2 (`t = 0.42s .. 1.25s` — Figure-8 Forward Lunge & Cross-Bite): Both dragons
   *     uncoil from shoulder height and surge forward (`5.8m` along `yaw`) in a sweeping
   *     figure-8 cross-arc (`y = 1.15m`), crossing jaws at `3.6m` in front of the Knight
   *     (`t = 0.72s`) with wide-open fanged jaws and bursting 36 ember/frost sparks outward!
   */
  playKnightAwakening(pos, { yaw = null, style = 'eclipse', getBladeTip = null, duration = 1.25 } = {}) {
    const px = pos?.x ?? pos?.[0] ?? 0;
    const pz = pos?.z ?? pos?.[2] ?? 0;
    const py = Number.isFinite(pos?.y) ? pos.y : this._ground(px, pz);
    const resolvedYaw = Number.isFinite(yaw)
      ? yaw
      : Number.isFinite(pos?.yaw)
        ? pos.yaw
        : 0;

    const norm = normalizeDragonStyle(style);
    const style0 = norm === 'rime' ? 'rime' : 'solar';
    const style1 = norm === 'solar' ? 'solar' : 'rime';

    const styles = [style0, style1];
    for (let i = 0; i < MAX_DRAGONS; i++) {
      const d = this.dragons[i];
      this._applyDragonPalette(d, styles[i]);
      d.active = true;
      d.mode = 'awakening';
      d.origin.set(px, py, pz);
      d.yaw = resolvedYaw;
      d.age = 0;
      d.duration = duration;
      d.scale = 1.0;
      d.phase = i * Math.PI;
      d.handSide = i === 0 ? 1 : -1;
      d.biteBurstTriggered = false;
      d.getBladeTip = typeof getBladeTip === 'function' ? getBladeTip : null;
    }

    // Initial eruption sparks around the double-helix base
    _p.set(px, py + 0.45, pz);
    this._burstSparks(_p, 16, 'eclipse', 5.2);

    this.group.visible = true;
    this._evaluate(0);
    return this;
  }

  /**
   * Elemental Dragon Slash (`duration = 0.75s`):
   * - Spawns 1 dragon (or 2 intertwined dragons if `style === 'eclipse'`) that coils
   *   around the Knight's slashing arm and whips forward `4.8m` along `yaw` in an
   *   S-curve arc, biting through the target in front of the Knight!
   */
  playDragonSlash(pos, { yaw = null, style = 'solar', duration = 0.75 } = {}) {
    const px = pos?.x ?? pos?.[0] ?? 0;
    const pz = pos?.z ?? pos?.[2] ?? 0;
    const py = Number.isFinite(pos?.y) ? pos.y : this._ground(px, pz);
    const resolvedYaw = Number.isFinite(yaw)
      ? yaw
      : Number.isFinite(pos?.yaw)
        ? pos.yaw
        : 0;
    const norm = normalizeDragonStyle(style);
    const isDual = norm === 'eclipse';

    const d0 = this.dragons[0];
    this._applyDragonPalette(d0, norm === 'rime' ? 'rime' : 'solar');
    d0.active = true;
    d0.mode = 'slash';
    d0.origin.set(px, py, pz);
    d0.yaw = resolvedYaw;
    d0.age = 0;
    d0.duration = duration;
    d0.scale = 0.88;
    d0.phase = 0;
    d0.handSide = 1;
    d0.biteBurstTriggered = false;

    const d1 = this.dragons[1];
    if (isDual) {
      this._applyDragonPalette(d1, 'rime');
      d1.active = true;
      d1.mode = 'slash';
      d1.origin.set(px, py, pz);
      d1.yaw = resolvedYaw;
      d1.age = 0;
      d1.duration = duration;
      d1.scale = 0.84;
      d1.phase = Math.PI;
      d1.handSide = -1;
      d1.biteBurstTriggered = false;
    } else {
      d1.active = false;
      d1.headMesh.visible = false;
      d1.bodyMesh.visible = false;
    }

    this.group.visible = true;
    this._evaluate(0);
    return this;
  }

  /**
   * Spawns a Sacred Lotus & Crimson Rose bloom burst at `pos` (compatibility for couples synergy).
   */
  spawnCouplesBloom(pos, { openAt = 0.35, life = 1.5, flyCount = 28 } = {}) {
    const px = pos?.x ?? pos?.[0] ?? 0;
    const pz = pos?.z ?? pos?.[2] ?? 0;
    const py = Number.isFinite(pos?.y) ? pos.y : this._ground(px, pz);
    this.bloomState.active = true;
    this.bloomState.pos.set(px, py, pz);
    this.bloomState.age = 0;
    this.bloomState.life = life;
    this.bloomState.openAt = openAt;
    this.bloomState.flyCount = flyCount;
    this.bloomState.seed = Math.random() * 10.0;
    this.group.visible = true;
    return this;
  }

  playCouplesUltimate(knightPos, magePos, impactPos, { strikeDelay = 0.45 } = {}) {
    const target = impactPos || knightPos || magePos || { x: 0, y: 0, z: 0 };
    this.playKnightAwakening(target, { style: 'eclipse', duration: 1.25 });
    this.spawnCouplesBloom(target, { openAt: strikeDelay, life: 1.5, flyCount: 28 });
    return this;
  }

  spawnBurst(pos, { style = 'eclipse', count = 24, speed = 7.2 } = {}) {
    if (!pos) return this;
    const px = pos.x ?? pos[0] ?? 0;
    const pz = pos.z ?? pos[2] ?? 0;
    const py = (pos.y ?? pos[1] ?? this._ground(px, pz)) + 0.6;
    _p.set(px, py, pz);
    this._burstSparks(_p, count, style, speed);
    this.group.visible = true;
    return this;
  }

  spawnSparks(pos, { count = 16, speed = 6.5, pal = 1 } = {}) {
    const style = pal === 0 ? 'rime' : 'solar';
    return this.spawnBurst(pos, { style, count, speed });
  }

  startCataclysm(pos, duration = 6.0) {
    if (pos) this.cataclysm.pos.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
    this.cataclysm.active = true;
    this.cataclysm.timer = duration;
    return this;
  }

  cataclysmStrike(targets = null) {
    if (!this.cataclysm.active) return this;
    if (Array.isArray(targets) && targets.length > 0) {
      const t = targets[0]?.enemy || targets[0];
      if (t && Number.isFinite(t.x)) {
        this.spawnBurst({ x: t.x, y: this._ground(t.x, t.z), z: t.z }, { style: 'eclipse', count: 14 });
      }
    }
    return this;
  }

  stopCataclysm() {
    this.cataclysm.active = false;
    this.cataclysm.timer = 0;
    return this;
  }

  /* ----------------------------------------------------------------------- */
  /* Frame Update & Deterministic Seeker                                     */
  /* ----------------------------------------------------------------------- */

  update(dt) {
    if (this.cataclysm.active) {
      this.cataclysm.timer -= dt;
      if (this.cataclysm.timer <= 0) this.cataclysm.active = false;
    }
    if (!this.group.visible) return;
    this.uTime.value += dt;
    this._evaluate(dt);
  }

  _evaluate(dt = 0) {
    const clockTime = this.uTime.value;
    let activeDragonCount = 0;

    for (let i = 0; i < MAX_DRAGONS; i++) {
      const d = this.dragons[i];
      if (!d.active) {
        d.headMesh.visible = false;
        d.bodyMesh.visible = false;
        continue;
      }

      d.age += dt;
      if (d.age >= d.duration) {
        d.active = false;
        d.headMesh.visible = false;
        d.bodyMesh.visible = false;
        continue;
      }

      activeDragonCount++;
      this._updateDragonGeometry(d, clockTime);

      // Continuous orbiting wake sparks while slithering
      if (dt > 0 && hash11(clockTime * 37.0 + i * 7.3) > 0.35) {
        const ringIdx = Math.min(SPINE_RINGS - 1, Math.floor(hash11(clockTime * 19.1 + i) * 24));
        const wp = d.spinePoints[ringIdx];
        _tangent.set(
          (hash11(clockTime * 13.7 + i) - 0.5) * 3.2,
          1.2 + hash11(clockTime * 23.3 + i) * 2.4,
          (hash11(clockTime * 31.1 + i) - 0.5) * 3.2
        );
        this._emitSpark(wp, _tangent, d.palIdx, 0.14, 0.36);
      }

      // Cross-bite climax spark burst:
      // In `awakening`, both dragons cross jaws at 3.6m in front of Knight at t = 0.72s!
      const biteTriggerTime = d.mode === 'awakening' ? 0.72 : d.duration * 0.52;
      if (!d.biteBurstTriggered && d.age >= biteTriggerTime) {
        d.biteBurstTriggered = true;
        if (i === 0) {
          const biteCount = d.mode === 'awakening' ? 36 : 20;
          const biteStyle = this.dragons[1].active ? 'eclipse' : d.style;
          this._burstSparks(d.headMesh.position, biteCount, biteStyle, 8.2);
        }
      }
    }

    // Evaluate 48 chiseled crystal/ember shards
    let sparkCount = 0;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const sp = this.sparkParticles[i];
      if (!sp.active) continue;
      sp.age += dt;
      if (sp.age >= sp.life) {
        sp.active = false;
        continue;
      }

      const u = saturate(sp.age / sp.life);
      const dissolve = smoothstep(0.45, 0.98, u);
      if (dt > 0) {
        sp.pos.addScaledVector(sp.vel, dt);
        sp.vel.y -= 6.5 * dt;
        sp.vel.multiplyScalar(Math.exp(-1.8 * dt));
      }

      _dummy.position.copy(sp.pos);
      if (sp.vel.lengthSq() > 1e-4) {
        _p.copy(sp.vel).normalize();
        _dummy.quaternion.setFromUnitVectors(UP, _p);
      } else {
        _dummy.quaternion.identity();
      }
      _dummy.scale.set(sp.scale * 0.55, sp.scale * 1.45, sp.scale * 0.55);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(sparkCount, _dummy.matrix);
      this.sparkMetaAttr.setXYZW(sparkCount, sp.palIdx, 1.0 - u, dissolve, sp.seed);
      sparkCount++;
    }
    this.sparkMesh.count = sparkCount;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    this.sparkMetaAttr.needsUpdate = true;

    // Evaluate Sacred Lotus / Rose petals (`spawnCouplesBloom`)
    let petalCount = 0;
    const bl = this.bloomState;
    if (bl.active) {
      bl.age += dt;
      if (bl.age >= bl.life) {
        bl.active = false;
      } else {
        const t = bl.age;
        const rise = outQuint(t / 0.35);
        const open = outQuint(Math.max(0, t - bl.openAt) / 0.35);
        const fade = smoothstep(bl.life - 0.45, bl.life, t);

        for (let i = 0; i < 12 && petalCount < MAX_PETALS; i++) {
          const outer = i >= 6;
          const yaw = (i / 6) * TAU + (outer ? Math.PI / 6 : 0);
          const tilt = lerp(outer ? 0.35 : 0.12, outer ? 1.2 : 0.8, open);
          const sc = (outer ? 2.2 : 1.7) * rise * (1.0 + 0.2 * open);
          _euler.set(tilt, yaw, 0, 'YXZ');
          _dummy.position.set(bl.pos.x, bl.pos.y + 0.06, bl.pos.z);
          _dummy.quaternion.setFromEuler(_euler);
          _dummy.scale.setScalar(sc);
          _dummy.updateMatrix();
          this.petalMesh.setMatrixAt(petalCount, _dummy.matrix);
          this.petalMetaAttr.setXYZW(petalCount, 5, fade, i * 0.37, open * 0.8);
          petalCount++;
        }

        const ft = t - bl.openAt;
        if (ft > 0) {
          for (let i = 0; i < bl.flyCount && petalCount < MAX_PETALS; i++) {
            const hs = hash11(bl.seed + i * 1.37);
            const hs2 = hash11(bl.seed + i * 2.71);
            const ang = (i / bl.flyCount) * TAU + hs * 0.4 + ft * (0.9 + hs);
            const sp = 4.5 + 4.5 * hs2;
            const drag = (1.0 - Math.exp(-2.2 * ft)) / 2.2;
            const r = 0.5 + sp * drag;
            _dummy.position.set(
              bl.pos.x + Math.cos(ang) * r,
              bl.pos.y + 0.4 + (3.2 + 2.8 * hs) * drag - 1.1 * ft * ft,
              bl.pos.z + Math.sin(ang) * r
            );
            _euler.set(ft * (4.0 + hs * 5.0), ang, ft * 4.5 * hs2);
            _dummy.quaternion.setFromEuler(_euler);
            _dummy.scale.setScalar(0.45 + 0.28 * hs);
            _dummy.updateMatrix();
            this.petalMesh.setMatrixAt(petalCount, _dummy.matrix);
            this.petalMetaAttr.setXYZW(petalCount, i % 3 === 0 ? 5 : 6, fade, hs * 7.0, 0.3);
            petalCount++;
          }
        }
      }
    }
    this.petalMesh.count = petalCount;
    this.petalMesh.instanceMatrix.needsUpdate = true;
    this.petalMetaAttr.needsUpdate = true;

    const anyVisible = activeDragonCount > 0 || sparkCount > 0 || petalCount > 0;
    this.group.visible = anyVisible;
  }

  /**
   * Deterministic seeker for preview/QA captures.
   */
  seek(timeSeconds, scenario = null) {
    if (scenario) {
      this.clear();
      scenario(this);
    }
    this.uTime.value = timeSeconds;
    const steps = 12;
    const stepDt = timeSeconds / Math.max(1, steps);
    for (const d of this.dragons) {
      if (d.active) d.age = 0;
    }
    for (let i = 0; i < steps; i++) {
      this._evaluate(stepDt);
    }
    return this;
  }

  setLighting({ sunDir, daylight = 1.0 } = {}) {
    if (sunDir) this.sharedUniforms.uSunDir.value.copy(sunDir).normalize();
    if (Number.isFinite(daylight)) {
      this.sharedUniforms.uDaylight.value = clamp(daylight, 0.0, 1.2);
    }
  }

  getCameraShakeOffset(target = new THREE.Vector3()) {
    return target.copy(this._shakeOffset);
  }

  getHitstopScale() {
    return this._hitstopScale;
  }

  getStats() {
    let drawCalls = 0;
    let activeDragons = 0;
    let instances = 0;
    if (this.group.visible) {
      for (const d of this.dragons) {
        if (d.active && d.headMesh.visible) {
          drawCalls += 2; // 1 sculpted head Mesh + 1 spline-deforming body Mesh
          activeDragons++;
        }
      }
      if (this.sparkMesh.count > 0) {
        drawCalls++;
        instances += this.sparkMesh.count;
      }
      if (this.petalMesh.count > 0) {
        drawCalls++;
        instances += this.petalMesh.count;
      }
    }
    return {
      active: drawCalls > 0,
      drawCalls,
      activeDragons,
      activeSparks: this.group.visible ? this.sparkMesh.count : 0,
      activePetals: this.group.visible ? this.petalMesh.count : 0,
      instances,
      cataclysm: this.cataclysm.active,
    };
  }

  clear() {
    for (const d of this.dragons) {
      d.active = false;
      d.age = 0;
      d.biteBurstTriggered = false;
      d.getBladeTip = null;
      d.headMesh.visible = false;
      d.bodyMesh.visible = false;
    }
    for (const sp of this.sparkParticles) {
      sp.active = false;
    }
    this.bloomState.active = false;
    this.cataclysm.active = false;
    this.cataclysm.timer = 0;
    this.sparkMesh.count = 0;
    this.petalMesh.count = 0;
    this._shakeOffset.set(0, 0, 0);
    this._hitstopScale = 1.0;
    this.group.visible = false;
  }

  dispose() {
    this.clear();
    this.sharedHeadGeo.dispose();
    for (const d of this.dragons) {
      d.bodyMesh.geometry.dispose();
      d.mat.dispose();
    }
    this.sparkMesh.geometry.dispose();
    this.sparkMat.dispose();
    this.petalMesh.geometry.dispose();
    this.petalMat.dispose();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

export function createUltimateVfxSystem(options = {}) {
  return new UltimateVfxSystem(options);
}
