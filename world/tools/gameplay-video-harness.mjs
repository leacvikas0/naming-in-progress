#!/usr/bin/env node
// ============================================================================
// world/tools/gameplay-video-harness.mjs
//
// Universal Fast Hardware-GPU Video & Frame-Sheet QA Harness
// - Launches local Windows Chrome with D3D11 hardware WebGL acceleration
// - Deterministic virtual-time stepping (24 FPS) for zero frame drops
// - Injects a live 1-line top-center telemetry pill showing:
//   [t] | Hero | Active Clip (clipTime / duration, timeScale) | Action | Speed | HP
// - Supports built-in scenarios + custom JSON scenario specs (`--spec file.json`)
// - Outputs both `.mp4` video and a numbered `4x3` frame contact sheet (`-sheet.jpg`)
//
// Usage:
//   node world/tools/gameplay-video-harness.mjs --tag before
//   node world/tools/gameplay-video-harness.mjs --tag after knight-idle-run-dodge knight-combo-cancel
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';

const args = process.argv.slice(2);
let tag = 'capture';
let outDir = 'world/shots/qa-harness';
let specFile = null;
const requestedScenarios = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--tag' && args[i + 1]) {
    tag = args[++i];
  } else if (a === '--out' && args[i + 1]) {
    outDir = args[++i];
  } else if (a === '--spec' && args[i + 1]) {
    specFile = args[++i];
  } else if (!a.startsWith('--')) {
    requestedScenarios.push(a);
  }
}

const W = Number(process.env.W || 1280);
const H = Number(process.env.H || 720);
const FPS = Number(process.env.FPS || 24);

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
    '/tmp/pw/node_modules/playwright-core/index.mjs',
  ]) {
    if (!spec) continue;
    try {
      const isPath = spec.startsWith('/') || /^[A-Za-z]:[\\/]/.test(spec);
      const mod = await import(isPath ? pathToFileURL(spec).href : spec);
      const c = mod.chromium || mod.default?.chromium;
      if (c) return c;
    } catch {
      /* next */
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

fs.mkdirSync(outDir, { recursive: true });
const srv = await startServer(Number(process.env.PORT || 0));
const baseUrl = `${srv.url}?nolobby=1`;
const chromium = await loadChromium();
const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const useGpu = process.platform === 'win32' && !process.env.SWIFTSHADER;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ||
    (fs.existsSync(winChrome) ? winChrome : '/usr/local/bin/google-chrome'),
  args: useGpu
    ? ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist']
    : [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
});

async function openWorldPage() {
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
    const pill = document.createElement('div');
    pill.id = 'qa-telemetry-pill';
    pill.style.cssText = [
      'position:fixed',
      'top:8px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:99999',
      'background:rgba(16, 20, 28, 0.82)',
      'color:#f8f4e8',
      'font:600 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      'padding:4px 12px',
      'border-radius:999px',
      'border:1px solid rgba(255,255,255,0.22)',
      'pointer-events:none',
      'white-space:nowrap',
      'box-shadow:0 4px 12px rgba(0,0,0,0.35)',
    ].join(';');
    document.body.appendChild(pill);
    window.__updateQaTelemetry = (tSec, label = '') => {
      const w = window.__WORLD__;
      if (!w) return;
      const role = w.coopSystem?.player?.activeHeroId || 'Knight';
      const st = w.coopSystem?.heroStates?.[role];
      const anim = st?.char?.anim;
      const clipName = anim?.currentClipName || 'none';
      const act = anim?.rawActions?.get(clipName);
      const clipT = act ? act.time.toFixed(2) : '0.00';
      const clipDur = act?.getClip?.()?.duration?.toFixed?.(2) || '0.00';
      const rate = act ? act.getEffectiveTimeScale().toFixed(2) : '1.00';
      const spd = (st?.groundSpeed ?? 0).toFixed(2);
      const khp = w.campaignLoop?.combatHeroes?.Knight?.hp ?? 220;
      const mhp = w.campaignLoop?.combatHeroes?.Mage?.hp ?? 120;
      const meteors = w.vfxKit?.cinderFall?.skyBarrageList?.length ?? 0;
      pill.textContent = `t=${tSec.toFixed(2)}s ${label ? `[${label}] ` : ''}| ${role} | clip=${clipName} (${clipT}/${clipDur}s @ ${rate}x) | act=${st?.actionState || 'loco'} | spd=${spd}m/s | HP K:${khp} M:${mhp}${meteors ? ` | meteors:${meteors}` : ''}`;
    };
  });
  await stepFrames(page, 12);
  return { page, errors };
}

async function stepFrames(page, frames = 1) {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(() => window.__vt.step());
  }
}

const hitFrame = (t, at) => t >= at - 1e-6 && t < at + 1 / FPS - 1e-6;
const keyAct = (page, k, down) => (down ? page.keyboard.down(k) : page.keyboard.up(k));

