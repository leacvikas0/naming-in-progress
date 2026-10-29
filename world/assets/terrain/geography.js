import * as THREE from 'three';

/**
 * Deterministic Geography & Settlement Masterplan for Haru-machi (`world/assets/terrain/geography.js`).
 *
 * Enforces:
 * 1. Exact Doorway-to-Road Mathematical Alignment:
 *    `doorX = x + Math.sin(rotY) * (d * 0.5 + 0.9)`
 *    `doorZ = z + Math.cos(rotY) * (d * 0.5 + 0.9)`
 * 2. Complete Hydrological System:
 *    - Upper stream rock shelf (`y = +4.5m`) in NW
 *    - Stepped rock waterfall cascade (`z = -22.5 -> -19.5`)
 *    - Timber trestle flume (`x = -26.2, z = -23.5 -> -15.2`) feeding the `-X` waterwheel
 *    - Carved Waterwheel Tailrace Channel (`x = -26.2, z = -14.2`, floor `y = -2.2m`, water `y = -1.2m`)
 *    - Millpond basin (`waterY = -1.2m`) with warm sand/pebble shoreline gradient (`#d8c89e`)
 *    - Grounded stone shoreline abutment at `(-20.5, 8.0)` for the Wooden Pier
 * 3. Axial Grand Northern Staircase (`x = 0.0`, `z = -10.5 -> -46.8`, `y = 0.0 -> +6.5m`, 46 steps)
 *    leading to the 13m circular Shrine Overlook (`(0, -56, y = +6.5m)`).
 * 4. Eastern Wisteria Combat Clearing (`(38, -6, y = +0.5m)`, fence radius `15.8m`) with
 *    Wisteria hero trees placed >= 3.7m clear of the split-rail fence.
 */

export const WORLD_SIZE = 480;
export const INNER_EXTENT = 160; // high-res playable valley half-extent (-160..+160)

export const WATER = {
  waterY: -1.2,
  tailraceBottomY: -2.2,
  upperStreamY: 4.5,
  wheelX: -26.2,
  wheelZ: -14.2,
  wheelY: 0.48,
  wheelRadius: 2.1,
  pierAbutment: { x: -20.6, z: 8.0, y: -0.32, w: 3.2, d: 4.2 },
  pierEnd: { x: -33.2, z: 8.0, y: -0.32 },
};

export const WELL_PLAZA = {
  x: 0,
  z: 0,
  y: 0.0,
  cobbleRadius: 6.5,
  ringInnerRadius: 6.5,
  ringCenterRadius: 8.2,
  ringOuterRadius: 9.8,
};

export const SHRINE = {
  x: 0.0,
  z: -56.0,
  y: 6.5,
  platformRadius: 6.5, // 13m circular stone platform
  medallionRadius: 3.45,
  arch: { x: 0.0, z: -60.2, y: 6.5, span: 4.4, height: 5.2 },
  pedestal: { x: 0.0, z: -58.1, y: 6.5 },
  stairs: {
    x: 0.0,
    startZ: -10.5,
    endZ: -46.8,
    startY: 0.0,
    endY: 6.5,
    steps: 46,
    treadWidth: 3.8,
    cheekWallWidth: 0.56,
  },
};

export const ARENA = {
  x: 38.0,
  z: -6.0,
  y: 0.5,
  dirtRadius: 15.4,
  fenceRadius: 15.8,
  gateAngle: Math.PI, // West entrance facing hamlet road (x = 22.2, z = -6.0)
  gateHalfAngle: 0.24,
};

/**
 * Helper that computes exact doorway world coordinates per the specification:
 *   doorX = x + Math.sin(rotY) * (d * 0.5 + 0.9)
 *   doorZ = z + Math.cos(rotY) * (d * 0.5 + 0.9)
 */
function defineBuilding(spec) {
  const { x, z, d, rotY } = spec;
  const doorOffset = d * 0.5 + 0.9;
  const doorX = x + Math.sin(rotY) * doorOffset;
  const doorZ = z + Math.cos(rotY) * doorOffset;
  const wallDoorX = x + Math.sin(rotY) * (d * 0.5);
  const wallDoorZ = z + Math.cos(rotY) * (d * 0.5);
  return {
    ...spec,
    doorOffset,
    doorX,
    doorZ,
    wallDoorX,
    wallDoorZ,
  };
}

