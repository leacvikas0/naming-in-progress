import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TREES,
  terrainHeightAt,
} from './geography.js';

/**
 * Wide Layered Umbrella Leaf-Frond Trees, Asymmetric Chestnut Under-Boughs,
 * and Delicate 5-Petal Branch-Cluster Blossoms (`world/assets/terrain/trees.js`).
 *
 * Engineered to match `docs/refs/ref-target-trees.png` across all 48 valley grove trees
 * in a SINGLE merged draw call (`<= 2` draw calls budget).
 */

const TAU = Math.PI * 2;
const srgbColor = (hex) => new THREE.Color(hex);

const SUN_DIR = new THREE.Vector3(-0.21, 0.28, -0.93).normalize();
const LIGHT_TINT = new THREE.Color(1, 1, 1);
const FOG_COLOR = new THREE.Color(0xd8eef5);

export const TREE_STYLE = {
  uCel: { value: 1.0 },
  uRim: { value: 0.58 },
  uRimColor: { value: new THREE.Color(0xdff68c) },
};

export function setTreeSunDirection(dir) {
  if (!dir) return;
  SUN_DIR.set(dir.x, dir.y, dir.z).normalize();
}

export function setTreeTimeOfDay(daylight = 1.0, lightTint = null, fogColor = null) {
  if (lightTint) LIGHT_TINT.copy(lightTint);
  if (fogColor) FOG_COLOR.copy(fogColor);
  const rimScale = 0.30 + 0.32 * Math.max(0, Math.min(1, daylight));
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

// Harmonized spring palette matching docs/refs/ref-target-trees.png
const PAL = {
  // Luminous spring-lime & meadow-green foliage ramp
  topSun: srgbColor(0xb8e86c),
  midSun: srgbColor(0x92d456),
  lowSun: srgbColor(0x6cb446),
  rimSun: srgbColor(0xd4f482),
  shdTop: srgbColor(0x64ac42),
  shdLow: srgbColor(0x488a34),

  // Soft pastel sakura-blush & wisteria-lavender upper/outer leaf-frond accents
  sakuraTip: srgbColor(0xffe0ec),
  sakuraBase: srgbColor(0xf6bfd6),
  sakuraShd: srgbColor(0xd89cb6),

  wistLavTip: srgbColor(0xeee0ff),
  wistBlushTip: srgbColor(0xfde0f0),
  wistBase: srgbColor(0xd8bcf6),
  wistShd: srgbColor(0xb292d4),

  // Warm chestnut trunk & spreading under-boughs (#8e5a38 lit -> #5e3820 shade)
  barkSun: srgbColor(0x925c3a),
  barkShd: srgbColor(0x683e24),
  barkDeep: srgbColor(0x4e2c18),

  // Golden blossom stamen center
  stamenSun: srgbColor(0xffdc56),
  stamenShd: srgbColor(0xd99e2b),
};

// Delicate 5-petal branch-cluster & curved raceme blossom tints matching ref-target-trees.png
const BLOSSOM_TINTS = [
  { sun: srgbColor(0xfff6fa), shd: srgbColor(0xdcc8d6) }, // 0: creamy sakura white
  { sun: srgbColor(0xfcd0e2), shd: srgbColor(0xd49ab4) }, // 1: soft sakura blush
  { sun: srgbColor(0xe6d0fc), shd: srgbColor(0xb89ad8) }, // 2: soft wisteria lavender
  { sun: srgbColor(0xfcd8c4), shd: srgbColor(0xd4a48e) }, // 3: warm pastel peach
  { sun: srgbColor(0xdabef8), shd: srgbColor(0xa886ce) }, // 4: wisteria lilac
];

const CANOPY_VARIANTS = [
  // 0: Wide layered umbrella (signature ref-target-trees.png silhouette)
  { spread: 1.62, flatten: 0.84, lenMin: 1.78, lenMax: 2.24, widMin: 1.32, widMax: 1.62 },
  // 1: Asymmetric sweeping umbrella with low side shelf
  { spread: 1.68, flatten: 0.82, lenMin: 1.82, lenMax: 2.28, widMin: 1.34, widMax: 1.64 },
  // 2: Multi-crowned woodland umbrella
  { spread: 1.56, flatten: 0.86, lenMin: 1.74, lenMax: 2.18, widMin: 1.30, widMax: 1.58 },
];

class TreeGeometryBuilder {
  constructor(crownCenter) {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.shadowColors = [];
    this.crownCenters = [];
    this.windWeights = [];
    this.indices = [];
    this.vCount = 0;
    this.crownCenter = crownCenter;
  }

  addVertex(x, y, z, nx, ny, nz, sunCol, shdCol, wind = 0.0) {
    this.positions.push(x, y, z);
    const nLen = Math.hypot(nx, ny, nz) || 1;
    this.normals.push(nx / nLen, ny / nLen, nz / nLen);
    this.colors.push(sunCol.r, sunCol.g, sunCol.b);
    this.shadowColors.push(shdCol.r, shdCol.g, shdCol.b);
    this.crownCenters.push(this.crownCenter[0], this.crownCenter[1], this.crownCenter[2]);
    this.windWeights.push(wind);
    return this.vCount++;
  }

  addTaperedLimb(points, rStart, rEnd, sides = 5, flare = 0.0) {
    const n = points.length;
    const rings = [];
    const tangent = new THREE.Vector3();
    const right = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const ref = new THREE.Vector3();

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let r = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.82));
      if (flare > 0.0 && t < 0.35) {
        r += Math.pow(1.0 - t / 0.35, 2.0) * flare * rStart;
      }

      if (i === 0) tangent.subVectors(points[1], points[0]);
      else if (i === n - 1) tangent.subVectors(points[n - 1], points[n - 2]);
      else tangent.subVectors(points[i + 1], points[i - 1]);
      tangent.normalize();

      if (Math.abs(tangent.y) > 0.92) ref.set(1, 0, 0);
      else ref.set(0, 1, 0);
      right.crossVectors(tangent, ref).normalize();
      fwd.crossVectors(right, tangent).normalize();

      const sunC = PAL.barkSun.clone().lerp(PAL.barkShd, t * 0.26);
      const shdC = PAL.barkShd.clone().lerp(PAL.barkDeep, t * 0.26);

      const ring = [];
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * TAU;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const lobe = flare > 0.0 && t < 0.30 ? 1.0 + 0.14 * (1.0 - t / 0.30) * Math.cos(ang * 4.0) : 1.0;
        const rad = r * lobe;

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
            sunC,
            shdC,
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

  add5PetalBlossom(center, aimDir, radius, rotY, tintObj, windWeight = 0.65) {
    const up = aimDir.clone().normalize();
    const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, ref).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up).normalize();

    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);
    const rAxis = right.clone().multiplyScalar(cosR).addScaledVector(fwd, sinR);
    const fAxis = fwd.clone().multiplyScalar(cosR).addScaledVector(right, -sinR);

    const toWorld = (lx, ly, lz) => [
      center.x + (rAxis.x * lx + up.x * ly + fAxis.x * lz) * radius,
      center.y + (rAxis.y * lx + up.y * ly + fAxis.y * lz) * radius,
      center.z + (rAxis.z * lx + up.z * ly + fAxis.z * lz) * radius,
    ];

    const tipSun = tintObj.sun.clone().lerp(new THREE.Color(1, 1, 1), 0.25);
    const tipShd = tintObj.shd.clone();

    const p0 = toWorld(0, 0.03, 0);
    const vCenter = this.addVertex(
      p0[0], p0[1], p0[2],
      up.x, up.y + 0.55, up.z,
      PAL.stamenSun, PAL.stamenShd, windWeight * 0.8
    );

    const numPetals = 5;
    for (let p = 0; p < numPetals; p++) {
      const a = (p / numPetals) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rot = (x, y, z) => [x * ca - z * sa, y, x * sa + z * ca];

      const pL = toWorld(...rot(-0.125, 0.08, 0.23));
      const pR = toWorld(...rot(0.125, 0.08, 0.23));
      const pT = toWorld(...rot(0.0, 0.04, 0.44));

      const vL = this.addVertex(pL[0], pL[1], pL[2], up.x, up.y + 0.55, up.z, tintObj.sun, tintObj.shd, windWeight);
      const vR = this.addVertex(pR[0], pR[1], pR[2], up.x, up.y + 0.55, up.z, tintObj.sun, tintObj.shd, windWeight);
      const vT = this.addVertex(pT[0], pT[1], pT[2], up.x, up.y + 0.55, up.z, tipSun, tipShd, windWeight * 1.1);

      this.indices.push(vCenter, vL, vR, vL, vT, vR);
    }

    const s0 = toWorld(-0.07, 0.08, -0.04);
    const s1 = toWorld(0.07, 0.08, -0.04);
    const s2 = toWorld(0.0, 0.12, 0.07);
    const vs0 = this.addVertex(s0[0], s0[1], s0[2], up.x, up.y + 0.6, up.z, PAL.stamenSun, PAL.stamenShd, windWeight);
    const vs1 = this.addVertex(s1[0], s1[1], s1[2], up.x, up.y + 0.6, up.z, PAL.stamenSun, PAL.stamenShd, windWeight);
    const vs2 = this.addVertex(s2[0], s2[1], s2[2], up.x, up.y + 0.6, up.z, PAL.stamenSun, PAL.stamenShd, windWeight);
    this.indices.push(vs0, vs1, vs2);
  }

  toGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setAttribute('aShadowColor', new THREE.Float32BufferAttribute(this.shadowColors, 3));
    geo.setAttribute('aCrownCenter', new THREE.Float32BufferAttribute(this.crownCenters, 3));
    geo.setAttribute('aWindWeight', new THREE.Float32BufferAttribute(this.windWeights, 1));
    geo.setIndex(this.indices);
    return geo;
  }
}

