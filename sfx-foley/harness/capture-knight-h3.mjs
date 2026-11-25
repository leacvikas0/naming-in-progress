#!/usr/bin/env node
// ============================================================================
// sfx-foley/harness/capture-knight-h3.mjs
//
// Isolated Deterministic 832x480 @ 24fps Capture Harness for MiniMax H3 V2A
// Records all 4 dedicated Knight Dragon, [Q]/[X] Ult & Shield clips BEFORE H3:
//   1. knight_h3_01_ice_dragon_sword.mp4    (124f, [E] Glacial Tide Water/Ice Dragon)
//   2. knight_h3_02_fire_dragon_sword.mp4   (124f, [E] Hinokami Sunfire Fire Dragon)
//   3. knight_h3_03_twin_dragon_ult.mp4     (124f, [Q]/[X] Twin-Element Dragon Awakening)
//   4. knight_h3_04_shield_block_parry.mp4  (124f, [F] Shield Raise, Heavy Block, Parry, Bash)
//
// Strictly writes ONLY inside `sfx-foley/videos/`. Uses ephemeral port 0.
// ============================================================================

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
const TOTAL_FRAMES = 124; // 5.167s valid MiniMax H3 frame count

const FFMPEG_BIN = fs.existsSync(
  'C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe'
)
  ? 'C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe'
  : 'ffmpeg';

const FFPROBE_BIN = fs.existsSync(
  'C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffprobe.exe'
)
  ? 'C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffprobe.exe'
  : 'ffprobe';

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
      /* try next */
    }
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
console.log(`[knight-h3-capture] Read-only capture server at ${srv.url}`);

const chromium = await loadChromium();
const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const useGpu = process.platform === 'win32' && !process.env.SWIFTSHADER;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ||
    (fs.existsSync(winChrome) ? winChrome : '/usr/local/bin/google-chrome'),
  args: useGpu
    ? ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio']
    : [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--mute-audio',
      ],
});

const hit = (f, target) => f === target;

async function stepFrames(page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.evaluate(() => window.__vt.step());
  }
}

