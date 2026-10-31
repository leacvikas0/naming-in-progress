// ============================================================================
// worker/room-do.js
//
// Cloudflare Durable Object (`CoopRoomDO`) managing a 2-player Haru-machi
// Co-Op Room (`Knight` + `Mage`) with identical JSON protocol to `serve.mjs`.
// ============================================================================

export const SPELL_INFUSION_META = {
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

export function enrichSpellCastPacket(msg, sender) {
  const spellId = msg.spellId || msg.spell || 'frost_lance';
  const meta = SPELL_INFUSION_META[spellId] || SPELL_INFUSION_META.frost_lance;
  return {
    ...meta,
    ...msg,
    type: 'spell_cast',
    spellId,
    spell: spellId,
    infusion: msg.infusion || meta.infusion,
    breathingStyle: msg.breathingStyle || meta.breathingStyle,
    mark: msg.mark || meta.mark,
    infusionDuration: msg.infusionDuration ?? meta.infusionDuration,
    tetherSurgeSec: msg.tetherSurgeSec ?? meta.tetherSurgeSec,
    detonatesMark: msg.detonatesMark ?? meta.detonatesMark,
    fromClientId: sender.clientId,
    fromRole: sender.role,
    timestamp: msg.timestamp || Date.now(),
  };
}

export class CoopRoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.roomCode = 'LOVE';
    this.nextClientSeq = 1;
    this.players = new Map(); // clientId -> { clientId, ws, role, isHost, device }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/room\/([A-Za-z0-9_-]{1,16})\/(websocket|status)\/?$/i);
    if (match) {
      this.roomCode = match[1].toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'LOVE';
    }

    if (url.pathname.endsWith('/status')) {
      return new Response(
        JSON.stringify({
          ok: true,
          room: this.roomCode,
          playerCount: this.players.size,
          players: Array.from(this.players.values()).map((p) => ({
            clientId: p.clientId,
            role: p.role,
            isHost: p.isHost,
            device: p.device,
          })),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Haru-Coop': '1',
          },
        }
      );
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    // Standard Cloudflare Workers WebSocketPair
    if (typeof WebSocketPair === 'undefined') {
      return new Response('WebSocketPair requires Cloudflare Workers runtime', { status: 501 });
    }

    const pair = new WebSocketPair();
    const [clientWs, serverWs] = Object.values(pair);
    serverWs.accept();

    const preferredRole = url.searchParams.get('preferredRole') || url.searchParams.get('role');
    this.attachSocket(serverWs, { preferredRole });

    return new Response(null, {
      status: 101,
      webSocket: clientWs,
      headers: { 'X-Haru-Coop': '1' },
    });
  }

  attachSocket(ws, initialOpts = {}) {
    // If room already has 2 players, evict the oldest disconnected or oldest guest slot
    if (this.players.size >= 2) {
      const oldest = Array.from(this.players.values()).find((p) => !p.isHost) ||
        Array.from(this.players.values())[0];
      if (oldest) {
        this.players.delete(oldest.clientId);
        try {
          oldest.ws.close(1000, 'Replaced by new connection');
        } catch {
          // ignore
        }
      }
    }

    const clientId = `p${this.nextClientSeq++}`;
    const existing = Array.from(this.players.values());
    const hasHost = existing.some((p) => p.isHost);
    const isHost = !hasHost;

    const takenRoles = new Set(existing.map((p) => p.role));
    const pref =
      initialOpts.preferredRole === 'Mage' || initialOpts.preferredRole === 'Knight'
        ? initialOpts.preferredRole
        : null;

    let role;
    if (pref && !takenRoles.has(pref)) {
      role = pref;
    } else if (!takenRoles.has('Knight')) {
      role = 'Knight';
    } else {
      role = 'Mage';
    }

    const player = {
      clientId,
      ws,
      role,
      isHost,
      device: initialOpts.device || (isHost ? 'Desktop' : 'Tablet'),
    };
    this.players.set(clientId, player);

    ws.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      this.handleMessage(player, raw);
    });

    const onDisconnect = () => {
      if (!this.players.has(clientId)) return;
      this.players.delete(clientId);
      const remaining = Array.from(this.players.values());
      if (remaining.length > 0 && !remaining.some((p) => p.isHost)) {
        remaining[0].isHost = true;
      }
      this.broadcastRoomState();
    };

    ws.addEventListener('close', onDisconnect);
    ws.addEventListener('error', onDisconnect);

    this.broadcastRoomState();
    return player;
  }

  handleMessage(player, rawText) {
    let msg;
    try {
      msg = JSON.parse(rawText);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'join': {
        if (msg.device) player.device = String(msg.device).slice(0, 64);
        const pref =
          msg.preferredRole === 'Mage' || msg.preferredRole === 'Knight'
            ? msg.preferredRole
            : null;
        if (pref) {
          const peer = this.getPeer(player.clientId);
          if (!peer) {
            player.role = pref;
          } else if (peer.role !== pref) {
            player.role = pref;
          }
        }
        this.broadcastRoomState();
        break;
      }

      case 'swap_roles': {
        const all = Array.from(this.players.values());
        if (all.length === 2) {
          const tmp = all[0].role;
          all[0].role = all[1].role;
          all[1].role = tmp;
        } else if (all.length === 1) {
          all[0].role = all[0].role === 'Knight' ? 'Mage' : 'Knight';
        }
        this.broadcastRoomState();
        break;
      }

      case 'spell_cast': {
        const enriched = enrichSpellCastPacket(msg, player);
        this.relayToPeer(player.clientId, enriched);
        break;
      }

      case 'hero_state':
      case 'action_event':
      case 'enemy_hit':
      case 'world_sync':
      case 'revive_partner':
      case 'act_transition': {
        this.relayToPeer(player.clientId, {
          ...msg,
          fromClientId: player.clientId,
          fromRole: player.role,
        });
        break;
      }

      case 'ping': {
        this.sendJson(player.ws, {
          type: 'pong',
          clientTime: msg.clientTime || 0,
          serverTime: Date.now(),
        });
        break;
      }

      default: {
        this.relayToPeer(player.clientId, {
          ...msg,
          fromClientId: player.clientId,
          fromRole: player.role,
        });
        break;
      }
    }
  }

  getPeer(clientId) {
    for (const [id, p] of this.players.entries()) {
      if (id !== clientId) return p;
    }
    return null;
  }

  relayToPeer(senderClientId, payloadObj) {
    const peer = this.getPeer(senderClientId);
    if (!peer) return;
    this.sendJson(peer.ws, payloadObj);
  }

  broadcastRoomState() {
    const playersList = Array.from(this.players.values()).map((p) => ({
      clientId: p.clientId,
      role: p.role,
      isHost: p.isHost,
      device: p.device,
    }));

    for (const player of this.players.values()) {
      const peer = this.getPeer(player.clientId);
      this.sendJson(player.ws, {
        type: 'room_state',
        room: this.roomCode,
        clientId: player.clientId,
        role: player.role,
        isHost: player.isHost,
        peerConnected: Boolean(peer),
        peerId: peer ? peer.clientId : null,
        peerRole: peer ? peer.role : null,
        players: playersList,
        timestamp: Date.now(),
      });
    }
  }

  sendJson(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      // ignore closed socket
    }
  }
}
