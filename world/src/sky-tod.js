// ============================================================================
// world/src/sky-tod.js
//
// Stylized Day / Evening / Night Painterly Sky Dome, Two-Tone Anime Sun Disc,
// Cel-Shaded Lunar Mare Moon, Flicker-Free 3D Starfield, & 10-Cloud Cumulus Ring.
// ============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const smoothstep01 = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

const linearColor = (hex) => new THREE.Color(hex);

export const TOD_PRESETS = {
  day: {
    id: 'day',
    label: '☀️ Day',
    t: 0.34,
    timeLabel: '08:10 · Golden Day',
  },
  evening: {
    id: 'evening',
    label: '🌅 Evening',
    t: 0.76,
    timeLabel: '18:15 · Sunset Twilight',
  },
  twilight: {
    id: 'twilight',
    label: '🌆 Twilight',
    t: 0.84,
    timeLabel: '19:45 · Indigo Twilight',
  },
  night: {
    id: 'night',
    label: '🌙 Night',
    t: 0.96,
    timeLabel: '23:05 · Starlit Night',
  },
};

/* ------------------------------------------------------------------------- */
/* Sky Dome Shader (Zero Glare Wash · Crisp Cel Sun · Lunar Mare Moon · Stars)*/
/* ------------------------------------------------------------------------- */

const SKY_VERT = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;

    vec4 clip = projectionMatrix * viewMatrix * worldPos;
    clip.z = clip.w;
    gl_Position = clip;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uFog;
  uniform vec3 uSunCore;
  uniform vec3 uSunRim;
  uniform vec3 uSunCorona;
  uniform vec3 uSunDir;
  uniform float uSunVis;
  uniform vec3 uMoonCore;
  uniform vec3 uMoonShadow;
  uniform vec3 uMoonCorona;
  uniform vec3 uMoonDir;
  uniform float uMoonVis;
  uniform float uStarAlpha;
  uniform float uTime;
  uniform float uEclipseWeight;
  uniform vec3 uEclipseDir;

  varying vec3 vWorldPos;

  float hash31(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  vec3 evalStarLayer(vec3 dir, float scale, float threshold, float time) {
    vec3 p = dir * scale;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash31(id);
    if (h < threshold) return vec3(0.0);
    vec3 jitter = (fract(vec3(h * 13.1, h * 29.7, h * 53.3)) - 0.5) * 0.52;
    float dist = length(f - jitter);
    float radius = mix(0.065, 0.135, fract(h * 19.3));
    float core = 1.0 - smoothstep(radius * 0.28, radius, dist);
    float twinkle = 0.84 + 0.16 * sin(time * (1.1 + fract(h * 7.7) * 1.6) + h * 62.83);
    vec3 tint = mix(vec3(0.82, 0.90, 1.0), vec3(1.0, 0.95, 0.85), fract(h * 37.0));
    return tint * (core * core * twinkle);
  }

  void main() {
    vec3 d = normalize(vWorldPos - cameraPosition);
    float ecW = clamp(uEclipseWeight, 0.0, 1.0);
    float sunVisEff = uSunVis * (1.0 - ecW);
    float moonVisEff = uMoonVis * (1.0 - ecW);

    // 1. Option 4 Deep Sapphire Zenith -> Luminous Cyan-Azure Mid -> Glowing Aqua-Ivory Horizon
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.004, 0.16, h));
    col = mix(col, uZenith, smoothstep(0.10, 0.52, h));

    // Gentle pearlescent horizon mist band so distant ridges sit naturally in the atmosphere
    float band = smoothstep(0.11, -0.025, d.y);
    col = mix(col, mix(uHorizon, uFog, 0.38), band * 0.52);

    // Directional Mie forward-scattering warmth along the sun-side horizon
    vec3 sd = normalize(uSunDir);
    vec3 sunFlat = normalize(vec3(sd.x, 0.0, sd.z));
    vec3 dirFlat = normalize(vec3(d.x, 0.0, d.z) + vec3(0.0, 0.0, 1e-5));
    float azSun = dot(dirFlat, sunFlat) * 0.5 + 0.5;
    float lowHorizonRibbon = exp(-pow((d.y - 0.06) / 0.095, 2.0)) * pow(azSun, 3.2);
    col = mix(col, uSunCorona, lowHorizonRibbon * 0.30 * sunVisEff);

    // 1B. Painted Anime High-Altitude Cirrus Wisps & Wind Streaks (Option 4 Makoto Shinkai sky texture)
    if (d.y > 0.04 && sunVisEff > 0.05) {
      vec2 skyUV = d.xz / (d.y + 0.26);
      vec2 windScroll = vec2(0.82, 0.57) * (uTime * 0.012);
      float c1 = vnoise2(skyUV * vec2(1.35, 2.85) - windScroll);
      float c2 = vnoise2(skyUV * vec2(3.10, 6.20) - windScroll * 1.4 + vec2(2.7, -1.3));
      float c3 = vnoise2(skyUV * vec2(0.65, 1.15) + vec2(-1.4, 3.1));
      float cirrusField = c1 * 0.52 + c2 * 0.30 + c3 * 0.18;
      float cirrusMask = smoothstep(0.56, 0.78, cirrusField) * smoothstep(0.05, 0.22, d.y) * (1.0 - smoothstep(0.58, 0.88, d.y));
      vec3 cirrusCol = mix(vec3(0.94, 0.98, 1.0), uSunCore, pow(azSun, 3.0) * 0.35);
      col = mix(col, cirrusCol, cirrusMask * 0.34 * sunVisEff);
    }

    // 2. Flicker-free 3D procedural starfield in upper sky dome (d.y > 0.08)
    if (uStarAlpha > 0.005 && d.y > 0.06 && ecW < 0.99) {
      float starFade = smoothstep(0.08, 0.24, d.y);
      vec3 s1 = evalStarLayer(d, 76.0, 0.84, uTime);
      vec3 s2 = evalStarLayer(d + vec3(0.37, 0.19, -0.23), 128.0, 0.87, uTime * 0.8);
      vec3 stars = (s1 * 1.15 + s2 * 0.72) * starFade * uStarAlpha * (1.0 - ecW);
      col += stars;
    }

    // 3. Crisp Stylized Anime Sun Disc + Smooth Golden Mie Halo (Option 4 + Option 2)
    if (sunVisEff > 0.005) {
      float angSun = acos(clamp(dot(d, sd), -1.0, 1.0));
      float sunRadius = 0.035;
      float corona = exp(-angSun * 14.0) * 0.24 + exp(-angSun * 3.8) * 0.12;
      col += uSunCorona * corona * sunVisEff;

      float outerDisc = 1.0 - smoothstep(sunRadius - 0.0022, sunRadius + 0.0020, angSun);
      float innerCore = 1.0 - smoothstep(sunRadius * 0.66 - 0.002, sunRadius * 0.66 + 0.002, angSun);
      vec3 sunCelColor = mix(uSunRim, uSunCore * 1.15, innerCore);
      col = mix(col, sunCelColor, outerDisc * sunVisEff);
    }

    // 4. Crisp Stylized Anime Moon (silver-ivory cel disc + lunar mare craters + crescent phase + moonlight ring)
    if (moonVisEff > 0.005) {
      vec3 md = normalize(uMoonDir);
      float angMoon = acos(clamp(dot(d, md), -1.0, 1.0));
      float moonR = 0.031;

      // Soft moonlight corona ring (#8ab4f8)
      float moonCorona = exp(-angMoon * 22.0) * 0.20
                       + smoothstep(moonR * 1.55, moonR * 1.02, angMoon) * 0.14;
      col += uMoonCorona * moonCorona * moonVisEff;

      if (angMoon < moonR * 1.15) {
        vec3 mRight = normalize(cross(vec3(0.0, 1.0, 0.0), md));
        vec3 mUp = cross(md, mRight);
        vec2 mp = vec2(dot(d, mRight), dot(d, mUp)) / moonR;
        float r = length(mp);
        float moonMask = 1.0 - smoothstep(0.95, 1.02, r);

        // 3D normal on lunar sphere for cel-shaded waxing gibbous / crescent phase
        float zSphere = sqrt(max(0.0, 1.0 - min(1.0, r * r)));
        vec3 mNorm = vec3(mp.x, mp.y, zSphere);
        vec3 phaseLightDir = normalize(vec3(0.58, 0.24, 0.77));
        float phaseNdl = dot(mNorm, phaseLightDir);
        float litMask = smoothstep(-0.08, 0.05, phaseNdl);

        // Procedural lunar mare craters & sea of tranquility patches (clear cel-shaded contrast)
        float mareN = vnoise2(mp * 2.2 + vec2(1.7, -0.8)) * 0.65
                    + vnoise2(mp * 4.5 - vec2(0.5, 2.1)) * 0.35;
        float marePatch = smoothstep(0.44, 0.54, mareN);
        float craterRing = smoothstep(0.26, 0.18, length(mp - vec2(-0.18, 0.16)))
                         + smoothstep(0.20, 0.13, length(mp - vec2(0.24, -0.14))) * 0.85;
        float mareFactor = clamp(marePatch * 0.65 + craterRing * 0.55, 0.0, 1.0);

        vec3 litSurface = uMoonCore * 0.76;
        vec3 mareColor = mix(litSurface, uMoonShadow * 1.65, 0.52);
        vec3 litMoon = mix(litSurface, mareColor, mareFactor);

        // Crisp silver-gold inner rim highlight on sunlit limb (crosses HDR bloom threshold gently)
        float limb = smoothstep(0.68, 0.96, r) * smoothstep(0.05, 0.45, phaseNdl);
        litMoon += vec3(0.24, 0.28, 0.36) * limb;

        vec3 moonCol = mix(uMoonShadow * 0.65, litMoon, litMask);
        col = mix(col, moonCol, moonMask * moonVisEff);
      }
    }

    // 5. Divine Verdict Colossal Black-Crimson Eclipse Disc & Abyssal Storm-Cloud Compression (Frame 37, Frame 57, Frame 41)
    if (ecW > 0.001) {
      // Blend sky gradient toward deep abyssal blue-black (#050710 zenith, #120916 mid, #2b0c18 horizon)
      vec3 ecZenith  = vec3(0.0016, 0.0024, 0.0054); // #050710
      vec3 ecMid     = vec3(0.0062, 0.0028, 0.0086); // #120916
      vec3 ecHorizon = vec3(0.0242, 0.0038, 0.0098); // #2b0c18
      vec3 ecSky = mix(ecHorizon, ecMid, smoothstep(0.004, 0.18, h));
      ecSky = mix(ecSky, ecZenith, smoothstep(0.12, 0.54, h));

      vec3 ecDir = normalize(uEclipseDir);
      vec3 ecRight = normalize(cross(vec3(0.0, 1.0, 0.0), ecDir));
      vec3 ecUp = cross(ecDir, ecRight);
      vec2 ecLocal = vec2(dot(d, ecRight), dot(d, ecUp));

      float angEclipse = acos(clamp(dot(d, ecDir), -1.0, 1.0));
      float ecRadius = 0.325;

      // Exponential blood-crimson outer corona (#e60c2c -> #7f081a, pure ruby R >> G, B > G)
      float outerDelta = max(0.0, angEclipse - ecRadius * 0.94);
      float coronaGlow = exp(-outerDelta * 6.8) * 0.58 + exp(-outerDelta * 20.0) * 0.72;
      vec3 crimsonDeep  = vec3(0.24, 0.002, 0.012);
      vec3 crimsonVivid = vec3(0.82, 0.006, 0.036);
      ecSky += mix(crimsonDeep, crimsonVivid, clamp(coronaGlow, 0.0, 1.0)) * coronaGlow;

      // Multi-layered Billowing Storm-Cloud Amphitheater compressed beneath & around the Eclipse Disc (Frame 37 / 57 / 41)
      if (d.y > 0.02 && d.y < 0.78) {
        vec2 stormUv = vec2(ecLocal.x * 2.4, (d.y - 0.16) * 4.2);
        float drift = uTime * 0.015;
        float n1 = vnoise2(stormUv * vec2(2.6, 3.2) + vec2(drift, -drift * 0.4));
        float n2 = vnoise2(stormUv * vec2(5.4, 6.8) - vec2(drift * 1.3, 0.7));
        float n3 = vnoise2(stormUv * vec2(11.0, 13.5) + vec2(1.9, -2.3));
        float fbmStorm = n1 * 0.54 + n2 * 0.31 + n3 * 0.15;

        // Amphitheater envelope: cradles the lower rim and flanks of the Eclipse disc without covering its black interior
        float cradleY = 0.18 + 0.28 * clamp(abs(ecLocal.x) * 1.45, 0.0, 1.0);
        float verticalBand = smoothstep(0.04, 0.14, d.y) * (1.0 - smoothstep(cradleY, cradleY + 0.24, d.y - (fbmStorm - 0.5) * 0.14));
        float voidClearance = smoothstep(ecRadius - 0.015, ecRadius + 0.045, angEclipse);
        float cloudDensity = smoothstep(0.32, 0.68, fbmStorm + verticalBand * 0.45) * verticalBand * voidClearance;

        if (cloudDensity > 0.005) {
          // Sample slightly toward the Eclipse center to detect upper cloud ridges facing the crimson corona
          vec2 toEc = -normalize(ecLocal + vec2(1e-5, 0.02));
          float nTowardsEc = vnoise2((stormUv + toEc * 0.16) * vec2(2.6, 3.2) + vec2(drift, -drift * 0.4)) * 0.65
                           + vnoise2((stormUv + toEc * 0.16) * vec2(5.4, 6.8) - vec2(drift * 1.3, 0.7)) * 0.35;
          float rimFacingEc = clamp((fbmStorm - nTowardsEc) * 3.2 + 0.45, 0.0, 1.0);
          float proxEc = exp(-max(0.0, angEclipse - ecRadius) * 4.2);

          // 3-band anime storm cloud cel shading: charcoal-obsidian belly -> slate-storm mid -> blood-crimson backlit crown
          vec3 stormBelly = vec3(0.014, 0.002, 0.012);
          vec3 stormMid   = mix(vec3(0.036, 0.003, 0.022), vec3(0.28, 0.002, 0.016), proxEc * 0.85);
          vec3 stormRim   = mix(vec3(0.075, 0.004, 0.038), vec3(0.92, 0.004, 0.046), clamp(proxEc * 1.30, 0.0, 1.0));

          float celStep1 = smoothstep(0.36, 0.48, fbmStorm + rimFacingEc * 0.25);
          float celStep2 = smoothstep(0.58, 0.72, fbmStorm + rimFacingEc * 0.38) * smoothstep(0.15, 0.85, proxEc);
          vec3 stormCol = mix(stormBelly, stormMid, celStep1);
          stormCol = mix(stormCol, stormRim, celStep2);

          ecSky = mix(ecSky, stormCol, cloudDensity * 0.94);
        }
      }

      // Colossal Black Eclipse Void (radius 0.325 rad, pure obsidian interior #020103)
      float voidMask = 1.0 - smoothstep(ecRadius - 0.005, ecRadius + 0.003, angEclipse);
      float innerEdgeGlow = smoothstep(ecRadius - 0.055, ecRadius - 0.002, angEclipse) * voidMask;
      vec3 voidInterior = vec3(0.0006, 0.0003, 0.0010) + crimsonDeep * (innerEdgeGlow * 0.28);
      ecSky = mix(ecSky, voidInterior, voidMask);

      // Searing blood-crimson coronal ring right on the Eclipse boundary (pure ruby R >> G, B > G)
      float coronalRim = smoothstep(ecRadius + 0.022, ecRadius + 0.001, angEclipse)
                       * smoothstep(ecRadius - 0.018, ecRadius - 0.001, angEclipse);
      vec3 rimCrimson = vec3(1.18, 0.008, 0.048);
      ecSky += rimCrimson * (coronalRim * 1.35);

      col = mix(col, ecSky, ecW);
    }

    // Below horizon fade to fog
    vec3 horizonFog = mix(uFog * 0.94, vec3(0.012, 0.004, 0.008), ecW);
    col = mix(col, horizonFog, smoothstep(0.0, -0.16, d.y));

    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
