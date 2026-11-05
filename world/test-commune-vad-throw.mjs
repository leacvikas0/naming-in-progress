import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createCommuneClient,
  HOLD_SEND_THRESHOLD_SECONDS,
  SILENCE_AUTO_SEND_SECONDS,
  MIN_VOICED_SECONDS,
  MIN_SAFE_WORD_COUNT,
} from './src/combat/commune-client.js';
import { createEnemyManager } from './src/combat/enemy-manager.js';
import { ACT_DEFINITIONS } from './src/combat/combat-balance.js';

// 0. Verify exported VAD & Hold/Tap constants
assert.equal(HOLD_SEND_THRESHOLD_SECONDS, 1.5);
assert.equal(SILENCE_AUTO_SEND_SECONDS, 2.2);
assert.equal(MIN_VOICED_SECONDS, 0.35);
assert.equal(MIN_SAFE_WORD_COUNT, 2);

// 1. Test Hold >= 1.5s sends on release, while Tap < 1.5s stays in hands-free mode
let cancelledReason = null;
let cancelEvents = [];
let verdicts = [];
let mockServerOverride = null;

const client = createCommuneClient({
  useWallClockTimeout: false,
  fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    if (mockServerOverride) {
      const override = mockServerOverride;
      mockServerOverride = null;
      return {
        async json() {
          return override;
        },
      };
    }
    return {
      async json() {
        return {
          ok: true,
          verdict: 'blessing',
          transcript: body.transcriptHint || 'spoken prayer over mic',
        };
      },
    };
  },
  onCancel: (info) => {
    cancelledReason = info.reason;
    cancelEvents.push(info);
  },
  onVerdict: (j) => {
    verdicts.push(j);
  },
});

// Case A: Accidental empty tap (< 1.5s press, then second tap with < 2 words) -> Safe Cancel, 0 Smite!
await client.beginPress({ speakerRole: 'Knight', useWallClockTimeout: false });
client.update(0.4); // 0.4s < 1.5s
await client.endPress();
assert.equal(
  client.getState().state,
  'listening',
  'Tap < 1.5s must remain in hands-free listening mode'
);
assert.equal(client.getState().inputMode, 'hands_free');

// Tap again with 0 words spoken -> must safe-cancel with zero verdict
const cancelRes = await client.beginPress();
assert.equal(cancelRes.ok, false);
assert.equal(cancelRes.cancelled, true);
assert.equal(cancelledReason, 'empty_or_accidental_tap');
assert.equal(verdicts.length, 0);

// Case A2: Explicit < 2 words transcriptHint -> Safe Cancel without calling /api/commune
cancelledReason = null;
await client.beginPress({
  speakerRole: 'Knight',
  transcriptHint: 'Wait',
  useWallClockTimeout: false,
});
client.reportVoiceActivity({ rms: 0.15, dt: 0.5 });
client.update(1.6);
const shortCancelRes = await client.endPress();
assert.equal(shortCancelRes.cancelled, true);
assert.equal(cancelledReason, 'empty_or_accidental_tap');
assert.equal(verdicts.length, 0);

// Case A3: Server returns < 2 words transcript with smite -> intercepted as Safe Cancel, 0 Smite!
cancelledReason = null;
mockServerOverride = {
  ok: true,
  verdict: 'smite',
  transcript: 'uh',
};
await client.beginPress({
  speakerRole: 'Knight',
  useWallClockTimeout: false,
});
client.reportVoiceActivity({ rms: 0.22, dt: 0.6 });
client.update(1.6);
const serverShortCancelRes = await client.endPress();
assert.equal(serverShortCancelRes.cancelled, true);
assert.equal(cancelledReason, 'empty_or_accidental_tap');
assert.equal(verdicts.length, 0, 'Must never invoke onVerdict with Smite when transcript < 2 words');

// Case B: Tap < 1.5s + speech (>= 2 words) + 2.2s silence -> auto-sends!
await client.beginPress({
  speakerRole: 'Knight',
  transcriptHint: 'I offer my life for my beloved mage',
  useWallClockTimeout: false,
});
client.update(0.5);
await client.endPress();
client.reportVoiceActivity({ rms: 0.18, dt: 0.6 });
assert.equal(client.getState().hasSpokenWords, true);
client.reportVoiceActivity({ rms: 0.002, dt: 2.25 }); // > 2.2s silence after speech
await new Promise((r) => setTimeout(r, 20));
assert.equal(verdicts.length, 1);
assert.equal(verdicts[0].verdict, 'blessing');

