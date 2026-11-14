// ============================================================================
// world/src/net/coop-client.js
//
// Browser & Node Dual-Plane Co-Op Client for Haru-machi (Stage 5 / Wave 3 & 4):
// - Always-On Edge WebSocket Fast-Path (`25 Hz` JSON + `0x02` binary passthrough)
//   with background WebRTC P2P upgrade (`RTCPeerConnection` + `RTCDataChannel`
//   `unreliable` `{ ordered: false, maxRetransmits: 0 }` at `60 Hz` 28-byte binary
//   + `reliable` `{ ordered: true }`, polite/impolite glare handling, and STUN
//   `stun:stun.cloudflare.com:3478`).
// - 28-byte `DataView` Binary Hero State Codec (`encodeHeroStateBinary` /
//   `decodeHeroStateBinary`) with `< 0.02mm` float32 position accuracy, `< 0.001 m/s`
//   velocity accuracy, `±π` yaw wrap, role/state bitflags, and monotonic `seq` drop.
// - Auto-Reconnect (`300ms`, `800ms`, `1500ms`) preserving `roomCode`, `role`,
//   `playerName`, `claimed`, `expeditionStarted`, and `progression` across Wi-Fi blips.
// - Mutual Flower Field Lobby ceremony (`sendLobbyClaim`, `onLobbyClaim`),
//   `sendElementToggle` / `onElementToggle`, `sendAimState` / `onAimState`,
//   and mid-run reconnect state recovery (`requestFullSnapshot` / `sendFullSnapshot`).
// ============================================================================

import {
  generateRoomPhrase,
  normalizeRoomPhraseToCode,
  formatRoomCodeToPhrase,
  buildRoomInviteLink,
  parseRoomFromUrl,
  createRoomProgressionState,
} from './room-progression.js';

export {
  generateRoomPhrase,
  normalizeRoomPhraseToCode,
  formatRoomCodeToPhrase,
  buildRoomInviteLink,
  parseRoomFromUrl,
  createRoomProgressionState,
};

export const HERO_STATE_BINARY_TYPE = 0x01;
export const HERO_STATE_BINARY_BYTES = 28;
export const RECONNECT_BACKOFF_MS = Object.freeze([300, 800, 1500]);

const HERO_CLIP_NAMES = Object.freeze([
  'idle',
  'walk',
  'run',
  'sprint',
  'jump_start',
  'jump_idle',
  'jump_land',
  'dash',
  'combo1',
  'combo2',
  'combo3',
  'combo4',
  'mage_attack1',
  'mage_attack2',
  'mage_attack3',
  'mage_heavy',
  'cast_spell',
  'cast_shoot',
  'charge',
  'skill',
  'ultimate',
  'block',
  'hit',
  'downed',
  'revive',
  'pray',
]);

const CLIP_NAME_TO_ID = new Map(HERO_CLIP_NAMES.map((name, idx) => [name, idx]));

const HERO_ACTION_NAMES = Object.freeze([
  '',
  'combo1',
  'combo2',
  'combo3',
  'combo4',
  'dash',
  'skill',
  'ultimate',
  'block',
  'shield_block',
  'mage_attack1',
  'mage_attack2',
  'mage_attack3',
  'mage_heavy',
  'cast_spell',
  'cast_shoot',
  'charge',
  'hit',
  'downed',
  'revive',
]);

