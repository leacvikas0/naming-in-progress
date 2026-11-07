// ============================================================================
// world/src/ui/app-flow.js
//
// Amarante ("The Unfading Bloom") - High-Craft Calligraphic Open-Air Linework &
// 3D Flower Field Lobby Flow (Matching `amarante-target-01-opening-flow.png`):
//   1. `title`        - 36px -> 1px mosaic canvas resolve (2.2s), Italic Calligraphic
//                       `Amarante` wordmark + blossom swash flourish + botanical sprig CTA
//   2. `create_join`  - `Open or Join Domain` header + two crystal-clear open-air
//                       botanical frames with top-border cutout emblems & italic poetry
//   3. `flower_lobby` - Direct 3D Hero Claim in the Flower Field (0, 128) with
//                       open-air italic underline + angled helmet pointer (`Your name: Vikas`)
//                       and open-air blossom partner header (`Ishika`)
//   4. `in_game`      - Transitions camera behind hero & activates see-through HUD
// ============================================================================

export const FLOW_STEPS = Object.freeze({
  TITLE: 'title',
  LOADING: 'loading',
  CREATE_JOIN: 'create_join',
  FLOWER_LOBBY: 'flower_lobby',
  IN_GAME: 'in_game',
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
/* High-Craft Botanical & Calligraphic SVGs (Matching Target 01 Reference)   */
/* ------------------------------------------------------------------------- */

const SVG_OPEN_AIR_DIVIDER = `
<svg class="af-sakura-divider-svg" viewBox="0 0 260 32" fill="none" aria-hidden="true">
  <line x1="16" y1="16" x2="104" y2="16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.86"/>
  <circle cx="111" cy="16" r="1.9" fill="currentColor" opacity="0.9"/>
  <g transform="translate(130, 16)">
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(0)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(72)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(144)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(216)"/>
    <path d="M0 -2.2 C-4.8 -12.5, 4.8 -12.5, 0 -2.2 Z" fill="currentColor" transform="rotate(288)"/>
    <circle cx="0" cy="0" r="2.6" fill="#fbbf24"/>
  </g>
  <circle cx="149" cy="16" r="1.9" fill="currentColor" opacity="0.9"/>
  <line x1="156" y1="16" x2="244" y2="16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.86"/>
</svg>
`;

const SVG_AMARANTE_SWASH_FLOURISH = `
<svg class="af-title-swash-svg" viewBox="0 0 420 54" fill="none" aria-hidden="true">
  <path
    d="M36 28 C128 8, 254 6, 336 22 C366 28, 372 44, 342 46 C322 47, 314 35, 330 28"
    stroke="currentColor"
    stroke-width="2.4"
    stroke-linecap="round"
  />
  <path
    d="M78 30 C156 14, 248 13, 326 24"
    stroke="currentColor"
    stroke-width="1.1"
    stroke-linecap="round"
    opacity="0.68"
  />
  <!-- Botanical leaves flanking the right blossom -->
  <path d="M352 25 C344 17, 334 19, 341 27 C345 30, 350 28, 352 25 Z" fill="currentColor" opacity="0.88"/>
  <path d="M376 33 C386 28, 388 37, 377 39 C373 39, 373 35, 376 33 Z" fill="currentColor" opacity="0.88"/>
  <path d="M356 41 C350 49, 360 51, 363 42 Z" fill="currentColor" opacity="0.78"/>
  <!-- 5-petal blossom on the swash tip -->
  <g transform="translate(364, 28)">
    <path d="M0 -2.4 C-5.2 -13.5, 5.2 -13.5, 0 -2.4 Z" fill="currentColor" transform="rotate(0)"/>
    <path d="M0 -2.4 C-5.2 -13.5, 5.2 -13.5, 0 -2.4 Z" fill="currentColor" transform="rotate(72)"/>
    <path d="M0 -2.4 C-5.2 -13.5, 5.2 -13.5, 0 -2.4 Z" fill="currentColor" transform="rotate(144)"/>
    <path d="M0 -2.4 C-5.2 -13.5, 5.2 -13.5, 0 -2.4 Z" fill="currentColor" transform="rotate(216)"/>
    <path d="M0 -2.4 C-5.2 -13.5, 5.2 -13.5, 0 -2.4 Z" fill="currentColor" transform="rotate(288)"/>
    <circle cx="0" cy="0" r="2.8" fill="#fbbf24"/>
  </g>
</svg>
`;

const SVG_BOTANICAL_SPRIG_LEFT = `
<svg class="af-btn-sprig-svg is-left" viewBox="0 0 28 24" fill="none" aria-hidden="true">
  <path d="M22 18 C15 17, 9 13, 5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M10 12 C8 6, 13 5, 14 10 C14 12, 11 12, 10 12 Z" fill="currentColor"/>
  <path d="M16 15 C16 9, 21 9, 20 14 C19 15, 17 15, 16 15 Z" fill="currentColor"/>
  <path d="M9 14 C4 14, 3 10, 8 10 C10 10, 10 13, 9 14 Z" fill="currentColor"/>
</svg>
`;

const SVG_BOTANICAL_SPRIG_RIGHT = `
<svg class="af-btn-sprig-svg is-right" viewBox="0 0 28 24" fill="none" aria-hidden="true">
  <path d="M6 18 C13 17, 19 13, 23 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M18 12 C20 6, 15 5, 14 10 C14 12, 17 12, 18 12 Z" fill="currentColor"/>
  <path d="M12 15 C12 9, 7 9, 8 14 C9 15, 11 15, 12 15 Z" fill="currentColor"/>
  <path d="M19 14 C24 14, 25 10, 20 10 C18 10, 18 13, 19 14 Z" fill="currentColor"/>
</svg>
`;

const SVG_TOP_EMBLEM_SPRIG = `
<svg class="af-top-emblem-svg" viewBox="0 0 56 32" fill="none" aria-hidden="true">
  <path d="M14 24 C22 19, 32 13, 42 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M22 19 C19 12, 24 9, 26 15 C26 17, 24 19, 22 19 Z" fill="currentColor"/>
  <path d="M30 14 C28 7, 33 5, 35 11 C35 13, 32 14, 30 14 Z" fill="currentColor"/>
  <path d="M38 10 C37 4, 42 3, 43 8 C43 10, 40 10, 38 10 Z" fill="currentColor"/>
  <path d="M25 18 C31 19, 33 24, 27 23 C25 22, 24 20, 25 18 Z" fill="currentColor"/>
  <path d="M33 13 C39 14, 41 19, 35 18 C33 17, 32 15, 33 13 Z" fill="currentColor"/>
</svg>
`;

const SVG_TOP_EMBLEM_TRAVELERS = `
<svg class="af-top-emblem-svg" viewBox="0 0 56 32" fill="none" aria-hidden="true">
  <circle cx="23" cy="11" r="4.2" stroke="currentColor" stroke-width="1.6"/>
  <path d="M15.5 23.5 C15.5 18.8, 18.8 16.5, 23 16.5 C27.2 16.5, 30.5 18.8, 30.5 23.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="34.5" cy="12.5" r="3.6" stroke="currentColor" stroke-width="1.5"/>
  <path d="M29.5 23.5 C30.2 19.6, 32.5 18, 35.5 18 C38.8 18, 41.2 19.8, 41.8 23.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
`;

const SVG_CARD_THIN_DIVIDER = `
<svg class="af-card-thin-divider-svg" viewBox="0 0 220 12" fill="none" aria-hidden="true">
  <line x1="18" y1="6" x2="102" y2="6" stroke="currentColor" stroke-width="1.1" opacity="0.72"/>
  <polygon points="110,2.5 113.5,6 110,9.5 106.5,6" fill="currentColor" opacity="0.88"/>
  <line x1="118" y1="6" x2="202" y2="6" stroke="currentColor" stroke-width="1.1" opacity="0.72"/>
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

const SVG_CALLOUT_POINTER_KNIGHT = `
<svg class="af-callout-pointer-svg is-knight" viewBox="0 0 240 68" fill="none" aria-hidden="true">
  <line x1="4" y1="3" x2="228" y2="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="48" y1="3" x2="92" y2="58" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="94" cy="60" r="4.0" fill="#1b1822" stroke="currentColor" stroke-width="1.8"/>
</svg>
`;

const SVG_CALLOUT_POINTER_MAGE = `
<svg class="af-callout-pointer-svg is-mage" viewBox="0 0 240 68" fill="none" aria-hidden="true">
  <line x1="12" y1="3" x2="236" y2="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="192" y1="3" x2="148" y2="58" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="146" cy="60" r="4.0" fill="#1b1822" stroke="currentColor" stroke-width="1.8"/>
</svg>
`;

const SVG_KNIGHT_CREST_OUTLINE = `
<svg class="af-role-mini-svg" viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <path d="M14 4 L22 7.5 V14.5 C22 19.5 18.5 23.2 14 24.8 C9.5 23.2 6 19.5 6 14.5 V7.5 L14 4 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M14 7.5 V21.5 M9.5 12.5 H18.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
</svg>
`;

const SVG_MAGE_CREST_OUTLINE = `
<svg class="af-role-mini-svg" viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <polygon points="14,3.5 20.5,14 14,24.5 7.5,14" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="14" cy="14" r="3.2" stroke="currentColor" stroke-width="1.35"/>
</svg>
`;

const SVG_SUBMIT_ARROW = `
<svg class="af-submit-arrow-svg" viewBox="0 0 20 20" fill="none" aria-hidden="true">
  <path d="M4.5 10 H15.5 M11 5.5 L15.5 10 L11 14.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const SVG_COPY_ICON = `
<svg class="af-icon-svg af-copy-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="8" y="7" width="11" height="13" rx="2.2" stroke="currentColor" stroke-width="1.7"/>
  <path d="M15 7V5C15 3.89543 14.1046 3 13 3H6C4.89543 3 4 3.89543 4 5V15C4 16.1046 4.89543 17 6 17H8" stroke="currentColor" stroke-width="1.7"/>
</svg>
`;

const SVG_CHECK_ICON = `
<svg class="af-icon-svg af-check-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

/* ------------------------------------------------------------------------- */
/* Environment-Adaptive Solid Matte Cel-Shaded UI CSS (Zero Glass, Zero Blur)*/
/* ------------------------------------------------------------------------- */

const APP_FLOW_CSS = `
  :root,
  [data-env-polarity="day"],
  [data-env-polarity="golden"],
  [data-env-polarity="night"],
  [data-env-polarity="eclipse"] {
    --af-font-sans: "Plus Jakarta Sans", "Outfit", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --af-surface: rgba(252, 249, 242, 0.94);
    --af-surface-elevated: #ffffff;
    --af-surface-muted: #f3ede0;
    --af-border: #dcd0bc;
    --af-border-strong: #c8b79a;
    --af-ink: #1f1c18;
    --af-ink-muted: #5c5346;
    --af-sky-ink: #ffffff;
    --af-sky-shadow: 0 2px 12px rgba(15, 23, 42, 0.34), 0 1px 3px rgba(15, 23, 42, 0.28);
    --af-accent: #b45309;
    --af-accent-fill: #f59e0b;
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

  /* 36px -> 1px Pixel-to-Clear Mosaic Canvas Overlay (Zero Blur) */
  /* Blurred + Bayer Ordered-Dither Puzzled Materialization Veil */
  #af-pixel-veil {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: transparent;
    backdrop-filter: blur(var(--af-blur-px, 42px)) saturate(1.25);
    -webkit-backdrop-filter: blur(var(--af-blur-px, 42px)) saturate(1.25);
    opacity: 1;
    transition: opacity 380ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  #af-pixel-veil-canvas {
    width: 100%;
    height: 100%;
    display: block;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
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
  /* Light Warm-Stone Surfaces & High-Contrast Readable Buttons              */
  /* ----------------------------------------------------------------------- */
  .af-hairline-frame {
    position: relative;
    pointer-events: auto;
    background: var(--af-surface);
    border: 1.5px solid var(--af-border);
    border-radius: 20px;
    box-shadow:
      inset 0 1px 0 #ffffff,
      0 14px 34px rgba(24, 20, 14, 0.16),
      0 2px 8px rgba(24, 20, 14, 0.08);
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
      0 8px 22px rgba(24, 20, 14, 0.16);
    color: var(--af-ink);
    font-family: var(--af-font-sans);
    font-weight: 700;
    letter-spacing: -0.01em;
    -webkit-tap-highlight-color: transparent;
    transition: transform 150ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out;
  }

  .af-hairline-pill-btn:focus-visible,
  .af-copy-btn:focus-visible,
  .af-phrase-input:focus-visible,
  .af-name-input:focus-visible,
  .af-phrase-chip:focus-visible,
  .af-hero-hit-target:focus-visible,
  .af-name-submit-btn:focus-visible,
  .af-solo-dev-btn:focus-visible {
    outline: 2px solid var(--af-accent);
    outline-offset: 3px;
  }

  .af-hairline-pill-btn:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  @media (hover: hover) {
    .af-hairline-pill-btn:not(:disabled):hover {
      border-color: var(--af-accent);
      background-color: #ffffff;
    }
    .af-copy-btn:hover,
    .af-name-submit-btn:hover {
      border-color: var(--af-accent);
      background-color: #f9dc8f;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .af-hairline-pill-btn:not(:disabled):active,
    .af-hero-hit-target:active,
    .af-name-submit-btn:active,
    .af-solo-dev-btn:active {
      transform: scale(0.97);
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 1: Unified Landing + Dither Reveal + Morphing Play Button        */
  /* ----------------------------------------------------------------------- */
  .af-scene-title {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: min(12vh, 96px);
  }

  .af-title-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 760px;
  }

  .af-sakura-divider-svg {
    width: 220px;
    height: 26px;
    color: var(--af-sky-ink);
    filter: drop-shadow(0 2px 6px rgba(15, 23, 42, 0.28));
    margin-bottom: 6px;
  }

  .af-main-title {
    font-family: var(--af-font-sans);
    font-size: clamp(4.1rem, 7.8vw, 6.1rem);
    font-weight: 800;
    line-height: 0.96;
    letter-spacing: -0.035em;
    color: var(--af-sky-ink);
    text-shadow: var(--af-sky-shadow);
    margin: 0;
    padding: 0 12px;
  }

  .af-title-swash-svg {
    width: clamp(220px, 26vw, 300px);
    height: 32px;
    color: var(--af-sky-ink);
    filter: drop-shadow(0 2px 6px rgba(15, 23, 42, 0.25));
    margin-top: 0;
    margin-bottom: 6px;
  }

  .af-subtitle {
    font-family: var(--af-font-sans);
    font-size: clamp(1.08rem, 1.6vw, 1.32rem);
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: 0.015em;
    color: var(--af-sky-ink);
    text-shadow: var(--af-sky-shadow);
    margin: 0 0 28px 0;
  }

  /* Compact Fixed-Length Morphing Pill (212px x 48px — Always Full, <= 3 Words) */
  .af-enter-btn {
    position: relative;
    overflow: hidden;
    width: 212px;
    min-width: 212px;
    max-width: 212px;
    height: 48px;
    min-height: 48px;
    padding: 0 18px;
    background: var(--af-surface);
    border: 1.5px solid var(--af-border-strong);
    color: var(--af-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.98rem;
    font-weight: 700;
    transition:
      background-color 320ms ease,
      border-color 320ms ease,
      transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 320ms ease;
  }

  .af-enter-btn.is-loading {
    pointer-events: none;
    cursor: default;
    background: rgba(252, 249, 242, 0.95);
  }

  .af-enter-btn.is-ready {
    pointer-events: auto;
    cursor: pointer;
    background: var(--af-cta-bg);
    border-color: var(--af-cta-border);
    color: var(--af-cta-ink);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.65),
      0 10px 26px rgba(24, 20, 14, 0.22);
  }

  @media (hover: hover) {
    .af-enter-btn.is-ready:not(:disabled):hover {
      background-color: #f9dc8f;
      border-color: #b47d1c;
    }
  }

  /* Full-width bottom accent line (always 100% full across the fixed pill) */
  .af-morph-progress-fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    width: 100% !important;
    background: linear-gradient(90deg, #f59e0b 0%, #f6d076 50%, #f59e0b 100%);
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
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--af-ink);
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
    font-size: 1.0rem;
    font-weight: 700;
    color: var(--af-cta-ink);
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
    color: var(--af-accent);
    animation: afSpinSpark 3.6s linear infinite;
    flex-shrink: 0;
  }

  .af-btn-sprig-svg {
    width: 18px;
    height: 15px;
    flex-shrink: 0;
    color: var(--af-accent);
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
    background: var(--af-accent-fill);
    transition: width 180ms ease-out;
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 2: Meet in the Valley (FLOW_STEPS.CREATE_JOIN)                   */
  /* ----------------------------------------------------------------------- */
  .af-scene-create-join {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: min(8vh, 64px);
    gap: 20px;
  }

  .af-create-join-header-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 4px;
  }

  .af-create-join-header {
    font-family: var(--af-font-sans);
    font-size: clamp(2.1rem, 3.6vw, 2.8rem);
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.025em;
    color: var(--af-sky-ink);
    text-shadow: var(--af-sky-shadow);
    margin: 0;
  }

  .af-tablets-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(270px, 336px));
    gap: 24px;
    align-items: stretch;
    max-width: 94vw;
    margin-top: 4px;
  }

  @media (max-width: 640px) {
    .af-tablets-grid {
      grid-template-columns: minmax(260px, 340px);
      gap: 18px;
    }
  }

  .af-world-tablet {
    position: relative;
    padding: 28px 24px 22px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    text-align: center;
    min-height: 236px;
    gap: 12px;
  }

  .af-tablet-top-emblem {
    position: absolute;
    top: -15px;
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 12px;
    background: var(--af-surface-elevated);
    border: 1.5px solid var(--af-border);
    border-radius: 999px;
    color: var(--af-accent);
    pointer-events: none;
    box-shadow: 0 2px 6px rgba(24, 20, 14, 0.08);
  }

  .af-top-emblem-svg {
    width: 40px;
    height: 22px;
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
    font-size: 1.38rem;
    font-weight: 700;
    letter-spacing: -0.015em;
    line-height: 1.2;
    color: var(--af-ink);
    margin: 0;
  }

  .af-card-thin-divider-svg {
    width: 160px;
    height: 10px;
    color: var(--af-border-strong);
    opacity: 0.85;
  }

  .af-active-phrase-display {
    font-family: var(--af-font-sans);
    font-size: 1.06rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--af-ink);
    background: var(--af-surface-muted);
    border: 1px solid var(--af-border);
    border-radius: 10px;
    padding: 8px 14px;
    margin: 10px 0 6px 0;
    cursor: pointer;
    user-select: none;
    width: 88%;
    transition: border-color 140ms ease-out, background-color 140ms ease-out;
  }

  .af-active-phrase-display:hover {
    border-color: var(--af-accent);
    background: #ffffff;
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
    margin: 10px 0 6px 0;
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
    width: 88%;
    height: 40px;
    padding: 6px 12px;
    border: 1.5px solid var(--af-border-strong);
    border-radius: 10px;
    background: #ffffff;
    font-family: var(--af-font-sans);
    font-size: 1.02rem;
    font-weight: 600;
    text-align: center;
    color: var(--af-ink);
    transition: border-color 150ms ease-out;
  }

  .af-phrase-input:focus {
    border-color: var(--af-accent);
    outline: none;
  }

  .af-phrase-input::placeholder {
    color: var(--af-ink-muted);
    opacity: 0.75;
  }

  .af-domain-action-btn {
    width: 88%;
    min-height: 44px;
    padding: 8px 20px;
    background: var(--af-cta-bg);
    color: var(--af-cta-ink);
    border: 1.5px solid var(--af-cta-border);
    box-shadow: 0 4px 12px rgba(24, 20, 14, 0.12);
    font-size: 1.02rem;
    font-weight: 700;
    margin: 0 auto;
  }

  @media (hover: hover) {
    .af-domain-action-btn:not(:disabled):hover {
      background-color: #f9dc8f;
      border-color: #b47d1c;
      color: #1f1c18;
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

  /* 3D-Projected Hero Hit Targets */
  .af-hero-hit-target {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    appearance: none;
    cursor: pointer;
    min-width: 156px;
    min-height: 230px;
    padding: 0;
    border-radius: 24px;
    background: transparent;
    border: 1.5px solid transparent;
    color: var(--af-ink);
    font-family: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    overflow: visible;
    -webkit-tap-highlight-color: transparent;
    transition: border-color 150ms ease-out, transform 150ms ease-out;
  }

  .af-hero-hit-target:hover {
    border-color: rgba(255, 255, 255, 0.65);
  }

  .af-hero-hit-target.is-claimed .af-hero-ring-badge,
  .af-hero-hit-target.is-partner-claimed .af-hero-ring-badge {
    opacity: 0;
    pointer-events: none;
  }

  #app-flow-claim-knight {
    left: 34%;
    top: 48%;
  }

  #app-flow-claim-mage {
    left: 64%;
    top: 48%;
  }

  .af-hero-ring-badge {
    position: absolute;
    left: 50%;
    top: -16px;
    transform: translate(-50%, -100%);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--af-surface);
    border: 1.5px solid var(--af-border);
    box-shadow: 0 6px 18px rgba(24, 20, 14, 0.16);
    white-space: nowrap;
    transition: opacity 150ms ease-out;
  }

  .af-role-mini-svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    color: var(--af-accent);
  }

  .af-crest-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.15;
    text-align: start;
  }

  .af-crest-role {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--af-ink);
  }

  .af-crest-hint {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--af-ink-muted);
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
    background: var(--af-surface);
    border: 1.5px solid var(--af-border);
    border-radius: 12px;
    padding: 6px 14px;
    box-shadow: 0 8px 20px rgba(24, 20, 14, 0.16);
    color: var(--af-ink);
    font-family: var(--af-font-sans);
    font-size: 1.05rem;
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
    color: var(--af-border-strong);
  }

  /* Light Warm-Stone Shoulder Callout Pill ("Your name: Vikas") */
  #app-flow-name-bubble {
    position: absolute;
    left: 26%;
    top: 31%;
    transform: translate(-50%, -50%);
    width: min(286px, 86vw);
    background: var(--af-surface);
    border: 1.5px solid var(--af-border);
    border-radius: 14px;
    padding: 8px 14px;
    box-shadow:
      inset 0 1px 0 #ffffff,
      0 10px 24px rgba(24, 20, 14, 0.18);
    pointer-events: auto;
    z-index: 4;
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 150ms ease-out;
  }

  #app-flow-name-bubble[data-claimed-role="Knight"] {
    left: 26%;
    top: 31%;
  }

  #app-flow-name-bubble[data-claimed-role="Mage"] {
    left: 74%;
    top: 31%;
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
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--af-ink-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .af-name-input {
    flex: 1;
    min-width: 84px;
    height: 32px;
    padding: 0 6px;
    border: none;
    border-bottom: 1.5px solid var(--af-border-strong);
    background: transparent;
    font-family: var(--af-font-sans);
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--af-ink);
  }

  .af-name-input:focus {
    outline: none;
    border-bottom-color: var(--af-accent);
  }

  .af-name-input::placeholder {
    color: var(--af-ink-muted);
    font-weight: 500;
    opacity: 0.65;
  }

  .af-name-submit-btn {
    appearance: none;
    cursor: pointer;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1.5px solid var(--af-cta-bg);
    background: var(--af-cta-bg);
    color: var(--af-cta-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: center;
    -webkit-tap-highlight-color: transparent;
    transition: transform 150ms ease-out, background-color 150ms ease-out;
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
    width: 200px;
    height: 40px;
    color: var(--af-surface);
    filter: drop-shadow(0 2px 4px rgba(24, 20, 14, 0.2));
    pointer-events: none;
    display: none;
  }

  #app-flow-name-bubble[data-claimed-role="Knight"] .af-callout-pointer-svg.is-knight {
    display: block;
  }

  #app-flow-name-bubble[data-claimed-role="Mage"] .af-callout-pointer-svg.is-mage {
    display: block;
  }

  /* Bottom Light Warm-Stone Room-Phrase Bar + DEV Solo Escape Hatch */
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
    background: var(--af-surface);
    border: 1.5px solid var(--af-border);
    border-radius: 999px;
    padding: 6px 8px 6px 16px;
    box-shadow: 0 6px 18px rgba(24, 20, 14, 0.15);
    color: var(--af-ink);
  }

  .af-room-phrase-lbl {
    font-family: var(--af-font-sans);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--af-ink);
    white-space: nowrap;
  }

  .af-copy-btn {
    position: relative;
    appearance: none;
    border: 1px solid var(--af-border-strong);
    background: var(--af-surface-muted);
    color: var(--af-ink);
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .af-copy-btn .af-icon-svg {
    position: absolute;
    width: 16px;
    height: 16px;
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

  /* DEV_SOLO_TEST_REMOVE_FOR_PROD: Simple one-click Solo Test escape hatch */
  .af-solo-dev-btn {
    pointer-events: auto;
    appearance: none;
    cursor: pointer;
    border-radius: 999px;
    border: 1.5px solid var(--af-cta-bg);
    background: var(--af-cta-bg);
    color: var(--af-cta-ink);
    padding: 8px 18px;
    font-family: var(--af-font-sans);
    font-size: 0.92rem;
    font-weight: 700;
    box-shadow: 0 6px 18px rgba(24, 20, 14, 0.18);
    transition: transform 140ms ease-out, background-color 140ms ease-out;
  }

  .af-solo-dev-btn:hover {
    background: #35302a;
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
 * Creates the Amarante High-Craft Calligraphic Open-Air Opening & 3D Flower Field Lobby Flow.
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

        <!-- Floating Light Warm-Stone Callout with Angled Helmet Pointer -->
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

      <!-- Bottom-Center Light Room-Phrase Bar + DEV Solo Test Escape Hatch -->
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
  const morphFillEl = root.querySelector('#app-flow-morph-fill');
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

  const PREP_STAGES = [
    { threshold: 0.0, text: 'Shaping the valley' },
    { threshold: 0.28, text: 'Sowing meadow flowers' },
    { threshold: 0.58, text: 'Raising timber eaves' },
    { threshold: 0.84, text: 'Kindling sunfire' },
  ];

  // Bayer 4x4 ordered-dither matrix (normalized 0..15)
  const BAYER_4X4 = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
  ];

  function tileHash(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function stopMosaicLoop() {
    if (mosaicRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(mosaicRafId);
      mosaicRafId = null;
    }
  }

  function resolvePixelVeil() {
    stopMosaicLoop();
    pixelVeil?.classList.add('is-resolved');
    pixelVeil?.style.setProperty('--af-blur-px', '0px');
    if (enterBtn) {
      enterBtn.disabled = false;
      enterBtn.classList.remove('is-loading');
      enterBtn.classList.add('is-ready');
    }
  }

  /**
   * Renders the puzzled pixel-dither + strong atmospheric blur state at progress `t` in [0..1].
   */
  function renderDitherVeilAtProgress(rawT) {
    if (!pixelVeil || !pixelCanvas) return;
    const t = Math.min(1, Math.max(0, Number(rawT) || 0));

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

    // Strong 46px blur early on so the literal road/houses are completely obscured in unlocked windows,
    // decaying smoothly to 0px as the puzzle dither tiles finish unlocking.
    const blurPx = Math.max(0, Math.pow(1 - t, 1.05) * 46);
    pixelVeil.style.setProperty('--af-blur-px', `${blurPx.toFixed(1)}px`);

    const ctx = pixelCanvas.getContext?.('2d');
    if (!ctx) return;

    // Puzzled pixel-dither tile scale (24px -> 16px -> 12px)
    const blockSize = t < 0.42 ? 24 : t < 0.78 ? 16 : 12;
    const vw = Math.max(1, window.innerWidth || 1440);
    const vh = Math.max(1, window.innerHeight || 900);
    const lowW = Math.max(32, Math.floor(vw / blockSize));
    const lowH = Math.max(20, Math.floor(vh / blockSize));

    if (pixelCanvas.width !== lowW || pixelCanvas.height !== lowH) {
      pixelCanvas.width = lowW;
      pixelCanvas.height = lowH;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, lowW, lowH);

    // Linear-to-smooth progress across [0..1] so t=0.22 has ~82% locked puzzle tiles
    // and t=0.58 has ~46% locked puzzle tiles in interlocking Bayer clusters.
    const progress = Math.pow(t, 1.12);

    for (let y = 0; y < lowH; y++) {
      const ny = y / Math.max(1, lowH - 1);
      for (let x = 0; x < lowW; x++) {
        const nx = x / Math.max(1, lowW - 1);
        const bayerVal = BAYER_4X4[(y & 3) * 4 + (x & 3)] / 15.0;
        const puzzleCluster = tileHash(Math.floor(x / 2), Math.floor(y / 2));
        const fineNoise = tileHash(x, y);
        const centerDist = Math.min(1, Math.hypot(nx - 0.5, ny - 0.46) * 1.35);

        // Full-range [0.06 .. 0.96] puzzle-dither unlock threshold:
        // Interlocking 2x2 puzzle clusters + Bayer 4x4 ordered dither + subtle center-out wave
        const unlockThreshold =
          0.06 +
          0.90 * (puzzleCluster * 0.48 + bayerVal * 0.38 + centerDist * 0.14);

        if (progress >= unlockThreshold) {
          // Unlocked puzzle window — reveals the strongly blurred & sharpening 3D valley beneath
          ctx.clearRect(x, y, 1, 1);
        } else {
          // Locked puzzle-dither tile: rich atmospheric cobalt/cerulean sky, cloud ivory,
          // misty horizon & sunlit meadow palette with puzzled spatial offset
          const jx = (puzzleCluster - 0.5) * 0.24 + (fineNoise - 0.5) * 0.12;
          const jy = (puzzleCluster - 0.5) * 0.26;
          const sy = Math.min(1, Math.max(0, ny + jy));
          const isDitherAlt = ((x + y) & 1) === 0;
          const isPuzzleEdge = (x & 1) === 0 || (y & 1) === 0;

          let r, g, b;
          if (sy < 0.48) {
            // Deep atmospheric cerulean & cobalt sky puzzle blocks + crisp cloud dither clusters
            const skyU = sy / 0.48;
            const isCloudTile = puzzleCluster > 0.70 && sy > 0.16;
            if (isCloudTile) {
              r = isDitherAlt ? 236 : 206;
              g = isDitherAlt ? 246 : 226;
              b = isDitherAlt ? 255 : 248;
            } else {
              r = Math.round(28 + skyU * 76 + jx * 32 + (isDitherAlt ? 14 : -12));
              g = Math.round(104 + skyU * 92 + jx * 28 + (isDitherAlt ? 16 : -12));
              b = Math.round(208 + skyU * 42 + (isDitherAlt ? 12 : -10));
            }
          } else if (sy < 0.63) {
            // Distant cobalt-mist mountain & valley horizon puzzle band
            const mistU = (sy - 0.48) / 0.15;
            r = Math.round(96 + mistU * 42 + jx * 30 + (isDitherAlt ? 16 : -14));
            g = Math.round(162 + mistU * 34 + jx * 26 + (isDitherAlt ? 16 : -14));
            b = Math.round(204 - mistU * 52 + (isDitherAlt ? 14 : -12));
          } else {
            // Sunlit meadow, wildflower & golden path puzzle blocks
            const meadU = (sy - 0.63) / 0.37;
            const isGoldTile = Math.abs(nx - 0.48 + jx * 0.45) < 0.12 && puzzleCluster > 0.36;
            const isBlossomTile = fineNoise > 0.84;
            if (isBlossomTile) {
              r = isDitherAlt ? 234 : 188;
              g = isDitherAlt ? 112 : 138;
              b = isDitherAlt ? 166 : 232;
            } else if (isGoldTile) {
              r = Math.round(208 + jx * 28 + (isDitherAlt ? 16 : -14));
              g = Math.round(168 + jx * 22 + (isDitherAlt ? 14 : -12));
              b = Math.round(86 + (isDitherAlt ? 10 : -8));
            } else {
              r = Math.round(72 + meadU * 32 + jx * 32 + (isDitherAlt ? 16 : -14));
              g = Math.round(162 + meadU * 28 + jx * 28 + (isDitherAlt ? 18 : -14));
              b = Math.round(82 + (1 - meadU) * 38 + (isDitherAlt ? 12 : -10));
            }
          }

          if (isPuzzleEdge) {
            r = Math.max(0, Math.min(255, r - 8));
            g = Math.max(0, Math.min(255, g - 6));
            b = Math.max(0, Math.min(255, b + 6));
          }

          const alpha = Math.min(0.96, Math.max(0.76, (1 - progress * 0.22) * 0.95));
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  /**
   * Blurred + Puzzled Bayer 4x4 Ordered-Dither Materialization & Morphing Preparation-to-Play Capsule.
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

  function applyHeroScreenPositions() {
    const kPos = state.heroScreenPositions.knight;
    const mPos = state.heroScreenPositions.mage;
    const claimedRole = state.localRole === 'Mage' ? 'Mage' : 'Knight';

    if (kPos && claimKnightBtn) {
      claimKnightBtn.style.left = `${kPos.x.toFixed(1)}px`;
      claimKnightBtn.style.top = `${kPos.y.toFixed(1)}px`;
      if (claimKnightBadge && typeof kPos.headY === 'number') {
        const halfH = (claimKnightBtn.offsetHeight || 230) * 0.5;
        const dyFromTop = kPos.headY - (kPos.y - halfH) - 18;
        claimKnightBadge.style.top = `${Math.min(-14, dyFromTop).toFixed(1)}px`;
      }
    }
    if (mPos && claimMageBtn) {
      claimMageBtn.style.left = `${mPos.x.toFixed(1)}px`;
      claimMageBtn.style.top = `${mPos.y.toFixed(1)}px`;
      if (claimMageBadge && typeof mPos.headY === 'number') {
        const halfH = (claimMageBtn.offsetHeight || 230) * 0.5;
        const dyFromTop = mPos.headY - (mPos.y - halfH) - 18;
        claimMageBadge.style.top = `${Math.min(-14, dyFromTop).toFixed(1)}px`;
      }
    }

    // Position the open-air italic callout ("Your name: Vikas") right above & slightly outward
    // from the claimed hero's helmet so the angled pointer line touches the helm crown!
    const activePos = claimedRole === 'Mage' ? mPos : kPos;
    if (activePos && nameBubble) {
      const vw = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight || 720 : 720;
      const headX = typeof activePos.headX === 'number' ? activePos.headX : activePos.x;
      const headY =
        typeof activePos.headY === 'number' ? activePos.headY : activePos.y - 190;
      const offsetX = claimedRole === 'Mage' ? 58 : -58;
      const targetX = Math.max(150, Math.min(vw - 150, headX + offsetX));
      const targetY = Math.max(96, Math.min(vh - 140, headY - 24));
      nameBubble.style.left = `${targetX.toFixed(1)}px`;
      nameBubble.style.top = `${targetY.toFixed(1)}px`;
    } else if (nameBubble) {
      nameBubble.style.left = '';
      nameBubble.style.top = '';
    }

    // Position the partner blossom callout ("Ishika / ── ❀ ──") right above the partner's hat/helm!
    const otherPos = claimedRole === 'Mage' ? kPos : mPos;
    if (otherPos && partnerTagEl) {
      const anchorX = typeof otherPos.headX === 'number' ? otherPos.headX : otherPos.x;
      const anchorY =
        typeof otherPos.headY === 'number' ? otherPos.headY - 8 : otherPos.y - 205;
      partnerTagEl.style.left = `${anchorX.toFixed(1)}px`;
      partnerTagEl.style.top = `${Math.max(64, anchorY).toFixed(1)}px`;
    } else if (partnerTagEl) {
      partnerTagEl.style.left = claimedRole === 'Mage' ? '34%' : '64%';
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

  // Clicking the italic phrase in Open a Domain cycles through ROMANTIC_ROOM_PHRASES
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

  // Poetic phrase chips in Open a Domain frame (kept in DOM for programmatic selection)
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
   * Real-Use-Case Fix #1:
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

    // Race arbitration: if partner claimed the role we were hovering on, slide to the other role
    // while strictly preserving our typed name string.
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

    // Auto-start when in FLOWER_LOBBY and both 2-player seats are claimed & ready
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
