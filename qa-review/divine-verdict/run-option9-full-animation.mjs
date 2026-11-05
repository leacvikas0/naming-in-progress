// ============================================================================
// qa-review/divine-verdict/run-option9-full-animation.mjs
//
// Captures Briar Option 09 (Thick + Warm Chestnut-Mahogany Bark) Full Animation:
//   1. shot-57a-briar-net-creeping.png (1600x900 — Beat 1A Slow Root Creep & Net Weave)
//   2. shot-57-briar-jail.png          (1600x900 — Beat 1B Full Locked Option 09 Bower)
//   3. shot-beat3-flower-slump.png     (1600x900 — Beat 3 Underground Slump + HP Fill)
//   4. option9-full-animation-strip.png(2560x1440 — 8-Frame Complete 4-Beat Storyboard)
//   5. clip-blessing-resurrection.webm (1280x720 @ 30fps — Full Live Animation Video)
// ============================================================================

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { startServer } from '../../world/tools/serve.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = __dirname;

const OPTION_09_PRESET = {
  tubeRadiusScale: 1.95,
  flowerScale: 1.32,
  bowerAO: 0.88,
  sapIntensity: 1.15,
  wetness: 1.15,
  eclipseRim: 0.92,
  barkTone: 2.0,
  activeBriarCount: 18,
  radialSpanMult: 1.0,
  crownHeightMult: 1.28,
};

