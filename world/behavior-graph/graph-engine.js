// ============================================================================
// world/behavior-graph/graph-engine.js
//
// Pure ComfyUI (LiteGraph-style) Minimal Node Graph Engine for Amarante.
// Performance & anti-clutter guarantees:
//   - Zero DOM layout reads (getBoundingClientRect) during pan, zoom, or drag.
//     All port coordinates are computed purely from (node.x, node.y) + fixed
//     layout offsets.
//   - Zero fake parameter input widgets (comfy-widgets-wrap removed).
//   - Zero overlay buttons or popup modals: every node card (332px wide)
//     renders its Header, its causal Input/Output socket rows, and its clean
//     320x180px <video> stage as-is for direct canvas zoom inspection.
// ============================================================================

const NODE_WIDTH = 332;
const HEADER_HEIGHT = 28;
const PORT_ROW_HEIGHT = 22;
const VIDEO_HEIGHT = 180;

export const PORT_COLORS = Object.freeze({
  FLOW: '#60a5fa',
  TRIGGER: '#f472b6',
  STATE: '#34d399',
  VERDICT: '#fbbf24',
  SMITE: '#f87171',
  COMBAT: '#a78bfa',
});

export const INITIAL_NODES = [
  // --- Col 1: Opening (x: 60) ---
  {
    id: 'n_title',
    title: '1 · Title (36px -> 1px Mosaic)',
    accent: '#60a5fa',
    x: 60,
    y: 220,
    clip: '01-flow-title',
    inputs: [],
    outputs: [
      { id: 'out_domain', name: 'Step into the Domain', type: 'FLOW' },
      { id: 'out_invite', name: '?room= invite link', type: 'FLOW' },
    ],
  },

  // --- Col 2: Domain Room (x: 460) ---
  {
    id: 'n_room',
    title: '2 · Open or Join Domain',
    accent: '#60a5fa',
    x: 460,
    y: 220,
    clip: '03-flow-create-join',
    inputs: [
      { id: 'in_flow', name: 'domain_enter', type: 'FLOW' },
    ],
    outputs: [
      { id: 'out_create', name: 'Open a Domain (Enter)', type: 'FLOW' },
      { id: 'out_join', name: 'Join a Domain (Join)', type: 'FLOW' },
      { id: 'out_full', name: '3rd visitor -> room_full', type: 'SMITE' },
    ],
  },

  // --- Col 3: Flower Field 3D Claim (x: 860) ---
  {
    id: 'n_lobby',
    title: '3 · Flower Field 3D Hero Claim',
    accent: '#60a5fa',
    x: 860,
    y: 220,
    clip: '04-flow-flower-lobby',
    inputs: [
      { id: 'in_room', name: 'room_ready', type: 'FLOW' },
    ],
    outputs: [
      { id: 'out_claim_1', name: 'Tap 3D Hero + Shoulder Name', type: 'STATE' },
      { id: 'out_claim_2', name: 'Solo Enter / 2P Claimed -> Start', type: 'FLOW' },
    ],
  },

  // --- Col 4: Bare Genshin HUD Drop (x: 1260) ---
  {
    id: 'n_hud',
    title: '4 · Bare See-Through Ring HUD',
    accent: '#34d399',
    x: 1260,
    y: 220,
    clip: '05-hud-bare-start',
    inputs: [
      { id: 'in_start', name: 'game_start (0, 124)', type: 'FLOW' },
    ],
    outputs: [
      { id: 'out_roam', name: 'roam valley', type: 'FLOW' },
      { id: 'out_k', name: 'knight controls', type: 'COMBAT' },
      { id: 'out_m', name: 'mage controls', type: 'COMBAT' },
    ],
  },

  // --- Col 5: Stone Gaze & Knight Kit (x: 1660) ---
  {
    id: 'n_stone',
    title: '5A · 3D Stone Gaze (<=4.5m, 3s)',
    accent: '#f472b6',
    x: 1660,
    y: -40,
    clip: '07-stone-read-unlock-commune',
    inputs: [
      { id: 'in_roam', name: 'near_stone (<=4.5m)', type: 'FLOW' },
    ],
    outputs: [
      { id: 'out_commune_unlock', name: '3s Gaze -> Commune [R]', type: 'TRIGGER' },
    ],
  },
  {
    id: 'n_knight',
    title: '5B · Knight Kit (Sword & Shield)',
    accent: '#a78bfa',
    x: 1660,
    y: 270,
    clip: '11-knight-combat-kit',
    inputs: [
      { id: 'in_k_combat', name: 'knight_input', type: 'COMBAT' },
    ],
    outputs: [
      { id: 'out_k_combo', name: 'Tap Attack -> 4-hit (1.0-1.3x)', type: 'COMBAT' },
      { id: 'out_k_block', name: 'Hold Attack -> 80% Shield Guard', type: 'STATE' },
      { id: 'out_k_eq', name: 'Tap [E] Buff · [Tab] · [Q] 2x Ult', type: 'COMBAT' },
    ],
  },

  // --- Col 6: Commune Ceremony & Mage Kit (x: 2060) ---
  {
    id: 'n_commune',
    title: '6A · Commune [R] Ceremony',
    accent: '#f472b6',
    x: 2060,
    y: -60,
    clip: '08-commune-tap-vs-hold',
    inputs: [
      { id: 'in_r_available', name: 'Commune [R]', type: 'TRIGGER' },
    ],
    outputs: [
      { id: 'out_hold', name: 'Hold [R] >=1.5s -> release sends', type: 'TRIGGER' },
      { id: 'out_tap', name: 'Tap [R] <1.5s -> 2.2s silence sends', type: 'TRIGGER' },
      { id: 'out_cancel', name: '<2 words -> safe cancel (0 cost)', type: 'STATE' },
    ],
  },
  {
    id: 'n_mage',
    title: '6B · Mage Kit & Aim Arrow',
    accent: '#38bdf8',
    x: 2060,
    y: 280,
    clip: '12-mage-combat-kit',
    inputs: [
      { id: 'in_m_combat', name: 'mage_input', type: 'COMBAT' },
      { id: 'in_k_guard', name: 'knight_shield', type: 'STATE' },
    ],
    outputs: [
      { id: 'out_m_bolts', name: 'Tap Attack -> 3-bolt (75° cone)', type: 'COMBAT' },
      { id: 'out_m_charge', name: 'Hold Attack -> Shatterlance', type: 'COMBAT' },
      { id: 'out_m_eq', name: 'Hold [E] Aim · [Tab] · [Q] Storm', type: 'COMBAT' },
    ],
  },

  // --- Col 7: Riddles, Briar Blessing & Smite (x: 2460) ---
  {
    id: 'n_riddles',
    title: '7A · Non-Linear Stone Unlocks',
    accent: '#fbbf24',
    x: 2460,
    y: -250,
    clip: '06-hud-role-info-and-pause-tabs',
    inputs: [
      { id: 'in_prayer_a', name: 'riddle_prayer', type: 'TRIGGER' },
    ],
    outputs: [
      { id: 'out_ice', name: 'Lakeside -> Ice [E]', type: 'STATE' },
      { id: 'out_fire', name: 'Wisteria -> Fire [E]', type: 'STATE' },
      { id: 'out_tab', name: 'Both Solved -> [Tab] toggle', type: 'STATE' },
      { id: 'out_q', name: 'Town Plaza -> [Q] Ultimate', type: 'STATE' },
    ],
  },
  {
    id: 'n_briar',
    title: '7B · Briar Blessing (Option 9)',
    accent: '#34d399',
    x: 2460,
    y: 70,
    clip: '09-verdict-briar-blessing',
    inputs: [
      { id: 'in_sincere', name: 'sincere_or_funny', type: 'TRIGGER' },
    ],
    outputs: [
      { id: 'out_buff', name: 'Sacred Lotus + 5m Soul Tether', type: 'VERDICT' },
    ],
  },
  {
    id: 'n_smite',
    title: '7C · Wind Petal Smite & Tiers',
    accent: '#f87171',
    x: 2460,
    y: 390,
    clip: '10-verdict-smite-wind-petals',
    inputs: [
      { id: 'in_insincere', name: 'insincere_or_rude', type: 'TRIGGER' },
    ],
    outputs: [
      { id: 'out_safe_lie', name: 'safe lie -> +1 HP', type: 'SMITE' },
      { id: 'out_selfish', name: 'selfish -> -20 HP', type: 'SMITE' },
      { id: 'out_rude', name: 'rude/spam -> -99 / Rose Dissolve', type: 'SMITE' },
    ],
  },

  // --- Col 8: 4 Valley Wave Arenas & Genshin Damage Numbers (x: 2860) ---
  {
    id: 'n_arenas',
    title: '8 · Valley Waves & Genshin DMG',
    accent: '#fbbf24',
    x: 2860,
    y: 120,
    clip: '02-flow-loading',
    inputs: [
      { id: 'in_powers', name: 'unlocked E / Tab / Q', type: 'STATE' },
      { id: 'in_blessing', name: 'briar_tether_buff', type: 'VERDICT' },
      { id: 'in_hits', name: 'contact_frame_hits', type: 'COMBAT' },
    ],
    outputs: [
      { id: 'out_dmg_nums', name: 'Floating Genshin DMG numbers', type: 'VERDICT' },
      { id: 'out_wave_scale', name: 'Co-op wave progression', type: 'STATE' },
    ],
  },
];

