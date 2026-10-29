// Procedural anime flowering tree ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ported from "ai_studio_code (38).html".
//
// The source page builds one hero tree: a gnarled S-curved trunk, recursive
// boughs, and then thousands of *individual 3D leaves* and *5-petal flowers*
// instanced inside branch-tip clusters. Its Ghibli look comes from two ideas:
//
//   1. cluster-normal lighting ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â each leaf is lit as if it were part of a soft
//      spherical puff, not as a flat card, which is what removes the "cutout" look;
//   2. everything is real geometry with baked vertex colour, so there is no
//      texture to fight and no alpha sorting.
//
// This module keeps the geometry and shaders verbatim and turns the page into a
// factory: `createAnimeFlowerTree({ seed, leafCount, flowerCount, height })`.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Both tree shaders end with pow(col, 2.2): they expect DISPLAY-REFERRED colours.
// new THREE.Color(hex) converts sRGB -> linear, so passing it straight in
// linearises twice -- bright tips survive, shadows crush toward black. That one
// bug produced both the acid-lime leaves and the near-black speckle.
// rawColor() stores the authored numbers untouched, which is what the shaders want.
const rawColor = (hex) =>
  new THREE.Color().setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

const SUN_DIR = new THREE.Vector3(0.55, 0.78, 0.45).normalize();

// The tree shaders own a private sun vector; without this they would keep
// lighting the canopy from the old direction while the sky, the grass and the
// terrain moved to the new one.
export function setTreeSunDirection(dir) {
  if (!dir) return;
  SUN_DIR.set(dir.x, dir.y, dir.z).normalize();
}

// Style levers shared by EVERY tree material in the scene.
//
// These are one set of uniform objects, referenced by every leaf/flower material
// the factory creates, so a style preset can restyle all ~30 trees with a single
// write instead of walking the scene graph. Defaults are 0 = the look the meadow
// already shipped with, so nothing changes unless something asks for it.
//
//   uCel  0 = smooth two-tone ramp, 1 = three flat cel tones
//   uRim  0 = none, 1 = fresnel rim light on the sun side
//   uInk  0 = none, 1 = dark contour on grazing-angle (card-edge) silhouettes
export const TREE_STYLE = {
  uCel: { value: 0 },
  uRim: { value: 0 },
  uInk: { value: 0 },
  uRimColor: { value: new THREE.Color().setRGB(1.0, 0.97, 0.90) },
  uInkColor: { value: new THREE.Color().setRGB(0.17, 0.13, 0.21) },
};

/* -------------------------------------------------------------------------- */
/* leaf + flower geometry (verbatim)                                          */
/* -------------------------------------------------------------------------- */

