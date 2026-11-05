// ============================================================================
// world/src/ui/sculpted-hud.js
//
// Amarante - Genshin-Style See-Through Ring HUD & Two-Handed Xiaomi Pad 7 Arc:
//   - Environment-Adaptive Ink Polarity (`[data-env-polarity="day|golden|night|eclipse"]`)
//   - 82%+ transparent circular double-ring controls (ZERO backdrop-filter, ZERO ivy SVGs)
//   - Top-Left Borderless Party Strip (Circular portrait + typed player name + slim HP bar)
//   - Bottom-Center Active Vitality Bar (220 / 220 or 90 / 90 in tabular-nums + golden shimmer)
//   - Two-Handed Xiaomi Pad 7 Tablet Layout (`.profile-tablet`) vs Desktop KBM (`.profile-desktop`):
//       * Left Hand (Tablet Only): Floating movement thumbstick (`left: 44px, bottom: 44px, 132x132px`)
//       * Right Hand (Tablet 2-Ring Concentric Fan Arc with verified >= 17.95px clear finger gap):
//           - Attack (84x84): right: 36px, bottom: 36px (center (78, 78))
//           - Dash (54x54, r=108 at 192°): right: 157px, bottom: 29px (center (184, 56))
//           - Jump (54x54, r=108 at 98°): right: 66px, bottom: 158px (center (93, 185))
//           - [Tab] (46x46, r=189.5 at 196°): right: 242px, bottom: 24px (center (265, 47))
//           - [E] (62x62, r=179.7 at 164°): right: 224px, bottom: 96px (center (255, 127))
//           - [Q] (62x62, r=183.7 at 130°): right: 170px, bottom: 184px (center (201, 215))
//           - Commune [R] (56x56, r=186.5 at 96°): right: 68px, bottom: 234px (center (96, 262))
// ============================================================================

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function formatTimerMMSS(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/* ------------------------------------------------------------------------- */
/* Clean Single-Stroke Geometric Linework Glyphs (Zero Ivy Clutter)          */
/* ------------------------------------------------------------------------- */

const SVG_ROLE_KNIGHT_EMBLEM = `
<svg class="sh-role-emblem-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <path d="M18 5.5 L28 10 V18.5 C28 24.8 23.6 29.5 18 31.5 C12.4 29.5 8 24.8 8 18.5 V10 L18 5.5 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M18 9.5 V27 M12.5 16 H23.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
`;

const SVG_ROLE_MAGE_EMBLEM = `
<svg class="sh-role-emblem-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <polygon points="18,5 26.5,18 18,31 9.5,18" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="18" cy="18" r="4.2" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="18" cy="18" r="1.4" fill="currentColor"/>
</svg>
`;

const SVG_ATTACK_SWORD = `
<svg class="sh-action-icon-svg sh-sword-svg" viewBox="0 0 44 44" fill="none" aria-hidden="true">
  <g transform="translate(22, 22) rotate(38) translate(-22, -22)">
    <path d="M22 6 L25.5 12.5 L24.8 28.5 H19.2 L18.5 12.5 Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
    <line x1="22" y1="8" x2="22" y2="28" stroke="currentColor" stroke-width="1.2" opacity="0.75"/>
    <path d="M13.5 28.5 H30.5" stroke="currentColor" stroke-width="2.0" stroke-linecap="round"/>
    <line x1="22" y1="28.5" x2="22" y2="35.5" stroke="currentColor" stroke-width="2.0" stroke-linecap="round"/>
    <circle cx="22" cy="37.2" r="2.0" stroke="currentColor" stroke-width="1.5"/>
  </g>
</svg>
`;

const SVG_ATTACK_STAFF = `
<svg class="sh-action-icon-svg sh-staff-svg" viewBox="0 0 44 44" fill="none" aria-hidden="true">
  <g transform="translate(22, 22) rotate(38) translate(-22, -22)">
    <polygon points="22,6 27.5,12 24.5,18.5 19.5,18.5 16.5,12" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
    <circle cx="22" cy="12.5" r="2.0" fill="currentColor"/>
    <line x1="22" y1="18.5" x2="22" y2="38" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
    <line x1="18.5" y1="20.5" x2="25.5" y2="20.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </g>
</svg>
`;

const SVG_DASH_GLYPH = `
<svg class="sh-action-icon-svg" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <path d="M11 10 L19 16 L11 22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M17 10 L25 16 L17 22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="5.5" y1="16" x2="12" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.75"/>
</svg>
`;

const SVG_JUMP_GLYPH = `
<svg class="sh-action-icon-svg" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <path d="M10 16.5 L16 10 L22 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="16" y1="10.5" x2="16" y2="22.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M10.5 24.5 Q16 22.5 21.5 24.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>
</svg>
`;

const SVG_SACRED_LOTUS = `
<svg class="sh-lotus-svg" viewBox="0 0 36 32" fill="none" aria-hidden="true">
  <path d="M18 24 C10 24, 5 18.5, 6.5 12 C10.5 13.5, 14.5 17.5, 18 24 Z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/>
  <path d="M18 24 C26 24, 31 18.5, 29.5 12 C25.5 13.5, 21.5 17.5, 18 24 Z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/>
  <path d="M18 24 C12 21.5, 10 13, 13 7.5 C15.8 10.5, 17 16, 18 24 Z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/>
  <path d="M18 24 C24 21.5, 26 13, 23 7.5 C20.2 10.5, 19 16, 18 24 Z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/>
  <path d="M18 24.5 C14 19, 14 10, 18 4.5 C22 10, 22 19, 18 24.5 Z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/>
  <path d="M11.5 25.5 Q18 28 24.5 25.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
`;

const SVG_ICE_CRYSTAL_GLYPH = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <polygon points="18,5 24,14 18,31 12,14" stroke="#7dd3fc" stroke-width="1.7" stroke-linejoin="round"/>
  <line x1="18" y1="5" x2="18" y2="31" stroke="#e0f2fe" stroke-width="1.3"/>
  <line x1="10" y1="15" x2="26" y2="15" stroke="#7dd3fc" stroke-width="1.3" stroke-linecap="round"/>
</svg>
`;

const SVG_FIRE_SUNFIRE_GLYPH = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <path d="M18 6 C23.5 12.5, 27.5 16.5, 25.5 24 C24 28.5, 20.5 30.5, 18 30.5 C15.5 30.5, 12 28.5, 10.5 24 C8.5 16.5, 12.5 12.5, 18 6 Z" stroke="#fb923c" stroke-width="1.7" stroke-linejoin="round"/>
  <path d="M18 14.5 C20.8 18, 22.2 20.8, 21.2 24.8 C20.4 27, 19 28.2, 18 28.2 C17 28.2, 15.6 27, 14.8 24.8 C13.8 20.8, 15.2 18, 18 14.5 Z" stroke="#fde68a" stroke-width="1.3" stroke-linejoin="round"/>
</svg>
`;

const SVG_TAB_SWAP_GLYPH = `
<svg class="sh-tab-glyph-svg" viewBox="0 0 28 28" fill="none" aria-hidden="true">
  <path d="M8 10.5 H20 L16.5 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M20 17.5 H8 L11.5 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const SVG_ULTIMATE_STORM_VORTEX = `
<svg class="sh-skill-glyph-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <path d="M18 8 C24.5 8, 28.5 14, 25.5 20 C22.5 26, 14 24, 14.8 18.2 C15.4 14, 21 14, 20.4 18.2" stroke="#67e8f9" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M18 28 C11.5 28, 7.5 22, 10.5 16 C13.5 10, 22 12, 21.2 17.8" stroke="#fbd36b" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="18" cy="18" r="2.2" fill="#fffdf9"/>
</svg>
`;

/* ------------------------------------------------------------------------- */
/* Environment-Adaptive See-Through Ring HUD CSS (ZERO backdrop-filter)      */
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
    --hud-ink-muted: #f3ebe1;
    --hud-ring-border: rgba(255, 253, 249, 0.78);
    --hud-ring-inner: rgba(255, 253, 249, 0.34);
    --hud-ring-fill: rgba(20, 14, 22, 0.16);
    --hud-shadow: rgba(34, 16, 24, 0.82);
    --hud-accent: #fbd36b;
  }

  [data-env-polarity="golden"] {
    --hud-ink: #ffeed6;
    --hud-ink-muted: #f7d6b5;
    --hud-ring-border: rgba(255, 238, 214, 0.80);
    --hud-ring-inner: rgba(255, 214, 170, 0.36);
    --hud-ring-fill: rgba(32, 14, 24, 0.16);
    --hud-shadow: rgba(44, 18, 32, 0.85);
    --hud-accent: #fb923c;
  }

  [data-env-polarity="night"] {
    --hud-ink: #eef4ff;
    --hud-ink-muted: #cbd8f6;
    --hud-ring-border: rgba(238, 244, 255, 0.76);
    --hud-ring-inner: rgba(186, 208, 255, 0.32);
    --hud-ring-fill: rgba(14, 18, 38, 0.18);
    --hud-shadow: rgba(12, 16, 36, 0.88);
    --hud-accent: #7dd3fc;
  }

  [data-env-polarity="eclipse"] {
    --hud-ink: #ffe8ee;
    --hud-ink-muted: #f9becf;
    --hud-ring-border: rgba(255, 232, 238, 0.82);
    --hud-ring-inner: rgba(225, 29, 72, 0.48);
    --hud-ring-fill: rgba(32, 8, 18, 0.18);
    --hud-shadow: rgba(28, 6, 14, 0.90);
    --hud-accent: #e11d48;
  }

  #sculpted-hud-root {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 26;
    font-family: "Cormorant Garamond", Georgia, "Palatino Linotype", Palatino, serif;
    color: var(--hud-ink);
    user-select: none;
    -webkit-user-select: none;
  }

  #sculpted-hud-root.is-hidden {
    display: none;
  }

  /* ----------------------------------------------------------------------- */
  /* Shared 82% Transparent Circular Double-Ring Control Recipe              */
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
      inset 0 0 0 3px transparent,
      inset 0 0 0 4px var(--hud-ring-inner);
    color: var(--hud-ink);
    filter: drop-shadow(0 2px 6px var(--hud-shadow));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
    transition-property: transform, border-color, background-color, opacity;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  @media (hover: hover) {
    .sh-open-ring:not(:disabled):hover {
      border-color: var(--hud-ink);
      background-color: rgba(255, 253, 249, 0.18);
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .sh-open-ring:not(:disabled):active,
    .sh-open-ring.is-pressed:not(:disabled) {
      transform: scale(0.96);
    }
  }

  .sh-open-ring:focus-visible,
  .sh-choice-pill:focus-visible,
  .sh-modal-close-btn:focus-visible {
    outline: 2px solid var(--hud-accent);
    outline-offset: 3px;
  }

  /* ----------------------------------------------------------------------- */
  /* 1. Top-Left Borderless Party Strip (#sculpted-party-bars)               */
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
    gap: 10px;
    pointer-events: none;
  }

  .sh-emblem-ring {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--hud-ring-fill);
    border: 1.5px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 2px transparent,
      inset 0 0 0 3px var(--hud-ring-inner);
    color: var(--hud-ink);
    filter: drop-shadow(0 2px 6px var(--hud-shadow));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sh-life-row.is-leader .sh-emblem-ring {
    width: 46px;
    height: 46px;
    border-color: var(--hud-accent);
  }

  .sh-role-emblem-svg {
    width: 24px;
    height: 24px;
  }

  .sh-life-row.is-leader .sh-role-emblem-svg {
    width: 28px;
    height: 28px;
  }

  .sh-party-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .sh-player-name-lbl {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.15;
    color: var(--hud-ink);
    text-shadow: 0 1px 4px var(--hud-shadow);
    white-space: nowrap;
  }

  .sh-life-row.is-leader .sh-player-name-lbl {
    font-size: 0.9375rem;
  }

  .sh-hp-channel {
    position: relative;
    width: 136px;
    height: 6px;
    border-radius: 999px;
    background: rgba(18, 12, 16, 0.36);
    border: 1px solid var(--hud-ring-inner);
    overflow: hidden;
    filter: drop-shadow(0 1px 3px var(--hud-shadow));
  }

  .sh-life-row.is-leader .sh-hp-channel {
    width: 168px;
    height: 7px;
  }

  .sh-hp-fill {
    height: 100%;
    width: 100%;
    border-radius: 999px;
    background: #4ade80;
    transition: width 150ms ease-out;
  }

  .sh-hp-fill.is-low {
    background: #f43f5e;
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
    gap: 3px;
    pointer-events: none;
    z-index: 27;
  }

  .sh-vitality-numbers {
    font-family: ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.1;
    color: var(--hud-ink);
    text-shadow: 0 1px 4px var(--hud-shadow);
    letter-spacing: 0.02em;
  }

  .sh-vitality-track {
    position: relative;
    width: 212px;
    height: 7px;
    border-radius: 999px;
    background: rgba(18, 12, 16, 0.36);
    border: 1px solid var(--hud-ring-border);
    overflow: hidden;
    filter: drop-shadow(0 1px 4px var(--hud-shadow));
  }

  #sculpted-vitality-bar.is-blessed .sh-vitality-track {
    border-color: #fbd36b;
    box-shadow: 0 0 12px rgba(251, 211, 107, 0.52);
  }

  /* ----------------------------------------------------------------------- */
  /* 3. Top-Right Minimal Pause Ring (#sculpted-pause-btn)                   */
  /* ----------------------------------------------------------------------- */
  #sculpted-pause-btn {
    top: max(16px, env(safe-area-inset-top, 0px));
    right: max(18px, env(safe-area-inset-right, 0px));
    width: 42px;
    height: 42px;
    z-index: 28;
  }

  .sh-pause-bars {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    justify-content: center;
  }

  .sh-pause-bars span {
    width: 2px;
    height: 14px;
    border-radius: 1px;
    background: var(--hud-ink);
  }

  /* ----------------------------------------------------------------------- */
  /* 4. Left Hand Floating Thumbstick (Tablet Only: 44px, 44px, 132x132px)   */
  /* ----------------------------------------------------------------------- */
  #sculpted-joystick-zone {
    position: absolute;
    left: 44px;
    bottom: 44px;
    width: 132px;
    height: 132px;
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
    width: 132px;
    height: 132px;
    border-radius: 50%;
    background: var(--hud-ring-fill);
    border: 1.5px solid var(--hud-ring-border);
    box-shadow:
      inset 0 0 0 4px transparent,
      inset 0 0 0 5px var(--hud-ring-inner);
    filter: drop-shadow(0 2px 6px var(--hud-shadow));
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sh-joy-ring.is-sprinting {
    border-color: var(--hud-accent);
  }

  .sh-joy-puck {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(255, 253, 249, 0.16);
    border: 1.5px solid var(--hud-ring-border);
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
  /* 5. Right-Hand 2-Ring Concentric Fan Arc (Tablet) vs Keycap Dock (PC)    */
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

  /* --- TABLET 2-RING CONCENTRIC FAN ARC (Verified >= 17.95px Finger Gap) --- */
  /* Attack (84x84): right: 36px, bottom: 36px (center (78, 78)) */
  #sculpted-hud-root.profile-tablet #sculpted-attack-btn {
    right: 36px;
    bottom: 36px;
    width: 84px;
    height: 84px;
  }

  /* Dash (54x54, r=108 at 192°): right: 157px, bottom: 29px (center (184, 56)) */
  #sculpted-hud-root.profile-tablet #sculpted-dash-btn {
    right: 157px;
    bottom: 29px;
    width: 54px;
    height: 54px;
  }

  /* Jump (54x54, r=108 at 98°): right: 66px, bottom: 158px (center (93, 185)) */
  #sculpted-hud-root.profile-tablet #sculpted-jump-btn {
    right: 66px;
    bottom: 158px;
    width: 54px;
    height: 54px;
  }

  /* [Tab] (46x46, r=189.5 at 196°): right: 242px, bottom: 24px (center (265, 47)) */
  #sculpted-hud-root.profile-tablet #sculpted-slot-tab {
    right: 242px;
    bottom: 24px;
    width: 46px;
    height: 46px;
  }

  /* [E] (62x62, r=179.7 at 164°): right: 224px, bottom: 96px (center (255, 127)) */
  #sculpted-hud-root.profile-tablet #sculpted-slot-e {
    right: 224px;
    bottom: 96px;
    width: 62px;
    height: 62px;
  }

  /* [Q] (62x62, r=183.7 at 130°): right: 170px, bottom: 184px (center (201, 215)) */
  #sculpted-hud-root.profile-tablet #sculpted-slot-q {
    right: 170px;
    bottom: 184px;
    width: 62px;
    height: 62px;
  }

  /* Commune [R] (56x56, r=186.5 at 96°): right: 68px, bottom: 234px (center (96, 262)) */
  #sculpted-hud-root.profile-tablet #sculpted-commune-btn {
    right: 68px;
    bottom: 234px;
    width: 56px;
    height: 56px;
  }

  /* --- DESKTOP COMPACT 52px KEYCAP RINGS ALONG BOTTOM-RIGHT --- */
  #sculpted-hud-root.profile-desktop #sculpted-attack-btn {
    right: 28px;
    bottom: 24px;
    width: 60px;
    height: 60px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-dash-btn {
    right: 102px;
    bottom: 24px;
    width: 52px;
    height: 52px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-jump-btn {
    right: 28px;
    bottom: 98px;
    width: 52px;
    height: 52px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-slot-e {
    right: 168px;
    bottom: 24px;
    width: 52px;
    height: 52px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-slot-tab {
    right: 234px;
    bottom: 24px;
    width: 52px;
    height: 52px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-slot-q {
    right: 102px;
    bottom: 90px;
    width: 52px;
    height: 52px;
  }

  #sculpted-hud-root.profile-desktop #sculpted-commune-btn {
    right: 28px;
    bottom: 164px;
    width: 52px;
    height: 52px;
  }

  /* Ring Icons, Keycaps & Cooldown Overlays */
  #sculpted-attack-btn .sh-action-icon-svg {
    width: 38px;
    height: 38px;
  }

  #sculpted-dash-btn .sh-action-icon-svg,
  #sculpted-jump-btn .sh-action-icon-svg {
    width: 24px;
    height: 24px;
  }

  .sh-skill-glyph-svg {
    width: 28px;
    height: 28px;
  }

  .sh-tab-glyph-svg {
    width: 20px;
    height: 20px;
  }

  .sh-lotus-svg {
    width: 26px;
    height: 24px;
  }

  .sh-keycap-badge {
    position: absolute;
    right: -2px;
    bottom: -4px;
    min-width: 18px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: rgba(20, 14, 22, 0.65);
    border: 1px solid var(--hud-ring-border);
    font-family: ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--hud-ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    pointer-events: none;
  }

  #sculpted-hud-root.profile-tablet .sh-keycap-badge {
    display: none;
  }

  .sh-slot-cd-badge {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(14, 10, 16, 0.62);
    color: var(--hud-ink);
    font-family: ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
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
    border-color: rgba(125, 211, 252, 0.85);
  }

  #sculpted-slot-e[data-element="fire"] {
    border-color: rgba(251, 146, 60, 0.88);
  }

  #sculpted-slot-e.is-active-buff {
    box-shadow:
      inset 0 0 0 3px transparent,
      inset 0 0 0 4px var(--hud-accent),
      0 0 14px rgba(251, 211, 107, 0.55);
  }

  /* One-Time "Tab to switch" Caption beside [Tab] */
  #sculpted-tab-caption {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 6px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--hud-ink);
    text-shadow: 0 1px 3px var(--hud-shadow);
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
    gap: 2px;
    height: 12px;
  }

  .sh-wave-bar {
    width: 2px;
    height: 8px;
    border-radius: 999px;
    background: #fb7185;
  }

  .sh-wave-bar:nth-child(1) { height: 6px; }
  .sh-wave-bar:nth-child(2) { height: 11px; }
  .sh-wave-bar:nth-child(3) { height: 13px; background: #e11d48; }
  .sh-wave-bar:nth-child(4) { height: 10px; }
  .sh-wave-bar:nth-child(5) { height: 6px; }

  .sh-listening-timer {
    font-family: ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 1;
    color: var(--hud-ink);
  }

  /* Partner Communing Subtle Pulse Indicator */
  #sculpted-partner-commune-tag {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--hud-ring-fill);
    border: 1px solid rgba(225, 29, 72, 0.72);
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--hud-ink);
    text-shadow: 0 1px 3px var(--hud-shadow);
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
  /* 6. Minimal Pause Popover (#sculpted-pause-modal, Zero Blur)             */
  /* ----------------------------------------------------------------------- */
  .sh-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    pointer-events: auto;
    background: rgba(14, 10, 16, 0.24);
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
    width: min(420px, 90vw);
    padding: 22px 24px;
    border-radius: 16px;
    border: 1.5px solid var(--hud-ring-border);
    background: rgba(20, 14, 22, 0.22);
    box-shadow:
      inset 0 0 0 3px transparent,
      inset 0 0 0 4px var(--hud-ring-inner);
    color: var(--hud-ink);
    filter: drop-shadow(0 4px 16px var(--hud-shadow));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
  }

  .sh-modal-title {
    font-size: 1.35rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--hud-ink);
    text-shadow: 0 1px 4px var(--hud-shadow);
    margin: 0;
  }

  .sh-stat-lbl {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--hud-ink-muted);
    text-shadow: 0 1px 2px var(--hud-shadow);
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
    padding: 6px 14px;
    border-radius: 999px;
    border: 1.5px solid var(--hud-ring-border);
    background: var(--hud-ring-fill);
    color: var(--hud-ink);
    font-family: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    text-shadow: 0 1px 3px var(--hud-shadow);
    -webkit-tap-highlight-color: transparent;
    transition: transform 150ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out;
  }

  .sh-choice-pill.is-selected,
  .sh-choice-pill[aria-pressed="true"] {
    border-color: var(--hud-accent);
    background: rgba(255, 253, 249, 0.22);
  }

  .sh-modal-close-btn {
    min-width: 132px;
    min-height: 38px;
  }
`;

/**
 * Creates the Genshin-Style See-Through Ring HUD & Two-Handed Xiaomi Pad 7 Arc.
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
    <!-- 1. TOP-LEFT: Borderless Party Strip (Portrait + Typed Name + Slim HP Bar) -->
    <div id="sculpted-party-bars" role="region" aria-label="Party Status">
      <div class="sh-life-row is-leader" id="sh-life-row-primary" data-role="Knight">
        <div class="sh-emblem-ring" id="sh-emblem-primary" data-role-emblem="Knight" aria-hidden="true">
          ${SVG_ROLE_KNIGHT_EMBLEM}
        </div>
        <div class="sh-party-meta">
          <span class="sh-player-name-lbl" id="sh-name-primary">Knight</span>
          <div class="sh-hp-channel">
            <div class="sh-hp-fill" id="sh-hp-fill-primary"></div>
            <div class="sh-shield-fill" id="sh-shield-fill-primary"></div>
          </div>
        </div>
      </div>

      <div class="sh-life-row" id="sh-life-row-partner" data-role="Mage">
        <div class="sh-emblem-ring" id="sh-emblem-partner" data-role-emblem="Mage" aria-hidden="true">
          ${SVG_ROLE_MAGE_EMBLEM}
        </div>
        <div class="sh-party-meta">
          <span class="sh-player-name-lbl" id="sh-name-partner">Mage</span>
          <div class="sh-hp-channel">
            <div class="sh-hp-fill" id="sh-hp-fill-partner"></div>
            <div class="sh-shield-fill" id="sh-shield-fill-partner"></div>
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
        <span class="sh-keycap-badge">Tab</span>
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
        <span class="sh-keycap-badge">E</span>
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
        <span class="sh-keycap-badge">Q</span>
      </button>
    </div>

    <!-- 6. RIGHT HAND OUTER ARC: Commune [R] Ring (96° just above Jump) -->
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
        <span class="sh-keycap-badge">R</span>
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

    // If only Fire is unlocked, default activeElement to 'fire'; if only Ice, default to 'ice'
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

  const MAX_JOY_RADIUS = 46;
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
    joyState.active = false,
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

  // Primary Attack Ring: Tap (< 280ms) = 'attack', Hold (>= 280ms) = Knight 'block_start' / Mage 'heavy'
  let attackHoldTimer = null;
  let attackHeldTriggered = false;

  if (attackBtn) {
    attackBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      try {
        attackBtn.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      attackHeldTriggered = false;
      if (typeof onAction === 'function') {
        onAction('attack', { role: state.activeRole });
      }
      if (attackHoldTimer) clearTimeout(attackHoldTimer);
      attackHoldTimer = setTimeout(() => {
        attackHoldTimer = null;
        attackHeldTriggered = true;
        if (typeof onAction === 'function') {
          onAction(state.activeRole === 'Knight' ? 'block_start' : 'heavy', {
            role: state.activeRole,
          });
        }
      }, 280);
    });

    const releaseAttack = () => {
      if (attackHoldTimer) {
        clearTimeout(attackHoldTimer);
        attackHoldTimer = null;
      }
      if (attackHeldTriggered) {
        attackHeldTriggered = false;
        if (state.activeRole === 'Knight' && typeof onAction === 'function') {
          onAction('block_end', { role: state.activeRole });
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
    setVisible(visible) {
      root.classList.toggle('is-hidden', !visible);
    },
    destroy() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onGlobalKeyDown);
      }
      document.body?.classList.remove('sculpted-hud-mounted');
      root.remove();
    },
  };
}
