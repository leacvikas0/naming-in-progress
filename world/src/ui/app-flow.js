// ============================================================================
// world/src/ui/app-flow.js
//
// Amarante ("The Unfading Bloom") - Artist-Grade Living Dither Materialization
// & Premium Co-Op Onboarding Flow (`title` -> `create_join` -> `flower_lobby`)
//
// Supports 3 Distinct Artistic Directions via `?onboard_opt=1|2|3` or
// `appFlow.setOnboardingOption(1|2|3)`:
//   - Option 1 (`1`): "Sunbeam Halftone Stipple & Horizon Editorial"
//   - Option 2 (`2`): "Botanical Wind-Wave Dither & Carved Travertine Sanctuary"
//   - Option 3 (`3`): "Stratified World-Building Dither & Whisper-Minimalist Cinema"
// ============================================================================

export const FLOW_STEPS = Object.freeze({
  TITLE: 'title',
  LOADING: 'loading',
  CREATE_JOIN: 'create_join',
  FLOWER_LOBBY: 'flower_lobby',
  IN_GAME: 'in_game',
});

export const ONBOARDING_OPTIONS = Object.freeze({
  SUNBEAM_EDITORIAL: 1,
  BOTANICAL_TRAVERTINE: 2,
  WORLD_BUILDER_CINEMA: 3,
});

export const ROMANTIC_ROOM_PHRASES = Object.freeze([
  'Rain on warm limestone',
  'Two lanterns under wisteria',
  'Snowmelt in the orchard',
  'Wild clover at dusk',
  'Petals on still water',
  'Love is curiosity',
]);

/**
 * Generates or selects a human-memorable romantic room phrase.
 */
export function generateRomanticRoomPhrase(seed = 0) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    const idx = Math.abs(Math.floor(seed)) % ROMANTIC_ROOM_PHRASES.length;
    return ROMANTIC_ROOM_PHRASES[idx];
  }
  return ROMANTIC_ROOM_PHRASES[0];
}

/**
 * Auto-skip helper: returns `true` when `?shot=`, `?nolobby=1`, `window.__HEADLESS_TEST__`,
 * or `navigator.webdriver` is active - UNLESS `?flow=1` is present in the URL query string.
 */
export function shouldAutoSkipOpeningFlow(searchOverride) {
  if (typeof window === 'undefined') return true;
  const search =
    typeof searchOverride === 'string'
      ? searchOverride
      : window.location?.search || '';
  const params = new URLSearchParams(search);
  if (params.get('flow') === '1' || params.get('opening') === '1' || params.has('step')) {
    return false;
  }
  if (params.has('shot') || params.get('nolobby') === '1') {
    return true;
  }
  if (window.__HEADLESS_TEST__) {
    return true;
  }
  return false;
}

/**
 * Canonical 3D camera poses in the Southern Flower Field (`(0, 128)`) for each opening stage.
 */
export function getOpeningCameraPose(step, groundHeightFn = null) {
  const sampleY =
    typeof groundHeightFn === 'function'
      ? (x, z) => Number(groundHeightFn(x, z)) || 0
      : () => 2.2;

  const lobbyGroundY = sampleY(0, 128);

  if (step === FLOW_STEPS.FLOWER_LOBBY) {
    return {
      mode: 'lobby',
      pos: [0.0, lobbyGroundY + 1.68, 134.1],
      target: [0.0, lobbyGroundY + 1.24, 125.0],
      fov: 46,
      knightLobbyPos: {
        x: -1.15,
        y: lobbyGroundY,
        z: 128.2,
        yaw: 0.18,
        emote: 'wave',
      },
      mageLobbyPos: {
        x: 1.05,
        y: lobbyGroundY,
        z: 128.0,
        yaw: -0.22,
        emote: 'cheer',
      },
    };
  }

  if (step === FLOW_STEPS.LOADING) {
    return {
      mode: 'vista',
      pos: [-1.4, lobbyGroundY + 0.95, 132.5],
      target: [0.0, lobbyGroundY + 3.2, 30.0],
      fov: 48,
    };
  }

  // Title & Create/Join: Scenic Southern Flower Field vista looking down the winding path to town
  return {
    mode: 'vista',
    pos: [0.0, lobbyGroundY + 2.35, 136.5],
    target: [0.0, lobbyGroundY + 2.8, 24.0],
    fov: 50,
  };
}

/* ------------------------------------------------------------------------- */
/* Precomputed 64x64 Interleaved Gradient Noise (IGN) & Fine 4x4 Bayer LUTs  */
/* ------------------------------------------------------------------------- */

// Fine 4x4 Ordered Bayer Matrix (normalized 0..1)
const BAYER_4X4_RAW = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];
const BAYER_4X4 = new Float32Array(16);
for (let i = 0; i < 16; i++) BAYER_4X4[i] = BAYER_4X4_RAW[i] / 15.0;

// 64x64 Interleaved Gradient Noise (Jorge Jimenez 2014) — Zero repeating grid artifacts,
// producing true organic printmaker / lithograph stipple grain at 1.5px resolution.
const IGN_64X64 = new Float32Array(64 * 64);
for (let y = 0; y < 64; y++) {
  for (let x = 0; x < 64; x++) {
    const inner = (0.06711056 * x + 0.00583715 * y) % 1.0;
    const ign = (52.9829189 * inner) % 1.0;
    const b4 = BAYER_4X4[((y & 3) << 2) | (x & 3)];
    IGN_64X64[(y << 6) | x] = ign * 0.72 + b4 * 0.28;
  }
}

/* ------------------------------------------------------------------------- */
/* High-Craft Botanical, Architectural & Calligraphic SVGs                   */
/* ------------------------------------------------------------------------- */

const SVG_OPEN_AIR_DIVIDER = `
<svg class="af-sakura-divider-svg" viewBox="0 0 280 32" fill="none" aria-hidden="true">
  <line x1="12" y1="16" x2="112" y2="16" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" opacity="0.82"/>
  <polygon points="122,16 126,12.5 130,16 126,19.5" fill="currentColor" opacity="0.9"/>
  <g transform="translate(140, 16)">
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(0)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(72)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(144)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(216)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(288)"/>
    <circle cx="0" cy="0" r="2.6" fill="#fbbf24"/>
  </g>
  <polygon points="150,16 154,12.5 158,16 154,19.5" fill="currentColor" opacity="0.9"/>
  <line x1="168" y1="16" x2="268" y2="16" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" opacity="0.82"/>
</svg>
`;

const DISSOLVE_W = 240;
const DISSOLVE_H = 135;

const DISSOLVE_VERT_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const DISSOLVE_FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uSweep;
varying vec2 vUv;

float hash2D(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2D(i);
  float b = hash2D(i + vec2(1.0, 0.0));
  float c = hash2D(i + vec2(0.0, 1.0));
  float d = hash2D(i + vec2(1.0, 1.0));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}

