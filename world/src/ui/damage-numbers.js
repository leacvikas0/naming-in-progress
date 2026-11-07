// ============================================================================
// world/src/ui/damage-numbers.js
//
// Genshin Impact Style Floating Combat Damage Numbers for Amarante:
// - Supports 4 distinct elemental palettes & crit callouts:
//   * `Physical`         — Crisp Warm Ivory-Pearl (`#fffdf7`)
//   * `Ice`              — Luminous Glacial Cyan (`#93ecff`)
//   * `Fire`             — Molten Sunfire Coral-Amber (`#ff9452`)
//   * `Lightning Crit ✦` — Sovereign Violet-Gold (`#fde047` / `#f0abfc` + `✦`)
// - Projects 3D world hit positions (`{ x, y, z }`) into 2D screen space
//   each frame with pop-in scale, upward arc drift, and smooth fade-out.
// ============================================================================

import * as THREE from 'three';

const DAMAGE_NUMBERS_CSS = `
  #amarante-damage-numbers-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 27;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
    font-family: "Playfair Display", "Cormorant Garamond", Georgia, "Palatino Linotype", serif;
  }

  .am-dmg-pop {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate3d(-9999px, -9999px, 0) scale(1);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-style: italic;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
    line-height: 1;
    white-space: nowrap;
    will-change: transform, opacity;
  }

  .am-dmg-pop.el-physical {
    font-size: 1.85rem;
    color: #fffdf9;
    text-shadow:
      0 2px 4px rgba(24, 14, 18, 0.92),
      0 0 12px rgba(24, 14, 18, 0.65);
  }

  .am-dmg-pop.el-ice {
    font-size: 2.05rem;
    color: #f8fafc;
    text-shadow:
      0 2px 5px rgba(12, 24, 38, 0.92),
      0 0 14px rgba(125, 211, 252, 0.78),
      0 6px 18px rgba(8, 47, 73, 0.62);
  }

  .am-dmg-pop.el-fire {
    font-size: 2.1rem;
    color: #fde68a;
    text-shadow:
      0 2px 5px rgba(54, 16, 8, 0.94),
      0 0 16px rgba(249, 115, 22, 0.85),
      0 6px 18px rgba(67, 20, 7, 0.68);
  }

  .am-dmg-pop.el-lightning,
  .am-dmg-pop.is-crit {
    font-size: 2.65rem;
    color: #fcd34d;
    text-shadow:
      0 2px 6px rgba(42, 18, 8, 0.94),
      0 0 18px rgba(245, 158, 11, 0.88),
      0 6px 22px rgba(46, 16, 10, 0.72);
  }

  .am-dmg-tag {
    font-size: 0.68em;
    font-weight: 600;
    letter-spacing: 0.03em;
    opacity: 0.95;
  }

  .am-dmg-crit-star {
    color: #fde68a;
    font-style: normal;
    font-size: 0.76em;
    text-shadow:
      0 0 12px rgba(251, 191, 36, 0.95),
      0 1px 3px rgba(42, 18, 8, 0.9);
  }
`;

export function normalizeDamageElement(rawElementOrSource = '') {
  const s = String(rawElementOrSource || '').toLowerCase();
  if (
    s.includes('ice') ||
    s.includes('rime') ||
    s.includes('frost') ||
    s.includes('shatter') ||
    s.includes('cryo')
  ) {
    return 'ice';
  }
  if (
    s.includes('fire') ||
    s.includes('solar') ||
    s.includes('cinder') ||
    s.includes('burn') ||
    s.includes('pyro')
  ) {
    return 'fire';
  }
  if (
    s.includes('lightning') ||
    s.includes('tempest') ||
    s.includes('storm') ||
    s.includes('thunder') ||
    s.includes('electro') ||
    s.includes('eclipse')
  ) {
    return 'lightning';
  }
  return 'physical';
}

