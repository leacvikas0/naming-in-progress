import * as THREE from 'three';
import { BLENDER_VOLUMETRIC_FLOWERS } from './blender-flower-data.js';

function buildFromBlenderData(id) {
  const data = BLENDER_VOLUMETRIC_FLOWERS[id];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.pos.slice(), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.nrm.slice(), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(data.col.slice(), 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  geo.userData = { species: id, triangles: data.triangles, budget: SPECIES_SPECS[id].budget };
  return geo;
}

/**
 * Haru-machi High-Volume 3D Botanical Species Kit (`world/assets/flowers/species.js`).
 *
 * Rebuilt from scratch for the 1.46 TFLOPS Adreno 732 (Xiaomi Pad 7) & RX 6700 Desktop:
 * - Zero flat 1-triangle toy petals: every flower petal is a 3D pillowed, cupped shell
 *   (`addPlush3DPetal`) with a raised midrib cushion, curved lateral wings, and rolled lip
 *   so petals have real physical volume from all 360° and side-profile views.
 * - Zero rigid 4-way symmetry: each cluster combines an irregular basal leaf cushion,
 *   5–6 curved 3D tubular stems at uneven heights and organic leans, fully opened hero
 *   blooms, half-opened cups, and 2–3 plump unopened flower buds.
 * - `grassTuft` (28 triangles, ~0.85m 3-clump footprint): 10 slender (`4.2cm` wide),
 *   gracefully arched 2-segment & 1-segment grass ribbons with ground-matched root colors.
 */

export const SPECIES_SPECS = {
  grassTuft:   { id: 'grassTuft',   name: 'Meadow Grass Tuft',        budget: 70,  flex: 1.0 },
  crimsonRose: { id: 'crimsonRose', name: 'Crimson Rose Cluster',     budget: 620, flex: 0.68 },
  bellflower:  { id: 'bellflower',  name: 'Violet Campanula Cluster', budget: 460, flex: 0.75 },
  daisy:       { id: 'daisy',       name: 'Meadow Daisy Cluster',     budget: 480, flex: 0.70 },
  lupine:      { id: 'lupine',      name: 'Lavender Lupine Spike',    budget: 520, flex: 0.65 },
  cosmos:      { id: 'cosmos',      name: 'Rose-Pink Cosmos Cluster', budget: 480, flex: 0.82 },
  toonShrub:   { id: 'toonShrub',   name: 'Cel-Shaded Village Bush',  budget: 560, flex: 0.22 },
};

const TAU = Math.PI * 2;
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

  // Smooth per-vertex normal triangle (used for Ghost of Tsushima Cubic-Bezier curved grass blades)
  function triSmooth(p0, p1, p2, c0, c1, c2, n0, n1, n2) {
    pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    col.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
    nrm.push(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], n2[0], n2[1], n2[2]);
  }

  function quad(p0, p1, p2, p3, c0, c1, c2, c3, upBias = 0.35) {
    tri(p0, p1, p2, c0, c1, c2, upBias);
    tri(p0, p2, p3, c0, c2, c3, upBias);
  }

  /**
   * Ghost of Tsushima (GDC 2021, Eric Wohllaib) 7-vertex / 5-triangle Cubic-Bezier Grass Blade:
   * - Evaluates a true 4-control-point Cubic Bezier spine B(t) at 4 stations (t = 0.0, 0.33, 0.67, 1.0).
   * - Slender parallel-sided width profile (halfW ~ 1.6cm) along the lower 67% of the stalk,
   *   tapering gracefully only near the curved tip so blades never look like pointy triangles.
   * - Analytical Bezier derivative dB/dt crossed with the width vector gives the exact curve normal,
   *   which is then tilted outward on the left and right edges (+/- sideTilt) so the GPU interpolates
   *   a smooth, rounded 3D cross-section across the blade without a harsh polygon crease.
   */
  function addGotBezierGrassBlade5Tri({
    x0 = 0,
    y0 = 0,
    z0 = 0,
    yaw = 0,
    reach = 0.24,
    tipY = 0.34,
    bend = 0.26,
    sideCurve = 0.015,
    halfW = 0.0165,
    cRoot,
    cMid,
    cTip,
  }) {
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const sx = -dz, sz = dx; // Orthogonal width direction

    // Cubic Bezier control points P0 (base), P1 (steep lower rise), P2 (high arching knee), P3 (overhanging soft tip)
    const P0 = [x0, y0, z0];
    const P1 = [
      x0 + dx * (reach * 0.18),
      y0 + tipY * (0.48 + bend * 0.24),
      z0 + dz * (reach * 0.18),
    ];
    const P2 = [
      x0 + dx * (reach * 0.60) + sx * sideCurve,
      y0 + tipY * (0.98 + bend * 0.30),
      z0 + dz * (reach * 0.60) + sz * sideCurve,
    ];
    const P3 = [
      x0 + dx * reach + sx * (sideCurve * 0.7),
      y0 + tipY * 0.80,
      z0 + dz * reach + sz * (sideCurve * 0.7),
    ];

    const evalBezier = (t) => {
      const it = 1.0 - t;
      const b0 = it * it * it;
      const b1 = 3.0 * it * it * t;
      const b2 = 3.0 * it * t * t;
      const b3 = t * t * t;
      return [
        b0 * P0[0] + b1 * P1[0] + b2 * P2[0] + b3 * P3[0],
        b0 * P0[1] + b1 * P1[1] + b2 * P2[1] + b3 * P3[1],
        b0 * P0[2] + b1 * P1[2] + b2 * P2[2] + b3 * P3[2],
      ];
    };

    const evalDeriv = (t) => {
      const it = 1.0 - t;
      const d0 = 3.0 * it * it;
      const d1 = 6.0 * it * t;
      const d2 = 3.0 * t * t;
      return [
        d0 * (P1[0] - P0[0]) + d1 * (P2[0] - P1[0]) + d2 * (P3[0] - P2[0]),
        d0 * (P1[1] - P0[1]) + d1 * (P2[1] - P1[1]) + d2 * (P3[1] - P2[1]),
        d0 * (P1[2] - P0[2]) + d1 * (P2[2] - P1[2]) + d2 * (P3[2] - P2[2]),
      ];
    };

    const makeEdgeNormals = (t) => {
      const d = evalDeriv(t);
      // Cross width vector (sx, 0, sz) with tangent d to get upward-facing curve normal
      let nx = -sz * d[1];
      let ny = sz * d[0] - sx * d[2];
      let nz = sx * d[1];
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const len = Math.hypot(nx, ny, nz) || 1.0;
      nx /= len; ny /= len; nz /= len;

      // Tilt left and right vertex normals outward for smooth rounded 3D leaf relief
      const tilt = 0.42;
      const nlx = nx - sx * tilt, nly = Math.max(0.35, ny + 0.28), nlz = nz - sz * tilt;
      const lLen = Math.hypot(nlx, nly, nlz) || 1.0;
      const nrx = nx + sx * tilt, nry = Math.max(0.35, ny + 0.28), nrz = nz + sz * tilt;
      const rLen = Math.hypot(nrx, nry, nrz) || 1.0;
      const ncx = nx, ncy = Math.max(0.42, ny + 0.34), ncz = nz;
      const cLen = Math.hypot(ncx, ncy, ncz) || 1.0;

      return {
        nL: [nlx / lLen, nly / lLen, nlz / lLen],
        nR: [nrx / rLen, nry / rLen, nrz / rLen],
        nC: [ncx / cLen, ncy / cLen, ncz / cLen],
      };
    };

    // Option 4 Smooth Sword-Leaf Tussock profile: widens at lower belly (t=0.28), tapers smoothly through upper arch (t=0.64 -> 1.0)
    const tStations = [0.0, 0.28, 0.64, 1.0];
    const wFactors  = [0.88, 1.00, 0.48, 0.0];
    const cols = [
      cRoot,
      lerpRgb(cRoot, cMid, 0.68),
      lerpRgb(cMid, cTip, 0.58),
      cTip,
    ];

    const L = [], R = [], NL = [], NR = [];
    let tipPt = null, tipNrm = null;

    for (let k = 0; k < 4; k++) {
      const t = tStations[k];
      const cPt = evalBezier(t);
      const { nL, nR, nC } = makeEdgeNormals(t);
      if (k === 3) {
        tipPt = cPt;
        tipNrm = nC;
      } else {
        const w = halfW * wFactors[k];
        L.push([cPt[0] - sx * w, cPt[1], cPt[2] - sz * w]);
        R.push([cPt[0] + sx * w, cPt[1], cPt[2] + sz * w]);
        NL.push(nL);
        NR.push(nR);
      }
    }

    // Segment 0 (t = 0.00 -> 0.34): 2 triangles
    triSmooth(L[0], R[0], R[1], cols[0], cols[0], cols[1], NL[0], NR[0], NR[1]);
    triSmooth(L[0], R[1], L[1], cols[0], cols[1], cols[1], NL[0], NR[1], NL[1]);

    // Segment 1 (t = 0.34 -> 0.68): 2 triangles
    triSmooth(L[1], R[1], R[2], cols[1], cols[1], cols[2], NL[1], NR[1], NR[2]);
    triSmooth(L[1], R[2], L[2], cols[1], cols[2], cols[2], NL[1], NR[2], NL[2]);

    // Segment 2 (t = 0.68 -> 1.00): 1 smooth tip triangle = 5 triangles total
    triSmooth(L[2], R[2], tipPt, cols[2], cols[2], cols[3], NL[2], NR[2], tipNrm);
  }

  // 3D Curved Tubular Stem (4-sided or 5-sided 2-segment curved stalk = 16 tris)
  function addCurved3DStem(x0, z0, x1, y1, z1, x2, y2, z2, r0, r1, r2, cBot, cMid, cTop, sides = 4) {
    const pts = [
      [x0, 0.0, z0],
      [x1, y1, z1],
      [x2, y2, z2],
    ];
    const rads = [r0, r1, r2];
    const cols = [cBot, cMid, cTop];
    const rings = [];

    for (let s = 0; s < 3; s++) {
      const p = pts[s];
      const nextP = s < 2 ? pts[s + 1] : pts[s];
      const prevP = s > 0 ? pts[s - 1] : pts[s];
      const tx = nextP[0] - prevP[0];
      const ty = Math.max(0.05, nextP[1] - prevP[1]);
      const tz = nextP[2] - prevP[2];
      const tLen = Math.hypot(tx, ty, tz) || 1;
      const ux = tx / tLen, uy = ty / tLen, uz = tz / tLen;

      // Orthogonal basis around stem tangent
      let rx = -uz, rz = ux;
      const rLen = Math.hypot(rx, rz) || 1;
      rx /= rLen; rz /= rLen;
      const fx = uy * rz, fy = uz * rx - ux * rz, fz = -uy * rx;

      const ring = [];
      const r = rads[s];
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * TAU;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        ring.push([
          p[0] + (rx * ca + fx * sa) * r,
          Math.max(0.0, p[1] + fy * sa * r),
          p[2] + (rz * ca + fz * sa) * r,
        ]);
      }
      rings.push({ ring, col: cols[s] });
    }

    for (let s = 0; s < 2; s++) {
      const rA = rings[s].ring, cA = rings[s].col;
      const rB = rings[s + 1].ring, cB = rings[s + 1].col;
      for (let k = 0; k < sides; k++) {
        const nk = (k + 1) % sides;
        quad(rA[k], rA[nk], rB[nk], rB[k], cA, cA, cB, cB, 0.25);
      }
    }
  }

  // 3D Sculpted Basal Leaf with Raised Midrib Cushion & Rolled Tip (4 tris)
  function addSculpted3DLeaf(x0, y0, z0, yaw, len, wid, archH, tipY, cBase, cMid, cTip) {
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const px = -dz, pz = dx;
    const root  = [x0, Math.max(0.0, y0), z0];
    const midC  = [x0 + dx * len * 0.45, y0 + archH + wid * 0.26, z0 + dz * len * 0.45];
    const midL  = [x0 + dx * len * 0.42 - px * wid, Math.max(0.005, y0 + archH * 0.72), z0 + dz * len * 0.42 - pz * wid];
    const midR  = [x0 + dx * len * 0.42 + px * wid, Math.max(0.005, y0 + archH * 0.72), z0 + dz * len * 0.42 + pz * wid];
    const tip   = [x0 + dx * len, Math.max(0.008, y0 + tipY), z0 + dz * len];

    tri(root, midR, midC, cBase, cMid, lerpRgb(cMid, cTip, 0.4), 0.48);
    tri(root, midC, midL, cBase, lerpRgb(cMid, cTip, 0.4), cMid, 0.48);
    tri(midC, midR, tip, lerpRgb(cMid, cTip, 0.4), cMid, cTip, 0.56);
    tri(midL, midC, tip, cMid, lerpRgb(cMid, cTip, 0.4), cTip, 0.56);
  }

  /**
   * Sculpts a Plush 3D Cupped & Pillowed Flower Petal (`addPlush3DPetal`, 6 triangles):
   * - Has a raised 3D central cushion/midrib (`thickness`) AND cupped lateral wings + rolled lip
   *   so from every angle (including 0° side profile) the petal has soft, plump 3D thickness!
   */
  function addPlush3DPetal({
    center,
    headAxis,    // [ux, uy, uz] normalized flower head orientation
    petalYaw,    // angle around headAxis
    pitch,       // upward cup angle (0 = flat out, 1.1 = tight inner cup)
    length = 0.095,
    width = 0.058,
    thickness = 0.018,
    curl = 0.024,
    cBase,
    cMid,
    cTip,
  }) {
    const up = new THREE.Vector3(...headAxis).normalize();
    const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tRight = new THREE.Vector3().crossVectors(up, ref).normalize();
    const tFwd = new THREE.Vector3().crossVectors(tRight, up).normalize();

    const cy = Math.cos(petalYaw), sy = Math.sin(petalYaw);
    // Outward radial direction of this petal in flower plane
    const radDir = tRight.clone().multiplyScalar(cy).addScaledVector(tFwd, sy);
    // Lateral width direction of this petal
    const latDir = tFwd.clone().multiplyScalar(cy).addScaledVector(tRight, -sy);

    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Petal longitudinal axis & normal axis
    const pLong = radDir.clone().multiplyScalar(cp).addScaledVector(up, sp);
    const pNorm = up.clone().multiplyScalar(cp).addScaledVector(radDir, -sp);

    const pt = (along, lat, normOff) => [
      center[0] + pLong.x * along + latDir.x * lat + pNorm.x * normOff,
      Math.max(0.01, center[1] + pLong.y * along + latDir.y * lat + pNorm.y * normOff),
      center[2] + pLong.z * along + latDir.z * lat + pNorm.z * normOff,
    ];

    const vBase  = pt(0.0, 0.0, 0.0);
    // Mid-belly: raised central cushion + cupped lateral wings (giving true 3D thickness!)
    const vMidC  = pt(length * 0.48, 0.0, -thickness * 0.85); // outward pillowed belly
    const vMidL  = pt(length * 0.44, -width * 0.72, thickness * 0.45);
    const vMidR  = pt(length * 0.44,  width * 0.72, thickness * 0.45);
    // Upper-outer rolled lip
    const vTipL  = pt(length * 0.84, -width * 0.56, -curl * 0.4);
    const vTipR  = pt(length * 0.84,  width * 0.56, -curl * 0.4);
    const vTipC  = pt(length * 1.00,  0.0, -curl);

    const cBelly = lerpRgb(cMid, cTip, 0.35);

    tri(vBase, vMidR, vMidC, cBase, cMid, cBelly, 0.32);
    tri(vBase, vMidC, vMidL, cBase, cBelly, cMid, 0.32);
    tri(vMidC, vMidR, vTipR, cBelly, cMid, cTip, 0.38);
    tri(vMidL, vMidC, vTipL, cMid, cBelly, cTip, 0.38);
    tri(vMidC, vTipR, vTipC, cBelly, cTip, cTip, 0.42);
    tri(vTipL, vMidC, vTipC, cTip, cBelly, cTip, 0.42);
  }

  // Plump 3D Half-Opened Flower Bud with Green Sepals (18 tris)
  function addPlump3DBud(center, headAxis, radius, height, cCalyx, cOuter, cInner) {
    for (let i = 0; i < 3; i++) {
      addPlush3DPetal({
        center,
        headAxis,
        petalYaw: (i / 3) * TAU + 0.3,
        pitch: 1.05,
        length: height,
        width: radius * 0.85,
        thickness: radius * 0.42,
        curl: -radius * 0.18,
        cBase: cCalyx,
        cMid: cOuter,
        cTip: cInner,
      });
    }
  }

  // 3D Domed Flower Center Disk (10 tris)
  function add3DDomedCenter(center, headAxis, radius, domeH, cRim, cTop) {
    const up = new THREE.Vector3(...headAxis).normalize();
    const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tRight = new THREE.Vector3().crossVectors(up, ref).normalize();
    const tFwd = new THREE.Vector3().crossVectors(tRight, up).normalize();

    const apex = [
      center[0] + up.x * domeH,
      center[1] + up.y * domeH,
      center[2] + up.z * domeH,
    ];
    const sides = 7;
    const ring = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      ring.push([
        center[0] + (tRight.x * ca + tFwd.x * sa) * radius,
        center[1] + (tRight.y * ca + tFwd.y * sa) * radius,
        center[2] + (tRight.z * ca + tFwd.z * sa) * radius,
      ]);
    }
    for (let i = 0; i < sides; i++) {
      const ni = (i + 1) % sides;
      tri(ring[i], ring[ni], apex, cRim, cRim, cTop, 0.55);
    }
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

  return {
    tri,
    triSmooth,
    quad,
    addGotBezierGrassBlade5Tri,
    addCurved3DStem,
    addSculpted3DLeaf,
    addPlush3DPetal,
    addPlump3DBud,
    add3DDomedCenter,
    finish,
  };
}

