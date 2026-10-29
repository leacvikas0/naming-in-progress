// Sunpetal Vale — post-processing chain for the anime meadow background.
//
// Contract (see handoff/map-bg/SPEC.md):
//   createMeadowPost({ renderer, scene, camera, width, height, enabled })
//     => { composer, render(dt), setSize(w, h), setEnabled(bool), dispose() }
//
// Chain: RenderPass -> UnrealBloomPass -> final grade ShaderPass.
//
// Colour pipeline (important):
//   * This module never owns the renderer. It never calls renderer.setSize()
//     and never touches renderer.toneMapping / outputColorSpace.
//   * EffectComposer renders the scene into a linear HDR target. three only
//     applies tone mapping when drawing to the canvas, so the buffer the grade
//     pass reads is scene-referred linear HDR — bloom therefore thresholds on
//     real linear luminance.
//   * The grade pass is last and performs the display conversion itself:
//     exposure -> ACES filmic (same fit as three's ACESFilmicToneMapping) ->
//     sRGB encode -> grade in sRGB space. That keeps the grade "after the
//     OutputPass-style conversion" and guarantees no double conversion. Do not
//     add an OutputPass after this composer.
//   * With enabled === false the chain is bypassed entirely and
//     renderer.render(scene, camera) is used, which applies the renderer's own
//     ACES + sRGB. Both paths therefore look the same.
//
// Robustness (why the composer can never leave a black canvas):
//   * The HDR target type is probed. RGBA16F is only renderable on WebGL2 with
//     EXT_color_buffer_half_float / EXT_color_buffer_float; on a driver that
//     lacks it an incomplete framebuffer makes the whole composer path black
//     while renderer.render() still looks fine. We fall back to an 8-bit
//     target and skip the filmic curve (the buffer is already clamped LDR).
//   * composer.render() is wrapped: if a pass ever throws, the chain disables
//     itself permanently and the frame falls back to renderer.render().
//   * Sizes fall back to the renderer's drawing-buffer size when the caller
//     passes 0/undefined, and the composer's targets are kept at integer
//     pixels (a fractional devicePixelRatio such as 1.25 otherwise leaves
//     1279.99-pixel targets behind).
//   * The grade shader guards against NaN/Inf leaking out of a custom scene
//     shader and being smeared across the screen by the bloom blur.
//   * After a WebGL context restore the renderer state and targets are reset.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

