import path from 'node:path';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const ARTIFACT_DIR =
  'C:/Users/silen/.gemini/antigravity-acp/t3-home/antigravity-acp/brain/e39b278d-719d-449a-b967-6871339ef3b0';
const URL = 'http://127.0.0.1:4179/world/index.html?maskSpoilers=1';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

await page.waitForFunction(
  () => {
    const w = window.__WORLD__;
    if (!w || !w.ready || !w.scene) return false;
    const grp = w.scene.getObjectByName('sacredStoneCalligraphyDecalsGroup');
    if (!grp) return false;
    let meshCount = 0;
    grp.traverse((o) => {
      if (o.isMesh) meshCount++;
    });
    return meshCount >= 4;
  },
  null,
  { timeout: 45000 }
);

await page.evaluate(() => {
  const w = window.__WORLD__;
  w.appFlow?.enterGame?.();
  w.setTimeOfDay?.('day');
  const hideIds = ['sanctuary-lobby', 'debug-dev-pill'];
  for (const id of hideIds) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});

// 1. Capture Player Approaching the Stone with the World-Projected "Read Carved Stone [G]" Button visible!
await page.evaluate(() => {
  const w = window.__WORLD__;
  w.exitStoneInspection?.();
  w.camState.mode = 'player';
  w.coopSystem.teleportLeaderAndPartner(-19.8, 23.6, Math.PI + 0.45);
  w.camState.yaw = Math.PI + 0.45;
  w.camState.pitch = 0.12;
  w.camState.dist = 6.8;
});
await page.waitForTimeout(450);
const promptShotPath = path.join(ARTIFACT_DIR, 'stone-read-button-prompt.png');
await page.screenshot({ path: promptShotPath });
console.log('Saved:', promptShotPath);

// 2. Click the "#stone-world-read-btn" to trigger the Camera Glide into Site 3 (Hidden Lovers Wall)
await page.click('#stone-world-read-btn');
await page.waitForTimeout(650);
const site3Path = path.join(ARTIFACT_DIR, 'site3-hidden-lovers-wall-3d.png');
await page.screenshot({ path: site3Path });
console.log('Saved:', site3Path);

// 3. Tap Anywhere on the Exit Overlay to verify it exits back to player camera
await page.click('#stone-inspect-exit-overlay');
await page.waitForTimeout(350);

// 4. Teleport to Site 1 (Village Well (0, 0)), click Read Carved Stone, and capture Inspection View
await page.evaluate(() => {
  const w = window.__WORLD__;
  w.coopSystem.teleportLeaderAndPartner(0.0, 3.2, Math.PI);
  w.camState.yaw = Math.PI;
  w.camState.pitch = 0.12;
});
await page.waitForTimeout(350);
await page.click('#stone-world-read-btn');
await page.waitForTimeout(650);
const site1Path = path.join(ARTIFACT_DIR, 'site1-village-well-3d-carving.png');
await page.screenshot({ path: site1Path });
console.log('Saved:', site1Path);

// 5. Exit & Teleport to Site 2 (Whispering Grove (44, 16)), click Read Carved Stone, and capture Inspection View
await page.click('#stone-inspect-exit-overlay');
await page.waitForTimeout(350);
await page.evaluate(() => {
  const w = window.__WORLD__;
  w.coopSystem.teleportLeaderAndPartner(44.0, 19.2, Math.PI);
  w.camState.yaw = Math.PI;
  w.camState.pitch = 0.18;
});
await page.waitForTimeout(350);
await page.click('#stone-world-read-btn');
await page.waitForTimeout(650);
const site2Path = path.join(ARTIFACT_DIR, 'site2-grove-floor-medallion-3d.png');
await page.screenshot({ path: site2Path });
console.log('Saved:', site2Path);

await browser.close();
