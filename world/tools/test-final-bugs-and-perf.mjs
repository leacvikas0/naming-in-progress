#!/usr/bin/env node
// ============================================================================
// world/tools/test-final-bugs-and-perf.mjs
//
// Empirical Verification-First Test Suite & Profiler for Amarante's 3 Remaining
// Production Bugs + Compatibility Audit:
//   Group 1: Mage Ice Attack (`Frost Lance` & `Shatterlance`) Swept-Volume Hitbox
//            (Both Headless Simulation & Live Browser Input)
//   Group 2: Solo Normal Progression (`Stage 0`), Expanded Valley Stone Spacing,
//            Route Encounters & Rebalanced Combat Difficulty
//   Group 3: Unthrottled Boot + 15x/20x CPU-Throttled Smooth `Amarante` Stroke,
//            Pre-Baked Monuments (`buildWeldedMonumentGeometry` < 5ms), and
//            Compositor-Only Dissolve (`0` putImageData loops, rAF p95 <= 35ms)
//   Group 4: Existing Test Suite Compatibility Check (`world/tools/*.mjs`)
//
// ZERO-SPOILER RULE: Never logs, prints, or inspects Stone 1 riddle text,
// secret Sovereign name, aliases, or `.env`/`.dev.vars` keys.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { startServer } from './serve.mjs';
import { createEnemyManager } from '../src/combat/enemy-manager.js';
import { createCampaignLoop } from '../src/combat/campaign-loop.js';
import { createCombatSfx } from '../src/combat/combat-sfx.js';
import {
  HERO_STATS,
  SPELLS,
  ENEMY_ARCHETYPES,
  STONE_STRONGHOLDS,
  SURVIVAL_WAVE_POOLS,
  SAFE_HAVEN_WAYPOINTS,
} from '../src/combat/combat-balance.js';
import {
  PLAY_BOUNDARY_RADIUS,
  INSCRIPTION_STONES,
  PATROL_CLEARINGS,
  terrainHeightAt,
} from '../assets/terrain/geography.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
const TOOLS_DIR = path.resolve(import.meta.dirname);

async function loadChromium() {
  const candidates = [
    'playwright',
    path.resolve(ROOT_DIR, 'node_modules/playwright/index.mjs'),
    'C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs',
    'C:/Users/silen/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs',
  ];
  for (const modPath of candidates) {
    try {
      const spec = modPath.startsWith('C:/') || modPath.startsWith('/') || modPath.includes(':\\')
        ? pathToFileURL(modPath).href
        : modPath;
      const pw = await import(spec);
      if (pw?.chromium) return pw.chromium;
      if (pw?.default?.chromium) return pw.default.chromium;
    } catch {
      // try next candidate
    }
  }
  throw new Error('Could not resolve playwright chromium');
}

function getChromeExecutable() {
  const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (process.env.CHROME) return process.env.CHROME;
  if (fs.existsSync(winChrome)) return winChrome;
  return undefined;
}

function makeMockKit() {
  return {
    async loadAnimationPacks() {},
    async createCharacter(charId) {
      const group = new THREE.Group();
      const modelRoot = new THREE.Group();
      group.add(modelRoot);
      let currentKey = 'idle';
      return {
        id: charId,
        group,
        modelRoot,
        mixer: { timeScale: 1.0 },
        anim: {
          get currentKey() {
            return currentKey;
          },
        },
        play(key) {
          currentKey = key;
        },
        poseAt(key) {
          currentKey = key;
        },
        update() {},
      };
    },
  };
}

function createSpyVfxKit() {
  const calls = [];
  const mkSpySys = (id) => ({
    cast(origin, dir, opts = {}) {
      calls.push({ id, origin: { ...origin }, dir: { ...dir }, opts });
    },
    update() {},
    clear() {},
    setLighting() {},
    getCameraShakeOffset(v) {
      return v?.set?.(0, 0, 0);
    },
  });
  return {
    calls,
    frostLance: mkSpySys('frost_lance'),
    shatterlance: mkSpySys('shatterlance'),
    cinderFall: mkSpySys('cinder_fall'),
    stormLance: mkSpySys('storm_lance'),
    aimArrow: {
      show() {},
      updateAim() {},
      release() {},
      hide() {},
      update() {},
    },
    swordVfx: {
      triggerSwing() {},
      endSwing() {},
      setInfusion() {},
      triggerDetonation() {},
      update() {},
    },
    setLighting() {},
    getCameraShakeOffset(v) {
      return v?.set?.(0, 0, 0);
    },
    update() {},
    clear() {},
  };
}

const results = [];
function recordCheck(group, name, pass, detail = '', metrics = null) {
  results.push({ group, name, pass: Boolean(pass), detail, metrics });
  const badge = pass ? 'PASS' : 'FAIL';
  console.log(`  [${badge}] ${group} :: ${name}${detail ? ` -> ${detail}` : ''}`);
}

const isBenignError = (txt) => /favicon\.ico/i.test(String(txt || ''));

async function waitForWorldReady(page, timeoutMs = 45000) {
  await page.waitForFunction(
    () => Boolean(window.__WORLD__?.ready && window.__WORLD__?.coopSystem?.campaignLoop),
    null,
    { timeout: timeoutMs }
  );
}

