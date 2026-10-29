import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html", { waitUntil: "load" });
await p.waitForTimeout(5000);
const out = await p.evaluate(() => {
  const m = window.__meadow;
  const fam = {};
  m.bg.kit.group.traverse(o => {
    if (!o.isInstancedMesh) return;
    const g = o.geometry;
    const tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const key = o.name.replace(/[0-9]+$/, "");
    if (!fam[key]) fam[key] = { meshes: 0, instances: 0, tris: 0, triPer: tri };
    fam[key].meshes++;
    fam[key].instances += o.count;
    fam[key].tris += tri * o.count;
  });
  let terrain = 0;
  m.bg.terrain.group.traverse(o => {
    if (o.isMesh || o.isInstancedMesh) {
      const g = o.geometry;
      const tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
      terrain += tri * (o.isInstancedMesh ? o.count : 1);
    }
  });
  return { fam, terrain };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