async function openCleanKnightPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
    style.id = 'foley-zero-hud-style';
    style.textContent = `
      body > *:not(#world-canvas) {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      #hud, #top-bar, #bottom-bar, #combat-banner, #boss-hud-bar,
      #stone-world-read-btn, #stone-inspect-exit-overlay,
      #debug-dev-pill, #stats-readout, #sanctuary-lobby,
      #altar-stele-modal, #stele-interact-prompt, #victory-modal,
      .sculpted-hud-root, .damage-number, .damage-numbers-layer {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);

    // Strip drifting floating petal/pollen/meadow clutter so silent gaps stay razor still for H3
    w.scene.traverse((obj) => {
      const nm = (obj.name || '').toLowerCase();
      if (nm.includes('petal') || nm.includes('pollen') || nm.includes('flower') || nm.includes('meadow')) {
        obj.visible = false;
      }
      if (obj.isPoints) {
        obj.visible = false;
      }
    });

    w.campaignLoop.setUnlockedStage(3, 0b111);
    w.coopSystem.setUnlockedStage(3);
    if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();

    window.__HIDE_PARTNER__ = true;
    window.__FOLEY_CAM__ = {
      active: true,
      mode: 'fixed',
      pos: [55.5, 2.35, -8.5],
      target: [56.2, 1.10, -14.0],
      fov: 46,
    };

    const cam = w.camera;
    const origUpdateMatrixWorld = cam.updateMatrixWorld.bind(cam);
    cam.updateMatrixWorld = function patchedUpdateMatrixWorld(force) {
      if (window.__HIDE_PARTNER__) {
        if (w.coopSystem?.mage?.group) w.coopSystem.mage.group.visible = false;
        if (w.coopSystem?.knight?.group) w.coopSystem.knight.group.visible = true;
      }
      const fc = window.__FOLEY_CAM__;
      if (fc && fc.active) {
        cam.position.set(fc.pos[0], fc.pos[1], fc.pos[2]);
        cam.lookAt(fc.target[0], fc.target[1], fc.target[2]);
        if (fc.fov && Math.abs(cam.fov - fc.fov) > 1e-3) {
          cam.fov = fc.fov;
          cam.updateProjectionMatrix();
        }
      }
      return origUpdateMatrixWorld(force);
    };

    window.__parkMageHidden = () => {
      window.__HIDE_PARTNER__ = true;
      const k = w.coopSystem.heroStates.Knight;
      const m = w.coopSystem.heroStates.Mage;
      if (m && k) {
        m.x = k.x - 8.0;
        m.z = k.z + 8.0;
        m.y = w.terrainKit?.walkableHeightAt ? w.terrainKit.walkableHeightAt(m.x, m.z) : 0;
        m.actionState = 'foley_parked';
        m.actionTimer = 9999;
        m.char.group.position.set(m.x, m.y, m.z);
        m.char.group.visible = false;
      }
    };

    window.__freezeKnightIdle = (x = 54.0, z = -14.0, yaw = Math.PI * 0.5) => {
      const k = w.coopSystem.heroStates.Knight;
      if (!k) return;
      w.coopSystem.actionAim?.cancelSwing?.('Knight', { resetCombo: true });
      w.coopSystem.actionAim?.releaseHeavy?.('Knight');
      w.campaignLoop.setKnightBreathing?.('none', 0);
      w.campaignLoop.combatHeroes.Knight.powerSwordActive = false;
      w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
      w.campaignLoop.combatHeroes.Knight.ultActive = false;
      w.campaignLoop.combatHeroes.Knight.ultCd = 0;
      w.campaignLoop.combatHeroes.Knight.qEnergy = w.campaignLoop.combatHeroes.Knight.qEnergyMax;
      k.x = x;
      k.z = z;
      k.y = w.terrainKit?.walkableHeightAt ? w.terrainKit.walkableHeightAt(x, z) : 0;
      k.yaw = yaw;
      k.actionState = null;
      k.actionTimer = 0;
      k.lungeRemaining = 0;
      k.shieldBlocking = false;
      k.vy = 0;
      k.grounded = true;
      k.char.group.position.set(k.x, k.y, k.z);
      k.char.group.rotation.y = yaw;
      k.char.mixer.timeScale = 1.0;
      k.char.play('Idle_A', { loop: true, fade: 0.04, force: true });
    };

    window.__spawnTargetDummy = (x, z, rotY = -Math.PI * 0.5, archetype = 'skeleton_warrior') => {
      const e = w.enemyManager.spawnImmediateFromSpec({
        archetype,
        x,
        z,
        rotY,
        dormant: 'standing',
        wakeRadius: 0.001,
      });
      if (e) {
        e.hp = 9999;
        e.maxHp = 9999;
        e.speed = 0;
        e.attacks = [];
        e.spawnAnimTimer = 0;
        e.mark = null;
        e.markTimer = 0;
        e.char.play('Idle_A', { loop: true, fade: 0.04, force: true });
      }
      return e;
    };

    window.__resetDummies = (coords = []) => {
      const list = w.enemyManager.activeEnemies;
      for (let i = 0; i < list.length && i < coords.length; i++) {
        const e = list[i];
        const [x, z, rotY] = coords[i];
        e.x = x;
        e.z = z;
        e.y = w.terrainKit?.walkableHeightAt ? w.terrainKit.walkableHeightAt(x, z) : 0;
        e.vx = 0;
        e.vz = 0;
        e.speed = 0;
        e.attacks = [];
        e.aiState = 'dormant';
        e.hp = 9999;
        e.maxHp = 9999;
        e.mark = null;
        e.markTimer = 0;
        e.stunTimer = 0;
        e.rotY = rotY;
        e.char.group.position.set(e.x, e.y, e.z);
        e.char.group.rotation.y = rotY;
        e.char.play('Idle_A', { loop: true, fade: 0.04, force: true });
      }
    };
  });

  await stepFrames(page, 18);
  return { page, errors };
}

async function captureClip(page, spec) {
  const { id, totalFrames, onFrame, sheetFrames } = spec;
  const tmpDir = path.join(VIDEOS_DIR, `.tmp-frames-${id}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  await spec.setup(page);

  for (let f = 0; f < totalFrames; f++) {
    const t = f / FPS;
    await onFrame?.(f, t, page);
    await page.evaluate(() => window.__vt.step());
    await page.screenshot({
      path: path.join(tmpDir, `${String(f).padStart(4, '0')}.jpg`),
      type: 'jpeg',
      quality: 95,
    });
    if (f % 36 === 0 || f === totalFrames - 1) {
      console.log(`[knight-h3-capture] ${id}: frame ${f + 1}/${totalFrames} (t=${t.toFixed(2)}s)`);
    }
  }

  const mp4Path = path.join(VIDEOS_DIR, `${id}.mp4`);
  execFileSync(FFMPEG_BIN, [
    '-y',
    '-loglevel', 'error',
    '-framerate', String(FPS),
    '-i', path.join(tmpDir, '%04d.jpg'),
    '-frames:v', String(totalFrames),
    '-vf', `scale=${W}:${H}:flags=lanczos`,
    '-c:v', 'libx264',
    '-crf', '17',
    '-pix_fmt', 'yuv420p',
    '-an',
    mp4Path,
  ]);

  const sheetPath = path.join(VIDEOS_DIR, `${id}-sheet.jpg`);
  const indices =
    Array.isArray(sheetFrames) && sheetFrames.length === 12
      ? sheetFrames
      : Array.from({ length: 12 }, (_, i) =>
          Math.min(totalFrames - 1, Math.round((i * (totalFrames - 1)) / 11))
        );
  const selectExpr = indices.map((idx) => `eq(n\\,${idx})`).join('+');
  execFileSync(FFMPEG_BIN, [
    '-y',
    '-loglevel', 'error',
    '-i', mp4Path,
    '-vf', `select='${selectExpr}',scale=416:240,tile=4x3`,
    '-vsync', '0',
    '-frames:v', '1',
    sheetPath,
  ]);

  fs.rmSync(tmpDir, { recursive: true, force: true });

  let probedFrames = totalFrames;
  try {
    const out = execFileSync(
      FFPROBE_BIN,
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-count_frames',
        '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate',
        '-of', 'json',
        mp4Path,
      ],
      { encoding: 'utf8' }
    );
    const info = JSON.parse(out)?.streams?.[0];
    if (info) probedFrames = Number(info.nb_read_frames || totalFrames);
  } catch {
    /* ignore */
  }
  console.log(`[knight-h3-capture] DONE ${id}.mp4 (${W}x${H}, ${probedFrames}f @ ${FPS}fps)`);
}

