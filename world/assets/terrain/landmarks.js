import * as THREE from 'three';
import {
  PLAY_BOUNDARY_RADIUS,
  ZONES,
  BUILDINGS,
  LANDMARKS,
  TREES,
  terrainHeightAt,
  clamp,
  lerp,
} from './geography.js';
import {
  PALETTE,
  makeToonGradient,
  batchVertexColorGroup,
} from './terrain-water.js';

/**
 * Merged v7 Landmarks & Architectural Structures (`world/assets/terrain/landmarks.js`).
 *
 * Implements all v7 landmarks and merges static masonry/timber by material class
 * so the entire module costs <= 5 draw calls total (budget: <= 8 draw calls):
 * 1. Hamlet Roofed Stone Well & Well Plaza (`(0, 0, y = 0.0, plazaRadius = 6.4)`)
 * 2. Lakeside Wooden Boat Pier (`xStart = -35.5, xEnd = -52.0, z = 8.5, y = -0.35`)
 *    with flush Stone Shore Abutment, Landward Approach Step, & Moored Boat (`MAP-02` clean)
 * 3. East Wisteria Combat Ring 24-Segment Split-Rail Fence (`(68, -4, y = 0.6, fenceR = 19.5)`)
 * 4. Northern Shrine Overlook (`(0.0, -86.0, y = 8.0, platformR = 14.5)`):
 *    - 56-Step Axial Staircase (`z = -15.0 -> -71.5`) with continuous flush sloped stone stringers
 *    - 8-Petal Inlaid Floral Medallion
 *    - Detailed Romanesque Stone Archway (`(0.0, -93.5, span = 6.2, height = 5.8)`)
 *    - Co-Op Spell Pedestal (`(-5.8, -87.8)`)
 *    - Raised Circular Stone Planter Rings with Dark Soil (`(±10.6, -90.8)`, `MAP-03` clean)
 * 5. 24 Stone Boundary Waymarkers at `PLAY_BOUNDARY_RADIUS = 125m`
 * 6. 5 Tudor Village Context Buildings & Rotating Waterwheel (`(-44.0, -18.0, y = 0.3, rotY = 0.42)`)
 */

function addPart(parent, geo, color, { outline = false, unlit = false } = {}) {
  const mesh = new THREE.Mesh(geo);
  mesh.userData.color = color;
  mesh.userData.outline = outline;
  mesh.userData.unlit = unlit;
  parent.add(mesh);
  return mesh;
}

function buildGableRoofGeometry(width, depth, rise, overhang = 0.42) {
  const hw = width * 0.5 + overhang;
  const hd = depth * 0.5 + overhang;
  const geo = new THREE.BufferGeometry();
  const v = [
    -hw, 0, hd,   hw, 0, hd,   hw, rise, 0,
    -hw, 0, hd,   hw, rise, 0, -hw, rise, 0,
    hw, 0, -hd,  -hw, 0, -hd, -hw, rise, 0,
    hw, 0, -hd,  -hw, rise, 0, hw, rise, 0,
    -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,
    -hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd,
    hw, 0, hd,    hw, 0, -hd,  hw, rise, 0,
    -hw, 0, -hd, -hw, 0, hd,  -hw, rise, 0,
  ];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildSlopedStringerGeometry(width, zStart, zEnd, yStart, yEnd) {
  const len = Math.abs(zEnd - zStart);
  const height = 0.82;
  const geo = new THREE.BoxGeometry(width, height, len).toNonIndexed();
  geo.translate(0, 0, (zStart + zEnd) * 0.5);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = clamp((zStart - z) / (zStart - zEnd), 0, 1);
    const slopeY = lerp(yStart - 0.08, yEnd - 0.12, t);
    pos.setY(i, pos.getY(i) + slopeY);
  }
  geo.computeVertexNormals();
  return geo;
}

/* -------------------------------------------------------------------------- */
/* 1. HAMLET ROOFED STONE WELL & WELL PLAZA (`(0, 0, y = 0.0)`)               */
/* -------------------------------------------------------------------------- */

