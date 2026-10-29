import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
p.on("console", m => console.log("[c]", m.type(), m.text().slice(0,500)));
p.on("pageerror", e => console.log("[err]", String(e).slice(0,1200)));
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html", { waitUntil: "load" });
await p.waitForTimeout(6000);
const info = await p.evaluate(() => {
  if (!window.__meadow) return { meadow: false };
  let meshes = 0, inst = 0;
  window.__meadow.scene.traverse(o => { if (o.isInstancedMesh) inst++; else if (o.isMesh) meshes++; });
  return { meadow: true, meshes, inst, stats: window.__meadow.bg.stats, cam: window.__meadow.camera.position.toArray() };
});
console.log(JSON.stringify(info));
await p.screenshot({ path: "C:/Users/silen/projects/kilo-3d-kit/game/handoff/map-bg/shots/combo-debug.png" });
await b.close();
