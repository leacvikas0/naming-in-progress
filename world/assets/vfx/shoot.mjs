// ============================================================================
// world/assets/vfx/shoot.mjs
//
// Ephemeral-port (`server.listen(0, '127.0.0.1')`) Playwright verification
// studio for Stage 4 Pass 1 Frost Lance (`world/assets/vfx/preview.html`).
// Captures 6 deterministic multi-beat & multi-angle shots into `shots/pass1/`.
// ============================================================================

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
};

function startStaticServer(rootDir) {
  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, 'http://127.0.0.1');
      if (reqUrl.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      const relPath = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '');
      const fullPath = path.resolve(rootDir, relPath);
      if (!fullPath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const data = await fs.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function main() {
  const passName = process.argv[2] || 'pass1';
  const outDir = path.join(__dirname, 'shots', passName);
  await fs.mkdir(outDir, { recursive: true });

  const { server, port } = await startStaticServer(REPO_ROOT);
  const url = `http://127.0.0.1:${port}/world/assets/vfx/preview.html`;

  const consoleErrors = [];
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('[PAGE CONSOLE ERROR]', msg.text());
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      console.error('[PAGE ERROR]', err.message || String(err));
      consoleErrors.push(err.message || String(err));
    });
    page.on('requestfailed', (req) => {
      console.error('[REQ FAILED]', req.url(), req.failure()?.errorText);
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });

    const shotList = [
      '01-cast-launch',
      '02-mid-eruption-ramp',
      '03-apex-crown-impact',
      '04-standing-glacier-field',
      '05-player-shoulder-camera',
      '06-twilight-bloom-showcase',
    ];

    const shotsReport = {};
    let maxDrawCalls = 0;
    let maxFrameMs = 0;

    for (const shotName of shotList) {
      const stats = await page.evaluate((name) => {
        window.__vfxPreview.frostLance.setStylePreset('v1');
        return window.__vfxPreview.setShot(name, { hideUI: true });
      }, shotName);

      await page.waitForTimeout(80);
      const pngPath = path.join(outDir, `${shotName}.png`);
      await page.screenshot({ path: pngPath });

      maxDrawCalls = Math.max(maxDrawCalls, stats.vfxDrawCalls || 0);
      maxFrameMs = Math.max(maxFrameMs, stats.vfxFrameMs || 0);

      shotsReport[shotName] = {
        ...stats,
        path: pngPath,
      };
    }

    // Also capture 3 real-3D color & shading variations (v1, v2, v3) on shots 04 and 03
    const variantsDir = path.join(outDir, 'variants');
    await fs.mkdir(variantsDir, { recursive: true });
    for (const presetKey of ['v1', 'v2', 'v3']) {
      for (const shotName of ['04-standing-glacier-field', '03-apex-crown-impact']) {
        await page.evaluate(
          ({ preset, shot }) => {
            window.__vfxPreview.frostLance.setStylePreset(preset);
            return window.__vfxPreview.setShot(shot, { hideUI: true });
          },
          { preset: presetKey, shot: shotName }
        );
        await page.waitForTimeout(60);
        const varPngPath = path.join(variantsDir, `${presetKey}-${shotName}.png`);
        await page.screenshot({ path: varPngPath });
      }
    }

    // Also verify live world integration (`world/index.html`)
    const worldUrl = `http://127.0.0.1:${port}/world/index.html`;
    await page.goto(worldUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__WORLD_READY__ === true, null, { timeout: 30000 });

    const worldIntegration = await page.evaluate(() => {
      const w = window.__WORLD__;
      w.coopSystem.triggerAction('skill');
      w.frostLance.seek(0.72);
      const vfxStats = w.frostLance.getStats();
      w.frostLance.clear();
      return {
        hasFrostLance: Boolean(w.frostLance),
        triggeredActive: vfxStats.active,
        vfxDrawCallsInWorld: vfxStats.drawCalls,
        activeSpikesInWorld: vfxStats.activeSpikes,
      };
    });

    const passesAllBudgets =
      maxDrawCalls <= 6 &&
      maxFrameMs <= 0.35 &&
      consoleErrors.length === 0 &&
      Boolean(worldIntegration.hasFrostLance) &&
      Boolean(worldIntegration.triggeredActive) &&
      worldIntegration.vfxDrawCallsInWorld <= 6;

    const report = {
      pass: passName,
      timestamp: new Date().toISOString(),
      passesAllBudgets,
      maxVfxDraws: maxDrawCalls,
      maxVfxDrawCalls: maxDrawCalls,
      drawCallBudgetMet: maxDrawCalls <= 6,
      maxVfxFrameMs: maxFrameMs,
      frameTimeBudgetMet: maxFrameMs <= 0.35,
      worldIntegration,
      zeroConsoleErrors: consoleErrors.length === 0,
      consoleErrors,
      shots: shotsReport,
    };

    const reportPath = path.join(outDir, 'report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));

    if (!passesAllBudgets) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
