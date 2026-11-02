// ============================================================================
// world/src/touch-hud.js
//
// Xiaomi Pad 7 (3:2 144Hz) Genshin-Style Split Touch Controls:
// - Left Floating Dynamic Thumbstick with outer-ring Auto-Sprint (>= 78%)
// - Multi-touch independent Right-Side Camera Orbit zone
// - Bottom-Right Ergonomic Thumb Arc (`right: 24px, bottom: 24px`):
//     1. Primary `Strike` (`82px`, `data-action="attack"`, Tap = Combo, Hold >= 0.28s = Heavy)
//     2. `Evade` (`58px`, `data-action="dash"`)
//     3. `Guard` (`62px`, `data-action="skill"`)
//     4. `Leap` (`52px`, `data-action="jump"`)
//     5. `Cataclysm` (`62px`, `data-action="ultimate"`)
//     6. `Commune` (`60px`, `data-action="commune"`, Hold-to-Commune with `/world/assets/ui/commune-medallion.png`)
// - Mounted 100% inside `#hud` so `toggleHud(false)` hides all UI cleanly for
//   automated Playwright world verification screenshots.
// ============================================================================

export function createTouchHud({
  hudRoot = document.getElementById('hud'),
  onCameraOrbit = null,
  onAction = null,
  onCommuneStart = null,
  onCommuneEnd = null,
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
      width: 34vw;
      height: 62vh;
      pointer-events: auto;
      touch-action: none;
    }
    .joy-base {
      position: absolute;
      left: 42px;
      bottom: 42px;
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: rgba(250, 248, 243, 0.62);
      border: 1.5px solid rgba(28, 25, 23, 0.16);
      box-shadow:
        0 1px 2px rgba(28, 25, 23, 0.08),
        0 8px 24px -4px rgba(28, 25, 23, 0.14);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .joy-base.sprinting {
      border-color: rgba(2, 132, 199, 0.65);
      box-shadow: 0 0 22px rgba(2, 132, 199, 0.28);
    }
    .joy-sprint-ring {
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      border: 1px dashed rgba(28, 25, 23, 0.24);
      pointer-events: none;
    }
    .joy-puck {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.94);
      border: 1.5px solid rgba(28, 25, 23, 0.18);
      box-shadow: 0 4px 12px rgba(28, 25, 23, 0.18);
      transform: translate3d(0px, 0px, 0px);
      pointer-events: none;
    }
    .joy-base.sprinting .joy-puck {
      background: #e0f2fe;
      border-color: #0284c7;
    }
    .joy-label {
      position: absolute;
      bottom: -22px;
      font-size: 0.66rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: rgba(28, 25, 23, 0.78);
      background: rgba(250, 248, 243, 0.85);
      padding: 1px 8px;
      border-radius: 999px;
      pointer-events: none;
      white-space: nowrap;
    }

    /* Right-side Touch Camera Orbit Zone */
    #touch-orbit-zone {
      position: absolute;
      right: 0;
      top: 64px;
      width: 56vw;
      height: calc(100vh - 64px);
      pointer-events: auto;
      touch-action: none;
    }

    /* Bottom-Right Ergonomic Action Arc */
    #touch-action-cluster {
      position: absolute;
      right: 24px;
      bottom: 24px;
      width: 212px;
      height: 212px;
      pointer-events: none;
      z-index: 28;
    }
    .touch-action-btn {
      position: absolute;
      border-radius: 50%;
      background: rgba(250, 248, 243, 0.88);
      border: 1.5px solid rgba(28, 25, 23, 0.16);
      color: #1c1917;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      touch-action: none;
      box-shadow:
        0 1px 2px rgba(28, 25, 23, 0.10),
        0 8px 20px -4px rgba(28, 25, 23, 0.16);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      font-family: inherit;
    }
    .touch-action-btn .lbl {
      font-size: 0.70rem;
      font-weight: 800;
      line-height: 1.1;
      color: #1c1917;
    }
    .touch-action-btn .sub {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.56rem;
      font-weight: 700;
      color: #57534e;
      margin-top: 2px;
    }

    /* 1. Primary Strike / Heavy (82px, Tap / Hold) */
    .touch-action-btn.btn-attack {
      right: 8px;
      bottom: 8px;
      width: 82px;
      height: 82px;
      background: linear-gradient(145deg, #ffffff, #f5f5f4);
      border: 2px solid #1c1917;
    }
    .touch-action-btn.btn-attack .lbl {
      font-size: 0.80rem;
    }

    /* 2. Evade (58px, left of Strike) */
    .touch-action-btn.btn-dash {
      right: 108px;
      bottom: 6px;
      width: 58px;
      height: 58px;
    }

    /* 3. Partner Guard Skill E (62px, upper-left of Strike) */
    .touch-action-btn.btn-skill {
      right: 104px;
      bottom: 76px;
      width: 62px;
      height: 62px;
      background: rgba(224, 242, 254, 0.92);
      border-color: rgba(2, 132, 199, 0.55);
    }
    .touch-action-btn.btn-skill .lbl {
      color: #0c4a6e;
    }
    .touch-action-btn.btn-skill .sub {
      color: #0284c7;
    }

    /* 4. Couples Cataclysm Q (62px, upper-mid of Arc) */
    .touch-action-btn.btn-ultimate {
      right: 54px;
      bottom: 128px;
      width: 62px;
      height: 62px;
      background: linear-gradient(135deg, #fef3c7, #fde68a);
      border-color: rgba(217, 119, 6, 0.65);
    }
    .touch-action-btn.btn-ultimate .lbl {
      color: #92400e;
    }
    .touch-action-btn.btn-ultimate .sub {
      color: #b45309;
    }

    /* 5. Leap (52px, above-right of Strike) */
    .touch-action-btn.btn-jump {
      right: 2px;
      bottom: 102px;
      width: 52px;
      height: 52px;
    }

    /* 6. Hold-to-Commune Medallion Crest (60px, outer-left arc) */
    .touch-action-btn.btn-commune {
      right: 168px;
      bottom: 52px;
      width: 60px;
      height: 60px;
      background: radial-gradient(circle, rgba(254, 243, 199, 0.95), rgba(24, 20, 22, 0.92));
      border: 1.5px solid #f59e0b;
      padding: 4px;
      overflow: hidden;
    }
    .touch-action-btn.btn-commune img {
      width: 30px;
      height: 30px;
      object-fit: contain;
      pointer-events: none;
    }
    .touch-action-btn.btn-commune .lbl {
      font-size: 0.56rem;
      color: #fef3c7;
      margin-top: 1px;
    }
    .touch-action-btn.btn-commune.pressed {
      box-shadow: 0 0 22px rgba(251, 191, 36, 0.85);
      border-color: #fde047;
    }

    @media (prefers-reduced-motion: no-preference) {
      .touch-action-btn {
        transition: transform 120ms ease-out, background-color 120ms ease-out;
      }
      .touch-action-btn:active,
      .touch-action-btn.pressed {
        transform: scale(0.93);
      }
    }
  `;
  document.head.appendChild(styleEl);

  const layer = document.createElement('div');
  layer.id = 'touch-hud-layer';
  layer.innerHTML = `
    <div id="touch-joystick-zone">
      <div class="joy-base" id="joy-base">
        <div class="joy-sprint-ring"></div>
        <div class="joy-puck" id="joy-puck"></div>
        <div class="joy-label" id="joy-label">Move</div>
      </div>
    </div>

    <div id="touch-orbit-zone"></div>

    <div id="touch-action-cluster">
      <button type="button" class="touch-action-btn btn-attack" data-action="attack" aria-label="Strike or Hold Heavy">
        <span class="lbl">Strike</span>
        <span class="sub">Heavy</span>
      </button>
      <button type="button" class="touch-action-btn btn-dash" data-action="dash" aria-label="Evade">
        <span class="lbl">Evade</span>
        <span class="sub">Dash</span>
      </button>
      <button type="button" class="touch-action-btn btn-skill" data-action="skill" aria-label="Guard Partner Skill">
        <span class="lbl">Guard</span>
        <span class="sub">Ward</span>
      </button>
      <button type="button" class="touch-action-btn btn-ultimate" data-action="ultimate" aria-label="Cataclysm Ultimate">
        <span class="lbl">Cataclysm</span>
        <span class="sub">Burst</span>
      </button>
      <button type="button" class="touch-action-btn btn-jump" data-action="jump" aria-label="Leap">
        <span class="lbl">Leap</span>
        <span class="sub">Jump</span>
      </button>
      <button type="button" class="touch-action-btn btn-commune" data-action="commune" aria-label="Hold to Commune">
        <img src="/world/assets/ui/commune-medallion.png" alt="" />
        <span class="lbl">Commune</span>
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

    joyPuck.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0px)`;

    const norm = dist / MAX_JOY_RADIUS;
    const clampedNorm = Math.min(1, norm);
    joyState.x = clampedNorm > 0.08 ? Math.cos(angle) * clampedNorm : 0;
    joyState.y = clampedNorm > 0.08 ? -Math.sin(angle) * clampedNorm : 0;
    joyState.magnitude = clampedNorm > 0.08 ? clampedNorm : 0;
    joyState.sprinting = norm >= SPRINT_THRESHOLD;

    joyBase.classList.toggle('sprinting', joyState.sprinting);
    if (joyLabel) {
      joyLabel.textContent = joyState.sprinting ? 'Sprint' : 'Move';
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
      joyLabel.textContent = 'Move';
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

  // Action Buttons: Strike (Tap = 'attack', Hold >= 0.28s = 'heavy'), Evade, Guard, Cataclysm, Leap, Commune
  let attackHoldTimer = null;

  layer.querySelectorAll('.touch-action-btn').forEach((btn) => {
    const action = btn.dataset.action;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      btn.classList.add('pressed');
      if (action === 'commune') {
        if (onCommuneStart) onCommuneStart();
        return;
      }
      if (action === 'attack') {
        if (onAction) onAction('attack');
        if (attackHoldTimer) clearTimeout(attackHoldTimer);
        attackHoldTimer = setTimeout(() => {
          attackHoldTimer = null;
          if (btn.classList.contains('pressed') && onAction) {
            onAction('heavy');
          }
        }, 280);
      } else if (onAction) {
        onAction(action);
      }
    });
    const releaseBtn = () => {
      if (!btn.classList.contains('pressed')) return;
      btn.classList.remove('pressed');
      if (action === 'commune') {
        if (onCommuneEnd) onCommuneEnd();
        return;
      }
      if (action === 'attack' && attackHoldTimer) {
        clearTimeout(attackHoldTimer);
        attackHoldTimer = null;
      }
    };
    btn.addEventListener('pointerup', releaseBtn);
    btn.addEventListener('pointercancel', releaseBtn);
  });

  function setProfileMode(profileName) {
    const isTouchCapable =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));
    const shouldShow = profileName === 'tablet' || isTouchCapable;
    layer.classList.toggle('visible', shouldShow);
    if (hudRoot) {
      hudRoot.classList.toggle('profile-tablet', shouldShow);
    }
  }

  /**
   * Deterministic visual state setter for Xiaomi Pad 7 screenshot verification.
   */
  function setDemoState({ joyX = 0, joyY = 0, sprinting = false, activeAction = null } = {}) {
    const px = joyX * MAX_JOY_RADIUS;
    const py = -joyY * MAX_JOY_RADIUS;
    joyPuck.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0px)`;
    joyBase.classList.toggle('sprinting', Boolean(sprinting));
    if (joyLabel) {
      joyLabel.textContent = sprinting ? 'Sprint' : 'Move';
    }
    layer.querySelectorAll('.touch-action-btn').forEach((btn) => {
      btn.classList.toggle('pressed', btn.dataset.action === activeAction);
    });
  }

  return {
    layer,
    joyState,
    get isOrbitDragging() {
      return orbitPointerId !== null;
    },
    setProfileMode,
    setDemoState,
    setActiveHeroDisplay: () => {},
    setPrayerBannerVisible: () => {},
    resetJoystick,
  };
}
