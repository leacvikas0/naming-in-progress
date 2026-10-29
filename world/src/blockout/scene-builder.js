import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ZONES,
  BUILDINGS,
  LANDMARKS,
  TREES,
  terrainHeightAt,
  roadDistanceAt,
  streamCenterX,
  noise2,
  clamp,
  lerp,
  smoothstep,
} from './geography.js';

export const PALETTE = {
  ink: 0x2a1a12,
  stucco: 0xf4e7cc,
  timber: 0x9e6838,
  stone: 0xd4cfc2,
  stoneDark: 0xa8a294,
  roofRed: 0xd94e28,
  doorWood: 0x7c4a24,
  windowBlue: 0x2f6fc4,
  glassTint: 0x7cc5eb,
  lanternGlow: 0xffd27d,
  emberGlow: 0xff5a1f,
  grassMid: 0x78b852,
  grassLight: 0x98cf64,
  grassDark: 0x558e3c,
  dirtRoad: 0xd4b483,
  dirtEdge: 0xb89768,
  cobble: 0xc8c2b4,
  arenaEarth: 0xd9c298,
  shrineStone: 0xe4decb,
  shrineAccent: 0x6f95ad,
  cliffRock: 0x8e8c84,
  waterShallow: 0x4cc4c8,
  waterDeep: 0x2a92a4,
  waterFoam: 0xeffbff,
  wisteriaViolet: 0xb580ea,
  wisteriaPink: 0xe8a4d8,
  sakuraPink: 0xf7b0c6,
  leafGreen: 0x62a84c,
  leafLight: 0x8ad064,
};

function makeToonGradient() {
  const steps = [0.38, 0.62, 0.84, 1.0];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((s, i) => {
    const v = Math.round(s * 255);
    data.set([v, v, v, 255], i * 4);
  });
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function makeOutlineMaterial(thickness = 0.022, color = PALETTE.ink) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      void main() {
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xyz += n * uThickness;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
    side: THREE.BackSide,
  });
}

export function attachOutline(mesh, thickness = 0.022) {
  if (!mesh || !mesh.geometry) return mesh;
  const out = new THREE.Mesh(mesh.geometry, makeOutlineMaterial(thickness));
  out.userData.isOutline = true;
  mesh.add(out);
  return mesh;
}

function batchStaticGroup(group, outlineThickness = 0.02) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  const toRemove = [];

  group.traverse((child) => {
    if (!child.isMesh || child.userData.dynamic || child.userData.isOutline) return;
    const mat = child.material;
    if (!byMat.has(mat)) byMat.set(mat, { geos: [], outlineGeos: [] });
    const entry = byMat.get(mat);

    let g = child.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(child.matrixWorld);
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    entry.geos.push(g);

    if (child.userData.outline) {
      entry.outlineGeos.push(g.clone());
    }
    toRemove.push(child);
  });

  for (const c of toRemove) {
    if (c.parent) c.parent.remove(c);
  }

  const outGroup = new THREE.Group();
  outGroup.name = `${group.name}-batched`;
  const outlineMat = makeOutlineMaterial(outlineThickness);
  const allOutlineGeos = [];

  for (const [mat, entry] of byMat.entries()) {
    if (!entry.geos.length) continue;
    const merged = mergeGeometries(entry.geos, false);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    outGroup.add(mesh);
    for (const og of entry.outlineGeos) allOutlineGeos.push(og);
  }

  if (allOutlineGeos.length) {
    const mergedOut = mergeGeometries(allOutlineGeos, false);
    const outMesh = new THREE.Mesh(mergedOut, outlineMat);
    outMesh.userData.isOutline = true;
    outGroup.add(outMesh);
  }

  return outGroup;
}

export function createBlockoutWorld(scene) {
  const root = new THREE.Group();
  root.name = 'blockoutWorld';
  scene.add(root);

  const colliders = [];
  const animated = [];
  const gradientMap = makeToonGradient();

  const toon = (color, opts = {}) =>
    new THREE.MeshToonMaterial({ color, gradientMap, ...opts });

  const mats = {
    stucco: toon(PALETTE.stucco),
    timber: toon(PALETTE.timber),
    stone: toon(PALETTE.stone),
    stoneDark: toon(PALETTE.stoneDark),
    shrineAccent: toon(PALETTE.shrineAccent),
    cliff: toon(PALETTE.cliffRock, { flatShading: true }),
    roofRed: toon(PALETTE.roofRed),
    door: toon(PALETTE.doorWood),
    iron: toon(0x3a3d45),
    window: new THREE.MeshBasicMaterial({ color: PALETTE.windowBlue }),
    glass: new THREE.MeshBasicMaterial({
      color: PALETTE.glassTint,
      transparent: true,
      opacity: 0.62,
    }),
    lantern: new THREE.MeshBasicMaterial({ color: PALETTE.lanternGlow }),
    ember: new THREE.MeshBasicMaterial({ color: PALETTE.emberGlow }),
    leafGreen: toon(PALETTE.leafGreen, { flatShading: true }),
    leafLight: toon(PALETTE.leafLight, { flatShading: true }),
    wisteria: toon(PALETTE.wisteriaViolet, { flatShading: true }),
    wisteriaLight: toon(PALETTE.wisteriaPink, { flatShading: true }),
    sakura: toon(PALETTE.sakuraPink, { flatShading: true }),
    trunk: toon(0x8c623e),
  };

  root.add(buildSkyDome());
  root.add(batchStaticGroup(buildDistantBackdrop(toon), 0.02));

  const terrainMesh = buildTerrainMesh(gradientMap);
  root.add(terrainMesh);

  const waterSys = buildWaterSystem(mats, animated);
  root.add(waterSys);

  const staticArch = new THREE.Group();
  staticArch.name = 'staticArchitecture';
  staticArch.add(buildWellPlaza(mats, colliders));
  for (const b of BUILDINGS) {
    staticArch.add(buildHouseBlockout(b, mats, gradientMap, colliders, animated, root));
  }
  staticArch.add(buildArenaFence(mats));
  staticArch.add(buildWoodenPier(mats));
  staticArch.add(buildShrineOverlook(mats, colliders));
  root.add(batchStaticGroup(staticArch, 0.02));

  root.add(batchStaticGroup(buildTreesAndFlowerDrifts(mats, colliders), 0.02));
  root.add(buildScaleMannequins());

  function update(dt, elapsed) {
    for (const fn of animated) fn(dt, elapsed);
  }

  return {
    root,
    colliders,
    update,
  };
}

