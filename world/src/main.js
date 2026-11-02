// ============================================================================
// world/src/main.js
//
// Stage 5 Assembled World & Live Co-Op Action RPG:
// - Terrain, Water & Landmarks + Tudor Village Houses + Toroidal Gouache Meadow
// - Stylized Time-of-Day Sky (Sun, Moon & Stars) + 4x MSAA HDR Post-Processing
// - Stage 3–5 Co-Op Heroes (Knight & Mage), Pooled Skeleton Waves & Boss Sovereign
// - Complete Stage 4 Opaque VFX & *Demon Slayer* Sword Breathing Suite
// - Hybrid PointerLock + Drag-Orbit PC Controls & Xiaomi Pad 7 (3:2) Touch HUD
// - Cloudflare / Local WebSocket 2-Player Co-Op Room Pairing (`?room=LOVE`)
// - Sanctuary Lobby, Plaza Inscribed Stele Riddle (`GET /api/altar`), and
//   Hold-to-Commune Voice Prayer Flow (`POST /api/commune`)
// ============================================================================

import * as THREE from 'three';
import {
  PLAY_BOUNDARY_RADIUS,
  INNER_EXTENT,
  ZONES,
  BUILDINGS,
  walkableHeightAt,
  terrainHeightAt,
  sampleWorld,
  buildTreeShadowUniformArray,
  createTerrainAndLandmarks,
} from '../assets/terrain/index.js';
import { createHousesKit } from '../assets/houses/index.js';
import { createToroidalMeadow, MEADOW_PROFILES } from '../assets/flowers/index.js';
import { createTimeOfDaySky, TOD_PRESETS } from './sky-tod.js';
import { createWorldPost } from './post.js';
import {
  createCoopPlayerSystem,
  STAGE5_GAMEPLAY_SHOTS,
} from './player-controller.js';
import { createTouchHud } from './touch-hud.js';
import {
  BREATHING_STYLES,
  SPELL_BY_SLOT,
  ACT_DEFINITIONS,
} from './combat/combat-balance.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function shortestAngleDiff(target, current) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------------- */
/* Renderer, Scene & Camera Setup                                            */
/* ------------------------------------------------------------------------- */

const canvas = document.getElementById('world-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});

const PROFILES = {
  desktop: {
    id: 'desktop',
    label: 'Desktop (RX 6700)',
    dpr: Math.min(window.devicePixelRatio || 1, 2.0),
    aaSamples: 4,
    meadowProfile: 'desktop',
    maxGrassTufts: 24000,
  },
  tablet: {
    id: 'tablet',
    label: 'Tablet (Xiaomi Pad 7)',
    dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    aaSamples: 2,
    meadowProfile: 'tablet',
    maxGrassTufts: 14000,
  },
};

let activeProfile = 'desktop';
renderer.setPixelRatio(PROFILES[activeProfile].dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8eef5);
scene.fog = new THREE.Fog(0xd8eef5, 185, 560);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.2,
  900
);

/* ------------------------------------------------------------------------- */
/* 1. Time-of-Day Sky (Stylized Sun, Moon, Stars & 10 Cumulus Clouds)        */
/* ------------------------------------------------------------------------- */

const sky = createTimeOfDaySky({
  quality: 'high',
  camera,
});
scene.add(sky.group);

/* ------------------------------------------------------------------------- */
/* 2. Terrain, Water, Landmarks & Botanical Trees (Zero Duplicate Houses)    */
/* ------------------------------------------------------------------------- */

const terrainKit = createTerrainAndLandmarks(renderer, {
  includeBuildings: false,
  includeHorizonClouds: false,
});
scene.add(terrainKit.group);

const landmarkEmissiveMats = [];
terrainKit.landmarksGroup.traverse((obj) => {
  if (obj.isMesh && obj.name.endsWith('-emissive') && obj.material) {
    landmarkEmissiveMats.push(obj.material);
  }
});

/* ------------------------------------------------------------------------- */
/* 3. Tudor Village Houses Kit (5 Detailed Buildings + Colliders)            */
/* ------------------------------------------------------------------------- */

const housesKit = createHousesKit(renderer);
const village = housesKit.buildAllVillageBuildings(BUILDINGS);
scene.add(village.group);

for (const c of village.colliders) {
  terrainKit.colliders.push({
    ...c,
    hx: c.hx ?? c.halfW,
    hz: c.hz ?? c.halfD,
  });
}

/* ------------------------------------------------------------------------- */
/* 4. Toroidal Gouache Meadow & Valley-Wide Wildflower Drifts                */
/* ------------------------------------------------------------------------- */

