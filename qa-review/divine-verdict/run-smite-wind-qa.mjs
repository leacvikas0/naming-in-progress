// ============================================================================
// qa-review/divine-verdict/run-smite-wind-qa.mjs
//
// Captures the Left-to-Right Wind Petal Erosion (`Smite`) Stills, 6-Frame
// Progression Strip, and Live Video (`clip-smite-dissolve.webm`):
//   1. shot-41a-smite-dying-mid-dissolve.png (1600x900 — t = 0.88s)
//   2. shot-41-smite-bw-dissolve.png         (1600x900 — t = 1.40s)
//   3. smite-wind-strip.png                  (2400x920 — 6-Frame Left-to-Right Wind Strip)
//   4. clip-smite-dissolve.webm              (1280x720 @ 30fps, live motion)
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

async function captureSmiteStillsAndStrip(browser, baseUrl) {
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
    { id: '12a-divine-smite-dying-mid-dissolve', file: 'shot-41a-smite-dying-mid-dissolve.png' },
    { id: '12-divine-smite-bw-petal-dissolve', file: 'shot-41-smite-bw-dissolve.png' },
  ]) {
    const meta = await page.evaluate((id) => {
      const w = window.__WORLD__;
      w.appFlow?.skipToGame?.();
      w.toggleHud(false);
      w.setGameplayShot(id);
      w.post.render(0.016);
      const vfx = w.vfxKit.artoriousVfx;
      return {
        shotId: id,
        petalsCount: vfx.prismsAndDebrisMesh.count,
        slumpCount: vfx.groundSigilMesh.count,
        dissolveProgress: Number(vfx.getCharacterDissolveProgress().toFixed(2)),
      };
    }, shot.id);
    await page.waitForTimeout(100);
    const outPath = path.join(OUT_DIR, shot.file);
    await page.screenshot({ path: outPath });
    console.log(`[SMITE STILL] ${shot.file} -> ${outPath}`, JSON.stringify(meta));
  }

  // Capture 6-frame Left-to-Right Wind Petal Erosion Strip (t = 0.35s, 0.72s, 1.08s, 1.44s, 1.82s, 2.25s)
  const stripB64 = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.appFlow?.skipToGame?.();
    w.toggleHud(false);
    w.setGameplayShot('12a-divine-smite-dying-mid-dissolve');

    const strip = document.createElement('canvas');
    strip.width = 2400;
    strip.height = 920;
    const ctx = strip.getContext('2d');
    ctx.fillStyle = '#0c090d';
    ctx.fillRect(0, 0, strip.width, strip.height);

    const times = [0.35, 0.72, 1.08, 1.44, 1.82, 2.25];
    const webglCanvas = document.getElementById('world-canvas');
    const kState = w.coopSystem.heroStates.Knight;

    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      w.vfxKit.artoriousVfx.seek(t, { camera: w.camera });
      const dissProg = w.vfxKit.artoriousVfx.getCharacterDissolveProgress();
      w.coopSystem.knight.group.visible = dissProg < 0.99;
      w.coopSystem.knight.group.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          const u = mat?.userData?.verdictUniforms || mat?.uniforms;
          if (u && u.uDissolveProgress) u.uDissolveProgress.value = dissProg;
          if (u && u.uDissolveBaseY) u.uDissolveBaseY.value = kState.y;
        }
      });
      const tArr = w.terrainKit?.terrainMat?.uniforms?.uCharShadows?.value;
      if (tArr && tArr[0]) {
        if (dissProg > 0.92) {
          tArr[0].set(9999.0, 9999.0, 0.72, 0.0);
        } else {
          tArr[0].set(
            kState.x + dissProg * 0.35,
            kState.z,
            0.72 * (1.0 - dissProg * 0.75),
            1.0 - dissProg
          );
        }
      }
      w.post.render(0.016);

      const col = i % 3;
      const row = Math.floor(i / 3);
      const cellW = 780;
      const cellH = 440;
      const x0 = 15 + col * 795;
      const y0 = 15 + row * 450;

      ctx.drawImage(webglCanvas, 120, 24, 1360, 675, x0, y0 + 44, cellW, cellH - 44);
      ctx.fillStyle = '#1b151e';
      ctx.fillRect(x0, y0, cellW, 44);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(
        `LEFT->RIGHT WIND FRAME ${i + 1}/6 | t=${t.toFixed(2)}s | Dissolve=${(dissProg * 100).toFixed(0)}% | WholeRoses=${w.vfxKit.artoriousVfx.groundSigilMesh.count}`,
        x0 + 12,
        y0 + 28
      );
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0, cellW, cellH);
    }
    return strip.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  });

  const stripPath = path.join(OUT_DIR, 'smite-wind-strip.png');
  fs.writeFileSync(stripPath, Buffer.from(stripB64, 'base64'));
  console.log(`[SMITE WIND STRIP SAVED] ${stripPath}`);

  await page.close();
  await context.close();
}

