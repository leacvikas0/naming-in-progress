// ============================================================================
// qa-review/divine-verdict/run-divine-verdict-qa.mjs
//
// Independent 3D Scene & Live Gameplay Video QA Harness
// Captures:
//   0. briar-10-variations-chart.png  (2560x3680 — 10-Option Briar Optimization Chart)
//      + briar-option-01.png .. briar-option-10.png
//   1. shot-37-prayer-throw.png       (1600x900 — 09-divine-prayer-eclipse-throw)
//   2. shot-57a-briar-net-creeping.png(1600x900 — 10a-divine-briar-net-creeping)
//   3. shot-57-briar-jail.png         (1600x900 — 10-divine-briar-jail-lattice, Winner Option 04)
//   4. shot-beat3-flower-slump.png    (1600x900 — 11-divine-underground-flower-slump)
//   5. shot-41a-smite-dying-mid-dissolve.png (1600x900 — 12a-divine-smite-dying-mid-dissolve)
//   6. shot-41-smite-bw-dissolve.png  (1600x900 — 12-divine-smite-bw-petal-dissolve)
//   7. clip-blessing-resurrection.webm (1280x720 @ 30fps, live motion with complete Beat 2 plunge)
//   8. clip-smite-dissolve.webm        (1280x720 @ 30fps, live motion)
// ============================================================================

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { startServer } from '../../world/tools/serve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = __dirname;

