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
    font-family: "Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .am-dmg-pop {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate3d(-9999px, -9999px, 0) scale(1);
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-style: normal;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    line-height: 1;
    white-space: nowrap;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(15, 19, 26, 0.36);
    border: 1px solid rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    will-change: transform, opacity;
  }

  .am-dmg-pop.el-physical {
    font-size: 1.05rem;
    color: #f8fafc;
    text-shadow: 0 1.5px 3px rgba(10, 12, 18, 0.9);
  }

  .am-dmg-pop.el-ice {
    font-size: 1.12rem;
    color: #e0f2fe;
    border-color: rgba(186, 230, 253, 0.28);
    text-shadow: 0 1.5px 3px rgba(8, 24, 38, 0.9);
  }

  .am-dmg-pop.el-fire {
    font-size: 1.12rem;
    color: #fed7aa;
    border-color: rgba(253, 186, 116, 0.28);
    text-shadow: 0 1.5px 3px rgba(38, 14, 8, 0.9);
  }

  .am-dmg-pop.el-lightning,
  .am-dmg-pop.is-crit {
    font-size: 1.28rem;
    color: #fef3c7;
    background: rgba(18, 22, 30, 0.52);
    border-color: rgba(253, 224, 71, 0.34);
    text-shadow: 0 1.5px 4px rgba(24, 14, 8, 0.92);
  }

  .am-dmg-pop.el-player-hit {
    font-size: 1.32rem;
    color: #ffffff;
    background: linear-gradient(180deg, #f43f5e 0%, #be123c 100%);
    border: 2px solid #fecdd3;
    box-shadow: 0 4px 16px rgba(225, 29, 72, 0.68);
    text-shadow: 0 1.5px 3px rgba(28, 4, 12, 0.95);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .am-dmg-pop.el-player-blocked {
    font-size: 1.15rem;
    color: #f0f9ff;
    background: linear-gradient(180deg, #0284c7 0%, #0f172a 100%);
    border: 2px solid #7dd3fc;
    box-shadow: 0 4px 14px rgba(14, 165, 233, 0.55);
    text-shadow: 0 1.5px 3px rgba(8, 24, 38, 0.95);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .am-dmg-tag {
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(248, 250, 252, 0.82);
  }

  .am-dmg-val {
    font-weight: 800;
  }
`;

export function normalizeDamageElement(rawElementOrSource = '') {
  const s = String(rawElementOrSource || '').toLowerCase();
  if (s === 'player-hit' || s === 'player_hit') return 'player-hit';
  if (s === 'player-blocked' || s === 'player_blocked') return 'player-blocked';
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
      (Number(worldPos.y) || 0) + (Number(worldPos.heightOffset) || 1.75),
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

  function renderItemContent(el, cleanLabel, numVal, normEl = 'physical') {
    if (!el) return;
    const dispVal =
      normEl === 'player-hit' || normEl === 'player-blocked' ? `-${numVal}` : `${numVal}`;
    if (cleanLabel) {
      el.innerHTML = `<span class="am-dmg-tag">${cleanLabel}</span><span class="am-dmg-val">${dispVal}</span>`;
    } else {
      el.innerHTML = `<span class="am-dmg-val">${dispVal}</span>`;
    }
  }

  function spawnDamageNumber({
    amount = 42,
    element = 'physical',
    source = '',
    isCrit = undefined,
    worldPos = null,
    screenPos = null,
    label = '',
    mergeKey = null,
    duration = 0.90,
  } = {}) {
    const numVal = Math.max(1, Math.round(Number(amount) || 1));
    const normEl = normalizeDamageElement(element || source);
    const cleanLabel = String(label || '').replace(/[✦!]/g, '').trim();
    const crit =
      typeof isCrit === 'boolean'
        ? isCrit
        : Boolean(cleanLabel) || normEl === 'lightning';

    // Option 2 Consolidation: If an active item with the same `mergeKey` exists,
    // accumulate the damage in-place instead of spawning cluttered duplicate popups!
    if (mergeKey) {
      const existing = activeItems.find(
        (it) => it.mergeKey === mergeKey && it.age < it.duration - 0.08
      );
      if (existing) {
        existing.amount += numVal;
        if (cleanLabel && !existing.label) {
          existing.label = cleanLabel;
        }
        existing.age = Math.min(existing.age, 0.08);
        existing.pulseTimer = 0.14;
        if (worldPos && existing.worldPos) {
          existing.worldPos.x = existing.worldPos.x * 0.65 + (Number(worldPos.x) || 0) * 0.35;
          existing.worldPos.y = existing.worldPos.y * 0.65 + (Number(worldPos.y) || 0) * 0.35;
          existing.worldPos.z = existing.worldPos.z * 0.65 + (Number(worldPos.z) || 0) * 0.35;
        }
        renderItemContent(existing.el, existing.label, existing.amount, existing.element);
        updateItemDom(existing, camera);
        return existing;
      }
    }

    spawnCounter += 1;
    const jitterX = ((spawnCounter % 3) - 1) * 14;
    const jitterY = 0;

    let el = null;
    if (root && typeof document !== 'undefined') {
      el = document.createElement('div');
      el.className = `am-dmg-pop el-${normEl}${crit ? ' is-crit' : ''}`;
      el.dataset.damageElement = normEl;
      el.dataset.damageCrit = crit ? 'true' : 'false';
      renderItemContent(el, cleanLabel, numVal, normEl);
      root.appendChild(el);
    }

    const item = {
      id: spawnCounter,
      mergeKey: mergeKey || null,
      amount: numVal,
      element: normEl,
      isCrit: crit,
      label: cleanLabel,
      age: 0,
      pulseTimer: 0.14,
      duration: Math.max(0.45, Number(duration) || 0.90),
      worldPos: worldPos
        ? {
            x: Number(worldPos.x) || 0,
            y: Number(worldPos.y) || 0,
            z: Number(worldPos.z) || 0,
            heightOffset: Number(worldPos.heightOffset ?? 1.85),
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
    while (activeItems.length > 6) {
      const oldest = activeItems.shift();
      oldest?.el?.remove?.();
    }

    updateItemDom(item, camera);
    return item;
  }

  function updateItemDom(item, activeCam) {
    if (!item.el) return;
    const t = Math.min(1, Math.max(0, item.age / item.duration));
    const liftY = -28 * (1 - Math.pow(1 - t, 2.0));
    const pulseBoost = item.pulseTimer > 0 ? (item.pulseTimer / 0.14) * 0.12 : 0;
    const scale = 1.0 + pulseBoost - t * 0.06;
    const opacity = t < 0.72 ? 1.0 : Math.max(0, 1.0 - (t - 0.72) / 0.28);

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

    const activeIdx = Math.max(0, activeItems.indexOf(item));
    const finalX = sx;
    const finalY = sy + liftY - activeIdx * 32;
    item.el.style.opacity = opacity.toFixed(3);
    item.el.style.transform = `translate3d(${finalX.toFixed(1)}px, ${finalY.toFixed(1)}px, 0px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
  }

  function update(dt = 0.016, activeCam = null) {
    if (activeCam) camera = activeCam;
    for (let i = activeItems.length - 1; i >= 0; i--) {
      const item = activeItems[i];
      item.age += dt;
      if (item.pulseTimer > 0) {
        item.pulseTimer = Math.max(0, item.pulseTimer - dt);
      }
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