/* ------------------------------------------------------------------------- */
/* grade shader                                                              */
/* ------------------------------------------------------------------------- */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uToneMap: { value: 1.0 }, // 1 = ACES (HDR input), 0 = already-LDR input
    uEncode: { value: 1.0 }, // 1 = linear->sRGB, 0 = buffer already display-referred
    uSaturation: { value: 1.34 },
    uContrast: { value: 1.26 },
    uLift: { value: 0.0 },
    // Effectively neutral: the warmth comes from the sun, not from the grade.
    // Keep every channel within +-0.006 of 1.0 or the meadow goes cream.
    uWarmHigh: { value: new THREE.Vector3(1.045, 1.0, 0.952) },
    // Gentler than it was, so shadows stay blue-green and never go cyan.
    uCoolShadow: { value: new THREE.Vector3(0.900, 0.980, 1.075) },
    uVignette: { value: 0.34 },
    // Strength of the lavender-white atmospheric haze. A uniform so a style
    // preset can push it (the "hazy" look) without editing the shader.
    uHaze: { value: 0.004 },
    // 0 = smooth, 1 = hard graphic bands. Quantises the display-referred image,
    // so it bands COLOUR rather than luminance and keeps the hue.
    uPosterize: { value: 0.0 },
    // Screen-space outline. Needs a depth texture handed in by the host
    // (styles.html renders one per pane for the "Ink" look). uOutline = 0 is a
    // no-op, so the normal preview path never pays for it.
    tDepth: { value: null },
    uOutline: { value: 0.0 },
    uOutlineColor: { value: new THREE.Vector3(0.16, 0.12, 0.2) },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    uCamNear: { value: 0.1 },
    uCamFar: { value: 700 },
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
    uniform float uPosterize;
    uniform sampler2D tDepth;
    uniform float uOutline;
    uniform vec3 uOutlineColor;
    uniform vec2 uTexel;
    uniform float uCamNear;
    uniform float uCamFar;

    varying vec2 vUv;

    // --- ACES filmic, identical fit to three's ACESFilmicToneMapping ------
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

    // --- linear -> sRGB transfer function --------------------------------
    vec3 linearToSRGB(vec3 c) {
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
      return mix(lo, hi, step(vec3(0.0031308), c));
    }

    // Positive view-space distance for a window-space depth value.
    float viewDistance(float d) {
      float ndc = d * 2.0 - 1.0;
      return (2.0 * uCamNear * uCamFar) / (uCamFar + uCamNear - ndc * (uCamFar - uCamNear));
    }

    void main() {
      // Scene-referred linear HDR coming out of the bloom chain.
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // A single NaN/Inf pixel would otherwise be smeared over the whole
      // frame by the bloom blur and turn the canvas black. clamp() catches
      // infinities; NaN is never equal to itself, so the all(equal()) test
      // catches that without an isnan() intrinsic.
      vec3 bounded = clamp(c, vec3(0.0), vec3(64.0));
      c = all(equal(bounded, bounded)) ? bounded : vec3(0.0);

      // Display conversion happens here, once.
      if (uToneMap > 0.5) c = acesFilmic(c);
      if (uEncode > 0.5) c = linearToSRGB(c);

      // ---- grade, in sRGB space -----------------------------------------
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));

      // Saturation: gentle, and never clip the greens.
      c = mix(vec3(l), c, uSaturation);

      // Contrast around a slightly-below-mid pivot so the meadow keeps its
      // airy high-key feel instead of going crunchy.
      c = (c - 0.48) * uContrast + 0.48;

      // Split tone: warm highlights, cool shadows. Multiplicative so the
      // overall exposure stays put.
      float hi = smoothstep(0.42, 1.0, l);
      float lo = 1.0 - smoothstep(0.0, 0.58, l);
      c *= mix(vec3(1.0), uWarmHigh, hi);
      c *= mix(vec3(1.0), uCoolShadow, lo);

      // A touch of lift in the blacks keeps the shadows blue-green, not black.
      c += uLift * (1.0 - smoothstep(0.0, 0.35, l));

      // Lavender-white dreamy haze, not cream: blue is its largest channel.
      // Strongest in the airy midtones, gone in the darkest and brightest
      // pixels, so it reads as air rather than as a filter.
      float haze = smoothstep(0.05, 0.45, l) * (1.0 - smoothstep(0.72, 1.0, l));
      c = mix(c, vec3(0.88, 0.93, 1.0), haze * uHaze);

      // Graphic posterise. Levels go from 64 (invisible) to 7 (hard bands).
      if (uPosterize > 0.001) {
        float levels = mix(64.0, 7.0, clamp(uPosterize, 0.0, 1.0));
        c = floor(c * levels + 0.5) / levels;
      }

      // Gentle radial vignette (no grain, no chromatic aberration).
      vec2 q = vUv - 0.5;
      float vig = 1.0 - dot(q, q) * uVignette * 2.0;
      c *= clamp(vig, 0.0, 1.0);

      // Screen-space outline from a depth texture, if the host supplied one.
      //
      // Two tests, OR'd:
      //
      //  1. SKY SILHOUETTE (the main one). The sky dome writes no depth, so the
      //     background stays at the clear value and "is this pixel sky" is an
      //     exact test. An edge is a non-sky pixel with a sky neighbour, which
      //     gives a clean 1-texel contour on trees, hills and clouds -- and it
      //     can never fire inside a bush, because no grass pixel is ever
      //     adjacent to sky.
      //
      //  2. BIG DEPTH GAP. Object against object, e.g. a tree in front of a
      //     hill. The gate is deliberately enormous (12 m+): a depth-jump test
      //     with a small threshold inks every dense clump of flowers solid,
      //     because a bush has 5 m of depth variation inside itself.
      if (uOutline > 0.001) {
        vec2 px = uTexel;
        float d0 = texture2D(tDepth, vUv).x;
        float dl = texture2D(tDepth, vUv - vec2(px.x, 0.0)).x;
        float dr = texture2D(tDepth, vUv + vec2(px.x, 0.0)).x;
        float du = texture2D(tDepth, vUv + vec2(0.0, px.y)).x;
        float dd = texture2D(tDepth, vUv - vec2(0.0, px.y)).x;

        float isSky = step(0.9999, d0);
        float nbrSky = max(max(step(0.9999, dl), step(0.9999, dr)),
                           max(step(0.9999, du), step(0.9999, dd)));
        float edgeSky = (1.0 - isSky) * nbrSky;

        float z0 = viewDistance(d0);
        float jump = max(max(abs(z0 - viewDistance(dl)), abs(z0 - viewDistance(dr))),
                         max(abs(z0 - viewDistance(du)), abs(z0 - viewDistance(dd))));
        float edgeGap = smoothstep(12.0, 20.0, jump);

        float edge = max(edgeSky, edgeGap);
        c = mix(c, uOutlineColor, edge * uOutline);
      }

      // 4x4 ordered dither at exactly one 8-bit LSB.
      //
      // The sky dome and the haze are long, almost-flat gradients, and the
      // canvas is 8-bit: without this they quantise into visible bands. A
      // triangular/ordered dither at 1/255 is below the eye's threshold on a
      // gradient but breaks the contour lines. It is not film grain -- the
      // amplitude is one code value, and the pattern is fixed to the pixel grid
      // so it never shimmers in motion.
      float b2 = mod(2.0 * mod(gl_FragCoord.x, 2.0) + 3.0 * mod(gl_FragCoord.y, 2.0), 4.0);
      float b4 = 4.0 * b2
        + mod(2.0 * mod(floor(gl_FragCoord.x * 0.5), 2.0)
            + 3.0 * mod(floor(gl_FragCoord.y * 0.5), 2.0), 4.0);
      c += (b4 / 16.0 - 0.5) / 255.0;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

