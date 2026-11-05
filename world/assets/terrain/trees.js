import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TREES,
  terrainHeightAt,
  clamp,
} from './geography.js';

/**
 * Ghibli Gouache Leaf-Card & 3D Shingled-Petal Wisteria Trees (`world/assets/terrain/trees.js`).
 *
 * Engineered to match `docs/references/visual-concepts/01-title.png` from all 360° horizontal
 * and overhead angles in a SINGLE merged draw call (`1` draw call for all 69 valley trees):
 * 1. Asymmetric Multi-Crown Gnarled Trunks & Spreading Boughs:
 *    - Each tree splits into 2–3 distinct, separated branch sub-crowns at varied heights and reaches
 *      with visible chestnut limbs and sky gaps between crowns (never a single uniform mushroom ball).
 * 2. Proxy-Normal Gouache Leaf-Cluster Cards (`alphaTest` cutout, `transparent: false`):
 *    - Procedural 1024×512 Gouache Botanical Atlas with pointed painted leaf clusters and 5-petal
 *      white crown blossoms, using spherical proxy normals for plush Ghibli cloud shading.
 * 3. True 3D Shingled-Petal Wisteria Racemes (`addShingledPetalWisteriaRaceme`):
 *    - Sculpted from 20 overlapping, downward-cupped 3D hooded pea-blossom petals spiraling down
 *      curved stems along the outer canopy rims (deep violet-orchid calyx -> luminous lavender-lilac
 *      mid-florets -> creamy blush-white bottom buds).
 */

const TAU = Math.PI * 2;
const srgbColor = (hex) => new THREE.Color(hex);

const SUN_DIR = new THREE.Vector3(-0.21, 0.28, -0.93).normalize();
const LIGHT_TINT = new THREE.Color(1, 1, 1);
const FOG_COLOR = new THREE.Color(0xd8eef5);

export const TREE_STYLE = {
  uCel: { value: 1.0 },
  uRim: { value: 0.74 },
  uRimColor: { value: new THREE.Color(0xf2ffa8) },
};

export function setTreeSunDirection(dir) {
  if (!dir) return;
  SUN_DIR.set(dir.x, dir.y, dir.z).normalize();
}

export function setTreeTimeOfDay(daylight = 1.0, lightTint = null, fogColor = null) {
  if (lightTint) LIGHT_TINT.copy(lightTint);
  if (fogColor) FOG_COLOR.copy(fogColor);
  const rimScale = 0.34 + 0.42 * Math.max(0, Math.min(1, daylight));
  TREE_STYLE.uRim.value = rimScale;
}

