import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto('http://127.0.0.1:4173/house3d/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready === true);

const info = await page.evaluate(() => {
  const out = { instanced: [], materials: {}, meshes: [] };
  window.__house.scene.traverse((o) => {
    if (o.isInstancedMesh) {
      out.instanced.push({
        name: o.name,
        count: o.count,
        matType: o.material.type,
        color: o.material.color.getHexString(),
        map: o.material.map ? 'yes' : 'no',
        vertexColors: o.material.vertexColors,
        instanceColor: o.instanceColor ? Array.from(o.instanceColor.array.slice(0, 9)).map((v) => +v.toFixed(3)) : null,
        visible: o.visible,
        parent: o.parent?.name,
      });
    }
    if (o.isMesh && !o.isInstancedMesh) {
      out.meshes.push({ name: o.name, mat: o.material.type, color: o.material.color?.getHexString(), map: !!o.material.map, verts: o.geometry.attributes.position.count });
    }
  });
  for (const [key, mat] of Object.entries(window.__house.materials)) {
    if (mat && mat.isMaterial) out.materials[key] = { color: mat.color?.getHexString(), map: !!mat.map, type: mat.type };
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));

await page.evaluate(() => {
  window.__house.scene.traverse((o) => { if (o.isInstancedMesh) o.visible = false; });
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'house3d/shots/probe-no-tiles.png' });
await browser.close();
