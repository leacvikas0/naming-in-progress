// ============================================================================
// world/src/net/coop-client.js
//
// Browser & Node Co-Op WebSocket Room Client for Haru-machi (Stage 5).
// - Reads initial room code from `?room=XXXX` (defaulting to `'LOVE'`).
// - Connects to `${proto}//${location.host}/api/room/${roomCode}/websocket`.
// - Probes `/world/index.html` via HEAD first in browsers so plain static servers
//   (such as `shoot-world.mjs`) smoothly enter `mode: 'solo'` (`isHost: true,
//   peerConnected: false`) with ZERO console or network errors.
// - Throttles `sendHeroState` and `sendWorldSync` to 20Hz (`50ms`), and delivers
//   `sendSpellCast`, `sendActionEvent`, `sendEnemyHit`, and `swapRoles` immediately.
// ============================================================================

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
  const cleaned = String(raw || 'LOVE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  return cleaned || 'LOVE';
}

function readInitialRoomCode(explicitCode) {
  if (explicitCode) return normalizeRoomCode(explicitCode);
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('room');
      if (fromUrl) return normalizeRoomCode(fromUrl);
    } catch {
      // ignore URL parse error
    }
  }
  return 'LOVE';
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

  let roomCode = readInitialRoomCode(options.roomCode);
  let ws = null;
  let disposed = false;
  let connectSeq = 0;

  let lastHeroSentAt = 0;
  let lastWorldSyncSentAt = 0;

  const state = {
    mode: 'solo', // 'solo' | 'coop'
    room: roomCode,
    clientId: 'solo-local',
    role: preferredRole === 'Mage' ? 'Mage' : 'Knight',
    isHost: true,
    peerConnected: false,
    peerId: null,
    peerRole: null,
    players: [],
    connected: false,
  };

  function emitRoomState() {
    onRoomState?.({ ...state, players: [...state.players] });
  }

  function fallbackToSolo() {
    const changed =
      state.mode !== 'solo' ||
      state.peerConnected !== false ||
      state.isHost !== true ||
      state.connected !== false;
    state.mode = 'solo';
    state.room = roomCode;
    state.isHost = true;
    state.peerConnected = false;
    state.peerId = null;
    state.peerRole = null;
    state.connected = false;
    state.players = [
      {
        clientId: state.clientId,
        role: state.role,
        isHost: true,
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
      return explicitWsUrl.replace(/\/api\/room\/[^/]+\/websocket/i, `/api\/room/${targetRoom}/websocket`);
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
    }

    const seq = ++connectSeq;
    closeCurrentSocket();

    // Check if the current server supports the Haru-machi Co-Op WebSocket upgrade
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
      sendRaw({
        type: 'join',
        room: roomCode,
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
        case 'room_state': {
          state.room = msg.room || roomCode;
          state.clientId = msg.clientId || state.clientId;
          state.role = msg.role || state.role;
          state.isHost = Boolean(msg.isHost);
          state.peerConnected = Boolean(msg.peerConnected);
          state.peerId = msg.peerId || null;
          state.peerRole = msg.peerRole || null;
          state.players = Array.isArray(msg.players) ? msg.players : [];
          state.mode = state.peerConnected ? 'coop' : 'solo';
          emitRoomState();
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
          onCommuneState?.(msg);
          break;
        }
        case 'commune_verdict': {
          onCommuneVerdict?.(msg);
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
    return sendRaw({
      ...payload,
      type: 'commune_state',
      speakerRole: payload.speakerRole || state.role,
      timestamp: Date.now(),
    });
  }

  function sendCommuneVerdict(payload = {}) {
    return sendRaw({
      ...payload,
      type: 'commune_verdict',
      speakerRole: payload.speakerRole || state.role,
      timestamp: Date.now(),
    });
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

  function setRoomCode(newCode) {
    const norm = normalizeRoomCode(newCode);
    roomCode = norm;
    state.room = norm;
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

  function getShareUrl() {
    if (typeof window !== 'undefined' && window.location?.href) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('room', roomCode);
        return u.toString();
      } catch {
        // fallback below
      }
    }
    return `https://haru-machi-coop.workers.dev/world/index.html?room=${roomCode}`;
  }

  function getState() {
    return { ...state, players: [...state.players] };
  }

  function dispose() {
    disposed = true;
    closeCurrentSocket();
  }

  // Emit initial solo state synchronously, then initiate connection if autoConnect
  emitRoomState();
  if (autoConnect) {
    connect(roomCode);
  }

  return {
    connect,
    setRoomCode,
    getRoomCode,
    getShareUrl,
    getState,
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