const BRIAR_10_VARIATIONS = [
  {
    num: 1,
    file: 'briar-option-01.png',
    title: 'OPT 01 — Baseline Thin & Flat (Pre-Optimization)',
    subtitle: 'Tube: 1.00x (r=8.4cm) | Arches: 24 | Peak: 0.95x | BowerAO: 0.20 | Flowers: 1.00x | Olive-Walnut',
    recommended: false,
    preset: {
      tubeRadiusScale: 1.0,
      flowerScale: 1.0,
      bowerAO: 0.2,
      sapIntensity: 0.75,
      wetness: 0.65,
      eclipseRim: 0.3,
      barkTone: 0.0,
      activeBriarCount: 24,
      radialSpanMult: 1.0,
      crownHeightMult: 0.95,
    },
  },
  {
    num: 2,
    file: 'briar-option-02.png',
    title: 'OPT 02 — Open Sculptural Cage (Sparse 12 Arches)',
    subtitle: 'Tube: 1.45x (r=12.2cm) | Arches: 12 | Peak: 1.18x | BowerAO: 0.65 | Flowers: 1.18x | Olive-Walnut',
    recommended: false,
    preset: {
      tubeRadiusScale: 1.45,
      flowerScale: 1.18,
      bowerAO: 0.65,
      sapIntensity: 0.9,
      wetness: 0.9,
      eclipseRim: 0.6,
      barkTone: 0.0,
      activeBriarCount: 12,
      radialSpanMult: 0.96,
      crownHeightMult: 1.18,
    },
  },
  {
    num: 3,
    file: 'briar-option-03.png',
    title: 'OPT 03 — Medium-Thick Coiling Mound (16 Arches)',
    subtitle: 'Tube: 1.70x (r=14.3cm) | Arches: 16 | Peak: 1.22x | BowerAO: 0.80 | Flowers: 1.24x | Olive-Walnut',
    recommended: false,
    preset: {
      tubeRadiusScale: 1.7,
      flowerScale: 1.24,
      bowerAO: 0.8,
      sapIntensity: 1.0,
      wetness: 1.05,
      eclipseRim: 0.75,
      barkTone: 0.0,
      activeBriarCount: 16,
      radialSpanMult: 0.98,
      crownHeightMult: 1.22,
    },
  },
  {
    num: 4,
    file: 'briar-option-04.png',
    title: 'OPT 04 — Thick Sculptural Mound + Eclipse Peak',
    subtitle: 'Tube: 1.95x (r=16.4cm) | Arches: 18 | Peak: 1.28x | BowerAO: 0.88 | Flowers: 1.32x | Olive-Walnut',
    recommended: false,
    preset: {
      tubeRadiusScale: 1.95,
      flowerScale: 1.32,
      bowerAO: 0.88,
      sapIntensity: 1.08,
      wetness: 1.15,
      eclipseRim: 0.88,
      barkTone: 0.0,
      activeBriarCount: 18,
      radialSpanMult: 1.0,
      crownHeightMult: 1.28,
    },
  },
  {
    num: 5,
    file: 'briar-option-05.png',
    title: 'OPT 05 — Extra-Thick Ancient Boughs (14 Arches)',
    subtitle: 'Tube: 2.35x (r=19.7cm) | Arches: 14 | Peak: 1.32x | BowerAO: 0.92 | Flowers: 1.38x | Olive-Walnut',
    recommended: false,
    preset: {
      tubeRadiusScale: 2.35,
      flowerScale: 1.38,
      bowerAO: 0.92,
      sapIntensity: 1.1,
      wetness: 1.2,
      eclipseRim: 0.9,
      barkTone: 0.0,
      activeBriarCount: 14,
      radialSpanMult: 1.02,
      crownHeightMult: 1.32,
    },
  },
  {
    num: 6,
    file: 'briar-option-06.png',
    title: 'OPT 06 — Colossal Gnarled Trunks (Max 2.75x Tube)',
    subtitle: 'Tube: 2.75x (r=23.1cm) | Arches: 12 | Peak: 1.36x | BowerAO: 0.95 | Flowers: 1.45x | Olive-Walnut',
    recommended: false,
    preset: {
      tubeRadiusScale: 2.75,
      flowerScale: 1.45,
      bowerAO: 0.95,
      sapIntensity: 1.15,
      wetness: 1.25,
      eclipseRim: 0.95,
      barkTone: 0.0,
      activeBriarCount: 12,
      radialSpanMult: 1.04,
      crownHeightMult: 1.36,
    },
  },
  {
    num: 7,
    file: 'briar-option-07.png',
    title: 'OPT 07 — Thick + High-Density Fortress (28 Arches)',
    subtitle: 'Tube: 1.90x (r=16.0cm) | Arches: 28 | Peak: 1.32x | BowerAO: 0.92 | Flowers: 1.28x | Olive-Walnut',
    recommended: false,
    preset: {
      tubeRadiusScale: 1.9,
      flowerScale: 1.28,
      bowerAO: 0.92,
      sapIntensity: 1.05,
      wetness: 1.15,
      eclipseRim: 0.85,
      barkTone: 0.0,
      activeBriarCount: 28,
      radialSpanMult: 1.02,
      crownHeightMult: 1.32,
    },
  },
  {
    num: 8,
    file: 'briar-option-08.png',
    title: 'OPT 08 — Thick + Deep Mossy Woodland Olive Bark',
    subtitle: 'Tube: 1.95x (r=16.4cm) | Arches: 18 | Peak: 1.28x | BowerAO: 0.88 | Flowers: 1.32x | Mossy-Olive',
    recommended: false,
    preset: {
      tubeRadiusScale: 1.95,
      flowerScale: 1.32,
      bowerAO: 0.88,
      sapIntensity: 0.95,
      wetness: 1.1,
      eclipseRim: 0.78,
      barkTone: 1.0,
      activeBriarCount: 18,
      radialSpanMult: 1.0,
      crownHeightMult: 1.28,
    },
  },
  {
    num: 9,
    file: 'briar-option-09.png',
    title: 'OPT 09 — Thick + Warm Chestnut-Mahogany Bark ★',
    subtitle: 'Tube: 1.95x (r=16.4cm) | Arches: 18 | Peak: 1.28x | BowerAO: 0.88 | Flowers: 1.32x | Chestnut-Mahogany',
    recommended: true,
    preset: {
      tubeRadiusScale: 1.95,
      flowerScale: 1.32,
      bowerAO: 0.88,
      sapIntensity: 1.15,
      wetness: 1.15,
      eclipseRim: 0.92,
      barkTone: 2.0,
      activeBriarCount: 18,
      radialSpanMult: 1.0,
      crownHeightMult: 1.28,
    },
  },
  {
    num: 10,
    file: 'briar-option-10.png',
    title: 'OPT 10 — Thick + Lush Giant Blooms & Wet Blood-Sap',
    subtitle: 'Tube: 2.05x (r=17.2cm) | Arches: 20 | Peak: 1.35x | Flowers: 1.65x | Sap/Wet: 1.45/1.50 | Rim: 1.25',
    recommended: false,
    preset: {
      tubeRadiusScale: 2.05,
      flowerScale: 1.65,
      bowerAO: 0.92,
      sapIntensity: 1.45,
      wetness: 1.5,
      eclipseRim: 1.25,
      barkTone: 0.0,
      activeBriarCount: 20,
      radialSpanMult: 1.0,
      crownHeightMult: 1.35,
    },
  },
];

