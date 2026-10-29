// Sunpetal Vale â€” sky dome, cumulus clouds, distant ridges and the light rig.
//
// Everything in this module is procedural and deterministic: the only randomness
// comes from a seeded mulberry32 created once per build (or injected by the
// caller), so the same options always produce exactly the same sky.
//
// Contract (see handoff/map-bg/SPEC.md):
//   createMeadowSky({ palette, sunAzimuth, sunElevation, quality })
//     => { group, sun, hemi, ambient, sunDir, update(elapsed), stats }
//
// Extra, optional (never required): rng, seed, camera. Passing `camera` simply
// re-centres the dome on the camera each update â€” the dome is already pinned to
// the far plane in clip space, so it never gets clipped by camera.far.
//
// Art direction: painterly anime sky. Deep blue zenith, luminous pale horizon,
// warm late-afternoon sun low in the west, billowing cumulus with flat bases,
// three layers of cool ridges dissolving into the fog colour. The sky is judged
// from a gameplay camera where the horizon band, cloud bases and ridge
// silhouettes are the parts the player actually sees.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MEADOW, MEADOW_LIGHT } from "./palette.js";

/* ------------------------------------------------------------------------- */
/* deterministic helpers                                                     */
/* ------------------------------------------------------------------------- */

// Small, fast, seedable PRNG. No Math.random anywhere in this module.
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

// Stable per-vertex hash, used to break up the cloud colour ramp a little.
function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

const linearColor = (hex) => new THREE.Color(hex); // ColorManagement: sRGB hex -> linear

/* ------------------------------------------------------------------------- */
/* sky dome shader                                                           */
/* ------------------------------------------------------------------------- */