export const INITIAL_LINKS = [
  // Col 1 -> Col 2 -> Col 3 -> Col 4
  { from: 'n_title', outIdx: 0, to: 'n_room', inIdx: 0 },
  { from: 'n_title', outIdx: 1, to: 'n_lobby', inIdx: 0 },
  { from: 'n_room', outIdx: 0, to: 'n_lobby', inIdx: 0 },
  { from: 'n_room', outIdx: 1, to: 'n_lobby', inIdx: 0 },
  { from: 'n_lobby', outIdx: 1, to: 'n_hud', inIdx: 0 },

  // Col 4 -> Col 5 & Col 6
  { from: 'n_hud', outIdx: 0, to: 'n_stone', inIdx: 0 },
  { from: 'n_hud', outIdx: 1, to: 'n_knight', inIdx: 0 },
  { from: 'n_hud', outIdx: 2, to: 'n_mage', inIdx: 0 },
  { from: 'n_stone', outIdx: 0, to: 'n_commune', inIdx: 0 },
  { from: 'n_knight', outIdx: 1, to: 'n_mage', inIdx: 1 },

  // Col 6 -> Col 7
  { from: 'n_commune', outIdx: 0, to: 'n_riddles', inIdx: 0 },
  { from: 'n_commune', outIdx: 1, to: 'n_riddles', inIdx: 0 },
  { from: 'n_commune', outIdx: 0, to: 'n_briar', inIdx: 0 },
  { from: 'n_commune', outIdx: 1, to: 'n_smite', inIdx: 0 },

  // Col 7 & Col 5/6 -> Col 8
  { from: 'n_riddles', outIdx: 0, to: 'n_arenas', inIdx: 0 },
  { from: 'n_riddles', outIdx: 1, to: 'n_arenas', inIdx: 0 },
  { from: 'n_riddles', outIdx: 2, to: 'n_arenas', inIdx: 0 },
  { from: 'n_riddles', outIdx: 3, to: 'n_arenas', inIdx: 0 },
  { from: 'n_briar', outIdx: 0, to: 'n_arenas', inIdx: 1 },
  { from: 'n_knight', outIdx: 0, to: 'n_arenas', inIdx: 2 },
  { from: 'n_knight', outIdx: 2, to: 'n_arenas', inIdx: 2 },
  { from: 'n_mage', outIdx: 0, to: 'n_arenas', inIdx: 2 },
  { from: 'n_mage', outIdx: 2, to: 'n_arenas', inIdx: 2 },
];

