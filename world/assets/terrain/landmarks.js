import * as THREE from 'three';
import { addOutline } from '../../../house3d/src/materials.js';
import {
  box,
  cyl,
  beamBetween,
  makeWall,
  gableWall,
  windowUnit,
  doorUnit,
  quoinCorner,
  mergeStatic,
  scaleUV,
  TILE,
} from '../../../house3d/src/parts.js';
import {
  WATER,
  WELL_PLAZA,
  SHRINE,
  ARENA,
  BUILDINGS,
  BUILDING_LIST,
  sampleWorld,
} from './geography.js';

/**
 * Landmarks & Architectural Structures (`world/assets/terrain/landmarks.js`):
 * 1. Axial Grand Northern Staircase (`x = 0.0, z = -10.5 -> -46.8, y = 0 -> +6.5m`, 46 steps)
 *    with continuous mitered sloped stone stringers/cheek-walls.
 * 2. Northern Shrine Overlook (`(0, -56, y = +6.5m)`): 13m circular stone platform,
 *    8-petal inlaid floral medallion, weathered cream-stone Romanesque Archway
 *    (`archHalf` / `quoin` masonry, stepped bases, capitals, keystone), and Co-Op Spell Pedestal.
 * 3. Grounded Stone Shoreline Abutment (`(-20.6, 8.0)`), Wooden Pier (`-20.8 -> -33.2`), & Rowboat.
 * 4. Well Plaza (`(0, 0)`) & Roofed Stone-and-Timber Village Well.
 * 5. Wisteria Combat Clearing Split-Rail Timber Fence (`(38, -6), r = 15.8m`).
 * 6. Watermill `-X` Rotating Waterwheel (`(-26.2, -14.2)`) & Tudor Village Context Buildings
 *    aligned mathematically with `(doorX, doorZ)`.
 */

function createLandmarkMaterials(baseMaterials) {
  const grad = baseMaterials.gradientMap;
  const toon = (opts) => new THREE.MeshToonMaterial({ gradientMap: grad, ...opts });
  return {
    ...baseMaterials,
    medallionSlate: toon({ color: 0x6788a4 }),
    medallionCeladon: toon({ color: 0xcfdad0 }),
    medallionGold: toon({ color: 0xe2ba5a }),
    medallionCream: toon({ color: 0xf6eedc }),
    medallionDark: toon({ color: 0x454038 }),
    crystalCyan: new THREE.MeshBasicMaterial({ color: 0x7ceeff, toneMapped: false }),
    crystalViolet: new THREE.MeshBasicMaterial({ color: 0xd896ff, toneMapped: false }),
  };
}

/* -------------------------------------------------------------------------- */
/* 1. AXIAL GRAND NORTHERN STAIRCASE (`x = 0.0, z = -10.5 -> -46.8`)          */
/* -------------------------------------------------------------------------- */

function buildGrandNorthernStaircase(mats) {
  const group = new THREE.Group();
  group.name = 'grand-northern-staircase';

  const { startZ, endZ, startY, endY, steps, treadWidth, cheekWallWidth } = SHRINE.stairs;
  const totalRun = startZ - endZ; // 36.3m (-10.5 to -46.8)
  const stepRun = totalRun / steps; // 0.789m
  const stepRise = (endY - startY) / steps; // 0.1413m

  // Threshold plaza transition apron at foot of stairs (z = -9.7..-10.5, y = 0.02m)
  // Cleanly outside the Village Ring Road so it never pinches the Well Plaza!
  const footApron = box(treadWidth + 1.4, 0.08, 1.0, mats.stoneWarm, {
    tile: TILE.stone,
    outline: 0.012,
  });
  footApron.position.set(0, 0.02, startZ + 0.45);
  group.add(footApron);

  // 46 monolithic stone steps (overlapping by 0.08m in depth and backed by solid foundation riser)
  for (let i = 0; i < steps; i++) {
    const zCenter = startZ - (i + 0.5) * stepRun;
    const yTop = startY + (i + 1) * stepRise;
    const h = stepRise + 0.22; // solid overlap into step below
    const d = stepRun + 0.09;
    const mat = i % 3 === 0 ? mats.stoneTrim : mats.stoneWarm;
    const stepBlock = box(treadWidth + 0.16, h, d, mat, {
      tile: TILE.stone,
      outline: 0.011,
    });
    stepBlock.position.set(0, yTop - h * 0.5, zCenter);
    group.add(stepBlock);
  }

  // Summit paved landing connecting step 46 (z = -46.8) into the 13m Shrine Platform rim (z = -49.5)
  const landingLen = -46.7 - -49.8; // 3.1m
  const summitLanding = box(treadWidth + 1.1, 0.65, landingLen, mats.stoneWarm, {
    tile: TILE.stone,
    outline: 0.014,
  });
  summitLanding.position.set(0, endY - 0.32, -48.25);
  group.add(summitLanding);

  // CONTINUOUS MITERED SLOPED STONE STRINGERS / CHEEK-WALLS
  // Built from an exact 2D (z, y) polygon profile so ends are plumb-mitered and
  // the sloped wall completely encloses all 46 step corners (zero sawtooth corners in grass!).
  const buildMiteredCheekWall = (side) => {
    const wallGroup = new THREE.Group();
    const xCenter = side * (treadWidth * 0.5 + cheekWallWidth * 0.5 - 0.04); // ±2.14m

    // Shape in XY where shapeX = worldZ, shapeY = worldY
    const zFootFront = startZ + 0.55; // -9.95
    const zFootSlope = startZ; // -10.5
    const zTopSlope = endZ; // -46.8
    const zTopBack = -49.75;

    const wallRiseAboveStep = 0.34;
    const wallShape = new THREE.Shape();
    wallShape.moveTo(zFootFront, -0.65);
    wallShape.lineTo(zFootFront, startY + wallRiseAboveStep);
    wallShape.lineTo(zFootSlope, startY + wallRiseAboveStep);
    wallShape.lineTo(zTopSlope, endY + wallRiseAboveStep);
    wallShape.lineTo(zTopBack, endY + wallRiseAboveStep);
    wallShape.lineTo(zTopBack, endY - 1.35);
    wallShape.lineTo(zTopSlope, endY - 1.15);
    wallShape.lineTo(zFootSlope, -0.65);
    wallShape.closePath();

    const wallGeo = new THREE.ExtrudeGeometry(wallShape, {
      depth: cheekWallWidth,
      bevelEnabled: false,
    });
    // Rotate so shapeX (worldZ) -> +Z, shapeY (worldY) -> +Y, extrude depth -> X
    wallGeo.rotateY(-Math.PI / 2);
    wallGeo.translate(xCenter + cheekWallWidth * 0.5, 0, 0);
    scaleUV(wallGeo, 1 / TILE.stone, 1 / TILE.stone);
    wallGeo.computeVertexNormals();

    const wallMesh = new THREE.Mesh(wallGeo, mats.stone);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    addOutline(wallMesh, 0.015);
    wallGroup.add(wallMesh);

    // Overhanging Mitered Sloped Stone Coping Cap on top of the cheek-wall
    const capWidth = cheekWallWidth + 0.14;
    const capH = 0.13;
    const capShape = new THREE.Shape();
    capShape.moveTo(zFootFront + 0.06, startY + wallRiseAboveStep);
    capShape.lineTo(zFootFront + 0.06, startY + wallRiseAboveStep + capH);
    capShape.lineTo(zFootSlope, startY + wallRiseAboveStep + capH);
    capShape.lineTo(zTopSlope, endY + wallRiseAboveStep + capH);
    capShape.lineTo(zTopBack - 0.06, endY + wallRiseAboveStep + capH);
    capShape.lineTo(zTopBack - 0.06, endY + wallRiseAboveStep);
    capShape.lineTo(zTopSlope, endY + wallRiseAboveStep);
    capShape.lineTo(zFootSlope, startY + wallRiseAboveStep);
    capShape.closePath();

    const capGeo = new THREE.ExtrudeGeometry(capShape, {
      depth: capWidth,
      bevelEnabled: false,
    });
    capGeo.rotateY(-Math.PI / 2);
    capGeo.translate(xCenter + capWidth * 0.5, 0, 0);
    scaleUV(capGeo, 1 / TILE.stone, 1 / TILE.stone);
    capGeo.computeVertexNormals();

    const capMesh = new THREE.Mesh(capGeo, mats.stoneTrim);
    capMesh.castShadow = true;
    capMesh.receiveShadow = true;
    addOutline(capMesh, 0.014);
    wallGroup.add(capMesh);

    // Intermediate stone pilaster buttresses & moss cushions along the cheek-wall
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const pz = THREE.MathUtils.lerp(zFootSlope + 0.1, zTopSlope - 0.1, t);
      const py = THREE.MathUtils.lerp(startY, endY, t);
      const pier = box(0.76, 1.05, 0.76, mats.stoneWarm, { tile: TILE.stone, outline: 0.014 });
      pier.position.set(xCenter, py + 0.08, pz);
      wallGroup.add(pier);

      const pierCap = box(0.88, 0.16, 0.88, mats.stoneTrim, { tile: TILE.stone, outline: 0.014 });
      pierCap.position.set(xCenter, py + 0.64, pz);
      wallGroup.add(pierCap);

      // Stone lantern at foot (k=0) and summit (k=4)
      if (k === 0 || k === 4) {
        const lanternPost = box(0.32, 0.48, 0.32, mats.stone, { tile: TILE.stone, outline: 0.012 });
        lanternPost.position.set(xCenter, py + 0.96, pz);
        wallGroup.add(lanternPost);

        const lanternCore = box(0.26, 0.28, 0.26, mats.lampGlow, { outline: 0 });
        lanternCore.position.set(xCenter, py + 1.32, pz);
        wallGroup.add(lanternCore);

        const lanternRoof = new THREE.Mesh(
          new THREE.ConeGeometry(0.38, 0.28, 4),
          mats.stoneTrim
        );
        lanternRoof.rotation.y = Math.PI * 0.25;
        lanternRoof.position.set(xCenter, py + 1.56, pz);
        addOutline(lanternRoof, 0.012);
        wallGroup.add(lanternRoof);
      }
    }

    return wallGroup;
  };

  group.add(buildMiteredCheekWall(-1));
  group.add(buildMiteredCheekWall(1));

  return group;
}