const WINNER_PRESET = BRIAR_10_VARIATIONS[8].preset;

const STILL_SHOTS = [
  {
    id: '09-divine-prayer-eclipse-throw',
    file: 'shot-37-prayer-throw.png',
    hideHud: true,
  },
  {
    id: '10a-divine-briar-net-creeping',
    file: 'shot-57a-briar-net-creeping.png',
    hideHud: true,
  },
  {
    id: '10-divine-briar-jail-lattice',
    file: 'shot-57-briar-jail.png',
    hideHud: true,
  },
  {
    id: '11-divine-underground-flower-slump',
    file: 'shot-beat3-flower-slump.png',
    hideHud: false,
  },
  {
    id: '12a-divine-smite-dying-mid-dissolve',
    file: 'shot-41a-smite-dying-mid-dissolve.png',
    hideHud: true,
  },
  {
    id: '12-divine-smite-bw-petal-dissolve',
    file: 'shot-41-smite-bw-dissolve.png',
    hideHud: true,
  },
];

async function captureBriarVariationsAndChart(browser, baseUrl) {
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

  // Initialize a 2x5 composite comparison chart canvas inside the page (2560 x 3680)
  await page.evaluate(() => {
    const chart = document.createElement('canvas');
    chart.id = '__briar_10_chart__';
    chart.width = 2560;
    chart.height = 3680;
    const ctx = chart.getContext('2d');
    ctx.fillStyle = '#0c090d';
    ctx.fillRect(0, 0, chart.width, chart.height);

    // Header Banner
    ctx.fillStyle = '#181118';
    ctx.fillRect(0, 0, chart.width, 130);
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 130);
    ctx.lineTo(chart.width, 130);
    ctx.stroke();

    ctx.fillStyle = '#fdfaf2';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(
      'HARU-MACHI — BRIAR BOWER 10-OPTION REALISM & THICKNESS OPTIMIZATION CHART',
      36,
      58
    );
    ctx.fillStyle = '#fda4af';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(
      'Varying: Tube Radius (1.00x -> 2.28x) | Active Arches (18 -> 36) | 3D Bower Cavity AO | Sap & Wet Sheen | Eclipse Rim | Bark Tone',
      36,
      100
    );
    window.__BRIAR_CHART_CANVAS__ = chart;
  });

  for (let idx = 0; idx < BRIAR_10_VARIATIONS.length; idx++) {
    const opt = BRIAR_10_VARIATIONS[idx];
    await page.evaluate(
      ({ opt, idx }) => {
        const w = window.__WORLD__;
        w.appFlow?.skipToGame?.();
        w.toggleHud(false);
        w.vfxKit.artoriousVfx.setBriarStylePreset(opt.preset);
        w.setGameplayShot('10-divine-briar-jail-lattice');
        w.post.render(0.016);

        const webglCanvas = document.getElementById('world-canvas');
        const chart = window.__BRIAR_CHART_CANVAS__;
        const ctx = chart.getContext('2d');

        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const padX = 28;
        const padY = 22;
        const cellW = 1228;
        const cellH = 682;
        const headerH = 74;
        const imgH = cellH - headerH;

        const x0 = padX + col * (cellW + padX);
        const y0 = 152 + row * (cellH + padY);

        // Card background
        ctx.fillStyle = opt.recommended ? '#230d15' : '#141016';
        ctx.fillRect(x0, y0, cellW, cellH);

        // Draw cropped center-focus of the 1600x900 render (sx=120, sy=30, sw=1360, sh=675) so the bower fills the frame cleanly
        ctx.drawImage(webglCanvas, 120, 24, 1360, 675, x0, y0 + headerH, cellW, imgH);

        // Header bar
        ctx.fillStyle = opt.recommended ? '#3b0a18' : '#1b151e';
        ctx.fillRect(x0, y0, cellW, headerH);

        ctx.fillStyle = opt.recommended ? '#fbbf24' : '#fdfaf2';
        ctx.font = 'bold 23px sans-serif';
        ctx.fillText(opt.title, x0 + 18, y0 + 32);

        if (opt.recommended) {
          ctx.fillStyle = '#e11d48';
          ctx.fillRect(x0 + cellW - 235, y0 + 10, 218, 30);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText('★ RECOMMENDED PICK', x0 + cellW - 222, y0 + 31);
        }

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(opt.subtitle, x0 + 18, y0 + 58);

        // Card border
        ctx.strokeStyle = opt.recommended ? '#fbbf24' : 'rgba(225, 29, 72, 0.45)';
        ctx.lineWidth = opt.recommended ? 5 : 2;
        ctx.strokeRect(x0, y0, cellW, cellH);
      },
      { opt, idx }
    );

    await page.waitForTimeout(80);
    const outPath = path.join(OUT_DIR, opt.file);
    await page.screenshot({ path: outPath });
    console.log(`[VARIATION ${opt.num}/10] ${opt.file} -> ${outPath}`);
  }

  // Export the composite 2560x3680 10-option chart PNG
  const chartB64 = await page.evaluate(() => {
    const chart = window.__BRIAR_CHART_CANVAS__;
    return chart.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  });
  const chartPath = path.join(OUT_DIR, 'briar-10-variations-chart.png');
  fs.writeFileSync(chartPath, Buffer.from(chartB64, 'base64'));
  console.log(`[10-OPTION CHART SAVED] ${chartPath}`);

  // Also capture a 6-frame Beat 2 Downward Plunge Strip (t = 2.08s, 2.22s, 2.34s, 2.45s, 2.54s, 2.62s)
  // to verify that the vines physically sink 100% into the cobblestones before Beat 3 (2.65s)!
  const plungeB64 = await page.evaluate((winnerPreset) => {
    const w = window.__WORLD__;
    w.appFlow?.skipToGame?.();
    w.toggleHud(false);
    w.vfxKit.artoriousVfx.setBriarStylePreset(winnerPreset);
    w.setGameplayShot('10-divine-briar-jail-lattice');

    const strip = document.createElement('canvas');
    strip.width = 2400;
    strip.height = 920;
    const ctx = strip.getContext('2d');
    ctx.fillStyle = '#0c090d';
    ctx.fillRect(0, 0, strip.width, strip.height);

    const times = [2.08, 2.22, 2.34, 2.45, 2.54, 2.62];
    const webglCanvas = document.getElementById('world-canvas');
    const kState = w.coopSystem.heroStates.Knight;
    const mState = w.coopSystem.heroStates.Mage;

    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      w.vfxKit.artoriousVfx.seek(t, { camera: w.camera });
      const kLevY = w.vfxKit.artoriousVfx.getHeroLevitationOffset('Knight');
      const mLevY = w.vfxKit.artoriousVfx.getHeroLevitationOffset('Mage');
      w.coopSystem.knight.group.position.y = kState.y + kLevY;
      w.coopSystem.mage.group.position.y = mState.y + mLevY;
      w.post.render(0.016);

      const col = i % 3;
      const row = Math.floor(i / 3);
      const cellW = 780;
      const cellH = 440;
      const x0 = 15 + col * 795;
      const y0 = 15 + row * 450;

      ctx.drawImage(webglCanvas, 120, 24, 1360, 675, x0, y0 + 44, cellW, cellH - 44);
      ctx.fillStyle = '#1b151e';
      ctx.fillRect(x0, y0, cellW, 44);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 18px monospace';
      const subDepth = w.vfxKit.artoriousVfx.monolithMetaAttr.getZ(0).toFixed(2);
      ctx.fillText(
        `BEAT 2 FRAME ${i + 1}/6 | t = ${t.toFixed(2)}s / 2.65s | submergeDepth = -${subDepth}m`,
        x0 + 14,
        y0 + 28
      );
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0, cellW, cellH);
    }
    return strip.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  }, WINNER_PRESET);
  const plungeStripPath = path.join(OUT_DIR, 'beat2-plunge-strip.png');
  fs.writeFileSync(plungeStripPath, Buffer.from(plungeB64, 'base64'));
  console.log(`[BEAT 2 PLUNGE STRIP SAVED] ${plungeStripPath}`);

  await page.close();
  await context.close();
  return chartPath;
}

