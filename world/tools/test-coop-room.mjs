// ============================================================================
// world/tools/test-coop-room.mjs
//
// Automated 2-Client Verification for Haru-machi Stage 5 WebSocket Co-Op:
// - Spins up `world/tools/serve.mjs` on an ephemeral port (0)
// - Connects Client A (Desktop / Pachgaon) and Client B (Xiaomi Pad 7 / Sonipat)
// - Verifies:
//   1. Room join assigns Knight (Host) + Mage (Guest) with peerConnected: true
//   2. Role swap (`swap_roles`) flips roles cleanly and restores them
//   3. Mage sending `spell_cast` (`shatterlance` / `cinder_fall`) delivers to
//      Knight with full Demon Slayer sword infusion metadata
//   4. Guest sending `enemy_hit` and Host broadcasting `world_sync` (> 200 bytes
//      testing RFC 6455 126 extended-length frames) arrive intact, plus
//      `hero_state`, `action_event`, `revive_partner`, and `act_transition`
//   5. Disconnecting Guest notifies Host (`peerConnected: false`) for Wingman AI
//   6. `createCoopClient` browser/Node client + offline Solo fallback with 0 errors
//   7. `CoopRoomDO` & `worker/index.js` Cloudflare Worker Durable Object parity test
// ============================================================================

import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';
import { createCoopClient } from '../src/net/coop-client.js';
import { CoopRoomDO } from '../../worker/room-do.js';
import workerEntry from '../../worker/index.js';

function createMessageQueue(ws) {
  const queue = [];
  const waiters = [];

  ws.addEventListener('message', (event) => {
    const raw = typeof event.data === 'string' ? event.data : event.data.toString();
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    for (let i = 0; i < waiters.length; i++) {
      if (waiters[i].predicate(msg)) {
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
        reject(new Error(`Timed out waiting for ${label} (queue=${JSON.stringify(queue)})`));
      }, timeoutMs);
      waiters.push({ predicate, resolve, timer });
    });
  }

  return { nextMessage, queue };
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
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
  return {
    sent,
    addEventListener(type, fn) {
      listeners[type]?.push(fn);
    },
    send(str) {
      sent.push(JSON.parse(str));
    },
    emitMessage(obj) {
      const data = JSON.stringify(obj);
      for (const fn of listeners.message) fn({ data });
    },
    close() {
      for (const fn of listeners.close) fn({});
    },
  };
}