// The dome is a BackSide sphere pinned to the far plane in clip space. That
// means it renders behind everything, ignores scene.fog, and can never be
// clipped by an aggressive camera.far (the host may use far = 260).
const SKY_VERT = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;

    vec4 clip = projectionMatrix * viewMatrix * worldPos;
    // Pin to the far plane. depthTest is off for the dome anyway; this only
    // guarantees the far plane can never slice the dome away.
    clip.z = clip.w;
    gl_Position = clip;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uFog;
  uniform vec3 uGlow;
  uniform vec3 uGlowWarm;
  uniform vec3 uDisc;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uPulse;

  varying vec3 vWorldPos;

  void main() {
    vec3 d = normalize(vWorldPos - cameraPosition);

    // --- vertical ramp: horizon -> mid -> zenith -------------------------
    // Compressed on purpose: a gameplay camera only ever sees 0-35Â° of sky,
    // so the deep blue has to arrive by ~30Â° or the whole frame stays pale.
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.005, 0.10, h));
    col = mix(col, uZenith, smoothstep(0.06, 0.45, h));

    // --- sun ------------------------------------------------------------
    vec3 sd = normalize(uSunDir);
    float sdot = max(dot(d, sd), 0.0);

    // Wide warm glow: *replaces* the pale horizon with cream instead of
    // adding brightness, otherwise the western sky turns into milk. Then a
    // tight halo and a small hot core around the disc.
    col = mix(col, uGlowWarm, pow(sdot, 42.0) * 0.10 * uPulse);
    col += uGlowWarm * pow(sdot, 220.0) * 0.22 * uPulse;
    col += uGlowWarm * pow(sdot, 1400.0) * 0.45 * uPulse;

    // --- horizon haze band ---------------------------------------------
    // A pale fog-coloured band sits right on the skyline so the ridge
    // silhouettes and the fogged distance melt into the sky.
    float bandWidth = 0.105 + 0.010 * sin(uTime * 0.07);
    float band = smoothstep(bandWidth, -0.025, d.y);
    col = mix(col, mix(uHorizon, uFog, 0.45), band * 0.58);

    // Warm band hugging the horizon on the sun's side: the "low western sun"
    // read a high-key meadow needs. Applied after the haze band so the haze
    // cannot wash the warmth back out.
    vec3 sunFlat = normalize(vec3(sd.x, 0.0, sd.z));
    vec3 dirFlatRaw = vec3(d.x, 0.0, d.z);
    float dirFlatLen2 = dot(dirFlatRaw, dirFlatRaw);
    vec3 dirFlat = dirFlatLen2 > 1e-6 ? dirFlatRaw * inversesqrt(dirFlatLen2) : vec3(0.0, 0.0, 1.0);
    float az = dot(dirFlat, sunFlat) * 0.5 + 0.5;
    float lowWarm = exp(-pow((d.y - 0.10) / 0.10, 2.0)) * pow(az, 3.0);
    col = mix(col, uGlowWarm, lowWarm * 0.46 * uPulse);

    // Below the horizon the terrain hides the dome; fade to fog regardless.
    col = mix(col, uFog * 0.94, smoothstep(0.0, -0.16, d.y));

    // --- sun ------------------------------------------------------------
    // One soft disc and a gentle spill. No ring, no bands: the stepped halo
    // read as a sticker pasted on the sky. The disc edge is soft over ~1.5 px
    // so it never sparkles, and the spill is exponential, so it dissolves into
    // the sky instead of ending on a contour.
    float ang = acos(clamp(dot(d, sd), -1.0, 1.0));
    float disc = 1.0 - smoothstep(0.014, 0.030, ang);
    col = mix(col, uDisc, disc * uPulse);
    col += uGlowWarm * exp(-ang * 10.0) * 0.09 * uPulse;
    col += uGlowWarm * exp(-ang * 3.2) * 0.05 * uPulse;

    // The uniforms/vertex colours are already linear (linearColor() lets
    // THREE.Color convert the authored sRGB hex exactly once). Do NOT linearize
    // again here: a second pow(2.2) took the zenith from linear 0.63 to 0.36 and
    // the post grade then tone-mapped that, which is what made the sky a navy
    // hole while the ridges (same file, no pow) stayed correctly pale.
    col = clamp(col, 0.0, 1.0);
    gl_FragColor = vec4(col, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------- */
/* cumulus clouds                                                            */
/* ------------------------------------------------------------------------- */

// Flat-shaded puffs with white sunlit tops and lavender-blue bases. The
// underside is clamped to y = 0 so every cluster has the clean flat base that
// makes stylised anime cumulus read as cumulus and not as a popcorn ball.
function buildCumulusGeometry(rand, { size = 44, detail = 1, puffs = 9, palette }) {
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

    // Flatten the underside into the shared cloud base plane.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0) pos.setY(i, 0);
    }
    // Non-indexed geometry => per-face normals => flat shading for free.
    geo.computeVertexNormals();
    geo.deleteAttribute("uv");
    puffGeos.push(geo);
  };

  // Main mass: heavily overlapping puffs along the local X axis, domed profile.
  for (let i = 0; i < mainCount; i++) {
    const t = mainCount === 1 ? 0.5 : i / (mainCount - 1);
    const dome = Math.sin(Math.PI * (0.06 + 0.88 * t));
    const r = size * (0.10 + 0.085 * dome) * (0.85 + rand() * 0.30);
    const x = (t - 0.5) * size * 0.70 + (rand() - 0.5) * size * 0.07;
    const z = (rand() - 0.5) * size * 0.26;
    const y = r * (0.45 + rand() * 0.18);
    addPuff(x, y, z, r, 0.66 + rand() * 0.14, rand() * Math.PI * 2);
  }

  // Flat base slab: wide, very squashed puffs that give the cluster its
  // straight anime underside instead of a row of round bottoms.
  for (let i = 0; i < 3; i++) {
    const t = (i + 0.5) / 3;
    const r = size * (0.16 + rand() * 0.05);
    const x = (t - 0.5) * size * 0.55 + (rand() - 0.5) * size * 0.08;
    const z = (rand() - 0.5) * size * 0.20;
    addPuff(x, r * 0.20, z, r, 0.30 + rand() * 0.08, rand() * Math.PI * 2);
  }

  // A few smaller puffs piled on top give the billowing, cauliflower crown.
  // Kept low enough that they merge into the mass instead of floating as balls.
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

  const shadow = linearColor(palette.cloudShadow);
  const light = linearColor(palette.cloudLight);
  const warm = linearColor(palette.skySunGlow);
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = smoothstep01(0.03, 0.62, y / span);

    tmp.copy(shadow).lerp(light, t);
    // A whisper of cream on the sunlit crown keeps the tops from reading flat white.
    tmp.lerp(warm, 0.10 * t * t);
    // Baked contact shade so the flat base is genuinely dark, not just tinted.
    tmp.multiplyScalar(0.74 + 0.26 * t);
    // Per-vertex variation so the flat facets don't band into stripes.
    const v = 0.97 + 0.06 * hash1(x * 1.7 + z * 2.3);
    colors[i * 3 + 0] = tmp.r * v;
    colors[i * 3 + 1] = tmp.g * v;
    colors[i * 3 + 2] = tmp.b * v;
  }

  merged.setAttribute("aCloudColor", new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

const CLOUD_VERT = /* glsl */ `
  attribute vec3 aCloudColor;

  varying vec3 vCloudColor;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vCloudColor = aCloudColor;

    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const CLOUD_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform vec3 uHaze;
  uniform float uHazeStart;
  uniform float uHazeEnd;
  uniform float uTime;

  varying vec3 vCloudColor;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormalW);
    float ndl = dot(n, uSunDir);

    // Two-tone ramp on the facets: cool lavender in shadow, warm cream in sun.
    // The slow billow term makes the lit/shadow boundary creep across the
    // facets, so the cluster looks like it is still building instead of a
    // frozen prop. Small on purpose: a big term reads as a boiling blob.
    float billow = sin(uTime * 0.22 + vWorldPos.x * 0.045 + vWorldPos.z * 0.03) * 0.07
                 + sin(uTime * 0.41 + vWorldPos.y * 0.10) * 0.03;
    float lit = smoothstep(-0.45, 0.85, ndl + billow);
    vec3 col = vCloudColor * mix(uCool, uWarm, lit);
    col += uWarm * pow(max(ndl, 0.0), 3.0) * 0.05;

    // Backlit rim: when the sun is behind the cloud, the silhouette edge
    // glows warm. Cheap, and it is what sells a sun-side cumulus.
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - abs(dot(n, viewDir)), 3.0);
    float back = pow(max(dot(-viewDir, uSunDir), 0.0), 2.0);
    col += uWarm * rim * back * 0.35;

    // Distance haze so far clusters sit back into the sky.
    float dist = length(vWorldPos - cameraPosition);
    float haze = smoothstep(uHazeStart, uHazeEnd, dist);
    col = mix(col, uHaze, haze * 0.55);

    // The uniforms/vertex colours are already linear (linearColor() lets
    // THREE.Color convert the authored sRGB hex exactly once). Do NOT linearize
    // again here: a second pow(2.2) took the zenith from linear 0.63 to 0.36 and
    // the post grade then tone-mapped that, which is what made the sky a navy
    // hole while the ridges (same file, no pow) stayed correctly pale.
    col = clamp(col, 0.0, 1.0);
    gl_FragColor = vec4(col, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------- */
/* distant ridge silhouettes                                                 */
/* ------------------------------------------------------------------------- */

// A vertical curtain of triangles around the valley. All height terms use
// integer frequencies, so the ring closes seamlessly at i = segments.
function buildRidgeGeometry({
  segments,
  radius,
  height,
  bottom,
  color,
  fogColor,
  haze,
  phase,
  jitter = 0.0,
}) {
  const top = linearColor(color).lerp(linearColor(fogColor), haze);
  // The curtain runs from y = -40 to its crest, and from eye level we see its
  // BOTTOM. At 0.82 of the fog colour that bottom was a near-white wall (#e1e4e5)
  // hiding the ridges behind it; 0.22 keeps the silhouette readable while the
  // terrain still hides the part below the horizon.
  const bot = top.clone().lerp(linearColor(fogColor), 0.22);

  const count = segments + 1;
  const positions = new Float32Array(count * 2 * 3);
  const colors = new Float32Array(count * 2 * 3);
  const heights = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const a = (i / segments) * Math.PI * 2;
    const h =
      height *
      (0.62 +
        0.20 * Math.sin(a * 3 + phase) +
        0.11 * Math.sin(a * 7 + phase * 1.7) +
        0.06 * Math.sin(a * 13 + phase * 0.6) +
        jitter * Math.sin(a * 29 + phase * 2.1));
    heights[i] = Math.max(height * 0.34, h);

    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;

    const ti = i * 2;
    const bi = ti + 1;

    positions[ti * 3 + 0] = x;
    positions[ti * 3 + 1] = heights[i];
    positions[ti * 3 + 2] = z;

    positions[bi * 3 + 0] = x;
    positions[bi * 3 + 1] = bottom;
    positions[bi * 3 + 2] = z;

    colors[ti * 3 + 0] = top.r;
    colors[ti * 3 + 1] = top.g;
    colors[ti * 3 + 2] = top.b;

    colors[bi * 3 + 0] = bot.r;
    colors[bi * 3 + 1] = bot.g;
    colors[bi * 3 + 2] = bot.b;
  }

  const indices = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2; // top i
    const b = a + 1; // bottom i
    const c = (i + 1) * 2; // top i+1
    const d = c + 1; // bottom i+1
    indices.push(a, b, d, a, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/* ------------------------------------------------------------------------- */
/* factory                                                                   */
/* ------------------------------------------------------------------------- */

export function createMeadowSky({
  palette = MEADOW,
  sunAzimuth = MEADOW_LIGHT.sunAzimuth,
  sunElevation = MEADOW_LIGHT.sunElevation,
  quality = "high",
  rng = null,
  seed = 20261017,
  camera = null,
} = {}) {
  const rand = typeof rng === "function" ? rng : mulberry32(seed);
  const low = quality === "low";
  const group = new THREE.Group();
  group.name = "meadowSky";

  /* ---- sun direction & light rig ------------------------------------- */

  const sunDir = new THREE.Vector3(
    Math.cos(sunAzimuth) * Math.cos(sunElevation),
    Math.sin(sunElevation),
    Math.sin(sunAzimuth) * Math.cos(sunElevation)
  ).normalize();

  const sun = new THREE.DirectionalLight(palette.sun, MEADOW_LIGHT.sunIntensity);
  sun.name = "meadowSun";
  sun.position.copy(sunDir).multiplyScalar(120);
  sun.target.position.set(0, 0, 0);

  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  const shadowCam = sun.shadow.camera;
  shadowCam.left = -45;
  shadowCam.right = 45;
  shadowCam.top = 45;
  shadowCam.bottom = -45;
  shadowCam.near = 1;
  shadowCam.far = 260;
  shadowCam.updateProjectionMatrix();
  sun.shadow.normalBias = 0.02;
  sun.shadow.bias = -0.0002;
  sun.shadow.radius = 3;

  const hemi = new THREE.HemisphereLight(
    palette.ambientSky,
    palette.ambientGround,
    MEADOW_LIGHT.hemiIntensity
  );
  hemi.name = "meadowHemi";

  const ambient = new THREE.AmbientLight(palette.ambientSky, MEADOW_LIGHT.ambientIntensity);
  ambient.name = "meadowAmbient";

  group.add(sun, sun.target, hemi, ambient);

  /* ---- sky dome ------------------------------------------------------- */

  const skyUniforms = {
    uZenith: { value: linearColor(palette.skyZenith) },
    uMid: { value: linearColor(palette.skyMid) },
    uHorizon: { value: linearColor(palette.skyHorizon) },
    uFog: { value: linearColor(palette.fog) },
    uGlow: { value: linearColor(palette.skySunGlow) },
    // A warmer derivative of skySunGlow for the halo; the palette cream is
    // nearly white, and a white halo over blue reads as grey milk.
    uGlowWarm: {
      value: linearColor(palette.skySunGlow).multiply(new THREE.Color(1.0, 0.58, 0.24)),
    },
    uDisc: { value: linearColor(palette.sunDisc) },
    uSunDir: { value: sunDir.clone() },
    uTime: { value: 0 },
    uPulse: { value: 1 },
  };

  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true,
  });

  const domeRadius = 500;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(domeRadius, low ? 32 : 48, low ? 20 : 32),
    skyMat
  );
  dome.name = "meadowSkyDome";
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.matrixAutoUpdate = true;
  group.add(dome);

  /* ---- cumulus clouds ------------------------------------------------- */

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDir.clone() },
      uWarm: { value: new THREE.Vector3(1.10, 1.04, 0.90) },
      uCool: { value: new THREE.Vector3(0.58, 0.66, 0.94) },
      uHaze: { value: linearColor(palette.fog) },
      uHazeStart: { value: 90 },
      uHazeEnd: { value: 320 },
      uTime: { value: 0 },
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    fog: false,
    toneMapped: true,
  });

  const cloudGroup = new THREE.Group();
  cloudGroup.name = "meadowClouds";
  group.add(cloudGroup);

  const cloudCount = low ? 5 : 8;
  const cloudRigs = [];
  let cloudTris = 0;

  for (let i = 0; i < cloudCount; i++) {
    // Spread around the valley, never over the central meadow clearing.
    const az0 = (i / cloudCount) * Math.PI * 2 + (rand() - 0.5) * 0.38;
    const radius = 85 + rand() * 65; // 85 .. 150 m out
    const size = 32 + rand() * 38; // 32 .. 70 m wide
    const baseY = 24 + rand() * 20; // 24 .. 44 m up
    const puffs = low ? 6 : 8 + Math.floor(rand() * 4);

    const geo = buildCumulusGeometry(rand, {
      size,
      detail: low ? 0 : 1,
      puffs,
      palette,
    });
    if (!geo) continue;

    const mesh = new THREE.Mesh(geo, cloudMat);
    mesh.name = `meadowCloud${i}`;
    mesh.frustumCulled = false; // clusters move, cheap enough to always draw
    mesh.rotation.y = -az0;
    mesh.position.set(Math.cos(az0) * radius, baseY, Math.sin(az0) * radius);
    cloudGroup.add(mesh);

    cloudRigs.push({
      mesh,
      az0,
      radius,
      y0: baseY,
      yaw: rand() * Math.PI * 2,
      speed: 0.0022 + rand() * 0.0018,
      phase: rand() * Math.PI * 2,
    });

    cloudTris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  }

  // A low band of clouds across the arc the gameplay camera actually looks at
  // (-z). The ring above is spread evenly around the whole valley, which left the
  // visible sky band with two clouds, both near the top edge and one cropped.
  // These sit lower (18-34 m) and closer, so they read as clouds in the sky band
  // rather than as a strip along the top of the frame.
  const bandClouds = low ? 2 : 5;
  for (let i = 0; i < bandClouds; i++) {
    const az0 = -Math.PI / 2 + (i - (bandClouds - 1) / 2) * 0.46 + (rand() - 0.5) * 0.16;
    const radius = 105 + rand() * 45;
    const size = 30 + rand() * 25;
    const baseY = 18 + rand() * 16;
    const puffs = low ? 6 : 8 + Math.floor(rand() * 4);

    const geo = buildCumulusGeometry(rand, { size, detail: low ? 0 : 1, puffs, palette });
    if (!geo) continue;

    const mesh = new THREE.Mesh(geo, cloudMat);
    mesh.name = `meadowCloudBand${i}`;
    mesh.frustumCulled = false;
    mesh.rotation.y = -az0;
    mesh.position.set(Math.cos(az0) * radius, baseY, Math.sin(az0) * radius);
    cloudGroup.add(mesh);

    cloudRigs.push({
      mesh,
      az0,
      radius,
      y0: baseY,
      yaw: rand() * Math.PI * 2,
      speed: 0.0022 + rand() * 0.0018,
      phase: rand() * Math.PI * 2,
    });

    cloudTris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  }

  /* ---- ridge layers --------------------------------------------------- */

  const ridgeGroup = new THREE.Group();
  ridgeGroup.name = "meadowRidges";
  group.add(ridgeGroup);

  // fog:false on purpose â€” each layer bakes its own aerial haze so the
  // silhouette reads at 175-295 m regardless of the host's fog.far.
  const ridgeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: false,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
  });

  const ridgeSpecs = [
    { radius: 175, height: 26, color: palette.hillNear, haze: 0.02, phase: 0.7, jitter: 0.090, segments: low ? 96 : 160 },
    { radius: 235, height: 40, color: palette.hillMid, haze: 0.08, phase: 2.1, jitter: 0.045, segments: low ? 80 : 128 },
    { radius: 295, height: 56, color: palette.ridgeFar, haze: 0.18, phase: 4.3, jitter: 0.020, segments: low ? 64 : 96 },
  ];

  let ridgeTris = 0;
  for (let i = 0; i < ridgeSpecs.length; i++) {
    const spec = ridgeSpecs[i];
    const geo = buildRidgeGeometry({
      segments: spec.segments,
      radius: spec.radius,
      height: spec.height,
      bottom: -40,
      color: spec.color,
      fogColor: palette.fog,
      haze: spec.haze,
      phase: spec.phase,
      jitter: spec.jitter,
    });
    const mesh = new THREE.Mesh(geo, ridgeMat);
    mesh.name = `meadowRidge${i}`;
    mesh.frustumCulled = false;
    ridgeGroup.add(mesh);
    ridgeTris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  }

  /* ---- stats ---------------------------------------------------------- */

  const domeTris =
    (dome.geometry.index ? dome.geometry.index.count : dome.geometry.attributes.position.count) / 3;
  const stats = {
    triangles: Math.round(domeTris + cloudTris + ridgeTris),
    drawCalls: 1 + cloudRigs.length + ridgeSpecs.length,
    clouds: cloudRigs.length,
    ridges: ridgeSpecs.length,
    shadowMap: sun.shadow.mapSize.x,
  };

  /* ---- time of day ---------------------------------------------------- */

  // A full day in one number: 0 = midnight, 0.25 = sunrise, 0.5 = noon,
  // 0.75 = sunset. Everything that changes with the sun is keyed here -- sky
  // ramp, fog, sun colour, light intensities -- so there is exactly one place
  // to retune a time of day.
  const TOD = [
    { t: 0.00, zen: 0x121a33, mid: 0x1e2a4a, hor: 0x2e3a58, fog: 0x2b3550, glow: 0x6a7fb5, disc: 0xcfd8ee, sun: 0.15, hemi: 0.35, amb: 0.22, day: 0.20 },
    { t: 0.22, zen: 0x1d3a6b, mid: 0x4a6fa8, hor: 0xc08a6a, fog: 0xa8969e, glow: 0xff9a58, disc: 0xffb877, sun: 1.6, hemi: 0.9, amb: 0.25, day: 0.55 },
    { t: 0.31, zen: 0x1a6bcc, mid: 0x5aa2e0, hor: 0xd6ecea, fog: 0xdde8ef, glow: 0xffe9b8, disc: 0xffd489, sun: 4.4, hemi: 1.2, amb: 0.18, day: 0.92 },
    { t: 0.50, zen: 0x1560c0, mid: 0x5aa2e0, hor: 0xd6ecea, fog: 0xdde8ef, glow: 0xfff0c2, disc: 0xffe6b8, sun: 5.0, hemi: 1.2, amb: 0.18, day: 1.00 },
    { t: 0.68, zen: 0x2a5fa8, mid: 0x7a9cc8, hor: 0xe8c9a0, fog: 0xe0d2c4, glow: 0xffb070, disc: 0xffc27a, sun: 3.4, hemi: 1.0, amb: 0.20, day: 0.85 },
    { t: 0.78, zen: 0x243a6e, mid: 0x4a5f92, hor: 0xd08a6a, fog: 0xa08a90, glow: 0xff8a4a, disc: 0xff9a55, sun: 1.2, hemi: 0.7, amb: 0.24, day: 0.50 },
    { t: 1.00, zen: 0x121a33, mid: 0x1e2a4a, hor: 0x2e3a58, fog: 0x2b3550, glow: 0x6a7fb5, disc: 0xcfd8ee, sun: 0.15, hemi: 0.35, amb: 0.22, day: 0.20 },
  ].map((k) => ({
    ...k,
    zen: linearColor(k.zen), mid: linearColor(k.mid), hor: linearColor(k.hor),
    fog: linearColor(k.fog), glow: linearColor(k.glow), disc: linearColor(k.disc),
  }));

  const _cA = new THREE.Color();
  const _cB = new THREE.Color();

  // Returns the daylight factor (0..1) so the host can dim its own exposure --
  // the vegetation is a self-lit ramp and does not respond to light intensity,
  // so without this the meadow stays noon-bright at midnight.
  function setTimeOfDay(t) {
    const tt = ((t % 1) + 1) % 1;
    let i = 0;
    while (i < TOD.length - 2 && TOD[i + 1].t < tt) i++;
    const a = TOD[i], b = TOD[i + 1];
    const k = THREE.MathUtils.clamp((tt - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);

    skyUniforms.uZenith.value.copy(a.zen).lerp(b.zen, k);
    skyUniforms.uMid.value.copy(a.mid).lerp(b.mid, k);
    skyUniforms.uHorizon.value.copy(a.hor).lerp(b.hor, k);
    skyUniforms.uFog.value.copy(a.fog).lerp(b.fog, k);
    skyUniforms.uGlow.value.copy(a.glow).lerp(b.glow, k);
    skyUniforms.uDisc.value.copy(a.disc).lerp(b.disc, k);
    _cA.copy(a.glow).lerp(b.glow, k);
    skyUniforms.uGlowWarm.value.copy(_cA).multiply(_cB.setRGB(1.0, 0.58, 0.24));

    // Sun ARC: it rises on the right of frame, crosses ahead near noon, and
    // sets on the left. Animating ELEVATION alone made it rise and set in the
    // same spot -- the sun appeared to grow out of one hole in the sky and
    // sink back into it.
    const arc = Math.sin((tt - 0.25) * Math.PI * 2);
    const elev = 0.06 + 0.42 * Math.max(0, arc);
    const az = -1.35 + (tt - 0.5) * 1.8;
    sunDir.set(
      Math.cos(az) * Math.cos(elev),
      Math.sin(elev),
      Math.sin(az) * Math.cos(elev)
    ).normalize();
    skyUniforms.uSunDir.value.copy(sunDir);
    cloudMat.uniforms.uSunDir.value.copy(sunDir);
    sun.position.copy(sunDir).multiplyScalar(120);

    sun.intensity = a.sun + (b.sun - a.sun) * k;
    hemi.intensity = a.hemi + (b.hemi - a.hemi) * k;
    ambient.intensity = a.amb + (b.amb - a.amb) * k;

    return a.day + (b.day - a.day) * k;
  }

  /* ---- animation ------------------------------------------------------ */

  function update(elapsed = 0) {
    // Clouds drift around the valley, breathe in and out of the ring, bob
    // slowly, and turn a little as they go. Four slow frequencies that never
    // repeat together -- that is what stops a cloud field reading as a
    // turntable. All amplitudes are small: clouds are huge, so a 2 m wobble at
    // 120 m reads as life, while 20 m reads as a flying saucer.
    for (let i = 0; i < cloudRigs.length; i++) {
      const c = cloudRigs[i];
      const az = c.az0 + elapsed * c.speed;
      const breathe = Math.sin(elapsed * 0.061 + c.phase) * 3.2;
      const r = c.radius + breathe;
      c.mesh.position.set(
        Math.cos(az) * r,
        c.y0 + Math.sin(elapsed * 0.16 + c.phase) * 0.85
             + Math.sin(elapsed * 0.37 + c.phase * 1.7) * 0.22,
        Math.sin(az) * r
      );
      // Present the long axis tangentially so the clusters never edge-on, and
      // let the yaw wander a few degrees.
      c.mesh.rotation.y = -az + c.yaw + Math.sin(elapsed * 0.045 + c.phase) * 0.05;
      c.mesh.rotation.z = Math.sin(elapsed * 0.033 + c.phase * 2.1) * 0.012;
    }

    cloudMat.uniforms.uTime.value = elapsed;

    // Sun halo breathes a little; the horizon band widens by a hair.
    skyUniforms.uPulse.value =
      1 + 0.03 * Math.sin(elapsed * 0.45) + 0.012 * Math.sin(elapsed * 1.7);
    skyUniforms.uTime.value = elapsed;

    // Optional: keep the dome centred on the camera.
    if (camera && camera.position) dome.position.copy(camera.position);
  }

  return {
    group,
    sun,
    setTimeOfDay,
    hemi,
    ambient,
    sunDir,
    update,
    stats,
    // Extra, additive information the host can read without guessing.
    // Fog comes straight from the palette so the sky, the ridges and the host's
    // scene.fog can never drift apart.
    fog: { color: palette.fog, near: MEADOW_LIGHT.fogNear, far: MEADOW_LIGHT.fogFar },
    exposure: MEADOW_LIGHT.exposure,
  };
}

export default createMeadowSky;
