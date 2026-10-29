/**
 * Dev-only render harness: loads the house in headless Chrome, sets each camera
 * view and saves a clean screenshot. Usage:
 *   node house3d/tools/render.mjs hero front right back top door
 */
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const views = process.argv.slice(2).length ? process.argv.slice(2) : ['hero'];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console:error]', msg.text());
});
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

await page.goto('http://127.0.0.1:4173/house3d/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });

// Hide the UI so screenshots show the scene itself.
await page.evaluate(() => {
  for (const sel of ['.brand', '.hint', '.dock', '.vignette']) {
    document.querySelectorAll(sel).forEach((el) => (el.style.display = 'none'));
  }
});

for (const view of views) {
  await page.evaluate((name) => window.__house.setView(name), view);
  await page.waitForTimeout(1500);
  const file = path.join(root, 'shots', `${view}.png`);
  await page.screenshot({ path: file });
  console.log('shot', view, '->', file);
}

const stats = await page.evaluate(() => {
  const r = window.__house.renderer.info;
  return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures };
});
console.log('render stats', stats);

await browser.close();