function createPRNG(seed) {
  let s = (seed >>> 0) || 1337;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const PAL = {
  barkSun: srgbColor(0x8e5636),
  barkShd: srgbColor(0x5c3620),
  barkDeep: srgbColor(0x3f2212),

  foliageTopSun: srgbColor(0xcef474),
  foliageMidSun: srgbColor(0x7ecb4a),
  foliageLowSun: srgbColor(0x529e3a),
  foliageShdTop: srgbColor(0x4a9438),
  foliageShdLow: srgbColor(0x2e6c28),

  // 3D Shingled-Petal Wisteria Palette (matching 01-title.png)
  wistCalyxSun:  srgbColor(0x7c3aed),
  wistCalyxShd:  srgbColor(0x4c1d95),
  wistUpperSun:  srgbColor(0xa855f7),
  wistUpperShd:  srgbColor(0x6d28d9),
  wistMidSun:    srgbColor(0xd8b4fe),
  wistMidShd:    srgbColor(0x9333ea),
  wistLowerSun:  srgbColor(0xf5d0fe),
  wistLowerShd:  srgbColor(0xc084fc),
  wistBudTipSun: srgbColor(0xfff5fd),
  wistBudTipShd: srgbColor(0xe9d5ff),

  // Sakura Blossom Cascade Palette
  sakuraCalyxSun:  srgbColor(0xdb2777),
  sakuraCalyxShd:  srgbColor(0x831843),
  sakuraUpperSun:  srgbColor(0xf472b6),
  sakuraUpperShd:  srgbColor(0xbe185d),
  sakuraMidSun:    srgbColor(0xfbcfe8),
  sakuraMidShd:    srgbColor(0xdb2777),
  sakuraLowerSun:  srgbColor(0xfce7f3),
  sakuraLowerShd:  srgbColor(0xf472b6),
  sakuraBudTipSun: srgbColor(0xfff9fc),
  sakuraBudTipShd: srgbColor(0xfbcfe8),
};

// ============================================================================
// Procedural 1024×512 Gouache Leaf & Crown-Blossom Atlas (Works in Browser + Node)
// ============================================================================
let _cachedFoliageAtlas = null;

export function getSharedGouacheFoliageAtlas() {
  if (_cachedFoliageAtlas) return _cachedFoliageAtlas;

  const W = 1024;
  const H = 512;

  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, W, H);

      const drawGouacheLeaf = (cx, cy, len, wid, angle, baseHex, midHex, tipHex, rimHex, darkOutline = '#285c24') => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        const grad = ctx.createLinearGradient(0, -len * 0.45, 0, len * 0.55);
        grad.addColorStop(0.0, baseHex);
        grad.addColorStop(0.50, midHex);
        grad.addColorStop(0.88, tipHex);
        grad.addColorStop(1.0, rimHex);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, -len * 0.48);
        ctx.bezierCurveTo(wid * 0.68, -len * 0.18, wid * 0.60, len * 0.26, 0, len * 0.54);
        ctx.bezierCurveTo(-wid * 0.60, len * 0.26, -wid * 0.68, -len * 0.18, 0, -len * 0.48);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = darkOutline;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.strokeStyle = rimHex;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = Math.max(1.4, wid * 0.06);
        ctx.beginPath();
        ctx.moveTo(0, -len * 0.30);
        ctx.lineTo(0, len * 0.38);
        ctx.stroke();
        ctx.restore();
      };

      const drawCrownFlower = (cx, cy, radius, rot, petalHex, shdHex) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * TAU;
          ctx.save();
          ctx.rotate(a);
          const g = ctx.createRadialGradient(0, radius * 0.35, 1, 0, radius * 0.45, radius * 0.68);
          g.addColorStop(0, shdHex);
          g.addColorStop(0.45, petalHex);
          g.addColorStop(1, '#ffffff');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, radius * 0.10);
          ctx.bezierCurveTo(radius * 0.38, radius * 0.28, radius * 0.34, radius * 0.86, 0, radius * 0.98);
          ctx.bezierCurveTo(-radius * 0.34, radius * 0.86, -radius * 0.38, radius * 0.28, 0, radius * 0.10);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = '#ffbe32';
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.23, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff5b8';
        ctx.beginPath();
        ctx.arc(-radius * 0.05, -radius * 0.05, radius * 0.11, 0, TAU);
        ctx.fill();
        ctx.restore();
      };

      // Left Tile (0..512): Ragged Star-Burst Gouache Leaf Cluster
      {
        const rand = createPRNG(101);
        const ox = 256, oy = 256;
        const outerSpokes = 12;
        for (let i = 0; i < outerSpokes; i++) {
          const a = (i / outerSpokes) * TAU + (rand() - 0.5) * 0.16;
          const r = 96 + (i % 3) * 26 + rand() * 16;
          drawGouacheLeaf(
            ox + Math.cos(a) * r,
            oy + Math.sin(a) * r,
            152 + (i % 2) * 22,
            76 + rand() * 14,
            a - Math.PI * 0.5 + (rand() - 0.5) * 0.28,
            '#3b7a30', '#5cae40', '#88d652', '#b8f06c'
          );
        }
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + 0.25 + (rand() - 0.5) * 0.20;
          const r = 46 + rand() * 42;
          drawGouacheLeaf(
            ox + Math.cos(a) * r,
            oy + Math.sin(a) * r,
            134 + rand() * 20,
            72 + rand() * 14,
            a - Math.PI * 0.5 + (rand() - 0.5) * 0.30,
            '#468a36', '#70c048', '#9ee25e', '#caf678'
          );
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + rand() * 0.35;
          const r = 18 + rand() * 24;
          drawGouacheLeaf(
            ox + Math.cos(a) * r,
            oy + Math.sin(a) * r,
            116 + rand() * 16,
            66 + rand() * 12,
            a - Math.PI * 0.5 + (rand() - 0.5) * 0.35,
            '#58a240', '#84d052', '#b6ee6a', '#defa8c'
          );
        }
      }

      // Right Tile (512..1024): Ragged Leaf Sprig + White 5-Petal Crown Flowers
      {
        const rand = createPRNG(202);
        const ox = 512 + 256, oy = 256;
        const outerSpokes = 12;
        for (let i = 0; i < outerSpokes; i++) {
          const a = (i / outerSpokes) * TAU + (rand() - 0.5) * 0.16;
          const r = 94 + (i % 3) * 24 + rand() * 16;
          drawGouacheLeaf(
            ox + Math.cos(a) * r,
            oy + Math.sin(a) * r,
            150 + (i % 2) * 22,
            74 + rand() * 14,
            a - Math.PI * 0.5 + (rand() - 0.5) * 0.28,
            '#3b7a30', '#5cae40', '#8ad652', '#baee6c'
          );
        }
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + 0.3 + (rand() - 0.5) * 0.20;
          const r = 44 + rand() * 42;
          drawGouacheLeaf(
            ox + Math.cos(a) * r,
            oy + Math.sin(a) * r,
            130 + rand() * 18,
            70 + rand() * 14,
            a - Math.PI * 0.5 + (rand() - 0.5) * 0.30,
            '#488c38', '#74c248', '#a2e45e', '#ccf678'
          );
        }
        drawCrownFlower(ox - 54, oy - 42, 52, 0.3, '#fff6fa', '#dec2d0');
        drawCrownFlower(ox + 62, oy + 26, 46, 1.1, '#fff8fb', '#e2c8d4');
        drawCrownFlower(ox - 10, oy + 66, 40, 2.0, '#fff6fa', '#e0c6d2');
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      _cachedFoliageAtlas = tex;
      return tex;
    }
  }

  // Fallback RGBA DataTexture for headless Node.js unit tests (verify.mjs)
  const data = new Uint8Array(64 * 32 * 4);
  for (let i = 0; i < 64 * 32; i++) {
    data[i * 4] = 135;
    data[i * 4 + 1] = 210;
    data[i * 4 + 2] = 85;
    data[i * 4 + 3] = 255;
  }
  const fallbackTex = new THREE.DataTexture(data, 64, 32, THREE.RGBAFormat);
  fallbackTex.needsUpdate = true;
  _cachedFoliageAtlas = fallbackTex;
  return fallbackTex;
}

class TreeGeometryBuilder {
  constructor(crownCenter) {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.shadowColors = [];
    this.crownCenters = [];
    this.windWeights = [];
    this.cardModes = []; // 0.0 = bark, 1.0 = leaf card, 2.0 = 3D shingled wisteria/sakura petal
    this.indices = [];
    this.vCount = 0;
    this.crownCenter = crownCenter;
  }

  addVertex(x, y, z, nx, ny, nz, u, v, sunCol, shdCol, wind = 0.0, mode = 0.0) {
    this.positions.push(x, y, z);
    const nLen = Math.hypot(nx, ny, nz) || 1;
    this.normals.push(nx / nLen, ny / nLen, nz / nLen);
    this.uvs.push(u, v);
    this.colors.push(sunCol.r, sunCol.g, sunCol.b);
    this.shadowColors.push(shdCol.r, shdCol.g, shdCol.b);
    this.crownCenters.push(this.crownCenter[0], this.crownCenter[1], this.crownCenter[2]);
    this.windWeights.push(wind);
    this.cardModes.push(mode);
    return this.vCount++;
  }