/* ------------------------------------------------------------------------- */
/* factory                                                                   */
/* ------------------------------------------------------------------------- */

export function createMeadowPost({
  renderer,
  scene,
  camera,
  width,
  height,
  enabled = true,
  // Tunables kept in one place; the defaults are the look we settled on.
  // Bloom threshold operates on the LINEAR HDR buffer. Round 2 raised it from
  // 0.62: at 0.62 the pale horizon band and the ridge tops sat above the
  // threshold, so bloom lifted the whole skyline into a white wall and put a
  // ~150 px halo around the top cloud. 0.72 leaves only the cloud tops and the
  // brightest petal edges glowing.
  bloomStrength = 0.22,
  bloomRadius = 0.58,
  bloomThreshold = 0.80,
  // Multisample count for the composer's scene target. null = auto (4 on
  // WebGL2). 0 disables it, which is handy for an A/B screenshot or a weak GPU.
  aaSamples = null,
  // The composer target is linear HDR: three only applies tone mapping when
  // drawing to the canvas (WebGLPrograms: toneMapping is NoToneMapping while a
  // render target is bound), so every material -- terrain, sky dome, clouds and
  // the ported custom shaders alike -- writes scene-referred linear into it.
  // The grade then applies ACES exactly once and encodes to sRGB.
  //
  // displayReferred is only for a host that hands the composer an already
  // display-referred buffer; the meadow never does. index.js passes false.
  displayReferred = true,
} = {}) {
  if (!renderer) throw new Error("createMeadowPost: renderer is required");
  if (!scene) throw new Error("createMeadowPost: scene is required");
  if (!camera) throw new Error("createMeadowPost: camera is required");

  /* ---- size ---------------------------------------------------------- */

  // Never trust a 0/undefined width: a 1x1 composer would render a single
  // stretched pixel. Fall back to whatever the renderer's canvas already is.
  const canvasSize = renderer.getSize(new THREE.Vector2());
  let w = Math.max(1, Math.floor(Number(width) > 0 ? Number(width) : canvasSize.x || 1));
  let h = Math.max(1, Math.floor(Number(height) > 0 ? Number(height) : canvasSize.y || 1));

  /* ---- target type ---------------------------------------------------- */

  const gl = typeof renderer.getContext === "function" ? renderer.getContext() : null;
  const isWebGL2 =
    !!gl && typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  const halfFloatRenderable =
    isWebGL2 &&
    !!(gl.getExtension("EXT_color_buffer_half_float") || gl.getExtension("EXT_color_buffer_float"));
  const targetType = halfFloatRenderable ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const toneMapInput = halfFloatRenderable;

  let active = enabled !== false;
  let contextLost = false;
  let degraded = false;
  let degradedReason = "";

  /* ---- composer ------------------------------------------------------- */

  // Real multisample anti-aliasing.
  //
  // `new WebGLRenderer({ antialias: true })` only multisamples the DEFAULT
  // framebuffer. With a composer the scene is drawn into an offscreen target,
  // and an offscreen target is single-sampled unless `samples` is set -- so
  // before this the whole meadow was rendered aliased and the renderer's
  // `antialias` flag was pure decoration. 4x MSAA is hardware AA on every
  // geometric silhouette (grass blades, leaf cards, cloud edges, path ribbon)
  // for the cost of one resolve per frame. It is the single largest smoothness
  // win available here; no FXAA/SMAA filter reproduces it, and a filter would
  // soften the cel edges we want to keep crisp.
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
    { type: targetType, depthBuffer: true, stencilBuffer: false, samples: aaCount }
  );
  renderTarget.texture.name = "meadowPostTarget";
  if (displayReferred) {
    // Built-in materials (terrain, water) then get ACES + sRGB encode applied by
    // the renderer on the way into the target, matching the plain-render path.
    renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
  }

  let composer = null;
  let renderPass = null;
  let bloomPass = null;
  let gradePass = null;

  try {
    composer = new EffectComposer(renderer, renderTarget);
    composer.setSize(w, h);

    renderPass = new RenderPass(scene, camera);

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      bloomStrength,
      bloomRadius,
      bloomThreshold
    );

    gradePass = new ShaderPass(GradeShader);
    // The grade shader does its own conversion; keep three from injecting
    // tone-mapping defines into it.
    gradePass.material.toneMapped = false;
    gradePass.uniforms.uToneMap.value = displayReferred ? 0 : toneMapInput ? 1 : 0;
    gradePass.uniforms.uEncode.value = displayReferred ? 0 : 1;

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(gradePass);

    // Keep every buffer on integer pixels. A fractional devicePixelRatio
    // (1.25, or Playwright's 0.9999999) otherwise leaves 1279.9999-wide
    // targets behind, which some drivers handle badly.
    applyIntegerTargetSizes();
  } catch (error) {
    // Any failure while building the chain must not take the scene down.
    degraded = true;
    degradedReason = "composer build failed: " + (error && error.message ? error.message : String(error));
    composer = null;
    console.warn("[meadowPost] post disabled — " + degradedReason);
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
      if (pass && typeof pass.setSize === "function") pass.setSize(ew, eh);
    }
  }

  /* ---- context loss ---------------------------------------------------- */

  const canvas = renderer.domElement || null;

  function onContextLost(event) {
    // Preventing the default lets the browser restore the context.
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    contextLost = true;
  }

  function onContextRestored() {
    contextLost = false;
    // three re-creates its GL objects lazily; put the renderer back into the
    // state the next composer.render() expects.
    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    if (composer) {
      applyIntegerTargetSizes();
      composer.setSize(w, h);
      applyIntegerTargetSizes();
    }
  }

  if (canvas && typeof canvas.addEventListener === "function") {
    canvas.addEventListener("webglcontextlost", onContextLost, false);
    canvas.addEventListener("webglcontextrestored", onContextRestored, false);
  }

  /* ---- public API ------------------------------------------------------ */

  function render(dt = 0) {
    // Degrade to a plain render when disabled, unavailable or context-lost.
    if (!active || degraded || !composer) {
      renderer.render(scene, camera);
      return;
    }
    if (contextLost) return;

    // Follow the host's exposure without owning it.
    const exposure =
      typeof renderer.toneMappingExposure === "number" ? renderer.toneMappingExposure : 1.0;
    gradePass.uniforms.uExposure.value = exposure;

    try {
      composer.render(dt);
    } catch (error) {
      // A pass threw (bad program, lost context mid-frame, ...). Never leave
      // the canvas black: drop the chain and render plainly from now on.
      degraded = true;
      degradedReason = "composer render failed: " + (error && error.message ? error.message : String(error));
      renderer.setRenderTarget(null);
      renderer.autoClear = true;
      console.warn("[meadowPost] falling back to direct render — " + degradedReason);
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
    // Re-sync the composer with the renderer's current pixel ratio.
    const pr = Math.max(1, renderer.getPixelRatio() || 1);
    if (composer._pixelRatio !== pr) composer.setPixelRatio(pr);
    composer.setSize(w, h);
    applyIntegerTargetSizes();
  }

  function setEnabled(next) {
    active = next !== false;
  }

  // Live bloom control, for the style comparison page. UnrealBloomPass reads
  // these three fields directly every frame, so writing them is enough.
  function setBloom(strength, radius, threshold) {
    if (!bloomPass) return;
    if (Number.isFinite(strength)) bloomPass.strength = strength;
    if (Number.isFinite(radius)) bloomPass.radius = radius;
    if (Number.isFinite(threshold)) bloomPass.threshold = threshold;
  }

  function dispose() {
    if (canvas && typeof canvas.removeEventListener === "function") {
      canvas.removeEventListener("webglcontextlost", onContextLost, false);
      canvas.removeEventListener("webglcontextrestored", onContextRestored, false);
    }
    if (renderPass && typeof renderPass.dispose === "function") renderPass.dispose();
    if (bloomPass && typeof bloomPass.dispose === "function") bloomPass.dispose();
    if (gradePass && typeof gradePass.dispose === "function") gradePass.dispose();
    if (composer) composer.dispose();
    else if (renderTarget) renderTarget.dispose();
  }

  return {
    composer,
    render,
    setSize,
    setEnabled,
    setBloom,
    dispose,
    // Additive, for HUD / debugging. The contract keys above are what the host uses.
    // `grade` is the LIVE uniform set (ShaderPass clones the shader template, so
    // exposing GradeShader.uniforms here would silently tune nothing).
    params: {
      bloomStrength,
      bloomRadius,
      bloomThreshold,
      aaCount,
      grade: gradePass ? gradePass.uniforms : GradeShader.uniforms,
    },
    diagnostics: {
      get degraded() {
        return degraded;
      },
      get reason() {
        return degradedReason;
      },
      targetType: halfFloatRenderable ? "HalfFloat" : "UnsignedByte",
      toneMapInput,
      aaCount,
      size: [w, h],
      pixelRatio,
    },
  };
}

export default createMeadowPost;
