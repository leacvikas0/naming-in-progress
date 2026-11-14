#!/usr/bin/env node
// ============================================================================
// sfx-foley/harness/capture-foley-videos.mjs
//
// Isolated Deterministic 832x480 @ 24fps Video Capture Harness for MiniMax H3 V2A
// - Strictly isolated inside `sfx-foley/` (writes ONLY to `sfx-foley/videos/`)
// - Uses an ephemeral random port (`startServer(0)`) so it never collides with 4173
// - Enforces `W = 832`, `H = 480`, `FPS = 24`, exact `17k + 5` frame counts (`124` or `141`)
// - Waits for `window.__WORLD__?.ready === true` + 18 warm-up frames before Frame 0
// - Hides 100% of 2D DOM HUD overlays (`body > *:not(#world-canvas)`)
// - Stages 14 "Action Sprite-Sheet" videos with spaced action beats & stillness windows
// - Outputs `<clip>.mp4`, `<clip>-sheet.jpg` (4x3 contact sheet), and `slice-manifest.json`
//
// Usage:
//   node sfx-foley/harness/capture-foley-videos.mjs
//   node sfx-foley/harness/capture-foley-videos.mjs 01_locomotion_footsteps_surfaces
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from '../../world/tools/serve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIDEOS_DIR = path.resolve(__dirname, '../videos');

// Golden Rule #2: Exact multiples of 32 (832x480) @ 24 fps
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

// Ephemeral random port (0) so we NEVER collide with port 4173
const srv = await startServer(0);
const baseUrl = `${srv.url}?nolobby=1`;
console.log(`[foley-harness] Local read-only capture server started at ${srv.url}`);

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

async function stepFrames(page, count = 1) {
  for (let i = 0; i < count; i++) {
    await page.evaluate(() => window.__vt.step());
  }
}

const hitFrame = (f, targetFrame) => f === targetFrame;
const keyAct = (page, k, down) => (down ? page.keyboard.down(k) : page.keyboard.up(k));

async function openCleanWorldPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(VIRTUAL_TIME_INIT, 1000 / FPS);
  await page.goto(baseUrl);

  // Wait until window.__WORLD__?.ready is true
  for (let i = 0; i < 4000; i++) {
    if (await page.evaluate(() => Boolean(window.__WORLD__?.ready))) break;
    await page.evaluate(() => window.__vt.step());
    await page.waitForTimeout(10);
  }

  // Hide 100% of 2D DOM HUD overlays & install deterministic camera override hook
  await page.evaluate(() => {
    const w = window.__WORLD__;
    w.toggleHud?.(false);
    w.sculptedHud?.setVisible?.(false);
    w.setGameplayShot?.(null);
    w.campaignLoop?.setOpenValleyMode?.(false);
    // Use interlude_pier (0 waves) so teleporting never auto-triggers act1_arena waves
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

    window.__HIDE_PARTNER__ = false;
    window.__HIDE_BOTH_HEROES__ = false;

    // Install deterministic camera framing hook that still keeps camState.mode === 'player'
    // so coopSystem.update(dt) runs every frame!
    window.__FOLEY_CAM__ = {
      active: false,
      mode: 'fixed', // 'fixed' | 'follow_leader'
      pos: [0, 2, 15],
      target: [0, 1, 11],
      offset: [0, 1.5, 4.0],
      lookOffset: [0, 1.0, 0],
      fov: 45,
    };

    const cam = w.camera;
    const origUpdateMatrixWorld = cam.updateMatrixWorld.bind(cam);
    cam.updateMatrixWorld = function patchedUpdateMatrixWorld(force) {
      // Enforce partner / hero visibility AFTER coopSystem.update(dt) resets group.visible
      if (window.__HIDE_BOTH_HEROES__) {
        if (w.coopSystem?.knight?.group) w.coopSystem.knight.group.visible = false;
        if (w.coopSystem?.mage?.group) w.coopSystem.mage.group.visible = false;
      } else if (window.__HIDE_PARTNER__) {
        const activeRole = w.coopSystem?.player?.activeHeroId || 'Knight';
        const partnerRole = activeRole === 'Knight' ? 'Mage' : 'Knight';
        const activeChar = activeRole === 'Knight' ? w.coopSystem?.knight : w.coopSystem?.mage;
        const partnerChar = partnerRole === 'Knight' ? w.coopSystem?.knight : w.coopSystem?.mage;
        if (activeChar?.group) activeChar.group.visible = true;
        if (partnerChar?.group) partnerChar.group.visible = false;
      }

      const fc = window.__FOLEY_CAM__;
      if (fc && fc.active && !w.stoneGazeState?.inspectActive && (w.stoneGazeState?.inspectBlend || 0) < 0.02) {
        if (fc.mode === 'follow_leader') {
          const role = w.coopSystem?.player?.activeHeroId || 'Knight';
          const st = w.coopSystem?.heroStates?.[role] || w.player;
          const px = st?.x ?? 0;
          const pz = st?.z ?? 0;
          const py = st?.y ?? 0;
          cam.position.set(
            px + (fc.offset?.[0] ?? 0),
            py + (fc.offset?.[1] ?? 1.5),
            pz + (fc.offset?.[2] ?? 4.0)
          );
          cam.lookAt(
            px + (fc.lookOffset?.[0] ?? 0),
            py + (fc.lookOffset?.[1] ?? 1.0),
            pz + (fc.lookOffset?.[2] ?? 0)
          );
        } else if (fc.mode === 'fixed') {
          cam.position.set(fc.pos[0], fc.pos[1], fc.pos[2]);
          cam.lookAt(fc.target[0], fc.target[1], fc.target[2]);
        }
        if (fc.fov && Math.abs(cam.fov - fc.fov) > 1e-3) {
          cam.fov = fc.fov;
          cam.updateProjectionMatrix();
        }
      }
      return origUpdateMatrixWorld(force);
    };

    // Helper to park and hide the non-active partner so Wingman AI never photobombs
    window.__parkPartner = (hide = true) => {
      window.__HIDE_PARTNER__ = Boolean(hide);
      const role = w.coopSystem.player.activeHeroId;
      const partnerId = role === 'Knight' ? 'Mage' : 'Knight';
      const p = w.coopSystem.heroStates[partnerId];
      if (!p) return;
      const leader = w.coopSystem.heroStates[role];
      const yaw = leader?.yaw ?? Math.PI;
      // Keep within 6.5m (< 18m tether snap threshold) and behind leader
      p.x = (leader?.x ?? 0) - Math.sin(yaw) * 6.5;
      p.z = (leader?.z ?? 0) - Math.cos(yaw) * 6.5;
      p.y = w.terrainKit?.walkableHeightAt ? w.terrainKit.walkableHeightAt(p.x, p.z) : 0;
      p.actionState = 'foley_parked';
      p.actionTimer = 9999;
      p.char.group.position.set(p.x, p.y, p.z);
      p.char.group.visible = !hide;
    };

    // Helper to reset hero to clean Idle_A stillness during silence windows
    window.__freezeHeroIdle = (heroId = 'Knight') => {
      const st = w.coopSystem.heroStates[heroId];
      if (!st) return;
      w.coopSystem.actionAim?.cancelSwing?.(heroId, { resetCombo: true });
      w.coopSystem.actionAim?.cancelSkillAim?.();
      if (heroId === 'Knight') {
        w.vfxKit?.swordVfx?.endSwing?.();
      }
      st.actionState = null;
      st.actionTimer = 0;
      st.lungeRemaining = 0;
      st.vy = 0;
      st.grounded = true;
      st.char.mixer.timeScale = 1.0;
      st.char.play('Idle_A', { loop: true, fade: 0.06, force: true });
    };
  });

  // Step 18 warm-up frames so all GLBs, terrain LODs, and grass matrices are 100% settled before Frame 0
  await stepFrames(page, 18);
  return { page, errors };
}

async function captureFoleyClip(page, spec) {
  const { id, totalFrames, onFrame, sheetFrames } = spec;
  if (!VALID_FRAME_COUNTS.has(totalFrames)) {
    throw new Error(
      `Invalid frame count ${totalFrames} for ${id}; must be in {124, 141, 158, 175, 192}`
    );
  }

  const tmpFramesDir = path.join(VIDEOS_DIR, `.tmp-frames-${id}`);
  fs.rmSync(tmpFramesDir, { recursive: true, force: true });
  fs.mkdirSync(tmpFramesDir, { recursive: true });

  for (let f = 0; f < totalFrames; f++) {
    const t = f / FPS;
    await onFrame?.(f, t, page);
    await page.evaluate(() => window.__vt.step());
    await page.screenshot({
      path: path.join(tmpFramesDir, `${String(f).padStart(4, '0')}.jpg`),
      type: 'jpeg',
      quality: 95,
    });
    if (f % 36 === 0 || f === totalFrames - 1) {
      console.log(`[foley-harness] ${id}: captured frame ${f + 1}/${totalFrames} (t=${t.toFixed(2)}s)`);
    }
  }

  const mp4Path = path.join(VIDEOS_DIR, `${id}.mp4`);
  execFileSync(FFMPEG_BIN, [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    String(FPS),
    '-i',
    path.join(tmpFramesDir, '%04d.jpg'),
    '-frames:v',
    String(totalFrames),
    '-vf',
    `scale=${W}:${H}:flags=lanczos`,
    '-c:v',
    'libx264',
    '-crf',
    '17',
    '-pix_fmt',
    'yuv420p',
    '-an',
    mp4Path,
  ]);

  // Build 4x3 (12-tile) contact sheet sampling Frame 0 + key beat & silence frames
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
    '-loglevel',
    'error',
    '-i',
    mp4Path,
    '-vf',
    `select='${selectExpr}',scale=416:240,tile=4x3`,
    '-vsync',
    '0',
    '-frames:v',
    '1',
    sheetPath,
  ]);

  fs.rmSync(tmpFramesDir, { recursive: true, force: true });

  // Verify encoded stream via ffprobe
  let probedFrames = totalFrames;
  let probedW = W;
  let probedH = H;
  try {
    const out = execFileSync(
      FFPROBE_BIN,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-count_frames',
        '-show_entries',
        'stream=width,height,nb_read_frames,r_frame_rate',
        '-of',
        'json',
        mp4Path,
      ],
      { encoding: 'utf8' }
    );
    const info = JSON.parse(out)?.streams?.[0];
    if (info) {
      probedFrames = Number(info.nb_read_frames || totalFrames);
      probedW = Number(info.width || W);
      probedH = Number(info.height || H);
    }
  } catch {
    /* ignore if ffprobe unavailable */
  }

  console.log(
    `[foley-harness] DONE ${id}.mp4 (${probedW}x${probedH}, ${probedFrames} frames @ ${FPS}fps) & ${id}-sheet.jpg`
  );
  return { mp4Path, sheetPath, probedFrames, probedW, probedH };
}

