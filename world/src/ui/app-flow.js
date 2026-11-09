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
  if (params.get('flow') === '1' || params.get('opening') === '1') {
    return false;
  }
  if (params.has('shot') || params.get('nolobby') === '1') {
    return true;
  }
  if (window.__HEADLESS_TEST__) {
    return true;
  }
  if (typeof navigator !== 'undefined' && navigator.webdriver) {
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
    --af-cta-bg: #1a1714;
    --af-cta-border: #d97706;
    --af-cta-ink: #fef3c7;
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
  /* Fine-Grain Printmaker Dither Materialization Veil (Zero Chunky Blocks)  */
  /* ----------------------------------------------------------------------- */
  #af-pixel-veil {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: transparent;
    backdrop-filter: blur(var(--af-blur-px, 12px)) saturate(1.14) brightness(1.02);
    -webkit-backdrop-filter: blur(var(--af-blur-px, 12px)) saturate(1.14) brightness(1.02);
    opacity: 1;
    transition: opacity 420ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  #af-pixel-veil-canvas {
    width: 100%;
    height: 100%;
    display: block;
    image-rendering: auto;
  }

  #af-pixel-veil.is-resolved {
    opacity: 0;
    backdrop-filter: blur(0px);
    -webkit-backdrop-filter: blur(0px);
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
  /* Shared Surface & Button Foundations                                     */
  /* ----------------------------------------------------------------------- */
  .af-hairline-frame {
    position: relative;
    pointer-events: auto;
    background: var(--af-surface);
    border: 1.5px solid var(--af-border);
    border-radius: 18px;
    box-shadow:
      inset 0 1px 0 #ffffff,
      inset 0 -2px 0 #ece1cf,
      0 18px 42px rgba(20, 16, 10, 0.22),
      0 4px 12px rgba(20, 16, 10, 0.10);
    color: var(--af-ink);
  }

  .af-hairline-pill-btn {
    position: relative;
    appearance: none;
    pointer-events: auto;
    cursor: pointer;
    border-radius: 999px;
    border: 1.5px solid var(--af-border-strong);
    background: var(--af-surface);
    box-shadow:
      inset 0 1px 0 #ffffff,
      0 10px 26px rgba(20, 16, 10, 0.20);
    color: var(--af-ink);
    font-family: var(--af-font-sans);
    font-weight: 700;
    letter-spacing: -0.01em;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
    transition:
      transform 160ms cubic-bezier(0.22, 1, 0.36, 1),
      border-color 160ms ease-out,
      background-color 160ms ease-out,
      box-shadow 160ms ease-out,
      color 160ms ease-out;
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
  /* Screen 1: Unified Landing + Dither Reveal + Fixed Morphing Pill         */
  /* ----------------------------------------------------------------------- */
  .af-scene-title {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: min(11vh, 88px);
  }

  .af-title-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 780px;
  }

  .af-sakura-divider-svg {
    width: 236px;
    height: 28px;
    color: var(--af-sky-ink);
    filter: drop-shadow(0 2px 8px rgba(15, 23, 42, 0.36));
    margin-bottom: 6px;
  }

  .af-main-title {
    font-family: var(--af-font-sans);
    font-size: clamp(4.2rem, 7.6vw, 6.2rem);
    font-weight: 800;
    line-height: 0.98;
    letter-spacing: -0.04em;
    color: var(--af-sky-ink);
    text-shadow: var(--af-sky-shadow);
    margin: 0;
    padding: 0 14px 4px 14px;
  }

  .af-title-swash-svg {
    width: clamp(230px, 27vw, 316px);
    height: 32px;
    color: var(--af-sky-ink);
    filter: drop-shadow(0 2px 8px rgba(15, 23, 42, 0.34));
    margin-top: -2px;
    margin-bottom: 8px;
  }

  .af-subtitle {
    font-family: var(--af-font-sans);
    font-size: clamp(0.92rem, 1.35vw, 1.08rem);
    font-weight: 700;
    line-height: 1.35;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #fef9ec;
    text-shadow: 0 2px 10px rgba(15, 23, 42, 0.48), 0 1px 2px rgba(15, 23, 42, 0.42);
    margin: 0 0 28px 0;
    padding: 5px 18px;
    border-radius: 999px;
    background: rgba(24, 20, 14, 0.28);
    border: 1px solid rgba(255, 251, 235, 0.32);
  }

  /* Strictly Fixed-Dimension Morphing Pill (224px x 50px — Never Jumps, <= 3 Words) */
  .af-enter-btn {
    position: relative;
    overflow: hidden;
    width: 224px;
    min-width: 224px;
    max-width: 224px;
    height: 50px;
    min-height: 50px;
    max-height: 50px;
    padding: 0 18px;
    background: #faf6ee;
    border: 1.5px solid #c8b494;
    color: var(--af-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.98rem;
    font-weight: 700;
    box-shadow:
      inset 0 1px 0 #ffffff,
      0 14px 32px rgba(15, 23, 42, 0.28);
  }

  .af-enter-btn.is-loading {
    pointer-events: none;
    cursor: default;
    background: #faf6ee;
  }

  .af-enter-btn.is-ready {
    pointer-events: auto;
    cursor: pointer;
    background: #1a1714;
    border-color: #f59e0b;
    color: #fef3c7;
    box-shadow:
      inset 0 0 0 1px rgba(251, 191, 36, 0.35),
      0 14px 34px rgba(15, 23, 42, 0.36);
  }

  @media (hover: hover) {
    .af-enter-btn.is-ready:not(:disabled):hover {
      background: #29241e;
      border-color: #fbbf24;
      transform: translateY(-1px);
    }
  }

  /* Living bottom horizon bar across the fixed pill */
  .af-morph-progress-fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3.5px;
    width: 100% !important;
    background: linear-gradient(90deg, #d97706 0%, #fbbf24 50%, #d97706 100%);
    transition: height 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease;
    pointer-events: none;
    z-index: 0;
  }

  .af-enter-btn.is-ready .af-morph-progress-fill {
    height: 100%;
    opacity: 0;
  }

  .af-morph-loading-layer,
  .af-morph-ready-layer {
    position: relative;
    z-index: 1;
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity 260ms ease, transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .af-morph-loading-layer {
    font-size: 0.91rem;
    font-weight: 700;
    color: #1f1c18;
    white-space: nowrap;
  }

  .af-enter-btn.is-ready .af-morph-loading-layer {
    position: absolute;
    opacity: 0;
    transform: translateY(-12px) scale(0.96);
    pointer-events: none;
  }

  .af-morph-ready-layer {
    position: absolute;
    opacity: 0;
    transform: translateY(12px) scale(0.96);
    pointer-events: none;
    font-size: 0.98rem;
    font-weight: 700;
    color: inherit;
    white-space: nowrap;
  }

  .af-enter-btn.is-ready .af-morph-ready-layer {
    position: relative;
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  @keyframes afSpinSpark {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .af-prep-spark-svg {
    width: 14px;
    height: 14px;
    color: #d97706;
    animation: afSpinSpark 3.6s linear infinite;
    flex-shrink: 0;
  }

  .af-btn-sprig-svg {
    width: 18px;
    height: 15px;
    flex-shrink: 0;
    color: #fbbf24;
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
    color: var(--af-ink);
    background: var(--af-surface);
    border: 1px solid var(--af-border);
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
    background: var(--af-accent-gold);
    transition: width 180ms ease-out;
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 2: Meet in the Valley (FLOW_STEPS.CREATE_JOIN)                   */
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
    font-family: var(--af-font-sans);
    font-size: clamp(2.2rem, 3.8vw, 3.0rem);
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -0.03em;
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

  /* Integrated Inset Medallion Header (Replaces clumsy protruding top border pill) */
  .af-tablet-top-emblem {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 30px;
    border-radius: 999px;
    background: #1a1714;
    border: 1px solid #d97706;
    color: #fbbf24;
    pointer-events: none;
    margin-bottom: 2px;
    box-shadow: 0 3px 10px rgba(24, 20, 14, 0.14);
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
    font-family: var(--af-font-sans);
    font-size: 1.36rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.18;
    color: var(--af-ink);
    margin: 0;
  }

  .af-card-thin-divider-svg {
    width: 168px;
    height: 10px;
    color: var(--af-border-strong);
    opacity: 0.9;
  }

  /* Interactive Phrase Selector Pill with Shuffle Glyph via ::after */
  .af-active-phrase-display {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--af-font-sans);
    font-size: 0.94rem;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--af-ink);
    background: var(--af-surface-muted);
    border: 1.5px solid var(--af-border-strong);
    border-radius: 12px;
    height: 42px;
    padding: 0 36px 0 14px;
    margin: 8px 0 4px 0;
    cursor: pointer;
    user-select: none;
    width: 92%;
    box-shadow: inset 0 1px 2px rgba(24, 20, 14, 0.06);
    transition: border-color 150ms ease-out, background-color 150ms ease-out, transform 120ms ease-out;
  }

  .af-active-phrase-display::after {
    content: "";
    position: absolute;
    right: 11px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    background-image: ${SHUFFLE_ICON_DATA_URI};
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    opacity: 0.85;
  }

  .af-active-phrase-display:hover {
    border-color: var(--af-accent);
    background: #ffffff;
  }

  .af-active-phrase-display:active {
    transform: scale(0.985);
  }

  /* Keep [data-phrase-chip] in DOM for programmatic tests while hiding stacked boxes */
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
    height: 42px;
    padding: 6px 14px;
    border: 1.5px solid var(--af-border-strong);
    border-radius: 12px;
    background: #ffffff;
    font-family: var(--af-font-sans);
    font-size: 0.94rem;
    font-weight: 700;
    text-align: center;
    color: var(--af-ink);
    box-shadow: inset 0 1px 3px rgba(24, 20, 14, 0.08);
    transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
  }

  .af-phrase-input:focus {
    border-color: var(--af-accent);
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22);
    outline: none;
  }

  .af-phrase-input::placeholder {
    color: var(--af-ink-muted);
    font-weight: 500;
    opacity: 0.72;
  }

  .af-domain-action-btn {
    width: 92%;
    min-height: 46px;
    padding: 10px 22px;
    background: #1a1714;
    color: #fef3c7;
    border: 1.5px solid #d97706;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      0 6px 16px rgba(24, 20, 14, 0.18);
    font-size: 1.0rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    margin: 0 auto;
  }

  @media (hover: hover) {
    .af-domain-action-btn:not(:disabled):hover {
      background: #29241e;
      border-color: #fbbf24;
      color: #ffffff;
      transform: translateY(-1px);
    }
  }

  .af-error-banner {
    pointer-events: auto;
    display: none;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-radius: 999px;
    background: #fff1f2;
    border: 1.5px solid #f43f5e;
    color: #9f1239;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .af-error-banner.is-visible {
    display: inline-flex;
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 3: Flower Field 3D Hero Claim (FLOW_STEPS.FLOWER_LOBBY)          */
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

  /* 3D-Projected Hero Hit Targets (Invisible hit box, never draws a box over hero face) */
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
    color: var(--af-ink);
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
    padding: 6px 15px 6px 8px;
    border-radius: 999px;
    background: #faf6ee;
    border: 1.5px solid #c8b494;
    box-shadow:
      inset 0 1px 0 #ffffff,
      0 10px 24px rgba(20, 16, 10, 0.24);
    white-space: nowrap;
    transition: opacity 150ms ease-out, transform 150ms ease-out;
  }

  .af-hero-hit-target:hover .af-hero-ring-badge {
    border-color: #d97706;
    transform: translate(-50%, calc(-100% - 2px));
  }

  .af-role-mini-svg {
    width: 26px;
    height: 26px;
    padding: 4px;
    border-radius: 50%;
    background: #1a1714;
    color: #fbbf24;
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
    font-size: 0.94rem;
    font-weight: 800;
    color: var(--af-ink);
  }

  .af-crest-hint {
    font-size: 0.76rem;
    font-weight: 600;
    color: #786954;
  }

  /* Partner Name Pill above the other hero */
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
    background: #faf6ee;
    border: 1.5px solid #c8b494;
    border-radius: 14px;
    padding: 6px 16px;
    box-shadow: 0 10px 24px rgba(20, 16, 10, 0.22);
    color: var(--af-ink);
    font-family: var(--af-font-sans);
    font-size: 1.02rem;
    font-weight: 800;
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
    color: #b45309;
  }

  /* Floating Shoulder Callout ("Your name: Vikas") */
  #app-flow-name-bubble {
    position: absolute;
    left: 28%;
    top: 26%;
    transform: translate(-50%, -50%);
    width: min(296px, 86vw);
    background: #faf6ee;
    border: 1.5px solid #c8b494;
    border-radius: 16px;
    padding: 9px 12px 9px 16px;
    box-shadow:
      inset 0 1px 0 #ffffff,
      0 14px 30px rgba(20, 16, 10, 0.24);
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
    font-weight: 700;
    color: #574e40;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .af-name-input {
    flex: 1;
    min-width: 84px;
    height: 32px;
    padding: 0 6px;
    border: none;
    border-bottom: 2px solid #bca686;
    background: transparent;
    font-family: var(--af-font-sans);
    font-size: 1.04rem;
    font-weight: 800;
    color: var(--af-ink);
  }

  .af-name-input:focus {
    outline: none;
    border-bottom-color: #d97706;
  }

  .af-name-input::placeholder {
    color: #8c7e6a;
    font-weight: 600;
    opacity: 0.72;
  }

  .af-name-submit-btn {
    appearance: none;
    cursor: pointer;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1.5px solid #d97706;
    background: #1a1714;
    color: #fef3c7;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: center;
    -webkit-tap-highlight-color: transparent;
    transition: transform 150ms ease-out, background-color 150ms ease-out;
  }

  .af-name-submit-btn:hover {
    background: #29241e;
    border-color: #fbbf24;
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
    color: #faf6ee;
    pointer-events: none;
    display: none;
  }

  #app-flow-name-bubble[data-claimed-role="Knight"] .af-callout-pointer-svg.is-knight {
    display: block;
  }

  #app-flow-name-bubble[data-claimed-role="Mage"] .af-callout-pointer-svg.is-mage {
    display: block;
  }

  /* Bottom Sanctuary Room-Phrase Dock + Solo Escape Hatch */
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
    background: #faf6ee;
    border: 1.5px solid #c8b494;
    border-radius: 999px;
    padding: 6px 8px 6px 18px;
    box-shadow:
      inset 0 1px 0 #ffffff,
      0 10px 24px rgba(20, 16, 10, 0.20);
    color: var(--af-ink);
  }

  .af-room-phrase-lbl {
    font-family: var(--af-font-sans);
    font-size: 0.94rem;
    font-weight: 700;
    color: var(--af-ink);
    white-space: nowrap;
  }

  .af-copy-btn {
    position: relative;
    appearance: none;
    border: 1px solid #bca686;
    background: #f1e9d8;
    color: var(--af-ink);
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
    background: #ffffff;
    border-color: #d97706;
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
    color: #16a34a;
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
    border: 1.5px solid #d97706;
    background: #1a1714;
    color: #fef3c7;
    padding: 9px 20px;
    font-family: var(--af-font-sans);
    font-size: 0.92rem;
    font-weight: 700;
    box-shadow: 0 10px 24px rgba(20, 16, 10, 0.24);
    transition: transform 140ms ease-out, background-color 140ms ease-out;
  }

  .af-solo-dev-btn:hover {
    background: #29241e;
    border-color: #fbbf24;
  }

  @media (max-width: 780px) {
    #app-flow-name-bubble[data-claimed-role="Knight"],
    #app-flow-name-bubble[data-claimed-role="Mage"] {
      left: 50%;
      top: 64%;
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
  if (bootSplash) {
    bootSplash.remove();
  }

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
    localRole: 'Knight',
    hostRole: 'Knight',
    partnerRole: 'Mage',
    playerName: '',
    partnerName: '',
    localClaimed: false,
    partnerClaimed: false,
    playerCount: 1,
    guestReady: true,
    peerConnected: false,
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
    <div id="af-pixel-veil" aria-hidden="true">
      <canvas id="af-pixel-veil-canvas"></canvas>
    </div>

    <!-- 1. UNIFIED LANDING + DITHER REVEAL + MORPHING PLAY SCREEN (FLOW_STEPS.TITLE) -->
    <section class="af-scene af-scene-title" data-flow-scene="title" aria-label="Title Screen">
      <div class="af-title-stack">
        ${SVG_OPEN_AIR_DIVIDER}
        <h1 class="af-main-title">Amarante</h1>
        ${SVG_AMARANTE_SWASH_FLOURISH}
        <p class="af-subtitle">The Unfading Bloom · A Valley for Two</p>

        <button
          type="button"
          class="af-hairline-pill-btn af-enter-btn is-loading"
          id="app-flow-enter-btn"
          data-flow-action="enter"
          aria-live="polite"
        >
          <span class="af-morph-progress-fill" id="app-flow-morph-fill"></span>
          <span class="af-morph-loading-layer" id="app-flow-morph-loading">
            <svg class="af-prep-spark-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L14.6 9.4L22 12L14.6 14.6L12 22L9.4 14.6L2 12L9.4 9.4L12 2Z" fill="currentColor"/>
            </svg>
            <span id="app-flow-prep-label">Shaping the valley</span>
          </span>
          <span class="af-morph-ready-layer" id="app-flow-morph-ready">
            ${SVG_BOTANICAL_SPRIG_LEFT}
            <span>Enter the Valley</span>
            ${SVG_BOTANICAL_SPRIG_RIGHT}
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

  const mountTarget = container || document.getElementById('hud') || document.body;
  mountTarget.appendChild(root);

  // Cache DOM references
  const pixelVeil = root.querySelector('#af-pixel-veil');
  const pixelCanvas = root.querySelector('#af-pixel-veil-canvas');
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

  // Reusable ImageData buffer for ultra-fast (< 1.2ms) 2px fine-grain stipple rendering
  let cachedImgData = null;
  let cachedU32 = null;
  let cachedW = 0;
  let cachedH = 0;

  const PREP_STAGES = [
    { threshold: 0.0, text: 'Shaping the valley' },
    { threshold: 0.28, text: 'Sowing meadow flowers' },
    { threshold: 0.58, text: 'Raising timber eaves' },
    { threshold: 0.84, text: 'Kindling sunfire' },
  ];

  function packAbgr(r, g, b, a) {
    return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }

  function stopMosaicLoop() {
    if (mosaicRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(mosaicRafId);
      mosaicRafId = null;
    }
  }

  function resolvePixelVeil() {
    stopMosaicLoop();
    state.lastDitherProgress = 1;
    pixelVeil?.classList.add('is-resolved');
    pixelVeil?.style.setProperty('--af-blur-px', '0px');
    if (enterBtn) {
      enterBtn.disabled = false;
      enterBtn.classList.remove('is-loading');
      enterBtn.classList.add('is-ready');
    }
  }

  /**
   * Renders the Artist-Grade Fine-Grain Printmaker Dither Materialization at progress `t` in [0..1].
   * Zero chunky 24px pixel blocks: uses a 640x400 (~2px fine grain) stipple canvas + living vector overlays.
   */
  function renderDitherVeilAtProgress(rawT) {
    if (!pixelVeil || !pixelCanvas) return;
    const t = Math.min(1, Math.max(0, Number(rawT) || 0));
    state.lastDitherProgress = t;

    if (t >= 0.999) {
      resolvePixelVeil();
      return;
    }

    pixelVeil.classList.remove('is-resolved');
    if (enterBtn) {
      enterBtn.disabled = false;
      enterBtn.classList.add('is-loading');
      enterBtn.classList.remove('is-ready');
    }

    if (prepLabelEl) {
      let activeStageText = PREP_STAGES[0].text;
      for (const st of PREP_STAGES) {
        if (t >= st.threshold) activeStageText = st.text;
      }
      if (prepLabelEl.textContent !== activeStageText) {
        prepLabelEl.textContent = activeStageText;
      }
    }

    // Gentle atmospheric mist-to-focus (12px -> 0px) so the real 3D valley shines through the fine dither weave
    const blurPx = Math.max(0, Math.pow(1 - t, 1.55) * 12.5);
    pixelVeil.style.setProperty('--af-blur-px', `${blurPx.toFixed(1)}px`);

    const ctx = pixelCanvas.getContext?.('2d');
    if (!ctx) return;

    // Fine-grain lithograph stipple resolution (960x600 => ~1.5px crisp stipple grain on 1440x900, zero macro-grid!)
    const vw = Math.max(1, window.innerWidth || 1440);
    const vh = Math.max(1, window.innerHeight || 900);
    const fineW = Math.min(960, Math.max(480, Math.floor(vw / 1.5)));
    const fineH = Math.min(600, Math.max(300, Math.floor(vh / 1.5)));

    if (pixelCanvas.width !== fineW || pixelCanvas.height !== fineH) {
      pixelCanvas.width = fineW;
      pixelCanvas.height = fineH;
    }

    const progress = Math.pow(t, 1.04);

    if (
      typeof ctx.createImageData === 'function' &&
      typeof ctx.putImageData === 'function'
    ) {
      if (!cachedImgData || cachedW !== fineW || cachedH !== fineH) {
        cachedImgData = ctx.createImageData(fineW, fineH);
        cachedU32 = new Uint32Array(cachedImgData.data.buffer);
        cachedW = fineW;
        cachedH = fineH;
      }

      const buf = cachedU32;
      const invW = 1.0 / Math.max(1, fineW - 1);
      const invH = 1.0 / Math.max(1, fineH - 1);

      // Precompute row & column organic wave tables to avoid trig inside the inner loop
      const rowWaveA = new Float32Array(fineH);
      const rowWaveB = new Float32Array(fineH);
      for (let y = 0; y < fineH; y++) {
        const ny = y * invH;
        rowWaveA[y] = Math.sin(ny * 12.0 - t * 6.0) * 0.055;
        rowWaveB[y] = Math.cos(ny * 23.0 + t * 4.2) * 0.028;
      }
      const colWaveA = new Float32Array(fineW);
      for (let x = 0; x < fineW; x++) {
        const nx = x * invW;
        colWaveA[x] =
          Math.cos(nx * 14.0 - t * 4.8) * 0.048 +
          Math.sin(nx * 27.0 + t * 3.5) * 0.022;
      }

      const frontierWidth = 0.15;
      let idx = 0;
      for (let y = 0; y < fineH; y++) {
        const ny = y * invH;
        const rWave = rowWaveA[y] + rowWaveB[y];
        const ignRow = (y & 63) << 6;
        const b4Row = (y & 3) << 2;

        for (let x = 0; x < fineW; x++, idx++) {
          const nx = x * invW;
          const ign = IGN_64X64[ignRow | (x & 63)];
          const b4 = BAYER_4X4[b4Row | (x & 3)];

          // Sunbeam Radial Lithograph Stipple radiating from the valley sun (0.50, 0.21) & central road
          const dxSun = nx - 0.50 + rWave * 0.25;
          const dySun = (ny - 0.21) * 0.85 + colWaveA[x] * 0.22;
          const sunDist = Math.sqrt(dxSun * dxSun + dySun * dySun);
          const roadDist =
            Math.abs(nx - 0.50 + rWave * 0.40) * (0.48 + (1.0 - ny) * 0.62);
          const waveField = Math.min(1.0, sunDist * 0.62 + roadDist * 0.38);
          const stippleMix = ign * 0.78 + b4 * 0.22;
          const unlockThreshold =
            0.02 + 0.95 * (waveField * 0.64 + stippleMix * 0.36);

          if (progress >= unlockThreshold) {
            // Unlocked stipple pore — reveals the live 3D valley underneath
            buf[idx] = 0;
            continue;
          }

          const delta = unlockThreshold - progress;
          const isFrontier = delta < frontierWidth;
          const checker = ((x ^ y) & 1) === 0;

          let r, g, b, alpha;

          if (isFrontier) {
            // Active Living Dissolve Frontier: Sunbeam Lithograph Gold & Alabaster corona
            const fNorm = 1.0 - delta / frontierWidth;
            r = checker ? 254 : 251;
            g = checker ? 243 : 191;
            b = checker ? 199 : 36;
            alpha = Math.round((0.86 - fNorm * 0.36) * 255);
          } else {
            // Veiled Lithograph Underpainting with fine 1.5px breathing micro-pores
            if (ign < 0.18 + progress * 0.25) {
              buf[idx] = 0;
              continue;
            }

            const stippleShift = checker ? 5 : -5;
            if (ny < 0.46) {
              const u = ny / 0.46;
              r = Math.round(238 + (1 - u) * 12 + stippleShift);
              g = Math.round(242 + (1 - u) * 8 + stippleShift);
              b = Math.round(239 - (1 - u) * 8 + stippleShift);
            } else {
              const u = (ny - 0.46) / 0.54;
              r = Math.round(240 - u * 10 + stippleShift);
              g = Math.round(231 - u * 12 + stippleShift);
              b = Math.round(212 - u * 16 + stippleShift);
            }

            const baseAlpha = Math.min(
              0.86,
              Math.max(0.42, (1.0 - progress * 0.45) * 0.84)
            );
            alpha = Math.round(baseAlpha * 255);
          }

          buf[idx] = packAbgr(
            Math.max(0, Math.min(255, r)),
            Math.max(0, Math.min(255, g)),
            Math.max(0, Math.min(255, b)),
            Math.max(0, Math.min(255, alpha))
          );
        }
      }

      ctx.putImageData(cachedImgData, 0, 0);
    } else {
      ctx.clearRect(0, 0, fineW, fineH);
    }

    // Living 2D Vector Accents: Shimmering Golden Sun-Motes & Radial Zenith Rays
    if (typeof ctx.save === 'function') {
      ctx.save();
      const fadeOut = Math.min(1, (1 - t) * 2.2);
      const sunX = fineW * 0.50;
      const sunY = fineH * 0.21;
      ctx.strokeStyle = `rgba(253, 230, 138, ${(0.22 * fadeOut).toFixed(3)})`;
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + t * 0.35;
        const r0 = fineW * (0.04 + progress * 0.22);
        const r1 = r0 + fineW * 0.14;
        ctx.beginPath();
        ctx.moveTo(sunX + Math.cos(ang) * r0, sunY + Math.sin(ang) * r0);
        ctx.lineTo(sunX + Math.cos(ang) * r1, sunY + Math.sin(ang) * r1);
        ctx.stroke();
      }
      for (let i = 0; i < 32; i++) {
        const seed = i * 1.6180339;
        const ang = (seed * 4.7) % (Math.PI * 2);
        const rad =
          (0.06 + progress * 0.52 + ((seed * 0.31) % 0.14)) * fineW * 0.65;
        const mx = sunX + Math.cos(ang) * rad;
        const my = sunY + Math.sin(ang) * rad * 0.85;
        const rDot = (i % 3 === 0 ? 2.2 : 1.4) * fadeOut;
        ctx.fillStyle =
          i % 2 === 0
            ? `rgba(254, 243, 199, ${(0.85 * fadeOut).toFixed(3)})`
            : `rgba(251, 191, 36, ${(0.80 * fadeOut).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(mx, my, rDot, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /**
   * Living Printmaker Dither Materialization & Fixed-Width Morphing Preparation-to-Play Pill.
   */
  function triggerPixelVeilMaterialization(immediate = false) {
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

    renderDitherVeilAtProgress(0.05);

    const startTime =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const durationMs = 2400;

    const stepMosaic = (now) => {
      const t = Math.min(1, Math.max(0, (now - startTime) / durationMs));
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
          ? customName
            ? `${customName} · Claimed`
            : 'Claimed'
          : state.partnerName && otherRole === 'Knight'
            ? `${state.partnerName} · Knight`
            : 'Tap to claim';
    }
    if (claimMageStatus) {
      claimMageStatus.textContent =
        claimedRole === 'Mage'
          ? customName
            ? `${customName} · Claimed`
            : 'Claimed'
          : state.partnerName && otherRole === 'Mage'
            ? `${state.partnerName} · Mage`
            : 'Tap to claim';
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

  function setStep(nextStep, { silent = false, loadingDurationMs = 450 } = {}) {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }

    state.step = nextStep;
    root.dataset.step = nextStep;

    root.querySelectorAll('.af-scene').forEach((sec) => {
      sec.classList.toggle('is-active', sec.dataset.flowScene === nextStep);
    });

    if (nextStep === FLOW_STEPS.TITLE) {
      triggerPixelVeilMaterialization();
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

  // Screen 1 -> Screen 2 (straight to CREATE_JOIN, no separate loading screen)
  if (enterBtn) {
    enterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setStep(FLOW_STEPS.CREATE_JOIN);
    });
  }

  if (createBtn) {
    createBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setErrorMessage('');
      state.roomPhrase = state.roomPhrase || generateRomanticRoomPhrase(0);
      state.isHost = true;
      state.localRole = state.hostRole;
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
    setErrorMessage('');
    const typed = phraseInput?.value?.trim();
    state.roomPhrase = typed || state.roomPhrase || 'Rain on warm limestone';
    state.isHost = false;
    state.localRole = state.partnerRole;
    state.guestReady = true;
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
    if (nameInput && nameInput.value.trim()) {
      state.playerName = nameInput.value.trim();
    }
    state.localClaimed = true;
    state.guestReady = true;
    renderLobbyDom();

    if (typeof onToggleReady === 'function') {
      onToggleReady(true, { ...state });
    }

    const isSoloMode =
      forceSoloStart || (!state.peerConnected && (state.playerCount || 1) <= 1);
    const bothSeatsReady =
      state.peerConnected && Boolean(state.partnerClaimed || state.guestReady);

    if (isSoloMode || bothSeatsReady) {
      setStep(FLOW_STEPS.IN_GAME);
      if (typeof onStartGame === 'function') {
        onStartGame({ ...state, soloTest: Boolean(forceSoloStart || isSoloMode) });
      }
    }
  }

  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      e.stopPropagation();
      state.playerName = nameInput.value.trim();
      renderLobbyDom();
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
    if (typeof patch.isHost === 'boolean') {
      state.isHost = patch.isHost;
    }
    if (patch.hostRole === 'Knight' || patch.hostRole === 'Mage') {
      state.hostRole = patch.hostRole;
      state.partnerRole = patch.hostRole === 'Knight' ? 'Mage' : 'Knight';
    }

    if (patch.partnerClaimedRole === 'Knight' || patch.partnerClaimedRole === 'Mage') {
      state.partnerClaimed = true;
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
      if (patch.guestReady && state.peerConnected) {
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
      state.localClaimed &&
      state.partnerClaimed
    ) {
      setStep(FLOW_STEPS.IN_GAME);
      if (typeof onStartGame === 'function') {
        onStartGame({ ...state });
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
    setStep(FLOW_STEPS.TITLE);
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
