// ============================================================================
// world/tools/test-net-protocol.mjs
//
// Fast Node Protocol, Security & Commune Judge Safety Verification Suite:
// 1. 28-byte Binary Hero State Codec (`encodeHeroStateBinary` / `decodeHeroStateBinary`):
//    - Exact 28-byte frame size
//    - < 1mm (0.001m) position error across valley coordinates
//    - < 0.01 m/s velocity error
//    - ±π yaw wrapping & angular velocity roundtrip
//    - Bitflags (`role`, `grounded`, `shieldBlocking`, `element`, `clip`)
//    - Stale sequence number drop (`seq <= lastRemoteSeq` with uint16 wraparound)
//    - Invalid byteLength rejection (`!= 28` bytes)
// 2. `CoopRoomDO` <-> `serve.mjs` Parity:
//    - `rtc_signal` peer-only relay (zero sender echo)
//    - `lobby_claim` real-time name/role sync & role collision resolution
//    - Mutual ready gate before `start_expedition` (`ready: false` on initial join)
//    - `element_toggle` relay (`ice` <-> `fire`)
//    - `/internal/commune-apply` & `/api/commune` room broadcast to both peers
//    - Durable Object `ctx.storage` / `state.storage` hibernation & restart survival
// 3. Commune Judge Safety & Zero-Spoiler Verification:
//    - `/api/altar`, `room_state`, and `commune_verdict` contain 0 occurrences
//      of `getInternalSecretConfig().secretName` (verified in memory without logging)
//    - Simulated Gemini timeout/error on raw mic audio (`transcriptHint: ''`,
//      `audioBase64` non-empty) returns `hpDelta === 0`, `hpDeltaPct === 0`,
//      and does NOT increment `spamCount` or trigger `smite` / `rose_gommage`
//    - Out-of-order `1 -> 3 -> 2` stone prayers unlock stages `1 -> 2 -> 3`
//      safely without ever skipping Fire (`stage 2`)
// 4. Cloudflare Deploy & Worker Path Security:
//    - `npx wrangler deploy --dry-run` exits `0` (< 25 MiB asset cap)
//    - `worker/index.js` returns `403` for `/.env`, `/.git/config`,
//      `/worker/scripture-catalog.js`, `/sfx-foley/.modal-ssh/id_ed25519`
//    - `worker/index.js` returns `200` for `GET/POST /api/mobile-telemetry`
// ============================================================================

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { startServer } from './serve.mjs';
import * as coopClientMod from '../src/net/coop-client.js';
import { CoopRoomDO } from '../../worker/room-do.js';
import workerEntry from '../../worker/index.js';
import { getInternalSecretConfig, getScriptureForStage } from '../../worker/scripture-catalog.js';
import { evaluateCommunePrayer } from '../../worker/commune-judge.js';

function createMessageQueue(ws) {
  const queue = [];
  const binaryQueue = [];
  const waiters = [];

  ws.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
      const buf =
        event.data instanceof ArrayBuffer
          ? event.data
          : event.data.buffer.slice(
              event.data.byteOffset,
              event.data.byteOffset + event.data.byteLength
            );
      for (let i = 0; i < waiters.length; i++) {
        if (waiters[i].isBinary && waiters[i].predicate(buf)) {
          const w = waiters.splice(i, 1)[0];
          clearTimeout(w.timer);
          w.resolve(buf);
          return;
        }
      }
      binaryQueue.push(buf);
      return;
    }

    const raw = typeof event.data === 'string' ? event.data : event.data.toString();
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    for (let i = 0; i < waiters.length; i++) {
      if (!waiters[i].isBinary && waiters[i].predicate(msg)) {
        const w = waiters.splice(i, 1)[0];
        clearTimeout(w.timer);
        w.resolve(msg);
        return;
      }
    }
    queue.push(msg);
  });

  function nextMessage(predicate, label = 'message', timeoutMs = 4000) {
    for (let i = 0; i < queue.length; i++) {
      if (predicate(queue[i])) {
        return Promise.resolve(queue.splice(i, 1)[0]);
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${label}`));
      }, timeoutMs);
      waiters.push({ isBinary: false, predicate, resolve, timer });
    });
  }

  function nextBinary(predicate = () => true, label = 'binary frame', timeoutMs = 4000) {
    for (let i = 0; i < binaryQueue.length; i++) {
      if (predicate(binaryQueue[i])) {
        return Promise.resolve(binaryQueue.splice(i, 1)[0]);
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${label}`));
      }, timeoutMs);
      waiters.push({ isBinary: true, predicate, resolve, timer });
    });
  }

  return { nextMessage, nextBinary, queue, binaryQueue };
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    const q = createMessageQueue(ws);
    const timer = setTimeout(() => reject(new Error(`Timeout opening ${url}`)), 4000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve({ ws, ...q });
    });
    ws.addEventListener('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function createMockSocket() {
  const listeners = { message: [], close: [], error: [] };
  const sent = [];
  const sentBinary = [];
  let closedCode = null;
  let attachment = null;
  return {
    sent,
    sentBinary,
    get closedCode() {
      return closedCode;
    },
    serializeAttachment(val) {
      attachment = structuredClone(val);
    },
    deserializeAttachment() {
      return attachment ? structuredClone(attachment) : null;
    },
    addEventListener(type, fn) {
      listeners[type]?.push(fn);
    },
    send(data) {
      if (typeof data === 'string') {
        sent.push(JSON.parse(data));
      } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        sentBinary.push(data);
      }
    },
    emitMessage(objOrBuf) {
      const data =
        typeof objOrBuf === 'string' ||
        objOrBuf instanceof ArrayBuffer ||
        ArrayBuffer.isView(objOrBuf)
          ? objOrBuf
          : JSON.stringify(objOrBuf);
      for (const fn of listeners.message) fn({ data });
    },
    close(code = 1000) {
      closedCode = code;
      for (const fn of listeners.close) fn({ code });
    },
  };
}