function populateValleyWildflowerDrifts(meadowInstance) {
  const colonies = [
    // Zone E: Southern Flower Field Lobby (0, 128) & Winding Southern Road
    { x: -11.5, z: 132.0, r: 9.5 },
    { x: 11.5, z: 132.0, r: 9.5 },
    { x: -14.0, z: 121.0, r: 9.0 },
    { x: 14.0, z: 121.0, r: 9.0 },
    { x: -8.5, z: 140.5, r: 8.5 },
    { x: 8.5, z: 140.5, r: 8.5 },
    { x: -16.5, z: 102.0, r: 8.5 },
    { x: 11.5, z: 98.0, r: 8.5 },
    { x: -24.0, z: 82.0, r: 8.5 },
    { x: 16.5, z: 76.0, r: 8.5 },
    { x: -12.5, z: 58.0, r: 8.5 },
    { x: 26.5, z: 48.0, r: 8.5 },
    // Zone A: Hamlet Well Plaza & Cottage Perimeter Meadows
    { x: -7.5, z: 16.5, r: 7.5 },
    { x: 8.5, z: 17.0, r: 7.5 },
    { x: -23.5, z: -2.0, r: 8.0 },
    { x: 24.5, z: -1.5, r: 8.0 },
    { x: -8.5, z: -24.5, r: 7.5 },
    { x: 9.5, z: -24.0, r: 7.5 },
    { x: -5.5, z: 32.0, r: 9.0 },
    { x: 6.5, z: 34.0, r: 9.0 },
    // Zone B: West Millpond, Waterfall & Pier Meadow
    { x: -24.5, z: 13.5, r: 7.5 },
    { x: -31.0, z: 15.0, r: 7.0 },
    { x: -29.5, z: -11.5, r: 8.0 },
    { x: -36.5, z: -28.0, r: 8.0 },
    { x: -82.0, z: -12.0, r: 8.5 },
    { x: -86.0, z: 12.0, r: 8.5 },
    // Zone C: East Wisteria Combat Ring & Approach Way
    { x: 32.0, z: 3.5, r: 8.0 },
    { x: 42.0, z: -9.5, r: 8.0 },
    { x: 45.5, z: 6.5, r: 7.5 },
    { x: 68.0, z: -27.5, r: 8.5 },
    { x: 68.0, z: 19.5, r: 8.5 },
    { x: 91.0, z: -11.0, r: 8.0 },
    { x: 89.5, z: 7.0, r: 8.0 },
    { x: 98.0, z: -20.0, r: 8.5 },
    { x: 98.0, z: 15.0, r: 8.5 },
    // Zone D: North Shrine Staircase Hillsides & Overlook Perimeter
    { x: -9.0, z: -42.0, r: 8.5 },
    { x: 9.0, z: -42.0, r: 8.5 },
    { x: -10.5, z: -60.0, r: 8.5 },
    { x: 10.5, z: -60.0, r: 8.5 },
    { x: -19.5, z: -82.0, r: 7.5 },
    { x: 19.5, z: -82.0, r: 7.5 },
    { x: -14.0, z: -96.0, r: 7.5 },
    { x: 14.0, z: -96.0, r: 7.5 },
  ];

  const dummy = new THREE.Object3D();
  const keys = Object.keys(meadowInstance.flowerMeshes);

  keys.forEach((key, sIdx) => {
    const imesh = meadowInstance.flowerMeshes[key];
    if (imesh.material?.uniforms) {
      imesh.material.uniforms.uFadeStart.value = 118.0;
      imesh.material.uniforms.uFadeEnd.value = 165.0;
    }
    // Preserve diegetic Crimson Rose rings around the 3 Sacred Inscription Stones
    if (key === 'crimsonRose' || imesh.userData?.lockedSacredRings) {
      return;
    }
    const targetCount = MEADOW_PROFILES[activeProfile]?.counts?.[key] || imesh.count || 200;

    let placed = 0;
    let attempt = 0;
    while (placed < targetCount && attempt < targetCount * 12) {
      attempt++;
      const cIdx = (placed + sIdx * 3) % colonies.length;
      const col = colonies[cIdx];
      const ang = hash(attempt * 7.13 + sIdx * 31.7) * Math.PI * 2;
      const rad = Math.sqrt(hash(attempt * 11.3 + sIdx * 17.9)) * col.r;
      const x = col.x + Math.cos(ang) * rad;
      const z = col.z + Math.sin(ang) * rad;

      const sw = sampleWorld(x, z);
      if (sw.foliageMask < 0.5) continue;

      dummy.position.set(x, terrainHeightAt(x, z), z);
      dummy.rotation.set(0, hash(attempt * 9.1 + sIdx) * Math.PI * 2, 0);
      const sc =
        key === 'toonShrub'
          ? 0.92 + hash(attempt * 15.7) * 0.42
          : 0.98 + hash(attempt * 17.3) * 0.45;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      imesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    imesh.count = placed;
    imesh.instanceMatrix.needsUpdate = true;
    meadowInstance.instanceCounts[key] = placed;
  });
}

let meadow = null;
const treeShadowData = buildTreeShadowUniformArray();
function buildMeadowForProfile(profileName) {
  if (meadow) {
    scene.remove(meadow.group);
    meadow.dispose();
  }
  const cfg = PROFILES[profileName] || PROFILES.desktop;
  meadow = createToroidalMeadow({
    profile: cfg.meadowProfile || 'desktop',
    worldMaskTexture: terrainKit.worldMaskTex,
    sampleHeight: terrainHeightAt,
    worldExtent: INNER_EXTENT,
    treeShadows: treeShadowData.treeShadowVecs,
    treeCount: treeShadowData.treeCount,
  });
  if (meadow.grassMesh && cfg.maxGrassTufts) {
    meadow.grassMesh.count = Math.min(meadow.grassMesh.count, cfg.maxGrassTufts);
    meadow.instanceCounts.grassTuft = meadow.grassMesh.count;
  }
  populateValleyWildflowerDrifts(meadow);
  scene.add(meadow.group);
}

buildMeadowForProfile(activeProfile);

/* ------------------------------------------------------------------------- */
/* 5. Collision Resolution & Toroidal Boundary Wrap                          */
/* ------------------------------------------------------------------------- */

function resolveCollisions(px, pz, radius) {
  let x = px;
  let z = pz;
  let wrapped = false;

  if (Math.hypot(x, z) > PLAY_BOUNDARY_RADIUS) {
    const angle = Math.atan2(z, x) + Math.PI;
    const wrapR = PLAY_BOUNDARY_RADIUS - 6;
    x = Math.cos(angle) * wrapR;
    z = Math.sin(angle) * wrapR;
    wrapped = true;
  }

  for (const c of terrainKit.colliders) {
    if (c.type === 'circle') {
      const dx = x - c.x;
      const dz = z - c.z;
      const minD = c.r + radius;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) {
        x += (dx / d) * (minD - d);
        z += (dz / d) * (minD - d);
      }
    } else if (c.type === 'obb') {
      const hx = c.hx ?? c.halfW ?? 4.0;
      const hz = c.hz ?? c.halfD ?? 4.0;
      const rotY = c.rotY || 0;
      const cos = Math.cos(rotY);
      const sin = Math.sin(rotY);
      const lx = (x - c.x) * cos - (z - c.z) * sin;
      const lz = (x - c.x) * sin + (z - c.z) * cos;
      const cx = clamp(lx, -hx, hx);
      const cz = clamp(lz, -hz, hz);
      const dx = lx - cx;
      const dz = lz - cz;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        let nx = 0;
        let nz = 0;
        if (d > 1e-5) {
          nx = dx / d;
          nz = dz / d;
        } else {
          const penX = hx - Math.abs(lx);
          const penZ = hz - Math.abs(lz);
          if (penX < penZ) nx = lx >= 0 ? 1 : -1;
          else nz = lz >= 0 ? 1 : -1;
        }
        const push = radius - d;
        const lxNew = lx + nx * push;
        const lzNew = lz + nz * push;
        x = c.x + lxNew * cos + lzNew * sin;
        z = c.z - lxNew * sin + lzNew * cos;
      }
    }
  }

  return { x, z, wrapped };
}

/* ------------------------------------------------------------------------- */
/* 6. Stage 5 HUD DOM Elements & Reactive Updater                            */
/* ------------------------------------------------------------------------- */

const hudEl = document.getElementById('hud');
const debugDevPill = document.getElementById('debug-dev-pill');
const statsEl = document.getElementById('stats-readout');
const viewSelect = document.getElementById('view-select');
const hudSwapHeroBtn = document.getElementById('hud-swap-hero-btn');
const hudHeroName = document.getElementById('hud-hero-name');

const knightBarRow = document.getElementById('knight-bar-row');
const mageBarRow = document.getElementById('mage-bar-row');
const knightHpFill = document.getElementById('knight-hp-fill');
const knightShieldFill = document.getElementById('knight-shield-fill');
const knightHpText = document.getElementById('knight-hp-text');
const mageHpFill = document.getElementById('mage-hp-fill');
const mageShieldFill = document.getElementById('mage-shield-fill');
const mageHpText = document.getElementById('mage-hp-text');
const knightBreathingBadge = document.getElementById('knight-breathing-badge');

const coopStatusDot = document.getElementById('coop-status-dot');
const coopStatusLabel = document.getElementById('coop-status-label');
const coopRoomBtn = document.getElementById('coop-room-btn');
const coopRoomCodeEl = document.getElementById('coop-room-code');
const coopShareBtn = document.getElementById('coop-share-btn');

const actStageTag = document.getElementById('act-stage-tag');
const actObjectiveText = document.getElementById('act-objective-text');
const bossHudBar = document.getElementById('boss-hud-bar');
const bossNameLabel = document.getElementById('boss-name-label');
const bossAegisBadge = document.getElementById('boss-aegis-badge');
const bossHpFill = document.getElementById('boss-hp-fill');

const combatBanner = document.getElementById('combat-banner');
const combatBannerTitle = document.getElementById('combat-banner-title');
const combatBannerSub = document.getElementById('combat-banner-sub');

const ultQBtn = document.getElementById('ult-q-btn');
const resonancePctEl = document.getElementById('resonance-pct');
const communeRBtn = document.getElementById('commune-r-btn');
const communeSubLbl = document.getElementById('commune-sub-lbl');

const steleInteractPrompt = document.getElementById('stele-interact-prompt');
const altarSteleModal = document.getElementById('altar-stele-modal');
const altarSteleTitle = document.getElementById('altar-stele-title');
const altarStelePoem = document.getElementById('altar-stele-poem');
const altarSteleCloseBtn = document.getElementById('altar-stele-close-btn');

const sanctuaryLobby = document.getElementById('sanctuary-lobby');
const lobbyMicSelect = document.getElementById('lobby-mic-select');
const lobbyMicRefreshBtn = document.getElementById('lobby-mic-refresh-btn');
const lobbyEnterBtn = document.getElementById('lobby-enter-btn');

const victoryModal = document.getElementById('victory-modal');
const replayExpeditionBtn = document.getElementById('replay-expedition-btn');

let bannerHideTimer = null;

function showCombatBanner({ title = '', subtitle = '' } = {}, durationMs = 3600) {
  if (!combatBanner) return;
  if (combatBannerTitle) combatBannerTitle.textContent = title;
  if (combatBannerSub) combatBannerSub.textContent = subtitle;
  combatBanner.classList.add('visible');
  if (bannerHideTimer) clearTimeout(bannerHideTimer);
  if (durationMs > 0) {
    bannerHideTimer = setTimeout(() => {
      combatBanner.classList.remove('visible');
    }, durationMs);
  }
}

const BREATHING_ICON_MAP = {
  none: 'Steel Wind',
  rime: 'Glacial Tide',
  solar: 'Hinokami Sunfire',
  tempest: 'Thunderclap Wisteria',
  eclipse: 'Sun & Tide Eclipse',
};

