import * as THREE from 'three';

/**
 * Haru-machi Wave 1C Expanded Valley & Toroidal Map Geography (`world/assets/terrain/geography.js`).
 *
 * - `PLAY_BOUNDARY_RADIUS = 165`
 * - `INNER_EXTENT = 170` (`340m × 340m` inner playable valley, `-170..+170`)
 * - `OUTER_EXTENT = 360`, `WORLD_SIZE = 720` (`720m × 720m` outer valley & mountain skirt, `-360..+360`)
 * - `ZONES.hamlet` at `(0, 0, y = 0.0)`, `r = 10.5m` ring road, 4 inward-facing cottages
 * - `ZONES.millpond` at `(-62, 6, waterY = -1.2, bedY = -3.0, rx = 28, rz = 36)`,
 *   `watermill` at `(-44.0, -18.0, y = 0.3, rotY = 0.42)`, `waterfall` at `(-51.4, -20.8, topY = 5.2, bottomY = -1.2)`,
 *   `pier` at `xStart = -35.5, xEnd = -52.0, z = 8.5, y = -0.35`, plus shallow wading sandbar/causeway to `(-42, 18)`
 * - `ZONES.arena` at `(68, -4, y = 0.6, fenceR = 19.5)` with Wisteria hero trees >= 5.0m outside the fence
 * - `ZONES.shrine` at `(0.0, -86.0, y = 8.0, platformR = 14.5)` at top of 56-step axial staircase (`z = -15.0 -> -71.5`),
 *   Romanesque Stone Archway at `(0.0, -93.5)`, and raised stone planters at `(±10.6, -90.8)`
 * - `ZONES.flowerLobby` at `(0.0, 128.0, y = 1.6, innerR = 22.0, outerR = 34.0)` connected by winding
 *   `~110m` country dirt road (`id: 'south_flower_road'`) with 2 flat roadside skeleton patrol clearings
 *   at `(-14, 86)` and `(16, 52)` (`r = 10.5m`).
 * - `INSCRIPTION_STONES` at Town Plaza `(0, -14)`, Lakeside Pier `(-42, 18)`, and Wisteria Grove `(44, 16)`.
 */

export const PLAY_BOUNDARY_RADIUS = 165;
export const INNER_EXTENT = 170; // 340m x 340m high-res chunked inner valley (-170..+170)
export const TERRAIN_SIZE = 340;
export const OUTER_EXTENT = 360; // 720m x 720m outer mountain & valley skirt (-360..+360)
export const WORLD_SIZE = 720;

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
  flowerLobby: {
    id: 'flowerLobby',
    name: 'Zone E · Southern Flower Field Lobby',
    x: 0.0,
    z: 128.0,
    y: 1.6,
    innerR: 22.0,
    outerR: 34.0,
  },
};

export const PATROL_CLEARINGS = [
  {
    id: 'clearing_south_east',
    name: 'Lower Roadside Patrol Clearing',
    x: 16.0,
    z: 52.0,
    y: 0.55,
    r: 10.5,
    outerR: 15.5,
  },
  {
    id: 'clearing_south_west',
    name: 'Upper Roadside Patrol Clearing',
    x: -14.0,
    z: 86.0,
    y: 1.05,
    r: 10.5,
    outerR: 15.5,
  },
];

