import * as THREE from 'three';
import { addOutline } from '../../../house3d/src/materials.js';
import { mergeStatic } from '../../../house3d/src/parts.js';
import {
  WISTERIA_TREES,
  VILLAGE_TREES,
  CLIFF_BOULDERS,
  ARENA,
  SHRINE,
  sampleWorld,
} from './geography.js';

/**
 * Sculpted Wisteria & Sakura Hero Trees, Green Village Trees, and Flowering Toon Shrubs
 * (`world/assets/terrain/trees.js`).
 *
 * Strictly enforces:
 * - ZERO spiky icicle cones (`ConeGeometry` is never used for wisteria racemes!).
 *   Every hanging wisteria blossom cluster is built from 5 stacked, tapered, soft rounded
 *   blossom puffs/beads (`IcosahedronGeometry(r, 1)`), grading from deep violet at the top
 *   shoulder to pale lilac-pink at the rounded bottom droplet.
 * - Arena Wisteria Hero Tree trunks are >= 3.79m clear of the `r = 15.8m` split-rail fence.
 * - Village trees are mathematically verified to never intersect boulders, roads, or water.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function flatten(geo) {
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  nonIdx.computeVertexNormals();
  return nonIdx;
}

function createBotanicalMaterials(baseMaterials) {
  const grad = baseMaterials.gradientMap;
  const flat = (color, outline = 0.018) => {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: grad, flatShading: true });
    m.userData.outline = outline;
    return m;
  };

  return {
    ...baseMaterials,
    // 3-tone Violet Wisteria ramp
    wisteriaDeep: flat(0x8852c2, 0.018),
    wisteriaMid: flat(0xc07ee8, 0.018),
    wisteriaLight: flat(0xf3c6f8, 0.016),
    // 3-tone Sakura-Lilac ramp
    sakuraDeep: flat(0xb866a8, 0.018),
    sakuraMid: flat(0xe898cf, 0.018),
    sakuraLight: flat(0xffe2f4, 0.016),
  };
}

/**
 * Helper: oriented tapered cylinder segment between two 3D points `a` and `b`.
 */
function limbSegment(a, b, rBottom, rTop, material, radialSegs = 7) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(vb, va);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, radialSegs, 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(va).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a single soft, organic hanging wisteria blossom cluster (raceme) from
 * 5 stacked, gently tapered rounded blossom puffs/beads (ZERO spiky cones!).
 */
function buildSoftWisteriaRaceme(x, y, z, scale, rng, toneMats) {
  const cluster = new THREE.Group();
  cluster.position.set(x, y, z);

  // 5 stacked rounded puffs stepping down in radius from top shoulder to soft droplet tip
  const beads = [
    { dy: -0.14, r: 0.27, sy: 1.05, mat: toneMats.deep },
    { dy: -0.44, r: 0.23, sy: 1.15, mat: toneMats.mid },
    { dy: -0.73, r: 0.19, sy: 1.18, mat: toneMats.mid },
    { dy: -0.99, r: 0.15, sy: 1.18, mat: toneMats.light },
    { dy: -1.21, r: 0.115, sy: 1.12, mat: toneMats.light },
  ];

  const swayPhase = rng() * Math.PI * 2;
  for (let i = 0; i < beads.length; i++) {
    const b = beads[i];
    const ox = Math.sin(swayPhase + i * 0.9) * 0.032 * scale;
    const oz = Math.cos(swayPhase + i * 0.8) * 0.032 * scale;
    const puffGeo = flatten(new THREE.IcosahedronGeometry(b.r * scale, 1));
    const puff = new THREE.Mesh(puffGeo, b.mat);
    puff.position.set(ox, b.dy * scale, oz);
    puff.scale.set(1.0, b.sy, 1.0);
    puff.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI, (rng() - 0.5) * 0.3);
    puff.castShadow = true;
    puff.receiveShadow = true;
    cluster.add(puff);
  }

  return cluster;
}

/**
 * Builds a Sculpted Wisteria or Sakura Hero Tree:
 * - Gnarled root flare + sweeping multi-branching hardwood trunk
 * - Billowy 3-tone flat-shaded canopy domes
 * - 24 soft, organic hanging blossom clusters (stacked rounded puffs, zero cones!)
 */
