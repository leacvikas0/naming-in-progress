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

/* Flat White Cryo Ice-Lance / Lotus Crystal Silhouette for [E] Ice */
const SVG_ICE_CRYSTAL_GLYPH = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <polygon points="24,7 30,22 24,39 18,22" fill="#ffffff"/>
  <polygon points="14,15 21,23 16,35 11,24" fill="#ffffff" opacity="0.82"/>
  <polygon points="34,15 27,23 32,35 37,24" fill="#ffffff" opacity="0.82"/>
  <circle cx="24" cy="41.5" r="2" fill="#ffffff"/>
</svg>
`;

/* Flat White Pyro Sunfire Flame Crest for [E] Fire */
const SVG_FIRE_SUNFIRE_GLYPH = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <path d="M24 8 C31 15.5, 36 22, 34 30.5 C32.2 36.8, 28.2 40, 24 40 C19.8 40, 15.8 36.8, 14 30.5 C12 22, 17 15.5, 24 8 Z" fill="#ffffff"/>
  <path d="M24 19 C27 23, 28.5 26.8, 27.2 31.5 C26.2 34.2, 25.1 35.5, 24 35.5 C22.9 35.5, 21.8 34.2, 20.8 31.5 C19.5 26.8, 21 23, 24 19 Z" fill="rgba(251, 146, 60, 0.85)"/>
</svg>
`;

