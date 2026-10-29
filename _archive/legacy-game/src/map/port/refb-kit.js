// ============================================================================
// refb-kit.js — VERBATIM port of reference scene B's botanical asset factories.
//
// Source (read-only):
//   C:\Users\silen\Downloads\sunlit_anime_meadow_modular_3d_botanical_studio_scene.html
//   three r128 global script, lines 401-1402.
//
// What is copied unchanged
//   - createPRNG / hash2D / valueNoise2D / fbm2D / smoothstep          (405-493)
//   - PALETTE                                                          (498-537)
//   - sharedUniforms                                                   (540-547)
//   - createGhibliBotanicalMaterial (vertex + fragment shader text)    (554-719)
//   - createColoredGeometry                                            (724-738)
//   - PartGeometryBuilder, incl. addArchingLeaf / addStemCurve /
//     addStarBellflowerHead / addBellflowerBud / addDaisyHead           (741-1031)
//   - the six asset factories                                          (1038-1402)
//
// What was adapted (r128 -> r170 only)
//   - `three` is imported as an ES module; no globals, no `window`.
//   - Colour: r128 stored `new THREE.Color('#rrggbb')` as the raw sRGB
//     numbers. r170's colour management would linearise them, and this
//     ShaderMaterial writes gl_FragColor directly (no <colorspace_fragment>),
//     so the raw numbers are what reaches the framebuffer in B. To keep the
//     two-colour ramp bit-identical to B, palette colours are constructed from
//     raw floats in the working colour space (`rawColor(0xrrggbb)` below)
//     instead of from hex strings. Nothing else about the colours changed.
//   - IcosahedronGeometry(0.68, 1) is already non-indexed in r170; the source's
//     `.toNonIndexed()` is kept verbatim (it is a no-op that warns once).
//
// What is new (the only new geometry code)
//   - createTreeCanopyGeometry / createTreeTrunkGeometry (bottom of file).
//     The canopy is built ONLY from PartGeometryBuilder.addArchingLeaf, so the
//     tree reads in the same leaf language as B's grass/leaves.
//
// This module imports only `three` and nothing from the game.
// ============================================================================

import * as THREE from "three";

/* ------------------------------------------------------------------------- */
/* r128-compatible colour construction (see adaptation note above)            */
/* ------------------------------------------------------------------------- */

// Store the authored sRGB hex numbers as-is (r128 behaviour). `new THREE.Color(r,g,b)`
// writes the components straight into the working colour space, so no sRGB->linear
// conversion happens and the shader receives exactly B's numbers.
function rawColor(hex) {
  return new THREE.Color(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255
  );
}

/* ------------------------------------------------------------------------- */
/* 1. DETERMINISTIC PRNG & POISSON ECOLOGICAL NOISE UTILITIES  (verbatim)     */
/* ------------------------------------------------------------------------- */

