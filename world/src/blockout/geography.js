import * as THREE from 'three';

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
    innerR: 25,
    outerR: 36,
  },
  arena: {
    id: 'arena',
    name: 'Zone C · Wisteria Festival & Combat Ring',
    x: 42,
    z: -4,
    y: 0.6,
    innerR: 16.5,
    outerR: 25,
  },
  shrine: {
    id: 'shrine',
    name: 'Zone D · Northern Wisteria Arch Shrine Overlook',
    x: 4,
    z: -56,
    y: 6.5,
    innerR: 12.5,
    outerR: 22,
  },
  millpond: {
    id: 'millpond',
    name: 'Zone B · Waterfall, Watermill & Lake Basin',
    x: -38,
    z: 3,
    waterY: -1.2,
    bedY: -2.8,
    rx: 20,
    rz: 27,
  },
};

const RING_PTS = [];
for (let i = 0; i <= 24; i++) {
  const a = (i / 24) * Math.PI * 2;
  const rx = 8.8 + Math.sin(a * 2) * 0.5;
  const rz = 8.4 + Math.cos(a * 3) * 0.4;
  RING_PTS.push([Math.cos(a) * rx, Math.sin(a) * rz]);
}

export const ROADS = [
  {
    id: 'village_ring',
    name: 'Hamlet Commons Loop',
    width: 3.6,
    surface: 'dirt',
    points: RING_PTS,
  },
  {
    id: 'south_approach',
    name: 'South Valley Approach',
    width: 4.4,
    surface: 'dirt',
    points: [
      [0, 66],
      [1.2, 46],
      [0.5, 26],
      [0, 8.4],
    ],
  },
  {
    id: 'west_mill_road',
    name: 'West Mill & Pier Lane',
    width: 3.6,
    surface: 'dirt',
    points: [
      [-8.6, 1.2],
      [-15.0, 4.2],
      [-21.0, 7.5],
    ],
  },
  {
    id: 'mill_service_path',
    name: 'Millhouse Spur Path',
    width: 3.4,
    surface: 'cobble',
    points: [
      [-14.2, 3.6],
      [-19.5, -3.5],
      [-24.2, -10.2],
    ],
  },
  {
    id: 'east_arena_road',
    name: 'East Wisteria Ring Way',
    width: 4.2,
    surface: 'dirt',
    points: [
      [8.8, -0.5],
      [17.5, -2.5],
      [26.5, -4.0],
    ],
  },
  {
    id: 'north_shrine_climb',
    name: 'Northern Shrine Stepped Path',
    width: 4.2,
    surface: 'stone_steps',
    points: [
      [0.4, -8.4],
      [1.6, -21.0],
      [2.8, -33.5],
      [4.0, -46.8],
    ],
  },
  {
    id: 'spur_inn',
    name: 'Inn Porch Spur',
    width: 3.4,
    surface: 'cobble',
    points: [
      [-6.8, -5.2],
      [-9.8, -8.8],
    ],
  },
  {
    id: 'spur_herbalist',
    name: 'Herbalist Spur',
    width: 3.0,
    surface: 'cobble',
    points: [
      [7.6, -4.2],
      [11.4, -6.8],
    ],
  },
  {
    id: 'spur_smithy',
    name: 'Smithy Forge Yard Spur',
    width: 3.6,
    surface: 'cobble',
    points: [
      [7.2, 5.2],
      [11.2, 13.2],
    ],
  },
  {
    id: 'spur_gardener',
    name: 'Gardener Gate Spur',
    width: 3.2,
    surface: 'cobble',
    points: [
      [-6.2, 5.8],
      [-10.2, 14.5],
    ],
  },
];

