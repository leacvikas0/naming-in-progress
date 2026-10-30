import * as THREE from 'three';
import { SPECIES_SPECS, createSpeciesGeometries } from './species.js';

export const MEADOW_PROFILES = {
  tablet: {
    name: 'tablet',
    grassRadius: 54,
    grassCount: 5200,
    flowerRadius: 78,
    counts: { bellflower: 145, daisy: 170, lupine: 115, cosmos: 145, toonShrub: 54 },
  },
  desktop: {
    name: 'desktop',
    grassRadius: 72,
    grassCount: 11200,
    flowerRadius: 102,
    counts: { bellflower: 270, daisy: 320, lupine: 215, cosmos: 270, toonShrub: 105 },
  },
  demo: {
    name: 'demo',
    grassRadius: 34,
    grassCount: 6000,
    flowerRadius: 34,
    counts: { bellflower: 155, daisy: 195, lupine: 135, cosmos: 165, toonShrub: 55 },
  },
};

function createEmptyTreeShadowArray() {
  const arr = [];
  for (let i = 0; i < 48; i++) {
    arr.push(new THREE.Vector4(9999.0, 0.0, 9999.0, 0.01));
  }
  return arr;
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export function defaultSampleHeight(x, z) {
  return Math.sin(x * 0.075) * Math.cos(z * 0.065) * 0.55 + Math.sin((x - z) * 0.035) * 0.35;
}

export function createDefaultWorldMaskTexture(size = 256, worldExtent = 125) {
  const data = new Uint8Array(size * size * 4);
  for (let iz = 0; iz < size; iz++) {
    const z = ((iz / (size - 1)) * 2 - 1) * worldExtent;
    const roadCenter = Math.sin(z * 0.09) * 3.4;
    for (let ix = 0; ix < size; ix++) {
      const x = ((ix / (size - 1)) * 2 - 1) * worldExtent;
      const distRoad = Math.abs(x - roadCenter);
      const meadowAllow = distRoad > 2.15 ? 255 : 0;
      const idx = (iz * size + ix) * 4;
      data[idx] = 128;
      data[idx + 1] = distRoad <= 2.15 ? 220 : 40;
      data[idx + 2] = meadowAllow; // uWorldMask.b: >= 0.5 allows meadow, < 0.5 culls
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  tex.userData = { worldExtent, size, data };
  return tex;
}

function createHeightDataTexture(sampleHeight, size = 256, worldExtent = 125) {
  const data = new Uint8Array(size * size * 4);
  const minH = -12.0, maxH = 36.0, span = maxH - minH;
  for (let iz = 0; iz < size; iz++) {
    const z = ((iz / (size - 1)) * 2 - 1) * worldExtent;
    for (let ix = 0; ix < size; ix++) {
      const x = ((ix / (size - 1)) * 2 - 1) * worldExtent;
      const h = THREE.MathUtils.clamp((sampleHeight(x, z) - minH) / span, 0, 1);
      const enc = Math.round(h * 65535);
      const idx = (iz * size + ix) * 4;
      data[idx] = (enc >> 8) & 255;
      data[idx + 1] = enc & 255;
      data[idx + 2] = 0;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, minH, span };
}

function sampleMaskB(maskTex, x, z, worldExtent) {
  const img = maskTex?.image;
  if (!img || !img.data || !img.width) return 1.0;
  const u = THREE.MathUtils.clamp(x / (2 * worldExtent) + 0.5, 0, 1);
  const v = THREE.MathUtils.clamp(z / (2 * worldExtent) + 0.5, 0, 1);
  const ix = Math.min(img.width - 1, Math.floor(u * img.width));
  const iz = Math.min(img.height - 1, Math.floor(v * img.height));
  return img.data[(iz * img.width + ix) * 4 + 2] / 255;
}

export function createGouacheMaterial({
  isToroidal = false,
  toroidRadius = 42,
  fadeRadius = 68,
  windFlex = 0.8,
  worldExtent = 125,
  worldMaskTexture = null,
  heightTexInfo = null,
  sharedUniforms = null,
  cel = 1.0,
  rim = 0.65,
} = {}) {
  const uniforms = {
    uTime: sharedUniforms?.uTime || { value: 0 },
    uPlayerPos: sharedUniforms?.uPlayerPos || { value: new THREE.Vector3(0, 0, 0) },
    uSunDir: sharedUniforms?.uSunDir || { value: new THREE.Vector3(0.58, 0.76, 0.30).normalize() },
    uLightTint: sharedUniforms?.uLightTint || { value: new THREE.Color(1, 1, 1) },
    uTreeShadows: sharedUniforms?.uTreeShadows || { value: createEmptyTreeShadowArray() },
    uTreeCount: sharedUniforms?.uTreeCount || { value: 0 },
    uGrassShadowRoot: { value: new THREE.Color('#387240') },
    uGrassShadowTip: { value: new THREE.Color('#529448') },
    uGrassSunRoot: { value: new THREE.Color('#64a648') },
    uGrassSunTip: { value: new THREE.Color('#a8de66') },
    uCel: { value: cel },
    uRim: { value: rim },
    uWorldMask: { value: worldMaskTexture },
    uUseMask: { value: worldMaskTexture ? 1.0 : 0.0 },
    uHeightTex: { value: heightTexInfo ? heightTexInfo.tex : null },
    uUseHeightTex: { value: heightTexInfo ? 1.0 : 0.0 },
    uHeightMin: { value: heightTexInfo ? heightTexInfo.minH : -12.0 },
    uHeightSpan: { value: heightTexInfo ? heightTexInfo.span : 48.0 },
    uWorldExtent: { value: worldExtent },
    uIsToroidal: { value: isToroidal ? 1.0 : 0.0 },
    uToroidRadius: { value: toroidRadius },
    uFadeStart: { value: (isToroidal ? toroidRadius : fadeRadius) * 0.70 },
    uFadeEnd: { value: isToroidal ? toroidRadius : fadeRadius },
    uWindFlex: { value: windFlex },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexColors: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uPlayerPos;
      uniform sampler2D uWorldMask;
      uniform float uUseMask;
      uniform sampler2D uHeightTex;
      uniform float uUseHeightTex;
      uniform float uHeightMin;
      uniform float uHeightSpan;
      uniform float uWorldExtent;
      uniform float uIsToroidal;
      uniform float uToroidRadius;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform float uWindFlex;

      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vLocalY;
      varying float vDistFade;

      void main() {
        #ifdef USE_COLOR
          vColor = color;
        #else
          vColor = vec3(0.45, 0.75, 0.35);
        #endif
        vLocalY = max(0.0, position.y);

        mat4 instM = mat4(1.0);
        #ifdef USE_INSTANCING
          instM = instanceMatrix;
        #endif

        vec3 basePos = instM[3].xyz;
        mat3 localRS = mat3(instM);

        float culled = 0.0;
        if (uIsToroidal > 0.5) {
          float diam = uToroidRadius * 2.0;
          vec2 origXZ = basePos.xz;
          vec2 relXZ = mod(origXZ - uPlayerPos.xz + uToroidRadius, diam) - uToroidRadius;
          basePos.xz = uPlayerPos.xz + relXZ;

          if (uUseMask > 0.5) {
            vec2 maskUV = clamp(basePos.xz / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
            float maskB = texture2D(uWorldMask, maskUV).b;
            if (maskB < 0.72) {
              // Relocate excluded pond/arena/road/stair tufts to a stationary backup meadow slot
              vec2 altOrig1 = origXZ + vec2(uToroidRadius * 0.67, uToroidRadius * 0.43);
              vec2 altXZ1 = uPlayerPos.xz + (mod(altOrig1 - uPlayerPos.xz + uToroidRadius, diam) - uToroidRadius);
              vec2 altUV1 = clamp(altXZ1 / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
              float m1 = texture2D(uWorldMask, altUV1).b;
              if (m1 >= 0.78) {
                basePos.xz = altXZ1;
              } else {
                vec2 altOrig2 = origXZ + vec2(-uToroidRadius * 0.53, uToroidRadius * 0.79);
                vec2 altXZ2 = uPlayerPos.xz + (mod(altOrig2 - uPlayerPos.xz + uToroidRadius, diam) - uToroidRadius);
                vec2 altUV2 = clamp(altXZ2 / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
                float m2 = texture2D(uWorldMask, altUV2).b;
                if (m2 >= 0.78) {
                  basePos.xz = altXZ2;
                } else {
                  culled = 1.0;
                }
              }
            }
          }

          if (culled < 0.5 && uUseHeightTex > 0.5) {
            vec2 hUV = clamp(basePos.xz / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
            vec4 hSample = texture2D(uHeightTex, hUV);
            float hNorm = (hSample.r * 255.0 * 256.0 + hSample.g * 255.0) / 65535.0;
            basePos.y = uHeightMin + hNorm * uHeightSpan;
          }
        } else if (uUseMask > 0.5) {
          vec2 maskUV = clamp(basePos.xz / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
          float maskB = texture2D(uWorldMask, maskUV).b;
          if (maskB < 0.65) culled = 1.0;
        }

        vec2 dVec = abs(basePos.xz - uPlayerPos.xz);
        float distToPlayer = uIsToroidal > 0.5
          ? mix(max(dVec.x, dVec.y), length(dVec) * 0.82, 0.35)
          : length(dVec);
        float distFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distToPlayer);
        // Smoothly taper toroidal grass blades when camera is at high aerial masterplan altitude
        float altFade = uIsToroidal > 0.5 ? (1.0 - smoothstep(65.0, 98.0, cameraPosition.y)) : 1.0;
        float effFade = distFade * altFade;
        if (effFade <= 0.005) culled = 1.0;
        vDistFade = effFade;

        vec3 taperedPos = vec3(
          position.x * mix(0.82, 1.0, effFade),
          position.y * smoothstep(0.0, 1.0, effFade),
          position.z * mix(0.82, 1.0, effFade)
        );
        vec3 localScaled = localRS * taperedPos;
        // Layered Ghibli meadow breeze wave
        float w = clamp(vLocalY * 2.8, 0.0, 1.0) * uWindFlex * effFade;
        float wave1 = sin(uTime * 2.1 + (basePos.x + localScaled.x) * 0.45 + (basePos.z + localScaled.z) * 0.35);
        float wave2 = cos(uTime * 3.2 - basePos.x * 0.32 + basePos.z * 0.58) * 0.35;
        float gust = (wave1 + wave2) * w;
        localScaled.x += gust * 0.14;
        localScaled.z += gust * 0.09;
        localScaled.y -= abs(gust) * 0.03;

        vec4 worldPos = modelMatrix * vec4(basePos + localScaled, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * localRS * normal);

        if (culled > 0.5) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        } else {
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uLightTint;
      uniform vec4 uTreeShadows[48];
      uniform int uTreeCount;
      uniform vec3 uGrassShadowRoot;
      uniform vec3 uGrassShadowTip;
      uniform vec3 uGrassSunRoot;
      uniform vec3 uGrassSunTip;
      uniform float uIsToroidal;
      uniform float uCel;
      uniform float uRim;

      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vLocalY;
      varying float vDistFade;

      float hash2D(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash2D(i + vec2(0.0, 0.0)), hash2D(i + vec2(1.0, 0.0)), u.x),
          mix(hash2D(i + vec2(0.0, 1.0)), hash2D(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
          v += a * valueNoise(p);
          p *= 2.03;
          a *= 0.5;
        }
        return v;
      }

      float evalTreeGroundShadow(vec2 xz, vec3 sunDir) {
        vec2 sunFlat = normalize(vec2(sunDir.x, sunDir.z) + vec2(1e-5, 0.0));
        vec2 shadowDir = -sunFlat;
        vec2 perpDir = vec2(-shadowDir.y, shadowDir.x);
        float edgeRuffle = (valueNoise(xz * 1.35) - 0.5) * 0.22;
        float maxShd = 0.0;

        for (int i = 0; i < 48; i++) {
          if (i >= uTreeCount) break;
          vec4 tr = uTreeShadows[i];
          vec2 rel = xz - tr.xz;
          float rCan = tr.w;
          if (abs(rel.x) > rCan * 2.3 || abs(rel.y) > rCan * 2.3) continue;

          float along = dot(rel, shadowDir);
          float across = abs(dot(rel, perpDir));

          float trunkW = rCan * 0.105;
          float inTrunkLen = smoothstep(-0.22, 0.14, along) * (1.0 - smoothstep(rCan * 0.88, rCan * 1.20, along));
          float trunkShd = inTrunkLen * (1.0 - smoothstep(trunkW * 0.65, trunkW * 1.25, across));

          vec2 poolCenter = shadowDir * (rCan * 0.65);
          vec2 dPool = rel - poolCenter;
          float pAlong = dot(dPool, shadowDir) / (rCan * 1.12);
          float pAcross = dot(dPool, perpDir) / (rCan * 0.94);
          float poolDist = length(vec2(pAlong, pAcross)) + edgeRuffle * 0.16;
          float canopyShd = 1.0 - smoothstep(0.70, 1.02, poolDist);

          float underDist = length(rel) / (rCan * 0.85) + edgeRuffle * 0.14;
          float underShd = (1.0 - smoothstep(0.65, 1.0, underDist)) * 0.88;

          maxShd = max(maxShd, max(trunkShd * 0.95, max(canopyShd, underShd)));
        }
        return clamp(maxShd, 0.0, 1.0);
      }

      float computeCanopyShadow(vec2 xz) {
        if (uTreeCount > 0) {
          float treeShd = evalTreeGroundShadow(xz, uSunDir);
          float softField = smoothstep(0.28, 0.72, valueNoise(xz * 0.045 + vec2(2.1, -1.4))) * 0.14;
          return clamp(max(treeShd * 0.92, softField), 0.0, 1.0);
        }
        float n = fbm(xz * 0.085 + vec2(3.1, 1.7));
        float fine = valueNoise(xz * 0.28 + vec2(-1.2, 4.5)) * 0.34;
        float dapple = smoothstep(0.32, 0.68, n + fine - 0.12);
        return dapple * 0.85;
      }

      void main() {
        // Upward-softened hemisphere normals so thin grass blades NEVER have harsh dark backfaces
        vec3 rawN = gl_FrontFacing ? normalize(vWorldNormal) : -normalize(vWorldNormal);
        vec3 N = normalize(mix(rawN, vec3(rawN.x * 0.3, 1.0, rawN.z * 0.3), 0.76));

        float hFrac = clamp(vLocalY / 0.28, 0.0, 1.0);
        float greenness = clamp((vColor.g - max(vColor.r, vColor.b) * 0.88) * 5.0, 0.0, 1.0);

        // Harmonized spring-meadow grass ramp matching ref-target-trees.png & terrain shader
        vec3 grassShd = mix(uGrassShadowRoot, uGrassShadowTip, smoothstep(0.0, 0.85, hFrac));
        vec3 grassSun = mix(uGrassSunRoot, uGrassSunTip, smoothstep(0.15, 0.95, hFrac));

        vec3 colShadow = mix(vColor * vec3(0.68, 0.74, 0.90), grassShd, greenness);
        vec3 colSun    = mix(vColor * vec3(1.14, 1.10, 1.05), grassSun, greenness);

        float ndl = dot(N, normalize(uSunDir));
        float canopyShadow = computeCanopyShadow(vWorldPos.xz);

        // Combine blade arch normal, height along blade, and directional tree canopy shadow
        float wrapLit = clamp(smoothstep(-0.28, 0.52, ndl) * 0.68 + hFrac * 0.48 - canopyShadow * 0.48, 0.0, 1.0);

        // Quantized 3-flat-tone cel ramp
        float celShade = 0.5 * smoothstep(0.28, 0.35, wrapLit) + 0.5 * smoothstep(0.62, 0.69, wrapLit);
        float shade = mix(wrapLit, celShade, uCel);
        float lightFactor = shade * (1.0 - canopyShadow * 0.52);

        vec3 col = mix(colShadow, colSun, lightFactor);

        // Deeper 3rd cel shadow band at the root/dapple base
        vec3 deepShadow = colShadow * vec3(0.82, 0.88, 0.94);
        col = mix(deepShadow, col, mix(1.0, smoothstep(0.04, 0.18, shade), uCel));

        // Warm sunlit fresnel rim highlight + subtle grazing contour ink (fades out at outer ring)
        float edgeVis = smoothstep(0.0, 0.55, vDistFade);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float fres = 1.0 - clamp(abs(dot(N, V)), 0.0, 1.0);
        vec3 inkCol = colShadow * vec3(0.56, 0.64, 0.68);
        col = mix(col, inkCol, smoothstep(0.74, 0.95, fres) * 0.24 * hFrac * edgeVis);

        float rim = smoothstep(0.55, 0.88, fres) * smoothstep(0.12, 0.58, ndl) * hFrac * (1.0 - canopyShadow * 0.7);
        col = mix(col, vec3(0.92, 0.96, 0.68), rim * uRim * 0.36 * edgeVis);

        float rootAO = mix(1.0, mix(0.86, 1.04, smoothstep(0.0, 0.22, vLocalY)), edgeVis);
        vec3 finalCol = col * rootAO;

        // Seamless outer-ring dissolve into the underlying spring-meadow terrain green (zero lawnmower cutoff!)
        if (uIsToroidal > 0.5) {
          vec3 terrainMatch = mix(uGrassShadowTip * 0.92, mix(uGrassSunRoot, uGrassSunTip, 0.56), lightFactor);
          finalCol = mix(terrainMatch, finalCol, smoothstep(0.0, 0.52, vDistFade));
        }

        gl_FragColor = vec4(finalCol * uLightTint, 1.0);
      }
    `,
  });
}

export function createToroidalMeadow({
  profile = 'desktop',
  worldMaskTexture = null,
  sampleHeight = defaultSampleHeight,
  worldExtent = 125,
  geometries = null,
  treeShadows = null,
  treeCount = 0,
} = {}) {
  const cfg = typeof profile === 'string' ? (MEADOW_PROFILES[profile] || MEADOW_PROFILES.desktop) : { ...MEADOW_PROFILES.desktop, ...profile };
  const geos = geometries || createSpeciesGeometries();
  const maskTex = worldMaskTexture || createDefaultWorldMaskTexture(256, worldExtent);
  const heightTexInfo = createHeightDataTexture(sampleHeight, 256, worldExtent);
  const sharedUniforms = {
    uTime: { value: 0 },
    uPlayerPos: { value: new THREE.Vector3(0, 0, 0) },
    uSunDir: { value: new THREE.Vector3(0.58, 0.76, 0.30).normalize() },
    uLightTint: { value: new THREE.Color(1, 1, 1) },
    uTreeShadows: { value: treeShadows || createEmptyTreeShadowArray() },
    uTreeCount: { value: treeShadows ? treeCount : 0 },
  };

  const group = new THREE.Group();
  group.name = 'ToroidalMeadow';
  const dummy = new THREE.Object3D();

  // 1. Toroidal GPU InstancedMesh for grassTuft (1 draw call)
  const grassMat = createGouacheMaterial({
    isToroidal: true,
    toroidRadius: cfg.grassRadius,
    windFlex: SPECIES_SPECS.grassTuft.flex,
    worldExtent,
    worldMaskTexture: maskTex,
    heightTexInfo,
    sharedUniforms,
  });
  const grassMesh = new THREE.InstancedMesh(geos.grassTuft, grassMat, cfg.grassCount);
  grassMesh.name = 'meadow_grassTuft_toroidal';
  grassMesh.frustumCulled = false;
  const diam = cfg.grassRadius * 2;
  for (let i = 0; i < cfg.grassCount; i++) {
    const ox = (hash(i * 3.1 + 1.7) - 0.5) * diam;
    const oz = (hash(i * 5.3 + 2.9) - 0.5) * diam;
    dummy.position.set(ox, 0, oz);
    dummy.rotation.set(0, hash(i * 7.7) * Math.PI * 2, 0);
    const wave = 0.14 * Math.sin(ox * 0.28) * Math.cos(oz * 0.28);
    const s = (0.80 + hash(i * 11.3) * 0.54 + wave) * 1.34;
    dummy.scale.set(s, s * (0.92 + hash(i * 13.1) * 0.46), s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(i, dummy.matrix);
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  group.add(grassMesh);

  // 2. 5 Static InstancedMesh batches for wildflowers & shrubs in cohesive botanical drifts (5 draw calls -> 6 total)
  const flowerKeys = ['bellflower', 'daisy', 'lupine', 'cosmos', 'toonShrub'];
  const flowerMeshes = {};
  const instanceCounts = { grassTuft: cfg.grassCount };

  // Curated roadside drift anchors so each species forms lush color colonies along the winding path
  const driftZ = {
    daisy:      [-9.5, -2.5, 4.8, 8.8],
    cosmos:     [-6.5, 1.2, 6.8, 10.2],
    bellflower: [-8.0, -0.8, 3.5, 7.6],
    lupine:     [-11.0, -4.2, 2.2, 6.2],
    toonShrub:  [-7.5, -1.5, 4.5, 8.5],
  };

  flowerKeys.forEach((key, sIdx) => {
    const targetCount = cfg.counts[key] || 150;
    const mat = createGouacheMaterial({
      isToroidal: false,
      fadeRadius: cfg.flowerRadius,
      windFlex: SPECIES_SPECS[key].flex,
      worldExtent,
      worldMaskTexture: maskTex,
      sharedUniforms,
    });
    const imesh = new THREE.InstancedMesh(geos[key], mat, targetCount);
    imesh.name = `meadow_${key}_static`;
    imesh.frustumCulled = false;

    let placed = 0, attempt = 0;
    const maxR = cfg.flowerRadius * 0.94;
    const patchCount = key === 'toonShrub' ? 14 : 20;
    const anchors = driftZ[key];

    while (placed < targetCount && attempt < targetCount * 9) {
      attempt++;
      let x, z;
      if (placed < targetCount * 0.34) {
        const aIdx = attempt % anchors.length;
        z = anchors[aIdx] + (hash(attempt * 4.3 + sIdx * 17.1) - 0.5) * 4.8;
        const side = (aIdx + sIdx) % 2 === 0 ? 1 : -1;
        const roadX = Math.sin(z * 0.09) * 3.4;
        const baseOff = key === 'toonShrub' ? 3.5 : 2.45;
        const spreadOff = key === 'toonShrub' ? 4.8 : 4.2;
        const offset = baseOff + hash(attempt * 6.7 + sIdx * 9.3) * spreadOff;
        x = roadX + side * offset;
      } else {
        const pId = attempt % patchCount;
        const pAng = hash(pId * 19.3 + sIdx * 41.1) * Math.PI * 2;
        const pDist = (0.12 + 0.84 * Math.sqrt(hash(pId * 29.7 + sIdx * 13.7))) * maxR;
        const spread = key === 'toonShrub' ? 3.8 : 2.6;
        x = Math.cos(pAng) * pDist + (hash(attempt * 3.7 + sIdx * 7.1) - 0.5) * spread * 2;
        z = Math.sin(pAng) * pDist + (hash(attempt * 5.9 + sIdx * 11.3) - 0.5) * spread * 2;
      }
      if (sampleMaskB(maskTex, x, z, worldExtent) < 0.5) continue;

      dummy.position.set(x, sampleHeight(x, z), z);
      dummy.rotation.set(0, hash(attempt * 9.1 + sIdx) * Math.PI * 2, 0);
      const sc = key === 'toonShrub' ? 0.90 + hash(attempt * 15.7) * 0.42 : 0.96 + hash(attempt * 17.3) * 0.44;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      imesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    imesh.count = placed;
    imesh.instanceMatrix.needsUpdate = true;
    flowerMeshes[key] = imesh;
    instanceCounts[key] = placed;
    group.add(imesh);
  });

  const meshes = [grassMesh, ...flowerKeys.map((k) => flowerMeshes[k])];
  return {
    group,
    grassMesh,
    flowerMeshes,
    meshes,
    sharedUniforms,
    drawCalls: meshes.length,
    instanceCounts,
    worldMaskTexture: maskTex,
    update(arg1, arg2 = 0) {
      if (typeof arg1 === 'number') {
        sharedUniforms.uTime.value = arg1;
        if (arg2 && typeof arg2.x === 'number') sharedUniforms.uPlayerPos.value.copy(arg2);
      } else {
        if (arg1 && typeof arg1.x === 'number') sharedUniforms.uPlayerPos.value.copy(arg1);
        sharedUniforms.uTime.value = typeof arg2 === 'number' ? arg2 : 0;
      }
    },
    dispose() {
      meshes.forEach((m) => m.material.dispose());
      heightTexInfo.tex.dispose();
    },
  };
}

export function createMeadowDriftDemo(scene, options = {}) {
  const worldExtent = 42;
  const maskTex = createDefaultWorldMaskTexture(256, worldExtent);
  const meadow = createToroidalMeadow({
    profile: options.profile || 'demo',
    worldMaskTexture: maskTex,
    sampleHeight: defaultSampleHeight,
    worldExtent,
  });

  const groundGeo = new THREE.PlaneGeometry(worldExtent * 2, worldExtent * 2, 72, 72);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const cTurf = new THREE.Color('#4d9438'), cPath = new THREE.Color('#c8a26a'), cEdge = new THREE.Color('#86b84e');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, defaultSampleHeight(x, z));
    const roadDist = Math.abs(x - Math.sin(z * 0.09) * 3.4);
    const c = roadDist < 1.75 ? cPath : roadDist < 2.35 ? cEdge : cTurf;
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  groundGeo.computeVertexNormals();
  const groundMesh = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  groundMesh.name = 'meadow_demo_ground';

  const root = new THREE.Group();
  root.add(groundMesh);
  root.add(meadow.group);
  if (scene) scene.add(root);

  return {
    root,
    groundMesh,
    meadow,
    update(time, playerPos) {
      meadow.update(playerPos, time);
    },
  };
}
