// Frost Lance — pooled visuals for the mage's ground-eruption spell.
//
// A fracture front races down the locked aim line and a field of broad crystal
// blades tears out of the floor behind it: dense and ankle-high at the caster,
// a leaning crown at the far end. Ground rime is laid as the front passes, chips
// and fog roll off the breaches, glitter drifts up, and the far end lands with a
// frosted shell and shockwave.
//
// Geometry construction, the ice shading and the cast choreography are adapted
// from the MIT-licensed spellbook reference project (ProceduralGeometry.js,
// IceMaterial.js, IceAbility.js). See game/src/spellbook-LICENSE.txt.
//
// Cheap by construction:
//   - three shared crystal geometries and ONE shared ice material; the ice
//     shader is compiled once at module creation, never per cast.
//   - fixed cast slots (3): a cast only rewrites pooled records and instance
//     matrices. Nothing is allocated per cast.
//   - three InstancedMeshes carry every crystal of every slot (3 draw calls),
//     one instanced frost footprint, and one Points system each for fog, chips
//     and glitter. The impact shell is one mesh per slot, created once.
//   - no dynamic lights, no postprocessing, no refraction, no screen capture.
//
// Gameplay damage lives in enemies.js and is independent of these slots: if a
// visual cast is recycled early, the accepted hit still resolves.

import * as THREE from "three";
import { ICE_LANCE } from "./ice-lance-config.js";
import { halfWidthAt, advanceFront } from "./ice-lance-logic.js";

const TAU = Math.PI * 2;
const VARIANTS = 3;
const IMPACT_CLUSTER_FRACTION = 0.24;
const PATCH_LAYOUT_RANGE = 0.8; // metres of front travel before a patch is fully laid
const FOG_STEP = 1.2; // metres of front travel per fog puff
const SPARKLE_STEP = 0.7; // metres of front travel per glitter mote

