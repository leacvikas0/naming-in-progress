// ============================================================================
// world/tools/verify-mali-g68-60fps-parity.mjs
//
// Comprehensive Independent Verification Suite for:
// - Gate 1: Conservative ARM Valhall `Mali-G68 MC4` (`550 MHz`) Hardware Roofline
//   (`totalTrianglesSubmitted <= 250000`, `dramMegabytes <= 60.0`,
//    `lateZDrawCallsWithManyTris === 0`, `predictedFrameMs <= 13.5`)
// - Gate 2: `gl.readPixels` Color & Luminance Parity between `desktop` and `tablet`
//   in `day-plaza` (Midground `y: 35%..65%` within ±1.5 Luma of Desktop,
//   Horizon `y: 65%..90%` within ±1.5 Luma of Desktop)
// - Gate 3: Visual & Density Parity PNG Captures (`844x390` on `desktop` vs `tablet`
//   for `day-plaza`, `day-flower-lobby`, `day-arena-wisteria`, and close-up
//   Stone 1/2/3 inspections)
// - Gate 4: Live `/api/mobile-telemetry` POST & GET roundtrip verification
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';

const OUT_DIR = path.resolve(
  process.cwd(),
  process.env.OUT || 'world/shots/mali-g68-parity-verify'
);
const VIEWPORT = { width: 844, height: 390 };

