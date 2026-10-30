import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  INNER_EXTENT,
  WORLD_SIZE,
  ZONES,
  BUILDINGS,
  BUILDINGS_BY_ID,
  LANDMARKS,
  TREES,
  terrainHeightAt,
  terrainNormalAt,
  streamCenterX,
  createWorldMaskTexture,
  clamp,
  lerp,
  smoothstep,
} from './geography.js';

/**
 * Frustum-Culled Chunked Valley Terrain, 512x512 Gouache Splat Shader with
 * Painterly Meadow Brushstrokes & Wildflower Stippling, Directional Architectural
 * & Dappled Tree Shadows, Sculpted Multi-Ridge Mountain Horizon, and v7 Hydrological System
 * (`world/assets/terrain/terrain-water.js`).
 */

export const PALETTE = {
  ink: 0x22140d,
  stucco: 0xf4e7cc,
  stuccoWarm: 0xeee0c2,
  timber: 0x9e6838,
  timberDark: 0x7c4e29,
  timberLight: 0xc28b56,
  stone: 0xd4cfc2,
  stoneWarm: 0xe2dcd0,
  stoneDark: 0xa8a294,
  roofRed: 0xd94e28,
  doorWood: 0x7c4a24,
  windowBlue: 0x2f6fc4,
  glassTint: 0x7cc5eb,
  lanternGlow: 0xffd27d,
  emberGlow: 0xff5a1f,
  grassMid: 0x74b650,
  grassLight: 0x9ed460,
  grassDark: 0x549440,
  grassSunSweep: 0xbae266,
  treeShadowCol: 0x3b7638,
  dirtRoad: 0xd4b483,
  dirtEdge: 0xb89768,
  cobble: 0xc8c2b4,
  sandBank: 0xdfc99b,
  arenaEarth: 0xd9c298,
  shrineStone: 0xe4decb,
  shrineAccent: 0x6f95ad,
  shrineGold: 0xe2ba5a,
  cliffRock: 0x8e8c84,
  cliffDark: 0x6e6c64,
  cliffLight: 0xa8a498,
  waterShallow: 0x34a8bc,
  waterDeep: 0x156584,
  waterFoam: 0xeffbff,
  wisteriaViolet: 0xb580ea,
  wisteriaDeep: 0x8b56c8,
  wisteriaPink: 0xe8a4d8,
  sakuraPink: 0xf7b0c6,
  sakuraDeep: 0xd87ca0,
  leafGreen: 0x62a84c,
  leafLight: 0x8ad064,
  leafDark: 0x498438,
  trunk: 0x8c583a,
};

export const MAX_TREE_SHADOWS = 48;

export function buildTreeShadowUniformArray(treeList = TREES) {
  const arr = [];
  const count = Math.min(MAX_TREE_SHADOWS, treeList.length);
  for (let i = 0; i < MAX_TREE_SHADOWS; i++) {
    if (i < count) {
      const t = treeList[i];
      const ty = terrainHeightAt(t.x, t.z);
      const rCanopy = (t.scale || 1.0) * 3.55;
      arr.push(new THREE.Vector4(t.x, ty, t.z, rCanopy));
    } else {
      arr.push(new THREE.Vector4(9999.0, 0.0, 9999.0, 0.01));
    }
  }
  return { treeShadowVecs: arr, treeCount: count };
}

function buildBuildingShadowUniforms() {
  const posArr = [];
  const rotArr = [];
  for (let i = 0; i < 5; i++) {
    const b = BUILDINGS[i] || BUILDINGS[0];
    posArr.push(new THREE.Vector4(b.x, b.z, b.w * 0.52, b.d * 0.52));
    rotArr.push(new THREE.Vector4(b.cosNeg, b.sinNeg, b.wallH + b.roofH * 0.55, 0.0));
  }
  return { posArr, rotArr };
}

const SUN_DIR = new THREE.Vector3(-48, 76, 58).normalize();

let sharedGradientMap = null;
export function makeToonGradient() {
  if (sharedGradientMap) return sharedGradientMap;
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
  sharedGradientMap = tex;
  return tex;
}

export function makeOutlineMaterial(thickness = 0.02, color = PALETTE.ink) {
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

function stripBottomFaces(nonIndexedGeo) {
  const pos = nonIndexedGeo.attributes.position;
  const norm = nonIndexedGeo.attributes.normal;
  const col = nonIndexedGeo.attributes.color;
  const triCount = pos.count / 3;
  const keepPos = [];
  const keepNorm = [];
  const keepCol = col ? [] : null;

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const ny = (norm.getY(i0) + norm.getY(i0 + 1) + norm.getY(i0 + 2)) / 3;
    if (ny < -0.92) continue;
    for (let k = 0; k < 3; k++) {
      const vi = i0 + k;
      keepPos.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
      keepNorm.push(norm.getX(vi), norm.getY(vi), norm.getZ(vi));
      if (keepCol) {
        keepCol.push(col.getX(vi), col.getY(vi), col.getZ(vi));
      }
    }
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keepPos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(keepNorm, 3));
  if (keepCol) {
    out.setAttribute('color', new THREE.Float32BufferAttribute(keepCol, 3));
  }
  return out;
}

function buildBakedOutlineGeo(nonIndexedGeo, thickness = 0.022) {
  const pos = nonIndexedGeo.attributes.position;
  const norm = nonIndexedGeo.attributes.normal;
  const count = pos.count;

  const smoothMap = new Map();
  const keys = new Array(count);
  for (let i = 0; i < count; i++) {
    const kx = Math.round(pos.getX(i) * 200);
    const ky = Math.round(pos.getY(i) * 200);
    const kz = Math.round(pos.getZ(i) * 200);
    const key = `${kx},${ky},${kz}`;
    keys[i] = key;
    let acc = smoothMap.get(key);
    if (!acc) {
      acc = [0, 0, 0];
      smoothMap.set(key, acc);
    }
    acc[0] += norm.getX(i);
    acc[1] += norm.getY(i);
    acc[2] += norm.getZ(i);
  }

  for (const acc of smoothMap.values()) {
    const len = Math.hypot(acc[0], acc[1], acc[2]) || 1;
    acc[0] /= len;
    acc[1] /= len;
    acc[2] /= len;
  }

  const outPos = new Float32Array(count * 3);
  const outNorm = new Float32Array(count * 3);
  const outCol = new Float32Array(count * 3);
  const ink = new THREE.Color(PALETTE.ink);

  for (let i = 0; i < count; i += 3) {
    const remap = [i, i + 2, i + 1];
    for (let k = 0; k < 3; k++) {
      const src = remap[k];
      const dst = (i + k) * 3;
      const sn = smoothMap.get(keys[src]);
      outPos[dst] = pos.getX(src) + sn[0] * thickness;
      outPos[dst + 1] = pos.getY(src) + sn[1] * thickness;
      outPos[dst + 2] = pos.getZ(src) + sn[2] * thickness;
      outNorm[dst] = 0;
      outNorm[dst + 1] = 1;
      outNorm[dst + 2] = 0;
      outCol[dst] = ink.r;
      outCol[dst + 1] = ink.g;
      outCol[dst + 2] = ink.b;
    }
  }

  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  og.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  og.setAttribute('color', new THREE.BufferAttribute(outCol, 3));
  return og;
}

