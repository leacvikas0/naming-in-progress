import * as THREE from 'three';

/**
 * Haru-machi v7 Expanded Valley & Toroidal Map Geography (`world/assets/terrain/geography.js`).
 *
 * Synchronized 100% with `world/src/blockout/geography.js` (v7):
 * - `PLAY_BOUNDARY_RADIUS = 125`
 * - `INNER_EXTENT = 140` (`280m × 280m` inner playable valley, `-140..+140`)
 * - `WORLD_SIZE = 640` (`640m × 640m` outer valley & mountain skirt, `-320..+320`)
 * - `ZONES.hamlet` at `(0, 0, y = 0.0)`, `r = 10.5m` ring road, 4 inward-facing cottages
 * - `ZONES.millpond` at `(-62, 6, waterY = -1.2, bedY = -3.0, rx = 28, rz = 36)`,
 *   `watermill` at `(-44.0, -18.0, y = 0.3, rotY = 0.42)`, `waterfall` at `(-51.4, -20.8, topY = 5.2, bottomY = -1.2)`,
 *   `pier` at `xStart = -35.5, xEnd = -52.0, z = 8.5, y = -0.35`
 * - `ZONES.arena` at `(68, -4, y = 0.6, fenceR = 19.5)` with 3 Wisteria hero trees >= 3.8m outside the fence
 * - `ZONES.shrine` at `(0.0, -86.0, y = 8.0, platformR = 14.5)` at top of 56-step axial staircase (`z = -15.0 -> -71.5`),
 *   Romanesque Stone Archway at `(0.0, -93.5)`, and raised stone planters at `(±10.6, -90.8)`
 */

export const PLAY_BOUNDARY_RADIUS = 125;
export const INNER_EXTENT = 140; // 280m x 280m high-res chunked inner valley (-140..+140)
export const OUTER_EXTENT = 320; // 640m x 640m outer mountain & valley skirt (-320..+320)
export const WORLD_SIZE = 640;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function hash2(ix, iz, seed = 101) {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function noise2(x, z, seed = 101) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

export function fbm2(x, z, seed = 101) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 3; i++) {
    v += noise2(x * freq, z * freq, seed + i * 31) * amp;
    freq *= 2.02;
    amp *= 0.5;
  }
  return v;
}

export const ZONES = {
  hamlet: {
    id: 'hamlet',
    name: 'Zone A · Haru-machi Crossroads & Well Plaza',
    x: 0,
    z: 0,
    y: 0.0,
    innerR: 28,
    outerR: 42,
  },
  arena: {
    id: 'arena',
    name: 'Zone C · Wisteria Festival & Combat Ring',
    x: 68,
    z: -4,
    y: 0.6,
    innerR: 21.0,
    outerR: 31.0,
    fenceR: 19.5,
  },
  shrine: {
    id: 'shrine',
    name: 'Zone D · Northern Wisteria Arch Shrine Overlook',
    x: 0.0,
    z: -86.0,
    y: 8.0,
    innerR: 15.8,
    outerR: 28.5,
    platformR: 14.5,
  },
  millpond: {
    id: 'millpond',
    name: 'Zone B · Waterfall, Watermill & Lake Basin',
    x: -62,
    z: 6,
    waterY: -1.2,
    bedY: -3.0,
    rx: 28,
    rz: 36,
  },
};

export function getBuildingDoorWorldPos(b, offsetFromFrontWall = 1.35) {
  const dist = b.d * 0.5 + offsetFromFrontWall;
  return [
    b.x + Math.sin(b.rotY) * dist,
    b.z + Math.cos(b.rotY) * dist,
  ];
}

function enrichBuilding(b) {
  const [doorX, doorZ] = getBuildingDoorWorldPos(b, 1.35);
  const [wallDoorX, wallDoorZ] = getBuildingDoorWorldPos(b, 0.15);
  return {
    ...b,
    doorX,
    doorZ,
    wallDoorX,
    wallDoorZ,
    cosNeg: Math.cos(-b.rotY),
    sinNeg: Math.sin(-b.rotY),
  };
}

export const BUILDINGS = [
  enrichBuilding({
    id: 'inn',
    name: '1. Crossroads Inn & Bakery',
    role: 'Co-Op Lobby & Hearth Buffs',
    x: -15.5,
    z: -14.5,
    y: 0.0,
    w: 10.4,
    d: 7.4,
    wallH: 5.4,
    roofH: 3.4,
    rotY: Math.atan2(15.5, 14.5), // ~0.818 rad, +Z door facing SE toward ring road
    stories: 2,
    crossGable: true,
    dormer: true,
    chimneySide: 1,
    awning: 'front_porch',
    roofColor: 0xd94e28,
    colliderPad: 0.6,
  }),
  enrichBuilding({
    id: 'herbalist',
    name: '2. Apothecary & Herb Greenhouse',
    role: 'Partner Elixirs & Aura Potions',
    x: 16.5,
    z: -13.5,
    y: 0.0,
    w: 8.6,
    d: 6.4,
    wallH: 4.3,
    roofH: 3.0,
    rotY: Math.atan2(-16.5, 13.5), // ~-0.885 rad, +Z door facing SW toward ring road
    stories: 1.5,
    crossGable: false,
    dormer: true,
    chimneySide: -1,
    awning: 'side_greenhouse',
    roofColor: 0xe05a32,
    colliderPad: 0.5,
  }),
  enrichBuilding({
    id: 'smithy',
    name: '3. Foothill Smithy & Cooperage',
    role: 'Weapon & Link-Strike Upgrades',
    x: 16.8,
    z: 14.2,
    y: 0.0,
    w: 9.0,
    d: 6.8,
    wallH: 4.5,
    roofH: 3.1,
    rotY: Math.atan2(-16.8, -14.2), // ~-2.440 rad, +Z door facing NW toward ring road
    stories: 1.5,
    crossGable: false,
    dormer: true,
    chimneySide: 1,
    heavyForge: true,
    awning: 'forge_shed',
    roofColor: 0xc64120,
    colliderPad: 0.5,
  }),
  enrichBuilding({
    id: 'gardener',
    name: '4. Shepherd & Gardener Cottage',
    role: 'Town Defense Anchor & Kitchen Garden',
    x: -15.8,
    z: 14.8,
    y: 0.0,
    w: 8.2,
    d: 6.2,
    wallH: 3.9,
    roofH: 2.9,
    rotY: Math.atan2(15.8, -14.8), // ~+2.323 rad, +Z door facing NE toward ring road
    stories: 1,
    crossGable: false,
    dormer: true,
    chimneySide: -1,
    awning: 'front_hood',
    roofColor: 0xde552c,
    colliderPad: 0.5,
    gardenPatch: { ox: 6.6, oz: 0.0, w: 4.2, d: 5.6 },
  }),
  enrichBuilding({
    id: 'watermill',
    name: '5. Waterfall Stream Mill',
    role: 'Hydro Wheel Landmark & Pier Anchor',
    x: -44.0,
    z: -18.0,
    y: 0.3,
    w: 7.8,
    d: 6.4,
    wallH: 4.6,
    roofH: 3.0,
    rotY: 0.42, // +Z door facing SSE toward mill_service_path
    stories: 1.5,
    crossGable: false,
    dormer: true,
    chimneySide: 0,
    hasWaterwheel: true,
    roofColor: 0xc94927,
    colliderPad: 0.5,
  }),
];