/* -------------------------------------------------------------------------- */
/* 2. SHRINE OVERLOOK: 13m PLATFORM, 8-PETAL MEDALLION, ROMANESQUE ARCH       */
/* -------------------------------------------------------------------------- */

function buildEightPetalMedallion(mats) {
  const group = new THREE.Group();
  group.name = 'eight-petal-floral-medallion';

  // Concentric inlaid stone rings
  const outerBorder = cyl(3.48, 0.06, mats.medallionDark, { segments: 48, outline: 0.01 });
  outerBorder.position.y = 0.01;
  group.add(outerBorder);

  const creamRing = cyl(3.26, 0.068, mats.medallionCream, { segments: 48, outline: 0.008 });
  creamRing.position.y = 0.014;
  group.add(creamRing);

  const slateRing = cyl(2.94, 0.074, mats.medallionSlate, { segments: 48, outline: 0.008 });
  slateRing.position.y = 0.018;
  group.add(slateRing);

  const innerCreamDisk = cyl(2.68, 0.08, mats.medallionCream, { segments: 48, outline: 0 });
  innerCreamDisk.position.y = 0.022;
  group.add(innerCreamDisk);

  // Sculpted lotus/diamond petal helper in XZ plane
  const makePetalMesh = (rInner, rMid, rTip, halfWidth, height, mat, yOffset) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, rInner);
    shape.quadraticCurveTo(halfWidth * 1.05, rMid, 0, rTip);
    shape.quadraticCurveTo(-halfWidth * 1.05, rMid, 0, rInner);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 12,
    });
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = yOffset;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.008);
    return mesh;
  };

  // 8 Petals: 4 primary cardinal petals (slate-blue with cream inner core) + 4 diagonal petals (celadon/cream)
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const isCardinal = i % 2 === 0;
    const petalGroup = new THREE.Group();
    petalGroup.rotation.y = angle;

    if (isCardinal) {
      // Outer slate-blue lotus petal reaching r = 2.62m
      petalGroup.add(makePetalMesh(0.32, 1.55, 2.62, 0.68, 0.024, mats.medallionSlate, 0.06));
      // Inner cream inlay frame inside cardinal petal
      petalGroup.add(makePetalMesh(0.44, 1.48, 2.28, 0.44, 0.028, mats.medallionCream, 0.064));
      // Central slate-blue jewel core
      petalGroup.add(makePetalMesh(0.56, 1.42, 1.96, 0.24, 0.032, mats.medallionSlate, 0.068));
    } else {
      // Diagonal secondary petal reaching r = 2.38m
      petalGroup.add(makePetalMesh(0.32, 1.40, 2.38, 0.56, 0.022, mats.medallionDark, 0.058));
      petalGroup.add(makePetalMesh(0.42, 1.35, 2.18, 0.42, 0.026, mats.medallionCeladon, 0.062));
    }

    // 8 Inner Golden-Ochre Star Spear Petals
    petalGroup.add(makePetalMesh(0.28, 0.86, 1.38, 0.22, 0.036, mats.medallionGold, 0.072));

    group.add(petalGroup);
  }

  // Center Lotus Rosette Boss
  const centerRing = cyl(0.46, 0.11, mats.medallionGold, { segments: 16, outline: 0.01 });
  centerRing.position.y = 0.055;
  group.add(centerRing);

  const centerGem = cyl(0.28, 0.13, mats.medallionCream, { segments: 16, outline: 0.008 });
  centerGem.position.y = 0.065;
  group.add(centerGem);

  return group;
}

/**
 * Builds the Weathered Cream-Stone Romanesque Archway (`archHalf` / `quoin` masonry
 * with stepped bases, capitals, radial voussoirs, and central keystone).
 */