export function createPRNG(seed) {
  let s = (seed >>> 0) || 1337;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2D(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

export function valueNoise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uz = fz * fz * (3.0 - 2.0 * fz);
  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm2D(x, z) {
  let v = 0.0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < 3; i++) {
    v += amp * valueNoise2D(x * freq, z * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return v;
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------------- */
/* 2. PALETTE & SHARED UNIFORMS  (verbatim, values unchanged)                 */
/* ------------------------------------------------------------------------- */

export const REFB_PALETTE = {
  // Grass & Ground (extracted from Image 3)
  grassSunBright: rawColor(0xc1dc79),
  grassSunMid: rawColor(0xb5d372),
  grassRootSun: rawColor(0x8cb566),
  grassShadeMid: rawColor(0x598975),
  grassShadeDeep: rawColor(0x49776e),

  // Broad Hero Clump Leaves (richer dark sage cushion so purple flowers pop)
  leafSunTip: rawColor(0xa7c878),
  leafMid: rawColor(0x5e8d6f),
  leafDeepBase: rawColor(0x466e5d),
  leafShade: rawColor(0x3b6058),

  // Hero Purple Star-Bellflowers (Campanula)
  petalSunTip: rawColor(0xe4bdf6),
  petalSunMid: rawColor(0xc39ef0),
  petalSunBase: rawColor(0x8e75cd),
  petalShadeTip: rawColor(0x8d89c7),
  petalShadeMid: rawColor(0x736eb0),
  petalShadeDeep: rawColor(0x5d5896),
  petalBud: rawColor(0x9c7fe0),

  // Secondary Magenta-Violet Sprigs
  violetSun: rawColor(0xd299f2),
  violetMid: rawColor(0xa873db),
  violetShade: rawColor(0x6f58a8),

  // White Chamomile / Daisy Flowers
  daisyWhiteSun: rawColor(0xfafaf6),
  daisyWhiteShade: rawColor(0xc7d4cc),
  stamenGold: rawColor(0xeeb942),
  stamenOrange: rawColor(0xd98a2b),

  // Faceted Ghibli Meadow Rocks
  rockTopSun: rawColor(0xe9dad3),
  rockMidSlate: rawColor(0x939bb0),
  rockShadowBlue: rawColor(0x5b7789),
  rockMossBase: rawColor(0x5a876f),
};

// Shared reactive uniforms updated every frame (verbatim from B).
// `uDepthFade` is B's "-z aerial depth fade" strength, lifted out of the
// fragment shader so a larger map can switch the 26 m diorama trick off
// (`REFB_SHARED_UNIFORMS.uDepthFade.value = 0`). Default 0.14 = B exactly.
export const REFB_SHARED_UNIFORMS = {
  uTime: { value: 0 },
  uWindStrength: { value: 0.55 },
  uCanopyIntensity: { value: 0.88 },
  uNormalSoftness: { value: 0.82 },
  uSubsurfaceWrap: { value: 0.35 },
  uSunDir: { value: new THREE.Vector3(0.58, 0.74, 0.34).normalize() },
  uDepthFade: { value: 0.14 },
};

// B's palette has no tree slots. The tree builders bake the canopy / trunk ramp
// from the project palette's own hexes (game/src/map/palette.js MEADOW.*); they
// are duplicated here because this kit imports only `three`.
export const REFB_TREE_PALETTE = {
  canopyLight: rawColor(0xb8dd6c),
  canopyMid: rawColor(0x77b74f),
  canopyDark: rawColor(0x3f7a4c),
  canopyRim: rawColor(0xeaf7ab),
  coniferLight: rawColor(0x5fa368),
  coniferDark: rawColor(0x336b4b),
  trunk: rawColor(0x8a6244),
  trunkDark: rawColor(0x5f4331),
};

/* ------------------------------------------------------------------------- */
/* 3. THE MATERIAL — B's two-colour ramp ShaderMaterial  (verbatim)           */
/* ------------------------------------------------------------------------- */

// Custom Ghibli Botanical ShaderMaterial:
// - Uses vertex colors (Sunlit RGB stored in `color`, Shadow RGB stored in `aShadowColor`)
// - Upward-bent spherical normal blending (`uNormalSoftness`) so thin blades/petals NEVER have harsh black backfaces
// - Evaluates world-space dappled canopy gobo (`uCanopyIntensity`)
// - Clamped soft wrap-lighting (`uSubsurfaceWrap`) with ZERO blown-out bloom
//
// `options.fog` (default false) opts the material into three's scene fog. It is
// OFF by default so the reference behaviour is bit-identical; the real map turns
// it on with `createGhibliBotanicalMaterial({ fog: true, ... })` + `scene.fog`.
// three fills `fogColor` / `fogNear` / `fogFar` (or `fogDensity` for FogExp2)
// automatically for any material whose `fog` flag is true.
export function createGhibliBotanicalMaterial(options = {}) {
  const isFoliage = options.isFoliage !== false;
  const isPetal = !!options.isPetal;
  const isRock = !!options.isRock;
  const isTerrain = !!options.isTerrain;
  const swayScale = options.swayScale !== undefined ? options.swayScale : 1.0;
  const useFog = options.fog === true;
  // Backface normal flipping makes a blade change tone when the camera orbits
  // to its other side. For grass/petals that reads as the colour shifting with
  // the view, so it can be disabled: both faces shade from the same normal.
  const flipBackfaces = options.flipBackfaces !== false;

  const uniforms = {
    uTime: REFB_SHARED_UNIFORMS.uTime,
    uWindStrength: REFB_SHARED_UNIFORMS.uWindStrength,
    uCanopyIntensity: REFB_SHARED_UNIFORMS.uCanopyIntensity,
    uNormalSoftness: REFB_SHARED_UNIFORMS.uNormalSoftness,
    uSubsurfaceWrap: REFB_SHARED_UNIFORMS.uSubsurfaceWrap,
    uSunDir: REFB_SHARED_UNIFORMS.uSunDir,
    uDepthFade: REFB_SHARED_UNIFORMS.uDepthFade,
    uSwayScale: { value: swayScale },
    uIsPetal: { value: isPetal ? 1.0 : 0.0 },
    uIsRock: { value: isRock ? 1.0 : 0.0 },
    uIsTerrain: { value: isTerrain ? 1.0 : 0.0 },
    // Style levers. 0 = the shipped smooth two-tone ramp.
    //   uCel  quantise the lit factor into three flat tones
    //   uRim  fresnel rim light on the sun side
    uCel: { value: options.cel ?? 0 },
    uRim: { value: options.rim ?? 0 },
  };
  if (useFog) {
    // Values are overwritten every frame by three's refreshFogUniforms().
    uniforms.fogColor = { value: new THREE.Color(0xffffff) };
    uniforms.fogNear = { value: 1 };
    uniforms.fogFar = { value: 1000 };
    uniforms.fogDensity = { value: 0 };
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexColors: true,
    side: isTerrain || isRock ? THREE.FrontSide : THREE.DoubleSide,
    vertexShader: `
      attribute float aWindWeight;
      attribute vec3 aShadowColor;
      varying vec3 vColorSun;
      varying vec3 vColorShadow;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vWindWeight;
      #ifdef USE_FOG
        varying float vFogDepth;
      #endif

      uniform float uTime;
      uniform float uWindStrength;
      uniform float uSwayScale;

      void main() {
        vColorSun = color;
        vColorShadow = aShadowColor;
        vWindWeight = aWindWeight;

        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        #ifdef USE_INSTANCING
          worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #endif

        // Gentle layered meadow breeze wave
        float w = aWindWeight * uWindStrength * uSwayScale;
        if (w > 0.001) {
          float wave1 = sin(uTime * 2.1 + worldPosition.x * 0.75 + worldPosition.z * 0.55);
          float wave2 = cos(uTime * 3.4 - worldPosition.x * 0.45 + worldPosition.z * 0.95) * 0.35;
          float gust = (wave1 + wave2) * w;
          worldPosition.x += gust * 0.14;
          worldPosition.z += gust * 0.08;
          worldPosition.y -= abs(gust) * 0.03;
        }

        vWorldPos = worldPosition.xyz;
        #ifdef USE_FOG
          // Fog depth from the *displaced* world position (wind included).
          vFogDepth = -(viewMatrix * worldPosition).z;
        #endif

        mat3 nMat = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          nMat = mat3(modelMatrix * instanceMatrix);
        #endif
        vWorldNormal = normalize(nMat * normal);

        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColorSun;
      varying vec3 vColorShadow;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vWindWeight;
      #ifdef USE_FOG
        varying float vFogDepth;
        uniform vec3 fogColor;
        #ifdef FOG_EXP2
          uniform float fogDensity;
        #else
          uniform float fogNear;
          uniform float fogFar;
        #endif
      #endif

      uniform vec3 uSunDir;
      uniform float uCanopyIntensity;
      uniform float uNormalSoftness;
      uniform float uSubsurfaceWrap;
      uniform float uIsPetal;
      uniform float uIsRock;
      uniform float uIsTerrain;
      uniform float uDepthFade;
      uniform float uCel;
      uniform float uRim;

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

      float computeCanopyShadow(vec2 xz) {
        float n = fbm(xz * 0.85 + vec2(3.1, 1.7));
        float fine = valueNoise(xz * 2.3 + vec2(-1.2, 4.5)) * 0.28;

        // Upper-left canopy shadow zone
        vec2 d1 = (xz + vec2(5.2, 4.8)) / vec2(5.8, 5.2);
        float c1 = clamp(1.28 - length(d1) + (n - 0.5) * 0.55 + fine, 0.0, 1.0);

        // Center-right dappled shadow band
        vec2 p2 = xz - vec2(1.4, 0.9);
        vec2 r2 = vec2(p2.x * 0.82 + p2.y * 0.57, -p2.x * 0.57 + p2.y * 0.82);
        float c2 = clamp(1.08 - length(r2 / vec2(2.9, 1.65)) + (n - 0.45) * 0.65 + fine, 0.0, 1.0);

        // Soft individual leaf-cluster dappling across the meadow
        float dapple = smoothstep(0.32, 0.72, max(c1, c2 * 0.92));
        return dapple * uCanopyIntensity;
      }

      void main() {
        // Flip normal on backfaces for double-sided petals/leaves, then soften toward Up vector
        vec3 rawN = gl_FrontFacing ? normalize(vWorldNormal) : -normalize(vWorldNormal);
        vec3 upN = normalize(vec3(rawN.x * 0.35, 1.0, rawN.z * 0.35));

        // Rocks keep crisp planar bevel normals; foliage/petals blend toward soft upward hemisphere normal
        float softFactor = (uIsRock > 0.5) ? 0.08 : ((uIsTerrain > 0.5) ? 0.45 : uNormalSoftness);
        vec3 N = normalize(mix(rawN, upN, softFactor));

        float ndl = dot(N, uSunDir);
        float canopyShadow = computeCanopyShadow(vWorldPos.xz);

        // Two-tone anime shading ramp
        float wrapLit = smoothstep(-uSubsurfaceWrap, 0.55, ndl);
        if (uIsRock > 0.5) {
          // Faceted Ghibli rock: quantized 3-tone planar shading
          wrapLit = smoothstep(-0.15, 0.65, dot(rawN, uSunDir));
        }

        // Combine directional sun lighting with dappled canopy shadow cookie
        float shade = wrapLit;
        // Cel: three flat tones with a narrow (0.1) transition. The transition
        // must not be a hard step -- that aliases into a staircase and reads as
        // a posterise filter instead of drawn light.
        float celShade = 0.5 * smoothstep(0.26, 0.36, wrapLit) + 0.5 * smoothstep(0.62, 0.72, wrapLit);
        shade = mix(shade, celShade, uCel);

        float lightFactor = shade * (1.0 - canopyShadow * 0.86);

        // Base interpolation between curated cool shadow palette and warm sunlit palette
        vec3 col = mix(vColorShadow, vColorSun, lightFactor);

        // A third, deeper tone at the bottom of the ramp. Two tones read as
        // "posterised lighting"; three read as a painting with a shadow colour.
        vec3 deepShadow = vColorShadow * vec3(0.80, 0.85, 0.96);
        col = mix(deepShadow, col, mix(1.0, smoothstep(0.02, 0.14, shade), uCel));

        // Subtle clamped warm rim/subsurface lift on sunlit petals & leaf tips (NEVER blows out to white!)
        if (uIsPetal > 0.5) {
          float petalRim = smoothstep(0.2, 0.95, vWindWeight) * (1.0 - canopyShadow * 0.75) * uSubsurfaceWrap;
          col = mix(col, vColorSun * 1.06, petalRim * 0.45);
        }

        // Fresnel rim light (style lever): a warm band where the surface turns
        // away from the camera, gated to the lit side so it never draws a halo
        // on the shadow side.
        vec3 V = normalize(cameraPosition - vWorldPos);
        float fres = 1.0 - clamp(abs(dot(N, V)), 0.0, 1.0);
        col = mix(col, vec3(1.0, 0.97, 0.90),
          smoothstep(0.55, 0.90, fres) * smoothstep(0.15, 0.60, ndl) * uRim * 0.5);

        // Gentle aerial depth warmth toward upper background (-z)
        float depthFade = smoothstep(3.0, -11.0, vWorldPos.z) * uDepthFade;
        col = mix(col, vec3(0.76, 0.87, 0.56), depthFade * (1.0 - canopyShadow * 0.5));

        // Authored display-referred colour -> linear. The single tone-map
        // (renderer, or the composer's grade) is then the only conversion.
        gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(2.2)), 1.0);

        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
        #endif
      }
    `,
  });

  if (!flipBackfaces) {
    material.fragmentShader = material.fragmentShader.replace(
      "vec3 rawN = gl_FrontFacing ? normalize(vWorldNormal) : -normalize(vWorldNormal);",
      "vec3 rawN = normalize(vWorldNormal);"
    );
  }

  if (useFog) material.fog = true;
  return material;
}

/* ------------------------------------------------------------------------- */
/* 4. GEOMETRY HELPER: MERGE BUFFERS WITH SUN + SHADOW VERTEX COLORS & WIND    */
/*    (verbatim)                                                              */
/* ------------------------------------------------------------------------- */

export function createColoredGeometry(
  positions,
  indices,
  sunColors,
  shadowColors,
  windWeights,
  computeFlatNormals = false
) {
  let geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(sunColors, 3));
  geom.setAttribute("aShadowColor", new THREE.Float32BufferAttribute(shadowColors, 3));
  geom.setAttribute("aWindWeight", new THREE.Float32BufferAttribute(windWeights, 1));
  if (indices && indices.length > 0) {
    geom.setIndex(indices);
  }
  if (computeFlatNormals) {
    geom = geom.toNonIndexed();
  }
  geom.computeVertexNormals();
  return geom;
}

/* ------------------------------------------------------------------------- */
/* 5. PartGeometryBuilder  (verbatim)                                         */
/* ------------------------------------------------------------------------- */

// Builder accumulator for clean multi-part procedural meshes
export class PartGeometryBuilder {
  constructor() {
    this.positions = [];
    this.sunColors = [];
    this.shadowColors = [];
    this.windWeights = [];
    this.indices = [];
    this.vertexCount = 0;
  }

  addVertex(x, y, z, sunCol, shdCol, wind = 0) {
    this.positions.push(x, y, z);
    this.sunColors.push(sunCol.r, sunCol.g, sunCol.b);
    this.shadowColors.push(shdCol.r, shdCol.g, shdCol.b);
    this.windWeights.push(wind);
    return this.vertexCount++;
  }

  addTri(a, b, c) {
    this.indices.push(a, b, c);
  }

  addQuad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  // Sculpt an arching, V-folded botanical blade or lance leaf
  addArchingLeaf(opts) {
    const {
      baseX = 0,
      baseY = 0,
      baseZ = 0,
      yaw = 0,
      pitch = 0.45,
      length = 0.65,
      width = 0.11,
      arch = 0.24,
      fold = 0.018,
      segments = 4,
      colBaseSun,
      colTipSun,
      colBaseShd,
      colTipShd,
      windScale = 0.6,
    } = opts;

    const cosY = Math.cos(yaw),
      sinY = Math.sin(yaw);
    const sideX = -sinY,
      sideZ = cosY;

    const rings = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      // Leaf width profile: narrow base -> wide belly at t=0.38 -> pointed tip
      const profile = Math.sin(Math.pow(t, 0.72) * Math.PI);
      const halfW = width * 0.5 * profile;

      const reach = length * t * Math.cos(pitch + t * arch * 0.6);
      const lift = length * (t * Math.sin(pitch) - t * t * arch);

      const cx = baseX + cosY * reach;
      const cy = baseY + Math.max(0.005, lift);
      const cz = baseZ + sinY * reach;

      const sunC = colBaseSun.clone().lerp(colTipSun, Math.pow(t, 0.85));
      const shdC = colBaseShd.clone().lerp(colTipShd, Math.pow(t, 0.85));
      const w = t * t * windScale;

      if (i === segments) {
        const vTip = this.addVertex(cx, cy, cz, sunC, shdC, w);
        rings.push([vTip]);
      } else {
        const vL = this.addVertex(
          cx + sideX * halfW,
          cy + fold * profile,
          cz + sideZ * halfW,
          sunC,
          shdC,
          w
        );
        const vM = this.addVertex(
          cx,
          cy - fold * 0.5 * profile,
          cz,
          sunC.clone().multiplyScalar(0.94),
          shdC.clone().multiplyScalar(0.94),
          w
        );
        const vR = this.addVertex(
          cx - sideX * halfW,
          cy + fold * profile,
          cz - sideZ * halfW,
          sunC,
          shdC,
          w
        );
        rings.push([vL, vM, vR]);
      }
    }

    for (let i = 0; i < segments - 1; i++) {
      const r0 = rings[i];
      const r1 = rings[i + 1];
      this.addQuad(r0[0], r0[1], r1[1], r1[0]);
      this.addQuad(r0[1], r0[2], r1[2], r1[1]);
    }
    const rLast = rings[segments - 1];
    const vTip = rings[segments][0];
    this.addTri(rLast[0], rLast[1], vTip);
    this.addTri(rLast[1], rLast[2], vTip);
  }

  // Sculpt a tapered 3-sided stem along a quadratic Bezier curve
  addStemCurve(p0, p1, p2, radiusBase, radiusTip, segments, colSun, colShd, windMax = 0.7) {
    const rings = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const omt = 1 - t;
      const x = omt * omt * p0.x + 2 * omt * t * p1.x + t * t * p2.x;
      const y = omt * omt * p0.y + 2 * omt * t * p1.y + t * t * p2.y;
      const z = omt * omt * p0.z + 2 * omt * t * p1.z + t * t * p2.z;

      const r = radiusBase * (1 - t) + radiusTip * t;
      const w = t * t * windMax;
      const ring = [];
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2;
        ring.push(this.addVertex(x + Math.cos(ang) * r, y, z + Math.sin(ang) * r, colSun, colShd, w));
      }
      rings.push(ring);
    }
    for (let i = 0; i < segments; i++) {
      for (let k = 0; k < 3; k++) {
        const nk = (k + 1) % 3;
        this.addQuad(rings[i][k], rings[i][nk], rings[i + 1][nk], rings[i + 1][k]);
      }
    }
  }

  // Sculpt the signature 5-Pointed Star-Bellflower (Campanula) head from Image 3
  addStarBellflowerHead(centerPos, aimDir, scale, tintShift, windWeight) {
    // Construct orthonormal basis around aimDir
    const up = aimDir.clone().normalize();
    const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, ref).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up).normalize();

    const toWorld = (lx, ly, lz) => {
      return new THREE.Vector3(
        centerPos.x + right.x * lx + up.x * ly + fwd.x * lz,
        centerPos.y + right.y * lx + up.y * ly + fwd.y * lz,
        centerPos.z + right.z * lx + up.z * ly + fwd.z * lz
      );
    };

    // Slight natural tint variation per blossom so clumps feel hand-painted
    const cThroatSun = REFB_PALETTE.petalSunBase.clone().offsetHSL(tintShift * 0.03, 0, tintShift * 0.03);
    const cMidSun = REFB_PALETTE.petalSunMid.clone().offsetHSL(tintShift * 0.03, 0, tintShift * 0.04);
    const cTipSun = REFB_PALETTE.petalSunTip.clone().offsetHSL(tintShift * 0.02, 0, tintShift * 0.03);

    const cThroatShd = REFB_PALETTE.petalShadeDeep.clone().offsetHSL(tintShift * 0.02, 0, 0);
    const cMidShd = REFB_PALETTE.petalShadeMid.clone().offsetHSL(tintShift * 0.02, 0, 0);
    const cTipShd = REFB_PALETTE.petalShadeTip.clone().offsetHSL(tintShift * 0.02, 0, 0);

    // 1. Small green calyx base cup
    const vBase = this.addVertex(
      centerPos.x,
      centerPos.y,
      centerPos.z,
      REFB_PALETTE.leafDeepBase,
      REFB_PALETTE.leafShade,
      windWeight * 0.85
    );

    // 2. Five star-bell petals (72° apart) with fused cup throat + wide ovate mid + pointed star tip
    const numPetals = 5;
    const cupR = 0.042 * scale;
    const cupH = 0.048 * scale;
    const midR = 0.125 * scale;
    const midH = 0.095 * scale;
    const tipR = 0.215 * scale;
    const tipH = 0.115 * scale;

    for (let p = 0; p < numPetals; p++) {
      const aCenter = (p / numPetals) * Math.PI * 2;
      const aLeft = aCenter - (Math.PI / numPetals) * 0.92;
      const aRight = aCenter + (Math.PI / numPetals) * 0.92;

      // Cup throat vertices
      const pCupL = toWorld(Math.cos(aLeft) * cupR, cupH, Math.sin(aLeft) * cupR);
      const pCupM = toWorld(Math.cos(aCenter) * (cupR * 0.92), cupH * 0.9, Math.sin(aCenter) * (cupR * 0.92));
      const pCupR = toWorld(Math.cos(aRight) * cupR, cupH, Math.sin(aRight) * cupR);

      const vCupL = this.addVertex(pCupL.x, pCupL.y, pCupL.z, cThroatSun, cThroatShd, windWeight * 0.9);
      const vCupM = this.addVertex(
        pCupM.x,
        pCupM.y,
        pCupM.z,
        cThroatSun.clone().multiplyScalar(0.9),
        cThroatShd.clone().multiplyScalar(0.9),
        windWeight * 0.9
      );
      const vCupR = this.addVertex(pCupR.x, pCupR.y, pCupR.z, cThroatSun, cThroatShd, windWeight * 0.9);

      this.addTri(vBase, vCupM, vCupL);
      this.addTri(vBase, vCupR, vCupM);

      // Wide flaring mid-petal shoulders + depressed central vein crease
      const aMidL = aCenter - (Math.PI / numPetals) * 0.78;
      const aMidR = aCenter + (Math.PI / numPetals) * 0.78;
      const pMidL = toWorld(Math.cos(aMidL) * midR, midH + 0.012 * scale, Math.sin(aMidL) * midR);
      const pMidM = toWorld(Math.cos(aCenter) * (midR * 0.95), midH - 0.008 * scale, Math.sin(aCenter) * (midR * 0.95));
      const pMidR = toWorld(Math.cos(aMidR) * midR, midH + 0.012 * scale, Math.sin(aMidR) * midR);

      const vMidL = this.addVertex(pMidL.x, pMidL.y, pMidL.z, cMidSun, cMidShd, windWeight * 0.96);
      const vMidM = this.addVertex(
        pMidM.x,
        pMidM.y,
        pMidM.z,
        cThroatSun.clone().lerp(cMidSun, 0.55),
        cThroatShd.clone().lerp(cMidShd, 0.55),
        windWeight * 0.96
      );
      const vMidR = this.addVertex(pMidR.x, pMidR.y, pMidR.z, cMidSun, cMidShd, windWeight * 0.96);

      this.addQuad(vCupL, vCupM, vMidM, vMidL);
      this.addQuad(vCupM, vCupR, vMidR, vMidM);

      // Pointed star tip
      const pTip = toWorld(Math.cos(aCenter) * tipR, tipH, Math.sin(aCenter) * tipR);
      const vTip = this.addVertex(pTip.x, pTip.y, pTip.z, cTipSun, cTipShd, windWeight);

      this.addTri(vMidL, vMidM, vTip);
      this.addTri(vMidM, vMidR, vTip);
    }

    // 3. Golden-yellow stamen cluster in the center of the bell cup
    const pStamenBase = toWorld(0, cupH * 0.65, 0);
    const pStamenTip = toWorld(0, midH * 0.92, 0);
    const sRad = 0.026 * scale;
    const vStTop = this.addVertex(
      pStamenTip.x,
      pStamenTip.y,
      pStamenTip.z,
      REFB_PALETTE.stamenGold,
      REFB_PALETTE.stamenOrange,
      windWeight * 0.9
    );
    const stRing = [];
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2;
      const sp = toWorld(Math.cos(ang) * sRad, cupH * 0.85, Math.sin(ang) * sRad);
      stRing.push(
        this.addVertex(sp.x, sp.y, sp.z, REFB_PALETTE.stamenGold, REFB_PALETTE.stamenOrange, windWeight * 0.9)
      );
    }
    for (let k = 0; k < 4; k++) {
      this.addTri(stRing[k], stRing[(k + 1) % 4], vStTop);
      this.addTri(vBase, stRing[(k + 1) % 4], stRing[k]);
    }
  }

  // Sculpt an unopened plump star-bud at the crown of a bellflower stem
  addBellflowerBud(centerPos, aimDir, scale, windWeight) {
    const up = aimDir.clone().normalize();
    const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, ref).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up).normalize();

    const toWorld = (lx, ly, lz) =>
      new THREE.Vector3(
        centerPos.x + right.x * lx + up.x * ly + fwd.x * lz,
        centerPos.y + right.y * lx + up.y * ly + fwd.y * lz,
        centerPos.z + right.z * lx + up.z * ly + fwd.z * lz
      );

    const vBot = this.addVertex(
      centerPos.x,
      centerPos.y,
      centerPos.z,
      REFB_PALETTE.leafMid,
      REFB_PALETTE.leafShade,
      windWeight * 0.9
    );
    const pTop = toWorld(0, 0.11 * scale, 0);
    const vTop = this.addVertex(pTop.x, pTop.y, pTop.z, REFB_PALETTE.petalSunTip, REFB_PALETTE.petalShadeTip, windWeight);

    const ring = [];
    const r = 0.042 * scale;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const pm = toWorld(Math.cos(a) * r, 0.055 * scale, Math.sin(a) * r);
      ring.push(
        this.addVertex(pm.x, pm.y, pm.z, REFB_PALETTE.petalBud, REFB_PALETTE.petalShadeMid, windWeight * 0.95)
      );
    }
    for (let k = 0; k < 5; k++) {
      const nk = (k + 1) % 5;
      this.addTri(vBot, ring[nk], ring[k]);
      this.addTri(ring[k], ring[nk], vTop);
    }
  }

  // Sculpt a crisp 6- or 7-petal Chamomile/Daisy flower head with raised golden button center
  addDaisyHead(centerPos, aimDir, scale, numPetals, colPetalSun, colPetalShd, windWeight) {
    const up = aimDir.clone().normalize();
    const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, ref).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up).normalize();

    const toWorld = (lx, ly, lz) =>
      new THREE.Vector3(
        centerPos.x + right.x * lx + up.x * ly + fwd.x * lz,
        centerPos.y + right.y * lx + up.y * ly + fwd.y * lz,
        centerPos.z + right.z * lx + up.z * ly + fwd.z * lz
      );

    // Raised golden button center
    const btnR = 0.032 * scale;
    const pTop = toWorld(0, 0.022 * scale, 0);
    const vCenterTop = this.addVertex(
      pTop.x,
      pTop.y,
      pTop.z,
      REFB_PALETTE.stamenGold,
      REFB_PALETTE.stamenOrange,
      windWeight
    );
    const btnRing = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const pb = toWorld(Math.cos(a) * btnR, 0.005 * scale, Math.sin(a) * btnR);
      btnRing.push(
        this.addVertex(pb.x, pb.y, pb.z, REFB_PALETTE.stamenGold, REFB_PALETTE.stamenOrange, windWeight)
      );
    }
    for (let k = 0; k < 6; k++) {
      this.addTri(btnRing[k], btnRing[(k + 1) % 6], vCenterTop);
    }

    // Crisp separated petals around the golden button
    const innerR = 0.028 * scale;
    const midR = 0.088 * scale;
    const outerR = 0.128 * scale;
    for (let p = 0; p < numPetals; p++) {
      const a = (p / numPetals) * Math.PI * 2;
      const da = (Math.PI / numPetals) * 0.56;

      const pBase = toWorld(Math.cos(a) * innerR, 0.004 * scale, Math.sin(a) * innerR);
      const pMidL = toWorld(Math.cos(a - da) * midR, 0.012 * scale, Math.sin(a - da) * midR);
      const pMidR = toWorld(Math.cos(a + da) * midR, 0.012 * scale, Math.sin(a + da) * midR);
      const pTip = toWorld(Math.cos(a) * outerR, 0.006 * scale, Math.sin(a) * outerR);

      const vB = this.addVertex(pBase.x, pBase.y, pBase.z, colPetalSun, colPetalShd, windWeight);
      const vML = this.addVertex(pMidL.x, pMidL.y, pMidL.z, colPetalSun, colPetalShd, windWeight);
      const vMR = this.addVertex(pMidR.x, pMidR.y, pMidR.z, colPetalSun, colPetalShd, windWeight);
      const vT = this.addVertex(pTip.x, pTip.y, pTip.z, colPetalSun, colPetalShd, windWeight);

      this.addQuad(vB, vML, vT, vMR);
    }
  }

  toGeometry(flatNormals = false) {
    return createColoredGeometry(
      this.positions,
      this.indices,
      this.sunColors,
      this.shadowColors,
      this.windWeights,
      flatNormals
    );
  }
}

