// One-off diagnostic: force the outline colour bright so we can see whether the
// depth-edge pass is actually drawing. Not part of the deliverable.
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "msedge", headless: true,
  args: ["--use-angle=default", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
await page.goto("http://127.0.0.1:4173/game/handoff/map-bg/styles.html", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(18000);
const info = await page.evaluate(() => {
  const s = window.__styles;
  if (!s) return { ok: false };
  const g = s.chains[2].params.grade;
  g.uOutlineColor.value.set(1, 0, 1);
  return {
    ok: true,
    outline: g.uOutline.value,
    hasDepth: !!g.tDepth.value,
    texel: [g.uTexel.value.x, g.uTexel.value.y],
    near: g.uCamNear.value, far: g.uCamFar.value,
    diag: s.chains[2].diagnostics,
  };
});
console.log(JSON.stringify(info));
await page.waitForTimeout(600);
await page.screenshot({ path: "reports/look/polish/diag-outline.png" });
await browser.close();