export const INSCRIPTION_STONES = [
  {
    id: 'stone_plaza',
    name: 'Town Plaza Sacred Inscription Stone',
    x: 0.0,
    z: -14.0,
    y: 0.0,
    rotY: 0.0,
  },
  {
    id: 'stone_pier',
    name: 'Lakeside Pier Sacred Inscription Stone',
    x: -42.0,
    z: 18.0,
    y: -1.08,
    rotY: 0.48,
  },
  {
    id: 'stone_grove',
    name: 'Wisteria Grove Sacred Inscription Stone',
    x: 44.0,
    z: 16.0,
    y: 0.42,
    rotY: -0.38,
  },
];

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
    id: 'south_flower_road',
    name: 'Southern Flower Field Country Road',
    width: 4.4,
    surface: 'dirt',
    points: [
      [0.0, 144.0],
      [0.0, 135.0],
      [0.0, 128.0],
      [0.0, 122.0],
      [-3.2, 109.0],
      [-6.0, 96.0],
      [-1.5, 82.0],
      [10.0, 68.0],
      [2.0, 55.0],
      [-8.0, 42.0],
      [-3.8, 26.0],
      [0.0, RING_RADIUS],
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
    id: 'pier_stone_causeway',
    name: 'Lakeside Sacred Stone Causeway',
    width: 3.2,
    surface: 'cobble',
    points: [
      [-33.2, 9.8],
      [-35.8, 13.8],
      [-39.2, 16.4],
      [-42.0, 18.0],
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
    id: 'wisteria_grove_path',
    name: 'Sacred Wisteria Grove Trail',
    width: 3.2,
    surface: 'dirt',
    points: [
      [36.0, -3.2],
      [40.2, 6.5],
      [44.0, 16.0],
    ],
  },
  {
    id: 'north_shrine_approach',
    name: 'Northern Staircase Approach',
    width: 11.6,
    surface: 'cobble',
    points: [
      [0.0, -RING_RADIUS],
      [0.0, -15.0],
    ],
  },
  {
    id: 'north_shrine_climb',
    name: 'Northern Shrine Stepped Path',
    width: 11.6,
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
  inscriptionStones: INSCRIPTION_STONES,
  patrolClearings: PATROL_CLEARINGS,
};

// All 68 trees verified for >= 5.0m clearance from arena fence (r=19.5 around (68,-4)),
// >= 4.5m clearance from all roads/stairs, >= 13.5m from patrol clearing centers,
// >= 25.0m from Southern Flower Field Lobby center (0, 128), and zero overlap with rocks or buildings.
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

  // Grove 8: Sacred Wisteria Grove around Stone (44, 16) (4 trees)
  { id: 'wisteria_grove_n', kind: 'wisteria', variant: 0, x: 36.5,  z: 14.8,  scale: 1.26, label: 'Sacred Grove North Wisteria' },
  { id: 'wisteria_grove_e', kind: 'wisteria', variant: 1, x: 52.4,  z: 17.2,  scale: 1.36, label: 'Sacred Grove East Wisteria' },
  { id: 'wisteria_grove_s', kind: 'wisteria', variant: 2, x: 42.5,  z: 24.2,  scale: 1.26, label: 'Sacred Grove South Wisteria' },
  { kind: 'sakura',   variant: 0, x: 34.8,  z: 21.8,  scale: 1.08 },

  // Grove 9: South-West Hamlet Approach Woodland Grove (4 trees)
  { kind: 'oak',      variant: 0, x: -26.0, z: 31.0,  scale: 1.24 },
  { kind: 'sakura',   variant: 1, x: -19.5, z: 36.5,  scale: 1.04 },
  { kind: 'wisteria', variant: 2, x: -21.0, z: 46.5,  scale: 1.18 },
  { kind: 'oak',      variant: 0, x: -26.5, z: 54.0,  scale: 0.96 },

  // Grove 10: South-East Hamlet Approach & Patrol Clearing Perimeter Grove (4 trees)
  { kind: 'oak',      variant: 0, x: 25.0,  z: 30.0,  scale: 1.20 },
  { kind: 'sakura',   variant: 2, x: 18.5,  z: 36.5,  scale: 1.04 },
  { kind: 'wisteria', variant: 1, x: 30.5,  z: 49.0,  scale: 1.22 },
  { kind: 'oak',      variant: 0, x: 28.5,  z: 60.5,  scale: 1.06 },

  // Grove 11: Mid-South Valley & Upper Patrol Clearing Perimeter Groves (4 trees)
  { kind: 'oak',      variant: 1, x: -28.5, z: 78.0,  scale: 1.22 },
  { kind: 'wisteria', variant: 0, x: -27.5, z: 92.5,  scale: 1.26 },
  { kind: 'oak',      variant: 0, x: 14.5,  z: 80.0,  scale: 1.20 },
  { kind: 'sakura',   variant: 2, x: 20.5,  z: 91.5,  scale: 1.08 },

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

  // Grove 14: Southern Country Road Approach Groves (4 trees)
  { kind: 'wisteria', variant: 0, x: -21.5, z: 106.0, scale: 1.28 },
  { kind: 'sakura',   variant: 1, x: -14.5, z: 112.5, scale: 1.12 },
  { kind: 'oak',      variant: 2, x: 14.5,  z: 105.0, scale: 1.22 },
  { kind: 'wisteria', variant: 1, x: 21.5,  z: 111.5, scale: 1.26 },

  // Grove 15: Southern Flower Field Lobby West Wisteria Curtain Grove (5 trees, matching 01-title.png left)
  { id: 'wisteria_lobby_w1', kind: 'wisteria', variant: 0, x: -25.5, z: 122.0, scale: 1.38, label: 'Flower Lobby West Hero Wisteria' },
  { id: 'wisteria_lobby_w2', kind: 'wisteria', variant: 1, x: -27.0, z: 133.5, scale: 1.32, label: 'Flower Lobby SW Wisteria' },
  { kind: 'sakura',   variant: 2, x: -22.5, z: 143.0, scale: 1.18 },
  { kind: 'oak',      variant: 0, x: -35.5, z: 127.5, scale: 1.24 },
  { kind: 'wisteria', variant: 2, x: -16.5, z: 149.5, scale: 1.24 },

  // Grove 16: Southern Flower Field Lobby East Wisteria Curtain Grove (5 trees, matching 01-title.png right)
  { id: 'wisteria_lobby_e1', kind: 'wisteria', variant: 0, x: 25.5,  z: 122.5, scale: 1.38, label: 'Flower Lobby East Hero Wisteria' },
  { id: 'wisteria_lobby_e2', kind: 'wisteria', variant: 2, x: 27.0,  z: 134.0, scale: 1.30, label: 'Flower Lobby SE Wisteria' },
  { kind: 'sakura',   variant: 1, x: 22.5,  z: 143.5, scale: 1.16 },
  { kind: 'oak',      variant: 1, x: 35.5,  z: 128.0, scale: 1.22 },
  { kind: 'wisteria', variant: 0, x: 16.5,  z: 149.5, scale: 1.24 },

  // Grove 17: Southern Horizon Rim & Outer Meadow Groves (3 trees)
  { id: 'wisteria_lobby_s',  kind: 'wisteria', variant: 1, x: 0.0,   z: 154.5, scale: 1.34, label: 'Flower Lobby South Crown Wisteria' },
  { kind: 'sakura',   variant: 0, x: -46.0, z: 108.0, scale: 1.18 },
  { kind: 'oak',      variant: 2, x: 46.0,  z: 106.0, scale: 1.20 },

  // Grove 18: Lakeside South Shore & Causeway Overlook Grove (3 trees)
  { id: 'wisteria_pier_s',   kind: 'wisteria', variant: 0, x: -31.5, z: 28.5,  scale: 1.26, label: 'Lakeside South Wisteria' },
  { kind: 'sakura',   variant: 1, x: -42.5, z: 36.0,  scale: 1.14 },
  { kind: 'oak',      variant: 0, x: -58.0, z: 46.0,  scale: 1.22 },
];