`;

/* ------------------------------------------------------------------------- */
/* Billowing Flat-Bottomed Anime Cumulus Clouds (10-Cloud Ring, 1 Draw Call) */
/* ------------------------------------------------------------------------- */

export function buildCumulusGeometry(rand, { size = 44, detail = 1, puffs = 9, phase = 0 } = {}) {
  const puffGeos = [];
  const mainCount = Math.max(7, Math.round(puffs * 0.70));
  const topCount = Math.max(3, puffs - mainCount);

  const addPuff = (x, y, z, r, sy, yaw) => {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(r, r * sy, r)
    );
    geo.applyMatrix4(matrix);

    // Flatten the underside into the shared cloud base plane (y = 0)
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0) pos.setY(i, 0);
    }
    geo.computeVertexNormals();
    geo.deleteAttribute('uv');
    puffGeos.push(geo);
  };

  for (let i = 0; i < mainCount; i++) {
    const t = mainCount === 1 ? 0.5 : i / (mainCount - 1);
    const dome = Math.sin(Math.PI * (0.06 + 0.88 * t));
    const r = size * (0.10 + 0.085 * dome) * (0.85 + rand() * 0.30);
    const x = (t - 0.5) * size * 0.70 + (rand() - 0.5) * size * 0.07;
    const z = (rand() - 0.5) * size * 0.26;
    const y = r * (0.45 + rand() * 0.18);
    addPuff(x, y, z, r, 0.66 + rand() * 0.14, rand() * Math.PI * 2);
  }

  // Flat base slab
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3;
    const r = size * (0.16 + rand() * 0.05);
    const x = (t - 0.5) * size * 0.55 + (rand() - 0.5) * size * 0.08;
    const z = (rand() - 0.5) * size * 0.20;
    addPuff(x, r * 0.20, z, r, 0.30 + rand() * 0.08, rand() * Math.PI * 2);
  }

  // Billowing cauliflower crown puffs
  for (let i = 0; i < topCount; i++) {
    const t = (i + 0.5) / topCount;
    const r = size * (0.075 + rand() * 0.050);
    const x = (t - 0.5) * size * 0.58 + (rand() - 0.5) * size * 0.07;
    const z = (rand() - 0.5) * size * 0.20;
    const y = size * (0.135 + 0.040 * Math.sin(Math.PI * t)) + r * 0.45;
    addPuff(x, y, z, r, 0.80, rand() * Math.PI * 2);
  }

  const merged = mergeGeometries(puffGeos, false);
  for (const g of puffGeos) g.dispose();
  if (!merged) return null;

  const pos = merged.attributes.position;
  let maxY = 0;
  for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
  const span = Math.max(0.001, maxY);

  // Store normalized vertical crown factor (x), facet hash variation (y), and cloud phase (z)
  const cloudMeta = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const hFactor = smoothstep01(0.03, 0.62, y / span);
    const variation = 0.96 + 0.07 * hash1(x * 1.7 + z * 2.3);
    cloudMeta[i * 3 + 0] = hFactor;
    cloudMeta[i * 3 + 1] = variation;
    cloudMeta[i * 3 + 2] = phase;
  }

  merged.setAttribute('aCloudMeta', new THREE.BufferAttribute(cloudMeta, 3));
  merged.computeBoundingSphere();
  return merged;
}

const CLOUD_VERT = /* glsl */ `
  attribute vec3 aCloudMeta;
  uniform float uTime;
  uniform float uEclipseCompression;

  varying vec3 vCloudMeta;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vCloudMeta = aCloudMeta;
    vec3 pos = position;
    pos.y += sin(uTime * 0.18 + aCloudMeta.z) * 0.85;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    // Gently press horizon cumulus puffs downward during Eclipse without flattening their 3D volume
    worldPos.y -= uEclipseCompression * 6.5;
    vWorldPos = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const CLOUD_FRAG = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform vec3 uHaze;
  uniform float uHazeStart;
  uniform float uHazeEnd;
  uniform float uTime;
  uniform float uEclipseWeight;
  uniform vec3 uEclipseDir;

  varying vec3 vCloudMeta;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormalW);
    float hFactor = vCloudMeta.x;
    float facetVar = vCloudMeta.y;

    float ndl = dot(n, normalize(uLightDir));
    float billow = sin(uTime * 0.22 + vWorldPos.x * 0.04 + vWorldPos.z * 0.03) * 0.06;

    // Crisp 3-band anime cumulus cel-ramp (Option 4 Makoto Shinkai / Fontaine clouds)
    float facetLit = smoothstep(-0.28, 0.68, ndl + billow);
    float crownMix = clamp(hFactor * 0.66 + facetLit * 0.42, 0.0, 1.0);
    float band1 = smoothstep(0.24, 0.34, crownMix);
    float band2 = smoothstep(0.54, 0.64, crownMix);

    vec3 deepUnderside = uCool * vec3(0.76, 0.84, 0.98);
    vec3 midPeriwinkle = mix(uCool, uWarm, 0.48);
    vec3 brightCrown   = uWarm * 1.06;

    vec3 col = mix(deepUnderside, midPeriwinkle, band1);
    col = mix(col, brightCrown, band2) * facetVar;
    col *= (0.84 + 0.16 * hFactor);

    // Luminous anime silver-gold backlit rim when looking toward the sun or moon
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = smoothstep(0.32, 0.78, 1.0 - abs(dot(n, viewDir)));
    float back = pow(max(dot(-viewDir, normalize(uLightDir)), 0.0), 1.8);
    col += uWarm * (rim * 0.18 + rim * back * 0.36);

    // Aerial distance haze into the horizon
    float dist = length(vWorldPos - cameraPosition);
    float haze = smoothstep(uHazeStart, uHazeEnd, dist);
    col = mix(col, uHaze, haze * 0.34);

    // Divine Verdict Horizon Cumulus Grade: cool slate-grey anime cloud puffs (matching the flank clouds in Frame 37 & 57)
    if (uEclipseWeight > 0.001) {
      vec3 slateUnderside = vec3(0.11, 0.12, 0.15);
      vec3 slateMid       = vec3(0.26, 0.28, 0.33);
      vec3 slateCrown     = vec3(0.46, 0.48, 0.54);
      vec3 ecCloud = mix(slateUnderside, slateMid, band1);
      ecCloud = mix(ecCloud, slateCrown, band2) * facetVar;
      col = mix(col, ecCloud, clamp(uEclipseWeight, 0.0, 1.0));
    }

    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }
