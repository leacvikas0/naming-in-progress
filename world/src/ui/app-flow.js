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
  [data-env-polarity="day"] {
    --hud-ink: #fffdf9;
    --hud-ink-muted: #f7f1e8;
    --hud-ring-border: #f7efe2;
    --hud-ring-inner: rgba(251, 211, 107, 0.55);
    --hud-ring-fill: #1b1822;
    --hud-shadow: rgba(18, 12, 20, 0.85);
    --hud-accent: #fbd36b;
    --ui-ink: var(--hud-ink);
    --ui-ink-muted: var(--hud-ink-muted);
    --ui-hairline: var(--hud-ring-border);
    --ui-hairline-inner: var(--hud-ring-inner);
    --ui-wash: var(--hud-ring-fill);
    --ui-contour: 0 2px 6px var(--hud-shadow);
    --ui-accent: var(--hud-accent);
  }

  [data-env-polarity="golden"] {
    --hud-ink: #ffeed6;
    --hud-ink-muted: #f7d6b5;
    --hud-ring-border: #ffeed6;
    --hud-ring-inner: rgba(251, 146, 60, 0.62);
    --hud-ring-fill: #211624;
    --hud-shadow: rgba(28, 14, 24, 0.88);
    --hud-accent: #fb923c;
  }

  [data-env-polarity="night"] {
    --hud-ink: #eef4ff;
    --hud-ink-muted: #cbd8f6;
    --hud-ring-border: #eef4ff;
    --hud-ring-inner: rgba(125, 211, 252, 0.55);
    --hud-ring-fill: #131828;
    --hud-shadow: rgba(10, 14, 28, 0.90);
    --hud-accent: #7dd3fc;
  }

  [data-env-polarity="eclipse"] {
    --hud-ink: #ffe8ee;
    --hud-ink-muted: #f9becf;
    --hud-ring-border: #ffe8ee;
    --hud-ring-inner: rgba(225, 29, 72, 0.72);
    --hud-ring-fill: #1e0d16;
    --hud-shadow: rgba(24, 6, 14, 0.92);
    --hud-accent: #e11d48;
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
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, "Palatino Linotype", serif;
    color: var(--hud-ink);
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
  #af-pixel-veil {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: transparent;
    opacity: 1;
    transition: opacity 320ms cubic-bezier(0.22, 1, 0.36, 1);
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
  /* Solid Matte Cel-Shaded Sanctuary Tablets & Pill Buttons (ZERO Glass)    */
  /* ----------------------------------------------------------------------- */
  .af-hairline-frame {
    position: relative;
    pointer-events: auto;
    background: #1b1822;
    border: 2px solid #f7efe2;
    border-radius: 22px;
    box-shadow:
      inset 0 0 0 4px #1b1822,
      inset 0 0 0 5.2px rgba(251, 211, 107, 0.52),
      0 12px 28px rgba(14, 10, 18, 0.72);
    color: #fffdf9;
  }

  .af-hairline-pill-btn {
    position: relative;
    appearance: none;
    pointer-events: auto;
    cursor: pointer;
    border-radius: 999px;
    border: 2px solid #f7efe2;
    background: #1b1822;
    box-shadow:
      inset 0 0 0 3px #1b1822,
      inset 0 0 0 4.2px rgba(251, 211, 107, 0.65),
      0 6px 18px rgba(18, 12, 20, 0.65);
    color: #fffdf9;
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-weight: 600;
    letter-spacing: 0.02em;
    -webkit-tap-highlight-color: transparent;
    transition-property: transform, border-color, background-color, opacity;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  .af-hairline-pill-btn:focus-visible,
  .af-copy-btn:focus-visible,
  .af-phrase-input:focus-visible,
  .af-name-input:focus-visible,
  .af-phrase-chip:focus-visible,
  .af-hero-hit-target:focus-visible,
  .af-name-submit-btn:focus-visible {
    outline: 2px solid var(--hud-accent);
    outline-offset: 3px;
  }

  .af-hairline-pill-btn:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  @media (hover: hover) {
    .af-hairline-pill-btn:not(:disabled):hover {
      border-color: #fbd36b;
      background-color: #282332;
    }
    .af-copy-btn:hover,
    .af-name-submit-btn:hover {
      border-color: #fbd36b;
      background-color: #fffdf9;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .af-hairline-pill-btn:not(:disabled):active,
    .af-hero-hit-target:active,
    .af-name-submit-btn:active {
      transform: scale(0.96);
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 1: Title Screen (FLOW_STEPS.TITLE) — Match Target 01 Panel 1     */
  /* ----------------------------------------------------------------------- */
  .af-scene-title {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: min(8.5vh, 72px);
  }

  .af-title-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 780px;
  }

  .af-sakura-divider-svg {
    width: 248px;
    height: 30px;
    color: var(--hud-ink);
    filter:
      drop-shadow(0 2px 0 #1b1822)
      drop-shadow(0 -1px 0 #1b1822)
      drop-shadow(1px 0 0 #1b1822)
      drop-shadow(-1px 0 0 #1b1822);
    margin-bottom: 2px;
  }

  .af-main-title {
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-style: italic;
    font-size: clamp(5.1rem, 8.8vw, 7.1rem);
    font-weight: 600;
    line-height: 0.94;
    letter-spacing: 0.01em;
    color: #fffdf9;
    paint-order: stroke fill;
    -webkit-text-stroke: 4px #1b1822;
    text-shadow: 0 3px 0 #1b1822, 0 6px 14px rgba(18, 12, 20, 0.72);
    margin: 0;
    padding: 0 12px;
  }

  .af-title-swash-svg {
    width: clamp(290px, 34vw, 396px);
    height: 46px;
    color: var(--hud-ink);
    filter:
      drop-shadow(0 2px 0 #1b1822)
      drop-shadow(0 -1px 0 #1b1822)
      drop-shadow(1px 0 0 #1b1822)
      drop-shadow(-1px 0 0 #1b1822);
    margin-top: -8px;
    margin-bottom: 4px;
  }

  .af-subtitle {
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: clamp(1.22rem, 1.9vw, 1.52rem);
    font-style: italic;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: 0.05em;
    color: #fffdf9;
    paint-order: stroke fill;
    -webkit-text-stroke: 2.5px #1b1822;
    text-shadow: 0 2px 0 #1b1822, 0 4px 10px rgba(18, 12, 20, 0.72);
    margin: 0 0 6px 0;
  }

  .af-credits-block {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #fffdf9;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: clamp(1.02rem, 1.35vw, 1.16rem);
    font-weight: 600;
    line-height: 1.35;
    padding: 4px 16px;
    background: #1b1822;
    border: 1.5px solid #f7efe2;
    border-radius: 999px;
    box-shadow: 0 4px 12px rgba(18, 12, 20, 0.68);
    paint-order: stroke fill;
    -webkit-text-stroke: 2.5px #1b1822;
    margin-bottom: 22px;
  }

  .af-credit-dot {
    opacity: 0.92;
    color: var(--hud-accent);
  }

  .af-enter-btn {
    min-width: 326px;
    min-height: 60px;
    padding: 12px 28px;
    background: #1b1822;
    border: 2px solid #f7efe2;
    color: #fffdf9;
    box-shadow:
      inset 0 0 0 3px #1b1822,
      inset 0 0 0 4.2px rgba(251, 211, 107, 0.65),
      0 6px 18px rgba(18, 12, 20, 0.65);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    font-size: 1.48rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .af-btn-sprig-svg {
    width: 26px;
    height: 22px;
    flex-shrink: 0;
    opacity: 0.96;
    color: #fbd36b;
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
    width: min(420px, 86vw);
  }

  .af-loading-title {
    font-size: 1.35rem;
    font-style: italic;
    font-weight: 600;
    color: #fffdf9;
    background: #1b1822;
    border: 1.5px solid #f7efe2;
    border-radius: 999px;
    padding: 3px 14px;
    line-height: 1.2;
  }

  .af-loading-stone-bar {
    width: 100%;
    height: 12px;
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
    background: #fbd36b;
    transition: width 180ms ease-out;
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 2: Open or Join Domain (FLOW_STEPS.CREATE_JOIN) — Target 01 P2   */
  /* ----------------------------------------------------------------------- */
  .af-scene-create-join {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: min(8.5vh, 72px);
    gap: 24px;
  }

  .af-create-join-header-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 4px;
  }

  .af-create-join-header {
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-size: clamp(2.45rem, 4.2vw, 3.25rem);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: 0.015em;
    color: #fffdf9;
    paint-order: stroke fill;
    -webkit-text-stroke: 3.5px #1b1822;
    text-shadow: 0 3px 0 #1b1822, 0 5px 14px rgba(18, 12, 20, 0.72);
    margin: 0;
  }

  .af-tablets-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(280px, 344px));
    gap: 32px;
    align-items: stretch;
    max-width: 94vw;
    margin-top: 8px;
  }

  @media (max-width: 640px) {
    .af-tablets-grid {
      grid-template-columns: minmax(260px, 340px);
      gap: 22px;
    }
  }

  .af-world-tablet {
    position: relative;
    padding: 32px 28px 26px 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    text-align: center;
    min-height: 256px;
    gap: 14px;
  }

  /* Top-border ornament emblem on each domain frame */
  .af-tablet-top-emblem {
    position: absolute;
    top: -18px;
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 12px;
    background: #1b1822;
    border: 1.5px solid #f7efe2;
    border-radius: 999px;
    color: #fbd36b;
    pointer-events: none;
  }

  .af-top-emblem-svg {
    width: 48px;
    height: 28px;
    display: block;
  }

  /* Left/Right vertical border diamond ornaments */
  .af-side-diamond {
    position: absolute;
    top: 50%;
    width: 9px;
    height: 9px;
    background: #fbd36b;
    border: 1.2px solid #1b1822;
    transform: translate(-50%, -50%) rotate(45deg);
    pointer-events: none;
  }

  .af-side-diamond.is-left {
    left: 0;
  }

  .af-side-diamond.is-right {
    left: 100%;
  }

  .af-tablet-top-block {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .af-tablet-heading {
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-size: 1.88rem;
    font-weight: 600;
    line-height: 1.15;
    color: #fffdf9;
    margin: 0;
  }

  .af-card-thin-divider-svg {
    width: 196px;
    height: 12px;
    color: #fbd36b;
    opacity: 0.92;
  }

  .af-active-phrase-display {
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-size: 1.56rem;
    font-style: italic;
    font-weight: 600;
    line-height: 1.28;
    color: #fffdf9;
    margin: 14px 0 10px 0;
    cursor: pointer;
    user-select: none;
    max-width: 240px;
    transition: transform 140ms ease-out;
  }

  .af-active-phrase-display:hover {
    transform: scale(1.02);
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
    margin: 14px 0 8px 0;
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
    height: 42px;
    padding: 6px 10px;
    border: 1.5px solid rgba(247, 239, 226, 0.45);
    border-bottom: 2px solid #f7efe2;
    border-radius: 10px;
    background: #120f18;
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-size: 1.42rem;
    font-style: italic;
    font-weight: 600;
    text-align: center;
    color: #fffdf9;
    transition: border-color 150ms ease-out;
  }

  .af-phrase-input:focus {
    border-color: var(--hud-accent);
    outline: none;
  }

  .af-phrase-input::placeholder {
    color: var(--hud-ink-muted);
    opacity: 0.72;
  }

  .af-domain-action-btn {
    width: 82%;
    min-height: 48px;
    padding: 8px 24px;
    background: #f7efe2;
    color: #1b1822;
    border: 2px solid #fbd36b;
    box-shadow: 0 4px 12px rgba(14, 10, 18, 0.55);
    font-size: 1.35rem;
    font-weight: 700;
    margin: 0 auto;
  }

  @media (hover: hover) {
    .af-domain-action-btn:not(:disabled):hover {
      background-color: #fbd36b;
      border-color: #fffdf9;
      color: #1b1822;
    }
  }

  .af-error-banner {
    pointer-events: auto;
    display: none;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-radius: 999px;
    background: #1e0d16;
    border: 1.8px solid #f43f5e;
    color: #fffdf9;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .af-error-banner.is-visible {
    display: inline-flex;
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 3: Flower Field 3D Hero Claim (FLOW_STEPS.FLOWER_LOBBY) — P3     */
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
    color: var(--hud-ink);
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
    border-color: #fbd36b;
  }

  /* Hide redundant overhead role badge when claimed or partner-claimed so only the
     solid cel-ink pointer callout ("Your name: Vikas") and partner tag ("Ishika") show! */
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
    background: #1b1822;
    border: 1.8px solid #f7efe2;
    box-shadow: 0 4px 12px rgba(14, 10, 18, 0.72);
    white-space: nowrap;
    transition: opacity 150ms ease-out;
  }

  .af-role-mini-svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: #fbd36b;
  }

  .af-crest-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.15;
    text-align: start;
  }

  .af-crest-role {
    font-size: 1.15rem;
    font-weight: 600;
    color: #fffdf9;
  }

  .af-crest-hint {
    font-size: 0.85rem;
    font-style: italic;
    font-weight: 500;
    color: var(--hud-ink-muted);
  }

  /* Solid Matte Cel-Ink Partner Name Pill + Blossom Divider above the other hero */
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
    background: #1b1822;
    border: 1.8px solid #f7efe2;
    border-radius: 12px;
    padding: 8px 16px;
    box-shadow:
      inset 0 0 0 2px #1b1822,
      inset 0 0 0 3.2px rgba(251, 211, 107, 0.52),
      0 8px 20px rgba(14, 10, 18, 0.75);
    color: #fffdf9;
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-size: 1.72rem;
    font-weight: 600;
    line-height: 1.05;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 150ms ease-out;
  }

  #app-flow-partner-tag.is-visible {
    opacity: 1;
  }

  .af-partner-blossom-svg {
    width: 142px;
    height: 20px;
    color: #f7efe2;
  }

  /* Solid Matte Cel-Ink Shoulder Callout Pill ("Your name: Vikas") */
  #app-flow-name-bubble {
    position: absolute;
    left: 26%;
    top: 31%;
    transform: translate(-50%, -50%);
    width: min(286px, 86vw);
    background: #1b1822;
    border: 1.8px solid #f7efe2;
    border-radius: 12px;
    padding: 8px 16px;
    box-shadow:
      inset 0 0 0 2px #1b1822,
      inset 0 0 0 3.2px rgba(251, 211, 107, 0.52),
      0 8px 20px rgba(14, 10, 18, 0.75);
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
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-size: 1.44rem;
    font-style: italic;
    font-weight: 600;
    color: #f7efe2;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .af-name-input {
    flex: 1;
    min-width: 84px;
    height: 34px;
    padding: 0 4px;
    border: none;
    border-bottom: 1.5px solid rgba(251, 211, 107, 0.65);
    background: transparent;
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-size: 1.58rem;
    font-style: italic;
    font-weight: 700;
    color: #fffdf9;
  }

  .af-name-input:focus {
    outline: none;
    border-bottom-color: #fbd36b;
  }

  .af-name-input::placeholder {
    color: var(--hud-ink-muted);
    font-weight: 500;
    opacity: 0.72;
  }

  .af-name-submit-btn {
    appearance: none;
    cursor: pointer;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1.5px solid #fbd36b;
    background: #f7efe2;
    color: #1b1822;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: center;
    -webkit-tap-highlight-color: transparent;
    transition: transform 150ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out;
  }

  .af-submit-arrow-svg {
    width: 15px;
    height: 15px;
  }

  .af-callout-pointer-svg {
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    width: 220px;
    height: 44px;
    color: #f7efe2;
    filter: drop-shadow(0 2px 0 #1b1822);
    pointer-events: none;
    display: none;
  }

  #app-flow-name-bubble[data-claimed-role="Knight"] .af-callout-pointer-svg.is-knight {
    display: block;
  }

  #app-flow-name-bubble[data-claimed-role="Mage"] .af-callout-pointer-svg.is-mage {
    display: block;
  }

  /* Bottom Solid Matte Cel-Ink Room-Phrase Pill */
  .af-lobby-bottom-row {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding-bottom: 6px;
  }

  .af-lobby-room-bar {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: #1b1822;
    border: 1.8px solid #f7efe2;
    border-radius: 12px;
    padding: 8px 16px;
    box-shadow:
      inset 0 0 0 2px #1b1822,
      inset 0 0 0 3.2px rgba(251, 211, 107, 0.52),
      0 6px 18px rgba(14, 10, 18, 0.72);
    color: #fffdf9;
  }

  .af-room-phrase-lbl {
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-size: 1.42rem;
    font-style: italic;
    font-weight: 600;
    color: #fffdf9;
    white-space: nowrap;
  }

  .af-copy-btn {
    position: relative;
    appearance: none;
    border: 1.5px solid #fbd36b;
    background: #282332;
    color: #fffdf9;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .af-copy-btn .af-icon-svg {
    position: absolute;
    width: 20px;
    height: 20px;
    transition-property: transform, opacity;
    transition-duration: 240ms;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
  }

  .af-copy-btn .af-check-svg {
    opacity: 0;
    transform: scale(0.4);
    color: var(--hud-accent);
  }

  .af-copy-btn.is-copied .af-copy-svg {
    opacity: 0;
    transform: scale(0.4);
  }

  .af-copy-btn.is-copied .af-check-svg {
    opacity: 1;
    transform: scale(1);
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

    <!-- 1. TITLE SCENE (FLOW_STEPS.TITLE) -->
    <section class="af-scene af-scene-title" data-flow-scene="title" aria-label="Title Screen">
      <div class="af-title-stack">
        ${SVG_OPEN_AIR_DIVIDER}
        <h1 class="af-main-title">Amarante</h1>
        ${SVG_AMARANTE_SWASH_FLOURISH}
        <p class="af-subtitle">The Unfading Bloom</p>
        <div class="af-credits-block">
          <span>Developed by Argon &amp; Sol</span>
          <span class="af-credit-dot" aria-hidden="true">·</span>
          <span>Directed by Vikas</span>
          <span class="af-credit-dot" aria-hidden="true">·</span>
          <span>For Ishika</span>
        </div>
        <button type="button" class="af-hairline-pill-btn af-enter-btn" id="app-flow-enter-btn" data-flow-action="enter">
          ${SVG_BOTANICAL_SPRIG_LEFT}
          <span>Step into the Domain</span>
          ${SVG_BOTANICAL_SPRIG_RIGHT}
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

    <!-- 3. OPEN OR JOIN DOMAIN SCENE (FLOW_STEPS.CREATE_JOIN) -->
    <section class="af-scene af-scene-create-join" data-flow-scene="create_join" aria-label="Open or Join a Domain">
      <div class="af-create-join-header-stack">
        ${SVG_OPEN_AIR_DIVIDER}
        <h2 class="af-create-join-header">Open or Join Domain</h2>
      </div>

      <div class="af-tablets-grid">
        <!-- Left Frame: Open a Domain -->
        <div class="af-hairline-frame af-world-tablet" id="app-flow-create-tablet">
          <span class="af-tablet-top-emblem">${SVG_TOP_EMBLEM_SPRIG}</span>
          <span class="af-side-diamond is-left" aria-hidden="true"></span>
          <span class="af-side-diamond is-right" aria-hidden="true"></span>

          <div class="af-tablet-top-block">
            <h3 class="af-tablet-heading">Open a Domain</h3>
            ${SVG_CARD_THIN_DIVIDER}
            <p class="af-active-phrase-display" id="app-flow-active-phrase" title="Click to cycle domain poetry">${state.roomPhrase}</p>
            <div class="af-phrase-chips-wrap" id="app-flow-phrase-chips">
              ${phraseChipsHtml}
            </div>
          </div>
          <button type="button" class="af-hairline-pill-btn af-domain-action-btn" id="app-flow-create-btn" data-flow-action="create">
            Enter
          </button>
        </div>

        <!-- Right Frame: Join a Domain -->
        <div class="af-hairline-frame af-world-tablet" id="app-flow-join-tablet">
          <span class="af-tablet-top-emblem">${SVG_TOP_EMBLEM_TRAVELERS}</span>
          <span class="af-side-diamond is-left" aria-hidden="true"></span>
          <span class="af-side-diamond is-right" aria-hidden="true"></span>

          <div class="af-tablet-top-block">
            <h3 class="af-tablet-heading">Join a Domain</h3>
            ${SVG_CARD_THIN_DIVIDER}
            <div class="af-field-group">
              <label class="af-field-label sr-only" for="app-flow-phrase-input">Domain phrase</label>
              <input
                type="text"
                id="app-flow-phrase-input"
                class="af-phrase-input"
                name="worldPhrase"
                autocomplete="off"
                spellcheck="false"
                placeholder="Rain on warm limestone"
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

        <!-- Floating Open-Air Italic Callout with Underline + Angled Helmet Pointer -->
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

      <!-- Bottom-Center Borderless Transparent Phrase Line + Copy Icon -->
      <div class="af-lobby-bottom-row">
        <div class="af-lobby-room-bar" id="app-flow-lobby-top-bar">
          <span class="af-room-phrase-lbl" id="app-flow-lobby-phrase">
            <span id="app-flow-room-phrase">${state.roomPhrase}</span>
          </span>
          <button
            type="button"
            class="af-copy-btn"
            id="app-flow-copy-btn"
            aria-label="Copy Domain Invite Link"
            title="Copy Domain Invite Link"
          >
            ${SVG_COPY_ICON}
            ${SVG_CHECK_ICON}
          </button>
        </div>
      </div>
    </section>
  `;

  const mountTarget = container || document.getElementById('hud') || document.body;
  mountTarget.appendChild(root);

  // Cache DOM references
  const pixelVeil = root.querySelector('#af-pixel-veil');
  const pixelCanvas = root.querySelector('#af-pixel-veil-canvas');
  const enterBtn = root.querySelector('#app-flow-enter-btn');
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

  const roomPhraseEl = root.querySelector('#app-flow-room-phrase');
  const copyBtn = root.querySelector('#app-flow-copy-btn');

  if (phraseInput) {
    phraseInput.value = roomFromUrl || state.roomPhrase || 'Rain on warm limestone';
  }

  let loadingTimer = null;
  let copyTimer = null;
  let mosaicRafId = null;

  function stopMosaicLoop() {
    if (mosaicRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(mosaicRafId);
      mosaicRafId = null;
    }
  }

  function resolvePixelVeil() {
    stopMosaicLoop();
    pixelVeil?.classList.add('is-resolved');
  }

  /**
   * Real 36px -> 1px Pixel-to-Clear Mosaic Canvas over 2.2s (Zero CSS blur).
   */
  function triggerPixelVeilMaterialization(immediate = false) {
    if (!pixelVeil) return;
    stopMosaicLoop();

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (
      immediate ||
      reduceMotion ||
      (typeof navigator !== 'undefined' && navigator.webdriver)
    ) {
      pixelVeil.classList.add('is-resolved');
      return;
    }

    pixelVeil.classList.remove('is-resolved');
    const worldCanvas = document.getElementById('world-canvas');
    const ctx = pixelCanvas?.getContext?.('2d');
    if (!worldCanvas || !ctx) {
      setTimeout(() => pixelVeil.classList.add('is-resolved'), 150);
      return;
    }

    const startTime =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const durationMs = 2200;

    const stepMosaic = (now) => {
      const t = Math.min(1, Math.max(0, (now - startTime) / durationMs));
      // cubic-bezier(0.22, 1, 0.36, 1) approximation: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - t, 3);
      const blockSize = Math.max(1, Math.round(36 - 35 * eased));

      const vw = Math.max(1, window.innerWidth || 1280);
      const vh = Math.max(1, window.innerHeight || 720);
      const lowW = Math.max(16, Math.floor(vw / blockSize));
      const lowH = Math.max(9, Math.floor(vh / blockSize));

      if (pixelCanvas.width !== lowW || pixelCanvas.height !== lowH) {
        pixelCanvas.width = lowW;
        pixelCanvas.height = lowH;
      }
      ctx.imageSmoothingEnabled = false;
      try {
        ctx.drawImage(worldCanvas, 0, 0, lowW, lowH);
      } catch {
        // Fallback if WebGL buffer is not yet populated
      }

      if (t < 1 && blockSize > 1) {
        mosaicRafId = requestAnimationFrame(stepMosaic);
      } else {
        mosaicRafId = null;
        pixelVeil.classList.add('is-resolved');
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
  function triggerEnterValleyFromLobby() {
    if (nameInput && nameInput.value.trim()) {
      state.playerName = nameInput.value.trim();
    }
    state.localClaimed = true;
    state.guestReady = true;
    renderLobbyDom();

    if (typeof onToggleReady === 'function') {
      onToggleReady(true, { ...state });
    }

    const isSoloMode = !state.peerConnected && (state.playerCount || 1) <= 1;
    const bothSeatsReady =
      state.peerConnected && Boolean(state.partnerClaimed || state.guestReady);

    if (isSoloMode || bothSeatsReady || state.isHost) {
      setStep(FLOW_STEPS.IN_GAME);
      if (typeof onStartGame === 'function') {
        onStartGame({ ...state });
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
        triggerEnterValleyFromLobby();
      }
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerEnterValleyFromLobby();
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

  return {
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
}