  addTaperedLimb(points, rStart, rEnd, sides = 6, flare = 0.0) {
    const n = points.length;
    const rings = [];
    const tangent = new THREE.Vector3();
    const right = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const ref = new THREE.Vector3();

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let r = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.78));
      if (flare > 0.0 && t < 0.38) {
        r += Math.pow(1.0 - t / 0.38, 2.2) * flare * rStart;
      }

      if (i === 0) tangent.subVectors(points[1], points[0]);
      else if (i === n - 1) tangent.subVectors(points[n - 1], points[n - 2]);
      else tangent.subVectors(points[i + 1], points[i - 1]);
      tangent.normalize();

      if (Math.abs(tangent.y) > 0.92) ref.set(1, 0, 0);
      else ref.set(0, 1, 0);
      right.crossVectors(tangent, ref).normalize();
      fwd.crossVectors(right, tangent).normalize();

      const sunC = PAL.barkSun.clone().lerp(PAL.barkShd, t * 0.35);
      const shdC = PAL.barkShd.clone().lerp(PAL.barkDeep, t * 0.35);

      const ring = [];
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * TAU;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const ridge = flare > 0.0 && t < 0.35 ? 1.0 + 0.24 * (1.0 - t / 0.35) * Math.cos(ang * 5.0) : 1.0;
        const rad = r * ridge;

        const nx = right.x * ca + fwd.x * sa;
        const ny = right.y * ca + fwd.y * sa;
        const nz = right.z * ca + fwd.z * sa;

        ring.push(
          this.addVertex(
            points[i].x + nx * rad,
            points[i].y + ny * rad,
            points[i].z + nz * rad,
            nx,
            ny,
            nz,
            k / sides,
            t,
            sunC,
            shdC,
            0.0,
            0.0
          )
        );
      }
      rings.push(ring);
    }

    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const nk = (k + 1) % sides;
        const a = rings[i][k];
        const b = rings[i + 1][k];
        const c = rings[i + 1][nk];
        const d = rings[i][nk];
        this.indices.push(a, b, d, b, c, d);
      }
    }
  }

  addLeafCard({
    center,
    lobeCenter,
    cardNormal,
    cardRadius = 0.95,
    cupDepth = 0.16,
    roll = 0,
    tileIndex = 0,
    hCrownFrac = 0.5,
    aoFactor = 1.0,
  }) {
    const upRef = Math.abs(cardNormal.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tRight = new THREE.Vector3().crossVectors(upRef, cardNormal).normalize();
    const tUp = new THREE.Vector3().crossVectors(cardNormal, tRight).normalize();

    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const axX = tRight.clone().multiplyScalar(cr).addScaledVector(tUp, sr);
    const axY = tUp.clone().multiplyScalar(cr).addScaledVector(tRight, -sr);

    const u0 = tileIndex === 1 ? 0.51 : 0.01;
    const u1 = tileIndex === 1 ? 0.99 : 0.49;
    const v0 = 0.02;
    const v1 = 0.98;
    const uMid = (u0 + u1) * 0.5;
    const vMid = (v0 + v1) * 0.5;

    const sunCol = PAL.foliageLowSun
      .clone()
      .lerp(PAL.foliageMidSun, smoothstep(0.12, 0.62, hCrownFrac) * aoFactor)
      .lerp(PAL.foliageTopSun, smoothstep(0.52, 0.96, hCrownFrac) * aoFactor);
    const shdCol = PAL.foliageShdLow
      .clone()
      .lerp(PAL.foliageShdTop, smoothstep(0.22, 0.88, hCrownFrac) * aoFactor);

    const corners = [
      { lx: -1, ly: -1, u: u0, v: v0 },
      { lx:  1, ly: -1, u: u1, v: v0 },
      { lx:  1, ly:  1, u: u1, v: v1 },
      { lx: -1, ly:  1, u: u0, v: v1 },
    ];

    const cPos = center.clone().addScaledVector(cardNormal, cupDepth);
    const cProxyN = cPos
      .clone()
      .sub(lobeCenter)
      .normalize()
      .lerp(
        new THREE.Vector3(
          cPos.x - this.crownCenter[0],
          cPos.y - this.crownCenter[1] + 0.75,
          cPos.z - this.crownCenter[2]
        ).normalize(),
        0.42
      )
      .normalize();

    const wind = clamp(0.22 + 0.38 * hCrownFrac, 0.15, 0.65);

    const iCenter = this.addVertex(
      cPos.x,
      cPos.y,
      cPos.z,
      cProxyN.x,
      cProxyN.y,
      cProxyN.z,
      uMid,
      vMid,
      sunCol,
      shdCol,
      wind,
      1.0
    );

    const cornerIndices = [];
    for (const c of corners) {
      const vx = center.x + (axX.x * c.lx + axY.x * c.ly) * cardRadius;
      const vy = center.y + (axX.y * c.lx + axY.y * c.ly) * cardRadius;
      const vz = center.z + (axX.z * c.lx + axY.z * c.ly) * cardRadius;

      const lnx = vx - lobeCenter.x;
      const lny = (vy - lobeCenter.y) * 1.35 + 0.25;
      const lnz = vz - lobeCenter.z;
      const lLen = Math.hypot(lnx, lny, lnz) || 1;

      const cnx = vx - this.crownCenter[0];
      const cny = vy - this.crownCenter[1] + 0.75;
      const cnz = vz - this.crownCenter[2];
      const cLen = Math.hypot(cnx, cny, cnz) || 1;

      const nx = (lnx / lLen) * 0.65 + (cnx / cLen) * 0.35;
      const ny = (lny / lLen) * 0.65 + (cny / cLen) * 0.35;
      const nz = (lnz / lLen) * 0.65 + (cnz / cLen) * 0.35;

      cornerIndices.push(
        this.addVertex(vx, vy, vz, nx, ny, nz, c.u, c.v, sunCol, shdCol, wind * 1.15, 1.0)
      );
    }

    this.indices.push(
      iCenter, cornerIndices[0], cornerIndices[1],
      iCenter, cornerIndices[1], cornerIndices[2],
      iCenter, cornerIndices[2], cornerIndices[3],
      iCenter, cornerIndices[3], cornerIndices[0]
    );
  }

  /**
   * Sculpts a 3D Shingled-Petal Wisteria / Sakura Raceme (`addShingledPetalWisteriaRaceme`):
   * 18 overlapping, downward-cupped 3D hooded flower petals spiraling down a slender curved stem.
   */
  addShingledPetalWisteriaRaceme({
    topX,
    topY,
    topZ,
    length = 1.45,
    topRadius = 0.24,
    swayX = 0.08,
    swayZ = 0.06,
    kind = 'wisteria',
    seed = 1,
  }) {
    const rand = createPRNG(seed);
    const isSakura = kind === 'sakura';
    const floretCount = 18;
    const goldenAngle = 2.3999632;
    const rotStart = rand() * TAU;

    const cCalyxSun  = isSakura ? PAL.sakuraCalyxSun  : PAL.wistCalyxSun;
    const cCalyxShd  = isSakura ? PAL.sakuraCalyxShd  : PAL.wistCalyxShd;
    const cUpperSun  = isSakura ? PAL.sakuraUpperSun  : PAL.wistUpperSun;
    const cUpperShd  = isSakura ? PAL.sakuraUpperShd  : PAL.wistUpperShd;
    const cMidSun    = isSakura ? PAL.sakuraMidSun    : PAL.wistMidSun;
    const cMidShd    = isSakura ? PAL.sakuraMidShd    : PAL.wistMidShd;
    const cLowerSun  = isSakura ? PAL.sakuraLowerSun  : PAL.wistLowerSun;
    const cLowerShd  = isSakura ? PAL.sakuraLowerShd  : PAL.wistLowerShd;
    const cBudTipSun = isSakura ? PAL.sakuraBudTipSun : PAL.wistBudTipSun;
    const cBudTipShd = isSakura ? PAL.sakuraBudTipShd : PAL.wistBudTipShd;

    const baseSun = new THREE.Color();
    const baseShd = new THREE.Color();
    const bellySun = new THREE.Color();
    const bellyShd = new THREE.Color();
    const tipSun = new THREE.Color();
    const tipShd = new THREE.Color();

    for (let i = 0; i < floretCount; i++) {
      const t = i / (floretCount - 1);
      const env = Math.sin(Math.pow(t, 0.55) * Math.PI * 0.92) * (1.0 - t * 0.35) + 0.14 * (1.0 - t);
      const ringR = topRadius * env * (0.55 + 0.25 * (i % 2));
      const theta = rotStart + i * goldenAngle + (rand() - 0.5) * 0.18;

      const cx = topX + swayX * t * t + Math.cos(theta) * ringR * 0.48;
      const cy = topY - t * length;
      const cz = topZ + swayZ * t * t + Math.sin(theta) * ringR * 0.48;

      const petalLen = (0.31 - t * 0.14) * (topRadius / 0.24) * (0.92 + rand() * 0.16);
      const petalWid = (0.21 - t * 0.09) * (topRadius / 0.24) * (0.92 + rand() * 0.16);
      const cupOut   = petalWid * 0.58;

      const dirX = Math.cos(theta);
      const dirZ = Math.sin(theta);
      const sideX = -dirZ;
      const sideZ = dirX;

      baseSun.copy(cCalyxSun).lerp(cUpperSun, smoothstep(0.0, 0.75, t));
      baseShd.copy(cCalyxShd).lerp(cUpperShd, smoothstep(0.0, 0.75, t));

      bellySun
        .copy(cUpperSun)
        .lerp(cMidSun, smoothstep(0.12, 0.52, t))
        .lerp(cLowerSun, smoothstep(0.48, 0.88, t));
      bellyShd
        .copy(cUpperShd)
        .lerp(cMidShd, smoothstep(0.12, 0.52, t))
        .lerp(cLowerShd, smoothstep(0.48, 0.88, t));

      tipSun
        .copy(cMidSun)
        .lerp(cLowerSun, smoothstep(0.08, 0.45, t))
        .lerp(cBudTipSun, smoothstep(0.35, 0.85, t));
      tipShd
        .copy(cMidShd)
        .lerp(cLowerShd, smoothstep(0.08, 0.45, t))
        .lerp(cBudTipShd, smoothstep(0.35, 0.85, t));

      const wind = THREE.MathUtils.lerp(0.55, 0.98, Math.pow(t, 0.82));

      const v0 = this.addVertex(
        cx,
        cy + petalLen * 0.18,
        cz,
        dirX * 0.4,
        0.75,
        dirZ * 0.4,
        0.5,
        0.0,
        baseSun,
        baseShd,
        wind * 0.85,
        2.0
      );
      const v1 = this.addVertex(
        cx + dirX * cupOut * 0.55 - sideX * petalWid * 0.78,
        cy - petalLen * 0.18,
        cz + dirZ * cupOut * 0.55 - sideZ * petalWid * 0.78,
        dirX * 0.6 - sideX * 0.5,
        0.35,
        dirZ * 0.6 - sideZ * 0.5,
        0.0,
        0.35,
        bellySun,
        bellyShd,
        wind,
        2.0
      );
      const v2 = this.addVertex(
        cx + dirX * cupOut * 0.55 + sideX * petalWid * 0.78,
        cy - petalLen * 0.18,
        cz + dirZ * cupOut * 0.55 + sideZ * petalWid * 0.78,
        dirX * 0.6 + sideX * 0.5,
        0.35,
        dirZ * 0.6 + sideZ * 0.5,
        1.0,
        0.35,
        bellySun,
        bellyShd,
        wind,
        2.0
      );
      const v3 = this.addVertex(
        cx + dirX * cupOut * 1.18,
        cy - petalLen * 0.36,
        cz + dirZ * cupOut * 1.18,
        dirX,
        0.28,
        dirZ,
        0.5,
        0.5,
        tipSun,
        bellyShd,
        wind,
        2.0
      );
      const v4 = this.addVertex(
        cx + dirX * cupOut * 0.68 - sideX * petalWid * 0.92,
        cy - petalLen * 0.64,
        cz + dirZ * cupOut * 0.68 - sideZ * petalWid * 0.92,
        dirX * 0.5 - sideX * 0.6,
        0.05,
        dirZ * 0.5 - sideZ * 0.6,
        0.1,
        0.75,
        tipSun,
        tipShd,
        wind * 1.05,
        2.0
      );
      const v5 = this.addVertex(
        cx + dirX * cupOut * 0.68 + sideX * petalWid * 0.92,
        cy - petalLen * 0.64,
        cz + dirZ * cupOut * 0.68 + sideZ * petalWid * 0.92,
        dirX * 0.5 + sideX * 0.6,
        0.05,
        dirZ * 0.5 + sideZ * 0.6,
        0.9,
        0.75,
        tipSun,
        tipShd,
        wind * 1.05,
        2.0
      );
      const v6 = this.addVertex(
        cx + dirX * cupOut * 0.42,
        cy - petalLen * 1.0,
        cz + dirZ * cupOut * 0.42,
        dirX * 0.6,
        -0.35,
        dirZ * 0.6,
        0.5,
        1.0,
        tipSun,
        tipShd,
        wind * 1.1,
        2.0
      );

      this.indices.push(
        v0, v1, v3,
        v0, v3, v2,
        v1, v4, v3,
        v3, v5, v2,
        v4, v6, v3,
        v3, v6, v5
      );
    }
  }

  toGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setAttribute('aShadowColor', new THREE.Float32BufferAttribute(this.shadowColors, 3));
    geo.setAttribute('aCrownCenter', new THREE.Float32BufferAttribute(this.crownCenters, 3));
    geo.setAttribute('aWindWeight', new THREE.Float32BufferAttribute(this.windWeights, 1));
    geo.setAttribute('aCardMode', new THREE.Float32BufferAttribute(this.cardModes, 1));
    geo.setIndex(this.indices);
    return geo;
  }
}

