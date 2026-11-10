// Deterministic gameplay capture for both Windows D3D11 hardware GPU and headless/software-GL machines.
// Time is virtualised (performance.now + requestAnimationFrame are stepped at a fixed FPS),
// so every recorded video has exact real-time motion.
//
//   node world/tools/capture-combat-pass.mjs [scene ...]     scenes: hud cinder dodge golem
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';

const OUT = process.env.OUT || 'world/shots/combat-pass-2026-11-09';
const W = Number(process.env.W || 1280);
const H = Number(process.env.H || 720);
const FPS = Number(process.env.FPS || 24);
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['hud', 'cinder', 'dodge', 'golem'];

const FFMPEG_BIN = fs.existsSync('C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe')
  ? 'C:\\Users\\silen\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe'
  : 'ffmpeg';

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
    } catch { /* next */ }
  }
  throw new Error('playwright-core not found (set PLAYWRIGHT=...)');
}

const VIRTUAL_TIME = (frameMs) => {
  let vt = 0;
  let queue = [];
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__vt = {
    grab() { return window.__WORLD__.renderer.domElement.toDataURL('image/jpeg', 0.9); },
    step(ms = frameMs) {
      vt += ms;
      const q = queue;
      queue = [];
      for (const cb of q) {
        try { cb(vt); } catch (e) { console.error(e); }
      }
    },
  };
};

fs.mkdirSync(OUT, { recursive: true });
const srv = await startServer(Number(process.env.PORT || 0));
const base = `${srv.url}?nolobby=1`;
const chromium = await loadChromium();
const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const useGpu = process.platform === 'win32' && !process.env.SWIFTSHADER;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || (fs.existsSync(winChrome) ? winChrome : '/usr/local/bin/google-chrome'),
  args: useGpu
    ? ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function openWorld() {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(VIRTUAL_TIME, 1000 / FPS);
  await page.goto(base);
  for (let i = 0; i < 4000; i++) {
    if (await page.evaluate(() => Boolean(window.__WORLD__?.ready))) break;
    await page.evaluate(() => window.__vt.step());
    await page.waitForTimeout(15);
  }
  console.log('[capture] world ready');
  await step(page, 12);
  return { page, errors };
}

async function step(page, frames = 1) {
  for (let i = 0; i < frames; i++) await page.evaluate(() => window.__vt.step());
}