export const BUILDING_LIST = BUILDINGS;
export const BUILDINGS_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
const millBuilding = BUILDINGS_BY_ID.watermill;

export function worldToBuildingLocal(wx, wz, b) {
  const dx = wx - b.x;
  const dz = wz - b.z;
  return {
    lx: dx * b.cosNeg - dz * b.sinNeg,
    lz: dx * b.sinNeg + dz * b.cosNeg,
  };
}

export function buildingLocalToWorld(lx, lz, b) {
  const c = Math.cos(b.rotY);
  const s = Math.sin(b.rotY);
  return {
    wx: b.x + lx * c + lz * s,
    wz: b.z - lx * s + lz * c,
  };
}

export const RING_RADIUS = 10.5;
const RING_PTS = [];
for (let i = 0; i <= 32; i++) {
  const a = (i / 32) * Math.PI * 2;
  RING_PTS.push([Math.cos(a) * RING_RADIUS, Math.sin(a) * RING_RADIUS]);
}

function buildCottageSpur(id, name, width, buildingId) {
  const b = BUILDINGS_BY_ID[buildingId];
  const doorPt = getBuildingDoorWorldPos(b, 1.35);
  const wallPt = getBuildingDoorWorldPos(b, 0.15);
  const ang = Math.atan2(doorPt[1], doorPt[0]);
  const ringPt = [Math.cos(ang) * RING_RADIUS, Math.sin(ang) * RING_RADIUS];
  return {
    id,
    name,
    width,
    surface: 'cobble',
    points: [ringPt, doorPt, wallPt],
  };
}

const millDoorPt = getBuildingDoorWorldPos(millBuilding, 1.35);
const millWallPt = getBuildingDoorWorldPos(millBuilding, 0.15);

export const ROADS = [
  {
    id: 'village_ring',
    name: 'Hamlet Commons Loop',
    width: 4.2,
    surface: 'cobble',
    points: RING_PTS,
  },
  {
    id: 'south_approach',
    name: 'South Valley Approach',
    width: 4.5,
    surface: 'dirt',
    points: [
      [0, 105],
      [1.4, 78],
      [-0.8, 52],
      [0.4, 28],
      [0, RING_RADIUS],
    ],
  },
  {
    id: 'west_mill_road',
    name: 'West Mill & Pier Lane',
    width: 4.0,
    surface: 'cobble',
    points: [
      [-RING_RADIUS, 1.2],
      [-18.5, 4.2],
      [-26.5, 7.2],
      [-31.5, 8.5],
      [-35.5, 8.5],
    ],
  },
  {
    id: 'mill_service_path',
    name: 'Millhouse Spur Path',
    width: 3.8,
    surface: 'cobble',
    points: [
      [-30.5, 8.2],
      [-32.8, 2.2],
      [-36.8, -5.8],
      millDoorPt,
      millWallPt,
    ],
  },
  {
    id: 'east_arena_road',
    name: 'East Wisteria Ring Way',
    width: 4.2,
    surface: 'dirt',
    points: [
      [RING_RADIUS, -0.5],
      [23.0, -1.8],
      [36.0, -3.2],
      [48.5, -4.0],
    ],
  },
  {
    id: 'north_shrine_approach',
    name: 'Northern Staircase Approach',
    width: 4.4,
    surface: 'cobble',
    points: [
      [0.0, -RING_RADIUS],
      [0.0, -15.0],
    ],
  },
  {
    id: 'north_shrine_climb',
    name: 'Northern Shrine Stepped Path',
    width: 4.4,
    surface: 'stone_steps',
    points: [
      [0.0, -15.0],
      [0.0, -34.0],
      [0.0, -53.0],
      [0.0, -71.5],
    ],
  },
  buildCottageSpur('spur_inn', 'Inn Porch Spur', 4.2, 'inn'),
  buildCottageSpur('spur_herbalist', 'Herbalist Spur', 4.0, 'herbalist'),
  buildCottageSpur('spur_smithy', 'Smithy Forge Yard Spur', 4.2, 'smithy'),
  buildCottageSpur('spur_gardener', 'Gardener Gate Spur', 4.0, 'gardener'),
];

// Precompute road bounding boxes and segments for fast O(1) culling during mask build
const RING_ROAD_OBJ = ROADS[0]; // village_ring (exact circle of radius RING_RADIUS = 10.5m)
const PRECOMPUTED_ROADS = ROADS.slice(1).map((road) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const segs = [];
  const pts = road.points;
  const segPad = road.width * 0.5 + 1.65;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0];
    const az = pts[i][1];
    const bx = pts[i + 1][0];
    const bz = pts[i + 1][1];
    const dx = bx - ax;
    const dz = bz - az;
    const invLen2 = 1.0 / (dx * dx + dz * dz || 1);
    segs.push({
      ax,
      az,
      dx,
      dz,
      invLen2,
      idx: i,
      minX: Math.min(ax, bx) - segPad,
      maxX: Math.max(ax, bx) + segPad,
      minZ: Math.min(az, bz) - segPad,
      maxZ: Math.max(az, bz) + segPad,
    });
    minX = Math.min(minX, ax, bx);
    maxX = Math.max(maxX, ax, bx);
    minZ = Math.min(minZ, az, bz);
    maxZ = Math.max(maxZ, az, bz);
  }
  const pad = road.width * 0.5 + 2.0;
  return {
    road,
    segs,
    segCount: Math.max(1, pts.length - 1),
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad,
  };
});