// 52 Multi-Faceted Chiseled Limestone Boulders (moss-topped, warm limestone sides, slate base AO)
export const BOULDERS = [
  // Group A: Southern Flower Field Lobby & Winding Country Road Bends (18 boulders)
  { x: -8.5,  z: 118.5, rx: 1.45, ry: 1.05, rz: 1.25, rotY: 0.40, mossy: true },
  { x: -10.2, z: 120.2, rx: 0.85, ry: 0.65, rz: 0.78, rotY: 1.10, mossy: false },
  { x: 8.8,   z: 116.5, rx: 1.35, ry: 0.98, rz: 1.15, rotY: -0.50, mossy: true },
  { x: 10.4,  z: 118.0, rx: 0.78, ry: 0.58, rz: 0.72, rotY: 0.20, mossy: false },
  { x: -23.5, z: 116.0, rx: 1.85, ry: 1.35, rz: 1.55, rotY: 0.80, mossy: true },
  { x: 23.5,  z: 117.0, rx: 1.75, ry: 1.28, rz: 1.48, rotY: -0.70, mossy: true },
  { x: -24.0, z: 138.5, rx: 1.65, ry: 1.22, rz: 1.42, rotY: 0.30, mossy: true },
  { x: 24.2,  z: 139.0, rx: 1.60, ry: 1.18, rz: 1.38, rotY: -0.40, mossy: true },
  { x: -12.5, z: 101.5, rx: 1.50, ry: 1.10, rz: 1.30, rotY: 0.60, mossy: true },
  { x: -14.2, z: 103.0, rx: 0.92, ry: 0.68, rz: 0.84, rotY: 1.40, mossy: false },
  { x: 5.5,   z: 94.0,  rx: 1.38, ry: 0.96, rz: 1.18, rotY: -0.30, mossy: true },
  { x: -25.8, z: 85.0,  rx: 1.72, ry: 1.26, rz: 1.48, rotY: 0.90, mossy: true },
  { x: -9.5,  z: 73.5,  rx: 1.42, ry: 1.04, rz: 1.22, rotY: 0.20, mossy: true },
  { x: 19.5,  z: 68.5,  rx: 1.65, ry: 1.20, rz: 1.40, rotY: -0.60, mossy: true },
  { x: 27.8,  z: 51.5,  rx: 1.78, ry: 1.30, rz: 1.52, rotY: 0.50, mossy: true },
  { x: -16.5, z: 41.5,  rx: 1.48, ry: 1.08, rz: 1.26, rotY: -0.80, mossy: true },
  { x: 6.5,   z: 36.0,  rx: 1.32, ry: 0.94, rz: 1.14, rotY: 0.70, mossy: true },
  { x: -10.5, z: 24.5,  rx: 1.22, ry: 0.88, rz: 1.05, rotY: -0.20, mossy: false },

  // Group B: Lakeside Pier, Causeway & Millpond Banks (12 boulders)
  { x: -36.2, z: 21.5,  rx: 1.35, ry: 0.95, rz: 1.18, rotY: 0.50, mossy: true },
  { x: -33.8, z: 22.8,  rx: 1.28, ry: 0.92, rz: 1.10, rotY: -0.40, mossy: true },
  { x: -31.5, z: 19.5,  rx: 1.55, ry: 1.12, rz: 1.35, rotY: 0.90, mossy: true },
  { x: -29.0, z: 3.5,   rx: 1.25, ry: 0.90, rz: 1.08, rotY: 0.30, mossy: false },
  { x: -34.0, z: -12.5, rx: 1.48, ry: 1.08, rz: 1.28, rotY: -0.60, mossy: true },
  { x: -52.0, z: 34.5,  rx: 1.85, ry: 1.32, rz: 1.60, rotY: 0.70, mossy: true },
  { x: -68.0, z: 41.0,  rx: 2.10, ry: 1.48, rz: 1.75, rotY: -0.30, mossy: true },
  { x: -86.5, z: 26.0,  rx: 1.95, ry: 1.40, rz: 1.65, rotY: 0.40, mossy: true },
  { x: -91.0, z: -2.0,  rx: 2.05, ry: 1.45, rz: 1.72, rotY: 1.10, mossy: true },
  { x: -85.0, z: -22.0, rx: 1.80, ry: 1.30, rz: 1.55, rotY: -0.50, mossy: true },
  { x: -64.0, z: -32.0, rx: 1.90, ry: 1.38, rz: 1.62, rotY: 0.20, mossy: true },
  { x: -42.0, z: -28.5, rx: 1.52, ry: 1.10, rz: 1.30, rotY: -0.70, mossy: true },

  // Group C: Northern Shrine Staircase Hillsides & Overlook Ridge (11 boulders)
  { x: -12.6, z: -22.5, rx: 1.38, ry: 1.02, rz: 1.18, rotY: 0.40, mossy: true },
  { x: 12.6,  z: -24.0, rx: 1.42, ry: 1.05, rz: 1.22, rotY: -0.50, mossy: true },
  { x: -13.8, z: -38.5, rx: 1.62, ry: 1.18, rz: 1.38, rotY: 0.80, mossy: true },
  { x: 13.8,  z: -41.0, rx: 1.58, ry: 1.15, rz: 1.35, rotY: -0.30, mossy: true },
  { x: -14.5, z: -56.0, rx: 1.75, ry: 1.28, rz: 1.48, rotY: 0.20, mossy: true },
  { x: 14.8,  z: -58.5, rx: 1.70, ry: 1.24, rz: 1.44, rotY: -0.70, mossy: true },
  { x: -18.5, z: -76.0, rx: 1.88, ry: 1.36, rz: 1.60, rotY: 0.60, mossy: true },
  { x: 18.5,  z: -76.5, rx: 1.85, ry: 1.34, rz: 1.58, rotY: -0.40, mossy: true },
  { x: -16.5, z: -96.0, rx: 2.05, ry: 1.48, rz: 1.72, rotY: 0.90, mossy: true },
  { x: 16.5,  z: -96.5, rx: 2.00, ry: 1.44, rz: 1.68, rotY: -0.80, mossy: true },
  { x: 0.0,   z: -105.0, rx: 2.25, ry: 1.58, rz: 1.85, rotY: 0.10, mossy: true },

  // Group D: East Arena Approach & Sacred Wisteria Grove Perimeter (11 boulders)
  { x: 28.5,  z: 4.5,   rx: 1.35, ry: 0.98, rz: 1.15, rotY: 0.30, mossy: true },
  { x: 34.0,  z: -10.5, rx: 1.45, ry: 1.06, rz: 1.24, rotY: -0.60, mossy: true },
  { x: 38.2,  z: 19.5,  rx: 1.32, ry: 0.95, rz: 1.12, rotY: 0.50, mossy: true },
  { x: 49.8,  z: 12.5,  rx: 1.40, ry: 1.02, rz: 1.20, rotY: -0.40, mossy: true },
  { x: 48.2,  z: 22.0,  rx: 0.95, ry: 0.70, rz: 0.85, rotY: 1.00, mossy: false },
  { x: 54.0,  z: -22.5, rx: 1.68, ry: 1.22, rz: 1.42, rotY: 0.70, mossy: true },
  { x: 56.5,  z: 16.5,  rx: 1.62, ry: 1.18, rz: 1.38, rotY: -0.50, mossy: true },
  { x: 86.0,  z: -24.0, rx: 1.85, ry: 1.34, rz: 1.56, rotY: 0.20, mossy: true },
  { x: 88.5,  z: 18.0,  rx: 1.80, ry: 1.30, rz: 1.52, rotY: -0.80, mossy: true },
  { x: 96.5,  z: -9.5,  rx: 1.95, ry: 1.42, rz: 1.65, rotY: 0.60, mossy: true },
  { x: 95.0,  z: 9.5,   rx: 1.90, ry: 1.38, rz: 1.60, rotY: -0.30, mossy: true },
];