/* ------------------------------------------------------------------------- */
/* 6. THE SIX MODULAR GAME-READY ASSET FACTORIES  (verbatim)                  */
/* ------------------------------------------------------------------------- */

// ASSET 1: Hero Purple Bellflower Clump (`Campanula` bush with broad dark-sage lance leaves + star-bells + buds)
export function createHeroBellflowerClumpGeometry(variant = 0) {
  const rand = createPRNG(101 + variant * 73);
  const builder = new PartGeometryBuilder();

  // 1. Lush basal rosette of broad dark-sage lance leaves (14-16 leaves)
  const numLeaves = 15 + (variant % 2) * 2;
  for (let i = 0; i < numLeaves; i++) {
    const tier = i < 8 ? 0 : 1; // outer lower leaves vs inner upright leaves
    const yaw = (i / numLeaves) * Math.PI * 2 + (rand() - 0.5) * 0.28;
    const pitch = tier === 0 ? 0.32 + rand() * 0.22 : 0.68 + rand() * 0.28;
    const len = tier === 0 ? 0.68 + rand() * 0.22 : 0.58 + rand() * 0.18;
    const wid = 0.13 + rand() * 0.04;
    const rOff = 0.06 + rand() * 0.12;

    builder.addArchingLeaf({
      baseX: Math.cos(yaw) * rOff,
      baseY: 0.01,
      baseZ: Math.sin(yaw) * rOff,
      yaw,
      pitch,
      length: len,
      width: wid,
      arch: 0.28 + rand() * 0.12,
      fold: 0.022,
      segments: 4,
      colBaseSun: REFB_PALETTE.leafDeepBase,
      colTipSun: REFB_PALETTE.leafMid.clone().lerp(REFB_PALETTE.leafSunTip, 0.55),
      colBaseShd: REFB_PALETTE.leafShade,
      colTipShd: REFB_PALETTE.leafDeepBase,
      windScale: 0.45,
    });
  }

  // 2. Graceful curving stems with 5-pointed star-bell blossoms & unopened crown buds
  const numStems = 6 + (variant % 2);
  for (let s = 0; s < numStems; s++) {
    const angle = (s / numStems) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const radial = s === 0 ? 0.05 : 0.16 + rand() * 0.22;
    const stemH = s === 0 ? 1.05 : 0.78 + rand() * 0.32;

    const p0 = new THREE.Vector3(Math.cos(angle) * radial * 0.35, 0.02, Math.sin(angle) * radial * 0.35);
    const p1 = new THREE.Vector3(Math.cos(angle) * radial * 0.85, stemH * 0.55, Math.sin(angle) * radial * 0.85);
    const p2 = new THREE.Vector3(Math.cos(angle) * (radial * 1.35), stemH, Math.sin(angle) * (radial * 1.35));

    builder.addStemCurve(p0, p1, p2, 0.018, 0.008, 4, REFB_PALETTE.leafMid, REFB_PALETTE.leafShade, 0.85);

    // Add 2 stem cauline leaves halfway up
    for (let cl = 0; cl < 2; cl++) {
      const lt = 0.32 + cl * 0.22;
      const omt = 1 - lt;
      const lx = omt * omt * p0.x + 2 * omt * lt * p1.x + lt * lt * p2.x;
      const ly = omt * omt * p0.y + 2 * omt * lt * p1.y + lt * lt * p2.y;
      const lz = omt * omt * p0.z + 2 * omt * lt * p1.z + lt * lt * p2.z;
      builder.addArchingLeaf({
        baseX: lx,
        baseY: ly,
        baseZ: lz,
        yaw: angle + (cl === 0 ? 0.8 : -0.8),
        pitch: 0.45,
        length: 0.32,
        width: 0.075,
        arch: 0.2,
        fold: 0.012,
        segments: 3,
        colBaseSun: REFB_PALETTE.leafDeepBase,
        colTipSun: REFB_PALETTE.leafSunTip,
        colBaseShd: REFB_PALETTE.leafShade,
        colTipShd: REFB_PALETTE.leafMid,
        windScale: 0.65,
      });
    }

    // Main hero blossom at the top of the stalk, angled slightly outward & toward viewer (+Z)
    const aimMain = new THREE.Vector3(
      Math.cos(angle) * 0.48 + (rand() - 0.5) * 0.2,
      0.72 + rand() * 0.25,
      Math.sin(angle) * 0.48 + 0.38
    ).normalize();
    builder.addStarBellflowerHead(p2, aimMain, 0.92 + rand() * 0.22, rand() - 0.5, 0.95);

    // Secondary lateral pedicel blossom slightly lower on the stalk
    const tLat = 0.74;
    const omtL = 1 - tLat;
    const latBase = new THREE.Vector3(
      omtL * omtL * p0.x + 2 * omtL * tLat * p1.x + tLat * tLat * p2.x,
      omtL * omtL * p0.y + 2 * omtL * tLat * p1.y + tLat * tLat * p2.y,
      omtL * omtL * p0.z + 2 * omtL * tLat * p1.z + tLat * tLat * p2.z
    );
    const latAng = angle + (s % 2 === 0 ? 0.65 : -0.65);
    const latTip = latBase
      .clone()
      .add(new THREE.Vector3(Math.cos(latAng) * 0.16, 0.14, Math.sin(latAng) * 0.16));
    const latMid = latBase.clone().lerp(latTip, 0.5).add(new THREE.Vector3(0, 0.04, 0));
    builder.addStemCurve(latBase, latMid, latTip, 0.01, 0.006, 2, REFB_PALETTE.leafMid, REFB_PALETTE.leafShade, 0.9);

    const aimLat = new THREE.Vector3(Math.cos(latAng) * 0.55, 0.68, Math.sin(latAng) * 0.55 + 0.32).normalize();
    builder.addStarBellflowerHead(latTip, aimLat, 0.78 + rand() * 0.18, rand() - 0.5, 0.92);

    // Crown bud on every other stalk
    if (s % 2 === 0) {
      const budTip = p2
        .clone()
        .add(new THREE.Vector3(Math.cos(angle - 0.4) * 0.09, 0.12, Math.sin(angle - 0.4) * 0.09));
      builder.addStemCurve(p2, p2.clone().lerp(budTip, 0.5), budTip, 0.008, 0.005, 2, REFB_PALETTE.leafMid, REFB_PALETTE.leafShade, 1.0);
      builder.addBellflowerBud(
        budTip,
        new THREE.Vector3(Math.cos(angle) * 0.25, 0.95, Math.sin(angle) * 0.25),
        0.9,
        1.0
      );
    }
  }

  return builder.toGeometry(false);
}

