// Diagnostic: is the dark clumping on the Ink pane the outline, or the cel ramp?
// Disable the outline on pane 3 and compare.
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "msedge", headless: true,
  args: ["--use-angle=default", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
await page.goto("http://127.0.0.1:4173/game/handoff/map-bg/styles.html", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(18000);
await page.evaluate(() => { window.__styles.STYLES[2].outline = 0; });
await page.waitForTimeout(800);
await page.screenshot({ path: "reports/look/polish/diag-nooutline.png" });
await browser.close();
console.log("done");