function updateCombatHud(snapshot) {
  if (!snapshot) return;

  // 1. Knight & Mage HP + Shield Bars
  const k = snapshot.knight;
  const m = snapshot.mage;
  if (k) {
    const kPct = clamp((k.hp / Math.max(1, k.maxHp)) * 100, 0, 100);
    const kShieldPct = clamp((k.shield / Math.max(1, k.maxHp)) * 100, 0, 100);
    if (knightHpFill) knightHpFill.style.width = `${kPct.toFixed(1)}%`;
    if (knightShieldFill) knightShieldFill.style.width = `${kShieldPct.toFixed(1)}%`;
    if (knightHpText) {
      knightHpText.textContent = k.shield > 0 ? `${k.hp}+${k.shield}` : `${k.hp}/${k.maxHp}`;
    }
    if (knightBreathingBadge) {
      const styleId = k.breathingStyle || 'none';
      knightBreathingBadge.dataset.style = styleId;
      const baseLabel = BREATHING_ICON_MAP[styleId] || BREATHING_ICON_MAP.none;
      knightBreathingBadge.textContent =
        styleId !== 'none' && k.breathingTimer > 0
          ? `${baseLabel} · ${k.breathingTimer.toFixed(0)}s`
          : baseLabel;
    }
  }

  if (m) {
    const mPct = clamp((m.hp / Math.max(1, m.maxHp)) * 100, 0, 100);
    const mShieldPct = clamp((m.shield / Math.max(1, m.maxHp)) * 100, 0, 100);
    if (mageHpFill) mageHpFill.style.width = `${mPct.toFixed(1)}%`;
    if (mageShieldFill) mageShieldFill.style.width = `${mShieldPct.toFixed(1)}%`;
    if (mageHpText) {
      mageHpText.textContent = m.shield > 0 ? `${m.hp}+${m.shield}` : `${m.hp}/${m.maxHp}`;
    }

    // 2. 4-Spell Deck Cooldown Overlays
    for (let slot = 1; slot <= 4; slot++) {
      const spell = SPELL_BY_SLOT[slot];
      const btn = document.querySelector(`.spell-slot-btn[data-spell-slot="${slot}"]`);
      const cdEl = document.querySelector(`[data-cd-slot="${slot}"]`);
      if (spell && btn && cdEl) {
        const rem = m.spellCooldowns?.[spell.id] || 0;
        const onCd = rem > 0.08;
        btn.classList.toggle('on-cooldown', onCd);
        cdEl.textContent = onCd ? `${rem.toFixed(1)}s` : '';
      }
    }
  }

  // 3. Heart Resonance & Q Ultimate Button
  const resPct = clamp(snapshot.heartResonance ?? 0, 0, 100);
  if (resonancePctEl) {
    resonancePctEl.textContent = resPct >= 100 ? '100% READY!' : `${resPct}% Resonance`;
  }
  if (ultQBtn) {
    ultQBtn.classList.toggle('ult-ready', resPct >= 100);
  }

  // 4. Act Objective Pill
  if (actStageTag && actObjectiveText) {
    const actId = snapshot.actId;
    if (actId === 'act1_arena') {
      actStageTag.textContent = 'Act I';
      actObjectiveText.textContent = snapshot.actTriggered
        ? `East Wisteria Clearing — Wave ${Math.max(1, snapshot.waveIndex + 1)}/${snapshot.waveCount}`
        : 'East Wisteria Clearing — Follow Golden Petals East';
    } else if (actId === 'interlude_pier') {
      actStageTag.textContent = 'Interlude';
      actObjectiveText.textContent = 'West Millpond Pier — Touch the Sanctuary Brazier';
    } else if (actId === 'act2_plaza') {
      actStageTag.textContent = 'Act II';
      actObjectiveText.textContent = 'Twilight Hamlet Plaza — Defend the Well Ring Road';
    } else if (actId === 'act3_shrine') {
      actStageTag.textContent = 'Act III';
      actObjectiveText.textContent = 'Starlit North Shrine — Vanquish The Hollow Sovereign';
    } else if (actId === 'victory_dawn') {
      actStageTag.textContent = 'Victory';
      actObjectiveText.textContent = 'Dawn Over Haru-machi — Valley Restored';
    }
  }

  // 5. Boss Bar
  if (bossHudBar) {
    if (snapshot.boss) {
      bossHudBar.classList.add('visible');
      if (bossNameLabel) bossNameLabel.textContent = snapshot.boss.name;
      const bPct = clamp((snapshot.boss.hp / Math.max(1, snapshot.boss.maxHp)) * 100, 0, 100);
      if (bossHpFill) bossHpFill.style.width = `${bPct.toFixed(1)}%`;
      if (bossAegisBadge) {
        bossAegisBadge.textContent =
          snapshot.boss.aegisActive && snapshot.boss.aegisLayers > 0
            ? `Bone Aegis x ${snapshot.boss.aegisLayers}`
            : `${snapshot.boss.hp} / ${snapshot.boss.maxHp} HP`;
      }
    } else {
      bossHudBar.classList.remove('visible');
    }
  }

  // 6. Victory Dawn Modal
  if (victoryModal) {
    victoryModal.classList.toggle('visible', snapshot.actId === 'victory_dawn');
  }
}

function updateCoopPill(roomState) {
  if (!roomState) return;
  const linked = Boolean(roomState.peerConnected);
  if (coopStatusDot) {
    coopStatusDot.classList.toggle('linked', linked);
  }
  if (coopStatusLabel) {
    coopStatusLabel.textContent = linked
      ? `Co-Op Linked (${roomState.role})`
      : 'Wingman AI';
  }
  if (coopRoomCodeEl && roomState.room) {
    coopRoomCodeEl.textContent = roomState.room;
  }
}

function playDivineVerdictVoice(judgment) {
  const audioUrl = judgment?.audioUrl;
  if (!audioUrl || typeof Audio === 'undefined') return;
  try {
    const voiceAudio = new Audio(audioUrl);
    voiceAudio.volume = 0.92;
    voiceAudio.play().catch(() => {});
  } catch {
    // ignore autoplay restriction in headless browsers
  }
}

/* ------------------------------------------------------------------------- */
/* 7. Stage 3–5 Co-Op Player System & Xiaomi Pad 7 Touch HUD                 */
/* ------------------------------------------------------------------------- */

const coopSystem = await createCoopPlayerSystem({
  scene,
  walkableHeightAt,
  resolveCollisions,
  arenaZone: ZONES.arena,
  initialPos: { x: 2.8, z: 14.5, yaw: Math.PI + 0.15 },
  onHeroSwapped: (newHeroId) => {
    if (hudHeroName) {
      hudHeroName.textContent = newHeroId;
    }
    if (knightBarRow) knightBarRow.classList.toggle('is-leader', newHeroId === 'Knight');
    if (mageBarRow) mageBarRow.classList.toggle('is-leader', newHeroId === 'Mage');
  },
  onSkyTodChanged: (nextTod) => {
    applyTimeOfDay(nextTod);
  },
  onHudStateChanged: (snapshot) => {
    updateCombatHud(snapshot);
  },
  onBanner: (bannerObj) => {
    showCombatBanner(bannerObj, 4200);
  },
  onCoopStateChanged: (roomState) => {
    updateCoopPill(roomState);
  },
  onRemoteCommuneVerdict: (judgment) => {
    playDivineVerdictVoice(judgment);
  },
});

const player = coopSystem.player;

/* ------------------------------------------------------------------------- */
/* 7B. Sanctuary Lobby, Altar Stele Riddle & Hold-to-Commune Mic Flow        */
/* ------------------------------------------------------------------------- */

let selectedLobbyRole = 'Knight';
let selectedMicDeviceId = '';
let altarLoadedOnce = false;

async function populateMicDevices(requestPermissionFirst = false) {
  if (!lobbyMicSelect || typeof navigator === 'undefined' || !navigator.mediaDevices) return;
  if (requestPermissionFirst && typeof navigator.mediaDevices.getUserMedia === 'function') {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore if user denied or headless
    }
  }
  if (typeof navigator.mediaDevices.enumerateDevices !== 'function') return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');
    const prevValue = lobbyMicSelect.value || selectedMicDeviceId;
    lobbyMicSelect.innerHTML = '<option value="">Default System Microphone</option>';
    audioInputs.forEach((dev, idx) => {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      opt.textContent = dev.label || `Microphone ${idx + 1}`;
      lobbyMicSelect.appendChild(opt);
    });
    if (prevValue) {
      lobbyMicSelect.value = prevValue;
    }
  } catch {
    // ignore enumeration error
  }
}

function shouldAutoSkipLobby() {
  if (typeof window === 'undefined') return true;
  if (navigator?.webdriver) return true;
  if (window.__HEADLESS_TEST__) return true;
  const search = window.location?.search || '';
  if (search.includes('shot=') || search.includes('nolobby=1')) return true;
  return false;
}

if (sanctuaryLobby) {
  if (!shouldAutoSkipLobby()) {
    sanctuaryLobby.classList.add('visible');
    populateMicDevices(false);
  }
}

