#!/usr/bin/env node
// ============================================================================
// sfx-foley/harness/capture-mage-spells-h3.mjs
//
// Isolated Deterministic 832x480 @ 24fps Capture Harness for MiniMax H3 V2A
// Records all 6 dedicated Mage Spell & Attack clips BEFORE H3 generation:
//   1. mage_h3_01_bolts_and_nova.mp4     (124f, 4 beats: bolts 1..3 + starlight nova)
//   2. mage_h3_02_frost_lance.mp4        (124f, 2 beats: sweeping glacier corridor & close apex)
//   3. mage_h3_03_shatterlance.mp4       (124f, full hold-charge vortex -> railgun fire -> shatter)
//   4. mage_h3_04_cinder_fall.mp4        (124f, 2 beats: parabolic meteor arc + crater blast)
//   5. mage_h3_05_storm_lance.mp4        (124f, 2 beats: lightning spear + chain arcs + fulgurites)
//   6. mage_h3_06_starfall_ultimate.mp4  (141f, 2 beats: Q staff summon & 8.4m ring -> spaced sky meteors)
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
const VALID_FRAME_COUNTS = new Set([124, 141, 158, 175, 192]);

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
console.log(`[mage-h3-capture] Read-only capture server at ${srv.url}`);

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

async function openCleanMagePage() {
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
    if (w.coopSystem.player.activeHeroId !== 'Mage') w.coopSystem.swapActiveHero();

    window.__HIDE_PARTNER__ = true;
    window.__FOLEY_CAM__ = {
      active: true,
      mode: 'fixed',
      pos: [56.5, 2.25, -8.2],
      target: [56.5, 1.05, -14.0],
      fov: 45,
    };

    const cam = w.camera;
    const origUpdateMatrixWorld = cam.updateMatrixWorld.bind(cam);
    cam.updateMatrixWorld = function patchedUpdateMatrixWorld(force) {
      if (window.__HIDE_PARTNER__) {
        if (w.coopSystem?.knight?.group) w.coopSystem.knight.group.visible = false;
        if (w.coopSystem?.mage?.group) w.coopSystem.mage.group.visible = true;
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

    window.__parkKnightHidden = () => {
      window.__HIDE_PARTNER__ = true;
      const m = w.coopSystem.heroStates.Mage;
      const k = w.coopSystem.heroStates.Knight;
      if (k && m) {
        k.x = m.x - 6.0;
        k.z = m.z + 6.0;
        k.y = w.terrainKit?.walkableHeightAt ? w.terrainKit.walkableHeightAt(k.x, k.z) : 0;
        k.actionState = 'foley_parked';
        k.actionTimer = 9999;
        k.char.group.position.set(k.x, k.y, k.z);
        k.char.group.visible = false;
      }
    };

    window.__freezeMageIdle = () => {
      const m = w.coopSystem.heroStates.Mage;
      if (!m) return;
      w.coopSystem.actionAim?.cancelSwing?.('Mage', { resetCombo: true });
      w.coopSystem.actionAim?.cancelSkillAim?.();
      m.actionState = null;
      m.actionTimer = 0;
      m.lungeRemaining = 0;
      m.vy = 0;
      m.grounded = true;
      m.char.mixer.timeScale = 1.0;
      m.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
    };

    window.__spawnTargetDummy = (x, z, rotY = -Math.PI * 0.5) => {
      const e = w.enemyManager.spawnImmediateFromSpec({
        archetype: 'skeleton_warrior',
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
        e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
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
        e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
      }
    };
  });

  await stepFrames(page, 18);
  return { page, errors };
}

async function captureClip(page, spec) {
  const { id, totalFrames, onFrame, sheetFrames } = spec;
  if (!VALID_FRAME_COUNTS.has(totalFrames)) {
    throw new Error(`Invalid frameCount=${totalFrames} for ${id}`);
  }
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
      console.log(`[mage-h3-capture] ${id}: frame ${f + 1}/${totalFrames} (t=${t.toFixed(2)}s)`);
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
  console.log(`[mage-h3-capture] DONE ${id}.mp4 (${W}x${H}, ${probedFrames}f @ ${FPS}fps)`);
}

// ============================================================================
// 6 ISOLATED MAGE SPELL & ATTACK SCENARIOS FOR MINIMAX H3 V2A
// ============================================================================

const MAGE_H3_CLIPS = [
  // --------------------------------------------------------------------------
  // 1. Mage Normal Bolts (Combo 1..3) & Charged Starlight Nova (Combo 4)
  // --------------------------------------------------------------------------
  {
    id: 'mage_h3_01_bolts_and_nova',
    totalFrames: 124, // 5.167s
    sheetFrames: [0, 8, 12, 20, 36, 40, 64, 69, 94, 100, 106, 118],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.vfxKit.clear();
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(52.5, -14.0, Math.PI * 0.5);
        window.__parkKnightHidden();
        window.__freezeMageIdle();
        window.__spawnTargetDummy(60.5, -14.0, -Math.PI * 0.5);
        w.camState.mode = 'player';
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [56.5, 2.45, -6.4],
          target: [56.5, 1.05, -14.0],
          fov: 46,
        };
      });
      await stepFrames(page, 12);
    },
    async onFrame(f, t, page) {
      const fireBolt = async (comboIdx) => {
        await page.evaluate((idx) => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          m.yaw = Math.PI * 0.5;
          const clip = idx >= 2 ? 'Ranged_Magic_Shoot' : 'Ranged_1H_Shoot';
          m.actionState = clip;
          m.actionTimer = 0.55;
          m.char.play(clip, { loop: false, fade: 0.04, timeScale: 1.35, force: true });
          w.campaignLoop.performMageBoltAttack(idx, m, null, { ignoreCooldown: true });
        }, comboIdx);
      };
      const resetBetweenBeats = async () => {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeMageIdle();
          window.__resetDummies([[60.5, -14.0, -Math.PI * 0.5]]);
        });
      };

      if (hit(f, 6)) await fireBolt(0);   // 0.25s: Bolt 1
      if (hit(f, 26)) await resetBetweenBeats();
      if (hit(f, 34)) await fireBolt(1);  // 1.42s: Bolt 2
      if (hit(f, 54)) await resetBetweenBeats();
      if (hit(f, 62)) await fireBolt(2);  // 2.58s: Bolt 3 Heavy Volley
      if (hit(f, 84)) await resetBetweenBeats();
      if (hit(f, 92)) await fireBolt(3);  // 3.83s: Combo 4 Starlight Nova Orb + Shard Shatter
      if (hit(f, 118)) await resetBetweenBeats();
    },
  },

  // --------------------------------------------------------------------------
  // 2. Mage [E] Frost Lance: Sweeping 14.5m Glacier Wall & Apex Crown Shatter
  // --------------------------------------------------------------------------
  {
    id: 'mage_h3_02_frost_lance',
    totalFrames: 124, // 5.167s
    sheetFrames: [0, 8, 14, 22, 32, 48, 66, 74, 82, 92, 104, 118],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.vfxKit.clear();
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(50.5, -14.0, Math.PI * 0.5);
        window.__parkKnightHidden();
        window.__freezeMageIdle();
        window.__spawnTargetDummy(63.0, -14.0, -Math.PI * 0.5);
        w.camState.mode = 'player';
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [57.2, 4.4, -1.6],
          target: [57.2, 1.15, -14.0],
          fov: 50,
        };
      });
      await stepFrames(page, 12);
    },
    async onFrame(f, t, page) {
      // Beat 1 (0.25s..2.58s): Full wide sweeping glacier fracture & apex monolith eruption
      if (hit(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          m.yaw = Math.PI * 0.5;
          m.actionState = 'Ranged_Magic_Shoot';
          m.actionTimer = 0.65;
          m.char.play('Ranged_Magic_Shoot', { loop: false, fade: 0.04, timeScale: 1.2, force: true });
          w.campaignLoop.castSpell('frost_lance', m, Math.PI * 0.5, null, { ignoreCooldown: true });
        });
      }
      if (hit(f, 62)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeMageIdle();
          window.__resetDummies([[63.0, -14.0, -Math.PI * 0.5]]);
          // Oblique front-side framing for Beat 2 glacier impact & crown shatter
          window.__FOLEY_CAM__ = {
            active: true,
            mode: 'fixed',
            pos: [59.8, 3.25, -4.8],
            target: [59.5, 1.25, -14.0],
            fov: 48,
          };
        });
      }
      // Beat 2 (3.00s..4.92s): Second Frost Lance bursting into close foreground monoliths
      if (hit(f, 72)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          m.yaw = Math.PI * 0.5;
          m.actionState = 'Ranged_Magic_Shoot';
          m.actionTimer = 0.65;
          m.char.play('Ranged_Magic_Shoot', { loop: false, fade: 0.04, timeScale: 1.2, force: true });
          w.campaignLoop.castSpell('frost_lance', m, Math.PI * 0.5, null, { ignoreCooldown: true });
        });
      }
      if (hit(f, 118)) {
        await page.evaluate(() => {
          window.__WORLD__.vfxKit.clear();
          window.__freezeMageIdle();
          window.__resetDummies([[63.0, -14.0, -Math.PI * 0.5]]);
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 3. Mage Hold-LMB Shatterlance Railgun (Uncramped Spiral Charge -> Fire -> Shatter)
  // --------------------------------------------------------------------------
  {
    id: 'mage_h3_03_shatterlance',
    totalFrames: 124, // 5.167s
    sheetFrames: [0, 10, 20, 30, 36, 40, 44, 52, 62, 76, 94, 118],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.vfxKit.clear();
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(52.5, -14.0, Math.PI * 0.5);
        window.__parkKnightHidden();
        window.__freezeMageIdle();
        window.__spawnTargetDummy(60.2, -14.0, -Math.PI * 0.5);
        w.camState.mode = 'player';
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [56.2, 2.8, -3.6],
          target: [56.3, 1.2, -14.0],
          fov: 48,
        };
      });
      await stepFrames(page, 12);
    },
    async onFrame(f, t, page) {
      // Beat 1 (0.25s..1.50s): Hold-charge spiraling crystal vortex & 7-fluted lance assembly
      if (hit(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          m.yaw = Math.PI * 0.5;
          m.char.play('Ranged_Magic_Spellcasting', {
            loop: true,
            fade: 0.05,
            timeScale: 1.2,
            force: true,
          });
          w.coopSystem.triggerAction('shatterlance_aim_start', {
            yaw: Math.PI * 0.5,
            pitch: 0.18,
            distance: 7.7,
          });
        });
      }
      if (f > 6 && f < 36) {
        const prog = (f - 6) / 30;
        await page.evaluate((p) => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          w.vfxKit.shatterlance?.updateChargeHold?.({
            origin: { x: m.x, y: m.y, z: m.z },
            yaw: Math.PI * 0.5,
            dirX: 1,
            dirZ: 0,
            direction: { x: 1, y: 0, z: 0 },
            chargeProgress: Math.min(1.0, 0.2 + p * 0.8),
            active: true,
            dt: 1 / 24,
          });
        }, prog);
      }
      // Beat 2 (1.50s..4.00s): Supersonic fluted railgun fire & 52-wedge crystal eruption
      if (hit(f, 36)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          w.coopSystem.actionAim?.cancelSkillAim?.();
          m.actionState = 'Ranged_Magic_Shoot';
          m.actionTimer = 0.65;
          m.char.play('Ranged_Magic_Shoot', { loop: false, fade: 0.04, timeScale: 1.3, force: true });
          w.campaignLoop.castSpell('shatterlance', m, Math.PI * 0.5, null, {
            distance: 7.7,
            ignoreCooldown: true,
          });
        });
      }
      if (hit(f, 96)) {
        await page.evaluate(() => {
          window.__WORLD__.vfxKit.clear();
          window.__freezeMageIdle();
          window.__resetDummies([[60.2, -14.0, -Math.PI * 0.5]]);
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 4. Mage [E] Cinder Fall: Parabolic Volcanic Meteor & Magma Crater Detonation
  // --------------------------------------------------------------------------
  {
    id: 'mage_h3_04_cinder_fall',
    totalFrames: 124, // 5.167s
    sheetFrames: [0, 8, 12, 16, 20, 28, 62, 76, 82, 88, 98, 118],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.vfxKit.clear();
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(52.0, -14.0, Math.PI * 0.5);
        window.__parkKnightHidden();
        window.__freezeMageIdle();
        window.__spawnTargetDummy(60.5, -14.0, -Math.PI * 0.5);
        w.camState.mode = 'player';
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [56.2, 4.6, -2.2],
          target: [56.4, 1.5, -14.0],
          fov: 50,
        };
      });
      await stepFrames(page, 12);
    },
    async onFrame(f, t, page) {
      // Beat 1 (0.25s..2.58s): Full parabolic flight & crater blast
      if (hit(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          m.yaw = Math.PI * 0.5;
          m.actionState = 'Ranged_Magic_Shoot';
          m.actionTimer = 0.65;
          m.char.play('Ranged_Magic_Shoot', { loop: false, fade: 0.04, timeScale: 1.25, force: true });
          w.campaignLoop.castSpell('cinder_fall', m, Math.PI * 0.5, null, {
            distance: 8.5,
            ignoreCooldown: true,
          });
        });
      }
      if (hit(f, 62)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeMageIdle();
          window.__resetDummies([[60.5, -14.0, -Math.PI * 0.5]]);
          window.__FOLEY_CAM__ = {
            active: true,
            mode: 'fixed',
            pos: [57.2, 4.0, -3.6],
            target: [58.2, 1.35, -14.0],
            fov: 49,
          };
        });
      }
      // Beat 2 (3.17s..4.92s): Second Cinder Fall closer crater smash & bouncing cinder rocks
      if (hit(f, 76)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          m.yaw = Math.PI * 0.5;
          m.actionState = 'Ranged_Magic_Shoot';
          m.actionTimer = 0.65;
          m.char.play('Ranged_Magic_Shoot', { loop: false, fade: 0.04, timeScale: 1.25, force: true });
          w.campaignLoop.castSpell('cinder_fall', m, Math.PI * 0.5, null, {
            distance: 8.5,
            ignoreCooldown: true,
          });
        });
      }
      if (hit(f, 118)) {
        await page.evaluate(() => {
          window.__WORLD__.vfxKit.clear();
          window.__freezeMageIdle();
          window.__resetDummies([[60.5, -14.0, -Math.PI * 0.5]]);
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 5. Mage [4] Storm Lance: High-Voltage Lightning Spear, Chain Arcs & Fulgurites
  // --------------------------------------------------------------------------
  {
    id: 'mage_h3_05_storm_lance',
    totalFrames: 124, // 5.167s
    sheetFrames: [0, 7, 10, 14, 22, 36, 66, 70, 74, 82, 98, 116],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.vfxKit.clear();
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(52.0, -14.0, Math.PI * 0.5);
        window.__parkKnightHidden();
        window.__freezeMageIdle();
        window.__spawnTargetDummy(60.5, -14.0, -Math.PI * 0.5);
        window.__spawnTargetDummy(61.6, -12.3, -Math.PI * 0.5);
        window.__spawnTargetDummy(61.6, -15.7, -Math.PI * 0.5);
        w.camState.mode = 'player';
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [56.8, 3.3, -3.0],
          target: [57.0, 1.15, -14.0],
          fov: 49,
        };
      });
      await stepFrames(page, 12);
    },
    async onFrame(f, t, page) {
      const dummyCoords = [
        [60.5, -14.0, -Math.PI * 0.5],
        [61.6, -12.3, -Math.PI * 0.5],
        [61.6, -15.7, -Math.PI * 0.5],
      ];
      // Beat 1 (0.25s..2.25s): Full wide lightning great-spear + chain arcs + fulgurite eruption
      if (hit(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          m.yaw = Math.PI * 0.5;
          m.actionState = 'Ranged_Magic_Shoot';
          m.actionTimer = 0.6;
          m.char.play('Ranged_Magic_Shoot', { loop: false, fade: 0.04, timeScale: 1.35, force: true });
          w.campaignLoop.castSpell('storm_lance', m, Math.PI * 0.5, null, {
            distance: 8.5,
            ignoreCooldown: true,
          });
        });
      }
      if (hit(f, 54)) {
        await page.evaluate((coords) => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeMageIdle();
          window.__resetDummies(coords);
          window.__FOLEY_CAM__ = {
            active: true,
            mode: 'fixed',
            pos: [58.0, 2.7, -5.2],
            target: [59.8, 1.15, -14.0],
            fov: 48,
          };
        }, dummyCoords);
      }
      // Beat 2 (2.83s..4.83s): Close thunderclap cluster impact
      if (hit(f, 68)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          m.yaw = Math.PI * 0.5;
          m.actionState = 'Ranged_Magic_Shoot';
          m.actionTimer = 0.6;
          m.char.play('Ranged_Magic_Shoot', { loop: false, fade: 0.04, timeScale: 1.35, force: true });
          w.campaignLoop.castSpell('storm_lance', m, Math.PI * 0.5, null, {
            distance: 8.5,
            ignoreCooldown: true,
          });
        });
      }
      if (hit(f, 116)) {
        await page.evaluate((coords) => {
          window.__WORLD__.vfxKit.clear();
          window.__freezeMageIdle();
          window.__resetDummies(coords);
        }, dummyCoords);
      }
    },
  },

  // --------------------------------------------------------------------------
  // 6. Mage [Q] Starfall Cataclysm: Staff Invocation Ring -> Spaced Meteor Bombardment
  // --------------------------------------------------------------------------
  {
    id: 'mage_h3_06_starfall_ultimate',
    totalFrames: 141, // 5.875s
    sheetFrames: [0, 8, 16, 26, 38, 48, 52, 67, 82, 97, 112, 134],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.vfxKit.clear();
        w.enemyManager.clearAllEnemies();
        w.coopSystem.teleportLeaderAndPartner(59.0, -14.0, 0.0);
        window.__parkKnightHidden();
        window.__freezeMageIdle();
        w.camState.mode = 'player';
        // Beat 1: Crisp closer medium shot on Mage raising staff + glowing golden eye & ring
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [59.0, 2.35, -8.5],
          target: [59.0, 1.25, -14.0],
          fov: 48,
        };
      });
      await stepFrames(page, 12);
    },
    async onFrame(f, t, page) {
      // Beat 1 (0.25s..1.46s): Staff summon & golden celestial ring lock facing camera
      if (hit(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          const ch = w.campaignLoop.combatHeroes.Mage;
          ch.stormCataclysmActive = true;
          ch.stormCataclysmRemoteVisual = true;
          ch.stormCataclysmTimer = 6.2;
          ch.stormCataclysmCastTimer = 1.1;
          ch.stormCataclysmWaveTimer = -10.0;
          ch.stormCataclysmMeteorsFired = 0;
          ch.stormCataclysmCenter = { x: m.x, y: m.y, z: m.z };
          m.actionState = 'burst_aoe';
          m.actionTimer = 1.1;
          m.char.play('Ranged_Magic_Summon', {
            loop: false,
            fade: 0.05,
            timeScale: 1.05,
            force: true,
          });
        });
      }
      // Pull camera out during breath pause (f=36..44) to capture full 8.4m circle + sky meteor trails!
      if (hit(f, 36)) {
        await page.evaluate(() => {
          window.__freezeMageIdle();
          window.__FOLEY_CAM__ = {
            active: true,
            mode: 'fixed',
            pos: [59.0, 6.2, 0.8],
            target: [59.0, 2.0, -14.0],
            fov: 52,
          };
        });
      }
      // Beat 2 (1.83s..5.25s): 5 crisp diagonal sky-meteor strikes visibly streaking down at ~72 deg
      const salvoFrames = [44, 59, 74, 89, 104];
      const salvoIdx = salvoFrames.indexOf(f);
      if (salvoIdx >= 0) {
        await page.evaluate((idx) => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          const offsets = [
            [-4.6, -1.2],
            [4.8, 0.8],
            [-3.8, 3.2],
            [4.2, -3.4],
            [-5.2, 0.5],
          ];
          const [ox, oz] = offsets[idx % offsets.length];
          const sx = m.x + ox;
          const sz = m.z + oz;
          const sy = w.terrainKit?.walkableHeightAt ? w.terrainKit.walkableHeightAt(sx, sz) : 0;
          const dX = idx % 2 === 0 ? 0.92 : -0.92;
          const dZ = 0.39;
          w.vfxKit.cinderFall?.cast?.(
            { x: sx - dX * 4.5, y: sy, z: sz - dZ * 4.5 },
            { x: dX, y: 0, z: dZ },
            {
              fromSky: true,
              skyHeight: 8.8,
              range: 4.5,
              distance: 4.5,
              targetPos: { x: sx, y: sy, z: sz },
              initialAge: 0.0,
              seed: 3.1 + idx * 1.41,
            }
          );
        }, salvoIdx);
      }
      if (hit(f, 126)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const ch = w.campaignLoop.combatHeroes.Mage;
          ch.stormCataclysmActive = false;
          ch.stormCataclysmTimer = 0;
          w.vfxKit.clear();
          w.coopSystem.resetCameraImpact?.();
          window.__freezeMageIdle();
        });
      }
    },
  },
];

for (const spec of MAGE_H3_CLIPS) {
  const { page, errors } = await openCleanMagePage();
  await captureClip(page, spec);
  if (errors.length) {
    console.warn(`[mage-h3-capture] Page errors in ${spec.id}:`, errors.slice(0, 3));
  }
  await page.close();
}

await browser.close();
srv.server?.close?.();
console.log('[mage-h3-capture] ALL 6 MAGE H3 CLIPS CAPTURED SUCCESSFULLY!');
process.exit(0);
