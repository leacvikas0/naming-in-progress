import * as THREE from 'three';

export const SPECIES_SPECS = {
  grassTuft:  { id: 'grassTuft',  name: 'Meadow Grass Tuft',        budget: 48,  flex: 1.0 },
  bellflower: { id: 'bellflower', name: 'Violet Campanula Cluster', budget: 96,  flex: 0.75 },
  daisy:      { id: 'daisy',      name: 'Meadow Daisy Cluster',     budget: 88,  flex: 0.7 },
  lupine:     { id: 'lupine',     name: 'Lavender Lupine Spike',    budget: 110, flex: 0.65 },
  cosmos:     { id: 'cosmos',     name: 'Rose-Pink Cosmos Cluster', budget: 88,  flex: 0.85 },
  toonShrub:  { id: 'toonShrub',  name: 'Cel-Shaded Village Bush',  budget: 140, flex: 0.22 },
};

const _c = new THREE.Color();
function rgb(hex) {
  _c.set(hex);
  return [_c.r, _c.g, _c.b];
}

function lerpRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function createBuilder() {
  const pos = [], col = [], nrm = [];
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();

  function tri(p0, p1, p2, c0, c1 = c0, c2 = c0, upBias = 0.35) {
    pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    col.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
    vA.fromArray(p0); vB.fromArray(p1); vC.fromArray(p2);
    e1.subVectors(vB, vA); e2.subVectors(vC, vA);
    fn.crossVectors(e1, e2);
    if (upBias >= 0 && fn.y < 0) fn.negate();
    if (upBias > 0) fn.y = Math.max(fn.y, upBias);
    fn.normalize();
    nrm.push(fn.x, fn.y, fn.z, fn.x, fn.y, fn.z, fn.x, fn.y, fn.z);
  }

  function quad(p0, p1, p2, p3, c0, c1, c2, c3, upBias = 0.35) {
    tri(p0, p1, p2, c0, c1, c2, upBias);
    tri(p0, p2, p3, c0, c2, c3, upBias);
  }

  // Ported from refb-kit.js PartGeometryBuilder.addArchingLeaf:
  // Sculpts a broad, 3-segment gracefully arching botanical ribbon blade whose width
  // swells to a wide belly at t=0.38 (Math.sin(Math.pow(t, 0.72) * Math.PI)) and bows
  // horizontally/outward across the upper half so tips NEVER point up like spikes.
  function addArchingLeaf({
    baseX = 0,
    baseY = 0,
    baseZ = 0,
    yaw = 0,
    swirl = 0.14,
    pitch = 0.54,
    length = 0.72,
    width = 0.125,
    arch = 0.34,
    fold = 0.018,
    roll = 0.22,
    cBase,
    cMid,
    cTip,
  }) {
    const sampleRing = (t) => {
      const curYaw = yaw + swirl * t;
      const cosY = Math.cos(curYaw);
      const sinY = Math.sin(curYaw);
      const sideX = -sinY;
      const sideZ = cosY;

      const profile = Math.sin(Math.pow(t, 0.72) * Math.PI);
      const halfW = width * 0.5 * profile;
      const reach = length * t * Math.cos(pitch + t * arch * 0.6);
      const lift = length * (t * Math.sin(pitch) - t * t * arch);

      const cx = baseX + cosY * reach;
      const cy = baseY + (t === 0 ? 0.0 : Math.max(0.012, lift));
      const cz = baseZ + sinY * reach;
      const bank = halfW * Math.sin(roll) + fold * profile;

      return {
        center: [cx, cy, cz],
        left: [cx + sideX * halfW, Math.max(0.0, cy + bank), cz + sideZ * halfW],
        right: [cx - sideX * halfW, Math.max(0.0, cy + fold * profile * 0.5 - halfW * Math.sin(roll) * 0.5), cz - sideZ * halfW],
      };
    };

    const r0 = sampleRing(0.0);
    const r1 = sampleRing(0.36); // Wide swollen leaf belly (t ≈ 0.38)
    const r2 = sampleRing(0.72); // Broad upper arching ribbon crest
    const r3 = sampleRing(1.0);  // Outward-flowing ribbon tip (never a vertical spike)

    const col1 = lerpRgb(cBase, cMid, 0.55);
    const col2 = lerpRgb(cMid, cTip, 0.62);

    // 3 longitudinal segments (t: 0 -> 0.36 -> 0.72 -> 1.0) = 4 tris per broad arching blade
    tri(r0.center, r1.right, r1.left, cBase, col1, col1, 0.42);
    quad(r1.left, r1.right, r2.right, r2.left, col1, col1, col2, col2, 0.52);
    tri(r2.left, r2.right, r3.center, col2, col2, cTip, 0.64);
  }

  // Slender 3D orthogonal crossed stalk (4 tris): consistent botanical thickness from 360° and penetrates into disk
  function crossedStalk(x0, z0, x2, y2, z2, r0, r1, cBot, cTop, yaw = 0) {
    for (let p = 0; p < 2; p++) {
      const ang = yaw + 0.52 + p * (Math.PI * 0.5);
      const wx = -Math.sin(ang), wz = Math.cos(ang);
      const bL = [x0 - wx * r0, -0.008, z0 - wz * r0];
      const bR = [x0 + wx * r0, -0.008, z0 + wz * r0];
      const tR = [x2 + wx * r1, y2, z2 + wz * r1];
      const tL = [x2 - wx * r1, y2, z2 - wz * r1];
      quad(bL, bR, tR, tL, cBot, cBot, cTop, cTop, 0.42);
    }
  }

  // 3-segment shepherd's-crook arched stem (6 tris) with 3D diagonal cross-section so it never pinches to 1px
  function archedStem3Seg(x0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, r0, r1, r2, cBot, cMid, cTop, yaw) {
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const px = -dz, pz = dx;
    const wx0 = px * 0.78 + dx * 0.62, wz0 = pz * 0.78 + dz * 0.62;
    const wx1 = px * 0.62 - dx * 0.78, wz1 = pz * 0.62 - dz * 0.78;
    const bL = [x0 - wx0 * r0, -0.008, z0 - wz0 * r0], bR = [x0 + wx0 * r0, -0.008, z0 + wz0 * r0];
    const m1L = [x1 - wx1 * r1, y1, z1 - wz1 * r1],    m1R = [x1 + wx1 * r1, y1, z1 + wz1 * r1];
    const m2L = [x2 - wx0 * r2, y2, z2 - wz0 * r2],    m2R = [x2 + wx0 * r2, y2, z2 + wz0 * r2];
    const tL  = [x3 - wx1 * r2 * 0.9, y3, z3 - wz1 * r2 * 0.9];
    const tR  = [x3 + wx1 * r2 * 0.9, y3, z3 + wz1 * r2 * 0.9];
    quad(bL, bR, m1R, m1L, cBot, cBot, cMid, cMid, 0.28);
    quad(m1L, m1R, m2R, m2L, cMid, cMid, cTop, cTop, 0.35);
    quad(m2L, m2R, tR, tL, cTop, cTop, cTop, cTop, 0.38);
  }

  function leafDiamond(x0, y0, z0, yaw, len, width, archH, tipY, cBase, cMid, cTip) {
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const px = -dz, pz = dx;
    const root = [x0 - dx * 0.008, y0, z0 - dz * 0.008];
    const midL = [x0 + dx * len * 0.46 - px * width, y0 + archH, z0 + dz * len * 0.46 - pz * width];
    const midR = [x0 + dx * len * 0.46 + px * width, y0 + archH, z0 + dz * len * 0.46 + pz * width];
    const tip  = [x0 + dx * len, y0 + tipY, z0 + dz * len];
    tri(root, midR, midL, cBase, cMid, cMid, 0.55);
    tri(midL, midR, tip, cMid, cMid, cTip, 0.58);
  }

  function finish(id) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    geo.userData = { species: id, triangles: pos.length / 9, budget: SPECIES_SPECS[id].budget };
    return geo;
  }

  return { tri, quad, addArchingLeaf, crossedStalk, archedStem3Seg, leafDiamond, finish };
}