void main() {
  if (uSweep <= -0.5) {
    gl_FragColor = vec4(0.0196, 0.0196, 0.0275, 1.0);
    return;
  }
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float n1 = valueNoise2D(uv * vec2(3.6, 2.4) + vec2(1.3, 2.1));
  float n2 = valueNoise2D(uv * vec2(7.5, 5.0) + vec2(-4.2, 5.7));
  float n3 = valueNoise2D(uv * vec2(15.5, 10.4) + vec2(7.1, -3.4));
  float n4 = valueNoise2D(uv * vec2(31.0, 21.0) + vec2(-2.8, 8.3));
  float n5 = valueNoise2D(uv * vec2(62.0, 42.0) + vec2(5.4, -6.1));
  float cloud = n1 * 0.42 + n2 * 0.26 + n3 * 0.16 + n4 * 0.10 + n5 * 0.06;
  vec2 dUv = vec2((uv.x - 0.45) * 1.05, (uv.y - 0.24) * 1.20);
  float radial = clamp(length(dUv), 0.0, 1.0);
  float th = clamp(cloud * 0.72 + radial * 0.28, 0.0, 1.0);
  float d = (uSweep - th) / 0.38;
  float s = smoothstep(0.0, 1.0, d);
  float a = 1.0 - s;
  gl_FragColor = vec4(vec3(0.0196, 0.0196, 0.0275) * a, a);
}
`;

/**
 * Generates the 100% Pure Vector SVG Fixed Celestial Sun-Clock (facing in-game 08:10 time),
 * Soft Calligraphic Paintbrush-Written 'Amarante' Wordmark (which writes on the plain black
 * screen and then smoothly glides up into the sky lockup), Heart-Notched Sakura Blossom
 * Branches, and Golden Diamond Swash.
 */
const AMARANTE_GLYPHS = [
  {
    "ch": "A",
    "x": 211.26,
    "w": 97.25,
    "d": "M 205.68 274 Q 205.03 274 205.03 273.02 Q 205.03 272.03 205.68 272.03 Q 209.95 272.03 215.93 267.52 Q 221.92 263.01 227.82 252.35 L 273.91 170.02 Q 274.24 169.37 275.47 169.53 Q 276.7 169.7 276.86 170.19 L 293.59 260.22 Q 294.41 264.65 295.23 267.28 Q 296.05 269.9 298.18 270.97 Q 300.31 272.03 304.74 272.03 Q 305.4 272.03 305.4 273.02 Q 305.4 274 304.74 274 Q 300.64 274 296.38 273.67 Q 292.11 273.34 287.03 273.34 Q 282.11 273.34 278.17 273.67 Q 274.24 274 270.14 274 Q 269.48 274 269.48 273.02 Q 269.48 272.03 270.14 272.03 Q 276.86 272.03 278.75 269.57 Q 280.63 267.11 279.32 260.22 L 265.87 188.23 L 273.42 178.39 L 232.58 252.68 Q 228.48 259.9 228.07 264.16 Q 227.66 268.42 230.69 270.23 Q 233.73 272.03 239.96 272.03 Q 240.62 272.03 240.62 273.02 Q 240.62 274 239.8 274 Q 236.19 274 230.94 273.67 Q 225.69 273.34 220.77 273.34 Q 216.02 273.34 212.98 273.67 Q 209.95 274 205.68 274 Z M 240.62 233.82 L 243.08 229.72 L 278.66 229.72 L 278.99 233.82 Z",
    "ductus": "M 206 286 L 286 146 L 304 286 M 224 236 L 308 232"
  },
  {
    "ch": "m",
    "x": 308.51,
    "w": 110.21,
    "d": "M 398.55 275.48 Q 393.46 275.48 392.15 271.54 Q 390.84 267.6 392.15 259.4 L 397.07 233.33 Q 398.55 224.96 397.4 220.95 Q 396.25 216.93 392.64 216.93 Q 388.38 216.93 383.3 223.16 Q 378.21 229.39 373.54 241.69 Q 368.86 253.99 365.75 272.36 L 363.29 272.2 Q 366.57 252.35 372.14 238.08 Q 377.72 223.82 384.94 216.19 Q 392.15 208.56 400.02 208.56 Q 406.42 208.56 408.96 213.73 Q 411.5 218.9 409.54 230.21 L 404.29 259.4 Q 403.47 264.16 404.21 265.96 Q 404.94 267.77 406.42 267.77 Q 408.39 267.77 410.68 265.96 Q 412.98 264.16 415.77 261.37 Q 416.42 260.72 417.08 261.37 Q 417.74 262.03 417.08 262.68 Q 412 268.75 407.57 272.11 Q 403.14 275.48 398.55 275.48 Z M 321.8 275.31 Q 318.84 275.31 317.86 274.98 Q 316.88 274.66 316.88 274.16 Q 316.88 273.51 317.78 269.9 Q 318.68 266.29 319.34 262.19 L 326.06 225.29 Q 327.54 216.76 323.6 216.76 Q 321.8 216.76 319.25 218.49 Q 316.71 220.21 313.43 223.65 Q 312.94 224.31 312.2 223.57 Q 311.46 222.83 312.12 222.18 Q 317.86 215.29 322.62 212.25 Q 327.37 209.22 331.8 209.22 Q 336.56 209.22 338.03 212.83 Q 339.51 216.44 338.03 223.82 L 329.5 272.36 Q 328.85 275.31 321.8 275.31 Z M 358.04 275.31 Q 355.25 275.31 354.27 274.98 Q 353.28 274.66 353.28 274.16 Q 353.28 273.51 354.19 269.74 Q 355.09 265.96 355.74 261.86 L 360.99 233.16 Q 362.47 224.64 361.16 220.78 Q 359.84 216.93 356.24 216.93 Q 351.81 216.93 346.64 223.41 Q 341.48 229.88 336.97 242.27 Q 332.46 254.65 329.5 272.36 L 326.88 272.2 Q 330 252.68 335.57 238.41 Q 341.15 224.14 348.45 216.35 Q 355.74 208.56 363.78 208.56 Q 370.01 208.56 372.72 213.65 Q 375.42 218.73 373.46 230.05 L 365.75 272.36 Q 365.42 275.31 358.04 275.31 Z",
    "ductus": "M 326 194 L 312 284 M 322 222 C 344 192, 366 194, 362 224 L 352 284 M 362 222 C 386 192, 408 194, 406 224 L 398 284"
  },
  {
    "ch": "a",
    "x": 418.72,
    "w": 70.68,
    "d": "M 432.17 276.13 Q 426.76 276.13 423.64 272.11 Q 420.52 268.1 421.84 259.08 Q 422.98 250.55 427.49 241.69 Q 432 232.84 438.48 225.29 Q 444.96 217.75 452.34 213.16 Q 459.72 208.56 466.44 208.56 Q 469.56 208.56 472.84 209.71 Q 476.12 210.86 478.5 213.57 Q 480.88 216.27 481.2 220.54 L 472.35 215.45 Q 474.81 215.12 477.76 212.83 Q 480.71 210.53 482.35 207.25 Q 482.68 206.76 483.58 207.01 Q 484.48 207.25 484.32 207.58 L 474.81 259.4 Q 473.33 267.77 476.94 267.77 Q 478.58 267.77 481.04 266.05 Q 483.5 264.32 486.45 261.37 Q 486.94 260.88 487.6 261.54 Q 488.26 262.19 487.76 262.68 Q 482.68 268.75 478.17 272.11 Q 473.66 275.48 469.4 275.48 Q 464.64 275.48 463 271.7 Q 461.36 267.93 462.67 259.4 L 466.77 236.44 L 470.05 233.66 Q 465.79 246.78 459.39 256.29 Q 453 265.8 445.94 270.97 Q 438.89 276.13 432.17 276.13 Z M 441.19 265.47 Q 445.29 265.47 449.55 262.19 Q 453.82 258.91 457.59 253.66 Q 461.36 248.42 464.07 242.43 Q 466.77 236.44 467.76 231.2 Q 469.07 224.14 466.69 219.96 Q 464.31 215.78 459.06 215.78 Q 454.14 215.94 449.14 220.13 Q 444.14 224.31 440.37 231.44 Q 436.6 238.58 434.96 247.76 Q 433.48 257.44 435.37 261.45 Q 437.25 265.47 441.19 265.47 Z",
    "ductus": "M 480 204 C 444 188, 418 238, 432 276 C 446 288, 472 262, 482 200 L 472 284"
  },
  {
    "ch": "r",
    "x": 489.4,
    "w": 55.76,
    "d": "M 509.9 272.36 L 508.26 272.2 Q 509.9 263.83 512.12 255.06 Q 514.33 246.28 517.04 238.08 Q 519.74 229.88 523.02 223.41 Q 526.3 216.93 529.99 213.07 Q 533.68 209.22 537.62 209.22 Q 540.08 209.22 542.7 210.53 Q 545.33 211.84 546.97 214.06 Q 548.61 216.27 548.12 218.9 Q 547.79 221.03 546.07 223 Q 544.34 224.96 541.56 224.96 Q 539.1 224.96 537.54 223.65 Q 535.98 222.34 534.59 221.03 Q 533.19 219.72 531.55 219.72 Q 529.58 219.72 527.12 223.41 Q 524.66 227.1 522.04 233 Q 519.42 238.9 517.04 245.96 Q 514.66 253.01 512.86 259.98 Q 511.05 266.95 509.9 272.36 Z M 502.2 275.31 Q 499.24 275.31 498.26 274.98 Q 497.28 274.66 497.28 274.16 Q 497.28 273.51 498.26 269.74 Q 499.24 265.96 499.9 261.86 L 506.13 227.42 Q 506.95 223.32 506.71 221.03 Q 506.46 218.73 505.64 217.75 Q 504.82 216.76 503.51 216.76 Q 501.7 216.76 499.24 218.49 Q 496.78 220.21 493.83 223.16 Q 493.34 223.65 492.68 223 Q 492.03 222.34 492.52 221.68 Q 498.1 215.12 502.69 212.17 Q 507.28 209.22 511.71 209.22 Q 515.15 209.22 516.87 210.94 Q 518.6 212.66 518.92 216.35 Q 519.25 220.04 518.27 226.11 L 509.9 272.36 Q 509.58 275.31 502.2 275.31 Z",
    "ductus": "M 508 196 L 496 284 M 504 228 C 518 196, 534 196, 546 206"
  },
  {
    "ch": "a",
    "x": 545.16,
    "w": 70.68,
    "d": "M 558.61 276.13 Q 553.2 276.13 550.08 272.11 Q 546.97 268.1 548.28 259.08 Q 549.43 250.55 553.94 241.69 Q 558.45 232.84 564.93 225.29 Q 571.4 217.75 578.78 213.16 Q 586.16 208.56 592.89 208.56 Q 596 208.56 599.28 209.71 Q 602.56 210.86 604.94 213.57 Q 607.32 216.27 607.65 220.54 L 598.79 215.45 Q 601.25 215.12 604.2 212.83 Q 607.16 210.53 608.8 207.25 Q 609.12 206.76 610.03 207.01 Q 610.93 207.25 610.76 207.58 L 601.25 259.4 Q 599.78 267.77 603.38 267.77 Q 605.02 267.77 607.48 266.05 Q 609.94 264.32 612.9 261.37 Q 613.39 260.88 614.04 261.54 Q 614.7 262.19 614.21 262.68 Q 609.12 268.75 604.61 272.11 Q 600.1 275.48 595.84 275.48 Q 591.08 275.48 589.44 271.7 Q 587.8 267.93 589.12 259.4 L 593.22 236.44 L 596.5 233.66 Q 592.23 246.78 585.84 256.29 Q 579.44 265.8 572.39 270.97 Q 565.34 276.13 558.61 276.13 Z M 567.63 265.47 Q 571.73 265.47 576 262.19 Q 580.26 258.91 584.03 253.66 Q 587.8 248.42 590.51 242.43 Q 593.22 236.44 594.2 231.2 Q 595.51 224.14 593.13 219.96 Q 590.76 215.78 585.51 215.78 Q 580.59 215.94 575.59 220.13 Q 570.58 224.31 566.81 231.44 Q 563.04 238.58 561.4 247.76 Q 559.92 257.44 561.81 261.45 Q 563.7 265.47 567.63 265.47 Z",
    "ductus": "M 606 204 C 570 188, 544 238, 558 276 C 572 288, 598 262, 608 200 L 598 284"
  },
  {
    "ch": "n",
    "x": 615.85,
    "w": 75.77,
    "d": "M 671.28 275.48 Q 666.36 275.48 664.97 271.54 Q 663.57 267.6 665.05 259.4 L 669.8 233.33 Q 673.08 216.93 664.88 216.93 Q 659.96 216.93 654.63 223.32 Q 649.3 229.72 644.63 242.1 Q 639.96 254.48 637 272.36 L 634.22 272.2 Q 637.66 252.68 643.32 238.41 Q 648.98 224.14 656.44 216.35 Q 663.9 208.56 672.1 208.56 Q 679.15 208.56 681.78 213.73 Q 684.4 218.9 682.43 230.21 L 677.02 259.4 Q 676.2 264.16 676.94 265.96 Q 677.68 267.77 679.32 267.77 Q 681.12 267.77 683.5 265.96 Q 685.88 264.16 688.66 261.37 Q 689.16 260.72 689.89 261.37 Q 690.63 262.03 689.98 262.68 Q 684.89 268.75 680.46 272.11 Q 676.04 275.48 671.28 275.48 Z M 629.13 275.31 Q 626.18 275.31 625.2 274.98 Q 624.21 274.66 624.21 274.16 Q 624.21 273.51 625.11 269.82 Q 626.02 266.13 626.67 261.86 L 633.4 225.29 Q 634.87 216.76 630.94 216.76 Q 629.13 216.76 626.59 218.49 Q 624.05 220.21 620.77 223.65 Q 620.28 224.31 619.54 223.57 Q 618.8 222.83 619.46 222.18 Q 625.2 215.29 629.95 212.25 Q 634.71 209.22 639.14 209.22 Q 643.89 209.22 645.37 212.83 Q 646.84 216.44 645.37 223.82 L 637 272.36 Q 636.18 275.31 629.13 275.31 Z",
    "ductus": "M 634 196 L 620 284 M 630 224 C 654 192, 678 194, 676 224 L 668 284"
  },
  {
    "ch": "t",
    "x": 691.62,
    "w": 47.4,
    "d": "M 711.95 275.97 Q 708.34 275.97 705.06 274.66 Q 701.78 273.34 700.31 269.82 Q 698.83 266.29 699.98 259.73 L 706.54 223.82 Q 707.52 218.24 706.62 216.6 Q 705.72 214.96 700.96 214.96 Q 700.31 214.96 700.39 213.81 Q 700.47 212.66 700.96 212.66 Q 708.18 212.66 712.85 208.48 Q 717.53 204.3 719.99 198.72 Q 720.15 198.23 721.63 198.4 Q 723.1 198.56 722.94 199.22 L 712.77 256.12 Q 711.62 262.19 713.59 265.06 Q 715.56 267.93 720.64 267.93 Q 724.42 267.93 727.94 266.21 Q 731.47 264.49 735.08 261.37 Q 735.4 261.04 736.14 261.7 Q 736.88 262.36 736.39 262.85 Q 729.01 269.9 723.27 272.93 Q 717.53 275.97 711.95 275.97 Z M 736.55 218.4 Q 736.22 218.4 733.11 217.99 Q 729.99 217.58 725.65 217.09 Q 721.3 216.6 716.87 216.6 L 717.2 212.17 Q 722.28 212.17 727.04 211.84 Q 731.8 211.52 735.49 211.19 Q 739.18 210.86 740.65 210.86 Q 741.47 210.86 741.72 211.43 Q 741.96 212.01 741.8 212.66 Q 741.64 213.98 739.91 216.19 Q 738.19 218.4 736.55 218.4 Z",
    "ductus": "M 720 162 L 702 284 M 690 204 L 738 202"
  },
  {
    "ch": "e",
    "x": 739.01,
    "w": 57.73,
    "d": "M 764.92 275.97 Q 755.74 275.97 750.49 271.29 Q 745.24 266.62 743.69 259.24 Q 742.13 251.86 743.77 243.66 Q 744.92 237.43 748.36 231.11 Q 751.8 224.8 756.97 219.72 Q 762.14 214.63 768.7 211.6 Q 775.26 208.56 782.8 208.56 Q 789.2 208.56 792.39 210.86 Q 795.59 213.16 795.1 217.42 Q 794.61 221.52 790.75 225.37 Q 786.9 229.23 780.59 232.26 Q 774.27 235.3 766.56 237.43 Q 758.86 239.56 750.66 240.54 L 750.98 238.41 Q 762.96 236.61 771.07 232.43 Q 779.19 228.24 780.5 220.86 Q 781.32 216.93 779.52 214.96 Q 777.72 212.99 774.6 212.99 Q 770.34 212.99 766.89 216.35 Q 763.45 219.72 761.07 225.46 Q 758.69 231.2 757.54 238.25 Q 756.07 246.94 757.3 253.91 Q 758.53 260.88 762.63 265.06 Q 766.73 269.24 773.45 269.24 Q 776.9 269.24 781 268.1 Q 785.1 266.95 788.87 264.16 Q 789.2 263.83 789.77 264.49 Q 790.34 265.14 790.02 265.47 Q 783.78 271.21 777.39 273.59 Q 770.99 275.97 764.92 275.97 Z",
    "ductus": "M 742 238 C 782 236, 792 208, 774 198 C 750 190, 734 236, 748 276 C 760 288, 784 276, 800 262"
  }
];

function buildPureSvgCelestialTitleLockup() {
  const ROMANS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  let ticksSvg = '';
  for (let i = 0; i < 60; i++) {
    const deg = i * 6;
    const isMajor = i % 5 === 0;
    const y1 = isMajor ? -90 : -93.5;
    const y2 = -98;
    const sw = isMajor ? 1.4 : 0.75;
    const op = isMajor ? 0.92 : 0.52;
    ticksSvg += `<line x1="0" y1="${y1}" x2="0" y2="${y2}" stroke="#fffbeb" stroke-width="${sw}" opacity="${op}" transform="rotate(${deg})"/>`;
    if (isMajor) {
      ticksSvg += `<line x1="0" y1="-50" x2="0" y2="-67" stroke="#fde68a" stroke-width="1.05" opacity="0.72" transform="rotate(${deg})"/>`;
    }
  }

  let numeralsSvg = '';
  for (let i = 0; i < 12; i++) {
    const deg = i * 30;
    numeralsSvg += `
      <g class="af-svg-numeral" data-num-idx="${i}" transform="rotate(${deg}) translate(0, -76)">
        <text x="0" y="4" text-anchor="middle" font-family="'Cinzel', 'Cormorant Garamond', Georgia, serif" font-size="12.5" font-weight="600" fill="#fffbeb" letter-spacing="0.03em">${ROMANS[i]}</text>
      </g>`;
  }

  const CROWN_SPECS = [
    { deg: -58, scale: 0.78 },
    { deg: -29, scale: 0.92 },
    { deg: 0, scale: 1.12 },
    { deg: 29, scale: 0.92 },
    { deg: 58, scale: 0.78 },
  ];
  const crownsSvg = CROWN_SPECS.map(
    (c, idx) => `
      <g class="af-svg-crown-wrap" transform="rotate(${c.deg}) translate(0, -100)">
        <g class="af-svg-crown" data-crown-idx="${idx}" data-base-scale="${c.scale}">
          <circle cx="0" cy="-14" r="18" fill="url(#afCrownAura)"/>
          <path d="M-1.5 0 C-11 -5, -15 -18, -7.5 -24 C-3 -19, -1 -10, -0.5 0 Z" fill="url(#afLotusSideGrad)" stroke="#fef08a" stroke-width="0.85"/>
          <path d="M1.5 0 C11 -5, 15 -18, 7.5 -24 C3 -19, 1 -10, 0.5 0 Z" fill="url(#afLotusSideGrad)" stroke="#fef08a" stroke-width="0.85"/>
          <path d="M0 2 C-8.5 -7, -8.5 -22, 0 -31 C8.5 -22, 8.5 -7, 0 2 Z" fill="url(#afLotusCenterGrad)" stroke="#fffbeb" stroke-width="1.0"/>
          <line x1="0" y1="0" x2="0" y2="-25" stroke="#fffbeb" stroke-width="0.8" opacity="0.75"/>
          <polygon points="0,-3.5 3.8,0.5 0,4.5 -3.8,0.5" fill="#fffbeb"/>
        </g>
      </g>`
  ).join('');

  function sakuraBlossomSvg(idx, x, y, scale = 1.0, rot = 0) {
    let petals = '';
    for (let p = 0; p < 5; p++) {
      const a = p * 72;
      petals += `<path d="M 0 -2 C -7.5 -9, -11.5 -21, -3.8 -25.5 L 0 -21.5 L 3.8 -25.5 C 11.5 -21, 7.5 -9, 0 -2 Z" fill="url(#afSakuraPetalGrad)" stroke="#f472b6" stroke-width="0.75" transform="rotate(${a})"/>`;
    }
    let stamens = '';
    for (let s = 0; s < 10; s++) {
      const a = s * 36 + 12;
      const rLen = s % 2 === 0 ? 8.5 : 6.5;
      stamens += `
        <g transform="rotate(${a})">
          <line x1="0" y1="-1.5" x2="0" y2="-${rLen}" stroke="#f59e0b" stroke-width="0.8"/>
          <circle cx="0" cy="-${rLen}" r="1.25" fill="#fef08a"/>
        </g>`;
    }
    return `
      <g class="af-svg-blossom-pos" transform="translate(${x}, ${y}) rotate(${rot})">
        <g class="af-svg-blossom" data-blossom-idx="${idx}" data-base-scale="${scale}">
          ${petals}
          <circle cx="0" cy="0" r="3.2" fill="#ec4899" opacity="0.55"/>
          ${stamens}
          <circle cx="0" cy="0" r="1.6" fill="#fffbeb"/>
        </g>
      </g>`;
  }

  function sakuraBudSvg(idx, x, y, scale = 1.0, rot = 0) {
    return `
      <g class="af-svg-blossom-pos" transform="translate(${x}, ${y}) rotate(${rot})">
        <g class="af-svg-blossom" data-blossom-idx="${idx}" data-base-scale="${scale}">
          <path d="M 0 0 C -5 -5, -5.5 -14, 0 -18 C 5.5 -14, 5 -5, 0 0 Z" fill="url(#afSakuraBudGrad)" stroke="#ec4899" stroke-width="0.75"/>
          <path d="M 0 1 C -3.5 -1, -4 -6, -1.5 -8 C 0 -5, 1.5 -5, 2.5 -7.5 C 4 -5, 3 -1, 0 1 Z" fill="#a3b86c" stroke="#7c8f46" stroke-width="0.6"/>
        </g>
      </g>`;
  }

  function sakuraLeafSvg(idx, x, y, scale = 1.0, rot = 0) {
    return `
      <g class="af-svg-blossom-pos" transform="translate(${x}, ${y}) rotate(${rot})">
        <g class="af-svg-blossom" data-blossom-idx="${idx}" data-base-scale="${scale}">
          <path d="M 0 0 C -4.5 -5, -4 -14, 0 -19 C 4 -14, 4.5 -5, 0 0 Z" fill="url(#afLeafGrad)" stroke="#8fa352" stroke-width="0.65"/>
          <line x1="0" y1="-1" x2="0" y2="-16" stroke="#fef08a" stroke-width="0.6" opacity="0.75"/>
        </g>
      </g>`;
  }

  const glyphClipPathsSvg = AMARANTE_GLYPHS.map(
    (g, idx) => `
      <clipPath id="afGlyphClip-${idx}">
        <path d="${g.d}" />
      </clipPath>`
  ).join('');

  const glyphGroupsSvg = AMARANTE_GLYPHS.map(
    (g, idx) => `
      <g class="af-svg-glyph" data-glyph-idx="${idx}">
        <!-- Option 1 & Option 3: Exact TrueType Vector Outline + Solid Ivory Fill -->
        <path
          class="af-glyph-contour"
          data-gcontour-idx="${idx}"
          d="${g.d}"
          fill="none"
          stroke="url(#afGoldLineGrad)"
          stroke-width="1.65"
          stroke-linecap="round"
          stroke-linejoin="round"
          pathLength="100"
          stroke-dasharray="100 120"
          stroke-dashoffset="105"
          opacity="0"
        />
        <path
          class="af-glyph-fill"
          data-gfill-idx="${idx}"
          d="${g.d}"
          fill="#fffdf9"
          opacity="0"
        />
        <!-- Option 2: Clip-Isolated Calligraphic Ribbon Ductus (Zero Bleed, Zero Yellow Dot) -->
        <g clip-path="url(#afGlyphClip-${idx})">
          <path
            class="af-glyph-ductus"
            data-gductus-idx="${idx}"
            d="${g.ductus}"
            fill="none"
            stroke="#fffdf9"
            stroke-width="64"
            stroke-linecap="butt"
            stroke-linejoin="round"
            pathLength="100"
            stroke-dasharray="100 120"
            stroke-dashoffset="105"
            opacity="0"
          />
        </g>
      </g>`
  ).join('');

  return `
    <svg class="af-pure-celestial-svg" viewBox="0 0 970 348" fill="none" aria-hidden="true">
      <defs>
        <filter id="afWordShadow" x="-15%" y="-15%" width="130%" height="135%">
          <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.32"/>
        </filter>
        <filter id="afGoldGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="3.5" flood-color="#fde047" flood-opacity="0.75"/>
        </filter>
        ${glyphClipPathsSvg}
        <radialGradient id="afCrownAura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fffbeb" stop-opacity="0.88"/>
          <stop offset="55%" stop-color="#fde047" stop-opacity="0.42"/>
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="afGoldLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fffbeb"/>
          <stop offset="50%" stop-color="#fde68a"/>
          <stop offset="100%" stop-color="#eab308"/>
        </linearGradient>
        <linearGradient id="afLotusCenterGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stop-color="#fffef7"/>
          <stop offset="55%" stop-color="#fde68a"/>
          <stop offset="100%" stop-color="#d97706"/>
        </linearGradient>
        <linearGradient id="afLotusSideGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stop-color="#fef9c3"/>
          <stop offset="65%" stop-color="#fbbf24"/>
          <stop offset="100%" stop-color="#b45309"/>
        </linearGradient>
        <radialGradient id="afSakuraPetalGrad" cx="50%" cy="85%" r="85%">
          <stop offset="0%" stop-color="#f43f5e"/>
          <stop offset="35%" stop-color="#fbcfe8"/>
          <stop offset="100%" stop-color="#fff5f8"/>
        </radialGradient>
        <linearGradient id="afSakuraBudGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stop-color="#fff1f5"/>
          <stop offset="55%" stop-color="#f472b6"/>
          <stop offset="100%" stop-color="#db2777"/>
        </linearGradient>
        <linearGradient id="afLeafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#d9e89c"/>
          <stop offset="100%" stop-color="#849b48"/>
        </linearGradient>
        <linearGradient id="afBranchWoodGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#d4a359"/>
          <stop offset="50%" stop-color="#b47d34"/>
          <stop offset="100%" stop-color="#fde68a"/>
        </linearGradient>
      </defs>

      <!-- 1. FIXED CELESTIAL GOLDEN SUN-CLOCK AROUND THE ACTUAL BACKGROUND SUN (274, 148) -->
      <g id="af-svg-sunclock" transform="translate(274, 148)">
        <!-- Outer & Inner Astrolabe Rings (Framing the actual sun in the sky, completely still) -->
        <circle
          id="af-svg-ring-outer"
          cx="0"
          cy="0"
          r="98"
          stroke="url(#afGoldLineGrad)"
          stroke-width="1.8"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
          transform="rotate(-90)"
        />
        <circle
          id="af-svg-ring-inner"
          cx="0"
          cy="0"
          r="67"
          stroke="url(#afGoldLineGrad)"
          stroke-width="1.25"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
          transform="rotate(-90)"
        />
        <circle
          id="af-svg-ring-whisper"
          cx="0"
          cy="0"
          r="105"
          stroke="#fef08a"
          stroke-width="0.75"
          stroke-dasharray="2.5 6.5"
          opacity="0"
        />

        <!-- Fixed Astrolabe Ticks & Roman Numerals (Zero rotation) -->
        <g id="af-svg-dial-orbit">
          ${ticksSvg}
          ${numeralsSvg}
        </g>

        <!-- Fixed Clock Hands Facing In-Game Time (08:10 Morning: Hour at 245 deg [VIII], Minute at 60 deg [II]) -->
        <g id="af-svg-hand-orbit">
          <!-- Hour Hand pointing fixed at 08:10 (245 deg) -->
          <g id="af-svg-hour-hand" transform="rotate(245)">
            <line x1="0" y1="-36" x2="0" y2="-78" stroke="#fffbeb" stroke-width="2.1" stroke-linecap="round"/>
            <polygon points="0,-84 -3.8,-74 0,-77 3.8,-74" fill="#fffbeb"/>
          </g>
          <!-- Minute Hand pointing fixed at :10 (60 deg) -->
          <g id="af-svg-minute-hand" transform="rotate(60)">
            <line x1="0" y1="-36" x2="0" y2="-93" stroke="#fde68a" stroke-width="1.4" stroke-linecap="round"/>
            <polygon points="0,-99 -3.0,-90 0,-93 3.0,-90" fill="#fde68a"/>
          </g>
          <!-- Fixed Cardinal Markers -->
          <polygon points="0,-98 -3,-104 0,-102 3,-104" fill="#fde047"/>
          <polygon points="0,98 -3,104 0,102 3,104" fill="#fde047"/>
          <polygon points="-98,0 -104,-3 -102,0 -104,3" fill="#fde047"/>
          <polygon points="98,0 104,-3 102,0 104,3" fill="#fde047"/>
        </g>

        <!-- Fixed Outer Golden Rim Accent -->
        <circle
          id="af-sunclock-progress-arc"
          class="af-sunclock-progress-arc"
          cx="0"
          cy="0"
          r="98"
          stroke="#fffbeb"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-dasharray="615.8"
          stroke-dashoffset="615.8"
        />

        <!-- 5 Sculpted Golden Lotus-Bud Crowns -->
        ${crownsSvg}
      </g>

      <!-- 2. TRUE VECTOR 'AMARANTE' GLYPHS (3 Professional Reveal Options, Zero Yellow Dot) -->
      <g id="af-svg-wordmark-mover">
        <g id="af-svg-wordmark">
          ${glyphGroupsSvg}
          <line
            id="af-opt3-gold-thread"
            x1="310"
            y1="296"
            x2="698"
            y2="296"
            stroke="url(#afGoldLineGrad)"
            stroke-width="1.35"
            stroke-linecap="round"
            pathLength="100"
            stroke-dasharray="100 120"
            stroke-dashoffset="105"
            opacity="0"
          />
        </g>
      </g>

      <!-- 3. GOLDEN DIAMOND SWASH UNDERLINE (Draws outward from center diamond at 496, 308) -->
      <g id="af-svg-swash">
        <path
          id="af-svg-swash-left"
          d="M 480 308 C 432 308, 385 322, 315 315 C 262 310, 224 298, 196 290"
          stroke="url(#afGoldLineGrad)"
          stroke-width="1.85"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
        />
        <path
          id="af-svg-swash-right"
          d="M 512 308 C 560 308, 612 294, 686 301 C 738 306, 774 316, 806 303"
          stroke="url(#afGoldLineGrad)"
          stroke-width="1.85"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
        />
        <g id="af-svg-swash-diamond" transform="translate(496, 308) scale(0)">
          <path d="M 0 -11 L 3.2 -3.2 L 11 0 L 3.2 3.2 L 0 11 L -3.2 3.2 L -11 0 L -3.2 -3.2 Z" fill="#fffbeb" stroke="#f59e0b" stroke-width="0.9"/>
          <circle cx="0" cy="0" r="2.2" fill="#f59e0b"/>
          <circle cx="-14" cy="0" r="1.6" fill="#fde68a"/>
          <circle cx="14" cy="0" r="1.6" fill="#fde68a"/>
        </g>
      </g>

      <!-- 4. VECTOR SAKURA BLOSSOM BRANCHES (Stems draw via stroke-dashoffset, then blossoms bloom) -->
      <g id="af-svg-sakura-branches">
        <!-- Branch A: Wrapping left stem of 'A' -->
        <path
          class="af-svg-branch-stem"
          data-stem-idx="0"
          d="M 314 278 C 258 270, 204 278, 142 256"
          stroke="url(#afBranchWoodGrad)"
          stroke-width="3.2"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
        />
        <!-- Branch B: Sweeping directly from 'r-a' across 'n-t-e' -->
        <path
          class="af-svg-branch-stem"
          data-stem-idx="1"
          d="M 442 204 C 508 198, 566 166, 636 140 C 686 122, 728 110, 764 96"
          stroke="url(#afBranchWoodGrad)"
          stroke-width="3.4"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
        />
        <path
          class="af-svg-branch-stem"
          data-stem-idx="2"
          d="M 566 166 C 594 142, 612 116, 620 90"
          stroke="url(#afBranchWoodGrad)"
          stroke-width="2.2"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
        />
        <!-- Branch C: Curling around right of 'e' -->
        <path
          class="af-svg-branch-stem"
          data-stem-idx="3"
          d="M 724 290 C 774 296, 808 276, 828 214"
          stroke="url(#afBranchWoodGrad)"
          stroke-width="2.8"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset="100"
        />

        <!-- Leaves, Buds & 5-Petal Notched Sakura Blossoms (Ordered 0..17 for sequential bloom) -->
        ${sakuraLeafSvg(0, 238, 272, 0.85, -48)}
        ${sakuraBlossomSvg(1, 212, 272, 0.74, 18)}
        ${sakuraLeafSvg(2, 190, 244, 0.9, 32)}
        ${sakuraBlossomSvg(3, 174, 254, 1.05, -12)}
        ${sakuraBudSvg(4, 146, 268, 0.85, -68)}

        ${sakuraLeafSvg(5, 516, 190, 0.95, -36)}
        ${sakuraBudSvg(6, 502, 166, 0.82, -18)}
        ${sakuraBlossomSvg(7, 550, 170, 1.04, 14)}
        ${sakuraBudSvg(8, 602, 116, 0.88, -14)}
        ${sakuraLeafSvg(9, 620, 92, 0.82, 15)}
        ${sakuraLeafSvg(10, 626, 146, 0.92, 58)}
        ${sakuraBlossomSvg(11, 658, 134, 1.06, -8)}
        ${sakuraLeafSvg(12, 698, 142, 0.88, 112)}
        ${sakuraBudSvg(13, 732, 104, 0.84, 42)}
        ${sakuraBudSvg(14, 764, 94, 0.76, 55)}

        ${sakuraBlossomSvg(15, 792, 274, 0.78, -22)}
        ${sakuraBlossomSvg(16, 816, 256, 0.94, 16)}
        ${sakuraBudSvg(17, 828, 212, 0.82, 8)}
      </g>
    </svg>
  `;
}

const SVG_AMARANTE_SWASH_FLOURISH = `
<svg class="af-title-swash-svg" viewBox="0 0 420 50" fill="none" aria-hidden="true">
  <path
    d="M36 26 C128 8, 254 6, 336 21 C366 27, 372 41, 342 43 C322 44, 314 33, 330 26"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
  />
  <path
    d="M78 28 C156 14, 248 13, 326 23"
    stroke="#fde68a"
    stroke-width="1.15"
    stroke-linecap="round"
    opacity="0.85"
  />
  <path d="M352 23 C344 15, 334 17, 341 25 C345 28, 350 26, 352 23 Z" fill="currentColor" opacity="0.9"/>
  <path d="M376 31 C386 26, 388 35, 377 37 C373 37, 373 33, 376 31 Z" fill="currentColor" opacity="0.9"/>
  <g transform="translate(364, 26)">
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(0)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(72)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(144)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(216)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(288)"/>
    <circle cx="0" cy="0" r="2.6" fill="#fbbf24"/>
  </g>
