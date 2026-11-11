// ============================================================================
// world/src/perf/mali-g68-emulator.js
//
// Conservative ARM Valhall `Mali-G68 MC4` Hardware Roofline & Cycle Emulator
// (MediaTek Dimensity 7050 · Realme 11 Pro reference target).
//
// Models ARM's official Valhall architecture specifications (ARM Docs 102203,
// 101863, 102596, 102626) under sustained thermal load:
//   - N_cores = 4 Valhall shader cores
//   - f_clock = 550 MHz conservative sustained thermal clock (vs 900 MHz burst)
//   - 1 shared Hardware Tiler across all 4 cores (FrontSide = 1.25 cyc/tri,
//     DoubleSide = 2.20 cyc/tri)
//   - Per-core Execution Engine pipes:
//       * FMA/CVT Arithmetic: 16 FP32 ops/clock/core
//       * SFU (Special Functions): 4 lanes/clock/core (sin, cos, tan, asin,
//         acos, atan, pow, exp, log, sqrt, inversesqrt, normalize, length,
//         distance, smoothstep, non-constant `/`)
//       * Varying Interpolator: 1 float (32-bit)/clock/core
//       * Texture Unit: 4 RGBA8 bilinear samples/clock/core (0.25 cyc/sample),
//         2 RGBA16F samples/clock/core (0.50 cyc/sample)
//   - Valhall Forward Pixel Kill (FPK) & Early-Z vs Late-Z (`discard` / alphaTest):
//       * Any `discard` in a compiled fragment shader or `alphaTest > 0` forces
//         the draw call into `LATE_Z`, disabling FPK (`effectiveOverdraw = rawOverdraw * 1.35 * 3.2`).
//       * Pure opaque `EARLY_Z_FPK` draw calls engage hardware Early-Z + FPK
//         (`effectiveOverdraw = 1.0 + (rawOverdraw - 1.0) * 0.22`).
//   - External LPDDR4X DRAM Bandwidth Roofline (6.0 GB/s sustainable GPU quota).
// ============================================================================

const FRONT_SIDE = 0;
const DOUBLE_SIDE = 2;

export const MALI_G68_SPECS = Object.freeze({
  gpuModel: 'ARM Mali-G68 MC4 (Valhall · Dimensity 7050)',
  cores: 4,
  clockMhz: 550,
  clockHz: 550e6,
  cyclesPerMsPerCore: 550e3,
  totalCoreCyclesPerMs: 4 * 550e3, // 2.20M core-cycles / ms
  tilerCyclesPerMs: 550e3, // 1 shared Tiler @ 550 MHz
  fmaOpsPerClockPerCore: 16,
  sfuOpsPerClockPerCore: 4,
  varyingFloatsPerClockPerCore: 1,
  rgba8SamplesPerClockPerCore: 4,
  rgba16fSamplesPerClockPerCore: 2,
  tilerCyclesFrontSide: 1.25,
  tilerCyclesDoubleSide: 2.20,
  sustainableDramBytesPerSec: 6.0e9, // 6.0 GB/s LPDDR4X sustainable GPU share
  sustainableDramMegabytesPerMs: 6.0,
  vertexFetchBytes: 48,
  binnedTriListBytes: 32,
  hdrRtBytesPerPixel: 8,
  depthBytesPerPixel: 4,
  frameBudget60FpsMs: 13.5,
  dramBudget60FpsMb: 65.0,
  triangleBudget60Fps: 260000,
});

const VARYING_TYPE_FLOATS = {
  float: 1,
  int: 1,
  uint: 1,
  bool: 1,
  vec2: 2,
  ivec2: 2,
  uvec2: 2,
  bvec2: 2,
  vec3: 3,
  ivec3: 3,
  uvec3: 3,
  bvec3: 3,
  vec4: 4,
  ivec4: 4,
  uvec4: 4,
  bvec4: 4,
  mat2: 4,
  mat3: 9,
  mat4: 16,
};