// 10 Coursed Chiseled Dry-Stone Country Wall Segments along Southern Road Bends & Hamlet Approaches
export const DRY_STONE_WALLS = [
  { id: 'wall_lobby_w',     x0: -5.8,  z0: 113.0, x1: -11.5, z1: 121.5, height: 0.86, thickness: 0.54 },
  { id: 'wall_lobby_e',     x0: 5.8,   z0: 113.0, x1: 11.5,  z1: 121.5, height: 0.86, thickness: 0.54 },
  { id: 'wall_south_up_w',  x0: -10.5, z0: 90.0,  x1: -9.2,  z1: 100.5, height: 0.82, thickness: 0.52 },
  { id: 'wall_south_up_e',  x0: 3.5,   z0: 98.0,  x1: 4.8,   z1: 108.5, height: 0.82, thickness: 0.52 },
  { id: 'wall_south_mid_e', x0: 14.5,  z0: 62.5,  x1: 13.8,  z1: 73.0,  height: 0.84, thickness: 0.52 },
  { id: 'wall_south_low_w', x0: -12.5, z0: 36.5,  x1: -11.0, z1: 47.0,  height: 0.84, thickness: 0.52 },
  { id: 'wall_hamlet_sw',   x0: -6.8,  z0: 21.0,  x1: -10.8, z1: 30.5,  height: 0.80, thickness: 0.50 },
  { id: 'wall_hamlet_se',   x0: 4.8,   z0: 22.0,  x1: 2.2,   z1: 31.5,  height: 0.80, thickness: 0.50 },
  { id: 'wall_mill_lane_n', x0: -16.5, z0: 1.0,   x1: -25.5, z1: 4.0,   height: 0.78, thickness: 0.48 },
  { id: 'wall_arena_way_n', x0: 18.0,  z0: -4.2,  x1: 28.5,  z1: -5.4,  height: 0.78, thickness: 0.48 },
];

