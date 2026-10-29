import { chromium } from "playwright-core";
const b = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("pageerror", e => console.log("[pageerror]", String(e).slice(0,400)));
await p.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html", { waitUntil: "load" });
await p.waitForTimeout(6000);
const views = [["gameplay","final-01-gameplay"],["eye","final-02-eye"],["aerial","final-03-aerial"],["lake","final-04-lake"],["shrine","final-05-shrine"]];
for (const [v, name] of views) {
  await p.evaluate((vv) => window.__meadow.applyView(vv), v);
  await p.waitForTimeout(800);
  await p.screenshot({ path: `C:/Users/silen/projects/kilo-3d-kit/game/handoff/map-bg/shots/${name}.png` });
}
await b.close();
