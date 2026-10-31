// ============================================================================
// world/src/touch-hud.js
//
// Xiaomi Pad 7 (3:2 144Hz) Minimal Light Touch Controls:
// - Left Floating Thumbstick with outer-ring Auto-Sprint
// - Multi-touch independent Right-Side Camera Orbit zone
// - Bottom-Right Clean 3-Button Cluster: Swing (Attack), Frost Lance (Cast K), Jump
// - Mounted inside `#hud` so `toggleHud(false)` hides all UI cleanly for
//   automated Playwright world verification screenshots.
// ============================================================================

export function createTouchHud({
  hudRoot = document.getElementById('hud'),
  onCameraOrbit = null,
  onAction = null,
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
      left: 52px;
      bottom: 52px;
      width: 124px;
      height: 124px;
      border-radius: 50%;
      background: rgba(250, 248, 243, 0.56);
      border: 1.5px solid rgba(28, 25, 23, 0.14);
      box-shadow:
        0 1px 2px rgba(28, 25, 23, 0.06),
        0 8px 24px -4px rgba(28, 25, 23, 0.12);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .joy-base.sprinting {
      border-color: rgba(2, 132, 199, 0.55);
      box-shadow: 0 0 20px rgba(2, 132, 199, 0.22);
    }
    .joy-sprint-ring {
      position: absolute;
      inset: -7px;
      border-radius: 50%;
      border: 1px dashed rgba(28, 25, 23, 0.22);
      pointer-events: none;
    }
    .joy-puck {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(28, 25, 23, 0.16);
      box-shadow: 0 4px 12px rgba(28, 25, 23, 0.16);
      transform: translate3d(0px, 0px, 0px);
      pointer-events: none;
    }
    .joy-base.sprinting .joy-puck {
      background: #e0f2fe;
      border-color: #38bdf8;
    }
    .joy-label {
      position: absolute;
      bottom: -22px;
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: rgba(28, 25, 23, 0.72);
      background: rgba(250, 248, 243, 0.78);
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

    /* Bottom-Right Minimal Light Action Cluster */
    #touch-action-cluster {
      position: absolute;
      right: 32px;
      bottom: 36px;
      width: 190px;
      height: 170px;
      pointer-events: none;
      z-index: 28;
    }
    .touch-action-btn {
      position: absolute;
      border-radius: 50%;
      background: rgba(250, 248, 243, 0.84);
      border: 1px solid rgba(28, 25, 23, 0.12);
      color: #1c1917;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      touch-action: none;
      box-shadow:
        0 1px 2px rgba(28, 25, 23, 0.08),
        0 8px 20px -4px rgba(28, 25, 23, 0.14);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      font-family: inherit;
    }
    .touch-action-btn .lbl {
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1.1;
      color: #1c1917;
    }
    .touch-action-btn .sub {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.625rem;
      font-weight: 600;
      color: #57534e;
      margin-top: 2px;
    }

    .touch-action-btn.btn-attack {
      right: 8px;
      bottom: 8px;
      width: 78px;
      height: 78px;
    }
    .touch-action-btn.btn-cast {
      right: 98px;
      bottom: 20px;
      width: 68px;
      height: 68px;
      background: rgba(224, 242, 254, 0.88);
      border-color: rgba(56, 189, 248, 0.45);
    }
    .touch-action-btn.btn-cast .lbl {
      color: #0c4a6e;
    }
    .touch-action-btn.btn-cast .sub {
      color: #0284c7;
    }
    .touch-action-btn.btn-jump {
      right: 16px;
      bottom: 98px;
      width: 60px;
      height: 60px;
    }

    @media (prefers-reduced-motion: no-preference) {
      .touch-action-btn {
        transition: transform 140ms ease-out, background-color 140ms ease-out;
      }
      .touch-action-btn:active,
      .touch-action-btn.pressed {
        transform: scale(0.94);
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
      <button type="button" class="touch-action-btn btn-attack" data-action="attack" aria-label="Swing weapon">
        <span class="lbl">Swing</span>
        <span class="sub">Click</span>
      </button>
      <button type="button" class="touch-action-btn btn-cast" data-action="cast" aria-label="Cast Frost Lance">
        <span class="lbl">Lance</span>
        <span class="sub">K</span>
      </button>
      <button type="button" class="touch-action-btn btn-jump" data-action="jump" aria-label="Jump">
        <span class="lbl">Jump</span>
        <span class="sub">Space</span>
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

  const MAX_JOY_RADIUS = 48;
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

  // Action Buttons: Swing ('attack'), Lance ('cast'), Jump ('jump')
  layer.querySelectorAll('.touch-action-btn').forEach((btn) => {
    const action = btn.dataset.action;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      btn.classList.add('pressed');
      if (onAction) onAction(action);
    });
    const releaseBtn = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerup', releaseBtn);
    btn.addEventListener('pointercancel', releaseBtn);
  });

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
    setActiveHeroDisplay: () => {},
    setPrayerBannerVisible: () => {},
    resetJoystick,
  };
}
