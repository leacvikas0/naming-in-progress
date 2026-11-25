import * as THREE from 'three';
import {
  TREES,
  terrainHeightAt,
  clamp,
} from './geography.js';
import {
  createTimeSlicer,
  runSync,
  runAsync,
  mergeGeometriesGen,
} from './terrain-water.js';

/**
 * Amarante 3D Sculpted Wisteria, Sakura & Oak Trees (`world/assets/terrain/trees.js`)
 *
 * Adapted from the Critic-Verified `2026-10-18_dense-31M` Studio Wisteria Checkpoint
 * for 144 FPS (`<= 6.94 ms/frame`) on Desktop RX 6700 and Xiaomi Pad 7 (Adreno 732 TBDR):
 * - 100% `discard`-free 3D geometry (preserves 100% hardware Early-Z Hidden Surface Removal on Adreno 732).
 * - Exactly 2 draw calls (`treeMeshCount === 2`) across all 69 valley trees:
 *   1. `trees-merged-botanical`: Merged 2-tone cel bark trunks, spreading boughs & 3D shingled-petal
 *      hanging Wisteria/Sakura racemes.
 *   2. `trees-canopy-puffs-instanced`: Global `InstancedMesh` of `2026-10-18_dense-31M` 3D arched
 *      leaflet & crown-blossom puffs (`createCanopyPuff84`), frustum-culled per tree sphere with
 *      smooth distance LOD (`tKeep`) and partial WebGL2 VBO upload (`addUpdateRange`).
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

  // 3D Shingled-Petal Wisteria Palette (`2026-10-18_dense-31M`)
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

let _cachedFoliageAtlas = null;

export function getSharedGouacheFoliageAtlas() {
  if (_cachedFoliageAtlas) return _cachedFoliageAtlas;
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

/**
 * Builds the `2026-10-18_dense-31M` 3D Sculpted Leaflet & Crown-Blossom Puff (`84` triangles, 0 `discard`!):
 * - 6 wide `1.34x` chord-area-compensated 2x3 arched 3D leaflets (`6 * 12 = 72` tris)
 * - 3 sculpted 3D crown blossom petals at the upper-outer dome (`3 * 4 = 12` tris)
 * - Outward spherical dome normals pre-blended so each puff shades as a plush Ghibli foliage cloud.
 */