async function loadChromium() {
  for (const spec of [
    process.env.PLAYWRIGHT,
    'playwright-core',
    'playwright',
    'C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs',
    'C:/Users/silen/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs',
    '/tmp/pw/node_modules/playwright-core/index.mjs',
  ]) {
    if (!spec) continue;
    try {
      const isPath = spec.startsWith('/') || /^[A-Za-z]:[\\/]/.test(spec);
      const mod = await import(isPath ? pathToFileURL(spec).href : spec);
      const c = mod.chromium || mod.default?.chromium;
      if (c) return c;
    } catch {
      // try next
    }
  }
  throw new Error('playwright-core not found');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const srv = await startServer(0);
  const baseUrl = `${srv.url}?nolobby=1`;
  console.log(`[verify] Server started at ${srv.url}`);

  const chromium = await loadChromium();
  const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const useGpu = process.platform === 'win32' && !process.env.SWIFTSHADER;
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME ||
      (fs.existsSync(winChrome) ? winChrome : '/usr/local/bin/google-chrome'),
    args: useGpu
      ? ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist']
      : [
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--ignore-gpu-blocklist',
        ],
  });

  const consoleErrors = [];
  const pageErrors = [];

  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for world ready AND all 3 Sacred Stone monument GLBs to attach
    await page.waitForFunction(
      () => {
        const w = window.__WORLD__;
        if (!w || !w.ready || !w.stoneDecals?.group) return false;
        let loadedHolders = 0;
        for (const child of w.stoneDecals.group.children) {
          let hasMesh = false;
          child.traverse((m) => {
            if (m.isMesh && m.name !== '') hasMesh = true;
          });
          if (hasMesh) loadedHolders++;
        }
        return loadedHolders >= 3;
      },
      { timeout: 60000 }
    );
    await page.waitForTimeout(300);

    // Hide HUD for pure scene parity readback & captures
    await page.evaluate(() => {
      window.__WORLD__.toggleHud?.(false);
    });

    // =========================================================================
    // GATE 1: Conservative Mali-G68 MC4 (550 MHz) Hardware Roofline Report
    // =========================================================================
    const maliReports = {};
    for (const shotId of ['day-plaza', 'day-flower-lobby', 'day-arena-wisteria']) {
      maliReports[shotId] = await page.evaluate(async (sId) => {
        const w = window.__WORLD__;
        w.setProfile('tablet');
        w.setShot(sId);
        // Step a couple of frames so instanced puffs, meadow focus, and renderer.info settle
        w.post.render(0.016);
        w.post.render(0.016);
        if (typeof w.getMaliG68Report !== 'function') {
          throw new Error('window.__WORLD__.getMaliG68Report is not a function');
        }
        const rep = await w.getMaliG68Report();
        return {
          shotId: sId,
          renderCalls: w.renderer.info.render.calls,
          renderTriangles: w.renderer.info.render.triangles,
          report: rep,
        };
      }, shotId);
    }

    // Check tree & meadow shaders directly for any remaining `discard` statement
    const shaderDiscardAudit = await page.evaluate(() => {
      const w = window.__WORLD__;
      const offenders = [];
      const stripComments = (src = '') =>
        String(src)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
      w.scene.traverse((obj) => {
        if (!obj.isMesh || !obj.visible) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!mat) continue;
          const frag = stripComments(mat.fragmentShader || '');
          if (/\bdiscard\b/.test(frag)) {
            offenders.push({
              meshName: obj.name || '(unnamed)',
              matType: mat.type,
            });
          }
        }
      });
      return offenders;
    });

    const plazaMali = maliReports['day-plaza'].report;
    const gate1Checks = {
      totalTrianglesSubmitted: {
        value: plazaMali.totalTrianglesSubmitted,
        limit: 250000,
        pass: plazaMali.totalTrianglesSubmitted <= 250000,
      },
      dramMegabytes: {
        value: plazaMali.dramMegabytes,
        limit: 60.0,
        pass: plazaMali.dramMegabytes <= 60.0,
      },
      lateZDrawCallsWithManyTris: {
        value: plazaMali.lateZDrawCallsWithManyTris,
        expected: 0,
        pass: plazaMali.lateZDrawCallsWithManyTris === 0,
      },
      predictedFrameMs: {
        value: plazaMali.predictedFrameMs,
        limit: 13.5,
        pass: plazaMali.predictedFrameMs <= 13.5,
      },
      treeAndMeadowZeroDiscard: {
        offenders: shaderDiscardAudit.filter(
          (o) =>
            o.meshName.includes('tree') ||
            o.meshName.includes('meadow') ||
            o.meshName.includes('flower')
        ),
        pass:
          shaderDiscardAudit.filter(
            (o) =>
              o.meshName.includes('tree') ||
              o.meshName.includes('meadow') ||
              o.meshName.includes('flower')
          ).length === 0,
      },
    };
    const gate1Pass = Object.values(gate1Checks).every((c) => c.pass);

    // =========================================================================
    // GATE 2: `gl.readPixels` Color & Luminance Parity (Desktop vs Tablet)
    // =========================================================================
    const readbackBands = async (profileName, shotId = 'day-plaza') => {
      return page.evaluate(
        ({ prof, sId }) => {
          const w = window.__WORLD__;
          w.setProfile(prof);
          w.setShot(sId);
          w.toggleHud?.(false);
          w.post.render(0.016);

          const gl = w.renderer.getContext();
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          const width = gl.drawingBufferWidth;
          const height = gl.drawingBufferHeight;
          const pixels = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

          const sampleBand = (yMinFrac, yMaxFrac) => {
            const y0 = Math.floor(height * yMinFrac);
            const y1 = Math.floor(height * yMaxFrac);
            let rSum = 0;
            let gSum = 0;
            let bSum = 0;
            let count = 0;
            for (let y = y0; y < y1; y++) {
              const rowOff = y * width * 4;
              for (let x = 0; x < width; x++) {
                const idx = rowOff + x * 4;
                rSum += pixels[idx];
                gSum += pixels[idx + 1];
                bSum += pixels[idx + 2];
                count++;
              }
            }
            const r = rSum / Math.max(1, count);
            const g = gSum / Math.max(1, count);
            const b = bSum / Math.max(1, count);
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            return {
              r: Number(r.toFixed(2)),
              g: Number(g.toFixed(2)),
              b: Number(b.toFixed(2)),
              luma: Number(luma.toFixed(2)),
            };
          };

          const gradeUniforms =
            w.post?.params?.grade || w.post?.gradePass?.uniforms || null;
          return {
            profile: prof,
            drawingBuffer: { width, height },
            uAtmosphere: gradeUniforms?.uAtmosphere?.value ?? null,
            uMobileFastSample: gradeUniforms?.uMobileFastSample?.value ?? null,
            hasDepthTex: Boolean(gradeUniforms?.tDepth?.value),
            foreground: sampleBand(0.05, 0.35),
            midground: sampleBand(0.35, 0.65),
            horizon: sampleBand(0.65, 0.90),
          };
        },
        { prof: profileName, sId: shotId }
      );
    };

    const desktopReadback = await readbackBands('desktop', 'day-plaza');
    const tabletReadback = await readbackBands('tablet', 'day-plaza');

    const midgroundDiff = Number(
      (tabletReadback.midground.luma - desktopReadback.midground.luma).toFixed(2)
    );
    const horizonDiff = Number(
      (tabletReadback.horizon.luma - desktopReadback.horizon.luma).toFixed(2)
    );

    const gate2Checks = {
      desktopReadback,
      tabletReadback,
      midgroundLumaDiff: {
        desktop: desktopReadback.midground.luma,
        tablet: tabletReadback.midground.luma,
        diff: midgroundDiff,
        tolerance: 1.5,
        pass: Math.abs(midgroundDiff) <= 1.5,
      },
      horizonLumaDiff: {
        desktop: desktopReadback.horizon.luma,
        tablet: tabletReadback.horizon.luma,
        diff: horizonDiff,
        tolerance: 1.5,
        pass: Math.abs(horizonDiff) <= 1.5,
      },
      atmosphereActiveOnTablet: {
        value: tabletReadback.uAtmosphere,
        pass: tabletReadback.uAtmosphere === 1.0 && tabletReadback.hasDepthTex,
      },
    };
    const gate2Pass =
      gate2Checks.midgroundLumaDiff.pass &&
      gate2Checks.horizonLumaDiff.pass &&
      gate2Checks.atmosphereActiveOnTablet.pass;

    // =========================================================================
    // GATE 3: Side-by-Side Visual & Density Parity Captures (844x390)
    // =========================================================================
    const shotsToCapture = ['day-plaza', 'day-flower-lobby', 'day-arena-wisteria'];
    const capturedFiles = [];

    for (const shotId of shotsToCapture) {
      for (const prof of ['desktop', 'tablet']) {
        await page.evaluate(
          ({ p, s }) => {
            const w = window.__WORLD__;
            w.exitStoneInspection?.();
            w.stoneGazeState.inspectActive = false;
            w.stoneGazeState.inspectBlend = 0;
            w.setProfile(p);
            w.setShot(s);
            w.toggleHud?.(false);
            w.post.render(0.016);
            w.post.render(0.016);
          },
          { p: prof, s: shotId }
        );
        await page.waitForTimeout(80);
        const outPath = path.join(OUT_DIR, `${shotId}-${prof}.png`);
        await page.screenshot({ path: outPath });
        capturedFiles.push(outPath);
      }
    }

    // Close-up Stone 1, Stone 2, Stone 3 inspections on both desktop & tablet
    const stoneSpecs = [
      {
        label: 'stone1-well',
        id: 'stone_plaza',
        siteKey: 'well',
        x: 0.0,
        z: 0.0,
        rotY: 0.0,
      },
      {
        label: 'stone2-grove',
        id: 'stone_grove',
        siteKey: 'grove',
        x: 114.0,
        z: 32.0,
        rotY: -0.38,
      },
      {
        label: 'stone3-wall',
        id: 'stone_pier',
        siteKey: 'cottage_wall',
        x: -92.0,
        z: 64.0,
        rotY: 0.45,
      },
    ];

    const stoneTriStats = {};
    for (const st of stoneSpecs) {
      for (const prof of ['desktop', 'tablet']) {
        const stats = await page.evaluate(
          ({ p, spec }) => {
            const w = window.__WORLD__;
            w.setProfile(p);
            w.setTimeOfDay('day');
            if (w.coopSystem?.campaignLoop) {
              w.coopSystem.campaignLoop.isStoneContested = () => false;
            }
            if (w.enemyManager?.clearAll) {
              w.enemyManager.clearAll();
            }
            w.scene.traverse((obj) => {
              if (obj.isSkinnedMesh) obj.visible = false;
            });
            w.coopSystem.teleportLeaderAndPartner(spec.x, spec.z + 2.5, 0);
            w.camState.mode = 'player';
            w.enterStoneInspection({
              id: spec.id,
              siteKey: spec.siteKey,
              position: { x: spec.x, z: spec.z },
              rotY: spec.rotY,
            });
            w.stoneGazeState.inspectActive = true;
            w.stoneGazeState.inspectBlend = 1.0;
            // Synchronize camera to inspectPos/inspectTarget and update monument LOD
            w.camera.position.copy(w.stoneGazeState.inspectPos);
            w.camera.lookAt(w.stoneGazeState.inspectTarget);
            w.camera.fov = w.stoneGazeState.inspectFov || 42;
            w.camera.updateProjectionMatrix();
            w.camera.updateMatrixWorld(true);
            w.stoneDecals?.updateLod?.(w.camera);
            // Hide combat banner & HUD for clean stone inspection frame
            const banner = document.getElementById('combat-banner');
            if (banner) banner.classList.remove('visible');
            w.toggleHud?.(false);
            if (w.coopSystem?.knight?.group) w.coopSystem.knight.group.visible = false;
            if (w.coopSystem?.mage?.group) w.coopSystem.mage.group.visible = false;
            w.terrainKit.update(
              0.016,
              1.25,
              w.sky.activeLightDir,
              w.sky.state.daylight,
              w.sky.state.fogColor,
              w.sky.state.worldTint,
              w.camera,
              p
            );
            w.post.render(0.016);
            w.post.render(0.016);
            return {
              calls: w.renderer.info.render.calls,
              triangles: w.renderer.info.render.triangles,
            };
          },
          { p: prof, spec: st }
        );
        stoneTriStats[`${st.label}-${prof}`] = stats;
        await page.waitForTimeout(80);
        const outPath = path.join(OUT_DIR, `inspect-${st.label}-${prof}.png`);
        await page.screenshot({ path: outPath });
        capturedFiles.push(outPath);
      }
    }

    // =========================================================================
    // GATE 4: `/api/mobile-telemetry` POST & GET Live Endpoint Check
    // =========================================================================
    const samplePayload = {
      ua: 'Realme 11 Pro RMX3771 (Dimensity 7050 / Mali-G68 MC4)',
      viewport: { width: 844, height: 390 },
      dpr: 1.35,
      fps: 60,
      avgFrameMs: 11.8,
      p95FrameMs: 14.1,
      maxFrameMs: 15.6,
      draws: plazaMali.totalDrawCalls,
      triangles: plazaMali.totalTrianglesSubmitted,
      maliPredictedMs: plazaMali.predictedFrameMs,
    };

    const originUrl = `http://127.0.0.1:${srv.port}`;
    const postRes = await fetch(`${originUrl}/api/mobile-telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePayload),
    });
    const postJson = await postRes.json();

    const getRes = await fetch(`${originUrl}/api/mobile-telemetry`);
    const getJson = await getRes.json();

    const latestFile = path.resolve(process.cwd(), 'world/shots/latest-mobile-telemetry.json');
    const latestFileExists = fs.existsSync(latestFile);

    const gate4Checks = {
      postStatus: postRes.status,
      postOk: Boolean(postJson?.ok),
      getStatus: getRes.status,
      getOk: Boolean(getJson?.ok),
      count: getJson?.count ?? 0,
      latestMatches: getJson?.latest?.ua === samplePayload.ua,
      latestFileExists,
    };
    const gate4Pass =
      gate4Checks.postStatus === 200 &&
      gate4Checks.postOk &&
      gate4Checks.getStatus === 200 &&
      gate4Checks.getOk &&
      gate4Checks.count >= 1 &&
      gate4Checks.latestMatches &&
      gate4Checks.latestFileExists;

    const summary = {
      timestamp: new Date().toISOString(),
      allGatesPass:
        gate1Pass &&
        gate2Pass &&
        gate4Pass &&
        pageErrors.length === 0 &&
        consoleErrors.length === 0,
      gate1: {
        pass: gate1Pass,
        checks: gate1Checks,
        maliReports,
      },
      gate2: {
        pass: gate2Pass,
        checks: gate2Checks,
      },
      gate3: {
        capturedFiles,
        stoneTriStats,
      },
      gate4: {
        pass: gate4Pass,
        checks: gate4Checks,
      },
      pageErrors,
      consoleErrors,
    };

    const reportPath = path.join(OUT_DIR, 'verification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(JSON.stringify(summary, null, 2));

    if (!summary.allGatesPass) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    srv.server.close();
  }
}

main().catch((err) => {
  console.error('[verify] Fatal error:', err);
  process.exit(1);
});