const SFU_FUNC_REGEX =
  /\b(sin|cos|tan|asin|acos|atan|pow|exp|exp2|log|log2|sqrt|inversesqrt|normalize|length|distance)\s*\(/g;

const ALU_FUNC_REGEX =
  /\b(dot|cross|mix|clamp|step|smoothstep|min|max|abs|floor|ceil|fract|mod|reflect|refract|sign|all|any|equal|lessThan|greaterThan)\s*\(/g;

const TEX_SAMPLE_REGEX =
  /\b(texture2D|texture|textureLod|textureCube|textureProj|texelFetch)\s*\(\s*([A-Za-z_]\w*)?/g;

/**
 * Strips all single-line (`//...`) and multi-line (`/*...*\/`) comments from GLSL source
 * so commented-out `discard` or math expressions never trigger false positives.
 */
export function stripGlslComments(glslSource) {
  if (!glslSource || typeof glslSource !== 'string') return '';
  return glslSource
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

/**
 * Performs static Valhall execution-pipe analysis on a vertex or fragment GLSL shader.
 */
export function analyzeGlslShader(rawSource, stage = 'fragment') {
  const clean = stripGlslComments(rawSource);
  if (!clean.trim()) {
    const isVert = stage === 'vertex';
    return {
      hasCustomSource: false,
      hasDiscard: false,
      varyingFloats: isVert ? 8 : 8,
      fmaOps: isVert ? 28 : 24,
      sfuOps: isVert ? 2 : 2,
      rgba8Samples: 0,
      rgba16fSamples: 0,
      fmaCycles: isVert ? 28 / 16 : 24 / 16,
      sfuCycles: isVert ? 2 / 4 : 2 / 4,
      varyingCycles: isVert ? 0 : 8 / 4,
      textureCycles: 0,
      totalCycles: isVert ? 1.85 : 2.0,
    };
  }

  // 1. Check for hardware Early-Z / FPK-disabling `discard` keyword
  const hasDiscard = stage === 'fragment' && /\bdiscard\b/.test(clean);

  // 2. Count interpolated varying floats (`varying <type> <name>;`)
  let varyingFloats = 0;
  const varyingDeclRegex =
    /\bvarying\s+(?:(?:highp|mediump|lowp|flat|smooth)\s+)*(float|int|uint|bool|vec2|ivec2|uvec2|bvec2|vec3|ivec3|uvec3|bvec3|vec4|ivec4|uvec4|bvec4|mat2|mat3|mat4)\s+([^;]+);/g;
  let vMatch;
  while ((vMatch = varyingDeclRegex.exec(clean)) !== null) {
    const typeName = vMatch[1];
    const varsPart = vMatch[2];
    const perVarFloats = VARYING_TYPE_FLOATS[typeName] || 1;
    const varNames = varsPart
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    varyingFloats += perVarFloats * Math.max(1, varNames.length);
  }

  // 3. Count SFU special function calls + non-constant `/` divisions
  const sfuMatches = clean.match(SFU_FUNC_REGEX);
  let sfuOps = sfuMatches ? sfuMatches.length : 0;

  // Remove compile-time constant float divisions (e.g. `1.0 / 255.0`, `1.0 / 3.0`)
  const withoutConstDiv = clean.replace(
    /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\s*\/\s*\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
    ' '
  );
  const nonConstDivMatches = withoutConstDiv.match(/\//g);
  if (nonConstDivMatches) {
    sfuOps += nonConstDivMatches.length;
  }

  // 4. Count texture unit samples (RGBA8 vs RGBA16F HalfFloat)
  let rgba8Samples = 0;
  let rgba16fSamples = 0;
  TEX_SAMPLE_REGEX.lastIndex = 0;
  let tMatch;
  while ((tMatch = TEX_SAMPLE_REGEX.exec(clean)) !== null) {
    const samplerName = tMatch[2] || '';
    if (/tDiffuse|Hdr|HalfFloat|Float/i.test(samplerName)) {
      rgba16fSamples += 1;
    } else {
      rgba8Samples += 1;
    }
  }

  // 5. Count FMA/CVT arithmetic operations
  const aluIntrinsics = clean.match(ALU_FUNC_REGEX);
  const arithOps = clean.match(/[+*]|(?<![A-Za-z0-9_])-|\bmat[234]\b/g);
  const intrinsicCount = aluIntrinsics ? aluIntrinsics.length : 0;
  const rawArithCount = arithOps ? arithOps.length : 0;
  // Weight vector operations by typical 2.4 scalar FP32 lanes
  const fmaOps = Math.max(8, Math.round(intrinsicCount * 2.8 + rawArithCount * 1.6));

  // Per-core cycles across Valhall's parallel pipes
  const fmaCycles = fmaOps / MALI_G68_SPECS.fmaOpsPerClockPerCore;
  const sfuCycles = sfuOps / MALI_G68_SPECS.sfuOpsPerClockPerCore;
  // Varying interpolator processes 1 float/clock/core (scaled by quad amortized factor in fragment pipe)
  const varyingCycles =
    stage === 'fragment'
      ? varyingFloats / (MALI_G68_SPECS.varyingFloatsPerClockPerCore * 4.0)
      : 0;
  const textureCycles =
    rgba8Samples * (1 / MALI_G68_SPECS.rgba8SamplesPerClockPerCore) +
    rgba16fSamples * (1 / MALI_G68_SPECS.rgba16fSamplesPerClockPerCore);

  const totalCycles =
    stage === 'vertex'
      ? Math.max(fmaCycles, sfuCycles, textureCycles, 1.0)
      : Math.max(fmaCycles, sfuCycles, varyingCycles, textureCycles, 0.5);

  return {
    hasCustomSource: true,
    hasDiscard,
    varyingFloats,
    fmaOps,
    sfuOps,
    rgba8Samples,
    rgba16fSamples,
    fmaCycles,
    sfuCycles,
    varyingCycles,
    textureCycles,
    totalCycles,
  };
}

function multiplyMat4Elements(a, b) {
  const out = new Float64Array(16);
  const a00 = a[0], a10 = a[1], a20 = a[2], a30 = a[3];
  const a01 = a[4], a11 = a[5], a21 = a[6], a31 = a[7];
  const a02 = a[8], a12 = a[9], a22 = a[10], a32 = a[11];
  const a03 = a[12], a13 = a[13], a23 = a[14], a33 = a[15];

  for (let col = 0; col < 4; col++) {
    const idx = col * 4;
    const b0 = b[idx], b1 = b[idx + 1], b2 = b[idx + 2], b3 = b[idx + 3];
    out[idx] = a00 * b0 + a01 * b1 + a02 * b2 + a03 * b3;
    out[idx + 1] = a10 * b0 + a11 * b1 + a12 * b2 + a13 * b3;
    out[idx + 2] = a20 * b0 + a21 * b1 + a22 * b2 + a23 * b3;
    out[idx + 3] = a30 * b0 + a31 * b1 + a32 * b2 + a33 * b3;
  }
  return out;
}

function buildFrustumPlanes(camera) {
  const projEl = camera?.projectionMatrix?.elements;
  const viewEl = camera?.matrixWorldInverse?.elements;
  if (!projEl || !viewEl || projEl.length < 16 || viewEl.length < 16) return null;

  const me = multiplyMat4Elements(projEl, viewEl);
  const rawPlanes = [
    [me[3] - me[0], me[7] - me[4], me[11] - me[8], me[15] - me[12]],
    [me[3] + me[0], me[7] + me[4], me[11] + me[8], me[15] + me[12]],
    [me[3] + me[1], me[7] + me[5], me[11] + me[9], me[15] + me[13]],
    [me[3] - me[1], me[7] - me[5], me[11] - me[9], me[15] - me[13]],
    [me[3] - me[2], me[7] - me[6], me[11] - me[10], me[15] - me[14]],
    [me[3] + me[2], me[7] + me[6], me[11] + me[10], me[15] + me[14]],
  ];

  return rawPlanes.map(([a, b, c, d]) => {
    const invLen = 1 / (Math.hypot(a, b, c) || 1);
    return { a: a * invLen, b: b * invLen, c: c * invLen, d: d * invLen };
  });
}

function isSphereInFrustum(planes, localSphere, matrixWorldElements) {
  if (!planes || !localSphere || !localSphere.center) return true;
  const lx = Number(localSphere.center.x) || 0;
  const ly = Number(localSphere.center.y) || 0;
  const lz = Number(localSphere.center.z) || 0;
  const lr = Number(localSphere.radius) || 0;
  if (lr <= 0) return true;

  let cx = lx;
  let cy = ly;
  let cz = lz;
  let maxScale = 1.0;

  if (matrixWorldElements && matrixWorldElements.length >= 16) {
    const m = matrixWorldElements;
    cx = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
    cy = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
    cz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
    const sx = Math.hypot(m[0], m[1], m[2]);
    const sy = Math.hypot(m[4], m[5], m[6]);
    const sz = Math.hypot(m[8], m[9], m[10]);
    maxScale = Math.max(sx, sy, sz, 1e-6);
  }

  const worldRadius = lr * maxScale;
  for (let i = 0; i < planes.length; i++) {
    const p = planes[i];
    const dist = p.a * cx + p.b * cy + p.c * cz + p.d;
    if (dist < -worldRadius) return false;
  }
  return true;
}

function extractMaterialShaderSources(material, isSkinned = false) {
  if (!material) {
    return {
      vertexSource: '',
      fragmentSource: '',
      alphaTest: 0,
      side: FRONT_SIDE,
      transparent: false,
      depthWrite: true,
    };
  }

  const mats = Array.isArray(material) ? material.filter(Boolean) : [material];
  let vertexSource = '';
  let fragmentSource = '';
  let alphaTest = 0;
  let side = FRONT_SIDE;
  let transparent = false;
  let depthWrite = true;

  for (const mat of mats) {
    if (typeof mat.vertexShader === 'string') vertexSource += '\n' + mat.vertexShader;
    else if (typeof mat.userData?.vertexShader === 'string')
      vertexSource += '\n' + mat.userData.vertexShader;

    if (typeof mat.fragmentShader === 'string') fragmentSource += '\n' + mat.fragmentShader;
    else if (typeof mat.userData?.fragmentShader === 'string')
      fragmentSource += '\n' + mat.userData.fragmentShader;

    if (
      !fragmentSource &&
      typeof mat.onBeforeCompile === 'function' &&
      mat.onBeforeCompile.length >= 1
    ) {
      try {
        const probe = { vertexShader: '', fragmentShader: '', uniforms: {} };
        mat.onBeforeCompile(probe, null);
        if (probe.vertexShader) vertexSource += '\n' + probe.vertexShader;
        if (probe.fragmentShader) fragmentSource += '\n' + probe.fragmentShader;
      } catch {
        // Fallback: inspect function source without executing Three.js chunk replacements
        const fnSrc = stripGlslComments(String(mat.onBeforeCompile));
        if (/\bdiscard\b/.test(fnSrc)) {
          fragmentSource += '\n void main() { discard; }';
        }
      }
    }

    if (Number(mat.alphaTest) > alphaTest) alphaTest = Number(mat.alphaTest);
    if (mat.side === DOUBLE_SIDE) side = DOUBLE_SIDE;
    if (mat.transparent === true) transparent = true;
    if (mat.depthWrite === false) depthWrite = false;
  }

  return {
    vertexSource,
    fragmentSource,
    alphaTest,
    side,
    transparent,
    depthWrite,
    isSkinned,
  };
}

function classifyMeshGroup(mesh) {
  const pathNames = [];
  let cur = mesh;
  while (cur) {
    if (cur.name) pathNames.push(cur.name);
    cur = cur.parent;
  }
  const joined = pathNames.join(' ').toLowerCase();

  if (
    joined.includes('meadow') ||
    joined.includes('grass') ||
    joined.includes('daisy') ||
    joined.includes('bellflower') ||
    joined.includes('lupine') ||
    joined.includes('cosmos') ||
    joined.includes('crimsonrose') ||
    joined.includes('toonshrub') ||
    joined.includes('flower')
  ) {
    return 'ToroidalMeadow';
  }
  if (
    joined.includes('tree') ||
    joined.includes('canopy') ||
    joined.includes('puff') ||
    joined.includes('wisteria') ||
    joined.includes('botanical')
  ) {
    return 'BotanicalTrees';
  }
  if (
    joined.includes('monument') ||
    joined.includes('stone_') ||
    joined.includes('calligraphy') ||
    joined.includes('inscription') ||
    joined.includes('site1') ||
    joined.includes('site2') ||
    joined.includes('site3')
  ) {
    return 'SacredStoneCalligraphy';
  }
  if (
    joined.includes('house') ||
    joined.includes('cottage') ||
    joined.includes('mill') ||
    joined.includes('bridge') ||
    joined.includes('plaza') ||
    joined.includes('well')
  ) {
    return 'VillageArchitecture';
  }
  if (
    joined.includes('knight') ||
    joined.includes('mage') ||
    joined.includes('skeleton') ||
    joined.includes('enemy') ||
    joined.includes('orc') ||
    joined.includes('wolf') ||
    joined.includes('golem') ||
    joined.includes('necromancer') ||
    mesh.isSkinnedMesh
  ) {
    return 'CharactersAndEnemies';
  }
  if (
    joined.includes('vfx') ||
    joined.includes('lance') ||
    joined.includes('meteor') ||
    joined.includes('slash') ||
    joined.includes('petal')
  ) {
    return 'CombatVfx';
  }
  if (joined.includes('sky') || joined.includes('cloud') || joined.includes('eclipse')) {
    return 'SkyAndAtmosphere';
  }
  if (joined.includes('terrain') || joined.includes('water') || joined.includes('ground')) {
    return 'TerrainAndWater';
  }
  return mesh.name || 'SceneProps';
}

function estimateCoverageAndRawOverdraw(groupName, triangles, isLateZ) {
  switch (groupName) {
    case 'ToroidalMeadow': {
      const cov = Math.min(0.42, Math.max(0.03, (triangles / 420000) * 0.36));
      return { coverage: cov, rawOverdraw: 2.35 };
    }
    case 'BotanicalTrees': {
      const cov = Math.min(0.45, Math.max(0.04, (triangles / 300000) * 0.38));
      return { coverage: cov, rawOverdraw: isLateZ ? 3.4 : 2.2 };
    }
    case 'SacredStoneCalligraphy': {
      const cov = Math.min(0.14, Math.max(0.01, (triangles / 120000) * 0.12));
      return { coverage: cov, rawOverdraw: 1.6 };
    }
    case 'TerrainAndWater':
      return {
        coverage: Math.min(0.36, Math.max(0.005, (triangles / 35000) * 0.28)),
        rawOverdraw: 1.05,
      };
    case 'SkyAndAtmosphere':
      return {
        coverage: Math.min(0.28, Math.max(0.004, (triangles / 40000) * 0.22)),
        rawOverdraw: 1.0,
      };
    case 'VillageArchitecture':
      return { coverage: Math.min(0.24, Math.max(0.02, (triangles / 80000) * 0.18)), rawOverdraw: 1.5 };
    case 'CharactersAndEnemies':
      return { coverage: 0.04, rawOverdraw: 1.35 };
    default:
      return {
        coverage: Math.min(0.22, Math.max(0.01, (triangles / 200000) * 0.18)),
        rawOverdraw: triangles > 25000 ? 2.1 : 1.35,
      };
  }
}

function resolveViewport(opts, renderer) {
  let width = 844;
  let height = 390;
  let dpr = 1.35;

  if (opts?.viewport && typeof opts.viewport === 'object') {
    if (Number(opts.viewport.width) > 0) width = Number(opts.viewport.width);
    if (Number(opts.viewport.height) > 0) height = Number(opts.viewport.height);
    if (Number(opts.viewport.dpr) > 0) dpr = Number(opts.viewport.dpr);
  } else if (renderer) {
    if (typeof renderer.getSize === 'function') {
      const probeTarget = {
        x: 0,
        y: 0,
        set(w, h) {
          this.x = w;
          this.y = h;
          return this;
        },
      };
      const sz = renderer.getSize(probeTarget) || probeTarget;
      if (sz.x > 0 && sz.y > 0) {
        width = sz.x;
        height = sz.y;
      }
    } else if (renderer.domElement?.width > 0 && renderer.domElement?.height > 0) {
      width = renderer.domElement.clientWidth || renderer.domElement.width;
      height = renderer.domElement.clientHeight || renderer.domElement.height;
    }
    if (typeof renderer.getPixelRatio === 'function') {
      const rPr = renderer.getPixelRatio();
      if (rPr > 0) dpr = rPr;
    } else if (Number(renderer.pixelRatio) > 0) {
      dpr = Number(renderer.pixelRatio);
    }
  }

  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  const totalPixels = pixelWidth * pixelHeight;

  return {
    width,
    height,
    dpr: Number(dpr.toFixed(3)),
    pixelWidth,
    pixelHeight,
    totalPixels,
  };
}

function inspectPostPassState(post) {
  if (!post) {
    return {
      enabled: true,
      mobileFastSample: false,
      hasDepthTex: true,
      gradeFragCyclesPerPx: 6.2,
      gradeRtReadTaps: 9,
    };
  }

  const gradeUniforms =
    post.params?.grade ||
    post.gradePass?.uniforms ||
    post.uniforms ||
    post.composer?.passes?.find((p) => p?.uniforms?.tDiffuse)?.uniforms ||
    null;

  const fastSampleVal =
    gradeUniforms?.uMobileFastSample?.value ??
    post.uMobileFastSample?.value ??
    post.uMobileFastSample ??
    0;

  const mobileFastSample = Number(fastSampleVal) > 0.5;

  const tDepthVal =
    gradeUniforms?.tDepth?.value !== undefined
      ? gradeUniforms.tDepth.value
      : post.tDepth !== undefined
        ? post.tDepth
        : true;
  const hasDepthTex = Boolean(tDepthVal);

  // When `uMobileFastSample > 0.5`, GradeShader skips the 9-tap `sampleFXAALinear`
  // and performs a single `texture2D(tDiffuse, vUv)` tap (1x 8B RGBA16F read vs 9x 8B reads).
  const gradeRtReadTaps = mobileFastSample ? 1 : 9;
  const gradeFragCyclesPerPx = mobileFastSample
    ? 2.8 + (hasDepthTex ? 0.45 : 0.0)
    : 6.2 + (hasDepthTex ? 0.45 : 0.0);

  return {
    enabled: post.enabled !== false,
    mobileFastSample,
    hasDepthTex,
    gradeFragCyclesPerPx,
    gradeRtReadTaps,
  };
}

/**
 * Evaluates a Three.js scene against the conservative ARM Valhall `Mali-G68 MC4`
 * (`550 MHz` sustained thermal clock, `6.0 GB/s` LPDDR4X GPU DRAM quota) hardware model.
 *
 * Supports both options object:
 *   `evaluateMaliG68Frame({ scene, renderer, post, camera, profile, viewport })`
 * and positional arguments:
 *   `evaluateMaliG68Frame(scene, renderer, post, camera, profile)`
 */
export function evaluateMaliG68Frame(sceneOrOpts, rendererArg, postArg, cameraArg, profileArg) {
  let scene = null;
  let renderer = null;
  let post = null;
  let camera = null;
  let opts = {};

  const isOptionsObject =
    sceneOrOpts &&
    typeof sceneOrOpts === 'object' &&
    !sceneOrOpts.isObject3D &&
    typeof sceneOrOpts.traverse !== 'function' &&
    ('scene' in sceneOrOpts ||
      'renderer' in sceneOrOpts ||
      'post' in sceneOrOpts ||
      'camera' in sceneOrOpts ||
      'viewport' in sceneOrOpts);

  if (isOptionsObject) {
    opts = sceneOrOpts;
    scene = opts.scene || null;
    renderer = opts.renderer || null;
    post = opts.post || null;
    camera = opts.camera || null;
  } else {
    scene = sceneOrOpts || null;
    renderer = rendererArg || null;
    post = postArg || null;
    camera = cameraArg || null;
    opts = { profile: profileArg };
  }

  const viewport = resolveViewport(opts, renderer);
  const postState = inspectPostPassState(post);

  // Prepare camera frustum planes if camera is supplied
  let frustumPlanes = null;
  if (camera) {
    try {
      if (typeof scene?.updateMatrixWorld === 'function') {
        scene.updateMatrixWorld(true);
      }
      if (typeof camera.updateMatrixWorld === 'function') {
        camera.updateMatrixWorld(true);
      }
      frustumPlanes = buildFrustumPlanes(camera);
    } catch {
      frustumPlanes = null;
    }
  }

  let totalDrawCalls = 0;
  let totalVerticesSubmitted = 0;
  let totalTrianglesSubmitted = 0;
  let lateZDrawCalls = 0;
  let lateZDrawCallsWithManyTris = 0;
  const lateZOffenders = [];

  let totalTilerCycles = 0;
  let totalVertexCycles = 0;
  let totalSceneFragCycles = 0;
  let totalVertexFetchBytes = 0;
  let totalBinnedTriBytes = 0;
  let totalSceneTexBytes = 0;

  const groupMap = new Map();

  function getOrCreateGroup(name) {
    let g = groupMap.get(name);
    if (!g) {
      g = {
        name,
        drawCalls: 0,
        vertices: 0,
        triangles: 0,
        pctTriangles: 0,
        lateZDrawCalls: 0,
        zMode: 'EARLY_Z_FPK',
        tilerCycles: 0,
        vertexCycles: 0,
        fragCycles: 0,
        dramBytes: 0,
        dramMegabytes: 0,
      };
      groupMap.set(name, g);
    }
    return g;
  }

  function visitNode(obj) {
    if (!obj || obj.visible === false) return;

    const isRenderableMesh =
      Boolean(obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh) && Boolean(obj.geometry);

    if (isRenderableMesh) {
      const geo = obj.geometry;
      const isInstanced = Boolean(obj.isInstancedMesh);
      const instanceCount = isInstanced
        ? Math.max(0, Number(obj.count ?? obj.instanceMatrix?.count ?? 0))
        : 1;

      if (instanceCount > 0) {
        // Respect camera frustum culling when `mesh.frustumCulled !== false`
        let inFrustum = true;
        if (frustumPlanes && obj.frustumCulled !== false) {
          try {
            if (isInstanced) {
              if (obj.boundingSphere) {
                inFrustum = isSphereInFrustum(
                  frustumPlanes,
                  obj.boundingSphere,
                  obj.matrixWorld?.elements
                );
              }
            } else {
              if (!geo.boundingSphere && typeof geo.computeBoundingSphere === 'function') {
                geo.computeBoundingSphere();
              }
              if (geo.boundingSphere) {
                inFrustum = isSphereInFrustum(
                  frustumPlanes,
                  geo.boundingSphere,
                  obj.matrixWorld?.elements
                );
              }
            }
          } catch {
            inFrustum = true;
          }
        }

        if (inFrustum) {
          const posAttr = geo.attributes?.position;
          const baseVerts = posAttr ? Number(posAttr.count || 0) : 0;
          let baseTris = 0;
          if (geo.index) {
            baseTris = Math.floor(Number(geo.index.count || 0) / 3);
          } else if (baseVerts > 0) {
            baseTris = Math.floor(baseVerts / 3);
          }

          // Respect drawRange if set
          if (geo.drawRange && Number.isFinite(geo.drawRange.count) && geo.drawRange.count >= 0) {
            const maxIndices = geo.index ? geo.index.count : baseVerts;
            const rangeCount = Math.min(maxIndices, geo.drawRange.count);
            baseTris = Math.floor(rangeCount / 3);
          }

          const submittedVerts = baseVerts * instanceCount;
          const submittedTris = baseTris * instanceCount;

          if (submittedTris > 0 || submittedVerts > 0) {
            const matInfo = extractMaterialShaderSources(obj.material, Boolean(obj.isSkinnedMesh));
            const vertAnalysis = analyzeGlslShader(matInfo.vertexSource, 'vertex');
            const fragAnalysis = analyzeGlslShader(matInfo.fragmentSource, 'fragment');

            const isLateZ = fragAnalysis.hasDiscard || matInfo.alphaTest > 0;
            const zMode = isLateZ ? 'LATE_Z' : 'EARLY_Z_FPK';

            const groupName = classifyMeshGroup(obj);
            const { coverage, rawOverdraw } = estimateCoverageAndRawOverdraw(
              groupName,
              submittedTris,
              isLateZ
            );

            // Valhall Forward Pixel Kill (FPK) vs Late-Z overdraw multiplier
            const effectiveOverdraw = isLateZ
              ? rawOverdraw * 1.35 * 3.2
              : 1.0 + (rawOverdraw - 1.0) * 0.22;

            // (a) Tiler & Vertex cycles
            const tilerCycPerTri =
              matInfo.side === DOUBLE_SIDE
                ? MALI_G68_SPECS.tilerCyclesDoubleSide
                : MALI_G68_SPECS.tilerCyclesFrontSide;
            const drawTilerCycles = submittedTris * tilerCycPerTri;

            const skinningBonus = obj.isSkinnedMesh && !vertAnalysis.hasCustomSource ? 1.6 : 0.0;
            const perVertCycles = Math.min(8.0, vertAnalysis.totalCycles) + skinningBonus;
            const drawVertexCycles = submittedVerts * perVertCycles;

            // (b) Fragment cycles (cap EARLY_Z_FPK static cycle estimate to realistic Valhall compiled throughput <= 8.5 cyc/px)
            const shadedPixels = viewport.totalPixels * coverage * effectiveOverdraw;
            const effectiveFragCyclesPerPx = isLateZ
              ? fragAnalysis.totalCycles
              : Math.min(8.5, fragAnalysis.totalCycles);
            const drawFragCycles = shadedPixels * effectiveFragCyclesPerPx;

            // (c) DRAM bytes for this draw call:
            //     - Active vertex attribute fetch: 48 B/vert
            //     - Binned primitive list: 32 B/tri
            //     - Texture cache miss / sample fetch traffic (amplified under LATE_Z)
            const vertBytes = submittedVerts * MALI_G68_SPECS.vertexFetchBytes;
            const triListBytes = submittedTris * MALI_G68_SPECS.binnedTriListBytes;
            const texSampleBytesPerPx =
              fragAnalysis.rgba8Samples * 1.2 + fragAnalysis.rgba16fSamples * 2.4;
            const lateZTilePenaltyBytes = isLateZ ? shadedPixels * 4.0 : 0;
            const drawTexBytes = shadedPixels * texSampleBytesPerPx + lateZTilePenaltyBytes;
            const drawDramBytes = vertBytes + triListBytes + drawTexBytes;

            totalDrawCalls += 1;
            totalVerticesSubmitted += submittedVerts;
            totalTrianglesSubmitted += submittedTris;
            totalTilerCycles += drawTilerCycles;
            totalVertexCycles += drawVertexCycles;
            totalSceneFragCycles += drawFragCycles;
            totalVertexFetchBytes += vertBytes;
            totalBinnedTriBytes += triListBytes;
            totalSceneTexBytes += drawTexBytes;

            if (isLateZ) {
              lateZDrawCalls += 1;
              if (submittedTris >= 1000) {
                lateZDrawCallsWithManyTris += 1;
              }
              lateZOffenders.push({
                name: obj.name || '(unnamed_mesh)',
                group: groupName,
                triangles: submittedTris,
                vertices: submittedVerts,
                hasDiscard: fragAnalysis.hasDiscard,
                alphaTest: matInfo.alphaTest,
                zMode,
              });
            }

            const g = getOrCreateGroup(groupName);
            g.drawCalls += 1;
            g.vertices += submittedVerts;
            g.triangles += submittedTris;
            g.tilerCycles += drawTilerCycles;
            g.vertexCycles += drawVertexCycles;
            g.fragCycles += drawFragCycles;
            g.dramBytes += drawDramBytes;
            if (isLateZ) {
              g.lateZDrawCalls += 1;
              g.zMode = 'LATE_Z';
            }
          }
        }
      }
    }

    const children = obj.children;
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        visitNode(children[i]);
      }
    }
  }

  if (scene) {
    visitNode(scene);
  }

  lateZOffenders.sort((a, b) => b.triangles - a.triangles);

  // Fullscreen Post-Processing (`GradeShader`) cycles & DRAM traffic
  const postFragCycles = postState.enabled
    ? viewport.totalPixels * postState.gradeFragCyclesPerPx
    : 0;
  const totalFragCycles = totalSceneFragCycles + postFragCycles;

  const hdrRtWriteBytes = postState.enabled
    ? viewport.totalPixels * MALI_G68_SPECS.hdrRtBytesPerPixel
    : 0;
  const gradeRtReadBytes = postState.enabled
    ? viewport.totalPixels * postState.gradeRtReadTaps * MALI_G68_SPECS.hdrRtBytesPerPixel
    : 0;
  const depthReadBytes =
    postState.enabled && postState.hasDepthTex
      ? viewport.totalPixels * MALI_G68_SPECS.depthBytesPerPixel
      : 0;

  const totalDramBytes =
    totalVertexFetchBytes +
    totalBinnedTriBytes +
    totalSceneTexBytes +
    hdrRtWriteBytes +
    gradeRtReadBytes +
    depthReadBytes;

  const dramMegabytes = totalDramBytes / 1e6;

  // 4 Hardware Rooflines:
  // (a) Tiler (1 shared unit @ 550 MHz) & Vertex Shading (4 cores @ 550 MHz)
  const tilerMs = totalTilerCycles / MALI_G68_SPECS.tilerCyclesPerMs;
  const vertexMs = totalVertexCycles / MALI_G68_SPECS.totalCoreCyclesPerMs;
  const tilerAndVertexMs = Math.max(tilerMs, vertexMs);

  // (b) Fragment Execution Engine (4 cores @ 550 MHz)
  const fragmentMs = totalFragCycles / MALI_G68_SPECS.totalCoreCyclesPerMs;

  // (c) External LPDDR4X DRAM Bandwidth Roofline (6.0 GB/s sustainable GPU bandwidth)
  const bandwidthMs = totalDramBytes / (MALI_G68_SPECS.sustainableDramBytesPerSec / 1000);

  // (d) WebGL2 / CSF Driver CPU Submission Overhead & Combined Frame Time
  const driverCpuMs = 0.65 + totalDrawCalls * 0.032;
  const predictedFrameMs =
    Math.max(tilerAndVertexMs, fragmentMs, bandwidthMs) +
    0.35 * Math.min(tilerAndVertexMs, fragmentMs) +
    driverCpuMs;

  const predictedFps = Math.min(60, Math.round(1000 / Math.max(0.1, predictedFrameMs)));

  let bottleneck = 'DRAM_BANDWIDTH';
  if (lateZDrawCallsWithManyTris > 0 && fragmentMs >= tilerAndVertexMs) {
    bottleneck = 'FRAGMENT_LATE_Z';
  } else if (tilerAndVertexMs >= fragmentMs && tilerAndVertexMs >= bandwidthMs) {
    bottleneck = 'TILER_AND_VERTEX';
  } else if (fragmentMs >= tilerAndVertexMs && fragmentMs >= bandwidthMs) {
    bottleneck = lateZDrawCallsWithManyTris > 0 ? 'FRAGMENT_LATE_Z' : 'FRAGMENT_ALU_TEX';
  }

  const passes60FpsGate =
    predictedFrameMs <= MALI_G68_SPECS.frameBudget60FpsMs &&
    dramMegabytes <= MALI_G68_SPECS.dramBudget60FpsMb &&
    totalTrianglesSubmitted <= MALI_G68_SPECS.triangleBudget60Fps &&
    lateZDrawCallsWithManyTris === 0;

  const groups = Array.from(groupMap.values())
    .map((g) => ({
      name: g.name,
      drawCalls: g.drawCalls,
      vertices: g.vertices,
      triangles: g.triangles,
      pctTriangles:
        totalTrianglesSubmitted > 0
          ? Number(((g.triangles / totalTrianglesSubmitted) * 100).toFixed(1))
          : 0,
      lateZDrawCalls: g.lateZDrawCalls,
      zMode: g.zMode,
      tilerAndVertexMs: Number(
        Math.max(
          g.tilerCycles / MALI_G68_SPECS.tilerCyclesPerMs,
          g.vertexCycles / MALI_G68_SPECS.totalCoreCyclesPerMs
        ).toFixed(2)
      ),
      fragmentMs: Number((g.fragCycles / MALI_G68_SPECS.totalCoreCyclesPerMs).toFixed(2)),
      dramMegabytes: Number((g.dramBytes / 1e6).toFixed(2)),
    }))
    .sort((a, b) => b.triangles - a.triangles);

  // Allow convenient lookup by group name (`report.groups.ToroidalMeadow`) as well as array iteration
  for (const g of groups) {
    if (!(g.name in groups)) {
      Object.defineProperty(groups, g.name, {
        value: g,
        enumerable: false,
        configurable: true,
      });
    }
  }

  return {
    gpuModel: MALI_G68_SPECS.gpuModel,
    clockMhz: MALI_G68_SPECS.clockMhz,
    cores: MALI_G68_SPECS.cores,
    viewport,
    totalDrawCalls,
    totalVerticesSubmitted,
    totalTrianglesSubmitted,
    lateZDrawCalls,
    lateZDrawCallsWithManyTris,
    lateZOffenders,
    tilerMs: Number(tilerMs.toFixed(2)),
    vertexMs: Number(vertexMs.toFixed(2)),
    tilerAndVertexMs: Number(tilerAndVertexMs.toFixed(2)),
    fragmentMs: Number(fragmentMs.toFixed(2)),
    bandwidthMs: Number(bandwidthMs.toFixed(2)),
    driverCpuMs: Number(driverCpuMs.toFixed(2)),
    dramMegabytes: Number(dramMegabytes.toFixed(2)),
    predictedFrameMs: Number(predictedFrameMs.toFixed(2)),
    predictedFps,
    bottleneck,
    passes60FpsGate,
    postPass: {
      enabled: postState.enabled,
      mobileFastSample: postState.mobileFastSample,
      hasDepthTex: postState.hasDepthTex,
      gradeRtReadTaps: postState.gradeRtReadTaps,
    },
    groups,
  };
}

export default evaluateMaliG68Frame;