export const BUILDINGS = [
  {
    id: 'inn',
    name: '1. Crossroads Inn & Bakery',
    role: 'Co-Op Lobby & Hearth Buffs',
    x: -11.8,
    z: -11.8,
    y: 0.0,
    w: 10.4,
    d: 7.4,
    wallH: 5.4,
    roofH: 3.4,
    rotY: 0.68,
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
    x: 15.0,
    z: -10.2,
    y: 0.0,
    w: 8.6,
    d: 6.4,
    wallH: 4.3,
    roofH: 3.0,
    rotY: -0.78,
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
    x: 15.0,
    z: 11.2,
    y: 0.0,
    w: 9.0,
    d: 6.8,
    wallH: 4.5,
    roofH: 3.1,
    rotY: -1.05,
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
    x: -13.8,
    z: 12.4,
    y: 0.0,
    w: 8.2,
    d: 6.2,
    wallH: 3.9,
    roofH: 2.9,
    rotY: 1.02,
    stories: 1,
    crossGable: false,
    dormer: true,
    chimneySide: -1,
    awning: 'front_hood',
    roofColor: 0xde552c,
    colliderPad: 0.5,
    gardenPatch: { ox: -6.4, oz: 0.0, w: 4.2, d: 5.6 },
  },
  {
    id: 'watermill',
    name: '5. Waterfall Stream Mill',
    role: 'Hydro Wheel Landmark & Pier Anchor',
    x: -26.2,
    z: -14.2,
    y: 0.25,
    w: 7.8,
    d: 6.4,
    wallH: 4.6,
    roofH: 3.0,
    rotY: 0.38,
    stories: 1.5,
    crossGable: false,
    dormer: true,
    chimneySide: 0,
    hasWaterwheel: true,
    roofColor: 0xc94927,
    colliderPad: 0.5,
  },
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
    xStart: -20.5,
    xEnd: -34.0,
    z: 7.5,
    y: -0.35,
    width: 3.4,
  },
  waterfall: {
    name: 'Northwest Cascade & Timber Flume',
    x: -31.2,
    z: -16.8,
    topY: 4.2,
    bottomY: -1.2,
    width: 3.6,
  },
  shrineArch: {
    name: 'Wisteria Romanesque Stone Arch',
    x: 4.0,
    z: -62.5,
    y: 6.5,
    span: 5.6,
    height: 5.2,
  },
};

export const TREES = [
  { id: 'wisteria_arena_n', kind: 'wisteria', x: 30, z: -21, scale: 1.35, label: 'Arena North Wisteria' },
  { id: 'wisteria_arena_e', kind: 'wisteria', x: 56, z: -15, scale: 1.42, label: 'Arena East Wisteria' },
  { id: 'wisteria_shrine',  kind: 'wisteria', x: 12.2, z: -61.5, scale: 1.45, label: 'Shrine Guardian Wisteria' },
  { id: 'sakura_mill',      kind: 'sakura',   x: -24, z: -27, scale: 1.15, label: 'Millstream Sakura' },

  { kind: 'oak', x: -19, z: 25, scale: 1.1 },
  { kind: 'oak', x: -9, z: 35, scale: 0.95 },
  { kind: 'oak', x: 11, z: 33, scale: 1.05 },
  { kind: 'oak', x: 26, z: 22, scale: 1.15 },
  { kind: 'oak', x: 25, z: -24, scale: 0.95 },
  { kind: 'oak', x: -39, z: -31, scale: 1.12 },
  { kind: 'oak', x: -10, z: -48, scale: 1.08 },
  { kind: 'oak', x: 19, z: -44, scale: 1.05 },
  { kind: 'oak', x: -5, z: -69, scale: 1.20 },
  { kind: 'oak', x: 58, z: 10, scale: 1.18 },
  { kind: 'oak', x: 46, z: 19, scale: 1.04 },
  { kind: 'oak', x: -54, z: -16, scale: 1.22 },
  { kind: 'oak', x: -54, z: 16, scale: 1.15 },
  { kind: 'oak', x: -42, z: 32, scale: 1.08 },
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
  return -32.2 + Math.sin((z + 20) * 0.16) * 2.4 - (z + 17) * 0.14;
}

