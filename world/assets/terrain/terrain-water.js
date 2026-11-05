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
 * & Dappled Tree Shadows, Sculpted Multi-Ridge Mountain Horizon, and Wave 1C Hydrological System
 * (`world/assets/terrain/terrain-water.js`).
 */

export const PALETTE = {
  ink: 0x3b2a1e,
  stucco: 0xefe2c6,
  stuccoWarm: 0xe8d9ba,
  timber: 0x966234,
  timberDark: 0x744824,
  timberLight: 0xb8824e,
  stone: 0xd0cabd,
  stoneWarm: 0xddd6c8,
  stoneDark: 0x9e988a,
  limestoneLight: 0xdad2c0,
  limestoneMid: 0xb0a89a,
  limestoneShadow: 0x746e66,
  boulderMoss: 0x56943c,
  roofRed: 0xc24928,
  doorWood: 0x744420,
  windowBlue: 0x2f6fc4,
  glassTint: 0x7cc5eb,
  lanternGlow: 0xffd27d,
  emberGlow: 0xff5a1f,
  grassMid: 0x5c9c44,
  grassLight: 0x82be52,
  grassDark: 0x3b7236,
  grassSunSweep: 0xa6d45c,
  treeShadowCol: 0x244e32,
  dirtRoad: 0xc8a878,
  dirtEdge: 0xa8885c,
  cobble: 0xc0bab0,
  sandBank: 0xd6c092,
  arenaEarth: 0xcfb88e,
  shrineStone: 0xdcd6c4,
  shrineAccent: 0x688ca4,
  shrineGold: 0xdcb454,
  cliffRock: 0x84827a,
  cliffDark: 0x626058,
  cliffLight: 0x9e9a8e,
  waterShallow: 0x2f9cb0,
  waterDeep: 0x135a78,
  waterFoam: 0xeffbff,
  wisteriaViolet: 0xb580ea,
  wisteriaDeep: 0x8b56c8,
  wisteriaPink: 0xe8a4d8,
  sakuraPink: 0xf7b0c6,
  sakuraDeep: 0xd87ca0,
  leafGreen: 0x589c44,
  leafLight: 0x7ec258,
  leafDark: 0x3d7430,
  trunk: 0x825034,
};

export const MAX_TREE_SHADOWS = 72;

export function bakeWorldDataTextures(size = 512) {
  const worldMaskTex = createWorldMaskTexture(size);
  return {
    worldMaskTex,
    worldExtent: INNER_EXTENT,
    buildTimeMs: worldMaskTex.userData.buildTimeMs || 0,
  };
}

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
  const steps = [0.32, 0.56, 0.80, 1.0];
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
    shadowUniforms = null,
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
  });

  const outGroup = new THREE.Group();
  outGroup.name = `${group.name || 'group'}-batched`;

  if (mergedGeos.length > 0) {
    const merged = mergeGeometries(mergedGeos, false);
    const toonMat = new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap,
    });
    toonMat.customProgramCacheKey = () =>
      shadowUniforms ? 'batch-toon-shadowed-v2' : 'batch-toon-plain-v2';
    // Inject zero-draw-call World-Space Cel-Gouache Surface Grain + Character & Tree Canopy Shadows
    toonMat.onBeforeCompile = (shader) => {
      if (shadowUniforms) {
        shader.uniforms.uBatchSunDir = shadowUniforms.uSunDir;
        shader.uniforms.uBatchTreeShadows = shadowUniforms.uTreeShadows;
        shader.uniforms.uBatchTreeCount = shadowUniforms.uTreeCount;
        shader.uniforms.uBatchCharShadows = shadowUniforms.uCharShadows;
      }
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vBatchWorldPos;
          varying vec3 vBatchWorldNormal;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 bwPos = modelMatrix * vec4(position, 1.0);
          vBatchWorldPos = bwPos.xyz;
          vBatchWorldNormal = normalize(mat3(modelMatrix) * normal);`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vBatchWorldPos;
          varying vec3 vBatchWorldNormal;
          ${
            shadowUniforms
              ? `uniform vec3 uBatchSunDir;
          uniform vec4 uBatchTreeShadows[72];
          uniform int uBatchTreeCount;
          uniform vec4 uBatchCharShadows[8];`
              : ''
          }
          float batchHash(vec2 p) {
            p = fract(p * vec2(127.1, 311.7));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }
          float batchNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(batchHash(i), batchHash(i + vec2(1.0, 0.0)), u.x),
              mix(batchHash(i + vec2(0.0, 1.0)), batchHash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec3 wp = vBatchWorldPos;
            vec3 wn = normalize(vBatchWorldNormal);
            float rOrigin = length(wp.xz);
            // Exclude distant mountain horizon (> 135m) and Sacred Inscription Stele cores so they stay clean!
            float dStele1 = length(wp.xz - vec2(0.0, -14.0));
            float dStele2 = length(wp.xz - vec2(-42.0, 18.0));
            float dStele3 = length(wp.xz - vec2(44.0, 16.0));
            float inDetailZone = (1.0 - smoothstep(130.0, 142.0, rOrigin))
                               * smoothstep(1.1, 1.6, min(dStele1, min(dStele2, dStele3)));

            if (inDetailZone > 0.01) {
              float isRedCarpet = step(diffuseColor.g * 2.1, diffuseColor.r);
              float isWood = clamp((diffuseColor.r - diffuseColor.b) * 3.4 - 0.18, 0.0, 1.0) * (1.0 - isRedCarpet);
              float isStone = (1.0 - isWood) * (1.0 - isRedCarpet);

              if (isWood > 0.25) {
                // Subtle longitudinal wood-plank fiber grain on fences, well posts & pier planks
                float fiber = sin((wp.x + wp.z) * 2.4 + sin(wp.y * 18.0) * 0.6) * 0.5 + 0.5;
                float woodGrain = mix(0.92, 1.06, smoothstep(0.25, 0.75, fiber));
                float topSunBevel = smoothstep(0.68, 0.92, wn.y) * 0.06;
                diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * woodGrain + vec3(topSunBevel), inDetailZone);
              } else if (isStone > 0.25) {
                // Clean ashlar masonry courses, subtle limestone grain, sunlit top bevels & ground moss
                vec2 blockUV = vec2((wp.x + wp.z) * 1.35, wp.y * 2.6);
                vec2 row = floor(blockUV);
                blockUV.x += mod(row.y, 2.0) * 0.48;
                vec2 f = abs(fract(blockUV) - 0.5);
                float blockHash = batchHash(floor(blockUV));
                float nRock = batchNoise(wp.xz * 2.2 + wp.y * 1.8);
                // Only apply block mortar on vertical wall/curb faces (abs(wn.y) < 0.65), keeping stair treads clean
                float isVertWall = 1.0 - smoothstep(0.45, 0.72, abs(wn.y));
                float mortar = smoothstep(0.43, 0.48, max(f.x, f.y)) * isVertWall;
                vec3 blockTint = mix(vec3(0.95, 0.96, 0.97), vec3(1.04, 1.03, 1.00), blockHash);
                vec3 stoneCol = diffuseColor.rgb * mix(vec3(1.0), blockTint, isVertWall) * mix(0.95, 1.04, nRock);
                stoneCol = mix(stoneCol, stoneCol * vec3(0.74, 0.76, 0.82), mortar * 0.45);
                // Crisp sunlit top bevel on stone coping, stair treads & wall caps
                float topBevel = smoothstep(0.72, 0.95, wn.y);
                stoneCol *= 1.0 + topBevel * 0.07;
                // Soft Ghibli emerald moss creeping onto low stone walls & boulders (abs(wp.x) > 7.2 spares staircase)
                float allowMoss = smoothstep(7.2, 9.0, abs(wp.x)) * (1.0 - smoothstep(0.38, 0.95, wp.y));
                float mossPatch = smoothstep(0.54, 0.76, batchNoise(wp.xz * 1.8) * 0.65 + wn.y * 0.35) * allowMoss;
                stoneCol = mix(stoneCol, vec3(0.18, 0.44, 0.14), mossPatch * 0.48);
                diffuseColor.rgb = mix(diffuseColor.rgb, stoneCol, inDetailZone);
              }
              ${
                shadowUniforms
                  ? `// Cast crisp Hero/Enemy 2-lobe shadows & dappled Tree Canopy shadows onto Wooden Pier planks, Staircase, Walls & Boulders!
              vec2 shdDir = normalize(vec2(-uBatchSunDir.x, abs(uBatchSunDir.z) * 0.52 + 0.24) + vec2(1e-5, 0.0));
              vec2 perpDir = vec2(-shdDir.y, shdDir.x);
              float batchShd = 0.0;
              float upFace = smoothstep(-0.15, 0.55, wn.y);
              if (upFace > 0.01 && wp.y < 9.5) {
                for (int c = 0; c < 8; c++) {
                  vec4 ch = uBatchCharShadows[c];
                  if (ch.w < 0.02) continue;
                  vec2 relC = wp.xz - ch.xy;
                  float rC = ch.z;
                  if (abs(relC.x) > rC * 3.4 || abs(relC.y) > rC * 3.4) continue;
                  float alongC = dot(relC, shdDir);
                  float acrossC = abs(dot(relC, perpDir));
                  float bootOval = length(vec2((alongC - rC * 0.12) / (rC * 0.54), acrossC / (rC * 0.52)));
                  float bootShd = 1.0 - smoothstep(0.82, 1.00, bootOval);
                  float bodyAlong = (alongC - rC * 1.02) / (rC * 1.18);
                  float bodyWidth = rC * mix(0.60, 0.36, clamp(alongC / (rC * 2.15), 0.0, 1.0));
                  float bodyOval = length(vec2(bodyAlong, acrossC / bodyWidth));
                  float bodyShd = (1.0 - smoothstep(0.84, 1.00, bodyOval)) * step(-0.12 * rC, alongC);
                  batchShd = max(batchShd, max(bootShd * 0.96, bodyShd * 0.92) * clamp(ch.w, 0.0, 1.0));
                }
                for (int t = 0; t < 72; t++) {
                  if (t >= uBatchTreeCount) break;
                  vec4 tr = uBatchTreeShadows[t];
                  if (wp.y > tr.y + tr.w * 0.95) continue;
                  vec2 relT = wp.xz - tr.xz;
                  float rCan = tr.w;
                  if (abs(relT.x) > rCan * 4.2 || abs(relT.y) > rCan * 4.2) continue;
                  vec2 dPool = relT - shdDir * (rCan * 1.65);
                  float pDist = length(vec2(dot(dPool, shdDir) / (rCan * 2.25), dot(dPool, perpDir) / (rCan * 1.38)));
                  float cShd = (1.0 - smoothstep(0.78, 1.02, pDist)) * 0.85;
                  batchShd = max(batchShd, cShd);
                }
                diffuseColor.rgb *= mix(vec3(1.0), vec3(0.22, 0.24, 0.36), batchShd * upFace);
              }`
                  : ''
              }
            }
          }`
        );
    };
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
 * Builds the Gouache Terrain ShaderMaterial driven by the fast 512x512 `uWorldMask` DataTexture,\n * covering `uInnerSpan = 340.0m` (`[-170..+170]m`), with painterly spring-meadow brushstrokes,
 * wildflower hillside stippling, and directional shadows cast by all 68 trees, 5 Tudor buildings,
 * the Well, the Shrine Archway, the Arena Fence, and all Heroes & Enemies (`uCharShadows`).
 */