// Case C: Hold >= 1.5s with valid speech -> sends immediately on endPress()
await client.beginPress({
  speakerRole: 'Mage',
  transcriptHint: 'Protect our bond under the crimson rose',
  useWallClockTimeout: false,
});
client.reportVoiceActivity({ rms: 0.2, dt: 1.6 });
client.update(1.6);
await client.endPress();
assert.equal(verdicts.length, 2);

// Case D: Live WebAudio AnalyserNode RMS sampling inside update(dt)
let simulatedMicAmplitude = 0.2;
class MockAudioContext {
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
  createAnalyser() {
    return {
      fftSize: 32,
      disconnect() {},
      getFloatTimeDomainData(buf) {
        buf.fill(simulatedMicAmplitude);
      },
    };
  }
}
const liveMicClient = createCommuneClient({
  useWallClockTimeout: false,
  AudioContextClass: MockAudioContext,
  mediaDevices: {
    async getUserMedia() {
      return {
        getTracks: () => [{ readyState: 'live', stop() {} }],
        getAudioTracks: () => [{ readyState: 'live', stop() {} }],
      };
    },
  },
  fetchImpl: async () => ({
    async json() {
      return { ok: true, verdict: 'blessing', transcript: 'live mic prayer words' };
    },
  }),
  onVerdict: (j) => verdicts.push(j),
});
await liveMicClient.beginPress({ speakerRole: 'Knight', useWallClockTimeout: false });
liveMicClient.update(0.45); // samples rms=0.20 for 0.45s >= 0.35s -> hasSpokenWords = true
await liveMicClient.endPress(); // < 1.5s -> hands_free
assert.equal(liveMicClient.getState().hasSpokenWords, true);
simulatedMicAmplitude = 0.001; // silence
liveMicClient.update(2.25); // 2.25s of silence in hands_free -> auto-send!
await new Promise((r) => setTimeout(r, 20));
assert.equal(verdicts.length, 3);

// 2. Test enemyManager.applyPrayerAirborneThrow (Frame 37: 6.5m radius, 0 dmg, vy > 8.5, 0.15x slow-mo, windup cancelled, arena fence clamped)
function createMockCharactersKit() {
  return {
    async loadAnimationPacks() {},
    async createCharacter(role) {
      const group = new THREE.Group();
      const modelRoot = new THREE.Group();
      group.add(modelRoot);
      return {
        role,
        group,
        modelRoot,
        mixer: { timeScale: 1.0 },
        anim: { currentKey: 'idle' },
        lastPlayClip: null,
        lastPlayOpts: null,
        play(clipKey, opts = {}) {
          this.anim.currentKey = clipKey;
          this.lastPlayClip = clipKey;
          this.lastPlayOpts = opts;
        },
        poseAt() {},
        update() {},
      };
    },
  };
}

const arenaCenter = ACT_DEFINITIONS.act1_arena.center;
const maxAllowedArenaRadius = ACT_DEFINITIONS.act1_arena.fenceRadius - 1.1;
const scene = new THREE.Scene();
let playerHitCount = 0;

const enemyManager = await createEnemyManager({
  scene,
  kit: createMockCharactersKit(),
  walkableHeightAt: () => 0,
  onPlayerHit: () => {
    playerHitCount++;
  },
});

enemyManager.setCurrentActId('act1_arena');

// Spawn one enemy close to prayer center in active attack windup, and one near the arena fence edge
const eClose = enemyManager.spawnImmediateFromSpec({
  archetype: 'warrior',
  x: arenaCenter.x + maxAllowedArenaRadius - 2.2,
  z: arenaCenter.z,
});
const eEdge = enemyManager.spawnImmediateFromSpec({
  archetype: 'rogue',
  x: arenaCenter.x + maxAllowedArenaRadius - 0.3,
  z: arenaCenter.z + 0.4,
});
const eFar = enemyManager.spawnImmediateFromSpec({
  archetype: 'mage',
  x: arenaCenter.x - 10.0,
  z: arenaCenter.z,
});

// Put eClose into an active windup 0.01s away from hitting the player
eClose.aiState = 'windup';
eClose.windupTimer = eClose.windupDuration - 0.01;
eClose.telegraphProgress = 0.98;
eClose.hasAttackToken = true;