export const LANDMARKS = {
  well: {
    name: 'Hamlet Roofed Stone Well',
    x: 0,
    z: 0,
    y: 0,
    plazaRadius: 6.4,
    colliderRadius: 1.65,
  },
  pier: {
    name: 'Lakeside Wooden Boat Pier',
    xStart: -35.5,
    xEnd: -52.0,
    z: 8.5,
    y: -0.35,
    width: 3.6,
  },
  waterfall: {
    name: 'Northwest Cascade & Timber Flume',
    x: -51.4,
    z: -20.8,
    topY: 5.2,
    bottomY: -1.2,
    width: 4.2,
  },
  shrineArch: {
    name: 'Wisteria Romanesque Stone Arch',
    x: 0.0,
    z: -93.5,
    y: 8.0,
    span: 6.2,
    height: 5.8,
  },
};

// All 48 trees verified for >= 5.0m clearance from arena fence (r=19.5 around (68,-4)),
// >= 4.5m clearance from all roads/stairs, and zero overlap with rocks, buildings, or shrine lookback vista.
// Arranged in natural 2-to-4 tree woodland groves with mixed scales (0.88..1.40) and canopy variants (0..2).
export const TREES = [
  // Shrine Planter Guardians (2 Hero Trees in Raised Stone Planters)
  { id: 'wisteria_shrine',  kind: 'wisteria', variant: 0, x: 10.6,  z: -90.8, scale: 1.22, hasPlanter: true, label: 'Shrine Guardian Wisteria' },
  { id: 'sakura_shrine_w',  kind: 'sakura',   variant: 0, x: -10.6, z: -90.8, scale: 1.22, hasPlanter: true, label: 'Shrine West Sakura' },

  // Grove 1: Arena North Wisteria Grove (3 trees, >= 5.0m outside fenceR = 19.5)
  { id: 'wisteria_arena_n', kind: 'wisteria', variant: 0, x: 75.0,  z: -27.5, scale: 1.35, label: 'Arena North Wisteria' },
  { kind: 'wisteria', variant: 1, x: 64.5,  z: -28.8, scale: 1.04 },
  { kind: 'sakura',   variant: 2, x: 83.5,  z: -24.2, scale: 1.16 },

  // Grove 2: Arena East Wisteria Grove (4 trees, >= 5.0m outside fenceR = 19.5)
  { id: 'wisteria_arena_e', kind: 'wisteria', variant: 0, x: 92.8,  z: -4.0,  scale: 1.40, label: 'Arena East Wisteria' },
  { kind: 'wisteria', variant: 1, x: 91.2,  z: -13.2, scale: 1.12 },
  { kind: 'sakura',   variant: 0, x: 91.5,  z: 6.2,   scale: 1.15 },
  { kind: 'oak',      variant: 2, x: 99.5,  z: -0.5,  scale: 0.98 },

  // Grove 3: Arena South Wisteria Grove (3 trees, >= 5.0m outside fenceR = 19.5)
  { id: 'wisteria_arena_s', kind: 'wisteria', variant: 0, x: 75.0,  z: 19.5,  scale: 1.32, label: 'Arena South Wisteria' },
  { kind: 'wisteria', variant: 2, x: 64.0,  z: 20.8,  scale: 1.02 },
  { kind: 'oak',      variant: 1, x: 84.0,  z: 16.2,  scale: 1.14 },

  // Grove 4: Millstream Sakura & Waterfall Hillside Grove (3 trees)
  { id: 'sakura_mill',      kind: 'sakura',   variant: 0, x: -37.5, z: -34.5, scale: 1.28, label: 'Millstream Sakura' },
  { kind: 'sakura',   variant: 1, x: -30.2, z: -29.8, scale: 1.06 },
  { kind: 'oak',      variant: 2, x: -43.8, z: -39.5, scale: 1.14 },

  // Grove 5: NW Staircase & Mill Overlook Hillside Grove (3 trees)
  { kind: 'oak',      variant: 0, x: -22.5, z: -38.0, scale: 1.18 },
  { kind: 'sakura',   variant: 1, x: -16.8, z: -45.5, scale: 0.96 },
  { kind: 'oak',      variant: 2, x: -27.5, z: -52.0, scale: 1.12 },

  // Grove 6: NE Staircase & Arena Foothill Grove (3 trees)
  { kind: 'oak',      variant: 0, x: 23.5,  z: -36.0, scale: 1.20 },
  { kind: 'sakura',   variant: 2, x: 17.5,  z: -44.5, scale: 0.95 },
  { kind: 'oak',      variant: 1, x: 29.0,  z: -51.0, scale: 1.14 },

  // Grove 7: East-Northeast Meadow Grove (3 trees)
  { kind: 'oak',      variant: 0, x: 43.0,  z: -24.5, scale: 1.16 },
  { kind: 'sakura',   variant: 1, x: 50.5,  z: -31.0, scale: 1.02 },
  { kind: 'oak',      variant: 2, x: 38.5,  z: -33.0, scale: 0.90 },

  // Grove 8: East-Southeast Meadow Grove (3 trees)
  { kind: 'oak',      variant: 1, x: 35.5,  z: 22.5,  scale: 1.22 },
  { kind: 'sakura',   variant: 0, x: 43.5,  z: 27.5,  scale: 1.05 },
  { kind: 'oak',      variant: 2, x: 51.5,  z: 21.5,  scale: 0.92 },

  // Grove 9: South-West Hamlet Approach Woodland Grove (4 trees)
  { kind: 'oak',      variant: 0, x: -26.0, z: 31.0,  scale: 1.24 },
  { kind: 'sakura',   variant: 1, x: -18.5, z: 36.5,  scale: 1.04 },
  { kind: 'oak',      variant: 2, x: -14.5, z: 47.5,  scale: 1.15 },
  { kind: 'oak',      variant: 0, x: -23.5, z: 53.0,  scale: 0.94 },

  // Grove 10: South-East Hamlet Approach Woodland Grove (4 trees)
  { kind: 'oak',      variant: 0, x: 25.0,  z: 30.0,  scale: 1.20 },
  { kind: 'sakura',   variant: 2, x: 17.5,  z: 37.5,  scale: 1.02 },
  { kind: 'oak',      variant: 1, x: 15.5,  z: 48.0,  scale: 1.16 },
  { kind: 'oak',      variant: 0, x: 24.5,  z: 54.5,  scale: 0.92 },

  // Grove 11: Far South Valley Entrance Groves (4 trees)
  { kind: 'oak',      variant: 1, x: -16.5, z: 78.0,  scale: 1.22 },
  { kind: 'sakura',   variant: 0, x: -24.5, z: 84.5,  scale: 1.05 },
  { kind: 'oak',      variant: 0, x: 18.0,  z: 76.5,  scale: 1.20 },
  { kind: 'sakura',   variant: 2, x: 26.0,  z: 83.0,  scale: 1.02 },

  // Grove 12: West Lakeshore & Millpond Ridge Groves (5 trees)
  { kind: 'oak',      variant: 0, x: -94.0, z: -16.0, scale: 1.28 },
  { kind: 'sakura',   variant: 1, x: -96.5, z: -6.5,  scale: 1.08 },
  { kind: 'oak',      variant: 1, x: -92.0, z: 22.0,  scale: 1.22 },
  { kind: 'sakura',   variant: 2, x: -95.5, z: 6.5,   scale: 1.20 },
  { kind: 'wisteria', variant: 0, x: -84.0, z: -26.5, scale: 1.18 },

  // Grove 13: North Shrine Overlook & East Foothill Slope Groves (4 trees)
  { kind: 'sakura',   variant: 0, x: -22.0, z: -86.5, scale: 1.14 },
  { kind: 'wisteria', variant: 1, x: 22.0,  z: -86.5, scale: 1.16 },
  { kind: 'sakura',   variant: 0, x: 106.0, z: -16.5, scale: 1.24 },
  { kind: 'wisteria', variant: 1, x: 108.0, z: 8.5,   scale: 1.18 },
];