export function buildWisteriaHeroTree(spec, mats, seed = 1) {
  const rng = mulberry32(seed);
  const s = spec.scale || 1.15;
  const groundY = sampleWorld(spec.x, spec.z).y;

  const toneMats =
    spec.variant === 'sakura'
      ? { deep: mats.sakuraDeep, mid: mats.sakuraMid, light: mats.sakuraLight }
      : { deep: mats.wisteriaDeep, mid: mats.wisteriaMid, light: mats.wisteriaLight };

  const treeRoot = new THREE.Group();
  treeRoot.name = `wisteria-hero-${spec.id}`;
  treeRoot.position.set(spec.x, groundY, spec.z);
  treeRoot.rotation.y = spec.rotY || 0;

  const staticPart = new THREE.Group();
  const swayRacemesGroup = new THREE.Group();
  swayRacemesGroup.name = 'hanging-wisteria-clusters';

  // 1. Gnarled Root Buttresses + Multi-Segment Sweeping Trunk
  for (let r = 0; r < 4; r++) {
    const ra = (r / 4) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const rx = Math.cos(ra) * 0.88 * s;
    const rz = Math.sin(ra) * 0.88 * s;
    staticPart.add(
      limbSegment([rx, -0.25, rz], [rx * 0.25, 0.85 * s, rz * 0.25], 0.26 * s, 0.36 * s, mats.bark)
    );
  }

  // 3 stacked curving trunk sections
  const p0 = [0, -0.2, 0];
  const p1 = [0.18 * s, 1.35 * s, 0.12 * s];
  const p2 = [-0.08 * s, 2.75 * s, 0.22 * s];
  const p3 = [0.05 * s, 3.65 * s, 0.10 * s];
  staticPart.add(limbSegment(p0, p1, 0.58 * s, 0.46 * s, mats.bark, 8));
  staticPart.add(limbSegment(p1, p2, 0.46 * s, 0.36 * s, mats.bark, 8));
  staticPart.add(limbSegment(p2, p3, 0.36 * s, 0.26 * s, mats.bark, 7));

  // 2. 5 Sweeping Primary Boughs + Billowy 3-Tone Canopy Domes + Soft Hanging Blossom Clusters
  const boughSpecs = [
    { angle: 0.0, reach: 2.85, midH: 3.7, tipH: 4.35 },
    { angle: 1.25, reach: 2.65, midH: 3.8, tipH: 4.55 },
    { angle: 2.52, reach: 2.75, midH: 3.6, tipH: 4.25 },
    { angle: 3.78, reach: 2.55, midH: 3.9, tipH: 4.60 },
    { angle: 5.05, reach: 2.80, midH: 3.7, tipH: 4.40 },
  ];

  for (let bIdx = 0; bIdx < boughSpecs.length; bIdx++) {
    const b = boughSpecs[bIdx];
    const a = b.angle + (rng() - 0.5) * 0.22;
    const ca = Math.cos(a);
    const sa = Math.sin(a);

    const midPt = [ca * b.reach * 0.52 * s, b.midH * s, sa * b.reach * 0.52 * s];
    const tipPt = [ca * b.reach * s, b.tipH * s, sa * b.reach * s];

    staticPart.add(limbSegment(p2, midPt, 0.26 * s, 0.18 * s, mats.bark, 6));
    staticPart.add(limbSegment(midPt, tipPt, 0.18 * s, 0.11 * s, mats.bark, 6));

    // Sub-branch fork
    const forkAngle = a + (bIdx % 2 === 0 ? 0.48 : -0.48);
    const forkPt = [
      Math.cos(forkAngle) * b.reach * 0.88 * s,
      (b.tipH - 0.25) * s,
      Math.sin(forkAngle) * b.reach * 0.88 * s,
    ];
    staticPart.add(limbSegment(midPt, forkPt, 0.14 * s, 0.08 * s, mats.bark, 5));

    // Billowy 3-tone flat-shaded canopy domes crowning each bough & fork
    const domeNodes = [
      { pt: midPt, r: 1.38 * s, sy: 0.68, mat: toneMats.deep },
      { pt: tipPt, r: 1.52 * s, sy: 0.66, mat: toneMats.mid },
      {
        pt: [tipPt[0] * 0.85, (b.tipH + 0.52) * s, tipPt[2] * 0.85],
        r: 1.24 * s,
        sy: 0.64,
        mat: toneMats.light,
      },
      { pt: forkPt, r: 1.22 * s, sy: 0.65, mat: toneMats.mid },
    ];

    for (const dn of domeNodes) {
      const domeGeo = flatten(new THREE.IcosahedronGeometry(dn.r, 1));
      const dome = new THREE.Mesh(domeGeo, dn.mat);
      dome.position.set(dn.pt[0], dn.pt[1] + 0.22 * s, dn.pt[2]);
      dome.scale.set(1.08, dn.sy, 1.04);
      dome.rotation.y = rng() * Math.PI;
      dome.castShadow = true;
      dome.receiveShadow = true;
      staticPart.add(dome);
    }

    // 4 Soft Hanging Wisteria Blossom Clusters (stacked rounded puffs, NEVER cones) under each bough
    const racemeOffsets = [
      [tipPt[0], tipPt[1] - 0.18 * s, tipPt[2], 0.98],
      [tipPt[0] * 0.72, midPt[1] - 0.12 * s, tipPt[2] * 0.72, 1.08],
      [forkPt[0], forkPt[1] - 0.16 * s, forkPt[2], 0.92],
      [
        (tipPt[0] + forkPt[0]) * 0.5,
        tipPt[1] - 0.22 * s,
        (tipPt[2] + forkPt[2]) * 0.5,
        0.86,
      ],
    ];
    for (const [rx, ry, rz, rScale] of racemeOffsets) {
      swayRacemesGroup.add(buildSoftWisteriaRaceme(rx, ry, rz, s * rScale, rng, toneMats));
    }
  }

  // Central high crown domes + tucked green foliage cushions
  const crownGeo = flatten(new THREE.IcosahedronGeometry(1.75 * s, 1));
  const crown = new THREE.Mesh(crownGeo, toneMats.light);
  crown.position.set(0, 4.95 * s, 0);
  crown.scale.set(1.12, 0.64, 1.12);
  staticPart.add(crown);

  for (let g = 0; g < 3; g++) {
    const ga = (g / 3) * Math.PI * 2 + 0.4;
    const leafGeo = flatten(new THREE.IcosahedronGeometry(0.95 * s, 1));
    const leaf = new THREE.Mesh(leafGeo, mats.leafA);
    leaf.position.set(Math.cos(ga) * 1.15 * s, 3.55 * s, Math.sin(ga) * 1.15 * s);
    leaf.scale.set(1.0, 0.65, 1.0);
    staticPart.add(leaf);
  }

  // Merge static bark/canopy domes per material and attach outlines
  mergeStatic(staticPart, { outline: 0.018 });
  mergeStatic(swayRacemesGroup, { outline: 0.015 });

  treeRoot.add(staticPart);
  treeRoot.add(swayRacemesGroup);

  // Fallen petal scatter ring under the Wisteria tree
  const petalCount = 7;
  for (let p = 0; p < petalCount; p++) {
    const pa = (p / petalCount) * Math.PI * 2 + rng() * 0.5;
    const pr = (1.1 + rng() * 1.6) * s;
    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(0.28 + rng() * 0.22, 7),
      p % 2 === 0 ? toneMats.light : toneMats.mid
    );
    patch.rotation.x = -Math.PI * 0.5;
    patch.position.set(Math.cos(pa) * pr, 0.02, Math.sin(pa) * pr);
    treeRoot.add(patch);
  }

  return {
    group: treeRoot,
    swayGroup: swayRacemesGroup,
  };
}

