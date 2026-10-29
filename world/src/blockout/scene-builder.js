import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PLAY_BOUNDARY_RADIUS,
  ZONES,
  BUILDINGS,
  LANDMARKS,
  TREES,
  getBuildingDoorWorldPos,
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
  sandBank: 0xdfc99b,
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
  staticArch.add(buildBoundaryMarkers(mats));
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
  const geo = new THREE.SphereGeometry(780, 32, 20);
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

  const foothillMat = toon(0x7ea899, { flatShading: true });
  const midRidgeMat = toon(0x8db0c2, { flatShading: true });
  const farPeakMat = toon(0x9ec0d4, { flatShading: true });
  const snowCapMat = toon(0xeaf4fa, { flatShading: true });

  // Inner foothill ridge ring (r = 180m .. 220m, h = 20m .. 34m)
  const foothillCount = 32;
  for (let i = 0; i < foothillCount; i++) {
    const a = (i / foothillCount) * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    // Keep southern approach pass slightly lower for scenic valley entry
    const southPass = z > 0.85 && Math.abs(x) < 0.22 ? 0.55 : 1.0;
    const r = 186 + (i % 3) * 14;
    const h = (20 + ((i * 7) % 15)) * southPass;
    const w = 38 + ((i * 5) % 18);
    const ridge = new THREE.Mesh(
      new THREE.ConeGeometry(w, h, 7),
      i % 2 === 0 ? foothillMat : midRidgeMat
    );
    ridge.position.set(x * r, h * 0.42 + 2.0, z * r);
    ridge.scale.set(1.35, 1.0, 0.85);
    ridge.rotation.y = a + Math.PI * 0.5;
    group.add(ridge);
  }

  // Outer high alpine mountain horizon ring (r = 235m .. 300m, h = 34m .. 52m) with snow/mist caps
  const peakCount = 36;
  for (let i = 0; i < peakCount; i++) {
    const a = (i / peakCount) * Math.PI * 2 + 0.08;
    const x = Math.cos(a);
    const z = Math.sin(a);
    const r = 242 + (i % 3) * 24;
    const h = 34 + ((i * 11) % 19);
    const w = 44 + ((i * 7) % 20);

    const peak = new THREE.Mesh(
      new THREE.ConeGeometry(w, h, 7),
      i % 2 === 0 ? midRidgeMat : farPeakMat
    );
    const py = h * 0.46 + 4.0;
    peak.position.set(x * r, py, z * r);
    peak.rotation.y = a * 1.7;
    group.add(peak);

    if (h >= 38) {
      const capH = h * 0.36;
      const capW = w * 0.37;
      const snowCap = new THREE.Mesh(
        new THREE.ConeGeometry(capW, capH, 7),
        snowCapMat
      );
      snowCap.position.set(x * r, py + h * 0.5 - capH * 0.48, z * r);
      snowCap.rotation.y = peak.rotation.y;
      group.add(snowCap);
    }
  }

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.25;
    const r = 225 + (i % 3) * 28;
    const cluster = new THREE.Group();
    cluster.position.set(Math.cos(a) * r, 64 + (i % 4) * 8, Math.sin(a) * r);
    for (let j = 0; j < 4; j++) {
      const puff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(8 + (j === 1 ? 4 : 0), 1),
        cloudMat
      );
      puff.position.set((j - 1.5) * 8.5, (j % 2) * 2.8, 0);
      puff.scale.set(1.35, 0.72, 0.85);
      cluster.add(puff);
    }
    group.add(cluster);
  }

  return group;
}

