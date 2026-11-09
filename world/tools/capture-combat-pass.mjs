// Deterministic gameplay capture for headless/software-GL machines.
// Time is virtualised (performance.now + requestAnimationFrame are stepped at a fixed 30 fps),
// so slow SwiftShader frames still produce real-time-correct motion in the encoded video.
//
//   node world/tools/capture-combat-pass.mjs [scene ...]     scenes: hud cinder dodge golem
//   env: CHROME=/path/to/chrome  PLAYWRIGHT=/path/to/playwright-core  OUT=world/shots/...  W/H
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';

const OUT = process.env.OUT || 'world/shots/combat-pass-2026-11-09';
const W = Number(process.env.W || 800);
const H = Number(process.env.H || 450);
const FPS = 30;
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['hud', 'cinder', 'dodge', 'golem'];

async function loadChromium() {
  for (const spec of [process.env.PLAYWRIGHT, 'playwright-core', 'playwright', '/tmp/pw/node_modules/playwright-core/index.mjs']) {
    if (!spec) continue;
    try {
      const mod = await import(spec.startsWith('/') ? pathToFileURL(spec).href : spec);
      const c = mod.chromium || mod.default?.chromium;
      if (c) return c;
    } catch { /* next */ }
  }
  throw new Error('playwright-core not found (set PLAYWRIGHT=...)');
}

const VIRTUAL_TIME = () => {
  let vt = 0;
  let queue = [];
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__vt = { grab() { return window.__WORLD__.renderer.domElement.toDataURL('image/jpeg', 0.9); }, step(ms) { vt += ms; const q = queue; queue = []; for (const cb of q) { try { cb(vt); } catch (e) { console.error(e); } } } };
};

fs.mkdirSync(OUT, { recursive: true });
const srv = await startServer(Number(process.env.PORT || 4199));
const base = `${srv.url}?nolobby=1`;
const chromium = await loadChromium();
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/local/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function openWorld() {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(VIRTUAL_TIME);
  await page.goto(base);
  for (let i = 0; i < 4000; i++) {
    if (await page.evaluate(() => Boolean(window.__WORLD__?.ready))) break;
    await page.evaluate(() => window.__vt.step(1000 / 30));
    await page.waitForTimeout(25);
  }
  console.log('[capture] world ready');
  await step(page, 45); // let shaders compile and HUD settle
  return { page, errors };
}

async function step(page, frames = 1) {
  for (let i = 0; i < frames; i++) await page.evaluate(() => window.__vt.step(1000 / 30));
}

// Records `seconds` of play; `script(t, page)` runs before each frame for input.
async function record(page, name, seconds, script, { every = 1 } = {}) {
  const dir = path.join(OUT, `.frames-${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const total = Math.round(seconds * FPS);
  let n = 0;
  for (let f = 0; f < total; f++) {
    await script?.(f / FPS, page);
    // Step + readback in one task: the drawing buffer is not preserved across tasks.
    const url = await page.evaluate((grab) => { window.__vt.step(1000 / 30); return grab ? window.__vt.grab() : null; }, f % every === 0);
    if (f % 30 === 0) console.log(`[capture] ${name} frame ${f}/${total}`);
    if (url) fs.writeFileSync(path.join(dir, `${String(n++).padStart(4, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  }
  const mp4 = path.join(OUT, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS / every), '-i', path.join(dir, '%04d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', mp4]);
  // Contact sheet for quick review.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', `fps=${Math.max(1, Math.round(6 / seconds * 2))},scale=400:-1,tile=4x3`, '-frames:v', '1',
    path.join(OUT, `${name}-sheet.jpg`)]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`[capture] ${mp4}`);
}

const key = (page, k, down) => (down ? page.keyboard.down(k) : page.keyboard.up(k));