`;

/* ------------------------------------------------------------------------- */
/* Time-of-Day Keyframes & Factory                                           */
/* ------------------------------------------------------------------------- */

const TOD_KEYS = [
  {
    // Midnight (t = 0.00)
    t: 0.00,
    zen: 0x0d1734,
    mid: 0x1a2d58,
    hor: 0x2b4372,
    fog: 0x253a64,
    sunCore: 0xfff9dc,
    sunRim: 0xff7838,
    sunCorona: 0xff8844,
    sunVis: 0.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x455882,
    moonCorona: 0x8ab4f8,
    moonVis: 1.0,
    starAlpha: 1.0,
    cloudWarm: 0xa4c0ee,
    cloudCool: 0x2e426b,
    sunPos: [-0.24, 0.12, 0.96],
    moonPos: [-0.14, 0.27, -0.95],
    keyLightPos: [-0.42, 0.64, 0.64],
    sunLightColor: 0xa8c4f8,
    sunIntensity: 0.82,
    hemiSky: 0x4668ad,
    hemiGround: 0x1e2b46,
    hemiIntensity: 0.58,
    ambIntensity: 0.16,
    worldTint: [0.24, 0.34, 0.56],
    waterTint: [0.22, 0.32, 0.54],
    windowGlow: 1.0,
    daylight: 0.26,
  },
  {
    // Dawn (t = 0.20)
    t: 0.20,
    zen: 0x25488e,
    mid: 0x6b88be,
    hor: 0xf2ae8a,
    fog: 0xdcb8aa,
    sunCore: 0xfff9dc,
    sunRim: 0xff9e58,
    sunCorona: 0xffb074,
    sunVis: 0.9,
    moonCore: 0xeef5ff,
    moonShadow: 0x5c729c,
    moonCorona: 0x8ab4f8,
    moonVis: 0.2,
    starAlpha: 0.15,
    cloudWarm: 0xffe2c6,
    cloudCool: 0x8290be,
    sunPos: [0.22, 0.22, -0.95],
    moonPos: [-0.45, 0.18, 0.87],
    keyLightPos: [0.46, 0.58, 0.67],
    sunLightColor: 0xffd2a6,
    sunIntensity: 1.52,
    hemiSky: 0xb8cef0,
    hemiGround: 0x5c644e,
    hemiIntensity: 0.68,
    ambIntensity: 0.14,
    worldTint: [0.92, 0.84, 0.78],
    waterTint: [0.88, 0.82, 0.80],
    windowGlow: 0.25,
    daylight: 0.76,
  },
  {
    // Sunny Golden Day (t = 0.34) — Option 4 Deep Sapphire Zenith -> Luminous Aqua-Ivory Horizon
    t: 0.34,
    zen: 0x1452c8,
    mid: 0x44a4f2,
    hor: 0xdcf6ff,
    fog: 0xd4eef8,
    sunCore: 0xfffbe4,
    sunRim: 0xffd268,
    sunCorona: 0xffe6a4,
    sunVis: 1.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x6b82ab,
    moonCorona: 0x8ab4f8,
    moonVis: 0.0,
    starAlpha: 0.0,
    cloudWarm: 0xfffdf6,
    cloudCool: 0x9ec2ec,
    sunPos: [-0.21, 0.28, -0.93],
    moonPos: [0.45, -0.35, 0.82],
    keyLightPos: [-0.48, 0.68, 0.55],
    sunLightColor: 0xfff2d4,
    sunIntensity: 1.68,
    hemiSky: 0xc4e2ff,
    hemiGround: 0x62764c,
    hemiIntensity: 0.74,
    ambIntensity: 0.14,
    worldTint: [1.0, 0.99, 0.96],
    waterTint: [1.0, 1.0, 1.0],
    windowGlow: 0.0,
    daylight: 1.0,
  },
  {
    // High Afternoon (t = 0.54)
    t: 0.54,
    zen: 0x1452c8,
    mid: 0x44a4f2,
    hor: 0xdcf6ff,
    fog: 0xd4eef8,
    sunCore: 0xfffbe4,
    sunRim: 0xffd268,
    sunCorona: 0xffe6a4,
    sunVis: 1.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x6b82ab,
    moonCorona: 0x8ab4f8,
    moonVis: 0.0,
    starAlpha: 0.0,
    cloudWarm: 0xfffdf6,
    cloudCool: 0x9ec2ec,
    sunPos: [-0.36, 0.32, -0.87],
    moonPos: [0.65, -0.18, -0.74],
    keyLightPos: [-0.52, 0.66, 0.54],
    sunLightColor: 0xffeed0,
    sunIntensity: 1.62,
    hemiSky: 0xc0dcff,
    hemiGround: 0x62764c,
    hemiIntensity: 0.70,
    ambIntensity: 0.14,
    worldTint: [1.0, 0.98, 0.95],
    waterTint: [1.0, 0.99, 0.98],
    windowGlow: 0.0,
    daylight: 0.98,
  },
  {
    // Romantic Sunset / Twilight (t = 0.76) — Setting Sun in SSW, rising Moon in opposite ENE hemisphere
    t: 0.76,
    zen: 0x283470,
    mid: 0x82548a,
    hor: 0xf49264,
    fog: 0xdc826c,
    sunCore: 0xfff9dc,
    sunRim: 0xff7838,
    sunCorona: 0xffb858,
    sunVis: 1.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x5d5280,
    moonCorona: 0x8ab4f8,
    moonVis: 0.45,
    starAlpha: 0.35,
    cloudWarm: 0xffb478,
    cloudCool: 0x605082,
    sunPos: [-0.28, 0.17, 0.94],
    moonPos: [0.52, 0.20, -0.83],
    keyLightPos: [-0.44, 0.52, 0.73],
    sunLightColor: 0xffa464,
    sunIntensity: 1.54,
    hemiSky: 0xb484ac,
    hemiGround: 0x584652,
    hemiIntensity: 0.68,
    ambIntensity: 0.16,
    worldTint: [0.95, 0.78, 0.70],
    waterTint: [0.90, 0.74, 0.74],
    windowGlow: 0.88,
    daylight: 0.72,
  },
  {
    // Deep Indigo-Violet Twilight Dusk (t = 0.84)
    t: 0.84,
    zen: 0x161f4d,
    mid: 0x45356b,
    hor: 0x8e5678,
    fog: 0x6c4868,
    sunCore: 0xffebd6,
    sunRim: 0xe86248,
    sunCorona: 0xd87462,
    sunVis: 0.32,
    moonCore: 0xeef5ff,
    moonShadow: 0x4d4e7a,
    moonCorona: 0x8ab4f8,
    moonVis: 0.82,
    starAlpha: 0.72,
    cloudWarm: 0xc88aa8,
    cloudCool: 0x3d3866,
    sunPos: [-0.28, 0.04, 0.96],
    moonPos: [0.22, 0.24, -0.95],
    keyLightPos: [-0.43, 0.58, 0.69],
    sunLightColor: 0xc898d8,
    sunIntensity: 1.12,
    hemiSky: 0x72649e,
    hemiGround: 0x342c44,
    hemiIntensity: 0.62,
    ambIntensity: 0.16,
    worldTint: [0.58, 0.54, 0.72],
    waterTint: [0.52, 0.50, 0.68],
    windowGlow: 0.96,
    daylight: 0.46,
  },
  {
    // Starlit Moonlit Night (t = 0.96)
    t: 0.96,
    zen: 0x0d1734,
    mid: 0x1a2d58,
    hor: 0x2b4372,
    fog: 0x253a64,
    sunCore: 0xfff9dc,
    sunRim: 0xff7838,
    sunCorona: 0xff8844,
    sunVis: 0.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x455882,
    moonCorona: 0x8ab4f8,
    moonVis: 1.0,
    starAlpha: 1.0,
    cloudWarm: 0xa4c0ee,
    cloudCool: 0x2e426b,
    sunPos: [-0.28, -0.25, 0.92],
    moonPos: [-0.14, 0.27, -0.95],
    keyLightPos: [-0.42, 0.64, 0.64],
    sunLightColor: 0xa8c4f8,
    sunIntensity: 0.84,
    hemiSky: 0x4668ad,
    hemiGround: 0x1e2b46,
    hemiIntensity: 0.60,
    ambIntensity: 0.16,
    worldTint: [0.24, 0.34, 0.56],
    waterTint: [0.22, 0.32, 0.54],
    windowGlow: 1.0,
    daylight: 0.26,
  },
  {
    // Wrap to 1.00 (matches t = 0.00)
    t: 1.00,
    zen: 0x0d1734,
    mid: 0x1a2d58,
    hor: 0x2b4372,
    fog: 0x253a64,
    sunCore: 0xfff9dc,
    sunRim: 0xff7838,
    sunCorona: 0xff8844,
    sunVis: 0.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x455882,
    moonCorona: 0x8ab4f8,
    moonVis: 1.0,
    starAlpha: 1.0,
    cloudWarm: 0xa4c0ee,
    cloudCool: 0x2e426b,
    sunPos: [-0.24, 0.12, 0.96],
    moonPos: [-0.14, 0.27, -0.95],
    keyLightPos: [-0.42, 0.64, 0.64],
    sunLightColor: 0xa8c4f8,
    sunIntensity: 0.82,
    hemiSky: 0x4668ad,
    hemiGround: 0x1e2b46,
    hemiIntensity: 0.58,
    ambIntensity: 0.16,
    worldTint: [0.24, 0.34, 0.56],
    waterTint: [0.22, 0.32, 0.54],
    windowGlow: 1.0,
    daylight: 0.26,
  },
].map((k) => ({
  ...k,
  zen: linearColor(k.zen),
  mid: linearColor(k.mid),
  hor: linearColor(k.hor),
  fog: linearColor(k.fog),
  sunCore: linearColor(k.sunCore),
  sunRim: linearColor(k.sunRim),
  sunCorona: linearColor(k.sunCorona),
  moonCore: linearColor(k.moonCore),
  moonShadow: linearColor(k.moonShadow),
  moonCorona: linearColor(k.moonCorona),
  cloudWarm: linearColor(k.cloudWarm),
  cloudCool: linearColor(k.cloudCool),
  sunLightColor: linearColor(k.sunLightColor),
  hemiSky: linearColor(k.hemiSky),
  hemiGround: linearColor(k.hemiGround),
  worldTint: new THREE.Color(...k.worldTint),
  waterTint: new THREE.Color(...k.waterTint),
  sunVec: new THREE.Vector3(...k.sunPos).normalize(),
  moonVec: new THREE.Vector3(...k.moonPos).normalize(),
  keyLightVec: new THREE.Vector3(...(k.keyLightPos || [-0.48, 0.68, 0.55])).normalize(),
}));

export function createTimeOfDaySky({
  quality = 'high',
  seed = 20261029,
  camera = null,
} = {}) {
  const rand = mulberry32(seed);
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'skyTodRoot';

  const sunDir = new THREE.Vector3(-0.21, 0.28, -0.93).normalize();
  const moonDir = new THREE.Vector3(-0.14, 0.27, -0.95).normalize();
  // 3/4 SW-Up motivated key direction so north-facing views light the front/west planes and shade east/rear planes!
  const activeLightDir = new THREE.Vector3(-0.48, 0.68, 0.55).normalize();
  const eclipseDir = new THREE.Vector3(0, 0.42, -0.9075).normalize();
  const _tmpEclipseDir = new THREE.Vector3();

  const sun = new THREE.DirectionalLight(0xfff0d0, 1.65);
  sun.name = 'todDirectionalLight';
  sun.position.copy(activeLightDir).multiplyScalar(120);
  sun.target.position.set(0, 0, 0);

  const fill = new THREE.DirectionalLight(0x9ec4f5, 0.28);
  fill.name = 'todFillLight';
  fill.position.set(55, 36, -42);

  const hemi = new THREE.HemisphereLight(0xc2dfff, 0x62764c, 0.72);
  hemi.name = 'todHemiLight';

  const ambient = new THREE.AmbientLight(0xd4e8ff, 0.14);
  ambient.name = 'todAmbientLight';

  group.add(sun, sun.target, fill, hemi, ambient);

  // 1. Sky Dome
  const skyUniforms = {
    uZenith: { value: linearColor(0x1a6bcc) },
    uMid: { value: linearColor(0x5aa2e0) },
    uHorizon: { value: linearColor(0xdff0f5) },
    uFog: { value: linearColor(0xd8eef5) },
    uSunCore: { value: linearColor(0xfff9dc) },
    uSunRim: { value: linearColor(0xffcf68) },
    uSunCorona: { value: linearColor(0xffe29a) },
    uSunDir: { value: sunDir.clone() },
    uSunVis: { value: 1.0 },
    uMoonCore: { value: linearColor(0xeef5ff) },
    uMoonShadow: { value: linearColor(0x455882) },
    uMoonCorona: { value: linearColor(0x8ab4f8) },
    uMoonDir: { value: moonDir.clone() },
    uMoonVis: { value: 0.0 },
    uStarAlpha: { value: 0.0 },
    uTime: { value: 0.0 },
    uEclipseWeight: { value: 0.0 },
    uEclipseDir: { value: eclipseDir.clone() },
  };

  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(520, low ? 32 : 48, low ? 20 : 32),
    skyMat
  );
  dome.name = 'todSkyDome';
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  group.add(dome);

  // 2. Ring of 10 Billowing Flat-Bottomed Anime Cumulus Clouds (r = 165..255m, y = 34..58m)
  // Batched into a single draw call while preserving individual vertical bob and ring drift!
  const cloudUniforms = {
    uLightDir: { value: activeLightDir.clone() },
    uWarm: { value: linearColor(0xfffaf0) },
    uCool: { value: linearColor(0xb8d0ee) },
    uHaze: { value: linearColor(0xd8eef5) },
    uHazeStart: { value: 150.0 },
    uHazeEnd: { value: 380.0 },
    uTime: { value: 0.0 },
    uEclipseWeight: { value: 0.0 },
    uEclipseCompression: { value: 0.0 },
    uEclipseDir: { value: eclipseDir.clone() },
  };

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: cloudUniforms,
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    fog: false,
    toneMapped: false,
  });

  // Curated azimuths for the 10 clouds around the valley perimeter so they frame
  // the NNW Day Sun / Night Moon and the SSW/SSE Sunset vistas without blocking the discs
  const cloudAzimuths = [
    -2.32, // NW-West (left of NNW Sun/Moon)
    -1.26, // NNE (right of NNW Sun/Moon)
    -0.68, // NE (framing Shrine & Arena)
    -0.12, // East (above Wisteria Arena)
    0.45,  // ESE
    0.96,  // SE (left of rising Moon in Evening lookback)
    1.62,  // South
    2.28,  // SW (right of setting Sun in Evening lookback)
    2.76,  // WSW (above Millpond & Waterfall)
    -2.82, // WNW (framing Waterfall & Mill)
  ];

  const cloudGeos = [];
  const cloudCount = 10;
  for (let i = 0; i < cloudCount; i++) {
    const az = cloudAzimuths[i];
    const radius = 172 + (i % 3) * 28 + rand() * 14; // 172m .. 242m (within 165..255m)
    const baseY = 35 + (i % 3) * 6 + rand() * 5;     // 35m .. 52m (within 34..58m)
    const size = 36 + (i % 2) * 10 + rand() * 10;
    const puffs = low ? 7 : 9 + (i % 3);

    const geo = buildCumulusGeometry(rand, {
      size,
      detail: low ? 0 : 1,
      puffs,
      phase: i * 1.37,
    });
    if (!geo) continue;

    const mat4 = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(az) * radius, baseY, Math.sin(az) * radius),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -az + Math.PI * 0.5),
      new THREE.Vector3(1, 1, 1)
    );
    geo.applyMatrix4(mat4);
    cloudGeos.push(geo);
  }

  const mergedCloudsGeo = mergeGeometries(cloudGeos, false);
  for (const g of cloudGeos) g.dispose();

  const cloudMesh = new THREE.Mesh(mergedCloudsGeo, cloudMat);
  cloudMesh.name = 'todCumulusRing';
  cloudMesh.frustumCulled = false;
  group.add(cloudMesh);

  // -------------------------------------------------------------------------
  // 3. 360° 3D Under-Canopy Slanted Sunbeam Shafts (Strictly Below Tree Crowns, 1 Draw Call)
  // -------------------------------------------------------------------------
  const sunbeamUniforms = {
    uTime: { value: 0.0 },
    uBeamColor: { value: linearColor(0xffe898) },
    uStrength: { value: 1.0 },
  };

  // Every shaft is tucked strictly under the tree canopy (y = groundY + 2.6m, len = 5.4m)
  // so beams slant from the lower branches (y ~ 5.0m) to the grass/flowers (y ~ 0.2m) and NEVER poke into the sky!
  const sunbeamAnchors = [
    // Southern Flower Field Lobby (under left & right wisteria canopies at z = 122..136)
    { x: -21.0, y: 3.8, z: 123.5, rTop: 0.75, rBot: 1.65, len: 5.6, tiltX: -0.18, tiltZ: -0.58, phase: 0.4 },
    { x: -18.5, y: 3.6, z: 129.5, rTop: 0.70, rBot: 1.55, len: 5.4, tiltX: -0.16, tiltZ: -0.60, phase: 1.7 },
    { x: -15.5, y: 3.5, z: 134.5, rTop: 0.65, rBot: 1.45, len: 5.2, tiltX: -0.15, tiltZ: -0.56, phase: 2.9 },
    { x:  21.0, y: 3.8, z: 124.0, rTop: 0.75, rBot: 1.65, len: 5.6, tiltX: -0.18, tiltZ:  0.58, phase: 1.1 },
    { x:  18.5, y: 3.6, z: 130.0, rTop: 0.70, rBot: 1.55, len: 5.4, tiltX: -0.16, tiltZ:  0.60, phase: 2.3 },
    { x:  15.5, y: 3.5, z: 135.0, rTop: 0.65, rBot: 1.45, len: 5.2, tiltX: -0.15, tiltZ:  0.56, phase: 3.8 },
    // South Winding Road Groves
    { x: -16.5, y: 3.2, z: 102.0, rTop: 0.70, rBot: 1.50, len: 5.2, tiltX: -0.20, tiltZ: -0.52, phase: 0.9 },
    { x:  16.5, y: 3.2, z: 96.0,  rTop: 0.70, rBot: 1.50, len: 5.2, tiltX: -0.20, tiltZ:  0.52, phase: 2.1 },
    // Town Plaza & Cottages (under hillside wisteria trees behind the cottages)
    { x: -18.5, y: 3.4, z: -20.0, rTop: 0.75, rBot: 1.60, len: 5.4, tiltX: -0.22, tiltZ: -0.48, phase: 1.5 },
    { x:  18.5, y: 3.4, z: -20.0, rTop: 0.75, rBot: 1.60, len: 5.4, tiltX: -0.22, tiltZ:  0.48, phase: 2.8 },
    // East Wisteria Combat Arena
    { x:  44.0, y: 3.6, z: 14.0,  rTop: 0.80, rBot: 1.70, len: 5.6, tiltX: -0.22, tiltZ: -0.48, phase: 1.9 },
    { x:  52.0, y: 3.6, z: -14.0, rTop: 0.80, rBot: 1.70, len: 5.6, tiltX: -0.22, tiltZ:  0.48, phase: 3.3 },
    // North Shrine Staircase Groves
    { x: -14.0, y: 6.2, z: -48.0, rTop: 0.70, rBot: 1.50, len: 5.2, tiltX: -0.22, tiltZ: -0.50, phase: 1.2 },
    { x:  14.0, y: 6.2, z: -48.0, rTop: 0.70, rBot: 1.50, len: 5.2, tiltX: -0.22, tiltZ:  0.50, phase: 2.6 },
  ];

  const beamGeos = [];
  for (let i = 0; i < sunbeamAnchors.length; i++) {
    const b = sunbeamAnchors[i];
    const cyl = new THREE.CylinderGeometry(b.rTop, b.rBot, b.len, 10, 1, true);
    const rotM = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(b.tiltX, 0, b.tiltZ));
    rotM.setPosition(b.x, b.y, b.z);
    cyl.applyMatrix4(rotM);
    const g = cyl.index ? cyl.toNonIndexed() : cyl;
    const vCount = g.attributes.position.count;
    const phaseAttr = new Float32Array(vCount);
    phaseAttr.fill(b.phase);
    g.setAttribute('aBeamPhase', new THREE.BufferAttribute(phaseAttr, 1));
    beamGeos.push(g);
  }

  const mergedBeamsGeo = mergeGeometries(beamGeos, false);
  for (const g of beamGeos) g.dispose();

  const sunbeamMat = new THREE.ShaderMaterial({
    uniforms: sunbeamUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aBeamPhase;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying float vViewDist;
      varying float vPhase;
      void main() {
        vUv = uv;
        vPhase = aBeamPhase;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDist = -mv.z;
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uBeamColor;
      uniform float uStrength;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying float vViewDist;
      varying float vPhase;
      void main() {
        // Cylindrical edge Fresnel so shafts are 100% seamless from all 360° camera angles
        float edgeFresnel = pow(abs(normalize(vViewNormal).z), 2.2);
        float vertFade = smoothstep(0.0, 0.32, vUv.y) * (1.0 - smoothstep(0.62, 1.0, vUv.y));
        float distFade = smoothstep(8.0, 15.0, vViewDist) * (1.0 - smoothstep(48.0, 88.0, vViewDist));
        float flute = 0.45 + 0.55 * pow(sin(vUv.x * 25.1327 + vPhase + uTime * 0.25) * 0.5 + 0.5, 2.0);
        float alpha = edgeFresnel * vertFade * distFade * flute * 0.20 * uStrength;
        gl_FragColor = vec4(uBeamColor, clamp(alpha, 0.0, 0.24));
      }
    `,
  });

  const sunbeamMesh = new THREE.Mesh(mergedBeamsGeo, sunbeamMat);
  sunbeamMesh.name = 'todCanopySunbeams';
  sunbeamMesh.frustumCulled = false;
  group.add(sunbeamMesh);

  // -------------------------------------------------------------------------
  // 4. Option 2 + Option 4 Layered 3D Valley & Foothill Mist Cushions (1 Draw Call)
  // -------------------------------------------------------------------------
  const mistCushionUniforms = {
    uTime: { value: 0.0 },
    uMistCool: { value: linearColor(0xdcf2ff) },
    uMistWarm: { value: linearColor(0xfff5dc) },
    uSunDir: { value: sunDir.clone() },
    uMistOpacity: { value: 1.0 },
  };

  const mistRings = [
    { x: 0,   y: 1.8, z: 0,   r: 68,  h: 4.8, segs: 44, layer: 0.30 },
    { x: 0,   y: 2.6, z: 0,   r: 112, h: 6.8, segs: 48, layer: 0.44 },
    { x: 0,   y: 6.8, z: 0,   r: 168, h: 15.0, segs: 52, layer: 0.72 },
    { x: 0,   y: 10.5, z: 0,  r: 222, h: 21.0, segs: 52, layer: 0.85 },
  ];

  const mistGeos = [];
  for (let i = 0; i < mistRings.length; i++) {
    const m = mistRings[i];
    const cyl = new THREE.CylinderGeometry(m.r, m.r * 1.04, m.h, m.segs, 1, true);
    cyl.translate(m.x, m.y, m.z);
    const g = cyl.index ? cyl.toNonIndexed() : cyl;
    const vCount = g.attributes.position.count;
    const layerAttr = new Float32Array(vCount);
    layerAttr.fill(m.layer);
    g.setAttribute('aMistLayer', new THREE.BufferAttribute(layerAttr, 1));
    mistGeos.push(g);
  }

  const mergedMistGeo = mergeGeometries(mistGeos, false);
  for (const g of mistGeos) g.dispose();

  const mistCushionMat = new THREE.ShaderMaterial({
    uniforms: mistCushionUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aMistLayer;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vViewDist;
      varying float vLayer;
      void main() {
        vUv = uv;
        vLayer = aMistLayer;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vViewDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uMistCool;
      uniform vec3 uMistWarm;
      uniform vec3 uSunDir;
      uniform float uMistOpacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vViewDist;
      varying float vLayer;

      float hashM(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noiseM(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hashM(i), hashM(i + vec2(1.0, 0.0)), u.x),
          mix(hashM(i + vec2(0.0, 1.0)), hashM(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        // Billowy cloud-topped upper contour (Option 2 + Option 4 foothill mist banks)
        float n1 = noiseM(vec2(vUv.x * 16.0 - uTime * 0.03, vUv.y * 2.2 + vLayer * 5.0));
        float n2 = noiseM(vec2(vUv.x * 32.0 + uTime * 0.02, vUv.y * 4.2 - vLayer * 3.1));
        float cloudLobe = (n1 * 0.65 + n2 * 0.35 - 0.5) * 0.28;
        float vertBell = smoothstep(0.0, 0.32, vUv.y) * (1.0 - smoothstep(0.46 + cloudLobe, 0.96, vUv.y));
        // Keep foreground & close midground (< 38m) crystal-clear; bloom mist in far midground & foothills
        float nearFade = smoothstep(38.0, 78.0, vViewDist) * (1.0 - smoothstep(250.0, 350.0, vViewDist));
        float billow = smoothstep(0.24, 0.78, n1 * 0.65 + n2 * 0.35);

        vec3 V = normalize(cameraPosition - vWorldPos);
        float sunForward = pow(clamp(dot(-V, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0), 2.2);
        vec3 col = mix(uMistCool, uMistWarm, sunForward * 0.60);

        float alpha = vertBell * nearFade * billow * vLayer * 0.34 * uMistOpacity;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.38));
      }
    `,
  });

  const mistCushionMesh = new THREE.Mesh(mergedMistGeo, mistCushionMat);
  mistCushionMesh.name = 'todValleyMistCushions';
  mistCushionMesh.frustumCulled = false;
  group.add(mistCushionMesh);

  // -------------------------------------------------------------------------
  // 5. True 360° Toroidal 3D Ground-Skimming Petals & Calligraphic 3D Wind Swirls
  //    (Wraps 360° around cameraPosition everywhere in the valley — Day, Dusk & Night!)
  // -------------------------------------------------------------------------
  const livingAirUniforms = {
    uTime: { value: 0.0 },
    uCamPos: { value: new THREE.Vector3(0, 2, 128) },
    uDaylight: { value: 1.0 },
    uWindTint: { value: new THREE.Color(0.92, 0.98, 1.06) },
    uEclipsePetalWeight: { value: 0.0 },
  };

  // 5A. 360° Toroidal 3D Ground-Skimming Cupped Blossom Petals & Spirit Motes (460 instances, 1 draw call)
  const petalGeo = new THREE.PlaneGeometry(0.24, 0.16, 2, 2);
  const pPos = petalGeo.attributes.position;
  for (let i = 0; i < pPos.count; i++) {
    const px = pPos.getX(i);
    const py = pPos.getY(i);
    // Cup the 3D petal along Z so it catches light from all 3D angles
    pPos.setZ(i, (px * px * 2.2 + py * py * 1.5) * 0.30);
  }
  petalGeo.computeVertexNormals();

  const petalCount = low ? 260 : 460;
  const petalInstGeo = petalGeo.index ? petalGeo.toNonIndexed() : petalGeo;
  const instSeeds = new Float32Array(petalCount * 4);
  for (let i = 0; i < petalCount; i++) {
    instSeeds[i * 4 + 0] = (rand() - 0.5) * 36.0; // toroidal X offset (-18..+18m)
    // Weight 75% of petals into the low ground-skimming / flower-top layer (0.15m..1.85m)!
    instSeeds[i * 4 + 1] = Math.pow(rand(), 1.85) * 3.8;
    instSeeds[i * 4 + 2] = (rand() - 0.5) * 36.0; // toroidal Z offset (-18..+18m)
    instSeeds[i * 4 + 3] = rand();                 // 0..0.72 = sakura/wisteria petal, 0.72..1.0 = golden/lunar spirit mote
  }
  const instPetalsGeo = new THREE.InstancedBufferGeometry();
  instPetalsGeo.setAttribute('position', petalInstGeo.attributes.position);
  instPetalsGeo.setAttribute('normal', petalInstGeo.attributes.normal);
  instPetalsGeo.setAttribute('uv', petalInstGeo.attributes.uv);
  instPetalsGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(instSeeds, 4));
  instPetalsGeo.instanceCount = petalCount;

  const petalMat = new THREE.ShaderMaterial({
    uniforms: livingAirUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform vec3 uCamPos;
      varying vec2 vUv;
      varying float vTypeSeed;
      varying float vAlphaFade;

      void main() {
        vUv = uv;
        vTypeSeed = aSeed.w;
        bool isMote = vTypeSeed > 0.72;

        // Drift along prevailing valley wind in a 360° 3D toroidal box around uCamPos
        vec3 windVel = isMote
          ? vec3(0.85, 0.16, 0.58)
          : vec3(2.35, -0.32, 1.62);
        vec3 boxSpan = vec3(36.0, 3.8, 36.0);
        vec3 rawPos = aSeed.xyz + windVel * uTime;
        // Swooping ground-skimming eddy motion
        rawPos.x += sin(uTime * 1.6 + aSeed.w * 19.0) * 0.82;
        rawPos.y += cos(uTime * 1.4 + aSeed.x * 0.6) * 0.28;
        rawPos.z += sin(uTime * 1.5 + aSeed.z * 0.6) * 0.82;

        vec3 rel = mod(rawPos - uCamPos + boxSpan * 0.5, boxSpan) - boxSpan * 0.5;
        vec3 worldCenter = uCamPos + rel;
        // Anchor vertical band relative to ground-level / hero waist height below camera
        float hOffset = mod(rawPos.y, boxSpan.y);
        // Weight low-seed instances tightly near the ground (0.18m..1.65m above ground)
        float lowBias = mix(0.38, 1.0, fract(aSeed.w * 13.7));
        worldCenter.y = max(0.22, (uCamPos.y - 2.85) + hOffset * lowBias);

        // 3D tumbling & banking rotation for petals
        float ang1 = uTime * (2.6 + aSeed.w * 2.0) + aSeed.x;
        float ang2 = uTime * (1.9 + aSeed.w * 1.5) + aSeed.z;
        float c1 = cos(ang1), s1 = sin(ang1);
        float c2 = cos(ang2), s2 = sin(ang2);
        mat3 rot3D = mat3(
          c1, s1 * s2, s1 * c2,
          0.0, c2, -s2,
          -s1, c1 * s2, c1 * c2
        );

        float scale = isMote ? (0.42 + 0.20 * sin(uTime * 3.2 + aSeed.w * 25.0)) : (0.85 + fract(aSeed.w * 7.3) * 0.52);
        vec3 localP = rot3D * (position * scale);
        vec3 wp = worldCenter + localP;

        float dist = length(wp - uCamPos);
        vAlphaFade = smoothstep(1.6, 3.4, dist) * (1.0 - smoothstep(14.5, 19.5, dist));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDaylight;
      uniform float uEclipsePetalWeight;
      varying vec2 vUv;
      varying float vTypeSeed;
      varying float vAlphaFade;

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float ecPetal = clamp(uEclipsePetalWeight, 0.0, 1.0);
        if (ecPetal > 0.5) {
          // During Eclipse / Smite, artoriousVfx renders 40..240 3D rose petals; keep only crisp opaque ruby petals
          // so zero semi-transparent petals alpha-blend with grey cobblestones (which turned black in B&W Smite!)
          if (vTypeSeed > 0.18 || vAlphaFade < 0.82) discard;
          float notch = 0.26 * exp(-pow(p.x * 3.5, 2.0)) * step(0.0, p.y);
          float yShift = p.y + 0.18 * p.x * p.x + notch;
          float r = length(vec2(p.x * 0.88, yShift * 1.28));
          if (r > 0.72) discard;
          float coreHighlight = 1.0 - smoothstep(0.0, 0.68, r);
          vec3 rubyPetal = mix(vec3(0.42, 0.001, 0.026), vec3(0.84, 0.002, 0.048), coreHighlight);
          gl_FragColor = vec4(rubyPetal, 1.0);
          return;
        }
        if (vTypeSeed > 0.72) {
          // Sparkling golden-white (Day) / silver-cyan (Night) anime spirit mote
          float r = length(p);
          float glow = exp(-r * r * 5.0);
          vec3 moteCol = mix(vec3(0.76, 0.94, 1.18), vec3(1.32, 1.16, 0.78), uDaylight);
          vec3 crimsonMote = vec3(0.753, 0.012, 0.055); // #e11d48
          moteCol = mix(moteCol, crimsonMote, ecPetal);
          gl_FragColor = vec4(moteCol, glow * vAlphaFade * 0.94);
        } else {
          // Notched anime sakura/wisteria blossom petal silhouette
          float notch = 0.26 * exp(-pow(p.x * 3.5, 2.0)) * step(0.0, p.y);
          float yShift = p.y + 0.18 * p.x * p.x + notch;
          float r = length(vec2(p.x * 0.88, yShift * 1.28));
          float petalShape = 1.0 - smoothstep(0.68, 0.92, r);
          if (petalShape < 0.02) discard;
          float coreHighlight = 1.0 - smoothstep(0.0, 0.68, r);
          vec3 sakuraCol = mix(vec3(0.98, 0.48, 0.78), vec3(1.14, 0.82, 0.96), coreHighlight);
          vec3 wisteriaCol = mix(vec3(0.78, 0.46, 0.98), vec3(1.04, 0.80, 1.14), coreHighlight);
          vec3 basePetal = mix(sakuraCol, wisteriaCol, clamp(vTypeSeed / 0.72, 0.0, 1.0));
          // Keep petals softly moonlit at Night (0.68 minimum) so they shimmer in moonlight too!
          vec3 litPetal = mix(basePetal * vec3(0.68, 0.74, 0.92), basePetal, uDaylight);
          // Shift ambient petals to deep velvet blood-crimson (#881327 -> #e11d48) during Prayer/Eclipse
          vec3 crimsonPetal = mix(vec3(0.248, 0.006, 0.020), vec3(0.753, 0.012, 0.055), coreHighlight);
          litPetal = mix(litPetal, crimsonPetal, ecPetal);
          gl_FragColor = vec4(litPetal, petalShape * vAlphaFade * 0.94);
        }
      }
    `,
  });

  const livingAirPetalsMesh = new THREE.Mesh(instPetalsGeo, petalMat);
  livingAirPetalsMesh.name = 'todLivingAirPetals3D';
  livingAirPetalsMesh.frustumCulled = false;
  group.add(livingAirPetalsMesh);

  // 5B. Artistic Double-Stranded Calligraphic 3D Wind Gust Swirls (Visible Day, Dusk & Night! 1 Draw Call)
  function buildCalligraphicWindChordGeo() {
    const strands = [
      // Primary sweeping calligraphic stroke with trailing upward spiral curl
      { len: 10.5, halfW: 0.048, yOff: 0.0,  zOff: 0.0,  curlAmp: 0.52, strandId: 0.0 },
      // Companion harmony silk thread offset in 3D space
      { len: 7.8,  halfW: 0.028, yOff: 0.34, zOff: 0.28, curlAmp: 0.36, strandId: 0.35 },
    ];
    const parts = [];
    const segs = 28;
    for (const st of strands) {
      const g = new THREE.PlaneGeometry(st.len, st.halfW * 2.0, segs, 1);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const yLocal = pos.getY(i);
        const u = clamp01((x / st.len) + 0.5); // 0 (tail) -> 1 (leading head)
        // Calligraphic brush width taper: fine hair-line tail -> expressive mid-swell -> tapered point
        const brushTaper = Math.sin(Math.pow(u, 0.75) * Math.PI);
        // Graceful 3D S-wave + trailing spiral whorl near tail (u < 0.35)
        const tailCurl = Math.pow(Math.max(0, 1.0 - u * 2.2), 2.0);
        const waveY = Math.sin(u * Math.PI * 2.2) * st.curlAmp + Math.sin(u * 14.0) * tailCurl * 0.38;
        const waveZ = Math.cos(u * Math.PI * 1.6) * (st.curlAmp * 0.9) + Math.cos(u * 14.0) * tailCurl * 0.32;
        pos.setY(i, st.yOff + waveY + yLocal * brushTaper);
        pos.setZ(i, st.zOff + waveZ);
      }
      g.computeVertexNormals();
      const nonIdx = g.index ? g.toNonIndexed() : g;
      const vCount = nonIdx.attributes.position.count;
      const strandArr = new Float32Array(vCount);
      strandArr.fill(st.strandId);
      nonIdx.setAttribute('aStrandOffset', new THREE.BufferAttribute(strandArr, 1));
      parts.push(nonIdx);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged;
  }

  const ribbonBaseGeo = buildCalligraphicWindChordGeo();
  const ribbonCount = low ? 14 : 24;
  const ribbonSeeds = new Float32Array(ribbonCount * 4);
  for (let i = 0; i < ribbonCount; i++) {
    ribbonSeeds[i * 4 + 0] = (rand() - 0.5) * 48.0;
    ribbonSeeds[i * 4 + 1] = 0.6 + rand() * 3.4;
    ribbonSeeds[i * 4 + 2] = (rand() - 0.5) * 48.0;
    ribbonSeeds[i * 4 + 3] = rand() * 6.28318;
  }
  const instRibbonGeo = new THREE.InstancedBufferGeometry();
  instRibbonGeo.setAttribute('position', ribbonBaseGeo.attributes.position);
  instRibbonGeo.setAttribute('normal', ribbonBaseGeo.attributes.normal);
  instRibbonGeo.setAttribute('uv', ribbonBaseGeo.attributes.uv);
  instRibbonGeo.setAttribute('aStrandOffset', ribbonBaseGeo.attributes.aStrandOffset);
  instRibbonGeo.setAttribute('aRibbonSeed', new THREE.InstancedBufferAttribute(ribbonSeeds, 4));
  instRibbonGeo.instanceCount = ribbonCount;

  const windRibbonMat = new THREE.ShaderMaterial({
    uniforms: livingAirUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aStrandOffset;
      attribute vec4 aRibbonSeed;
      uniform float uTime;
      uniform vec3 uCamPos;
      varying vec2 vUv;
      varying float vPhase;
      varying float vDistFade;

      void main() {
        vUv = uv;
        vPhase = aRibbonSeed.w + aStrandOffset;

        // Align 3D calligraphic wind chord with valley wind direction + per-instance yaw wave
        float yaw = -0.61 + sin(aRibbonSeed.w) * 0.28;
        float cy = cos(yaw), sy = sin(yaw);
        mat3 rotY = mat3(
          cy, 0.0, sy,
          0.0, 1.0, 0.0,
          -sy, 0.0, cy
        );

        vec3 boxSpan = vec3(48.0, 3.8, 48.0);
        vec3 drift = vec3(0.82, 0.02, 0.57) * (uTime * 3.4);
        vec3 rel = mod(aRibbonSeed.xyz + drift - uCamPos + boxSpan * 0.5, boxSpan) - boxSpan * 0.5;
        vec3 center = uCamPos + rel;
        center.y = max(0.65, uCamPos.y - 2.1 + mod(aRibbonSeed.y + sin(uTime * 0.5 + aRibbonSeed.w) * 0.4, 3.8));

        vec3 animatedLocal = position;
        animatedLocal.y += sin(uv.x * 6.28318 - uTime * 3.0 + vPhase) * 0.16;
        vec3 wp = center + rotY * animatedLocal;

        float dist = length(wp - uCamPos);
        vDistFade = smoothstep(4.2, 8.5, dist) * (1.0 - smoothstep(20.0, 27.0, dist));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uWindTint;
      uniform float uEclipsePetalWeight;
      varying vec2 vUv;
      varying float vPhase;
      varying float vDistFade;

      void main() {
        // Silky anti-aliased cross-section with bright core & soft feathered aura
        float edgeDist = clamp(abs(vUv.y - 0.5) * 2.0, 0.0, 1.0);
        float acrossFade = pow(1.0 - edgeDist, 1.85);
        float endFade = smoothstep(0.0, 0.20, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));

        // Flowing calligraphic wind-gust ribbon with a bright leading head & long silky trail
        float gustHead = fract(uTime * 0.36 + vPhase * 0.15915);
        float trail = smoothstep(gustHead - 0.56, gustHead, vUv.x) * (1.0 - smoothstep(gustHead, gustHead + 0.05, vUv.x));
        float headSpark = exp(-pow((vUv.x - gustHead) * 18.0, 2.0)) * 0.65;

        // Iridescent color gradient from warm/silver leading head to sky-cyan/lavender tail
        vec3 tailCol = uWindTint * vec3(0.82, 0.94, 1.08);
        vec3 headCol = uWindTint * vec3(1.12, 1.08, 0.98);
        vec3 col = mix(tailCol, headCol, clamp(trail + headSpark, 0.0, 1.0));
        col = mix(col, vec3(0.68, 0.012, 0.042), clamp(uEclipsePetalWeight, 0.0, 1.0));

        float alpha = acrossFade * endFade * (trail * 0.42 + headSpark * 0.35) * vDistFade;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.48));
      }
    `,
  });

  const windRibbonMesh = new THREE.Mesh(instRibbonGeo, windRibbonMat);
  windRibbonMesh.name = 'todWindRibbons3D';
  windRibbonMesh.frustumCulled = false;
  group.add(windRibbonMesh);

  // Current interpolated state exposed for world materials sync
  const state = {
    t: 0.34,
    mode: 'day',
    daylight: 1.0,
    windowGlow: 0.0,
    fogColor: new THREE.Color(0xd8eef5),
    worldTint: new THREE.Color(1, 1, 1),
    waterTint: new THREE.Color(1, 1, 1),
    sunDir,
    moonDir,
    activeLightDir,
    eclipseWeight: 0.0,
    eclipseCompression: 0.0,
    windTimeScale: 1.0,
    eclipseDir,
  };

  function syncEclipseUniforms() {
    skyUniforms.uEclipseWeight.value = state.eclipseWeight;
    skyUniforms.uEclipseDir.value.copy(state.eclipseDir);
    cloudUniforms.uEclipseWeight.value = state.eclipseWeight;
    cloudUniforms.uEclipseCompression.value = state.eclipseCompression;
    cloudUniforms.uEclipseDir.value.copy(state.eclipseDir);
    livingAirUniforms.uEclipsePetalWeight.value = state.eclipseWeight;
  }

  function setEclipseState({
    weight = 0.0,
    compression = 0.0,
    windTimeScale = 1.0,
    dir = null,
    camera: camOverride = null,
  } = {}) {
    if (weight !== undefined && weight !== null) {
      state.eclipseWeight = clamp01(Number(weight) || 0);
    }
    if (compression !== undefined && compression !== null) {
      state.eclipseCompression = clamp01(Number(compression) || 0);
    }
    if (windTimeScale !== undefined && windTimeScale !== null) {
      const wts = Number(windTimeScale);
      state.windTimeScale = Number.isFinite(wts) ? Math.max(0, wts) : 1.0;
    }

    const activeCam = camOverride || camera;
    let hx = 0;
    let hz = -1;
    let hasDir = false;

    if (dir && Number.isFinite(dir.x) && Number.isFinite(dir.z)) {
      hx = dir.x;
      hz = dir.z;
      hasDir = true;
    } else if (activeCam && typeof activeCam.getWorldDirection === 'function') {
      activeCam.getWorldDirection(_tmpEclipseDir);
      hx = _tmpEclipseDir.x;
      hz = _tmpEclipseDir.z;
      hasDir = true;
    }

    if (hasDir) {
      const hLen = Math.hypot(hx, hz);
      if (hLen > 1e-5) {
        hx /= hLen;
        hz /= hLen;
      } else {
        hx = 0;
        hz = -1;
      }
      const elevY = 0.42;
      const horizScale = Math.sqrt(Math.max(0, 1.0 - elevY * elevY));
      state.eclipseDir.set(hx * horizScale, elevY, hz * horizScale).normalize();
    }

    syncEclipseUniforms();
    return state;
  }

  function getWindTimeScale() {
    return state.windTimeScale;
  }

  function resolveT(modeOrT) {
    if (typeof modeOrT === 'string') {
      return TOD_PRESETS[modeOrT]?.t ?? 0.34;
    }
    return Number.isFinite(modeOrT) ? ((modeOrT % 1) + 1) % 1 : 0.34;
  }

  function setTimeOfDay(modeOrT) {
    const tt = resolveT(modeOrT);
    state.t = tt;
    if (typeof modeOrT === 'string' && TOD_PRESETS[modeOrT]) {
      state.mode = modeOrT;
    } else {
      state.mode =
        tt >= 0.20 && tt < 0.64
          ? 'day'
          : tt >= 0.64 && tt < 0.80
          ? 'evening'
          : tt >= 0.80 && tt < 0.90
          ? 'twilight'
          : 'night';
    }

    let idx = 0;
    while (idx < TOD_KEYS.length - 2 && TOD_KEYS[idx + 1].t < tt) idx++;
    const a = TOD_KEYS[idx];
    const b = TOD_KEYS[idx + 1];
    const k = THREE.MathUtils.clamp((tt - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);

    skyUniforms.uZenith.value.copy(a.zen).lerp(b.zen, k);
    skyUniforms.uMid.value.copy(a.mid).lerp(b.mid, k);
    skyUniforms.uHorizon.value.copy(a.hor).lerp(b.hor, k);
    skyUniforms.uFog.value.copy(a.fog).lerp(b.fog, k);

    skyUniforms.uSunCore.value.copy(a.sunCore).lerp(b.sunCore, k);
    skyUniforms.uSunRim.value.copy(a.sunRim).lerp(b.sunRim, k);
    skyUniforms.uSunCorona.value.copy(a.sunCorona).lerp(b.sunCorona, k);
    skyUniforms.uSunVis.value = THREE.MathUtils.lerp(a.sunVis, b.sunVis, k);

    skyUniforms.uMoonCore.value.copy(a.moonCore).lerp(b.moonCore, k);
    // Boost lunar core slightly above 1.0 in HDR at Night so UnrealBloomPass gives a soft lunar halo
    const moonVis = THREE.MathUtils.lerp(a.moonVis, b.moonVis, k);
    skyUniforms.uMoonCore.value.multiplyScalar(1.0 + 0.14 * moonVis);
    skyUniforms.uMoonShadow.value.copy(a.moonShadow).lerp(b.moonShadow, k);
    skyUniforms.uMoonCorona.value.copy(a.moonCorona).lerp(b.moonCorona, k);
    skyUniforms.uMoonVis.value = moonVis;
    skyUniforms.uStarAlpha.value = THREE.MathUtils.lerp(a.starAlpha, b.starAlpha, k);

    sunDir.copy(a.sunVec).lerp(b.sunVec, k).normalize();
    moonDir.copy(a.moonVec).lerp(b.moonVec, k).normalize();
    skyUniforms.uSunDir.value.copy(sunDir);
    skyUniforms.uMoonDir.value.copy(moonDir);

    // 3/4 SW-Up motivated key direction for 3D scene geometry & ground shadows
    const moonDominance = smoothstep01(0.80, 0.90, tt) + (1.0 - smoothstep01(0.10, 0.22, tt));
    activeLightDir.copy(a.keyLightVec).lerp(b.keyLightVec, k).normalize();

    cloudUniforms.uLightDir.value.copy(activeLightDir);
    cloudUniforms.uWarm.value.copy(a.cloudWarm).lerp(b.cloudWarm, k);
    cloudUniforms.uCool.value.copy(a.cloudCool).lerp(b.cloudCool, k);
    cloudUniforms.uHaze.value.copy(skyUniforms.uFog.value);

    sun.position.copy(activeLightDir).multiplyScalar(120);
    sun.color.copy(a.sunLightColor).lerp(b.sunLightColor, k);
    sun.intensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, k);

    hemi.color.copy(a.hemiSky).lerp(b.hemiSky, k);
    hemi.groundColor.copy(a.hemiGround).lerp(b.hemiGround, k);
    hemi.intensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, k);

    ambient.color.copy(hemi.color);
    ambient.intensity = THREE.MathUtils.lerp(a.ambIntensity, b.ambIntensity, k);
    fill.intensity = THREE.MathUtils.lerp(0.28, 0.14, clamp01(moonDominance));

    state.daylight = THREE.MathUtils.lerp(a.daylight, b.daylight, k);
    state.windowGlow = THREE.MathUtils.lerp(a.windowGlow, b.windowGlow, k);
    state.fogColor.copy(skyUniforms.uFog.value);
    state.worldTint.copy(a.worldTint).lerp(b.worldTint, k);
    state.waterTint.copy(a.waterTint).lerp(b.waterTint, k);

    // Sync 3D Canopy Sunbeams, Valley Mist Cushions & Toroidal Living Air with Time of Day
    sunbeamUniforms.uBeamColor.value.copy(sun.color).lerp(skyUniforms.uSunCore.value, 0.45);
    sunbeamUniforms.uStrength.value =
      state.mode === 'night' ? 0.42 : state.mode === 'twilight' ? 0.62 : 1.0;
    mistCushionUniforms.uSunDir.value.copy(activeLightDir);
    if (state.mode === 'night') {
      mistCushionUniforms.uMistCool.value.setHex(0x1b2d52);
      mistCushionUniforms.uMistWarm.value.setHex(0x324d80);
      mistCushionUniforms.uMistOpacity.value = 0.52;
      livingAirUniforms.uWindTint.value.setRGB(0.78, 0.92, 1.15); // Luminous silver-cyan night wind!
    } else if (state.mode === 'twilight') {
      mistCushionUniforms.uMistCool.value.setHex(0x483868);
      mistCushionUniforms.uMistWarm.value.setHex(0x9a6484);
      mistCushionUniforms.uMistOpacity.value = 0.64;
      livingAirUniforms.uWindTint.value.setRGB(0.92, 0.84, 1.08); // Indigo-violet dusk wind!
    } else if (state.mode === 'evening') {
      mistCushionUniforms.uMistCool.value.setHex(0x986888);
      mistCushionUniforms.uMistWarm.value.setHex(0xffb278);
      mistCushionUniforms.uMistOpacity.value = 0.72;
      livingAirUniforms.uWindTint.value.setRGB(1.08, 0.88, 0.82); // Warm rose-gold sunset wind!
    } else {
      mistCushionUniforms.uMistCool.value.copy(skyUniforms.uFog.value).lerp(linearColor(0xdcf2ff), 0.35);
      mistCushionUniforms.uMistWarm.value.copy(sun.color).lerp(linearColor(0xfff6e0), 0.45);
      mistCushionUniforms.uMistOpacity.value = 1.0;
      livingAirUniforms.uWindTint.value.setRGB(0.92, 0.98, 1.06); // Pearlescent cyan-ivory day wind!
    }
    livingAirUniforms.uDaylight.value = state.daylight;
    syncEclipseUniforms();

    return state;
  }

  function update(elapsed = 0) {
    skyUniforms.uTime.value = elapsed;
    cloudUniforms.uTime.value = elapsed;
    sunbeamUniforms.uTime.value = elapsed;
    mistCushionUniforms.uTime.value = elapsed;
    livingAirUniforms.uTime.value = elapsed;
    syncEclipseUniforms();
    // Gentle tangential drift so clouds feel alive without shifting out of composition in snapshots
    cloudMesh.rotation.y = Math.sin(elapsed * 0.03) * 0.025;
    if (camera && camera.position) {
      dome.position.copy(camera.position);
      livingAirUniforms.uCamPos.value.copy(camera.position);
    }
  }

  setTimeOfDay('day');

  return {
    group,
    dome,
    cloudMesh,
    sun,
    fill,
    hemi,
    ambient,
    sunDir,
    moonDir,
    activeLightDir,
    state,
    setTimeOfDay,
    setEclipseState,
    getWindTimeScale,
    update,
  };
}

export default createTimeOfDaySky;