/**
 * Adds a full, lush, multi-tiered umbrella canopy composed of 17 overlapping puffs
 * of broad, V-folded, horizontally-arching leaf fronds (`ref-target-trees.png`).
 * Upper/inner puffs have higher upward pitch so zero bare branch tips or venetian-blind
 * sky gaps appear in the crown, while outer puffs fan out into crisp layered leaf blades.
 */
function addUmbrellaCanopyToBuilder(builder, {
  seed,
  worldOrigin,
  scale,
  kind,
  variantIdx = 0,
  boughTipsLocal,
}) {
  const rand = createPRNG(seed);
  const randRange = (lo, hi) => lo + rand() * (hi - lo);
  const vCfg = CANOPY_VARIANTS[variantIdx % CANOPY_VARIANTS.length];
  const goldenAngle = 2.399963229728653;

  const puffs = [];

  // 1. 5 lower-outer umbrella pads seated directly on the primary bough tips
  for (let i = 0; i < boughTipsLocal.length; i++) {
    const bt = boughTipsLocal[i];
    puffs.push({
      x: bt.x * 0.88,
      y: bt.y - 0.05 * scale,
      z: bt.z * 0.88,
      r: (1.02 + (i % 2) * 0.14) * scale,
      hFrac: 0.22 + (i / boughTipsLocal.length) * 0.24,
      role: 'skirt',
      rot: rand() * TAU,
    });
  }

  // 2. 7 golden-angle middle/upper umbrella tier puffs bridging the crown with lush volume
  const shellCount = 7;
  for (let p = 0; p < shellCount; p++) {
    const t = (p + 0.5) / shellCount;
    const ang = p * goldenAngle + (rand() - 0.5) * 0.34;
    const rad = vCfg.spread * Math.pow(1.0 - t * 0.72, 0.64) * scale;
    const y = (3.08 + t * 1.38 + (rand() - 0.5) * 0.12) * scale;
    puffs.push({
      x: Math.cos(ang) * rad,
      y,
      z: Math.sin(ang) * rad,
      r: (1.04 + rand() * 0.16) * scale,
      hFrac: 0.42 + t * 0.48,
      role: 'shell',
      rot: rand() * TAU,
    });
  }

  // 3. Top crown puff
  puffs.push({
    x: (rand() - 0.5) * 0.20 * scale,
    y: 4.52 * scale,
    z: (rand() - 0.5) * 0.20 * scale,
    r: 1.05 * scale,
    hFrac: 0.96,
    role: 'crown',
    rot: rand() * TAU,
  });

  // 4. Two inner dome-core puffs sealing the upper trunk fork against sky-gaps while leaving lower boughs visible
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI + rand() * 0.5;
    puffs.push({
      x: Math.cos(a) * 0.32 * scale,
      y: (2.95 + i * 0.36) * scale,
      z: Math.sin(a) * 0.32 * scale,
      r: 0.98 * scale,
      hFrac: 0.20 + i * 0.16,
      role: 'collar',
      rot: rand() * TAU,
    });
  }

  const leavesPerPuff = 8;
  const sunYaw = Math.atan2(-0.93, -0.21);

  for (let pIdx = 0; pIdx < puffs.length; pIdx++) {
    const pf = puffs[pIdx];
    const hFrac = Math.max(0, Math.min(1, pf.hFrac));
    const puffWorldX = worldOrigin.x + pf.x;
    const puffWorldY = worldOrigin.y + pf.y;
    const puffWorldZ = worldOrigin.z + pf.z;

    const greenBaseSun = PAL.lowSun
      .clone()
      .lerp(PAL.midSun, smoothstep(0.10, 0.68, hFrac));
    const greenTipSun = PAL.midSun
      .clone()
      .lerp(PAL.topSun, smoothstep(0.16, 0.82, hFrac));
    const greenBaseShd = PAL.shdLow.clone();
    const greenTipShd = PAL.shdLow
      .clone()
      .lerp(PAL.shdTop, smoothstep(0.15, 0.85, hFrac));

    const firstVert = builder.vCount;
    const roleLen = pf.role === 'crown' ? 0.92 : pf.role === 'collar' ? 0.95 : 1.06;
    const puffTint = 0.96 + rand() * 0.08;
    const puffRadialYaw = Math.atan2(pf.z, pf.x);

    // Subtle pastel upper/outer leaf-frond accents matching ref-target-trees.png (~22% on wisteria/sakura, ~10% on oak)
    const canHavePastel = pf.role !== 'collar' && hFrac >= 0.48;
    const pastelChance =
      kind === 'wisteria' ? 0.24 : kind === 'sakura' ? 0.22 : 0.10;

    for (let l = 0; l < leavesPerPuff; l++) {
      const yaw = pf.rot + (l / leavesPerPuff) * TAU + (rand() - 0.5) * 0.52;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const sideX = -sinY;
      const sideZ = cosY;

      const outwardAlign = Math.cos(yaw - puffRadialYaw);
      // Alternate inner volume-sealing leaves (higher pitch) with outer sweeping umbrella fronds
      const isVolumeLeaf = pf.role === 'collar' || l % 3 === 1;
      const pitch = isVolumeLeaf
        ? randRange(0.42, 0.68)
        : randRange(0.20, 0.44);
      const arch = isVolumeLeaf ? 0.44 : 0.34;
      const length = randRange(vCfg.lenMin, vCfg.lenMax) * roleLen * scale;
      const width = randRange(vCfg.widMin, vCfg.widMax) * (isVolumeLeaf ? 1.14 : 1.0) * scale;
      const fold = 0.18 * scale;

      const baseR = pf.r * randRange(0.02, 0.24);
      const bx = puffWorldX + cosY * baseR;
      const by = puffWorldY + (rand() - 0.5) * pf.r * 0.44;
      const bz = puffWorldZ + sinY * baseR;

      const isPastelFrond =
        canHavePastel && outwardAlign > 0.05 && rand() < pastelChance * 1.2;

      let colBaseSun;
      let colTipSun;
      let colBaseShd;
      let colTipShd;

      if (isPastelFrond) {
        if (kind === 'wisteria') {
          const useBlush = (l + pIdx) % 3 === 0;
          colBaseSun = PAL.wistBase.clone();
          colTipSun = (useBlush ? PAL.wistBlushTip : PAL.wistLavTip).clone();
          colBaseShd = PAL.wistShd.clone();
          colTipShd = PAL.wistBase.clone().lerp(PAL.wistShd, 0.30);
        } else {
          colBaseSun = PAL.sakuraBase.clone();
          colTipSun = PAL.sakuraTip.clone();
          colBaseShd = PAL.sakuraShd.clone();
          colTipShd = PAL.sakuraBase.clone().lerp(PAL.sakuraShd, 0.28);
        }
      } else {
        const sunSide = Math.max(0, Math.cos(yaw - sunYaw));
        const rimBoost = smoothstep(0.22, 0.92, hFrac) * sunSide;
        colBaseSun = greenBaseSun.clone().multiplyScalar(puffTint);
        colTipSun = greenTipSun
          .clone()
          .lerp(PAL.rimSun, rimBoost * 0.24)
          .multiplyScalar(puffTint);
        colBaseShd = greenBaseShd.clone();
        colTipShd = greenTipShd.clone();
      }

      const evalRing = (t) => {
        const profile = Math.sin(Math.pow(t, 0.64) * Math.PI);
        const halfW = width * 0.5 * profile;
        const reach = length * t * Math.cos(pitch + t * arch * 0.55);
        const lift = length * (t * Math.sin(pitch) - t * t * arch);
        const cx = bx + cosY * reach;
        const cy = by + lift;
        const cz = bz + sinY * reach;
        const sunC = colBaseSun.clone().lerp(colTipSun, Math.pow(t, 0.80));
        const shdC = colBaseShd.clone().lerp(colTipShd, Math.pow(t, 0.80));
        const wind = t * t * 0.85;
        return { cx, cy, cz, halfW, profile, sunC, shdC, wind };
      };

      const s0 = evalRing(0.0);
      const s1 = evalRing(0.36);
      const s2 = evalRing(0.74);
      const s3 = evalRing(1.0);

      const addLeafV = (vx, vy, vz, sunC, shdC, wind) => {
        const nx = (vx - builder.crownCenter[0]) * 0.52;
        const ny = (vy - puffWorldY) * 1.38 + 0.98 * scale;
        const nz = (vz - builder.crownCenter[2]) * 0.52;
        return builder.addVertex(vx, vy, vz, nx, ny, nz, sunC, shdC, wind);
      };

      const vBase = addLeafV(s0.cx, s0.cy, s0.cz, s0.sunC, s0.shdC, s0.wind);

      const v1L = addLeafV(
        s1.cx + sideX * s1.halfW,
        s1.cy + fold * s1.profile,
        s1.cz + sideZ * s1.halfW,
        s1.sunC,
        s1.shdC,
        s1.wind
      );
      const v1M = addLeafV(
        s1.cx,
        s1.cy - fold * 0.42 * s1.profile,
        s1.cz,
        s1.sunC.clone().multiplyScalar(0.95),
        s1.shdC.clone().multiplyScalar(0.95),
        s1.wind
      );
      const v1R = addLeafV(
        s1.cx - sideX * s1.halfW,
        s1.cy + fold * s1.profile,
        s1.cz - sideZ * s1.halfW,
        s1.sunC,
        s1.shdC,
        s1.wind
      );

      const v2L = addLeafV(
        s2.cx + sideX * s2.halfW * 1.06,
        s2.cy + fold * s2.profile,
        s2.cz + sideZ * s2.halfW * 1.06,
        s2.sunC,
        s2.shdC,
        s2.wind
      );
      const v2M = addLeafV(
        s2.cx,
        s2.cy - fold * 0.42 * s2.profile,
        s2.cz,
        s2.sunC.clone().multiplyScalar(0.95),
        s2.shdC.clone().multiplyScalar(0.95),
        s2.wind
      );
      const v2R = addLeafV(
        s2.cx - sideX * s2.halfW * 1.06,
        s2.cy + fold * s2.profile,
        s2.cz - sideZ * s2.halfW * 1.06,
        s2.sunC,
        s2.shdC,
        s2.wind
      );

      const vTip = addLeafV(s3.cx, s3.cy, s3.cz, s3.sunC, s3.shdC, s3.wind);

      builder.indices.push(vBase, v1M, v1L, vBase, v1R, v1M);
      builder.indices.push(v1L, v1M, v2M, v1L, v2M, v2L);
      builder.indices.push(v1M, v1R, v2R, v1M, v2R, v2M);
      builder.indices.push(v2L, v2M, vTip, v2M, v2R, vTip);
    }

    const puffFlatten = pf.role === 'collar' ? 0.92 : vCfg.flatten;
    for (let v = firstVert; v < builder.vCount; v++) {
      const yi = v * 3 + 1;
      builder.positions[yi] = puffWorldY + (builder.positions[yi] - puffWorldY) * puffFlatten;
    }
  }
}