// ============================================================================
// 1. GRASS TUFT (`grassTuft` — 70 triangles, Option 4 Lush Broad-Leaf Arched Gouache Tussock)
// ============================================================================
export function buildGrassTuft() {
  const b = createBuilder();
  // Option 4 Palette: Deep forest-viridian root shadow (#123e20) -> rich emerald mid (#48a030) -> sunlit chartreuse arch (#88d844)
  const cRootA = rgb('#123e20');
  const cRootB = rgb('#184826');
  const cMidA  = rgb('#469e30');
  const cMidB  = rgb('#54ac38');
  const cTipA  = rgb('#86d642');
  const cTipB  = rgb('#96e04e');

  // 14 broad, softly-arched Cubic-Bezier leaf blades (halfW = 0.036m..0.044m = 7.2cm..8.8cm wide!)
  // arranged in a lush, overlapping Option 4 tussock cushion (~0.86m footprint, 0.34m..0.46m height)
  const blades = [
    // Inner Crown (6 taller, sweeping broad-leaf arches)
    { x0:  0.00, z0:  0.02, yaw:  0.12, reach: 0.27, tipY: 0.45, bend: 0.36, side:  0.018, w: 0.042 },
    { x0:  0.06, z0:  0.07, yaw:  0.55, reach: 0.26, tipY: 0.42, bend: 0.34, side: -0.016, w: 0.040 },
    { x0: -0.06, z0:  0.06, yaw: -0.35, reach: 0.27, tipY: 0.44, bend: 0.35, side:  0.016, w: 0.041 },
    { x0:  0.04, z0: -0.05, yaw:  1.18, reach: 0.25, tipY: 0.40, bend: 0.33, side: -0.015, w: 0.039 },
    { x0: -0.05, z0: -0.06, yaw: -1.12, reach: 0.25, tipY: 0.41, bend: 0.34, side:  0.015, w: 0.039 },
    { x0:  0.00, z0: -0.08, yaw:  2.85, reach: 0.24, tipY: 0.38, bend: 0.32, side: -0.014, w: 0.038 },
    // Outer Billowing Skirt (8 wider, lower cascading leaves that hide the ground and frame the dark root pockets)
    { x0:  0.16, z0:  0.14, yaw:  0.32, reach: 0.26, tipY: 0.34, bend: 0.38, side:  0.018, w: 0.044 },
    { x0: -0.15, z0:  0.15, yaw:  0.95, reach: 0.26, tipY: 0.35, bend: 0.38, side: -0.018, w: 0.044 },
    { x0:  0.19, z0: -0.04, yaw: -0.28, reach: 0.25, tipY: 0.33, bend: 0.36, side:  0.016, w: 0.042 },
    { x0: -0.19, z0: -0.03, yaw:  1.85, reach: 0.25, tipY: 0.33, bend: 0.36, side: -0.016, w: 0.042 },
    { x0:  0.14, z0: -0.16, yaw: -0.95, reach: 0.25, tipY: 0.32, bend: 0.36, side: -0.016, w: 0.042 },
    { x0: -0.14, z0: -0.16, yaw:  2.42, reach: 0.25, tipY: 0.32, bend: 0.36, side:  0.016, w: 0.042 },
    { x0:  0.02, z0:  0.19, yaw:  0.05, reach: 0.24, tipY: 0.31, bend: 0.38, side:  0.015, w: 0.043 },
    { x0: -0.02, z0: -0.19, yaw: -2.65, reach: 0.24, tipY: 0.30, bend: 0.37, side: -0.015, w: 0.041 },
  ];

  for (let i = 0; i < blades.length; i++) {
    const bl = blades[i];
    b.addGotBezierGrassBlade5Tri({
      x0: bl.x0,
      z0: bl.z0,
      yaw: bl.yaw,
      reach: bl.reach,
      tipY: bl.tipY,
      bend: bl.bend,
      sideCurve: bl.side,
      halfW: bl.w,
      cRoot: i % 2 === 0 ? cRootA : cRootB,
      cMid:  i % 2 === 0 ? cMidA  : cMidB,
      cTip:  i % 2 === 0 ? cTipA  : cTipB,
    });
  }

  return b.finish('grassTuft'); // 70 triangles (14 x 5-tri Option 4 broad-leaf arched tussock blades)
}