// ASSET 2: Single Hero Star-Bell Stalk (Lightweight modular stalk for custom game clustering)
export function createSingleBellflowerStalkGeometry(variant = 0) {
  const rand = createPRNG(211 + variant * 41);
  const builder = new PartGeometryBuilder();

  // 4 basal leaves
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * Math.PI * 2 + rand() * 0.4;
    builder.addArchingLeaf({
      baseX: 0,
      baseY: 0.01,
      baseZ: 0,
      yaw,
      pitch: 0.48 + rand() * 0.2,
      length: 0.52 + rand() * 0.12,
      width: 0.11,
      arch: 0.26,
      fold: 0.018,
      segments: 4,
      colBaseSun: REFB_PALETTE.leafDeepBase,
      colTipSun: REFB_PALETTE.leafSunTip,
      colBaseShd: REFB_PALETTE.leafShade,
      colTipShd: REFB_PALETTE.leafMid,
      windScale: 0.5,
    });
  }

  const p0 = new THREE.Vector3(0, 0, 0);
  const p1 = new THREE.Vector3((rand() - 0.5) * 0.08, 0.52, (rand() - 0.5) * 0.08);
  const p2 = new THREE.Vector3((rand() - 0.5) * 0.14, 0.96, 0.08);
  builder.addStemCurve(p0, p1, p2, 0.018, 0.008, 4, REFB_PALETTE.leafMid, REFB_PALETTE.leafShade, 0.9);

  // 3 blossoms + 1 crown bud
  builder.addStarBellflowerHead(p2, new THREE.Vector3(0.1, 0.75, 0.65).normalize(), 1.0, 0, 0.95);

  const branch1 = new THREE.Vector3(0.15, 0.76, 0.06);
  builder.addStemCurve(p1, p1.clone().lerp(branch1, 0.5), branch1, 0.011, 0.006, 2, REFB_PALETTE.leafMid, REFB_PALETTE.leafShade, 0.85);
  builder.addStarBellflowerHead(branch1, new THREE.Vector3(0.45, 0.72, 0.52).normalize(), 0.85, 0.2, 0.9);

  const branch2 = new THREE.Vector3(-0.14, 0.68, 0.08);
  builder.addStemCurve(p1, p1.clone().lerp(branch2, 0.5), branch2, 0.011, 0.006, 2, REFB_PALETTE.leafMid, REFB_PALETTE.leafShade, 0.85);
  builder.addStarBellflowerHead(branch2, new THREE.Vector3(-0.45, 0.72, 0.52).normalize(), 0.8, -0.2, 0.88);

  const budPos = p2.clone().add(new THREE.Vector3(-0.06, 0.14, -0.04));
  builder.addStemCurve(p2, p2.clone().lerp(budPos, 0.5), budPos, 0.008, 0.005, 2, REFB_PALETTE.leafMid, REFB_PALETTE.leafShade, 1.0);
  builder.addBellflowerBud(budPos, new THREE.Vector3(-0.15, 0.98, 0.1), 0.95, 1.0);

  return builder.toGeometry(false);
}