export function batchVertexColorGroup(
  group,
  {
    gradientMap = makeToonGradient(),
    flatShading = false,
    outlineThickness = 0.022,
    stripBottom = true,
    castShadow = true,
    receiveShadow = true,
  } = {}
) {
  group.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(group.matrixWorld).invert();

  const mergedGeos = [];
  const emissiveGeos = [];
  const tmpColor = new THREE.Color();

  group.traverse((child) => {
    if (!child.isMesh || child.userData.dynamic || child.userData.isOutline) return;
    let g = child.geometry.clone();
    if (g.index) g = g.toNonIndexed();

    const localMat = new THREE.Matrix4().multiplyMatrices(invRoot, child.matrixWorld);
    g.applyMatrix4(localMat);

    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    }
    const useFlat = child.userData.flatShading ?? flatShading;
    if (!g.attributes.normal || useFlat) {
      g.computeVertexNormals();
    }

    if (stripBottom && child.userData.stripBottom !== false) {
      g = stripBottomFaces(g);
    }

    const count = g.attributes.position.count;
    if (count === 0) return;

    const hex = child.userData.color ?? child.material?.color?.getHex?.() ?? 0xffffff;
    const isEmissiveGlow =
      child.userData.unlit &&
      (hex === PALETTE.lanternGlow || hex === 0x7ceeff || hex === PALETTE.emberGlow);

    if (child.userData.unlit) {
      const norm = g.attributes.normal;
      for (let i = 0; i < count; i++) {
        norm.setXYZ(i, SUN_DIR.x, SUN_DIR.y, SUN_DIR.z);
      }
    }

    if (!g.attributes.color) {
      const colors = new Float32Array(count * 3);
      tmpColor.setHex(hex);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    if (isEmissiveGlow) {
      emissiveGeos.push(g);
    } else {
      mergedGeos.push(g);
    }

    if (child.userData.outline) {
      mergedGeos.push(buildBakedOutlineGeo(g, child.userData.outlineThickness ?? outlineThickness));
    }
  });

  const outGroup = new THREE.Group();
  outGroup.name = `${group.name || 'group'}-batched`;

  if (mergedGeos.length > 0) {
    const merged = mergeGeometries(mergedGeos, false);
    const toonMat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap,
    });
    const toonMesh = new THREE.Mesh(merged, toonMat);
    toonMesh.name = `${group.name || 'group'}-toon`;
    toonMesh.castShadow = castShadow;
    toonMesh.receiveShadow = receiveShadow;
    outGroup.add(toonMesh);
  }

  if (emissiveGeos.length > 0) {
    const mergedEmissive = mergeGeometries(emissiveGeos, false);
    const emissiveMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
    });
    const emissiveMesh = new THREE.Mesh(mergedEmissive, emissiveMat);
    emissiveMesh.name = `${group.name || 'group'}-emissive`;
    outGroup.add(emissiveMesh);
  }

  return outGroup;
}

/**
 * Builds the Gouache Terrain ShaderMaterial driven by the fast 512x512 `uWorldMask` DataTexture,
 * with painterly spring-meadow brushstrokes, wildflower hillside stippling, and directional
 * shadows cast by trees, Tudor buildings, the Well, the Shrine Archway, and the Arena Fence.
 */