// ============================================================================
// 1B. TABLET GRASS TUFT LOD (`grassTuftTablet` — 45 triangles, 9 extra-broad Option 4 blades)
//     Covers the exact same visual volume with 36% fewer vertices for Adreno 732 tile-binning!
// ============================================================================
export function buildGrassTuftTablet() {
  const b = createBuilder();
  const cRootA = rgb('#123e20');
  const cRootB = rgb('#184826');
  const cMidA  = rgb('#469e30');
  const cMidB  = rgb('#54ac38');
  const cTipA  = rgb('#86d642');
  const cTipB  = rgb('#96e04e');

  // 9 extra-broad (halfW = 0.048m..0.054m = ~10cm wide) Cubic-Bezier arched leaves = 45 triangles
  const blades = [
    // Inner Crown (4 tall sweeping broad-leaf arches)
    { x0:  0.00, z0:  0.02, yaw:  0.14, reach: 0.27, tipY: 0.45, bend: 0.36, side:  0.018, w: 0.052 },
    { x0:  0.06, z0:  0.06, yaw:  0.62, reach: 0.26, tipY: 0.42, bend: 0.35, side: -0.016, w: 0.050 },
    { x0: -0.06, z0:  0.05, yaw: -0.42, reach: 0.27, tipY: 0.44, bend: 0.35, side:  0.016, w: 0.050 },
    { x0:  0.00, z0: -0.06, yaw:  2.75, reach: 0.25, tipY: 0.39, bend: 0.33, side: -0.015, w: 0.048 },
    // Outer Billowing Skirt (5 wide cascading leaves)
    { x0:  0.16, z0:  0.14, yaw:  0.32, reach: 0.26, tipY: 0.34, bend: 0.38, side:  0.018, w: 0.054 },
    { x0: -0.15, z0:  0.15, yaw:  1.05, reach: 0.26, tipY: 0.35, bend: 0.38, side: -0.018, w: 0.054 },
    { x0:  0.18, z0: -0.08, yaw: -0.55, reach: 0.25, tipY: 0.33, bend: 0.36, side:  0.016, w: 0.052 },
    { x0: -0.18, z0: -0.08, yaw:  2.15, reach: 0.25, tipY: 0.33, bend: 0.36, side: -0.016, w: 0.052 },
    { x0:  0.02, z0: -0.18, yaw: -2.45, reach: 0.24, tipY: 0.31, bend: 0.37, side:  0.015, w: 0.050 },
  ];

  for (let i = 0; i < blades.length; i++) {
    const bl = blades[i];
    b.addGotBezierGrassBlade5Tri({
      x0: bl.x0,
      z0: bl.z0,
      yaw: bl.yaw,
      reach: bl.reach,
      tipY: bl.tipY,
      bend: bl.bend,
      sideCurve: bl.side,
      halfW: bl.w,
      cRoot: i % 2 === 0 ? cRootA : cRootB,
      cMid:  i % 2 === 0 ? cMidA  : cMidB,
      cTip:  i % 2 === 0 ? cTipA  : cTipB,
    });
  }

  return b.finish('grassTuft'); // 45 triangles
}

