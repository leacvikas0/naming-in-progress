// ============================================================================
// qa-review/divine-verdict/capture-normal-scenes.mjs
// Captures current normal world scenes (no VFX) to inspect world/tree/house/character shadows.
// ============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { startServer } from '../../world/tools/serve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = __dirname;

const NORMAL_SCENES = [
  { id: 'day-plaza', file: 'normal-01-day-plaza.png', type: 'shot' },
  { id: 'day-south-road-boulders', file: 'normal-02-south-road.png', type: 'shot' },
  { id: 'day-arena-wisteria', file: 'normal-03-arena-wisteria.png', type: 'shot' },
  { id: 'day-mill-pier', file: 'normal-04-mill-pier.png', type: 'shot' },
  { id: 'day-flower-lobby', file: 'normal-05-flower-lobby.png', type: 'shot' },
  { id: 'plaza-player', file: 'normal-06-player-plaza-view.png', type: 'view', viewId: 'plaza' },
];

async function main() {
  const { server, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/world/index.html?nolobby=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
      null,
      { timeout: 30000 }
    );
    await page.waitForTimeout(250);

    for (const scene of NORMAL_SCENES) {
      await page.evaluate((s) => {
        const w = window.__WORLD__;
        w.appFlow?.skipToGame?.();
        w.toggleHud(false);
        if (s.type === 'view') {
          w.setView(s.viewId);
        } else {
          w.setShot(s.id);
        }
        w.post.render(0.016);
      }, scene);
      await page.waitForTimeout(100);
      const outPath = path.join(OUT_DIR, scene.file);
      await page.screenshot({ path: outPath });
      console.log(`[NORMAL SCENE CAPTURED] ${scene.file} -> ${outPath}`);
    }

    await page.close();
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
