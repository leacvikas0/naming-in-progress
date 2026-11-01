// ============================================================================
// world/tools/shoot-stage5-gameplay.mjs
//
// Ephemeral-port Playwright verification & screenshot runner for the 8
// deterministic Stage 5 Gameplay, Opaque VFX, Sword Breathing & UI Plates:
//   01-desktop-act1-sunfire-slash.png         (1600x900 Desktop)
//   02-desktop-shatterlance-railgun.png       (1600x900 Desktop)
//   03-desktop-cinder-fall-meteor.png         (1600x900 Desktop)
//   04-desktop-storm-lance-fulgurite.png      (1600x900 Desktop)
//   05-tablet-pad7-touch-combat.png           (1440x960 3:2 Xiaomi Pad 7 Tablet)
//   06-sunset-pier-sanctuary-interlude.png    (1600x900 Desktop)
//   07-dusk-hamlet-plaza-defense.png          (1600x900 Desktop)
//   08-night-shrine-hollow-sovereign-boss.png (1600x900 Desktop)
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const toolsDir = import.meta.dirname;
const worldDir = path.resolve(toolsDir, '..');
const repoRoot = path.resolve(worldDir, '..');
const outDir = path.join(worldDir, 'shots', 'stage5-gameplay');
fs.mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  let filePath = path.join(repoRoot, urlPath === '/' ? 'world/index.html' : urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found: ' + urlPath);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/world/index.html?room=LOVE`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(err.message || String(err)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
  null,
  { timeout: 30000 }
);
await page.waitForTimeout(300);

const gameplayShotIds = [
  '01-desktop-act1-sunfire-slash',
  '02-desktop-shatterlance-railgun',
  '03-desktop-cinder-fall-meteor',
  '04-desktop-storm-lance-fulgurite',
  '05-tablet-pad7-touch-combat',
  '06-sunset-pier-sanctuary-interlude',
  '07-dusk-hamlet-plaza-defense',
  '08-night-shrine-hollow-sovereign-boss',
];

const report = {
  suite: 'stage5-gameplay',
  timestamp: new Date().toISOString(),
  consoleErrors,
  shots: {},
};

for (const shotId of gameplayShotIds) {
  const viewport =
    shotId === '05-tablet-pad7-touch-combat'
      ? { width: 1440, height: 960 }
      : { width: 1600, height: 900 };

  await page.setViewportSize(viewport);
  await page.waitForTimeout(60);

  const shotMeta = await page.evaluate((id) => {
    window.__WORLD__.toggleHud(true);
    window.__WORLD__.setGameplayShot(id);
    window.__WORLD__.measurePerformance(16);
    const stats = window.__WORLD__.getStats();
    const touchHudVisible = document
      .getElementById('touch-hud-layer')
      ?.classList.contains('visible');
    const bossBarVisible = document
      .getElementById('boss-hud-bar')
      ?.classList.contains('visible');
    return {
      ...stats,
      touchHudVisible: Boolean(touchHudVisible),
      bossBarVisible: Boolean(bossBarVisible),
      activeEnemies: window.__WORLD__.enemyManager.activeEnemies.length,
      groundIndicators: window.__WORLD__.campaignLoop.groundIndicatorMesh.count,
      crestAndTetherInstances: window.__WORLD__.campaignLoop.crestAndTetherMesh.count,
    };
  }, shotId);

  await page.waitForTimeout(160);
  const filePath = path.join(outDir, `${shotId}.png`);
  await page.screenshot({ path: filePath });

  report.shots[shotId] = {
    file: filePath,
    viewport,
    ...shotMeta,
  };
  console.log(`Captured ${shotId} -> ${filePath}`, JSON.stringify(shotMeta));
}

const allShots = Object.values(report.shots);
report.summary = {
  totalShots: allShots.length,
  maxCombatSceneDraws: Math.max(...allShots.map((s) => s.draws)),
  minCombatSceneDraws: Math.min(...allShots.map((s) => s.draws)),
  tabletShotDraws: report.shots['05-tablet-pad7-touch-combat']?.draws || 0,
  tabletTouchHudVisible: Boolean(report.shots['05-tablet-pad7-touch-combat']?.touchHudVisible),
  bossBarVisibleInAct3: Boolean(report.shots['08-night-shrine-hollow-sovereign-boss']?.bossBarVisible),
  consoleErrorCount: consoleErrors.length,
  passesAllChecks:
    consoleErrors.length === 0 &&
    Boolean(report.shots['05-tablet-pad7-touch-combat']?.touchHudVisible) &&
    Boolean(report.shots['08-night-shrine-hollow-sovereign-boss']?.bossBarVisible),
};

const reportPath = path.join(outDir, 'report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log('Saved Stage 5 gameplay report ->', reportPath, JSON.stringify(report.summary, null, 2));

await browser.close();
server.close();

if (!report.summary.passesAllChecks) {
  console.error('Stage 5 gameplay check failed:', report.summary);
  process.exit(1);
}