function buildSkyDome() {
  const geo = new THREE.SphereGeometry(320, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x4596df) },
      uMid: { value: new THREE.Color(0x98d2f2) },
      uHorizon: { value: new THREE.Color(0xeaf6ff) },
      uSunDir: { value: new THREE.Vector3(-0.45, 0.58, 0.68).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      varying vec3 vWorldPos;
      void main() {
        vec3 d = normalize(vWorldPos);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.26, h));
        col = mix(col, uZenith, smoothstep(0.24, 0.85, h));
        float sunDisc = smoothstep(0.996, 0.9985, dot(d, uSunDir));
        float sunHalo = pow(max(dot(d, uSunDir), 0.0), 10.0) * 0.14;
        col += vec3(1.0, 0.95, 0.82) * (sunDisc * 0.9 + sunHalo);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

function buildDistantBackdrop(toon) {
  const group = new THREE.Group();
  group.name = 'distantBackdrop';

  const ridgeMat = toon(0x88b4a6, { flatShading: true });
  const farRidgeMat = toon(0xa2c6cc, { flatShading: true });
  const count = 28;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = 185 + (i % 2) * 28;
    const h = 26 + ((i * 7) % 19);
    const w = 36 + ((i * 5) % 18);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(w, h, 6),
      i % 2 === 0 ? ridgeMat : farRidgeMat
    );
    cone.position.set(Math.cos(a) * r, h * 0.38 - 2, Math.sin(a) * r);
    cone.rotation.y = a;
    group.add(cone);
  }

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const r = 155 + (i % 3) * 22;
    const cluster = new THREE.Group();
    cluster.position.set(Math.cos(a) * r, 48 + (i % 4) * 7, Math.sin(a) * r);
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(6 + (j === 1 ? 3 : 0), 1),
        cloudMat
      );
      puff.position.set((j - 1.5) * 6.5, (j % 2) * 2.2, 0);
      puff.scale.set(1.3, 0.72, 0.8);
      cluster.add(puff);
    }
    group.add(cluster);
  }

  return group;
}

