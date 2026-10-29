// Isolated screenshot channel for the game (shared MCP browser is contended).
// Usage: node reports/look/shoot-game.mjs <outDir> [view,view,...]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const outDir = process.argv[2] || "reports/look";
const only = (process.argv[3] || "play,aerial,shrine,camp,lake,eye").split(",");
mkdirSync(outDir, { recursive: true });

const VIEWS = {
  play: null,
  aerial: { eye: [0, 72, 92], target: [0, 0, 0], fov: 45 },
  shrine: { eye: [0, 12, -22], target: [0, 3.2, -34], fov: 55 },
  camp: { eye: [21, 11, 9], target: [30, 2, 18], fov: 55 },
  lake: { eye: [-18, 9, -2], target: [-52, 0, -4], fov: 55 },
  eye: { eye: [0, 2.4, 12], target: [0, 2.4, -14], fov: 60 },
};

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=default", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://127.0.0.1:4173/game/index.html", { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const g = window.__game;
    g.startRun(["knight", "mage"]);
    document.getElementById("hud")?.classList.add("hidden");
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__game;
    // Freeze the run so screenshots are not full of enemies.
    g.state.waveActive = false;
    g.state.intermissionT = 99999;
  });
  await page.waitForTimeout(500);

  for (const name of only) {
    const view = VIEWS[name];
    if (name === "play") {
      await page.evaluate(() => { window.__cameraOverride = null; });
    } else if (view) {
      await page.evaluate((v) => { window.__cameraOverride = v; }, view);
    }
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/game-${name}.png` });
    const stats = await page.evaluate(() => {
      const r = window.__game.renderer.info.render;
      return { tris: r.triangles, calls: r.calls };
    });
    console.log(JSON.stringify({ view: name, ...stats }));
  }
  console.log(JSON.stringify({ errors: errors.slice(0, 8) }));
} finally {
  await browser.close();
}