function buildWellPlaza(colliders) {
  const group = new THREE.Group();
  group.name = 'wellPlaza';

  const rPlaza = LANDMARKS.well.plazaRadius; // 6.4m

  // Outer dressed stone plaza disc & inner concentric stone ring
  const plazaDisc = addPart(
    group,
    new THREE.CylinderGeometry(rPlaza, rPlaza + 0.2, 0.08, 24),
    PALETTE.stone,
    { outline: false }
  );
  plazaDisc.position.y = 0.02;

  const innerRing = addPart(
    group,
    new THREE.CylinderGeometry(3.2, 3.25, 0.09, 18),
    PALETTE.stoneWarm,
    { outline: false }
  );
  innerRing.position.y = 0.028;

  // Coursed stone well base + overhanging stone lip + deep water disc
  const wellStep = addPart(
    group,
    new THREE.CylinderGeometry(1.62, 1.72, 0.20, 12),
    PALETTE.stone,
    { outline: false }
  );
  wellStep.position.y = 0.10;

  const base = addPart(
    group,
    new THREE.CylinderGeometry(1.42, 1.54, 0.88, 12),
    PALETTE.stoneDark,
    { outline: true }
  );
  base.position.y = 0.52;

  const lip = addPart(
    group,
    new THREE.CylinderGeometry(1.52, 1.48, 0.16, 12),
    PALETTE.stone,
    { outline: false }
  );
  lip.position.y = 0.98;

  const water = addPart(
    group,
    new THREE.CircleGeometry(1.18, 12).rotateX(-Math.PI / 2),
    PALETTE.waterDeep,
    { unlit: true }
  );
  water.position.y = 0.84;

  // Timber roof posts, crossbeam, windlass roller, rope & bucket
  for (const sx of [-1.25, 1.25]) {
    const post = addPart(
      group,
      new THREE.BoxGeometry(0.22, 2.4, 0.22),
      PALETTE.timber,
      { outline: false }
    );
    post.position.set(sx, 1.6, 0);

    const brace = addPart(
      group,
      new THREE.BoxGeometry(0.14, 0.68, 0.14),
      PALETTE.timberDark,
      { outline: false }
    );
    brace.position.set(sx * 0.82, 2.38, 0);
    brace.rotation.z = sx * 0.55;
  }

  const roller = addPart(
    group,
    new THREE.CylinderGeometry(0.12, 0.12, 2.3, 6).rotateZ(Math.PI / 2),
    PALETTE.timberLight,
    { outline: false }
  );
  roller.position.set(0, 1.92, 0);

  const bucket = addPart(
    group,
    new THREE.CylinderGeometry(0.18, 0.15, 0.34, 6),
    PALETTE.doorWood,
    { outline: false }
  );
  bucket.position.set(0, 1.32, 0);

  const wellRoof = addPart(
    group,
    buildGableRoofGeometry(2.4, 1.7, 0.95, 0.22),
    PALETTE.roofRed,
    { outline: true }
  );
  wellRoof.position.y = 2.7;

  const wellRidge = addPart(
    group,
    new THREE.BoxGeometry(2.9, 0.16, 0.18),
    PALETTE.roofRed,
    { outline: false }
  );
  wellRidge.position.set(0, 3.65, 0);

  // 4 low bollard-and-rail segments with vertical bollards at BOTH ends of every rail
  const arcAngles = [0.72, 2.38, -2.35, -0.74];
  const r = rPlaza - 0.35;
  for (const ang of arcAngles) {
    const segGroup = new THREE.Group();
    segGroup.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    segGroup.rotation.y = -ang + Math.PI * 0.5;

    for (const px of [-1.15, 1.15]) {
      const bollard = addPart(
        segGroup,
        new THREE.BoxGeometry(0.36, 0.86, 0.36),
        PALETTE.stoneDark,
        { outline: true }
      );
      bollard.position.set(px, 0.43, 0);
    }
    for (const ry of [0.32, 0.62]) {
      const rail = addPart(
        segGroup,
        new THREE.BoxGeometry(2.3, 0.12, 0.12),
        PALETTE.timber,
        { outline: false }
      );
      rail.position.set(0, ry, 0);
    }
    group.add(segGroup);
  }

  if (colliders) {
    colliders.push({ type: 'circle', x: 0, z: 0, r: LANDMARKS.well.colliderRadius });
  }
  return group;
}

/* -------------------------------------------------------------------------- */
/* 2. WOODEN PIER, FLUSH STONE ABUTMENT & MOORED BOAT (`MAP-02` clean)        */
/* -------------------------------------------------------------------------- */

function buildWoodenPier() {
  const group = new THREE.Group();
  group.name = 'woodenPier';
  const pier = LANDMARKS.pier;
  const len = Math.abs(pier.xEnd - pier.xStart); // 16.5m (-35.5 -> -52.0)
  const cx = (pier.xStart + pier.xEnd) * 0.5;

  // Solid stone pier abutment / masonry landing at the shore end (x = [-35.5, -31.7], z = 8.5)
  // Top face sits at pier.y + 0.12 (-0.23m), 100% flush with the top of the wooden pier deck!
  const abutW = 3.8;
  const abutH = 2.8;
  const abutment = addPart(
    group,
    new THREE.BoxGeometry(abutW, abutH, pier.width + 0.9),
    PALETTE.stone,
    { outline: true }
  );
  abutment.position.set(pier.xStart + abutW * 0.5, pier.y + 0.12 - abutH * 0.5, pier.z);

  // Landward approach step transitioning smoothly to the West Mill Road
  const roadStep = addPart(
    group,
    new THREE.BoxGeometry(0.95, 1.8, pier.width + 0.5),
    PALETTE.stoneWarm,
    { outline: true }
  );
  roadStep.position.set(pier.xStart + abutW + 0.42, pier.y + 0.24 - 0.9, pier.z);

  for (const sz of [-(pier.width * 0.5 + 0.25), pier.width * 0.5 + 0.25]) {
    const curb = addPart(
      group,
      new THREE.BoxGeometry(abutW - 0.1, 0.38, 0.42),
      PALETTE.stoneDark,
      { outline: false }
    );
    curb.position.set(pier.xStart + abutW * 0.5, pier.y + 0.31, pier.z + sz);
  }

  // Wooden pier deck extending cleanly from xStart (-35.5) to xEnd (-52.0) flush with abutment top
  const deck = addPart(
    group,
    new THREE.BoxGeometry(len, 0.24, pier.width),
    PALETTE.timber,
    { outline: true }
  );
  deck.position.set(cx, pier.y, pier.z);

  // Timber pilings & mooring bollards
  for (let x = pier.xEnd + 0.8; x <= pier.xStart - 0.6; x += 3.1) {
    for (const sz of [-pier.width * 0.44, pier.width * 0.44]) {
      const piling = addPart(
        group,
        new THREE.CylinderGeometry(0.17, 0.17, 2.8, 6, 1, true),
        PALETTE.doorWood,
        { outline: false }
      );
      piling.position.set(x, pier.y - 1.45, pier.z + sz);

      const bollard = addPart(
        group,
        new THREE.CylinderGeometry(0.15, 0.16, 0.42, 6),
        PALETTE.doorWood,
        { outline: false }
      );
      bollard.position.set(x, pier.y + 0.28, pier.z + sz);
    }
  }

  // Warm dock lantern post at the lakeward end of the pier (x = pier.xEnd + 0.8)
  const lampPost = addPart(
    group,
    new THREE.BoxGeometry(0.16, 1.65, 0.16),
    PALETTE.timberDark,
    { outline: false }
  );
  lampPost.position.set(pier.xEnd + 0.8, pier.y + 0.95, pier.z - pier.width * 0.44);

  const dockLantern = addPart(
    group,
    new THREE.BoxGeometry(0.28, 0.34, 0.28),
    PALETTE.lanternGlow,
    { unlit: true }
  );
  dockLantern.position.set(pier.xEnd + 0.8, pier.y + 1.88, pier.z - pier.width * 0.44);

  // Moored wooden boat next to the pier on the southern bay side in full view
  const boatGroup = new THREE.Group();
  boatGroup.position.set(pier.xEnd + 5.8, ZONES.millpond.waterY + 0.16, pier.z + 2.65);
  boatGroup.rotation.y = 0.14;

  addPart(
    boatGroup,
    new THREE.BoxGeometry(3.6, 0.56, 1.55),
    PALETTE.doorWood,
    { outline: true }
  );
  for (const bx of [-0.85, 0.0, 0.85]) {
    const bench = addPart(
      boatGroup,
      new THREE.BoxGeometry(0.32, 0.10, 1.32),
      PALETTE.timberLight,
      { outline: false }
    );
    bench.position.set(bx, 0.28, 0);
  }
  group.add(boatGroup);

  return group;
}