async function captureOption9StillsAndStrip(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/world/index.html?nolobby=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(250);

  for (const shot of [
    { id: '10a-divine-briar-net-creeping', file: 'shot-57a-briar-net-creeping.png', hideHud: true },
    { id: '10-divine-briar-jail-lattice', file: 'shot-57-briar-jail.png', hideHud: true },
    { id: '11-divine-underground-flower-slump', file: 'shot-beat3-flower-slump.png', hideHud: false },
  ]) {
    await page.evaluate(
      ({ id, hideHud, preset }) => {
        const w = window.__WORLD__;
        w.appFlow?.skipToGame?.();
        w.toggleHud(!hideHud);
        w.vfxKit.artoriousVfx.setBriarStylePreset(preset);
        w.setGameplayShot(id);
        if (!hideHud) {
          const banner = document.getElementById('combat-banner');
          if (banner) banner.classList.remove('visible');
          document
            .querySelectorAll(
              '#mobile-controls, .mobile-controls, #touch-controls, #sculpted-action-cluster, #sculpted-pause-btn'
            )
            .forEach((el) => {
              el.style.display = 'none';
            });
        }
        w.post.render(0.016);
      },
      { ...shot, preset: OPTION_09_PRESET }
    );
    await page.waitForTimeout(100);
    const outPath = path.join(OUT_DIR, shot.file);
    await page.screenshot({ path: outPath });
    console.log(`[OPTION 09 STILL] ${shot.file} -> ${outPath}`);
  }

  // Capture an 8-Frame Complete 4-Beat Storyboard Strip (2x4 grid, 2560x1440)
  const stripB64 = await page.evaluate((preset) => {
    const w = window.__WORLD__;
    w.appFlow?.skipToGame?.();
    w.toggleHud(false);
    w.vfxKit.artoriousVfx.setBriarStylePreset(preset);
    w.setGameplayShot('10-divine-briar-jail-lattice');

    const strip = document.createElement('canvas');
    strip.width = 2560;
    strip.height = 1440;
    const ctx = strip.getContext('2d');
    ctx.fillStyle = '#0c090d';
    ctx.fillRect(0, 0, strip.width, strip.height);

    // Header
    ctx.fillStyle = '#181118';
    ctx.fillRect(0, 0, strip.width, 86);
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 86);
    ctx.lineTo(strip.width, 86);
    ctx.stroke();

    ctx.fillStyle = '#fdfaf2';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(
      'BRIAR OPTION 09 (THICK + WARM CHESTNUT-MAHOGANY BARK) — FULL 4-BEAT ANIMATION SEQUENCE',
      28,
      40
    );
    ctx.fillStyle = '#fda4af';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(
      'Beat 1 (0.00..2.10s): Slow Root Creep -> Whip Bower | Beat 2 (2.10..2.65s): Full Downward Plunge | Beat 3 (2.65..4.25s): Underground Slump + HP Fill | Beat 4 (4.25..4.80s): Pop-Up',
      28,
      68
    );

    const frames = [
      { t: 0.38, label: '1. BEAT 1A (0.38s) — Slow Root Creep' },
      { t: 1.02, label: '2. BEAT 1B (1.02s) — Asymmetric Net Climb' },
      { t: 1.98, label: '3. BEAT 1C (1.98s) — Locked Option 09 Bower' },
      { t: 2.28, label: '4. BEAT 2A (2.28s) — Downward Wrench (-0.84m)' },
      { t: 2.46, label: '5. BEAT 2B (2.46s) — Deep Plunge (-2.36m)' },
      { t: 2.62, label: '6. BEAT 2C (2.62s) — 100% Submerged (-3.05m)' },
      { t: 3.45, label: '7. BEAT 3 (3.45s) — Underground Slump & Heal' },
      { t: 4.52, label: '8. BEAT 4 (4.52s) — Pop-Up & 64-Petal Scatter' },
    ];

    const webglCanvas = document.getElementById('world-canvas');
    const kState = w.coopSystem.heroStates.Knight;
    const mState = w.coopSystem.heroStates.Mage;

    for (let i = 0; i < frames.length; i++) {
      const { t, label } = frames[i];
      w.vfxKit.artoriousVfx.seek(t, { camera: w.camera });
      const kLevY = w.vfxKit.artoriousVfx.getHeroLevitationOffset('Knight');
      const mLevY = w.vfxKit.artoriousVfx.getHeroLevitationOffset('Mage');
      const hidden = w.vfxKit.artoriousVfx.isHeroUndergroundHidden();
      w.coopSystem.knight.group.visible = !hidden;
      w.coopSystem.mage.group.visible = !hidden;
      if (w.vfxKit.swordVfx?.group) w.vfxKit.swordVfx.group.visible = !hidden;
      w.coopSystem.knight.group.position.y = kState.y + kLevY;
      w.coopSystem.mage.group.position.y = mState.y + mLevY;

      // Update ground clip shader during Beat 2/4
      const clipY = kLevY < -0.02 ? kState.y - 0.02 : -9999;
      for (const charObj of [w.coopSystem.knight, w.coopSystem.mage]) {
        charObj.group.traverse((obj) => {
          if (!obj.isMesh || !obj.material) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            const u = mat?.userData?.verdictUniforms || mat?.uniforms;
            if (u && u.uGroundClipY) u.uGroundClipY.value = clipY;
          }
        });
      }

      // Clear Eclipse on Beat 4 pop-up
      if (t >= 4.25) {
        const clearU = Math.min(1, (t - 4.25) / 0.55);
        w.sky.setEclipseState({
          weight: 1.0 - clearU,
          compression: 1.0 - clearU,
          windTimeScale: 0.35 + 0.65 * clearU,
          camera: w.camera,
        });
      } else {
        w.sky.setEclipseState({
          weight: 1.0,
          compression: 1.0,
          windTimeScale: 0.35,
          camera: w.camera,
        });
      }
      w.sky.update(1.25);
      w.post.render(0.016);

      const col = i % 4;
      const row = Math.floor(i / 4);
      const cellW = 615;
      const cellH = 648;
      const x0 = 20 + col * 630;
      const y0 = 104 + row * 662;

      ctx.drawImage(webglCanvas, 120, 24, 1360, 675, x0, y0 + 42, cellW, cellH - 42);
      ctx.fillStyle = '#261219';
      ctx.fillRect(x0, y0, cellW, 42);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(label, x0 + 12, y0 + 27);
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0, cellW, cellH);
    }

    return strip.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  }, OPTION_09_PRESET);

  const stripPath = path.join(OUT_DIR, 'option9-full-animation-strip.png');
  fs.writeFileSync(stripPath, Buffer.from(stripB64, 'base64'));
  console.log(`[OPTION 09 8-FRAME STRIP SAVED] ${stripPath}`);

  await page.close();
  await context.close();
}