async function recordSmiteVideo(browser, baseUrl) {
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

  const result = await page.evaluate(async () => {
    delete window.__FIXED_DT__;
    window.__TIME_SCALE__ = 0.78;
    const w = window.__WORLD__;
    w.appFlow?.skipToGame?.();
    w.setTimeOfDay('day');
    w.toggleHud(false);
    w.enemyManager.clearAllEnemies();

    const kState = w.coopSystem.heroStates.Knight;
    const mState = w.coopSystem.heroStates.Mage;
    kState.x = -0.68;
    kState.z = 9.2;
    kState.y = w.vfxKit.artoriousVfx.getGroundHeight(kState.x, kState.z);
    kState.yaw = 0.25;
    mState.x = 0.68;
    mState.z = 9.3;
    mState.y = w.vfxKit.artoriousVfx.getGroundHeight(mState.x, mState.z);
    mState.yaw = -0.45;
    w.player.x = kState.x;
    w.player.y = kState.y;
    w.player.z = kState.z;
    w.player.yaw = kState.yaw;

    w.campaignLoop.combatHeroes.Knight.hp = 180;
    w.campaignLoop.combatHeroes.Knight.downed = false;
    w.campaignLoop.combatHeroes.Mage.hp = 72;
    w.campaignLoop.combatHeroes.Mage.downed = false;

    w.camState.mode = 'player';
    w.camState.yaw = Math.PI;
    w.camState.pitch = -0.02;
    w.camState.dist = 6.3;
    w.coopSystem.startCommuneChannel('Mage', { force: true, camera: w.camera });
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
      const diss = (w.vfxKit.artoriousVfx.getCharacterDissolveProgress?.() ?? 0).toFixed(2);
      const phaseStr = vSeq.active
        ? `SMITE LEFT->RIGHT WIND (${vSeq.elapsed.toFixed(2)}s/${vSeq.duration.toFixed(2)}s)`
        : cLoop.communeChannelActive || w.coopSystem.communeChannel.active
          ? 'PRAYER_CHANNEL'
          : 'POST_SMITE';

      // Top-left Party HP card
      ctx.fillStyle = 'rgba(24, 22, 28, 0.90)';
      ctx.strokeStyle = 'rgba(225, 29, 72, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(16, 16, 290, 72, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f5f5f4';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('Knight', 28, 40);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(82, 30, 140, 12);
      ctx.fillStyle = k.downed ? '#4b5563' : '#e11d48';
      ctx.fillRect(82, 30, Math.round(140 * Math.max(0, Math.min(1, k.hp / k.maxHp))), 12);
      ctx.fillStyle = k.downed ? '#f87171' : '#f5f5f4';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(k.downed ? 'DISSOLVED' : `${k.hp}/${k.maxHp}`, 228, 40);

      ctx.fillStyle = '#f5f5f4';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('Mage', 28, 66);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(82, 56, 140, 12);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(82, 56, Math.round(140 * Math.max(0, Math.min(1, m.hp / m.maxHp))), 12);
      ctx.fillStyle = '#f5f5f4';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${m.hp}/${m.maxHp}`, 228, 66);

      const line = `[${phaseStr}] | Dissolve=${diss} | Petals=${w.vfxKit.artoriousVfx.prismsAndDebrisMesh.count} WholeRoses=${w.vfxKit.artoriousVfx.groundSigilMesh.count}`;
      ctx.fillStyle = 'rgba(8, 6, 12, 0.84)';
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(16, 676, 880, 28, 6);
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
    await new Promise((r) => setTimeout(r, 900));

    w.coopSystem.applyCommuneVerdict(
      {
        verdict: 'smite',
        divine_quote: 'A hollow vow is swept away like crimson petals in the wind.',
      },
      'Mage'
    );

    while (w.campaignLoop.verdictSequence.active) {
      await new Promise((r) => setTimeout(r, 60));
    }
    await new Promise((r) => setTimeout(r, 1100));

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
  });

  await page.close();
  await context.close();

  const finalPath = path.join(OUT_DIR, 'clip-smite-dissolve.webm');
  fs.writeFileSync(finalPath, Buffer.from(result.b64, 'base64'));
  const stat = await fsp.stat(finalPath);
  console.log(`[SMITE VIDEO RECORDED] ${finalPath} (${(stat.size / 1024).toFixed(1)} KB)`);
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
    await captureSmiteStillsAndStrip(browser, baseUrl);
    await recordSmiteVideo(browser, baseUrl);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
