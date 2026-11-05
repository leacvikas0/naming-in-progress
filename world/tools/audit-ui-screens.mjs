// ============================================================================
// world/tools/audit-ui-screens.mjs
//
// Ephemeral-port Playwright UI/UX & Behavioral Flow Auditor for Amarante.
// Captures crisp 1920x1080 Desktop and 1600x1000 Xiaomi Pad 7 Tablet screenshots
// of all 10 canonical opening flow, HUD, 3D stone gaze, combat damage numbers,
// environment-adaptive ink polarity, and pause atmosphere states into
// `world/shots/amarante-verified/`, with zero-spoiler guarantees.
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
const outDir = path.join(worldDir, 'shots', 'amarante-verified');
fs.mkdirSync(outDir, { recursive: true });

const SPOILER_SAFE_LINES = [
  'Where crimson petals ring the ancient stone,',
  'No mortal walks the valley road alone.',
  'Bind blossom unto heartbeat in thy plea,',
  'And speak the Sovereign’s name to set love free.',
];

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

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (urlPath === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Zero-Spoiler `/api/altar` handler
  if (urlPath === '/api/altar') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        stage: 1,
        stoneId: 'stone_plaza',
        title: 'Stele of the Sovereign Vow',
        lines: SPOILER_SAFE_LINES,
      })
    );
    return;
  }

  // Stub `/api/commune` handler
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
      communeDiscovered: false,
      unlockedStage: 0,
      stonesSolved: 0,
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

