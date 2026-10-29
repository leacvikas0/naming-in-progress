import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
p.on("console", m => console.log("[console]", m.type(), m.text().slice(0,300)));
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,400)));
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview-terrain.html", { waitUntil: "load" });
await p.waitForTimeout(2500);
const info = await p.evaluate(() => {
  const m = window.__meadow; if (!m) return "no meadow";
  const out = { children: [] };
  m.scene.traverse(o => {
    if (o.isMesh || o.isInstancedMesh) {
      const g = o.geometry;
      out.children.push({ name: o.name, type: o.type, y: +o.position.y.toFixed(2), visible: o.visible,
        mat: o.material && o.material.type, transparent: !!(o.material && o.material.transparent),
        opacity: o.material && o.material.opacity });
    }
  });
  return out;
});
console.log(JSON.stringify(info, null, 1));
await b.close();
