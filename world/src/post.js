// ============================================================================
// world/src/post.js
//
// 4x Hardware MSAA HalfFloat HDR RenderTarget -> RenderPass ->
// one GradeShader pass: depth-based atmosphere (aerial perspective, height fog,
// sun/moon in-scatter) -> thresholded Orton highlight glow -> AgX-inspired filmic grade
// (per-time-of-day keys). Cavity AO is opt-in. No multi-pass bloom (tablet/desktop budget).
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexelSize: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
    uExposure: { value: 1.0 },
    uToneMap: { value: 1.0 },
    uEncode: { value: 1.0 },
    uSaturation: { value: 1.04 },
    uContrast: { value: 1.07 },
    uLift: { value: 0.006 },
    uCavityStrength: { value: 0.0 },
    uAoTaps: { value: 8.0 },
    uWarmHigh: { value: new THREE.Vector3(1.04, 1.00, 0.94) },
    uCoolShadow: { value: new THREE.Vector3(0.88, 0.94, 1.06) },
    uVignette: { value: 0.22 },
    uHaze: { value: 0.018 },
    uSmiteMonochrome: { value: 0.0 },
    uGlowStrength: { value: 0.17 },
    uGlowThreshold: { value: 0.95 },
    // Depth-based atmosphere (aerial perspective + exponential height fog + sun in-scatter)
    tDepth: { value: null },
    uAtmosphere: { value: 0.0 },
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uFogColor: { value: new THREE.Color(0.8, 0.88, 0.95) },
    uScatterColor: { value: new THREE.Vector3(1, 0.9, 0.8) },
    uFogTint: { value: new THREE.Vector3(1, 1, 1) },
    uAerialDensity: { value: 0.0013 },
    uHeightFogDensity: { value: 0.0016 },
    uHeightFogFalloff: { value: 0.08 },
    uHeightFogBase: { value: 0.0 },
    uScatterStrength: { value: 0.5 },
    uSkyCutoff: { value: 480.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexelSize;
    uniform float uExposure;
    uniform float uToneMap;
    uniform float uEncode;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uLift;
    uniform float uCavityStrength;
    uniform float uAoTaps;
    uniform vec3 uWarmHigh;
    uniform vec3 uCoolShadow;
    uniform float uVignette;
    uniform float uHaze;
    uniform float uSmiteMonochrome;
    uniform float uGlowStrength;
    uniform float uGlowThreshold;
    uniform sampler2D tDepth;
    uniform float uAtmosphere;
    uniform mat4 uInvProj;
    uniform mat4 uCamWorld;
    uniform vec3 uCamPos;
    uniform vec3 uSunDirW;
    uniform vec3 uFogColor;
    uniform vec3 uScatterColor;
    uniform vec3 uFogTint;
    uniform float uAerialDensity;
    uniform float uHeightFogDensity;
    uniform float uHeightFogFalloff;
    uniform float uHeightFogBase;
    uniform float uScatterStrength;
    uniform float uSkyCutoff;

    varying vec2 vUv;

    // One atmosphere for every material (toon, custom terrain/foliage, water, outlines, VFX):
    // aerial perspective + analytic exponential height fog + forward sun/moon in-scattering.
    vec3 applyAtmosphere(vec3 c, vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      if (d >= 0.99999) return c;
      vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      vp /= vp.w;
      vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz;
      vec3 ray = wp - uCamPos;
      float dist = length(ray);
      // The sky dome paints its own horizon; fading it would double-fog the sky.
      if (dist > uSkyCutoff) return c;
      vec3 rd = ray / max(dist, 1e-4);
      float fy = uHeightFogFalloff * rd.y * dist;
      float h0 = uHeightFogDensity * exp(-uHeightFogFalloff * (uCamPos.y - uHeightFogBase));
      float heightOD = h0 * dist * (abs(fy) > 1e-3 ? (1.0 - exp(-fy)) / fy : 1.0);
      float T = exp(-(dist * uAerialDensity + max(heightOD, 0.0)));
      float mie = pow(max(dot(rd, uSunDirW), 0.0), 8.0);
      // Tinted haze away from the light, untinted horizon glow toward it (golden hour: mauve vs amber).
      vec3 fogCol = mix(uFogColor * uFogTint, uFogColor * uScatterColor * (1.0 + uScatterStrength), clamp(mie * uScatterStrength, 0.0, 1.0));
      return mix(fogCol, c, T);
    }

    float lumaLin(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    /**
     * Directional Luma-Edge FXAA (operates in linear HDR before tone-mapping):
     * Complements 4x hardware MSAA by smoothing shader-generated edges (cel-shading steps,
     * water specular glints, roof tile ridges, and outline silhouettes) without blurring foliage.
     */
    vec3 sampleFXAALinear(vec2 uv, out float outCavityAO) {
      vec3 rgbM  = clamp(texture2D(tDiffuse, uv).rgb, vec3(0.0), vec3(64.0));
      vec3 rgbNW = clamp(texture2D(tDiffuse, uv + vec2(-0.75, -0.75) * uTexelSize).rgb, vec3(0.0), vec3(64.0));
      vec3 rgbNE = clamp(texture2D(tDiffuse, uv + vec2( 0.75, -0.75) * uTexelSize).rgb, vec3(0.0), vec3(64.0));
      vec3 rgbSW = clamp(texture2D(tDiffuse, uv + vec2(-0.75,  0.75) * uTexelSize).rgb, vec3(0.0), vec3(64.0));
      vec3 rgbSE = clamp(texture2D(tDiffuse, uv + vec2( 0.75,  0.75) * uTexelSize).rgb, vec3(0.0), vec3(64.0));

      float lumaM  = lumaLin(rgbM);
      float lumaNW = lumaLin(rgbNW);
      float lumaNE = lumaLin(rgbNE);
      float lumaSW = lumaLin(rgbSW);
      float lumaSE = lumaLin(rgbSE);

      // Zero-Extra-Tap Screen-Space Crevice & Contact Cavity AO (reuses the 4 diagonal FXAA luma taps!)
      float avgSurround = (lumaNW + lumaNE + lumaSW + lumaSE) * 0.25;
      float diff = max(0.0, avgSurround - lumaM);
      float weight = smoothstep(0.012, 0.18, diff) * (1.0 - smoothstep(0.35, 0.85, diff));
      outCavityAO = clamp(weight * (1.0 - smoothstep(0.45, 0.95, lumaM)) * uCavityStrength * 1.45, 0.0, 0.34);

      float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
      float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
      float lumaRange = lumaMax - lumaMin;

      if (lumaRange < max(0.028, lumaMax * 0.11)) {
        return rgbM;
      }

      vec2 dir;
      dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
      dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
      float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * 0.125), 1.0 / 65536.0);
      float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = clamp(dir * rcpDirMin, vec2(-4.0), vec2(4.0)) * uTexelSize;

      vec3 rgbA = 0.5 * (
        clamp(texture2D(tDiffuse, uv + dir * (1.0 / 3.0 - 0.5)).rgb, vec3(0.0), vec3(64.0)) +
        clamp(texture2D(tDiffuse, uv + dir * (2.0 / 3.0 - 0.5)).rgb, vec3(0.0), vec3(64.0))
      );
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        clamp(texture2D(tDiffuse, uv + dir * -0.5).rgb, vec3(0.0), vec3(64.0)) +
        clamp(texture2D(tDiffuse, uv + dir *  0.5).rgb, vec3(0.0), vec3(64.0))
      );
      float lumaB = lumaLin(rgbB);
      return (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : mix(rgbM, rgbB, 0.72);
    }

    /**
     * AgX-Inspired Inset Filmic Tone-Mapping with Soft Path-to-White Rolloff:
     * Preserves true midtone pigment hues (weathered terracotta, sage-emerald,
     * wisteria violet) without ACES's radioactive orange/lime skew, while rolling
     * bright sunlight highlights smoothly into warm ivory.
     */
    vec3 filmicAgX(vec3 color) {
      vec3 v = max(color * (uExposure * 1.18), vec3(0.0));

      const mat3 agxInset = mat3(
        vec3(0.8566, 0.0951, 0.0483),
        vec3(0.1373, 0.7612, 0.1015),
        vec3(0.1119, 0.0768, 0.8113)
      );
      const mat3 agxOutset = mat3(
        vec3( 1.1969, -0.1322, -0.0647),
        vec3(-0.1906,  1.3385, -0.1479),
        vec3(-0.1471, -0.0982,  1.2453)
      );

      v = agxInset * v;

      vec3 a = v * (v + 0.0285) - 0.00008;
      vec3 b = v * (0.965 * v + 0.445) + 0.245;
      vec3 mapped = clamp(a / b, 0.0, 1.0);

      mapped = agxOutset * mapped;
      return clamp(mapped, 0.0, 1.0);
    }

    vec3 linearToSRGB(vec3 c) {
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
      return mix(lo, hi, step(vec3(0.0031308), c));
    }

    void main() {
      float cavityAO = 0.0;
      vec3 c = sampleFXAALinear(vUv, cavityAO);

      vec3 bounded = clamp(c, vec3(0.0), vec3(64.0));
      c = all(equal(bounded, bounded)) ? bounded : vec3(0.0);
      vec3 linPreGrade = c;

      // Glow keys off the un-fogged colour so haze never blooms; sources still glow through it.
      vec3 glowSrc = c;
      if (uAtmosphere > 0.5) c = applyAtmosphere(c, vUv);

      // Off by default (uCavityStrength = 0): the luma cavity term drew dark halos around silhouettes.
      if (uCavityStrength > 0.001) {
        vec3 aoTint = mix(vec3(1.0), vec3(0.58, 0.66, 0.84), cavityAO);
        c *= aoTint * (1.0 - cavityAO * 0.58);
      }

      // Single-pass painterly Orton glow (replaces multi-pass bloom): only pixels above the
      // threshold (suns, lanterns, spell cores) glow.
      float glowMask = smoothstep(uGlowThreshold, uGlowThreshold + 0.75, lumaLin(glowSrc));
      c += glowSrc * vec3(1.06, 1.02, 0.94) * glowMask * uGlowStrength;

      // 2. Single-pass AgX-inspired filmic tone mapping & sRGB encoding
      if (uToneMap > 0.5) c = filmicAgX(c);
      if (uEncode > 0.5) c = linearToSRGB(c);

      float l = lumaLin(c);

      // 3. Crisp Anime Pigment Saturation
      c = mix(vec3(l), c, uSaturation);

      // 4. Filmic contrast around 0.46 mid-grey pivot
      c = (c - 0.46) * uContrast + 0.46;

      // 5. Time-of-day split tone: warm golden highlights & cool periwinkle-azure shadows
      float hi = smoothstep(0.44, 0.96, l);
      float lo = 1.0 - smoothstep(0.0, 0.52, l);
      c *= mix(vec3(1.0), uWarmHigh, hi);
      c *= mix(vec3(1.0), uCoolShadow, lo);

      // 6. Subtle shadow lift so deep crevices stay rich sapphire-slate rather than crushed black
      c += uLift * (1.0 - smoothstep(0.0, 0.34, l)) * vec3(0.82, 0.90, 1.08);

      // 7B. Frame 41 Divine Smite Selective-Crimson Stark B&W Monochrome Grade
      // Runs AFTER split-toning, shadow lift, and haze so B&W is never tinted blue,
      // and uses a strict Ruby Blood-Crimson Purity Mask (in pre-AgX linear space + post-grade sRGB)
      // that passes ONLY pure ruby blood-crimson (B > G * 1.8 && R > G * 20.0: Eclipse corona,
      // 240 Smite petals, crimsonFlowerSlump, character dissolve rim) while rejecting 100% of
      // orange-terracotta village roofs (#b84222 / #c24928 where G > B), well roofs, and shrine carpets!
      if (uSmiteMonochrome > 0.001) {
        float linRubyRatio = linPreGrade.r - max(linPreGrade.g * 28.0, linPreGrade.b * 4.2);
        float linBlueOverGreen = step(linPreGrade.g * 1.85, linPreGrade.b);
        float crimsonMask = smoothstep(0.012, 0.075, linRubyRatio) * linBlueOverGreen * step(0.038, linPreGrade.r);

        float monoLuma = pow(clamp(lumaLin(c), 0.0, 1.0), 1.08);
        vec3 starkBw = vec3(monoLuma);
        // Reconstruct rich, velvety blood-crimson so AgX inset never washes out the crimson petals or corona
        float rubySrgbR = clamp(max(c.r * 1.08, pow(clamp(linPreGrade.r * 1.15, 0.0, 1.0), 0.45)), 0.0, 1.0);
        vec3 crimsonKeep = vec3(rubySrgbR, rubySrgbR * 0.08, rubySrgbR * 0.18);
        c = mix(c, mix(starkBw, crimsonKeep, crimsonMask), clamp(uSmiteMonochrome, 0.0, 1.0));
      }

      // 8. Soft cinematic lens vignette
      vec2 q = vUv - 0.5;
      float vig = 1.0 - dot(q, q) * uVignette * 1.85;
      c *= clamp(vig, 0.0, 1.0);

      // 9. 4x4 ordered dither at 1-LSB (1/255) to eliminate 8-bit sky banding
      float b2 = mod(2.0 * mod(gl_FragCoord.x, 2.0) + 3.0 * mod(gl_FragCoord.y, 2.0), 4.0);
      float b4 = 4.0 * b2
        + mod(2.0 * mod(floor(gl_FragCoord.x * 0.5), 2.0)
            + 3.0 * mod(floor(gl_FragCoord.y * 0.5), 2.0), 4.0);
      c += (b4 / 16.0 - 0.5) / 255.0;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

// Grade + atmosphere keys, aligned to the sky-tod keys (0 midnight, .20 dawn,
// .34 day, .54 midday, .76 evening, .96 night). Bloom thresholds sit near 1.0 in
// linear HDR so only emissives, sun and VFX bloom, not every lit wall. Night lifts
// exposure and keeps highlights warm so lanterns/windows read against moonlight.
const NIGHT_KEY = {
  bloomStrength: 0.42,
  bloomRadius: 0.6,
  bloomThreshold: 0.72,
  exposure: 1.0,
  saturation: 0.95,
  contrast: 1.06,
  lift: 0.012,
  warmHigh: [1.07, 0.98, 0.86],
  coolShadow: [0.8, 0.9, 1.16],
  vignette: 0.3,
  aerial: 0.002,
  heightFog: 0.0045,
  heightFalloff: 0.1,
  scatter: 0.35,
  scatterColor: [0.55, 0.68, 1.0],
  fogTint: [1.0, 1.0, 1.0],
};
const DAY_KEY = {
  bloomStrength: 0.28,
  bloomRadius: 0.55,
  bloomThreshold: 0.95,
  exposure: 1.0,
  saturation: 1.07,
  contrast: 1.06,
  lift: 0.004,
  warmHigh: [1.04, 1.01, 0.95],
  coolShadow: [0.92, 0.97, 1.06],
  vignette: 0.16,
  aerial: 0.0013,
  heightFog: 0.0016,
  heightFalloff: 0.08,
  scatter: 0.55,
  scatterColor: [1.0, 0.93, 0.8],
  fogTint: [1.0, 1.0, 1.0],
};

const GRADE_KEYS = [
  { t: 0.0, ...NIGHT_KEY },
  {
    // Dawn: low valley mist catching warm side light
    t: 0.2,
    bloomStrength: 0.34,
    bloomRadius: 0.62,
    bloomThreshold: 0.85,
    exposure: 1.06,
    saturation: 1.04,
    contrast: 1.05,
    lift: 0.01,
    warmHigh: [1.08, 0.99, 0.92],
    coolShadow: [0.88, 0.88, 1.08],
    vignette: 0.22,
    aerial: 0.0018,
    heightFog: 0.0075,
    heightFalloff: 0.12,
    scatter: 0.8,
    scatterColor: [1.0, 0.72, 0.55],
    fogTint: [0.8, 0.9, 1.15],
  },
  { t: 0.34, ...DAY_KEY },
  { t: 0.54, ...DAY_KEY, scatter: 0.45 },
  {
    // Golden hour: amber in-scattering toward the sun, violet shadows
    t: 0.76,
    bloomStrength: 0.36,
    bloomRadius: 0.62,
    bloomThreshold: 0.85,
    exposure: 1.03,
    saturation: 1.1,
    contrast: 1.08,
    lift: 0.008,
    warmHigh: [1.1, 0.98, 0.86],
    coolShadow: [0.9, 0.84, 1.08],
    vignette: 0.22,
    aerial: 0.0011,
    heightFog: 0.003,
    heightFalloff: 0.1,
    scatter: 0.75,
    scatterColor: [1.0, 0.62, 0.36],
    fogTint: [0.45, 0.62, 1.55],
  },
  { t: 0.96, ...NIGHT_KEY },
  { t: 1.0, ...NIGHT_KEY },
].map((k) => ({
  ...k,
  warmHigh: new THREE.Vector3(...k.warmHigh),
  coolShadow: new THREE.Vector3(...k.coolShadow),
  scatterColor: new THREE.Vector3(...k.scatterColor),
  fogTint: new THREE.Vector3(...k.fogTint),
}));

export function createWorldPost({
  renderer,
  scene,
  camera,
  width,
  height,
  enabled = true,
  bloomStrength = 0.14,
  bloomRadius = 0.48,
  bloomThreshold = 0.88,
  aaSamples = 4,
} = {}) {
  if (!renderer) throw new Error('createWorldPost: renderer is required');
  if (!scene) throw new Error('createWorldPost: scene is required');
  if (!camera) throw new Error('createWorldPost: camera is required');

  const canvasSize = renderer.getSize(new THREE.Vector2());
  let w = Math.max(1, Math.floor(Number(width) > 0 ? Number(width) : canvasSize.x || 1));
  let h = Math.max(1, Math.floor(Number(height) > 0 ? Number(height) : canvasSize.y || 1));

  const gl = typeof renderer.getContext === 'function' ? renderer.getContext() : null;
  const isWebGL2 =
    !!gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const halfFloatRenderable =
    isWebGL2 &&
    !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
  const targetType = halfFloatRenderable ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const toneMapInput = halfFloatRenderable;

  let active = enabled !== false;
  let contextLost = false;
  let degraded = false;
  let degradedReason = '';

  let aaCount =
    aaSamples === null || aaSamples === undefined
      ? isWebGL2
        ? 4
        : 0
      : Math.max(0, Math.min(8, Math.floor(Number(aaSamples) || 0)));

  const pixelRatio = Math.max(1, renderer.getPixelRatio() || 1);
  const renderTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.round(w * pixelRatio)),
    Math.max(1, Math.round(h * pixelRatio)),
    {
      type: targetType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: aaCount,
    }
  );
  renderTarget.texture.name = 'worldPostHdrTarget';
  // Resolved scene depth for the grade pass atmosphere (only attached when aaCount > 0 on desktop;
  // on mobile TBDR aaCount === 0 keeps the 24-bit depth buffer 100% inside on-chip Tile SRAM!).
  const desktopDepthTexture = new THREE.DepthTexture(
    Math.max(1, Math.round(w * pixelRatio)),
    Math.max(1, Math.round(h * pixelRatio))
  );
  desktopDepthTexture.type = THREE.UnsignedIntType;
  renderTarget.depthTexture = aaCount > 0 ? desktopDepthTexture : null;

  let composer = null;
  let renderPass = null;
  let gradePass = null;

  try {
    composer = new EffectComposer(renderer, renderTarget);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);

    renderPass = new RenderPass(scene, camera);

    gradePass = new ShaderPass(GradeShader);
    gradePass.material.toneMapped = false;
    gradePass.uniforms.uToneMap.value = toneMapInput ? 1.0 : 0.0;
    gradePass.uniforms.uEncode.value = 1.0;
    gradePass.uniforms.uAoTaps.value = aaCount <= 2 ? 4.0 : 8.0;

    composer.addPass(renderPass);
    composer.addPass(gradePass);

    applyIntegerTargetSizes();
  } catch (error) {
    degraded = true;
    degradedReason =
      'composer build failed: ' + (error && error.message ? error.message : String(error));
    composer = null;
    console.warn('[worldPost] post disabled — ' + degradedReason);
  }

  function applyIntegerTargetSizes() {
    if (!composer) return;
    const pr = Math.max(1, renderer.getPixelRatio() || 1);
    const ew = Math.max(1, Math.round(w * pr));
    const eh = Math.max(1, Math.round(h * pr));
    if (composer.renderTarget1) composer.renderTarget1.setSize(ew, eh);
    if (composer.renderTarget2) composer.renderTarget2.setSize(ew, eh);
    if (gradePass?.uniforms?.uTexelSize) {
      gradePass.uniforms.uTexelSize.value.set(1 / ew, 1 / eh);
    }
    const passes = composer.passes || [];
    for (let i = 0; i < passes.length; i++) {
      const pass = passes[i];
      if (pass && typeof pass.setSize === 'function') pass.setSize(ew, eh);
    }
  }

  let glowStrength = bloomStrength;
  let glowRadius = bloomRadius;
  let glowThreshold = bloomThreshold;

  // The Orton glow is a single add in the grade shader; keyed bloom strengths map at ~0.6x.
  function applyGlow() {
    if (!gradePass) return;
    gradePass.uniforms.uGlowStrength.value = glowStrength * 0.6;
    gradePass.uniforms.uGlowThreshold.value = glowThreshold;
  }

  function setTimeOfDayGrade(modeOrT) {
    let tt = 0.34;
    if (modeOrT === 'day') tt = 0.34;
    else if (modeOrT === 'evening') tt = 0.76;
    else if (modeOrT === 'night') tt = 0.96;
    else if (Number.isFinite(modeOrT)) tt = ((modeOrT % 1) + 1) % 1;

    let idx = 0;
    while (idx < GRADE_KEYS.length - 2 && GRADE_KEYS[idx + 1].t < tt) idx++;
    const a = GRADE_KEYS[idx];
    const b = GRADE_KEYS[idx + 1];
    const k = THREE.MathUtils.clamp((tt - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);

    glowStrength = THREE.MathUtils.lerp(a.bloomStrength, b.bloomStrength, k);
    glowRadius = THREE.MathUtils.lerp(a.bloomRadius, b.bloomRadius, k);
    glowThreshold = THREE.MathUtils.lerp(a.bloomThreshold, b.bloomThreshold, k);
    applyGlow();

    if (gradePass) {
      const u = gradePass.uniforms;
      u.uExposure.value = THREE.MathUtils.lerp(a.exposure, b.exposure, k);
      u.uSaturation.value = THREE.MathUtils.lerp(a.saturation, b.saturation, k);
      u.uContrast.value = THREE.MathUtils.lerp(a.contrast, b.contrast, k);
      u.uLift.value = THREE.MathUtils.lerp(a.lift, b.lift, k);
      u.uWarmHigh.value.copy(a.warmHigh).lerp(b.warmHigh, k);
      u.uCoolShadow.value.copy(a.coolShadow).lerp(b.coolShadow, k);
      u.uVignette.value = THREE.MathUtils.lerp(a.vignette, b.vignette, k);
      u.uHaze.value = 0.0;
      u.uAerialDensity.value = THREE.MathUtils.lerp(a.aerial, b.aerial, k);
      u.uHeightFogDensity.value = THREE.MathUtils.lerp(a.heightFog, b.heightFog, k);
      u.uHeightFogFalloff.value = THREE.MathUtils.lerp(a.heightFalloff, b.heightFalloff, k);
      u.uScatterStrength.value = THREE.MathUtils.lerp(a.scatter, b.scatter, k);
      u.uScatterColor.value.copy(a.scatterColor).lerp(b.scatterColor, k);
      u.uFogTint.value.copy(a.fogTint).lerp(b.fogTint, k);
    }
  }

  // Fog colour and light direction come from the sky so the haze always matches the horizon.
  let atmosphereEnabled = true;
  function setAtmosphere({ fogColor, lightDir, enabled: atmoOn = true } = {}) {
    if (!gradePass) return;
    const u = gradePass.uniforms;
    if (fogColor) u.uFogColor.value.copy(fogColor);
    if (lightDir) u.uSunDirW.value.copy(lightDir).normalize();
    atmosphereEnabled = atmoOn !== false;
  }

  function syncCameraUniforms() {
    if (!gradePass) return;
    const u = gradePass.uniforms;
    const activeDepthTex =
      aaCount > 0 ? composer?.readBuffer?.depthTexture || renderTarget.depthTexture || null : null;
    u.tDepth.value = activeDepthTex;
    u.uAtmosphere.value = atmosphereEnabled && activeDepthTex ? 1.0 : 0.0;
    if (activeDepthTex) {
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uCamWorld.value.copy(camera.matrixWorld);
      camera.getWorldPosition(u.uCamPos.value);
    }
  }

  setTimeOfDayGrade('day');

  function render(dt = 0) {
    if (!active || degraded || !composer) {
      renderer.render(scene, camera);
      return;
    }
    if (contextLost) return;

    try {
      syncCameraUniforms();
      composer.render(dt);
    } catch (error) {
      degraded = true;
      degradedReason =
        'composer render failed: ' + (error && error.message ? error.message : String(error));
      renderer.setRenderTarget(null);
      renderer.autoClear = true;
      console.warn('[worldPost] falling back to direct render — ' + degradedReason);
      renderer.render(scene, camera);
    }
  }

  function setSize(nextW, nextH) {
    const nw = Number(nextW);
    const nh = Number(nextH);
    if (!(nw > 0) || !(nh > 0)) return;
    w = Math.max(1, Math.floor(nw));
    h = Math.max(1, Math.floor(nh));
    if (!composer) return;
    const pr = Math.max(1, renderer.getPixelRatio() || 1);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    applyIntegerTargetSizes();
  }

  function setEnabled(next) {
    active = next !== false;
  }

  function setBloom(strength, radius, threshold) {
    if (Number.isFinite(strength)) glowStrength = strength;
    if (Number.isFinite(radius)) glowRadius = radius;
    if (Number.isFinite(threshold)) glowThreshold = threshold;
    applyGlow();
  }

  function setQuality({ aaSamples: nextAa } = {}) {
    if (Number.isFinite(nextAa)) {
      const nextCount = Math.max(0, Math.min(8, Math.floor(Number(nextAa) || 0)));
      if (nextCount !== aaCount) {
        aaCount = nextCount;
        for (const rt of [renderTarget, composer?.renderTarget1, composer?.renderTarget2]) {
          if (!rt) continue;
          rt.samples = aaCount;
          rt.depthTexture = aaCount > 0 ? desktopDepthTexture : null;
          rt.dispose();
        }
        applyIntegerTargetSizes();
      }
      if (gradePass?.uniforms?.uAoTaps) {
        gradePass.uniforms.uAoTaps.value = aaCount <= 2 ? 4.0 : 8.0;
      }
    }
  }

  function setSmiteMonochrome(weight = 0.0) {
    const w = THREE.MathUtils.clamp(Number(weight) || 0, 0, 1);
    if (gradePass?.uniforms?.uSmiteMonochrome) {
      gradePass.uniforms.uSmiteMonochrome.value = w;
    }
    if (GradeShader.uniforms?.uSmiteMonochrome) {
      GradeShader.uniforms.uSmiteMonochrome.value = w;
    }
    return w;
  }

  function dispose() {
    if (renderPass && typeof renderPass.dispose === 'function') renderPass.dispose();
    if (gradePass && typeof gradePass.dispose === 'function') gradePass.dispose();
    if (composer) composer.dispose();
    else if (renderTarget) renderTarget.dispose();
  }

  return {
    composer,
    render,
    setSize,
    setEnabled,
    setBloom,
    setQuality,
    setTimeOfDayGrade,
    setAtmosphere,
    setSmiteMonochrome,
    dispose,
    params: {
      get bloomStrength() {
        return glowStrength;
      },
      get bloomRadius() {
        return glowRadius;
      },
      get bloomThreshold() {
        return glowThreshold;
      },
      aaCount,
      grade: gradePass ? gradePass.uniforms : GradeShader.uniforms,
    },
  };
}

export default createWorldPost;