// 8 Wooden Split-Rail Timber Fence Segments framing the Southern Flower Field Approach & Pastures
export const ROADSIDE_FENCES = [
  { id: 'fence_lobby_nw', x0: -12.5, z0: 122.5, x1: -20.5, z1: 130.5, spans: 3 },
  { id: 'fence_lobby_sw', x0: -20.5, z0: 130.5, x1: -18.5, z1: 141.0, spans: 3 },
  { id: 'fence_lobby_ne', x0: 12.5,  z0: 122.5, x1: 20.5,  z1: 130.5, spans: 3 },
  { id: 'fence_lobby_se', x0: 20.5,  z0: 130.5, x1: 18.5,  z1: 141.0, spans: 3 },
  { id: 'fence_road_up_w', x0: -8.2, z0: 103.5, x1: -6.2,  z1: 112.0, spans: 2 },
  { id: 'fence_road_up_e', x0: 5.2,  z0: 109.5, x1: 5.6,   z1: 118.0, spans: 2 },
  { id: 'fence_clear_e_s', x0: 11.5, z0: 61.5,  x1: 21.5,  z1: 61.0,  spans: 3 },
  { id: 'fence_clear_w_n', x0: -19.5, z0: 76.5, x1: -9.5,  z1: 76.0,  spans: 3 },
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

  // Outer valley basin rise & mountain ridge cradle beyond r = 118m
  let rimLift = 0.0;
  if (distFromOrigin > 118.0) {
    const angle = Math.atan2(z, x);
    const ridgeWave =
      distFromOrigin > 165.0
        ? 0.65 +
          0.22 * Math.sin(angle * 5 + 0.6) +
          0.18 * Math.cos(angle * 7 - 0.4) +
          0.15 * (fbm2(x * 0.012, z * 0.012, 91) - 0.5)
        : 0.65;
    rimLift =
      smoothstep(118, 190, distFromOrigin) * 8.5 +
      smoothstep(168, 330, distFromOrigin) * 36.0 * ridgeWave;
  }

  // Keep south approach valley corridor gently open all the way to Flower Field Lobby (z = 128)
  const southGap =
    z > 18 ? (1.0 - smoothstep(16, 46, Math.abs(x))) * smoothstep(18, 152, z) : 0.0;

  // Inside the flat Hamlet terrace (r <= 28m), skip 3-octave fbm2 undulation
  const dHamlet = distFromOrigin;
  const wHamlet = 1.0 - smoothstep(ZONES.hamlet.innerR, ZONES.hamlet.outerR, dHamlet);
  const undulation =
    wHamlet > 0.999 ? 0.0 : (fbm2(x * 0.018, z * 0.018, 42) - 0.5) * 2.4;
  let h = (undulation + rimLift) * (1.0 - southGap * 0.72);

  // Northern Shrine ridge terrace (centered on x = 0.0, z = -86.0, y = 8.0)
  if (z < -18.0 && Math.abs(x) < 75.0) {
    const northFactor =
      smoothstep(-18, -72, z) * smoothstep(75, 24, Math.abs(x));
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
  if (x > 96.0) {
    h += smoothstep(96, 155, x) * 7.5;
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

  // Sacred Wisteria Grove Stone Terrace at (44.0, 16.0, y = 0.42)
  if (x > 34.0 && x < 54.0 && z > 6.0 && z < 26.0) {
    const dGroveStone = Math.hypot(x - 44.0, z - 16.0);
    const wGroveStone = 1.0 - smoothstep(4.5, 8.5, dGroveStone);
    if (wGroveStone > 0) {
      h = lerp(h, 0.42, wGroveStone);
    }
  }

  // Zone D: Northern Shrine Overlook flat terrace (y = 8.0)
  if (z < -56.0 && Math.abs(x) < 32.0) {
    const dShrine = Math.hypot(x - ZONES.shrine.x, z - ZONES.shrine.z);
    const wShrine = 1.0 - smoothstep(ZONES.shrine.innerR, ZONES.shrine.outerR, dShrine);
    h = lerp(h, ZONES.shrine.y, wShrine);
  }

  // Zone E: Southern Flower Field Lobby plateau at (0, 128, y = 1.6, innerR = 22.0, outerR = 34.0)
  if (z > 88.0 && z < 166.0 && Math.abs(x) < 38.0) {
    const dLobby = Math.hypot(x - ZONES.flowerLobby.x, z - ZONES.flowerLobby.z);
    const wLobby = 1.0 - smoothstep(ZONES.flowerLobby.innerR, ZONES.flowerLobby.outerR, dLobby);
    if (wLobby > 0) {
      h = lerp(h, ZONES.flowerLobby.y, wLobby);
    }
  }

  // 2 Flat Roadside Skeleton Patrol Clearings at (16, 52) and (-14, 86) (r = 10.5m)
  for (let i = 0; i < PATROL_CLEARINGS.length; i++) {
    const pc = PATROL_CLEARINGS[i];
    if (Math.abs(x - pc.x) < pc.outerR && Math.abs(z - pc.z) < pc.outerR) {
      const dPc = Math.hypot(x - pc.x, z - pc.z);
      const wPc = 1.0 - smoothstep(pc.r, pc.outerR, dPc);
      if (wPc > 0) {
        h = lerp(h, pc.y, wPc);
      }
    }
  }

  // Linearly graded ramp along x = 0.0 from z = -18.0 (y = 0.0) to z = -71.5 (y = 8.0) for the 11.6m Grand Staircase
  if (z <= -17.5 && z >= -73.0 && Math.abs(x) < 22.0) {
    const rampT = clamp((-18.0 - z) / (71.5 - 18.0), 0, 1);
    const rampY = lerp(0.0, ZONES.shrine.y, rampT);
    const pathLat = 1.0 - smoothstep(7.2, 20.0, Math.abs(x));
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

    // Walkable Shallow Sandbar & Stone Causeway to Lakeside Pier Sacred Stone at (-42.0, 18.0)
    // Connects shore (-33.0, 9.8) -> (-42.0, 18.0) with dry/ankle-deep elevation (y >= -1.36m, stone island at y = -1.08m)
    if (x > -49.0 && x < -30.0 && z > 7.5 && z < 25.0) {
      const ax = -33.0;
      const az = 9.8;
      const bx = -42.0;
      const bz = 18.0;
      const abx = bx - ax;
      const abz = bz - az;
      const tCauseway = clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz), 0, 1);
      const px = ax + abx * tCauseway;
      const pz = az + abz * tCauseway;
      const dCauseway = Math.hypot(x - px, z - pz);
      const wCauseway = 1.0 - smoothstep(2.6, 5.4, dCauseway);
      const causewayY = lerp(-0.55, -1.24, tCauseway);

      const dIsland = Math.hypot(x - (-42.0), z - 18.0);
      const wIsland = 1.0 - smoothstep(3.4, 6.6, dIsland);
      const islandY = -1.08;

      if (wCauseway > 0) {
        h = Math.max(h, lerp(h, causewayY, wCauseway));
      }
      if (wIsland > 0) {
        h = Math.max(h, lerp(h, islandY, wIsland));
      }
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
    const deckY = pier.y + 0.12;
    if (x > pier.xStart + 1.8) {
      const gh = terrainHeightAt(x, z);
      const t = clamp((pier.xStart + 3.8 - x) / 2.0, 0, 1);
      return lerp(gh, deckY, t);
    }
    return deckY;
  }
  const gh = terrainHeightAt(x, z);
  // Shallow ankle-deep wading floor clamped at waterY - 0.35 = -1.55m
  return Math.max(gh, ZONES.millpond.waterY - 0.35);
}

export const heightAt = walkableHeightAt;

/**
 * Evaluates terrain height + surface weights + foliage exclusion mask + contact AO at `(x, z)`
 * across the full `INNER_EXTENT = 170` (`[-170..+170]m`).
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

  if (x < -28.0 && z > -32.0 && z < 46.0 && h >= -1.62 && h <= -0.18) {
    const dPond = Math.hypot((x - mp.x) / mp.rx, (z - mp.z) / mp.rz);
    const dPlunge = Math.hypot(x - wf.x, z - wf.z) / 14.0;
    const dPierStone = Math.hypot(x - (-42.0), z - 18.0) / 7.5;
    const nearShore = 1.0 - smoothstep(0.95, 1.18, Math.min(dPond, dPlunge, dPierStone));
    if (nearShore > 0) {
      sandWeight =
        nearShore *
        smoothstep(-0.18, -0.45, h) *
        (1.0 - smoothstep(-1.22, -1.58, h));
    }
  }

  if (Math.abs(x) < INNER_EXTENT && Math.abs(z) < INNER_EXTENT) {
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
      const clearPad =
        rd.road.surface === 'cobble' || rd.road.surface === 'stone_steps' ? 0.68 : 0.26;
      if (rd.dist < hw + clearPad) roadFoliageClear = true;
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

    // 2 Roadside Skeleton Patrol Clearings at (16, 52) and (-14, 86) — subtle worn earth center
    for (let i = 0; i < PATROL_CLEARINGS.length; i++) {
      const pc = PATROL_CLEARINGS[i];
      if (Math.abs(x - pc.x) < 9.0 && Math.abs(z - pc.z) < 9.0) {
        const dPc = Math.hypot(x - pc.x, z - pc.z);
        if (dPc < 6.8) {
          dirtWeight = Math.max(dirtWeight, (1.0 - smoothstep(4.2, 6.8, dPc)) * 0.85);
        }
      }
    }

    // 3 Sacred Inscription Stone Plinth Aprons (keep a tight 1.6m stone apron, leaving outer ring for Crimson Roses!)
    for (let i = 0; i < INSCRIPTION_STONES.length; i++) {
      const st = INSCRIPTION_STONES[i];
      const dSt = Math.hypot(x - st.x, z - st.z);
      if (dSt < 1.8) {
        cobbleWeight = Math.max(cobbleWeight, 1.0 - smoothstep(1.1, 1.8, dSt));
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
  else if (h < mp.waterY + 0.12) foliageMask = 0.0;
  else if (x > 45.0 && Math.hypot(x - ZONES.arena.x, z - ZONES.arena.z) < ZONES.arena.fenceR + 1.85) foliageMask = 0.0;
  else if (z < -68.0 && Math.hypot(x - ZONES.shrine.x, z - ZONES.shrine.z) < ZONES.shrine.platformR + 2.2) foliageMask = 0.0;
  else if (z <= -13.0 && z >= -73.5 && Math.abs(x) <= 4.75) foliageMask = 0.0;

  // Ensure Crimson Rose ring zones (r = 1.8m .. 5.2m) around the Plaza & Grove Sacred Stones allow meadow/rose placement
  for (let i = 0; i < INSCRIPTION_STONES.length; i++) {
    const st = INSCRIPTION_STONES[i];
    if (st.id === 'stone_pier') continue;
    const dSt = Math.hypot(x - st.x, z - st.z);
    if (dSt >= 1.85 && dSt <= 4.8 && dirtWeight < 0.35 && cobbleWeight < 0.35) {
      foliageMask = 1.0;
    }
  }

  const bAo = minBuildingDist < 1.5 ? smoothstep(0.0, 1.5, minBuildingDist) : 1.0;
  const wAo = Math.abs(x) < 3.0 && Math.abs(z) < 3.0 ? smoothstep(1.2, 2.5, Math.hypot(x, z)) : 1.0;
  const ao = clamp(0.52 + 0.48 * bAo * wAo, 0.45, 1.0);
  const colorVar = 0.5 + 0.25 * Math.sin(x * 0.08 + z * 0.06) + 0.25 * Math.cos(x * 0.05 - z * 0.09);

  return {
    y: h,
    walkY: walkableHeightAt(x, z),
    roadWeight: clamp(dirtWeight, 0, 1),
    cobbleWeight: clamp(cobbleWeight, 0, 1),
    sandWeight: clamp(sandWeight, 0, 1),
    foliageMask,
    ao,
    colorVar,
  };
}

/**
 * Generates the fast 512x512 RGBA DataTexture `uWorldMask` covering `[-170..+170]m` (`340m × 340m`) in < 25ms:
 * - `R`: Cobblestone / dressed stone weight (`0.0..1.0` linear — zero dirt halo discontinuity!)
 * - `G`: Dirt lane / arena earth weight (`0.0..0.5`) or sandy shoreline (`0.5..1.0`)
 * - `B`: Foliage exclusion mask (`0.0` on buildings/roads/plaza/arena/shrine/water, `1.0` on open meadow)
 * - `A`: Contact ambient occlusion (`0.0..1.0`)
 */
export function createWorldMaskTexture(size = 512) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const data = new Uint8Array(size * size * 4);
  const span = INNER_EXTENT * 2; // 340m (-170..+170)
  const mp = ZONES.millpond;
  const wf = LANDMARKS.waterfall;

  // Fill baseline open meadow (R=0, G=0, B=255, A=255) using 32-bit Uint32Array view (< 0.3ms!)
  const u32 = new Uint32Array(data.buffer);
  u32.fill(0xffff0000);

  const izMin = Math.max(0, Math.floor(((-166 / span) + 0.5) * size));
  const izMax = Math.min(size - 1, Math.ceil(((166 / span) + 0.5) * size));
  const ixMin = Math.max(0, Math.floor(((-166 / span) + 0.5) * size));
  const ixMax = Math.min(size - 1, Math.ceil(((166 / span) + 0.5) * size));

  for (let iz = izMin; iz <= izMax; iz++) {
    const wz = ((iz + 0.5) / size - 0.5) * span;
    const inPondZ = wz > -32.0 && wz < 44.0;
    const inBldgZ = wz > -26.0 && wz < 24.0;
    const inArenaZ = wz > -26.0 && wz < 18.0;
    const inShrineZ = wz < -68.0 && wz > -106.0;
    const inStairZ = wz <= -13.0 && wz >= -73.5;
    const inRingZ = Math.abs(wz) < 14.5;
    const inClearZ = wz > 36.0 && wz < 102.0;

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

      const inPondX = inPondZ && wx < -28.0 && wx > -94.0;
      const inBldgX = inBldgZ && wx > -53.0 && wx < 26.0;
      const inArenaX = inArenaZ && wx > 45.0 && wx < 91.0;
      const inShrineX = inShrineZ && Math.abs(wx) < 17.5;
      const inRoadX = activeSegs.length > 0 && wx > -56.0 && wx < 56.0;
      const inClearX = inClearZ && wx > -26.0 && wx < 28.0;

      if (
        !inPondX &&
        !inBldgX &&
        !inArenaX &&
        !inShrineX &&
        !inRoadX &&
        !inClearX &&
        !(inRingZ && Math.abs(wx) < 14.5)
      ) {
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
        const dPierStone = Math.hypot(wx - (-42.0), wz - 18.0);
        if (dPierStone < 4.5) {
          sandWeight = Math.max(sandWeight, 1.0 - smoothstep(2.4, 4.5, dPierStone));
        } else if (dWater < 0.96) {
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

      if (inClearX) {
        for (let i = 0; i < PATROL_CLEARINGS.length; i++) {
          const pc = PATROL_CLEARINGS[i];
          const dPc = Math.hypot(wx - pc.x, wz - pc.z);
          if (dPc < 6.8) {
            dirtWeight = Math.max(dirtWeight, (1.0 - smoothstep(4.2, 6.8, dPc)) * 0.85);
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
      const gByte =
        sandWeight > 0.02
          ? Math.round(128 + clamp(sandWeight, 0, 1) * 127)
          : dirtWeight > 0.01
          ? Math.round(clamp(dirtWeight, 0, 1) * 127)
          : 0;

      const idx = (iz * size + ix) * 4;
      data[idx] = rByte;
      data[idx + 1] = gByte;
      data[idx + 2] = Math.round(foliageMask * 255);
      data[idx + 3] = Math.round(ao * 255);
    }
  }

  // Stamp rich ground-contact AO + directional (+X, +Z) anime sun-shadow pools under Boulders, Dry-Stone Walls, Fences & Sacred Stones (< 0.5ms)
  // Matches `getAnimeShadowDir(uSunDir)` in terrain-water.js & meadow.js (`normalize(vec2(0.58, 0.72))` -> `(+0.63, +0.78)`)!
  const stampCircleAO = (cx, cz, rCore, rOuter, minAoByte = 32) => {
    const shdX = cx + 0.78 * rCore;
    const shdZ = cz + 0.92 * rCore;
    const shdX2 = cx + 1.35 * rCore;
    const shdZ2 = cz + 1.55 * rCore;
    const pad = rOuter * 1.85;
    const ix0 = Math.max(0, Math.floor((((cx - pad * 0.7) / span) + 0.5) * size));
    const ix1 = Math.min(size - 1, Math.ceil((((cx + pad) / span) + 0.5) * size));
    const iz0 = Math.max(0, Math.floor((((cz - pad * 0.7) / span) + 0.5) * size));
    const iz1 = Math.min(size - 1, Math.ceil((((cz + pad) / span) + 0.5) * size));
    for (let iz = iz0; iz <= iz1; iz++) {
      const wz = ((iz + 0.5) / size - 0.5) * span;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = ((ix + 0.5) / size - 0.5) * span;
        const dBase = Math.hypot(wx - cx, wz - cz);
        const dShd1 = Math.hypot(wx - shdX, wz - shdZ) * 0.92;
        const dShd2 = Math.hypot(wx - shdX2, wz - shdZ2) * 1.08;
        const d = Math.min(dBase, Math.min(dShd1, dShd2));
        if (d < rOuter) {
          const f = smoothstep(rCore * 0.62, rOuter, d);
          const aoByte = Math.round(minAoByte + (255 - minAoByte) * f);
          const aIdx = (iz * size + ix) * 4 + 3;
          if (aoByte < data[aIdx]) data[aIdx] = aoByte;
        }
      }
    }
  };

  const stampSegmentAO = (x0, z0, x1, z1, halfThick, feather, minAoByte = 42) => {
    const minX = Math.min(x0, x1) - halfThick - feather - 0.8;
    const maxX = Math.max(x0, x1) + halfThick + feather + 1.8;
    const minZ = Math.min(z0, z1) - halfThick - feather - 0.8;
    const maxZ = Math.max(z0, z1) + halfThick + feather + 1.8;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const invLen2 = 1.0 / Math.max(1e-5, dx * dx + dz * dz);
    const ix0 = Math.max(0, Math.floor(((minX / span) + 0.5) * size));
    const ix1 = Math.min(size - 1, Math.ceil(((maxX / span) + 0.5) * size));
    const iz0 = Math.max(0, Math.floor(((minZ / span) + 0.5) * size));
    const iz1 = Math.min(size - 1, Math.ceil(((maxZ / span) + 0.5) * size));
    for (let iz = iz0; iz <= iz1; iz++) {
      const wz = ((iz + 0.5) / size - 0.5) * span;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = ((ix + 0.5) / size - 0.5) * span;
        // Shift sample along anime shadow direction (+X, +Z) so walls & fences cast a crisp directional ground shadow
        const sx = wx - 0.58;
        const sz = wz - 0.68;
        const t = clamp(((sx - x0) * dx + (sz - z0) * dz) * invLen2, 0, 1);
        const dShd = Math.hypot(sx - (x0 + dx * t), sz - (z0 + dz * t));
        const t0 = clamp(((wx - x0) * dx + (wz - z0) * dz) * invLen2, 0, 1);
        const dBase = Math.hypot(wx - (x0 + dx * t0), wz - (z0 + dz * t0));
        const d = Math.min(dBase, dShd * 0.90);
        if (d < halfThick + feather) {
          const f = smoothstep(halfThick * 0.65, halfThick + feather, d);
          const aoByte = Math.round(minAoByte + (255 - minAoByte) * f);
          const aIdx = (iz * size + ix) * 4 + 3;
          if (aoByte < data[aIdx]) data[aIdx] = aoByte;
        }
      }
    }
  };

  for (let i = 0; i < BOULDERS.length; i++) {
    const b = BOULDERS[i];
    const r = Math.max(b.rx || 1.2, b.rz || 1.2);
    stampCircleAO(b.x, b.z, r * 0.92, r * 2.15, 28);
  }
  for (let i = 0; i < DRY_STONE_WALLS.length; i++) {
    const w = DRY_STONE_WALLS[i];
    stampSegmentAO(w.x0, w.z0, w.x1, w.z1, (w.thickness || 0.52) * 0.85, 1.55, 36);
  }
  for (let i = 0; i < ROADSIDE_FENCES.length; i++) {
    const fn = ROADSIDE_FENCES[i];
    stampSegmentAO(fn.x0, fn.z0, fn.x1, fn.z1, 0.32, 1.15, 64);
  }
  for (let i = 0; i < INSCRIPTION_STONES.length; i++) {
    const st = INSCRIPTION_STONES[i];
    stampCircleAO(st.x, st.z, 1.15, 2.55, 96);
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
  tex.userData.worldExtent = INNER_EXTENT;
  return tex;
}
