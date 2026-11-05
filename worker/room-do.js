// ============================================================================
// worker/room-do.js
//
// Cloudflare Durable Object (`CoopRoomDO`) managing a 2-player Haru-machi
// Co-Op Room (`Knight` + `Mage`) with identical JSON protocol to `serve.mjs`.
// - Strict 2-Seat Cap (`room_full` rejection on 3rd visitor, zero eviction)
// - Guest `set_ready` & Host `start_expedition`
// - Sequential 3-Stone `progression_update` synchronization
// - Single active Commune ceremony lock (`activeCommuneSpeaker` / `commune_busy`)
// - Strict Partner Audio/Transcript Privacy (never relays raw audio or transcript)
// ============================================================================

import {
  normalizeRoomPhraseToCode,
  formatRoomCodeToPhrase,
  createRoomProgressionState,
} from '../world/src/net/room-progression.js';

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

export function sanitizePartnerCommunePacket(msg = {}) {
  const safe = { ...msg };
  delete safe.audioBase64;
  delete safe.audio;
  delete safe.rawAudio;
  delete safe.chunks;
  delete safe.transcript;
  delete safe.heard_transcript;
  delete safe.transcriptHint;
  if (safe.judgment && typeof safe.judgment === 'object') {
    safe.judgment = { ...safe.judgment };
    delete safe.judgment.audioBase64;
    delete safe.judgment.transcript;
    delete safe.judgment.heard_transcript;
  }
  return safe;
}

