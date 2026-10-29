import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html?post=0", { waitUntil: "load" });
await p.waitForTimeout(3500);
const probe = await p.evaluate(() => {
  const m = window.__meadow; const s = m.bg.sky;
  return {
    sun: { pos: s.sun.position.toArray().map(v=>+v.toFixed(1)), color: s.sun.color.getHexString(), intensity: s.sun.intensity, castShadow: s.sun.castShadow,
      shadowCam: { l: s.sun.shadow.camera.left, r: s.sun.shadow.camera.right, t: s.sun.shadow.camera.top, b: s.sun.shadow.camera.bottom, n: s.sun.shadow.camera.near, f: s.sun.shadow.camera.far } },
    hemi: { intensity: s.hemi.intensity, sky: s.hemi.color.getHexString(), ground: s.hemi.groundColor.getHexString() },
    amb: { intensity: s.ambient.intensity, color: s.ambient.color.getHexString() },
    exposure: m.renderer.toneMappingExposure,
    shadowEnabled: m.renderer.shadowMap.enabled,
  };
});
console.log(JSON.stringify(probe, null, 1));
await p.evaluate(() => { window.__meadow.renderer.shadowMap.enabled = false; window.__meadow.bg.sky.sun.castShadow = false; });
await p.waitForTimeout(1200);
await p.screenshot({ path: "C:/Users/silen/projects/kilo-3d-kit/game/handoff/map-bg/shots/dbg-noshadow.png" });
await b.close();