async function recordClip(page, baseName, seconds, onFrame) {
  const fullName = `${baseName}-${tag}`;
  const framesDir = path.join(outDir, `.frames-${fullName}`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const totalFrames = Math.round(seconds * FPS);

  for (let f = 0; f < totalFrames; f++) {
    const t = f / FPS;
    const stepLabel = (await onFrame?.(t, page, f)) || '';
    await page.evaluate(() => window.__vt.step());
    await page.evaluate(
      ([timeSec, lbl]) => window.__updateQaTelemetry?.(timeSec, lbl),
      [t, stepLabel]
    );
    await page.screenshot({
      path: path.join(framesDir, `${String(f).padStart(4, '0')}.jpg`),
      type: 'jpeg',
      quality: 92,
    });
  }

  const mp4Path = path.join(outDir, `${fullName}.mp4`);
  execFileSync(FFMPEG_BIN, [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    String(FPS),
    '-i',
    path.join(framesDir, '%04d.jpg'),
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '18',
    mp4Path,
  ]);

  const sheetPath = path.join(outDir, `${fullName}-sheet.jpg`);
  const sheetIndices = Array.from({ length: 12 }, (_, i) =>
    Math.min(totalFrames - 1, Math.round((i * (totalFrames - 1)) / 11))
  );
  const selectExpr = sheetIndices.map((idx) => `eq(n\\,${idx})`).join('+');
  execFileSync(FFMPEG_BIN, [
    '-y',
    '-loglevel',
    'error',
    '-i',
    mp4Path,
    '-vf',
    `select='${selectExpr}',scale=420:-1,tile=4x3`,
    '-vsync',
    '0',
    '-frames:v',
    '1',
    sheetPath,
  ]);

  fs.rmSync(framesDir, { recursive: true, force: true });
  console.log(`[harness] saved ${mp4Path} & ${sheetPath}`);
  return { mp4Path, sheetPath };
}

async function setupCleanStage(
  page,
  {
    hero = 'Knight',
    x = 0.0,
    z = 48.0,
    yaw = Math.PI,
    element = 'ice',
    camDist = 6.2,
    camPitch = 0.18,
    camYawOffset = 0.0,
    freezePartner = true,
  } = {}
) {
  await page.evaluate(
    ({ hero, x, z, yaw, element, camDist, camPitch, camYawOffset, freezePartner }) => {
      const w = window.__WORLD__;
      w.setGameplayShot?.(null);
      w.campaignLoop?.setOpenValleyMode?.(false);
      const unlocked = w.progression?.syncFromRemote?.({
        unlockedStage: 3,
        stonesSolved: 3,
        communeDiscovered: true,
        activeElement: element,
      });
      w.campaignLoop?.setUnlockedStage?.(3, 0b111);
      w.coopSystem?.setUnlockedStage?.(3);
      if (unlocked) w.sculptedHud?.setProgressionState?.(unlocked);
      if (w.coopSystem.player.activeHeroId !== hero) {
        w.coopSystem.swapActiveHero();
      }
      w.sculptedHud?.setElement?.(element);
      w.coopSystem.teleportLeaderAndPartner(x, z, yaw);
      const partnerId = hero === 'Knight' ? 'Mage' : 'Knight';
      const partner = w.coopSystem.heroStates[partnerId];
      if (partner && freezePartner) {
        // Park partner 6.5m behind the hero (within the 18m teleport tether, behind the camera)
        partner.x = x - Math.sin(yaw) * 6.5;
        partner.z = z - Math.cos(yaw) * 6.5;
        partner.actionState = 'idle';
        partner.actionTimer = 999;
        partner.char.group.position.set(partner.x, partner.y, partner.z);
        partner.char.group.visible = false;
      } else if (partner) {
        partner.char.group.visible = true;
      }
      w.camState.mode = 'player';
      w.camState.yaw = yaw + camYawOffset;
      w.camState.pitch = camPitch;
      w.camState.dist = camDist;
      w.enemyManager.clearAllEnemies();
    },
    { hero, x, z, yaw, element, camDist, camPitch, camYawOffset, freezePartner }
  );
  await stepFrames(page, 10);
}

const SCENARIOS = {
  // 1. Knight Idle Posture (1H Sword+Shield), Stride-Matched Run, and 4-Way Dodge (W/S/A/D + Shift)
  async 'knight-idle-run-dodge'() {
    const { page, errors } = await openWorldPage();
    // Use a 3/4 front-side camera (camYawOffset = 0.55) at dist = 5.4m so we see the Knight's sword + shield posture clearly!
    await setupCleanStage(page, {
      hero: 'Knight',
      x: 0.0,
      z: 48.0,
      yaw: Math.PI,
      camDist: 5.4,
      camPitch: 0.16,
      camYawOffset: 0.45,
    });
    const dodgePlan = [
      ['w', 0.9, 'Dodge-Fwd'],
      ['s', 1.9, 'Dodge-Back'],
      ['a', 2.9, 'Dodge-Left'],
      ['d', 3.9, 'Dodge-Right'],
    ];
    await recordClip(page, 'knight-idle-run-dodge', 5.0, async (t, pg) => {
      if (t < 0.85) return 'Idle-Check';
      let lbl = '';
      for (const [k, at, name] of dodgePlan) {
        if (hitFrame(t, at)) await keyAct(pg, k, true);
        if (hitFrame(t, at + 0.08)) await keyAct(pg, 'Shift', true);
        if (hitFrame(t, at + 0.18)) await keyAct(pg, 'Shift', false);
        if (hitFrame(t, at + 0.72)) await keyAct(pg, k, false);
        if (t >= at && t < at + 0.85) lbl = name;
      }
      return lbl;
    });
    await page.close();
    return errors;
  },

  // 2. Knight 4-Hit Sword Combo (Single Swing Follow-Through + Full 4-Hit Chain + Dodge Cancel + Shield Block)
  async 'knight-combo-cancel'() {
    const { page, errors } = await openWorldPage();
    await setupCleanStage(page, {
      hero: 'Knight',
      x: 56.0,
      z: -14.0,
      yaw: Math.PI * 0.5,
      camDist: 5.5,
      camPitch: 0.18,
      camYawOffset: -0.35,
    });
    await page.evaluate(() => {
      const w = window.__WORLD__;
      // Spawn a high-HP target dummy so the Knight soft-locks and lands hits
      const dummy = w.enemyManager.spawnImmediateFromSpec({
        archetype: 'warrior',
        x: 58.2,
        z: -14.0,
      });
      if (dummy) {
        dummy.hp = 9999;
        dummy.maxHp = 9999;
        dummy.aiState = 'dormant';
        dummy.wakeRadius = 0.01;
      }
    });
    await recordClip(page, 'knight-combo-cancel', 5.6, async (t, pg) => {
      // Beat 1 (t=0.20s): Single combo1 allowed to play full follow-through into idle
      if (hitFrame(t, 0.2)) {
        await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
      }
      // Beat 2 (t=1.40s .. 3.40s): 4-hit buffered combo chain (combo1 -> combo2 -> combo3 -> combo4)
      for (const tapT of [1.4, 1.85, 2.35, 2.85]) {
        if (hitFrame(t, tapT)) {
          await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        }
      }
      // Beat 3 (t=4.10s): Combo1 -> Dodge cancel at t=4.52s (right after contact frame)
      if (hitFrame(t, 4.1)) {
        await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
      }
      if (hitFrame(t, 4.45)) await keyAct(pg, 'a', true);
      if (hitFrame(t, 4.52)) await keyAct(pg, 'Shift', true);
      if (hitFrame(t, 4.62)) await keyAct(pg, 'Shift', false);
      if (hitFrame(t, 4.9)) await keyAct(pg, 'a', false);
      // Beat 4 (t=5.00s .. 5.45s): Shield Block hold & release
      if (hitFrame(t, 5.0)) await keyAct(pg, 'f', true);
      if (hitFrame(t, 5.45)) await keyAct(pg, 'f', false);

      if (t < 1.35) return 'Single-Combo1-Full';
      if (t < 4.05) return '4-Hit-Combo-Chain';
      if (t < 4.98) return 'Swing-Dodge-Cancel';
      return 'Shield-Block';
    });
    await page.close();
    return errors;
  },

  // 3. Knight E (Power Sword Ignition + Dragon Slash), Q (Twin-Dragon Coil & X-Slash Lunge) & 1.35x Speed Overdrive
  async 'knight-e-q-powers'() {
    const { page, errors } = await openWorldPage();
    await setupCleanStage(page, {
      hero: 'Knight',
      x: 56.0,
      z: -14.0,
      yaw: Math.PI * 0.5,
      element: 'fire',
      camDist: 6.4,
      camPitch: 0.18,
      camYawOffset: -0.32,
    });
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.campaignLoop.combatHeroes.Knight.qEnergy = 100;
      w.campaignLoop.combatHeroes.Knight.qEnergyPct = 1.0;
      w.campaignLoop.combatHeroes.Knight.powerSwordCd = 0;
      w.campaignLoop.combatHeroes.Knight.ultCd = 0;
      const e1 = w.enemyManager.spawnImmediateFromSpec({
        archetype: 'warrior',
        x: 59.2,
        z: -14.0,
      });
      if (e1) {
        e1.hp = 9999;
        e1.maxHp = 9999;
        e1.aiState = 'dormant';
        e1.wakeRadius = 0.01;
      }
    });
    await recordClip(page, 'knight-e-q-powers', 4.8, async (t, pg) => {
      if (hitFrame(t, 0.2)) await keyAct(pg, 'e', true);
      if (hitFrame(t, 0.3)) await keyAct(pg, 'e', false);
      if (hitFrame(t, 1.15)) await keyAct(pg, 'q', true);
      if (hitFrame(t, 1.25)) await keyAct(pg, 'q', false);
      for (const tapT of [2.45, 2.78, 3.12, 3.48]) {
        if (hitFrame(t, tapT)) {
          await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        }
      }
      if (hitFrame(t, 4.1)) await keyAct(pg, 'w', true);
      if (hitFrame(t, 4.7)) await keyAct(pg, 'w', false);

      if (t < 1.12) return 'E-Dragon-Ignition';
      if (t < 2.42) return 'Q-Twin-Dragon-XSlash';
      if (t < 4.05) return '1.35x-Overdrive-Combo4-Dragon';
      return '1.35x-Overdrive-Run';
    });
    await page.close();
    return errors;
  },

  // 4. Mage Q Sky Meteor Shower (Full 8.4m Annular Barrage + Persistent Craters + Mobile Mage in Eye)
  async 'mage-q-meteor-shower'() {
    const { page, errors } = await openWorldPage();
    await setupCleanStage(page, {
      hero: 'Mage',
      x: 56.0,
      z: -14.0,
      yaw: Math.PI * 0.5,
      element: 'fire',
      camDist: 11.2,
      camPitch: 0.34,
      camYawOffset: 0.0,
      freezePartner: false,
    });
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.campaignLoop.combatHeroes.Mage.qEnergy = 160;
      w.campaignLoop.combatHeroes.Mage.qEnergyPct = 1.0;
      w.campaignLoop.combatHeroes.Mage.ultCd = 0;
      // Place Wingman Knight near Mage at start so we see him sprint out of the 8.4m circle!
      const k = w.coopSystem.heroStates.Knight;
      k.x = 57.2;
      k.z = -12.6;
      k.char.group.position.set(k.x, k.y, k.z);
      for (const [arch, dx, dz] of [
        ['warrior', 4.5, 2.0],
        ['warrior', 5.2, -2.5],
        ['rogue', 3.5, -4.2],
        ['minion', 6.0, 0.5],
      ]) {
        const e = w.enemyManager.spawnImmediateFromSpec({
          archetype: arch,
          x: 56.0 + dx,
          z: -14.0 + dz,
        });
        if (e) {
          e.hp = 2000;
          e.maxHp = 2000;
        }
      }
    });
    await recordClip(page, 'mage-q-meteor-shower', 4.8, async (t, pg) => {
      if (hitFrame(t, 0.2)) await keyAct(pg, 'q', true);
      if (hitFrame(t, 0.3)) await keyAct(pg, 'q', false);
      return t < 1.0 ? 'Q-Cast-Pose-0.8s' : 'Sky-Meteor-Barrage';
    });
    await page.close();
    return errors;
  },

  // 5. Mage Friendly Fire ("Roast the Knight"): Mage Q Meteor Shower + E Cinder Fall roasting the Knight inside the blast zone!
  async 'mage-friendly-fire-roast'() {
    const { page, errors } = await openWorldPage();
    await setupCleanStage(page, {
      hero: 'Mage',
      x: 56.0,
      z: -14.0,
      yaw: Math.PI * 0.5,
      element: 'fire',
      camDist: 9.8,
      camPitch: 0.28,
      camYawOffset: 0.0,
    });
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.campaignLoop.combatHeroes.Mage.qEnergy = 160;
      w.campaignLoop.combatHeroes.Mage.qEnergyPct = 1.0;
      w.campaignLoop.combatHeroes.Mage.ultCd = 0;
      w.campaignLoop.combatHeroes.Mage.skillCd = 0;
      // Simulate Knight standing stubbornly inside the bombardment zone at 5.2m in front of the Mage
      const k = w.coopSystem.heroStates.Knight;
      k.x = 61.2;
      k.z = -14.0;
      k.yaw = -Math.PI * 0.5;
      k.actionState = 'combo1';
      k.actionTimer = 999; // keep Knight planted inside the blast zone to test friendly fire!
      k.char.group.position.set(k.x, k.y, k.z);
      k.char.group.rotation.y = k.yaw;
    });
    await recordClip(page, 'mage-friendly-fire-roast', 4.2, async (t, pg) => {
      // Keep Knight planted at (61.2, -14.0) inside the meteor zone
      await pg.evaluate(() => {
        const k = window.__WORLD__.coopSystem.heroStates.Knight;
        k.x = 61.2;
        k.z = -14.0;
        k.char.group.position.set(k.x, k.y, k.z);
      });
      // First: cast E Cinder Fall right onto the Knight at t=0.20s..0.45s
      if (hitFrame(t, 0.15)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.startSkillAim({
            yaw: Math.PI * 0.5,
            pitch: 0.35,
            distance: 5.2,
          });
        });
      }
      if (hitFrame(t, 0.45)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.releaseSkillAim({
            yaw: Math.PI * 0.5,
            pitch: 0.35,
            distance: 5.2,
          });
        });
      }
      // Second: cast Q Sky Meteor Shower at t=1.60s to roast him repeatedly inside the ring!
      if (hitFrame(t, 1.6)) await keyAct(pg, 'q', true);
      if (hitFrame(t, 1.7)) await keyAct(pg, 'q', false);

      return t < 1.55 ? 'E-Cinder-Fall-On-Knight' : 'Q-Meteor-Ring-Roast';
    });
    await page.close();
    return errors;
  },

  // 6. Solo Wingman Mage Stability: Open game in solo mode, Knight attacks right beside the Mage (4-hit combo + walk + attack)
  async 'solo-wingman-mage'() {
    const { page, errors } = await openWorldPage();
    await setupCleanStage(page, {
      hero: 'Knight',
      x: 2.8,
      z: 14.5,
      yaw: Math.PI + 0.15,
      element: 'ice',
      camDist: 5.8,
      camPitch: 0.2,
      camYawOffset: 0.18,
      freezePartner: false,
    });
    await recordClip(page, 'solo-wingman-mage', 5.0, async (t, pg) => {
      // Beat 1 (t=0.25s..2.10s): Knight performs a 4-hit combo right at initial solo spawn beside the Mage
      for (const tapT of [0.25, 0.72, 1.22, 1.72]) {
        if (hitFrame(t, tapT)) {
          await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        }
      }
      // Beat 2 (t=2.50s..3.30s): Knight walks forward so Mage follows and settles beside him
      if (hitFrame(t, 2.5)) await keyAct(pg, 'w', true);
      if (hitFrame(t, 3.3)) await keyAct(pg, 'w', false);
      // Beat 3 (t=3.65s..4.80s): Knight performs another combo right after Mage settles at the follow threshold!
      for (const tapT of [3.65, 4.1, 4.55]) {
        if (hitFrame(t, tapT)) {
          await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        }
      }
      const m = await pg.evaluate(() => {
        const st = window.__WORLD__?.coopSystem?.heroStates?.Mage;
        return st
          ? `M:${st.char?.anim?.currentClipName || 'none'} yaw=${(st.yaw ?? 0).toFixed(2)} spd=${(st.groundSpeed ?? 0).toFixed(2)}`
          : '';
      });
      return `${t < 2.45 ? 'Spawn-Combo' : t < 3.55 ? 'Follow-Walk' : 'Post-Walk-Combo'} ${m}`;
    });
    await page.close();
    return errors;
  },

  // 7. AGGRESSIVE AUDIT 1: Live Solo Start at (0, 124) -> Stage 0 Lock Check -> Road Vanguard Pack -> Parry/Block -> Alt+Tab Hero Swap
  async 'aggr-1-spawn-and-road-vanguard'() {
    const { page, errors } = await openWorldPage();
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.setGameplayShot?.(null);
      w.enemyManager.clearAllEnemies();
      // Set exact Stage 0 progression (fresh game start)
      const prog0 = w.coopClient.progression.setUnlocks({
        communeDiscovered: false,
        iceUnlocked: false,
        fireUnlocked: false,
        ultimateUnlocked: false,
        stone1Solved: false,
        stone2Solved: false,
        stone3Solved: false,
        stonesSolvedMask: 0,
      });
      w.coopSystem.setUnlockedStage(0);
      w.campaignLoop.setUnlockedStage(0, 0);
      w.sculptedHud?.setProgressionState(prog0);
      w.campaignLoop.setOpenValleyMode(true);
      w.coopSystem.teleportLeaderAndPartner(0.0, 114.0, Math.PI);
      w.camState.mode = 'player';
      w.camState.yaw = Math.PI;
      w.camState.pitch = 0.2;
      w.camState.dist = 6.8;
    });
    await stepFrames(page, 6);
    await recordClip(page, 'aggr-1-spawn-and-road-vanguard', 6.0, async (t, pg) => {
      // Beat 1 (t=0.2s..1.4s): Run North down the road from z=114 into the Road Vanguard Pack at z=102, testing locked E/Q/Tab keys at Stage 0
      if (hitFrame(t, 0.15)) {
        await keyAct(pg, 'w', true);
        await keyAct(pg, 'Shift', true);
      }
      if (hitFrame(t, 0.35)) await keyAct(pg, 'e', true);
      if (hitFrame(t, 0.45)) await keyAct(pg, 'e', false);
      if (hitFrame(t, 1.35)) {
        await keyAct(pg, 'Shift', false);
        await keyAct(pg, 'w', false);
      }
      // Beat 2 (t=1.5s..3.2s): Engage Road Vanguard Pack (2 Skeleton_Warrior + 1 Rogue + 1 OrcRaider) with 4-hit combo + Shield Block
      for (const tapT of [1.5, 1.95, 2.4, 2.85]) {
        if (hitFrame(t, tapT)) {
          await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        }
      }
      if (hitFrame(t, 3.35)) await keyAct(pg, 'f', true);
      if (hitFrame(t, 3.85)) await keyAct(pg, 'f', false);
      // Beat 3 (t=4.0s..5.8s): Swap to Mage mid-fight (Alt+Tab), fire 3-bolt combo + Hold-LMB Shatterlance
      if (hitFrame(t, 4.0)) {
        await pg.evaluate(() => window.__WORLD__.coopSystem.swapActiveHero());
      }
      for (const tapT of [4.2, 4.65, 5.1]) {
        if (hitFrame(t, tapT)) {
          await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        }
      }
      const eCount = await pg.evaluate(
        () => window.__WORLD__?.enemyManager?.activeEnemies?.length || 0
      );
      return `Stage0-RoadPack enemies=${eCount}`;
    });
    await page.close();
    return errors;
  },

  // 8. AGGRESSIVE AUDIT 2: Village Well Stronghold (0,0) -> 6-Enemy Ambush -> Stone 1 [G] Inspect Under Fire vs Clear -> [R] Stage 1 Awakening
  async 'aggr-2-well-stronghold-and-stone1'() {
    const { page, errors } = await openWorldPage();
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.setGameplayShot?.(null);
      w.enemyManager.clearAllEnemies();
      w.campaignLoop.resetCampaign();
      const prog0 = w.coopClient.progression.setUnlocks({
        communeDiscovered: false,
        iceUnlocked: false,
        fireUnlocked: false,
        ultimateUnlocked: false,
        stone1Solved: false,
        stone2Solved: false,
        stone3Solved: false,
        stonesSolvedMask: 0,
      });
      w.coopSystem.setUnlockedStage(0);
      w.campaignLoop.setUnlockedStage(0, 0);
      w.sculptedHud?.setProgressionState(prog0);
      w.campaignLoop.setOpenValleyMode(true);
      w.coopSystem.teleportLeaderAndPartner(0.0, 14.0, Math.PI);
      w.camState.mode = 'player';
      w.camState.yaw = Math.PI;
      w.camState.pitch = 0.22;
      w.camState.dist = 7.4;
    });
    await stepFrames(page, 6);
    await recordClip(page, 'aggr-2-well-stronghold-and-stone1', 6.5, async (t, pg) => {
      // Beat 1 (t=0.1s..1.1s): Walk up to Village Well (0,0) while 6-enemy Well Stronghold spawns around Plaza
      if (hitFrame(t, 0.1)) await keyAct(pg, 'w', true);
      if (hitFrame(t, 1.1)) await keyAct(pg, 'w', false);
      // Beat 2 (t=1.2s..2.5s): Fight Well defenders right beside the Well & try pressing [G] mid-fight (must be blocked!)
      if (hitFrame(t, 1.4)) await keyAct(pg, 'g', true);
      if (hitFrame(t, 1.5)) await keyAct(pg, 'g', false);
      for (const tapT of [1.2, 1.65, 2.1]) {
        if (hitFrame(t, tapT)) {
          await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        }
      }
      // Beat 3 (t=2.7s): Clear remaining Well defenders & press [G] to inspect Stone 1 Well Inscription
      if (hitFrame(t, 2.7)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.enemyManager.clearAllEnemies();
          w.enterStoneInspection();
        });
      }
      // Beat 4 (t=4.2s): Exit Stone 1 inspection [G] & trigger Stage 1 Awakening Verdict [R]
      if (hitFrame(t, 4.2)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.exitStoneInspection();
          const judgment = {
            verdict: 'awakening',
            prayerMode: 'awakening',
            unlocksStage: true,
            stageUnlocked: 1,
            stoneSolvedId: 'stone_plaza',
            hpDeltaPct: 0.6,
            divine_quote:
              'A thousand winters have buried this valley in silence... yet one tender vow wakes the frost beneath your feet.',
          };
          const updated = w.coopClient.progression.applyVerdictProgression(judgment);
          w.sculptedHud?.setProgressionState(updated);
          w.coopSystem.applyCommuneVerdict(judgment, 'Knight');
        });
      }
      // Beat 5 (t=5.2s): Test newly unlocked Stage 1 Ice [E] Power Sword!
      if (hitFrame(t, 5.2)) await keyAct(pg, 'e', true);
      if (hitFrame(t, 5.3)) await keyAct(pg, 'e', false);

      const info = await pg.evaluate(() => {
        const w = window.__WORLD__;
        const gVis = document.getElementById('stone-world-read-btn')?.classList.contains('is-visible')
          ? 1
          : 0;
        return `stg=${w.campaignLoop.getUnlockedStage()} gBtn=${gVis} insp=${w.stoneGazeState.inspectActive ? 1 : 0} en=${w.enemyManager.activeEnemies.length}`;
      });
      return `Well-Stronghold ${info}`;
    });
    await page.close();
    return errors;
  },

  // 9. AGGRESSIVE AUDIT 3: Whispering Grove (44, 16) -> Grove Necromancer Boss + PlantWarriors + Summons -> Stage 2 Awakening
  async 'aggr-3-grove-necromancer-and-stone2'() {
    const { page, errors } = await openWorldPage();
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.setGameplayShot?.(null);
      w.enemyManager.clearAllEnemies();
      w.campaignLoop.resetCampaign();
      const prog1 = w.coopClient.progression.setUnlocks({
        communeDiscovered: true,
        iceUnlocked: true,
        fireUnlocked: false,
        ultimateUnlocked: false,
        stone1Solved: true,
        stone2Solved: false,
        stone3Solved: false,
        stonesSolvedMask: 1,
      });
      w.coopSystem.setUnlockedStage(1);
      w.campaignLoop.setUnlockedStage(1, 1);
      w.sculptedHud?.setProgressionState(prog1);
      w.campaignLoop.setOpenValleyMode(true);
      if (w.coopSystem.player.activeHeroId !== 'Mage') {
        w.coopSystem.swapActiveHero();
      }
      w.coopSystem.teleportLeaderAndPartner(44.0, 25.0, Math.PI);
      w.camState.mode = 'player';
      w.camState.yaw = Math.PI;
      w.camState.pitch = 0.24;
      w.camState.dist = 8.2;
    });
    await stepFrames(page, 6);
    await recordClip(page, 'aggr-3-grove-necromancer-and-stone2', 6.5, async (t, pg) => {
      // Beat 1 (t=0.2s..0.8s): Aim & cast Mage E Frost Lance (14.5m) into Grove Necromancer & PlantWarriors
      if (hitFrame(t, 0.2)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.startSkillAim({ yaw: Math.PI, pitch: 0.22, distance: 12.0 });
        });
      }
      if (hitFrame(t, 0.55)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.releaseSkillAim({ yaw: Math.PI, pitch: 0.22, distance: 12.0 });
        });
      }
      // Beat 2 (t=1.2s..2.5s): Mage Hold-LMB Shatterlance + Dodge Left
      if (hitFrame(t, 1.25)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.triggerAction('shatterlance_aim_start', {
            yaw: Math.PI,
            pitch: 0.22,
            distance: 9.5,
          });
        });
      }
      if (hitFrame(t, 1.55)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.triggerAction('shatterlance_aim_release', {
            yaw: Math.PI,
            pitch: 0.22,
            distance: 9.5,
          });
        });
      }
      if (hitFrame(t, 2.2)) await keyAct(pg, 'a', true);
      if (hitFrame(t, 2.28)) await keyAct(pg, 'Shift', true);
      if (hitFrame(t, 2.38)) await keyAct(pg, 'Shift', false);
      if (hitFrame(t, 2.7)) await keyAct(pg, 'a', false);
      // Beat 3 (t=2.9s..4.2s): Swap to Knight, ignite Ice Sword [E], slash Necromancer
      if (hitFrame(t, 2.9)) {
        await pg.evaluate(() => window.__WORLD__.coopSystem.swapActiveHero());
      }
      if (hitFrame(t, 3.05)) await keyAct(pg, 'e', true);
      if (hitFrame(t, 3.15)) await keyAct(pg, 'e', false);
      for (const tapT of [3.3, 3.75, 4.2]) {
        if (hitFrame(t, tapT)) {
          await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        }
      }
      // Beat 4 (t=4.8s): Clear Grove, walk onto Medallion (44, 16), inspect Stone 2 [G]
      if (hitFrame(t, 4.8)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.enemyManager.clearAllEnemies();
          w.coopSystem.teleportLeaderAndPartner(44.0, 17.2, Math.PI);
          w.enterStoneInspection();
        });
      }
      // Beat 5 (t=5.8s): Exit inspection & unlock Stage 2 (Fire [E] + [Tab])
      if (hitFrame(t, 5.8)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.exitStoneInspection();
          const judgment = {
            verdict: 'awakening',
            prayerMode: 'awakening',
            unlocksStage: true,
            stageUnlocked: 2,
            stoneSolvedId: 'stone_grove',
            hpDeltaPct: 0.6,
            divine_quote: 'Take the ember you asked for—let sunfire answer the frost.',
          };
          const updated = w.coopClient.progression.applyVerdictProgression(judgment);
          w.sculptedHud?.setProgressionState(updated);
          w.coopSystem.applyCommuneVerdict(judgment, 'Knight');
        });
      }
      const bossInfo = await pg.evaluate(() => {
        const w = window.__WORLD__;
        const b = w.enemyManager.activeEnemies.find((e) => e && e.isBoss && !e.dead);
        return b ? `boss=${b.archetype}(${b.hp}/${b.maxHp})` : `en=${w.enemyManager.activeEnemies.length}`;
      });
      return `Grove-Stronghold ${bossInfo}`;
    });
    await page.close();
    return errors;
  },

  // 10. AGGRESSIVE AUDIT 4: West Cottage Wall (-21.6, 20.4) -> BlackKnight Shield + OrcBrute -> Cross-Element Detonation -> Downed & Proximity Revive -> Stage 3
  async 'aggr-4-wall-blackknight-and-detonations'() {
    const { page, errors } = await openWorldPage();
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.setGameplayShot?.(null);
      w.enemyManager.clearAllEnemies();
      w.campaignLoop.resetCampaign();
      const prog2 = w.coopClient.progression.setUnlocks({
        communeDiscovered: true,
        iceUnlocked: true,
        fireUnlocked: true,
        ultimateUnlocked: false,
        stone1Solved: true,
        stone2Solved: true,
        stone3Solved: false,
        stonesSolvedMask: 3,
      });
      w.coopSystem.setUnlockedStage(2);
      w.campaignLoop.setUnlockedStage(2, 3);
      w.sculptedHud?.setProgressionState(prog2);
      w.campaignLoop.setOpenValleyMode(true);
      if (w.coopSystem.player.activeHeroId !== 'Knight') {
        w.coopSystem.swapActiveHero();
      }
      w.coopSystem.teleportLeaderAndPartner(-21.6, 25.0, Math.PI);
      w.camState.mode = 'player';
      w.camState.yaw = Math.PI;
      w.camState.pitch = 0.24;
      w.camState.dist = 7.6;
    });
    await stepFrames(page, 6);
    await recordClip(page, 'aggr-4-wall-blackknight-and-detonations', 6.5, async (t, pg) => {
      // Beat 1 (t=0.15s..2.0s): Toggle [Tab] to Fire, press [E] Hinokami Sunfire Sword, fight BlackKnight & OrcBrute (triggering cross-element detonations with Wingman Mage!)
      if (hitFrame(t, 0.15)) await keyAct(pg, 'Tab', true);
      if (hitFrame(t, 0.25)) await keyAct(pg, 'Tab', false);
      if (hitFrame(t, 0.35)) await keyAct(pg, 'e', true);
      if (hitFrame(t, 0.45)) await keyAct(pg, 'e', false);
      for (const tapT of [0.6, 1.05, 1.5, 1.95]) {
        if (hitFrame(t, tapT)) {
          await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        }
      }
      // Beat 2 (t=2.4s..5.1s): Simulate Mage getting downed in combat and Knight reviving her by standing within 2.5m for 2.5s while holding Shield Block [F]!
      if (hitFrame(t, 2.4)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          const k = w.coopSystem.heroStates.Knight;
          const m = w.coopSystem.heroStates.Mage;
          m.x = k.x + 1.2;
          m.z = k.z + 0.4;
          m.char.group.position.set(m.x, m.y, m.z);
          w.campaignLoop.combatHeroes.Mage.hp = 0;
          w.campaignLoop.combatHeroes.Mage.downed = true;
          m.char.play('downed', { loop: true, fade: 0.08, force: true });
        });
        await keyAct(pg, 'f', true);
      }
      if (hitFrame(t, 5.05)) {
        await keyAct(pg, 'f', false);
      }
      // Beat 3 (t=5.2s): Clear courtyard & inspect Stone 3 Wall (-21.6, 20.4) [G]
      if (hitFrame(t, 5.2)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.enemyManager.clearAllEnemies();
          w.enterStoneInspection();
        });
      }
      const revInfo = await pg.evaluate(() => {
        const w = window.__WORLD__;
        const m = w.campaignLoop.combatHeroes.Mage;
        return `M_down=${m.downed ? 1 : 0} rev=${(m.reviveProgress || 0).toFixed(2)} M_hp=${m.hp}`;
      });
      return `Wall-Stronghold ${revInfo}`;
    });
    await page.close();
    return errors;
  },

  // 11. AGGRESSIVE AUDIT 5: Apex Finale Golems (FrostGolem + Skeleton_Golem) -> Mode A Field Heal -> Mode B 4.8s Eclipse Blessing -> Divine Smite Rose Dissolve
  async 'aggr-5-apex-golems-ultimates-and-commune'() {
    const { page, errors } = await openWorldPage();
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.setGameplayShot?.(null);
      w.enemyManager.clearAllEnemies();
      w.campaignLoop.resetCampaign();
      const prog3 = w.coopClient.progression.setUnlocks({
        communeDiscovered: true,
        iceUnlocked: true,
        fireUnlocked: true,
        ultimateUnlocked: true,
        stone1Solved: true,
        stone2Solved: true,
        stone3Solved: true,
        stonesSolvedMask: 7,
      });
      w.coopSystem.setUnlockedStage(3);
      w.campaignLoop.setUnlockedStage(3, 7);
      w.sculptedHud?.setProgressionState(prog3);
      w.campaignLoop.setOpenValleyMode(true);
      if (w.coopSystem.player.activeHeroId !== 'Knight') {
        w.coopSystem.swapActiveHero();
      }
      w.coopSystem.teleportLeaderAndPartner(0.0, -4.5, Math.PI);
      w.camState.mode = 'player';
      w.camState.yaw = Math.PI;
      w.camState.pitch = 0.24;
      w.camState.dist = 8.8;
    });
    await stepFrames(page, 6);
    await recordClip(page, 'aggr-5-apex-golems-ultimates-and-commune', 7.0, async (t, pg) => {
      // Beat 1 (t=0.2s): Knight [Q] Twin-Dragon Awakening against FrostGolem & Skeleton_Golem!
      if (hitFrame(t, 0.2)) await keyAct(pg, 'q', true);
      if (hitFrame(t, 0.3)) await keyAct(pg, 'q', false);
      // Beat 2 (t=1.4s): Test Mode A In-Place Field Heal (+60% Max HP, zero cutscene lock)
      if (hitFrame(t, 1.4)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.hp = 95;
          w.campaignLoop.combatHeroes.Mage.hp = 50;
          w.coopSystem.applyCommuneVerdict(
            {
              verdict: 'heal',
              prayerMode: 'field_heal',
              hpDeltaPct: 0.6,
              divine_quote: 'A warm golden breeze mends your wounds in place.',
            },
            'Knight'
          );
        });
      }
      // Beat 3 (t=2.2s..4.8s): Drop Knight to 25% HP & trigger Mode B Divine Miracle (Eclipse + Briar Dome Resurrection)
      if (hitFrame(t, 2.2)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.combatHeroes.Knight.hp = 45;
          w.campaignLoop.combatHeroes.Mage.downed = true;
          w.campaignLoop.combatHeroes.Mage.hp = 0;
          w.coopSystem.applyCommuneVerdict(
            {
              verdict: 'miracle',
              prayerMode: 'divine_miracle',
              divine_quote: 'Stand, then—the thorns shall hold the sky until your song is finished.',
            },
            'Knight'
          );
        });
      }
      // Beat 4 (t=5.2s..6.9s): Trigger Divine Smite (`rose_gommage`) B&W monochrome + crimson petal dissolve!
      if (hitFrame(t, 5.2)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.campaignLoop.verdictSequence.active = false;
          const k = w.coopSystem.heroStates.Knight;
          const m = w.coopSystem.heroStates.Mage;
          if (k) {
            k.x = 0.0;
            k.z = -4.5;
            k.char.group.position.set(k.x, k.y, k.z);
          }
          if (m) {
            m.x = 1.35;
            m.z = -4.2;
            m.char.group.position.set(m.x, m.y, m.z);
          }
          w.coopSystem.applyCommuneVerdict(
            {
              verdict: 'smite',
              prayerMode: 'smite',
              divine_quote: 'Watch how swiftly a mortal bloom unravels into ash.',
            },
            'Knight'
          );
        });
      }
      const vState = await pg.evaluate(() => {
        const w = window.__WORLD__;
        const vs = w.campaignLoop.verdictSequence;
        return `vSeq=${vs.active ? `${vs.kind}(b${vs.beat},${vs.elapsed.toFixed(1)}s)` : 'idle'} bless=${w.campaignLoop.isDivineBlessingActive() ? 1 : 0}`;
      });
      return `Apex-Commune ${vState}`;
    });
    await page.close();
    return errors;
  },

  // 12. METHODOLOGY RULE 9: 3-Beat Close-Quarters Visceral Combat & "Honest Hitbox" Video Audit
  async 'close-quarters-melee-audit'() {
    const { page, errors } = await openWorldPage();
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.setGameplayShot?.(null);
      w.enemyManager.clearAllEnemies();
      w.campaignLoop.resetCampaign();
      const prog0 = w.coopClient.progression.setUnlocks({
        communeDiscovered: false,
        iceUnlocked: false,
        fireUnlocked: false,
        ultimateUnlocked: false,
        stone1Solved: false,
        stone2Solved: false,
        stone3Solved: false,
        stonesSolvedMask: 0,
      });
      w.coopSystem.setUnlockedStage(0);
      w.campaignLoop.setUnlockedStage(0, 0);
      w.sculptedHud?.setProgressionState(prog0);
      w.campaignLoop.setOpenValleyMode(false);
      if (w.coopSystem.player.activeHeroId !== 'Knight') {
        w.coopSystem.swapActiveHero();
      }
      // Teleport to sunlit Plaza clearing and spawn 3 melee skeletons 5.2m..6.4m ahead
      w.coopSystem.teleportLeaderAndPartner(0.0, 12.0, Math.PI);
      const m = w.coopSystem.heroStates.Mage;
      if (m) {
        m.x = 6.5;
        m.z = 16.5;
        m.char.group.position.set(m.x, m.y, m.z);
      }
      w.enemyManager.spawnWave(
        {
          id: 'close_quarters_audit',
          spawns: [
            { archetype: 'warrior', x: 0.0, z: 6.4 },
            { archetype: 'rogue', x: -1.6, z: 6.8 },
            { archetype: 'orc_raider', x: 1.6, z: 6.8 },
          ],
        },
        'act1_arena'
      );
      w.camState.mode = 'player';
      w.camState.yaw = Math.PI;
      w.camState.pitch = 0.22;
      w.camState.dist = 6.2;
    });
    await stepFrames(page, 6);
    await recordClip(page, 'close-quarters-melee-audit', 7.5, async (t, pg) => {
      // Beat A & B (0.0s..2.3s): Knight stands still while enemies sprint in, step-lunge into ~1.2m blade contact,
      // and land real unblocked hits (showing crimson -DMG pill, 3D crimson hit-flash, knockback + hit_A flinch, crimson screen vignette, HP bar shake).
      // Beat B2 (2.3s..3.3s): Knight holds Shield Block [F] for blocked hit feedback (icy BLOCKED -DMG pill), then steps back to make an enemy whiff!
      if (hitFrame(t, 2.3)) await keyAct(pg, 'f', true);
      if (hitFrame(t, 3.15)) await keyAct(pg, 'f', false);
      if (hitFrame(t, 3.2)) await keyAct(pg, 's', true);
      if (hitFrame(t, 3.3)) await keyAct(pg, 'Shift', true);
      if (hitFrame(t, 3.4)) await keyAct(pg, 'Shift', false);
      if (hitFrame(t, 3.7)) await keyAct(pg, 's', false);

      // Beat C (3.8s..7.4s): Knight steps in and unleashes basic combo1 -> combo2 -> combo3 -> combo4 slashes (zero spells),
      // verifying floating damage numbers on every slash, 3D enemy hit-flash, directional knockback recoil, and snappy flinches!
      if (hitFrame(t, 3.75)) await keyAct(pg, 'w', true);
      if (hitFrame(t, 4.15)) await keyAct(pg, 'w', false);
      for (const slashT of [4.1, 4.52, 4.95, 5.42, 5.95, 6.4, 6.85]) {
        if (hitFrame(t, slashT)) {
          await pg.evaluate(() => window.__WORLD__.coopSystem.triggerAction('attack'));
        }
      }
      const diag = await pg.evaluate(() => {
        const w = window.__WORLD__;
        const k = w.coopSystem.heroStates.Knight;
        const khp = w.campaignLoop.combatHeroes.Knight.hp;
        const e0 = w.enemyManager.activeEnemies[0];
        const d0 = e0 && k ? Math.hypot(e0.x - k.x, e0.z - k.z).toFixed(2) : '-';
        return `K_hp=${khp} d0=${d0}m e_cnt=${w.enemyManager.activeEnemies.length}`;
      });
      return `MeleeAudit ${diag}`;
    });
    await page.close();
    return errors;
  },

  // 13. Center-Screen 4-Way Swipe Dodge (Left / Right / Back / Forward) + Tudor House Wall Camera Spring-Arm & Dither Audit
  async 'dodge-and-house-camera-audit'() {
    const { page, errors } = await openWorldPage();
    await page.evaluate(() => {
      const w = window.__WORLD__;
      w.setGameplayShot?.(null);
      w.enemyManager.clearAllEnemies();
      w.campaignLoop.resetCampaign();
      w.campaignLoop.setOpenValleyMode(false);
      w.setProfile('tablet');
      if (w.coopSystem.player.activeHeroId !== 'Knight') {
        w.coopSystem.swapActiveHero();
      }
      w.coopSystem.teleportLeaderAndPartner(0.0, 12.0, Math.PI);
      w.camState.mode = 'player';
      w.camState.yaw = Math.PI;
      w.camState.pitch = 0.22;
      w.camState.dist = 6.8;
    });
    await stepFrames(page, 6);
    await recordClip(page, 'dodge-and-house-camera-audit', 6.2, async (t, pg) => {
      // Beat 1 (0.2s..3.2s): Simulate Center-Screen Character Swipes in all 4 directions:
      // Left (0.25s), Right (1.0s), Back (1.75s), Forward (2.5s) via #sculpted-center-dodge-zone pointer events!
      const triggerCenterSwipe = async (dx, dy) => {
        await pg.evaluate(
          ({ sdx, sdy }) => {
            const z = document.getElementById('sculpted-center-dodge-zone');
            if (!z) return;
            const cx = window.innerWidth * 0.5;
            const cy = window.innerHeight * 0.52;
            z.dispatchEvent(
              new PointerEvent('pointerdown', {
                pointerId: 41,
                clientX: cx,
                clientY: cy,
                bubbles: true,
              })
            );
            z.dispatchEvent(
              new PointerEvent('pointermove', {
                pointerId: 41,
                clientX: cx + sdx,
                clientY: cy + sdy,
                bubbles: true,
              })
            );
            z.dispatchEvent(
              new PointerEvent('pointerup', {
                pointerId: 41,
                clientX: cx + sdx,
                clientY: cy + sdy,
                bubbles: true,
              })
            );
          },
          { sdx: dx, sdy: dy }
        );
      };
      if (hitFrame(t, 0.25)) await triggerCenterSwipe(-75, 0); // Swipe Left -> Dodge_Left
      if (hitFrame(t, 1.0)) await triggerCenterSwipe(75, 0); // Swipe Right -> Dodge_Right
      if (hitFrame(t, 1.75)) await triggerCenterSwipe(0, 75); // Swipe Back -> Dodge_Backward
      if (hitFrame(t, 2.5)) await triggerCenterSwipe(0, -75); // Swipe Forward -> Dodge_Forward

      // Beat 2 (3.3s..6.1s): Teleport right beside Crossroads Inn wall (-10.8, -10.2) and rotate camera so the Tudor house is directly behind the camera!
      if (hitFrame(t, 3.3)) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.coopSystem.teleportLeaderAndPartner(-10.8, -10.2, 0.82);
          w.camState.yaw = 0.82;
          w.camState.pitch = 0.18;
          w.camState.dist = 7.8;
        });
      }
      if (t >= 3.4) {
        await pg.evaluate(() => {
          const w = window.__WORLD__;
          w.camState.yaw += 0.045;
        });
      }
      const diag = await pg.evaluate(() => {
        const w = window.__WORLD__;
        const frac = (w.camState.springArmFrac ?? 1.0).toFixed(2);
        return `armFrac=${frac}`;
      });
      return `Dodge&HouseCam ${diag}`;
    });
    await page.close();
    return errors;
  },
};

const listToRun = specFile
  ? [specFile]
  : requestedScenarios.length
    ? requestedScenarios
    : Object.keys(SCENARIOS);

let failed = 0;
for (const name of listToRun) {
  try {
    if (!SCENARIOS[name]) {
      throw new Error(`Unknown scenario: ${name}`);
    }
    const errs = await SCENARIOS[name]();
    console.log(
      `[harness] ${name} (${tag}): ${errs.length ? 'page errors: ' + [...new Set(errs)].join(' | ') : 'clean'}`
    );
  } catch (e) {
    failed++;
    console.error(`[harness] ${name} FAILED:`, e);
  }
}

await browser.close();
srv.server.close();
process.exit(failed ? 1 : 0);