const auditReport = {
  timestamp: new Date().toISOString(),
  ephemeralPort: port,
  consoleErrors,
  pageErrors,
  failedRequests,
  screenshots: [],
  checks: {},
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
    failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText || 'failed'}`);
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${baseUrl}?flow=1&step=title&maskSpoilers=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => Boolean(window.__WORLD__ && window.__WORLD__.ready && window.__WORLD_READY__),
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(250);

  async function renderFrames(count = 6, dt = 0.016) {
    await page.evaluate(
      ({ n, stepDt }) => {
        const w = window.__WORLD__;
        if (!w) return;
        for (let i = 0; i < n; i++) {
          w.damageNumbers?.update?.(stepDt, w.camera);
          w.post?.render?.(stepDt);
        }
      },
      { n: count, stepDt: dt }
    );
    await page.waitForTimeout(80);
  }

  // ==========================================================================
  // 01. `01-title-pixel-to-clear.png` (1920x1080)
  //     FLOW_STEPS.TITLE: Amarante title + see-through 1.5px double-hairline
  //     button `Step into the Domain` over the Southern Flower Field vista.
  // ==========================================================================
  await page.setViewportSize({ width: 1920, height: 1080 });
  const check01 = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.setProfile('desktop');
    w.setTimeOfDay('day');
    w.appFlow.setStep('title');
    w.appFlow.resolvePixelVeil();
    w.post.render(0.016);

    const h1 = document.querySelector('.af-main-title');
    const sub = document.querySelector('.af-subtitle');
    const enterBtn = document.getElementById('app-flow-enter-btn');
    const hudHidden = document.getElementById('sculpted-hud-root')?.classList.contains('is-hidden');
    const btnStyle = enterBtn ? getComputedStyle(enterBtn) : null;

    return {
      step: w.appFlow.getStep(),
      title: h1?.textContent?.trim(),
      subtitle: sub?.textContent?.trim(),
      ctaText: enterBtn?.textContent?.trim(),
      hudHidden: Boolean(hudHidden),
      backdropFilter: btnStyle?.backdropFilter || 'none',
    };
  });
  auditReport.checks.shot01_title = check01;
  await renderFrames(6);
  await page.screenshot({ path: path.join(outDir, '01-title-pixel-to-clear.png') });
  auditReport.screenshots.push('01-title-pixel-to-clear.png');

  // ==========================================================================
  // 02. `02-open-join-domain.png` (1920x1080)
  //     FLOW_STEPS.CREATE_JOIN: Two transparent open-air hairline frames
  //     (`Open a Domain` with `"Rain on warm limestone"` + `Enter` vs `Join a Domain` + `Join`).
  // ==========================================================================
  await page.click('#app-flow-enter-btn');
  await page.waitForTimeout(160);
  const check02 = await page.evaluate(() => {
    const w = window.__WORLD__;
    const af = w.appFlow;
    af.setErrorMessage('');
    const firstChip = document.querySelector('[data-phrase-chip="Rain on warm limestone"]');
    firstChip?.click();
    const phraseInput = document.getElementById('app-flow-phrase-input');
    if (phraseInput) phraseInput.value = '';
    w.post.render(0.016);

    const createTablet = document.getElementById('app-flow-create-tablet');
    const joinTablet = document.getElementById('app-flow-join-tablet');
    return {
      step: af.getStep(),
      activePhrase: document.getElementById('app-flow-active-phrase')?.textContent?.trim(),
      createBtnText: document.getElementById('app-flow-create-btn')?.textContent?.trim(),
      joinBtnText: document.getElementById('app-flow-join-btn')?.textContent?.trim(),
      createRect: createTablet?.getBoundingClientRect(),
      joinRect: joinTablet?.getBoundingClientRect(),
    };
  });
  auditReport.checks.shot02_openJoin = check02;
  await renderFrames(6);
  await page.screenshot({ path: path.join(outDir, '02-open-join-domain.png') });
  auditReport.screenshots.push('02-open-join-domain.png');

  // ==========================================================================
  // 03. `03-flower-lobby-3d-claim.png` (1920x1080)
  //     FLOW_STEPS.FLOWER_LOBBY: Knight & Mage in the wildflowers, Knight claimed
  //     with floating shoulder hairline input (`Your name: Vikas`), partner tag
  //     (`Ishika`) floating above Mage, and borderless bottom phrase
  //     (`Rain on warm limestone` + copy icon).
  // ==========================================================================
  await page.click('#app-flow-create-btn');
  await page.waitForTimeout(200);
  const check03 = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.appFlow.setLobbyState({
      roomPhrase: 'Rain on warm limestone',
      isHost: true,
      localRole: 'Knight',
      hostRole: 'Knight',
      playerName: 'Vikas',
      partnerName: 'Ishika',
      peerConnected: true,
      partnerClaimed: true,
      playerCount: 2,
    });
    const nameInput = document.getElementById('app-flow-name-input');
    if (nameInput) {
      nameInput.value = 'Vikas';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    for (let i = 0; i < 16; i++) {
      w.coopSystem.knight?.update(0.025);
      w.coopSystem.mage?.update(0.025);
    }
    w.post.render(0.016);

    const kBtn = document.getElementById('app-flow-claim-knight')?.getBoundingClientRect();
    const mBtn = document.getElementById('app-flow-claim-mage')?.getBoundingClientRect();
    const bubble = document.getElementById('app-flow-name-bubble')?.getBoundingClientRect();
    const partnerTag = document.getElementById('app-flow-partner-tag')?.getBoundingClientRect();
    const bottomPhrase = document.getElementById('app-flow-lobby-top-bar')?.getBoundingClientRect();

    return {
      step: w.appFlow.getStep(),
      typedName: nameInput?.value,
      partnerTagText: document.getElementById('app-flow-partner-tag')?.textContent?.trim(),
      bottomPhraseText: document.getElementById('app-flow-room-phrase')?.textContent?.trim(),
      kBtn,
      mBtn,
      bubble,
      partnerTag,
      bottomPhrase,
    };
  });
  auditReport.checks.shot03_flowerLobby = check03;
  await renderFrames(6);
  await page.screenshot({ path: path.join(outDir, '03-flower-lobby-3d-claim.png') });
  auditReport.screenshots.push('03-flower-lobby-3d-claim.png');

  // ==========================================================================
  // 04. `04-hud-bare-desktop.png` (1920x1080)
  //     FLOW_STEPS.IN_GAME bare start (`desktop` profile): Top-left borderless
  //     party rows (`Vikas`, `Ishika`), bottom-center HP bar (`220 / 220`),
  //     compact bottom-right Desktop rings (`Attack`, `Dash`, `Jump`),
  //     zero `Lv. 1` badges, zero legacy `#top-bar` clutter.
  // ==========================================================================
  await page.click('#app-flow-start-btn');
  await page.waitForTimeout(200);
  const check04 = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.setProfile('desktop');
    w.setTimeOfDay('day');
    if (w.coopSystem.player.activeHeroId !== 'Knight') {
      w.coopSystem.swapActiveHero();
    }
    w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
    w.sculptedHud.setProgressionState({
      communeDiscovered: false,
      iceUnlocked: false,
      fireUnlocked: false,
      ultimateUnlocked: false,
      unlockedStage: 0,
      stonesSolved: 0,
      activeRole: 'Knight',
      activeElement: 'ice',
    });
    w.sculptedHud.updatePartyStatus({
      activeRole: 'Knight',
      knight: { hp: 220, maxHp: 220, shield: 0 },
      mage: { hp: 90, maxHp: 90, shield: 0 },
      cooldowns: { E: 0, Q: 0, eBuffRemaining: 0 },
    });
    w.damageNumbers?.clear?.();
    w.post.render(0.016);

    const hudText = document.getElementById('sculpted-hud-root')?.innerText || '';
    return {
      step: w.appFlow.getStep(),
      profile: w.sculptedHud.getState().profile,
      primaryName: document.getElementById('sh-name-primary')?.textContent?.trim(),
      partnerName: document.getElementById('sh-name-partner')?.textContent?.trim(),
      vitalityText: document.getElementById('sculpted-vitality-text')?.textContent?.trim(),
      hasLv1Text: /Lv\.?\s*1/i.test(hudText),
      legacyTopBarDisplay: getComputedStyle(document.getElementById('top-bar')).display,
      slotEUnlocked: document.getElementById('sculpted-slot-e')?.classList.contains('is-unlocked'),
      slotTabUnlocked: document.getElementById('sculpted-slot-tab')?.classList.contains('is-unlocked'),
      slotQUnlocked: document.getElementById('sculpted-slot-q')?.classList.contains('is-unlocked'),
      communeUnlocked: document.getElementById('sculpted-commune-wrap')?.classList.contains('is-unlocked'),
    };
  });
  auditReport.checks.shot04_bareDesktop = check04;
  await renderFrames(6);
  await page.screenshot({ path: path.join(outDir, '04-hud-bare-desktop.png') });
  auditReport.screenshots.push('04-hud-bare-desktop.png');

  // ==========================================================================
  // 05. `05-hud-bare-tablet-two-handed.png` (1600x1000)
  //     FLOW_STEPS.IN_GAME bare start (`tablet` profile): Bottom-left floating
  //     movement thumbstick (`left: 44px, bottom: 44px`), bottom-right
  //     `Attack` (`84px`), `Dash` (`54px`), `Jump` (`54px`) see-through rings.
  // ==========================================================================
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(160);
  const check05 = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.setProfile('tablet');
    w.setTimeOfDay('day');
    w.sculptedHud.setPlayerNames({ Knight: 'Vikas', Mage: 'Ishika' });
    w.sculptedHud.setProgressionState({
      communeDiscovered: false,
      iceUnlocked: false,
      fireUnlocked: false,
      ultimateUnlocked: false,
      unlockedStage: 0,
      stonesSolved: 0,
      activeRole: 'Knight',
      activeElement: 'ice',
    });
    w.sculptedHud.resetJoystick();
    w.post.render(0.016);

    const joyRect = document.getElementById('sculpted-joystick-zone')?.getBoundingClientRect();
    const atkRect = document.getElementById('sculpted-attack-btn')?.getBoundingClientRect();
    const dashRect = document.getElementById('sculpted-dash-btn')?.getBoundingClientRect();
    const jumpRect = document.getElementById('sculpted-jump-btn')?.getBoundingClientRect();

    return {
      profile: w.sculptedHud.getState().profile,
      joyRect,
      atkRect,
      dashRect,
      jumpRect,
    };
  });
  auditReport.checks.shot05_bareTablet = check05;
  await renderFrames(6);
  await page.screenshot({ path: path.join(outDir, '05-hud-bare-tablet-two-handed.png') });
  auditReport.screenshots.push('05-hud-bare-tablet-two-handed.png');

  // ==========================================================================
  // 06. `06-stone-3s-gaze-commune.png` (1920x1080)
  //     Approaching a Sacred Stone (`stone_plaza` `(0, -14)`) within `<= 4.5m`:
  //     over-the-shoulder camera framing showing the borderless 3D calligraphy
  //     verse + lotus gaze progress ring etched directly onto the 3D stone face,
  //     and `Commune [R]` materialized in the HUD (zero `"✿ Read"` pill, zero 2D modal).
  // ==========================================================================
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(160);
  const check06 = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.setProfile('desktop');
    w.setTimeOfDay('day');
    // Place Knight within <= 4.5m of stone_plaza (0, -14) on the left shoulder side so the stone is 100% unobstructed
    w.coopSystem.teleportLeaderAndPartner(-0.92, -11.45, Math.PI - 0.12);
    if (w.coopSystem.heroStates?.Mage) {
      const mY = w.terrainKit?.walkableHeightAt
        ? w.terrainKit.walkableHeightAt(-2.35, -10.4)
        : w.player.y;
      w.coopSystem.heroStates.Mage.x = -2.35;
      w.coopSystem.heroStates.Mage.z = -10.4;
      w.coopSystem.heroStates.Mage.y = mY;
      w.coopSystem.heroStates.Mage.yaw = Math.PI - 0.22;
      w.coopSystem.mage?.group?.position?.set(-2.35, mY, -10.4);
      if (w.coopSystem.mage?.group) w.coopSystem.mage.group.rotation.y = Math.PI - 0.22;
    }
    w.setCameraOrbit(Math.PI, 0.05, 4.4);

    // Simulate 3.0s of continuous gaze at stone_plaza
    w.stoneGazeState.activeStoneId = 'stone_plaza';
    w.stoneGazeState.shoulderBlend = 1.0;
    w.stoneGazeState.stones.stone_plaza.gazeElapsed = 3.0;
    w.stoneGazeState.stones.stone_plaza.unlocked = true;
    w.stoneDecals.entries.stone_plaza?.redraw(1.0, true);

    w.sculptedHud.setProgressionState({
      communeDiscovered: true,
      iceUnlocked: false,
      fireUnlocked: false,
      ultimateUnlocked: false,
      unlockedStage: 0,
      stonesSolved: 0,
    });
    w.post.render(0.016);

    const readPill = document.getElementById('stele-interact-prompt');
    const oldModal = document.getElementById('altar-stele-modal');
    return {
      activeStoneId: w.stoneGazeState.activeStoneId,
      shoulderBlend: w.stoneGazeState.shoulderBlend,
      gazeElapsed: w.stoneGazeState.stones.stone_plaza.gazeElapsed,
      stoneUnlocked: w.stoneGazeState.stones.stone_plaza.unlocked,
      communeBtnVisible:
        document.getElementById('sculpted-commune-wrap')?.classList.contains('is-unlocked') &&
        getComputedStyle(document.getElementById('sculpted-commune-btn')).display !== 'none',
      readPillHidden: !readPill || getComputedStyle(readPill).display === 'none',
      modalHidden: !oldModal || getComputedStyle(oldModal).display === 'none',
    };
  });
  auditReport.checks.shot06_stoneGazeCommune = check06;
  await renderFrames(6);
  await page.screenshot({ path: path.join(outDir, '06-stone-3s-gaze-commune.png') });
  auditReport.screenshots.push('06-stone-3s-gaze-commune.png');

  // ==========================================================================
  // 07. `07-hud-tablet-full-fan-arc-day.png` (1600x1000)
  //     `tablet` profile in Sunlit Day (`data-env-polarity="day"`) with all powers
  //     unlocked (`iceUnlocked: true, fireUnlocked: true, ultimateUnlocked: true,
  //     communeDiscovered: true`): Left thumbstick + Right-hand 2-ring concentric
  //     fan arc (`Attack`, `Dash`, `Jump`, `[Tab]` with `"Tab to switch"`, `[E]`,
  //     `[Q]`, `Commune [R]`) + 3D floating Genshin damage numbers (`148`, `296 ✦`).
  // ==========================================================================
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(160);
  const check07 = await page.evaluate(() => {
    const w = window.__WORLD__;
    // Reset stone gaze and move to clean cobblestone plaza combat view in Sunlit Day
    w.stoneGazeState.activeStoneId = null;
    w.stoneGazeState.shoulderBlend = 0;
    w.setProfile('tablet');
    w.setTimeOfDay('day');
    w.coopSystem.teleportLeaderAndPartner(-0.65, 12.2, Math.PI + 0.08);
    w.setCameraOrbit(Math.PI + 0.08, 0.12, 7.8);

    // Position a visible Skeleton Warrior enemy in front of the Knight & Mage for combat context
    const skelSlot = w.enemyManager?.pool?.[0];
    if (skelSlot?.char?.group) {
      const ey = w.terrainKit?.walkableHeightAt ? w.terrainKit.walkableHeightAt(0.15, 8.2) : 0;
      skelSlot.char.group.visible = true;
      skelSlot.char.group.position.set(0.15, ey, 8.2);
      skelSlot.char.group.rotation.y = 0.12;
      skelSlot.char.poseAt?.('hit_A', 0.22);
    }

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
    // Ensure "Tab to switch" caption is visible
    const tabCaption = document.getElementById('sculpted-tab-caption');
    tabCaption?.classList.remove('is-dismissed');

    w.sculptedHud.updatePartyStatus({
      activeRole: 'Knight',
      activeElement: 'ice',
      knight: { hp: 220, maxHp: 220, shield: 45 },
      mage: { hp: 90, maxHp: 90, shield: 30 },
      cooldowns: { E: 0, Q: 0, eBuffRemaining: 11.2 },
    });

    // Pull left joystick slightly forward-right to show active two-handed steering
    const puck = document.getElementById('sh-joy-puck');
    const ring = document.getElementById('sh-joy-ring');
    if (puck) puck.style.transform = 'translate3d(18px, -26px, 0px)';
    if (ring) ring.classList.add('is-sprinting');

    // Spawn crisp 3D floating Genshin damage numbers (`148`, `296 ✦`) over the enemy
    w.damageNumbers.clear();
    w.damageNumbers.spawnDamageNumber({
      amount: 148,
      element: 'ice',
      isCrit: false,
      screenPos: { x: 760, y: 390 },
      duration: 10.0,
    });
    w.damageNumbers.spawnDamageNumber({
      amount: 296,
      element: 'lightning',
      isCrit: true,
      screenPos: { x: 870, y: 335 },
      duration: 10.0,
    });
    w.damageNumbers.update(0.16, w.camera);
    w.post.render(0.016);

    // Measure all 7 right-hand fan arc buttons and compute minimum clear finger gap
    const ids = [
      'sculpted-attack-btn',
      'sculpted-dash-btn',
      'sculpted-jump-btn',
      'sculpted-slot-tab',
      'sculpted-slot-e',
      'sculpted-slot-q',
      'sculpted-commune-btn',
    ];
    const circles = ids.map((id) => {
      const r = document.getElementById(id)?.getBoundingClientRect();
      return {
        id,
        cx: r ? r.left + r.width * 0.5 : 0,
        cy: r ? r.top + r.height * 0.5 : 0,
        radius: r ? r.width * 0.5 : 0,
        w: r ? r.width : 0,
        h: r ? r.height : 0,
      };
    });
    let minClearGap = Infinity;
    let minPair = null;
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i];
        const b = circles[j];
        const centerDist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        const gap = centerDist - a.radius - b.radius;
        if (gap < minClearGap) {
          minClearGap = gap;
          minPair = `${a.id} <-> ${b.id}`;
        }
      }
    }

    return {
      envPolarity: document.documentElement.dataset.envPolarity,
      minClearGapPx: Number(minClearGap.toFixed(2)),
      minPair,
      circles,
      activeDamageNumbers: w.damageNumbers.getActiveCount(),
      tabCaptionVisible:
        tabCaption && getComputedStyle(tabCaption).display !== 'none',
    };
  });
  auditReport.checks.shot07_tabletFullArcDay = check07;
  await renderFrames(4, 0.016);
  await page.screenshot({ path: path.join(outDir, '07-hud-tablet-full-fan-arc-day.png') });
  auditReport.screenshots.push('07-hud-tablet-full-fan-arc-day.png');

  // ==========================================================================
  // 08. `08-hud-tablet-golden-hour-polarity.png` (1600x1000)
  //     Same HUD in Golden Hour (`data-env-polarity="golden"`, champagne-apricot
  //     `#ffeed6` hairlines + plum-wine contour shadow) with `[E]` toggled to
  //     `Fire` (`Hinokami Sunfire` / `Cinder Fall`).
  // ==========================================================================
  const check08 = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.setTimeOfDay('evening');
    w.sculptedHud.setElement('fire');
    w.sculptedHud.updatePartyStatus({
      activeRole: 'Knight',
      activeElement: 'fire',
      knight: { hp: 220, maxHp: 220, shield: 60 },
      mage: { hp: 90, maxHp: 90, shield: 40 },
      cooldowns: { E: 0, Q: 0, eBuffRemaining: 12.4 },
    });

    w.damageNumbers.clear();
    w.damageNumbers.spawnDamageNumber({
      amount: 184,
      element: 'fire',
      isCrit: false,
      screenPos: { x: 760, y: 390 },
      duration: 10.0,
    });
    w.damageNumbers.spawnDamageNumber({
      amount: 342,
      element: 'fire',
      isCrit: true,
      label: 'Solar Flare',
      screenPos: { x: 875, y: 335 },
      duration: 10.0,
    });
    w.damageNumbers.update(0.16, w.camera);
    w.post.render(0.016);

    const hudStyle = getComputedStyle(document.documentElement);
    return {
      envPolarity: document.documentElement.dataset.envPolarity,
      hudInk: hudStyle.getPropertyValue('--hud-ink').trim(),
      hudAccent: hudStyle.getPropertyValue('--hud-accent').trim(),
      slotEElement: document.getElementById('sculpted-slot-e')?.dataset?.element,
    };
  });
  auditReport.checks.shot08_tabletGoldenHour = check08;
  await renderFrames(4, 0.016);
  await page.screenshot({ path: path.join(outDir, '08-hud-tablet-golden-hour-polarity.png') });
  auditReport.screenshots.push('08-hud-tablet-golden-hour-polarity.png');

  // ==========================================================================
  // 09. `09-hud-tablet-night-eclipse-polarity.png` (1600x1000)
  //     Same HUD in Starlit Night / Crimson Eclipse (`data-env-polarity="eclipse"`,
  //     moonlight silver-pearl + Amaranth Crimson `#e11d48` hairlines) while
  //     `Commune [R]` is actively listening (`00:24` + crimson wave bars +
  //     3D Crimson Rose Ring at feet).
  // ==========================================================================
  const check09 = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.damageNumbers.clear();
    const skelSlot = w.enemyManager?.pool?.[0];
    if (skelSlot?.char?.group) skelSlot.char.group.visible = false;

    w.setTimeOfDay('night');
    w.sculptedHud.setCommuneState({
      listening: true,
      elapsedSeconds: 6,
      maxSeconds: 30,
    });
    w.sky.setEclipseState?.({
      weight: 1.0,
      compression: 1.0,
      windTimeScale: 0.35,
      camera: w.camera,
    });
    w.communeClient.roseRingTimer.start({
      x: w.player.x,
      y: w.player.y,
      z: w.player.z,
    });
    w.communeClient.roseRingTimer.setElapsed(6.0, {
      x: w.player.x,
      y: w.player.y,
      z: w.player.z,
    });
    w.post.render(0.016);

    const hudStyle = getComputedStyle(document.documentElement);
    return {
      envPolarity: document.documentElement.dataset.envPolarity,
      hudInk: hudStyle.getPropertyValue('--hud-ink').trim(),
      hudAccent: hudStyle.getPropertyValue('--hud-accent').trim(),
      timerText: document.getElementById('sculpted-commune-timer')?.textContent?.trim(),
      listeningActive: document
        .getElementById('sculpted-commune-wrap')
        ?.classList.contains('is-listening'),
      roseRingState: w.communeClient.roseRingTimer.getVisualState(),
    };
  });
  auditReport.checks.shot09_tabletNightEclipse = check09;
  await renderFrames(4, 0.016);
  await page.screenshot({ path: path.join(outDir, '09-hud-tablet-night-eclipse-polarity.png') });
  auditReport.screenshots.push('09-hud-tablet-night-eclipse-polarity.png');

  // Stop commune listening & rose ring before shot 10
  await page.evaluate(() => {
    const w = window.__WORLD__;
    w.sculptedHud.setCommuneState({ listening: false, elapsedSeconds: 0 });
    w.sculptedHud.setEnvironmentPolarity(null);
    w.communeClient.roseRingTimer.stop();
    w.sky.setEclipseState?.({ weight: 0.0, compression: 0.0, windTimeScale: 1.0, camera: w.camera });
  });

  // ==========================================================================
  // 10. `10-pause-sky-atmosphere.png` (1920x1080)
  //     Minimal transparent hairline Pause popover showing `Morning`, `Golden Hour`,
  //     `Twilight` (verified staying on `Twilight` when clicked!), `Starlit Night`,
  //     `Auto`, and `Resume`.
  // ==========================================================================
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(160);
  await page.evaluate(() => {
    const w = window.__WORLD__;
    w.setProfile('desktop');
    w.sculptedHud.openPauseModal();
  });
  await page.waitForTimeout(120);
  await page.click('[data-tod-choice="twilight"]');
  await page.waitForTimeout(120);

  const check10 = await page.evaluate(() => {
    const w = window.__WORLD__;
    w.post.render(0.016);
    const selectedTod = document
      .querySelector('#sculpted-tod-group .sh-choice-pill.is-selected')
      ?.getAttribute('data-tod-choice');
    const twilightPressed = document
      .querySelector('[data-tod-choice="twilight"]')
      ?.getAttribute('aria-pressed');
    const modalOpen = document
      .getElementById('sculpted-pause-modal')
      ?.classList.contains('is-open');

    return {
      modalOpen: Boolean(modalOpen),
      selectedTodAfterClickTwilight: selectedTod,
      twilightAriaPressed: twilightPressed,
      skyMode: w.sky.state.mode,
      skyT: Number(w.sky.state.t.toFixed(3)),
      envPolarity: document.documentElement.dataset.envPolarity,
    };
  });
  auditReport.checks.shot10_pauseSkyAtmosphere = check10;
  await renderFrames(6);
  await page.screenshot({ path: path.join(outDir, '10-pause-sky-atmosphere.png') });
  auditReport.screenshots.push('10-pause-sky-atmosphere.png');

  fs.writeFileSync(
    path.join(outDir, 'audit-telemetry.json'),
    JSON.stringify(auditReport, null, 2),
    'utf8'
  );
  console.log(
    `Amarante UI Audit complete: ${auditReport.screenshots.length}/10 screenshots saved to ${outDir} (consoleErrors=${consoleErrors.length}, pageErrors=${pageErrors.length}, failedRequests=${failedRequests.length})`
  );
  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    console.error('Console/Page Errors:', { consoleErrors, pageErrors });
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.closeAllConnections?.();
  server.close();
  process.exit(process.exitCode || 0);
}