function createSingle3DLeafGeometry() {
  const positions = [
    0.0, 0.0, 0.0,
    0.0, 0.025, 0.2,
    0.0, 0.015, 0.36,
    0.0, -0.02, 0.5,
    -0.13, 0.05, 0.14,
    -0.1, 0.04, 0.23,
    -0.14, 0.045, 0.31,
    0.13, 0.05, 0.14,
    0.1, 0.04, 0.23,
    0.14, 0.045, 0.31,
  ];
  const indices = [
    0, 1, 4,
    4, 1, 5,
    5, 1, 2,
    5, 2, 6,
    6, 2, 3,
    0, 7, 1,
    1, 7, 8,
    1, 8, 2,
    2, 8, 9,
    2, 9, 3,
  ];
  const uvs = [
    0.5, 0.0,
    0.5, 0.4,
    0.5, 0.72,
    0.5, 1.0,
    0.0, 0.28,
    0.15, 0.46,
    0.0, 0.64,
    1.0, 0.28,
    0.85, 0.46,
    1.0, 0.64,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createSingle5PetalFlowerGeometry(flowerPalette) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  const fp = flowerPalette || {};
  const cStamen = rawColor(fp.stamen ?? 0xf2e2b0);
  const cThroat = rawColor(fp.throat ?? 0x9a78cc);
  const cMid = rawColor(fp.mid ?? 0xb48fdd);
  const cTip = rawColor(fp.tip ?? 0xd9c6ef);

  positions.push(0, 0.02, 0);
  colors.push(cStamen.r, cStamen.g, cStamen.b);
  uvs.push(0.5, 0.0);

  let vIdx = 1;
  const numPetals = 5;

  for (let p = 0; p < numPetals; p++) {
    const baseAngle = (p / numPetals) * Math.PI * 2;
    const rot = (x, y, z) => {
      const cos = Math.cos(baseAngle);
      const sin = Math.sin(baseAngle);
      return [x * cos - z * sin, y, x * sin + z * cos];
    };
    const pVerts = [
      { pos: rot(-0.04, 0.03, 0.07), col: cThroat, uv: [0.2, 0.2] },
      { pos: rot(0.04, 0.03, 0.07), col: cThroat, uv: [0.8, 0.2] },
      { pos: rot(-0.13, 0.09, 0.22), col: cMid, uv: [0.0, 0.6] },
      { pos: rot(0.0, 0.07, 0.23), col: cMid, uv: [0.5, 0.6] },
      { pos: rot(0.13, 0.09, 0.22), col: cMid, uv: [1.0, 0.6] },
      { pos: rot(0.0, 0.06, 0.36), col: cTip, uv: [0.5, 1.0] },
    ];
    for (const v of pVerts) {
      positions.push(...v.pos);
      colors.push(v.col.r, v.col.g, v.col.b);
      uvs.push(...v.uv);
    }
    indices.push(
      0, vIdx + 0, vIdx + 1,
      vIdx + 0, vIdx + 2, vIdx + 3,
      vIdx + 0, vIdx + 3, vIdx + 1,
      vIdx + 1, vIdx + 3, vIdx + 4,
      vIdx + 2, vIdx + 5, vIdx + 3,
      vIdx + 3, vIdx + 5, vIdx + 4
    );
    vIdx += 6;
  }

  const budTopIdx = vIdx;
  positions.push(0, 0.075, 0);
  colors.push(1.0, 0.92, 0.45);
  uvs.push(0.5, 0.0);
  for (let p = 0; p < numPetals; p++) {
    const a = 1 + p * 6;
    const b = 1 + ((p + 1) % numPetals) * 6;
    indices.push(budTopIdx, a, b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* -------------------------------------------------------------------------- */
/* tree factory                                                               */
/* -------------------------------------------------------------------------- */

export function createAnimeFlowerTree(options = {}) {
  const {
    seed = 42,
    leafCount = 2000,
    flowerCount = 400,
    height = 11,
    natural = false, // true = keep the source page's authored scale
    leafScale = 1, // per-leaf size multiplier (LOD: fewer, bigger leaves)
    barkDetail = 1, // multiplier on branch ring/segment counts (LOD)
    flowerPalette = null, // { stamen, throat, mid, tip } hex colours
    leafPalette = null, // { shadow, mid, sunlit, tip } hex colours
    flowerScale = 1.6, // blossom size multiplier: area x2.56 for zero triangles
  } = options;

  const seg = (n) => Math.max(3, Math.round(n * barkDetail));

  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const randRange = (min, max) => min + rand() * (max - min);

  const group = new THREE.Group();
  group.name = "animeFlowerTree";

  const branchGeometries = [];
  const foliageClusters = [];

  function createTaperedBranch(points, rStart, rEnd, radialSegs, tubularSegs) {
    const curve = new THREE.CatmullRomCurve3(points);
    const frames = curve.computeFrenetFrames(tubularSegs, false);
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= tubularSegs; i++) {
      const t = i / tubularSegs;
      const pt = curve.getPointAt(t);
      const N = frames.normals[i];
      const B = frames.binormals[i];

      let rootFlare = 0.0;
      if (rStart > 0.45 && t < 0.22) {
        rootFlare = Math.pow(1.0 - t / 0.22, 2.0) * 0.28;
      }
      const baseR = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.85));

      for (let j = 0; j <= radialSegs; j++) {
        const u = j / radialSegs;
        const theta = u * Math.PI * 2;
        const sin = Math.sin(theta);
        const cos = Math.cos(theta);

        const ridge = Math.sin(theta * 5.0 + t * 4.0) * 0.06 * baseR;
        const rootLobe = rootFlare * (0.55 + 0.45 * Math.cos(theta * 4.0));
        const r = baseR + ridge + rootLobe;

        positions.push(
          pt.x + r * (cos * N.x + sin * B.x),
          pt.y + r * (cos * N.y + sin * B.y),
          pt.z + r * (cos * N.z + sin * B.z)
        );

        const nx = cos * N.x + sin * B.x;
        const ny = cos * N.y + sin * B.y;
        const nz = cos * N.z + sin * B.z;
        const nLen = Math.hypot(nx, ny, nz) || 1;
        normals.push(nx / nLen, ny / nLen, nz / nLen);
        uvs.push(u, t);
      }
    }

    for (let i = 0; i < tubularSegs; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * (radialSegs + 1) + j;
        const b = (i + 1) * (radialSegs + 1) + j;
        const c = (i + 1) * (radialSegs + 1) + (j + 1);
        const d = i * (radialSegs + 1) + (j + 1);
        indices.push(a, b, d, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return { geometry: geo, curve };
  }

  // Main trunk: graceful S-curve.
  const trunkPts = [
    new THREE.Vector3(-0.35, -0.1, 0.0),
    new THREE.Vector3(-0.12, 1.15, 0.08),
    new THREE.Vector3(0.32, 2.35, -0.05),
    new THREE.Vector3(0.18, 3.45, 0.0),
  ];
  const trunkObj = createTaperedBranch(trunkPts, 0.56, 0.36, seg(18), seg(22));
  branchGeometries.push(trunkObj.geometry);

  function growBranch(startPos, dir, length, rStart, rEnd, depth) {
    const mid1 = startPos.clone().addScaledVector(dir, length * 0.35);
    mid1.y += length * 0.06;
    mid1.x += randRange(-0.18, 0.18) * length;
    mid1.z += randRange(-0.18, 0.18) * length;

    const mid2 = startPos.clone().addScaledVector(dir, length * 0.72);
    mid2.y += length * 0.1;
    mid2.x += randRange(-0.22, 0.22) * length;
    mid2.z += randRange(-0.22, 0.22) * length;

    const endPos = startPos.clone().addScaledVector(dir, length);
    endPos.y += length * 0.12;

    const pts = [startPos, mid1, mid2, endPos];
    const radialSegs = seg(depth === 1 ? 12 : depth === 2 ? 9 : 6);
    const tubularSegs = seg(depth === 1 ? 14 : 10);

    const { geometry, curve } = createTaperedBranch(pts, rStart, rEnd, radialSegs, tubularSegs);
    branchGeometries.push(geometry);

    if (depth >= 3) {
      foliageClusters.push({
        center: curve.getPointAt(0.65),
        radius: randRange(0.75, 1.05),
        dir: dir.clone().normalize(),
      });
      foliageClusters.push({
        center: endPos.clone(),
        radius: randRange(0.95, 1.35),
        dir: dir.clone().normalize(),
      });
      return;
    }

    const numChildren = depth === 1 ? 3 : rand() > 0.35 ? 3 : 2;
    for (let i = 0; i < numChildren; i++) {
      const spawnT = i === 0 ? randRange(0.55, 0.72) : randRange(0.82, 0.98);
      const spawnPos = curve.getPointAt(spawnT);
      const spawnRadius = THREE.MathUtils.lerp(rStart, rEnd, spawnT) * 0.78;

      const angleStep = (i - (numChildren - 1) * 0.5) * 0.85 + randRange(-0.25, 0.25);
      const childDir = dir.clone();
      childDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleStep);
      childDir.y = THREE.MathUtils.clamp(childDir.y + randRange(-0.08, 0.24), 0.12, 0.85);
      childDir.x += randRange(-0.25, 0.25);
      childDir.z += randRange(-0.25, 0.25);
      childDir.normalize();

      const childLen = length * randRange(0.68, 0.84);
      growBranch(spawnPos, childDir, childLen, spawnRadius, spawnRadius * 0.52, depth + 1);
    }

    if (depth === 2) {
      foliageClusters.push({
        center: endPos.clone(),
        radius: randRange(0.85, 1.15),
        dir: dir.clone().normalize(),
      });
    }
  }

  const primaryBoughs = [
    { t: 0.78, dir: new THREE.Vector3(-0.82, 0.45, 0.15), len: 2.6, r: 0.26 },
    { t: 0.94, dir: new THREE.Vector3(-0.55, 0.72, -0.25), len: 2.8, r: 0.27 },
    { t: 1.0, dir: new THREE.Vector3(-0.12, 0.92, 0.18), len: 2.7, r: 0.25 },
    { t: 1.0, dir: new THREE.Vector3(0.28, 0.88, -0.22), len: 2.6, r: 0.24 },
    { t: 0.88, dir: new THREE.Vector3(0.76, 0.55, 0.22), len: 2.8, r: 0.27 },
    { t: 0.72, dir: new THREE.Vector3(0.88, 0.35, -0.25), len: 2.4, r: 0.22 },
    { t: 0.92, dir: new THREE.Vector3(0.05, 0.65, -0.75), len: 2.4, r: 0.22 },
    { t: 0.9, dir: new THREE.Vector3(-0.15, 0.62, 0.75), len: 2.2, r: 0.21 },
  ];

  for (const b of primaryBoughs) {
    const origin = trunkObj.curve.getPointAt(b.t);
    growBranch(origin, b.dir.normalize(), b.len, b.r, b.r * 0.58, 1);
  }

  /* ---------------- bark: one merged mesh, toon shader ---------------- */

  const mergedBarkGeo = mergeGeometries(branchGeometries);
  const barkMat = new THREE.ShaderMaterial({
    uniforms: { uSunDir: { value: SUN_DIR } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        float ndl = dot(vNormal, uSunDir) * 0.5 + 0.5;
        float toon = smoothstep(0.35, 0.68, ndl);
        float grain = sin(vUv.x * 42.0 + sin(vUv.y * 12.0) * 2.5) * 0.5 + 0.5;
        float streak = smoothstep(0.3, 0.7, grain) * 0.06;
        // Cool grey-brown, not tan-orange: the trunk was the most saturated
        // thing on the tree. #6e5f52 / #8a7a6a / #a2937f, display-referred.
        vec3 shadowBark = vec3(0.431, 0.373, 0.322);
        vec3 midBark = vec3(0.541, 0.478, 0.416);
        vec3 litBark = vec3(0.635, 0.576, 0.498);
        vec3 col = mix(shadowBark, midBark, smoothstep(0.15, 0.5, ndl));
        col = mix(col, litBark, toon);
        col -= streak;
        float bounce = smoothstep(3.5, 0.0, vWorldPos.y) * max(0.0, -vNormal.y + 0.4) * 0.08;
        col += vec3(0.35, 0.55, 0.25) * bounce;
        gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(2.2)), 1.0);
      }
    `,
  });
  const trunkMesh = new THREE.Mesh(mergedBarkGeo, barkMat);
  trunkMesh.name = "flowerTreeBark";
  group.add(trunkMesh);

  /* ---------------- leaves: instanced, cluster-normal shading ---------------- */

  const leafGeo = createSingle3DLeafGeometry();
  const leafClusterNormalAttr = new Float32Array(leafCount * 3);
  const leafColorVariationAttr = new Float32Array(leafCount);

  const leafMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR },
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector3(1, 0, 0.35).normalize() },
      uLeafShadow: { value: rawColor(0x5b8a63) },
      uLeafMid: { value: rawColor(0x6f9f66) },
      uLeafSunlit: { value: rawColor(0x86ab5e) },
      uLeafTip: { value: rawColor(0xa8c47c) },
      uCel: TREE_STYLE.uCel,
      uRim: TREE_STYLE.uRim,
      uInk: TREE_STYLE.uInk,
      uRimColor: TREE_STYLE.uRimColor,
      uInkColor: TREE_STYLE.uInkColor,
    },
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aClusterNormal;
      attribute float aColorVar;
      uniform float uTime;
      uniform vec3 uWindDir;
      varying vec3 vClusterNormal;
      varying vec3 vFaceNormal;
      varying vec3 vWorldPos;
      varying vec3 vTreeOrigin;
      varying vec2 vUv;
      varying float vColorVar;
      varying float vLocalY;
      void main() {
        vUv = uv;
        vColorVar = aColorVar;
        vTreeOrigin = modelMatrix[3].xyz;
        vec3 pos = position;
        vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vLocalY = worldOrigin.y;

        float windWave = sin(uTime * 2.2 + worldOrigin.x * 0.8 + worldOrigin.z * 0.8 + worldOrigin.y * 0.5);
        float detailFlutter = cos(uTime * 4.5 + worldOrigin.x * 2.3 + aColorVar * 10.0) * 0.35;
        float bend = (windWave + detailFlutter) * 0.08 * uv.y;
        // All foliage bends along one wind direction, with a little lift.
        pos.x += uWindDir.x * bend * 1.1;
        pos.z += uWindDir.z * bend * 1.1;
        pos.y += bend * 0.35;

        vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        vClusterNormal = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * aClusterNormal));
        vFaceNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uLeafShadow;
      uniform vec3 uLeafMid;
      uniform vec3 uLeafSunlit;
      uniform vec3 uLeafTip;
      uniform float uCel;
      uniform float uRim;
      uniform float uInk;
      uniform vec3 uRimColor;
      uniform vec3 uInkColor;
      varying vec3 vClusterNormal;
      varying vec3 vFaceNormal;
      varying vec3 vWorldPos;
      varying vec3 vTreeOrigin;
      varying vec2 vUv;
      varying float vColorVar;
      varying float vLocalY;
      void main() {
        vec3 blendedNormal = normalize(mix(vFaceNormal, vClusterNormal, 0.74));
        float ndl = dot(blendedNormal, uSunDir) * 0.5 + 0.5;
        float heightGrad = clamp((vLocalY - 2.2) / 6.0, 0.0, 1.0);

        float rampIn = ndl + heightGrad * 0.15 + (vColorVar - 0.5) * 0.12;
        // Smooth (the shipped look) vs three flat cel tones. The cel edges are
        // 0.1 wide, not a hard step -- a true step aliases into a staircase and
        // reads as a posterise filter rather than as drawn light.
        float smoothBand = smoothstep(0.28, 0.68, rampIn);
        float celBand = 0.5 * smoothstep(0.40, 0.50, rampIn) + 0.5 * smoothstep(0.62, 0.72, rampIn);
        float lightBand = mix(smoothBand, celBand, uCel);

        vec3 col = mix(uLeafShadow, uLeafMid, smoothstep(0.15, 0.48, ndl));
        col = mix(col, uLeafSunlit, lightBand);

        float tipBright = smoothstep(0.5, 1.0, vUv.y) * 0.10;
        float centerVein = (1.0 - smoothstep(0.0, 0.08, abs(vUv.x - 0.5))) * 0.06;
        col = mix(col, uLeafTip, tipBright + centerVein);

        // Contour ink. The direction used is the leaf's offset from the CROWN
        // CENTRE, not any per-leaf normal: cluster normals are randomised per
        // leaf, so inking on them sprayed black specks. The crown direction is
        // smooth across the whole canopy, so the ink lands as one contour ring
        // on the silhouette -- which is what an ink line actually is.
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 crownC = vTreeOrigin + vec3(0.0, 4.6, 0.0);
        vec3 canN = normalize(vWorldPos - crownC + vec3(0.0, 0.001, 0.0));
        float fres = 1.0 - clamp(abs(dot(canN, V)), 0.0, 1.0);
        col = mix(col, uInkColor, smoothstep(0.70, 0.97, fres) * uInk);

        // Rim: a warm fresnel band that only appears where the leaf is lit.
        float rim = smoothstep(0.50, 0.86, fres) * smoothstep(0.10, 0.55, ndl);
        col = mix(col, uRimColor, rim * uRim * 0.55);

        // Authored colours are display-referred; output linear so the single
        // ACES pass (renderer or composer) tone-maps them exactly once.
        gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(2.2)), 1.0);
      }
    `,
  });

  if (leafPalette) {
    if (leafPalette.shadow) leafMat.uniforms.uLeafShadow.value.set(leafPalette.shadow);
    if (leafPalette.mid) leafMat.uniforms.uLeafMid.value.set(leafPalette.mid);
    if (leafPalette.sunlit) leafMat.uniforms.uLeafSunlit.value.set(leafPalette.sunlit);
    if (leafPalette.tip) leafMat.uniforms.uLeafTip.value.set(leafPalette.tip);
  }

  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
  leaves.name = "flowerTreeLeaves";
  // The base geometry's bounding sphere is one leaf at the origin; culling the
  // whole instanced mesh against it hides the canopy. The tree is one object.
  leaves.frustumCulled = false;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < leafCount; i++) {
    const cluster = foliageClusters[i % foliageClusters.length];
    const u = rand();
    const v = rand();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = cluster.radius * Math.cbrt(rand()) * 0.95;

    const offset = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta) * 0.78,
      r * Math.cos(phi)
    );
    const pos = cluster.center.clone().add(offset);
    dummy.position.copy(pos);

    const outDir = offset.clone().normalize();
    if (outDir.lengthSq() < 0.001) outDir.set(0, 1, 0);
    dummy.lookAt(pos.clone().add(outDir));
    dummy.rotateZ(randRange(-0.6, 0.6));
    dummy.rotateX(randRange(-0.35, 0.45));
    dummy.scale.setScalar(randRange(0.75, 1.35) * leafScale);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);

    const crownDir = pos.clone().sub(new THREE.Vector3(0, 4.8, 0)).normalize();
    const smoothNormal = outDir.lerp(crownDir, 0.45).normalize();
    leafClusterNormalAttr[i * 3] = smoothNormal.x;
    leafClusterNormalAttr[i * 3 + 1] = smoothNormal.y;
    leafClusterNormalAttr[i * 3 + 2] = smoothNormal.z;
    leafColorVariationAttr[i] = rand();
  }
  leafGeo.setAttribute("aClusterNormal", new THREE.InstancedBufferAttribute(leafClusterNormalAttr, 3));
  leafGeo.setAttribute("aColorVar", new THREE.InstancedBufferAttribute(leafColorVariationAttr, 1));
  group.add(leaves);

  /* ---------------- flowers: instanced 5-petal blossoms ---------------- */

  const flowerGeo = createSingle5PetalFlowerGeometry();
  const flowerNormalAttr = new Float32Array(flowerCount * 3);
  const flowerPhaseAttr = new Float32Array(flowerCount);

  const flowerMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR },
      uTime: { value: 0 },
      uCel: TREE_STYLE.uCel,
      uRim: TREE_STYLE.uRim,
      uInk: TREE_STYLE.uInk,
      uRimColor: TREE_STYLE.uRimColor,
      uInkColor: TREE_STYLE.uInkColor,
    },
    side: THREE.DoubleSide,
    vertexColors: true,
    vertexShader: `
      attribute vec3 aClusterNormal;
      attribute float aPhase;
      uniform float uTime;
      varying vec3 vColor;
      varying vec3 vClusterNormal;
      varying vec3 vFaceNormal;
      varying vec3 vWorldPos;
      varying vec3 vTreeOrigin;
      varying vec2 vUv;
      void main() {
        vColor = color;
        vUv = uv;
        vTreeOrigin = modelMatrix[3].xyz;
        vec3 pos = position;
        vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 2.5 + worldOrigin.x * 0.9 + worldOrigin.z * 0.9 + aPhase * 6.28);
        pos.y += sway * 0.045 * uv.y;
        pos.x += cos(uTime * 2.0 + aPhase * 6.28) * 0.03 * uv.y;
        vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        vClusterNormal = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * aClusterNormal));
        vFaceNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      varying vec3 vColor;
      varying vec3 vClusterNormal;
      varying vec3 vFaceNormal;
      varying vec3 vWorldPos;
      varying vec3 vTreeOrigin;
      varying vec2 vUv;
      uniform float uCel;
      uniform float uRim;
      uniform float uInk;
      uniform vec3 uRimColor;
      uniform vec3 uInkColor;
      void main() {
        vec3 norm = normalize(mix(vFaceNormal, vClusterNormal, 0.65));
        float ndl = dot(norm, uSunDir) * 0.5 + 0.5;
        // Blossoms are the most "drawn" element in the reference: two flat
        // tones, not a gradient. uCel pushes them all the way there.
        float lightFactor = mix(
          smoothstep(0.18, 0.75, ndl),
          smoothstep(0.42, 0.54, ndl),
          uCel
        );
        vec3 shadowTint = vColor * vec3(0.74, 0.70, 0.88);
        vec3 sunlitTint = vColor * vec3(1.10, 1.06, 1.12);
        vec3 finalCol = mix(shadowTint, sunlitTint, lightFactor);
        float crease = (1.0 - smoothstep(0.0, 0.09, abs(vUv.x - 0.5))) * 0.07 * vUv.y;
        finalCol -= vec3(0.08, 0.12, 0.04) * crease;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 crownC = vTreeOrigin + vec3(0.0, 4.6, 0.0);
        vec3 canN = normalize(vWorldPos - crownC + vec3(0.0, 0.001, 0.0));
        float fres = 1.0 - clamp(abs(dot(canN, V)), 0.0, 1.0);
        finalCol = mix(finalCol, uInkColor, smoothstep(0.70, 0.97, fres) * uInk);
        float rim = smoothstep(0.52, 0.88, fres) * smoothstep(0.12, 0.58, ndl);
        finalCol = mix(finalCol, uRimColor, rim * uRim * 0.5);

        gl_FragColor = vec4(pow(clamp(finalCol, 0.0, 1.0), vec3(2.2)), 1.0);
      }
    `,
  });

  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
  flowers.name = "flowerTreeFlowers";
  flowers.frustumCulled = false;

  for (let i = 0; i < flowerCount; i++) {
    const cluster = foliageClusters[i % foliageClusters.length];
    const u = rand();
    const v = rand();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = cluster.radius * randRange(0.55, 1.08);

    const offset = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta) * 0.82 + 0.08,
      r * Math.cos(phi)
    );
    const pos = cluster.center.clone().add(offset);
    dummy.position.copy(pos);

    const outDir = offset.clone().normalize();
    outDir.y = Math.max(outDir.y, -0.2);
    outDir.normalize();

    dummy.lookAt(pos.clone().add(outDir));
    dummy.rotateX(Math.PI * 0.5 + randRange(-0.3, 0.3));
    dummy.rotateY(randRange(0, Math.PI * 2));
    dummy.scale.setScalar(randRange(0.85, 1.42) * leafScale * flowerScale);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);

    flowerNormalAttr[i * 3] = outDir.x;
    flowerNormalAttr[i * 3 + 1] = outDir.y;
    flowerNormalAttr[i * 3 + 2] = outDir.z;
    flowerPhaseAttr[i] = rand();
  }
  flowerGeo.setAttribute("aClusterNormal", new THREE.InstancedBufferAttribute(flowerNormalAttr, 3));
  flowerGeo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(flowerPhaseAttr, 1));
  group.add(flowers);

  /* ---------------- scale + API ---------------- */

  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const scale = natural ? 1 : height / Math.max(0.001, size.y);
  group.scale.setScalar(scale);

  function update(elapsed) {
    const t = Number.isFinite(elapsed) ? elapsed : 0;
    leafMat.uniforms.uTime.value = t;
    flowerMat.uniforms.uTime.value = t;
  }

  const leafTris = (leafGeo.index.count / 3) * leafCount;
  const flowerTris = (flowerGeo.index.count / 3) * flowerCount;
  const barkTris = mergedBarkGeo.index.count / 3;

  return {
    group,
    update,
    stats: {
      height: size.y * scale,
      scale,
      leaves: leafCount,
      flowers: flowerCount,
      triangles: Math.round(leafTris + flowerTris + barkTris),
      draws: 3,
    },
  };
}

export default createAnimeFlowerTree;