/* -------------------------------------------------------------------------- */
/* 3. EAST WISTERIA COMBAT RING 24-SEGMENT SPLIT-RAIL FENCE                   */
/* -------------------------------------------------------------------------- */

function buildArenaFence() {
  const group = new THREE.Group();
  group.name = 'arenaFence';

  const arena = ZONES.arena;
  const fenceR = arena.fenceR || 19.5;
  const postCount = 24;
  const gateHalfAngle = 0.22;
  const aStart = -Math.PI + gateHalfAngle;
  const aEnd = Math.PI - gateHalfAngle;

  const posts = [];
  for (let i = 0; i <= postCount; i++) {
    const t = i / postCount;
    const a = lerp(aStart, aEnd, t);
    const fx = arena.x + Math.cos(a) * fenceR;
    const fz = arena.z + Math.sin(a) * fenceR;
    const fy = terrainHeightAt(fx, fz);
    posts.push({ x: fx, y: fy, z: fz });

    const isGate = i === 0 || i === postCount;
    const postH = isGate ? 1.75 : 1.28;
    const postW = isGate ? 0.36 : 0.25;
    const post = addPart(
      group,
      new THREE.BoxGeometry(postW, postH, postW),
      PALETTE.timber,
      { outline: isGate }
    );
    post.position.set(fx, fy + postH * 0.5, fz);

    if (isGate) {
      const cap = addPart(
        group,
        new THREE.BoxGeometry(0.48, 0.16, 0.48),
        PALETTE.stoneDark,
        { outline: true }
      );
      cap.position.set(fx, fy + postH + 0.08, fz);

      const lantern = addPart(
        group,
        new THREE.BoxGeometry(0.28, 0.36, 0.28),
        PALETTE.lanternGlow,
        { unlit: true }
      );
      lantern.position.set(fx, fy + postH + 0.34, fz);
    }
  }

  // Every rail spans strictly between post[i] and post[i+1] — zero cantilevered rails!
  for (let i = 0; i < posts.length - 1; i++) {
    const p0 = posts[i];
    const p1 = posts[i + 1];
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const segLen = Math.hypot(dx, dz);
    const mx = (p0.x + p1.x) * 0.5;
    const my = (p0.y + p1.y) * 0.5;
    const mz = (p0.z + p1.z) * 0.5;
    const yaw = Math.atan2(dx, dz);

    for (const ry of [0.46, 0.92]) {
      const rail = addPart(
        group,
        new THREE.BoxGeometry(0.14, 0.14, segLen),
        PALETTE.timber,
        { outline: false }
      );
      rail.position.set(mx, my + ry, mz);
      rail.rotation.y = yaw;
    }
  }

  return group;
}

/* -------------------------------------------------------------------------- */
/* 4. NORTHERN SHRINE OVERLOOK, 56-STEP STAIRCASE & ROMANESQUE ARCH (`MAP-03`)*/
/* -------------------------------------------------------------------------- */

