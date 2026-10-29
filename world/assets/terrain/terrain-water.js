import * as THREE from 'three';
import { addOutline } from '../../../house3d/src/materials.js';
import { box, cyl, beamBetween, TILE } from '../../../house3d/src/parts.js';
import {
  WORLD_SIZE,
  INNER_EXTENT,
  WATER,
  WELL_PLAZA,
  SHRINE,
  ARENA,
  BUILDINGS,
  BUILDING_LIST,
  ROADS,
  CLIFF_BOULDERS,
  sampleWorld,
  worldToBuildingLocal,
} from './geography.js';

/**
 * Sculpted Valley Terrain, Gouache Splat Texture, Stratified Rock Ravine,
 * Timber Trestle Flume, Animated Waterfall Shader, Carved Waterwheel Tailrace
 * Channel (`y = -2.2m` at `x = -26.2, z = -14.2`), and Sandy/Pebbled Lake Shoreline (`#d8c89e`).
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

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Paints the high-resolution 2048x2048 world terrain splat canvas covering [-160..+160]m.
 * Composites:
 * - 3-tone gouache meadow grass with painted brushstroke variation
 * - Warm sandy/pebbled shoreline gradient (#d8c89e) around the Millpond (waterY = -1.2m)
 * - Packed warm earth roads & Wisteria Combat Clearing ring (#d2ad74)
 * - Hand-painted cobblestone plaza, doorway aprons & spur paths
 * - Stratified cliff rock & contact AO
 */
