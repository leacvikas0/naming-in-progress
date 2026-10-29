
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const logs = [];
page.on('console', m => logs.push(m.type()+': '+m.text().slice(0,200)));
page.on('pageerror', e => logs.push('pageerror: '+e.message));
await page.goto('http://127.0.0.1:4173/game/handoff/map-bg/preview-flower-tree.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(5000);
const out = await page.evaluate(async () => {
  const g = window.__meadow;
  const THREE = await import('three');
  const leaves = g.scene.getObjectByName('flowerTreeLeaves');
  const m = leaves.instanceMatrix.array;
  const first = Array.from(m.slice(0, 16)).map(v => +v.toFixed(2));
  // swap to a basic material to prove geometry/instances
  leaves.material = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
  return { firstMatrix: first, count: leaves.count, drawRange: leaves.geometry.drawRange };
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'reports/look/flower-tree-debug-red.png' });
console.log(JSON.stringify({ out, logs: logs.slice(0,12) }, null, 2));
await browser.close();
