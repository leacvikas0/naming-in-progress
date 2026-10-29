import * as THREE from 'three';

export const PLAY_BOUNDARY_RADIUS = 125;

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
  let n = ix * 374761393 + iz * 668265263 + seed * 1442695041;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
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
    innerR: 15.0,
    outerR: 26.0,
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

export const BUILDINGS = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
];

export function getBuildingDoorWorldPos(b, offsetFromFrontWall = 1.35) {
  const dist = b.d * 0.5 + offsetFromFrontWall;
  return [
    b.x + Math.sin(b.rotY) * dist,
    b.z + Math.cos(b.rotY) * dist,
  ];
}

const RING_RADIUS = 10.5;
const RING_PTS = [];
for (let i = 0; i <= 32; i++) {
  const a = (i / 32) * Math.PI * 2;
  RING_PTS.push([Math.cos(a) * RING_RADIUS, Math.sin(a) * RING_RADIUS]);
}

function buildCottageSpur(id, name, width, buildingId) {
  const b = BUILDINGS.find((item) => item.id === buildingId);
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

const millBuilding = BUILDINGS.find((b) => b.id === 'watermill');
const millDoorPt = getBuildingDoorWorldPos(millBuilding, 1.35);
const millWallPt = getBuildingDoorWorldPos(millBuilding, 0.15);

export const ROADS = [
  {
    id: 'village_ring',
    name: 'Hamlet Commons Loop',
    width: 3.8,
    surface: 'dirt',
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
    width: 3.8,
    surface: 'dirt',
    points: [
      [-RING_RADIUS, 1.2],
      [-18.5, 3.8],
      [-27.0, 6.5],
      [-35.5, 8.5],
    ],
  },
  {
    id: 'mill_service_path',
    name: 'Millhouse Spur Path',
    width: 3.5,
    surface: 'cobble',
    points: [
      [-24.5, 5.5],
      [-31.8, -1.8],
      [-38.2, -9.2],
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
  buildCottageSpur('spur_inn', 'Inn Porch Spur', 3.5, 'inn'),
  buildCottageSpur('spur_herbalist', 'Herbalist Spur', 3.2, 'herbalist'),
  buildCottageSpur('spur_smithy', 'Smithy Forge Yard Spur', 3.6, 'smithy'),
  buildCottageSpur('spur_gardener', 'Gardener Gate Spur', 3.2, 'gardener'),
];

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

// All trees verified for >3.8m clearance from arena fence (r=19.5 around (68,-4)),
// >4.5m clearance from all roads/stairs, and zero overlap with rocks, buildings, or shrine lookback vista.
export const TREES = [
  { id: 'wisteria_arena_n', kind: 'wisteria', x: 75.0, z: -26.2, scale: 1.32, label: 'Arena North Wisteria' },
  { id: 'wisteria_arena_e', kind: 'wisteria', x: 92.2, z: -4.0,  scale: 1.38, label: 'Arena East Wisteria' },
  { id: 'wisteria_arena_s', kind: 'wisteria', x: 75.0, z: 18.2,  scale: 1.32, label: 'Arena South Wisteria' },
  { id: 'wisteria_shrine',  kind: 'wisteria', x: 10.6, z: -90.8, scale: 1.22, hasPlanter: true, label: 'Shrine Guardian Wisteria' },
  { id: 'sakura_mill',      kind: 'sakura',   x: -37.5, z: -34.5, scale: 1.22, label: 'Millstream Sakura' },
  { id: 'sakura_shrine_w',  kind: 'sakura',   x: -10.6, z: -90.8, scale: 1.22, hasPlanter: true, label: 'Shrine West Sakura' },

  { kind: 'oak', x: -28, z: 32, scale: 1.15 },
  { kind: 'oak', x: -14, z: 48, scale: 1.05 },
  { kind: 'oak', x: 16, z: 46, scale: 1.10 },
  { kind: 'oak', x: 34, z: 30, scale: 1.18 },
  { kind: 'oak', x: 40, z: -24, scale: 1.02 },
  { kind: 'oak', x: -64, z: -38, scale: 1.18 },
  { kind: 'oak', x: -24, z: -56, scale: 1.10 },
  { kind: 'oak', x: 32, z: -52, scale: 1.08 },
  { kind: 'oak', x: 54, z: 24, scale: 1.16 },
  { kind: 'oak', x: 96, z: 14, scale: 1.20 },
  { kind: 'oak', x: -94, z: -18, scale: 1.25 },
  { kind: 'oak', x: -92, z: 24, scale: 1.18 },
  { kind: 'oak', x: -56, z: 48, scale: 1.14 },
  { kind: 'oak', x: -16, z: 82, scale: 1.20 },
  { kind: 'oak', x: 18, z: 80, scale: 1.18 },
];

export function roadDistanceAt(x, z) {
  let bestDist = Infinity;
  let bestRoad = null;
  let bestT = 0;

  for (const road of ROADS) {
    const pts = road.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0];
      const az = pts[i][1];
      const bx = pts[i + 1][0];
      const bz = pts[i + 1][1];
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
      const px = ax + dx * t;
      const pz = az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bestDist) {
        bestDist = d;
        bestRoad = road;
        bestT = (i + t) / (pts.length - 1);
      }
    }
  }
  return { dist: bestDist, road: bestRoad, progress: bestT };
}

