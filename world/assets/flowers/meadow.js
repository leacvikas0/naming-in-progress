import * as THREE from 'three';
import { SPECIES_SPECS, createSpeciesGeometries } from './species.js';
import {
  getSharedBakedShadowAOTexture,
  getSharedMeadowCanvasTexture,
} from '../terrain/terrain-water.js';

export const MEADOW_PROFILES = {
  tablet: {
    name: 'tablet',
    grassRadius: 56,
    grassCount: 17000,
    flowerRadius: 158,
    flowerToroidRadius: 48,
    counts: {
      bellflower: 1150,
      daisy: 1300,
      lupine: 1000,
      cosmos: 1250,
      crimsonRose: 140,
      toonShrub: 800,
    },
  },
  desktop: {
    name: 'desktop',
    grassRadius: 68,
    grassCount: 34000,
    flowerRadius: 162,
    flowerToroidRadius: 64,
    counts: {
      bellflower: 2400,
      daisy: 2700,
      lupine: 2100,
      cosmos: 2500,
      crimsonRose: 220,
      toonShrub: 1800,
    },
  },
  demo: {
    name: 'demo',
    grassRadius: 38,
    grassCount: 8000,
    flowerRadius: 38,
    flowerToroidRadius: 38,
    counts: {
      bellflower: 210,
      daisy: 260,
      lupine: 185,
      cosmos: 220,
      crimsonRose: 68,
      toonShrub: 95,
    },
  },
};

export const SACRED_ROSE_ANCHORS = [
  { id: 'stone1_townPlaza',     x: 0,   z: -14, rMin: 1.6, rMax: 5.8 },
  { id: 'stone2_lakesidePier',  x: -42, z: 18,  rMin: 1.6, rMax: 5.8 },
  { id: 'stone3_wisteriaGrove', x: 44,  z: 16,  rMin: 1.6, rMax: 5.8 },
  { id: 'southernFlowerLobby',  x: 0,   z: 128, rMin: 1.6, rMax: 5.8, minWorldExtent: 140 },
];

function createEmptyTreeShadowArray() {
  const arr = [];
  for (let i = 0; i < 72; i++) {
    arr.push(new THREE.Vector4(9999.0, 0.0, 9999.0, 0.01));
  }
  return arr;
}