document.querySelectorAll('[data-lobby-role]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedLobbyRole = btn.dataset.lobbyRole || 'Knight';
    document.querySelectorAll('[data-lobby-role]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
  });
});

if (lobbyMicRefreshBtn) {
  lobbyMicRefreshBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    populateMicDevices(true);
  });
}

if (lobbyMicSelect) {
  lobbyMicSelect.addEventListener('change', () => {
    selectedMicDeviceId = lobbyMicSelect.value || '';
  });
}

if (lobbyEnterBtn) {
  lobbyEnterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedMicDeviceId = lobbyMicSelect?.value || '';
    const resolvedRole =
      selectedLobbyRole === 'Random'
        ? Math.random() < 0.5
          ? 'Knight'
          : 'Mage'
        : selectedLobbyRole === 'Mage'
          ? 'Mage'
          : 'Knight';
    coopSystem.coopClient.setPreferredRole(resolvedRole);
    if (coopSystem.player.activeHeroId !== resolvedRole) {
      coopSystem.swapActiveHero();
    }
    sanctuaryLobby?.classList.remove('visible');
  });
}

async function openAltarSteleModal() {
  if (!altarSteleModal) return;
  altarSteleModal.classList.add('visible');
  if (steleInteractPrompt) steleInteractPrompt.classList.remove('visible');

  if (!altarLoadedOnce) {
    try {
      const res = await fetch('/api/altar', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.title && altarSteleTitle) {
          altarSteleTitle.textContent = data.title;
        }
        if (Array.isArray(data.lines) && data.lines.length > 0 && altarStelePoem) {
          altarStelePoem.innerHTML = '';
          for (const line of data.lines) {
            const p = document.createElement('p');
            p.textContent = line;
            altarStelePoem.appendChild(p);
          }
          altarLoadedOnce = true;
        }
      }
    } catch {
      // keep default poetic placeholder if offline
    }
  }
}

function closeAltarSteleModal() {
  altarSteleModal?.classList.remove('visible');
}

if (steleInteractPrompt) {
  steleInteractPrompt.addEventListener('click', (e) => {
    e.stopPropagation();
    openAltarSteleModal();
  });
}

if (altarSteleCloseBtn) {
  altarSteleCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAltarSteleModal();
  });
}

let communeHoldActive = false;
let communeInFlight = false;
let communeStream = null;
let communeRecorder = null;
let communeChunks = [];
let communeMimeType = 'audio/webm';

function stopCommuneMicTracksImmediately() {
  if (communeStream) {
    try {
      communeStream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    communeStream = null;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    if (!blob || blob.size === 0 || typeof FileReader === 'undefined') {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

async function startCommuneHold() {
  if (communeHoldActive || communeInFlight) return;
  if (camState.mode === 'vista') {
    camState.mode = 'player';
    updateViewButtons();
  }

  const dist = coopSystem.getHeroDistance();
  if (dist > 5.0) {
    showCombatBanner(
      {
        title: 'COMMUNE · TOO FAR APART',
        subtitle: 'Draw closer to your beloved — one lotus circle must hold you both.',
      },
      3800
    );
    return;
  }

  const ch = coopSystem.startCommuneChannel(coopSystem.player.activeHeroId);
  if (ch?.tooFar) {
    showCombatBanner(
      {
        title: 'COMMUNE · TOO FAR APART',
        subtitle: 'Draw closer to your beloved — one lotus circle must hold you both.',
      },
      3800
    );
    return;
  }

  communeHoldActive = true;
  communeChunks = [];
  communeRBtn?.classList.add('channeling');
  if (communeSubLbl) communeSubLbl.textContent = 'Listening...';

  showCombatBanner(
    {
      title: 'SANCTUARY COMMUNE · SPEAK YOUR PRAYER',
      subtitle: 'Speak the Ancient God’s true name and pray for your beloved...',
    },
    0
  );

  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    try {
      const audioConstraints = selectedMicDeviceId
        ? {
            deviceId: { exact: selectedMicDeviceId },
            echoCancellation: true,
            noiseSuppression: true,
          }
        : { echoCancellation: true, noiseSuppression: true };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      if (!communeHoldActive) {
        // Released before getUserMedia resolved: stop tracks immediately!
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      communeStream = stream;
      if (typeof MediaRecorder !== 'undefined') {
        const preferredTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
        ];
        let chosenType = '';
        for (const t of preferredTypes) {
          if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t)) {
            chosenType = t;
            break;
          }
        }
        communeMimeType = chosenType ? chosenType.split(';')[0] : 'audio/webm';
        communeRecorder = chosenType
          ? new MediaRecorder(stream, { mimeType: chosenType })
          : new MediaRecorder(stream);
        communeRecorder.addEventListener('dataavailable', (ev) => {
          if (ev.data && ev.data.size > 0) {
            communeChunks.push(ev.data);
          }
        });
        communeRecorder.start(120);
      }
    } catch {
      // Fallback cleanly if microphone permission is denied or unavailable in headless browser
      stopCommuneMicTracksImmediately();
    }
  }
}

async function finishCommuneHold() {
  if (!communeHoldActive) return;
  communeHoldActive = false;
  communeInFlight = true;
  communeRBtn?.classList.remove('channeling');
  if (communeSubLbl) communeSubLbl.textContent = 'Judging...';

  // Stop MediaRecorder and IMMEDIATELY stop all microphone tracks so Bluetooth
  // earphones never stay stuck in degraded hands-free communication mode!
  let recordedBlob = null;
  if (communeRecorder && communeRecorder.state !== 'inactive') {
    await new Promise((resolve) => {
      communeRecorder.addEventListener('stop', resolve, { once: true });
      try {
        communeRecorder.stop();
      } catch {
        resolve();
      }
    });
  }
  communeRecorder = null;
  stopCommuneMicTracksImmediately();

  if (communeChunks.length > 0 && typeof Blob !== 'undefined') {
    recordedBlob = new Blob(communeChunks, { type: communeMimeType });
  }
  communeChunks = [];

  coopSystem.setCommuneSuspense(true);
  showCombatBanner(
    {
      title: 'THE ANCIENT GOD OF LOVE LISTENS...',
      subtitle: 'The sacred lotus mandala quickens as your prayer ascends',
    },
    0
  );

  const speakerRole = coopSystem.player.activeHeroId || 'Knight';
  const partnerRole = speakerRole === 'Knight' ? 'Mage' : 'Knight';
  const snap = coopSystem.campaignLoop.getStateSnapshot(coopSystem.heroStates);
  const speakerHero = speakerRole === 'Knight' ? snap.knight : snap.mage;
  const partnerHero = partnerRole === 'Knight' ? snap.knight : snap.mage;

  try {
    const audioBase64 = recordedBlob ? await blobToBase64(recordedBlob) : '';
    const res = await fetch('/api/commune', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: coopSystem.coopClient.getRoomCode(),
        speakerRole,
        partnerRole,
        audioBase64,
        mimeType: communeMimeType,
        gameState: {
          actId: snap.actId,
          distance: coopSystem.getHeroDistance(),
          speakerHp: speakerHero?.hp ?? 100,
          speakerMaxHp: speakerHero?.maxHp ?? 100,
          partnerHp: partnerHero?.hp ?? 100,
          partnerMaxHp: partnerHero?.maxHp ?? 100,
          partnerDowned: Boolean(partnerHero?.downed),
        },
      }),
    });

    const packet = await res.json();
    const judgment = packet?.judgment || packet || { verdict: 'smite' };
    playDivineVerdictVoice(judgment);
    coopSystem.applyCommuneVerdict(judgment, speakerRole);
  } catch {
    const fallbackJudgment = {
      verdict: 'smite',
      clip_id: 'smite_nameless',
      audioUrl: '/world/assets/audio/artorious/smite_nameless.wav',
      divine_quote:
        'You dare call into my sacred grove without speaking my true name? Seek the weathered stone in the plaza!',
    };
    playDivineVerdictVoice(fallbackJudgment);
    coopSystem.applyCommuneVerdict(fallbackJudgment, speakerRole);
  } finally {
    communeInFlight = false;
    if (communeSubLbl) communeSubLbl.textContent = 'Hold [R]';
  }
}