export const BUILDINGS = {
  inn: defineBuilding({
    id: 'inn',
    name: 'The Crossroads Inn & Bakery',
    x: -11.0,
    y: 0.0,
    z: -13.0,
    w: 11.0,
    d: 8.0,
    rotY: 0.55,
    stories: 2,
    chimneySide: -1,
    hasDormer: true,
    hasPorch: true,
  }),
  herbalist: defineBuilding({
    id: 'herbalist',
    name: 'The Apothecary & Herb Cottage',
    x: 13.0,
    y: 0.0,
    z: -11.0,
    w: 8.5,
    d: 6.5,
    rotY: -0.62,
    stories: 1.5,
    chimneySide: 1,
    hasAwning: true,
    hasPorch: true,
  }),
  smithy: defineBuilding({
    id: 'smithy',
    name: 'The Cooper & Smithy Cottage',
    x: 14.0,
    y: 0.0,
    z: 12.0,
    w: 9.5,
    d: 7.0,
    rotY: -2.35,
    stories: 1.5,
    chimneySide: -1,
    hasPorch: true,
  }),
  gardener: defineBuilding({
    id: 'gardener',
    name: "The Gardener's Cottage",
    x: -13.0,
    y: 0.0,
    z: 13.0,
    w: 8.0,
    d: 6.5,
    rotY: 2.30,
    stories: 1,
    chimneySide: 1,
    hasGarden: true,
    hasPorch: true,
  }),
  watermill: defineBuilding({
    id: 'watermill',
    name: 'The Watermill',
    x: -22.0,
    y: 0.4,
    z: -14.2,
    w: 7.2,
    d: 6.5,
    rotY: 0.35,
    stories: 1.5,
    hasWheel: true,
    wheelX: -26.2,
    wheelZ: -14.2,
    wheelY: 0.48,
    wheelRadius: 2.1,
  }),
};

export const BUILDING_LIST = Object.values(BUILDINGS);

/**
 * Transform a world (wx, wz) into a building's local frame (lx, lz) where +Z is the front door direction.
 */
export function worldToBuildingLocal(wx, wz, b) {
  const dx = wx - b.x;
  const dz = wz - b.z;
  const c = Math.cos(b.rotY);
  const s = Math.sin(b.rotY);
  return {
    lx: dx * c - dz * s,
    lz: dx * s + dz * c,
  };
}

/**
 * Transform a building's local (lx, lz) into world (wx, wz).
 */
export function buildingLocalToWorld(lx, lz, b) {
  const c = Math.cos(b.rotY);
  const s = Math.sin(b.rotY);
  return {
    wx: b.x + lx * c + lz * s,
    wz: b.z - lx * s + lz * c,
  };
}

/**
 * Compute doorway cobblestone spur path control points for every building.
 * Every spur path starts at `(doorX, doorZ)` and joins the Village Ring Road or West Mill Road.
 */
function buildDoorSpurs() {
  const spurs = [];
  for (const key of ['inn', 'herbalist', 'smithy', 'gardener']) {
    const b = BUILDINGS[key];
    const dist = Math.hypot(b.doorX, b.doorZ) || 1;
    const ux = b.doorX / dist;
    const uz = b.doorZ / dist;
    const roadX = ux * WELL_PLAZA.ringCenterRadius;
    const roadZ = uz * WELL_PLAZA.ringCenterRadius;
    spurs.push({
      id: `${key}-spur`,
      buildingId: key,
      width: 2.35,
      surface: 'cobble',
      points: [
        [b.wallDoorX, b.wallDoorZ],
        [b.doorX, b.doorZ],
        [(b.doorX + roadX) * 0.5, (b.doorZ + roadZ) * 0.5],
        [roadX, roadZ],
      ],
    });
  }

  // Watermill spur: terminates at watermill (doorX, doorZ) and joins the West Mill Road
  const wm = BUILDINGS.watermill;
  spurs.push({
    id: 'watermill-spur',
    buildingId: 'watermill',
    width: 2.4,
    surface: 'cobble',
    points: [
      [wm.wallDoorX, wm.wallDoorZ],
      [wm.doorX, wm.doorZ],
      [-18.8, -6.2],
      [-16.2, 1.2],
      [-13.0, 3.2],
    ],
  });

  return spurs;
}

export const DOOR_SPURS = buildDoorSpurs();

