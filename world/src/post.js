// ============================================================================
// world/src/post.js
//
// 4x Hardware MSAA HalfFloat HDR RenderTarget -> RenderPass ->
// Restrained UnrealBloomPass (threshold = 0.88) ->
// Screen-Space Crevice & Contact Cavity AO + AgX-Inspired Filmic GradeShader.
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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
    uCavityStrength: { value: 0.34 },
    uAoTaps: { value: 8.0 },
    uWarmHigh: { value: new THREE.Vector3(1.04, 1.00, 0.94) },
    uCoolShadow: { value: new THREE.Vector3(0.88, 0.94, 1.06) },
    uVignette: { value: 0.22 },
    uHaze: { value: 0.018 },
    uSmiteMonochrome: { value: 0.0 },
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

    varying vec2 vUv;

    float lumaLin(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    /**
     * Directional Luma-Edge FXAA (operates in linear HDR before tone-mapping):
     * Complements 4x hardware MSAA by smoothing shader-generated edges (cel-shading steps,
     * water specular glints, roof tile ridges, and outline silhouettes) without blurring foliage.
     */
    vec3 sampleFXAALinear(vec2 uv) {
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
     * Multi-radius Golden-Angle Screen-Space Crevice & Contact AO:
     * Uses 8 taps on Desktop and 4 taps on Tablet (uAoTaps) to save 50% mobile memory bandwidth.
     */
    float evalScreenCavityAO(vec2 uv, float centerLuma) {
      if (uCavityStrength <= 0.001) return 0.0;
      const vec2 dirs[8] = vec2[8](
        vec2( 0.9659,  0.2588),
        vec2(-0.7071,  0.7071),
        vec2(-0.2588, -0.9659),
        vec2( 0.8660, -0.5000),
        vec2(-0.9659, -0.2588),
        vec2( 0.2588,  0.9659),
        vec2( 0.5000, -0.8660),
        vec2(-0.5000,  0.8660)
      );

      float occ = 0.0;
      float tapCount = uAoTaps > 6.0 ? 8.0 : 4.0;
      for (int i = 0; i < 8; i++) {
        if (float(i) >= tapCount) break;
        float rPx = (i < 2 || (i >= 4 && i < 6)) ? 1.65 : 4.25;
        vec2 sampleUv = clamp(uv + dirs[i] * uTexelSize * rPx, 0.001, 0.999);
        vec3 sCol = clamp(texture2D(tDiffuse, sampleUv).rgb, vec3(0.0), vec3(8.0));
        float sLuma = lumaLin(sCol);
        float diff = sLuma - centerLuma;
        float weight = smoothstep(0.015, 0.22, diff) * (1.0 - smoothstep(0.35, 0.85, diff));
        occ += weight;
      }
      occ = (occ / tapCount) * (1.0 - smoothstep(0.45, 0.95, centerLuma));
      return clamp(occ * uCavityStrength * 1.65, 0.0, 0.38);
    }

    /**
     * AgX-Inspired Inset Filmic Tone-Mapping with Soft Path-to-White Rolloff:
     * Preserves true midtone pigment hues (weathered terracotta, sage-emerald,
     * wisteria violet) without ACES's radioactive orange/lime skew, while rolling
     * bright sunlight highlights smoothly into warm ivory.
     */
    vec3 filmicAgX(vec3 color) {
      vec3 v = max(color * (uExposure * 1.18), vec3(0.0));

      // Subtle AgX chroma inset so intense highlights desaturate naturally toward warm white
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

      // Rational filmic S-curve with gentle toe and soft highlight shoulder
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
      vec3 c = sampleFXAALinear(vUv);

      // Guard against NaN / Inf from any custom shader
      vec3 bounded = clamp(c, vec3(0.0), vec3(64.0));
      c = all(equal(bounded, bounded)) ? bounded : vec3(0.0);
      vec3 linPreGrade = c;

      // 1. Screen-Space Crevice & Contact Ambient Occlusion in linear space
      float linLuma = lumaLin(c);
      float cavityAO = evalScreenCavityAO(vUv, linLuma);
      vec3 aoTint = mix(vec3(1.0), vec3(0.58, 0.66, 0.84), cavityAO);
      c *= aoTint * (1.0 - cavityAO * 0.58);

      // 1B. Painterly Orton Highlight Halation & Luminous Anime Glow (Option 4 + Option 2)
      float highlightMask = smoothstep(0.42, 1.15, linLuma);
      vec3 ortonGlow = c * vec3(1.06, 1.02, 0.94) * highlightMask * 0.14;
      c += ortonGlow;

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

      // 7. Gentle horizon & upper-sky spring atmospheric air perspective
      float verticalAir = smoothstep(0.32, 0.82, vUv.y) * smoothstep(0.12, 0.62, l) * (1.0 - smoothstep(0.75, 1.0, l));
      c = mix(c, vec3(0.86, 0.94, 1.0), verticalAir * uHaze);

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

const GRADE_KEYS = [
  {
    t: 0.00,
    bloomStrength: 0.30,
    bloomRadius: 0.62,
    bloomThreshold: 0.68,
    exposure: 0.99,
    saturation: 1.07,
    contrast: 1.09,
    lift: 0.014,
    warmHigh: [1.04, 1.01, 0.96],
    coolShadow: [0.84, 0.92, 1.12],
    vignette: 0.24,
    haze: 0.016,
  },
  {
    t: 0.22,
    bloomStrength: 0.24,
    bloomRadius: 0.64,
    bloomThreshold: 0.62,
    exposure: 1.00,
    saturation: 1.08,
    contrast: 1.08,
    lift: 0.008,
    warmHigh: [1.05, 1.00, 0.93],
    coolShadow: [0.88, 0.94, 1.08],
    vignette: 0.20,
    haze: 0.020,
  },
  {
    // Day (t = 0.34) — Option 4 Crystal Ethereal Sanctuary + Option 2 Pearlescent Mist
    t: 0.34,
    bloomStrength: 0.22,
    bloomRadius: 0.64,
    bloomThreshold: 0.60,
    exposure: 1.01,
    saturation: 1.08,
    contrast: 1.09,
    lift: 0.006,
    warmHigh: [1.05, 1.01, 0.94],
    coolShadow: [0.85, 0.93, 1.09],
    vignette: 0.18,
    haze: 0.022,
  },
  {
    t: 0.55,
    bloomStrength: 0.22,
    bloomRadius: 0.64,
    bloomThreshold: 0.60,
    exposure: 1.01,
    saturation: 1.08,
    contrast: 1.09,
    lift: 0.006,
    warmHigh: [1.05, 1.01, 0.94],
    coolShadow: [0.85, 0.93, 1.09],
    vignette: 0.18,
    haze: 0.022,
  },
  {
    // Evening (t = 0.76) — Option 3 Golden-Hour Pastoral Romance
    t: 0.76,
    bloomStrength: 0.26,
    bloomRadius: 0.65,
    bloomThreshold: 0.58,
    exposure: 1.00,
    saturation: 1.09,
    contrast: 1.10,
    lift: 0.010,
    warmHigh: [1.08, 0.98, 0.90],
    coolShadow: [0.86, 0.89, 1.10],
    vignette: 0.22,
    haze: 0.024,
  },
  {
    // Night (t = 0.96)
    t: 0.96,
    bloomStrength: 0.30,
    bloomRadius: 0.62,
    bloomThreshold: 0.68,
    exposure: 0.99,
    saturation: 1.07,
    contrast: 1.09,
    lift: 0.014,
    warmHigh: [1.04, 1.01, 0.96],
    coolShadow: [0.84, 0.92, 1.12],
    vignette: 0.24,
    haze: 0.016,
  },
  {
    t: 1.00,
    bloomStrength: 0.30,
    bloomRadius: 0.62,
    bloomThreshold: 0.68,
    exposure: 0.99,
    saturation: 1.07,
    contrast: 1.09,
    lift: 0.014,
    warmHigh: [1.04, 1.01, 0.96],
    coolShadow: [0.84, 0.92, 1.12],
    vignette: 0.24,
    haze: 0.016,
  },
].map((k) => ({
  ...k,
  warmHigh: new THREE.Vector3(...k.warmHigh),
  coolShadow: new THREE.Vector3(...k.coolShadow),
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

  const aaCount =
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

  let composer = null;
  let renderPass = null;
  let bloomPass = null;
  let gradePass = null;

  try {
    composer = new EffectComposer(renderer, renderTarget);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);

    renderPass = new RenderPass(scene, camera);

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      bloomStrength,
      bloomRadius,
      bloomThreshold
    );

    gradePass = new ShaderPass(GradeShader);
    gradePass.material.toneMapped = false;
    gradePass.uniforms.uToneMap.value = toneMapInput ? 1.0 : 0.0;
    gradePass.uniforms.uEncode.value = 1.0;
    gradePass.uniforms.uAoTaps.value = aaCount <= 2 ? 4.0 : 8.0;

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
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

    const bStrength = THREE.MathUtils.lerp(a.bloomStrength, b.bloomStrength, k);
    const bRadius = THREE.MathUtils.lerp(a.bloomRadius, b.bloomRadius, k);
    const bThreshold = THREE.MathUtils.lerp(a.bloomThreshold, b.bloomThreshold, k);

    if (bloomPass) {
      bloomPass.strength = bStrength;
      bloomPass.radius = bRadius;
      bloomPass.threshold = bThreshold;
    }

    if (gradePass) {
      const u = gradePass.uniforms;
      u.uExposure.value = THREE.MathUtils.lerp(a.exposure, b.exposure, k);
      u.uSaturation.value = THREE.MathUtils.lerp(a.saturation, b.saturation, k);
      u.uContrast.value = THREE.MathUtils.lerp(a.contrast, b.contrast, k);
      u.uLift.value = THREE.MathUtils.lerp(a.lift, b.lift, k);
      u.uWarmHigh.value.copy(a.warmHigh).lerp(b.warmHigh, k);
      u.uCoolShadow.value.copy(a.coolShadow).lerp(b.coolShadow, k);
      u.uVignette.value = THREE.MathUtils.lerp(a.vignette, b.vignette, k);
      u.uHaze.value = THREE.MathUtils.lerp(a.haze, b.haze, k);
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
    if (!bloomPass) return;
    if (Number.isFinite(strength)) bloomPass.strength = strength;
    if (Number.isFinite(radius)) bloomPass.radius = radius;
    if (Number.isFinite(threshold)) bloomPass.threshold = threshold;
  }

  function setQuality({ aaSamples: nextAa } = {}) {
    if (gradePass?.uniforms?.uAoTaps && Number.isFinite(nextAa)) {
      gradePass.uniforms.uAoTaps.value = nextAa <= 2 ? 4.0 : 8.0;
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
    if (bloomPass && typeof bloomPass.dispose === 'function') bloomPass.dispose();
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
    setSmiteMonochrome,
    dispose,
    params: {
      get bloomStrength() {
        return bloomPass ? bloomPass.strength : bloomStrength;
      },
      get bloomRadius() {
        return bloomPass ? bloomPass.radius : bloomRadius;
      },
      get bloomThreshold() {
        return bloomPass ? bloomPass.threshold : bloomThreshold;
      },
      aaCount,
      grade: gradePass ? gradePass.uniforms : GradeShader.uniforms,
    },
  };
}

export default createWorldPost;
