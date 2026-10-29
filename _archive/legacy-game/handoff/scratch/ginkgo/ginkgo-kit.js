// Ginkgo biloba — ported from "Icho Namiki — Enchanted Golden Ginkgo Avenue"
// (icho_namiki_enchanted_golden_ginkgo_avenue_procedural_three_js (1).html).
//
// This is the RAW port: geometry, leaf palettes and materials are copied from
// the reference, with the avenue layout removed. The only changes are structural:
//
//   - the tree is built at the origin instead of at an avenue row position,
//   - the RNG is local and seeded instead of the page's global `rand()`,
//   - the avenue's camera-specific canopy carve and hero-leaf placement are gone,
//   - one function returns one tree, so a scene can place it where it likes.
//
// Nothing here touches the scene, lights, renderer or post. A caller adds
// `group` to its scene and may animate it later; the tree itself is static.
//
// Reference anatomy (kept verbatim):
//   - trunk: Catmull-Rom tube, exponential taper, root flare + fluted buttress
//   - boughs: 7 primary + 2 sub-branches each, all tapered tubes
//   - canopy: 16-leaf 3D "bouquets" in 4 golden grades + loose single fan leaves
//   - leaf: true bilobed ginkgo fan, 14 radial ribs, central V-notch, cupped 3D

import * as THREE from "three";

/* -------------------------------------------------------------------------- */
/* leaf palettes (verbatim)                                                   */
/* -------------------------------------------------------------------------- */

export const GINKGO_PALETTES = {
  sunlitLemon: {
    stem: "#d98a0b", base: "#ffc814", mid: "#ffe642", tip: "#fff99e", vein: "#f5b400",
    emissive: 0xd99b00, emissiveIntensity: 0.72,
  },
  imperialGold: {
    stem: "#c26d06", base: "#f5a302", mid: "#ffd018", tip: "#ffea56", vein: "#e08e00",
    emissive: 0xc97f00, emissiveIntensity: 0.62,
  },
  warmCadmium: {
    stem: "#ad5904", base: "#e88900", mid: "#f9b80c", tip: "#ffda38", vein: "#cc7400",
    emissive: 0xb56800, emissiveIntensity: 0.56,
  },
  deepAmber: {
    stem: "#8f4302", base: "#d16c00", mid: "#eb9a06", tip: "#ffc424", vein: "#b05600",
    emissive: 0x994d00, emissiveIntensity: 0.50,
  },
  heroTranslucent: {
    stem: "#e09612", base: "#ffd82e", mid: "#ffef6b", tip: "#fff9b3", vein: "#f5be18",
    emissive: 0xe6a800, emissiveIntensity: 0.80,
  },
};

/* -------------------------------------------------------------------------- */
/* 1. true 3D bilobed ginkgo fan leaf (verbatim)                              */
/* -------------------------------------------------------------------------- */

