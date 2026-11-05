// ============================================================================
// world/src/net/coop-client.js
//
// Browser & Node Co-Op WebSocket Room Client for Haru-machi (Stage 5 / Wave 3).
// - Supports human-memorable romantic room phrases ("Love is curiosity" ->
//   `LOVE-IS-CURIOSITY`) as well as 4-letter codes (`LOVE`, `DUET`).
// - Handles 2-seat cap (`room_full` rejection on 3rd visitor without evicting
//   seated players), Guest `set_ready` (`setReady`), Host `start_expedition`
//   (`startExpedition`), and sequential 3-Stone `progression_update` sync.
// - Enforces strict partner audio privacy on `sendCommuneState` / `sendCommuneVerdict`
//   (never transmitting raw audio or transcripts to the partner socket).
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
    throttleMs = 50, // 20Hz
    onRoomState = null,
    onRoomFull = null,
    onPlayerReady = null,
    onExpeditionStarted = null,
    onProgressionUpdate = null,
    onCommuneBusy = null,
    onPeerHeroState = null,
    onPeerSpellCast = null,
    onPeerAction = null,
    onActionEvent = null,
    onEnemyHit = null,
    onWorldSync = null,
    onRevivePartner = null,
    onActTransition = null,
    onCommuneState = null,
    onCommuneVerdict = null,
  } = options;

  let roomCode = readInitialRoomCode(options.roomCode || options.roomPhrase);
  let ws = null;
  let disposed = false;
  let connectSeq = 0;

  let lastHeroSentAt = 0;
  let lastWorldSyncSentAt = 0;

  const progression = createRoomProgressionState(options.initialProgression || {});

  const state = {
    mode: 'solo', // 'solo' | 'coop'
    room: roomCode,
    roomPhrase: formatRoomCodeToPhrase(roomCode),
    clientId: 'solo-local',
    role: preferredRole === 'Mage' ? 'Mage' : 'Knight',
    isHost: true,
    ready: true,
    peerReady: false,
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
  };

  function emitRoomState() {
    state.progression = progression.getState();
    onRoomState?.({
      ...state,
      progression: state.progression,
      players: [...state.players],
    });
  }

  function fallbackToSolo() {
    const changed =
      state.mode !== 'solo' ||
      state.peerConnected !== false ||
      state.isHost !== true ||
      state.connected !== false;
    state.mode = 'solo';
    state.room = roomCode;
    state.roomPhrase = formatRoomCodeToPhrase(roomCode);
    state.isHost = true;
    state.ready = true;
    state.peerReady = false;
    state.peerConnected = false;
    state.peerId = null;
    state.peerRole = null;
    state.isFull = false;
    state.connected = false;
    state.players = [
      {
        clientId: state.clientId,
        role: state.role,
        isHost: true,
        ready: true,
        device,
      },
    ];
    if (changed) {
      emitRoomState();
    }
  }

  function closeCurrentSocket() {
    if (!ws) return;
    const old = ws;
    ws = null;
    try {
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      if (old.readyState === 0 || old.readyState === 1) {
        old.close();
      }
    } catch {
      // silent
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

  async function connect(newRoomCode) {
    if (disposed) return;
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
    } catch {
      fallbackToSolo();
      emitRoomState();
      return;
    }

    ws = socket;

    const handleOpen = () => {
      if (disposed || ws !== socket) return;
      state.connected = true;
      state.roomFullRejected = false;
      sendRaw({
        type: 'join',
        room: roomCode,
        roomPhrase: state.roomPhrase,
        preferredRole: preferredRole || state.role,
        device,
      });
    };

    const handleMessage = (event) => {
      if (disposed || ws !== socket) return;
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      switch (msg.type) {
        case 'room_full': {
          state.roomFullRejected = true;
          onRoomFull?.(msg);
          break;
        }
        case 'room_state': {
          state.room = msg.room || roomCode;
          state.roomPhrase = msg.roomPhrase || formatRoomCodeToPhrase(state.room);
          state.clientId = msg.clientId || state.clientId;
          state.role = msg.role || state.role;
          state.isHost = Boolean(msg.isHost);
          state.ready = msg.ready !== undefined ? Boolean(msg.ready) : state.isHost;
          state.peerReady = Boolean(msg.peerReady);
          state.peerConnected = Boolean(msg.peerConnected);
          state.peerId = msg.peerId || null;
          state.peerRole = msg.peerRole || null;
          state.isFull = Boolean(msg.isFull ?? (Array.isArray(msg.players) && msg.players.length >= 2));
          state.expeditionStarted = Boolean(msg.expeditionStarted);
          state.activeCommuneSpeaker = msg.activeCommuneSpeaker || null;
          if (msg.progression) {
            progression.syncFromRemote(msg.progression);
          }
          state.progression = progression.getState();
          state.players = Array.isArray(msg.players) ? msg.players : [];
          state.mode = state.peerConnected ? 'coop' : 'solo';
          emitRoomState();
          break;
        }
        case 'player_ready': {
          if (msg.clientId === state.clientId) {
            state.ready = Boolean(msg.ready);
          } else {
            state.peerReady = Boolean(msg.ready);
          }
          onPlayerReady?.(msg);
          emitRoomState();
          break;
        }
        case 'expedition_started': {
          state.expeditionStarted = true;
          if (msg.progression) {
            progression.syncFromRemote(msg.progression);
            state.progression = progression.getState();
          }
          onExpeditionStarted?.(msg);
          emitRoomState();
          break;
        }
        case 'progression_update': {
          if (msg.progression) {
            progression.syncFromRemote(msg.progression);
            state.progression = progression.getState();
          }
          onProgressionUpdate?.(state.progression, msg);
          emitRoomState();
          break;
        }
        case 'commune_busy': {
          onCommuneBusy?.(msg);
          break;
        }
        case 'hero_state': {
          onPeerHeroState?.(msg);
          break;
        }
        case 'spell_cast': {
          onPeerSpellCast?.(msg);
          break;
        }
        case 'action_event': {
          onPeerAction?.(msg);
          onActionEvent?.(msg);
          break;
        }
        case 'enemy_hit': {
          onEnemyHit?.(msg);
          break;
        }
        case 'world_sync': {
          onWorldSync?.(msg);
          break;
        }
        case 'revive_partner': {
          onRevivePartner?.(msg);
          onPeerAction?.(msg);
          break;
        }
        case 'act_transition': {
          onActTransition?.(msg);
          break;
        }
        case 'commune_state': {
          state.activeCommuneSpeaker =
            msg.state === 'channel' || msg.state === 'listening'
              ? { role: msg.speakerRole || msg.fromRole }
              : null;
          onCommuneState?.(stripPrivateCommuneFields(msg));
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
          onCommuneVerdict?.(stripPrivateCommuneFields(msg));
          break;
        }
        default:
          break;
      }
    };

    const handleSilentDisconnect = () => {
      if (ws === socket) {
        ws = null;
      }
      if (!disposed) {
        fallbackToSolo();
        emitRoomState();
      }
    };

    if (typeof socket.addEventListener === 'function') {
      socket.addEventListener('open', handleOpen);
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('error', handleSilentDisconnect);
      socket.addEventListener('close', handleSilentDisconnect);
    } else {
      socket.onopen = handleOpen;
      socket.onmessage = handleMessage;
      socket.onerror = handleSilentDisconnect;
      socket.onclose = handleSilentDisconnect;
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

  function sendHeroState(heroState, force = false) {
    const now = performance.now();
    if (!force && now - lastHeroSentAt < throttleMs) return false;
    lastHeroSentAt = now;
    return sendRaw({
      type: 'hero_state',
      ...heroState,
      role: heroState?.role || state.role,
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
    if (ws && ws.readyState === 1) {
      return sendRaw({
        type: 'set_ready',
        ready: state.ready,
        timestamp: Date.now(),
      });
    }
    emitRoomState();
    return true;
  }

  function startExpedition() {
    if (ws && ws.readyState === 1) {
      return sendRaw({
        type: 'start_expedition',
        timestamp: Date.now(),
      });
    }
    state.expeditionStarted = true;
    onExpeditionStarted?.({
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
    closeCurrentSocket();
  }

  emitRoomState();
  if (autoConnect) {
    connect(roomCode);
  }

  return {
    connect,
    setRoomCode,
    getRoomCode,
    getRoomPhrase,
    getShareUrl,
    getState,
    getProgressionState,
    progression,
    setReady,
    startExpedition,
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
    dispose,
  };
}
