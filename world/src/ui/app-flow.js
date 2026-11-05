// ============================================================================
// world/src/ui/app-flow.js
//
// Wave 4 — 5-Scene Opening & Southern Flower Field Lobby Flow:
//   1. `title`        (01-title.png)        — Haru-machi title, credits & Enter
//   2. `loading`      (02-loading.png)      — "Preparing the valley" stone bar
//   3. `create_join`  (03-create-join.png)  — "Meet in the valley" Create / Join tablets
//   4. `flower_lobby` (04-flower-lobby.png) — Southern Flower Field (0, 128) Lobby
//   5. `in_game`      (05-start-together.png) — Transitions camera behind hero & starts HUD
//
// Self-contained CSS + DOM injection so `world/src/main.js` can mount cleanly.
// ============================================================================

export const FLOW_STEPS = Object.freeze({
  TITLE: 'title',
  LOADING: 'loading',
  CREATE_JOIN: 'create_join',
  FLOWER_LOBBY: 'flower_lobby',
  IN_GAME: 'in_game',
});

export const ROMANTIC_ROOM_PHRASES = Object.freeze([
  'Love is curiosity',
  'Wisteria in the morning',
  'Two lanterns by the pier',
  'Sunlit petals on water',
  'Promises under the arch',
  'Quiet steps through clover',
]);

/**
 * Generates or selects a human-memorable romantic room phrase.
 * Defaults to "Love is curiosity" on seed 0 so screenshots and default rooms match `03-create-join.png`.
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
 * or `navigator.webdriver` is active — UNLESS `?flow=1` is present in the URL query string.
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
    // 04-flower-lobby.png: Eye-level in the wildflowers looking at Knight & Mage standing together
    // with the winding country road and Tudor village framed in the background valley.
    return {
      mode: 'lobby',
      pos: [0.2, lobbyGroundY + 1.65, 134.2],
      target: [0.0, lobbyGroundY + 1.25, 125.0],
      fov: 46,
      knightLobbyPos: { x: -0.95, y: lobbyGroundY, z: 128.2, yaw: 0.18, emote: 'wave' },
      mageLobbyPos: { x: 0.95, y: lobbyGroundY, z: 128.0, yaw: -0.22, emote: 'cheer' },
    };
  }

  if (step === FLOW_STEPS.LOADING) {
    // 02-loading.png: Low meadow wildflower level looking north toward the hillside arch
    return {
      mode: 'vista',
      pos: [-1.4, lobbyGroundY + 0.95, 132.5],
      target: [0.0, lobbyGroundY + 3.2, 30.0],
      fov: 48,
    };
  }

  // 01-title.png & 03-create-join.png: Scenic Southern Flower Field vista looking down the winding path to town
  return {
    mode: 'vista',
    pos: [0.0, lobbyGroundY + 2.35, 136.5],
    target: [0.0, lobbyGroundY + 2.8, 24.0],
    fov: 50,
  };
}

/* ------------------------------------------------------------------------- */
/* Botanical & Heraldic Inline SVG Artwork                                   */
/* ------------------------------------------------------------------------- */

const SVG_SAKURA_HEADER_DIVIDER = `
<svg class="af-sakura-divider-svg" viewBox="0 0 260 44" fill="none" aria-hidden="true">
  <line x1="12" y1="22" x2="96" y2="22" stroke="#fdfaf2" stroke-width="1.75" stroke-linecap="round" opacity="0.88"/>
  <circle cx="96" cy="22" r="2.2" fill="#fdfaf2" opacity="0.9"/>
  <line x1="164" y1="22" x2="248" y2="22" stroke="#fdfaf2" stroke-width="1.75" stroke-linecap="round" opacity="0.88"/>
  <circle cx="164" cy="22" r="2.2" fill="#fdfaf2" opacity="0.9"/>
  <!-- Left & right leaves -->
  <path d="M114 25 C104 20, 102 28, 111 30 C115 31, 118 28, 114 25 Z" fill="#4f8a36" stroke="#2f5c1e" stroke-width="1.1"/>
  <path d="M146 25 C156 20, 158 28, 149 30 C145 31, 142 28, 146 25 Z" fill="#5b9940" stroke="#2f5c1e" stroke-width="1.1"/>
  <!-- 5-Petal Pink Blossom -->
  <g transform="translate(130, 22)">
    <path d="M0 -3 C-6 -14, 6 -14, 0 -3 Z" fill="#ff9ebb" stroke="#d86c8c" stroke-width="1"/>
    <path d="M0 -3 C-5 -16, 5 -16, 0 -3 Z" fill="#ffb3c9" transform="rotate(0)"/>
    <path d="M0 -2 C-7 -15, 7 -15, 0 -2 Z" fill="#ffa8c2" stroke="#d96b8b" stroke-width="0.9" transform="rotate(0)"/>
    <path d="M0 -2 C-7 -15, 7 -15, 0 -2 Z" fill="#ffb5cb" stroke="#d96b8b" stroke-width="0.9" transform="rotate(72)"/>
    <path d="M0 -2 C-7 -15, 7 -15, 0 -2 Z" fill="#ffa8c2" stroke="#d96b8b" stroke-width="0.9" transform="rotate(144)"/>
    <path d="M0 -2 C-7 -15, 7 -15, 0 -2 Z" fill="#ffb5cb" stroke="#d96b8b" stroke-width="0.9" transform="rotate(216)"/>
    <path d="M0 -2 C-7 -15, 7 -15, 0 -2 Z" fill="#ffa8c2" stroke="#d96b8b" stroke-width="0.9" transform="rotate(288)"/>
    <circle cx="0" cy="0" r="3.6" fill="#f7b93e" stroke="#c97d16" stroke-width="0.9"/>
  </g>
</svg>
`;

