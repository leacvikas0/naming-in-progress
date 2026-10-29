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

    // 1. Painterly vertical sky gradient: horizon -> mid -> zenith
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.005, 0.14, h));
    col = mix(col, uZenith, smoothstep(0.08, 0.46, h));

    // Gentle horizon mist band so distant ridges sit naturally in the atmosphere
    float band = smoothstep(0.095, -0.025, d.y);
    col = mix(col, mix(uHorizon, uFog, 0.42), band * 0.48);

    // Subtle sunset warmth along the sun-side horizon only (zero milky glare wash!)
    vec3 sd = normalize(uSunDir);
    vec3 sunFlat = normalize(vec3(sd.x, 0.0, sd.z));
    vec3 dirFlat = normalize(vec3(d.x, 0.0, d.z) + vec3(0.0, 0.0, 1e-5));
    float azSun = dot(dirFlat, sunFlat) * 0.5 + 0.5;
    float lowHorizonRibbon = exp(-pow((d.y - 0.06) / 0.085, 2.0)) * pow(azSun, 4.0);
    col = mix(col, uSunCorona, lowHorizonRibbon * 0.24 * uSunVis);

    // 2. Flicker-free 3D procedural starfield in upper sky dome (d.y > 0.08)
    if (uStarAlpha > 0.005 && d.y > 0.06) {
      float starFade = smoothstep(0.08, 0.24, d.y);
      vec3 s1 = evalStarLayer(d, 76.0, 0.84, uTime);
      vec3 s2 = evalStarLayer(d + vec3(0.37, 0.19, -0.23), 128.0, 0.87, uTime * 0.8);
      vec3 stars = (s1 * 1.15 + s2 * 0.72) * starFade * uStarAlpha;
      col += stars;
    }

    // 3. Crisp Stylized Anime Sun Disc (two-tone cel core + warm golden/coral rim + tight painterly corona)
    if (uSunVis > 0.005) {
      float angSun = acos(clamp(dot(d, sd), -1.0, 1.0));
      float sunRadius = 0.034;
      float corona = exp(-angSun * 18.0) * 0.14;
      col += uSunCorona * corona * uSunVis;

      float outerDisc = 1.0 - smoothstep(sunRadius - 0.0022, sunRadius + 0.0018, angSun);
      float innerCore = 1.0 - smoothstep(sunRadius * 0.64 - 0.002, sunRadius * 0.64 + 0.002, angSun);
      vec3 sunCelColor = mix(uSunRim, uSunCore, innerCore);
      col = mix(col, sunCelColor, outerDisc * uSunVis);
    }

    // 4. Crisp Stylized Anime Moon (silver-ivory cel disc + lunar mare craters + crescent phase + moonlight ring)
    if (uMoonVis > 0.005) {
      vec3 md = normalize(uMoonDir);
      float angMoon = acos(clamp(dot(d, md), -1.0, 1.0));
      float moonR = 0.031;

      // Soft moonlight corona ring (#8ab4f8)
      float moonCorona = exp(-angMoon * 22.0) * 0.20
                       + smoothstep(moonR * 1.55, moonR * 1.02, angMoon) * 0.14;
      col += uMoonCorona * moonCorona * uMoonVis;

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
        col = mix(col, moonCol, moonMask * uMoonVis);
      }
    }

    // Below horizon fade to fog
    col = mix(col, uFog * 0.94, smoothstep(0.0, -0.16, d.y));

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

  varying vec3 vCloudMeta;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vCloudMeta = aCloudMeta;
    vec3 pos = position;
    pos.y += sin(uTime * 0.18 + aCloudMeta.z) * 0.85;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
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

  varying vec3 vCloudMeta;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormalW);
    float hFactor = vCloudMeta.x;
    float facetVar = vCloudMeta.y;

    float ndl = dot(n, normalize(uLightDir));
    float billow = sin(uTime * 0.22 + vWorldPos.x * 0.04 + vWorldPos.z * 0.03) * 0.06;

    // 2-tone anime cumulus ramp combining flat underside contact shadow + directional sun/moon lighting
    float facetLit = smoothstep(-0.35, 0.72, ndl + billow);
    float crownMix = clamp(hFactor * 0.68 + facetLit * 0.38, 0.0, 1.0);
    float stepTone = smoothstep(0.18, 0.78, crownMix);

    vec3 col = mix(uCool, uWarm, stepTone) * facetVar;
    // Baked flat-base contact darkening so the flat underside reads crisp against the horizon
    col *= (0.82 + 0.18 * hFactor);

    // Subtle backlit silver/gold rim when looking toward the sun or moon
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - abs(dot(n, viewDir)), 2.6);
    float back = pow(max(dot(-viewDir, normalize(uLightDir)), 0.0), 2.0);
    col += uWarm * rim * back * 0.24;

    // Aerial distance haze into the horizon
    float dist = length(vWorldPos - cameraPosition);
    float haze = smoothstep(uHazeStart, uHazeEnd, dist);
    col = mix(col, uHaze, haze * 0.38);

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
    zen: 0x0b132b,
    mid: 0x16264c,
    hor: 0x263b66,
    fog: 0x22355c,
    sunCore: 0xfff9dc,
    sunRim: 0xff7838,
    sunCorona: 0xff8844,
    sunVis: 0.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x455882,
    moonCorona: 0x8ab4f8,
    moonVis: 1.0,
    starAlpha: 1.0,
    cloudWarm: 0x9cb8e8,
    cloudCool: 0x2b3d63,
    sunPos: [-0.24, 0.12, 0.96],
    moonPos: [-0.14, 0.27, -0.95],
    sunLightColor: 0x9cb8f0,
    sunIntensity: 0.65,
    hemiSky: 0x3b5998,
    hemiGround: 0x182238,
    hemiIntensity: 0.52,
    ambIntensity: 0.22,
    worldTint: [0.10, 0.17, 0.34],
    waterTint: [0.12, 0.20, 0.38],
    windowGlow: 1.0,
    daylight: 0.22,
  },
  {
    // Dawn (t = 0.20)
    t: 0.20,
    zen: 0x1f3c78,
    mid: 0x627db0,
    hor: 0xf0a884,
    fog: 0xd8b4a6,
    sunCore: 0xfff9dc,
    sunRim: 0xff9e58,
    sunCorona: 0xffb074,
    sunVis: 0.9,
    moonCore: 0xeef5ff,
    moonShadow: 0x5c729c,
    moonCorona: 0x8ab4f8,
    moonVis: 0.2,
    starAlpha: 0.15,
    cloudWarm: 0xffdfc2,
    cloudCool: 0x7e8ab8,
    sunPos: [0.22, 0.22, -0.95],
    moonPos: [-0.45, 0.18, 0.87],
    sunLightColor: 0xffcea0,
    sunIntensity: 1.85,
    hemiSky: 0xc8daf4,
    hemiGround: 0x6b7058,
    hemiIntensity: 0.95,
    ambIntensity: 0.24,
    worldTint: [0.82, 0.72, 0.68],
    waterTint: [0.80, 0.75, 0.74],
    windowGlow: 0.25,
    daylight: 0.72,
  },
  {
    // Sunny Golden Day (t = 0.34) — Exact spec palette
    t: 0.34,
    zen: 0x1a6bcc,
    mid: 0x5aa2e0,
    hor: 0xdff0f5,
    fog: 0xd8eef5,
    sunCore: 0xfff9dc,
    sunRim: 0xffcf68,
    sunCorona: 0xffe29a,
    sunVis: 1.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x6b82ab,
    moonCorona: 0x8ab4f8,
    moonVis: 0.0,
    starAlpha: 0.0,
    cloudWarm: 0xfffaf0,
    cloudCool: 0xb8d0ee,
    sunPos: [-0.21, 0.28, -0.93],
    moonPos: [0.45, -0.35, 0.82],
    sunLightColor: 0xfff2d6,
    sunIntensity: 2.45,
    hemiSky: 0xe2f2ff,
    hemiGround: 0x7c8c58,
    hemiIntensity: 1.18,
    ambIntensity: 0.22,
    worldTint: [1.0, 1.0, 1.0],
    waterTint: [1.0, 1.0, 1.0],
    windowGlow: 0.0,
    daylight: 1.0,
  },
  {
    // High Afternoon (t = 0.54)
    t: 0.54,
    zen: 0x1a6bcc,
    mid: 0x5aa2e0,
    hor: 0xdff0f5,
    fog: 0xd8eef5,
    sunCore: 0xfff9dc,
    sunRim: 0xffcf68,
    sunCorona: 0xffe29a,
    sunVis: 1.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x6b82ab,
    moonCorona: 0x8ab4f8,
    moonVis: 0.0,
    starAlpha: 0.0,
    cloudWarm: 0xfffaf0,
    cloudCool: 0xb8d0ee,
    sunPos: [-0.36, 0.32, -0.87],
    moonPos: [0.42, 0.12, 0.90],
    sunLightColor: 0xfff0ce,
    sunIntensity: 2.4,
    hemiSky: 0xe0f0ff,
    hemiGround: 0x7c8c58,
    hemiIntensity: 1.15,
    ambIntensity: 0.22,
    worldTint: [1.0, 0.99, 0.97],
    waterTint: [1.0, 0.99, 0.98],
    windowGlow: 0.0,
    daylight: 0.98,
  },
  {
    // Romantic Sunset / Twilight (t = 0.76) — Exact spec palette + both Sun & Moon visible
    t: 0.76,
    zen: 0x242f66,
    mid: 0x7a4e82,
    hor: 0xf28c5e,
    fog: 0xd67c66,
    sunCore: 0xfff9dc,
    sunRim: 0xff7838,
    sunCorona: 0xffb858,
    sunVis: 1.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x5d5280,
    moonCorona: 0x8ab4f8,
    moonVis: 0.88,
    starAlpha: 0.35,
    cloudWarm: 0xffae70,
    cloudCool: 0x584878,
    sunPos: [-0.33, 0.21, 0.92],
    moonPos: [0.11, 0.24, 0.96],
    sunLightColor: 0xff9e5e,
    sunIntensity: 1.55,
    hemiSky: 0x9c6b98,
    hemiGround: 0x4d3a4c,
    hemiIntensity: 0.82,
    ambIntensity: 0.24,
    worldTint: [0.54, 0.38, 0.36],
    waterTint: [0.58, 0.42, 0.44],
    windowGlow: 0.88,
    daylight: 0.56,
  },
  {
    // Starlit Moonlit Night (t = 0.96) — Exact spec palette
    t: 0.96,
    zen: 0x0b132b,
    mid: 0x16264c,
    hor: 0x263b66,
    fog: 0x22355c,
    sunCore: 0xfff9dc,
    sunRim: 0xff7838,
    sunCorona: 0xff8844,
    sunVis: 0.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x455882,
    moonCorona: 0x8ab4f8,
    moonVis: 1.0,
    starAlpha: 1.0,
    cloudWarm: 0x9cb8e8,
    cloudCool: 0x2b3d63,
    sunPos: [-0.28, -0.25, 0.92],
    moonPos: [-0.14, 0.27, -0.95],
    sunLightColor: 0x9cb8f0,
    sunIntensity: 0.68,
    hemiSky: 0x3b5998,
    hemiGround: 0x182238,
    hemiIntensity: 0.54,
    ambIntensity: 0.22,
    worldTint: [0.10, 0.17, 0.34],
    waterTint: [0.12, 0.20, 0.38],
    windowGlow: 1.0,
    daylight: 0.22,
  },
  {
    // Wrap to 1.00 (matches t = 0.00)
    t: 1.00,
    zen: 0x0b132b,
    mid: 0x16264c,
    hor: 0x263b66,
    fog: 0x22355c,
    sunCore: 0xfff9dc,
    sunRim: 0xff7838,
    sunCorona: 0xff8844,
    sunVis: 0.0,
    moonCore: 0xeef5ff,
    moonShadow: 0x455882,
    moonCorona: 0x8ab4f8,
    moonVis: 1.0,
    starAlpha: 1.0,
    cloudWarm: 0x9cb8e8,
    cloudCool: 0x2b3d63,
    sunPos: [-0.24, 0.12, 0.96],
    moonPos: [-0.14, 0.27, -0.95],
    sunLightColor: 0x9cb8f0,
    sunIntensity: 0.65,
    hemiSky: 0x3b5998,
    hemiGround: 0x182238,
    hemiIntensity: 0.52,
    ambIntensity: 0.22,
    worldTint: [0.10, 0.17, 0.34],
    waterTint: [0.12, 0.20, 0.38],
    windowGlow: 1.0,
    daylight: 0.22,
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
  const activeLightDir = sunDir.clone();

  // Primary directional light (tracks Sun in Day/Evening, transitions to Moon at Night)
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.45);
  sun.name = 'todDirectionalLight';
  sun.position.copy(sunDir).multiplyScalar(120);
  sun.target.position.set(0, 0, 0);

  const fill = new THREE.DirectionalLight(0xb8d8ff, 0.55);
  fill.name = 'todFillLight';
  fill.position.set(45, 32, -40);

  const hemi = new THREE.HemisphereLight(0xe2f2ff, 0x7c8c58, 1.18);
  hemi.name = 'todHemiLight';

  const ambient = new THREE.AmbientLight(0xe2f2ff, 0.22);
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
  };

  function resolveT(modeOrT) {
    if (typeof modeOrT === 'string') {
      return TOD_PRESETS[modeOrT]?.t ?? 0.34;
    }
    return Number.isFinite(modeOrT) ? ((modeOrT % 1) + 1) % 1 : 0.34;
  }

  function setTimeOfDay(modeOrT) {
    const tt = resolveT(modeOrT);
    state.t = tt;
    state.mode =
      tt >= 0.20 && tt < 0.64
        ? 'day'
        : tt >= 0.64 && tt < 0.86
        ? 'evening'
        : 'night';

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

    // Active directional light follows the Sun during Day/Evening and the Moon at Night
    const moonDominance = smoothstep01(0.80, 0.90, tt) + (1.0 - smoothstep01(0.10, 0.22, tt));
    activeLightDir.copy(sunDir).lerp(moonDir, clamp01(moonDominance)).normalize();

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
    fill.intensity = THREE.MathUtils.lerp(0.55, 0.22, clamp01(moonDominance));

    state.daylight = THREE.MathUtils.lerp(a.daylight, b.daylight, k);
    state.windowGlow = THREE.MathUtils.lerp(a.windowGlow, b.windowGlow, k);
    state.fogColor.copy(skyUniforms.uFog.value);
    state.worldTint.copy(a.worldTint).lerp(b.worldTint, k);
    state.waterTint.copy(a.waterTint).lerp(b.waterTint, k);

    return state;
  }

  function update(elapsed = 0) {
    skyUniforms.uTime.value = elapsed;
    cloudUniforms.uTime.value = elapsed;
    // Gentle tangential drift so clouds feel alive without shifting out of composition in snapshots
    cloudMesh.rotation.y = Math.sin(elapsed * 0.03) * 0.025;
    if (camera && camera.position) {
      dome.position.copy(camera.position);
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
    update,
  };
}

export default createTimeOfDaySky;
