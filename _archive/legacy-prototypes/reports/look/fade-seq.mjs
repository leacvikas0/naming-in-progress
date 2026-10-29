import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const outDir = "reports/look/fade-seq";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=default", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html#hud=0", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(16000);
  // freeze the camera so only the petals move
  await page.evaluate(() => {
    const m = window.__meadow;
    m.controls.enableDamping = false;
    m.camera.position.set(-1.5, 2.45, 14);
    m.controls.target.set(-1.5, 1.02, 2);
    m.controls.update();
  });
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${outDir}/f${i}.png` });
  }
  console.log("frames done");
} finally {
  await browser.close();
}
