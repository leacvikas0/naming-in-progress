// ============================================================================
// world/tools/record-knight-combat-polish.mjs
//
// Deterministic Frame-Stepped Video-Recording Harness for Knight Combat,
// Motion & Sword VFX (`world/shots/videos/knight-combat-{baseline|after}.webm`).
//
// Starts the local server on port 4185 (never touching 4179), boots the live
// world in-game, injects a 1-line diagnostic HUD overlay at the top showing
// `[Scenario] | [Input] | [Anim Clip / loop / running] | [actionState / loco] | [SwordVFX]`,
// and pipes 1280x720 20fps JPEG frames into `ffmpeg` to produce `.webm` + `.mp4` videos.
//
// Usage:
//   node world/tools/record-knight-combat-polish.mjs [baseline|after]
// ============================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { startServer } from './serve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORLD_DIR = path.resolve(__dirname, '..');
const VIDEO_OUT_DIR = path.join(WORLD_DIR, 'shots', 'videos');

const FPS = 20;
const STEP_DT = 1 / FPS; // 0.05s per frame

const modeArg = (process.argv[2] || 'baseline').toLowerCase();
const videoName = `knight-combat-${modeArg}`;

function createFfmpegEncoder(webmPath, mp4Path, fps = FPS) {
  const proc = spawn(
    'ffmpeg',
    [
      '-y',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-framerate',
      String(fps),
      '-i',
      '-',
      '-c:v',
      'libvpx',
      '-b:v',
      '3.5M',
      '-crf',
      '14',
      '-pix_fmt',
      'yuv420p',
      '-an',
      webmPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-an',
      mp4Path,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] }
  );

  let stderrLog = '';
  proc.stderr.on('data', (chunk) => {
    stderrLog += chunk.toString();
  });

  const donePromise = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderrLog.slice(-400)}`));
    });
  });

  return {
    async writeFrame(jpegBuf) {
      if (!proc.stdin.writable) return;
      const ok = proc.stdin.write(jpegBuf);
      if (!ok) {
        await new Promise((r) => proc.stdin.once('drain', r));
      }
    },
    async finish() {
      proc.stdin.end();
      await donePromise;
    },
  };
}

async function stepFrames(page, encoder, count, dt = STEP_DT) {
  for (let i = 0; i < count; i++) {
    await page.evaluate((stepDt) => {
      return new Promise((resolve) => {
        window.__FIXED_DT__ = stepDt;
        requestAnimationFrame(() => {
          window.__FIXED_DT__ = 0.00001;
          resolve();
        });
      });
    }, dt);
    const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
    await encoder.writeFrame(buf);
  }
}

async function main() {
  await fs.mkdir(VIDEO_OUT_DIR, { recursive: true });
  const webmPath = path.join(VIDEO_OUT_DIR, `${videoName}.webm`);
  const mp4Path = path.join(VIDEO_OUT_DIR, `${videoName}.mp4`);

  const portToUse = Number(process.env.PORT || 4185);
  const { server, port } = await startServer(portToUse, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[HARNESS] Dev server listening on ${baseUrl} (mode=${modeArg})`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const encoder = createFfmpegEncoder(webmPath, mp4Path, FPS);

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message || String(err)));

    await page.goto(`${baseUrl}/world/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
      null,
      { timeout: 30000 }
    );

    // Enter IN_GAME mode, hide flower lobby, mount diagnostic bar
    await page.evaluate(() => {
      const w = window.__WORLD__;
      window.__FIXED_DT__ = 0.00001;
      if (w.appFlow && typeof w.appFlow.goToStep === 'function') {
        w.appFlow.goToStep('in_game');
      }
      const flowRoot = document.getElementById('amarante-app-flow-root');
      if (flowRoot) flowRoot.style.display = 'none';
      if (w.sculptedHud && typeof w.sculptedHud.setVisible === 'function') {
        w.sculptedHud.setVisible(true);
      }
      w.setTimeOfDay('day');
      if (w.coopSystem.player.activeHeroId !== 'Knight') {
        w.coopSystem.swapActiveHero();
      }
      w.coopSystem.enemyManager.clearAllEnemies();
      w.coopSystem.teleportLeaderAndPartner(2.0, 14.0, Math.PI * 0.5);
      w.setCameraOrbit(Math.PI * 0.25, 0.18, 5.5);

      const diag = document.createElement('div');
      diag.id = 'knight-qa-diag-overlay';
      diag.style.cssText = [
        'position:fixed',
        'top:8px',
        'left:50%',
        'transform:translateX(-50%)',
        'z-index:99999',
        'background:rgba(15,23,42,0.90)',
        'color:#f8fafc',
        'font:600 11.5px/1.35 monospace',
        'padding:5px 10px',
        'border-radius:6px',
        'border:1px solid #38bdf8',
        'white-space:nowrap',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(diag);

      window.__QA_LABEL__ = 'INIT';
      window.__QA_INPUT__ = 'NONE';
      const updateDiag = () => {
        const kSt = w.coopSystem.heroStates.Knight;
        const anim = kSt.char.anim;
        const curAct = anim.rawActions.get(anim.currentClipName);
        const isRunning = curAct ? curAct.isRunning() : false;
        const loopMode = curAct ? (curAct.loop === 2200 ? 'ONCE' : 'LOOP') : '-';
        const clipTime = curAct ? curAct.time.toFixed(2) : '0.00';
        const vfxStats = w.vfxKit.swordVfx.getStats();
        diag.textContent = `${window.__QA_LABEL__} | IN:${window.__QA_INPUT__} | clip:${anim.currentClipName}(t=${clipTime},${loopMode},run=${isRunning}) | act:${kSt.actionState || 'none'}(${kSt.actionTimer.toFixed(2)}) loco:${kSt.locomotionState} blk:${kSt.shieldBlocking} | vfx:${vfxStats.infusionStyle} slices:${vfxStats.activeTrailSlices}`;
        requestAnimationFrame(updateDiag);
      };
      requestAnimationFrame(updateDiag);
    });

    const canvasBox = await page.locator('#world-canvas').boundingBox();
    const cx = canvasBox ? canvasBox.x + canvasBox.width * 0.5 : 640;
    const cy = canvasBox ? canvasBox.y + canvasBox.height * 0.5 : 360;
    await page.mouse.move(cx, cy);

    // =========================================================================
    // SCENARIO A (0.0s - 5.0s, 100 frames):
    // Attack + Tap Shift / Repeated Shift + Attack + WASD Stress Test
    // =========================================================================
    console.log('[HARNESS] Recording Scenario A: Attack + Tap Shift + WASD Stress Test...');
    await page.evaluate(() => {
      const w = window.__WORLD__;
      window.__QA_LABEL__ = 'A1: Attack -> Tap Shift -> Hold W+Shift';
      window.__QA_INPUT__ = 'LMB Attack';
      w.coopSystem.teleportLeaderAndPartner(-4.0, 14.0, Math.PI * 0.5);
      w.setCameraOrbit(Math.PI * 0.22, 0.18, 5.4);
    });

    // Frame 0..5 (0.25s): Click LMB to start combo1 and reach contact hit (which starts swordVfx!)
    await page.mouse.down({ button: 'left' });
    await stepFrames(page, encoder, 2);
    await page.mouse.up({ button: 'left' });
    await stepFrames(page, encoder, 4);

    // Frame 6..35 (1.5s): Tap Shift + Hold W+Shift while swordVfx is active!
    await page.evaluate(() => {
      window.__QA_INPUT__ = 'Tap Shift + Hold W+Shift';
    });
    await page.keyboard.down('w');
    await page.keyboard.down('Shift');
    await stepFrames(page, encoder, 28);

    // Frame 34..70: Now do LMB hold (>280ms) + tap Shift while moving with W
    await page.evaluate(() => {
      window.__QA_LABEL__ = 'A2: Attack Hold + Tap Shift + Move';
      window.__QA_INPUT__ = 'LMB + Tap Shift + W';
    });
    await page.mouse.down({ button: 'left' });
    await stepFrames(page, encoder, 6);
    await page.keyboard.up('Shift');
    await page.keyboard.down('Shift');
    await stepFrames(page, encoder, 6);
    await page.mouse.up({ button: 'left' });
    await stepFrames(page, encoder, 20);

    // Frame 66..96: Spam Shift + Attack while moving W
    await page.evaluate(() => {
      window.__QA_LABEL__ = 'A3: Rapid Attack + Shift Spam While Moving';
      window.__QA_INPUT__ = 'Attack + Shift x3';
    });
    for (let i = 0; i < 3; i++) {
      await page.mouse.down({ button: 'left' });
      await stepFrames(page, encoder, 2);
      await page.mouse.up({ button: 'left' });
      await page.keyboard.up('Shift');
      await page.keyboard.down('Shift');
      await stepFrames(page, encoder, 8);
    }
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    await stepFrames(page, encoder, 6);

    // =========================================================================
    // SCENARIO B (5.0s - 12.5s, 150 frames):
    // Full 4-Hit Knight Combo (1: Steel Wind, 2: Ice E Glacial Tide, 3: Fire E Sunfire)
    // =========================================================================
    console.log('[HARNESS] Recording Scenario B: Full 4-Hit Knight Combo (Normal, Ice E, Fire E)...');
    await page.evaluate(() => {
      const w = window.__WORLD__;
      window.__QA_LABEL__ = 'B1: 4-Hit Combo (Normal Steel Wind)';
      window.__QA_INPUT__ = 'Idle';
      w.coopSystem.teleportLeaderAndPartner(2.0, 14.0, Math.PI * 0.5);
      w.coopSystem.campaignLoop.setKnightBreathing('none', 0);
      w.setCameraOrbit(Math.PI * 1.18, 0.20, 4.6);
    });
    await stepFrames(page, encoder, 4);

    for (let hit = 1; hit <= 4; hit++) {
      await page.evaluate((h) => {
        window.__QA_INPUT__ = `Combo Hit ${h}/4`;
        window.__WORLD__.coopSystem.triggerAction('attack');
      }, hit);
      await stepFrames(page, encoder, 12);
    }
    await stepFrames(page, encoder, 6);

    // B2: Ice E Power Sword + 4-Hit Combo
    await page.evaluate(() => {
      const w = window.__WORLD__;
      window.__QA_LABEL__ = 'B2: E Ice Power Sword + 4-Hit Combo';
      window.__QA_INPUT__ = 'Press E (Ice)';
      w.coopSystem.teleportLeaderAndPartner(2.0, 14.0, Math.PI * 0.5);
      w.coopSystem.heroStates.Knight.selectedElement = 'ice';
      w.coopSystem.campaignLoop.combatHeroes.Knight.selectedElement = 'ice';
      w.coopSystem.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
      w.setCameraOrbit(Math.PI * 1.22, 0.22, 4.6);
      w.coopSystem.triggerAction('skill');
    });
    await stepFrames(page, encoder, 11);

    for (let hit = 1; hit <= 4; hit++) {
      await page.evaluate((h) => {
        window.__QA_INPUT__ = `Ice Combo Hit ${h}/4`;
        window.__WORLD__.coopSystem.triggerAction('attack');
      }, hit);
      await stepFrames(page, encoder, 12);
    }
    await stepFrames(page, encoder, 5);

    // B3: Fire E Power Sword + 4-Hit Combo
    await page.evaluate(() => {
      const w = window.__WORLD__;
      window.__QA_LABEL__ = 'B3: Tab -> E Fire Power Sword + 4-Hit Combo';
      window.__QA_INPUT__ = 'Tab + Press E (Fire)';
      w.coopSystem.teleportLeaderAndPartner(2.0, 14.0, Math.PI * 0.5);
      w.coopSystem.toggleElement('Knight');
      w.coopSystem.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
      w.setCameraOrbit(Math.PI * 1.15, 0.24, 4.6);
      w.coopSystem.triggerAction('skill');
    });
    await stepFrames(page, encoder, 11);

    for (let hit = 1; hit <= 4; hit++) {
      await page.evaluate((h) => {
        window.__QA_INPUT__ = `Fire Combo Hit ${h}/4`;
        window.__WORLD__.coopSystem.triggerAction('attack');
      }, hit);
      await stepFrames(page, encoder, 12);
    }
    await stepFrames(page, encoder, 5);

    // =========================================================================
    // SCENARIO C (12.5s - 16.5s, 80 frames):
    // Shield Block, Q Ultimate, Jump, Dash -> Sprint
    // =========================================================================
    console.log('[HARNESS] Recording Scenario C: Shield Block, Q Ultimate, Jump, Dash -> Sprint...');
    await page.evaluate(() => {
      const w = window.__WORLD__;
      window.__QA_LABEL__ = 'C1: Hold Shield Block -> Release -> Q Ultimate';
      window.__QA_INPUT__ = 'Hold LMB (Block)';
      w.coopSystem.teleportLeaderAndPartner(2.0, 14.0, Math.PI * 0.5);
      w.setCameraOrbit(Math.PI * 1.18, 0.18, 4.9);
      w.coopSystem.triggerAction('heavy');
    });
    await stepFrames(page, encoder, 12);

    await page.evaluate(() => {
      const w = window.__WORLD__;
      window.__QA_INPUT__ = 'Release Block -> Q Ultimate';
      w.coopSystem.triggerAction('release_heavy');
      w.coopSystem.campaignLoop.combatHeroes.Knight.ultCd = 0;
      w.coopSystem.triggerAction('ultimate');
    });
    await stepFrames(page, encoder, 16);

    await page.evaluate(() => {
      const w = window.__WORLD__;
      window.__QA_LABEL__ = 'C2: Jump -> Land -> Dash -> Sprint';
      window.__QA_INPUT__ = 'Space (Jump)';
      w.coopSystem.triggerAction('jump');
    });
    await stepFrames(page, encoder, 18);

    await page.evaluate(() => {
      window.__QA_INPUT__ = 'Shift Dash -> Hold W+Shift Sprint';
    });
    await page.keyboard.down('w');
    await page.keyboard.down('Shift');
    await stepFrames(page, encoder, 24);
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    await stepFrames(page, encoder, 6);

    await page.close();
    await context.close();
    await encoder.finish();

    const stat = await fs.stat(mp4Path);
    console.log(
      `[VIDEO RECORDED] ${videoName}.mp4 (${(stat.size / 1024).toFixed(1)} KB, errors=${consoleErrors.length}) -> ${mp4Path}`
    );
    if (consoleErrors.length > 0) {
      console.warn('[CONSOLE ERRORS]', consoleErrors);
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