export function createGinkgoFanLeafGeometry(paletteConfig, scaleMultiplier = 1) {
  const s = scaleMultiplier || 1.0;
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  const stemColor = new THREE.Color(paletteConfig.stem);
  const baseColor = new THREE.Color(paletteConfig.base);
  const midColor = new THREE.Color(paletteConfig.mid);
  const tipColor = new THREE.Color(paletteConfig.tip);
  const veinColor = new THREE.Color(paletteConfig.vein);

  function pushVertex(x, y, z, nx, ny, nz, u, v, col) {
    positions.push(x * s, y * s, z * s);
    const len = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / len, ny / len, nz / len);
    uvs.push(u, v);
    colors.push(col.r, col.g, col.b);
    return positions.length / 3 - 1;
  }

  // Petiole (slender leaf stem): 4 vertices (2 triangles)
  const stemW = 0.024;
  const stemLen = 0.36;
  const vStemBL = pushVertex(-stemW * 0.7, -stemLen, 0.01, 0, 0.2, 1, 0.48, 0.0, stemColor);
  const vStemBR = pushVertex(stemW * 0.7, -stemLen, 0.01, 0, 0.2, 1, 0.52, 0.0, stemColor);
  const vStemTL = pushVertex(-stemW, 0.02, 0.0, 0, 0.2, 1, 0.47, 0.22, baseColor);
  const vStemTR = pushVertex(stemW, 0.02, 0.0, 0, 0.2, 1, 0.53, 0.22, baseColor);
  indices.push(vStemBL, vStemBR, vStemTR, vStemBL, vStemTR, vStemTL);

  // Fan blade: 2 concentric rings across a 136-degree fan arc with central bilobed V-notch
  const segs = 14;
  const fanHalfAngle = 1.18;
  const vOrigin = pushVertex(0, 0.0, 0.0, 0, 0.15, 1, 0.5, 0.22, baseColor);

  const innerRing = [];
  const outerRing = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const frac = (t - 0.5) * 2.0;
    const theta = frac * fanHalfAngle;

    const notchDip = Math.exp(-frac * frac * 28.0) * 0.36;
    const scallop = Math.sin(t * Math.PI * 12) * 0.028;
    const lobeEnvelope = 0.88 + 0.18 * Math.sin(Math.abs(frac) * Math.PI);

    const fullRadius = 0.64 * lobeEnvelope - notchDip + scallop;
    const midRadius = fullRadius * 0.54;

    const zMid = Math.cos(frac * Math.PI * 0.5) * 0.045;
    const zOuter = Math.cos(frac * Math.PI * 0.5) * 0.065 - fullRadius * 0.05;

    const xMid = Math.sin(theta) * midRadius;
    const yMid = Math.cos(theta) * midRadius * 0.92 + 0.02;

    const xOuter = Math.sin(theta) * fullRadius;
    const yOuter = Math.cos(theta) * fullRadius * 0.92 + 0.02;

    const cMid = i % 2 === 1 ? midColor.clone().lerp(veinColor, 0.22) : midColor;
    const cTip = i % 2 === 1 ? tipColor.clone().lerp(midColor, 0.25) : tipColor;

    const nx = Math.sin(theta) * 0.22;
    const ny = 0.25;
    const nz = 0.94;

    const uMid = 0.5 + Math.sin(theta) * 0.25;
    const uOut = 0.5 + Math.sin(theta) * 0.45;

    innerRing.push(pushVertex(xMid, yMid, zMid, nx, ny, nz, uMid, 0.55, cMid));
    outerRing.push(pushVertex(xOuter, yOuter, zOuter, nx, ny * 0.8, nz, uOut, 0.95, cTip));
  }

  for (let i = 0; i < segs; i++) {
    indices.push(vOrigin, innerRing[i], innerRing[i + 1]);
    indices.push(innerRing[i], outerRing[i], outerRing[i + 1]);
    indices.push(innerRing[i], outerRing[i + 1], innerRing[i + 1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/* -------------------------------------------------------------------------- */
/* 2. 16-leaf bouquet (verbatim)                                              */
/* -------------------------------------------------------------------------- */

export function createGinkgoBouquetGeometry(palettes, leafCount, clusterRadius, leafScale) {
  const mergedPositions = [];
  const mergedNormals = [];
  const mergedUvs = [];
  const mergedColors = [];
  const mergedIndices = [];

  const tempMat = new THREE.Matrix4();
  const tempPos = new THREE.Vector3();
  const tempNorm = new THREE.Vector3();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scaleVec = new THREE.Vector3();
  const origin = new THREE.Vector3();

  for (let k = 0; k < leafCount; k++) {
    const pal = palettes[k % palettes.length];
    const singleGeo = createGinkgoFanLeafGeometry(pal, leafScale);

    // Golden-angle spherical distribution so leaves form a lush, full 360-degree bouquet
    const phi = Math.acos(1 - 2 * ((k + 0.5) / leafCount));
    const theta = Math.PI * (1 + Math.sqrt(5)) * k;

    const r = clusterRadius * (0.45 + (0.55 * ((k * 7) % 11)) / 10);
    const ox = Math.sin(phi) * Math.cos(theta) * r;
    const oy = Math.cos(phi) * r * 0.78;
    const oz = Math.sin(phi) * Math.sin(theta) * r;

    euler.set(
      (phi - Math.PI * 0.5) * 0.85 + ((k % 3) - 1) * 0.35,
      theta + ((k % 5) - 2) * 0.25,
      ((k % 7) - 3) * 0.42
    );
    quat.setFromEuler(euler);
    const sc = 0.82 + (k % 5) * 0.11;
    scaleVec.set(sc, sc, sc);
    origin.set(ox, oy, oz);
    tempMat.compose(origin, quat, scaleVec);

    const posAttr = singleGeo.getAttribute("position");
    const normAttr = singleGeo.getAttribute("normal");
    const uvAttr = singleGeo.getAttribute("uv");
    const colAttr = singleGeo.getAttribute("color");
    const idxAttr = singleGeo.getIndex();
    const vertexOffset = mergedPositions.length / 3;

    for (let v = 0; v < posAttr.count; v++) {
      tempPos.set(posAttr.getX(v), posAttr.getY(v), posAttr.getZ(v)).applyMatrix4(tempMat);
      mergedPositions.push(tempPos.x, tempPos.y, tempPos.z);

      tempNorm.set(normAttr.getX(v), normAttr.getY(v), normAttr.getZ(v)).transformDirection(tempMat);
      mergedNormals.push(tempNorm.x, tempNorm.y, tempNorm.z);

      mergedUvs.push(uvAttr.getX(v), uvAttr.getY(v));
      mergedColors.push(colAttr.getX(v), colAttr.getY(v), colAttr.getZ(v));
    }

    for (let j = 0; j < idxAttr.count; j++) {
      mergedIndices.push(idxAttr.getX(j) + vertexOffset);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(mergedPositions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(mergedNormals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(mergedUvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(mergedColors, 3));
  geo.setIndex(mergedIndices);
  geo.computeBoundingSphere();
  return geo;
}

/* -------------------------------------------------------------------------- */
/* 3. curved branch / trunk tube (verbatim)                                   */
/* -------------------------------------------------------------------------- */

export function createCurvedBranchGeometry(points, radiusBottom, radiusTop, radialSegs, tubularSegs, isRooted) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegs, false);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const pt = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    // Smooth exponential taper + root flare buttress at base
    let r = radiusBottom * Math.pow(radiusTop / Math.max(0.01, radiusBottom), t);
    if (isRooted && t < 0.18) {
      const rootFactor = 1.0 - t / 0.18;
      r *= 1.0 + 0.42 * rootFactor * rootFactor;
    }

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Organic fluted root ridges at the base of the trunk
      let flute = 1.0;
      if (isRooted && t < 0.25) {
        flute += 0.16 * (1.0 - t / 0.25) * Math.sin(theta * 5.0);
      }

      normal.x = cosT * N.x + sinT * B.x;
      normal.y = cosT * N.y + sinT * B.y;
      normal.z = cosT * N.z + sinT * B.z;
      normal.normalize();

      vertex.x = pt.x + r * flute * normal.x;
      vertex.y = pt.y + r * flute * normal.y;
      vertex.z = pt.z + r * flute * normal.z;

      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(u, t);
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/* -------------------------------------------------------------------------- */
/* 4. bark texture + leaf material (verbatim)                                 */
/* -------------------------------------------------------------------------- */

export function createGinkgoBarkTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");

  // Deep espresso-charcoal ginkgo bark with warm bronze-brown ridges and dappled golden sun flecks
  ctx.fillStyle = "#2b1d16";
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 650; i++) {
    const x = (i * 37) % 512;
    const y = (i * 73) % 512;
    const w = 3 + (i % 6);
    const h = 28 + (i % 45);
    ctx.fillStyle = i % 3 === 0 ? "#1b110c" : i % 3 === 1 ? "#3c291f" : "#4f3526";
    ctx.fillRect(x, y, w, h);
  }

  // Warm golden sun-dappled bark highlights (matching the golden flecks on trunks in reference)
  for (let i = 0; i < 95; i++) {
    const cx = (i * 83) % 512;
    const cy = (i * 127) % 512;
    const r = 6 + (i % 14);
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
    g.addColorStop(0, "rgba(235, 162, 48, 0.28)");
    g.addColorStop(1, "rgba(235, 162, 48, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 5);
  tex.needsUpdate = true;
  return tex;
}

export function createGinkgoLeafMaterial(pal) {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(pal.emissive),
    emissiveIntensity: pal.emissiveIntensity,
  });
}

/* -------------------------------------------------------------------------- */
/* 5. one tree                                                                */
/* -------------------------------------------------------------------------- */

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build one ginkgo tree at the origin, standing on y = 0.
 *
 * options:
 *   seed          deterministic placement seed
 *   trunkHeight   metres (reference avenue trees: 8.6)
 *   baseRadius    trunk radius at the buttress (reference: 0.58)
 *   leafDensity   multiplier on canopy cluster counts (1 = reference density)
 *   lean          0..1 how much the trunk leans toward +x (reference avenue: 1)
 *
 * returns { group, update, stats }
 */
export function createGinkgoTree(options = {}) {
  const {
    seed = 133742,
    trunkHeight = 8.6,
    baseRadius = 0.58,
    leafDensity = 1,
    lean = 1,
    barkTexture = null,
  } = options;

  const rand = mulberry32(seed);
  const randRange = (min, max) => min + rand() * (max - min);

  const group = new THREE.Group();
  group.name = "ginkgoTree";

  const barkMat = new THREE.MeshLambertMaterial({
    map: barkTexture ?? createGinkgoBarkTexture(),
    color: new THREE.Color(0x523929),
    emissive: new THREE.Color(0x1f130c),
    emissiveIntensity: 0.35,
  });

  const bouquetPlacements = [[], [], [], []]; // 4 golden colour grades
  const singleCanopyPlacements = [[], [], []]; // 3 golden colour grades

  function addCanopyClusterAt(wx, wy, wz, radius, densityMult, isInnerSunlit) {
    const count = Math.round((4 + rand() * 4) * densityMult * leafDensity);
    for (let i = 0; i < count; i++) {
      const ang = rand() * Math.PI * 2;
      const elev = randRange(-0.35, 0.92);
      const r = radius * Math.pow(rand(), 0.68);
      const px = wx + Math.cos(ang) * r;
      const py = Math.max(3.85, wy + elev * r * 0.72);
      const pz = wz + Math.sin(ang) * r;

      // Balanced 4-grade golden colour distribution
      let grade = 1;
      const roll = rand();
      if (isInnerSunlit && Math.abs(px) < 4.8) {
        grade = roll < 0.54 ? 0 : roll < 0.88 ? 1 : 2;
      } else if (py < 5.8 || Math.abs(px) > 7.8) {
        grade = roll < 0.42 ? 3 : roll < 0.8 ? 2 : 1;
      } else {
        grade = roll < 0.34 ? 0 : roll < 0.7 ? 1 : roll < 0.9 ? 2 : 3;
      }

      bouquetPlacements[grade].push({
        x: px, y: py, z: pz,
        rx: rand() * Math.PI * 2,
        ry: rand() * Math.PI * 2,
        rz: rand() * Math.PI * 2,
        s: randRange(0.76, 1.3),
      });

      // Scatter crisp individual 3D fan leaves around the bouquet perimeter & hanging slightly below
      for (let j = 0; j < 4; j++) {
        const lGrade = grade === 0 ? 0 : grade === 1 ? 1 : 2;
        singleCanopyPlacements[lGrade].push({
          x: px + randRange(-1.05, 1.05),
          y: Math.max(2.3, py + randRange(-1.05, 0.75)),
          z: pz + randRange(-1.05, 1.05),
          rx: randRange(-1.3, 1.3),
          ry: rand() * Math.PI * 2,
          rz: randRange(-1.1, 1.1),
          s: randRange(0.75, 1.45),
        });
      }
    }
  }

  const inwardDir = lean;
  const treeX = 0;
  const treeZ = 0;

  // 1) Main gnarled trunk rising with organic posture and dividing into the crown
  const trunkPts = [
    new THREE.Vector3(treeX, -0.1, treeZ),
    new THREE.Vector3(treeX + inwardDir * 0.04, trunkHeight * 0.3, treeZ + 0.03),
    new THREE.Vector3(treeX + inwardDir * 0.16, trunkHeight * 0.64, treeZ - 0.02),
    new THREE.Vector3(treeX + inwardDir * 0.62, trunkHeight, treeZ + 0.02),
  ];
  const trunkGeo = createCurvedBranchGeometry(trunkPts, baseRadius, baseRadius * 0.3, 12, 14, true);
  const trunkMesh = new THREE.Mesh(trunkGeo, barkMat);
  trunkMesh.name = "ginkgoTrunk";
  group.add(trunkMesh);

  // Upper crown foliage pillow behind/above the main trunk fork
  addCanopyClusterAt(treeX + inwardDir * 0.45, trunkHeight + 1.0, treeZ - 0.35, 2.1, 1.2, false);
  // Outer-upper crown mass
  addCanopyClusterAt(treeX + inwardDir * 1.9, trunkHeight * 0.8 + 1.2, treeZ, 2.3, 1.25, false);
  addCanopyClusterAt(treeX + inwardDir * 3.1, trunkHeight * 0.72 + 1.1, treeZ + 0.4, 2.0, 1.1, false);

  // 2) Sweeping primary & secondary boughs
  const numPrimaryBoughs = 7;
  for (let b = 0; b < numPrimaryBoughs; b++) {
    const attachT = 0.35 + (b / (numPrimaryBoughs - 1)) * 0.55;
    const startY = trunkHeight * attachT;
    const startX = treeX + inwardDir * (attachT * 0.32);
    const startZ = treeZ;

    const isInnerArch = b % 3 !== 2;
    const reachInward = isInnerArch ? inwardDir * randRange(2.5, 5.0) : inwardDir * randRange(1.4, 3.4);
    const reachUp = randRange(2.2, 4.3);
    const reachZ = randRange(-2.4, 2.4);

    const midPt = new THREE.Vector3(
      startX + reachInward * 0.52,
      startY + reachUp * 0.58,
      startZ + reachZ * 0.48
    );
    const endPt = new THREE.Vector3(startX + reachInward, startY + reachUp, startZ + reachZ);

    const boughPts = [new THREE.Vector3(startX, startY, startZ), midPt, endPt];
    const boughRad = baseRadius * (0.33 - attachT * 0.11);
    const boughGeo = createCurvedBranchGeometry(boughPts, boughRad, boughRad * 0.22, 7, 10, false);
    group.add(new THREE.Mesh(boughGeo, barkMat));

    // Dense golden bouquet cloud slightly above and behind the bough
    addCanopyClusterAt(midPt.x - inwardDir * 0.2, midPt.y + 0.85, midPt.z - 0.35, 1.65, 1.0, isInnerArch);
    addCanopyClusterAt(endPt.x, endPt.y + 0.6, endPt.z - 0.25, 1.95, 1.25, isInnerArch);

    // Individual fan leaves along the bough for dappled overlap
    for (let sp = 0; sp < 10; sp++) {
      const frac = 0.18 + 0.82 * (sp / 9);
      singleCanopyPlacements[sp % 2].push({
        x: startX + (endPt.x - startX) * frac + randRange(-0.45, 0.45),
        y: startY + (endPt.y - startY) * frac + randRange(-0.35, 0.55),
        z: startZ + (endPt.z - startZ) * frac + randRange(-0.45, 0.45),
        rx: randRange(-1.0, 1.0),
        ry: rand() * Math.PI * 2,
        rz: randRange(-1.0, 1.0),
        s: randRange(0.85, 1.45),
      });
    }

    // Secondary sub-branches forking visibly from the primary bough
    for (let sb = 0; sb < 2; sb++) {
      const subStart = midPt.clone().lerp(endPt, 0.32 + sb * 0.38);
      const subEnd = new THREE.Vector3(
        subStart.x + inwardDir * randRange(0.85, 2.1) * (isInnerArch ? 1 : -0.6),
        subStart.y + randRange(0.85, 1.95),
        subStart.z + randRange(-1.6, 1.6)
      );
      const subMid = subStart.clone().lerp(subEnd, 0.5).add(new THREE.Vector3(0, 0.28, 0));
      const subGeo = createCurvedBranchGeometry(
        [subStart, subMid, subEnd],
        boughRad * 0.46,
        boughRad * 0.15,
        5,
        7,
        false
      );
      group.add(new THREE.Mesh(subGeo, barkMat));
      addCanopyClusterAt(subEnd.x, subEnd.y + 0.55, subEnd.z - 0.2, 1.55, 0.9, isInnerArch);
    }
  }

  // 3) Delicate lower epicormic fan-leaf sprays along the trunk (y = 2.1 .. 4.3 m)
  for (let sp = 0; sp < 14; sp++) {
    const sy = 2.1 + (sp / 13) * 2.2 + randRange(-0.15, 0.15);
    const sx = treeX + inwardDir * randRange(0.35, 1.45);
    const sz = treeZ + randRange(-0.9, 0.9);
    singleCanopyPlacements[sp % 2].push({
      x: sx, y: sy, z: sz,
      rx: randRange(-0.9, 0.9),
      ry: rand() * Math.PI * 2,
      rz: randRange(-0.9, 0.9),
      s: randRange(0.9, 1.42),
    });
  }

  // 4) Overarching golden vault crown
  addCanopyClusterAt(
    inwardDir * randRange(1.75, 4.2),
    randRange(8.5, 12.2),
    treeZ + randRange(-2.0, 2.0),
    2.15,
    1.25,
    true
  );

  /* ---------------- instanced canopy ---------------- */

  const dummy = new THREE.Object3D();

  const bouquetPalettesList = [
    [GINKGO_PALETTES.sunlitLemon, GINKGO_PALETTES.heroTranslucent],
    [GINKGO_PALETTES.imperialGold, GINKGO_PALETTES.sunlitLemon],
    [GINKGO_PALETTES.warmCadmium, GINKGO_PALETTES.imperialGold],
    [GINKGO_PALETTES.deepAmber, GINKGO_PALETTES.warmCadmium],
  ];

  let leaves = 0;
  let triangles = 0;

  for (let g = 0; g < 4; g++) {
    const placements = bouquetPlacements[g];
    if (!placements.length) continue;
    const bGeo = createGinkgoBouquetGeometry(bouquetPalettesList[g], 16, 0.82, 0.48);
    const bMat = createGinkgoLeafMaterial(bouquetPalettesList[g][0]);
    const imesh = new THREE.InstancedMesh(bGeo, bMat, placements.length);
    imesh.name = `ginkgoBouquet${g}`;
    imesh.frustumCulled = false;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      imesh.setMatrixAt(i, dummy.matrix);
    }
    imesh.instanceMatrix.needsUpdate = true;
    group.add(imesh);
    leaves += placements.length * 16;
    triangles += (bGeo.index.count / 3) * placements.length;
  }

  const singlePalettes = [
    GINKGO_PALETTES.sunlitLemon,
    GINKGO_PALETTES.imperialGold,
    GINKGO_PALETTES.warmCadmium,
  ];

  for (let g = 0; g < 3; g++) {
    const placements = singleCanopyPlacements[g];
    if (!placements.length) continue;
    const lGeo = createGinkgoFanLeafGeometry(singlePalettes[g], 0.46);
    const lMat = createGinkgoLeafMaterial(singlePalettes[g]);
    const imesh = new THREE.InstancedMesh(lGeo, lMat, placements.length);
    imesh.name = `ginkgoLeaf${g}`;
    imesh.frustumCulled = false;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      imesh.setMatrixAt(i, dummy.matrix);
    }
    imesh.instanceMatrix.needsUpdate = true;
    group.add(imesh);
    leaves += placements.length;
    triangles += (lGeo.index.count / 3) * placements.length;
  }

  // Bark meshes are individual draw calls in the reference (one per trunk, bough
  // and sub-branch); count them for an honest HUD line.
  let meshDraws = 0;
  let barkTriangles = 0;
  group.traverse((o) => {
    if (o.isMesh) {
      meshDraws += 1;
      const idx = o.geometry?.index;
      if (idx) barkTriangles += idx.count / 3;
    }
  });

  function update() {
    // The reference tree is static; motion lives in its separate falling-leaf layer.
  }

  return {
    group,
    update,
    stats: {
      leaves,
      triangles: Math.round(triangles + barkTriangles),
      draws: meshDraws,
      trunkHeight,
    },
  };
}

export default createGinkgoTree;