const touchHud = createTouchHud({
  hudRoot: document.getElementById('hud'),
  onCameraOrbit: (dx, dy) => {
    if (camState.mode === 'player') {
      camState.yaw -= dx * 0.0055;
      camState.pitch = clamp(camState.pitch + dy * 0.0045, 0.04, 1.15);
    } else {
      const offset = camState.vistaPos.clone().sub(camState.vistaTarget);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.theta -= dx * 0.0055;
      sph.phi = clamp(sph.phi - dy * 0.0045, 0.08, Math.PI * 0.47);
      offset.setFromSpherical(sph);
      camState.vistaPos.copy(camState.vistaTarget).add(offset);
    }
  },
  onAction: (actionType) => {
    if (camState.mode === 'vista') {
      camState.mode = 'player';
      updateViewButtons();
    }
    coopSystem.triggerAction(actionType);
  },
  onCommuneStart: () => {
    startCommuneHold();
  },
  onCommuneEnd: () => {
    finishCommuneHold();
  },
});

if (communeRBtn) {
  communeRBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    try {
      communeRBtn.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    startCommuneHold();
  });
  const endCommuneBtn = (e) => {
    e.stopPropagation();
    finishCommuneHold();
  };
  communeRBtn.addEventListener('pointerup', endCommuneBtn);
  communeRBtn.addEventListener('pointercancel', endCommuneBtn);
}

if (hudSwapHeroBtn) {
  hudSwapHeroBtn.addEventListener('click', () => {
    coopSystem.swapActiveHero();
  });
}

// Wire 4-Spell Deck Buttons (`1..4`) & `Q` Couples Ultimate Button
document.querySelectorAll('.spell-slot-btn').forEach((btn) => {
  const slot = Number(btn.dataset.spellSlot);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (camState.mode === 'vista') {
      camState.mode = 'player';
      updateViewButtons();
    }
    coopSystem.triggerSpell(slot);
  });
});

if (ultQBtn) {
  ultQBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (camState.mode === 'vista') {
      camState.mode = 'player';
      updateViewButtons();
    }
    coopSystem.triggerAction('ultimate');
  });
}

// Wire Co-Op Room Code Edit & Share Link Buttons
if (coopRoomBtn) {
  coopRoomBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = coopSystem.coopClient.getRoomCode();
    const entered = window.prompt('Enter 4-letter Co-Op Room Code:', current);
    if (entered) {
      const norm = coopSystem.coopClient.setRoomCode(entered);
      if (coopRoomCodeEl) coopRoomCodeEl.textContent = norm;
    }
  });
}

if (coopShareBtn) {
  coopShareBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const shareUrl = coopSystem.coopClient.getShareUrl();
    try {
      await navigator.clipboard?.writeText(shareUrl);
    } catch {
      // ignore clipboard fallback
    }
    const prev = coopShareBtn.textContent;
    coopShareBtn.textContent = 'Copied!';
    setTimeout(() => {
      coopShareBtn.textContent = prev;
    }, 1500);
  });
}

if (replayExpeditionBtn) {
  replayExpeditionBtn.addEventListener('click', () => {
    coopSystem.campaignLoop.resetCampaign();
    coopSystem.teleportLeaderAndPartner(2.8, 14.5, Math.PI + 0.15);
    updateCombatHud(coopSystem.campaignLoop.getStateSnapshot());
  });
}

touchHud.setProfileMode(activeProfile);
updateCombatHud(coopSystem.campaignLoop.getStateSnapshot());
updateCoopPill(coopSystem.coopClient.getState());

/* ------------------------------------------------------------------------- */
/* 8. Post-Processing Pipeline (4x MSAA + Bloom + Time-of-Day Grade)         */
/* ------------------------------------------------------------------------- */

const post = createWorldPost({
  renderer,
  scene,
  camera,
  width: window.innerWidth,
  height: window.innerHeight,
  enabled: true,
  aaSamples: PROFILES[activeProfile].aaSamples,
});

/* ------------------------------------------------------------------------- */
/* 9. Full World Time-of-Day Material Synchronization                        */
/* ------------------------------------------------------------------------- */

const _dayWindowCol = new THREE.Color(0xffffff);
const _nightWindowCol = new THREE.Color(0xffbe55);
const _nightWindowEmissive = new THREE.Color(0xff9d2e);

let currentTodT = TOD_PRESETS.day.t;
let autoCycleTod = false;

export function applyTimeOfDay(modeOrT) {
  const skyState = sky.setTimeOfDay(modeOrT);
  currentTodT = skyState.t;

  // 1. Sync Post-Processing Grade & Restrained Bloom
  post.setTimeOfDayGrade(currentTodT);

  // 2. Sync Scene Fog & Background
  scene.fog.color.copy(skyState.fogColor);
  scene.background.copy(skyState.fogColor);

  // 3. Sync Terrain & Water Shaders
  if (terrainKit.terrainMat?.uniforms) {
    terrainKit.terrainMat.uniforms.uSunDir.value.copy(skyState.activeLightDir);
    terrainKit.terrainMat.uniforms.uFogColor.value.copy(skyState.fogColor);
    terrainKit.terrainMat.uniforms.uLightTint.value.copy(skyState.worldTint);
  }
  if (terrainKit.waterMat?.uniforms) {
    terrainKit.waterMat.uniforms.uLightTint.value.copy(skyState.waterTint);
  }

  // 4. Sync Toroidal Meadow Grass, Wildflowers & Modeled Botanical Trees
  if (meadow?.sharedUniforms) {
    meadow.sharedUniforms.uSunDir.value.copy(skyState.activeLightDir);
    meadow.sharedUniforms.uLightTint.value.copy(skyState.worldTint);
  }
  if (terrainKit.treesSys) {
    terrainKit.treesSys.setSunDirection(skyState.activeLightDir);
    terrainKit.treesSys.setTimeOfDay(skyState.daylight, skyState.worldTint, skyState.fogColor);
  }

  // 5. Dynamic Cottage Window Candlelight, Porch Lanterns, Forge Embers & Shrine Crystal Bloom
  const glow = skyState.windowGlow;
  const glassMat = housesKit.mats.glass;
  if (glassMat) {
    glassMat.color.copy(_dayWindowCol).lerp(_nightWindowCol, glow);
    glassMat.emissive.copy(_nightWindowEmissive);
    glassMat.emissiveIntensity = 1.38 * glow;
  }

  const basicBucket = housesKit.mats.buckets?.solidBasic;
  if (basicBucket) {
    const hdrBoost = 1.0 + 0.68 * glow;
    basicBucket.color.setRGB(hdrBoost, hdrBoost * 0.96, hdrBoost * 0.88);
  }

  for (const emMat of landmarkEmissiveMats) {
    const hdrBoost = 1.0 + 0.72 * glow;
    emMat.color.setRGB(hdrBoost, hdrBoost * 0.96, hdrBoost * 0.90);
  }

  // 6. Sync Complete Stage 4 Opaque VFX Suite & Combat Indicators Lighting
  if (coopSystem?.vfxKit) {
    coopSystem.vfxKit.setLighting({
      sunDir: skyState.activeLightDir,
      daylight: skyState.daylight,
    });
  }
  if (coopSystem?.sanctuarySteleMesh?.material?.uniforms?.uSunDir) {
    coopSystem.sanctuarySteleMesh.material.uniforms.uSunDir.value.copy(
      skyState.activeLightDir
    );
  }
  if (coopSystem?.campaignLoop?.crestAndTetherMesh?.material?.uniforms?.uSunDir) {
    coopSystem.campaignLoop.crestAndTetherMesh.material.uniforms.uSunDir.value.copy(
      skyState.activeLightDir
    );
  }

  syncTodHudControls();
  return skyState;
}

/* ------------------------------------------------------------------------- */
/* 10. Camera Views (1-8) & Automated Verification Shots                     */
/* ------------------------------------------------------------------------- */

export const VIEWS = {
  entry: {
    id: 'entry',
    label: '1 · South Entry',
    mode: 'player',
    px: 0.0,
    pz: 26.0,
    yaw: Math.PI,
    pitch: 0.14,
    dist: 9.0,
  },
  plaza: {
    id: 'plaza',
    label: '2 · Well Plaza',
    mode: 'player',
    px: 3.4,
    pz: 15.2,
    yaw: Math.PI + 0.18,
    pitch: 0.10,
    dist: 8.6,
  },
  mill: {
    id: 'mill',
    label: '3 · Mill & Pier',
    mode: 'vista',
    pos: [-27.5, 5.8, 19.5],
    target: [-46.8, 2.2, -13.5],
    fov: 52,
  },
  arena: {
    id: 'arena',
    label: '4 · Wisteria Arena',
    mode: 'vista',
    pos: [37.5, 4.4, 6.8],
    target: [70.5, 4.2, -5.0],
    fov: 52,
  },
  shrine: {
    id: 'shrine',
    label: '5 · Shrine Arch',
    mode: 'vista',
    pos: [3.8, 10.4, -63.5],
    target: [-1.0, 12.2, -93.0],
    fov: 52,
  },
  shrineLookback: {
    id: 'shrineLookback',
    label: '6 · Sunset Vista',
    mode: 'vista',
    pos: [2.2, 15.6, -71.5],
    target: [-11.5, 7.2, 14.0],
    fov: 54,
  },
  aerial: {
    id: 'aerial',
    label: '7 · Aerial Masterplan',
    mode: 'vista',
    pos: [-16.0, 112.0, 138.0],
    target: [0.0, 0.0, -10.0],
    fov: 48,
  },
  topdown: {
    id: 'topdown',
    label: '8 · Top-Down Map',
    mode: 'vista',
    pos: [0.0, 250.0, -6.0],
    target: [0.0, 0.0, -6.1],
    fov: 46,
  },
};

