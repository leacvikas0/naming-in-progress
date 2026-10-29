import * as THREE from 'three';
import { smoothstep } from './rng.js';

// ---------------------------------------------------------------------------
// Shared geometry helper
// ---------------------------------------------------------------------------
function makeGeometry(positions, uvs, colors, indices) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------------------
// 1) GINKGO FAN LEAF
// Four concentric rings, 24-28 radial ribs, raised vein ridges, organic
// margin jitter and a curved tapering petiole.
// ---------------------------------------------------------------------------
export function createGinkgoGeometry(cfg) {
  const s = cfg.scale || 1.0;
  const pal = cfg.palette;

  const ribs = cfg.ribs || 26;
  const ringFractions = cfg.rings || [0.32, 0.58, 0.80, 1.0];
  const fanHalfAngle = cfg.fanHalfAngle || 1.20;
  const notchDepth = cfg.notchDepth != null ? cfg.notchDepth : 0.34;
  const notchWidth = cfg.notchWidth || 26.0;
  const lobeDepth = cfg.lobeDepth != null ? cfg.lobeDepth : 0.18;
  const scallopAmp = cfg.scallopAmp != null ? cfg.scallopAmp : 0.030;
  const scallopFreq = cfg.scallopFreq || 11;
  const veinRidge = cfg.veinRidge != null ? cfg.veinRidge : 0.020;
  const cupDepth = cfg.cupDepth != null ? cfg.cupDepth : 0.115;
  const edgeJitter = cfg.edgeJitter != null ? cfg.edgeJitter : 0.018;
  const seed = cfg.seed || 0;

  const stemColor = new THREE.Color(pal.stem);
  const baseColor = new THREE.Color(pal.base);
  const midColor = new THREE.Color(pal.mid);
  const tipColor = new THREE.Color(pal.tip);
  const veinColor = new THREE.Color(pal.vein);

  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  function pushVertex(x, y, z, u, v, col) {
    positions.push(x * s, y * s, z * s);
    uvs.push(u, v);
    colors.push(col.r, col.g, col.b);
    return (positions.length / 3) - 1;
  }

  // Curved, tapering petiole
  const stemSegs = 5;
  const stemLen = 0.44;
  const stemBaseW = 0.019;
  let prevL = -1;
  let prevR = -1;

  for (let k = 0; k <= stemSegs; k++) {
    const t = k / stemSegs;
    const y = 0.02 - t * stemLen;
    const bendX = Math.sin(t * Math.PI * 1.15) * 0.035;
    const bendZ = Math.sin(t * Math.PI) * 0.018;
    const w = stemBaseW * (1.0 - 0.58 * t);
    const col = stemColor.clone().lerp(baseColor, t * t);

    const l = pushVertex(bendX - w, y, bendZ, 0.48, 0.10 - t * 0.10, col);
    const r = pushVertex(bendX + w, y, bendZ, 0.52, 0.10 - t * 0.10, col);

    if (k > 0) indices.push(prevL, prevR, r, prevL, r, l);
    prevL = l;
    prevR = r;
  }

  // Blade
  const originZ = cupDepth * 0.30;
  const vOrigin = pushVertex(0, 0.0, originZ, 0.5, 0.22, baseColor);

  const ringVerts = [];

  for (let ri = 0; ri < ringFractions.length; ri++) {
    const rf = ringFractions[ri];
    const row = [];

    for (let i = 0; i <= ribs; i++) {
      const t = i / ribs;
      const frac = (t - 0.5) * 2.0;
      const theta = frac * fanHalfAngle;

      const notchDip = Math.exp(-(frac * frac) * notchWidth) * notchDepth;
      const scallop = Math.sin(t * Math.PI * scallopFreq) * scallopAmp *
                      (0.35 + 0.65 * Math.abs(frac));
      const lobeEnvelope = 0.88 + lobeDepth * Math.sin(Math.abs(frac) * Math.PI);
      const jitter = (hash01(i * 13.7 + seed * 57.3) - 0.5) * 2.0 * edgeJitter;

      const fullRadius = 0.64 * lobeEnvelope - notchDip + scallop + jitter;
      const radius = fullRadius * rf;

      const x = Math.sin(theta) * radius;
      const y = Math.cos(theta) * radius * 0.92 + 0.02;

      const cup = cupDepth * Math.cos(frac * Math.PI * 0.5) * (0.35 + 0.65 * rf);
      const arch = -0.045 * rf * rf;
      const ridge = (i % 2 === 1) ? veinRidge * rf : 0.0;
      const z = cup + arch + ridge;

      const col = rf <= 0.55
        ? baseColor.clone().lerp(midColor, rf / 0.55)
        : midColor.clone().lerp(tipColor, (rf - 0.55) / 0.45);
      const veinAmt = (i % 2 === 1 ? 0.50 : 0.08) * (0.25 + 0.75 * rf);
      col.lerp(veinColor, veinAmt);
      col.multiplyScalar(0.70 + 0.30 * rf);

      row.push(pushVertex(
        x, y, z,
        0.5 + Math.sin(theta) * (0.16 + 0.34 * rf),
        0.22 + 0.73 * rf,
        col
      ));
    }
    ringVerts.push(row);
  }

  const first = ringVerts[0];
  for (let i = 0; i < ribs; i++) indices.push(vOrigin, first[i], first[i + 1]);

  for (let ri = 0; ri < ringVerts.length - 1; ri++) {
    const a = ringVerts[ri];
    const b = ringVerts[ri + 1];
    for (let i = 0; i < ribs; i++) {
      indices.push(a[i], b[i], b[i + 1]);
      indices.push(a[i], b[i + 1], a[i + 1]);
    }
  }

  return makeGeometry(positions, uvs, colors, indices);
}

