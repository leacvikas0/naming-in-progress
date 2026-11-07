// ============================================================================
// world/tools/test-cel-ui-and-shadows.mjs
//
// Fast 4-Scene Playwright Verification Script for:
//   1. Raytraced World Shadows + Contact AO (`world/assets/terrain/baked-shadows-ao.png`)
//   2. 100% Solid Matte Cel-Shaded UI (`sculpted-hud.js` & `app-flow.js`, > 14:1 contrast, zero glass)
//
// Outputs 4 crisp verification plates into `world/shots/quick-test/`:
//   - `test-01-country-road-raytraced-shadows.png` (1920x1080 Desktop)
//   - `test-02-town-plaza-day-cel-shadows-and-ui.png` (1600x1000 Tablet)
//   - `test-03-golden-hour-raytraced-long-shadows.png` (1920x1080 Desktop Golden Hour)
//   - `test-04-open-join-solid-cel-tablets.png` (1920x1080 Open or Join Domain)
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'file:///C:/Users/silen/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { encodeWsFrame } from './serve.mjs';

const toolsDir = import.meta.dirname;
const worldDir = path.resolve(toolsDir, '..');
const worktreeRoot = path.resolve(worldDir, '..');
const mainRepoRoot = path.resolve(worktreeRoot, '../../..');
const outDir = path.join(worldDir, 'shots', 'quick-test');
fs.mkdirSync(outDir, { recursive: true });

const bakedMapPath = path.join(worldDir, 'assets', 'terrain', 'baked-shadows-ao.png');
if (!fs.existsSync(bakedMapPath)) {
  console.error(`ERROR: Missing ${bakedMapPath} — wait for Subagent 1's bake to finish first.`);
  process.exit(1);
}

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

function resolveAssetPath(urlPath) {
  const rel = urlPath === '/' ? 'world/index.html' : urlPath.replace(/^\/+/, '');
  const candidateWorktree = path.join(worktreeRoot, rel);
  if (fs.existsSync(candidateWorktree)) {
    return fs.statSync(candidateWorktree).isDirectory()
      ? path.join(candidateWorktree, 'index.html')
      : candidateWorktree;
  }
  const candidateMain = path.join(mainRepoRoot, rel);
  if (fs.existsSync(candidateMain)) {
    return fs.statSync(candidateMain).isDirectory()
      ? path.join(candidateMain, 'index.html')
      : candidateMain;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
  const urlPath = decodeURIComponent(parsedUrl.pathname);

  res.setHeader('X-Haru-Coop', '1');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS' || urlPath === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (urlPath === '/api/altar') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        stage: 1,
        stoneId: 'stone_plaza',
        title: 'Stele of the Sovereign Vow',
        lines: [
          'Where crimson petals ring the ancient stone,',
          'No mortal walks the valley road alone.',
          'Bind blossom unto heartbeat in thy plea,',
          'And speak the Sovereign’s name to set love free.',
        ],
      })
    );
    return;
  }

  if (urlPath === '/api/commune') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        type: 'commune_verdict',
        ok: true,
        verdict: 'blessing',
        hpDelta: 60,
        shouldSpeakAloud: false,
        audioUrl: null,
      })
    );
    return;
  }

  const filePath = resolveAssetPath(urlPath);
  if (!filePath || !fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found: ' + urlPath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Haru-Coop': '1',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
});

