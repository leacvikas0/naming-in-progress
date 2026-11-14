#!/usr/bin/env node
/**
 * Captures `03_knight_pure_sword_and_dodge.mp4` (192 frames = 8.00s @ 24fps, 832x480)
 *
 * Refined after critical visual inspection:
 *   1. Clean Cobblestone Plaza Stage (`x = 0.0, z = 10.5`) with drifting petals & tall grass hidden
 *      -> zero floating sky LOD artifacts, zero flying debris during silence windows, 100% visible boots on stone.
 *   2. 24-degree Front-3/4 Camera (`offsetX = +1.75m, offsetZ = -4.45m, height = +1.48m, fov = 40`):
 *      -> Shows the full front of the Knight (face, chest, sword, shield) while giving both horizontal slashes
 *         (`combo1`, `combo2`) AND vertical overhead chops (`combo3`, `combo4`) wide, un-foreshortened blade arcs!
 *   3. Smooth lateral & depth tracking so Left/Right side-dodges stay centered in frame.
 *   4. 100% full-duration animations (`combo1`, `combo2`, `combo3`, `combo4`, `Dodge_Left`, `Dodge_Right`)
 *      with zero cuts, zero teleports, and zero forced resets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../../world/tools/serve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIDEOS_DIR = path.resolve(__dirname, '../videos');

const W = 832;
const H = 480;
const FPS = 24;
const TOTAL_FRAMES = 192; // 8.000s (17 * 11 + 5 = 192)

const FFMPEG_BIN = fs.existsSync(
  'C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe'
)
  ? 'C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe'
  : 'ffmpeg';

async function loadChromium() {
  for (const spec of [
    process.env.PLAYWRIGHT,
    'playwright-core',
    'playwright',
    'C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs',
    'C:/Users/silen/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs',
  ]) {
    if (!spec) continue;
    try {
      const isPath = spec.startsWith('/') || /^[A-Za-z]:[\\/]/.test(spec);
      const mod = await import(isPath ? pathToFileURL(spec).href : spec);
      const c = mod.chromium || mod.default?.chromium;
      if (c) return c;
    } catch {}
  }
  throw new Error('playwright-core not found');
}

const VIRTUAL_TIME_INIT = (frameMs) => {
  let vt = 0;
  let queue = [];
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => {
    queue.push(cb);
    return queue.length;
  };
  window.cancelAnimationFrame = () => {};
  window.__FIXED_DT__ = frameMs / 1000;
  window.__vt = {
    now: () => vt,
    step(ms = frameMs) {
      vt += ms;
      const q = queue;
      queue = [];
      for (const cb of q) {
        try {
          cb(vt);
        } catch (e) {
          console.error(e);
        }
      }
    },
  };
};

fs.mkdirSync(VIDEOS_DIR, { recursive: true });
const srv = await startServer(0);
const baseUrl = `${srv.url}?nolobby=1`;

const chromium = await loadChromium();
const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({
  executablePath: fs.existsSync(winChrome) ? winChrome : undefined,
  args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'],
});

const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.addInitScript(VIRTUAL_TIME_INIT, 1000 / FPS);
await page.goto(baseUrl);

for (let i = 0; i < 4000; i++) {
  if (await page.evaluate(() => Boolean(window.__WORLD__?.ready))) break;
  await page.evaluate(() => window.__vt.step());
  await page.waitForTimeout(10);
}

await page.evaluate(() => {
  const w = window.__WORLD__;
  w.toggleHud?.(false);
  w.sculptedHud?.setVisible?.(false);
  w.setGameplayShot?.(null);
  w.campaignLoop?.setOpenValleyMode?.(false);
  w.campaignLoop?.transitionToAct?.('interlude_pier');
  w.enemyManager?.clearAllEnemies?.();

  const style = document.createElement('style');
  style.textContent = `
    body > *:not(#world-canvas) {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
  `;
  document.head.appendChild(style);

  w.campaignLoop.setUnlockedStage(3, 0b111);
  w.coopSystem.setUnlockedStage(3);
  if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();

  // Pure Steel Sword (Zero elemental powers)
  w.campaignLoop.setKnightBreathing('none', 0);
  w.vfxKit.swordVfx.setInfusion('none', 0);

  // Hide drifting petal particles & tall grass clumps so the cobblestone stage is 100% clean & still during pauses
  w.scene.traverse((obj) => {
    const nm = (obj.name || '').toLowerCase();
    if (nm.includes('petal') || nm.includes('pollen') || nm.includes('stele') || nm.includes('flower') || nm.includes('meadow')) {
      obj.visible = false;
    }
    if (obj.isPoints) {
      obj.visible = false;
    }
  });

  w.coopSystem.teleportLeaderAndPartner(0.0, 10.8, Math.PI);
  w.camState.mode = 'player';
  w.camState.yaw = Math.PI;

  const p = w.coopSystem.heroStates.Mage;
  if (p) {
    p.x = 0.0;
    p.z = 17.5;
    p.actionState = 'foley_parked';
    p.actionTimer = 9999;
    p.char.group.visible = false;
  }

  // 20-degree Front-3/4 Camera on the SWORD-ARM SIDE (`curX = -1.35`) so the broadsword is in the foreground on every swing!
  window.__SMOOTH_CAM__ = {
    curX: -1.35,
    curY: w.coopSystem.heroStates.Knight.y + 1.48,
    curZ: 10.8 - 4.45,
    lookX: 0.0,
    lookY: w.coopSystem.heroStates.Knight.y + 0.92,
    lookZ: 10.8,
    fov: 40,
  };

  const cam = w.camera;
  const origUpdateMatrixWorld = cam.updateMatrixWorld.bind(cam);
  cam.updateMatrixWorld = function patchedUpdateMatrixWorld(force) {
    if (w.coopSystem?.mage?.group) w.coopSystem.mage.group.visible = false;
    if (w.coopSystem?.knight?.group) w.coopSystem.knight.group.visible = true;

    const st = w.coopSystem?.heroStates?.Knight;
    const sc = window.__SMOOTH_CAM__;
    if (st && sc) {
      const targetCamX = st.x * 0.82 - 1.35;
      const targetCamY = st.y + 1.48;
      const targetCamZ = st.z - 4.45;

      const targetLookX = st.x * 0.94;
      const targetLookY = st.y + 0.92;
      const targetLookZ = st.z;

      sc.curX += (targetCamX - sc.curX) * 0.28;
      sc.curY += (targetCamY - sc.curY) * 0.28;
      sc.curZ += (targetCamZ - sc.curZ) * 0.28;

      sc.lookX += (targetLookX - sc.lookX) * 0.34;
      sc.lookY += (targetLookY - sc.lookY) * 0.34;
      sc.lookZ += (targetLookZ - sc.lookZ) * 0.34;

      cam.position.set(sc.curX, sc.curY, sc.curZ);
      cam.lookAt(sc.lookX, sc.lookY, sc.lookZ);
      if (Math.abs(cam.fov - sc.fov) > 1e-3) {
        cam.fov = sc.fov;
        cam.updateProjectionMatrix();
      }
    }
    return origUpdateMatrixWorld(force);
  };
});

for (let i = 0; i < 24; i++) {
  await page.evaluate(() => window.__vt.step());
}

const id = '03_knight_pure_sword_and_dodge';
const tmpFramesDir = path.join(VIDEOS_DIR, `.tmp-frames-${id}`);
fs.rmSync(tmpFramesDir, { recursive: true, force: true });
fs.mkdirSync(tmpFramesDir, { recursive: true });

for (let f = 0; f < TOTAL_FRAMES; f++) {
  await page.evaluate((frameIdx) => {
    const w = window.__WORLD__;
    const k = w.coopSystem.heroStates.Knight;
    const hCtrl = w.coopSystem.actionAim.heroes.Knight;

    const m = w.coopSystem.heroStates.Mage;
    if (m && k) {
      m.x = k.x;
      m.z = k.z + 6.0;
      m.char.group.visible = false;
    }

    const triggerNaturalSwing = (comboIdx) => {
      k.yaw = Math.PI;
      hCtrl.activeSwing = null;
      hCtrl.bufferedAttack = false;
      hCtrl.mashCount = 0;
      hCtrl.mashTimeScale = 1.0;
      hCtrl.comboIndex = comboIdx - 1;
      hCtrl.comboResetTimer = comboIdx === 0 ? 0 : 0.5;
      w.coopSystem.triggerAction('attack');
      hCtrl.mashCount = 0;
      hCtrl.mashTimeScale = 1.0;
    };

    if (frameIdx === 6) triggerNaturalSwing(0);   // 0.25s: Combo 1 Horizontal Slash
    if (frameIdx === 36) triggerNaturalSwing(1);  // 1.50s: Combo 2 Rising Diagonal Slice
    if (frameIdx === 66) triggerNaturalSwing(2);  // 2.75s: Combo 3 Overhead Chop
    if (frameIdx === 96) triggerNaturalSwing(3);  // 4.00s: Combo 4 Leaping Finisher Cleave

    if (frameIdx === 128) {
      // 5.33s: Side Dodge 1 (screen-left)
      w.campaignLoop.combatHeroes.Knight.dashCd = 0;
      w.coopSystem.triggerAction('dash', {
        camYaw: Math.PI,
        dodgeYaw: Math.PI - Math.PI / 2,
      });
    }

    if (frameIdx === 156) {
      // 6.50s: Side Dodge 2 (screen-right, returning to center)
      w.campaignLoop.combatHeroes.Knight.dashCd = 0;
      w.coopSystem.triggerAction('dash', {
        camYaw: Math.PI,
        dodgeYaw: Math.PI + Math.PI / 2,
      });
    }
  }, f);

  await page.evaluate(() => window.__vt.step());
  await page.screenshot({
    path: path.join(tmpFramesDir, `${String(f).padStart(4, '0')}.jpg`),
    type: 'jpeg',
    quality: 95,
  });
}

const mp4Path = path.join(VIDEOS_DIR, `${id}.mp4`);
execFileSync(FFMPEG_BIN, [
  '-y',
  '-loglevel', 'error',
  '-framerate', String(FPS),
  '-i', path.join(tmpFramesDir, '%04d.jpg'),
  '-frames:v', String(TOTAL_FRAMES),
  '-vf', `scale=${W}:${H}:flags=lanczos`,
  '-c:v', 'libx264',
  '-crf', '17',
  '-pix_fmt', 'yuv420p',
  '-an',
  mp4Path,
]);

const sheetPath = path.join(VIDEOS_DIR, `${id}-sheet.jpg`);
const sheetFrames = [0, 12, 28, 42, 58, 72, 88, 103, 120, 133, 161, 185];
const selectExpr = sheetFrames.map((idx) => `eq(n\\,${idx})`).join('+');
execFileSync(FFMPEG_BIN, [
  '-y',
  '-loglevel', 'error',
  '-i', mp4Path,
  '-vf', `select='${selectExpr}',scale=416:240,tile=4x3`,
  '-vsync', '0',
  '-frames:v', '1',
  sheetPath,
]);

fs.rmSync(tmpFramesDir, { recursive: true, force: true });
await browser.close();
srv.server?.close?.();
console.log(`[OK] Captured ${mp4Path} and ${sheetPath}`);
process.exit(0);