export const WORLD_SHOTS = {
  'day-plaza': {
    id: 'day-plaza',
    tod: 'day',
    mode: 'vista',
    pos: [5.2, 3.8, 23.2],
    target: [-3.2, 5.8, -16.0],
    fov: 52,
    playerPos: [1.4, 11.5, 0.52],
  },
  'day-mill-pier': {
    id: 'day-mill-pier',
    tod: 'day',
    mode: 'vista',
    pos: [-27.5, 5.8, 19.5],
    target: [-46.8, 2.2, -13.5],
    fov: 52,
    playerPos: [-38.2, 8.9, -2.25],
  },
  'day-arena-wisteria': {
    id: 'day-arena-wisteria',
    tod: 'day',
    mode: 'vista',
    pos: [37.5, 4.4, 6.8],
    target: [70.5, 4.2, -5.0],
    fov: 52,
    playerPos: [47.2, -1.8, 1.85],
  },
  'day-shrine-arch': {
    id: 'day-shrine-arch',
    tod: 'day',
    mode: 'vista',
    pos: [3.8, 10.4, -63.5],
    target: [-1.2, 12.4, -93.0],
    fov: 52,
    playerPos: [-0.7, -76.2, 2.88],
  },
  'evening-sunset-vista': {
    id: 'evening-sunset-vista',
    tod: 'evening',
    mode: 'vista',
    pos: [2.2, 15.6, -71.5],
    target: [-11.5, 7.2, 14.0],
    fov: 54,
    playerPos: [-0.6, -61.5, -0.18],
  },
  'night-moon-shrine': {
    id: 'night-moon-shrine',
    tod: 'night',
    mode: 'vista',
    pos: [3.6, 10.3, -64.0],
    target: [-1.4, 12.6, -93.5],
    fov: 52,
    playerPos: [-0.7, -76.2, 2.85],
  },
  'night-plaza-lanterns': {
    id: 'night-plaza-lanterns',
    tod: 'night',
    mode: 'vista',
    pos: [6.8, 3.6, 16.8],
    target: [-7.5, 5.2, -15.5],
    fov: 52,
    playerPos: [1.6, 8.5, 0.55],
  },
  'aerial-masterplan': {
    id: 'aerial-masterplan',
    tod: 'day',
    mode: 'vista',
    pos: [-18.0, 128.0, 162.0],
    target: [0.0, 0.0, 12.0],
    fov: 50,
    playerPos: [0.0, 14.0, Math.PI],
  },
  'day-flower-lobby': {
    id: 'day-flower-lobby',
    tod: 'day',
    mode: 'vista',
    pos: [0.0, 4.4, 142.0],
    target: [0.0, 2.2, 82.0],
    fov: 52,
    playerPos: [-1.2, 128.0, Math.PI],
  },
  'day-south-road-boulders': {
    id: 'day-south-road-boulders',
    tod: 'day',
    mode: 'vista',
    pos: [-18.5, 4.2, 78.0],
    target: [6.0, 1.8, 38.0],
    fov: 52,
    playerPos: [-4.5, 62.0, Math.PI + 0.15],
  },
  'day-sacred-stone-roses': {
    id: 'day-sacred-stone-roses',
    tod: 'day',
    mode: 'vista',
    pos: [0.4, 2.75, -7.8],
    target: [0.0, 1.25, -14.0],
    fov: 50,
    playerPos: [-1.95, -12.2, 2.35],
  },
};

const camState = {
  mode: 'player',
  yaw: Math.PI + 0.18,
  pitch: 0.10,
  dist: 8.6,
  baseFov: 50,
  vistaPos: new THREE.Vector3(5.2, 3.8, 23.2),
  vistaTarget: new THREE.Vector3(-3.2, 5.8, -16.0),
};

let activeViewId = 'plaza';
let elapsed = 0;
const _meadowFocus = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _camShake = new THREE.Vector3();
const _camImpactPos = new THREE.Vector3();
const _camImpactLook = new THREE.Vector3();
const _camImpactFov = { value: 0 };

function updateMeadowFocus(simTime) {
  camera.getWorldDirection(_camDir);
  const flatLen = Math.hypot(_camDir.x, _camDir.z) || 1;
  const fx = _camDir.x / flatLen;
  const fz = _camDir.z / flatLen;

  if (camState.mode === 'player') {
    _meadowFocus.set(player.x + fx * 16.0, player.y, player.z + fz * 16.0);
  } else if (camera.position.y > 60) {
    _meadowFocus.set(0, 0, 20);
  } else {
    const fwdOffset = 22.0 + Math.max(0, camera.position.y - 5.0) * 1.35;
    _meadowFocus.set(
      clamp(camera.position.x + fx * fwdOffset, -158, 158),
      0,
      clamp(camera.position.z + fz * fwdOffset, -158, 158)
    );
  }
  meadow.update(simTime, _meadowFocus);
}

function updateCamera() {
  if (coopSystem?.vfxKit) {
    coopSystem.vfxKit.getCameraShakeOffset(_camShake);
  } else {
    _camShake.set(0, 0, 0);
  }

  if (coopSystem?.getCameraImpactOffset) {
    coopSystem.getCameraImpactOffset(_camImpactPos, _camImpactLook, _camImpactFov);
  } else {
    _camImpactPos.set(0, 0, 0);
    _camImpactLook.set(0, 0, 0);
    _camImpactFov.value = 0;
  }

  if (camState.mode === 'player') {
    const h = 1.55 + Math.sin(camState.pitch) * camState.dist;
    const flat = Math.cos(camState.pitch) * camState.dist;
    camera.position.set(
      player.x - Math.sin(camState.yaw) * flat + _camShake.x + _camImpactPos.x,
      player.y + h + _camShake.y + _camImpactPos.y,
      player.z - Math.cos(camState.yaw) * flat + _camShake.z + _camImpactPos.z
    );
    camera.lookAt(
      player.x + Math.sin(camState.yaw) * 6.0 + _camShake.x * 0.6 + _camImpactLook.x,
      player.y + 1.85 + _camShake.y * 0.6 + _camImpactLook.y,
      player.z + Math.cos(camState.yaw) * 6.0 + _camShake.z * 0.6 + _camImpactLook.z
    );
    const targetFov = (camState.baseFov || 50) + (_camImpactFov.value || 0);
    if (Math.abs(camera.fov - targetFov) > 1e-3) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  } else {
    camera.position.copy(camState.vistaPos).add(_camShake).add(_camImpactPos);
    camera.lookAt(
      camState.vistaTarget.x + _camShake.x * 0.5 + _camImpactLook.x,
      camState.vistaTarget.y + _camShake.y * 0.5 + _camImpactLook.y,
      camState.vistaTarget.z + _camShake.z * 0.5 + _camImpactLook.z
    );
  }
  camera.updateMatrixWorld();
}

export function setView(id) {
  const v = VIEWS[id] || VIEWS.plaza;
  activeViewId = v.id;
  coopSystem?.resetCameraImpact?.();
  if (v.mode === 'player') {
    camState.mode = 'player';
    camState.yaw = v.yaw;
    camState.pitch = v.pitch;
    camState.dist = v.dist;
    camState.baseFov = 50;
    camera.fov = 50;
    camera.updateProjectionMatrix();
    coopSystem.teleportLeaderAndPartner(v.px, v.pz, v.yaw);
  } else {
    camState.mode = 'vista';
    camState.vistaPos.set(...v.pos);
    camState.vistaTarget.set(...v.target);
    camState.baseFov = v.fov || 50;
    camera.fov = v.fov || 50;
    camera.updateProjectionMatrix();
    if (v.id === 'arena') {
      coopSystem.poseForShot('day-arena-wisteria', null, camera);
    }
  }
  updateCamera();
  updateMeadowFocus(elapsed);
  sky.update(elapsed);
  post.render(0.016);
  updateViewButtons();
  refreshTelemetryReadout();
}