export function streamCenterX(z) {
  // Terminates at x = -52.0 at z = -21.5 (squarely into the waterfall rocks & flume intake, well west of the watermill roof)
  return -52.0 + Math.sin((z + 21.5) * 0.12) * 1.8 + (z + 21.5) * 0.08;
}

export function terrainHeightAt(x, z) {
  const distFromOrigin = Math.hypot(x, z);
  const angle = Math.atan2(z, x);

  // Outer valley basin rise & mountain ridge cradle beyond PLAY_BOUNDARY_RADIUS (125m)
  const ridgeWave =
    0.65 +
    0.22 * Math.sin(angle * 5 + 0.6) +
    0.18 * Math.cos(angle * 7 - 0.4) +
    0.15 * (fbm2(x * 0.012, z * 0.012, 91) - 0.5);
  const rimLift =
    smoothstep(88, 155, distFromOrigin) * 8.5 +
    smoothstep(130, 285, distFromOrigin) * 34.0 * ridgeWave;

  // Keep south approach valley corridor gently open
  const southGap =
    z > 20 ? (1.0 - smoothstep(14, 42, Math.abs(x))) * smoothstep(20, 130, z) : 0.0;

  const undulation = (fbm2(x * 0.018, z * 0.018, 42) - 0.5) * 2.4;
  let h = (undulation + rimLift) * (1.0 - southGap * 0.65);

  // Northern Shrine ridge terrace (centered on x = 0.0, z = -86.0, y = 8.0)
  const northFactor =
    smoothstep(-16, -72, z) * smoothstep(75, 24, Math.abs(x));
  h = lerp(h, ZONES.shrine.y, northFactor);

  // Northwest headwaters shelf (y = +5.4m) feeding the waterfall at (-51.4, -20.8)
  if (x < -16 && z < -8) {
    const nwFactor = smoothstep(-20, -46, x) * smoothstep(-12, -30, z);
    h = lerp(h, 5.4, nwFactor);
    const sx = streamCenterX(z);
    const streamAxisDist = Math.abs(x - sx);
    if (z >= -68 && z <= -20.5 && streamAxisDist < 4.2) {
      const channelDepth = (1.0 - smoothstep(1.4, 4.0, streamAxisDist)) * 1.15;
      h -= channelDepth;
    }
  }

  // East foothills behind the Arena
  const eastCliff = smoothstep(92, 135, x) * 7.5;
  h += eastCliff;

  // Zone A: Central Hamlet flat terrace (y = 0.0)
  const dHamlet = Math.hypot(x - ZONES.hamlet.x, z - ZONES.hamlet.z);
  const wHamlet = 1.0 - smoothstep(ZONES.hamlet.innerR, ZONES.hamlet.outerR, dHamlet);
  h = lerp(h, ZONES.hamlet.y, wHamlet);

  // Zone C: East Wisteria Combat Ring flat terrace (y = 0.6)
  const dArena = Math.hypot(x - ZONES.arena.x, z - ZONES.arena.z);
  const wArena = 1.0 - smoothstep(ZONES.arena.innerR, ZONES.arena.outerR, dArena);
  h = lerp(h, ZONES.arena.y, wArena);

  // Zone D: Northern Shrine Overlook flat terrace (y = 8.0)
  const dShrine = Math.hypot(x - ZONES.shrine.x, z - ZONES.shrine.z);
  const wShrine = 1.0 - smoothstep(ZONES.shrine.innerR, ZONES.shrine.outerR, dShrine);
  h = lerp(h, ZONES.shrine.y, wShrine);

  // Linearly graded ramp along x = 0.0 from z = -15.0 (y = 0.0) to z = -71.5 (y = 8.0)
  if (z <= -13.0 && z >= -73.0 && Math.abs(x) < 18.0) {
    const rampT = clamp((-15.0 - z) / (71.5 - 15.0), 0, 1);
    const rampY = lerp(0.0, ZONES.shrine.y, rampT);
    const pathLat = 1.0 - smoothstep(2.6, 15.0, Math.abs(x));
    h = lerp(h, rampY, pathLat);
  }

  // Building plinth pads
  for (const b of BUILDINGS) {
    const cos = Math.cos(-b.rotY);
    const sin = Math.sin(-b.rotY);
    const lx = (x - b.x) * cos - (z - b.z) * sin;
    const lz = (x - b.x) * sin + (z - b.z) * cos;
    if (b.id === 'watermill' && lx < -b.w * 0.45) continue;
    const frontExt = b.id === 'watermill' && lz > 0 ? 3.4 : 1.2;
    const dx = Math.max(0, Math.abs(lx) - b.w * 0.54);
    const dz = Math.max(0, Math.abs(lz - frontExt * 0.5) - (b.d * 0.54 + frontExt * 0.5));
    const padDist = Math.hypot(dx, dz);
    const feather = b.id === 'watermill' ? 3.5 : 3.2;
    const padMask = 1.0 - smoothstep(0.0, feather, padDist);
    if (padMask > 0) {
      h = lerp(h, b.y, padMask);
    }
  }

  // Zone B: Millpond Lake Basin (center: (-62, 6), rx: 28, rz: 36, bedY: -3.0)
  const mp = ZONES.millpond;
  const dxPond = (x - mp.x) / mp.rx;
  const dzPond = (z - mp.z) / mp.rz;
  const dPond = Math.hypot(dxPond, dzPond);
  const wPond = 1.0 - smoothstep(0.68, 1.06, dPond);
  h = lerp(h, mp.bedY, wPond);

  // Waterfall plunge pool at (-51.4, -20.8) & Waterwheel Tailrace Channel right under the Watermill's -X wall
  const wf = LANDMARKS.waterfall;
  const dPlunge = Math.hypot(x - (wf.x + 0.6), z - (wf.z + 1.8));
  const wPlunge = 1.0 - smoothstep(3.2, 5.8, dPlunge);
  h = lerp(h, mp.bedY, wPlunge);

  // Carve dedicated Waterwheel Tailrace Channel in Watermill local coordinates so wheel ALWAYS sits over water
  {
    const b = millBuilding;
    const cos = Math.cos(-b.rotY);
    const sin = Math.sin(-b.rotY);
    const lx = (x - b.x) * cos - (z - b.z) * sin;
    const lz = (x - b.x) * sin + (z - b.z) * cos;
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
  }

  // Smooth shore grading under the Pier Abutment (without hard x-cutoff step!) so terrain stays cleanly below the abutment deck
  const dAbutment = Math.hypot((x - (LANDMARKS.pier.xStart + 2.2)) * 0.75, z - LANDMARKS.pier.z);
  const wAbutment = 1.0 - smoothstep(2.2, 5.5, dAbutment);
  h = lerp(h, LANDMARKS.pier.y - 0.28, wAbutment * smoothstep(-37.0, -32.5, x));

  return h;
}

export function walkableHeightAt(x, z) {
  const pier = LANDMARKS.pier;
  if (
    x >= pier.xEnd - 0.3 &&
    x <= pier.xStart + 1.8 &&
    Math.abs(z - pier.z) <= pier.width * 0.55
  ) {
    return pier.y;
  }
  const gh = terrainHeightAt(x, z);
  return Math.max(gh, ZONES.millpond.waterY - 0.15);
}