// ============================================================================
// 14 DETERMINISTIC ACTION SPRITE-SHEET SCENARIOS
// ============================================================================

const CLIP_SPECS = [
  // --------------------------------------------------------------------------
  // 1. Character Locomotion & Foley: Footsteps on Meadow Grass, Cobblestone Plaza, Stone Steps
  // --------------------------------------------------------------------------
  {
    id: '01_locomotion_footsteps_surfaces',
    category: 'locomotion_foley',
    tier: 4,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 160, lpfHz: 4800, subBoostDb: 0 },
    polyphony: 2,
    sheetFrames: [0, 12, 24, 40, 54, 68, 84, 96, 108, 116, 126, 138],
    beats: [
      {
        id: 'footstep_meadow_grass',
        label: 'Knight running on dense Meadow Grass (4 steps)',
        startFrame: 6,
        endFrame: 36,
        startSec: 0.25,
        endSec: 1.5,
        hook: 'playFootstep("grass", "Knight")',
      },
      {
        id: 'footstep_cobblestone_plaza',
        label: 'Knight sprinting on Cobblestone Town Plaza (4 steps)',
        startFrame: 48,
        endFrame: 78,
        startSec: 2.0,
        endSec: 3.25,
        hook: 'playFootstep("cobblestone", "Knight")',
      },
      {
        id: 'footstep_stone_steps_mage',
        label: 'Mage running up North Shrine Stone Steps (4 steps)',
        startFrame: 90,
        endFrame: 120,
        startSec: 3.75,
        endSec: 5.0,
        hook: 'playFootstep("stone_steps", "Mage")',
      },
    ],
    silenceWindows: [
      [0.0, 0.25],
      [1.5, 2.0],
      [3.25, 3.75],
      [5.0, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.setUnlockedStage(3, 0b111);
        w.coopSystem.setUnlockedStage(3);
        if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();
        // Beat 1 stage: Open Emerald Meadow at (-24.0, 32.0) facing North (Math.PI)
        w.coopSystem.teleportLeaderAndPartner(-24.0, 32.0, Math.PI);
        window.__parkPartner(true);
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'follow_leader',
          offset: [1.75, 1.12, -2.75],
          lookOffset: [0, 0.72, -0.35],
          fov: 44,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=6..36): Run across Meadow Grass
      if (hitFrame(f, 6)) await keyAct(page, 'w', true);
      if (hitFrame(f, 36)) {
        await keyAct(page, 'w', false);
        await page.evaluate(() => window.__freezeHeroIdle('Knight'));
      }
      // Silence 1 transition at f=46 -> West Cobblestone Plaza Ring (-4.2, 13.5) clear of the central Well!
      if (hitFrame(f, 46)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.teleportLeaderAndPartner(-4.2, 13.5, Math.PI);
          window.__parkPartner(true);
          window.__freezeHeroIdle('Knight');
        });
      }
      // Beat 2 (f=48..78): Sprint across Cobblestone Plaza
      if (hitFrame(f, 48)) {
        await keyAct(page, 'w', true);
        await keyAct(page, 'Shift', true);
      }
      if (hitFrame(f, 78)) {
        await keyAct(page, 'Shift', false);
        await keyAct(page, 'w', false);
        await page.evaluate(() => window.__freezeHeroIdle('Knight'));
      }
      // Silence 2 transition at f=88 -> North Shrine Stone Staircase (0.0, -22.0) as Mage
      if (hitFrame(f, 88)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          if (w.coopSystem.player.activeHeroId !== 'Mage') w.coopSystem.swapActiveHero();
          w.coopSystem.teleportLeaderAndPartner(0.0, -22.0, Math.PI);
          window.__parkPartner(true);
          window.__freezeHeroIdle('Mage');
          window.__FOLEY_CAM__.offset = [1.75, 1.25, -2.85];
          window.__FOLEY_CAM__.lookOffset = [0, 0.85, -0.35];
        });
      }
      // Beat 3 (f=90..120): Mage runs up North Shrine Stone Steps
      if (hitFrame(f, 90)) await keyAct(page, 'w', true);
      if (hitFrame(f, 120)) {
        await keyAct(page, 'w', false);
        await page.evaluate(() => window.__freezeHeroIdle('Mage'));
      }
    },
  },

  // --------------------------------------------------------------------------
  // 2. Dodge Rolls (Knight Armored Roll vs Mage Silk Dash) & Perfect Dodge Time-Dilation
  // --------------------------------------------------------------------------
  {
    id: '02_dodge_rolls_and_perfect_dodge',
    category: 'locomotion_foley',
    tier: 4,
    totalFrames: 124, // 5.17s
    durationSec: 5.167,
    frequencyLane: { hpfHz: 80, lpfHz: 5400, subBoostDb: 2.5 },
    polyphony: 2,
    sheetFrames: [0, 8, 14, 28, 42, 48, 62, 74, 80, 88, 106, 120],
    beats: [
      {
        id: 'knight_dodge_roll_heavy',
        label: 'Knight armored dodge roll whoosh & plate clink',
        startFrame: 6,
        endFrame: 22,
        startSec: 0.25,
        endSec: 0.92,
        hook: 'playDodge("Knight")',
      },
      {
        id: 'mage_dodge_dash_silk',
        label: 'Mage silk robe evade dash whoosh',
        startFrame: 40,
        endFrame: 56,
        startSec: 1.67,
        endSec: 2.33,
        hook: 'playDodge("Mage")',
      },
      {
        id: 'perfect_dodge_time_dilation',
        label: 'Perfect Dodge last-instant evade triggering 0.30x time dilation ping & vacuum whoosh',
        startFrame: 72,
        endFrame: 100,
        startSec: 3.0,
        endSec: 4.17,
        hook: 'playPerfectDodge()',
      },
    ],
    silenceWindows: [
      [0.0, 0.25],
      [0.92, 1.67],
      [2.33, 3.0],
      [4.17, 5.167],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.setUnlockedStage(3, 0b111);
        w.coopSystem.setUnlockedStage(3);
        if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();
        w.coopSystem.teleportLeaderAndPartner(0.0, 12.0, Math.PI);
        window.__parkPartner(true);
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [2.2, 1.65, 7.8],
          target: [0.0, 0.95, 11.2],
          fov: 45,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=6..22): Knight Dodge Forward
      if (hitFrame(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.dashCd = 0;
          w.coopSystem.triggerAction('dash', { dodgeYaw: Math.PI });
        });
      }
      if (hitFrame(f, 22)) {
        await page.evaluate(() => window.__freezeHeroIdle('Knight'));
      }
      // Prep Mage at f=37
      if (hitFrame(f, 37)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          if (w.coopSystem.player.activeHeroId !== 'Mage') w.coopSystem.swapActiveHero();
          w.coopSystem.teleportLeaderAndPartner(0.0, 11.5, Math.PI);
          window.__parkPartner(true);
          window.__freezeHeroIdle('Mage');
        });
      }
      // Beat 2 (f=40..56): Mage Dodge Right/Forward
      if (hitFrame(f, 40)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Mage.dashCd = 0;
          w.coopSystem.triggerAction('dash', { dodgeYaw: Math.PI - 0.55 });
        });
      }
      if (hitFrame(f, 56)) {
        await page.evaluate(() => window.__freezeHeroIdle('Mage'));
      }
      // Prep Perfect Dodge at f=68: Knight + Skeleton_Warrior in clean side-3/4 profile
      if (hitFrame(f, 68)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();
          w.coopSystem.teleportLeaderAndPartner(0.0, 11.4, Math.PI);
          window.__parkPartner(true);
          window.__freezeHeroIdle('Knight');
          w.enemyManager.clearAllEnemies();
          const e = w.enemyManager.spawnImmediateFromSpec({
            archetype: 'skeleton_warrior',
            x: 0.0,
            z: 9.8,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
          });
          if (e) {
            e.spawnAnimTimer = 0;
            e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
          window.__FOLEY_CAM__.pos = [3.35, 1.65, 10.6];
          window.__FOLEY_CAM__.target = [0.0, 0.98, 10.6];
        });
      }
      // Beat 3 (f=72..100): Enemy swings axe -> Knight Perfect Dodges right before contact!
      if (hitFrame(f, 72)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const e = w.enemyManager.activeEnemies[0];
          const k = w.coopSystem.heroStates.Knight;
          if (e && k) {
            e.aiState = 'orbit';
            w.enemyManager.startAttack(e, 'warrior_chop', k);
            // Set windupTimer so remaining is 0.22s inside checkPerfectDodge window
            e.windupTimer = Math.max(0, e.windupDuration - 0.22);
          }
        });
      }
      if (hitFrame(f, 76)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.aiState = 'windup';
            e.windupTimer = Math.max(0, e.windupDuration - 0.18);
          }
          w.campaignLoop.combatHeroes.Knight.dashCd = 0;
          w.campaignLoop.combatHeroes.Knight.dodgeIcd = 0;
          w.coopSystem.triggerAction('dash', { dodgeYaw: Math.PI + 1.2 });
        });
      }
      if (hitFrame(f, 100)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.enemyManager.clearAllEnemies();
          window.__freezeHeroIdle('Knight');
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 3. Knight Basic Sword Combos (combo1, combo2, combo3, combo4 Whirlwind Finisher)
  // --------------------------------------------------------------------------
  {
    id: '03_knight_basic_sword_combos',
    category: 'knight_combat',
    tier: 2,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 95, lpfHz: 5600, subBoostDb: 1.5 },
    polyphony: 2,
    sheetFrames: [0, 9, 15, 28, 40, 46, 60, 70, 76, 90, 102, 110],
    beats: [
      {
        id: 'knight_slash_combo1',
        label: 'Knight Combo 1 horizontal broadsword slash',
        startFrame: 6,
        endFrame: 22,
        startSec: 0.25,
        endSec: 0.92,
        hook: 'playSwordSlash(0, "none")',
      },
      {
        id: 'knight_slash_combo2',
        label: 'Knight Combo 2 rising diagonal steel slice',
        startFrame: 36,
        endFrame: 52,
        startSec: 1.5,
        endSec: 2.17,
        hook: 'playSwordSlash(1, "none")',
      },
      {
        id: 'knight_slash_combo3',
        label: 'Knight Combo 3 heavy overhead chop',
        startFrame: 66,
        endFrame: 82,
        startSec: 2.75,
        endSec: 3.42,
        hook: 'playSwordSlash(2, "none")',
      },
      {
        id: 'knight_slash_combo4_whirlwind',
        label: 'Knight Combo 4 leaping finisher cleave',
        startFrame: 96,
        endFrame: 118,
        startSec: 4.0,
        endSec: 4.92,
        hook: 'playHeavyFinisher("none")',
      },
    ],
    silenceWindows: [
      [0.0, 0.25],
      [0.92, 1.5],
      [2.17, 2.75],
      [3.42, 4.0],
      [4.92, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.setUnlockedStage(3, 0b111);
        w.coopSystem.setUnlockedStage(3);
        if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();
        w.campaignLoop.setKnightBreathing('none', 0);
        w.vfxKit.swordVfx.setInfusion('none', 0);
        w.coopSystem.teleportLeaderAndPartner(0.0, 11.5, Math.PI);
        window.__parkPartner(true);
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [1.85, 1.52, 8.1],
          target: [-0.15, 0.98, 11.2],
          fov: 44,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      const triggerIsolatedComboStep = async (stepIdx) => {
        await page.evaluate((idx) => {
          const w = window.__WORLD__;
          w.coopSystem.teleportLeaderAndPartner(0.0, 11.5, Math.PI);
          window.__parkPartner(true);
          const hCtrl = w.coopSystem.actionAim.heroes.Knight;
          hCtrl.activeSwing = null;
          hCtrl.bufferedAttack = false;
          hCtrl.mashTimeScale = 1.0;
          hCtrl.comboIndex = idx - 1;
          hCtrl.comboResetTimer = idx === 0 ? 0 : 1.5;
          w.coopSystem.triggerAction('attack');
        }, stepIdx);
      };

      // Beat 1: combo1 (f=6..22)
      if (hitFrame(f, 6)) await triggerIsolatedComboStep(0);
      if (hitFrame(f, 22)) {
        await page.evaluate(() => {
          window.__WORLD__.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
        });
      }
      // Beat 2: combo2 (f=36..52)
      if (hitFrame(f, 36)) await triggerIsolatedComboStep(1);
      if (hitFrame(f, 52)) {
        await page.evaluate(() => {
          window.__WORLD__.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
        });
      }
      // Beat 3: combo3 (f=66..82)
      if (hitFrame(f, 66)) await triggerIsolatedComboStep(2);
      if (hitFrame(f, 82)) {
        await page.evaluate(() => {
          window.__WORLD__.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
        });
      }
      // Beat 4: combo4 (f=96..118)
      if (hitFrame(f, 96)) await triggerIsolatedComboStep(3);
      if (hitFrame(f, 118)) {
        await page.evaluate(() => {
          window.__WORLD__.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 4. Knight Sword Breathing: Glacial Tide (Ice E) & Hinokami Sunfire (Fire E)
  // --------------------------------------------------------------------------
  {
    id: '04_knight_glacial_and_sunfire_breathing',
    category: 'knight_combat',
    tier: 2,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 45, lpfHz: 5600, subBoostDb: 3.5 },
    polyphony: 2,
    sheetFrames: [0, 9, 16, 35, 48, 56, 72, 84, 92, 108, 118, 126],
    beats: [
      {
        id: 'knight_e_glacial_tide_ignition',
        label: 'Knight E Glacial Tide Ice Sword ignition & cryo dragon slash',
        startFrame: 6,
        endFrame: 30,
        startSec: 0.25,
        endSec: 1.25,
        hook: 'playBreathingIgnition("rime")',
      },
      {
        id: 'knight_glacial_tide_swings',
        label: 'Knight Glacial Tide icy blade combo swings (combo2 -> combo3)',
        startFrame: 44,
        endFrame: 66,
        startSec: 1.83,
        endSec: 2.75,
        hook: 'playSwordSlash(1, "rime")',
      },
      {
        id: 'knight_e_hinokami_sunfire_ignition',
        label: 'Knight E Hinokami Sunfire Sword ignition & blazing dragon slash',
        startFrame: 80,
        endFrame: 104,
        startSec: 3.33,
        endSec: 4.33,
        hook: 'playBreathingIgnition("solar")',
      },
      {
        id: 'knight_hinokami_sunfire_swings',
        label: 'Knight Hinokami Sunfire blazing sword swings (combo3 -> combo4)',
        startFrame: 114,
        endFrame: 132,
        startSec: 4.75,
        endSec: 5.5,
        hook: 'playSwordSlash(2, "solar")',
      },
    ],
    silenceWindows: [
      [0.0, 0.25],
      [1.25, 1.83],
      [2.75, 3.33],
      [4.33, 4.75],
      [5.5, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.setUnlockedStage(3, 0b111);
        w.coopSystem.setUnlockedStage(3);
        if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();
        w.campaignLoop.combatHeroes.Knight.selectedElement = 'ice';
        w.coopSystem.heroStates.Knight.selectedElement = 'ice';
        w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
        w.coopSystem.teleportLeaderAndPartner(0.0, 11.5, Math.PI);
        window.__parkPartner(true);
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [2.25, 1.65, 7.6],
          target: [-0.15, 1.02, 11.2],
          fov: 46,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=6..30): Glacial Tide [E] Ignition
      if (hitFrame(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.selectedElement = 'ice';
          w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
          w.coopSystem.triggerAction('skill');
        });
      }
      if (hitFrame(f, 30)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.ultimateVfx?.clear?.();
          w.vfxKit.swordVfx?.endSwing?.();
          window.__freezeHeroIdle('Knight');
        });
      }
      // Beat 2 (f=44..66): Glacial Tide 2-hit icy slashes
      if (hitFrame(f, 44)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.teleportLeaderAndPartner(0.0, 11.5, Math.PI);
          window.__parkPartner(true);
          w.campaignLoop.setKnightBreathing('rime', 13.0);
          w.coopSystem.actionAim.heroes.Knight.comboIndex = 0;
          w.coopSystem.actionAim.heroes.Knight.comboResetTimer = 1.5;
          w.coopSystem.triggerAction('attack');
        });
      }
      if (hitFrame(f, 53)) {
        await page.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
      }
      if (hitFrame(f, 66)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          w.campaignLoop.setKnightBreathing('none', 0);
          window.__freezeHeroIdle('Knight');
        });
      }
      // Beat 3 (f=80..104): Hinokami Sunfire [E] Ignition
      if (hitFrame(f, 80)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.teleportLeaderAndPartner(0.0, 11.5, Math.PI);
          window.__parkPartner(true);
          w.campaignLoop.combatHeroes.Knight.selectedElement = 'fire';
          w.coopSystem.heroStates.Knight.selectedElement = 'fire';
          w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
          w.coopSystem.triggerAction('skill');
        });
      }
      if (hitFrame(f, 104)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.ultimateVfx?.clear?.();
          w.vfxKit.swordVfx?.endSwing?.();
          window.__freezeHeroIdle('Knight');
        });
      }
      // Beat 4 (f=114..132): Hinokami Sunfire 2-hit blazing slashes
      if (hitFrame(f, 114)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.teleportLeaderAndPartner(0.0, 11.5, Math.PI);
          window.__parkPartner(true);
          w.campaignLoop.setKnightBreathing('solar', 13.0);
          w.coopSystem.actionAim.heroes.Knight.comboIndex = 1;
          w.coopSystem.actionAim.heroes.Knight.comboResetTimer = 1.5;
          w.coopSystem.triggerAction('attack');
        });
      }
      if (hitFrame(f, 122)) {
        await page.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
      }
      if (hitFrame(f, 132)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 5. Knight Q Twin-Element Sword Ultimate, Shield Block Clang & Sprint Intercept Bash
  // --------------------------------------------------------------------------
  {
    id: '05_knight_twin_element_ult_and_shield',
    category: 'knight_combat',
    tier: 1,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 40, lpfHz: 5600, subBoostDb: 4.5 },
    polyphony: 2,
    sheetFrames: [0, 10, 18, 26, 46, 60, 68, 76, 92, 104, 112, 132],
    beats: [
      {
        id: 'knight_q_twin_element_awakening',
        label: 'Tanjiro Twin-Element Sword Q Ultimate (spin-gather -> X-slash lunge -> cross-bite detonation)',
        startFrame: 6,
        endFrame: 40,
        startSec: 0.25,
        endSec: 1.67,
        hook: 'playCouplesUltimate()',
      },
      {
        id: 'knight_shield_raise_block_parry',
        label: 'Shield Guard raise [F] + physical axe block clang + parry stagger',
        startFrame: 56,
        endFrame: 86,
        startSec: 2.33,
        endSec: 3.58,
        hook: 'playShieldChime()',
      },
      {
        id: 'knight_sprint_shield_intercept',
        label: 'Sprint Shield Intercept bash knocking attacker back 3.8m',
        startFrame: 100,
        endFrame: 124,
        startSec: 4.17,
        endSec: 5.17,
        hook: 'playHeavyFinisher("rime")',
      },
    ],
    silenceWindows: [
      [0.0, 0.25],
      [1.67, 2.33],
      [3.58, 4.17],
      [5.17, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.setUnlockedStage(3, 0b111);
        w.coopSystem.setUnlockedStage(3);
        if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();
        w.campaignLoop.combatHeroes.Knight.qEnergy = 100;
        w.campaignLoop.combatHeroes.Knight.qEnergyPct = 1.0;
        w.campaignLoop.combatHeroes.Knight.ultCd = 0;
        w.coopSystem.teleportLeaderAndPartner(0.0, 11.5, Math.PI);
        window.__parkPartner(true);
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [2.6, 1.78, 7.2],
          target: [0.0, 1.05, 10.8],
          fov: 46,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=6..40): Knight Q Twin-Element Ultimate
      if (hitFrame(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.qEnergy = 100;
          w.campaignLoop.combatHeroes.Knight.ultCd = 0;
          w.coopSystem.triggerAction('ultimate');
        });
      }
      if (hitFrame(f, 40)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          w.coopSystem.resetCameraImpact?.();
          w.coopSystem.teleportLeaderAndPartner(0.0, 11.4, Math.PI);
          window.__parkPartner(true);
          window.__freezeHeroIdle('Knight');
          // Spawn Skeleton_Warrior at (0.0, 9.9) in side-3/4 profile for Shield Block & Parry beat
          w.enemyManager.clearAllEnemies();
          const e = w.enemyManager.spawnImmediateFromSpec({
            archetype: 'skeleton_warrior',
            x: 0.0,
            z: 9.9,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
          });
          if (e) {
            e.spawnAnimTimer = 0;
            e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
          window.__FOLEY_CAM__.pos = [3.35, 1.65, 10.6];
          window.__FOLEY_CAM__.target = [0.0, 0.98, 10.6];
        });
      }
      // Beat 2 (f=56..86): Shield Guard Raise + Block Clang + Parry
      if (hitFrame(f, 56)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.triggerAction('heavy'); // Raise Shield Block
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_1H_Attack_Chop', {
              loop: false,
              fade: 0.05,
              timeScale: 1.5,
              force: true,
            });
          }
        });
      }
      // Contact frame of axe on shield at f=63 + Knight Parry counter at f=68
      if (hitFrame(f, 63)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const e = w.enemyManager.activeEnemies[0];
          if (k && e) {
            w.campaignLoop.handlePlayerHit(k, e, 20);
          }
        });
      }
      if (hitFrame(f, 68)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const e = w.enemyManager.activeEnemies[0];
          w.coopSystem.triggerAction('release_heavy');
          if (k) {
            k.char.play('Melee_Block_Attack', {
              loop: false,
              fade: 0.05,
              timeScale: 1.4,
              force: true,
            });
          }
          if (e) {
            e.char.play('Hit_B', { loop: false, fade: 0.05, timeScale: 1.2, force: true });
          }
        });
      }
      if (hitFrame(f, 86)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          window.__freezeHeroIdle('Knight');
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.x = 0.0;
            e.z = 9.6;
            e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
        });
      }
      // Beat 3 (f=100..124): Sprint Shield Intercept Bash
      if (hitFrame(f, 100)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          k.lungeRemaining = 1.35;
          k.lungeDuration = 0.18;
          k.char.play('Melee_Block_Attack', {
            loop: false,
            fade: 0.04,
            timeScale: 1.45,
            force: true,
          });
          w.vfxKit.swordVfx.triggerSwing('combo1', k, Math.PI, 'rime');
        });
      }
      if (hitFrame(f, 105)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const e = w.enemyManager.activeEnemies[0];
          if (e && k) {
            w.enemyManager.applyHitToEnemy(e, {
              source: 'intercept',
              baseDmg: 34,
              attackerPos: k,
            });
            e.vx = 0;
            e.vz = -9.5;
            e.char.play('Hit_B', { loop: false, fade: 0.04, force: true });
          }
        });
      }
      if (hitFrame(f, 124)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.enemyManager.clearAllEnemies();
          w.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 6. Mage Combat & Ultimate: Shatterlance Hold-Charge Vortex + Q Sky Meteor Shower
  // --------------------------------------------------------------------------
  {
    id: '06_mage_shatterlance_charge_and_starfall_ult',
    category: 'mage_combat',
    tier: 1,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 38, lpfHz: 5600, subBoostDb: 4.5 },
    polyphony: 2,
    sheetFrames: [0, 12, 24, 36, 44, 58, 70, 78, 90, 102, 116, 134],
    beats: [
      {
        id: 'mage_shatterlance_hold_charge_vortex',
        label: 'Mage Hold-LMB Shatterlance spinning crystalline vortex buildup at staff tip',
        startFrame: 6,
        endFrame: 32,
        startSec: 0.25,
        endSec: 1.33,
        hook: 'playSpellCharge("shatterlance")',
      },
      {
        id: 'mage_shatterlance_release_burst',
        label: 'Mage Shatterlance railgun spear release & ground crystal eruption',
        startFrame: 32,
        endFrame: 52,
        startSec: 1.33,
        endSec: 2.17,
        hook: 'playSpellCast("shatterlance")',
      },
      {
        id: 'mage_q_starfall_invocation',
        label: 'Mage Q Sky Meteor Shower 0.8s staff-raise invocation & 8.4m golden ring lock',
        startFrame: 66,
        endFrame: 86,
        startSec: 2.75,
        endSec: 3.58,
        hook: 'playStarfallInvocation()',
      },
      {
        id: 'mage_q_starfall_meteor_barrage',
        label: 'Multi-meteor rain bombardment slamming across the 8.4m annular circle',
        startFrame: 94,
        endFrame: 130,
        startSec: 3.92,
        endSec: 5.42,
        hook: 'playCouplesUltimate()',
      },
    ],
    silenceWindows: [
      [0.0, 0.25],
      [2.17, 2.75],
      [3.58, 3.92],
      [5.42, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.setUnlockedStage(3, 0b111);
        w.coopSystem.setUnlockedStage(3);
        if (w.coopSystem.player.activeHeroId !== 'Mage') w.coopSystem.swapActiveHero();
        w.coopSystem.teleportLeaderAndPartner(56.0, -14.0, Math.PI * 0.5);
        window.__parkPartner(true);
        w.enemyManager.clearAllEnemies();
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI * 0.5;
        // Front-side 3/4 framing on Mage so her staff-tip crystalline vortex & piercing lance are 100% clear
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [58.8, 1.85, -10.8],
          target: [56.8, 1.12, -14.0],
          fov: 46,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=6..32): Shatterlance Hold-Charge Vortex
      if (hitFrame(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          m.char.play('Ranged_Magic_Spellcasting', {
            loop: true,
            fade: 0.06,
            timeScale: 1.15,
            force: true,
          });
          w.coopSystem.triggerAction('shatterlance_aim_start', {
            yaw: Math.PI * 0.5,
            pitch: 0.22,
            distance: 6.8,
          });
        });
      }
      if (f > 6 && f < 32) {
        const prog = (f - 6) / 26;
        await page.evaluate((p) => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          w.vfxKit.shatterlance?.updateChargeHold?.({
            origin: { x: m.x, y: m.y, z: m.z },
            yaw: Math.PI * 0.5,
            dirX: 1,
            dirZ: 0,
            direction: { x: 1, y: 0, z: 0 },
            chargeProgress: Math.min(1.0, 0.25 + p * 0.75),
            active: true,
            dt: 1 / 24,
          });
        }, prog);
      }
      // Beat 2 (f=32..52): Release Shatterlance
      if (hitFrame(f, 32)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.triggerAction('shatterlance_aim_release', {
            yaw: Math.PI * 0.5,
            pitch: 0.22,
            distance: 6.8,
          });
        });
      }
      // Silence 1 (f=52..66): Clear VFX, pull camera back to frame 8.4m meteor ring
      if (hitFrame(f, 52)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeHeroIdle('Mage');
          window.__FOLEY_CAM__.pos = [48.2, 4.45, -10.8];
          window.__FOLEY_CAM__.target = [57.2, 1.35, -14.0];
          window.__FOLEY_CAM__.fov = 50;
        });
      }
      // Beat 3 (f=66..86): Mage Q Invocation (0.8s burst_aoe pose + golden circle, pause meteors until f=94)
      if (hitFrame(f, 66)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          const ch = w.campaignLoop.combatHeroes.Mage;
          ch.stormCataclysmActive = true;
          ch.stormCataclysmTimer = 6.0;
          ch.stormCataclysmCastTimer = 0.8;
          ch.stormCataclysmWaveTimer = -1.2; // Hold meteor waves until f=94!
          ch.stormCataclysmMeteorsFired = 0;
          ch.stormCataclysmCenter = { x: m.x, y: m.y, z: m.z };
          m.actionState = 'burst_aoe';
          m.actionTimer = 0.8;
          m.char.play('Ranged_Magic_Summon', {
            loop: false,
            fade: 0.06,
            timeScale: 1.25,
            force: true,
          });
        });
      }
      // Silence 2 (f=86..94): Hold eye of the storm stillness
      if (hitFrame(f, 86)) {
        await page.evaluate(() => window.__freezeHeroIdle('Mage'));
      }
      // Beat 4 (f=94..130): Unleash rapid multi-meteor bombardment across the 8.4m circle!
      if (hitFrame(f, 94)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const ch = w.campaignLoop.combatHeroes.Mage;
          ch.stormCataclysmWaveTimer = 0.18;
        });
      }
      // Silence 3 (f=130..140): End cataclysm & clear meteors
      if (hitFrame(f, 130)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const ch = w.campaignLoop.combatHeroes.Mage;
          ch.stormCataclysmActive = false;
          ch.stormCataclysmTimer = 0;
          w.vfxKit.clear();
          w.coopSystem.resetCameraImpact?.();
          window.__freezeHeroIdle('Mage');
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 7. Co-Op Elemental Detonations: Shatterblow, Solar Flare, Thunderchain
  // --------------------------------------------------------------------------
  {
    id: '07_coop_elemental_detonations',
    category: 'detonations_impacts',
    tier: 1,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 38, lpfHz: 5600, subBoostDb: 4.5 },
    polyphony: 2,
    sheetFrames: [0, 8, 14, 24, 38, 50, 56, 66, 80, 92, 98, 128],
    beats: [
      {
        id: 'detonation_shatterblow',
        label: 'Shatterblow cryo-shrapnel detonation on Rime-marked target',
        startFrame: 6,
        endFrame: 34,
        startSec: 0.25,
        endSec: 1.42,
        hook: 'playDetonation("shatterblow")',
      },
      {
        id: 'detonation_solar_flare',
        label: 'Solar Flare crimson-gold sunfire blast wave on Solar-marked target',
        startFrame: 48,
        endFrame: 76,
        startSec: 2.0,
        endSec: 3.17,
        hook: 'playDetonation("solar_flare")',
      },
      {
        id: 'detonation_thunderchain',
        label: 'Thunderchain high-voltage chain lightning & obsidian spike detonation',
        startFrame: 90,
        endFrame: 120,
        startSec: 3.75,
        endSec: 5.0,
        hook: 'playDetonation("thunderchain")',
      },
    ],
    silenceWindows: [
      [0.0, 0.25],
      [1.42, 2.0],
      [3.17, 3.75],
      [5.0, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.setUnlockedStage(3, 0b111);
        w.coopSystem.setUnlockedStage(3);
        if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();
        w.coopSystem.teleportLeaderAndPartner(56.0, -14.0, Math.PI * 0.5);
        window.__parkPartner(true);
        w.enemyManager.clearAllEnemies();
        const e = w.enemyManager.spawnImmediateFromSpec({
          archetype: 'skeleton_warrior',
          x: 58.2,
          z: -14.0,
          rotY: -Math.PI * 0.5,
          dormant: 'standing',
          wakeRadius: 0.001,
        });
        if (e) {
          e.hp = 9999;
          e.maxHp = 9999;
          e.mark = 'rime';
          e.markTimer = 10.0;
          e.spawnAnimTimer = 0;
          e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
        }
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI * 0.5;
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [54.6, 2.15, -10.4],
          target: [57.6, 1.15, -14.0],
          fov: 46,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=6..34): Shatterblow Detonation
      if (hitFrame(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const e = w.enemyManager.activeEnemies[0];
          w.campaignLoop.setKnightBreathing('rime', 13.0);
          k.char.play('Melee_1H_Attack_Jump_Chop', {
            loop: false,
            fade: 0.04,
            timeScale: 1.45,
            force: true,
          });
          w.vfxKit.swordVfx.triggerSwing('combo4', k, Math.PI * 0.5, 'rime');
          if (e) {
            e.mark = 'rime';
            e.markTimer = 10.0;
            w.vfxKit.swordVfx.triggerDetonation('shatterblow', { x: e.x, y: e.y, z: e.z });
            w.vfxKit.frostLance.cast(
              { x: k.x + 0.6, y: k.y, z: k.z },
              { x: 1, y: 0, z: 0 },
              { range: 4.5 }
            );
            w.enemyManager.applyHitToEnemy(e, {
              source: 'combo4',
              baseDmg: 46,
              detonatesMark: true,
              attackerPos: k,
            });
          }
        });
      }
      if (hitFrame(f, 34)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.x = 58.2;
            e.z = -14.0;
            e.vx = 0;
            e.vz = 0;
            e.aiState = 'dormant';
            e.mark = 'solar';
            e.markTimer = 10.0;
            e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
        });
      }
      // Beat 2 (f=48..76): Solar Flare Detonation
      if (hitFrame(f, 48)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const e = w.enemyManager.activeEnemies[0];
          w.campaignLoop.setKnightBreathing('solar', 13.0);
          k.char.play('Melee_1H_Attack_Chop', {
            loop: false,
            fade: 0.04,
            timeScale: 1.45,
            force: true,
          });
          w.vfxKit.swordVfx.triggerSwing('combo3', k, Math.PI * 0.5, 'solar');
          if (e) {
            e.mark = 'solar';
            e.markTimer = 10.0;
            w.vfxKit.swordVfx.triggerDetonation('solar_flare', { x: e.x, y: e.y, z: e.z });
            w.vfxKit.cinderFall.cast(
              { x: e.x, y: e.y, z: e.z },
              { x: 1, y: 0, z: 0 },
              { range: 0.5, distance: 0.5, targetPos: { x: e.x, y: e.y, z: e.z }, initialAge: 0.36 }
            );
            w.enemyManager.applyHitToEnemy(e, {
              source: 'combo4',
              baseDmg: 46,
              detonatesMark: true,
              attackerPos: k,
            });
          }
        });
      }
      if (hitFrame(f, 76)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.x = 58.2;
            e.z = -14.0;
            e.vx = 0;
            e.vz = 0;
            e.aiState = 'dormant';
            e.mark = 'tempest';
            e.markTimer = 10.0;
            e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
        });
      }
      // Beat 3 (f=90..120): Thunderchain Detonation
      if (hitFrame(f, 90)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const e = w.enemyManager.activeEnemies[0];
          w.campaignLoop.setKnightBreathing('tempest', 12.0);
          k.char.play('Melee_2H_Attack_Spin', {
            loop: false,
            fade: 0.04,
            timeScale: 1.45,
            force: true,
          });
          w.vfxKit.swordVfx.triggerSwing('charged', k, Math.PI * 0.5, 'tempest');
          if (e) {
            e.mark = 'tempest';
            e.markTimer = 10.0;
            w.vfxKit.swordVfx.triggerDetonation('thunderchain', { x: e.x, y: e.y, z: e.z });
            w.vfxKit.stormLance.cast(
              { x: k.x + 0.6, y: k.y, z: k.z },
              { x: 1, y: 0, z: 0 },
              { range: 5.5 }
            );
            w.enemyManager.applyHitToEnemy(e, {
              source: 'combo4',
              baseDmg: 46,
              detonatesMark: true,
              attackerPos: k,
            });
          }
        });
      }
      if (hitFrame(f, 120)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.vx = 0;
            e.vz = 0;
            e.aiState = 'dormant';
            e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 8. Visceral Melee Hit Impacts (Bone vs Plate Armor vs Beast Flesh) & Player Damage Thud
  // --------------------------------------------------------------------------
  {
    id: '08_visceral_hit_impacts_and_player_damage',
    category: 'detonations_impacts',
    tier: 2,
    totalFrames: 124, // 5.17s
    durationSec: 5.167,
    frequencyLane: { hpfHz: 65, lpfHz: 5400, subBoostDb: 2.5 },
    polyphony: 3,
    sheetFrames: [0, 9, 14, 30, 42, 48, 64, 76, 82, 96, 105, 118],
    beats: [
      {
        id: 'hit_impact_skeleton_bone',
        label: 'Blade-to-bone melee strike on Skeleton_Warrior (ribcage crack & bone rattle)',
        startFrame: 6,
        endFrame: 25,
        startSec: 0.25,
        endSec: 1.04,
        hook: 'playEnemyHit("bone")',
      },
      {
        id: 'hit_impact_armored_knight',
        label: 'Blade-to-plate melee strike on BlackKnight (heavy obsidian armor clang)',
        startFrame: 40,
        endFrame: 58,
        startSec: 1.67,
        endSec: 2.42,
        hook: 'playEnemyHit("armor")',
      },
      {
        id: 'hit_impact_flesh_beast',
        label: 'Blade-to-flesh melee cleave on Werewolf_Wolf (meaty hide impact)',
        startFrame: 73,
        endFrame: 92,
        startSec: 3.04,
        endSec: 3.83,
        hook: 'playEnemyHit("flesh")',
      },
      {
        id: 'player_hit_damage_thud',
        label: 'OrcRaider cleaver landing unblocked hit on Knight (chest thud & armor flinch)',
        startFrame: 102,
        endFrame: 118,
        startSec: 4.25,
        endSec: 4.92,
        hook: 'playPlayerHit()',
      },
    ],
    silenceWindows: [
      [0.0, 0.25],
      [1.04, 1.67],
      [2.42, 3.04],
      [3.83, 4.25],
      [4.92, 5.167],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.setUnlockedStage(0, 0);
        w.coopSystem.setUnlockedStage(0);
        if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();
        w.campaignLoop.setKnightBreathing('none', 0);
        w.coopSystem.teleportLeaderAndPartner(0.0, 11.4, Math.PI);
        window.__parkPartner(true);
        w.enemyManager.clearAllEnemies();
        const e = w.enemyManager.spawnImmediateFromSpec({
          archetype: 'skeleton_warrior',
          x: 0.0,
          z: 10.1,
          rotY: 0,
          dormant: 'standing',
          wakeRadius: 0.001,
        });
        if (e) {
          e.hp = 9999;
          e.maxHp = 9999;
          e.spawnAnimTimer = 0;
          e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
        }
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [3.2, 1.58, 10.75],
          target: [0.0, 1.0, 10.75],
          fov: 43,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      const spawnTarget = async (arch) => {
        await page.evaluate((archetype) => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          w.coopSystem.teleportLeaderAndPartner(0.0, 11.5, Math.PI);
          window.__parkPartner(true);
          window.__freezeHeroIdle('Knight');
          w.enemyManager.clearAllEnemies();
          const e = w.enemyManager.spawnImmediateFromSpec({
            archetype,
            x: 0.0,
            z: 10.1,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
          });
          if (e) {
            e.hp = 9999;
            e.maxHp = 9999;
            e.shieldUp = false;
            e.shieldGuarding = false;
            e.directionalShieldConeDeg = 0;
            e.spawnAnimTimer = 0;
            e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
        }, arch);
      };

      // Beat 1 (f=6..25): Hit Skeleton Bone
      if (hitFrame(f, 6)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.actionAim.heroes.Knight.comboIndex = -1;
          w.coopSystem.triggerAction('attack');
        });
      }
      if (hitFrame(f, 25)) await spawnTarget('black_knight');

      // Beat 2 (f=40..58): Hit BlackKnight Plate Armor
      if (hitFrame(f, 40)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.actionAim.heroes.Knight.comboIndex = 0;
          w.coopSystem.actionAim.heroes.Knight.comboResetTimer = 1.5;
          w.coopSystem.triggerAction('attack');
        });
      }
      if (hitFrame(f, 58)) await spawnTarget('werewolf');

      // Beat 3 (f=73..92): Hit Werewolf Beast Flesh
      if (hitFrame(f, 73)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.actionAim.heroes.Knight.comboIndex = 1;
          w.coopSystem.actionAim.heroes.Knight.comboResetTimer = 1.5;
          w.coopSystem.triggerAction('attack');
        });
      }
      if (hitFrame(f, 92)) await spawnTarget('orc_raider');

      // Beat 4 (f=102..118): OrcRaider strikes Knight (Player Damage Thud)
      if (hitFrame(f, 102)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_1H_Attack_Chop', {
              loop: false,
              fade: 0.04,
              timeScale: 1.65,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 106)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const e = w.enemyManager.activeEnemies[0];
          if (k && e) {
            w.campaignLoop.handlePlayerHit(k, e, 23);
          }
        });
      }
      if (hitFrame(f, 118)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          window.__freezeHeroIdle('Knight');
          const e = w.enemyManager.activeEnemies[0];
          if (e) e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 9. Enemies — Skeleton Legion: Skeleton_Minion, Skeleton_Warrior, Skeleton_Rogue
  // --------------------------------------------------------------------------
  {
    id: '09_enemies_skeleton_legion',
    category: 'enemies_bosses',
    tier: 3,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 110, lpfHz: 5200, subBoostDb: 1.5 },
    polyphony: 3,
    sheetFrames: [0, 10, 22, 38, 50, 62, 72, 86, 96, 106, 118, 134],
    beats: [
      {
        id: 'enemy_skeleton_minion_attack_and_pile',
        label: 'Skeleton_Minion bone-clatter rush, punch/kick & bone-pile collapse',
        startFrame: 5,
        endFrame: 33,
        startSec: 0.21,
        endSec: 1.38,
        hook: 'playEnemyWindup("minion")',
      },
      {
        id: 'enemy_skeleton_warrior_shield_and_chop',
        label: 'Skeleton_Warrior shield guard, axe chop & shield-bash counter',
        startFrame: 46,
        endFrame: 79,
        startSec: 1.92,
        endSec: 3.29,
        hook: 'playEnemyWindup("warrior")',
      },
      {
        id: 'enemy_skeleton_rogue_flank_and_flurry',
        label: 'Skeleton_Rogue flank evade, 3-hit dual-dagger flurry & jump chop',
        startFrame: 92,
        endFrame: 127,
        startSec: 3.83,
        endSec: 5.29,
        hook: 'playEnemyWindup("rogue")',
      },
    ],
    silenceWindows: [
      [0.0, 0.21],
      [1.38, 1.92],
      [3.29, 3.83],
      [5.29, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.coopSystem.teleportLeaderAndPartner(0.0, 25.0, Math.PI);
        w.coopSystem.heroStates.Knight.char.group.visible = false;
        w.coopSystem.heroStates.Mage.char.group.visible = false;
        window.__parkPartner(true);
        w.enemyManager.clearAllEnemies();
        const e = w.enemyManager.spawnImmediateFromSpec({
          archetype: 'skeleton_minion',
          x: 0.0,
          z: 10.5,
          rotY: 0,
          dormant: 'standing',
          wakeRadius: 0.001,
        });
        if (e) {
          e.spawnAnimTimer = 0;
          e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
        }
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [1.35, 1.48, 13.8],
          target: [0.0, 0.92, 10.5],
          fov: 42,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=5..33): Skeleton_Minion punch + kick + bone-pile collapse
      if (hitFrame(f, 5)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_Unarmed_Attack_Punch_A', {
              loop: false,
              fade: 0.04,
              timeScale: 1.5,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 16)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Skeletons_Death', {
              loop: false,
              fade: 0.05,
              timeScale: 1.45,
              force: true,
            });
          }
        });
      }
      // Silence 1 (f=33..46): Swap to Skeleton_Warrior
      if (hitFrame(f, 35)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.enemyManager.clearAllEnemies();
          const e = w.enemyManager.spawnImmediateFromSpec({
            archetype: 'skeleton_warrior',
            x: 0.0,
            z: 10.5,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
          });
          if (e) {
            e.spawnAnimTimer = 0;
            e.char.play('Melee_Blocking', { loop: true, fade: 0.05, force: true });
          }
        });
      }
      // Beat 2 (f=46..79): Skeleton_Warrior axe chop -> shield bash
      if (hitFrame(f, 46)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_1H_Attack_Chop', {
              loop: false,
              fade: 0.05,
              timeScale: 1.4,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 62)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_Block_Attack', {
              loop: false,
              fade: 0.05,
              timeScale: 1.45,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 79)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.enemyManager.clearAllEnemies();
          const e = w.enemyManager.spawnImmediateFromSpec({
            archetype: 'skeleton_rogue',
            x: 0.0,
            z: 10.5,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
          });
          if (e) {
            e.spawnAnimTimer = 0;
            e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
        });
      }
      // Beat 3 (f=92..127): Skeleton_Rogue side dash -> dual-dagger stab flurry -> jump chop
      if (hitFrame(f, 92)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Dodge_Left', { loop: false, fade: 0.04, timeScale: 1.4, force: true });
          }
        });
      }
      if (hitFrame(f, 100)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_Dualwield_Attack_Stab', {
              loop: false,
              fade: 0.04,
              timeScale: 1.5,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 114)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_1H_Attack_Jump_Chop', {
              loop: false,
              fade: 0.04,
              timeScale: 1.55,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 127)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 10. Enemies — Casters & Sylvan: Skeleton_Mage, Necromancer Boss, PlantWarrior
  // --------------------------------------------------------------------------
  {
    id: '10_enemies_casters_and_sylvan',
    category: 'enemies_bosses',
    tier: 3,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 55, lpfHz: 5400, subBoostDb: 2.5 },
    polyphony: 3,
    sheetFrames: [0, 10, 24, 42, 56, 70, 82, 92, 104, 116, 124, 136],
    beats: [
      {
        id: 'enemy_skeleton_mage_bolt_and_eruption',
        label: 'Skeleton_Mage arcane bolt launch & crimson petal-crack ground eruption',
        startFrame: 5,
        endFrame: 37,
        startSec: 0.21,
        endSec: 1.54,
        hook: 'playEnemyWindup("cast")',
      },
      {
        id: 'boss_necromancer_summon_and_bolt',
        label: 'Grove Necromancer Sovereign summoning circle ritual & hunter spawn',
        startFrame: 50,
        endFrame: 87,
        startSec: 2.08,
        endSec: 3.63,
        hook: 'playEnemyWindup("heavy")',
      },
      {
        id: 'enemy_plant_warrior_thorn_and_spear',
        label: 'Briar PlantWarrior ranged thorn shot & close-quarters spear slash',
        startFrame: 99,
        endFrame: 130,
        startSec: 4.13,
        endSec: 5.42,
        hook: 'playEnemyWindup("melee")',
      },
    ],
    silenceWindows: [
      [0.0, 0.21],
      [1.54, 2.08],
      [3.63, 4.13],
      [5.42, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.coopSystem.teleportLeaderAndPartner(0.0, 25.0, Math.PI);
        w.coopSystem.heroStates.Knight.char.group.visible = false;
        w.coopSystem.heroStates.Mage.char.group.visible = false;
        window.__parkPartner(true);
        w.enemyManager.clearAllEnemies();
        const e = w.enemyManager.spawnImmediateFromSpec({
          archetype: 'skeleton_mage',
          x: 0.0,
          z: 10.5,
          rotY: 0,
          dormant: 'standing',
          wakeRadius: 0.001,
        });
        if (e) {
          e.spawnAnimTimer = 0;
          e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
        }
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [1.65, 1.65, 14.5],
          target: [0.0, 1.0, 10.5],
          fov: 44,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=5..37): Skeleton_Mage bolt + ground petal-crack eruption
      if (hitFrame(f, 5)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Ranged_Magic_Shoot', {
              loop: false,
              fade: 0.05,
              timeScale: 1.45,
              force: true,
            });
            w.enemyManager.spawnEnemyProjectile({
              owner: e,
              origin: { x: 0.0, y: 1.25, z: 11.1 },
              targetPos: { x: 0.0, y: 1.0, z: 14.0 },
              speed: 9.5,
              dmg: 18,
              kind: 'arcane_bolt',
            });
          }
        });
      }
      if (hitFrame(f, 18)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Ranged_Magic_Spellcasting_Long', {
              loop: false,
              fade: 0.05,
              timeScale: 1.65,
              force: true,
            });
          }
          const d = w.enemyManager.areaDecals?.[0];
          if (d) {
            d.position.set(0.0, 0.04, 11.8);
            d.scale.set(2.2, 2.2, 1);
            d.visible = true;
            d.material.uniforms.uProgress.value = 0.85;
          }
        });
      }
      if (hitFrame(f, 38)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const d = w.enemyManager.areaDecals?.[0];
          if (d) d.visible = false;
          w.enemyManager.clearAllEnemies();
          const boss = w.enemyManager.spawnImmediateFromSpec({
            archetype: 'grove_necromancer',
            x: 0.0,
            z: 10.2,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
            initialSummonCooldown: 999,
          });
          if (boss) {
            boss.spawnAnimTimer = 0;
            boss.summonCooldownTimer = 999;
            boss.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
          window.__FOLEY_CAM__.pos = [2.1, 1.88, 15.2];
          window.__FOLEY_CAM__.target = [0.0, 1.2, 10.2];
        });
      }
      // Beat 2 (f=50..87): Necromancer Boss summoning ritual + hunter spawn
      if (hitFrame(f, 50)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const boss = w.enemyManager.activeEnemies[0];
          if (boss) {
            boss.char.play('Ranged_Magic_Summon', {
              loop: false,
              fade: 0.06,
              timeScale: 1.6,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 62)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          for (const [arch, sx] of [
            ['skeleton_rogue', -1.65],
            ['werewolf', 1.65],
          ]) {
            const add = w.enemyManager.spawnImmediateFromSpec({
              archetype: arch,
              x: sx,
              z: 10.8,
              rotY: 0,
              dormant: 'standing',
              wakeRadius: 0.001,
            });
            if (add) {
              add.spawnAnimTimer = 0;
              add.char.play('Spawn_Ground', {
                loop: false,
                fade: 0.04,
                timeScale: 1.75,
                force: true,
              });
            }
          }
        });
      }
      if (hitFrame(f, 88)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.enemyManager.clearAllEnemies();
          const pw = w.enemyManager.spawnImmediateFromSpec({
            archetype: 'plant_warrior',
            x: 0.0,
            z: 10.5,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
          });
          if (pw) {
            pw.spawnAnimTimer = 0;
            pw.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
          window.__FOLEY_CAM__.pos = [1.55, 1.55, 14.2];
          window.__FOLEY_CAM__.target = [0.0, 0.98, 10.5];
        });
      }
      // Beat 3 (f=99..130): PlantWarrior ranged thorn shot -> melee spear slice
      if (hitFrame(f, 99)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const pw = w.enemyManager.activeEnemies[0];
          if (pw) {
            pw.char.play('Ranged_Magic_Shoot', {
              loop: false,
              fade: 0.05,
              timeScale: 1.5,
              force: true,
            });
            w.enemyManager.spawnEnemyProjectile({
              owner: pw,
              origin: { x: 0.0, y: 1.25, z: 11.1 },
              targetPos: { x: 0.0, y: 1.0, z: 14.0 },
              speed: 11.0,
              dmg: 18,
              kind: 'thorn_bolt',
            });
          }
        });
      }
      if (hitFrame(f, 113)) {
        await page.evaluate(() => {
          const pw = window.__WORLD__.enemyManager.activeEnemies[0];
          if (pw) {
            pw.z = 11.1;
            pw.char.play('Melee_1H_Attack_Slice_Diagonal', {
              loop: false,
              fade: 0.04,
              timeScale: 1.55,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 130)) {
        await page.evaluate(() => {
          const pw = window.__WORLD__.enemyManager.activeEnemies[0];
          if (pw) pw.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 11. Enemies — Berserkers & Elites: OrcRaider, Werewolf_Wolf, BlackKnight Elite
  // --------------------------------------------------------------------------
  {
    id: '11_enemies_berserkers_and_elites',
    category: 'enemies_bosses',
    tier: 3,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 70, lpfHz: 5400, subBoostDb: 2.5 },
    polyphony: 3,
    sheetFrames: [0, 10, 22, 40, 54, 66, 76, 90, 102, 112, 122, 136],
    beats: [
      {
        id: 'enemy_orc_raider_sprint_and_cleave',
        label: 'OrcRaider heavy berserker sprint & 2H cleaver chop',
        startFrame: 5,
        endFrame: 36,
        startSec: 0.21,
        endSec: 1.5,
        hook: 'playEnemyWindup("orc_raider")',
      },
      {
        id: 'enemy_werewolf_stalk_and_pounce',
        label: 'Werewolf_Wolf feral stalk & airborne leap-pounce chop',
        startFrame: 49,
        endFrame: 84,
        startSec: 2.04,
        endSec: 3.5,
        hook: 'playEnemyWindup("werewolf")',
      },
      {
        id: 'elite_black_knight_shield_and_greatsword',
        label: 'BlackKnight obsidian tower-shield block clang & 360-deg dark greatsword cleave',
        startFrame: 97,
        endFrame: 130,
        startSec: 4.04,
        endSec: 5.42,
        hook: 'playEnemyWindup("heavy")',
      },
    ],
    silenceWindows: [
      [0.0, 0.21],
      [1.5, 2.04],
      [3.5, 4.04],
      [5.42, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.coopSystem.teleportLeaderAndPartner(0.0, 25.0, Math.PI);
        w.coopSystem.heroStates.Knight.char.group.visible = false;
        w.coopSystem.heroStates.Mage.char.group.visible = false;
        window.__parkPartner(true);
        w.enemyManager.clearAllEnemies();
        const e = w.enemyManager.spawnImmediateFromSpec({
          archetype: 'orc_raider',
          x: 0.0,
          z: 9.2,
          rotY: 0,
          dormant: 'standing',
          wakeRadius: 0.001,
        });
        if (e) {
          e.spawnAnimTimer = 0;
          e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
        }
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [1.65, 1.62, 14.2],
          target: [0.0, 1.02, 10.6],
          fov: 43,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=5..36): OrcRaider sprint + 2H cleaver chop
      if (hitFrame(f, 5)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Running_A', { loop: true, fade: 0.04, timeScale: 1.6, force: true });
          }
        });
      }
      if (f >= 5 && f < 14) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) e.z += 0.16;
        });
      }
      if (hitFrame(f, 14)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_2H_Attack_Chop', {
              loop: false,
              fade: 0.04,
              timeScale: 1.45,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 37)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.enemyManager.clearAllEnemies();
          const e = w.enemyManager.spawnImmediateFromSpec({
            archetype: 'werewolf',
            x: 0.0,
            z: 9.5,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
          });
          if (e) {
            e.spawnAnimTimer = 0;
            e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
        });
      }
      // Beat 2 (f=49..84): Werewolf stalk -> airborne leap-pounce
      if (hitFrame(f, 49)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Dodge_Forward', { loop: false, fade: 0.04, timeScale: 1.35, force: true });
          }
        });
      }
      if (hitFrame(f, 57)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_1H_Attack_Jump_Chop', {
              loop: false,
              fade: 0.04,
              timeScale: 1.35,
              force: true,
            });
          }
        });
      }
      if (f >= 57 && f <= 73) {
        const u = (f - 57) / 16;
        await page.evaluate((prog) => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.z = 9.5 + prog * 1.45;
            e.leapLift = Math.sin(prog * Math.PI) * 1.15;
          }
        }, u);
      }
      if (hitFrame(f, 74)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) e.leapLift = 0;
        });
      }
      if (hitFrame(f, 85)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.enemyManager.clearAllEnemies();
          const e = w.enemyManager.spawnImmediateFromSpec({
            archetype: 'black_knight',
            x: 0.0,
            z: 10.6,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
          });
          if (e) {
            e.spawnAnimTimer = 0;
            e.char.play('Melee_Blocking', { loop: true, fade: 0.05, force: true });
          }
        });
      }
      // Beat 3 (f=97..130): BlackKnight shield block hit -> 2H spin -> 2H chop
      if (hitFrame(f, 97)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_Block_Hit', {
              loop: false,
              fade: 0.04,
              timeScale: 1.35,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 106)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_2H_Attack_Spin', {
              loop: false,
              fade: 0.04,
              timeScale: 1.5,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 118)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_2H_Attack_Chop', {
              loop: false,
              fade: 0.04,
              timeScale: 1.55,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 130)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 12. Finale Bosses: OrcBrute, FrostGolem, Skeleton_Golem (Roar, Slam & Stagger Collapse)
  // --------------------------------------------------------------------------
  {
    id: '12_bosses_brute_and_golems',
    category: 'enemies_bosses',
    tier: 1,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 38, lpfHz: 5200, subBoostDb: 4.5 },
    polyphony: 2,
    sheetFrames: [0, 10, 24, 42, 56, 70, 82, 94, 106, 118, 128, 138],
    beats: [
      {
        id: 'boss_orc_brute_slam',
        label: 'OrcBrute boss war-flex & earth-cracking 2H overhead greatclub slam',
        startFrame: 5,
        endFrame: 39,
        startSec: 0.21,
        endSec: 1.63,
        hook: 'playEnemyWindup("heavy")',
      },
      {
        id: 'boss_frost_golem_combo_and_smash',
        label: 'FrostGolem boss colossal glacier footsteps, dual-fist combo & tectonic smash',
        startFrame: 51,
        endFrame: 90,
        startSec: 2.13,
        endSec: 3.75,
        hook: 'playEnemyWindup("area")',
      },
      {
        id: 'boss_skeleton_golem_roar_and_stagger_collapse',
        label: 'Skeleton_Golem boss 70%/35% phase-threshold roar & Bone Aegis shatter collapse',
        startFrame: 102,
        endFrame: 133,
        startSec: 4.25,
        endSec: 5.54,
        hook: 'playBossPhaseRoar()',
      },
    ],
    silenceWindows: [
      [0.0, 0.21],
      [1.63, 2.13],
      [3.75, 4.25],
      [5.54, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.coopSystem.teleportLeaderAndPartner(0.0, 25.0, Math.PI);
        w.coopSystem.heroStates.Knight.char.group.visible = false;
        w.coopSystem.heroStates.Mage.char.group.visible = false;
        window.__parkPartner(true);
        w.enemyManager.clearAllEnemies();
        const e = w.enemyManager.spawnImmediateFromSpec({
          archetype: 'orc_brute',
          x: 0.0,
          z: 9.8,
          rotY: 0,
          dormant: 'standing',
          wakeRadius: 0.001,
        });
        if (e) {
          e.spawnAnimTimer = 0;
          e.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
        }
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [2.25, 1.85, 15.6],
          target: [0.0, 1.35, 10.0],
          fov: 45,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=5..39): OrcBrute war-flex -> 2H Greatclub Slam + ground crack decal
      if (hitFrame(f, 5)) {
        await page.evaluate(() => {
          const e = window.__WORLD__.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Flexing', { loop: false, fade: 0.05, timeScale: 2.2, force: true });
          }
        });
      }
      if (hitFrame(f, 17)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const e = w.enemyManager.activeEnemies[0];
          if (e) {
            e.char.play('Melee_2H_Slam', {
              loop: false,
              fade: 0.05,
              timeScale: 1.45,
              force: true,
            });
          }
          const d = w.enemyManager.areaDecals?.[0];
          if (d) {
            d.position.set(0.0, 0.04, 11.6);
            d.scale.set(2.8, 2.8, 1);
            d.visible = true;
            d.material.uniforms.uProgress.value = 0.92;
          }
        });
      }
      if (hitFrame(f, 40)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const d = w.enemyManager.areaDecals?.[0];
          if (d) d.visible = false;
          w.enemyManager.clearAllEnemies();
          const fg = w.enemyManager.spawnImmediateFromSpec({
            archetype: 'frost_golem',
            x: 0.0,
            z: 9.8,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
          });
          if (fg) {
            fg.spawnAnimTimer = 0;
            fg.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
        });
      }
      // Beat 2 (f=51..90): FrostGolem footsteps -> dual-fist combo -> tectonic smash
      if (hitFrame(f, 51)) {
        await page.evaluate(() => {
          const fg = window.__WORLD__.enemyManager.activeEnemies[0];
          if (fg) {
            fg.char.play('Walking_A', { loop: true, fade: 0.05, timeScale: 1.6, force: true });
          }
        });
      }
      if (hitFrame(f, 61)) {
        await page.evaluate(() => {
          const fg = window.__WORLD__.enemyManager.activeEnemies[0];
          if (fg) {
            fg.char.play('Melee_Dualwield_SlashCombo', {
              loop: false,
              fade: 0.05,
              timeScale: 1.55,
              force: true,
            });
          }
        });
      }
      if (hitFrame(f, 75)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const fg = w.enemyManager.activeEnemies[0];
          if (fg) {
            fg.char.play('Melee_Unarmed_Smash', {
              loop: false,
              fade: 0.05,
              timeScale: 1.5,
              force: true,
            });
          }
          const d = w.enemyManager.areaDecals?.[0];
          if (d) {
            d.position.set(0.0, 0.04, 11.4);
            d.scale.set(3.2, 3.2, 1);
            d.visible = true;
            d.material.uniforms.uProgress.value = 0.95;
          }
        });
      }
      if (hitFrame(f, 91)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const d = w.enemyManager.areaDecals?.[0];
          if (d) d.visible = false;
          w.enemyManager.clearAllEnemies();
          const sg = w.enemyManager.spawnImmediateFromSpec({
            archetype: 'boss_sovereign',
            x: 0.0,
            z: 9.8,
            rotY: 0,
            dormant: 'standing',
            wakeRadius: 0.001,
          });
          if (sg) {
            sg.spawnAnimTimer = 0;
            sg.char.play('Idle_A', { loop: true, fade: 0.05, force: true });
          }
        });
      }
      // Beat 3 (f=102..133): Skeleton_Golem phase roar (Flexing) -> stagger collapse (Death_A)
      if (hitFrame(f, 102)) {
        await page.evaluate(() => {
          const sg = window.__WORLD__.enemyManager.activeEnemies[0];
          if (sg) {
            sg.char.play('Flexing', { loop: false, fade: 0.05, timeScale: 2.0, force: true });
          }
        });
      }
      if (hitFrame(f, 116)) {
        await page.evaluate(() => {
          const sg = window.__WORLD__.enemyManager.activeEnemies[0];
          if (sg) {
            sg.char.play('Death_A', { loop: false, fade: 0.06, timeScale: 1.35, force: true });
          }
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 13. Sacred Stones [G], Crimson Rose Ring [R] Channel & Mode A Normal Field Heal
  // --------------------------------------------------------------------------
  {
    id: '13_sacred_stones_and_field_heal',
    category: 'sacred_stones_commune',
    tier: 0,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 65, lpfHz: 5400, subBoostDb: 2.0 },
    polyphony: 1,
    sheetFrames: [0, 12, 24, 34, 48, 60, 72, 84, 96, 108, 120, 136],
    beats: [
      {
        id: 'sacred_stone_inspect_and_wellspring',
        label: 'Approaching & inspecting [G] Sacred Stone 1 Village Well (travertine resonance & Wellspring water ripple)',
        startFrame: 5,
        endFrame: 42,
        startSec: 0.21,
        endSec: 1.75,
        hook: 'playStoneInspectResonance()',
      },
      {
        id: 'commune_rose_ring_bloom_and_channel',
        label: 'Pressing [R] Commune to bloom 24-cluster Crimson Rose Ring & spiral petals',
        startFrame: 55,
        endFrame: 90,
        startSec: 2.29,
        endSec: 3.75,
        hook: 'playCommuneChannelStart()',
      },
      {
        id: 'commune_mode_a_field_heal',
        label: 'Mode A Normal Field Heal instant golden rose shimmer in-place',
        startFrame: 102,
        endFrame: 132,
        startSec: 4.25,
        endSec: 5.5,
        hook: 'playShieldChime()',
      },
    ],
    silenceWindows: [
      [0.0, 0.21],
      [1.75, 2.29],
      [3.75, 4.25],
      [5.5, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.setUnlockedStage(1, 1);
        w.coopSystem.setUnlockedStage(1);
        if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();
        w.coopSystem.teleportLeaderAndPartner(-0.75, 3.6, Math.PI);
        const m = w.coopSystem.heroStates.Mage;
        m.x = 0.75;
        m.z = 3.6;
        m.yaw = Math.PI;
        m.actionState = 'foley_parked';
        m.actionTimer = 9999;
        m.char.group.position.set(m.x, m.y, m.z);
        m.char.group.rotation.y = m.yaw;
        m.char.group.visible = true;
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [0.0, 2.25, 7.6],
          target: [0.0, 0.85, 1.2],
          fov: 45,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=5..42): Inspect Stone 1 Well [G]
      if (hitFrame(f, 5)) {
        await page.evaluate(() => {
          window.__WORLD__.enterStoneInspection();
        });
      }
      // Silence 1 (f=42..55): Exit Stone Inspection & snap back to couple framing
      if (hitFrame(f, 42)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.exitStoneInspection();
          w.stoneGazeState.inspectBlend = 0;
          w.coopSystem.knight.group.visible = true;
          w.coopSystem.mage.group.visible = true;
        });
      }
      // Beat 2 (f=55..90): [R] Crimson Rose Ring Bloom & Petal Spiral
      if (hitFrame(f, 55)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const m = w.coopSystem.heroStates.Mage;
          k.char.play('Ranged_Magic_Raise', { loop: true, fade: 0.08, force: true });
          m.char.play('Ranged_Magic_Spellcasting', { loop: true, fade: 0.08, force: true });
          w.communeClient?.roseRingTimer?.start?.({ x: 0.0, y: k.y, z: 3.6 });
          w.vfxKit.artoriousVfx?.startChannel?.(k, m, { communeMode: 'normal' });
        });
      }
      if (f > 55 && f < 90) {
        const el = ((f - 55) / 35) * 8.0;
        await page.evaluate((elapsedRose) => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          w.communeClient?.roseRingTimer?.setElapsed?.(elapsedRose, { x: 0.0, y: k.y, z: 3.6 });
        }, el);
      }
      // Silence 2 (f=90..102): Stop Rose Ring & Channel
      if (hitFrame(f, 90)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.communeClient?.roseRingTimer?.stop?.();
          w.vfxKit.artoriousVfx?.stopChannel?.();
          w.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
          window.__freezeHeroIdle('Mage');
          w.coopSystem.heroStates.Mage.actionState = 'foley_parked';
          w.coopSystem.heroStates.Mage.actionTimer = 9999;
        });
      }
      // Beat 3 (f=102..132): Mode A Normal Field Heal in-place
      if (hitFrame(f, 102)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const m = w.coopSystem.heroStates.Mage;
          w.campaignLoop.combatHeroes.Knight.hp = 110;
          w.campaignLoop.combatHeroes.Mage.hp = 60;
          w.coopSystem.applyCommuneVerdict(
            {
              verdict: 'heal',
              prayerMode: 'field_heal',
              hpDeltaPct: 0.65,
            },
            'Knight'
          );
          k.char.play('Cheering', { loop: false, fade: 0.06, force: true });
          m.char.play('Cheering', { loop: false, fade: 0.06, force: true });
        });
      }
      if (hitFrame(f, 132)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
          window.__freezeHeroIdle('Mage');
          w.coopSystem.heroStates.Mage.actionState = 'foley_parked';
          w.coopSystem.heroStates.Mage.actionTimer = 9999;
        });
      }
    },
  },

  // --------------------------------------------------------------------------
  // 14. Co-Op Lifecycle: Partner Downed Collapse, Proximity Revive & Sanctuary Rebirth
  // --------------------------------------------------------------------------
  {
    id: '14_coop_downed_revive_and_rebirth',
    category: 'sacred_stones_commune',
    tier: 0,
    totalFrames: 141, // 5.88s
    durationSec: 5.875,
    frequencyLane: { hpfHz: 55, lpfHz: 5400, subBoostDb: 2.5 },
    polyphony: 1,
    sheetFrames: [0, 10, 20, 36, 50, 66, 78, 94, 106, 116, 126, 136],
    beats: [
      {
        id: 'coop_partner_downed_collapse',
        label: 'Partner downed collapse onto stone floor at 0 HP',
        startFrame: 5,
        endFrame: 31,
        startSec: 0.21,
        endSec: 1.29,
        hook: 'playPartnerDowned()',
      },
      {
        id: 'coop_proximity_revive_channel_and_rise',
        label: 'Proximity Co-Op Revive channel while holding Shield Guard -> partner rises at 45% HP',
        startFrame: 44,
        endFrame: 90,
        startSec: 1.83,
        endSec: 3.75,
        hook: 'playPartnerRevive()',
      },
      {
        id: 'coop_sanctuary_rebirth_respawn',
        label: 'Sanctuary Rebirth safe-haven respawn with Golden Ward Shield shimmer',
        startFrame: 102,
        endFrame: 132,
        startSec: 4.25,
        endSec: 5.5,
        hook: 'playSanctuaryRebirth()',
      },
    ],
    silenceWindows: [
      [0.0, 0.21],
      [1.29, 1.83],
      [3.75, 4.25],
      [5.5, 5.875],
    ],
    async setup(page) {
      await page.evaluate(() => {
        const w = window.__WORLD__;
        w.campaignLoop.setUnlockedStage(2, 0b011);
        w.coopSystem.setUnlockedStage(2);
        if (w.coopSystem.player.activeHeroId !== 'Knight') w.coopSystem.swapActiveHero();
        w.coopSystem.teleportLeaderAndPartner(-0.85, 11.5, Math.PI);
        const m = w.coopSystem.heroStates.Mage;
        m.x = 0.85;
        m.z = 11.5;
        m.yaw = Math.PI;
        m.actionState = 'foley_parked';
        m.actionTimer = 9999;
        m.char.group.position.set(m.x, m.y, m.z);
        m.char.group.rotation.y = m.yaw;
        m.char.group.visible = true;
        w.camState.mode = 'player';
        w.camState.yaw = Math.PI;
        window.__FOLEY_CAM__ = {
          active: true,
          mode: 'fixed',
          pos: [0.0, 1.85, 7.2],
          target: [0.0, 0.9, 11.5],
          fov: 44,
        };
      });
      await stepFrames(page, 15);
    },
    async onFrame(f, t, page) {
      // Beat 1 (f=5..31): Mage Downed Collapse
      if (hitFrame(f, 5)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const m = w.coopSystem.heroStates.Mage;
          w.campaignLoop.combatHeroes.Mage.hp = 0;
          w.campaignLoop.combatHeroes.Mage.downed = true;
          m.char.play('Death_A', { loop: false, fade: 0.06, timeScale: 1.25, force: true });
        });
      }
      // Beat 2 (f=44..90): Knight holds Shield Block beside downed Mage -> Mage revives at f=70
      if (hitFrame(f, 44)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const m = w.coopSystem.heroStates.Mage;
          k.char.play('Melee_Blocking', { loop: true, fade: 0.06, force: true });
          w.vfxKit.artoriousVfx?.triggerHeal?.(k, m);
        });
      }
      if (hitFrame(f, 70)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const m = w.coopSystem.heroStates.Mage;
          w.campaignLoop.combatHeroes.Mage.downed = false;
          w.campaignLoop.combatHeroes.Mage.hp = 54;
          m.char.play('Lie_StandUp', { loop: false, fade: 0.06, timeScale: 1.45, force: true });
          k.char.play('Idle_A', { loop: true, fade: 0.08, force: true });
        });
      }
      // Silence 2 (f=90..102): Prep Safe Haven Sanctuary Rebirth at (0.0, 18.5)
      if (hitFrame(f, 90)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          w.coopSystem.teleportLeaderAndPartner(-0.85, 18.5, Math.PI);
          const k = w.coopSystem.heroStates.Knight;
          const m = w.coopSystem.heroStates.Mage;
          m.x = 0.85;
          m.z = 18.5;
          m.yaw = Math.PI;
          m.actionState = 'foley_parked';
          m.actionTimer = 9999;
          m.char.group.position.set(m.x, m.y, m.z);
          m.char.group.rotation.y = m.yaw;
          m.char.group.visible = true;
          k.char.play('Sit_Floor_Idle', { loop: true, fade: 0.04, force: true });
          m.char.play('Sit_Floor_Idle', { loop: true, fade: 0.04, force: true });
          window.__FOLEY_CAM__.pos = [0.0, 1.9, 14.2];
          window.__FOLEY_CAM__.target = [0.0, 0.95, 18.5];
        });
      }
      // Beat 3 (f=102..132): Sanctuary Rebirth Respawn
      if (hitFrame(f, 102)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const m = w.coopSystem.heroStates.Mage;
          k.char.play('Sit_Floor_StandUp', {
            loop: false,
            fade: 0.06,
            timeScale: 1.45,
            force: true,
          });
          m.char.play('Sit_Floor_StandUp', {
            loop: false,
            fade: 0.06,
            timeScale: 1.45,
            force: true,
          });
          w.vfxKit.artoriousVfx?.triggerHeal?.(k, m);
        });
      }
      if (hitFrame(f, 118)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.heroStates.Knight.char.play('Cheering', {
            loop: false,
            fade: 0.06,
            force: true,
          });
          w.coopSystem.heroStates.Mage.char.play('Cheering', {
            loop: false,
            fade: 0.06,
            force: true,
          });
        });
      }
      if (hitFrame(f, 132)) {
        await page.evaluate(() => {
          const w = window.__WORLD__;
          w.vfxKit.clear();
          window.__freezeHeroIdle('Knight');
          window.__freezeHeroIdle('Mage');
          w.coopSystem.heroStates.Mage.actionState = 'foley_parked';
          w.coopSystem.heroStates.Mage.actionTimer = 9999;
        });
      }
    },
  },
];