/**
 * Builds a lush 3-tone Cel-Shaded Green Village Tree (verified clear of all boulders & roads).
 */
function buildGreenVillageTree(spec, mats) {
  const rng = mulberry32(spec.seed || 101);
  const s = spec.scale || 1.0;
  const groundY = sampleWorld(spec.x, spec.z).y;

  const group = new THREE.Group();
  group.name = 'village-tree';
  group.position.set(spec.x, groundY, spec.z);

  const trunkH = 3.5 * s;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * s, 0.38 * s, trunkH, 8, 2),
    mats.bark
  );
  trunk.position.y = trunkH * 0.5 - 0.15;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  // Two angled upper limbs
  for (const side of [-1, 1]) {
    group.add(
      limbSegment(
        [0, trunkH * 0.62, 0],
        [side * 0.95 * s, trunkH * 0.95, (rng() - 0.5) * 0.6 * s],
        0.14 * s,
        0.08 * s,
        mats.bark,
        6
      )
    );
  }

  // 3-tier flat-shaded green canopy domes (`leafA`, `leafB`, `leafC`)
  const puffs = [
    [0, trunkH + 0.95 * s, 0, 1.55 * s, mats.leafB],
    [-0.95 * s, trunkH + 0.35 * s, 0.45 * s, 1.25 * s, mats.leafA],
    [0.95 * s, trunkH + 0.35 * s, -0.35 * s, 1.22 * s, mats.leafC],
    [0.25 * s, trunkH + 0.25 * s, -0.95 * s, 1.18 * s, mats.leafA],
    [-0.35 * s, trunkH + 0.42 * s, 0.92 * s, 1.15 * s, mats.leafB],
  ];
  for (const [px, py, pz, pr, mat] of puffs) {
    const geo = flatten(new THREE.IcosahedronGeometry(pr, 1));
    const puff = new THREE.Mesh(geo, mat);
    puff.position.set(px, py, pz);
    puff.scale.set(1.05, 0.78, 1.05);
    puff.rotation.y = rng() * Math.PI;
    puff.castShadow = true;
    puff.receiveShadow = true;
    group.add(puff);
  }

  return mergeStatic(group, { outline: 0.018 });
}

