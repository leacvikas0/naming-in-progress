import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const assetDir = import.meta.dirname;
const repoRoot = path.resolve(assetDir, '../../..');
const passName = process.argv[2] || 'pass1';
const outDir = path.join(assetDir, 'shots', passName);
fs.mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(
    repoRoot,
    urlPath === '/' ? 'world/assets/terrain/preview.html' : urlPath
  );
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'preview.html');
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
const url = `http://127.0.0.1:${port}/world/assets/terrain/preview.html`;

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
page.on('pageerror', (err) => consoleErrors.push(err.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__TERRAIN_PREVIEW__), null, {
  timeout: 30000,
});
await page.waitForTimeout(300);

const shotIds = [
  'shrine-arch-stairs',
  'waterfall-flume-channel',
  'pier-shoreline',
  'wisteria-trees-arena',
  'well-plaza-roads',
  'aerial-overview',
];

const report = {
  pass: passName,
  timestamp: new Date().toISOString(),
  budgets: {
    targetFps: 144,
    maxDrawCalls: 22,
    maxTriangles: 55000,
    maxMaskBuildMs: 30,
  },
  consoleErrors,
  shots: {},
};

for (const shotId of shotIds) {
  await page.evaluate((id) => {
    window.__TERRAIN_PREVIEW__.toggleHud(false);
    window.__TERRAIN_PREVIEW__.setShot(id);
    window.__TERRAIN_PREVIEW__.measurePerformance(30);
  }, shotId);
  await page.waitForTimeout(180);

  const filePath = path.join(outDir, `${shotId}.png`);
  await page.screenshot({ path: filePath });
  const stats = await page.evaluate(() => window.__TERRAIN_PREVIEW__.getStats());

  report.shots[shotId] = {
    file: filePath,
    ...stats,
  };
  console.log(`Captured ${shotId} -> ${filePath}`, JSON.stringify(stats));
}

const allShots = Object.values(report.shots);
report.summary = {
  maxDrawCallsObserved: Math.max(...allShots.map((s) => s.draws)),
  minDrawCallsObserved: Math.min(...allShots.map((s) => s.draws)),
  maxFrustumTrianglesObserved: Math.max(...allShots.map((s) => s.triangles)),
  minFrustumTrianglesObserved: Math.min(...allShots.map((s) => s.triangles)),
  totalSceneTriangles: allShots[0]?.totalSceneTriangles || 0,
  maskBuildMs: allShots[0]?.maskBuildMs || 0,
  consoleErrorCount: consoleErrors.length,
  passesAllBudgets:
    consoleErrors.length === 0 &&
    Math.max(...allShots.map((s) => s.draws)) <= 22 &&
    Math.max(...allShots.map((s) => s.triangles)) < 55000 &&
    (allShots[0]?.totalSceneTriangles || 0) < 55000,
};

const reportPath = path.join(outDir, 'report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log('Saved report ->', reportPath, JSON.stringify(report.summary));

await browser.close();
server.close();

if (!report.summary.passesAllBudgets) {
  console.error('Budget or console error check failed:', report.summary);
  process.exit(1);
}