async function runTests() {
  console.log('=== Haru-machi Stage 5 WebSocket Co-Op Verification ===');

  const { server, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBaseUrl = `ws://127.0.0.1:${port}`;

  try {
    // 0. Verify HTTP static & status endpoints + X-Haru-Coop header
    const headRes = await fetch(`${baseUrl}/world/index.html`, { method: 'HEAD' });
    assert.equal(headRes.status, 200, 'HEAD /world/index.html should return 200');
    assert.equal(
      headRes.headers.get('x-haru-coop'),
      '1',
      'serve.mjs should advertise x-haru-coop: 1 header'
    );

    // 1. Connect Client A (Desktop / Pachgaon) -> Knight, Host
    const roomUrl = `${wsBaseUrl}/api/room/LOVE/websocket`;
    const clientA = await openWebSocket(roomUrl);
    clientA.ws.send(
      JSON.stringify({
        type: 'join',
        device: 'Desktop / Pachgaon (RX 6700)',
        preferredRole: 'Knight',
      })
    );

    const stateA1 = await clientA.nextMessage(
      (m) => m.type === 'room_state' && m.peerConnected === false,
      'Client A initial solo room_state'
    );
    assert.equal(stateA1.room, 'LOVE');
    assert.equal(stateA1.role, 'Knight');
    assert.equal(stateA1.isHost, true);
    assert.equal(stateA1.peerConnected, false);
    console.log('✓ 1a. Client A (Pachgaon) joined LOVE as Knight (Host, solo waiting)');

    // Connect Client B (Xiaomi Pad 7 / Sonipat) -> Mage, Guest
    const clientB = await openWebSocket(roomUrl);
    clientB.ws.send(
      JSON.stringify({
        type: 'join',
        device: 'Xiaomi Pad 7 / Sonipat',
        preferredRole: 'Mage',
      })
    );

    const [stateA2, stateB2] = await Promise.all([
      clientA.nextMessage(
        (m) => m.type === 'room_state' && m.peerConnected === true,
        'Client A paired room_state'
      ),
      clientB.nextMessage(
        (m) => m.type === 'room_state' && m.peerConnected === true,
        'Client B paired room_state'
      ),
    ]);

    assert.equal(stateA2.role, 'Knight');
    assert.equal(stateA2.isHost, true);
    assert.equal(stateA2.peerConnected, true);
    assert.equal(stateA2.peerRole, 'Mage');
    assert.equal(stateA2.players.length, 2);

    assert.equal(stateB2.role, 'Mage');
    assert.equal(stateB2.isHost, false);
    assert.equal(stateB2.peerConnected, true);
    assert.equal(stateB2.peerRole, 'Knight');
    assert.equal(stateB2.players.length, 2);
    console.log('✓ 1b. Client B (Sonipat) paired in LOVE as Mage (Guest), both peerConnected: true');

    // 2. Role swap (`swap_roles`) flips roles cleanly and restores them
    clientA.ws.send(JSON.stringify({ type: 'swap_roles' }));
    const [swapA1, swapB1] = await Promise.all([
      clientA.nextMessage(
        (m) => m.type === 'room_state' && m.role === 'Mage',
        'Client A swapped to Mage'
      ),
      clientB.nextMessage(
        (m) => m.type === 'room_state' && m.role === 'Knight',
        'Client B swapped to Knight'
      ),
    ]);
    assert.equal(swapA1.role, 'Mage');
    assert.equal(swapA1.peerRole, 'Knight');
    assert.equal(swapB1.role, 'Knight');
    assert.equal(swapB1.peerRole, 'Mage');

    // Swap back to Knight (A) + Mage (B)
    clientB.ws.send(JSON.stringify({ type: 'swap_roles' }));
    const [swapA2, swapB2] = await Promise.all([
      clientA.nextMessage(
        (m) => m.type === 'room_state' && m.role === 'Knight',
        'Client A restored to Knight'
      ),
      clientB.nextMessage(
        (m) => m.type === 'room_state' && m.role === 'Mage',
        'Client B restored to Mage'
      ),
    ]);
    assert.equal(swapA2.role, 'Knight');
    assert.equal(swapB2.role, 'Mage');
    console.log('✓ 2. Role swap (`swap_roles`) flipped Knight <-> Mage and restored cleanly');

    // 3. Mage sending `spell_cast` (`shatterlance` & `cinder_fall`) delivers to Knight with sword infusion metadata
    clientB.ws.send(
      JSON.stringify({
        type: 'spell_cast',
        spellId: 'shatterlance',
        origin: [64.0, 0.0, -4.0],
        target: [70.0, 0.0, -4.0],
        yaw: 1.57,
      })
    );
    const spellMsg1 = await clientA.nextMessage(
      (m) => m.type === 'spell_cast' && m.spellId === 'shatterlance',
      'Knight receives shatterlance spell_cast'
    );
    assert.equal(spellMsg1.fromRole, 'Mage');
    assert.equal(spellMsg1.infusion, 'rime');
    assert.equal(spellMsg1.breathingStyle, 'Glacial Tide');
    assert.equal(spellMsg1.mark, 'rime');
    assert.equal(spellMsg1.detonatesMark, true);
    assert.equal(spellMsg1.infusionDuration, 12);

    clientB.ws.send(
      JSON.stringify({
        type: 'spell_cast',
        spellId: 'cinder_fall',
        origin: [64.0, 0.0, -4.0],
        target: [72.0, 0.0, -2.5],
        yaw: 1.4,
      })
    );
    const spellMsg2 = await clientA.nextMessage(
      (m) => m.type === 'spell_cast' && m.spellId === 'cinder_fall',
      'Knight receives cinder_fall spell_cast'
    );
    assert.equal(spellMsg2.fromRole, 'Mage');
    assert.equal(spellMsg2.infusion, 'solar');
    assert.equal(spellMsg2.breathingStyle, 'Hinokami Sunfire');
    assert.equal(spellMsg2.mark, 'solar');
    assert.equal(spellMsg2.infusionDuration, 12);
    console.log('✓ 3. Mage `spell_cast` (`shatterlance` + `cinder_fall`) delivered to Knight with sword infusion metadata');

    // 4. Guest sending `enemy_hit` and Host broadcasting `world_sync` (> 200 bytes extended frame)
    clientB.ws.send(
      JSON.stringify({
        type: 'enemy_hit',
        enemyId: 'boss_sovereign',
        damage: 58,
        markApplied: 'rime',
        detonation: 'shatterblow',
        detonationDamage: 65,
        aegisBroken: 1,
      })
    );
    const hitMsg = await clientA.nextMessage(
      (m) => m.type === 'enemy_hit' && m.enemyId === 'boss_sovereign',
      'Host receives enemy_hit from Guest'
    );
    assert.equal(hitMsg.damage, 58);
    assert.equal(hitMsg.detonation, 'shatterblow');
    assert.equal(hitMsg.aegisBroken, 1);

    // Build a > 450 byte `world_sync` payload to exercise RFC 6455 126 (16-bit extended length) frames
    const largeWorldSync = {
      type: 'world_sync',
      act: 3,
      actName: 'Act III — Starlit North Shrine Boss Duel',
      tod: 'night',
      heartResonance: 84,
      empoweredBreathing: true,
      enemies: [
        { id: 'boss_sovereign', archetype: 'Boss_Sovereign', hp: 640, maxHp: 1400, x: 0.0, y: 8.0, z: -85.5, mark: 'solar', aegisLayers: 1 },
        { id: 'guard_1', archetype: 'Skeleton_Warrior', hp: 110, maxHp: 180, x: -4.2, y: 8.0, z: -82.0, mark: 'rime', aegisLayers: 0 },
        { id: 'guard_2', archetype: 'Skeleton_Warrior', hp: 95, maxHp: 180, x: 4.5, y: 8.0, z: -82.0, mark: null, aegisLayers: 0 },
      ],
    };
    const serializedSync = JSON.stringify(largeWorldSync);
    assert.ok(
      Buffer.byteLength(serializedSync, 'utf8') > 250,
      `Expected world_sync payload > 250 bytes, got ${Buffer.byteLength(serializedSync, 'utf8')}`
    );

    clientA.ws.send(serializedSync);
    const syncMsg = await clientB.nextMessage(
      (m) => m.type === 'world_sync' && m.act === 3,
      'Guest receives >250B world_sync frame'
    );
    assert.equal(syncMsg.enemies.length, 3);
    assert.equal(syncMsg.enemies[0].id, 'boss_sovereign');
    assert.equal(syncMsg.enemies[0].hp, 640);
    assert.equal(syncMsg.heartResonance, 84);

    // Also test rapid coalesced burst of `hero_state`, `action_event`, `revive_partner`, `act_transition`
    clientA.ws.send(JSON.stringify({ type: 'hero_state', x: 1.5, y: 0, z: 12.2, yaw: 0.5, anim: 'combo3' }));
    clientA.ws.send(JSON.stringify({ type: 'action_event', action: 'intercept', shieldAdded: 35 }));
    clientA.ws.send(JSON.stringify({ type: 'revive_partner', hpRestored: 100 }));
    clientA.ws.send(JSON.stringify({ type: 'act_transition', act: 2, tod: 'evening' }));

    const [heroRelay, actionRelay, reviveRelay, actRelay] = await Promise.all([
      clientB.nextMessage((m) => m.type === 'hero_state', 'Guest receives hero_state'),
      clientB.nextMessage((m) => m.type === 'action_event', 'Guest receives action_event'),
      clientB.nextMessage((m) => m.type === 'revive_partner', 'Guest receives revive_partner'),
      clientB.nextMessage((m) => m.type === 'act_transition', 'Guest receives act_transition'),
    ]);
    assert.equal(heroRelay.anim, 'combo3');
    assert.equal(actionRelay.action, 'intercept');
    assert.equal(reviveRelay.hpRestored, 100);
    assert.equal(actRelay.tod, 'evening');
    console.log(
      `✓ 4. Guest \`enemy_hit\`, Host extended-length \`world_sync\` (${Buffer.byteLength(serializedSync, 'utf8')} bytes), and rapid burst packets arrived intact`
    );

    // 5. Disconnecting Guest notifies Host (`peerConnected: false`) so Wingman AI resumes
    clientB.ws.close();
    const stateA3 = await clientA.nextMessage(
      (m) => m.type === 'room_state' && m.peerConnected === false,
      'Host notified of Guest disconnect'
    );
    assert.equal(stateA3.peerConnected, false);
    assert.equal(stateA3.isHost, true);
    assert.equal(stateA3.role, 'Knight');
    clientA.ws.close();
    console.log('✓ 5. Disconnecting Guest notified Host (`peerConnected: false`) for seamless Wingman AI resume');

    // 6. Verify `createCoopClient` high-level browser/Node API + silent solo fallback
    const roomEvents = [];
    const receivedSpells = [];
    const origConsoleError = console.error;
    const errorCalls = [];
    console.error = (...args) => errorCalls.push(args);

    try {
      // 6a. Offline / failed port fallback must produce ZERO console.error calls
      const soloClient = createCoopClient({
        roomCode: 'SOLO',
        wsUrl: 'ws://127.0.0.1:1/api/room/SOLO/websocket',
        onRoomState: (st) => roomEvents.push(st),
      });
      await new Promise((r) => setTimeout(r, 120));
      assert.equal(soloClient.getState().mode, 'solo');
      assert.equal(soloClient.getState().isHost, true);
      assert.equal(soloClient.getState().peerConnected, false);
      assert.equal(errorCalls.length, 0, 'coop-client must log zero console.error calls on offline fallback');
      soloClient.dispose();

      // 6b. Two `createCoopClient` instances communicating over `serve.mjs`
      let client1State = null;
      let client2State = null;
      const c1 = createCoopClient({
        roomCode: 'DUET',
        wsUrl: `${wsBaseUrl}/api/room/DUET/websocket`,
        preferredRole: 'Knight',
        onRoomState: (st) => {
          client1State = st;
        },
        onPeerSpellCast: (sp) => receivedSpells.push(sp),
      });
      await new Promise((r) => setTimeout(r, 80));

      const c2 = createCoopClient({
        roomCode: 'DUET',
        wsUrl: `${wsBaseUrl}/api/room/DUET/websocket`,
        preferredRole: 'Mage',
        onRoomState: (st) => {
          client2State = st;
        },
      });
      await new Promise((r) => setTimeout(r, 120));

      assert.equal(client1State?.peerConnected, true);
      assert.equal(client1State?.role, 'Knight');
      assert.equal(client2State?.peerConnected, true);
      assert.equal(client2State?.role, 'Mage');

      c2.sendSpellCast({
        spellId: 'storm_lance',
        origin: [0, 0, 0],
        target: [0, 0, -10],
        yaw: 0,
      });
      await new Promise((r) => setTimeout(r, 80));
      assert.equal(receivedSpells.length, 1);
      assert.equal(receivedSpells[0].spellId, 'storm_lance');
      assert.equal(receivedSpells[0].infusion, 'tempest');
      assert.equal(receivedSpells[0].breathingStyle, 'Thunderclap Wisteria');

      c1.dispose();
      c2.dispose();
      console.log('✓ 6. `createCoopClient` verified (2-client sync + zero-error offline Solo fallback)');
    } finally {
      console.error = origConsoleError;
    }

    // 7. Verify `CoopRoomDO` & `worker/index.js` Cloudflare Worker Durable Object protocol parity
    const doInstance = new CoopRoomDO({}, {});
    const mockWsA = createMockSocket();
    const mockWsB = createMockSocket();
    doInstance.attachSocket(mockWsA, { preferredRole: 'Knight', device: 'Pachgaon' });
    doInstance.attachSocket(mockWsB, { preferredRole: 'Mage', device: 'Sonipat' });

    const lastRoomA = mockWsA.sent.at(-1);
    const lastRoomB = mockWsB.sent.at(-1);
    assert.equal(lastRoomA.role, 'Knight');
    assert.equal(lastRoomA.peerConnected, true);
    assert.equal(lastRoomB.role, 'Mage');
    assert.equal(lastRoomB.peerConnected, true);

    mockWsB.emitMessage({ type: 'spell_cast', spellId: 'shatterlance' });
    assert.equal(mockWsA.sent.at(-1).type, 'spell_cast');
    assert.equal(mockWsA.sent.at(-1).breathingStyle, 'Glacial Tide');

    const mockEnv = {
      COOP_ROOMS: {
        idFromName: (name) => name,
        get: () => doInstance,
      },
      ASSETS: {
        fetch: async (req) => new Response(`static:${new URL(req.url).pathname}`, { status: 200 }),
      },
    };
    const statusRes = await workerEntry.fetch(
      new Request('https://haru-machi-coop.workers.dev/api/room/LOVE/status'),
      mockEnv
    );
    const statusJson = await statusRes.json();
    assert.equal(statusJson.ok, true);
    assert.equal(statusJson.room, 'LOVE');
    assert.equal(statusJson.playerCount, 2);

    const rootRes = await workerEntry.fetch(
      new Request('https://haru-machi-coop.workers.dev/'),
      mockEnv
    );
    assert.equal(rootRes.headers.get('x-haru-coop'), '1');
    assert.equal(await rootRes.text(), 'static:/world/index.html');
    console.log('✓ 7. Cloudflare `worker/index.js` & `CoopRoomDO` Durable Object verified');

    console.log('\nALL CO-OP ROOM & WEBSOCKET TESTS PASSED (100%)');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runTests().catch((err) => {
  console.error('Co-Op Room Test Failed:', err);
  process.exit(1);
});