</svg>
`;

const SVG_BOTANICAL_SPRIG_LEFT = `
<svg class="af-btn-sprig-svg is-left" viewBox="0 0 28 24" fill="none" aria-hidden="true">
  <path d="M22 18 C15 17, 9 13, 5 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M10 12 C8 6, 13 5, 14 10 C14 12, 11 12, 10 12 Z" fill="currentColor"/>
  <path d="M16 15 C16 9, 21 9, 20 14 C19 15, 17 15, 16 15 Z" fill="currentColor"/>
  <path d="M9 14 C4 14, 3 10, 8 10 C10 10, 10 13, 9 14 Z" fill="currentColor"/>
</svg>
`;

const SVG_BOTANICAL_SPRIG_RIGHT = `
<svg class="af-btn-sprig-svg is-right" viewBox="0 0 28 24" fill="none" aria-hidden="true">
  <path d="M6 18 C13 17, 19 13, 23 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M18 12 C20 6, 15 5, 14 10 C14 12, 17 12, 18 12 Z" fill="currentColor"/>
  <path d="M12 15 C12 9, 7 9, 8 14 C9 15, 11 15, 12 15 Z" fill="currentColor"/>
  <path d="M19 14 C24 14, 25 10, 20 10 C18 10, 18 13, 19 14 Z" fill="currentColor"/>
</svg>
`;

const SVG_TOP_EMBLEM_SPRIG = `
<svg class="af-top-emblem-svg" viewBox="0 0 56 32" fill="none" aria-hidden="true">
  <path d="M14 24 C22 19, 32 13, 42 7" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
  <path d="M22 19 C19 12, 24 9, 26 15 C26 17, 24 19, 22 19 Z" fill="currentColor"/>
  <path d="M30 14 C28 7, 33 5, 35 11 C35 13, 32 14, 30 14 Z" fill="currentColor"/>
  <path d="M38 10 C37 4, 42 3, 43 8 C43 10, 40 10, 38 10 Z" fill="currentColor"/>
  <path d="M25 18 C31 19, 33 24, 27 23 C25 22, 24 20, 25 18 Z" fill="currentColor"/>
  <path d="M33 13 C39 14, 41 19, 35 18 C33 17, 32 15, 33 13 Z" fill="currentColor"/>
</svg>
`;

const SVG_TOP_EMBLEM_TRAVELERS = `
<svg class="af-top-emblem-svg" viewBox="0 0 56 32" fill="none" aria-hidden="true">
  <circle cx="23" cy="11" r="4.2" stroke="currentColor" stroke-width="1.65"/>
  <path d="M15.5 23.5 C15.5 18.8, 18.8 16.5, 23 16.5 C27.2 16.5, 30.5 18.8, 30.5 23.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
  <circle cx="34.5" cy="12.5" r="3.6" stroke="currentColor" stroke-width="1.55"/>
  <path d="M29.5 23.5 C30.2 19.6, 32.5 18, 35.5 18 C38.8 18, 41.2 19.8, 41.8 23.5" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>
</svg>
`;

const SVG_CARD_THIN_DIVIDER = `
<svg class="af-card-thin-divider-svg" viewBox="0 0 220 12" fill="none" aria-hidden="true">
  <line x1="16" y1="6" x2="100" y2="6" stroke="currentColor" stroke-width="1.15" opacity="0.72"/>
  <polygon points="110,2.2 114,6 110,9.8 106,6" fill="currentColor" opacity="0.92"/>
  <line x1="120" y1="6" x2="204" y2="6" stroke="currentColor" stroke-width="1.15" opacity="0.72"/>
</svg>
`;

const SVG_PARTNER_BLOSSOM_DIVIDER = `
<svg class="af-partner-blossom-svg" viewBox="0 0 180 24" fill="none" aria-hidden="true">
  <line x1="14" y1="12" x2="72" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.88"/>
  <circle cx="78" cy="12" r="1.5" fill="currentColor"/>
  <g transform="translate(90, 12)">
    <path d="M0 -1.8 C-3.8 -9.8, 3.8 -9.8, 0 -1.8 Z" fill="currentColor" transform="rotate(0)"/>
    <path d="M0 -1.8 C-3.8 -9.8, 3.8 -9.8, 0 -1.8 Z" fill="currentColor" transform="rotate(72)"/>
    <path d="M0 -1.8 C-3.8 -9.8, 3.8 -9.8, 0 -1.8 Z" fill="currentColor" transform="rotate(144)"/>
    <path d="M0 -1.8 C-3.8 -9.8, 3.8 -9.8, 0 -1.8 Z" fill="currentColor" transform="rotate(216)"/>
    <path d="M0 -1.8 C-3.8 -9.8, 3.8 -9.8, 0 -1.8 Z" fill="currentColor" transform="rotate(288)"/>
    <circle cx="0" cy="0" r="2.1" fill="#fbbf24"/>
  </g>
  <circle cx="102" cy="12" r="1.5" fill="currentColor"/>
  <line x1="108" y1="12" x2="166" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.88"/>
</svg>
`;

// Dual-stroke high-contrast architectural pointer lines so they read crisply over sky, foliage, and dirt
const SVG_CALLOUT_POINTER_KNIGHT = `
<svg class="af-callout-pointer-svg is-knight" viewBox="0 0 240 64" fill="none" aria-hidden="true">
  <line x1="20" y1="3" x2="220" y2="3" stroke="#1f1c18" stroke-width="3.2" stroke-linecap="round" opacity="0.32"/>
  <line x1="68" y1="3" x2="112" y2="54" stroke="#1f1c18" stroke-width="3.6" stroke-linecap="round" opacity="0.45"/>
  <line x1="20" y1="3" x2="220" y2="3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="68" y1="3" x2="112" y2="54" stroke="currentColor" stroke-width="2.0" stroke-linecap="round"/>
  <circle cx="114" cy="56" r="5.2" fill="#1f1c18" stroke="#fbbf24" stroke-width="2.0"/>
  <circle cx="114" cy="56" r="2.1" fill="#fde68a"/>
</svg>
`;

const SVG_CALLOUT_POINTER_MAGE = `
<svg class="af-callout-pointer-svg is-mage" viewBox="0 0 240 64" fill="none" aria-hidden="true">
  <line x1="20" y1="3" x2="220" y2="3" stroke="#1f1c18" stroke-width="3.2" stroke-linecap="round" opacity="0.32"/>
  <line x1="172" y1="3" x2="128" y2="54" stroke="#1f1c18" stroke-width="3.6" stroke-linecap="round" opacity="0.45"/>
  <line x1="20" y1="3" x2="220" y2="3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="172" y1="3" x2="128" y2="54" stroke="currentColor" stroke-width="2.0" stroke-linecap="round"/>
  <circle cx="126" cy="56" r="5.2" fill="#1f1c18" stroke="#fbbf24" stroke-width="2.0"/>
  <circle cx="126" cy="56" r="2.1" fill="#fde68a"/>
</svg>
`;

const SVG_KNIGHT_CREST_OUTLINE = `
<svg class="af-role-mini-svg" viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <path d="M14 3.5 L22.5 7.2 V14.5 C22.5 19.8 18.8 23.6 14 25.2 C9.2 23.6 5.5 19.8 5.5 14.5 V7.2 L14 3.5 Z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>
  <path d="M14 7.5 V21.5 M9.5 12.5 H18.5" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/>
</svg>
`;

const SVG_MAGE_CREST_OUTLINE = `
<svg class="af-role-mini-svg" viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <polygon points="14,3.2 21,14 14,24.8 7,14" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>
  <circle cx="14" cy="14" r="3.3" stroke="currentColor" stroke-width="1.45"/>
</svg>
`;

const SVG_SUBMIT_ARROW = `
<svg class="af-submit-arrow-svg" viewBox="0 0 20 20" fill="none" aria-hidden="true">
  <path d="M4.5 10 H15.5 M11 5.5 L15.5 10 L11 14.5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const SVG_COPY_ICON = `
<svg class="af-icon-svg af-copy-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="8" y="7" width="11" height="13" rx="2.2" stroke="currentColor" stroke-width="1.75"/>
  <path d="M15 7V5C15 3.89543 14.1046 3 13 3H6C4.89543 3 4 3.89543 4 5V15C4 16.1046 4.89543 17 6 17H8" stroke="currentColor" stroke-width="1.75"/>
</svg>
`;

const SVG_CHECK_ICON = `
<svg class="af-icon-svg af-check-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

// Data-URI shuffle icon for `#app-flow-active-phrase::after` (preserves pure `.textContent`)
const SHUFFLE_ICON_DATA_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M14.5 4.5L17 7L14.5 9.5M3 7H16.5M5.5 15.5L3 13L5.5 10.5M17 13H3.5' stroke='%239a6b16' stroke-width='1.65' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

/* ------------------------------------------------------------------------- */
/* Multi-Option Artist-Grade Onboarding CSS (`data-onboard-opt="1|2|3"`)      */
/* ------------------------------------------------------------------------- */