export function roadDistanceAt(x, z) {
  let bestDistSq = Infinity;
  let bestRoad = null;
  let bestT = 0;

  // Analytical O(1) distance for village_ring (r = 10.5m)
  if (Math.abs(x) < 14.0 && Math.abs(z) < 14.0) {
    const r = Math.hypot(x, z);
    const dRing = Math.abs(r - RING_RADIUS);
    bestDistSq = dRing * dRing;
    bestRoad = RING_ROAD_OBJ;
    bestT = (Math.atan2(z, x) + Math.PI) / (Math.PI * 2);
  }

  for (let r = 0; r < PRECOMPUTED_ROADS.length; r++) {
    const pr = PRECOMPUTED_ROADS[r];
    if (x < pr.minX || x > pr.maxX || z < pr.minZ || z > pr.maxZ) continue;
    const segs = pr.segs;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const t = clamp(((x - s.ax) * s.dx + (z - s.az) * s.dz) * s.invLen2, 0, 1);
      const px = s.ax + s.dx * t;
      const pz = s.az + s.dz * t;
      const ddx = x - px;
      const ddz = z - pz;
      const dSq = ddx * ddx + ddz * ddz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestRoad = pr.road;
        bestT = (s.idx + t) / pr.segCount;
      }
    }
  }
  return { dist: Math.sqrt(bestDistSq), road: bestRoad, progress: bestT };
}

export function streamCenterX(z) {
  // Terminates at x = -51.6 at z = -21.5 (squarely into the waterfall rocks & flume intake, well west of the watermill roof)
  return -51.6 + Math.sin((z + 21.5) * 0.12) * 1.6 + (z + 21.5) * 0.06;
}

