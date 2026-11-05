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
import { INSCRIPTION_STONES } from '../assets/terrain/geography.js';
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
  createAppFlow,
  FLOW_STEPS,
  getOpeningCameraPose,
} from './ui/app-flow.js';
import { createSculptedHud } from './ui/sculpted-hud.js';
import * as DamageNumbersModule from './ui/damage-numbers.js';
import {
  createCommuneClient,
  playWideSurroundDivineVoice,
} from './combat/commune-client.js';
import {
  BREATHING_STYLES,
  SPELL_BY_SLOT,
  ACT_DEFINITIONS,
} from './combat/combat-balance.js';

const createDamageNumbers =
  DamageNumbersModule.createDamageNumbers ||
  DamageNumbersModule.createDamageNumbersOverlay;

if (typeof document !== 'undefined') {
  let legacyHideStyle = document.getElementById('amarante-legacy-hud-cleanup');
  if (!legacyHideStyle) {
    legacyHideStyle = document.createElement('style');
    legacyHideStyle.id = 'amarante-legacy-hud-cleanup';
    legacyHideStyle.textContent = `
      body.sculpted-hud-mounted #top-bar {
        display: flex !important;
      }
      body.sculpted-hud-mounted #top-bar .top-col-left,
      body.sculpted-hud-mounted #party-status-card,
      body.sculpted-hud-mounted #coop-room-pill,
      body.sculpted-hud-mounted #act-objective-pill,
      body.sculpted-hud-mounted #bottom-bar,
      body.sculpted-hud-mounted #stele-interact-prompt,
      body.sculpted-hud-mounted #altar-stele-modal,
      body.sculpted-hud-mounted #sanctuary-lobby {
        display: none !important;
      }
      body.sculpted-hud-mounted #boss-hud-bar.visible {
        display: flex !important;
      }
      body.sculpted-hud-mounted #combat-banner.visible {
        display: inline-flex !important;
      }
    `;
    document.head.appendChild(legacyHideStyle);
  }
}

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
    maxGrassTufts: 34000,
  },
  tablet: {
    id: 'tablet',
    label: 'Tablet (Xiaomi Pad 7)',
    dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    aaSamples: 2,
    meadowProfile: 'tablet',
    maxGrassTufts: 17000,
  },
};