// ============================================================================
// 4 ISOLATED KNIGHT DRAGON, [Q]/[X] ULT & SHIELD SCENARIOS FOR MINIMAX H3 V2A
// ============================================================================

const KNIGHT_H3_CLIPS = [
  // --------------------------------------------------------------------------
  // 1. Knight [E] Glacial Tide Water/Ice Sword Dragon (Beat 1 Wide -> Beat 2 Close)
  // --------------------------------------------------------------------------
  {
    id: 'knight_h3_01_ice_dragon_sword',
    totalFrames: TOTAL_FRAMES,
    sheetFrames: [0, 7, 11, 16, 22, 30, 56, 67, 72, 78, 86, 114],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.vfxKit.clear();
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(54.0, -14.0, Math.PI * 0.5);
        window.__parkMageHidden();
        window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
        window.__spawnTargetDummy(57.8, -14.0, -Math.PI * 0.5);
        w.campaignLoop.combatHeroes.Knight.selectedElement = 'ice';
        w.camState.mode = 'player';
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [55.8, 2.30, -8.2],
          target: [56.0, 1.15, -14.0],
          fov: 46,
        };
      });
      await stepFrames(page, 12);
    },
    async onFrame(f, t, page) {
      if (hit(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.selectedElement = 'ice';
          w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
          w.coopSystem.triggerAction('skill', { element: 'ice' });
        });
      }
      if (hit(f, 52)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          w.coopSystem.resetCameraImpact?.();
          window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
          window.__resetDummies([[57.6, -14.0, -Math.PI * 0.5]]);
          window.__FOLEY_CAM__ = {
            active: true,
            mode: 'fixed',
            pos: [58.4, 2.10, -9.4],
            target: [55.8, 1.10, -14.0],
            fov: 44,
          };
        });
      }
      if (hit(f, 66)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.selectedElement = 'ice';
          w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
          w.coopSystem.triggerAction('skill', { element: 'ice' });
        });
      }
      if (hit(f, 114)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
          window.__resetDummies([[57.8, -14.0, -Math.PI * 0.5]]);
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 2. Knight [E] Hinokami Sunfire Fire Sword Dragon (Beat 1 Wide -> Beat 2 Close)
  // --------------------------------------------------------------------------
  {
    id: 'knight_h3_02_fire_dragon_sword',
    totalFrames: TOTAL_FRAMES,
    sheetFrames: [0, 7, 11, 16, 22, 30, 56, 67, 72, 78, 86, 114],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.vfxKit.clear();
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(54.0, -14.0, Math.PI * 0.5);
        window.__parkMageHidden();
        window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
        window.__spawnTargetDummy(57.8, -14.0, -Math.PI * 0.5);
        w.campaignLoop.combatHeroes.Knight.selectedElement = 'fire';
        w.camState.mode = 'player';
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [55.8, 2.30, -8.2],
          target: [56.0, 1.15, -14.0],
          fov: 46,
        };
      });
      await stepFrames(page, 12);
    },
    async onFrame(f, t, page) {
      if (hit(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.selectedElement = 'fire';
          w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
          w.coopSystem.triggerAction('skill', { element: 'fire' });
        });
      }
      if (hit(f, 52)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          w.coopSystem.resetCameraImpact?.();
          window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
          window.__resetDummies([[57.6, -14.0, -Math.PI * 0.5]]);
          window.__FOLEY_CAM__ = {
            active: true,
            mode: 'fixed',
            pos: [58.4, 2.10, -9.4],
            target: [55.8, 1.10, -14.0],
            fov: 44,
          };
        });
      }
      if (hit(f, 66)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.selectedElement = 'fire';
          w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
          w.coopSystem.triggerAction('skill', { element: 'fire' });
        });
      }
      if (hit(f, 114)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
          window.__resetDummies([[57.8, -14.0, -Math.PI * 0.5]]);
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 3. Knight [Q]/[X] Twin-Element Fire+Ice Dragon Awakening (3-Beat Choreography)
  // --------------------------------------------------------------------------
  {
    id: 'knight_h3_03_twin_dragon_ult',
    totalFrames: TOTAL_FRAMES,
    sheetFrames: [0, 8, 12, 16, 23, 28, 56, 68, 74, 80, 87, 114],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.vfxKit.clear();
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(54.0, -14.0, Math.PI * 0.5);
        window.__parkMageHidden();
        window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
        window.__spawnTargetDummy(57.8, -14.0, -Math.PI * 0.5);
        w.camState.mode = 'player';
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [56.0, 2.45, -7.8],
          target: [56.2, 1.25, -14.0],
          fov: 48,
        };
      });
      await stepFrames(page, 12);
    },
    async onFrame(f, t, page) {
      // Beat 1: f=6 (0.25s) trigger Q -> 0.38s cut1 -> 0.70s crossbite detonation -> settle f=46
      if (hit(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.ultCd = 0;
          w.campaignLoop.combatHeroes.Knight.qEnergy = w.campaignLoop.combatHeroes.Knight.qEnergyMax;
          w.coopSystem.triggerAction('ultimate');
        });
      }
      if (hit(f, 52)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          w.coopSystem.resetCameraImpact?.();
          window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
          window.__resetDummies([[57.8, -14.0, -Math.PI * 0.5]]);
          window.__FOLEY_CAM__ = {
            active: true,
            mode: 'fixed',
            pos: [59.0, 2.30, -8.8],
            target: [56.0, 1.20, -14.0],
            fov: 46,
          };
        });
      }
      // Beat 2: f=66 (2.75s) tight front-3/4 replay
      if (hit(f, 66)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.ultCd = 0;
          w.campaignLoop.combatHeroes.Knight.qEnergy = w.campaignLoop.combatHeroes.Knight.qEnergyMax;
          w.coopSystem.triggerAction('ultimate');
        });
      }
      if (hit(f, 114)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
          window.__resetDummies([[57.8, -14.0, -Math.PI * 0.5]]);
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 4. Knight [F] Heater Shield Block, Timed Parry Stagger & Shield Slam Intercept
  // --------------------------------------------------------------------------
  {
    id: 'knight_h3_04_shield_block_parry',
    totalFrames: TOTAL_FRAMES,
    sheetFrames: [0, 8, 18, 22, 42, 54, 62, 66, 86, 94, 102, 116],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.vfxKit.clear();
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(54.0, -14.0, Math.PI * 0.5);
        window.__parkMageHidden();
        window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
        window.__spawnTargetDummy(56.0, -14.0, -Math.PI * 0.5);
        w.camState.mode = 'player';
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [55.1, 1.95, -9.6],
          target: [55.0, 1.05, -14.0],
          fov: 44,
        };
      });
      await stepFrames(page, 12);
    },
    async onFrame(f, t, page) {
      // Beat 1 (0.25s..1.45s): Raise Shield -> Skeleton swings onto shield -> Shield clang & spark!
      if (hit(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.triggerAction('heavy');
        });
      }
      if (hit(f, 14)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_1H_Attack_Chop', { loop: false, fade: 0.04, timeScale: 1.5, force: true });
          }
        });
      }
      if (hit(f, 21)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const e = w.enemyManager.activeEnemies[0];
          w.campaignLoop.handlePlayerHit(k, e, 28);
          w.vfxKit.ultimateVfx?.spawnSparks?.({ x: k.x + 0.65, y: 1.15, z: k.z }, { count: 18, speed: 5.5, pal: 1 });
        });
      }
      if (hit(f, 38)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
          window.__resetDummies([[56.0, -14.0, -Math.PI * 0.5]]);
        });
      }
      // Beat 2 (2.25s..3.35s): Timed Parry Counter-Deflect Stagger
      if (hit(f, 54)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_1H_Attack_Chop', { loop: false, fade: 0.04, timeScale: 1.5, force: true });
          }
        });
      }
      if (hit(f, 61)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.triggerAction('heavy');
          const k = w.coopSystem.heroStates.Knight;
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Hit_B', { loop: false, fade: 0.04, timeScale: 1.2, force: true });
            e.x = 56.6;
            e.char.group.position.x = 56.6;
          }
          w.vfxKit.ultimateVfx?.spawnSparks?.({ x: k.x + 0.72, y: 1.20, z: k.z }, { count: 28, speed: 7.2, pal: 1 });
        });
      }
      if (hit(f, 78)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
          window.__resetDummies([[56.0, -14.0, -Math.PI * 0.5]]);
        });
      }
      // Beat 3 (3.75s..4.85s): Shield Sprint Intercept Bash
      if (hit(f, 90)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.triggerAction('dash');
        });
      }
      if (hit(f, 95)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const e = w.enemyManager.activeEnemies[0];
          w.coopSystem.triggerAction('heavy');
          w.vfxKit.ultimateVfx?.spawnSparks?.({ x: k.x + 0.75, y: 1.10, z: k.z }, { count: 24, speed: 6.4, pal: 1 });
          if (e) {
            w.enemyManager.applyHitToEnemy(e, {
              source: 'intercept',
              baseDmg: 30,
              attackerPos: k,
            });
          }
        });
      }
      if (hit(f, 115)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeKnightIdle(54.0, -14.0, Math.PI * 0.5);
          window.__resetDummies([[56.0, -14.0, -Math.PI * 0.5]]);
        });
      }
    },
  },
];

for (const spec of KNIGHT_H3_CLIPS) {
  const { page, errors } = await openCleanKnightPage();
  await captureClip(page, spec);
  if (errors.length) {
    console.warn(`[knight-h3-capture] Page errors in ${spec.id}:`, errors.slice(0, 3));
  }
  await page.close();
}

await browser.close();
srv.server?.close?.();
console.log('[knight-h3-capture] ALL 4 KNIGHT H3 CLIPS CAPTURED SUCCESSFULLY!');
process.exit(0);