const initialCloseHp = eClose.hp;
const initialEdgeHp = eEdge.hp;

const prayerCenter = {
  x: arenaCenter.x + maxAllowedArenaRadius - 3.5,
  y: 0,
  z: arenaCenter.z,
};

const throwRes = enemyManager.applyPrayerAirborneThrow(prayerCenter, 6.5);
assert.equal(throwRes.thrownCount, 2, 'Only the 2 enemies within 6.5m must be thrown');

// Verify 0 damage, vy > 8.5, !grounded, 0.15x slow-mo, Hit_B, windup cancelled
for (const e of [eClose, eEdge]) {
  assert.equal(e.hp, e === eClose ? initialCloseHp : initialEdgeHp, 'Prayer throw must deal 0 HP damage');
  assert.ok(e.vy > 8.5 && e.vy <= 12.2, `Expected vy in 8.8..12.2, got ${e.vy}`);
  assert.equal(e.grounded, false, 'Thrown enemy must be airborne (!grounded)');
  assert.equal(e.char.mixer.timeScale, 0.15, 'Thrown enemy mixer must be in 0.15x slow-mo');
  assert.equal(e.char.lastPlayClip, 'Hit_B', 'Thrown enemy must play Hit_B');
  assert.equal(e.char.lastPlayOpts?.timeScale, 0.15);
  assert.equal(e.aiState, 'orbit', 'Active windup must be cancelled');
  assert.equal(e.windupTimer, 0);
  assert.equal(e.telegraphProgress, 0);
  assert.equal(e.hasAttackToken, false);
  assert.ok(e.stunTimer >= 2.6);
  assert.ok(e.knockdownTimer >= 2.4);
  assert.ok(e.slowTimer >= 3.0);
  assert.equal(e.slowFactor, 0.85);
}

// Verify eFar (outside 6.5m) was untouched
assert.equal(eFar.grounded, true);
assert.equal(eFar.vy, 0);

// Step physics while airborne: verify 0.15x mixer slow-mo persists in air, 0 player hits, and arena fence clamping holds
enemyManager.update(0.1, {
  Knight: { id: 'Knight', x: prayerCenter.x, y: 0, z: prayerCenter.z },
  Mage: { id: 'Mage', x: prayerCenter.x + 1.0, y: 0, z: prayerCenter.z },
});
assert.equal(playerHitCount, 0, 'Cancelled windup must never hit the player');
assert.equal(eClose.grounded, false);
assert.ok(eClose.y > 0.5, 'Airborne enemy must rise into the air');
assert.equal(eClose.char.mixer.timeScale, 0.15, 'Mixer timeScale must stay 0.15 while airborne');

const edgeDistFromCenter = Math.hypot(eEdge.x - arenaCenter.x, eEdge.z - arenaCenter.z);
assert.ok(
  edgeDistFromCenter <= maxAllowedArenaRadius + 1e-4,
  `Thrown enemy must stay clamped inside East Wisteria Arena fence (${edgeDistFromCenter} <= ${maxAllowedArenaRadius})`
);

// Step until enemies land back on ground (e.y <= groundY) and confirm mixer speed restores
for (let step = 0; step < 30; step++) {
  enemyManager.update(0.05, {
    Knight: { id: 'Knight', x: prayerCenter.x, y: 0, z: prayerCenter.z },
    Mage: { id: 'Mage', x: prayerCenter.x + 1.0, y: 0, z: prayerCenter.z },
  });
  const dEdge = Math.hypot(eEdge.x - arenaCenter.x, eEdge.z - arenaCenter.z);
  assert.ok(dEdge <= maxAllowedArenaRadius + 1e-4, 'Fence clamp must hold on every airborne frame');
}

assert.equal(eClose.grounded, true, 'Enemy must land cleanly back on walkable ground');
assert.equal(eClose.y, 0);
assert.equal(eClose.char.mixer.timeScale, 1.0, 'Mixer timeScale must restore after landing');

// Also verify applySacredWardPushback with { initialBurst: true } delegates to applyPrayerAirborneThrow
const burstDelegateRes = enemyManager.applySacredWardPushback(prayerCenter, 6.5, {
  initialBurst: true,
});
assert.ok(burstDelegateRes.thrownCount >= 1);
assert.equal(eClose.grounded, false);

console.log('PASS test-commune-vad-throw');