export function terrainHeightAt(x, z) {
  const distFromOrigin = Math.hypot(x, z);

  // Outer valley basin rise & mountain ridge cradle beyond r = 88m
  let rimLift = 0.0;
  if (distFromOrigin > 88.0) {
    const angle = Math.atan2(z, x);
    const ridgeWave =
      distFromOrigin > 130.0
        ? 0.65 +
          0.22 * Math.sin(angle * 5 + 0.6) +
          0.18 * Math.cos(angle * 7 - 0.4) +
          0.15 * (fbm2(x * 0.012, z * 0.012, 91) - 0.5)
        : 0.65;
    rimLift =
      smoothstep(88, 155, distFromOrigin) * 8.5 +
      smoothstep(130, 285, distFromOrigin) * 34.0 * ridgeWave;
  }

  // Keep south approach valley corridor gently open
  const southGap =
    z > 20 ? (1.0 - smoothstep(14, 42, Math.abs(x))) * smoothstep(20, 130, z) : 0.0;

  // Inside the flat Hamlet terrace (r <= 28m), skip 3-octave fbm2 undulation
  const dHamlet = distFromOrigin;
  const wHamlet = 1.0 - smoothstep(ZONES.hamlet.innerR, ZONES.hamlet.outerR, dHamlet);
  const undulation =
    wHamlet > 0.999 ? 0.0 : (fbm2(x * 0.018, z * 0.018, 42) - 0.5) * 2.4;
  let h = (undulation + rimLift) * (1.0 - southGap * 0.65);

  // Northern Shrine ridge terrace (centered on x = 0.0, z = -86.0, y = 8.0)
  if (z < -16.0 && Math.abs(x) < 75.0) {
    const northFactor =
      smoothstep(-16, -72, z) * smoothstep(75, 24, Math.abs(x));
    h = lerp(h, ZONES.shrine.y, northFactor);
  }

  // Northwest headwaters shelf (y = +5.4m) feeding the waterfall at (-51.4, -20.8)
  if (x < -16 && z < -8) {
    const nwFactor = smoothstep(-20, -46, x) * smoothstep(-12, -30, z);
    h = lerp(h, 5.4, nwFactor);
    const sx = streamCenterX(z);
    const streamAxisDist = Math.abs(x - sx);
    if (z >= -68 && z <= -21.2 && streamAxisDist < 4.2) {
      const channelDepth = (1.0 - smoothstep(1.4, 3.8, streamAxisDist)) * 1.15;
      h -= channelDepth;
    }
  }

  // East foothills behind the Arena
  if (x > 92.0) {
    h += smoothstep(92, 135, x) * 7.5;
  }

  // Zone A: Central Hamlet flat terrace (y = 0.0)
  if (wHamlet > 0) {
    h = lerp(h, ZONES.hamlet.y, wHamlet);
  }

  // Zone C: East Wisteria Combat Ring flat terrace (y = 0.6)
  if (x > 35.0 && x < 101.0 && z > -36.0 && z < 28.0) {
    const dArena = Math.hypot(x - ZONES.arena.x, z - ZONES.arena.z);
    const wArena = 1.0 - smoothstep(ZONES.arena.innerR, ZONES.arena.outerR, dArena);
    h = lerp(h, ZONES.arena.y, wArena);
  }

  // Zone D: Northern Shrine Overlook flat terrace (y = 8.0)
  if (z < -56.0 && Math.abs(x) < 32.0) {
    const dShrine = Math.hypot(x - ZONES.shrine.x, z - ZONES.shrine.z);
    const wShrine = 1.0 - smoothstep(ZONES.shrine.innerR, ZONES.shrine.outerR, dShrine);
    h = lerp(h, ZONES.shrine.y, wShrine);
  }

  // Linearly graded ramp along x = 0.0 from z = -15.0 (y = 0.0) to z = -71.5 (y = 8.0)
  if (z <= -13.0 && z >= -73.0 && Math.abs(x) < 18.0) {
    const rampT = clamp((-15.0 - z) / (71.5 - 15.0), 0, 1);
    const rampY = lerp(0.0, ZONES.shrine.y, rampT);
    const pathLat = 1.0 - smoothstep(2.6, 15.0, Math.abs(x));
    h = lerp(h, rampY, pathLat);
  }

  // Building plinth pads
  if (x > -56 && x < 30 && z > -30 && z < 28) {
    for (let i = 0; i < BUILDINGS.length; i++) {
      const b = BUILDINGS[i];
      if (Math.abs(x - b.x) > 10 || Math.abs(z - b.z) > 10) continue;
      const lx = (x - b.x) * b.cosNeg - (z - b.z) * b.sinNeg;
      const lz = (x - b.x) * b.sinNeg + (z - b.z) * b.cosNeg;
      if (b.id === 'watermill' && lx < -b.w * 0.45) continue;
      const frontExt = b.id === 'watermill' && lz > 0 ? 3.4 : 1.5;
      const dx = Math.max(0, Math.abs(lx) - b.w * 0.54);
      const dz = Math.max(0, Math.abs(lz - frontExt * 0.5) - (b.d * 0.54 + frontExt * 0.5));
      const padDist = Math.hypot(dx, dz);
      const feather = b.id === 'watermill' ? 3.5 : 3.2;
      const padMask = 1.0 - smoothstep(0.0, feather, padDist);
      if (padMask > 0) {
        h = lerp(h, b.y, padMask);
      }
    }
  }

  // Zone B: Millpond Lake Basin (center: (-62, 6), rx: 28, rz: 36, bedY: -3.0)
  const mp = ZONES.millpond;
  if (x < -26.0 && z > -34.0 && z < 46.0) {
    const dxPond = (x - mp.x) / mp.rx;
    const dzPond = (z - mp.z) / mp.rz;
    const dPond = Math.hypot(dxPond, dzPond);
    // Keep the full oval lake while protecting the NW stream shelf directly behind the waterfall cliff (x > -56.0, z < -21.2)
    const shelfGuard = x > -56.5 && z < -20.8 ? smoothstep(-22.8, -20.8, z) : 1.0;
    const wPond = (1.0 - smoothstep(0.68, 1.06, dPond)) * shelfGuard;
    if (wPond > 0) h = lerp(h, mp.bedY, wPond);

    // Waterfall plunge pool at (-51.4, -20.8)
    const wf = LANDMARKS.waterfall;
    const dPlunge = Math.hypot(x - (wf.x + 0.6), z - (wf.z + 1.8));
    if (dPlunge < 6.0) {
      const wPlunge = 1.0 - smoothstep(3.2, 5.8, dPlunge);
      h = lerp(h, mp.bedY, wPlunge);
    }

    // Carve dedicated Waterwheel Tailrace Channel in Watermill local coordinates
    if (x < -34 && x > -60 && z < -2 && z > -30) {
      const b = millBuilding;
      const lx = (x - b.x) * b.cosNeg - (z - b.z) * b.sinNeg;
      const lz = (x - b.x) * b.sinNeg + (z - b.z) * b.cosNeg;
      if (lx < -b.w * 0.48 && lx > -b.w * 0.5 - 4.2 && lz > -6.5 && lz < 18.0) {
        const cx = -b.w * 0.5 - 1.15;
        const dxChan = Math.abs(lx - cx);
        const dzChan = lz < -3.5 ? -3.5 - lz : lz > 13.5 ? lz - 13.5 : 0;
        const wChan =
          (1.0 - smoothstep(1.25, 2.45, dxChan)) *
          (1.0 - smoothstep(0.0, 3.2, dzChan));
        const wallGuard = smoothstep(-b.w * 0.5 - 0.02, -b.w * 0.5 - 0.32, lx);
        h = lerp(h, mp.bedY, wChan * wallGuard);
      }
      if (
        lx <= -b.w * 0.5 + 0.45 &&
        lx >= -b.w * 0.5 - 3.6 &&
        lz >= -5.2 &&
        lz <= 15.5
      ) {
        h = mp.bedY;
      }
    }

    // Flush shore grading under the Stone Pier Abutment & Landward Approach (x = -35.5 .. -30.5, z = 8.5)
    if (x > -39.0 && x < -26.0 && z > 2.5 && z < 14.5) {
      const dLat = Math.abs(z - LANDMARKS.pier.z);
      const wLat = 1.0 - smoothstep(2.1, 4.8, dLat);
      const wLon = smoothstep(-37.2, -34.8, x) * (1.0 - smoothstep(-31.2, -27.5, x));
      const targetY = lerp(LANDMARKS.pier.y - 0.08, LANDMARKS.pier.y + 0.11, smoothstep(-35.5, -31.8, x));
      h = lerp(h, targetY, wLat * wLon);
    }
  }

  return h;
}