export function buildGrassTuft() {
  const b = createBuilder();
  // Ghibli meadow palette: deep teal-emerald root -> vibrant meadow green belly -> sunlit chartreuse arch crest
  const cRoot = rgb('#2f5e50');
  const cMid  = rgb('#62a34c');
  const cTipA = rgb('#bce06c');
  const cTipB = rgb('#a6d15e');

  // 7 broad, gracefully arching 3-segment blades radiating across a lush clump footprint.
  // Each blade rises at pitch 0.56..0.74, swells to a wide belly at t=0.36, arches across
  // a wide ribbon quad to t=0.72, and bows horizontally at t=1.0 (zero upright spikes).
  const blades = [
    { yaw: 0.18, rOff: 0.04, len: 0.92, wid: 0.136, pitch: 0.72, arch: 0.33, swirl:  0.18, roll:  0.24, tip: cTipA },
    { yaw: 1.08, rOff: 0.09, len: 0.80, wid: 0.128, pitch: 0.62, arch: 0.35, swirl: -0.16, roll: -0.22, tip: cTipB },
    { yaw: 1.98, rOff: 0.06, len: 0.88, wid: 0.138, pitch: 0.68, arch: 0.34, swirl:  0.15, roll:  0.26, tip: cTipA },
    { yaw: 2.88, rOff: 0.10, len: 0.72, wid: 0.120, pitch: 0.56, arch: 0.35, swirl: -0.18, roll: -0.20, tip: cTipB },
    { yaw: 3.78, rOff: 0.05, len: 0.84, wid: 0.132, pitch: 0.64, arch: 0.34, swirl:  0.16, roll:  0.22, tip: cTipA },
    { yaw: 4.68, rOff: 0.11, len: 0.68, wid: 0.116, pitch: 0.52, arch: 0.34, swirl: -0.14, roll: -0.24, tip: cTipB },
    { yaw: 5.52, rOff: 0.07, len: 0.78, wid: 0.126, pitch: 0.60, arch: 0.34, swirl:  0.17, roll:  0.20, tip: cTipA },
  ];

  for (const d of blades) {
    b.addArchingLeaf({
      baseX: Math.cos(d.yaw) * d.rOff,
      baseY: 0.0,
      baseZ: Math.sin(d.yaw) * d.rOff,
      yaw: d.yaw,
      swirl: d.swirl,
      pitch: d.pitch,
      length: d.len,
      width: d.wid,
      arch: d.arch,
      fold: 0.018,
      roll: d.roll,
      cBase: cRoot,
      cMid: cMid,
      cTip: d.tip,
    });
  }
  return b.finish('grassTuft'); // 28 tris (<= 48 budget)
}

