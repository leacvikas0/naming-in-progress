import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const ARTIFACT_DIR =
  'C:/Users/silen/.gemini/antigravity-acp/t3-home/antigravity-acp/brain/e39b278d-719d-449a-b967-6871339ef3b0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlObj = new URL(req.url, 'http://127.0.0.1');
      if (urlObj.pathname === '/api/altar') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, stage: 1 }));
        return;
      }
      const relPath = decodeURIComponent(urlObj.pathname).replace(/^\/+/, '');
      const fullPath = path.resolve(REPO_ROOT, relPath);
      if (!fullPath.startsWith(REPO_ROOT) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(fullPath).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => {
      resolve({ server: srv, port: srv.address().port });
    });
  });
}

const { server, port } = await startStaticServer();
const URL_STR = `http://127.0.0.1:${port}/world/index.html?maskSpoilers=1`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(URL_STR, { waitUntil: 'networkidle', timeout: 60000 });

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
    return meshCount >= 3;
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

// 1. Site 1 — Village Well at (0, 0) in Daylight
await page.evaluate(() => {
  const w = window.__WORLD__;
  w.exitStoneInspection?.();
  w.setTimeOfDay?.('day');
  w.coopSystem.teleportLeaderAndPartner(0.0, 3.2, Math.PI);
  w.camState.mode = 'player';
  w.camState.yaw = Math.PI;
  w.camState.pitch = 0.12;
  w.enterStoneInspection?.({
    id: 'stone_plaza',
    siteKey: 'well',
    position: { x: 0.0, y: 0.0, z: 0.0 },
  });
  w.stoneGazeState.inspectBlend = 1.0;
});
await page.waitForTimeout(450);
const site1DayPath = path.join(ARTIFACT_DIR, 'integrated-site1-well-day.png');
await page.screenshot({ path: site1DayPath });
console.log('Saved:', site1DayPath);

// 2. Site 2 — Grove Circular Platform at (44, 16) in Daylight
await page.evaluate(() => {
  const w = window.__WORLD__;
  w.exitStoneInspection?.();
  w.setTimeOfDay?.('day');
  w.coopSystem.teleportLeaderAndPartner(44.0, 19.2, Math.PI);
  w.camState.mode = 'player';
  w.camState.yaw = Math.PI;
  w.camState.pitch = 0.18;
  w.enterStoneInspection?.({
    id: 'stone_grove',
    siteKey: 'grove',
    position: { x: 44.0, y: 0.42, z: 16.0 },
  });
  w.stoneGazeState.inspectBlend = 1.0;
});
await page.waitForTimeout(450);
const site2DayPath = path.join(ARTIFACT_DIR, 'integrated-site2-platform-day.png');
await page.screenshot({ path: site2DayPath });
console.log('Saved:', site2DayPath);

// 3. Site 3 — Secluded Ornamental Wall at (-21.6, 20.4, rotY = 0.45) in Daylight
await page.evaluate(() => {
  const w = window.__WORLD__;
  w.exitStoneInspection?.();
  w.setTimeOfDay?.('day');
  w.coopSystem.teleportLeaderAndPartner(-19.8, 23.6, Math.PI + 0.45);
  w.camState.mode = 'player';
  w.camState.yaw = Math.PI + 0.45;
  w.camState.pitch = 0.12;
  w.enterStoneInspection?.({
    id: 'stone_pier',
    siteKey: 'cottage_wall',
    rotY: 0.45,
    position: { x: -21.6, y: 0.0, z: 20.4 },
  });
  w.stoneGazeState.inspectBlend = 1.0;
});
await page.waitForTimeout(450);
const site3DayPath = path.join(ARTIFACT_DIR, 'integrated-site3-wall-day.png');
await page.screenshot({ path: site3DayPath });
console.log('Saved:', site3DayPath);

// 4. Site 1 — Village Well at (0, 0) at Starlit Night (proving night moonlight shading!)
await page.evaluate(() => {
  const w = window.__WORLD__;
  w.exitStoneInspection?.();
  w.setTimeOfDay?.('night');
  w.coopSystem.teleportLeaderAndPartner(0.0, 3.2, Math.PI);
  w.camState.mode = 'player';
  w.camState.yaw = Math.PI;
  w.camState.pitch = 0.12;
  w.enterStoneInspection?.({
    id: 'stone_plaza',
    siteKey: 'well',
    position: { x: 0.0, y: 0.0, z: 0.0 },
  });
  w.stoneGazeState.inspectBlend = 1.0;
});
await page.waitForTimeout(450);
const site1NightPath = path.join(ARTIFACT_DIR, 'integrated-site1-well-night.png');
await page.screenshot({ path: site1NightPath });
console.log('Saved:', site1NightPath);

await browser.close();
server.close();
