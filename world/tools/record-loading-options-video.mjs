// ============================================================================
// world/tools/record-loading-options-video.mjs
//
// 1. Captures the exact 0ms Title Vista key-art frame (`world/assets/ui/title-vista.jpg`)
//    from the live 3D WebGL scene at `getOpeningCameraPose(FLOW_STEPS.TITLE)`
//    so `world/index.html` can paint the exact 3D camera frame at 0ms before
//    WebGL even boots.
// 2. Records crisp mobile landscape (`844x390` @ 2x DPR) MP4 videos showcasing
//    3 clean, uncluttered, light-themed AA loading & come-alive options
//    transitioning from 0ms instant load directly into the live, wind-swept 3D valley.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';

const REPO_ROOT = process.cwd();
const UI_ASSETS_DIR = path.join(REPO_ROOT, 'world/assets/ui');
const OUT_DIR = path.join(REPO_ROOT, 'world/shots/loading-options');

async function loadChromium() {
  for (const spec of [
    'C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs',
    'playwright-core',
    'playwright',
  ]) {
    try {
      const isPath = spec.startsWith('/') || /^[A-Za-z]:[\\/]/.test(spec);
      const mod = await import(isPath ? pathToFileURL(spec).href : spec);
      const c = mod.chromium || mod.default?.chromium;
      if (c) return c;
    } catch {
      // try next
    }
  }
  throw new Error('Playwright chromium not found');
}