export function buildBellflower() {
  const b = createBuilder();
  const cStemB = rgb('#31692c'), cStemM = rgb('#58a33e'), cStemT = rgb('#86ce58');
  const cCalyx = rgb('#5aa63e'), cCupB = rgb('#6b48e0'), cCupM = rgb('#9372f4'), cCupT = rgb('#c8b2ff');
  const cGold = rgb('#ffe566'), cGoldTop = rgb('#f59e0b');

  for (let i = 0; i < 6; i++) {
    const a = i * 1.047 + 0.25;
    b.leafDiamond(Math.cos(a) * 0.015, 0.008, Math.sin(a) * 0.015, a, 0.20 + (i % 2) * 0.03, 0.055, 0.08, 0.035, cStemB, cStemM, cStemT);
  }

  const stems = [
    { a: -0.22, h: 0.48, arch: 0.16, scale: 1.00 },
    { a: 1.92,  h: 0.42, arch: 0.17, scale: 0.93 },
    { a: 3.72,  h: 0.36, arch: 0.15, scale: 0.87 },
  ];
  for (const s of stems) {
    const dx = Math.cos(s.a), dz = Math.sin(s.a), px = -dz, pz = dx;
    const x1 = dx * s.arch * 0.38, y1 = s.h * 0.62, z1 = dz * s.arch * 0.38;
    const x2 = dx * s.arch * 0.78, y2 = s.h * 1.03, z2 = dz * s.arch * 0.78;
    const tx = dx * s.arch,        ty = s.h * 0.91, tz = dz * s.arch;
    b.archedStem3Seg(dx * 0.014, dz * 0.014, x1, y1, z1, x2, y2, z2, tx, ty, tz, 0.019, 0.015, 0.013, cStemB, cStemM, cStemT, s.a);

    const axX = dx * 0.46, axY = -0.88, axZ = dz * 0.46;
    const upX = dx * 0.88, upY = 0.46,  upZ = dz * 0.88;
    const ringPt = (dist, rad, ang) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      return [
        tx + axX * dist + (px * ca + upX * sa) * rad * s.scale,
        ty + axY * dist + (upY * sa) * rad * s.scale,
        tz + axZ * dist + (pz * ca + upZ * sa) * rad * s.scale,
      ];
    };
    const apex = [tx - axX * 0.012, ty - axY * 0.012, tz - axZ * 0.012];
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * Math.PI * 2, a1 = ((i + 1) / 5) * Math.PI * 2, aMid = (a0 + a1) * 0.5;
      const k0 = ringPt(0.044, 0.052, a0), k1 = ringPt(0.044, 0.052, a1);
      const r0 = ringPt(0.125, 0.090, a0), r1 = ringPt(0.125, 0.090, a1);
      b.tri(apex, k0, k1, cCalyx, cCupB, cCupB, 0.45);
      b.quad(k0, k1, r1, r0, cCupB, cCupB, cCupM, cCupM, 0.52);
      b.tri(r0, r1, ringPt(0.172, 0.130, aMid), cCupM, cCupM, cCupT, 0.68);
    }
    const stTop = [tx + axX * 0.04, ty + axY * 0.04, tz + axZ * 0.04];
    const stTip = [tx + axX * 0.165 * s.scale, ty + axY * 0.165 * s.scale, tz + axZ * 0.165 * s.scale];
    b.tri(stTop, ringPt(0.12, 0.034, 0.0), stTip, cGoldTop, cGold, cGold, 0.78);
    b.tri(stTop, ringPt(0.12, 0.034, 2.1), stTip, cGoldTop, cGold, cGold, 0.78);
  }
  return b.finish('bellflower'); // 96 tris (<= 96)
}

