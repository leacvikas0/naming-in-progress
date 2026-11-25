// ============================================================================
// world/tools/test-coop-live-2p.mjs
//
// Empirical 2-Browser Playwright Co-Op + Network Impairment Verification Harness:
// - Spins up `serve.mjs` on an ephemeral port + a TCP/WebSocket Latency & Jitter
//   Impairment Proxy (`50ms RTT + 15ms jitter` on `/api/room/*/websocket`)
// - Launches two real headless Chrome browsers:
//   * Browser A (Host): Desktop `1600x900` (`Knight`)
//   * Browser B (Guest): Tablet `1440x960` (`hasTouch: true`, `Mage`)
// - Empirically asserts end-to-end:
//   1. Solo Mode Dev Override Check: launching Solo mode (`Test Solo` / solo Enter
//      without `?dev=1`) automatically unlocks Stage 3 (`unlockedStage === 3`,
//      `Knight.qEnergy === 100`, `Mage.qEnergy === 160`).
//   2. Lobby Ceremony: Host creates room phrase -> Guest joins via `?room=` ->
//      both type player names (`Vikas` & `Ishika`) & claim `Knight`/`Mage` ->
//      both screens render partner's custom name & hero claim -> Guest clicking
//      Enter alone waits for Host -> Host clicking Enter transitions BOTH browsers
//      into `IN_GAME` within `< 350ms` of each other.
//   3. Velocity Dead-Reckoning & `[Tab]` / Portrait Guard: move Knight on Browser A
//      and verify Browser B's Knight position converges smoothly (`< 0.35m` error);
//      press `[Tab]` on Browser B in 2P co-op and verify it NEVER swaps control to
//      Knight (and toggles `Ice <-> Fire` element once Stage 2 is unlocked); click
//      partner portrait on `sculptedHud` and verify `activeRole` does not desync.
//   4. Host-Authoritative Combat & Favor-the-Attacker Hit Reg (Zero Double Damage):
//      verify both browsers see identical active enemy `instanceId`s and positions
//      (`< 0.5m` drift); have Guest Mage damage an enemy and verify `0ms` local hit
//      feedback + Host enemy HP drops EXACTLY ONCE (no double damage!) + recycled/
//      stale `spawnGen` or duplicate `hitId` is rejected.
//   5. Mid-Run Disconnect & Reconnect Recovery: simulate a `1.2s` WebSocket
//      disconnect on Browser B mid-expedition -> verify Host activates Wingman AI
//      without throwing -> Browser B reconnects and restores `expeditionStarted`,
//      `stonesSolvedMask`, and hero control (`Mage`).
//   6. Zero Console/Page Errors across both browsers.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';

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
      // try next
    }
  }
  throw new Error('playwright-core not found');
}

/**
 * Starts a TCP proxy in front of `targetPort` that pipes HTTP static asset
 * requests with 0ms delay (for fast GLB boot) and applies `baseRttMs` + `jitterMs`
 * (`25ms ± 7.5ms` each direction = `50ms RTT + 15ms jitter`) with strict FIFO
 * ordering to all `/api/room/.../websocket` connections.
 */
function startImpairmentProxy(targetPort, { baseRttMs = 50, jitterMs = 15 } = {}) {
  const activeSockets = new Set();
  const wsSockets = [];
  let wsChunksDelayed = 0;
  let impairmentEnabled = true;

  function createOrderedDelayPipe(src, dst, isImpairedFn) {
    const queue = [];
    let drainTimer = null;
    let lastScheduledTime = 0;

    function scheduleDrain() {
      if (drainTimer !== null || queue.length === 0) return;
      const now = Date.now();
      const waitMs = Math.max(1, queue[0].fireAt - now);
      drainTimer = setTimeout(() => {
        drainTimer = null;
        const curNow = Date.now();
        while (queue.length > 0 && queue[0].fireAt <= curNow) {
          const item = queue.shift();
          if (!dst.destroyed) {
            try {
              dst.write(item.buf);
            } catch {
              // ignore closed socket
            }
          }
        }
        if (queue.length > 0) {
          scheduleDrain();
        }
      }, waitMs);
    }

    src.on('data', (chunk) => {
      if ((!isImpairedFn() || !impairmentEnabled) && queue.length === 0) {
        if (!dst.destroyed) dst.write(chunk);
        return;
      }
      wsChunksDelayed++;
      const now = Date.now();
      const oneWayMs =
        isImpairedFn() && impairmentEnabled
          ? Math.max(1, Math.round(baseRttMs * 0.5 + (Math.random() - 0.5) * jitterMs))
          : 1;
      const fireAt = Math.max(now + oneWayMs, lastScheduledTime);
      lastScheduledTime = fireAt;
      queue.push({
        buf: Buffer.from(chunk),
        fireAt,
      });
      scheduleDrain();
    });

    const cleanup = () => {
      if (drainTimer !== null) {
        clearTimeout(drainTimer);
        drainTimer = null;
      }
      queue.length = 0;
    };
    src.on('close', cleanup);
    src.on('error', cleanup);
    dst.on('close', cleanup);
    dst.on('error', cleanup);
  }

  const proxyServer = net.createServer((clientSocket) => {
    const upstreamSocket = net.connect(targetPort, '127.0.0.1');
    activeSockets.add(clientSocket);
    activeSockets.add(upstreamSocket);

    let isWebSocketConn = false;
    const pair = { clientSocket, upstreamSocket };

    clientSocket.on('data', (chunk) => {
      if (!isWebSocketConn) {
        const headStr = chunk.subarray(0, 512).toString('utf8');
        if (
          /upgrade:\s*websocket/i.test(headStr) ||
          /GET\s+\/api\/room\/[^\s]+\/websocket/i.test(headStr)
        ) {
          isWebSocketConn = true;
          wsSockets.push(pair);
          clientSocket.on('close', () => {
            const idx = wsSockets.indexOf(pair);
            if (idx >= 0) wsSockets.splice(idx, 1);
          });
        }
      }
    });

    createOrderedDelayPipe(clientSocket, upstreamSocket, () => isWebSocketConn);
    createOrderedDelayPipe(upstreamSocket, clientSocket, () => isWebSocketConn);

    clientSocket.on('end', () => upstreamSocket.end());
    upstreamSocket.on('end', () => clientSocket.end());
    clientSocket.on('error', () => upstreamSocket.destroy());
    upstreamSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('close', () => {
      activeSockets.delete(clientSocket);
      upstreamSocket.destroy();
    });
    upstreamSocket.on('close', () => {
      activeSockets.delete(upstreamSocket);
      clientSocket.destroy();
    });
  });

  return new Promise((resolve, reject) => {
    proxyServer.on('error', reject);
    proxyServer.listen(0, '127.0.0.1', () => {
      const addr = proxyServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        getStats: () => ({
          wsChunksDelayed,
          activeWsCount: wsSockets.length,
        }),
        setImpairmentEnabled(enabled) {
          impairmentEnabled = Boolean(enabled);
        },
        close() {
          for (const s of activeSockets) {
            try {
              s.destroy();
            } catch {
              // ignore
            }
          }
          activeSockets.clear();
          wsSockets.length = 0;
          return new Promise((res) => proxyServer.close(() => res()));
        },
      });
    });
  });
}

