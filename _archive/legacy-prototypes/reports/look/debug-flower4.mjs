
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const logs = [];
page.on('console', m => logs.push(m.type()+': '+m.text().slice(0,300)));
await page.goto('http://127.0.0.1:4173/game/handoff/map-bg/preview-flower-tree.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(4000);
const out = await page.evaluate(() => {
  const g = window.__meadow;
  const leaves = g.scene.getObjectByName('flowerTreeLeaves');
  // solid colour fragment, same vertex shader
  leaves.material.fragmentShader = 'void main(){ gl_FragColor = vec4(1.0,0.0,0.0,1.0); }';
  leaves.material.needsUpdate = true;
  g.renderer.render(g.scene, g.camera);
  return { ok: true };
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'reports/look/flower-tree-debug-solid.png' });
console.log(JSON.stringify({ out, logs: logs.filter(l=>!l.includes('404')).slice(0,6) }, null, 2));
await browser.close();
