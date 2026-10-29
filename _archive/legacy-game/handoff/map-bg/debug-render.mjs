import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,600)));
p.on("console", m => { if (m.type()==="error") console.log("[console.error]", m.text().slice(0,600)); });
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html?post=0", { waitUntil: "load" });
await p.waitForTimeout(3000);
const r = await p.evaluate(async () => {
  const m = window.__meadow;
  const out = {};
  m.renderer.info.autoReset = false;
  // manual render of the whole scene
  m.renderer.info.reset();
  m.renderer.render(m.scene, m.camera);
  out.full = { calls: m.renderer.info.render.calls, tris: m.renderer.info.render.triangles };
  // only terrain
  m.bg.sky.group.visible = false; m.bg.foliage.group.visible = false;
  m.renderer.info.reset();
  m.renderer.render(m.scene, m.camera);
  out.terrainOnly = { calls: m.renderer.info.render.calls, tris: m.renderer.info.render.triangles };
  // only sky
  m.bg.sky.group.visible = true; m.bg.terrain.group.visible = false;
  m.renderer.info.reset();
  m.renderer.render(m.scene, m.camera);
  out.skyOnly = { calls: m.renderer.info.render.calls, tris: m.renderer.info.render.triangles };
  // only foliage
  m.bg.sky.group.visible = false; m.bg.foliage.group.visible = true;
  m.renderer.info.reset();
  m.renderer.render(m.scene, m.camera);
  out.foliageOnly = { calls: m.renderer.info.render.calls, tris: m.renderer.info.render.triangles };
  // camera sanity
  out.cam = { pos: m.camera.position.toArray(), dir: m.camera.getWorldDirection(new (m.camera.position.constructor)()).toArray() };
  out.groupVisible = { t: m.bg.terrain.group.visible, f: m.bg.foliage.group.visible, s: m.bg.sky.group.visible };
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();