// ============================================================================
// MAIN RUNNER & SLICE MANIFEST GENERATOR
// ============================================================================

const requestedIds = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const specsToRun =
  requestedIds.length > 0
    ? CLIP_SPECS.filter((s) => requestedIds.includes(s.id))
    : CLIP_SPECS;

if (specsToRun.length === 0) {
  console.error(`[foley-harness] No matching clip specs for: ${requestedIds.join(', ')}`);
  await browser.close();
  srv.server.close();
  process.exit(1);
}

let failed = 0;
const resultsById = {};

for (const spec of specsToRun) {
  try {
    const { page, errors } = await openCleanWorldPage();
    await spec.setup?.(page);
    const res = await captureFoleyClip(page, spec);
    await page.close();
    resultsById[spec.id] = {
      ...res,
      pageErrors: [...new Set(errors)],
    };
    if (errors.length > 0) {
      console.warn(`[foley-harness] ${spec.id} page warnings:`, [...new Set(errors)].slice(0, 3));
    }
  } catch (err) {
    failed++;
    console.error(`[foley-harness] ${spec.id} FAILED:`, err);
  }
}

// Always write/update the complete slice-manifest.json in sfx-foley/videos/slice-manifest.json
const manifestPath = path.join(VIDEOS_DIR, 'slice-manifest.json');
const manifestData = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  pipeline: {
    model: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
    width: W,
    height: H,
    fps: FPS,
    steps: 16,
    sampler: 'euler',
    scheduler: 'simple',
    shiftVideo: 12.0,
    shiftAudio: 4.0,
    cfg: 1.8,
  },
  clips: CLIP_SPECS.map((s) => ({
    id: s.id,
    videoFile: `${s.id}.mp4`,
    contactSheetFile: `${s.id}-sheet.jpg`,
    category: s.category,
    tier: s.tier,
    width: W,
    height: H,
    fps: FPS,
    totalFrames: s.totalFrames,
    durationSec: s.durationSec,
    frequencyLane: s.frequencyLane,
    polyphony: s.polyphony,
    beats: s.beats,
    silenceWindows: s.silenceWindows,
  })),
};
fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf8');
console.log(`[foley-harness] Wrote slice manifest to ${manifestPath}`);

await browser.close();
srv.server.close();
process.exit(failed ? 1 : 0);