export function terrainHeightAt(x, z) {
  const distFromOrigin = Math.hypot(x, z);
  const rimLift = smoothstep(56, 138, distFromOrigin) * 14.0;
  const undulation = (fbm2(x * 0.022, z * 0.022, 42) - 0.5) * 2.5;
  let h = undulation + rimLift;

  const northFactor = smoothstep(-14, -56, z) * smoothstep(68, 22, Math.abs(x - 4));
  h = lerp(h, 6.5, northFactor);

  if (x < -10 && z < -8) {
    const nwFactor = smoothstep(-12, -32, x) * smoothstep(-12, -26, z);
    h = lerp(h, 4.4, nwFactor);
    const sx = streamCenterX(z);
    const streamAxisDist = Math.abs(x - sx);
    if (z >= -44 && z <= -16.2 && streamAxisDist < 3.8) {
      const channelDepth = (1.0 - smoothstep(1.2, 3.6, streamAxisDist)) * 0.95;
      h -= channelDepth;
    }
  }

  const eastCliff = smoothstep(54, 80, x) * 7.5;
  h += eastCliff;

  const dHamlet = Math.hypot(x - ZONES.hamlet.x, z - ZONES.hamlet.z);
  const wHamlet = 1.0 - smoothstep(ZONES.hamlet.innerR, ZONES.hamlet.outerR, dHamlet);
  h = lerp(h, ZONES.hamlet.y, wHamlet);

  const dArena = Math.hypot(x - ZONES.arena.x, z - ZONES.arena.z);
  const wArena = 1.0 - smoothstep(ZONES.arena.innerR, ZONES.arena.outerR, dArena);
  h = lerp(h, ZONES.arena.y, wArena);

  const dShrine = Math.hypot(x - ZONES.shrine.x, z - ZONES.shrine.z);
  const wShrine = 1.0 - smoothstep(ZONES.shrine.innerR, ZONES.shrine.outerR, dShrine);
  h = lerp(h, ZONES.shrine.y, wShrine);

  if (z < -6 && z > -48 && Math.abs(x - 2) < 16) {
    const rampT = smoothstep(-8, -46, z);
    const rampY = lerp(0.0, 6.5, rampT);
    const pathLat = 1.0 - smoothstep(2.8, 13.5, Math.abs(x - lerp(0.4, 4.0, rampT)));
    h = lerp(h, rampY, pathLat);
  }

  const mp = ZONES.millpond;
  const dxPond = (x - mp.x) / mp.rx;
  const dzPond = (z - mp.z) / mp.rz;
  const dPond = Math.hypot(dxPond, dzPond);
  const wPond = 1.0 - smoothstep(0.64, 1.05, dPond);
  h = lerp(h, mp.bedY, wPond);

  const dPlunge = Math.hypot(x - -30.6, z - -15.4);
  const wPlunge = 1.0 - smoothstep(2.2, 4.5, dPlunge);
  h = lerp(h, mp.bedY, wPlunge);

  for (const b of BUILDINGS) {
    const cos = Math.cos(-b.rotY);
    const sin = Math.sin(-b.rotY);
    const lx = (x - b.x) * cos - (z - b.z) * sin;
    const lz = (x - b.x) * sin + (z - b.z) * cos;
    if (b.id === 'watermill' && lx < -b.w * 0.44) continue;
    const frontExt = b.id === 'watermill' && lz > 0 ? 3.2 : 0.6;
    const dx = Math.max(0, Math.abs(lx) - b.w * 0.54);
    const dz = Math.max(0, Math.abs(lz - frontExt * 0.5) - (b.d * 0.54 + frontExt * 0.5));
    const padDist = Math.hypot(dx, dz);
    const feather = b.id === 'watermill' ? 4.5 : 3.0;
    const padMask = 1.0 - smoothstep(0.0, feather, padDist);
    if (padMask > 0) {
      h = lerp(h, b.y, padMask);
    }
  }

  return h;
}

export function walkableHeightAt(x, z) {
  const pier = LANDMARKS.pier;
  if (
    x >= pier.xEnd - 0.3 &&
    x <= pier.xStart + 0.8 &&
    Math.abs(z - pier.z) <= pier.width * 0.55
  ) {
    return pier.y;
  }
  const gh = terrainHeightAt(x, z);
  return Math.max(gh, ZONES.millpond.waterY - 0.15);
}