function buildSmoothTerrainSplatTexture(size) {
  const res = 2048;
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
  const cSand = new THREE.Color(PALETTE.sandBank);
  const cArena = new THREE.Color(PALETTE.arenaEarth);
  const cShrine = new THREE.Color(PALETTE.shrineStone);
  const cLakeBed = new THREE.Color(0x3a94a0);
  const cMountainRock = new THREE.Color(0x8899a2);
  const cMountainMist = new THREE.Color(0xddeaf2);
  const col = new THREE.Color();

  const buildingDoors = BUILDINGS.map((b) => ({
    b,
    door: getBuildingDoorWorldPos(b, 1.35),
  }));

  for (let py = 0; py < res; py++) {
    const z = ((py + 0.5) / res - 0.5) * size;
    for (let px = 0; px < res; px++) {
      const x = ((px + 0.5) / res - 0.5) * size;
      const h = terrainHeightAt(x, z);

      const n = noise2(x * 0.06, z * 0.06, 77);
      col.copy(cGrassMid).lerp(cGrassLight, smoothstep(0.32, 0.82, n));
      if (n < 0.35) col.lerp(cGrassDark, (0.35 - n) * 1.45);

      const distOrigin = Math.hypot(x, z);
      if (distOrigin > 125) {
        const wRock = smoothstep(9.5, 22.0, h) * smoothstep(125, 165, distOrigin);
        if (wRock > 0) col.lerp(cMountainRock, wRock * 0.85);
        const wSnow = smoothstep(24.0, 36.0, h) * smoothstep(160, 210, distOrigin);
        if (wSnow > 0) col.lerp(cMountainMist, wSnow * 0.9);
      }

      // Warm sandy/pebbled shoreline bank (#dfc99b) where terrain height h is in [-1.25m, -0.35m] around Lake & Plunge Pool
      const mp = ZONES.millpond;
      const dPond = Math.hypot((x - mp.x) / mp.rx, (z - mp.z) / mp.rz);
      const dPlunge = Math.hypot(
        x - LANDMARKS.waterfall.x,
        z - LANDMARKS.waterfall.z
      ) / 14.0;
      const nearShore = 1.0 - smoothstep(0.95, 1.18, Math.min(dPond, dPlunge));
      if (nearShore > 0) {
        const wSand =
          nearShore *
          smoothstep(-0.22, -0.45, h) *
          (1.0 - smoothstep(-1.18, -1.55, h));
        if (wSand > 0) col.lerp(cSand, wSand);
      }

      if (Math.abs(x) < 112 && Math.abs(z) < 112) {
        const rd = roadDistanceAt(x, z);
        if (rd.road) {
          const hw = rd.road.width * 0.5;
          const edgeJitter = (noise2(x * 0.6, z * 0.6, 33) - 0.5) * 0.25;
          const dEdge = rd.dist - (hw + edgeJitter);
          const wBorder = 1.0 - smoothstep(-0.05, 0.24, dEdge);
          const wRoad = 1.0 - smoothstep(-0.35, -0.06, dEdge);
          if (wBorder > 0) {
            const targetCol =
              rd.road.surface === 'cobble'
                ? cCobble
                : rd.road.surface === 'stone_steps'
                ? cShrine
                : cDirt;
            col.lerp(cDirtEdge, wBorder * 0.72);
            col.lerp(targetCol, wRoad);
          }
        }

        const dWell = Math.hypot(x - LANDMARKS.well.x, z - LANDMARKS.well.z);
        const wWell =
          1.0 -
          smoothstep(
            LANDMARKS.well.plazaRadius - 0.15,
            LANDMARKS.well.plazaRadius + 0.15,
            dWell
          );
        if (wWell > 0) col.lerp(cCobble, wWell);

        // Smooth rounded cobblestone apron around each building & its computed (doorX, doorZ)
        for (const { b, door } of buildingDoors) {
          const cos = Math.cos(-b.rotY);
          const sin = Math.sin(-b.rotY);
          const lx = (x - b.x) * cos - (z - b.z) * sin;
          const lz = (x - b.x) * sin + (z - b.z) * cos;
          if (b.id === 'watermill' && lx < -b.w * 0.45) continue;

          const frontExt = 1.65;
          const sideExt = b.awning === 'forge_shed' && lx > 0 ? 2.8 : 0.45;
          const halfW = b.w * 0.5 + (lx > 0 ? sideExt : 0.45);
          const centerX = lx > 0 && b.awning === 'forge_shed' ? 1.1 : 0.0;
          const dx = Math.max(0, Math.abs(lx - centerX) - halfW);
          const dz = Math.max(
            0,
            Math.abs(lz - frontExt * 0.5) - (b.d * 0.5 + frontExt * 0.5)
          );
          const dApron = Math.hypot(dx, dz);
          const wApron = 1.0 - smoothstep(0.55, 1.35, dApron);
          if (wApron > 0) col.lerp(cCobble, wApron);

          const dDoor = Math.hypot(x - door[0], z - door[1]);
          const wDoor = 1.0 - smoothstep(2.0, 2.75, dDoor);
          if (wDoor > 0) col.lerp(cCobble, wDoor);
        }

        const dArena = Math.hypot(x - ZONES.arena.x, z - ZONES.arena.z);
        const wArenaOuter = 1.0 - smoothstep(18.6, 19.1, dArena);
        const wArenaInner = 1.0 - smoothstep(16.8, 17.2, dArena);
        if (wArenaOuter > 0) {
          col.lerp(cCobble, wArenaOuter);
          col.lerp(cArena, wArenaInner);
        }

        const dShrine = Math.hypot(x - ZONES.shrine.x, z - ZONES.shrine.z);
        const wShrine = 1.0 - smoothstep(14.2, 14.6, dShrine);
        if (wShrine > 0) col.lerp(cShrine, wShrine);
      }

      const wLake = smoothstep(
        ZONES.millpond.waterY + 0.05,
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
  const size = 640;
  const segs = 320;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const millB = BUILDINGS.find((b) => b.id === 'watermill');
  const mCos = Math.cos(-millB.rotY);
  const mSin = Math.sin(-millB.rotY);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y = terrainHeightAt(x, z);

    // Guarantee that every 2m grid vertex in the Waterwheel Tailrace channel sits at bedY (-3.0m)
    // so no coarse triangle edge can ever bridge above waterY (-1.2m) underneath the wheel.
    const lx = (x - millB.x) * mCos - (z - millB.z) * mSin;
    const lz = (x - millB.x) * mSin + (z - millB.z) * mCos;
    if (
      lx <= -millB.w * 0.5 + 0.45 &&
      lx >= -millB.w * 0.5 - 3.6 &&
      lz >= -5.2 &&
      lz <= 15.5
    ) {
      y = ZONES.millpond.bedY;
    }

    pos.setY(i, y);
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
  const segs = 28;
  const zStart = -64.0;
  const zEnd = LANDMARKS.waterfall.z;
  const halfW = 1.85;
  const positions = [];
  const indices = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = lerp(zStart, zEnd, t);
    const cx = streamCenterX(z);
    positions.push(cx - halfW, 5.18, z, cx + halfW, 5.18, z);
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
  const wf = LANDMARKS.waterfall;
  const millB = BUILDINGS.find((b) => b.id === 'watermill');

  const lakeMat = new THREE.MeshBasicMaterial({
    color: PALETTE.waterShallow,
    transparent: true,
    opacity: 0.92,
  });
  const foamMat = new THREE.MeshBasicMaterial({
    color: PALETTE.waterFoam,
    side: THREE.DoubleSide,
  });

  // Main Millpond Lake surface
  const lakeGeo = new THREE.CircleGeometry(1, 56);
  lakeGeo.rotateX(-Math.PI / 2);
  lakeGeo.scale(mp.rx * 0.96, 1, mp.rz * 0.96);
  const lake = new THREE.Mesh(lakeGeo, lakeMat);
  lake.position.set(mp.x, mp.waterY, mp.z);
  group.add(lake);

  // Waterfall Plunge Pool surface
  const plungePool = new THREE.Mesh(
    new THREE.CircleGeometry(5.6, 28).rotateX(-Math.PI / 2),
    lakeMat
  );
  plungePool.position.set(wf.x + 0.6, mp.waterY + 0.01, wf.z + 1.8);
  group.add(plungePool);

  // Dedicated Waterwheel Tailrace Channel surface & White Foam Strip right under the Waterwheel paddles
  const tailraceGroup = new THREE.Group();
  tailraceGroup.position.set(millB.x, mp.waterY + 0.015, millB.z);
  tailraceGroup.rotation.y = millB.rotY;

  const tailraceWater = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 11.5).rotateX(-Math.PI / 2),
    lakeMat
  );
  tailraceWater.position.set(-millB.w * 0.5 - 1.35, 0, 0.8);
  tailraceGroup.add(tailraceWater);

  const wheelFoamStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(1.75, 6.2).rotateX(-Math.PI / 2),
    foamMat
  );
  wheelFoamStrip.position.set(-millB.w * 0.5 - 0.72, 0.02, 0.4);
  tailraceGroup.add(wheelFoamStrip);
  group.add(tailraceGroup);

  group.add(buildCurvedStreamMesh(lakeMat));

  // Terraced, flat-topped stratified cliff rock ledges framing the waterfall & stream (zero stacked spheres!)
  const strataLedges = [
    // Left & right tiered cliff ledges flanking the waterfall drop
    { x: wf.x - 3.0, y: 2.1, z: wf.z - 0.4, w: 3.2, h: 4.4, d: 2.8, rotY: 0.18 },
    { x: wf.x - 4.2, y: 0.8, z: wf.z + 1.4, w: 2.8, h: 2.6, d: 2.6, rotY: -0.12 },
    { x: wf.x + 2.6, y: 2.3, z: wf.z - 1.4, w: 2.6, h: 4.4, d: 2.4, rotY: 0.35 },
    { x: wf.x - 1.6, y: 4.6, z: wf.z - 2.2, w: 2.6, h: 1.4, d: 2.2, rotY: 0.08 },
    // Northern Headwaters Rock Spring Grotto & shelf strata slabs
    { x: streamCenterX(-64.0), y: 5.8, z: -65.2, w: 5.4, h: 2.2, d: 3.2, rotY: 0.08 },
    { x: streamCenterX(-64.0) - 2.6, y: 5.4, z: -63.2, w: 2.8, h: 1.5, d: 2.6, rotY: 0.25 },
    { x: streamCenterX(-64.0) + 2.6, y: 5.4, z: -63.2, w: 2.8, h: 1.5, d: 2.6, rotY: -0.22 },
    { x: streamCenterX(-50.0) - 3.0, y: 5.3, z: -50.0, w: 2.6, h: 0.9, d: 2.2, rotY: -0.2 },
    { x: streamCenterX(-36.0) + 2.9, y: 5.3, z: -36.0, w: 2.4, h: 0.85, d: 2.0, rotY: 0.25 },
  ];
  for (const s of strataLedges) {
    const ledgeGroup = new THREE.Group();
    ledgeGroup.position.set(s.x, s.y, s.z);
    ledgeGroup.rotation.y = s.rotY;

    const mainSlab = attachOutline(
      new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), mats.cliff),
      0.018
    );
    ledgeGroup.add(mainSlab);

    // Upper flat stratified stone shelf cap
    const capSlab = attachOutline(
      new THREE.Mesh(
        new THREE.BoxGeometry(s.w * 0.86, 0.36, s.d * 0.86),
        mats.stoneDark
      ),
      0.014
    );
    capSlab.position.y = s.h * 0.5 + 0.18;
    ledgeGroup.add(capSlab);
    group.add(ledgeGroup);
  }

  // Timber Trestle Headrace Flume carrying water from the NW stream shelf over the Waterwheel
  const flumeGroup = new THREE.Group();
  flumeGroup.position.set(millB.x, 0, millB.z);
  flumeGroup.rotation.y = millB.rotY;

  const flumeX = -millB.w * 0.5 - 0.72;
  const flumeY = 4.25;
  const flumeLen = 6.2;
  const trough = attachOutline(
    new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.48, flumeLen), mats.timber),
    0.016
  );
  trough.position.set(flumeX, flumeY, -2.6);
  flumeGroup.add(trough);

  for (const tz of [-5.0, -1.8]) {
    for (const tx of [flumeX - 0.58, flumeX + 0.58]) {
      const leg = attachOutline(
        new THREE.Mesh(new THREE.BoxGeometry(0.2, 6.2, 0.2), mats.timber),
        0.012
      );
      leg.position.set(tx, flumeY - 3.2, tz);
      flumeGroup.add(leg);
    }
  }

  const flumeWater = new THREE.Mesh(
    new THREE.PlaneGeometry(1.24, flumeLen - 0.15).rotateX(-Math.PI / 2),
    lakeMat
  );
  flumeWater.position.set(flumeX, flumeY + 0.25, -2.6);
  flumeGroup.add(flumeWater);
  group.add(flumeGroup);

  // Animated Waterfall Curtain
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
  waterfallMesh.rotation.y = millB.rotY;
  waterfallMesh.rotation.x = -0.2;
  waterfallMesh.userData.dynamic = true;
  group.add(waterfallMesh);

  const foamRing = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 4.2, 28),
    foamMat
  );
  foamRing.rotation.x = -Math.PI / 2;
  foamRing.position.set(wf.x + 0.5, mp.waterY + 0.04, wf.z + 1.2);
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

  // Deep stone plinth reaching cleanly into the terrain / water channel bed
  const plinthH = b.id === 'watermill' ? 3.8 : 2.25;
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

  // Timber frame posts on all 4 corners + side gable king-post studs
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

  // Flush front cross-gable (w * 0.46, matching eave & ridge height cleanly without protruding wall box seams)
  if (b.crossGable) {
    const cgW = b.w * 0.46;
    const cgDepth = b.d * 0.54;
    const cgRise = b.roofH * 0.96;

    const cgFillGeo = buildGableRoofGeometry(cgDepth - 0.08, cgW - 0.12, cgRise - 0.06, 0.0);
    const cgFill = new THREE.Mesh(cgFillGeo, mats.stucco);
    cgFill.rotation.y = Math.PI * 0.5;
    cgFill.position.set(0, 0.55 + b.wallH, b.d * 0.5 - cgDepth * 0.48);
    group.add(cgFill);

    const cgRoof = markOutline(
      new THREE.Mesh(buildGableRoofGeometry(cgDepth, cgW, cgRise, 0.28), roofMat)
    );
    cgRoof.rotation.y = Math.PI * 0.5;
    cgRoof.position.set(0, 0.55 + b.wallH, b.d * 0.5 - cgDepth * 0.48);
    group.add(cgRoof);

    addWindowUnit(
      group,
      mats,
      0,
      0.55 + b.wallH + cgRise * 0.38,
      b.d * 0.5 + 0.05,
      0,
      0.92,
      1.05
    );
  }

  // Setback roof dormer whose ridge & rear slope stay well below the main roof ridge
  if (b.dormer && !b.crossGable) {
    const dx = 0.85;
    const dy = 0.55 + b.wallH + b.roofH * 0.26;
    const dz = b.d * 0.28;
    const dBox = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.82, 1.15), mats.stucco)
    );
    dBox.position.set(dx, dy, dz);
    group.add(dBox);

    const dRoof = markOutline(
      new THREE.Mesh(buildGableRoofGeometry(1.22, 1.25, 0.44, 0.16), roofMat)
    );
    dRoof.rotation.y = Math.PI * 0.5;
    dRoof.position.set(dx, dy + 0.41, dz);
    group.add(dRoof);

    const dWin = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.54, 0.14), mats.window);
    dWin.position.set(dx, dy + 0.02, dz + 0.58);
    group.add(dWin);
  }

  // Stone chimney with projecting stone collar, beveled chimney cap & flue pot
  if (b.chimneySide !== 0) {
    const chW = b.heavyForge ? 1.15 : 0.92;
    const chH = b.wallH + b.roofH + (b.heavyForge ? 1.35 : 1.05);
    const chX = b.chimneySide * (b.w * 0.34);
    const chZ = -b.d * 0.22;
    const topY = 0.55 + chH;

    const chimney = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(chW, chH, chW), mats.stoneDark)
    );
    chimney.position.set(chX, 0.55 + chH * 0.5, chZ);
    group.add(chimney);

    const collar = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(chW + 0.22, 0.18, chW + 0.22), mats.stone)
    );
    collar.position.set(chX, topY - 0.28, chZ);
    group.add(collar);

    const cap = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(chW + 0.32, 0.22, chW + 0.32), mats.stone)
    );
    cap.position.set(chX, topY + 0.08, chZ);
    group.add(cap);

    const fluePot = markOutline(
      new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.25, 0.36, 8), mats.iron)
    );
    fluePot.position.set(chX, topY + 0.34, chZ);
    group.add(fluePot);
  }

  // Every building has its front door flush at lz = +b.d * 0.5 and 2.3m-wide front steps extending to +b.d * 0.5 + 1.35
  const doorFrontZ = b.d * 0.5;
  if (b.awning === 'front_porch') {
    // Porch canopy (w = 4.2m) centered over lx = 0, posts at lx = -1.75 and +1.75 straddling outside the 2.3m steps
    const porchRoof = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 2.2), roofMat)
    );
    porchRoof.position.set(0, 3.35, doorFrontZ + 0.95);
    porchRoof.rotation.x = 0.22;
    group.add(porchRoof);
    for (const px of [-1.75, 1.75]) {
      const pPost = markOutline(
        new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.15, 0.22), mats.timber)
      );
      pPost.position.set(px, 1.52, doorFrontZ + 1.75);
      group.add(pPost);
    }
    // Outdoor wooden table with 4 legs + 2 benches set cleanly to the side of the porch
    const tx = -3.55;
    const tz = doorFrontZ + 1.35;
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
    // Open-sided forge shed awning on the +X side wall
    const shedRoof = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 4.4), roofMat)
    );
    shedRoof.position.set(b.w * 0.5 + 1.6, 3.3, 0.5);
    shedRoof.rotation.z = -0.26;
    group.add(shedRoof);
    for (const sz of [-1.4, 2.2]) {
      const sPost = markOutline(
        new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 0.22), mats.timber)
      );
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
      new THREE.Mesh(new THREE.BoxGeometry(2.3 - s * 0.22, 0.75, 0.68), mats.stone)
    );
    step.position.set(0, (1 - s) * 0.24 - 0.12, doorFrontZ + 0.42 + s * 0.48);
    group.add(step);
  }

  for (const sx of [-1.25, 1.25]) {
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), mats.lantern);
    lantern.position.set(sx, 2.45, doorFrontZ + 0.22);
    group.add(lantern);
  }

  // Windows on all 4 elevations
  const fZ = b.d * 0.5 + 0.04;
  for (const sx of [-b.w * 0.31, b.w * 0.31]) {
    addWindowUnit(group, mats, sx, 2.15, fZ, 0);
    addWindowUnit(group, mats, sx, 2.15, -fZ, Math.PI);
    if (b.stories >= 1.5) {
      addWindowUnit(group, mats, sx, 4.15, fZ, 0, 1.0, 1.2);
      addWindowUnit(group, mats, sx, 4.15, -fZ, Math.PI, 1.0, 1.2);
    }
  }

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

  // Waterwheel on Watermill's -X wall: bottom paddles dip directly into the -1.2m water channel & white foam!
  if (b.hasWaterwheel && dynamicRoot) {
    const wheelWorld = new THREE.Group();
    wheelWorld.position.set(b.x, b.y, b.z);
    wheelWorld.rotation.y = b.rotY;

    const wheelGroup = new THREE.Group();
    // Hub at ly = 0.85 (world y = 1.15m); with radius 2.55m, bottom paddles reach y = -1.50m (submerged in -1.20m water!)
    wheelGroup.position.set(-b.w * 0.5 - 0.72, 0.85, 0);
    const rim = attachOutline(
      new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.18, 8, 28), mats.timber),
      0.018
    );
    rim.rotation.y = Math.PI * 0.5;
    wheelGroup.add(rim);

    for (let p = 0; p < 12; p++) {
      const ang = (p / 12) * Math.PI * 2;
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.16, 0.62), mats.door);
      paddle.position.set(0, Math.cos(ang) * 2.45, Math.sin(ang) * 2.45);
      paddle.rotation.x = ang;
      wheelGroup.add(paddle);

      if (p < 6) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.85, 0.18), mats.timber);
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

  // Kitchen garden patch on Gardener's +X side (ox: +6.6, oz: 0) on flat hamlet ground
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

  // 4 low bollard-and-rail segments with vertical bollards at BOTH ends of every rail
  const arcAngles = [0.72, 2.38, -2.35, -0.74];
  const r = LANDMARKS.well.plazaRadius - 0.35;
  for (const ang of arcAngles) {
    const segGroup = new THREE.Group();
    segGroup.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    segGroup.rotation.y = -ang + Math.PI * 0.5;

    for (const px of [-1.15, 1.15]) {
      const bollard = markOutline(
        new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.86, 0.36), mats.stoneDark)
      );
      bollard.position.set(px, 0.43, 0);
      segGroup.add(bollard);
    }
    for (const ry of [0.32, 0.62]) {
      const rail = markOutline(
        new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.12), mats.timber)
      );
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

  // Solid stone pier abutment / masonry landing at the shore end (x = [-35.5, -31.7], z = 8.5)
  // Top face sits at pier.y + 0.12 (-0.23m), 100% flush with the top of the wooden pier deck!
  const abutW = 3.8;
  const abutH = 2.8;
  const abutment = markOutline(
    new THREE.Mesh(
      new THREE.BoxGeometry(abutW, abutH, pier.width + 0.9),
      mats.stone
    )
  );
  abutment.position.set(pier.xStart + abutW * 0.5, pier.y + 0.12 - abutH * 0.5, pier.z);
  group.add(abutment);

  // Landward approach step transitioning smoothly to the West Mill Road
  const roadStep = markOutline(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 1.8, pier.width + 0.5),
      mats.stone
    )
  );
  roadStep.position.set(pier.xStart + abutW + 0.42, pier.y + 0.24 - 0.9, pier.z);
  group.add(roadStep);

  for (const sz of [-(pier.width * 0.5 + 0.25), pier.width * 0.5 + 0.25]) {
    const curb = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(abutW - 0.1, 0.38, 0.42), mats.stoneDark)
    );
    curb.position.set(pier.xStart + abutW * 0.5, pier.y + 0.31, pier.z + sz);
    group.add(curb);
  }

  // Wooden pier deck extending cleanly from xStart (-35.5) to xEnd (-52.0) flush with abutment top
  const deck = markOutline(
    new THREE.Mesh(new THREE.BoxGeometry(len, 0.24, pier.width), mats.timber)
  );
  deck.position.set(cx, pier.y, pier.z);
  group.add(deck);

  for (let x = pier.xEnd + 0.8; x <= pier.xStart - 0.6; x += 3.1) {
    for (const sz of [-pier.width * 0.44, pier.width * 0.44]) {
      const piling = markOutline(
        new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 2.8, 8), mats.door)
      );
      piling.position.set(x, pier.y - 1.45, pier.z + sz);
      group.add(piling);

      const bollard = markOutline(
        new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.42, 8), mats.door)
      );
      bollard.position.set(x, pier.y + 0.28, pier.z + sz);
      group.add(bollard);
    }
  }

  // Moored wooden boat next to the pier on the southern bay side in full view
  const boat = markOutline(
    new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.58, 1.55), mats.door)
  );
  boat.position.set(pier.xEnd + 5.8, ZONES.millpond.waterY + 0.16, pier.z + 2.65);
  boat.rotation.y = 0.14;
  group.add(boat);

  return group;
}

