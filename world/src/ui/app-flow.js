// ============================================================================
// world/src/ui/app-flow.js
//
// Amarante ("The Unfading Bloom") - Transparent Open-Air Linework & 3D Flower Lobby Flow:
//   1. `title`        - 36px -> 1px mosaic canvas resolve (2.2s), Amarante title & Step into the Domain
//   2. `create_join`  - Two open-air 1.5px hairline frames (Open a Domain / Join a Domain)
//   3. `flower_lobby` - Direct 3D Hero Claim in the Flower Field (0, 128) + shoulder hairline input
//   4. `in_game`      - Transitions camera behind hero & activates Genshin-style see-through HUD
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
/* Minimal Single-Stroke Geometric Linework SVGs (Zero Ivy Clutter)          */
/* ------------------------------------------------------------------------- */

const SVG_OPEN_AIR_DIVIDER = `
<svg class="af-sakura-divider-svg" viewBox="0 0 240 28" fill="none" aria-hidden="true">
  <line x1="18" y1="14" x2="98" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.78"/>
  <circle cx="102" cy="14" r="1.8" fill="currentColor" opacity="0.85"/>
  <g transform="translate(120, 14)">
    <path d="M0 -2 C-4.2 -10.5, 4.2 -10.5, 0 -2 Z" stroke="currentColor" stroke-width="1.25" fill="none" transform="rotate(0)"/>
    <path d="M0 -2 C-4.2 -10.5, 4.2 -10.5, 0 -2 Z" stroke="currentColor" stroke-width="1.25" fill="none" transform="rotate(72)"/>
    <path d="M0 -2 C-4.2 -10.5, 4.2 -10.5, 0 -2 Z" stroke="currentColor" stroke-width="1.25" fill="none" transform="rotate(144)"/>
    <path d="M0 -2 C-4.2 -10.5, 4.2 -10.5, 0 -2 Z" stroke="currentColor" stroke-width="1.25" fill="none" transform="rotate(216)"/>
    <path d="M0 -2 C-4.2 -10.5, 4.2 -10.5, 0 -2 Z" stroke="currentColor" stroke-width="1.25" fill="none" transform="rotate(288)"/>
    <circle cx="0" cy="0" r="2.0" stroke="currentColor" stroke-width="1.2"/>
  </g>
  <circle cx="138" cy="14" r="1.8" fill="currentColor" opacity="0.85"/>
  <line x1="142" y1="14" x2="222" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.78"/>
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
  <path d="M4.5 10 H15.5 M11 5.5 L15.5 10 L11 14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const SVG_COPY_ICON = `
<svg class="af-icon-svg af-copy-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="8" y="7" width="11" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/>
  <path d="M15 7V5C15 3.89543 14.1046 3 13 3H6C4.89543 3 4 3.89543 4 5V15C4 16.1046 4.89543 17 6 17H8" stroke="currentColor" stroke-width="1.6"/>
</svg>
`;

const SVG_CHECK_ICON = `
<svg class="af-icon-svg af-check-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

/* ------------------------------------------------------------------------- */
/* Environment-Adaptive Transparent Open-Air Linework CSS (Zero Blur)        */
/* ------------------------------------------------------------------------- */

