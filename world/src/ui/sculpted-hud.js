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
/* Multi-Layered Crafted Portrait, Weapon & Elemental Medallion SVGs         */
/* ------------------------------------------------------------------------- */

const SVG_ROLE_KNIGHT_EMBLEM = `
<svg class="sh-role-emblem-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <defs>
    <clipPath id="sh-clip-knight-emblem"><circle cx="32" cy="32" r="29.5"/></clipPath>
  </defs>
  <circle cx="32" cy="32" r="29.5" fill="#1b1822"/>
  <image href="/world/assets/textures/hud/knight-emblem.png" x="1" y="1" width="62" height="62" preserveAspectRatio="xMidYMid slice" clip-path="url(#sh-clip-knight-emblem)"/>
  <circle cx="32" cy="32" r="29.5" stroke="#f7efe2" stroke-width="1.5" opacity="0.85"/>
</svg>
`;

const SVG_ROLE_MAGE_EMBLEM = `
<svg class="sh-role-emblem-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <defs>
    <clipPath id="sh-clip-mage-emblem"><circle cx="32" cy="32" r="29.5"/></clipPath>
  </defs>
  <circle cx="32" cy="32" r="29.5" fill="#1b1822"/>
  <image href="/world/assets/textures/hud/mage-emblem.png" x="1" y="1" width="62" height="62" preserveAspectRatio="xMidYMid slice" clip-path="url(#sh-clip-mage-emblem)"/>
  <circle cx="32" cy="32" r="29.5" stroke="#f7efe2" stroke-width="1.5" opacity="0.85"/>
</svg>
`;

const SVG_HP_BLOSSOM_CAP = `
<svg class="sh-hp-blossom-cap-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <g transform="translate(12, 12)">
    <path d="M0 -2 C-4.2 -10.5, 4.2 -10.5, 0 -2 Z" fill="#fffdf9" stroke="rgba(42,24,18,0.55)" stroke-width="0.9" transform="rotate(0)"/>
    <path d="M0 -2 C-4.2 -10.5, 4.2 -10.5, 0 -2 Z" fill="#fffdf9" stroke="rgba(42,24,18,0.55)" stroke-width="0.9" transform="rotate(72)"/>
    <path d="M0 -2 C-4.2 -10.5, 4.2 -10.5, 0 -2 Z" fill="#fffdf9" stroke="rgba(42,24,18,0.55)" stroke-width="0.9" transform="rotate(144)"/>
    <path d="M0 -2 C-4.2 -10.5, 4.2 -10.5, 0 -2 Z" fill="#fffdf9" stroke="rgba(42,24,18,0.55)" stroke-width="0.9" transform="rotate(216)"/>
    <path d="M0 -2 C-4.2 -10.5, 4.2 -10.5, 0 -2 Z" fill="#fffdf9" stroke="rgba(42,24,18,0.55)" stroke-width="0.9" transform="rotate(288)"/>
    <circle cx="0" cy="0" r="2.8" fill="#fbbf24"/>
  </g>
</svg>
`;

const SVG_ATTACK_SWORD = `
<svg class="sh-action-icon-svg sh-sword-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <defs>
    <clipPath id="sh-clip-atk-sword"><circle cx="32" cy="32" r="29"/></clipPath>
  </defs>
  <image href="/world/assets/textures/hud/attack-sword.png" x="1" y="1" width="62" height="62" preserveAspectRatio="xMidYMid slice" clip-path="url(#sh-clip-atk-sword)"/>
</svg>
`;

const SVG_ATTACK_STAFF = `
<svg class="sh-action-icon-svg sh-staff-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <defs>
    <clipPath id="sh-clip-atk-staff"><circle cx="32" cy="32" r="29"/></clipPath>
  </defs>
  <image href="/world/assets/textures/hud/attack-staff.png" x="1" y="1" width="62" height="62" preserveAspectRatio="xMidYMid slice" clip-path="url(#sh-clip-atk-staff)"/>
</svg>
`;

const SVG_DASH_GLYPH = `
<svg class="sh-action-icon-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <!-- Crisp Speed Wind Lines -->
  <line x1="6" y1="19" x2="17" y2="19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="4" y1="25.5" x2="14" y2="25.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="8" y1="32" x2="16" y2="32" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>
  <!-- Dynamic Sprinting Figure -->
  <circle cx="34.5" cy="12.5" r="4.2" fill="currentColor"/>
  <!-- Torso leaning forward -->
  <path d="M22 20 L31 18 L39 22.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M30.5 18.5 L25.5 27.5 L33.5 31 L30 39.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M25.5 27.5 L18.5 31.5 L13.5 37.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const SVG_JUMP_GLYPH = `