function buildArenaFence(mats) {
  const group = new THREE.Group();
  group.name = 'arenaFence';

  const arena = ZONES.arena;
  const fenceR = arena.fenceR || 19.5;
  const postCount = 24;
  // Angle 0 is East (+X), Angle PI / -PI is West (-X) where the West Gate is located
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
    posts.push({ x: fx, y: fy, z: fz, isGatePost: i === 0 || i === postCount });

    const isGate = i === 0 || i === postCount;
    const postH = isGate ? 1.75 : 1.28;
    const postW = isGate ? 0.36 : 0.25;
    const post = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(postW, postH, postW), mats.timber)
    );
    post.position.set(fx, fy + postH * 0.5, fz);
    group.add(post);

    if (isGate) {
      const cap = markOutline(
        new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.48), mats.stoneDark)
      );
      cap.position.set(fx, fy + postH + 0.08, fz);
      group.add(cap);

      const lantern = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.36, 0.28),
        mats.lantern
      );
      lantern.position.set(fx, fy + postH + 0.34, fz);
      group.add(lantern);
    }
  }

  // Every rail spans strictly between post[i] and post[i+1] — zero cantilevered rails hanging in mid-air!
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
      const rail = markOutline(
        new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, segLen), mats.timber)
      );
      rail.position.set(mx, my + ry, mz);
      rail.rotation.y = yaw;
      group.add(rail);
    }
  }

  return group;
}