function buildShrineOverlook(colliders) {
  const group = new THREE.Group();
  group.name = 'shrineOverlook';

  // Axial Grand Northern Staircase along x = 0.0 from z = -15.0 (y = 0.0) to z = -71.5 (y = 8.0)
  const stepsCount = 56;
  const zStart = -15.0;
  const zEnd = -71.5;
  const yStart = 0.0;
  const yEnd = ZONES.shrine.y;
  const stepDepth = Math.abs(zEnd - zStart) / stepsCount + 0.12;

  for (let i = 0; i < stepsCount; i++) {
    const t0 = i / stepsCount;
    const t1 = (i + 1) / stepsCount;
    const sz = lerp(zStart, zEnd, (t0 + t1) * 0.5);
    const stepTopY = lerp(yStart, yEnd, t1);
    const stepH = 0.68;
    const step = addPart(
      group,
      new THREE.BoxGeometry(4.32, stepH, stepDepth),
      i % 2 === 0 ? PALETTE.stone : PALETTE.stoneWarm,
      { outline: false }
    );
    step.position.set(0.0, stepTopY - stepH * 0.5, sz);
  }

  // Continuous, flush sloped stone stringers on left (x = -2.35) and right (x = +2.35)
  const stringerGeo = buildSlopedStringerGeometry(0.46, zStart, zEnd, yStart, yEnd);
  for (const sx of [-2.35, 2.35]) {
    const stringer = addPart(group, stringerGeo.clone(), PALETTE.stoneDark, { outline: true });
    stringer.position.x = sx;

    // Bottom entry newel post at z = -15.0 + lantern
    const botPost = addPart(
      group,
      new THREE.BoxGeometry(0.58, 0.72, 0.58),
      PALETTE.stoneDark,
      { outline: true }
    );
    botPost.position.set(sx, yStart + 0.32, zStart + 0.15);

    const botLamp = addPart(
      group,
      new THREE.BoxGeometry(0.24, 0.30, 0.24),
      PALETTE.lanternGlow,
      { unlit: true }
    );
    botLamp.position.set(sx, yStart + 0.82, zStart + 0.15);

    // Top landing newel post at z = -71.5 + lantern
    const topPost = addPart(
      group,
      new THREE.BoxGeometry(0.58, 0.64, 0.58),
      PALETTE.stoneDark,
      { outline: true }
    );
    topPost.position.set(sx, yEnd + 0.24, zEnd - 0.15);

    const topLamp = addPart(
      group,
      new THREE.BoxGeometry(0.24, 0.30, 0.24),
      PALETTE.lanternGlow,
      { unlit: true }
    );
    topLamp.position.set(sx, yEnd + 0.72, zEnd - 0.15);
  }

  const shX = ZONES.shrine.x; // 0.0
  const shZ = ZONES.shrine.z; // -86.0
  const shY = ZONES.shrine.y; // 8.0
  const platR = ZONES.shrine.platformR || 14.5;

  // Circular Shrine Overlook Platform Curb & Inner Medallion Rings
  const platformCurb = addPart(
    group,
    new THREE.CylinderGeometry(platR, platR + 0.4, 0.28, 28),
    PALETTE.stone,
    { outline: false }
  );
  platformCurb.position.set(shX, shY + 0.04, shZ);

  const innerRing = addPart(
    group,
    new THREE.CylinderGeometry(7.8, 7.8, 0.29, 24),
    PALETTE.stoneDark,
    { outline: false }
  );
  innerRing.position.set(shX, shY + 0.05, shZ);

  const goldRing = addPart(
    group,
    new THREE.CylinderGeometry(5.8, 5.8, 0.295, 20),
    PALETTE.shrineStone,
    { outline: false }
  );
  goldRing.position.set(shX, shY + 0.055, shZ);

  // 8-Petal Inlaid Medallion at (0.0, 8.0, -86.0)
  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * Math.PI * 2;
    const diamondGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.30, 4);
    diamondGeo.scale(1.0, 1.0, 2.5);
    const petal = addPart(
      group,
      diamondGeo,
      p % 2 === 0 ? PALETTE.shrineAccent : PALETTE.shrineGold,
      { outline: false }
    );
    petal.position.set(shX + Math.sin(a) * 3.6, shY + 0.06, shZ + Math.cos(a) * 3.6);
    petal.rotation.y = a;
  }

  const centerHub = addPart(
    group,
    new THREE.CylinderGeometry(1.5, 1.5, 0.32, 12),
    PALETTE.stone,
    { outline: false }
  );
  centerHub.position.set(shX, shY + 0.068, shZ);

  // Detailed Romanesque Stone Shrine Arch at (0.0, -93.5, y: 8.0, span: 6.2, height: 5.8)
  const arch = LANDMARKS.shrineArch;
  const pierOffset = arch.span * 0.5; // 3.1m
  for (const sx of [-pierOffset, pierOffset]) {
    const px = arch.x + sx;
    const plinth = addPart(
      group,
      new THREE.BoxGeometry(1.85, 0.72, 1.85),
      PALETTE.stoneDark,
      { outline: false }
    );
    plinth.position.set(px, arch.y + 0.36, arch.z);

    const pier = addPart(
      group,
      new THREE.BoxGeometry(1.38, arch.height, 1.38),
      PALETTE.stone,
      { outline: true }
    );
    pier.position.set(px, arch.y + arch.height * 0.5, arch.z);

    // Staggered Romanesque quoin relief bands along each pier
    for (const qy of [1.4, 2.6, 3.8, 4.9]) {
      const quoin = addPart(
        group,
        new THREE.BoxGeometry(1.52, 0.42, 1.52),
        PALETTE.stoneWarm,
        { outline: false }
      );
      quoin.position.set(px, arch.y + qy, arch.z);
    }

    const capital = addPart(
      group,
      new THREE.BoxGeometry(1.68, 0.42, 1.68),
      PALETTE.stoneDark,
      { outline: true }
    );
    capital.position.set(px, arch.y + arch.height - 0.1, arch.z);

    if (colliders) {
      colliders.push({ type: 'circle', x: px, z: arch.z, r: 0.95 });
    }
  }

  const archCrown = addPart(
    group,
    new THREE.TorusGeometry(pierOffset, 0.64, 6, 16, Math.PI),
    PALETTE.stone,
    { outline: true }
  );
  archCrown.userData.stripBottom = false;
  archCrown.position.set(arch.x, arch.y + arch.height - 0.1, arch.z);

  // Top Romanesque Keystone Crown
  const keystone = addPart(
    group,
    new THREE.BoxGeometry(0.95, 1.15, 1.48),
    PALETTE.stoneDark,
    { outline: true }
  );
  keystone.position.set(arch.x, arch.y + arch.height + pierOffset - 0.05, arch.z);

  // Co-Op Spell Pedestal at (-5.8, -87.8, y: 8.0)
  const pedX = shX - 5.8;
  const pedZ = shZ - 1.8;
  const pedBase = addPart(
    group,
    new THREE.CylinderGeometry(0.95, 1.15, 1.25, 8),
    PALETTE.stoneDark,
    { outline: true }
  );
  pedBase.position.set(pedX, arch.y + 0.62, pedZ);

  const pedTable = addPart(
    group,
    new THREE.BoxGeometry(1.08, 0.18, 1.08),
    PALETTE.stone,
    { outline: false }
  );
  pedTable.position.set(pedX, arch.y + 1.32, pedZ);

  const pedCrystal = addPart(
    group,
    new THREE.OctahedronGeometry(0.32, 0),
    0x7ceeff,
    { unlit: true }
  );
  pedCrystal.userData.stripBottom = false;
  pedCrystal.position.set(pedX, arch.y + 1.88, pedZ);
  pedCrystal.scale.set(0.75, 1.35, 0.75);

  if (colliders) {
    colliders.push({ type: 'circle', x: pedX, z: pedZ, r: 1.1 });
  }

  // Raised circular stone planter rings with dark soil for the 2 Shrine guardian blossom trees
  // ((±10.6, -90.8, y: 8.0) -> MAP-03 clean!)
  for (const t of TREES) {
    if (!t.hasPlanter) continue;
    const ty = terrainHeightAt(t.x, t.z);
    const planterRim = addPart(
      group,
      new THREE.CylinderGeometry(1.78, 1.92, 0.56, 12),
      PALETTE.stoneDark,
      { outline: true }
    );
    planterRim.position.set(t.x, ty + 0.28, t.z);

    const planterSoil = addPart(
      group,
      new THREE.CylinderGeometry(1.48, 1.48, 0.60, 12),
      0x5c4028,
      { unlit: true }
    );
    planterSoil.position.set(t.x, ty + 0.29, t.z);
  }

  return group;
}