export function setShot(shotId) {
  const s = WORLD_SHOTS[shotId] || WORLD_SHOTS['day-plaza'];
  autoCycleTod = false;
  sanctuaryLobby?.classList.remove('visible');
  closeAltarSteleModal();
  if (steleInteractPrompt) steleInteractPrompt.classList.remove('visible');
  applyTimeOfDay(s.tod);

  camState.mode = 'vista';
  camState.vistaPos.set(...s.pos);
  camState.vistaTarget.set(...s.target);
  camState.baseFov = s.fov || 52;
  camera.fov = s.fov || 52;
  camera.updateProjectionMatrix();

  // Clear camera shake & impact before posing architectural shot
  coopSystem.vfxKit.clear();
  coopSystem.resetCameraImpact?.();
  updateCamera();

  // Deterministically position and pose Knight, Mage, and East Arena Skeletons (0 VFX/Indicator draws)
  coopSystem.poseForShot(shotId, s.playerPos, camera);

  terrainKit.update(
    0.016,
    1.25,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint
  );
  village.update(0.016);
  updateMeadowFocus(1.25);
  sky.update(1.25);
  post.render(0.016);
  refreshTelemetryReadout();
}

export function setGameplayShot(gameplayShotId) {
  const spec =
    STAGE5_GAMEPLAY_SHOTS[gameplayShotId] ||
    STAGE5_GAMEPLAY_SHOTS['01-desktop-act1-sunfire-slash'];

  autoCycleTod = false;
  sanctuaryLobby?.classList.remove('visible');
  closeAltarSteleModal();
  if (steleInteractPrompt) steleInteractPrompt.classList.remove('visible');
  if (spec.profile && spec.profile !== activeProfile) {
    setProfile(spec.profile);
  }
  applyTimeOfDay(spec.tod || 'day');

  camState.mode = 'vista';
  camState.vistaPos.set(...spec.pos);
  camState.vistaTarget.set(...spec.target);
  camState.baseFov = spec.fov || 46;
  camera.fov = spec.fov || 46;
  camera.updateProjectionMatrix();

  // Pose characters, pooled enemies, combat indicators, and Stage 4 VFX
  coopSystem.poseForGameplayShot(gameplayShotId, camera);

  // Zero out shake offset so framing is 100% deterministic
  coopSystem.vfxKit.frostLance._shakeOffset?.set(0, 0, 0);
  coopSystem.vfxKit.shatterlance._shakeOffset?.set(0, 0, 0);
  coopSystem.vfxKit.cinderFall._shakeOffset?.set(0, 0, 0);
  coopSystem.vfxKit.stormLance._shakeOffset?.set(0, 0, 0);
  coopSystem.vfxKit.swordVfx._shakeOffset?.set(0, 0, 0);
  coopSystem.resetCameraImpact?.();
  updateCamera();

  // Synchronize HUD state & Banner for the showcase shot
  const snap = coopSystem.campaignLoop.getStateSnapshot();
  snap.actId = spec.actId || snap.actId;
  snap.heartResonance = spec.heartResonance ?? 75;
  snap.boss = spec.bossHud || null;
  updateCombatHud(snap);

  if (spec.actStageTag && actStageTag) actStageTag.textContent = spec.actStageTag;
  if (spec.objectiveText && actObjectiveText) actObjectiveText.textContent = spec.objectiveText;

  document.querySelectorAll('.spell-slot-btn').forEach((btn) => {
    btn.classList.toggle('active-cast', Number(btn.dataset.spellSlot) === spec.activeSpellSlot);
  });

  if (spec.touchDemo) {
    touchHud.setDemoState(spec.touchDemo);
  } else {
    touchHud.setDemoState({ joyX: 0, joyY: 0, sprinting: false, activeAction: null });
  }

  if (spec.banner) {
    showCombatBanner(spec.banner, 0);
  } else if (combatBanner) {
    combatBanner.classList.remove('visible');
  }

  terrainKit.update(
    0.016,
    1.25,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint
  );
  village.update(0.016);
  updateMeadowFocus(1.25);
  sky.update(1.25);
  post.render(0.016);
  refreshTelemetryReadout();
  return spec;
}

export function setProfile(profileName) {
  if (!PROFILES[profileName]) return;
  activeProfile = profileName;
  const cfg = PROFILES[activeProfile];
  renderer.setPixelRatio(cfg.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
  buildMeadowForProfile(activeProfile);
  touchHud.setProfileMode(activeProfile);
  applyTimeOfDay(currentTodT);
  updateMeadowFocus(elapsed);
  post.render(0.016);
  syncProfileButtons();
  refreshTelemetryReadout();
}

/* ------------------------------------------------------------------------- */
/* 11. HUD Controls, Hybrid PointerLock + Drag-Orbit & Zero-Lag Input         */
/* ------------------------------------------------------------------------- */

if (viewSelect) {
  Object.values(VIEWS).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.label;
    viewSelect.appendChild(opt);
  });
  viewSelect.addEventListener('change', (e) => {
    setView(e.target.value);
    viewSelect.blur();
  });
}

document.querySelectorAll('[data-tod]').forEach((btn) => {
  btn.addEventListener('click', () => {
    autoCycleTod = false;
    applyTimeOfDay(btn.dataset.tod);
  });
});

document.querySelectorAll('[data-profile]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setProfile(btn.dataset.profile);
  });
});

function syncTodHudControls() {
  for (const btn of document.querySelectorAll('[data-tod]')) {
    btn.classList.toggle('active', btn.dataset.tod === sky.state.mode);
  }
}

function syncProfileButtons() {
  for (const btn of document.querySelectorAll('[data-profile]')) {
    btn.classList.toggle('active', btn.dataset.profile === activeProfile);
  }
}

function updateViewButtons() {
  if (viewSelect && viewSelect.value !== activeViewId) {
    viewSelect.value = activeViewId;
  }
}

function toggleHud(visible) {
  if (!hudEl) return;
  hudEl.style.display = visible ? 'block' : 'none';
}

const keys = new Set();
let pointerDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let lmbHoldTimer = null;

function applyCameraOrbitDelta(dx, dy) {
  if (camState.mode === 'player') {
    camState.yaw -= dx * 0.0048;
    camState.pitch = clamp(camState.pitch + dy * 0.0042, 0.04, 1.15);
  } else {
    const offset = camState.vistaPos.clone().sub(camState.vistaTarget);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta -= dx * 0.0052;
    sph.phi = clamp(sph.phi - dy * 0.0042, 0.08, Math.PI * 0.47);
    offset.setFromSpherical(sph);
    camState.vistaPos.copy(camState.vistaTarget).add(offset);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'F3') {
    e.preventDefault();
    debugDevPill?.classList.toggle('visible');
    return;
  }

  if (e.key === 'Escape' && altarSteleModal?.classList.contains('visible')) {
    closeAltarSteleModal();
    return;
  }

  const k = e.key.toLowerCase();
  if (k === 'tab') {
    e.preventDefault();
    coopSystem.swapActiveHero();
    return;
  }
  const wasPressed = keys.has(k);
  keys.add(k);

  if (!wasPressed && k === 'g') {
    if (altarSteleModal?.classList.contains('visible')) {
      closeAltarSteleModal();
    } else if (coopSystem.isNearAltarStele()) {
      openAltarSteleModal();
    }
    return;
  }

  if (!wasPressed && k === 'r') {
    startCommuneHold();
    return;
  }

  // Alt + 1..8 switches camera presets; bare 1..4 casts Spells 1..4!
  if (e.altKey) {
    if (k === '1') setView('entry');
    else if (k === '2') setView('plaza');
    else if (k === '3') setView('mill');
    else if (k === '4') setView('arena');
    else if (k === '5') setView('shrine');
    else if (k === '6') setView('shrineLookback');
    else if (k === '7') setView('aerial');
    else if (k === '8') setView('topdown');
    return;
  }

  if (!wasPressed && (k === '1' || k === '2' || k === '3' || k === '4')) {
    if (camState.mode === 'vista') {
      camState.mode = 'player';
      updateViewButtons();
    }
    coopSystem.triggerSpell(Number(k));
    return;
  }

  if (k === '5') setView('shrine');
  else if (k === '6') setView('shrineLookback');
  else if (k === '7') setView('aerial');
  else if (k === '8') setView('topdown');
  else if (!wasPressed && k === 'e') {
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerAction('skill');
  } else if (!wasPressed && k === 'q') {
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerAction('ultimate');
  } else if (!wasPressed && k === 'f') {
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerAction('heavy');
  } else if (!wasPressed && k === 'k') {
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerSpell(1);
  } else if (!wasPressed && k === 'shift') {
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerAction('dash');
  } else if (k === 't') {
    autoCycleTod = false;
    const order = ['day', 'evening', 'night'];
    const nextIdx = (order.indexOf(sky.state.mode) + 1) % order.length;
    applyTimeOfDay(order[nextIdx]);
  } else if (k === 'p') {
    autoCycleTod = !autoCycleTod;
    syncTodHudControls();
  } else if (!wasPressed && k === 'h') {
    toggleHud(hudEl && hudEl.style.display === 'none');
  } else if (['w', 'a', 's', 'd', ' '].includes(k) && camState.mode === 'vista') {
    camState.mode = 'player';
    updateViewButtons();
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (k === 'r') {
    finishCommuneHold();
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) {
    e.preventDefault();
    if (camState.mode === 'vista') {
      camState.mode = 'player';
      updateViewButtons();
    }
    coopSystem.triggerAction('dash');
    return;
  }

  if (e.button !== 0) return;

  // Request Genshin-style PointerLock inside try/catch (graceful fallback in headless browsers)
  try {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  } catch {
    // ignore
  }

  pointerDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  if (camState.mode === 'vista') {
    camState.mode = 'player';
    updateViewButtons();
  }

  // Zero-lag 0ms LMB attack + 0.28s Hold Heavy Finisher timer
  coopSystem.triggerAction('attack');
  if (lmbHoldTimer) clearTimeout(lmbHoldTimer);
  lmbHoldTimer = setTimeout(() => {
    lmbHoldTimer = null;
    if (pointerDragging) {
      coopSystem.triggerAction('heavy');
    }
  }, 280);
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mouseup', () => {
  pointerDragging = false;
  if (lmbHoldTimer) {
    clearTimeout(lmbHoldTimer);
    lmbHoldTimer = null;
  }
});

