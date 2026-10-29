import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const outTag = process.argv[2] || 'v1';
const outDir = path.join(repoRoot, 'world', 'shots', outTag);
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
  let filePath = path.join(repoRoot, urlPath === '/' ? 'world/blockout.html' : urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
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
const url = `http://127.0.0.1:${port}/world/blockout.html`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(err.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__BLOCKOUT__), null, { timeout: 30000 });
await page.waitForTimeout(400);

const viewKeys = ['entry', 'plaza', 'mill', 'arena', 'shrine', 'shrineLookback', 'aerial', 'topdown'];
const report = { outTag, errors, views: {} };

for (const v of viewKeys) {
  await page.evaluate((viewId) => {
    window.__BLOCKOUT__.setView(viewId);
    window.__BLOCKOUT__.toggleLabels(false);
  }, v);
  await page.waitForTimeout(250);
  const file = path.join(outDir, `${v}.png`);
  await page.screenshot({ path: file });
  const stats = await page.evaluate(() => window.__BLOCKOUT__.getStats());
  report.views[v] = { file, stats };
  console.log(`Captured ${v} -> ${file}`, JSON.stringify(stats));
}

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
server.close();