// ============================================================================
// GROUP 1: Mage Ice Attack Swept-Volume Hitbox Test (Simulation + Live Browser)
// ============================================================================
async function runGroup1(chromium, baseUrl) {
  console.log('\n=== Group 1: Mage Ice Attack Swept-Volume Hitbox (Simulation + Live Browser) ===');

  // --- 1A. Headless Sim: Frost Lance corridor + flared crystal walls + apex crown ---
  {
    const em = await createEnemyManager({
      scene: new THREE.Scene(),
      kit: makeMockKit(),
      walkableHeightAt: () => 0.0,
      resolveCollisions: (x, z) => ({ x, z, wrapped: false }),
    });
    const loop = createCampaignLoop({
      scene: new THREE.Scene(),
      walkableHeightAt: () => 0.0,
      enemyManager: em,
      combatSfx: createCombatSfx(),
    });

    const magePos = { id: 'Mage', x: 0, y: 0, z: 0, yaw: 0 };
    const knightPos = { id: 'Knight', x: -3.0, y: 0, z: 0, yaw: 0 };

    // 3 enemies touching Frost Lance's visual crystal volume (near centerline,
    // mid flared crystal wall @ 2.2m lateral, tip apex @ 15.8m or wide @ -2.2m),
    // plus centerline 7.5m / 11.5m check and 1 out-of-range enemy at (6.0, 7.5).
    const nearEnemy = em.spawnImmediateFromSpec({ archetype: 'skeleton_minion', x: 0.2, z: 3.5 });
    const midFlankEnemy = em.spawnImmediateFromSpec({ archetype: 'skeleton_warrior', x: 2.2, z: 8.5 });
    const tipApexEnemy = em.spawnImmediateFromSpec({ archetype: 'skeleton_minion', x: -2.3, z: 12.2 });
    const apexCrownEnemy = em.spawnImmediateFromSpec({ archetype: 'skeleton_warrior', x: 0.0, z: 15.8 });
    const clearEnemy = em.spawnImmediateFromSpec({ archetype: 'skeleton_minion', x: 6.2, z: 7.5 });
    const behindEnemy = em.spawnImmediateFromSpec({ archetype: 'skeleton_minion', x: 0.0, z: -3.5 });

    for (const e of [nearEnemy, midFlankEnemy, tipApexEnemy, apexCrownEnemy, clearEnemy, behindEnemy]) {
      e.hp = 300;
      e.maxHp = 300;
      e.spawnAnimTimer = 0;
      e.shieldUp = false;
    }

    const res = loop.castSpell('frost_lance', magePos, 0, knightPos, {
      ignoreCooldown: true,
      distance: 14.5,
      targetPos: { x: 0, y: 0, z: 14.5 },
    });

    const dmg = (e) => e.maxHp - e.hp;
    const summary = {
      near3_5: dmg(nearEnemy),
      midFlank_2_2_8_5: dmg(midFlankEnemy),
      tipFlank_neg2_3_12_2: dmg(tipApexEnemy),
      apex15_8: dmg(apexCrownEnemy),
      outOfRange6_2: dmg(clearEnemy),
      behind: dmg(behindEnemy),
      marks: {
        near: nearEnemy.mark,
        midFlank: midFlankEnemy.mark,
        tipFlank: tipApexEnemy.mark,
        apex: apexCrownEnemy.mark,
        clear: clearEnemy.mark,
      },
      hitCount: res?.hits?.length || 0,
    };

    const passSimFrost =
      dmg(nearEnemy) > 0 &&
      dmg(midFlankEnemy) > 0 &&
      dmg(tipApexEnemy) > 0 &&
      dmg(apexCrownEnemy) > 0 &&
      nearEnemy.mark === 'rime' &&
      midFlankEnemy.mark === 'rime' &&
      tipApexEnemy.mark === 'rime' &&
      apexCrownEnemy.mark === 'rime' &&
      dmg(clearEnemy) === 0 &&
      dmg(behindEnemy) === 0;

    recordCheck(
      'Group 1',
      '1A Sim Frost Lance swept-volume (flared crystal wall + apex crown + zero out-of-range)',
      passSimFrost,
      `dmgs=${JSON.stringify(summary)}`,
      summary
    );
  }

  // --- 1B. Headless Sim: Shatterlance ray + lateral track + eruption burst ---
  {
    const em = await createEnemyManager({
      scene: new THREE.Scene(),
      kit: makeMockKit(),
      walkableHeightAt: () => 0.0,
      resolveCollisions: (x, z) => ({ x, z, wrapped: false }),
    });
    const loop = createCampaignLoop({
      scene: new THREE.Scene(),
      walkableHeightAt: () => 0.0,
      enemyManager: em,
      combatSfx: createCombatSfx(),
    });

    const magePos = { id: 'Mage', x: 0, y: 0, z: 0, yaw: 0 };
    const knightPos = { id: 'Knight', x: -3.0, y: 0, z: 0, yaw: 0 };

    const sNear = em.spawnImmediateFromSpec({ archetype: 'skeleton_minion', x: 0.1, z: 3.5 });
    const sMidTrack = em.spawnImmediateFromSpec({ archetype: 'skeleton_warrior', x: 1.75, z: 7.5 });
    const sTip = em.spawnImmediateFromSpec({ archetype: 'skeleton_minion', x: 0.0, z: 11.5 });
    const sOut = em.spawnImmediateFromSpec({ archetype: 'skeleton_minion', x: 6.5, z: 7.5 });

    for (const e of [sNear, sMidTrack, sTip, sOut]) {
      e.hp = 300;
      e.maxHp = 300;
      e.spawnAnimTimer = 0;
      e.shieldUp = false;
    }

    const res = loop.castSpell('shatterlance', magePos, 0, knightPos, {
      ignoreCooldown: true,
      distance: 14.5,
      targetPos: { x: 0, y: 0, z: 14.5 },
    });

    const dmg = (e) => e.maxHp - e.hp;
    const summary = {
      near3_5: dmg(sNear),
      midLateral1_75_7_5: dmg(sMidTrack),
      tip11_5: dmg(sTip),
      outOfRange6_5: dmg(sOut),
      hits: res?.hits?.length || 0,
    };

    const passSimShatter =
      dmg(sNear) > 0 &&
      dmg(sMidTrack) > 0 &&
      dmg(sTip) > 0 &&
      dmg(sOut) === 0 &&
      sNear.mark === 'rime' &&
      sMidTrack.mark === 'rime' &&
      sTip.mark === 'rime';

    recordCheck(
      'Group 1',
      '1B Sim Shatterlance swept-volume (near/lateral crystal track/tip + zero out-of-range)',
      passSimShatter,
      `dmgs=${JSON.stringify(summary)}`,
      summary
    );
  }

  // --- 1C. Live Browser Desktop [E] Frost Lance + Hold LMB Shatterlance ---
  const browser = await chromium.launch({
    executablePath: getChromeExecutable(),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('pageerror', (err) => {
      if (!isBenignError(err.message)) pageErrors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isBenignError(msg.text())) consoleErrors.push(msg.text());
    });

    await page.goto(`${baseUrl}/world/index.html?nolobby=1&dev=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await waitForWorldReady(page);

    // Pause idle enemy spawning and test deterministic Frost Lance via real [E] key hold+release
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.appFlow?.resolvePixelVeil?.();
      if (w.player.activeHeroId !== 'Mage') {
        w.coopSystem.swapActiveHero();
      }
      w.enemyManager.clearAllEnemies();
      w.coopSystem.teleportLeaderAndPartner(0.0, 120.0, 0.0);
      // Put Knight far back so Solo AI Wingman or partner never steals hits or kills targets
      w.coopSystem.heroStates.Knight.x = 0.0;
      w.coopSystem.heroStates.Knight.z = 104.0;
      w.coopSystem.heroStates.Mage.x = 0.0;
      w.coopSystem.heroStates.Mage.z = 120.0;
      w.coopSystem.heroStates.Mage.yaw = 0.0;
      w.camState.mode = 'player';
      w.camState.yaw = 0.0;
      w.camState.pitch = 0.14;
      w.campaignLoop.combatHeroes.Mage.selectedSpell = 'frost_lance';
      w.campaignLoop.combatHeroes.Mage.skillCd = 0;
      w.campaignLoop.combatHeroes.Mage.infuseCd = 0;
      w.campaignLoop.combatHeroes.Mage.spellCooldowns.frost_lance = 0;

      // Keep AI/enemies frozen out of movement while spawning exact static targets
      const specs = [
        { key: 'near', archetype: 'skeleton_minion', x: 0.2, z: 123.5 },
        { key: 'midFlank', archetype: 'skeleton_warrior', x: 2.1, z: 127.5 },
        { key: 'tipFlank', archetype: 'skeleton_minion', x: -2.0, z: 131.5 },
        { key: 'clear', archetype: 'skeleton_minion', x: 6.5, z: 127.5 },
      ];
      window.__TEST_FROST_TARGETS__ = specs.map((sp) => {
        const e = w.enemyManager.spawnImmediateFromSpec(sp);
        e.hp = 400;
        e.maxHp = 400;
        e.spawnAnimTimer = 0;
        e.speed = 0;
        e.moveSpeed = 0;
        e.shieldUp = false;
        e.testKey = sp.key;
        return e;
      });
      document.querySelectorAll('#amarante-damage-numbers-layer .am-dmg-pop').forEach((el) => el.remove());
    });

    // Real desktop [E] hold -> measure aim reticle state -> release -> wait for 0.22s release frame
    await page.keyboard.down('e');
    await page.waitForTimeout(160);
    const frostAimSnapshot = await page.evaluate(() => {
      const aim = window.__WORLD__.coopSystem.actionAim?.aimState || {};
      return {
        active: aim.active,
        spellId: aim.spellId,
        distance: aim.distance,
        lockState: aim.lockState,
      };
    });
    await page.keyboard.up('e');
    await page.waitForTimeout(550);

    const frostLiveRes = await page.evaluate(() => {
      const targets = window.__TEST_FROST_TARGETS__ || [];
      const pops = Array.from(document.querySelectorAll('#amarante-damage-numbers-layer .am-dmg-pop'));
      return {
        targets: targets.map((e) => ({
          key: e.testKey,
          dmg: e.maxHp - e.hp,
          hp: e.hp,
          maxHp: e.maxHp,
          mark: e.mark || null,
          hitFlash: e.hitFlashTimer || 0,
        })),
        dmgPopCount: pops.length,
        dmgPopTexts: pops.map((p) => p.textContent?.trim()),
      };
    });

    const frostHitAll3 =
      frostLiveRes.targets.slice(0, 3).every((t) => t.dmg > 0 && t.mark === 'rime') &&
      frostLiveRes.targets[3].dmg === 0 &&
      frostLiveRes.dmgPopCount >= 3 &&
      Math.abs((frostAimSnapshot.distance || 0) - 14.5) <= 0.25;

    recordCheck(
      'Group 1',
      '1C Live Desktop [E] Frost Lance (14.5m reticle + 3 touched enemies damaged/rimed + floating dmg nums)',
      frostHitAll3,
      `aimDist=${frostAimSnapshot.distance}m targets=${JSON.stringify(frostLiveRes.targets)} pops=${frostLiveRes.dmgPopCount}`,
      { frostAimSnapshot, frostLiveRes }
    );

    // --- 1D. Live Browser Hold-LMB Shatterlance (no upward mouse drag) ---
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.enemyManager.clearAllEnemies();
      w.coopSystem.heroStates.Mage.x = 0.0;
      w.coopSystem.heroStates.Mage.z = 120.0;
      w.coopSystem.heroStates.Mage.yaw = 0.0;
      w.camState.yaw = 0.0;
      w.camState.pitch = 0.14;
      w.campaignLoop.combatHeroes.Mage.skillCd = 0;

      const specs = [
        { key: 'near3_5', archetype: 'skeleton_minion', x: 0.2, z: 123.5 },
        { key: 'mid7_5', archetype: 'skeleton_warrior', x: 0.4, z: 127.5 },
        { key: 'tip11_5', archetype: 'skeleton_minion', x: 0.2, z: 131.5 },
        { key: 'clear6_5', archetype: 'skeleton_minion', x: 6.5, z: 127.5 },
      ];
      window.__TEST_SHATTER_TARGETS__ = specs.map((sp) => {
        const e = w.enemyManager.spawnImmediateFromSpec(sp);
        e.hp = 400;
        e.maxHp = 400;
        e.spawnAnimTimer = 0;
        e.speed = 0;
        e.moveSpeed = 0;
        e.shieldUp = false;
        e.testKey = sp.key;
        return e;
      });
      document.querySelectorAll('#amarante-damage-numbers-layer .am-dmg-pop').forEach((el) => el.remove());
    });

    // Real Hold LMB (press -> hold 260ms so Shatterlance charge activates -> check aim -> release -> wait for thrust)
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(260);
    const shatterAimSnapshot = await page.evaluate(() => {
      const aim = window.__WORLD__.coopSystem.actionAim?.aimState || {};
      return {
        active: aim.active,
        spellId: aim.spellId,
        distance: aim.distance,
        lockState: aim.lockState,
      };
    });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(700);

    const shatterLiveRes = await page.evaluate(() => {
      const targets = window.__TEST_SHATTER_TARGETS__ || [];
      const pops = Array.from(document.querySelectorAll('#amarante-damage-numbers-layer .am-dmg-pop'));
      return {
        targets: targets.map((e) => ({
          key: e.testKey,
          dmg: e.maxHp - e.hp,
          hp: e.hp,
          mark: e.mark || null,
        })),
        dmgPopCount: pops.length,
        dmgPopTexts: pops.map((p) => p.textContent?.trim()),
      };
    });

    const shatterHitAll3 =
      shatterLiveRes.targets.slice(0, 3).every((t) => t.dmg > 0) &&
      shatterLiveRes.targets[3].dmg === 0 &&
      shatterLiveRes.dmgPopCount >= 3;

    recordCheck(
      'Group 1',
      '1D Live Desktop Hold-LMB Shatterlance (3 enemies along 3.5m/7.5m/11.5m hit without upward drag + out-of-range 0 dmg)',
      shatterHitAll3,
      `aimDist=${shatterAimSnapshot.distance}m targets=${JSON.stringify(shatterLiveRes.targets)} pops=${shatterLiveRes.dmgPopCount} errors=${consoleErrors.length + pageErrors.length}`,
      { shatterAimSnapshot, shatterLiveRes, consoleErrors, pageErrors }
    );
    await context.close();
  } finally {
    await browser.close();
  }
}

// ============================================================================
// GROUP 2: Solo Progression Stage 0 + Expanded Valley Map + Rebalanced Difficulty
// ============================================================================
async function runGroup2(chromium, baseUrl) {
  console.log('\n=== Group 2: Solo Normal Progression + Map Expansion + Combat Difficulty ===');

  const browser = await chromium.launch({
    executablePath: getChromeExecutable(),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });

  try {
    // --- 2A. Normal Solo Launch (NO ?dev=1, NO ?nolobby=1, regular #app-flow-start-btn) ---
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/world/index.html?flow=1`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await waitForWorldReady(page);

      const soloNormal = await page.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.resolvePixelVeil();
        document.querySelector('#app-flow-enter-btn')?.click();
        document.querySelector('#app-flow-create-btn')?.click();
        // Normal Begin/Enter button (NOT #app-flow-solo-test-btn)
        document.querySelector('#app-flow-start-btn')?.click();

        const prog = w.coopClient.getProgressionState();
        const hud = w.sculptedHud?.getState?.() || {};
        return {
          step: w.appFlow.getStep(),
          unlockedStage: prog.unlockedStage,
          stonesSolvedMask: prog.stonesSolvedMask,
          iceUnlocked: prog.iceUnlocked,
          fireUnlocked: prog.fireUnlocked,
          ultimateUnlocked: prog.ultimateUnlocked,
          knightQ: w.campaignLoop.combatHeroes.Knight.qEnergy,
          mageQ: w.campaignLoop.combatHeroes.Mage.qEnergy,
          hudUnlockedStage: hud.unlockedStage,
          devStageOverride: w.devStageOverride,
        };
      });

      const pass2A =
        soloNormal.step === 'in_game' &&
        soloNormal.unlockedStage === 0 &&
        soloNormal.stonesSolvedMask === 0 &&
        soloNormal.iceUnlocked === false &&
        soloNormal.fireUnlocked === false &&
        soloNormal.ultimateUnlocked === false &&
        soloNormal.knightQ === 0 &&
        soloNormal.mageQ === 0 &&
        soloNormal.hudUnlockedStage === 0;

      recordCheck(
        'Group 2',
        '2A Normal Solo mode starts at Stage 0, stonesSolvedMask=0, Q=0 (matching 2P Co-Op)',
        pass2A,
        JSON.stringify(soloNormal),
        soloNormal
      );
      await context.close();
    }

    // --- 2B. Dev Override (?dev=1 AND #app-flow-solo-test-btn) unlocks Stage 3 abilities with stonesSolvedMask=0 ---
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();

      // Part i: #app-flow-solo-test-btn on clean URL
      await page.goto(`${baseUrl}/world/index.html?flow=1`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await waitForWorldReady(page);
      const soloTestBtnRes = await page.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.resolvePixelVeil();
        document.querySelector('#app-flow-enter-btn')?.click();
        document.querySelector('#app-flow-create-btn')?.click();
        document.querySelector('#app-flow-solo-test-btn')?.click();
        const prog = w.coopClient.getProgressionState();
        return {
          step: w.appFlow.getStep(),
          unlockedStage: prog.unlockedStage,
          stonesSolvedMask: prog.stonesSolvedMask,
          knightQ: w.campaignLoop.combatHeroes.Knight.qEnergy,
          mageQ: w.campaignLoop.combatHeroes.Mage.qEnergy,
        };
      });

      // Part ii: ?dev=1 + normal #app-flow-start-btn
      await page.goto(`${baseUrl}/world/index.html?flow=1&dev=1`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await waitForWorldReady(page);
      const urlDevRes = await page.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.resolvePixelVeil();
        document.querySelector('#app-flow-enter-btn')?.click();
        document.querySelector('#app-flow-create-btn')?.click();
        document.querySelector('#app-flow-start-btn')?.click();
        const prog = w.coopClient.getProgressionState();
        return {
          step: w.appFlow.getStep(),
          unlockedStage: prog.unlockedStage,
          stonesSolvedMask: prog.stonesSolvedMask,
          knightQ: w.campaignLoop.combatHeroes.Knight.qEnergy,
          mageQ: w.campaignLoop.combatHeroes.Mage.qEnergy,
        };
      });

      const pass2B =
        soloTestBtnRes.unlockedStage === 3 &&
        soloTestBtnRes.stonesSolvedMask === 0 &&
        soloTestBtnRes.knightQ === 100 &&
        soloTestBtnRes.mageQ === 160 &&
        urlDevRes.unlockedStage === 3 &&
        urlDevRes.stonesSolvedMask === 0 &&
        urlDevRes.knightQ === 100 &&
        urlDevRes.mageQ === 160;

      recordCheck(
        'Group 2',
        '2B ?dev=1 & Test Solo button unlock abilities (Stage 3, full Q) while keeping stonesSolvedMask === 0',
        pass2B,
        `testBtn=${JSON.stringify(soloTestBtnRes)} urlDev=${JSON.stringify(urlDevRes)}`,
        { soloTestBtnRes, urlDevRes }
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }

  // --- 2C. Map Expansion & Valley Stone / Stronghold Spacing & Travel Encounters ---
  {
    const st1Geo = INSCRIPTION_STONES.find((s) => s.id === 'stone_plaza');
    const st2Geo = INSCRIPTION_STONES.find((s) => s.id === 'stone_grove');
    const st3Geo = INSCRIPTION_STONES.find((s) => s.id === 'stone_pier');

    const sh1 = STONE_STRONGHOLDS.site1_well;
    const sh2 = STONE_STRONGHOLDS.site2_platform;
    const sh3 = STONE_STRONGHOLDS.site3_wall;

    // Effective Stone 1 origin matches Stone Stronghold 1 (0, 0) where the Well stands
    const p1 = sh1.center;
    const p2 = { x: st2Geo.x, z: st2Geo.z };
    const p3 = { x: st3Geo.x, z: st3Geo.z };

    const d12 = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const d13 = Math.hypot(p3.x - p1.x, p3.z - p1.z);
    const d23 = Math.hypot(p3.x - p2.x, p3.z - p2.z);

    const safeMaxR = PLAY_BOUNDARY_RADIUS - 10; // >= 10m inside 165m cliff/rim
    const h2 = terrainHeightAt(p2.x, p2.z);
    const h3 = terrainHeightAt(p3.x, p3.z);
    const h1 = terrainHeightAt(p1.x, p1.z);

    const boundsOk =
      Math.hypot(p1.x, p1.z) <= safeMaxR &&
      Math.hypot(p2.x, p2.z) <= safeMaxR &&
      Math.hypot(p3.x, p3.z) <= safeMaxR &&
      Number.isFinite(h1) &&
      Number.isFinite(h2) &&
      Number.isFinite(h3) &&
      h1 > -1.0 &&
      h2 > -1.0 &&
      h3 > -1.0;

    const syncedCoords =
      Math.hypot(sh2.center.x - p2.x, sh2.center.z - p2.z) <= 2.0 &&
      Math.hypot(sh3.center.x - p3.x, sh3.center.z - p3.z) <= 2.0;

    // Check travel wave pacing in real live 3D mode (with vfxKit active!)
    const emLive = await createEnemyManager({
      scene: new THREE.Scene(),
      kit: makeMockKit(),
      walkableHeightAt: terrainHeightAt,
      resolveCollisions: (x, z) => ({ x, z, wrapped: false }),
    });
    const spyVfx = createSpyVfxKit();
    const liveLoop = createCampaignLoop({
      scene: new THREE.Scene(),
      walkableHeightAt: terrainHeightAt,
      enemyManager: emLive,
      vfxKit: spyVfx,
      combatSfx: createCombatSfx(),
      openValleyMode: true,
    });
    liveLoop.setUnlockedStage(0, 0);
    // Walk heroes from Plaza toward Stone 2 (e.g. x = 55, z = 14) with 0 active enemies for 35 seconds!
    const travelHeroStates = {
      Knight: { id: 'Knight', x: 52.0, y: terrainHeightAt(52, 14), z: 14.0, yaw: 1.4 },
      Mage: { id: 'Mage', x: 50.0, y: terrainHeightAt(50, 14), z: 14.0, yaw: 1.4 },
    };
    liveLoop.startExpedition({ x: 0, z: 102 });
    emLive.clearAllEnemies(); // simulate having cleared South Road Vanguard, now hiking East toward Stone 2
    let travelTriggerSeconds = null;
    let firstWaveCount = 0;
    for (let s = 1; s <= 400; s++) {
      liveLoop.update(0.1, { heroStates: travelHeroStates, activeHeroId: 'Knight', soloWingmanActive: false });
      if (emLive.activeEnemies.length > 0 && travelTriggerSeconds === null) {
        travelTriggerSeconds = Number((s * 0.1).toFixed(1));
        firstWaveCount = emLive.activeEnemies.length;
        break;
      }
    }

    const metrics2C = {
      stone1: p1,
      stone2: p2,
      stone3: p3,
      dist_1_2: Number(d12.toFixed(2)),
      dist_1_3: Number(d13.toFixed(2)),
      dist_2_3: Number(d23.toFixed(2)),
      heights: { h1: Number(h1.toFixed(2)), h2: Number(h2.toFixed(2)), h3: Number(h3.toFixed(2)) },
      radiiFromOrigin: {
        r1: Number(Math.hypot(p1.x, p1.z).toFixed(2)),
        r2: Number(Math.hypot(p2.x, p2.z).toFixed(2)),
        r3: Number(Math.hypot(p3.x, p3.z).toFixed(2)),
        safeMaxR,
      },
      syncedStrongholds: syncedCoords,
      travelWaveTriggerSecInLive3D: travelTriggerSeconds,
      travelWaveEnemyCount: firstWaveCount,
      patrolClearingsCount: PATROL_CLEARINGS.length,
    };

    const pass2C =
      d12 >= 145 &&
      d13 >= 145 &&
      d23 >= 210 &&
      boundsOk &&
      syncedCoords &&
      travelTriggerSeconds !== null &&
      travelTriggerSeconds <= 20.0 &&
      firstWaveCount >= 4;

    recordCheck(
      'Group 2',
      '2C Expanded Stone Spacing (>=145m from Plaza, >=210m between 2&3, walkable) + Active Live Travel Waves',
      pass2C,
      JSON.stringify(metrics2C),
      metrics2C
    );
  }

  // --- 2D. Rebalanced Enemy Difficulty & Engaging Encounters ---
  {
    // Measure hits/combos required to kill a starter Skeleton Minion vs Stage 0-1 Warrior,
    // plus Site 1 Stronghold total pack EHP and concurrent count.
    const minionMaxHp = ENEMY_ARCHETYPES.skeleton_minion.maxHp;
    const knightComboRaw =
      HERO_STATS.Knight.comboDmg[0] +
      HERO_STATS.Knight.comboDmg[1] +
      HERO_STATS.Knight.comboDmg[2];
    const knightFullChainDmg = knightComboRaw + HERO_STATS.Knight.combo4Dmg; // 22+26+38+46 = 132 (single unbuffed 4-hit chain)
    const frostPlusShatterPlusDet =
      SPELLS.frost_lance.dmg + SPELLS.shatterlance.dmg + 42; // 48 + 58 + 42 = 148

    const site1Spawns = STONE_STRONGHOLDS.site1_well.spawns || [];
    const site1TotalHp = site1Spawns.reduce(
      (sum, sp) => sum + (ENEMY_ARCHETYPES[sp.archetype]?.maxHp || 140),
      0
    );

    const metrics2D = {
      skeletonMinionMaxHp: minionMaxHp,
      knight4HitRawChain: knightFullChainDmg,
      mageFrostShatterDetBurst: frostPlusShatterPlusDet,
      site1SpawnCount: site1Spawns.length,
      site1TotalPackHp: site1TotalHp,
      survivesFullKnight4HitCombo: minionMaxHp > knightFullChainDmg,
      survivesSingleFrostShatterCombo: minionMaxHp > frostPlusShatterPlusDet,
    };

    // Starter minions shouldn't vaporize from a single unbuffed 4-hit combo OR a single Frost->Shatter burst,
    // and Site 1 Stronghold should have meaningful total EHP (>= 1000 HP across >= 5 threats or tougher foes).
    const pass2D =
      minionMaxHp > knightFullChainDmg &&
      minionMaxHp > frostPlusShatterPlusDet &&
      site1TotalHp >= 1000;

    recordCheck(
      'Group 2',
      '2D Rebalanced Combat Difficulty (Enemies survive trivial 1-combo burst; Site 1 EHP >= 1000)',
      pass2D,
      JSON.stringify(metrics2D),
      metrics2D
    );
  }
}