// ASSET 3: Secondary Magenta-Violet Wildflower Sprig (Bridges hero clumps and open grass)
export function createSecondaryVioletSprigGeometry(variant = 0) {
  const rand = createPRNG(307 + variant * 59);
  const builder = new PartGeometryBuilder();

  for (let i = 0; i < 6; i++) {
    const yaw = (i / 6) * Math.PI * 2 + rand() * 0.3;
    builder.addArchingLeaf({
      baseX: 0,
      baseY: 0.01,
      baseZ: 0,
      yaw,
      pitch: 0.42 + rand() * 0.25,
      length: 0.36 + rand() * 0.12,
      width: 0.065,
      arch: 0.22,
      fold: 0.012,
      segments: 3,
      colBaseSun: REFB_PALETTE.leafMid,
      colTipSun: REFB_PALETTE.grassSunMid,
      colBaseShd: REFB_PALETTE.leafShade,
      colTipShd: REFB_PALETTE.grassShadeMid,
      windScale: 0.55,
    });
  }

  const numSprigs = 5 + (variant % 2);
  for (let s = 0; s < numSprigs; s++) {
    const ang = (s / numSprigs) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    const rad = 0.08 + rand() * 0.18;
    const h = 0.42 + rand() * 0.22;
    const p0 = new THREE.Vector3(Math.cos(ang) * 0.03, 0.01, Math.sin(ang) * 0.03);
    const p1 = new THREE.Vector3(Math.cos(ang) * rad * 0.6, h * 0.55, Math.sin(ang) * rad * 0.6);
    const p2 = new THREE.Vector3(Math.cos(ang) * rad, h, Math.sin(ang) * rad);

    builder.addStemCurve(p0, p1, p2, 0.011, 0.005, 3, REFB_PALETTE.leafMid, REFB_PALETTE.leafShade, 0.8);
    const aim = new THREE.Vector3(Math.cos(ang) * 0.35, 0.88, Math.sin(ang) * 0.35 + 0.25).normalize();
    builder.addDaisyHead(p2, aim, 0.72 + rand() * 0.18, 5, REFB_PALETTE.violetSun, REFB_PALETTE.violetShade, 0.88);
  }

  return builder.toGeometry(false);
}