// ============================================================================
// 2. CRIMSON ROSE CLUSTER (`crimsonRose` — Asymmetric 5-stem + 2-bud 3D roses)
// ============================================================================
export function buildCrimsonRose() {
  const b = createBuilder();
  const cLeafBase = rgb('#24582a'), cLeafMid = rgb('#3e8438'), cLeafTip = rgb('#66b448');
  const cStemBot  = rgb('#295e2c'), cStemMid = rgb('#428638'), cStemTop = rgb('#5aa244');

  // Rich velvety Ghibli rose palette: deep burgundy-crimson shadow -> vivid scarlet cup -> warm rose-coral rim
  const cVelvetDeep = rgb('#6e0818');
  const cCrimsonOut = rgb('#a41226');
  const cScarletMid = rgb('#dc2236');
  const cRoseInner  = rgb('#f84c62');
  const cBlushHeart = rgb('#ff8da0');

  // 1. Irregular 10-leaf basal foliage cushion
  for (let i = 0; i < 10; i++) {
    const a = i * 0.628 + (i % 3) * 0.14;
    const len = 0.17 + (i % 4) * 0.035;
    const wid = 0.052 + (i % 2) * 0.014;
    b.addSculpted3DLeaf(
      Math.cos(a) * 0.025,
      0.008,
      Math.sin(a) * 0.025,
      a,
      len,
      wid,
      0.055 + (i % 3) * 0.018,
      0.022 + (i % 2) * 0.015,
      cLeafBase,
      cLeafMid,
      cLeafTip
    );
  }

  // 2. 5 Asymmetric Open Rose Stems at varied heights, leans, and bloom sizes + 2 Unopened Rosebuds
  const roseStems = [
    // Tall central-offset hero rose
    { x0:  0.01, z0:  0.01, x2:  0.03, y2: 0.48, z2:  0.04, tilt: [ 0.08, 0.98,  0.12], scale: 1.08, rot: 0.2 },
    // Mid-tall leaning left rose
    { x0: -0.03, z0:  0.02, x2: -0.14, y2: 0.41, z2:  0.09, tilt: [-0.32, 0.92,  0.22], scale: 0.96, rot: 1.4 },
    // Mid leaning right-back rose
    { x0:  0.03, z0: -0.02, x2:  0.15, y2: 0.37, z2: -0.11, tilt: [ 0.34, 0.91, -0.25], scale: 0.90, rot: 2.7 },
    // Lower front-right open rose
    { x0:  0.02, z0:  0.03, x2:  0.12, y2: 0.30, z2:  0.13, tilt: [ 0.28, 0.88,  0.34], scale: 0.82, rot: 3.9 },
    // Lower back-left open rose
    { x0: -0.02, z0: -0.03, x2: -0.12, y2: 0.33, z2: -0.12, tilt: [-0.28, 0.90, -0.28], scale: 0.85, rot: 5.1 },
  ];

  for (let idx = 0; idx < roseStems.length; idx++) {
    const s = roseStems[idx];
    const x1 = (s.x0 + s.x2) * 0.52, y1 = s.y2 * 0.54, z1 = (s.z0 + s.z2) * 0.52;
    b.addCurved3DStem(s.x0, s.z0, x1, y1, z1, s.x2, s.y2, s.z2, 0.016, 0.013, 0.011, cStemBot, cStemMid, cStemTop, 4);

    // Stem side leaflet
    const leafAng = idx * 2.1 + 0.6;
    b.addSculpted3DLeaf(x1, y1, z1, leafAng, 0.11 * s.scale, 0.038 * s.scale, 0.03, 0.01, cLeafBase, cLeafMid, cLeafTip);

    const center = [s.x2, s.y2, s.z2];
    const sc = s.scale;

    // Outer whorl: 5 broad, plush, outward-cupped velvet crimson petals
    for (let p = 0; p < 5; p++) {
      b.addPlush3DPetal({
        center,
        headAxis: s.tilt,
        petalYaw: s.rot + (p / 5) * TAU,
        pitch: 0.42,
        length: 0.105 * sc,
        width: 0.068 * sc,
        thickness: 0.022 * sc,
        curl: 0.026 * sc,
        cBase: cVelvetDeep,
        cMid: cCrimsonOut,
        cTip: cScarletMid,
      });
    }

    // Middle whorl: 5 upright-cupped scarlet-rose petals (staggered by 36°)
    for (let p = 0; p < 5; p++) {
      b.addPlush3DPetal({
        center: [center[0], center[1] + 0.008 * sc, center[2]],
        headAxis: s.tilt,
        petalYaw: s.rot + ((p + 0.5) / 5) * TAU,
        pitch: 0.78,
        length: 0.084 * sc,
        width: 0.054 * sc,
        thickness: 0.018 * sc,
        curl: 0.014 * sc,
        cBase: cCrimsonOut,
        cMid: cScarletMid,
        cTip: cRoseInner,
      });
    }

    // Inner spiral bud heart: 3 tightly furled blush-scarlet inner petals
    for (let p = 0; p < 3; p++) {
      b.addPlush3DPetal({
        center: [center[0], center[1] + 0.015 * sc, center[2]],
        headAxis: s.tilt,
        petalYaw: s.rot + (p / 3) * TAU + 0.4,
        pitch: 1.12,
        length: 0.062 * sc,
        width: 0.040 * sc,
        thickness: 0.015 * sc,
        curl: -0.012 * sc,
        cBase: cScarletMid,
        cMid: cRoseInner,
        cTip: cBlushHeart,
      });
    }
  }

  // 3. 2 Asymmetric Plump Half-Opened Rosebuds on slender side stalks
  const buds = [
    { x0: -0.02, z0: 0.01, x2: -0.17, y2: 0.25, z2: 0.02, tilt: [-0.45, 0.88, 0.08] },
    { x0:  0.01, z0: -0.02, x2: 0.05, y2: 0.35, z2: -0.16, tilt: [0.15, 0.89, -0.42] },
  ];
  for (const bd of buds) {
    b.addCurved3DStem(
      bd.x0, bd.z0,
      (bd.x0 + bd.x2) * 0.5, bd.y2 * 0.55, (bd.z0 + bd.z2) * 0.5,
      bd.x2, bd.y2, bd.z2,
      0.012, 0.010, 0.008,
      cStemBot, cStemMid, cStemTop, 4
    );
    b.addPlump3DBud([bd.x2, bd.y2, bd.z2], bd.tilt, 0.042, 0.068, cStemMid, cCrimsonOut, cRoseInner);
  }

  return b.finish('crimsonRose');
}

