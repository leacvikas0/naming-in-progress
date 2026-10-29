import * as THREE from "three";
import { MEADOW } from "./palette.js";

// Sunpetal Vale â€” anime meadow terrain.
//
// One height field, one ground mesh, soft-edged dirt paths, a stylised lake, and
// scattered boulders. Everything here is procedural: no textures, no GLB.
//
// The playable square (|x|,|z| <= 46) is EXACTLY flat at y = 0 because gameplay
// (player feet, enemy chase, spawn anchors) assumes flat ground. The beauty has
// to come from colour, path shape, grass cover and the scenery ring outside the
// square, not from walking on hills.
//
// Outside the square the land rolls up into a wooded rim and a hazy far ridge.
// West of the square the ground drops into a lake basin whose waterline is the
// -0.35 m contour; the water plane is oversized so its own rectangle is always
// buried under the shore.

const TAU = Math.PI * 2;

const PLAY_HALF = 46;          // flat playable half-extent
const GROUND_SIZE = 340;       // ground mesh extent (m)
// 1.9 m cells. The playfield is geometrically flat (it only carries vertex
// colour), so a finer grid buys nothing the grass cover does not already hide.
const GROUND_SEG = 176;        // grid resolution
const GROUND_Y = 0;

const LAKE = { cx: -66, cz: -3.5, rx: 16, rz: 22, level: -0.35 };
const LAKE_MARGIN = 12;        // water plane extends this far under the shore

const PATH_Y = 0.022;          // ribbon sits just above the ground
const LOOP_WIDTH = 2.7;
const SPOKE_WIDTH = 2.2;

// Loop + spokes mirror CONFIG.vale in balance.js. They are duplicated here so
// this module imports nothing from the game layer; index.js can override them.
const DEFAULT_LOOP = [
  [0, 24], [-27, 20], [-32, -9], [-18, -28], [0, -31],
  [26, -23], [30, 14], [18, 29],
];
const DEFAULT_SPOKES = [
  // The leading spoke starts at z = 12 so the gameplay camera (z = 14, bottom
  // edge of frame at z ~= 11.3) sees the ribbon cross the bottom edge. At z = 6
  // the path only began at 61 % frame height and never "led in". Width 2.2, not
  // the plan's 3.4: at 2 m from the lens a 3.4 m ribbon subtends 80 deg and fills
  // half the frame as a beige wedge. 2.2 still crosses the bottom edge and still
  // reads at the tree line.
  { from: [0, 12], to: [0, -31], width: 1.0 },
  { from: [0, 4], to: [-31, -4], width: 2.8 },
  { from: [8, 10], to: [29, 17], width: 2.8 },
  { from: [0, 20], to: [-23, 22], width: 2.4 },
];

/* ==========================================================================
   Noise + math
   ========================================================================== */

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash2(ix, iz) {
  let h = ix * 374761393 + iz * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

// Smooth value noise in [0,1].
function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

function fbm(x, z, octaves = 4, lacunarity = 2.02, gain = 0.5) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * noise2(x * freq, z * freq);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return v / norm;
}

// Distance outside the flat playable square (0 inside, rounded corners).
function squareDistance(x, z) {
  const dx = Math.max(Math.abs(x) - PLAY_HALF, 0);
  const dz = Math.max(Math.abs(z) - PLAY_HALF, 0);
  return Math.hypot(dx, dz);
}

// Signed distance to the lake: negative inside the water. An ellipse warped by
// low-frequency noise, so the shoreline is an organic bay rather than a
// rectangle. Approximate metres.
function lakeDistance(x, z) {
  const nx = (x - LAKE.cx) / LAKE.rx;
  const nz = (z - LAKE.cz) / LAKE.rz;
  const radial = (Math.hypot(nx, nz) - 1) * Math.min(LAKE.rx, LAKE.rz);
  const warp = (fbm(x * 0.055 + 13.0, z * 0.055 - 7.0, 3) - 0.5) * 11.0;
  return radial + warp;
}

/* ==========================================================================
   Height field
   ========================================================================== */

// Rolling relief: broad swells, medium humps, small undulation. Kept cheap
// because heightAt() is also called by the foliage module for every placement.
function relief(x, z) {
  const broad = fbm(x * 0.0105 + 3.1, z * 0.0105 - 7.4, 4);
  const mid = fbm(x * 0.036 - 11.0, z * 0.036 + 5.0, 3);
  const fine = fbm(x * 0.098 + 21.0, z * 0.098 - 13.0, 2);
  return (broad - 0.44) * 15.0 + (mid - 0.5) * 3.4 + (fine - 0.5) * 0.9;
}

