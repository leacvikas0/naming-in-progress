import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,600)));
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html", { waitUntil: "load" });
await p.waitForTimeout(3000);
const info = await p.evaluate(() => {
  const m = window.__meadow; const c = m.bg.post.composer;
  return {
    passes: c.passes.map(x => ({ type: x.constructor.name, enabled: x.enabled, r2s: x.renderToScreen })),
    renderTarget: { w: c.renderTarget1.width, h: c.renderTarget1.height, type: c.renderTarget1.texture.type, format: c.renderTarget1.texture.format, colorSpace: c.renderTarget1.texture.colorSpace },
    rt2: { w: c.renderTarget2.width, h: c.renderTarget2.height },
    rendererSize: m.renderer.getSize(new (m.renderer.constructor.prototype.getSize ? m.camera.position.constructor : Object)()).toArray?.() ?? null,
    pixelRatio: m.renderer.getPixelRatio(),
    canvas: [m.renderer.domElement.width, m.renderer.domElement.height, m.renderer.domElement.style.width, m.renderer.domElement.style.height],
  };
});
console.log(JSON.stringify(info, null, 1));
// disable bloom, keep grade
await p.evaluate(() => { window.__meadow.bg.post.composer.passes[1].enabled = false; });
await p.waitForTimeout(600);
await p.screenshot({ path: "C:/Users/silen/projects/kilo-3d-kit/game/handoff/map-bg/shots/dbg-nobloom.png" });
await b.close();