export function buildDaisy() {
  const b = createBuilder();
  const cStemB = rgb('#346e2f'), cStemM = rgb('#5da840'), cStemT = rgb('#8ad158');
  const cPetalBase = rgb('#ebe3cc'), cPetalMid = rgb('#fbf8ef'), cPetalTip = rgb('#ffffff');
  const cDiscRim = rgb('#d97706'), cDisc = rgb('#f59e0b'), cDiscTop = rgb('#fde047');

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.35;
    b.leafDiamond(Math.cos(a) * 0.016, 0.008, Math.sin(a) * 0.016, a, 0.19, 0.052, 0.075, 0.035, cStemB, cStemM, cStemT);
  }

  const heads = [
    { a: -0.18, r: 0.105, h: 0.44, tilt: 0.22, scale: 1.00 },
    { a: 2.05,  r: 0.122, h: 0.36, tilt: 0.26, scale: 0.92 },
    { a: 4.12,  r: 0.115, h: 0.29, tilt: 0.25, scale: 0.86 },
  ];
  for (const h of heads) {
    const dx = Math.cos(h.a), dz = Math.sin(h.a), px = -dz, pz = dx;
    const cx = dx * h.r, cy = h.h, cz = dz * h.r;
    // Slender 3D crossed stalk (r0=0.0085, r1=0.0075) penetrates cleanly into the receptacle disk
    b.crossedStalk(dx * 0.012, dz * 0.012, cx, cy + 0.012, cz, 0.0085, 0.0075, cStemB, cStemT, h.a);

    const ny = Math.cos(h.tilt), nr = Math.sin(h.tilt);
    const ux = dx * nr, uy = ny, uz = dz * nr, tx = dx * ny, ty = -nr, tz = dz * ny;
    const pt = (rad, ang, lift) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      return [
        cx + ((px * ca + tx * sa) * rad + ux * lift) * h.scale,
        cy + (ty * sa * rad + uy * lift) * h.scale,
        cz + ((pz * ca + tz * sa) * rad + uz * lift) * h.scale,
      ];
    };
    // Golden dome sits cleanly above the inner petal collar (lift 0.013 -> 0.038) so zero orange bleeds underneath
    const discCenter = pt(0.0, 0.0, 0.038);
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
      b.tri(discCenter, pt(0.055, a0, 0.013), pt(0.055, a1, 0.013), cDiscTop, cDisc, cDiscRim, 0.80);
    }
    for (let i = 0; i < 8; i++) {
      const aMid = ((i + 0.5) / 8) * Math.PI * 2;
      const pRoot = pt(0.012, aMid, 0.006);
      const pL = pt(0.104, aMid - 0.34, 0.014), pR = pt(0.104, aMid + 0.34, 0.014);
      const pTip = pt(0.162, aMid, 0.010);
      b.tri(pRoot, pR, pL, cPetalBase, cPetalMid, cPetalMid, 0.86);
      b.tri(pL, pR, pTip, cPetalMid, cPetalMid, cPetalTip, 0.90);
    }
  }
  return b.finish('daisy'); // 88 tris (<= 88)
}