<svg class="sh-action-icon-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <!-- Sweeping Curved Upward Leap Arrow (Matching Target 02) -->
  <path
    d="M24 9 L14.5 20.5 H20.5 C20.5 28, 18.5 33, 14 36.5 C22.5 34.5, 27.5 28.5, 27.5 20.5 H33.5 L24 9 Z"
    fill="currentColor"
  />
  <!-- Ground Launch Arc -->
  <path d="M12 39.5 Q24 35.5 36 39.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M16.5 42.5 Q24 40 31.5 42.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.78"/>
</svg>
`;

const SVG_SACRED_LOTUS = `
<svg class="sh-lotus-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <defs>
    <clipPath id="sh-clip-commune-lotus"><circle cx="24" cy="24" r="22"/></clipPath>
  </defs>
  <image href="/world/assets/textures/hud/skill-commune.png" x="1" y="1" width="46" height="46" preserveAspectRatio="xMidYMid slice" clip-path="url(#sh-clip-commune-lotus)"/>
</svg>
`;

const SVG_ICE_CRYSTAL_GLYPH = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <defs>
    <clipPath id="sh-clip-skill-ice"><circle cx="24" cy="24" r="22"/></clipPath>
  </defs>
  <image href="/world/assets/textures/hud/skill-ice.png" x="1" y="1" width="46" height="46" preserveAspectRatio="xMidYMid slice" clip-path="url(#sh-clip-skill-ice)"/>
</svg>
`;

const SVG_FIRE_SUNFIRE_GLYPH = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <defs>
    <clipPath id="sh-clip-skill-fire"><circle cx="24" cy="24" r="22"/></clipPath>
  </defs>
  <image href="/world/assets/textures/hud/skill-fire.png" x="1" y="1" width="46" height="46" preserveAspectRatio="xMidYMid slice" clip-path="url(#sh-clip-skill-fire)"/>
</svg>
`;

const SVG_TAB_SWAP_GLYPH = `
<svg class="sh-tab-glyph-svg" viewBox="0 0 52 32" fill="none" aria-hidden="true">
  <!-- Left: Cyan Snowflake Crystal -->
  <g transform="translate(11, 16)" stroke="#7dd3fc" stroke-width="1.8" stroke-linecap="round">
    <line x1="0" y1="-7.5" x2="0" y2="7.5"/>
    <line x1="-6.5" y1="-3.8" x2="6.5" y2="3.8"/>
    <line x1="-6.5" y1="3.8" x2="6.5" y2="-3.8"/>
    <circle cx="0" cy="0" r="2.0" fill="#e0f2fe" stroke="none"/>
  </g>
  <!-- Center: Crisp Arrow -->
  <path d="M21 16 H30 M26.8 12.5 L30.5 16 L26.8 19.5" stroke="#fffdf9" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Right: Warm Amber Flame -->
  <path
    d="M40.5 7.5 C44.5 12, 47 15.5, 45.8 20.5 C44.8 23.8, 42.6 25.5, 40.5 25.5 C38.4 25.5, 36.2 23.8, 35.2 20.5 C34 15.5, 36.5 12, 40.5 7.5 Z"
    fill="#fb923c"
    stroke="#fde68a"
    stroke-width="1.2"
  />
  <path
    d="M40.5 14 C42.4 16.5, 43.2 18.8, 42.5 21.5 C41.9 23.2, 41.2 24, 40.5 24 C39.8 24, 39.1 23.2, 38.5 21.5 C37.8 18.8, 38.6 16.5, 40.5 14 Z"
    fill="#fef08a"
  />
</svg>
`;

const SVG_ULTIMATE_STORM_VORTEX = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <defs>
    <clipPath id="sh-clip-skill-ult"><circle cx="24" cy="24" r="22"/></clipPath>
  </defs>
  <image href="/world/assets/textures/hud/skill-ultimate.png" x="1" y="1" width="46" height="46" preserveAspectRatio="xMidYMid slice" clip-path="url(#sh-clip-skill-ult)"/>
</svg>
`;