// ---------------------------------------------------------------------------
// 2) MAPLE LEAF - five pointed lobes around a polar outline
// ---------------------------------------------------------------------------
export function createMapleGeometry(cfg) {
  const s = cfg.scale || 1.0;
  const pal = cfg.palette;

  const R = cfg.radius || 0.58;
  const lobeCount = cfg.lobes || 5;
  const lobePow = cfg.lobePow != null ? cfg.lobePow : 0.90;
  const serration = cfg.serration != null ? cfg.serration : 0.05;
  const cupDepth = cfg.cupDepth != null ? cfg.cupDepth : 0.10;
  const segs = cfg.segs || 80;
  const ringFractions = cfg.rings || [0.24, 0.48, 0.70, 0.86, 1.0];
  const seed = cfg.seed || 0;

  const stemColor = new THREE.Color(pal.stem);
  const baseColor = new THREE.Color(pal.base);
  const midColor = new THREE.Color(pal.mid);
  const tipColor = new THREE.Color(pal.tip);
  const veinColor = new THREE.Color(pal.vein);

  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  function pushVertex(x, y, z, u, v, col) {
    positions.push(x * s, y * s, z * s);
    uvs.push(u, v);
    colors.push(col.r, col.g, col.b);
    return (positions.length / 3) - 1;
  }

  // Stem first, so the leaf grows out of it
  const stemSegs = 5;
  const stemLen = cfg.stemLen != null ? cfg.stemLen : 0.42;
  let prevL = -1;
  let prevR = -1;
  for (let k = 0; k <= stemSegs; k++) {
    const t = k / stemSegs;
    const y = -0.02 - t * stemLen;
    const bendX = Math.sin(t * Math.PI) * 0.02;
    const w = 0.020 * (1.0 - 0.5 * t);
    const col = stemColor.clone().lerp(baseColor, t * 0.8);
    const l = pushVertex(bendX - w, y, 0.0, 0.48, 0.10 - t * 0.08, col);
    const r = pushVertex(bendX + w, y, 0.0, 0.52, 0.10 - t * 0.08, col);
    if (k > 0) indices.push(prevL, prevR, r, prevL, r, l);
    prevL = l;
    prevR = r;
  }

  function radiusAt(theta) {
    // Sharp pointed lobes with deep sinuses between them
    const lobe = Math.pow(Math.abs(Math.cos(lobeCount * 0.5 * theta)), lobePow);
    const serr = 1 + Math.sin(theta * 30 + seed) * serration * (0.25 + 0.75 * lobe);
    return R * (0.22 + 0.78 * lobe) * serr;
  }

  const centerZ = cupDepth * 0.9;
  const vCenter = pushVertex(0, 0, centerZ, 0.5, 0.5, baseColor);

  const ringVerts = [];
  for (let ri = 0; ri < ringFractions.length; ri++) {
    const rf = ringFractions[ri];
    const row = [];
    for (let i = 0; i <= segs; i++) {
      const theta = -Math.PI + (i / segs) * Math.PI * 2.0;
      const r = radiusAt(theta) * rf;

      const x = Math.sin(theta) * r;
      const y = Math.cos(theta) * r;

      const cup = cupDepth * (1.0 - rf * rf);
      const wrinkle = Math.sin(theta * 10 + seed) * 0.010 * rf;
      const z = cup + wrinkle - 0.03 * rf * rf;

      const col = rf <= 0.55
        ? baseColor.clone().lerp(midColor, rf / 0.55)
        : midColor.clone().lerp(tipColor, (rf - 0.55) / 0.45);
      const lobeAxis = Math.abs(Math.cos(lobeCount * 0.5 * theta));
      const veinAmt = (lobeAxis > 0.90 ? 0.30 : 0.05) * (0.2 + 0.8 * rf);
      col.lerp(veinColor, veinAmt);
      col.multiplyScalar(0.62 + 0.38 * rf);

      row.push(pushVertex(
        x, y, z,
        0.5 + Math.sin(theta) * 0.5 * rf,
        0.5 + Math.cos(theta) * 0.5 * rf,
        col
      ));
    }
    ringVerts.push(row);
  }

  const first = ringVerts[0];
  for (let i = 0; i < segs; i++) indices.push(vCenter, first[i], first[i + 1]);

  for (let ri = 0; ri < ringVerts.length - 1; ri++) {
    const a = ringVerts[ri];
    const b = ringVerts[ri + 1];
    for (let i = 0; i < segs; i++) {
      indices.push(a[i], b[i], b[i + 1]);
      indices.push(a[i], b[i + 1], a[i + 1]);
    }
  }

  return makeGeometry(positions, uvs, colors, indices);
}