function createGouacheTerrainMaterial(worldMaskTex) {
  const { treeShadowVecs, treeCount } = buildTreeShadowUniformArray();
  const { posArr: bldgPos, rotArr: bldgRotH } = buildBuildingShadowUniforms();
  return new THREE.ShaderMaterial({
    uniforms: {
      uWorldMask: { value: worldMaskTex },
      uInnerSpan: { value: INNER_EXTENT * 2.0 }, // 280.0m
      uSunDir: { value: SUN_DIR.clone() },
      uLightTint: { value: new THREE.Color(1, 1, 1) },
      uGrassMid: { value: new THREE.Color(PALETTE.grassMid) },
      uGrassLight: { value: new THREE.Color(PALETTE.grassLight) },
      uGrassDark: { value: new THREE.Color(PALETTE.grassDark) },
      uGrassSunSweep: { value: new THREE.Color(PALETTE.grassSunSweep) },
      uTreeShadowCol: { value: new THREE.Color(PALETTE.treeShadowCol) },
      uTreeShadows: { value: treeShadowVecs },
      uTreeCount: { value: treeCount },
      uBldgPos: { value: bldgPos },
      uBldgRotH: { value: bldgRotH },
      uDirt: { value: new THREE.Color(PALETTE.dirtRoad) },
      uDirtEdge: { value: new THREE.Color(PALETTE.dirtEdge) },
      uCobble: { value: new THREE.Color(PALETTE.cobble) },
      uSand: { value: new THREE.Color(PALETTE.sandBank) },
      uArena: { value: new THREE.Color(PALETTE.arenaEarth) },
      uShrine: { value: new THREE.Color(PALETTE.shrineStone) },
      uLakeBed: { value: new THREE.Color(0x28788c) },
      uMountainRock: { value: new THREE.Color(0x64886c) },
      uMountainCrest: { value: new THREE.Color(0x7c989e) },
      uFogColor: { value: new THREE.Color(0xd8eef8) },
      uFogNear: { value: 165.0 },
      uFogFar: { value: 540.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vViewDist;

      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vViewDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uWorldMask;
      uniform float uInnerSpan;
      uniform vec3 uSunDir;
      uniform vec3 uLightTint;
      uniform vec3 uGrassMid;
      uniform vec3 uGrassLight;
      uniform vec3 uGrassDark;
      uniform vec3 uGrassSunSweep;
      uniform vec3 uTreeShadowCol;
      uniform vec4 uTreeShadows[48];
      uniform int uTreeCount;
      uniform vec4 uBldgPos[5];
      uniform vec4 uBldgRotH[5];
      uniform vec3 uDirt;
      uniform vec3 uDirtEdge;
      uniform vec3 uCobble;
      uniform vec3 uSand;
      uniform vec3 uArena;
      uniform vec3 uShrine;
      uniform vec3 uLakeBed;
      uniform vec3 uMountainRock;
      uniform vec3 uMountainCrest;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;

      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vViewDist;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      vec3 evalCobblestone(vec2 xz, vec3 baseCol, float isShrine) {
        vec2 scale = isShrine > 0.5 ? vec2(1.35, 1.85) : vec2(2.15, 2.15);
        vec2 p = xz * scale;
        vec2 row = floor(p);
        p.x += mod(row.y, 2.0) * 0.45;
        vec2 cell = floor(p);
        vec2 f = fract(p) - 0.5;
        float h = hash21(cell);
        vec2 jitter = (vec2(h, fract(h * 17.3)) - 0.5) * (isShrine > 0.5 ? 0.08 : 0.20);
        vec2 d = abs(f - jitter);
        float stoneDist = isShrine > 0.5
          ? max(d.x, d.y)
          : length(max(d - vec2(0.14), 0.0)) + min(max(d.x - 0.14, d.y - 0.14), 0.0);
        float mortar = smoothstep(0.31, 0.43, stoneDist);
        vec3 warmVar = mix(vec3(0.95, 0.93, 0.90), vec3(1.06, 1.03, 0.98), h);
        vec3 stoneTint = baseCol * warmVar;
        vec3 mortarCol = baseCol * 0.74;
        return mix(stoneTint, mortarCol, mortar * 0.62);
      }

      float evalTreeGroundShadow(vec2 xz, vec3 sunDir) {
        vec2 sunFlat = normalize(vec2(sunDir.x, sunDir.z) + vec2(1e-5, 0.0));
        vec2 shadowDir = -sunFlat;
        vec2 perpDir = vec2(-shadowDir.y, shadowDir.x);
        float edgeRuffle = (vnoise(xz * 1.45) - 0.5) * 0.26;
        float dapple = smoothstep(0.18, 0.78, vnoise(xz * 1.85 + vec2(3.7, -2.1)));
        float maxShd = 0.0;

        for (int i = 0; i < 48; i++) {
          if (i >= uTreeCount) break;
          vec4 tr = uTreeShadows[i];
          vec2 rel = xz - tr.xz;
          float rCan = tr.w;
          if (abs(rel.x) > rCan * 2.5 || abs(rel.y) > rCan * 2.5) continue;

          float along = dot(rel, shadowDir);
          float across = abs(dot(rel, perpDir));

          // 1. Directional trunk shadow stripe starting at trunk base
          float trunkW = rCan * 0.11;
          float inTrunkLen = smoothstep(-0.18, 0.12, along) * (1.0 - smoothstep(rCan * 0.95, rCan * 1.35, along));
          float trunkShd = inTrunkLen * (1.0 - smoothstep(trunkW * 0.65, trunkW * 1.25, across));

          // 2. Stepped umbrella canopy shadow pool with dappled leaf gaps
          vec2 poolCenter = shadowDir * (rCan * 0.78);
          vec2 dPool = rel - poolCenter;
          float pAlong = dot(dPool, shadowDir) / (rCan * 1.18);
          float pAcross = dot(dPool, perpDir) / (rCan * 0.98);
          float poolDist = length(vec2(pAlong, pAcross)) + edgeRuffle * 0.18;
          float canopyMask = 1.0 - smoothstep(0.68, 1.02, poolDist);
          float canopyShd = canopyMask * mix(0.65, 1.0, dapple);

          float underDist = length(rel) / (rCan * 0.86) + edgeRuffle * 0.14;
          float underShd = (1.0 - smoothstep(0.62, 0.98, underDist)) * 0.85;

          maxShd = max(maxShd, max(trunkShd * 0.96, max(canopyShd, underShd)));
        }
        return clamp(maxShd, 0.0, 1.0);
      }

      /**
       * Directional architectural shadows cast by the 5 Tudor Houses, Central Well,
       * Romanesque Shrine Archway, Altar Pedestal, Shrine Planters, and Arena Fence.
       */
      float evalArchitectureShadow(vec2 xz, vec3 sunDir) {
        vec2 sunFlat = normalize(vec2(sunDir.x, sunDir.z) + vec2(1e-5, 0.0));
        vec2 shadowDir = -sunFlat;
        vec2 perpDir = vec2(-shadowDir.y, shadowDir.x);
        float shd = 0.0;

        // 1. 5 Tudor Buildings directional roof/wall shadow projection
        if (xz.x > -62.0 && xz.x < 34.0 && xz.y > -34.0 && xz.y < 32.0) {
          for (int i = 0; i < 5; i++) {
            vec4 bp = uBldgPos[i];
            vec4 br = uBldgRotH[i];
            float reach = br.z * 0.82;
            vec2 center = bp.xy + shadowDir * (reach * 0.48);
            vec2 rel = xz - center;
            if (abs(rel.x) > 12.0 || abs(rel.y) > 12.0) continue;
            float lx = rel.x * br.x - rel.y * br.y;
            float lz = rel.x * br.y + rel.y * br.x;
            vec2 sLocal = vec2(
              shadowDir.x * br.x - shadowDir.y * br.y,
              shadowDir.x * br.y + shadowDir.y * br.x
            );
            float ex = bp.z + abs(sLocal.x) * reach * 0.48;
            float ez = bp.w + abs(sLocal.y) * reach * 0.48;
            vec2 dBox = abs(vec2(lx, lz)) - vec2(ex, ez);
            float boxDist = length(max(dBox, 0.0)) + min(max(dBox.x, dBox.y), 0.0);
            shd = max(shd, (1.0 - smoothstep(-0.15, 0.65, boxDist)) * 0.88);
          }
        }

        // 2. Central Roofed Well shadow at (0, 0)
        if (abs(xz.x) < 6.5 && abs(xz.y) < 6.5) {
          vec2 wCenter = shadowDir * 1.45;
          float dWell = length((xz - wCenter) / vec2(1.75, 1.95));
          shd = max(shd, (1.0 - smoothstep(0.75, 1.08, dWell)) * 0.85);
        }

        // 3. Northern Shrine Archway, Altar Pedestal & Planters around (0, -90)
        if (xz.y < -69.0 && abs(xz.x) < 16.5) {
          // Left & Right Romanesque Arch Piers at (±3.1, -93.5) + Arch Span
          for (int s = -1; s <= 1; s += 2) {
            vec2 pierBase = vec2(float(s) * 3.1, -93.5);
            vec2 relP = xz - pierBase;
            float pAlong = dot(relP, shadowDir);
            float pAcross = abs(dot(relP, perpDir));
            float inPier = smoothstep(-0.6, 0.1, pAlong) * (1.0 - smoothstep(4.8, 5.8, pAlong))
                         * (1.0 - smoothstep(0.68, 1.05, pAcross));
            shd = max(shd, inPier * 0.88);
          }
          // Arch Crown bridge shadow
          vec2 archShadowCenter = vec2(0.0, -93.5) + shadowDir * 5.2;
          float dArchCrown = length((xz - archShadowCenter) / vec2(3.6, 1.35));
          shd = max(shd, (1.0 - smoothstep(0.72, 1.05, dArchCrown)) * 0.85);

          // Co-Op Spell Pedestal at (-5.8, -87.8)
          vec2 pedCenter = vec2(-5.8, -87.8) + shadowDir * 0.95;
          float dPed = length((xz - pedCenter) / vec2(1.25, 1.45));
          shd = max(shd, (1.0 - smoothstep(0.70, 1.05, dPed)) * 0.82);
        }

        // 4. East Arena Split-Rail Fence ring shadow at (68, -4, r = 19.5)
        if (xz.x > 46.0 && xz.x < 90.0 && xz.y > -26.0 && xz.y < 18.0) {
          vec2 arenaRel = xz - (vec2(68.0, -4.0) + shadowDir * 0.65);
          float dFence = abs(length(arenaRel) - 19.5);
          if (arenaRel.x > -18.2) {
            shd = max(shd, (1.0 - smoothstep(0.18, 0.58, dFence)) * 0.65);
          }
        }

        return clamp(shd, 0.0, 1.0);
      }

      void main() {
        vec2 xz = vWorldPos.xz;
        float h = vWorldPos.y;

        vec2 maskUv = xz / uInnerSpan + 0.5;
        float inInner = step(abs(xz.x), uInnerSpan * 0.5 - 0.5) * step(abs(xz.y), uInnerSpan * 0.5 - 0.5);
        vec4 mask = texture2D(uWorldMask, clamp(maskUv, 0.001, 0.999));

        // 1. Smooth Painterly Spring-Meadow Gradient & Sunlit Hillside Sweeps (zero noisy streaks!)
        float nBroad = vnoise(xz * 0.022 + vec2(1.7, 3.1));
        float nMed   = vnoise(xz * 0.055 + vec2(-2.3, 1.9));
        float meadowGrad = smoothstep(0.18, 0.82, nBroad * 0.68 + nMed * 0.32);
        vec3 col = mix(uGrassDark, uGrassMid, smoothstep(0.0, 0.52, meadowGrad));
        col = mix(col, uGrassLight, smoothstep(0.38, 0.92, meadowGrad));

        // Warm golden-green sunlit hillside sweeps (#b4de6b) matching ref-target-trees.png left hillside
        float ndl = dot(normalize(vWorldNormal), normalize(uSunDir)) * 0.5 + 0.5;
        float hillSweep = smoothstep(0.3, 9.0, h) * smoothstep(0.45, 0.80, ndl) * smoothstep(0.30, 0.78, nBroad);
        col = mix(col, uGrassSunSweep, hillSweep * 0.42);

        // Combined Directional Tree & Architectural Ground Shadows
        float treeShd = evalTreeGroundShadow(xz, uSunDir);
        float archShd = inInner > 0.5 ? evalArchitectureShadow(xz, uSunDir) : 0.0;
        float totalShd = max(treeShd, archShd);
        col = mix(col, uTreeShadowCol, totalShd * 0.76);

        if (inInner > 0.5) {
          float cobbleW = mask.r;
          float gVal = mask.g;
          float dirtW = (gVal < 0.502 && !(xz.x < -36.0 && xz.y > -28.0 && xz.y < 44.0))
            ? clamp(gVal * 2.0, 0.0, 1.0)
            : 0.0;

          float dPond = length((xz - vec2(-62.0, 6.0)) / vec2(28.0, 36.0));
          float dPlunge = length(xz - vec2(-51.4, -20.8)) / 14.0;
          float nearShore = 1.0 - smoothstep(0.95, 1.18, min(dPond, dPlunge));
          float sandW = nearShore * (1.0 - smoothstep(-0.45, -0.22, h)) * smoothstep(-1.55, -1.18, h);

          if (sandW > 0.01) {
            float peb = (vnoise(xz * 3.8) - 0.5) * 0.07;
            vec3 sandCol = (uSand + peb) * mix(1.0, 0.72, totalShd);
            col = mix(col, sandCol, sandW);
          }

          if (dirtW > 0.01) {
            float dArena = length(xz - vec2(68.0, -4.0));
            float isArena = 1.0 - smoothstep(16.0, 18.0, dArena);
            vec3 earthBase = mix(uDirt, uArena, isArena);
            float earthGrain = (vnoise(xz * 1.9) - 0.5) * 0.05;
            vec3 flagCol = evalCobblestone(xz * 0.85, mix(uDirt, uCobble, 0.55), 0.0);
            float centerStone = (1.0 - isArena) * smoothstep(0.55, 0.92, dirtW) * 0.38;
            vec3 pathInterior = mix(earthBase + earthGrain, flagCol, centerStone);
            float borderBand = dirtW * (1.0 - dirtW) * 3.0;
            vec3 roadCol = mix(pathInterior, uDirtEdge, clamp(borderBand, 0.0, 0.65));
            roadCol *= mix(1.0, 0.68, totalShd);
            col = mix(col, roadCol, smoothstep(0.02, 0.88, dirtW));
          }

          if (cobbleW > 0.01) {
            float isShrine = (1.0 - smoothstep(-18.0, -14.0, xz.y)) * (1.0 - smoothstep(15.0, 20.0, abs(xz.x)));
            float rOrigin = length(xz);
            float isWellCore = 1.0 - smoothstep(6.0, 7.2, rOrigin);
            vec3 baseStone = mix(uCobble, uShrine, max(isShrine, isWellCore * 0.65));
            vec3 cobbleCol = evalCobblestone(xz, baseStone, isShrine);
            float verge = cobbleW * (1.0 - cobbleW) * 2.8;
            vec3 vergeCol = mix(cobbleCol, uGrassDark * 0.95 + uCobble * 0.2, clamp(verge * (1.0 - dirtW), 0.0, 0.45));
            vergeCol *= mix(1.0, 0.66, totalShd);
            col = mix(col, vergeCol, smoothstep(0.03, 0.82, cobbleW));
          }
        }

        float wLake = 1.0 - smoothstep(-1.65, -1.15, h);
        if (wLake > 0.001) {
          col = mix(col, uLakeBed, wLake);
        }

        // Natural green-to-slate-blue atmospheric mountain flank shading (zero white snow stains!)
        float distOrigin = length(xz);
        if (distOrigin > 125.0) {
          float nMtn = vnoise(xz * 0.025) * 5.0;
          float hMod = h + nMtn;
          float wRock = smoothstep(12.0, 26.0, hMod) * smoothstep(128.0, 195.0, distOrigin);
          if (wRock > 0.001) {
            col = mix(col, uMountainRock, wRock * 0.65);
          }
          float wCrest = smoothstep(26.0, 40.0, hMod) * smoothstep(180.0, 250.0, distOrigin);
          if (wCrest > 0.001) {
            col = mix(col, uMountainCrest, wCrest * 0.72);
          }
        }

        float toonBand = 0.34 * smoothstep(0.28, 0.38, ndl)
                       + 0.33 * smoothstep(0.50, 0.60, ndl)
                       + 0.33 * smoothstep(0.70, 0.80, ndl);
        float toonShade = mix(0.78, 1.04, toonBand);
        float ao = inInner > 0.5 ? mix(0.66, 1.0, mask.a) : 1.0;

        col *= toonShade * ao * uLightTint;

        float fogFactor = smoothstep(uFogNear, uFogFar, vViewDist);
        col = mix(col, uFogColor, fogFactor);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function buildChunkWithOuterLip(chunkSize, chunkSegs, cx, cz) {
  const baseGeo = new THREE.PlaneGeometry(chunkSize, chunkSize, chunkSegs, chunkSegs);
  baseGeo.rotateX(-Math.PI / 2);
  baseGeo.deleteAttribute('uv');

  const pos = baseGeo.attributes.position;
  const norm = baseGeo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = cx + lx;
    const wz = cz + lz;
    const wy = terrainHeightAt(wx, wz);
    const [nx, ny, nz] = terrainNormalAt(wx, wz);
    pos.setY(i, wy);
    norm.setXYZ(i, nx, ny, nz);
  }
  pos.needsUpdate = true;
  norm.needsUpdate = true;

  const half = chunkSize * 0.5;
  const onWest = Math.abs((cx - half) - (-INNER_EXTENT)) < 0.1;
  const onEast = Math.abs((cx + half) - INNER_EXTENT) < 0.1;
  const onNorth = Math.abs((cz - half) - (-INNER_EXTENT)) < 0.1;
  const onSouth = Math.abs((cz + half) - INNER_EXTENT) < 0.1;

  if (!onWest && !onEast && !onNorth && !onSouth) {
    baseGeo.computeBoundingBox();
    baseGeo.computeBoundingSphere();
    return baseGeo;
  }

  const lipGeos = [baseGeo.toNonIndexed()];
  const lipDrop = 2.4;

  const addEdgeLip = (getEdgePoint) => {
    const lipPos = [];
    const lipNorm = [];
    for (let s = 0; s < chunkSegs; s++) {
      const t0 = s / chunkSegs - 0.5;
      const t1 = (s + 1) / chunkSegs - 0.5;
      const [lx0, lz0] = getEdgePoint(t0 * chunkSize);
      const [lx1, lz1] = getEdgePoint(t1 * chunkSize);
      const wx0 = cx + lx0;
      const wz0 = cz + lz0;
      const wx1 = cx + lx1;
      const wz1 = cz + lz1;
      const y0 = terrainHeightAt(wx0, wz0);
      const y1 = terrainHeightAt(wx1, wz1);
      const n0 = terrainNormalAt(wx0, wz0);
      const n1 = terrainNormalAt(wx1, wz1);

      lipPos.push(
        lx0, y0, lz0,
        lx1, y1, lz1,
        lx0, y0 - lipDrop, lz0,
        lx1, y1, lz1,
        lx1, y1 - lipDrop, lz1,
        lx0, y0 - lipDrop, lz0
      );
      for (let k = 0; k < 2; k++) {
        lipNorm.push(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], n0[0], n0[1], n0[2]);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lipPos, 3));
    lg.setAttribute('normal', new THREE.Float32BufferAttribute(lipNorm, 3));
    lipGeos.push(lg);
  };

  if (onWest) addEdgeLip((t) => [-half, t]);
  if (onEast) addEdgeLip((t) => [half, t]);
  if (onNorth) addEdgeLip((t) => [t, -half]);
  if (onSouth) addEdgeLip((t) => [t, half]);

  const merged = mergeGeometries(lipGeos, false);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildChunkedTerrainAndSkirt(terrainMat) {
  const group = new THREE.Group();
  group.name = 'chunked-terrain';

  const gridCount = 4;
  const chunkSize = (INNER_EXTENT * 2) / gridCount; // 70m
  const chunkSegs = 30;
  const chunks = [];

  for (let r = 0; r < gridCount; r++) {
    const cz = -INNER_EXTENT + (r + 0.5) * chunkSize;
    for (let c = 0; c < gridCount; c++) {
      const cx = -INNER_EXTENT + (c + 0.5) * chunkSize;
      const geo = buildChunkWithOuterLip(chunkSize, chunkSegs, cx, cz);

      const chunkMesh = new THREE.Mesh(geo, terrainMat);
      chunkMesh.name = `terrain-chunk-${r}-${c}`;
      chunkMesh.position.set(cx, 0, cz);
      chunkMesh.frustumCulled = true;
      chunkMesh.receiveShadow = true;
      group.add(chunkMesh);
      chunks.push(chunkMesh);
    }
  }

  const skirtSegs = 36;
  const ringSkipMin = 11;
  const ringSkipMax = 25;
  const overlapExtent = INNER_EXTENT - 4.5;

  const vertCount = (skirtSegs + 1) * (skirtSegs + 1);
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const indices = [];

  for (let iz = 0; iz <= skirtSegs; iz++) {
    const tz = iz / skirtSegs;
    let wz = (tz - 0.5) * WORLD_SIZE;
    if (iz === ringSkipMin - 1) wz = -overlapExtent;
    else if (iz === ringSkipMin - 2) wz = -INNER_EXTENT;
    else if (iz === ringSkipMax + 1) wz = overlapExtent;
    else if (iz === ringSkipMax + 2) wz = INNER_EXTENT;

    for (let ix = 0; ix <= skirtSegs; ix++) {
      const tx = ix / skirtSegs;
      let wx = (tx - 0.5) * WORLD_SIZE;
      if (ix === ringSkipMin - 1) wx = -overlapExtent;
      else if (ix === ringSkipMin - 2) wx = -INNER_EXTENT;
      else if (ix === ringSkipMax + 1) wx = overlapExtent;
      else if (ix === ringSkipMax + 2) wx = INNER_EXTENT;

      const idx = iz * (skirtSegs + 1) + ix;
      const maxAbs = Math.max(Math.abs(wx), Math.abs(wz));
      const tuckDrop =
        maxAbs < INNER_EXTENT - 0.5
          ? 0.45
          : maxAbs <= INNER_EXTENT + 0.5
          ? 0.06
          : 0.0;
      const wy = terrainHeightAt(wx, wz) - tuckDrop;
      const [nx, ny, nz] = terrainNormalAt(wx, wz, 0.8);

      positions[idx * 3] = wx;
      positions[idx * 3 + 1] = wy;
      positions[idx * 3 + 2] = wz;
      normals[idx * 3] = nx;
      normals[idx * 3 + 1] = ny;
      normals[idx * 3 + 2] = nz;
    }
  }

  for (let iz = 0; iz < skirtSegs; iz++) {
    for (let ix = 0; ix < skirtSegs; ix++) {
      if (
        ix >= ringSkipMin - 1 &&
        ix <= ringSkipMax &&
        iz >= ringSkipMin - 1 &&
        iz <= ringSkipMax
      ) {
        continue;
      }
      const a = iz * (skirtSegs + 1) + ix;
      const b = a + 1;
      const c = (iz + 1) * (skirtSegs + 1) + ix;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  skirtGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  skirtGeo.setIndex(indices);
  skirtGeo.computeBoundingBox();
  skirtGeo.computeBoundingSphere();

  const skirtMesh = new THREE.Mesh(skirtGeo, terrainMat);
  skirtMesh.name = 'outer-valley-skirt';
  skirtMesh.receiveShadow = true;
  group.add(skirtMesh);

  return { group, chunks, skirtMesh };
}

function addStratifiedRockMass(parent, { x, y, z, rx, ry, rz, rotY = 0, mossCap = true, segs = 7 }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const bodyGeo = new THREE.CylinderGeometry(rx * 0.82, rx * 1.04, ry, segs, 1, false);
  bodyGeo.scale(1.0, 1.0, rz / rx);
  const body = new THREE.Mesh(bodyGeo);
  body.userData.color = PALETTE.cliffRock;
  body.userData.outline = false;
  g.add(body);

  const lowerStrataGeo = new THREE.CylinderGeometry(rx * 0.96, rx * 1.12, ry * 0.45, segs, 1, false);
  lowerStrataGeo.scale(1.04, 1.0, (rz / rx) * 1.04);
  const lower = new THREE.Mesh(lowerStrataGeo);
  lower.position.y = -ry * 0.26;
  lower.rotation.y = 0.25;
  lower.userData.color = PALETTE.cliffDark;
  lower.userData.outline = false;
  g.add(lower);

  const capGeo = new THREE.CylinderGeometry(rx * 0.68, rx * 0.84, 0.42, segs, 1, false);
  capGeo.scale(1.0, 1.0, rz / rx);
  const cap = new THREE.Mesh(capGeo);
  cap.position.y = ry * 0.5 + 0.16;
  cap.userData.color = mossCap ? PALETTE.grassDark : PALETTE.cliffLight;
  cap.userData.outline = false;
  g.add(cap);

  parent.add(g);
}

/**
 * Sculpts a smooth-shaded, softly rounded mountain ridge or green foothill peak
 * matching the exact background mountain silhouettes of `docs/refs/ref-target-trees.png`
 * (smooth curved crestlines in misty slate-blue `#788ea0 -> #98aebf` and olive-green `#567c52 -> #709866`,
 * zero low-poly faceted potato octagons and zero artificial white snow cones).
 */
function buildSculptedMountainMassif({
  width = 110,
  height = 42,
  depth = 74,
  seed = 1,
  isOlivePeak = false,
}) {
  const segX = 14;
  const segZ = 8;
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const indices = [];

  const cBase = new THREE.Color(isOlivePeak ? 0x527a4e : 0x6c8294);
  const cMid  = new THREE.Color(isOlivePeak ? 0x648e5c : 0x7e94a6);
  const cTop  = new THREE.Color(isOlivePeak ? 0x76a06a : 0x92a8ba);
  const tmpC  = new THREE.Color();

  const asym = ((seed * 37) % 11 - 5) * 0.04;
  const shoulderSide = seed % 2 === 0 ? 1.0 : -1.0;

  for (let iz = 0; iz <= segZ; iz++) {
    const vz = (iz / segZ) * 2.0 - 1.0;
    for (let ix = 0; ix <= segX; ix++) {
      const vx = (ix / segX) * 2.0 - 1.0;

      // Smooth cosine/Gaussian bell ridge profile so silhouettes curve gracefully like ref-target-trees.png
      const dxMain = (vx - asym) * 1.15;
      const dzMain = vz * 1.20;
      const r2Main = dxMain * dxMain + dzMain * dzMain;
      const mainPeak = r2Main < 1.0 ? Math.pow(Math.cos(Math.sqrt(r2Main) * Math.PI * 0.5), 1.55) : 0.0;

      const dxSh = (vx - shoulderSide * 0.44) * 1.45;
      const dzSh = (vz + 0.10) * 1.35;
      const r2Sh = dxSh * dxSh + dzSh * dzSh;
      const shoulder = r2Sh < 1.0 ? 0.68 * Math.pow(Math.cos(Math.sqrt(r2Sh) * Math.PI * 0.5), 1.6) : 0.0;

      const hFrac = clamp(Math.max(mainPeak, shoulder), 0.0, 1.0);

      const x = vx * width * 0.5;
      const y = hFrac * height;
      const z = vz * depth * 0.5 + Math.sin(vx * 2.0 + seed) * depth * 0.06;
      positions.push(x, y, z);

      tmpC.copy(cBase).lerp(cMid, smoothstep(0.08, 0.58, hFrac)).lerp(cTop, smoothstep(0.52, 0.96, hFrac));
      colors.push(tmpC.r, tmpC.g, tmpC.b);
    }
  }

  const stride = segX + 1;
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * stride + ix;
      const b = a + 1;
      const c = (iz + 1) * stride + ix;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  // Compute smooth vertex normals BEFORE converting to non-indexed so the mountain silhouette is silky-smooth!
  geo.computeVertexNormals();
  return geo.toNonIndexed();
}

/**
 * Builds the Merged Distant Sculpted Mountain Ridge Ring + Clouds + Sculpted Hydro Cliffs & Connected Timber Flume.
 * Total cost: 1 draw call.
 */
function buildSkyAndAlpineHorizonAndHydroStructures(gradientMap, opts = {}) {
  const root = new THREE.Group();
  root.name = 'sky-and-alpine-horizon';

  const envRaw = new THREE.Group();
  envRaw.name = 'alpine-and-hydro-env';

  const addColoredMesh = (parent, geo, colorHex, outline = false, unlit = false) => {
    const m = new THREE.Mesh(geo);
    if (colorHex !== null && colorHex !== undefined) m.userData.color = colorHex;
    m.userData.outline = outline;
    m.userData.unlit = unlit;
    parent.add(m);
    return m;
  };

  if (opts.includeConeMountains !== false) {
    // Smooth-shaded atmospheric olive-green foothill peaks & misty slate-blue distant mountain ridges
    // rising gently behind the outer valley horizon (matching ref-target-trees.png!)
    const peakCount = 20;
    for (let i = 0; i < peakCount; i++) {
      const a = (i / peakCount) * Math.PI * 2 + 0.08;
      const x = Math.cos(a);
      const z = Math.sin(a);
      if (z > 0.86 && Math.abs(x) < 0.25) continue;
      const isOlive = i % 3 === 0;
      const r = isOlive ? 248 + (i % 2) * 14 : 272 + (i % 3) * 18;
      const px = x * r;
      const pz = z * r;
      const groundY = terrainHeightAt(px, pz);
      const h = isOlive ? 34 + ((i * 7) % 12) : 44 + ((i * 11) % 16);
      const w = isOlive ? 105 + ((i * 13) % 24) : 132 + ((i * 17) % 34);
      const d = 76 + ((i * 7) % 22);

      const massifGeo = buildSculptedMountainMassif({
        width: w,
        height: h,
        depth: d,
        seed: i + 101,
        isOlivePeak: isOlive,
      });
      const peak = addColoredMesh(envRaw, massifGeo, null, false);
      peak.userData.flatShading = false;
      // Seat 15m below groundY so the wide massif flanks blend seamlessly into the outer valley ridge
      peak.position.set(px, groundY - 15.0, pz);
      peak.rotation.y = -a + Math.PI * 0.5 + ((i % 3) - 1) * 0.14;
    }
  }

  if (opts.includeHorizonClouds !== false) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.38;
      const r = 255 + (i % 2) * 24;
      const cx = Math.cos(a) * r;
      const cy = 88 + (i % 3) * 9;
      const cz = Math.sin(a) * r;
      for (let j = 0; j < 3; j++) {
        const puff = addColoredMesh(
          envRaw,
          new THREE.IcosahedronGeometry(8 + (j === 1 ? 3.5 : 0), 1),
          0xf8fcff,
          false,
          true
        );
        puff.position.set(cx + (j - 1) * 8.5, cy + (j % 2) * 2.0, cz);
        puff.scale.set(1.4, 0.65, 0.85);
      }
    }
  }

  // Sculpted Stratified Cliff Buttresses framing the Waterfall Canyon & Prominent Upstream Spring Outcrop
  const wf = LANDMARKS.waterfall;
  const sx64 = streamCenterX(-64.0);
  const rockMasses = [
    // West (Left) Canyon Buttress Tier
    { x: wf.x - 3.85, y: 2.3, z: wf.z - 1.2, rx: 2.15, ry: 5.5, rz: 1.95, rotY: 0.22, mossCap: true },
    { x: wf.x - 4.75, y: 1.0, z: wf.z + 0.6, rx: 1.90, ry: 3.5, rz: 1.80, rotY: -0.18, mossCap: true },
    { x: wf.x - 3.30, y: -0.2, z: wf.z + 1.9, rx: 1.45, ry: 1.9, rz: 1.35, rotY: 0.45, mossCap: false },
    { x: wf.x - 2.95, y: 4.1, z: wf.z - 2.4, rx: 1.65, ry: 2.4, rz: 1.50, rotY: 0.12, mossCap: true },
    // East (Right) Canyon Buttress & Flume Weir Support (between waterfall and watermill)
    { x: wf.x + 2.85, y: 2.3, z: wf.z - 1.4, rx: 1.95, ry: 5.3, rz: 1.75, rotY: 0.35, mossCap: true },
    { x: wf.x + 2.35, y: 0.6, z: wf.z + 0.2, rx: 1.45, ry: 2.7, rz: 1.40, rotY: -0.24, mossCap: false },
    // Submerged weir lip stones under the waterfall crest
    { x: wf.x, y: 3.8, z: wf.z - 1.85, rx: 2.1, ry: 2.2, rz: 0.95, rotY: 0.42, mossCap: false },
    // Prominent Upstream Headwaters Spring Hillock & Grotto Outcrop (so stream never starts out of flat grass!)
    { x: sx64,       y: 6.2, z: -66.2, rx: 4.4, ry: 3.6, rz: 3.2, rotY: 0.12, mossCap: true },
    { x: sx64 - 3.4, y: 5.6, z: -64.0, rx: 2.6, ry: 2.6, rz: 2.2, rotY: 0.28, mossCap: true },
    { x: sx64 + 3.4, y: 5.6, z: -64.0, rx: 2.6, ry: 2.6, rz: 2.2, rotY: -0.25, mossCap: true },
    { x: sx64 - 2.2, y: 5.1, z: -61.5, rx: 1.8, ry: 1.7, rz: 1.6, rotY: 0.40, mossCap: false },
    { x: sx64 + 2.2, y: 5.1, z: -61.5, rx: 1.8, ry: 1.7, rz: 1.6, rotY: -0.35, mossCap: false },
    { x: streamCenterX(-50.0) - 2.9, y: 5.1, z: -50.0, rx: 1.5, ry: 1.2, rz: 1.3, rotY: -0.2, mossCap: true },
    { x: streamCenterX(-36.0) + 2.8, y: 5.1, z: -36.0, rx: 1.4, ry: 1.1, rz: 1.2, rotY: 0.25, mossCap: true },
  ];
  for (const rm of rockMasses) {
    addStratifiedRockMass(envRaw, rm);
  }

  // Timber Trestle Headrace Flume carrying water from the Right Weir Intake directly over the Waterwheel Crown
  const millB = BUILDINGS_BY_ID.watermill;
  const flumeGroup = new THREE.Group();
  flumeGroup.position.set(millB.x, 0, millB.z);
  flumeGroup.rotation.y = millB.rotY;

  const flumeX = -millB.w * 0.5 - 0.72;
  const flumeY = 3.88;
  const zIntake = -5.1;
  const zSpout = -0.15;
  const flumeLen = zSpout - zIntake;
  const flumeMidZ = (zIntake + zSpout) * 0.5;

  const intakeBox = addColoredMesh(
    flumeGroup,
    new THREE.BoxGeometry(1.75, 1.45, 1.35),
    PALETTE.stoneDark,
    false
  );
  intakeBox.position.set(flumeX, flumeY - 0.35, zIntake - 0.25);

  const troughBed = addColoredMesh(
    flumeGroup,
    new THREE.BoxGeometry(1.22, 0.16, flumeLen),
    PALETTE.timberDark,
    false
  );
  troughBed.position.set(flumeX, flumeY - 0.12, flumeMidZ);

  for (const side of [-0.54, 0.54]) {
    const wall = addColoredMesh(
      flumeGroup,
      new THREE.BoxGeometry(0.14, 0.42, flumeLen + 0.1),
      PALETTE.timber,
      false
    );
    wall.position.set(flumeX + side, flumeY + 0.06, flumeMidZ);
  }

  for (const tz of [-3.85, -1.75]) {
    const capBeam = addColoredMesh(
      flumeGroup,
      new THREE.BoxGeometry(1.52, 0.20, 0.24),
      PALETTE.timber,
      false
    );
    capBeam.position.set(flumeX, flumeY - 0.28, tz);

    const midTie = addColoredMesh(
      flumeGroup,
      new THREE.BoxGeometry(1.46, 0.16, 0.18),
      PALETTE.timberDark,
      false
    );
    midTie.position.set(flumeX, 1.45, tz);

    for (const sx of [-0.52, 0.52]) {
      const leg = addColoredMesh(
        flumeGroup,
        new THREE.BoxGeometry(0.20, 5.2, 0.20),
        PALETTE.timberDark,
        false
      );
      leg.position.set(flumeX + sx, flumeY - 2.8, tz);

      const brace = addColoredMesh(
        flumeGroup,
        new THREE.BoxGeometry(0.14, 0.85, 0.14),
        PALETTE.timber,
        false
      );
      brace.position.set(flumeX + sx * 0.62, flumeY - 0.62, tz);
      brace.rotation.z = sx > 0 ? 0.58 : -0.58;
    }
  }
  envRaw.add(flumeGroup);

  root.add(
    batchVertexColorGroup(envRaw, {
      gradientMap,
      flatShading: true,
      outlineThickness: 0.018,
      castShadow: true,
      receiveShadow: true,
    })
  );

  return root;
}

function buildCurvedStreamGeometry() {
  const segs = 22;
  const zStart = -64.0;
  const zEnd = LANDMARKS.waterfall.z - 0.75;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = lerp(zStart, zEnd, t);
    const cx = streamCenterX(z);
    const halfW = lerp(1.62, 1.50, smoothstep(0.75, 1.0, t));
    const groundCenter = terrainHeightAt(cx, z);
    const wy = lerp(clamp(groundCenter + 0.26, 4.82, 5.10), 4.96, smoothstep(0.8, 1.0, t));
    positions.push(cx - halfW, wy, z, cx + halfW, wy, z);
    uvs.push(0, t * 6.0, 1, t * 6.0);
    if (i < segs) {
      const b = i * 2;
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo.toNonIndexed();
}

function buildWaterfallCascadeGeometry() {
  const wf = LANDMARKS.waterfall;
  const cols = 6;
  const rows = 14;
  const positions = [];
  const uvs = [];
  const indices = [];

  const xWeir = streamCenterX(wf.z - 0.75);
  const zWeir = wf.z - 0.75;
  const yTop = 4.96;
  const yBot = ZONES.millpond.waterY - 0.04;

  const dirX = Math.sin(0.22);
  const dirZ = Math.cos(0.22);
  const rightX = Math.cos(0.22);
  const rightZ = -Math.sin(0.22);

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const forward = v < 0.18 ? v * 2.8 : 0.50 + Math.pow((v - 0.18) / 0.82, 0.85) * 1.95;
    const dropT = v < 0.12 ? (v / 0.12) * 0.06 : 0.06 + Math.pow((v - 0.12) / 0.88, 1.35) * 0.94;
    const wy = lerp(yTop, yBot, dropT);
    const halfW = lerp(1.52, 2.08, v * v);

    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const lat = (u - 0.5) * 2.0 * halfW;
      const centerBow = (1.0 - (u - 0.5) * (u - 0.5) * 4.0) * 0.28 * Math.sin(v * Math.PI);
      const fwd = forward + centerBow;
      const wx = xWeir + dirX * fwd + rightX * lat;
      const wz = zWeir + dirZ * fwd + rightZ * lat;
      positions.push(wx, wy, wz);
      uvs.push(u, 1.0 - v);
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * stride + c;
      const b = a + 1;
      const d = (r + 1) * stride + c;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo.toNonIndexed();
}

function buildFlumeSpoutChuteGeometry(flumeX) {
  const rows = 8;
  const cols = 3;
  const halfW = 0.42;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const lz = lerp(-0.22, 1.25, v);
    const ly = 3.92 - v * v * 1.55;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const lx = flumeX + (u - 0.5) * 2.0 * halfW;
      positions.push(lx, ly, lz);
      uvs.push(u, 1.0 - v);
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * stride + c;
      const b = a + 1;
      const d = (r + 1) * stride + c;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo.toNonIndexed();
}

function buildAnimatedWaterSurfaces() {
  const group = new THREE.Group();
  group.name = 'water-surfaces';

  const mp = ZONES.millpond;
  const wf = LANDMARKS.waterfall;
  const millB = BUILDINGS_BY_ID.watermill;

  const waterParts = [];
  const addWaterGeo = (geo, matrix, mode = 0) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)
      );
    }
    const count = g.attributes.position.count;
    const modeAttr = new Float32Array(count);
    modeAttr.fill(mode);
    g.setAttribute('aWaterMode', new THREE.BufferAttribute(modeAttr, 1));
    waterParts.push(g);
  };

  // 1. Main Millpond Lake surface at (-62, -1.2, 6) with 64 radial segments for smooth shoreline
  const lakeGeo = new THREE.CircleGeometry(1, 64);
  lakeGeo.rotateX(-Math.PI / 2);
  lakeGeo.scale(mp.rx * 0.97, 1, mp.rz * 0.97);
  lakeGeo.translate(mp.x, mp.waterY, mp.z);
  addWaterGeo(lakeGeo, null, 0);

  // 2. Waterfall Plunge Pool surface
  const plungeGeo = new THREE.CircleGeometry(5.8, 28);
  plungeGeo.rotateX(-Math.PI / 2);
  plungeGeo.translate(wf.x + 0.5, mp.waterY + 0.01, wf.z + 1.6);
  addWaterGeo(plungeGeo, null, 0);

  // 3. Plunge Pool Concentric Foam Disc + Ring
  const foamCoreGeo = new THREE.CircleGeometry(2.6, 20);
  foamCoreGeo.rotateX(-Math.PI / 2);
  foamCoreGeo.translate(wf.x + 0.45, mp.waterY + 0.032, wf.z + 1.45);
  addWaterGeo(foamCoreGeo, null, 1);

  const foamOuterGeo = new THREE.RingGeometry(3.0, 4.1, 22);
  foamOuterGeo.rotateX(-Math.PI / 2);
  foamOuterGeo.translate(wf.x + 0.45, mp.waterY + 0.028, wf.z + 1.45);
  addWaterGeo(foamOuterGeo, null, 1);

  // 4. Waterwheel Tailrace Channel water + organic elliptical splash wake
  const millMat = new THREE.Matrix4()
    .makeRotationY(millB.rotY)
    .setPosition(millB.x, mp.waterY + 0.012, millB.z);

  const tailraceGeo = new THREE.CircleGeometry(1, 20);
  tailraceGeo.rotateX(-Math.PI / 2);
  tailraceGeo.scale(1.65, 1, 4.8);
  tailraceGeo.translate(-millB.w * 0.5 - 1.15, 0, 0.5);
  addWaterGeo(tailraceGeo, millMat, 0);

  const wheelWakeGeo = new THREE.CircleGeometry(1, 18);
  wheelWakeGeo.rotateX(-Math.PI / 2);
  wheelWakeGeo.scale(0.95, 1, 2.35);
  wheelWakeGeo.translate(-millB.w * 0.5 - 0.72, 0.022, 0.25);
  addWaterGeo(wheelWakeGeo, millMat, 1);

  // 5. Flume Trough water strip + Overshot Pouring Water Chute onto the Waterwheel Crown
  const flumeX = -millB.w * 0.5 - 0.72;
  const flumeY = 3.88;
  const flumeMat = new THREE.Matrix4()
    .makeRotationY(millB.rotY)
    .setPosition(millB.x, 0, millB.z);
  const flumeWaterGeo = new THREE.PlaneGeometry(0.94, 4.85);
  flumeWaterGeo.rotateX(-Math.PI / 2);
  flumeWaterGeo.translate(flumeX, flumeY + 0.08, -2.62);
  addWaterGeo(flumeWaterGeo, flumeMat, 2);

  addWaterGeo(buildFlumeSpoutChuteGeometry(flumeX), flumeMat, 2);

  // 6. Curved NW Headwaters Stream surface
  addWaterGeo(buildCurvedStreamGeometry(), null, 0);

  // 7. Smooth Parabolic Waterfall Cascade Ribbon
  addWaterGeo(buildWaterfallCascadeGeometry(), null, 2);

  const mergedWaterGeo = mergeGeometries(waterParts, false);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(PALETTE.waterShallow) },
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
      uFoam: { value: new THREE.Color(PALETTE.waterFoam) },
      uLightTint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: /* glsl */ `
      attribute float aWaterMode;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vWaterMode;
      void main() {
        vWaterMode = aWaterMode;
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      uniform vec3 uLightTint;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vWaterMode;

      void main() {
        if (vWaterMode > 1.5) {
          float flow = fract(vUv.y * 2.8 + uTime * 1.8);
          float streak = sin(vUv.x * 22.0 + sin(vUv.y * 8.0) * 0.6) * 0.5 + 0.5;
          float edgeFoam = smoothstep(0.18, 0.02, vUv.x) + smoothstep(0.82, 0.98, vUv.x);
          float crestAndBaseFoam = smoothstep(0.26, 0.0, vUv.y) + smoothstep(0.76, 1.0, vUv.y);
          float foamMask = smoothstep(0.38, 0.82, streak * flow) + crestAndBaseFoam + edgeFoam * 0.55;
          vec3 base = mix(uDeep, uShallow, smoothstep(0.25, 0.75, streak));
          vec3 col = mix(base, uFoam, clamp(foamMask, 0.0, 1.0)) * uLightTint;
          gl_FragColor = vec4(col, 0.96);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }

        vec2 p = vWorldPos.xz;
        vec2 pondRel = (p - vec2(-62.0, 6.0)) / vec2(27.1, 34.9);
        float rPond = length(pondRel);

        // Rich cerulean-to-turquoise depth gradient
        float depthT = 1.0 - smoothstep(0.08, 0.92, rPond);
        vec3 col = mix(uShallow, uDeep, depthT * 0.86);

        // Organic wind-ripple streaks
        float warp = sin(p.x * 0.14 + p.y * 0.11 + uTime * 0.5) * 2.2;
        float rippleWave = sin(p.y * 0.65 + warp - uTime * 1.2)
          * cos(p.x * 0.22 - p.y * 0.18 + uTime * 0.7);
        float shimmer = smoothstep(0.74, 0.88, rippleWave);
        col = mix(col, mix(uShallow, uFoam, 0.58), shimmer * 0.34);

        // Shoreline contour foam band + concentric plunge-pool ripples
        float shoreEdgeFoam = smoothstep(0.86, 0.96, rPond) * (1.0 - smoothstep(0.97, 1.01, rPond))
                            * (0.65 + 0.35 * sin(rPond * 28.0 - uTime * 2.5));
        float dPlunge = length(p - vec2(-50.8, -19.2));
        float plungeRip = smoothstep(0.58, 0.82, sin(dPlunge * 2.4 - uTime * 3.4)) * smoothstep(6.2, 1.2, dPlunge);

        float foamMask = clamp(vWaterMode * 0.88 + shoreEdgeFoam * 0.62 + plungeRip * 0.72, 0.0, 1.0);
        col = mix(col, uFoam, foamMask) * uLightTint;

        // Feather shoreline alpha smoothly into wet sand so no polygonal CircleGeometry edges appear
        float isStream = step(1.5, vWorldPos.y);
        float shoreAlpha = isStream > 0.5 ? 0.95 : smoothstep(1.01, 0.86, min(rPond, dPlunge / 6.0));
        gl_FragColor = vec4(col, clamp(mix(shoreAlpha * 0.92, 0.98, foamMask), 0.0, 0.98));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const waterMesh = new THREE.Mesh(mergedWaterGeo, waterMat);
  waterMesh.name = 'merged-water-and-waterfall';
  group.add(waterMesh);

  return {
    group,
    waterMat,
    update(_dt, elapsed) {
      waterMat.uniforms.uTime.value = elapsed;
    },
  };
}

export function buildTerrainAndWater(renderer, opts = {}) {
  const root = new THREE.Group();
  root.name = 'terrain-and-water';

  const gradientMap = makeToonGradient();
  const worldMaskTex = opts.worldMaskTex || createWorldMaskTexture(512);
  const terrainMat = createGouacheTerrainMaterial(worldMaskTex);

  const { group: terrainGroup, chunks, skirtMesh } = buildChunkedTerrainAndSkirt(terrainMat);
  root.add(terrainGroup);

  const horizonAndHydro = buildSkyAndAlpineHorizonAndHydroStructures(gradientMap, opts);
  root.add(horizonAndHydro);

  const waterSys = buildAnimatedWaterSurfaces();
  root.add(waterSys.group);

  return {
    group: root,
    terrainGroup,
    chunks,
    skirtMesh,
    terrainMat,
    waterMat: waterSys.waterMat,
    horizonGroup: horizonAndHydro,
    worldMaskTex,
    maskBuildMs: worldMaskTex.userData.buildTimeMs || 0,
    update(dt, elapsed) {
      waterSys.update(dt, elapsed);
    },
  };
}
