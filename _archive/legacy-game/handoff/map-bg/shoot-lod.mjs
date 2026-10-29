import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,500)));
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html", { waitUntil: "load" });
await p.waitForTimeout(6000);
const read = async () => await p.evaluate(() => {
  const r = window.__meadow.renderer.info.render;
  const s = window.__meadow.bg.stats;
  let grassFull = 0, grassLow = 0, grassInstFull = 0, grassInstLow = 0;
  window.__meadow.bg.kit.group.traverse(o => {
    if (!o.isInstancedMesh) return;
    const g = o.geometry; const tri = (g.index ? g.index.count : g.attributes.position.count)/3;
    if (o.name.startsWith("kitGrassLow")) { grassLow += tri*o.count; grassInstLow += o.count; }
    else if (o.name.startsWith("kitGrass")) { grassFull += tri*o.count; grassInstFull += o.count; }
  });
  return { renderedTris: r.triangles, draws: r.calls, budget: s.kit.triangles, lodTris: s.kit.grassLodTris,
    grassFullInstances: grassInstFull, grassLowInstances: grassInstLow };
});
console.log("gameplay:", JSON.stringify(await read()));
await p.screenshot({ path: "C:/Users/silen/projects/kilo-3d-kit/game/handoff/map-bg/shots/lod-01-gameplay.png" });
await p.evaluate(() => window.__meadow.applyView("aerial"));
await p.waitForTimeout(900);
console.log("aerial:  ", JSON.stringify(await read()));
await p.screenshot({ path: "C:/Users/silen/projects/kilo-3d-kit/game/handoff/map-bg/shots/lod-02-aerial.png" });
await p.evaluate(() => window.__meadow.applyView("eye"));
await p.waitForTimeout(900);
console.log("eye:     ", JSON.stringify(await read()));
await p.screenshot({ path: "C:/Users/silen/projects/kilo-3d-kit/game/handoff/map-bg/shots/lod-03-eye.png" });
await b.close();