function sat(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(e0, e1, x) {
  const t = sat((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}
function hash11(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}
function outQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}
function inCubic(t) {
  return t * t * t;
}

/**
 * Procedural noise library, copied from the MIT-licensed reference
 * (spellbook/src/shaders/lib/noise.glsl.js) so the ice shading can keep its
 * internal cracks, feather veins and pinpoint glints. Compiled once into the
 * single shared ice material.
 */
const NOISE_GLSL = /* glsl */ `
#ifndef NOISE_LIB_INCLUDED
#define NOISE_LIB_INCLUDED

vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute289(vec4 x) { return mod289v4(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
vec2 hash21(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 hash31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

/* ---- Ashima / Stefan Gustavson simplex noise ---- */
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289v3(i);
  vec4 p = permute289(permute289(permute289(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt4(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * snoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

/** Ridged multifractal — sharp filaments, ideal for internal cracks. */
float ridged(vec3 p, int unusedOctaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * (1.0 - abs(snoise(p)));
    p *= 2.06;
    a *= 0.5;
  }
  return v;
}
#endif
`;

/**
 * One ice crystal in unit space: base ring on y = 0, apex at y = 1, base
 * circumscribed radius 0.5. Instance scaling therefore sets footprint and
 * height independently, and `local.y` reads as "how far up the crystal am I".
 * Adapted from the reference `createCrystalGeometry` (MIT).
 */
export function createCrystalGeometry({ seed = 1, sides = 7, taper = 0.62, roughness = 0.12, bend = 0.62 } = {}) {
  const facets = Math.max(3, Math.round(sides));
  const tipRadius = Math.min(0.9, Math.max(0.01, taper));
  const ringHeights = [0, 0.22, 0.5, 0.75, 0.92];

  const bendAngle = hash11(seed * 1.77) * TAU;
  const bendX = Math.cos(bendAngle);
  const bendZ = Math.sin(bendAngle);
  const axisOffset = (t) => bend * 0.5 * Math.pow(t, 1.6);

  const angles = [];
  for (let i = 0; i < facets; i++) {
    const jitter = (hash11(seed * 3.13 + i * 7.7) - 0.5) * (TAU / facets) * 0.55 * roughness * 3;
    angles.push((i / facets) * TAU + jitter);
  }

  const rings = ringHeights.map((t, ringIndex) => {
    const baseR = (tipRadius + (1 - tipRadius) * Math.pow(1 - t, 1.15)) * 0.5;
    const drift = axisOffset(t);
    const y = t + (hash11(seed * 5.9 + ringIndex * 2.3) - 0.5) * 0.06 * roughness * (t > 0 ? 1 : 0);
    return angles.map((angle, i) => {
      const wobble =
        1 + (hash11(seed * 11.1 + ringIndex * 13.7 + i * 3.9) - 0.5) * roughness * 1.3 * (0.35 + 0.65 * t);
      const r = Math.max(0.002, baseR * wobble);
      return [Math.cos(angle) * r + bendX * drift, y, Math.sin(angle) * r + bendZ * drift];
    });
  });

  const apexDrift = axisOffset(1);
  const apex = [
    bendX * apexDrift + (hash11(seed * 17.3) - 0.5) * 0.09 * roughness,
    1,
    bendZ * apexDrift + (hash11(seed * 19.7) - 0.5) * 0.09 * roughness,
  ];
  const floorCentre = [0, 0, 0];

  const positions = [];
  const push = (p) => positions.push(p[0], p[1], p[2]);

  for (let ring = 0; ring < rings.length - 1; ring++) {
    const lower = rings[ring];
    const upper = rings[ring + 1];
    for (let i = 0; i < facets; i++) {
      const j = (i + 1) % facets;
      push(lower[i]);
      push(lower[j]);
      push(upper[i]);
      push(lower[j]);
      push(upper[j]);
      push(upper[i]);
    }
  }

  const top = rings[rings.length - 1];
  const base = rings[0];
  for (let i = 0; i < facets; i++) {
    const j = (i + 1) % facets;
    push(top[i]);
    push(top[j]);
    push(apex);
    push(floorCentre);
    push(base[j]);
    push(base[i]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // Non-indexed + per-face normals is what makes the facets crisp.
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Shared ice material. A patched MeshStandardMaterial: the scene's own lights
 * and fog still apply, and the reference's stylisation is injected once —
 * thickness tint, internal fracture planes, feather veins, rime, surface
 * glints, fresnel rim and the per-instance birth flash.
 */
export function createIceMaterial() {
  const cfg = ICE_LANCE;
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.16,
    metalness: 0,
    flatShading: true,
    transparent: true,
    opacity: cfg.opacity,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  const uniforms = {
    uTime: { value: 0 },
    uColorDeep: { value: new THREE.Color(cfg.colorDeep) },
    uColorIce: { value: new THREE.Color(cfg.colorIce) },
    uColorRim: { value: new THREE.Color(cfg.colorRim) },
    uColorCore: { value: new THREE.Color(cfg.colorCore) },
    uDensity: { value: cfg.depthTint },
    uFresnel: { value: cfg.fresnel },
    uFresnelPower: { value: cfg.fresnelPower },
    uTranslucency: { value: cfg.translucency },
    uFacetSharp: { value: cfg.facetSharp },
    uFracture: { value: cfg.fracture },
    uFractureScale: { value: cfg.fractureScale },
    uVeins: { value: cfg.veins },
    uVeinScale: { value: cfg.veinScale },
    uSparkle: { value: cfg.glint },
    uSparkleScale: { value: cfg.glintScale },
    uSparkleSpeed: { value: cfg.glintSpeed },
    uFrostLine: { value: cfg.frostLine },
    uGlow: { value: cfg.glow },
    uEdgeGlow: { value: cfg.edgeGlow },
    uBirthGlow: { value: cfg.birthGlow },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute float aSeed;
         attribute float aBirth;
         varying vec3  vIceLocal;
         varying vec3  vIceWorld;
         varying float vIceSeed;
         varying float vIceBirth;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vIceLocal = transformed;
         vIceSeed = aSeed;
         vIceBirth = aBirth;
         #ifdef USE_INSTANCING
           vIceWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
         #else
           vIceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
         #endif`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         uniform vec3  uColorDeep;
         uniform vec3  uColorIce;
         uniform vec3  uColorRim;
         uniform vec3  uColorCore;
         uniform float uDensity;
         uniform float uFresnel;
         uniform float uFresnelPower;
         uniform float uTranslucency;
         uniform float uFacetSharp;
         uniform float uFracture;
         uniform float uFractureScale;
         uniform float uVeins;
         uniform float uVeinScale;
         uniform float uSparkle;
         uniform float uSparkleScale;
         uniform float uSparkleSpeed;
         uniform float uFrostLine;
         uniform float uGlow;
         uniform float uEdgeGlow;
         uniform float uBirthGlow;
         varying vec3  vIceLocal;
         varying vec3  vIceWorld;
         varying float vIceSeed;
         varying float vIceBirth;
         ${NOISE_GLSL}`
      )
      // Injected once the normal is resolved: with flatShading there is no
      // vNormal varying, so every view-dependent term reads the face normal
      // derived by <normal_fragment_begin>.
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         {
           vec3  N   = normalize(normal);
           float ndv = clamp(dot(N, normalize(vViewPosition)), 0.0, 1.0);

           // A facet seen head-on is the longest path through the ice.
           float thickness = clamp(ndv * uDensity, 0.0, 1.0);
           float fres = pow(1.0 - ndv, uFresnelPower) * uFresnel;

           // World-space crack planes: a small shard and a tall spike read as
           // cut from the same glacier.
           vec3  fp     = vIceWorld * uFractureScale + vIceSeed * 37.0;
           float cracks = smoothstep(0.55, 0.98, ridged(fp, 4));

           // Local-space veining follows each crystal's own axis.
           float veins = fbm3(vIceLocal * uVeinScale * 4.0 + vIceSeed * 11.0) * 0.5 + 0.5;
           veins = smoothstep(0.45, 0.92, veins);

           vec3 body = mix(uColorIce, uColorDeep, thickness);
           body = mix(body, uColorRim, veins * uVeins * 0.45);
           body = mix(body, uColorRim, cracks * uFracture * 0.32);

           // Rime gathers where the crystal left the floor.
           float rime = smoothstep(0.55, 0.0, vIceLocal.y) *
                        (0.5 + 0.5 * fbm3(vIceLocal * 9.0 + vIceSeed * 5.0));
           body = mix(body, uColorRim, clamp(rime, 0.0, 1.0) * uFrostLine);

           // Lift the facets that face the camera so the silhouette reads as
           // a bundle of planes rather than one smooth mass.
           body *= mix(1.0, 0.55 + 0.9 * ndv, uFacetSharp);

           // Pinpoint glints, biased to grazing angles where ice catches light.
           float sp = snoise(vIceWorld * uSparkleScale +
                             vec3(0.0, uTime * uSparkleSpeed, 0.0) + vIceSeed * 23.0);
           sp = pow(clamp(sp, 0.0, 1.0), 14.0) * smoothstep(0.0, 0.7, fres + 0.3);

           diffuseColor.rgb *= body;

           float rimAmount = pow(1.0 - ndv, uFresnelPower);
           vec3 glow = uColorRim * rimAmount * uEdgeGlow;
           glow += uColorCore * (cracks * uFracture * 0.8 + veins * uVeins * 0.35) * uTranslucency;
           glow += uColorRim * sp * uSparkle * 1.5;
           glow += uColorCore * vIceBirth * uBirthGlow;
           glow *= uGlow;
           // Soft ceiling so independent grazing-angle terms cannot stack into
           // a white blob on the silhouette.
           glow /= 1.0 + glow * 0.22;
           totalEmissiveRadiance += glow;

           // Thin at the edges, denser through the body and along the cracks.
           diffuseColor.a = clamp(diffuseColor.a * (0.62 + 0.5 * fres) + cracks * 0.12, 0.0, 1.0);
         }`
      );
  };

  material.userData.uniforms = uniforms;
  return material;
}

const POINT_VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (320.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAG_SOFT = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r);
  a *= a;
  a *= vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}`;

const POINT_FRAG_SPARK = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.08, r) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}`;

export const SHELL_VERT = `
varying vec3 vNormalW;
varying vec3 vViewDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// Frost shell: a fresnel-rimmed bubble rather than a flat plastic sphere.
export const SHELL_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main() {
  float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
  float rim = pow(1.0 - ndv, 1.6);
  float a = uOpacity * (0.16 + 0.84 * rim);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

/**
 * Fixed-size particle pool backed by one Points draw call. Every particle is
 * reused round-robin, so a cast never allocates. Used for ground fog, breach
 * chips and the glitter plume.
 */
export function createPointPool({ capacity, blending, soft, renderOrder }) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
  geometry.setDrawRange(0, capacity);

  const material = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: soft ? POINT_FRAG_SOFT : POINT_FRAG_SPARK,
    transparent: true,
    depthWrite: false,
    blending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = renderOrder;

  const records = new Array(capacity);
  for (let i = 0; i < capacity; i++) {
    records[i] = {
      life: 0,
      maxLife: 0,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      drag: 0,
      size0: 0,
      size1: 0,
      alpha: 0,
      r: 1,
      g: 1,
      b: 1,
    };
  }
  let cursor = 0;

  function spawn(o) {
    const p = records[cursor];
    cursor = (cursor + 1) % capacity;
    points.visible = true;
    p.life = p.maxLife = Math.max(0.02, o.life);
    p.x = o.x;
    p.y = o.y;
    p.z = o.z;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.gravity = o.gravity || 0;
    p.drag = o.drag || 0;
    p.size0 = o.size0 || 0.1;
    p.size1 = o.size1 != null ? o.size1 : p.size0;
    p.alpha = o.alpha != null ? o.alpha : 1;
    p.r = o.r != null ? o.r : 1;
    p.g = o.g != null ? o.g : 1;
    p.b = o.b != null ? o.b : 1;
  }

  function update(dt) {
    let alive = 0;
    for (let i = 0; i < capacity; i++) {
      const p = records[i];
      if (p.life <= 0) {
        alphas[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        alphas[i] = 0;
        continue;
      }
      alive += 1;
      const k = 1 - p.life / p.maxLife;
      if (p.drag > 0) {
        const d = Math.pow(p.drag, dt * 60);
        p.vx *= d;
        p.vz *= d;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const fadeIn = sat(k / 0.12);
      const fadeOut = sat((1 - k) / 0.38);
      const o = i * 3;
      positions[o] = p.x;
      positions[o + 1] = p.y;
      positions[o + 2] = p.z;
      colors[o] = p.r;
      colors[o + 1] = p.g;
      colors[o + 2] = p.b;
      sizes[i] = lerp(p.size0, p.size1, k);
      alphas[i] = p.alpha * Math.min(fadeIn, fadeOut);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    points.visible = alive > 0;
  }

  function clear() {
    for (const p of records) p.life = 0;
    for (let i = 0; i < capacity; i++) alphas[i] = 0;
    geometry.attributes.aAlpha.needsUpdate = true;
    points.visible = false;
  }

  return { points, spawn, update, clear };
}

/** Irregular ground patch outline, so rime does not read as perfect discs. */
export function createFrostGeometry() {
  const geometry = new THREE.CircleGeometry(1, 22);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y);
    if (r < 1e-5) continue;
    const angle = Math.atan2(y, x);
    const wobble = 0.82 + 0.18 * hash11(i * 7.7 + Math.cos(angle) * 3.1);
    pos.setXY(i, Math.cos(angle) * r * wobble, Math.sin(angle) * r * wobble);
  }
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export function createIceLanceVFX({ parent, rng, burst, ring, shake, emit } = {}) {
  const cfg = ICE_LANCE;
  const rand = typeof rng === "function" ? rng : Math.random;
  const slots = Math.max(1, Math.round(cfg.slots || 3));
  const crystalCount = Math.max(1, Math.round(cfg.crystalCount || 96));
  const variants = Math.max(1, Math.min(VARIANTS, Math.round(cfg.variants || VARIANTS)));
  const perVariant = Math.ceil(crystalCount / variants);
  const patchesPerCast = Math.max(1, Math.round(cfg.frostPatches || 18));

  const group = new THREE.Group();
  group.name = "ice-lance-vfx";
  if (parent && typeof parent.add === "function") parent.add(group);

  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const lean = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const tilt = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const frostColorA = new THREE.Color(cfg.colorFrost);
  const frostColorB = new THREE.Color(cfg.colorFrostEdge);
  const fogColor = new THREE.Color(cfg.colorMist);
  const chipColor = new THREE.Color(cfg.colorShard);
  const sparkColor = new THREE.Color(cfg.colorSparkle);

  const material = createIceMaterial();
  const uniforms = material.userData.uniforms;

  // ---- shared crystal meshes (one per shape variant, all slots) -----------
  const meshes = [];
  const births = [];
  const facetSides = [cfg.facets, cfg.facets + 1, cfg.facets - 1];
  for (let v = 0; v < variants; v++) {
    const geometry = createCrystalGeometry({
      seed: 7.3 + v * 21.7,
      sides: facetSides[v % facetSides.length],
      taper: cfg.taper,
      roughness: cfg.roughness,
      bend: cfg.bend,
    });
    const capacity = slots * perVariant;
    const seedAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    const birthAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    for (let i = 0; i < capacity; i++) seedAttr.array[i] = rand() * 10;
    geometry.setAttribute("aSeed", seedAttr);
    geometry.setAttribute("aBirth", birthAttr);

    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 2;
    group.add(mesh);
    meshes.push(mesh);
    births.push(birthAttr);

    for (let i = 0; i < capacity; i++) {
      dummy.position.set(0, -999, 0);
      dummy.quaternion.identity();
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ---- frost footprint ----------------------------------------------------
  const frostGeometry = createFrostGeometry();
  const frostMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: cfg.frostAlpha,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const frost = new THREE.InstancedMesh(frostGeometry, frostMaterial, slots * patchesPerCast);
  frost.frustumCulled = false;
  frost.count = 0;
  frost.renderOrder = 1;
  group.add(frost);
  for (let i = 0; i < slots * patchesPerCast; i++) {
    frost.setColorAt(i, frostColorA);
    dummy.position.set(0, -999, 0);
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    frost.setMatrixAt(i, dummy.matrix);
  }
  frost.instanceMatrix.needsUpdate = true;
  if (frost.instanceColor) frost.instanceColor.needsUpdate = true;

  // ---- fog, chips and glitter (one Points draw call each) -----------------
  const fog = createPointPool({
    capacity: 170,
    blending: THREE.NormalBlending,
    soft: true,
    renderOrder: 3,
  });
  group.add(fog.points);

  const chips = createPointPool({
    capacity: 340,
    blending: THREE.AdditiveBlending,
    soft: false,
    renderOrder: 5,
  });
  group.add(chips.points);

  const sparkles = createPointPool({
    capacity: 210,
    blending: THREE.AdditiveBlending,
    soft: false,
    renderOrder: 6,
  });
  group.add(sparkles.points);

  // ---- impact shell (one mesh per slot, created once) ---------------------
  const shellGeometry = new THREE.SphereGeometry(1, 20, 14);
  const shells = [];
  for (let s = 0; s < slots; s++) {
    const shellUniforms = {
      uColor: { value: new THREE.Color(cfg.colorFrostEdge) },
      uOpacity: { value: 0 },
    };
    const shellMaterial = new THREE.ShaderMaterial({
      uniforms: shellUniforms,
      vertexShader: SHELL_VERT,
      fragmentShader: SHELL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(shellGeometry, shellMaterial);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    group.add(mesh);
    shells.push({ mesh, material: shellMaterial, uniforms: shellUniforms });
  }

  // ---- fixed cast slots ---------------------------------------------------
  const slotState = [];
  for (let s = 0; s < slots; s++) {
    const records = new Array(crystalCount);
    for (let i = 0; i < crystalCount; i++) {
      records[i] = {
        along: 0,
        lateral: 0,
        scatter: 0,
        angle: 0,
        radial: 0,
        impact: false,
        rubble: false,
        heightJitter: 0,
        radiusJitter: 0,
        leanJitter: 0,
        yaw: 0,
        stagger: 0,
        eruptAt: 0,
        breached: false,
      };
    }
    const patches = new Array(patchesPerCast);
    for (let i = 0; i < patchesPerCast; i++) patches[i] = { along: 0, lateral: 0, radius: 0 };
    slotState.push({
      index: s,
      active: false,
      castId: 0,
      age: 0,
      front: 0,
      prevFront: 0,
      phase: "travel",
      phaseT: 0,
      ox: 0,
      oz: 0,
      dx: 0,
      dz: 1,
      range: 0,
      impactFired: false,
      fogFront: 0,
      sparkleFront: 0,
      shellT: -1,
      records,
      patches,
    });
  }

  function degenerate(matrixTarget, index) {
    dummy.position.set(0, -999, 0);
    dummy.quaternion.identity();
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    matrixTarget.setMatrixAt(index, dummy.matrix);
  }

  function hideSlot(slot) {
    const base = slot.index * perVariant;
    for (let v = 0; v < variants; v++) {
      for (let i = 0; i < perVariant; i++) {
        degenerate(meshes[v], base + i);
        births[v].array[base + i] = 0;
      }
      meshes[v].instanceMatrix.needsUpdate = true;
      births[v].needsUpdate = true;
    }
    const fbase = slot.index * patchesPerCast;
    for (let i = 0; i < patchesPerCast; i++) degenerate(frost, fbase + i);
    frost.instanceMatrix.needsUpdate = true;
    const shell = shells[slot.index];
    if (shell) {
      shell.mesh.visible = false;
      shell.uniforms.uOpacity.value = 0;
    }
    slot.shellT = -1;
  }

  function fogPuff(x, y, z, scale, alphaScale) {
    const drift = cfg.mistDrift;
    fog.spawn({
      x,
      y,
      z,
      vx: (rand() * 2 - 1) * drift,
      vy: cfg.mistRise * (0.4 + rand() * 0.8),
      vz: (rand() * 2 - 1) * drift,
      gravity: 0.25,
      drag: 0.985,
      life: cfg.mistLife * (0.7 + rand() * 0.5),
      size0: cfg.mistSize * 0.35 * scale,
      size1: cfg.mistSize * scale,
      alpha: cfg.mistAlpha * (0.7 + rand() * 0.5) * (alphaScale || 1),
      r: fogColor.r,
      g: fogColor.g,
      b: fogColor.b,
    });
  }

  function chipBurst(x, y, z, count, power) {
    const p = power || 1;
    for (let i = 0; i < count; i++) {
      const a = rand() * TAU;
      const speed = cfg.chipSpeed * (0.35 + rand() * 0.9) * p;
      chips.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * speed * (0.4 + rand() * 0.6),
        vy: cfg.chipSpeed * (0.3 + rand() * 0.8) * p,
        vz: Math.sin(a) * speed * (0.4 + rand() * 0.6),
        gravity: cfg.chipGravity,
        drag: 0.995,
        life: cfg.chipLife * (0.7 + rand() * 0.6),
        size0: cfg.chipSize * (0.7 + rand() * 0.8) * p,
        size1: cfg.chipSize * 0.3 * p,
        alpha: 1,
        r: chipColor.r,
        g: chipColor.g,
        b: chipColor.b,
      });
    }
  }

  function sparkleBurst(x, y, z, count) {
    for (let i = 0; i < count; i++) {
      const a = rand() * TAU;
      const spread = 0.35 + rand() * 0.9;
      sparkles.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * spread,
        vy: cfg.sparkleSpeed * (0.5 + rand() * 0.9),
        vz: Math.sin(a) * spread,
        gravity: -0.4,
        drag: 0.99,
        life: cfg.sparkleLife * (0.6 + rand() * 0.8),
        size0: cfg.sparkleSize * (0.6 + rand() * 0.9),
        size1: cfg.sparkleSize * 0.3,
        alpha: 0.95,
        r: sparkColor.r,
        g: sparkColor.g,
        b: sparkColor.b,
      });
    }
  }

  function impact(slot) {
    if (slot.impactFired) return;
    slot.impactFired = true;
    const x = slot.ox + slot.dx * slot.range;
    const z = slot.oz + slot.dz * slot.range;

    if (typeof ring === "function") {
      ring({ x, y: 0, z }, { radius: cfg.impactRing, color: cfg.colorFrost, life: 0.55 });
      ring({ x, y: 0, z }, { radius: cfg.impactRing * 0.55, color: cfg.colorFrost, life: 0.32 });
    }
    if (typeof burst === "function") {
      burst(
        { x, y: 0.7, z },
        { count: 32, color: cfg.colorShard, speed: 8.5, size: 0.18, life: 0.85, gravity: -9, up: 2.6 }
      );
      burst(
        { x, y: 0.35, z },
        { count: 24, color: cfg.colorFrost, speed: 3.2, size: 0.42, life: 1.2, gravity: 0.5, up: 1.0 }
      );
    }
    chipBurst(x, 0.5, z, 26, 1.4);
    fogPuff(x, 0.5, z, 2.0, 1.5);
    fogPuff(x, 0.3, z, 1.5, 1.3);
    fogPuff(x + slot.dz * 1.6, 0.25, z - slot.dx * 1.6, 1.2, 1.1);
    fogPuff(x - slot.dz * 1.6, 0.25, z + slot.dx * 1.6, 1.2, 1.1);
    sparkleBurst(x, 0.7, z, 16);

    // The frosted shell that snaps outward around the far end.
    const shell = shells[slot.index];
    if (shell) {
      shell.mesh.position.set(x, 0.9, z);
      shell.mesh.scale.setScalar(0.5);
      shell.mesh.visible = true;
      shell.uniforms.uOpacity.value = cfg.impactShellAlpha;
      slot.shellT = 0;
    }
    if (typeof shake === "function") shake(cfg.impactShake);
    if (typeof emit === "function") {
      emit("sfx", { name: "explode", position: { x, y: 0, z }, pitch: 1.2, volume: 0.6 });
    }
  }

  function resetSlotRecords(slot, range) {
    const impactCount = Math.round(crystalCount * IMPACT_CLUSTER_FRACTION);
    const impactStart = crystalCount - impactCount;
    const speed = Math.max(0.01, cfg.speed);
    for (let i = 0; i < crystalCount; i++) {
      const r = slot.records[i];
      const isImpact = i >= impactStart;
      r.impact = isImpact;
      r.breached = false;
      r.yaw = rand() * TAU;
      r.stagger = rand();
      r.heightJitter = rand() * 2 - 1;
      r.radiusJitter = rand() * 2 - 1;
      r.leanJitter = rand() * 2 - 1;
      r.scatter = rand() * 2 - 1;
      r.rubble = rand() < cfg.rubble;
      if (isImpact) {
        r.angle = rand() * TAU;
        r.radial = Math.sqrt(rand());
        r.along = 1;
      } else {
        r.along = Math.pow((i + rand()) / Math.max(1, impactStart), cfg.frontBias);
        r.lateral = rand() * 2 - 1;
      }
      r.eruptAt = (r.along * range) / speed + r.stagger * cfg.riseStagger;
    }

    const fbase = slot.index * patchesPerCast;
    for (let i = 0; i < patchesPerCast; i++) {
      const p = slot.patches[i];
      const far = i >= patchesPerCast - 3;
      p.along = far ? 0.94 + rand() * 0.06 : sat((i + 0.5 + (rand() - 0.5) * 0.7) / patchesPerCast);
      p.lateral = (rand() * 2 - 1) * 0.55;
      p.radius = halfWidthAt(p.along, cfg) * cfg.frostSpread * (0.7 + rand() * 0.6) * (far ? 1.7 : 1);
      frost.setColorAt(fbase + i, rand() < 0.6 ? frostColorA : frostColorB);
    }
    if (frost.instanceColor) frost.instanceColor.needsUpdate = true;
  }

  function spawn(payload) {
    if (!payload || payload.spellId !== cfg.spellId) return null;
    const o = payload.origin;
    const d = payload.dir;
    if (!o || !d) return null;
    const dl = Math.hypot(d.x, d.z);
    if (dl < 1e-6) return null;
    const range = Number.isFinite(payload.range) ? payload.range : 0;
    if (!(range > 0)) return null;

    let slot = null;
    for (const s of slotState) {
      if (!s.active) {
        slot = s;
        break;
      }
    }
    if (!slot) {
      // Saturated: reuse the oldest cast. Gameplay damage is unaffected.
      slot = slotState[0];
      for (const s of slotState) if (s.age > slot.age) slot = s;
      hideSlot(slot);
    }

    slot.active = true;
    slot.castId = payload.castId;
    slot.age = 0;
    slot.front = 0;
    slot.prevFront = 0;
    slot.phase = "travel";
    slot.phaseT = 0;
    slot.ox = o.x;
    slot.oz = o.z;
    slot.dx = d.x / dl;
    slot.dz = d.z / dl;
    slot.range = range;
    slot.impactFired = false;
    slot.fogFront = 0;
    slot.sparkleFront = 0;
    slot.shellT = -1;
    resetSlotRecords(slot, range);

    // The cold pulse that leaves the mage on the impact beat.
    if (typeof ring === "function") {
      ring({ x: o.x, y: 0, z: o.z }, { radius: cfg.pulseRing, color: cfg.colorFrost, life: 0.35 });
    }
    fogPuff(o.x, 0.25, o.z, 1.1, 0.9);
    fogPuff(o.x, 0.35, o.z, 0.9, 0.8);
    chipBurst(o.x, 0.3, o.z, 8, 0.7);
    sparkleBurst(o.x, 0.5, o.z, 6);
    return slot;
  }

  function lateralNorm(record) {
    const raw = record.lateral;
    const clumped = Math.sign(raw) * Math.pow(Math.abs(raw), cfg.clumping);
    return clumped + record.scatter * cfg.scatter;
  }

  function pointAt(slot, s, out) {
    out.x = slot.ox + slot.dx * s * slot.range;
    out.z = slot.oz + slot.dz * s * slot.range;
    return out;
  }

  function spikeHeight(record, s) {
    let h = lerp(cfg.heightNear, cfg.heightFar, Math.pow(sat(s), cfg.heightCurve));
    h *= 1 + (cfg.heightPeak - 1) * smoothstep(1 - cfg.peakWidth, 1, s);
    const edge = record.impact ? record.radial : sat(Math.abs(lateralNorm(record)));
    h *= lerp(1, 1 - sat(cfg.crown), Math.pow(edge, 1.4));
    h *= 1 + record.heightJitter * cfg.heightJitter;
    if (record.rubble) h *= cfg.rubbleScale;
    return Math.max(0.02, h);
  }

  function spikeRadius(record, s) {
    const grow = lerp(0.72, 1.15, Math.pow(sat(s), 0.6));
    const jitter = 1 + record.radiusJitter * cfg.radiusJitter;
    return Math.max(0.01, cfg.radius * grow * jitter * (record.rubble ? 1.25 : 1));
  }

  function emergence(slot, record) {
    const elapsed = slot.age - record.eruptAt;
    if (elapsed < 0) return -1;
    const rise = Math.max(0.02, cfg.riseTime);
    if (elapsed <= rise) return outQuint(sat(elapsed / rise));
    const after = elapsed - rise;
    return 1 + cfg.riseOvershoot * Math.sin(after * 14) * Math.exp(-after / Math.max(0.05, cfg.settle));
  }

  const tmpPoint = { x: 0, z: 0 };

  function updateCrystals(slot, retract) {
    const base = slot.index * perVariant;
    const birthFade = Math.max(0.02, cfg.birthFade);
    for (let i = 0; i < crystalCount; i++) {
      const record = slot.records[i];
      const variant = i % variants;
      const local = (i / variants) | 0;
      const idx = base + local;
      const emerge = emergence(slot, record);
      if (emerge < 0) {
        degenerate(meshes[variant], idx);
        births[variant].array[idx] = 0;
        continue;
      }

      const s = record.along;
      const height = spikeHeight(record, s);
      const radius = spikeRadius(record, s);
      const halfWidth = halfWidthAt(s, cfg);

      pointAt(slot, s, tmpPoint);
      let px = tmpPoint.x;
      let pz = tmpPoint.z;
      let outward;
      if (record.impact) {
        const reach = halfWidthAt(1, cfg) * 1.25 * record.radial;
        px += Math.cos(record.angle) * reach;
        pz += Math.sin(record.angle) * reach;
        outward = Math.sign(Math.cos(record.angle)) * record.radial;
      } else {
        outward = lateralNorm(record);
        px += slot.dz * outward * halfWidth;
        pz += -slot.dx * outward * halfWidth;
      }

      // Chips and a breath of fog where the crystal breaks the surface.
      if (!record.breached && emerge > 0.25) {
        record.breached = true;
        chipBurst(px, 0.12, pz, Math.max(1, Math.round(cfg.chipCount)), 0.8);
        if (rand() < 0.4) fogPuff(px, 0.2, pz, 0.85 + rand() * 0.55, 0.8);
      }

      // Lean away from the caster, and outward across the band.
      lean.set(slot.dx, 0, slot.dz).multiplyScalar(0.75);
      lean.x += slot.dz * outward * 0.85;
      lean.z += -slot.dx * outward * 0.85;
      if (lean.lengthSq() < 1e-6) lean.set(slot.dx, 0, slot.dz);
      lean.normalize();
      axis.crossVectors(up, lean).normalize();
      const leanAngle =
        cfg.lean * (0.35 + 0.65 * s) * (1 + record.leanJitter * cfg.leanJitter);
      tilt.setFromAxisAngle(axis, leanAngle);
      spin.setFromAxisAngle(up, record.yaw * cfg.twist);
      tilt.multiply(spin);

      let y = 0.05 + (emerge - 1) * height * 0.85;
      if (retract > 0) y -= inCubic(retract) * (height + radius + 0.4);

      dummy.position.set(px, y, pz);
      dummy.quaternion.copy(tilt);
      const settled = Math.min(1, emerge);
      dummy.scale.set(radius, height, radius).multiplyScalar(lerp(0.86, 1, settled));
      dummy.updateMatrix();
      meshes[variant].setMatrixAt(idx, dummy.matrix);
      births[variant].array[idx] = sat(1 - (slot.age - record.eruptAt) / birthFade);
    }
  }

  function updateFrost(slot, retract) {
    const fbase = slot.index * patchesPerCast;
    const sink = retract > 0 ? 1 - inCubic(retract) : 1;
    for (let i = 0; i < patchesPerCast; i++) {
      const patch = slot.patches[i];
      const laid = sat((slot.front - patch.along * slot.range) / PATCH_LAYOUT_RANGE);
      const radius = patch.radius * laid * sink;
      if (radius <= 0.01) {
        degenerate(frost, fbase + i);
        continue;
      }
      const halfWidth = halfWidthAt(patch.along, cfg);
      dummy.position.set(
        slot.ox + slot.dx * patch.along * slot.range + slot.dz * patch.lateral * halfWidth,
        0.06,
        slot.oz + slot.dz * patch.along * slot.range - slot.dx * patch.lateral * halfWidth
      );
      dummy.quaternion.identity();
      dummy.scale.set(radius, 1, radius);
      dummy.updateMatrix();
      frost.setMatrixAt(fbase + i, dummy.matrix);
    }
  }

  function updateShell(slot, step) {
    if (slot.shellT < 0) return;
    slot.shellT += step;
    const k = sat(slot.shellT / Math.max(0.05, cfg.impactShellLife));
    const shell = shells[slot.index];
    const ease = 1 - Math.pow(1 - k, 2.6);
    shell.mesh.scale.setScalar(lerp(0.5, cfg.impactShell, ease));
    shell.uniforms.uOpacity.value = cfg.impactShellAlpha * Math.pow(1 - k, 1.7);
    shell.mesh.visible = k < 1;
    if (k >= 1) slot.shellT = -1;
  }

  function updateFrontParticles(slot) {
    // Fog and glitter shed continuously along the travelling front.
    while (slot.fogFront + FOG_STEP <= slot.front) {
      slot.fogFront += FOG_STEP;
      const s = sat(slot.fogFront / slot.range);
      const halfWidth = halfWidthAt(s, cfg);
      const lat = (rand() * 2 - 1) * halfWidth * 0.9;
      const x = slot.ox + slot.dx * slot.fogFront + slot.dz * lat;
      const z = slot.oz + slot.dz * slot.fogFront - slot.dx * lat;
      fogPuff(x, 0.2, z, 0.9 + rand() * 0.6, 0.9);
      if (rand() < 0.4) {
        const lat2 = (rand() * 2 - 1) * halfWidth;
        fogPuff(
          slot.ox + slot.dx * slot.fogFront + slot.dz * lat2,
          0.3,
          slot.oz + slot.dz * slot.fogFront - slot.dx * lat2,
          0.7 + rand() * 0.4,
          0.7
        );
      }
    }
    while (slot.sparkleFront + SPARKLE_STEP <= slot.front) {
      slot.sparkleFront += SPARKLE_STEP;
      const s = sat(slot.sparkleFront / slot.range);
      const halfWidth = halfWidthAt(s, cfg);
      const lat = (rand() * 2 - 1) * halfWidth;
      const x = slot.ox + slot.dx * slot.sparkleFront + slot.dz * lat;
      const z = slot.oz + slot.dz * slot.sparkleFront - slot.dx * lat;
      sparkleBurst(x, 0.35 + rand() * 0.6, z, 1);
    }
  }

  function finishSlot(slot) {
    hideSlot(slot);
    slot.active = false;
  }

  function updateSlot(slot, step) {
    if (slot.phase === "travel") {
      slot.prevFront = slot.front;
      slot.front = advanceFront(slot.front, step, cfg, slot.range);
      updateFrontParticles(slot);
      if (slot.front >= slot.range) {
        slot.phase = "standing";
        slot.phaseT = 0;
        impact(slot);
      }
    } else {
      slot.phaseT += step;
      if (slot.phase === "standing" && slot.phaseT >= cfg.standTime) {
        slot.phase = "sinking";
        slot.phaseT = 0;
      } else if (slot.phase === "sinking" && slot.phaseT >= cfg.sinkTime) {
        finishSlot(slot);
        return;
      }
    }

    const retract = slot.phase === "sinking" ? sat(slot.phaseT / Math.max(0.05, cfg.sinkTime)) : 0;
    updateCrystals(slot, retract);
    updateFrost(slot, retract);
    updateShell(slot, step);
  }

  function update(dt) {
    let step = Number(dt);
    if (!Number.isFinite(step) || step < 0) step = 0;
    if (step > 0.25) step = 0.25;
    uniforms.uTime.value += step;

    let maxSlot = -1;
    for (let s = 0; s < slotState.length; s++) {
      const slot = slotState[s];
      if (!slot.active) continue;
      maxSlot = Math.max(maxSlot, s);
      slot.age += step;
      updateSlot(slot, step);
    }

    const crystalInstances = maxSlot >= 0 ? (maxSlot + 1) * perVariant : 0;
    for (let v = 0; v < variants; v++) {
      meshes[v].count = crystalInstances;
      meshes[v].instanceMatrix.needsUpdate = crystalInstances > 0;
      births[v].needsUpdate = crystalInstances > 0;
    }

    const frostInstances = maxSlot >= 0 ? (maxSlot + 1) * patchesPerCast : 0;
    frost.count = frostInstances;
    frost.instanceMatrix.needsUpdate = frostInstances > 0;

    fog.update(step);
    chips.update(step);
    sparkles.update(step);
  }

  function reset() {
    for (const slot of slotState) {
      slot.active = false;
      hideSlot(slot);
    }
    for (const mesh of meshes) {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    frost.count = 0;
    frost.instanceMatrix.needsUpdate = true;
    fog.clear();
    chips.clear();
    sparkles.clear();
    for (const shell of shells) {
      shell.mesh.visible = false;
      shell.uniforms.uOpacity.value = 0;
    }
    uniforms.uTime.value = 0;
  }

  return {
    group,
    spawn,
    update,
    reset,
    // Read-only diagnostics for the handoff evidence (draw-call accounting).
    get activeCasts() {
      return slotState.filter((s) => s.active).length;
    },
    get slotCount() {
      return slots;
    },
  };
}