let activeProfile = 'desktop';
renderer.setPixelRatio(PROFILES[activeProfile].dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Keep linear HDR into EffectComposer; post.js performs the single unified filmic view transform
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8eef5);
scene.fog = new THREE.Fog(0xd8eef5, 340, 880);

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
    // Zone E: Southern Flower Field Lobby (0, 128) — Roadside Verge & Meadow Drifts (Option 3 + Option 4 framing!)
    { x: -5.4, z: 135.5, r: 4.8 },
    { x: 5.4, z: 135.5, r: 4.8 },
    { x: -6.2, z: 129.0, r: 5.2 },
    { x: 6.2, z: 129.0, r: 5.2 },
    { x: -5.8, z: 122.0, r: 5.2 },
    { x: 5.8, z: 122.0, r: 5.2 },
    { x: -11.5, z: 133.5, r: 8.5 },
    { x: 11.5, z: 133.5, r: 8.5 },
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
    { x: -18.5, z: 22.5, r: 7.5 },
    { x: 19.5, z: 22.0, r: 7.5 },
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
    // Zone D: Outer North Shrine Summit & Far Valley Meadows (zero flowers on staircase hillside!)
    { x: -42.0, z: -46.0, r: 7.0 },
    { x: 42.0, z: -46.0, r: 7.0 },
    { x: -38.5, z: -64.0, r: 7.0 },
    { x: 38.5, z: -64.0, r: 7.0 },
    { x: -21.5, z: -84.0, r: 7.0 },
    { x: 21.5, z: -84.0, r: 7.0 },
    { x: -16.0, z: -96.0, r: 7.0 },
    { x: 16.0, z: -96.0, r: 7.0 },
  ];

  const dummy = new THREE.Object3D();
  const keys = Object.keys(meadowInstance.flowerMeshes);

  keys.forEach((key, sIdx) => {
    const imesh = meadowInstance.flowerMeshes[key];
    if (imesh.material?.uniforms) {
      imesh.material.uniforms.uFadeStart.value = 158.0;
      imesh.material.uniforms.uFadeEnd.value = 172.0;
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

      // Keep the entire North Shrine Grand Staircase hillside (z = -15..-73, |x| < 35)
      // a clean, serene Studio Ghibli emerald lawn with zero sub-pixel flower confetti
      if (z < -15.0 && z > -73.0 && Math.abs(x) < 35.0) continue;

      const sw = sampleWorld(x, z);
      if (sw.foliageMask < 0.5) continue;
      // Keep tall Feathery Pampas Plumes (`toonShrub`) on the outer meadow flanks (|x| >= 6.2m in the Southern Lobby)
      // so the immediate roadside border showcases Option 4's grass tussocks, clover, roses, and daisies!
      if (key === 'toonShrub' && z > 110.0 && Math.abs(x) < 6.2) continue;

      dummy.position.set(x, terrainHeightAt(x, z), z);
      // Align Feathery Pampas Plumes (`toonShrub`) predominantly with the valley wind so plumes nod downwind together!
      const rotY =
        key === 'toonShrub'
          ? 0.58 + (hash(attempt * 9.1 + sIdx) - 0.5) * 0.95
          : hash(attempt * 9.1 + sIdx) * Math.PI * 2;
      dummy.rotation.set(0, rotY, 0);
      const sc =
        key === 'toonShrub'
          ? 1.06 + hash(attempt * 15.7) * 0.44
          : 1.02 + hash(attempt * 17.3) * 0.46;
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
/* 5. Collision Resolution & Whispering Mountain Mist Boundary Turnback      */
/* ------------------------------------------------------------------------- */

let lastMistBannerTime = -999;

function resolveCollisions(px, pz, radius) {
  let x = px;
  let z = pz;
  let wrapped = false;

  const rDist = Math.hypot(x, z);
  if (rDist > PLAY_BOUNDARY_RADIUS) {
    // Whispering Mountain Mist Turnback: instead of teleporting across the map,
    // the permanent mountain mist gently guides the traveler back toward the sunlit sanctuary.
    const angle = Math.atan2(z, x);
    const turnbackR = PLAY_BOUNDARY_RADIUS - 2.2;
    x = Math.cos(angle) * turnbackR;
    z = Math.sin(angle) * turnbackR;
    wrapped = true;
    if (typeof performance !== 'undefined' && performance.now() - lastMistBannerTime > 6500) {
      lastMistBannerTime = performance.now();
      showCombatBanner(
        {
          title: 'The Mountain Mist Thickens',
          subtitle: 'A warm breeze gently guides you back toward the valley of Haru-machi.',
        },
        3200
      );
    }
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

  // 7. Sync Sculpted Stone-and-Brass HUD
  if (sculptedHud) {
    const activeRole = coopSystem?.player?.activeHeroId || 'Knight';
    const activeHeroState = coopSystem?.heroStates?.[activeRole];
    const activeEl = activeHeroState?.selectedElement || 'ice';
    const eCd =
      activeRole === 'Knight'
        ? Math.max(0, k?.powerSwordCooldown || 0)
        : Math.max(
            0,
            m?.spellCooldowns?.[activeEl === 'fire' ? 'cinder_fall' : 'frost_lance'] || 0
          );
    const qCd =
      activeRole === 'Knight'
        ? Math.max(0, k?.ultimateCooldown || 0)
        : Math.max(0, m?.stormCataclysmCooldown || 0);
    const eBuffRem = activeRole === 'Knight' ? Math.max(0, k?.breathingTimer || 0) : 0;

    sculptedHud.updatePartyStatus({
      activeRole,
      activeElement: activeEl,
      knight: k
        ? {
            level: k.level || 1,
            hp: k.hp,
            maxHp: k.maxHp,
            shield: k.shield || 0,
          }
        : undefined,
      mage: m
        ? {
            level: m.level || 1,
            hp: m.hp,
            maxHp: m.maxHp,
            shield: m.shield || 0,
          }
        : undefined,
      cooldowns: {
        E: eCd,
        Q: qCd,
        eBuffRemaining: eBuffRem,
      },
    });
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
  if (appFlow) {
    appFlow.setLobbyState({
      roomPhrase: roomState.roomPhrase || roomState.room,
      isHost: Boolean(roomState.isHost),
      localRole: roomState.role || 'Knight',
      peerConnected: linked,
      guestReady: roomState.isHost ? Boolean(roomState.peerReady || !linked) : Boolean(roomState.ready),
      playerCount: linked ? 2 : 1,
    });
  }
  if (sculptedHud && roomState.progression) {
    sculptedHud.setProgressionState({
      communeDiscovered: Boolean(roomState.progression.communeDiscovered),
      iceUnlocked: Boolean(roomState.progression.iceUnlocked),
      fireUnlocked: Boolean(roomState.progression.fireUnlocked),
      ultimateUnlocked: Boolean(roomState.progression.ultimateUnlocked),
      unlockedStage: Number(roomState.progression.unlockedStage || 0),
      stonesSolved: Number(roomState.progression.stonesSolved || 0),
      activeElement: roomState.progression.activeElement,
    });
  }
}

function playDivineVerdictVoice(judgment) {
  if (!judgment) return;
  playWideSurroundDivineVoice(judgment);
}

let sculptedHud = null;
let appFlow = null;
let communeClient = null;

// Declare camState & camera vectors BEFORE createSculptedHud / createAppFlow
// so applyOpeningFlowCameraAndPoses() never hits a TDZ ReferenceError on boot!
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
let windElapsed = 0;
let activeGameplayShotSpec = null;
const _meadowFocus = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _camShake = new THREE.Vector3();
const _camImpactPos = new THREE.Vector3();
const _camImpactLook = new THREE.Vector3();
const _camImpactFov = { value: 0 };
const _vfxLookOffset = new THREE.Vector3();

const stoneGazeState = {
  activeStoneId: null,
  shoulderBlend: 0,
  cameraLookDot: 0,
  inActiveMeleeDanger: false,
  stones: {
    stone_plaza: { id: 'stone_plaza', gazeElapsed: 0, unlocked: false },
    stone_pier: { id: 'stone_pier', gazeElapsed: 0, unlocked: false },
    stone_grove: { id: 'stone_grove', gazeElapsed: 0, unlocked: false },
  },
};

function isTextInputFocused() {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    Boolean(el.isContentEditable)
  );
}

export function isUiOverlayBlockingInput() {
  if (isTextInputFocused()) return true;
  if (appFlow && typeof appFlow.isInGame === 'function' && !appFlow.isInGame()) {
    return true;
  }
  if (sculptedHud?.isModalOpen?.()) return true;
  return false;
}

/* ------------------------------------------------------------------------- */
/* 6B. Diegetic 3D Stone Calligraphy Engraving + Lotus Gaze Ring Decals       */
/* ------------------------------------------------------------------------- */

const SPOILER_SAFE_STONE_POEMS = Object.freeze({
  stone_plaza: Object.freeze({
    title: 'Stele of the Sovereign Vow',
    lines: Object.freeze([
      'Where crimson petals ring the ancient stone,',
      'No mortal walks the valley road alone.',
      'Bind blossom unto heartbeat in thy plea,',
      'And speak the Sovereign’s name to set love free.',
    ]),
  }),
  stone_pier: Object.freeze({
    title: 'Stele of the Glacial Mirror',
    lines: Object.freeze([
      'Where silver waters kiss the timber pier,',
      'Speak truth of what thy spirit holds most dear.',
      'Confess with tender warmth the human grace,',
      'That winter’s rime may wake within this place.',
    ]),
  }),
  stone_grove: Object.freeze({
    title: 'Stele of the Twin Flame',
    lines: Object.freeze([
      'Beneath the violet boughs where embers sleep,',
      'Swear now the steadfast promise thou shalt keep.',
      'When honest fondness names the living spark,',
      'Sunfire and meteor-cinders light the dark.',
    ]),
  }),
});

function shouldMaskStoneSpoilers() {
  if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location?.search || '');
    if (params.get('maskSpoilers') === '1') return true;
  }
  return false;
}

function drawStoneCalligraphyCanvas(ctx, { title, lines, progress = 0, unlocked = false }) {
  const W = 1024;
  const H = 1280;
  ctx.clearRect(0, 0, W, H);

  // 1. Aspect-scaled elliptical limestone core (alpha = 1.0 up to r = 0.84 covering both top lotus & bottom bar)
  //    feathering seamlessly into the surrounding sunlit limestone (alpha -> 0.0 at all borders — zero box edges!)
  ctx.save();
  ctx.save();
  ctx.translate(W * 0.5, H * 0.5);
  ctx.scale(1.0, H / W);
  const stoneMatchGrad = ctx.createRadialGradient(0, 0, 40, 0, 0, W * 0.49);
  stoneMatchGrad.addColorStop(0.0, 'rgba(150, 135, 108, 1.0)');
  stoneMatchGrad.addColorStop(0.58, 'rgba(160, 145, 116, 1.0)');
  stoneMatchGrad.addColorStop(0.84, 'rgba(171, 155, 124, 1.0)');
  stoneMatchGrad.addColorStop(0.94, 'rgba(171, 155, 124, 0.55)');
  stoneMatchGrad.addColorStop(1.0, 'rgba(171, 155, 124, 0.0)');
  ctx.fillStyle = stoneMatchGrad;
  ctx.fillRect(-W * 0.5, -W * 0.5, W, W);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Top chiseled rose-gold hairline & 5-petal ornament
  const accentColor = unlocked ? '#fde047' : '#fbd38d';
  ctx.strokeStyle = 'rgba(54, 34, 28, 0.72)';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(160, 136);
  ctx.lineTo(440, 136);
  ctx.moveTo(584, 136);
  ctx.lineTo(864, 136);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 244, 224, 0.92)';
  ctx.lineWidth = 3.0;
  ctx.beginPath();
  ctx.moveTo(160, 136);
  ctx.lineTo(440, 136);
  ctx.moveTo(584, 136);
  ctx.lineTo(864, 136);
  ctx.stroke();

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(W * 0.5, 136, 12, 0, Math.PI * 2);
  ctx.fill();

  // Chiseled Title
  ctx.font = '700 46px "Cormorant Garamond", Georgia, "Palatino Linotype", serif';
  ctx.shadowColor = 'rgba(18, 10, 14, 0.95)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(28, 16, 20, 0.92)';
  ctx.strokeText(title || 'Sacred Inscription Stone', W * 0.5, 216);
  ctx.fillStyle = unlocked ? '#fef08a' : '#fff5e4';
  ctx.fillText(title || 'Sacred Inscription Stone', W * 0.5, 216);

  // Chiseled Warm-Alabaster & Rose-Gold Calligraphy Poem Lines
  const displayLines = Array.isArray(lines) && lines.length > 0 ? lines.slice(0, 8) : [];
  const startY = displayLines.length > 4 ? 320 : 364;
  const lineGap = displayLines.length > 4 ? 80 : 102;
  ctx.font = 'italic 600 36px "Cormorant Garamond", Georgia, "Palatino Linotype", serif';

  for (let i = 0; i < displayLines.length; i++) {
    const ly = startY + i * lineGap;
    ctx.shadowColor = 'rgba(18, 10, 14, 0.95)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.lineWidth = 5.5;
    ctx.strokeStyle = 'rgba(28, 16, 20, 0.90)';
    ctx.strokeText(displayLines[i], W * 0.5, ly);
    ctx.fillStyle = unlocked ? '#fffbeb' : '#fffdf9';
    ctx.fillText(displayLines[i], W * 0.5, ly);
  }

  // Bottom Circular Lotus Gaze Progress Ring
  const ringCx = W * 0.5;
  const ringCy = 1018;
  const ringR = 76;
  const clampedProg = clamp(progress, 0, 1);

  ctx.shadowBlur = 8;
  ctx.strokeStyle = 'rgba(28, 16, 20, 0.72)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 248, 240, 0.52)';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 232, 212, 0.34)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ringCx, ringCy, ringR - 13, 0, Math.PI * 2);
  ctx.stroke();

  if (clampedProg > 0.005 || unlocked) {
    const endAng = -Math.PI * 0.5 + (unlocked ? 1.0 : clampedProg) * Math.PI * 2;
    ctx.strokeStyle = unlocked ? '#fde047' : '#f9a8d4';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(ringCx, ringCy, ringR, -Math.PI * 0.5, endAng);
    ctx.stroke();
  }

  // Lotus Core Emblem inside the ring
  ctx.fillStyle = unlocked ? '#fde047' : '#fbcfe8';
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2 - Math.PI * 0.5;
    const px = ringCx + Math.cos(a) * 19;
    const py = ringCy + Math.sin(a) * 19;
    ctx.beginPath();
    ctx.arc(px, py, 10.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fffdf9';
  ctx.beginPath();
  ctx.arc(ringCx, ringCy, 7.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '700 34px "Cormorant Garamond", Georgia, "Palatino Linotype", serif';
  const statusLabel = unlocked
    ? 'Commune Awakened [R]'
    : clampedProg > 0.02
      ? `Gazing upon the verse · ${Math.ceil((1 - clampedProg) * 3)}s`
      : 'Gaze to Commune';
  ctx.lineWidth = 5.5;
  ctx.strokeStyle = 'rgba(24, 12, 16, 0.92)';
  ctx.strokeText(statusLabel, ringCx, ringCy + ringR + 54);
  ctx.fillStyle = unlocked ? '#fde047' : 'rgba(255, 244, 234, 0.96)';
  ctx.fillText(statusLabel, ringCx, ringCy + ringR + 54);
  ctx.restore();
}

function createSacredStoneCalligraphyDecals(targetScene, sampleGroundY) {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'sacredStoneCalligraphyDecalsGroup';
  targetScene.add(rootGroup);

  const decalEntries = {};
  const planeGeo = new THREE.PlaneGeometry(1.00, 1.44);

  for (const st of INSCRIPTION_STONES) {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = 1024;
    canvasEl.height = 1280;
    const ctx = canvasEl.getContext('2d');
    const fallbackVerse =
      SPOILER_SAFE_STONE_POEMS[st.id] || SPOILER_SAFE_STONE_POEMS.stone_plaza;

    const tex = new THREE.CanvasTexture(canvasEl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    const holder = new THREE.Group();
    holder.name = `stoneCalligraphyDecal_${st.id}`;
    const sy = sampleGroundY(st.x, st.z);
    holder.position.set(st.x, sy, st.z);
    holder.rotation.y = st.rotY || 0;

    // Mount borderless calligraphy decals cleanly in front of the +-0.245m stone face
    const frontMesh = new THREE.Mesh(planeGeo, mat);
    frontMesh.position.set(0, 1.24, 0.254);
    holder.add(frontMesh);

    const backMesh = new THREE.Mesh(planeGeo, mat);
    backMesh.position.set(0, 1.24, -0.254);
    backMesh.rotation.y = Math.PI;
    holder.add(backMesh);

    rootGroup.add(holder);

    const entry = {
      id: st.id,
      canvas: canvasEl,
      ctx,
      texture: tex,
      material: mat,
      holder,
      title: fallbackVerse.title,
      lines: [...fallbackVerse.lines],
      lastProgress: -1,
      lastUnlocked: false,
      redraw(progress = 0, unlocked = false) {
        if (
          Math.abs(progress - this.lastProgress) < 0.008 &&
          unlocked === this.lastUnlocked
        ) {
          return;
        }
        this.lastProgress = progress;
        this.lastUnlocked = unlocked;
        drawStoneCalligraphyCanvas(this.ctx, {
          title: this.title,
          lines: this.lines,
          progress,
          unlocked,
        });
        this.texture.needsUpdate = true;
      },
    };
    entry.redraw(0, false);
    decalEntries[st.id] = entry;

    // Fetch live scripture lines when not spoiler-masked
    if (!shouldMaskStoneSpoilers() && typeof fetch === 'function') {
      fetch(`/api/altar?stone=${encodeURIComponent(st.id)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.lines) && data.lines.length > 0 && !shouldMaskStoneSpoilers()) {
            entry.title = data.title || entry.title;
            entry.lines = data.lines;
            entry.lastProgress = -1;
            const gState = stoneGazeState.stones[st.id];
            entry.redraw(
              (gState?.gazeElapsed || 0) / 3.0,
              Boolean(gState?.unlocked)
            );
          }
        })
        .catch(() => {});
    }
  }

  return { group: rootGroup, entries: decalEntries };
}

const stoneDecals = createSacredStoneCalligraphyDecals(scene, terrainHeightAt);

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
    sculptedHud?.setActiveRole(newHeroId);
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
    const updatedProg = coopSystem.coopClient.progression.applyVerdictProgression(judgment);
    sculptedHud?.setProgressionState(updatedProg);
  },
});

const player = coopSystem.player;

/* ------------------------------------------------------------------------- */
/* 7A. Wire 3D Floating Genshin Damage Numbers (`damage-numbers.js`)         */
/* ------------------------------------------------------------------------- */

const damageNumbers = createDamageNumbers({
  container: document.getElementById('hud'),
  camera,
});

function resolveHitDamageElement(hitSpec = {}, result = {}) {
  if (hitSpec.knightUltActive) return 'lightning';
  const inf = String(hitSpec.infusion || hitSpec.applyMark || '').toLowerCase();
  const src = String(hitSpec.source || result.source || '').toLowerCase();
  if (inf === 'solar' || src.includes('cinder') || src.includes('fire') || src.includes('burn')) {
    return 'fire';
  }
  if (
    inf === 'rime' ||
    src.includes('frost') ||
    src.includes('shatter') ||
    src.includes('ice') ||
    src.includes('mage_attack') ||
    src.includes('mage_heavy')
  ) {
    return 'ice';
  }
  if (
    inf === 'tempest' ||
    inf === 'eclipse' ||
    src.includes('storm') ||
    src.includes('lightning') ||
    src.includes('cataclysm')
  ) {
    return 'lightning';
  }
  return 'physical';
}

function emitFloatingDamageForEnemyHit(enemy, result, hitSpec = {}) {
  if (!damageNumbers || !enemy || !result) return;
  const dmg = Number(result.damageDealt || 0);
  if (dmg > 0) {
    const element = resolveHitDamageElement(hitSpec, result);
    const isCrit = Boolean(
      hitSpec.knightUltActive ||
        result.detonation ||
        element === 'lightning' ||
        dmg >= 68
    );
    damageNumbers.spawnDamageNumber({
      amount: dmg,
      element,
      source: hitSpec.source || '',
      isCrit,
      worldPos: {
        x: enemy.x,
        y: enemy.y,
        z: enemy.z,
        heightOffset: enemy.isBoss ? 2.15 : 1.55,
      },
    });
  }
  if (result.detonation) {
    const det = result.detonation;
    const detEl =
      det.id === 'solar_flare'
        ? 'fire'
        : det.id === 'shatterblow'
          ? 'ice'
          : 'lightning';
    damageNumbers.spawnDamageNumber({
      amount: det.bonusDmg || 65,
      element: detEl,
      source: det.id || 'detonation',
      isCrit: true,
      label: det.label || '',
      worldPos: {
        x: det.x ?? enemy.x,
        y: det.y ?? enemy.y,
        z: det.z ?? enemy.z,
        heightOffset: (enemy.isBoss ? 2.15 : 1.55) + 0.35,
      },
    });
  }
}

if (coopSystem?.enemyManager) {
  const origApplyHitToEnemy = coopSystem.enemyManager.applyHitToEnemy;
  if (typeof origApplyHitToEnemy === 'function') {
    coopSystem.enemyManager.applyHitToEnemy = function wrappedApplyHitToEnemy(
      enemy,
      hitSpec = {}
    ) {
      const res = origApplyHitToEnemy(enemy, hitSpec);
      if (res) {
        emitFloatingDamageForEnemyHit(enemy, res, hitSpec);
      }
      return res;
    };
  }

  const origApplyAreaOrLineHit = coopSystem.enemyManager.applyAreaOrLineHit;
  if (typeof origApplyAreaOrLineHit === 'function') {
    coopSystem.enemyManager.applyAreaOrLineHit = function wrappedApplyAreaOrLineHit(
      opts = {}
    ) {
      const hits = origApplyAreaOrLineHit(opts);
      if (Array.isArray(hits)) {
        for (const h of hits) {
          if (h?.enemy && h?.result) {
            emitFloatingDamageForEnemyHit(h.enemy, h.result, opts.hitSpec || {});
          }
        }
      }
      return hits;
    };
  }
}

/* ------------------------------------------------------------------------- */
/* 7B. Wave 3 30s Commune Client (with 3D Crimson Rose Ring Timer)           */
/* ------------------------------------------------------------------------- */

let selectedLobbyRole = 'Knight';
let selectedMicDeviceId = '';

communeClient = createCommuneClient({
  scene,
  getGroundHeight: walkableHeightAt,
  coopClient: coopSystem.coopClient,
  endpoint: '/api/commune',
  getContextState: () => {
    const speakerRole = coopSystem.player.activeHeroId || 'Knight';
    const partnerRole = speakerRole === 'Knight' ? 'Mage' : 'Knight';
    const snap = coopSystem.campaignLoop.getStateSnapshot(coopSystem.heroStates);
    const speakerHero = speakerRole === 'Knight' ? snap.knight : snap.mage;
    const partnerHero = partnerRole === 'Knight' ? snap.knight : snap.mage;
    return {
      room: coopSystem.coopClient.getRoomCode(),
      speakerRole,
      partnerRole,
      gameState: {
        actId: snap.actId,
        distance: coopSystem.getHeroDistance(),
        speakerHp: speakerHero?.hp ?? 100,
        speakerMaxHp: speakerHero?.maxHp ?? 100,
        partnerHp: partnerHero?.hp ?? 100,
        partnerMaxHp: partnerHero?.maxHp ?? 100,
        partnerDowned: Boolean(partnerHero?.downed),
        inCombat: (coopSystem.enemyManager?.activeEnemies?.length || 0) > 0,
        nearbyEnemies: coopSystem.enemyManager?.activeEnemies?.length || 0,
      },
      progressionState: coopSystem.coopClient.getProgressionState(),
    };
  },
  onStateChange: (communeSnapshot) => {
    const isListening = communeSnapshot.state === 'listening';
    const isJudging = communeSnapshot.state === 'judging';
    communeRBtn?.classList.toggle('channeling', isListening);
    if (communeSubLbl) {
      communeSubLbl.textContent = isListening
        ? `Listening (${Math.ceil(communeSnapshot.remainingSeconds)}s)`
        : isJudging
          ? 'Judging...'
          : 'Tap [R]';
    }
    sculptedHud?.setCommuneState({
      listening: isListening,
      elapsedSeconds: communeSnapshot.elapsed,
      maxSeconds: communeSnapshot.maxDuration,
    });
  },
  onVerdict: (judgment) => {
    const speakerRole = coopSystem.player.activeHeroId || 'Knight';
    const updatedProg = coopSystem.coopClient.progression.applyVerdictProgression(judgment);
    sculptedHud?.setProgressionState(updatedProg);
    coopSystem.applyCommuneVerdict(judgment, speakerRole);
  },
  onCancel: () => {
    coopSystem.cancelCommuneChannel();
  },
});

async function openAltarSteleModal(explicitStone = null) {
  const stone =
    explicitStone ||
    coopSystem.getNearestInscriptionStone() || {
      id: 'stone_plaza',
      index: 1,
      name: 'Weathered Stele of the Town Plaza',
    };

  // Reading ANY Sacred Inscription Stone unlocks Commune and selects the sequential riddle stage!
  const readInfo = coopSystem.coopClient.sendStoneRead(stone.id || stone);
  sculptedHud?.setProgressionState(readInfo.state);
  if (stoneGazeState.stones[readInfo.stoneId]) {
    stoneGazeState.stones[readInfo.stoneId].gazeElapsed = 3.0;
    stoneGazeState.stones[readInfo.stoneId].unlocked = true;
    stoneDecals.entries[readInfo.stoneId]?.redraw(1.0, true);
  }

  if (steleInteractPrompt) steleInteractPrompt.classList.remove('visible');
  return readInfo;
}

function closeAltarSteleModal() {
  altarSteleModal?.classList.remove('visible');
  sculptedHud?.closeInscriptionModal?.();
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

async function startCommuneHold() {
  const curState = communeClient.getState().state;
  const speakerRole = coopSystem.player.activeHeroId || 'Knight';

  // If already listening in hands-free mode, a second press triggers beginPress (stop & send or safe cancel)
  if (curState === 'listening') {
    if (typeof communeClient.beginPress === 'function') {
      const res = await communeClient.beginPress({ speakerRole });
      if (communeClient.getState().state === 'judging') {
        coopSystem.setCommuneSuspense(true);
      }
      return res;
    }
    return finishCommuneHold();
  }

  if (curState !== 'idle') return;
  if (coopSystem.campaignLoop?.verdictSequence?.active) return;

  if (camState.mode === 'vista') {
    camState.mode = 'player';
    updateViewButtons();
  }

  const chanRes = coopSystem.startCommuneChannel(speakerRole, { camera });
  if (chanRes && chanRes.allowed === false) {
    return chanRes;
  }

  if (typeof communeClient.beginPress === 'function') {
    return communeClient.beginPress({
      speakerRole,
      deviceId: selectedMicDeviceId || undefined,
      speakerPos: { x: player.x, y: player.y, z: player.z },
    });
  }
  return communeClient.startCommune({
    speakerRole,
    deviceId: selectedMicDeviceId || undefined,
    speakerPos: { x: player.x, y: player.y, z: player.z },
  });
}

async function finishCommuneHold() {
  if (communeClient.getState().state !== 'listening') return;
  const speakerRole = coopSystem.player.activeHeroId || 'Knight';
  if (typeof communeClient.endPress === 'function') {
    const res = await communeClient.endPress({ speakerRole });
    if (communeClient.getState().state === 'judging') {
      coopSystem.setCommuneSuspense(true);
    }
    return res;
  }
  coopSystem.setCommuneSuspense(true);
  await communeClient.stopAndSendCommune({
    speakerRole,
  });
}

/* ------------------------------------------------------------------------- */
/* 7C. Wave 4 Sculpted See-Through Ring HUD & Opening Flow                   */
/* ------------------------------------------------------------------------- */

const _lobbyProjVec = new THREE.Vector3();
const _lobbyRaycaster = new THREE.Raycaster();
const _lobbyPointerNdc = new THREE.Vector2();
let eAimDragDistance = 9.5;

function projectWorldPointToScreen(wx, wy, wz) {
  const width = window.innerWidth || 1440;
  const height = window.innerHeight || 900;
  _lobbyProjVec.set(wx, wy, wz).project(camera);
  const x = (_lobbyProjVec.x * 0.5 + 0.5) * width;
  const y = (-_lobbyProjVec.y * 0.5 + 0.5) * height;
  const xPct = clamp((x / Math.max(1, width)) * 100, 8, 92);
  const yPct = clamp((y / Math.max(1, height)) * 100, 10, 90);
  return {
    x,
    y,
    xPct,
    yPct,
    visible: _lobbyProjVec.z <= 1.0,
  };
}

function updateFlowerLobbyHeroProjections() {
  if (!appFlow || appFlow.getStep?.() !== FLOW_STEPS.FLOWER_LOBBY) return;
  const kGrp = coopSystem?.knight?.group;
  const mGrp = coopSystem?.mage?.group;
  if (!kGrp || !mGrp) return;

  const kHead = projectWorldPointToScreen(
    kGrp.position.x,
    kGrp.position.y + 2.45,
    kGrp.position.z
  );
  const kChest = projectWorldPointToScreen(
    kGrp.position.x,
    kGrp.position.y + 1.25,
    kGrp.position.z
  );
  const mHead = projectWorldPointToScreen(
    mGrp.position.x,
    mGrp.position.y + 2.75,
    mGrp.position.z
  );
  const mChest = projectWorldPointToScreen(
    mGrp.position.x,
    mGrp.position.y + 1.25,
    mGrp.position.z
  );

  appFlow.setHeroScreenPositions?.({
    knight: {
      x: kChest.x,
      y: kChest.y,
      xPct: kChest.xPct,
      yPct: kChest.yPct,
      headX: kHead.x,
      headY: kHead.y,
      headXPct: kHead.xPct,
      headYPct: kHead.yPct,
      chestX: kChest.x,
      chestY: kChest.y,
      visible: kChest.visible,
    },
    mage: {
      x: mChest.x,
      y: mChest.y,
      xPct: mChest.xPct,
      yPct: mChest.yPct,
      headX: mHead.x,
      headY: mHead.y,
      headXPct: mHead.xPct,
      headYPct: mHead.yPct,
      chestX: mChest.x,
      chestY: mChest.y,
      visible: mChest.visible,
    },
  });
}

function tryRaycastFlowerLobbyHero(clientX, clientY) {
  if (!appFlow || appFlow.getStep?.() !== FLOW_STEPS.FLOWER_LOBBY) return null;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || window.innerWidth || 1440);
  const height = Math.max(1, rect.height || window.innerHeight || 900);
  _lobbyPointerNdc.x = ((clientX - rect.left) / width) * 2 - 1;
  _lobbyPointerNdc.y = -((clientY - rect.top) / height) * 2 + 1;

  camera.updateMatrixWorld(true);
  _lobbyRaycaster.setFromCamera(_lobbyPointerNdc, camera);

  const kGrp = coopSystem?.knight?.group;
  const mGrp = coopSystem?.mage?.group;
  const targets = [];
  if (kGrp) {
    kGrp.updateMatrixWorld(true);
    targets.push({ role: 'Knight', group: kGrp });
  }
  if (mGrp) {
    mGrp.updateMatrixWorld(true);
    targets.push({ role: 'Mage', group: mGrp });
  }

  let bestRole = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const hits = _lobbyRaycaster.intersectObject(t.group, true);
    if (hits.length > 0 && hits[0].distance < bestDist) {
      bestDist = hits[0].distance;
      bestRole = t.role;
    }
  }

  if (!bestRole) {
    for (const t of targets) {
      const chest = projectWorldPointToScreen(
        t.group.position.x,
        t.group.position.y + 1.15,
        t.group.position.z
      );
      const dx = clientX - chest.x;
      const dy = clientY - chest.y;
      if (Math.abs(dx) <= 84 && Math.abs(dy) <= 145) {
        const d = Math.hypot(dx, dy);
        if (d < bestDist) {
          bestDist = d;
          bestRole = t.role;
        }
      }
    }
  }

  if (bestRole) {
    if (typeof appFlow.claimCharacter === 'function') {
      appFlow.claimCharacter(bestRole);
    } else if (typeof appFlow.selectRole === 'function') {
      appFlow.selectRole(bestRole);
    }
    coopSystem.coopClient.setPreferredRole(bestRole);
    if (coopSystem.player.activeHeroId !== bestRole) {
      coopSystem.swapActiveHero();
    }
  }
  return bestRole;
}

sculptedHud = createSculptedHud({
  container: document.getElementById('hud'),
  initialProfile: activeProfile,
  initialRole: coopSystem.player.activeHeroId || 'Knight',
  onAction: (actionName) => {
    if (camState.mode === 'vista') {
      camState.mode = 'player';
      updateViewButtons();
    }
    if (actionName === 'attack') {
      coopSystem.triggerAction('attack');
    } else if (actionName === 'heavy' || actionName === 'block_start') {
      coopSystem.triggerAction('heavy');
    } else if (actionName === 'block_end') {
      coopSystem.actionAim?.releaseHeavy?.('Knight');
    } else if (actionName === 'dash') {
      coopSystem.triggerAction('dash');
    } else if (actionName === 'jump') {
      coopSystem.triggerAction('jump');
    } else if (actionName === 'skill_e') {
      coopSystem.triggerAction('skill');
    } else if (actionName === 'ultimate') {
      coopSystem.triggerAction('ultimate');
    }
  },
  onAimStart: () => {
    if (coopSystem.player.activeHeroId === 'Mage') {
      eAimDragDistance = 9.5;
      coopSystem.startSkillAim({
        yaw: camState.yaw,
        pitch: camState.pitch,
        distance: eAimDragDistance,
      });
    }
  },
  onAimMove: ({ clientX, clientY, dx = 0, dy = 0 } = {}) => {
    if (coopSystem.player.activeHeroId === 'Mage') {
      if (typeof dx === 'number' && Math.abs(dx) > 0) {
        camState.yaw -= dx * 0.0055;
        coopSystem.heroStates.Mage.yaw = camState.yaw;
      }
      if (typeof dy === 'number' && Math.abs(dy) > 0) {
        eAimDragDistance = clamp(eAimDragDistance - dy * 0.085, 3.0, 16.0);
        camState.pitch = clamp(camState.pitch + dy * 0.0032, 0.04, 1.15);
      } else if (typeof clientY === 'number') {
        const normY =
          1.0 - clamp(clientY / Math.max(1, window.innerHeight || 900), 0, 1);
        eAimDragDistance = clamp(3.0 + normY * 13.0, 3.0, 16.0);
      }
      coopSystem.updateSkillAim({
        distance: eAimDragDistance,
        yaw: camState.yaw,
        pitch: camState.pitch,
      });
    }
  },
  onAimRelease: () => {
    if (coopSystem.player.activeHeroId === 'Mage') {
      coopSystem.releaseSkillAim({
        distance: eAimDragDistance,
        yaw: camState.yaw,
        pitch: camState.pitch,
      });
    }
  },
  onToggleElement: () => {
    const res = coopSystem.toggleElement(coopSystem.player.activeHeroId);
    if (res?.element) {
      sculptedHud.setElement(res.element);
    }
  },
  onCommuneToggle: (shouldListen) => {
    if (shouldListen) {
      startCommuneHold();
    } else {
      finishCommuneHold();
    }
  },
  onReadStone: () => {
    openAltarSteleModal();
  },
  onSwapHero: () => {
    coopSystem.swapActiveHero();
  },
  onSelectTimeOfDay: (todChoice) => {
    if (todChoice === 'auto') {
      autoCycleTod = true;
    } else {
      autoCycleTod = false;
      applyTimeOfDay(todChoice);
    }
  },
  onSelectProfile: (profChoice) => {
    setProfile(profChoice);
  },
  onCameraOrbit: (dx, dy) => {
    applyCameraOrbitDelta(dx, dy);
  },
});

if (sculptedHud) {
  const origSetElement = sculptedHud.setElement;
  sculptedHud.setElement = (el) => {
    if (el === 'ice' || el === 'fire') {
      if (coopSystem?.heroStates?.Knight) coopSystem.heroStates.Knight.selectedElement = el;
      if (coopSystem?.heroStates?.Mage) coopSystem.heroStates.Mage.selectedElement = el;
    }
    return origSetElement(el);
  };
  const origSetProgressionState = sculptedHud.setProgressionState;
  sculptedHud.setProgressionState = (patch = {}) => {
    if (patch?.activeElement === 'ice' || patch?.activeElement === 'fire') {
      if (coopSystem?.heroStates?.Knight) {
        coopSystem.heroStates.Knight.selectedElement = patch.activeElement;
      }
      if (coopSystem?.heroStates?.Mage) {
        coopSystem.heroStates.Mage.selectedElement = patch.activeElement;
      }
    }
    return origSetProgressionState(patch);
  };
}

function applyOpeningFlowCameraAndPoses(step) {
  if (step === FLOW_STEPS.IN_GAME) {
    sculptedHud?.setVisible(true);
    return;
  }
  sculptedHud?.setVisible(false);
  const pose = getOpeningCameraPose(step, walkableHeightAt);
  camState.mode = 'vista';
  camState.vistaPos.set(...pose.pos);
  camState.vistaTarget.set(...pose.target);
  camState.baseFov = pose.fov || 48;
  camera.fov = pose.fov || 48;
  camera.updateProjectionMatrix();

  if (step === FLOW_STEPS.FLOWER_LOBBY) {
    const kP = {
      x: -1.65,
      z: 132.8,
      yaw: 0.22,
      ...(pose.knightLobbyPos || {}),
      x: -1.65,
      z: 132.8,
      yaw: 0.22,
    };
    kP.y = walkableHeightAt(kP.x, kP.z);

    const mP = {
      x: 0.75,
      z: 133.0,
      yaw: -0.18,
      ...(pose.mageLobbyPos || {}),
      x: 0.75,
      z: 133.0,
      yaw: -0.18,
    };
    mP.y = walkableHeightAt(mP.x, mP.z);

    // Ensure camera sits cleanly in front of (z >= 138.2) the wildflowers duo so both heroes are framed head-to-toe
    const minLobbyCamZ = Math.max(kP.z, mP.z) + 5.2;
    if (camState.vistaPos.z < minLobbyCamZ) {
      const camGroundY = walkableHeightAt(0, minLobbyCamZ);
      camState.vistaPos.set(-0.25, camGroundY + 1.68, minLobbyCamZ);
      camState.vistaTarget.set(
        -0.35,
        (kP.y + mP.y) * 0.5 + 1.18,
        (kP.z + mP.z) * 0.5
      );
    }

    coopSystem.heroStates.Knight.x = kP.x;
    coopSystem.heroStates.Knight.z = kP.z;
    coopSystem.heroStates.Knight.y = kP.y;
    coopSystem.heroStates.Knight.yaw = kP.yaw;
    coopSystem.knight.group.position.set(kP.x, kP.y, kP.z);
    coopSystem.knight.group.rotation.y = kP.yaw;
    coopSystem.knight.play('wave', { loop: true, fade: 0.15 });

    coopSystem.heroStates.Mage.x = mP.x;
    coopSystem.heroStates.Mage.z = mP.z;
    coopSystem.heroStates.Mage.y = mP.y;
    coopSystem.heroStates.Mage.yaw = mP.yaw;
    coopSystem.mage.group.position.set(mP.x, mP.y, mP.z);
    coopSystem.mage.group.rotation.y = mP.yaw;
    coopSystem.mage.play('cheer', { loop: true, fade: 0.15 });
  }
  updateCamera();
  if (step === FLOW_STEPS.FLOWER_LOBBY) {
    updateFlowerLobbyHeroProjections();
  }
}

appFlow = createAppFlow({
  container: document.getElementById('hud'),
  onCreateWorld: ({ roomPhrase, role }) => {
    coopSystem.coopClient.setRoomCode(roomPhrase);
    if (role && coopSystem.player.activeHeroId !== role) {
      coopSystem.swapActiveHero();
    }
  },
  onJoinWorld: ({ roomPhrase, role }) => {
    coopSystem.coopClient.setRoomCode(roomPhrase);
    if (role && coopSystem.player.activeHeroId !== role) {
      coopSystem.swapActiveHero();
    }
  },
  onRoleSelect: (nextRole) => {
    coopSystem.coopClient.setPreferredRole(nextRole);
    if (coopSystem.player.activeHeroId !== nextRole) {
      coopSystem.swapActiveHero();
    }
  },
  onToggleReady: (ready) => {
    coopSystem.coopClient.setReady(ready);
  },
  onStartGame: (payload = {}) => {
    const chosenRole =
      payload?.localRole || payload?.role || appFlow?.getState?.()?.localRole;
    if (chosenRole && coopSystem.player.activeHeroId !== chosenRole) {
      coopSystem.swapActiveHero();
    }
    const activeRole = coopSystem.player.activeHeroId || 'Knight';
    const pName = String(
      payload?.playerName || appFlow?.getState?.()?.playerName || ''
    ).trim();
    const partnerName = String(
      payload?.partnerName || appFlow?.getState?.()?.partnerName || ''
    ).trim();
    const kName =
      payload?.knightName ||
      (activeRole === 'Knight' ? pName || 'Knight' : partnerName || 'Knight');
    const mName =
      payload?.mageName ||
      (activeRole === 'Mage' ? pName || 'Mage' : partnerName || 'Mage');
    sculptedHud?.setPlayerNames?.({
      Knight: kName,
      Mage: mName,
      knight: kName,
      mage: mName,
      primaryName: pName || activeRole,
      partnerName: partnerName || (activeRole === 'Knight' ? 'Mage' : 'Knight'),
      playerName: pName || activeRole,
      localRole: activeRole,
    });

    coopSystem.coopClient.startExpedition();
    // Drop both heroes at the Southern Flower Field trailhead (0, 124) facing north toward Town!
    coopSystem.teleportLeaderAndPartner(0.0, 124.0, Math.PI);
    camState.mode = 'player';
    camState.yaw = Math.PI;
    camState.pitch = 0.14;
    camState.dist = 8.4;
    sculptedHud?.setVisible(true);
    updateCamera();
  },
  onFlowStepChanged: (step) => {
    applyOpeningFlowCameraAndPoses(step);
  },
});

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/world/sw.js').catch(() => {});
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

function syncEnvironmentPolarity() {
  if (typeof document === 'undefined') return 'day';
  const ecWeight = Number(sky?.state?.eclipseWeight ?? 0);
  const mode = sky?.state?.mode || 'day';
  let polarity = 'day';
  if (ecWeight > 0.35) {
    polarity = 'eclipse';
  } else if (mode === 'evening') {
    polarity = 'golden';
  } else if (mode === 'night' || mode === 'twilight' || currentTodT >= 0.80) {
    polarity = 'night';
  } else {
    polarity = 'day';
  }
  if (document.body && document.body.dataset.envPolarity !== polarity) {
    document.body.dataset.envPolarity = polarity;
  }
  if (
    document.documentElement &&
    document.documentElement.dataset.envPolarity !== polarity
  ) {
    document.documentElement.dataset.envPolarity = polarity;
  }
  return polarity;
}

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
    if (terrainKit.waterMat.uniforms.uSunDir) {
      terrainKit.waterMat.uniforms.uSunDir.value.copy(skyState.activeLightDir);
    }
    if (terrainKit.waterMat.uniforms.uHorizonReflect) {
      terrainKit.waterMat.uniforms.uHorizonReflect.value.copy(skyState.fogColor);
    }
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
  syncEnvironmentPolarity();
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
  'evening-flower-lobby': {
    id: 'evening-flower-lobby',
    tod: 'evening',
    mode: 'vista',
    pos: [0.0, 4.4, 142.0],
    target: [0.0, 2.2, 82.0],
    fov: 52,
    playerPos: [-1.2, 128.0, Math.PI],
  },
  'evening-plaza': {
    id: 'evening-plaza',
    tod: 'evening',
    mode: 'vista',
    pos: [5.2, 3.8, 23.2],
    target: [-3.2, 5.8, -16.0],
    fov: 52,
    playerPos: [1.4, 11.5, 0.52],
  },
  'night-flower-lobby': {
    id: 'night-flower-lobby',
    tod: 'night',
    mode: 'vista',
    pos: [0.0, 4.4, 142.0],
    target: [0.0, 2.2, 82.0],
    fov: 52,
    playerPos: [-1.2, 128.0, Math.PI],
  },
};

function syncPrayerEclipseAndMonochrome() {
  if (coopSystem?.sanctuarySteleMesh) {
    coopSystem.sanctuarySteleMesh.visible = false;
  }
  if (activeGameplayShotSpec) {
    syncEnvironmentPolarity();
    return;
  }
  const cLoop = coopSystem?.campaignLoop;
  const vSeq = cLoop?.verdictSequence;
  const communeState = communeClient?.getState?.()?.state;
  const hudCommune = sculptedHud?.getState?.()?.commune;
  const inPrayerChannel = Boolean(
    cLoop?.communeChannelActive ||
      coopSystem?.communeChannel?.active ||
      communeState === 'listening' ||
      communeState === 'judging' ||
      hudCommune?.listening ||
      hudCommune?.partnerListening
  );

  if (vSeq?.active && vSeq.kind === 'smite') {
    sky.setEclipseState?.({
      weight: 1.0,
      compression: 1.0,
      windTimeScale: 0.0,
      camera,
    });
    post.setSmiteMonochrome?.(1.0);
  } else if (vSeq?.active && vSeq.kind === 'blessing') {
    if (vSeq.elapsed < 4.25) {
      sky.setEclipseState?.({
        weight: 1.0,
        compression: 1.0,
        windTimeScale: 0.35,
        camera,
      });
    } else {
      const clearU = clamp((vSeq.elapsed - 4.25) / 0.55, 0, 1);
      sky.setEclipseState?.({
        weight: 1.0 - clearU,
        compression: 1.0 - clearU,
        windTimeScale: 0.35 + 0.65 * clearU,
        camera,
      });
    }
    post.setSmiteMonochrome?.(0.0);
  } else if (inPrayerChannel) {
    sky.setEclipseState?.({
      weight: 1.0,
      compression: 1.0,
      windTimeScale: 0.35,
      camera,
    });
    post.setSmiteMonochrome?.(0.0);
  } else {
    sky.setEclipseState?.({
      weight: 0.0,
      compression: 0.0,
      windTimeScale: 1.0,
      camera,
    });
    post.setSmiteMonochrome?.(0.0);
  }
  syncEnvironmentPolarity();
}

function syncCharacterGroundShadows() {
  const tArr = terrainKit?.terrainMat?.uniforms?.uCharShadows?.value;
  const mArr = meadow?.sharedUniforms?.uCharShadows?.value;
  if (!tArr && !mArr) return;

  const setSlot = (idx, x, z, r, active) => {
    if (tArr && tArr[idx]) tArr[idx].set(x, z, r, active);
    if (mArr && mArr[idx]) mArr[idx].set(x, z, r, active);
  };

  const getCharDissolve = (charObj) => {
    let d = 0;
    const root = charObj?.group;
    if (root && typeof root.traverse === 'function') {
      root.traverse((o) => {
        if (!o.isMesh || !o.material || d > 0) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const u = m?.userData?.verdictUniforms || m?.uniforms;
        if (u?.uDissolveProgress?.value > 0) d = u.uDissolveProgress.value;
      });
    }
    return clamp(d, 0, 1);
  };

  const kGrp = coopSystem?.knight?.group;
  const kGroundY = kGrp ? walkableHeightAt(kGrp.position.x, kGrp.position.z) : 0;
  const kDiss = getCharDissolve(coopSystem?.knight);
  const kSubmerged = !kGrp || !kGrp.visible || kGrp.position.y < kGroundY - 0.15 || kDiss > 0.92;
  if (kGrp && !kSubmerged) {
    setSlot(0, kGrp.position.x + kDiss * 0.35, kGrp.position.z, 0.72 * (1.0 - kDiss * 0.75), 1.0 - kDiss);
  } else {
    setSlot(0, 9999.0, 9999.0, 0.72, 0.0);
  }

  const mGrp = coopSystem?.mage?.group;
  const mGroundY = mGrp ? walkableHeightAt(mGrp.position.x, mGrp.position.z) : 0;
  const mDiss = getCharDissolve(coopSystem?.mage);
  const mSubmerged = !mGrp || !mGrp.visible || mGrp.position.y < mGroundY - 0.15 || mDiss > 0.92;
  if (mGrp && !mSubmerged) {
    setSlot(1, mGrp.position.x + mDiss * 0.35, mGrp.position.z, 0.74 * (1.0 - mDiss * 0.75), 1.0 - mDiss);
  } else {
    setSlot(1, 9999.0, 9999.0, 0.74, 0.0);
  }

  const pool = coopSystem?.enemyManager?.pool || [];
  for (let i = 0; i < 6; i++) {
    const slot = pool[i];
    const eGrp = slot?.char?.group;
    if (eGrp && eGrp.visible) {
      const r = slot.isBoss ? 1.12 : 0.70;
      setSlot(2 + i, eGrp.position.x, eGrp.position.z, r, 1.0);
    } else {
      setSlot(2 + i, 9999.0, 9999.0, 0.70, 0.0);
    }
  }
}

function updateMeadowFocus(simTime) {
  syncCharacterGroundShadows();
  camera.getWorldDirection(_camDir);
  const flatLen = Math.hypot(_camDir.x, _camDir.z) || 1;
  const fx = _camDir.x / flatLen;
  const fz = _camDir.z / flatLen;

  if (camState.mode === 'player') {
    _meadowFocus.set(player.x + fx * 10.0, player.y, player.z + fz * 10.0);
  } else if (camera.position.y > 60) {
    _meadowFocus.set(0, 0, 20);
  } else {
    const fwdOffset = 12.0 + Math.max(0, camera.position.y - 5.0) * 0.85;
    _meadowFocus.set(
      clamp(camera.position.x + fx * fwdOffset, -158, 158),
      0,
      clamp(camera.position.z + fz * fwdOffset, -158, 158)
    );
  }
  meadow.update(simTime, _meadowFocus, camera);
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

  _vfxLookOffset.set(0, 0, 0);
  let lookDipY =
    coopSystem?.vfxKit?.artoriousVfx?.getCameraLookOffset?.(_vfxLookOffset)?.y || 0;
  if (lookDipY === 0) {
    const vSeq = coopSystem?.campaignLoop?.verdictSequence;
    if (
      vSeq?.active &&
      vSeq.kind === 'blessing' &&
      vSeq.elapsed >= 2.10 &&
      vSeq.elapsed < 4.25
    ) {
      lookDipY = -0.68;
    }
  }

  if (camState.mode === 'player') {
    const gazeBlend = clamp(stoneGazeState.shoulderBlend || 0, 0, 1);
    const effDist = THREE.MathUtils.lerp(camState.dist, 3.25, gazeBlend);
    const rightX = -Math.cos(camState.yaw);
    const rightZ = Math.sin(camState.yaw);
    const shoulderPosOff = 1.48 * gazeBlend;
    const shoulderLookOff = 0.95 * gazeBlend;

    const h = THREE.MathUtils.lerp(1.55, 1.38, gazeBlend) + Math.sin(camState.pitch) * effDist;
    const flat = Math.cos(camState.pitch) * effDist;
    camera.position.set(
      player.x - Math.sin(camState.yaw) * flat + rightX * shoulderPosOff + _camShake.x + _camImpactPos.x,
      player.y + h + _camShake.y + _camImpactPos.y,
      player.z - Math.cos(camState.yaw) * flat + rightZ * shoulderPosOff + _camShake.z + _camImpactPos.z
    );

    const activeStone =
      gazeBlend > 0.01 && stoneGazeState.activeStoneId
        ? INSCRIPTION_STONES.find((s) => s.id === stoneGazeState.activeStoneId)
        : null;

    const baseLookX = player.x + Math.sin(camState.yaw) * 6.0 + rightX * shoulderLookOff;
    const baseLookY = player.y + 1.85 - 0.22 * gazeBlend + lookDipY;
    const baseLookZ = player.z + Math.cos(camState.yaw) * 6.0 + rightZ * shoulderLookOff;

    const targetLookX = activeStone
      ? THREE.MathUtils.lerp(baseLookX, activeStone.x - rightX * 0.22, gazeBlend)
      : baseLookX;
    const targetLookY = activeStone
      ? THREE.MathUtils.lerp(
          baseLookY,
          terrainHeightAt(activeStone.x, activeStone.z) + 1.24 + lookDipY,
          gazeBlend
        )
      : baseLookY;
    const targetLookZ = activeStone
      ? THREE.MathUtils.lerp(baseLookZ, activeStone.z, gazeBlend)
      : baseLookZ;

    camera.lookAt(
      targetLookX + _camShake.x * 0.6 + _camImpactLook.x,
      targetLookY + _camShake.y * 0.6 + _camImpactLook.y,
      targetLookZ + _camShake.z * 0.6 + _camImpactLook.z
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
  activeGameplayShotSpec = null;
  coopSystem?.resetCameraImpact?.();
  sky.setEclipseState?.({ weight: 0.0, compression: 0.0, windTimeScale: 1.0, camera });
  post.setSmiteMonochrome?.(0.0);
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
  syncCharacterGroundShadows();
  updateMeadowFocus(windElapsed);
  sky.update(windElapsed);
  post.render(0.016);
  updateViewButtons();
  refreshTelemetryReadout();
}

export function setShot(shotId) {
  const s = WORLD_SHOTS[shotId] || WORLD_SHOTS['day-plaza'];
  activeGameplayShotSpec = null;
  autoCycleTod = false;
  sanctuaryLobby?.classList.remove('visible');
  closeAltarSteleModal();
  if (steleInteractPrompt) steleInteractPrompt.classList.remove('visible');
  applyTimeOfDay(s.tod);
  sky.setEclipseState?.({ weight: 0.0, compression: 0.0, windTimeScale: 1.0, camera });
  post.setSmiteMonochrome?.(0.0);

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
  syncCharacterGroundShadows();

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

  activeGameplayShotSpec = spec;
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

  coopSystem.resetCameraImpact?.();
  updateCamera();

  if (spec.eclipseState) {
    sky.setEclipseState?.({ ...spec.eclipseState, camera });
  } else {
    sky.setEclipseState?.({ weight: 0.0, compression: 0.0, windTimeScale: 1.0, camera });
  }
  post.setSmiteMonochrome?.(spec.smiteMonochrome ?? 0.0);

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

  const shotWindTime = spec.eclipseState?.windTimeScale === 0 ? 0.0 : 1.25;
  syncCharacterGroundShadows();
  terrainKit.update(
    0.016,
    shotWindTime,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint
  );
  village.update(0.016);
  updateMeadowFocus(shotWindTime);
  sky.update(shotWindTime);
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
  post.setQuality?.({ aaSamples: cfg.aaSamples });
  post.setSize(window.innerWidth, window.innerHeight);
  buildMeadowForProfile(activeProfile);
  touchHud.setProfileMode(activeProfile);
  sculptedHud?.setProfileMode(activeProfile);
  applyTimeOfDay(currentTodT);
  updateMeadowFocus(windElapsed);
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
  sculptedHud?.setTimeOfDaySelection(autoCycleTod ? 'auto' : sky.state.mode);
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
  sculptedHud?.setVisible(visible);
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

  if (isUiOverlayBlockingInput()) {
    return;
  }

  const k = e.key.toLowerCase();
  const wasPressed = keys.has(k);
  keys.add(k);

  if (!wasPressed && k === 'r') {
    activeGameplayShotSpec = null;
    startCommuneHold();
    return;
  }

  if (coopSystem?.campaignLoop?.isControlLocked?.()) {
    return;
  }

  if (k === 'tab') {
    e.preventDefault();
    if (e.altKey) {
      coopSystem.swapActiveHero();
    } else {
      const res = coopSystem.toggleElement(coopSystem.player.activeHeroId);
      if (res?.element) {
        sculptedHud?.setElement(res.element);
      }
    }
    return;
  }

  if (!wasPressed && k === 'g') {
    if (altarSteleModal?.classList.contains('visible')) {
      closeAltarSteleModal();
    } else if (coopSystem.isNearAltarStele()) {
      openAltarSteleModal();
    }
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
    activeGameplayShotSpec = null;
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
    activeGameplayShotSpec = null;
    if (camState.mode === 'vista') camState.mode = 'player';
    if (coopSystem.player.activeHeroId === 'Mage') {
      coopSystem.startSkillAim({ yaw: camState.yaw, pitch: camState.pitch });
    } else {
      coopSystem.triggerAction('skill');
    }
  } else if (!wasPressed && k === 'q') {
    activeGameplayShotSpec = null;
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerAction('ultimate');
  } else if (!wasPressed && k === 'f') {
    activeGameplayShotSpec = null;
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerAction('heavy');
  } else if (!wasPressed && k === 'k') {
    activeGameplayShotSpec = null;
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerSpell(1);
  } else if (!wasPressed && k === 'shift') {
    activeGameplayShotSpec = null;
    if (camState.mode === 'vista') camState.mode = 'player';
    coopSystem.triggerAction('dash');
  } else if (k === 't') {
    autoCycleTod = false;
    const order = ['day', 'evening', 'twilight', 'night'];
    const nextIdx = (order.indexOf(sky.state.mode) + 1) % order.length;
    applyTimeOfDay(order[nextIdx]);
  } else if (k === 'p') {
    autoCycleTod = !autoCycleTod;
    syncTodHudControls();
  } else if (!wasPressed && k === 'h') {
    toggleHud(hudEl && hudEl.style.display === 'none');
  } else if (['w', 'a', 's', 'd', ' '].includes(k) && camState.mode === 'vista') {
    activeGameplayShotSpec = null;
    camState.mode = 'player';
    updateViewButtons();
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (isUiOverlayBlockingInput()) return;
  if (k === 'r') {
    finishCommuneHold();
  } else if (
    k === 'e' &&
    coopSystem.player.activeHeroId === 'Mage' &&
    coopSystem.actionAim?.aimState?.active
  ) {
    coopSystem.releaseSkillAim({ yaw: camState.yaw, pitch: camState.pitch });
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (appFlow && appFlow.getStep?.() === FLOW_STEPS.FLOWER_LOBBY) {
    if (e.button === 0) {
      tryRaycastFlowerLobbyHero(e.clientX, e.clientY);
    }
    return;
  }
  if (isUiOverlayBlockingInput()) return;
  if (coopSystem?.campaignLoop?.isControlLocked?.()) return;
  if (e.button === 2) {
    e.preventDefault();
    activeGameplayShotSpec = null;
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
  activeGameplayShotSpec = null;

  if (camState.mode === 'vista') {
    camState.mode = 'player';
    updateViewButtons();
  }

  // Zero-lag 0ms LMB attack + 0.28s Hold Heavy Finisher timer
  coopSystem.triggerAction('attack');
  if (lmbHoldTimer) clearTimeout(lmbHoldTimer);
  lmbHoldTimer = setTimeout(() => {
    lmbHoldTimer = null;
    if (pointerDragging && !coopSystem?.campaignLoop?.isControlLocked?.()) {
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
    if (isUiOverlayBlockingInput()) return;
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
  if (appFlow && appFlow.getStep?.() === FLOW_STEPS.FLOWER_LOBBY) {
    updateFlowerLobbyHeroProjections();
  }
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
if (appFlow && appFlow.getStep() !== FLOW_STEPS.IN_GAME) {
  applyOpeningFlowCameraAndPoses(appFlow.getStep());
} else {
  setView('plaza');
}
syncProfileButtons();

export function setCameraOrbit(yaw, pitch = 0.14, dist = 7.8) {
  camState.mode = 'player';
  if (typeof yaw === 'number') camState.yaw = yaw;
  if (typeof pitch === 'number') camState.pitch = clamp(pitch, 0.04, 1.15);
  if (typeof dist === 'number') camState.dist = clamp(dist, 3.5, 24.0);
  updateCamera();
}

function updateSacredStoneGaze(dt) {
  const nearStone = coopSystem.getNearestInscriptionStone(4.5);
  const activeEnemies = coopSystem?.enemyManager?.activeEnemies || [];
  const inActiveMeleeDanger = activeEnemies.some((e) => {
    if (!e || e.dead || !e.active || (e.hp !== undefined && e.hp <= 0)) return false;
    const d = Math.hypot(e.x - player.x, e.z - player.z);
    return d <= 8.0 && (e.aiState === 'windup' || e.attackAnimTimer > 0);
  });
  stoneGazeState.inActiveMeleeDanger = inActiveMeleeDanger;

  let cameraLookDot = -1.0;
  if (nearStone) {
    const camFwdX = Math.sin(camState.yaw);
    const camFwdZ = Math.cos(camState.yaw);
    const dxP = nearStone.position.x - player.x;
    const dzP = nearStone.position.z - player.z;
    const lenP = Math.hypot(dxP, dzP) || 1;
    const dotP = (dxP / lenP) * camFwdX + (dzP / lenP) * camFwdZ;

    const dxC = nearStone.position.x - camera.position.x;
    const dzC = nearStone.position.z - camera.position.z;
    const lenC = Math.hypot(dxC, dzC) || 1;
    const dotC = (dxC / lenC) * camFwdX + (dzC / lenC) * camFwdZ;
    cameraLookDot = Math.max(dotP, dotC);
  }
  stoneGazeState.cameraLookDot = Number(cameraLookDot.toFixed(3));

  const isGazingAtStone = Boolean(
    camState.mode === 'player' &&
      nearStone &&
      cameraLookDot >= 0.55 &&
      !inActiveMeleeDanger &&
      !isUiOverlayBlockingInput() &&
      !coopSystem?.campaignLoop?.isControlLocked?.()
  );

  if (isGazingAtStone) {
    stoneGazeState.activeStoneId = nearStone.id;
    stoneGazeState.shoulderBlend +=
      (1.0 - stoneGazeState.shoulderBlend) * Math.min(1, 6.5 * dt);

    const stEntry =
      stoneGazeState.stones[nearStone.id] ||
      (stoneGazeState.stones[nearStone.id] = {
        id: nearStone.id,
        gazeElapsed: 0,
        unlocked: false,
      });

    stEntry.gazeElapsed = Math.min(3.0, stEntry.gazeElapsed + dt);
    stoneDecals.entries[nearStone.id]?.redraw(
      stEntry.gazeElapsed / 3.0,
      stEntry.unlocked
    );

    if (stEntry.gazeElapsed >= 3.0 && !stEntry.unlocked) {
      stEntry.unlocked = true;
      const readInfo = coopSystem.coopClient.sendStoneRead(nearStone.id);
      sculptedHud?.setProgressionState(readInfo.state);
      stoneDecals.entries[nearStone.id]?.redraw(1.0, true);
    }
  } else {
    stoneGazeState.activeStoneId = null;
    stoneGazeState.shoulderBlend +=
      (0.0 - stoneGazeState.shoulderBlend) * Math.min(1, 6.5 * dt);
    if (stoneGazeState.shoulderBlend < 0.002) {
      stoneGazeState.shoulderBlend = 0;
    }
  }

  // Zero "✿ Read" button pill and zero 2D modal popup!
  if (steleInteractPrompt) {
    steleInteractPrompt.classList.remove('visible');
  }
  sculptedHud?.setNearbyStonePrompt?.({
    visible: false,
    stoneName: '',
  });
}

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  const timeScale =
    typeof window.__TIME_SCALE__ === 'number' && window.__TIME_SCALE__ > 0
      ? window.__TIME_SCALE__
      : 1.0;
  const dt =
    typeof window.__FIXED_DT__ === 'number' && window.__FIXED_DT__ > 0
      ? window.__FIXED_DT__
      : Math.min(rawDt, 0.05) * timeScale;
  elapsed += dt;
  frames++;
  telemetryTimer += dt;

  if (autoCycleTod) {
    applyTimeOfDay((currentTodT + dt * 0.025) % 1.0);
  }

  // Advance 30s Commune Crimson Rose Ring Timer when listening
  communeClient?.update(dt, { x: player.x, y: player.y, z: player.z });

  if (camState.mode === 'player') {
    if (isUiOverlayBlockingInput() && keys.size > 0) {
      keys.clear();
    }
    const activeJoy =
      sculptedHud?.joyState?.magnitude > 0.05 ? sculptedHud.joyState : touchHud.joyState;
    const isOrbiting = Boolean(sculptedHud?.isOrbitDragging || touchHud.isOrbitDragging);

    // Gentle Tablet Camera Auto-Align when moving via thumbstick without right-side orbit drag
    if (
      activeJoy.magnitude > 0.12 &&
      !isOrbiting &&
      !coopSystem?.campaignLoop?.isControlLocked?.()
    ) {
      camState.yaw += shortestAngleDiff(player.yaw, camState.yaw) * Math.min(1, 1.6 * dt);
    }

    coopSystem.update(dt, {
      keys,
      joyState: activeJoy,
      camYaw: camState.yaw,
      camPitch: camState.pitch,
      camera,
    });

    // Tick persistent Fire Sword burn DoT floating damage numbers
    const activeEnemies = coopSystem?.enemyManager?.activeEnemies || [];
    for (let i = 0; i < activeEnemies.length; i++) {
      const e = activeEnemies[i];
      if (e && !e.dead && e.active && e.burnTimer > 0 && e.burnDps > 0) {
        e._burnPopAccum = (e._burnPopAccum || 0) + dt;
        if (e._burnPopAccum >= 0.5) {
          e._burnPopAccum -= 0.5;
          damageNumbers?.spawnDamageNumber({
            amount: Math.max(1, Math.round(e.burnDps * 0.5)),
            element: 'fire',
            source: 'fire_burn',
            isCrit: false,
            worldPos: {
              x: e.x,
              y: e.y,
              z: e.z,
              heightOffset: e.isBoss ? 1.95 : 1.4,
            },
          });
        }
      }
    }

    updateSacredStoneGaze(dt);
  } else {
    stoneGazeState.activeStoneId = null;
    stoneGazeState.shoulderBlend = 0;
    if (appFlow && appFlow.getStep() === FLOW_STEPS.FLOWER_LOBBY) {
      coopSystem.knight?.update(dt);
      coopSystem.mage?.update(dt);
    } else if (
      coopSystem?.vfxKit &&
      !coopSystem.enemyManager?.frozenShotId &&
      !activeGameplayShotSpec
    ) {
      coopSystem.vfxKit.update(dt);
    }
  }

  syncPrayerEclipseAndMonochrome();

  const windScale = sky.getWindTimeScale ? sky.getWindTimeScale() : 1.0;
  windElapsed += dt * windScale;

  terrainKit.update(
    dt,
    windElapsed,
    sky.activeLightDir,
    sky.state.daylight,
    sky.state.fogColor,
    sky.state.worldTint
  );
  village.update(dt);
  updateCamera();
  if (appFlow && appFlow.getStep?.() === FLOW_STEPS.FLOWER_LOBBY) {
    updateFlowerLobbyHeroProjections();
  }
  damageNumbers?.update(dt, camera);
  updateMeadowFocus(windElapsed);
  sky.update(windElapsed);

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
  progression: coopSystem.coopClient.progression,
  communeClient,
  sculptedHud,
  appFlow,
  touchHud,
  damageNumbers,
  stoneGazeState,
  stoneDecals,
  isUiOverlayBlockingInput,
  tryRaycastFlowerLobbyHero,
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
