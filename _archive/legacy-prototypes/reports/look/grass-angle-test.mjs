import { chromium } from "playwright-core";

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=default", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto("http://127.0.0.1:4173/game/handoff/map-bg/preview.html", { waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(14000);

  async function shot(name, pos, target) {
    await page.evaluate(({ pos, target }) => {
      const m = window.__meadow;
      m.camera.position.set(...pos);
      m.controls.target.set(...target);
      m.controls.update();
    }, { pos, target });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `reports/look/${name}.png` });
  }

  // Same patch of meadow, viewed from opposite sides.
  await shot("grass-view-north", [0, 6, 12], [0, 1, -4]);
  await shot("grass-view-south", [0, 6, -20], [0, 1, -4]);
  console.log("shots done");
} finally {
  await browser.close();
}