export class CoopRoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.roomCode = 'LOVE';
    this.roomPhrase = 'LOVE';
    this.nextClientSeq = 1;
    this.players = new Map(); // clientId -> { clientId, ws, role, isHost, ready, device }
    this.expeditionStarted = false;
    this.expeditionStartedAt = null;
    this.progression = createRoomProgressionState();
    this.activeCommuneSpeaker = null; // { clientId, role, startedAt } | null
    this.spamCount = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const match = url.pathname.match(
      /^\/api\/room\/([A-Za-z0-9_-]{1,48})\/(websocket|status)\/?$/i
    );
    if (match) {
      this.roomCode = normalizeRoomPhraseToCode(match[1]);
      this.roomPhrase = formatRoomCodeToPhrase(this.roomCode);
    }

    if (url.pathname.endsWith('/status')) {
      return new Response(
        JSON.stringify({
          ok: true,
          room: this.roomCode,
          roomPhrase: this.roomPhrase,
          playerCount: this.players.size,
          isFull: this.players.size >= 2,
          maxPlayers: 2,
          expeditionStarted: this.expeditionStarted,
          startedAt: this.expeditionStartedAt,
          progression: this.progression.getState(),
          activeCommuneSpeaker: this.activeCommuneSpeaker,
          players: Array.from(this.players.values()).map((p) => ({
            clientId: p.clientId,
            role: p.role,
            isHost: p.isHost,
            ready: Boolean(p.ready),
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
    // Strict 2-Seat Cap (No Eviction): reject 3rd visitor cleanly without
    // evicting either of the 2 seated players.
    if (this.players.size >= 2) {
      this.sendJson(ws, {
        type: 'room_full',
        ok: false,
        error: 'room_full',
        maxPlayers: 2,
        room: this.roomCode,
      });
      try {
        ws.close(1008, 'room_full');
      } catch {
        // ignore
      }
      return null;
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
      ready: Boolean(isHost),
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
      if (this.activeCommuneSpeaker?.clientId === clientId) {
        this.activeCommuneSpeaker = null;
      }
      const remaining = Array.from(this.players.values());
      if (remaining.length > 0 && !remaining.some((p) => p.isHost)) {
        remaining[0].isHost = true;
        remaining[0].ready = true;
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
        if (msg.roomPhrase) {
          this.roomPhrase = String(msg.roomPhrase).slice(0, 64);
        }
        const pref =
          msg.preferredRole === 'Mage' || msg.preferredRole === 'Knight'
            ? msg.preferredRole
            : null;
        if (pref) {
          const peer = this.getPeer(player.clientId);
          if (!peer || peer.role !== pref) {
            player.role = pref;
          }
        }
        this.broadcastRoomState();
        break;
      }

      case 'set_ready': {
        player.ready = Boolean(msg.ready);
        this.broadcastToAll({
          type: 'player_ready',
          room: this.roomCode,
          clientId: player.clientId,
          role: player.role,
          ready: player.ready,
          timestamp: Date.now(),
        });
        this.broadcastRoomState();
        break;
      }

      case 'start_expedition': {
        if (!player.isHost) {
          this.sendJson(player.ws, {
            type: 'expedition_error',
            ok: false,
            error: 'only_host_can_start',
          });
          break;
        }
        const peer = this.getPeer(player.clientId);
        if (peer && !peer.ready && !msg.force) {
          this.sendJson(player.ws, {
            type: 'expedition_error',
            ok: false,
            error: 'guest_not_ready',
          });
          break;
        }
        this.expeditionStarted = true;
        this.expeditionStartedAt = Date.now();
        this.broadcastToAll({
          type: 'expedition_started',
          ok: true,
          room: this.roomCode,
          startedAt: this.expeditionStartedAt,
          progression: this.progression.getState(),
        });
        this.broadcastRoomState();
        break;
      }

      case 'stone_read':
      case 'progression_update': {
        if (msg.stoneId) {
          this.progression.readInscriptionStone(msg.stoneId);
        }
        if (msg.progression) {
          this.progression.syncFromRemote(msg.progression);
        } else {
          this.progression.syncFromRemote(msg);
        }
        const progState = this.progression.getState();
        this.broadcastToAll({
          type: 'progression_update',
          room: this.roomCode,
          stoneId: msg.stoneId || progState.lastReadStoneId,
          progression: progState,
          fromClientId: player.clientId,
          fromRole: player.role,
          timestamp: Date.now(),
        });
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

      case 'commune_start':
      case 'commune_state': {
        const targetState =
          msg.type === 'commune_start'
            ? 'channel'
            : String(msg.state || 'channel').toLowerCase();

        if (targetState === 'channel' || targetState === 'listening') {
          if (
            this.activeCommuneSpeaker &&
            this.activeCommuneSpeaker.clientId !== player.clientId &&
            Date.now() - this.activeCommuneSpeaker.startedAt < 32000
          ) {
            this.sendJson(player.ws, {
              type: 'commune_busy',
              ok: false,
              error: 'commune_busy',
              activeSpeakerRole: this.activeCommuneSpeaker.role,
              room: this.roomCode,
            });
            break;
          }
          this.activeCommuneSpeaker = {
            clientId: player.clientId,
            role: player.role,
            startedAt: Date.now(),
          };
          // Relay ONLY non-spoiler channel state (never raw audio or transcript!)
          this.relayToPeer(player.clientId, {
            type: 'commune_state',
            state: 'channel',
            speakerRole: player.role,
            fromClientId: player.clientId,
            fromRole: player.role,
            timestamp: Date.now(),
          });
        } else if (
          targetState === 'idle' ||
          targetState === 'cancel' ||
          targetState === 'complete'
        ) {
          if (this.activeCommuneSpeaker?.clientId === player.clientId) {
            this.activeCommuneSpeaker = null;
          }
          this.relayToPeer(player.clientId, {
            type: 'commune_state',
            state: 'idle',
            speakerRole: player.role,
            fromClientId: player.clientId,
            fromRole: player.role,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'commune_verdict': {
        this.activeCommuneSpeaker = null;
        this.progression.applyVerdictProgression(msg.judgment || msg);
        const safeVerdict = sanitizePartnerCommunePacket({
          ...msg,
          progression: this.progression.getState(),
          fromClientId: player.clientId,
          fromRole: player.role,
        });
        this.relayToPeer(player.clientId, safeVerdict);
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
          ... sanitizePartnerCommunePacket(msg),
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

  broadcastToAll(payloadObj) {
    for (const player of this.players.values()) {
      this.sendJson(player.ws, payloadObj);
    }
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
      ready: Boolean(p.ready),
      device: p.device,
    }));
    const progState = this.progression.getState();

    for (const player of this.players.values()) {
      const peer = this.getPeer(player.clientId);
      this.sendJson(player.ws, {
        type: 'room_state',
        room: this.roomCode,
        roomPhrase: this.roomPhrase,
        clientId: player.clientId,
        role: player.role,
        isHost: player.isHost,
        ready: Boolean(player.ready),
        peerReady: peer ? Boolean(peer.ready) : false,
        peerConnected: Boolean(peer),
        peerId: peer ? peer.clientId : null,
        peerRole: peer ? peer.role : null,
        isFull: this.players.size >= 2,
        expeditionStarted: this.expeditionStarted,
        progression: progState,
        activeCommuneSpeaker: this.activeCommuneSpeaker,
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