/* ------------------------------------------------------------------------- */
/* Environment-Adaptive Solid Matte Cel-Shaded Medallion HUD CSS (ZERO Glass)*/
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
  [data-env-polarity="day"] {
    --hud-ink: #fffdf9;
    --hud-ink-muted: #f5ede2;
    --hud-ring-border: #f7efe2;
    --hud-ring-inner: rgba(251, 211, 107, 0.55);
    --hud-ring-fill: #1b1822;
    --hud-shadow: rgba(18, 12, 20, 0.85);
    --hud-accent: #fbd36b;
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

  #sculpted-hud-root {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 26;
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, "Palatino Linotype", serif;
    color: var(--hud-ink);
    user-select: none;
    -webkit-user-select: none;
  }

  #sculpted-hud-root.is-hidden {
    display: none;
  }

  /* ----------------------------------------------------------------------- */
  /* Solid Matte Cel-Shaded Double-Ring Medallion Recipe (Zero Glass/Blur)   */
  /* ----------------------------------------------------------------------- */
  .sh-open-ring {
    position: absolute;
    appearance: none;
    pointer-events: auto;
    touch-action: none;
    cursor: pointer;
    border-radius: 50%;
    background: var(--hud-ring-fill);
    border: 2.2px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 3px var(--hud-ring-fill),
      inset 0 0 0 4.2px var(--hud-ring-inner),
      0 4px 12px var(--hud-shadow);
    color: var(--hud-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
    transition-property: transform, border-color, background-color, opacity;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  [data-env-polarity="eclipse"] #sculpted-attack-btn {
    border-color: #fb7185;
    box-shadow:
      inset 0 0 0 3px var(--hud-ring-fill),
      inset 0 0 0 4.2px rgba(225, 29, 72, 0.72),
      0 4px 16px rgba(225, 29, 72, 0.55);
  }

  @media (hover: hover) {
    .sh-open-ring:not(:disabled):hover {
      border-color: var(--hud-accent);
      background-color: #282332;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .sh-open-ring:not(:disabled):active,
    .sh-open-ring.is-pressed:not(:disabled) {
      transform: scale(0.95);
    }
  }

  .sh-open-ring:focus-visible,
  .sh-choice-pill:focus-visible,
  .sh-modal-close-btn:focus-visible {
    outline: 2px solid var(--hud-accent);
    outline-offset: 3px;
  }

  /* ----------------------------------------------------------------------- */
  /* 1. Top-Left Party Strip (#sculpted-party-bars) — Target 02 & 03         */
  /* ----------------------------------------------------------------------- */
  #sculpted-party-bars {
    position: absolute;
    top: max(16px, env(safe-area-inset-top, 0px));
    left: max(18px, env(safe-area-inset-left, 0px));
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
    z-index: 28;
  }

  .sh-life-row {
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: none;
  }

  .sh-emblem-ring {
    position: relative;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: var(--hud-ring-fill);
    border: 2.2px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 2.5px var(--hud-ring-fill),
      inset 0 0 0 3.7px var(--hud-ring-inner),
      0 3px 10px var(--hud-shadow);
    color: var(--hud-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .sh-life-row.is-leader .sh-emblem-ring {
    width: 60px;
    height: 60px;
    border-color: var(--hud-accent);
  }

  .sh-role-emblem-svg {
    width: 50px;
    height: 50px;
    display: block;
  }

  .sh-life-row.is-leader .sh-role-emblem-svg {
    width: 56px;
    height: 56px;
  }

  .sh-party-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .sh-player-name-lbl {
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-size: 1.18rem;
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: 0.01em;
    color: var(--hud-ink);
    background: var(--hud-ring-fill);
    border: 1.5px solid var(--hud-ring-border);
    padding: 2px 10px;
    border-radius: 999px;
    box-shadow: 0 2px 6px var(--hud-shadow);
    white-space: nowrap;
  }

  .sh-life-row.is-leader .sh-player-name-lbl {
    font-size: 1.26rem;
  }

  .sh-hp-bar-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .sh-hp-channel {
    position: relative;
    width: 198px;
    height: 11px;
    border-radius: 999px;
    background: var(--hud-ring-fill);
    border: 1.8px solid var(--hud-ring-border);
    box-shadow: 0 2px 6px var(--hud-shadow);
    overflow: hidden;
  }

  .sh-life-row.is-leader .sh-hp-channel {
    width: 224px;
    height: 12px;
  }

  .sh-hp-fill {
    position: relative;
    height: 100%;
    width: 100%;
    border-radius: 999px;
    background: #22c55e;
    transition: width 150ms ease-out;
  }

  .sh-hp-fill::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 42%;
    background: #4ade80;
    pointer-events: none;
  }

  .sh-hp-fill.is-low {
    background: #e11d48;
  }

  .sh-hp-fill.is-low::after {
    background: #fb7185;
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

  .sh-hp-blossom-cap-svg {
    position: absolute;
    right: -10px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    filter: drop-shadow(0 1px 4px var(--hud-shadow));
    pointer-events: none;
  }

  /* ----------------------------------------------------------------------- */
  /* 2. Bottom-Center Active Vitality Bar (#sculpted-vitality-bar)           */
  /* ----------------------------------------------------------------------- */
  #sculpted-vitality-bar {
    position: absolute;
    left: 50%;
    bottom: max(18px, env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    pointer-events: none;
    z-index: 27;
  }

  .sh-vitality-numbers {
    font-family: "Cormorant Garamond", "Cinzel", Georgia, serif;
    font-variant-numeric: tabular-nums;
    font-size: 1.04rem;
    font-weight: 700;
    line-height: 1.05;
    color: var(--hud-ink);
    background: var(--hud-ring-fill);
    border: 1.5px solid var(--hud-ring-border);
    padding: 2px 10px;
    border-radius: 999px;
    box-shadow: 0 2px 6px var(--hud-shadow);
    letter-spacing: 0.03em;
  }

  .sh-vitality-track {
    position: relative;
    width: 244px;
    height: 10px;
    border-radius: 999px;
    background: var(--hud-ring-fill);
    border: 1.8px solid var(--hud-ring-border);
    box-shadow: 0 2px 6px var(--hud-shadow);
    overflow: hidden;
  }

  #sculpted-vitality-bar.is-blessed .sh-vitality-track {
    border-color: #fbd36b;
    box-shadow: 0 2px 8px var(--hud-shadow);
  }

  /* ----------------------------------------------------------------------- */
  /* 3. Top-Right Minimal Pause Ring (#sculpted-pause-btn)                   */
  /* ----------------------------------------------------------------------- */
  #sculpted-pause-btn {
    top: max(16px, env(safe-area-inset-top, 0px));
    right: max(18px, env(safe-area-inset-right, 0px));
    width: 48px;
    height: 48px;
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
    height: 16px;
    border-radius: 1.5px;
    background: var(--hud-ink);
  }

  /* ----------------------------------------------------------------------- */
  /* 4. Left Hand Floating Thumbstick (Tablet Only: 38px, 36px, 152x152px)   */
  /* ----------------------------------------------------------------------- */
  #sculpted-joystick-zone {
    position: absolute;
    left: 38px;
    bottom: 36px;
    width: 152px;
    height: 152px;
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
    width: 152px;
    height: 152px;
    border-radius: 50%;
    background: var(--hud-ring-fill);
    border: 2.2px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 4px var(--hud-ring-fill),
      inset 0 0 0 5.2px var(--hud-ring-inner),
      0 4px 12px var(--hud-shadow);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sh-joy-ring.is-sprinting {
    border-color: var(--hud-accent);
  }

  .sh-joy-puck {
    width: 58px;
    height: 58px;
    border-radius: 50%;
    background: #282332;
    border: 2.2px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 2px #282332,
      inset 0 0 0 3.2px var(--hud-ring-inner),
      0 3px 10px var(--hud-shadow);
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
  /* 5. Commanding 2-Ring Concentric Fan Arc (Tablet & Desktop)              */
  /* ----------------------------------------------------------------------- */
  #sculpted-action-cluster,
  #sculpted-powers-dock,
  #sculpted-commune-wrap {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 0;
    height: 0;
    overflow: visible;
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

  /* --- TABLET 2-RING CONCENTRIC FAN ARC (Verified >= 20.4px Clear Gap) --- */
  /* Attack (116x116): right: 28px, bottom: 26px (center (86, 84)) */
  #sculpted-hud-root.profile-tablet #sculpted-attack-btn {
    right: 28px;
    bottom: 26px;
    width: 116px;
    height: 116px;
  }

  /* Dash (74x74): right: 168px, bottom: 22px (center (205, 59), gap 26.6px) */
  #sculpted-hud-root.profile-tablet #sculpted-dash-btn {
    right: 168px;
    bottom: 22px;
    width: 74px;
    height: 74px;
  }

  /* Jump (74x74): right: 52px, bottom: 164px (center (89, 201), gap 22.0px) */
  #sculpted-hud-root.profile-tablet #sculpted-jump-btn {
    right: 52px;
    bottom: 164px;
    width: 74px;
    height: 74px;
  }

  /* [Tab] (68x68): right: 264px, bottom: 18px (center (298, 52), gap 22.3px) */
  #sculpted-hud-root.profile-tablet #sculpted-slot-tab {
    right: 264px;
    bottom: 18px;
    width: 68px;
    height: 68px;
  }

  /* [E] (78x78): right: 244px, bottom: 108px (center (283, 147), gap 23.2px) */
  #sculpted-hud-root.profile-tablet #sculpted-slot-e {
    right: 244px;
    bottom: 108px;
    width: 78px;
    height: 78px;
  }

  /* [Q] (76x76): right: 176px, bottom: 204px (center (214, 242), gap 40.4px) */
  #sculpted-hud-root.profile-tablet #sculpted-slot-q {
    right: 176px;
    bottom: 204px;
    width: 76px;
    height: 76px;
  }

  /* Commune [R] (76x76): right: 60px, bottom: 258px (center (98, 296), gap 20.4px) */
  #sculpted-hud-root.profile-tablet #sculpted-commune-btn {
    right: 60px;
    bottom: 258px;
    width: 76px;
    height: 76px;
  }

  /* --- DESKTOP COMMANDING CONCENTRIC FAN ARC (Matching Target 02) --- */
  #sculpted-hud-root.profile-desktop #sculpted-attack-btn {
    right: 28px;
    bottom: 24px;
    width: 96px;
    height: 96px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-dash-btn {
    right: 148px;
    bottom: 20px;
    width: 64px;
    height: 64px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-jump-btn {
    right: 48px;
    bottom: 144px;
    width: 64px;
    height: 64px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-slot-tab {
    right: 234px;
    bottom: 18px;
    width: 60px;
    height: 60px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-slot-e {
    right: 214px;
    bottom: 96px;
    width: 68px;
    height: 68px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-slot-q {
    right: 152px;
    bottom: 180px;
    width: 68px;
    height: 68px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-commune-btn {
    right: 52px;
    bottom: 228px;
    width: 68px;
    height: 68px;
  }

  /* Ring Icon Scaling (Tablet & Desktop) */
  #sculpted-attack-btn .sh-action-icon-svg {
    width: 64px;
    height: 64px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-attack-btn .sh-action-icon-svg {
    width: 54px;
    height: 54px;
  }

  #sculpted-dash-btn .sh-action-icon-svg,
  #sculpted-jump-btn .sh-action-icon-svg {
    width: 42px;
    height: 42px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-dash-btn .sh-action-icon-svg,
  #sculpted-hud-root.profile-desktop #sculpted-jump-btn .sh-action-icon-svg {
    width: 36px;
    height: 36px;
  }

  .sh-skill-glyph-svg {
    width: 46px;
    height: 46px;
  }

  #sculpted-hud-root.profile-desktop .sh-skill-glyph-svg {
    width: 40px;
    height: 40px;
  }

  .sh-tab-glyph-svg {
    width: 46px;
    height: 30px;
  }

  #sculpted-hud-root.profile-desktop .sh-tab-glyph-svg {
    width: 40px;
    height: 26px;
  }

  .sh-lotus-svg {
    width: 46px;
    height: 42px;
  }

  #sculpted-hud-root.profile-desktop .sh-lotus-svg {
    width: 40px;
    height: 36px;
  }

  /* Literary Serif Keycap Callout Badges (Solid Matte Cel-Ink Pill, Zero Glass) */
  .sh-keycap-badge {
    position: absolute;
    right: -4px;
    bottom: -6px;
    min-width: 24px;
    height: 20px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--hud-ring-fill);
    border: 1.5px solid var(--hud-ring-border);
    box-shadow: 0 2px 6px var(--hud-shadow);
    font-family: "Cormorant Garamond", "Cinzel", Georgia, serif;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--hud-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    pointer-events: none;
  }

  .sh-slot-cd-badge {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(27, 24, 34, 0.94);
    color: var(--hud-ink);
    font-family: "Cormorant Garamond", "Cinzel", Georgia, serif;
    font-variant-numeric: tabular-nums;
    font-size: 1.05rem;
    font-weight: 700;
    display: none;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .sh-power-slot.on-cooldown .sh-slot-cd-badge {
    display: flex;
  }

  #sculpted-slot-e[data-element="ice"] {
    border-color: #7dd3fc;
  }

  #sculpted-slot-e[data-element="fire"] {
    border-color: #fb923c;
  }

  #sculpted-slot-e.is-active-buff {
    box-shadow:
      inset 0 0 0 3px var(--hud-ring-fill),
      inset 0 0 0 4.5px var(--hud-accent),
      0 4px 14px var(--hud-shadow);
  }

  /* One-Time "Tab to switch" Solid Matte Cel-Ink Pill Callout to the left of [Tab] */
  #sculpted-tab-caption {
    position: absolute;
    right: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    background: var(--hud-ring-fill);
    border: 1.5px solid var(--hud-ring-border);
    padding: 2px 10px;
    border-radius: 999px;
    box-shadow: 0 2px 6px var(--hud-shadow);
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 0.88rem;
    font-style: italic;
    font-weight: 600;
    color: var(--hud-ink);
    white-space: nowrap;
    pointer-events: none;
    opacity: 1;
    transition: opacity 150ms ease-out;
  }

  #sculpted-tab-caption.is-dismissed {
    opacity: 0;
    visibility: hidden;
    display: none;
  }

  /* Inline Crimson Wave Bars + 00:24 Timer inside Commune [R] when Listening */
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
    border-color: #e11d48;
    box-shadow:
      inset 0 0 0 3px var(--hud-ring-fill),
      inset 0 0 0 4.2px rgba(225, 29, 72, 0.72),
      0 4px 16px rgba(225, 29, 72, 0.58);
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
    height: 15px;
  }

  .sh-wave-bar {
    width: 2.5px;
    height: 9px;
    border-radius: 999px;
    background: #fb7185;
  }

  .sh-wave-bar:nth-child(1) { height: 7px; }
  .sh-wave-bar:nth-child(2) { height: 13px; }
  .sh-wave-bar:nth-child(3) { height: 16px; background: #e11d48; }
  .sh-wave-bar:nth-child(4) { height: 12px; }
  .sh-wave-bar:nth-child(5) { height: 7px; }

  .sh-listening-timer {
    font-family: "Cormorant Garamond", "Cinzel", Georgia, serif;
    font-variant-numeric: tabular-nums;
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1;
    color: var(--hud-ink);
  }

  /* Partner Communing Solid Matte Cel-Ink Pill Indicator */
  #sculpted-partner-commune-tag {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 6px;
    padding: 2px 9px;
    border-radius: 999px;
    background: #1b1822;
    border: 1.5px solid #fb7185;
    box-shadow: 0 2px 6px var(--hud-shadow);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--hud-ink);
    white-space: nowrap;
    pointer-events: none;
    display: none;
  }

  #sculpted-commune-btn.is-partner-communing {
    border-color: #fb7185;
  }

  #sculpted-commune-btn.is-partner-communing #sculpted-partner-commune-tag {
    display: inline-flex;
  }

  /* ----------------------------------------------------------------------- */
  /* 6. Solid Matte Cel-Shaded Pause Modal (#sculpted-pause-modal)           */
  /* ----------------------------------------------------------------------- */
  .sh-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    pointer-events: auto;
    background: rgba(18, 14, 22, 0.58);
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
    border: 2px solid #f7efe2;
    background: #1b1822;
    box-shadow:
      inset 0 0 0 3px #1b1822,
      inset 0 0 0 4.5px var(--hud-ring-inner),
      0 12px 28px rgba(14, 10, 18, 0.85);
    color: var(--hud-ink);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
  }

  .sh-modal-title {
    font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-size: 1.65rem;
    font-style: italic;
    font-weight: 600;
    line-height: 1.15;
    color: #fffdf9;
    margin: 0;
  }

  .sh-stat-lbl {
    font-family: "Cinzel", "Cormorant Garamond", Georgia, serif;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--hud-ink-muted);
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
    padding: 7px 16px;
    border-radius: 999px;
    border: 1.6px solid #f7efe2;
    background: #282332;
    color: #fffdf9;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 1.02rem;
    font-weight: 600;
    -webkit-tap-highlight-color: transparent;
    transition: transform 150ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out;
  }

  .sh-choice-pill.is-selected,
  .sh-choice-pill[aria-pressed="true"] {
    border-color: #fffdf9;
    background: #fbd36b;
    color: #1b1822;
    font-weight: 700;
  }

  .sh-modal-close-btn {
    min-width: 140px;
    min-height: 40px;
    background: #f7efe2;
    color: #1b1822;
    border-color: #fbd36b;
    font-weight: 700;
  }