export function createDamageNumbersOverlay({
  container = null,
  camera = null,
} = {}) {
  if (typeof document !== 'undefined') {
    let styleEl = document.getElementById('amarante-damage-numbers-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'amarante-damage-numbers-styles';
      styleEl.textContent = DAMAGE_NUMBERS_CSS;
      document.head.appendChild(styleEl);
    }
  }

  const root =
    typeof document !== 'undefined' ? document.createElement('div') : null;
  if (root) {
    root.id = 'amarante-damage-numbers-layer';
    root.setAttribute('aria-hidden', 'true');
    const mountTarget =
      container ||
      (typeof document !== 'undefined' &&
        (document.getElementById('hud') || document.body));
    mountTarget?.appendChild(root);
  }

  const activeItems = [];
  const _projVec = new THREE.Vector3();
  let spawnCounter = 0;

  function projectToScreen(worldPos, activeCam) {
    const cam = activeCam || camera;
    const width =
      (typeof window !== 'undefined' && window.innerWidth) || 1440;
    const height =
      (typeof window !== 'undefined' && window.innerHeight) || 900;
    if (!cam || !worldPos) {
      return { x: width * 0.5, y: height * 0.42, visible: true };
    }
    _projVec.set(
      Number(worldPos.x) || 0,
      (Number(worldPos.y) || 0) + (Number(worldPos.heightOffset) || 1.55),
      Number(worldPos.z) || 0
    );
    _projVec.project(cam);
    if (_projVec.z > 1.05) {
      return { x: -9999, y: -9999, visible: false };
    }
    const sx = (_projVec.x * 0.5 + 0.5) * width;
    const sy = (-_projVec.y * 0.5 + 0.5) * height;
    return { x: sx, y: sy, visible: true };
  }

  function spawnDamageNumber({
    amount = 42,
    element = 'physical',
    source = '',
    isCrit = undefined,
    worldPos = null,
    screenPos = null,
    label = '',
    duration = 0.95,
  } = {}) {
    const numVal = Math.max(1, Math.round(Number(amount) || 1));
    const normEl = normalizeDamageElement(element || source);
    const crit =
      typeof isCrit === 'boolean'
        ? isCrit
        : normEl === 'lightning' || String(label).includes('✦');

    spawnCounter += 1;
    // Fan out consecutive numbers cleanly
    const fanSlot = (spawnCounter % 5) - 2;
    const jitterX = fanSlot * 18 + ((spawnCounter * 17) % 11) - 5;
    const jitterY = -((spawnCounter % 3) * 10);

    let el = null;
    if (root && typeof document !== 'undefined') {
      el = document.createElement('div');
      el.className = `am-dmg-pop el-${normEl}${crit ? ' is-crit' : ''}`;
      el.dataset.damageElement = normEl;
      el.dataset.damageCrit = crit ? 'true' : 'false';

      const cleanLabel = String(label || '').replace(/✦/g, '').trim();
      const textVal = cleanLabel ? `${cleanLabel} ${numVal}` : `${numVal}`;
      if (crit) {
        el.innerHTML = `<span>${textVal}</span><span class="am-dmg-crit-star">✦</span>`;
      } else {
        el.innerHTML = `<span>${textVal}</span>`;
      }
      root.appendChild(el);
    }

    const item = {
      id: spawnCounter,
      amount: numVal,
      element: normEl,
      isCrit: crit,
      label,
      age: 0,
      duration: Math.max(0.35, Number(duration) || 0.95),
      worldPos: worldPos
        ? {
            x: Number(worldPos.x) || 0,
            y: Number(worldPos.y) || 0,
            z: Number(worldPos.z) || 0,
            heightOffset: Number(worldPos.heightOffset ?? 1.55),
          }
        : null,
      screenPos: screenPos
        ? { x: Number(screenPos.x) || 720, y: Number(screenPos.y) || 400 }
        : null,
      jitterX,
      jitterY,
      el,
    };

    activeItems.push(item);
    while (activeItems.length > 28) {
      const oldest = activeItems.shift();
      oldest?.el?.remove?.();
    }

    updateItemDom(item, camera);
    return item;
  }

  function updateItemDom(item, activeCam) {
    if (!item.el) return;
    const t = Math.min(1, Math.max(0, item.age / item.duration));
    const liftY = -46 * (1 - Math.pow(1 - t, 2.1));
    const scale =
      t < 0.16
        ? 0.75 + (t / 0.16) * (item.isCrit ? 0.55 : 0.35)
        : item.isCrit
          ? 1.30 - ((t - 0.16) / 0.84) * 0.22
          : 1.10 - ((t - 0.16) / 0.84) * 0.12;
    const opacity = t < 0.68 ? 1.0 : Math.max(0, 1.0 - (t - 0.68) / 0.32);

    let sx = 720;
    let sy = 400;
    if (item.screenPos) {
      sx = item.screenPos.x;
      sy = item.screenPos.y;
    } else if (item.worldPos) {
      const proj = projectToScreen(item.worldPos, activeCam);
      if (!proj.visible) {
        item.el.style.opacity = '0';
        return;
      }
      sx = proj.x;
      sy = proj.y;
    }

    const finalX = sx + item.jitterX;
    const finalY = sy + item.jitterY + liftY;
    item.el.style.opacity = opacity.toFixed(3);
    item.el.style.transform = `translate3d(${finalX.toFixed(1)}px, ${finalY.toFixed(1)}px, 0px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
  }

  function update(dt = 0.016, activeCam = null) {
    if (activeCam) camera = activeCam;
    for (let i = activeItems.length - 1; i >= 0; i--) {
      const item = activeItems[i];
      item.age += dt;
      if (item.age >= item.duration) {
        item.el?.remove?.();
        activeItems.splice(i, 1);
        continue;
      }
      updateItemDom(item, camera);
    }
  }

  function clear() {
    while (activeItems.length > 0) {
      const item = activeItems.pop();
      item?.el?.remove?.();
    }
  }

  function getActiveCount() {
    return activeItems.length;
  }

  function getActiveItems() {
    return activeItems.map((it) => ({
      id: it.id,
      amount: it.amount,
      element: it.element,
      isCrit: it.isCrit,
      label: it.label,
      age: Number(it.age.toFixed(3)),
    }));
  }

  return {
    root,
    spawnDamageNumber,
    update,
    clear,
    getActiveCount,
    getActiveItems,
  };
}