const SVG_CARVED_ROSETTE = `
<svg class="af-carved-rosette" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <g transform="translate(16, 16)">
    <path d="M0 -2 C-4.5 -11, 4.5 -11, 0 -2 Z" fill="#8c6d4e"/>
    <path d="M0 -2 C-4.5 -11, 4.5 -11, 0 -2 Z" fill="#8c6d4e" transform="rotate(72)"/>
    <path d="M0 -2 C-4.5 -11, 4.5 -11, 0 -2 Z" fill="#8c6d4e" transform="rotate(144)"/>
    <path d="M0 -2 C-4.5 -11, 4.5 -11, 0 -2 Z" fill="#8c6d4e" transform="rotate(216)"/>
    <path d="M0 -2 C-4.5 -11, 4.5 -11, 0 -2 Z" fill="#8c6d4e" transform="rotate(288)"/>
    <circle cx="0" cy="0" r="2.3" fill="#b8936b"/>
  </g>
</svg>
`;

const SVG_IVY_CLUSTER_LEFT = `
<svg class="af-ivy-cluster af-ivy-left" viewBox="0 0 64 72" fill="none" aria-hidden="true">
  <path d="M16 8 C8 22, 8 46, 20 64" stroke="#355e24" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M18 14 C6 12, 4 24, 15 26 C21 27, 23 18, 18 14 Z" fill="#4f8736" stroke="#284a1a" stroke-width="1.1"/>
  <path d="M12 32 C1 30, 0 42, 11 44 C17 45, 19 36, 12 32 Z" fill="#639e46" stroke="#284a1a" stroke-width="1.1"/>
  <path d="M20 50 C9 52, 10 64, 21 63 C27 62, 27 52, 20 50 Z" fill="#4f8736" stroke="#284a1a" stroke-width="1.1"/>
  <path d="M26 24 C34 18, 38 27, 29 31 C24 33, 22 27, 26 24 Z" fill="#6ca84f" stroke="#284a1a" stroke-width="1"/>
  <!-- White 5-petal blossom -->
  <g transform="translate(18, 40) scale(0.95)">
    <circle cx="0" cy="-7" r="4.2" fill="#fffdf8" stroke="#d8cfc0" stroke-width="0.9"/>
    <circle cx="6.6" cy="-2.1" r="4.2" fill="#fffdf8" stroke="#d8cfc0" stroke-width="0.9"/>
    <circle cx="4.1" cy="5.6" r="4.2" fill="#fffdf8" stroke="#d8cfc0" stroke-width="0.9"/>
    <circle cx="-4.1" cy="5.6" r="4.2" fill="#fffdf8" stroke="#d8cfc0" stroke-width="0.9"/>
    <circle cx="-6.6" cy="-2.1" r="4.2" fill="#fffdf8" stroke="#d8cfc0" stroke-width="0.9"/>
    <circle cx="0" cy="0" r="3.2" fill="#f3b63a" stroke="#b87914" stroke-width="0.8"/>
  </g>
</svg>
`;

const SVG_IVY_CLUSTER_RIGHT = `
<svg class="af-ivy-cluster af-ivy-right" viewBox="0 0 64 72" fill="none" aria-hidden="true">
  <g transform="translate(64, 0) scale(-1, 1)">
    <path d="M16 8 C8 22, 8 46, 20 64" stroke="#355e24" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M18 14 C6 12, 4 24, 15 26 C21 27, 23 18, 18 14 Z" fill="#4f8736" stroke="#284a1a" stroke-width="1.1"/>
    <path d="M12 32 C1 30, 0 42, 11 44 C17 45, 19 36, 12 32 Z" fill="#639e46" stroke="#284a1a" stroke-width="1.1"/>
    <path d="M20 50 C9 52, 10 64, 21 63 C27 62, 27 52, 20 50 Z" fill="#4f8736" stroke="#284a1a" stroke-width="1.1"/>
    <path d="M26 24 C34 18, 38 27, 29 31 C24 33, 22 27, 26 24 Z" fill="#6ca84f" stroke="#284a1a" stroke-width="1"/>
    <g transform="translate(18, 40) scale(0.95)">
      <circle cx="0" cy="-7" r="4.2" fill="#fffdf8" stroke="#d8cfc0" stroke-width="0.9"/>
      <circle cx="6.6" cy="-2.1" r="4.2" fill="#fffdf8" stroke="#d8cfc0" stroke-width="0.9"/>
      <circle cx="4.1" cy="5.6" r="4.2" fill="#fffdf8" stroke="#d8cfc0" stroke-width="0.9"/>
      <circle cx="-4.1" cy="5.6" r="4.2" fill="#fffdf8" stroke="#d8cfc0" stroke-width="0.9"/>
      <circle cx="-6.6" cy="-2.1" r="4.2" fill="#fffdf8" stroke="#d8cfc0" stroke-width="0.9"/>
      <circle cx="0" cy="0" r="3.2" fill="#f3b63a" stroke="#b87914" stroke-width="0.8"/>
    </g>
  </g>
</svg>
`;

