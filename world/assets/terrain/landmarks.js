import * as THREE from 'three';
import {
  PLAY_BOUNDARY_RADIUS,
  ZONES,
  BUILDINGS,
  LANDMARKS,
  TREES,
  INSCRIPTION_STONES,
  BOULDERS,
  DRY_STONE_WALLS,
  ROADSIDE_FENCES,
  terrainHeightAt,
  clamp,
  lerp,
  smoothstep,
  hash2,
} from './geography.js';
import {
  PALETTE,
  makeToonGradient,
  batchVertexColorGroup,
} from './terrain-water.js';

/**
 * Merged Wave 1C Landmarks, Chiseled Limestone Boulders, Dry-Stone Country Walls,
 * Split-Rail Timber Fences, Sacred Inscription Stones & Deep-Water Shoreline Colliders
 * (`world/assets/terrain/landmarks.js`).
 *
 * Merges all static masonry, chiseled limestone boulders, dry-stone walls, split-rail fences,
 * and timber structures into `batchVertexColorGroup` so the entire module costs <= 4 draw calls total!
 */

function addPart(parent, geo, color, { outline = false, unlit = false, flatShading = false } = {}) {
  const mesh = new THREE.Mesh(geo);
  if (color !== null && color !== undefined) mesh.userData.color = color;
  mesh.userData.outline = outline;
  mesh.userData.unlit = unlit;
  if (flatShading) mesh.userData.flatShading = true;
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

  const plazaCurbRing = addPart(
    group,
    new THREE.RingGeometry(rPlaza - 0.38, rPlaza + 0.16, 32).rotateX(-Math.PI / 2),
    PALETTE.stone,
    { outline: false }
  );
  plazaCurbRing.position.y = 0.016;

  const innerRing = addPart(
    group,
    new THREE.RingGeometry(2.85, 3.22, 24).rotateX(-Math.PI / 2),
    PALETTE.stoneWarm,
    { outline: false }
  );
  innerRing.position.y = 0.018;

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
    colliders.push({ type: 'circle', x: 0, z: 0, r: LANDMARKS.well.colliderRadius, tag: 'well' });
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
  const shoreX = pier.xStart + 1.85; // -33.65 (squarely on the dry cobblestone bank)
  const len = Math.abs(pier.xEnd - shoreX); // 18.35m (-33.65 -> -52.0)
  const cx = (shoreX + pier.xEnd) * 0.5;

  const sillW = 1.65;
  const sillH = 1.45;
  const sill = addPart(
    group,
    new THREE.BoxGeometry(sillW, sillH, pier.width + 0.24),
    PALETTE.stoneWarm,
    { outline: false }
  );
  sill.position.set(shoreX + 0.15, pier.y + 0.08 - sillH * 0.5, pier.z);

  const stepBeam = addPart(
    group,
    new THREE.BoxGeometry(0.62, 0.22, pier.width + 0.16),
    PALETTE.dirtRoad,
    { outline: false }
  );
  stepBeam.position.set(shoreX + 0.30, pier.y + 0.02, pier.z);

  for (const sz of [-(pier.width * 0.5 + 0.16), pier.width * 0.5 + 0.16]) {
    const curb = addPart(
      group,
      new THREE.BoxGeometry(1.55, 0.26, 0.32),
      PALETTE.stoneDark,
      { outline: false }
    );
    curb.position.set(shoreX - 0.15, pier.y + 0.18, pier.z + sz);

    const timberCap = addPart(
      group,
      new THREE.BoxGeometry(1.62, 0.08, 0.36),
      PALETTE.timberDark,
      { outline: false }
    );
    timberCap.position.set(shoreX - 0.15, pier.y + 0.34, pier.z + sz);

    const shorePost = addPart(
      group,
      new THREE.CylinderGeometry(0.16, 0.17, 0.54, 6),
      PALETTE.doorWood,
      { outline: false }
    );
    shorePost.position.set(shoreX + 0.42, pier.y + 0.44, pier.z + sz);
  }

  const deck = addPart(
    group,
    new THREE.BoxGeometry(len, 0.24, pier.width),
    PALETTE.timber,
    { outline: true }
  );
  deck.position.set(cx, pier.y, pier.z);

  for (const sz of [-pier.width * 0.47, pier.width * 0.47]) {
    const edgeBeam = addPart(
      group,
      new THREE.BoxGeometry(len - 0.1, 0.08, 0.16),
      PALETTE.timberDark,
      { outline: false }
    );
    edgeBeam.position.set(cx, pier.y + 0.14, pier.z + sz);
  }

  for (let x = pier.xEnd + 0.8; x <= shoreX - 1.2; x += 3.1) {
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

  const boatGroup = new THREE.Group();
  boatGroup.position.set(pier.xEnd + 5.8, ZONES.millpond.waterY + 0.14, pier.z + 2.65);
  boatGroup.rotation.y = 0.14;

  const hullGeo = new THREE.CylinderGeometry(0.88, 0.68, 3.8, 6, 1, false);
  hullGeo.rotateZ(Math.PI * 0.5);
  hullGeo.scale(1.0, 0.42, 0.88);
  addPart(boatGroup, hullGeo, PALETTE.doorWood, { outline: true });

  const innerFloor = addPart(
    boatGroup,
    new THREE.BoxGeometry(2.65, 0.08, 1.12),
    PALETTE.timberDark,
    { outline: false }
  );
  innerFloor.position.y = 0.16;

  for (const bx of [-0.85, 0.0, 0.85]) {
    const bench = addPart(
      boatGroup,
      new THREE.BoxGeometry(0.32, 0.10, 1.28),
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

function buildArenaFence(colliders) {
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

    if (colliders) {
      colliders.push({
        type: 'obb',
        x: mx,
        z: mz,
        hx: 0.22,
        hz: segLen * 0.5,
        rotY: yaw,
        tag: 'arena_fence',
      });
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

  const stepsCount = 56;
  const zStart = -18.0;
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

  const stringerGeo = buildSlopedStringerGeometry(0.46, zStart, zEnd, yStart, yEnd);
  for (const sx of [-2.35, 2.35]) {
    const stringer = addPart(group, stringerGeo.clone(), PALETTE.stoneDark, { outline: true });
    stringer.position.x = sx;

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

  const shX = ZONES.shrine.x;
  const shZ = ZONES.shrine.z;
  const shY = ZONES.shrine.y;
  const platR = ZONES.shrine.platformR || 14.5;

  const retainingWall = addPart(
    group,
    new THREE.CylinderGeometry(platR + 0.08, platR + 0.48, 0.56, 36, 1, true),
    PALETTE.stoneDark,
    { outline: false }
  );
  retainingWall.position.set(shX, shY - 0.27, shZ);

  const platformCurbRing = addPart(
    group,
    new THREE.RingGeometry(platR - 0.42, platR + 0.12, 36).rotateX(-Math.PI / 2),
    PALETTE.stone,
    { outline: false }
  );
  platformCurbRing.position.set(shX, shY + 0.014, shZ);

  const innerRing = addPart(
    group,
    new THREE.RingGeometry(5.65, 6.25, 28).rotateX(-Math.PI / 2),
    PALETTE.stoneDark,
    { outline: false }
  );
  innerRing.position.set(shX, shY + 0.015, shZ);

  const goldRing = addPart(
    group,
    new THREE.CircleGeometry(5.68, 24).rotateX(-Math.PI / 2),
    PALETTE.shrineStone,
    { outline: false }
  );
  goldRing.position.set(shX, shY + 0.016, shZ);

  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * Math.PI * 2;
    const diamondGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.03, 4);
    diamondGeo.scale(1.0, 1.0, 2.5);
    const petal = addPart(
      group,
      diamondGeo,
      p % 2 === 0 ? PALETTE.shrineAccent : PALETTE.shrineGold,
      { outline: false }
    );
    petal.position.set(shX + Math.sin(a) * 3.6, shY + 0.012, shZ + Math.cos(a) * 3.6);
    petal.rotation.y = a;
  }

  const centerHub = addPart(
    group,
    new THREE.CylinderGeometry(1.5, 1.5, 0.04, 12),
    PALETTE.stone,
    { outline: false }
  );
  centerHub.position.set(shX, shY + 0.016, shZ);

  const arch = LANDMARKS.shrineArch;
  const pierOffset = arch.span * 0.5;
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
      colliders.push({ type: 'circle', x: px, z: arch.z, r: 0.95, tag: 'shrine_arch' });
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

  const keystone = addPart(
    group,
    new THREE.BoxGeometry(0.95, 1.15, 1.48),
    PALETTE.stoneDark,
    { outline: true }
  );
  keystone.position.set(arch.x, arch.y + arch.height + pierOffset - 0.05, arch.z);

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
    colliders.push({ type: 'circle', x: pedX, z: pedZ, r: 1.1, tag: 'shrine_pedestal' });
  }

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
/* 5. CHISELED GHIBLI LIMESTONE BOULDERS (`52` multi-faceted boulders)        */
/* -------------------------------------------------------------------------- */

const COL_MOSS_TOP = new THREE.Color(0x62a442);
const COL_MOSS_SUN = new THREE.Color(0x7ec254);
const COL_LIME_SUN = new THREE.Color(0xdfd7c6);
const COL_LIME_MID = new THREE.Color(0xb5ada0);
const COL_LIME_SHD = new THREE.Color(0x7d776e);
const SUN_VEC = new THREE.Vector3(-48, 76, 58).normalize();

/**
 * Sculpts a chiseled, multi-faceted 3D Ghibli limestone boulder (matching `01-title.png`)
 * with flat-shaded angular facets and baked vertex colors:
 * - Lush meadow moss `#62a442` on upward-facing top normals (`ny > 0.55`)
 * - Warm sunlit chiseled limestone `#dfd7c6` / `#b5ada0` on side facets
 * - Cool slate shadow `#7d776e` near the base and shaded facets
 */
function buildChiseledBoulderGeometry({ rx = 1.4, ry = 1.0, rz = 1.2, rotY = 0, mossy = true, seed = 1 }) {
  const rawIco = new THREE.IcosahedronGeometry(1.0, 1);
  const baseGeo = rawIco.index ? rawIco.toNonIndexed() : rawIco;
  const pos = baseGeo.attributes.position;

  // Group coincidental vertices so chiseled plane displacement never tears seams
  const vMap = new Map();
  const c1x = Math.cos(seed * 1.7);
  const c1z = Math.sin(seed * 1.7);
  const c2x = Math.cos(seed * 3.1 + 1.2);
  const c2z = Math.sin(seed * 3.1 + 1.2);

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const key = `${Math.round(vx * 1000)},${Math.round(vy * 1000)},${Math.round(vz * 1000)}`;
    let disp = vMap.get(key);
    if (!disp) {
      const h = hash2(Math.round(vx * 37 + seed * 13), Math.round(vz * 43 + vy * 29), seed + 71);
      // Chiseled flat-top & beveled side planes matching 01-title.png limestone rocks
      let nx = vx * (0.88 + 0.24 * h);
      let ny = vy;
      let nz = vz * (0.88 + 0.24 * (1.0 - h));

      // Flatten top crown slightly into a chiseled limestone table facet
      if (ny > 0.52) {
        ny = 0.52 + (ny - 0.52) * 0.45;
      }
      // Flatten bottom skirt so boulder sits solidly in the earth
      if (ny < -0.45) {
        ny = -0.52;
        nx *= 1.08;
        nz *= 1.08;
      }
      // Chisel two angular side planes
      const dPlane1 = nx * c1x + nz * c1z;
      if (dPlane1 > 0.62) {
        const pull = (dPlane1 - 0.62) * 0.48;
        nx -= c1x * pull;
        nz -= c1z * pull;
      }
      const dPlane2 = nx * c2x + nz * c2z;
      if (dPlane2 < -0.60) {
        const pull = (-0.60 - dPlane2) * 0.45;
        nx += c2x * pull;
        nz += c2z * pull;
      }

      disp = [nx * rx, (ny + 0.36) * ry, nz * rz];
      vMap.set(key, disp);
    }
    pos.setXYZ(i, disp[0], disp[1], disp[2]);
  }

  if (rotY !== 0) {
    baseGeo.rotateY(rotY);
  }
  baseGeo.computeVertexNormals();

  const norm = baseGeo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const tmpCol = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const vy = pos.getY(i);
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);

    const hFrac = clamp(vy / (ry * 1.15), 0, 1);
    const sunDot = clamp((nx * SUN_VEC.x + ny * SUN_VEC.y + nz * SUN_VEC.z) * 0.5 + 0.5, 0, 1);

    // Base limestone facet color: cool slate base -> mid limestone -> warm sunlit limestone
    tmpCol
      .copy(COL_LIME_SHD)
      .lerp(COL_LIME_MID, smoothstep(0.12, 0.55, hFrac * 0.55 + sunDot * 0.45))
      .lerp(COL_LIME_SUN, smoothstep(0.52, 0.88, sunDot) * smoothstep(0.20, 0.65, hFrac));

    // Upward-facing top normals (ny > 0.55) receive lush meadow moss cap
    if (mossy && ny > 0.55 && hFrac > 0.38) {
      const mossMask = smoothstep(0.55, 0.72, ny);
      const mossTone = COL_MOSS_TOP.clone().lerp(COL_MOSS_SUN, smoothstep(0.65, 0.92, sunDot));
      tmpCol.lerp(mossTone, mossMask);
    }

    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }

  baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return baseGeo;
}

function buildLimestoneBoulders(colliders) {
  const group = new THREE.Group();
  group.name = 'limestoneBoulders';

  BOULDERS.forEach((b, idx) => {
    const by = terrainHeightAt(b.x, b.z);
    const geo = buildChiseledBoulderGeometry({
      rx: b.rx,
      ry: b.ry,
      rz: b.rz,
      rotY: b.rotY || 0,
      mossy: b.mossy !== false,
      seed: 401 + idx * 37,
    });
    const mesh = addPart(group, geo, null, {
      outline: false,
      flatShading: true,
    });
    mesh.position.set(b.x, by - 0.14 * b.ry, b.z);

    // Add a smaller companion chiseled stone beside hero boulders for natural Ghibli grouping
    if (idx % 2 === 0 && b.rx >= 1.35) {
      const compAng = (b.rotY || 0) + 1.05;
      const compDist = b.rx * 0.92;
      const cx = b.x + Math.cos(compAng) * compDist;
      const cz = b.z + Math.sin(compAng) * compDist;
      const cy = terrainHeightAt(cx, cz);
      const cGeo = buildChiseledBoulderGeometry({
        rx: b.rx * 0.46,
        ry: b.ry * 0.44,
        rz: b.rz * 0.46,
        rotY: (b.rotY || 0) + 0.8,
        mossy: false,
        seed: 907 + idx * 53,
      });
      const cMesh = addPart(group, cGeo, null, { outline: false, flatShading: true });
      cMesh.position.set(cx, cy - 0.10 * b.ry, cz);
    }

    if (colliders) {
      colliders.push({
        type: 'circle',
        x: b.x,
        z: b.z,
        r: Math.max(b.rx, b.rz) * 0.85,
        tag: 'boulder',
      });
    }
  });

  return group;
}

/* -------------------------------------------------------------------------- */
/* 6. LOW DRY-STONE COUNTRY WALLS & WOODEN SPLIT-RAIL TIMBER FENCES           */
/* -------------------------------------------------------------------------- */

function buildChiseledWallBlockGeo(w, h, d, seed, isCapstone = false) {
  const rawBox = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const geo = rawBox.index ? rawBox.toNonIndexed() : rawBox;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const jitter = (hash2(Math.round(vx * 20 + seed), Math.round(vz * 20 + vy * 20), seed) - 0.5) * 0.04;
    const topTaper = vy > 0 ? 0.92 : 1.02;
    pos.setXYZ(i, vx * topTaper + jitter, vy + jitter * 0.5, vz * topTaper + jitter);
  }
  geo.computeVertexNormals();

  const norm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const blockTint = 0.92 + hash2(seed, seed * 7, 19) * 0.16;
  const hasMoss = isCapstone && hash2(seed, 31, 73) > 0.42;
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const ny = norm.getY(i);
    const vy = pos.getY(i);
    const hFrac = clamp((vy + h * 0.5) / h, 0, 1);
    tmp
      .copy(COL_LIME_SHD)
      .lerp(COL_LIME_MID, smoothstep(0.0, 0.55, hFrac))
      .lerp(COL_LIME_SUN, smoothstep(0.45, 1.0, hFrac + ny * 0.25))
      .multiplyScalar(blockTint);
    if (hasMoss && ny > 0.65) {
      tmp.lerp(COL_MOSS_TOP, 0.62);
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function buildDryStoneWalls(colliders) {
  const group = new THREE.Group();
  group.name = 'dryStoneWalls';

  DRY_STONE_WALLS.forEach((w, wIdx) => {
    const dx = w.x1 - w.x0;
    const dz = w.z1 - w.z0;
    const totalLen = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const thickness = w.thickness || 0.52;
    const wallH = w.height || 0.84;
    const blockCount = Math.max(4, Math.round(totalLen / 1.15));
    const stepLen = totalLen / blockCount;

    for (let i = 0; i < blockCount; i++) {
      const t = (i + 0.5) / blockCount;
      const bx = lerp(w.x0, w.x1, t);
      const bz = lerp(w.z0, w.z1, t);
      const by = terrainHeightAt(bx, bz);

      // Lower & middle coursed chiseled stone block
      const baseH = wallH * 0.68;
      const baseGeo = buildChiseledWallBlockGeo(
        thickness,
        baseH,
        stepLen * 0.96,
        701 + wIdx * 41 + i * 7,
        false
      );
      const baseMesh = addPart(group, baseGeo, null, {
        outline: false,
        flatShading: true,
      });
      baseMesh.position.set(bx, by + baseH * 0.44, bz);
      baseMesh.rotation.y = yaw + ((i % 2) - 0.5) * 0.04;

      // Chunky overhanging chiseled capstone (matching 01-title.png foreground wall!)
      const capH = wallH * 0.36;
      const capGeo = buildChiseledWallBlockGeo(
        thickness * 1.12,
        capH,
        stepLen * 0.92,
        809 + wIdx * 53 + i * 11,
        true
      );
      const capMesh = addPart(group, capGeo, null, {
        outline: false,
        flatShading: true,
      });
      capMesh.position.set(bx, by + baseH * 0.84 + capH * 0.45, bz);
      capMesh.rotation.y = yaw + ((i % 3) - 1) * 0.03;
    }

    if (colliders) {
      colliders.push({
        type: 'obb',
        x: (w.x0 + w.x1) * 0.5,
        z: (w.z0 + w.z1) * 0.5,
        hx: thickness * 0.55,
        hz: totalLen * 0.5,
        rotY: yaw,
        tag: 'dry_stone_wall',
      });
    }
  });

  return group;
}

function buildRoadsideSplitRailFences(colliders) {
  const group = new THREE.Group();
  group.name = 'roadsideSplitRailFences';

  ROADSIDE_FENCES.forEach((f) => {
    const spans = f.spans || 3;
    const posts = [];
    for (let i = 0; i <= spans; i++) {
      const t = i / spans;
      const px = lerp(f.x0, f.x1, t);
      const pz = lerp(f.z0, f.z1, t);
      const py = terrainHeightAt(px, pz);
      posts.push({ x: px, y: py, z: pz });

      const postH = 1.24;
      const post = addPart(
        group,
        new THREE.BoxGeometry(0.24, postH, 0.24),
        PALETTE.timber,
        { outline: i === 0 || i === spans }
      );
      post.position.set(px, py + postH * 0.48, pz);

      const postCap = addPart(
        group,
        new THREE.BoxGeometry(0.28, 0.08, 0.28),
        PALETTE.timberDark,
        { outline: false }
      );
      postCap.position.set(px, py + postH + 0.02, pz);
    }

    for (let i = 0; i < posts.length - 1; i++) {
      const p0 = posts[i];
      const p1 = posts[i + 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dz = p1.z - p0.z;
      const horizLen = Math.hypot(dx, dz);
      const segLen = Math.hypot(horizLen, dy);
      const mx = (p0.x + p1.x) * 0.5;
      const my = (p0.y + p1.y) * 0.5;
      const mz = (p0.z + p1.z) * 0.5;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(dy, horizLen);

      for (const ry of [0.44, 0.88]) {
        const railHolder = new THREE.Group();
        railHolder.position.set(mx, my + ry, mz);
        railHolder.rotation.y = yaw;
        railHolder.rotation.x = pitch;

        addPart(
          railHolder,
          new THREE.BoxGeometry(0.13, 0.14, segLen + 0.08),
          ry > 0.6 ? PALETTE.timberLight : PALETTE.timber,
          { outline: false }
        );
        group.add(railHolder);
      }

      if (colliders) {
        colliders.push({
          type: 'obb',
          x: mx,
          z: mz,
          hx: 0.24,
          hz: horizLen * 0.5,
          rotY: yaw,
          tag: 'split_rail_fence',
        });
      }
    }
  });

  return group;
}

/* -------------------------------------------------------------------------- */
/* 7. SACRED INSCRIPTION STONES (`(0, -14)`, `(-42, 18)`, `(44, 16)`)         */
/* -------------------------------------------------------------------------- */

function buildSacredInscriptionStones(colliders) {
  const group = new THREE.Group();
  group.name = 'sacredInscriptionStones';

  for (const st of INSCRIPTION_STONES) {
    const sy = terrainHeightAt(st.x, st.z);
    const holder = new THREE.Group();
    holder.position.set(st.x, sy, st.z);
    holder.rotation.y = st.rotY || 0;

    // 1. Lush mossy-turf sanctuary bed & irregular chiseled stone base plinth (matching 07-first-poem.png)
    const turfBed = addPart(
      holder,
      new THREE.CylinderGeometry(3.45, 3.65, 0.07, 16),
      PALETTE.boulderMoss,
      { outline: false }
    );
    turfBed.position.y = 0.025;

    const turfCurb = addPart(
      holder,
      new THREE.RingGeometry(3.40, 3.72, 16).rotateX(-Math.PI / 2),
      PALETTE.stoneWarm,
      { outline: false }
    );
    turfCurb.position.y = 0.032;

    const lowerStep = addPart(
      holder,
      new THREE.CylinderGeometry(1.10, 1.26, 0.24, 7),
      PALETTE.stoneWarm,
      { outline: false }
    );
    lowerStep.position.y = 0.12;

    const leftRock = addPart(
      holder,
      new THREE.DodecahedronGeometry(0.38, 0),
      PALETTE.limestoneLight,
      { outline: true }
    );
    leftRock.scale.set(1.15, 0.78, 0.95);
    leftRock.position.set(-0.74, 0.24, 0.18);
    leftRock.rotation.set(0.15, 0.4, -0.12);

    const rightRock = addPart(
      holder,
      new THREE.DodecahedronGeometry(0.32, 0),
      PALETTE.stoneWarm,
      { outline: true }
    );
    rightRock.scale.set(1.08, 0.72, 0.92);
    rightRock.position.set(0.68, 0.20, 0.22);
    rightRock.rotation.set(-0.12, -0.5, 0.18);

    // 2. Weathered ancient limestone monolith stele body (tapered & chiseled, zero green hat)
    const steleLower = addPart(
      holder,
      new THREE.BoxGeometry(1.12, 1.15, 0.44),
      PALETTE.limestoneLight,
      { outline: true }
    );
    steleLower.position.y = 0.72;

    const steleUpper = addPart(
      holder,
      new THREE.BoxGeometry(1.02, 0.86, 0.40),
      PALETTE.limestoneLight,
      { outline: true }
    );
    steleUpper.position.y = 1.62;

    // Chamfered weathered limestone crown ridge (warm stone, never green)
    const crownRidge = addPart(
      holder,
      new THREE.BoxGeometry(0.92, 0.20, 0.36),
      PALETTE.stoneWarm,
      { outline: true }
    );
    crownRidge.position.set(0, 2.14, 0);

    // 3. Carved 3-Petal Sacred Lotus & 3 Wave Relief Grooves on front & back faces (matching 07-first-poem.png)
    for (const fz of [-0.21, 0.21]) {
      const signZ = Math.sign(fz);
      // Center lotus petal
      const petalC = addPart(
        holder,
        new THREE.OctahedronGeometry(0.16, 0),
        PALETTE.stoneDark,
        { outline: false }
      );
      petalC.scale.set(0.62, 1.35, 0.22);
      petalC.position.set(0, 1.56, fz);

      // Left & right angled lotus petals
      for (const sx of [-1, 1]) {
        const petalS = addPart(
          holder,
          new THREE.OctahedronGeometry(0.13, 0),
          PALETTE.stoneDark,
          { outline: false }
        );
        petalS.scale.set(0.58, 1.22, 0.22);
        petalS.rotation.z = -sx * 0.52;
        petalS.position.set(sx * 0.19, 1.48, fz);
      }

      // 3 carved horizontal wave/inscription lines below the lotus emblem
      for (const [idx, ry] of [1.16, 1.00, 0.84].entries()) {
        const waveLine = addPart(
          holder,
          new THREE.BoxGeometry(0.56 - idx * 0.06, 0.045, 0.04),
          PALETTE.stoneDark,
          { outline: false }
        );
        waveLine.position.set(0, ry, fz + signZ * 0.005);
      }
    }

    group.add(holder);

    if (colliders) {
      colliders.push({
        type: 'circle',
        x: st.x,
        z: st.z,
        r: 0.92,
        tag: 'inscription_stone',
        id: st.id,
      });
    }
  }

  // Stepping stone slabs along the shallow causeway from the pier shore (-33.5, 10.5) to (-42.0, 18.0)
  const causewaySteps = [
    [-33.8, 11.2],
    [-35.4, 13.0],
    [-37.2, 14.8],
    [-39.2, 16.3],
  ];
  causewaySteps.forEach(([sx, sz], idx) => {
    const sy = terrainHeightAt(sx, sz);
    const slab = addPart(
      group,
      new THREE.CylinderGeometry(0.95, 1.08, 0.26, 7),
      idx % 2 === 0 ? PALETTE.limestoneLight : PALETTE.stoneWarm,
      { outline: false }
    );
    slab.position.set(sx, Math.max(sy, ZONES.millpond.waterY - 0.14), sz);
  });

  return group;
}

/* -------------------------------------------------------------------------- */
/* 8. DEEP-WATER BOUNDARY COLLIDER RING & PIER GUARDRAILS                     */
/* -------------------------------------------------------------------------- */

/**
 * Registers a continuous ring of deep-water boundary colliders tracing the exact
 * `terrainHeightAt(x, z) = -1.55m` contour (`0.35m` ankle wading depth below `waterY = -1.20m`),
 * while leaving the Wooden Pier deck (`x = -52.0..-33.0, z = 6.7..10.3`) and the `(-42, 18)`
 * Sacred Stone shallow causeway/sandbar completely open and walkable!
 */
function buildDeepWaterColliderRing(colliders) {
  if (!colliders) return;

  const mp = ZONES.millpond;
  const pier = LANDMARKS.pier;
  const wadingLimitY = mp.waterY - 0.35; // -1.55m (0.35m ankle depth)
  const rayCount = 56;
  const colliderRadius = 1.95;

  for (let i = 0; i < rayCount; i++) {
    const ang = (i / rayCount) * Math.PI * 2;
    const dirX = Math.cos(ang);
    const dirZ = Math.sin(ang);

    // Walk outward from deep lake center (-58, 4) to find where terrain rises above -1.55m
    const originX = -58.0;
    const originZ = 4.0;
    let rLow = 4.0;
    let rHigh = 46.0;
    for (let step = 0; step < 12; step++) {
      const rMid = (rLow + rHigh) * 0.5;
      const tx = originX + dirX * rMid;
      const tz = originZ + dirZ * rMid;
      if (terrainHeightAt(tx, tz) < wadingLimitY) {
        rLow = rMid;
      } else {
        rHigh = rMid;
      }
    }

    // Center the blocking circle slightly inside the deep-water side so its outer edge aligns with -1.55m
    const rCenter = Math.max(3.0, rLow - colliderRadius * 0.82);
    const cx = originX + dirX * rCenter;
    const cz = originZ + dirZ * rCenter;

    // Never block the Wooden Pier deck corridor or the (-42, 18) Sacred Stone sandbar/causeway
    const inPierDeck =
      cx >= pier.xEnd - 2.2 &&
      cx <= pier.xStart + 3.5 &&
      Math.abs(cz - pier.z) <= pier.width * 0.55 + colliderRadius + 0.25;
    if (inPierDeck) continue;

    if (terrainHeightAt(cx, cz) >= wadingLimitY + 0.04) continue;

    colliders.push({
      type: 'circle',
      x: Number(cx.toFixed(2)),
      z: Number(cz.toFixed(2)),
      r: colliderRadius,
      tag: 'deep_water',
    });
  }

  // Add over-water pier edge guardrail colliders so players on the pier cannot step off into deep water,
  // while the shore entry (x > -36.8) and shallow wading zones remain 100% open!
  const overWaterX0 = pier.xEnd - 0.15; // -52.15
  const overWaterX1 = -37.2;
  const overWaterMidX = (overWaterX0 + overWaterX1) * 0.5;
  const overWaterHalfLen = (overWaterX1 - overWaterX0) * 0.5;
  const sideOffsetZ = pier.width * 0.5 + 0.32;

  for (const sz of [-sideOffsetZ, sideOffsetZ]) {
    colliders.push({
      type: 'obb',
      x: overWaterMidX,
      z: pier.z + sz,
      hx: overWaterHalfLen,
      hz: 0.24,
      rotY: 0,
      tag: 'pier_deep_edge',
    });
  }

  // West lakeward tip of the pier
  colliders.push({
    type: 'obb',
    x: pier.xEnd - 0.35,
    z: pier.z,
    hx: 0.25,
    hz: pier.width * 0.55,
    rotY: 0,
    tag: 'pier_deep_tip',
  });
}

/* -------------------------------------------------------------------------- */
/* 9. 28 STONE BOUNDARY WAYMARKERS AT `PLAY_BOUNDARY_RADIUS = 165m`           */
/* -------------------------------------------------------------------------- */

function buildBoundaryMarkers() {
  const group = new THREE.Group();
  group.name = 'boundaryMarkers';

  const markerCount = 28;
  for (let i = 0; i < markerCount; i++) {
    const a = (i / markerCount) * Math.PI * 2;
    const bx = Math.cos(a) * PLAY_BOUNDARY_RADIUS;
    const bz = Math.sin(a) * PLAY_BOUNDARY_RADIUS;
    if (bz > 120 && Math.abs(bx) < 8.0) continue;
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
/* 10. TUDOR VILLAGE COTTAGES & ROTATING WATERWHEEL                           */
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
    for (const szStud of [-0.85, 0.85]) {
      const sideStud = addPart(
        group,
        new THREE.BoxGeometry(0.14, b.wallH, 0.18),
        PALETTE.timber,
        { outline: false }
      );
      sideStud.position.set(
        sx * (b.w * 0.5 + 0.02),
        0.55 + b.wallH * 0.5,
        szStud
      );
    }
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
      tag: 'building',
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
  staticRaw.add(buildArenaFence(colliders));
  staticRaw.add(buildShrineOverlook(colliders));
  staticRaw.add(buildLimestoneBoulders(colliders));
  staticRaw.add(buildDryStoneWalls(colliders));
  staticRaw.add(buildRoadsideSplitRailFences(colliders));
  staticRaw.add(buildSacredInscriptionStones(colliders));
  staticRaw.add(buildBoundaryMarkers());

  // Register shoreline ankle-wading & deep-water boundary collider ring
  buildDeepWaterColliderRing(colliders);

  if (opts.includeBuildings !== false) {
    for (const b of BUILDINGS) {
      staticRaw.add(buildTudorHouse(b, colliders));
    }
  }

  // Merge all static landmark masonry/timber/boulders/walls/fences into 2 draw calls (toon + emissive)
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