/* -------------------------------------------------------------------------- */
/* 5. 24 STONE BOUNDARY WAYMARKERS AT `PLAY_BOUNDARY_RADIUS = 125m`           */
/* -------------------------------------------------------------------------- */

function buildBoundaryMarkers() {
  const group = new THREE.Group();
  group.name = 'boundaryMarkers';

  const markerCount = 24;
  for (let i = 0; i < markerCount; i++) {
    const a = (i / markerCount) * Math.PI * 2;
    const bx = Math.cos(a) * PLAY_BOUNDARY_RADIUS;
    const bz = Math.sin(a) * PLAY_BOUNDARY_RADIUS;
    if (bz > 90 && Math.abs(bx) < 6.0) continue;
    const by = terrainHeightAt(bx, bz);
    if (by < ZONES.millpond.waterY + 0.2) continue;

    const pillar = new THREE.Group();
    pillar.position.set(bx, by, bz);
    pillar.rotation.y = -a + Math.PI * 0.5;

    const base = addPart(
      pillar,
      new THREE.BoxGeometry(0.85, 0.45, 0.85),
      PALETTE.stoneDark,
      { outline: false }
    );
    base.position.y = 0.22;

    const shaft = addPart(
      pillar,
      new THREE.BoxGeometry(0.54, 1.85, 0.54),
      PALETTE.stone,
      { outline: true }
    );
    shaft.position.y = 1.15;

    const cap = addPart(
      pillar,
      new THREE.BoxGeometry(0.92, 0.28, 0.92),
      PALETTE.stoneDark,
      { outline: false }
    );
    cap.position.y = 2.15;

    const rune = addPart(
      pillar,
      new THREE.BoxGeometry(0.28, 0.34, 0.28),
      PALETTE.lanternGlow,
      { unlit: true }
    );
    rune.position.y = 2.42;

    group.add(pillar);
  }

  return group;
}

/* -------------------------------------------------------------------------- */
/* 6. TUDOR VILLAGE COTTAGES & ROTATING WATERWHEEL (`v7` coordinates)         */
/* -------------------------------------------------------------------------- */

function addWindowUnit(group, x, y, z, rotY = 0, w = 1.12, h = 1.38) {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.y = rotY;

  addPart(holder, new THREE.BoxGeometry(w, h, 0.12), PALETTE.windowBlue, {
    outline: false,
    unlit: true,
  });

  for (const shSide of [-(w * 0.5 + 0.15), w * 0.5 + 0.15]) {
    const shutter = addPart(
      holder,
      new THREE.BoxGeometry(0.24, h - 0.04, 0.14),
      PALETTE.timber,
      { outline: false }
    );
    shutter.position.set(shSide, 0, 0.02);
  }

  const sill = addPart(
    holder,
    new THREE.BoxGeometry(w + 0.34, 0.22, 0.32),
    PALETTE.timber,
    { outline: false }
  );
  sill.position.set(0, -h * 0.5 - 0.08, 0.10);

  group.add(holder);
}