window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    applyCameraOrbitDelta(e.movementX || 0, e.movementY || 0);
    return;
  }
  if (!pointerDragging) return;
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  applyCameraOrbitDelta(dx, dy);
});

canvas.addEventListener(
  'wheel',
  (e) => {
    if (camState.mode === 'player') {
      camState.dist = clamp(camState.dist + e.deltaY * 0.008, 4.5, 24);
    } else {
      const offset = camState.vistaPos.clone().sub(camState.vistaTarget);
      offset.multiplyScalar(clamp(1 + e.deltaY * 0.001, 0.8, 1.25));
      camState.vistaPos.copy(camState.vistaTarget).add(offset);
    }
  },
  { passive: true }
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------------- */
/* 12. Main Loop, Performance Measurement & Telemetry API                     */
/* ------------------------------------------------------------------------- */

const clock = new THREE.Clock();
let frames = 0;
let telemetryTimer = 0;
let measuredFps = 144;
let avgFrameMs = 2.4;

function getSceneStats() {
  renderer.info.autoReset = false;
  renderer.info.reset();
  post.render(0.016);
  const totalCalls = renderer.info.render.calls;
  const totalTris = renderer.info.render.triangles;
  renderer.info.autoReset = true;

  const sceneDraws = Math.max(1, totalCalls - 11);
  const sceneTris = Math.max(0, totalTris - 22);

  return {
    profile: activeProfile,
    timeOfDay: sky.state.mode,
    todT: Number(currentTodT.toFixed(3)),
    fps: measuredFps,
    frameMs: avgFrameMs,
    draws: sceneDraws,
    composerDraws: totalCalls,
    triangles: sceneTris,
    bloomStrength: Number(post.params.bloomStrength.toFixed(2)),
    activeHero: player.activeHeroId,
    partnerHero: player.partnerHeroId,
    playerPos: {
      x: Number(player.x.toFixed(1)),
      y: Number(player.y.toFixed(1)),
      z: Number(player.z.toFixed(1)),
    },
  };
}

function measurePerformance(iterations = 24) {
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const simTime = 1.25 + i * (1 / 144);
    terrainKit.update(
      1 / 144,
      simTime,
      sky.activeLightDir,
      sky.state.daylight,
      sky.state.fogColor,
      sky.state.worldTint
    );
    village.update(1 / 144);
    updateMeadowFocus(simTime);
    sky.update(simTime);
    post.render(1 / 144);
  }
  const t1 = performance.now();
  avgFrameMs = Number(((t1 - t0) / iterations).toFixed(2));
  measuredFps = avgFrameMs <= 6.94 ? 144 : Math.min(144, Math.round(1000 / avgFrameMs));
  return { avgFrameMs, measuredFps };
}

function refreshTelemetryReadout(drawsOverride = null) {
  if (!statsEl) return;
  const sceneDraws = drawsOverride ?? getSceneStats().draws;
  statsEl.textContent = `${measuredFps} FPS · ${sceneDraws} draws`;
}

applyTimeOfDay('day');
setView('plaza');
syncProfileButtons();

export function setCameraOrbit(yaw, pitch = 0.14, dist = 7.8) {
  camState.mode = 'player';
  if (typeof yaw === 'number') camState.yaw = yaw;
  if (typeof pitch === 'number') camState.pitch = clamp(pitch, 0.04, 1.15);
  if (typeof dist === 'number') camState.dist = clamp(dist, 3.5, 24.0);
  updateCamera();
}

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  const dt =
    typeof window.__FIXED_DT__ === 'number' && window.__FIXED_DT__ > 0
      ? window.__FIXED_DT__
      : Math.min(rawDt, 0.05);
  elapsed += dt;
  frames++;
  telemetryTimer += dt;

  if (autoCycleTod) {
    applyTimeOfDay((currentTodT + dt * 0.025) % 1.0);
  }

  if (camState.mode === 'player') {
    // Gentle Tablet Camera Auto-Align when moving via thumbstick without right-side orbit drag
    if (touchHud.joyState.magnitude > 0.12 && !touchHud.isOrbitDragging) {
      camState.yaw += shortestAngleDiff(player.yaw, camState.yaw) * Math.min(1, 1.6 * dt);
    }

    coopSystem.update(dt, {
      keys,
      joyState: touchHud.joyState,
      camYaw: camState.yaw,
      camera,
    });

    if (steleInteractPrompt) {
      const showStelePrompt =
        coopSystem.isNearAltarStele() &&
        !altarSteleModal?.classList.contains('visible') &&
        !sanctuaryLobby?.classList.contains('visible');
      steleInteractPrompt.classList.toggle('visible', showStelePrompt);
    }
  } else if (coopSystem?.vfxKit && !coopSystem.enemyManager?.frozenShotId) {
    coopSystem.vfxKit.update(dt);
  }

  terrainKit.update(
    dt,
    elapsed,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint
  );
  village.update(dt);
  updateCamera();
  updateMeadowFocus(elapsed);
  sky.update(elapsed);

  const sampleDrawsThisFrame = telemetryTimer >= 0.5;
  if (sampleDrawsThisFrame) {
    renderer.info.autoReset = false;
    renderer.info.reset();
  }
  post.render(dt);

  if (sampleDrawsThisFrame) {
    const sceneDraws = Math.max(1, renderer.info.render.calls - 11);
    renderer.info.autoReset = true;
    measuredFps = Math.min(144, Math.round(frames / telemetryTimer));
    frames = 0;
    telemetryTimer = 0;
    refreshTelemetryReadout(sceneDraws);
  }
}

animate();

window.__WORLD_READY__ = true;
window.__WORLD__ = {
  ready: true,
  scene,
  camera,
  renderer,
  sky,
  post,
  terrainKit,
  housesKit,
  village,
  meadow,
  coopSystem,
  vfxKit: coopSystem.vfxKit,
  frostLance: coopSystem.frostLance,
  enemyManager: coopSystem.enemyManager,
  campaignLoop: coopSystem.campaignLoop,
  coopClient: coopSystem.coopClient,
  touchHud,
  player,
  camState,
  VIEWS,
  WORLD_SHOTS,
  STAGE5_GAMEPLAY_SHOTS,
  openAltarSteleModal,
  closeAltarSteleModal,
  startCommuneHold,
  finishCommuneHold,
  setView,
  setCameraOrbit,
  setShot,
  setGameplayShot,
  setTimeOfDay: applyTimeOfDay,
  setProfile,
  toggleHud,
  measurePerformance,
  getStats: getSceneStats,
};