async function recordOption9BlessingVideo(browser, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/world/index.html?nolobby=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(200);

  const result = await page.evaluate(async (preset) => {
    delete window.__FIXED_DT__;
    window.__TIME_SCALE__ = 0.82;
    const w = window.__WORLD__;
    w.appFlow?.skipToGame?.();
    w.setTimeOfDay('day');
    w.toggleHud(false);
    w.enemyManager.clearAllEnemies();

    // Lock in Briar Option 09 (Thick + Warm Chestnut-Mahogany Bark)
    w.vfxKit.artoriousVfx.setBriarStylePreset(preset);

    // Place Knight & Mage on the grey Town Plaza cobblestones facing the camera
    const kState = w.coopSystem.heroStates.Knight;
    const mState = w.coopSystem.heroStates.Mage;
    kState.x = -0.76;
    kState.z = 9.2;
    kState.y = w.vfxKit.artoriousVfx.getGroundHeight(kState.x, kState.z);
    kState.yaw = 0.22;
    mState.x = 0.76;
    mState.z = 9.2;
    mState.y = w.vfxKit.artoriousVfx.getGroundHeight(mState.x, mState.z);
    mState.yaw = -0.25;
    w.player.x = kState.x;
    w.player.y = kState.y;
    w.player.z = kState.z;
    w.player.yaw = kState.yaw;

    // Set Knight low HP (68/220) and Mage downed (0/90) to show underground revival + smooth HP fill
    w.campaignLoop.combatHeroes.Knight.hp = 68;
    w.campaignLoop.combatHeroes.Knight.downed = false;
    w.campaignLoop.combatHeroes.Mage.hp = 0;
    w.campaignLoop.combatHeroes.Mage.downed = true;
    w.coopSystem.mage.play('death', { loop: false, fade: 0.05, force: true });

    w.camState.mode = 'player';
    w.camState.yaw = Math.PI;
    w.camState.pitch = -0.02;
    w.camState.dist = 6.6;
    w.coopSystem.startCommuneChannel('Knight', { force: true, camera: w.camera });
    if (w.coopSystem.sanctuarySteleMesh) w.coopSystem.sanctuarySteleMesh.position.y = -999;

    const webglCanvas = document.getElementById('world-canvas');
    const recCanvas = document.createElement('canvas');
    recCanvas.width = 1280;
    recCanvas.height = 720;
    const ctx = recCanvas.getContext('2d');

    let recording = true;
    const drawCompositeFrame = () => {
      if (!recording) return;
      if (w.coopSystem.sanctuarySteleMesh) w.coopSystem.sanctuarySteleMesh.position.y = -999;
      ctx.drawImage(webglCanvas, 0, 0, 1280, 720);

      const cLoop = w.campaignLoop;
      const vSeq = cLoop.verdictSequence;
      const k = cLoop.combatHeroes.Knight;
      const m = cLoop.combatHeroes.Mage;
      const dist = w.coopSystem.getHeroDistance().toFixed(2);
      const wind = w.sky.getWindTimeScale().toFixed(2);
      const phaseStr = vSeq.active
        ? `OPT 09 ${vSeq.kind.toUpperCase()} Beat ${vSeq.beat} (${vSeq.elapsed.toFixed(2)}s/${vSeq.duration.toFixed(2)}s)`
        : cLoop.communeChannelActive || w.coopSystem.communeChannel.active
          ? 'PRAYER_CHANNEL (OPT 09)'
          : cLoop.isDivineBlessingActive()
            ? `BLESSED_30S (${cLoop.getDivineBlessingRemaining().toFixed(1)}s)`
            : 'IDLE';

      // Top-Left Party HP Bars card
      ctx.fillStyle = 'rgba(250, 248, 243, 0.90)';
      ctx.strokeStyle = 'rgba(28, 25, 23, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(16, 16, 290, 72, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#1c1917';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('Knight', 28, 40);
      ctx.fillStyle = 'rgba(28, 25, 23, 0.14)';
      ctx.fillRect(82, 30, 140, 12);
      ctx.fillStyle = '#e11d48';
      ctx.fillRect(82, 30, Math.round(140 * Math.max(0, Math.min(1, k.hp / k.maxHp))), 12);
      ctx.fillStyle = '#1c1917';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${k.hp}/${k.maxHp}`, 230, 40);

      ctx.fillStyle = '#1c1917';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('Mage', 28, 66);
      ctx.fillStyle = 'rgba(28, 25, 23, 0.14)';
      ctx.fillRect(82, 56, 140, 12);
      ctx.fillStyle = m.downed ? '#6b7280' : '#0284c7';
      ctx.fillRect(82, 56, Math.round(140 * Math.max(0, Math.min(1, m.hp / m.maxHp))), 12);
      ctx.fillStyle = m.downed ? '#dc2626' : '#1c1917';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(m.downed ? 'DOWNED' : `${m.hp}/${m.maxHp}`, 230, 66);

      const line = `[${phaseStr}] | Wind=${wind}x Dist=${dist}m | Knight=${k.hp}/${k.maxHp} Mage=${m.hp}/${m.maxHp}${m.downed ? '(DOWN)' : ''} | Vis=${w.coopSystem.knight.group.visible ? 1 : 0}/${w.coopSystem.mage.group.visible ? 1 : 0}`;
      ctx.fillStyle = 'rgba(8, 6, 12, 0.84)';
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(16, 676, 920, 28, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fdfaf2';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(line, 26, 694);

      requestAnimationFrame(drawCompositeFrame);
    };
    requestAnimationFrame(drawCompositeFrame);

    const stream = recCanvas.captureStream(30);
    const chunks = [];
    const rec = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: 6000000,
    });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise((resolve) => {
      rec.onstop = resolve;
    });

    rec.start();

    // 1.2s in Prayer Channel (0.35x wind, creeping chestnut-mahogany roots, drifting crimson petals)
    await new Promise((r) => setTimeout(r, 1200));

    // Trigger full 4-Beat Blessing sequence (4.80s sim time -> ~5.85s wall-clock @ 0.82x timeScale)
    w.coopSystem.applyCommuneVerdict(
      {
        verdict: 'blessing',
        divine_quote: 'The Court of Dark Flowers restores your bond.',
      },
      'Knight'
    );

    while (w.campaignLoop.verdictSequence.active) {
      await new Promise((r) => setTimeout(r, 60));
    }
    await new Promise((r) => setTimeout(r, 1400));

    recording = false;
    delete window.__TIME_SCALE__;
    rec.stop();
    await done;

    const blob = new Blob(chunks, { type: 'video/webm' });
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return { b64: btoa(bin) };
  }, OPTION_09_PRESET);

  await page.close();
  await context.close();

  const finalPath = path.join(OUT_DIR, 'clip-blessing-resurrection.webm');
  fs.writeFileSync(finalPath, Buffer.from(result.b64, 'base64'));
  const stat = await fsp.stat(finalPath);
  console.log(`[OPTION 09 VIDEO RECORDED] ${finalPath} (${(stat.size / 1024).toFixed(1)} KB)`);
}

async function main() {
  const { server, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    await captureOption9StillsAndStrip(browser, baseUrl);
    await recordOption9BlessingVideo(browser, baseUrl);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