function buildSlopedStringerGeometry(width, zStart, zEnd, yStart, yEnd) {
  const len = Math.abs(zEnd - zStart);
  const height = 0.82;
  // Start from a non-indexed BoxGeometry (which has 100% outward right-handed normals)
  // and shear Y linearly by Z so end faces stay vertical at zStart and zEnd.
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

function buildShrineOverlook(mats, colliders) {
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
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(4.32, stepH, stepDepth),
      mats.stone
    );
    step.position.set(0.0, stepTopY - stepH * 0.5, sz);
    group.add(step);
  }

  // Continuous, flush sloped stone stringers on left (x = -2.35) and right (x = +2.35)
  const stringerGeo = buildSlopedStringerGeometry(0.46, zStart, zEnd, yStart, yEnd);
  for (const sx of [-2.35, 2.35]) {
    const stringer = markOutline(new THREE.Mesh(stringerGeo, mats.stoneDark));
    stringer.position.x = sx;
    group.add(stringer);

    // Bottom entry newel post at z = -15.0
    const botPost = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.58), mats.stoneDark)
    );
    botPost.position.set(sx, yStart + 0.32, zStart + 0.15);
    group.add(botPost);

    // Top landing newel post at z = -71.5
    const topPost = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.64, 0.58), mats.stoneDark)
    );
    topPost.position.set(sx, yEnd + 0.24, zEnd - 0.15);
    group.add(topPost);
  }

  const shX = ZONES.shrine.x;
  const shZ = ZONES.shrine.z;
  const shY = ZONES.shrine.y;
  const platR = ZONES.shrine.platformR || 14.5;

  const platformCurb = markOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(platR, platR + 0.4, 0.28, 48), mats.stone)
  );
  platformCurb.position.set(shX, shY + 0.04, shZ);
  group.add(platformCurb);

  const innerRing = new THREE.Mesh(
    new THREE.CylinderGeometry(7.8, 7.8, 0.29, 36),
    mats.stoneDark
  );
  innerRing.position.set(shX, shY + 0.05, shZ);
  group.add(innerRing);

  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * Math.PI * 2;
    const diamondGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.30, 4);
    diamondGeo.scale(1.0, 1.0, 2.5);
    const petal = new THREE.Mesh(diamondGeo, mats.shrineAccent);
    petal.position.set(
      shX + Math.sin(a) * 3.6,
      shY + 0.06,
      shZ + Math.cos(a) * 3.6
    );
    petal.rotation.y = a;
    group.add(petal);
  }

  const centerHub = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 0.32, 20),
    mats.stone
  );
  centerHub.position.set(shX, shY + 0.068, shZ);
  group.add(centerHub);

  // Romanesque Stone Shrine Arch at (0.0, -93.5, y: 8.0, span: 6.2, height: 5.8)
  const arch = LANDMARKS.shrineArch;
  const pierOffset = arch.span * 0.5;
  for (const sx of [-pierOffset, pierOffset]) {
    const plinth = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.72, 1.85), mats.stoneDark)
    );
    plinth.position.set(arch.x + sx, arch.y + 0.36, arch.z);
    group.add(plinth);

    const pier = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(1.38, arch.height, 1.38), mats.stone)
    );
    pier.position.set(arch.x + sx, arch.y + arch.height * 0.5, arch.z);
    group.add(pier);

    const capital = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.42, 1.68), mats.stoneDark)
    );
    capital.position.set(arch.x + sx, arch.y + arch.height - 0.1, arch.z);
    group.add(capital);

    colliders.push({ type: 'circle', x: arch.x + sx, z: arch.z, r: 0.95 });
  }

  const archCrown = markOutline(
    new THREE.Mesh(
      new THREE.TorusGeometry(pierOffset, 0.64, 10, 24, Math.PI),
      mats.stone
    )
  );
  archCrown.position.set(arch.x, arch.y + arch.height - 0.1, arch.z);
  group.add(archCrown);

  // Top Romanesque Keystone Crown
  const keystone = markOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.15, 1.48), mats.stoneDark)
  );
  keystone.position.set(arch.x, arch.y + arch.height + pierOffset - 0.05, arch.z);
  group.add(keystone);

  // Shrine Spell Pedestal
  const ped = markOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 1.25, 8), mats.stoneDark)
  );
  ped.position.set(shX - 5.8, arch.y + 0.62, shZ - 1.8);
  group.add(ped);
  colliders.push({ type: 'circle', x: shX - 5.8, z: shZ - 1.8, r: 1.1 });

  return group;
}