async function main() {
  fs.mkdirSync(UI_ASSETS_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const srv = await startServer(0);
  const baseUrl = `http://127.0.0.1:${srv.port}/world/index.html?nolobby=1`;
  console.log(`[record-loading] Server started at ${baseUrl}`);

  const chromium = await loadChromium();
  const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    executablePath: fs.existsSync(winChrome) ? winChrome : undefined,
    args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist'],
  });

  try {
    // Step 1: Capture the exact Title camera pose (`pos: [0, y+2.35, 136.5]`, `target: [0, y+2.8, 24.0]`, `fov: 50`)
    const ctxCapture = await browser.newContext({
      viewport: { width: 1280, height: 592 },
      deviceScaleFactor: 1.5,
    });
    const pageCap = await ctxCapture.newPage();
    await pageCap.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pageCap.waitForFunction(() => Boolean(window.__WORLD__?.ready), { timeout: 30000 });
    await pageCap.waitForTimeout(400);

    await pageCap.evaluate(() => {
      const w = window.__WORLD__;
      w.toggleHud?.(false);
      w.setProfile('desktop');
      w.setTimeOfDay('day');
      const gy = w.terrainKit?.walkableHeightAt ? w.terrainKit.walkableHeightAt(0, 128) : 2.2;
      w.camState.mode = 'vista';
      w.camState.vistaPos.set(0.0, gy + 2.35, 136.5);
      w.camState.vistaTarget.set(0.0, gy + 2.8, 24.0);
      w.camState.baseFov = 50;
      w.camera.fov = 50;
      w.camera.position.copy(w.camState.vistaPos);
      w.camera.lookAt(w.camState.vistaTarget);
      w.camera.updateProjectionMatrix();
      w.camera.updateMatrixWorld();
      if (w.coopSystem?.knight?.group) w.coopSystem.knight.group.visible = false;
      if (w.coopSystem?.mage?.group) w.coopSystem.mage.group.visible = false;
      w.sky.update(1.25);
      w.terrainKit.update(
        0.016,
        1.25,
        w.sky.activeLightDir,
        w.sky.state.daylight,
        w.sky.state.fogColor,
        w.sky.state.worldTint,
        w.camera,
        'desktop'
      );
      w.meadow.update(1.25, w.camState.vistaTarget, w.camera);
      w.post.render(0.016);
      w.post.render(0.016);
    });
    await pageCap.waitForTimeout(150);

    const vistaJpgPath = path.join(UI_ASSETS_DIR, 'title-vista.jpg');
    await pageCap.screenshot({ path: vistaJpgPath, type: 'jpeg', quality: 86 });
    console.log(
      `[record-loading] Saved 0ms key-art frame: ${vistaJpgPath} (${(
        fs.statSync(vistaJpgPath).size / 1024
      ).toFixed(1)} KB)`
    );
    await ctxCapture.close();

    // Step 2: Record a live mobile landscape (844x390 @ 2x DPR = 1280x592 video) of all 3 options
    // transitioning into the real live 3D WebGL valley!
    const videoTmpDir = path.join(OUT_DIR, 'tmp-video');
    fs.mkdirSync(videoTmpDir, { recursive: true });

    const ctxVid = await browser.newContext({
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 2,
      recordVideo: {
        dir: videoTmpDir,
        size: { width: 1280, height: 592 },
      },
    });
    const pageVid = await ctxVid.newPage();
    await pageVid.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pageVid.waitForFunction(() => Boolean(window.__WORLD__?.ready), { timeout: 30000 });

    await pageVid.evaluate(() => {
      const w = window.__WORLD__;
      w.toggleHud?.(false);
      w.setProfile('tablet');
      w.setTimeOfDay('day');
      const gy = w.terrainKit?.walkableHeightAt ? w.terrainKit.walkableHeightAt(0, 128) : 2.2;
      w.camState.mode = 'vista';
      w.camState.vistaPos.set(0.0, gy + 2.35, 136.5);
      w.camState.vistaTarget.set(0.0, gy + 2.8, 24.0);
      w.camState.baseFov = 50;
      w.camera.fov = 50;
      w.camera.position.copy(w.camState.vistaPos);
      w.camera.lookAt(w.camState.vistaTarget);
      w.camera.updateProjectionMatrix();
      w.camera.updateMatrixWorld();
      if (w.coopSystem?.knight?.group) w.coopSystem.knight.group.visible = false;
      if (w.coopSystem?.mage?.group) w.coopSystem.mage.group.visible = false;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes sakuraSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        #aa-load-showcase {
          position: fixed;
          inset: 0;
          z-index: 9999;
          pointer-events: none;
          font-family: "Plus Jakarta Sans", system-ui, sans-serif;
          overflow: hidden;
        }
        #aa-opt-pill {
          position: absolute;
          top: 14px;
          left: 18px;
          z-index: 40;
          background: rgba(250, 246, 238, 0.94);
          border: 1.5px solid rgba(214, 199, 176, 0.95);
          border-radius: 999px;
          padding: 5px 14px;
          color: #1c1917;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.01em;
          box-shadow: 0 4px 14px rgba(24, 20, 14, 0.12);
        }
        /* 0ms Static Key-Art Layer (matches live 3D camera frame 1:1) */
        #aa-keyart-layer {
          position: absolute;
          inset: 0;
          z-index: 10;
          background-image: url('/world/assets/ui/title-vista.jpg');
          background-size: cover;
          background-position: center;
          will-change: transform, opacity, filter;
        }
        /* Option C warm ivory parchment backdrop */
        #aa-parchment-layer {
          position: absolute;
          inset: 0;
          z-index: 15;
          background: radial-gradient(circle at 50% 38%, #fffdf9 0%, #f7efe0 65%, #efe3cc 100%);
          opacity: 0;
          will-change: opacity, transform;
        }
        /* Shared Title & Bottom Action Layer */
        #aa-ui-layer {
          position: absolute;
          inset: 0;
          z-index: 25;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 34px 24px 26px 24px;
        }
        .aa-title-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          margin-top: 6px;
        }
        .aa-eyebrow {
          font-family: "Cinzel", Georgia, serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: #fffdf8;
          text-shadow: 0 1px 6px rgba(20, 32, 52, 0.45);
          margin-bottom: 2px;
          transition: color 450ms ease, text-shadow 450ms ease;
        }
        .aa-title {
          font-family: "Cormorant Garamond", "Playfair Display", Georgia, serif;
          font-size: 54px;
          font-style: italic;
          font-weight: 700;
          line-height: 1.05;
          color: #fffdf8;
          text-shadow: 0 3px 18px rgba(18, 28, 46, 0.38), 0 1px 3px rgba(18, 28, 46, 0.32);
          transition: color 450ms ease, text-shadow 450ms ease;
        }
        #aa-load-showcase[data-opt="3"].is-loading .aa-eyebrow {
          color: #9a6b16;
          text-shadow: none;
        }
        #aa-load-showcase[data-opt="3"].is-loading .aa-title {
          color: #1c1917;
          text-shadow: none;
        }
        /* Option A: Center-Outward Whisper-Thin Golden Horizon Filament */
        #optA-progress-wrap {
          display: none;
          flex-direction: column;
          align-items: center;
          gap: 7px;
          width: min(280px, 60vw);
          transition: opacity 420ms ease, transform 420ms ease;
        }
        #aa-load-showcase[data-opt="1"] #optA-progress-wrap {
          display: flex;
        }
        .optA-track {
          width: 100%;
          height: 2.5px;
          background: rgba(255, 253, 248, 0.36);
          border-radius: 999px;
          overflow: hidden;
          box-shadow: 0 1px 6px rgba(15, 23, 42, 0.22);
        }
        #optA-fill {
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, #fde68a, #f59e0b, #fde68a);
          transform-origin: center;
          transform: scaleX(0.06);
          will-change: transform;
        }
        #optA-caption {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: #fffdf8;
          text-shadow: 0 1px 6px rgba(15, 23, 42, 0.55);
        }

        /* Option B: Integrated Title-Underline Gold Fill + Rotating Sakura Crest */
        #optB-underline-wrap {
          display: none;
          flex-direction: column;
          align-items: center;
          margin-top: 6px;
          width: 230px;
          transition: opacity 420ms ease;
        }
        #aa-load-showcase[data-opt="2"] #optB-underline-wrap {
          display: flex;
        }
        .optB-line-row {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 10px;
        }
        .optB-half-track {
          flex: 1;
          height: 2px;
          background: rgba(255, 253, 248, 0.34);
          border-radius: 999px;
          overflow: hidden;
        }
        .optB-half-fill-left {
          width: 100%;
          height: 100%;
          background: #fde047;
          transform-origin: right;
          transform: scaleX(0.08);
          will-change: transform;
        }
        .optB-half-fill-right {
          width: 100%;
          height: 100%;
          background: #fde047;
          transform-origin: left;
          transform: scaleX(0.08);
          will-change: transform;
        }
        .optB-sakura {
          width: 18px;
          height: 18px;
          color: #fde047;
          animation: sakuraSpin 6s linear infinite;
          filter: drop-shadow(0 1px 4px rgba(15, 23, 42, 0.4));
        }

        /* Option C: Pure Golden Sun-Crest Ring on Warm Ivory */
        #optC-ring-wrap {
          display: none;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          transition: opacity 450ms ease, transform 450ms ease;
        }
        #aa-load-showcase[data-opt="3"] #optC-ring-wrap {
          display: flex;
        }

        /* Final Ready CTA Button ("Enter the Valley") */
        #aa-enter-cta {
          opacity: 0;
          transform: translateY(8px) scale(0.97);
          transition: opacity 450ms cubic-bezier(0.22, 1, 0.36, 1), transform 450ms cubic-bezier(0.22, 1, 0.36, 1);
          background: rgba(250, 246, 238, 0.96);
          color: #1c1917;
          border: 1.5px solid #d97706;
          border-radius: 999px;
          padding: 10px 30px;
          font-family: "Cinzel", Georgia, serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          box-shadow: 0 10px 28px rgba(20, 16, 10, 0.24), inset 0 1px 0 #ffffff;
        }
        #aa-load-showcase.is-ready #aa-enter-cta {
          opacity: 1;
          transform: translateY(0px) scale(1);
        }
        #aa-load-showcase.is-ready #optA-progress-wrap,
        #aa-load-showcase.is-ready #optC-ring-wrap {
          opacity: 0;
          transform: translateY(6px);
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);

      const root = document.createElement('div');
      root.id = 'aa-load-showcase';
      root.dataset.opt = '1';
      root.className = 'is-loading';
      root.innerHTML = `
        <div id="aa-opt-pill">Option A</div>
        <div id="aa-keyart-layer"></div>
        <div id="aa-parchment-layer"></div>
        <div id="aa-ui-layer">
          <div class="aa-title-block">
            <div class="aa-eyebrow">The Unfading Bloom</div>
            <div class="aa-title">Amarante</div>
            <div id="optB-underline-wrap">
              <div class="optB-line-row">
                <div class="optB-half-track"><div id="optB-fill-l" class="optB-half-fill-left"></div></div>
                <svg class="optB-sakura" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="2.4" fill="#fffdf8"/>
                  <path d="M12 2 C9.5 8, 14.5 8, 12 2 Z"/>
                  <path d="M12 22 C9.5 16, 14.5 16, 12 22 Z"/>
                  <path d="M2 12 C8 9.5, 8 14.5, 2 12 Z"/>
                  <path d="M22 12 C16 9.5, 16 14.5, 22 12 Z"/>
                </svg>
                <div class="optB-half-track"><div id="optB-fill-r" class="optB-half-fill-right"></div></div>
              </div>
            </div>
          </div>

          <div id="optC-ring-wrap">
            <svg width="56" height="56" viewBox="0 0 54 54" style="transform: rotate(-90deg);">
              <circle cx="27" cy="27" r="22" fill="none" stroke="#e5d6bd" stroke-width="2.2"/>
              <circle id="optC-ring" cx="27" cy="27" r="22" fill="none" stroke="#d97706" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="138.2" stroke-dashoffset="138.2"/>
            </svg>
          </div>

          <div style="display:flex; flex-direction:column; align-items:center; min-height: 52px; justify-content:flex-end;">
            <div id="optA-progress-wrap">
              <div class="optA-track"><div id="optA-fill"></div></div>
              <div id="optA-caption">Entering the valley</div>
            </div>
            <div id="aa-enter-cta">Enter the Valley</div>
          </div>
        </div>
      `;
      document.body.appendChild(root);
    });

    async function runOptionShowcase(optNum, titleText, photoPathLoad, photoPathReady) {
      await pageVid.evaluate(
        ({ opt, label }) => {
          const root = document.getElementById('aa-load-showcase');
          const pill = document.getElementById('aa-opt-pill');
          const keyart = document.getElementById('aa-keyart-layer');
          const parch = document.getElementById('aa-parchment-layer');
          const cta = document.getElementById('aa-enter-cta');
          root.dataset.opt = String(opt);
          root.classList.add('is-loading');
          root.classList.remove('is-ready');
          pill.textContent = label;
          cta.style.position = 'absolute';
          cta.style.bottom = '26px';

          keyart.style.transition = 'none';
          parch.style.transition = 'none';
          if (opt === 1) {
            keyart.style.opacity = '1';
            keyart.style.transform = 'scale(1.032)';
            keyart.style.filter = 'brightness(1.02) saturate(1.02)';
            parch.style.opacity = '0';
          } else if (opt === 2) {
            keyart.style.opacity = '1';
            keyart.style.transform = 'scale(1.02)';
            keyart.style.filter = 'brightness(1.09) contrast(0.90) saturate(0.82)';
            parch.style.opacity = '0';
          } else {
            keyart.style.opacity = '0';
            parch.style.opacity = '1';
            parch.style.transform = 'scale(1)';
          }
          void keyart.offsetWidth;
          keyart.style.transition =
            'opacity 700ms cubic-bezier(0.22, 1, 0.36, 1), transform 2000ms cubic-bezier(0.22, 1, 0.36, 1), filter 700ms cubic-bezier(0.22, 1, 0.36, 1)';
          parch.style.transition =
            'opacity 700ms cubic-bezier(0.22, 1, 0.36, 1), transform 700ms cubic-bezier(0.22, 1, 0.36, 1)';
          keyart.style.transform = 'scale(1.0)';
        },
        { opt: optNum, label: titleText }
      );

      await pageVid.evaluate(
        ({ opt }) =>
          new Promise((resolve) => {
            const start = performance.now();
            const dur = 1500;
            const fA = document.getElementById('optA-fill');
            const fBL = document.getElementById('optB-fill-l');
            const fBR = document.getElementById('optB-fill-r');
            const rC = document.getElementById('optC-ring');
            const keyart = document.getElementById('aa-keyart-layer');

            function step(now) {
              const raw = Math.min(1, (now - start) / dur);
              const p = 1 - Math.pow(1 - raw, 2.2);
              if (opt === 1 && fA) {
                fA.style.transform = `scaleX(${Math.max(0.06, p).toFixed(3)})`;
              } else if (opt === 2 && fBL && fBR) {
                fBL.style.transform = `scaleX(${Math.max(0.06, p).toFixed(3)})`;
                fBR.style.transform = `scaleX(${Math.max(0.06, p).toFixed(3)})`;
                keyart.style.filter = `brightness(${(1.09 - 0.09 * p).toFixed(3)}) contrast(${(0.90 + 0.10 * p).toFixed(3)}) saturate(${(0.82 + 0.18 * p).toFixed(3)})`;
              } else if (opt === 3 && rC) {
                const off = 138.2 * (1 - p);
                rC.style.strokeDashoffset = off.toFixed(1);
              }
              if (raw < 1) {
                requestAnimationFrame(step);
              } else {
                resolve();
              }
            }
            requestAnimationFrame(step);
          }),
        { opt: optNum }
      );

      await pageVid.screenshot({ path: photoPathLoad });

      // Trigger the seamless reveal into the live 3D WebGL valley!
      await pageVid.evaluate(() => {
        const root = document.getElementById('aa-load-showcase');
        const keyart = document.getElementById('aa-keyart-layer');
        const parch = document.getElementById('aa-parchment-layer');
        root.classList.remove('is-loading');
        root.classList.add('is-ready');
        keyart.style.opacity = '0';
        parch.style.opacity = '0';
      });

      // Let the live 3D valley (wind-swept grass, wisteria trees, drifting petals) play for 2.0s
      await pageVid.waitForTimeout(2000);
      await pageVid.screenshot({ path: photoPathReady });
    }

    await runOptionShowcase(
      1,
      'Option A: 0ms Key-Art Vista + Bottom Gold Filament -> Live 3D Valley',
      path.join(OUT_DIR, 'optA-loading.png'),
      path.join(OUT_DIR, 'optA-live3d.png')
    );
    await runOptionShowcase(
      2,
      'Option B: 0ms Sunlit Gouache Wash + Title Underline Fill -> Live 3D Valley',
      path.join(OUT_DIR, 'optB-loading.png'),
      path.join(OUT_DIR, 'optB-live3d.png')
    );
    await runOptionShowcase(
      3,
      'Option C: 0ms Warm Ivory Sanctuary + Golden Sun-Ring -> Live 3D Valley',
      path.join(OUT_DIR, 'optC-loading.png'),
      path.join(OUT_DIR, 'optC-live3d.png')
    );

    const videoObj = pageVid.video();
    await ctxVid.close();
    const rawWebmPath = await videoObj.path();
    const finalWebmPath = path.join(OUT_DIR, 'loading-options-showcase.webm');
    const finalMp4Path = path.join(OUT_DIR, 'loading-options-showcase.mp4');
    fs.copyFileSync(rawWebmPath, finalWebmPath);

    try {
      execSync(
        `ffmpeg -y -i "${finalWebmPath}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 "${finalMp4Path}"`,
        { stdio: 'ignore' }
      );
      console.log(`[record-loading] Saved MP4 video: ${finalMp4Path}`);
    } catch {
      console.log(`[record-loading] Saved WebM video: ${finalWebmPath}`);
    }
  } finally {
    await browser.close();
    srv.server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