function buildRomanesqueArchway(mats) {
  const group = new THREE.Group();
  group.name = 'romanesque-stone-archway';

  const halfSpan = 2.15; // Pier centers at x = -2.15m and x = +2.15m (4.3m span)
  const pierHeight = 3.15; // Above platform

  // Build both left (-1) and right (+1) Romanesque piers with stepped bases, quoin courses, and capitals
  for (const side of [-1, 1]) {
    const px = side * halfSpan;
    const pierGroup = new THREE.Group();
    pierGroup.position.set(px, 0, 0);

    // 1. 3-Tier Stepped Stone Plinth Base
    const base1 = box(1.52, 0.34, 1.46, mats.stone, { tile: TILE.stone, outline: 0.016 });
    base1.position.y = 0.17;
    pierGroup.add(base1);

    const base2 = box(1.34, 0.30, 1.28, mats.stoneWarm, { tile: TILE.stone, outline: 0.015 });
    base2.position.y = 0.49;
    pierGroup.add(base2);

    const base3 = box(1.16, 0.24, 1.12, mats.stoneTrim, { tile: TILE.stone, outline: 0.014 });
    base3.position.y = 0.76;
    pierGroup.add(base3);

    // 2. Staggered Quoin Ashlar Pier Shaft (6 alternating courses)
    const courses = 6;
    const shaftBottom = 0.88;
    const courseH = (pierHeight - shaftBottom) / courses;
    for (let c = 0; c < courses; c++) {
      const even = c % 2 === 0;
      const bw = even ? 1.06 : 0.96;
      const bd = even ? 0.98 : 1.06;
      const mat = even ? mats.stoneWarm : mats.stoneTrim;
      const block = box(bw, courseH - 0.018, bd, mat, {
        tile: TILE.stone,
        outline: 0.014,
      });
      block.position.y = shaftBottom + (c + 0.5) * courseH;
      pierGroup.add(block);
    }

    // Inner & outer vertical pilaster strips
    const pilaster = box(0.34, pierHeight - shaftBottom, 1.14, mats.stoneTrim, {
      tile: TILE.stone,
      outline: 0.012,
    });
    pilaster.position.y = (pierHeight + shaftBottom) * 0.5;
    pierGroup.add(pilaster);

    // 3. Stepped Moulded Romanesque Capital (Impost) with carved chevron/diamond frieze
    const neckMold = box(1.18, 0.14, 1.16, mats.stone, { tile: TILE.stone, outline: 0.014 });
    neckMold.position.y = pierHeight + 0.07;
    pierGroup.add(neckMold);

    const frieze = box(1.30, 0.28, 1.26, mats.stoneWarm, { tile: TILE.stone, outline: 0.015 });
    frieze.position.y = pierHeight + 0.28;
    pierGroup.add(frieze);

    // Carved diamond relief bosses on the frieze
    for (const fz of [-0.64, 0.64]) {
      for (const fx of [-0.32, 0, 0.32]) {
        const diamond = box(0.14, 0.14, 0.06, mats.stoneTrim, { outline: 0.008 });
        diamond.rotation.z = Math.PI * 0.25;
        diamond.position.set(fx, pierHeight + 0.28, fz);
        pierGroup.add(diamond);
      }
    }

    const abacusCap = box(1.44, 0.20, 1.38, mats.stoneTrim, { tile: TILE.stone, outline: 0.016 });
    abacusCap.position.y = pierHeight + 0.52;
    pierGroup.add(abacusCap);

    // Flanking low weathered wing-wall blocks at base (like ref-shrine-vista-mood.png)
    const wingBlock1 = box(0.95, 0.48, 0.88, mats.stone, { tile: TILE.stone, outline: 0.014 });
    wingBlock1.position.set(side * 1.12, 0.24, 0.15);
    wingBlock1.rotation.y = side * 0.12;
    pierGroup.add(wingBlock1);

    const wingBlock2 = box(0.76, 0.36, 0.74, mats.stoneWarm, { tile: TILE.stone, outline: 0.014 });
    wingBlock2.position.set(side * 1.78, 0.18, 0.32);
    wingBlock2.rotation.y = side * 0.25;
    pierGroup.add(wingBlock2);

    group.add(pierGroup);
  }

  // 4. SEMICIRCULAR VOUSSOIR ARCH (`archHalf` left & right + Central Stepped KEYSTONE)
  const archSpringY = pierHeight + 0.62; // 3.77m
  const archRadius = halfSpan; // 2.15m centerline radius
  const voussoirCount = 15; // odd count so index 7 is the exact top Keystone!
  const midIdx = Math.floor(voussoirCount / 2);

  for (let i = 0; i < voussoirCount; i++) {
    const t = i / (voussoirCount - 1);
    const angle = THREE.MathUtils.lerp(Math.PI * 0.96, Math.PI * 0.04, t);
    const isKeystone = i === midIdx;

    const vx = Math.cos(angle) * archRadius;
    const vy = archSpringY + Math.sin(angle) * archRadius;

    // Radial height and thickness of voussoir vs oversized Keystone
    const radialH = isKeystone ? 0.86 : 0.66;
    const tangentW = isKeystone ? 0.54 : 0.48;
    const depthD = isKeystone ? 1.16 : 0.98;
    const mat = isKeystone
      ? mats.stoneTrim
      : i % 2 === 0
      ? mats.stoneWarm
      : mats.stoneTrim;

    const voussoir = box(tangentW, radialH, depthD, mat, {
      tile: TILE.stone,
      outline: isKeystone ? 0.018 : 0.014,
    });
    voussoir.position.set(vx, vy, 0);
    voussoir.rotation.z = angle - Math.PI * 0.5;
    group.add(voussoir);

    // Outer extruded hood-mould / extrados trim ring block
    const hoodRadius = archRadius + 0.42;
    const hoodBlock = box(0.52, 0.20, 1.08, mats.stone, {
      tile: TILE.stone,
      outline: 0.012,
    });
    hoodBlock.position.set(
      Math.cos(angle) * hoodRadius,
      archSpringY + Math.sin(angle) * hoodRadius,
      0
    );
    hoodBlock.rotation.z = angle - Math.PI * 0.5;
    group.add(hoodBlock);
  }

  // 5. 3D Moss Cushions & Ivy Clusters clinging to the Romanesque stonework
  const mossSpots = [
    [-2.15, 0.92, 0.58, 0.34],
    [-2.85, 0.52, 0.35, 0.38],
    [-2.15, 3.68, 0.55, 0.32],
    [-1.25, archSpringY + 1.95, 0.45, 0.36],
    [0.0, archSpringY + 2.55, 0.35, 0.32],
    [1.45, archSpringY + 1.80, 0.45, 0.35],
    [2.15, 0.92, 0.58, 0.32],
    [2.85, 0.52, 0.35, 0.36],
  ];
  for (const [mx, my, mz, mr] of mossSpots) {
    const mGeo = new THREE.IcosahedronGeometry(mr, 1).toNonIndexed();
    mGeo.computeVertexNormals();
    const moss = new THREE.Mesh(mGeo, mats.leafA);
    moss.scale.set(1.25, 0.52, 0.95);
    moss.position.set(mx, my, mz);
    moss.castShadow = true;
    addOutline(moss, 0.012);
    group.add(moss);
  }

  return group;
}

/**
 * Builds the Flanking Left Ruined Romanesque Pier (`(-5.3, -55.2, y = +6.5m)`)
 * seen in the left foreground of `ref-shrine-vista-mood.png`.
 */