`;

/**
 * Creates the Amarante High-Craft Botanical-Celestial Medallion HUD & Two-Handed Xiaomi Pad 7 Arc.
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
    <!-- 1. TOP-LEFT: Borderless Party Strip (Chibi Hero Bust Portrait + Name + HP Bar + Blossom Cap) -->
    <div id="sculpted-party-bars" role="region" aria-label="Party Status">
      <div class="sh-life-row is-leader" id="sh-life-row-primary" data-role="Knight">
        <div class="sh-emblem-ring" id="sh-emblem-primary" data-role-emblem="Knight" aria-hidden="true">
          ${SVG_ROLE_KNIGHT_EMBLEM}
        </div>
        <div class="sh-party-meta">
          <span class="sh-player-name-lbl" id="sh-name-primary">Knight</span>
          <div class="sh-hp-bar-wrap">
            <div class="sh-hp-channel">
              <div class="sh-hp-fill" id="sh-hp-fill-primary"></div>
              <div class="sh-shield-fill" id="sh-shield-fill-primary"></div>
            </div>
            ${SVG_HP_BLOSSOM_CAP}
          </div>
        </div>
      </div>

      <div class="sh-life-row" id="sh-life-row-partner" data-role="Mage">
        <div class="sh-emblem-ring" id="sh-emblem-partner" data-role-emblem="Mage" aria-hidden="true">
          ${SVG_ROLE_MAGE_EMBLEM}
        </div>
        <div class="sh-party-meta">
          <span class="sh-player-name-lbl" id="sh-name-partner">Mage</span>
          <div class="sh-hp-bar-wrap">
            <div class="sh-hp-channel">
              <div class="sh-hp-fill" id="sh-hp-fill-partner"></div>
              <div class="sh-shield-fill" id="sh-shield-fill-partner"></div>
            </div>
            ${SVG_HP_BLOSSOM_CAP}
          </div>
        </div>
      </div>
    </div>

    <!-- 2. BOTTOM-CENTER: Active Vitality Bar (tabular-nums) -->
    <div id="sculpted-vitality-bar" role="status" aria-label="Active Hero Vitality">
      <span class="sh-vitality-numbers" id="sculpted-vitality-text">220 / 220</span>
      <div class="sh-vitality-track">
        <div class="sh-hp-fill" id="sculpted-vitality-hp-fill"></div>
        <div class="sh-shield-fill" id="sculpted-vitality-shield-fill"></div>
      </div>
    </div>

    <!-- 3. TOP-RIGHT: Minimal See-Through Pause Ring -->
    <button
      type="button"
      class="sh-open-ring"
      id="sculpted-pause-btn"
      aria-label="Pause and Atmosphere Settings"
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

    <!-- 5. RIGHT HAND OUTER SKILL ARC ([Tab], [E], [Q]) -->
    <div id="sculpted-powers-dock" role="toolbar" aria-label="Awakened Powers">
      <!-- [Tab] Element Toggle Ring (visible only when BOTH Ice & Fire are unlocked) -->
      <button
        type="button"
        class="sh-open-ring sh-power-slot"
        id="sculpted-slot-tab"
        data-power-slot="Tab"
        aria-label="Switch Ice and Fire Element (Tab)"
        title="Switch Element (Tab)"
      >
        <span id="sculpted-tab-caption">Tab to switch</span>
        <span id="sculpted-slot-tab-label">${SVG_TAB_SWAP_GLYPH}</span>
        <span class="sh-keycap-badge">[Tab]</span>
      </button>

      <!-- [E] Elemental Skill Ring (visible when Ice OR Fire is unlocked) -->
      <button
        type="button"
        class="sh-open-ring sh-power-slot"
        id="sculpted-slot-e"
        data-power-slot="E"
        data-element="ice"
        aria-label="Elemental Skill E"
        title="Elemental Skill (E)"
      >
        <span id="sculpted-slot-e-icon">${SVG_ICE_CRYSTAL_GLYPH}</span>
        <span class="sh-slot-cd-badge" id="sculpted-slot-e-cd"></span>
        <span class="sh-keycap-badge">[E]</span>
      </button>

      <!-- [Q] Personal Ultimate Ring (visible when Town Plaza Stone is solved) -->
      <button
        type="button"
        class="sh-open-ring sh-power-slot"
        id="sculpted-slot-q"
        data-power-slot="Q"
        aria-label="Personal Ultimate Q"
        title="Ultimate Awakening (Q)"
      >
        ${SVG_ULTIMATE_STORM_VORTEX}
        <span class="sh-slot-cd-badge" id="sculpted-slot-q-cd"></span>
        <span class="sh-keycap-badge">[Q]</span>
      </button>
    </div>

    <!-- 6. RIGHT HAND OUTER ARC: Commune [R] Ring -->
    <div id="sculpted-commune-wrap">
      <button
        type="button"
        class="sh-open-ring"
        id="sculpted-commune-btn"
        aria-label="Commune with the God of Love (R)"
        title="Tap or hold R to Commune"
      >
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
        <span class="sh-keycap-badge">[R]</span>
      </button>
    </div>

    <!-- 7. RIGHT HAND CENTER & INNER ARC: Attack, Dash, Jump Rings -->
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

    <!-- 8. MINIMAL TRANSPARENT HAIRLINE PAUSE POPOVER (#sculpted-pause-modal) -->
    <div
      class="sh-modal-backdrop"
      id="sculpted-pause-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sculpted-pause-title"
    >
      <div class="sh-modal-tablet">
        <h2 class="sh-modal-title" id="sculpted-pause-title">Sanctuary Pause</h2>

        <div style="width: 100%;">
          <div class="sh-stat-lbl" style="margin-bottom: 8px;">Sky Atmosphere</div>
          <div class="sh-pill-group" id="sculpted-tod-group">
            <button type="button" class="sh-choice-pill is-selected" data-tod-choice="day" aria-pressed="true">Morning</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="evening" aria-pressed="false">Golden Hour</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="twilight" aria-pressed="false">Twilight</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="night" aria-pressed="false">Starlit Night</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="auto" aria-pressed="false">Auto</button>
          </div>
        </div>

        <div style="width: 100%;">
          <div class="sh-stat-lbl" style="margin-bottom: 8px;">Hardware Profile</div>
          <div class="sh-pill-group" id="sculpted-profile-group">
            <button type="button" class="sh-choice-pill is-selected" data-profile-choice="desktop" aria-pressed="true">
              Desktop RX 6700
            </button>
            <button type="button" class="sh-choice-pill" data-profile-choice="tablet" aria-pressed="false">
              Xiaomi Pad 7
            </button>
          </div>
        </div>

        <div class="sh-pill-group" style="margin-top: 4px;">
          <button type="button" class="sh-choice-pill" id="sculpted-pause-swap-btn">
            Swap Hero
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
  const primaryEmblemEl = root.querySelector('#sh-emblem-primary');
  const partnerEmblemEl = root.querySelector('#sh-emblem-partner');
  const primaryNameEl = root.querySelector('#sh-name-primary');
  const partnerNameEl = root.querySelector('#sh-name-partner');
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
  const slotTab = root.querySelector('#sculpted-slot-tab');
  const tabCaption = root.querySelector('#sculpted-tab-caption');
  const slotQ = root.querySelector('#sculpted-slot-q');
  const slotQCd = root.querySelector('#sculpted-slot-q-cd');

  const communeWrap = root.querySelector('#sculpted-commune-wrap');
  const communeBtn = root.querySelector('#sculpted-commune-btn');
  const communeTimerEl = root.querySelector('#sculpted-commune-timer');

  const attackBtn = root.querySelector('#sculpted-attack-btn');
  const attackIconSlot = root.querySelector('#sculpted-attack-icon-slot');
  const dashBtn = root.querySelector('#sculpted-dash-btn');
  const jumpBtn = root.querySelector('#sculpted-jump-btn');

  const pauseModal = root.querySelector('#sculpted-pause-modal');
  const pauseSwapBtn = root.querySelector('#sculpted-pause-swap-btn');
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
  /* Render Synchronizers                                                    */
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

    const sPct = clamp((sStat.hp / Math.max(1, sStat.maxHp)) * 100, 0, 100);
    const sShieldPct = clamp((sStat.shield / Math.max(1, sStat.maxHp)) * 100, 0, 100);
    if (partnerHpFill) {
      partnerHpFill.style.width = `${sPct.toFixed(1)}%`;
      partnerHpFill.classList.toggle('is-low', sPct < 32);
    }
    if (partnerShieldFill) {
      partnerShieldFill.style.width = `${sShieldPct.toFixed(1)}%`;
    }

    // Bottom-Center Active Vitality Bar
    if (vitalityText) {
      const hpInt = Math.max(0, Math.round(pStat.hp));
      const maxHpInt = Math.max(1, Math.round(pStat.maxHp));
      const shieldInt = Math.max(0, Math.round(pStat.shield || 0));
      vitalityText.textContent =
        shieldInt > 0
          ? `${hpInt} + ${shieldInt} / ${maxHpInt}`
          : `${hpInt} / ${maxHpInt}`;
    }
    if (vitalityHpFill) {
      vitalityHpFill.style.width = `${pPct.toFixed(1)}%`;
      vitalityHpFill.classList.toggle('is-low', pPct < 32);
    }
    if (vitalityShieldFill) {
      vitalityShieldFill.style.width = `${pShieldPct.toFixed(1)}%`;
    }
    if (vitalityBar) {
      vitalityBar.classList.toggle('is-blessed', (pStat.shield || 0) > 0);
    }

    // Attack Ring Glyph: Broadsword for Knight, Crystal Staff for Mage
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

    if (slotE) {
      slotE.classList.toggle('is-unlocked', anyElementUnlocked);
      slotE.dataset.element = state.activeElement;
      const eCd = Number(state.cooldowns.E) || 0;
      slotE.classList.toggle('on-cooldown', eCd > 0.08);
      slotE.classList.toggle(
        'is-active-buff',
        (Number(state.cooldowns.eBuffRemaining) || 0) > 0.05
      );
      if (slotECd) {
        slotECd.textContent = eCd > 0.08 ? `${eCd.toFixed(1)}s` : '';
      }
    }

    if (slotEIcon) {
      slotEIcon.innerHTML =
        state.activeElement === 'fire' ? SVG_FIRE_SUNFIRE_GLYPH : SVG_ICE_CRYSTAL_GLYPH;
    }

    if (slotTab) {
      slotTab.classList.toggle('is-unlocked', bothElementsUnlocked);
    }
    if (tabCaption) {
      tabCaption.classList.toggle('is-dismissed', Boolean(state.tabSwitchHintDismissed));
    }

    if (slotQ) {
      slotQ.classList.toggle('is-unlocked', ultUnlocked);
      const qCd = Number(state.cooldowns.Q) || 0;
      slotQ.classList.toggle('on-cooldown', qCd > 0.08);
      if (slotQCd) {
        slotQCd.textContent = qCd > 0.08 ? `${qCd.toFixed(1)}s` : '';
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
