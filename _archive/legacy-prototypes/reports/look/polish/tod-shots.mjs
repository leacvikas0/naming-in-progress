// Capture the same camera at several times of day, tiled into one strip.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const browser = await chromium.launch({ channel: "msedge", headless: true,
  args: ["--use-angle=default", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
await page.goto("http://127.0.0.1:4173/game/handoff/map-bg/styles.html", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(18000);

const times = [0.24, 0.31, 0.55, 0.72, 0.80, 0.95];
for (let i = 0; i < times.length; i++) {
  await page.evaluate((t) => {
    const el = document.getElementById("tod");
    el.value = String(Math.round(t * 1000));
    el.dispatchEvent(new Event("input"));
  }, times[i]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `reports/look/polish/tod-${i}.png`, clip: { x: 0, y: 0, width: 800, height: 450 } });
}
await browser.close();

execFileSync("python", ["-c", `
from PIL import Image
ims=[Image.open(f"reports/look/polish/tod-{i}.png") for i in range(${times.length})]
w,h=ims[0].size
sheet=Image.new("RGB",(w*3,h*2))
for i,im in enumerate(ims): sheet.paste(im,((i%3)*w,(i//3)*h))
sheet.save("reports/look/polish/tod-sheet.png")
print("ok")
`], { stdio: "inherit" });