function createGouacheTerrainMaterial(worldMaskTex) {
  const { treeShadowVecs, treeCount } = buildTreeShadowUniformArray();
  const { posArr: bldgPos, rotArr: bldgRotH } = buildBuildingShadowUniforms();
  const charShadows = [];
  for (let i = 0; i < 8; i++) {
    charShadows.push(new THREE.Vector4(9999.0, 9999.0, 0.72, 0.0));
  }
  return new THREE.ShaderMaterial({
    uniforms: {
      uWorldMask: { value: worldMaskTex },
      uInnerSpan: { value: INNER_EXTENT * 2.0 }, // 340.0m (-170..+170)
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
      uCharShadows: { value: charShadows },
      uDirt: { value: new THREE.Color(0xdfa864) },
      uDirtEdge: { value: new THREE.Color(0xb88448) },
      uCobble: { value: new THREE.Color(PALETTE.cobble) },
      uSand: { value: new THREE.Color(PALETTE.sandBank) },
      uArena: { value: new THREE.Color(PALETTE.arenaEarth) },
      uShrine: { value: new THREE.Color(PALETTE.shrineStone) },
      uLakeBed: { value: new THREE.Color(0x28788c) },
      uMountainRock: { value: new THREE.Color(0x52745c) },
      uMountainCrest: { value: new THREE.Color(0x6e8c96) },
      uFogColor: { value: new THREE.Color(0xd8eef8) },
      uFogNear: { value: 185.0 },
      uFogFar: { value: 580.0 },
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
      uniform vec4 uTreeShadows[72];
      uniform int uTreeCount;
      uniform vec4 uBldgPos[5];
      uniform vec4 uBldgRotH[5];
      uniform vec4 uCharShadows[8];
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

      // Anime sun-projected ground shadow direction (casts to the right + slightly forward from upper-left sun)
      vec2 getAnimeShadowDir(vec3 sunDir) {
        return normalize(vec2(-sunDir.x, abs(sunDir.z) * 0.52 + 0.24) + vec2(1e-5, 0.0));
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
        vec3 warmVar = mix(vec3(0.94, 0.92, 0.89), vec3(1.05, 1.02, 0.97), h);
        vec3 stoneTint = baseCol * warmVar;
        vec3 mortarCol = baseCol * vec3(0.68, 0.68, 0.74);
        return mix(stoneTint, mortarCol, mortar * 0.68);
      }

      // Organic compacted-earth & worn flagstone plates + 3D-lit rounded river pebbles for the Country Dirt Path!
      vec3 evalCountryDirtPathAndPebbles(vec2 xz, vec3 baseEarth, float dirtW, vec2 shadowDir) {
        // 1. Broad compacted golden-ochre earth plates (never a brick grid!)
        float nPlate = vnoise(xz * 0.85 + vec2(2.3, -1.7)) * 0.60 + vnoise(xz * 2.15 - vec2(1.4, 3.2)) * 0.40;
        float plateStep = smoothstep(0.34, 0.44, nPlate) * 0.55 + smoothstep(0.62, 0.72, nPlate) * 0.45;
        vec3 earthCol = baseEarth * mix(vec3(0.92, 0.89, 0.84), vec3(1.06, 1.03, 0.98), plateStep);

        // Subtle footpath wear along the center of the road
        float centerWear = smoothstep(0.55, 0.95, dirtW);
        earthCol = mix(earthCol, baseEarth * vec3(1.05, 1.02, 0.96), centerWear * 0.32);

        // 2. 3D-shaded rounded roadside river pebbles scattered along the path edges (borderBand)
        float edgeBand = smoothstep(0.08, 0.48, dirtW) * (1.0 - smoothstep(0.52, 0.88, dirtW));
        if (edgeBand > 0.01) {
          vec2 pebGrid = xz * 2.8;
          vec2 pebCell = floor(pebGrid);
          float hPeb = hash21(pebCell);
          // Spawn rounded pebbles in ~24% of roadside cells
          if (hPeb > 0.76) {
            vec2 pebCenter = vec2(fract(hPeb * 13.7), fract(hPeb * 29.3)) * 0.52 - 0.26;
            vec2 relP = (fract(pebGrid) - 0.5) - pebCenter;
            float rPeb = 0.14 + fract(hPeb * 43.1) * 0.09;
            // Pebble drop shadow offset along shadowDir
            float dShd = length((relP - shadowDir * (rPeb * 0.48)) / vec2(rPeb * 1.15, rPeb * 0.95));
            float pebDropShd = (1.0 - smoothstep(0.65, 1.05, dShd)) * edgeBand;
            earthCol *= mix(1.0, 0.56, pebDropShd * 0.85);

            // 3D rounded pebble body with top-left sun highlight & cool lower rim
            float dBody = length(relP / vec2(rPeb * 1.12, rPeb * 0.92));
            float inPeb = (1.0 - smoothstep(0.78, 1.0, dBody)) * edgeBand;
            if (inPeb > 0.01) {
              float domeLit = clamp(dot(normalize(relP), -shadowDir) * 0.55 + 0.55, 0.0, 1.0);
              float pebCel = smoothstep(0.32, 0.68, domeLit);
              vec3 pebShdCol = vec3(0.52, 0.50, 0.54);
              vec3 pebSunCol = mix(vec3(0.82, 0.78, 0.72), vec3(0.92, 0.89, 0.84), fract(hPeb * 7.3));
              vec3 pebCol = mix(pebShdCol, pebSunCol, pebCel);
              earthCol = mix(earthCol, pebCol, inPeb);
            }
          }
        }
        return earthCol;
      }

      vec2 evalTreeGroundShadowAndFlecks(vec2 xz, vec3 sunDir) {
        vec2 shadowDir = getAnimeShadowDir(sunDir);
        vec2 perpDir = vec2(-shadowDir.y, shadowDir.x);

        float edgeRuffle = (vnoise(xz * 1.45) - 0.5) * 0.22;
        float leafCluster = vnoise(xz * 1.25 + vec2(3.7, -2.1)) * 0.58
                          + vnoise(xz * 2.65 - vec2(1.4, 4.3)) * 0.42;
        // Crisp anime cel-stepped leaf shadow vs sunlit canopy gap (fleck)
        float celLeafShd = smoothstep(0.28, 0.36, leafCluster);
        float celLeafFleck = 1.0 - smoothstep(0.26, 0.34, leafCluster);

        float maxShd = 0.0;
        float maxFleck = 0.0;

        for (int i = 0; i < 72; i++) {
          if (i >= uTreeCount) break;
          vec4 tr = uTreeShadows[i];
          vec2 rel = xz - tr.xz;
          float rCan = tr.w;
          if (abs(rel.x) > rCan * 4.5 || abs(rel.y) > rCan * 4.5) continue;

          float along = dot(rel, shadowDir);
          float across = abs(dot(rel, perpDir));

          // 1. Crisp directional trunk shadow stripe
          float trunkW = rCan * 0.12;
          float inTrunkLen = smoothstep(-0.15, 0.08, along) * (1.0 - smoothstep(rCan * 1.55, rCan * 1.85, along));
          float trunkShd = inTrunkLen * (1.0 - smoothstep(trunkW * 0.72, trunkW * 1.10, across));

          // 2. Elongated anime canopy shadow reaching from upper-left sun across the left/center of roads
          vec2 poolCenter = shadowDir * (rCan * 1.75);
          vec2 dPool = rel - poolCenter;
          float pAlong = dot(dPool, shadowDir) / (rCan * 2.35);
          float pAcross = dot(dPool, perpDir) / (rCan * 1.42);
          float poolDist = length(vec2(pAlong, pAcross)) + edgeRuffle * 0.16;

          float canopyEnvelope = 1.0 - smoothstep(0.76, 0.90, poolDist);
          float canopyShd = canopyEnvelope * mix(0.24, 1.0, celLeafShd);
          float canopyFleck = canopyEnvelope * smoothstep(0.05, 0.65, 1.0 - poolDist) * celLeafFleck;

          float underDist = length(rel) / (rCan * 1.05) + edgeRuffle * 0.12;
          float underEnvelope = 1.0 - smoothstep(0.72, 0.90, underDist);
          float underShd = underEnvelope * mix(0.35, 0.98, celLeafShd);

          maxShd = max(maxShd, max(trunkShd * 0.96, max(canopyShd, underShd)));
          maxFleck = max(maxFleck, canopyFleck * (1.0 - trunkShd));
        }

        // 3. Directional Left-Canopy lacy shadow sweep across the left/center of the Country Road
        //    (matching Sunlit Wisteria Village Path.png: rich dappled shadow on left/center of path, warm golden sun on right!)
        float rCenter = length(xz);
        float inValleyFloor = 1.0 - smoothstep(145.0, 164.0, rCenter);
        if (inValleyFloor > 0.01) {
          vec2 projXZ = xz - shadowDir * 2.4;
          float macroN = vnoise(projXZ * 0.24 + vec2(1.4, -2.1)) * 0.6
                       + vnoise(projXZ * 0.55 - vec2(2.8, 1.7)) * 0.4;
          float dappleN = vnoise(projXZ * 1.05 + vec2(1.9, -3.4)) * 0.55
                        + vnoise(projXZ * 2.35 + vec2(-4.1, 2.3)) * 0.45;
          // On the Southern Country Road (z > 22), cast the lacy canopy shadow from the left trees (x < 0.8m)
          // so the right side of the golden dirt road glows in open sunlight!
          float leftCanopyBias = xz.y > 22.0 ? smoothstep(1.35, -1.65, xz.x) : 0.72;
          float bandMask = smoothstep(0.24, 0.54, macroN) * inValleyFloor * leftCanopyBias;
          float aveCelShd = bandMask * smoothstep(0.34, 0.42, dappleN) * 0.88;
          float aveCelFleck = bandMask * (1.0 - smoothstep(0.31, 0.39, dappleN)) * smoothstep(0.32, 0.66, macroN);
          maxShd = max(maxShd, aveCelShd);
          maxFleck = max(maxFleck, aveCelFleck);
        }

        return vec2(clamp(maxShd, 0.0, 1.0), clamp(maxFleck, 0.0, 1.0));
      }

      /**
       * Analytical warm golden-amber candlelight & lantern ground pools for Dusk & Night.
       */
      float evalNightLanternPools(vec2 xz) {
        float glow = 0.0;
        // 5 Tudor Cottage warm window & porch lantern ground pools
        for (int i = 0; i < 5; i++) {
          vec2 bxy = uBldgPos[i].xy;
          float d = length(xz - bxy);
          glow += exp(-d * d * 0.012) * 0.85;
        }
        // Central Plaza Well & Sacred Stone lantern pool
        glow += exp(-dot(xz, xz) * 0.018) * 0.55;
        vec2 dStele1 = xz - vec2(0.0, -14.0);
        glow += exp(-dot(dStele1, dStele1) * 0.035) * 0.65;
        // Lakeside Pier lantern & Sacred Stone at (-42, 18) and (-48, 8.5)
        vec2 dPier1 = xz - vec2(-42.0, 18.0);
        vec2 dPier2 = xz - vec2(-48.5, 8.5);
        glow += exp(-dot(dPier1, dPier1) * 0.03) * 0.70;
        glow += exp(-dot(dPier2, dPier2) * 0.04) * 0.75;
        // North Shrine Staircase & Overlook Stone Lanterns (Base, Mid-Landing & Summit)
        if (xz.y < -15.0 && abs(xz.x) < 18.0) {
          vec2 dBot1 = xz - vec2(-6.95, -18.0);
          vec2 dBot2 = xz - vec2( 6.95, -18.0);
          vec2 dMid1 = xz - vec2(-6.85, -44.75);
          vec2 dMid2 = xz - vec2( 6.85, -44.75);
          vec2 dShrine1 = xz - vec2(-6.15, -71.5);
          vec2 dShrine2 = xz - vec2( 6.15, -71.5);
          vec2 dShrine3 = xz - vec2( 0.0, -84.0);
          glow += (exp(-dot(dBot1, dBot1) * 0.05) + exp(-dot(dBot2, dBot2) * 0.05)) * 0.75;
          glow += (exp(-dot(dMid1, dMid1) * 0.04) + exp(-dot(dMid2, dMid2) * 0.04)) * 0.85;
          glow += (exp(-dot(dShrine1, dShrine1) * 0.05) + exp(-dot(dShrine2, dShrine2) * 0.05)) * 0.85;
          glow += exp(-dot(dShrine3, dShrine3) * 0.02) * 0.65;
        }
        return clamp(glow, 0.0, 1.25);
      }

      /**
       * Directional Cel-Shaded Shadows cast by the 5 Tudor Houses, Central Well,
       * Romanesque Shrine Archway, Altar Pedestal, Arena Fence, AND all Heroes & Enemies!
       */
      float evalArchitectureShadow(vec2 xz, vec3 sunDir) {
        vec2 shadowDir = getAnimeShadowDir(sunDir);
        vec2 perpDir = vec2(-shadowDir.y, shadowDir.x);
        float shd = 0.0;

        // 1. 5 Tudor Buildings directional roof/wall shadow projection (crisp cel-stepped silhouette)
        if (xz.x > -62.0 && xz.x < 36.0 && xz.y > -34.0 && xz.y < 34.0) {
          for (int i = 0; i < 5; i++) {
            vec4 bp = uBldgPos[i];
            vec4 br = uBldgRotH[i];
            float reach = br.z * 1.05;
            vec2 center = bp.xy + shadowDir * (reach * 0.56);
            vec2 rel = xz - center;
            if (abs(rel.x) > 14.0 || abs(rel.y) > 14.0) continue;
            float lx = rel.x * br.x - rel.y * br.y;
            float lz = rel.x * br.y + rel.y * br.x;
            vec2 sLocal = vec2(
              shadowDir.x * br.x - shadowDir.y * br.y,
              shadowDir.x * br.y + shadowDir.y * br.x
            );
            float ex = bp.z + abs(sLocal.x) * reach * 0.56;
            float ez = bp.w + abs(sLocal.y) * reach * 0.56;
            vec2 dBox = abs(vec2(lx, lz)) - vec2(ex, ez);
            float boxDist = length(max(dBox, 0.0)) + min(max(dBox.x, dBox.y), 0.0);
            shd = max(shd, (1.0 - smoothstep(-0.06, 0.22, boxDist)) * 0.94);
          }
        }

        // 2. Central Roofed Well shadow at (0, 0) + Sacred Stone at (0, -14)
        if (abs(xz.x) < 8.5 && abs(xz.y) < 18.5) {
          vec2 wCenter = shadowDir * 1.65;
          float dWell = length((xz - wCenter) / vec2(1.85, 2.05));
          shd = max(shd, (1.0 - smoothstep(0.80, 0.98, dWell)) * 0.90);

          vec2 steleCenter = vec2(0.0, -14.0) + shadowDir * 0.95;
          float dStele = length((xz - steleCenter) / vec2(0.95, 0.85));
          shd = max(shd, (1.0 - smoothstep(0.78, 0.98, dStele)) * 0.88);
        }

        // 3. Northern Shrine Archway, Altar Pedestal & Planters around (0, -90)
        if (xz.y < -69.0 && abs(xz.x) < 16.5) {
          for (int s = -1; s <= 1; s += 2) {
            vec2 pierBase = vec2(float(s) * 3.1, -93.5);
            vec2 relP = xz - pierBase;
            float pAlong = dot(relP, shadowDir);
            float pAcross = abs(dot(relP, perpDir));
            float inPier = smoothstep(-0.6, 0.1, pAlong) * (1.0 - smoothstep(4.8, 5.8, pAlong))
                         * (1.0 - smoothstep(0.68, 1.05, pAcross));
            shd = max(shd, inPier * 0.90);
          }
          vec2 archShadowCenter = vec2(0.0, -93.5) + shadowDir * 5.2;
          float dArchCrown = length((xz - archShadowCenter) / vec2(3.6, 1.35));
          shd = max(shd, (1.0 - smoothstep(0.72, 1.05, dArchCrown)) * 0.88);

          vec2 pedCenter = vec2(-5.8, -87.8) + shadowDir * 0.95;
          float dPed = length((xz - pedCenter) / vec2(1.25, 1.45));
          shd = max(shd, (1.0 - smoothstep(0.70, 1.05, dPed)) * 0.85);
        }

        // 4. East Arena Split-Rail Fence ring shadow at (68, -4, r = 19.5)
        if (xz.x > 46.0 && xz.x < 90.0 && xz.y > -26.0 && xz.y < 18.0) {
          vec2 arenaRel = xz - (vec2(68.0, -4.0) + shadowDir * 0.65);
          float dFence = abs(length(arenaRel) - 19.5);
          if (arenaRel.x > -18.2) {
            shd = max(shd, (1.0 - smoothstep(0.18, 0.58, dFence)) * 0.76);
          }
        }

        // 5. Hero Duo (Knight + Mage) & All 6 Pooled Enemies (Skeletons + Boss Sovereign)
        //    Crisp 2-Lobe Anime Cel-Shaded Directional Figure Silhouette!
        for (int c = 0; c < 8; c++) {
          vec4 ch = uCharShadows[c];
          if (ch.w < 0.02) continue;
          float wWeight = clamp(ch.w, 0.0, 1.0);
          vec2 rel = xz - ch.xy;
          float r = ch.z;
          if (abs(rel.x) > r * 3.4 || abs(rel.y) > r * 3.4) continue;
          float along = dot(rel, shadowDir);
          float across = abs(dot(rel, perpDir));
          // Tight boot contact core directly under feet
          float bootOval = length(vec2((along - r * 0.12) / (r * 0.54), across / (r * 0.52)));
          float bootShd = 1.0 - smoothstep(0.82, 1.00, bootOval);
          // Stretched directional body/cape/hat silhouette along shadowDir (matching Sunlit Wisteria Village Path.png!)
          float bodyAlong = (along - r * 1.02) / (r * 1.18);
          float bodyWidth = r * mix(0.60, 0.36, clamp(along / (r * 2.15), 0.0, 1.0));
          float bodyOval = length(vec2(bodyAlong, across / bodyWidth));
          float bodyShd = (1.0 - smoothstep(0.84, 1.00, bodyOval)) * step(-0.10 * r, along);
          shd = max(shd, max(bootShd * 0.96, bodyShd * 0.92) * wWeight);
        }

        return clamp(shd, 0.0, 1.0);
      }

      void main() {
        vec2 xz = vWorldPos.xz;
        float h = vWorldPos.y;
        vec2 shadowDir = getAnimeShadowDir(uSunDir);

        vec2 maskUv = xz / uInnerSpan + 0.5;
        float inInner = step(abs(xz.x), uInnerSpan * 0.5 - 0.5) * step(abs(xz.y), uInnerSpan * 0.5 - 0.5);
        vec4 mask = texture2D(uWorldMask, clamp(maskUv, 0.001, 0.999));

        // Time-of-day factors derived from uLightTint (Day ~ 1.0, Evening ~ [0.95,0.78,0.70], Night ~ [0.24,0.34,0.56])
        float dayLuma = dot(uLightTint, vec3(0.3333));
        float isNight = 1.0 - smoothstep(0.35, 0.65, dayLuma);
        float isEvening = smoothstep(0.12, 0.24, uLightTint.r - uLightTint.b) * (1.0 - isNight);

        // Distance attenuation for high-frequency ground speckles so distant hillsides stay smooth Ghibli cel-turf!
        float nearDappleFade = 1.0 - smoothstep(28.0, 46.0, vViewDist);
        float treeShadowDistFade = 1.0 - smoothstep(105.0, 150.0, vViewDist);

        // 1. Multi-Scale Cel-Stepped Spring-Meadow Ground Texturing & Slope Chiaroscuro
        float nBroad = vnoise(xz * 0.022 + vec2(1.7, 3.1));
        float nMed   = vnoise(xz * 0.055 + vec2(-2.3, 1.9));
        float nFine  = vnoise(xz * 0.42 + vec2(5.1, -3.8));
        float cloudDapple = smoothstep(0.32, 0.74, vnoise(xz * 0.018 + vec2(4.2, -3.5)));
        float meadowGrad = smoothstep(0.16, 0.84, nBroad * 0.62 + nMed * 0.38);
        vec3 col = mix(uGrassDark, uGrassMid, smoothstep(0.0, 0.52, meadowGrad));
        col = mix(col, uGrassLight, smoothstep(0.42, 0.88, meadowGrad) * (1.0 - cloudDapple * 0.45));
        // Subtle cel-stepped clover/moss ground speckles in near-camera turf only
        float turfCelPatch = smoothstep(0.58, 0.66, nFine * 0.65 + nMed * 0.35) * nearDappleFade;
        col = mix(col, uGrassSunSweep * 0.96, turfCelPatch * 0.22);

        if (inInner > 0.5) {
          // Deep viridian-emerald under-tuft turf cushion where 3D grass tussocks grow (mask.b > 0.65)
          // Applied BEFORE totalShd so tree, building, boulder, wall, and character shadows cut crisply across the turf!
          float meadowTurfW = smoothstep(0.62, 0.88, mask.b) * (1.0 - smoothstep(45.0, 68.0, vViewDist));
          if (meadowTurfW > 0.01) {
            float tuftDapple = vnoise(xz * 1.65) * 0.55 + vnoise(xz * 3.8) * 0.45;
            vec3 viridianUnder = mix(vec3(0.11, 0.34, 0.16), vec3(0.24, 0.56, 0.20), smoothstep(0.28, 0.76, tuftDapple));
            col = mix(col, viridianUnder, meadowTurfW * 0.68);
          }
        }

        // Directional terrain slope shading (sunlit slopes warm, shaded slopes cool emerald-sage)
        float ndl = dot(normalize(vWorldNormal), normalize(uSunDir)) * 0.5 + 0.5;
        float slopeSun = smoothstep(0.50, 0.84, ndl) * (1.0 - cloudDapple * 0.6);
        float slopeShd = 1.0 - smoothstep(0.26, 0.54, ndl);
        col = mix(col, uGrassSunSweep, slopeSun * 0.42);
        col = mix(col, uTreeShadowCol * vec3(0.92, 0.96, 1.08), slopeShd * 0.38 + cloudDapple * 0.22);

        // Combined Directional Anime Cel-Shaded Tree, Wall/Fence, Boulder, House & Character Ground Shadows!
        vec2 treeShdAndFleck = evalTreeGroundShadowAndFlecks(xz, uSunDir);
        float treeShd = treeShdAndFleck.x * treeShadowDistFade;
        float sunFleck = treeShdAndFleck.y * clamp(uSunDir.y * 1.4, 0.0, 1.0) * (1.0 - smoothstep(42.0, 75.0, vViewDist));
        float archShd = inInner > 0.5 ? evalArchitectureShadow(xz, uSunDir) : 0.0;
        // Directional wall, boulder & split-rail fence shadow offset along shadowDir
        float propDirShd = 0.0;
        if (inInner > 0.5) {
          vec2 offMaskUv = (xz - shadowDir * 0.78) / uInnerSpan + 0.5;
          float offMaskA = texture2D(uWorldMask, clamp(offMaskUv, 0.001, 0.999)).a;
          propDirShd = smoothstep(0.14, 0.42, 1.0 - min(mask.a, offMaskA)) * 0.92;
        }
        float totalShd = max(max(treeShd, archShd), propDirShd);

        // Time-aware fleck multiplier: golden-amber in Day, warm coral-gold in Evening, silver-sapphire at Night!
        vec3 fleckTint = mix(
          mix(vec3(1.28, 1.12, 0.82), vec3(1.36, 0.98, 0.68), isEvening),
          vec3(0.92, 1.02, 1.24),
          isNight
        );
        float fleckStrength = mix(0.84, 0.36, isNight);

        vec3 deepShadowCol = uTreeShadowCol * vec3(0.64, 0.78, 1.02);
        col = mix(col, deepShadowCol, totalShd * 0.90);
        col = mix(col, uGrassSunSweep * (fleckTint * 0.88), sunFleck * (1.0 - archShd) * 0.54 * (1.0 - isNight * 0.5));

        if (inInner > 0.5) {

          float cobbleW = mask.r;
          float gVal = mask.g;
          float dirtW = (gVal < 0.502 && !(xz.x < -36.0 && xz.y > -28.0 && xz.y < 44.0))
            ? clamp(gVal * 2.0, 0.0, 1.0)
            : 0.0;

          float dPond = length((xz - vec2(-62.0, 6.0)) / vec2(28.0, 36.0));
          float dPlunge = length(xz - vec2(-51.4, -20.8)) / 14.0;
          float dPierStone = length(xz - vec2(-42.0, 18.0)) / 7.5;
          float nearShore = 1.0 - smoothstep(0.95, 1.18, min(min(dPond, dPlunge), dPierStone));
          float maskSand = gVal > 0.502 ? clamp((gVal - 0.5) * 2.0, 0.0, 1.0) : 0.0;
          float sandW = max(maskSand, nearShore * (1.0 - smoothstep(-0.45, -0.18, h)) * smoothstep(-1.58, -1.16, h));

          if (sandW > 0.01) {
            float peb = (vnoise(xz * 3.8) - 0.5) * 0.08;
            vec3 sandCol = (uSand + peb) * mix(vec3(1.0), vec3(0.54, 0.58, 0.76), totalShd);
            sandCol = mix(sandCol, sandCol * fleckTint, sunFleck * (1.0 - archShd) * fleckStrength * 0.80);
            col = mix(col, sandCol, sandW);
          }

          if (dirtW > 0.01) {
            float dArena = length(xz - vec2(68.0, -4.0));
            float isArena = 1.0 - smoothstep(16.0, 18.0, dArena);
            vec3 earthBase = mix(uDirt, uArena, isArena);
            // Warm compacted golden-ochre earth + organic stone plates + 3D-lit roadside river pebbles!
            vec3 pathInterior = evalCountryDirtPathAndPebbles(xz, earthBase, dirtW, shadowDir);
            float borderBand = dirtW * (1.0 - dirtW) * 3.0;
            vec3 roadCol = mix(pathInterior, uDirtEdge, clamp(borderBand, 0.0, 0.58));
            // Rich warm-umber anime cel shadow on the golden dirt road (matching Sunlit Wisteria Village Path.png!)
            vec3 dirtShdTint = mix(vec3(0.30, 0.23, 0.20), vec3(0.20, 0.15, 0.15), archShd);
            roadCol *= mix(vec3(1.04, 1.00, 0.94), dirtShdTint, totalShd);
            roadCol = mix(roadCol, pathInterior * fleckTint, sunFleck * (1.0 - archShd) * fleckStrength * 0.78);
            // Delicate fallen wisteria/sakura petals resting along the road edges in 3D world space
            float edgePetalMask = smoothstep(0.12, 0.68, borderBand) * smoothstep(0.81, 0.88, vnoise(xz * 4.4 + vec2(1.3, -2.7)));
            roadCol = mix(roadCol, vec3(0.92, 0.66, 0.98), edgePetalMask * 0.76);
            col = mix(col, roadCol, smoothstep(0.02, 0.88, dirtW));
          }

          if (cobbleW > 0.01) {
            float isShrine = (1.0 - smoothstep(-18.0, -14.0, xz.y)) * (1.0 - smoothstep(15.0, 20.0, abs(xz.x)));
            float rOrigin = length(xz);
            float isWellCore = 1.0 - smoothstep(6.0, 7.2, rOrigin);
            vec3 baseStone = mix(uCobble, uShrine, max(isShrine, isWellCore * 0.65));
            vec3 cobbleCol = evalCobblestone(xz, baseStone, isShrine);
            float verge = cobbleW * (1.0 - cobbleW) * 2.8;
            vec3 vergeCol = mix(cobbleCol, uGrassDark * 0.95 + uCobble * 0.2, clamp(verge * (1.0 - dirtW), 0.0, 1.0) * 0.45);
            vec3 cobbleShdTint = mix(vec3(0.34, 0.36, 0.52), vec3(0.24, 0.26, 0.42), archShd);
            vergeCol *= mix(vec3(1.02, 0.99, 0.95), cobbleShdTint, totalShd);
            vergeCol = mix(vergeCol, cobbleCol * fleckTint, sunFleck * (1.0 - archShd) * fleckStrength * 0.75);
            // Fallen blossom petals resting in cobblestone crevices near plaza & road edges
            float cobblePetalMask = smoothstep(0.10, 0.65, verge) * smoothstep(0.82, 0.89, vnoise(xz * 4.2 + vec2(-2.1, 3.4)));
            vergeCol = mix(vergeCol, vec3(0.94, 0.68, 0.98), cobblePetalMask * 0.72);
            col = mix(col, vergeCol, smoothstep(0.03, 0.82, cobbleW));
          }
        }

        float wLake = 1.0 - smoothstep(-1.68, -1.24, h);
        if (wLake > 0.001) {
          col = mix(col, uLakeBed, wLake);
        }

        // Natural green-to-slate-blue atmospheric mountain flank shading beyond r = 166m
        float distOrigin = length(xz);
        if (distOrigin > 166.0) {
          float nMtn = vnoise(xz * 0.025) * 5.0;
          float hMod = h + nMtn;
          float wRock = smoothstep(12.0, 26.0, hMod) * smoothstep(168.0, 235.0, distOrigin);
          if (wRock > 0.001) {
            col = mix(col, uMountainRock, wRock * 0.65);
          }
          float wCrest = smoothstep(26.0, 42.0, hMod) * smoothstep(220.0, 295.0, distOrigin);
          if (wCrest > 0.001) {
            col = mix(col, uMountainCrest, wCrest * 0.72);
          }
        }

        // Crisp 3-Step Anime Cel Ramp
        float toonBand = 0.36 * smoothstep(0.26, 0.33, ndl)
                       + 0.32 * smoothstep(0.48, 0.55, ndl)
                       + 0.32 * smoothstep(0.68, 0.75, ndl);
        float toonShade = mix(0.76, 1.05, toonBand);
        float contactShadow = inInner > 0.5 ? smoothstep(0.10, 0.42, 1.0 - mask.a) : 0.0;
        col = mix(col, deepShadowCol * 0.82, contactShadow * 0.78);

        col *= toonShade * uLightTint;

        // Warm Golden-Amber Candlelight & Lantern Ground Pools at Dusk & Night
        float lanternStage = clamp(isNight + isEvening * 0.55, 0.0, 1.0);
        if (lanternStage > 0.01 && inInner > 0.5) {
          float pool = evalNightLanternPools(xz);
          col += vec3(1.05, 0.68, 0.26) * pool * lanternStage * 0.42;
        }

        // Option 2 + Option 4 Time-Aware Valley & Foothill Mist (Pearlescent Day / Violet-Gold Dusk / Deep Indigo Night)
        vec3 V = normalize(cameraPosition - vWorldPos);
        float sunForward = pow(clamp(dot(-V, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0), 2.6);
        vec3 dayMistBase = mix(uFogColor, vec3(0.84, 0.94, 1.0) * uLightTint, 0.38);
        vec3 nightMistBase = uFogColor * vec3(0.76, 0.84, 1.05);
        vec3 baseMist = mix(dayMistBase, nightMistBase, isNight);
        vec3 warmMieMist = mix(vec3(1.0, 0.95, 0.84) * uLightTint, vec3(1.05, 0.68, 0.48), isEvening * 0.45);
        vec3 mistColor = mix(baseMist, warmMieMist, sunForward * 0.50 * (1.0 - isNight * 0.65));

        float mistBillow = vnoise(xz * 0.035 + vec2(0.7, -1.3)) * 0.35 + 0.65;
        float lakeMist = (1.0 - smoothstep(-1.6, 1.2, h)) * smoothstep(20.0, 85.0, vViewDist) * 0.32;
        float valleyFloorMist = (1.0 - smoothstep(-0.5, 3.8, h)) * smoothstep(34.0, 115.0, vViewDist) * mistBillow * 0.26;
        float foothillMist = (1.0 - smoothstep(0.0, 15.0, h)) * smoothstep(48.0, 165.0, vViewDist) * mistBillow * 0.34;
        float perimeterMist = smoothstep(128.0, 172.0, distOrigin) * (1.0 - smoothstep(12.0, 46.0, h)) * mix(0.64, 0.38, isNight);
        float distFog = smoothstep(320.0, 840.0, vViewDist);
        float totalMist = clamp(distFog + max(max(lakeMist, valleyFloorMist), max(foothillMist, perimeterMist)), 0.0, 0.80);
        col = mix(col, mistColor, totalMist);

        gl_FragColor = vec4(col, 1.0);
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
  const chunkSize = (INNER_EXTENT * 2) / gridCount; // 85m (340m / 4)
  const chunkSegs = 26;
  const chunkGeos = [];

  for (let r = 0; r < gridCount; r++) {
    const cz = -INNER_EXTENT + (r + 0.5) * chunkSize;
    for (let c = 0; c < gridCount; c++) {
      const cx = -INNER_EXTENT + (c + 0.5) * chunkSize;
      const geo = buildChunkWithOuterLip(chunkSize, chunkSegs, cx, cz);
      const nonIdx = geo.index ? geo.toNonIndexed() : geo;
      nonIdx.translate(cx, 0, cz);
      chunkGeos.push(nonIdx);
    }
  }

  const mergedInnerGeo = mergeGeometries(chunkGeos, false);
  mergedInnerGeo.computeBoundingBox();
  mergedInnerGeo.computeBoundingSphere();

  const innerMesh = new THREE.Mesh(mergedInnerGeo, terrainMat);
  innerMesh.name = 'inner-valley-terrain';
  innerMesh.receiveShadow = true;
  group.add(innerMesh);
  const chunks = [innerMesh];

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

/**
 * Sculpts a natural chiseled limestone & mossy cliff boulder geometry using directional
 * rock-cleavage planes and stratified ledges (replacing the old 7-sided poker-chip cylinders).
 */
function buildChiseledCliffBoulderGeo({ rx = 2.0, ry = 3.0, rz = 1.8, seed = 1, mossCap = true }) {
  const base = new THREE.IcosahedronGeometry(1.0, 2);
  const geo = base.index ? base.toNonIndexed() : base.clone();
  const pos = geo.attributes.position;

  const p1 = seed * 1.73 + 0.4;
  const p2 = seed * 2.91 + 1.1;
  const p3 = seed * 4.17 + 2.3;

  // 4 chiseled rock cleavage planes for crisp natural facets
  const planes = [
    [Math.cos(p1) * 0.82, 0.56, Math.sin(p1) * 0.82, 0.82],
    [Math.cos(p2) * 0.88, -0.35, Math.sin(p2) * 0.88, 0.86],
    [Math.cos(p3) * 0.76, 0.64, Math.sin(p3) * 0.76, 0.80],
    [-Math.sin(p1) * 0.65, 0.75, Math.cos(p1) * 0.65, 0.78],
  ];

  for (let i = 0; i < pos.count; i++) {
    let vx = pos.getX(i);
    let vy = pos.getY(i);
    let vz = pos.getZ(i);

    // Broad broader base + tapered upper ridge
    const baseSpread = 1.0 + Math.max(0, -vy) * 0.28;
    vx *= baseSpread;
    vz *= baseSpread;

    // Flatten bottom to embed solidly into the cliff/shoreline
    if (vy < -0.58) vy = -0.58 + (vy + 0.58) * 0.25;

    // Chisel against rock cleavage planes
    for (const [nx, ny, nz, d] of planes) {
      const dot = vx * nx + vy * ny + vz * nz;
      if (dot > d) {
        const excess = (dot - d) * 0.72;
        vx -= nx * excess;
        vy -= ny * excess;
        vz -= nz * excess;
      }
    }

    // Subtle horizontal sedimentary strata ledges + craggy surface fracture
    const strata = Math.sin(vy * 6.5 + p1) * 0.045;
    const crag =
      Math.sin(vx * 3.4 + vz * 2.7 + p2) * 0.065 +
      Math.cos(vy * 4.2 - vx * 2.9 + p3) * 0.045;

    pos.setXYZ(
      i,
      (vx + strata + crag) * rx,
      (vy + crag * 0.5) * (ry * 0.58),
      (vz - strata + crag) * rz
    );
  }

  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);

  const cWetBase = new THREE.Color(0x3b4654);   // Wet dark slate near water
  const cMidRock = new THREE.Color(0x646e78);   // Cool weathered limestone
  const cSunRock = new THREE.Color(0x889098);   // Warm sun-kissed stone facet
  const cMossDark = new THREE.Color(0x3d7830);  // Deep mossy crevice
  const cMossTop  = new THREE.Color(0x5ca444);  // Lush sunlit moss mantle
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i) / Math.max(0.5, ry * 0.58);
    const vz = pos.getZ(i);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);

    const hFrac = clamp((vy + 0.65) / 1.45, 0.0, 1.0);
    const rHoriz = Math.hypot(vx / Math.max(0.4, rx), vz / Math.max(0.4, rz));
    const sunFace = clamp(nx * -0.35 + ny * 0.55 + nz * 0.45 + 0.35, 0.0, 1.0);

    tmp.copy(cWetBase).lerp(cMidRock, smoothstep(0.08, 0.55, hFrac));
    tmp.lerp(cSunRock, smoothstep(0.35, 0.88, sunFace) * smoothstep(0.20, 0.85, hFrac));

    // Smooth vertex-position moss mantle on upper cliff shoulders (no hard polygon cap edges!)
    const mossNoise = Math.sin(vx * 1.8 + vz * 2.1 + seed) * 0.06;
    if (mossCap && hFrac > 0.56 + mossNoise) {
      const mossMask =
        smoothstep(0.56 + mossNoise, 0.86, hFrac) *
        (1.0 - smoothstep(0.52, 0.96, rHoriz));
      const mossCol = cMossDark.clone().lerp(cMossTop, smoothstep(0.3, 0.85, sunFace));
      tmp.lerp(mossCol, mossMask * 0.85);
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function addStratifiedRockMass(parent, { x, y, z, rx, ry, rz, rotY = 0, mossCap = true, seed = 1 }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const sBase = Math.round(Math.abs(x * 13 + z * 7)) + seed;
  const mainGeo = buildChiseledCliffBoulderGeo({ rx, ry, rz, seed: sBase, mossCap });
  const mainMesh = new THREE.Mesh(mainGeo);
  mainMesh.userData.outline = false;
  g.add(mainMesh);

  // Interlocking lower toe boulder so cliff buttresses meet the shore/stream naturally
  const toeGeo = buildChiseledCliffBoulderGeo({
    rx: rx * 0.76,
    ry: ry * 0.48,
    rz: rz * 0.78,
    seed: sBase + 19,
    mossCap: false,
  });
  const toeMesh = new THREE.Mesh(toeGeo);
  toeMesh.position.set(rx * 0.32, -ry * 0.24, rz * 0.28);
  toeMesh.rotation.y = 0.65;
  toeMesh.userData.outline = false;
  g.add(toeMesh);

  parent.add(g);
}

/**
 * Sculpts a smooth-shaded, softly rounded mountain ridge or green foothill peak
 * whose base skirt conforms 100% to `terrainHeightAt(wx, wz)` at every vertex
 * (eliminating any floating mountain edges above sloped terrain).
 */
function buildSculptedMountainMassif({
  width = 110,
  height = 42,
  depth = 74,
  seed = 1,
  isOlivePeak = false,
  px = 0,
  pz = 0,
  rotY = 0,
}) {
  const segX = 32;
  const segZ = 20;
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];
  const indices = [];

  // Atmospheric base mist -> lush sage/alpine flank -> sunlit ridge crest
  const cMistBase = new THREE.Color(isOlivePeak ? 0x8cb8a8 : 0x9ab8ce);
  const cShadowFlank = new THREE.Color(isOlivePeak ? 0x3e6b48 : 0x526e8c);
  const cMidFlank = new THREE.Color(isOlivePeak ? 0x5c9254 : 0x6e8eab);
  const cSunRidge = new THREE.Color(isOlivePeak ? 0x8ec468 : 0xa8c6de);
  const tmpC = new THREE.Color();

  const asym = ((seed * 37) % 11 - 5) * 0.045;
  const shoulderSide = seed % 2 === 0 ? 1.0 : -1.0;
  const phase = seed * 1.73;
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);

  for (let iz = 0; iz <= segZ; iz++) {
    const vz = (iz / segZ) * 2.0 - 1.0;
    for (let ix = 0; ix <= segX; ix++) {
      const vx = (ix / segX) * 2.0 - 1.0;

      const dxMain = (vx - asym) * 1.12;
      const dzMain = vz * 1.18;
      const rMain = Math.hypot(dxMain, dzMain);
      const angMain = Math.atan2(dzMain, dxMain);

      // 4 radiating alpine ridge spurs + gullies so mountains have real sculpted facets
      const spurWave =
        0.14 * Math.cos(angMain * 3.0 + phase) +
        0.09 * Math.sin(angMain * 5.0 - phase * 1.3);
      const effR = Math.max(0.0, rMain - spurWave * smoothstep(0.08, 0.75, rMain));
      const mainPeak =
        effR < 1.0 ? Math.pow(Math.cos(effR * Math.PI * 0.5), 1.38) : 0.0;

      const dxSh = (vx - shoulderSide * 0.46) * 1.42;
      const dzSh = (vz + 0.10) * 1.32;
      const rSh = Math.hypot(dxSh, dzSh);
      const shoulder =
        rSh < 1.0 ? 0.68 * Math.pow(Math.cos(rSh * Math.PI * 0.5), 1.48) : 0.0;

      // Secondary counter-shoulder for asymmetric natural skyline
      const dxSh2 = (vx + shoulderSide * 0.52) * 1.65;
      const dzSh2 = (vz - 0.12) * 1.45;
      const rSh2 = Math.hypot(dxSh2, dzSh2);
      const shoulder2 =
        rSh2 < 1.0 ? 0.48 * Math.pow(Math.cos(rSh2 * Math.PI * 0.5), 1.55) : 0.0;

      // Crisp central ridge spine fold
      const ridgeCrest = Math.exp(-Math.abs(dzMain - Math.sin(vx * 2.4 + phase) * 0.18) * 3.2);
      const hRaw = Math.max(mainPeak, Math.max(shoulder, shoulder2));
      const hFrac = clamp(hRaw * (0.88 + 0.16 * ridgeCrest), 0.0, 1.0);

      const lx = vx * width * 0.5;
      const lz = vz * depth * 0.5 + Math.sin(vx * 2.2 + seed) * depth * 0.07;

      // Exact world-space (wx, wz) for this vertex so its base locks into the terrain contour
      const wx = px + lx * cosR + lz * sinR;
      const wz = pz - lx * sinR + lz * cosR;
      const localGroundY = terrainHeightAt(wx, wz);
      // Sink outer skirt edge 8m below local terrain and rise smoothly above localGroundY
      const skirtSink = (1.0 - smoothstep(0.0, 0.24, hFrac)) * 8.0 + 2.5;
      const y = localGroundY - skirtSink + hFrac * height;
      positions.push(lx, y, lz);

      // East vs West flank lighting + ridge highlight + atmospheric base mist
      const sunFacing = clamp(0.5 - vx * 0.55 + spurWave * 1.8, 0.0, 1.0);
      tmpC.copy(cShadowFlank).lerp(cMidFlank, smoothstep(0.15, 0.65, sunFacing));
      tmpC.lerp(cSunRidge, smoothstep(0.45, 0.94, hFrac) * (0.45 + 0.55 * sunFacing));
      // Blend lower 28% into soft valley horizon mist
      tmpC.lerp(cMistBase, 1.0 - smoothstep(0.04, 0.32, hFrac));
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
  geo.computeVertexNormals();
  return geo.toNonIndexed();
}

/**
 * Builds the Merged Distant Sculpted Mountain Ridge Ring + Clouds + Sculpted Hydro Cliffs.
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
    const peakCount = 24;
    for (let i = 0; i < peakCount; i++) {
      const a = (i / peakCount) * Math.PI * 2 + 0.08;
      const x = Math.cos(a);
      const z = Math.sin(a);
      if (z > 0.90 && Math.abs(x) < 0.18) continue;
      const isOlive = i % 3 === 0;
      const r = isOlive ? 276 + (i % 2) * 16 : 308 + (i % 3) * 20;
      const px = x * r;
      const pz = z * r;
      const rotY = -a + Math.PI * 0.5 + ((i % 3) - 1) * 0.14;
      const h = isOlive ? 40 + ((i * 7) % 14) : 52 + ((i * 11) % 18);
      const w = isOlive ? 124 + ((i * 13) % 26) : 152 + ((i * 17) % 36);
      const d = 88 + ((i * 7) % 24);

      const massifGeo = buildSculptedMountainMassif({
        width: w,
        height: h,
        depth: d,
        seed: i + 101,
        isOlivePeak: isOlive,
        px,
        pz,
        rotY,
      });
      const peak = addColoredMesh(envRaw, massifGeo, null, false);
      peak.userData.flatShading = false;
      peak.position.set(px, 0.0, pz);
      peak.rotation.y = rotY;
    }
  }

  if (opts.includeHorizonClouds !== false) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.38;
      const r = 290 + (i % 2) * 24;
      const cx = Math.cos(a) * r;
      const cy = 92 + (i % 3) * 9;
      const cz = Math.sin(a) * r;
      for (let j = 0; j < 3; j++) {
        const puff = addColoredMesh(
          envRaw,
          new THREE.IcosahedronGeometry(8.5 + (j === 1 ? 3.5 : 0), 1),
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
    { x: wf.x - 3.85, y: 2.3, z: wf.z - 1.2, rx: 2.15, ry: 5.5, rz: 1.95, rotY: 0.22, mossCap: true },
    { x: wf.x - 4.75, y: 1.0, z: wf.z + 0.6, rx: 1.90, ry: 3.5, rz: 1.80, rotY: -0.18, mossCap: true },
    { x: wf.x - 3.30, y: -0.2, z: wf.z + 1.9, rx: 1.45, ry: 1.9, rz: 1.35, rotY: 0.45, mossCap: false },
    { x: wf.x - 2.95, y: 4.1, z: wf.z - 2.4, rx: 1.65, ry: 2.4, rz: 1.50, rotY: 0.12, mossCap: true },
    { x: wf.x + 2.85, y: 2.3, z: wf.z - 1.4, rx: 1.95, ry: 5.3, rz: 1.75, rotY: 0.35, mossCap: true },
    { x: wf.x + 2.35, y: 0.6, z: wf.z + 0.2, rx: 1.45, ry: 2.7, rz: 1.40, rotY: -0.24, mossCap: false },
    { x: wf.x, y: 3.8, z: wf.z - 1.85, rx: 2.1, ry: 2.2, rz: 0.95, rotY: 0.42, mossCap: false },
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

  // Grounded carved stone millrace retaining wall guiding waterfall plunge-pool current past the waterwheel
  const millB = BUILDINGS_BY_ID.watermill;
  const raceGroup = new THREE.Group();
  raceGroup.position.set(millB.x, 0, millB.z);
  raceGroup.rotation.y = millB.rotY;
  const wheelChannelX = -millB.w * 0.5 - 1.55;
  const lowWeirStone = addColoredMesh(
    raceGroup,
    buildChiseledCliffBoulderGeo({ rx: 0.65, ry: 1.45, rz: 2.6, seed: 409, mossCap: true }),
    null,
    false
  );
  lowWeirStone.position.set(wheelChannelX, -0.45, -0.4);
  envRaw.add(raceGroup);

  root.add(
    batchVertexColorGroup(envRaw, {
      gradientMap,
      flatShading: true,
      outlineThickness: 0.014,
      castShadow: true,
      receiveShadow: true,
    })
  );

  return root;
}

function buildCurvedStreamGeometry() {
  const segs = 28;
  const zStart = -64.0;
  const zEnd = LANDMARKS.waterfall.z - 0.55;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const z = lerp(zStart, zEnd, t);
    const cx = streamCenterX(z);
    const halfW = lerp(1.68, 1.58, smoothstep(0.75, 1.0, t));
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
  const cols = 18;
  const rows = 28;
  const positions = [];
  const uvs = [];
  const indices = [];

  const xWeir = streamCenterX(wf.z - 0.65);
  const zWeir = wf.z - 0.65;
  const yTop = 4.96;
  const yBot = ZONES.millpond.waterY - 0.05;

  const dirX = Math.sin(0.22);
  const dirZ = Math.cos(0.22);
  const rightX = Math.cos(0.22);
  const rightZ = -Math.sin(0.22);

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    // Natural two-tier rocky cascade trajectory: smooth crest roll -> mid-cliff rock shelf bounce -> plunge curtain
    const shelfBounce = Math.exp(-Math.pow((v - 0.46) / 0.14, 2.0)) * 0.34;
    const forward =
      (v < 0.16 ? v * 2.6 : 0.416 + Math.pow((v - 0.16) / 0.84, 0.88) * 2.15) + shelfBounce;
    const dropT =
      v < 0.12 ? (v / 0.12) * 0.05 : 0.05 + Math.pow((v - 0.12) / 0.88, 1.28) * 0.95;
    const wy = lerp(yTop, yBot, dropT);
    const halfW = lerp(1.58, 2.35, Math.pow(v, 1.35));

    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const lat = (u - 0.5) * 2.0 * halfW;
      // Organic rock-split ribbing across the curtain width
      const rib =
        Math.sin(u * Math.PI) * 0.32 * Math.sin(v * Math.PI) +
        Math.sin(u * 11.0 + v * 4.5) * 0.08 * Math.sin(v * Math.PI);
      const fwd = forward + rib;
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

  // 1. Main Millpond Lake surface at (-62, -1.2, 6) with 96 radial segments for ultra-smooth shoreline
  const lakeGeo = new THREE.CircleGeometry(1, 96);
  lakeGeo.rotateX(-Math.PI / 2);
  lakeGeo.scale(mp.rx * 0.985, 1, mp.rz * 0.985);
  lakeGeo.translate(mp.x, mp.waterY, mp.z);
  addWaterGeo(lakeGeo, null, 0);

  // 2. Waterfall Plunge Pool surface blending seamlessly into the lake
  const plungeGeo = new THREE.CircleGeometry(6.4, 36);
  plungeGeo.rotateX(-Math.PI / 2);
  plungeGeo.translate(wf.x + 0.5, mp.waterY + 0.008, wf.z + 1.6);
  addWaterGeo(plungeGeo, null, 0);

  // 3. Plunge Pool aerated boil cushion (soft FBM foam mode = 1)
  const foamCoreGeo = new THREE.CircleGeometry(3.4, 28);
  foamCoreGeo.rotateX(-Math.PI / 2);
  foamCoreGeo.translate(wf.x + 0.45, mp.waterY + 0.022, wf.z + 1.55);
  addWaterGeo(foamCoreGeo, null, 1);

  // 4. Waterwheel Tailrace Channel water + organic splash wake alongside the lower wheel paddles
  const millMat = new THREE.Matrix4()
    .makeRotationY(millB.rotY)
    .setPosition(millB.x, mp.waterY + 0.01, millB.z);

  const tailraceGeo = new THREE.CircleGeometry(1, 24);
  tailraceGeo.rotateX(-Math.PI / 2);
  tailraceGeo.scale(1.85, 1, 5.2);
  tailraceGeo.translate(-millB.w * 0.5 - 1.05, 0, 0.35);
  addWaterGeo(tailraceGeo, millMat, 0);

  const wheelWakeGeo = new THREE.CircleGeometry(1, 22);
  wheelWakeGeo.rotateX(-Math.PI / 2);
  wheelWakeGeo.scale(1.05, 1, 2.55);
  wheelWakeGeo.translate(-millB.w * 0.5 - 0.72, 0.018, 0.25);
  addWaterGeo(wheelWakeGeo, millMat, 1);

  // 5. Curved NW Headwaters Stream surface
  addWaterGeo(buildCurvedStreamGeometry(), null, 0);

  // 6. Sculpted Multi-Tier Waterfall Cascade Curtain
  addWaterGeo(buildWaterfallCascadeGeometry(), null, 2);

  const mergedWaterGeo = mergeGeometries(waterParts, false);
  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x3ba69c) }, // Clear sunlit aquamarine-jade shallows
      uDeep: { value: new THREE.Color(0x144b66) },    // Deep alpine sapphire-teal basin
      uFoam: { value: new THREE.Color(0xf4f9fc) },    // Warm sunlit aerated whitewater
      uSunDir: { value: new THREE.Vector3(-0.48, 0.68, 0.55).normalize() },
      uSkyReflect: { value: new THREE.Color(0x8ec2e2) },
      uHorizonReflect: { value: new THREE.Color(0xd8eef5) },
      uLightTint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: /* glsl */ `
      attribute float aWaterMode;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying float vWaterMode;
      void main() {
        vWaterMode = aWaterMode;
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      uniform vec3 uSunDir;
      uniform vec3 uSkyReflect;
      uniform vec3 uHorizonReflect;
      uniform vec3 uLightTint;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying float vWaterMode;

      float hashW(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noiseW(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hashW(i + vec2(0.0, 0.0)), hashW(i + vec2(1.0, 0.0)), u.x),
          mix(hashW(i + vec2(0.0, 1.0)), hashW(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbmW(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 3; i++) {
          v += a * noiseW(p);
          p = rot * p * 2.07;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);

        // =====================================================================
        // MODE 2: MULTI-LAYERED FBM WATERFALL CASCADE CURTAIN & MIST CUSHION
        // =====================================================================
        if (vWaterMode > 1.5) {
          float fallProgress = 1.0 - vUv.y; // 0 at weir lip, 1 at plunge pool base
          float edgeDist = min(vUv.x, 1.0 - vUv.x);

          // Primary rushing water ribbons + secondary fine mist spray
          float nPrimary = fbmW(vec2(vUv.x * 7.5, vUv.y * 3.8 + uTime * 2.4));
          float nFine    = fbmW(vec2(vUv.x * 16.0 - 1.7, vUv.y * 6.5 + uTime * 3.9));
          float rib      = smoothstep(0.32, 0.76, nPrimary * 0.62 + nFine * 0.38);

          // Whitewater aeration at the weir crest, mid-cliff rock shelf (fallProgress ~ 0.46), and plunge base
          float crestFoam = smoothstep(0.24, 0.0, fallProgress) * (0.65 + 0.35 * nFine);
          float shelfFoam = exp(-pow((fallProgress - 0.46) / 0.14, 2.0)) * smoothstep(0.30, 0.72, nPrimary) * 0.75;
          float baseMist  = smoothstep(0.68, 0.98, fallProgress) * (0.72 + 0.28 * nPrimary);

          float foamMask = clamp(rib * 0.78 + crestFoam * 0.85 + shelfFoam + baseMist * 0.90, 0.0, 1.0);
          vec3 waterCore = mix(uDeep * 1.15, uShallow * 1.18, smoothstep(0.2, 0.8, nPrimary));
          vec3 col = mix(waterCore, uFoam, foamMask) * uLightTint;

          // Softly feather the left/right edges into spray so there is no hard geometric strip edge
          float sideAlpha = smoothstep(0.0, 0.16, edgeDist) * (0.82 + 0.18 * nFine);
          float alpha = clamp(mix(sideAlpha * 0.88, 0.96, crestFoam + baseMist * 0.5), 0.0, 0.96);
          gl_FragColor = vec4(col, alpha);
          return;
        }

        // =====================================================================
        // MODE 0 & 1: MILLPOND LAKE, PLUNGE POOL & HEADWATERS STREAM
        // =====================================================================
        vec2 p = vWorldPos.xz;
        vec2 pondRel = (p - vec2(-62.0, 6.0)) / vec2(27.5, 35.4);
        float rPond = length(pondRel);
        float dCausewayIsland = length(p - vec2(-42.0, 18.0));
        float dPlunge = length(p - vec2(-50.8, -19.2));
        float isStream = step(1.5, vWorldPos.y);

        // 1. Directional Wind-Ripple Wave Field aligned with valley wind (WIND_DIR = vec2(0.8207, 0.5714))
        const vec2 WIND_DIR = vec2(0.8207, 0.5714);
        const vec2 WIND_PERP = vec2(-0.5714, 0.8207);
        float wAlong = dot(p, WIND_DIR);
        float wAcross = dot(p, WIND_PERP);

        float wave1 = fbmW(vec2(wAlong * 0.38 - uTime * 0.85, wAcross * 0.24 + uTime * 0.18));
        float wave2 = fbmW(vec2(wAlong * 0.92 - uTime * 1.35 + 3.1, wAcross * 0.68 - uTime * 0.32));
        // Concentric ripples radiating outward from the waterfall plunge pool
        float plungeRing = sin(dPlunge * 2.2 - uTime * 3.2) * exp(-dPlunge * 0.14);
        float waveH = (wave1 - 0.5) * 0.65 + (wave2 - 0.5) * 0.35 + plungeRing * 0.35;

        // Perturbed 3D surface normal from wave derivatives for Fresnel & Sun Specular
        vec3 N = normalize(vec3(
          -(wave1 - 0.5) * 0.18 - (wave2 - 0.5) * 0.22 - (p.x + 50.8) / max(1.0, dPlunge) * plungeRing * 0.08,
          1.0,
          -(wave1 - 0.5) * 0.14 - (wave2 - 0.5) * 0.18 - (p.y + 19.2) / max(1.0, dPlunge) * plungeRing * 0.08
        ));

        // 2. Water Depth & Submerged Sandbar Refraction Gradient
        float shallowSandbar = 1.0 - smoothstep(3.2, 10.5, dCausewayIsland);
        float shoreProx = clamp(smoothstep(0.68, 0.98, rPond) + shallowSandbar * 0.85, 0.0, 1.0);
        vec3 sandBedCol = vec3(0.76, 0.72, 0.58) * uLightTint;
        vec3 bodyCol = mix(uDeep, uShallow, smoothstep(0.05, 0.82, shoreProx + wave1 * 0.18));
        // Blend warm submerged sand through crystal-clear shallow water near the beach & island
        bodyCol = mix(bodyCol, mix(uShallow, sandBedCol, 0.48), smoothstep(0.78, 0.98, shoreProx) * (1.0 - isStream));

        // 3. Schlick Fresnel Sky & Mountain Horizon Reflection
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fresnel = 0.06 + 0.82 * pow(1.0 - ndv, 3.6);
        vec3 reflDir = reflect(-V, N);
        float skyGrad = smoothstep(-0.05, 0.45, reflDir.y);
        // Subtle alpine mountain reflection silhouette in the northern/western lake quadrant
        float mtnRefl = smoothstep(0.25, 0.75, fbmW(p * 0.045 + reflDir.xz * 2.2)) * (1.0 - smoothstep(0.05, 0.28, reflDir.y));
        vec3 skyCol = mix(uHorizonReflect, uSkyReflect, skyGrad) * uLightTint;
        skyCol = mix(skyCol, vec3(0.38, 0.52, 0.66) * uLightTint, mtnRefl * 0.38);

        vec3 col = mix(bodyCol, skyCol, fresnel * 0.68);

        // 4. Sparkling Sun Specular Glints & Subsurface Wave Crest Glow
        vec3 H = normalize(L + V);
        float specBroad = pow(clamp(dot(N, H), 0.0, 1.0), 42.0) * 0.38;
        float specSparkle = smoothstep(0.74, 0.92, wave2) * pow(clamp(dot(N, H), 0.0, 1.0), 16.0) * 0.55;
        vec3 sunSpecCol = vec3(1.0, 0.97, 0.88) * uLightTint;
        col += sunSpecCol * (specBroad + specSparkle);

        // 5. Lacy Organic FBM Shoreline, Island & Plunge-Pool Foam
        float fNoise = fbmW(p * 0.85 - WIND_DIR * uTime * 0.45);
        float shoreBand = smoothstep(0.88, 0.955, rPond + (fNoise - 0.5) * 0.045)
                        * (1.0 - smoothstep(0.96, 1.005, rPond));
        float islandBand = smoothstep(3.0, 4.1, dCausewayIsland + (fNoise - 0.5) * 0.4)
                         * (1.0 - smoothstep(4.2, 5.2, dCausewayIsland));
        float plungeFoam = smoothstep(0.42, 0.78, plungeRing + fNoise * 0.55) * smoothstep(6.8, 0.8, dPlunge);
        float mode1Foam = vWaterMode * smoothstep(0.28, 0.74, fNoise + 0.25 * sin(dPlunge * 3.0 - uTime * 4.0));

        float foamMask = clamp(
          mode1Foam * 0.78 + shoreBand * 0.52 + islandBand * 0.48 + plungeFoam * 0.72,
          0.0,
          0.92
        );
        col = mix(col, uFoam * uLightTint, foamMask);

        // 6. Smoothly feather shoreline alpha into the wet sand so zero polygon edges ever show
        float pondEdgeDist = min(rPond, dPlunge / 6.4);
        float shoreAlpha = isStream > 0.5
          ? 0.94
          : smoothstep(1.005, 0.84, pondEdgeDist + (fNoise - 0.5) * 0.025);
        float finalAlpha = clamp(mix(shoreAlpha * 0.90, 0.96, foamMask), 0.0, 0.96);

        gl_FragColor = vec4(col, finalAlpha);
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
