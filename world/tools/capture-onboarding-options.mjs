// ============================================================================
// world/tools/capture-onboarding-options.mjs
//
// Records 3 distinct artist-grade live videos (.mp4 + .webm) and keyframe PNGs
// for the Amarante Dither World-Materialization + Onboarding Flow (`?onboard_opt=1|2|3`).
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { startServer } from './serve.mjs';

async function loadChromium() {
  const candidates = [
    'playwright',
    'C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs',
    'C:/Users/silen/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs',
  ];
  for (const modPath of candidates) {
    try {
      const spec = modPath.startsWith('C:/')
        ? pathToFileURL(modPath).href
        : modPath;
      const pw = await import(spec);
      if (pw?.chromium) return pw.chromium;
      if (pw?.default?.chromium) return pw.default.chromium;
    } catch {
      // try next candidate
    }
  }
  throw new Error('Could not resolve playwright chromium');
}

const FFMPEG_BIN =
  'C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe';
const OUT_DIR = path.resolve(
  import.meta.dirname,
  '../shots/onboarding-options'
);

const OPTIONS_META = [
  {
    id: 1,
    slug: 'option-1-sunbeam-stipple',
    title: 'Option 1 — Sunbeam Halftone Stipple & Horizon Editorial',
  },
];

async function captureOptionOnPage(page, optMeta, consoleErrors) {
  const { id, slug, title } = optMeta;
  console.log(`\n=== Capturing ${title} ===`);

  const framesDir = path.join(OUT_DIR, `_frames_${slug}`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  // Reset appFlow state cleanly to `title` with the selected option `id`
  // and move 3D heroes back to plaza so the Southern Flower Field vista is unobstructed.
  await page.mouse.move(10, 10);
  await page.evaluate((optId) => {
    const world = window.__WORLD__;
    if (world?.coopSystem?.teleportLeaderAndPartner) {
      world.coopSystem.teleportLeaderAndPartner(2.8, 14.5, Math.PI);
    }
    const af = window.__APP_FLOW__;
    af.setOnboardingOption(optId);
    af.setLobbyState({
      roomPhrase: 'Rain on warm limestone',
      playerName: '',
      partnerName: '',
      partnerClaimed: false,
      peerConnected: false,
      localRole: 'Knight',
      hostRole: 'Knight',
      partnerRole: 'Mage',
    });
    const nameIn = document.getElementById('app-flow-name-input');
    if (nameIn) nameIn.value = '';
    af.setStep('title', { silent: false });
    af.stopMosaicLoop();
    af.renderDitherVeilAtProgress(0.02);
  }, id);

  await page.waitForTimeout(250);

  const totalFrames = 225; // 7.5 seconds at 30 FPS

  for (let f = 0; f < totalFrames; f++) {
    if (f <= 74) {
      // 0.00s - 2.47s: Live Dither Materialization from t=0.02 to t=1.00
      const t = Math.min(1.0, 0.02 + (f / 72) * 0.98);
      await page.evaluate((prog) => {
        window.__APP_FLOW__.stopMosaicLoop();
        window.__APP_FLOW__.renderDitherVeilAtProgress(prog);
      }, t);
    } else if (f === 84) {
      // 2.80s: Click "Enter the Valley" -> transitions to `create_join`
      await page.click('#app-flow-enter-btn');
    } else if (f === 100) {
      // 3.33s: Click active room phrase to cycle it ("Rain on warm limestone" -> "Two lanterns under wisteria")
      await page.click('#app-flow-active-phrase');
    } else if (f === 112) {
      // 3.73s: Hover "Create" button
      await page.hover('#app-flow-create-btn');
    } else if (f === 132) {
      // 4.40s: Click "Create" -> transitions camera to Southern Flower Field (`flower_lobby`),
      // playing one-shot `wave` and `cheer` once and then clamping completely still!
      await page.click('#app-flow-create-btn');
      await page.mouse.move(10, 10);
    } else if (f === 142) {
      // Type "Vikas" on Knight while Mage shows "Tap to claim" badge above hat
      await page.fill('#app-flow-name-input', 'Vikas');
      await page.evaluate(() => {
        window.__APP_FLOW__.setLobbyState({
          localRole: 'Knight',
          hostRole: 'Knight',
          partnerRole: 'Mage',
          playerName: 'Vikas',
          partnerName: '',
          partnerClaimed: false,
        });
      });
    } else if (f === 176) {
      // Click Mage to demonstrate callout sliding smoothly to Mage while both heroes stand still
      await page.evaluate(() => {
        window.__APP_FLOW__.claimCharacter('Mage', 'Vikas');
      });
    } else if (f === 198) {
      // Claim Knight again and show partner "Ishika" on Mage
      await page.evaluate(() => {
        window.__APP_FLOW__.claimCharacter('Knight', 'Vikas');
        window.__APP_FLOW__.setLobbyState({
          localRole: 'Knight',
          hostRole: 'Knight',
          partnerRole: 'Mage',
          playerName: 'Vikas',
          partnerName: 'Ishika',
          partnerClaimed: true,
        });
      });
    }

    await page.waitForTimeout(28);

    const framePath = path.join(
      framesDir,
      `frame-${String(f).padStart(4, '0')}.jpg`
    );
    await page.screenshot({
      path: framePath,
      type: 'jpeg',
      quality: 92,
    });

    if (f === 22) {
      await page.screenshot({
        path: path.join(OUT_DIR, `${slug}-dither-early.png`),
        type: 'png',
      });
    } else if (f === 46) {
      await page.screenshot({
        path: path.join(OUT_DIR, `${slug}-dither-mid.png`),
        type: 'png',
      });
    } else if (f === 78) {
      await page.screenshot({
        path: path.join(OUT_DIR, `${slug}-title-ready.png`),
        type: 'png',
      });
    } else if (f === 116) {
      await page.screenshot({
        path: path.join(OUT_DIR, `${slug}-create-join.png`),
        type: 'png',
      });
    } else if (f === 190) {
      await page.screenshot({
        path: path.join(OUT_DIR, `${slug}-flower-lobby.png`),
        type: 'png',
      });
    }
  }

  const mp4Path = path.join(OUT_DIR, `${slug}.mp4`);
  const webmPath = path.join(OUT_DIR, `${slug}.webm`);
  const inputPattern = path.join(framesDir, 'frame-%04d.jpg');

  execFileSync(
    FFMPEG_BIN,
    [
      '-y',
      '-nostdin',
      '-framerate',
      '30',
      '-i',
      inputPattern,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '18',
      '-preset',
      'fast',
      mp4Path,
    ],
    { stdio: 'pipe' }
  );

  execFileSync(
    FFMPEG_BIN,
    [
      '-y',
      '-nostdin',
      '-framerate',
      '30',
      '-i',
      inputPattern,
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '2.5M',
      '-pix_fmt',
      'yuv420p',
      webmPath,
    ],
    { stdio: 'pipe' }
  );

  fs.rmSync(framesDir, { recursive: true, force: true });

  console.log(
    `Saved:\n  MP4:  ${mp4Path}\n  WEBM: ${webmPath}\n  Console errors: ${consoleErrors.length}`
  );
  return { mp4Path, webmPath };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { server, url } = await startServer(0, '127.0.0.1');
  console.log(`Ephemeral world server listening at ${url}`);

  const chromium = await loadChromium();
  const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(chromeExe) ? chromeExe : undefined,
    args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('[Browser Console Error]', msg.text());
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      console.error('[Browser Page Error]', err);
      consoleErrors.push(String(err?.message || err));
    });
    page.on('requestfailed', (req) => {
      console.error('[Request Failed]', req.url(), req.failure()?.errorText);
    });

    await page.goto(`${url}?flow=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    console.log('Waiting for __WORLD_READY__ and __APP_FLOW__...');
    await page.waitForFunction(
      () => Boolean(window.__WORLD_READY__ && window.__APP_FLOW__),
      { timeout: 60000 }
    );
    // Give KayKit GLTF models 1.5s to finish async loading
    await page.waitForTimeout(1500);

    for (const optMeta of OPTIONS_META) {
      await captureOptionOnPage(page, optMeta, consoleErrors);
    }

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