function buildTerrainSplatTexture(renderer, textures) {
  const S = 2048;
  const span = INNER_EXTENT * 2; // 320m
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');

  const grassPat = textures?.grass?.image ? ctx.createPattern(textures.grass.image, 'repeat') : null;
  const pathPat = textures?.path?.image ? ctx.createPattern(textures.path.image, 'repeat') : null;
  const stonePat = textures?.stone?.image ? ctx.createPattern(textures.stone.image, 'repeat') : null;

  const imgData = ctx.createImageData(S, S);
  const data = imgData.data;

  // Base pixel pass driven by exact mathematical `sampleWorld(wx, wz)`
  for (let py = 0; py < S; py++) {
    const wz = ((py + 0.5) / S - 0.5) * span;
    for (let px = 0; px < S; px++) {
      const wx = ((px + 0.5) / S - 0.5) * span;
      const s = sampleWorld(wx, wz);

      // 1. Meadow Gouache Grass Base (3-tone sunlit yellow-green to cool emerald)
      const n1 = Math.sin(wx * 0.14 + wz * 0.11) * 0.5 + 0.5;
      const n2 = Math.cos(wx * 0.31 - wz * 0.27) * 0.5 + 0.5;
      let r = lerp(110, 146, n1 * 0.7 + n2 * 0.3);
      let g = lerp(168, 202, n1 * 0.7 + n2 * 0.3);
      let b = lerp(78, 102, n1 * 0.6 + n2 * 0.4);

      // 2. Sandy/Pebbled Lake Shoreline Gradient (#d8c89e = rgb(216, 200, 158))
      if (s.sandWeight > 0.001) {
        const wetFactor = smoothstep(-0.35, 0.25, s.y - WATER.waterY);
        const sandR = lerp(182, 216, wetFactor);
        const sandG = lerp(164, 200, wetFactor);
        const sandB = lerp(124, 158, wetFactor);
        // Subtle pebble speckle
        const peb = ((Math.imul(px, 1973) ^ Math.imul(py, 9277)) & 31) / 31 - 0.5;
        r = lerp(r, sandR + peb * 14, s.sandWeight);
        g = lerp(g, sandG + peb * 12, s.sandWeight);
        b = lerp(b, sandB + peb * 10, s.sandWeight);
      }

      // 3. Underwater Lakebed / Tailrace Channel Floor (deep teal-slate stone)
      if (s.y < WATER.waterY - 0.08) {
        const depthT = smoothstep(WATER.waterY - 0.08, WATER.waterY - 0.9, s.y);
        r = lerp(r, 76, depthT);
        g = lerp(g, 112, depthT);
        b = lerp(b, 118, depthT);
      }

      // 4. Warm Packed Dirt Roads & Eastern Combat Arena (#d4ae76)
      if (s.roadWeight > 0.001) {
        const dirtNoise = Math.sin(wx * 0.8 + wz * 0.7) * 5;
        const dirtR = 212 + dirtNoise;
        const dirtG = 174 + dirtNoise * 0.8;
        const dirtB = 118 + dirtNoise * 0.6;
        r = lerp(r, dirtR, s.roadWeight);
        g = lerp(g, dirtG, s.roadWeight);
        b = lerp(b, dirtB, s.roadWeight);
      }

      // 5. Cobblestone Plaza, Spur Paths & Shrine Overlook (#cfc7b6)
      if (s.cobbleWeight > 0.001) {
        const cobR = 204;
        const cobG = 195;
        const cobB = 178;
        r = lerp(r, cobR, s.cobbleWeight);
        g = lerp(g, cobG, s.cobbleWeight);
        b = lerp(b, cobB, s.cobbleWeight);
      }

      // 6. Cliff Rock Strata (#918b80)
      if (s.rockWeight > 0.001) {
        const strata = Math.sin(s.y * 5.2 + wx * 0.4) * 9;
        r = lerp(r, 146 + strata, s.rockWeight);
        g = lerp(g, 140 + strata, s.rockWeight);
        b = lerp(b, 128 + strata, s.rockWeight);
      }

      // 7. Apply Contact Ambient Occlusion
      const ao = s.ao;
      const idx = (py * S + px) * 4;
      data[idx] = clamp(Math.round(r * ao), 0, 255);
      data[idx + 1] = clamp(Math.round(g * ao), 0, 255);
      data[idx + 2] = clamp(Math.round(b * ao), 0, 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Overlay hand-painted grass, cobblestone, and shoreline pebble details in vector canvas pass
  const toPx = (wx, wz) => [((wx + INNER_EXTENT) / span) * S, ((wz + INNER_EXTENT) / span) * S];
  const mToPx = (m) => (m / span) * S;

  // Overlay subtle tiled grass texture across the canvas
  if (grassPat) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = grassPat;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
  }

  // Paint crisp cobblestone detail on Well Plaza, Doorway Spur Paths, and Building Aprons
  if (pathPat) {
    ctx.save();
    ctx.fillStyle = pathPat;
    ctx.globalAlpha = 0.65;

    // Well Plaza circle
    const [cx, cy] = toPx(0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, mToPx(WELL_PLAZA.cobbleRadius), 0, Math.PI * 2);
    ctx.fill();

    // Every doorway spur path and rotated building apron
    for (const road of ROADS) {
      if (road.surface !== 'cobble') continue;
      ctx.beginPath();
      road.points.forEach(([rx, rz], idx) => {
        const [px, py] = toPx(rx, rz);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.lineWidth = mToPx(road.width);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pathPat;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Paint shoreline pebbles along the #d8c89e sandy bank around the Millpond
  const rng = mulberry32(0x7712ab);
  ctx.save();
  for (let i = 0; i < 420; i++) {
    const wx = -54 + rng() * 36;
    const wz = -14 + rng() * 42;
    const s = sampleWorld(wx, wz);
    if (s.sandWeight < 0.35) continue;
    const [px, py] = toPx(wx, wz);
    const pr = 1.4 + rng() * 2.8;
    ctx.fillStyle = rng() > 0.5 ? 'rgba(190, 174, 136, 0.7)' : 'rgba(235, 224, 192, 0.75)';
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (renderer?.capabilities?.getMaxAnisotropy) {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds the sculpted valley terrain mesh (`320m x 320m` high-density inner mesh + outer skirt).
 */
function buildTerrainMesh(materials, renderer, textures) {
  const segs = 240;
  const span = INNER_EXTENT * 2; // 320m
  const geo = new THREE.PlaneGeometry(span, span, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i);
    const wz = pos.getZ(i);
    const s = sampleWorld(wx, wz);
    pos.setY(i, s.y);
    uv.setXY(i, (wx + INNER_EXTENT) / span, (wz + INNER_EXTENT) / span);
  }

  geo.computeVertexNormals();

  const splatTex = buildTerrainSplatTexture(renderer, textures);
  const terrainMat = new THREE.MeshToonMaterial({
    map: splatTex,
    gradientMap: materials.gradientMap,
  });

  const mesh = new THREE.Mesh(geo, terrainMat);
  mesh.name = 'valley-terrain';
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds 3D Cobblestone Road Ribbons, Ring Road, and Exact Doorway Spur Paths + Rotated Stone Aprons.
 * Guarantees every building's front door (`doorX, doorZ`) meets a warm stone apron & cobblestone spur
 * with zero misaligned grey rectangles or doors opening onto bare grass.
 */
function buildRoadsAndDoorAprons(materials) {
  const group = new THREE.Group();
  group.name = 'roads-and-door-aprons';

  // 1. Village Ring Road cobblestone/dirt border segments around Well Plaza
  const ringSegs = 64;
  const ringPositions = [];
  const ringUvs = [];
  const ringIndices = [];
  const rIn = WELL_PLAZA.ringInnerRadius - 0.1;
  const rOut = WELL_PLAZA.ringOuterRadius;

  for (let i = 0; i <= ringSegs; i++) {
    const a = (i / ringSegs) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const xIn = c * rIn;
    const zIn = s * rIn;
    const xOut = c * rOut;
    const zOut = s * rOut;
    ringPositions.push(xIn, 0.014, zIn, xOut, 0.014, zOut);
    const arcU = (i / ringSegs) * 18.0;
    ringUvs.push(0, arcU, (rOut - rIn) / TILE.path, arcU);
    if (i < ringSegs) {
      const b = i * 2;
      ringIndices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPositions, 3));
  ringGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ringUvs, 2));
  ringGeo.setIndex(ringIndices);
  ringGeo.computeVertexNormals();
  const ringMesh = new THREE.Mesh(ringGeo, materials.path);
  ringMesh.receiveShadow = true;
  ringMesh.name = 'village-ring-road';
  group.add(ringMesh);

  // 2. Swept Cobblestone Spur Paths & Arterial Road Ribbons
  for (const road of ROADS) {
    const curvePts = road.points.map(([px, pz]) => new THREE.Vector3(px, 0, pz));
    const curve = new THREE.CatmullRomCurve3(curvePts, false, 'centripetal', 0.25);
    const steps = 32;
    const positions = [];
    const uvs = [];
    const indices = [];
    let distAcc = 0;
    let prev = curve.getPoint(0);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pt = curve.getPoint(t);
      const tan = curve.getTangent(t);
      distAcc += pt.distanceTo(prev);
      prev = pt;

      const nx = -tan.z;
      const nz = tan.x;
      const halfW = road.width * 0.5 * (1 + Math.sin(i * 0.7) * 0.03);

      const lx = pt.x + nx * halfW;
      const lz = pt.z + nz * halfW;
      const rx = pt.x - nx * halfW;
      const rz = pt.z - nz * halfW;

      const ly = sampleWorld(lx, lz).y + (road.surface === 'cobble' ? 0.022 : 0.015);
      const ry = sampleWorld(rx, rz).y + (road.surface === 'cobble' ? 0.022 : 0.015);

      positions.push(lx, ly, lz, rx, ry, rz);
      uvs.push(0, distAcc / TILE.path, road.width / TILE.path, distAcc / TILE.path);

      if (i < steps) {
        const base = i * 2;
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }

    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    rGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    rGeo.setIndex(indices);
    rGeo.computeVertexNormals();

    const rMesh = new THREE.Mesh(
      rGeo,
      road.surface === 'cobble' ? materials.path : materials.stoneWarm
    );
    rMesh.receiveShadow = true;
    rMesh.name = `road-${road.id}`;
    group.add(rMesh);
  }

  // 3. Rotated Building Flagstone Aprons & Stepping Stones at exact `(doorX, doorZ)`
  for (const b of BUILDING_LIST) {
    const apronGroup = new THREE.Group();
    apronGroup.name = `door-apron-${b.id}`;
    apronGroup.position.set(b.x, b.y, b.z);
    apronGroup.rotation.y = b.rotY;

    // Warm dressed stone apron slabs extending from front wall (z = d/2) through doorstep (z = d/2 + 0.9)
    // and blending with rounded stepping stones into the cobblestone spur path
    const slabRows = 3;
    const slabCols = 2;
    for (let r = 0; r < slabRows; r++) {
      for (let c = 0; c < slabCols; c++) {
        const sw = 1.18 - r * 0.06;
        const sd = 0.56;
        const sh = 0.055 - r * 0.008;
        const slab = box(sw, sh, sd, r % 2 === 0 ? materials.stoneWarm : materials.stoneTrim, {
          tile: TILE.stone,
          outline: 0.01,
        });
        slab.position.set(
          (c - 0.5) * (sw + 0.06),
          sh * 0.5 + 0.008,
          b.d * 0.5 + 0.22 + r * 0.54
        );
        apronGroup.add(slab);
      }
    }

    // Two low stone threshold curb blocks flanking the doorstep
    for (const sx of [-1, 1]) {
      const curb = box(0.32, 0.18, 0.95, materials.stone, { tile: TILE.stone, outline: 0.012 });
      curb.position.set(sx * 1.32, 0.09, b.d * 0.5 + 0.45);
      apronGroup.add(curb);
    }

    group.add(apronGroup);
  }

  return group;
}

/**
 * Builds a single natural, stratified, flat-shaded limestone cliff boulder
 * (NEVER a sphere or snowman stack!).
 */
export function buildStratifiedRock(w, h, d, seed, materials, withMoss = true) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();

  // Base angular stratified rock block: 4x3x4 box with faceted horizontal strata offsets
  const geo = new THREE.BoxGeometry(w, h, d, 4, 3, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let vx = pos.getX(i);
    let vy = pos.getY(i);
    let vz = pos.getZ(i);

    const ny = vy / (h * 0.5); // -1..+1
    // Taper upper strata slightly for natural cliff batter
    const taper = ny > 0 ? 1.0 - ny * 0.18 : 1.0 + Math.abs(ny) * 0.08;
    // Stratified horizontal ledge step
    const strataStep = Math.floor((ny + 1.0) * 2.0) * 0.08;
    const hHash = Math.sin(vx * 1.7 + vz * 2.3 + seed) * 0.14 + Math.cos(vy * 3.1 - vx * 1.3) * 0.09;

    vx = vx * (taper + hHash) + strataStep * (vx >= 0 ? 1 : -1);
    vz = vz * (taper + hHash * 0.85);
    if (ny > 0.85) {
      vy += Math.sin(vx * 1.5 + vz * 1.5) * 0.08;
    }

    pos.setXYZ(i, vx, vy, vz);
  }

  const flatGeo = geo.toNonIndexed();
  flatGeo.computeVertexNormals();

  const rockMesh = new THREE.Mesh(flatGeo, materials.stone);
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  addOutline(rockMesh, 0.018);
  group.add(rockMesh);

  // Secondary lower rock ledge shelf so every boulder reads as multi-layered strata
  const ledgeW = w * rng() * 0.35 + w * 0.45;
  const ledgeH = h * 0.42;
  const ledgeD = d * 0.58;
  const ledgeGeo = new THREE.BoxGeometry(ledgeW, ledgeH, ledgeD, 2, 2, 2).toNonIndexed();
  ledgeGeo.computeVertexNormals();
  const ledge = new THREE.Mesh(ledgeGeo, materials.stoneTrim);
  ledge.position.set((rng() - 0.5) * w * 0.35, -h * 0.26, d * 0.32);
  ledge.rotation.y = (rng() - 0.5) * 0.3;
  ledge.castShadow = true;
  ledge.receiveShadow = true;
  addOutline(ledge, 0.015);
  group.add(ledge);

  // Flat-shaded green moss cap sitting on the upper horizontal strata shelf
  if (withMoss) {
    const mossGeo = new THREE.BoxGeometry(w * 0.76, 0.18, d * 0.74, 3, 1, 3).toNonIndexed();
    mossGeo.computeVertexNormals();
    const moss = new THREE.Mesh(mossGeo, materials.leafA);
    moss.position.set(0, h * 0.5 + 0.05, 0);
    moss.castShadow = true;
    moss.receiveShadow = true;
    addOutline(moss, 0.014);
    group.add(moss);
  }

  return group;
}

/**
 * Builds the Carved Waterwheel Tailrace Channel stone masonry walls, the Stepped Rock Cliff Cascade,
 * the Timber Trestle Flume, and the Animated Water & Waterfall Shaders.
 */
function buildHydrologicalSystem(materials) {
  const group = new THREE.Group();
  group.name = 'hydrological-system';
  const animatedUniforms = [];

  // 1. CARVED WATERWHEEL TAILRACE CHANNEL MASONRY LINER (`x = -26.2, z = -14.2`, floor `y = -2.2m`)
  const channelGroup = new THREE.Group();
  channelGroup.name = 'waterwheel-tailrace-channel';

  // Stone paved floor of the carved tailrace at y = -2.2m
  const channelFloor = box(4.8, 0.24, 15.0, materials.stone, {
    tile: TILE.stone,
    outline: 0.012,
    name: 'tailrace-stone-floor',
  });
  channelFloor.position.set(-27.3, WATER.tailraceBottomY - 0.1, -13.5);
  channelGroup.add(channelFloor);

  // East stone retaining wall (right between the Watermill at x = -22.0 and the -X waterwheel at x = -26.2)
  const eastWall = box(0.55, 2.75, 13.5, materials.stone, {
    tile: TILE.stone,
    outline: 0.016,
    name: 'tailrace-east-wall',
  });
  eastWall.position.set(-25.15, -0.82, -14.2);
  channelGroup.add(eastWall);

  // Warm stone coping cap on top of the east tailrace wall
  const eastCoping = box(0.72, 0.18, 13.8, materials.stoneWarm, {
    tile: TILE.stone,
    outline: 0.014,
  });
  eastCoping.position.set(-25.15, 0.58, -14.2);
  channelGroup.add(eastCoping);

  // West stone channel curb wall (`x = -29.55`)
  const westWall = box(0.55, 2.1, 11.5, materials.stone, {
    tile: TILE.stone,
    outline: 0.016,
    name: 'tailrace-west-wall',
  });
  westWall.position.set(-29.55, -1.15, -15.0);
  channelGroup.add(westWall);

  group.add(channelGroup);

  // 2. STEPPED CASCADE ROCK RAVINE & CLIFF BOULDERS (zero snowman spheres!)
  const rockGroup = new THREE.Group();
  rockGroup.name = 'ravine-cliff-boulders';
  CLIFF_BOULDERS.forEach((b, idx) => {
    const baseGroundY = sampleWorld(b.x, b.z).y;
    const rock = buildStratifiedRock(b.w, b.h, b.d, 0x900 + idx * 37, materials, b.moss);
    rock.position.set(b.x, baseGroundY + b.h * 0.36, b.z);
    rock.rotation.y = b.rotY;
    rockGroup.add(rock);
  });
  group.add(rockGroup);

  // 3. TIMBER TRESTLE FLUME (`x = -26.2`, `z = -23.6 -> -15.2`, `y = +2.92m -> +2.68m`)
  // Carries water from the upper rock shelf directly to the top of the Watermill's -X waterwheel!
  const flumeGroup = new THREE.Group();
  flumeGroup.name = 'timber-trestle-flume';
  const flumeX = WATER.wheelX; // -26.2
  const flumeStartZ = -23.6;
  const flumeEndZ = -15.1;
  const flumeLen = flumeEndZ - flumeStartZ; // 8.5m
  const flumeMidZ = (flumeStartZ + flumeEndZ) * 0.5;
  const flumeY = 2.82;
  const flumeSlope = -0.028;

  const chuteGroup = new THREE.Group();
  chuteGroup.position.set(flumeX, flumeY, flumeMidZ);
  chuteGroup.rotation.x = -flumeSlope;

  // Chute bottom plank bed + left/right wooden side walls
  const chuteBed = box(1.06, 0.12, flumeLen, materials.timber, { tile: TILE.wood, outline: 0.014 });
  chuteGroup.add(chuteBed);

  for (const sx of [-1, 1]) {
    const sideWall = box(0.11, 0.52, flumeLen, materials.timberDark, {
      tile: TILE.wood,
      outline: 0.014,
    });
    sideWall.position.set(sx * 0.48, 0.28, 0);
    chuteGroup.add(sideWall);
  }

  // Top wooden tie-bars & collar yokes along the flume
  for (let zOff = -flumeLen * 0.44; zOff <= flumeLen * 0.44; zOff += 1.55) {
    const tie = box(1.26, 0.1, 0.14, materials.timber, { tile: TILE.wood, outline: 0.012 });
    tie.position.set(0, 0.56, zOff);
    chuteGroup.add(tie);
  }
  flumeGroup.add(chuteGroup);

  // Trestle Bents supporting the flume down to solid rock/stone footings
  const bentZs = [-22.4, -20.2, -18.0, -16.0];
  for (const bz of bentZs) {
    const topY = flumeY - 0.06;
    const groundY = Math.max(sampleWorld(flumeX, bz).y, -2.15);
    const h = topY - groundY;

    // Stone pier footing block so timber legs never sit directly in water
    const footing = box(1.65, 0.75, 0.72, materials.stone, { tile: TILE.stone, outline: 0.014 });
    footing.position.set(flumeX, groundY + 0.35, bz);
    flumeGroup.add(footing);

    const legBottomY = groundY + 0.72;
    for (const sx of [-1, 1]) {
      const postA = [flumeX + sx * 0.62, legBottomY, bz];
      const postB = [flumeX + sx * 0.44, topY, bz];
      flumeGroup.add(beamBetween(postA, postB, 0.16, 0.16, materials.timberDark));
    }

    // Horizontal cross-beam cap & mid-ledger
    const capBeam = box(1.36, 0.16, 0.22, materials.timber, { tile: TILE.wood, outline: 0.014 });
    capBeam.position.set(flumeX, topY - 0.08, bz);
    flumeGroup.add(capBeam);

    if (h > 2.4) {
      const midY = (legBottomY + topY) * 0.52;
      const midLedger = box(1.28, 0.12, 0.18, materials.timber, { tile: TILE.wood, outline: 0.012 });
      midLedger.position.set(flumeX, midY, bz);
      flumeGroup.add(midLedger);

      // Diagonal X-bracing
      flumeGroup.add(
        beamBetween(
          [flumeX - 0.56, legBottomY + 0.2, bz],
          [flumeX + 0.46, topY - 0.15, bz],
          0.09,
          0.09,
          materials.timber
        )
      );
      flumeGroup.add(
        beamBetween(
          [flumeX + 0.56, legBottomY + 0.2, bz],
          [flumeX - 0.46, topY - 0.15, bz],
          0.09,
          0.09,
          materials.timber
        )
      );
    }
  }
  group.add(flumeGroup);

  // 4. ANIMATED CEL-SHADED WATERFALL, FLUME SPILL & MILLPOND WATER SHADERS
  const waterfallUniforms = {
    uTime: { value: 0 },
    uTopColor: { value: new THREE.Color(0xdcfaff) },
    uMidColor: { value: new THREE.Color(0x5ad2e8) },
    uDeepColor: { value: new THREE.Color(0x2692b8) },
    uFoamColor: { value: new THREE.Color(0xffffff) },
  };
  animatedUniforms.push(waterfallUniforms);

  const waterfallMat = new THREE.ShaderMaterial({
    uniforms: waterfallUniforms,
    side: THREE.DoubleSide,
    transparent: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 p = position;
        // Subtle organic crest ripple along waterfall face
        float wave = sin(uv.y * 18.0 - uTime * 7.5 + uv.x * 9.0) * 0.045 * sin(uv.y * 3.14159);
        p.z += wave;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uDeepColor;
      uniform vec3 uFoamColor;

      void main() {
        float flow = vUv.y * 5.5 - uTime * 2.4;
        float streak1 = sin(vUv.x * 26.0 + sin(flow * 2.2) * 1.4);
        float streak2 = cos(vUv.x * 42.0 - flow * 3.6);
        float combined = streak1 * 0.55 + streak2 * 0.45;

        // Cel-shaded 3-band water + bright white crest/plunge foam
        vec3 col = mix(uDeepColor, uMidColor, step(-0.15, combined));
        col = mix(col, uTopColor, step(0.35, combined));

        // Crest lip foam (top of cascade) & splash base foam (bottom of cascade)
        float topFoam = smoothstep(0.82, 0.96, vUv.y);
        float botFoam = smoothstep(0.24, 0.03, vUv.y);
        float midLedgeFoam = exp(-pow((vUv.y - 0.52) * 9.5, 2.0)) * step(-0.1, streak1);
        float foamMask = clamp(topFoam + botFoam + midLedgeFoam + step(0.68, combined) * 0.65, 0.0, 1.0);

        col = mix(col, uFoamColor, foamMask);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  // Main Stepped Rock Ravine Waterfall Ribbon (`x = -27.6`, `y = +4.55m -> -1.2m`, `z = -22.5 -> -19.2`)
  const wfWidth = 2.7;
  const wfSegsY = 32;
  const wfSegsX = 12;
  const wfGeo = new THREE.PlaneGeometry(wfWidth, 1, wfSegsX, wfSegsY);
  const wfPos = wfGeo.attributes.position;
  for (let i = 0; i < wfPos.count; i++) {
    const u = wfPos.getX(i) / wfWidth + 0.5; // 0..1
    const v = wfPos.getY(i) + 0.5; // 0 (bottom) .. 1 (top)
    const y = lerp(WATER.waterY - 0.05, WATER.upperStreamY + 0.08, v);
    // Stepped S-curve profile over the middle rock shelf
    const baseZ = lerp(-19.4, -22.6, v);
    const stepBulge =
      Math.sin(v * Math.PI) * 0.65 +
      Math.exp(-Math.pow((v - 0.52) * 5.5, 2)) * 0.55;
    const edgeCurve = Math.sin(u * Math.PI) * 0.18;
    wfPos.setXYZ(i, -27.65 + (u - 0.5) * wfWidth, y, baseZ + stepBulge + edgeCurve);
  }
  wfGeo.computeVertexNormals();
  const mainWaterfall = new THREE.Mesh(wfGeo, waterfallMat);
  mainWaterfall.name = 'main-stepped-waterfall';
  group.add(mainWaterfall);

  // Flume-to-Waterwheel Spill Stream (`x = -26.2`, `y = +2.68m -> -1.2m`, `z = -15.1 -> -13.8`)
  const spillGeo = new THREE.PlaneGeometry(0.76, 1, 6, 20);
  const spPos = spillGeo.attributes.position;
  for (let i = 0; i < spPos.count; i++) {
    const v = spPos.getY(i) + 0.5; // 0 bottom .. 1 top at flume lip
    const y = lerp(WATER.waterY, 2.75, v);
    const arcZ = lerp(-13.65, -15.15, v) + Math.sin(v * Math.PI) * 0.42;
    spPos.setXYZ(i, WATER.wheelX + spPos.getX(i), y, arcZ);
  }
  spillGeo.computeVertexNormals();
  const flumeSpill = new THREE.Mesh(spillGeo, waterfallMat);
  flumeSpill.name = 'flume-waterwheel-spill';
  group.add(flumeSpill);

  // Water strip flowing inside the Timber Trestle Flume trough
  const flumeWaterGeo = new THREE.PlaneGeometry(0.82, flumeLen - 0.1, 2, 16);
  flumeWaterGeo.rotateX(-Math.PI / 2);
  const flumeWater = new THREE.Mesh(flumeWaterGeo, waterfallMat);
  flumeWater.position.set(flumeX, flumeY + 0.36, flumeMidZ);
  flumeWater.rotation.x = -flumeSlope;
  group.add(flumeWater);

  // 3D Cel-Shaded Splash Foam Collars at Waterfall Plunge Pool & Waterwheel Paddles
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xf7feff, toneMapped: false });
  const foamLocations = [
    // Waterfall plunge pool foam cluster
    [-28.3, WATER.waterY + 0.08, -19.4, 0.52],
    [-27.6, WATER.waterY + 0.12, -19.2, 0.65],
    [-26.9, WATER.waterY + 0.08, -19.4, 0.48],
    [-27.6, WATER.waterY + 0.95, -21.0, 0.42], // mid-ledge splash
    // Waterwheel paddle splash foam right at (-26.2, -14.2)
    [-26.2, WATER.waterY + 0.09, -13.6, 0.44],
    [-26.2, WATER.waterY + 0.07, -14.8, 0.38],
  ];
  for (const [fx, fy, fz, fr] of foamLocations) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(fr, 1), foamMat);
    puff.scale.set(1.25, 0.42, 0.95);
    puff.position.set(fx, fy, fz);
    group.add(puff);
  }

  // 5. ANIMATED MILLPOND & TAILRACE WATER SURFACE (`waterY = -1.2m`)
  // Extends continuously from the main Millpond right through the Carved Tailrace Channel
  // (`x = -29.6..-25.2, z = -21.5..+28.0`) directly beneath the Watermill's -X waterwheel (`x = -26.2, z = -14.2`).
  const pondUniforms = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(0x42c4d6) },
    uDeep: { value: new THREE.Color(0x1f82a8) },
    uFoam: { value: new THREE.Color(0xf4fdff) },
  };
  animatedUniforms.push(pondUniforms);

  const pondMat = new THREE.ShaderMaterial({
    uniforms: pondUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFoam;

      void main() {
        vec2 p = vWorldPos.xz;
        float w1 = sin(p.x * 0.55 + p.y * 0.45 - uTime * 1.4);
        float w2 = cos(p.x * 0.85 - p.y * 0.72 + uTime * 1.1);
        float wave = w1 * 0.5 + w2 * 0.5;

        // Depth tint from east shore (-21m) to west deep basin (-44m)
        float depthT = clamp((-22.0 - p.x) / 18.0, 0.0, 1.0);
        vec3 col = mix(uShallow, uDeep, depthT * 0.75);

        // Cel-shaded wave highlight bands
        float shimmer = step(0.68, wave);
        col = mix(col, mix(uShallow, uFoam, 0.55), shimmer * 0.45);

        // Concentric animated foam rings around Waterfall Plunge Pool (-27.6, -19.3)
        float dPlunge = length(p - vec2(-27.6, -19.3));
        float plungeRing = step(0.62, sin(dPlunge * 3.4 - uTime * 3.8)) * smoothstep(5.2, 0.6, dPlunge);

        // Concentric animated foam rings & tailrace wake directly under Waterwheel (-26.2, -14.2)
        float dWheel = length(p - vec2(-26.2, -14.2));
        float wheelRing = step(0.55, sin(dWheel * 4.2 - uTime * 4.5)) * smoothstep(3.8, 0.3, dWheel);

        float foamMask = clamp(plungeRing + wheelRing, 0.0, 1.0);
        col = mix(col, uFoam, foamMask * 0.88);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  // Main Millpond + Tailrace Water Plane at y = -1.2m
  // Shaped to fit the Millpond and Tailrace Channel without overlapping dry eastern land
  const waterShape = new THREE.Shape();
  // Note: Shape is in XY, rotated -PI/2 around X so Shape Y = -World Z (or we set vertices directly in XZ)
  const waterGeo = new THREE.PlaneGeometry(42, 54, 42, 54);
  waterGeo.rotateX(-Math.PI / 2);
  const wPos = waterGeo.attributes.position;
  for (let i = 0; i < wPos.count; i++) {
    const lx = wPos.getX(i) - 38.0; // -59 .. -17
    const lz = wPos.getZ(i) + 4.0; // -23 .. +31
    // Keep water plane strictly at WATER.waterY (-1.2m) inside basin/tailrace, and tuck edges slightly down under dry land
    const groundY = sampleWorld(lx, lz).y;
    const isWaterArea =
      groundY < WATER.waterY + 0.15 ||
      (lx >= -29.8 && lx <= -25.15 && lz >= -21.2 && lz <= -4.0);
    wPos.setXYZ(i, lx, isWaterArea ? WATER.waterY : Math.min(WATER.waterY - 0.35, groundY - 0.15), lz);
  }
  waterGeo.computeVertexNormals();
  const pondWater = new THREE.Mesh(waterGeo, pondMat);
  pondWater.name = 'millpond-and-tailrace-water';
  group.add(pondWater);

  // Dedicated high-precision Tailrace Water Strip right at `y = -1.2m` (`x = -29.4..-25.25, z = -21.2..-4.5`)
  // Guarantees 100% crisp water surface right under the waterwheel at `(-26.2, -14.2)` regardless of grid resolution!
  const tailraceWaterGeo = new THREE.PlaneGeometry(4.15, 16.8, 8, 24);
  tailraceWaterGeo.rotateX(-Math.PI / 2);
  const tailraceWater = new THREE.Mesh(tailraceWaterGeo, pondMat);
  tailraceWater.position.set(-27.35, WATER.waterY + 0.01, -12.8);
  tailraceWater.name = 'tailrace-channel-water-surface';
  group.add(tailraceWater);

  // Upper Stream Water Surface (`y = +4.52m`) on the NW rock shelf
  const upperStreamGeo = new THREE.PlaneGeometry(3.4, 15.5, 4, 12);
  upperStreamGeo.rotateX(-Math.PI / 2);
  const upperStream = new THREE.Mesh(upperStreamGeo, pondMat);
  upperStream.position.set(-27.2, WATER.upperStreamY + 0.02, -30.0);
  upperStream.name = 'upper-stream-water';
  group.add(upperStream);

  // 6. SHORELINE PEBBLE CLUSTERS & REEDS ALONG THE #d8c89e SANDY BANK
  const rng = mulberry32(0x4419a);
  const shoreGroup = new THREE.Group();
  shoreGroup.name = 'shoreline-pebbles-and-reeds';
  const shoreSpots = [
    [-21.8, 2.5],
    [-22.4, 4.8],
    [-21.6, 11.4],
    [-22.5, 14.5],
    [-24.2, 18.2],
    [-27.0, 21.5],
    [-24.8, -4.2],
    [-23.2, -1.2],
  ];
  for (const [sx, sz] of shoreSpots) {
    const sy = sampleWorld(sx, sz).y;
    for (let k = 0; k < 4; k++) {
      const pr = 0.16 + rng() * 0.22;
      const px = sx + (rng() - 0.5) * 1.6;
      const pz = sz + (rng() - 0.5) * 1.6;
      const py = sampleWorld(px, pz).y;
      const pebGeo = new THREE.IcosahedronGeometry(pr, 0).toNonIndexed();
      pebGeo.computeVertexNormals();
      const peb = new THREE.Mesh(pebGeo, k % 2 === 0 ? materials.stoneWarm : materials.stoneTrim);
      peb.scale.set(1.2, 0.55, 1.0);
      peb.position.set(px, py + pr * 0.22, pz);
      peb.rotation.y = rng() * Math.PI;
      peb.castShadow = true;
      peb.receiveShadow = true;
      addOutline(peb, 0.01);
      shoreGroup.add(peb);
    }
    // Riverside reed tuft
    for (let r = 0; r < 5; r++) {
      const h = 0.55 + rng() * 0.45;
      const reed = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, h, 4),
        r % 2 === 0 ? materials.leafA : materials.leafC
      );
      reed.position.set(sx + (rng() - 0.5) * 0.6, sy + h * 0.45, sz + (rng() - 0.5) * 0.6);
      reed.rotation.z = (rng() - 0.5) * 0.28;
      shoreGroup.add(reed);
    }
  }
  group.add(shoreGroup);

  return {
    group,
    update(dt, elapsed) {
      for (const u of animatedUniforms) {
        u.uTime.value = elapsed;
      }
    },
  };
}

/**
 * Builds distant scenic mountain ridges, horizon lake vista, and cartoon clouds.
 */
function buildScenicBackdrop(materials) {
  const group = new THREE.Group();
  group.name = 'scenic-backdrop';
  const rng = mulberry32(0x8831c);

  // Distant layered hill ridges around the valley perimeter
  const hillCount = 22;
  for (let i = 0; i < hillCount; i++) {
    const a = (i / hillCount) * Math.PI * 2 + (rng() - 0.5) * 0.12;
    const dist = 128 + (i % 3) * 18;
    const hx = Math.cos(a) * dist;
    const hz = Math.sin(a) * dist;
    const w = 26 + rng() * 18;
    const h = 18 + (i % 3) * 8 + rng() * 8;
    const d = 20 + rng() * 12;

    const hillGeo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
    hillGeo.computeVertexNormals();
    const mat = i % 3 === 0 ? materials.hillNear : i % 3 === 1 ? materials.hillMid : materials.hillFar;
    const hill = new THREE.Mesh(hillGeo, mat);
    hill.scale.set(w, h, d);
    hill.position.set(hx, -h * 0.25, hz);
    hill.rotation.y = -a + Math.PI * 0.5;
    group.add(hill);
  }

  // Cartoon puff clouds high in the sky
  const puffGeo = new THREE.SphereGeometry(1, 8, 6);
  for (let c = 0; c < 10; c++) {
    const a = (c / 10) * Math.PI * 2 + 0.3;
    const r = 95 + (c % 2) * 24;
    const cloud = new THREE.Group();
    cloud.position.set(Math.cos(a) * r, 38 + (c % 3) * 6, Math.sin(a) * r);
    cloud.rotation.y = -a;
    const puffs = 4 + (c % 3);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(puffGeo, materials.cloud);
      puff.position.set((p - (puffs - 1) * 0.5) * 4.2, (p % 2) * 1.1, (rng() - 0.5) * 1.5);
      puff.scale.set(3.8 + rng() * 1.8, 1.8 + rng() * 0.9, 2.6 + rng() * 1.2);
      cloud.add(puff);
    }
    group.add(cloud);
  }

  return group;
}

export function buildTerrainAndWater(materials, textures, renderer) {
  const root = new THREE.Group();
  root.name = 'terrain-and-water';

  const terrainMesh = buildTerrainMesh(materials, renderer, textures);
  root.add(terrainMesh);

  const roadsAndAprons = buildRoadsAndDoorAprons(materials);
  root.add(roadsAndAprons);

  const hydro = buildHydrologicalSystem(materials);
  root.add(hydro.group);

  const backdrop = buildScenicBackdrop(materials);
  root.add(backdrop);

  return {
    group: root,
    terrainMesh,
    update(dt, elapsed) {
      hydro.update(dt, elapsed);
    },
  };
}