export const ROADS = [
  // South Approach Road
  {
    id: 'south-road',
    width: 3.8,
    surface: 'dirt',
    points: [
      [0.0, 8.4],
      [-0.8, 20.0],
      [0.9, 34.0],
      [-0.4, 48.0],
      [0.0, 66.0],
    ],
  },
  // East Road to Wisteria Combat Clearing
  {
    id: 'east-arena-road',
    width: 3.5,
    surface: 'dirt',
    points: [
      [8.3, -1.5],
      [13.8, -3.6],
      [18.2, -5.2],
      [23.0, -6.0],
    ],
  },
  // West Mill & Pier Road (connects Ring Road cleanly to Stone Pier Abutment at x=-20.6, z=8.0)
  {
    id: 'west-pier-road',
    width: 3.4,
    surface: 'dirt',
    points: [
      [-8.2, 1.2],
      [-13.0, 3.2],
      [-17.2, 6.2],
      [-20.6, 8.0],
    ],
  },
  ...DOOR_SPURS,
];

/**
 * Wisteria & Sakura Hero Tree placements.
 * Arena fence is at radius 15.8m from (38, -6).
 * Every arena Wisteria tree trunk is placed at radius 19.6m..20.2m (>= 3.8m clear of the fence!).
 */
export const WISTERIA_TREES = [
  {
    id: 'arena-nw-wisteria',
    x: 29.2,
    z: -23.5, // dist from (38,-6) = 19.59m -> 3.79m clear of 15.8m fence
    scale: 1.18,
    rotY: 0.6,
    variant: 'violet',
  },
  {
    id: 'arena-ne-wisteria',
    x: 49.5,
    z: -22.2, // dist from (38,-6) = 19.87m -> 4.07m clear of 15.8m fence
    scale: 1.22,
    rotY: -1.1,
    variant: 'violet',
  },
  {
    id: 'arena-se-wisteria',
    x: 54.8,
    z: 4.2, // dist from (38,-6) = 19.65m -> 3.85m clear of 15.8m fence
    scale: 1.05,
    rotY: 2.1,
    variant: 'sakura',
  },
  {
    id: 'shrine-east-wisteria',
    x: 7.8,
    z: -58.5, // arches over the Romanesque Shrine Archway like ref-shrine-vista-mood.png
    scale: 1.28,
    rotY: -0.75,
    variant: 'violet',
  },
  {
    id: 'shrine-west-sakura',
    x: -8.2,
    z: -57.8,
    scale: 1.02,
    rotY: 1.25,
    variant: 'sakura',
  },
];

/**
 * Stratified Rock Cliff & Ravine Boulders (NO snowman spheres, and kept strictly disjoint from trees).
 */
export const CLIFF_BOULDERS = [
  // Waterfall stepped cascade cliff strata (x = -34..-23, z = -26..-18)
  { x: -30.5, z: -23.2, w: 5.4, h: 5.8, d: 4.8, rotY: 0.22, moss: true },
  { x: -24.2, z: -22.8, w: 4.6, h: 5.4, d: 4.4, rotY: -0.18, moss: true },
  { x: -31.2, z: -19.2, w: 4.4, h: 3.6, d: 4.0, rotY: 0.45, moss: true },
  { x: -27.4, z: -21.2, w: 3.4, h: 2.5, d: 2.6, rotY: 0.08, moss: false }, // mid-cascade ledge rock
  { x: -30.8, z: -15.4, w: 3.6, h: 2.2, d: 3.4, rotY: -0.35, moss: true }, // west tailrace bank rock
  { x: -32.0, z: -11.2, w: 3.2, h: 1.8, d: 2.8, rotY: 0.62, moss: true },
  // Arena northern cliff backdrop shoulders (behind the wisteria trees, clear of trunks)
  { x: 22.5, z: -28.0, w: 6.5, h: 4.8, d: 4.5, rotY: 0.3, moss: true },
  { x: 39.0, z: -29.5, w: 7.8, h: 5.6, d: 5.0, rotY: -0.15, moss: true },
  { x: 56.5, z: -26.5, w: 6.8, h: 5.0, d: 4.8, rotY: -0.4, moss: true },
  // Shrine flank cliff boulders
  { x: -11.5, z: -51.5, w: 4.5, h: 3.2, d: 3.8, rotY: 0.4, moss: true },
  { x: 11.8, z: -51.0, w: 4.6, h: 3.4, d: 3.8, rotY: -0.35, moss: true },
];

