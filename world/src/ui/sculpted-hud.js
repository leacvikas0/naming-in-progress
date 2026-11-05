// ============================================================================
// world/src/ui/sculpted-hud.js
//
// Wave 4 — Sculpted Stone-and-Brass Botanical UI & Progressive Unlock HUD:
//   - Matches `sculpted-hud-concept.png`, `05-start-together.png`,
//     `07-first-poem.png`, `07b-commune.png`, and `08-first-awakening.png`.
//   - Starts Bare (`unlockedStage === 0 && !communeDiscovered`):
//       * Top-left: 2 sculpted stone-and-brass life bars (active player on top,
//         partner below; clickable Role Emblems for Knight & Mage).
//       * Top-right: Sculpted stone Pause (`||`) button with white blossom accent.
//       * Bottom-right Action Cluster: Sculpted stone Attack button (Sword icon
//         for Knight, Staff icon for Mage), Evade/Dash button, and low-priority
//         Jump button (plus left floating thumbstick on Tablet/touch).
//       * Zero dev clutter: hides legacy dev pills, act banners, and locked slots.
//   - Progressive Reveal (`setProgressionState`):
//       * `communeDiscovered === true` -> Sculpted `Commune` lotus tablet
//         (`07-first-poem.png`), morphing into `Listening 00:XX` bar with
//         animated crimson-rose audio bars & stop/send button (`07b-commune.png`).
//       * `unlockedStage >= 1` -> `E` Power Slot (`Frost Lance` / `Ice Sword`) +
//         `showAwakeningCard` (`08-first-awakening.png`).
//       * `unlockedStage >= 2` -> `Tab` Element Toggle (`Ice` <-> `Fire`),
//         updating `E` between Glacial Ice and Molten Fire (`Cinder Fall` / `Fire Sword`).
//       * `unlockedStage >= 3` -> `Q` Ultimate Slot (`Storm Cataclysm` /
//         `Sky-Lightning Awakening`).
//   - Floating Stone Interaction Pill (`✿ Read`) & Weathered Inscription Modal.
//   - Clickable Role Emblem -> Sculpted Character Info Card Modal.
//   - Pause Modal with Time-of-Day Selector (`Morning`, `Golden Hour`,
//     `Twilight`, `Starlit Night`, `Auto Cycle`), Device Profile & Role Swap.
// ============================================================================

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function formatTimerMMSS(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/* ------------------------------------------------------------------------- */
/* Custom Sculpted SVG Artwork (matching 05, 07, 07b, 08 & sculpted-hud)     */
/* ------------------------------------------------------------------------- */

const SVG_BLOSSOM_CAP_RIGHT = `
<svg class="sh-blossom-cap-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <path d="M12 6 C22 4, 28 12, 20 18" stroke="#365e24" stroke-width="2" stroke-linecap="round"/>
  <path d="M18 6 C27 4, 30 14, 20 16 C15 17, 14 10, 18 6 Z" fill="#58943c" stroke="#284a1a" stroke-width="1"/>
  <path d="M20 22 C30 22, 29 32, 19 30 C14 29, 15 22, 20 22 Z" fill="#4c8332" stroke="#284a1a" stroke-width="1"/>
  <g transform="translate(16, 18)">
    <circle cx="0" cy="-6" r="3.8" fill="#fffdf8" stroke="#d5cab8" stroke-width="0.85"/>
    <circle cx="5.7" cy="-1.8" r="3.8" fill="#fffdf8" stroke="#d5cab8" stroke-width="0.85"/>
    <circle cx="3.5" cy="4.9" r="3.8" fill="#fffdf8" stroke="#d5cab8" stroke-width="0.85"/>
    <circle cx="-3.5" cy="4.9" r="3.8" fill="#fffdf8" stroke="#d5cab8" stroke-width="0.85"/>
    <circle cx="-5.7" cy="-1.8" r="3.8" fill="#fffdf8" stroke="#d5cab8" stroke-width="0.85"/>
    <circle cx="0" cy="0" r="2.7" fill="#f3b63a" stroke="#b87914" stroke-width="0.8"/>
  </g>
</svg>
`;

const SVG_CORNER_IVY_LEFT = `
<svg class="sh-corner-ivy sh-corner-ivy-left" viewBox="0 0 54 58" fill="none" aria-hidden="true">
  <path d="M14 8 C7 20, 7 38, 18 52" stroke="#355e24" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M15 12 C5 10, 4 21, 13 23 C18 24, 20 16, 15 12 Z" fill="#518a37" stroke="#274719" stroke-width="1"/>
  <path d="M11 27 C1 26, 1 36, 10 38 C15 39, 17 31, 11 27 Z" fill="#65a048" stroke="#274719" stroke-width="1"/>
  <path d="M18 41 C9 43, 10 52, 19 51 C24 50, 24 42, 18 41 Z" fill="#4d8434" stroke="#274719" stroke-width="1"/>
  <g transform="translate(16, 33) scale(0.88)">
    <circle cx="0" cy="-6.5" r="4" fill="#fffdf8" stroke="#d6cbb9" stroke-width="0.9"/>
    <circle cx="6.2" cy="-2" r="4" fill="#fffdf8" stroke="#d6cbb9" stroke-width="0.9"/>
    <circle cx="3.8" cy="5.2" r="4" fill="#fffdf8" stroke="#d6cbb9" stroke-width="0.9"/>
    <circle cx="-3.8" cy="5.2" r="4" fill="#fffdf8" stroke="#d6cbb9" stroke-width="0.9"/>
    <circle cx="-6.2" cy="-2" r="4" fill="#fffdf8" stroke="#d6cbb9" stroke-width="0.9"/>
    <circle cx="0" cy="0" r="2.9" fill="#f3b63a" stroke="#b87914" stroke-width="0.8"/>
  </g>
</svg>
`;

const SVG_CORNER_IVY_RIGHT = `
<svg class="sh-corner-ivy sh-corner-ivy-right" viewBox="0 0 54 58" fill="none" aria-hidden="true">
  <g transform="translate(54, 0) scale(-1, 1)">
    <path d="M14 8 C7 20, 7 38, 18 52" stroke="#355e24" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M15 12 C5 10, 4 21, 13 23 C18 24, 20 16, 15 12 Z" fill="#518a37" stroke="#274719" stroke-width="1"/>
    <path d="M11 27 C1 26, 1 36, 10 38 C15 39, 17 31, 11 27 Z" fill="#65a048" stroke="#274719" stroke-width="1"/>
    <path d="M18 41 C9 43, 10 52, 19 51 C24 50, 24 42, 18 41 Z" fill="#4d8434" stroke="#274719" stroke-width="1"/>
    <g transform="translate(16, 33) scale(0.88)">
      <circle cx="0" cy="-6.5" r="4" fill="#fffdf8" stroke="#d6cbb9" stroke-width="0.9"/>
      <circle cx="6.2" cy="-2" r="4" fill="#fffdf8" stroke="#d6cbb9" stroke-width="0.9"/>
      <circle cx="3.8" cy="5.2" r="4" fill="#fffdf8" stroke="#d6cbb9" stroke-width="0.9"/>
      <circle cx="-3.8" cy="5.2" r="4" fill="#fffdf8" stroke="#d6cbb9" stroke-width="0.9"/>
      <circle cx="-6.2" cy="-2" r="4" fill="#fffdf8" stroke="#d6cbb9" stroke-width="0.9"/>
      <circle cx="0" cy="0" r="2.9" fill="#f3b63a" stroke="#b87914" stroke-width="0.8"/>
    </g>
  </g>
</svg>
`;

const SVG_ROLE_KNIGHT_EMBLEM = `
<svg class="sh-role-emblem-svg" viewBox="0 0 44 44" fill="none" aria-hidden="true">
  <!-- Chiseled Iron Knight Helmet (matching 05-start-together.png) -->
  <path d="M11 20 C11 11, 33 11, 33 20 L34.5 31 C34.5 34, 27.5 37, 22 37 C16.5 37, 9.5 34, 9.5 31 Z" fill="#9ea8b6" stroke="#2e3540" stroke-width="2" stroke-linejoin="round"/>
  <path d="M16 10 L22 6 L28 10" fill="#b7c0cc" stroke="#2e3540" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M22 7 L22 36" stroke="#687382" stroke-width="1.5"/>
  <!-- Visor Eyes -->
  <rect x="13.5" y="20" width="17" height="4.2" rx="1.6" fill="#1d222b"/>
  <circle cx="17.5" cy="22.1" r="1.2" fill="#f8fafc"/>
  <circle cx="26.5" cy="22.1" r="1.2" fill="#f8fafc"/>
  <!-- Faceguard Bevel -->
  <path d="M11.5 27.5 L22 32 L32.5 27.5" stroke="#47515f" stroke-width="1.8" stroke-linecap="round"/>
</svg>
`;

const SVG_ROLE_MAGE_EMBLEM = `
<svg class="sh-role-emblem-svg" viewBox="0 0 44 44" fill="none" aria-hidden="true">
  <!-- Royal Purple Mage Witch Hat (matching 05-start-together.png) -->
  <path d="M22 6 C19 14, 14 21, 12 28 L32 28 C30 21, 25 14, 22 6 Z" fill="#6f4bc0" stroke="#2c1957" stroke-width="2" stroke-linejoin="round"/>
  <!-- Hat Band & Golden Buckle -->
  <path d="M12.5 24.2 L31.5 24.2 L32.4 28.4 L11.6 28.4 Z" fill="#e67e22" stroke="#5e2c04" stroke-width="1.4"/>
  <rect x="19.2" y="23.8" width="5.6" height="5" rx="0.9" fill="#fbd46d" stroke="#5e2c04" stroke-width="1.3"/>
  <!-- Wide Hat Brim -->
  <ellipse cx="22" cy="30.2" rx="16.5" ry="4.8" fill="#805ad5" stroke="#2c1957" stroke-width="2"/>
</svg>
`;

const SVG_ATTACK_SWORD = `
<svg class="sh-action-icon-svg sh-sword-svg" viewBox="0 0 56 56" fill="none" aria-hidden="true">
  <!-- Chiseled Broadsword (matching sculpted-hud-concept.png) -->
  <g transform="translate(28, 28) rotate(38) translate(-28, -28)">
    <!-- Blade -->
    <path d="M28 7 L34 15 L33 35 L23 35 L22 15 Z" fill="#e6ecf2" stroke="#3c4654" stroke-width="2" stroke-linejoin="round"/>
    <path d="M28 8 L28 35" stroke="#9aa6b8" stroke-width="1.6"/>
    <path d="M28 8 L33 15 L32 34 L28 34 Z" fill="#cdd6e2"/>
    <!-- Brass Crossguard -->
    <path d="M16 35 L40 35 C41.5 35, 42 38.5, 40 39 L16 39 C14 38.5, 14.5 35, 16 35 Z" fill="#d9a13b" stroke="#5c3e09" stroke-width="1.8"/>
    <!-- Grip & Pommel -->
    <rect x="25.5" y="39" width="5" height="8" rx="1.2" fill="#7c4722" stroke="#3d200c" stroke-width="1.6"/>
    <circle cx="28" cy="49" r="3.4" fill="#d9a13b" stroke="#5c3e09" stroke-width="1.6"/>
  </g>
</svg>
`;

const SVG_ATTACK_STAFF = `
<svg class="sh-action-icon-svg sh-staff-svg" viewBox="0 0 56 56" fill="none" aria-hidden="true">
  <!-- Mage Crystal Staff (matching 05-start-together.png) -->
  <g transform="translate(28, 28) rotate(38) translate(-28, -28)">
    <!-- Wooden Staff Shaft -->
    <path d="M26 20 L30 20 L31 49 C31 50.5, 25 50.5, 25 49 Z" fill="#9c5a25" stroke="#47260b" stroke-width="2" stroke-linejoin="round"/>
    <!-- Brass Collar -->
    <rect x="24.5" y="18.5" width="7" height="3.5" rx="1.2" fill="#e0a93e" stroke="#5c3e09" stroke-width="1.5"/>
    <!-- Faceted Lime-Emerald Crystal Head -->
    <polygon points="28,6 35,12 32,19 24,19 21,12" fill="#9be15d" stroke="#2c5914" stroke-width="2" stroke-linejoin="round"/>
    <polygon points="28,6 35,12 28,15" fill="#c7f794"/>
    <polygon points="28,6 21,12 28,15" fill="#7ec845"/>
    <polyline points="21,12 28,15 35,12" stroke="#2c5914" stroke-width="1.3"/>
    <line x1="28" y1="15" x2="28" y2="19" stroke="#2c5914" stroke-width="1.3"/>
  </g>
</svg>
`;

const SVG_DASH_RUNNER = `
<svg class="sh-action-icon-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <circle cx="22.5" cy="9.5" r="3" fill="#523b28"/>
  <path d="M13 15.5 L19.5 13.5 L24 17.5 L28 15.5" stroke="#523b28" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M19.5 14 L16.5 22 L11 26" stroke="#523b28" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M17.5 20.5 L23 23.5 L21.5 29" stroke="#523b28" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="7" y1="18" x2="12" y2="18" stroke="#7d6044" stroke-width="2" stroke-linecap="round"/>
  <line x1="6" y1="22.5" x2="10.5" y2="22.5" stroke="#7d6044" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

const SVG_JUMP_ARROW = `
<svg class="sh-action-icon-svg" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <path d="M18 9 L10.5 17.5 M18 9 L25.5 17.5" stroke="#523b28" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="18" y1="9.5" x2="18" y2="26" stroke="#523b28" stroke-width="3" stroke-linecap="round"/>
  <path d="M12 27.5 Q18 25 24 27.5" stroke="#7d6044" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

const SVG_SACRED_LOTUS = `
<svg class="sh-lotus-svg" viewBox="0 0 48 38" fill="none" aria-hidden="true">
  <!-- Outer Petals -->
  <path d="M24 29 C13 29, 5 22, 7 14 C12 16, 18 21, 24 29 Z" fill="#f48ca4" stroke="#7c3648" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M24 29 C35 29, 43 22, 41 14 C36 16, 30 21, 24 29 Z" fill="#f48ca4" stroke="#7c3648" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Mid Petals -->
  <path d="M24 29 C15 26, 12 15, 16 8 C20 12, 22 19, 24 29 Z" fill="#f9a8ba" stroke="#7c3648" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M24 29 C33 26, 36 15, 32 8 C28 12, 26 19, 24 29 Z" fill="#f9a8ba" stroke="#7c3648" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Center Crown Petal -->
  <path d="M24 30 C18 23, 18 11, 24 4 C30 11, 30 23, 24 30 Z" fill="#ffd1dc" stroke="#7c3648" stroke-width="1.5" stroke-linejoin="round"/>
  <!-- Golden Base Calyx -->
  <path d="M15 29 Q24 33 33 29" stroke="#b88428" stroke-width="2.2" stroke-linecap="round"/>
</svg>
`;

const SVG_ICE_CRYSTAL_HEX = `
<svg class="sh-hex-spell-svg" viewBox="0 0 64 68" fill="none" aria-hidden="true">
  <!-- Faceted Azure Hexagonal Socket (matching 08-first-awakening.png) -->
  <polygon points="32,3 59,18 59,50 32,65 5,50 5,18" fill="#1565c0" stroke="#7b6853" stroke-width="3.2" stroke-linejoin="round"/>
  <polygon points="32,7 55,20 55,48 32,61 9,48 9,20" fill="#1e88e5" stroke="#64b5f6" stroke-width="1.2"/>
  <!-- Glacial Crystal Shard -->
  <polygon points="38,13 44,28 31,52 19,43 26,24" fill="#e1f5fe" stroke="#0d47a1" stroke-width="1.6" stroke-linejoin="round"/>
  <polygon points="38,13 44,28 31,52 33,29" fill="#81d4fa"/>
  <polygon points="22,29 29,21 26,45 18,39" fill="#b3e5fc" stroke="#0d47a1" stroke-width="1.2" stroke-linejoin="round"/>
  <circle cx="22" cy="19" r="1.8" fill="#ffffff"/>
  <circle cx="46" cy="38" r="1.5" fill="#ffffff"/>
</svg>
`;

const SVG_FIRE_METEOR_HEX = `
<svg class="sh-hex-spell-svg" viewBox="0 0 64 68" fill="none" aria-hidden="true">
  <!-- Faceted Molten Crimson-Amber Hexagonal Socket -->
  <polygon points="32,3 59,18 59,50 32,65 5,50 5,18" fill="#8f2412" stroke="#7b6853" stroke-width="3.2" stroke-linejoin="round"/>
  <polygon points="32,7 55,20 55,48 32,61 9,48 9,20" fill="#c93b1b" stroke="#ff8a50" stroke-width="1.2"/>
  <!-- Molten Sunfire Crest -->
  <path d="M32 12 C40 22, 47 28, 44 41 C42 50, 35 55, 32 55 C29 55, 22 50, 20 41 C17 28, 24 22, 32 12 Z" fill="#ff9800" stroke="#4e1205" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M32 22 C37 29, 40 34, 38 43 C37 48, 34 51, 32 51 C30 51, 27 48, 26 43 C24 34, 27 29, 32 22 Z" fill="#fff176"/>
</svg>
`;

const SVG_ULTIMATE_STORM_VORTEX = `
<svg class="sh-ult-vortex-svg" viewBox="0 0 68 68" fill="none" aria-hidden="true">
  <!-- Brass & Turquoise Vortex Medallion (matching sculpted-hud-concept.png) -->
  <circle cx="34" cy="34" r="29" fill="#0d3b42" stroke="#c8963e" stroke-width="3.5"/>
  <circle cx="34" cy="34" r="23" fill="#136f78" stroke="#5ce1e6" stroke-width="1.5"/>
  <path d="M34 15 C45 15, 51 25, 46 35 C41 45, 28 42, 29 33 C30 26, 39 26, 38 33" stroke="#d4fcff" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M34 53 C23 53, 17 43, 22 33 C27 23, 40 26, 39 35" stroke="#7ef4f7" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="34" cy="34" r="4.5" fill="#ffffff"/>
</svg>
`;

/* ------------------------------------------------------------------------- */
/* Sculpted Stone-and-Brass CSS                                              */
/* ------------------------------------------------------------------------- */

const SCULPTED_HUD_CSS = `
  /* Hide legacy HUD elements when Sculpted HUD is active */
  body.sculpted-hud-mounted #top-bar,
  body.sculpted-hud-mounted #bottom-bar,
  body.sculpted-hud-mounted #touch-hud-layer,
  body.sculpted-hud-mounted #altar-stele-modal {
    display: none !important;
  }

  #sculpted-hud-root {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 26;
    font-family: Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif;
    color: #3f2d1e;
    user-select: none;
    -webkit-user-select: none;
  }

  #sculpted-hud-root.is-hidden {
    display: none;
  }

  /* ----------------------------------------------------------------------- */
  /* Top-Left: 2 Sculpted Stone-and-Brass Life Bars (05-start-together.png)  */
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
    position: relative;
    display: flex;
    align-items: center;
    pointer-events: auto;
    transition-property: transform, opacity;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  .sh-emblem-btn {
    position: relative;
    z-index: 3;
    appearance: none;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 2.5px solid #9e7b46;
    background:
      radial-gradient(circle at 35% 28%, #f8f2e7 0%, #e4d4b8 68%, #cbb38c 100%);
    box-shadow:
      inset 0 2px 0 rgba(255, 253, 248, 0.9),
      0 4px 12px rgba(24, 18, 12, 0.36);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 3px;
    -webkit-tap-highlight-color: transparent;
    transition-property: transform, box-shadow;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  .sh-life-row.is-leader .sh-emblem-btn {
    width: 52px;
    height: 52px;
    border-color: #c69846;
    box-shadow:
      inset 0 2px 0 rgba(255, 253, 248, 0.95),
      0 0 0 2px rgba(251, 211, 107, 0.45),
      0 6px 14px rgba(24, 18, 12, 0.4);
  }

  .sh-role-emblem-svg {
    width: 100%;
    height: 100%;
  }

  .sh-hp-slab {
    position: relative;
    margin-inline-start: -10px;
    padding: 5px 18px 5px 16px;
    min-width: 178px;
    height: 28px;
    border-radius: 0 12px 12px 0;
    border: 2px solid #a68963;
    background:
      linear-gradient(180deg, #f3ead8 0%, #dfd0b4 100%);
    box-shadow:
      inset 0 1.5px 0 rgba(255, 253, 248, 0.88),
      inset 0 -2px 0 rgba(132, 104, 72, 0.48),
      0 5px 14px rgba(22, 16, 10, 0.3);
    display: flex;
    align-items: center;
  }

  .sh-life-row.is-leader .sh-hp-slab {
    min-width: 196px;
    height: 30px;
  }

  .sh-hp-channel {
    position: relative;
    width: 100%;
    height: 13px;
    border-radius: 999px;
    background: rgba(74, 58, 42, 0.32);
    border: 1px solid rgba(92, 70, 48, 0.55);
    overflow: hidden;
    box-shadow: inset 0 2px 3px rgba(28, 20, 12, 0.38);
  }

  .sh-hp-fill {
    height: 100%;
    width: 100%;
    border-radius: 999px;
    background: linear-gradient(180deg, #7be362 0%, #46b446 55%, #2f8f34 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
    transition: width 150ms ease-out;
  }

  .sh-hp-fill.is-low {
    background: linear-gradient(180deg, #ff758c 0%, #e33554 60%, #b81d38 100%);
  }

  .sh-shield-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 0%;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(250, 204, 21, 0.88), rgba(254, 240, 138, 0.95));
    transition: width 150ms ease-out;
    pointer-events: none;
  }

  .sh-blossom-cap {
    position: absolute;
    right: -14px;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    pointer-events: none;
  }

  .sh-blossom-cap-svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 2px 3px rgba(20, 14, 8, 0.28));
  }

  /* ----------------------------------------------------------------------- */
  /* Top-Right: Sculpted Stone Pause (||) Button (sculpted-hud-concept.png)  */
  /* ----------------------------------------------------------------------- */
  #sculpted-pause-btn {
    position: absolute;
    top: max(16px, env(safe-area-inset-top, 0px));
    right: max(18px, env(safe-area-inset-right, 0px));
    pointer-events: auto;
    z-index: 28;
    appearance: none;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: 2.5px solid #96743f;
    background:
      radial-gradient(circle at 35% 28%, #8c7a64 0%, #635443 70%, #4a3e31 100%);
    box-shadow:
      inset 0 0 0 2px #d5b06a,
      inset 0 2px 3px rgba(255, 248, 231, 0.45),
      0 6px 16px rgba(18, 14, 10, 0.42);
    color: #fdf5e6;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition-property: transform, box-shadow;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  .sh-pause-bars {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    justify-content: center;
  }

  .sh-pause-bars span {
    width: 4.5px;
    height: 16px;
    border-radius: 2px;
    background: #fdf5e6;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  }

  /* ----------------------------------------------------------------------- */
  /* Left Floating Thumbstick & Right Touch Orbit (05-start-together.png)    */
  /* ----------------------------------------------------------------------- */
  #sculpted-joystick-zone {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 34vw;
    height: 60vh;
    pointer-events: auto;
    touch-action: none;
    z-index: 26;
    display: none;
  }

  #sculpted-hud-root.profile-tablet #sculpted-joystick-zone {
    display: block;
  }

  .sh-joy-ring {
    position: absolute;
    left: max(32px, env(safe-area-inset-left, 0px));
    bottom: max(30px, env(safe-area-inset-bottom, 0px));
    width: 132px;
    height: 132px;
    border-radius: 50%;
    background: rgba(236, 226, 208, 0.34);
    border: 2.5px solid rgba(235, 222, 198, 0.72);
    box-shadow:
      inset 0 0 18px rgba(255, 252, 244, 0.28),
      0 8px 24px rgba(22, 18, 12, 0.24);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sh-joy-ring.is-sprinting {
    border-color: rgba(251, 211, 107, 0.92);
    box-shadow: 0 0 22px rgba(251, 211, 107, 0.38);
  }

  .sh-joy-puck {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 35% 30%, rgba(252, 247, 236, 0.94), rgba(218, 203, 176, 0.9));
    border: 2px solid rgba(168, 140, 102, 0.75);
    box-shadow: 0 4px 12px rgba(24, 18, 12, 0.28);
    transform: translate3d(0px, 0px, 0px);
    pointer-events: none;
  }

  .sh-joy-blossom {
    position: absolute;
    right: -15px;
    top: 50%;
    transform: translateY(-50%);
    width: 34px;
    height: 34px;
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
  /* Bottom-Right Action Cluster (05-start-together.png)                     */
  /* ----------------------------------------------------------------------- */
  #sculpted-action-cluster {
    position: absolute;
    right: max(22px, env(safe-area-inset-right, 0px));
    bottom: max(20px, env(safe-area-inset-bottom, 0px));
    width: 196px;
    height: 176px;
    pointer-events: none;
    z-index: 28;
  }

  .sh-round-stone-btn {
    position: absolute;
    appearance: none;
    pointer-events: auto;
    touch-action: none;
    cursor: pointer;
    border-radius: 50%;
    border: 2.5px solid #9c805b;
    background:
      radial-gradient(circle at 35% 25%, #f7f0e2 0%, #e7dac2 64%, #d3be9c 100%);
    box-shadow:
      inset 0 2px 0 rgba(255, 253, 248, 0.9),
      inset 0 -4px 0 rgba(138, 110, 78, 0.55),
      0 8px 20px rgba(24, 18, 12, 0.36);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #4a3423;
    -webkit-tap-highlight-color: transparent;
    transition-property: transform, box-shadow;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  /* Primary Attack Button (Sword for Knight, Staff for Mage) */
  #sculpted-attack-btn {
    right: 68px;
    bottom: 4px;
    width: 96px;
    height: 96px;
  }

  #sculpted-attack-btn .sh-action-icon-svg {
    width: 58px;
    height: 58px;
  }

  #sculpted-attack-btn .sh-corner-ivy-left {
    left: -14px;
    bottom: -8px;
    top: auto;
    transform: none;
    width: 44px;
    height: 48px;
  }

  /* Evade / Dash Button */
  #sculpted-dash-btn {
    right: 0;
    bottom: 4px;
    width: 58px;
    height: 58px;
  }

  #sculpted-dash-btn .sh-action-icon-svg {
    width: 32px;
    height: 32px;
  }

  /* Low-Priority Jump Button */
  #sculpted-jump-btn {
    right: 6px;
    bottom: 72px;
    width: 54px;
    height: 54px;
  }

  #sculpted-jump-btn .sh-action-icon-svg {
    width: 28px;
    height: 28px;
  }

  /* ----------------------------------------------------------------------- */
  /* Progressive Bottom-Center / Bottom-Right Unlocked Powers                */
  /* ----------------------------------------------------------------------- */
  #sculpted-powers-dock {
    position: absolute;
    bottom: max(20px, env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: flex-end;
    gap: 12px;
    pointer-events: none;
    z-index: 28;
  }

  .sh-power-slot {
    position: relative;
    appearance: none;
    pointer-events: auto;
    touch-action: none;
    cursor: pointer;
    border: none;
    background: transparent;
    padding: 0;
    display: none;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
    transition-property: transform, opacity;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  .sh-power-slot.is-unlocked {
    display: inline-flex;
  }

  .sh-power-stone-frame {
    position: relative;
    width: 68px;
    height: 72px;
    padding: 4px;
    border-radius: 16px;
    background:
      radial-gradient(circle at 50% 20%, #f5ece0 0%, #dfd0b6 70%, #cbb694 100%);
    border: 2px solid #9e825c;
    box-shadow:
      inset 0 2px 0 rgba(255, 253, 248, 0.9),
      0 8px 20px rgba(22, 16, 10, 0.38);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sh-power-slot.is-active-buff .sh-power-stone-frame {
    border-color: #fbd36b;
    box-shadow:
      0 0 18px rgba(251, 211, 107, 0.75),
      0 8px 20px rgba(22, 16, 10, 0.38);
  }

  .sh-hex-spell-svg,
  .sh-ult-vortex-svg {
    width: 56px;
    height: 60px;
  }

  .sh-keycap-badge {
    position: absolute;
    right: -4px;
    bottom: -4px;
    min-width: 24px;
    height: 24px;
    padding: 0 5px;
    border-radius: 6px;
    background: linear-gradient(180deg, #faf3e6 0%, #e4d4b7 100%);
    border: 1.5px solid #7d6242;
    box-shadow: 0 2px 5px rgba(20, 14, 8, 0.35);
    font-family: Georgia, serif;
    font-size: 0.82rem;
    font-weight: 700;
    color: #3b2818;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .sh-slot-cd-badge {
    position: absolute;
    inset: 4px;
    border-radius: 12px;
    background: rgba(24, 18, 14, 0.74);
    color: #fde68a;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.86rem;
    font-weight: 700;
    display: none;
    align-items: center;
    justify-content: center;
  }

  .sh-power-slot.on-cooldown .sh-slot-cd-badge {
    display: flex;
  }

  /* Tab Element Toggle Pill beside E */
  #sculpted-slot-tab .sh-power-stone-frame {
    width: auto;
    height: 52px;
    padding: 6px 14px;
    border-radius: 14px;
    gap: 6px;
    font-size: 0.92rem;
    font-weight: 700;
    color: #463222;
  }

  /* ----------------------------------------------------------------------- */
  /* Commune Tablet & Listening 00:XX Stone Bar (07 & 07b-commune.png)       */
  /* ----------------------------------------------------------------------- */
  #sculpted-commune-wrap {
    position: absolute;
    right: max(22px, env(safe-area-inset-right, 0px));
    bottom: max(206px, calc(env(safe-area-inset-bottom, 0px) + 196px));
    display: none;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    z-index: 29;
  }

  #sculpted-commune-wrap.is-unlocked {
    display: flex;
  }

  .sh-commune-discovered-ribbon {
    pointer-events: none;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 4px 16px;
    border-radius: 10px;
    background: linear-gradient(180deg, #f6efe2 0%, #e5d6bc 100%);
    border: 1.5px solid #b59b78;
    box-shadow: 0 4px 12px rgba(24, 18, 12, 0.28);
    font-size: 0.86rem;
    font-weight: 700;
    color: #4a3423;
    white-space: nowrap;
  }

  .sh-commune-discovered-ribbon.is-visible {
    display: inline-flex;
  }

  #sculpted-commune-btn {
    position: relative;
    appearance: none;
    pointer-events: auto;
    cursor: pointer;
    min-width: 196px;
    min-height: 58px;
    padding: 8px 26px;
    border-radius: 16px;
    border: 2px solid #b59b78;
    background:
      radial-gradient(110% 90% at 50% 15%, #f7f0e4 0%, #e9dec8 62%, #d7c3a3 100%);
    box-shadow:
      inset 0 2px 0 rgba(255, 253, 248, 0.92),
      inset 0 -4px 0 rgba(140, 112, 80, 0.58),
      0 10px 24px rgba(24, 18, 12, 0.36);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #463222;
    font-family: inherit;
    font-size: 1.25rem;
    font-weight: 700;
    -webkit-tap-highlight-color: transparent;
    transition-property: transform, box-shadow;
    transition-duration: 150ms;
    transition-timing-function: ease-out;
  }

  .sh-lotus-svg {
    width: 40px;
    height: 32px;
    flex-shrink: 0;
  }

  /* Listening 00:XX Active Bar (07b-commune.png) */
  #sculpted-commune-listening-bar {
    position: relative;
    pointer-events: auto;
    display: none;
    align-items: center;
    gap: 12px;
    padding: 8px 14px 8px 22px;
    min-width: 268px;
    min-height: 64px;
    border-radius: 16px;
    border: 2px solid #b59b78;
    background:
      radial-gradient(110% 90% at 50% 15%, #f7f0e4 0%, #e9dec8 62%, #d7c3a3 100%);
    box-shadow:
      inset 0 2px 0 rgba(255, 253, 248, 0.92),
      inset 0 -4px 0 rgba(140, 112, 80, 0.58),
      0 12px 28px rgba(24, 18, 12, 0.42);
  }

  #sculpted-commune-wrap.is-listening #sculpted-commune-btn {
    display: none;
  }

  #sculpted-commune-wrap.is-listening #sculpted-commune-listening-bar {
    display: inline-flex;
  }

  .sh-commune-wave-group {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 28px;
  }

  .sh-wave-bar {
    width: 3.2px;
    height: 14px;
    border-radius: 999px;
    background: #c92a42;
    transition: height 120ms ease-out;
  }

  .sh-wave-bar:nth-child(1) { height: 10px; }
  .sh-wave-bar:nth-child(2) { height: 20px; }
  .sh-wave-bar:nth-child(3) { height: 26px; background: #9e1b32; }
  .sh-wave-bar:nth-child(4) { height: 18px; }
  .sh-wave-bar:nth-child(5) { height: 12px; }

  .sh-listening-meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.15;
    min-width: 78px;
  }

  .sh-listening-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #463222;
  }

  .sh-listening-timer {
    font-size: 1.08rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #3b2818;
  }

  #sculpted-commune-stop-btn {
    appearance: none;
    cursor: pointer;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    border: 1.5px solid #9c7e58;
    background: linear-gradient(180deg, #efe4d0 0%, #dccab0 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 253, 248, 0.85),
      0 2px 6px rgba(24, 18, 12, 0.25);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .sh-stop-square {
    width: 15px;
    height: 15px;
    border-radius: 3px;
    background: #a63a2b;
  }

  /* ----------------------------------------------------------------------- */
  /* Awakening Notification Card (08-first-awakening.png)                    */
  /* ----------------------------------------------------------------------- */
  #sculpted-awakening-card {
    position: absolute;
    right: max(24px, env(safe-area-inset-right, 0px));
    bottom: max(22px, env(safe-area-inset-bottom, 0px));
    pointer-events: auto;
    z-index: 31;
    display: none;
    align-items: center;
    gap: 16px;
    padding: 14px 26px 14px 20px;
    min-width: 286px;
    border-radius: 18px;
    border: 2px solid #b59b78;
    background:
      radial-gradient(115% 95% at 50% 15%, #f7f0e4 0%, #eadec8 64%, #d8c4a4 100%);
    box-shadow:
      inset 0 2px 0 rgba(255, 253, 248, 0.92),
      inset 0 -4px 0 rgba(140, 112, 80, 0.58),
      0 14px 32px rgba(22, 16, 10, 0.44);
  }

  #sculpted-awakening-card.is-visible {
    display: inline-flex;
  }

  .sh-awakening-icon-box {
    position: relative;
    width: 64px;
    height: 68px;
    flex-shrink: 0;
  }

  .sh-awakening-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: start;
  }

  .sh-awakening-title {
    font-size: 1.24rem;
    font-weight: 700;
    line-height: 1.15;
    color: #3f2b1d;
  }

  .sh-awakening-divider {
    width: 100%;
    height: 1.5px;
    background: rgba(140, 110, 78, 0.45);
    margin: 6px 0;
  }

  .sh-awakening-sub {
    font-size: 0.95rem;
    font-weight: 600;
    color: #5a4230;
  }

  /* ----------------------------------------------------------------------- */
  /* Floating Stone Read Pill (07-first-poem.png)                            */
  /* ----------------------------------------------------------------------- */
  #sculpted-stone-read-pill {
    position: absolute;
    left: 65%;
    top: 48%;
    transform: translate(-50%, -100%);
    pointer-events: auto;
    z-index: 29;
    appearance: none;
    cursor: pointer;
    display: none;
    align-items: center;
    gap: 8px;
    padding: 7px 18px;
    border-radius: 12px;
    border: 2px solid #b59b78;
    background:
      linear-gradient(180deg, #f7f0e4 0%, #e5d7be 100%);
    box-shadow:
      inset 0 1.5px 0 rgba(255, 253, 248, 0.92),
      0 8px 20px rgba(22, 16, 10, 0.36);
    color: #463222;
    font-family: inherit;
    font-size: 1.05rem;
    font-weight: 700;
    -webkit-tap-highlight-color: transparent;
  }

  #sculpted-stone-read-pill.is-visible {
    display: inline-flex;
  }

  #sculpted-stone-read-pill::after {
    content: "";
    position: absolute;
    bottom: -9px;
    left: 50%;
    transform: translateX(-50%);
    border-width: 9px 8px 0 8px;
    border-style: solid;
    border-color: #e5d7be transparent transparent transparent;
  }

  /* ----------------------------------------------------------------------- */
  /* Shared Sculpted Limestone Modal Overlay (Inscription, Char Info, Pause) */
  /* ----------------------------------------------------------------------- */
  .sh-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    pointer-events: auto;
    background: rgba(18, 14, 12, 0.56);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
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
    width: min(490px, 92vw);
    max-height: 88dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 26px 30px 24px;
    border-radius: 20px;
    border: 2.5px solid #b59b78;
    background:
      radial-gradient(120% 95% at 50% 10%, #f7f0e4 0%, #eadec8 64%, #d7c3a3 100%);
    box-shadow:
      inset 0 2px 0 rgba(255, 253, 248, 0.92),
      inset 0 -4px 0 rgba(140, 112, 80, 0.55),
      0 22px 54px rgba(14, 10, 6, 0.52);
    color: #3f2b1d;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
  }

  .sh-modal-title {
    font-size: 1.45rem;
    font-weight: 700;
    line-height: 1.2;
    color: #3b2718;
  }

  .sh-modal-sub {
    font-size: 0.92rem;
    font-weight: 600;
    color: #634935;
    line-height: 1.45;
  }

  .sh-inscription-verse {
    width: 100%;
    padding: 14px 18px;
    border-radius: 12px;
    background: rgba(140, 112, 80, 0.12);
    border-top: 1.5px solid rgba(140, 112, 80, 0.38);
    border-bottom: 1.5px solid rgba(140, 112, 80, 0.38);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 1.02rem;
    font-style: italic;
    line-height: 1.55;
    color: #3b2718;
  }

  .sh-stat-grid {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    text-align: start;
  }

  .sh-stat-cell {
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(255, 252, 245, 0.62);
    border: 1px solid rgba(156, 128, 94, 0.45);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sh-stat-lbl {
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #785c43;
  }

  .sh-stat-val {
    font-size: 1.02rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #3b2718;
  }

  .sh-ability-list {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: start;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .sh-ability-item {
    padding: 7px 12px;
    border-radius: 9px;
    background: rgba(255, 252, 245, 0.56);
    border: 1px solid rgba(156, 128, 94, 0.38);
    font-size: 0.88rem;
    font-weight: 600;
    line-height: 1.35;
    color: #3f2b1d;
  }

  .sh-pill-group {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .sh-choice-pill {
    appearance: none;
    cursor: pointer;
    padding: 7px 14px;
    border-radius: 10px;
    border: 1.5px solid #9e7b46;
    background: rgba(255, 252, 245, 0.78);
    color: #463222;
    font-family: inherit;
    font-size: 0.88rem;
    font-weight: 700;
    -webkit-tap-highlight-color: transparent;
  }

  .sh-choice-pill.is-selected {
    background: linear-gradient(180deg, #9e7736 0%, #7d5b24 100%);
    border-color: #5c3e09;
    color: #fffdf8;
  }

  .sh-modal-close-btn {
    appearance: none;
    cursor: pointer;
    min-width: 164px;
    min-height: 44px;
    padding: 8px 24px;
    border-radius: 10px;
    border: 2px solid #9e7736;
    background: linear-gradient(180deg, #f3e8d4 0%, #e4d2b4 100%);
    box-shadow:
      inset 0 0 0 1.5px #d8b56c,
      0 4px 10px rgba(34, 22, 10, 0.24);
    color: #3f2b1d;
    font-family: inherit;
    font-size: 1rem;
    font-weight: 700;
  }

  .sh-emblem-btn:focus-visible,
  #sculpted-pause-btn:focus-visible,
  .sh-round-stone-btn:focus-visible,
  .sh-power-slot:focus-visible,
  #sculpted-commune-btn:focus-visible,
  #sculpted-commune-stop-btn:focus-visible,
  #sculpted-stone-read-pill:focus-visible,
  .sh-choice-pill:focus-visible,
  .sh-modal-close-btn:focus-visible {
    outline: 3px solid #fdfaf2;
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: no-preference) {
    .sh-emblem-btn:active,
    #sculpted-pause-btn:active,
    .sh-round-stone-btn:active,
    .sh-power-slot:active,
    #sculpted-commune-btn:active,
    #sculpted-commune-stop-btn:active,
    .sh-modal-close-btn:active {
      transform: scale(0.96);
    }
  }
`;

/**
 * Creates the Sculpted Stone-and-Brass Progressive HUD.
 */
export function createSculptedHud({
  container = null,
  onAction = null,
  onAimStart = null,
  onAimMove = null,
  onAimRelease = null,
  onToggleElement = null,
  onCommuneToggle = null,
  onReadStone = null,
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
  }

  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('sculpted-hud-mounted');
  }

  const state = {
    activeRole: 'Knight', // 'Knight' | 'Mage'
    activeElement: 'ice', // 'ice' | 'fire'
    communeDiscovered: false,
    unlockedStage: 0, // 0..3
    stonesSolved: 0, // 0..3
    profile: 'desktop', // 'desktop' | 'tablet'
    timeOfDay: 'day', // 'day' | 'evening' | 'twilight' | 'night' | 'auto'
    commune: {
      listening: false,
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
    inspectingRole: 'Knight',
  };

  const root = document.createElement('div');
  root.id = 'sculpted-hud-root';

  root.innerHTML = `
    <!-- 1. TOP-LEFT: 2 Sculpted Stone-and-Brass Life Bars (05-start-together.png) -->
    <div id="sculpted-party-bars" role="region" aria-label="Party Life Bars">
      <div class="sh-life-row is-leader" id="sh-life-row-primary" data-role="Knight">
        <button
          type="button"
          class="sh-emblem-btn"
          id="sh-emblem-primary"
          data-role-emblem="Knight"
          aria-label="Knight Character Info"
          title="Click to inspect character info"
        >
          ${SVG_ROLE_KNIGHT_EMBLEM}
        </button>
        <div class="sh-hp-slab">
          <div class="sh-hp-channel">
            <div class="sh-hp-fill" id="sh-hp-fill-primary"></div>
            <div class="sh-shield-fill" id="sh-shield-fill-primary"></div>
          </div>
          <div class="sh-blossom-cap">${SVG_BLOSSOM_CAP_RIGHT}</div>
        </div>
      </div>

      <div class="sh-life-row" id="sh-life-row-partner" data-role="Mage">
        <button
          type="button"
          class="sh-emblem-btn"
          id="sh-emblem-partner"
          data-role-emblem="Mage"
          aria-label="Mage Character Info"
          title="Click to inspect character info"
        >
          ${SVG_ROLE_MAGE_EMBLEM}
        </button>
        <div class="sh-hp-slab">
          <div class="sh-hp-channel">
            <div class="sh-hp-fill" id="sh-hp-fill-partner"></div>
            <div class="sh-shield-fill" id="sh-shield-fill-partner"></div>
          </div>
          <div class="sh-blossom-cap">${SVG_BLOSSOM_CAP_RIGHT}</div>
        </div>
      </div>
    </div>

    <!-- 2. TOP-RIGHT: Sculpted Stone Pause (||) Button (sculpted-hud-concept.png) -->
    <button
      type="button"
      id="sculpted-pause-btn"
      aria-label="Pause and World Settings"
      title="Pause (Esc)"
    >
      <span class="sh-pause-bars" aria-hidden="true">
        <span></span>
        <span></span>
      </span>
    </button>

    <!-- 3. LEFT FLOATING THUMBSTICK & RIGHT CAMERA ORBIT (05-start-together.png) -->
    <div id="sculpted-joystick-zone">
      <div class="sh-joy-ring" id="sh-joy-ring">
        <div class="sh-joy-puck" id="sh-joy-puck"></div>
        <div class="sh-joy-blossom">${SVG_BLOSSOM_CAP_RIGHT}</div>
      </div>
    </div>

    <div id="sculpted-orbit-zone"></div>

    <!-- 4. FLOATING STONE INTERACTION PILL (07-first-poem.png) -->
    <button
      type="button"
      id="sculpted-stone-read-pill"
      aria-label="Read Sacred Inscription Stone"
    >
      <span aria-hidden="true">✿</span>
      <span id="sculpted-stone-read-label">Read</span>
    </button>

    <!-- 5. PROGRESSIVE POWERS DOCK (E, Tab, Q) -->
    <div id="sculpted-powers-dock" role="toolbar" aria-label="Awakened Powers">
      <!-- Stage 1: E Power Slot -->
      <button
        type="button"
        class="sh-power-slot"
        id="sculpted-slot-e"
        data-power-slot="E"
        aria-label="Cast Elemental Skill E"
        title="Elemental Skill (E)"
      >
        <div class="sh-power-stone-frame">
          <span id="sculpted-slot-e-icon">${SVG_ICE_CRYSTAL_HEX}</span>
          <span class="sh-slot-cd-badge" id="sculpted-slot-e-cd"></span>
          <span class="sh-keycap-badge">E</span>
        </div>
      </button>

      <!-- Stage 2: Tab Element Toggle -->
      <button
        type="button"
        class="sh-power-slot"
        id="sculpted-slot-tab"
        data-power-slot="Tab"
        aria-label="Toggle Ice and Fire Element (Tab)"
        title="Toggle Ice / Fire (Tab)"
      >
        <div class="sh-power-stone-frame">
          <span id="sculpted-slot-tab-label">❄️ Ice</span>
          <span class="sh-keycap-badge">Tab</span>
        </div>
      </button>

      <!-- Stage 3: Q Ultimate Slot -->
      <button
        type="button"
        class="sh-power-slot"
        id="sculpted-slot-q"
        data-power-slot="Q"
        aria-label="Unleash Ultimate Q"
        title="Ultimate Awakening (Q)"
      >
        <div class="sh-power-stone-frame">
          ${SVG_ULTIMATE_STORM_VORTEX}
          <span class="sh-slot-cd-badge" id="sculpted-slot-q-cd"></span>
          <span class="sh-keycap-badge">Q</span>
        </div>
      </button>
    </div>

    <!-- 6. COMMUNE LOTUS TABLET & LISTENING 00:XX BAR (07 & 07b-commune.png) -->
    <div id="sculpted-commune-wrap">
      <div class="sh-commune-discovered-ribbon" id="sculpted-commune-ribbon">
        Commune discovered
      </div>

      <button
        type="button"
        id="sculpted-commune-btn"
        aria-label="Commune with the God of Love"
        title="Tap or press R to Commune"
      >
        ${SVG_CORNER_IVY_LEFT}
        ${SVG_SACRED_LOTUS}
        <span>Commune</span>
        ${SVG_CORNER_IVY_RIGHT}
      </button>

      <div id="sculpted-commune-listening-bar" role="status" aria-live="polite">
        ${SVG_CORNER_IVY_LEFT}
        ${SVG_SACRED_LOTUS}
        <div class="sh-commune-wave-group" aria-hidden="true">
          <span class="sh-wave-bar"></span>
          <span class="sh-wave-bar"></span>
          <span class="sh-wave-bar"></span>
          <span class="sh-wave-bar"></span>
          <span class="sh-wave-bar"></span>
        </div>
        <div class="sh-listening-meta">
          <span class="sh-listening-title">Listening</span>
          <span class="sh-listening-timer" id="sculpted-commune-timer">00:06</span>
        </div>
        <button
          type="button"
          id="sculpted-commune-stop-btn"
          aria-label="Stop and Send Commune Prayer"
          title="Stop and Send Prayer"
        >
          <span class="sh-stop-square" aria-hidden="true"></span>
        </button>
        ${SVG_CORNER_IVY_RIGHT}
      </div>
    </div>

    <!-- 7. AWAKENING NOTIFICATION CARD (08-first-awakening.png) -->
    <div id="sculpted-awakening-card" role="status" aria-live="polite">
      ${SVG_CORNER_IVY_LEFT}
      <div class="sh-awakening-icon-box">
        <span id="sculpted-awakening-icon">${SVG_ICE_CRYSTAL_HEX}</span>
        <span class="sh-keycap-badge" id="sculpted-awakening-key">E</span>
      </div>
      <div class="sh-awakening-copy">
        <div class="sh-awakening-title" id="sculpted-awakening-title">Frost Lance awakened</div>
        <div class="sh-awakening-divider"></div>
        <div class="sh-awakening-sub" id="sculpted-awakening-sub">Hold E to aim</div>
      </div>
      ${SVG_CORNER_IVY_RIGHT}
    </div>

    <!-- 8. BOTTOM-RIGHT ACTION CLUSTER (05-start-together.png) -->
    <div id="sculpted-action-cluster" role="group" aria-label="Combat Actions">
      <button
        type="button"
        class="sh-round-stone-btn"
        id="sculpted-attack-btn"
        data-action="attack"
        aria-label="Attack or Hold for Secondary"
      >
        ${SVG_CORNER_IVY_LEFT}
        <span id="sculpted-attack-icon-slot">${SVG_ATTACK_SWORD}</span>
      </button>

      <button
        type="button"
        class="sh-round-stone-btn"
        id="sculpted-dash-btn"
        data-action="dash"
        aria-label="Evade Dash"
      >
        ${SVG_DASH_RUNNER}
      </button>

      <button
        type="button"
        class="sh-round-stone-btn"
        id="sculpted-jump-btn"
        data-action="jump"
        aria-label="Jump"
      >
        ${SVG_JUMP_ARROW}
      </button>
    </div>

    <!-- 9. WEATHERED SACRED INSCRIPTION MODAL -->
    <div
      class="sh-modal-backdrop"
      id="sculpted-inscription-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sculpted-inscription-title"
    >
      <div class="sh-modal-tablet">
        ${SVG_CORNER_IVY_LEFT}
        ${SVG_SACRED_LOTUS}
        <h2 class="sh-modal-title" id="sculpted-inscription-title">Sacred Inscription Stone</h2>
        <div class="sh-inscription-verse" id="sculpted-inscription-lines"></div>
        <p class="sh-modal-sub" id="sculpted-inscription-hint">
          Touch Commune and speak aloud to the God of Love.
        </p>
        <button type="button" class="sh-modal-close-btn" id="sculpted-inscription-close-btn">
          Close Tablet
        </button>
        ${SVG_CORNER_IVY_RIGHT}
      </div>
    </div>

    <!-- 10. CLICKABLE ROLE EMBLEM -> CHARACTER INFO CARD MODAL -->
    <div
      class="sh-modal-backdrop"
      id="sculpted-char-info-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sculpted-char-info-title"
    >
      <div class="sh-modal-tablet">
        ${SVG_CORNER_IVY_LEFT}
        <div id="sculpted-char-info-crest" style="width: 60px; height: 60px;">
          ${SVG_ROLE_KNIGHT_EMBLEM}
        </div>
        <h2 class="sh-modal-title" id="sculpted-char-info-title">Knight · Vow of Steel</h2>
        <div class="sh-stat-grid">
          <div class="sh-stat-cell">
            <span class="sh-stat-lbl">Role &amp; Level</span>
            <span class="sh-stat-val" id="sh-char-stat-level">Knight · Lv. 1</span>
          </div>
          <div class="sh-stat-cell">
            <span class="sh-stat-lbl">Vitality (HP)</span>
            <span class="sh-stat-val" id="sh-char-stat-hp">220 / 220</span>
          </div>
          <div class="sh-stat-cell">
            <span class="sh-stat-lbl">Attuned Element</span>
            <span class="sh-stat-val" id="sh-char-stat-element">Glacial Ice ❄️</span>
          </div>
          <div class="sh-stat-cell">
            <span class="sh-stat-lbl">Awakening Stage</span>
            <span class="sh-stat-val" id="sh-char-stat-stage">Stage 0 / 3</span>
          </div>
        </div>
        <div style="width: 100%; text-align: start;">
          <div class="sh-stat-lbl" style="margin-bottom: 6px;">Unlocked Vows &amp; Abilities</div>
          <ul class="sh-ability-list" id="sh-char-ability-list"></ul>
        </div>
        <div class="sh-pill-group">
          <button type="button" class="sh-choice-pill" id="sculpted-char-swap-btn">
            Swap Active Hero (Knight ⇄ Mage)
          </button>
          <button type="button" class="sh-modal-close-btn" id="sculpted-char-close-btn">
            Close
          </button>
        </div>
        ${SVG_CORNER_IVY_RIGHT}
      </div>
    </div>

    <!-- 11. PAUSE & TIME-OF-DAY MODAL -->
    <div
      class="sh-modal-backdrop"
      id="sculpted-pause-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sculpted-pause-title"
    >
      <div class="sh-modal-tablet">
        ${SVG_CORNER_IVY_LEFT}
        <h2 class="sh-modal-title" id="sculpted-pause-title">Valley Sanctuary Pause</h2>
        <p class="sh-modal-sub">Adjust the valley sky, hardware profile, or active companion.</p>

        <div style="width: 100%;">
          <div class="sh-stat-lbl" style="margin-bottom: 8px;">Time of Day</div>
          <div class="sh-pill-group" id="sculpted-tod-group">
            <button type="button" class="sh-choice-pill is-selected" data-tod-choice="day">Morning</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="evening">Golden Hour</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="twilight">Twilight</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="night">Starlit Night</button>
            <button type="button" class="sh-choice-pill" data-tod-choice="auto">Auto Cycle</button>
          </div>
        </div>

        <div style="width: 100%;">
          <div class="sh-stat-lbl" style="margin-bottom: 8px;">Hardware Profile</div>
          <div class="sh-pill-group" id="sculpted-profile-group">
            <button type="button" class="sh-choice-pill is-selected" data-profile-choice="desktop">
              Desktop RX 6700
            </button>
            <button type="button" class="sh-choice-pill" data-profile-choice="tablet">
              Xiaomi Pad 7
            </button>
          </div>
        </div>

        <div class="sh-pill-group" style="margin-top: 4px;">
          <button type="button" class="sh-choice-pill" id="sculpted-pause-swap-btn">
            Swap Hero (Knight ⇄ Mage)
          </button>
          <button type="button" class="sh-modal-close-btn" id="sculpted-pause-resume-btn">
            Resume
          </button>
        </div>
        ${SVG_CORNER_IVY_RIGHT}
      </div>
    </div>
  `;

  const mountTarget = container || document.getElementById('hud') || document.body;
  mountTarget.appendChild(root);

  // Cache DOM references
  const primaryEmblemBtn = root.querySelector('#sh-emblem-primary');
  const partnerEmblemBtn = root.querySelector('#sh-emblem-partner');
  const primaryHpFill = root.querySelector('#sh-hp-fill-primary');
  const primaryShieldFill = root.querySelector('#sh-shield-fill-primary');
  const partnerHpFill = root.querySelector('#sh-hp-fill-partner');
  const partnerShieldFill = root.querySelector('#sh-shield-fill-partner');

  const pauseBtn = root.querySelector('#sculpted-pause-btn');
  const joyZone = root.querySelector('#sculpted-joystick-zone');
  const joyRing = root.querySelector('#sh-joy-ring');
  const joyPuck = root.querySelector('#sh-joy-puck');
  const orbitZone = root.querySelector('#sculpted-orbit-zone');

  const stoneReadPill = root.querySelector('#sculpted-stone-read-pill');
  const stoneReadLabel = root.querySelector('#sculpted-stone-read-label');

  const slotE = root.querySelector('#sculpted-slot-e');
  const slotEIcon = root.querySelector('#sculpted-slot-e-icon');
  const slotECd = root.querySelector('#sculpted-slot-e-cd');
  const slotTab = root.querySelector('#sculpted-slot-tab');
  const slotTabLabel = root.querySelector('#sculpted-slot-tab-label');
  const slotQ = root.querySelector('#sculpted-slot-q');
  const slotQCd = root.querySelector('#sculpted-slot-q-cd');

  const communeWrap = root.querySelector('#sculpted-commune-wrap');
  const communeRibbon = root.querySelector('#sculpted-commune-ribbon');
  const communeBtn = root.querySelector('#sculpted-commune-btn');
  const communeTimerEl = root.querySelector('#sculpted-commune-timer');
  const communeStopBtn = root.querySelector('#sculpted-commune-stop-btn');

  const awakeningCard = root.querySelector('#sculpted-awakening-card');
  const awakeningIcon = root.querySelector('#sculpted-awakening-icon');
  const awakeningKey = root.querySelector('#sculpted-awakening-key');
  const awakeningTitle = root.querySelector('#sculpted-awakening-title');
  const awakeningSub = root.querySelector('#sculpted-awakening-sub');

  const attackBtn = root.querySelector('#sculpted-attack-btn');
  const attackIconSlot = root.querySelector('#sculpted-attack-icon-slot');
  const dashBtn = root.querySelector('#sculpted-dash-btn');
  const jumpBtn = root.querySelector('#sculpted-jump-btn');

  const inscriptionModal = root.querySelector('#sculpted-inscription-modal');
  const inscriptionTitle = root.querySelector('#sculpted-inscription-title');
  const inscriptionLines = root.querySelector('#sculpted-inscription-lines');
  const inscriptionHint = root.querySelector('#sculpted-inscription-hint');
  const inscriptionCloseBtn = root.querySelector('#sculpted-inscription-close-btn');

  const charInfoModal = root.querySelector('#sculpted-char-info-modal');
  const charInfoCrest = root.querySelector('#sculpted-char-info-crest');
  const charInfoTitle = root.querySelector('#sculpted-char-info-title');
  const charStatLevel = root.querySelector('#sh-char-stat-level');
  const charStatHp = root.querySelector('#sh-char-stat-hp');
  const charStatElement = root.querySelector('#sh-char-stat-element');
  const charStatStage = root.querySelector('#sh-char-stat-stage');
  const charAbilityList = root.querySelector('#sh-char-ability-list');
  const charSwapBtn = root.querySelector('#sculpted-char-swap-btn');
  const charCloseBtn = root.querySelector('#sculpted-char-close-btn');

  const pauseModal = root.querySelector('#sculpted-pause-modal');
  const pauseSwapBtn = root.querySelector('#sculpted-pause-swap-btn');
  const pauseResumeBtn = root.querySelector('#sculpted-pause-resume-btn');

  let awakeningHideTimer = null;
  let ribbonHideTimer = null;

  /* ----------------------------------------------------------------------- */
  /* Render Synchronizers                                                    */
  /* ----------------------------------------------------------------------- */

  function renderRoleAndPartyBars() {
    const isKnightLeader = state.activeRole !== 'Mage';
    const primaryRole = isKnightLeader ? 'Knight' : 'Mage';
    const partnerRole = isKnightLeader ? 'Mage' : 'Knight';

    if (primaryEmblemBtn) {
      primaryEmblemBtn.dataset.roleEmblem = primaryRole;
      primaryEmblemBtn.setAttribute('aria-label', `${primaryRole} Character Info`);
      primaryEmblemBtn.innerHTML =
        primaryRole === 'Knight' ? SVG_ROLE_KNIGHT_EMBLEM : SVG_ROLE_MAGE_EMBLEM;
    }
    if (partnerEmblemBtn) {
      partnerEmblemBtn.dataset.roleEmblem = partnerRole;
      partnerEmblemBtn.setAttribute('aria-label', `${partnerRole} Character Info`);
      partnerEmblemBtn.innerHTML =
        partnerRole === 'Knight' ? SVG_ROLE_KNIGHT_EMBLEM : SVG_ROLE_MAGE_EMBLEM;
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

    // Update Attack Button Icon: Sword for Knight, Staff for Mage (matching 05-start-together.png!)
    if (attackIconSlot) {
      attackIconSlot.innerHTML =
        primaryRole === 'Mage' ? SVG_ATTACK_STAFF : SVG_ATTACK_SWORD;
    }
  }

  function renderProgressionAndSlots() {
    if (communeWrap) {
      communeWrap.classList.toggle('is-unlocked', Boolean(state.communeDiscovered));
      communeWrap.classList.toggle('is-listening', Boolean(state.commune.listening));
    }
    if (communeTimerEl) {
      communeTimerEl.textContent = formatTimerMMSS(state.commune.elapsedSeconds);
    }

    if (slotE) {
      slotE.classList.toggle('is-unlocked', state.unlockedStage >= 1);
      const eCd = Number(state.cooldowns.E) || 0;
      slotE.classList.toggle('on-cooldown', eCd > 0.08);
      slotE.classList.toggle('is-active-buff', (Number(state.cooldowns.eBuffRemaining) || 0) > 0.05);
      if (slotECd) {
        slotECd.textContent = eCd > 0.08 ? `${eCd.toFixed(1)}s` : '';
      }
    }

    if (slotEIcon) {
      slotEIcon.innerHTML =
        state.activeElement === 'fire' ? SVG_FIRE_METEOR_HEX : SVG_ICE_CRYSTAL_HEX;
    }

    if (slotTab) {
      slotTab.classList.toggle('is-unlocked', state.unlockedStage >= 2);
    }
    if (slotTabLabel) {
      slotTabLabel.textContent =
        state.activeElement === 'fire' ? '🔥 Fire' : '❄️ Ice';
    }

    if (slotQ) {
      slotQ.classList.toggle('is-unlocked', state.unlockedStage >= 3);
      const qCd = Number(state.cooldowns.Q) || 0;
      slotQ.classList.toggle('on-cooldown', qCd > 0.08);
      if (slotQCd) {
        slotQCd.textContent = qCd > 0.08 ? `${qCd.toFixed(1)}s` : '';
      }
    }
  }

  function buildUnlockedAbilitiesForRole(role) {
    const isMage = role === 'Mage';
    const items = [];
    if (isMage) {
      items.push('3-Bolt Arcane Combo — Tap Attack (Nearest-enemy soft-lock)');
      items.push('Shatterlance Charged Spear — Hold Attack (Stationary full-clip; max 3 consecutive)');
    } else {
      items.push('4-Hit Broadsword Combo — Tap Attack (Mash speed ramp 1.0x–1.30x)');
      items.push('Frontal Shield Block — Hold Attack (absorbs frontal blows)');
    }

    if (state.communeDiscovered) {
      items.push('Sacred Commune [R] — Speak aloud (30s max, Crimson Rose ring countdown)');
    }

    if (state.unlockedStage >= 1) {
      if (isMage) {
        items.push('Frost Lance [Hold E to aim, Release E to cast] — 14.5m glacial spike (8.5s CD)');
      } else {
        items.push('Glacial Tide Ice Sword [Tap E] — 13s active / 18s CD; chills enemy speed & damage');
      }
    }

    if (state.unlockedStage >= 2) {
      if (isMage) {
        items.push('Cinder Fall [Tab -> Fire, Hold E] — 3–16m variable volcanic meteor');
      } else {
        items.push('Hinokami Fire Sword [Tab -> Fire, Tap E] — 13s active searing burn');
      }
    }

    if (state.unlockedStage >= 3) {
      if (isMage) {
        items.push('Storm Cataclysm [Q] — 6s stationary tempest (1 hit downs her; Knight must guard)');
      } else {
        items.push('Sky-Lightning Awakening [Q] — Heaven strike + 10s Double Damage');
      }
    }

    return items;
  }

  function renderCharacterInfoModal(role = state.inspectingRole) {
    state.inspectingRole = role === 'Mage' ? 'Mage' : 'Knight';
    const r = state.inspectingRole;
    const s = state.stats[r] || (r === 'Mage' ? { level: 1, hp: 90, maxHp: 90 } : { level: 1, hp: 220, maxHp: 220 });

    if (charInfoCrest) {
      charInfoCrest.innerHTML = r === 'Mage' ? SVG_ROLE_MAGE_EMBLEM : SVG_ROLE_KNIGHT_EMBLEM;
    }
    if (charInfoTitle) {
      charInfoTitle.textContent =
        r === 'Mage' ? 'Mage · Valley Spellweaver' : 'Knight · Vow of Steel';
    }
    if (charStatLevel) {
      charStatLevel.textContent = `${r} · Lv. ${s.level || 1}`;
    }
    if (charStatHp) {
      charStatHp.textContent = `${Math.round(s.hp)} / ${Math.round(s.maxHp)}`;
    }
    if (charStatElement) {
      charStatElement.textContent =
        state.activeElement === 'fire' ? 'Molten Fire 🔥' : 'Glacial Ice ❄️';
    }
    if (charStatStage) {
      charStatStage.textContent = `Stage ${state.unlockedStage} / 3`;
    }
    if (charAbilityList) {
      charAbilityList.innerHTML = '';
      for (const text of buildUnlockedAbilitiesForRole(r)) {
        const li = document.createElement('li');
        li.className = 'sh-ability-item';
        li.textContent = text;
        charAbilityList.appendChild(li);
      }
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Public Modal & Notification Controls                                    */
  /* ----------------------------------------------------------------------- */

  function showAwakeningCard({
    title = 'Frost Lance awakened',
    subtitle = 'Hold E to aim',
    keyHint = 'E',
    iconType = 'ice',
    durationMs = 5200,
  } = {}) {
    if (!awakeningCard) return;
    if (awakeningTitle) awakeningTitle.textContent = title;
    if (awakeningSub) awakeningSub.textContent = subtitle;
    if (awakeningKey) awakeningKey.textContent = keyHint;
    if (awakeningIcon) {
      awakeningIcon.innerHTML =
        iconType === 'fire'
          ? SVG_FIRE_METEOR_HEX
          : iconType === 'storm'
            ? SVG_ULTIMATE_STORM_VORTEX
            : SVG_ICE_CRYSTAL_HEX;
    }
    awakeningCard.classList.add('is-visible');
    if (awakeningHideTimer) clearTimeout(awakeningHideTimer);
    if (durationMs > 0) {
      awakeningHideTimer = setTimeout(() => {
        awakeningCard.classList.remove('is-visible');
      }, durationMs);
    }
  }

  function hideAwakeningCard() {
    if (awakeningHideTimer) {
      clearTimeout(awakeningHideTimer);
      awakeningHideTimer = null;
    }
    awakeningCard?.classList.remove('is-visible');
  }

  function setProgressionState(patch = {}) {
    const prevCommune = state.communeDiscovered;
    const prevStage = state.unlockedStage;

    if (typeof patch.communeDiscovered === 'boolean') {
      state.communeDiscovered = patch.communeDiscovered;
    }
    if (typeof patch.unlockedStage === 'number') {
      state.unlockedStage = clamp(Math.floor(patch.unlockedStage), 0, 3);
    }
    if (typeof patch.stonesSolved === 'number') {
      state.stonesSolved = clamp(Math.floor(patch.stonesSolved), 0, 3);
    }
    if (patch.activeElement === 'ice' || patch.activeElement === 'fire') {
      state.activeElement = patch.activeElement;
    }
    if (patch.activeRole === 'Knight' || patch.activeRole === 'Mage') {
      state.activeRole = patch.activeRole;
    }

    if (!prevCommune && state.communeDiscovered && communeRibbon) {
      communeRibbon.classList.add('is-visible');
      if (ribbonHideTimer) clearTimeout(ribbonHideTimer);
      ribbonHideTimer = setTimeout(() => {
        communeRibbon.classList.remove('is-visible');
      }, 4500);
    }

    if (state.unlockedStage > prevStage && patch.showNotification !== false) {
      const isMage = state.activeRole === 'Mage';
      if (state.unlockedStage === 1) {
        showAwakeningCard({
          title: isMage ? 'Frost Lance awakened' : 'Ice Sword awakened',
          subtitle: isMage ? 'Hold E to aim' : 'Press E to imbue blade',
          keyHint: 'E',
          iconType: 'ice',
        });
      } else if (state.unlockedStage === 2) {
        showAwakeningCard({
          title: isMage ? 'Cinder Fall awakened' : 'Fire Sword awakened',
          subtitle: 'Press Tab to toggle Ice & Fire',
          keyHint: 'Tab',
          iconType: 'fire',
        });
      } else if (state.unlockedStage === 3) {
        showAwakeningCard({
          title: isMage ? 'Storm Cataclysm awakened' : 'Sky-Lightning awakened',
          subtitle: 'Press Q to unleash Ultimate',
          keyHint: 'Q',
          iconType: 'storm',
        });
      }
    }

    renderRoleAndPartyBars();
    renderProgressionAndSlots();
    if (charInfoModal?.classList.contains('is-open')) {
      renderCharacterInfoModal(state.inspectingRole);
    }
  }

  function setCommuneState(patch = {}) {
    if (typeof patch.listening === 'boolean') {
      state.commune.listening = patch.listening;
      if (patch.listening) {
        state.communeDiscovered = true;
      }
    }
    if (typeof patch.elapsedSeconds === 'number') {
      state.commune.elapsedSeconds = clamp(patch.elapsedSeconds, 0, state.commune.maxSeconds);
    }
    if (typeof patch.maxSeconds === 'number' && patch.maxSeconds > 0) {
      state.commune.maxSeconds = patch.maxSeconds;
    }
    renderProgressionAndSlots();
  }

  function setNearbyStonePrompt({
    visible = false,
    stoneName = 'Read',
    screenX = null,
    screenY = null,
  } = {}) {
    if (!stoneReadPill) return;
    stoneReadPill.classList.toggle('is-visible', Boolean(visible));
    if (stoneReadLabel) {
      stoneReadLabel.textContent = stoneName || 'Read';
    }
    if (typeof screenX === 'number' && typeof screenY === 'number') {
      stoneReadPill.style.left = `${screenX.toFixed(1)}px`;
      stoneReadPill.style.top = `${screenY.toFixed(1)}px`;
    }
  }

  function openInscriptionModal({
    title = 'Sacred Inscription Stone',
    lines = [],
    hint = 'Touch Commune and speak aloud to the God of Love.',
  } = {}) {
    if (!inscriptionModal) return;
    if (inscriptionTitle) inscriptionTitle.textContent = title;
    if (inscriptionLines) {
      inscriptionLines.innerHTML = '';
      const arr = Array.isArray(lines) ? lines : [String(lines || '')];
      for (const line of arr) {
        if (!line) continue;
        const p = document.createElement('p');
        p.textContent = line;
        inscriptionLines.appendChild(p);
      }
    }
    if (inscriptionHint) inscriptionHint.textContent = hint;
    inscriptionModal.classList.add('is-open');
    inscriptionCloseBtn?.focus();
  }

  function closeInscriptionModal() {
    inscriptionModal?.classList.remove('is-open');
  }

  function openCharacterInfoModal(role = state.activeRole) {
    renderCharacterInfoModal(role);
    charInfoModal?.classList.add('is-open');
    charCloseBtn?.focus();
  }

  function closeCharacterInfoModal() {
    charInfoModal?.classList.remove('is-open');
  }

  function openPauseModal() {
    pauseModal?.classList.add('is-open');
    pauseResumeBtn?.focus();
  }

  function closePauseModal() {
    pauseModal?.classList.remove('is-open');
  }

  /* ----------------------------------------------------------------------- */
  /* Touch Joystick & Action Cluster Wiring                                  */
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

  // Primary Attack Button: Tap = 'attack', Hold >= 260ms = 'heavy' (Mage Shatterlance / Knight Shield Block)
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
      }, 260);
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

  if (dashBtn) {
    dashBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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

  // E Power Slot: Hold E to aim / Release E to cast for Mage; Tap E for Knight
  let eAimActive = false;
  let ePointerId = null;

  if (slotE) {
    slotE.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (state.unlockedStage < 1) return;
      try {
        slotE.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      ePointerId = e.pointerId;
      eAimActive = true;
      if (state.activeRole === 'Knight') {
        if (typeof onAction === 'function') {
          onAction('skill_e', { role: 'Knight', element: state.activeElement });
        }
        if (typeof onAimStart === 'function') {
          onAimStart({ slot: 'E', role: 'Knight', element: state.activeElement, clientX: e.clientX, clientY: e.clientY });
        }
      } else if (typeof onAimStart === 'function') {
        onAimStart({ slot: 'E', role: 'Mage', element: state.activeElement, clientX: e.clientX, clientY: e.clientY });
      }
    });

    slotE.addEventListener('pointermove', (e) => {
      if (!eAimActive || e.pointerId !== ePointerId) return;
      e.stopPropagation();
      if (typeof onAimMove === 'function') {
        onAimMove({
          slot: 'E',
          role: state.activeRole,
          element: state.activeElement,
          clientX: e.clientX,
          clientY: e.clientY,
        });
      }
    });

    const releaseSlotE = (e) => {
      if (!eAimActive) return;
      eAimActive = false;
      ePointerId = null;
      if (state.activeRole === 'Mage') {
        if (typeof onAimRelease === 'function') {
          onAimRelease({
            slot: 'E',
            role: 'Mage',
            element: state.activeElement,
            clientX: e?.clientX ?? 0,
            clientY: e?.clientY ?? 0,
          });
        } else if (typeof onAction === 'function') {
          onAction('skill_e', { role: 'Mage', element: state.activeElement });
        }
      }
    };
    slotE.addEventListener('pointerup', releaseSlotE);
    slotE.addEventListener('pointercancel', releaseSlotE);
  }

  // Tab Element Toggle
  if (slotTab) {
    slotTab.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.unlockedStage < 2) return;
      state.activeElement = state.activeElement === 'ice' ? 'fire' : 'ice';
      renderProgressionAndSlots();
      if (typeof onToggleElement === 'function') {
        onToggleElement(state.activeElement);
      }
    });
  }

  // Q Ultimate Slot
  if (slotQ) {
    slotQ.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.unlockedStage < 3) return;
      if (typeof onAction === 'function') {
        onAction('ultimate', { role: state.activeRole, element: state.activeElement });
      }
    });
  }

  // Commune Start & Stop/Send Buttons
  if (communeBtn) {
    communeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.communeDiscovered) return;
      setCommuneState({ listening: true, elapsedSeconds: 0 });
      if (typeof onCommuneToggle === 'function') {
        onCommuneToggle(true);
      }
    });
  }

  if (communeStopBtn) {
    communeStopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setCommuneState({ listening: false });
      if (typeof onCommuneToggle === 'function') {
        onCommuneToggle(false);
      }
    });
  }

  // Stone Read Pill & Inscription Modal
  if (stoneReadPill) {
    stoneReadPill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof onReadStone === 'function') {
        onReadStone();
      }
    });
  }

  if (inscriptionCloseBtn) {
    inscriptionCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeInscriptionModal();
    });
  }

  // Role Emblems -> Character Info Card
  if (primaryEmblemBtn) {
    primaryEmblemBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCharacterInfoModal(primaryEmblemBtn.dataset.roleEmblem || state.activeRole);
    });
  }

  if (partnerEmblemBtn) {
    partnerEmblemBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCharacterInfoModal(partnerEmblemBtn.dataset.roleEmblem || 'Mage');
    });
  }

  if (charCloseBtn) {
    charCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCharacterInfoModal();
    });
  }

  function triggerHeroSwap() {
    state.activeRole = state.activeRole === 'Knight' ? 'Mage' : 'Knight';
    renderRoleAndPartyBars();
    renderCharacterInfoModal(state.activeRole);
    if (typeof onSwapHero === 'function') {
      onSwapHero(state.activeRole);
    }
  }

  if (charSwapBtn) {
    charSwapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerHeroSwap();
    });
  }

  // Pause Modal & Time-of-Day / Profile Controls
  if (pauseBtn) {
    pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPauseModal();
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

  // Backdrop click & Escape key to close open modals
  [inscriptionModal, charInfoModal, pauseModal].forEach((modal) => {
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('is-open');
      }
    });
  });

  function onGlobalKeyDown(e) {
    if (e.key === 'Escape') {
      if (inscriptionModal?.classList.contains('is-open')) {
        closeInscriptionModal();
      } else if (charInfoModal?.classList.contains('is-open')) {
        closeCharacterInfoModal();
      } else if (pauseModal?.classList.contains('is-open')) {
        closePauseModal();
      }
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
    const isTouchCapable =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));
    const showTouch = state.profile === 'tablet' || isTouchCapable;
    root.classList.toggle('profile-tablet', showTouch);

    root.querySelectorAll('[data-profile-choice]').forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.profileChoice === state.profile);
    });
  }

  function setTimeOfDaySelection(todKey) {
    state.timeOfDay = todKey || 'day';
    root.querySelectorAll('[data-tod-choice]').forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.todChoice === state.timeOfDay);
    });
  }

  function setActiveRole(role) {
    if (role === 'Knight' || role === 'Mage') {
      state.activeRole = role;
      renderRoleAndPartyBars();
    }
  }

  function setElement(element) {
    if (element === 'ice' || element === 'fire') {
      state.activeElement = element;
      renderProgressionAndSlots();
    }
  }

  function updatePartyStatus({
    activeRole,
    knight,
    mage,
    activeElement,
    cooldowns,
  } = {}) {
    if (activeRole === 'Knight' || activeRole === 'Mage') {
      state.activeRole = activeRole;
    }
    if (activeElement === 'ice' || activeElement === 'fire') {
      state.activeElement = activeElement;
    }
    if (knight) {
      state.stats.Knight = {
        level: knight.level ?? state.stats.Knight.level ?? 1,
        hp: knight.hp ?? state.stats.Knight.hp,
        maxHp: knight.maxHp ?? state.stats.Knight.maxHp,
        shield: knight.shield ?? 0,
      };
    }
    if (mage) {
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
      commune: { ...state.commune },
      stats: {
        Knight: { ...state.stats.Knight },
        Mage: { ...state.stats.Mage },
      },
      cooldowns: { ...state.cooldowns },
    }),
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
    updatePartyStatus,
    resetJoystick,
    setVisible(visible) {
      root.classList.toggle('is-hidden', !visible);
    },
    destroy() {
      if (awakeningHideTimer) clearTimeout(awakeningHideTimer);
      if (ribbonHideTimer) clearTimeout(ribbonHideTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onGlobalKeyDown);
      }
      document.body?.classList.remove('sculpted-hud-mounted');
      root.remove();
    },
  };
}
