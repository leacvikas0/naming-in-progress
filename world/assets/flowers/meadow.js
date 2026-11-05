import * as THREE from 'three';
import { SPECIES_SPECS, createSpeciesGeometries } from './species.js';

export const MEADOW_PROFILES = {
  tablet: {
    name: 'tablet',
    grassRadius: 56,
    grassCount: 17000,
    flowerRadius: 158,
    counts: {
      bellflower: 210,
      daisy: 260,
      lupine: 180,
      cosmos: 220,
      crimsonRose: 140,
      toonShrub: 140,
    },
  },
  desktop: {
    name: 'desktop',
    grassRadius: 68,
    grassCount: 34000,
    flowerRadius: 162,
    counts: {
      bellflower: 620,
      daisy: 740,
      lupine: 520,
      cosmos: 640,
      crimsonRose: 220,
      toonShrub: 380,
    },
  },
  demo: {
    name: 'demo',
    grassRadius: 38,
    grassCount: 8000,
    flowerRadius: 38,
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
  for (let i = 0; i < 8; i++) {
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
  toroidRadius = 58,
  fadeRadius = 145,
  windFlex = 0.8,
  worldExtent = 165,
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
    uToroidRadius: { value: toroidRadius },
    uFadeStart: { value: isToroidal ? toroidRadius * 0.92 : fadeRadius * 0.96 },
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
        if (uIsToroidal > 0.5) {
          float diam = uToroidRadius * 2.0;
          vec2 origXZ = basePos.xz;
          vec2 relXZ = mod(origXZ - uPlayerPos.xz + uToroidRadius, diam) - uToroidRadius;
          basePos.xz = uPlayerPos.xz + relXZ;

          // Early Behind-Camera Frustum Discard before 4-tap texture relocation on unseen back-half instances
          if (uUseCamCull > 0.5 && dot(basePos.xz - uCamPosXZ, uCamForward) < -4.5) {
            culled = 1.0;
          }

          if (culled < 0.5 && uUseMask > 0.5) {
            vec2 maskUV = clamp(basePos.xz / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
            float maskB = texture2D(uWorldMask, maskUV).b;
            if (maskB < 0.72) {
              // 4-tap golden-angle spiral relocation (r = 2.2m, 4.4m, 6.8m, 9.5m)
              float baseAng = fract(sin(dot(origXZ, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
              bool relocated = false;
              for (int k = 0; k < 4; k++) {
                float ang = baseAng + float(k) * 2.3999632;
                float r = (k == 0) ? 2.2 : ((k == 1) ? 4.4 : ((k == 2) ? 6.8 : 9.5));
                vec2 altXZ = uPlayerPos.xz + (mod(origXZ + vec2(cos(ang), sin(ang)) * r - uPlayerPos.xz + uToroidRadius, diam) - uToroidRadius);
                vec2 altUV = clamp(altXZ / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
                if (texture2D(uWorldMask, altUV).b >= 0.75) {
                  basePos.xz = altXZ;
                  relocated = true;
                  break;
                }
              }
              if (!relocated) {
                culled = 1.0;
              }
            }
          }

          if (culled < 0.5 && uUseHeightTex > 0.5) {
            vec2 hUV = clamp(basePos.xz / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
            vec4 hSample = texture2D(uHeightTex, hUV);
            float hNorm = (hSample.r * 255.0 * 256.0 + hSample.g * 255.0) / 65535.0;
            basePos.y = uHeightMin + hNorm * uHeightSpan;
          }
        } else {
          if (uUseCamCull > 0.5 && dot(basePos.xz - uCamPosXZ, uCamForward) < -4.5) {
            culled = 1.0;
          }
          if (culled < 0.5 && uUseMask > 0.5) {
            vec2 maskUV = clamp(basePos.xz / (2.0 * uWorldExtent) + 0.5, 0.0, 1.0);
            float maskB = texture2D(uWorldMask, maskUV).b;
            if (maskB < 0.65) culled = 1.0;
          }
        }

        float iHash = hash12(floor(basePos.xz * 2.5 + 0.5));
        vInstanceHash = iHash;

        vec2 dVec = abs(basePos.xz - uPlayerPos.xz);
        float distToPlayer = uIsToroidal > 0.5
          ? max(dVec.x, dVec.y)
          : length(dVec);
        float distFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distToPlayer);
        float altFade = uIsToroidal > 0.5 ? (1.0 - smoothstep(75.0, 110.0, cameraPosition.y)) : 1.0;
        float effFade = distFade * altFade;
        if (effFade <= 0.005) culled = 1.0;
        vDistFade = effFade;

        vec3 shapedPos = position;
        if (uIsToroidal < 0.5) {
          // Per-instance organic de-symmetrization for 3D flowers & shrubs:
          // non-uniform height/spread + natural stem lean so no two clusters ever look identical!
          float hStretch = 0.86 + 0.30 * fract(iHash * 7.13);
          float wStretch = 0.88 + 0.24 * fract(iHash * 13.37);
          float leanAng = iHash * 6.2831853;
          float leanMag = (0.05 + 0.13 * fract(iHash * 19.7)) * clamp(vLocalY * 2.2, 0.0, 1.0);
          shapedPos.x = shapedPos.x * wStretch + cos(leanAng) * leanMag;
          shapedPos.z = shapedPos.z * wStretch + sin(leanAng) * leanMag;
          shapedPos.y = shapedPos.y * hStretch;
        }

        // Static flowers stay at 100% constant height at all times (never growing as you walk closer!).
        // Toroidal grass stays at 100% constant height out to 92% of toroidRadius (~100m away),
        // only feathering in the final sub-pixel horizon band!
        vec3 taperedPos = uIsToroidal > 0.5
          ? vec3(shapedPos.x, shapedPos.y * smoothstep(0.0, 1.0, effFade), shapedPos.z)
          : shapedPos;
        vec3 localScaled = localRS * taperedPos;

        // Unified Prevailing Valley Wind (flows along WIND_DIR = normalize(vec2(0.82, 0.57))):
        // Strictly positive forward lean + travelling gust waves + subtle perpendicular flutter
        // so grass & flowers never swing backward or in opposite directions!
        const vec2 WIND_DIR = vec2(0.8207, 0.5714);
        const vec2 WIND_PERP = vec2(-0.5714, 0.8207);
        float w = clamp(vLocalY * 2.6, 0.0, 1.0) * uWindFlex * effFade;
        float windCoord = dot(basePos.xz, WIND_DIR);
        float crossCoord = dot(basePos.xz, WIND_PERP);

        // Travelling macro gust wave (0.0 .. 1.0) + secondary swell moving strictly downwind
        float wave1 = sin(uTime * 2.15 - windCoord * 0.14 + sin(crossCoord * 0.08) * 0.7) * 0.5 + 0.5;
        float wave2 = sin(uTime * 3.20 - windCoord * 0.28 + iHash * 1.6) * 0.5 + 0.5;
        float gustEnv = pow(wave1, 1.45) * 0.74 + wave2 * 0.26;

        // Always leans downwind (base lean 0.16 + gust surge up to 1.15), with subtle organic cross-flutter
        float forwardPush = (0.16 + gustEnv * 1.05) * w;
        float crossFlutter = sin(uTime * 3.4 - windCoord * 0.32 + iHash * 4.5) * 0.042 * w * (0.35 + 0.65 * gustEnv);
        vWindGust = clamp(pow(wave1, 1.6) * clamp(vLocalY * 3.2, 0.0, 1.0), 0.0, 1.0);

        vec2 windDisp = WIND_DIR * (forwardPush * 0.36) + WIND_PERP * crossFlutter;
        localScaled.x += windDisp.x;
        localScaled.z += windDisp.y;
        localScaled.y -= length(windDisp) * 0.22;

        vec4 worldPos = modelMatrix * vec4(basePos + localScaled, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * localRS * normal);

        // Ghost of Tsushima GDC 2021 Glancing-Angle Thickness Adjustment:
        // When a slender curved grass blade is viewed nearly edge-on, slightly thicken it
        // in the view-perpendicular horizontal direction so it never aliases into a thin line.
        if (uIsToroidal > 0.5 && vLocalY > 0.02) {
          vec3 toCam = normalize(cameraPosition - worldPos.xyz);
          vec2 viewRight = normalize(vec2(-toCam.z, toCam.x) + vec2(1e-5, 0.0));
          float edgeOn = 1.0 - abs(dot(toCam.xz, normalize(vWorldNormal.xz + vec2(1e-5, 0.0))));
          float sideSign = sign(dot(localScaled.xz, viewRight));
          worldPos.xz += viewRight * sideSign * pow(clamp(edgeOn, 0.0, 1.0), 2.0) * 0.0085;
        }

        vWorldPos = worldPos.xyz;

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
      uniform vec4 uTreeShadows[72];
      uniform int uTreeCount;
      uniform vec4 uCharShadows[8];
      uniform sampler2D uWorldMask;
      uniform float uUseMask;
      uniform float uWorldExtent;
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
      varying float vWindGust;
      varying float vInstanceHash;

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

      // Anime sun-projected ground shadow direction (casts to the right + slightly forward from upper-left sun)
      vec2 getAnimeShadowDir(vec3 sunDir) {
        return normalize(vec2(-sunDir.x, abs(sunDir.z) * 0.52 + 0.24) + vec2(1e-5, 0.0));
      }

      float evalTreeGroundShadow(vec2 xz, vec3 sunDir) {
        vec2 shadowDir = getAnimeShadowDir(sunDir);
        vec2 perpDir = vec2(-shadowDir.y, shadowDir.x);
        float edgeRuffle = (valueNoise(xz * 1.45) - 0.5) * 0.20;
        float dappleNoise = valueNoise(xz * 0.92 + vec2(1.7, -2.9)) * 0.55
                          + valueNoise(xz * 2.15 - vec2(3.4, 1.2)) * 0.45;
        float maxShd = 0.0;

        for (int i = 0; i < 72; i++) {
          if (i >= uTreeCount) break;
          vec4 tr = uTreeShadows[i];
          vec2 rel = xz - tr.xz;
          float rCan = tr.w;
          if (abs(rel.x) > rCan * 4.4 || abs(rel.y) > rCan * 4.4) continue;

          float along = dot(rel, shadowDir);
          float across = abs(dot(rel, perpDir));

          float trunkW = rCan * 0.13;
          float inTrunkLen = smoothstep(-0.25, 0.12, along) * (1.0 - smoothstep(rCan * 1.85, rCan * 2.15, along));
          float trunkShd = inTrunkLen * (1.0 - smoothstep(trunkW * 0.72, trunkW * 1.08, across));

          vec2 poolCenter = shadowDir * (rCan * 1.75);
          vec2 dPool = rel - poolCenter;
          float pAlong = dot(dPool, shadowDir) / (rCan * 2.35);
          float pAcross = dot(dPool, perpDir) / (rCan * 1.42);
          float poolDist = length(vec2(pAlong, pAcross)) + edgeRuffle * 0.15;
          float inCanopyEnvelope = 1.0 - smoothstep(0.82, 1.02, poolDist);
          float canopyFleckGap = smoothstep(0.76, 0.85, dappleNoise) * smoothstep(0.20, 0.82, poolDist);
          float canopyShd = inCanopyEnvelope * (1.0 - canopyFleckGap * 0.65);

          float underDist = length(rel) / (rCan * 0.96) + edgeRuffle * 0.12;
          float underShd = (1.0 - smoothstep(0.72, 0.94, underDist)) * 0.94;

          maxShd = max(maxShd, max(trunkShd * 0.96, max(canopyShd, underShd)));
        }

        // Directional Left-Canopy lacy shadow sweep across the left/center of the Country Road
        float rCenter = length(xz);
        float inValleyFloor = 1.0 - smoothstep(145.0, 164.0, rCenter);
        if (inValleyFloor > 0.01) {
          vec2 projXZ = xz - shadowDir * 2.4;
          float macroN = valueNoise(projXZ * 0.24 + vec2(1.4, -2.1)) * 0.6
                       + valueNoise(projXZ * 0.55 - vec2(2.8, 1.7)) * 0.4;
          float dappleN = valueNoise(projXZ * 1.05 + vec2(1.9, -3.4)) * 0.55
                        + valueNoise(projXZ * 2.35 + vec2(-4.1, 2.3)) * 0.45;
          float leftCanopyBias = xz.y > 22.0 ? smoothstep(1.35, -1.65, xz.x) : 0.72;
          float bandMask = smoothstep(0.24, 0.54, macroN) * inValleyFloor * leftCanopyBias;
          float aveCelShd = bandMask * smoothstep(0.34, 0.42, dappleN) * 0.88;
          maxShd = max(maxShd, aveCelShd);
        }

        return clamp(maxShd, 0.0, 1.0);
      }

      // Analytical Cel-Shaded Tudor Building, Well, Shrine Arch & Hero/Enemy Character Shadows on 3D Grass & Flowers!
      float evalArchitectureAndCharShadow(vec2 xz, vec3 sunDir) {
        vec2 shadowDir = getAnimeShadowDir(sunDir);
        vec2 perpDir = vec2(-shadowDir.y, shadowDir.x);
        float shd = 0.0;

        // 1. 5 Tudor Cottages cel-shaded directional roof/wall shadow onto surrounding meadow grass & flowers
        if (xz.x > -62.0 && xz.x < 36.0 && xz.y > -34.0 && xz.y < 34.0) {
          for (int i = 0; i < 5; i++) {
            vec4 bp;
            vec3 br; // (cosNeg, sinNeg, reach)
            if (i == 0)      { bp = vec4(-15.5, -14.5, 5.4, 3.9); br = vec3( 0.6837, -0.7298, 7.6); }
            else if (i == 1) { bp = vec4( 16.5, -13.5, 4.5, 3.4); br = vec3( 0.6333,  0.7739, 6.4); }
            else if (i == 2) { bp = vec4( 16.8,  14.2, 4.7, 3.6); br = vec3(-0.7638,  0.6455, 6.6); }
            else if (i == 3) { bp = vec4(-15.8,  14.8, 4.3, 3.3); br = vec3(-0.6832, -0.7302, 6.0); }
            else             { bp = vec4(-44.0, -18.0, 4.1, 3.4); br = vec3( 0.9131, -0.4078, 6.6); }

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
            shd = max(shd, (1.0 - smoothstep(-0.08, 0.24, boxDist)) * 0.94);
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
        }

        // 4. East Arena Split-Rail Fence ring shadow at (68, -4, r = 19.5)
        if (xz.x > 46.0 && xz.x < 90.0 && xz.y > -26.0 && xz.y < 18.0) {
          vec2 arenaRel = xz - (vec2(68.0, -4.0) + shadowDir * 0.65);
          float dFence = abs(length(arenaRel) - 19.5);
          if (arenaRel.x > -18.2) {
            shd = max(shd, (1.0 - smoothstep(0.18, 0.58, dFence)) * 0.78);
          }
        }

        // 5. Hero Duo (Knight + Mage) & All 6 Pooled Enemies (Skeletons + Boss Sovereign) Cel-Shaded Shadows
        for (int c = 0; c < 8; c++) {
          vec4 ch = uCharShadows[c];
          if (ch.w < 0.02) continue;
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

      float computeCanopyShadow(vec2 xz) {
        float cloudDapple = smoothstep(0.32, 0.74, valueNoise(xz * 0.018 + vec2(4.2, -3.5))) * 0.32;
        float contactShd = 0.0;
        if (uUseMask > 0.5) {
          vec2 shadowDir = getAnimeShadowDir(uSunDir);
          vec2 maskUV = clamp(xz / (2.0 * uWorldExtent) + 0.5, 0.001, 0.999);
          vec2 maskOffsetUV = clamp((xz - shadowDir * 0.76) / (2.0 * uWorldExtent) + 0.5, 0.001, 0.999);
          float maskA = min(texture2D(uWorldMask, maskUV).a, texture2D(uWorldMask, maskOffsetUV).a);
          contactShd = smoothstep(0.14, 0.42, 1.0 - maskA) * 0.94;
        }
        float archAndCharShd = evalArchitectureAndCharShadow(xz, uSunDir);
        if (uTreeCount > 0) {
          float treeShd = evalTreeGroundShadow(xz, uSunDir);
          float softField = smoothstep(0.28, 0.72, valueNoise(xz * 0.045 + vec2(2.1, -1.4))) * 0.16;
          return clamp(max(max(max(treeShd * 0.96, archAndCharShd), contactShd), max(cloudDapple, softField)), 0.0, 1.0);
        }
        float n = fbm(xz * 0.085 + vec2(3.1, 1.7));
        float fine = valueNoise(xz * 0.28 + vec2(-1.2, 4.5)) * 0.34;
        float dapple = smoothstep(0.32, 0.68, n + fine - 0.12);
        return max(max(max(dapple * 0.85, archAndCharShd), cloudDapple), contactShd);
      }

      void main() {
        vec3 rawN = gl_FrontFacing ? normalize(vWorldNormal) : -normalize(vWorldNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float canopyShadow = computeCanopyShadow(vWorldPos.xz);
        float camDist = length(cameraPosition - vWorldPos);
        float sunForward = pow(clamp(dot(-V, L) * 0.5 + 0.5, 0.0, 1.0), 3.0);
        vec3 mistCol = mix(vec3(0.82, 0.90, 0.97), vec3(1.0, 0.95, 0.86), sunForward * 0.55) * uLightTint;
        float perimeterMist = smoothstep(132.0, 175.0, length(vWorldPos.xz)) * (1.0 - smoothstep(10.0, 42.0, vWorldPos.y)) * 0.62;
        float lowMist = max(
          smoothstep(42.0, 145.0, camDist) * (1.0 - smoothstep(-1.5, 7.5, vWorldPos.y)) * 0.22,
          perimeterMist
        );

        if (uIsToroidal > 0.5) {
          // =================================================================
          // 1. OPTION 4 GOUACHE BROAD-LEAF TUSSOCK SHADING
          //    (Deep Viridian Root-Pocket AO + Cel-Shaded Emerald-to-Chartreuse Arch)
          // =================================================================
          float distNormalBlend = smoothstep(22.0, 66.0, camDist);
          float distContrastSoften = smoothstep(18.0, 36.0, camDist);
          vec3 N = normalize(mix(rawN, vec3(0.0, 1.0, 0.0), 0.24 + distNormalBlend * 0.52));
          float hFrac = clamp(vLocalY / 0.42, 0.0, 1.0);
          float bladeNdl = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);

          // 2-step cel/gouache relief across each curved leaf arch (softens at distance to prevent sub-pixel hillside speckle)
          float celRelief = mix(
            mix(0.74, 1.12, smoothstep(0.36, 0.72, bladeNdl)),
            mix(0.92, 1.04, smoothstep(0.32, 0.76, bladeNdl)),
            distContrastSoften
          );

          // Deep forest-viridian root pocket shadow at the bottom 36% of every clump (#10381c)
          // rising into saturated emerald (#3d9228) and sunlit spring chartreuse (#84d440) at the arched top!
          float rootPocket = smoothstep(0.0, 0.38, hFrac);
          float upperArch  = smoothstep(0.36, 0.86, hFrac);

          float terrainLight = clamp(1.0 - canopyShadow * 0.90, 0.0, 1.0);
          vec3 colRootShd = vec3(0.025, 0.11, 0.065);
          vec3 colRootSun = vec3(0.085, 0.28, 0.135);
          vec3 rootCol = mix(colRootShd, colRootSun, terrainLight);

          vec3 colMidShd = uGrassShadowRoot * vec3(0.74, 0.86, 1.06) * celRelief;
          vec3 colMidSun = mix(uGrassSunRoot, vColor, 0.45) * celRelief;
          vec3 midCol = mix(colMidShd, colMidSun, terrainLight);

          vec3 colTipShd = uGrassShadowTip * vec3(0.76, 0.88, 1.08) * celRelief;
          vec3 gustChartreuse = vec3(0.56, 0.84, 0.24);
          vec3 colTipSun = mix(mix(uGrassSunTip * 0.94, vColor, 0.42), gustChartreuse, vWindGust * 0.55) * celRelief;
          vec3 tipCol = mix(colTipShd, colTipSun, terrainLight);

          // Combine 3-tier Option 4 tussock gradient (Root Shadow -> Mid Emerald -> Sunlit Arch)
          vec3 effRootCol = mix(rootCol, midCol * 0.88, distContrastSoften * 0.85);
          vec3 effTipCol  = mix(tipCol, mix(midCol, tipCol, 0.42), distContrastSoften * 0.75);
          vec3 tussockCol = mix(effRootCol, midCol, rootPocket);
          tussockCol = mix(tussockCol, effTipCol, upperArch);
          // Crisp Ghibli cool-viridian canopy & prop shadow cut across 3D grass tufts
          tussockCol *= mix(vec3(1.0), vec3(0.38, 0.48, 0.62), smoothstep(0.36, 0.78, canopyShadow) * 0.72);

          // Only blend into flat terrain base in the outermost 15% horizon fade band
          vec3 terrainHorizon = mix(uGrassShadowRoot * vec3(0.78, 0.88, 1.08), mix(uGrassSunRoot, uGrassSunTip, 0.42), terrainLight);
          vec3 finalCol = mix(terrainHorizon, tussockCol, smoothstep(0.0, 0.25, vDistFade)) * uLightTint;
          finalCol = mix(finalCol, mistCol, lowMist);

          gl_FragColor = vec4(finalCol, 1.0);
        } else {
          // =================================================================
          // 2. BLENDER 5.2 VOLUMETRIC 3D GOBLET-CUPPED FLOWERS, ROSES & PLUMES
          //    (Preserves true 3D sculptural normals + 3-band anime cel shading + deep cup AO!)
          // =================================================================
          // IMPORTANT: Do NOT flip vWorldNormal with gl_FrontFacing on 3D flower petals —
          // Blender 5.2 sculpted explicit inward-cup vs outward-belly normals into vWorldNormal!
          vec3 N = normalize(vWorldNormal);
          float hFrac = clamp(vLocalY / 0.46, 0.0, 1.0);
          float isFoliage = clamp((vColor.g - max(vColor.r, vColor.b) * 0.88) * 5.0, 0.0, 1.0);

          // Subtle per-instance warmth/hue variation (+/- 7%) so flower drifts feel hand-painted
          vec3 instTint = mix(vec3(0.95, 0.96, 1.04), vec3(1.05, 1.02, 0.95), vInstanceHash);
          vec3 baseCol = vColor * mix(instTint, vec3(1.0), isFoliage * 0.6);

          // Deep root-pocket ambient occlusion on stems/leaves + pure 3D sculptural normal cel-shading on petals!
          float rootPocketAO = mix(0.38, 1.0, smoothstep(0.0, 0.48, hFrac));
          float ndl = dot(N, L) * 0.5 + 0.5;
          float lit = clamp(ndl * 0.88 + hFrac * 0.12 - canopyShadow * 0.72, 0.0, 1.0);

          // Crisp 3-Band Anime Cel Shading across every 3D petal whorl (deep cup shadow -> rich mid -> sunlit rolled rim)
          float cel = 0.12 + 0.48 * smoothstep(0.24, 0.36, lit) + 0.40 * smoothstep(0.56, 0.68, lit);

          vec3 shdCol = baseCol * vec3(0.38, 0.44, 0.64) * rootPocketAO;
          vec3 sunCol = baseCol * vec3(1.08, 1.03, 0.96) * mix(0.75, 1.0, rootPocketAO);
          vec3 col = mix(shdCol, sunCol, cel);
          col *= mix(vec3(1.0), vec3(0.44, 0.52, 0.68), smoothstep(0.38, 0.82, canopyShadow) * 0.68);

          // Warm velvet subsurface petal translucency & crisp top-lip highlight
          float fres = 1.0 - clamp(abs(dot(N, V)), 0.0, 1.0);
          float sss = clamp(dot(-L, V) * 0.5 + 0.5, 0.0, 1.0) * (1.0 - isFoliage) * smoothstep(0.25, 0.95, hFrac);
          col += baseCol * sss * 0.22 * (1.0 - canopyShadow * 0.88);
          col = mix(col, sunCol * 1.18, smoothstep(0.50, 0.82, fres) * 0.26 * smoothstep(0.32, 0.95, hFrac) * (1.0 - canopyShadow * 0.65));

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
  const heightTexInfo = createHeightDataTexture(sampleHeight, 256, worldExtent);
  const sharedUniforms = {
    uTime: { value: 0 },
    uPlayerPos: { value: new THREE.Vector3(0, 0, 0) },
    uSunDir: { value: new THREE.Vector3(0.58, 0.76, 0.30).normalize() },
    uLightTint: { value: new THREE.Color(1, 1, 1) },
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
    toroidRadius: cfg.grassRadius,
    windFlex: SPECIES_SPECS.grassTuft.flex,
    worldExtent,
    worldMaskTexture: maskTex,
    heightTexInfo,
    sharedUniforms,
  });
  const grassGeo =
    cfg.name === 'tablet' && geos.grassTuftTablet ? geos.grassTuftTablet : geos.grassTuft;
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, cfg.grassCount);
  grassMesh.name = 'meadow_grassTuft_toroidal';
  grassMesh.frustumCulled = false;
  const diam = cfg.grassRadius * 2;
  const profileHorizScale = cfg.name === 'tablet' ? 1.12 : 1.0;
  for (let i = 0; i < cfg.grassCount; i++) {
    const ox = (hash(i * 3.1 + 1.7) - 0.5) * diam;
    const oz = (hash(i * 5.3 + 2.9) - 0.5) * diam;
    dummy.position.set(ox, 0, oz);
    // Coherent wind-swept tussock orientation (+/- 0.65 rad around prevailing wind) so clumps flow together like Option 4!
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
  // Guard target grassCount against stale external clamps (e.g. legacy 8800/4500 caps)
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

  // 2. 6 Static InstancedMesh batches for wildflowers, Crimson Roses & shrubs (6 draw calls -> 7 total)
  const flowerKeys = ['bellflower', 'daisy', 'lupine', 'cosmos', 'crimsonRose', 'toonShrub'];
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

  // Sacred Inscription Stone anchors for diegetic Crimson Rose clusters (r = 1.6m..5.8m)
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
          { id: 'stone3_wisteriaGrove', x: 44,  z: 16,  rMin: 1.6, rMax: 3.45 },
          { id: 'stone1_townPlaza',     x: 0,   z: -14, rMin: 1.6, rMax: 3.25 },
          { id: 'stone2_lakesidePier',  x: -42, z: 18,  rMin: 1.6, rMax: 3.25 },
          { id: 'stone3_wisteriaGrove', x: 44,  z: 16,  rMin: 1.6, rMax: 3.45 },
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
    const mat = createGouacheMaterial({
      isToroidal: false,
      fadeRadius: cfg.flowerRadius,
      windFlex: SPECIES_SPECS[key].flex,
      worldExtent,
      // Do not GPU-cull Crimson Rose rings around plaza/pier Sacred Inscription Stones
      worldMaskTexture: key === 'crimsonRose' ? null : maskTex,
      sharedUniforms,
    });
    const imesh = new THREE.InstancedMesh(geos[key], mat, targetCount);
    imesh.name = `meadow_${key}_static`;
    imesh.frustumCulled = false;

    let placed = 0;
    let attempt = 0;

    if (key === 'crimsonRose') {
      // Diegetic rings/clusters (r = 1.6m..5.8m) exclusively around the 3 Sacred Inscription Stones
      // (plus Southern Flower Field Lobby when worldExtent >= 140, or (0, 0) in demo mode)
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
      // Lock diegetic Sacred Stone matrices so generic valley scatterers never overwrite them
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
          // Include lush colonies across the Southern Flower Field Lobby (0, 128)
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