const APP_FLOW_CSS = `
  :root,
  [data-env-polarity="day"] {
    --hud-ink: #fffdf9;
    --hud-ink-muted: #f3ebe1;
    --hud-ring-border: rgba(255, 253, 249, 0.78);
    --hud-ring-inner: rgba(255, 253, 249, 0.34);
    --hud-ring-fill: rgba(20, 14, 22, 0.14);
    --hud-shadow: rgba(34, 16, 24, 0.82);
    --hud-accent: #fbd36b;
    --ui-ink: var(--hud-ink);
    --ui-ink-muted: var(--hud-ink-muted);
    --ui-hairline: var(--hud-ring-border);
    --ui-hairline-inner: var(--hud-ring-inner);
    --ui-wash: var(--hud-ring-fill);
    --ui-contour: 0 1px 2px var(--hud-shadow), 0 0 10px rgba(34, 16, 24, 0.45);
    --ui-accent: var(--hud-accent);
  }

  [data-env-polarity="golden"] {
    --hud-ink: #ffeed6;
    --hud-ink-muted: #f7d6b5;
    --hud-ring-border: rgba(255, 238, 214, 0.80);
    --hud-ring-inner: rgba(255, 214, 170, 0.36);
    --hud-ring-fill: rgba(32, 14, 24, 0.15);
    --hud-shadow: rgba(44, 18, 32, 0.85);
    --hud-accent: #fb923c;
  }

  [data-env-polarity="night"] {
    --hud-ink: #eef4ff;
    --hud-ink-muted: #cbd8f6;
    --hud-ring-border: rgba(238, 244, 255, 0.76);
    --hud-ring-inner: rgba(186, 208, 255, 0.32);
    --hud-ring-fill: rgba(14, 18, 38, 0.16);
    --hud-shadow: rgba(12, 16, 36, 0.88);
    --hud-accent: #7dd3fc;
  }

  [data-env-polarity="eclipse"] {
    --hud-ink: #ffe8ee;
    --hud-ink-muted: #f9becf;
    --hud-ring-border: rgba(255, 232, 238, 0.82);
    --hud-ring-inner: rgba(225, 29, 72, 0.48);
    --hud-ring-fill: rgba(32, 8, 18, 0.16);
    --hud-shadow: rgba(28, 6, 14, 0.90);
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
    font-family: "Cormorant Garamond", Georgia, "Palatino Linotype", Palatino, serif;
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
  /* Open-Air 1.5px Double-Hairline Frames & See-Through Pill Buttons        */
  /* ----------------------------------------------------------------------- */
  .af-hairline-frame {
    position: relative;
    pointer-events: auto;
    background: rgba(20, 14, 22, 0.14);
    border: 1.5px solid var(--hud-ring-border);
    border-radius: 16px;
    box-shadow:
      inset 0 0 0 3px transparent,
      inset 0 0 0 4px var(--hud-ring-inner);
    color: var(--hud-ink);
    filter: drop-shadow(0 2px 8px var(--hud-shadow));
  }

  .af-hairline-pill-btn {
    position: relative;
    appearance: none;
    pointer-events: auto;
    cursor: pointer;
    border-radius: 999px;
    border: 1.5px solid var(--hud-ring-border);
    background: var(--hud-ring-fill);
    box-shadow:
      inset 0 0 0 3px transparent,
      inset 0 0 0 4px var(--hud-ring-inner);
    color: var(--hud-ink);
    font-family: inherit;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-shadow: 0 1px 3px var(--hud-shadow);
    filter: drop-shadow(0 2px 6px var(--hud-shadow));
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
    .af-hairline-pill-btn:not(:disabled):hover,
    .af-phrase-chip:hover,
    .af-copy-btn:hover,
    .af-name-submit-btn:hover {
      border-color: var(--hud-ink);
      background-color: rgba(255, 253, 249, 0.18);
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
  /* Screen 1: Title Screen (FLOW_STEPS.TITLE)                               */
  /* ----------------------------------------------------------------------- */
  .af-scene-title {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: min(10vh, 84px);
  }

  .af-title-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 720px;
  }

  .af-sakura-divider-svg {
    width: 220px;
    height: 28px;
    color: var(--hud-ink);
    filter: drop-shadow(0 1px 4px var(--hud-shadow));
    margin-bottom: 2px;
  }

  .af-main-title {
    font-family: "Cormorant Garamond", Georgia, "Palatino Linotype", serif;
    font-size: clamp(3.5rem, 7.2vw, 5.5rem);
    font-weight: 600;
    line-height: 1.08;
    letter-spacing: 0.02em;
    color: var(--hud-ink);
    text-shadow:
      0 1px 2px var(--hud-shadow),
      0 4px 18px var(--hud-shadow);
    margin: 0 0 4px 0;
  }

  .af-subtitle {
    font-size: clamp(1.08rem, 1.75vw, 1.35rem);
    font-style: italic;
    font-weight: 500;
    line-height: 1.25;
    letter-spacing: 0.06em;
    color: var(--hud-ink-muted);
    text-shadow: 0 1px 4px var(--hud-shadow);
    margin: 0 0 12px 0;
  }

  .af-credits-block {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--hud-ink-muted);
    font-size: clamp(0.92rem, 1.3vw, 1.06rem);
    font-weight: 500;
    line-height: 1.4;
    padding: 4px 8px;
    background: transparent;
    border: none;
    text-shadow: 0 1px 4px var(--hud-shadow);
    margin-bottom: 26px;
  }

  .af-credit-dot {
    opacity: 0.72;
    color: var(--hud-accent);
  }

  .af-enter-btn {
    min-width: 264px;
    min-height: 54px;
    padding: 11px 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 1.24rem;
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
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--hud-ink);
    line-height: 1.2;
    text-shadow: 0 1px 4px var(--hud-shadow);
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
    background: var(--hud-ink);
    transition: width 180ms ease-out;
  }

  /* ----------------------------------------------------------------------- */
  /* Screen 2: Open or Join Domain (FLOW_STEPS.CREATE_JOIN)                  */
  /* ----------------------------------------------------------------------- */
  .af-scene-create-join {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }

  .af-tablets-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(280px, 350px));
    gap: 28px;
    align-items: stretch;
    max-width: 94vw;
  }

  @media (max-width: 640px) {
    .af-tablets-grid {
      grid-template-columns: minmax(260px, 340px);
      gap: 16px;
    }
  }

  .af-world-tablet {
    padding: 24px 26px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    text-align: start;
    min-height: 236px;
    gap: 16px;
  }

  .af-tablet-heading {
    font-size: 1.45rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--hud-ink);
    text-shadow: 0 1px 3px var(--hud-shadow);
    margin: 0 0 8px 0;
  }

  .af-active-phrase-display {
    font-size: 1.125rem;
    font-style: italic;
    font-weight: 600;
    line-height: 1.35;
    color: var(--hud-ink);
    text-shadow: 0 1px 3px var(--hud-shadow);
    margin: 0 0 12px 0;
  }

  .af-phrase-chips-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .af-phrase-chip {
    appearance: none;
    cursor: pointer;
    padding: 4px 11px;
    border-radius: 999px;
    border: 1px solid var(--hud-ring-inner);
    background: rgba(20, 14, 22, 0.12);
    color: var(--hud-ink-muted);
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: 500;
    text-shadow: 0 1px 2px var(--hud-shadow);
    transition: border-color 140ms ease-out, background-color 140ms ease-out, color 140ms ease-out;
  }

  .af-phrase-chip.is-active {
    border-color: var(--hud-ring-border);
    background: rgba(255, 253, 249, 0.16);
    color: var(--hud-ink);
  }

  .af-field-group {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    text-align: start;
  }

  .af-field-label {
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--hud-ink-muted);
    text-shadow: 0 1px 2px var(--hud-shadow);
  }

  .af-phrase-input,
  .af-name-input {
    width: 100%;
    height: 40px;
    padding: 6px 4px;
    border: none;
    border-bottom: 1.5px solid var(--hud-ring-border);
    border-radius: 0;
    background: transparent;
    font-family: inherit;
    font-size: 1rem; /* 16px prevents mobile WebView auto-zoom */
    font-weight: 600;
    color: var(--hud-ink);
    text-shadow: 0 1px 2px var(--hud-shadow);
    transition: border-color 150ms ease-out;
  }

  .af-phrase-input:focus,
  .af-name-input:focus {
    border-bottom-color: var(--hud-accent);
    outline: none;
  }

  .af-phrase-input::placeholder,
  .af-name-input::placeholder {
    color: var(--hud-ink-muted);
    opacity: 0.68;
  }

  .af-domain-action-btn {
    width: 100%;
    min-height: 44px;
    padding: 8px 22px;
    font-size: 1.1rem;
  }

  .af-error-banner {
    pointer-events: auto;
    display: none;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-radius: 999px;
    background: rgba(36, 8, 18, 0.24);
    border: 1.5px solid #f43f5e;
    color: var(--hud-ink);
    font-size: 0.92rem;
    font-weight: 600;
    text-shadow: 0 1px 3px var(--hud-shadow);
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

  /* Transparent 3D-Projected Hero Hit Targets */
  .af-hero-hit-target {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    appearance: none;
    cursor: pointer;
    min-width: 148px;
    min-height: 220px;
    padding: 0;
    border-radius: 22px;
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
    border-color: var(--hud-ring-inner);
  }

  .af-hero-hit-target.is-claimed .af-hero-ring-badge {
    border-color: var(--hud-accent);
  }

  .af-hero-hit-target.is-partner-claimed .af-hero-ring-badge {
    display: none;
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
    top: -18px;
    transform: translate(-50%, -100%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 13px 5px 9px;
    border-radius: 999px;
    background: rgba(20, 14, 22, 0.16);
    border: 1.5px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 2px transparent,
      inset 0 0 0 3px var(--hud-ring-inner);
    filter: drop-shadow(0 2px 6px var(--hud-shadow));
    text-shadow: 0 1px 3px var(--hud-shadow);
    white-space: nowrap;
  }

  .af-role-mini-svg {
    width: 20px;
    height: 20px;
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
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--hud-ink);
  }

  .af-crest-hint {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--hud-ink-muted);
  }

  /* Floating Partner Name Badge above the other hero */
  #app-flow-partner-tag {
    position: absolute;
    left: 64%;
    top: 19%;
    transform: translate(-50%, -100%);
    pointer-events: none;
    padding: 5px 14px;
    border-radius: 999px;
    background: rgba(20, 14, 22, 0.16);
    border: 1.5px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 2px transparent,
      inset 0 0 0 3px var(--hud-ring-inner);
    color: var(--hud-ink);
    font-size: 0.9rem;
    font-weight: 600;
    text-shadow: 0 1px 4px var(--hud-shadow);
    filter: drop-shadow(0 2px 6px var(--hud-shadow));
    white-space: nowrap;
    opacity: 0;
    transition: opacity 150ms ease-out;
  }

  #app-flow-partner-tag.is-visible {
    opacity: 1;
  }

  /* Floating Transparent Hairline Callout beside the claimed hero's outer shoulder */
  #app-flow-name-bubble {
    position: absolute;
    left: 19%;
    top: 46%;
    transform: translate(-50%, -50%);
    width: min(236px, 84vw);
    padding: 12px 16px;
    border-radius: 14px;
    background: rgba(20, 14, 22, 0.16);
    border: 1.5px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 3px transparent,
      inset 0 0 0 4px var(--hud-ring-inner);
    filter: drop-shadow(0 2px 8px var(--hud-shadow));
    pointer-events: auto;
    z-index: 4;
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 150ms ease-out;
  }

  #app-flow-name-bubble[data-claimed-role="Knight"] {
    left: 19%;
    top: 46%;
  }

  #app-flow-name-bubble[data-claimed-role="Mage"] {
    left: 81%;
    top: 46%;
  }

  .af-name-callout-inner {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .af-name-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .af-name-submit-btn {
    appearance: none;
    cursor: pointer;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1.5px solid var(--hud-ring-border);
    background: var(--hud-ring-fill);
    color: var(--hud-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
    transition: transform 150ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out;
  }

  .af-submit-arrow-svg {
    width: 16px;
    height: 16px;
  }

  /* Bottom-Center Borderless Transparent Phrase Line */
  .af-lobby-bottom-row {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding-bottom: 4px;
  }

  .af-lobby-room-bar {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    background: transparent;
    border: none;
    color: var(--hud-ink);
    text-shadow: 0 1px 4px var(--hud-shadow);
  }

  .af-room-phrase-lbl {
    font-size: 1.02rem;
    font-style: italic;
    font-weight: 600;
    color: var(--hud-ink);
    white-space: nowrap;
  }

  .af-copy-btn {
    position: relative;
    appearance: none;
    border: 1.5px solid var(--hud-ring-border);
    background: var(--hud-ring-fill);
    color: var(--hud-ink);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    filter: drop-shadow(0 1px 4px var(--hud-shadow));
    -webkit-tap-highlight-color: transparent;
  }

  .af-copy-btn .af-icon-svg {
    position: absolute;
    width: 16px;
    height: 16px;
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
 * Creates the Amarante Transparent Open-Air Opening & 3D Flower Field Lobby Flow.
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
        <p class="af-subtitle">The Unfading Bloom</p>
        <div class="af-credits-block">
          <span>Developed by Argon &amp; Sol</span>
          <span class="af-credit-dot" aria-hidden="true">·</span>
          <span>Directed by Vikas</span>
          <span class="af-credit-dot" aria-hidden="true">·</span>
          <span>For Ishika</span>
        </div>
        <button type="button" class="af-hairline-pill-btn af-enter-btn" id="app-flow-enter-btn" data-flow-action="enter">
          <span>Step into the Domain</span>
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
      <div class="af-tablets-grid">
        <!-- Left Frame: Open a Domain -->
        <div class="af-hairline-frame af-world-tablet" id="app-flow-create-tablet">
          <div style="width: 100%;">
            <h3 class="af-tablet-heading">Open a Domain</h3>
            <p class="af-active-phrase-display" id="app-flow-active-phrase">${state.roomPhrase}</p>
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
          <div style="width: 100%;">
            <h3 class="af-tablet-heading">Join a Domain</h3>
            <div class="af-field-group">
              <label class="af-field-label" for="app-flow-phrase-input">Domain phrase</label>
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

        <!-- Floating Partner Name Badge above the other hero -->
        <div id="app-flow-partner-tag" aria-live="polite"></div>

        <!-- Floating Transparent Hairline Callout beside the claimed hero's shoulder -->
        <div
          id="app-flow-name-bubble"
          data-claimed-role="Knight"
          role="group"
          aria-label="Character Claim and Name Entry"
        >
          <div class="af-name-callout-inner" id="app-flow-claim-bubble" data-claimed-role="Knight">
            <label class="af-field-label" for="app-flow-name-input" id="app-flow-bubble-role-title">Your name</label>
            <div class="af-name-input-row">
              <input
                type="text"
                id="app-flow-name-input"
                class="af-name-input"
                name="playerName"
                maxlength="24"
                autocomplete="off"
                spellcheck="false"
                placeholder="Type your name"
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
        const halfH = (claimKnightBtn.offsetHeight || 220) * 0.5;
        const dyFromTop = kPos.headY - (kPos.y - halfH) - 18;
        claimKnightBadge.style.top = `${Math.min(-14, dyFromTop).toFixed(1)}px`;
      }
    }
    if (mPos && claimMageBtn) {
      claimMageBtn.style.left = `${mPos.x.toFixed(1)}px`;
      claimMageBtn.style.top = `${mPos.y.toFixed(1)}px`;
      if (claimMageBadge && typeof mPos.headY === 'number') {
        const halfH = (claimMageBtn.offsetHeight || 220) * 0.5;
        const dyFromTop = mPos.headY - (mPos.y - halfH) - 18;
        claimMageBadge.style.top = `${Math.min(-14, dyFromTop).toFixed(1)}px`;
      }
    }

    const activePos = claimedRole === 'Mage' ? mPos : kPos;
    if (activePos && nameBubble) {
      const shoulderOffsetX = claimedRole === 'Mage' ? 276 : -276;
      const vw = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight || 720 : 720;
      const clampedX = Math.max(142, Math.min(vw - 142, activePos.x + shoulderOffsetX));
      const clampedY = Math.max(100, Math.min(vh - 100, activePos.y - 24));
      nameBubble.style.left = `${clampedX.toFixed(1)}px`;
      nameBubble.style.top = `${clampedY.toFixed(1)}px`;
    } else if (nameBubble) {
      nameBubble.style.left = '';
      nameBubble.style.top = '';
    }

    const otherPos = claimedRole === 'Mage' ? kPos : mPos;
    if (otherPos && partnerTagEl) {
      const anchorX = typeof otherPos.headX === 'number' ? otherPos.headX : otherPos.x;
      const anchorY =
        typeof otherPos.headY === 'number' ? otherPos.headY - 22 : otherPos.y - 210;
      partnerTagEl.style.left = `${anchorX.toFixed(1)}px`;
      partnerTagEl.style.top = `${Math.max(48, anchorY).toFixed(1)}px`;
    } else if (partnerTagEl) {
      partnerTagEl.style.left = claimedRole === 'Mage' ? '34%' : '64%';
      partnerTagEl.style.top = '20%';
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
      partnerTagEl.textContent = pName ? `${pName} · ${otherRole}` : `${otherRole}`;
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

  // Poetic phrase chips in Open a Domain frame
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