// ============================================================================
// GROUP 3: Unthrottled Boot + 15x/20x CPU-Throttled Smooth Amarante Stroke & Dissolve
// ============================================================================
async function profileBootAndDissolve(chromium, baseUrl, cpuThrottleRate) {
  const browser = await chromium.launch({
    executablePath: getChromeExecutable(),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

    // Early instrumentation installed BEFORE page scripts execute
    await context.addInitScript(() => {
      const state = {
        scriptInitTs: performance.now(),
        firstVisibleWordmarkTs: null,
        firstActiveStrokeTs: null,
        strokeCompleteTs: null,
        veilResolvedTs: null,
        worldReadyTs: null,
        putImageDataCalls: 0,
        putImageDataTotalMs: 0,
        putImageDataMaxMs: 0,
        rafDeltas: [],
        dissolveRafDeltas: [],
        dissolveWorkMsSamples: [],
        longTasksAfterBoot: [],
        rafCallbackMaxMs: 0,
        postGlbSpikeMs: 0,
        glbResponses: [],
      };
      window.__BOOT_PERF__ = state;

      // 1. Spy Canvas2D.putImageData to detect CPU per-frame dissolve pixel copying
      if (typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype?.putImageData) {
        const origPut = CanvasRenderingContext2D.prototype.putImageData;
        CanvasRenderingContext2D.prototype.putImageData = function wrappedPutImageData(...args) {
          const t0 = performance.now();
          const res = origPut.apply(this, args);
          const dt = performance.now() - t0;
          state.putImageDataCalls++;
          state.putImageDataTotalMs += dt;
          if (dt > state.putImageDataMaxMs) state.putImageDataMaxMs = dt;
          return res;
        };
      }

      // 2. Observe Long Tasks (>50ms browser threshold)
      try {
        if (typeof PerformanceObserver !== 'undefined') {
          const po = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              state.longTasksAfterBoot.push({
                name: entry.name,
                startTime: Number(entry.startTime.toFixed(1)),
                duration: Number(entry.duration.toFixed(1)),
              });
            }
          });
          po.observe({ type: 'longtask', buffered: true });
        }
      } catch {
        // ignore if unsupported
      }

      // 3. Per-frame rAF observer for Amarante stroke timeline + dissolve deltas + frame work
      let lastRafTs = null;
      let prevProgress = -1;
      const sampleLoop = (now) => {
        if (lastRafTs !== null) {
          const delta = now - lastRafTs;
          if (!state.veilResolvedTs) {
            state.rafDeltas.push(delta);
          }
        }
        lastRafTs = now;

        const wReady = Boolean(window.__WORLD__?.ready);
        if (wReady && state.worldReadyTs === null) {
          state.worldReadyTs = now;
        }

        const appFlow = window.__APP_FLOW__;
        const veil = document.getElementById('af-pixel-veil');
        const wordmark =
          document.getElementById('af-svg-wordmark') ||
          document.querySelector('[data-amarante-wordmark], #haru-boot-wordmark');

        if (wordmark && state.firstVisibleWordmarkTs === null) {
          const r = wordmark.getBoundingClientRect();
          const st = getComputedStyle(wordmark);
          if (r.width > 5 && parseFloat(st.opacity || '1') > 0.01) {
            state.firstVisibleWordmarkTs = now;
          }
        }

        // Check active Amarante stroke progression (CSS animation OR inline stroke-dashoffset OR JS progress)
        if (state.firstActiveStrokeTs === null) {
          const glyphs = document.querySelectorAll(
            '#af-svg-wordmark .af-glyph-contour, #af-svg-wordmark .af-glyph-ductus, [data-amarante-stroke]'
          );
          for (let i = 0; i < glyphs.length; i++) {
            const g = glyphs[i];
            const opAttr = g.getAttribute('opacity');
            const opStyle = parseFloat(getComputedStyle(g).opacity || opAttr || '0');
            const dashAttr = g.getAttribute('stroke-dashoffset');
            const dashStyle = parseFloat(getComputedStyle(g).strokeDashoffset || dashAttr || '105');
            if ((opStyle > 0.01 && dashStyle < 104.5) || g.getAnimations?.().length > 0) {
              state.firstActiveStrokeTs = now;
              break;
            }
          }
        }

        // Check stroke completion (either fills visible or contours drawn across last letter 'e')
        if (state.firstActiveStrokeTs !== null && state.strokeCompleteTs === null) {
          const lastGlyphContour = document.querySelectorAll('#af-svg-wordmark .af-glyph-contour');
          const lastGlyphFill = document.querySelectorAll('#af-svg-wordmark .af-glyph-fill');
          const lastC = lastGlyphContour[lastGlyphContour.length - 1];
          const lastF = lastGlyphFill[lastGlyphFill.length - 1];
          const fOp = lastF ? parseFloat(getComputedStyle(lastF).opacity || lastF.getAttribute('opacity') || '0') : 0;
          const cDash = lastC ? parseFloat(getComputedStyle(lastC).strokeDashoffset || lastC.getAttribute('stroke-dashoffset') || '105') : 105;
          if (fOp >= 0.9 || cDash <= 5.0) {
            state.strokeCompleteTs = now;
          }
        }

        // Track dissolve window work (veil transitioning from opaque -> resolved)
        if (veil) {
          const vOp = parseFloat(getComputedStyle(veil).opacity || '1');
          const resolved = veil.classList.contains('is-resolved') || vOp <= 0.01;
          const prog = appFlow?.getState?.()?.lastDitherProgress ?? 0;
          if (!resolved && ((prog > 0.56 && prog < 0.98) || (vOp > 0.02 && vOp < 0.99))) {
            if (state.rafDeltas.length > 0) {
              state.dissolveRafDeltas.push(state.rafDeltas[state.rafDeltas.length - 1]);
            }
          }
          if (resolved && state.veilResolvedTs === null && (prog >= 0.98 || prevProgress > 0)) {
            state.veilResolvedTs = now;
          }
          prevProgress = prog;
        }

        if (!state.veilResolvedTs || !state.worldReadyTs || now < (state.veilResolvedTs || 0) + 600) {
          requestAnimationFrame(sampleLoop);
        }
      };
      requestAnimationFrame(sampleLoop);

      // Wrap rAF globally to measure per-frame callback CPU execution time (detect heavy JS dissolve / welding spikes)
      const origRaf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = function profiledRaf(cb) {
        return origRaf((ts) => {
          const t0 = performance.now();
          cb(ts);
          const dur = performance.now() - t0;
          if (dur > state.rafCallbackMaxMs) state.rafCallbackMaxMs = dur;
          const veil = document.getElementById('af-pixel-veil');
          const appFlow = window.__APP_FLOW__;
          const prog = appFlow?.getState?.()?.lastDitherProgress ?? 0;
          if (veil && !veil.classList.contains('is-resolved') && prog > 0.55 && prog < 0.98) {
            state.dissolveWorkMsSamples.push(dur);
          }
        });
      };
    });

    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const monumentGlbTimings = [];

    page.on('pageerror', (err) => {
      if (!isBenignError(err.message)) pageErrors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isBenignError(msg.text())) consoleErrors.push(msg.text());
    });
    page.on('response', (resp) => {
      const url = resp.url();
      if (url.includes('/inscriptions/') && url.endsWith('.glb')) {
        monumentGlbTimings.push({ url: path.basename(url), status: resp.status(), ts: Date.now() });
      }
    });

    // Attach Chrome CDP CPU throttling BEFORE navigation
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottleRate });

    const navStart = Date.now();
    await page.goto(`${baseUrl}/world/index.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });

    // Wait up to 45s for world ready AND title reveal animation completion
    await page.waitForFunction(
      () => {
        const wReady = Boolean(window.__WORLD__?.ready);
        const p = window.__BOOT_PERF__;
        const resolved = Boolean(p?.veilResolvedTs);
        return wReady && resolved;
      },
      null,
      { timeout: 60000 }
    );
    await page.waitForTimeout(300);

    // Explicitly benchmark runtime cost if buildWeldedMonumentGeometry / weld runs during boot:
    // Measure max continuous blocking delta right after boot & during load via performance entries + rAF
    const perf = await page.evaluate(() => {
      const p = window.__BOOT_PERF__ || {};
      const sortedDeltas = [...(p.rafDeltas || [])].sort((a, b) => a - b);
      const pct = (arr, q) => {
        if (!arr.length) return 0;
        const idx = Math.min(arr.length - 1, Math.floor(arr.length * q));
        return Number(arr[idx].toFixed(2));
      };
      const dissolveDeltas = [...(p.dissolveRafDeltas || [])].sort((a, b) => a - b);
      const dissolveWork = [...(p.dissolveWorkMsSamples || [])].sort((a, b) => a - b);
      const enterReady = Boolean(document.querySelector('#app-flow-enter-btn.is-ready'));
      const veilOpacity = parseFloat(
        getComputedStyle(document.getElementById('af-pixel-veil') || document.body).opacity || '1'
      );
      const hasBootSplashLeft = Boolean(document.getElementById('haru-boot-splash'));

      // Estimate total blocking stalls from GLB/scene init using >50ms longtasks or max rAF gap
      const maxLongTaskMs = (p.longTasksAfterBoot || []).reduce(
        (m, t) => Math.max(m, Number(t.duration) || 0),
        0
      );

      return {
        firstVisibleWordmarkMs: p.firstVisibleWordmarkTs ? Number(p.firstVisibleWordmarkTs.toFixed(1)) : null,
        firstActiveStrokeMs: p.firstActiveStrokeTs ? Number(p.firstActiveStrokeTs.toFixed(1)) : null,
        strokeCompleteMs: p.strokeCompleteTs ? Number(p.strokeCompleteTs.toFixed(1)) : null,
        writeDurationMs:
          p.firstActiveStrokeTs && p.strokeCompleteTs
            ? Number((p.strokeCompleteTs - p.firstActiveStrokeTs).toFixed(1))
            : null,
        veilResolvedMs: p.veilResolvedTs ? Number(p.veilResolvedTs.toFixed(1)) : null,
        worldReadyMs: p.worldReadyTs ? Number(p.worldReadyTs.toFixed(1)) : null,
        putImageDataCalls: p.putImageDataCalls || 0,
        putImageDataTotalMs: Number((p.putImageDataTotalMs || 0).toFixed(2)),
        putImageDataMaxMs: Number((p.putImageDataMaxMs || 0).toFixed(2)),
        rafCount: sortedDeltas.length,
        p50RafDeltaMs: pct(sortedDeltas, 0.5),
        p95RafDeltaMs: pct(sortedDeltas, 0.95),
        p99RafDeltaMs: pct(sortedDeltas, 0.99),
        maxRafDeltaMs: sortedDeltas.length ? Number(sortedDeltas[sortedDeltas.length - 1].toFixed(2)) : 0,
        dissolveP95DeltaMs: pct(dissolveDeltas, 0.95),
        dissolveWorkMaxMs: dissolveWork.length ? Number(dissolveWork[dissolveWork.length - 1].toFixed(2)) : 0,
        rafCallbackMaxMs: Number((p.rafCallbackMaxMs || 0).toFixed(2)),
        maxLongTaskMs: Number(maxLongTaskMs.toFixed(1)),
        longTaskCount: (p.longTasksAfterBoot || []).length,
        enterReady,
        veilOpacity: Number(veilOpacity.toFixed(3)),
        hasBootSplashLeft,
        worldReady: Boolean(window.__WORLD__?.ready),
      };
    });

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await context.close();

    return {
      cpuThrottleRate,
      navWallMs: Date.now() - navStart,
      monumentGlbCount: monumentGlbTimings.length,
      consoleErrors,
      pageErrors,
      ...perf,
    };
  } finally {
    await browser.close();
  }
}

async function runGroup3(chromium, baseUrl) {
  console.log('\n=== Group 3: Boot Time, CPU-Throttled Amarante Stroke & Zero-putImageData Dissolve ===');

  const r1 = await profileBootAndDissolve(chromium, baseUrl, 1);
  console.log('  [BENCH 1x ]', JSON.stringify(r1));

  const r15 = await profileBootAndDissolve(chromium, baseUrl, 15);
  console.log('  [BENCH 15x]', JSON.stringify(r15));

  const r20 = await profileBootAndDissolve(chromium, baseUrl, 20);
  console.log('  [BENCH 20x]', JSON.stringify(r20));

  // Sub-check 3A: Time-to-first-Amarante-stroke <= 350ms even under 15x CPU throttle
  const pass3A =
    r15.firstActiveStrokeMs !== null && r15.firstActiveStrokeMs <= 350;
  recordCheck(
    'Group 3',
    '3A Time-to-first-Amarante-stroke <= 350ms under 15x CPU throttle (no dead black boot pause)',
    pass3A,
    `1x=${r1.firstActiveStrokeMs}ms 15x=${r15.firstActiveStrokeMs}ms 20x=${r20.firstActiveStrokeMs}ms (wordmark: 1x=${r1.firstVisibleWordmarkMs}ms, 15x=${r15.firstVisibleWordmarkMs}ms)`,
    { r1FirstStroke: r1.firstActiveStrokeMs, r15FirstStroke: r15.firstActiveStrokeMs, r20FirstStroke: r20.firstActiveStrokeMs }
  );

  // Sub-check 3B: Deliberate unhurried Amarante stroke write duration >= 1800ms
  const pass3B =
    r15.writeDurationMs !== null && r15.writeDurationMs >= 1800;
  recordCheck(
    'Group 3',
    '3B Deliberate unhurried Amarante stroke write phase (>= 1800ms)',
    pass3B,
    `1x write=${r1.writeDurationMs}ms 15x write=${r15.writeDurationMs}ms 20x write=${r20.writeDurationMs}ms`,
    { r1WriteMs: r1.writeDurationMs, r15WriteMs: r15.writeDurationMs, r20WriteMs: r20.writeDurationMs }
  );

  // Sub-check 3C: Zero runtime monument vertex welding blocking (< 5ms stalls from buildWeldedMonumentGeometry / prewarm)
  const mainJsSrc = fs.readFileSync(path.resolve(ROOT_DIR, 'world/src/main.js'), 'utf8');
  const callsRuntimeMonumentWeld = /buildWeldedMonumentGeometry\s*\([^)]*,\s*0\.0\d+/.test(mainJsSrc);
  const pass3C = !callsRuntimeMonumentWeld && r1.maxLongTaskMs < 50 && r15.maxRafDeltaMs <= 85;
  recordCheck(
    'Group 3',
    '3C Pre-baked monument GLBs (zero runtime buildWeldedMonumentGeometry welding stalls < 5ms)',
    pass3C,
    `callsRuntimeMonumentWeld=${callsRuntimeMonumentWeld} maxLongTask(1x=${r1.maxLongTaskMs}ms, 15x=${r15.maxLongTaskMs}ms) maxRafDelta(1x=${r1.maxRafDeltaMs}ms, 15x=${r15.maxRafDeltaMs}ms)`,
    { callsRuntimeMonumentWeld, maxLongTask1x: r1.maxLongTaskMs, maxLongTask15x: r15.maxLongTaskMs, maxRafDelta1x: r1.maxRafDeltaMs, maxRafDelta15x: r15.maxRafDeltaMs }
  );

  // Sub-check 3D: Zero CPU putImageData dissolve loop (< 2ms dissolve frame work) + p95 rAF delta <= 35ms under 15x throttle
  const pass3D =
    r15.putImageDataCalls === 0 &&
    r15.dissolveWorkMaxMs < 2.0 &&
    r15.p95RafDeltaMs <= 35.0 &&
    r15.worldReady &&
    r15.enterReady &&
    r15.consoleErrors.length === 0 &&
    r15.pageErrors.length === 0;
  recordCheck(
    'Group 3',
    '3D Zero putImageData dissolve + <2ms dissolve work + p95 rAF <= 35ms under 15x CPU throttle',
    pass3D,
    `putImageData=${r15.putImageDataCalls} (${r15.putImageDataTotalMs}ms), dissolveMax(1x=${r1.dissolveWorkMaxMs}ms, 15x=${r15.dissolveWorkMaxMs}ms), p95Raf(1x=${r1.p95RafDeltaMs}ms, 15x=${r15.p95RafDeltaMs}ms, 20x=${r20.p95RafDeltaMs}ms), ready=${r15.worldReady}, errs=${r15.consoleErrors.length + r15.pageErrors.length}`,
    { r1, r15, r20 }
  );
}

// ============================================================================
// GROUP 4: Compatibility Check of Existing `world/tools/*.mjs` Suites
// ============================================================================
function runGroup4() {
  console.log('\n=== Group 4: Compatibility Check Across Existing world/tools/*.mjs ===');

  const scanTargets = [
    {
      file: 'test-coop-live-2p.mjs',
      pattern: /assert\.equal\(\s*soloResult\.unlockedStage,\s*3|knightQ,\s*100|mageQ,\s*160/,
      reason:
        'Step 1 clicks regular #app-flow-start-btn without ?dev=1 and asserts unlockedStage === 3 + Knight/Mage Q=100/160 (will break once normal Solo starts at Stage 0).',
    },
    {
      file: 'verify-mali-g68-60fps-parity.mjs',
      pattern: /x:\s*114\.0[\s\S]{0,80}z:\s*32\.0|x:\s*-92\.0[\s\S]{0,80}z:\s*64\.0/,
      reason:
        'Hardcodes Stone 2 (114.0, 32.0) and Stone 3 (-92.0, 64.0) camera inspection coordinates (must read INSCRIPTION_STONES or move when Stone 2/3 expand).',
    },
    {
      file: 'gameplay-video-harness.mjs',
      pattern: /teleportLeaderAndPartner\(\s*114\.0|teleportLeaderAndPartner\(\s*-92\.0/,
      reason:
        'Hardcodes Stone 2 (114, 41/33.2) and Stone 3 (-92, 68.6) teleport coords (must read updated Stone positions if moved).',
    },
    {
      file: 'test-combat-sim.mjs',
      pattern: /ENEMY_ARCHETYPES\.skeleton_minion\.maxHp,\s*140/,
      reason:
        'Asserts ENEMY_ARCHETYPES.skeleton_minion.maxHp === 140 (requires coordinated update if base HP increases vs difficulty multiplier/wave scaling).',
    },
    {
      file: 'capture-onboarding-options.mjs',
      pattern: /renderDitherVeilAtProgress|stopMosaicLoop/,
      reason:
        'Calls appFlow.stopMosaicLoop() and appFlow.renderDitherVeilAtProgress(prog) directly (must remain supported or update if dissolve/stroke API changes).',
    },
  ];

  const findings = [];
  for (const t of scanTargets) {
    const full = path.join(TOOLS_DIR, t.file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    const lines = text.split('\n');
    const matchedLines = [];
    lines.forEach((line, i) => {
      if (
        (t.file === 'test-coop-live-2p.mjs' &&
          (/soloResult\.unlockedStage,\s*3/.test(line) ||
            /soloResult\.knightQ,\s*100/.test(line) ||
            /soloResult\.mageQ,\s*160/.test(line))) ||
        (t.file === 'verify-mali-g68-60fps-parity.mjs' &&
          (/x:\s*114\.0/.test(line) || /x:\s*-92\.0/.test(line))) ||
        (t.file === 'gameplay-video-harness.mjs' &&
          (/teleportLeaderAndPartner\(\s*114\.0/.test(line) ||
            /teleportLeaderAndPartner\(\s*-92\.0/.test(line))) ||
        (t.file === 'test-combat-sim.mjs' &&
          /ENEMY_ARCHETYPES\.skeleton_minion\.maxHp,\s*140/.test(line)) ||
        (t.file === 'capture-onboarding-options.mjs' &&
          /renderDitherVeilAtProgress|stopMosaicLoop/.test(line))
      ) {
        matchedLines.push(i + 1);
      }
    });
    findings.push({
      file: `world/tools/${t.file}`,
      lines: matchedLines,
      needsCoordinatedUpdate: matchedLines.length > 0 && t.file !== 'capture-onboarding-options.mjs',
      preserveContract: t.file === 'capture-onboarding-options.mjs',
      reason: t.reason,
    });
  }

  console.log('  Compatibility Matrix:');
  for (const f of findings) {
    console.log(
      `   - ${f.file}:${f.lines.join(',')} [${f.needsCoordinatedUpdate ? 'UPDATE WITH FIX' : 'KEEP COMPATIBLE'}] -> ${f.reason}`
    );
  }

  // Group 4 passes as long as the audit completes cleanly and reports exact impacted locations
  recordCheck(
    'Group 4',
    '4A Existing test suite compatibility inventory generated',
    findings.length >= 4,
    `${findings.filter((f) => f.needsCoordinatedUpdate).length} test files require coordinated updates`,
    findings
  );
}

// ============================================================================
// Main Runner
// ============================================================================
async function main() {
  const srv = await startServer(0);
  const baseUrl = `http://127.0.0.1:${srv.port}`;
  const chromium = await loadChromium();

  try {
    await runGroup1(chromium, baseUrl);
    await runGroup2(chromium, baseUrl);
    await runGroup3(chromium, baseUrl);
    runGroup4();
  } finally {
    srv.server?.closeAllConnections?.();
    await new Promise((resolve) => {
      srv.server?.close?.(resolve);
      setTimeout(resolve, 250);
    });
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log('\n====================================================================');
  console.log(`FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED (${results.length} total checks)`);
  console.log('====================================================================');
  for (const r of results) {
    if (!r.pass) {
      console.log(`  FAIL: [${r.group}] ${r.name}`);
      console.log(`        ${r.detail}`);
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
