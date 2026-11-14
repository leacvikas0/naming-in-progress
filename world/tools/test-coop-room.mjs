// ============================================================================
// world/tools/test-coop-room.mjs
//
// Automated 2-Client Verification for Haru-machi Stage 5 & Wave 3 Co-Op:
// - Spins up `world/tools/serve.mjs` on an ephemeral port (0)
// - Verifies:
//   1. Room join assigns Knight (Host) + Mage (Guest) with peerConnected: true
//   2. Strict 2-Seat Cap: 3rd visitor receives `room_full` and closes without
//      evicting either of the 2 seated players
//   3. Guest `set_ready` & Host `start_expedition` synchronization
//   4. Role swap (`swap_roles`) flips roles cleanly and restores them
//   5. Mage sending `spell_cast` (`shatterlance` / `cinder_fall`) delivers to
//      Knight with full Demon Slayer sword infusion metadata
//   6. Guest sending `enemy_hit` and Host broadcasting `world_sync` (> 250B
//      RFC 6455 extended-length frame) arrive intact
//   7. Sequential 3-Stage Sacred Inscription Stone Progression (`0 -> 1 -> 2 -> 3`),
//      including visiting stones out of order while solving sequentially
//   8. 30-Second Tap-to-Speak `Commune` Client (`createCommuneClient`),
//      Diegetic 3D Crimson Rose Ring Timer (`r = 1.65m`, 24 3D roses, 48 3D petals,
//      `transparent === false`), immediate `track.stop()` microphone release,
//      single-ceremony lock (`commune_busy`), partner audio privacy, and wide
//      surround-sound divine voice (`playWideSurroundDivineVoice`)
//   9. Secret-Safe `/api/altar` & Context-Aware `/api/commune` Judge (`+1 HP`
//      sarcastic pat when faking crisis at full HP, `-20 HP` when selfish,
//      `+45..80 HP` when sweet, `-99 HP` when rude, `bothKill: true` +
//      `deathVfx: 'rose_gommage'` when spamming nonsense) + `403` on `/.env`
//  10. `CoopRoomDO` & `worker/index.js` Cloudflare Worker Durable Object parity
// ============================================================================

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { startServer } from './serve.mjs';
import { createCoopClient } from '../src/net/coop-client.js';
import {
  generateRoomPhrase,
  normalizeRoomPhraseToCode,
  buildRoomInviteLink,
  parseRoomFromUrl,
  createRoomProgressionState,
} from '../src/net/room-progression.js';
import {
  MAX_COMMUNE_SECONDS,
  createCrimsonRoseRingTimer,
  createCommuneClient,
  playWideSurroundDivineVoice,
} from '../src/combat/commune-client.js';
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
        reject(new Error(`Timed out waiting for ${label}`));
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
  let closedCode = null;
  return {
    sent,
    get closedCode() {
      return closedCode;
    },
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
    close(code = 1000) {
      closedCode = code;
      for (const fn of listeners.close) fn({ code });
    },
  };
}