function buildSmoothTerrainSplatTexture(size) {
  const res = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(res, res);
  const data = img.data;

  const cGrassMid = new THREE.Color(PALETTE.grassMid);
  const cGrassLight = new THREE.Color(PALETTE.grassLight);
  const cGrassDark = new THREE.Color(PALETTE.grassDark);
  const cDirt = new THREE.Color(PALETTE.dirtRoad);
  const cDirtEdge = new THREE.Color(PALETTE.dirtEdge);
  const cCobble = new THREE.Color(PALETTE.cobble);
  const cArena = new THREE.Color(PALETTE.arenaEarth);
  const cShrine = new THREE.Color(PALETTE.shrineStone);
  const cLakeBed = new THREE.Color(0x3a94a0);
  const col = new THREE.Color();

  for (let py = 0; py < res; py++) {
    const z = ((py + 0.5) / res - 0.5) * size;
    for (let px = 0; px < res; px++) {
      const x = ((px + 0.5) / res - 0.5) * size;
      const h = terrainHeightAt(x, z);

      const n = noise2(x * 0.08, z * 0.08, 77);
      col.copy(cGrassMid).lerp(cGrassLight, smoothstep(0.32, 0.82, n));
      if (n < 0.35) col.lerp(cGrassDark, (0.35 - n) * 1.45);

      const rd = roadDistanceAt(x, z);
      if (rd.road) {
        const hw = rd.road.width * 0.5;
        const edgeJitter = (noise2(x * 0.6, z * 0.6, 33) - 0.5) * 0.25;
        const dEdge = rd.dist - (hw + edgeJitter);
        const wBorder = 1.0 - smoothstep(-0.05, 0.22, dEdge);
        const wRoad = 1.0 - smoothstep(-0.35, -0.08, dEdge);
        if (wBorder > 0) {
          const targetCol =
            rd.road.surface === 'cobble'
              ? cCobble
              : rd.road.surface === 'stone_steps'
              ? cShrine
              : cDirt;
          col.lerp(cDirtEdge, wBorder * 0.75);
          col.lerp(targetCol, wRoad);
        }
      }

      const dWell = Math.hypot(x - LANDMARKS.well.x, z - LANDMARKS.well.z);
      const wWell =
        1.0 -
        smoothstep(
          LANDMARKS.well.plazaRadius - 0.12,
          LANDMARKS.well.plazaRadius + 0.12,
          dWell
        );
      if (wWell > 0) col.lerp(cCobble, wWell);

      for (const b of BUILDINGS) {
        const cos = Math.cos(-b.rotY);
        const sin = Math.sin(-b.rotY);
        const lx = (x - b.x) * cos - (z - b.z) * sin;
        const lz = (x - b.x) * sin + (z - b.z) * cos;
        const frontExt = b.id === 'watermill' && lz > 0 ? 2.2 : 0.7;
        const dx = Math.max(0, Math.abs(lx) - (b.w * 0.5 + 0.35));
        const dz = Math.max(0, Math.abs(lz - frontExt * 0.5) - (b.d * 0.5 + frontExt * 0.5));
        const dApron = Math.hypot(dx, dz);
        const wApron = 1.0 - smoothstep(0.55, 0.80, dApron);
        if (wApron > 0) col.lerp(cCobble, wApron);
      }

      const dArena = Math.hypot(x - ZONES.arena.x, z - ZONES.arena.z);
      const wArenaOuter = 1.0 - smoothstep(14.8, 15.1, dArena);
      const wArenaInner = 1.0 - smoothstep(13.2, 13.5, dArena);
      if (wArenaOuter > 0) {
        col.lerp(cCobble, wArenaOuter);
        col.lerp(cArena, wArenaInner);
      }

      const dShrine = Math.hypot(x - ZONES.shrine.x, z - ZONES.shrine.z);
      const wShrine = 1.0 - smoothstep(9.7, 10.0, dShrine);
      if (wShrine > 0) col.lerp(cShrine, wShrine);

      const wLake = smoothstep(
        ZONES.millpond.waterY + 0.15,
        ZONES.millpond.waterY - 0.45,
        h
      );
      if (wLake > 0) col.lerp(cLakeBed, wLake);

      const idx = (py * res + px) * 4;
      data[idx] = Math.round(col.r * 255);
      data[idx + 1] = Math.round(col.g * 255);
      data[idx + 2] = Math.round(col.b * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildTerrainMesh(gradientMap) {
  const size = 220;
  const segs = 220;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeightAt(x, z));
  }
  geo.computeVertexNormals();

  const splatTex = buildSmoothTerrainSplatTexture(size);
  const mat = new THREE.MeshToonMaterial({
    map: splatTex,
    gradientMap,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function buildCurvedStreamMesh(mat) {
  const segs = 24;
  const zStart = -42.5;
  const zEnd = -16.8;
  const halfW = 1.65;
  const positions = [];
  const indices = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = lerp(zStart, zEnd, t);
    const cx = streamCenterX(z);
    positions.push(cx - halfW, 4.16, z, cx + halfW, 4.16, z);
    if (i < segs) {
      const b = i * 2;
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function buildWaterSystem(mats, animated) {
  const group = new THREE.Group();
  group.name = 'waterSystem';

  const mp = ZONES.millpond;
  const lakeMat = new THREE.MeshBasicMaterial({
    color: PALETTE.waterShallow,
    transparent: true,
    opacity: 0.90,
  });

  const lakeGeo = new THREE.CircleGeometry(1, 48);
  lakeGeo.rotateX(-Math.PI / 2);
  lakeGeo.scale(mp.rx * 0.96, 1, mp.rz * 0.96);
  const lake = new THREE.Mesh(lakeGeo, lakeMat);
  lake.position.set(mp.x, mp.waterY, mp.z);
  group.add(lake);

  const plungePool = new THREE.Mesh(
    new THREE.CircleGeometry(4.8, 24).rotateX(-Math.PI / 2),
    lakeMat
  );
  plungePool.position.set(-30.5, mp.waterY + 0.01, -15.2);
  group.add(plungePool);

  group.add(buildCurvedStreamMesh(lakeMat));

  // Natural rock formations lining the stream banks and spring source
  const rockCoords = [
    [streamCenterX(-42.5), 4.6, -43.0, 2.2, 1.3, 0.7, 1.1],
    [streamCenterX(-42.5) - 2.2, 4.4, -41.5, 1.6, 1.1, 0.75, 1.1],
    [streamCenterX(-42.5) + 2.1, 4.4, -41.2, 1.5, 1.1, 0.75, 1.0],
    [streamCenterX(-32.0) - 2.5, 4.2, -32.0, 1.3, 1.2, 0.65, 1.0],
    [streamCenterX(-26.0) + 2.4, 4.2, -26.0, 1.2, 1.1, 0.65, 1.1],
    [-34.6, 3.8, -17.5, 1.8, 1.2, 0.85, 1.1],
    [-34.8, 1.6, -15.8, 2.0, 1.2, 0.9, 1.1],
  ];
  for (const [rx, ry, rz, rs, sx, sy, sz] of rockCoords) {
    const rock = attachOutline(
      new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), mats.cliff),
      0.018
    );
    rock.position.set(rx, ry, rz);
    rock.scale.set(sx, sy, sz);
    group.add(rock);
  }

  // Timber Trestle Headrace Flume feeding water over the top of the Waterwheel
  const flumeGroup = new THREE.Group();
  flumeGroup.position.set(-30.8, 3.88, -15.8);
  flumeGroup.rotation.y = 0.38;
  const trough = attachOutline(
    new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.48, 4.8), mats.timber),
    0.016
  );
  flumeGroup.add(trough);

  // Two vertical timber trestle legs supporting the flume so it never floats
  for (const tz of [-1.4, 1.4]) {
    for (const tx of [-0.65, 0.65]) {
      const leg = attachOutline(
        new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.6, 0.18), mats.timber),
        0.012
      );
      leg.position.set(tx, -1.8, tz);
      flumeGroup.add(leg);
    }
  }

  const flumeWater = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 4.7), lakeMat);
  flumeWater.rotation.x = -Math.PI / 2;
  flumeWater.position.y = 0.26;
  flumeGroup.add(flumeWater);
  group.add(flumeGroup);

  const wf = LANDMARKS.waterfall;
  const fallH = wf.topY - wf.bottomY;
  const fallGeo = new THREE.PlaneGeometry(wf.width, fallH, 8, 16);
  const fallMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWater: { value: new THREE.Color(PALETTE.waterShallow) },
      uFoam: { value: new THREE.Color(PALETTE.waterFoam) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uWater;
      uniform vec3 uFoam;
      varying vec2 vUv;
      void main() {
        float flow = fract(vUv.y * 3.0 + uTime * 1.8);
        float streak = sin(vUv.x * 24.0 + uTime * 4.0) * 0.5 + 0.5;
        float foamMask = smoothstep(0.35, 0.85, streak * flow) + smoothstep(0.22, 0.0, vUv.y) + smoothstep(0.82, 1.0, vUv.y);
        vec3 col = mix(uWater, uFoam, clamp(foamMask, 0.0, 1.0));
        gl_FragColor = vec4(col, 0.94);
      }
    `,
  });
  const waterfallMesh = new THREE.Mesh(fallGeo, fallMat);
  waterfallMesh.position.set(wf.x, (wf.topY + wf.bottomY) * 0.5, wf.z);
  waterfallMesh.rotation.y = 0.38;
  waterfallMesh.rotation.x = -0.22;
  waterfallMesh.userData.dynamic = true;
  group.add(waterfallMesh);

  const foamRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 3.6, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.waterFoam, side: THREE.DoubleSide })
  );
  foamRing.rotation.x = -Math.PI / 2;
  foamRing.position.set(wf.x + 0.5, mp.waterY + 0.04, wf.z + 1.0);
  foamRing.userData.dynamic = true;
  group.add(foamRing);

  animated.push((_dt, elapsed) => {
    fallMat.uniforms.uTime.value = elapsed;
    const s = 1.0 + Math.sin(elapsed * 3.2) * 0.06;
    foamRing.scale.set(s, s, 1);
  });

  return group;
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

function markOutline(mesh) {
  mesh.userData.outline = true;
  return mesh;
}

function addWindowUnit(group, mats, x, y, z, rotY = 0, w = 1.12, h = 1.38) {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.y = rotY;

  const pane = markOutline(
    new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), mats.window)
  );
  holder.add(pane);

  for (const shSide of [-(w * 0.5 + 0.15), w * 0.5 + 0.15]) {
    const shutter = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, h - 0.04, 0.14),
      mats.timber
    );
    shutter.position.set(shSide, 0, 0.02);
    holder.add(shutter);
  }

  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.34, 0.22, 0.32),
    mats.timber
  );
  sill.position.set(0, -h * 0.5 - 0.08, 0.10);
  holder.add(sill);

  group.add(holder);
}

function buildHouseBlockout(b, mats, gradientMap, colliders, animated, dynamicRoot) {
  const group = new THREE.Group();
  group.name = `building-${b.id}`;
  group.position.set(b.x, b.y, b.z);
  group.rotation.y = b.rotY;

  const roofMat = new THREE.MeshToonMaterial({ color: b.roofColor, gradientMap });

  const plinthH = 2.15;
  const plinth = markOutline(
    new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.36, plinthH, b.d + 0.36), mats.stone)
  );
  plinth.position.y = 0.55 - plinthH * 0.5;
  group.add(plinth);

  const body = markOutline(
    new THREE.Mesh(new THREE.BoxGeometry(b.w, b.wallH, b.d), mats.stucco)
  );
  body.position.y = 0.55 + b.wallH * 0.5;
  group.add(body);

  const gableGeo = buildGableRoofGeometry(b.w - 0.1, b.d - 0.1, b.roofH - 0.08, 0.0);
  const gableFill = new THREE.Mesh(gableGeo, mats.stucco);
  gableFill.position.y = 0.55 + b.wallH;
  group.add(gableFill);

  // Timber frame posts on all 4 corners + center studs on side & back walls
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, b.wallH + 0.05, 0.24),
        mats.timber
      );
      post.position.set(sx * (b.w * 0.5), 0.55 + b.wallH * 0.5, sz * (b.d * 0.5));
      group.add(post);

      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 0.14), mats.timber);
      brace.position.set(
        sx * (b.w * 0.42),
        0.55 + b.wallH - 0.85,
        sz * (b.d * 0.5 + 0.03)
      );
      brace.rotation.z = sx * 0.55;
      group.add(brace);
    }
    // Side gable king-post & mid-stud
    const sideStud = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, b.wallH + b.roofH - 0.3, 0.22),
      mats.timber
    );
    sideStud.position.set(
      sx * (b.w * 0.5 + 0.02),
      0.55 + (b.wallH + b.roofH - 0.3) * 0.5,
      0
    );
    group.add(sideStud);
  }

  const beltBeam = new THREE.Mesh(
    new THREE.BoxGeometry(b.w + 0.16, 0.24, b.d + 0.16),
    mats.timber
  );
  beltBeam.position.y = 0.55 + b.wallH * 0.52;
  group.add(beltBeam);

  const roof = markOutline(
    new THREE.Mesh(buildGableRoofGeometry(b.w, b.d, b.roofH, 0.42), roofMat)
  );
  roof.position.y = 0.55 + b.wallH;
  group.add(roof);

  const ridgeBeam = markOutline(
    new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.9, 0.22, 0.24), roofMat)
  );
  ridgeBeam.position.set(0, 0.55 + b.wallH + b.roofH, 0);
  group.add(ridgeBeam);

  if (b.crossGable) {
    const cgW = b.w * 0.40;
    const cgBody = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(cgW, b.wallH, 1.2), mats.stucco)
    );
    cgBody.position.set(0, 0.55 + b.wallH * 0.5, b.d * 0.5 + 0.25);
    group.add(cgBody);

    const cgRoof = markOutline(
      new THREE.Mesh(buildGableRoofGeometry(1.5, cgW, b.roofH * 0.72, 0.28), roofMat)
    );
    cgRoof.rotation.y = Math.PI * 0.5;
    cgRoof.position.set(0, 0.55 + b.wallH, b.d * 0.5 + 0.15);
    group.add(cgRoof);
  }

  if (b.dormer) {
    const dx = b.crossGable ? b.w * 0.30 : 0.85;
    const dy = 0.55 + b.wallH + b.roofH * 0.42;
    const dz = b.d * 0.35;
    const dBox = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.05, 1.4), mats.stucco)
    );
    dBox.position.set(dx, dy, dz);
    group.add(dBox);

    const dRoof = markOutline(
      new THREE.Mesh(buildGableRoofGeometry(1.45, 1.4, 0.62, 0.18), roofMat)
    );
    dRoof.rotation.y = Math.PI * 0.5;
    dRoof.position.set(dx, dy + 0.52, dz);
    group.add(dRoof);

    const dWin = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.68, 0.14), mats.window);
    dWin.position.set(dx, dy + 0.05, dz + 0.72);
    group.add(dWin);
  }

  if (b.chimneySide !== 0) {
    const chW = b.heavyForge ? 1.15 : 0.92;
    const chH = b.wallH + b.roofH + (b.heavyForge ? 1.35 : 1.05);
    const chimney = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(chW, chH, chW), mats.stoneDark)
    );
    chimney.position.set(b.chimneySide * (b.w * 0.34), 0.55 + chH * 0.5, -b.d * 0.22);
    group.add(chimney);
  }

  const doorFrontZ = b.d * 0.5 + (b.crossGable ? 0.85 : 0.02);
  if (b.awning === 'front_porch') {
    const porchRoof = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.22, 2.3), roofMat)
    );
    porchRoof.position.set(0, 3.35, doorFrontZ + 0.95);
    porchRoof.rotation.x = 0.22;
    group.add(porchRoof);
    for (const px of [-2.4, 2.4]) {
      const pPost = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.1, 0.22), mats.timber);
      pPost.position.set(px, 1.55, doorFrontZ + 1.85);
      group.add(pPost);
    }
    // Proper outdoor wooden table with 4 legs + 2 benches
    const tx = -3.4;
    const tz = doorFrontZ + 1.5;
    const tableTop = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 0.95), mats.timber)
    );
    tableTop.position.set(tx, 0.76, tz);
    group.add(tableTop);
    for (const lx of [-0.72, 0.72]) {
      for (const lz of [-0.36, 0.36]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.75, 0.12), mats.door);
        leg.position.set(tx + lx, 0.38, tz + lz);
        group.add(leg);
      }
    }
    for (const bz of [-0.72, 0.72]) {
      const bench = markOutline(
        new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.32), mats.timber)
      );
      bench.position.set(tx, 0.21, tz + bz);
      group.add(bench);
    }
  } else if (b.awning === 'side_greenhouse') {
    const ghW = 2.4;
    const ghD = b.d * 0.68;
    const ghX = -b.w * 0.5 - ghW * 0.5 + 0.05;
    const ghPlinth = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(ghW, 0.65, ghD), mats.stone)
    );
    ghPlinth.position.set(ghX, 0.32, 0);
    group.add(ghPlinth);

    const ghGlass = new THREE.Mesh(
      new THREE.BoxGeometry(ghW - 0.12, 2.1, ghD - 0.12),
      mats.glass
    );
    ghGlass.position.set(ghX, 1.65, 0);
    group.add(ghGlass);

    for (const gz of [-ghD * 0.48, 0, ghD * 0.48]) {
      const mullion = markOutline(
        new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.15, 0.16), mats.timber)
      );
      mullion.position.set(ghX - ghW * 0.48, 1.65, gz);
      group.add(mullion);
    }
    const ghRoof = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(ghW + 0.3, 0.16, ghD + 0.3), mats.timber)
    );
    ghRoof.position.set(ghX, 2.82, 0);
    ghRoof.rotation.z = 0.22;
    group.add(ghRoof);
  } else if (b.awning === 'forge_shed') {
    const shedRoof = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 4.4), roofMat)
    );
    shedRoof.position.set(b.w * 0.5 + 1.6, 3.3, 0.5);
    shedRoof.rotation.z = -0.26;
    group.add(shedRoof);
    for (const sz of [-1.4, 2.2]) {
      const sPost = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 0.22), mats.timber);
      sPost.position.set(b.w * 0.5 + 3.1, 1.5, sz);
      group.add(sPost);
    }
    const hearth = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), mats.stoneDark)
    );
    hearth.position.set(b.w * 0.5 + 0.9, 0.6, -0.5);
    group.add(hearth);
    const coals = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.9), mats.ember);
    coals.position.set(b.w * 0.5 + 0.9, 1.22, -0.5);
    group.add(coals);
    const anvil = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.45), mats.iron)
    );
    anvil.position.set(b.w * 0.5 + 2.1, 0.38, 0.8);
    group.add(anvil);
  } else if (b.awning === 'front_hood') {
    const hood = markOutline(
      new THREE.Mesh(buildGableRoofGeometry(1.2, 2.2, 0.58, 0.18), roofMat)
    );
    hood.rotation.y = Math.PI * 0.5;
    hood.position.set(0, 3.05, doorFrontZ + 0.45);
    group.add(hood);
  }

  const doorArch = markOutline(
    new THREE.Mesh(new THREE.BoxGeometry(1.75, 2.65, 0.22), mats.stoneDark)
  );
  doorArch.position.set(0, 0.55 + 1.32, doorFrontZ);
  group.add(doorArch);

  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.35, 0.26), mats.door);
  doorPanel.position.set(0, 0.55 + 1.18, doorFrontZ + 0.02);
  group.add(doorPanel);

  for (let s = 0; s < 2; s++) {
    const step = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(2.3 - s * 0.25, 0.75, 0.68), mats.stone)
    );
    step.position.set(0, (1 - s) * 0.24 - 0.12, doorFrontZ + 0.42 + s * 0.46);
    group.add(step);
  }

  for (const sx of [-1.25, 1.25]) {
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), mats.lantern);
    lantern.position.set(sx, 2.45, doorFrontZ + 0.22);
    group.add(lantern);
  }

  // Windows on ALL 4 ELEVATIONS (Front +Z, Back -Z, and Gable Sides +/-X) so no side ever reads as a blank box!
  const fZ = b.d * 0.5 + 0.04;
  for (const sx of [-b.w * 0.31, b.w * 0.31]) {
    addWindowUnit(group, mats, sx, 2.15, fZ, 0);
    addWindowUnit(group, mats, sx, 2.15, -fZ, Math.PI);
    if (b.stories >= 1.5) {
      addWindowUnit(group, mats, sx, 4.15, fZ, 0, 1.0, 1.2);
      addWindowUnit(group, mats, sx, 4.15, -fZ, Math.PI, 1.0, 1.2);
    }
  }

  // Side gable windows (skipping the wall side occupied by greenhouse/forge_shed/waterwheel/garden)
  for (const side of [-1, 1]) {
    if (side === -1 && (b.awning === 'side_greenhouse' || b.hasWaterwheel)) continue;
    if (side === 1 && b.awning === 'forge_shed') continue;
    const sX = side * (b.w * 0.5 + 0.04);
    const rotY = side * Math.PI * 0.5;
    addWindowUnit(group, mats, sX, 2.35, 0, rotY, 1.05, 1.3);
    if (b.stories >= 1.5) {
      addWindowUnit(group, mats, sX, 4.55, 0, rotY, 0.92, 1.15);
    }
  }

  if (b.hasWaterwheel && dynamicRoot) {
    const wheelWorld = new THREE.Group();
    wheelWorld.position.set(b.x, b.y, b.z);
    wheelWorld.rotation.y = b.rotY;

    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(-b.w * 0.5 - 0.65, 1.65, 0);
    const rim = attachOutline(
      new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 8, 24), mats.timber),
      0.018
    );
    rim.rotation.y = Math.PI * 0.5;
    wheelGroup.add(rim);

    for (let p = 0; p < 12; p++) {
      const ang = (p / 12) * Math.PI * 2;
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.15, 0.58), mats.door);
      paddle.position.set(0, Math.cos(ang) * 2.15, Math.sin(ang) * 2.15);
      paddle.rotation.x = ang;
      wheelGroup.add(paddle);

      if (p < 6) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.3, 0.16), mats.timber);
        spoke.rotation.x = ang;
        wheelGroup.add(spoke);
      }
    }
    wheelWorld.add(wheelGroup);
    dynamicRoot.add(wheelWorld);
    animated.push((dt) => {
      wheelGroup.rotation.x -= dt * 1.35;
    });
  }

  if (b.gardenPatch) {
    const gp = b.gardenPatch;
    const soilMat = new THREE.MeshBasicMaterial({ color: 0x6b4c32 });
    const sideSign = Math.sign(gp.ox) || 1;
    for (let row = -1; row <= 1; row++) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.24, gp.d * 0.78), soilMat);
      bed.position.set(gp.ox + row * 1.25, 0.12, gp.oz);
      group.add(bed);
      for (let c = -2; c <= 2; c++) {
        const cabbage = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.26, 0),
          mats.leafLight
        );
        cabbage.position.set(gp.ox + row * 1.25, 0.34, gp.oz + c * 0.92);
        group.add(cabbage);
      }
    }
    const wallBack = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(gp.w + 0.4, 0.82, 0.42), mats.stone)
    );
    wallBack.position.set(gp.ox, 0.41, gp.oz - gp.d * 0.5);
    group.add(wallBack);

    const wallOuter = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.82, gp.d + 0.4), mats.stone)
    );
    wallOuter.position.set(gp.ox + sideSign * (gp.w * 0.5), 0.41, gp.oz);
    group.add(wallOuter);

    const wallFront = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(gp.w + 0.4, 0.82, 0.42), mats.stone)
    );
    wallFront.position.set(gp.ox, 0.41, gp.oz + gp.d * 0.5);
    group.add(wallFront);
  }

  colliders.push({
    type: 'obb',
    x: b.x,
    z: b.z,
    hx: b.w * 0.5 + b.colliderPad,
    hz: b.d * 0.5 + b.colliderPad,
    rotY: b.rotY,
  });

  return group;
}

function buildWellPlaza(mats, colliders) {
  const group = new THREE.Group();
  group.name = 'wellPlaza';

  const plazaDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(
      LANDMARKS.well.plazaRadius,
      LANDMARKS.well.plazaRadius + 0.2,
      0.08,
      36
    ),
    mats.stone
  );
  plazaDisc.position.y = 0.02;
  group.add(plazaDisc);

  const base = markOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.6, 0.95, 16), mats.stoneDark)
  );
  base.position.y = 0.47;
  group.add(base);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 16),
    new THREE.MeshBasicMaterial({ color: PALETTE.waterDeep })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.78;
  group.add(water);

  for (const sx of [-1.25, 1.25]) {
    const post = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 0.22), mats.timber)
    );
    post.position.set(sx, 1.6, 0);
    group.add(post);
  }
  const wellRoof = markOutline(
    new THREE.Mesh(buildGableRoofGeometry(2.4, 1.7, 0.95, 0.22), mats.roofRed)
  );
  wellRoof.position.y = 2.7;
  group.add(wellRoof);

  const arcAngles = [0.68, 2.40, -2.32, -0.78];
  const r = LANDMARKS.well.plazaRadius - 0.32;
  for (const ang of arcAngles) {
    const segGroup = new THREE.Group();
    segGroup.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    segGroup.rotation.y = -ang + Math.PI * 0.5;

    for (const px of [-1.15, 1.15]) {
      const bollard = markOutline(
        new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.82, 0.34), mats.stoneDark)
      );
      bollard.position.set(px, 0.41, 0);
      segGroup.add(bollard);
    }
    for (const ry of [0.32, 0.62]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.11, 0.11), mats.timber);
      rail.position.set(0, ry, 0);
      segGroup.add(rail);
    }
    group.add(segGroup);
  }

  colliders.push({ type: 'circle', x: 0, z: 0, r: LANDMARKS.well.colliderRadius });
  return group;
}

function buildWoodenPier(mats) {
  const group = new THREE.Group();
  group.name = 'woodenPier';
  const pier = LANDMARKS.pier;
  const len = Math.abs(pier.xEnd - pier.xStart);
  const cx = (pier.xStart + pier.xEnd) * 0.5;

  const deck = markOutline(
    new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, pier.width), mats.timber)
  );
  deck.position.set(cx, pier.y, pier.z);
  group.add(deck);

  for (let x = pier.xEnd + 0.8; x <= pier.xStart - 0.6; x += 3.2) {
    for (const sz of [-pier.width * 0.44, pier.width * 0.44]) {
      // Submerged support pilings under the deck + low 0.35m mooring bollards along the side edge
      const piling = markOutline(
        new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 8), mats.door)
      );
      piling.position.set(x, pier.y - 1.4, pier.z + sz);
      group.add(piling);

      const bollard = markOutline(
        new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.38, 8), mats.door)
      );
      bollard.position.set(x, pier.y + 0.25, pier.z + sz);
      group.add(bollard);
    }
  }

  const boat = markOutline(
    new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 1.45), mats.door)
  );
  boat.position.set(pier.xEnd + 1.8, ZONES.millpond.waterY + 0.15, pier.z + 2.5);
  boat.rotation.y = 0.18;
  group.add(boat);

  return group;
}

function buildArenaFence(mats) {
  const group = new THREE.Group();
  group.name = 'arenaFence';

  const arena = ZONES.arena;
  const fenceR = 15.8;
  const segCount = 20;
  for (let i = 0; i < segCount; i++) {
    const a = (i / segCount) * Math.PI * 2;
    if (Math.abs(a - Math.PI) < 0.38) continue;
    const fx = arena.x + Math.cos(a) * fenceR;
    const fz = arena.z + Math.sin(a) * fenceR;
    const fy = terrainHeightAt(fx, fz);

    const post = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.25, 0.24), mats.timber)
    );
    post.position.set(fx, fy + 0.6, fz);
    group.add(post);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 4.9), mats.timber);
    rail.position.set(fx, fy + 0.9, fz);
    rail.rotation.y = -a;
    group.add(rail);
  }

  return group;
}

function buildShrineOverlook(mats, colliders) {
  const group = new THREE.Group();
  group.name = 'shrineOverlook';

  const stepsCount = 46;
  const zStart = -8.6;
  const zEnd = -46.8;
  const xStart = 0.4;
  const xEnd = 4.0;
  const yaw = -Math.atan2(xEnd - xStart, Math.abs(zEnd - zStart));

  for (let i = 0; i < stepsCount; i++) {
    const t = i / (stepsCount - 1);
    const sx = lerp(xStart, xEnd, t);
    const sz = lerp(zStart, zEnd, t);
    const sy = terrainHeightAt(sx, sz);
    const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.42, 1.05), mats.stone);
    step.position.set(sx, sy + 0.04, sz);
    step.rotation.y = yaw;
    group.add(step);
  }

  const stairLen = Math.hypot(xEnd - xStart, zEnd - zStart, 6.5);
  const pitch = Math.atan2(6.5, Math.hypot(xEnd - xStart, zEnd - zStart));
  for (const side of [-2.25, 2.25]) {
    const cheekHolder = new THREE.Group();
    cheekHolder.position.set(
      (xStart + xEnd) * 0.5 + side,
      3.25 + 0.14,
      (zStart + zEnd) * 0.5
    );
    cheekHolder.rotation.y = yaw;
    const cheek = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.58, stairLen), mats.stoneDark)
    );
    cheek.rotation.x = pitch;
    cheekHolder.add(cheek);
    group.add(cheekHolder);
  }

  const shX = ZONES.shrine.x;
  const shZ = ZONES.shrine.z;
  const shY = ZONES.shrine.y;

  const platformCurb = markOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(9.8, 10.2, 0.24, 40), mats.stone)
  );
  platformCurb.position.set(shX, shY + 0.04, shZ);
  group.add(platformCurb);

  const innerRing = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5, 5.5, 0.25, 32),
    mats.stoneDark
  );
  innerRing.position.set(shX, shY + 0.048, shZ);
  group.add(innerRing);

  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * Math.PI * 2;
    const diamondGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.25, 4);
    diamondGeo.scale(1.0, 1.0, 2.35);
    const petal = new THREE.Mesh(diamondGeo, mats.shrineAccent);
    petal.position.set(
      shX + Math.sin(a) * 2.65,
      shY + 0.055,
      shZ + Math.cos(a) * 2.65
    );
    petal.rotation.y = a;
    group.add(petal);
  }

  const centerHub = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 0.26, 16),
    mats.stone
  );
  centerHub.position.set(shX, shY + 0.06, shZ);
  group.add(centerHub);

  const arch = LANDMARKS.shrineArch;
  const pierOffset = arch.span * 0.5;
  for (const sx of [-pierOffset, pierOffset]) {
    const plinth = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.65, 1.65), mats.stoneDark)
    );
    plinth.position.set(arch.x + sx, arch.y + 0.32, arch.z);
    group.add(plinth);

    const pier = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(1.25, arch.height, 1.25), mats.stone)
    );
    pier.position.set(arch.x + sx, arch.y + arch.height * 0.5, arch.z);
    group.add(pier);
    colliders.push({ type: 'circle', x: arch.x + sx, z: arch.z, r: 0.85 });
  }

  const archCrown = markOutline(
    new THREE.Mesh(
      new THREE.TorusGeometry(pierOffset, 0.58, 8, 18, Math.PI),
      mats.stone
    )
  );
  archCrown.position.set(arch.x, arch.y + arch.height - 0.15, arch.z);
  group.add(archCrown);

  const ped = markOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 1.15, 8), mats.stoneDark)
  );
  ped.position.set(shX - 4.8, arch.y + 0.57, shZ - 2.2);
  group.add(ped);
  colliders.push({ type: 'circle', x: shX - 4.8, z: shZ - 2.2, r: 1.0 });

  return group;
}

function buildTreesAndFlowerDrifts(mats, colliders) {
  const group = new THREE.Group();
  group.name = 'treesAndFlowers';

  for (const t of TREES) {
    const ty = terrainHeightAt(t.x, t.z);
    const tree = new THREE.Group();
    tree.position.set(t.x, ty, t.z);
    const s = t.scale || 1.0;

    if (t.kind === 'wisteria' || t.kind === 'sakura') {
      const trunk = markOutline(
        new THREE.Mesh(new THREE.CylinderGeometry(0.45 * s, 0.85 * s, 6.0 * s, 7), mats.trunk)
      );
      trunk.position.y = 3.0 * s;
      tree.add(trunk);

      const crownMat = t.kind === 'wisteria' ? mats.wisteria : mats.sakura;
      const puffOffsets = [
        [0, 7.2, 0, 3.5],
        [-2.3, 6.6, 1.1, 2.7],
        [2.4, 6.7, -1.0, 2.8],
        [1.1, 6.8, 2.1, 2.5],
        [-1.4, 6.7, -2.0, 2.6],
      ];
      for (const [px, py, pz, pr] of puffOffsets) {
        const puff = markOutline(
          new THREE.Mesh(new THREE.DodecahedronGeometry(pr * s, 1), crownMat)
        );
        puff.position.set(px * s, py * s, pz * s);
        puff.scale.set(1.25, 0.72, 1.25);
        tree.add(puff);
      }

      if (t.kind === 'wisteria') {
        for (let r = 0; r < 14; r++) {
          const a = (r / 14) * Math.PI * 2;
          const rad = (1.6 + (r % 3) * 1.1) * s;
          const raceme = new THREE.Mesh(
            new THREE.ConeGeometry(0.26 * s, 1.85 * s, 5),
            mats.wisteriaLight
          );
          raceme.rotation.x = Math.PI;
          raceme.position.set(Math.cos(a) * rad, 5.1 * s, Math.sin(a) * rad);
          tree.add(raceme);
        }
      }
      colliders.push({ type: 'circle', x: t.x, z: t.z, r: 0.9 * s });
    } else {
      const trunk = markOutline(
        new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.52 * s, 3.6 * s, 7), mats.trunk)
      );
      trunk.position.y = 1.8 * s;
      tree.add(trunk);

      const mainCrown = markOutline(
        new THREE.Mesh(new THREE.DodecahedronGeometry(2.4 * s, 1), mats.leafGreen)
      );
      mainCrown.position.y = 4.5 * s;
      tree.add(mainCrown);

      const topCrown = markOutline(
        new THREE.Mesh(new THREE.DodecahedronGeometry(1.7 * s, 1), mats.leafLight)
      );
      topCrown.position.set(0.6 * s, 5.8 * s, 0.4 * s);
      tree.add(topCrown);

      colliders.push({ type: 'circle', x: t.x, z: t.z, r: 0.6 * s });
    }

    group.add(tree);
  }

  return group;
}

export function createCharacterMannequin(color = 0x3b82f6) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xf6d4b0 });

  const body = attachOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.32, 12), bodyMat),
    0.016
  );
  body.position.y = 0.66;
  g.add(body);

  const head = attachOutline(
    new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), headMat),
    0.016
  );
  head.position.y = 1.58;
  g.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.1, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x1e293b })
  );
  visor.position.set(0, 1.60, 0.22);
  g.add(visor);

  return g;
}

function buildScaleMannequins() {
  const group = new THREE.Group();
  group.name = 'scaleMannequins';
  const spots = [
    { x: -7.5, z: -6.5, rotY: 0.65, color: 0xea580c }, // On the cobblestone spur outside Inn
    { x: -31.8, z: 7.5, rotY: 1.57, color: 0x0ea5e9 }, // At the far end of the Wooden Pier
    { x: 42.0, z: -4.0, rotY: -1.5, color: 0xa855f7 }, // Center of Wisteria Combat Ring
    { x: 0.5, z: -57.5, rotY: 0.4, color: 0x10b981 }, // Beside Shrine Spell Pedestal
  ];
  for (const s of spots) {
    const m = createCharacterMannequin(s.color);
    const y = s.x < -20.5 && Math.abs(s.z - 7.5) < 2 ? LANDMARKS.pier.y : terrainHeightAt(s.x, s.z);
    m.position.set(s.x, y, s.z);
    m.rotation.y = s.rotY;
    group.add(m);
  }
  return group;
}