// ============================================================================
// 3. VIOLET BELLFLOWER CLUSTER (`bellflower` — Asymmetric nodding 3D bells)
// ============================================================================
export function buildBellflower() {
  const b = createBuilder();
  const cLeafBase = rgb('#2b6329'), cLeafMid = rgb('#4a9638'), cLeafTip = rgb('#76c84e');
  const cStemBot  = rgb('#31692c'), cStemMid = rgb('#58a33e'), cStemTop = rgb('#82cc54');
  const cCupBase  = rgb('#4c28b8'), cCupMid  = rgb('#7c56ec'), cCupRim  = rgb('#c4b0ff');
  const cGold     = rgb('#ffe566'), cGoldTip = rgb('#f59e0b');

  for (let i = 0; i < 9; i++) {
    const a = i * 0.698 + (i % 2) * 0.18;
    b.addSculpted3DLeaf(
      Math.cos(a) * 0.02, 0.006, Math.sin(a) * 0.02,
      a, 0.18 + (i % 3) * 0.03, 0.050, 0.06, 0.025,
      cLeafBase, cLeafMid, cLeafTip
    );
  }

  // 5 Asymmetric Shepherd's-Crook Nodding Bellflower Stems
  const stems = [
    { a:  0.15, h: 0.49, reach: 0.15, scale: 1.05 },
    { a:  1.42, h: 0.43, reach: 0.17, scale: 0.96 },
    { a:  2.68, h: 0.37, reach: 0.14, scale: 0.88 },
    { a:  4.05, h: 0.45, reach: 0.16, scale: 0.92 },
    { a:  5.22, h: 0.31, reach: 0.13, scale: 0.80 },
  ];

  for (const s of stems) {
    const dx = Math.cos(s.a), dz = Math.sin(s.a);
    const x1 = dx * s.reach * 0.45, y1 = s.h * 0.68, z1 = dz * s.reach * 0.45;
    const x2 = dx * s.reach,        y2 = s.h * 0.92, z2 = dz * s.reach;
    b.addCurved3DStem(0, 0, x1, y1, z1, x2, y2, z2, 0.014, 0.011, 0.009, cStemBot, cStemMid, cStemTop, 4);

    // Downward-nodding 5-petal 3D bellflower cup
    const bellCenter = [x2, y2, z2];
    const nodAxis = [dx * 0.45, -0.88, dz * 0.45];
    for (let p = 0; p < 5; p++) {
      b.addPlush3DPetal({
        center: bellCenter,
        headAxis: nodAxis,
        petalYaw: s.a + (p / 5) * TAU,
        pitch: 0.72,
        length: 0.105 * s.scale,
        width: 0.052 * s.scale,
        thickness: 0.018 * s.scale,
        curl: 0.028 * s.scale,
        cBase: cCupBase,
        cMid: cCupMid,
        cTip: cCupRim,
      });
    }
    b.add3DDomedCenter(
      [x2 + dx * 0.02, y2 - 0.04 * s.scale, z2 + dz * 0.02],
      nodAxis,
      0.022 * s.scale,
      0.025 * s.scale,
      cGoldTip,
      cGold
    );
  }

  return b.finish('bellflower');
}