function createMockDOState(sharedMap = new Map()) {
  const sockets = [];
  const storage = {
    async get(key) {
      return sharedMap.has(key) ? structuredClone(sharedMap.get(key)) : undefined;
    },
    async put(keyOrObj, val) {
      if (typeof keyOrObj === 'object' && keyOrObj !== null) {
        for (const [k, v] of Object.entries(keyOrObj)) {
          sharedMap.set(k, structuredClone(v));
        }
      } else {
        sharedMap.set(keyOrObj, structuredClone(val));
      }
    },
    async delete(key) {
      return sharedMap.delete(key);
    },
    async list() {
      return new Map(sharedMap);
    },
  };
  return {
    storage,
    sharedMap,
    sockets,
    acceptWebSocket(ws) {
      sockets.push(ws);
    },
    getWebSockets() {
      return [...sockets];
    },
    blockConcurrencyWhile(fn) {
      return fn();
    },
  };
}

function normalizeAngleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/**
 * Spoiler-safe helper: checks whether `secretStr` appears anywhere in `targetObj`
 * without EVER printing `secretStr`.
 */
function containsSecretSubstring(targetObj, secretStr) {
  if (!secretStr) return false;
  const serialized =
    typeof targetObj === 'string' ? targetObj : JSON.stringify(targetObj || {});
  return serialized.toLowerCase().includes(String(secretStr).toLowerCase());
}

