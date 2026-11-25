// ============================================================================
// world/src/ui/sculpted-hud.js
//
// Amarante - High-Craft Botanical-Celestial Medallion HUD & Two-Handed Xiaomi Pad 7 Arc
// (Matching `amarante-target-02-ingame-hud-stone-gaze.png` & `amarante-target-03-adaptive-day-night-polarity.png`):
//   - Environment-Adaptive Ink Polarity (`[data-env-polarity="day|golden|night|eclipse"]`)
//   - Crafted double-ring open-air medallions (ZERO backdrop-filter, ZERO programmer monospace)
//   - Top-Left Party Strip (`56px-60px` Multi-Layered Chibi Hero Bust Portraits +
//     `1.3rem` Cormorant Garamond 700 Name + Emerald-Jade HP Bar with 5-Petal Blossom Cap)
//   - Bottom-Center Active Vitality Bar (`220 / 220` in Cormorant Garamond tabular-nums)
//   - Commanding Concentric 2-Ring Fan Arc (Verified >= 20.4px clear finger gap on Tablet):
//       * Attack (`116x116` Tablet / `96x96` Desktop): Sculpted Diagonal Broadsword / Arcane Staff
//       * Dash (`74x74` Tablet / `64x64` Desktop): Filled Sprinting Figure with Wind Lines
//       * Jump (`74x74` Tablet / `64x64` Desktop): Sweeping Upward Leap Arrow with Ground Arc
//       * [Tab] (`68x68` Tablet / `60x60` Desktop): Dual Cyan Snowflake -> Arrow -> Amber Flame
//       * [E] (`78x78` Tablet / `68x68` Desktop): Multi-Layered Sunfire Flame / Diamond Rime Crystal
//       * [Q] (`76x76` Tablet / `68x68` Desktop): Radiant Sovereign Lightning & Tempest Crest
//       * Commune [R] (`76x76` Tablet / `68x68` Desktop): Lush 7-Petal Amaranth Rose-Lotus
// ============================================================================

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function formatTimerMMSS(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/* ------------------------------------------------------------------------- */
/* Authentic Chibi Portraits & Flat White Genshin Silhouette Action Icons    */
/* ------------------------------------------------------------------------- */

const SVG_ROLE_KNIGHT_EMBLEM = `
<svg class="sh-role-emblem-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <defs>
    <clipPath id="sh-clip-knight-emblem"><circle cx="32" cy="32" r="29.5"/></clipPath>
  </defs>
  <circle cx="32" cy="32" r="29.5" fill="#7dd3fc" opacity="0.35"/>
  <image href="/world/assets/textures/hud/knight-emblem.png" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid slice" clip-path="url(#sh-clip-knight-emblem)"/>
  <circle cx="32" cy="32" r="29.5" stroke="#ffffff" stroke-width="2" opacity="0.92"/>
</svg>
`;

const SVG_ROLE_MAGE_EMBLEM = `
<svg class="sh-role-emblem-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <defs>
    <clipPath id="sh-clip-mage-emblem"><circle cx="32" cy="32" r="29.5"/></clipPath>
  </defs>
  <circle cx="32" cy="32" r="29.5" fill="#7dd3fc" opacity="0.35"/>
  <image href="/world/assets/textures/hud/mage-emblem.png" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid slice" clip-path="url(#sh-clip-mage-emblem)"/>
  <circle cx="32" cy="32" r="29.5" stroke="#ffffff" stroke-width="2" opacity="0.92"/>
</svg>
`;

const SVG_HP_BLOSSOM_CAP = ``;

/* Genshin-style Normal Attack (Knight): Flat white broadsword over 8-point geometric star crest */
const SVG_ATTACK_SWORD = `
<svg class="sh-action-icon-svg sh-sword-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <!-- Subtle 8-point Genshin geometric star crest behind blade -->
  <polygon points="32,10 37,25 52,25 40,34 45,49 32,40 19,49 24,34 12,25 27,25" fill="none" stroke="#ffffff" stroke-width="1.8" opacity="0.45"/>
  <rect x="21" y="21" width="22" height="22" rx="2" transform="rotate(45 32 32)" stroke="#ffffff" stroke-width="1.8" opacity="0.55"/>
  <!-- Flat white silhouette broadsword (diagonal bottom-left to top-right) -->
  <path d="M49 13 L51 15 L47 25 L26 44 L20 38 L39 17 Z" fill="#ffffff"/>
  <!-- Crossguard -->
  <path d="M16 34 L30 48 L27 51 L13 37 Z" fill="#ffffff"/>
  <!-- Grip & Pommel -->
  <path d="M19 43 L13 49 L15 51 L21 45 Z" fill="#ffffff"/>
  <circle cx="12.5" cy="51.5" r="3" fill="#ffffff"/>
</svg>
`;

/* Genshin-style Normal Attack (Mage): Flat white arcane orb-staff over 8-point star crest */
const SVG_ATTACK_STAFF = `
<svg class="sh-action-icon-svg sh-staff-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <!-- Subtle 8-point Genshin geometric star crest behind staff -->
  <rect x="21" y="21" width="22" height="22" rx="2" transform="rotate(45 32 32)" stroke="#ffffff" stroke-width="1.8" opacity="0.52"/>
  <rect x="21" y="21" width="22" height="22" rx="2" stroke="#ffffff" stroke-width="1.6" opacity="0.38"/>
  <!-- Staff Shaft -->
  <path d="M15 49 L38 26" stroke="#ffffff" stroke-width="4.2" stroke-linecap="round"/>
  <!-- Crescent Cradle & Floating Arcane Orb -->
  <path d="M33 29 C31 22, 36 15, 44 15 C40 18, 39 23, 42 27 C45 30, 50 29, 53 25 C53 33, 46 38, 39 36 Z" fill="#ffffff"/>
  <circle cx="45.5" cy="20.5" r="5.2" fill="#ffffff"/>
</svg>
`;

/* Genshin-style Dash/Sprint (matching 1000373930.jpg bottom-right): Dashing silhouette + double chevrons >> */
const SVG_DASH_GLYPH = `
<svg class="sh-action-icon-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <!-- Double Forward Chevrons & Dashing Silhouette -->
  <path d="M22 10 L34 22 L22 34 L17 29 L24 22 L17 15 Z" fill="#ffffff"/>
  <path d="M11 14 L20 23 L11 32 L7.5 28.5 L13 23 L7.5 17.5 Z" fill="#ffffff" opacity="0.82"/>
  <path d="M26 30 L38 35 L29 40 L23 36 Z" fill="#ffffff"/>
</svg>
`;

/* Genshin-style Jump (matching 1000373930.jpg top-right): Curved upward arrow + leaping figure silhouette */
const SVG_JUMP_GLYPH = `
<svg class="sh-action-icon-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <!-- Upward Curved Ribbon Arrow on Left -->
  <path d="M17 10 L9 20 H14.5 C14.5 27.5, 17 34, 23 38 C19.5 32.5, 19.5 26.5, 19.5 20 H25 L17 10 Z" fill="#ffffff"/>
  <!-- Leaping Figure Silhouette on Right -->
  <circle cx="31.5" cy="14" r="3.6" fill="#ffffff"/>
  <path d="M26 21.5 L32.5 19.5 L38 23.5 L35.5 26 L31.5 23.2 L29.5 28.5 L35.5 32 L32.5 38.5 L29.5 37 L31.5 33 L25.5 29.5 Z" fill="#ffffff"/>
</svg>
`;

/* Flat White Blooming Rose-Lotus Silhouette for Commune [R] */
const SVG_SACRED_LOTUS = `
<svg class="sh-lotus-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <!-- Center Petal -->
  <path d="M24 10 C28.5 17, 29.5 24, 24 31 C18.5 24, 19.5 17, 24 10 Z" fill="#ffffff"/>
  <!-- Left & Right Inner Petals -->
  <path d="M22.5 31 C15 28, 12 20.5, 15 14 C18.5 18, 19.5 24, 22.5 31 Z" fill="#ffffff" opacity="0.92"/>
  <path d="M25.5 31 C33 28, 36 20.5, 33 14 C29.5 18, 28.5 24, 25.5 31 Z" fill="#ffffff" opacity="0.92"/>
  <!-- Outer Base Petals -->
  <path d="M21 32.5 C13 32.5, 8 27, 8.5 21 C13 23.5, 16.5 27.5, 21 32.5 Z" fill="#ffffff" opacity="0.78"/>
  <path d="M27 32.5 C35 32.5, 40 27, 39.5 21 C35 23.5, 31.5 27.5, 27 32.5 Z" fill="#ffffff" opacity="0.78"/>
  <path d="M16 35.5 Q24 38 32 35.5" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>
</svg>
`;

/* Refined Precision Crystalline Crest for [E] Ice (Icy Cyan #38bdf8 & Frost White #e0f2fe) */
const SVG_ICE_CRYSTAL_GLYPH = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <!-- Subtle Geometric Diamond Frame -->
  <rect x="13" y="13" width="22" height="22" rx="1.5" transform="rotate(45 24 24)" stroke="#38bdf8" stroke-width="1.6" opacity="0.72"/>
  <!-- Diagonal Frost Spines -->
  <path d="M13.5 13.5 L34.5 34.5 M34.5 13.5 L13.5 34.5" stroke="#38bdf8" stroke-width="1.9" stroke-linecap="round" opacity="0.88"/>
  <!-- Outer Icy Cyan Star Facets -->
  <polygon points="24,5.5 28.6,19.4 42.5,24 28.6,28.6 24,42.5 19.4,28.6 5.5,24 19.4,19.4" fill="#38bdf8" opacity="0.94"/>
  <!-- Pure Frost Core -->
  <polygon points="24,11.5 26.8,21.2 36.5,24 26.8,26.8 24,36.5 21.2,26.8 11.5,24 21.2,21.2" fill="#e0f2fe"/>
</svg>
`;

/* Blazing Multi-Tongue Sunfire Crest for [E] Fire (#ff4d2a Outer, #ff9e1b Middle, #fff3a1 Core) */
const SVG_FIRE_SUNFIRE_GLYPH = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <!-- Subtle Geometric Solar Halo -->
  <circle cx="24" cy="25" r="15.5" stroke="#ff9e1b" stroke-width="1.5" stroke-dasharray="3.5 2.5" opacity="0.65"/>
  <!-- Outer Blazing Crimson-Orange Multi-Tongue Flame (#ff4d2a) -->
  <path d="M24.8 4.8 C29.2 10.6, 33.6 15.2, 32.8 22.4 C35.2 20.4, 36.8 17.6, 37.0 14.8 C40.4 19.6, 41.6 26.4, 39.2 32.4 C36.6 39.0, 30.8 43.0, 24.0 43.0 C17.2 43.0, 11.4 38.8, 9.0 32.0 C6.8 26.0, 8.4 19.2, 12.4 14.4 C12.2 17.6, 13.6 20.2, 15.8 21.8 C14.8 14.8, 19.2 9.0, 24.8 4.8 Z" fill="#ff4d2a"/>
  <!-- Middle Amber-Gold Flame (#ff9e1b) -->
  <path d="M24.4 12.8 C27.8 17.2, 30.8 21.2, 30.0 27.2 C31.6 25.8, 32.8 23.8, 33.0 21.8 C35.0 25.2, 35.4 30.0, 33.6 34.2 C31.8 38.4, 28.2 41.0, 24.0 41.0 C19.8 41.0, 16.2 38.4, 14.6 34.0 C13.0 29.8, 13.8 25.2, 16.2 21.8 C16.2 24.0, 17.2 25.8, 18.8 27.0 C18.0 21.4, 21.0 16.6, 24.4 12.8 Z" fill="#ff9e1b"/>
  <!-- Pure White-Gold Inner Core (#fff3a1) -->
  <path d="M24.2 21.6 C26.6 25.0, 28.6 28.2, 28.0 32.8 C27.4 36.8, 25.8 39.2, 24.0 39.2 C22.2 39.2, 20.6 36.8, 20.0 32.8 C19.4 28.6, 21.4 25.0, 24.2 21.6 Z" fill="#fff3a1"/>
</svg>
`;

/* Clean Left-Side [Tab] Element Switch: Vivid Multi-Tongue Flame & Crisp Icy Cyan Crystal + Horizontal Text when switching */
const SVG_TAB_SWAP_GLYPH = `
<span class="sh-tab-switch-inner">
  <span class="sh-tab-icons-pair">
    <span class="sh-tab-opt sh-tab-opt-ice" data-el-opt="ice" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path d="M5.8 5.8L18.2 18.2M18.2 5.8L5.8 18.2" stroke="#38bdf8" stroke-width="1.6" stroke-linecap="round" opacity="0.88"/>
        <polygon points="12,2.2 14.5,9.5 21.8,12 14.5,14.5 12,21.8 9.5,14.5 2.2,12 9.5,9.5" fill="#38bdf8"/>
        <polygon points="12,6.2 13.4,10.6 17.8,12 13.4,13.4 12,17.8 10.6,13.4 6.2,12 10.6,10.6" fill="#e0f2fe"/>
      </svg>
    </span>
    <span class="sh-tab-opt sh-tab-opt-fire" data-el-opt="fire" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path d="M12.4 2.2C14.6 5.1 16.8 7.5 16.4 11.2C17.6 10.2 18.4 8.8 18.5 7.4C20.2 9.8 20.8 13.2 19.6 16.2C18.3 19.5 15.4 21.5 12 21.5C8.6 21.5 5.7 19.4 4.5 16.0C3.4 13.0 4.2 9.6 6.2 7.2C6.1 8.8 6.8 10.1 7.9 10.9C7.4 7.4 9.6 4.5 12.4 2.2Z" fill="#ff4d2a"/>
        <path d="M12.2 6.4C13.9 8.6 15.4 10.6 15.0 13.6C15.8 12.9 16.4 11.9 16.5 10.9C17.5 12.6 17.7 15.0 16.8 17.1C15.9 19.2 14.1 20.5 12 20.5C9.9 20.5 8.1 19.2 7.3 17.0C6.5 14.9 6.9 12.6 8.1 10.9C8.1 12.0 8.6 12.9 9.4 13.5C9.0 10.7 10.5 8.3 12.2 6.4Z" fill="#ff9e1b"/>
        <path d="M12.1 11.2C13.2 12.8 14.2 14.3 13.9 16.5C13.6 18.4 12.9 19.6 12 19.6C11.1 19.6 10.4 18.4 10.1 16.5C9.8 14.5 10.8 12.8 12.1 11.2Z" fill="#fff3a1"/>
      </svg>
    </span>
  </span>
  <span class="sh-tab-active-text" id="sh-tab-active-text">Ice</span>
</span>
`;

/* Flat White Elemental Burst Ultimate Crest for [Q] */
const SVG_ULTIMATE_STORM_VORTEX = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <circle cx="24" cy="24" r="16" stroke="#ffffff" stroke-width="1.8" stroke-dasharray="4 3" opacity="0.72"/>
  <polygon points="24,6 28.5,19.5 42,24 28.5,28.5 24,42 19.5,28.5 6,24 19.5,19.5" fill="#ffffff"/>
</svg>
`;

/* ------------------------------------------------------------------------- */
/* Genshin Impact Clean Translucent HUD CSS + Colored Vertical Fill          */
/* ------------------------------------------------------------------------- */

const SCULPTED_HUD_CSS = `
  body.sculpted-hud-mounted #top-bar,
  body.sculpted-hud-mounted #bottom-bar,
  body.sculpted-hud-mounted #touch-hud-layer,
  body.sculpted-hud-mounted #altar-stele-modal,
  body.sculpted-hud-mounted #stele-interact-prompt {
    display: none !important;
  }

  :root,
  [data-env-polarity="day"],
  [data-env-polarity="golden"],
  [data-env-polarity="night"],
  [data-env-polarity="eclipse"] {
    --hud-font-sans: "Plus Jakarta Sans", "Outfit", "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --hud-ink: #ffffff;
    --hud-ink-muted: rgba(255, 255, 255, 0.82);
    --hud-ring-border: rgba(255, 255, 255, 0.78);
    --hud-ring-inner: rgba(255, 255, 255, 0.22);
    --hud-ring-fill: rgba(22, 26, 34, 0.52);
    --hud-shadow: rgba(15, 23, 42, 0.24);
    --hud-accent: #facc15;
  }

  #sculpted-hud-root {
    position: fixed;
    inset: 0;
    pointer-events: none;
    touch-action: none;
    z-index: 26;
    font-family: var(--hud-font-sans);
    color: var(--hud-ink);
    user-select: none;
    -webkit-user-select: none;
  }

  #sculpted-hud-root.is-hidden {
    display: none;
  }

  /* ----------------------------------------------------------------------- */
  /* Genshin Impact Translucent Action Circle + Vertical Elemental Fill      */
  /* ----------------------------------------------------------------------- */
  .sh-open-ring {
    position: absolute;
    appearance: none;
    pointer-events: auto;
    touch-action: none;
    cursor: pointer;
    border-radius: 50%;
    background: var(--hud-ring-fill);
    border: 1.5px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 2.5px var(--hud-ring-inner),
      0 4px 14px var(--hud-shadow);
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    overflow: visible;
    -webkit-tap-highlight-color: transparent;
    transition: transform 120ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out;
  }

  /* Inner clip container for vertical up-and-down elemental fill */
  .sh-ring-clip {
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }

  .sh-vertical-fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 100%;
    transition: height 120ms linear, background-color 180ms ease;
    pointer-events: none;
  }

  #sculpted-slot-e[data-element="ice"] .sh-vertical-fill {
    background: linear-gradient(180deg, rgba(186, 230, 253, 0.14) 0%, rgba(22, 26, 34, 0.28) 100%);
  }

  #sculpted-slot-e[data-element="fire"] .sh-vertical-fill {
    background: linear-gradient(180deg, rgba(254, 215, 170, 0.16) 0%, rgba(22, 26, 34, 0.28) 100%);
  }

  #sculpted-slot-q .sh-vertical-fill {
    background: linear-gradient(180deg, rgba(254, 240, 138, 0.16) 0%, rgba(22, 26, 34, 0.28) 100%);
  }

  #sculpted-commune-btn .sh-vertical-fill {
    background: linear-gradient(180deg, rgba(251, 113, 133, 0.78) 0%, rgba(225, 29, 72, 0.65) 100%);
  }

  .sh-open-ring > *:not(.sh-ring-clip):not(.sh-keycap-badge):not(#sculpted-partner-commune-tag) {
    position: relative;
    z-index: 1;
    filter: drop-shadow(0 1px 3px rgba(15, 23, 42, 0.35));
  }

  @media (hover: hover) {
    .sh-open-ring:not(:disabled):hover {
      border-color: #ffffff;
      background-color: rgba(45, 52, 64, 0.38);
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .sh-open-ring:not(:disabled):active,
    .sh-open-ring.is-pressed:not(:disabled) {
      transform: scale(0.94);
    }
  }

  .sh-open-ring:focus-visible,
  #sculpted-room-badge:focus-visible,
  .sh-choice-pill:focus-visible,
  .sh-modal-close-btn:focus-visible {
    outline: 2px solid var(--hud-accent);
    outline-offset: 3px;
  }

  /* ----------------------------------------------------------------------- */
  /* 1. Top-Left Party Strip (#sculpted-party-bars) — Clean Genshin Style    */
  /* ----------------------------------------------------------------------- */
  #sculpted-party-bars {
    position: absolute;
    top: max(16px, env(safe-area-inset-top, 0px));
    left: max(18px, env(safe-area-inset-left, 0px));
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: auto;
    z-index: 28;
  }

  .sh-life-row {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    pointer-events: auto;
    padding: 2px 6px 2px 2px;
    border-radius: 999px;
    transition: transform 120ms ease-out;
  }

  .sh-life-row:active {
    transform: scale(0.97);
  }

  .sh-emblem-ring {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.22);
    border: 2px solid rgba(255, 255, 255, 0.85);
    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.25);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .sh-life-row.is-leader .sh-emblem-ring {
    width: 54px;
    height: 54px;
    border-color: #ffffff;
    box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.85), 0 4px 12px rgba(15, 23, 42, 0.3);
  }

  .sh-role-emblem-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .sh-party-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .sh-name-and-hp-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  /* Floating white Genshin-style name (ZERO black background pill!) */
  .sh-player-name-lbl {
    font-family: var(--hud-font-sans);
    font-size: 0.96rem;
    font-weight: 700;
    line-height: 1.1;
    color: #ffffff;
    text-shadow: 0 1px 4px rgba(15, 23, 42, 0.75), 0 0 2px rgba(15, 23, 42, 0.65);
    white-space: nowrap;
  }

  .sh-life-row.is-leader .sh-player-name-lbl {
    font-size: 1.04rem;
  }

  .sh-hp-num-inline {
    font-family: var(--hud-font-sans);
    font-variant-numeric: tabular-nums;
    font-size: 0.76rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.92);
    text-shadow: 0 1px 3px rgba(15, 23, 42, 0.75);
  }

  .sh-hp-bar-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .sh-hp-channel {
    position: relative;
    width: 148px;
    height: 8px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.42);
    border: 1.2px solid rgba(255, 255, 255, 0.78);
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.25);
    overflow: hidden;
  }

  .sh-life-row.is-leader .sh-hp-channel {
    width: 172px;
    height: 9px;
  }

  .sh-hp-heal-preview {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(250, 204, 21, 0.56) 0%, rgba(254, 249, 195, 0.96) 100%);
    opacity: 0;
    transition: width 140ms ease-out, opacity 320ms ease-out;
    pointer-events: none;
    z-index: 1;
  }

  .sh-life-row.is-healed-pulse .sh-hp-heal-preview {
    opacity: 1;
  }

  .sh-hp-fill {
    position: relative;
    height: 100%;
    width: 100%;
    border-radius: 999px;
    background: #84cc16;
    transition: width 150ms ease-out;
    z-index: 2;
  }

  .sh-life-row.is-healed-pulse .sh-hp-fill {
    transition: width 760ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .sh-hp-fill::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 45%;
    background: #a3e635;
    pointer-events: none;
  }

  .sh-hp-fill.is-low {
    background: #ef4444;
  }

  .sh-hp-fill.is-low::after {
    background: #f87171;
  }

  .sh-shield-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 0%;
    border-radius: 999px;
    background: #facc15;
    transition: width 150ms ease-out;
    pointer-events: none;
  }

  /* ----------------------------------------------------------------------- */
  /* 2. Redundant Bottom Health Bar — Permanently Hidden (Per Vikas's Rule)  */
  /* ----------------------------------------------------------------------- */
  #sculpted-vitality-bar {
    display: none !important;
  }

  /* ----------------------------------------------------------------------- */
  /* 3. Top-Right Minimal Translucent Pause Ring (#sculpted-pause-btn)       */
  /* ----------------------------------------------------------------------- */
  #sculpted-pause-btn {
    top: max(16px, env(safe-area-inset-top, 0px));
    right: max(18px, env(safe-area-inset-right, 0px));
    width: 44px;
    height: 44px;
    z-index: 28;
  }

  .sh-pause-bars {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    justify-content: center;
  }

  .sh-pause-bars span {
    width: 2.5px;
    height: 15px;
    border-radius: 1.5px;
    background: #ffffff;
  }

  #sculpted-fullscreen-btn {
    top: max(16px, env(safe-area-inset-top, 0px));
    right: calc(max(18px, env(safe-area-inset-right, 0px)) + 54px);
    width: 44px;
    height: 44px;
    z-index: 28;
    display: none;
  }

  #sculpted-hud-root.profile-tablet #sculpted-fullscreen-btn {
    display: inline-flex;
  }

  .sh-fullscreen-svg {
    width: 20px;
    height: 20px;
    stroke: #ffffff;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
  }

  #sculpted-room-badge {
    display: none !important;
    position: absolute;
    top: max(20px, env(safe-area-inset-top, 0px));
    right: calc(max(18px, env(safe-area-inset-right, 0px)) + 56px);
    height: 36px;
    padding: 0 13px;
    border-radius: 999px;
    background: var(--hud-ring-fill);
    border: 1.5px solid var(--hud-ring-border);
    box-shadow: 0 4px 14px var(--hud-shadow);
    color: #ffffff;
    align-items: center;
    gap: 7px;
    font-family: var(--hud-font-sans);
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    pointer-events: auto;
    touch-action: manipulation;
    z-index: 28;
    max-width: 280px;
    -webkit-tap-highlight-color: transparent;
    transition: transform 120ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out;
  }

  #sculpted-hud-root.profile-tablet #sculpted-room-badge {
    right: calc(max(18px, env(safe-area-inset-right, 0px)) + 112px);
  }

  #sculpted-hud-root.profile-desktop #sculpted-room-badge {
    right: calc(max(18px, env(safe-area-inset-right, 0px)) + 56px);
  }

  @media (hover: hover) {
    #sculpted-room-badge:hover {
      border-color: #ffffff;
      background-color: rgba(45, 52, 64, 0.38);
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    #sculpted-room-badge:active {
      transform: scale(0.96);
    }
  }

  .sh-room-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.28);
    transition: background-color 180ms ease, box-shadow 180ms ease;
  }

  #sculpted-room-badge.is-linked .sh-room-dot {
    background: #10b981;
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.75);
  }

  .sh-room-badge-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  /* ----------------------------------------------------------------------- */
  /* 4. Genshin-Style Dynamic Left Hand Floating Thumbstick (Zero Overlap)   */
  /* ----------------------------------------------------------------------- */
  #sculpted-joystick-zone {
    position: absolute;
    left: 0;
    bottom: 0;
    width: min(30vw, 330px);
    height: min(50vh, 410px);
    pointer-events: auto;
    touch-action: none;
    z-index: 27;
    display: none;
  }

  #sculpted-hud-root.profile-tablet #sculpted-joystick-zone {
    display: block;
  }

  .sh-joy-ring {
    position: fixed;
    left: max(38px, env(safe-area-inset-left, 38px));
    bottom: max(36px, env(safe-area-inset-bottom, 36px));
    width: 148px;
    height: 148px;
    border-radius: 50%;
    background: rgba(34, 38, 46, 0.24);
    border: 1.8px solid rgba(255, 255, 255, 0.68);
    box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.14);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    transition: opacity 140ms ease-out, border-color 140ms ease-out;
  }

  .sh-joy-ring.is-floating {
    left: 0 !important;
    bottom: auto !important;
    top: 0 !important;
    margin-left: -74px;
    margin-top: -74px;
    border-color: rgba(255, 255, 255, 0.92);
    background: rgba(34, 38, 46, 0.34);
  }

  .sh-joy-ring.is-sprinting {
    border-color: var(--hud-accent);
  }

  .sh-joy-puck {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.42);
    border: 2px solid #ffffff;
    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.28);
    transform: translate3d(0px, 0px, 0px);
    pointer-events: none;
  }

  /* Open Screen Pure 0ms Camera Orbit Layer (Tablet/Touch) */
  #sculpted-orbit-zone {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: auto;
    touch-action: none;
    z-index: 25;
    display: none;
  }

  #sculpted-hud-root.profile-tablet #sculpted-orbit-zone {
    display: block;
  }

  /* Compact Middle-Screen Hero Swipe-to-Dodge Zone (crisp flick = dodge, drag/slow = orbit) */
  #sculpted-center-dodge-zone {
    position: absolute;
    left: 50%;
    top: 53%;
    transform: translate(-50%, -50%);
    width: clamp(128px, 13.5vw, 168px);
    height: clamp(160px, 24vh, 210px);
    border-radius: 999px;
    pointer-events: auto;
    touch-action: none;
    z-index: 26;
    display: none;
    align-items: center;
    justify-content: center;
  }

  #sculpted-hud-root.profile-tablet #sculpted-center-dodge-zone {
    display: flex;
  }

  #sculpted-dodge-aid-ring {
    position: relative;
    width: 88px;
    height: 88px;
    margin-top: 2vh;
    border-radius: 50%;
    border: 1.5px dashed rgba(255, 255, 255, 0.55);
    box-shadow: inset 0 0 18px rgba(255, 255, 255, 0.08);
    pointer-events: none;
    opacity: 0;
    transition: transform 140ms ease-out, border-color 140ms ease-out, opacity 140ms ease-out;
  }

  #sculpted-center-dodge-zone.is-touching #sculpted-dodge-aid-ring {
    opacity: 0.65;
    border-color: rgba(255, 255, 255, 0.82);
    transform: scale(1.08);
  }

  #sculpted-dodge-ripple {
    position: fixed;
    left: 50vw;
    top: 50vh;
    width: 68px;
    height: 68px;
    margin-left: -34px;
    margin-top: -34px;
    border-radius: 50%;
    border: 2.5px solid rgba(255, 255, 255, 0.92);
    box-shadow: 0 0 18px rgba(125, 211, 252, 0.72);
    pointer-events: none;
    z-index: 29;
    opacity: 0;
    transform: scale(0.5);
  }

  #sculpted-dodge-ripple::after {
    content: "";
    position: absolute;
    right: -10px;
    top: 50%;
    width: 14px;
    height: 14px;
    margin-top: -7px;
    border-top: 3px solid #ffffff;
    border-right: 3px solid #ffffff;
    transform: rotate(45deg);
  }

  @keyframes shDodgeRippleAnim {
    0% {
      opacity: 0.95;
      transform: rotate(var(--dodge-angle, 0deg)) translate3d(0px, 0px, 0px) scale(0.72);
    }
    100% {
      opacity: 0;
      transform: rotate(var(--dodge-angle, 0deg)) translate3d(44px, 0px, 0px) scale(1.22);
    }
  }

  #sculpted-dodge-ripple.is-active {
    animation: shDodgeRippleAnim 260ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  /* ----------------------------------------------------------------------- */
  /* 5. Left-Side [Tab] Switch (~30% Below Top) & Bottom-Right Genshin Arc   */
  /* ----------------------------------------------------------------------- */
  #sculpted-action-cluster,
  #sculpted-powers-dock,
  #sculpted-commune-wrap {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 28;
  }

  .sh-power-slot {
    display: none;
  }

  .sh-power-slot.is-unlocked {
    display: inline-flex;
  }

  #sculpted-commune-wrap #sculpted-commune-btn {
    display: none;
  }

  #sculpted-commune-wrap.is-unlocked #sculpted-commune-btn {
    display: inline-flex;
  }

  /* LEFT-SIDE [Tab] ELEMENT SWITCH (~30% down from top-left): Dark-frosted glass pill + subtle elemental icon accent */
  #sculpted-slot-tab,
  #sculpted-hud-root.profile-tablet #sculpted-slot-tab,
  #sculpted-hud-root.profile-desktop #sculpted-slot-tab {
    position: fixed;
    left: max(18px, env(safe-area-inset-left, 0px));
    top: 30vh;
    right: auto;
    bottom: auto;
    width: auto;
    height: 38px;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(22, 26, 34, 0.52);
    border: 1.5px solid rgba(255, 255, 255, 0.78);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.24);
    gap: 6px;
  }

  .sh-tab-switch-inner {
    display: inline-flex;
    align-items: center;
    gap: 0;
    font-family: var(--hud-font-sans);
    font-size: 0.86rem;
    font-weight: 700;
    color: #ffffff;
  }

  .sh-tab-icons-pair {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .sh-tab-opt {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid transparent;
    color: rgba(255, 255, 255, 0.46);
    opacity: 0.52;
    transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease, opacity 140ms ease, transform 140ms ease;
  }

  #sculpted-slot-tab[data-element="ice"] .sh-tab-opt-ice {
    background: rgba(56, 189, 248, 0.22);
    border-color: rgba(56, 189, 248, 0.85);
    color: #38bdf8;
    opacity: 1;
    transform: scale(1.06);
  }

  #sculpted-slot-tab[data-element="fire"] .sh-tab-opt-fire {
    background: rgba(255, 77, 42, 0.24);
    border-color: rgba(255, 158, 27, 0.88);
    color: #ff9e1b;
    opacity: 1;
    transform: scale(1.06);
  }

  /* Horizontal text ahead of icons — hidden at rest, expands out when switching */
  .sh-tab-active-text {
    display: inline-block;
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    white-space: nowrap;
    margin-left: 0;
    padding-right: 0;
    color: #ffffff;
    text-shadow: 0 1px 3px rgba(15, 23, 42, 0.72);
    transition:
      max-width 220ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 180ms ease,
      margin-left 220ms cubic-bezier(0.22, 1, 0.36, 1),
      padding-right 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  #sculpted-slot-tab.is-switching .sh-tab-active-text {
    max-width: 64px;
    opacity: 1;
    margin-left: 8px;
    padding-right: 4px;
  }

  #sculpted-slot-tab .sh-keycap-badge {
    position: static;
    margin-left: 2px;
  }

  #sculpted-tab-caption {
    display: none;
  }

  /* --- TABLET GENSHIN BOTTOM-RIGHT ACTION CLUSTER (Enlarged Ergonomic Dodge Button) --- */
  /* Normal Attack (Large Middle Circle): right: 118px, bottom: 48px */
  #sculpted-hud-root.profile-tablet #sculpted-attack-btn {
    right: 118px;
    bottom: 48px;
    width: 104px;
    height: 104px;
  }

  /* Enlarged Ergonomic Dash/Dodge (Bottom-Right Corner Circle): right: 20px, bottom: 20px, 82x82px */
  #sculpted-hud-root.profile-tablet #sculpted-dash-btn {
    right: 20px;
    bottom: 20px;
    width: 82px;
    height: 82px;
    border-color: rgba(255, 255, 255, 0.92);
  }

  /* Jump (Top-Right Circle above Dash): right: 24px, bottom: 132px */
  #sculpted-hud-root.profile-tablet #sculpted-jump-btn {
    right: 24px;
    bottom: 132px;
    width: 72px;
    height: 72px;
  }

  /* Elemental Skill [E] (Bottom-Left of Normal Attack): right: 236px, bottom: 24px */
  #sculpted-hud-root.profile-tablet #sculpted-slot-e {
    right: 236px;
    bottom: 24px;
    width: 76px;
    height: 76px;
  }

  /* Elemental Burst [Q] (Left of E): right: 328px, bottom: 28px */
  #sculpted-hud-root.profile-tablet #sculpted-slot-q {
    right: 328px;
    bottom: 28px;
    width: 80px;
    height: 80px;
  }

  /* Commune [R] (Upper Gadget Slot above Jump): right: 28px, bottom: 224px */
  #sculpted-hud-root.profile-tablet #sculpted-commune-btn {
    right: 28px;
    bottom: 224px;
    width: 68px;
    height: 68px;
  }

  /* --- COMPACT MOBILE / NORMAL PHONE (Realme 11 Pro / iPhone Landscape <= 932x520 or Portrait <= 680px) --- */
  @media (max-width: 932px) and (max-height: 520px), (max-width: 680px) {
    #sculpted-party-bars {
      top: max(10px, env(safe-area-inset-top, 10px));
      left: max(12px, env(safe-area-inset-left, 12px));
      gap: 6px;
    }

    .sh-emblem-ring {
      width: 38px;
      height: 38px;
    }

    .sh-life-row.is-leader .sh-emblem-ring {
      width: 42px;
      height: 42px;
    }

    .sh-player-name-lbl {
      font-size: 0.82rem;
    }

    .sh-life-row.is-leader .sh-player-name-lbl {
      font-size: 0.88rem;
    }

    .sh-hp-num-inline {
      font-size: 0.68rem;
    }

    .sh-hp-channel {
      width: 112px;
      height: 7px;
    }

    .sh-life-row.is-leader .sh-hp-channel {
      width: 128px;
      height: 8px;
    }

    #sculpted-pause-btn {
      top: max(10px, env(safe-area-inset-top, 10px));
      right: max(12px, env(safe-area-inset-right, 12px));
      width: 38px;
      height: 38px;
    }

    #sculpted-fullscreen-btn {
      top: max(10px, env(safe-area-inset-top, 10px));
      right: calc(max(12px, env(safe-area-inset-right, 12px)) + 46px);
      width: 38px;
      height: 38px;
    }

    #sculpted-room-badge,
    #sculpted-hud-root.profile-desktop #sculpted-room-badge {
      top: max(12px, env(safe-area-inset-top, 12px));
      right: calc(max(12px, env(safe-area-inset-right, 12px)) + 48px);
      height: 34px;
      padding: 0 10px;
      font-size: 0.72rem;
      max-width: min(46vw, 310px);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #sculpted-hud-root.profile-tablet #sculpted-room-badge {
      right: calc(max(12px, env(safe-area-inset-right, 12px)) + 92px);
      max-width: min(46vw, 310px);
    }

    .sh-modal-tablet {
      padding: 16px 18px;
      gap: 10px;
    }

    #sculpted-joystick-zone {
      left: 0;
      bottom: 0;
      width: min(32vw, 280px);
      height: min(52vh, 280px);
    }

    .sh-joy-ring {
      left: max(18px, env(safe-area-inset-left, 18px));
      bottom: max(18px, env(safe-area-inset-bottom, 18px));
      width: 116px;
      height: 116px;
    }

    .sh-joy-ring.is-floating {
      margin-left: -58px;
      margin-top: -58px;
    }

    .sh-joy-puck {
      width: 44px;
      height: 44px;
    }

    #sculpted-hud-root.profile-tablet #sculpted-attack-btn {
      right: max(86px, calc(env(safe-area-inset-right, 0px) + 82px));
      bottom: max(24px, calc(env(safe-area-inset-bottom, 0px) + 20px));
      width: 78px;
      height: 78px;
    }

    #sculpted-hud-root.profile-tablet #sculpted-attack-btn .sh-action-icon-svg {
      width: 46px;
      height: 46px;
    }

    #sculpted-hud-root.profile-tablet #sculpted-dash-btn {
      right: max(14px, env(safe-area-inset-right, 14px));
      bottom: max(14px, env(safe-area-inset-bottom, 14px));
      width: 64px;
      height: 64px;
    }

    #sculpted-hud-root.profile-tablet #sculpted-jump-btn {
      right: max(14px, env(safe-area-inset-right, 14px));
      bottom: max(88px, calc(env(safe-area-inset-bottom, 0px) + 84px));
      width: 54px;
      height: 54px;
    }

    #sculpted-hud-root.profile-tablet #sculpted-dash-btn .sh-action-icon-svg {
      width: 34px;
      height: 34px;
    }

    #sculpted-hud-root.profile-tablet #sculpted-jump-btn .sh-action-icon-svg {
      width: 30px;
      height: 30px;
    }

    #sculpted-hud-root.profile-tablet #sculpted-slot-e {
      right: max(172px, calc(env(safe-area-inset-right, 0px) + 168px));
      bottom: max(16px, env(safe-area-inset-bottom, 16px));
      width: 56px;
      height: 56px;
    }

    #sculpted-hud-root.profile-tablet #sculpted-slot-q {
      right: max(236px, calc(env(safe-area-inset-right, 0px) + 232px));
      bottom: max(18px, env(safe-area-inset-bottom, 18px));
      width: 58px;
      height: 58px;
    }

    #sculpted-hud-root.profile-tablet #sculpted-commune-btn {
      right: max(16px, env(safe-area-inset-right, 16px));
      bottom: max(152px, calc(env(safe-area-inset-bottom, 0px) + 148px));
      width: 50px;
      height: 50px;
    }

    #sculpted-hud-root.profile-tablet .sh-skill-glyph-svg,
    #sculpted-hud-root.profile-tablet .sh-lotus-svg {
      width: 30px;
      height: 30px;
    }

    #sculpted-slot-tab,
    #sculpted-hud-root.profile-tablet #sculpted-slot-tab {
      left: max(12px, env(safe-area-inset-left, 12px));
      top: 28vh;
      height: 32px;
      padding: 3px 6px;
    }
  }

  @media (max-width: 560px) {
    #sculpted-room-badge,
    #sculpted-hud-root.profile-tablet #sculpted-room-badge,
    #sculpted-hud-root.profile-desktop #sculpted-room-badge {
      top: calc(max(10px, env(safe-area-inset-top, 10px)) + 46px);
      right: max(12px, env(safe-area-inset-right, 12px));
      max-width: min(62vw, 260px);
    }
  }

  /* --- DESKTOP GENSHIN BOTTOM-RIGHT ACTION CLUSTER --- */
  #sculpted-hud-root.profile-desktop #sculpted-attack-btn {
    right: 98px;
    bottom: 42px;
    width: 88px;
    height: 88px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-dash-btn {
    right: 22px;
    bottom: 20px;
    width: 62px;
    height: 62px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-jump-btn {
    right: 22px;
    bottom: 114px;
    width: 62px;
    height: 62px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-slot-e {
    right: 202px;
    bottom: 20px;
    width: 66px;
    height: 66px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-slot-q {
    right: 284px;
    bottom: 24px;
    width: 70px;
    height: 70px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-commune-btn {
    right: 24px;
    bottom: 194px;
    width: 60px;
    height: 60px;
  }

  /* Ring Icon Scaling (Tablet & Desktop) */
  #sculpted-attack-btn .sh-action-icon-svg {
    width: 58px;
    height: 58px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-attack-btn .sh-action-icon-svg {
    width: 50px;
    height: 50px;
  }

  #sculpted-dash-btn .sh-action-icon-svg,
  #sculpted-jump-btn .sh-action-icon-svg {
    width: 38px;
    height: 38px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-dash-btn .sh-action-icon-svg,
  #sculpted-hud-root.profile-desktop #sculpted-jump-btn .sh-action-icon-svg {
    width: 34px;
    height: 34px;
  }

  .sh-skill-glyph-svg,
  .sh-lotus-svg {
    width: 40px;
    height: 40px;
  }

  #sculpted-hud-root.profile-desktop .sh-skill-glyph-svg,
  #sculpted-hud-root.profile-desktop .sh-lotus-svg {
    width: 34px;
    height: 34px;
  }

  /* Subtle Keycap Callout Badges (Clean Sans, Light Translucent Pill) */
  .sh-keycap-badge {
    position: absolute;
    right: -2px;
    bottom: -5px;
    min-width: 20px;
    height: 17px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(252, 249, 242, 0.92);
    border: 1px solid #dcd0bc;
    box-shadow: 0 2px 5px rgba(15, 23, 42, 0.18);
    font-family: var(--hud-font-sans);
    font-size: 0.68rem;
    font-weight: 700;
    color: #1f1c18;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    pointer-events: none;
    z-index: 2;
  }

  #sculpted-hud-root.profile-tablet .sh-keycap-badge {
    display: none !important;
  }

  .sh-slot-cd-badge {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(15, 23, 42, 0.45);
    color: #ffffff;
    font-family: var(--hud-font-sans);
    font-variant-numeric: tabular-nums;
    font-size: 0.96rem;
    font-weight: 800;
    display: none;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 2;
  }

  .sh-power-slot.on-cooldown .sh-slot-cd-badge {
    display: flex;
  }

  #sculpted-slot-e[data-element="ice"] {
    border-color: rgba(186, 230, 253, 0.92);
  }

  #sculpted-slot-e[data-element="fire"] {
    border-color: rgba(254, 215, 170, 0.92);
  }

  #sculpted-slot-e.is-active-buff {
    box-shadow:
      0 0 0 2px #facc15,
      0 4px 16px rgba(250, 204, 21, 0.45);
  }

  #sculpted-slot-e.is-aim-cancel {
    border-color: #fb7185;
    box-shadow: 0 0 0 2px rgba(244, 63, 94, 0.72);
  }

  /* Blazing Ready Pulse on [Q] when Kill-Energy Gauge reaches 100% */
  @keyframes shUltReadyPulse {
    0%, 100% {
      border-color: #fde047;
      box-shadow:
        0 0 0 2px rgba(250, 204, 21, 0.9),
        0 0 18px rgba(245, 158, 11, 0.72),
        inset 0 0 12px rgba(254, 240, 138, 0.45);
      transform: scale(1);
    }
    50% {
      border-color: #ffffff;
      box-shadow:
        0 0 0 3px rgba(253, 224, 71, 0.98),
        0 0 26px rgba(245, 158, 11, 0.92),
        inset 0 0 16px rgba(254, 240, 138, 0.65);
      transform: scale(1.04);
    }
  }

  #sculpted-slot-q.is-ult-ready {
    animation: shUltReadyPulse 1.6s ease-in-out infinite;
  }

  /* Mode B Main Divine Blessing / Resurrection Ready Halo on [R] */
  @keyframes shMiracleHaloPulse {
    0%, 100% {
      border-color: #fde047;
      box-shadow:
        0 0 0 2.5px rgba(251, 191, 36, 0.92),
        0 0 20px rgba(244, 63, 94, 0.75),
        0 0 34px rgba(251, 191, 36, 0.55);
    }
    50% {
      border-color: #fda4af;
      box-shadow:
        0 0 0 4px rgba(244, 63, 94, 0.95),
        0 0 28px rgba(251, 191, 36, 0.92),
        0 0 44px rgba(244, 63, 94, 0.72);
    }
  }

  #sculpted-commune-btn.commune-miracle-ready {
    animation: shMiracleHaloPulse 1.5s ease-in-out infinite;
  }

  /* Hide All Combat Controls & Joystick While Communing ([R] Active) or Verdict Cutscene */
  #sculpted-action-cluster,
  #sculpted-powers-dock,
  #sculpted-joystick-zone,
  #sculpted-commune-wrap {
    transition: opacity 0.22s ease, transform 0.22s ease;
  }

  #sculpted-hud-root.is-communing #sculpted-action-cluster,
  #sculpted-hud-root.is-communing #sculpted-powers-dock,
  #sculpted-hud-root.is-communing #sculpted-joystick-zone,
  #sculpted-hud-root.is-communing #sculpted-action-cluster .sh-open-ring,
  #sculpted-hud-root.is-communing #sculpted-powers-dock .sh-open-ring {
    opacity: 0 !important;
    pointer-events: none !important;
  }

  #sculpted-hud-root.is-verdict-cutscene #sculpted-commune-wrap {
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px);
  }

  /* Inline Crimson Wave Bars + Timer inside Commune [R] when Listening */
  .sh-commune-idle-content {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .sh-commune-live-content {
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }

  #sculpted-commune-wrap.is-listening #sculpted-commune-btn {
    border-color: #fda4af;
    box-shadow: 0 0 0 2px rgba(244, 63, 94, 0.75), 0 4px 16px rgba(244, 63, 94, 0.45);
  }

  @keyframes shCommuneJudgingPulse {
    0%, 100% {
      border-color: rgba(253, 224, 71, 0.86);
      box-shadow:
        inset 0 0 0 2.5px rgba(254, 240, 138, 0.34),
        0 0 0 2px rgba(250, 204, 21, 0.45),
        0 0 18px rgba(244, 63, 94, 0.45),
        0 0 28px rgba(251, 191, 36, 0.42);
      transform: scale(1);
    }
    50% {
      border-color: #fda4af;
      box-shadow:
        inset 0 0 0 2.5px rgba(253, 224, 71, 0.56),
        0 0 0 4px rgba(251, 191, 36, 0.72),
        0 0 26px rgba(244, 63, 94, 0.64),
        0 0 38px rgba(251, 191, 36, 0.65);
      transform: scale(1.045);
    }
  }

  #sculpted-commune-wrap.is-judging #sculpted-commune-btn {
    animation: shCommuneJudgingPulse 1.35s ease-in-out infinite;
  }

  #sculpted-commune-wrap.is-speaking #sculpted-commune-btn {
    border-color: #fde047;
    box-shadow:
      inset 0 0 0 2.5px rgba(254, 249, 195, 0.45),
      0 0 0 3px rgba(250, 204, 21, 0.82),
      0 0 24px rgba(250, 204, 21, 0.78);
  }

  #sculpted-commune-wrap.is-listening .sh-commune-idle-content {
    display: none;
  }

  #sculpted-commune-wrap.is-listening .sh-commune-live-content {
    display: inline-flex;
  }

  .sh-commune-wave-group {
    display: inline-flex;
    align-items: center;
    gap: 2.5px;
    height: 18px;
  }

  .sh-wave-bar {
    width: 2.5px;
    height: 3px;
    border-radius: 999px;
    background: #ffffff;
    transition: height 45ms linear;
  }

  .sh-listening-timer {
    font-family: var(--hud-font-sans);
    font-variant-numeric: tabular-nums;
    font-size: 0.74rem;
    font-weight: 800;
    line-height: 1;
    color: #ffffff;
  }

  #sculpted-partner-commune-tag {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(252, 249, 242, 0.94);
    border: 1.5px solid #f43f5e;
    font-size: 0.75rem;
    font-weight: 700;
    color: #9f1239;
    white-space: nowrap;
    pointer-events: none;
    display: none;
  }

  #sculpted-commune-btn.is-partner-communing #sculpted-partner-commune-tag {
    display: inline-flex;
  }

  /* ----------------------------------------------------------------------- */
  /* 6. Light Warm-Stone Pause Modal (#sculpted-pause-modal)                 */
  /* ----------------------------------------------------------------------- */
  .sh-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    pointer-events: auto;
    background: rgba(15, 23, 42, 0.32);
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
    overscroll-behavior: contain;
  }

  .sh-modal-backdrop.is-open {
    display: flex;
  }

  .sh-modal-tablet {
    position: relative;
    width: min(440px, 90vw);
    max-height: calc(100dvh - 28px);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(154, 107, 22, 0.35) transparent;
    padding: 24px 26px;
    border-radius: 20px;
    border: 1.5px solid #dcd0bc;
    background: rgba(252, 249, 242, 0.96);
    box-shadow:
      inset 0 1px 0 #ffffff,
      0 16px 36px rgba(24, 20, 14, 0.22);
    color: #1f1c18;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
  }

  .sh-modal-tablet::-webkit-scrollbar {
    width: 6px;
  }

  .sh-modal-tablet::-webkit-scrollbar-track {
    background: transparent;
  }

  .sh-modal-tablet::-webkit-scrollbar-thumb {
    background: rgba(154, 107, 22, 0.35);
    border-radius: 999px;
  }

  .sh-pause-room-card {
    width: 100%;
    padding: 11px 14px;
    border-radius: 14px;
    border: 1.25px solid #d6c7ae;
    background: #f6f0e3;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
  }

  .sh-pause-room-phrase {
    font-family: var(--hud-font-sans);
    font-size: 0.98rem;
    font-weight: 700;
    color: #1f1c18;
    line-height: 1.25;
    word-break: break-word;
  }

  .sh-pause-room-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 0.76rem;
    color: #5c5346;
  }

  .sh-pause-room-code {
    padding: 2px 9px;
    border-radius: 999px;
    background: rgba(31, 28, 24, 0.07);
    border: 1px solid rgba(180, 158, 124, 0.45);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #3a3228;
  }

  .sh-pause-room-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
    color: #5c5346;
  }

  .sh-pause-room-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #a89984;
  }

  .sh-pause-room-status-dot.is-linked {
    background: #10b981;
  }

  .sh-pause-room-status.is-linked {
    color: #047857;
  }

  .sh-modal-title {
    font-family: var(--hud-font-sans);
    font-size: 1.42rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
    color: #1f1c18;
    margin: 0;
  }

  .sh-stat-lbl {
    font-family: var(--hud-font-sans);
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #5c5346;
  }

  .sh-pill-group {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .sh-choice-pill,
  .sh-modal-close-btn {
    appearance: none;
    cursor: pointer;
    padding: 7px 14px;
    border-radius: 999px;
    border: 1.5px solid #c8b79a;
    background: #f3ede0;
    color: #1f1c18;
    font-family: var(--hud-font-sans);
    font-size: 0.9rem;
    font-weight: 600;
    -webkit-tap-highlight-color: transparent;
    transition: transform 140ms ease-out, border-color 140ms ease-out, background-color 140ms ease-out;
  }

  .sh-choice-pill.is-selected,
  .sh-choice-pill[aria-pressed="true"] {
    border-color: #1f1c18;
    background: #1f1c18;
    color: #fdfbf7;
    font-weight: 700;
  }

  .sh-modal-close-btn {
    min-width: 140px;
    min-height: 40px;
    background: #1f1c18;
    color: #fdfbf7;
    border-color: #1f1c18;
    font-weight: 700;
  }

  /* ----------------------------------------------------------------------- */
  /* 7. Screen-Edge Damage Vignette & Top-Left HP Bar Impact Shake           */
  /* ----------------------------------------------------------------------- */
  #sculpted-damage-vignette {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 26;
    opacity: 0;
    background: radial-gradient(
      ellipse at center,
      rgba(225, 29, 72, 0) 48%,
      rgba(225, 29, 72, 0.34) 84%,
      rgba(159, 18, 57, 0.68) 100%
    );
    transition: opacity 220ms ease-out;
  }

  #sculpted-damage-vignette.is-blocked {
    background: radial-gradient(
      ellipse at center,
      rgba(56, 189, 248, 0) 56%,
      rgba(56, 189, 248, 0.24) 88%,
      rgba(14, 165, 233, 0.46) 100%
    );
  }

  #sculpted-damage-vignette.is-active {
    opacity: 1;
    transition: opacity 40ms ease-out;
  }

  @keyframes shDamageShake {
    0% { transform: translate3d(0, 0, 0); }
    20% { transform: translate3d(-6px, 2px, 0); }
    45% { transform: translate3d(5px, -2px, 0); }
    70% { transform: translate3d(-3px, 1px, 0); }
    100% { transform: translate3d(0, 0, 0); }
  }

  .sh-life-row.is-damaged-shake {
    animation: shDamageShake 240ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
  }

  .sh-life-row.is-damaged-shake .sh-hp-channel {
    box-shadow: 0 0 0 2px rgba(244, 63, 94, 0.95), 0 0 14px rgba(225, 29, 72, 0.65);
  }

  /* ----------------------------------------------------------------------- */
  /* 8. Tasteful Top-Left Health Rising Animation (Bar Sheen + Emblem Breath) */
  /* ----------------------------------------------------------------------- */
  .sh-hp-channel::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      108deg,
      rgba(254, 249, 195, 0) 20%,
      rgba(254, 249, 195, 0.68) 48%,
      rgba(255, 255, 255, 0.92) 52%,
      rgba(253, 224, 71, 0.48) 58%,
      rgba(253, 224, 71, 0) 82%
    );
    transform: translate3d(-120%, 0, 0);
    opacity: 0;
    pointer-events: none;
    z-index: 4;
  }

  @keyframes shHealLightSweep {
    0% {
      opacity: 0;
      transform: translate3d(-120%, 0, 0);
    }
    18% {
      opacity: 0.95;
    }
    76% {
      opacity: 0.85;
    }
    100% {
      opacity: 0;
      transform: translate3d(125%, 0, 0);
    }
  }

  @keyframes shHealChannelGlow {
    0% {
      border-color: rgba(255, 255, 255, 0.78);
    }
    30% {
      border-color: rgba(254, 240, 138, 0.96);
      box-shadow: 0 0 10px rgba(250, 204, 21, 0.42), 0 2px 6px rgba(15, 23, 42, 0.25);
    }
    100% {
      border-color: rgba(255, 255, 255, 0.78);
    }
  }

  @keyframes shHealNumberGlow {
    0%, 100% {
      color: rgba(255, 255, 255, 0.92);
      text-shadow: 0 1px 3px rgba(15, 23, 42, 0.75);
    }
    28% {
      color: #fef9c3;
      text-shadow: 0 0 8px rgba(250, 204, 21, 0.65), 0 1px 3px rgba(15, 23, 42, 0.72);
    }
  }

  @keyframes shHealRingBreath {
    0% {
      box-shadow: 0 0 0 0px rgba(254, 240, 138, 0.78), 0 3px 10px rgba(15, 23, 42, 0.25);
      transform: scale(1);
    }
    35% {
      transform: scale(1.045);
    }
    100% {
      box-shadow: 0 0 0 12px rgba(254, 240, 138, 0), 0 3px 10px rgba(15, 23, 42, 0.25);
      transform: scale(1);
    }
  }

  .sh-life-row.is-healed-pulse .sh-hp-num-inline {
    animation: shHealNumberGlow 820ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .sh-life-row.is-healed-pulse .sh-hp-channel {
    animation: shHealChannelGlow 820ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .sh-life-row.is-healed-pulse .sh-hp-channel::after {
    animation: shHealLightSweep 820ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .sh-life-row.is-healed-pulse .sh-emblem-ring {
    animation: shHealRingBreath 740ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    #sculpted-commune-wrap.is-judging #sculpted-commune-btn,
    .sh-life-row.is-healed-pulse .sh-hp-num-inline,
    .sh-life-row.is-healed-pulse .sh-hp-channel,
    .sh-life-row.is-healed-pulse .sh-hp-channel::after,
    .sh-life-row.is-healed-pulse .sh-emblem-ring {
      animation: none;
    }
  }
`;

/**
 * Creates the Amarante Genshin-Inspired Translucent HUD & Two-Handed Xiaomi Pad 7 Arc.
 */
export function createSculptedHud({
  container = null,
  initialProfile = 'desktop',
  initialRole = 'Knight',
  onAction = null,
  onAimStart = null,
  onAimMove = null,
  onAimRelease = null,
  onToggleElement = null,
  onCommuneToggle = null,
  onSelectTimeOfDay = null,
  onSelectProfile = null,
  onSwapHero = null,
  onCameraOrbit = null,
  onDevUnlockNextStage = null,
  onUiSfx = null,
  onCopyRoomInvite = null,
  onEditRoomCode = null,
  onChangeCameraSensitivity = null,
} = {}) {
  let styleEl = document.getElementById('sculpted-hud-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'sculpted-hud-styles';
    styleEl.textContent = SCULPTED_HUD_CSS;
    document.head.appendChild(styleEl);
  } else {
    styleEl.textContent = SCULPTED_HUD_CSS;
  }

  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('sculpted-hud-mounted');
  }

  const state = {
    activeRole: initialRole === 'Mage' ? 'Mage' : 'Knight',
    peerConnected: false,
    roomCode: 'LOVE',
    roomPhrase: 'LOVE',
    shareUrl: '',
    cameraSensitivity: 'high',
    activeElement: 'ice', // 'ice' | 'fire' queued element
    activeSwordBuffElement: null, // decoupled active Knight sword buff ('ice' | 'fire' | null)
    communeDiscovered: false,
    iceUnlocked: false,
    fireUnlocked: false,
    ultimateUnlocked: false,
    tabSwitchHintDismissed: false,
    unlockedStage: 0,
    stonesSolved: 0,
    profile: initialProfile === 'tablet' ? 'tablet' : 'desktop',
    timeOfDay: 'day',
    envPolarity: 'day',
    playerNames: {
      Knight: 'Knight',
      Mage: 'Mage',
    },
    commune: {
      listening: false,
      judging: false,
      speaking: false,
      partnerListening: false,
      elapsedSeconds: 0,
      maxSeconds: 30,
      micRms: 0,
      micBands: [0, 0, 0, 0, 0],
    },
    communeChannelActive: false,
    verdictSequenceActive: false,
    miracleReady: null,
    partnerDistance: 2.0,
    qEnergyPct: null,
    stats: {
      Knight: { level: 1, hp: 220, maxHp: 220, shield: 0, downed: false },
      Mage: { level: 1, hp: 90, maxHp: 90, shield: 0, downed: false },
    },
    cooldowns: {
      E: 0,
      Q: 0,
      eBuffRemaining: 0,
    },
  };

  const root = document.createElement('div');
  root.id = 'sculpted-hud-root';

  root.innerHTML = `
    <div id="sculpted-damage-vignette" aria-hidden="true"></div>
    <!-- 1. TOP-LEFT: Genshin-Style Party Strip (Authentic Chibi Bust Portrait + Floating White Name + HP Bar) -->
    <div id="sculpted-party-bars" role="region" aria-label="Party Status">
      <div class="sh-life-row is-leader" id="sh-life-row-primary" data-role="Knight" title="Click to swap hero in solo mode">
        <div class="sh-emblem-ring" id="sh-emblem-primary" data-role-emblem="Knight" aria-hidden="true">
          ${SVG_ROLE_KNIGHT_EMBLEM}
        </div>
        <div class="sh-party-meta">
          <div class="sh-name-and-hp-row">
            <span class="sh-player-name-lbl" id="sh-name-primary">Knight</span>
            <span class="sh-hp-num-inline" id="sh-hp-num-primary">220 / 220</span>
          </div>
          <div class="sh-hp-bar-wrap">
            <div class="sh-hp-channel">
              <div class="sh-hp-heal-preview" id="sh-hp-heal-primary"></div>
              <div class="sh-hp-fill" id="sh-hp-fill-primary"></div>
              <div class="sh-shield-fill" id="sh-shield-fill-primary"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="sh-life-row" id="sh-life-row-partner" data-role="Mage" data-partner-role="Mage" title="Click to swap hero in solo mode">
        <div id="sculpted-partner-row" data-role="Mage" data-partner-role="Mage" style="display:contents">
          <div class="sh-emblem-ring" id="sh-emblem-partner" data-role-emblem="Mage" aria-hidden="true">
            ${SVG_ROLE_MAGE_EMBLEM}
          </div>
          <div class="sh-party-meta">
            <div class="sh-name-and-hp-row">
              <span class="sh-player-name-lbl" id="sh-name-partner">Mage</span>
              <span class="sh-hp-num-inline" id="sh-hp-num-partner">90 / 90</span>
            </div>
            <div class="sh-hp-bar-wrap">
              <div class="sh-hp-channel">
                <div class="sh-hp-heal-preview" id="sh-hp-heal-partner"></div>
                <div class="sh-hp-fill" id="sh-hp-fill-partner"></div>
                <div class="sh-shield-fill" id="sh-shield-fill-partner"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. BOTTOM-CENTER: Hidden (No duplicate health bar at bottom!) -->
    <div id="sculpted-vitality-bar" role="status" aria-hidden="true">
      <span class="sh-vitality-numbers" id="sculpted-vitality-text">220 / 220</span>
      <div class="sh-vitality-track">
        <div class="sh-hp-fill" id="sculpted-vitality-hp-fill"></div>
        <div class="sh-shield-fill" id="sculpted-vitality-shield-fill"></div>
      </div>
    </div>

    <!-- 3. TOP-RIGHT: Co-Op Room Badge + Minimal Translucent Fullscreen & Pause Rings -->
    <button
      type="button"
      id="sculpted-room-badge"
      data-room-badge="true"
      aria-label="Co-Op Room LOVE, click to copy invite link"
      title="Room: LOVE - Copy Invite"
    >
      <span class="sh-room-dot" id="sculpted-room-dot" aria-hidden="true"></span>
      <span class="sh-room-badge-text" id="sculpted-room-badge-text">Room: LOVE</span>
    </button>

    <button
      type="button"
      class="sh-open-ring"
      id="sculpted-fullscreen-btn"
      aria-label="Toggle Fullscreen Landscape"
      title="Fullscreen"
    >
      <svg class="sh-fullscreen-svg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
      </svg>
    </button>

    <button
      type="button"
      class="sh-open-ring"
      id="sculpted-pause-btn"
      aria-label="Pause and Settings"
      title="Pause (Esc)"
    >
      <span class="sh-pause-bars" aria-hidden="true">
        <span></span>
        <span></span>
      </span>
    </button>

    <!-- 4. LEFT HAND: Floating Movement Thumbstick (Tablet Only), Center Swipe-to-Dodge & Right Orbit Zone -->
    <div id="sculpted-joystick-zone">
      <div class="sh-joy-ring" id="sh-joy-ring">
        <div class="sh-joy-puck" id="sh-joy-puck"></div>
      </div>
    </div>

    <div id="sculpted-center-dodge-zone" title="Swipe in any direction on your character to dodge">
      <div id="sculpted-dodge-aid-ring" aria-hidden="true"></div>
    </div>
    <div id="sculpted-dodge-ripple" aria-hidden="true"></div>

    <div id="sculpted-orbit-zone"></div>

    <!-- 5. AWAKENED POWERS: Left-Side [Tab] Switch (~30vh) + Bottom-Right [E] & [Q] with Vertical Fill -->
    <div id="sculpted-powers-dock" role="toolbar" aria-label="Awakened Powers">
      <!-- [Tab] Simple Element Switch on Left Side (~30% down from top) -->
      <button
        type="button"
        class="sh-open-ring sh-power-slot"
        id="sculpted-slot-tab"
        data-power-slot="Tab"
        data-element="ice"
        aria-label="Switch Ice and Fire Element (Tab)"
        title="Switch Element (Tab)"
      >
        <span id="sculpted-tab-caption">Tab to switch</span>
        <span id="sculpted-slot-tab-label">${SVG_TAB_SWAP_GLYPH}</span>
        <span class="sh-keycap-badge">Tab</span>
      </button>

      <!-- [C] Elemental Skill Ring (Colored Vertical Fill Up & Down) -->
      <button
        type="button"
        class="sh-open-ring sh-power-slot"
        id="sculpted-slot-e"
        data-power-slot="E"
        data-element="ice"
        aria-label="Elemental Skill C"
        title="Elemental Skill (C)"
      >
        <span class="sh-ring-clip"><span class="sh-vertical-fill" id="sh-fill-e"></span></span>
        <span id="sculpted-slot-e-icon">${SVG_ICE_CRYSTAL_GLYPH}</span>
        <span class="sh-slot-cd-badge" id="sculpted-slot-e-cd"></span>
        <span class="sh-keycap-badge">C</span>
      </button>

      <!-- [Q] Elemental Burst Ultimate Ring (Colored Vertical Fill Up & Down) -->
      <button
        type="button"
        class="sh-open-ring sh-power-slot"
        id="sculpted-slot-q"
        data-power-slot="Q"
        aria-label="Personal Ultimate Q"
        title="Ultimate Awakening (Q)"
      >
        <span class="sh-ring-clip"><span class="sh-vertical-fill" id="sh-fill-q"></span></span>
        ${SVG_ULTIMATE_STORM_VORTEX}
        <span class="sh-slot-cd-badge" id="sculpted-slot-q-cd"></span>
        <span class="sh-keycap-badge">Q</span>
      </button>
    </div>

    <!-- 6. RIGHT HAND GADGET SLOT: Commune [V] Ring (Colored Vertical Fill) -->
    <div id="sculpted-commune-wrap">
      <button
        type="button"
        class="sh-open-ring"
        id="sculpted-commune-btn"
        aria-label="Commune with the God of Love (V)"
        title="Tap or hold V to Commune"
      >
        <span class="sh-ring-clip"><span class="sh-vertical-fill" id="sh-fill-r"></span></span>
        <span id="sculpted-partner-commune-tag">Partner is communing</span>
        <span class="sh-commune-idle-content">
          ${SVG_SACRED_LOTUS}
        </span>
        <span class="sh-commune-live-content" id="sculpted-commune-listening-bar" role="status" aria-live="polite">
          <span class="sh-commune-wave-group" aria-hidden="true">
            <span class="sh-wave-bar"></span>
            <span class="sh-wave-bar"></span>
            <span class="sh-wave-bar"></span>
            <span class="sh-wave-bar"></span>
            <span class="sh-wave-bar"></span>
          </span>
          <span class="sh-listening-timer" id="sculpted-commune-timer">00:24</span>
        </span>
        <span class="sh-keycap-badge">V</span>
      </button>
    </div>

    <!-- 7. RIGHT HAND GENSHIN ACTION CLUSTER: Attack, Dash, Jump Circles -->
    <div id="sculpted-action-cluster" role="group" aria-label="Combat Actions">
      <button
        type="button"
        class="sh-open-ring"
        id="sculpted-attack-btn"
        data-action="attack"
        aria-label="Attack or Hold for Secondary"
      >
        <span id="sculpted-attack-icon-slot">${SVG_ATTACK_SWORD}</span>
        <span class="sh-keycap-badge">LMB</span>
      </button>

      <button
        type="button"
        class="sh-open-ring"
        id="sculpted-dash-btn"
        data-action="dash"
        aria-label="Evade Dodge (Double-tap A, S, D)"
      >
        ${SVG_DASH_GLYPH}
        <span class="sh-keycap-badge" style="font-size: 0.58rem; white-space: nowrap;">2×A/S/D</span>
      </button>

      <button
        type="button"
        class="sh-open-ring"
        id="sculpted-jump-btn"
        data-action="jump"
        aria-label="Jump"
      >
        ${SVG_JUMP_GLYPH}
        <span class="sh-keycap-badge">Space</span>
      </button>
    </div>

    <!-- 8. LIGHT WARM-STONE PAUSE POPOVER (#sculpted-pause-modal) -->
    <div
      class="sh-modal-backdrop"
      id="sculpted-pause-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sculpted-pause-title"
    >
      <div class="sh-modal-tablet">
        <h2 class="sh-modal-title" id="sculpted-pause-title">Game Paused</h2>

        <div style="width: 100%;">
          <div class="sh-stat-lbl" style="margin-bottom: 8px;">Time of Day</div>
          <div class="sh-pill-group" id="sculpted-tod-group">
            <button type="button" class="sh-choice-pill is-selected" data-tod-choice="day" aria-pressed="true">Morning</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="evening" aria-pressed="false">Golden Hour</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="twilight" aria-pressed="false">Twilight</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="night" aria-pressed="false">Starlit Night</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="auto" aria-pressed="false">Auto</button>
          </div>
        </div>

        <div style="width: 100%;">
          <div class="sh-stat-lbl" style="margin-bottom: 8px;">Device Layout</div>
          <div class="sh-pill-group" id="sculpted-profile-group">
            <button type="button" class="sh-choice-pill is-selected" data-profile-choice="desktop" aria-pressed="true">
              Desktop PC
            </button>
            <button type="button" class="sh-choice-pill" data-profile-choice="tablet" aria-pressed="false">
              Tablet Touch
            </button>
          </div>
        </div>

        <div style="width: 100%;">
          <div class="sh-stat-lbl" style="margin-bottom: 8px;">Camera Sensitivity</div>
          <div class="sh-pill-group" id="sculpted-cam-sens-group">
            <button type="button" class="sh-choice-pill" data-camera-sens="low" aria-pressed="false">Gentle</button>
            <button type="button" class="sh-choice-pill" data-camera-sens="medium" aria-pressed="false">Balanced</button>
            <button type="button" class="sh-choice-pill is-selected" data-camera-sens="high" aria-pressed="true">Crisp</button>
          </div>
        </div>

        <div style="width: 100%;">
          <div class="sh-stat-lbl" style="margin-bottom: 8px;">Co-Op Room</div>
          <div class="sh-pause-room-card" id="sculpted-pause-room-card">
            <div class="sh-pause-room-phrase" id="sculpted-pause-room-phrase">LOVE</div>
            <div class="sh-pause-room-meta">
              <span class="sh-pause-room-code" id="sculpted-pause-room-code">LOVE</span>
              <span class="sh-pause-room-status" id="sculpted-pause-room-status">
                <span class="sh-pause-room-status-dot" id="sculpted-pause-room-status-dot" aria-hidden="true"></span>
                <span id="sculpted-pause-room-status-text">Wingman AI</span>
              </span>
            </div>
            <div class="sh-pill-group">
              <button type="button" class="sh-choice-pill" id="sculpted-pause-copy-room-btn" data-copy-room="true">Copy Invite Link</button>
              <button type="button" class="sh-choice-pill" id="sculpted-pause-edit-room-btn">Change</button>
            </div>
          </div>
        </div>

        <div class="sh-pill-group" style="margin-top: 4px;">
          <button type="button" class="sh-choice-pill" id="sculpted-pause-swap-btn">
            Swap Hero
          </button>
          <!-- DEV_SOLO_TEST_REMOVE_FOR_PROD -->
          <button
            type="button"
            class="sh-choice-pill"
            id="sculpted-pause-dev-stage-btn"
            style="${typeof window !== 'undefined' && (new URLSearchParams(window.location?.search || '').has('debug') || new URLSearchParams(window.location?.search || '').has('nolobby')) ? '' : 'display:none;'}"
            title="Unlock next power stage for solo testing"
          >
            Dev: Unlock Next Power
          </button>
          <button type="button" class="sh-modal-close-btn" id="sculpted-pause-resume-btn">
            Resume
          </button>
        </div>
      </div>
    </div>
  `;

  const mountTarget = container || document.getElementById('hud') || document.body;
  mountTarget.appendChild(root);

  // Cache DOM references
  const primaryRowEl = root.querySelector('#sh-life-row-primary');
  const partnerRowEl = root.querySelector('#sh-life-row-partner');
  const partnerRowAliasEl = root.querySelector('#sculpted-partner-row');
  const primaryEmblemEl = root.querySelector('#sh-emblem-primary');
  const partnerEmblemEl = root.querySelector('#sh-emblem-partner');
  const primaryNameEl = root.querySelector('#sh-name-primary');
  const partnerNameEl = root.querySelector('#sh-name-partner');
  const primaryHpNumEl = root.querySelector('#sh-hp-num-primary');
  const partnerHpNumEl = root.querySelector('#sh-hp-num-partner');
  const primaryHpHealPreview = root.querySelector('#sh-hp-heal-primary');
  const primaryHpFill = root.querySelector('#sh-hp-fill-primary');
  const primaryShieldFill = root.querySelector('#sh-shield-fill-primary');
  const partnerHpHealPreview = root.querySelector('#sh-hp-heal-partner');
  const partnerHpFill = root.querySelector('#sh-hp-fill-partner');
  const partnerShieldFill = root.querySelector('#sh-shield-fill-partner');

  const vitalityBar = root.querySelector('#sculpted-vitality-bar');
  const vitalityText = root.querySelector('#sculpted-vitality-text');
  const vitalityHpFill = root.querySelector('#sculpted-vitality-hp-fill');
  const vitalityShieldFill = root.querySelector('#sculpted-vitality-shield-fill');

  const roomBadgeEl = root.querySelector('#sculpted-room-badge');
  const roomBadgeTextEl = root.querySelector('#sculpted-room-badge-text');
  const pauseBtn = root.querySelector('#sculpted-pause-btn');
  const joyZone = root.querySelector('#sculpted-joystick-zone');
  const joyRing = root.querySelector('#sh-joy-ring');
  const joyPuck = root.querySelector('#sh-joy-puck');
  const orbitZone = root.querySelector('#sculpted-orbit-zone');

  const slotE = root.querySelector('#sculpted-slot-e');
  const slotEIcon = root.querySelector('#sculpted-slot-e-icon');
  const slotECd = root.querySelector('#sculpted-slot-e-cd');
  const fillE = root.querySelector('#sh-fill-e');
  const slotTab = root.querySelector('#sculpted-slot-tab');
  const tabCaption = root.querySelector('#sculpted-tab-caption');
  const slotQ = root.querySelector('#sculpted-slot-q');
  const slotQCd = root.querySelector('#sculpted-slot-q-cd');
  const fillQ = root.querySelector('#sh-fill-q');

  const communeWrap = root.querySelector('#sculpted-commune-wrap');
  const communeBtn = root.querySelector('#sculpted-commune-btn');
  const communeTimerEl = root.querySelector('#sculpted-commune-timer');
  const fillR = root.querySelector('#sh-fill-r');
  const waveBarEls = Array.from(root.querySelectorAll('#sculpted-commune-btn .sh-wave-bar'));

  const attackBtn = root.querySelector('#sculpted-attack-btn');
  const attackIconSlot = root.querySelector('#sculpted-attack-icon-slot');
  const dashBtn = root.querySelector('#sculpted-dash-btn');
  const jumpBtn = root.querySelector('#sculpted-jump-btn');

  const pauseModal = root.querySelector('#sculpted-pause-modal');
  const pauseRoomPhraseEl = root.querySelector('#sculpted-pause-room-phrase');
  const pauseRoomCodeEl = root.querySelector('#sculpted-pause-room-code');
  const pauseRoomStatusEl = root.querySelector('#sculpted-pause-room-status');
  const pauseRoomStatusDotEl = root.querySelector('#sculpted-pause-room-status-dot');
  const pauseRoomStatusTextEl = root.querySelector('#sculpted-pause-room-status-text');
  const pauseCopyRoomBtn = root.querySelector('#sculpted-pause-copy-room-btn');
  const pauseEditRoomBtn = root.querySelector('#sculpted-pause-edit-room-btn');
  const pauseSwapBtn = root.querySelector('#sculpted-pause-swap-btn');
  const pauseDevStageBtn = root.querySelector('#sculpted-pause-dev-stage-btn');
  const pauseResumeBtn = root.querySelector('#sculpted-pause-resume-btn');

  let lastFocusedBeforePause = null;

  /* ----------------------------------------------------------------------- */
  /* Environment-Adaptive Ink Polarity Synchronizer                          */
  /* ----------------------------------------------------------------------- */

  function syncEnvironmentPolarity() {
    let polarity = 'day';
    if (state.commune.listening || state.commune.partnerListening || state.envPolarityOverride === 'eclipse') {
      polarity = 'eclipse';
    } else if (state.envPolarityOverride) {
      polarity = state.envPolarityOverride;
    } else if (state.timeOfDay === 'evening') {
      polarity = 'golden';
    } else if (state.timeOfDay === 'night' || state.timeOfDay === 'twilight') {
      polarity = 'night';
    }
    state.envPolarity = polarity;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.envPolarity = polarity;
    }
    root.dataset.envPolarity = polarity;
  }

  function setEnvironmentPolarity(polarity) {
    if (['day', 'golden', 'night', 'eclipse'].includes(polarity)) {
      state.envPolarityOverride = polarity;
      state.envPolarity = polarity;
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.dataset.envPolarity = polarity;
      }
      root.dataset.envPolarity = polarity;
    } else if (polarity === null) {
      state.envPolarityOverride = null;
      syncEnvironmentPolarity();
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Render Synchronizers (Including Genshin Vertical Fill Up & Down)        */
  /* ----------------------------------------------------------------------- */

  const displayedHpBySlot = { primary: null, partner: null };
  const hpTweenRafBySlot = { primary: null, partner: null };
  const lastRoleHp = { Knight: null, Mage: null };

  function renderHpNumberFormatted(el, hpVal, maxHpInt, shInt, showShield) {
    if (!el) return;
    const hpInt = Math.max(0, Math.round(hpVal));
    el.textContent = showShield && shInt > 0 ? `${hpInt}+${shInt}/${maxHpInt}` : `${hpInt}/${maxHpInt}`;
  }

  function animateHpCounter(slot, el, fromHp, toHp, maxHpInt, shInt, showShield) {
    if (!el) return;
    if (hpTweenRafBySlot[slot] !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(hpTweenRafBySlot[slot]);
      hpTweenRafBySlot[slot] = null;
    }
    if (
      typeof requestAnimationFrame !== 'function' ||
      typeof performance === 'undefined' ||
      toHp <= fromHp
    ) {
      displayedHpBySlot[slot] = toHp;
      renderHpNumberFormatted(el, toHp, maxHpInt, shInt, showShield);
      return;
    }
    const startT = performance.now();
    const durMs = 580;
    const step = (now) => {
      const p = clamp((now - startT) / durMs, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = fromHp + (toHp - fromHp) * eased;
      displayedHpBySlot[slot] = cur;
      renderHpNumberFormatted(el, cur, maxHpInt, shInt, showShield);
      if (p < 1) {
        hpTweenRafBySlot[slot] = requestAnimationFrame(step);
      } else {
        hpTweenRafBySlot[slot] = null;
        displayedHpBySlot[slot] = toHp;
        renderHpNumberFormatted(el, toHp, maxHpInt, shInt, showShield);
      }
    };
    hpTweenRafBySlot[slot] = requestAnimationFrame(step);
  }

  function renderRoleAndPartyBars() {
    const isKnightLeader = state.activeRole !== 'Mage';
    const primaryRole = isKnightLeader ? 'Knight' : 'Mage';
    const partnerRole = isKnightLeader ? 'Mage' : 'Knight';

    root.dataset.role = primaryRole;
    if (primaryRowEl) {
      primaryRowEl.dataset.role = primaryRole;
    }
    if (partnerRowEl) {
      partnerRowEl.dataset.role = partnerRole;
      partnerRowEl.dataset.partnerRole = partnerRole;
    }
    if (partnerRowAliasEl) {
      partnerRowAliasEl.dataset.role = partnerRole;
      partnerRowAliasEl.dataset.partnerRole = partnerRole;
    }

    if (primaryEmblemEl) {
      primaryEmblemEl.dataset.roleEmblem = primaryRole;
      primaryEmblemEl.innerHTML =
        primaryRole === 'Knight' ? SVG_ROLE_KNIGHT_EMBLEM : SVG_ROLE_MAGE_EMBLEM;
    }
    if (partnerEmblemEl) {
      partnerEmblemEl.dataset.roleEmblem = partnerRole;
      partnerEmblemEl.innerHTML =
        partnerRole === 'Knight' ? SVG_ROLE_KNIGHT_EMBLEM : SVG_ROLE_MAGE_EMBLEM;
    }

    if (primaryNameEl) {
      primaryNameEl.textContent = state.playerNames[primaryRole] || primaryRole;
    }
    if (partnerNameEl) {
      partnerNameEl.textContent = state.playerNames[partnerRole] || partnerRole;
    }

    const pStat = state.stats[primaryRole] || { hp: 100, maxHp: 100, shield: 0 };
    const sStat = state.stats[partnerRole] || { hp: 100, maxHp: 100, shield: 0 };

    const pPct = clamp((pStat.hp / Math.max(1, pStat.maxHp)) * 100, 0, 100);
    const pShieldPct = clamp((pStat.shield / Math.max(1, pStat.maxHp)) * 100, 0, 100);
    if (primaryHpHealPreview) {
      primaryHpHealPreview.style.width = `${pPct.toFixed(1)}%`;
    }
    if (primaryHpFill) {
      primaryHpFill.style.width = `${pPct.toFixed(1)}%`;
      primaryHpFill.classList.toggle('is-low', pPct < 32);
    }
    if (primaryShieldFill) {
      primaryShieldFill.style.width = `${pShieldPct.toFixed(1)}%`;
    }
    if (primaryHpNumEl) {
      const hpInt = Math.max(0, Math.round(pStat.hp));
      const maxHpInt = Math.max(1, Math.round(pStat.maxHp));
      const shInt = Math.max(0, Math.round(pStat.shield || 0));
      const prevDisp = displayedHpBySlot.primary;
      if (
        prevDisp !== null &&
        hpInt > prevDisp + 1 &&
        primaryRowEl?.classList.contains('is-healed-pulse')
      ) {
        animateHpCounter('primary', primaryHpNumEl, prevDisp, hpInt, maxHpInt, shInt, true);
      } else if (hpTweenRafBySlot.primary === null) {
        displayedHpBySlot.primary = hpInt;
        renderHpNumberFormatted(primaryHpNumEl, hpInt, maxHpInt, shInt, true);
      }
    }

    const sPct = clamp((sStat.hp / Math.max(1, sStat.maxHp)) * 100, 0, 100);
    const sShieldPct = clamp((sStat.shield / Math.max(1, sStat.maxHp)) * 100, 0, 100);
    if (partnerHpHealPreview) {
      partnerHpHealPreview.style.width = `${sPct.toFixed(1)}%`;
    }
    if (partnerHpFill) {
      partnerHpFill.style.width = `${sPct.toFixed(1)}%`;
      partnerHpFill.classList.toggle('is-low', sPct < 32);
    }
    if (partnerShieldFill) {
      partnerShieldFill.style.width = `${sShieldPct.toFixed(1)}%`;
    }
    if (partnerHpNumEl) {
      const sHpInt = Math.max(0, Math.round(sStat.hp));
      const sMaxHpInt = Math.max(1, Math.round(sStat.maxHp));
      const prevPartnerDisp = displayedHpBySlot.partner;
      if (
        prevPartnerDisp !== null &&
        sHpInt > prevPartnerDisp + 1 &&
        partnerRowEl?.classList.contains('is-healed-pulse')
      ) {
        animateHpCounter('partner', partnerHpNumEl, prevPartnerDisp, sHpInt, sMaxHpInt, 0, false);
      } else if (hpTweenRafBySlot.partner === null) {
        displayedHpBySlot.partner = sHpInt;
        renderHpNumberFormatted(partnerHpNumEl, sHpInt, sMaxHpInt, 0, false);
      }
    }

    // Attack Ring Glyph: Flat White Broadsword for Knight, Arcane Staff for Mage
    if (attackIconSlot) {
      attackIconSlot.innerHTML =
        primaryRole === 'Mage' ? SVG_ATTACK_STAFF : SVG_ATTACK_SWORD;
    }
  }

  function renderProgressionAndSlots() {
    const anyElementUnlocked = Boolean(
      state.iceUnlocked || state.fireUnlocked || state.unlockedStage >= 1
    );
    const bothElementsUnlocked = Boolean(
      (state.iceUnlocked && state.fireUnlocked) || state.unlockedStage >= 2
    );
    const ultUnlocked = Boolean(state.ultimateUnlocked || state.unlockedStage >= 3);

    const isCommuningNow = Boolean(
      state.communeChannelActive ||
        state.verdictSequenceActive ||
        state.commune.listening ||
        state.commune.judging ||
        state.commune.speaking ||
        state.commune.partnerListening
    );
    root.classList.toggle('is-communing', isCommuningNow);
    root.classList.toggle('is-verdict-cutscene', Boolean(state.verdictSequenceActive));
    if (isCommuningNow && joyState.active) {
      resetJoystick();
    }

    const kStat = state.stats.Knight || { hp: 220, maxHp: 220, downed: false };
    const mStat = state.stats.Mage || { hp: 90, maxHp: 90, downed: false };
    const kLowOrDown = Boolean(
      kStat.downed || kStat.hp <= 0 || kStat.hp / Math.max(1, kStat.maxHp) <= 0.35
    );
    const mLowOrDown = Boolean(
      mStat.downed || mStat.hp <= 0 || mStat.hp / Math.max(1, mStat.maxHp) <= 0.35
    );
    const computedMiracleReady =
      state.miracleReady !== null && state.miracleReady !== undefined
        ? Boolean(state.miracleReady)
        : Boolean(
            ultUnlocked &&
              (kLowOrDown || mLowOrDown) &&
              (state.partnerDistance ?? 2.0) <= 6.0 &&
              !isCommuningNow
          );

    if (communeWrap) {
      communeWrap.classList.toggle(
        'is-unlocked',
        Boolean(state.communeDiscovered || anyElementUnlocked || ultUnlocked)
      );
      communeWrap.classList.toggle('is-listening', Boolean(state.commune.listening));
      communeWrap.classList.toggle('is-judging', Boolean(state.commune.judging));
      communeWrap.classList.toggle('is-speaking', Boolean(state.commune.speaking));
    }
    if (communeBtn) {
      communeBtn.classList.toggle(
        'is-partner-communing',
        Boolean(state.commune.partnerListening && !state.commune.listening)
      );
      communeBtn.classList.toggle('commune-miracle-ready', computedMiracleReady);
    }
    if (communeTimerEl) {
      const rem = Math.max(0, state.commune.maxSeconds - state.commune.elapsedSeconds);
      communeTimerEl.textContent = formatTimerMMSS(rem);
    }
    if (fillR) {
      const rPct = state.commune.listening
        ? clamp(((state.commune.maxSeconds - state.commune.elapsedSeconds) / Math.max(1, state.commune.maxSeconds)) * 100, 0, 100)
        : 100;
      fillR.style.height = `${rPct.toFixed(1)}%`;
    }
    if (waveBarEls.length > 0) {
      const rms = Number(state.commune.micRms) || 0;
      const isReceivingSound = Boolean(state.commune.listening && rms >= 0.005);
      const fallbackMultipliers = [0.55, 0.85, 1.0, 0.80, 0.50];
      const bands = Array.isArray(state.commune.micBands) ? state.commune.micBands : [];
      const scaledRms = Math.min(1, rms * 7.5);
      for (let i = 0; i < waveBarEls.length; i++) {
        const barEl = waveBarEls[i];
        if (!barEl) continue;
        if (!isReceivingSound) {
          barEl.style.height = '3px';
        } else {
          const bandVal = Number(bands[i]);
          const fallbackVal = scaledRms * (fallbackMultipliers[i] ?? 0.5);
          const norm = clamp(
            Number.isFinite(bandVal) && bandVal > 0 ? Math.max(bandVal, fallbackVal * 0.65) : fallbackVal,
            0,
            1
          );
          const h = 3 + norm * 15;
          barEl.style.height = `${h.toFixed(1)}px`;
        }
      }
    }

    if (slotE) {
      slotE.classList.toggle('is-unlocked', anyElementUnlocked);
      slotE.dataset.element = state.activeElement;
      const eCd = Number(state.cooldowns.E) || 0;
      const maxECd = state.activeRole === 'Mage' ? 8.5 : 18.0;
      slotE.classList.toggle('on-cooldown', eCd > 0.08);
      slotE.classList.toggle(
        'is-active-buff',
        (Number(state.cooldowns.eBuffRemaining) || 0) > 0.05
      );
      if (slotECd) {
        slotECd.textContent = eCd > 0.08 ? `${eCd.toFixed(1)}s` : '';
      }
      if (fillE) {
        const eFillPct = eCd > 0.08 ? clamp((1 - eCd / maxECd) * 100, 8, 95) : 100;
        fillE.style.height = `${eFillPct.toFixed(1)}%`;
      }
    }

    if (slotEIcon) {
      slotEIcon.innerHTML =
        state.activeElement === 'fire' ? SVG_FIRE_SUNFIRE_GLYPH : SVG_ICE_CRYSTAL_GLYPH;
    }

    if (slotTab) {
      slotTab.classList.toggle('is-unlocked', bothElementsUnlocked);
      slotTab.dataset.element = state.activeElement;
      const tabActiveTextEl = slotTab.querySelector('#sh-tab-active-text');
      if (tabActiveTextEl) {
        tabActiveTextEl.textContent = state.activeElement === 'fire' ? 'Fire' : 'Ice';
      }
    }

    if (slotQ) {
      slotQ.classList.toggle('is-unlocked', ultUnlocked);
      const qCd = Number(state.cooldowns.Q) || 0;
      const maxQCd = 24.0;
      const hasDirectEnergy = typeof state.qEnergyPct === 'number' && Number.isFinite(state.qEnergyPct);
      const qFillPct = hasDirectEnergy
        ? clamp(state.qEnergyPct * 100, 0, 100)
        : qCd > 0.08
          ? clamp((1 - qCd / maxQCd) * 100, 8, 95)
          : 100;
      const isUltReady = ultUnlocked && qFillPct >= 99.5 && qCd <= 0.08;
      slotQ.classList.toggle('on-cooldown', !hasDirectEnergy && qCd > 0.08);
      slotQ.classList.toggle('is-ult-ready', isUltReady);
      if (slotQCd) {
        slotQCd.textContent = !hasDirectEnergy && qCd > 0.08 ? `${qCd.toFixed(1)}s` : '';
      }
      if (fillQ) {
        fillQ.style.height = `${qFillPct.toFixed(1)}%`;
      }
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Public Progression, Commune & Modal API                                 */
  /* ----------------------------------------------------------------------- */

  function setPlayerNames(names = {}) {
    if (typeof names.Knight === 'string' && names.Knight.trim()) {
      state.playerNames.Knight = names.Knight.trim();
    } else if (typeof names.knight === 'string' && names.knight.trim()) {
      state.playerNames.Knight = names.knight.trim();
    }
    if (typeof names.Mage === 'string' && names.Mage.trim()) {
      state.playerNames.Mage = names.Mage.trim();
    } else if (typeof names.mage === 'string' && names.mage.trim()) {
      state.playerNames.Mage = names.mage.trim();
    }
    if (typeof names.peerConnected === 'boolean') {
      state.peerConnected = names.peerConnected;
    }
    renderRoleAndPartyBars();
    renderRoomState();
  }

  let badgeCopiedTimer = null;
  let pauseCopyBtnTimer = null;

  function renderRoomState() {
    const displayPhrase = state.roomPhrase || state.roomCode || 'LOVE';
    const canonicalCode = state.roomCode || displayPhrase;
    const linked = Boolean(state.peerConnected);
    if (roomBadgeEl) {
      roomBadgeEl.classList.toggle('is-linked', linked);
      roomBadgeEl.title = `Room: ${displayPhrase} (${canonicalCode}) - Copy Invite`;
      roomBadgeEl.setAttribute(
        'aria-label',
        `Co-Op Room ${displayPhrase}, click to copy invite link`
      );
    }
    if (roomBadgeTextEl && !badgeCopiedTimer) {
      roomBadgeTextEl.textContent = `Room: ${displayPhrase}`;
    }
    if (pauseRoomPhraseEl) {
      pauseRoomPhraseEl.textContent = displayPhrase;
    }
    if (pauseRoomCodeEl) {
      pauseRoomCodeEl.textContent = canonicalCode;
    }
    if (pauseRoomStatusEl) {
      pauseRoomStatusEl.classList.toggle('is-linked', linked);
    }
    if (pauseRoomStatusDotEl) {
      pauseRoomStatusDotEl.classList.toggle('is-linked', linked);
    }
    if (pauseRoomStatusTextEl) {
      pauseRoomStatusTextEl.textContent = linked ? 'Co-Op Linked' : 'Wingman AI';
    }
  }

  function setRoomState(patch = {}) {
    if (!patch || typeof patch !== 'object') return;
    const code = patch.roomCode || patch.room;
    if (typeof code === 'string' && code.trim()) {
      state.roomCode = code.trim();
    }
    if (typeof patch.roomPhrase === 'string' && patch.roomPhrase.trim()) {
      state.roomPhrase = patch.roomPhrase.trim();
    } else if (typeof code === 'string' && code.trim()) {
      state.roomPhrase = code.trim();
    }
    if (typeof patch.shareUrl === 'string' && patch.shareUrl.trim()) {
      state.shareUrl = patch.shareUrl.trim();
    }
    if (typeof patch.peerConnected === 'boolean') {
      state.peerConnected = patch.peerConnected;
    } else if (typeof patch.connected === 'boolean') {
      state.peerConnected = patch.connected;
    }
    renderRoomState();
  }

  function setPeerConnected(connected) {
    state.peerConnected = Boolean(connected);
    renderRoomState();
  }

  function setProgressionState(patch = {}) {
    if (typeof patch.communeDiscovered === 'boolean') {
      state.communeDiscovered = patch.communeDiscovered;
    }
    if (typeof patch.unlockedStage === 'number') {
      state.unlockedStage = clamp(Math.floor(patch.unlockedStage), 0, 3);
      if (state.unlockedStage >= 1 && patch.iceUnlocked === undefined && patch.fireUnlocked === undefined) {
        state.iceUnlocked = true;
      }
      if (state.unlockedStage >= 2 && patch.fireUnlocked === undefined) {
        state.fireUnlocked = true;
      }
      if (state.unlockedStage >= 3 && patch.ultimateUnlocked === undefined) {
        state.ultimateUnlocked = true;
      }
    }
    if (typeof patch.stonesSolved === 'number') {
      state.stonesSolved = clamp(Math.floor(patch.stonesSolved), 0, 3);
    }
    if (typeof patch.iceUnlocked === 'boolean') {
      state.iceUnlocked = patch.iceUnlocked;
    } else if (typeof patch.hudVisibility?.iceUnlocked === 'boolean') {
      state.iceUnlocked = patch.hudVisibility.iceUnlocked;
    }
    if (typeof patch.fireUnlocked === 'boolean') {
      state.fireUnlocked = patch.fireUnlocked;
    } else if (typeof patch.hudVisibility?.fireUnlocked === 'boolean') {
      state.fireUnlocked = patch.hudVisibility.fireUnlocked;
    }
    if (typeof patch.ultimateUnlocked === 'boolean') {
      state.ultimateUnlocked = patch.ultimateUnlocked;
    } else if (typeof patch.hudVisibility?.ultimateUnlocked === 'boolean') {
      state.ultimateUnlocked = patch.hudVisibility.ultimateUnlocked;
    }

    if (state.fireUnlocked && !state.iceUnlocked) {
      state.activeElement = 'fire';
    } else if (state.iceUnlocked && !state.fireUnlocked) {
      state.activeElement = 'ice';
    }

    if (patch.activeElement === 'ice' || patch.activeElement === 'fire') {
      state.activeElement = patch.activeElement;
    }
    if (patch.activeRole === 'Knight' || patch.activeRole === 'Mage') {
      state.activeRole = patch.activeRole;
    }

    renderRoleAndPartyBars();
    renderProgressionAndSlots();
  }

  function setCommuneState(patch = {}) {
    if (typeof patch.listening === 'boolean') {
      state.commune.listening = patch.listening;
      if (patch.listening) {
        state.communeDiscovered = true;
      } else {
        if (patch.micRms === undefined) state.commune.micRms = 0;
        if (patch.micBands === undefined) state.commune.micBands = [0, 0, 0, 0, 0];
      }
    }
    if (typeof patch.judging === 'boolean') {
      state.commune.judging = patch.judging;
    }
    if (typeof patch.speaking === 'boolean') {
      state.commune.speaking = patch.speaking;
    }
    if (
      typeof patch.listening === 'boolean' ||
      typeof patch.judging === 'boolean' ||
      typeof patch.speaking === 'boolean'
    ) {
      state.communeChannelActive = Boolean(
        state.commune.listening || state.commune.judging || state.commune.speaking
      );
    }
    if (typeof patch.communeChannelActive === 'boolean') {
      state.communeChannelActive = patch.communeChannelActive;
    }
    if (typeof patch.isCommuning === 'boolean') {
      state.communeChannelActive = patch.isCommuning;
    }
    if (patch.verdictSequenceActive !== undefined) {
      state.verdictSequenceActive = Boolean(patch.verdictSequenceActive);
    }
    if (typeof patch.partnerListening === 'boolean') {
      state.commune.partnerListening = patch.partnerListening;
    }
    if (typeof patch.miracleReady === 'boolean') {
      state.miracleReady = patch.miracleReady;
    }
    if (typeof patch.elapsedSeconds === 'number') {
      state.commune.elapsedSeconds = clamp(patch.elapsedSeconds, 0, state.commune.maxSeconds);
    }
    if (typeof patch.maxSeconds === 'number' && patch.maxSeconds > 0) {
      state.commune.maxSeconds = patch.maxSeconds;
    }
    if (typeof patch.micRms === 'number' && Number.isFinite(patch.micRms)) {
      state.commune.micRms = clamp(patch.micRms, 0, 1);
    }
    if (Array.isArray(patch.micBands)) {
      state.commune.micBands = [0, 1, 2, 3, 4].map((i) => {
        const v = Number(patch.micBands[i]);
        return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
      });
      if (patch.micRms === undefined) {
        const avgBand =
          state.commune.micBands.reduce((acc, v) => acc + v, 0) / state.commune.micBands.length;
        state.commune.micRms = clamp(avgBand, 0, 1);
      }
    }
    syncEnvironmentPolarity();
    renderProgressionAndSlots();
  }

  // No-op stubs preserved so external callers never throw
  function showAwakeningCard() {}
  function hideAwakeningCard() {}
  function setNearbyStonePrompt() {}
  function openInscriptionModal() {}
  function closeInscriptionModal() {}
  function openCharacterInfoModal() {}
  function closeCharacterInfoModal() {}

  function openPauseModal() {
    if (typeof document !== 'undefined') {
      lastFocusedBeforePause = document.activeElement;
    }
    pauseModal?.classList.add('is-open');
    pauseResumeBtn?.focus();
    if (typeof onUiSfx === 'function') onUiSfx('modal_open');
  }

  function closePauseModal() {
    const wasOpen = Boolean(pauseModal?.classList.contains('is-open'));
    pauseModal?.classList.remove('is-open');
    if (lastFocusedBeforePause && typeof lastFocusedBeforePause.focus === 'function') {
      lastFocusedBeforePause.focus();
    } else {
      pauseBtn?.focus();
    }
    if (wasOpen && typeof onUiSfx === 'function') onUiSfx('modal_close');
  }

  /* ----------------------------------------------------------------------- */
  /* Touch Joystick, Camera Orbit & 2-Ring Fan Arc Wiring                    */
  /* ----------------------------------------------------------------------- */

  const joyState = {
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    x: 0,
    y: 0,
    magnitude: 0,
    sprinting: false,
  };

  const MAX_JOY_RADIUS = 52;
  const SPRINT_THRESHOLD = 0.78;
  const winCleanupFns = [];
  const trackWinListener = (evt, fn, opts) => {
    if (typeof window === 'undefined' || typeof fn !== 'function') return;
    window.addEventListener(evt, fn, opts);
    winCleanupFns.push(() => window.removeEventListener(evt, fn, opts));
  };

  function updateJoystickFromPoint(clientX, clientY) {
    const dx = clientX - joyState.originX;
    const dy = clientY - joyState.originY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, MAX_JOY_RADIUS);
    const angle = Math.atan2(dy, dx);
    const px = Math.cos(angle) * clampedDist;
    const py = Math.sin(angle) * clampedDist;

    if (joyPuck) {
      joyPuck.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0px)`;
    }

    const norm = dist / MAX_JOY_RADIUS;
    const clampedNorm = Math.min(1, norm);
    joyState.x = clampedNorm > 0.08 ? Math.cos(angle) * clampedNorm : 0;
    joyState.y = clampedNorm > 0.08 ? -Math.sin(angle) * clampedNorm : 0;
    joyState.magnitude = clampedNorm > 0.08 ? clampedNorm : 0;
    joyState.sprinting = norm >= SPRINT_THRESHOLD;

    joyRing?.classList.toggle('is-sprinting', joyState.sprinting);
  }

  function resetJoystick() {
    joyState.active = false;
    joyState.pointerId = null;
    joyState.x = 0;
    joyState.y = 0;
    joyState.magnitude = 0;
    joyState.sprinting = false;
    if (joyPuck) {
      joyPuck.style.transform = 'translate3d(0px, 0px, 0px)';
    }
    if (joyRing) {
      joyRing.classList.remove('is-sprinting', 'is-floating');
      joyRing.style.transform = '';
    }
  }

  function tryEnterMobileFullscreen() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    if (state.profile !== 'tablet') return;
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
      // ignore
    }
    try {
      const lockFn = window.screen?.orientation?.lock;
      if (typeof lockFn === 'function') {
        const p = lockFn.call(window.screen.orientation, 'landscape');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  const fullscreenBtn = root.querySelector('#sculpted-fullscreen-btn');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof document === 'undefined') return;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
        if (typeof exitFn === 'function') {
          const p = exitFn.call(document);
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } else {
        tryEnterMobileFullscreen();
      }
    });
  }

  if (joyZone && joyRing) {
    let joyLastAt = 0;
    joyZone.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.pointerType !== 'mouse' && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (joyState.active && now - joyLastAt > 1500) {
        resetJoystick();
      }
      if (joyState.active) return;
      tryEnterMobileFullscreen();
      try {
        joyZone.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      joyState.active = true;
      joyState.pointerId = e.pointerId;
      joyLastAt = now;
      const ringRect = joyRing.getBoundingClientRect();
      const ringCx = ringRect.left + ringRect.width * 0.5;
      const ringCy = ringRect.top + ringRect.height * 0.5;
      const distFromRestingCenter = Math.hypot(e.clientX - ringCx, e.clientY - ringCy);

      // Genshin Dynamic Floating Joystick: if thumb lands outside the inner resting ring (> 42px),
      // teleport the joystick ring center directly under the user's thumb (never crossing middle hero dodge zone)!
      if (distFromRestingCenter > 42 && e.clientX > 0 && e.clientY > 0) {
        const vw = window.innerWidth || 844;
        const vh = window.innerHeight || 390;
        const maxLeftX = Math.max(88, Math.min(vw * 0.28, vw * 0.5 - 125));
        const clampedX = clamp(e.clientX, 64, maxLeftX);
        const clampedY = clamp(e.clientY, vh * 0.46, vh - 64);
        joyState.originX = clampedX;
        joyState.originY = clampedY;
        joyRing.classList.add('is-floating');
        joyRing.style.transform = `translate3d(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px, 0px)`;
      } else {
        joyState.originX = ringCx;
        joyState.originY = ringCy;
      }
      updateJoystickFromPoint(e.clientX, e.clientY);
    });

    joyZone.addEventListener('pointermove', (e) => {
      if (!joyState.active || e.pointerId !== joyState.pointerId) return;
      e.stopPropagation();
      joyLastAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      updateJoystickFromPoint(e.clientX, e.clientY);
    });

    const endJoy = (e) => {
      if (!joyState.active || (e && typeof e.pointerId === 'number' && e.pointerId !== joyState.pointerId)) return;
      resetJoystick();
    };
    joyZone.addEventListener('pointerup', endJoy);
    joyZone.addEventListener('pointercancel', endJoy);
    joyZone.addEventListener('lostpointercapture', endJoy);
    trackWinListener('pointerup', endJoy, { passive: true });
    trackWinListener('pointercancel', endJoy, { passive: true });
  }

  const centerDodgeZone = root.querySelector('#sculpted-center-dodge-zone');
  const dodgeRippleEl = root.querySelector('#sculpted-dodge-ripple');
  let dodgeRippleTimer = null;

  function triggerDodgeRipple(dx, dy, clientX = null, clientY = null) {
    if (!dodgeRippleEl) return;
    const angDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    dodgeRippleEl.style.setProperty('--dodge-angle', `${angDeg.toFixed(1)}deg`);
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      dodgeRippleEl.style.left = `${clientX.toFixed(0)}px`;
      dodgeRippleEl.style.top = `${clientY.toFixed(0)}px`;
    } else {
      dodgeRippleEl.style.left = '50vw';
      dodgeRippleEl.style.top = '54vh';
    }
    dodgeRippleEl.classList.remove('is-active');
    void dodgeRippleEl.offsetWidth;
    dodgeRippleEl.classList.add('is-active');
    if (dodgeRippleTimer) clearTimeout(dodgeRippleTimer);
    dodgeRippleTimer = setTimeout(() => {
      dodgeRippleEl.classList.remove('is-active');
      dodgeRippleTimer = null;
    }, 280);
  }

  // Open-Screen 0ms Pure Camera Orbit (#sculpted-orbit-zone) +
  // Compact Middle-Screen Swipe-to-Dodge / Slow-Drag Orbit (#sculpted-center-dodge-zone)
  let activeOrbitCount = 0;

  function buildOrbitMeta(dtMs, pointerType) {
    return {
      dtMs,
      viewportWidth: (typeof window !== 'undefined' && window.innerWidth) || 1180,
      viewportHeight: (typeof window !== 'undefined' && window.innerHeight) || 787,
      inputType: pointerType || 'touch',
      sensitivity: state.cameraSensitivity,
    };
  }

  function bindPureOrbitZone(zoneEl) {
    if (!zoneEl) return () => {};
    let ptrId = null;
    let lastX = 0;
    let lastY = 0;
    let lastAt = 0;
    let isOrbiting = false;

    const endOrbit = (e) => {
      if (ptrId === null) return;
      if (e && typeof e.pointerId === 'number' && e.pointerId !== ptrId) return;
      if (isOrbiting) {
        isOrbiting = false;
        activeOrbitCount = Math.max(0, activeOrbitCount - 1);
      }
      ptrId = null;
    };

    const onWinOrbitEnd = (e) => endOrbit(e);
    trackWinListener('pointerup', onWinOrbitEnd, { passive: true });
    trackWinListener('pointercancel', onWinOrbitEnd, { passive: true });

    zoneEl.addEventListener('pointerdown', (e) => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      // Recover cleanly if a previous touch ended outside WebView without a cancel/up event
      if (ptrId !== null) {
        if (now - lastAt > 1500) {
          endOrbit();
        } else {
          return;
        }
      }
      if (e.pointerType !== 'mouse' && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      ptrId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      lastAt = now;
      isOrbiting = false;
      try {
        zoneEl.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    });

    zoneEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== ptrId) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const stepDx = e.clientX - lastX;
      const stepDy = e.clientY - lastY;
      const stepDist = Math.hypot(stepDx, stepDy);
      if (!isOrbiting) {
        if (stepDist < 0.5) return;
        isOrbiting = true;
        activeOrbitCount++;
      } else if (stepDist < 0.01) {
        lastAt = now;
        return;
      }
      const dtMs = Math.max(1, now - lastAt);
      if (typeof onCameraOrbit === 'function') {
        onCameraOrbit(stepDx, stepDy, buildOrbitMeta(dtMs, e.pointerType));
      }
      lastX = e.clientX;
      lastY = e.clientY;
      lastAt = now;
    });

    zoneEl.addEventListener('pointerup', endOrbit);
    zoneEl.addEventListener('pointercancel', endOrbit);
    zoneEl.addEventListener('lostpointercapture', endOrbit);
    return endOrbit;
  }

  function bindSwipeAndOrbitZone(zoneEl, { isCenterZone = false } = {}) {
    if (!zoneEl) return () => {};
    let ptrId = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let startAt = 0;
    let lastAt = 0;
    let peakInstVel = 0;
    let isOrbiting = false;
    let gestureMode = 'idle'; // 'idle' | 'undecided' | 'dodge' | 'orbit'

    const fireSwipeDodge = (dx, dy) => {
      cancelSlotEAim();
      triggerDodgeRipple(dx, dy, startX, startY);
      if (typeof onAction === 'function') {
        onAction('dash', {
          role: state.activeRole,
          swipeDx: dx,
          swipeDy: dy,
        });
      }
    };

    const setOrbitFlag = (on) => {
      if (on && !isOrbiting) {
        isOrbiting = true;
        activeOrbitCount++;
      } else if (!on && isOrbiting) {
        isOrbiting = false;
        activeOrbitCount = Math.max(0, activeOrbitCount - 1);
      }
    };

    zoneEl.addEventListener('pointerdown', (e) => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (ptrId !== null) {
        if (now - lastAt > 1500) {
          endGesture(null, false);
        } else {
          return;
        }
      }
      if (e.pointerType !== 'mouse' && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      ptrId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      startAt = now;
      lastAt = now;
      peakInstVel = 0;
      isOrbiting = false;
      gestureMode = 'undecided';
      if (isCenterZone) {
        centerDodgeZone?.classList.add('is-touching');
      }
      try {
        zoneEl.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    });

    zoneEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== ptrId) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const totalDx = e.clientX - startX;
      const totalDy = e.clientY - startY;
      const dist = Math.hypot(totalDx, totalDy);
      const stepDx = e.clientX - lastX;
      const stepDy = e.clientY - lastY;
      const stepDist = Math.hypot(stepDx, stepDy);
      const elapsedMs = Math.max(1, now - startAt);
      const stepDt = Math.max(1, now - lastAt);
      const avgVel = dist / elapsedMs;
      const instVel = stepDist / stepDt;
      if (instVel > peakInstVel) peakInstVel = instVel;

      if (gestureMode === 'orbit') {
        if (typeof onCameraOrbit === 'function') {
          onCameraOrbit(stepDx, stepDy, buildOrbitMeta(stepDt, e.pointerType));
        }
      } else if (gestureMode === 'undecided') {
        // Crisp deliberate quick flick in center hero zone -> directional dodge
        if (
          elapsedMs <= 165 &&
          dist >= 24 &&
          (avgVel >= 0.55 || peakInstVel >= 0.72)
        ) {
          gestureMode = 'dodge';
          if (isCenterZone) centerDodgeZone?.classList.remove('is-touching');
          fireSwipeDodge(totalDx, totalDy);
        } else if (
          // Never stall medium/slow pans: hand over to 1:1 orbit rapidly (<= 55ms on steady drags or >= 165ms)
          elapsedMs > 165 ||
          (elapsedMs >= 55 && dist >= 10 && avgVel < 0.48 && peakInstVel < 0.62)
        ) {
          setOrbitFlag(true);
          gestureMode = 'orbit';
          if (isCenterZone) centerDodgeZone?.classList.remove('is-touching');
          if (typeof onCameraOrbit === 'function') {
            onCameraOrbit(totalDx, totalDy, buildOrbitMeta(elapsedMs, e.pointerType));
          }
        }
      }

      lastX = e.clientX;
      lastY = e.clientY;
      lastAt = now;
    });

    const endGesture = (e, allowUpFlick) => {
      if (ptrId === null) return;
      if (e && typeof e.pointerId === 'number' && e.pointerId !== ptrId) return;
      if (allowUpFlick && gestureMode === 'undecided') {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const elapsedMs = Math.max(1, now - startAt);
        const totalDx = (e?.clientX ?? lastX) - startX;
        const totalDy = (e?.clientY ?? lastY) - startY;
        const dist = Math.hypot(totalDx, totalDy);
        const avgVel = dist / elapsedMs;
        if (dist >= 24 && elapsedMs <= 165 && (avgVel >= 0.55 || peakInstVel >= 0.72)) {
          gestureMode = 'dodge';
          fireSwipeDodge(totalDx, totalDy);
        } else if (dist >= 4 && typeof onCameraOrbit === 'function') {
          onCameraOrbit(totalDx, totalDy, buildOrbitMeta(elapsedMs, e?.pointerType));
        }
      }
      setOrbitFlag(false);
      ptrId = null;
      gestureMode = 'idle';
      if (isCenterZone) {
        centerDodgeZone?.classList.remove('is-touching');
      }
    };

    const onWinCenterEnd = (e) => endGesture(e, true);
    const onWinCenterCancel = (e) => endGesture(e, false);
    trackWinListener('pointerup', onWinCenterEnd, { passive: true });
    trackWinListener('pointercancel', onWinCenterCancel, { passive: true });

    zoneEl.addEventListener('pointerup', (e) => endGesture(e, true));
    zoneEl.addEventListener('pointercancel', (e) => endGesture(e, false));
    zoneEl.addEventListener('lostpointercapture', (e) => endGesture(e, false));
    return (e) => endGesture(e, false);
  }

  const endCenterDodgeOrOrbit = bindSwipeAndOrbitZone(centerDodgeZone, { isCenterZone: true });
  const endPureOrbit = bindPureOrbitZone(orbitZone);

  // Primary Attack Ring: Tap (< 180ms Mage / < 280ms Knight) = 'attack',
  // Hold = Knight 'block_start' / Mage 'heavy' + Hold-Drag-Release Shatterlance aiming (0.8..18.0m)
  let attackHoldTimer = null;
  let attackHeldTriggered = false;
  let attackPointerId = null;
  let attackPointerType = 'touch';
  let attackOriginX = 0;
  let attackOriginY = 0;
  let attackLastX = 0;
  let attackLastY = 0;

  if (attackBtn) {
    attackBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      tryEnterMobileFullscreen();
      try {
        attackBtn.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      attackPointerId = e.pointerId;
      attackPointerType = e.pointerType || 'touch';
      attackOriginX = e.clientX;
      attackOriginY = e.clientY;
      attackLastX = e.clientX;
      attackLastY = e.clientY;
      attackHeldTriggered = false;
      if (typeof onAction === 'function') {
        onAction('attack', { role: state.activeRole });
      }
      if (attackHoldTimer) clearTimeout(attackHoldTimer);
      const holdMs = state.activeRole === 'Mage' ? 140 : 280;
      attackHoldTimer = setTimeout(() => {
        attackHoldTimer = null;
        attackHeldTriggered = true;
        if (typeof onAction === 'function') {
          onAction(state.activeRole === 'Knight' ? 'block_start' : 'heavy', {
            role: state.activeRole,
          });
        }
        if (state.activeRole === 'Mage' && typeof onAimStart === 'function') {
          onAimStart({
            slot: 'Attack',
            spellId: 'shatterlance',
            role: 'Mage',
            element: 'ice',
            source: attackPointerType,
            clientX: attackLastX,
            clientY: attackLastY,
            dx: 0,
            dy: 0,
          });
        }
      }, holdMs);
    });

    attackBtn.addEventListener('pointermove', (e) => {
      if (e.pointerId !== attackPointerId) return;
      const dx = e.clientX - attackLastX;
      const dy = e.clientY - attackLastY;
      attackLastX = e.clientX;
      attackLastY = e.clientY;
      if (attackHeldTriggered && state.activeRole === 'Mage' && typeof onAimMove === 'function') {
        onAimMove({
          slot: 'Attack',
          spellId: 'shatterlance',
          role: 'Mage',
          element: 'ice',
          source: e.pointerType || attackPointerType || 'touch',
          clientX: e.clientX,
          clientY: e.clientY,
          dx,
          dy,
        });
      }
    });

    const releaseAttack = (e) => {
      if (attackPointerId === null) return;
      if (e && typeof e.pointerId === 'number' && e.pointerId !== attackPointerId) return;
      if (attackHoldTimer) {
        clearTimeout(attackHoldTimer);
        attackHoldTimer = null;
      }
      attackPointerId = null;
      if (attackHeldTriggered) {
        attackHeldTriggered = false;
        if (state.activeRole === 'Knight' && typeof onAction === 'function') {
          onAction('block_end', { role: state.activeRole });
        } else if (state.activeRole === 'Mage') {
          if (typeof onAimRelease === 'function') {
            onAimRelease({
              slot: 'Attack',
              spellId: 'shatterlance',
              role: 'Mage',
              element: 'ice',
              source: e?.pointerType || attackPointerType || 'touch',
              clientX: e?.clientX ?? attackLastX,
              clientY: e?.clientY ?? attackLastY,
              dx: (e?.clientX ?? attackLastX) - attackOriginX,
              dy: (e?.clientY ?? attackLastY) - attackOriginY,
            });
          } else if (typeof onAction === 'function') {
            onAction('shatterlance_release', { role: 'Mage' });
          }
        }
      }
    };
    attackBtn.addEventListener('pointerup', releaseAttack);
    attackBtn.addEventListener('pointercancel', releaseAttack);
    attackBtn.addEventListener('lostpointercapture', releaseAttack);
  }

  // Real-Use-Case Fix #3: Dashing while holding [E] cancels aim cleanly without consuming cooldown
  let eAimActive = false;
  let ePointerId = null;
  let eOriginX = 0;
  let eOriginY = 0;
  let eBtnRadius = 38;
  let eLeftButton = false;

  function cancelSlotEAim() {
    slotE?.classList.remove('is-aim-cancel');
    if (!eAimActive) return;
    eAimActive = false;
    ePointerId = null;
    eLeftButton = false;
  }

  if (dashBtn) {
    let dashPtrId = null;
    let dashStartX = 0;
    let dashStartY = 0;
    let dashSwiped = false;

    dashBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      tryEnterMobileFullscreen();
      dashPtrId = e.pointerId;
      dashStartX = e.clientX;
      dashStartY = e.clientY;
      dashSwiped = false;
      try {
        dashBtn.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      // 0ms Instant-Response Dodge on press (uses current left joystick direction immediately!)
      cancelSlotEAim();
      if (typeof onAction === 'function') {
        onAction('dash', { role: state.activeRole });
      }
    });

    dashBtn.addEventListener('pointermove', (e) => {
      if (e.pointerId !== dashPtrId || dashSwiped) return;
      const dx = e.clientX - dashStartX;
      const dy = e.clientY - dashStartY;
      if (Math.hypot(dx, dy) >= 14) {
        dashSwiped = true;
        cancelSlotEAim();
        triggerDodgeRipple(dx, dy);
        if (typeof onAction === 'function') {
          onAction('dash', {
            role: state.activeRole,
            swipeDx: dx,
            swipeDy: dy,
            steerActiveDash: true,
          });
        }
      }
    });

    const releaseDashBtn = (e) => {
      if (e && typeof e.pointerId === 'number' && e.pointerId !== dashPtrId) return;
      dashPtrId = null;
      dashSwiped = false;
    };
    dashBtn.addEventListener('pointerup', releaseDashBtn);
    dashBtn.addEventListener('pointercancel', releaseDashBtn);
    dashBtn.addEventListener('lostpointercapture', releaseDashBtn);
    dashBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Support synthetic .click() in tests when pointerdown/up wasn't used
      if (e.detail === 0) {
        cancelSlotEAim();
        if (typeof onAction === 'function') {
          onAction('dash', { role: state.activeRole });
        }
      }
    });
  }

  if (jumpBtn) {
    jumpBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      tryEnterMobileFullscreen();
    });
    jumpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof onAction === 'function') {
        onAction('jump', { role: state.activeRole });
      }
    });
  }

  // [E] Elemental Skill Ring: 2D Right-Thumb Drag Vector (dx, dy) from #sculpted-slot-e center
  if (slotE) {
    slotE.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const anyEl = state.iceUnlocked || state.fireUnlocked || state.unlockedStage >= 1;
      if (!anyEl) {
        if (typeof onUiSfx === 'function') onUiSfx('locked');
        return;
      }
      try {
        slotE.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      const rect = slotE.getBoundingClientRect();
      eOriginX = rect.left + rect.width * 0.5;
      eOriginY = rect.top + rect.height * 0.5;
      eBtnRadius = Math.max((rect.width || 64) * 0.55, 38);
      eLeftButton = false;
      ePointerId = e.pointerId;
      eAimActive = true;
      slotE.classList.remove('is-aim-cancel');

      const startPayload = {
        slot: 'E',
        source: 'touch',
        role: state.activeRole,
        element: state.activeElement,
        clientX: e.clientX,
        clientY: e.clientY,
        dx: 0,
        dy: 0,
        touch: {
          dx: 0,
          dy: 0,
          overButton: true,
          leftButton: false,
        },
      };

      if (state.activeRole === 'Knight') {
        if (typeof onAction === 'function') {
          onAction('skill_e', { role: 'Knight', element: state.activeElement });
        }
        if (typeof onAimStart === 'function') {
          onAimStart(startPayload);
        }
      } else if (typeof onAimStart === 'function') {
        onAimStart(startPayload);
      }
    });

    slotE.addEventListener('pointermove', (e) => {
      if (!eAimActive || e.pointerId !== ePointerId) return;
      e.stopPropagation();
      const dx = e.clientX - eOriginX;
      const rawDy = e.clientY - eOriginY;
      const dist = Math.hypot(dx, rawDy);
      if (dist > eBtnRadius) {
        eLeftButton = true;
      }
      const overButton = dist <= eBtnRadius;
      slotE.classList.toggle(
        'is-aim-cancel',
        Boolean(eAimActive && state.activeRole === 'Mage' && overButton && eLeftButton)
      );
      if (typeof onAimMove === 'function') {
        onAimMove({
          slot: 'E',
          source: 'touch',
          role: state.activeRole,
          element: state.activeElement,
          clientX: e.clientX,
          clientY: e.clientY,
          dx,
          dy: rawDy,
          touch: {
            dx,
            dy: -rawDy,
            overButton,
            leftButton: eLeftButton,
          },
        });
      }
    });

    const releaseSlotE = (e) => {
      if (!eAimActive) return;
      if (e && typeof e.pointerId === 'number' && e.pointerId !== ePointerId) return;
      const clientX = e?.clientX ?? eOriginX;
      const clientY = e?.clientY ?? eOriginY;
      const dx = clientX - eOriginX;
      const rawDy = clientY - eOriginY;
      const overButton = Math.hypot(dx, rawDy) <= eBtnRadius;
      const leftBtnSnapshot = eLeftButton;
      eAimActive = false;
      ePointerId = null;
      eLeftButton = false;
      slotE.classList.remove('is-aim-cancel');
      if (state.activeRole === 'Mage') {
        if (typeof onAimRelease === 'function') {
          onAimRelease({
            slot: 'E',
            source: 'touch',
            role: 'Mage',
            element: state.activeElement,
            clientX,
            clientY,
            dx,
            dy: rawDy,
            touch: {
              dx,
              dy: -rawDy,
              overButton,
              leftButton: leftBtnSnapshot,
            },
          });
        } else if (typeof onAction === 'function') {
          onAction('skill_e', { role: 'Mage', element: state.activeElement });
        }
      }
    };

    const cancelSlotEPointer = (e) => {
      if (!eAimActive) return;
      if (e && typeof e.pointerId === 'number' && e.pointerId !== ePointerId) return;
      eAimActive = false;
      ePointerId = null;
      eLeftButton = false;
      slotE.classList.remove('is-aim-cancel');
      if (state.activeRole === 'Mage' && typeof onAimRelease === 'function') {
        onAimRelease({
          slot: 'E',
          source: 'touch',
          role: 'Mage',
          element: state.activeElement,
          cancelled: true,
          clientX: eOriginX,
          clientY: eOriginY,
          dx: 0,
          dy: 0,
          touch: {
            dx: 0,
            dy: 0,
            overButton: true,
            leftButton: true,
          },
        });
      }
    };

    slotE.addEventListener('pointerup', releaseSlotE);
    slotE.addEventListener('pointercancel', cancelSlotEPointer);
    slotE.addEventListener('lostpointercapture', cancelSlotEPointer);
  }

  let tabSwitchRevealTimer = null;

  function triggerTabSwitchLabel() {
    if (!slotTab) return;
    slotTab.classList.add('is-switching');
    if (tabSwitchRevealTimer) clearTimeout(tabSwitchRevealTimer);
    tabSwitchRevealTimer = setTimeout(() => {
      slotTab?.classList.remove('is-switching');
      tabSwitchRevealTimer = null;
    }, 1500);
  }
  const flashTabSwitchText = triggerTabSwitchLabel;

  // [Tab] Element Toggle Ring (visible only when BOTH Ice & Fire are solved)
  if (slotTab) {
    slotTab.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    slotTab.addEventListener('click', (e) => {
      e.stopPropagation();
      const bothEl =
        (state.iceUnlocked && state.fireUnlocked) || state.unlockedStage >= 2;
      if (!bothEl) return;
      state.activeElement = state.activeElement === 'ice' ? 'fire' : 'ice';
      state.tabSwitchHintDismissed = true;
      renderProgressionAndSlots();
      triggerTabSwitchLabel();
      if (typeof onToggleElement === 'function') {
        onToggleElement(state.activeElement);
      }
    });
  }

  // [Q] Personal Ultimate Ring
  if (slotQ) {
    slotQ.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      tryEnterMobileFullscreen();
    });
    slotQ.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.ultimateUnlocked && state.unlockedStage < 3) {
        if (typeof onUiSfx === 'function') onUiSfx('locked');
        return;
      }
      if (typeof onAction === 'function') {
        onAction('ultimate', { role: state.activeRole, element: state.activeElement });
      }
    });
  }

  // Commune [V] Ring (toggles listening start / stop-and-send)
  if (communeBtn) {
    communeBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      tryEnterMobileFullscreen();
    });
    communeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const anyEl = state.iceUnlocked || state.fireUnlocked || state.unlockedStage >= 1;
      if (!state.communeDiscovered && !anyEl && !state.ultimateUnlocked) return;
      if (typeof onCommuneToggle === 'function') {
        onCommuneToggle(!state.commune.listening);
      }
    });
  }

  function triggerHeroSwap() {
    if (state.peerConnected) return;
    const nextRole = state.activeRole === 'Knight' ? 'Mage' : 'Knight';
    if (typeof onSwapHero === 'function') {
      const swapped = onSwapHero(nextRole);
      if (swapped === false) return;
    }
    state.activeRole = nextRole;
    renderRoleAndPartyBars();
  }

  if (partnerRowEl) {
    partnerRowEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    partnerRowEl.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerHeroSwap();
    });
  }

  async function copyInviteWithFeedback(targetEl, copiedText, onRestore, which) {
    if (typeof onUiSfx === 'function') onUiSfx('click');
    const fallbackUrl =
      state.shareUrl ||
      (typeof window !== 'undefined' && window.location?.href ? window.location.href : '');
    let handled = false;
    if (typeof onCopyRoomInvite === 'function') {
      try {
        const res = await onCopyRoomInvite({
          roomCode: state.roomCode,
          roomPhrase: state.roomPhrase,
          shareUrl: fallbackUrl,
        });
        if (res === true || (res && res.copied)) {
          handled = true;
        } else if (typeof res === 'string' && res.trim()) {
          state.shareUrl = res.trim();
        }
      } catch {
        // fall through to clipboard fallback
      }
    }
    const urlToCopy = state.shareUrl || fallbackUrl;
    if (
      !handled &&
      urlToCopy &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(urlToCopy);
      } catch {
        // ignore clipboard permission errors
      }
    }
    if (targetEl) {
      targetEl.textContent = copiedText;
    }
    if (which === 'badge') {
      if (badgeCopiedTimer) clearTimeout(badgeCopiedTimer);
      badgeCopiedTimer = setTimeout(onRestore, 1400);
    } else if (which === 'pause') {
      if (pauseCopyBtnTimer) clearTimeout(pauseCopyBtnTimer);
      pauseCopyBtnTimer = setTimeout(onRestore, 1400);
    }
  }

  if (roomBadgeEl) {
    roomBadgeEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    roomBadgeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      copyInviteWithFeedback(
        roomBadgeTextEl,
        'Copied Invite',
        () => {
          badgeCopiedTimer = null;
          renderRoomState();
        },
        'badge'
      );
    });
  }

  if (pauseCopyRoomBtn) {
    pauseCopyRoomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyInviteWithFeedback(
        pauseCopyRoomBtn,
        'Copied!',
        () => {
          pauseCopyBtnTimer = null;
          if (pauseCopyRoomBtn) {
            pauseCopyRoomBtn.textContent = 'Copy Invite Link';
          }
        },
        'pause'
      );
    });
  }

  if (pauseEditRoomBtn) {
    pauseEditRoomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof onUiSfx === 'function') onUiSfx('click');
      if (typeof onEditRoomCode === 'function') {
        onEditRoomCode({
          roomCode: state.roomCode,
          roomPhrase: state.roomPhrase,
        });
      }
    });
  }

  // Pause Popover Controls
  if (pauseBtn) {
    pauseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pauseModal?.classList.contains('is-open')) {
        closePauseModal();
      } else {
        openPauseModal();
      }
    });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
  }

  if (pauseResumeBtn) {
    pauseResumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePauseModal();
    });
  }

  if (pauseSwapBtn) {
    pauseSwapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerHeroSwap();
    });
  }

  // DEV_SOLO_TEST_REMOVE_FOR_PROD: Cycle unlocked stage 0 -> 1 -> 2 -> 3 -> 0
  if (pauseDevStageBtn) {
    pauseDevStageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextStage = (state.unlockedStage + 1) % 4;
      setProgressionState({
        communeDiscovered: nextStage >= 1,
        unlockedStage: nextStage,
        stonesSolved: nextStage,
        iceUnlocked: nextStage >= 1,
        fireUnlocked: nextStage >= 2,
        ultimateUnlocked: nextStage >= 3,
      });
      if (typeof onDevUnlockNextStage === 'function') {
        onDevUnlockNextStage(nextStage);
      }
    });
  }

  root.querySelectorAll('[data-tod-choice]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof onUiSfx === 'function') onUiSfx('click');
      const tod = btn.dataset.todChoice || 'day';
      setTimeOfDaySelection(tod);
      if (typeof onSelectTimeOfDay === 'function') {
        onSelectTimeOfDay(tod);
      }
    });
  });

  root.querySelectorAll('[data-profile-choice]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof onUiSfx === 'function') onUiSfx('click');
      const prof = btn.dataset.profileChoice || 'desktop';
      setProfileMode(prof);
      if (typeof onSelectProfile === 'function') {
        onSelectProfile(prof);
      }
    });
  });

  root.querySelectorAll('[data-camera-sens]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof onUiSfx === 'function') onUiSfx('click');
      const preset = btn.dataset.cameraSens || 'high';
      setCameraSensitivity(preset);
    });
  });

  pauseModal?.addEventListener('click', (e) => {
    if (e.target === pauseModal) {
      closePauseModal();
    }
  });

  function onGlobalKeyDown(e) {
    if (e.key === 'Escape' && pauseModal?.classList.contains('is-open')) {
      closePauseModal();
    }
  }

  function onGlobalWindowBlur() {
    endPureOrbit();
    endCenterDodgeOrOrbit(null);
    if (joyState.active) {
      resetJoystick();
    }
    if (eAimActive) {
      cancelSlotEAim();
    }
    if (attackHoldTimer) {
      clearTimeout(attackHoldTimer);
      attackHoldTimer = null;
    }
    if (attackPointerId !== null || attackHeldTriggered) {
      attackPointerId = null;
      if (attackHeldTriggered) {
        attackHeldTriggered = false;
        if (state.activeRole === 'Knight' && typeof onAction === 'function') {
          onAction('block_end', { role: state.activeRole });
        } else if (state.activeRole === 'Mage' && typeof onAimRelease === 'function') {
          onAimRelease({
            slot: 'Attack',
            spellId: 'shatterlance',
            role: 'Mage',
            element: 'ice',
            source: attackPointerType || 'touch',
            cancelled: true,
            clientX: attackLastX,
            clientY: attackLastY,
            dx: attackLastX - attackOriginX,
            dy: attackLastY - attackOriginY,
          });
        }
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onGlobalKeyDown);
    window.addEventListener('blur', onGlobalWindowBlur);
  }

  /* ----------------------------------------------------------------------- */
  /* State Setters for Main Game Loop                                        */
  /* ----------------------------------------------------------------------- */

  let notifyingCameraSensitivity = false;

  function setCameraSensitivity(preset, { notify = true } = {}) {
    const normalized =
      preset === 'low' || preset === 'medium' || preset === 'high' ? preset : 'high';
    state.cameraSensitivity = normalized;
    root.querySelectorAll('[data-camera-sens]').forEach((btn) => {
      const selected = btn.dataset.cameraSens === state.cameraSensitivity;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    if (notify && !notifyingCameraSensitivity && typeof onChangeCameraSensitivity === 'function') {
      notifyingCameraSensitivity = true;
      try {
        onChangeCameraSensitivity(state.cameraSensitivity);
      } finally {
        notifyingCameraSensitivity = false;
      }
    }
    return state.cameraSensitivity;
  }

  function getCameraSensitivity() {
    return state.cameraSensitivity;
  }

  function setProfileMode(profileName) {
    state.profile = profileName === 'tablet' ? 'tablet' : 'desktop';
    const isTablet = state.profile === 'tablet';
    root.classList.toggle('profile-tablet', isTablet);
    root.classList.toggle('profile-desktop', !isTablet);

    root.querySelectorAll('[data-profile-choice]').forEach((btn) => {
      const selected = btn.dataset.profileChoice === state.profile;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
  }

  function setTimeOfDaySelection(todKey) {
    state.timeOfDay = todKey || 'day';
    if (!state.commune.listening && !state.commune.partnerListening) {
      state.envPolarityOverride = null;
    }
    root.querySelectorAll('[data-tod-choice]').forEach((btn) => {
      const selected = btn.dataset.todChoice === state.timeOfDay;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    syncEnvironmentPolarity();
  }

  function setActiveRole(role) {
    if (role === 'Knight' || role === 'Mage') {
      state.activeRole = role;
      renderRoleAndPartyBars();
    }
  }

  function setElement(element) {
    if (element === 'ice' || element === 'fire') {
      const changed = element !== state.activeElement;
      if (
        ((state.iceUnlocked && state.fireUnlocked) || state.unlockedStage >= 2) &&
        changed
      ) {
        state.tabSwitchHintDismissed = true;
      }
      state.activeElement = element;
      renderProgressionAndSlots();
      if (changed) {
        triggerTabSwitchLabel();
      }
    }
  }

  /**
   * Real-Use-Case Fix #6:
   * Supports decoupled `activeElement` (selectedElement queue) vs `activeSwordBuffElement`
   * (active Knight `breathingStyle` sword buff) when pressing Tab mid-buff.
   */
  function updatePartyStatus({
    activeRole,
    knight,
    mage,
    names,
    activeElement,
    activeSwordBuffElement,
    cooldowns,
    qEnergyPct,
    qEnergy,
    qEnergyMax,
    heartResonance,
    communeChannelActive,
    verdictSequenceActive,
    isCommuning,
    miracleReady,
    partnerDistance,
  } = {}) {
    if (activeRole === 'Knight' || activeRole === 'Mage') {
      state.activeRole = activeRole;
    }
    if (names) {
      setPlayerNames(names);
    }
    if (activeElement === 'ice' || activeElement === 'fire') {
      const changed = activeElement !== state.activeElement;
      state.activeElement = activeElement;
      if (
        changed &&
        ((state.iceUnlocked && state.fireUnlocked) || state.unlockedStage >= 2)
      ) {
        state.tabSwitchHintDismissed = true;
        triggerTabSwitchLabel();
      }
    }
    if (activeSwordBuffElement !== undefined) {
      state.activeSwordBuffElement = activeSwordBuffElement;
    }
    if (typeof communeChannelActive === 'boolean') {
      state.communeChannelActive = communeChannelActive;
    }
    if (verdictSequenceActive !== undefined) {
      state.verdictSequenceActive = Boolean(verdictSequenceActive);
    }
    if (typeof isCommuning === 'boolean') {
      state.communeChannelActive = isCommuning;
    }
    if (typeof miracleReady === 'boolean') {
      state.miracleReady = miracleReady;
    }
    if (typeof partnerDistance === 'number') {
      state.partnerDistance = partnerDistance;
    }
    if (typeof qEnergyPct === 'number' && Number.isFinite(qEnergyPct)) {
      state.qEnergyPct = clamp(qEnergyPct, 0, 1);
    } else if (typeof qEnergy === 'number' && Number.isFinite(qEnergy)) {
      const maxE = typeof qEnergyMax === 'number' && qEnergyMax > 0 ? qEnergyMax : 100;
      state.qEnergyPct = clamp(qEnergy / maxE, 0, 1);
    } else if (typeof cooldowns?.qEnergyPct === 'number' && Number.isFinite(cooldowns.qEnergyPct)) {
      state.qEnergyPct = clamp(cooldowns.qEnergyPct, 0, 1);
    } else if (typeof heartResonance === 'number' && Number.isFinite(heartResonance)) {
      state.qEnergyPct = clamp(heartResonance / 100, 0, 1);
    }
    if (knight) {
      if (typeof knight.name === 'string' && knight.name.trim()) {
        state.playerNames.Knight = knight.name.trim();
      }
      if (knight.breathingStyle === 'rime') {
        state.activeSwordBuffElement = 'ice';
      } else if (knight.breathingStyle === 'solar') {
        state.activeSwordBuffElement = 'fire';
      }
      if (typeof knight.qEnergyPct === 'number' && state.activeRole === 'Knight') {
        state.qEnergyPct = clamp(knight.qEnergyPct, 0, 1);
      }
      state.stats.Knight = {
        level: knight.level ?? state.stats.Knight.level ?? 1,
        hp: knight.hp ?? state.stats.Knight.hp,
        maxHp: knight.maxHp ?? state.stats.Knight.maxHp,
        shield: knight.shield ?? 0,
        downed: Boolean(knight.downed || (knight.hp !== undefined && knight.hp <= 0)),
      };
    }
    if (mage) {
      if (typeof mage.name === 'string' && mage.name.trim()) {
        state.playerNames.Mage = mage.name.trim();
      }
      if (typeof mage.qEnergyPct === 'number' && state.activeRole === 'Mage') {
        state.qEnergyPct = clamp(mage.qEnergyPct, 0, 1);
      }
      state.stats.Mage = {
        level: mage.level ?? state.stats.Mage.level ?? 1,
        hp: mage.hp ?? state.stats.Mage.hp,
        maxHp: mage.maxHp ?? state.stats.Mage.maxHp,
        shield: mage.shield ?? 0,
        downed: Boolean(mage.downed || (mage.hp !== undefined && mage.hp <= 0)),
      };
    }
    if (cooldowns) {
      if (typeof cooldowns.E === 'number') state.cooldowns.E = cooldowns.E;
      if (typeof cooldowns.Q === 'number') state.cooldowns.Q = cooldowns.Q;
      if (typeof cooldowns.eBuffRemaining === 'number') {
        state.cooldowns.eBuffRemaining = cooldowns.eBuffRemaining;
      }
    }
    const prevKnightHp = lastRoleHp.Knight;
    const prevMageHp = lastRoleHp.Mage;
    const nextKnightHp = state.stats.Knight?.hp ?? null;
    const nextMageHp = state.stats.Mage?.hp ?? null;
    lastRoleHp.Knight = nextKnightHp;
    lastRoleHp.Mage = nextMageHp;

    const knightHealed = prevKnightHp !== null && nextKnightHp !== null && nextKnightHp > prevKnightHp + 2;
    const mageHealed = prevMageHp !== null && nextMageHp !== null && nextMageHp > prevMageHp + 2;
    if (knightHealed || mageHealed) {
      const role = knightHealed && mageHealed ? 'both' : knightHealed ? 'Knight' : 'Mage';
      triggerHealPulse({
        role,
        amount: Math.max(
          knightHealed ? nextKnightHp - prevKnightHp : 0,
          mageHealed ? nextMageHp - prevMageHp : 0
        ),
      });
    }

    renderRoleAndPartyBars();
    renderProgressionAndSlots();
  }

  function updateHudState(snapshot = {}) {
    updatePartyStatus(snapshot);
  }

  const damageVignetteEl = root.querySelector('#sculpted-damage-vignette');
  let vignetteTimer = null;
  let primaryShakeTimer = null;
  let partnerShakeTimer = null;
  let primaryHealTimer = null;
  let partnerHealTimer = null;

  function triggerHealPulse({ role = 'both', amount = 0 } = {}) {
    const norm = String(role || 'both').toLowerCase();
    const targetPrimary =
      norm === 'both' ||
      (norm === 'knight' && state.activeRole === 'Knight') ||
      (norm === 'mage' && state.activeRole === 'Mage');
    const targetPartner =
      norm === 'both' ||
      (norm === 'knight' && state.activeRole !== 'Knight') ||
      (norm === 'mage' && state.activeRole !== 'Mage');

    if (targetPrimary && primaryRowEl) {
      primaryRowEl.classList.remove('is-healed-pulse');
      void primaryRowEl.offsetWidth;
      primaryRowEl.classList.add('is-healed-pulse');
      if (primaryHealTimer) clearTimeout(primaryHealTimer);
      primaryHealTimer = setTimeout(() => {
        primaryRowEl.classList.remove('is-healed-pulse');
        primaryHealTimer = null;
      }, 920);
    }
    if (targetPartner && partnerRowEl) {
      partnerRowEl.classList.remove('is-healed-pulse');
      void partnerRowEl.offsetWidth;
      partnerRowEl.classList.add('is-healed-pulse');
      if (partnerHealTimer) clearTimeout(partnerHealTimer);
      partnerHealTimer = setTimeout(() => {
        partnerRowEl.classList.remove('is-healed-pulse');
        partnerHealTimer = null;
      }, 920);
    }
    return { pulsed: Boolean(targetPrimary || targetPartner), amount: Number(amount) || 0 };
  }

  function triggerDamagePulse({ role = 'Knight', damage = 15, blocked = false } = {}) {
    const isPrimaryHit = role === state.activeRole;
    if (damageVignetteEl && (isPrimaryHit || !blocked)) {
      damageVignetteEl.classList.toggle('is-blocked', Boolean(blocked));
      damageVignetteEl.classList.add('is-active');
      if (vignetteTimer) clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => {
        damageVignetteEl.classList.remove('is-active');
        vignetteTimer = null;
      }, blocked ? 140 : 230);
    }

    const rowEl = isPrimaryHit ? primaryRowEl : partnerRowEl;
    if (rowEl && !blocked) {
      rowEl.classList.remove('is-damaged-shake');
      void rowEl.offsetWidth;
      rowEl.classList.add('is-damaged-shake');
      if (isPrimaryHit) {
        if (primaryShakeTimer) clearTimeout(primaryShakeTimer);
        primaryShakeTimer = setTimeout(() => {
          rowEl.classList.remove('is-damaged-shake');
          primaryShakeTimer = null;
        }, 250);
      } else {
        if (partnerShakeTimer) clearTimeout(partnerShakeTimer);
        partnerShakeTimer = setTimeout(() => {
          rowEl.classList.remove('is-damaged-shake');
          partnerShakeTimer = null;
        }, 250);
      }
    }
  }

  // Initial render (Starts Bare: Stage 0, communeDiscovered = false)
  setProfileMode(state.profile);
  setCameraSensitivity(state.cameraSensitivity, { notify: false });
  syncEnvironmentPolarity();
  renderRoleAndPartyBars();
  renderProgressionAndSlots();
  renderRoomState();

  return {
    root,
    joyState,
    get isOrbitDragging() {
      return activeOrbitCount > 0;
    },
    getState: () => ({
      ...state,
      playerNames: { ...state.playerNames },
      commune: { ...state.commune },
      stats: {
        Knight: { ...state.stats.Knight },
        Mage: { ...state.stats.Mage },
      },
      cooldowns: { ...state.cooldowns },
    }),
    setPlayerNames,
    setPeerConnected,
    setRoomState,
    setCameraSensitivity,
    getCameraSensitivity,
    setEnvironmentPolarity,
    setProgressionState,
    setCommuneState,
    showAwakeningCard,
    hideAwakeningCard,
    setNearbyStonePrompt,
    openInscriptionModal,
    closeInscriptionModal,
    openCharacterInfoModal,
    closeCharacterInfoModal,
    openPauseModal,
    closePauseModal,
    setProfileMode,
    setTimeOfDaySelection,
    setActiveRole,
    setElement,
    cancelSlotEAim,
    updatePartyStatus,
    updateHudState,
    triggerDamagePulse,
    triggerHealPulse,
    resetJoystick,
    isModalOpen: () => Boolean(pauseModal?.classList.contains('is-open')),
    setVisible(visible = true) {
      root.classList.toggle('is-hidden', !visible);
    },
    setHidden(hidden) {
      root.classList.toggle('is-hidden', Boolean(hidden));
    },
    destroy() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onGlobalKeyDown);
        window.removeEventListener('blur', onGlobalWindowBlur);
      }
      while (winCleanupFns.length > 0) {
        try {
          winCleanupFns.pop()();
        } catch {
          // ignore
        }
      }
      if (badgeCopiedTimer) clearTimeout(badgeCopiedTimer);
      if (pauseCopyBtnTimer) clearTimeout(pauseCopyBtnTimer);
      if (tabSwitchRevealTimer) clearTimeout(tabSwitchRevealTimer);
      if (dodgeRippleTimer) clearTimeout(dodgeRippleTimer);
      if (vignetteTimer) clearTimeout(vignetteTimer);
      if (primaryShakeTimer) clearTimeout(primaryShakeTimer);
      if (partnerShakeTimer) clearTimeout(partnerShakeTimer);
      if (primaryHealTimer) clearTimeout(primaryHealTimer);
      if (partnerHealTimer) clearTimeout(partnerHealTimer);
      if (hpTweenRafBySlot.primary !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(hpTweenRafBySlot.primary);
      }
      if (hpTweenRafBySlot.partner !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(hpTweenRafBySlot.partner);
      }
      if (attackHoldTimer) clearTimeout(attackHoldTimer);
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('sculpted-hud-mounted');
      }
      root.remove();
    },
  };
}
