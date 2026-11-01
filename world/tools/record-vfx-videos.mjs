// ============================================================================
// world/tools/record-vfx-videos.mjs
//
// Native Video Capture Harness for Stage 4 & 5 Combat, VFX & Animation Feel.
// Launches the live Haru-machi world in Playwright with `recordVideo`,
// paces simulation delta via `window.__FIXED_DT__ = 0.022` so headless
// SwiftShader never skips fast 0.25s sword-swing frames, positions the camera
// at crystal-clear 3/4 side-front angles via `setCameraOrbit`, and saves
// `.webm` videos into `world/shots/videos/` for 5-8 FPS video inspection.
// ============================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { startServer } from './serve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORLD_DIR = path.resolve(__dirname, '..');
const VIDEO_OUT_DIR = path.join(WORLD_DIR, 'shots', 'videos');

async function recordSequence(browser, baseUrl, name, scriptFn) {
  const tmpDir = path.join(VIDEO_OUT_DIR, `_tmp_${name}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: tmpDir,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message || String(err)));

  await page.goto(`${baseUrl}/world/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(200);

  await scriptFn(page);

  const video = page.video();
  await page.close();
  await context.close();

  const rawVideoPath = await video.path();
  const finalPath = path.join(VIDEO_OUT_DIR, `${name}.webm`);
  await fs.copyFile(rawVideoPath, finalPath);
  await fs.rm(tmpDir, { recursive: true, force: true });

  const stat = await fs.stat(finalPath);
  console.log(
    `[VIDEO RECORDED] ${name}.webm (${(stat.size / 1024).toFixed(1)} KB, errors=${consoleErrors.length}) -> ${finalPath}`
  );
  return { name, path: finalPath, bytes: stat.size, consoleErrors };
}

async function main() {
  await fs.mkdir(VIDEO_OUT_DIR, { recursive: true });

  const { server, port } = await startServer(0, { openBrowser: false });
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  try {
    // -----------------------------------------------------------------------
    // Video 1: Knight 4-Hit KayKit Sword Combo + 360° Spin Heavy Finisher
    //          (Live Bone-Tracked Hinokami Sunfire & Glacial Tide Ribbon,
    //           Zero Ground Garbage on Swings, Smooth Spring Camera Punch)
    // -----------------------------------------------------------------------
    await recordSequence(browser, baseUrl, '01-knight-sword-combos', async (page) => {
      await page.evaluate(() => {
        window.__FIXED_DT__ = 0.020;
        const w = window.__WORLD__;
        w.setTimeOfDay('day');
        w.coopSystem.teleportLeaderAndPartner(2.0, 12.0, Math.PI * 0.5);
        w.coopSystem.enemyManager.clearAllEnemies();
        w.coopSystem.campaignLoop.setKnightBreathing('solar', 20.0);
        // 3/4 side-shoulder camera looking across the Knight (+X facing) from SE
        w.setCameraOrbit(Math.PI * 0.28, 0.16, 6.2);
      });
      await page.waitForTimeout(250);

      // Trigger Combo 1 (Horizontal Slice) -> Combo 2 (Diagonal Slice) -> Combo 3 (Overhead Chop) -> Combo 4 (Jump Chop)
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        await page.waitForTimeout(820);
      }
      // Switch to Glacial Tide and trigger Heavy 360° Spin Finisher ('heavy')
      await page.evaluate(() => {
        window.__WORLD__.coopSystem.campaignLoop.setKnightBreathing('rime', 20.0);
        window.__WORLD__.coopSystem.triggerAction('heavy');
      });
      await page.waitForTimeout(1200);
    });

    // -----------------------------------------------------------------------
    // Video 2: Mage 3-Hit Normal Attack Projectile Combo + Heavy Nova Orb
    // -----------------------------------------------------------------------
    await recordSequence(browser, baseUrl, '02-mage-normal-bolts', async (page) => {
      await page.evaluate(() => {
        window.__FIXED_DT__ = 0.022;
        const w = window.__WORLD__;
        w.setTimeOfDay('day');
        if (w.coopSystem.player.activeHeroId !== 'Mage') {
          w.coopSystem.swapActiveHero();
        }
        w.coopSystem.teleportLeaderAndPartner(2.0, 12.0, Math.PI * 0.5);
        w.coopSystem.enemyManager.clearAllEnemies();
        w.setCameraOrbit(Math.PI * 0.34, 0.15, 6.8);
      });
      await page.waitForTimeout(250);

      // Fire Hit 1 (Single Starlight Bolt) -> Hit 2 (Twin Helix Bolts) -> Hit 3 (3-Bolt Converging Fan)
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        await page.waitForTimeout(760);
      }
      // Fire Heavy Charged Starlight Nova Orb
      await page.evaluate(() => window.__WORLD__.coopSystem.triggerAction('heavy'));
      await page.waitForTimeout(1300);
    });

    // -----------------------------------------------------------------------
    // Video 3: Cinder Fall Full Lifecycle (Lob -> Shatter Into Bouncing Chunks
    //          -> Cooling Magma Veins -> Ash Crumble Dissolve, Zero Shrinking!)
    // -----------------------------------------------------------------------
    await recordSequence(browser, baseUrl, '03-cinder-fall-lifecycle', async (page) => {
      await page.evaluate(() => {
        window.__FIXED_DT__ = 0.025;
        const w = window.__WORLD__;
        w.setTimeOfDay('day');
        w.coopSystem.enemyManager.clearAllEnemies();
        w.coopSystem.enemyManager.setFrozenForShot(null);
        w.coopSystem.teleportLeaderAndPartner(56.0, -4.0, Math.PI * 0.5);
        w.camState.mode = 'vista';
        w.camState.vistaPos.set(61.5, 4.8, 7.2);
        w.camState.vistaTarget.set(67.2, 1.4, -4.0);
        w.coopSystem.vfxKit.cinderFall.cast(
          { x: 56.8, y: 0.6, z: -4.0 },
          { x: 1, y: 0, z: 0 },
          { range: 13.5 }
        );
      });
      await page.waitForTimeout(4800);
    });

    // -----------------------------------------------------------------------
    // Video 4: Storm Lance (Fast Strike, 24Hz Strobe, Gap Snap-Off & Fulgurite
    //          Fracture) + Shatterlance (Convergence, Railgun & Sublimation)
    // -----------------------------------------------------------------------
    await recordSequence(browser, baseUrl, '04-storm-and-shatterlance', async (page) => {
      await page.evaluate(() => {
        window.__FIXED_DT__ = 0.025;
        const w = window.__WORLD__;
        w.setTimeOfDay('evening');
        w.coopSystem.enemyManager.clearAllEnemies();
        w.coopSystem.enemyManager.setFrozenForShot(null);
        w.coopSystem.teleportLeaderAndPartner(56.0, -4.0, Math.PI * 0.5);
        w.camState.mode = 'vista';
        w.camState.vistaPos.set(61.5, 4.5, 6.8);
        w.camState.vistaTarget.set(67.0, 1.4, -4.0);
        w.coopSystem.vfxKit.stormLance.cast(
          { x: 56.8, y: 0.6, z: -4.0 },
          { x: 1, y: 0, z: 0 },
          { range: 13.5 }
        );
      });
      await page.waitForTimeout(2400);

      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.setTimeOfDay('day');
        w.coopSystem.vfxKit.shatterlance.cast(
          { x: 56.8, y: 0.6, z: -4.0 },
          { x: 1, y: 0, z: 0 },
          { range: 13.5 }
        );
      });
      await page.waitForTimeout(3400);
    });
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