/* Clean Left-Side [Tab] Element Switch Pill Content (Ice <-> Fire) */
const SVG_TAB_SWAP_GLYPH = `
<span class="sh-tab-switch-inner">
  <span class="sh-tab-opt sh-tab-opt-ice" data-el-opt="ice">
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
      <path d="M10 2V18M3.1 6L16.9 14M3.1 14L16.9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <span>Ice</span>
  </span>
  <span class="sh-tab-sep" aria-hidden="true">⇄</span>
  <span class="sh-tab-opt sh-tab-opt-fire" data-el-opt="fire">
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
      <path d="M10 2.5C13.5 6.5 15.5 9.8 14.5 13.8C13.7 16.5 11.9 18 10 18C8.1 18 6.3 16.5 5.5 13.8C4.5 9.8 6.5 6.5 10 2.5Z" fill="currentColor"/>
    </svg>
    <span>Fire</span>
  </span>
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
    --hud-ring-fill: rgba(34, 38, 46, 0.28);
    --hud-shadow: rgba(15, 23, 42, 0.24);
    --hud-accent: #facc15;
  }

  #sculpted-hud-root {
    position: fixed;
    inset: 0;
    pointer-events: none;
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
    border: 1.8px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 3px var(--hud-ring-inner),
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
    background: linear-gradient(180deg, rgba(125, 211, 252, 0.78) 0%, rgba(14, 165, 233, 0.62) 100%);
  }

  #sculpted-slot-e[data-element="fire"] .sh-vertical-fill {
    background: linear-gradient(180deg, rgba(253, 186, 116, 0.82) 0%, rgba(234, 88, 12, 0.68) 100%);
  }

  #sculpted-slot-q .sh-vertical-fill {
    background: linear-gradient(180deg, rgba(253, 224, 71, 0.82) 0%, rgba(56, 189, 248, 0.72) 100%);
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

  .sh-hp-fill {
    position: relative;
    height: 100%;
    width: 100%;
    border-radius: 999px;
    background: #84cc16;
    transition: width 150ms ease-out;
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

  /* ----------------------------------------------------------------------- */
  /* 4. Left Hand Floating Thumbstick (Tablet Only: 38px, 36px, 148x148px)   */
  /* ----------------------------------------------------------------------- */
  #sculpted-joystick-zone {
    position: absolute;
    left: 38px;
    bottom: 36px;
    width: 148px;
    height: 148px;
    pointer-events: auto;
    touch-action: none;
    z-index: 28;
    display: none;
  }

  #sculpted-hud-root.profile-tablet #sculpted-joystick-zone {
    display: block;
  }

  .sh-joy-ring {
    position: relative;
    width: 148px;
    height: 148px;
    border-radius: 50%;
    background: rgba(34, 38, 46, 0.22);
    border: 1.8px solid rgba(255, 255, 255, 0.65);
    box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.14);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sh-joy-ring.is-sprinting {
    border-color: var(--hud-accent);
  }

  .sh-joy-puck {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.38);
    border: 2px solid #ffffff;
    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.25);
    transform: translate3d(0px, 0px, 0px);
    pointer-events: none;
  }

  #sculpted-orbit-zone {
    position: absolute;
    right: 0;
    top: 72px;
    width: 56vw;
    height: calc(100vh - 72px);
    pointer-events: auto;
    touch-action: none;
    z-index: 25;
    display: none;
  }

  #sculpted-hud-root.profile-tablet #sculpted-orbit-zone {
    display: block;
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

  /* LEFT-SIDE [Tab] ELEMENT SWITCH (~30% down from top-left, per Genshin screenshot 1) */
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
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(34, 38, 46, 0.34);
    border: 1.5px solid rgba(255, 255, 255, 0.78);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.22);
    gap: 8px;
  }

  .sh-tab-switch-inner {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--hud-font-sans);
    font-size: 0.84rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.72);
  }

  .sh-tab-opt {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    transition: background-color 140ms ease, color 140ms ease;
  }

  #sculpted-slot-tab[data-element="ice"] .sh-tab-opt-ice {
    background: rgba(56, 189, 248, 0.45);
    color: #ffffff;
  }

  #sculpted-slot-tab[data-element="fire"] .sh-tab-opt-fire {
    background: rgba(251, 146, 60, 0.52);
    color: #ffffff;
  }

  .sh-tab-sep {
    opacity: 0.7;
    font-size: 0.8rem;
  }

  #sculpted-slot-tab .sh-keycap-badge {
    position: static;
    margin-left: 2px;
  }

  #sculpted-tab-caption {
    display: none;
  }

  /* --- TABLET GENSHIN BOTTOM-RIGHT ACTION CLUSTER (Matches 1000373930.jpg & 1000373931.webp) --- */
  /* Normal Attack (Large Middle Circle): right: 112px, bottom: 52px */
  #sculpted-hud-root.profile-tablet #sculpted-attack-btn {
    right: 108px;
    bottom: 48px;
    width: 104px;
    height: 104px;
  }

  /* Dash/Sprint (Bottom-Right Corner Circle): right: 24px, bottom: 22px */
  #sculpted-hud-root.profile-tablet #sculpted-dash-btn {
    right: 24px;
    bottom: 22px;
    width: 72px;
    height: 72px;
  }

  /* Jump (Top-Right Circle above Dash): right: 24px, bottom: 132px */
  #sculpted-hud-root.profile-tablet #sculpted-jump-btn {
    right: 24px;
    bottom: 132px;
    width: 72px;
    height: 72px;
  }

  /* Elemental Skill [E] (Bottom-Left of Normal Attack): right: 228px, bottom: 24px */
  #sculpted-hud-root.profile-tablet #sculpted-slot-e {
    right: 228px;
    bottom: 24px;
    width: 76px;
    height: 76px;
  }

  /* Elemental Burst [Q] (Left of E): right: 320px, bottom: 28px */
  #sculpted-hud-root.profile-tablet #sculpted-slot-q {
    right: 320px;
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
    height: 14px;
  }

  .sh-wave-bar {
    width: 2.5px;
    height: 8px;
    border-radius: 999px;
    background: #ffffff;
  }

  .sh-wave-bar:nth-child(1) { height: 6px; }
  .sh-wave-bar:nth-child(2) { height: 12px; }
  .sh-wave-bar:nth-child(3) { height: 15px; }
  .sh-wave-bar:nth-child(4) { height: 11px; }
  .sh-wave-bar:nth-child(5) { height: 6px; }

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
      partnerListening: false,
      elapsedSeconds: 0,
      maxSeconds: 30,
    },
    stats: {
      Knight: { level: 1, hp: 220, maxHp: 220, shield: 0 },
      Mage: { level: 1, hp: 90, maxHp: 90, shield: 0 },
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
              <div class="sh-hp-fill" id="sh-hp-fill-primary"></div>
              <div class="sh-shield-fill" id="sh-shield-fill-primary"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="sh-life-row" id="sh-life-row-partner" data-role="Mage" title="Click to swap hero in solo mode">
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
              <div class="sh-hp-fill" id="sh-hp-fill-partner"></div>
              <div class="sh-shield-fill" id="sh-shield-fill-partner"></div>
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

    <!-- 3. TOP-RIGHT: Minimal Translucent Pause Ring -->
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

    <!-- 4. LEFT HAND: Floating Movement Thumbstick (Tablet Only) & Right Orbit Zone -->
    <div id="sculpted-joystick-zone">
      <div class="sh-joy-ring" id="sh-joy-ring">
        <div class="sh-joy-puck" id="sh-joy-puck"></div>
      </div>
    </div>

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

      <!-- [E] Elemental Skill Ring (Colored Vertical Fill Up & Down) -->
      <button
        type="button"
        class="sh-open-ring sh-power-slot"
        id="sculpted-slot-e"
        data-power-slot="E"
        data-element="ice"
        aria-label="Elemental Skill E"
        title="Elemental Skill (E)"
      >
        <span class="sh-ring-clip"><span class="sh-vertical-fill" id="sh-fill-e"></span></span>
        <span id="sculpted-slot-e-icon">${SVG_ICE_CRYSTAL_GLYPH}</span>
        <span class="sh-slot-cd-badge" id="sculpted-slot-e-cd"></span>
        <span class="sh-keycap-badge">E</span>
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

    <!-- 6. RIGHT HAND GADGET SLOT: Commune [R] Ring (Colored Vertical Fill) -->
    <div id="sculpted-commune-wrap">
      <button
        type="button"
        class="sh-open-ring"
        id="sculpted-commune-btn"
        aria-label="Commune with the God of Love (R)"
        title="Tap or hold R to Commune"
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
        <span class="sh-keycap-badge">R</span>
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
        aria-label="Evade Dash"
      >
        ${SVG_DASH_GLYPH}
        <span class="sh-keycap-badge">Shift</span>
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

        <div class="sh-pill-group" style="margin-top: 4px;">
          <button type="button" class="sh-choice-pill" id="sculpted-pause-swap-btn">
            Swap Hero
          </button>
          <!-- DEV_SOLO_TEST_REMOVE_FOR_PROD -->
          <button type="button" class="sh-choice-pill" id="sculpted-pause-dev-stage-btn" title="Unlock next power stage for solo testing">
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
  const primaryEmblemEl = root.querySelector('#sh-emblem-primary');
  const partnerEmblemEl = root.querySelector('#sh-emblem-partner');
  const primaryNameEl = root.querySelector('#sh-name-primary');
  const partnerNameEl = root.querySelector('#sh-name-partner');
  const primaryHpNumEl = root.querySelector('#sh-hp-num-primary');
  const partnerHpNumEl = root.querySelector('#sh-hp-num-partner');
  const primaryHpFill = root.querySelector('#sh-hp-fill-primary');
  const primaryShieldFill = root.querySelector('#sh-shield-fill-primary');
  const partnerHpFill = root.querySelector('#sh-hp-fill-partner');
  const partnerShieldFill = root.querySelector('#sh-shield-fill-partner');

  const vitalityBar = root.querySelector('#sculpted-vitality-bar');
  const vitalityText = root.querySelector('#sculpted-vitality-text');
  const vitalityHpFill = root.querySelector('#sculpted-vitality-hp-fill');
  const vitalityShieldFill = root.querySelector('#sculpted-vitality-shield-fill');

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

  const attackBtn = root.querySelector('#sculpted-attack-btn');
  const attackIconSlot = root.querySelector('#sculpted-attack-icon-slot');
  const dashBtn = root.querySelector('#sculpted-dash-btn');
  const jumpBtn = root.querySelector('#sculpted-jump-btn');

  const pauseModal = root.querySelector('#sculpted-pause-modal');
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

  function renderRoleAndPartyBars() {
    const isKnightLeader = state.activeRole !== 'Mage';
    const primaryRole = isKnightLeader ? 'Knight' : 'Mage';
    const partnerRole = isKnightLeader ? 'Mage' : 'Knight';

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
      primaryHpNumEl.textContent = shInt > 0 ? `${hpInt}+${shInt}/${maxHpInt}` : `${hpInt}/${maxHpInt}`;
    }

    const sPct = clamp((sStat.hp / Math.max(1, sStat.maxHp)) * 100, 0, 100);
    const sShieldPct = clamp((sStat.shield / Math.max(1, sStat.maxHp)) * 100, 0, 100);
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
      partnerHpNumEl.textContent = `${sHpInt}/${sMaxHpInt}`;
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

    if (communeWrap) {
      communeWrap.classList.toggle(
        'is-unlocked',
        Boolean(state.communeDiscovered || anyElementUnlocked || ultUnlocked)
      );
      communeWrap.classList.toggle('is-listening', Boolean(state.commune.listening));
    }
    if (communeBtn) {
      communeBtn.classList.toggle(
        'is-partner-communing',
        Boolean(state.commune.partnerListening && !state.commune.listening)
      );
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
    }

    if (slotQ) {
      slotQ.classList.toggle('is-unlocked', ultUnlocked);
      const qCd = Number(state.cooldowns.Q) || 0;
      const maxQCd = 24.0;
      slotQ.classList.toggle('on-cooldown', qCd > 0.08);
      if (slotQCd) {
        slotQCd.textContent = qCd > 0.08 ? `${qCd.toFixed(1)}s` : '';
      }
      if (fillQ) {
        const qFillPct = qCd > 0.08 ? clamp((1 - qCd / maxQCd) * 100, 8, 95) : 100;
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
    }
    if (typeof names.Mage === 'string' && names.Mage.trim()) {
      state.playerNames.Mage = names.Mage.trim();
    }
    renderRoleAndPartyBars();
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
      }
    }
    if (typeof patch.partnerListening === 'boolean') {
      state.commune.partnerListening = patch.partnerListening;
    }
    if (typeof patch.elapsedSeconds === 'number') {
      state.commune.elapsedSeconds = clamp(patch.elapsedSeconds, 0, state.commune.maxSeconds);
    }
    if (typeof patch.maxSeconds === 'number' && patch.maxSeconds > 0) {
      state.commune.maxSeconds = patch.maxSeconds;
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
  }

  function closePauseModal() {
    pauseModal?.classList.remove('is-open');
    if (lastFocusedBeforePause && typeof lastFocusedBeforePause.focus === 'function') {
      lastFocusedBeforePause.focus();
    } else {
      pauseBtn?.focus();
    }
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
    joyRing?.classList.remove('is-sprinting');
  }

  if (joyZone && joyRing) {
    joyZone.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      try {
        joyZone.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      joyState.active = true;
      joyState.pointerId = e.pointerId;
      const rect = joyRing.getBoundingClientRect();
      joyState.originX = rect.left + rect.width * 0.5;
      joyState.originY = rect.top + rect.height * 0.5;
      updateJoystickFromPoint(e.clientX, e.clientY);
    });

    joyZone.addEventListener('pointermove', (e) => {
      if (!joyState.active || e.pointerId !== joyState.pointerId) return;
      e.stopPropagation();
      updateJoystickFromPoint(e.clientX, e.clientY);
    });

    const endJoy = (e) => {
      if (!joyState.active || e.pointerId !== joyState.pointerId) return;
      resetJoystick();
    };
    joyZone.addEventListener('pointerup', endJoy);
    joyZone.addEventListener('pointercancel', endJoy);
  }

  // Right-side Touch Camera Orbit
  let orbitPointerId = null;
  let lastOrbitX = 0;
  let lastOrbitY = 0;

  if (orbitZone) {
    orbitZone.addEventListener('pointerdown', (e) => {
      if (orbitPointerId !== null) return;
      orbitPointerId = e.pointerId;
      lastOrbitX = e.clientX;
      lastOrbitY = e.clientY;
      try {
        orbitZone.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    });

    orbitZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== orbitPointerId) return;
      const dx = e.clientX - lastOrbitX;
      const dy = e.clientY - lastOrbitY;
      lastOrbitX = e.clientX;
      lastOrbitY = e.clientY;
      if (typeof onCameraOrbit === 'function') {
        onCameraOrbit(dx, dy);
      }
    });

    const endOrbit = (e) => {
      if (e.pointerId === orbitPointerId) {
        orbitPointerId = null;
      }
    };
    orbitZone.addEventListener('pointerup', endOrbit);
    orbitZone.addEventListener('pointercancel', endOrbit);
  }

  // Primary Attack Ring: Tap (< 180ms Mage / < 280ms Knight) = 'attack',
  // Hold = Knight 'block_start' / Mage 'heavy' + Hold-Drag-Release Shatterlance aiming (0.8..18.0m)
  let attackHoldTimer = null;
  let attackHeldTriggered = false;
  let attackPointerId = null;
  let attackOriginX = 0;
  let attackOriginY = 0;
  let attackLastX = 0;
  let attackLastY = 0;

  if (attackBtn) {
    attackBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      try {
        attackBtn.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      attackPointerId = e.pointerId;
      attackOriginX = e.clientX;
      attackOriginY = e.clientY;
      attackLastX = e.clientX;
      attackLastY = e.clientY;
      attackHeldTriggered = false;
      if (typeof onAction === 'function') {
        onAction('attack', { role: state.activeRole });
      }
      if (attackHoldTimer) clearTimeout(attackHoldTimer);
      const holdMs = state.activeRole === 'Mage' ? 180 : 280;
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
          clientX: e.clientX,
          clientY: e.clientY,
          dx,
          dy,
        });
      }
    });

    const releaseAttack = (e) => {
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
  }

  // Real-Use-Case Fix #3: Dashing while holding [E] cancels aim cleanly without consuming cooldown
  let eAimActive = false;
  let ePointerId = null;
  let eOriginX = 0;
  let eOriginY = 0;

  function cancelSlotEAim() {
    if (!eAimActive) return;
    eAimActive = false;
    ePointerId = null;
  }

  if (dashBtn) {
    dashBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelSlotEAim();
      if (typeof onAction === 'function') {
        onAction('dash', { role: state.activeRole });
      }
    });
  }

  if (jumpBtn) {
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
      if (!anyEl) return;
      try {
        slotE.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      const rect = slotE.getBoundingClientRect();
      eOriginX = rect.left + rect.width * 0.5;
      eOriginY = rect.top + rect.height * 0.5;
      ePointerId = e.pointerId;
      eAimActive = true;

      if (state.activeRole === 'Knight') {
        if (typeof onAction === 'function') {
          onAction('skill_e', { role: 'Knight', element: state.activeElement });
        }
        if (typeof onAimStart === 'function') {
          onAimStart({
            slot: 'E',
            role: 'Knight',
            element: state.activeElement,
            clientX: e.clientX,
            clientY: e.clientY,
            dx: 0,
            dy: 0,
          });
        }
      } else if (typeof onAimStart === 'function') {
        onAimStart({
          slot: 'E',
          role: 'Mage',
          element: state.activeElement,
          clientX: e.clientX,
          clientY: e.clientY,
          dx: 0,
          dy: 0,
        });
      }
    });

    slotE.addEventListener('pointermove', (e) => {
      if (!eAimActive || e.pointerId !== ePointerId) return;
      e.stopPropagation();
      const dx = e.clientX - eOriginX;
      const dy = e.clientY - eOriginY;
      if (typeof onAimMove === 'function') {
        onAimMove({
          slot: 'E',
          role: state.activeRole,
          element: state.activeElement,
          clientX: e.clientX,
          clientY: e.clientY,
          dx,
          dy,
        });
      }
    });

    const releaseSlotE = (e) => {
      if (!eAimActive) return;
      const dx = (e?.clientX ?? eOriginX) - eOriginX;
      const dy = (e?.clientY ?? eOriginY) - eOriginY;
      eAimActive = false;
      ePointerId = null;
      if (state.activeRole === 'Mage') {
        if (typeof onAimRelease === 'function') {
          onAimRelease({
            slot: 'E',
            role: 'Mage',
            element: state.activeElement,
            clientX: e?.clientX ?? eOriginX,
            clientY: e?.clientY ?? eOriginY,
            dx,
            dy,
          });
        } else if (typeof onAction === 'function') {
          onAction('skill_e', { role: 'Mage', element: state.activeElement });
        }
      }
    };
    slotE.addEventListener('pointerup', releaseSlotE);
    slotE.addEventListener('pointercancel', cancelSlotEAim);
  }

  // [Tab] Element Toggle Ring (visible only when BOTH Ice & Fire are solved)
  if (slotTab) {
    slotTab.addEventListener('click', (e) => {
      e.stopPropagation();
      const bothEl =
        (state.iceUnlocked && state.fireUnlocked) || state.unlockedStage >= 2;
      if (!bothEl) return;
      state.activeElement = state.activeElement === 'ice' ? 'fire' : 'ice';
      state.tabSwitchHintDismissed = true;
      renderProgressionAndSlots();
      if (typeof onToggleElement === 'function') {
        onToggleElement(state.activeElement);
      }
    });
  }

  // [Q] Personal Ultimate Ring
  if (slotQ) {
    slotQ.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.ultimateUnlocked && state.unlockedStage < 3) return;
      if (typeof onAction === 'function') {
        onAction('ultimate', { role: state.activeRole, element: state.activeElement });
      }
    });
  }

  // Commune [R] Ring (toggles listening start / stop-and-send)
  if (communeBtn) {
    communeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const anyEl = state.iceUnlocked || state.fireUnlocked || state.unlockedStage >= 1;
      if (!state.communeDiscovered && !anyEl && !state.ultimateUnlocked) return;
      const nextListening = !state.commune.listening;
      setCommuneState({
        listening: nextListening,
        elapsedSeconds: nextListening ? 0 : state.commune.elapsedSeconds,
      });
      if (typeof onCommuneToggle === 'function') {
        onCommuneToggle(nextListening);
      }
    });
  }

  function triggerHeroSwap() {
    state.activeRole = state.activeRole === 'Knight' ? 'Mage' : 'Knight';
    renderRoleAndPartyBars();
    if (typeof onSwapHero === 'function') {
      onSwapHero(state.activeRole);
    }
  }

  if (partnerRowEl) {
    partnerRowEl.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerHeroSwap();
    });
  }

  // Pause Popover Controls
  if (pauseBtn) {
    pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pauseModal?.classList.contains('is-open')) {
        closePauseModal();
      } else {
        openPauseModal();
      }
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
      const prof = btn.dataset.profileChoice || 'desktop';
      setProfileMode(prof);
      if (typeof onSelectProfile === 'function') {
        onSelectProfile(prof);
      }
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

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onGlobalKeyDown);
  }

  /* ----------------------------------------------------------------------- */
  /* State Setters for Main Game Loop                                        */
  /* ----------------------------------------------------------------------- */

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
      if (
        ((state.iceUnlocked && state.fireUnlocked) || state.unlockedStage >= 2) &&
        element !== state.activeElement
      ) {
        state.tabSwitchHintDismissed = true;
      }
      state.activeElement = element;
      renderProgressionAndSlots();
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
  } = {}) {
    if (activeRole === 'Knight' || activeRole === 'Mage') {
      state.activeRole = activeRole;
    }
    if (names) {
      setPlayerNames(names);
    }
    if (activeElement === 'ice' || activeElement === 'fire') {
      state.activeElement = activeElement;
    }
    if (activeSwordBuffElement !== undefined) {
      state.activeSwordBuffElement = activeSwordBuffElement;
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
      state.stats.Knight = {
        level: knight.level ?? state.stats.Knight.level ?? 1,
        hp: knight.hp ?? state.stats.Knight.hp,
        maxHp: knight.maxHp ?? state.stats.Knight.maxHp,
        shield: knight.shield ?? 0,
      };
    }
    if (mage) {
      if (typeof mage.name === 'string' && mage.name.trim()) {
        state.playerNames.Mage = mage.name.trim();
      }
      state.stats.Mage = {
        level: mage.level ?? state.stats.Mage.level ?? 1,
        hp: mage.hp ?? state.stats.Mage.hp,
        maxHp: mage.maxHp ?? state.stats.Mage.maxHp,
        shield: mage.shield ?? 0,
      };
    }
    if (cooldowns) {
      if (typeof cooldowns.E === 'number') state.cooldowns.E = cooldowns.E;
      if (typeof cooldowns.Q === 'number') state.cooldowns.Q = cooldowns.Q;
      if (typeof cooldowns.eBuffRemaining === 'number') {
        state.cooldowns.eBuffRemaining = cooldowns.eBuffRemaining;
      }
    }
    renderRoleAndPartyBars();
    renderProgressionAndSlots();
  }

  // Initial render (Starts Bare: Stage 0, communeDiscovered = false)
  setProfileMode(state.profile);
  syncEnvironmentPolarity();
  renderRoleAndPartyBars();
  renderProgressionAndSlots();

  return {
    root,
    joyState,
    get isOrbitDragging() {
      return orbitPointerId !== null;
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
      }
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('sculpted-hud-mounted');
      }
      root.remove();
    },
  };
}
