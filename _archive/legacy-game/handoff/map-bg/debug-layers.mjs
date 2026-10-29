import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
p.on("pageerror", e => console.log("[err]", String(e).slice(0,800)));
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html?post=0", { waitUntil: "load" });
await p.waitForTimeout(4000);
const probe = await p.evaluate(() => {
  const m = window.__meadow;
  return {
    skyChildren: m.bg.sky.group.children.map(o => ({ n: o.name, t: o.type, mat: o.material?.type, side: o.material?.side, depthTest: o.material?.depthTest, depthWrite: o.material?.depthWrite, order: o.renderOrder, frustum: o.frustumCulled })),
    fog: m.scene.fog ? { c: m.scene.fog.color.getHexString(), n: m.scene.fog.near, f: m.scene.fog.far } : null,
    bg: m.scene.background ? m.scene.background.getHexString?.() : m.scene.background,
    camNear: m.camera.near, camFar: m.camera.far,
  };
});
console.log(JSON.stringify(probe, null, 1));
// hide sky
await p.evaluate(() => { window.__meadow.bg.sky.group.visible = false; });
await p.waitForTimeout(800);
await p.screenshot({ path: "C:/Users/silen/projects/kilo-3d-kit/game/handoff/map-bg/shots/dbg-nosky.png" });
// hide foliage too
await p.evaluate(() => { window.__meadow.bg.foliage.group.visible = false; });
await p.waitForTimeout(800);
await p.screenshot({ path: "C:/Users/silen/projects/kilo-3d-kit/game/handoff/map-bg/shots/dbg-terrainonly.png" });
await b.close();
