
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=default','--enable-unsafe-swiftshader','--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto('file:///C:/Users/silen/Downloads/ai_studio_code%20(38).html', { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(6000);
const out = await page.evaluate(async () => {
  const THREE = await import('three');
  const scene = window.scene || null;
  // the page keeps everything in module scope; find via renderer? fall back to scanning
  return { hasScene: !!scene };
});
console.log(JSON.stringify(out));
await browser.close();