async function waitForWorldReady(page, timeout = 60000) {
  await page.waitForFunction(
    () =>
      Boolean(
        window.__WORLD__ &&
          window.__WORLD__.ready &&
          window.__WORLD__.coopSystem &&
          window.__WORLD__.coopClient?.getState?.()?.connected
      ),
    { timeout }
  );
}

async function main() {
  process.env.HARU_COMMUNE_OFFLINE = '1';
  console.log('=== Amarante 2-Browser Live Co-Op & Network Impairment Verification ===');

  const srv = await startServer(0);
  srv.server.keepAliveTimeout = 60000;
  srv.server.headersTimeout = 65000;
  const proxy = await startImpairmentProxy(srv.port, { baseRttMs: 50, jitterMs: 15 });
  console.log(
    `[coop-2p] Origin server at ${srv.url} | Impairment Proxy (50ms RTT ± 15ms jitter) at ${proxy.url}`
  );

  const chromium = await loadChromium();
  const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const useGpu = process.platform === 'win32' && !process.env.SWIFTSHADER;
  const commonArgs = [
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-ipc-flooding-protection',
  ];
  const launchArgs = useGpu
    ? ['--use-angle=d3d11', '--enable-webgl', ...commonArgs]
    : [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        ...commonArgs,
      ];
  const executablePath =
    process.env.CHROME ||
    (fs.existsSync(winChrome) ? winChrome : '/usr/local/bin/google-chrome');

  const browserA = await chromium.launch({ executablePath, args: launchArgs });
  const browserB = await chromium.launch({ executablePath, args: launchArgs });

  const consoleErrorsA = [];
  const pageErrorsA = [];
  const consoleErrorsB = [];
  const pageErrorsB = [];

  const isBenignError = (txt) => /favicon\.ico/i.test(String(txt || ''));

  try {
    // =========================================================================
    // 1. Solo Mode Dev Override Check (Launching Solo unlocks Stage 3 + Full Q)
    // =========================================================================
    {
      const soloCtx = await browserA.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const soloPage = await soloCtx.newPage();
      soloPage.on('pageerror', (err) => {
        const msg = err.message || String(err);
        if (!isBenignError(msg)) pageErrorsA.push(`[solo] ${msg}`);
      });
      soloPage.on('console', (msg) => {
        if (msg.type() === 'error' && !isBenignError(msg.text())) {
          consoleErrorsA.push(`[solo] ${msg.text()}`);
        }
      });

      await soloPage.goto(`${proxy.url}/world/index.html?room=SOLO-CHECK-ROOM`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await waitForWorldReady(soloPage);

      const soloResult = await soloPage.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.resolvePixelVeil();
        document.querySelector('#app-flow-enter-btn')?.click();
        document.querySelector('#app-flow-create-btn')?.click();
        // Click regular Start/Enter in Solo mode (without ?dev=1 in URL) -> Stage 0 parity
        document.querySelector('#app-flow-start-btn')?.click();
        const prog = w.coopClient.getProgressionState();
        const kHero = w.campaignLoop.combatHeroes.Knight;
        const mHero = w.campaignLoop.combatHeroes.Mage;
        return {
          step: w.appFlow.getStep(),
          unlockedStage: prog.unlockedStage,
          stonesSolvedMask: prog.stonesSolvedMask,
          iceUnlocked: prog.iceUnlocked,
          fireUnlocked: prog.fireUnlocked,
          ultimateUnlocked: prog.ultimateUnlocked,
          knightQ: kHero.qEnergy,
          mageQ: mHero.qEnergy,
        };
      });

      assert.equal(soloResult.step, 'in_game', 'Solo launch must transition immediately to in_game');
      assert.equal(
        soloResult.unlockedStage,
        0,
        'Regular Solo launch without ?dev=1 must start cleanly at Stage 0 (same as 2P Co-Op)'
      );
      assert.equal(soloResult.stonesSolvedMask, 0);
      assert.equal(soloResult.iceUnlocked, false);
      assert.equal(soloResult.fireUnlocked, false);
      assert.equal(soloResult.ultimateUnlocked, false);
      assert.equal(soloResult.knightQ, 0, 'Regular Solo launch must start Knight.qEnergy === 0');
      assert.equal(soloResult.mageQ, 0, 'Regular Solo launch must start Mage.qEnergy === 0');

      await soloPage.waitForFunction(
        () => Boolean(window.__WORLD__?.coopClient?.getState?.()?.connected),
        null,
        { timeout: 5000 }
      );

      // Explicit #app-flow-solo-test-btn check -> Stage 3 abilities unlocked with stonesSolvedMask === 0
      const testSoloPage = await soloCtx.newPage();
      await testSoloPage.goto(`${proxy.url}/world/index.html?flow=1`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await waitForWorldReady(testSoloPage);
      const devSoloRes = await testSoloPage.evaluate(() => {
        const w = window.__WORLD__;
        w.appFlow.resolvePixelVeil();
        document.querySelector('#app-flow-enter-btn')?.click();
        document.querySelector('#app-flow-create-btn')?.click();
        document.querySelector('#app-flow-solo-test-btn')?.click();
        const prog = w.coopClient.getProgressionState();
        return {
          step: w.appFlow.getStep(),
          unlockedStage: prog.unlockedStage,
          stonesSolvedMask: prog.stonesSolvedMask,
          iceUnlocked: prog.iceUnlocked,
          fireUnlocked: prog.fireUnlocked,
          ultimateUnlocked: prog.ultimateUnlocked,
          knightQ: w.campaignLoop.combatHeroes.Knight.qEnergy,
          mageQ: w.campaignLoop.combatHeroes.Mage.qEnergy,
        };
      });
      assert.equal(devSoloRes.step, 'in_game');
      assert.equal(devSoloRes.unlockedStage, 3, 'Test Solo button must unlock Stage 3 test abilities');
      assert.equal(devSoloRes.stonesSolvedMask, 0, 'Test Solo button must keep stonesSolvedMask === 0');
      assert.equal(devSoloRes.iceUnlocked, true);
      assert.equal(devSoloRes.fireUnlocked, true);
      assert.equal(devSoloRes.ultimateUnlocked, true);
      assert.equal(devSoloRes.knightQ, 100);
      assert.equal(devSoloRes.mageQ, 160);

      await soloCtx.close();
      console.log('✓ 1. Solo Mode Stage 0 Parity + Test Solo Stage 3 Override verified');
    }

    // =========================================================================
    // 2. Launch Browser A (Host Desktop 1600x900) & Browser B (Guest Tablet 1440x960)
    // =========================================================================
    const contextA = await browserA.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
      hasTouch: false,
    });
    const contextB = await browserB.newContext({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Xiaomi Pad 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    });

    // Track Browser B's active WebSocket instances so we can trigger a clean 1.2s mid-run disconnect
    await contextB.addInitScript(() => {
      const OrigWS = window.WebSocket;
      window.__GUEST_WS_LIST__ = [];
      const WrappedWS = function (url, protocols) {
        const ws = protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
        if (String(url).includes('/api/room/')) {
          window.__GUEST_WS_LIST__.push(ws);
        }
        return ws;
      };
      WrappedWS.prototype = OrigWS.prototype;
      Object.defineProperties(WrappedWS, Object.getOwnPropertyDescriptors(OrigWS));
      window.WebSocket = WrappedWS;
    });

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    pageA.on('pageerror', (err) => {
      const msg = err.message || String(err);
      if (!isBenignError(msg)) pageErrorsA.push(msg);
    });
    pageA.on('console', (msg) => {
      if (msg.type() === 'error' && !isBenignError(msg.text())) {
        consoleErrorsA.push(msg.text());
      }
    });
    pageB.on('pageerror', (err) => {
      const msg = err.message || String(err);
      if (!isBenignError(msg)) pageErrorsB.push(msg);
    });
    pageB.on('console', (msg) => {
      if (msg.type() === 'error' && !isBenignError(msg.text())) {
        consoleErrorsB.push(msg.text());
      }
    });

    const roomPhrase = 'Two lanterns under wisteria';
    const roomCode = 'TWO-LANTERNS-UNDER-WISTERIA';

    // Step 2a: Host (Browser A) boots and creates the room phrase FIRST
    await pageA.goto(`${proxy.url}/world/index.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await waitForWorldReady(pageA);

    // Host (Browser A) creates the room with phrase "Two lanterns under wisteria"
    await pageA.evaluate((phrase) => {
      const w = window.__WORLD__;
      w.appFlow.resolvePixelVeil();
      document.querySelector('#app-flow-enter-btn')?.click();
      const chip = document.querySelector(`[data-phrase-chip="${phrase}"]`);
      if (chip) chip.click();
      const input = document.querySelector('#app-flow-phrase-input');
      if (input) input.value = phrase;
      document.querySelector('#app-flow-create-btn')?.click();
    }, roomPhrase);

    // Wait for Host to connect to room WS before Guest joins so Host is deterministically seated first
    await pageA.waitForFunction(
      (code) => {
        const st = window.__WORLD__?.coopClient?.getState?.();
        return st && st.connected && st.room === code && st.isHost === true;
      },
      roomCode,
      { timeout: 10000 }
    );

    // Step 2b: Guest (Browser B) opens the invite link `?room=TWO-LANTERNS-UNDER-WISTERIA` and joins
    await pageB.goto(`${proxy.url}/world/index.html?room=${roomCode}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await waitForWorldReady(pageB);

    await pageB.evaluate((code) => {
      const w = window.__WORLD__;
      w.appFlow.resolvePixelVeil();
      document.querySelector('#app-flow-enter-btn')?.click();
      const input = document.querySelector('#app-flow-phrase-input');
      if (input && !input.value) input.value = code;
      document.querySelector('#app-flow-join-btn')?.click();
    }, roomCode);

    // Wait for both browsers to reach FLOWER_LOBBY and pair (`peerConnected === true`)
    await Promise.all([
      pageA.waitForFunction(
        () =>
          window.__WORLD__?.appFlow?.getStep?.() === 'flower_lobby' &&
          window.__WORLD__?.coopClient?.getState?.()?.peerConnected === true,
        null,
        { timeout: 10000 }
      ),
      pageB.waitForFunction(
        () =>
          window.__WORLD__?.appFlow?.getStep?.() === 'flower_lobby' &&
          window.__WORLD__?.coopClient?.getState?.()?.peerConnected === true,
        null,
        { timeout: 10000 }
      ),
    ]);

    // Both type player names & claim Knight (Host) / Mage (Guest)
    await pageA.evaluate(() => {
      const nameIn = document.querySelector('#app-flow-name-input');
      if (nameIn) {
        nameIn.value = 'Vikas';
        nameIn.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.querySelector('#app-flow-claim-knight')?.click();
    });

    await pageB.evaluate(() => {
      const nameIn = document.querySelector('#app-flow-name-input');
      if (nameIn) {
        nameIn.value = 'Ishika';
        nameIn.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.querySelector('#app-flow-claim-mage')?.click();
    });

    // Verify both screens render partner's custom name & hero claim
    await Promise.all([
      pageA.waitForFunction(
        () => {
          const st = window.__WORLD__?.appFlow?.getState?.();
          const partnerTag = document.querySelector('#app-flow-partner-tag')?.textContent || '';
          const mageBtn = document.querySelector('#app-flow-claim-mage');
          return (
            st?.partnerName === 'Ishika' &&
            partnerTag.includes('Ishika') &&
            Boolean(mageBtn?.classList.contains('is-partner-claimed'))
          );
        },
        null,
        { timeout: 8000 }
      ),
      pageB.waitForFunction(
        () => {
          const st = window.__WORLD__?.appFlow?.getState?.();
          const partnerTag = document.querySelector('#app-flow-partner-tag')?.textContent || '';
          const knightBtn = document.querySelector('#app-flow-claim-knight');
          return (
            st?.partnerName === 'Vikas' &&
            partnerTag.includes('Vikas') &&
            Boolean(knightBtn?.classList.contains('is-partner-claimed'))
          );
        },
        null,
        { timeout: 8000 }
      ),
    ]);

    // Guest clicking Enter alone must wait for Host (must NOT transition into IN_GAME yet!)
    await pageB.evaluate(() => {
      window.__IN_GAME_AT__ = null;
      const origSetStep = window.__WORLD__.appFlow.setStep;
      // Record timestamp when IN_GAME is entered via a MutationObserver on #app-flow-root[data-step]
      const rootEl = document.querySelector('#app-flow-root');
      if (rootEl) {
        const obs = new MutationObserver(() => {
          if (rootEl.dataset.step === 'in_game' && !window.__IN_GAME_AT__) {
            window.__IN_GAME_AT__ = Date.now();
          }
        });
        obs.observe(rootEl, { attributes: true, attributeFilter: ['data-step'] });
      }
      document.querySelector('#app-flow-start-btn')?.click();
    });

    await pageA.evaluate(() => {
      window.__IN_GAME_AT__ = null;
      const rootEl = document.querySelector('#app-flow-root');
      if (rootEl) {
        const obs = new MutationObserver(() => {
          if (rootEl.dataset.step === 'in_game' && !window.__IN_GAME_AT__) {
            window.__IN_GAME_AT__ = Date.now();
          }
        });
        obs.observe(rootEl, { attributes: true, attributeFilter: ['data-step'] });
      }
    });

    await pageB.waitForTimeout(350);
    const stepBAfterGuestClickAlone = await pageB.evaluate(() =>
      window.__WORLD__.appFlow.getStep()
    );
    const stepAAfterGuestClickAlone = await pageA.evaluate(() =>
      window.__WORLD__.appFlow.getStep()
    );
    assert.equal(
      stepBAfterGuestClickAlone,
      'flower_lobby',
      'Guest clicking Enter alone must wait for Host in flower_lobby'
    );
    assert.equal(
      stepAAfterGuestClickAlone,
      'flower_lobby',
      'Host must remain in flower_lobby until Host also clicks Enter'
    );

    // Wait until Host receives Guest's ready/claimed state before clicking Enter
    await pageA.waitForFunction(
      () => {
        const st = window.__WORLD__?.appFlow?.getState?.();
        const cSt = window.__WORLD__?.coopClient?.getState?.();
        return Boolean(st?.partnerClaimed || st?.guestReady || cSt?.peerReady);
      },
      null,
      { timeout: 6000 }
    );

    // Now Host clicks Enter -> BOTH browsers transition into IN_GAME within < 350ms of each other!
    const clickTime = Date.now();
    await pageA.evaluate(() => {
      document.querySelector('#app-flow-start-btn')?.click();
    });

    await Promise.all([
      pageA.waitForFunction(
        () => window.__WORLD__?.appFlow?.getStep?.() === 'in_game',
        null,
        { timeout: 6000 }
      ),
      pageB.waitForFunction(
        () => window.__WORLD__?.appFlow?.getStep?.() === 'in_game',
        null,
        { timeout: 6000 }
      ),
    ]);

    const [tHostInGame, tGuestInGame, roleA, roleB] = await Promise.all([
      pageA.evaluate(() => window.__IN_GAME_AT__ || Date.now()),
      pageB.evaluate(() => window.__IN_GAME_AT__ || Date.now()),
      pageA.evaluate(() => window.__WORLD__.player.activeHeroId),
      pageB.evaluate(() => window.__WORLD__.player.activeHeroId),
    ]);
    const transitionSkewMs = Math.abs(tGuestInGame - tHostInGame);
    assert.equal(roleA, 'Knight', 'Browser A must control Knight');
    assert.equal(roleB, 'Mage', 'Browser B must control Mage');
    assert.ok(
      transitionSkewMs < 350,
      `Both browsers must enter IN_GAME within < 350ms of each other (skew=${transitionSkewMs}ms)`
    );
    console.log(
      `✓ 2. Lobby Ceremony verified: live name/role sync ('Vikas' Knight & 'Ishika' Mage), mutual ready gate, and simultaneous IN_GAME entry (skew=${transitionSkewMs}ms)`
    );

    // =========================================================================
    // 3. Velocity Dead-Reckoning & `[Tab]` / Portrait Swap Guard
    // =========================================================================
    // Clear initial road ambush enemies so locomotion convergence is measured cleanly without enemy knockback
    await pageA.evaluate(() => {
      const w = window.__WORLD__;
      w.enemyManager?.clearAllEnemies?.();
      w.coopClient.sendWorldSync(w.campaignLoop.getStateSnapshot(w.coopSystem.heroStates), true);
    });
    await pageA.waitForTimeout(100);

    // Move Knight forward on Browser A for ~650ms, then release and let dead-reckoning settle
    await pageA.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    });
    await pageA.waitForTimeout(650);
    await pageA.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
    });
    await pageA.waitForTimeout(380);
    const posA = await pageA.evaluate(() => {
      const k = window.__WORLD__.coopSystem.heroStates.Knight;
      return { x: k.x, y: k.y, z: k.z, yaw: k.yaw };
    });

    // Wait up to 1.8s for Browser B's Knight position to converge within < 0.35m of Browser A
    await pageB.waitForFunction(
      (targetA) => {
        const k = window.__WORLD__?.coopSystem?.heroStates?.Knight;
        if (!k) return false;
        return Math.hypot(targetA.x - k.x, targetA.z - k.z) < 0.35;
      },
      posA,
      { timeout: 1800 }
    );

    const posB = await pageB.evaluate(() => {
      const k = window.__WORLD__.coopSystem.heroStates.Knight;
      return { x: k.x, y: k.y, z: k.z, yaw: k.yaw };
    });

    const distMovedFromSpawn = Math.hypot(posA.x - 0.0, posA.z - 124.0);
    const deadReckonError = Math.hypot(posA.x - posB.x, posA.z - posB.z);
    assert.ok(
      distMovedFromSpawn > 1.2,
      `Knight on Browser A must have moved > 1.2m from spawn (moved ${distMovedFromSpawn.toFixed(2)}m)`
    );
    assert.ok(
      deadReckonError < 0.35,
      `Browser B Knight position must converge within < 0.35m of Browser A (error=${deadReckonError.toFixed(3)}m)`
    );

    // Press `[Tab]` on Browser B in 2P co-op and verify it NEVER swaps control to Knight
    await pageB.keyboard.press('Tab');
    await pageB.waitForTimeout(100);
    const roleBAfterTabStage0 = await pageB.evaluate(() => ({
      activeHeroId: window.__WORLD__.player.activeHeroId,
      hudRole: document.querySelector('#sculpted-hud-root')?.getAttribute('data-role') ||
        window.__WORLD__.player.activeHeroId,
    }));
    assert.equal(
      roleBAfterTabStage0.activeHeroId,
      'Mage',
      '[Tab] in 2P co-op must NEVER swap Guest control from Mage to Knight'
    );

    // Unlock Stage 2 (Ice + Fire) and verify `[Tab]` toggles Ice <-> Fire and syncs to Host
    await pageB.evaluate(() => {
      const w = window.__WORLD__;
      const updated = w.coopClient.progression.setUnlocks({
        communeDiscovered: true,
        stone1Solved: true,
        stone2Solved: true,
        stonesSolvedMask: 3,
        iceUnlocked: true,
        fireUnlocked: true,
      });
      w.coopSystem.setUnlockedStage(2);
      w.campaignLoop.setUnlockedStage(2, 3);
      w.sculptedHud.setProgressionState(updated);
      w.coopClient.sendProgressionUpdate(updated);
    });
    await pageA.waitForFunction(
      () => window.__WORLD__?.coopClient?.getProgressionState?.()?.unlockedStage >= 2,
      null,
      { timeout: 5000 }
    );
    await pageA.evaluate(() => {
      const w = window.__WORLD__;
      w.coopSystem.setUnlockedStage(2);
      w.campaignLoop.setUnlockedStage(2, 3);
      w.sculptedHud.setProgressionState(w.coopClient.getProgressionState());
    });

    // Press `[Tab]` on Browser B to toggle Mage element from 'ice' to 'fire'
    await pageB.keyboard.press('Tab');
    await pageA.waitForFunction(
      () => {
        const w = window.__WORLD__;
        const mHero = w.campaignLoop?.combatHeroes?.Mage;
        const mState = w.coopSystem?.heroStates?.Mage;
        return (
          mHero?.selectedElement === 'fire' ||
          mHero?.selectedSpell === 'cinder_fall' ||
          mState?.element === 'fire' ||
          mState?.selectedElement === 'fire'
        );
      },
      null,
      { timeout: 5000 }
    );

    // Click partner portrait (`#sculpted-partner-row`) on both browsers and verify activeRole does not desync!
    const portraitClickCheck = await Promise.all([
      pageA.evaluate(() => {
        document.querySelector('#sculpted-partner-row')?.click();
        return {
          playerRole: window.__WORLD__.player.activeHeroId,
          partnerRowRole: document
            .querySelector('#sculpted-partner-row')
            ?.getAttribute('data-partner-role'),
        };
      }),
      pageB.evaluate(() => {
        document.querySelector('#sculpted-partner-row')?.click();
        return {
          playerRole: window.__WORLD__.player.activeHeroId,
          partnerRowRole: document
            .querySelector('#sculpted-partner-row')
            ?.getAttribute('data-partner-role'),
        };
      }),
    ]);
    assert.equal(
      portraitClickCheck[0].playerRole,
      'Knight',
      'Clicking partner portrait on Host must keep player.activeHeroId === Knight'
    );
    assert.equal(
      portraitClickCheck[0].partnerRowRole,
      'Mage',
      'Clicking partner portrait on Host must NOT desync sculptedHud state.activeRole'
    );
    assert.equal(
      portraitClickCheck[1].playerRole,
      'Mage',
      'Clicking partner portrait on Guest must keep player.activeHeroId === Mage'
    );
    assert.equal(
      portraitClickCheck[1].partnerRowRole,
      'Knight',
      'Clicking partner portrait on Guest must NOT desync sculptedHud state.activeRole'
    );
    console.log(
      `✓ 3. Velocity dead-reckoning (error=${deadReckonError.toFixed(3)}m < 0.35m), [Tab] Ice<->Fire sync, and portrait role-lock verified`
    );

    // =========================================================================
    // 4. Host-Authoritative Combat & Favor-the-Attacker Hit Reg (Zero Double Damage)
    // =========================================================================
    // Spawn a test enemy on Host (Browser A) right in front of the duo and verify sync to Guest (Browser B)
    const spawnedOnHost = await pageA.evaluate(() => {
      const w = window.__WORLD__;
      w.enemyManager.clearAllEnemies();
      const k = w.coopSystem.heroStates.Knight;
      const e = w.enemyManager.spawnImmediateFromSpec({
        archetype: 'Skeleton_Warrior',
        x: k.x + 1.5,
        z: k.z - 3.5,
        rotY: 0,
        hp: 145,
        maxHp: 145,
        dormant: 'standing',
      });
      // Force an immediate world_sync broadcast (`force = true` bypasses 40ms throttle!)
      w.coopClient.sendWorldSync(w.campaignLoop.getStateSnapshot(w.coopSystem.heroStates), true);
      return {
        instanceId: e.instanceId,
        slotIndex: e.slotIndex,
        spawnGen: e.spawnGen,
        hp: e.hp,
        maxHp: e.maxHp,
        x: e.x,
        z: e.z,
      };
    });
    assert.ok(spawnedOnHost.instanceId, 'Host spawned enemy must have a valid instanceId');

    // Wait for Guest (Browser B) to replicate the exact enemy via Host `world_sync`
    await pageB.waitForFunction(
      (expectedId) => {
        const active = window.__WORLD__?.enemyManager?.activeEnemies || [];
        return active.some((e) => e.instanceId === expectedId && e.active && !e.dead);
      },
      spawnedOnHost.instanceId,
      { timeout: 6000 }
    );

    const [enemiesA, enemiesB] = await Promise.all([
      pageA.evaluate(() =>
        window.__WORLD__.enemyManager.activeEnemies.map((e) => ({
          instanceId: e.instanceId,
          slotIndex: e.slotIndex,
          spawnGen: e.spawnGen,
          hp: e.hp,
          x: e.x,
          z: e.z,
        }))
      ),
      pageB.evaluate(() =>
        window.__WORLD__.enemyManager.activeEnemies.map((e) => ({
          instanceId: e.instanceId,
          slotIndex: e.slotIndex,
          spawnGen: e.spawnGen,
          hp: e.hp,
          x: e.x,
          z: e.z,
        }))
      ),
    ]);

    const matchA = enemiesA.find((e) => e.instanceId === spawnedOnHost.instanceId);
    const matchB = enemiesB.find((e) => e.instanceId === spawnedOnHost.instanceId);
    assert.ok(matchA && matchB, 'Both Host and Guest must see the active enemy by instanceId');
    const enemyPosDrift = Math.hypot(matchA.x - matchB.x, matchA.z - matchB.z);
    assert.ok(
      enemyPosDrift < 0.5,
      `Enemy position drift between Host and Guest must be < 0.5m (got ${enemyPosDrift.toFixed(3)}m)`
    );

    // Have Guest Mage damage the enemy and verify:
    // (a) 0ms local hit feedback on Guest
    // (b) Remote visual spell/action on Host does NOT deal duplicate damage
    // (c) Host authoritative enemy HP drops EXACTLY ONCE
    // (d) Duplicate `hitId` and stale `spawnGen` are rejected by Host
    const guestHitTest = await pageB.evaluate((targetId) => {
      const w = window.__WORLD__;
      const enemy = w.enemyManager.activeEnemies.find((e) => e.instanceId === targetId);
      if (!enemy) throw new Error('Target enemy not found on Guest');
      const hpBefore = enemy.hp;

      // Apply 0ms local hit feedback on Guest + send Favor-the-Attacker `enemy_hit`
      // AND send `spell_cast` (which triggers remote visual on Host — must NOT double-damage!)
      const hitId = `${w.coopClient.getState().clientId}_test_hit_1`;
      const hitRes = w.enemyManager.applyHitToEnemy(enemy, {
        damage: 38,
        source: 'frost_lance',
        infusion: 'rime',
        applyMark: 'rime',
        attackerRole: 'Mage',
      });
      w.coopClient.sendSpellCast({
        spellId: 'frost_lance',
        origin: [enemy.x, enemy.y, enemy.z + 3.0],
        target: [enemy.x, enemy.y, enemy.z],
        yaw: Math.PI,
      });
      w.coopClient.sendEnemyHit({
        hitId,
        instanceId: enemy.instanceId,
        slotIndex: enemy.slotIndex,
        spawnGen: enemy.spawnGen,
        dmg: 38,
        damage: 38,
        source: 'frost_lance',
        mark: 'rime',
        attackerRole: 'Mage',
      });

      return {
        hitId,
        hpBefore,
        localHpAfterZeroMs: enemy.hp,
        localDamageDealt: hitRes?.damageDealt ?? 0,
        localHitFlash: enemy.hitFlashTimer > 0,
        spawnGen: enemy.spawnGen,
        slotIndex: enemy.slotIndex,
      };
    }, spawnedOnHost.instanceId);

    assert.ok(
      guestHitTest.localHpAfterZeroMs < guestHitTest.hpBefore || guestHitTest.localHitFlash,
      'Guest must experience 0ms immediate local hit feedback'
    );

    // Wait for Host to process `enemy_hit` AND `spell_cast`
    await pageA.waitForFunction(
      ({ id, initialHp }) => {
        const e = window.__WORLD__?.enemyManager?.activeEnemies?.find(
          (x) => x.instanceId === id
        );
        return e && e.hp < initialHp;
      },
      { id: spawnedOnHost.instanceId, initialHp: spawnedOnHost.hp },
      { timeout: 5000 }
    );
    // Wait an extra 250ms to confirm `spell_cast` visual playback on Host does NOT deal a 2nd hit
    await pageA.waitForTimeout(250);

    const hostHpAfterSingleHit = await pageA.evaluate((id) => {
      const e = window.__WORLD__.enemyManager.activeEnemies.find((x) => x.instanceId === id);
      return e ? e.hp : null;
    }, spawnedOnHost.instanceId);

    const expectedHpAfterOneHit = spawnedOnHost.hp - 38;
    assert.equal(
      hostHpAfterSingleHit,
      expectedHpAfterOneHit,
      `Host enemy HP must drop EXACTLY ONCE from ${spawnedOnHost.hp} to ${expectedHpAfterOneHit} (got ${hostHpAfterSingleHit} — zero double damage!)`
    );

    // Now test duplicate `hitId` rejection AND stale `spawnGen` rejection from Guest
    await pageB.evaluate((info) => {
      const w = window.__WORLD__;
      // 1. Re-send exact same hitId (duplicate packet)
      w.coopClient.sendEnemyHit({
        hitId: info.hitId,
        instanceId: info.instanceId,
        slotIndex: info.slotIndex,
        spawnGen: info.spawnGen,
        dmg: 38,
        damage: 38,
        source: 'frost_lance',
        attackerRole: 'Mage',
      });
      // 2. Send new hitId but with stale/mismatched spawnGen
      w.coopClient.sendEnemyHit({
        hitId: `${info.hitId}_stale_gen`,
        instanceId: info.instanceId,
        slotIndex: info.slotIndex,
        spawnGen: (info.spawnGen || 1) + 77,
        dmg: 50,
        damage: 50,
        source: 'frost_lance',
        attackerRole: 'Mage',
      });
    }, {
      hitId: guestHitTest.hitId,
      instanceId: spawnedOnHost.instanceId,
      slotIndex: guestHitTest.slotIndex,
      spawnGen: guestHitTest.spawnGen,
    });

    await pageA.waitForTimeout(300);
    const hostHpAfterDupAndStale = await pageA.evaluate((id) => {
      const e = window.__WORLD__.enemyManager.activeEnemies.find((x) => x.instanceId === id);
      return e ? e.hp : null;
    }, spawnedOnHost.instanceId);

    assert.equal(
      hostHpAfterDupAndStale,
      expectedHpAfterOneHit,
      'Host must reject both duplicate hitId and stale spawnGen enemy_hit packets'
    );
    console.log(
      `✓ 4. Host-Authoritative Combat & Favor-the-Attacker Hit Reg verified (0ms Guest feedback, HP ${spawnedOnHost.hp} -> ${hostHpAfterSingleHit} exact single drop, duplicate hitId & stale spawnGen rejected)`
    );

    // =========================================================================
    // 5. Mid-Run 1.2s Disconnect & Reconnect Recovery
    // =========================================================================
    // Clear test enemy before disconnect test
    await pageA.evaluate(() => {
      window.__WORLD__.enemyManager.clearAllEnemies();
    });

    // Simulate a 1.2s WebSocket disconnect on Browser B mid-expedition:
    // Close Browser B's active room WebSocket cleanly and hold its auto-reconnect probe for 950ms
    // so the total disconnect window is ~1.25s (300ms backoff + 950ms hold) with zero console errors.
    await pageB.evaluate(() => {
      const origFetch = window.fetch.bind(window);
      let holdNextHead = true;
      window.fetch = async (...args) => {
        if (holdNextHead && args[1]?.method === 'HEAD') {
          holdNextHead = false;
          await new Promise((r) => setTimeout(r, 950));
        }
        return origFetch(...args);
      };
      const list = window.__GUEST_WS_LIST__ || [];
      for (const ws of list) {
        try {
          if (ws.readyState === 0 || ws.readyState === 1) {
            ws.close();
          }
        } catch {
          // ignore
        }
      }
    });

    // Wait for Host (Browser A) to see `peerConnected === false` and activate Wingman AI smoothly
    await pageA.waitForFunction(
      () =>
        window.__WORLD__?.coopClient?.getState?.()?.peerConnected === false &&
        window.__WORLD__?.coopSystem?.soloWingmanActive === true,
      null,
      { timeout: 5000 }
    );

    // Let Host tick for 1.2s while Guest is disconnected (verifying Wingman AI runs without throwing)
    await pageA.waitForTimeout(1200);

    // Verify Browser B auto-reconnects into IN_GAME with `expeditionStarted === true`, `stonesSolvedMask === 3`, and `Mage` control!
    await Promise.all([
      pageA.waitForFunction(
        () =>
          window.__WORLD__?.coopClient?.getState?.()?.peerConnected === true &&
          window.__WORLD__?.coopSystem?.soloWingmanActive === false,
        null,
        { timeout: 10000 }
      ),
      pageB.waitForFunction(
        () => {
          const w = window.__WORLD__;
          const st = w?.coopClient?.getState?.();
          const prog = w?.coopClient?.getProgressionState?.();
          return (
            st?.peerConnected === true &&
            st?.expeditionStarted === true &&
            w?.appFlow?.getStep?.() === 'in_game' &&
            prog?.stonesSolvedMask === 3
          );
        },
        null,
        { timeout: 10000 }
      ),
    ]);

    const guestRecoveredState = await pageB.evaluate(() => {
      const w = window.__WORLD__;
      return {
        step: w.appFlow.getStep(),
        activeHeroId: w.player.activeHeroId,
        expeditionStarted: w.coopClient.getState().expeditionStarted,
        stonesSolvedMask: w.coopClient.getProgressionState().stonesSolvedMask,
      };
    });
    assert.equal(guestRecoveredState.step, 'in_game');
    assert.equal(guestRecoveredState.activeHeroId, 'Mage');
    assert.equal(guestRecoveredState.expeditionStarted, true);
    assert.equal(guestRecoveredState.stonesSolvedMask, 3);

    const proxyStats = proxy.getStats();
    assert.ok(
      proxyStats.wsChunksDelayed > 10,
      `Impairment proxy must have delayed WebSocket traffic (delayed ${proxyStats.wsChunksDelayed} chunks)`
    );
    console.log(
      `✓ 5. Mid-Run 1.2s Disconnect & Reconnect Recovery verified (Wingman AI takeover + seamless restore of expeditionStarted, stonesSolvedMask=3 & Mage control; ${proxyStats.wsChunksDelayed} WS chunks impaired)`
    );

    // =========================================================================
    // 6. Assert Zero Console/Page Errors Across Both Browsers
    // =========================================================================
    assert.equal(
      pageErrorsA.length,
      0,
      `Browser A (Host) had pageErrors: ${JSON.stringify(pageErrorsA)}`
    );
    assert.equal(
      consoleErrorsA.length,
      0,
      `Browser A (Host) had consoleErrors: ${JSON.stringify(consoleErrorsA)}`
    );
    assert.equal(
      pageErrorsB.length,
      0,
      `Browser B (Guest) had pageErrors: ${JSON.stringify(pageErrorsB)}`
    );
    assert.equal(
      consoleErrorsB.length,
      0,
      `Browser B (Guest) had consoleErrors: ${JSON.stringify(consoleErrorsB)}`
    );
    console.log('✓ 6. Zero console/page errors across both Host Desktop and Guest Tablet browsers');

    console.log('\nALL 2-BROWSER LIVE CO-OP & IMPAIRMENT HARNESS CHECKS PASSED (100%)');
  } finally {
    await browserA.close().catch(() => {});
    await browserB.close().catch(() => {});
    await proxy.close().catch(() => {});
    srv.server.closeAllConnections?.();
    await new Promise((resolve) => {
      srv.server.close(resolve);
      setTimeout(resolve, 200);
    });
  }
}

main().catch((err) => {
  console.error('[coop-2p] Verification Failed:', err);
  process.exit(1);
});