// ASSET 4: Airy White Chamomile / Daisy Cluster (Wide-spaced so blossoms NEVER merge into a white blob)
export function createChamomileDaisyClusterGeometry(variant = 0) {
  const rand = createPRNG(409 + variant * 67);
  const builder = new PartGeometryBuilder();

  // Delicate narrow grass/chamomile basal leaves
  for (let i = 0; i < 7; i++) {
    const yaw = (i / 7) * Math.PI * 2 + rand() * 0.35;
    builder.addArchingLeaf({
      baseX: (rand() - 0.5) * 0.18,
      baseY: 0.01,
      baseZ: (rand() - 0.5) * 0.18,
      yaw,
      pitch: 0.55 + rand() * 0.3,
      length: 0.32 + rand() * 0.14,
      width: 0.045,
      arch: 0.2,
      fold: 0.008,
      segments: 3,
      colBaseSun: REFB_PALETTE.grassRootSun,
      colTipSun: REFB_PALETTE.grassSunBright,
      colBaseShd: REFB_PALETTE.grassShadeDeep,
      colTipShd: REFB_PALETTE.grassShadeMid,
      windScale: 0.55,
    });
  }

  // 6 airy, well-separated stems with small crisp white 7-petal daisies
  const numDaisies = 6 + (variant % 2);
  for (let d = 0; d < numDaisies; d++) {
    const ang = (d / numDaisies) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    // Wide spacing radius (0.14 to 0.36) so green grass shows clearly between every white flower!
    const rad = d === 0 ? 0.06 : 0.16 + rand() * 0.22;
    const h = 0.34 + rand() * 0.22;

    const p0 = new THREE.Vector3(Math.cos(ang) * rad * 0.5, 0.01, Math.sin(ang) * rad * 0.5);
    const p1 = new THREE.Vector3(Math.cos(ang) * rad * 0.8, h * 0.55, Math.sin(ang) * rad * 0.8);
    const p2 = new THREE.Vector3(Math.cos(ang) * rad, h, Math.sin(ang) * rad);

    builder.addStemCurve(p0, p1, p2, 0.009, 0.004, 2, REFB_PALETTE.grassRootSun, REFB_PALETTE.grassShadeMid, 0.75);

    const aim = new THREE.Vector3(Math.cos(ang) * 0.28, 0.92, Math.sin(ang) * 0.28 + 0.22).normalize();
    builder.addDaisyHead(p2, aim, 0.58 + rand() * 0.16, 7, REFB_PALETTE.daisyWhiteSun, REFB_PALETTE.daisyWhiteShade, 0.82);
  }

  return builder.toGeometry(false);
}

// ASSET 5: 3-Tier Stylized Meadow Grass Clump (Painterly broad blades with upward-softened normals)
export function createMeadowGrassTuftGeometry(variant = 0) {
  const rand = createPRNG(503 + variant * 89);
  const builder = new PartGeometryBuilder();

  // Variant 0: Open Lawn Short Turf Clump (7 broad painterly blades)
  // Variant 1: Tall Arching Accent Sword-Grass Clump (9 sweeping blades around rocks/flowers)
  // Variant 2: Lush Mixed Ground Collar Tuft
  const isTall = variant === 1;
  const numBlades = isTall ? 9 : 7;

  for (let i = 0; i < numBlades; i++) {
    const yaw = (i / numBlades) * Math.PI * 2 + (rand() - 0.5) * 0.45;
    const rOff = 0.02 + rand() * 0.09;
    const len = isTall ? 0.48 + rand() * 0.28 : 0.24 + rand() * 0.15;
    const wid = isTall ? 0.068 + rand() * 0.025 : 0.058 + rand() * 0.022;
    const pitch = isTall ? 0.62 + rand() * 0.32 : 0.52 + rand() * 0.35;

    const tipSun = i % 2 === 0 ? REFB_PALETTE.grassSunBright : REFB_PALETTE.grassSunMid;
    builder.addArchingLeaf({
      baseX: Math.cos(yaw) * rOff,
      baseY: 0.0,
      baseZ: Math.sin(yaw) * rOff,
      yaw,
      pitch,
      length: len,
      width: wid,
      arch: isTall ? 0.32 : 0.22,
      fold: 0.01,
      segments: 3,
      colBaseSun: REFB_PALETTE.grassRootSun,
      colTipSun: tipSun,
      colBaseShd: REFB_PALETTE.grassShadeDeep,
      colTipShd: REFB_PALETTE.grassShadeMid,
      windScale: isTall ? 0.75 : 0.45,
    });
  }

  return builder.toGeometry(false);
}

// ASSET 6: Faceted Ghibli Meadow Boulder (Crisp planar facets with warm limestone top & cool slate sides)
export function createFacetedMeadowRockGeometry(variant = 0) {
  const rand = createPRNG(607 + variant * 97);

  // Start from an icosahedron, flatten bottom, chisel planar facets along major planes
  const baseGeo = new THREE.IcosahedronGeometry(0.68, 1);
  const nonIndexed = baseGeo.toNonIndexed();
  const posAttr = nonIndexed.attributes.position;

  // Define 5 chiseled slicing planes so vertices snap into broad Ghibli boulder facets
  const stretchX = variant === 0 ? 1.35 : variant === 1 ? 1.15 : 1.45;
  const stretchY = variant === 0 ? 0.78 : variant === 1 ? 0.92 : 0.65;
  const stretchZ = variant === 0 ? 1.05 : variant === 1 ? 0.95 : 1.15;

  // Deterministic vertex displacement by unique vertex coordinate key
  const vMap = new Map();
  const getDisplaced = (vx, vy, vz) => {
    const key = `${vx.toFixed(3)},${vy.toFixed(3)},${vz.toFixed(3)}`;
    if (vMap.has(key)) return vMap.get(key);

    let x = vx * stretchX;
    let y = vy * stretchY;
    let z = vz * stretchZ;

    // Flatten lower hemisphere to sit solidly in the meadow soil
    if (y < -0.15) {
      y = -0.15 + (y + 0.15) * 0.25;
    } else {
      // Chisel angular ridge planes matching Image 3's faceted boulders
      const ridge = Math.sin(vx * 2.7 + variant * 1.4) * 0.09 + Math.cos(vz * 2.3 - variant) * 0.08;
      x += (rand() - 0.5) * 0.08 + ridge * 0.4;
      y += (rand() - 0.5) * 0.07 + (vy > 0.2 ? 0.05 : 0.0);
      z += (rand() - 0.5) * 0.08;
    }
    const out = new THREE.Vector3(x, y + 0.16, z);
    vMap.set(key, out);
    return out;
  };

  const positions = [];
  const sunColors = [];
  const shadowColors = [];
  const windWeights = [];

  for (let i = 0; i < posAttr.count; i += 3) {
    const a = getDisplaced(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    const b = getDisplaced(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1));
    const c = getDisplaced(posAttr.getX(i + 2), posAttr.getY(i + 2), posAttr.getZ(i + 2));

    // Compute face normal for crisp planar color assignment
    const e1 = new THREE.Vector3().subVectors(b, a);
    const e2 = new THREE.Vector3().subVectors(c, a);
    const fn = new THREE.Vector3().crossVectors(e1, e2).normalize();

    // Top-facing planes get warm sunlit limestone (#e9dad3); side planes get cool slate (#939bb0 -> #5b7789)
    const topFactor = smoothstep(0.15, 0.72, fn.y);
    const sideLight = smoothstep(-0.35, 0.55, fn.x * 0.55 + fn.z * 0.45);

    const faceSun = REFB_PALETTE.rockMidSlate
      .clone()
      .lerp(REFB_PALETTE.rockTopSun, topFactor * 0.92 + sideLight * 0.25);
    const faceShd = REFB_PALETTE.rockShadowBlue.clone().lerp(REFB_PALETTE.rockMidSlate, topFactor * 0.55);

    const verts = [a, b, c];
    for (let k = 0; k < 3; k++) {
      const v = verts[k];
      // Subtle green ground-contact moss blend on lowest vertices
      const mossMix = smoothstep(0.18, 0.0, v.y) * 0.45;
      const vSun = faceSun.clone().lerp(REFB_PALETTE.rockMossBase, mossMix);
      const vShd = faceShd.clone().lerp(REFB_PALETTE.grassShadeDeep, mossMix);

      positions.push(v.x, v.y, v.z);
      sunColors.push(vSun.r, vSun.g, vSun.b);
      shadowColors.push(vShd.r, vShd.g, vShd.b);
      windWeights.push(0.0);
    }
  }

  return createColoredGeometry(positions, null, sunColors, shadowColors, windWeights, true);
}

