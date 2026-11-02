import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TREES,
  terrainHeightAt,
  clamp,
} from './geography.js';

/**
 * Volumetric 3D Ghibli Trees & Hanging Wisteria Raceme Curtains (`world/assets/terrain/trees.js`).
 *
 * Wave 1C Upgrades:
 * - Replaces flat/thin canopy clusters with 6–7 overlapping 3D geodesic spherical/ovoid sub-domes (`sy: 0.78..0.95`)
 *   per tree crown with rich 360° horizontal + overhead volume, baked inner-core ambient occlusion,
 *   and luminous sunlit spring-emerald/lime upper crowns (`PAL.topSun`, `PAL.midSun`, `PAL.rimSun`).
 * - Adds 18–28 hanging 3D conical raceme blossom curtains (`0.9m–2.1m` long) drooping beneath the canopy
 *   rim on Wisteria, Shrine & Blossom trees (matching `docs/references/visual-concepts/01-title.png`),
 *   sculpted as tapered 3D multi-sided raceme cones/clusters with lavender-to-blush-white vertical color
 *   gradients and higher `windWeight` (`0.75..1.0`) at the hanging tips.
 * - Entire 68-tree valley system merged into 1 draw call (`<= 2` draw calls budget).
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

// Harmonized Ghibli spring palette matching docs/references/visual-concepts/01-title.png
const PAL = {
  // Pure, vibrant spring-lime & meadow-green foliage ramp + deep inner-core forest AO
  topSun: srgbColor(0xc2ec70),
  midSun: srgbColor(0x8ed452),
  lowSun: srgbColor(0x62ae3e),
  rimSun: srgbColor(0xdcf888),
  shdTop: srgbColor(0x5aa23a),
  shdLow: srgbColor(0x39782a),
  aoCore: srgbColor(0x23501d),

  // Sakura & Wisteria hanging raceme & blossom cluster palettes
  sakuraTip: srgbColor(0xfff2f7),
  sakuraMid: srgbColor(0xf9c6da),
  sakuraTop: srgbColor(0xec92b6),
  sakuraShdTop: srgbColor(0xc2688e),
  sakuraShdLow: srgbColor(0xdfa2bc),

  wistBlushTip: srgbColor(0xfff4fc),
  wistLavMid: srgbColor(0xe2befc),
  wistOrchid: srgbColor(0xc692f6),
  wistVioletTop: srgbColor(0x9c64e2),
  wistShdTop: srgbColor(0x6c3cae),
  wistShdLow: srgbColor(0xb48edc),

  // Warm chestnut trunk & spreading under-boughs
  barkSun: srgbColor(0x925c3a),
  barkShd: srgbColor(0x683e24),
  barkDeep: srgbColor(0x4e2c18),

  // Golden blossom stamen center
  stamenSun: srgbColor(0xffdc56),
  stamenShd: srgbColor(0xd99e2b),
};

const BLOSSOM_TINTS = [
  { sun: srgbColor(0xfff6fa), shd: srgbColor(0xdcc8d6) }, // 0: creamy sakura white
  { sun: srgbColor(0xfcd0e2), shd: srgbColor(0xd49ab4) }, // 1: soft sakura blush
  { sun: srgbColor(0xe6d0fc), shd: srgbColor(0xb89ad8) }, // 2: soft wisteria lavender
  { sun: srgbColor(0xfcd8c4), shd: srgbColor(0xd4a48e) }, // 3: warm pastel peach
  { sun: srgbColor(0xdabef8), shd: srgbColor(0xa886ce) }, // 4: wisteria lilac
];

// Prebuild a welded 8-azimuth × 4-ring staggered geodesic dome template (26 vertices, 48 triangles)
// so every volumetric sub-dome is lush from all 360° angles and overhead while keeping all 69 trees <= 48k tris!
const GEODESIC_DOME_TEMPLATE = (() => {
  const azSegs = 8;
  const elRings = 4;
  const uniqueVerts = [[0, 1, 0]]; // index 0: top pole
  const rings = [];

  for (let r = 1; r < elRings; r++) {
    const phi = (r / elRings) * Math.PI;
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    const row = [];
    for (let s = 0; s < azSegs; s++) {
      const theta = (s / azSegs) * TAU + (r % 2) * (TAU / (azSegs * 2));
      row.push(uniqueVerts.length);
      uniqueVerts.push([sinP * Math.cos(theta), cosP, sinP * Math.sin(theta)]);
    }
    rings.push(row);
  }
  const botPole = uniqueVerts.length;
  uniqueVerts.push([0, -1, 0]);

  const indices = [];
  const firstRow = rings[0];
  for (let s = 0; s < azSegs; s++) {
    indices.push(0, firstRow[s], firstRow[(s + 1) % azSegs]);
  }
  for (let r = 0; r < rings.length - 1; r++) {
    const rA = rings[r];
    const rB = rings[r + 1];
    for (let s = 0; s < azSegs; s++) {
      const ns = (s + 1) % azSegs;
      indices.push(rA[s], rB[s], rA[ns], rA[ns], rB[s], rB[ns]);
    }
  }
  const lastRow = rings[rings.length - 1];
  for (let s = 0; s < azSegs; s++) {
    indices.push(lastRow[s], botPole, lastRow[(s + 1) % azSegs]);
  }
  return { uniqueVerts, indices };
})();

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

  addTaperedLimb(points, rStart, rEnd, sides = 4, flare = 0.0) {
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

  /**
   * Sculpts a rich, closed 3D geodesic spherical/ovoid foliage sub-dome (`sy: 0.78..0.95`)
   * with organic multi-lobed Ghibli leaf-clump billowing, baked inner-core ambient occlusion
   * on lower/inner vertices, and pure luminous sunlit spring-emerald/lime upper crowns.
   */
  addVolumetricSubDome({
    cx,
    cy,
    cz,
    rx,
    sy = 0.86,
    rz,
    hCrownFrac = 0.5,
    isInnerCore = false,
    seed = 1,
    sunYaw = 0,
  }) {
    const ry = rx * sy;
    const baseVertOffset = this.vCount;
    const tmpSun = new THREE.Color();
    const tmpShd = new THREE.Color();
    const { uniqueVerts, indices } = GEODESIC_DOME_TEMPLATE;

    for (let i = 0; i < uniqueVerts.length; i++) {
      const [ux, uy, uz] = uniqueVerts[i];
      const theta = Math.atan2(uz, ux);

      // Smooth 3D Ghibli cloud-leaf billowing across all 360° directions and overhead
      const lobe1 = Math.sin(ux * 3.4 + seed * 1.3) * Math.cos(uz * 3.4 - seed * 0.9);
      const lobe2 = Math.sin((uy + 0.5) * 4.2 + seed * 2.1) * 0.5;
      const puffScale = 1.0 + 0.11 * lobe1 + 0.06 * lobe2;
      const underTuck = uy < 0 ? 0.86 : 1.0;

      const lx = ux * rx * puffScale;
      const ly = uy * ry * underTuck * (1.0 + 0.05 * lobe1);
      const lz = uz * rz * puffScale;

      const wx = cx + lx;
      const wy = cy + ly;
      const wz = cz + lz;

      // Blend local ovoid normal with overall crown radial normal for clean Ghibli cel shading
      const dnx = ux / rx;
      const dny = uy / ry;
      const dnz = uz / rz;
      const cnx = (wx - this.crownCenter[0]) * 0.36;
      const cny = (wy - this.crownCenter[1]) * 0.42 + 0.35;
      const cnz = (wz - this.crownCenter[2]) * 0.36;
      const nx = dnx * 0.68 + cnx * 0.32;
      const ny = dny * 0.68 + cny * 0.32;
      const nz = dnz * 0.68 + cnz * 0.32;

      const domeVertT = clamp(uy * 0.5 + 0.5, 0, 1); // 0 at bottom pole, 1 at top pole
      const radialDist = Math.hypot(wx - this.crownCenter[0], wz - this.crownCenter[2]);
      const coreOcclusion = isInnerCore
        ? 0.40
        : smoothstep(0.55, 2.35, radialDist) * 0.65 + 0.35;
      const underOcclusion = smoothstep(0.0, 0.46, domeVertT);
      const aoFactor = clamp(coreOcclusion * underOcclusion, 0.0, 1.0);

      const hTotal = clamp(hCrownFrac * 0.52 + domeVertT * 0.48, 0, 1);
      const sunAlign = Math.max(0, Math.cos(theta - sunYaw));

      tmpSun
        .copy(PAL.aoCore)
        .lerp(PAL.lowSun, smoothstep(0.0, 0.40, aoFactor))
        .lerp(PAL.midSun, smoothstep(0.26, 0.70, hTotal) * aoFactor)
        .lerp(PAL.topSun, smoothstep(0.56, 0.92, hTotal) * aoFactor)
        .lerp(PAL.rimSun, smoothstep(0.74, 1.0, hTotal) * sunAlign * 0.30);

      tmpShd
        .copy(PAL.aoCore)
        .lerp(PAL.shdLow, smoothstep(0.08, 0.52, aoFactor))
        .lerp(PAL.shdTop, smoothstep(0.45, 0.92, hTotal) * aoFactor);

      const wind = clamp((0.18 + 0.38 * (1.0 - Math.abs(uy)) + 0.25 * domeVertT) * (isInnerCore ? 0.5 : 1.0), 0.1, 0.72);
      this.addVertex(wx, wy, wz, nx, ny, nz, tmpSun, tmpShd, wind);
    }

    for (let i = 0; i < indices.length; i++) {
      this.indices.push(baseVertOffset + indices[i]);
    }
  }

  /**
   * Sculpts a 3-tiered scalloped 3D raceme blossom panicle (`0.9m–2.1m` long, 20 triangles)
   * drooping beneath the canopy rim (matching `docs/references/visual-concepts/01-title.png`),
   * with flared petal-bell tiers, lavender-to-blush-white vertical color gradients,
   * and higher `windWeight` (`0.75..1.0`) at the hanging tips.
   */
  addHangingConicalRaceme({
    topX,
    topY,
    topZ,
    length = 1.45,
    topRadius = 0.26,
    swayX = 0.05,
    swayZ = 0.04,
    kind = 'wisteria',
    variant = 0,
    rotOffset = 0.0,
  }) {
    const sides = 4;
    const isWist = kind === 'wisteria';

    const colTopSun = isWist
      ? (variant % 2 === 0 ? PAL.wistVioletTop : srgbColor(0xad74f0))
      : PAL.sakuraTop;
    const colMidSun = isWist
      ? (variant % 2 === 0 ? PAL.wistOrchid : PAL.wistLavMid)
      : PAL.sakuraMid;
    const colTipSun = isWist ? PAL.wistBlushTip : PAL.sakuraTip;

    const colTopShd = isWist ? PAL.wistShdTop : PAL.sakuraShdTop;
    const colTipShd = isWist ? PAL.wistShdLow : PAL.sakuraShdLow;

    const topCapIdx = this.addVertex(
      topX,
      topY + 0.10,
      topZ,
      0,
      1,
      0,
      colTopSun,
      colTopShd,
      0.40
    );

    // 3 scalloped floret tiers forming a puffed, cascading wisteria panicle
    const profileStations = [
      { frac: 0.22, radMul: 1.05, nyTilt: 0.32 },
      { frac: 0.56, radMul: 0.76, nyTilt: 0.08 },
      { frac: 0.84, radMul: 0.42, nyTilt: -0.22 },
    ];

    const ringIndices = [];
    const tmpSun = new THREE.Color();
    const tmpShd = new THREE.Color();

    for (let tIdx = 0; tIdx < profileStations.length; tIdx++) {
      const st = profileStations[tIdx];
      const frac = st.frac;
      const r = topRadius * st.radMul;
      const y = topY - frac * length;
      const cx = topX + swayX * frac * frac;
      const cz = topZ + swayZ * frac * frac;

      tmpSun
        .copy(colTopSun)
        .lerp(colMidSun, smoothstep(0.08, 0.52, frac))
        .lerp(colTipSun, smoothstep(0.45, 0.92, frac));
      tmpShd.copy(colTopShd).lerp(colTipShd, smoothstep(0.15, 0.90, frac));

      const wind = THREE.MathUtils.lerp(0.52, 0.95, Math.pow(frac, 0.80));
      const row = [];
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * TAU + rotOffset + tIdx * 0.38;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const floretLobe = r * (0.92 + 0.16 * ((k + tIdx) % 2));
        const dropY = y - ((k + tIdx) % 2) * 0.06 * length;
        row.push(
          this.addVertex(
            cx + ca * floretLobe,
            dropY,
            cz + sa * floretLobe,
            ca,
            st.nyTilt,
            sa,
            tmpSun,
            tmpShd,
            wind
          )
        );
      }
      ringIndices.push(row);
    }

    const tipIdx = this.addVertex(
      topX + swayX,
      topY - length,
      topZ + swayZ,
      0,
      -0.80,
      0,
      colTipSun,
      colTipShd,
      0.98
    );

    const r0 = ringIndices[0];
    for (let k = 0; k < sides; k++) {
      const nk = (k + 1) % sides;
      this.indices.push(topCapIdx, r0[k], r0[nk]);
    }

    for (let tIdx = 0; tIdx < ringIndices.length - 1; tIdx++) {
      const rA = ringIndices[tIdx];
      const rB = ringIndices[tIdx + 1];
      for (let k = 0; k < sides; k++) {
        const nk = (k + 1) % sides;
        this.indices.push(rA[k], rB[k], rA[nk], rA[nk], rB[k], rB[nk]);
      }
    }

    const rLast = ringIndices[ringIndices.length - 1];
    for (let k = 0; k < sides; k++) {
      const nk = (k + 1) % sides;
      this.indices.push(rLast[k], tipIdx, rLast[nk]);
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
 * Adds 6–7 overlapping 3D geodesic spherical/ovoid foliage sub-domes (`sy: 0.78..0.95`)
 * that give every tree rich, painterly 360° horizontal AND overhead volume
 * with baked inner-core ambient occlusion and sunlit spring-emerald/lime upper crowns.
 */
function addVolumetricGhibliCrownToBuilder(builder, {
  seed,
  worldOrigin,
  scale,
  kind,
  variantIdx = 0,
  boughTipsLocal,
}) {
  const rand = createPRNG(seed);
  const randRange = (lo, hi) => lo + rand() * (hi - lo);
  const sunYaw = Math.atan2(-0.93, -0.21);

  const subDomes = [];

  // 1. 5 lower/mid perimeter 3D ovoid sub-domes seated directly over the 5 spreading bough tips
  for (let i = 0; i < boughTipsLocal.length; i++) {
    const bt = boughTipsLocal[i];
    const rx = randRange(1.44, 1.70) * scale;
    const rz = rx * randRange(0.92, 1.08);
    const sy = randRange(0.78, 0.90);
    subDomes.push({
      cx: worldOrigin.x + bt.x * 0.92,
      cy: worldOrigin.y + bt.y + 0.42 * scale,
      cz: worldOrigin.z + bt.z * 0.92,
      rx,
      sy,
      rz,
      hCrownFrac: 0.36 + (i % 3) * 0.14,
      isInnerCore: false,
      seed: seed + i * 19,
    });
  }

  // 2. 1 Inner-core ambient-occluded sub-dome sealing the central trunk fork with deep forest shade
  subDomes.push({
    cx: worldOrigin.x + randRange(-0.18, 0.18) * scale,
    cy: worldOrigin.y + 3.25 * scale,
    cz: worldOrigin.z + randRange(-0.18, 0.18) * scale,
    rx: 1.60 * scale,
    sy: 0.84,
    rz: 1.58 * scale,
    hCrownFrac: 0.28,
    isInnerCore: true,
    seed: seed + 107,
  });

  // 3. 1 Luminous upper-central crown sub-dome (`sy: 0.86..0.95`)
  subDomes.push({
    cx: worldOrigin.x + randRange(-0.22, 0.22) * scale,
    cy: worldOrigin.y + 4.18 * scale,
    cz: worldOrigin.z + randRange(-0.22, 0.22) * scale,
    rx: 1.68 * scale,
    sy: randRange(0.86, 0.95),
    rz: 1.66 * scale,
    hCrownFrac: 0.92,
    isInnerCore: false,
    seed: seed + 211,
  });

  // 4. 7th asymmetric shoulder sub-dome for multi-crowned Ghibli silhouette variety
  if (variantIdx % 2 === 0 || kind === 'wisteria') {
    const shAng = (variantIdx * 2.1 + rand() * 0.8) % TAU;
    const shDist = 1.06 * scale;
    subDomes.push({
      cx: worldOrigin.x + Math.cos(shAng) * shDist,
      cy: worldOrigin.y + 3.78 * scale,
      cz: worldOrigin.z + Math.sin(shAng) * shDist,
      rx: 1.46 * scale,
      sy: randRange(0.82, 0.93),
      rz: 1.42 * scale,
      hCrownFrac: 0.72,
      isInnerCore: false,
      seed: seed + 307,
    });
  }

  for (const sd of subDomes) {
    builder.addVolumetricSubDome({
      ...sd,
      sunYaw,
    });
  }

  return subDomes;
}

export function buildSingleTreeGeometry(t, treeIdx = 0) {
  const ty = terrainHeightAt(t.x, t.z);
  const kind = t.kind || 'oak';
  const isWisteria = kind === 'wisteria';
  const isSakura = kind === 'sakura';
  const isShrine = Boolean(t.hasPlanter);
  const variantIdx = t.variant !== undefined ? t.variant : treeIdx % 3;
  const s = (t.scale || 1.0) * (isWisteria || isSakura ? 1.15 : 1.08);

  const rand = createPRNG(1009 + treeIdx * 137);
  const randRange = (lo, hi) => lo + rand() * (hi - lo);

  const worldOrigin = new THREE.Vector3(t.x, ty, t.z);
  const crownCenter = [worldOrigin.x, worldOrigin.y + 3.85 * s, worldOrigin.z];
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
    toWorldVec(0.0, -0.16, 0.0),
    toWorldVec(leanX * 0.45, 0.62, leanZ * 0.45),
    toWorldVec(leanX * 0.85, 1.28, leanZ * 0.85),
    toWorldVec(leanX * 0.68, 1.92, leanZ * 0.68),
  ];
  const rTrunkBase = (isWisteria || isSakura ? 0.36 : 0.32) * s;
  const rTrunkFork = (isWisteria || isSakura ? 0.23 : 0.20) * s;
  builder.addTaperedLimb(trunkPts, rTrunkBase, rTrunkFork, 6, 0.42);

  const forkOrigin = trunkPts[trunkPts.length - 1];
  const leaderTop = toWorldVec(leanX * 0.32, 3.15, leanZ * 0.32);
  builder.addTaperedLimb([forkOrigin, leaderTop], rTrunkFork * 0.58, 0.05 * s, 4, 0.0);

  // 2. 5 Asymmetric Multi-Height Primary Boughs + Secondary Sub-Boughs
  const numBoughs = 5;
  const boughTipsLocal = [];
  const blossomAnchors = [];

  for (let b = 0; b < numBoughs; b++) {
    const bAz = (b / numBoughs) * TAU + randRange(-0.24, 0.24);
    const isLowSide = b === 0 || b === 2;
    const reach = isLowSide ? randRange(1.92, 2.26) : randRange(1.62, 1.98);
    const rise = isLowSide ? randRange(0.96, 1.20) : randRange(1.22, 1.46);
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
      pos: pmidLerp(pMid, pEnd, 0.55),
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
      builder.addTaperedLimb([subStart, subEnd], rBoughStart * 0.48, 0.03 * s, 4, 0.0);
    }
  }

  // 3. Add Volumetric 6–7 Overlapping 3D Geodesic Spherical/Ovoid Sub-Domes (`sy: 0.78..0.95`)
  const subDomes = addVolumetricGhibliCrownToBuilder(builder, {
    seed: 3007 + treeIdx * 113,
    worldOrigin,
    scale: s,
    kind,
    variantIdx,
    boughTipsLocal,
  });

  // 4. Perched 5-Petal Star Blossom Clusters on Upper Canopy & Boughs (matching 01-title.png upper crown flowers)
  const perimeterDomes = subDomes.filter((d) => !d.isInnerCore && d.hCrownFrac < 0.85);
  const flowerBaseScale = 0.88 * (s / 1.15);
  const clusterCount = isWisteria ? 7 : isSakura ? 6 : 3;

  for (let c = 0; c < clusterCount; c++) {
    const dome = subDomes[c % subDomes.length];
    const tintIdx = isWisteria
      ? [0, 2, 4, 1][(c + treeIdx) % 4]
      : isSakura
      ? [0, 1, 3, 2][(c + treeIdx) % 4]
      : [0, 3, 1, 2][(c + treeIdx) % 4];
    const tintObj = BLOSSOM_TINTS[tintIdx];

    const bAng = (c / clusterCount) * TAU + treeIdx * 0.7;
    const rSurf = dome.rx * 0.78;
    const pos = new THREE.Vector3(
      dome.cx + Math.cos(bAng) * rSurf,
      dome.cy + dome.rx * dome.sy * 0.72,
      dome.cz + Math.sin(bAng) * rSurf
    );
    const aim = new THREE.Vector3(Math.cos(bAng) * 0.55, 0.82, Math.sin(bAng) * 0.55).normalize();
    builder.add5PetalBlossom(
      pos,
      aim,
      flowerBaseScale * randRange(0.95, 1.25),
      randRange(0, TAU),
      tintObj,
      0.55
    );
  }

  // 5. 18–28 Hanging 3D Conical Raceme Blossom Curtains (`0.9m–1.6m` long)
  // Drooping in lush tiered curtains beneath the 360° perimeter sub-domes on Wisteria, Shrine & Sakura trees
  const racemeCount = isWisteria || isShrine ? 25 : isSakura ? 18 : 0;

  for (let rIdx = 0; rIdx < racemeCount; rIdx++) {
    const dome = perimeterDomes[rIdx % perimeterDomes.length];
    const localIdx = Math.floor(rIdx / perimeterDomes.length);
    // Distribute curtains around the outer-lower rim of each perimeter sub-dome so they hang cleanly below the green crown
    const domeOutwardAng = Math.atan2(dome.cz - worldOrigin.z, dome.cx - worldOrigin.x);
    const spreadAng = ((localIdx / 5) - 0.4) * 2.2 + (rIdx % 2 === 0 ? 0.22 : -0.22);
    const ringAng = domeOutwardAng + spreadAng + randRange(-0.14, 0.14);
    const ringR = dome.rx * randRange(0.58, 0.88);
    const topX = dome.cx + Math.cos(ringAng) * ringR;
    const topZ = dome.cz + Math.sin(ringAng) * ringR;
    const topY = dome.cy - dome.rx * dome.sy * randRange(0.18, 0.38);

    const rawLen = isWisteria || isShrine
      ? randRange(0.92, 1.55)
      : randRange(0.82, 1.25);
    const maxSafeLen = Math.max(0.78, topY - (worldOrigin.y + 1.80));
    const racemeLen = Math.min(rawLen * (0.88 + 0.10 * (t.scale || 1.0)), maxSafeLen);
    const topRadius = randRange(0.13, 0.19) * Math.min(1.15, s * 0.85);

    builder.addHangingConicalRaceme({
      topX,
      topY,
      topZ,
      length: racemeLen,
      topRadius,
      swayX: Math.cos(ringAng) * 0.05 * s,
      swayZ: Math.sin(ringAng) * 0.05 * s,
      kind: isWisteria ? 'wisteria' : 'sakura',
      variant: rIdx + variantIdx,
      rotOffset: rand() * TAU,
    });
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
  const treesMat = new THREE.ShaderMaterial({
    uniforms: {
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
          float wave = sin(uTime * 1.85 + pos.x * 0.55 + pos.z * 0.55) * 0.065 * aWindWeight;
          pos.x += wave;
          pos.z += wave * 0.68;
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
        vec3 N = normalize(mix(rawN, vec3(rawN.x * 0.52, max(rawN.y, 0.35), rawN.z * 0.52), isFoliage * 0.42));

        float ndl = dot(N, normalize(uSunDir)) * 0.5 + 0.5;
        float hCrown = clamp((vWorldPos.y - (vCrownCenter.y - 1.55)) / 3.1, 0.0, 1.0);
        float litIn = mix(ndl, ndl * 0.68 + hCrown * 0.32, isFoliage);

        float celBand = 0.5 * smoothstep(0.28, 0.38, litIn) + 0.5 * smoothstep(0.55, 0.65, litIn);
        float lightFactor = mix(smoothstep(0.20, 0.72, litIn), celBand, uCel);

        vec3 col = mix(vColorShd, vColorSun, lightFactor);

        if (isFoliage > 0.5) {
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 canN = normalize(vWorldPos - vCrownCenter + vec3(0.0, 0.001, 0.0));
          float fres = 1.0 - clamp(abs(dot(canN, V)), 0.0, 1.0);
          float rim = smoothstep(0.58, 0.88, fres) * smoothstep(0.42, 0.76, litIn);
          col = mix(col, uRimColor, rim * uRim * 0.24);
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