function heightAt(x, z) {
  const sd = squareDistance(x, z);

  // 0 inside the square, 1 well outside: a long, soft ramp so the flat
  // playfield blends into the rolling rim instead of creasing.
  const ramp = smoothstep(0, 30, sd);
  const far = smoothstep(26, 130, sd);

  let h = ramp * relief(x, z) + far * 6.5 * (0.4 + fbm(x * 0.008 + 9, z * 0.008 - 4, 2));

  // A wooded rim ridge: the land lifts toward the tree wall, which gives the
  // meadow a bowl and hides the horizon line behind trunks.
  const rim = smoothstep(34, 92, sd);
  h += rim * 3.2 * (0.55 + fbm(x * 0.02 + 51, z * 0.02 - 23, 2));

  // Lake basin. The shoreline contour (-0.35) is what the water plane meets.
  // The blend is deliberately tight on the outside: land must climb back above
  // the waterline within a couple of metres, otherwise the oversized water
  // plane leaks out past the shore as a hard edge. The basin is also masked
  // away from the playable square so it can never dig into flat gameplay ground.
  const lsd = lakeDistance(x, z);
  if (lsd < 20) {
    const inside = smoothstep(2.5, -4.0, lsd) * smoothstep(0.5, 5.0, sd);
    const lakeBed = -0.35 - 3.0 * smoothstep(0, -18, lsd);
    h *= 1 - inside * 0.75;
    h = lerp(h, lakeBed, inside);
  }
  // Land floor: OUTSIDE the lake the ground never dips below the waterline, so
  // the water plane's outer margin is always buried under terrain. Guarded on
  // lsd > 0 so it can never fill the basin it is meant to protect.
  if (lsd > 0) {
    const landFloor = smoothstep(0.8, 3.5, lsd) * 0.75;
    if (landFloor > h) h = landFloor;
  }

  return h;
}

/* ==========================================================================
   Path field
   ========================================================================== */

function buildPathSegments(loop, spokes) {
  const segments = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    segments.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], half: LOOP_WIDTH * 0.5 });
  }
  for (const s of spokes) {
    segments.push({
      ax: s.from[0], az: s.from[1], bx: s.to[0], bz: s.to[1],
      half: (s.width ?? SPOKE_WIDTH) * 0.5,
    });
  }
  return segments;
}

function makePathDistance(segments) {
  return function pathDistance(x, z) {
    let best = Infinity;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 0 ? ((x - s.ax) * dx + (z - s.az) * dz) / len2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const d = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)) - s.half;
      if (d < best) best = d;
    }
    return best;
  };
}

/* ==========================================================================
   Shader helpers
   ========================================================================== */

const NOISE_GLSL = /* glsl */ `
  float mHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float mNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = mHash(i);
    float b = mHash(i + vec2(1.0, 0.0));
    float c = mHash(i + vec2(0.0, 1.0));
    float d = mHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float mFbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 3; i++) {
      v += amp * mNoise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return v;
  }
`;

function colorUniform(hex) {
  return new THREE.Color(hex);
}

/* ==========================================================================
   createMeadowTerrain
   ========================================================================== */