function buildRuinedRomanesquePier(mats) {
  const group = new THREE.Group();
  group.name = 'ruined-romanesque-pier';

  const base1 = box(1.36, 0.32, 1.36, mats.stone, { tile: TILE.stone, outline: 0.015 });
  base1.position.y = 0.16;
  group.add(base1);

  const base2 = box(1.16, 0.28, 1.16, mats.stoneWarm, { tile: TILE.stone, outline: 0.014 });
  base2.position.y = 0.46;
  group.add(base2);

  for (let c = 0; c < 5; c++) {
    const block = box(c % 2 === 0 ? 0.98 : 0.90, 0.38, c % 2 === 0 ? 0.92 : 0.98, mats.stoneWarm, {
      tile: TILE.stone,
      outline: 0.014,
    });
    block.position.y = 0.60 + (c + 0.5) * 0.40;
    group.add(block);
  }

  const capital = box(1.26, 0.26, 1.22, mats.stoneTrim, { tile: TILE.stone, outline: 0.015 });
  capital.position.y = 2.75;
  group.add(capital);

  // Two broken springing arch voussoirs tilting inward
  for (let v = 0; v < 2; v++) {
    const vBlock = box(0.52, 0.62, 0.92, mats.stoneTrim, { tile: TILE.stone, outline: 0.014 });
    vBlock.position.set(0.22 + v * 0.34, 3.12 + v * 0.42, 0);
    vBlock.rotation.z = -0.32 - v * 0.24;
    group.add(vBlock);
  }

  // Moss cap on the broken top
  const mossGeo = new THREE.IcosahedronGeometry(0.42, 1).toNonIndexed();
  mossGeo.computeVertexNormals();
  const moss = new THREE.Mesh(mossGeo, mats.leafA);
  moss.scale.set(1.2, 0.5, 1.0);
  moss.position.set(0.45, 3.82, 0);
  addOutline(moss, 0.012);
  group.add(moss);

  return group;
}

/**
 * Builds the Co-Op Spell Pedestal at the Shrine Overlook.
 */
function buildCoOpSpellPedestal(mats) {
  const group = new THREE.Group();
  group.name = 'coop-spell-pedestal';

  // 2-step octagonal stone base
  const step1 = cyl(0.92, 0.18, mats.stone, { segments: 8, outline: 0.014 });
  step1.position.y = 0.09;
  group.add(step1);

  const step2 = cyl(0.68, 0.18, mats.stoneWarm, { segments: 8, outline: 0.014 });
  step2.position.y = 0.27;
  group.add(step2);

  // Carved Romanesque column shaft
  const shaft = cyl(0.34, 0.86, mats.stoneTrim, { segments: 8, outline: 0.014 });
  shaft.position.y = 0.79;
  group.add(shaft);

  // Golden inlaid runic collar rings
  for (const ry of [0.55, 1.02]) {
    const ring = cyl(0.38, 0.07, mats.medallionGold, { segments: 8, outline: 0.008 });
    ring.position.y = ry;
    group.add(ring);
  }

  // Altar capital table + 4 corner scroll horns
  const table = box(0.96, 0.16, 0.96, mats.stoneWarm, { tile: TILE.stone, outline: 0.014 });
  table.position.y = 1.30;
  group.add(table);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const horn = box(0.20, 0.20, 0.20, mats.medallionGold, { outline: 0.01 });
      horn.position.set(sx * 0.42, 1.42, sz * 0.42);
      horn.rotation.y = Math.PI * 0.25;
      group.add(horn);
    }
  }

  // Open Spell Grimoire on tilted lectern
  const lectern = box(0.56, 0.12, 0.44, mats.timberDark, { tile: TILE.wood, outline: 0.01 });
  lectern.position.set(0, 1.44, 0.04);
  lectern.rotation.x = 0.35;
  group.add(lectern);

  for (const side of [-1, 1]) {
    const page = box(0.24, 0.04, 0.36, mats.medallionCream, { outline: 0.008 });
    page.position.set(side * 0.13, 1.50, 0.04);
    page.rotation.x = 0.35;
    page.rotation.z = -side * 0.14;
    group.add(page);
  }

  // Floating Co-Op Twin Arcane Crystals (animated in update(dt))
  const crystalGroup = new THREE.Group();
  crystalGroup.position.y = 2.05;

  const mainCrystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.24, 0),
    mats.crystalCyan
  );
  mainCrystal.scale.set(0.75, 1.45, 0.75);
  addOutline(mainCrystal, 0.012);
  crystalGroup.add(mainCrystal);

  const subCrystal1 = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12, 0),
    mats.crystalViolet
  );
  subCrystal1.position.set(-0.36, -0.08, 0);
  addOutline(subCrystal1, 0.01);
  crystalGroup.add(subCrystal1);

  const subCrystal2 = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12, 0),
    mats.crystalViolet
  );
  subCrystal2.position.set(0.36, 0.08, 0);
  addOutline(subCrystal2, 0.01);
  crystalGroup.add(subCrystal2);

  group.add(crystalGroup);

  return {
    group,
    update(dt, elapsed) {
      crystalGroup.position.y = 2.05 + Math.sin(elapsed * 2.4) * 0.09;
      crystalGroup.rotation.y = elapsed * 0.9;
    },
  };
}

/**
 * Builds the complete Northern Shrine Overlook at `(0, -56, y = +6.5m)`.
 */
