import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const flowersDir = import.meta.dirname;
const repoRoot = path.resolve(flowersDir, '../../..');
const passTag = process.argv[2] || 'pass2';
const outDir = path.join(flowersDir, 'shots', passTag);
fs.mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const filePath = path.join(repoRoot, urlPath === '/' ? 'world/assets/flowers/preview.html' : urlPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/world/assets/flowers/preview.html`;

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
await page.waitForFunction(() => Boolean(window.__FLOWERS_PREVIEW__), null, { timeout: 20000 });
await page.waitForTimeout(350);

const shots = [
  'grassTuft',
  'crimsonRose',
  'bellflower',
  'daisy',
  'lupine',
  'cosmos',
  'toonShrub',
  'meadow-drift',
  'species-sheet',
];

const capturedFiles = {};
for (const mode of shots) {
  await page.evaluate((m) => window.__FLOWERS_PREVIEW__.setMode(m, 0.85), mode);
  await page.waitForTimeout(180);
  const outPath = path.join(outDir, `${mode}.png`);
  await page.screenshot({ path: outPath });
  capturedFiles[mode] = outPath;
  console.log(`Captured ${mode}.png -> ${outPath}`);
}

const previewData = await page.evaluate(() => window.__FLOWERS_PREVIEW__.getReport());
const report = {
  pass: passTag,
  timestamp: new Date().toISOString(),
  consoleErrors,
  meadowDrawCalls: previewData.meadowDrawCalls,
  fps: previewData.fps,
  species: previewData.species,
  profiles: previewData.profiles,
  shots: capturedFiles,
};

const reportPath = path.join(outDir, 'report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Wrote report -> ${reportPath}`);

await browser.close();
server.close();

if (consoleErrors.length > 0) {
  console.error('Console errors detected:', consoleErrors);
  process.exit(1);
}