export function buildLupine() {
  const b = createBuilder();
  const cStemB = rgb('#32692d'), cStemM = rgb('#58a33e'), cStemT = rgb('#85cb56');
  const cIndigo = rgb('#5838d4'), cViolet = rgb('#7c5ce8'), cLav = rgb('#a482fa'), cLilac = rgb('#dfc4ff');

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    b.leafDiamond(Math.cos(a) * 0.022, 0.010, Math.sin(a) * 0.022, a, 0.21, 0.050, 0.082, 0.040, cStemB, cStemM, cStemT);
  }

  const spikes = [
    { x0: 0.00,  z0: 0.00,  dx: 0.01,  dz: 0.01,  baseY: 0.13, topY: 0.56, r0: 0.086, phase: 0.1 },
    { x0: -0.06, z0: 0.03,  dx: -0.10, dz: 0.05,  baseY: 0.11, topY: 0.46, r0: 0.076, phase: 1.1 },
    { x0: 0.06,  z0: -0.03, dx: 0.09,  dz: -0.06, baseY: 0.10, topY: 0.42, r0: 0.072, phase: 2.2 },
  ];
  const tierColors = [
    [cIndigo, cViolet, cLav],
    [cIndigo, cViolet, cLav],
    [cViolet, cLav,    cLilac],
    [cLav,    cLilac,  cLilac],
  ];

  for (const s of spikes) {
    const spine = (u) => [
      s.x0 + s.dx * u,
      s.baseY + (s.topY - s.baseY) * u,
      s.z0 + s.dz * u,
    ];
    const topStem = spine(0.75);
    b.crossedStalk(s.x0 * 0.45, s.z0 * 0.45, topStem[0], topStem[1], topStem[2], 0.014, 0.010, cStemB, cStemT, s.phase);

    for (let t = 0; t < 4; t++) {
      const uB = t * 0.185;
      const uM = uB + 0.115;
      const uT = uB + 0.265;
      const pB = spine(uB), pM = spine(uM), pT = spine(uT);
      const rad = s.r0 * (1.0 - t * 0.12);
      const [cB, cM, cT] = tierColors[t];
      const rot = s.phase + t * (Math.PI / 3);

      const ringB = [], ringM = [], ringT = [];
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + rot;
        const ca = Math.cos(a), sa = Math.sin(a);
        ringB.push([pB[0] + ca * rad * 0.52, pB[1], pB[2] + sa * rad * 0.52]);
        ringM.push([pM[0] + ca * rad,        pM[1], pM[2] + sa * rad]);
        ringT.push([pT[0] + ca * rad * 0.48, pT[1], pT[2] + sa * rad * 0.48]);
      }
      for (let k = 0; k < 3; k++) {
        const n = (k + 1) % 3;
        b.tri(ringB[k], ringM[n], ringM[k], cB, cM, cM, 0.38);
        b.tri(ringM[k], ringM[n], ringT[k], cM, cM, cT, 0.62);
      }
    }
    const pCap = spine(0.73), apex = spine(1.0);
    const br = s.r0 * 0.46;
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2 + s.phase + 0.5;
      const a1 = ((k + 1) / 3) * Math.PI * 2 + s.phase + 0.5;
      b.tri(
        [pCap[0] + Math.cos(a0) * br, pCap[1], pCap[2] + Math.sin(a0) * br],
        [pCap[0] + Math.cos(a1) * br, pCap[1], pCap[2] + Math.sin(a1) * br],
        apex, cLav, cLav, cLilac, 0.68
      );
    }
  }
  return b.finish('lupine'); // 109 tris (<= 110)
}

