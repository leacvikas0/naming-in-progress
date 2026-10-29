import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,600)));
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html?post=0", { waitUntil: "load" });
await p.waitForTimeout(3000);
await p.evaluate(() => { const m = window.__meadow; m.renderer.render(m.scene, m.camera); });
await p.waitForTimeout(200);
await p.screenshot({ path: "C:/Users/silen/projects/kilo-3d-kit/game/handoff/map-bg/shots/dbg-manual.png" });
// now check whether the rAF loop is alive
const alive = await p.evaluate(async () => {
  let n = 0;
  const orig = window.requestAnimationFrame;
  await new Promise(res => setTimeout(res, 500));
  const m = window.__meadow;
  m.renderer.info.autoReset = true;
  return new Promise(res => {
    let a = m.renderer.info.render.frame;
    setTimeout(() => res({ frameBefore: a, frameAfter: m.renderer.info.render.frame }), 500);
  });
});
console.log(JSON.stringify(alive));
await b.close();
