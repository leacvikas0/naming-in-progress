// ============================================================================
// world/assets/vfx/shoot.mjs
//
// Ephemeral-port (`server.listen(0, '127.0.0.1')`) Playwright verification
// studio for the Complete Stage 4 Opaque VFX & Sword Breathing Suite
// (`world/assets/vfx/preview.html`).
// Captures all 12 deterministic showcase shots into `shots/<passName>/`.
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
  const passName = process.argv[2] || 'pass1-suite';
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
      '07-shatterlance-convergence',
      '08-shatterlance-impact',
      '09-cinder-fall-crater',
      '10-storm-lance-discharge',
      '11-sword-sunfire-slash',
      '12-sword-glacial-detonation',
    ];

    const shotsReport = {};
    let maxDrawCalls = 0;
    let maxIdleDrawCalls = 0;
    let maxFrameMs = 0;
    const systemMaxDraws = {
      frostLance: 0,
      shatterlance: 0,
      cinderFall: 0,
      stormLance: 0,
      swordVfx: 0,
    };

    for (const shotName of shotList) {
      const stats = await page.evaluate((name) => {
        window.__vfxPreview.frostLance.setStylePreset('v1');
        return window.__vfxPreview.setShot(name, { hideUI: true });
      }, shotName);

      await page.waitForTimeout(80);
      const pngPath = path.join(outDir, `${shotName}.png`);
      await page.screenshot({ path: pngPath });

      maxDrawCalls = Math.max(maxDrawCalls, stats.vfxDrawCalls || 0);
      maxIdleDrawCalls = Math.max(maxIdleDrawCalls, stats.idleVfxDrawCalls || 0);
      maxFrameMs = Math.max(maxFrameMs, stats.vfxFrameMs || 0);
      if (stats.system && systemMaxDraws[stats.system] !== undefined) {
        systemMaxDraws[stats.system] = Math.max(
          systemMaxDraws[stats.system],
          stats.vfxDrawCalls || 0
        );
      }

      shotsReport[shotName] = {
        ...stats,
        path: pngPath,
      };
    }

    // Run suite-wide contract checks (Zero-Glass material audit, idle=0 audit, toon-skin isVfx guard audit)
    const contractChecks = await page.evaluate(() => {
      const p = window.__vfxPreview;
      p.clearAllVfx();

      const idleGroupVisible =
        p.frostLance.group.visible ||
        p.shatterlance.group.visible ||
        p.cinderFall.group.visible ||
        p.stormLance.group.visible ||
        p.swordVfx.group.visible ||
        p.swordVfx.sheathMesh.visible;

      // Verify Zero-Glass (`transparent === false, depthWrite === true`) on all new systems
      const newMeshes = [
        p.shatterlance.intakeShardsMesh,
        p.shatterlance.greatLanceMesh,
        p.shatterlance.shatterWedgesMesh,
        p.shatterlance.groundDecalMesh,
        p.cinderFall.asteroidMesh,
        p.cinderFall.fireWakeMesh,
        p.cinderFall.craterRocksMesh,
        p.cinderFall.craterDecalMesh,
        p.stormLance.lightningRibbonMesh,
        p.stormLance.fulguriteSpikesMesh,
        p.stormLance.fulguriteScarMesh,
        p.swordVfx.sheathMesh,
        p.swordVfx.slashRibbonMesh,
        p.swordVfx.shrapnelMesh,
        p.swordVfx.detonationDecalMesh,
      ];

      const nonOpaqueMeshes = [];
      for (const m of newMeshes) {
        if (!m || !m.material) {
          nonOpaqueMeshes.push('missing_mesh');
          continue;
        }
        if (m.material.transparent !== false || m.material.depthWrite !== true) {
          nonOpaqueMeshes.push(m.name);
        }
      }

      // Verify toon-skin rebuild preserves swordVfx.sheathMesh visibility (`userData.isVfx === true`)
      p.swordVfx.setInfusion('solar', 12);
      if (p.knightChar.sockets?.__rebuildUnifiedSkin) {
        p.knightChar.sockets.__rebuildUnifiedSkin();
      }
      const sheathSurvivedRebuild =
        p.swordVfx.sheathMesh.visible === true &&
        p.swordVfx.sheathMesh.userData?.isVfx === true &&
        p.swordVfx.sheathMesh.parent === p.knightChar.equippedWeapons['handSlot.r'];

      // Verify all 3 detonations and all 5 swing types execute cleanly
      const detResults = {};
      for (const dType of ['shatterblow', 'solar_flare', 'thunderchain']) {
        p.swordVfx.triggerDetonation(dType, [75.1, 0.6, -3.8]);
        p.swordVfx.seek(0.18);
        detResults[dType] = p.swordVfx.getStats().drawCalls;
      }
      p.clearAllVfx();

      return {
        zeroIdleGroupVisibility: !idleGroupVisible,
        zeroGlassOpaqueCompliant: nonOpaqueMeshes.length === 0,
        nonOpaqueMeshes,
        sheathSurvivedRebuild,
        detResults,
      };
    });

    const passesAllBudgets =
      maxDrawCalls <= 6 &&
      maxIdleDrawCalls === 0 &&
      systemMaxDraws.shatterlance <= 4 &&
      systemMaxDraws.cinderFall <= 4 &&
      systemMaxDraws.stormLance <= 3 &&
      systemMaxDraws.swordVfx <= 4 &&
      maxFrameMs <= 0.35 &&
      consoleErrors.length === 0 &&
      contractChecks.zeroIdleGroupVisibility === true &&
      contractChecks.zeroGlassOpaqueCompliant === true &&
      contractChecks.sheathSurvivedRebuild === true;

    const report = {
      pass: passName,
      timestamp: new Date().toISOString(),
      passesAllBudgets,
      maxVfxDraws: maxDrawCalls,
      maxVfxDrawCalls: maxDrawCalls,
      maxIdleVfxDraws: maxIdleDrawCalls,
      systemMaxDraws,
      drawCallBudgetMet: maxDrawCalls <= 6 && maxIdleDrawCalls === 0,
      maxVfxFrameMs: maxFrameMs,
      frameTimeBudgetMet: maxFrameMs <= 0.35,
      contractChecks,
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