export function buildSingleTreeGeometry(t, treeIdx = 0) {
  const ty = terrainHeightAt(t.x, t.z);
  const kind = t.kind || 'oak';
  const isWisteria = kind === 'wisteria';
  const isSakura = kind === 'sakura';
  const isShrine = Boolean(t.hasPlanter);
  const s = (t.scale || 1.0) * (isWisteria || isSakura ? 1.12 : 1.04);

  const rand = createPRNG(1009 + treeIdx * 137);
  const randRange = (lo, hi) => lo + rand() * (hi - lo);

  const worldOrigin = new THREE.Vector3(t.x, ty, t.z);
  const crownCenter = [worldOrigin.x, worldOrigin.y + 3.55 * s, worldOrigin.z];
  const builder = new TreeGeometryBuilder(crownCenter);

  const yawRot = (treeIdx * 2.17 + 0.45) % TAU;

  // 1. Sturdy Gnarled Chestnut Trunk with Root Buttress Flare
  const leanX = (rand() - 0.5) * 0.42 * s;
  const leanZ = (rand() - 0.5) * 0.36 * s;
  const trunkPts = [
    new THREE.Vector3(worldOrigin.x, worldOrigin.y - 0.14, worldOrigin.z),
    new THREE.Vector3(worldOrigin.x + leanX * 0.45, worldOrigin.y + 0.66 * s, worldOrigin.z + leanZ * 0.45),
    new THREE.Vector3(worldOrigin.x + leanX * 0.88, worldOrigin.y + 1.34 * s, worldOrigin.z + leanZ * 0.88),
    new THREE.Vector3(worldOrigin.x + leanX * 0.70, worldOrigin.y + 1.98 * s, worldOrigin.z + leanZ * 0.70),
  ];
  const rTrunkBase = (isWisteria || isSakura ? 0.38 : 0.32) * s;
  const rTrunkFork = (isWisteria || isSakura ? 0.23 : 0.19) * s;
  builder.addTaperedLimb(trunkPts, rTrunkBase, rTrunkFork, 7, 0.68);

  // 2. 6 Asymmetric Multi-Height Umbrella Boughs & Separated Sub-Crowns
  const boughCount = 6;
  const lobes = [];

  for (let b = 0; b < boughCount; b++) {
    const az = yawRot + (b / boughCount) * TAU + randRange(-0.22, 0.22);
    const isLowerShelf = b % 2 === 0;
    const reach = (isLowerShelf ? randRange(2.05, 2.55) : randRange(1.45, 1.95)) * s;
    const rise = (isLowerShelf ? randRange(0.76, 1.12) : randRange(1.36, 1.72)) * s;
    const startY = worldOrigin.y + (isLowerShelf ? 1.44 : 1.76) * s;

    const p0 = new THREE.Vector3(worldOrigin.x + leanX * 0.70, startY, worldOrigin.z + leanZ * 0.70);
    const p1 = new THREE.Vector3(
      worldOrigin.x + Math.cos(az) * reach * 0.54,
      startY + rise * 0.58,
      worldOrigin.z + Math.sin(az) * reach * 0.54
    );
    const p2 = new THREE.Vector3(
      worldOrigin.x + Math.cos(az) * reach,
      startY + rise,
      worldOrigin.z + Math.sin(az) * reach
    );
    builder.addTaperedLimb([p0, p1, p2], rTrunkFork * 0.64, rTrunkFork * 0.22, 5, 0.0);

    for (const side of [-1, 1]) {
      const subAz = az + side * randRange(0.45, 0.68);
      const subReach = randRange(0.82, 1.10) * s;
      const subEnd = new THREE.Vector3(
        p1.x + Math.cos(subAz) * subReach,
        p1.y + randRange(0.26, 0.48) * s,
        p1.z + Math.sin(subAz) * subReach
      );
      builder.addTaperedLimb([p1, subEnd], rTrunkFork * 0.35, rTrunkFork * 0.10, 4, 0.0);
    }

    const rx = randRange(1.34, 1.64) * s;
    lobes.push({
      center: new THREE.Vector3(p2.x, p2.y + 0.28 * s, p2.z),
      rx,
      ry: rx * randRange(0.52, 0.62),
      rz: rx * randRange(0.90, 1.12),
      hFrac: isLowerShelf ? 0.35 : 0.68,
      isRim: true,
      isLowerShelf,
    });
  }

  // 3 Upper Umbrella Crown Shelves
  const topShelves = [
    { ox: -0.56, oy: 3.62, oz:  0.46, rx: 1.58, ry: 0.88, hFrac: 0.82 },
    { ox:  0.60, oy: 3.72, oz: -0.48, rx: 1.52, ry: 0.85, hFrac: 0.86 },
    { ox:  0.00, oy: 4.16, oz:  0.05, rx: 1.64, ry: 0.90, hFrac: 0.98 },
  ];
  for (const ts of topShelves) {
    lobes.push({
      center: new THREE.Vector3(
        worldOrigin.x + ts.ox * s,
        worldOrigin.y + ts.oy * s,
        worldOrigin.z + ts.oz * s
      ),
      rx: ts.rx * s,
      ry: ts.ry * s,
      rz: ts.rx * s,
      hFrac: ts.hFrac,
      isRim: false,
      isLowerShelf: false,
    });
  }

  // 3. Populate each shelf with crossed & radially-tilted Gouache Leaf-Cluster Cards
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let lIdx = 0; lIdx < lobes.length; lIdx++) {
    const lobe = lobes[lIdx];
    const cardCount = 22;
    for (let i = 0; i < cardCount; i++) {
      const tCard = (i + 0.5) / cardCount;
      const uy = -0.45 + tCard * 1.43;
      const rHoriz = Math.sqrt(Math.max(0.05, 1.0 - Math.min(1.0, uy * uy)));
      const theta = i * goldenAngle + lIdx * 2.1;

      const jitterR = 0.72 + (0.44 * ((i * 7 + lIdx * 3) % 5)) / 4;
      const ux = Math.cos(theta) * rHoriz * jitterR;
      const uz = Math.sin(theta) * rHoriz * jitterR;

      const pos = new THREE.Vector3(
        lobe.center.x + ux * lobe.rx,
        lobe.center.y + uy * lobe.ry,
        lobe.center.z + uz * lobe.rz
      );

      const radialDir = new THREE.Vector3(ux, uy * 1.2 + 0.2, uz).normalize();
      const tiltAxis = new THREE.Vector3(-Math.sin(theta), 0.35, Math.cos(theta)).normalize();
      const cardNormal = radialDir.clone().lerp(tiltAxis, i % 2 === 0 ? 0.52 : -0.52).normalize();

      const cardRadius = randRange(0.82, 1.12) * s;
      const hasFlowers = uy > 0.18 && (i + lIdx) % 4 === 0 ? 1 : 0;
      const hLocal = Math.max(0, Math.min(1, lobe.hFrac * 0.58 + (uy * 0.5 + 0.5) * 0.42));
      const ao = smoothstep(-0.50, 0.35, uy) * 0.54 + 0.46;

      builder.addLeafCard({
        center: pos,
        lobeCenter: lobe.center,
        cardNormal,
        cardRadius,
        cupDepth: cardRadius * 0.18,
        roll: rand() * TAU,
        tileIndex: hasFlowers,
        hCrownFrac: hLocal,
        aoFactor: ao,
      });
    }
  }

  // 4. 3D Shingled-Petal Wisteria & Sakura Blossom Cascades along outer bough rims
  if (isWisteria || isSakura || isShrine) {
    const rimLobes = lobes.filter((l) => l.isRim);
    const blossomKind = isSakura && !isWisteria ? 'sakura' : 'wisteria';

    for (let lIdx = 0; lIdx < rimLobes.length; lIdx++) {
      const lobe = rimLobes[lIdx];
      const outBaseAng = Math.atan2(lobe.center.z - worldOrigin.z, lobe.center.x - worldOrigin.x);
      const groupCount = lobe.isLowerShelf ? 3 : 2;

      for (let g = 0; g < groupCount; g++) {
        const frac = (g - (groupCount - 1) * 0.5) / Math.max(1, groupCount);
        const baseAng = outBaseAng + frac * 1.85 + randRange(-0.10, 0.10);
        const baseR = lobe.rx * randRange(0.82, 1.02);

        const clusterSpecs = lobe.isLowerShelf
          ? [
              { dAng: -0.12, dR: -0.05, lenMul: 0.76, radMul: 0.86 },
              { dAng:  0.02, dR:  0.02, lenMul: 1.04, radMul: 1.00 },
            ]
          : [
              { dAng:  0.00, dR:  0.00, lenMul: 0.86, radMul: 0.90 },
            ];

        for (let sc = 0; sc < clusterSpecs.length; sc++) {
          const sub = clusterSpecs[sc];
          const ang = baseAng + sub.dAng;
          const r = baseR + sub.dR * s;
          const px = lobe.center.x + Math.cos(ang) * r;
          const pz = lobe.center.z + Math.sin(ang) * r;
          const py = lobe.center.y - lobe.ry * randRange(0.08, 0.24);

          const rawLen = randRange(1.02, 1.52) * s * sub.lenMul;
          const maxSafeLen = Math.max(0.65, py - (worldOrigin.y + 1.05));
          const len = Math.min(rawLen, maxSafeLen);
          const topRad = randRange(0.20, 0.26) * s * sub.radMul;

          builder.addShingledPetalWisteriaRaceme({
            topX: px,
            topY: py,
            topZ: pz,
            length: len,
            topRadius: topRad,
            swayX: Math.cos(ang) * 0.09 * s,
            swayZ: Math.sin(ang) * 0.09 * s,
            kind: blossomKind,
            seed: 500 + treeIdx * 71 + lIdx * 19 + g * 7 + sc * 3,
          });
        }
      }
    }
  }

  return builder.toGeometry();
}

