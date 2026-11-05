// ============================================================================
// world/tools/shoot-world.mjs
//
// Ephemeral-port Playwright verification & screenshot runner for the assembled
// Haru-machi Stage 2 World (Terrain + Houses + Toroidal Meadow + Sky + Post).
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const toolsDir = import.meta.dirname;
const worldDir = path.resolve(toolsDir, '..');
const repoRoot = path.resolve(worldDir, '..');
const passName = process.argv[2] || 'assembled-v1';
const outDir = path.join(worldDir, 'shots', passName);
fs.mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
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
const url = `http://127.0.0.1:${port}/world/index.html`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
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
  {
    timeout: 30000,
  }
);
await page.waitForTimeout(300);

const shotIds = [
  'day-plaza',
  'day-mill-pier',
  'day-arena-wisteria',
  'day-shrine-arch',
  'day-flower-lobby',
  'day-south-road-boulders',
  'day-sacred-stone-roses',
  'evening-flower-lobby',
  'evening-plaza',
  'evening-sunset-vista',
  'night-flower-lobby',
  'night-moon-shrine',
  'night-plaza-lanterns',
  'aerial-masterplan',
];

const report = {
  pass: passName,
  timestamp: new Date().toISOString(),
  budgets: {
    desktopMaxDrawCalls: 72,
    desktopMaxTriangles: 4100000,
    tabletMaxDrawCalls: 58,
    tabletMaxTriangles: 1600000,
  },
  consoleErrors,
  shots: {},
  profiles: {},
};

for (const shotId of shotIds) {
  await page.evaluate((id) => {
    window.__WORLD__.toggleHud(false);
    window.__WORLD__.setShot(id);
    window.__WORLD__.measurePerformance(20);
  }, shotId);
  await page.waitForTimeout(160);

  const filePath = path.join(outDir, `${shotId}.png`);
  await page.screenshot({ path: filePath });
  const stats = await page.evaluate(() => window.__WORLD__.getStats());

  report.shots[shotId] = {
    file: filePath,
    ...stats,
  };
  console.log(`Captured ${shotId} -> ${filePath}`, JSON.stringify(stats));
}

// Also measure Tablet (Xiaomi Pad 7) vs Desktop (RX 6700) profile budgets on day-plaza
for (const prof of ['desktop', 'tablet']) {
  const profStats = await page.evaluate((p) => {
    window.__WORLD__.setProfile(p);
    window.__WORLD__.setShot('day-plaza');
    window.__WORLD__.measurePerformance(20);
    return window.__WORLD__.getStats();
  }, prof);
  report.profiles[prof] = profStats;
  if (prof === 'tablet') {
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(outDir, 'day-plaza-tablet.png') });
    await page.evaluate(() => {
      window.__WORLD__.setShot('day-flower-lobby');
      window.__WORLD__.measurePerformance(20);
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(outDir, 'day-flower-lobby-tablet.png') });
  }
}

const allShots = Object.values(report.shots);
report.summary = {
  maxSceneDrawCalls: Math.max(...allShots.map((s) => s.draws)),
  minSceneDrawCalls: Math.min(...allShots.map((s) => s.draws)),
  maxSceneTriangles: Math.max(...allShots.map((s) => s.triangles)),
  minSceneTriangles: Math.min(...allShots.map((s) => s.triangles)),
  desktopDraws: report.profiles.desktop?.draws || 0,
  desktopTriangles: report.profiles.desktop?.triangles || 0,
  tabletDraws: report.profiles.tablet?.draws || 0,
  tabletTriangles: report.profiles.tablet?.triangles || 0,
  consoleErrorCount: consoleErrors.length,
  passesAllBudgets:
    consoleErrors.length === 0 &&
    Math.max(...allShots.map((s) => s.draws)) <= report.budgets.desktopMaxDrawCalls &&
    Math.max(...allShots.map((s) => s.triangles)) <= report.budgets.desktopMaxTriangles &&
    (report.profiles.tablet?.draws || 0) <= report.budgets.tabletMaxDrawCalls &&
    (report.profiles.tablet?.triangles || 0) <= report.budgets.tabletMaxTriangles,
};

const reportPath = path.join(outDir, 'report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log('Saved report ->', reportPath, JSON.stringify(report.summary, null, 2));

await browser.close();
server.close();

if (!report.summary.passesAllBudgets) {
  console.error('Budget or console error check failed:', report.summary);
  process.exit(1);
}