function buildTudorHouse(b, colliders) {
  const group = new THREE.Group();
  group.name = `building-${b.id}`;
  group.position.set(b.x, b.y, b.z);
  group.rotation.y = b.rotY;

  const plinthH = b.id === 'watermill' ? 3.8 : 2.25;
  const plinth = addPart(
    group,
    new THREE.BoxGeometry(b.w + 0.36, plinthH, b.d + 0.36),
    PALETTE.stone,
    { outline: false }
  );
  plinth.position.y = 0.55 - plinthH * 0.5;

  const body = addPart(
    group,
    new THREE.BoxGeometry(b.w, b.wallH, b.d),
    PALETTE.stucco,
    { outline: true }
  );
  body.position.y = 0.55 + b.wallH * 0.5;

  const gableFill = addPart(
    group,
    buildGableRoofGeometry(b.w - 0.1, b.d - 0.1, b.roofH - 0.08, 0.0),
    PALETTE.stucco,
    { outline: false }
  );
  gableFill.position.y = 0.55 + b.wallH;

  // Timber frame posts on all 4 corners + side gable king-post studs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = addPart(
        group,
        new THREE.BoxGeometry(0.24, b.wallH + 0.05, 0.24),
        PALETTE.timber,
        { outline: false }
      );
      post.position.set(sx * (b.w * 0.5), 0.55 + b.wallH * 0.5, sz * (b.d * 0.5));

      const brace = addPart(
        group,
        new THREE.BoxGeometry(0.16, 1.8, 0.14),
        PALETTE.timber,
        { outline: false }
      );
      brace.position.set(
        sx * (b.w * 0.42),
        0.55 + b.wallH - 0.85,
        sz * (b.d * 0.5 + 0.03)
      );
      brace.rotation.z = sx * 0.55;
    }
    const sideStud = addPart(
      group,
      new THREE.BoxGeometry(0.14, b.wallH + b.roofH - 0.3, 0.22),
      PALETTE.timber,
      { outline: false }
    );
    sideStud.position.set(
      sx * (b.w * 0.5 + 0.02),
      0.55 + (b.wallH + b.roofH - 0.3) * 0.5,
      0
    );
  }

  const beltBeam = addPart(
    group,
    new THREE.BoxGeometry(b.w + 0.16, 0.24, b.d + 0.16),
    PALETTE.timber,
    { outline: false }
  );
  beltBeam.position.y = 0.55 + b.wallH * 0.52;

  const roof = addPart(
    group,
    buildGableRoofGeometry(b.w, b.d, b.roofH, 0.42),
    b.roofColor,
    { outline: true }
  );
  roof.position.y = 0.55 + b.wallH;

  const ridgeBeam = addPart(
    group,
    new THREE.BoxGeometry(b.w + 0.9, 0.22, 0.24),
    b.roofColor,
    { outline: false }
  );
  ridgeBeam.position.set(0, 0.55 + b.wallH + b.roofH, 0);

  if (b.crossGable) {
    const cgW = b.w * 0.46;
    const cgDepth = b.d * 0.54;
    const cgRise = b.roofH * 0.96;

    const cgFill = addPart(
      group,
      buildGableRoofGeometry(cgDepth - 0.08, cgW - 0.12, cgRise - 0.06, 0.0),
      PALETTE.stucco,
      { outline: false }
    );
    cgFill.rotation.y = Math.PI * 0.5;
    cgFill.position.set(0, 0.55 + b.wallH, b.d * 0.5 - cgDepth * 0.48);

    const cgRoof = addPart(
      group,
      buildGableRoofGeometry(cgDepth, cgW, cgRise, 0.28),
      b.roofColor,
      { outline: true }
    );
    cgRoof.rotation.y = Math.PI * 0.5;
    cgRoof.position.set(0, 0.55 + b.wallH, b.d * 0.5 - cgDepth * 0.48);

    addWindowUnit(
      group,
      0,
      0.55 + b.wallH + cgRise * 0.38,
      b.d * 0.5 + 0.05,
      0,
      0.92,
      1.05
    );
  }

  if (b.dormer && !b.crossGable) {
    const dx = 0.85;
    const dy = 0.55 + b.wallH + b.roofH * 0.26;
    const dz = b.d * 0.28;
    const dBox = addPart(
      group,
      new THREE.BoxGeometry(1.25, 0.82, 1.15),
      PALETTE.stucco,
      { outline: false }
    );
    dBox.position.set(dx, dy, dz);

    const dRoof = addPart(
      group,
      buildGableRoofGeometry(1.22, 1.25, 0.44, 0.16),
      b.roofColor,
      { outline: true }
    );
    dRoof.rotation.y = Math.PI * 0.5;
    dRoof.position.set(dx, dy + 0.41, dz);

    const dWin = addPart(
      group,
      new THREE.BoxGeometry(0.68, 0.54, 0.14),
      PALETTE.windowBlue,
      { unlit: true }
    );
    dWin.position.set(dx, dy + 0.02, dz + 0.58);
  }

  if (b.chimneySide !== 0) {
    const chW = b.heavyForge ? 1.15 : 0.92;
    const chH = b.wallH + b.roofH + (b.heavyForge ? 1.35 : 1.05);
    const chX = b.chimneySide * (b.w * 0.34);
    const chZ = -b.d * 0.22;
    const topY = 0.55 + chH;

    const chimney = addPart(
      group,
      new THREE.BoxGeometry(chW, chH, chW),
      PALETTE.stoneDark,
      { outline: true }
    );
    chimney.position.set(chX, 0.55 + chH * 0.5, chZ);

    const collar = addPart(
      group,
      new THREE.BoxGeometry(chW + 0.22, 0.18, chW + 0.22),
      PALETTE.stone,
      { outline: false }
    );
    collar.position.set(chX, topY - 0.28, chZ);

    const cap = addPart(
      group,
      new THREE.BoxGeometry(chW + 0.32, 0.22, chW + 0.32),
      PALETTE.stone,
      { outline: false }
    );
    cap.position.set(chX, topY + 0.08, chZ);

    const fluePot = addPart(
      group,
      new THREE.CylinderGeometry(0.20, 0.25, 0.36, 6),
      0x3a3d45,
      { outline: false }
    );
    fluePot.position.set(chX, topY + 0.34, chZ);
  }

  const doorFrontZ = b.d * 0.5;
  if (b.awning === 'front_porch') {
    const porchRoof = addPart(
      group,
      new THREE.BoxGeometry(4.2, 0.22, 2.2),
      b.roofColor,
      { outline: true }
    );
    porchRoof.position.set(0, 3.35, doorFrontZ + 0.95);
    porchRoof.rotation.x = 0.22;
    for (const px of [-1.75, 1.75]) {
      const pPost = addPart(
        group,
        new THREE.BoxGeometry(0.22, 3.15, 0.22),
        PALETTE.timber,
        { outline: false }
      );
      pPost.position.set(px, 1.52, doorFrontZ + 1.75);
    }
    const tx = -3.55;
    const tz = doorFrontZ + 1.35;
    const tableTop = addPart(
      group,
      new THREE.BoxGeometry(1.75, 0.12, 0.95),
      PALETTE.timber,
      { outline: false }
    );
    tableTop.position.set(tx, 0.76, tz);
    for (const lx of [-0.72, 0.72]) {
      for (const lz of [-0.36, 0.36]) {
        const leg = addPart(
          group,
          new THREE.BoxGeometry(0.12, 0.75, 0.12),
          PALETTE.doorWood,
          { outline: false }
        );
        leg.position.set(tx + lx, 0.38, tz + lz);
      }
    }
    for (const bz of [-0.72, 0.72]) {
      const bench = addPart(
        group,
        new THREE.BoxGeometry(1.6, 0.42, 0.32),
        PALETTE.timber,
        { outline: false }
      );
      bench.position.set(tx, 0.21, tz + bz);
    }
  } else if (b.awning === 'side_greenhouse') {
    const ghW = 2.4;
    const ghD = b.d * 0.68;
    const ghX = -b.w * 0.5 - ghW * 0.5 + 0.05;
    const ghPlinth = addPart(
      group,
      new THREE.BoxGeometry(ghW, 0.65, ghD),
      PALETTE.stone,
      { outline: false }
    );
    ghPlinth.position.set(ghX, 0.32, 0);

    const ghGlass = addPart(
      group,
      new THREE.BoxGeometry(ghW - 0.12, 2.1, ghD - 0.12),
      PALETTE.glassTint,
      { unlit: true }
    );
    ghGlass.position.set(ghX, 1.65, 0);

    for (const gz of [-ghD * 0.48, 0, ghD * 0.48]) {
      const mullion = addPart(
        group,
        new THREE.BoxGeometry(0.16, 2.15, 0.16),
        PALETTE.timber,
        { outline: false }
      );
      mullion.position.set(ghX - ghW * 0.48, 1.65, gz);
    }
    const ghRoof = addPart(
      group,
      new THREE.BoxGeometry(ghW + 0.3, 0.16, ghD + 0.3),
      PALETTE.timber,
      { outline: true }
    );
    ghRoof.position.set(ghX, 2.82, 0);
    ghRoof.rotation.z = 0.22;
  } else if (b.awning === 'forge_shed') {
    const shedRoof = addPart(
      group,
      new THREE.BoxGeometry(3.6, 0.22, 4.4),
      b.roofColor,
      { outline: true }
    );
    shedRoof.position.set(b.w * 0.5 + 1.6, 3.3, 0.5);
    shedRoof.rotation.z = -0.26;
    for (const sz of [-1.4, 2.2]) {
      const sPost = addPart(
        group,
        new THREE.BoxGeometry(0.22, 3.0, 0.22),
        PALETTE.timber,
        { outline: false }
      );
      sPost.position.set(b.w * 0.5 + 3.1, 1.5, sz);
    }
    const hearth = addPart(
      group,
      new THREE.BoxGeometry(1.5, 1.2, 1.5),
      PALETTE.stoneDark,
      { outline: false }
    );
    hearth.position.set(b.w * 0.5 + 0.9, 0.6, -0.5);
    const coals = addPart(
      group,
      new THREE.BoxGeometry(0.9, 0.25, 0.9),
      PALETTE.emberGlow,
      { unlit: true }
    );
    coals.position.set(b.w * 0.5 + 0.9, 1.22, -0.5);
    const anvil = addPart(
      group,
      new THREE.BoxGeometry(0.85, 0.75, 0.45),
      0x3a3d45,
      { outline: false }
    );
    anvil.position.set(b.w * 0.5 + 2.1, 0.38, 0.8);
  } else if (b.awning === 'front_hood') {
    const hood = addPart(
      group,
      buildGableRoofGeometry(1.2, 2.2, 0.58, 0.18),
      b.roofColor,
      { outline: true }
    );
    hood.rotation.y = Math.PI * 0.5;
    hood.position.set(0, 3.05, doorFrontZ + 0.45);
  }

  const doorArch = addPart(
    group,
    new THREE.BoxGeometry(1.75, 2.65, 0.22),
    PALETTE.stoneDark,
    { outline: false }
  );
  doorArch.position.set(0, 0.55 + 1.32, doorFrontZ);

  const doorPanel = addPart(
    group,
    new THREE.BoxGeometry(1.35, 2.35, 0.26),
    PALETTE.doorWood,
    { outline: false }
  );
  doorPanel.position.set(0, 0.55 + 1.18, doorFrontZ + 0.02);

  for (let s = 0; s < 2; s++) {
    const step = addPart(
      group,
      new THREE.BoxGeometry(2.3 - s * 0.22, 0.75, 0.68),
      PALETTE.stone,
      { outline: false }
    );
    step.position.set(0, (1 - s) * 0.24 - 0.12, doorFrontZ + 0.42 + s * 0.48);
  }

  for (const sx of [-1.25, 1.25]) {
    const lantern = addPart(
      group,
      new THREE.BoxGeometry(0.24, 0.34, 0.24),
      PALETTE.lanternGlow,
      { unlit: true }
    );
    lantern.position.set(sx, 2.45, doorFrontZ + 0.22);
  }

  // Windows on all 4 elevations
  const fZ = b.d * 0.5 + 0.04;
  for (const sx of [-b.w * 0.31, b.w * 0.31]) {
    addWindowUnit(group, sx, 2.15, fZ, 0);
    addWindowUnit(group, sx, 2.15, -fZ, Math.PI);
    if (b.stories >= 1.5) {
      addWindowUnit(group, sx, 4.15, fZ, 0, 1.0, 1.2);
      addWindowUnit(group, sx, 4.15, -fZ, Math.PI, 1.0, 1.2);
    }
  }

  for (const side of [-1, 1]) {
    if (side === -1 && (b.awning === 'side_greenhouse' || b.hasWaterwheel)) continue;
    if (side === 1 && b.awning === 'forge_shed') continue;
    const sX = side * (b.w * 0.5 + 0.04);
    const rotY = side * Math.PI * 0.5;
    addWindowUnit(group, sX, 2.35, 0, rotY, 1.05, 1.3);
    if (b.stories >= 1.5) {
      addWindowUnit(group, sX, 4.55, 0, rotY, 0.92, 1.15);
    }
  }

  // Kitchen garden patch on Gardener's +X side (ox: +6.6, oz: 0)
  if (b.gardenPatch) {
    const gp = b.gardenPatch;
    const sideSign = Math.sign(gp.ox) || 1;
    for (let row = -1; row <= 1; row++) {
      const bed = addPart(
        group,
        new THREE.BoxGeometry(0.95, 0.24, gp.d * 0.78),
        0x6b4c32,
        { unlit: true }
      );
      bed.position.set(gp.ox + row * 1.25, 0.12, gp.oz);
      for (let c = -2; c <= 2; c++) {
        const cabbage = addPart(
          group,
          new THREE.OctahedronGeometry(0.26, 0),
          PALETTE.leafLight,
          { outline: false }
        );
        cabbage.position.set(gp.ox + row * 1.25, 0.34, gp.oz + c * 0.92);
      }
    }
    const wallBack = addPart(
      group,
      new THREE.BoxGeometry(gp.w + 0.4, 0.82, 0.42),
      PALETTE.stone,
      { outline: false }
    );
    wallBack.position.set(gp.ox, 0.41, gp.oz - gp.d * 0.5);

    const wallOuter = addPart(
      group,
      new THREE.BoxGeometry(0.42, 0.82, gp.d + 0.4),
      PALETTE.stone,
      { outline: false }
    );
    wallOuter.position.set(gp.ox + sideSign * (gp.w * 0.5), 0.41, gp.oz);

    const wallFront = addPart(
      group,
      new THREE.BoxGeometry(gp.w + 0.4, 0.82, 0.42),
      PALETTE.stone,
      { outline: false }
    );
    wallFront.position.set(gp.ox, 0.41, gp.oz + gp.d * 0.5);
  }

  if (colliders) {
    colliders.push({
      type: 'obb',
      x: b.x,
      z: b.z,
      hx: b.w * 0.5 + b.colliderPad,
      hz: b.d * 0.5 + b.colliderPad,
      rotY: b.rotY,
    });
  }

  return group;
}