export function buildWisteriaTree(t, treeIdx = 0) {
  return buildSingleTreeGeometry({ ...t, kind: 'wisteria' }, treeIdx);
}

export function buildShrineTree(t, treeIdx = 0) {
  return buildSingleTreeGeometry({ ...t, hasPlanter: true }, treeIdx);
}

export function buildBotanicalTrees(opts = {}) {
  const colliders = opts.colliders || [];
  const root = new THREE.Group();
  root.name = 'botanical-trees';

  const allTreeGeometries = [];

  TREES.forEach((t, treeIdx) => {
    const kind = t.kind || 'oak';
    const isWisteria = kind === 'wisteria';
    const isSakura = kind === 'sakura';

    allTreeGeometries.push(buildSingleTreeGeometry(t, treeIdx));

    if (colliders) {
      colliders.push({
        type: 'circle',
        x: t.x,
        z: t.z,
        r: (isWisteria || isSakura ? 0.75 : 0.62) * (t.scale || 1.0),
      });
    }
  });

  const mergedTreesGeo = mergeGeometries(allTreeGeometries, false);
  const atlasTex = getSharedGouacheFoliageAtlas();

  const treesMat = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTex },
      uSunDir: { value: SUN_DIR },
      uTime: { value: 0 },
      uLightTint: { value: LIGHT_TINT },
      uFogColor: { value: FOG_COLOR },
      uFogNear: { value: 185.0 },
      uFogFar: { value: 580.0 },
      uCel: TREE_STYLE.uCel,
      uRim: TREE_STYLE.uRim,
      uRimColor: TREE_STYLE.uRimColor,
    },
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec3 aShadowColor;
      attribute vec3 aCrownCenter;
      attribute float aWindWeight;
      attribute float aCardMode;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vColorSun;
      varying vec3 vColorShd;
      varying vec3 vCrownCenter;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vWindWeight;
      varying float vCardMode;
      varying float vViewDist;
      void main() {
        vUv = uv;
        vColorSun = color;
        vColorShd = aShadowColor;
        vCrownCenter = aCrownCenter;
        vWindWeight = aWindWeight;
        vCardMode = aCardMode;
        vec3 pos = position;
        if (aWindWeight > 0.01) {
          // Unified Prevailing Valley Wind (flows along WIND_DIR = vec2(0.8207, 0.5714)):
          // Tree crowns & hanging Wisteria racemes lean and ripple in the exact same direction as the grass!
          const vec2 WIND_DIR = vec2(0.8207, 0.5714);
          const vec2 WIND_PERP = vec2(-0.5714, 0.8207);
          float windCoord = dot(aCrownCenter.xz, WIND_DIR) + dot(pos.xz - aCrownCenter.xz, WIND_DIR) * 0.35;
          float crossCoord = dot(pos.xz, WIND_PERP);
          float macroGust = sin(uTime * 2.15 - windCoord * 0.14 + sin(crossCoord * 0.08) * 0.7) * 0.5 + 0.5;
          float fineRipple = sin(uTime * 3.20 - windCoord * 0.28 + crossCoord * 0.18) * 0.5 + 0.5;
          float racemeMult = aCardMode > 1.5 ? (1.35 + vUv.y * 0.85) : 1.0;
          float forwardSway = (0.18 + pow(macroGust, 1.4) * 0.92 + fineRipple * 0.35) * 0.22 * aWindWeight * racemeMult;
          float crossFlutter = sin(uTime * 3.4 - windCoord * 0.32 + crossCoord * 0.45) * 0.035 * aWindWeight * racemeMult;
          vec2 disp = WIND_DIR * forwardSway + WIND_PERP * crossFlutter;
          pos.x += disp.x;
          pos.z += disp.y;
          if (aCardMode > 1.5) {
            pos.y += length(disp) * 0.14 * vUv.y;
          }
        }
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vViewDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform vec3 uSunDir;
      uniform vec3 uLightTint;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uCel;
      uniform float uRim;
      uniform vec3 uRimColor;
      varying vec2 vUv;
      varying vec3 vColorSun;
      varying vec3 vColorShd;
      varying vec3 vCrownCenter;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vWindWeight;
      varying float vCardMode;
      varying float vViewDist;

      void main() {
        // IMPORTANT: vNormal on leaf cards (1.0) and wisteria florets (2.0) is an outward spherical
        // proxy normal — NEVER flip it with gl_FrontFacing or half the cards in each sub-crown invert!
        vec3 proxyN = normalize(vNormal);
        vec3 trunkN = gl_FrontFacing ? proxyN : -proxyN;
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 col;

        if (vCardMode < 0.5) {
          // 0.0: Solid Gnarled Chestnut Trunk & Boughs with Procedural Bark Furrows & Under-Canopy Shadow
          float ndl = dot(trunkN, L) * 0.5 + 0.5;
          float barkFurrow = sin(vUv.x * 38.0 + sin(vWorldPos.y * 5.2 + vWorldPos.x * 2.1) * 1.8) * 0.5 + 0.5;
          float barkGrain = smoothstep(0.28, 0.72, barkFurrow) * 0.14 - 0.07;
          // Deep under-canopy occlusion where upper boughs tuck into the leaf crown
          float underCanopyAO = 1.0 - smoothstep(-1.6, -0.15, vWorldPos.y - vCrownCenter.y) * 0.48;
          float cel = smoothstep(0.26, 0.52, ndl + barkGrain) * 0.68 + smoothstep(0.60, 0.84, ndl + barkGrain) * 0.32;
          vec3 shd = vColorShd * vec3(0.68, 0.72, 0.84);
          vec3 sun = vColorSun * (0.94 + 0.12 * smoothstep(0.3, 0.7, barkFurrow));
          col = mix(shd, sun, cel) * underCanopyAO;
        } else if (vCardMode < 1.5) {
          // 1.0: Super-Soft Volumetric Ghibli Sub-Crown Leaf-Cluster Card (matching Sunlit Wisteria Village Path.png!)
          vec4 texel = texture2D(uAtlas, vUv);
          if (texel.a < 0.44) discard;

          vec3 crownDir = normalize(vWorldPos - vCrownCenter + vec3(0.0, 0.65, 0.0));
          // Blend 85% spherical sub-lobe proxyN + 15% macro crown dome normal for plush, velvety cloud lobes
          vec3 N = normalize(mix(proxyN, crownDir, 0.28));
          float ndl = dot(N, L) * 0.5 + 0.5;
          float crownH = clamp((vWorldPos.y - (vCrownCenter.y - 2.1)) / 3.7, 0.0, 1.0);
          float lit = clamp(ndl * 0.68 + crownH * 0.32, 0.0, 1.0);

          // Creamy 4-band soft Ghibli gouache ramp in Linear RGB (matching Sunlit Wisteria Village Path.png!):
          // Deep cool forest-viridian underbelly -> rich meadow emerald -> warm sunlit apple-chartreuse top dome
          float underBelly = smoothstep(0.06, 0.40, lit);
          float midCrown   = smoothstep(0.32, 0.68, lit);
          float topSunDome = smoothstep(0.60, 0.90, lit);

          vec3 deepUnderCol = vec3(0.016, 0.082, 0.024);
          vec3 coolShd      = vColorShd * vec3(0.52, 0.68, 0.56);
          vec3 midLeafCol   = mix(coolShd, vColorSun * vec3(0.68, 0.78, 0.52), 0.62);
          vec3 warmSunCrown = vColorSun * vec3(0.86, 0.92, 0.62);

          vec3 softVolumeCol = mix(deepUnderCol, coolShd, underBelly);
          softVolumeCol = mix(softVolumeCol, midLeafCol, midCrown);
          softVolumeCol = mix(softVolumeCol, warmSunCrown, topSunDome);

          // Gentle internal gouache leaf-brushstroke modulation (never harsh dark card outlines!)
          float leafBrush = smoothstep(0.22, 0.82, texel.g);
          vec3 leafTint = softVolumeCol * mix(vec3(0.86, 0.90, 0.84), vec3(1.06, 1.04, 0.96), leafBrush);

          float isFlower = clamp((texel.r - texel.g) * 3.2 + (min(texel.r, texel.b) - 0.62) * 3.0, 0.0, 1.0);
          vec3 flowerCol = texel.rgb * mix(vec3(0.68, 0.66, 0.82), vec3(0.96, 0.94, 0.92), midCrown);
          col = mix(leafTint, flowerCol, isFlower);

          float fres = 1.0 - clamp(abs(dot(N, V)), 0.0, 1.0);
          float sss = pow(clamp(dot(-L, V) * 0.5 + 0.5, 0.0, 1.0), 2.0) * smoothstep(0.38, 0.92, crownH);
          float rim = smoothstep(0.56, 0.90, fres) * smoothstep(0.52, 0.88, lit);
          col += warmSunCrown * sss * 0.08 * (1.0 - isFlower);
          col = mix(col, uRimColor * vec3(0.75, 0.88, 0.48), rim * uRim * 0.16 * (1.0 - isFlower));
        } else {
          // 2.0: 3D Shingled-Petal Wisteria & Sakura Florets with Top-Down Under-Canopy Occlusion
          float ndl = dot(proxyN, L) * 0.5 + 0.5;
          float topCanopyAO = mix(0.58, 1.0, smoothstep(0.0, 0.52, vUv.y));
          float wrapLit = (0.20 + 0.48 * smoothstep(0.20, 0.52, ndl) + 0.32 * smoothstep(0.56, 0.84, ndl)) * topCanopyAO;
          vec3 coolShd = vColorShd * vec3(0.72, 0.70, 0.90);
          col = mix(coolShd, vColorSun, wrapLit);

          float fres = 1.0 - clamp(abs(dot(proxyN, V)), 0.0, 1.0);
          float rim = smoothstep(0.46, 0.88, fres) * smoothstep(0.25, 0.95, vUv.y);
          col = mix(col, vec3(1.0, 0.94, 0.99), rim * 0.28);
        }

        col *= uLightTint;
        // Restrained height-aware valley mist + permanent outer mountain-boundary mist + warm sun scattering
        float sunForward = pow(clamp(dot(-V, L) * 0.5 + 0.5, 0.0, 1.0), 3.0);
        vec3 hazeCol = mix(uFogColor, vec3(1.0, 0.95, 0.86) * uLightTint, sunForward * 0.42);
        float heightMist = (1.0 - smoothstep(-1.0, 9.5, vWorldPos.y)) * smoothstep(48.0, 165.0, vViewDist) * 0.20;
        float perimeterMist = smoothstep(132.0, 175.0, length(vWorldPos.xz)) * (1.0 - smoothstep(10.0, 42.0, vWorldPos.y)) * 0.62;
        float distFog = smoothstep(340.0, 880.0, vViewDist);
        gl_FragColor = vec4(mix(col, hazeCol, clamp(distFog + max(heightMist, perimeterMist), 0.0, 0.75)), 1.0);
      }
    `,
  });

  const treesMesh = new THREE.Mesh(mergedTreesGeo, treesMat);
  treesMesh.name = 'trees-merged-botanical';
  treesMesh.frustumCulled = false;
  treesMesh.castShadow = true;
  treesMesh.receiveShadow = true;
  root.add(treesMesh);

  return {
    group: root,
    colliders,
    setSunDirection: setTreeSunDirection,
    setTimeOfDay: setTreeTimeOfDay,
    update(_dt, elapsed = 0, sunDir = null, daylight = null, fogColor = null, lightTint = null) {
      const t = Number.isFinite(elapsed) ? elapsed : 0;
      treesMat.uniforms.uTime.value = t;
      if (sunDir) setTreeSunDirection(sunDir);
      if (daylight !== null || lightTint || fogColor) {
        setTreeTimeOfDay(daylight ?? 1.0, lightTint, fogColor);
      }
    },
  };
}