const APP_FLOW_CSS = `
  :root,
  [data-env-polarity="day"],
  [data-env-polarity="golden"],
  [data-env-polarity="night"],
  [data-env-polarity="eclipse"] {
    --af-font-sans: "Plus Jakarta Sans", "Outfit", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --af-surface: #faf6ee;
    --af-surface-elevated: #ffffff;
    --af-surface-muted: #f1e9d8;
    --af-border: #d6c7b0;
    --af-border-strong: #bca686;
    --af-ink: #1a1714;
    --af-ink-muted: #574e40;
    --af-sky-ink: #fffdf8;
    --af-sky-shadow:
      0 2px 0 rgba(24, 20, 14, 0.36),
      0 8px 26px rgba(15, 23, 42, 0.42),
      0 1px 4px rgba(15, 23, 42, 0.34);
    --af-accent: #b45309;
    --af-accent-gold: #f59e0b;
    --af-cta-bg: #f6d076;
    --af-cta-border: #c9962c;
    --af-cta-ink: #1f1c18;
  }

  html, body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  #haru-app-flow-root {
    position: fixed;
    inset: 0;
    z-index: 38;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: var(--af-font-sans);
    color: var(--af-ink);
    padding:
      max(18px, env(safe-area-inset-top, 0px))
      max(22px, env(safe-area-inset-right, 0px))
      max(20px, env(safe-area-inset-bottom, 0px))
      max(22px, env(safe-area-inset-left, 0px));
  }

  #haru-app-flow-root[data-step="in_game"] {
    display: none;
  }

  /* ----------------------------------------------------------------------- */
  /* Pitch-Black Canvas + Smooth Organic Noise Dissolve (Zero Window Blinds) */
  /* ----------------------------------------------------------------------- */
  #af-pixel-veil {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: transparent;
    opacity: 1;
    will-change: opacity;
    transition: opacity 380ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  #af-pixel-veil-canvas {
    width: 100%;
    height: 100%;
    display: block;
    opacity: 1;
    pointer-events: none;
  }

  #haru-app-flow-root[data-step="in_game"] {
    display: none !important;
  }

  #af-pixel-veil.is-resolved {
    opacity: 0;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    #af-pixel-veil {
      transition-duration: 150ms;
    }
  }

  .af-scene {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: none;
    pointer-events: none;
    padding:
      max(20px, env(safe-area-inset-top, 0px))
      max(24px, env(safe-area-inset-right, 0px))
      max(24px, env(safe-area-inset-bottom, 0px))
      max(24px, env(safe-area-inset-left, 0px));
  }

  .af-scene.is-active {
    display: flex;
  }

  /* ----------------------------------------------------------------------- */
  /* Shared Open-Air Ivory Hairline & Whisper Glass Foundations              */
  /* ----------------------------------------------------------------------- */
  .af-hairline-frame {
    position: relative;
    pointer-events: auto;
    background: rgba(24, 22, 18, 0.24);
    backdrop-filter: blur(14px) saturate(125%);
    -webkit-backdrop-filter: blur(14px) saturate(125%);
    border: 1px solid rgba(255, 253, 246, 0.78);
    border-radius: 26px;
    box-shadow:
      inset 0 0 0 1px rgba(254, 240, 138, 0.20),
      0 18px 42px rgba(15, 23, 42, 0.22),
      0 4px 12px rgba(15, 23, 42, 0.12);
    color: #fffdf9;
  }

  .af-hairline-pill-btn {
    position: relative;
    appearance: none;
    pointer-events: auto;
    cursor: pointer;
    border-radius: 999px;
    background: rgba(24, 22, 18, 0.22);
    backdrop-filter: blur(12px) saturate(125%);
    -webkit-backdrop-filter: blur(12px) saturate(125%);
    border: 1px solid rgba(255, 253, 246, 0.82);
    box-shadow:
      inset 0 0 0 1px rgba(254, 240, 138, 0.22),
      0 8px 24px rgba(15, 23, 42, 0.18);
    color: #fffdf9;
    text-shadow: 0 1px 6px rgba(15, 23, 42, 0.38);
    font-family: "Playfair Display", "Cormorant Garamond", Georgia, serif;
    font-weight: 700;
    letter-spacing: -0.01em;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
    transition:
      transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
      border-color 180ms ease-out,
      background-color 180ms ease-out,
      box-shadow 180ms ease-out,
      opacity 220ms ease-out;
  }

  .af-hairline-pill-btn:focus-visible,
  .af-copy-btn:focus-visible,
  .af-phrase-input:focus-visible,
  .af-name-input:focus-visible,
  .af-phrase-chip:focus-visible,
  .af-hero-hit-target:focus-visible,
  .af-name-submit-btn:focus-visible,
  .af-solo-dev-btn:focus-visible {
    outline: 2px solid var(--af-accent-gold);
    outline-offset: 3px;
  }

  .af-hairline-pill-btn:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: no-preference) {
    .af-hairline-pill-btn:not(:disabled):active,
    .af-hero-hit-target:active,
    .af-name-submit-btn:active,
    .af-solo-dev-btn:active {
      transform: scale(0.975);
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 1: Fixed Celestial Sun-Clock, Paintbrush Amarante & Glass Pill   */
  /* ----------------------------------------------------------------------- */
  .af-scene-title {
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 0 !important;
  }

  .af-title-stack {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    text-align: center;
  }

  .af-celestial-lockup-wrap {
    position: absolute;
    left: calc(50% - 56.39vh);
    top: 0.80vh;
    width: 113.96vh;
    height: 40.88vh;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .af-pure-celestial-svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }

  .af-pure-celestial-svg.is-settled {
    filter: drop-shadow(0 4px 16px rgba(15, 23, 42, 0.16));
  }

  .af-sunclock-progress-arc {
    transform: rotate(-90deg);
    transform-origin: 0px 0px;
  }

  #af-svg-wordmark-mover {
    will-change: transform;
  }

  /* Drifting Sakura Petals across the Amarante Branch */
  @keyframes afPetalDriftA {
    0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
    20% { opacity: 0.92; }
    80% { opacity: 0.88; }
    100% { transform: translate3d(68px, 44px, 0) rotate(145deg); opacity: 0; }
  }

  @keyframes afPetalDriftB {
    0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
    20% { opacity: 0.88; }
    80% { opacity: 0.82; }
    100% { transform: translate3d(-54px, 48px, 0) rotate(-130deg); opacity: 0; }
  }

  .af-branch-petal {
    position: absolute;
    width: 10px;
    height: 6.5px;
    border-radius: 80% 15% 80% 15%;
    background: linear-gradient(135deg, #ffe4ee 0%, #f48fb1 100%);
    box-shadow: 0 1px 4px rgba(244, 143, 177, 0.32);
    pointer-events: none;
    will-change: transform, opacity;
  }

  .af-branch-petal.p1 { left: 61%; top: 28%; animation: afPetalDriftA 4.4s ease-in-out infinite; }
  .af-branch-petal.p2 { left: 72%; top: 22%; animation: afPetalDriftB 5.1s ease-in-out 1.1s infinite; }
  .af-branch-petal.p3 { left: 21%; top: 64%; animation: afPetalDriftA 4.8s ease-in-out 0.6s infinite; }
  .af-branch-petal.p4 { left: 82%; top: 56%; animation: afPetalDriftB 4.2s ease-in-out 1.9s infinite; }

  .af-main-title.sr-only,
  .af-subtitle.sr-only,
  .af-sakura-divider-svg,
  .af-title-swash-svg {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* ----------------------------------------------------------------------- */
  /* Slightly Larger Open-Air Ivory Hairline & Whisper Glass Pill (Ready Only)*/
  /* ----------------------------------------------------------------------- */
  .af-enter-btn {
    position: absolute;
    left: 50%;
    bottom: max(4.8vh, 22px);
    transform: translateX(-50%);
    width: clamp(268px, 26vw, 336px);
    min-width: 268px;
    max-width: 336px;
    height: 54px;
    min-height: 54px;
    max-height: 54px;
    padding: 0 28px;
    border-radius: 999px;
    background: rgba(24, 22, 18, 0.22) !important;
    backdrop-filter: blur(12px) saturate(125%);
    -webkit-backdrop-filter: blur(12px) saturate(125%);
    border: 1px solid rgba(255, 253, 246, 0.82) !important;
    box-shadow:
      inset 0 0 0 1px rgba(254, 240, 138, 0.24),
      0 8px 24px rgba(15, 23, 42, 0.18) !important;
    color: #fffdf9;
    text-shadow: 0 1px 6px rgba(15, 23, 42, 0.38);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    filter: none;
    transition:
      transform 240ms cubic-bezier(0.16, 1, 0.3, 1),
      opacity 240ms cubic-bezier(0.16, 1, 0.3, 1),
      background-color 220ms ease,
      border-color 220ms ease,
      box-shadow 220ms ease;
  }

  .af-enter-btn.is-loading {
    opacity: 0;
    pointer-events: none;
    cursor: default;
  }

  .af-enter-btn.is-ready {
    opacity: 1;
    pointer-events: auto;
    cursor: pointer;
  }

  @media (hover: hover) {
    .af-enter-btn.is-ready:not(:disabled):hover {
      transform: translateX(-50%) translateY(-1.5px);
      background: rgba(24, 22, 18, 0.32) !important;
      border-color: rgba(255, 253, 246, 0.96) !important;
      box-shadow:
        inset 0 0 0 1px rgba(254, 240, 138, 0.40),
        0 12px 28px rgba(15, 23, 42, 0.24) !important;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .af-enter-btn.is-ready:not(:disabled):active {
      transform: translateX(-50%) scale(0.975);
    }
  }

  .af-morph-progress-fill,
  .af-wax-seal-live-ring,
  .af-morph-loading-layer {
    display: none !important;
  }

  .af-morph-ready-layer {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 24px;
    font-family: "Playfair Display", "Cormorant Garamond", Georgia, serif;
    font-style: normal;
    font-weight: 700;
    font-size: clamp(1.28rem, 2.0vw, 1.52rem);
    letter-spacing: -0.01em;
    color: inherit;
    white-space: nowrap;
    opacity: 1;
    pointer-events: auto;
  }

  .af-prep-spark-svg,
  .af-btn-sprig-svg {
    display: none;
  }

  /* ----------------------------------------------------------------------- */
  /* Optional Loading Scene (kept for direct ?step=loading compatibility)    */
  /* ----------------------------------------------------------------------- */
  .af-scene-loading {
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    padding-bottom: min(9vh, 68px);
  }

  .af-loading-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: min(400px, 86vw);
  }

  .af-loading-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: #fffdf9;
    background: rgba(24, 22, 18, 0.24);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 253, 246, 0.78);
    border-radius: 999px;
    padding: 4px 14px;
    line-height: 1.2;
  }

  .af-loading-stone-bar {
    width: 100%;
    height: 10px;
    padding: 2px;
    border-radius: 999px;
    display: flex;
    align-items: center;
  }

  .af-loading-channel {
    width: 100%;
    height: 100%;
    border-radius: 999px;
    overflow: hidden;
  }

  .af-loading-fill {
    height: 100%;
    width: 62%;
    border-radius: 999px;
    background: #fde68a;
    transition: width 180ms ease-out;
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 2: Meet in the Valley (Glassy Hairline Pills & Whisper Cards)    */
  /* ----------------------------------------------------------------------- */
  .af-scene-create-join {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: min(7.5vh, 58px);
    gap: 18px;
  }

  .af-create-join-header-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 2px;
  }

  .af-create-join-header {
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-style: italic;
    font-size: clamp(2.4rem, 4.2vw, 3.3rem);
    font-weight: 600;
    line-height: 1.08;
    letter-spacing: -0.01em;
    color: var(--af-sky-ink);
    text-shadow: var(--af-sky-shadow);
    margin: 0;
  }

  .af-tablets-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(286px, 352px));
    gap: 24px;
    align-items: stretch;
    max-width: 94vw;
    margin-top: 6px;
  }

  @media (max-width: 660px) {
    .af-tablets-grid {
      grid-template-columns: minmax(268px, 348px);
      gap: 16px;
    }
  }

  .af-world-tablet {
    position: relative;
    padding: 24px 26px 24px 26px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    text-align: center;
    min-height: 252px;
    gap: 14px;
  }

  .af-tablet-top-emblem {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 30px;
    border-radius: 999px;
    background: rgba(255, 253, 246, 0.16);
    border: 1px solid rgba(254, 240, 138, 0.65);
    color: #fef08a;
    pointer-events: none;
    margin-bottom: 2px;
    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.14);
  }

  .af-top-emblem-svg {
    width: 34px;
    height: 20px;
    display: block;
  }

  .af-side-diamond {
    display: none;
  }

  .af-tablet-top-block {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .af-tablet-heading {
    font-family: "Playfair Display", "Cormorant Garamond", Georgia, serif;
    font-size: 1.42rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.18;
    color: #fffdf9;
    text-shadow: 0 1px 6px rgba(15, 23, 42, 0.35);
    margin: 0;
  }

  .af-card-thin-divider-svg {
    width: 168px;
    height: 10px;
    color: rgba(254, 240, 138, 0.72);
    opacity: 0.9;
  }

  /* Glassy Hairline Phrase Selector Pill */
  .af-active-phrase-display {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--af-font-sans);
    font-size: 0.94rem;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #fffdf9;
    background: rgba(24, 22, 18, 0.22);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 253, 246, 0.65);
    border-radius: 999px;
    height: 44px;
    padding: 0 36px 0 18px;
    margin: 8px 0 4px 0;
    cursor: pointer;
    user-select: none;
    width: 92%;
    box-shadow: inset 0 0 0 1px rgba(254, 240, 138, 0.16);
    transition: border-color 150ms ease-out, background-color 150ms ease-out, transform 120ms ease-out;
  }

  .af-active-phrase-display::after {
    content: "";
    position: absolute;
    right: 13px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    background-image: ${SHUFFLE_ICON_DATA_URI};
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    filter: brightness(1.85);
    opacity: 0.9;
  }

  .af-active-phrase-display:hover {
    border-color: rgba(255, 253, 246, 0.95);
    background: rgba(24, 22, 18, 0.34);
  }

  .af-active-phrase-display:active {
    transform: scale(0.985);
  }

  .af-phrase-chips-wrap {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
    opacity: 0;
    pointer-events: none;
  }

  .af-field-group {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    margin: 8px 0 4px 0;
  }

  .af-field-label.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .af-phrase-input {
    width: 92%;
    height: 44px;
    padding: 6px 18px;
    border: 1px solid rgba(255, 253, 246, 0.65);
    border-radius: 999px;
    background: rgba(24, 22, 18, 0.22);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    font-family: var(--af-font-sans);
    font-size: 0.94rem;
    font-weight: 600;
    text-align: center;
    color: #fffdf9;
    box-shadow: inset 0 0 0 1px rgba(254, 240, 138, 0.16);
    transition: border-color 150ms ease-out, box-shadow 150ms ease-out, background-color 150ms ease-out;
  }

  .af-phrase-input:focus {
    border-color: rgba(255, 253, 246, 0.96);
    background: rgba(24, 22, 18, 0.34);
    box-shadow: 0 0 0 3px rgba(254, 240, 138, 0.24);
    outline: none;
  }

  .af-phrase-input::placeholder {
    color: rgba(255, 253, 249, 0.62);
    font-weight: 500;
  }

  /* Glassy Hairline Action Pills for Create & Join */
  .af-domain-action-btn {
    width: 92%;
    min-height: 48px;
    padding: 10px 24px;
    border-radius: 999px;
    background: rgba(255, 253, 246, 0.16);
    backdrop-filter: blur(12px) saturate(125%);
    -webkit-backdrop-filter: blur(12px) saturate(125%);
    color: #fffdf9;
    border: 1px solid rgba(255, 253, 246, 0.86);
    box-shadow:
      inset 0 0 0 1px rgba(254, 240, 138, 0.26),
      0 8px 22px rgba(15, 23, 42, 0.18);
    font-family: "Playfair Display", "Cormorant Garamond", Georgia, serif;
    font-size: 1.12rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    text-shadow: 0 1px 6px rgba(15, 23, 42, 0.36);
    margin: 0 auto;
  }

  @media (hover: hover) {
    .af-domain-action-btn:not(:disabled):hover {
      background: rgba(255, 253, 246, 0.28);
      border-color: #ffffff;
      color: #fffdf9;
      transform: translateY(-1.5px);
      box-shadow:
        inset 0 0 0 1px rgba(254, 240, 138, 0.42),
        0 12px 26px rgba(15, 23, 42, 0.24);
    }
  }

  .af-error-banner {
    pointer-events: auto;
    display: none;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-radius: 999px;
    background: rgba(159, 18, 57, 0.78);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 241, 242, 0.82);
    color: #fff1f2;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .af-error-banner.is-visible {
    display: inline-flex;
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 3: Flower Field 3D Hero Claim (Glassy Hairline Pills & Badges)   */
  /* ----------------------------------------------------------------------- */
  .af-scene-flower-lobby {
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
  }

  #af-lobby-3d-stage {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .af-hero-hit-target {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    appearance: none;
    cursor: pointer;
    min-width: 164px;
    min-height: 220px;
    padding: 0;
    border-radius: 26px;
    background: transparent;
    border: none;
    color: #fffdf9;
    font-family: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    overflow: visible;
    -webkit-tap-highlight-color: transparent;
    transition: transform 150ms ease-out;
  }

  .af-hero-hit-target:hover {
    border: none;
  }

  .af-hero-hit-target.is-claimed .af-hero-ring-badge,
  .af-hero-hit-target.is-partner-claimed .af-hero-ring-badge {
    opacity: 0;
    pointer-events: none;
  }

  #app-flow-claim-knight {
    left: 35%;
    top: 54%;
  }

  #app-flow-claim-mage {
    left: 64%;
    top: 54%;
  }

  .af-hero-ring-badge {
    position: absolute;
    left: 50%;
    top: -8px;
    transform: translate(-50%, -100%);
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 7px 16px 7px 9px;
    border-radius: 999px;
    background: rgba(24, 22, 18, 0.24);
    backdrop-filter: blur(12px) saturate(125%);
    -webkit-backdrop-filter: blur(12px) saturate(125%);
    border: 1px solid rgba(255, 253, 246, 0.82);
    box-shadow:
      inset 0 0 0 1px rgba(254, 240, 138, 0.22),
      0 10px 24px rgba(15, 23, 42, 0.22);
    white-space: nowrap;
    transition: opacity 150ms ease-out, transform 150ms ease-out, border-color 150ms ease-out;
  }

  .af-hero-hit-target:hover .af-hero-ring-badge {
    border-color: #ffffff;
    transform: translate(-50%, calc(-100% - 2px));
  }

  .af-role-mini-svg {
    width: 26px;
    height: 26px;
    padding: 4px;
    border-radius: 50%;
    background: rgba(255, 253, 246, 0.16);
    border: 1px solid rgba(254, 240, 138, 0.72);
    color: #fef08a;
    flex-shrink: 0;
  }

  .af-crest-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.15;
    text-align: start;
  }

  .af-crest-role {
    font-family: "Playfair Display", Georgia, serif;
    font-size: 0.96rem;
    font-weight: 700;
    color: #fffdf9;
  }

  .af-crest-hint {
    font-size: 0.76rem;
    font-weight: 600;
    color: rgba(255, 253, 249, 0.78);
  }

  /* Partner Name Glassy Pill above the other hero */
  #app-flow-partner-tag {
    position: absolute;
    left: 64%;
    top: 28%;
    transform: translate(-50%, -100%);
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: rgba(24, 22, 18, 0.24);
    backdrop-filter: blur(12px) saturate(125%);
    -webkit-backdrop-filter: blur(12px) saturate(125%);
    border: 1px solid rgba(255, 253, 246, 0.82);
    border-radius: 999px;
    padding: 7px 18px;
    box-shadow:
      inset 0 0 0 1px rgba(254, 240, 138, 0.22),
      0 10px 24px rgba(15, 23, 42, 0.22);
    color: #fffdf9;
    font-family: "Playfair Display", Georgia, serif;
    font-size: 1.02rem;
    font-weight: 700;
    line-height: 1.15;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 150ms ease-out;
  }

  #app-flow-partner-tag.is-visible {
    opacity: 1;
  }

  .af-partner-blossom-svg {
    width: 110px;
    height: 16px;
    color: #fef08a;
  }

  /* Floating Glassy Hairline Shoulder Callout ("Your name: Vikas") */
  #app-flow-name-bubble {
    position: absolute;
    left: 28%;
    top: 26%;
    transform: translate(-50%, -50%);
    width: min(304px, 86vw);
    background: rgba(24, 22, 18, 0.26);
    backdrop-filter: blur(14px) saturate(125%);
    -webkit-backdrop-filter: blur(14px) saturate(125%);
    border: 1px solid rgba(255, 253, 246, 0.84);
    border-radius: 999px;
    padding: 8px 10px 8px 18px;
    box-shadow:
      inset 0 0 0 1px rgba(254, 240, 138, 0.24),
      0 14px 30px rgba(15, 23, 42, 0.24);
    pointer-events: auto;
    z-index: 4;
    transition:
      left 220ms cubic-bezier(0.22, 1, 0.36, 1),
      top 220ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 150ms ease-out;
  }

  #app-flow-name-bubble[data-claimed-role="Knight"] {
    left: 28%;
    top: 26%;
  }

  #app-flow-name-bubble[data-claimed-role="Mage"] {
    left: 72%;
    top: 24%;
  }

  .af-name-callout-inner {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }

  .af-name-inline-baseline {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0;
  }

  .af-inline-name-prompt {
    font-family: var(--af-font-sans);
    font-size: 0.9rem;
    font-weight: 600;
    color: rgba(255, 253, 249, 0.82);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .af-name-input {
    flex: 1;
    min-width: 84px;
    height: 32px;
    padding: 0 6px;
    border: none;
    border-bottom: 1.5px solid rgba(255, 253, 246, 0.55);
    background: transparent;
    font-family: "Playfair Display", Georgia, serif;
    font-size: 1.06rem;
    font-weight: 700;
    color: #fffdf9;
  }

  .af-name-input:focus {
    outline: none;
    border-bottom-color: #fef08a;
  }

  .af-name-input::placeholder {
    color: rgba(255, 253, 249, 0.58);
    font-weight: 600;
  }

  .af-name-submit-btn {
    appearance: none;
    cursor: pointer;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid rgba(255, 253, 246, 0.88);
    background: rgba(255, 253, 246, 0.20);
    color: #fffdf9;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: center;
    -webkit-tap-highlight-color: transparent;
    transition: transform 150ms ease-out, background-color 150ms ease-out, border-color 150ms ease-out;
  }

  .af-name-submit-btn:hover {
    background: rgba(255, 253, 246, 0.34);
    border-color: #ffffff;
  }

  .af-submit-arrow-svg {
    width: 15px;
    height: 15px;
  }

  .af-callout-pointer-svg {
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    width: 210px;
    height: 48px;
    color: rgba(255, 253, 246, 0.85);
    pointer-events: none;
    display: none;
  }

  #app-flow-name-bubble[data-claimed-role="Knight"] .af-callout-pointer-svg.is-knight {
    display: block;
  }

  #app-flow-name-bubble[data-claimed-role="Mage"] .af-callout-pointer-svg.is-mage {
    display: block;
  }

  /* Bottom Sanctuary Room-Phrase Dock + Solo Escape Hatch (Glassy Pills) */
  .af-lobby-bottom-row {
    position: relative;
    z-index: 3;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    padding-bottom: 6px;
  }

  .af-lobby-room-bar {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: rgba(24, 22, 18, 0.22);
    backdrop-filter: blur(12px) saturate(125%);
    -webkit-backdrop-filter: blur(12px) saturate(125%);
    border: 1px solid rgba(255, 253, 246, 0.80);
    border-radius: 999px;
    padding: 6px 8px 6px 18px;
    box-shadow:
      inset 0 0 0 1px rgba(254, 240, 138, 0.20),
      0 10px 24px rgba(15, 23, 42, 0.18);
    color: #fffdf9;
  }

  .af-room-phrase-lbl {
    font-family: var(--af-font-sans);
    font-size: 0.94rem;
    font-weight: 600;
    color: #fffdf9;
    white-space: nowrap;
  }

  .af-copy-btn {
    position: relative;
    appearance: none;
    border: 1px solid rgba(255, 253, 246, 0.72);
    background: rgba(255, 253, 246, 0.16);
    color: #fffdf9;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 150ms ease, border-color 150ms ease;
  }

  .af-copy-btn:hover {
    background: rgba(255, 253, 246, 0.30);
    border-color: #ffffff;
  }

  .af-copy-btn .af-icon-svg {
    position: absolute;
    width: 15px;
    height: 15px;
    transition: transform 240ms cubic-bezier(0.2, 0, 0, 1), opacity 240ms cubic-bezier(0.2, 0, 0, 1);
  }

  .af-copy-btn .af-check-svg {
    opacity: 0;
    transform: scale(0.4);
    color: #86efac;
  }

  .af-copy-btn.is-copied .af-copy-svg {
    opacity: 0;
    transform: scale(0.4);
  }

  .af-copy-btn.is-copied .af-check-svg {
    opacity: 1;
    transform: scale(1);
  }

  .af-solo-dev-btn {
    pointer-events: auto;
    appearance: none;
    cursor: pointer;
    border-radius: 999px;
    background: rgba(24, 22, 18, 0.22);
    backdrop-filter: blur(12px) saturate(125%);
    -webkit-backdrop-filter: blur(12px) saturate(125%);
    border: 1px solid rgba(255, 253, 246, 0.82);
    color: #fffdf9;
    padding: 9px 22px;
    font-family: "Playfair Display", Georgia, serif;
    font-size: 0.96rem;
    font-weight: 700;
    box-shadow:
      inset 0 0 0 1px rgba(254, 240, 138, 0.22),
      0 10px 24px rgba(15, 23, 42, 0.18);
    transition: transform 140ms ease-out, background-color 140ms ease-out, border-color 140ms ease-out;
  }

  .af-solo-dev-btn:hover {
    background: rgba(24, 22, 18, 0.34);
    border-color: #ffffff;
  }

  @media (max-width: 780px) {
    #app-flow-name-bubble[data-claimed-role="Knight"],
    #app-flow-name-bubble[data-claimed-role="Mage"] {
      left: 50%;
      top: 64%;
    }
  }

  @media (max-width: 932px) and (max-height: 520px), (max-width: 660px) {
    .af-scene-create-join {
      padding-top: max(12px, env(safe-area-inset-top, 12px));
      padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
      gap: 10px;
      overflow-y: auto;
      max-height: 100dvh;
    }

    .af-create-join-header {
      font-size: clamp(1.55rem, 3.4vw, 2.1rem);
    }

    .af-tablets-grid {
      gap: 12px;
      margin-top: 2px;
    }

    .af-world-tablet {
      min-height: 176px;
      padding: 14px 18px;
      gap: 8px;
    }

    .af-tablet-heading {
      font-size: 1.12rem;
    }

    .af-active-phrase-display,
    .af-phrase-input {
      height: 36px;
      font-size: 0.86rem;
      margin: 4px 0 2px 0;
    }

    .af-domain-action-btn {
      min-height: 38px;
      padding: 6px 16px;
      font-size: 0.9rem;
    }
  }
`;