const SVG_KNIGHT_MINI_ICON = `
<svg class="af-role-mini-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <circle cx="18" cy="18" r="15" fill="#e6dcc8" stroke="#7d6449" stroke-width="1.6"/>
  <!-- Chiseled Iron Knight Close-Helm -->
  <path d="M10 17 C10 10.5, 26 10.5, 26 17 L27 25 C27 27, 22 29, 18 29 C14 29, 9 27, 9 25 Z" fill="#9aa4b2" stroke="#333b48" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M18 9 L18 29" stroke="#647080" stroke-width="1.3"/>
  <rect x="12" y="16.5" width="12" height="3.2" rx="1.2" fill="#1e242d"/>
  <path d="M11 22 L18 25.5 L25 22" stroke="#475261" stroke-width="1.4" stroke-linecap="round"/>
</svg>
`;

const SVG_MAGE_MINI_ICON = `
<svg class="af-role-mini-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <circle cx="18" cy="18" r="15" fill="#e6dcc8" stroke="#7d6449" stroke-width="1.6"/>
  <!-- Royal Violet Witch Hat with Orange-Gold Buckle -->
  <path d="M18 6 L11 22 L25 22 Z" fill="#6b49b8" stroke="#2f1c5c" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M11.5 19.5 L24.5 19.5 L25.2 22.8 L10.8 22.8 Z" fill="#e67e22" stroke="#6e3508" stroke-width="1.2"/>
  <rect x="16" y="19.2" width="4" height="3.8" rx="0.6" fill="#fbd36b" stroke="#6e3508" stroke-width="1.1"/>
  <ellipse cx="18" cy="24" rx="12.5" ry="3.6" fill="#7c56cc" stroke="#2f1c5c" stroke-width="1.6"/>
</svg>
`;

const SVG_COPY_ICON = `
<svg class="af-icon-svg af-copy-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="8" y="7" width="11" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
  <path d="M15 7V5C15 3.89543 14.1046 3 13 3H6C4.89543 3 4 3.89543 4 5V15C4 16.1046 4.89543 17 6 17H8" stroke="currentColor" stroke-width="2"/>
</svg>
`;

const SVG_CHECK_ICON = `
<svg class="af-icon-svg af-check-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const SVG_PINK_BLOSSOM_BADGE = `
<svg class="af-pink-blossom-svg" viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <g transform="translate(14, 14)">
    <circle cx="0" cy="-6" r="4" fill="#ff9ebb" stroke="#d46586" stroke-width="0.9"/>
    <circle cx="5.7" cy="-1.8" r="4" fill="#ffb3c9" stroke="#d46586" stroke-width="0.9"/>
    <circle cx="3.5" cy="4.9" r="4" fill="#ff9ebb" stroke="#d46586" stroke-width="0.9"/>
    <circle cx="-3.5" cy="4.9" r="4" fill="#ffb3c9" stroke="#d46586" stroke-width="0.9"/>
    <circle cx="-5.7" cy="-1.8" r="4" fill="#ff9ebb" stroke="#d46586" stroke-width="0.9"/>
    <circle cx="0" cy="0" r="2.8" fill="#f5b83d" stroke="#b87611" stroke-width="0.8"/>
  </g>
