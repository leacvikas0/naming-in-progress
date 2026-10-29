import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto('http://127.0.0.1:4173/house3d/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready === true);
await page.evaluate(() => { for (const s of ['.brand', '.hint', '.dock', '.vignette']) document.querySelectorAll(s).forEach((e) => (e.style.display = 'none')); });

const info = await page.evaluate(() => {
  const scene = window.__house.scene;
  const mats = window.__house.materials;
  const meshes = [];
  scene.traverse((o) => { if (o.isInstancedMesh) meshes.push(o); });
  const first = meshes[0];
  return {
    materialIsShared: first.material === mats.roofTile,
    materialVertexColors: first.material.vertexColors,
    geometryHasColor: !!first.geometry.attributes.color,
    colorCount: first.geometry.attributes.color?.count,
    posCount: first.geometry.attributes.position.count,
    instanceColorCount: first.instanceColor?.count,
    defines: first.material.defines,
    version: window.__house.renderer.info.render.frame,
  };
});
console.log(info);

await page.evaluate(() => {
  const mats = window.__house.materials;
  mats.roofTile.color.set(0x00ff00);
  mats.roofTile.needsUpdate = true;
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'house3d/shots/probe-green.png' });
await browser.close();