server.on('upgrade', (req, socket) => {
  const secKey = req.headers['sec-websocket-key'];
  if (!secKey) {
    socket.destroy();
    return;
  }
  const acceptKey = createHash('sha1')
    .update(String(secKey).trim() + WS_GUID)
    .digest('base64');
  socket.setNoDelay(true);
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      'X-Haru-Coop: 1',
      '\r\n',
    ].join('\r\n')
  );
  const welcome = {
    type: 'room_state',
    room: 'RAIN-ON-WARM-LIMESTONE',
    roomPhrase: 'Rain on warm limestone',
    clientId: 'p1',
    role: 'Knight',
    isHost: true,
    ready: true,
    peerReady: true,
    peerConnected: true,
    isFull: true,
    expeditionStarted: false,
    progression: {
      communeDiscovered: true,
      unlockedStage: 3,
      stonesSolved: 3,
    },
    players: [
      { clientId: 'p1', role: 'Knight', isHost: true, ready: true },
      { clientId: 'p2', role: 'Mage', isHost: false, ready: true },
    ],
    timestamp: Date.now(),
  };
  try {
    socket.write(encodeWsFrame(JSON.stringify(welcome), 0x81));
  } catch {
    // ignore
  }
  socket.on('error', () => {});
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/world/index.html`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});

const report = {
  timestamp: new Date().toISOString(),
  bakedShadowsPath: bakedMapPath,
  bakedShadowsBytes: fs.statSync(bakedMapPath).size,
  consoleErrors,
  pageErrors,
  failedRequests,
  plates: {},
};

try {
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err?.stack || err?.message || String(err));
  });
  page.on('requestfailed', (req) => {
    if (req.method() === 'HEAD') return;
    failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText || 'failed'}`);
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${baseUrl}?flow=1&step=title&maskSpoilers=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
    null,
    { timeout: 30000 }
  );

  // Wait for fonts and baked shadow texture to finish loading on GPU
  await page.evaluate(async () => {
    if (document.fonts) {
      try {
        await Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 2000)),
        ]);
      } catch {
        // ignore
      }
    }
    const w = window.__WORLD__;
    for (let i = 0; i < 40; i++) {
      const tex =
        w?.terrainKit?.terrainMat?.uniforms?.uBakedShadowAO?.value ||
        w?.terrainKit?.terrainMat?.uniforms?.uBakedShadowMap?.value ||
        w?.meadow?.sharedUniforms?.uBakedShadowAO?.value;
      const img = tex?.image;
      const imgW = img?.naturalWidth || img?.width || 0;
      if (imgW >= 512) {
        tex.needsUpdate = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  async function renderFrames(count = 10, dt = 0.016) {
    await page.evaluate(
      ({ n, stepDt }) => {
        const w = window.__WORLD__;
        if (!w) return;
        for (let i = 0; i < n; i++) {
          w.coopSystem?.knight?.update?.(stepDt);
          w.coopSystem?.mage?.update?.(stepDt);
          w.damageNumbers?.update?.(stepDt, w.camera);
          w.post?.render?.(stepDt);
        }
      },
      { n: count, stepDt: dt }
    );
    await page.waitForTimeout(100);
  }

  // ==========================================================================
  // PLATE 4 FIRST (while in Opening Flow):
  // `test-04-open-join-solid-cel-tablets.png` (1920x1080)
  // `Open or Join Domain` screen showing the solid matte cel-shaded sanctuary
  // tablets (`#1b1822` + warm-alabaster & gold double rim, 15:1 readability,
  // zero glass!).
  // ==========================================================================
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(120);
  const plate4Meta = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.toggleHud(true);
    w.setProfile('desktop');
    w.setTimeOfDay('day');
    w.sculptedHud.setVisible(false);
    w.appFlow.setStep('create_join');
    w.appFlow.resolvePixelVeil();
    w.appFlow.setErrorMessage('');
    const firstChip = document.querySelector('[data-phrase-chip="Rain on warm limestone"]');
    firstChip?.click();
    const phraseInput = document.getElementById('app-flow-phrase-input');
    if (phraseInput) phraseInput.value = '';
    w.post.render(0.016);

    const createTablet = document.getElementById('app-flow-create-tablet');
    const createBtn = document.getElementById('app-flow-create-btn');
    const tabStyle = createTablet ? getComputedStyle(createTablet) : null;
    const btnStyle = createBtn ? getComputedStyle(createBtn) : null;
    return {
      step: w.appFlow.getStep(),
      tabletBg: tabStyle?.backgroundColor,
      tabletBgImage: tabStyle?.backgroundImage,
      tabletRect: createTablet?.getBoundingClientRect(),
      createBtnBg: btnStyle?.backgroundColor,
      createBtnColor: btnStyle?.color,
    };
  });
  await renderFrames(10);
  const plate4File = path.join(outDir, 'test-04-open-join-solid-cel-tablets.png');
  await page.screenshot({ path: plate4File });
  report.plates.test04 = { file: plate4File, ...plate4Meta };
  console.log('Captured Plate 4 ->', plate4File, JSON.stringify(plate4Meta));

  // ==========================================================================
  // PLATE 1: `test-01-country-road-raytraced-shadows.png` (1920x1080)
  // Looking down the Southern Country Road & Wisteria/Oak trees with the new
  // Raytraced World Shadows + Contact AO (`baked-shadows-ao.png`) and Solid
  // Matte Cel-HUD.
  // ==========================================================================
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(120);
  const plate1Meta = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.toggleHud(true);
    w.appFlow.setStep('in_game');
    w.setProfile('desktop');
    w.setShot('day-south-road-boulders');

    w.sculptedHud.setVisible(true);
    w.sculptedHud.setProfileMode('desktop');
    w.sculptedHud.setTimeOfDaySelection('day');
    w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
    w.sculptedHud.setProgressionState({
      communeDiscovered: true,
      iceUnlocked: true,
      fireUnlocked: true,
      ultimateUnlocked: true,
      unlockedStage: 3,
      stonesSolved: 3,
      activeRole: 'Knight',
      activeElement: 'ice',
    });
    document.getElementById('sculpted-tab-caption')?.classList.remove('is-dismissed');
    w.sculptedHud.updatePartyStatus({
      activeRole: 'Knight',
      activeElement: 'ice',
      knight: { hp: 220, maxHp: 220, shield: 0 },
      mage: { hp: 90, maxHp: 90, shield: 0 },
      cooldowns: { E: 0, Q: 0, eBuffRemaining: 0 },
    });
    w.damageNumbers?.clear?.();
    w.measurePerformance(16);

    const atkEl = document.getElementById('sculpted-attack-btn');
    const atkStyle = getComputedStyle(atkEl);
    const nameStyle = getComputedStyle(document.getElementById('sh-name-primary'));
    const vitStyle = getComputedStyle(document.getElementById('sculpted-vitality-text'));
    return {
      stats: w.getStats(),
      attackBg: atkStyle.backgroundColor,
      attackBgImage: atkStyle.backgroundImage,
      attackRect: atkEl.getBoundingClientRect(),
      nameBg: nameStyle.backgroundColor,
      vitalityBg: vitStyle.backgroundColor,
    };
  });
  await renderFrames(10);
  const plate1File = path.join(outDir, 'test-01-country-road-raytraced-shadows.png');
  await page.screenshot({ path: plate1File });
  report.plates.test01 = { file: plate1File, ...plate1Meta };
  console.log('Captured Plate 1 ->', plate1File, JSON.stringify(plate1Meta));

  // ==========================================================================
  // PLATE 2: `test-02-town-plaza-day-cel-shadows-and-ui.png` (1600x1000 Tablet)
  // Town Plaza in Sunlit Day showing the raytraced pitched-roof Tudor house
  // shadows, grounded contact AO at the base of the houses/well/fences, and
  // the Solid Matte Cel-Shaded Two-Handed Tablet HUD.
  // ==========================================================================
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(120);
  const plate2Meta = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.toggleHud(true);
    w.appFlow.setStep('in_game');
    w.setProfile('tablet');
    w.setShot('day-plaza');
    w.sculptedHud.setVisible(true);
    w.sculptedHud.setProfileMode('tablet');
    w.sculptedHud.setTimeOfDaySelection('day');
    w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
    w.sculptedHud.setProgressionState({
      communeDiscovered: true,
      iceUnlocked: true,
      fireUnlocked: true,
      ultimateUnlocked: true,
      unlockedStage: 3,
      stonesSolved: 3,
      activeRole: 'Knight',
      activeElement: 'ice',
    });
    document.getElementById('sculpted-tab-caption')?.classList.remove('is-dismissed');
    w.sculptedHud.updatePartyStatus({
      activeRole: 'Knight',
      activeElement: 'ice',
      knight: { hp: 220, maxHp: 220, shield: 45 },
      mage: { hp: 90, maxHp: 90, shield: 30 },
      cooldowns: { E: 0, Q: 0, eBuffRemaining: 11.2 },
    });

    const puck = document.getElementById('sh-joy-puck');
    const ring = document.getElementById('sh-joy-ring');
    if (puck) puck.style.transform = 'translate3d(18px, -24px, 0px)';
    if (ring) ring.classList.add('is-sprinting');

    w.measurePerformance(16);

    const joyStyle = getComputedStyle(document.getElementById('sh-joy-ring'));
    const atkRect = document.getElementById('sculpted-attack-btn')?.getBoundingClientRect();
    const dashRect = document.getElementById('sculpted-dash-btn')?.getBoundingClientRect();
    const jumpRect = document.getElementById('sculpted-jump-btn')?.getBoundingClientRect();
    const slotERect = document.getElementById('sculpted-slot-e')?.getBoundingClientRect();
    const slotQRect = document.getElementById('sculpted-slot-q')?.getBoundingClientRect();
    const slotTabRect = document.getElementById('sculpted-slot-tab')?.getBoundingClientRect();
    const communeRect = document.getElementById('sculpted-commune-btn')?.getBoundingClientRect();

    return {
      stats: w.getStats(),
      joyBg: joyStyle.backgroundColor,
      joyBgImage: joyStyle.backgroundImage,
      sizes: {
        attack: [Math.round(atkRect?.width || 0), Math.round(atkRect?.height || 0)],
        dash: [Math.round(dashRect?.width || 0), Math.round(dashRect?.height || 0)],
        jump: [Math.round(jumpRect?.width || 0), Math.round(jumpRect?.height || 0)],
        slotE: [Math.round(slotERect?.width || 0), Math.round(slotERect?.height || 0)],
        slotQ: [Math.round(slotQRect?.width || 0), Math.round(slotQRect?.height || 0)],
        slotTab: [Math.round(slotTabRect?.width || 0), Math.round(slotTabRect?.height || 0)],
        commune: [Math.round(communeRect?.width || 0), Math.round(communeRect?.height || 0)],
      },
    };
  });
  await renderFrames(10);
  const plate2File = path.join(outDir, 'test-02-town-plaza-day-cel-shadows-and-ui.png');
  await page.screenshot({ path: plate2File });
  report.plates.test02 = { file: plate2File, ...plate2Meta };
  console.log('Captured Plate 2 ->', plate2File, JSON.stringify(plate2Meta));

  // ==========================================================================
  // PLATE 3: `test-03-golden-hour-raytraced-long-shadows.png` (1920x1080)
  // Town Plaza & Houses in Golden Hour showing the long raytraced sunset roof
  // & tree shadows (Channel G) + Contact AO (Channel A) + Golden-Hour Cel-HUD.
  // ==========================================================================
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const w = window.__WORLD__;
    w.toggleHud(true);
    w.appFlow.setStep('in_game');
    w.setProfile('desktop');
    w.setShot('evening-plaza');
    w.sculptedHud.setVisible(true);
    w.sculptedHud.setProfileMode('desktop');
    w.sculptedHud.setTimeOfDaySelection('evening');
    w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
    w.sculptedHud.setProgressionState({
      communeDiscovered: true,
      iceUnlocked: true,
      fireUnlocked: true,
      ultimateUnlocked: true,
      unlockedStage: 3,
      stonesSolved: 3,
      activeRole: 'Knight',
      activeElement: 'fire',
    });
  });
  await page.waitForTimeout(200);
  const plate3Meta = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.measurePerformance(16);
    const atkStyle = getComputedStyle(document.getElementById('sculpted-attack-btn'));
    return {
      stats: w.getStats(),
      envPolarity: document.documentElement.dataset.envPolarity,
      goldenRingBg: atkStyle.backgroundColor,
    };
  });
  await renderFrames(10);
  const plate3File = path.join(outDir, 'test-03-golden-hour-raytraced-long-shadows.png');
  await page.screenshot({ path: plate3File });
  report.plates.test03 = { file: plate3File, ...plate3Meta };
  console.log('Captured Plate 3 ->', plate3File, JSON.stringify(plate3Meta));

  const reportPath = path.join(outDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('Saved quick-test report ->', reportPath);

  if (consoleErrors.length > 0 || pageErrors.length > 0 || failedRequests.length > 0) {
    console.error('Errors detected during quick-test:', {
      consoleErrors,
      pageErrors,
      failedRequests,
    });
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
}