const ACTION_NAME_TO_ID = new Map(HERO_ACTION_NAMES.map((name, idx) => [name, idx]));

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function wrapAnglePi(rad) {
  const num = Number(rad) || 0;
  const twoPi = Math.PI * 2;
  let wrapped = ((num + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (wrapped <= -Math.PI && num > 0) {
    wrapped = Math.PI;
  }
  return wrapped;
}

/**
 * Encodes a hero kinematic state into a compact 28-byte `ArrayBuffer`:
 * - Byte 0 (`Uint8`): `0x01` (`HERO_STATE_BINARY_TYPE`)
 * - Byte 1 (`Uint8`): `roleBitFlags`
 *     bit 0 (`0x01`): `role === 'Mage'` (`0` = Knight, `1` = Mage)
 *     bit 1 (`0x02`): `grounded`
 *     bit 2 (`0x04`): `shieldBlocking`
 *     bit 3 (`0x08`): `element === 'fire'` (`0` = ice, `1` = fire)
 *     bit 4 (`0x10`): `sprint` / `dashing`
 *     bit 5 (`0x20`): `downed`
 *     bit 6 (`0x40`): `praying`
 * - Bytes 2..3 (`Uint16` LE): `seq` (`0..65535`)
 * - Bytes 4..7 (`Float32` LE): `x`
 * - Bytes 8..11 (`Float32` LE): `y`
 * - Bytes 12..15 (`Float32` LE): `z`
 * - Bytes 16..17 (`Int16` LE): `vx * 1000` (`m/s`, clamped to `[-32.7, 32.7]`)
 * - Bytes 18..19 (`Int16` LE): `vy * 1000` (`m/s`, clamped to `[-32.7, 32.7]`)
 * - Bytes 20..21 (`Int16` LE): `vz * 1000` (`m/s`, clamped to `[-32.7, 32.7]`)
 * - Bytes 22..23 (`Int16` LE): `yaw` wrapped to `[-π, π]` -> `[-32767, 32767]`
 * - Bytes 24..25 (`Int16` LE): `vyaw * 1000` (`rad/s`, clamped to `[-32.7, 32.7]`)
 * - Byte 26 (`Uint8`): `clipId`
 * - Byte 27 (`Uint8`): `actionId`
 */
export function encodeHeroStateBinary(state = {}) {
  const buf = new ArrayBuffer(HERO_STATE_BINARY_BYTES);
  const view = new DataView(buf);

  const isMage = state.role === 'Mage';
  const grounded = state.grounded !== undefined ? Boolean(state.grounded) : true;
  const shieldBlocking = Boolean(state.shieldBlocking);
  const isFire = state.element === 'fire';
  const sprint = Boolean(state.sprint || state.dashing);
  const downed = Boolean(state.downed);
  const praying = Boolean(state.praying);

  let flags =
    (isMage ? 0x01 : 0) |
    (grounded ? 0x02 : 0) |
    (shieldBlocking ? 0x04 : 0) |
    (isFire ? 0x08 : 0) |
    (sprint ? 0x10 : 0) |
    (downed ? 0x20 : 0) |
    (praying ? 0x40 : 0);

  if (typeof state.roleBitFlags === 'number') {
    flags = state.roleBitFlags & 0xff;
  } else if (typeof state.bitFlags === 'number') {
    flags = (state.bitFlags & 0xfe) | (isMage ? 0x01 : 0);
  } else if (typeof state.flags === 'number') {
    flags = (state.flags & 0xfe) | (isMage ? 0x01 : 0);
  }

  const seq = (Math.floor(Number(state.seq) || 0) & 0xffff) >>> 0;
  const x = Number(state.x) || 0;
  const y = Number(state.y) || 0;
  const z = Number(state.z) || 0;

  const vxInt = Math.round(clamp(Number(state.vx) || 0, -32.76, 32.76) * 1000);
  const vyInt = Math.round(clamp(Number(state.vy) || 0, -32.76, 32.76) * 1000);
  const vzInt = Math.round(clamp(Number(state.vz) || 0, -32.76, 32.76) * 1000);

  const wrappedYaw = wrapAnglePi(state.yaw);
  const yawInt = Math.round(clamp(wrappedYaw / Math.PI, -1, 1) * 32767);
  const vyawInt = Math.round(clamp(Number(state.vyaw) || 0, -32.76, 32.76) * 1000);

  const clipId =
    typeof state.clipId === 'number'
      ? state.clipId & 0xff
      : CLIP_NAME_TO_ID.get(String(state.clip || 'idle')) ?? 0;

  const actionId =
    typeof state.actionId === 'number'
      ? state.actionId & 0xff
      : ACTION_NAME_TO_ID.get(String(state.actionState || '')) ?? 0;

  view.setUint8(0, HERO_STATE_BINARY_TYPE);
  view.setUint8(1, flags);
  view.setUint16(2, seq, true);
  view.setFloat32(4, x, true);
  view.setFloat32(8, y, true);
  view.setFloat32(12, z, true);
  view.setInt16(16, vxInt, true);
  view.setInt16(18, vyInt, true);
  view.setInt16(20, vzInt, true);
  view.setInt16(22, yawInt, true);
  view.setInt16(24, vyawInt, true);
  view.setUint8(26, clipId);
  view.setUint8(27, actionId);

  return buf;
}

/**
 * Decodes a 28-byte binary hero state buffer.
 * Returns `null` if the buffer is not 28 bytes, does not have `type === 0x01`,
 * or has a stale sequence number (`seq <= lastRemoteSeq`).
 */
export function decodeHeroStateBinary(buffer, optsOrLastSeq = null) {
  if (!buffer) return null;

  let view = null;
  if (buffer instanceof DataView) {
    if (buffer.byteLength !== HERO_STATE_BINARY_BYTES) return null;
    view = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    if (buffer.byteLength !== HERO_STATE_BINARY_BYTES) return null;
    view = new DataView(buffer);
  } else if (ArrayBuffer.isView(buffer)) {
    if (buffer.byteLength !== HERO_STATE_BINARY_BYTES) return null;
    view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else {
    return null;
  }

  const packetType = view.getUint8(0);
  if (packetType !== HERO_STATE_BINARY_TYPE) return null;

  const flags = view.getUint8(1);
  const seq = view.getUint16(2, true);

  let lastSeq = null;
  if (typeof optsOrLastSeq === 'number' && Number.isFinite(optsOrLastSeq)) {
    lastSeq = optsOrLastSeq;
  } else if (optsOrLastSeq && typeof optsOrLastSeq === 'object') {
    if (typeof optsOrLastSeq.lastRemoteSeq === 'number') {
      lastSeq = optsOrLastSeq.lastRemoteSeq;
    } else if (typeof optsOrLastSeq.lastSeq === 'number') {
      lastSeq = optsOrLastSeq.lastSeq;
    }
  }

  if (lastSeq !== null && seq <= lastSeq) {
    return null;
  }

  if (optsOrLastSeq && typeof optsOrLastSeq === 'object') {
    if ('lastRemoteSeq' in optsOrLastSeq) optsOrLastSeq.lastRemoteSeq = seq;
    if ('lastSeq' in optsOrLastSeq) optsOrLastSeq.lastSeq = seq;
  }

  const x = view.getFloat32(4, true);
  const y = view.getFloat32(8, true);
  const z = view.getFloat32(12, true);

  const vx = view.getInt16(16, true) / 1000;
  const vy = view.getInt16(18, true) / 1000;
  const vz = view.getInt16(20, true) / 1000;

  const yaw = (view.getInt16(22, true) / 32767) * Math.PI;
  const vyaw = view.getInt16(24, true) / 1000;

  const clipId = view.getUint8(26);
  const actionId = view.getUint8(27);

  const role = (flags & 0x01) !== 0 ? 'Mage' : 'Knight';
  const grounded = (flags & 0x02) !== 0;
  const shieldBlocking = (flags & 0x04) !== 0;
  const element = (flags & 0x08) !== 0 ? 'fire' : 'ice';
  const sprint = (flags & 0x10) !== 0;
  const downed = (flags & 0x20) !== 0;
  const praying = (flags & 0x40) !== 0;

  const clip = HERO_CLIP_NAMES[clipId] || 'idle';
  const actionState = HERO_ACTION_NAMES[actionId] || null;

  return {
    type: 'hero_state',
    binaryType: packetType,
    roleBitFlags: flags,
    bitFlags: flags,
    flags,
    seq,
    role,
    x,
    y,
    z,
    vx,
    vy,
    vz,
    yaw,
    vyaw,
    grounded,
    shieldBlocking,
    element,
    sprint,
    dashing: sprint,
    downed,
    praying,
    clipId,
    clip,
    actionId,
    actionState,
  };
}

const SPELL_INFUSION_META = {
  frost_lance: {
    spellId: 'frost_lance',
    infusion: 'rime',
    breathingStyle: 'Glacial Tide',
    mark: 'rime',
    infusionDuration: 12,
    tetherSurgeSec: 0.65,
    detonatesMark: false,
  },
  shatterlance: {
    spellId: 'shatterlance',
    infusion: 'rime',
    breathingStyle: 'Glacial Tide',
    mark: 'rime',
    infusionDuration: 12,
    tetherSurgeSec: 0.65,
    detonatesMark: true,
  },
  cinder_fall: {
    spellId: 'cinder_fall',
    infusion: 'solar',
    breathingStyle: 'Hinokami Sunfire',
    mark: 'solar',
    infusionDuration: 12,
    tetherSurgeSec: 0.65,
    detonatesMark: false,
  },
  storm_lance: {
    spellId: 'storm_lance',
    infusion: 'tempest',
    breathingStyle: 'Thunderclap Wisteria',
    mark: 'tempest',
    infusionDuration: 12,
    tetherSurgeSec: 0.65,
    detonatesMark: false,
  },
};

export function normalizeRoomCode(raw) {
  return normalizeRoomPhraseToCode(raw || 'LOVE');
}

function readInitialRoomCode(explicitCode) {
  if (explicitCode) return normalizeRoomCode(explicitCode);
  if (typeof window !== 'undefined' && window.location?.search) {
    return parseRoomFromUrl(window.location.search, 'LOVE');
  }
  return 'LOVE';
}

function stripPrivateCommuneFields(payload = {}) {
  const copy = { ...payload };
  delete copy.audioBase64;
  delete copy.audio;
  delete copy.rawAudio;
  delete copy.chunks;
  delete copy.transcript;
  delete copy.heard_transcript;
  delete copy.transcriptHint;
  return copy;
}

export function createCoopClient(options = {}) {
  const {
    preferredRole = null,
    device = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
      ? 'Xiaomi Pad 7 / Touch'
      : 'Desktop PC',
    wsUrl: explicitWsUrl = null,
    autoConnect = true,
    throttleMs = 40, // 25Hz WS fast-path
    dcThrottleMs = 16, // 60Hz WebRTC unreliable DataChannel
    aimThrottleMs = 66, // 15Hz Mage aim reticle sync
    enableWebRTC = true,
    iceServers = [{ urls: 'stun:stun.cloudflare.com:3478' }],
    onRoomState = null,
    onRoomFull = null,
    onPlayerReady = null,
    onLobbyClaim = null,
    onExpeditionStarted = null,
    onProgressionUpdate = null,
    onCommuneBusy = null,
    onPeerHeroState = null,
    onPeerSpellCast = null,
    onPeerAction = null,
    onActionEvent = null,
    onElementToggle = null,
    onAimState = null,
    onFullSnapshot = null,
    onSnapshotRequest = null,
    onEnemyHit = null,
    onWorldSync = null,
    onRevivePartner = null,
    onActTransition = null,
    onCommuneState = null,
    onCommuneVerdict = null,
  } = options;

  const callbacks = {
    onRoomState,
    onRoomFull,
    onPlayerReady,
    onLobbyClaim,
    onExpeditionStarted,
    onProgressionUpdate,
    onCommuneBusy,
    onPeerHeroState,
    onPeerSpellCast,
    onPeerAction,
    onActionEvent,
    onElementToggle,
    onAimState,
    onFullSnapshot,
    onSnapshotRequest,
    onEnemyHit,
    onWorldSync,
    onRevivePartner,
    onActTransition,
    onCommuneState,
    onCommuneVerdict,
  };

  let roomCode = readInitialRoomCode(options.roomCode || options.roomPhrase);
  let ws = null;
  let disposed = false;
  let connectSeq = 0;
  let reconnectAttempt = 0;
  let reconnectTimer = null;

  let localHeroSeq = 0;
  let lastRemoteSeq = null;
  let lastHeroSentAt = 0;
  let lastWorldSyncSentAt = 0;
  let lastAimSentAt = 0;

  // WebRTC P2P state (`RTCPeerConnection` + `unreliable` & `reliable` DataChannels)
  let pc = null;
  let unreliableDc = null;
  let reliableDc = null;
  let makingOffer = false;
  let ignoreOffer = false;
  let rtcConnectedPeerId = null;

  const progression = createRoomProgressionState(options.initialProgression || {});

  const state = {
    mode: 'solo', // 'solo' | 'coop'
    room: roomCode,
    roomPhrase: formatRoomCodeToPhrase(roomCode),
    clientId: 'solo-local',
    role: preferredRole === 'Mage' ? 'Mage' : 'Knight',
    playerName: String(options.playerName || ''),
    claimed: false,
    element: 'ice',
    isHost: true,
    ready: false,
    peerReady: false,
    peerClaimed: false,
    peerName: '',
    peerElement: 'ice',
    peerConnected: false,
    peerId: null,
    peerRole: null,
    isFull: false,
    roomFullRejected: false,
    expeditionStarted: false,
    activeCommuneSpeaker: null,
    progression: progression.getState(),
    players: [],
    connected: false,
    reconnecting: false,
    p2pConnected: false,
  };

  let clientApi = null;

  function resolveCb(name) {
    return (clientApi && typeof clientApi[name] === 'function' ? clientApi[name] : null) || callbacks[name];
  }

  function emitRoomState() {
    state.progression = progression.getState();
    resolveCb('onRoomState')?.({
      ...state,
      progression: state.progression,
      players: [...state.players],
    });
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function closePeerConnection() {
    rtcConnectedPeerId = null;
    makingOffer = false;
    ignoreOffer = false;
    state.p2pConnected = false;
    if (unreliableDc) {
      try {
        unreliableDc.onopen = null;
        unreliableDc.onclose = null;
        unreliableDc.onmessage = null;
        unreliableDc.close();
      } catch {
        // ignore
      }
      unreliableDc = null;
    }
    if (reliableDc) {
      try {
        reliableDc.onopen = null;
        reliableDc.onclose = null;
        reliableDc.onmessage = null;
        reliableDc.close();
      } catch {
        // ignore
      }
      reliableDc = null;
    }
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.onnegotiationneeded = null;
        pc.ondatachannel = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        // ignore
      }
      pc = null;
    }
  }

  function fallbackToSolo() {
    closePeerConnection();
    const changed =
      state.mode !== 'solo' ||
      state.peerConnected !== false ||
      state.isHost !== true ||
      state.connected !== false;
    state.mode = 'solo';
    state.room = roomCode;
    state.roomPhrase = formatRoomCodeToPhrase(roomCode);
    state.isHost = true;
    state.peerReady = false;
    state.peerClaimed = false;
    state.peerConnected = false;
    state.peerId = null;
    state.peerRole = null;
    state.isFull = false;
    state.connected = false;
    state.reconnecting = false;
    state.players = [
      {
        clientId: state.clientId,
        role: state.role,
        playerName: state.playerName,
        claimed: state.claimed,
        isHost: true,
        ready: state.ready,
        device,
      },
    ];
    if (changed) {
      emitRoomState();
    }
  }

  function closeCurrentSocket(immediate = false) {
    if (!ws) return;
    const old = ws;
    ws = null;
    try {
      old._detachListeners?.();
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      if (old.readyState === 1) {
        old.close();
      } else if (old.readyState === 0) {
        if (immediate || disposed) {
          old.close();
        } else {
          const closeOnOpen = () => {
            try {
              old.close();
            } catch {
              // ignore
            }
          };
          if (typeof old.addEventListener === 'function') {
            old.addEventListener('open', closeOnOpen, { once: true });
          } else {
            old.onopen = closeOnOpen;
          }
        }
      }
    } catch {
      // silent
    }
  }

  function setupDataChannelHandlers(channel, isUnreliable = false) {
    if (!channel) return;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      state.p2pConnected = Boolean(
        (unreliableDc && unreliableDc.readyState === 'open') ||
          (reliableDc && reliableDc.readyState === 'open')
      );
    };
    channel.onclose = () => {
      state.p2pConnected = Boolean(
        (unreliableDc && unreliableDc.readyState === 'open') ||
          (reliableDc && reliableDc.readyState === 'open')
      );
    };
    channel.onmessage = (event) => {
      if (disposed) return;
      const data = event.data;
      if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        const decoded = decodeHeroStateBinary(data, lastRemoteSeq);
        if (decoded) {
          lastRemoteSeq = decoded.seq;
          resolveCb('onPeerHeroState')?.(decoded);
        }
        return;
      }
      if (typeof data === 'string') {
        handleIncomingJsonText(data);
      }
    };
    if (isUnreliable) {
      unreliableDc = channel;
    } else {
      reliableDc = channel;
    }
  }

  function ensurePeerConnection() {
    if (!enableWebRTC || disposed || !state.peerConnected || !state.peerId) return null;
    const RTCPeerConnectionImpl =
      options.RTCPeerConnection ||
      (typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null);
    if (!RTCPeerConnectionImpl) return null;

    if (pc && rtcConnectedPeerId === state.peerId) {
      return pc;
    }

    closePeerConnection();
    rtcConnectedPeerId = state.peerId;

    try {
      pc = new RTCPeerConnectionImpl({ iceServers });
    } catch {
      pc = null;
      return null;
    }

    pc.onicecandidate = (event) => {
      if (event?.candidate) {
        sendRaw({
          type: 'rtc_signal',
          candidate: event.candidate,
        });
      }
    };

    pc.onnegotiationneeded = async () => {
      if (!pc || disposed) return;
      try {
        makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        sendRaw({
          type: 'rtc_signal',
          description: pc.localDescription,
        });
      } catch {
        // Fallback to WS cleanly
      } finally {
        makingOffer = false;
      }
    };

    pc.ondatachannel = (event) => {
      const ch = event?.channel;
      if (!ch) return;
      if (ch.label === 'unreliable') {
        setupDataChannelHandlers(ch, true);
      } else {
        setupDataChannelHandlers(ch, false);
      }
    };

    if (state.isHost) {
      try {
        const uDc = pc.createDataChannel('unreliable', {
          ordered: false,
          maxRetransmits: 0,
        });
        setupDataChannelHandlers(uDc, true);
        const rDc = pc.createDataChannel('reliable', {
          ordered: true,
        });
        setupDataChannelHandlers(rDc, false);
      } catch {
        // ignore if mock RTCPeerConnection does not implement createDataChannel
      }
    }

    return pc;
  }

  async function handleRtcSignal(msg) {
    resolveCb('onRtcSignal')?.(msg);
    const peerConn = ensurePeerConnection();
    if (!peerConn) return;

    const polite = !state.isHost;
    try {
      if (msg.description) {
        const desc = msg.description;
        const offerCollision =
          desc.type === 'offer' && (makingOffer || peerConn.signalingState !== 'stable');
        ignoreOffer = !polite && offerCollision;
        if (ignoreOffer) return;

        await peerConn.setRemoteDescription(desc);
        if (desc.type === 'offer') {
          const answer = await peerConn.createAnswer();
          await peerConn.setLocalDescription(answer);
          sendRaw({
            type: 'rtc_signal',
            description: peerConn.localDescription,
          });
        }
      } else if (msg.candidate) {
        try {
          await peerConn.addIceCandidate(msg.candidate);
        } catch (err) {
          if (!ignoreOffer) throw err;
        }
      }
    } catch {
      // Non-fatal: WebSocket fast-path remains active
    }
  }

  async function canServerUpgradeInBrowser() {
    if (explicitWsUrl) return true;
    if (typeof window === 'undefined' || typeof fetch !== 'function') return true;
    try {
      const probePath = window.location?.pathname || '/world/index.html';
      const res = await fetch(probePath, { method: 'HEAD', cache: 'no-store' });
      return res.headers?.get('x-haru-coop') === '1';
    } catch {
      return false;
    }
  }

  function buildWsUrl(targetRoom) {
    if (explicitWsUrl) {
      return explicitWsUrl.replace(
        /\/api\/room\/[^/]+\/websocket/i,
        `/api/room/${targetRoom}/websocket`
      );
    }
    if (typeof window !== 'undefined' && window.location?.host) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/api/room/${targetRoom}/websocket`;
    }
    return `ws://127.0.0.1:4173/api/room/${targetRoom}/websocket`;
  }

  function handleIncomingJsonText(rawText) {
    let msg;
    try {
      msg = JSON.parse(rawText);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'room_full': {
        state.roomFullRejected = true;
        clearReconnectTimer();
        resolveCb('onRoomFull')?.(msg);
        break;
      }
      case 'room_state': {
        const wasPeerConnected = state.peerConnected;
        const wasExpeditionStarted = state.expeditionStarted;

        state.room = msg.room || roomCode;
        state.roomPhrase = msg.roomPhrase || formatRoomCodeToPhrase(state.room);
        state.clientId = msg.clientId || state.clientId;
        state.role = msg.role || state.role;
        state.isHost = Boolean(msg.isHost);
        if (typeof msg.playerName === 'string' && msg.playerName) {
          state.playerName = msg.playerName;
        }
        if (typeof msg.claimed === 'boolean') {
          state.claimed = msg.claimed;
        }
        if (typeof msg.element === 'string') {
          state.element = msg.element;
        }
        state.ready = msg.ready !== undefined ? Boolean(msg.ready) : false;
        state.peerReady = Boolean(msg.peerReady);
        state.peerClaimed = Boolean(msg.peerClaimed ?? msg.peerReady);
        state.peerName = String(msg.peerName || '');
        state.peerElement = msg.peerElement === 'fire' ? 'fire' : 'ice';
        state.peerConnected = Boolean(msg.peerConnected);
        state.peerId = msg.peerId || null;
        state.peerRole = msg.peerRole || null;
        state.isFull = Boolean(
          msg.isFull ?? (Array.isArray(msg.players) && msg.players.length >= 2)
        );
        state.expeditionStarted = Boolean(msg.expeditionStarted);
        state.activeCommuneSpeaker = msg.activeCommuneSpeaker || null;
        if (msg.progression) {
          progression.syncFromRemote(msg.progression);
        }
        state.progression = progression.getState();
        state.players = Array.isArray(msg.players) ? msg.players : [];
        state.mode = state.peerConnected ? 'coop' : 'solo';

        if (!state.peerConnected) {
          lastRemoteSeq = null;
          closePeerConnection();
        } else if (!wasPeerConnected && state.peerConnected) {
          ensurePeerConnection();
        }

        emitRoomState();

        // If reconnecting or joining mid-run when expedition is already started,
        // automatically request a full snapshot from the partner/Host!
        if (state.expeditionStarted && state.peerConnected && !wasExpeditionStarted) {
          requestFullSnapshot({ reason: 'mid_run_sync' });
        }
        break;
      }
      case 'lobby_claim': {
        if (Array.isArray(msg.players)) {
          state.players = msg.players;
          const selfEntry = msg.players.find((p) => p.clientId === state.clientId);
          const peerEntry = msg.players.find((p) => p.clientId !== state.clientId);
          if (selfEntry) {
            state.role = selfEntry.role || state.role;
            state.claimed = Boolean(selfEntry.claimed);
            state.ready = Boolean(selfEntry.ready);
            if (selfEntry.playerName) state.playerName = selfEntry.playerName;
          }
          if (peerEntry) {
            state.peerRole = peerEntry.role || state.peerRole;
            state.peerClaimed = Boolean(peerEntry.claimed);
            state.peerReady = Boolean(peerEntry.ready);
            state.peerName = peerEntry.playerName || '';
          }
        } else if (msg.clientId && msg.clientId !== state.clientId) {
          if (msg.role) state.peerRole = msg.role;
          if (typeof msg.playerName === 'string') state.peerName = msg.playerName;
          if (typeof msg.claimed === 'boolean') state.peerClaimed = msg.claimed;
          if (typeof msg.ready === 'boolean') state.peerReady = msg.ready;
        }
        resolveCb('onLobbyClaim')?.(msg);
        emitRoomState();
        break;
      }
      case 'player_ready': {
        if (msg.clientId === state.clientId) {
          state.ready = Boolean(msg.ready);
          if (state.ready) state.claimed = true;
        } else {
          state.peerReady = Boolean(msg.ready);
          if (state.peerReady) state.peerClaimed = true;
          if (typeof msg.playerName === 'string' && msg.playerName) {
            state.peerName = msg.playerName;
          }
        }
        resolveCb('onPlayerReady')?.(msg);
        emitRoomState();
        break;
      }
      case 'expedition_started': {
        state.expeditionStarted = true;
        if (msg.progression) {
          progression.syncFromRemote(msg.progression);
          state.progression = progression.getState();
        }
        resolveCb('onExpeditionStarted')?.(msg);
        emitRoomState();
        break;
      }
      case 'progression_update': {
        if (msg.progression) {
          progression.syncFromRemote(msg.progression);
          state.progression = progression.getState();
        }
        resolveCb('onProgressionUpdate')?.(state.progression, msg);
        emitRoomState();
        break;
      }
      case 'commune_busy': {
        resolveCb('onCommuneBusy')?.(msg);
        break;
      }
      case 'hero_state': {
        resolveCb('onPeerHeroState')?.(msg);
        break;
      }
      case 'spell_cast': {
        resolveCb('onPeerSpellCast')?.(msg);
        break;
      }
      case 'action_event': {
        resolveCb('onPeerAction')?.(msg);
        resolveCb('onActionEvent')?.(msg);
        break;
      }
      case 'element_toggle': {
        const el = msg.element === 'fire' ? 'fire' : 'ice';
        state.peerElement = el;
        resolveCb('onElementToggle')?.(msg);
        resolveCb('onPeerAction')?.({ ...msg, action: 'element_toggle', element: el });
        resolveCb('onActionEvent')?.({ ...msg, action: 'element_toggle', element: el });
        break;
      }
      case 'aim_state': {
        resolveCb('onAimState')?.(msg);
        resolveCb('onPeerAction')?.({ ...msg, action: 'aim_state' });
        break;
      }
      case 'snapshot_request':
      case 'request_full_snapshot': {
        resolveCb('onSnapshotRequest')?.(msg);
        resolveCb('onPeerAction')?.({ ...msg, action: 'snapshot_request' });
        break;
      }
      case 'full_snapshot': {
        if (msg.progression) {
          progression.syncFromRemote(msg.progression);
          state.progression = progression.getState();
        }
        resolveCb('onFullSnapshot')?.(msg);
        resolveCb('onPeerAction')?.({ ...msg, action: 'full_snapshot' });
        emitRoomState();
        break;
      }
      case 'rtc_signal': {
        handleRtcSignal(msg);
        break;
      }
      case 'enemy_hit': {
        resolveCb('onEnemyHit')?.(msg);
        break;
      }
      case 'world_sync': {
        resolveCb('onWorldSync')?.(msg);
        break;
      }
      case 'revive_partner': {
        resolveCb('onRevivePartner')?.(msg);
        resolveCb('onPeerAction')?.(msg);
        break;
      }
      case 'act_transition': {
        resolveCb('onActTransition')?.(msg);
        break;
      }
      case 'commune_state': {
        state.activeCommuneSpeaker =
          msg.state === 'channel' || msg.state === 'listening'
            ? { role: msg.speakerRole || msg.fromRole }
            : null;
        resolveCb('onCommuneState')?.(stripPrivateCommuneFields(msg));
        break;
      }
      case 'commune_verdict': {
        state.activeCommuneSpeaker = null;
        if (msg.progression) {
          progression.syncFromRemote(msg.progression);
        } else {
          progression.applyVerdictProgression(msg.judgment || msg);
        }
        state.progression = progression.getState();
        resolveCb('onCommuneVerdict')?.(stripPrivateCommuneFields(msg));
        break;
      }
      default:
        break;
    }
  }

  function scheduleAutoReconnect() {
    if (disposed || state.roomFullRejected || reconnectTimer) return;
    const delayMs =
      RECONNECT_BACKOFF_MS[Math.min(reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)];
    reconnectAttempt++;
    state.reconnecting = true;
    state.connected = false;
    state.peerConnected = false;
    state.mode = 'solo';
    emitRoomState();

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (disposed || state.roomFullRejected) return;
      connect(roomCode, { isReconnect: true });
    }, delayMs);
    reconnectTimer.unref?.();
  }

  async function connect(newRoomCode, connectOpts = {}) {
    if (disposed) return;
    clearReconnectTimer();

    if (newRoomCode) {
      roomCode = normalizeRoomCode(newRoomCode);
      state.room = roomCode;
      state.roomPhrase = formatRoomCodeToPhrase(roomCode);
    }

    const seq = ++connectSeq;
    closeCurrentSocket();

    const supported = await canServerUpgradeInBrowser();
    if (disposed || seq !== connectSeq) return;
    if (!supported) {
      fallbackToSolo();
      emitRoomState();
      return;
    }

    const WSImpl = options.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!WSImpl) {
      fallbackToSolo();
      emitRoomState();
      return;
    }

    let socket;
    try {
      socket = new WSImpl(buildWsUrl(roomCode));
      socket.binaryType = 'arraybuffer';
    } catch {
      if (connectOpts.isReconnect && reconnectAttempt < 6) {
        scheduleAutoReconnect();
      } else {
        fallbackToSolo();
        emitRoomState();
      }
      return;
    }

    ws = socket;

    const handleOpen = () => {
      if (disposed || ws !== socket) return;
      reconnectAttempt = 0;
      state.connected = true;
      state.reconnecting = false;
      state.roomFullRejected = false;
      sendRaw({
        type: 'join',
        room: roomCode,
        roomPhrase: state.roomPhrase,
        preferredRole: state.role || preferredRole,
        playerName: state.playerName || undefined,
        claimed: state.claimed || undefined,
        ready: state.ready || undefined,
        device,
      });
      if (state.playerName || state.claimed) {
        sendRaw({
          type: 'lobby_claim',
          role: state.role,
          playerName: state.playerName,
          claimed: state.claimed,
          ready: state.ready,
          timestamp: Date.now(),
        });
      }
    };

    const handleMessage = (event) => {
      if (disposed || ws !== socket) return;
      const data = event.data;
      if (
        data instanceof ArrayBuffer ||
        ArrayBuffer.isView(data) ||
        (typeof Buffer !== 'undefined' && Buffer.isBuffer(data))
      ) {
        const decoded = decodeHeroStateBinary(data, lastRemoteSeq);
        if (decoded) {
          lastRemoteSeq = decoded.seq;
          resolveCb('onPeerHeroState')?.(decoded);
        }
        return;
      }
      const raw = typeof data === 'string' ? data : String(data ?? '');
      handleIncomingJsonText(raw);
    };

    const handleDisconnect = () => {
      if (disposed || ws !== socket) return;
      ws = null;
      closePeerConnection();
      if (!state.roomFullRejected) {
        if (reconnectAttempt < 6) {
          scheduleAutoReconnect();
        } else {
          fallbackToSolo();
          emitRoomState();
        }
      }
    };

    if (typeof socket.addEventListener === 'function') {
      socket.addEventListener('open', handleOpen);
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('error', handleDisconnect);
      socket.addEventListener('close', handleDisconnect);
      socket._detachListeners = () => {
        try {
          socket.removeEventListener?.('open', handleOpen);
          socket.removeEventListener?.('message', handleMessage);
          socket.removeEventListener?.('error', handleDisconnect);
          socket.removeEventListener?.('close', handleDisconnect);
        } catch {
          // ignore
        }
      };
    } else {
      socket.onopen = handleOpen;
      socket.onmessage = handleMessage;
      socket.onerror = handleDisconnect;
      socket.onclose = handleDisconnect;
      socket._detachListeners = () => {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
      };
    }
  }

  function sendRaw(obj) {
    if (disposed || !ws || ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  function sendBinaryRaw(buf) {
    if (disposed) return false;
    if (unreliableDc && unreliableDc.readyState === 'open') {
      try {
        unreliableDc.send(buf);
        return true;
      } catch {
        // fall through to WS
      }
    }
    if (ws && ws.readyState === 1) {
      try {
        ws.send(buf);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  function sendHeroState(heroState = {}, force = false) {
    const now = performance.now();
    const dcOpen = Boolean(unreliableDc && unreliableDc.readyState === 'open');
    const activeInterval = dcOpen ? dcThrottleMs : throttleMs;
    if (!force && now - lastHeroSentAt < activeInterval) return false;
    lastHeroSentAt = now;

    localHeroSeq = (localHeroSeq + 1) & 0xffff;
    const role = heroState?.role || state.role;

    if (dcOpen || options.preferBinaryWs) {
      const bin = encodeHeroStateBinary({
        ...heroState,
        role,
        seq: heroState?.seq ?? localHeroSeq,
      });
      if (sendBinaryRaw(bin)) {
        return true;
      }
    }

    return sendRaw({
      type: 'hero_state',
      ...heroState,
      seq: heroState?.seq ?? localHeroSeq,
      role,
      timestamp: Date.now(),
    });
  }

  function sendLobbyClaim(roleOrPayload = {}, maybeName = undefined, maybeClaimed = undefined) {
    let payload = {};
    if (typeof roleOrPayload === 'string') {
      payload = {
        role: roleOrPayload,
        playerName: maybeName,
        claimed: maybeClaimed,
      };
    } else if (roleOrPayload && typeof roleOrPayload === 'object') {
      payload = roleOrPayload;
    }

    if (payload.role === 'Knight' || payload.role === 'Mage') {
      state.role = payload.role;
    }
    if (typeof payload.playerName === 'string') {
      state.playerName = payload.playerName.trim().slice(0, 32);
    }
    if (typeof payload.claimed === 'boolean') {
      state.claimed = payload.claimed;
      state.ready = payload.ready !== undefined ? Boolean(payload.ready) : payload.claimed;
    } else if (typeof payload.ready === 'boolean') {
      state.ready = payload.ready;
      if (payload.ready) state.claimed = true;
    }

    if (ws && ws.readyState === 1) {
      return sendRaw({
        type: 'lobby_claim',
        role: state.role,
        playerName: state.playerName,
        claimed: Boolean(state.claimed),
        ready: Boolean(state.ready),
        timestamp: Date.now(),
      });
    }
    emitRoomState();
    return true;
  }

  function sendElementToggle(payloadOrElement = {}) {
    const rawEl =
      typeof payloadOrElement === 'string'
        ? payloadOrElement
        : payloadOrElement?.element;
    const element = rawEl === 'fire' ? 'fire' : 'ice';
    const role =
      (typeof payloadOrElement === 'object' && payloadOrElement?.role) || state.role;
    state.element = element;
    return sendRaw({
      type: 'element_toggle',
      role,
      element,
      timestamp: Date.now(),
    });
  }

  function sendAimState(payload = {}, force = false) {
    const now = performance.now();
    if (!force && now - lastAimSentAt < aimThrottleMs) return false;
    lastAimSentAt = now;
    const msg = {
      ...payload,
      type: 'aim_state',
      role: payload?.role || state.role,
      timestamp: Date.now(),
    };
    if (unreliableDc && unreliableDc.readyState === 'open') {
      try {
        unreliableDc.send(JSON.stringify(msg));
        return true;
      } catch {
        // fallback to WS
      }
    }
    return sendRaw(msg);
  }

  function requestFullSnapshot(payload = {}) {
    return sendRaw({
      ...payload,
      type: 'snapshot_request',
      role: state.role,
      clientId: state.clientId,
      timestamp: Date.now(),
    });
  }

  function sendFullSnapshot(payload = {}) {
    return sendRaw({
      ...payload,
      type: 'full_snapshot',
      role: state.role,
      progression: progression.getState(),
      timestamp: Date.now(),
    });
  }

  function sendRtcSignal(payload = {}) {
    return sendRaw({
      ...payload,
      type: 'rtc_signal',
      timestamp: Date.now(),
    });
  }

  function sendSpellCast(payload = {}) {
    const spellId = payload.spellId || payload.spell || 'frost_lance';
    const meta = SPELL_INFUSION_META[spellId] || SPELL_INFUSION_META.frost_lance;
    return sendRaw({
      ...meta,
      ...payload,
      type: 'spell_cast',
      spellId,
      spell: spellId,
      timestamp: Date.now(),
    });
  }

  function sendActionEvent(payload = {}) {
    return sendRaw({
      ...payload,
      type: 'action_event',
      timestamp: Date.now(),
    });
  }

  function sendEnemyHit(payload = {}) {
    return sendRaw({
      ...payload,
      type: 'enemy_hit',
      timestamp: Date.now(),
    });
  }

  function sendWorldSync(payload = {}, force = false) {
    const now = performance.now();
    if (!force && now - lastWorldSyncSentAt < throttleMs) return false;
    lastWorldSyncSentAt = now;
    return sendRaw({
      ...payload,
      type: 'world_sync',
      timestamp: Date.now(),
    });
  }

  function sendRevivePartner(payload = {}) {
    return sendRaw({
      ...payload,
      type: 'revive_partner',
      timestamp: Date.now(),
    });
  }

  function sendActTransition(payload = {}) {
    return sendRaw({
      ...payload,
      type: 'act_transition',
      timestamp: Date.now(),
    });
  }

  function sendCommuneState(payload = {}) {
    const safePayload = stripPrivateCommuneFields(payload);
    return sendRaw({
      ...safePayload,
      type: 'commune_state',
      speakerRole: safePayload.speakerRole || state.role,
      timestamp: Date.now(),
    });
  }

  function sendCommuneVerdict(payload = {}) {
    const safePayload = stripPrivateCommuneFields(payload);
    return sendRaw({
      ...safePayload,
      type: 'commune_verdict',
      speakerRole: safePayload.speakerRole || state.role,
      timestamp: Date.now(),
    });
  }

  function setReady(ready = true) {
    state.ready = Boolean(ready);
    if (state.ready) state.claimed = true;
    if (ws && ws.readyState === 1) {
      return sendRaw({
        type: 'set_ready',
        ready: state.ready,
        claimed: state.claimed,
        playerName: state.playerName || undefined,
        timestamp: Date.now(),
      });
    }
    emitRoomState();
    return true;
  }

  function startExpedition(opts = {}) {
    if (opts && opts.resetProgression) {
      progression.setUnlocks({
        communeDiscovered: false,
        trueNameDiscovered: false,
        iceUnlocked: false,
        fireUnlocked: false,
        ultimateUnlocked: false,
        stone1Solved: false,
        stone2Solved: false,
        stone3Solved: false,
        stonesSolvedMask: 0,
      });
      state.progression = progression.getState();
    }
    if (ws && ws.readyState === 1 && state.peerConnected) {
      return sendRaw({
        type: 'start_expedition',
        force: Boolean(opts?.force),
        resetProgression: Boolean(opts?.resetProgression),
        timestamp: Date.now(),
      });
    }
    if (ws && ws.readyState === 1) {
      sendRaw({
        type: 'start_expedition',
        force: true,
        resetProgression: Boolean(opts?.resetProgression),
        timestamp: Date.now(),
      });
    }
    state.expeditionStarted = true;
    resolveCb('onExpeditionStarted')?.({
      type: 'expedition_started',
      startedAt: Date.now(),
      progression: progression.getState(),
    });
    emitRoomState();
    return true;
  }

  function sendStoneRead(stoneId) {
    const readInfo = progression.readInscriptionStone(stoneId);
    state.progression = readInfo.state;
    if (ws && ws.readyState === 1) {
      sendRaw({
        type: 'progression_update',
        stoneId: readInfo.stoneId,
        progression: state.progression,
        timestamp: Date.now(),
      });
    } else {
      emitRoomState();
    }
    return readInfo;
  }

  function sendProgressionUpdate(patch = {}) {
    progression.syncFromRemote(patch);
    state.progression = progression.getState();
    if (ws && ws.readyState === 1) {
      return sendRaw({
        type: 'progression_update',
        progression: state.progression,
        timestamp: Date.now(),
      });
    }
    emitRoomState();
    return true;
  }

  function setPreferredRole(nextRole) {
    if (nextRole !== 'Knight' && nextRole !== 'Mage') return state.role;
    state.role = nextRole;
    if (ws && ws.readyState === 1) {
      sendRaw({
        type: 'join',
        room: roomCode,
        preferredRole: nextRole,
        playerName: state.playerName || undefined,
        device,
      });
    } else {
      emitRoomState();
    }
    return state.role;
  }

  function swapRoles() {
    if (ws && ws.readyState === 1) {
      return sendRaw({ type: 'swap_roles' });
    }
    state.role = state.role === 'Knight' ? 'Mage' : 'Knight';
    emitRoomState();
    return true;
  }

  function setRoomCode(newCodeOrPhrase) {
    const norm = normalizeRoomCode(newCodeOrPhrase);
    roomCode = norm;
    state.room = norm;
    state.roomPhrase = formatRoomCodeToPhrase(norm);
    reconnectAttempt = 0;
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('room', norm);
        window.history.replaceState({}, '', u.toString());
      } catch {
        // ignore
      }
    }
    connect(norm);
    return norm;
  }

  function setCallbacks(patch = {}) {
    if (!patch || typeof patch !== 'object') return;
    for (const [k, v] of Object.entries(patch)) {
      if (typeof v === 'function' || v === null) {
        callbacks[k] = v;
      }
    }
  }

  function reconnect() {
    reconnectAttempt = 0;
    return connect(roomCode, { isReconnect: true });
  }

  function getRoomCode() {
    return roomCode;
  }

  function getRoomPhrase() {
    return state.roomPhrase;
  }

  function getShareUrl() {
    return buildRoomInviteLink(roomCode);
  }

  function getProgressionState() {
    return progression.getState();
  }

  function getState() {
    return {
      ...state,
      progression: progression.getState(),
      players: [...state.players],
    };
  }

  function dispose() {
    disposed = true;
    clearReconnectTimer();
    closePeerConnection();
    closeCurrentSocket();
  }

  clientApi = {
    connect,
    reconnect,
    setCallbacks,
    setRoomCode,
    getRoomCode,
    getRoomPhrase,
    getShareUrl,
    getState,
    getProgressionState,
    progression,
    setReady,
    startExpedition,
    sendLobbyClaim,
    sendElementToggle,
    sendAimState,
    requestFullSnapshot,
    sendFullSnapshot,
    sendRtcSignal,
    sendStoneRead,
    sendProgressionUpdate,
    setPreferredRole,
    swapRoles,
    sendHeroState,
    sendSpellCast,
    sendActionEvent,
    sendEnemyHit,
    sendWorldSync,
    sendRevivePartner,
    sendActTransition,
    sendCommuneState,
    sendCommuneVerdict,
    encodeHeroStateBinary,
    decodeHeroStateBinary,
    onLobbyClaim,
    onElementToggle,
    onAimState,
    onFullSnapshot,
    onSnapshotRequest,
    dispose,
  };

  emitRoomState();
  if (autoConnect) {
    connect(roomCode);
  }

  return clientApi;
}
