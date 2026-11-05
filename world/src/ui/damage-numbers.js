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
    font-family: Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif;
  }

  .am-dmg-pop {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate3d(-9999px, -9999px, 0) scale(1);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    line-height: 1;
    white-space: nowrap;
    will-change: transform, opacity;
  }

  .am-dmg-pop.el-physical {
    font-size: 1.42rem;
    color: #fffdf8;
    text-shadow:
      0 2px 0 #26131d,
      -1.5px -1.5px 0 #26131d,
      1.5px -1.5px 0 #26131d,
      -1.5px 1.5px 0 #26131d,
      1.5px 1.5px 0 #26131d,
      0 6px 14px rgba(24, 10, 18, 0.55);
  }

  .am-dmg-pop.el-ice {
    font-size: 1.56rem;
    color: #a5f3fc;
    text-shadow:
      0 2px 0 #082f49,
      -1.5px -1.5px 0 #082f49,
      1.5px -1.5px 0 #082f49,
      -1.5px 1.5px 0 #082f49,
      1.5px 1.5px 0 #082f49,
      0 0 14px rgba(56, 189, 248, 0.72),
      0 6px 16px rgba(8, 47, 73, 0.62);
  }

  .am-dmg-pop.el-fire {
    font-size: 1.58rem;
    color: #ffedd5;
    color: #fdba74;
    text-shadow:
      0 2px 0 #431407,
      -1.5px -1.5px 0 #431407,
      1.5px -1.5px 0 #431407,
      -1.5px 1.5px 0 #431407,
      1.5px 1.5px 0 #431407,
      0 0 14px rgba(249, 115, 22, 0.78),
      0 6px 16px rgba(67, 20, 7, 0.64);
  }

  .am-dmg-pop.el-lightning,
  .am-dmg-pop.is-crit {
    font-size: 1.88rem;
    color: #fef08a;
    text-shadow:
      0 2.5px 0 #3b0764,
      -1.5px -1.5px 0 #3b0764,
      1.5px -1.5px 0 #3b0764,
      -1.5px 1.5px 0 #3b0764,
      1.5px 1.5px 0 #3b0764,
      0 0 18px rgba(232, 121, 249, 0.85),
      0 8px 20px rgba(46, 16, 101, 0.68);
  }

  .am-dmg-tag {
    font-size: 0.72em;
    font-weight: 700;
    letter-spacing: 0.03em;
    opacity: 0.95;
  }

  .am-dmg-crit-star {
    color: #f472b6;
    font-size: 0.92em;
    text-shadow:
      0 0 10px rgba(244, 114, 182, 0.9),
      0 1px 0 #3b0764;
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