export function buildBotanicalTrees(opts = {}) {
  const colliders = opts.colliders || [];
  const root = new THREE.Group();
  root.name = 'botanical-trees';

  const allTreeGeometries = [];

  TREES.forEach((t, treeIdx) => {
    const ty = terrainHeightAt(t.x, t.z);
    const kind = t.kind || 'oak';
    const isWisteria = kind === 'wisteria';
    const isSakura = kind === 'sakura';
    const variantIdx = t.variant !== undefined ? t.variant : treeIdx % 3;
    const s = (t.scale || 1.0) * (isWisteria || isSakura ? 1.15 : 1.08);

    const rand = createPRNG(1009 + treeIdx * 137);
    const randRange = (lo, hi) => lo + rand() * (hi - lo);

    const worldOrigin = new THREE.Vector3(t.x, ty, t.z);
    const crownCenter = [worldOrigin.x, worldOrigin.y + 3.95 * s, worldOrigin.z];
    const builder = new TreeGeometryBuilder(crownCenter);

    const yawRot = (treeIdx * 2.17 + 0.45) % TAU;
    const cosYaw = Math.cos(yawRot);
    const sinYaw = Math.sin(yawRot);

    const toWorldVec = (lx, ly, lz) =>
      new THREE.Vector3(
        worldOrigin.x + (lx * cosYaw - lz * sinYaw) * s,
        worldOrigin.y + ly * s,
        worldOrigin.z + (lx * sinYaw + lz * cosYaw) * s
      );

    // 1. Sturdy Warm Chestnut Trunk with Asymmetric Lean & Grounded Basal Flare
    const leanX = (rand() - 0.5) * 0.44;
    const leanZ = (rand() - 0.5) * 0.38;
    const trunkPts = [
      toWorldVec(0.0, -0.14, 0.0),
      toWorldVec(leanX * 0.45, 0.62, leanZ * 0.45),
      toWorldVec(leanX * 0.85, 1.28, leanZ * 0.85),
      toWorldVec(leanX * 0.68, 1.90, leanZ * 0.68),
    ];
    const rTrunkBase = (isWisteria || isSakura ? 0.35 : 0.31) * s;
    const rTrunkFork = (isWisteria || isSakura ? 0.22 : 0.19) * s;
    builder.addTaperedLimb(trunkPts, rTrunkBase, rTrunkFork, 6, 0.40);

    const forkOrigin = trunkPts[trunkPts.length - 1];
    const leaderTop = toWorldVec(leanX * 0.32, 3.05, leanZ * 0.32);
    builder.addTaperedLimb([forkOrigin, leaderTop], rTrunkFork * 0.55, 0.03 * s, 4, 0.0);

    // 2. 5 Asymmetric Multi-Height Primary Boughs + Secondary Sub-Boughs
    const numBoughs = 5;
    const boughTipsLocal = [];
    const blossomAnchors = [];

    for (let b = 0; b < numBoughs; b++) {
      const bAz = (b / numBoughs) * TAU + randRange(-0.26, 0.26);
      const isLowSide = b === 0 || b === 2;
      const reach = isLowSide ? randRange(1.98, 2.32) : randRange(1.65, 2.02);
      const rise = isLowSide ? randRange(0.98, 1.22) : randRange(1.24, 1.48);
      const startY = isLowSide ? 1.45 + (b % 2) * 0.14 : 1.68 + (b % 2) * 0.16;

      const p0 = toWorldVec(leanX * 0.68, startY, leanZ * 0.68);
      const pMid = toWorldVec(
        leanX * 0.32 + Math.cos(bAz) * reach * 0.52,
        startY + rise * 0.52,
        leanZ * 0.32 + Math.sin(bAz) * reach * 0.52
      );
      const pEnd = toWorldVec(
        Math.cos(bAz) * reach,
        startY + rise,
        Math.sin(bAz) * reach
      );

      const rBoughStart = rTrunkFork * randRange(0.56, 0.65);
      const rBoughEnd = rBoughStart * 0.38;
      builder.addTaperedLimb([p0, pMid, pEnd], rBoughStart, rBoughEnd, 5, 0.0);

      boughTipsLocal.push({
        x: pEnd.x - worldOrigin.x,
        y: pEnd.y - worldOrigin.y,
        z: pEnd.z - worldOrigin.z,
      });

      const worldAz = bAz + yawRot;
      blossomAnchors.push({
        pos: pMid.clone(),
        outDir: new THREE.Vector3(Math.cos(worldAz), 0.18, Math.sin(worldAz)).normalize(),
      });
      blossomAnchors.push({
        pos: pmidLerp(pMid, pEnd, 0.52),
        outDir: new THREE.Vector3(Math.cos(worldAz), 0.24, Math.sin(worldAz)).normalize(),
      });

      for (const side of [-1, 1]) {
        const subAz = worldAz + side * randRange(0.38, 0.56);
        const subLen = randRange(0.76, 1.02);
        const subRise = randRange(0.30, 0.48);
        const subStart = pmidLerp(p0, pEnd, side < 0 ? 0.48 : 0.64);
        const subEnd = new THREE.Vector3(
          subStart.x + Math.cos(subAz) * subLen * s,
          subStart.y + subRise * s,
          subStart.z + Math.sin(subAz) * subLen * s
        );
        builder.addTaperedLimb([subStart, subEnd], rBoughStart * 0.48, 0.028 * s, 4, 0.0);
      }
    }

    // 3. Add Full, Lush Multi-Tier Umbrella Leaf-Frond Canopy
    addUmbrellaCanopyToBuilder(builder, {
      seed: 3007 + treeIdx * 113,
      worldOrigin,
      scale: s,
      kind,
      variantIdx,
      boughTipsLocal,
    });

    // 4. Delicate 5-Petal Star Blossom Bouquet Clusters Perched Along the Visible Lower Boughs
    const flowerBaseScale = 0.82 * (s / 1.15);
    const clusterCount = isWisteria ? 5 : isSakura ? 4 : 3;
    const blossomsPerCluster = 3;

    for (let c = 0; c < clusterCount; c++) {
      const anchor = blossomAnchors[(c * 2 + treeIdx) % blossomAnchors.length];
      const tintIdx = isWisteria
        ? [2, 4, 0, 1][(c + treeIdx) % 4]
        : isSakura
        ? [0, 1, 3, 2][(c + treeIdx) % 4]
        : [0, 3, 1, 2][(c + treeIdx) % 4];
      const tintObj = BLOSSOM_TINTS[tintIdx];

      for (let b = 0; b < blossomsPerCluster; b++) {
        const bAng = (b / blossomsPerCluster) * TAU + c * 1.15;
        const spreadR = randRange(0.08, 0.22) * s;
        const pos = new THREE.Vector3(
          anchor.pos.x + Math.cos(bAng) * spreadR,
          anchor.pos.y + randRange(-0.08, 0.12) * s,
          anchor.pos.z + Math.sin(bAng) * spreadR
        );
        const aim = new THREE.Vector3(
          anchor.outDir.x + Math.cos(bAng) * 0.45,
          randRange(-0.18, 0.30),
          anchor.outDir.z + Math.sin(bAng) * 0.45
        ).normalize();
        builder.add5PetalBlossom(
          pos,
          aim,
          flowerBaseScale * randRange(0.90, 1.22),
          randRange(0, TAU),
          tintObj,
          0.55
        );
      }
    }

    // 5. Delicate Curved Blossom Racemes on Wisteria & Sakura Hero Trees
    const strandCount = isWisteria ? 4 : isSakura ? 2 : 0;
    const blossomsPerStrand = isWisteria ? 4 : 3;

    for (let st = 0; st < strandCount; st++) {
      const anchor = blossomAnchors[(st * 2 + 1 + treeIdx) % blossomAnchors.length];
      const jitterAng = st * 2.39996 + randRange(-0.25, 0.25);
      const jitterRad = randRange(0.10, 0.32) * s;
      const topX = anchor.pos.x + Math.cos(jitterAng) * jitterRad;
      const topY = anchor.pos.y - 0.03 * s;
      const topZ = anchor.pos.z + Math.sin(jitterAng) * jitterRad;
      const strandLen = (isWisteria ? randRange(0.55, 0.82) : randRange(0.36, 0.54)) * s;
      const swayX = Math.cos(jitterAng) * 0.10 * s;
      const swayZ = Math.sin(jitterAng) * 0.10 * s;

      const strandTintIdx = isWisteria
        ? [2, 4, 0, 1][(st + treeIdx) % 4]
        : [0, 1, 2, 3][(st + treeIdx) % 4];
      const strandTint = BLOSSOM_TINTS[strandTintIdx];

      for (let tier = 0; tier < blossomsPerStrand; tier++) {
        const frac = tier / (blossomsPerStrand - 1);
        const wy = topY - (0.14 + frac * 0.82) * strandLen;
        const spiralAng = jitterAng + tier * 2.2;
        const radialOff = (1.0 - frac * 0.40) * 0.05 * s;
        const pos = new THREE.Vector3(
          topX + swayX * frac * frac + Math.cos(spiralAng) * radialOff,
          wy,
          topZ + swayZ * frac * frac + Math.sin(spiralAng) * radialOff
        );
        const aim = new THREE.Vector3(
          Math.cos(spiralAng) * 0.78,
          -0.25 + (1.0 - frac) * 0.25,
          Math.sin(spiralAng) * 0.78
        ).normalize();
        const taper = THREE.MathUtils.lerp(0.92, 0.56, Math.pow(frac, 0.85));
        builder.add5PetalBlossom(
          pos,
          aim,
          flowerBaseScale * taper,
          tier * 1.3 + rand() * 0.5,
          strandTint,
          0.75 + frac * 0.25
        );
      }
    }

    allTreeGeometries.push(builder.toGeometry());

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
  const treesMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR },
      uTime: { value: 0 },
      uLightTint: { value: LIGHT_TINT },
      uFogColor: { value: FOG_COLOR },
      uFogNear: { value: 165.0 },
      uFogFar: { value: 520.0 },
      uCel: TREE_STYLE.uCel,
      uRim: TREE_STYLE.uRim,
      uRimColor: TREE_STYLE.uRimColor,
    },
    side: THREE.DoubleSide,
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec3 aShadowColor;
      attribute vec3 aCrownCenter;
      attribute float aWindWeight;
      uniform float uTime;
      varying vec3 vColorSun;
      varying vec3 vColorShd;
      varying vec3 vCrownCenter;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vWindWeight;
      varying float vViewDist;
      void main() {
        vColorSun = color;
        vColorShd = aShadowColor;
        vCrownCenter = aCrownCenter;
        vWindWeight = aWindWeight;
        vec3 pos = position;
        if (aWindWeight > 0.01) {
          float wave = sin(uTime * 1.85 + pos.x * 0.55 + pos.z * 0.55) * 0.055 * aWindWeight;
          pos.x += wave;
          pos.z += wave * 0.65;
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
      varying vec3 vColorSun;
      varying vec3 vColorShd;
      varying vec3 vCrownCenter;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying float vWindWeight;
      varying float vViewDist;
      void main() {
        vec3 rawN = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
        float isFoliage = step(0.01, vWindWeight);
        vec3 N = normalize(mix(rawN, vec3(rawN.x * 0.40, 1.0, rawN.z * 0.40), isFoliage * 0.54));

        float ndl = dot(N, normalize(uSunDir)) * 0.5 + 0.5;
        float hCrown = clamp((vWorldPos.y - (vCrownCenter.y - 1.35)) / 2.7, 0.0, 1.0);
        float litIn = mix(ndl, ndl * 0.68 + hCrown * 0.32, isFoliage);

        float celBand = 0.5 * smoothstep(0.28, 0.38, litIn) + 0.5 * smoothstep(0.55, 0.65, litIn);
        float lightFactor = mix(smoothstep(0.20, 0.72, litIn), celBand, uCel);

        vec3 col = mix(vColorShd, vColorSun, lightFactor);

        if (isFoliage > 0.5) {
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 canN = normalize(vWorldPos - vCrownCenter + vec3(0.0, 0.001, 0.0));
          float fres = 1.0 - clamp(abs(dot(canN, V)), 0.0, 1.0);
          float rim = smoothstep(0.60, 0.90, fres) * smoothstep(0.45, 0.76, litIn);
          col = mix(col, uRimColor, rim * uRim * 0.22);
        }

        col *= uLightTint;
        float fogFactor = smoothstep(uFogNear, uFogFar, vViewDist);
        gl_FragColor = vec4(mix(col, uFogColor, fogFactor), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const treesMesh = new THREE.Mesh(mergedTreesGeo, treesMat);
  treesMesh.name = 'trees-merged-botanical';
  treesMesh.frustumCulled = false;
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

function pmidLerp(a, b, t) {
  return new THREE.Vector3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );
}