</svg>
`;

/* ------------------------------------------------------------------------- */
/* Self-Contained Sculpted Stone & Botanical CSS                             */
/* ------------------------------------------------------------------------- */

const APP_FLOW_CSS = `
  #haru-app-flow-root {
    position: fixed;
    inset: 0;
    z-index: 38;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-family: Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif;
    color: #3f2e21;
    padding:
      max(18px, env(safe-area-inset-top, 0px))
      max(22px, env(safe-area-inset-right, 0px))
      max(20px, env(safe-area-inset-bottom, 0px))
      max(22px, env(safe-area-inset-left, 0px));
  }

  #haru-app-flow-root[data-step="in_game"] {
    display: none;
  }

  .af-scene {
    position: absolute;
    inset: 0;
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
  /* Shared Sculpted Limestone & Aged-Brass Surface Tokens                   */
  /* ----------------------------------------------------------------------- */
  .af-stone-slab {
    position: relative;
    pointer-events: auto;
    background:
      radial-gradient(120% 95% at 50% 12%, #f6efe2 0%, #eadec9 58%, #dac8ab 100%);
    border: 2px solid #bda685;
    border-radius: 16px;
    box-shadow:
      inset 0 2px 0 rgba(255, 253, 248, 0.88),
      inset 0 -4px 0 rgba(145, 118, 86, 0.52),
      0 10px 26px -6px rgba(28, 22, 16, 0.38),
      0 2px 6px rgba(28, 22, 16, 0.24);
    color: #463222;
  }

  .af-stone-btn {
    position: relative;
    appearance: none;
    pointer-events: auto;
    cursor: pointer;
    border: 2px solid #b59b78;
    border-radius: 16px;
    background:
      radial-gradient(110% 90% at 50% 15%, #f7f0e4 0%, #e9dec8 62%, #d7c3a3 100%);
    box-shadow:
      inset 0 2px 0 rgba(255, 253, 248, 0.92),
      inset 0 -4px 0 rgba(140, 112, 80, 0.58),
      0 10px 24px -5px rgba(26, 20, 14, 0.38),
      0 2px 5px rgba(26, 20, 14, 0.24);
    color: #4a3423;
    font-family: inherit;
    font-weight: 700;
    letter-spacing: 0.01em;
    -webkit-tap-highlight-color: transparent;
    transition-property: transform, box-shadow, background-color, opacity;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  .af-stone-btn:focus-visible,
  .af-brass-btn:focus-visible,
  .af-role-slot-btn:focus-visible,
  .af-copy-btn:focus-visible,
  .af-phrase-input:focus-visible {
    outline: 3px solid #fdfaf2;
    outline-offset: 3px;
  }

  .af-stone-btn:disabled,
  .af-brass-btn:disabled {
    opacity: 0.58;
    cursor: not-allowed;
  }

  @media (hover: hover) {
    .af-stone-btn:not(:disabled):hover,
    .af-brass-btn:not(:disabled):hover {
      box-shadow:
        inset 0 2px 0 rgba(255, 254, 250, 0.98),
        inset 0 -4px 0 rgba(132, 104, 72, 0.62),
        0 12px 28px -4px rgba(26, 20, 14, 0.44),
        0 3px 8px rgba(26, 20, 14, 0.28);
    }
    .af-role-slot-btn:hover,
    .af-copy-btn:hover {
      background-color: rgba(140, 110, 76, 0.12);
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .af-stone-btn:not(:disabled):active,
    .af-brass-btn:not(:disabled):active {
      transform: scale(0.96);
    }
  }

  .af-ivy-cluster {
    position: absolute;
    width: 48px;
    height: 54px;
    pointer-events: none;
    z-index: 2;
    filter: drop-shadow(0 2px 4px rgba(22, 18, 12, 0.28));
  }

  .af-ivy-left {
    left: -18px;
    top: 50%;
    transform: translateY(-50%);
  }

  .af-ivy-right {
    right: -18px;
    top: 50%;
    transform: translateY(-50%);
  }

  /* ----------------------------------------------------------------------- */
  /* Scene 1: Title Screen (01-title.png)                                    */
  /* ----------------------------------------------------------------------- */
  .af-scene-title {
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding-top: min(11vh, 96px);
  }

  .af-title-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 680px;
  }

  .af-sakura-divider-svg {
    width: 240px;
    height: 40px;
    filter: drop-shadow(0 2px 6px rgba(18, 38, 64, 0.28));
    margin-bottom: -4px;
  }

  .af-main-title {
    font-size: clamp(3.1rem, 6.6vw, 5.1rem);
    font-weight: 700;
    line-height: 1.06;
    letter-spacing: -0.015em;
    color: #fdfaf2;
    text-shadow:
      0 3px 0 rgba(94, 74, 52, 0.42),
      0 8px 24px rgba(17, 37, 64, 0.36);
    margin: 0 0 10px 0;
  }

  .af-credits-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    color: #fdfaf2;
    font-size: clamp(0.95rem, 1.45vw, 1.18rem);
    font-weight: 600;
    line-height: 1.35;
    text-shadow:
      0 1px 2px rgba(20, 32, 48, 0.55),
      0 4px 12px rgba(20, 32, 48, 0.32);
    margin-bottom: 24px;
  }

  .af-enter-btn {
    min-width: 214px;
    min-height: 68px;
    padding: 10px 44px 12px;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 1.45rem;
  }

  .af-enter-btn .af-carved-rosette {
    width: 18px;
    height: 18px;
    margin-bottom: -2px;
  }

  /* ----------------------------------------------------------------------- */
  /* Scene 2: Loading Screen (02-loading.png)                                */
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
    width: min(460px, 88vw);
  }

  .af-loading-title {
    font-size: clamp(1.25rem, 2.2vw, 1.65rem);
    font-weight: 700;
    color: #fdfaf2;
    line-height: 1.2;
    text-shadow:
      0 2px 4px rgba(18, 28, 16, 0.68),
      0 6px 18px rgba(18, 28, 16, 0.45);
  }

  .af-loading-stone-bar {
    position: relative;
    width: 100%;
    height: 30px;
    padding: 5px 8px 5px 22px;
    border-radius: 14px;
    display: flex;
    align-items: center;
  }

  .af-loading-blossom {
    position: absolute;
    left: -16px;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 48px;
    pointer-events: none;
  }

  .af-loading-channel {
    width: 100%;
    height: 16px;
    background: rgba(130, 108, 82, 0.32);
    border: 1.5px solid rgba(112, 90, 66, 0.48);
    border-radius: 999px;
    overflow: hidden;
    box-shadow: inset 0 2px 4px rgba(42, 30, 18, 0.35);
  }

  .af-loading-fill {
    height: 100%;
    width: 62%;
    border-radius: 999px;
    background: linear-gradient(90deg, #e58e26 0%, #f5b038 65%, #fbd064 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
    transition: width 180ms ease-out;
  }

  /* ----------------------------------------------------------------------- */
  /* Scene 3: Create / Join World (03-create-join.png)                       */
  /* ----------------------------------------------------------------------- */
  .af-scene-create-join {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
  }

  .af-meet-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .af-meet-title {
    font-size: clamp(2.2rem, 4.8vw, 3.6rem);
    font-weight: 700;
    line-height: 1.08;
    letter-spacing: -0.01em;
    color: #fdfaf2;
    text-shadow:
      0 3px 0 rgba(94, 74, 52, 0.42),
      0 8px 22px rgba(17, 37, 64, 0.36);
    margin: 0;
  }

  .af-tablets-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(260px, 336px));
    gap: clamp(18px, 3.2vw, 38px);
    align-items: stretch;
    max-width: 94vw;
  }

  @media (max-width: 640px) {
    .af-tablets-grid {
      grid-template-columns: minmax(260px, 340px);
      gap: 14px;
    }
  }

  .af-world-tablet {
    padding: 24px 26px 22px;
    border-radius: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    text-align: center;
    min-height: 238px;
  }

  .af-tablet-pediment {
    position: absolute;
    top: -15px;
    left: 50%;
    transform: translateX(-50%);
    width: 68px;
    height: 30px;
    background: linear-gradient(180deg, #f6efe2 0%, #e7d9c1 100%);
    border: 2px solid #bda685;
    border-bottom: none;
    border-radius: 18px 18px 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 2px 0 rgba(255, 253, 248, 0.9);
  }

  .af-tablet-pediment .af-carved-rosette {
    width: 22px;
    height: 22px;
    margin-top: 3px;
  }

  .af-tablet-heading {
    font-size: 1.55rem;
    font-weight: 700;
    line-height: 1.2;
    color: #3f2b1d;
    margin-top: 4px;
  }

  .af-tablet-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 76%;
    margin: 6px 0 10px;
  }

  .af-tablet-divider::before,
  .af-tablet-divider::after {
    content: "";
    flex: 1;
    height: 1.5px;
    background: rgba(140, 110, 78, 0.45);
  }

  .af-tablet-divider .af-carved-rosette {
    width: 15px;
    height: 15px;
  }

  .af-tablet-sub {
    font-size: 1.02rem;
    font-weight: 600;
    color: #5a4230;
    line-height: 1.4;
    margin-bottom: 16px;
  }

  .af-field-group {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    margin-bottom: 12px;
    text-align: start;
  }

  .af-field-label {
    font-size: 0.84rem;
    font-weight: 700;
    color: #4f3928;
    padding-inline-start: 2px;
  }

  .af-phrase-input {
    width: 100%;
    height: 40px;
    padding: 6px 12px;
    border-radius: 9px;
    border: 1.5px solid #9c8264;
    background: rgba(242, 233, 217, 0.94);
    box-shadow: inset 0 2px 4px rgba(64, 46, 28, 0.14);
    font-family: inherit;
    font-size: 1rem; /* 16px prevents iOS/Android mobile auto-zoom */
    font-weight: 600;
    color: #3b281a;
  }

  .af-phrase-input::placeholder {
    color: #8c755b;
    opacity: 0.85;
  }

  /* Brass-Framed Action Button inside Tablets (03-create-join.png) */
  .af-brass-btn {
    position: relative;
    appearance: none;
    pointer-events: auto;
    cursor: pointer;
    width: 100%;
    min-height: 50px;
    padding: 10px 20px;
    border-radius: 10px;
    border: 2.5px solid #9e7736;
    background:
      linear-gradient(180deg, #f3e8d4 0%, #e4d2b4 100%);
    box-shadow:
      inset 0 0 0 2px #d8b56c,
      inset 0 3px 0 rgba(255, 252, 244, 0.85),
      inset 0 -3px 0 rgba(138, 102, 42, 0.45),
      0 5px 12px rgba(42, 28, 14, 0.25);
    color: #3f2b1d;
    font-family: inherit;
    font-size: 1.22rem;
    font-weight: 700;
    line-height: 1.2;
    -webkit-tap-highlight-color: transparent;
    transition-property: transform, box-shadow, opacity;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  .af-error-banner {
    pointer-events: auto;
    display: none;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 12px;
    background: rgba(68, 22, 26, 0.92);
    border: 1.5px solid #e35d6a;
    color: #fff5f5;
    font-size: 0.9rem;
    font-weight: 600;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.32);
  }

  .af-error-banner.is-visible {
    display: inline-flex;
  }

  /* ----------------------------------------------------------------------- */
  /* Scene 4: Southern Flower Field Lobby (04-flower-lobby.png)              */
  /* ----------------------------------------------------------------------- */
  .af-scene-flower-lobby {
    flex-direction: column;
    justify-content: space-between;
  }

  .af-lobby-top-row {
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
    width: 100%;
  }

  .af-lobby-room-bar {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 8px 20px 8px 26px;
    min-height: 52px;
    border-radius: 15px;
  }

  .af-room-phrase-lbl {
    font-size: 1.22rem;
    font-weight: 700;
    color: #463222;
    white-space: nowrap;
  }

  .af-copy-btn {
    position: relative;
    appearance: none;
    border: 1px solid transparent;
    background: transparent;
    color: #5c432e;
    width: 34px;
    height: 34px;
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
    transition-property: transform, opacity, filter;
    transition-duration: 300ms;
    transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
  }

  .af-copy-btn .af-check-svg {
    opacity: 0;
    transform: scale(0.25);
    filter: blur(4px);
    color: #1f6f3d;
  }

  .af-copy-btn.is-copied .af-copy-svg {
    opacity: 0;
    transform: scale(0.25);
    filter: blur(4px);
  }

  .af-copy-btn.is-copied .af-check-svg {
    opacity: 1;
    transform: scale(1);
    filter: blur(0px);
  }

  .af-stone-divider-v {
    width: 1.5px;
    height: 24px;
    background: rgba(132, 104, 74, 0.42);
  }

  .af-lobby-counter {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 1.15rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #463222;
    white-space: nowrap;
  }

  .af-pink-blossom-svg {
    width: 24px;
    height: 24px;
  }

  .af-lobby-bottom-row {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    width: 100%;
    min-height: 76px;
  }

  .af-lobby-roles-bar {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 7px 22px;
    min-height: 50px;
    border-radius: 14px;
    max-width: calc(100% - 240px);
  }

  .af-role-slot-btn {
    appearance: none;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 10px;
    padding: 4px 10px 4px 8px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: #463222;
    font-family: inherit;
    font-size: 1.02rem;
    font-weight: 700;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 140ms ease-out;
  }

  .af-role-mini-svg {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }

  .af-ready-tag {
    color: #1f6f3d;
    font-weight: 700;
  }

  .af-ready-tag.is-waiting {
    color: #7d6449;
  }

  .af-lobby-start-btn {
    position: absolute;
    right: 0;
    bottom: 0;
    min-width: 196px;
    min-height: 64px;
    padding: 10px 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 1.48rem;
  }

  .af-lobby-start-btn .af-carved-rosette {
    width: 22px;
    height: 22px;
  }

  @media (max-width: 780px) {
    .af-lobby-bottom-row {
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .af-lobby-roles-bar {
      max-width: 100%;
    }
    .af-lobby-start-btn {
      position: relative;
    }
  }
`;

/**
 * Creates the 5-stage Opening & Southern Flower Field Lobby Flow.
 */
export function createAppFlow({
  container = null,
  onCreateWorld = null,
  onJoinWorld = null,
  onRoleSelect = null,
  onToggleReady = null,
  onStartGame = null,
  onFlowStepChanged = null,
  initialRoomPhrase = 'Love is curiosity',
  autoSkip = undefined,
} = {}) {
  // Inject self-contained styles once
  let styleEl = document.getElementById('haru-app-flow-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'haru-app-flow-styles';
    styleEl.textContent = APP_FLOW_CSS;
    document.head.appendChild(styleEl);
  }

  // Hide legacy #sanctuary-lobby if present so it never overlaps
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
    roomPhrase: roomFromUrl || initialRoomPhrase || 'Love is curiosity',
    isHost: !roomFromUrl,
    localRole: 'Knight',
    hostRole: 'Knight',
    partnerRole: 'Mage',
    playerCount: 1,
    guestReady: true,
    peerConnected: false,
    loadingProgress: 0.62,
    error: '',
  };

  const root = document.createElement('div');
  root.id = 'haru-app-flow-root';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Haru-machi Opening and Co-Op World Lobby');

  root.innerHTML = `
    <!-- 1. TITLE SCENE (01-title.png) -->
    <section class="af-scene af-scene-title" data-flow-scene="title" aria-label="Title Screen">
      <div class="af-title-stack">
        ${SVG_SAKURA_HEADER_DIVIDER}
        <h1 class="af-main-title">Haru-machi</h1>
        <div class="af-credits-block">
          <span>Developed by Argon &amp; Sol</span>
          <span>Directed by Vikas</span>
          <span>For Ishika</span>
        </div>
        <button type="button" class="af-stone-btn af-enter-btn" id="app-flow-enter-btn" data-flow-action="enter">
          ${SVG_IVY_CLUSTER_LEFT}
          ${SVG_CARVED_ROSETTE}
          <span>Enter</span>
          ${SVG_IVY_CLUSTER_RIGHT}
        </button>
      </div>
    </section>

    <!-- 2. LOADING SCENE (02-loading.png) -->
    <section class="af-scene af-scene-loading" data-flow-scene="loading" aria-label="Loading Screen">
      <div class="af-loading-wrap" role="status" aria-live="polite">
        <div class="af-loading-title" id="app-flow-loading-label">Preparing the valley</div>
        <div class="af-stone-slab af-loading-stone-bar" id="app-flow-loading-bar">
          <div class="af-loading-blossom">${SVG_IVY_CLUSTER_LEFT}</div>
          <div class="af-loading-channel">
            <div class="af-loading-fill" id="app-flow-loading-fill"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. CREATE / JOIN WORLD SCENE (03-create-join.png) -->
    <section class="af-scene af-scene-create-join" data-flow-scene="create_join" aria-label="Create or Join World">
      <div class="af-meet-header">
        ${SVG_SAKURA_HEADER_DIVIDER}
        <h2 class="af-meet-title">Meet in the valley</h2>
      </div>

      <div class="af-tablets-grid">
        <!-- Left Tablet: Create World -->
        <div class="af-stone-slab af-world-tablet" id="app-flow-create-tablet">
          <div class="af-tablet-pediment">${SVG_CARVED_ROSETTE}</div>
          ${SVG_IVY_CLUSTER_LEFT}
          <div>
            <h3 class="af-tablet-heading">Create World</h3>
            <div class="af-tablet-divider">${SVG_CARVED_ROSETTE}</div>
            <p class="af-tablet-sub">A place for two</p>
          </div>
          <button type="button" class="af-brass-btn" id="app-flow-create-btn" data-flow-action="create">
            Create
          </button>
          ${SVG_IVY_CLUSTER_RIGHT}
        </div>

        <!-- Right Tablet: Join World -->
        <div class="af-stone-slab af-world-tablet" id="app-flow-join-tablet">
          <div class="af-tablet-pediment">${SVG_CARVED_ROSETTE}</div>
          ${SVG_IVY_CLUSTER_LEFT}
          <div style="width: 100%;">
            <h3 class="af-tablet-heading">Join World</h3>
            <div class="af-tablet-divider" style="margin-inline: auto;">${SVG_CARVED_ROSETTE}</div>
            <div class="af-field-group">
              <label class="af-field-label" for="app-flow-phrase-input">World phrase</label>
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
          <button type="button" class="af-brass-btn" id="app-flow-join-btn" data-flow-action="join">
            Join
          </button>
          ${SVG_IVY_CLUSTER_RIGHT}
        </div>
      </div>

      <div class="af-error-banner" id="app-flow-error-banner" role="alert"></div>
    </section>

    <!-- 4. FLOWER FIELD LOBBY SCENE (04-flower-lobby.png) -->
    <section class="af-scene af-scene-flower-lobby" data-flow-scene="flower_lobby" aria-label="Flower Field Lobby">
      <!-- Top-Left Sculpted Room Bar -->
      <div class="af-lobby-top-row">
        <div class="af-stone-slab af-lobby-room-bar" id="app-flow-lobby-top-bar">
          ${SVG_IVY_CLUSTER_LEFT}
          <span class="af-room-phrase-lbl" id="app-flow-room-phrase">Love is curiosity</span>
          <button
            type="button"
            class="af-copy-btn"
            id="app-flow-copy-btn"
            aria-label="Copy World Invite Link"
            title="Copy World Invite Link"
          >
            ${SVG_COPY_ICON}
            ${SVG_CHECK_ICON}
          </button>
          <span class="af-stone-divider-v" aria-hidden="true"></span>
          <span class="af-lobby-counter" id="app-flow-player-counter">
            ${SVG_PINK_BLOSSOM_BADGE}
            <span id="app-flow-player-count">2 / 2</span>
          </span>
          ${SVG_IVY_CLUSTER_RIGHT}
        </div>
      </div>

      <!-- Bottom-Center Roles Bar + Bottom-Right Start/Ready Button -->
      <div class="af-lobby-bottom-row">
        <div class="af-stone-slab af-lobby-roles-bar" id="app-flow-lobby-role-bar">
          ${SVG_IVY_CLUSTER_LEFT}
          <button
            type="button"
            class="af-role-slot-btn"
            id="app-flow-slot-host"
            data-flow-action="swap-role"
            title="Click to swap Knight / Mage role"
          >
            <span id="app-flow-host-icon">${SVG_KNIGHT_MINI_ICON}</span>
            <span id="app-flow-host-label">Host · Knight</span>
          </button>
          <span class="af-stone-divider-v" aria-hidden="true"></span>
          <button
            type="button"
            class="af-role-slot-btn"
            id="app-flow-slot-partner"
            data-flow-action="swap-role"
            title="Click to swap Knight / Mage role"
          >
            <span id="app-flow-partner-icon">${SVG_MAGE_MINI_ICON}</span>
            <span>
              <span id="app-flow-partner-label">Partner · Mage</span>
              ·
              <span class="af-ready-tag" id="app-flow-partner-ready">Ready</span>
            </span>
          </button>
          ${SVG_IVY_CLUSTER_RIGHT}
        </div>

        <button
          type="button"
          class="af-stone-btn af-lobby-start-btn"
          id="app-flow-lobby-action-btn"
          data-flow-action="start"
        >
          ${SVG_IVY_CLUSTER_LEFT}
          ${SVG_CARVED_ROSETTE}
          <span id="app-flow-lobby-action-label">Start</span>
          ${SVG_IVY_CLUSTER_RIGHT}
        </button>
      </div>
    </section>
  `;

  const mountTarget = container || document.getElementById('hud') || document.body;
  mountTarget.appendChild(root);

  // Cache DOM references
  const enterBtn = root.querySelector('#app-flow-enter-btn');
  const loadingFill = root.querySelector('#app-flow-loading-fill');
  const createBtn = root.querySelector('#app-flow-create-btn');
  const joinBtn = root.querySelector('#app-flow-join-btn');
  const phraseInput = root.querySelector('#app-flow-phrase-input');
  const errorBanner = root.querySelector('#app-flow-error-banner');

  const roomPhraseEl = root.querySelector('#app-flow-room-phrase');
  const copyBtn = root.querySelector('#app-flow-copy-btn');
  const playerCountEl = root.querySelector('#app-flow-player-count');
  const hostIconEl = root.querySelector('#app-flow-host-icon');
  const hostLabelEl = root.querySelector('#app-flow-host-label');
  const partnerIconEl = root.querySelector('#app-flow-partner-icon');
  const partnerLabelEl = root.querySelector('#app-flow-partner-label');
  const partnerReadyEl = root.querySelector('#app-flow-partner-ready');
  const hostSlotBtn = root.querySelector('#app-flow-slot-host');
  const partnerSlotBtn = root.querySelector('#app-flow-slot-partner');
  const lobbyActionBtn = root.querySelector('#app-flow-lobby-action-btn');
  const lobbyActionLabel = root.querySelector('#app-flow-lobby-action-label');

  if (phraseInput) {
    phraseInput.value = roomFromUrl || '';
  }

  let loadingTimer = null;
  let copyTimer = null;

  function renderLobbyDom() {
    if (roomPhraseEl) {
      roomPhraseEl.textContent = state.roomPhrase || 'Love is curiosity';
    }
    if (playerCountEl) {
      const shownCount = state.peerConnected ? 2 : Math.max(1, Math.min(2, state.playerCount || 1));
      playerCountEl.textContent = `${shownCount} / 2`;
    }

    const hostIsKnight = state.hostRole !== 'Mage';
    state.hostRole = hostIsKnight ? 'Knight' : 'Mage';
    state.partnerRole = hostIsKnight ? 'Mage' : 'Knight';

    if (hostIconEl) {
      hostIconEl.innerHTML = hostIsKnight ? SVG_KNIGHT_MINI_ICON : SVG_MAGE_MINI_ICON;
    }
    if (hostLabelEl) {
      hostLabelEl.textContent = `Host · ${state.hostRole}`;
    }
    if (partnerIconEl) {
      partnerIconEl.innerHTML = hostIsKnight ? SVG_MAGE_MINI_ICON : SVG_KNIGHT_MINI_ICON;
    }
    if (partnerLabelEl) {
      partnerLabelEl.textContent = `Partner · ${state.partnerRole}`;
    }

    const isPartnerReady = state.peerConnected ? Boolean(state.guestReady) : true;
    if (partnerReadyEl) {
      partnerReadyEl.textContent = isPartnerReady ? 'Ready' : 'Waiting…';
      partnerReadyEl.classList.toggle('is-waiting', !isPartnerReady);
    }

    if (lobbyActionBtn && lobbyActionLabel) {
      if (state.isHost) {
        lobbyActionBtn.dataset.flowAction = 'start';
        lobbyActionLabel.textContent = 'Start';
        const canStart = !state.peerConnected || Boolean(state.guestReady);
        lobbyActionBtn.disabled = !canStart;
      } else {
        lobbyActionBtn.dataset.flowAction = 'ready';
        lobbyActionBtn.disabled = false;
        lobbyActionLabel.textContent = state.guestReady ? 'Ready ✓' : 'Ready';
      }
    }
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

  function handleSwapRole() {
    state.hostRole = state.hostRole === 'Knight' ? 'Mage' : 'Knight';
    state.partnerRole = state.hostRole === 'Knight' ? 'Mage' : 'Knight';
    state.localRole = state.isHost ? state.hostRole : state.partnerRole;
    renderLobbyDom();
    if (typeof onRoleSelect === 'function') {
      onRoleSelect(state.localRole, { ...state });
    }
  }

  // Wire button interactions
  if (enterBtn) {
    enterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setStep(FLOW_STEPS.LOADING, { loadingDurationMs: 450 });
    });
  }

  if (createBtn) {
    createBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setErrorMessage('');
      const typed = phraseInput?.value?.trim();
      state.roomPhrase = typed || state.roomPhrase || generateRomanticRoomPhrase(0);
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
    state.roomPhrase = typed || state.roomPhrase || 'Love is curiosity';
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

  if (hostSlotBtn) {
    hostSlotBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSwapRole();
    });
  }

  if (partnerSlotBtn) {
    partnerSlotBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSwapRole();
    });
  }

  if (lobbyActionBtn) {
    lobbyActionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isHost) {
        setStep(FLOW_STEPS.IN_GAME);
        if (typeof onStartGame === 'function') {
          onStartGame({ ...state });
        }
      } else {
        state.guestReady = !state.guestReady;
        renderLobbyDom();
        if (typeof onToggleReady === 'function') {
          onToggleReady(state.guestReady, { ...state });
        }
        // In local/offline testing where no host WebSocket triggers start, double-clicking Ready or pressing Start enters game
        if (!state.peerConnected && state.guestReady && typeof onStartGame === 'function') {
          setStep(FLOW_STEPS.IN_GAME);
          onStartGame({ ...state });
        }
      }
    });
  }

  function setLobbyState(patch = {}) {
    if (typeof patch.roomPhrase === 'string' && patch.roomPhrase.trim()) {
      state.roomPhrase = patch.roomPhrase.trim();
    }
    if (typeof patch.isHost === 'boolean') {
      state.isHost = patch.isHost;
    }
    if (patch.hostRole === 'Knight' || patch.hostRole === 'Mage') {
      state.hostRole = patch.hostRole;
      state.partnerRole = patch.hostRole === 'Knight' ? 'Mage' : 'Knight';
    }
    if (patch.localRole === 'Knight' || patch.localRole === 'Mage') {
      state.localRole = patch.localRole;
      if (state.isHost) {
        state.hostRole = patch.localRole;
        state.partnerRole = patch.localRole === 'Knight' ? 'Mage' : 'Knight';
      } else {
        state.partnerRole = patch.localRole;
        state.hostRole = patch.localRole === 'Knight' ? 'Mage' : 'Knight';
      }
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
    }
    if (typeof patch.error === 'string') {
      setErrorMessage(patch.error);
    }
    renderLobbyDom();
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

  // Determine initial step
  const skip =
    typeof autoSkip === 'boolean' ? autoSkip : shouldAutoSkipOpeningFlow();

  if (
    stepFromUrl &&
    Object.values(FLOW_STEPS).includes(stepFromUrl)
  ) {
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
    setStep,
    getState: () => ({ ...state }),
    setLobbyState,
    setErrorMessage,
    markWorldReady,
    skipToGame,
    getCameraPoseForStep: (step = state.step, groundHeightFn = null) =>
      getOpeningCameraPose(step, groundHeightFn),
    destroy() {
      if (loadingTimer) clearTimeout(loadingTimer);
      if (copyTimer) clearTimeout(copyTimer);
      root.remove();
    },
  };
}