/**
 * Creates the Amarante Artist-Grade Living Dither & 3D Flower Field Onboarding Flow (Option 1).
 */
export function createAppFlow({
  container = null,
  onCreateWorld = null,
  onJoinWorld = null,
  onRoleSelect = null,
  onLobbyClaim = null,
  onToggleReady = null,
  onStartGame = null,
  onFlowStepChanged = null,
  initialRoomPhrase = 'Rain on warm limestone',
  autoSkip = undefined,
} = {}) {
  let styleEl = document.getElementById('haru-app-flow-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'haru-app-flow-styles';
    styleEl.textContent = APP_FLOW_CSS;
    document.head.appendChild(styleEl);
  } else {
    styleEl.textContent = APP_FLOW_CSS;
  }

  const legacyLobby = document.getElementById('sanctuary-lobby');
  if (legacyLobby) {
    legacyLobby.classList.remove('visible');
    legacyLobby.style.display = 'none';
  }
  const bootSplash = document.getElementById('haru-boot-splash');

  const urlParams =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location?.search || '')
      : new URLSearchParams();
  const roomFromUrl = (urlParams.get('room') || '').trim();
  const stepFromUrl = (urlParams.get('step') || '').trim();

  const state = {
    step: FLOW_STEPS.TITLE,
    onboardingOption: 1,
    lastDitherProgress: 0.05,
    roomPhrase: roomFromUrl || initialRoomPhrase || 'Rain on warm limestone',
    isHost: !roomFromUrl,
    localRole: roomFromUrl ? 'Mage' : 'Knight',
    hostRole: 'Knight',
    partnerRole: 'Mage',
    playerName: '',
    partnerName: '',
    localClaimed: false,
    partnerClaimed: false,
    playerCount: 1,
    guestReady: false,
    peerConnected: false,
    expeditionStarted: false,
    loadingProgress: 0.62,
    error: '',
    heroScreenPositions: {
      knight: null,
      mage: null,
    },
  };

  const root = document.createElement('div');
  root.id = 'haru-app-flow-root';
  root.dataset.onboardOpt = String(state.onboardingOption);
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Amarante Opening and Co-Op World Lobby');

  const phraseChipsHtml = ROMANTIC_ROOM_PHRASES.slice(0, 4)
    .map(
      (phrase, idx) =>
        `<button type="button" class="af-phrase-chip${idx === 0 ? ' is-active' : ''}" data-phrase-chip="${phrase}">${phrase}</button>`
    )
    .join('');

  root.innerHTML = `
    <div id="app-flow-root" data-step="${state.step}" style="display:contents"></div>
    <div id="af-pixel-veil" aria-hidden="true">
      <canvas id="af-pixel-veil-canvas"></canvas>
    </div>

    <!-- 1. FIXED CELESTIAL SUN-CLOCK + CALLIGRAPHIC PAINTBRUSH AMARANTE + GLASSY PILL -->
    <section class="af-scene af-scene-title is-loading-active" data-flow-scene="title" aria-label="Title Screen">
      <div class="af-title-stack">
        <div class="af-celestial-lockup-wrap" aria-hidden="true">
          ${buildPureSvgCelestialTitleLockup()}
          <span class="af-branch-petal p1"></span>
          <span class="af-branch-petal p2"></span>
          <span class="af-branch-petal p3"></span>
          <span class="af-branch-petal p4"></span>
        </div>

        ${SVG_OPEN_AIR_DIVIDER}
        <h1 class="af-main-title sr-only">Amarante</h1>
        ${SVG_AMARANTE_SWASH_FLOURISH}
        <p class="af-subtitle sr-only">The Unfading Bloom · A Valley for Two</p>

        <button
          type="button"
          class="af-hairline-pill-btn af-enter-btn is-loading"
          id="app-flow-enter-btn"
          data-flow-action="enter"
          aria-live="polite"
        >
          <span class="af-morph-progress-fill" id="app-flow-morph-fill"></span>
          <span class="af-morph-loading-layer" id="app-flow-morph-loading">
            <span id="app-flow-prep-label">Begin Journey</span>
          </span>
          <span class="af-morph-ready-layer" id="app-flow-morph-ready">
            <span>Begin Journey</span>
          </span>
        </button>
      </div>
    </section>

    <!-- 2. OPTIONAL LOADING SCENE (kept for direct ?step=loading compatibility) -->
    <section class="af-scene af-scene-loading" data-flow-scene="loading" aria-label="Loading Screen">
      <div class="af-loading-wrap" role="status" aria-live="polite">
        <div class="af-loading-title" id="app-flow-loading-label">Preparing the valley</div>
        <div class="af-hairline-frame af-loading-stone-bar" id="app-flow-loading-bar">
          <div class="af-loading-channel">
            <div class="af-loading-fill" id="app-flow-loading-fill"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. MEET IN THE VALLEY SCENE (FLOW_STEPS.CREATE_JOIN) -->
    <section class="af-scene af-scene-create-join" data-flow-scene="create_join" aria-label="Create or Join World">
      <div class="af-create-join-header-stack">
        ${SVG_OPEN_AIR_DIVIDER}
        <h2 class="af-create-join-header">Meet in the Valley</h2>
      </div>

      <div class="af-tablets-grid">
        <!-- Left Frame: Create World -->
        <div class="af-hairline-frame af-world-tablet" id="app-flow-create-tablet">
          <span class="af-tablet-top-emblem">${SVG_TOP_EMBLEM_SPRIG}</span>
          <span class="af-side-diamond is-left" aria-hidden="true"></span>
          <span class="af-side-diamond is-right" aria-hidden="true"></span>

          <div class="af-tablet-top-block">
            <h3 class="af-tablet-heading">Create World</h3>
            ${SVG_CARD_THIN_DIVIDER}
            <p class="af-active-phrase-display" id="app-flow-active-phrase" title="Click to cycle room phrase">${state.roomPhrase}</p>
            <div class="af-phrase-chips-wrap" id="app-flow-phrase-chips">
              ${phraseChipsHtml}
            </div>
          </div>
          <button type="button" class="af-hairline-pill-btn af-domain-action-btn" id="app-flow-create-btn" data-flow-action="create">
            Create
          </button>
        </div>

        <!-- Right Frame: Join World -->
        <div class="af-hairline-frame af-world-tablet" id="app-flow-join-tablet">
          <span class="af-tablet-top-emblem">${SVG_TOP_EMBLEM_TRAVELERS}</span>
          <span class="af-side-diamond is-left" aria-hidden="true"></span>
          <span class="af-side-diamond is-right" aria-hidden="true"></span>

          <div class="af-tablet-top-block">
            <h3 class="af-tablet-heading">Join World</h3>
            ${SVG_CARD_THIN_DIVIDER}
            <div class="af-field-group">
              <label class="af-field-label sr-only" for="app-flow-phrase-input">Room phrase</label>
              <input
                type="text"
                id="app-flow-phrase-input"
                class="af-phrase-input"
                name="worldPhrase"
                autocomplete="off"
                spellcheck="false"
                placeholder="Love is curiosity"
              />
            </div>
          </div>
          <button type="button" class="af-hairline-pill-btn af-domain-action-btn" id="app-flow-join-btn" data-flow-action="join">
            Join
          </button>
        </div>
      </div>

      <div class="af-error-banner" id="app-flow-error-banner" role="alert"></div>
    </section>

    <!-- 4. FLOWER FIELD 3D HERO CLAIM LOBBY (FLOW_STEPS.FLOWER_LOBBY) -->
    <section class="af-scene af-scene-flower-lobby" data-flow-scene="flower_lobby" aria-label="Flower Field Lobby">
      <div id="af-lobby-3d-stage">
        <!-- 3D-Projected Hero Hit Target: Knight -->
        <button
          type="button"
          class="af-hero-hit-target is-claimed"
          id="app-flow-claim-knight"
          data-claim-role="Knight"
          aria-label="Claim Knight in the Flower Field"
        >
          <span class="af-hero-ring-badge" id="af-claim-knight">
            ${SVG_KNIGHT_CREST_OUTLINE}
            <span class="af-crest-meta">
              <span class="af-crest-role">Knight</span>
              <span class="af-crest-hint" id="af-claim-knight-status">Claimed</span>
            </span>
          </span>
        </button>

        <!-- 3D-Projected Hero Hit Target: Mage -->
        <button
          type="button"
          class="af-hero-hit-target"
          id="app-flow-claim-mage"
          data-claim-role="Mage"
          aria-label="Claim Mage in the Flower Field"
        >
          <span class="af-hero-ring-badge" id="af-claim-mage">
            ${SVG_MAGE_CREST_OUTLINE}
            <span class="af-crest-meta">
              <span class="af-crest-role">Mage</span>
              <span class="af-crest-hint" id="af-claim-mage-status">Tap to claim</span>
            </span>
          </span>
        </button>

        <!-- Floating Partner Name + Blossom Divider above the other hero -->
        <div id="app-flow-partner-tag" aria-live="polite"></div>

        <!-- Floating Warm-Stone Callout with Angled Helmet Pointer -->
        <div
          id="app-flow-name-bubble"
          data-claimed-role="Knight"
          role="group"
          aria-label="Character Claim and Name Entry"
        >
          <div class="af-name-callout-inner" id="app-flow-claim-bubble" data-claimed-role="Knight">
            <div class="af-name-inline-baseline">
              <label class="af-inline-name-prompt" for="app-flow-name-input" id="app-flow-bubble-role-title">Your name:</label>
              <input
                type="text"
                id="app-flow-name-input"
                class="af-name-input"
                name="playerName"
                maxlength="24"
                autocomplete="off"
                spellcheck="false"
                placeholder="Vikas"
              />
              <button
                type="button"
                class="af-name-submit-btn"
                id="app-flow-start-btn"
                data-flow-action="start"
                aria-label="Confirm name and enter the valley"
                title="Enter the valley"
              >
                ${SVG_SUBMIT_ARROW}
              </button>
            </div>
            ${SVG_CALLOUT_POINTER_KNIGHT}
            ${SVG_CALLOUT_POINTER_MAGE}
          </div>
        </div>
      </div>

      <!-- Bottom-Center Room-Phrase Bar + DEV Solo Test Escape Hatch -->
      <div class="af-lobby-bottom-row">
        <div class="af-lobby-room-bar" id="app-flow-lobby-top-bar">
          <span class="af-room-phrase-lbl" id="app-flow-lobby-phrase">
            <span id="app-flow-room-phrase">${state.roomPhrase}</span>
          </span>
          <button
            type="button"
            class="af-copy-btn"
            id="app-flow-copy-btn"
            aria-label="Copy Invite Link"
            title="Copy Invite Link"
          >
            ${SVG_COPY_ICON}
            ${SVG_CHECK_ICON}
          </button>
        </div>
        <!-- DEV_SOLO_TEST_REMOVE_FOR_PROD -->
        <button
          type="button"
          class="af-solo-dev-btn"
          id="app-flow-solo-test-btn"
          data-flow-action="solo-test"
          title="Enter immediately for solo testing (remove for production)"
        >
          Test Solo →
        </button>
      </div>
    </section>
  `;

  if (bootSplash) {
    bootSplash.remove();
  }
  const mountTarget = container || document.getElementById('hud') || document.body;
  mountTarget.appendChild(root);

  // Cache DOM references for Plain-Black Paintbrush Reveal, Fixed Sun-Clock & Glassy Pills
  const flowRootAliasEl = root.querySelector('#app-flow-root');
  const pixelVeil = root.querySelector('#af-pixel-veil');
  const pixelCanvas = root.querySelector('#af-pixel-veil-canvas');
  const curtainBrushStrokeEls = Array.from(root.querySelectorAll('.af-curtain-brush-stroke'));
  const curtainBristleEls = Array.from(root.querySelectorAll('.af-curtain-brush-bristle'));
  const titleSceneEl = root.querySelector('.af-scene-title');
  const pureCelestialSvgEl = root.querySelector('.af-pure-celestial-svg');
  const svgRingOuterEl = root.querySelector('#af-svg-ring-outer');
  const svgRingInnerEl = root.querySelector('#af-svg-ring-inner');
  const svgRingWhisperEl = root.querySelector('#af-svg-ring-whisper');
  const svgDialOrbitEl = root.querySelector('#af-svg-dial-orbit');
  const svgHandOrbitEl = root.querySelector('#af-svg-hand-orbit');
  const svgHourHandEl = root.querySelector('#af-svg-hour-hand');
  const svgMinuteHandEl = root.querySelector('#af-svg-minute-hand');
  const svgNumeralEls = Array.from(root.querySelectorAll('.af-svg-numeral'));
  const svgCrownEls = Array.from(root.querySelectorAll('.af-svg-crown'));
  const svgWordmarkMoverEl = root.querySelector('#af-svg-wordmark-mover');
  const svgWordmarkEl = root.querySelector('#af-svg-wordmark');
  const svgGlyphEls = Array.from(root.querySelectorAll('.af-svg-glyph'));
  const svgContourEls = Array.from(root.querySelectorAll('.af-glyph-contour'));
  const svgFillEls = Array.from(root.querySelectorAll('.af-glyph-fill'));
  const svgDuctusEls = Array.from(root.querySelectorAll('.af-glyph-ductus'));
  const opt3GoldThreadEl = root.querySelector('#af-opt3-gold-thread');
  const svgSwashLeftEl = root.querySelector('#af-svg-swash-left');
  const svgSwashRightEl = root.querySelector('#af-svg-swash-right');
  const svgSwashDiamondEl = root.querySelector('#af-svg-swash-diamond');
  const svgStemEls = Array.from(root.querySelectorAll('.af-svg-branch-stem'));
  const svgBlossomEls = Array.from(root.querySelectorAll('.af-svg-blossom'));
  const svgSakuraBranchesEl = root.querySelector('#af-svg-sakura-branches');
  const branchPetalEls = Array.from(root.querySelectorAll('.af-branch-petal'));
  const sunClockArcEl = root.querySelector('#af-sunclock-progress-arc');
  const enterBtn = root.querySelector('#app-flow-enter-btn');
  const prepLabelEl = root.querySelector('#app-flow-prep-label');
  const loadingFill = root.querySelector('#app-flow-loading-fill');
  const activePhraseEl = root.querySelector('#app-flow-active-phrase');
  const createBtn = root.querySelector('#app-flow-create-btn');
  const joinBtn = root.querySelector('#app-flow-join-btn');
  const phraseInput = root.querySelector('#app-flow-phrase-input');
  const errorBanner = root.querySelector('#app-flow-error-banner');

  const claimKnightBtn = root.querySelector('#app-flow-claim-knight');
  const claimMageBtn = root.querySelector('#app-flow-claim-mage');
  const claimKnightBadge = root.querySelector('#af-claim-knight');
  const claimMageBadge = root.querySelector('#af-claim-mage');
  const claimKnightStatus = root.querySelector('#af-claim-knight-status');
  const claimMageStatus = root.querySelector('#af-claim-mage-status');
  const partnerTagEl = root.querySelector('#app-flow-partner-tag');
  const nameBubble = root.querySelector('#app-flow-name-bubble');
  const innerClaimBubble = root.querySelector('#app-flow-claim-bubble');
  const nameInput = root.querySelector('#app-flow-name-input');
  const startBtn = root.querySelector('#app-flow-start-btn');
  const soloTestBtn = root.querySelector('#app-flow-solo-test-btn');

  const roomPhraseEl = root.querySelector('#app-flow-room-phrase');
  const copyBtn = root.querySelector('#app-flow-copy-btn');

  if (phraseInput) {
    phraseInput.value = roomFromUrl || state.roomPhrase || 'Rain on warm limestone';
  }

  let loadingTimer = null;
  let copyTimer = null;
  let mosaicRafId = null;

  const SUN_ARC_CIRCUMFERENCE = 615.8;

  function easeOutCubic(x) {
    const u = Math.min(1, Math.max(0, x));
    return 1 - Math.pow(1 - u, 3);
  }

  function easeInOutCubic(x) {
    const u = Math.min(1, Math.max(0, x));
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  function easeOutBackSoft(x) {
    const u = Math.min(1, Math.max(0, x));
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    const c1 = 1.25;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
  }

  /**
   * Syncs the Fixed Sun-Clock hands to the exact in-game time (defaulting to 08:10 Morning:
   * Hour hand at 245 deg [VIII], Minute hand at 60 deg [II]). Never spins continuously.
   */
  let lastClockHourDeg = '';
  let lastClockMinDeg = '';

  function syncFixedClockHandsToGameTime() {
    let hours24 = 8 + 10 / 60; // 08:10 default in TOD_PRESETS.day
    const worldTod = typeof window !== 'undefined' ? window.__WORLD__?.skyState?.tod : undefined;
    if (typeof worldTod === 'number' && Number.isFinite(worldTod)) {
      hours24 = ((worldTod * 24) % 24 + 24) % 24;
    }
    const hours12 = hours24 % 12;
    const mins = (hours24 - Math.floor(hours24)) * 60;
    const hourDeg = (hours12 * 30).toFixed(1);
    const minDeg = (mins * 6).toFixed(1);
    if (svgHourHandEl && hourDeg !== lastClockHourDeg) {
      lastClockHourDeg = hourDeg;
      svgHourHandEl.setAttribute('transform', `rotate(${hourDeg})`);
    }
    if (svgMinuteHandEl && minDeg !== lastClockMinDeg) {
      lastClockMinDeg = minDeg;
      svgMinuteHandEl.setAttribute('transform', `rotate(${minDeg})`);
    }
  }

  let dissolveGl = null;
  let dissolveProg = null;
  let dissolveSweepLoc = null;
  let dissolveVbo = null;
  let dissolvePosLoc = -1;
  let dissolveInitFailed = false;
  let dissolveOpaqueDrawn = false;
  let dissolveClearedDrawn = false;
  let lastDissolveSweep = null;

  let dissolvePrewarmScheduled = false;
  function prewarmDissolveWebGLAsync() {
    if (dissolvePrewarmScheduled || dissolveGl || dissolveInitFailed || !pixelCanvas) return;
    dissolvePrewarmScheduled = true;
    const schedule = (fn, ms = 16) =>
      typeof setTimeout === 'function' ? setTimeout(fn, ms) : fn();
    const waitWarm =
      typeof window !== 'undefined' && window.__GPU_WARMUP_PROMISE__
        ? window.__GPU_WARMUP_PROMISE__
        : Promise.resolve();
    waitWarm.then(() => {
      schedule(() => {
        if (dissolveGl || dissolveInitFailed || !pixelCanvas) return;
        if (pixelCanvas.width !== DISSOLVE_W || pixelCanvas.height !== DISSOLVE_H) {
          pixelCanvas.width = DISSOLVE_W;
          pixelCanvas.height = DISSOLVE_H;
        }
        const opts = {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: true,
          powerPreference: 'low-power',
        };
        const gl =
          pixelCanvas.getContext('webgl2', opts) || pixelCanvas.getContext('webgl', opts);
        if (!gl) {
          dissolveInitFailed = true;
          return;
        }
        dissolveGl = gl;
        schedule(() => {
          if (dissolveProg || dissolveInitFailed || !dissolveGl) return;
          const compileShader = (type, src) => {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
              gl.deleteShader(sh);
              return null;
            }
            return sh;
          };
          const vs = compileShader(gl.VERTEX_SHADER, DISSOLVE_VERT_SRC);
          const fs = compileShader(gl.FRAGMENT_SHADER, DISSOLVE_FRAG_SRC);
          if (!vs || !fs) {
            dissolveInitFailed = true;
            return;
          }
          const prog = gl.createProgram();
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.linkProgram(prog);
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            gl.deleteProgram(prog);
            dissolveInitFailed = true;
            return;
          }
          const vbo = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            gl.STATIC_DRAW
          );
          const aLoc = gl.getAttribLocation(prog, 'aPos');
          gl.enableVertexAttribArray(aLoc);
          gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
          gl.useProgram(prog);
          gl.viewport(0, 0, DISSOLVE_W, DISSOLVE_H);
          gl.disable(gl.DEPTH_TEST);
          gl.disable(gl.BLEND);
          dissolveProg = prog;
          dissolveSweepLoc = gl.getUniformLocation(prog, 'uSweep');
          dissolveVbo = vbo;
          dissolvePosLoc = aLoc;
          gl.uniform1f(dissolveSweepLoc, -1.0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          dissolveOpaqueDrawn = true;
          lastDissolveSweep = -1.0;
        }, 24);
      }, 60);
    });
  }

  function ensureDissolveWebGL() {
    if (dissolveInitFailed) return false;
    if (dissolveGl && dissolveProg) return true;
    if (!pixelCanvas) return false;
    if (pixelCanvas.width !== DISSOLVE_W || pixelCanvas.height !== DISSOLVE_H) {
      pixelCanvas.width = DISSOLVE_W;
      pixelCanvas.height = DISSOLVE_H;
    }
    const opts = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    };
    const gl =
      dissolveGl ||
      pixelCanvas.getContext('webgl2', opts) ||
      pixelCanvas.getContext('webgl', opts);
    if (!gl) {
      dissolveInitFailed = true;
      return false;
    }
    const compileShader = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compileShader(gl.VERTEX_SHADER, DISSOLVE_VERT_SRC);
    const fs = compileShader(gl.FRAGMENT_SHADER, DISSOLVE_FRAG_SRC);
    if (!vs || !fs) {
      dissolveInitFailed = true;
      return false;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      dissolveInitFailed = true;
      return false;
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aLoc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog);
    gl.viewport(0, 0, DISSOLVE_W, DISSOLVE_H);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    dissolveGl = gl;
    dissolveProg = prog;
    dissolveSweepLoc = gl.getUniformLocation(prog, 'uSweep');
    dissolveVbo = vbo;
    dissolvePosLoc = aLoc;
    return true;
  }

  /**
   * GPU fragment-shader pitch-black (#050507) screen and smooth 5-octave organic noise dissolve
   * directly on `#af-pixel-veil-canvas` (`0` CPU pixel loops, `0` putImageData calls).
   */
  function renderBlackNoiseDissolveCanvas(t) {
    if (!pixelCanvas) return;
    if (t <= 0.45 && !(dissolveGl && dissolveProg)) {
      prewarmDissolveWebGLAsync();
      if (pixelVeil && pixelVeil.style.background !== 'rgb(5, 5, 7)' && pixelVeil.style.background !== '#050507') {
        pixelVeil.style.background = '#050507';
      }
      return;
    }
    if (!ensureDissolveWebGL()) {
      // Minimal GPU-composited opacity fallback if WebGL is unavailable
      if (pixelVeil) {
        const op = t <= 0.58 ? 1 : t >= 0.96 ? 0 : 1 - easeInOutCubic((t - 0.58) / 0.36);
        pixelVeil.style.background = op > 0.001 ? `rgba(5,5,7,${op.toFixed(3)})` : 'transparent';
      }
      return;
    }
    if (pixelVeil && pixelVeil.style.background !== 'transparent') {
      pixelVeil.style.background = 'transparent';
    }
    const gl = dissolveGl;
    if (t <= 0.58) {
      if (dissolveOpaqueDrawn) return;
      gl.useProgram(dissolveProg);
      gl.uniform1f(dissolveSweepLoc, -1.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      dissolveOpaqueDrawn = true;
      dissolveClearedDrawn = false;
      lastDissolveSweep = -1.0;
      return;
    }
    if (t >= 0.96) {
      if (dissolveClearedDrawn) return;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      dissolveClearedDrawn = true;
      dissolveOpaqueDrawn = false;
      lastDissolveSweep = 2.0;
      return;
    }

    const uDissolve = easeInOutCubic((t - 0.58) / 0.36);
    const sweep = uDissolve * 1.38;
    if (lastDissolveSweep !== null && Math.abs(sweep - lastDissolveSweep) < 1e-4) {
      return;
    }
    dissolveOpaqueDrawn = false;
    dissolveClearedDrawn = false;
    lastDissolveSweep = sweep;
    gl.useProgram(dissolveProg);
    gl.uniform1f(dissolveSweepLoc, sweep);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  const TOTAL_INTRO_DURATION_MS = 5600;
  let lastWordmarkPhase = -1;
  let lastBloomStateKey = '';
  let lastRenderedVeilT = -1;
  let lastRenderedVeilOpt = -1;
  let lastVeilOpacityStr = '';
  let lastEnterReadyState = null;
  let lastTitleLoadingActive = null;

  /**
   * Conducts the 4-Step Pitch-Black -> Brush-Written Amarante -> Glide Up -> Surrounding Flowers -> Smooth GPU Noise Dissolve:
   * - Step 1 (0.007..0.425): 100% Pitch-Black Screen; 8 calligraphic strokes write 'Amarante' (~2.25s unhurried)
   * - Step 2 (0.420..0.560): Still on Pitch-Black Screen, 'Amarante' glides smoothly upward into its final sky position
   * - Step 3 (0.480..0.780): Surrounding Fixed Sun-Clock (at 08:10), Golden Swash & Sakura Flowers bloom around 'Amarante'
   * - Step 4 (0.580..0.940): Smooth WebGL 2D organic noise dissolve clears the pitch-black screen to reveal the live 3D valley,
   *                          followed by the Glassy Hairline 'Begin Journey' pill rising at 0.90..1.00
   */
  function updateSunClockAndParchmentAtProgress(t) {
    syncFixedClockHandsToGameTime();
    renderBlackNoiseDissolveCanvas(t);

    // 1. Step 1: 3 Professional Vector Reveal Options for 'Amarante' on Pitch-Black Screen (Zero Yellow Dot)
    const opt = state.onboardingOption || 1;
    const numG = svgGlyphEls.length || 8;
    const contourDurNorm = 820 / TOTAL_INTRO_DURATION_MS;
    const fillDelayNorm = 280 / TOTAL_INTRO_DURATION_MS;
    const fillDurNorm = 520 / TOTAL_INTRO_DURATION_MS;

    const wordmarkSettled = t >= 0.56 && lastWordmarkPhase === opt;
    if (!wordmarkSettled) {
      for (let i = 0; i < numG; i++) {
        const gEl = svgGlyphEls[i];
        const contourEl = svgContourEls[i];
        const fillEl = svgFillEls[i];
        const ductusEl = svgDuctusEls[i];

        if (opt === 1) {
          // Option 1: Exact compositor-matched Liquid-Gold Vector Contour Draw -> Warm Ivory Ink Fill
          const startG = (i * 240) / TOTAL_INTRO_DURATION_MS;
          const pContour = easeOutCubic((t - startG) / contourDurNorm);
          const pFill = easeInOutCubic((t - (startG + fillDelayNorm)) / fillDurNorm);
          gEl?.setAttribute('transform', 'translate(0, 0)');
          if (ductusEl) ductusEl.setAttribute('opacity', '0');
          if (contourEl) {
            if (pContour <= 0.001) {
              contourEl.setAttribute('opacity', '0');
              contourEl.setAttribute('stroke-dashoffset', '105');
            } else {
              const cOp = pFill >= 0.99 ? 0 : 1 - pFill * 0.65;
              contourEl.setAttribute('opacity', cOp.toFixed(3));
              contourEl.setAttribute('stroke-dashoffset', ((1 - pContour) * 100).toFixed(2));
            }
          }
          if (fillEl) {
            fillEl.setAttribute('opacity', pFill.toFixed(3));
          }
        } else if (opt === 2) {
          const startG = (i * 240) / TOTAL_INTRO_DURATION_MS;
          const pDuctus = easeInOutCubic((t - startG) / 0.11);
          gEl?.setAttribute('transform', 'translate(0, 0)');
          if (contourEl) contourEl.setAttribute('opacity', '0');
          if (fillEl) fillEl.setAttribute('opacity', '0');
          if (ductusEl) {
            if (pDuctus <= 0.001) {
              ductusEl.setAttribute('opacity', '0');
              ductusEl.setAttribute('stroke-dashoffset', '105');
            } else {
              ductusEl.setAttribute('opacity', '1');
              ductusEl.setAttribute('stroke-dashoffset', ((1 - pDuctus) * 100).toFixed(2));
            }
          }
        } else {
          const startG = (40 + i * 210) / TOTAL_INTRO_DURATION_MS;
          const pFocus = easeOutCubic((t - startG) / 0.15);
          const dx = (1 - pFocus) * (i - 3.5) * 9.0;
          const dy = (1 - pFocus) * 16.0;
          gEl?.setAttribute('transform', `translate(${dx.toFixed(2)}, ${dy.toFixed(2)})`);
          if (ductusEl) ductusEl.setAttribute('opacity', '0');
          if (fillEl) fillEl.setAttribute('opacity', pFocus.toFixed(3));
          if (contourEl) {
            const rimOp = pFocus > 0.01 && pFocus < 0.99 ? Math.sin(pFocus * Math.PI) * 0.85 : 0;
            contourEl.setAttribute('opacity', rimOp.toFixed(3));
            contourEl.setAttribute('stroke-dashoffset', '0');
          }
        }
      }

      if (opt3GoldThreadEl) {
        if (opt === 3 && t >= 0.03 && t <= 0.46) {
          const pThread = easeOutCubic((t - 0.03) / 0.28);
          const fadeOut = t > 0.34 ? Math.max(0, 1 - (t - 0.34) / 0.12) : 1;
          opt3GoldThreadEl.setAttribute('opacity', (fadeOut * 0.85).toFixed(3));
          opt3GoldThreadEl.setAttribute('stroke-dashoffset', ((1 - pThread) * 100).toFixed(2));
        } else {
          opt3GoldThreadEl.setAttribute('opacity', '0');
        }
      }

      // 2. Step 2: 'Amarante' glides smoothly upward from the center of the pitch-black screen (0.42..0.56)
      if (svgWordmarkMoverEl) {
        const pGlide = easeInOutCubic((t - 0.42) / 0.14);
        const tx = (1 - pGlide) * -24;
        const ty = (1 - pGlide) * 191;
        const sc = 1.0 + (1 - pGlide) * 0.08;
        svgWordmarkMoverEl.setAttribute(
          'transform',
          `translate(${tx.toFixed(2)}, ${ty.toFixed(2)}) scale(${sc.toFixed(4)})`
        );
      }
      lastWordmarkPhase = t >= 0.56 ? opt : -1;
    }

    // 3. Step 3: Surrounding Fixed Sun-Clock, Golden Swash & Sakura Flowers bloom smoothly (0.42..0.54)
    //    so zero SVG DOM attribute thrash happens during the GPU dissolve window (0.55..0.98).
    const bloomKey = t < 0.42 ? 'pre' : t >= 0.54 ? 'done' : t.toFixed(3);
    if (bloomKey !== lastBloomStateKey) {
      lastBloomStateKey = bloomKey;
      const bt = t >= 0.54 ? 1.0 : (t - 0.42) / 0.12;
      const pRingOuter = easeOutCubic(bt / 0.65);
      const pRingInner = easeOutCubic((bt - 0.08) / 0.65);
      if (svgRingOuterEl) {
        svgRingOuterEl.setAttribute('opacity', pRingOuter > 0.001 ? '1' : '0');
        svgRingOuterEl.setAttribute('stroke-dashoffset', ((1 - pRingOuter) * 100).toFixed(2));
      }
      if (svgRingInnerEl) {
        svgRingInnerEl.setAttribute('opacity', pRingInner > 0.001 ? '1' : '0');
        svgRingInnerEl.setAttribute('stroke-dashoffset', ((1 - pRingInner) * 100).toFixed(2));
      }
      if (svgRingWhisperEl) {
        svgRingWhisperEl.setAttribute('opacity', (pRingOuter * 0.58).toFixed(3));
      }
      if (svgDialOrbitEl) {
        svgDialOrbitEl.style.opacity = easeOutCubic((bt - 0.05) / 0.55).toFixed(3);
      }
      if (svgHandOrbitEl) {
        svgHandOrbitEl.style.opacity = easeOutCubic((bt - 0.12) / 0.55).toFixed(3);
      }
      if (sunClockArcEl) {
        const pArc = easeOutCubic((bt - 0.05) / 0.85);
        sunClockArcEl.setAttribute('opacity', pArc > 0.001 ? '1' : '0');
        const dashOffset = SUN_ARC_CIRCUMFERENCE * (1.0 - pArc);
        sunClockArcEl.setAttribute('stroke-dashoffset', dashOffset.toFixed(1));
      }

      for (let i = 0; i < svgNumeralEls.length; i++) {
        const startT = 0.05 + i * 0.035;
        const pn = easeOutCubic((bt - startT) / 0.45);
        svgNumeralEls[i].style.opacity = pn.toFixed(3);
      }

      for (let i = 0; i < svgCrownEls.length; i++) {
        const startT = 0.16 + i * 0.08;
        const pc = easeOutBackSoft((bt - startT) / 0.52);
        const pcOp = easeOutCubic((bt - startT) / 0.42);
        const baseScale = Number(svgCrownEls[i].dataset.baseScale || 1);
        svgCrownEls[i].style.opacity = pcOp.toFixed(3);
        svgCrownEls[i].setAttribute('transform', `scale(${(baseScale * pc).toFixed(4)})`);
      }

      const pDiamond = easeOutBackSoft((bt - 0.10) / 0.48);
      if (svgSwashDiamondEl) {
        svgSwashDiamondEl.setAttribute('transform', `translate(496, 308) scale(${pDiamond.toFixed(4)})`);
      }
      const pSwashWing = easeOutCubic((bt - 0.16) / 0.62);
      const swashOffset = ((1 - pSwashWing) * 100).toFixed(2);
      if (svgSwashLeftEl) {
        svgSwashLeftEl.setAttribute('opacity', pSwashWing > 0.001 ? '1' : '0');
        svgSwashLeftEl.setAttribute('stroke-dashoffset', swashOffset);
      }
      if (svgSwashRightEl) {
        svgSwashRightEl.setAttribute('opacity', pSwashWing > 0.001 ? '1' : '0');
        svgSwashRightEl.setAttribute('stroke-dashoffset', swashOffset);
      }

      const STEM_STARTS = [0.10, 0.16, 0.28, 0.22];
      for (let i = 0; i < svgStemEls.length; i++) {
        const ps = easeOutCubic((bt - STEM_STARTS[i]) / 0.62);
        svgStemEls[i].setAttribute('opacity', ps > 0.001 ? '1' : '0');
        svgStemEls[i].setAttribute('stroke-dashoffset', ((1 - ps) * 100).toFixed(2));
      }

      for (let i = 0; i < svgBlossomEls.length; i++) {
        const startT = 0.18 + i * 0.032;
        const pb = easeOutBackSoft((bt - startT) / 0.44);
        const pbOp = easeOutCubic((bt - startT) / 0.34);
        const baseScale = Number(svgBlossomEls[i].dataset.baseScale || 1);
        svgBlossomEls[i].style.opacity = pbOp.toFixed(3);
        svgBlossomEls[i].setAttribute('transform', `scale(${(baseScale * pb).toFixed(4)})`);
      }
    }

    // Hide drifting CSS petals and heavy SVG drop-shadow filters until resolvePixelVeil (t >= 0.999)
    const settled = t >= 0.999;
    const petalsDisp = settled ? 'block' : 'none';
    for (let i = 0; i < branchPetalEls.length; i++) {
      if (branchPetalEls[i].style.display !== petalsDisp) {
        branchPetalEls[i].style.display = petalsDisp;
      }
    }

    if (pureCelestialSvgEl) {
      pureCelestialSvgEl.classList.toggle('is-settled', settled);
    }
    if (svgWordmarkEl) {
      if (settled) {
        if (svgWordmarkEl.getAttribute('filter') !== 'url(#afWordShadow)') {
          svgWordmarkEl.setAttribute('filter', 'url(#afWordShadow)');
        }
      } else if (svgWordmarkEl.hasAttribute('filter')) {
        svgWordmarkEl.removeAttribute('filter');
      }
    }
    if (svgSakuraBranchesEl) {
      if (settled) {
        if (svgSakuraBranchesEl.getAttribute('filter') !== 'url(#afWordShadow)') {
          svgSakuraBranchesEl.setAttribute('filter', 'url(#afWordShadow)');
        }
      } else if (svgSakuraBranchesEl.hasAttribute('filter')) {
        svgSakuraBranchesEl.removeAttribute('filter');
      }
    }
    if (sunClockArcEl) {
      if (settled) {
        if (sunClockArcEl.getAttribute('filter') !== 'url(#afGoldGlow)') {
          sunClockArcEl.setAttribute('filter', 'url(#afGoldGlow)');
        }
      } else if (sunClockArcEl.hasAttribute('filter')) {
        sunClockArcEl.removeAttribute('filter');
      }
    }

    // 4. Step 4: Larger Glassy Hairline 'Begin Journey' Pill appears ONLY when ready (0.90..1.00)
    if (enterBtn) {
      if (t >= 0.999) {
        enterBtn.style.opacity = '1';
        enterBtn.style.transform = '';
      } else if (t < 0.90) {
        if (enterBtn.style.opacity !== '0') {
          enterBtn.style.opacity = '0';
          enterBtn.style.transform = 'translateX(-50%) translateY(18px)';
        }
      } else {
        const pPill = easeOutCubic((t - 0.90) / 0.10);
        const py = (1 - pPill) * 18;
        enterBtn.style.opacity = pPill.toFixed(3);
        enterBtn.style.transform = `translateX(-50%) translateY(${py.toFixed(1)}px)`;
      }
    }
  }

  function stopMosaicLoop() {
    if (mosaicRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(mosaicRafId);
      mosaicRafId = null;
    }
    lastWordmarkPhase = -1;
    lastBloomStateKey = '';
    lastRenderedVeilT = -1;
    lastRenderedVeilOpt = -1;
    lastVeilOpacityStr = '';
    lastEnterReadyState = null;
    lastTitleLoadingActive = null;
    dissolveOpaqueDrawn = false;
    dissolveClearedDrawn = false;
    lastDissolveSweep = null;
  }

  function resolvePixelVeil() {
    stopMosaicLoop();
    state.lastDitherProgress = 1;
    lastRenderedVeilT = 1;
    lastRenderedVeilOpt = state.onboardingOption || 1;
    updateSunClockAndParchmentAtProgress(1);
    titleSceneEl?.classList.remove('is-loading-active');
    lastTitleLoadingActive = false;
    pixelVeil?.classList.add('is-resolved');
    pixelVeil?.style.setProperty('opacity', '0');
    lastVeilOpacityStr = '0';
    if (prepLabelEl) {
      prepLabelEl.textContent = 'Begin Journey';
    }
    if (enterBtn) {
      enterBtn.disabled = false;
      enterBtn.classList.remove('is-loading');
      enterBtn.classList.add('is-ready');
      lastEnterReadyState = true;
    }
  }

  /**
   * Pure 60FPS GPU-Composited Plain-Black Paintbrush Reveal & Fixed Sun-Clock at `t` in [0..1].
   */
  function renderDitherVeilAtProgress(rawT) {
    if (!pixelVeil) return;
    const t = Math.min(1, Math.max(0, Number(rawT) || 0));
    const opt = state.onboardingOption || 1;
    if (
      t < 0.999 &&
      Math.abs(t - lastRenderedVeilT) < 1e-4 &&
      opt === lastRenderedVeilOpt
    ) {
      return;
    }
    lastRenderedVeilT = t;
    lastRenderedVeilOpt = opt;
    state.lastDitherProgress = t;

    if (t >= 0.999) {
      resolvePixelVeil();
      return;
    }

    if (lastTitleLoadingActive !== true) {
      lastTitleLoadingActive = true;
      titleSceneEl?.classList.add('is-loading-active');
      pixelVeil.classList.remove('is-resolved');
    }
    const veilOpacity = t < 0.84 ? 1.0 : Math.max(0, 1.0 - (t - 0.84) / 0.16);
    const veilOpStr = veilOpacity.toFixed(3);
    if (veilOpStr !== lastVeilOpacityStr) {
      lastVeilOpacityStr = veilOpStr;
      pixelVeil.style.setProperty('opacity', veilOpStr);
    }

    if (enterBtn) {
      const nextReady = t >= 0.92;
      if (lastEnterReadyState !== nextReady) {
        lastEnterReadyState = nextReady;
        enterBtn.disabled = false;
        if (nextReady) {
          enterBtn.classList.remove('is-loading');
          enterBtn.classList.add('is-ready');
        } else {
          enterBtn.classList.add('is-loading');
          enterBtn.classList.remove('is-ready');
        }
      }
    }

    updateSunClockAndParchmentAtProgress(t);
  }

  /**
   * Triggers the 60FPS Plain-Black Paintbrush Writing -> Glide Up -> Paintbrush Scene Reveal.
   */
  function triggerPixelVeilMaterialization(immediate = false, startTimeOverride = null) {
    if (!pixelVeil) return;
    stopMosaicLoop();

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (immediate || reduceMotion) {
      resolvePixelVeil();
      return;
    }

    pixelVeil.classList.remove('is-resolved');
    if (enterBtn) {
      enterBtn.classList.add('is-loading');
      enterBtn.classList.remove('is-ready');
    }

    const nowPerf =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const rawStartTime =
      typeof startTimeOverride === 'number' && Number.isFinite(startTimeOverride)
        ? Math.min(nowPerf, startTimeOverride)
        : nowPerf;
    const durationMs = TOTAL_INTRO_DURATION_MS;
    let effectiveStartTime = rawStartTime;
    let worldHoldAccumMs = 0;
    let monoNow = nowPerf;

    const initialWorldReady =
      typeof window === 'undefined' || window.__WORLD_VISUAL_READY__ !== false;
    let initT = Math.min(1, Math.max(0, (nowPerf - effectiveStartTime) / durationMs));
    // Never skip past the calligraphic write phase if module import started late
    if (typeof startTimeOverride === 'number' && initT > 0.30) {
      initT = 0.30;
      effectiveStartTime = nowPerf - initT * durationMs;
    }
    if (!initialWorldReady && initT > 0.56) {
      worldHoldAccumMs += (initT - 0.56) * durationMs;
      initT = 0.56;
    }
    let maxSeenT = initT;
    renderDitherVeilAtProgress(initT);

    const stepMosaic = (rawNow) => {
      const worldReadyForDissolve =
        typeof window === 'undefined' || window.__WORLD_VISUAL_READY__ !== false;
      const now =
        typeof rawNow === 'number' && Number.isFinite(rawNow)
          ? Math.max(monoNow, rawNow)
          : monoNow;
      const dtMs = Math.max(0, now - monoNow);
      monoNow = now;

      const rawT = (now - effectiveStartTime - worldHoldAccumMs) / durationMs;
      if (!worldReadyForDissolve && rawT > 0.56) {
        worldHoldAccumMs += dtMs;
      }

      let t = Math.min(
        1,
        Math.max(maxSeenT, (now - effectiveStartTime - worldHoldAccumMs) / durationMs)
      );
      if (!worldReadyForDissolve && t > 0.56) {
        t = 0.56;
      }
      maxSeenT = t;
      renderDitherVeilAtProgress(t);

      if (t < 1) {
        mosaicRafId = requestAnimationFrame(stepMosaic);
      } else {
        mosaicRafId = null;
        resolvePixelVeil();
      }
    };

    mosaicRafId = requestAnimationFrame(stepMosaic);
  }

  function setOnboardingOption(optNum = 1) {
    const cleanOpt = Number(optNum) === 2 ? 2 : Number(optNum) === 3 ? 3 : 1;
    state.onboardingOption = cleanOpt;
    root.dataset.onboardOpt = String(cleanOpt);
    if (
      state.step === FLOW_STEPS.TITLE &&
      !pixelVeil?.classList.contains('is-resolved')
    ) {
      renderDitherVeilAtProgress(state.lastDitherProgress);
    }
    return cleanOpt;
  }

  function applyHeroScreenPositions() {
    const kPos = state.heroScreenPositions.knight;
    const mPos = state.heroScreenPositions.mage;
    const claimedRole = state.localRole === 'Mage' ? 'Mage' : 'Knight';

    // Compute the true screen-space crown of the Knight's helmet & Mage's hat
    // (`main.js` projects `headY` at +2.45m / +2.75m and `y` at +1.25m chest;
    // the actual mesh hat/helmet tip sits ~32%-36% down from `headY` toward `y`).
    const kCrownY = kPos
      ? typeof kPos.headY === 'number'
        ? kPos.headY + (kPos.y - kPos.headY) * 0.30
        : kPos.y - 140
      : null;
    const mCrownY = mPos
      ? typeof mPos.headY === 'number'
        ? mPos.headY + (mPos.y - mPos.headY) * 0.36
        : mPos.y - 155
      : null;

    if (kPos && claimKnightBtn) {
      claimKnightBtn.style.left = `${kPos.x.toFixed(1)}px`;
      claimKnightBtn.style.top = `${kPos.y.toFixed(1)}px`;
      if (claimKnightBadge && kCrownY !== null) {
        const halfH = (claimKnightBtn.offsetHeight || 220) * 0.5;
        const dyFromTop = kCrownY - (kPos.y - halfH) - 10;
        claimKnightBadge.style.top = `${Math.max(-52, Math.min(-6, dyFromTop)).toFixed(1)}px`;
      }
    }
    if (mPos && claimMageBtn) {
      claimMageBtn.style.left = `${mPos.x.toFixed(1)}px`;
      claimMageBtn.style.top = `${mPos.y.toFixed(1)}px`;
      if (claimMageBadge && mCrownY !== null) {
        const halfH = (claimMageBtn.offsetHeight || 220) * 0.5;
        const dyFromTop = mCrownY - (mPos.y - halfH) - 10;
        claimMageBadge.style.top = `${Math.max(-52, Math.min(-6, dyFromTop)).toFixed(1)}px`;
      }
    }

    // Position the shoulder callout ("Your name: Vikas") right above & slightly outward
    // from the claimed hero's crown so the angled pointer line touches the helm/hat crown!
    const activePos = claimedRole === 'Mage' ? mPos : kPos;
    const activeCrownY = claimedRole === 'Mage' ? mCrownY : kCrownY;
    if (activePos && nameBubble) {
      const vw = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight || 720 : 720;
      const headX = typeof activePos.headX === 'number' ? activePos.headX : activePos.x;
      const baseCrownY = activeCrownY !== null ? activeCrownY : activePos.y - 145;
      const offsetX = claimedRole === 'Mage' ? 54 : -54;
      const targetX = Math.max(164, Math.min(vw - 164, headX + offsetX));
      const targetY = Math.max(118, Math.min(vh - 160, baseCrownY - 42));
      nameBubble.style.left = `${targetX.toFixed(1)}px`;
      nameBubble.style.top = `${targetY.toFixed(1)}px`;
    } else if (nameBubble) {
      nameBubble.style.left = '';
      nameBubble.style.top = '';
    }

    // Position the partner blossom callout ("Ishika / ── ❀ ──") right above the partner's hat/helm!
    const otherPos = claimedRole === 'Mage' ? kPos : mPos;
    const otherCrownY = claimedRole === 'Mage' ? kCrownY : mCrownY;
    if (otherPos && partnerTagEl) {
      const anchorX = typeof otherPos.headX === 'number' ? otherPos.headX : otherPos.x;
      const anchorY = otherCrownY !== null ? otherCrownY - 10 : otherPos.y - 155;
      partnerTagEl.style.left = `${anchorX.toFixed(1)}px`;
      partnerTagEl.style.top = `${Math.max(96, anchorY).toFixed(1)}px`;
    } else if (partnerTagEl) {
      partnerTagEl.style.left = claimedRole === 'Mage' ? '35%' : '64%';
      partnerTagEl.style.top = '28%';
    }
  }

  function setHeroScreenPositions({ knight = null, mage = null } = {}) {
    if (knight && typeof knight.x === 'number' && typeof knight.y === 'number') {
      state.heroScreenPositions.knight = {
        x: knight.x,
        y: knight.y,
        headX: typeof knight.headX === 'number' ? knight.headX : knight.x,
        headY: typeof knight.headY === 'number' ? knight.headY : knight.y - 195,
      };
    }
    if (mage && typeof mage.x === 'number' && typeof mage.y === 'number') {
      state.heroScreenPositions.mage = {
        x: mage.x,
        y: mage.y,
        headX: typeof mage.headX === 'number' ? mage.headX : mage.x,
        headY: typeof mage.headY === 'number' ? mage.headY : mage.y - 225,
      };
    }
    applyHeroScreenPositions();
  }

  function renderLobbyDom() {
    if (roomPhraseEl) {
      roomPhraseEl.textContent = state.roomPhrase || 'Rain on warm limestone';
    }
    if (activePhraseEl) {
      activePhraseEl.textContent = state.roomPhrase || 'Rain on warm limestone';
    }

    const hostIsKnight = state.hostRole !== 'Mage';
    state.hostRole = hostIsKnight ? 'Knight' : 'Mage';
    state.partnerRole = hostIsKnight ? 'Mage' : 'Knight';

    const claimedRole = state.localRole === 'Mage' ? 'Mage' : 'Knight';
    const otherRole = claimedRole === 'Knight' ? 'Mage' : 'Knight';
    const customName = (nameInput?.value ?? state.playerName ?? '').trim();
    const showPartnerBadge = Boolean(
      state.peerConnected || state.partnerName || state.partnerClaimed
    );

    const waitingForPartner = Boolean(
      state.peerConnected && state.localClaimed && !state.partnerClaimed
    );

    if (claimKnightBtn) {
      claimKnightBtn.classList.toggle('is-claimed', claimedRole === 'Knight');
      claimKnightBtn.classList.toggle(
        'is-partner-claimed',
        showPartnerBadge && otherRole === 'Knight'
      );
    }
    if (claimMageBtn) {
      claimMageBtn.classList.toggle('is-claimed', claimedRole === 'Mage');
      claimMageBtn.classList.toggle(
        'is-partner-claimed',
        showPartnerBadge && otherRole === 'Mage'
      );
    }
    if (claimKnightStatus) {
      claimKnightStatus.textContent =
        claimedRole === 'Knight'
          ? waitingForPartner
            ? 'Waiting for partner to ready...'
            : customName
              ? `${customName} · Claimed`
              : 'Claimed'
          : state.partnerName && otherRole === 'Knight'
            ? `${state.partnerName} · Knight`
            : 'Tap to claim';
    }
    if (claimMageStatus) {
      claimMageStatus.textContent =
        claimedRole === 'Mage'
          ? waitingForPartner
            ? 'Waiting for partner to ready...'
            : customName
              ? `${customName} · Claimed`
              : 'Claimed'
          : state.partnerName && otherRole === 'Mage'
            ? `${state.partnerName} · Mage`
            : 'Tap to claim';
    }
    if (startBtn) {
      const btnLabel = waitingForPartner
        ? 'Waiting for partner to ready...'
        : 'Confirm name and enter the valley';
      startBtn.title = waitingForPartner
        ? 'Waiting for partner to ready...'
        : 'Enter the valley';
      startBtn.setAttribute('aria-label', btnLabel);
      startBtn.dataset.waiting = waitingForPartner ? '1' : '0';
    }

    if (nameBubble) {
      nameBubble.dataset.claimedRole = claimedRole;
    }
    if (innerClaimBubble) {
      innerClaimBubble.dataset.claimedRole = claimedRole;
    }

    if (partnerTagEl) {
      partnerTagEl.classList.toggle('is-visible', showPartnerBadge);
      const pName = state.partnerName || (state.peerConnected ? 'Partner' : '');
      const displayPartnerLabel = pName || otherRole;
      partnerTagEl.innerHTML = `<span class="af-partner-name-text">${displayPartnerLabel}</span>${SVG_PARTNER_BLOSSOM_DIVIDER}`;
    }

    applyHeroScreenPositions();
  }

  function setErrorMessage(message = '') {
    state.error = String(message || '').trim();
    if (!errorBanner) return;
    errorBanner.textContent = state.error;
    errorBanner.classList.toggle('is-visible', Boolean(state.error));
  }

  function setStep(nextStep, { silent = false, loadingDurationMs = 450, startTimeOverride = null } = {}) {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }

    state.step = nextStep;
    root.dataset.step = nextStep;
    if (flowRootAliasEl) {
      flowRootAliasEl.dataset.step = nextStep;
    }

    root.querySelectorAll('.af-scene').forEach((sec) => {
      sec.classList.toggle('is-active', sec.dataset.flowScene === nextStep);
    });

    if (nextStep === FLOW_STEPS.TITLE) {
      triggerPixelVeilMaterialization(false, startTimeOverride);
    } else {
      resolvePixelVeil();
    }

    if (nextStep === FLOW_STEPS.FLOWER_LOBBY) {
      renderLobbyDom();
    }

    if (nextStep === FLOW_STEPS.LOADING) {
      if (loadingFill) loadingFill.style.width = '36%';
      requestAnimationFrame(() => {
        if (loadingFill) loadingFill.style.width = '88%';
      });
      if (loadingDurationMs > 0) {
        loadingTimer = setTimeout(() => {
          loadingTimer = null;
          if (state.step === FLOW_STEPS.LOADING) {
            if (loadingFill) loadingFill.style.width = '100%';
            setStep(FLOW_STEPS.CREATE_JOIN);
          }
        }, loadingDurationMs);
      }
    }

    if (!silent && typeof onFlowStepChanged === 'function') {
      onFlowStepChanged(state.step, { ...state });
    }
  }

  function selectRole(targetRole, { preserveTypedInput = true } = {}) {
    const cleanRole = targetRole === 'Mage' ? 'Mage' : 'Knight';
    const currentTyped = preserveTypedInput && nameInput ? nameInput.value : state.playerName;

    if (state.isHost) {
      state.hostRole = cleanRole;
      state.partnerRole = cleanRole === 'Knight' ? 'Mage' : 'Knight';
      state.localRole = state.hostRole;
    } else {
      state.partnerRole = cleanRole;
      state.hostRole = cleanRole === 'Knight' ? 'Mage' : 'Knight';
      state.localRole = state.partnerRole;
    }

    if (preserveTypedInput && nameInput && currentTyped !== undefined) {
      nameInput.value = currentTyped;
      state.playerName = currentTyped.trim();
    }

    renderLobbyDom();
    if (typeof onRoleSelect === 'function') {
      onRoleSelect(state.localRole, { ...state });
    }
    if (typeof onLobbyClaim === 'function') {
      onLobbyClaim({
        role: state.localRole,
        playerName: state.playerName,
        claimed: state.localClaimed,
      });
    }
  }

  function claimCharacter(role, optionalName = undefined) {
    if (typeof optionalName === 'string') {
      state.playerName = optionalName.trim();
      if (nameInput) nameInput.value = state.playerName;
    }
    selectRole(role === 'Mage' ? 'Mage' : 'Knight', { preserveTypedInput: true });
  }

  // Clicking the phrase in Create World cycles through ROMANTIC_ROOM_PHRASES
  if (activePhraseEl) {
    activePhraseEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const curIdx = ROMANTIC_ROOM_PHRASES.indexOf(state.roomPhrase);
      const nextPhrase =
        ROMANTIC_ROOM_PHRASES[(curIdx + 1) % ROMANTIC_ROOM_PHRASES.length];
      state.roomPhrase = nextPhrase;
      activePhraseEl.textContent = nextPhrase;
      if (phraseInput) phraseInput.value = nextPhrase;
      root.querySelectorAll('[data-phrase-chip]').forEach((c) => {
        c.classList.toggle(
          'is-active',
          c.getAttribute('data-phrase-chip') === nextPhrase
        );
      });
    });
  }

  // Poetic phrase chips in Create World frame (kept in DOM for programmatic selection)
  root.querySelectorAll('[data-phrase-chip]').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const chosen = chip.getAttribute('data-phrase-chip') || 'Rain on warm limestone';
      state.roomPhrase = chosen;
      if (activePhraseEl) activePhraseEl.textContent = chosen;
      if (phraseInput) phraseInput.value = chosen;
      root.querySelectorAll('[data-phrase-chip]').forEach((c) => {
        c.classList.toggle('is-active', c === chip);
      });
    });
  });

  function tryRequestMobileFullscreenAndLandscape() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    const isTouch =
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      window.matchMedia?.('(pointer: coarse)')?.matches ||
      /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator?.userAgent || '');
    if (!isTouch) return;
    try {
      const docEl = document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const req =
          docEl.requestFullscreen ||
          docEl.webkitRequestFullscreen ||
          docEl.msRequestFullscreen;
        if (typeof req === 'function') {
          const p = req.call(docEl, { navigationUI: 'hide' });
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      }
    } catch {
      // ignore fullscreen restrictions on iOS Safari tab
    }
    try {
      const lockFn = window.screen?.orientation?.lock;
      if (typeof lockFn === 'function') {
        const p = lockFn.call(window.screen.orientation, 'landscape');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      // ignore orientation lock restrictions
    }
  }

  // Screen 1 -> Screen 2 (straight to CREATE_JOIN, no separate loading screen)
  if (enterBtn) {
    enterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tryRequestMobileFullscreenAndLandscape();
      setStep(FLOW_STEPS.CREATE_JOIN);
    });
  }

  if (createBtn) {
    createBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tryRequestMobileFullscreenAndLandscape();
      setErrorMessage('');
      state.roomPhrase = state.roomPhrase || generateRomanticRoomPhrase(0);
      state.isHost = true;
      state.localRole = state.hostRole;
      state.localClaimed = false;
      state.partnerClaimed = false;
      state.guestReady = false;
      state.expeditionStarted = false;
      state.playerCount = state.peerConnected ? 2 : 1;
      if (typeof onCreateWorld === 'function') {
        onCreateWorld({
          roomPhrase: state.roomPhrase,
          role: state.localRole,
          isHost: true,
        });
      }
      setStep(FLOW_STEPS.FLOWER_LOBBY);
    });
  }

  function submitJoinWorld() {
    tryRequestMobileFullscreenAndLandscape();
    setErrorMessage('');
    const typed = phraseInput?.value?.trim();
    state.roomPhrase = typed || state.roomPhrase || 'Rain on warm limestone';
    state.isHost = false;
    state.localRole = state.partnerRole;
    state.localClaimed = false;
    state.partnerClaimed = false;
    state.guestReady = false;
    state.playerCount = 2;
    if (typeof onJoinWorld === 'function') {
      onJoinWorld({
        roomPhrase: state.roomPhrase,
        role: state.localRole,
        isHost: false,
      });
    }
    setStep(FLOW_STEPS.FLOWER_LOBBY);
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      submitJoinWorld();
    });
  }

  if (phraseInput) {
    phraseInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        submitJoinWorld();
      }
    });
  }

  /**
   * Real-Use-Case Fix #2:
   * - Solo (`playerCount === 1` and `!peerConnected`): immediate start on Enter.
   * - 2-Player (`peerConnected === true`): locks local seat & name, starting immediately
   *   once both seats are claimed & named.
   */
  function triggerEnterValleyFromLobby(forceSoloStart = false) {
    tryRequestMobileFullscreenAndLandscape();
    if (nameInput && nameInput.value.trim()) {
      state.playerName = nameInput.value.trim();
    }
    state.localClaimed = true;
    if (!state.isHost) {
      state.guestReady = true;
    }
    renderLobbyDom();

    if (typeof onLobbyClaim === 'function') {
      onLobbyClaim({
        role: state.localRole,
        playerName: state.playerName,
        claimed: true,
      });
    }
    if (typeof onToggleReady === 'function') {
      onToggleReady(true, { ...state });
    }

    const isSoloMode = Boolean(forceSoloStart) || !state.peerConnected;
    const bothSeatsReady =
      state.peerConnected && Boolean(state.partnerClaimed || state.expeditionStarted);

    if (isSoloMode || bothSeatsReady) {
      setStep(FLOW_STEPS.IN_GAME);
      if (typeof onStartGame === 'function') {
        onStartGame({ ...state, soloTest: Boolean(forceSoloStart) });
      }
    }
  }

  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      e.stopPropagation();
      state.playerName = nameInput.value.trim();
      renderLobbyDom();
      if (typeof onLobbyClaim === 'function') {
        onLobbyClaim({
          role: state.localRole,
          playerName: state.playerName,
          claimed: state.localClaimed,
        });
      }
    });
    nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerEnterValleyFromLobby(false);
      }
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerEnterValleyFromLobby(false);
    });
  }

  // DEV_SOLO_TEST_REMOVE_FOR_PROD: One-click solo test entry
  if (soloTestBtn) {
    soloTestBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerEnterValleyFromLobby(true);
    });
  }

  if (claimKnightBtn) {
    claimKnightBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      claimCharacter('Knight');
    });
  }

  if (claimMageBtn) {
    claimMageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      claimCharacter('Mage');
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const inviteUrl = new URL(window.location?.href || 'http://localhost/');
      inviteUrl.searchParams.set('room', state.roomPhrase);
      try {
        await navigator.clipboard?.writeText(inviteUrl.toString());
      } catch {
        // Fallback if clipboard API is restricted
      }
      copyBtn.classList.add('is-copied');
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyBtn.classList.remove('is-copied');
      }, 1600);
    });
  }

  /**
   * Simultaneous 3D hero claim race arbitration: if a remote update reassigns localRole
   * while the player is actively typing their name in `#app-flow-name-input`, preserve
   * their typed name and slide `#app-flow-name-bubble` smoothly to the remaining hero.
   */
  function setLobbyState(patch = {}) {
    const preservedTypedValue = nameInput ? nameInput.value : state.playerName;
    const wasInputFocused =
      typeof document !== 'undefined' && document.activeElement === nameInput;

    if (typeof patch.roomPhrase === 'string' && patch.roomPhrase.trim()) {
      const incoming = patch.roomPhrase.trim();
      if (incoming !== 'LOVE' || !state.roomPhrase) {
        state.roomPhrase = incoming;
      }
    }
    if (typeof patch.playerName === 'string' && !wasInputFocused) {
      state.playerName = patch.playerName.trim();
      if (nameInput) nameInput.value = state.playerName;
    }
    if (typeof patch.partnerName === 'string') {
      state.partnerName = patch.partnerName.trim();
    }
    if (typeof patch.partnerClaimed === 'boolean') {
      state.partnerClaimed = patch.partnerClaimed;
    }
    if (typeof patch.expeditionStarted === 'boolean') {
      state.expeditionStarted = patch.expeditionStarted;
    }
    if (typeof patch.isHost === 'boolean') {
      state.isHost = patch.isHost;
    }
    if (patch.hostRole === 'Knight' || patch.hostRole === 'Mage') {
      state.hostRole = patch.hostRole;
      state.partnerRole = patch.hostRole === 'Knight' ? 'Mage' : 'Knight';
    }

    if (patch.partnerClaimedRole === 'Knight' || patch.partnerClaimedRole === 'Mage') {
      if (typeof patch.partnerClaimed !== 'boolean') {
        state.partnerClaimed = true;
      }
      const remainingRole = patch.partnerClaimedRole === 'Knight' ? 'Mage' : 'Knight';
      state.localRole = remainingRole;
      if (state.isHost) {
        state.hostRole = remainingRole;
        state.partnerRole = patch.partnerClaimedRole;
      } else {
        state.partnerRole = remainingRole;
        state.hostRole = patch.partnerClaimedRole;
      }
    } else if (patch.localRole === 'Knight' || patch.localRole === 'Mage') {
      state.localRole = patch.localRole;
      if (state.isHost) {
        state.hostRole = patch.localRole;
        state.partnerRole = patch.localRole === 'Knight' ? 'Mage' : 'Knight';
      } else {
        state.partnerRole = patch.localRole;
        state.hostRole = patch.localRole === 'Knight' ? 'Mage' : 'Knight';
      }
    }

    if (nameInput && preservedTypedValue && patch.playerName === undefined) {
      nameInput.value = preservedTypedValue;
      state.playerName = preservedTypedValue.trim();
    }

    if (typeof patch.playerCount === 'number') {
      state.playerCount = Math.max(1, Math.min(2, patch.playerCount));
    }
    if (typeof patch.peerConnected === 'boolean') {
      state.peerConnected = patch.peerConnected;
      if (patch.peerConnected && state.playerCount < 2) {
        state.playerCount = 2;
      }
    }
    if (typeof patch.guestReady === 'boolean') {
      state.guestReady = patch.guestReady;
      if (
        typeof patch.partnerClaimed !== 'boolean' &&
        patch.guestReady &&
        state.peerConnected &&
        state.isHost
      ) {
        state.partnerClaimed = true;
      }
    }
    if (typeof patch.error === 'string') {
      setErrorMessage(patch.error);
    }

    renderLobbyDom();

    if (wasInputFocused && nameInput) {
      nameInput.focus();
    }

    if (
      state.step === FLOW_STEPS.FLOWER_LOBBY &&
      state.peerConnected &&
      ((state.localClaimed && state.partnerClaimed) || state.expeditionStarted)
    ) {
      setStep(FLOW_STEPS.IN_GAME);
      if (typeof onStartGame === 'function') {
        onStartGame({
          ...state,
          fromRemoteExpeditionStart: Boolean(state.expeditionStarted && !state.partnerClaimed),
        });
      }
    }
  }

  function markWorldReady() {
    if (state.step === FLOW_STEPS.LOADING) {
      if (loadingFill) loadingFill.style.width = '100%';
      setStep(FLOW_STEPS.CREATE_JOIN);
    }
  }

  function skipToGame() {
    setStep(FLOW_STEPS.IN_GAME);
  }

  const skip =
    typeof autoSkip === 'boolean' ? autoSkip : shouldAutoSkipOpeningFlow();

  if (stepFromUrl && Object.values(FLOW_STEPS).includes(stepFromUrl)) {
    setStep(stepFromUrl);
  } else if (skip) {
    setStep(FLOW_STEPS.IN_GAME, { silent: true });
  } else {
    const bootT0 =
      typeof window !== 'undefined' && typeof window.__BOOT_STROKE_T0__ === 'number'
        ? window.__BOOT_STROKE_T0__
        : null;
    setStep(FLOW_STEPS.TITLE, { startTimeOverride: bootT0 });
  }

  const api = {
    root,
    FLOW_STEPS,
    ONBOARDING_OPTIONS,
    getStep: () => state.step,
    isInGame: () => state.step === FLOW_STEPS.IN_GAME,
    setStep,
    getState: () => ({ ...state }),
    setLobbyState,
    claimCharacter,
    setHeroScreenPositions,
    resolvePixelVeil,
    renderDitherVeilAtProgress,
    triggerPixelVeilMaterialization,
    stopMosaicLoop,
    setOnboardingOption,
    getOnboardingOption: () => state.onboardingOption,
    setErrorMessage,
    markWorldReady,
    skipToGame,
    getCameraPoseForStep: (step = state.step, groundHeightFn = null) =>
      getOpeningCameraPose(step, groundHeightFn),
    destroy() {
      if (loadingTimer) clearTimeout(loadingTimer);
      if (copyTimer) clearTimeout(copyTimer);
      stopMosaicLoop();
      root.remove();
    },
  };

  if (typeof window !== 'undefined') {
    window.__APP_FLOW__ = api;
  }

  return api;
}