function buildShrineOverlook(mats) {
  const group = new THREE.Group();
  group.name = 'shrine-overlook';
  group.position.set(SHRINE.x, SHRINE.y, SHRINE.z);

  const R = SHRINE.platformRadius; // 6.5m (13m diameter)

  // Deep cylindrical stone retaining drum embedded into hilltop so zero edges ever float
  const drum = cyl(R + 0.08, 2.6, mats.stone, { segments: 48, outline: 0.016 });
  drum.position.y = -1.3;
  group.add(drum);

  // Main circular stone paved floor disk
  const floorDisk = cyl(R - 0.15, 0.12, mats.stoneWarm, { segments: 48, outline: 0.012 });
  floorDisk.position.y = -0.04;
  group.add(floorDisk);

  // 32 Beveled Stone Curbstones ringing the 13m circular platform
  const curbCount = 32;
  for (let i = 0; i < curbCount; i++) {
    const a = (i / curbCount) * Math.PI * 2;
    // Leave a clean threshold opening at the southern stair landing (angle ~ PI/2 -> z = +6.5)
    const cx = Math.cos(a) * (R - 0.22);
    const cz = Math.sin(a) * (R - 0.22);
    const isStairEntry = cz > R - 0.85 && Math.abs(cx) < 1.9;
    const h = isStairEntry ? 0.05 : 0.14;
    const curb = box(1.18, h, 0.58, i % 2 === 0 ? mats.stone : mats.stoneTrim, {
      tile: TILE.stone,
      outline: 0.012,
    });
    curb.position.set(cx, h * 0.5 - 0.02, cz);
    curb.rotation.y = -a + Math.PI * 0.5;
    group.add(curb);
  }

  // 8-Petal Inlaid Floral Medallion at the center of the 13m platform
  const medallion = buildEightPetalMedallion(mats);
  medallion.position.set(0, 0.0, 0);
  group.add(medallion);

  // Weathered Cream-Stone Romanesque Archway on the northern arc (`z = -4.2` local -> `z = -60.2` world)
  const arch = buildRomanesqueArchway(mats);
  arch.position.set(0, 0, SHRINE.arch.z - SHRINE.z);
  group.add(arch);

  // Flanking Left Ruined Romanesque Pier (`x = -5.3, z = +0.8` local)
  const ruinPier = buildRuinedRomanesquePier(mats);
  ruinPier.position.set(-5.3, 0, 0.8);
  ruinPier.rotation.y = 0.38;
  group.add(ruinPier);

  // Co-Op Spell Pedestal (`x = 0, z = -2.1` local -> `z = -58.1` world)
  const pedestal = buildCoOpSpellPedestal(mats);
  pedestal.group.position.set(0, 0.02, SHRINE.pedestal.z - SHRINE.z);
  group.add(pedestal.group);

  return {
    group,
    update(dt, elapsed) {
      pedestal.update(dt, elapsed);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 3. STONE SHORELINE ABUTMENT, WOODEN PIER & ROWBOAT                         */
/* -------------------------------------------------------------------------- */

function buildPierAndShorelineAbutment(mats) {
  const group = new THREE.Group();
  group.name = 'pier-and-shoreline-abutment';

  const deckY = WATER.pierAbutment.y; // -0.32m (0.88m above waterY = -1.2m)
  const pierZ = WATER.pierAbutment.z; // 8.0m

  // 1. SOLID STONE SHORELINE ABUTMENT / BULKHEAD (`x = -19.0..-22.0, z = 5.8..10.2`)
  // Grounds the transition from West Mill Road onto the Wooden Pier so the pier never floats over water!
  const abutBody = box(3.2, 2.2, 4.2, mats.stone, {
    tile: TILE.stone,
    outline: 0.016,
    name: 'pier-stone-abutment',
  });
  abutBody.position.set(-20.5, deckY - 1.12, pierZ);
  group.add(abutBody);

  // Dressed warm stone apron cap on top of the abutment flush with the road and pier deck
  const abutCap = box(3.4, 0.18, 4.4, mats.stoneWarm, {
    tile: TILE.stone,
    outline: 0.014,
  });
  abutCap.position.set(-20.5, deckY - 0.06, pierZ);
  group.add(abutCap);

  // Flanking stone wing-walls & low parapets on the shoreline abutment
  for (const sz of [-1, 1]) {
    const wingWall = box(2.8, 0.56, 0.44, mats.stoneTrim, {
      tile: TILE.stone,
      outline: 0.014,
    });
    wingWall.position.set(-20.6, deckY + 0.24, pierZ + sz * 1.85);
    group.add(wingWall);

    const bollard = box(0.48, 0.78, 0.48, mats.stone, {
      tile: TILE.stone,
      outline: 0.014,
    });
    bollard.position.set(-19.3, deckY + 0.34, pierZ + sz * 1.85);
    group.add(bollard);
  }

  // 2. WOODEN PIER WALKWAY (`x = -21.0 -> -33.2, z = 8.0, y = -0.32m`)
  const startX = -20.8;
  const endX = WATER.pierEnd.x; // -33.2
  const pierLen = startX - endX; // 12.4m
  const midX = (startX + endX) * 0.5;
  const pierWidth = 2.85;

  // Heavy longitudinal timber stringer beams under the planks
  for (const sz of [-1.05, 0, 1.05]) {
    const stringer = box(pierLen, 0.22, 0.20, mats.timberDark, {
      tile: TILE.wood,
      outline: 0.014,
    });
    stringer.position.set(midX, deckY - 0.14, pierZ + sz);
    group.add(stringer);
  }

  // 28 Individual Thick Wooden Deck Planks
  const plankCount = 28;
  const plankStep = pierLen / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const px = startX - (i + 0.5) * plankStep;
    const mat = i % 3 === 0 ? mats.timberDark : mats.timber;
    const plank = box(plankStep - 0.035, 0.09, pierWidth, mat, {
      tile: TILE.wood,
      outline: 0.012,
    });
    plank.position.set(px, deckY + 0.02, pierZ);
    group.add(plank);
  }

  // 6 Pairs of Heavy Timber Pilings driven deep into the lakebed (`y = -2.85m` up to `y = +0.62m`)
  const pilingXs = [-21.8, -24.0, -26.2, -28.4, -30.6, -32.8];
  for (let idx = 0; idx < pilingXs.length; idx++) {
    const px = pilingXs[idx];
    for (const sz of [-1, 1]) {
      const pz = pierZ + sz * (pierWidth * 0.5 + 0.08);
      const pilingH = 3.5;
      const piling = cyl(0.15, pilingH, mats.timberDark, { segments: 10, outline: 0.014 });
      piling.position.set(px, deckY + 0.88 - pilingH * 0.5, pz);
      group.add(piling);

      // Rope collar wrapping each piling post
      const ropeCollar = cyl(0.175, 0.14, mats.stoneWarm, { segments: 10, outline: 0.008 });
      ropeCollar.position.set(px, deckY + 0.62, pz);
      group.add(ropeCollar);
    }

    // Transverse cross-beam & diagonal bracing beneath deck
    const crossBeam = box(0.18, 0.18, pierWidth + 0.35, mats.timberDark, {
      tile: TILE.wood,
      outline: 0.012,
    });
    crossBeam.position.set(px, deckY - 0.28, pierZ);
    group.add(crossBeam);

    if (idx > 0) {
      group.add(
        beamBetween(
          [px, deckY - 0.95, pierZ - 1.35],
          [px, deckY - 0.22, pierZ + 1.35],
          0.1,
          0.1,
          mats.timber
        )
      );
    }
  }

  // Timber Guard Rails along the pier sides (leaving a boat-boarding gap on the south side near the end)
  for (let idx = 0; idx < pilingXs.length - 1; idx++) {
    const x1 = pilingXs[idx];
    const x2 = pilingXs[idx + 1];
    for (const sz of [-1, 1]) {
      if (sz === 1 && idx === 3) continue; // boarding gap for the rowboat!
      const pz = pierZ + sz * (pierWidth * 0.5 + 0.08);
      group.add(beamBetween([x1, deckY + 0.68, pz], [x2, deckY + 0.68, pz], 0.09, 0.09, mats.timber));
      group.add(beamBetween([x1, deckY + 0.36, pz], [x2, deckY + 0.36, pz], 0.07, 0.07, mats.timberDark));
    }
  }

  // Warm Dock Lantern at the end of the pier (`x = -32.8`)
  const lanternPole = cyl(0.08, 1.5, mats.timberDark, { segments: 8, outline: 0.012 });
  lanternPole.position.set(-32.8, deckY + 1.45, pierZ - pierWidth * 0.5 - 0.08);
  group.add(lanternPole);

  const lanternArm = box(0.65, 0.08, 0.08, mats.timberDark, { outline: 0.01 });
  lanternArm.position.set(-33.05, deckY + 2.15, pierZ - pierWidth * 0.5 - 0.08);
  group.add(lanternArm);

  const dockLamp = box(0.26, 0.34, 0.26, mats.lampGlow, { outline: 0.01 });
  dockLamp.position.set(-33.3, deckY + 1.88, pierZ - pierWidth * 0.5 - 0.08);
  group.add(dockLamp);

  // 3. CEL-SHADED WOODEN ROWBOAT MOORED BESIDE THE PIER (`x = -27.4, z = 11.2, y = -1.16m`)
  const boatGroup = new THREE.Group();
  boatGroup.name = 'moored-rowboat';
  boatGroup.position.set(-27.4, WATER.waterY + 0.06, pierZ + 3.15);
  boatGroup.rotation.y = 0.18;

  // Hull shaped with a tapered flat-bottom boat profile
  const hullLen = 3.6;
  const hullW = 1.38;
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-hullLen * 0.5, 0);
  hullShape.quadraticCurveTo(-hullLen * 0.22, hullW * 0.55, hullLen * 0.42, hullW * 0.38);
  hullShape.lineTo(hullLen * 0.42, -hullW * 0.38);
  hullShape.quadraticCurveTo(-hullLen * 0.22, -hullW * 0.55, -hullLen * 0.5, 0);
  hullShape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.46,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 2,
  });
  hullGeo.rotateX(-Math.PI / 2);
  scaleUV(hullGeo, 1 / TILE.wood, 1 / TILE.wood);
  hullGeo.computeVertexNormals();
  const hullMesh = new THREE.Mesh(hullGeo, mats.timberDark);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  addOutline(hullMesh, 0.016);
  boatGroup.add(hullMesh);

  // Thwart seats & wooden oars
  for (const bx of [-0.75, 0.15, 0.95]) {
    const seat = box(0.32, 0.06, 1.05, mats.timber, { tile: TILE.wood, outline: 0.01 });
    seat.position.set(bx, 0.38, 0);
    boatGroup.add(seat);
  }
  for (const sz of [-1, 1]) {
    const oar = box(2.1, 0.05, 0.14, mats.timberLight, { tile: TILE.wood, outline: 0.01 });
    oar.position.set(-0.1, 0.46, sz * 0.42);
    oar.rotation.y = sz * 0.18;
    boatGroup.add(oar);
  }
  group.add(boatGroup);

  // Mooring rope connecting rowboat bow to pier piling
  group.add(
    beamBetween(
      [-28.9, WATER.waterY + 0.45, pierZ + 2.85],
      [-28.4, deckY + 0.55, pierZ + pierWidth * 0.5 + 0.08],
      0.04,
      0.04,
      mats.stoneWarm
    )
  );

  return {
    group,
    update(dt, elapsed) {
      boatGroup.position.y = WATER.waterY + 0.06 + Math.sin(elapsed * 1.9) * 0.035;
      boatGroup.rotation.z = Math.sin(elapsed * 1.4) * 0.03;
      boatGroup.rotation.x = Math.cos(elapsed * 1.7) * 0.025;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 4. WELL PLAZA & ROOFED STONE VILLAGE WELL (`(0, 0, y = 0.0m)`)             */
/* -------------------------------------------------------------------------- */

function buildWellPlaza(mats) {
  const group = new THREE.Group();
  group.name = 'well-plaza-and-roofed-well';

  // 1. Circular Cobblestone Plaza Disk (`r = 6.5m`) + Bevelled Stone Curbstones
  const plazaDisk = cyl(WELL_PLAZA.cobbleRadius, 0.05, mats.path, {
    segments: 48,
    outline: 0.01,
  });
  plazaDisk.position.y = 0.015;
  group.add(plazaDisk);

  // Inner concentric stone ring around the well (`r = 3.2m`)
  const innerStoneRing = cyl(3.2, 0.07, mats.stoneWarm, { segments: 32, outline: 0.01 });
  innerStoneRing.position.y = 0.028;
  group.add(innerStoneRing);

  // 28 Beveled Curbstones ringing the outer perimeter of the Well Plaza (`r = 6.35m`)
  const curbCount = 28;
  for (let i = 0; i < curbCount; i++) {
    const a = (i / curbCount) * Math.PI * 2;
    const curb = box(1.12, 0.09, 0.42, i % 2 === 0 ? mats.stone : mats.stoneTrim, {
      tile: TILE.stone,
      outline: 0.01,
    });
    curb.position.set(
      Math.cos(a) * (WELL_PLAZA.cobbleRadius - 0.18),
      0.04,
      Math.sin(a) * (WELL_PLAZA.cobbleRadius - 0.18)
    );
    curb.rotation.y = -a + Math.PI * 0.5;
    group.add(curb);
  }

  // 3 Low Timber Fence & Bush Accents around the inner well island (`r = 3.35m`, like ref-hamlet-mood.png)
  for (const baseAngle of [0.35, 2.45, 4.35]) {
    for (let p = -1; p <= 1; p++) {
      const a = baseAngle + p * 0.34;
      const post = box(0.16, 0.72, 0.16, mats.timber, { tile: TILE.wood, outline: 0.012 });
      post.position.set(Math.cos(a) * 3.35, 0.36, Math.sin(a) * 3.35);
      post.rotation.y = -a;
      group.add(post);
    }
    const a1 = baseAngle - 0.34;
    const a2 = baseAngle;
    const a3 = baseAngle + 0.34;
    for (const [sa, ea] of [
      [a1, a2],
      [a2, a3],
    ]) {
      for (const ry of [0.28, 0.54]) {
        group.add(
          beamBetween(
            [Math.cos(sa) * 3.35, ry, Math.sin(sa) * 3.35],
            [Math.cos(ea) * 3.35, ry, Math.sin(ea) * 3.35],
            0.07,
            0.07,
            mats.timberDark
          )
        );
      }
    }
  }

  // 2. ROOFED STONE & TIMBER VILLAGE WELL AT `(0, 0, 0)`
  // Stepped stone plinth
  const wellStep = cyl(1.68, 0.18, mats.stone, { segments: 16, outline: 0.014 });
  wellStep.position.y = 0.09;
  group.add(wellStep);

  // Coursed stone masonry well cylinder (2courses + overhanging stone lip)
  const wellBody = cyl(1.18, 0.88, mats.stoneWarm, { segments: 16, outline: 0.016 });
  wellBody.position.y = 0.62;
  group.add(wellBody);

  const wellLip = cyl(1.30, 0.16, mats.stoneTrim, { segments: 16, outline: 0.015 });
  wellLip.position.y = 1.12;
  group.add(wellLip);

  const wellWater = cyl(0.96, 0.06, mats.glassDark, { segments: 16, outline: 0 });
  wellWater.position.y = 0.96;
  group.add(wellWater);

  // Two heavy timber support posts + knee braces
  for (const sx of [-1, 1]) {
    const post = box(0.20, 2.45, 0.20, mats.timberDark, { tile: TILE.wood, outline: 0.014 });
    post.position.set(sx * 1.05, 1.38, 0);
    group.add(post);

    // Diagonal knee braces up to canopy tie-beam
    group.add(
      beamBetween([sx * 1.02, 1.85, 0], [sx * 0.52, 2.48, 0], 0.11, 0.11, mats.timber)
    );
  }

  // Tie-beam & windlass roller + iron crank + rope + bucket
  const tieBeam = box(2.55, 0.20, 0.24, mats.timber, { tile: TILE.wood, outline: 0.014 });
  tieBeam.position.set(0, 2.55, 0);
  group.add(tieBeam);

  const roller = cyl(0.14, 1.92, mats.timberLight, { segments: 10, outline: 0.012, axis: 'x' });
  roller.position.set(0, 1.82, 0);
  group.add(roller);

  const rope = cyl(0.025, 0.82, mats.stoneWarm, { segments: 6, outline: 0 });
  rope.position.set(0, 1.42, 0);
  group.add(rope);

  const bucket = cyl(0.20, 0.34, mats.timber, { segments: 10, outline: 0.012 });
  bucket.position.set(0, 1.15, 0);
  group.add(bucket);

  // Pitched Terracotta Clay Tile Canopy Roof over the Well
  const roofPitch = 0.62;
  const roofSpan = 2.75;
  const roofDepth = 2.45;
  for (const sz of [-1, 1]) {
    const slope = box(roofSpan, 0.14, 1.48, mats.roof, {
      tile: TILE.roof[0],
      outline: 0.016,
    });
    slope.position.set(0, 2.98, sz * 0.58);
    slope.rotation.x = sz * roofPitch;
    group.add(slope);
  }
  const ridgeCap = box(roofSpan + 0.12, 0.16, 0.22, mats.roofRidge, { outline: 0.014 });
  ridgeCap.position.set(0, 3.42, 0);
  group.add(ridgeCap);

  // Wooden barrels beside the well
  for (const [bx, bz, s] of [
    [1.45, 0.65, 1.0],
    [-1.42, -0.72, 0.88],
  ]) {
    const barrel = cyl(0.28 * s, 0.68 * s, mats.timber, { segments: 10, outline: 0.012 });
    barrel.position.set(bx, 0.18 + 0.34 * s, bz);
    group.add(barrel);
  }

  return group;
}

/* -------------------------------------------------------------------------- */
/* 5. WISTERIA COMBAT CLEARING SPLIT-RAIL FENCE (`center: (38, -6)`)          */
/* -------------------------------------------------------------------------- */

function buildWisteriaArenaFence(mats) {
  const group = new THREE.Group();
  group.name = 'wisteria-arena-fence';

  const { x: cx, z: cz, y: cy, fenceRadius, gateAngle, gateHalfAngle } = ARENA;
  const postCount = 32;

  const postPositions = [];
  for (let i = 0; i <= postCount; i++) {
    const a = (i / postCount) * Math.PI * 2;
    // Check angular distance from West Gate (gateAngle = Math.PI)
    let da = Math.abs(a - gateAngle);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (da < gateHalfAngle) {
      postPositions.push(null);
      continue;
    }

    const px = cx + Math.cos(a) * fenceRadius;
    const pz = cz + Math.sin(a) * fenceRadius;
    const py = sampleWorld(px, pz).y;
    postPositions.push({ x: px, y: py, z: pz, a });

    const post = box(0.18, 1.16, 0.18, mats.timberDark, {
      tile: TILE.wood,
      outline: 0.014,
    });
    post.position.set(px, py + 0.56, pz);
    post.rotation.y = -a;
    group.add(post);
  }

  // Double horizontal split rails connecting consecutive fence posts
  for (let i = 0; i < postPositions.length - 1; i++) {
    const p1 = postPositions[i];
    const p2 = postPositions[i + 1];
    if (!p1 || !p2) continue;
    for (const hOff of [0.42, 0.84]) {
      group.add(
        beamBetween(
          [p1.x, p1.y + hOff, p1.z],
          [p2.x, p2.y + hOff, p2.z],
          0.08,
          0.09,
          mats.timber
        )
      );
    }
  }

  // Stone Gate Piers flanking the Western Arena Entrance (`x ≈ 22.2, z ≈ -6.0`)
  for (const side of [-1, 1]) {
    const ga = gateAngle + side * gateHalfAngle;
    const gx = cx + Math.cos(ga) * fenceRadius;
    const gz = cz + Math.sin(ga) * fenceRadius;
    const gy = sampleWorld(gx, gz).y;

    const gatePier = box(0.68, 1.55, 0.68, mats.stone, {
      tile: TILE.stone,
      outline: 0.016,
    });
    gatePier.position.set(gx, gy + 0.75, gz);
    group.add(gatePier);

    const gateCap = box(0.82, 0.18, 0.82, mats.stoneTrim, {
      tile: TILE.stone,
      outline: 0.014,
    });
    gateCap.position.set(gx, gy + 1.58, gz);
    group.add(gateCap);

    const lantern = box(0.28, 0.34, 0.28, mats.lampGlow, { outline: 0.01 });
    lantern.position.set(gx, gy + 1.84, gz);
    group.add(lantern);
  }

  return group;
}

/* -------------------------------------------------------------------------- */
/* 6. WATERMILL ROTATING `-X` WATERWHEEL (`(-26.2, -14.2)`) & TUDOR COTTAGES  */
/* -------------------------------------------------------------------------- */

function buildWaterwheel(mats) {
  const wheelGroup = new THREE.Group();
  wheelGroup.name = 'watermill-waterwheel';
  wheelGroup.position.set(WATER.wheelX, WATER.wheelY, WATER.wheelZ);

  const R = WATER.wheelRadius; // 2.1m (4.2m diameter)
  const width = 0.92;

  // Central iron/timber axle shaft extending into the Watermill `-X` wall
  const axle = cyl(0.18, width + 1.4, mats.timberDark, {
    segments: 12,
    outline: 0.014,
    axis: 'x',
  });
  axle.position.x = 0.35;
  wheelGroup.add(axle);

  // Two concentric wooden rim rings (left & right faces of wheel)
  const rimSegs = 16;
  for (const sx of [-width * 0.42, width * 0.42]) {
    for (let i = 0; i < rimSegs; i++) {
      const a1 = (i / rimSegs) * Math.PI * 2;
      const a2 = ((i + 1) / rimSegs) * Math.PI * 2;
      wheelGroup.add(
        beamBetween(
          [sx, Math.sin(a1) * R, Math.cos(a1) * R],
          [sx, Math.sin(a2) * R, Math.cos(a2) * R],
          0.14,
          0.18,
          mats.timberDark
        )
      );
      wheelGroup.add(
        beamBetween(
          [sx, Math.sin(a1) * (R * 0.68), Math.cos(a1) * (R * 0.68)],
          [sx, Math.sin(a2) * (R * 0.68), Math.cos(a2) * (R * 0.68)],
          0.10,
          0.12,
          mats.timber
        )
      );
    }

    // 8 Radial Spokes per face
    for (let s = 0; s < 8; s++) {
      const sa = (s / 8) * Math.PI * 2;
      wheelGroup.add(
        beamBetween(
          [sx, 0, 0],
          [sx, Math.sin(sa) * R, Math.cos(sa) * R],
          0.11,
          0.14,
          mats.timber
        )
      );
    }
  }

  // 16 Angled Wooden Bucket Paddles around the perimeter (dipping into `waterY = -1.2m`!)
  for (let p = 0; p < rimSegs; p++) {
    const a = (p / rimSegs) * Math.PI * 2;
    const paddle = box(width * 0.96, 0.42, 0.08, mats.timberLight, {
      tile: TILE.wood,
      outline: 0.012,
    });
    paddle.position.set(0, Math.sin(a) * (R * 0.86), Math.cos(a) * (R * 0.86));
    paddle.rotation.x = -a + 0.25;
    wheelGroup.add(paddle);
  }

  return wheelGroup;
}

/**
 * Builds a clean cel-shaded Tudor Village Cottage or Watermill using `house3d/src/parts.js`
 * so every building's front door (`doorUnit`) aligns mathematically with `(doorX, doorZ)`!
 */
function buildTudorBuilding(spec, mats) {
  const group = new THREE.Group();
  group.name = `building-${spec.id}`;
  group.position.set(spec.x, spec.y, spec.z);
  group.rotation.y = spec.rotY;

  const { w, d, stories } = spec;
  const wallH = stories >= 2 ? 4.8 : stories >= 1.5 ? 3.8 : 3.2;
  const gableRise = w * 0.36;
  const plinthH = 0.56;

  // 1. Grounded Dressed Stone Foundation Plinth (sunk 0.45m below ground so zero corners ever float!)
  const plinth = box(w + 0.28, plinthH + 0.45, d + 0.28, mats.stone, {
    tile: TILE.stone,
    outline: 0.016,
  });
  plinth.position.y = (plinthH - 0.45) * 0.5;
  group.add(plinth);

  // 2. Stucco Walls + Timber Framing (`parts.js`)
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = plinthH;

  // Front wall (+Z) with arched door opening at x = 0 (aligned with doorX, doorZ!)
  const frontWall = makeWall({
    length: w,
    height: wallH,
    thickness: 0.34,
    holes: [{ x: 0, y: 0, w: 1.45, h: 2.45, arch: 0.725 }],
    material: mats.stucco,
  });
  frontWall.position.z = d * 0.5;
  bodyGroup.add(frontWall);

  // Back wall (-Z)
  const backWall = makeWall({
    length: w,
    height: wallH,
    thickness: 0.34,
    material: mats.stuccoWarm,
  });
  backWall.rotation.y = Math.PI;
  backWall.position.z = -d * 0.5;
  bodyGroup.add(backWall);

  // Left (-X) and Right (+X) gable walls
  for (const sx of [-1, 1]) {
    const sideWall = makeWall({
      length: d,
      height: wallH,
      gableRise,
      thickness: 0.34,
      material: mats.stucco,
    });
    sideWall.rotation.y = sx * Math.PI * 0.5;
    sideWall.position.x = sx * w * 0.5;
    bodyGroup.add(sideWall);
  }

  // Timber frame posts, beams, and diagonal braces
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cornerPost = box(0.24, wallH, 0.24, mats.timber, {
        tile: TILE.wood,
        outline: 0.014,
      });
      cornerPost.position.set(sx * (w * 0.5 - 0.06), wallH * 0.5, sz * (d * 0.5 - 0.06));
      bodyGroup.add(cornerPost);
    }
  }
  for (const sz of [-1, 1]) {
    const plateBeam = box(w + 0.16, 0.22, 0.26, mats.timber, {
      tile: TILE.wood,
      outline: 0.014,
    });
    plateBeam.position.set(0, wallH - 0.08, sz * d * 0.5);
    bodyGroup.add(plateBeam);
  }

  // Front Door Unit (`doorUnit` from `parts.js`) facing +Z directly onto `(doorX, doorZ)`!
  const door = doorUnit(mats, { w: 1.45, h: 2.45, arched: true });
  door.position.set(0, 0, d * 0.5);
  bodyGroup.add(door);

  // Front Windows flanking the door
  for (const sx of [-1, 1]) {
    if (w >= 7.8) {
      const win = windowUnit(mats, { w: 1.15, h: 1.45, cols: 2, rows: 2 });
      win.position.set(sx * (w * 0.30), 1.05, d * 0.5);
      bodyGroup.add(win);
    }
  }

  // Stone Threshold Step leading down from plinthH to the rotated stone apron
  const step1 = box(2.1, plinthH * 0.65, 0.55, mats.stoneTrim, {
    tile: TILE.stone,
    outline: 0.014,
  });
  step1.position.set(0, -plinthH * 0.35, d * 0.5 + 0.26);
  bodyGroup.add(step1);

  const step2 = box(2.3, plinthH * 0.35, 0.55, mats.stoneWarm, {
    tile: TILE.stone,
    outline: 0.012,
  });
  step2.position.set(0, -plinthH * 0.72, d * 0.5 + 0.58);
  bodyGroup.add(step2);

  // Front Timber Porch Canopy over the Doorway
  if (spec.hasPorch) {
    const porchW = 2.8;
    const porchD = 1.25;
    const porchRoof = box(porchW, 0.14, porchD + 0.25, mats.roof, {
      tile: TILE.roof[0],
      outline: 0.015,
    });
    porchRoof.position.set(0, 2.85, d * 0.5 + porchD * 0.5);
    porchRoof.rotation.x = 0.38;
    bodyGroup.add(porchRoof);

    for (const sx of [-1, 1]) {
      const porchPost = box(0.16, 2.65, 0.16, mats.timberDark, {
        tile: TILE.wood,
        outline: 0.014,
      });
      porchPost.position.set(sx * (porchW * 0.44), 1.32, d * 0.5 + porchD - 0.12);
      bodyGroup.add(porchPost);
    }

    // Warm Hanging Porch Lantern
    const lamp = box(0.22, 0.28, 0.22, mats.lampGlow, { outline: 0.008 });
    lamp.position.set(0.95, 2.25, d * 0.5 + 0.55);
    bodyGroup.add(lamp);
  }

  // 3. Pitched Terracotta Clay Roof
  const roofPitch = Math.atan2(gableRise, d * 0.5);
  const slopeLen = Math.hypot(d * 0.5 + 0.55, gableRise + 0.35);
  for (const sz of [-1, 1]) {
    const roofSlope = box(w + 0.9, 0.18, slopeLen, mats.roof, {
      tile: TILE.roof[0],
      outline: 0.018,
    });
    roofSlope.position.set(
      0,
      wallH + gableRise * 0.5 - 0.08,
      sz * (d * 0.25 + 0.18)
    );
    roofSlope.rotation.x = sz * roofPitch;
    bodyGroup.add(roofSlope);
  }

  const ridge = box(w + 1.05, 0.22, 0.26, mats.roofRidge, { outline: 0.014 });
  ridge.position.set(0, wallH + gableRise + 0.06, 0);
  bodyGroup.add(ridge);

  // Stone Chimney on side wall
  if (spec.chimneySide) {
    const cs = spec.chimneySide;
    const chimneyH = wallH + gableRise + 1.2;
    const chimney = box(1.05, chimneyH, 1.15, mats.stone, {
      tile: TILE.stone,
      outline: 0.016,
    });
    chimney.position.set(cs * (w * 0.5 + 0.35), chimneyH * 0.5 - plinthH * 0.5, -0.4);
    bodyGroup.add(chimney);
  }

  group.add(bodyGroup);
  return mergeStatic(group, { outline: 0.016 });
}