// ============================================================================
// 4. MEADOW DAISY CLUSTER (`daisy` — Asymmetric wind-tossed 3D ray petals)
// ============================================================================
export function buildDaisy() {
  const b = createBuilder();
  const cLeafBase = rgb('#2b6329'), cLeafMid = rgb('#4e9a3a'), cLeafTip = rgb('#7ed052');
  const cStemBot  = rgb('#326e2e'), cStemMid = rgb('#58a640'), cStemTop = rgb('#84ce56');
  const cPetalBase = rgb('#d8e6c8'), cPetalMid = rgb('#f8faf2'), cPetalTip = rgb('#ffffff');
  const cDiskRim  = rgb('#e07c12'), cDiskTop  = rgb('#ffd438');

  for (let i = 0; i < 8; i++) {
    const a = i * 0.785 + (i % 3) * 0.15;
    b.addSculpted3DLeaf(
      Math.cos(a) * 0.02, 0.006, Math.sin(a) * 0.02,
      a, 0.16 + (i % 3) * 0.03, 0.048, 0.05, 0.02,
      cLeafBase, cLeafMid, cLeafTip
    );
  }

  // 5 Asymmetric Daisy Stems at varied heights & tilts
  const blooms = [
    { x:  0.02, y: 0.45, z:  0.03, axis: [ 0.10, 0.98,  0.14], scale: 1.06, rot: 0.1 },
    { x: -0.13, y: 0.39, z:  0.08, axis: [-0.28, 0.93,  0.20], scale: 0.94, rot: 0.8 },
    { x:  0.14, y: 0.35, z: -0.09, axis: [ 0.30, 0.92, -0.22], scale: 0.88, rot: 1.7 },
    { x: -0.09, y: 0.29, z: -0.12, axis: [-0.24, 0.91, -0.30], scale: 0.80, rot: 2.5 },
    { x:  0.11, y: 0.26, z:  0.12, axis: [ 0.25, 0.90,  0.32], scale: 0.76, rot: 3.3 },
  ];

  for (const bl of blooms) {
    b.addCurved3DStem(
      0, 0,
      bl.x * 0.52, bl.y * 0.55, bl.z * 0.52,
      bl.x, bl.y, bl.z,
      0.014, 0.011, 0.009,
      cStemBot, cStemMid, cStemTop, 4
    );

    const center = [bl.x, bl.y, bl.z];
    const sc = bl.scale;
    const petalCount = 9;
    for (let p = 0; p < petalCount; p++) {
      b.addPlush3DPetal({
        center,
        headAxis: bl.axis,
        petalYaw: bl.rot + (p / petalCount) * TAU,
        pitch: 0.14 + (p % 2) * 0.08,
        length: 0.105 * sc,
        width: 0.038 * sc,
        thickness: 0.014 * sc,
        curl: 0.018 * sc,
        cBase: cPetalBase,
        cMid: cPetalMid,
        cTip: cPetalTip,
      });
    }
    b.add3DDomedCenter(center, bl.axis, 0.038 * sc, 0.026 * sc, cDiskRim, cDiskTop);
  }

  return b.finish('daisy');
}

