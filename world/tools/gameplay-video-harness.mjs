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