function buildBoundaryMarkers(mats) {
  const group = new THREE.Group();
  group.name = 'boundaryMarkers';

  const markerCount = 24;
  for (let i = 0; i < markerCount; i++) {
    const a = (i / markerCount) * Math.PI * 2;
    const bx = Math.cos(a) * PLAY_BOUNDARY_RADIUS;
    const bz = Math.sin(a) * PLAY_BOUNDARY_RADIUS;
    // Skip placing pillar directly in the center of the South Approach road
    if (bz > 90 && Math.abs(bx) < 6.0) continue;
    const by = terrainHeightAt(bx, bz);
    if (by < ZONES.millpond.waterY + 0.2) continue;

    const pillar = new THREE.Group();
    pillar.position.set(bx, by, bz);
    pillar.rotation.y = -a + Math.PI * 0.5;

    const base = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.85), mats.stoneDark)
    );
    base.position.y = 0.22;
    pillar.add(base);

    const shaft = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.54, 1.85, 0.54), mats.stone)
    );
    shaft.position.y = 1.15;
    pillar.add(shaft);

    const cap = markOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.28, 0.92), mats.stoneDark)
    );
    cap.position.y = 2.15;
    pillar.add(cap);

    const rune = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.34, 0.28),
      mats.lantern
    );
    rune.position.y = 2.42;
    pillar.add(rune);

    group.add(pillar);
  }

  return group;
}