async function record(page, name, seconds, script, { every = 1 } = {}) {
  const dir = path.join(OUT, `.frames-${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const total = Math.round(seconds * FPS);
  let n = 0;
  for (let f = 0; f < total; f++) {
    await script?.(f / FPS, page);
    await page.evaluate(() => window.__vt.step());
    if (f % every === 0) {
      await page.screenshot({
        path: path.join(dir, `${String(n++).padStart(4, '0')}.jpg`),
        type: 'jpeg',
        quality: 92,
      });
    }
    if (f % 24 === 0) console.log(`[capture] ${name} frame ${f}/${total} ${new Date().toISOString().slice(11, 19)}`);
  }
  const mp4 = path.join(OUT, `${name}.mp4`);
  execFileSync(FFMPEG_BIN, [
    '-y', '-loglevel', 'error', '-framerate', String(FPS / every),
    '-i', path.join(dir, '%04d.jpg'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', mp4,
  ]);
  execFileSync(FFMPEG_BIN, [
    '-y', '-loglevel', 'error', '-i', mp4,
    '-vf', `fps=${Math.max(1, Math.round(12 / seconds))},scale=400:-1,tile=4x3`,
    '-frames:v', '1',
    path.join(OUT, `${name}-sheet.jpg`),
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`[capture] ${mp4}`);
}

const hit = (t, at) => t >= at - 1e-6 && t < at + 1 / FPS - 1e-6;
const key = (page, k, down) => (down ? page.keyboard.down(k) : page.keyboard.up(k));

const SCENES = {
  async hud() {
    const { page, errors } = await openWorld();
    await page.screenshot({ path: path.join(OUT, 'a-hud-knight.png'), timeout: 60000 });
    await page.evaluate(() => window.__WORLD__.coopSystem?.swapActiveHero?.());
    await step(page, 20);
    await page.screenshot({ path: path.join(OUT, 'a-hud-mage.png'), timeout: 60000 });
    return errors;
  },

  async cinder() {
    const { page, errors } = await openWorld();
    await page.evaluate(() => window.__WORLD__.setGameplayShot?.('03-desktop-cinder-fall-meteor'));
    await step(page, 8);
    await page.screenshot({ path: path.join(OUT, 'b-cinder-fall-preset.png'), timeout: 60000 });
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.setGameplayShot?.(null);
      w.setView?.('arena');
      w.camState.mode = 'player';
      const unlocked = w.progression?.syncFromRemote?.({
        unlockedStage: 3,
        stonesSolved: 3,
        communeDiscovered: true,
        activeElement: 'fire',
      });
      w.campaignLoop?.setUnlockedStage?.(3, 0b111);
      w.coopSystem?.setUnlockedStage?.(3);
      if (unlocked) w.sculptedHud?.setProgressionState?.(unlocked);
      if (w.coopSystem.player.activeHeroId !== 'Mage') w.coopSystem.swapActiveHero();
      w.coopSystem.teleportLeaderAndPartner(56.0, -14.0, Math.PI * 0.5);
      w.camState.yaw = Math.PI * 0.5;
      w.camState.pitch = 0.22;
      w.camState.dist = 9.0;
      w.sculptedHud?.setElement?.('fire');
      w.campaignLoop.combatHeroes.Mage.skillCd = 0;
      w.enemyManager.clearAllEnemies();
      for (const [arch, dx, dz] of [
        ['warrior', 0, 9.5],
        ['minion', 1.6, 10.2],
        ['rogue', -1.6, 10.0],
      ]) {
        w.enemyManager.spawnImmediateFromSpec({
          archetype: arch,
          x: 56.0 + dz,
          z: -14.0 + dx,
        });
      }
    });
    await step(page, 18);
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.sculptedHud?.setElement?.('fire');
      w.campaignLoop.combatHeroes.Mage.skillCd = 0;
    });
    await record(page, 'b-cinder-fall-live', 3.6, async (t, pg) => {
      if (hit(t, 0.25)) await key(pg, 'e', true);
      if (hit(t, 1.05)) await key(pg, 'e', false);
    });
    return errors;
  },

  async dodge() {
    const { page, errors } = await openWorld();
    await page.evaluate(() => {
      const w = window.__WORLD__;
      const unlocked = w.progression?.syncFromRemote?.({
        unlockedStage: 3,
        stonesSolved: 3,
        communeDiscovered: true,
      });
      w.campaignLoop?.setUnlockedStage?.(3, 0b111);
      w.coopSystem?.setUnlockedStage?.(3);
      if (unlocked) w.sculptedHud?.setProgressionState?.(unlocked);
      w.coopSystem.teleportLeaderAndPartner(0.0, 48.0, Math.PI);
      w.camState.mode = 'player';
      w.camState.yaw = Math.PI;
      w.camState.pitch = 0.22;
      w.camState.dist = 8.4;
      w.enemyManager.clearAllEnemies();
    });
    await step(page, 12);
    const plan = [
      ['w', 0.2], ['s', 1.2], ['a', 2.2], ['d', 3.2],
    ];
    await record(page, 'c-knight-4way-dodge', 4.4, async (t, pg) => {
      for (const [k, at] of plan) {
        if (hit(t, at)) await key(pg, k, true);
        if (hit(t, at + 0.08)) await key(pg, 'Shift', true);
        if (hit(t, at + 0.18)) await key(pg, 'Shift', false);
        if (hit(t, at + 0.75)) await key(pg, k, false);
      }
    });
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.campaignLoop?.setUnlockedStage?.(3, 0b111);
      w.coopSystem?.setUnlockedStage?.(3);
      if (w.coopSystem.player.activeHeroId !== 'Mage') w.coopSystem.swapActiveHero();
      w.coopSystem.teleportLeaderAndPartner(0.0, 48.0, Math.PI);
      w.camState.mode = 'player';
      w.camState.yaw = Math.PI;
      w.camState.pitch = 0.22;
      w.camState.dist = 8.4;
      w.campaignLoop.combatHeroes.Mage.skillCd = 0;
      w.enemyManager.clearAllEnemies();
    });
    await step(page, 16);
    await record(page, 'c-mage-aim-strafe-dodge', 5.2, async (t, pg) => {
      if (hit(t, 0.1)) await key(pg, 'e', true);
      if (hit(t, 0.3)) await key(pg, 'a', true);
      if (hit(t, 1.3)) await key(pg, 'a', false);
      if (hit(t, 1.4)) await key(pg, 'd', true);
      if (hit(t, 2.4)) await key(pg, 'd', false);
      if (hit(t, 2.5)) await key(pg, 's', true);
      if (hit(t, 3.3)) await key(pg, 's', false);
      if (hit(t, 3.5)) { await key(pg, 'a', true); await key(pg, 'Shift', true); }
      if (hit(t, 3.65)) await key(pg, 'Shift', false);
      if (hit(t, 4.1)) await key(pg, 'a', false);
      if (hit(t, 4.2)) { await key(pg, 'e', true); await key(pg, 'd', true); await key(pg, 'Shift', true); }
      if (hit(t, 4.35)) await key(pg, 'Shift', false);
      if (hit(t, 4.9)) { await key(pg, 'd', false); await key(pg, 'e', false); }
    });
    return errors;
  },

  async golem() {
    const { page, errors } = await openWorld();
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.campaignLoop?.setOpenValleyMode?.(false);
      w.setTimeOfDay?.('night');
      w.coopSystem.teleportLeaderAndPartner(0.0, -76.5, Math.PI);
      w.coopSystem.heroStates.Mage.actionState = 'pray_channel';
      w.coopSystem.heroStates.Mage.actionTimer = 999;
      w.camState.mode = 'player';
      w.camState.yaw = Math.PI;
      w.camState.pitch = 0.18;
      w.camState.dist = 9.5;
      w.enemyManager.clearAllEnemies();
      w.__golem = w.enemyManager.spawnImmediateFromSpec({
        archetype: 'boss_sovereign',
        x: 0.0,
        z: -83.0,
        rotY: 0,
      });
    });
    await step(page, 24);
    await page.evaluate(() => {
      const e = window.__WORLD__.__golem;
      if (!e) throw new Error('boss did not spawn');
      window.__WORLD__.coopSystem.heroStates.Mage.actionState = 'pray_channel';
      window.__WORLD__.coopSystem.heroStates.Mage.actionTimer = 999;
      e.attack = null;
      e.aiState = 'down';
      e.downTimer = 2.6;
      e.rising = false;
      e.char.play('Death_A', { loop: false, fade: 0.12, force: true });
    });
    await record(page, 'd-golem-death-a-standup', 3.6, null);
    await page.screenshot({ path: path.join(OUT, 'd-golem-standing.png'), timeout: 60000 });
    return errors;
  },
};

let failed = 0;
for (const s of scenes) {
  try {
    const errs = await SCENES[s]();
    console.log(`[capture] ${s}: ${errs.length ? 'page errors: ' + [...new Set(errs)].slice(0, 5).join(' | ') : 'no page errors'}`);
  } catch (e) {
    failed++;
    console.error(`[capture] ${s} FAILED: ${e.message}`);
  }
}
await browser.close();
srv.server.close();
process.exit(failed ? 1 : 0);
