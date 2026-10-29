import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=default","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const logs = [];
page.on("console", m => logs.push(m.type()+": "+m.text()));
page.on("pageerror", e => logs.push("ERR "+e));
await page.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview-tree.html?plain=1", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const m = window.__meadow;
  return {
    plain: m.plain,
    bgVisible: m.bg.group.visible,
    bgChildren: m.bg.group.children.length,
    sceneChildren: m.scene.children.map(c => ({name:c.name, type:c.type, visible:c.visible})),
    treeStats: m.tree.stats,
    cam: m.camera.position.toArray(),
    target: m.controls.target.toArray(),
  };
});
console.log(JSON.stringify(info, null, 2));
console.log(logs.slice(0, 20).join("\n"));
await browser.close();
