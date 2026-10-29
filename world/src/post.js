// ============================================================================
// world/src/post.js
//
// 4x Hardware MSAA HalfFloat HDR RenderTarget -> RenderPass ->
// Restrained UnrealBloomPass (threshold = 0.86) -> Time-of-Day ACES GradeShader.
// ============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.02 },
    uToneMap: { value: 1.0 },
    uEncode: { value: 1.0 },
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.08 },
    uLift: { value: 0.008 },
    uWarmHigh: { value: new THREE.Vector3(1.03, 1.00, 0.96) },
    uCoolShadow: { value: new THREE.Vector3(0.94, 0.98, 1.05) },
    uVignette: { value: 0.22 },
    uHaze: { value: 0.004 },
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
    uniform float uExposure;
    uniform float uToneMap;
    uniform float uEncode;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uLift;
    uniform vec3 uWarmHigh;
    uniform vec3 uCoolShadow;
    uniform float uVignette;
    uniform float uHaze;

    varying vec2 vUv;

    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }

    vec3 acesFilmic(vec3 color) {
      const mat3 ACESInputMat = mat3(
        vec3(0.59719, 0.07600, 0.02840),
        vec3(0.35458, 0.90834, 0.13383),
        vec3(0.04823, 0.01566, 0.83777)
      );
      const mat3 ACESOutputMat = mat3(
        vec3(1.60475, -0.10208, -0.00327),
        vec3(-0.53108, 1.10813, -0.07276),
        vec3(-0.07367, -0.00605, 1.07602)
      );

      color *= uExposure / 0.6;
      color = ACESInputMat * color;
      color = RRTAndODTFit(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }

    vec3 linearToSRGB(vec3 c) {
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
      return mix(lo, hi, step(vec3(0.0031308), c));
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // Guard against NaN / Inf from any custom shader
      vec3 bounded = clamp(c, vec3(0.0), vec3(64.0));
      c = all(equal(bounded, bounded)) ? bounded : vec3(0.0);

      if (uToneMap > 0.5) c = acesFilmic(c);
      if (uEncode > 0.5) c = linearToSRGB(c);

      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));

      // Gentle saturation boost
      c = mix(vec3(l), c, uSaturation);

      // Soft contrast around 0.48 pivot
      c = (c - 0.48) * uContrast + 0.48;

      // Time-of-day split tone: warm highlights & cool shadows
      float hi = smoothstep(0.42, 1.0, l);
      float lo = 1.0 - smoothstep(0.0, 0.58, l);
      c *= mix(vec3(1.0), uWarmHigh, hi);
      c *= mix(vec3(1.0), uCoolShadow, lo);

      // Shadow lift so nights stay rich sapphire-slate rather than crushed black
      c += uLift * (1.0 - smoothstep(0.0, 0.38, l));

      // Subtle atmospheric midtone air
      float haze = smoothstep(0.05, 0.45, l) * (1.0 - smoothstep(0.72, 1.0, l));
      c = mix(c, vec3(0.88, 0.93, 1.0), haze * uHaze);

      // Gentle radial vignette
      vec2 q = vUv - 0.5;
      float vig = 1.0 - dot(q, q) * uVignette * 2.0;
      c *= clamp(vig, 0.0, 1.0);

      // 4x4 ordered dither at 1-LSB (1/255) to eliminate 8-bit sky banding
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
    bloomStrength: 0.32,
    bloomRadius: 0.52,
    bloomThreshold: 0.86,
    exposure: 1.00,
    saturation: 1.14,
    contrast: 1.12,
    lift: 0.018,
    warmHigh: [1.05, 1.01, 0.96],
    coolShadow: [0.88, 0.95, 1.10],
    vignette: 0.28,
    haze: 0.005,
  },
  {
    t: 0.22,
    bloomStrength: 0.20,
    bloomRadius: 0.52,
    bloomThreshold: 0.86,
    exposure: 1.01,
    saturation: 1.14,
    contrast: 1.09,
    lift: 0.010,
    warmHigh: [1.05, 0.99, 0.94],
    coolShadow: [0.93, 0.96, 1.06],
    vignette: 0.24,
    haze: 0.005,
  },
  {
    // Day (t = 0.34)
    t: 0.34,
    bloomStrength: 0.16,
    bloomRadius: 0.52,
    bloomThreshold: 0.86,
    exposure: 1.02,
    saturation: 1.12,
    contrast: 1.08,
    lift: 0.006,
    warmHigh: [1.03, 1.00, 0.96],
    coolShadow: [0.94, 0.98, 1.05],
    vignette: 0.20,
    haze: 0.004,
  },
  {
    t: 0.55,
    bloomStrength: 0.16,
    bloomRadius: 0.52,
    bloomThreshold: 0.86,
    exposure: 1.02,
    saturation: 1.12,
    contrast: 1.08,
    lift: 0.006,
    warmHigh: [1.03, 1.00, 0.96],
    coolShadow: [0.94, 0.98, 1.05],
    vignette: 0.20,
    haze: 0.004,
  },
  {
    // Evening (t = 0.76)
    t: 0.76,
    bloomStrength: 0.24,
    bloomRadius: 0.52,
    bloomThreshold: 0.86,
    exposure: 1.01,
    saturation: 1.16,
    contrast: 1.11,
    lift: 0.014,
    warmHigh: [1.07, 0.98, 0.91],
    coolShadow: [0.92, 0.92, 1.08],
    vignette: 0.25,
    haze: 0.006,
  },
  {
    // Night (t = 0.96)
    t: 0.96,
    bloomStrength: 0.32,
    bloomRadius: 0.52,
    bloomThreshold: 0.86,
    exposure: 1.00,
    saturation: 1.14,
    contrast: 1.12,
    lift: 0.018,
    warmHigh: [1.05, 1.01, 0.96],
    coolShadow: [0.88, 0.95, 1.10],
    vignette: 0.28,
    haze: 0.005,
  },
  {
    t: 1.00,
    bloomStrength: 0.32,
    bloomRadius: 0.52,
    bloomThreshold: 0.86,
    exposure: 1.00,
    saturation: 1.14,
    contrast: 1.12,
    lift: 0.018,
    warmHigh: [1.05, 1.01, 0.96],
    coolShadow: [0.88, 0.95, 1.10],
    vignette: 0.28,
    haze: 0.005,
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
  bloomStrength = 0.16,
  bloomRadius = 0.52,
  bloomThreshold = 0.86,
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
    setTimeOfDayGrade,
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