let _sharedCanopyPuffGeo = null;
export function getShared3DCanopyPuffGeometry() {
  if (_sharedCanopyPuffGeo) return _sharedCanopyPuffGeo;

  function createSingleLeaflet2x3(length = 0.56, width = 0.34 * 1.32, arch = 0.095, droop = 0.22) {
    const cols = 1;
    const rows = 2;
    const positions = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    const tipBend = 1.05 + droop * 1.15;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const widthProfile = Math.pow(Math.sin(Math.pow(v, 0.56) * Math.PI), 0.72);
      const z = v * length * (1.0 - 0.05 * Math.max(0, droop) * v * v);
      const archY = Math.sin(v * Math.PI * 0.80) * arch - Math.pow(v, 1.95) * (arch * tipBend);
      for (let c = 0; c <= cols; c++) {
        const u = (c / cols) * 2.0 - 1.0;
        const absU = Math.abs(u);
        const x = u * (width * 0.5) * widthProfile;
        const vCupY = (1.0 - absU * absU) * 0.022 * widthProfile;
        positions.push(x, archY + vCupY, z);
        uvs.push(c / cols, v * 0.85);
        const shade = 0.80 + 0.22 * v + 0.05 * (1.0 - absU);
        colors.push(shade * 0.96, shade * 1.04, shade * 0.90);
      }
    }
    const stride = cols + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * stride + c;
        const b = (r + 1) * stride + c;
        const d = r * stride + (c + 1);
        const e = (r + 1) * stride + (c + 1);
        indices.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  const baseLeaf = createSingleLeaflet2x3(0.62, 0.37 * 1.58, 0.105, 0.24);
  const dPitch = 0.08 * 0.34;
  // Critic-Verified Full 360-Degree Hexagonal 2-Tier Spray (0 angular gaps! 3 outer fan + 3 raised inner cushion tiers)
  const specs = [
    { ox:  0.00, oy: 0.02, oz:  0.14, ry:  0.000, rx:  0.10 + dPitch, rz:  0.00, sc: 1.18 },
    { ox: -0.11, oy: 0.07, oz:  0.07, ry: -1.047, rx:  0.04 + dPitch, rz:  0.14, sc: 1.15 },
    { ox:  0.11, oy: 0.07, oz:  0.07, ry:  1.047, rx:  0.04 + dPitch, rz: -0.14, sc: 1.15 },
    { ox: -0.11, oy: 0.04, oz: -0.07, ry: -2.094, rx:  0.08 + dPitch, rz:  0.16, sc: 1.16 },
    { ox:  0.11, oy: 0.04, oz: -0.07, ry:  2.094, rx:  0.08 + dPitch, rz: -0.16, sc: 1.16 },
    { ox:  0.00, oy: 0.11, oz: -0.13, ry:  3.142, rx:  0.02 + dPitch, rz:  0.04, sc: 1.14 },
  ];

  const posArr = [];
  const normArr = [];
  const uvArr = [];
  const colArr = [];
  const idxArr = [];
  let vOff = 0;

  const mat4 = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  const posV = new THREE.Vector3();

  specs.forEach((sp) => {
    const clone = baseLeaf.clone();
    euler.set(sp.rx, sp.ry, sp.rz, 'YXZ');
    quat.setFromEuler(euler);
    posV.set(sp.ox, sp.oy, sp.oz);
    scaleV.setScalar(sp.sc);
    mat4.compose(posV, quat, scaleV);
    clone.applyMatrix4(mat4);
    const p = clone.attributes.position;
    const n = clone.attributes.normal;
    const u = clone.attributes.uv;
    const c = clone.attributes.color;
    const ix = clone.index.array;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i);
      const py = p.getY(i);
      const pz = p.getZ(i);
      posArr.push(px, py, pz);
      const vTarget = new THREE.Vector3(px * 0.55, 0.85, (pz - 0.04) * 0.55).normalize();
      const vN = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
      if (vN.y < 0) vN.negate();
      vN.lerp(vTarget, 0.68).normalize();
      normArr.push(vN.x, vN.y, vN.z);
      uvArr.push(u.getX(i), u.getY(i));
      colArr.push(c.getX(i), c.getY(i), c.getZ(i));
    }
    for (let i = 0; i < ix.length; i++) idxArr.push(ix[i] + vOff);
    vOff += p.count;
  });

  // Add 3 sculpted 3D cupped corymb crown-blossom florets at the upper dome (uv.y = 0.96 signals blossom tint in shader)
  for (let b = 0; b < 3; b++) {
    const ang = (b / 3) * TAU + 0.35;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const baseI = vOff;
    const ox = ca * 0.05;
    const oy = 0.17 + (b % 2) * 0.03;
    const oz = sa * 0.05;
    const pts = [
      [ox, oy, oz],
      [ox + ca * 0.30 - sa * 0.18, oy + 0.05, oz + sa * 0.30 + ca * 0.18],
      [ox + ca * 0.30 + sa * 0.18, oy + 0.05, oz + sa * 0.30 - ca * 0.18],
    ];
    for (let k = 0; k < 3; k++) {
      posArr.push(pts[k][0], pts[k][1], pts[k][2]);
      normArr.push(ca * 0.35, 0.92, sa * 0.35);
      uvArr.push(k === 0 ? 0.2 : 0.85, 0.96);
      colArr.push(1.0, 0.96, 0.98);
    }
    idxArr.push(baseI, baseI + 1, baseI + 2);
    vOff += 3;
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(idxArr);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
  geo.computeBoundingSphere();
  _sharedCanopyPuffGeo = geo;
  return geo;
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
    this.cardModes = []; // 0.0 = bark, 1.0 = 3D leaflet puff, 2.0 = 3D shingled wisteria/sakura petal
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

  /**
   * Used when `includeCanopyInMesh === true` (e.g. `bake-raytraced-shadows.mjs` or standalone tests):
   * Emits a 3D cupped 4-triangle canopy dome cluster (`0` `discard`).
   */
  addSolidCanopyCluster({
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

    const vFlag = tileIndex === 1 ? 0.96 : 0.45;
    const sunCol = PAL.foliageLowSun
      .clone()
      .lerp(PAL.foliageMidSun, smoothstep(0.12, 0.62, hCrownFrac) * aoFactor)
      .lerp(PAL.foliageTopSun, smoothstep(0.52, 0.96, hCrownFrac) * aoFactor);
    const shdCol = PAL.foliageShdLow
      .clone()
      .lerp(PAL.foliageShdTop, smoothstep(0.22, 0.88, hCrownFrac) * aoFactor);

    const corners = [
      { lx: -1, ly: -1 },
      { lx:  1, ly: -1 },
      { lx:  1, ly:  1 },
      { lx: -1, ly:  1 },
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
      0.5,
      vFlag,
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
        this.addVertex(vx, vy, vz, nx, ny, nz, 0.2, vFlag * 0.7, sunCol, shdCol, wind * 1.15, 1.0)
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
   * 12 chord-area-compensated (`1.22x` petal scale) overlapping, downward-cupped 3D hooded
   * flower petals spiraling down a slender curved stem (cuts raceme triangles by 33% at 100% area parity).
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
    const floretCount = 9;
    const areaScale = 1.46;
    const goldenAngle = 2.3999632;
    const rotStart = rand() * TAU;

    // Slender curved central rachis vine stem connecting all hanging florets
    const stemPts = [
      new THREE.Vector3(topX, topY + 0.05, topZ),
      new THREE.Vector3(topX + swayX * 0.92, topY - length * 0.94, topZ + swayZ * 0.92),
    ];
    this.addTaperedLimb(stemPts, 0.022, 0.007, 3, 0.0);

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

      const petalLen = (0.31 - t * 0.14) * (topRadius / 0.24) * (0.92 + rand() * 0.16) * areaScale;
      const petalWid = (0.21 - t * 0.09) * (topRadius / 0.24) * (0.92 + rand() * 0.16) * areaScale;
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

      const v0 = this.addVertex(cx, cy + petalLen * 0.18, cz, dirX * 0.4, 0.75, dirZ * 0.4, 0.5, 0.0, baseSun, baseShd, wind * 0.85, 2.0);
      const v1 = this.addVertex(
        cx + dirX * cupOut * 0.62 - sideX * petalWid * 0.88,
        cy - petalLen * 0.38,
        cz + dirZ * cupOut * 0.62 - sideZ * petalWid * 0.88,
        dirX * 0.55 - sideX * 0.55, 0.22, dirZ * 0.55 - sideZ * 0.55,
        0.0, 0.45, bellySun, bellyShd, wind, 2.0
      );
      const v2 = this.addVertex(
        cx + dirX * cupOut * 0.62 + sideX * petalWid * 0.88,
        cy - petalLen * 0.38,
        cz + dirZ * cupOut * 0.62 + sideZ * petalWid * 0.88,
        dirX * 0.55 + sideX * 0.55, 0.22, dirZ * 0.55 + sideZ * 0.55,
        1.0, 0.45, bellySun, bellyShd, wind, 2.0
      );
      const v3 = this.addVertex(
        cx + dirX * cupOut * 1.18,
        cy - petalLen * 0.36,
        cz + dirZ * cupOut * 1.18,
        dirX, 0.28, dirZ,
        0.5, 0.5, tipSun, bellyShd, wind, 2.0
      );
      const v6 = this.addVertex(
        cx + dirX * cupOut * 0.42,
        cy - petalLen * 1.0,
        cz + dirZ * cupOut * 0.42,
        dirX * 0.6, -0.35, dirZ * 0.6,
        0.5, 1.0, tipSun, tipShd, wind * 1.1, 2.0
      );

      this.indices.push(
        v0, v3, v1,
        v0, v2, v3,
        v1, v3, v6,
        v3, v2, v6
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

export function* buildSingleTreeGeometryGen(t, treeIdx = 0, opts = {}) {
  const includeCanopyInMesh = opts.includeCanopyInMesh !== false;
  const puffEntriesOut = opts.puffEntriesOut || null;

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

    const rx = randRange(1.38, 1.68) * s;
    lobes.push({
      center: new THREE.Vector3(p2.x, p2.y + 0.28 * s, p2.z),
      rx,
      ry: rx * randRange(0.54, 0.64),
      rz: rx * randRange(0.92, 1.14),
      hFrac: isLowerShelf ? 0.35 : 0.68,
      isRim: true,
      isLowerShelf,
    });
  }
  yield;

  // 3 Upper Umbrella Crown Shelves
  const topShelves = [
    { ox: -0.56, oy: 3.62, oz:  0.46, rx: 1.62, ry: 0.90, hFrac: 0.82 },
    { ox:  0.60, oy: 3.72, oz: -0.48, rx: 1.56, ry: 0.88, hFrac: 0.86 },
    { ox:  0.00, oy: 4.16, oz:  0.05, rx: 1.68, ry: 0.92, hFrac: 0.98 },
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

  // 3. Populate each shelf with 2026-10-18_dense-31M 3D Canopy Puffs
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);

  for (let lIdx = 0; lIdx < lobes.length; lIdx++) {
    const lobe = lobes[lIdx];
    const puffCount = 16; // 9 lobes * 16 = 144 lush overlapping puffs per tree
    for (let i = 0; i < puffCount; i++) {
      const tCard = (i + 0.5) / puffCount;
      const uy = -0.38 + tCard * 1.34;
      const rHoriz = Math.sqrt(Math.max(0.05, 1.0 - Math.min(1.0, uy * uy)));
      const theta = i * goldenAngle + lIdx * 2.1;

      const jitterR = 0.74 + (0.42 * ((i * 7 + lIdx * 3) % 5)) / 4;
      const ux = Math.cos(theta) * rHoriz * jitterR;
      const uz = Math.sin(theta) * rHoriz * jitterR;

      const pos = new THREE.Vector3(
        lobe.center.x + ux * lobe.rx,
        lobe.center.y + uy * lobe.ry,
        lobe.center.z + uz * lobe.rz
      );

      // Critic-Verified Shingle Pitch Clamp: prevents lower-shelf puffs from pitching 98 degrees edge-on!
      const radialDir = new THREE.Vector3(ux * 0.52, Math.max(0.58, uy * 0.45 + 0.72), uz * 0.52).normalize();
      const tiltAxis = new THREE.Vector3(-Math.sin(theta) * 0.35, 0.88, Math.cos(theta) * 0.35).normalize();
      const cardNormal = radialDir.clone().lerp(tiltAxis, i % 2 === 0 ? 0.24 : -0.24).normalize();

      const cardRadius = randRange(1.02, 1.34) * s;
      const hasFlowers = uy > 0.08 && (i + lIdx) % 2 === 0 ? 1 : 0;
      const flowerCode = !hasFlowers
        ? 0
        : isSakura && !isWisteria
          ? 2
          : isWisteria || isShrine
            ? 1
            : 0;
      const hLocal = Math.max(0, Math.min(0.99, lobe.hFrac * 0.58 + (uy * 0.5 + 0.5) * 0.42));
      const ao = smoothstep(-0.50, 0.35, uy) * 0.54 + 0.46;
      const roll = rand() * TAU;

      if (includeCanopyInMesh) {
        builder.addSolidCanopyCluster({
          center: pos,
          lobeCenter: lobe.center,
          cardNormal,
          cardRadius,
          cupDepth: cardRadius * 0.18,
          roll,
          tileIndex: hasFlowers,
          hCrownFrac: hLocal,
          aoFactor: ao,
        });
      }

      if (puffEntriesOut) {
        dummy.position.copy(pos);
        dummy.quaternion.setFromUnitVectors(upVec, cardNormal);
        dummy.rotateY(roll);
        dummy.scale.setScalar(cardRadius * 1.56);
        dummy.updateMatrix();
        puffEntriesOut.push({
          pos: pos.clone(),
          boundPad: cardRadius * 1.56 * 0.95,
          matrix: dummy.matrix.clone(),
          crownCenter: [crownCenter[0], crownCenter[1], crownCenter[2]],
          hLocal,
          flowerCode,
          hash: ((i * 19 + lIdx * 7) % 97) / 97,
        });
      }
    }
    if (lIdx % 3 === 2) yield;
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
              { dAng: -0.02, dR: 0.00, lenMul: 1.04, radMul: 1.12 },
            ]
          : [
              { dAng:  0.00, dR: 0.00, lenMul: 0.88, radMul: 0.96 },
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
      if (lIdx % 2 === 1) yield;
    }
  }

  return builder.toGeometry();
}

export function buildSingleTreeGeometry(t, treeIdx = 0, opts = {}) {
  return runSync(buildSingleTreeGeometryGen(t, treeIdx, opts));
}

export function buildWisteriaTree(t, treeIdx = 0) {
  return buildSingleTreeGeometry({ ...t, kind: 'wisteria' }, treeIdx);
}

export function buildShrineTree(t, treeIdx = 0) {
  return buildSingleTreeGeometry({ ...t, hasPlanter: true }, treeIdx);
}

function getTreeSectorIndex(t) {
  if (t.z >= 90 && t.x > -55) return 7; // Deep South Flower Field Lobby
  if (t.x >= 100) return 6;             // Far East Sacred Wisteria Grove
  if (t.x >= 55) return 5;              // East Wisteria Arena
  if (t.x < -50 && t.z < 40) return 2;  // West Lakeshore & Millpond
  if (t.z < -20) return t.x < 0 ? 0 : 1; // NW / NE Hillside & North Shrine
  return t.x < 0 ? 3 : 4;               // SW Hamlet & Lovers' Wall / SE Hamlet & Mid-South
}

const INTERLEAVED_LOBE_ORDER = [8, 0, 3, 7, 1, 4, 6, 2, 5];

function* buildBotanicalTreesGen(opts = {}) {
  const colliders = opts.colliders || [];
  const root = new THREE.Group();
  root.name = 'botanical-trees';

  const sectorTreeGeometries = Array.from({ length: 8 }, () => []);
  const treeCanopyRecords = [];
  let totalMaxPuffs = 0;

  for (let treeIdx = 0; treeIdx < TREES.length; treeIdx++) {
    const t = TREES[treeIdx];
    const kind = t.kind || 'oak';
    const isWisteria = kind === 'wisteria';
    const isSakura = kind === 'sakura';
    const scale = (t.scale || 1.0) * (isWisteria || isSakura ? 1.12 : 1.04);
    const ty = terrainHeightAt(t.x, t.z);

    const puffEntries = [];
    // Sector meshes get trunks, boughs, and 3D hanging racemes; InstancedMesh gets the 3D sculpted leaflet puffs
    const treeGeo = yield* buildSingleTreeGeometryGen(t, treeIdx, {
      includeCanopyInMesh: false,
      puffEntriesOut: puffEntries,
    });
    const sectorIdx = getTreeSectorIndex(t);
    sectorTreeGeometries[sectorIdx].push(treeGeo);

    const centerVec = new THREE.Vector3(t.x, ty + 3.55 * scale, t.z);
    let exactMaxR = 5.4 * scale;
    const n = puffEntries.length;

    // Order puffs interleaved across all 9 lobes and 16 spiral height steps (coprime stride 5)
    // so prefix thinning (`nKeep`) thins every lobe, height tier, and blossom floret evenly.
    const orderedPuffs = [];
    if (n === 144) {
      for (let step = 0; step < 16; step++) {
        for (let l = 0; l < 9; l++) {
          const lIdx = INTERLEAVED_LOBE_ORDER[(l + step) % 9];
          const iStep = 15 - ((step * 5 + lIdx * 3) % 16);
          orderedPuffs.push(puffEntries[lIdx * 16 + iStep]);
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        orderedPuffs.push(puffEntries[(i * 19) % n]);
      }
    }

    const matData = new Float32Array(n * 16);
    const metaData = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const p = orderedPuffs[i];
      const d = p.pos.distanceTo(centerVec) + p.boundPad;
      if (d > exactMaxR) exactMaxR = d;
      matData.set(p.matrix.elements, i * 16);
      metaData[i * 4] = p.crownCenter[0];
      metaData[i * 4 + 1] = p.crownCenter[1];
      metaData[i * 4 + 2] = p.crownCenter[2];
      metaData[i * 4 + 3] = p.hLocal + p.flowerCode * 2.0;
    }

    treeCanopyRecords.push({
      center: centerVec,
      // Critic-Verified Frustum Guard Band (+2.4m pad beyond exact outermost puff vertex) so trees never pop at screen edges!
      radius: Math.max(6.8 * scale, exactMaxR + 2.4),
      n,
      matData,
      metaData,
    });
    totalMaxPuffs += n;

    if (colliders) {
      colliders.push({
        type: 'circle',
        x: t.x,
        z: t.z,
        r: (isWisteria || isSakura ? 0.75 : 0.62) * (t.scale || 1.0),
      });
    }
    yield;
  }

  const atlasTex = getSharedGouacheFoliageAtlas();

  // Sector Meshes: Trunks, Spreading Boughs & 3D Hanging Wisteria/Sakura Racemes (FrontSide, hardware Early-Z + FPK)
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
    side: THREE.FrontSide,
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
        vec3 proxyN = normalize(vNormal);
        vec3 trunkN = proxyN;
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 col;

        if (vCardMode < 0.5) {
          float ndl = dot(trunkN, L) * 0.5 + 0.5;
          float barkFurrow = sin(vUv.x * 38.0 + sin(vWorldPos.y * 5.2 + vWorldPos.x * 2.1) * 1.8) * 0.5 + 0.5;
          float barkGrain = smoothstep(0.28, 0.72, barkFurrow) * 0.14 - 0.07;
          float underCanopyAO = 1.0 - smoothstep(-1.6, -0.15, vWorldPos.y - vCrownCenter.y) * 0.48;
          float cel = smoothstep(0.26, 0.52, ndl + barkGrain) * 0.68 + smoothstep(0.60, 0.84, ndl + barkGrain) * 0.32;
          vec3 shd = vColorShd * vec3(0.68, 0.72, 0.84);
          vec3 sun = vColorSun * (0.94 + 0.12 * smoothstep(0.3, 0.7, barkFurrow));
          col = mix(shd, sun, cel) * underCanopyAO;
        } else {
          float ndl = dot(proxyN, L) * 0.5 + 0.5;
          float topCanopyAO = mix(0.58, 1.0, smoothstep(0.0, 0.52, vUv.y));
          float wrapLit = (0.20 + 0.48 * smoothstep(0.20, 0.52, ndl) + 0.32 * smoothstep(0.56, 0.84, ndl)) * topCanopyAO;
          vec3 coolShd = vColorShd * vec3(0.72, 0.70, 0.90);
          col = mix(coolShd, vColorSun, wrapLit);

          float fres = 1.0 - clamp(abs(dot(proxyN, V)), 0.0, 1.0);
          float rim = smoothstep(0.46, 0.88, fres) * smoothstep(0.25, 0.95, vUv.y);
          col = mix(col, vec3(0.92, 0.84, 0.94), rim * 0.24);
        }

        float dayLuma = dot(uLightTint, vec3(0.3333));
        float isNight = 1.0 - smoothstep(0.35, 0.65, dayLuma);
        float isEvening = smoothstep(0.08, 0.22, uLightTint.r - uLightTint.b) * (1.0 - isNight);
        col = mix(col, col * vec3(1.06, 0.72, 0.58), isEvening * 0.58);
        col = mix(col, col * vec3(0.36, 0.46, 0.76), isNight * 0.62);
        col *= uLightTint;

        float sunForward = pow(clamp(dot(-V, L) * 0.5 + 0.5, 0.0, 1.0), 3.0);
        vec3 hazeCol = mix(uFogColor, vec3(1.0, 0.95, 0.86) * uLightTint, sunForward * 0.42);
        float heightMist = (1.0 - smoothstep(-1.0, 9.5, vWorldPos.y)) * smoothstep(48.0, 165.0, vViewDist) * 0.20;
        float perimeterMist = smoothstep(132.0, 175.0, length(vWorldPos.xz)) * (1.0 - smoothstep(10.0, 42.0, vWorldPos.y)) * 0.62;
        float distFog = smoothstep(340.0, 880.0, vViewDist);
        gl_FragColor = vec4(mix(col, hazeCol, clamp(distFog + max(heightMist, perimeterMist), 0.0, 0.75)), 1.0);
      }
    `,
  });

  const sectorMeshes = [];
  for (let s = 0; s < sectorTreeGeometries.length; s++) {
    const sectorGeos = sectorTreeGeometries[s];
    if (!sectorGeos.length) continue;
    const sectorGeo = yield* mergeGeometriesGen(sectorGeos);
    sectorGeo.computeBoundingSphere();
    sectorGeo.computeBoundingBox();
    const sectorMesh = new THREE.Mesh(sectorGeo, treesMat);
    sectorMesh.name = `trees-merged-botanical-sector-${s}`;
    sectorMesh.frustumCulled = true;
    sectorMesh.castShadow = true;
    sectorMesh.receiveShadow = true;
    root.add(sectorMesh);
    sectorMeshes.push(sectorMesh);
    yield;
  }

  // Global 2026-10-18_dense-31M 3D Sculpted Leaflet & Crown-Blossom Puff InstancedMesh (1 Draw Call, FrontSide, Early-Z + FPK)
  const puffGeo = getShared3DCanopyPuffGeometry().clone();
  yield;
  const puffMetaAttr = new THREE.InstancedBufferAttribute(new Float32Array(totalMaxPuffs * 4), 4);
  puffGeo.setAttribute('aPuffMeta', puffMetaAttr);

  const puffMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR },
      uTime: { value: 0 },
      uLightTint: { value: LIGHT_TINT },
      uFogColor: { value: FOG_COLOR },
      uRim: TREE_STYLE.uRim,
      uRimColor: TREE_STYLE.uRimColor,
    },
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true,
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec4 aPuffMeta;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vCrownCenter;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vHLocal;
      varying float vFlowerKind;
      varying float vViewDist;

      void main() {
        // Cull close canopy puffs strictly per-instance center before applying vertex offsets so every
        // triangle of a nearby puff hides uniformly with zero partial-triangle shards across the screen.
        vec4 instCenterWp = modelMatrix * vec4(instanceMatrix[3].xyz, 1.0);
        float instViewDist = -(viewMatrix * instCenterWp).z;
        if (instViewDist < 1.35) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return;
        }

        vUv = uv;
        vColor = color;
        vCrownCenter = aPuffMeta.xyz;
        float rawMeta = aPuffMeta.w;
        vFlowerKind = floor((rawMeta + 0.05) * 0.5);
        vHLocal = clamp(rawMeta - vFlowerKind * 2.0, 0.0, 1.0);

        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        const vec2 WIND_DIR = vec2(0.8207, 0.5714);
        const vec2 WIND_PERP = vec2(-0.5714, 0.8207);
        float windCoord = dot(vCrownCenter.xz, WIND_DIR) + dot(wp.xz - vCrownCenter.xz, WIND_DIR) * 0.35;
        float crossCoord = dot(wp.xz, WIND_PERP);
        float macroGust = sin(uTime * 2.15 - windCoord * 0.14 + sin(crossCoord * 0.08) * 0.7) * 0.5 + 0.5;
        float wWeight = 0.20 + 0.35 * vHLocal;
        float forwardSway = (0.16 + pow(macroGust, 1.4) * 0.85) * 0.20 * wWeight;
        float crossFlutter = sin(uTime * 3.4 - windCoord * 0.32 + crossCoord * 0.45) * 0.032 * wWeight;
        wp.xz += WIND_DIR * forwardSway + WIND_PERP * crossFlutter;

        vWorldPos = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vViewDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uLightTint;
      uniform vec3 uFogColor;
      uniform float uRim;
      uniform vec3 uRimColor;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec3 vCrownCenter;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vHLocal;
      varying float vFlowerKind;
      varying float vViewDist;

      void main() {
        vec3 proxyN = normalize(vNormal);
        vec3 crownDir = normalize(vWorldPos - vCrownCenter + vec3(0.0, 0.85, 0.0));
        vec3 N = normalize(mix(proxyN, crownDir, 0.44));
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);

        float ndl = dot(N, L) * 0.5 + 0.5;
        float crownH = clamp((vWorldPos.y - (vCrownCenter.y - 2.2)) / 3.9, 0.0, 1.0);
        float lit = clamp(ndl * 0.64 + (crownH * 0.55 + vHLocal * 0.45) * 0.36, 0.0, 1.0);

        float underBelly = smoothstep(0.08, 0.42, lit);
        float midCrown   = smoothstep(0.30, 0.66, lit);
        float topSunDome = smoothstep(0.58, 0.88, lit);

        // Critic-Verified Luminous Studio Ghibli Foliage Palette (matches PAL.foliageLowSun -> MidSun -> TopSun #cef474)
        vec3 deepUnderCol = vec3(0.032, 0.118, 0.028);
        vec3 coolShd      = vec3(0.084, 0.285, 0.052);
        vec3 midLeafCol   = vec3(0.215, 0.540, 0.082) * vColor;
        vec3 warmSunCrown = vec3(0.540, 0.820, 0.165) * vColor;

        vec3 col = mix(deepUnderCol, coolShd, underBelly);
        col = mix(col, midLeafCol, midCrown);
        col = mix(col, warmSunCrown, topSunDome);

        float hasFlower = step(0.5, vFlowerKind);
        float isSakura = step(1.5, vFlowerKind);
        float isBlossom = step(0.90, vUv.y) * hasFlower;

        // Distinct Wisteria Lavender-Cream vs Sakura Blush-Pink/Ivory 3D Crown Bouquets
        vec3 wistShd   = vec3(0.46, 0.24, 0.78);
        vec3 wistSun   = mix(vec3(0.76, 0.56, 0.96), vec3(0.98, 0.92, 1.00), smoothstep(0.3, 0.85, vUv.x));
        vec3 sakuraShd = vec3(0.76, 0.26, 0.48);
        vec3 sakuraSun = mix(vec3(0.96, 0.64, 0.80), vec3(1.00, 0.95, 0.98), smoothstep(0.3, 0.85, vUv.x));

        vec3 bShd = mix(wistShd, sakuraShd, isSakura);
        vec3 bSun = mix(wistSun, sakuraSun, isSakura);
        vec3 blossomCol = mix(bShd, bSun, smoothstep(0.24, 0.72, lit));
        col = mix(col, blossomCol, isBlossom);

        float fres = 1.0 - clamp(abs(dot(N, V)), 0.0, 1.0);
        float rim = smoothstep(0.52, 0.88, fres) * smoothstep(0.46, 0.86, lit);
        col = mix(col, vec3(0.62, 0.88, 0.22), rim * uRim * 0.22 * (1.0 - isBlossom));

        float dayLuma = dot(uLightTint, vec3(0.3333));
        float isNight = 1.0 - smoothstep(0.35, 0.65, dayLuma);
        float isEvening = smoothstep(0.08, 0.22, uLightTint.r - uLightTint.b) * (1.0 - isNight);
        col = mix(col, col * vec3(1.06, 0.72, 0.58), isEvening * 0.58);
        col = mix(col, col * vec3(0.36, 0.46, 0.76), isNight * 0.62);
        col *= uLightTint;

        float sunForward = pow(clamp(dot(-V, L) * 0.5 + 0.5, 0.0, 1.0), 3.0);
        vec3 hazeCol = mix(uFogColor, vec3(1.0, 0.95, 0.86) * uLightTint, sunForward * 0.42);
        float heightMist = (1.0 - smoothstep(-1.0, 9.5, vWorldPos.y)) * smoothstep(48.0, 165.0, vViewDist) * 0.20;
        float perimeterMist = smoothstep(132.0, 175.0, length(vWorldPos.xz)) * (1.0 - smoothstep(10.0, 42.0, vWorldPos.y)) * 0.62;
        float distFog = smoothstep(340.0, 880.0, vViewDist);
        gl_FragColor = vec4(mix(col, hazeCol, clamp(distFog + max(heightMist, perimeterMist), 0.0, 0.75)), 1.0);
      }
    `,
  });

  const puffInstMesh = new THREE.InstancedMesh(puffGeo, puffMat, totalMaxPuffs);
  puffInstMesh.name = 'trees-canopy-puffs-instanced';
  puffInstMesh.frustumCulled = false;

  // Populate initial full canopy buffer
  let initOffset = 0;
  for (let ri = 0; ri < treeCanopyRecords.length; ri++) {
    const rec = treeCanopyRecords[ri];
    puffInstMesh.instanceMatrix.array.set(rec.matData, initOffset * 16);
    puffMetaAttr.array.set(rec.metaData, initOffset * 4);
    initOffset += rec.n;
    if (ri > 0 && ri % 18 === 0) yield;
  }
  puffInstMesh.count = initOffset;
  puffInstMesh.instanceMatrix.needsUpdate = true;
  puffMetaAttr.needsUpdate = true;
  root.add(puffInstMesh);

  const _projScreen = new THREE.Matrix4();
  const _frustum = new THREE.Frustum();
  const _sphere = new THREE.Sphere();
  const _camForward = new THREE.Vector3();
  const _lastCamPos = new THREE.Vector3(99999, 99999, 99999);
  const _lastCamQuat = new THREE.Quaternion();
  let _lastProfile = '';
  const _plannedKeep = new Int32Array(treeCanopyRecords.length);
  const _plannedRatio = new Float32Array(treeCanopyRecords.length);

  function gatherVisibleCanopyPuffs(camera, profile = 'desktop') {
    if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) return;
    // Critic-Verified Tight Camera Cache Deadband (0.20m translation / 1.0 deg rotation)
    const moved =
      camera.position.distanceToSquared(_lastCamPos) > 0.04 ||
      1.0 - Math.abs(camera.quaternion.dot(_lastCamQuat)) > 0.00004 ||
      profile !== _lastProfile;
    if (!moved) return;

    _lastCamPos.copy(camera.position);
    _lastCamQuat.copy(camera.quaternion);
    _lastProfile = profile;

    camera.updateMatrixWorld();
    _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreen);
    _camForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

    const isTablet = profile === 'tablet';
    const camPos = camera.position;

    // On tablet profile, distance-cull & backface-cull distant merged sector meshes (> 145m or behind camera)
    for (let s = 0; s < sectorMeshes.length; s++) {
      const sm = sectorMeshes[s];
      if (!isTablet) {
        sm.visible = true;
        continue;
      }
      const bs = sm.geometry.boundingSphere;
      if (!bs) {
        sm.visible = true;
        continue;
      }
      const dx = bs.center.x - camPos.x;
      const dy = bs.center.y - camPos.y;
      const dz = bs.center.z - camPos.z;
      const dist = Math.hypot(dx, dy, dz);
      const closestDist = Math.max(0, dist - bs.radius);
      const fwdDot = dist > 1e-3 ? (dx * _camForward.x + dy * _camForward.y + dz * _camForward.z) / dist : 1.0;
      sm.visible = closestDist <= 125.0 && dist <= 152.0 && !(dist > bs.radius + 14.0 && fwdDot < -0.22);
    }

    const dstMat = puffInstMesh.instanceMatrix.array;
    const dstMeta = puffMetaAttr.array;
    let totalPlannedPuffs = 0;

    for (let i = 0; i < treeCanopyRecords.length; i++) {
      const rec = treeCanopyRecords[i];
      _sphere.center.copy(rec.center);
      _sphere.radius = rec.radius;
      if (!_frustum.intersectsSphere(_sphere)) {
        _plannedKeep[i] = 0;
        continue;
      }

      if (!isTablet) {
        _plannedKeep[i] = rec.n;
        _plannedRatio[i] = 1.0;
        totalPlannedPuffs += rec.n;
        continue;
      }

      const dx = rec.center.x - camPos.x;
      const dy = rec.center.y - camPos.y;
      const dz = rec.center.z - camPos.z;
      const dist = Math.hypot(dx, dy, dz);
      const fwdDot = dist > 1e-3 ? (dx * _camForward.x + dy * _camForward.y + dz * _camForward.z) / dist : 1.0;

      // Cull trees behind the camera or beyond 145m on tablet
      if (dist > 145.0 || (dist > 18.0 && fwdDot < -0.22)) {
        _plannedKeep[i] = 0;
        continue;
      }

      let keepRatio = 1.0;
      if (dist > 28.0) {
        const tMid = smoothstep(28.0, 68.0, dist);
        const tFar = smoothstep(68.0, 120.0, dist);
        const tHorizon = smoothstep(120.0, 145.0, dist);
        keepRatio =
          1.0 -
          tMid * (1.0 - 0.30) -
          tFar * (0.30 - 0.18) -
          tHorizon * (0.18 - 0.14);
      }

      const nKeep =
        keepRatio >= 0.995
          ? rec.n
          : Math.max(18, Math.min(rec.n, Math.round(rec.n * keepRatio)));
      _plannedKeep[i] = nKeep;
      _plannedRatio[i] = nKeep / rec.n;
      totalPlannedPuffs += nKeep;
    }

    // Proportional tablet budget cap (<= 880 total puffs across all visible trees so no tree loses its canopy!)
    const MAX_TABLET_PUFFS = 880;
    const budgetScale =
      isTablet && totalPlannedPuffs > MAX_TABLET_PUFFS
        ? MAX_TABLET_PUFFS / totalPlannedPuffs
        : 1.0;

    let outCount = 0;
    for (let i = 0; i < treeCanopyRecords.length; i++) {
      let nKeep = _plannedKeep[i];
      if (nKeep <= 0) continue;
      const rec = treeCanopyRecords[i];

      if (budgetScale < 0.999) {
        nKeep = Math.max(12, Math.min(rec.n, Math.floor(nKeep * budgetScale)));
      }
      if (isTablet && outCount + nKeep > MAX_TABLET_PUFFS) {
        nKeep = Math.max(0, MAX_TABLET_PUFFS - outCount);
        if (nKeep <= 0) break;
      }

      const effectiveRatio = nKeep / rec.n;
      if (nKeep === rec.n) {
        dstMat.set(rec.matData, outCount * 16);
        dstMeta.set(rec.metaData, outCount * 4);
      } else {
        const scaleBoost = Math.min(1.42, Math.pow(effectiveRatio, -0.34));
        const srcMat = rec.matData;
        let dstIdx = outCount * 16;
        const limit = nKeep * 16;
        for (let m = 0; m < limit; m += 16) {
          dstMat[dstIdx]      = srcMat[m]      * scaleBoost;
          dstMat[dstIdx + 1]  = srcMat[m + 1]  * scaleBoost;
          dstMat[dstIdx + 2]  = srcMat[m + 2]  * scaleBoost;
          dstMat[dstIdx + 3]  = srcMat[m + 3];
          dstMat[dstIdx + 4]  = srcMat[m + 4]  * scaleBoost;
          dstMat[dstIdx + 5]  = srcMat[m + 5]  * scaleBoost;
          dstMat[dstIdx + 6]  = srcMat[m + 6]  * scaleBoost;
          dstMat[dstIdx + 7]  = srcMat[m + 7];
          dstMat[dstIdx + 8]  = srcMat[m + 8]  * scaleBoost;
          dstMat[dstIdx + 9]  = srcMat[m + 9]  * scaleBoost;
          dstMat[dstIdx + 10] = srcMat[m + 10] * scaleBoost;
          dstMat[dstIdx + 11] = srcMat[m + 11];
          dstMat[dstIdx + 12] = srcMat[m + 12];
          dstMat[dstIdx + 13] = srcMat[m + 13];
          dstMat[dstIdx + 14] = srcMat[m + 14];
          dstMat[dstIdx + 15] = srcMat[m + 15];
          dstIdx += 16;
        }
        dstMeta.set(rec.metaData.subarray(0, nKeep * 4), outCount * 4);
      }
      outCount += nKeep;
    }

    puffInstMesh.count = outCount;
    puffInstMesh.visible = outCount > 0;
    if (outCount > 0) {
      puffInstMesh.instanceMatrix.clearUpdateRanges();
      puffInstMesh.instanceMatrix.addUpdateRange(0, outCount * 16);
      puffInstMesh.instanceMatrix.needsUpdate = true;
      puffMetaAttr.clearUpdateRanges();
      puffMetaAttr.addUpdateRange(0, outCount * 4);
      puffMetaAttr.needsUpdate = true;
    }
  }

  return {
    group: root,
    colliders,
    setSunDirection: setTreeSunDirection,
    setTimeOfDay: setTreeTimeOfDay,
    gatherVisibleCanopyPuffs,
    update(
      _dt,
      elapsed = 0,
      sunDir = null,
      daylight = null,
      fogColor = null,
      lightTint = null,
      camera = null,
      profile = 'desktop'
    ) {
      const t = Number.isFinite(elapsed) ? elapsed : 0;
      treesMat.uniforms.uTime.value = t;
      puffMat.uniforms.uTime.value = t;
      if (sunDir) setTreeSunDirection(sunDir);
      if (daylight !== null || lightTint || fogColor) {
        setTreeTimeOfDay(daylight ?? 1.0, lightTint, fogColor);
      }
      if (camera) {
        gatherVisibleCanopyPuffs(camera, profile);
      }
    },
  };
}

export function buildBotanicalTrees(opts = {}) {
  return runSync(buildBotanicalTreesGen(opts));
}

export async function buildBotanicalTreesAsync(opts = {}) {
  return runAsync(buildBotanicalTreesGen(opts), createTimeSlicer(opts));
}
