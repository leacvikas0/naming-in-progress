import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto("http://127.0.0.1:4173/game/index.html", { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  const out = await page.evaluate(() => {
    const g = window.__game;
    g.startRun(["knight", "mage"]);
    const s = g.world.scenery;
    const fams = {};
    let meshes = 0;
    g.world.group.traverse((o) => { if (o.isInstancedMesh) { meshes++; } });
    return { scenery: s ? s.stats : null, instancedMeshes: meshes, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  });
  console.log(JSON.stringify(out, null, 2));
} finally { await browser.close(); }
