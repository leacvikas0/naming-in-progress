// Independent screenshot channel for the map-background work.
//
// The Playwright MCP browser is shared with teammates, so the Lead uses this
// script (playwright-core + the system Edge/Chrome) to take screenshots without
// fighting over the MCP page.
//
// Usage:
//   node game/handoff/map-bg/shoot.mjs <url> <out.png> [view] [width] [height] [waitMs]
//
// `view` is passed to window.__meadow.applyView() when present.

import { chromium } from "playwright-core";

const [, , url, out, view = "", w = "1600", h = "900", wait = "2500"] = process.argv;
if (!url || !out) {
  console.error("usage: node shoot.mjs <url> <out.png> [view] [w] [h] [waitMs]");
  process.exit(2);
}

const width = Number(w);
const height = Number(h);

async function launch() {
  const attempts = [
    { channel: "msedge" },
    { channel: "chrome" },
    {},
  ];
  let lastErr;
  for (const opts of attempts) {
    try {
      return await chromium.launch({
        ...opts,
        headless: true,
        args: ["--use-angle=default", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(Number(wait));
  if (view) {
    await page.evaluate((v) => {
      if (window.__meadow && window.__meadow.applyView) window.__meadow.applyView(v);
    }, view);
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: out });
  const stats = await page.evaluate(() => {
    if (!window.__meadow) return null;
    const r = window.__meadow.renderer.info.render;
    return { triangles: r.triangles, calls: r.calls };
  });
  console.log(JSON.stringify({ out, stats, errors: errors.slice(0, 6) }));
} finally {
  await browser.close();
}