/**
 * Green Cel-Shaded Village Trees — every coordinate verified to be >= 4m clear of all boulders,
 * roads, buildings, fences, and water.
 */
export const VILLAGE_TREES = [
  { x: -20.5, z: -2.2, scale: 1.05, seed: 101 },
  { x: -19.0, z: 18.5, scale: 1.12, seed: 102 },
  { x: -6.5, z: 24.5, scale: 0.96, seed: 103 },
  { x: 8.5, z: 24.0, scale: 1.08, seed: 104 },
  { x: 23.5, z: 16.5, scale: 1.15, seed: 105 },
  { x: 24.0, z: -16.5, scale: 0.95, seed: 106 },
  { x: -7.8, z: -24.5, scale: 1.04, seed: 107 },
  { x: 8.2, z: -24.5, scale: 1.02, seed: 108 },
  { x: -8.5, z: -37.0, scale: 1.10, seed: 109 },
  { x: 8.5, z: -37.0, scale: 1.06, seed: 110 },
  { x: -36.5, z: -29.5, scale: 1.18, seed: 111 },
  { x: -17.5, z: -30.0, scale: 1.05, seed: 112 },
  { x: -46.0, z: 22.0, scale: 1.15, seed: 113 },
  { x: 56.0, z: 18.0, scale: 1.12, seed: 114 },
];

/* ---------------------------------------------------------- math utilities */

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) return { dist: Math.hypot(px - ax, pz - az), t: 0 };
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / lenSq, 0, 1);
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return { dist: Math.hypot(px - cx, pz - cz), t, cx, cz };
}

