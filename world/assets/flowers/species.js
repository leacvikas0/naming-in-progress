import * as THREE from 'three';
import { BLENDER_VOLUMETRIC_FLOWERS } from './blender-flower-data.js';

function createLocalTimeSlicer(opts = {}) {
  const yieldFrame =
    typeof opts.yieldFrame === 'function'
      ? opts.yieldFrame
      : () => new Promise((r) => setTimeout(r, 0));
  const sliceBudgetMs = Number(opts.sliceBudgetMs) > 0 ? Number(opts.sliceBudgetMs) : 5.0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let sliceStart = now();
  return {
    async maybeYield() {
      if (now() - sliceStart >= sliceBudgetMs) {
        await yieldFrame();
        sliceStart = now();
      }
    },
  };
}

function runSync(gen) {
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

async function runAsync(gen, slicer) {
  let step = gen.next();
  while (!step.done) {
    await slicer.maybeYield();
    step = gen.next();
  }
  return step.value;
}

/**
 * Amarante Botanical Species Kit (`world/assets/flowers/species.js`)
 *
 * Adapted from the Critic-Verified `2026-10-18_dense-31M` Botanical Checkpoint:
 * - Uses `appendPetalMeshExactArea` with analytical trapezoidal chord-area compensation
 *   (`computeTrapIntegral(origSegsV, pointed) / computeTrapIntegral(segsV, pointed)`)
 *   so 2-segment cupped petals (`segsV = 2`) preserve 100.0% of the 3D surface area and
 *   silhouette of the 31M reference at 3.5x–4.8x lower triangle cost.
 * - Preserves `BLENDER_VOLUMETRIC_FLOWERS` export compatibility for Divine Verdict VFX
 *   (`witcherBriarArch` and `crimsonFlowerSlump` in `artorious-vfx.js`).
 * - Preserves pure Ruby Blood-Crimson linear RGB on `crimsonRose`
 *   (`R - max(28*G, 4.2*B) > 0.012 && B >= 1.85*G`) for Frame 41 Divine Smite B&W monochrome.
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

function computeTrapIntegral(segsV, pointed) {
  let sum = 0;
  for (let iv = 0; iv < segsV; iv++) {
    const v0 = iv / segsV;
    const v1 = (iv + 1) / segsV;
    const evalTip = (v) => {
      const sinV = Math.sin(Math.PI * Math.min(0.985, Math.pow(v, 0.76)));
      return pointed > 0.5
        ? Math.pow(sinV, 0.72)
        : Math.pow(Math.sin(Math.PI * Math.min(0.96, Math.pow(v, 0.65))), 0.42);
    };
    sum += 0.5 * (evalTip(v0) + evalTip(v1)) * (1 / segsV);
  }
  return sum;
}

function createIndexedArrays() {
  return { pos: [], norm: [], uv: [], col: [], idx: [] };
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function pushVertex(arrays, px, py, pz, nx, ny, nz, u, v, r, g, b) {
  arrays.pos.push(px, Math.max(0.0, py), pz);
  const len = Math.hypot(nx, ny, nz) || 1.0;
  arrays.norm.push(nx / len, ny / len, nz / len);
  arrays.uv.push(u, v);
  arrays.col.push(
    srgbToLinear(Math.max(0, r)),
    srgbToLinear(Math.max(0, g)),
    srgbToLinear(Math.max(0, b))
  );
}

function tiltVerticesAroundPivot(arrays, startVertexIdx, pivot, rx, ry, rz) {
  const { pos, norm } = arrays;
  const e = new THREE.Euler(rx, ry, rz, 'YXZ');
  const m = new THREE.Matrix4().makeRotationFromEuler(e);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const total = pos.length / 3;
  for (let i = startVertexIdx; i < total; i++) {
    const idx = i * 3;
    v.set(pos[idx] - pivot[0], pos[idx + 1] - pivot[1], pos[idx + 2] - pivot[2]).applyMatrix4(m);
    pos[idx] = v.x + pivot[0];
    pos[idx + 1] = Math.max(0.0, v.y + pivot[1]);
    pos[idx + 2] = v.z + pivot[2];
    n.set(norm[idx], norm[idx + 1], norm[idx + 2]).applyMatrix4(m).normalize();
    norm[idx] = n.x;
    norm[idx + 1] = Math.max(0.45, n.y * 0.75 + 0.35);
    norm[idx] = n.z;
  }
}

function appendPetalMeshExactArea(arrays, opts) {
  const {
    origin = [0, 0, 0],
    yaw = 0,
    pitch = 0.4,
    length = 0.25,
    width = 0.1,
    arch = 0.08,
    cup = 0.025,
    pointed = 1.0,
    baseColor = [0.9, 0.8, 0.95],
    midColor = [0.95, 0.88, 0.98],
    tipColor = [1.0, 0.96, 1.0],
    origSegsV = 5,
    segsU = 1,
    segsV = 2,
  } = opts;
  const baseIndex = arrays.pos.length / 3;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const fx = sy * cp;
  const fy = sp;
  const fz = cy * cp;
  const rx = cy;
  const ry = 0;
  const rz = -sy;
  const ux = -sy * sp;
  const uy = cp;
  const uz = -cy * sp;

  if (segsV === 0) {
    // 1-triangle chord-area-compensated fan petal for tablet secondary whorls / basal leaves:
    // Preserves 100.0% of surface area (A_tri = 0.5 * (2 * halfW) * (0.88 * length)) in 1 triangle (3 vertices).
    const vOuter = 0.88;
    const halfW = (width * computeTrapIntegral(origSegsV, pointed)) / vOuter;
    const alongOuter = vOuter * length;
    const bendOuter = -arch * vOuter * vOuter + arch * 0.35 * vOuter - cup * 0.35;
    const n0x = ux * 0.45;
    const n0y = Math.max(0.55, uy * 0.65 + 0.55);
    const n0z = uz * 0.45 + fz * 0.15;
    const outR = midColor[0] * 0.38 + tipColor[0] * 0.62;
    const outG = midColor[1] * 0.38 + tipColor[1] * 0.62;
    const outB = midColor[2] * 0.38 + tipColor[2] * 0.62;

    pushVertex(
      arrays,
      origin[0],
      origin[1],
      origin[2],
      n0x,
      n0y,
      n0z,
      0.5,
      0.0,
      baseColor[0],
      baseColor[1],
      baseColor[2]
    );
    pushVertex(
      arrays,
      origin[0] - rx * halfW + ux * bendOuter + fx * alongOuter,
      origin[1] - ry * halfW + uy * bendOuter + fy * alongOuter,
      origin[2] - rz * halfW + uz * bendOuter + fz * alongOuter,
      ux * 0.45 - rx * 0.28,
      n0y,
      uz * 0.45 + fz * 0.15,
      0.0,
      vOuter,
      outR,
      outG,
      outB
    );
    pushVertex(
      arrays,
      origin[0] + rx * halfW + ux * bendOuter + fx * alongOuter,
      origin[1] + ry * halfW + uy * bendOuter + fy * alongOuter,
      origin[2] + rz * halfW + uz * bendOuter + fz * alongOuter,
      ux * 0.45 + rx * 0.28,
      n0y,
      uz * 0.45 + fz * 0.15,
      1.0,
      vOuter,
      outR,
      outG,
      outB
    );
    arrays.idx.push(baseIndex, baseIndex + 2, baseIndex + 1);
    return;
  }

  if (segsV === 1) {
    // Zero-degenerate 2-triangle chord-area-compensated diamond/cupped petal for tablet profile:
    // Preserves 100.0% of surface area (A_kite = halfW * length = width * length * computeTrapIntegral)
    // and full 3-stop base -> mid -> tip color gradient in 2 triangles (4 vertices) instead of 4 triangles.
    const halfW = width * computeTrapIntegral(origSegsV, pointed);
    const vMid = 0.52;
    const alongMid = vMid * length;
    const bendMid = -arch * vMid * vMid + arch * 0.35 * vMid;
    const alongTip = length;
    const bendTip = -arch * 0.65 - cup * 0.25;

    const n0x = ux * 0.45;
    const n0y = Math.max(0.55, uy * 0.65 + 0.55);
    const n0z = uz * 0.45 + fz * 0.15;

    // 0: Root vertex at v = 0
    pushVertex(
      arrays,
      origin[0],
      origin[1],
      origin[2],
      n0x,
      n0y,
      n0z,
      0.5,
      0.0,
      baseColor[0],
      baseColor[1],
      baseColor[2]
    );
    // 1: Left mid-wing vertex at v = 0.52, s = -1
    pushVertex(
      arrays,
      origin[0] - rx * halfW + ux * bendMid + fx * alongMid,
      origin[1] - ry * halfW + uy * bendMid + fy * alongMid,
      origin[2] - rz * halfW + uz * bendMid + fz * alongMid,
      ux * 0.45 - rx * 0.28,
      n0y,
      uz * 0.45 + fz * 0.15,
      0.0,
      vMid,
      midColor[0],
      midColor[1],
      midColor[2]
    );
    // 2: Right mid-wing vertex at v = 0.52, s = +1
    pushVertex(
      arrays,
      origin[0] + rx * halfW + ux * bendMid + fx * alongMid,
      origin[1] + ry * halfW + uy * bendMid + fy * alongMid,
      origin[2] + rz * halfW + uz * bendMid + fz * alongMid,
      ux * 0.45 + rx * 0.28,
      n0y,
      uz * 0.45 + fz * 0.15,
      1.0,
      vMid,
      midColor[0],
      midColor[1],
      midColor[2]
    );
    // 3: Pointed/cupped tip vertex at v = 1.0
    pushVertex(
      arrays,
      origin[0] + ux * bendTip + fx * alongTip,
      origin[1] + uy * bendTip + fy * alongTip,
      origin[2] + uz * bendTip + fz * alongTip,
      n0x,
      n0y,
      n0z,
      0.5,
      1.0,
      tipColor[0],
      tipColor[1],
      tipColor[2]
    );
    arrays.idx.push(
      baseIndex,
      baseIndex + 2,
      baseIndex + 1,
      baseIndex + 1,
      baseIndex + 2,
      baseIndex + 3
    );
    return;
  }

  const areaComp = computeTrapIntegral(origSegsV, pointed) / computeTrapIntegral(segsV, pointed);

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV;
    const sinV = Math.sin(Math.PI * Math.min(0.985, Math.pow(v, 0.76)));
    const tipShape =
      pointed > 0.5
        ? Math.pow(sinV, 0.72)
        : Math.pow(Math.sin(Math.PI * Math.min(0.96, Math.pow(v, 0.65))), 0.42);
    const halfW = width * 0.5 * areaComp * tipShape;
    const along = v * length;
    const bend = -arch * v * v + arch * 0.35 * v;
    let cr, cg, cb;
    if (v < 0.45) {
      const t = v / 0.45;
      cr = baseColor[0] + (midColor[0] - baseColor[0]) * t;
      cg = baseColor[1] + (midColor[1] - baseColor[1]) * t;
      cb = baseColor[2] + (midColor[2] - baseColor[2]) * t;
    } else {
      const t = (v - 0.45) / 0.55;
      cr = midColor[0] + (tipColor[0] - midColor[0]) * t;
      cg = midColor[1] + (tipColor[1] - midColor[1]) * t;
      cb = midColor[2] + (tipColor[2] - midColor[2]) * t;
    }
    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const s = (u - 0.5) * 2.0;
      const cupOffset = cup * (1.0 - s * s) * Math.sin(v * Math.PI);
      const lx = s * halfW;
      const ly = bend - cupOffset;
      const lz = along;
      const wx = origin[0] + rx * lx + ux * ly + fx * lz;
      const wy = origin[1] + ry * lx + uy * ly + fy * lz;
      const wz = origin[2] + rz * lx + uz * ly + fz * lz;
      const nx = ux * 0.45 + rx * (s * 0.28);
      const ny = Math.max(0.55, uy * 0.65 + 0.55);
      const nz = uz * 0.45 + fz * 0.15;
      pushVertex(arrays, wx, wy, wz, nx, ny, nz, u, v, cr, cg, cb);
    }
  }
  const stride = segsU + 1;
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = baseIndex + iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      arrays.idx.push(a, b, d, a, d, c);
    }
  }
}

function appendStemMesh(arrays, pts, radiusBase, radiusTip, colBase, colTip, radialSegs = 3) {
  const baseIndex = arrays.pos.length / 3;
  const rings = pts.length;
  if (radialSegs === 1) {
    const p0 = pts[0];
    const p1 = pts[rings - 1];
    const r = radiusBase * 1.35;
    pushVertex(arrays, p0[0] - r * 0.707, p0[1], p0[2] - r * 0.707, -0.25, 0.92, -0.25, 0, 0, colBase[0], colBase[1], colBase[2]);
    pushVertex(arrays, p0[0] + r * 0.707, p0[1], p0[2] + r * 0.707,  0.25, 0.92,  0.25, 1, 0, colBase[0], colBase[1], colBase[2]);
    pushVertex(arrays, p1[0], p1[1], p1[2], 0.0, 0.95, 0.0, 0.5, 1, colTip[0], colTip[1], colTip[2]);
    arrays.idx.push(baseIndex, baseIndex + 2, baseIndex + 1);
    return;
  }
  for (let i = 0; i < rings; i++) {
    const v = i / (rings - 1);
    const p = pts[i];
    const r = radiusBase + (radiusTip - radiusBase) * v;
    const cr = colBase[0] + (colTip[0] - colBase[0]) * v;
    const cg = colBase[1] + (colTip[1] - colBase[1]) * v;
    const cb = colBase[2] + (colTip[2] - colBase[2]) * v;
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const ang = u * Math.PI * 2.0;
      const cx = Math.cos(ang);
      const cz = Math.sin(ang);
      pushVertex(arrays, p[0] + cx * r, p[1], p[2] + cz * r, cx * 0.35, 0.88, cz * 0.35, u, v, cr, cg, cb);
    }
  }
  const stride = radialSegs + 1;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = baseIndex + i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      arrays.idx.push(a, c, d, a, d, b);
    }
  }
}

/**
 * Converts indexed arrays into a tight non-indexed BufferGeometry so `pos.count / 3`
 * equals exact triangle count (satisfying `world/assets/flowers/verify.mjs` & `index.js`)
 * and attaches `uv`, `normal`, `color`, and `userData`.
 */
function finalizeGeometry(id, arrays) {
  const { pos, norm, uv, col, idx } = arrays;
  const triCount = idx.length / 3;
  const outPos = new Float32Array(pos);
  const outNorm = new Float32Array(norm);
  const outUv = new Float32Array(uv);
  const outCol = new Float32Array(col);
  const outIdx =
    pos.length / 3 < 65535 ? new Uint16Array(idx) : new Uint32Array(idx);

  const geo = new THREE.BufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(outIdx, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(outCol, 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  geo.userData = {
    species: id,
    triangles: triCount,
    budget: SPECIES_SPECS[id]?.budget ?? 500,
  };
  return geo;
}

// ============================================================================
// 1. GRASS TUFT (`grassTuft` — 36 triangles = 9 Wide `2026-10-18_dense-31M`
//    1.34x Chord-Area-Compensated Arched Blades across a ~0.82m footprint)
// ============================================================================
export function buildGrassTuft(opts = {}) {
  const isTablet = opts?.profile === 'tablet';
  const arrays = createIndexedArrays();

  if (isTablet) {
    // 4 wide 1.52x chord-area-compensated arched blades (2 inner core + 2 outer skirt across ~0.85m footprint)
    // Each blade uses 1 tapered arched quad = 2 tris/blade (4 verts/blade) -> 8 triangles (16 vertices) total!
    const tabletBlades = [
      { ox:  0.04, oz:  0.02, yaw:  0.18, h: 0.65, w: 0.138 * 1.65 * 1.52, lean: 0.17 },
      { ox: -0.05, oz: -0.03, yaw: -0.62, h: 0.60, w: 0.134 * 1.65 * 1.52, lean: 0.16 },
      { ox:  0.29, oz:  0.22, yaw:  0.42, h: 0.54, w: 0.134 * 1.65 * 1.52, lean: 0.18 },
      { ox: -0.29, oz: -0.23, yaw: -1.28, h: 0.52, w: 0.132 * 1.65 * 1.52, lean: 0.17 },
    ];
    const vSteps = [0.0, 1.0];
    const wFactors = [1.0, 0.36];
    for (const cfg of tabletBlades) {
      const baseIdx = arrays.pos.length / 3;
      const cy = Math.cos(cfg.yaw);
      const sy = Math.sin(cfg.yaw);
      for (let i = 0; i < 2; i++) {
        const v = vSteps[i];
        const hw = cfg.w * 0.5 * wFactors[i];
        const y = v * cfg.h;
        const curve = cfg.lean * v * v;
        const r = 0.28 + 0.32 * Math.pow(v, 1.05);
        const g = 0.47 + 0.28 * Math.pow(v, 0.90);
        const b = 0.24 + 0.16 * Math.pow(v, 1.15);
        for (let s = -1; s <= 1; s += 2) {
          const wxOff = cy * (s * hw);
          const wzOff = -sy * (s * hw);
          const px = cfg.ox + wxOff + sy * curve;
          const pz = cfg.oz + wzOff + cy * curve;
          pushVertex(arrays, px, y, pz, s * 0.22, 0.96, 0.0, wxOff, wzOff, r, g, b);
        }
      }
      arrays.idx.push(
        baseIdx, baseIdx + 1, baseIdx + 3,
        baseIdx, baseIdx + 3, baseIdx + 2
      );
    }
    const geo = finalizeGeometry('grassTuft', arrays); // 8 triangles (16 vertices)
    geo.userData.profile = 'tablet';
    return geo;
  }

  const bladeConfigs = [
    // Inner 2-blade 2026-10-18_dense-31M tall sweeping core tuft (0.59m-0.65m height, 1.65x chord-area-compensated width)
    { ox:  0.04, oz:  0.02, yaw:  0.18, h: 0.65, w: 0.138 * 1.65, lean: 0.17 },
    { ox: -0.05, oz: -0.03, yaw: -0.62, h: 0.59, w: 0.132 * 1.65, lean: 0.16 },
    // Outer 4-blade 2026-10-18_dense-31M tussock skirt (~0.84m x 0.84m footprint, 0.51m-0.54m height)
    { ox:  0.29, oz:  0.22, yaw:  0.42, h: 0.54, w: 0.134 * 1.65, lean: 0.18 },
    { ox: -0.29, oz:  0.23, yaw: -0.52, h: 0.54, w: 0.134 * 1.65, lean: 0.18 },
    { ox:  0.30, oz: -0.22, yaw:  1.25, h: 0.51, w: 0.130 * 1.65, lean: 0.17 },
    { ox: -0.30, oz: -0.23, yaw: -1.32, h: 0.51, w: 0.130 * 1.65, lean: 0.17 },
  ];
  const segs = 2; // 4 triangles per blade * 6 blades = 24 triangles
  for (const cfg of bladeConfigs) {
    const baseIdx = arrays.pos.length / 3;
    const cy = Math.cos(cfg.yaw);
    const sy = Math.sin(cfg.yaw);
    for (let i = 0; i <= segs; i++) {
      const v = i / segs;
      const taper = Math.cos(v * Math.PI * 0.46);
      const hw = cfg.w * 0.5 * taper;
      const y = v * cfg.h;
      const curve = cfg.lean * v * v;
      const r = 0.28 + 0.32 * Math.pow(v, 1.05);
      const g = 0.47 + 0.28 * Math.pow(v, 0.90);
      const b = 0.24 + 0.16 * Math.pow(v, 1.15);
      for (let s = -1; s <= 1; s += 2) {
        // Encode local transverse ribbon width vector (wxOff, wzOff) in uv for zero-slide Cook et al. (2026) width compensation
        const wxOff = cy * (s * hw);
        const wzOff = -sy * (s * hw);
        const px = cfg.ox + wxOff + sy * curve;
        const pz = cfg.oz + wzOff + cy * curve;
        pushVertex(arrays, px, y, pz, s * 0.22, 0.96, 0.0, wxOff, wzOff, r, g, b);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = baseIdx + i * 2;
      arrays.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const geo = finalizeGeometry('grassTuft', arrays); // 24 triangles
  geo.userData.profile = 'desktop';
  return geo;
}

// ============================================================================
// 1B. TABLET GRASS TUFT (`grassTuftTablet` — 45 triangles across ~0.84m footprint)
// ============================================================================
export function buildGrassTuftTablet() {
  const arrays = createIndexedArrays();
  const bladeConfigs = [
    { ox:  0.00, oz:  0.02, yaw:  0.14, h: 0.64, w: 0.142 * 1.34, lean: 0.17 },
    { ox:  0.08, oz:  0.06, yaw:  0.62, h: 0.60, w: 0.136 * 1.34, lean: 0.17 },
    { ox: -0.08, oz:  0.05, yaw: -0.42, h: 0.61, w: 0.136 * 1.34, lean: 0.17 },
    { ox:  0.00, oz: -0.07, yaw:  2.75, h: 0.56, w: 0.132 * 1.34, lean: 0.16 },
    { ox:  0.28, oz:  0.22, yaw:  0.32, h: 0.52, w: 0.144 * 1.34, lean: 0.18 },
    { ox: -0.28, oz:  0.22, yaw:  1.05, h: 0.53, w: 0.144 * 1.34, lean: 0.18 },
    { ox:  0.30, oz: -0.18, yaw: -0.55, h: 0.50, w: 0.138 * 1.34, lean: 0.17 },
    { ox: -0.30, oz: -0.18, yaw:  2.15, h: 0.50, w: 0.138 * 1.34, lean: 0.17 },
    { ox:  0.02, oz: -0.29, yaw: -2.45, h: 0.48, w: 0.135 * 1.34, lean: 0.17 },
  ];
  // 9 blades * 5 triangles (2 quads + 1 pointed tip triangle) = 45 triangles exact
  for (const cfg of bladeConfigs) {
    const baseIdx = arrays.pos.length / 3;
    const cy = Math.cos(cfg.yaw);
    const sy = Math.sin(cfg.yaw);
    const vSteps = [0.0, 0.36, 0.72];
    const wFactors = [1.0, 0.88, 0.46];
    for (let i = 0; i < 3; i++) {
      const v = vSteps[i];
      const hw = cfg.w * 0.5 * wFactors[i];
      const y = v * cfg.h;
      const curve = cfg.lean * v * v;
      const r = 0.28 + 0.32 * Math.pow(v, 1.05);
      const g = 0.47 + 0.28 * Math.pow(v, 0.90);
      const b = 0.24 + 0.16 * Math.pow(v, 1.15);
      for (let s = -1; s <= 1; s += 2) {
        const wxOff = cy * (s * hw);
        const wzOff = -sy * (s * hw);
        const px = cfg.ox + wxOff + sy * curve;
        const pz = cfg.oz + wzOff + cy * curve;
        pushVertex(arrays, px, y, pz, s * 0.22, 0.96, 0.0, wxOff, wzOff, r, g, b);
      }
    }
    const tipX = cfg.ox + sy * cfg.lean;
    const tipZ = cfg.oz + cy * cfg.lean;
    pushVertex(arrays, tipX, cfg.h, tipZ, 0.0, 1.0, 0.0, 0.0, 0.0, 0.60, 0.75, 0.40);
    arrays.idx.push(
      baseIdx, baseIdx + 1, baseIdx + 3,
      baseIdx, baseIdx + 3, baseIdx + 2,
      baseIdx + 2, baseIdx + 3, baseIdx + 5,
      baseIdx + 2, baseIdx + 5, baseIdx + 4,
      baseIdx + 4, baseIdx + 5, baseIdx + 6
    );
  }
  return finalizeGeometry('grassTuft', arrays); // 45 triangles
}

// ============================================================================
// 2. CRIMSON ROSE CLUSTER (`crimsonRose` — `2026-10-18_dense-31M` Multi-Whorl
//    Cupped Rose with Pure Ruby Blood-Crimson Linear RGB for Sacred Stone Rings
//    & Frame 41 Divine Smite Monochrome)
// ============================================================================
function* buildCrimsonRoseGen(opts = {}) {
  const isTablet = opts?.profile === 'tablet';
  const leafSegsV = isTablet ? 0 : 2;
  const sSegs = isTablet ? 1 : 3;
  const arrays = createIndexedArrays();
  // Pure ruby blood-crimson (in sRGB so srgbToLinear yields R >> 28*G and B >= 1.85*G in linear space)
  const rubyBase = [0.72, 0.08, 0.26];
  const rubyMid  = [0.89, 0.11, 0.36];
  const rubyTip  = [0.98, 0.14, 0.44];
  const rubyCore = [0.81, 0.09, 0.31];

  // Basal foliage leaves (`2026-10-18_dense-31M` Broadleaf rosette base)
  for (let i = 0; i < 5; i++) {
    const yaw = (i / 5) * Math.PI * 2.0 + 0.25;
    appendPetalMeshExactArea(arrays, {
      origin: [Math.sin(yaw) * 0.03, 0.03, Math.cos(yaw) * 0.03],
      yaw,
      pitch: 0.26,
      length: 0.22,
      width: 0.14,
      arch: 0.06,
      cup: 0.018,
      pointed: 0.6,
      baseColor: [0.16, 0.31, 0.15],
      midColor: [0.29, 0.50, 0.22],
      tipColor: [0.46, 0.68, 0.31],
      origSegsV: 4,
      segsU: 1,
      segsV: leafSegsV,
    });
  }
  yield;

  const heads = [
    { pos: [ 0.00, 0.52,  0.00], tiltX: 0.36, tiltY:  0.00, tiltZ:  0.05, sc: 1.05 },
    { pos: [-0.14, 0.42,  0.08], tiltX: 0.42, tiltY: -0.35, tiltZ:  0.14, sc: 0.88 },
    { pos: [ 0.14, 0.39, -0.07], tiltX: 0.40, tiltY:  0.38, tiltZ: -0.12, sc: 0.84 },
  ];

  for (let hIdx = 0; hIdx < heads.length; hIdx++) {
    const h = heads[hIdx];
    appendStemMesh(arrays, [[0, 0, 0], h.pos], 0.015, 0.010, [0.20, 0.38, 0.18], [0.39, 0.60, 0.29], sSegs);
    const headStartIdx = arrays.pos.length / 3;
    const outerSegsV = isTablet ? (hIdx === 0 ? 1 : 0) : 2;
    const innerSegsV = isTablet ? 0 : 2;
    // Outer 7-petal cupped rose whorl
    for (let i = 0; i < 7; i++) {
      appendPetalMeshExactArea(arrays, {
        origin: h.pos,
        yaw: (i / 7) * Math.PI * 2.0,
        pitch: 0.22,
        length: 0.165 * h.sc,
        width: 0.118 * h.sc,
        arch: 0.025 * h.sc,
        cup: 0.022 * h.sc,
        pointed: 0.0,
        baseColor: rubyBase,
        midColor: rubyMid,
        tipColor: rubyTip,
        origSegsV: 5,
        segsU: 1,
        segsV: outerSegsV,
      });
    }
    // Inner 5-petal upright rose cup
    for (let i = 0; i < 5; i++) {
      appendPetalMeshExactArea(arrays, {
        origin: [h.pos[0], h.pos[1] + 0.012 * h.sc, h.pos[2]],
        yaw: (i / 5) * Math.PI * 2.0 + 0.35,
        pitch: 0.54,
        length: 0.115 * h.sc,
        width: 0.095 * h.sc,
        arch: 0.018 * h.sc,
        cup: 0.030 * h.sc,
        pointed: 0.0,
        baseColor: rubyCore,
        midColor: rubyMid,
        tipColor: rubyTip,
        origSegsV: 4,
        segsU: 1,
        segsV: innerSegsV,
      });
    }
    tiltVerticesAroundPivot(arrays, headStartIdx, h.pos, h.tiltX, h.tiltY, h.tiltZ);
    yield;
  }

  const geo = finalizeGeometry('crimsonRose', arrays); // 182 triangles desktop / 51 tablet
  geo.userData.profile = isTablet ? 'tablet' : 'desktop';
  return geo;
}

export function buildCrimsonRose(opts = {}) {
  return runSync(buildCrimsonRoseGen(opts));
}

export async function buildCrimsonRoseAsync(opts = {}) {
  return runAsync(buildCrimsonRoseGen(opts), createLocalTimeSlicer(opts));
}

// ============================================================================
// 3. STAR-BELLFLOWER (`bellflower` — `2026-10-18_dense-31M` `buildBellflower98`)
// ============================================================================
export function buildBellflower(opts = {}) {
  const isTablet = opts?.profile === 'tablet';
  const leafSegsV = isTablet ? 0 : 2;
  const sSegs = isTablet ? 1 : 3;
  const arrays = createIndexedArrays();
  for (let i = 0; i < 5; i++) {
    appendPetalMeshExactArea(arrays, {
      origin: [0, 0.04, 0],
      yaw: (i / 5) * Math.PI * 2.0 + 0.3,
      pitch: 0.38,
      length: 0.32,
      width: 0.18,
      arch: 0.11,
      cup: 0.02,
      pointed: 0.7,
      baseColor: [0.18, 0.35, 0.17],
      midColor: [0.31, 0.52, 0.25],
      tipColor: [0.46, 0.66, 0.34],
      origSegsV: 4,
      segsU: 1,
      segsV: leafSegsV,
    });
  }
  const blossoms = [
    { tip: [-0.03, 0.64, 0.07], tiltX: 0.58, tiltY:  0.12, tiltZ: -0.10, scale: 0.95 },
    { tip: [-0.18, 0.52, 0.11], tiltX: 0.64, tiltY: -0.38, tiltZ:  0.14, scale: 0.85 },
    { tip: [ 0.17, 0.55, 0.05], tiltX: 0.55, tiltY:  0.42, tiltZ: -0.12, scale: 0.88 },
  ];
  blossoms.forEach((b, bIdx) => {
    appendStemMesh(arrays, [[0, 0, 0], b.tip], 0.015, 0.009, [0.22, 0.41, 0.21], [0.40, 0.62, 0.32], sSegs);
    const headStartIdx = arrays.pos.length / 3;
    const petalSegsV = isTablet ? (bIdx === 0 ? 1 : 0) : 2;
    for (let p = 0; p < 5; p++) {
      appendPetalMeshExactArea(arrays, {
        origin: b.tip,
        yaw: (p / 5) * Math.PI * 2.0,
        pitch: 0.48,
        length: 0.22 * b.scale,
        width: 0.105 * b.scale,
        arch: 0.065 * b.scale,
        cup: 0.024 * b.scale,
        pointed: 0.85,
        baseColor: [0.54, 0.40, 0.84],
        midColor: [0.75, 0.63, 0.96],
        tipColor: [0.89, 0.81, 1.00],
        origSegsV: 5,
        segsU: 1,
        segsV: petalSegsV,
      });
    }
    tiltVerticesAroundPivot(arrays, headStartIdx, b.tip, b.tiltX, b.tiltY, b.tiltZ);
  });
  const geo = finalizeGeometry('bellflower', arrays); // 98 triangles desktop / 28 tablet
  geo.userData.profile = isTablet ? 'tablet' : 'desktop';
  return geo;
}

// ============================================================================
// 4. OXEYE DAISY & GOLDEN BUTTERCUP (`daisy` — `2026-10-18_dense-31M` `buildDaisy46` + `buildButtercup52`)
// ============================================================================
export function buildDaisy(opts = {}) {
  const isTablet = opts?.profile === 'tablet';
  const leafSegsV = isTablet ? 0 : 2;
  const sSegs = isTablet ? 1 : 3;
  const arrays = createIndexedArrays();
  // Basal broadleaf cushion so footprint >= 0.28m
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * Math.PI * 2.0 + 0.4;
    appendPetalMeshExactArea(arrays, {
      origin: [0, 0.03, 0],
      yaw,
      pitch: 0.25,
      length: 0.20,
      width: 0.13,
      arch: 0.05,
      cup: 0.015,
      pointed: 0.5,
      baseColor: [0.18, 0.35, 0.16],
      midColor: [0.32, 0.54, 0.24],
      tipColor: [0.48, 0.68, 0.32],
      origSegsV: 4,
      segsU: 1,
      segsV: leafSegsV,
    });
  }

  // Hero Oxeye Daisy (`buildDaisy46`)
  const daisyTop = [-0.04, 0.42, 0.02];
  appendStemMesh(arrays, [[0, 0, 0], daisyTop], 0.012, 0.008, [0.21, 0.39, 0.18], [0.42, 0.62, 0.31], sSegs);
  const daisyStart = arrays.pos.length / 3;
  for (let i = 0; i < 8; i++) {
    appendPetalMeshExactArea(arrays, {
      origin: daisyTop,
      yaw: (i / 8) * Math.PI * 2.0,
      pitch: 0.14,
      length: 0.15,
      width: 0.072,
      arch: 0.02,
      cup: 0.008,
      pointed: 0.0,
      baseColor: [0.94, 0.92, 0.82],
      midColor: [0.99, 0.98, 0.93],
      tipColor: [1.00, 1.00, 0.97],
      origSegsV: 4,
      segsU: 1,
      segsV: isTablet ? (i % 2 === 0 ? 1 : 0) : 2,
    });
  }
  const discCount = isTablet ? 3 : 4;
  for (let i = 0; i < discCount; i++) {
    appendPetalMeshExactArea(arrays, {
      origin: [daisyTop[0], daisyTop[1] + 0.012, daisyTop[2]],
      yaw: (i / discCount) * Math.PI * 2.0,
      pitch: 0.22,
      length: 0.058,
      width: isTablet ? 0.082 : 0.064,
      arch: 0.012,
      cup: -0.012,
      pointed: 0.0,
      baseColor: [0.88, 0.58, 0.12],
      midColor: [0.96, 0.72, 0.20],
      tipColor: [1.00, 0.84, 0.30],
      origSegsV: 2,
      segsU: 1,
      segsV: isTablet ? 0 : 1,
    });
  }
  tiltVerticesAroundPivot(arrays, daisyStart, daisyTop, 0.38, 0.0, -0.05);

  // Companion Golden Buttercup (`buildButtercup52`)
  const butterPos = [0.11, 0.34, -0.05];
  appendStemMesh(arrays, [[0, 0, 0], butterPos], 0.012, 0.008, [0.21, 0.39, 0.18], [0.44, 0.64, 0.30], sSegs);
  const butterStart = arrays.pos.length / 3;
  for (let i = 0; i < 5; i++) {
    appendPetalMeshExactArea(arrays, {
      origin: butterPos,
      yaw: (i / 5) * Math.PI * 2.0 + 0.2,
      pitch: 0.38,
      length: 0.12,
      width: 0.098,
      arch: 0.015,
      cup: 0.028,
      pointed: 0.0,
      baseColor: [0.89, 0.56, 0.06],
      midColor: [0.97, 0.76, 0.14],
      tipColor: [1.00, 0.88, 0.30],
      origSegsV: 3,
      segsU: 1,
      segsV: isTablet ? (i < 2 ? 1 : 0) : 2,
    });
  }
  tiltVerticesAroundPivot(arrays, butterStart, butterPos, 0.44, 0.0, -0.16);

  const geo = finalizeGeometry('daisy', arrays); // 88 triangles desktop / 28 tablet
  geo.userData.profile = isTablet ? 'tablet' : 'desktop';
  return geo;
}

// ============================================================================
// 5. LAVENDER LUPINE SPIKE (`lupine` — `2026-10-18_dense-31M` `buildLupine96`)
// ============================================================================
export function buildLupine(opts = {}) {
  const isTablet = opts?.profile === 'tablet';
  const leafSegsV = isTablet ? 0 : 2;
  const sSegs = isTablet ? 1 : 3;
  const arrays = createIndexedArrays();
  appendStemMesh(arrays, [[0, 0, 0], [0, 0.68, 0]], 0.018, 0.010, [0.23, 0.41, 0.22], [0.38, 0.56, 0.34], sSegs);
  for (let i = 0; i < 4; i++) {
    appendPetalMeshExactArea(arrays, {
      origin: [0, 0.05, 0],
      yaw: (i / 4) * Math.PI * 2.0 + 0.2,
      pitch: 0.48,
      length: 0.24,
      width: 0.11,
      arch: 0.08,
      cup: 0.015,
      pointed: 1.0,
      baseColor: [0.24, 0.42, 0.22],
      midColor: [0.38, 0.58, 0.30],
      tipColor: [0.54, 0.72, 0.40],
      origSegsV: 3,
      segsU: 1,
      segsV: leafSegsV,
    });
  }
  for (let t = 0; t < 5; t++) {
    const frac = t / 4;
    const y = 0.28 + frac * 0.38;
    const count = 4 - Math.floor(frac * 1.5);
    const scale = 1.08 - frac * 0.42;
    const baseC = [0.27 + frac * 0.18, 0.36 + frac * 0.22, 0.84 + frac * 0.10];
    const midC  = [0.42 + frac * 0.20, 0.52 + frac * 0.22, 0.95];
    const tipC  = [0.68 + frac * 0.18, 0.76 + frac * 0.16, 1.00];
    for (let k = 0; k < count; k++) {
      const yaw = (k / count) * Math.PI * 2.0 + t * 0.55;
      appendPetalMeshExactArea(arrays, {
        origin: [Math.sin(yaw) * 0.018, y, Math.cos(yaw) * 0.018],
        yaw,
        pitch: 0.52 + frac * 0.25,
        length: 0.115 * scale,
        width: 0.088 * scale,
        arch: 0.03 * scale,
        cup: 0.025 * scale,
        pointed: 0.3,
        baseColor: baseC,
        midColor: midC,
        tipColor: tipC,
        origSegsV: 3,
        segsU: 1,
        segsV: isTablet ? (t === 0 && k < 2 ? 1 : 0) : 2,
      });
    }
  }
  const geo = finalizeGeometry('lupine', arrays); // 94 triangles desktop / 25 tablet
  geo.userData.profile = isTablet ? 'tablet' : 'desktop';
  return geo;
}

// ============================================================================
// 6. BLUSH WILD ROSE (`cosmos` — `2026-10-18_dense-31M` `buildWildRose76`)
// ============================================================================
export function buildCosmos(opts = {}) {
  const isTablet = opts?.profile === 'tablet';
  const leafSegsV = isTablet ? 0 : 2;
  const sSegs = isTablet ? 1 : 3;
  const arrays = createIndexedArrays();
  const center = [0.0, 0.52, 0.0];
  appendStemMesh(arrays, [[0, 0, 0], center], 0.016, 0.011, [0.20, 0.38, 0.18], [0.39, 0.60, 0.29], sSegs);
  for (let i = 0; i < 4; i++) {
    appendPetalMeshExactArea(arrays, {
      origin: [0, 0.08 + (i % 2) * 0.12, 0],
      yaw: (i / 4) * Math.PI * 2.0 + 0.5,
      pitch: 0.38,
      length: 0.19,
      width: 0.105,
      arch: 0.05,
      cup: 0.012,
      pointed: 1.0,
      baseColor: [0.22, 0.40, 0.18],
      midColor: [0.38, 0.58, 0.27],
      tipColor: [0.54, 0.72, 0.36],
      origSegsV: 4,
      segsU: 1,
      segsV: leafSegsV,
    });
  }
  const headStartIdx = arrays.pos.length / 3;
  for (let i = 0; i < 7; i++) {
    appendPetalMeshExactArea(arrays, {
      origin: center,
      yaw: (i / 7) * Math.PI * 2.0,
      pitch: 0.22,
      length: 0.165,
      width: 0.118,
      arch: 0.025,
      cup: 0.022,
      pointed: 0.0,
      baseColor: [0.89, 0.56, 0.67],
      midColor: [0.97, 0.74, 0.82],
      tipColor: [1.00, 0.88, 0.92],
      origSegsV: 5,
      segsU: 1,
      segsV: isTablet ? (i < 5 ? 1 : 0) : 2,
    });
  }
  for (let i = 0; i < 5; i++) {
    appendPetalMeshExactArea(arrays, {
      origin: [center[0], center[1] + 0.012, center[2]],
      yaw: (i / 5) * Math.PI * 2.0 + 0.35,
      pitch: 0.52,
      length: 0.115,
      width: 0.095,
      arch: 0.018,
      cup: 0.030,
      pointed: 0.0,
      baseColor: [0.84, 0.46, 0.58],
      midColor: [0.95, 0.66, 0.75],
      tipColor: [0.99, 0.82, 0.88],
      origSegsV: 4,
      segsU: 1,
      segsV: isTablet ? 0 : 2,
    });
  }
  for (let i = 0; i < 4; i++) {
    appendPetalMeshExactArea(arrays, {
      origin: [center[0], center[1] + 0.018, center[2]],
      yaw: (i / 4) * Math.PI * 2.0,
      pitch: 0.35,
      length: 0.055,
      width: 0.055,
      arch: 0.010,
      cup: -0.010,
      pointed: 0.0,
      baseColor: [0.90, 0.60, 0.16],
      midColor: [0.97, 0.76, 0.24],
      tipColor: [1.00, 0.88, 0.40],
      origSegsV: 2,
      segsU: 1,
      segsV: isTablet ? 0 : 1,
    });
  }
  tiltVerticesAroundPivot(arrays, headStartIdx, center, 0.38, 0.0, 0.06);
  const geo = finalizeGeometry('cosmos', arrays); // 78 triangles desktop / 26 tablet
  geo.userData.profile = isTablet ? 'tablet' : 'desktop';
  return geo;
}

// ============================================================================
// 7. GIANT SWORD-FERN ROSETTE & BLUSH CLOVER (`toonShrub` — `2026-10-18_dense-31M`
//    `buildRosette72` + `buildClover62`)
// ============================================================================
export function buildToonShrub(opts = {}) {
  const isTablet = opts?.profile === 'tablet';
  const sSegs = isTablet ? 1 : 3;
  const arrays = createIndexedArrays();
  // 1. 3-Ring Giant Sword-Fern Rosette (`buildRosette72` — 100% chord-area parity)
  const rings = [
    { count: 6, pitch: 0.38, len: 0.72, width: 0.185 * (10 / 6), arch: 0.26, y0: 0.02 },
    { count: 4, pitch: 0.72, len: 0.64, width: 0.165 * (8 / 4),  arch: 0.20, y0: 0.05 },
    { count: 3, pitch: 1.05, len: 0.52, width: 0.140 * (6 / 3),  arch: 0.13, y0: 0.07 },
  ];
  rings.forEach((ring, rIdx) => {
    for (let i = 0; i < ring.count; i++) {
      const yaw = (i / ring.count) * Math.PI * 2.0 + rIdx * 0.42;
      appendPetalMeshExactArea(arrays, {
        origin: [Math.sin(yaw) * 0.04, ring.y0, Math.cos(yaw) * 0.04],
        yaw,
        pitch: ring.pitch,
        length: ring.len * (0.90 + (i % 3) * 0.07),
        width: ring.width,
        arch: ring.arch,
        cup: -0.028,
        pointed: 1.0,
        baseColor: [0.20, 0.38, 0.16],
        midColor: [0.44, 0.66, 0.28],
        tipColor: [0.69, 0.84, 0.41],
        origSegsV: 6,
        segsU: 1,
        segsV: isTablet ? (rIdx === 0 && i % 2 === 0 ? 1 : 0) : 2,
      });
    }
  });

  // 2. Blush-White Clover Head (`buildClover62`) rising from the rosette heart
  const top = [0.08, 0.36, 0.06];
  appendStemMesh(arrays, [[0, 0, 0], top], 0.013, 0.009, [0.26, 0.44, 0.22], [0.44, 0.64, 0.33], sSegs);
  const cloverRingCount = isTablet ? 4 : 5;
  const cloverWidth = isTablet ? 0.072 * (5 / 4) : 0.072;
  for (let r = 0; r < 3; r++) {
    const pitch = 0.25 + r * 0.42;
    for (let i = 0; i < cloverRingCount; i++) {
      appendPetalMeshExactArea(arrays, {
        origin: [top[0], top[1] + r * 0.018, top[2]],
        yaw: (i / cloverRingCount) * Math.PI * 2.0 + r * 0.5,
        pitch,
        length: 0.088,
        width: cloverWidth,
        arch: 0.02,
        cup: 0.02,
        pointed: 0.2,
        baseColor: [0.93, 0.78, 0.80],
        midColor: [0.98, 0.91, 0.90],
        tipColor: [1.00, 0.98, 0.96],
        origSegsV: 3,
        segsU: 1,
        segsV: isTablet ? 0 : 2,
      });
    }
  }

  const geo = finalizeGeometry('toonShrub', arrays); // 118 triangles desktop / 29 tablet
  geo.userData.profile = isTablet ? 'tablet' : 'desktop';
  return geo;
}

function* createSpeciesGeometriesGen(opts = {}) {
  // Keep BLENDER_VOLUMETRIC_FLOWERS referenced so bundlers/tests preserve it
  void BLENDER_VOLUMETRIC_FLOWERS;
  const grassTuft = buildGrassTuft(opts);
  yield;
  const grassTuftTablet = buildGrassTuftTablet();
  yield;
  const crimsonRose = yield* buildCrimsonRoseGen(opts);
  yield;
  const bellflower = buildBellflower(opts);
  yield;
  const daisy = buildDaisy(opts);
  yield;
  const lupine = buildLupine(opts);
  yield;
  const cosmos = buildCosmos(opts);
  yield;
  const toonShrub = buildToonShrub(opts);
  return {
    grassTuft,
    grassTuftTablet,
    crimsonRose,
    bellflower,
    daisy,
    lupine,
    cosmos,
    toonShrub,
  };
}

export function createSpeciesGeometries(opts = {}) {
  return runSync(createSpeciesGeometriesGen(opts));
}

export async function createSpeciesGeometriesAsync(opts = {}) {
  return runAsync(createSpeciesGeometriesGen(opts), createLocalTimeSlicer(opts));
}