export function buildCosmos() {
  const b = createBuilder();
  const cStemB = rgb('#326b2e'), cStemM = rgb('#5aa340'), cStemT = rgb('#8ad158');
  const cRoseB = rgb('#c84276'), cRoseM = rgb('#f074a4'), cRoseT = rgb('#ffc2dc');
  const cGoldRim = rgb('#d97706'), cGold = rgb('#f59e0b'), cGoldTop = rgb('#fde047');

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    b.leafDiamond(Math.cos(a) * 0.016, 0.015 + (i % 2) * 0.03, Math.sin(a) * 0.016, a, 0.18, 0.042, 0.072, 0.038, cStemB, cStemM, cStemT);
  }

  const blooms = [
    { a: -0.25, r: 0.105, h: 0.45, tilt: 0.24, scale: 1.00 },
    { a: 1.98,  r: 0.128, h: 0.37, tilt: 0.28, scale: 0.92 },
    { a: 4.05,  r: 0.118, h: 0.30, tilt: 0.26, scale: 0.86 },
  ];
  for (const h of blooms) {
    const dx = Math.cos(h.a), dz = Math.sin(h.a), px = -dz, pz = dx;
    const cx = dx * h.r, cy = h.h, cz = dz * h.r;
    // Slender 3D crossed stalk (r0=0.008, r1=0.007) penetrates cleanly into the receptacle disk
    b.crossedStalk(dx * 0.012, dz * 0.012, cx, cy + 0.012, cz, 0.008, 0.007, cStemB, cStemT, h.a);

    const ny = Math.cos(h.tilt), nr = Math.sin(h.tilt);
    const ux = dx * nr, uy = ny, uz = dz * nr, tx = dx * ny, ty = -nr, tz = dz * ny;
    const pt = (rad, ang, lift) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      return [
        cx + ((px * ca + tx * sa) * rad + ux * lift) * h.scale,
        cy + (ty * sa * rad + uy * lift) * h.scale,
        cz + ((pz * ca + tz * sa) * rad + uz * lift) * h.scale,
      ];
    };
    const center = pt(0.0, 0.0, 0.036);
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
      b.tri(center, pt(0.050, a0, 0.014), pt(0.050, a1, 0.014), cGoldTop, cGold, cGoldRim, 0.80);
    }
    for (let i = 0; i < 8; i++) {
      const aMid = ((i + 0.5) / 8) * Math.PI * 2;
      const pRoot = pt(0.012, aMid, 0.005);
      const pL = pt(0.114, aMid - 0.36, 0.026), pR = pt(0.114, aMid + 0.36, 0.026);
      const pTip = pt(0.162, aMid, 0.034);
      b.tri(pRoot, pR, pL, cRoseB, cRoseM, cRoseM, 0.82);
      b.tri(pL, pR, pTip, cRoseM, cRoseM, cRoseT, 0.88);
    }
  }
  return b.finish('cosmos'); // 88 tris (<= 88)
}