// ---------------------------------------------------------------------------
// 3) BLOSSOM PETAL (sakura / rose) - a cupped blade with a width profile,
//    optional V notch at the tip
// ---------------------------------------------------------------------------
export function createBlossomGeometry(cfg) {
  const s = cfg.scale || 1.0;
  const pal = cfg.palette;

  const L = cfg.length || 1.0;
  const W = cfg.width || 0.34;
  const rows = cfg.rows || 12;
  const cols = cfg.cols || 12;
  const widthPow = cfg.widthPow != null ? cfg.widthPow : 0.80;
  const notch = cfg.notch != null ? cfg.notch : 0.0;
  const cupDepth = cfg.cupDepth != null ? cfg.cupDepth : 0.13;
  const skew = cfg.skew || 0;
  const stemLen = cfg.stemLen != null ? cfg.stemLen : 0.10;
  const seed = cfg.seed || 0;
  const tipStyle = cfg.tipStyle || 'point';

  const stemColor = new THREE.Color(pal.stem);
  const baseColor = new THREE.Color(pal.base);
  const midColor = new THREE.Color(pal.mid);
  const tipColor = new THREE.Color(pal.tip);
  const veinColor = new THREE.Color(pal.vein);

  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  function pushVertex(x, y, z, u, v, col) {
    positions.push(x * s, y * s, z * s);
    uvs.push(u, v);
    colors.push(col.r, col.g, col.b);
    return (positions.length / 3) - 1;
  }

  // Short stem
  let prevL = -1;
  let prevR = -1;
  const stemSegs = 3;
  for (let k = 0; k <= stemSegs; k++) {
    const t = k / stemSegs;
    const y = -t * stemLen;
    const w = 0.014 * (1.0 - 0.5 * t);
    const col = stemColor.clone().lerp(baseColor, t);
    const l = pushVertex(-w, y, 0, 0.48, 0.06 - t * 0.06, col);
    const r = pushVertex(w, y, 0, 0.52, 0.06 - t * 0.06, col);
    if (k > 0) indices.push(prevL, prevR, r, prevL, r, l);
    prevL = l;
    prevR = r;
  }

  // Blade grid
  const grid = [];
  for (let v = 0; v <= rows; v++) {
    const u = v / rows;
    let wProfile;
    if (tipStyle === 'broad') {
      // Narrow base, wide shoulders, rounded outer edge. The notch is cut
      // separately below.
      wProfile = smoothstep(0.0, 0.30, u) * (1.0 - 0.45 * smoothstep(0.86, 1.0, u));
    } else {
      wProfile = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), widthPow);
    }
    const w = W * wProfile;
    const row = [];

    for (let c = 0; c <= cols; c++) {
      const t = (c / cols) * 2.0 - 1.0;

      let x = w * t + skew * u * u;
      let y = u * L;

      // V notch at the tip (sakura signature)
      y -= notch * Math.exp(-(t * t) * 3.5) * smoothstep(0.72, 1.0, u);

      // Cup across the width, curl along the length, faint organic wrinkle
      const z = cupDepth * (1.0 - t * t) * (0.45 + 0.55 * u)
              - 0.10 * u * u
              + Math.sin(t * 3.0 + seed) * 0.006 * u;

      const col = u <= 0.45
        ? baseColor.clone().lerp(midColor, u / 0.45)
        : midColor.clone().lerp(tipColor, (u - 0.45) / 0.55);
      const veinAmt = (c % 4 === 0 ? 0.12 : 0.02) * (0.2 + 0.8 * u);
      col.lerp(veinColor, veinAmt);
      col.multiplyScalar(0.80 + 0.20 * u);

      row.push(pushVertex(x, y, z, 0.5 + t * 0.5, u, col));
    }
    grid.push(row);
  }

  for (let v = 0; v < rows; v++) {
    for (let c = 0; c < cols; c++) {
      const a = grid[v][c];
      const b = grid[v][c + 1];
      const d = grid[v + 1][c];
      const e = grid[v + 1][c + 1];
      indices.push(a, d, e);
      indices.push(a, e, b);
    }
  }

  return makeGeometry(positions, uvs, colors, indices);
}