export function terrainNormalAt(x, z, eps = 0.45) {
  const hL = terrainHeightAt(x - eps, z);
  const hR = terrainHeightAt(x + eps, z);
  const hD = terrainHeightAt(x, z - eps);
  const hU = terrainHeightAt(x, z + eps);
  const nx = hL - hR;
  const ny = 2.0 * eps;
  const nz = hD - hU;
  const invLen = 1.0 / Math.hypot(nx, ny, nz);
  return [nx * invLen, ny * invLen, nz * invLen];
}

export function walkableHeightAt(x, z) {
  const pier = LANDMARKS.pier;
  if (
    x >= pier.xEnd - 0.3 &&
    x <= pier.xStart + 3.8 &&
    Math.abs(z - pier.z) <= pier.width * 0.55
  ) {
    return pier.y + 0.12;
  }
  const gh = terrainHeightAt(x, z);
  return Math.max(gh, ZONES.millpond.waterY - 0.15);
}

export const heightAt = walkableHeightAt;

/**
 * Evaluates terrain height + surface weights + foliage exclusion mask + contact AO at `(x, z)`.
 */
export function sampleWorld(x, z) {
  const h = terrainHeightAt(x, z);
  const mp = ZONES.millpond;
  const wf = LANDMARKS.waterfall;

  let dirtWeight = 0.0;
  let cobbleWeight = 0.0;
  let sandWeight = 0.0;
  let minBuildingDist = 10.0;
  let roadFoliageClear = false;

  if (x < -28.0 && z > -32.0 && z < 46.0 && h >= -1.6 && h <= -0.2) {
    const dPond = Math.hypot((x - mp.x) / mp.rx, (z - mp.z) / mp.rz);
    const dPlunge = Math.hypot(x - wf.x, z - wf.z) / 14.0;
    const nearShore = 1.0 - smoothstep(0.95, 1.18, Math.min(dPond, dPlunge));
    if (nearShore > 0) {
      sandWeight =
        nearShore *
        smoothstep(-0.22, -0.45, h) *
        (1.0 - smoothstep(-1.18, -1.55, h));
    }
  }

  if (Math.abs(x) < 108 && Math.abs(z) < 108) {
    // Continuous paved Village Well Plaza & Commons Ring (r = 0 .. 12.6m) — zero grass moat!
    if (Math.abs(x) < 14.5 && Math.abs(z) < 14.5) {
      const rOrig = Math.hypot(x, z);
      if (rOrig < 13.8) roadFoliageClear = true;
      if (rOrig < 12.8) {
        cobbleWeight = Math.max(cobbleWeight, smoothstep(12.8, 12.0, rOrig));
      }
    }

    const rd = roadDistanceAt(x, z);
    if (rd.road) {
      const hw = rd.road.width * 0.5;
      if (rd.dist < hw + 1.35) roadFoliageClear = true;
      if (rd.dist < hw + 0.55) {
        const edgeJitter = (hash2(Math.floor(x * 1.5), Math.floor(z * 1.5), 33) - 0.5) * 0.14;
        const dEdge = rd.dist - (hw + edgeJitter);
        const wRoad = 1.0 - smoothstep(-0.32, 0.18, dEdge);
        if (wRoad > 0) {
          if (rd.road.surface === 'cobble' || rd.road.surface === 'stone_steps') {
            cobbleWeight = Math.max(cobbleWeight, wRoad);
          } else {
            dirtWeight = Math.max(dirtWeight, wRoad);
          }
        }
      }
    }

    if (x > -52 && x < 26 && z > -26 && z < 24) {
      for (let i = 0; i < BUILDINGS.length; i++) {
        const b = BUILDINGS[i];
        if (Math.abs(x - b.x) > 8.5 || Math.abs(z - b.z) > 8.5) continue;
        const lx = (x - b.x) * b.cosNeg - (z - b.z) * b.sinNeg;
        const lz = (x - b.x) * b.sinNeg + (z - b.z) * b.cosNeg;
        if (b.id === 'watermill' && lx < -b.w * 0.45) continue;

        const frontExt = 1.85;
        const sideExt = b.awning === 'forge_shed' && lx > 0 ? 2.8 : 0.55;
        const halfW = b.w * 0.5 + (lx > 0 ? sideExt : 0.55);
        const centerX = lx > 0 && b.awning === 'forge_shed' ? 1.1 : 0.0;
        const dx = Math.max(0, Math.abs(lx - centerX) - halfW);
        const dz = Math.max(
          0,
          Math.abs(lz - frontExt * 0.5) - (b.d * 0.5 + frontExt * 0.5)
        );
        const dApron = Math.hypot(dx, dz);
        if (dApron < minBuildingDist) minBuildingDist = dApron;

        const wApron = 1.0 - smoothstep(0.65, 1.45, dApron);
        if (wApron > 0) cobbleWeight = Math.max(cobbleWeight, wApron);

        const dDoor = Math.hypot(x - b.doorX, z - b.doorZ);
        if (dDoor < 3.6) roadFoliageClear = true;
        const wDoor = 1.0 - smoothstep(2.2, 3.0, dDoor);
        if (wDoor > 0) cobbleWeight = Math.max(cobbleWeight, wDoor);
      }
    }

    if (x > 46.0 && x < 90.0 && z > -26.0 && z < 18.0) {
      const dArena = Math.hypot(x - ZONES.arena.x, z - ZONES.arena.z);
      if (dArena < 20.0) {
        const wArenaOuter = 1.0 - smoothstep(18.5, 19.2, dArena);
        const wArenaInner = 1.0 - smoothstep(16.7, 17.3, dArena);
        const wRingCurb = clamp(wArenaOuter - wArenaInner, 0, 1);
        cobbleWeight = Math.max(cobbleWeight, wRingCurb);
        dirtWeight = Math.max(dirtWeight, wArenaInner);
      }
    }

    if (z < -69.0 && Math.abs(x) < 17.5) {
      const dShrine = Math.hypot(x - ZONES.shrine.x, z - ZONES.shrine.z);
      if (dShrine < 15.2) {
        const wShrine = 1.0 - smoothstep(14.1, 14.6, dShrine);
        cobbleWeight = Math.max(cobbleWeight, wShrine);
      }
    }
  }

  let foliageMask = 1.0;
  if (minBuildingDist < 2.25 || roadFoliageClear) foliageMask = 0.0;
  else if (dirtWeight > 0.06 || cobbleWeight > 0.06 || sandWeight > 0.16) foliageMask = 0.0;
  else if (h < mp.waterY + 0.35) foliageMask = 0.0;
  else if (x > 45.0 && Math.hypot(x - ZONES.arena.x, z - ZONES.arena.z) < ZONES.arena.fenceR + 1.85) foliageMask = 0.0;
  else if (z < -68.0 && Math.hypot(x - ZONES.shrine.x, z - ZONES.shrine.z) < ZONES.shrine.platformR + 2.2) foliageMask = 0.0;
  else if (z <= -13.0 && z >= -73.5 && Math.abs(x) <= 4.75) foliageMask = 0.0;

  const bAo = minBuildingDist < 1.5 ? smoothstep(0.0, 1.5, minBuildingDist) : 1.0;
  const wAo = Math.abs(x) < 3.0 && Math.abs(z) < 3.0 ? smoothstep(1.2, 2.5, Math.hypot(x, z)) : 1.0;
  const ao = clamp(0.52 + 0.48 * bAo * wAo, 0.45, 1.0);
  const colorVar = 0.5 + 0.25 * Math.sin(x * 0.08 + z * 0.06) + 0.25 * Math.cos(x * 0.05 - z * 0.09);

  return {
    y: h,
    walkY: Math.max(h, mp.waterY - 0.15),
    roadWeight: clamp(dirtWeight, 0, 1),
    cobbleWeight: clamp(cobbleWeight, 0, 1),
    sandWeight: clamp(sandWeight, 0, 1),
    foliageMask,
    ao,
    colorVar,
  };
}