export function createMeadowTerrain(options = {}) {
  const {
    palette = MEADOW,
    loop = DEFAULT_LOOP,
    spokes = DEFAULT_SPOKES,
    quality = "high",
    // Boulders can be disabled when a separate asset kit (the ported reference
    // rocks) is providing them; the path/shore pebbles always stay.
    rocks: rocksEnabled = true,
  } = options;

  const group = new THREE.Group();
  group.name = "meadowTerrain";

  const stats = { triangles: 0, drawCalls: 0, verts: 0 };
  const colliders = [];

  // Organic trail: jitter the waypoints BEFORE both the distance field and the
  // ribbon are built, so grass placement and the visible path agree. A path
  // through hand-placed waypoints is otherwise a clean rounded rectangle.
  function jitterPath(points, amp) {
    return points.map(([x, z], i) => {
      const n1 = noise2(i * 1.7 + 3.1, i * 0.9 - 2.4) - 0.5;
      const n2 = noise2(i * 0.8 - 5.2, i * 1.3 + 7.7) - 0.5;
      return [x + n1 * amp, z + n2 * amp];
    });
  }
  const loopPts = jitterPath(loop, 5.5);
  const spokePts = spokes.map((s, i) => ({
    ...s,
    from: [
      s.from[0] + (noise2(i * 3.1 + 2.0, 1.7) - 0.5) * 3.0,
      s.from[1] + (noise2(i * 1.3 + 5.0, 4.2) - 0.5) * 3.0,
    ],
    to: [
      s.to[0] + (noise2(i * 2.7 + 7.0, 8.1) - 0.5) * 3.0,
      s.to[1] + (noise2(i * 4.4 + 9.0, 2.2) - 0.5) * 3.0,
    ],
  }));

  const segments = buildPathSegments(loopPts, spokePts);
  const pathDistance = makePathDistance(segments);
  const C = {};
  for (const [k, v] of Object.entries(palette)) C[k] = colorUniform(v);

  /* ---------------- ground mesh ---------------- */

  const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEG, GROUND_SEG);
  groundGeo.rotateX(-Math.PI / 2);

  const pos = groundGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmpColor = new THREE.Color();
  const slopeSample = 0.9;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);

    // Slope from the analytic field: used for dirt on steep banks and for a
    // touch of cool shadow in hollows.
    const hx = heightAt(x + slopeSample, z) - heightAt(x - slopeSample, z);
    const hz = heightAt(x, z + slopeSample) - heightAt(x, z - slopeSample);
    const slope = Math.min(1, Math.hypot(hx, hz) / (slopeSample * 2));

    groundColorAt(x, z, h, slope, tmpColor);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  groundGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();

  function groundColorAt(x, z, h, slope, out) {
    // Two independent low-frequency drifts pick a warm/cool meadow mix. They
    // change over tens of metres so no grid cell boundary is ever visible.
    const n1 = fbm(x * 0.027 + 11.0, z * 0.027 - 7.0, 3);
    const n2 = fbm(x * 0.058 - 3.0, z * 0.058 + 9.0, 3);

    out.copy(C.grassBase);
    out.lerp(C.grassWarm, smoothstep(0.40, 0.74, n1) * 0.92);
    out.lerp(C.grassCool, smoothstep(0.44, 0.80, n2) * 0.78);

    // Sunlit swells go a touch yellow, hollows a touch blue-green.
    const lift = smoothstep(0.35, 1.1, h) * 0.22;
    out.lerp(C.grassTip, lift * 0.35);
    out.lerp(C.grassShadow, smoothstep(0.1, -0.5, h) * 0.45);

    // Woodland shade: the ground darkens as it runs into the tree wall, which
    // sells the canopy above it even before a single tree is drawn.
    const sd = squareDistance(x, z);
    out.lerp(C.grassShadow, smoothstep(26, 78, sd) * 0.5);

    // Moss patches.
    const moss = smoothstep(0.60, 0.80, fbm(x * 0.105 + 31.0, z * 0.105 - 13.0, 2));
    out.lerp(C.moss, moss * 0.5);

    // Worn path shoulders: a soft beige halo under and beside the ribbon.
    // Round 3: 0.7 m / 0.55, so the ribbon reads as a 1 m trail with an edge
    // rather than a 3 m beige smudge bleeding into the grass.
    const pd = pathDistance(x, z);
    if (pd < 0.7) {
      out.lerp(C.pathEdge, smoothstep(0.7, 0.02, pd) * 0.55);
    }

    // Steep banks expose earth.
    out.lerp(C.dirt, smoothstep(0.30, 0.72, slope) * 0.6);

    // Wet, darker ground at the waterline.
    if (h < 0.35) {
      out.lerp(C.pathWet, smoothstep(0.35, -0.3, h) * 0.65);
      out.lerp(C.grassShadow, smoothstep(0.2, -0.6, h) * 0.4);
    }
  }

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });

  // Procedural painterly detail on top of the vertex colours: three octaves of
  // world-space noise plus a low-key flower speckle. This is what stops a flat
  // 92 m meadow from reading as one solid green sheet.
  const groundUniforms = {
    uPink: { value: C.flowerPink.clone() },
    uCream: { value: C.flowerCream.clone() },
    uLilac: { value: C.flowerLilac.clone() },
    // Style lever: 0 = soft painterly dapple, 1 = hard-edged cel shadow shapes.
    uCel: { value: 0 },
  };

  groundMat.onBeforeCompile = (shader) => {
    shader.uniforms.uPink = groundUniforms.uPink;
    shader.uniforms.uCream = groundUniforms.uCream;
    shader.uniforms.uLilac = groundUniforms.uLilac;
    shader.uniforms.uCel = groundUniforms.uCel;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vMeadowWorld;"
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvMeadowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vMeadowWorld;
        uniform vec3 uPink;
        uniform vec3 uCream;
        uniform vec3 uLilac;
        uniform float uCel;
        ${NOISE_GLSL}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 mw = vMeadowWorld.xz;
        float mn1 = mFbm(mw * 0.38);
        float mn2 = mNoise(mw * 1.85 + 17.0);
        float mn3 = mNoise(mw * 6.4 + 3.0);

        // Broad painterly value drift.
        diffuseColor.rgb *= 1.0 + (mn1 - 0.5) * 0.42 + (mn2 - 0.5) * 0.13 + (mn3 - 0.5) * 0.06;

        // Fine surface grain. The meadow floor had no detail below ~6 m, which
        // is why it read as a low-res blur: there was simply nothing there to
        // resolve. Two high-frequency octaves give it a tooth to sit next to
        // the grass. Faded out with distance, because high-frequency noise
        // without mipmapping shimmers like static once one texel is wider than
        // a blade of grass.
        float camDist = length(vMeadowWorld - cameraPosition);
        float fine = 1.0 - smoothstep(16.0, 52.0, camDist);
        float mn4 = mNoise(mw * 21.0 + 61.0);
        float mn5 = mNoise(mw * 63.0 + 13.0);
        diffuseColor.rgb *= 1.0 + ((mn4 - 0.5) * 0.16 + (mn5 - 0.5) * 0.09) * fine;

        // Warm sunlit patches and cool damp hollows.
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.14, 1.04, 0.84),
          smoothstep(0.50, 0.86, mn2) * 0.50);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.88, 1.00, 1.12),
          smoothstep(0.54, 0.88, mn1) * 0.40);

        // Large soft shade pockets: reads as cloud shadow / canopy drift passing
        // over the meadow and breaks up the flat floor. uCel narrows the edge
        // until the pockets read as painted shadow shapes instead of a gradient.
        float dapple = smoothstep(
          mix(0.52, 0.615, uCel),
          mix(0.92, 0.735, uCel),
          mFbm(mw * 0.055 + 77.0)
        );
        diffuseColor.rgb *= 1.0 - dapple * (0.13 + uCel * 0.075);

        // Distant flower carpets: a pastel speckle that only shows where a
        // low-frequency field says a drift lives. Adds colour without geometry.
        float drift = smoothstep(0.54, 0.80, mFbm(mw * 0.075 + 41.0));
        float speck = smoothstep(0.62, 0.93, mNoise(mw * 2.7 + 9.0));
        vec3 flowerTint = mix(uPink, uCream, mNoise(mw * 0.45 + 3.0));
        flowerTint = mix(flowerTint, uLilac, smoothstep(0.62, 0.85, mNoise(mw * 0.21 - 8.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, flowerTint, drift * speck * 0.42);
        `
      );
  };
  groundMat.customProgramCacheKey = () => "meadow-ground-v1";

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = "meadowGround";
  ground.receiveShadow = true;
  group.add(ground);
  stats.drawCalls += 1;
  stats.verts += pos.count;
  stats.triangles += groundGeo.index ? groundGeo.index.count / 3 : pos.count / 3;

  /* ---------------- path ribbons ---------------- */

  const pathGroup = new THREE.Group();
  pathGroup.name = "meadowPaths";
  group.add(pathGroup);

  function sampleCurve(points, closed, count, halfWidth) {
    const curvePoints = points.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(curvePoints, closed, "catmullrom", 0.5);
    const out = [];
    const total = count;
    for (let i = 0; i < total; i++) {
      const t = closed ? i / total : i / (total - 1);
      const p = curve.getPoint(t);
      out.push({ x: p.x, z: p.z, half: halfWidth });
    }
    return out;
  }

  // Wobble the ribbon edge and width with smooth low-frequency noise so the path
  // reads as trodden earth, not a CAD extrusion.
  function buildRibbon(samples, closed, seedOffset) {
    const verts = [];
    const cols = [];
    const uAcross = [];
    const uAlong = [];
    const indices = [];
    const n = samples.length;
    let length = 0;

    for (let i = 0; i < n; i++) {
      const p = samples[i];
      const prev = samples[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const next = samples[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const nx = -tz;
      const nz = tx;

      if (i > 0) length += Math.hypot(p.x - prev.x, p.z - prev.z);

      // Smooth width + centre wobble. Generous amplitude: a trail wanders, and a
      // mechanically even ribbon is what made the old map read as a racetrack.
      const wob = Math.sin(i * 0.21 + seedOffset) * 0.5 + Math.sin(i * 0.07 + seedOffset * 2.1) * 0.9;
      const half = p.half * (1.0 + Math.sin(i * 0.13 + seedOffset * 1.7) * 0.22);
      const cx = p.x + nx * wob;
      const cz = p.z + nz * wob;
      const y = heightAt(cx, cz) + PATH_Y;

      // Slightly asymmetric shoulders: one edge a little wider, like real wear.
      const halfL = half * 1.04;
      const halfR = half * 0.96;
      verts.push(cx + nx * halfL, y, cz + nz * halfL);
      verts.push(cx - nx * halfR, y, cz - nz * halfR);
      uAcross.push(0, 1);
      uAlong.push(length, length);

      // Dirt colour drift along the path: warm dry centre, cooler damp patches.
      const v = fbm(cx * 0.09 + seedOffset, cz * 0.09 - seedOffset, 2);
      const cL = C.path.clone().lerp(C.pathWet, (1 - v) * 0.45);
      const cR = C.path.clone().lerp(C.pathStone, v * 0.30);
      cols.push(cL.r, cL.g, cL.b, cR.r, cR.g, cR.b);
    }

    const ringCount = closed ? n : n;
    for (let i = 0; i < ringCount - (closed ? 0 : 1); i++) {
      const a = i * 2;
      const b = ((i + 1) % n) * 2;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    geo.setAttribute("aPathU", new THREE.Float32BufferAttribute(uAcross, 1));
    geo.setAttribute("aPathV", new THREE.Float32BufferAttribute(uAlong, 1));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  const pathMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  pathMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aPathU;
        attribute float aPathV;
        varying float vPathU;
        varying float vPathV;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vPathU = aPathU;
        vPathV = aPathV;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vPathU;
        varying float vPathV;
        ${NOISE_GLSL}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // Soft, noise-broken edges: the dirt fades into the grass instead of
        // ending on a hard geometric line.
        float edge = abs(vPathU - 0.5) * 2.0;
        float wobble = mNoise(vec2(vPathV * 0.55, 3.0)) * 0.34 + mNoise(vec2(vPathV * 1.9, 8.0)) * 0.14;
        float alpha = 1.0 - smoothstep(0.30 + wobble, 1.0, edge);
        // Fine dirt grain.
        diffuseColor.rgb *= 0.92 + 0.16 * mNoise(vec2(vPathV * 2.4, vPathU * 7.0));
        diffuseColor.a *= alpha * 0.82;
        `
      );
  };
  pathMat.customProgramCacheKey = () => "meadow-path-v1";

  const loopSamples = sampleCurve(loopPts, true, 460, LOOP_WIDTH * 0.5);
  const loopGeo = buildRibbon(loopSamples, true, 1.7);
  const loopMesh = new THREE.Mesh(loopGeo, pathMat);
  loopMesh.name = "meadowPathLoop";
  loopMesh.receiveShadow = true;
  loopMesh.renderOrder = 1;
  pathGroup.add(loopMesh);
  stats.triangles += loopGeo.index.count / 3;
  stats.drawCalls += 1;

  for (let s = 0; s < spokePts.length; s++) {
    const sp = spokePts[s];
    const samples = sampleCurve([sp.from, sp.to], false, 90, (sp.width ?? SPOKE_WIDTH) * 0.5);
    const geo = buildRibbon(samples, false, 4.1 + s * 2.3);
    const mesh = new THREE.Mesh(geo, pathMat);
    mesh.name = `meadowPathSpoke${s}`;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    pathGroup.add(mesh);
    stats.triangles += geo.index.count / 3;
    stats.drawCalls += 1;
  }

  /* ---------------- lake ---------------- */

  const waterGroup = new THREE.Group();
  waterGroup.name = "meadowWater";
  group.add(waterGroup);

  const lakeW = LAKE.rx * 2 + LAKE_MARGIN * 2 + 22;
  const lakeD = LAKE.rz * 2 + LAKE_MARGIN * 2 + 22;
  const WATER_SEG = 96;
  const waterGeo = new THREE.PlaneGeometry(lakeW, lakeD, WATER_SEG, WATER_SEG);
  waterGeo.rotateX(-Math.PI / 2);

  // Bake the exact shoreline distance into the water vertices. The foam band and
  // the shallow-water tint read from this interpolated field, so they follow the
  // warped shore exactly instead of an approximated rectangle.
  {
    const wp = waterGeo.attributes.position;
    const shore = new Float32Array(wp.count);
    for (let i = 0; i < wp.count; i++) {
      shore[i] = lakeDistance(wp.getX(i) + LAKE.cx, wp.getZ(i) + LAKE.cz);
    }
    waterGeo.setAttribute("aShore", new THREE.BufferAttribute(shore, 1));
  }

  const waterMat = new THREE.MeshStandardMaterial({
    color: C.water,
    roughness: 0.14,
    metalness: 0.04,
    transparent: true,
    opacity: 0.92,
  });

  const waterUniforms = {
    uTime: { value: 0 },
    uShallow: { value: C.waterShallow.clone() },
    uDeep: { value: C.waterDeep.clone() },
    uFoam: { value: C.waterFoam.clone() },
    uSky: { value: (C.skyMid ?? C.skyHorizon).clone() },
    // Reflected sky gradient + the sun that draws the glint. index.js keeps
    // uSunDir in step with the real light rig every frame.
    uZenith: { value: (C.skyZenith ?? C.skyMid ?? C.skyHorizon).clone() },
    uSunDir: { value: new THREE.Vector3(0.55, 0.6, -0.55).normalize() },
    uSunColor: { value: new THREE.Color(0xfff0d0) },
  };

  waterMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aShore;
        varying vec3 vWaterWorld;
        varying float vShore;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vShore = aShore;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWaterWorld;
        varying float vShore;
        uniform float uTime;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        uniform vec3 uSky;
        uniform vec3 uZenith;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        ${NOISE_GLSL}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 wp = vWaterWorld.xz;
        float shore = vShore;
        float depth = smoothstep(0.0, -14.0, shore);
        float t = uTime;

        // ---- surface normal from two travelling ripple fields -------------
        // The GRADIENT of a noise field tilts the reflection. Using the noise
        // VALUE (the old code) only shimmered the colour, which is why the lake
        // read as painted glass rather than water.
        vec2 p1 = wp * 0.42 + vec2(t * 0.10, -t * 0.07);
        vec2 p2 = wp * 1.35 - vec2(t * 0.16, t * 0.12);
        float e = 0.06;
        float n1x = mNoise(p1 + vec2(e, 0.0)) - mNoise(p1 - vec2(e, 0.0));
        float n1z = mNoise(p1 + vec2(0.0, e)) - mNoise(p1 - vec2(0.0, e));
        float n2x = mNoise(p2 + vec2(e, 0.0)) - mNoise(p2 - vec2(e, 0.0));
        float n2z = mNoise(p2 + vec2(0.0, e)) - mNoise(p2 - vec2(0.0, e));
        vec3 N = normalize(vec3(-(n1x * 1.15 + n2x * 0.55), 1.0, -(n1z * 1.15 + n2z * 0.55)));
        vec3 V = normalize(cameraPosition - vWaterWorld);

        // ---- what the surface is reflecting --------------------------------
        vec3 R = reflect(-V, N);
        vec3 skyRefl = mix(uSky, uZenith, smoothstep(0.02, 0.55, R.y));
        // Sun glint. The tight specular path is the single strongest "this is
        // water" cue, and it breaks up across the ripples for free because R
        // is already perturbed by the normal.
        float glint = pow(max(dot(R, normalize(uSunDir)), 0.0), 260.0);
        skyRefl += uSunColor * glint * 3.2;

        // ---- body colour, absorbing with depth ----------------------------
        vec3 body = mix(uShallow, uDeep, depth);
        body *= 0.94 + 0.12 * mNoise(wp * 0.9 + vec2(t * 0.05));

        // Fresnel: looking down you see the water, looking along it you see the
        // sky. Capped at 0.92 so the far shore never goes full mirror.
        float fres = 0.03 + 0.72 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
        vec3 waterCol = mix(body, skyRefl, clamp(fres, 0.0, 0.92));

        // Foam: a broken band right at the waterline.
        float band = smoothstep(2.2, 0.1, abs(shore + 0.5));
        float foamNoise = smoothstep(0.40, 0.74, mNoise(wp * 1.15 + vec2(t * 0.35, t * 0.2)));
        waterCol = mix(waterCol, uFoam, band * foamNoise * 0.9);

        diffuseColor.rgb = waterCol;
        `
      );
  };
  waterMat.customProgramCacheKey = () => "meadow-water-v2";

  const water = new THREE.Mesh(waterGeo, waterMat);
  water.name = "meadowLake";
  water.position.set(LAKE.cx, LAKE.level, LAKE.cz);
  waterGroup.add(water);
  stats.drawCalls += 1;
  stats.triangles += (waterGeo.index ? waterGeo.index.count : waterGeo.attributes.position.count) / 3;

  /* ---------------- rocks ---------------- */

  const rockGroup = new THREE.Group();
  rockGroup.name = "meadowRocks";
  group.add(rockGroup);

  function makeRockGeometry(seed) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const cTop = C.stoneTop.clone();
    const cMid = C.stoneMid.clone();
    const cLow = C.stoneShadow.clone();
    const cMoss = C.stoneMoss.clone();
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      // Hash by rounded direction so shared vertices move together (no cracks).
      const kx = Math.round(v.x * 1000);
      const ky = Math.round(v.y * 1000);
      const kz = Math.round(v.z * 1000);
      const n = hash2(kx + seed * 977, ky * 31 + kz * 17);
      const n2 = hash2(ky + seed * 131, kz * 53 + kx * 7);
      const s = 0.74 + n * 0.5;
      v.multiplyScalar(s);
      v.y *= 0.78 + n2 * 0.24;
      p.setXYZ(i, v.x, v.y, v.z);

      const t = clamp01(v.y * 0.5 + 0.5);
      const col = t > 0.5
        ? cMid.clone().lerp(cTop, (t - 0.5) * 2)
        : cLow.clone().lerp(cMid, t * 2);
      // Moss caps on the upward faces.
      const moss = smoothstep(0.66, 0.94, t) * (0.45 + 0.55 * n2);
      col.lerp(cMoss, moss * 0.62);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  const rockMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  });

  const rockGeos = [makeRockGeometry(1), makeRockGeometry(2), makeRockGeometry(3)];
  const rockPlacements = [[], [], []];

  function addRock(x, z, scale, yaw, tint) {
    const idx = Math.floor(hash2(Math.round(x * 13), Math.round(z * 7)) * 3) % 3;
    rockPlacements[idx].push({
      x, z, y: heightAt(x, z) - scale * 0.22, scale, yaw, tint,
    });
  }

  // Rim outcrops: big boulders poking out of the wooded edge.
  for (let c = 0; c < 14; c++) {
    const a = (c / 14) * TAU + hash2(c, 5) * 0.5;
    const r = 52 + hash2(c, 9) * 22;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const count = 2 + Math.floor(hash2(c, 13) * 3);
    for (let i = 0; i < count; i++) {
      const x = cx + (hash2(c, i + 21) - 0.5) * 9;
      const z = cz + (hash2(c, i + 33) - 0.5) * 9;
      if (lakeDistance(x, z) < 4) continue;
      addRock(x, z, 1.3 + hash2(c, i + 41) * 2.4, hash2(c, i + 51) * TAU, null);
    }
  }

  // Shore boulders: the scalloped lake edge. Found by marching outward along a
  // ray until the warped shoreline distance crosses zero, so they always sit on
  // the actual waterline rather than on an approximated rectangle.
  function shorePoint(angle) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    let lo = 0;
    let hi = 46;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) * 0.5;
      const d = lakeDistance(LAKE.cx + ca * mid, LAKE.cz + sa * mid);
      if (d < 0) lo = mid;
      else hi = mid;
    }
    return { x: LAKE.cx + ca * lo, z: LAKE.cz + sa * lo };
  }

  const shoreSamples = 40;
  for (let i = 0; i < shoreSamples; i++) {
    const t = i / shoreSamples;
    const p = shorePoint(t * TAU);
    const jitter = (hash2(i, 2) - 0.5) * 1.8;
    const x = p.x + jitter;
    const z = p.z + (hash2(i, 3) - 0.5) * 1.8;
    if (hash2(i, 4) < 0.22) continue;
    addRock(x, z, 0.5 + hash2(i, 6) * 1.05, hash2(i, 8) * TAU, null);
  }

  // A few interior boulders for gameplay composition, with colliders. Kept well
  // off the path and out of the central clearing.
  const interiorRocks = [
    [34, -12, 1.7], [24, 30, 1.5], [-36, 8, 1.6], [-20, -34, 1.4], [12, -38, 1.5],
  ];
  for (const [x, z, s] of interiorRocks) {
    addRock(x, z, s, hash2(x, z) * TAU, null);
    colliders.push({ x, z, radius: s * 0.9 });
  }

  for (let g = 0; g < rockGeos.length; g++) {
    const list = rockPlacements[g];
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(rockGeos[g], rockMat, list.length);
    mesh.name = `meadowRocks${g}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const sc = new THREE.Vector3();
    const posv = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      q.setFromAxisAngle(up, r.yaw);
      sc.set(r.scale * 1.15, r.scale, r.scale * 1.05);
      posv.set(r.x, r.y, r.z);
      m.compose(posv, q, sc);
      mesh.setMatrixAt(i, m);
      const k = 0.92 + hash2(Math.round(r.x), Math.round(r.z)) * 0.16;
      col.setRGB(k, k, k);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    rockGroup.add(mesh);
    stats.drawCalls += 1;
    stats.triangles += (rockGeos[g].index ? rockGeos[g].index.count : rockGeos[g].attributes.position.count) / 3 * list.length;
  }

  /* ---------------- pebbles ---------------- */

  const pebbleGroup = new THREE.Group();
  pebbleGroup.name = "meadowPebbles";
  group.add(pebbleGroup);

  const pebbleGeo = new THREE.DodecahedronGeometry(0.16, 0);
  const pebbleMat = new THREE.MeshStandardMaterial({
    color: C.pathStone,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  const pebbles = [];
  const tmpP = new THREE.Vector3();

  // Pebbles scattered along the path shoulders.
  for (let i = 0; i < 900; i++) {
    const a = hash2(i, 71) * TAU;
    const r = 46 + hash2(i, 73) * 30;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const pd = pathDistance(x, z);
    if (pd < 0.2 || pd > 2.2) continue;
    pebbles.push({
      x, z, y: heightAt(x, z) + 0.02,
      s: 0.35 + hash2(i, 79) * 0.9,
      yaw: hash2(i, 83) * TAU,
    });
  }
  // Pebbles on the lake shore.
  for (let i = 0; i < 260; i++) {
    const a = hash2(i, 91) * TAU;
    const p = shorePoint(a);
    const off = (hash2(i, 93) - 0.5) * 2.4;
    const x = p.x + Math.cos(a) * off;
    const z = p.z + Math.sin(a) * off;
    pebbles.push({
      x, z,
      y: Math.max(heightAt(x, z), LAKE.level) + 0.02,
      s: 0.4 + hash2(i, 97),
      yaw: hash2(i, 99) * TAU,
    });
  }

  if (pebbles.length) {
    const mesh = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbles.length);
    mesh.name = "meadowPebbles";
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const sc = new THREE.Vector3();
    for (let i = 0; i < pebbles.length; i++) {
      const p = pebbles[i];
      q.setFromAxisAngle(up, p.yaw);
      sc.set(p.s, p.s * 0.62, p.s * 0.9);
      tmpP.set(p.x, p.y, p.z);
      m.compose(tmpP, q, sc);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    pebbleGroup.add(mesh);
    stats.drawCalls += 1;
    stats.triangles += (pebbleGeo.index ? pebbleGeo.index.count : pebbleGeo.attributes.position.count) / 3 * pebbles.length;
  }

  // Boulders are optional: the ported reference rocks replace them when present.
  if (!rocksEnabled) group.remove(rockGroup);

  /* ---------------- animation ---------------- */

  function update(elapsed) {
    const t = Number.isFinite(elapsed) ? elapsed : 0;
    waterUniforms.uTime.value = t;
  }

  return {
    group,
    heightAt,
    pathDistance,
    waterLevel: LAKE.level,
    lake: LAKE,
    update,
    colliders,
    stats,
    // Style levers the comparison page writes to (ground cel-shadow crispness).
    uniforms: { groundCel: groundUniforms.uCel, waterSunDir: waterUniforms.uSunDir },
  };
}