async function captureStills(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message || String(err)));

  await page.goto(`${baseUrl}/world/index.html?nolobby=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(250);

  const telemetry = {};

  for (const shot of STILL_SHOTS) {
    const meta = await page.evaluate(
      ({ id, hideHud, winnerPreset }) => {
        const w = window.__WORLD__;
        w.appFlow?.skipToGame?.();
        w.toggleHud(!hideHud);
        w.vfxKit.artoriousVfx.setBriarStylePreset(winnerPreset);
        w.setGameplayShot(id);
        if (!hideHud) {
          // Hide banner & mobile/action buttons so only top-left Party HP Bars show cleanly
          const banner = document.getElementById('combat-banner');
          if (banner) banner.classList.remove('visible');
          document
            .querySelectorAll(
              '#mobile-controls, .mobile-controls, #touch-controls, #sculpted-action-cluster, #sculpted-pause-btn'
            )
            .forEach((el) => {
              el.style.display = 'none';
            });
        }
        w.post.render(0.016);
        const stats = w.getStats();
        const vfx = w.vfxKit.artoriousVfx;
        const tShadows = w.terrainKit?.terrainMat?.uniforms?.uCharShadows?.value || [];
        return {
          shotId: id,
          draws: stats.draws,
          triangles: stats.triangles,
          eclipseWeight: w.sky.state.eclipseWeight,
          eclipseCompression: w.sky.state.eclipseCompression,
          windTimeScale: w.sky.getWindTimeScale(),
          smiteMonochrome: w.post.params.grade.uSmiteMonochrome?.value ?? 0,
          knightVisible: w.coopSystem.knight.group.visible,
          mageVisible: w.coopSystem.mage.group.visible,
          swordVfxVisible: w.vfxKit.swordVfx?.group?.visible ?? false,
          knightShadowActive: tShadows[0]?.w ?? -1,
          mageShadowActive: tShadows[1]?.w ?? -1,
          vfxActive: vfx.active,
          vfxMode: vfx.mode,
          monolithsCount: vfx.monolithsMesh.count,
          petalsCount: vfx.prismsAndDebrisMesh.count,
          slumpCount: vfx.groundSigilMesh.count,
          ribbonsCount: vfx.skyRibbonsMesh.count,
          enemies: w.enemyManager.activeEnemies.map((e) => ({
            archetype: e.archetype,
            x: Number(e.x.toFixed(2)),
            y: Number(e.y.toFixed(2)),
            z: Number(e.z.toFixed(2)),
            rotX: Number(e.group.rotation.x.toFixed(2)),
            rotZ: Number(e.group.rotation.z.toFixed(2)),
            mixerTimeScale: e.char?.mixer?.timeScale ?? 1,
          })),
        };
      },
      { ...shot, winnerPreset: WINNER_PRESET }
    );

    await page.waitForTimeout(120);
    const outPath = path.join(OUT_DIR, shot.file);
    await page.screenshot({ path: outPath });
    telemetry[shot.file] = { path: outPath, ...meta };
    console.log(`[STILL CAPTURED] ${shot.file} -> ${outPath}`, JSON.stringify(meta));
  }

  await page.close();
  await context.close();
  return { telemetry, consoleErrors };
}

async function recordVideoClip(browser, baseUrl, clipName, runScenarioInBrowser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message || String(err)));

  await page.goto(`${baseUrl}/world/index.html?nolobby=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(200);

  const result = await page.evaluate(runScenarioInBrowser);

  await page.close();
  await context.close();

  const finalPath = path.join(OUT_DIR, `${clipName}.webm`);
  fs.writeFileSync(finalPath, Buffer.from(result.b64, 'base64'));
  const stat = await fsp.stat(finalPath);
  console.log(
    `[VIDEO RECORDED] ${clipName}.webm (${(stat.size / 1024).toFixed(1)} KB, errors=${consoleErrors.length}) -> ${finalPath}`
  );
  return {
    path: finalPath,
    bytes: stat.size,
    timelineSamples: result.samples,
    consoleErrors,
  };
}