async function runProtocolSuite() {
  console.log('=== Amarante Protocol, Security, DO Hibernation & Commune Judge Safety Suite ===');

  // --------------------------------------------------------------------------
  // 1. Test 28-Byte Binary Hero State Codec
  // --------------------------------------------------------------------------
  const { encodeHeroStateBinary, decodeHeroStateBinary } = coopClientMod;
  assert.equal(
    typeof encodeHeroStateBinary,
    'function',
    'coop-client.js must export encodeHeroStateBinary'
  );
  assert.equal(
    typeof decodeHeroStateBinary,
    'function',
    'coop-client.js must export decodeHeroStateBinary'
  );

  const sampleInput = {
    seq: 42,
    role: 'Knight',
    x: 114.2345,
    y: 3.456,
    z: -91.8765,
    vx: 5.43,
    vy: -1.25,
    vz: -3.78,
    yaw: Math.PI - 0.05,
    vyaw: 1.85,
    grounded: true,
    shieldBlocking: true,
    element: 'fire',
    clip: 'Run',
  };

  const encoded = encodeHeroStateBinary(sampleInput);
  const rawBuffer =
    encoded instanceof ArrayBuffer
      ? encoded
      : encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  assert.equal(rawBuffer.byteLength, 28, 'Binary hero_state packet must be exactly 28 bytes');

  const decoded = decodeHeroStateBinary(rawBuffer);
  assert.ok(decoded, 'decodeHeroStateBinary must decode valid 28-byte packet');
  assert.equal(decoded.seq, 42);
  assert.equal(decoded.role, 'Knight');
  assert.ok(
    Math.abs(decoded.x - sampleInput.x) < 0.001,
    `x position error must be < 1mm (got ${Math.abs(decoded.x - sampleInput.x).toFixed(6)}m)`
  );
  assert.ok(
    Math.abs(decoded.y - sampleInput.y) < 0.001,
    `y position error must be < 1mm (got ${Math.abs(decoded.y - sampleInput.y).toFixed(6)}m)`
  );
  assert.ok(
    Math.abs(decoded.z - sampleInput.z) < 0.001,
    `z position error must be < 1mm (got ${Math.abs(decoded.z - sampleInput.z).toFixed(6)}m)`
  );
  assert.ok(
    Math.abs(decoded.vx - sampleInput.vx) < 0.01,
    `vx error must be < 0.01 m/s (got ${Math.abs(decoded.vx - sampleInput.vx).toFixed(5)})`
  );
  assert.ok(
    Math.abs(decoded.vy - sampleInput.vy) < 0.01,
    `vy error must be < 0.01 m/s (got ${Math.abs(decoded.vy - sampleInput.vy).toFixed(5)})`
  );
  assert.ok(
    Math.abs(decoded.vz - sampleInput.vz) < 0.01,
    `vz error must be < 0.01 m/s (got ${Math.abs(decoded.vz - sampleInput.vz).toFixed(5)})`
  );
  assert.ok(
    normalizeAngleDiff(decoded.yaw, sampleInput.yaw) < 0.005,
    'yaw roundtrip error must be < 0.005 rad'
  );
  assert.equal(Boolean(decoded.grounded), true);
  assert.equal(Boolean(decoded.shieldBlocking), true);
  assert.equal(decoded.element, 'fire');

  // Test ±π yaw wrap edge cases (`3.5 * Math.PI`, `-3.2 * Math.PI`, `-Math.PI`, `+Math.PI`)
  for (const rawYaw of [-Math.PI, Math.PI, 3.5 * Math.PI, -3.25 * Math.PI, 0]) {
    const pkt = encodeHeroStateBinary({
      ...sampleInput,
      seq: 100,
      role: 'Mage',
      yaw: rawYaw,
      grounded: false,
      shieldBlocking: false,
      element: 'ice',
    });
    const dec = decodeHeroStateBinary(pkt);
    assert.ok(dec, 'Wrapped yaw packet must decode');
    assert.equal(dec.role, 'Mage');
    assert.equal(Boolean(dec.grounded), false);
    assert.equal(Boolean(dec.shieldBlocking), false);
    assert.equal(dec.element, 'ice');
    assert.ok(
      normalizeAngleDiff(dec.yaw, rawYaw) < 0.005,
      `Yaw wrap failed for ${rawYaw} (got ${dec.yaw})`
    );
  }

  // Test stale `seq` drop (when lastRemoteSeq is passed or tracked)
  const staleRes = decodeHeroStateBinary(encodeHeroStateBinary({ ...sampleInput, seq: 40 }), 42);
  assert.equal(
    staleRes,
    null,
    'decodeHeroStateBinary(buf, lastSeq) must return null when packet seq <= lastSeq'
  );

  // Test invalid byteLength rejection
  assert.equal(decodeHeroStateBinary(new ArrayBuffer(12)), null, 'Must reject 12-byte buffer');
  assert.equal(decodeHeroStateBinary(new ArrayBuffer(40)), null, 'Must reject 40-byte buffer');
  assert.equal(decodeHeroStateBinary(null), null, 'Must reject null buffer');
  console.log('✓ 1. 28-byte binary codec roundtrip (<1mm pos, <0.01m/s vel, ±π yaw, bitflags, stale seq drop, invalid length rejection) verified');

  // --------------------------------------------------------------------------
  // 2. Test `CoopRoomDO` <-> `serve.mjs` Parity & DO Storage Restart Survival
  // --------------------------------------------------------------------------
  const { server, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBaseUrl = `ws://127.0.0.1:${port}`;

  try {
    const roomUrl = `${wsBaseUrl}/api/room/RAIN-ON-WARM-LIMESTONE/websocket`;
    const hostClient = await openWebSocket(roomUrl);
    hostClient.ws.send(
      JSON.stringify({
        type: 'join',
        device: 'Desktop PC',
        roomPhrase: 'Rain on warm limestone',
        preferredRole: 'Knight',
      })
    );

    const hostJoinState = await hostClient.nextMessage(
      (m) => m.type === 'room_state' && m.clientId,
      'Host initial room_state'
    );
    assert.equal(hostJoinState.isHost, true);
    assert.equal(hostJoinState.role, 'Knight');
    assert.equal(hostJoinState.ready, false, 'Host must start with ready: false before claiming');

    const guestClient = await openWebSocket(roomUrl);
    guestClient.ws.send(
      JSON.stringify({
        type: 'join',
        device: 'Xiaomi Pad 7',
        preferredRole: 'Mage',
      })
    );

    const [hostPaired, guestPaired] = await Promise.all([
      hostClient.nextMessage(
        (m) => m.type === 'room_state' && m.peerConnected === true,
        'Host paired room_state'
      ),
      guestClient.nextMessage(
        (m) => m.type === 'room_state' && m.peerConnected === true,
        'Guest paired room_state'
      ),
    ]);
    assert.equal(hostPaired.ready, false, 'Host ready must still be false');
    assert.equal(guestPaired.ready, false, 'Guest ready must start false');

    // 2a. Mutual Ready Gate before `start_expedition`:
    // Host attempting `start_expedition` while Guest is not ready must fail with `expedition_error`
    hostClient.ws.send(JSON.stringify({ type: 'start_expedition' }));
    const earlyStartErr = await hostClient.nextMessage(
      (m) => m.type === 'expedition_error',
      'Host early start_expedition error'
    );
    assert.equal(earlyStartErr.ok, false);

    // 2b. `lobby_claim` name/role sync & collision resolution
    hostClient.ws.send(
      JSON.stringify({
        type: 'lobby_claim',
        role: 'Knight',
        playerName: 'Vikas',
        claimed: true,
      })
    );
    const guestSeesHostClaim = await guestClient.nextMessage(
      (m) =>
        m.type === 'room_state' &&
        Array.isArray(m.players) &&
        m.players.some((p) => p.playerName === 'Vikas' && p.role === 'Knight'),
      'Guest sees Host lobby_claim name & role'
    );
    assert.ok(guestSeesHostClaim);

    // Test collision resolution: if Guest tries to claim Mage with name 'Ishika'
    guestClient.ws.send(
      JSON.stringify({
        type: 'lobby_claim',
        role: 'Mage',
        playerName: 'Ishika',
        claimed: true,
      })
    );
    const hostSeesGuestClaim = await hostClient.nextMessage(
      (m) =>
        m.type === 'room_state' &&
        Array.isArray(m.players) &&
        m.players.some((p) => p.playerName === 'Ishika' && p.role === 'Mage' && p.claimed),
      'Host sees Guest lobby_claim'
    );
    assert.ok(hostSeesGuestClaim);

    // Now that both have claimed / readied, `start_expedition` must succeed!
    hostClient.ws.send(JSON.stringify({ type: 'start_expedition' }));
    const [expHost, expGuest] = await Promise.all([
      hostClient.nextMessage((m) => m.type === 'expedition_started', 'Host expedition_started'),
      guestClient.nextMessage((m) => m.type === 'expedition_started', 'Guest expedition_started'),
    ]);
    assert.equal(expHost.ok, true);
    assert.equal(expGuest.ok, true);

    // 2c. `rtc_signal` peer-only relay (Host -> Guest, no echo back to Host)
    hostClient.ws.send(
      JSON.stringify({
        type: 'rtc_signal',
        signalType: 'offer',
        sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\n',
      })
    );
    const guestRtcSignal = await guestClient.nextMessage(
      (m) => m.type === 'rtc_signal' && m.signalType === 'offer',
      'Guest receives rtc_signal from Host'
    );
    assert.equal(guestRtcSignal.fromRole, 'Knight');
    assert.equal(
      hostClient.queue.some((m) => m.type === 'rtc_signal'),
      false,
      'Host must NOT receive echo of its own rtc_signal'
    );

    // 2d. `element_toggle` relay
    guestClient.ws.send(
      JSON.stringify({
        type: 'element_toggle',
        role: 'Mage',
        element: 'fire',
      })
    );
    const hostSeesElToggle = await hostClient.nextMessage(
      (m) => m.type === 'element_toggle' && m.element === 'fire',
      'Host receives element_toggle from Guest'
    );
    assert.equal(hostSeesElToggle.role, 'Mage');

    // 2e. Binary 0x02 frame forwarding over `serve.mjs` WebSocket
    const binPacket = encodeHeroStateBinary({
      seq: 77,
      role: 'Knight',
      x: 12.5,
      y: 1.2,
      z: 88.25,
      vx: 3.1,
      vy: 0,
      vz: -4.2,
      yaw: 0.75,
      vyaw: 0.1,
      grounded: true,
      shieldBlocking: false,
      element: 'ice',
      clip: 'Run',
    });
    hostClient.ws.send(binPacket);
    const guestRecvBin = await guestClient.nextBinary(
      (b) => b.byteLength === 28,
      'Guest receives 28-byte binary frame over WS'
    );
    const guestDecBin = decodeHeroStateBinary(guestRecvBin);
    assert.equal(guestDecBin.seq, 77);
    assert.ok(Math.abs(guestDecBin.x - 12.5) < 0.001);

    hostClient.ws.close();
    guestClient.ws.close();

    // 2f. Test `CoopRoomDO` parity + `/internal/commune-apply` + DO Storage Restart Survival
    const sharedStorageMap = new Map();
    const doState1 = createMockDOState(sharedStorageMap);
    const doInstance1 = new CoopRoomDO(doState1, {});
    const wsA = createMockSocket();
    const wsB = createMockSocket();

    const pA = doInstance1.attachSocket(wsA, { preferredRole: 'Knight', device: 'Desktop' });
    const pB = doInstance1.attachSocket(wsB, { preferredRole: 'Mage', device: 'Tablet' });
    assert.equal(pA.ready, false, 'CoopRoomDO Host must default to ready: false');
    assert.equal(pB.ready, false, 'CoopRoomDO Guest must default to ready: false');

    // Mutual ready gate in CoopRoomDO
    wsA.emitMessage({ type: 'start_expedition' });
    assert.equal(
      wsA.sent.some((m) => m.type === 'expedition_error'),
      true,
      'CoopRoomDO must reject start_expedition before Guest is ready'
    );

    // `lobby_claim` on CoopRoomDO
    wsA.emitMessage({
      type: 'lobby_claim',
      role: 'Knight',
      playerName: 'Vikas',
      claimed: true,
    });
    wsB.emitMessage({
      type: 'lobby_claim',
      role: 'Mage',
      playerName: 'Ishika',
      claimed: true,
    });

    wsA.emitMessage({ type: 'start_expedition' });
    assert.equal(doInstance1.expeditionStarted, true, 'CoopRoomDO expeditionStarted must be true');

    // `rtc_signal` peer-only relay in CoopRoomDO
    const countBeforeRtcA = wsA.sent.length;
    wsA.emitMessage({ type: 'rtc_signal', signalType: 'candidate', candidate: 'cand:1' });
    assert.equal(
      wsB.sent.some((m) => m.type === 'rtc_signal' && m.candidate === 'cand:1'),
      true,
      'CoopRoomDO must relay rtc_signal to peer'
    );
    assert.equal(
      wsA.sent.slice(countBeforeRtcA).some((m) => m.type === 'rtc_signal'),
      false,
      'CoopRoomDO must never echo rtc_signal to sender'
    );

    // `element_toggle` in CoopRoomDO
    wsB.emitMessage({ type: 'element_toggle', role: 'Mage', element: 'fire' });
    assert.equal(
      wsA.sent.some((m) => m.type === 'element_toggle' && m.element === 'fire'),
      true,
      'CoopRoomDO must relay element_toggle to peer'
    );

    // `/internal/commune-apply` room broadcast & progression update
    const applyRes = await doInstance1.fetch(
      new Request('https://haru-machi-coop.workers.dev/internal/commune-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: 'RAIN-ON-WARM-LIMESTONE',
          speakerRole: 'Knight',
          partnerRole: 'Mage',
          judgment: {
            verdict: 'blessing',
            prayerMode: 'awakening',
            awakenedStoneId: 'site1_well',
            awakenedStage: 1,
            stonesSolvedMask: 1,
            stone1Solved: true,
            hpDelta: 60,
            hpDeltaPct: 0.6,
            divine_quote: 'Walk together through the frost.',
          },
        }),
      })
    );
    assert.equal(applyRes.status, 200, '/internal/commune-apply must return 200');
    assert.equal(
      doInstance1.progression.getState().stone1Solved,
      true,
      '/internal/commune-apply must update DO progression'
    );
    assert.equal(
      wsB.sent.some((m) => m.type === 'commune_verdict'),
      true,
      '/internal/commune-apply must broadcast commune_verdict to room sockets'
    );

    // Allow any async storage.put promises to settle
    await new Promise((r) => setTimeout(r, 30));

    // Simulate DO eviction & cold restart with the same persistent storage map!
    const doState2 = createMockDOState(sharedStorageMap);
    const doInstance2 = new CoopRoomDO(doState2, {});
    const statusRes2 = await doInstance2.fetch(
      new Request('https://haru-machi-coop.workers.dev/api/room/RAIN-ON-WARM-LIMESTONE/status')
    );
    const statusJson2 = await statusRes2.json();
    assert.equal(
      statusJson2.expeditionStarted,
      true,
      'Restarted CoopRoomDO must restore expeditionStarted: true from storage'
    );
    assert.equal(
      statusJson2.progression?.stone1Solved,
      true,
      'Restarted CoopRoomDO must restore stone1Solved: true from storage'
    );
    assert.equal(
      statusJson2.progression?.stonesSolvedMask,
      1,
      'Restarted CoopRoomDO must restore stonesSolvedMask: 1 from storage'
    );
    console.log('✓ 2. CoopRoomDO <-> serve.mjs parity (rtc_signal, lobby_claim, mutual ready gate, element_toggle, /internal/commune-apply & DO storage restart survival) verified');

    // ------------------------------------------------------------------------
    // 3. Test Commune Judge Safety & Out-of-Order `1 -> 3 -> 2` Progression
    // ------------------------------------------------------------------------
    const secretCfg = getInternalSecretConfig();
    assert.ok(
      secretCfg.secretName && secretCfg.secretName.length >= 4,
      'Secret Sovereign name must be configured'
    );
    const bannedOldNames = ['artorious', 'aurelius', 'oberon', 'roseheart'];
    assert.equal(
      bannedOldNames.includes(secretCfg.secretName.toLowerCase()),
      false,
      'Primary secretName must be rotated to a fresh unspoiled name'
    );

    // Check `/api/altar` across all 3 stages for zero secretName occurrences
    for (const stg of [1, 2, 3]) {
      const sData = getScriptureForStage({ stage: stg });
      assert.equal(
        containsSecretSubstring(sData, secretCfg.secretName),
        false,
        `Stage ${stg} /api/altar response must contain 0 occurrences of secretName`
      );
      if (stg === 1) {
        for (const line of sData.lines) {
          assert.ok(
            line.length <= 36,
            `Stone 1 poem line length (${line.length}) must be <= 36 chars`
          );
        }
      }
    }
    assert.equal(
      containsSecretSubstring(statusJson2, secretCfg.secretName),
      false,
      'room_state / status must contain 0 occurrences of secretName'
    );

    // 3b. Simulated Gemini timeout/error on raw mic audio (`transcriptHint: ''`, `audioBase64` non-empty)
    // Must return `hpDelta === 0` (`hpDeltaPct === 0`) and NEVER increment spamCount or trigger smite/rose_gommage!
    const prevOffline = process.env.HARU_COMMUNE_OFFLINE;
    delete process.env.HARU_COMMUNE_OFFLINE;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        throw new Error('Simulated network timeout / 503 Service Unavailable');
      }
      return origFetch(url, opts);
    };
    let rawAudioTimeoutJudgment;
    try {
      rawAudioTimeoutJudgment = await evaluateCommunePrayer({
        // Non-printable binary WebM header bytes in base64 so decodePrintableTextFromBase64 returns ''
        audioBase64: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x81, 0x00, 0xff, 0xd4]).toString(
          'base64'
        ),
        mimeType: 'audio/webm',
        transcriptHint: '',
        speakerRole: 'Knight',
        partnerRole: 'Mage',
        spamCount: 2, // Even at spamCount=2, a network timeout must NEVER trigger 3rd-strike rose_gommage!
        gameState: {
          speakerHp: 180,
          speakerMaxHp: 220,
          partnerHp: 90,
          partnerMaxHp: 120,
          inCombat: true,
        },
        progressionState: { unlockedStage: 1, stone1Solved: true, stonesSolvedMask: 1 },
        env: { GEMINI_API_KEY: 'test-dummy-key-for-timeout-sim' },
      });
    } finally {
      globalThis.fetch = origFetch;
      if (prevOffline !== undefined) process.env.HARU_COMMUNE_OFFLINE = prevOffline;
    }

    assert.equal(
      rawAudioTimeoutJudgment.hpDelta,
      0,
      'Gemini timeout/error on raw mic audio must return hpDelta === 0 (never false-smite)'
    );
    assert.equal(
      rawAudioTimeoutJudgment.hpDeltaPct,
      0,
      'Gemini timeout/error on raw mic audio must return hpDeltaPct === 0'
    );
    assert.notEqual(
      rawAudioTimeoutJudgment.verdict,
      'smite',
      'Gemini timeout/error on raw mic audio must NEVER return verdict: smite'
    );
    assert.notEqual(
      rawAudioTimeoutJudgment.deathVfx,
      'rose_gommage',
      'Gemini timeout/error on raw mic audio must NEVER trigger rose_gommage'
    );
    assert.equal(
      Boolean(rawAudioTimeoutJudgment.incrementSpam),
      false,
      'Gemini timeout/error on raw mic audio must NOT increment spamCount'
    );
    assert.equal(
      containsSecretSubstring(rawAudioTimeoutJudgment, secretCfg.secretName),
      false,
      'commune_verdict must contain 0 occurrences of secretName'
    );

    // 3c. Out-of-order `1 -> 3 -> 2` Stone Prayers unlock Stages `1 -> 2 -> 3` without skipping Fire
    process.env.HARU_COMMUNE_OFFLINE = '1';

    // Step 1: Solve Stone 1 (`site1_well`) using the active secretName in memory
    const jStone1 = await evaluateCommunePrayer({
      transcriptHint: `Oh ${secretCfg.secretName}, I love and cherish my beloved partner with all my heart and warmth forever!`,
      speakerRole: 'Knight',
      partnerRole: 'Mage',
      gameState: {
        speakerHp: 200,
        speakerMaxHp: 220,
        partnerHp: 110,
        partnerMaxHp: 120,
        nearStoneId: 'site1_well',
        nearestStoneSiteId: 'site1_well',
        inCombat: false,
      },
      progressionState: {
        unlockedStage: 0,
        stonesSolvedMask: 0,
        stone1Solved: false,
        stone2Solved: false,
        stone3Solved: false,
      },
    });
    assert.equal(jStone1.prayerMode, 'awakening', 'Stone 1 valid prayer must trigger awakening');
    assert.equal(jStone1.stone1Solved, true, 'Stone 1 must be marked solved');
    assert.equal(jStone1.stonesSolvedMask, 1, 'stonesSolvedMask must be 0b001 (1)');
    assert.equal(jStone1.awakenedStage, 1, '1st stone solved must unlock Stage 1 (Ice)');
    assert.equal(
      containsSecretSubstring(jStone1, secretCfg.secretName),
      false,
      'Stone 1 awakening verdict must scrub secretName from all returned text fields'
    );

    // Step 2: Visit Stone 3 (`site3_wall`) BEFORE Stone 2!
    const jStone3Second = await evaluateCommunePrayer({
      transcriptHint: `Oh ${secretCfg.secretName}, I swear this steadfast oath beside my beloved partner—she never walks alone through the winter rime and thunder!`,
      speakerRole: 'Mage',
      partnerRole: 'Knight',
      gameState: {
        speakerHp: 110,
        speakerMaxHp: 120,
        partnerHp: 200,
        partnerMaxHp: 220,
        nearStoneId: 'site3_wall',
        nearestStoneSiteId: 'site3_wall',
        inCombat: false,
      },
      progressionState: {
        unlockedStage: 1,
        stonesSolvedMask: 1,
        stone1Solved: true,
        stone2Solved: false,
        stone3Solved: false,
      },
    });
    assert.equal(
      jStone3Second.prayerMode,
      'awakening',
      'Solving Stone 3 second must trigger awakening'
    );
    assert.equal(jStone3Second.stone1Solved, true);
    assert.equal(jStone3Second.stone2Solved, false);
    assert.equal(jStone3Second.stone3Solved, true);
    assert.equal(jStone3Second.stonesSolvedMask, 5, 'stonesSolvedMask must be 0b101 (5)');
    assert.equal(
      jStone3Second.awakenedStage,
      2,
      'Solving Stone 3 second (1 -> 3) MUST unlock Stage 2 (Fire [E] + [Tab]), never skipping Fire!'
    );

    // Step 3: Visit Stone 2 (`site2_platform`) last (`1 -> 3 -> 2` complete!)
    const jStone2Third = await evaluateCommunePrayer({
      transcriptHint: `Oh ${secretCfg.secretName}, beneath the violet boughs and living spark, I cherish every stubborn quirk and warm ember of my beloved partner!`,
      speakerRole: 'Knight',
      partnerRole: 'Mage',
      gameState: {
        speakerHp: 200,
        speakerMaxHp: 220,
        partnerHp: 110,
        partnerMaxHp: 120,
        nearStoneId: 'site2_platform',
        nearestStoneSiteId: 'site2_platform',
        inCombat: false,
      },
      progressionState: {
        unlockedStage: 2,
        stonesSolvedMask: 5,
        stone1Solved: true,
        stone2Solved: false,
        stone3Solved: true,
      },
    });
    assert.equal(
      jStone2Third.prayerMode,
      'awakening',
      'Solving Stone 2 third must trigger awakening'
    );
    assert.equal(jStone2Third.stonesSolvedMask, 7, 'stonesSolvedMask must be 0b111 (7)');
    assert.equal(
      jStone2Third.awakenedStage,
      3,
      'Solving final stone (1 -> 3 -> 2) must unlock Stage 3 ([Q] Ultimates + Mode B)'
    );
    console.log('✓ 3. Commune Judge safety (0 secretName leaks, 0 HP loss / 0 spam on raw-audio timeout, and 1 -> 3 -> 2 out-of-order Fire safety) verified');

    // ------------------------------------------------------------------------
    // 4. Test `worker/index.js` Security Boundaries & `wrangler deploy --dry-run`
    // ------------------------------------------------------------------------
    const mockEnv = {
      COOP_ROOMS: {
        idFromName: (name) => name,
        get: () => doInstance2,
      },
      ASSETS: {
        fetch: async (req) => new Response(`asset:${new URL(req.url).pathname}`, { status: 200 }),
      },
    };

    const forbiddenPaths = [
      '/.env',
      '/.dev.vars',
      '/.git/config',
      '/worker/scripture-catalog.js',
      '/sfx-foley/.modal-ssh/id_ed25519',
      '/docs/superpowers/plans/2026-11-07-amarante-final-playable-handoff.md',
      '/wrangler.toml',
      '/package.json',
    ];
    for (const p of forbiddenPaths) {
      const res = await workerEntry.fetch(
        new Request(`https://haru-machi-coop.workers.dev${p}`),
        mockEnv
      );
      assert.equal(
        res.status,
        403,
        `worker/index.js must return 403 Forbidden for sensitive path ${p} (got ${res.status})`
      );
    }

    // Verify `/api/mobile-telemetry` GET and POST return 200 on Worker
    const workerTelPost = await workerEntry.fetch(
      new Request('https://haru-machi-coop.workers.dev/api/mobile-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fps: 60, triangles: 195000 }),
      }),
      mockEnv
    );
    assert.equal(workerTelPost.status, 200, 'Worker POST /api/mobile-telemetry must return 200');
    const workerTelGet = await workerEntry.fetch(
      new Request('https://haru-machi-coop.workers.dev/api/mobile-telemetry'),
      mockEnv
    );
    assert.equal(workerTelGet.status, 200, 'Worker GET /api/mobile-telemetry must return 200');

    // Verify `npx wrangler deploy --dry-run` exits 0 (< 25 MiB asset cap)
    const dryRun = spawnSync('npx wrangler deploy --dry-run', {
      cwd: process.cwd(),
      shell: true,
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(
      dryRun.status,
      0,
      `npx wrangler deploy --dry-run must exit 0 (status=${dryRun.status}):\n${dryRun.stderr || dryRun.stdout}`
    );
    console.log('✓ 4. Cloudflare Worker 403 path guards, 200 /api/mobile-telemetry, and `npx wrangler deploy --dry-run` (exit 0) verified');

    console.log('\nALL PROTOCOL, SECURITY, HIBERNATION & JUDGE SAFETY TESTS PASSED (100%)');
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => {
      server.close(resolve);
      setTimeout(resolve, 200);
    });
  }
}

runProtocolSuite().catch((err) => {
  console.error('Protocol & Security Suite Failed:', err);
  process.exit(1);
});