// ============================================================================
// 5. LAVENDER LUPINE SPIKE (`lupine` — 3 Asymmetric 3D Whorled Floral Spikes)
// ============================================================================
export function buildLupine() {
  const b = createBuilder();
  const cLeafBase = rgb('#265e28'), cLeafMid = rgb('#469236'), cLeafTip = rgb('#72c44a');
  const cStemBot  = rgb('#2e682c'), cStemMid = rgb('#529c3c'), cStemTop = rgb('#78c450');
  const cBotBase  = rgb('#5b21b6'), cBotMid  = rgb('#7c3aed'), cBotTip  = rgb('#a855f7');
  const cTopBase  = rgb('#9333ea'), cTopMid  = rgb('#d8b4fe'), cTopTip  = rgb('#fff5fd');

  for (let i = 0; i < 10; i++) {
    const a = i * 0.628 + (i % 2) * 0.15;
    b.addSculpted3DLeaf(
      Math.cos(a) * 0.025, 0.008, Math.sin(a) * 0.025,
      a, 0.19 + (i % 3) * 0.03, 0.052, 0.065, 0.025,
      cLeafBase, cLeafMid, cLeafTip
    );
  }

  // 3 Asymmetric Tapering Lupine Spikes (1 tall central-leaning spike + 2 flanking angled spikes)
  const spikes = [
    { x0:  0.00, z0:  0.00, xTop:  0.03, yTop: 0.56, zTop:  0.02, florets: 18, scale: 1.05, seed: 1 },
    { x0: -0.04, z0:  0.02, xTop: -0.14, yTop: 0.44, zTop:  0.09, florets: 14, scale: 0.88, seed: 2 },
    { x0:  0.04, z0: -0.02, xTop:  0.13, yTop: 0.38, zTop: -0.10, florets: 12, scale: 0.80, seed: 3 },
  ];

  for (const sp of spikes) {
    b.addCurved3DStem(
      sp.x0, sp.z0,
      (sp.x0 + sp.xTop) * 0.5, sp.yTop * 0.48, (sp.z0 + sp.zTop) * 0.5,
      sp.xTop, sp.yTop, sp.zTop,
      0.018 * sp.scale, 0.014 * sp.scale, 0.008 * sp.scale,
      cStemBot, cStemMid, cStemTop, 4
    );

    const dx = sp.xTop - sp.x0, dy = sp.yTop, dz = sp.zTop - sp.z0;
    const axis = [dx, dy, dz];

    for (let f = 0; f < sp.florets; f++) {
      const t = f / (sp.florets - 1); // 0 (bottom of spike) -> 1 (apex bud)
      const hFrac = 0.28 + t * 0.70;
      const fx = sp.x0 + dx * hFrac;
      const fy = dy * hFrac;
      const fz = sp.z0 + dz * hFrac;

      const taper = (1.0 - t * 0.55) * sp.scale;
      const yaw = f * 2.3999632 + sp.seed * 1.3;

      const cB = lerpRgb(cBotBase, cTopBase, t);
      const cM = lerpRgb(cBotMid, cTopMid, t);
      const cT = lerpRgb(cBotTip, cTopTip, t);

      b.addPlush3DPetal({
        center: [fx, fy, fz],
        headAxis: axis,
        petalYaw: yaw,
        pitch: 0.48 + t * 0.45,
        length: 0.078 * taper,
        width: 0.052 * taper,
        thickness: 0.018 * taper,
        curl: 0.014 * taper,
        cBase: cB,
        cMid: cM,
        cTip: cT,
      });
    }
  }

  return b.finish('lupine');
}

// ============================================================================
// 6. ROSE-PINK COSMOS CLUSTER (`cosmos` — Asymmetric 8-petal cupped 3D blooms)
// ============================================================================
export function buildCosmos() {
  const b = createBuilder();
  const cLeafBase = rgb('#286028'), cLeafMid = rgb('#4a9638'), cLeafTip = rgb('#78ca50');
  const cStemBot  = rgb('#2e682c'), cStemMid = rgb('#56a23e'), cStemTop = rgb('#82cc56');
  const cPetalBase = rgb('#be185d'), cPetalMid = rgb('#f472b6'), cPetalTip = rgb('#fce7f3');
  const cDiskRim  = rgb('#d97706'), cDiskTop  = rgb('#fde047');

  for (let i = 0; i < 8; i++) {
    const a = i * 0.785 + 0.2;
    b.addSculpted3DLeaf(
      Math.cos(a) * 0.02, 0.006, Math.sin(a) * 0.02,
      a, 0.17 + (i % 2) * 0.03, 0.044, 0.055, 0.022,
      cLeafBase, cLeafMid, cLeafTip
    );
  }

  const blooms = [
    { x:  0.02, y: 0.48, z:  0.02, axis: [ 0.12, 0.97,  0.12], scale: 1.06, rot: 0.0 },
    { x: -0.14, y: 0.41, z:  0.09, axis: [-0.30, 0.92,  0.22], scale: 0.95, rot: 0.5 },
    { x:  0.15, y: 0.37, z: -0.10, axis: [ 0.32, 0.91, -0.24], scale: 0.88, rot: 1.1 },
    { x: -0.10, y: 0.31, z: -0.13, axis: [-0.26, 0.90, -0.32], scale: 0.82, rot: 1.8 },
    { x:  0.12, y: 0.28, z:  0.13, axis: [ 0.28, 0.89,  0.34], scale: 0.78, rot: 2.4 },
  ];

  for (const bl of blooms) {
    b.addCurved3DStem(
      0, 0,
      bl.x * 0.52, bl.y * 0.55, bl.z * 0.52,
      bl.x, bl.y, bl.z,
      0.013, 0.010, 0.008,
      cStemBot, cStemMid, cStemTop, 4
    );

    const center = [bl.x, bl.y, bl.z];
    const sc = bl.scale;
    for (let p = 0; p < 8; p++) {
      b.addPlush3DPetal({
        center,
        headAxis: bl.axis,
        petalYaw: bl.rot + (p / 8) * TAU,
        pitch: 0.28 + (p % 2) * 0.08,
        length: 0.108 * sc,
        width: 0.048 * sc,
        thickness: 0.016 * sc,
        curl: 0.020 * sc,
        cBase: cPetalBase,
        cMid: cPetalMid,
        cTip: cPetalTip,
      });
    }
    b.add3DDomedCenter(center, bl.axis, 0.034 * sc, 0.024 * sc, cDiskRim, cDiskTop);
  }

  return b.finish('cosmos');
}