function buildRotatingWaterwheel(millB, gradientMap) {
  const wheelWorld = new THREE.Group();
  wheelWorld.name = 'waterwheel-world';
  wheelWorld.position.set(millB.x, millB.y, millB.z);
  wheelWorld.rotation.y = millB.rotY;

  const rawWheel = new THREE.Group();
  const rim = addPart(
    rawWheel,
    new THREE.TorusGeometry(2.45, 0.18, 6, 18),
    PALETTE.timber,
    { outline: true }
  );
  rim.rotation.y = Math.PI * 0.5;

  for (let p = 0; p < 12; p++) {
    const ang = (p / 12) * Math.PI * 2;
    const paddle = addPart(
      rawWheel,
      new THREE.BoxGeometry(0.84, 0.16, 0.62),
      PALETTE.doorWood,
      { outline: false }
    );
    paddle.position.set(0, Math.cos(ang) * 2.45, Math.sin(ang) * 2.45);
    paddle.rotation.x = ang;

    if (p < 6) {
      const spoke = addPart(
        rawWheel,
        new THREE.BoxGeometry(0.18, 4.85, 0.18),
        PALETTE.timber,
        { outline: false }
      );
      spoke.rotation.x = ang;
    }
  }

  const batchedWheel = batchVertexColorGroup(rawWheel, {
    gradientMap,
    outlineThickness: 0.018,
    stripBottom: false,
  });
  // Hub at ly = 0.85 (world y = 1.15m); with radius 2.55m, bottom paddles reach y = -1.50m (submerged in -1.20m water!)
  batchedWheel.position.set(-millB.w * 0.5 - 0.72, 0.85, 0);
  wheelWorld.add(batchedWheel);

  return {
    group: wheelWorld,
    wheelRotor: batchedWheel,
  };
}