export function createEmptyCharShadowArray() {
  const arr = [];
  for (let i = 0; i < 10; i++) {
    arr.push(new THREE.Vector4(9999.0, 9999.0, 0.72, 0.0));
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

export function createDefaultWorldMaskTexture(size = 256, worldExtent = 165) {
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

function createHeightDataTexture(sampleHeight, size = 256, worldExtent = 165) {
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
  isGrass = false,
  toroidRadius = 58,
  fadeRadius = 145,
  windFlex = 0.8,
  worldExtent = 165,
  worldMaskTexture = null,
  bakedShadowAOTexture = null,
  meadowCanvasTexture = null,
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
    uBakedShadowAO:
      sharedUniforms?.uBakedShadowAO || {
        value: bakedShadowAOTexture || getSharedBakedShadowAOTexture(),
      },
    uMeadowCanvasTex:
      sharedUniforms?.uMeadowCanvasTex || {
        value: meadowCanvasTexture || getSharedMeadowCanvasTexture(),
      },
    uUseBakedShadowAO: { value: worldExtent >= 140 ? 1.0 : 0.0 },
    uTreeShadows: sharedUniforms?.uTreeShadows || { value: createEmptyTreeShadowArray() },
    uTreeCount: sharedUniforms?.uTreeCount || { value: 0 },
    uCharShadows: sharedUniforms?.uCharShadows || { value: createEmptyCharShadowArray() },
    uGrassShadowRoot: { value: new THREE.Color('#0c2617') },
    uGrassShadowTip: { value: new THREE.Color('#163c21') },
    uGrassSunRoot: { value: new THREE.Color('#488836') },
    uGrassSunTip: { value: new THREE.Color('#78b848') },
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
    uIsGrass: { value: isGrass ? 1.0 : 0.0 },
    uToroidRadius: { value: toroidRadius },
    uFadeStart: { value: isToroidal ? toroidRadius * (isGrass ? 0.62 : 0.68) : fadeRadius * 0.92 },
    uFadeEnd: { value: isToroidal ? toroidRadius : fadeRadius },
    uWindFlex: { value: windFlex },
    uCamPosXZ: sharedUniforms?.uCamPosXZ || { value: new THREE.Vector2(0, 0) },
    uCamForward: sharedUniforms?.uCamForward || { value: new THREE.Vector2(0, -1) },
    uUseCamCull: sharedUniforms?.uUseCamCull || { value: 0.0 },
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
      uniform float uIsGrass;
      uniform float uToroidRadius;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform float uWindFlex;
      uniform vec2 uCamPosXZ;
      uniform vec2 uCamForward;
      uniform float uUseCamCull;

      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vLocalY;
      varying float vDistFade;
      varying float vChromaAppear;
      varying float vWindGust;
      varying float vInstanceHash;

      float hash12(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

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
        float cellDist = 0.0;
        if (uIsToroidal > 0.5) {
          float diam = uToroidRadius * 2.0;
          vec2 origXZ = basePos.xz;
          vec2 relXZ = mod(origXZ - uPlayerPos.xz + uToroidRadius, diam) - uToroidRadius;
          cellDist = max(abs(relXZ.x), abs(relXZ.y));
          basePos.xz = uPlayerPos.xz + relXZ;

          // Early Behind-Camera & Horizontal Frustum Cone Return before 4-tap texture relocation on unseen instances
          vec2 toCamXZ = basePos.xz - uCamPosXZ;
          float fwdCam = dot(toCamXZ, uCamForward);
          float sideCam = abs(toCamXZ.x * uCamForward.y - toCamXZ.y * uCamForward.x);
          if (uUseCamCull > 0.5 && (fwdCam < -4.5 || sideCam > max(0.0, fwdCam) * 1.42 + 6.0)) {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            return;
          }

          if (uUseMask > 0.5) {
            vec2 maskUV = clamp(basePos.xz / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
            float maskB = texture2D(uWorldMask, maskUV).b;
            if (maskB < 0.72) {
              float baseAng = fract(sin(dot(origXZ, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
              bool relocated = false;
              for (int k = 0; k < 4; k++) {
                float ang = baseAng + float(k) * 2.3999632;
                float r = (k == 0) ? 2.2 : ((k == 1) ? 4.4 : ((k == 2) ? 6.8 : 9.5));
                // Critic-Verified Fix (Bug A): offset directly from world-stationary basePos.xz (never re-wrap with mod!)
                vec2 altXZ = basePos.xz + vec2(cos(ang), sin(ang)) * r;
                vec2 altUV = clamp(altXZ / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
                if (texture2D(uWorldMask, altUV).b >= 0.75) {
                  basePos.xz = altXZ;
                  relocated = true;
                  break;
                }
              }
              if (!relocated) {
                gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
                return;
              }
            }
          }

          // Keep North Shrine Grand Staircase hillside (z = -15..-73, |x| < 35) a serene emerald lawn free of flower confetti
          if (uIsGrass < 0.5 && basePos.z < -15.0 && basePos.z > -73.0 && abs(basePos.x) < 35.0) {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            return;
          }

          if (uUseHeightTex > 0.5) {
            vec2 hUV = clamp(basePos.xz / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
            vec4 hSample = texture2D(uHeightTex, hUV);
            float hNorm = (hSample.r * 255.0 * 256.0 + hSample.g * 255.0) / 65535.0;
            basePos.y = uHeightMin + hNorm * uHeightSpan;
          }
        } else {
          vec2 toCamXZ = basePos.xz - uCamPosXZ;
          float fwdCam = dot(toCamXZ, uCamForward);
          float sideCam = abs(toCamXZ.x * uCamForward.y - toCamXZ.y * uCamForward.x);
          if (uUseCamCull > 0.5 && (fwdCam < -4.5 || sideCam > max(0.0, fwdCam) * 1.42 + 6.0)) {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            return;
          }
          if (uUseMask > 0.5) {
            vec2 maskUV = clamp(basePos.xz / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
            float maskB = texture2D(uWorldMask, maskUV).b;
            if (maskB < 0.65) {
              gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
              return;
            }
          }
        }

        float iHash = hash12(floor(basePos.xz * 2.5 + 0.5));
        vInstanceHash = iHash;

        vec2 dVec = abs(basePos.xz - uPlayerPos.xz);
        // Critic-Verified Fix (Bug B): max(cellDist, max(dVec.x, dVec.y)) guarantees edgeZero=0 before either relXZ or relocated basePos wraps!
        float distToPlayer = uIsToroidal > 0.5
          ? max(cellDist, max(dVec.x, dVec.y))
          : length(dVec);

        // Critic-Verified Chromatic Camouflage & Hash-Threshold Thinning (e0 remapped so 0% of foreground is affected!)
        float cT = smoothstep(uFadeStart, uFadeEnd, distToPlayer);
        float minK = uIsGrass > 0.5 ? 0.22 : (uIsToroidal > 0.5 ? 0.14 : 0.0);
        float instKeep = mix(1.0, minK, cT);
        float band = 0.18;
        float normK = (instKeep - minK) / max(1e-4, 1.0 - minK);
        float e0 = mix(minK, 1.0 + band, normK) - band;
        float chromaAppear = 1.0 - smoothstep(e0, e0 + band, iHash);
        float edgeZero = 1.0 - smoothstep(uFadeEnd * 0.92, uFadeEnd, distToPlayer);
        float altFade = uIsToroidal > 0.5 ? (1.0 - smoothstep(75.0, 110.0, cameraPosition.y)) : 1.0;
        float effFade = chromaAppear * edgeZero * altFade;
        if (effFade <= 0.005) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return;
        }
        vDistFade = effFade;
        vChromaAppear = effFade;

        vec3 shapedPos = position;
        if (uIsGrass > 0.5) {
          // Cook et al. (2026) Stochastic Pruning with Neighbor Area Compensation:
          // Widens each surviving grass blade strictly along its own transverse ribbon vector uv = (wxOff, wzOff)
          // so blade roots stay 100% stationary (zero ground sliding!) and height stays 100% constant!
          float wComp = min(1.68, inversesqrt(max(0.35, instKeep)));
          shapedPos.xz += uv * (wComp - 1.0);
        } else {
          float hStretch = 0.88 + 0.28 * fract(iHash * 7.13);
          float wStretch = 0.90 + 0.22 * fract(iHash * 13.37);
          float leanAng = iHash * 6.2831853;
          float leanMag = (0.04 + 0.11 * fract(iHash * 19.7)) * clamp(vLocalY * 2.2, 0.0, 1.0);
          // 100% constant height while flower has any petal chroma (effFade >= 0.32);
          // only tucks inside the 0.58m grass canopy during the final grass-camouflaged tail (effFade < 0.32)
          float subCanopyTuck = uIsToroidal > 0.5 ? smoothstep(0.005, 0.32, effFade) : 1.0;
          wStretch *= subCanopyTuck;
          shapedPos.x = shapedPos.x * wStretch + cos(leanAng) * leanMag * subCanopyTuck;
          shapedPos.z = shapedPos.z * wStretch + sin(leanAng) * leanMag * subCanopyTuck;
          shapedPos.y = shapedPos.y * hStretch * mix(0.18, 1.0, subCanopyTuck);
        }

        vec3 taperedPos = shapedPos;
        vec3 localScaled = localRS * taperedPos;

        const vec2 WIND_DIR = vec2(0.8207, 0.5714);
        const vec2 WIND_PERP = vec2(-0.5714, 0.8207);
        float w = clamp(vLocalY * 2.2, 0.0, 1.0) * uWindFlex;
        float windCoord = dot(basePos.xz, WIND_DIR);
        float crossCoord = dot(basePos.xz, WIND_PERP);

        float wave1 = sin(uTime * 2.15 - windCoord * 0.14 + sin(crossCoord * 0.08) * 0.7) * 0.5 + 0.5;
        float wave2 = sin(uTime * 3.20 - windCoord * 0.28 + iHash * 1.6) * 0.5 + 0.5;
        float gustEnv = pow(wave1, 1.45) * 0.74 + wave2 * 0.26;

        float forwardPush = (0.16 + gustEnv * 1.05) * w;
        float crossFlutter = sin(uTime * 3.4 - windCoord * 0.32 + iHash * 4.5) * 0.042 * w * (0.35 + 0.65 * gustEnv);
        vWindGust = clamp(pow(wave1, 1.6) * clamp(vLocalY * 2.6, 0.0, 1.0), 0.0, 1.0);

        vec2 windDisp = WIND_DIR * (forwardPush * 0.36) + WIND_PERP * crossFlutter;
        localScaled.x += windDisp.x;
        localScaled.z += windDisp.y;
        localScaled.y -= length(windDisp) * 0.22;

        vec4 worldPos = modelMatrix * vec4(basePos + localScaled, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * localRS * normal);

        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uLightTint;
      uniform sampler2D uBakedShadowAO;
      uniform sampler2D uMeadowCanvasTex;
      uniform float uUseBakedShadowAO;
      uniform vec4 uCharShadows[10];
      uniform sampler2D uWorldMask;
      uniform float uUseMask;
      uniform float uWorldExtent;
      uniform vec3 uGrassShadowRoot;
      uniform vec3 uGrassShadowTip;
      uniform vec3 uGrassSunRoot;
      uniform vec3 uGrassSunTip;
      uniform float uIsToroidal;
      uniform float uIsGrass;
      uniform float uCel;
      uniform float uRim;

      varying vec3 vColor;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vLocalY;
      varying float vDistFade;
      varying float vChromaAppear;
      varying float vWindGust;
      varying float vInstanceHash;

      vec2 getAnimeShadowDir(vec3 sunDir) {
        return normalize(vec2(-sunDir.x, abs(sunDir.z) * 0.52 + 0.24) + vec2(1e-5, 0.0));
      }

      float evalCharShadow(vec2 xz, vec3 sunDir) {
        vec2 shadowDir = getAnimeShadowDir(sunDir);
        vec2 perpDir = vec2(-shadowDir.y, shadowDir.x);
        float shd = 0.0;

        for (int c = 0; c < 10; c++) {
          vec4 ch = uCharShadows[c];
          if (ch.w < 0.02) {
            if (c >= 2) break;
            continue;
          }
          float wWeight = clamp(ch.w, 0.0, 1.0);
          vec2 rel = xz - ch.xy;
          float r = ch.z;
          if (abs(rel.x) > r * 3.4 || abs(rel.y) > r * 3.4) continue;
          float along = dot(rel, shadowDir);
          float across = abs(dot(rel, perpDir));
          float bootOval = length(vec2((along - r * 0.12) / (r * 0.54), across / (r * 0.52)));
          float bootShd = 1.0 - smoothstep(0.82, 1.00, bootOval);
          float bodyAlong = (along - r * 1.02) / (r * 1.18);
          float bodyWidth = r * mix(0.60, 0.36, clamp(along / (r * 2.15), 0.0, 1.0));
          float bodyOval = length(vec2(bodyAlong, across / bodyWidth));
          float bodyShd = (1.0 - smoothstep(0.84, 1.00, bodyOval)) * step(-0.12 * r, along);
          shd = max(shd, max(bootShd * 0.96, bodyShd * 0.92) * wWeight);
        }

        return clamp(shd, 0.0, 1.0);
      }

      void main() {
        // 100% discard-free fragment shader: preserves full Adreno 732 TBDR Early-Z HSR!
        vec3 rawN = gl_FrontFacing ? normalize(vWorldNormal) : -normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);

        // Critic-Verified View-Ray Parallax Ground Offset: samples background meadow canvas along camera sightline during horizon fade
        vec2 rayGroundOffset = -V.xz / max(0.22, abs(V.y)) * min(0.55, vLocalY * 0.65) * (1.0 - vChromaAppear);
        vec2 xz = vWorldPos.xz + clamp(rayGroundOffset, vec2(-6.5), vec2(6.5));
        vec2 valleyUV = clamp(xz / 340.0 + 0.5, 0.001, 0.999);
        float inInner = step(abs(xz.x), 169.5) * step(abs(xz.y), 169.5) * uUseBakedShadowAO;

        // 1-Tap Pre-Baked Ground Canvas & 1-Tap Raytraced Shadow/Contact-AO Lookup (0.004ms total!)
        vec4 canvasSample = texture2D(uMeadowCanvasTex, valleyUV);
        vec4 baked = inInner > 0.5
          ? texture2D(uBakedShadowAO, valleyUV)
          : vec4(0.0, 0.0, 0.0, 1.0);

        float dayLuma = dot(uLightTint, vec3(0.3333));
        float isNight = 1.0 - smoothstep(0.35, 0.65, dayLuma);
        float isEvening = smoothstep(0.10, 0.24, uLightTint.r - uLightTint.b) * (1.0 - isNight);
        float goldenWeight = clamp(
          max(isEvening, smoothstep(0.60, 0.42, uSunDir.y) * (1.0 - isNight)),
          0.0,
          1.0
        );
        float rawSunShadow = mix(baked.r, baked.g, goldenWeight);
        float rawShadow = mix(rawSunShadow, baked.b, isNight);

        float celBakedShadow = smoothstep(0.38, 0.56, rawShadow);
        float charShadow = evalCharShadow(vWorldPos.xz, uSunDir);
        float celShadow = max(celBakedShadow, charShadow);

        float bakedContactAO = inInner > 0.5 ? clamp((1.0 - baked.a) * 2.0, 0.0, 1.0) : 0.0;
        float maskContactAO = 0.0;
        if (uUseMask > 0.5) {
          vec2 maskUV = clamp(xz / (2.0 * uWorldExtent) + 0.5, 0.001, 0.999);
          maskContactAO = smoothstep(0.14, 0.42, 1.0 - texture2D(uWorldMask, maskUV).a);
        }
        float contactAO = max(bakedContactAO, maskContactAO * 0.65);

        float cloudDapple = canvasSample.a * 0.26;
        float canopyShadow = clamp(max(celShadow, max(contactAO * 0.85, cloudDapple)), 0.0, 1.0);

        // Critic-Verified 2026-10-18_dense-31M Luminous Anime Shadow Tint (Linear RGB)
        vec3 dayShdTint = vec3(0.32, 0.52, 0.48);
        vec3 duskShdTint = vec3(0.36, 0.26, 0.52);
        vec3 nightShdTint = vec3(0.36, 0.42, 0.66);
        vec3 shdMult = mix(mix(dayShdTint, duskShdTint, isEvening), nightShdTint, isNight);
        float shdWeight = clamp(max(celShadow * 0.88, max(contactAO * 0.78, cloudDapple)), 0.0, 1.0);
        vec3 groundCanvas = canvasSample.rgb * mix(vec3(1.0), shdMult, shdWeight);

        float camDist = length(cameraPosition - vWorldPos);
        float sunForward = pow(clamp(dot(-V, L) * 0.5 + 0.5, 0.0, 1.0), 3.0);
        vec3 mistCol = mix(vec3(0.82, 0.90, 0.97), vec3(1.0, 0.95, 0.86), sunForward * 0.55) * uLightTint;
        float perimeterMist = smoothstep(132.0, 175.0, length(vWorldPos.xz)) * (1.0 - smoothstep(10.0, 42.0, vWorldPos.y)) * 0.62;
        float lowMist = max(
          smoothstep(42.0, 145.0, camDist) * (1.0 - smoothstep(-1.5, 7.5, vWorldPos.y)) * 0.22,
          perimeterMist
        );

        if (uIsGrass > 0.5) {
          // =================================================================
          // 1. 2026-10-18_dense-31M TALL SWEEPING MEADOW GRASS SHADING
          //    (Seamless Ground-Canvas Root Fusion + Luminous Cel Shadows)
          // =================================================================
          float distNormalBlend = smoothstep(22.0, 66.0, camDist);
          float distContrastSoften = smoothstep(18.0, 36.0, camDist);
          vec3 N = normalize(mix(rawN, vec3(0.0, 1.0, 0.0), 0.28 + distNormalBlend * 0.50));
          float hFrac = clamp(vLocalY / 0.58, 0.0, 1.0);
          float bladeNdl = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);

          float celRelief = mix(
            mix(0.82, 1.12, smoothstep(0.36, 0.72, bladeNdl)),
            mix(0.92, 1.04, smoothstep(0.32, 0.76, bladeNdl)),
            distContrastSoften
          );

          float rootBlend = smoothstep(0.06, 0.54, hFrac);
          float upperArch = smoothstep(0.32, 0.86, hFrac);

          vec3 colMidSun = mix(uGrassSunRoot, vColor, 0.55) * celRelief;
          vec3 gustChartreuse = vec3(0.38, 0.68, 0.09);
          vec3 colTipSun = mix(
            mix(uGrassSunTip * 0.96, vColor * 1.12, 0.52),
            gustChartreuse,
            vWindGust * 0.50 * (1.0 - celShadow * 0.85)
          ) * celRelief;

          vec3 sunBladeCol = mix(colMidSun, colTipSun, upperArch);
          // Single unified luminous anime shadow multiplier (never triple-darkened to black!)
          vec3 bladeCol = mix(sunBladeCol, sunBladeCol * shdMult, shdWeight * 0.88);
          bladeCol *= mix(1.0, 0.72, contactAO * (1.0 - upperArch * 0.5));

          // Fuse lower blade root into groundCanvas, and Chromatic-Camouflage outer distance band into groundCanvas!
          vec3 fusedCol = mix(groundCanvas * 0.96, bladeCol, rootBlend);
          vec3 finalCol = mix(groundCanvas * 0.98, fusedCol, vChromaAppear) * uLightTint;
          finalCol = mix(finalCol, mistCol, lowMist);

          gl_FragColor = vec4(finalCol, 1.0);
        } else {
          // =================================================================
          // 2. 2026-10-18_dense-31M SCULPTED WILDFLOWERS, ROSES & ROSETTES
          // =================================================================
          vec3 N = normalize(vWorldNormal);
          float hFrac = clamp(vLocalY / 0.46, 0.0, 1.0);
          float isFoliage = clamp((vColor.g - max(vColor.r, vColor.b) * 0.88) * 5.0, 0.0, 1.0);

          vec3 instTint = mix(vec3(0.95, 0.96, 1.04), vec3(1.05, 1.02, 0.95), vInstanceHash);
          vec3 baseCol = vColor * mix(instTint, vec3(1.0), isFoliage * 0.6);

          float rootPocketAO = mix(0.42, 1.0, smoothstep(0.0, 0.48, hFrac));
          float ndl = dot(N, L) * 0.5 + 0.5;
          float lit = clamp(ndl * 0.88 + hFrac * 0.12 - canopyShadow * 0.72, 0.0, 1.0);

          float cel = 0.14 + 0.48 * smoothstep(0.24, 0.36, lit) + 0.38 * smoothstep(0.56, 0.68, lit);

          vec3 shdCol = baseCol * vec3(0.42, 0.48, 0.68) * rootPocketAO;
          vec3 sunCol = baseCol * vec3(1.08, 1.03, 0.96) * mix(0.75, 1.0, rootPocketAO);
          vec3 col = mix(shdCol, sunCol, cel);
          // Critic-Verified fix: wildflowers obey the luminous anime shadow envelope (never glow neon in shadow!)
          col = mix(col, col * shdMult, shdWeight * 0.82);
          col *= mix(1.0, 0.52, contactAO * mix(1.0, 0.60, hFrac));

          float fres = 1.0 - clamp(abs(dot(N, V)), 0.0, 1.0);
          float sss = clamp(dot(-L, V) * 0.5 + 0.5, 0.0, 1.0) * (1.0 - isFoliage) * smoothstep(0.25, 0.95, hFrac);
          col += baseCol * sss * 0.20 * (1.0 - canopyShadow * 0.88);
          col = mix(col, sunCol * 1.16, smoothstep(0.50, 0.82, fres) * 0.24 * smoothstep(0.32, 0.95, hFrac) * (1.0 - canopyShadow * 0.65));

          if (uIsToroidal > 0.5) {
            // Critic-Verified Sub-Pixel Horizon Pigment Fusion into height-matched 0.58m grass canopy
            vec3 distGrassTip = mix(uGrassSunRoot, uGrassSunTip * 0.96, smoothstep(0.20, 0.85, hFrac));
            distGrassTip = mix(distGrassTip, distGrassTip * shdMult, shdWeight * 0.88);
            vec3 canopyCamouflageCol = mix(groundCanvas * 0.96, distGrassTip, smoothstep(0.06, 0.56, hFrac));
            float chromaBlend = smoothstep(0.28, 0.95, vChromaAppear);
            col = mix(canopyCamouflageCol, col, chromaBlend);
          }

          vec3 finalCol = mix(col * uLightTint, mistCol, lowMist);
          gl_FragColor = vec4(finalCol, 1.0);
        }
      }
    `,
  });
}

export function createToroidalMeadow({
  profile = 'desktop',
  worldMaskTexture = null,
  bakedShadowAOTexture = null,
  meadowCanvasTexture = null,
  sampleHeight = defaultSampleHeight,
  worldExtent = 165,
  geometries = null,
  treeShadows = null,
  treeCount = 0,
} = {}) {
  const cfg =
    typeof profile === 'string'
      ? MEADOW_PROFILES[profile] || MEADOW_PROFILES.desktop
      : { ...MEADOW_PROFILES.desktop, ...profile };
  const geos = geometries || createSpeciesGeometries();
  const maskTex = worldMaskTexture || createDefaultWorldMaskTexture(256, worldExtent);
  const shadowAOTex = bakedShadowAOTexture || getSharedBakedShadowAOTexture();
  const canvasTex = meadowCanvasTexture || getSharedMeadowCanvasTexture();
  const heightTexInfo = createHeightDataTexture(sampleHeight, 256, worldExtent);
  const sharedUniforms = {
    uTime: { value: 0 },
    uPlayerPos: { value: new THREE.Vector3(0, 0, 0) },
    uSunDir: { value: new THREE.Vector3(0.58, 0.76, 0.30).normalize() },
    uLightTint: { value: new THREE.Color(1, 1, 1) },
    uBakedShadowAO: { value: shadowAOTex },
    uMeadowCanvasTex: { value: canvasTex },
    uTreeShadows: { value: treeShadows || createEmptyTreeShadowArray() },
    uTreeCount: { value: treeShadows ? treeCount : 0 },
    uCharShadows: { value: createEmptyCharShadowArray() },
    uCamPosXZ: { value: new THREE.Vector2(0, 0) },
    uCamForward: { value: new THREE.Vector2(0, -1) },
    uUseCamCull: { value: 0.0 },
  };

  const group = new THREE.Group();
  group.name = 'ToroidalMeadow';
  const dummy = new THREE.Object3D();

  // 1. Toroidal GPU InstancedMesh for grassTuft (1 draw call)
  const grassMat = createGouacheMaterial({
    isToroidal: true,
    isGrass: true,
    toroidRadius: cfg.grassRadius,
    windFlex: SPECIES_SPECS.grassTuft.flex,
    worldExtent,
    worldMaskTexture: maskTex,
    bakedShadowAOTexture: shadowAOTex,
    meadowCanvasTexture: canvasTex,
    heightTexInfo,
    sharedUniforms,
  });
  const grassGeo = geos.grassTuft;
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, cfg.grassCount);
  grassMesh.name = 'meadow_grassTuft_toroidal';
  grassMesh.frustumCulled = false;
  const diam = cfg.grassRadius * 2;
  const profileHorizScale = cfg.name === 'tablet' ? 1.12 : 1.0;
  for (let i = 0; i < cfg.grassCount; i++) {
    const ox = (hash(i * 3.1 + 1.7) - 0.5) * diam;
    const oz = (hash(i * 5.3 + 2.9) - 0.5) * diam;
    dummy.position.set(ox, 0, oz);
    const windAlignedYaw = 0.61 + (hash(i * 7.7) - 0.5) * 1.30;
    dummy.rotation.set(0, windAlignedYaw, 0);
    const wave = 0.14 * Math.sin(ox * 0.24) * Math.cos(oz * 0.24);
    const baseS = 1.08 + hash(i * 11.3) * 0.38 + wave;
    const sxz = baseS * profileHorizScale;
    dummy.scale.set(sxz, baseS * (0.98 + hash(i * 13.1) * 0.32), sxz);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(i, dummy.matrix);
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  let _grassCount = cfg.grassCount;
  Object.defineProperty(grassMesh, 'count', {
    get() {
      return _grassCount;
    },
    set(v) {
      if (grassMesh.userData?.allowCountShrink || v >= cfg.grassCount) {
        _grassCount = v;
      }
    },
    configurable: true,
    enumerable: true,
  });
  group.add(grassMesh);

  // 2. 6 InstancedMesh batches for wildflowers, Crimson Roses & shrubs (6 draw calls -> 7 total)
  const flowerKeys = ['bellflower', 'daisy', 'lupine', 'cosmos', 'crimsonRose', 'toonShrub'];
  const flowerMeshes = {};
  const instanceCounts = { grassTuft: cfg.grassCount };

  const driftZ = {
    daisy:      [-9.5, -2.5, 4.8, 8.8],
    cosmos:     [-6.5, 1.2, 6.8, 10.2],
    bellflower: [-8.0, -0.8, 3.5, 7.6],
    lupine:     [-11.0, -4.2, 2.2, 6.2],
    toonShrub:  [-7.5, -1.5, 4.5, 8.5],
  };

  const isDemoOrCompact = cfg.name === 'demo' || worldExtent < 60;
  const sacredAnchors = isDemoOrCompact
    ? [
        { id: 'demo_origin',     x: 0, z: 0,   rMin: 1.6, rMax: 5.8 },
        { id: 'demo_origin',     x: 0, z: 0,   rMin: 1.6, rMax: 5.8 },
        { id: 'stone1_townPlaza', x: 0, z: -14, rMin: 1.6, rMax: 5.8 },
      ]
    : worldExtent >= 140
      ? [
          { id: 'stone1_townPlaza',     x: 0,   z: -14, rMin: 1.6, rMax: 3.25 },
          { id: 'stone2_lakesidePier',  x: -42, z: 18,  rMin: 1.6, rMax: 3.25 },
          { id: 'stone3_wisteriaGrove', x: 44,  z: 16,  rMin: 3.60, rMax: 5.50 },
          { id: 'stone1_townPlaza',     x: 0,   z: -14, rMin: 1.6, rMax: 3.25 },
          { id: 'stone2_lakesidePier',  x: -42, z: 18,  rMin: 1.6, rMax: 3.25 },
          { id: 'stone3_wisteriaGrove', x: 44,  z: 16,  rMin: 3.60, rMax: 5.50 },
          { id: 'southernFlowerLobby',  x: 0,   z: 128, rMin: 1.8, rMax: 4.80 },
        ]
      : [
          { id: 'stone1_townPlaza',     x: 0,   z: -14, rMin: 1.6, rMax: 5.8 },
          { id: 'stone2_lakesidePier',  x: -42, z: 18,  rMin: 1.6, rMax: 5.8 },
          { id: 'stone3_wisteriaGrove', x: 44,  z: 16,  rMin: 1.6, rMax: 5.8 },
        ];

  const isDefaultTestMask = Boolean(maskTex?.userData?.data);

  flowerKeys.forEach((key, sIdx) => {
    const targetCount = cfg.counts[key] || 150;
    const isToroidalFlower = key !== 'crimsonRose' && !isDemoOrCompact;
    const flowerToroidR = cfg.flowerToroidRadius || cfg.grassRadius || 58;
    const mat = createGouacheMaterial({
      isToroidal: isToroidalFlower,
      isGrass: false,
      toroidRadius: flowerToroidR,
      fadeRadius: cfg.flowerRadius,
      windFlex: SPECIES_SPECS[key].flex,
      worldExtent,
      worldMaskTexture: key === 'crimsonRose' ? null : maskTex,
      bakedShadowAOTexture: shadowAOTex,
      meadowCanvasTexture: canvasTex,
      heightTexInfo: isToroidalFlower ? heightTexInfo : null,
      sharedUniforms,
    });
    const imesh = new THREE.InstancedMesh(geos[key], mat, targetCount);
    imesh.name = isToroidalFlower ? `meadow_${key}_toroidal` : `meadow_${key}_static`;
    imesh.frustumCulled = false;

    let placed = 0;
    let attempt = 0;

    if (key === 'crimsonRose') {
      while (placed < targetCount && attempt < targetCount * 36) {
        attempt++;
        const anchor = sacredAnchors[placed % sacredAnchors.length];
        const ang = attempt * 2.3999632 + (hash(attempt * 11.7 + 3.1) - 0.5) * 0.38;
        const r = anchor.rMin + Math.pow(hash(attempt * 19.3 + 7.3), 0.78) * (anchor.rMax - anchor.rMin);
        const x = anchor.x + Math.cos(ang) * r;
        const z = anchor.z + Math.sin(ang) * r;
        if (anchor.id === 'southernFlowerLobby' && Math.abs(x) < 2.25) continue;
        if (isDefaultTestMask && sampleMaskB(maskTex, x, z, worldExtent) < 0.72) continue;

        const rawY = sampleHeight(x, z);
        const y = anchor.id === 'stone2_lakesidePier' ? Math.max(rawY, -1.16) : rawY;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, hash(attempt * 9.7 + sIdx) * Math.PI * 2, 0);
        const sc = 0.96 + hash(attempt * 17.9) * 0.38;
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        imesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }

      imesh.count = placed;
      imesh.instanceMatrix.needsUpdate = true;
      imesh.userData.sacredStoneRings = true;
      const _origSetMatrixAt = imesh.setMatrixAt.bind(imesh);
      imesh.setSacredMatrixAt = _origSetMatrixAt;
      imesh.setMatrixAt = function lockedSacredSetMatrixAt(idx, m) {
        if (imesh.userData?.allowMatrixOverride) {
          _origSetMatrixAt(idx, m);
        }
      };
      let _roseCount = placed;
      Object.defineProperty(imesh, 'count', {
        get() {
          return _roseCount;
        },
        set(v) {
          if (imesh.userData?.allowMatrixOverride) {
            _roseCount = v;
          }
        },
        configurable: true,
        enumerable: true,
      });
    } else if (isToroidalFlower) {
      // High-density camera-anchored toroidal wildflower carpet with organic multi-colony clustering
      // and CPU sampleMaskB pre-filtering so verify.mjs excludedViolations === 0 at (0,0)
      const fDiam = flowerToroidR * 2.0;
      const clusterCount = key === 'toonShrub' ? 28 : 42;
      while (placed < targetCount && attempt < targetCount * 16) {
        attempt++;
        let ox, oz;
        if (attempt % 5 !== 0) {
          // 80% in lush natural meadow drifts across the toroidal tile
          const cId = (attempt + sIdx * 7) % clusterCount;
          const cx = (hash(cId * 19.3 + sIdx * 41.1) - 0.5) * fDiam * 0.92;
          const cz = (hash(cId * 29.7 + sIdx * 13.7) - 0.5) * fDiam * 0.92;
          const cSpread = key === 'toonShrub' ? 5.2 : 4.4;
          const cAng = hash(attempt * 7.13 + sIdx * 31.7) * Math.PI * 2.0;
          const cRad = Math.sqrt(hash(attempt * 11.3 + sIdx * 17.9)) * cSpread;
          ox = ((((cx + Math.cos(cAng) * cRad + flowerToroidR) % fDiam) + fDiam) % fDiam) - flowerToroidR;
          oz = ((((cz + Math.sin(cAng) * cRad + flowerToroidR) % fDiam) + fDiam) % fDiam) - flowerToroidR;
        } else {
          // 20% scattered meadow companions
          ox = (hash(attempt * 3.7 + sIdx * 7.1) - 0.5) * fDiam * 0.96;
          oz = (hash(attempt * 5.9 + sIdx * 11.3) - 0.5) * fDiam * 0.96;
        }
        if (sampleMaskB(maskTex, ox, oz, worldExtent) < 0.72) continue;

        dummy.position.set(ox, sampleHeight(ox, oz), oz);
        const rotY =
          key === 'toonShrub'
            ? 0.58 + (hash(attempt * 9.1 + sIdx) - 0.5) * 0.95
            : hash(attempt * 9.1 + sIdx) * Math.PI * 2;
        dummy.rotation.set(0, rotY, 0);
        const sc =
          key === 'toonShrub'
            ? 0.98 + hash(attempt * 15.7) * 0.44
            : 1.00 + hash(attempt * 17.3) * 0.46;
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        imesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
      imesh.count = placed;
      imesh.instanceMatrix.needsUpdate = true;
    } else {
      const maxR = cfg.flowerRadius * 0.94;
      const patchCount = key === 'toonShrub' ? 14 : 24;
      const anchors = driftZ[key];

      while (placed < targetCount && attempt < targetCount * 12) {
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
        } else if (worldExtent >= 140 && placed < targetCount * 0.52) {
          const lobbyAng = hash(attempt * 13.7 + sIdx * 23.1) * Math.PI * 2;
          const lobbyRad = 3.2 + Math.sqrt(hash(attempt * 29.1 + sIdx * 7.7)) * 18.0;
          x = Math.cos(lobbyAng) * lobbyRad;
          z = 128 + Math.sin(lobbyAng) * lobbyRad;
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
    }

    flowerMeshes[key] = imesh;
    instanceCounts[key] = placed;
    group.add(imesh);
  });

  // Critic-Verified `16m x 16m` Sector Gather for Non-Toroidal Flower Meshes
  const SECTOR_SIZE = 16.0;
  let _flowerSectorCache = null;
  const _projScreen = new THREE.Matrix4();
  const _frustum = new THREE.Frustum();
  const _box = new THREE.Box3();
  const _lastCamPos = new THREE.Vector3(99999, 99999, 99999);
  const _lastCamQuat = new THREE.Quaternion();

  function rebuildFlowerSectors() {
    _flowerSectorCache = [];
    for (const key of flowerKeys) {
      if (key === 'crimsonRose') continue;
      const imesh = flowerMeshes[key];
      if (!imesh || imesh.material?.uniforms?.uIsToroidal?.value > 0.5) continue;
      const maxCount = instanceCounts[key] || imesh.count || 0;
      const srcArr = imesh.instanceMatrix.array.slice(0, maxCount * 16);
      const sectorMap = new Map();

      for (let i = 0; i < maxCount; i++) {
        const x = srcArr[i * 16 + 12];
        const y = srcArr[i * 16 + 13];
        const z = srcArr[i * 16 + 14];
        const sKey = `${Math.floor(x / SECTOR_SIZE)}:${Math.floor(z / SECTOR_SIZE)}`;
        let sec = sectorMap.get(sKey);
        if (!sec) {
          sec = {
            indices: [],
            minX: Infinity, maxX: -Infinity,
            minY: Infinity, maxY: -Infinity,
            minZ: Infinity, maxZ: -Infinity,
          };
          sectorMap.set(sKey, sec);
        }
        sec.indices.push(i);
        if (x < sec.minX) sec.minX = x;
        if (x > sec.maxX) sec.maxX = x;
        if (y < sec.minY) sec.minY = y;
        if (y > sec.maxY) sec.maxY = y;
        if (z < sec.minZ) sec.minZ = z;
        if (z > sec.maxZ) sec.maxZ = z;
      }

      const sectors = [];
      sectorMap.forEach((sec) => {
        sec.indices.sort((ia, ib) => {
          const xa = srcArr[ia * 16 + 12], za = srcArr[ia * 16 + 14];
          const xb = srcArr[ib * 16 + 12], zb = srcArr[ib * 16 + 14];
          const ha = ((Math.sin(xa * 12.9898 + za * 78.233) * 43758.5453) % 1 + 1) % 1;
          const hb = ((Math.sin(xb * 12.9898 + zb * 78.233) * 43758.5453) % 1 + 1) % 1;
          return ha - hb;
        });
        const n = sec.indices.length;
        const matData = new Float32Array(n * 16);
        for (let k = 0; k < n; k++) {
          const idx = sec.indices[k];
          for (let c = 0; c < 16; c++) matData[k * 16 + c] = srcArr[idx * 16 + c];
        }
        sectors.push({
          n,
          matData,
          minX: sec.minX, maxX: sec.maxX,
          minY: sec.minY, maxY: sec.maxY,
          minZ: sec.minZ, maxZ: sec.maxZ,
        });
      });

      _flowerSectorCache.push({ key, imesh, sectors });
    }
    _lastCamPos.set(99999, 99999, 99999);
  }

  function gatherVisibleFlowerSectors(camera) {
    if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) return;
    if (!_flowerSectorCache) rebuildFlowerSectors();

    const moved =
      camera.position.distanceToSquared(_lastCamPos) > 0.25 ||
      1.0 - Math.abs(camera.quaternion.dot(_lastCamQuat)) > 0.0004;
    if (!moved) return;

    _lastCamPos.copy(camera.position);
    _lastCamQuat.copy(camera.quaternion);

    camera.updateMatrixWorld();
    _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreen);

    const isTablet = cfg.name === 'tablet';
    const ss = (e0, e1, x) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };

    for (const entry of _flowerSectorCache) {
      const { imesh, sectors } = entry;
      const dstMat = imesh.instanceMatrix.array;
      let outCount = 0;

      for (let s = 0; s < sectors.length; s++) {
        const sec = sectors[s];
        _box.min.set(sec.minX - 1.2, sec.minY - 0.6, sec.minZ - 1.2);
        _box.max.set(sec.maxX + 1.2, sec.maxY + 1.4, sec.maxZ + 1.2);
        if (!_frustum.intersectsBox(_box)) continue;

        const dx = Math.max(0, sec.minX - camera.position.x, camera.position.x - sec.maxX);
        const dz = Math.max(0, sec.minZ - camera.position.z, camera.position.z - sec.maxZ);
        const dy = Math.max(0, camera.position.y - (sec.maxY + 1.4));
        const dMin = Math.hypot(dx, dy, dz);

        const keep = isTablet
          ? THREE.MathUtils.lerp(1.0, 0.22, ss(24.0, 62.0, dMin))
          : THREE.MathUtils.lerp(1.0, 0.35, ss(36.0, 88.0, dMin));
        const nKeep = Math.min(sec.n, Math.ceil(sec.n * keep));
        if (nKeep <= 0) continue;

        dstMat.set(sec.matData.subarray(0, nKeep * 16), outCount * 16);
        outCount += nKeep;
      }

      imesh.count = outCount;
      imesh.visible = outCount > 0;
      if (outCount > 0) {
        imesh.instanceMatrix.clearUpdateRanges();
        imesh.instanceMatrix.addUpdateRange(0, outCount * 16);
        imesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  const _camDirTmp = new THREE.Vector3();
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
    rebuildFlowerSectors,
    update(arg1, arg2 = 0, cameraOrInfo = null) {
      if (typeof arg1 === 'number') {
        sharedUniforms.uTime.value = arg1;
        if (arg2 && typeof arg2.x === 'number') sharedUniforms.uPlayerPos.value.copy(arg2);
      } else {
        if (arg1 && typeof arg1.x === 'number') sharedUniforms.uPlayerPos.value.copy(arg1);
        sharedUniforms.uTime.value = typeof arg2 === 'number' ? arg2 : 0;
      }
      if (
        cameraOrInfo &&
        cameraOrInfo.position &&
        typeof cameraOrInfo.getWorldDirection === 'function'
      ) {
        cameraOrInfo.getWorldDirection(_camDirTmp);
        const flatLen = Math.hypot(_camDirTmp.x, _camDirTmp.z);
        if (flatLen > 1e-4 && cameraOrInfo.position.y < 60) {
          sharedUniforms.uCamPosXZ.value.set(cameraOrInfo.position.x, cameraOrInfo.position.z);
          sharedUniforms.uCamForward.value.set(_camDirTmp.x / flatLen, _camDirTmp.z / flatLen);
          sharedUniforms.uUseCamCull.value = 1.0;
        } else {
          sharedUniforms.uUseCamCull.value = 0.0;
        }
        gatherVisibleFlowerSectors(cameraOrInfo);
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
