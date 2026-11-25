#!/usr/bin/env node
// ============================================================================
// world/tools/test-tablet-sites-and-ux.mjs
//
// Empirical TDD Verification Suite for Tablet Controls, Sacred Monuments,
// Co-Op Room Code Visibility, Mage Touch Sights, Trees Shader Integrity,
// Progression Victory Guards, and Opening Lobby Polish.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
const OUT_DIR = path.resolve(ROOT_DIR, 'world/shots/tdd-tablet-sites-qa');

async function loadChromium() {
  const candidates = [
    'playwright',
    path.resolve(ROOT_DIR, 'node_modules/playwright/index.mjs'),
    'C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs',
    'C:/Users/silen/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs',
  ];
  for (const modPath of candidates) {
    try {
      const spec =
        modPath.startsWith('C:/') || modPath.startsWith('/') || modPath.includes(':\\')
          ? pathToFileURL(modPath).href
          : modPath;
      const pw = await import(spec);
      if (pw?.chromium) return pw.chromium;
      if (pw?.default?.chromium) return pw.default.chromium;
    } catch {
      // next candidate
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

const results = [];
function recordCheck(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass), detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` -> ${detail}` : ''}`);
}

const isBenignError = (txt) => /favicon\.ico/i.test(String(txt || ''));

async function waitForWorldReady(page, timeoutMs = 45000) {
  await page.waitForFunction(
    () => Boolean(window.__WORLD__?.ready && window.__WORLD__?.coopSystem?.campaignLoop),
    null,
    { timeout: timeoutMs }
  );
  await page.waitForFunction(
    () => {
      const grp = window.__WORLD__?.stoneDecals?.group;
      if (!grp) return false;
      let loaded = 0;
      for (const ch of grp.children) {
        let hasMesh = false;
        ch.traverse((o) => {
          if (o.isMesh && o.name.startsWith('UnifiedMonument_')) hasMesh = true;
        });
        if (hasMesh) loaded++;
      }
      return loaded >= 3;
    },
    null,
    { timeout: 30000 }
  );
}

/**
 * Helper to dispatch synthetic Touch PointerEvent sequence directly onto a target element
 * with realistic step timing inside the browser so velocity & drag thresholds are measured
 * identically to real tablet touch interaction.
 */
async function dispatchTouchDrag(page, selectorOrCoords, startX, startY, endX, endY, totalMs, steps = 8) {
  return page.evaluate(
    async ({ targetSel, sx, sy, ex, ey, ms, nSteps }) => {
      const target = targetSel
        ? document.querySelector(targetSel)
        : document.elementFromPoint(sx, sy);
      if (!target) {
        return { error: `Missing target for ${targetSel}` };
      }
      const pointerId = 901;
      const mkEvt = (type, x, y, extra = {}) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y,
          button: type === 'pointerup' || type === 'pointerdown' ? 0 : -1,
          buttons: type === 'pointerup' ? 0 : 1,
          ...extra,
        });

      const stepMs = Math.max(4, ms / Math.max(1, nSteps));
      const sleep = (d) => new Promise((r) => setTimeout(r, d));
      const t0 = performance.now();

      target.dispatchEvent(mkEvt('pointerdown', sx, sy));
      for (let i = 1; i <= nSteps; i++) {
        await sleep(stepMs);
        const u = i / nSteps;
        const cx = sx + (ex - sx) * u;
        const cy = sy + (ey - sy) * u;
        target.dispatchEvent(mkEvt('pointermove', cx, cy));
      }
      target.dispatchEvent(mkEvt('pointerup', ex, ey));
      await sleep(16);
      return {
        targetId: target.id || target.tagName,
        elapsedMs: Math.round(performance.now() - t0),
      };
    },
    { targetSel: selectorOrCoords, sx: startX, sy: startY, ex: endX, ey: endY, ms: totalMs, nSteps: steps }
  );
}

async function dispatchRealTouchDrag(cdp, startX, startY, endX, endY, totalMs, steps = 8) {
  const stepMs = Math.max(8, Math.round(totalMs / Math.max(1, steps)));
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(startX), y: Math.round(startY), id: 1, radiusX: 12, radiusY: 12, force: 1 }],
  });
  for (let i = 1; i <= steps; i++) {
    await new Promise((r) => setTimeout(r, stepMs));
    const u = i / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: Math.round(startX + (endX - startX) * u),
        y: Math.round(startY + (endY - startY) * u),
        id: 1,
        radiusX: 12,
        radiusY: 12,
        force: 1,
      }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await new Promise((r) => setTimeout(r, 24));
}

async function runSuite() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const srv = await startServer(0);
  const baseUrl = srv.url;
  const chromium = await loadChromium();

  const useGpu = process.platform === 'win32' && !process.env.SWIFTSHADER;
  const browser = await chromium.launch({
    executablePath: getChromeExecutable(),
    args: useGpu
      ? [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--use-angle=d3d11',
          '--enable-webgl',
          '--ignore-gpu-blocklist',
        ]
      : [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--ignore-gpu-blocklist',
        ],
  });

  const consoleErrors = [];
  const pageErrors = [];
  try {
    // =======================================================================
    // CONTEXT A: Tablet Profile (1180x787, hasTouch: true) with ?nolobby=1
    // =======================================================================
    const context = await browser.newContext({
      viewport: { width: 1180, height: 787 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' })
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => {
      if (!isBenignError(e.message)) {
        pageErrors.push(e.message);
        console.error('  [PAGEERROR]', e.message);
      }
    });
    page.on('console', (m) => {
      if (m.type() === 'error' && !isBenignError(m.text())) {
        consoleErrors.push(m.text());
        console.error('  [CONSOLE ERROR]', m.text());
      }
    });

    await page.goto(`${baseUrl}?nolobby=1&profile=tablet`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await waitForWorldReady(page);
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.appFlow?.resolvePixelVeil?.();
      w.enemyManager?.clearAllEnemies?.();
      w.coopSystem.teleportLeaderAndPartner(0.0, 124.0, Math.PI);
      w.setCameraOrbit(Math.PI, 0.25, 8.4);
    });
    await page.waitForTimeout(180);

    // -----------------------------------------------------------------------
    // 1A. Open-Screen Camera Orbit Sensitivity, Brisk Swipe & Velocity Curve
    // -----------------------------------------------------------------------
    const orbitRes = await (async () => {
      // Clear cooldowns first
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.combatHeroes.Knight.dashCd = 0;
        w.coopSystem.heroStates.Knight.actionState = null;
        w.setCameraOrbit(0.0, 0.30, 8.4);
      });

      // Brisk open-screen right-side swipe (300px over 100ms = 3.0 px/ms)
      await dispatchTouchDrag(page, '#sculpted-orbit-zone', 980, 360, 680, 360, 100, 8);
      const afterFast = await page.evaluate(() => ({
        yaw: window.__WORLD__.camState.yaw,
        actionState: window.__WORLD__.coopSystem.heroStates.Knight.actionState,
        isOrbitDragging: window.__WORLD__.sculptedHud.isOrbitDragging,
      }));

      // Same 220px moved SLOWLY (420ms) vs BRISKLY (80ms) to verify Genshin-style velocity curve
      await page.evaluate(() => window.__WORLD__.setCameraOrbit(0.0, 0.30, 8.4));
      await dispatchTouchDrag(page, '#sculpted-orbit-zone', 940, 360, 720, 360, 420, 14);
      const slowDeltaYaw = await page.evaluate(() => Math.abs(window.__WORLD__.camState.yaw));

      await page.evaluate(() => window.__WORLD__.setCameraOrbit(0.0, 0.30, 8.4));
      await dispatchTouchDrag(page, '#sculpted-orbit-zone', 940, 360, 720, 360, 80, 6);
      const fastDeltaYaw = await page.evaluate(() => Math.abs(window.__WORLD__.camState.yaw));

      // Vertical pitch swipe check
      await page.evaluate(() => window.__WORLD__.setCameraOrbit(0.0, 0.35, 8.4));
      await dispatchTouchDrag(page, '#sculpted-orbit-zone', 900, 260, 900, 460, 150, 8);
      const pitchAfterDown = await page.evaluate(() => window.__WORLD__.camState.pitch);

      return {
        fast300YawAbs: Number(Math.abs(afterFast.yaw).toFixed(3)),
        fastTriggeredDash: afterFast.actionState === 'dash',
        stickyOrbitFlagAfterUp: afterFast.isOrbitDragging,
        slow220DeltaYaw: Number(slowDeltaYaw.toFixed(3)),
        fast220DeltaYaw: Number(fastDeltaYaw.toFixed(3)),
        pitchDelta: Number((pitchAfterDown - 0.35).toFixed(3)),
      };
    })();

    const pass1A =
      !orbitRes.fastTriggeredDash &&
      !orbitRes.stickyOrbitFlagAfterUp &&
      orbitRes.fast300YawAbs >= 1.5 &&
      orbitRes.fast220DeltaYaw > orbitRes.slow220DeltaYaw * 1.25 &&
      orbitRes.slow220DeltaYaw >= 0.45 &&
      orbitRes.pitchDelta >= 0.25;
    recordCheck(
      '1A Open-screen touch orbit moves smoothly at ANY speed, zero dash hijack, viewport+velocity curve',
      pass1A,
      JSON.stringify(orbitRes)
    );

    // -----------------------------------------------------------------------
    // 1B. Dodge Strictly Limited to Compact Mid-Screen Zone + Slow Drag Orbits
    // -----------------------------------------------------------------------
    const dodgeRes = await (async () => {
      const zoneLayout = await page.evaluate(() => {
        const el = document.getElementById('sculpted-center-dodge-zone');
        const r = el.getBoundingClientRect();
        return {
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
          cx: Math.round(r.left + r.width * 0.5),
          cy: Math.round(r.top + r.height * 0.5),
        };
      });

      // Off-center quick flicks outside the middle hero box MUST NOT dodge:
      await page.evaluate(() => {
        window.__WORLD__.campaignLoop.combatHeroes.Knight.dashCd = 0;
        window.__WORLD__.coopSystem.heroStates.Knight.actionState = null;
      });
      // Top-center flick (y = 95)
      await dispatchTouchDrag(page, null, 590, 95, 490, 95, 85, 5);
      const topFlickDash = await page.evaluate(
        () => window.__WORLD__.coopSystem.heroStates.Knight.actionState === 'dash'
      );

      // Lower-mid above/below hero (left open side x=300)
      await page.evaluate(() => {
        window.__WORLD__.campaignLoop.combatHeroes.Knight.dashCd = 0;
        window.__WORLD__.coopSystem.heroStates.Knight.actionState = null;
      });
      await dispatchTouchDrag(page, '#sculpted-orbit-zone', 920, 200, 810, 200, 80, 5);
      const sideFlickDash = await page.evaluate(
        () => window.__WORLD__.coopSystem.heroStates.Knight.actionState === 'dash'
      );

      // Slow & medium drags inside center zone MUST orbit camera, NOT dodge:
      await page.evaluate(() => {
        window.__WORLD__.campaignLoop.combatHeroes.Knight.dashCd = 0;
        window.__WORLD__.coopSystem.heroStates.Knight.actionState = null;
        window.__WORLD__.setCameraOrbit(0.0, 0.30, 8.4);
      });
      await dispatchTouchDrag(
        page,
        '#sculpted-center-dodge-zone',
        zoneLayout.cx,
        zoneLayout.cy,
        zoneLayout.cx - 55,
        zoneLayout.cy,
        360,
        12
      );
      const centerSlow = await page.evaluate(() => ({
        dashed: window.__WORLD__.coopSystem.heroStates.Knight.actionState === 'dash',
        yawDelta: Math.abs(window.__WORLD__.camState.yaw),
      }));

      // Medium-speed deliberate drag inside center zone (~0.40 px/ms over 160ms) -> orbits, zero dodge!
      await page.evaluate(() => {
        window.__WORLD__.campaignLoop.combatHeroes.Knight.dashCd = 0;
        window.__WORLD__.coopSystem.heroStates.Knight.actionState = null;
        window.__WORLD__.setCameraOrbit(0.0, 0.30, 8.4);
      });
      await dispatchTouchDrag(
        page,
        '#sculpted-center-dodge-zone',
        zoneLayout.cx + 25,
        zoneLayout.cy,
        zoneLayout.cx - 39,
        zoneLayout.cy,
        160,
        8
      );
      const centerMed = await page.evaluate(() => ({
        dashed: window.__WORLD__.coopSystem.heroStates.Knight.actionState === 'dash',
        yawDelta: Math.abs(window.__WORLD__.camState.yaw),
      }));

      // Fast flick inside center zone (~1.0 px/ms) MUST dodge cleanly:
      await page.evaluate(() => {
        window.__WORLD__.campaignLoop.combatHeroes.Knight.dashCd = 0;
        window.__WORLD__.coopSystem.heroStates.Knight.actionState = null;
      });
      await dispatchTouchDrag(
        page,
        '#sculpted-center-dodge-zone',
        zoneLayout.cx + 30,
        zoneLayout.cy,
        zoneLayout.cx - 55,
        zoneLayout.cy,
        85,
        5
      );
      const centerFastDash = await page.evaluate(
        () => window.__WORLD__.coopSystem.heroStates.Knight.actionState === 'dash'
      );

      // Verify Joystick zone NEVER overlaps Center Dodge zone & Real CDP Multi-Touch works smoothly!
      const joyRect = await page.evaluate(() => {
        const j = document.getElementById('sculpted-joystick-zone').getBoundingClientRect();
        return { right: Math.round(j.right), top: Math.round(j.top), width: Math.round(j.width), height: Math.round(j.height) };
      });
      const cdp = await context.newCDPSession(page);
      await page.evaluate(() => {
        window.__WORLD__.campaignLoop.combatHeroes.Knight.dashCd = 0;
        window.__WORLD__.coopSystem.heroStates.Knight.actionState = null;
        window.__WORLD__.setCameraOrbit(0.0, 0.30, 8.4);
      });
      // Real CDP fast orbit drag + real CDP multi-touch (left thumb joystick + right thumb orbit simultaneously)
      await dispatchRealTouchDrag(cdp, 920, 320, 620, 320, 95, 6);
      const realCdpFastYaw = await page.evaluate(() => ({
        yaw: Number(Math.abs(window.__WORLD__.camState.yaw).toFixed(3)),
        dashed: window.__WORLD__.coopSystem.heroStates.Knight.actionState === 'dash',
      }));

      await page.evaluate(() => window.__WORLD__.setCameraOrbit(0.0, 0.30, 8.4));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 112, y: 660, id: 10, radiusX: 12, radiusY: 12, force: 1 }],
      });
      await new Promise((r) => setTimeout(r, 30));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 152, y: 640, id: 10, radiusX: 12, radiusY: 12, force: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: 152, y: 640, id: 10, radiusX: 12, radiusY: 12, force: 1 },
          { x: 900, y: 340, id: 11, radiusX: 12, radiusY: 12, force: 1 },
        ],
      });
      for (let i = 1; i <= 6; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: 152, y: 640, id: 10, radiusX: 12, radiusY: 12, force: 1 },
            { x: 900 - i * 35, y: 340, id: 11, radiusX: 12, radiusY: 12, force: 1 },
          ],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await new Promise((r) => setTimeout(r, 24));
      const multiTouchRes = await page.evaluate(() => ({
        yaw: Number(Math.abs(window.__WORLD__.camState.yaw).toFixed(3)),
        stickyOrbit: window.__WORLD__.sculptedHud.isOrbitDragging,
        stickyJoy: window.__WORLD__.sculptedHud.joyState.active,
      }));

      return {
        zoneLayout,
        joyRect,
        joyZeroOverlap: joyRect.right <= zoneLayout.left,
        topFlickDash,
        sideFlickDash,
        centerSlowDashed: centerSlow.dashed,
        centerSlowYawDelta: Number(centerSlow.yawDelta.toFixed(3)),
        centerMedDashed: centerMed.dashed,
        centerMedYawDelta: Number(centerMed.yawDelta.toFixed(3)),
        centerFastDash,
        realCdpFastYaw,
        multiTouchRes,
      };
    })();

    const pass1B =
      dodgeRes.zoneLayout.width <= 190 &&
      dodgeRes.zoneLayout.height <= 230 &&
      dodgeRes.joyZeroOverlap &&
      !dodgeRes.topFlickDash &&
      !dodgeRes.sideFlickDash &&
      !dodgeRes.centerSlowDashed &&
      dodgeRes.centerSlowYawDelta >= 0.12 &&
      !dodgeRes.centerMedDashed &&
      dodgeRes.centerMedYawDelta >= 0.14 &&
      dodgeRes.centerFastDash &&
      !dodgeRes.realCdpFastYaw.dashed &&
      dodgeRes.realCdpFastYaw.yaw >= 1.2 &&
      dodgeRes.multiTouchRes.yaw >= 0.8 &&
      !dodgeRes.multiTouchRes.stickyOrbit &&
      !dodgeRes.multiTouchRes.stickyJoy;
    recordCheck(
      '1B Dodge strictly compact mid-screen hero zone + slow center drag orbits instead of dodging',
      pass1B,
      JSON.stringify(dodgeRes)
    );

    // -----------------------------------------------------------------------
    // 1C. Camera Sensitivity Choice in Pause Modal Scales Touch Orbit Cleanly
    // -----------------------------------------------------------------------
    const sensRes = await page.evaluate(async () => {
      const hud = window.__WORLD__.sculptedHud;
      const pills = [...document.querySelectorAll('[data-camera-sens]')];
      return {
        pillCount: pills.length,
        hasSetter: typeof hud.setCameraSensitivity === 'function',
        values: pills.map((p) => p.getAttribute('data-camera-sens')),
      };
    });
    let sensPass = sensRes.pillCount >= 3 && sensRes.hasSetter;
    let sensDeltas = null;
    if (sensPass) {
      const measureAt = async (preset) => {
        await page.evaluate((p) => {
          window.__WORLD__.sculptedHud.setCameraSensitivity(p);
          window.__WORLD__.setCameraOrbit(0.0, 0.30, 8.4);
        }, preset);
        await dispatchTouchDrag(page, '#sculpted-orbit-zone', 900, 360, 760, 360, 120, 6);
        return page.evaluate(() => Math.abs(window.__WORLD__.camState.yaw));
      };
      const lowD = await measureAt('low');
      const medD = await measureAt('medium');
      const highD = await measureAt('high');
      sensDeltas = { lowD: +lowD.toFixed(3), medD: +medD.toFixed(3), highD: +highD.toFixed(3) };
      sensPass = lowD < medD && medD < highD;
      // Restore crisp default
      await page.evaluate(() => window.__WORLD__.sculptedHud.setCameraSensitivity('high'));
    }
    recordCheck(
      '1C Pause Modal Camera Sensitivity setting exists & scales orbit speed cleanly',
      sensPass,
      JSON.stringify({ ...sensRes, sensDeltas })
    );

    // -----------------------------------------------------------------------
    // 2. Monument LODs, Poem Non-Occlusion, ID Parity & Tablet Read Button
    // -----------------------------------------------------------------------
    const mainJsSrc = fs.readFileSync(path.resolve(ROOT_DIR, 'world/src/main.js'), 'utf8');
    const callsRuntimeWeld = /buildWeldedMonumentGeometry\s*\([^)]*,\s*0\.0\d+/.test(mainJsSrc);

    const monumentAudit = await page.evaluate(() => {
      const w = window.__WORLD__;
      const entries = w.stoneDecals?.entries || {};
      const results = {};

      for (const id of ['stone_plaza', 'stone_grove', 'stone_pier']) {
        const entry = entries[id];
        const set = entry?.lodSets?.[0];
        const countTris = (mesh) => {
          if (!mesh?.geometry) return 0;
          const idx = mesh.geometry.index;
          return idx ? idx.count / 3 : (mesh.geometry.attributes.position?.count || 0) / 3;
        };

        const calli = set?.calligraphyMesh;
        let poemClearanceOk = false;
        let maxStoneMetric = null;
        let poemMetric = null;

        if (calli && set?.inspectStoneMesh?.geometry) {
          const pos = set.inspectStoneMesh.geometry.attributes.position;
          const calliPos = calli.geometry.attributes.position;
          calli.geometry.computeBoundingBox();
          const cb = calli.geometry.boundingBox;

          if (id === 'stone_plaza') {
            // Cylindrical arc along front (+Z) of well
            let stoneMaxR = 0;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i);
              const y = pos.getY(i);
              const z = pos.getZ(i);
              if (z > 0.6 && y >= 0.25 && y <= 0.72 && Math.abs(Math.atan2(x, z)) <= 0.45) {
                const r = Math.hypot(x, z);
                if (r > stoneMaxR) stoneMaxR = r;
              }
            }
            let poemMinR = Infinity;
            for (let i = 0; i < calliPos.count; i++) {
              const r = Math.hypot(calliPos.getX(i), calliPos.getZ(i));
              if (r < poemMinR) poemMinR = r;
            }
            maxStoneMetric = Number(stoneMaxR.toFixed(4));
            poemMetric = Number(poemMinR.toFixed(4));
            poemClearanceOk = poemMinR >= stoneMaxR + 0.008;
          } else if (id === 'stone_grove') {
            // Horizontal tablet rotated into XZ plane at mesh.position.y
            const minX = cb.min.x + calli.position.x;
            const maxX = cb.max.x + calli.position.x;
            const minZ = cb.min.z + calli.position.z;
            const maxZ = cb.max.z + calli.position.z;
            let stoneMaxY = -Infinity;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i);
              const y = pos.getY(i);
              const z = pos.getZ(i);
              if (x >= minX && x <= maxX && z >= minZ && z <= maxZ && y > 0.04) {
                if (y > stoneMaxY) stoneMaxY = y;
              }
            }
            maxStoneMetric = Number(stoneMaxY.toFixed(4));
            poemMetric = Number(calli.position.y.toFixed(4));
            poemClearanceOk = calli.position.y >= stoneMaxY + 0.008;
          } else {
            // Vertical Lovers' Wall plaque facing +Z
            const minX = cb.min.x + calli.position.x;
            const maxX = cb.max.x + calli.position.x;
            const minY = cb.min.y + calli.position.y;
            const maxY = cb.max.y + calli.position.y;
            let stoneMaxZ = -Infinity;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i);
              const y = pos.getY(i);
              const z = pos.getZ(i);
              if (x >= minX && x <= maxX && y >= minY && y <= maxY && z > 0.0) {
                if (z > stoneMaxZ) stoneMaxZ = z;
              }
            }
            maxStoneMetric = Number(stoneMaxZ.toFixed(4));
            poemMetric = Number(calli.position.z.toFixed(4));
            poemClearanceOk = calli.position.z >= stoneMaxZ + 0.008;
          }
        }

        results[id] = {
          hasInspectMesh: Boolean(set?.inspectStoneMesh),
          hasNearMesh: Boolean(set?.nearStoneMesh),
          hasFarMesh: Boolean(set?.farStoneMesh),
          inspectTris: countTris(set?.inspectStoneMesh),
          nearTris: countTris(set?.nearStoneMesh),
          farTris: countTris(set?.farStoneMesh),
          maxStoneMetric,
          poemMetric,
          poemClearanceOk,
        };
      }

      // Check canonical ID inspection parity & tablet Read button
      w.coopSystem.teleportLeaderAndPartner(0.0, 3.2, Math.PI);
      w.setCameraOrbit(Math.PI, 0.16, 6.0);
      w.coopSystem.update(0.016, { keys: new Set(), joyState: { x: 0, y: 0, magnitude: 0 }, camYaw: Math.PI, camPitch: 0.16 });
      // Legitimately defeat active guardians so Sacred Stone 1 unseals cleanly
      for (const e of [...(w.enemyManager.activeEnemies || [])]) {
        w.enemyManager.applyHitToEnemy(e, { source: 'couples_ultimate', baseDmg: 99999 });
      }
      w.coopSystem.update(0.016, { keys: new Set(), joyState: { x: 0, y: 0, magnitude: 0 }, camYaw: Math.PI, camPitch: 0.16 });
      const near1 = w.coopSystem.getNearestInscriptionStone(6.0);
      return {
        results,
        near1Id: near1?.id || null,
        near1CanonicalId: near1?.siteId || null,
      };
    });

    // Wait a frame so updateSacredStoneGaze updates #stone-world-read-btn
    await page.waitForTimeout(120);
    const readBtnState = await page.evaluate(() => {
      const btn = document.getElementById('stone-world-read-btn');
      const r = btn?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const cs = btn ? getComputedStyle(btn) : null;
      return {
        visible: btn?.classList.contains('is-visible') || false,
        text: btn?.textContent?.trim() || '',
        width: Math.round(r.width),
        height: Math.round(r.height),
        opacity: cs ? parseFloat(cs.opacity) : 0,
      };
    });

    await page.screenshot({ path: path.join(OUT_DIR, 'site1-well-read-btn.png') });

    // Check canonical site1_well, site2_platform & site3_wall inspection activation + capture clean Site PNGs
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.enterStoneInspection({ id: 'site1_well', position: { x: 0, z: 0 }, rotY: 0 });
    });
    await page.waitForTimeout(350);
    const site1Active = await page.evaluate(() => Boolean(window.__WORLD__.stoneGazeState.inspectActive));
    await page.screenshot({ path: path.join(OUT_DIR, 'site1-well-inspect.png') });

    const canonicalInspectRes = await page.evaluate(() => {
      const w = window.__WORLD__;
      w.exitStoneInspection();
      w.coopSystem.teleportLeaderAndPartner(142.0, 46.5, Math.PI);
      w.campaignLoop.checkStrongholdTriggers(w.coopSystem.heroStates.Knight, w.coopSystem.heroStates.Mage);
      for (const e of [...(w.enemyManager.activeEnemies || [])]) {
        w.enemyManager.applyHitToEnemy(e, { source: 'couples_ultimate', baseDmg: 99999 });
      }
      w.coopSystem.update(0.016, { keys: new Set(), joyState: { x: 0, y: 0, magnitude: 0 }, camYaw: Math.PI, camPitch: 0.16 });
      const r2 = w.enterStoneInspection({ id: 'site2_platform', position: { x: 142, z: 44 }, rotY: 0 });
      const act2 = w.stoneGazeState.activeStoneId;
      return {
        site2Entered: Boolean(r2),
        act2,
      };
    });
    await page.waitForTimeout(380);
    const site2PostWait = await page.evaluate(() => {
      const em = window.__WORLD__.enemyManager;
      const sx = 142.0;
      const sz = 44.0;
      const livingEnemies = (em.activeEnemies || []).filter((e) => e && !e.dead && e.hp > 0).length;
      const visibleDeadCorpsesNearStone = (em.activeEnemies || []).filter(
        (e) =>
          e &&
          e.dead &&
          e.char?.group?.visible &&
          Math.hypot((e.x ?? 0) - sx, (e.z ?? 0) - sz) <= 6.5
      ).length;
      const dmgPopCount = document.querySelectorAll('#amarante-damage-numbers-layer .am-dmg-pop').length;
      return {
        inspectActive: Boolean(window.__WORLD__.stoneGazeState.inspectActive),
        overlayActive: Boolean(document.getElementById('stone-inspect-exit-overlay')?.classList.contains('is-active')),
        groveInspectVis: Boolean(window.__WORLD__.stoneDecals.entries.stone_grove?.lodSets?.[0]?.inspectStoneMesh?.visible),
        activeEnemies: (em.activeEnemies || []).length,
        livingEnemies,
        visibleDeadCorpsesNearStone,
        dmgPopCount,
      };
    });
    canonicalInspectRes.site2Worked = Boolean(
      canonicalInspectRes.site2Entered &&
      site2PostWait.inspectActive &&
      site2PostWait.overlayActive &&
      site2PostWait.groveInspectVis &&
      site2PostWait.livingEnemies === 0 &&
      site2PostWait.visibleDeadCorpsesNearStone === 0 &&
      site2PostWait.dmgPopCount === 0
    );
    canonicalInspectRes.site2PostWait = site2PostWait;
    await page.screenshot({ path: path.join(OUT_DIR, 'site2-grove-inspect.png') });

    const canonicalInspect3Res = await page.evaluate(() => {
      const w = window.__WORLD__;
      w.exitStoneInspection();
      w.coopSystem.teleportLeaderAndPartner(-122.0, 87.2, 0.45);
      w.campaignLoop.checkStrongholdTriggers(w.coopSystem.heroStates.Knight, w.coopSystem.heroStates.Mage);
      for (const e of [...(w.enemyManager.activeEnemies || [])]) {
        w.enemyManager.applyHitToEnemy(e, { source: 'couples_ultimate', baseDmg: 99999 });
      }
      w.coopSystem.update(0.016, { keys: new Set(), joyState: { x: 0, y: 0, magnitude: 0 }, camYaw: 0.45, camPitch: 0.16 });
      const r3 = w.enterStoneInspection({ id: 'site3_wall', position: { x: -124, z: 84 }, rotY: 0.45 });
      const act3 = w.stoneGazeState.activeStoneId;
      return {
        site3Entered: Boolean(r3),
        act3,
      };
    });
    await page.waitForTimeout(380);
    const site3PostWait = await page.evaluate(() => ({
      inspectActive: Boolean(window.__WORLD__.stoneGazeState.inspectActive),
      overlayActive: Boolean(document.getElementById('stone-inspect-exit-overlay')?.classList.contains('is-active')),
      wallInspectVis: Boolean(window.__WORLD__.stoneDecals.entries.stone_pier?.lodSets?.[0]?.inspectStoneMesh?.visible),
    }));
    canonicalInspect3Res.site3Worked = Boolean(
      canonicalInspect3Res.site3Entered &&
      site3PostWait.inspectActive &&
      site3PostWait.overlayActive &&
      site3PostWait.wallInspectVis
    );
    canonicalInspect3Res.site3PostWait = site3PostWait;
    await page.screenshot({ path: path.join(OUT_DIR, 'site3-wall-inspect.png') });
    await page.evaluate(() => window.__WORLD__.exitStoneInspection());
    Object.assign(canonicalInspectRes, canonicalInspect3Res);

    const monumentsOk =
      !callsRuntimeWeld &&
      site1Active &&
      ['stone_plaza', 'stone_grove', 'stone_pier'].every((id) => {
        const m = monumentAudit.results[id];
        return (
          m &&
          m.hasInspectMesh &&
          m.hasNearMesh &&
          m.hasFarMesh &&
          m.inspectTris > m.nearTris &&
          m.nearTris > m.farTris &&
          m.poemClearanceOk
        );
      }) &&
      canonicalInspectRes.site2Worked &&
      canonicalInspectRes.site3Worked &&
      readBtnState.visible &&
      readBtnState.text !== 'G' &&
      readBtnState.width >= 48;

    recordCheck(
      '2 Monuments: pre-baked LODs (no runtime weld), poem outside stone on all 3 sites, canonical IDs, tablet Read button',
      monumentsOk,
      JSON.stringify({ callsRuntimeWeld, monumentAudit, canonicalInspectRes, readBtnState })
    );

    // -----------------------------------------------------------------------
    // 3. Site 3 Trees Shader Check (ZERO per-vertex < 2.2 gl_Position collapse)
    // -----------------------------------------------------------------------
    const treesSrc = fs.readFileSync(path.resolve(ROOT_DIR, 'world/assets/terrain/trees.js'), 'utf8');
    const hasPerVertexTreeCollapse = /if\s*\(\s*vViewDist\s*<\s*2\.2\s*\)\s*\{\s*gl_Position\s*=\s*vec4\(\s*0\.0\s*,\s*0\.0\s*,\s*2\.0/.test(treesSrc);

    // Move camera right next to Site 3 tree (-124, 84) and capture screenshot
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.enemyManager.clearAllEnemies();
      w.coopSystem.teleportLeaderAndPartner(-122.2, 87.8, 2.7);
      w.setCameraOrbit(2.6, 0.14, 5.2);
      w.post.render(0.016);
    });
    await page.waitForTimeout(160);
    await page.screenshot({ path: path.join(OUT_DIR, 'site3-close-tree-camera.png') });

    recordCheck(
      '3 Site 3 trees/wisteria have ZERO per-vertex vViewDist < 2.2 collapse (no giant green/purple beams)',
      !hasPerVertexTreeCollapse,
      `hasPerVertexTreeCollapse=${hasPerVertexTreeCollapse}`
    );

    // -----------------------------------------------------------------------
    // 4. Zero Premature `victory_dawn` Modal at Site 1 or with ?nolobby=1
    // -----------------------------------------------------------------------
    const victoryRes = await page.evaluate(() => {
      const w = window.__WORLD__;
      const initMask = w.coopClient.getProgressionState().stonesSolvedMask;
      w.coopSystem.teleportLeaderAndPartner(0.0, 2.5, Math.PI);
      w.setCameraOrbit(Math.PI, 0.2, 8.0);
      // Trigger stronghold triggers then clear enemies just like combat clearance / test script
      w.campaignLoop.checkStrongholdTriggers(w.coopSystem.heroStates.Knight, w.coopSystem.heroStates.Mage);
      w.enemyManager.clearAllEnemies();
      w.campaignLoop.update(0.016, {
        heroStates: w.coopSystem.heroStates,
        activeHeroId: 'Knight',
        soloWingmanActive: false,
      });
      const actAfterSite1Clear = w.campaignLoop.currentActId;
      const victoryVisible = document.getElementById('victory-modal')?.classList.contains('visible') || false;
      return { initMask, actAfterSite1Clear, victoryVisible };
    });

    const pass4 =
      victoryRes.initMask === 0 &&
      victoryRes.actAfterSite1Clear !== 'victory_dawn' &&
      !victoryRes.victoryVisible;
    recordCheck(
      '4 Zero premature victory_dawn modal in ?nolobby=1 or after Site 1 plaza combat clear',
      pass4,
      JSON.stringify(victoryRes)
    );

    // -----------------------------------------------------------------------
    // 5. Co-Op Room Code Visible In-Game & Inside Pause Modal
    // -----------------------------------------------------------------------
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.coopClient.setRoomCode('Rain on warm limestone');
    });
    await page.waitForTimeout(120);

    const roomHudVis = await page.evaluate(() => {
      const root = document.getElementById('sculpted-hud-root');
      const badge = root?.querySelector('#sculpted-room-badge, [data-room-badge]');
      const r = badge?.getBoundingClientRect?.() || { width: 0, height: 0 };
      const st = badge ? getComputedStyle(badge) : null;
      return {
        found: Boolean(badge),
        display: st?.display || null,
        width: Math.round(r.width),
        height: Math.round(r.height),
        text: badge?.textContent?.trim() || '',
      };
    });

    await page.click('#sculpted-pause-btn');
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(OUT_DIR, 'tablet-pause-modal.png') });
    const roomPauseVis = await page.evaluate(() => {
      const modal = document.getElementById('sculpted-pause-modal');
      const cardText = modal?.textContent || '';
      const copyBtn = modal?.querySelector('#sculpted-pause-copy-room-btn, [data-copy-room]');
      return {
        modalOpen: modal?.classList.contains('is-open') || false,
        hasPhraseOrCode:
          /rain on warm limestone/i.test(cardText) || /RAIN-ON-WARM-LIMESTONE/.test(cardText),
        hasCopyBtn: Boolean(copyBtn),
      };
    });
    await page.click('#sculpted-pause-resume-btn');
    await page.waitForTimeout(100);

    const pass5 =
      roomHudVis.found &&
      roomHudVis.display !== 'none' &&
      roomHudVis.width > 40 &&
      roomHudVis.height > 18 &&
      (/rain on warm limestone/i.test(roomHudVis.text) || /RAIN-ON-WARM-LIMESTONE/.test(roomHudVis.text)) &&
      roomPauseVis.hasPhraseOrCode &&
      roomPauseVis.hasCopyBtn;
    recordCheck(
      '5 Co-Op Room Code/Phrase visible in-game AND inside Pause modal with copy button',
      pass5,
      JSON.stringify({ roomHudVis, roomPauseVis })
    );

    // -----------------------------------------------------------------------
    // 6. Tablet `.sh-keycap-badge` Strictly Hidden at 1180x787 & 1440x960
    // -----------------------------------------------------------------------
    const checkBadgesAt = async (wPx, hPx) => {
      await page.setViewportSize({ width: wPx, height: hPx });
      await page.waitForTimeout(100);
      return page.evaluate(() => {
        const root = document.getElementById('sculpted-hud-root');
        const badges = [...(root?.querySelectorAll('.sh-keycap-badge') || [])];
        const visibleBadges = badges
          .filter((el) => {
            const st = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return st.display !== 'none' && (r.width > 0 || r.height > 0);
          })
          .map((el) => el.textContent.trim());
        return { totalBadges: badges.length, visibleBadges };
      });
    };
    const b1180 = await checkBadgesAt(1180, 787);
    const b1440 = await checkBadgesAt(1440, 960);
    await page.setViewportSize({ width: 1180, height: 787 });
    const pass6 =
      b1180.totalBadges > 0 &&
      b1180.visibleBadges.length === 0 &&
      b1440.visibleBadges.length === 0;
    recordCheck(
      '6 Tablet profile hides ALL .sh-keycap-badge labels at 1180x787 and 1440x960',
      pass6,
      JSON.stringify({ b1180, b1440 })
    );

    // -----------------------------------------------------------------------
    // 7. Mage Touch Sights: Hold [E] & Hold [Attack] Shatterlance Aim Cleanly
    // -----------------------------------------------------------------------
    const mageTouchRes = await (async () => {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        if (w.player.activeHeroId !== 'Mage') w.coopSystem.swapActiveHero();
        const upd = w.coopClient.progression.setUnlocks({
          communeDiscovered: true,
          iceUnlocked: true,
          fireUnlocked: true,
          ultimateUnlocked: true,
          unlockedStage: 3,
          stone1Solved: false,
          stone2Solved: false,
          stone3Solved: false,
          stonesSolvedMask: 0,
        });
        w.coopSystem.setUnlockedStage?.(3);
        w.coopSystem.campaignLoop?.setUnlockedStage?.(3, 0);
        w.sculptedHud.setProgressionState(upd);
        w.sculptedHud.setElement('fire'); // Test Cinder Fall reticle positioning 3..16m!
        w.campaignLoop.combatHeroes.Mage.selectedElement = 'fire';
        w.campaignLoop.combatHeroes.Mage.selectedSpell = 'cinder_fall';
        w.campaignLoop.combatHeroes.Mage.skillCd = 0;
        w.campaignLoop.combatHeroes.Mage.spellCooldowns.cinder_fall = 0;
        w.campaignLoop.combatHeroes.Mage.spellCooldowns.shatterlance = 0;
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(0.0, 40.0, 0.0);
        w.setCameraOrbit(0.0, 0.25, 8.4);
      });
      await page.waitForTimeout(120);

      // Test Hold [E] + Drag Up/Right without moving mouse out of screen: verify zero runaway camera spin
      const holdERes = await page.evaluate(async () => {
        const w = window.__WORLD__;
        const btn = document.getElementById('sculpted-slot-e');
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        const startYaw = w.camState.yaw;

        const mk = (type, x, y) =>
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 777,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            button: type === 'pointerdown' || type === 'pointerup' ? 0 : -1,
            buttons: type === 'pointerup' ? 0 : 1,
          });
        btn.dispatchEvent(mk('pointerdown', cx, cy));
        await new Promise((r) => setTimeout(r, 40));
        // Drag 90px up and 45px left (away from E)
        for (let i = 1; i <= 5; i++) {
          btn.dispatchEvent(mk('pointermove', cx - i * 9, cy - i * 18));
          await new Promise((r) => setTimeout(r, 20));
        }
        const duringHold = {
          active: w.coopSystem.actionAim.aimState.active,
          spellId: w.coopSystem.actionAim.aimState.spellId,
          lockState: w.coopSystem.actionAim.aimState.lockState,
          aimYaw: Number(w.coopSystem.actionAim.aimState.yaw.toFixed(3)),
          aimDist: Number(w.coopSystem.actionAim.aimState.distance.toFixed(2)),
          arrowVisible: Boolean(w.coopSystem.vfxKit?.aimArrow?.group?.visible),
          camYawDrift: Number(Math.abs(w.camState.yaw - startYaw).toFixed(4)),
        };
        // Drag back onto button to verify cancel detection
        btn.dispatchEvent(mk('pointermove', cx + 2, cy + 2));
        await new Promise((r) => setTimeout(r, 25));
        const cancelLockState = w.coopSystem.actionAim.aimState.lockState;
        btn.dispatchEvent(mk('pointerup', cx + 2, cy + 2));
        await new Promise((r) => setTimeout(r, 40));
        const cdAfterCancel = w.campaignLoop.combatHeroes.Mage.skillCd;

        // Now repeat and release away from button -> wait past Cinder Fall releaseTime (0.48s) -> should cast!
        btn.dispatchEvent(mk('pointerdown', cx, cy));
        await new Promise((r) => setTimeout(r, 40));
        btn.dispatchEvent(mk('pointermove', cx, cy - 110));
        await new Promise((r) => setTimeout(r, 40));
        btn.dispatchEvent(mk('pointerup', cx, cy - 110));
        await new Promise((r) => setTimeout(r, 750));
        const cdAfterCast = w.campaignLoop.combatHeroes.Mage.skillCd;

        return {
          duringHold,
          cancelLockState,
          cdAfterCancel: Number(cdAfterCancel.toFixed(2)),
          cdAfterCast: Number(cdAfterCast.toFixed(2)),
        };
      });

      // Test Hold [Attack] -> Shatterlance aim on tablet
      const holdAtkRes = await page.evaluate(async () => {
        const w = window.__WORLD__;
        const btn = document.getElementById('sculpted-attack-btn');
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        const startYaw = w.camState.yaw;

        const mk = (type, x, y) =>
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 778,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            button: type === 'pointerdown' || type === 'pointerup' ? 0 : -1,
            buttons: type === 'pointerup' ? 0 : 1,
          });
        btn.dispatchEvent(mk('pointerdown', cx, cy));
        await new Promise((r) => setTimeout(r, 220));
        btn.dispatchEvent(mk('pointermove', cx + 35, cy - 45));
        await new Promise((r) => setTimeout(r, 40));
        const duringShatter = {
          active: w.coopSystem.actionAim.aimState.active,
          spellId: w.coopSystem.actionAim.aimState.spellId,
          arrowVisible: Boolean(w.coopSystem.vfxKit?.aimArrow?.group?.visible),
          camYawDelta: Number(Math.abs(w.camState.yaw - startYaw).toFixed(3)),
        };
        btn.dispatchEvent(mk('pointerup', cx + 35, cy - 45));
        await new Promise((r) => setTimeout(r, 120));
        return {
          duringShatter,
          activeAfterRelease: w.coopSystem.actionAim.aimState.active,
        };
      });

      return { holdERes, holdAtkRes };
    })();

    const pass7 =
      mageTouchRes.holdERes.duringHold.active &&
      mageTouchRes.holdERes.duringHold.arrowVisible &&
      mageTouchRes.holdERes.duringHold.camYawDrift < 0.05 &&
      mageTouchRes.holdERes.cancelLockState === 'cancel' &&
      mageTouchRes.holdERes.cdAfterCancel <= 0.1 &&
      mageTouchRes.holdERes.cdAfterCast > 1.0 &&
      mageTouchRes.holdAtkRes.duringShatter.active &&
      mageTouchRes.holdAtkRes.duringShatter.spellId === 'shatterlance' &&
      mageTouchRes.holdAtkRes.duringShatter.arrowVisible;
    recordCheck(
      '7 Mage touch sights: Hold E aims cleanly with reticle (zero cam spin + cancel zone) & Hold Attack Shatterlance aims cleanly',
      pass7,
      JSON.stringify(mageTouchRes)
    );

    await context.close();

    // =======================================================================
    // CONTEXT B: Full Opening Flow -> Flower Lobby Zero Red Hit-Flash
    // =======================================================================
    const lobbyCtx = await browser.newContext({
      viewport: { width: 1180, height: 787 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    await lobbyCtx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' })
    );
    const lobbyPage = await lobbyCtx.newPage();
    await lobbyPage.goto(`${baseUrl}?step=lobby&profile=tablet`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await waitForWorldReady(lobbyPage);
    await lobbyPage.waitForTimeout(300);

    const lobbyRes = await lobbyPage.evaluate(() => {
      const w = window.__WORLD__;
      // Even if a prior hit flash occurred before stepping into lobby, entering lobby must clear it
      w.coopSystem.heroStates.Knight.hitFlashTimer = 0.15;
      w.coopSystem.heroStates.Mage.hitFlashTimer = 0.15;
      w.appFlow.setStep(w.appFlow.FLOW_STEPS.FLOWER_LOBBY);
      const phraseEl = document.getElementById('app-flow-room-phrase');
      const copyEl = document.getElementById('app-flow-copy-btn');
      const barEl = document.getElementById('app-flow-lobby-top-bar');
      const pr = phraseEl?.getBoundingClientRect?.() || { width: 0, height: 0, top: 0, bottom: 0 };
      const cr = copyEl?.getBoundingClientRect?.() || { width: 0, height: 0, top: 0, bottom: 0 };
      const br = barEl?.getBoundingClientRect?.() || { width: 0, height: 0, top: 0, bottom: 0 };
      return {
        step: w.appFlow.getStep(),
        knightFlash: w.coopSystem.heroStates.Knight.hitFlashTimer,
        mageFlash: w.coopSystem.heroStates.Mage.hitFlashTimer,
        activeEnemies: w.enemyManager.activeEnemies.length,
        roomPhraseText: phraseEl?.textContent?.trim() || '',
        phraseRect: { w: Math.round(pr.width), h: Math.round(pr.height), top: Math.round(pr.top), bottom: Math.round(pr.bottom) },
        copyRect: { w: Math.round(cr.width), h: Math.round(cr.height), top: Math.round(cr.top), bottom: Math.round(cr.bottom) },
        barRect: { w: Math.round(br.width), h: Math.round(br.height), top: Math.round(br.top), bottom: Math.round(br.bottom) },
        vh: window.innerHeight,
      };
    });
    await lobbyPage.screenshot({ path: path.join(OUT_DIR, 'tablet-flower-lobby.png') });

    const pass8 =
      lobbyRes.step === 'flower_lobby' &&
      lobbyRes.knightFlash <= 0 &&
      lobbyRes.mageFlash <= 0 &&
      lobbyRes.activeEnemies === 0 &&
      lobbyRes.roomPhraseText.length >= 4 &&
      lobbyRes.phraseRect.h >= 16 &&
      lobbyRes.phraseRect.w >= 40 &&
      lobbyRes.copyRect.w >= 24 &&
      lobbyRes.barRect.top >= 0 &&
      lobbyRes.barRect.bottom <= lobbyRes.vh;
    recordCheck(
      '8 Flower Lobby clears residual hit-flash, spawns zero enemies, and keeps Room Phrase + Copy visible in viewport',
      pass8,
      JSON.stringify(lobbyRes)
    );
    await lobbyCtx.close();

    // =======================================================================
    // CONTEXT C: Auto-Detect Large Tablet (1440x960, NO ?profile=tablet) + First-Touch Orbit
    // =======================================================================
    const autoTabletCtx = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      // Simulate modern Android Tablet Chrome reduced/desktop-like UA where Mobile/Tablet tokens may be absent
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    });
    await autoTabletCtx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' })
    );
    const autoTabPage = await autoTabletCtx.newPage();
    autoTabPage.on('pageerror', (e) => {
      if (!isBenignError(e.message)) pageErrors.push(`ContextC: ${e.message}`);
    });
    await autoTabPage.goto(`${baseUrl}?nolobby=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await waitForWorldReady(autoTabPage);
    await autoTabPage.evaluate(() => {
      const w = window.__WORLD__;
      w.appFlow?.resolvePixelVeil?.();
      w.enemyManager?.clearAllEnemies?.();
      w.setCameraOrbit(0.0, 0.30, 8.4);
    });
    await autoTabPage.waitForTimeout(120);
    const bootProfileState = await autoTabPage.evaluate(() => ({
      activeProfile: window.__WORLD__.activeProfile,
      hudProfile: window.__WORLD__.sculptedHud?.getState?.()?.profile || null,
      orbitZoneDisplay: getComputedStyle(document.getElementById('sculpted-orbit-zone')).display,
    }));
    const cdpTab = await autoTabletCtx.newCDPSession(autoTabPage);
    // VERY FIRST touch on screen must orbit camera smoothly across 1440px width!
    await dispatchRealTouchDrag(cdpTab, 1140, 440, 900, 440, 140, 6);
    const firstTouchYaw = await autoTabPage.evaluate(() =>
      Number(Math.abs(window.__WORLD__.camState.yaw).toFixed(3))
    );
    const pass1D =
      bootProfileState.activeProfile === 'tablet' &&
      bootProfileState.hudProfile === 'tablet' &&
      bootProfileState.orbitZoneDisplay !== 'none' &&
      firstTouchYaw >= 1.1;
    recordCheck(
      '1D Auto-detects 1440x960 coarse-touch tablet WITHOUT ?profile=tablet & first touch orbits cleanly',
      pass1D,
      JSON.stringify({ bootProfileState, firstTouchYaw })
    );
    await autoTabletCtx.close();

    recordCheck(
      '9 Zero page or console errors across entire tablet session',
      pageErrors.length === 0 && consoleErrors.length === 0,
      JSON.stringify({ pageErrors, consoleErrors })
    );
  } finally {
    await browser.close();
    srv.server?.closeAllConnections?.();
    await new Promise((r) => {
      srv.server?.close?.(r);
      setTimeout(r, 250);
    });
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nSUMMARY: ${passed} PASSED, ${failed} FAILED (${results.length} total)`);
  if (failed > 0) process.exit(1);
}

runSuite().catch((err) => {
  console.error('TDD suite fatal error:', err);
  process.exit(1);
});