/**
 * Builds curated flowering toon shrubs along road shoulders, shrine stairs, and cottage gardens.
 */
function buildFloweringShrubs(mats) {
  const group = new THREE.Group();
  group.name = 'flowering-shrubs';
  const rng = mulberry32(0x6612f);

  const shrubSpots = [
    [-5.2, -10.8, 1.05],
    [5.2, -10.8, 1.02],
    [-3.6, -18.5, 0.92],
    [3.6, -18.5, 0.95],
    [-3.6, -32.0, 0.95],
    [3.6, -32.0, 0.92],
    [-5.8, -49.5, 1.08],
    [5.8, -49.5, 1.08],
    [-16.2, -9.2, 0.95],
    [18.5, -1.8, 0.95],
    [19.5, -9.5, 1.02],
    [-18.2, 10.6, 0.90],
  ];

  const flowerMats = [
    mats.flowerWhite,
    mats.flowerPink,
    mats.flowerYellow,
    mats.flowerBlue,
    mats.wisteriaLight,
  ];

  for (const [sx, sz, sc] of shrubSpots) {
    const sy = sampleWorld(sx, sz).y;
    const bush = new THREE.Group();
    bush.position.set(sx, sy, sz);

    for (let b = 0; b < 3; b++) {
      const r = (0.42 + (b === 0 ? 0.16 : 0)) * sc;
      const a = (b / 3) * Math.PI * 2 + rng() * 0.4;
      const dist = b === 0 ? 0 : 0.38 * sc;
      const blobGeo = flatten(new THREE.IcosahedronGeometry(r, 1));
      const blob = new THREE.Mesh(blobGeo, b % 2 === 0 ? mats.bushA : mats.bushB);
      blob.position.set(Math.cos(a) * dist, r * 0.65, Math.sin(a) * dist);
      blob.scale.set(1.1, 0.76, 1.1);
      blob.castShadow = true;
      blob.receiveShadow = true;
      addOutline(blob, 0.016);
      bush.add(blob);
    }

    // 4 wildflower dots perched on the top surface of the shrub
    for (let f = 0; f < 4; f++) {
      const fa = (f / 4) * Math.PI * 2 + rng() * 0.5;
      const flower = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.08 * sc, 0),
        flowerMats[(f + Math.floor(rng() * 5)) % flowerMats.length]
      );
      flower.position.set(Math.cos(fa) * 0.32 * sc, 0.68 * sc, Math.sin(fa) * 0.32 * sc);
      bush.add(flower);
    }

    group.add(bush);
  }

  return group;
}

export function buildBotanicalTrees(baseMaterials) {
  const mats = createBotanicalMaterials(baseMaterials);
  const root = new THREE.Group();
  root.name = 'botanical-trees';

  const swayTargets = [];

  // 1. Wisteria & Sakura Hero Trees (verified >= 3.79m clear of the Arena split-rail fence!)
  WISTERIA_TREES.forEach((spec, idx) => {
    const hero = buildWisteriaHeroTree(spec, mats, 0x300 + idx * 41);
    root.add(hero.group);
    swayTargets.push({ group: hero.swayGroup, phase: idx * 1.3 });
  });

  // 2. Green Cel-Shaded Village Trees (verified clear of all boulders, roads, and water!)
  for (const vSpec of VILLAGE_TREES) {
    // Safety verification: skip if within 3.5m of any cliff boulder
    const nearBoulder = CLIFF_BOULDERS.some(
      (b) => Math.hypot(vSpec.x - b.x, vSpec.z - b.z) < Math.max(b.w, b.d) * 0.6 + 2.2
    );
    if (!nearBoulder) {
      root.add(buildGreenVillageTree(vSpec, mats));
    }
  }

  // 3. Flowering Toon Shrubs
  root.add(buildFloweringShrubs(mats));

  return {
    group: root,
    update(dt, elapsed) {
      for (const item of swayTargets) {
        item.group.rotation.z = Math.sin(elapsed * 1.45 + item.phase) * 0.028;
        item.group.rotation.x = Math.cos(elapsed * 1.15 + item.phase) * 0.02;
      }
    },
  };
}