const SCENES = {
  async hud() {
    const { page, errors } = await openWorld();
    await page.screenshot({ path: path.join(OUT, 'a-hud-knight.png'), timeout: 600000 });
    await page.evaluate(() => window.__WORLD__.coopSystem?.swapActiveHero?.());
    await step(page, 20);
    await page.screenshot({ path: path.join(OUT, 'a-hud-mage.png'), timeout: 600000 });
    return errors;
  },

  async cinder() {
    const { page, errors } = await openWorld();
    await page.evaluate(() => window.__WORLD__.setGameplayShot?.('03-desktop-cinder-fall-meteor'));
    await step(page, 8);
    await page.screenshot({ path: path.join(OUT, 'b-cinder-fall-preset.png'), timeout: 600000 });
    // Live cast: Mage, fire element, enemies ahead, hold/release E.
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.setGameplayShot?.(null);
      w.coopSystem.setUnlockedStage?.(3); w.campaignLoop?.setUnlockedStage?.(3);
      w.progression && Object.assign(w.progression, { unlockedStage: 3, iceUnlocked: true, fireUnlocked: true, ultimateUnlocked: true });
      if (w.coopSystem.player.activeHeroId !== 'Mage') w.coopSystem.swapActiveHero();
      const m = w.campaignLoop.combatHeroes.Mage;
      m.selectedElement = 'fire';
      const p = w.coopSystem.heroStates.Mage;
      const x = p.x ?? 0, z = p.z ?? 0, yaw = p.yaw ?? 0;
      for (const [dx, dz] of [[0, 9], [1.6, 10], [-1.6, 10.5]]) {
        w.enemyManager.spawnImmediateFromSpec({ archetype: 'minion', x: x + Math.sin(yaw) * dz + Math.cos(yaw) * dx, z: z + Math.cos(yaw) * dz - Math.sin(yaw) * dx });
      }
    });
    await step(page, 30);
    await record(page, 'b-cinder-fall-live', 4.0, async (t, pg) => {
      if (Math.abs(t - 0.3) < 0.017) { await key(pg, 'Tab', true); await key(pg, 'Tab', false); }
      if (Math.abs(t - 0.6) < 0.017) await key(pg, 'e', true);
      if (Math.abs(t - 1.3) < 0.017) await key(pg, 'e', false);
    });
    return errors;
  },

  async dodge() {
    const { page, errors } = await openWorld();
    // Knight: 4-way dodge (move key + Shift), then Mage aim-strafe (RMB hold + A/D) and aim dodges.
    const plan = [
      ['w', 0.3], ['s', 1.5], ['a', 2.7], ['d', 3.9],
    ];
    await record(page, 'c-knight-4way-dodge', 5.2, async (t, pg) => {
      for (const [k, at] of plan) {
        if (Math.abs(t - at) < 0.017) await key(pg, k, true);
        if (Math.abs(t - (at + 0.1)) < 0.017) { await key(pg, 'Shift', true); }
        if (Math.abs(t - (at + 0.2)) < 0.017) { await key(pg, 'Shift', false); }
        if (Math.abs(t - (at + 0.9)) < 0.017) await key(pg, k, false);
      }
    });
    await page.evaluate(() => { const w = window.__WORLD__; if (w.coopSystem.player.activeHeroId !== 'Mage') w.coopSystem.swapActiveHero(); });
    await step(page, 20);
    await page.mouse.move(W / 2, H / 2);
    await record(page, 'c-mage-aim-strafe-dodge', 6.0, async (t, pg) => {
      if (Math.abs(t - 0.1) < 0.017) await pg.mouse.down({ button: 'right' });
      if (Math.abs(t - 0.4) < 0.017) await key(pg, 'a', true);
      if (Math.abs(t - 1.6) < 0.017) await key(pg, 'a', false);
      if (Math.abs(t - 1.7) < 0.017) await key(pg, 'd', true);
      if (Math.abs(t - 2.9) < 0.017) await key(pg, 'd', false);
      if (Math.abs(t - 3.0) < 0.017) await key(pg, 's', true);
      if (Math.abs(t - 3.8) < 0.017) await key(pg, 's', false);
      // Dodges while aiming: left then right.
      if (Math.abs(t - 4.0) < 0.017) { await key(pg, 'a', true); await key(pg, 'Shift', true); }
      if (Math.abs(t - 4.15) < 0.017) { await key(pg, 'Shift', false); }
      if (Math.abs(t - 4.7) < 0.017) { await key(pg, 'a', false); }
      if (Math.abs(t - 5.0) < 0.017) { await key(pg, 'd', true); await key(pg, 'Shift', true); }
      if (Math.abs(t - 5.15) < 0.017) { await key(pg, 'Shift', false); }
      if (Math.abs(t - 5.7) < 0.017) { await key(pg, 'd', false); await pg.mouse.up({ button: 'right' }); }
    });
    return errors;
  },

  async golem() {
    const { page, errors } = await openWorld();
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.setTimeOfDay?.('night');
      const k = w.coopSystem.heroStates.Knight;
      const x = k.x ?? 0, z = k.z ?? 0, yaw = k.yaw ?? 0;
      w.__golem = w.enemyManager.spawnImmediateFromSpec({ archetype: 'boss_sovereign', x: x + Math.sin(yaw) * 7, z: z + Math.cos(yaw) * 7, rotY: yaw + Math.PI });
    });
    await step(page, 75);
    await page.evaluate(() => {
      const e = window.__WORLD__.__golem;
      if (!e) throw new Error('boss did not spawn');
      e.attack = null;
      e.aiState = 'down';
      e.downTimer = 3.2;
      e.rising = false;
      e.char.play('Death_A', { loop: false, fade: 0.12, force: true });
    });
    await record(page, 'd-golem-death-a-standup', 4.2, null);
    await page.screenshot({ path: path.join(OUT, 'd-golem-standing.png'), timeout: 600000 });
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