function buildTreesAndFlowerDrifts(mats, colliders) {
  const group = new THREE.Group();
  group.name = 'treesAndFlowers';

  const planterSoilMat = new THREE.MeshBasicMaterial({ color: 0x5c4028 });

  for (const t of TREES) {
    const ty = terrainHeightAt(t.x, t.z);
    const tree = new THREE.Group();
    tree.position.set(t.x, ty, t.z);
    const s = t.scale || 1.0;

    if (t.hasPlanter) {
      const planterRim = markOutline(
        new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.92, 0.56, 20), mats.stoneDark)
      );
      planterRim.position.y = 0.28;
      tree.add(planterRim);

      const planterSoil = new THREE.Mesh(
        new THREE.CylinderGeometry(1.48, 1.48, 0.60, 20),
        planterSoilMat
      );
      planterSoil.position.y = 0.29;
      tree.add(planterSoil);
    }

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

      // Soft, rounded cascade clusters (3 stacked ovoids per hanging strand — zero spiky cones!)
      if (t.kind === 'wisteria') {
        const strandCount = 14;
        for (let r = 0; r < strandCount; r++) {
          const a = (r / strandCount) * Math.PI * 2;
          const rad = (1.65 + (r % 3) * 0.95) * s;
          const sx = Math.cos(a) * rad;
          const sz = Math.sin(a) * rad;
          const beads = [
            { dy: 5.55, br: 0.34, mat: mats.wisteria },
            { dy: 4.92, br: 0.27, mat: mats.wisteriaLight },
            { dy: 4.38, br: 0.20, mat: mats.wisteriaLight },
          ];
          for (const b of beads) {
            const bead = new THREE.Mesh(
              new THREE.DodecahedronGeometry(b.br * s, 1),
              b.mat
            );
            bead.position.set(sx, b.dy * s, sz);
            bead.scale.set(0.85, 1.32, 0.85);
            tree.add(bead);
          }
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

  // Compute Inn NPC in local Inn coordinates (lz = inn.d * 0.5 + 2.4, lx = -2.2) so it never clips into the steps
  const inn = BUILDINGS.find((b) => b.id === 'inn');
  const lx = -2.2;
  const lz = inn.d * 0.5 + 2.4;
  const innNpcX = inn.x + lx * Math.cos(inn.rotY) + lz * Math.sin(inn.rotY);
  const innNpcZ = inn.z - lx * Math.sin(inn.rotY) + lz * Math.cos(inn.rotY);

  const spots = [
    { x: innNpcX, z: innNpcZ, y: 0.0, rotY: inn.rotY, color: 0xea580c }, // Outside Inn steps on cobblestone apron
    { x: -48.5, z: LANDMARKS.pier.z, y: LANDMARKS.pier.y, rotY: 1.57, color: 0x0ea5e9 }, // On Wooden Pier deck
    { x: ZONES.arena.x, z: ZONES.arena.z, y: ZONES.arena.y, rotY: -1.5, color: 0xa855f7 }, // Center of East Wisteria Combat Ring
    { x: -3.8, z: -87.5, y: ZONES.shrine.y, rotY: 0.4, color: 0x10b981 }, // Beside Shrine Spell Pedestal
  ];
  for (const s of spots) {
    const m = createCharacterMannequin(s.color);
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = s.rotY;
    group.add(m);
  }
  return group;
}
