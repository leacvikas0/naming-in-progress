
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const logs = [];
page.on('console', m => logs.push(m.type()+': '+m.text()));
page.on('pageerror', e => logs.push('pageerror: '+e.message));
await page.goto('http://127.0.0.1:4173/game/handoff/map-bg/preview-flower-tree.html', { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(6000);
const out = await page.evaluate(() => {
  const g = window.__meadow;
  if (!g) return { err: 'no meadow' };
  const res = [];
  g.tree.group.traverse(o => {
    if (o.isInstancedMesh) {
      res.push({ name: o.name, count: o.count, visible: o.visible, frustumCulled: o.frustumCulled,
        matType: o.material.type, hasShader: !!o.material.userData, prog: !!o.material.program,
        bs: o.geometry.boundingSphere ? [o.geometry.boundingSphere.center.x, o.geometry.boundingSphere.center.y, o.geometry.boundingSphere.center.z, o.geometry.boundingSphere.radius] : null });
    }
  });
  return { res, children: g.tree.group.children.map(c => c.name || c.type), treeScale: g.tree.group.scale.x };
});
console.log(JSON.stringify({ out, logs: logs.slice(0,10) }, null, 2));
await browser.close();