/**
 * Pure arithmetic port position calculator - zero DOM reflows.
 */
function getPortPosition(node, isOutput, portIndex) {
  const x = isOutput ? node.x + NODE_WIDTH : node.x;
  const y = node.y + HEADER_HEIGHT + 6 + portIndex * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT * 0.5;
  return { x, y };
}

function buildBezierPath(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.5, 48);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function mountBehaviorGraphApp() {
  const viewport = document.getElementById('comfy-viewport');
  const stage = document.getElementById('comfy-stage');
  const svgLayer = document.getElementById('comfy-links-svg');
  const nodesLayer = document.getElementById('comfy-nodes-layer');
  const zoomLabel = document.getElementById('comfy-zoom-label');
  const fitBtn = document.getElementById('comfy-fit-btn');
  const resetBtn = document.getElementById('comfy-reset-btn');

  const nodes = structuredClone(INITIAL_NODES);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const linkEls = [];

  let panX = 40;
  let panY = 140;
  let scale = 0.72;
  let activeVideoEl = null;

  function applyStageTransform() {
    stage.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  function activateSingleVideo(videoEl) {
    if (activeVideoEl && activeVideoEl !== videoEl) {
      activeVideoEl.pause();
    }
    activeVideoEl = videoEl;
    if (videoEl) {
      videoEl.play().catch(() => {});
    }
  }

  // Create SVG cubic-bezier wires once
  svgLayer.innerHTML = '';
  for (let i = 0; i < INITIAL_LINKS.length; i++) {
    const link = INITIAL_LINKS[i];
    const fromNode = nodeMap.get(link.from);
    const toNode = nodeMap.get(link.to);
    const outPort = fromNode?.outputs[link.outIdx];
    const color = PORT_COLORS[outPort?.type] || '#94a3b8';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'comfy-link');
    path.setAttribute('stroke', color);
    svgLayer.appendChild(path);
    linkEls.push({ link, path, fromNode, toNode });
  }

  function updateAllLinks() {
    for (let i = 0; i < linkEls.length; i++) {
      const { link, path, fromNode, toNode } = linkEls[i];
      if (!fromNode || !toNode) continue;
      const p1 = getPortPosition(fromNode, true, link.outIdx);
      const p2 = getPortPosition(toNode, false, link.inIdx);
      path.setAttribute('d', buildBezierPath(p1.x, p1.y, p2.x, p2.y));
    }
  }

  function updateLinksForNode(nodeId) {
    for (let i = 0; i < linkEls.length; i++) {
      const { link, path, fromNode, toNode } = linkEls[i];
      if (link.from !== nodeId && link.to !== nodeId) continue;
      const p1 = getPortPosition(fromNode, true, link.outIdx);
      const p2 = getPortPosition(toNode, false, link.inIdx);
      path.setAttribute('d', buildBezierPath(p1.x, p1.y, p2.x, p2.y));
    }
  }

  // Render clean ComfyUI node cards (Header + Ports + 320x180 <video> stage as-is)
  nodesLayer.innerHTML = '';
  for (const node of nodes) {
    const el = document.createElement('div');
    el.className = 'comfy-node';
    el.dataset.nodeId = node.id;
    el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`;
    el.style.setProperty('--node-accent', node.accent);

    const maxPorts = Math.max(node.inputs.length, node.outputs.length);
    let portsHtml = '';
    for (let r = 0; r < maxPorts; r++) {
      const inp = node.inputs[r];
      const out = node.outputs[r];
      const inColor = inp ? PORT_COLORS[inp.type] || '#94a3b8' : 'transparent';
      const outColor = out ? PORT_COLORS[out.type] || '#94a3b8' : 'transparent';
      portsHtml += `
        <div class="comfy-port-row">
          <div class="comfy-port comfy-port-in">
            ${inp ? `<span class="port-dot" style="background:${inColor}"></span><span class="port-name">${inp.name}</span>` : ''}
          </div>
          <div class="comfy-port comfy-port-out">
            ${out ? `<span class="port-name">${out.name}</span><span class="port-dot" style="background:${outColor}"></span>` : ''}
          </div>
        </div>
      `;
    }

    const posterUrl = `behavior-graph/clips/${node.clip}.png`;
    const videoUrl = `behavior-graph/clips/${node.clip}.webm`;

    el.innerHTML = `
      <div class="comfy-node-header">
        <span class="header-dot"></span>
        <span class="header-title">${node.title}</span>
      </div>
      <div class="comfy-ports-wrap">${portsHtml}</div>
      <div class="comfy-media-wrap">
        <video class="comfy-video" src="${videoUrl}" poster="${posterUrl}" loop muted playsinline preload="metadata"></video>
      </div>
    `;

    const videoEl = el.querySelector('.comfy-video');
    const mediaWrap = el.querySelector('.comfy-media-wrap');

    mediaWrap.addEventListener('pointerenter', () => {
      activateSingleVideo(videoEl);
    });
    mediaWrap.addEventListener('pointerleave', () => {
      if (activeVideoEl === videoEl) {
        activateSingleVideo(null);
      }
    });

    // Fast node drag handler
    const headerEl = el.querySelector('.comfy-node-header');
    headerEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      headerEl.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = node.x;
      const origY = node.y;

      for (const item of nodesLayer.children) item.classList.remove('is-selected');
      el.classList.add('is-selected');

      const onMove = (ev) => {
        node.x = Math.round(origX + (ev.clientX - startX) / scale);
        node.y = Math.round(origY + (ev.clientY - startY) / scale);
        el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`;
        updateLinksForNode(node.id);
      };
      const onUp = (ev) => {
        headerEl.releasePointerCapture(ev.pointerId);
        headerEl.removeEventListener('pointermove', onMove);
        headerEl.removeEventListener('pointerup', onUp);
      };
      headerEl.addEventListener('pointermove', onMove);
      headerEl.addEventListener('pointerup', onUp);
    });

    nodesLayer.appendChild(el);
    node._el = el;
  }

  updateAllLinks();
  applyStageTransform();

  // Fast canvas pan (zero layout reads)
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOrigX = 0;
  let panOrigY = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.comfy-node') || e.target.closest('.comfy-hud-bar')) return;
    isPanning = true;
    viewport.classList.add('is-panning');
    viewport.setPointerCapture(e.pointerId);
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOrigX = panX;
    panOrigY = panY;
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    panX = panOrigX + (e.clientX - panStartX);
    panY = panOrigY + (e.clientY - panStartY);
    applyStageTransform();
  });

  const stopPan = (e) => {
    if (!isPanning) return;
    isPanning = false;
    viewport.classList.remove('is-panning');
    if (e?.pointerId !== undefined) {
      try { viewport.releasePointerCapture(e.pointerId); } catch {}
    }
  };
  viewport.addEventListener('pointerup', stopPan);
  viewport.addEventListener('pointercancel', stopPan);

  // Smooth cursor-centered wheel zoom (0.28x to 2.40x)
  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const nextScale = Math.min(2.4, Math.max(0.28, scale * factor));
      if (nextScale === scale) return;
      const wx = (e.clientX - panX) / scale;
      const wy = (e.clientY - panY) / scale;
      scale = nextScale;
      panX = e.clientX - wx * scale;
      panY = e.clientY - wy * scale;
      applyStageTransform();
    },
    { passive: false }
  );

  function fitAllNodes() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const portRows = Math.max(n.inputs.length, n.outputs.length);
      const nodeH = HEADER_HEIGHT + 10 + portRows * PORT_ROW_HEIGHT + VIDEO_HEIGHT + 8;
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + NODE_WIDTH > maxX) maxX = n.x + NODE_WIDTH;
      if (n.y + nodeH > maxY) maxY = n.y + nodeH;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = maxX - minX + 120;
    const bh = maxY - minY + 120;
    scale = Math.min(1.15, Math.max(0.28, Math.min(vw / bw, vh / bh)));
    panX = Math.round((vw - (maxX - minX) * scale) * 0.5 - minX * scale);
    panY = Math.round((vh - (maxY - minY) * scale) * 0.5 - minY * scale);
    applyStageTransform();
  }

  fitBtn?.addEventListener('click', fitAllNodes);
  resetBtn?.addEventListener('click', () => {
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x = INITIAL_NODES[i].x;
      nodes[i].y = INITIAL_NODES[i].y;
      nodes[i]._el.style.transform = `translate3d(${nodes[i].x}px, ${nodes[i].y}px, 0)`;
    }
    updateAllLinks();
    fitAllNodes();
  });

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && document.activeElement?.tagName !== 'INPUT') {
      fitAllNodes();
    }
  });

  fitAllNodes();

  window.__BEHAVIOR_GRAPH__ = {
    nodes,
    links: INITIAL_LINKS,
    fitAllNodes,
  };
}