// ============================================================================
// 7. FEATHERY PAMPAS PLUME & CLOVER TUSSOCK (`toonShrub` — Option 3 Botanical Variety!)
//    Combines low 3-leaf clover cushions, broad arching Option-4 tussock leaves, and
//    4 tall, weeping golden-cream Cubic-Bezier feathery pampas / foxtail plumes!
// ============================================================================
export function buildToonShrub() {
  const b = createBuilder();
  const cRootShadow = rgb('#144222');
  const cLeafMid    = rgb('#489e30');
  const cLeafSun    = rgb('#84d442');

  // Clover palette: dark emerald heart -> vibrant clover leaf -> pale edge highlight
  const cCloverBase = rgb('#1b5824');
  const cCloverMid  = rgb('#4ca634');
  const cCloverTip  = rgb('#8ee050');

  // Warm wheat-gold to sunlit champagne-cream pampas plume palette (never stark white!)
  const cStalkBot   = rgb('#2b6828');
  const cStalkMid   = rgb('#569e38');
  const cStalkTop   = rgb('#94be54');
  const cPlumeRoot  = rgb('#b8944c');
  const cPlumeMid   = rgb('#dec484');
  const cPlumeTip   = rgb('#f6e8be');

  // 1. Basal cushion of 12 broad Option-4 tussock leaves anchoring the clump
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + (i % 2) * 0.16;
    b.addGotBezierGrassBlade5Tri({
      x0: Math.cos(a) * 0.09,
      y0: 0.0,
      z0: Math.sin(a) * 0.09,
      yaw: a,
      reach: 0.28 + (i % 3) * 0.04,
      tipY: 0.35 + (i % 2) * 0.06,
      bend: 0.36,
      sideCurve: (i % 2 === 0 ? 1 : -1) * 0.016,
      halfW: 0.042,
      cRoot: cRootShadow,
      cMid: cLeafMid,
      cTip: cLeafSun,
    });
  }

  // 2. Low 3-Leaf Clover Patches tucked around the front & sides of the clump (Option 3 clover!)
  const cloverCenters = [
    { cx:  0.22, cz:  0.18, y: 0.05, rot: 0.25, sc: 1.08 },
    { cx: -0.20, cz:  0.19, y: 0.05, rot: 1.15, sc: 1.00 },
    { cx:  0.02, cz:  0.26, y: 0.04, rot: 2.10, sc: 1.04 },
    { cx: -0.24, cz: -0.12, y: 0.05, rot: 0.75, sc: 0.96 },
    { cx:  0.23, cz: -0.14, y: 0.05, rot: 1.85, sc: 0.98 },
    { cx:  0.00, cz: -0.24, y: 0.04, rot: 0.45, sc: 0.95 },
  ];
  for (const cl of cloverCenters) {
    for (let lf = 0; lf < 3; lf++) {
      const a = cl.rot + (lf / 3) * TAU;
      b.addPlush3DPetal({
        center: [cl.cx, cl.y, cl.cz],
        headAxis: [Math.cos(a) * 0.14, 0.99, Math.sin(a) * 0.14],
        petalYaw: a,
        pitch: 0.08,
        length: 0.11 * cl.sc,
        width: 0.092 * cl.sc,
        thickness: 0.015 * cl.sc,
        curl: 0.010 * cl.sc,
        cBase: cCloverBase,
        cMid: cCloverMid,
        cTip: cCloverTip,
      });
    }
  }

  // 3. 4 Weeping Cream-Gold Pampas Plume Stalks built from cascading Cubic-Bezier silk locks!
  const stalks = [
    { x0:  0.00, z0:  0.00, xCrown:  0.14, yCrown: 0.48, zCrown:  0.08, yaw:  0.42, sc: 1.08 },
    { x0: -0.06, z0:  0.04, xCrown:  0.06, yCrown: 0.42, zCrown:  0.14, yaw:  0.68, sc: 0.96 },
    { x0:  0.06, z0: -0.04, xCrown:  0.18, yCrown: 0.40, zCrown: -0.02, yaw:  0.18, sc: 0.92 },
    { x0: -0.05, z0: -0.05, xCrown: -0.10, yCrown: 0.44, zCrown:  0.10, yaw:  0.88, sc: 0.98 },
  ];

  for (const st of stalks) {
    b.addCurved3DStem(
      st.x0, st.z0,
      st.xCrown * 0.48, st.yCrown * 0.55, st.zCrown * 0.48,
      st.xCrown, st.yCrown, st.zCrown,
      0.014 * st.sc, 0.011 * st.sc, 0.008 * st.sc,
      cStalkBot, cStalkMid, cStalkTop, 4
    );

    // 7 overlapping weeping Cubic-Bezier feathery silk locks forming a cohesive foxtail plume
    for (let k = 0; k < 7; k++) {
      const fanOffset = ((k - 3) / 3) * 0.34;
      const tierLift = (k % 3) * 0.035 * st.sc;
      b.addGotBezierGrassBlade5Tri({
        x0: st.xCrown,
        y0: st.yCrown - 0.04 + tierLift,
        z0: st.zCrown,
        yaw: st.yaw + fanOffset,
        reach: (0.24 + (k % 2) * 0.04) * st.sc,
        tipY: (0.16 + (2 - (k % 3)) * 0.04) * st.sc,
        bend: 0.44,
        sideCurve: fanOffset * 0.03,
        halfW: 0.024 * st.sc,
        cRoot: cPlumeRoot,
        cMid: cPlumeMid,
        cTip: cPlumeTip,
      });
    }
  }

  return b.finish('toonShrub');
}

export function createSpeciesGeometries() {
  return {
    grassTuft:       buildGrassTuft(),
    grassTuftTablet: buildGrassTuftTablet(),
    crimsonRose:     buildFromBlenderData('crimsonRose'),
    bellflower:      buildFromBlenderData('bellflower'),
    daisy:           buildFromBlenderData('daisy'),
    lupine:          buildFromBlenderData('lupine'),
    cosmos:          buildFromBlenderData('cosmos'),
    toonShrub:       buildToonShrub(),
  };
}