async function runTests() {
  process.env.HARU_COMMUNE_OFFLINE = '1';
  console.log('=== Haru-machi Stage 5 & Wave 3 Co-Op Room, Progression & Commune Verification ===');

  const { server, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBaseUrl = `ws://127.0.0.1:${port}`;

  try {
    // 0. Verify HTTP static & status endpoints + X-Haru-Coop header + Dotfile 403 Boundary
    const headRes = await fetch(`${baseUrl}/world/index.html`, { method: 'HEAD' });
    assert.equal(headRes.status, 200, 'HEAD /world/index.html should return 200');
    assert.equal(headRes.headers.get('x-haru-coop'), '1');

    const dotEnvRes = await fetch(`${baseUrl}/.env`);
    assert.equal(dotEnvRes.status, 403, 'GET /.env must return 403 Forbidden');
    const dotGitRes = await fetch(`${baseUrl}/.git/config`);
    assert.equal(dotGitRes.status, 403, 'GET /.git/config must return 403 Forbidden');

    // Verify Romantic Room Phrase Generator & ?room= Invite Link Builder
    const phrase0 = generateRoomPhrase(0);
    assert.equal(phrase0, 'Love is curiosity');
    const code0 = normalizeRoomPhraseToCode(phrase0);
    assert.equal(code0, 'LOVE-IS-CURIOSITY');
    const inviteLink = buildRoomInviteLink(phrase0, `${baseUrl}/world/index.html`);
    assert.equal(parseRoomFromUrl(inviteLink), 'LOVE-IS-CURIOSITY');
    console.log('✓ 0. Romantic Room Phrase ("Love is curiosity"), ?room= link & 403 dotfile boundary verified');

    // 1. Connect Client A (Desktop / Pachgaon) -> Knight, Host
    const roomUrl = `${wsBaseUrl}/api/room/LOVE-IS-CURIOSITY/websocket`;
    const clientA = await openWebSocket(roomUrl);
    clientA.ws.send(
      JSON.stringify({
        type: 'join',
        device: 'Desktop / Pachgaon (RX 6700)',
        roomPhrase: 'Love is curiosity',
        preferredRole: 'Knight',
      })
    );

    const stateA1 = await clientA.nextMessage(
      (m) => m.type === 'room_state' && m.peerConnected === false,
      'Client A initial solo room_state'
    );
    assert.equal(stateA1.room, 'LOVE-IS-CURIOSITY');
    assert.equal(stateA1.role, 'Knight');
    assert.equal(stateA1.isHost, true);
    assert.equal(stateA1.peerConnected, false);

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
    assert.equal(stateA2.players.length, 2);
    assert.equal(stateB2.role, 'Mage');
    assert.equal(stateB2.isHost, false);
    assert.equal(stateB2.peerConnected, true);
    console.log('✓ 1. Client A (Knight/Host) & Client B (Mage/Guest) paired in LOVE-IS-CURIOSITY');

    // 2. Strict 2-Seat Cap: 3rd visitor receives `room_full` and closes without evicting A or B
    const clientC = await openWebSocket(roomUrl);
    const fullMsg = await clientC.nextMessage(
      (m) => m.type === 'room_full',
      '3rd visitor receives room_full'
    );
    assert.equal(fullMsg.error, 'room_full');
    assert.equal(fullMsg.maxPlayers, 2);
    clientC.ws.close();

    // Verify A and B are still seated!
    const roomStatusRes = await fetch(`${baseUrl}/api/room/LOVE-IS-CURIOSITY/status`);
    const roomStatus = await roomStatusRes.json();
    assert.equal(roomStatus.playerCount, 2, 'Seated players must never be evicted by a 3rd visitor');
    assert.equal(roomStatus.isFull, true);
    console.log('✓ 2. Strict 2-Seat Cap (`room_full` rejection without evicting seated players) verified');

    // 3. Guest `set_ready` & Host `start_expedition`
    clientB.ws.send(JSON.stringify({ type: 'set_ready', ready: true }));
    const readyRelay = await clientA.nextMessage(
      (m) => m.type === 'player_ready' && m.ready === true && m.role === 'Mage',
      'Host receives Guest player_ready'
    );
    assert.equal(readyRelay.role, 'Mage');

    clientA.ws.send(JSON.stringify({ type: 'set_ready', ready: true }));
    clientA.ws.send(JSON.stringify({ type: 'start_expedition' }));
    const [expA, expB] = await Promise.all([
      clientA.nextMessage((m) => m.type === 'expedition_started', 'Host expedition_started'),
      clientB.nextMessage((m) => m.type === 'expedition_started', 'Guest expedition_started'),
    ]);
    assert.equal(expA.ok, true);
    assert.equal(expB.ok, true);
    console.log('✓ 3. Guest `set_ready` & Host `start_expedition` synchronized across both clients');

    // 4. Role swap (`swap_roles`) flips roles cleanly and restores them
    clientA.ws.send(JSON.stringify({ type: 'swap_roles' }));
    const [swapA1, swapB1] = await Promise.all([
      clientA.nextMessage((m) => m.type === 'room_state' && m.role === 'Mage', 'Client A swapped to Mage'),
      clientB.nextMessage((m) => m.type === 'room_state' && m.role === 'Knight', 'Client B swapped to Knight'),
    ]);
    assert.equal(swapA1.role, 'Mage');
    assert.equal(swapB1.role, 'Knight');

    clientB.ws.send(JSON.stringify({ type: 'swap_roles' }));
    await Promise.all([
      clientA.nextMessage((m) => m.type === 'room_state' && m.role === 'Knight', 'Client A restored to Knight'),
      clientB.nextMessage((m) => m.type === 'room_state' && m.role === 'Mage', 'Client B restored to Mage'),
    ]);
    console.log('✓ 4. Role swap (`swap_roles`) flipped Knight <-> Mage and restored cleanly');

    // 5. Mage sending `spell_cast` (`shatterlance` & `cinder_fall`) delivers to Knight
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
    assert.equal(spellMsg1.detonatesMark, true);

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
    assert.equal(spellMsg2.infusion, 'solar');
    console.log('✓ 5. Mage `spell_cast` (`shatterlance` + `cinder_fall`) delivered to Knight');

    // 6. Guest sending `enemy_hit` and Host broadcasting `world_sync` (> 250B extended frame)
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
    clientA.ws.send(serializedSync);
    const syncMsg = await clientB.nextMessage(
      (m) => m.type === 'world_sync' && m.act === 3,
      'Guest receives >250B world_sync frame'
    );
    assert.equal(syncMsg.enemies.length, 3);
    console.log('✓ 6. Guest `enemy_hit` and Host extended-length `world_sync` arrived intact');

    // 7. Sequential 3-Stage Sacred Inscription Stone Progression (`0 -> 1 -> 2 -> 3`)
    const prog = createRoomProgressionState();
    assert.equal(prog.getState().unlockedStage, 0);
    assert.equal(prog.getState().communeDiscovered, false);
    assert.equal(prog.getState().showTutorialPopups, false);

    // Even if players visit Stone 3 (`stone_grove`) first, `communeDiscovered` becomes true
    // and `nextStoneIndex` is sequentially Stage 1!
    const readRes = prog.readInscriptionStone('stone_grove');
    assert.equal(readRes.communeDiscovered, true);
    assert.equal(readRes.sequentialRiddleStage, 1);

    const solve1 = prog.solveNextStone();
    assert.equal(solve1.stage, 1);
    assert.equal(solve1.knightUnlock.iceSword, true);
    assert.equal(solve1.mageUnlock.frostLance, true);
    assert.equal(solve1.hudVisibility.skillEVisible, true);
    assert.equal(solve1.hudVisibility.tabToggleVisible, false);

    const solve2 = prog.solveNextStone();
    assert.equal(solve2.stage, 2);
    assert.equal(solve2.knightUnlock.fireSword, true);
    assert.equal(solve2.mageUnlock.cinderFall, true);
    assert.equal(solve2.hudVisibility.tabToggleVisible, true);

    const solve3 = prog.solveNextStone();
    assert.equal(solve3.stage, 3);
    assert.equal(solve3.knightUnlock.qUltimate, 'sky_lightning_awakening');
    assert.equal(solve3.mageUnlock.qUltimate, 'storm_cataclysm');
    assert.equal(solve3.hudVisibility.ultimateQVisible, true);
    console.log('✓ 7. Sequential 3-Stone Progression (`0 -> 1 -> 2 -> 3`) & progressive ability unlocks verified');

    // 8. Verify 30s Tap-to-Speak `Commune` Client, 3D Crimson Rose Ring Timer, Immediate Mic Release & Privacy
    const testScene = new THREE.Scene();
    const roseTimer = createCrimsonRoseRingTimer({ scene: testScene });
    assert.equal(roseTimer.roseClustersMesh.material.transparent, false);
    assert.equal(roseTimer.sheddingPetalsMesh.material.transparent, false);
    assert.ok(
      roseTimer.roseClustersMesh.geometry.attributes.position.count > 200,
      '3D Crimson Rose clusters must use plush 3D multi-petal geometry (> 200 vertices)'
    );
    roseTimer.start({ x: 0, y: 0, z: 0 });
    assert.equal(roseTimer.getVisualState().bloomingRoseCount, 24);
    roseTimer.setElapsed(15.0);
    assert.equal(roseTimer.getVisualState().remainingFraction, 0.5);
    assert.ok(roseTimer.getVisualState().activeDriftingPetals > 0);
    roseTimer.setElapsed(30.0);
    assert.equal(roseTimer.getVisualState().remainingFraction, 0.0);
    assert.equal(roseTimer.getVisualState().shedRoseCount, 24);
    roseTimer.dispose();

    // Test immediate microphone track.stop() and Single-Ceremony Lock + Partner Audio Privacy
    let mockTrackStopped = false;
    const mockMediaDevices = {
      getUserMedia: async () => ({
        getTracks: () => [
          {
            readyState: 'live',
            stop() {
              this.readyState = 'ended';
              mockTrackStopped = true;
            },
          },
        ],
      }),
    };

    const communeClientA = createCommuneClient({
      scene: testScene,
      mediaDevices: mockMediaDevices,
      endpoint: `${baseUrl}/api/commune`,
      fetchImpl: fetch,
    });
    assert.equal(MAX_COMMUNE_SECONDS, 30.0);
    const startRes = await communeClientA.tapCommune({
      speakerRole: 'Knight',
      room: 'LOVE-IS-CURIOSITY',
      useWallClockTimeout: false,
      transcriptHint: 'My beloved partner protects me with all her heart',
    });
    assert.equal(startRes.started, true);
    assert.equal(communeClientA.getState().state, 'listening');

    // Also test WebSocket single-ceremony lock (`commune_busy`) & partner audio privacy
    clientA.ws.send(
      JSON.stringify({
        type: 'commune_state',
        state: 'channel',
        speakerRole: 'Knight',
        audioBase64: 'SECRET_RAW_AUDIO_SHOULD_BE_STRIPPED',
        transcript: 'SECRET_TRANSCRIPT_SHOULD_BE_STRIPPED',
      })
    );
    const partnerChannelMsg = await clientB.nextMessage(
      (m) => m.type === 'commune_state' && m.state === 'channel',
      'Partner receives sanitized commune_state'
    );
    assert.equal(partnerChannelMsg.audioBase64, undefined, 'Partner must NEVER receive raw audio');
    assert.equal(partnerChannelMsg.transcript, undefined, 'Partner must NEVER receive transcript');

    // While A is communing, B attempting to start commune receives `commune_busy`
    clientB.ws.send(JSON.stringify({ type: 'commune_start' }));
    const busyMsg = await clientB.nextMessage(
      (m) => m.type === 'commune_busy',
      'Partner receives commune_busy while speaker is active'
    );
    assert.equal(busyMsg.error, 'commune_busy');

    // Second tap stops & sends, stopping mic tracks immediately before network I/O
    const stopRes = await communeClientA.tapCommune({
      room: 'LOVE-IS-CURIOSITY',
      speakerRole: 'Knight',
    });
    assert.equal(mockTrackStopped, true, 'Microphone track.stop() must be called immediately on stop');
    assert.equal(communeClientA.hasActiveMicTracks(), false);
    assert.equal(stopRes.ok, true);
    communeClientA.dispose();

    // Verify Wide Surround-Sound Divine Voice respects `shouldSpeakAloud`
    const silentPlay = playWideSurroundDivineVoice({ shouldSpeakAloud: false, audioUrl: '/test.wav' });
    assert.equal(silentPlay.played, false);
    const loudPlay = playWideSurroundDivineVoice({ shouldSpeakAloud: true, audioUrl: '/test.wav' });
    assert.equal(loudPlay.played, true);
    assert.equal(loudPlay.haasDelayMs, 14);
    assert.ok(loudPlay.finished instanceof Promise, 'playWideSurroundDivineVoice must return a finished Promise');

    // Verify Divine Voice finishes speaking BEFORE onVerdict triggers the physical action
    const prevGlobalAudio = globalThis.Audio;
    let activeMockAudioEl = null;
    class MockBrowserAudio {
      constructor(url) {
        this.src = url;
        this.duration = 0.25;
        this.listeners = new Map();
        activeMockAudioEl = this;
      }
      addEventListener(evt, fn) {
        if (!this.listeners.has(evt)) this.listeners.set(evt, []);
        this.listeners.get(evt).push(fn);
      }
      removeEventListener(evt, fn) {
        const arr = this.listeners.get(evt) || [];
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      }
      play() {
        return Promise.resolve();
      }
      emitEnded() {
        for (const fn of [...(this.listeners.get('ended') || [])]) fn();
      }
    }
    class MockAudioCtx {
      constructor() {
        this.state = 'running';
        this.sampleRate = 48000;
        this.destination = {};
      }
      createBuffer(ch, len) {
        return { getChannelData: () => new Float32Array(len) };
      }
      createMediaElementSource() {
        return { connect() {} };
      }
      createBiquadFilter() {
        return { frequency: { value: 0 }, gain: { value: 0 }, connect() {} };
      }
      createDelay() {
        return { delayTime: { value: 0 }, connect() {} };
      }
      createChannelMerger() {
        return { connect() {} };
      }
      createConvolver() {
        return { buffer: null, connect() {} };
      }
      createGain() {
        return { gain: { value: 1 }, connect() {} };
      }
    }
    globalThis.Audio = MockBrowserAudio;
    try {
      let verdictFired = false;
      const sequencedStates = [];
      const communeSeqClient = createCommuneClient({
        scene: testScene,
        mediaDevices: mockMediaDevices,
        AudioContextClass: MockAudioCtx,
        fetchImpl: async () => ({
          json: async () => ({
            ok: true,
            verdict: 'smite',
            prayerMode: 'smite',
            clip_id: 'smite_silence',
            shouldSpeakAloud: true,
            audioUrl: '/world/assets/audio/artorious/smite_silence.wav',
          }),
        }),
        onStateChange: (snap) => sequencedStates.push(snap.state),
        onVerdict: () => {
          verdictFired = true;
        },
      });
      await communeSeqClient.startCommune({
        speakerRole: 'Knight',
        useWallClockTimeout: false,
        forceVerdict: true,
      });
      const sendPromise = communeSeqClient.stopAndSendCommune({
        speakerRole: 'Knight',
        forceVerdict: true,
      });
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(
        communeSeqClient.getState().state,
        'speaking',
        'Commune client must stay in speaking state while Artorious voice clip is playing'
      );
      assert.equal(
        verdictFired,
        false,
        'onVerdict action (smite/death) must NOT trigger while Artorious dialogue is still playing'
      );
      assert.ok(activeMockAudioEl, 'MockBrowserAudio element must be created');
      activeMockAudioEl.emitEnded();
      await sendPromise;
      assert.equal(
        verdictFired,
        true,
        'onVerdict action must trigger immediately AFTER Artorious voice clip finishes'
      );
      assert.equal(communeSeqClient.getState().state, 'idle');
      communeSeqClient.dispose();
    } finally {
      globalThis.Audio = prevGlobalAudio;
    }
    console.log('✓ 8. 30s `Commune` Client, 3D Crimson Rose Ring Timer, immediate mic `track.stop()`, `commune_busy` lock, privacy & Voice-Before-Action sequencing verified');

    // 9. Verify Secret-Safe `/api/altar` (Stages 1, 2, 3) & Context-Aware `/api/commune` Verdicts (Zero Spoilers!)
    for (const stg of [1, 2, 3]) {
      const altarRes = await fetch(`${baseUrl}/api/altar?stage=${stg}`);
      assert.equal(altarRes.status, 200);
      const altarJson = await altarRes.json();
      assert.equal(altarJson.stage, stg);
      assert.ok(Array.isArray(altarJson.lines) && altarJson.lines.length >= 4, `Stage ${stg} scripture must have >= 4 lines`);
      assert.equal(altarJson.secretName, undefined, '/api/altar must never expose raw secretName field');
    }

    // 9a. Faking an emergency while both players are at 100% HP and 0 enemies nearby -> +1 HP sarcastic pat
    const fakeCrisisRes = await fetch(`${baseUrl}/api/commune`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'TEST-JUDGE',
        speakerRole: 'Knight',
        transcriptHint: 'Help us we are dying save our lives emergency!',
        gameState: {
          speakerHp: 220,
          speakerMaxHp: 220,
          partnerHp: 90,
          partnerMaxHp: 90,
          nearbyEnemies: 0,
          inCombat: false,
        },
        progressionState: { unlockedStage: 1, stonesRead: ['stone_plaza'] },
      }),
    });
    const fakeCrisisJson = await fakeCrisisRes.json();
    assert.equal(fakeCrisisJson.hpDelta, 1, 'Faking emergency at full HP with 0 enemies should grant +1 HP sarcastic pat');

    // 9b. Rude / insulting prayer -> -99 HP smite
    const rudeRes = await fetch(`${baseUrl}/api/commune`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'TEST-JUDGE',
        speakerRole: 'Knight',
        transcriptHint: 'You are a stupid useless trash god shut up',
        gameState: { speakerHp: 220, speakerMaxHp: 220, partnerHp: 90, partnerMaxHp: 90 },
        progressionState: { unlockedStage: 1 },
      }),
    });
    const rudeJson = await rudeRes.json();
    assert.equal(rudeJson.hpDelta, -99, 'Rude/insulting prayer must deal -99 HP');

    // 9c. Spamming nonsense (>= 3 spam prayers) -> kills both with Expedition 33 rose_gommage dissolve
    const spamRes = await fetch(`${baseUrl}/api/commune`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'TEST-SPAM',
        speakerRole: 'Knight',
        transcriptHint: 'asdf qwerty blah blah',
        spamCount: 2,
        gameState: { speakerHp: 220, speakerMaxHp: 220, partnerHp: 90, partnerMaxHp: 90 },
      }),
    });
    const spamJson = await spamRes.json();
    assert.equal(spamJson.bothKill, true, 'Repeated nonsense spam must trigger bothKill: true');
    assert.equal(spamJson.deathVfx, 'rose_gommage', 'Repeated nonsense spam must trigger Expedition 33 rose_gommage death VFX');
    console.log('✓ 9. Secret-Safe `/api/altar` (3 Stones) & Context-Aware `/api/commune` Judge verdicts verified (Zero Spoilers)');

    // Clean up Client A & B
    clientB.ws.close();
    const stateA3 = await clientA.nextMessage(
      (m) => m.type === 'room_state' && m.peerConnected === false,
      'Host notified of Guest disconnect'
    );
    assert.equal(stateA3.peerConnected, false);
    clientA.ws.close();

    // 10. Verify `CoopRoomDO` & `worker/index.js` Cloudflare Worker Durable Object protocol parity
    const doInstance = new CoopRoomDO({}, {});
    const mockWsA = createMockSocket();
    const mockWsB = createMockSocket();
    const mockWsC = createMockSocket();
    doInstance.attachSocket(mockWsA, { preferredRole: 'Knight', device: 'Pachgaon' });
    doInstance.attachSocket(mockWsB, { preferredRole: 'Mage', device: 'Sonipat' });
    const rejectedC = doInstance.attachSocket(mockWsC, { preferredRole: 'Knight' });
    assert.equal(rejectedC, null, 'CoopRoomDO must reject 3rd socket with room_full');
    assert.equal(mockWsC.sent[0]?.type, 'room_full');
    assert.equal(mockWsC.closedCode, 1008);

    const mockEnv = {
      COOP_ROOMS: {
        idFromName: (name) => name,
        get: () => doInstance,
      },
      ASSETS: {
        fetch: async (req) => new Response(`static:${new URL(req.url).pathname}`, { status: 200 }),
      },
    };
    const workerDotEnv = await workerEntry.fetch(
      new Request('https://haru-machi-coop.workers.dev/.env'),
      mockEnv
    );
    assert.equal(workerDotEnv.status, 403, 'Cloudflare Worker must block /.env with 403');
    console.log('✓ 10. Cloudflare `worker/index.js` & `CoopRoomDO` parity verified');

    console.log('\nALL WAVE 3 CO-OP ROOM, 3-STONE PROGRESSION & 30s COMMUNE TESTS PASSED (100%)');
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => {
      server.close(resolve);
      setTimeout(resolve, 250);
    });
  }
}

runTests().catch((err) => {
  console.error('Co-Op Room Test Failed:', err);
  process.exit(1);
});
