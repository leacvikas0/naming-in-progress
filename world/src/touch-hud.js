// ============================================================================
// world/src/touch-hud.js
//
// Xiaomi Pad 7 (3:2 144Hz) Genshin Impact-Style Touch Controls & Co-Op HUD:
// - Left Floating Thumbstick with outer-ring Auto-Sprint indicator
// - Multi-touch independent Right-Side Camera Orbit zone
// - Bottom-Right Ergonomic Thumb-Fan Action Cluster:
//     * Primary Attack (⚔️ Tap: combo1 -> combo2 -> combo3, Hold: charged)
//     * Dash (💨 Shift), Jump (⬆️ Space), Partner Skill (💕 E),
//       Couples Burst (🌟 Q), Hold to Pray to Artorious (🎙️ V)
// - Top-Right Active Hero & Partner Swap Pill (🔄 Tab: Knight <-> Mage)
// - Mounted inside `#hud` so `toggleHud(false)` hides all UI cleanly for
//   automated Playwright world verification screenshots.
// ============================================================================

export function createTouchHud({
  hudRoot = document.getElementById('hud'),
  onCameraOrbit = null,
  onAction = null,
  onPrayStateChange = null,
  onSwapHero = null,
} = {}) {
  const styleEl = document.createElement('style');
  styleEl.id = 'touch-hud-styles';
  styleEl.textContent = `
    #touch-hud-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 25;
      display: none;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    #touch-hud-layer.visible {
      display: block;
    }

    /* Left Floating Virtual Thumbstick */
    #touch-joystick-zone {
      position: absolute;
      left: 0;
      bottom: 0;
      width: 44vw;
      height: 68vh;
      pointer-events: auto;
      touch-action: none;
    }
    .joy-base {
      position: absolute;
      left: 58px;
      bottom: 54px;
      width: 132px;
      height: 132px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(15, 23, 42, 0.32) 0%, rgba(15, 23, 42, 0.62) 100%);
      border: 2px solid rgba(255, 255, 255, 0.28);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.32), inset 0 0 18px rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .joy-base.sprinting {
      border-color: rgba(251, 191, 36, 0.88);
      box-shadow: 0 0 24px rgba(245, 158, 11, 0.48), inset 0 0 18px rgba(251, 191, 36, 0.22);
    }
    .joy-sprint-ring {
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      border: 1.5px dashed rgba(251, 191, 36, 0.42);
      pointer-events: none;
      opacity: 0.65;
    }
    .joy-puck {
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #ffffff 0%, #dbeafe 48%, #93c5fd 100%);
      border: 2px solid rgba(255, 255, 255, 0.92);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.42);
      transform: translate3d(0px, 0px, 0px);
      pointer-events: none;
    }
    .joy-base.sprinting .joy-puck {
      background: radial-gradient(circle at 35% 30%, #fffbeb 0%, #fde68a 52%, #f59e0b 100%);
    }
    .joy-label {
      position: absolute;
      bottom: -22px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgba(241, 245, 249, 0.78);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.75);
      pointer-events: none;
      white-space: nowrap;
    }

    /* Right-side Touch Camera Orbit Zone */
    #touch-orbit-zone {
      position: absolute;
      right: 0;
      top: 68px;
      width: 56vw;
      height: calc(100vh - 68px);
      pointer-events: auto;
      touch-action: none;
    }

    /* Active Hero & Co-Op Partner Swap Pill */
    #touch-hero-bar {
      position: absolute;
      top: 72px;
      right: 16px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      pointer-events: auto;
      z-index: 28;
    }
    .hero-swap-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(15, 23, 42, 0.84);
      backdrop-filter: blur(10px);
      border: 1.5px solid rgba(251, 191, 36, 0.55);
      border-radius: 999px;
      padding: 7px 14px;
      color: #f8fafc;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
      transition: transform 0.12s ease, background 0.15s ease;
    }
    .hero-swap-btn:active {
      transform: scale(0.95);
    }
    .hero-swap-sub {
      font-size: 10.5px;
      font-weight: 600;
      color: #fde68a;
    }

    /* Sanctuary Prayer Banner (when holding V / Pray button) */
    #sanctuary-prayer-banner {
      position: absolute;
      top: 18%;
      left: 50%;
      transform: translateX(-50%) scale(0.95);
      background: linear-gradient(135deg, rgba(30, 27, 75, 0.90), rgba(88, 28, 135, 0.88));
      border: 1.5px solid rgba(253, 224, 71, 0.82);
      border-radius: 16px;
      padding: 12px 24px;
      text-align: center;
      color: #fef9c3;
      box-shadow: 0 0 36px rgba(250, 204, 21, 0.45);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease, transform 0.18s ease;
      z-index: 30;
    }
    #sanctuary-prayer-banner.active {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
    .prayer-title {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fde047;
    }
    .prayer-quote {
      font-size: 11.5px;
      font-style: italic;
      color: #f8fafc;
      margin-top: 3px;
    }

    /* Bottom-Right Genshin-Style Ergonomic Thumb-Fan Action Cluster */
    #touch-action-cluster {
      position: absolute;
      right: 28px;
      bottom: 28px;
      width: 250px;
      height: 230px;
      pointer-events: none;
      z-index: 28;
    }
    .touch-action-btn {
      position: absolute;
      border-radius: 50%;
      background: radial-gradient(circle at 32% 28%, rgba(30, 41, 59, 0.90), rgba(15, 23, 42, 0.94));
      border: 2px solid rgba(255, 255, 255, 0.36);
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      touch-action: none;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.42);
      backdrop-filter: blur(8px);
      transition: transform 0.1s ease, border-color 0.14s ease, box-shadow 0.14s ease;
    }
    .touch-action-btn:active,
    .touch-action-btn.pressed {
      transform: scale(0.91);
      border-color: #fbbf24;
      box-shadow: 0 0 22px rgba(251, 191, 36, 0.65);
    }
    .touch-action-btn .ico {
      font-size: 20px;
      line-height: 1;
    }
    .touch-action-btn .lbl {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.03em;
      margin-top: 2px;
      color: #e2e8f0;
    }
    .touch-action-btn .key-hint {
      position: absolute;
      top: -5px;
      right: -3px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 5px;
      padding: 1px 4px;
      font-size: 8.5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #fde68a;
    }

    /* Primary Attack Button (Bottom-Right Anchor) */
    .touch-action-btn.btn-attack {
      right: 12px;
      bottom: 12px;
      width: 86px;
      height: 86px;
      background: radial-gradient(circle at 32% 28%, rgba(225, 29, 72, 0.88), rgba(136, 19, 55, 0.94));
      border: 2.5px solid rgba(253, 164, 175, 0.85);
      box-shadow: 0 8px 26px rgba(225, 29, 72, 0.45);
    }
    .touch-action-btn.btn-attack .ico {
      font-size: 28px;
    }
    .touch-action-btn.btn-attack .lbl {
      font-size: 10.5px;
      color: #fff1f2;
    }

    /* Radial Thumb-Fan Arc around Primary Attack */
    .touch-action-btn.btn-dash {
      right: 116px;
      bottom: 8px;
      width: 58px;
      height: 58px;
    }
    .touch-action-btn.btn-jump {
      right: 6px;
      bottom: 114px;
      width: 58px;
      height: 58px;
    }
    .touch-action-btn.btn-skill {
      right: 104px;
      bottom: 80px;
      width: 62px;
      height: 62px;
      background: radial-gradient(circle at 32% 28%, rgba(14, 165, 233, 0.86), rgba(3, 105, 161, 0.94));
      border-color: rgba(125, 211, 252, 0.82);
    }
    .touch-action-btn.btn-burst {
      right: 68px;
      bottom: 150px;
      width: 66px;
      height: 66px;
      background: radial-gradient(circle at 32% 28%, rgba(168, 85, 247, 0.90), rgba(107, 33, 168, 0.95));
      border-color: rgba(233, 213, 255, 0.88);
      box-shadow: 0 6px 24px rgba(168, 85, 247, 0.45);
    }
    .touch-action-btn.btn-pray {
      right: 156px;
      bottom: 138px;
      width: 64px;
      height: 64px;
      background: radial-gradient(circle at 32% 28%, rgba(234, 179, 8, 0.90), rgba(161, 98, 7, 0.95));
      border-color: rgba(254, 240, 138, 0.92);
      box-shadow: 0 6px 24px rgba(234, 179, 8, 0.42);
    }
  `;
  document.head.appendChild(styleEl);

  const layer = document.createElement('div');
  layer.id = 'touch-hud-layer';
  layer.innerHTML = `
    <div id="sanctuary-prayer-banner">
      <div class="prayer-title">✨ Sanctuary Time-Dilation · Invoking Artorious ✨</div>
      <div class="prayer-quote">"Artorious, God of Love, bare your eyes to my beloved and grant us your grace!"</div>
    </div>

    <div id="touch-joystick-zone">
      <div class="joy-base" id="joy-base">
        <div class="joy-sprint-ring"></div>
        <div class="joy-puck" id="joy-puck"></div>
        <div class="joy-label" id="joy-label">Move · Outer = Sprint</div>
      </div>
    </div>

    <div id="touch-orbit-zone"></div>

    <div id="touch-hero-bar">
      <button type="button" class="hero-swap-btn" id="touch-swap-hero-btn">
        <span id="touch-active-hero-label">🛡️ Knight (His Hero)</span>
        <span class="hero-swap-sub">🔄 Swap (Tab) · 💕 Mage Wingman</span>
      </button>
    </div>

    <div id="touch-action-cluster">
      <button type="button" class="touch-action-btn btn-attack" data-action="attack">
        <span class="key-hint">J / Click</span>
        <span class="ico">⚔️</span>
        <span class="lbl">Attack</span>
      </button>
      <button type="button" class="touch-action-btn btn-dash" data-action="dash">
        <span class="key-hint">Shift</span>
        <span class="ico">💨</span>
        <span class="lbl">Dash</span>
      </button>
      <button type="button" class="touch-action-btn btn-jump" data-action="jump">
        <span class="key-hint">Space</span>
        <span class="ico">⬆️</span>
        <span class="lbl">Jump</span>
      </button>
      <button type="button" class="touch-action-btn btn-skill" data-action="skill">
        <span class="key-hint">E</span>
        <span class="ico">💕</span>
        <span class="lbl">Skill</span>
      </button>
      <button type="button" class="touch-action-btn btn-burst" data-action="burst">
        <span class="key-hint">Q</span>
        <span class="ico">🌟</span>
        <span class="lbl">Burst</span>
      </button>
      <button type="button" class="touch-action-btn btn-pray" data-action="pray">
        <span class="key-hint">Hold V</span>
        <span class="ico">🎙️</span>
        <span class="lbl">Pray</span>
      </button>
    </div>
  `;

  if (hudRoot) {
    hudRoot.appendChild(layer);
  } else {
    document.body.appendChild(layer);
  }

  const joyZone = layer.querySelector('#touch-joystick-zone');
  const joyBase = layer.querySelector('#joy-base');
  const joyPuck = layer.querySelector('#joy-puck');
  const joyLabel = layer.querySelector('#joy-label');
  const orbitZone = layer.querySelector('#touch-orbit-zone');
  const swapBtn = layer.querySelector('#touch-swap-hero-btn');
  const activeHeroLabel = layer.querySelector('#touch-active-hero-label');
  const prayerBanner = layer.querySelector('#sanctuary-prayer-banner');

  const joyState = {
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    x: 0, // -1 (left) .. +1 (right)
    y: 0, // -1 (back) .. +1 (forward)
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

    joyPuck.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0px)`;

    const norm = dist / MAX_JOY_RADIUS;
    const clampedNorm = Math.min(1, norm);
    joyState.x = clampedNorm > 0.08 ? (Math.cos(angle) * clampedNorm) : 0;
    // Screen Y is down (+), forward locomotion is up (-Y)
    joyState.y = clampedNorm > 0.08 ? (-Math.sin(angle) * clampedNorm) : 0;
    joyState.magnitude = clampedNorm > 0.08 ? clampedNorm : 0;
    joyState.sprinting = norm >= SPRINT_THRESHOLD;

    joyBase.classList.toggle('sprinting', joyState.sprinting);
    if (joyLabel) {
      joyLabel.textContent = joyState.sprinting ? '⚡ Auto-Sprinting' : 'Move · Outer = Sprint';
    }
  }

  function resetJoystick() {
    joyState.active = false;
    joyState.pointerId = null;
    joyState.x = 0;
    joyState.y = 0;
    joyState.magnitude = 0;
    joyState.sprinting = false;
    joyPuck.style.transform = 'translate3d(0px, 0px, 0px)';
    joyBase.classList.remove('sprinting');
    if (joyLabel) {
      joyLabel.textContent = 'Move · Outer = Sprint';
    }
  }

  joyZone.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    joyZone.setPointerCapture(e.pointerId);
    joyState.active = true;
    joyState.pointerId = e.pointerId;
    const rect = joyBase.getBoundingClientRect();
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

  // Right-Side Touch-Drag Camera Orbit
  let orbitPointerId = null;
  let lastOrbitX = 0;
  let lastOrbitY = 0;

  orbitZone.addEventListener('pointerdown', (e) => {
    if (orbitPointerId !== null) return;
    orbitPointerId = e.pointerId;
    lastOrbitX = e.clientX;
    lastOrbitY = e.clientY;
    orbitZone.setPointerCapture(e.pointerId);
  });

  orbitZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== orbitPointerId) return;
    const dx = e.clientX - lastOrbitX;
    const dy = e.clientY - lastOrbitY;
    lastOrbitX = e.clientX;
    lastOrbitY = e.clientY;
    if (onCameraOrbit) {
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

  // Action Buttons: Attack (tap vs hold for Charged), Dash, Jump, Skill, Burst, Hold Pray
  let attackHoldTimer = null;
  let attackChargedFired = false;

  layer.querySelectorAll('.touch-action-btn').forEach((btn) => {
    const action = btn.dataset.action;

    if (action === 'attack') {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        btn.classList.add('pressed');
        attackChargedFired = false;
        clearTimeout(attackHoldTimer);
        attackHoldTimer = setTimeout(() => {
          attackChargedFired = true;
          if (onAction) onAction('charged');
        }, 320);
      });
      const finishAttack = (e) => {
        e.stopPropagation();
        btn.classList.remove('pressed');
        clearTimeout(attackHoldTimer);
        if (!attackChargedFired) {
          if (onAction) onAction('attack');
        }
      };
      btn.addEventListener('pointerup', finishAttack);
      btn.addEventListener('pointercancel', () => {
        btn.classList.remove('pressed');
        clearTimeout(attackHoldTimer);
      });
    } else if (action === 'pray') {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        btn.classList.add('pressed');
        setPrayerBannerVisible(true);
        if (onPrayStateChange) onPrayStateChange(true);
      });
      const finishPray = (e) => {
        e.stopPropagation();
        btn.classList.remove('pressed');
        setPrayerBannerVisible(false);
        if (onPrayStateChange) onPrayStateChange(false);
      };
      btn.addEventListener('pointerup', finishPray);
      btn.addEventListener('pointercancel', finishPray);
    } else {
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        btn.classList.add('pressed');
        if (onAction) onAction(action);
      });
      const releaseBtn = () => btn.classList.remove('pressed');
      btn.addEventListener('pointerup', releaseBtn);
      btn.addEventListener('pointercancel', releaseBtn);
    }
  });

  if (swapBtn) {
    swapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onSwapHero) onSwapHero();
    });
  }

  function setPrayerBannerVisible(active) {
    if (!prayerBanner) return;
    prayerBanner.classList.toggle('active', Boolean(active));
  }

  function setActiveHeroDisplay(heroId) {
    if (!activeHeroLabel) return;
    const isKnight = heroId === 'Knight';
    activeHeroLabel.textContent = isKnight
      ? '🛡️ Knight (His Hero)'
      : '✨ Mage (Her Hero)';
    const sub = swapBtn?.querySelector('.hero-swap-sub');
    if (sub) {
      sub.textContent = isKnight
        ? '🔄 Swap (Tab) · 💕 Mage Wingman'
        : '🔄 Swap (Tab) · 🛡️ Knight Wingman';
    }
  }

  function setProfileMode(profileName) {
    const isTouchCapable =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));
    const shouldShow = profileName === 'tablet' || isTouchCapable;
    layer.classList.toggle('visible', shouldShow);
  }

  return {
    layer,
    joyState,
    setProfileMode,
    setActiveHeroDisplay,
    setPrayerBannerVisible,
    resetJoystick,
  };
}