export function buildLandmarks(baseMaterials, opts = {}) {
  const mats = createLandmarkMaterials(baseMaterials);
  const root = new THREE.Group();
  root.name = 'landmarks';

  // 1. Axial Grand Northern Staircase (`x = 0.0, z = -10.5 -> -46.8`)
  const stairs = buildGrandNorthernStaircase(mats);
  root.add(stairs);

  // 2. Northern Shrine Overlook (`(0, -56, y = +6.5m)`)
  const shrine = buildShrineOverlook(mats);
  root.add(shrine.group);

  // 3. Stone Shoreline Abutment, Wooden Pier & Moored Rowboat
  const pier = buildPierAndShorelineAbutment(mats);
  root.add(pier.group);

  // 4. Well Plaza & Roofed Stone Village Well (`(0, 0)`)
  const wellPlaza = buildWellPlaza(mats);
  root.add(wellPlaza);

  // 5. Wisteria Combat Clearing Split-Rail Fence (`(38, -6), r = 15.8m`)
  const arenaFence = buildWisteriaArenaFence(mats);
  root.add(arenaFence);

  // 6. Rotating 4.2m Wooden Waterwheel at `(-26.2, -14.2)` sitting in the `-2.2m` carved tailrace channel
  const waterwheel = buildWaterwheel(mats);
  root.add(waterwheel);

  // 7. Tudor Village Context Cottages & Watermill (toggleable via `opts.includeBuildings`)
  const buildingsGroup = new THREE.Group();
  buildingsGroup.name = 'village-buildings';
  if (opts.includeBuildings !== false) {
    for (const b of BUILDING_LIST) {
      buildingsGroup.add(buildTudorBuilding(b, mats));
    }
  }
  root.add(buildingsGroup);

  return {
    group: root,
    buildingsGroup,
    waterwheel,
    update(dt, elapsed) {
      shrine.update(dt, elapsed);
      pier.update(dt, elapsed);
      waterwheel.rotation.x = -elapsed * 1.15;
    },
  };
}
