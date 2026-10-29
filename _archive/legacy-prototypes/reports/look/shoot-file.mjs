// Screenshot an arbitrary local html file (headless, isolated).
// Usage: node reports/look/shoot-file.mjs <file> <out.png> [waitMs] [w] [h]
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";

const [, , file, out, wait = "6000", w = "1600", h = "900"] = process.argv;
if (!file || !out) { console.error("usage: shoot-file.mjs <file> <out.png> [waitMs] [w] [h]"); process.exit(2); }

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=default", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--allow-file-access-from-files"],
});
try {
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(pathToFileURL(file).href, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(Number(wait));
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ out, errors: errors.slice(0, 6) }));
} finally {
  await browser.close();
}