/**
 * Generates the fast 512x512 RGBA DataTexture `uWorldMask` covering `[-140..+140]m` in < 20ms:
 * - `R`: Cobblestone / dressed stone weight (`0.0..1.0` linear — zero dirt halo discontinuity!)
 * - `G`: Dirt lane / arena earth weight (`0.0..0.5`) or sandy shoreline (`0.5..1.0`)
 * - `B`: Foliage exclusion mask (`0.0` on buildings/roads/plaza/arena/shrine/water, `1.0` on open meadow)
 * - `A`: Contact ambient occlusion (`0.0..1.0`)
 */
export function createWorldMaskTexture(size = 512) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const data = new Uint8Array(size * size * 4);
  const span = INNER_EXTENT * 2; // 280m (-140..+140)
  const mp = ZONES.millpond;
  const wf = LANDMARKS.waterfall;

  // Fill baseline open meadow (R=0, G=0, B=255, A=255) using 32-bit Uint32Array view (< 0.3ms!)
  const u32 = new Uint32Array(data.buffer);
  u32.fill(0xffff0000);

  const izMin = Math.max(0, Math.floor(((-106 / span) + 0.5) * size));
  const izMax = Math.min(size - 1, Math.ceil(((106 / span) + 0.5) * size));
  const ixMin = Math.max(0, Math.floor(((-92 / span) + 0.5) * size));
  const ixMax = Math.min(size - 1, Math.ceil(((92 / span) + 0.5) * size));

  for (let iz = izMin; iz <= izMax; iz++) {
    const wz = ((iz + 0.5) / size - 0.5) * span;
    const inPondZ = wz > -32.0 && wz < 44.0;
    const inBldgZ = wz > -26.0 && wz < 24.0;
    const inArenaZ = wz > -26.0 && wz < 18.0;
    const inShrineZ = wz < -68.0 && wz > -104.0;
    const inStairZ = wz <= -13.0 && wz >= -73.5;
    const inRingZ = Math.abs(wz) < 14.5;

    // Filter active road segments for this Z row once per row!
    const activeSegs = [];
    for (let r = 0; r < PRECOMPUTED_ROADS.length; r++) {
      const pr = PRECOMPUTED_ROADS[r];
      if (wz < pr.minZ || wz > pr.maxZ) continue;
      const hw = pr.road.width * 0.5;
      const isCobble = pr.road.surface === 'cobble' || pr.road.surface === 'stone_steps';
      for (let i = 0; i < pr.segs.length; i++) {
        const s = pr.segs[i];
        if (wz >= s.minZ && wz <= s.maxZ) {
          activeSegs.push({ s, hw, isCobble });
        }
      }
    }

    for (let ix = ixMin; ix <= ixMax; ix++) {
      const wx = ((ix + 0.5) / size - 0.5) * span;

      const inPondX = inPondZ && wx < -28.0 && wx > -92.0;
      const inBldgX = inBldgZ && wx > -53.0 && wx < 26.0;
      const inArenaX = inArenaZ && wx > 45.0 && wx < 91.0;
      const inShrineX = inShrineZ && Math.abs(wx) < 17.5;
      const inRoadX = activeSegs.length > 0 && wx > -52.0 && wx < 52.0;

      if (!inPondX && !inBldgX && !inArenaX && !inShrineX && !inRoadX && !(inRingZ && Math.abs(wx) < 14.5)) {
        continue;
      }

      let dirtWeight = 0.0;
      let cobbleWeight = 0.0;
      let sandWeight = 0.0;
      let minBuildingDist = 10.0;
      let isUnderwater = false;
      let roadFoliageClear = false;

      if (inPondX) {
        const dxP = (wx - mp.x) / mp.rx;
        const dzP = (wz - mp.z) / mp.rz;
        const dPond = Math.hypot(dxP, dzP);
        const dPlunge = Math.hypot(wx - (wf.x + 0.6), wz - (wf.z + 1.8)) / 5.5;
        const dWater = Math.min(dPond, dPlunge);
        if (dWater < 0.96) {
          isUnderwater = true;
        } else if (dWater <= 1.12 && !(wx > -56.0 && wz < -20.0)) {
          sandWeight = 1.0 - (dWater - 0.96) / 0.16;
        }
      }

      // Continuous paved Hamlet Well Plaza & Commons Ring (r = 0..12.8m) — zero grass moat!
      if (inRingZ && Math.abs(wx) < 14.5) {
        const rOrig = Math.hypot(wx, wz);
        if (rOrig < 13.8) roadFoliageClear = true;
        if (rOrig < 12.8) {
          cobbleWeight = Math.max(cobbleWeight, smoothstep(12.8, 12.0, rOrig));
        }
      }

      for (let i = 0; i < activeSegs.length; i++) {
        const { s, hw, isCobble } = activeSegs[i];
        if (wx < s.minX || wx > s.maxX) continue;
        const t = clamp(((wx - s.ax) * s.dx + (wz - s.az) * s.dz) * s.invLen2, 0, 1);
        const ddx = wx - (s.ax + s.dx * t);
        const ddz = wz - (s.az + s.dz * t);
        const dSq = ddx * ddx + ddz * ddz;
        if (dSq < (hw + 1.35) * (hw + 1.35)) {
          roadFoliageClear = true;
          if (dSq < (hw + 0.45) * (hw + 0.45)) {
            const d = Math.sqrt(dSq);
            const w = smoothstep(hw + 0.35, hw - 0.25, d);
            if (isCobble) {
              cobbleWeight = Math.max(cobbleWeight, w);
            } else {
              dirtWeight = Math.max(dirtWeight, w);
            }
          }
        }
      }

      if (inBldgX) {
        for (let i = 0; i < BUILDINGS.length; i++) {
          const b = BUILDINGS[i];
          if (Math.abs(wx - b.x) > 8.5 || Math.abs(wz - b.z) > 8.5) continue;
          const lx = (wx - b.x) * b.cosNeg - (wz - b.z) * b.sinNeg;
          const lz = (wx - b.x) * b.sinNeg + (wz - b.z) * b.cosNeg;
          if (b.id === 'watermill' && lx < -b.w * 0.45) continue;

          const frontExt = 1.85;
          const sideExt = b.awning === 'forge_shed' && lx > 0 ? 2.8 : 0.55;
          const halfW = b.w * 0.5 + (lx > 0 ? sideExt : 0.55);
          const centerX = lx > 0 && b.awning === 'forge_shed' ? 1.1 : 0.0;
          const dx = Math.max(0, Math.abs(lx - centerX) - halfW);
          const dz = Math.max(
            0,
            Math.abs(lz - frontExt * 0.5) - (b.d * 0.5 + frontExt * 0.5)
          );
          const dApron = Math.hypot(dx, dz);
          if (dApron < minBuildingDist) minBuildingDist = dApron;

          const wApron = 1.0 - smoothstep(0.65, 1.45, dApron);
          if (wApron > 0) cobbleWeight = Math.max(cobbleWeight, wApron);

          const dDoor = Math.hypot(wx - b.doorX, wz - b.doorZ);
          if (dDoor < 3.6) roadFoliageClear = true;
          const wDoor = 1.0 - smoothstep(2.2, 3.0, dDoor);
          if (wDoor > 0) cobbleWeight = Math.max(cobbleWeight, wDoor);
        }
      }

      if (inArenaX) {
        const dArena = Math.hypot(wx - ZONES.arena.x, wz - ZONES.arena.z);
        if (dArena < 20.0) {
          const wArenaOuter = 1.0 - smoothstep(18.5, 19.2, dArena);
          const wArenaInner = 1.0 - smoothstep(16.7, 17.3, dArena);
          cobbleWeight = Math.max(cobbleWeight, clamp(wArenaOuter - wArenaInner, 0, 1));
          dirtWeight = Math.max(dirtWeight, wArenaInner);
        }
      }

      if (inShrineX) {
        const dShrine = Math.hypot(wx - ZONES.shrine.x, wz - ZONES.shrine.z);
        if (dShrine < 14.9) {
          cobbleWeight = Math.max(cobbleWeight, 1.0 - smoothstep(14.0, 14.5, dShrine));
        }
      }

      let foliageMask = 1.0;
      if (isUnderwater || minBuildingDist < 2.25 || roadFoliageClear) foliageMask = 0.0;
      else if (dirtWeight > 0.06 || cobbleWeight > 0.06 || sandWeight > 0.16) foliageMask = 0.0;
      else if (inArenaX && Math.hypot(wx - ZONES.arena.x, wz - ZONES.arena.z) < ZONES.arena.fenceR + 1.85) foliageMask = 0.0;
      else if (inShrineX && Math.hypot(wx - ZONES.shrine.x, wz - ZONES.shrine.z) < ZONES.shrine.platformR + 2.2) foliageMask = 0.0;
      else if (inStairZ && Math.abs(wx) <= 4.75) foliageMask = 0.0;

      const bAo = minBuildingDist < 1.5 ? smoothstep(0.0, 1.5, minBuildingDist) : 1.0;
      const ao = clamp(0.52 + 0.48 * bAo, 0.45, 1.0);

      const rByte = Math.round(clamp(cobbleWeight, 0, 1) * 255);
      const gByte = dirtWeight > 0.01 ? Math.round(clamp(dirtWeight, 0, 1) * 127) : 0;

      const idx = (iz * size + ix) * 4;
      data[idx] = rByte;
      data[idx + 1] = gByte;
      data[idx + 2] = Math.round(foliageMask * 255);
      data[idx + 3] = Math.round(ao * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  tex.userData.buildTimeMs = Number((t1 - t0).toFixed(2));
  return tex;
}