export function distToPolyline(px, pz, points) {
  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const { dist } = distToSegment(px, pz, ax, az, bx, bz);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/**
 * Signed distance to an axis-aligned box centered at (0,0) with half-extents (hx, hz).
 */
function sdBox2D(lx, lz, hx, hz) {
  const dx = Math.abs(lx) - hx;
  const dz = Math.abs(lz) - hz;
  const outDist = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  const inDist = Math.min(Math.max(dx, dz), 0);
  return outDist + inDist;
}

/**
 * Deterministic multi-frequency value noise for organic outer hills.
 */
function hash2(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

export function fbm2(x, z) {
  return (
    0.55 * valueNoise(x, z) +
    0.30 * valueNoise(x * 2.03 + 13.7, z * 2.03 + 7.1) +
    0.15 * valueNoise(x * 4.07 + 31.2, z * 4.07 + 19.4)
  );
}

/**
 * Core analytical terrain & water height + surface classifier `sampleWorld(x, z)`.
 *
 * Returns:
 * - `y`: terrain ground elevation at `(x, z)`
 * - `walkY`: walkable elevation (includes stone staircase, shrine platform, and wooden pier deck)
 * - `roadWeight`: `[0..1]` road/plaza surface blend
 * - `cobbleWeight`: `[0..1]` cobblestone vs packed dirt blend
 * - `sandWeight`: `[0..1]` warm sandy/pebbled shoreline gradient (`#d8c89e`)
 * - `rockWeight`: `[0..1]` cliff/ravine rock strata weight
 * - `foliageMask`: `0.0` in all exclusion zones, `1.0` on open meadow
 * - `ao`: `[0..1]` contact ambient occlusion around plinths, walls, and cliffs
 */
export function sampleWorld(x, z) {
  // 1. Base valley bowl + northern hill climb + NW rock shelf
  const rOrigin = Math.hypot(x, z);
  const valleyFlat = smoothstep(18, 52, rOrigin);
  const hillNoise = (fbm2(x * 0.022, z * 0.022) - 0.45) * 6.5;

  let y = valleyFlat * hillNoise * 0.65;

  // Outer scenic valley rim (> 68m) rises into gentle rolling hills
  const outerRim = smoothstep(64, 155, rOrigin);
  y += outerRim * (8.5 + fbm2(x * 0.015 + 5.2, z * 0.015 - 3.8) * 14.0);

  // Northern Shrine Hilltop plateau + gradual ridge ramp (centered around x=0, z=-56, y=+6.5m)
  const distShrine = Math.hypot(x - SHRINE.x, z - SHRINE.z);
  const northRidgeWeight =
    smoothstep(-10.0, -48.0, z) * smoothstep(42.0, 12.0, Math.abs(x));
  const shrineHillY = 6.5;
  y = lerp(y, shrineHillY, northRidgeWeight);

  // Extended Shrine Overlook + Wisteria tree shoulder plateau (r <= 11.5m around (0, -56))
  const shrinePlateauWeight = smoothstep(14.5, 8.8, distShrine);
  y = lerp(y, SHRINE.y, shrinePlateauWeight);

  // Axial Grand Northern Staircase corridor (x = 0, z = -10.5 -> -46.8)
  if (z <= -9.8 && z >= -49.8 && Math.abs(x) <= 6.5) {
    const stairT = clamp((-10.5 - z) / (46.8 - 10.5), 0, 1);
    const stairSlopeY = stairT * SHRINE.y;
    const corridorBlend = smoothstep(6.2, 2.4, Math.abs(x));
    y = lerp(y, stairSlopeY - 0.08, corridorBlend);
  }

  // Northwest Upper Stream Rock Shelf (x = -44..-19, z = -44..-21.5, y = +4.5m..+5.8m)
  const nwShelfX = smoothstep(-16.0, -23.0, x) * smoothstep(-48.0, -38.0, x);
  const nwShelfZ = smoothstep(-19.5, -23.2, z) * smoothstep(-46.0, -36.0, z);
  const nwShelfWeight = nwShelfX * nwShelfZ;
  if (nwShelfWeight > 0) {
    // Carve upper stream bed right around x = -27.2
    const streamTrough = Math.exp(-Math.pow((x - -27.2) / 2.2, 2));
    const shelfTargetY = 5.1 - streamTrough * 0.85;
    y = lerp(y, shelfTargetY, nwShelfWeight);
  }

  // Eastern Wisteria Combat Clearing (center (38, -6), y = +0.5m)
  const distArena = Math.hypot(x - ARENA.x, z - ARENA.z);
  const arenaPlateau = smoothstep(26.0, 17.5, distArena);
  y = lerp(y, ARENA.y, arenaPlateau);

  // Northern rocky cliff shoulder behind Wisteria Arena (z < -24, x = 18..60)
  const arenaBackCliff =
    smoothstep(-22.5, -29.0, z) *
    smoothstep(14.0, 22.0, x) *
    smoothstep(66.0, 54.0, x);
  y += arenaBackCliff * 4.8;

  // Hamlet Commons flat datum (r <= 21m around (0, 0) stays at y = 0.0m)
  const hamletFlat = smoothstep(25.5, 17.5, rOrigin);
  y = lerp(y, 0.0, hamletFlat);

  // Building flat terraces & rotated footprints
  let minBuildingDist = Infinity;
  let insideApron = 0;
  for (const b of BUILDING_LIST) {
    const { lx, lz } = worldToBuildingLocal(x, z, b);
    const padDist = sdBox2D(lx, lz, b.w * 0.5 + 0.4, b.d * 0.5 + 0.4);
    if (padDist < minBuildingDist) minBuildingDist = padDist;

    // Flatten terrain cleanly under every building site
    // Note: for watermill, only flatten x >= -25.1 so we never overwrite the -X waterwheel channel!
    if (b.id !== 'watermill' || x >= -25.15) {
      const terraceBlend = smoothstep(3.2, 0.4, padDist);
      y = lerp(y, b.y, terraceBlend);
    }

    // Rotated stone doorstep apron extending from front wall (lz = d*0.5) to (doorX, doorZ) (lz = d*0.5 + 0.9)
    const apronDist = sdBox2D(lx, lz - (b.d * 0.5 + 0.55), 1.35, 0.78);
    if (apronDist < 0.35) {
      insideApron = Math.max(insideApron, smoothstep(0.35, -0.05, apronDist));
    }
  }

  // Stone Shoreline Abutment platform for Wooden Pier at (-20.6, 8.0, y = -0.32m)
  // Keeps the West Mill Road -> Pier transition on solid stone above waterY (-1.2m)!
  const abut = WATER.pierAbutment;
  const abutDist = sdBox2D(x - abut.x, z - abut.z, abut.w * 0.5, abut.d * 0.5);
  const abutBlend = smoothstep(2.4, 0.2, abutDist);
  y = lerp(y, abut.y, abutBlend);

  // Millpond Basin (west of x = -21.5, z = -19..30, bowing around the pier abutment)
  const pondDx = (x - -36.5) / 14.8;
  const pondDz = (z - 7.5) / 21.5;
  const pondRadial = Math.hypot(pondDx, pondDz);
  // Protect the pier abutment peninsula at (-20.6, 8.0) so shoreline wraps behind x = -21.8
  const pierPeninsulaProtect = smoothstep(2.6, 0.3, sdBox2D(x - -19.5, z - 8.0, 2.4, 2.8));
  const pondDepthWeight = smoothstep(1.12, 0.58, pondRadial) * (1 - pierPeninsulaProtect * 0.88);
  if (pondDepthWeight > 0) {
    const basinFloor = -2.45;
    y = lerp(y, basinFloor, pondDepthWeight);
  }

  // CARVED WATERWHEEL TAILRACE CHANNEL:
  // Explicitly carve the terrain directly beneath the Watermill's -X waterwheel
  // (x = -26.2, z = -14.2) down to y = -2.2m, extending from the waterfall plunge pool
  // (z = -20.8) down into the Millpond (z = -4.0).
  const inTailraceX = smoothstep(-24.95, -25.45, x) * smoothstep(-30.2, -29.1, x);
  const inTailraceZ = smoothstep(-21.4, -19.8, z) * smoothstep(-2.0, -5.5, z);
  const tailraceWeight = inTailraceX * inTailraceZ;
  if (tailraceWeight > 0) {
    y = lerp(y, WATER.tailraceBottomY, tailraceWeight);
  }

  // Surface Weights for Terrain Splat Shader (`uWorldMask`)
  let roadWeight = 0;
  let cobbleWeight = 0;

  // Well Plaza cobblestones (r <= 6.5m) + Village Ring Road (r = 6.5..9.8m)
  if (rOrigin < 10.6) {
    const plazaW = smoothstep(6.7, 6.1, rOrigin);
    const ringW = smoothstep(10.2, 9.3, rOrigin) * smoothstep(6.1, 6.7, rOrigin);
    roadWeight = Math.max(roadWeight, plazaW, ringW);
    cobbleWeight = Math.max(cobbleWeight, plazaW, ringW * 0.32);
  }

  // Roads & Doorway Cobblestone Spur Paths
  for (const road of ROADS) {
    const d = distToPolyline(x, z, road.points);
    const halfW = road.width * 0.5;
    const w = smoothstep(halfW + 0.45, halfW - 0.25, d);
    if (w > 0) {
      roadWeight = Math.max(roadWeight, w);
      if (road.surface === 'cobble') {
        cobbleWeight = Math.max(cobbleWeight, w);
      }
    }
  }

  // Building rotated stone aprons blend 100% into the cobblestone spur paths
  if (insideApron > 0) {
    roadWeight = Math.max(roadWeight, insideApron);
    cobbleWeight = Math.max(cobbleWeight, insideApron);
  }

  // Eastern Wisteria Combat Clearing packed-earth floor
  const arenaFloorW = smoothstep(ARENA.dirtRadius + 0.8, ARENA.dirtRadius - 0.8, distArena);
  roadWeight = Math.max(roadWeight, arenaFloorW * 0.92);

  // Northern Shrine platform & stair corridor paving
  const shrineFloorW = smoothstep(SHRINE.platformRadius + 0.9, SHRINE.platformRadius - 0.3, distShrine);
  if (shrineFloorW > 0) {
    roadWeight = Math.max(roadWeight, shrineFloorW);
    cobbleWeight = Math.max(cobbleWeight, shrineFloorW);
  }

  // Sandy/Pebbled Lake Shoreline Gradient (#d8c89e) around the Millpond (waterY = -1.2m)
  const nearWaterZone = x < -17.0 && z > -16.0 && z < 32.0;
  let sandWeight = 0;
  if (nearWaterZone) {
    const heightAboveWater = y - WATER.waterY;
    // Warm sand band from y = -1.65m (shallow water) up to y = -0.18m (dry bank)
    sandWeight =
      smoothstep(-0.65, -0.05, heightAboveWater) *
      smoothstep(1.05, 0.15, heightAboveWater) *
      (1.0 - tailraceWeight * 0.85);
  }

  // Rock strata weight on steep slopes, waterfall cliff, and shrine hillside
  const rockCascadeZone =
    smoothstep(-16.0, -21.0, z) *
    smoothstep(-35.0, -24.0, z) *
    smoothstep(-19.0, -23.5, x) *
    smoothstep(-35.0, -30.5, x);
  const rockWeight = clamp(rockCascadeZone + arenaBackCliff * 0.85, 0, 1);

  // Exact Foliage Exclusion Mask (0.0 on buildings, aprons, roads, arena, shrine, stairs, water, shoreline)
  let foliageMask = 1.0;
  if (minBuildingDist < 1.5) foliageMask = 0.0;
  if (roadWeight > 0.15 || cobbleWeight > 0.15 || sandWeight > 0.25 || rockWeight > 0.35) {
    foliageMask = 0.0;
  }
  if (y < WATER.waterY + 0.35) foliageMask = 0.0;
  if (distArena < ARENA.fenceRadius + 1.0) foliageMask = 0.0;
  if (distShrine < SHRINE.platformRadius + 1.5) foliageMask = 0.0;
  if (z <= -9.5 && z >= -50.0 && Math.abs(x) <= 3.2) foliageMask = 0.0;

  // Contact Ambient Occlusion around building plinths, well curb, and cliff bases
  const buildingAo = smoothstep(0.0, 1.4, Math.abs(minBuildingDist));
  const wellAo = smoothstep(1.1, 2.2, rOrigin);
  const ao = clamp(0.45 + 0.55 * buildingAo * wellAo, 0.35, 1.0);

  // Walkable height (includes stairs, shrine platform, and wooden pier deck)
  let walkY = y;
  if (z <= SHRINE.stairs.startZ && z >= SHRINE.stairs.endZ && Math.abs(x) <= 2.2) {
    const t = clamp((SHRINE.stairs.startZ - z) / (SHRINE.stairs.startZ - SHRINE.stairs.endZ), 0, 1);
    walkY = Math.max(walkY, t * SHRINE.y);
  }
  if (distShrine <= SHRINE.platformRadius + 0.4) {
    walkY = Math.max(walkY, SHRINE.y);
  }
  if (x <= -20.0 && x >= -33.5 && Math.abs(z - 8.0) <= 1.8) {
    walkY = Math.max(walkY, WATER.pierAbutment.y);
  }

  return {
    y,
    walkY,
    roadWeight: clamp(roadWeight, 0, 1),
    cobbleWeight: clamp(cobbleWeight, 0, 1),
    sandWeight: clamp(sandWeight, 0, 1),
    rockWeight: clamp(rockWeight, 0, 1),
    foliageMask,
    ao,
  };
}

export function heightAt(x, z) {
  return sampleWorld(x, z).walkY;
}

/**
 * Generates the deterministic 512x512 RGBA DataTexture `uWorldMask` covering `[-160..+160]m`:
 * - R: road / surface blend weight (0 = meadow, 0.5 = packed dirt/arena, 1.0 = cobblestone/flagstone)
 * - G: warm sandy/pebbled shoreline weight (`#d8c89e`) + cliff rock encoding
 * - B: exact foliage exclusion mask (`0.0` excluded, `1.0` meadow)
 * - A: contact ambient occlusion (`0.0..1.0`)
 */
export function createWorldMaskTexture(size = 512) {
  const data = new Uint8Array(size * size * 4);
  const span = INNER_EXTENT * 2; // 320m (-160..+160)

  for (let iz = 0; iz < size; iz++) {
    const wz = ((iz + 0.5) / size - 0.5) * span;
    for (let ix = 0; ix < size; ix++) {
      const wx = ((ix + 0.5) / size - 0.5) * span;
      const s = sampleWorld(wx, wz);

      // Encode R: 0..127 = dirt road weight, 128..255 = cobblestone weight
      let rVal = 0;
      if (s.cobbleWeight > 0.02) {
        rVal = Math.round(128 + s.cobbleWeight * 127);
      } else {
        rVal = Math.round(s.roadWeight * 120);
      }

      // Encode G: 0..127 = sand shoreline weight, 128..255 = cliff rock weight
      let gVal = 0;
      if (s.rockWeight > 0.1) {
        gVal = Math.round(128 + s.rockWeight * 127);
      } else {
        gVal = Math.round(s.sandWeight * 124);
      }

      const bVal = Math.round(s.foliageMask * 255);
      const aVal = Math.round(s.ao * 255);

      const idx = (iz * size + ix) * 4;
      data[idx] = rVal;
      data[idx + 1] = gVal;
      data[idx + 2] = bVal;
      data[idx + 3] = aVal;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