export function buildToonShrub() {
  const b = createBuilder();
  const cDark = rgb('#2f6829'), cMid = rgb('#52ab3c'), cTop = rgb('#80cf52'), cCrown = rgb('#a8e868');
  const cPink = rgb('#f4649a'), cPinkT = rgb('#ffc8df');
  const cCream = rgb('#f5edd6'), cCreamT = rgb('#ffffff');
  const cGold = rgb('#f59e0b'), cGoldT = rgb('#fde672');

  // 4 overlapping foliage lobes (segments: 7 + 6 + 6 + 6 = 25 columns * 4 tris = 100 tris)
  const domes = [
    { cx: 0.00,  cy: 0.22, cz: -0.04, rx: 0.38, ry: 0.26, rz: 0.36, rot: 0.0, segs: 7 },
    { cx: -0.21, cy: 0.16, cz: 0.06,  rx: 0.29, ry: 0.20, rz: 0.28, rot: 0.5, segs: 6 },
    { cx: 0.21,  cy: 0.17, cz: 0.05,  rx: 0.30, ry: 0.21, rz: 0.28, rot: 1.1, segs: 6 },
    { cx: 0.01,  cy: 0.15, cz: 0.19,  rx: 0.27, ry: 0.18, rz: 0.25, rot: 1.7, segs: 6 },
  ];
  for (const d of domes) {
    const S = d.segs;
    const topPt = [d.cx, d.cy + d.ry, d.cz];
    const rUpper = [], rMid = [], rGround = [];
    for (let i = 0; i < S; i++) {
      const aU = (i / S) * Math.PI * 2 + d.rot + 0.20;
      const aM = (i / S) * Math.PI * 2 + d.rot;
      const aG = ((i + 0.5) / S) * Math.PI * 2 + d.rot;
      rUpper.push([d.cx + Math.cos(aU) * d.rx * 0.78, d.cy + d.ry * 0.52, d.cz + Math.sin(aU) * d.rz * 0.78]);
      rMid.push([d.cx + Math.cos(aM) * d.rx * 1.02, d.cy * 0.52, d.cz + Math.sin(aM) * d.rz * 1.02]);
      rGround.push([d.cx + Math.cos(aG) * d.rx * 0.88, 0.0, d.cz + Math.sin(aG) * d.rz * 0.88]);
    }
    for (let i = 0; i < S; i++) {
      const n = (i + 1) % S;
      b.tri(topPt, rUpper[i], rUpper[n], cCrown, cTop, cTop, 0.48);
      b.quad(rUpper[i], rMid[i], rMid[n], rUpper[n], cTop, cMid, cMid, cTop, 0.22);
      b.tri(rMid[i], rGround[i], rMid[n], cMid, cDark, cMid, 0.10);
    }
  }

  // 10 dome-hugging 4-petal blossom rosettes (40 tris -> 140 total): raised center + outer petals curving down onto dome
  const blossoms = [
    { d: 0, yaw: 0.85,  lat: 0.82, cC: cGoldT,  cP: cPink,  cT: cPinkT },
    { d: 0, yaw: 2.35,  lat: 0.80, cC: cGold,   cP: cCream, cT: cCreamT },
    { d: 0, yaw: 3.95,  lat: 0.82, cC: cGoldT,  cP: cPink,  cT: cPinkT },
    { d: 0, yaw: 5.35,  lat: 0.80, cC: cCreamT, cP: cGold,  cT: cGoldT },
    { d: 1, yaw: 1.70,  lat: 0.82, cC: cGoldT,  cP: cPink,  cT: cPinkT },
    { d: 1, yaw: 3.50,  lat: 0.82, cC: cGold,   cP: cCream, cT: cCreamT },
    { d: 2, yaw: 0.55,  lat: 0.82, cC: cGoldT,  cP: cPink,  cT: cPinkT },
    { d: 2, yaw: 5.50,  lat: 0.82, cC: cCreamT, cP: cGold,  cT: cGoldT },
    { d: 3, yaw: 1.15,  lat: 0.80, cC: cGold,   cP: cCream, cT: cCreamT },
    { d: 3, yaw: 2.05,  lat: 0.80, cC: cGoldT,  cP: cPink,  cT: cPinkT },
  ];
  const vN = new THREE.Vector3(), vT1 = new THREE.Vector3(), vT2 = new THREE.Vector3(), vUp = new THREE.Vector3(0, 1, 0);
  for (const bl of blossoms) {
    const d = domes[bl.d];
    const cosL = Math.sqrt(1 - bl.lat * bl.lat);
    const nx = Math.cos(bl.yaw) * cosL, ny = bl.lat, nz = Math.sin(bl.yaw) * cosL;
    const bx = d.cx + nx * d.rx * 0.84, by = d.cy + ny * d.ry * 0.84, bz = d.cz + nz * d.rz * 0.84;
    vN.set(nx, ny, nz).normalize();
    vT1.crossVectors(vUp, vN).normalize();
    vT2.crossVectors(vN, vT1).normalize();

    const center = [bx + vN.x * 0.024, by + vN.y * 0.024, bz + vN.z * 0.024];
    const rad = 0.058;
    for (let k = 0; k < 4; k++) {
      const aMid = (k / 4) * Math.PI * 2 + bl.yaw * 0.5;
      const aL = aMid - 0.55, aR = aMid + 0.55;
      const pL = [
        bx + vN.x * 0.004 + (vT1.x * Math.cos(aL) + vT2.x * Math.sin(aL)) * rad,
        by + vN.y * 0.004 + (vT1.y * Math.cos(aL) + vT2.y * Math.sin(aL)) * rad,
        bz + vN.z * 0.004 + (vT1.z * Math.cos(aL) + vT2.z * Math.sin(aL)) * rad,
      ];
      const pR = [
        bx + vN.x * 0.004 + (vT1.x * Math.cos(aR) + vT2.x * Math.sin(aR)) * rad,
        by + vN.y * 0.004 + (vT1.y * Math.cos(aR) + vT2.y * Math.sin(aR)) * rad,
        bz + vN.z * 0.004 + (vT1.z * Math.cos(aR) + vT2.z * Math.sin(aR)) * rad,
      ];
      b.tri(center, pL, pR, bl.cC, bl.cP, bl.cT, 0.82);
    }
  }
  return b.finish('toonShrub'); // 140 tris (<= 140)
}

export function createSpeciesGeometries() {
  return {
    grassTuft: buildGrassTuft(),
    bellflower: buildBellflower(),
    daisy: buildDaisy(),
    lupine: buildLupine(),
    cosmos: buildCosmos(),
    toonShrub: buildToonShrub(),
  };
}