/* ========================================================================= */
/* 7. NEW CODE — TREE BUILDERS                                               */
/*                                                                           */
/* Everything above is B. Everything below is new, but the canopy is built   */
/* exclusively from B's PartGeometryBuilder.addArchingLeaf so a tree reads in */
/* exactly the same leaf language as B's grass tufts and lance leaves.       */
/*                                                                           */
/* Contract                                                                  */
/*   createTreeCanopyGeometry({ variant: 0..4 }) -> BufferGeometry            */
/*     origin sits at the BOTTOM of the canopy; it is meant to be placed at  */
/*     the trunk top (trunk height - ~0.2 m overlap).                        */
/*   createTreeTrunkGeometry({ variant: 0..4 }) -> BufferGeometry            */
/*     origin at the ground; y = 0 .. trunk height.                          */
/*   Both also accept a bare number for `variant`.                           */
/*   Variants 0..3 are broadleaf, 4 is the conifer.                          */
/* ========================================================================= */

const TAU = Math.PI * 2;
// B's uSunDir = (0.58, 0.74, 0.34): the XZ azimuth the canopy rim must face.
const TREE_SUN_YAW = Math.atan2(0.34, 0.58);

// Exported so the placement layer can read (or override) the authored numbers
// instead of guessing at map scale. Every field is consumed by the builders
// below; pass a modified copy into createTreeCanopyGeometry({ ...variant, ... }).
export const TREE_CANOPY_VARIANTS = [
  // 0 — round dome broadleaf
  { name: "broadleaf-dome", conifer: false, puffs: 10, leaves: 8, spread: 0.6, canopyH: 2.4,
    puffR: 0.85, flatten: 0.82, length: [1.3, 1.6], width: [0.78, 0.9], pitch: [0.22, 0.55],
    arch: 0.3, seed: 1201 },
  // 1 — wide flat umbrella
  { name: "broadleaf-umbrella", conifer: false, puffs: 10, leaves: 8, spread: 0.85, canopyH: 2.0,
    puffR: 0.9, flatten: 0.72, length: [1.35, 1.65], width: [0.8, 0.9], pitch: [0.2, 0.5],
    arch: 0.3, seed: 1307 },
  // 2 — tall columnar
  { name: "broadleaf-column", conifer: false, puffs: 10, leaves: 8, spread: 0.5, canopyH: 3.2,
    puffR: 0.8, flatten: 0.88, length: [1.25, 1.5], width: [0.7, 0.84], pitch: [0.3, 0.55],
    arch: 0.3, seed: 1409 },
  // 3 — airy sparse
  { name: "broadleaf-airy", conifer: false, puffs: 9, leaves: 8, spread: 0.7, canopyH: 2.6,
    puffR: 0.75, flatten: 0.78, length: [1.3, 1.6], width: [0.7, 0.85], pitch: [0.22, 0.5],
    arch: 0.3, seed: 1511 },
  // 4 — conifer (stacked drooping bough whorls)
  { name: "conifer", conifer: true, puffs: 10, leaves: 8, spread: 0.5, canopyH: 3.4,
    puffR: 0.85, flatten: 0.7, length: [1.2, 1.45], width: [0.6, 0.72], pitch: [0.15, 0.3],
    arch: 0.3, seed: 1613 },
];

// Exported for the same reason as TREE_CANOPY_VARIANTS. `height` is the trunk
// tip height; the canopy origin is its own bottom, so place the canopy mesh at
// `trunkHeight - overlap` (harness uses 0.45 m, i.e. ~18% of the canopy height)
// and the trunk tip stays buried inside the crown.
export const TREE_TRUNK_VARIANTS = [
  { name: "broadleaf-dome", height: 2.6, sides: 5, rBase: 0.24, rTop: 0.05, branches: 3, bend: 0.1, seed: 2201 },
  { name: "broadleaf-umbrella", height: 2.3, sides: 4, rBase: 0.25, rTop: 0.055, branches: 3, bend: 0.08, seed: 2203 },
  { name: "broadleaf-column", height: 2.85, sides: 5, rBase: 0.23, rTop: 0.045, branches: 2, bend: 0.07, seed: 2207 },
  { name: "broadleaf-airy", height: 2.1, sides: 3, rBase: 0.2, rTop: 0.04, branches: 3, bend: 0.14, seed: 2213 },
  { name: "conifer", height: 1.9, sides: 3, rBase: 0.2, rTop: 0.035, branches: 3, bend: 0.03, seed: 2219 },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function resolveVariant(arg, fallback = 0) {
  if (typeof arg === "number" && Number.isFinite(arg)) return Math.max(0, Math.min(4, arg | 0));
  if (arg && typeof arg === "object" && Number.isFinite(arg.variant)) {
    return Math.max(0, Math.min(4, arg.variant | 0));
  }
  return fallback;
}

// Squash every vertex added in [fromVertex, toVertex) around pivotY. Used to
// flatten each canopy puff into a leaf pancake instead of a leaf ball.
function flattenVertexRange(builder, fromVertex, toVertex, pivotY, factor) {
  for (let v = fromVertex; v < toVertex; v++) {
    const i = v * 3 + 1;
    builder.positions[i] = pivotY + (builder.positions[i] - pivotY) * factor;
  }
}

// Tapered polygonal limb along a polyline. 3-6 sides, so trunks read as chunky
// faceted columns rather than B's thin 3-sided flower stems.
function addTaperedPrism(builder, points, sides, radiusBase, radiusTip, colSun, colShd, windMax = 0) {
  const n = points.length;
  const rings = [];
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const ref = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = radiusBase * (1 - t) + radiusTip * t;
    const w = t * t * windMax;

    if (i === 0) tangent.subVectors(points[1], points[0]);
    else if (i === n - 1) tangent.subVectors(points[n - 1], points[n - 2]);
    else tangent.subVectors(points[i + 1], points[i - 1]);
    tangent.normalize();

    if (Math.abs(tangent.y) > 0.95) ref.set(1, 0, 0);
    else ref.set(0, 1, 0);
    right.crossVectors(tangent, ref).normalize();
    fwd.crossVectors(right, tangent).normalize();

    const ring = [];
    for (let k = 0; k < sides; k++) {
      const ang = (k / sides) * TAU;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      ring.push(
        builder.addVertex(
          points[i].x + (right.x * ca + fwd.x * sa) * r,
          points[i].y + (right.y * ca + fwd.y * sa) * r,
          points[i].z + (right.z * ca + fwd.z * sa) * r,
          colSun,
          colShd,
          w
        )
      );
    }
    rings.push(ring);
  }

  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const nk = (k + 1) % sides;
      builder.addQuad(rings[i][k], rings[i][nk], rings[i + 1][nk], rings[i + 1][k]);
    }
  }
}

/**
 * Tree canopy: 6-10 flattened, offset puffs, each a radial fan of 6-8 arching
 * leaves from B's addArchingLeaf. 3-tone baked canopy ramp (canopyDark base ->
 * canopyMid -> canopyLight top) plus a bright rim on the sun side (+X/+Z, B's
 * uSunDir azimuth). Variants 0..3 broadleaf, 4 conifer.
 */