export function buildLandmarks(opts = {}) {
  const gradientMap = makeToonGradient();
  const root = new THREE.Group();
  root.name = 'landmarks';
  const colliders = opts.colliders || [];

  const staticRaw = new THREE.Group();
  staticRaw.name = 'static-landmarks';

  staticRaw.add(buildWellPlaza(colliders));
  staticRaw.add(buildWoodenPier());
  staticRaw.add(buildArenaFence());
  staticRaw.add(buildShrineOverlook(colliders));
  staticRaw.add(buildBoundaryMarkers());

  if (opts.includeBuildings !== false) {
    for (const b of BUILDINGS) {
      staticRaw.add(buildTudorHouse(b, colliders));
    }
  }

  // Merge all static landmark masonry/timber into 3 draw calls (toon, unlit, outline)
  const batchedStatic = batchVertexColorGroup(staticRaw, {
    gradientMap,
    flatShading: false,
    outlineThickness: 0.02,
    castShadow: true,
    receiveShadow: true,
  });
  root.add(batchedStatic);

  let waterwheel = null;
  if (opts.includeBuildings !== false) {
    const millB = BUILDINGS.find((b) => b.id === 'watermill');
    waterwheel = buildRotatingWaterwheel(millB, gradientMap);
    root.add(waterwheel.group);
  }

  return {
    group: root,
    colliders,
    waterwheel: waterwheel ? waterwheel.wheelRotor : null,
    update(dt, _elapsed) {
      if (waterwheel) waterwheel.wheelRotor.rotation.x -= dt * 1.35;
    },
  };
}