async function main() {
  await fsp.mkdir(OUT_DIR, { recursive: true });
  const { server, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  try {
    await captureBriarVariationsAndChart(browser, baseUrl);
    const stillsRes = await captureStills(browser, baseUrl);

    // Clip 1: Blessing & Underground Resurrection (~9.0s unhurried wall-clock @ 0.82x timeScale)
    // Prayer Start -> Beat 1 (0..2.10s) slow-to-whip asymmetric brown-root net -> Beat 2 (2.10..2.65s) complete downward plunge
    // -> Beat 3 (2.65..4.25s) quiet flower slump + smooth HP fill -> Beat 4 (4.25..4.80s) side-by-side pop-up
    const blessingVideo = await recordVideoClip(
      browser,
      baseUrl,
      'clip-blessing-resurrection',
      async () => {
        // Use real wall-clock delta scaled by 0.82x so 144Hz rAF never fast-forwards the video!
        delete window.__FIXED_DT__;
        window.__TIME_SCALE__ = 0.82;
        const w = window.__WORLD__;
        w.appFlow?.skipToGame?.();
        w.setTimeOfDay('day');
        w.toggleHud(false);
        w.enemyManager.clearAllEnemies();

        // Apply Winner Option 04 preset (Thick Sculptural Mound + Eclipse Peak)
        w.vfxKit.artoriousVfx.setBriarStylePreset({
          tubeRadiusScale: 1.95,
          flowerScale: 1.32,
          bowerAO: 0.88,
          sapIntensity: 1.08,
          wetness: 1.15,
          eclipseRim: 0.88,
          barkTone: 0.0,
          activeBriarCount: 18,
          radialSpanMult: 1.0,
          crownHeightMult: 1.28,
        });

        // Place Knight & Mage on the grey Town Plaza cobblestones facing the camera
        const kState = w.coopSystem.heroStates.Knight;
        const mState = w.coopSystem.heroStates.Mage;
        kState.x = -0.76;
        kState.z = 9.2;
        kState.y = w.vfxKit.artoriousVfx.getGroundHeight(kState.x, kState.z);
        kState.yaw = 0.22;
        mState.x = 0.76;
        mState.z = 9.2;
        mState.y = w.vfxKit.artoriousVfx.getGroundHeight(mState.x, mState.z);
        mState.yaw = -0.25;
        w.player.x = kState.x;
        w.player.y = kState.y;
        w.player.z = kState.z;
        w.player.yaw = kState.yaw;

        // Set Knight low HP (68/220) and Mage downed (0/90) to verify underground revival + smooth HP fill
        w.campaignLoop.combatHeroes.Knight.hp = 68;
        w.campaignLoop.combatHeroes.Knight.downed = false;
        w.campaignLoop.combatHeroes.Mage.hp = 0;
        w.campaignLoop.combatHeroes.Mage.downed = true;
        w.coopSystem.mage.play('death', { loop: false, fade: 0.05, force: true });

        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        w.camState.pitch = -0.02;
        w.camState.dist = 6.6;
        w.coopSystem.startCommuneChannel('Knight', { force: true, camera: w.camera });
        if (w.coopSystem.sanctuarySteleMesh) w.coopSystem.sanctuarySteleMesh.position.y = -999;

        const webglCanvas = document.getElementById('world-canvas');
        const recCanvas = document.createElement('canvas');
        recCanvas.width = 1280;
        recCanvas.height = 720;
        const ctx = recCanvas.getContext('2d');

        let recording = true;
        const samples = [];
        let frameIdx = 0;

        const drawCompositeFrame = () => {
          if (!recording) return;
          if (w.coopSystem.sanctuarySteleMesh) w.coopSystem.sanctuarySteleMesh.position.y = -999;
          ctx.drawImage(webglCanvas, 0, 0, 1280, 720);

          const cLoop = w.campaignLoop;
          const vSeq = cLoop.verdictSequence;
          const k = cLoop.combatHeroes.Knight;
          const m = cLoop.combatHeroes.Mage;
          const dist = w.coopSystem.getHeroDistance().toFixed(2);
          const wind = w.sky.getWindTimeScale().toFixed(2);
          const phaseStr = vSeq.active
            ? `${vSeq.kind.toUpperCase()} Beat ${vSeq.beat} (${vSeq.elapsed.toFixed(2)}s/${vSeq.duration.toFixed(2)}s)`
            : cLoop.communeChannelActive || w.coopSystem.communeChannel.active
              ? 'PRAYER_CHANNEL'
              : cLoop.isDivineBlessingActive()
                ? `BLESSED_30S (${cLoop.getDivineBlessingRemaining().toFixed(1)}s)`
                : 'IDLE';

          // Draw Top-Left Party HP Bars card so smooth HP fill is visually verifiable in video
          ctx.fillStyle = 'rgba(250, 248, 243, 0.90)';
          ctx.strokeStyle = 'rgba(28, 25, 23, 0.22)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(16, 16, 290, 72, 12);
          ctx.fill();
          ctx.stroke();

          // Knight HP bar
          ctx.fillStyle = '#1c1917';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('Knight', 28, 40);
          ctx.fillStyle = 'rgba(28, 25, 23, 0.14)';
          ctx.fillRect(82, 30, 140, 12);
          ctx.fillStyle = '#e11d48';
          ctx.fillRect(82, 30, Math.round(140 * Math.max(0, Math.min(1, k.hp / k.maxHp))), 12);
          ctx.fillStyle = '#1c1917';
          ctx.font = 'bold 11px monospace';
          ctx.fillText(`${k.hp}/${k.maxHp}`, 230, 40);

          // Mage HP bar
          ctx.fillStyle = '#1c1917';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('Mage', 28, 66);
          ctx.fillStyle = 'rgba(28, 25, 23, 0.14)';
          ctx.fillRect(82, 56, 140, 12);
          ctx.fillStyle = m.downed ? '#6b7280' : '#0284c7';
          ctx.fillRect(82, 56, Math.round(140 * Math.max(0, Math.min(1, m.hp / m.maxHp))), 12);
          ctx.fillStyle = m.downed ? '#dc2626' : '#1c1917';
          ctx.font = 'bold 11px monospace';
          ctx.fillText(m.downed ? 'DOWNED' : `${m.hp}/${m.maxHp}`, 230, 66);

          // Draw 1-line QA telemetry bar at bottom-left
          const line = `[${phaseStr}] | Wind=${wind}x Dist=${dist}m | Knight=${k.hp}/${k.maxHp} Mage=${m.hp}/${m.maxHp}${m.downed ? '(DOWN)' : ''} | Vis=${w.coopSystem.knight.group.visible ? 1 : 0}/${w.coopSystem.mage.group.visible ? 1 : 0}`;
          ctx.fillStyle = 'rgba(8, 6, 12, 0.84)';
          ctx.strokeStyle = '#e11d48';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(16, 676, 880, 28, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fdfaf2';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(line, 26, 694);

          if (frameIdx % 8 === 0) {
            samples.push({
              frame: frameIdx,
              phase: phaseStr,
              wind: Number(wind),
              knightHp: k.hp,
              mageHp: m.hp,
              mageDowned: m.downed,
              knightVis: w.coopSystem.knight.group.visible,
              mageVis: w.coopSystem.mage.group.visible,
              monoliths: w.vfxKit.artoriousVfx.monolithsMesh.count,
              slump: w.vfxKit.artoriousVfx.groundSigilMesh.count,
            });
          }
          frameIdx++;
          requestAnimationFrame(drawCompositeFrame);
        };
        requestAnimationFrame(drawCompositeFrame);

        const stream = recCanvas.captureStream(30);
        const chunks = [];
        const rec = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 6000000,
        });
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        const done = new Promise((resolve) => {
          rec.onstop = resolve;
        });

        rec.start();

        // Wait ~1.5s in Prayer Start (Channeling, 0.35x wind, creeping brown roots, drifting crimson petals)
        await new Promise((r) => setTimeout(r, 1500));

        // Trigger Blessing verdict (4.80s 4-beat sequence -> ~5.85s wall-clock @ 0.82x timeScale)
        w.coopSystem.applyCommuneVerdict(
          {
            verdict: 'blessing',
            divine_quote: 'The Court of Dark Flowers restores your bond.',
          },
          'Knight'
        );

        // Wait until the entire 4.80s 4-beat sequence completes in simulation time, plus 1.5s post-pop-up!
        while (w.campaignLoop.verdictSequence.active) {
          await new Promise((r) => setTimeout(r, 60));
        }
        await new Promise((r) => setTimeout(r, 1500));

        recording = false;
        delete window.__TIME_SCALE__;
        rec.stop();
        await done;

        const blob = new Blob(chunks, { type: 'video/webm' });
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        return { b64: btoa(bin), samples };
      }
    );

    const summaryPath = path.join(OUT_DIR, 'qa-telemetry.json');
    await fsp.writeFile(
      summaryPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          stills: stillsRes.telemetry,
          stillsErrors: stillsRes.consoleErrors,
          blessingVideo: {
            path: blessingVideo.path,
            bytes: blessingVideo.bytes,
            errors: blessingVideo.consoleErrors,
            samples: blessingVideo.timelineSamples,
          },
        },
        null,
        2
      )
    );
    console.log(`[QA COMPLETE] Telemetry written to ${summaryPath}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[QA FAILED]', err);
  process.exit(1);
});