export function createTreeCanopyGeometry(variantOrOpts = 0) {
  const variant = resolveVariant(variantOrOpts, 0);
  const cfg = TREE_CANOPY_VARIANTS[variant];
  const opts = variantOrOpts && typeof variantOrOpts === "object" ? variantOrOpts : {};
  const rand = createPRNG(opts.seed !== undefined ? opts.seed : cfg.seed);
  const builder = new PartGeometryBuilder();

  const puffCount = opts.puffs !== undefined ? opts.puffs : cfg.puffs;
  const leavesPerPuff = opts.leaves !== undefined ? opts.leaves : cfg.leaves;
  const spread = opts.spread !== undefined ? opts.spread : cfg.spread;
  const canopyH = opts.height !== undefined ? opts.height : cfg.canopyH;

  const pal = REFB_TREE_PALETTE;
  const shdBase = REFB_PALETTE.leafShade; // #3b6058 teal shadow, B's leaf ramp
  const shdTip = REFB_PALETTE.leafDeepBase; // #466e5d
  const goldenAngle = 2.399963229728653;

  // --- puff layout ---------------------------------------------------------
  // Broadleaf: one crown puff, a golden-angle shell of puffs through the dome,
  // and one low centre puff that buries the trunk tip -> no gaps, no stick.
  // Conifer: whorls stacked up the axis with shrinking radius -> cone.
  const puffs = [];
  if (cfg.conifer) {
    for (let p = 0; p < puffCount; p++) {
      const t = puffCount === 1 ? 0.5 : p / (puffCount - 1);
      const ang = p * goldenAngle + (rand() - 0.5) * 0.35;
      const rad = spread * (1.0 - t) * (0.55 + rand() * 0.4);
      puffs.push({
        x: Math.cos(ang) * rad,
        z: Math.sin(ang) * rad,
        y: canopyH * (0.08 + t * 0.88),
        r: cfg.puffR * (1.0 - t * 0.45),
        rot: rand() * TAU,
        role: t > 0.85 ? "crown" : "whorl",
      });
    }
  } else {
    // crown puff
    puffs.push({
      x: (rand() - 0.5) * 0.2,
      z: (rand() - 0.5) * 0.2,
      y: canopyH * 0.84,
      r: cfg.puffR * 0.95,
      rot: rand() * TAU,
      role: "crown",
    });
    // dome shell: puffs fill the crown continuously from the low skirt to just
    // under the crown puff, so the stack of leaf discs stays opaque
    const shellCount = Math.max(1, puffCount - 3);
    for (let p = 0; p < shellCount; p++) {
      const t = (p + 0.5) / shellCount;
      const ang = p * goldenAngle + (rand() - 0.5) * 0.5;
      const rad = spread * Math.pow(t, 0.65);
      const y = canopyH * (0.08 + 0.7 * (1.0 - rad / spread));
      puffs.push({
        x: Math.cos(ang) * rad,
        z: Math.sin(ang) * rad,
        y: y + (rand() - 0.5) * 0.1,
        r: cfg.puffR * (0.82 + rand() * 0.3),
        rot: rand() * TAU,
        role: "shell",
      });
    }
    // two low centre puffs: fill the crown underside so the trunk tip is buried
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + rand() * 0.8;
      puffs.push({
        x: Math.cos(a) * 0.18,
        z: Math.sin(a) * 0.18,
        y: canopyH * (0.02 + i * 0.05),
        r: cfg.puffR * 0.75,
        rot: rand() * TAU,
        role: "low",
      });
    }
  }

  // Put the origin at the bottom of the canopy so placement is predictable.
  let minY = Infinity;
  for (const pf of puffs) minY = Math.min(minY, pf.y);
  for (const pf of puffs) pf.y -= minY;

  // --- puffs -> arching leaf fans -----------------------------------------
  for (const pf of puffs) {
    const hFrac = Math.max(0, Math.min(1, pf.y / canopyH));

    // 3-tone ramp: every leaf base sits in the dark tone, mid tones fill the
    // mass, and only the crown tips climb to the light tone.
    let sunBase;
    let sunTip;
    if (cfg.conifer) {
      sunBase = pal.coniferDark.clone().lerp(pal.canopyDark, smoothstep(0.0, 0.6, hFrac) * 0.6);
      sunTip = pal.canopyDark.clone().lerp(pal.coniferLight, smoothstep(0.55, 1.0, hFrac));
    } else {
      sunBase = pal.canopyDark.clone();
      sunTip = pal.canopyDark
        .clone()
        .lerp(pal.canopyMid, smoothstep(0.0, 0.55, hFrac))
        .lerp(pal.canopyLight, smoothstep(0.62, 1.0, hFrac));
    }

    const firstVertex = builder.vertexCount;

    // Shorter leaves on the crown and skirt puffs round the silhouette off;
    // mid-canopy puffs keep the full leaf length.
    const roleLen = pf.role === "crown" ? 0.78 : pf.role === "low" ? 0.85 : 1.0;
    // A little per-puff tint jitter so the layers read as hand-painted.
    const tint = 0.94 + rand() * 0.12;

    for (let l = 0; l < leavesPerPuff; l++) {
      // Leaves radiate from the puff centre, but with heavy angular jitter and
      // a mixed upright/outward pitch, so a puff reads as a volumetric clump of
      // B's arching leaves instead of a flat star fan.
      const yaw = pf.rot + (l / leavesPerPuff) * TAU + (rand() - 0.5) * 0.95;
      // Low puffs aim their leaves up (upper end of the authored pitch range)
      // so they wrap the trunk tip; everything else uses the full range.
      const pitch =
        pf.role === "low"
          ? lerp(cfg.pitch[1] * 0.7, cfg.pitch[1], rand())
          : Math.min(cfg.pitch[1], lerp(cfg.pitch[0], cfg.pitch[1], rand()) + (l % 3 === 0 ? 0.1 : 0));
      const length = lerp(cfg.length[0], cfg.length[1], rand()) * roleLen;
      const width = lerp(cfg.width[0], cfg.width[1], rand());
      const baseR = pf.r * (0.02 + rand() * 0.28);
      const baseY = pf.y + (rand() - 0.5) * pf.r * 0.5;

      // Bright rim on the sun side: B's uSunDir azimuth, weighted by height.
      const sunSide = Math.max(0, Math.cos(yaw - TREE_SUN_YAW));
      const rim = smoothstep(0.2, 0.95, hFrac) * sunSide;
      const tipSun = sunTip
        .clone()
        .lerp(pal.canopyRim, rim * 0.3)
        .multiplyScalar((1.0 + 0.06 * rim * 0.45) * tint);
      const baseSun = sunBase.clone().multiplyScalar((1.0 + 0.06 * rim * 0.45 * 0.5) * tint);

      builder.addArchingLeaf({
        baseX: pf.x + Math.cos(yaw) * baseR,
        baseY,
        baseZ: pf.z + Math.sin(yaw) * baseR,
        yaw,
        pitch,
        length,
        width,
        arch: cfg.arch,
        fold: 0.1,
        segments: 3,
        colBaseSun: baseSun,
        colTipSun: tipSun,
        colBaseShd: shdBase,
        colTipShd: shdTip,
        windScale: 0.15,
      });
    }

    // Flattened puff: squash the fan vertically around its own centre.
    flattenVertexRange(builder, firstVertex, builder.vertexCount, pf.y, cfg.flatten);
  }

  const geometry = builder.toGeometry(false);
  geometry.userData = {
    kind: "refb-tree-canopy",
    variant,
    name: cfg.name,
    conifer: cfg.conifer,
    puffs: puffCount,
    height: canopyH,
  };
  return geometry;
}

/**
 * Tree trunk: tapered 3-6 sided trunk (2-3 branches) in B's trunk / trunkDark
 * ramp. Origin at ground, y = 0..height. Variants match the canopy variants.
 */
export function createTreeTrunkGeometry(variantOrOpts = 0) {
  const variant = resolveVariant(variantOrOpts, 0);
  const cfg = TREE_TRUNK_VARIANTS[variant];
  const opts = variantOrOpts && typeof variantOrOpts === "object" ? variantOrOpts : {};
  const rand = createPRNG(opts.seed !== undefined ? opts.seed : cfg.seed);
  const builder = new PartGeometryBuilder();

  const height = opts.height !== undefined ? opts.height : cfg.height;
  const sides = opts.sides !== undefined ? opts.sides : cfg.sides;
  const pal = REFB_TREE_PALETTE;

  // --- main trunk: 5 rings along a gently bent, tapering column ------------
  // The last 15% is a thin dark leader (a twig) so that whatever pokes into the
  // canopy reads as a twig inside the foliage, never a bright trunk spike.
  const trunkPoints = [];
  const segments = 4;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const sway = Math.sin(t * Math.PI) * cfg.bend;
    trunkPoints.push(new THREE.Vector3(sway * 0.6, t * height * 0.85, sway * 0.35));
  }
  addTaperedPrism(builder, trunkPoints, sides, cfg.rBase, Math.min(cfg.rTop, 0.05), pal.trunk, pal.trunkDark, 0);

  const leaderTop = new THREE.Vector3(0, height, 0);
  leaderTop.x += Math.sin(0.85 * Math.PI) * cfg.bend * 0.6;
  leaderTop.z += Math.sin(0.85 * Math.PI) * cfg.bend * 0.35;
  addTaperedPrism(
    builder,
    [trunkPoints[trunkPoints.length - 1], leaderTop],
    Math.max(3, sides - 1),
    0.035,
    0.012,
    pal.trunkDark,
    pal.trunkDark,
    0
  );

  // --- 2-3 branches leaving the trunk toward the canopy --------------------
  for (let b = 0; b < cfg.branches; b++) {
    const bt = cfg.branches === 1 ? 0.7 : 0.45 + (b / Math.max(1, cfg.branches - 1)) * 0.25;
    const origin = new THREE.Vector3(0, bt * height, 0);
    origin.x += Math.sin(bt * Math.PI) * cfg.bend * 0.6;
    origin.z += Math.sin(bt * Math.PI) * cfg.bend * 0.35;

    const yaw = b * (TAU / cfg.branches) + (rand() - 0.5) * 0.7;
    const len = cfg.conifer ? 0.25 + rand() * 0.12 : 0.4 + rand() * 0.15;
    const rise = cfg.conifer ? -0.08 - rand() * 0.1 : 0.3 + rand() * 0.15;
    const mid = origin.clone().add(new THREE.Vector3(Math.cos(yaw) * len * 0.5, rise * 0.45, Math.sin(yaw) * len * 0.5));
    const tip = origin.clone().add(new THREE.Vector3(Math.cos(yaw) * len, rise, Math.sin(yaw) * len));

    addTaperedPrism(
      builder,
      [origin, mid, tip],
      3,
      cfg.conifer ? 0.055 : 0.06,
      0.018,
      pal.trunk,
      pal.trunkDark,
      0
    );
  }

  const geometry = builder.toGeometry(false);
  geometry.userData = {
    kind: "refb-tree-trunk",
    variant,
    name: cfg.name,
    height,
    sides,
  };
  return geometry;
}
