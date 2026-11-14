// ============================================================================
// worker/room-do.js
//
// Cloudflare Durable Object (`CoopRoomDO`) managing a 2-player Haru-machi
// Co-Op Room (`Knight` + `Mage`) with identical JSON + Binary protocol to `serve.mjs`.
// - Hibernatable WebSockets (`this.ctx.acceptWebSocket` with clean fallback to
//   `ws.accept()` for Node unit tests) + `this.ctx.storage` / `this.state.storage`
//   persistence (`roomCode`, `players`, `expeditionStarted`, `progression`, `spamCount`)
// - Strict 2-Seat Cap (`room_full` rejection on 3rd visitor, zero eviction)
// - Mutual Ready Gate (`ready: false`, `claimed: false` on initial join for both
//   Host and Guest; `lobby_claim` name/role sync & collision resolution)
// - `element_toggle`, `aim_state`, `full_snapshot`, `snapshot_request`, `rtc_signal`
//   peer-only relay, and `0x02` binary frame passthrough
// - `/internal/commune-apply` endpoint synchronizing Worker `/api/commune` verdicts
//   with `spamCount`, `progression`, and room broadcasts
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

function isBinaryPayload(data) {
  if (!data) return false;
  if (data instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(data)) return true;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) return true;
  return false;
}

export class CoopRoomDO {
  constructor(state = {}, env = {}) {
    this.state = state || {};
    this.ctx = state || {};
    this.env = env || {};
    this.storage = state?.storage || null;

    this.roomCode = 'LOVE';
    this.roomPhrase = 'LOVE';
    this.nextClientSeq = 1;
    this.players = new Map(); // clientId -> { clientId, ws, role, isHost, ready, claimed, playerName, element, device }
    this.expeditionStarted = false;
    this.expeditionStartedAt = null;
    this.progression = createRoomProgressionState();
    this.activeCommuneSpeaker = null; // { clientId, role, startedAt } | null
    this.spamCount = 0;
    this.emptyCleanupTimer = null;
    this._loaded = false;
    this._loadPromise = null;

    this._initFromStorage();
    this._restoreHibernatedSockets();
  }

  _applySnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    if (snap.roomCode) {
      this.roomCode = normalizeRoomPhraseToCode(snap.roomCode);
      this.roomPhrase = snap.roomPhrase || formatRoomCodeToPhrase(this.roomCode);
    }
    if (typeof snap.nextClientSeq === 'number' && snap.nextClientSeq > this.nextClientSeq) {
      this.nextClientSeq = snap.nextClientSeq;
    }
    if (typeof snap.expeditionStarted === 'boolean') {
      this.expeditionStarted = snap.expeditionStarted;
    }
    if (snap.expeditionStartedAt) {
      this.expeditionStartedAt = snap.expeditionStartedAt;
    }
    if (snap.progression && typeof snap.progression === 'object') {
      this.progression.syncFromRemote(snap.progression);
    }
    if (typeof snap.spamCount === 'number' && Number.isFinite(snap.spamCount)) {
      this.spamCount = snap.spamCount;
    }
  }

  _initFromStorage() {
    if (!this.storage || typeof this.storage.get !== 'function') {
      this._loaded = true;
      return;
    }
    try {
      const maybeSnap = this.storage.get('room_snapshot');
      if (maybeSnap && typeof maybeSnap.then === 'function') {
        this._loadPromise = maybeSnap
          .then(async (snap) => {
            if (snap) {
              this._applySnapshot(snap);
            } else {
              const [roomCode, expeditionStarted, progression, spamCount] = await Promise.all([
                this.storage.get('roomCode'),
                this.storage.get('expeditionStarted'),
                this.storage.get('progression'),
                this.storage.get('spamCount'),
              ]);
              this._applySnapshot({
                roomCode,
                expeditionStarted,
                progression,
                spamCount,
              });
            }
            this._loaded = true;
          })
          .catch(() => {
            this._loaded = true;
          });
      } else {
        if (maybeSnap) {
          this._applySnapshot(maybeSnap);
        } else {
          this._applySnapshot({
            roomCode: this.storage.get('roomCode'),
            expeditionStarted: this.storage.get('expeditionStarted'),
            progression: this.storage.get('progression'),
            spamCount: this.storage.get('spamCount'),
          });
        }
        this._loaded = true;
      }
    } catch {
      this._loaded = true;
    }
  }

  async _ensureLoaded() {
    if (this._loaded) return;
    if (this._loadPromise) {
      await this._loadPromise;
    }
    this._loaded = true;
  }

  _persistState() {
    if (!this.storage) return Promise.resolve();
    const progState = this.progression.getState();
    const snapshot = {
      roomCode: this.roomCode,
      roomPhrase: this.roomPhrase,
      nextClientSeq: this.nextClientSeq,
      expeditionStarted: this.expeditionStarted,
      expeditionStartedAt: this.expeditionStartedAt,
      progression: progState,
      spamCount: this.spamCount,
      players: this.getPlayersList(),
      updatedAt: Date.now(),
    };
    try {
      const writeFn =
        typeof this.storage.put === 'function'
          ? (k, v) => this.storage.put(k, v)
          : typeof this.storage.set === 'function'
            ? (k, v) => this.storage.set(k, v)
            : null;
      if (!writeFn) return Promise.resolve();
      const r1 = writeFn('room_snapshot', snapshot);
      const r2 = writeFn('roomCode', this.roomCode);
      const r3 = writeFn('expeditionStarted', this.expeditionStarted);
      const r4 = writeFn('progression', progState);
      const r5 = writeFn('spamCount', this.spamCount);
      const r6 = writeFn('players', snapshot.players);
      if (r1 && typeof r1.then === 'function') {
        return Promise.all([r1, r2, r3, r4, r5, r6]).catch(() => {});
      }
    } catch {
      // ignore storage write errors in mock environments
    }
    return Promise.resolve();
  }

  _restoreHibernatedSockets() {
    const getWsFn =
      typeof this.ctx?.getWebSockets === 'function'
        ? () => this.ctx.getWebSockets()
        : typeof this.state?.getWebSockets === 'function'
          ? () => this.state.getWebSockets()
          : null;
    if (!getWsFn) return;
    try {
      const sockets = getWsFn() || [];
      for (const ws of sockets) {
        const meta =
          typeof ws.deserializeAttachment === 'function' ? ws.deserializeAttachment() : null;
        if (meta && meta.clientId && !this.players.has(meta.clientId)) {
          ws._hibernatable = true;
          this.players.set(meta.clientId, {
            clientId: meta.clientId,
            ws,
            role: meta.role === 'Mage' ? 'Mage' : 'Knight',
            isHost: Boolean(meta.isHost),
            ready: Boolean(meta.ready),
            claimed: Boolean(meta.claimed),
            playerName: String(meta.playerName || ''),
            element: meta.element === 'fire' ? 'fire' : 'ice',
            device: meta.device || 'Desktop',
          });
          const seqNum = Number(String(meta.clientId).replace(/^p/, ''));
          if (Number.isFinite(seqNum) && seqNum >= this.nextClientSeq) {
            this.nextClientSeq = seqNum + 1;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  _syncSocketAttachment(player) {
    if (!player?.ws || typeof player.ws.serializeAttachment !== 'function') return;
    try {
      player.ws.serializeAttachment({
        clientId: player.clientId,
        role: player.role,
        isHost: player.isHost,
        ready: player.ready,
        claimed: player.claimed,
        playerName: player.playerName,
        element: player.element,
        device: player.device,
      });
    } catch {
      // ignore
    }
  }

  getPlayersList() {
    return Array.from(this.players.values()).map((p) => ({
      clientId: p.clientId,
      role: p.role,
      isHost: p.isHost,
      ready: Boolean(p.ready),
      claimed: Boolean(p.claimed),
      playerName: p.playerName || '',
      element: p.element || 'ice',
      device: p.device,
    }));
  }

  async fetch(request) {
    await this._ensureLoaded();
    const url = new URL(request.url);
    const match = url.pathname.match(
      /^\/api\/room\/([A-Za-z0-9_-]{1,48})\/(websocket|status|internal\/commune-apply|commune-apply)\/?$/i
    );
    if (match) {
      this.roomCode = normalizeRoomPhraseToCode(match[1]);
      this.roomPhrase = formatRoomCodeToPhrase(this.roomCode);
    }

    if (
      url.pathname.endsWith('/internal/commune-apply') ||
      url.pathname.endsWith('/commune-apply')
    ) {
      const body = await request.json().catch(() => ({}));
      if (body.room) {
        this.roomCode = normalizeRoomPhraseToCode(body.room);
        this.roomPhrase = formatRoomCodeToPhrase(this.roomCode);
      }
      const speakerRole = body.speakerRole === 'Mage' ? 'Mage' : 'Knight';
      const partnerRole =
        body.partnerRole || (speakerRole === 'Knight' ? 'Mage' : 'Knight');
      const packet = this.applyCommuneVerdict(body.judgment || body, speakerRole, partnerRole);
      await this._persistState();
      return new Response(
        JSON.stringify({
          ok: true,
          room: this.roomCode,
          progression: this.progression.getState(),
          spamCount: this.spamCount,
          packet,
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
          spamCount: this.spamCount,
          players: this.getPlayersList(),
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

    const acceptHibernatable =
      typeof this.ctx?.acceptWebSocket === 'function'
        ? (ws) => this.ctx.acceptWebSocket(ws)
        : typeof this.state?.acceptWebSocket === 'function'
          ? (ws) => this.state.acceptWebSocket(ws)
          : null;

    if (acceptHibernatable) {
      acceptHibernatable(serverWs);
      serverWs._hibernatable = true;
    } else if (typeof serverWs.accept === 'function') {
      serverWs.accept();
    }

    const preferredRole = url.searchParams.get('preferredRole') || url.searchParams.get('role');
    const playerName = url.searchParams.get('playerName') || '';
    this.attachSocket(serverWs, { preferredRole, playerName });

    return new Response(null, {
      status: 101,
      webSocket: clientWs,
      headers: { 'X-Haru-Coop': '1' },
    });
  }

  attachSocket(ws, initialOpts = {}) {
    if (this.emptyCleanupTimer) {
      clearTimeout(this.emptyCleanupTimer);
      this.emptyCleanupTimer = null;
    }

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

    // Default `ready: false` and `claimed: false` for BOTH Host and Guest on initial join!
    const player = {
      clientId,
      ws,
      role,
      isHost,
      ready: false,
      claimed: false,
      playerName: initialOpts.playerName ? String(initialOpts.playerName).trim().slice(0, 32) : '',
      element: 'ice',
      device: initialOpts.device || (isHost ? 'Desktop' : 'Tablet'),
    };
    this.players.set(clientId, player);
    this._syncSocketAttachment(player);
    this._persistState();

    if (!ws._hibernatable && typeof ws.addEventListener === 'function') {
      ws.addEventListener('message', (event) => {
        this.handleRawFrame(player, event.data);
      });

      const onDisconnect = () => {
        this._handleDisconnect(clientId);
      };

      ws.addEventListener('close', onDisconnect);
      ws.addEventListener('error', onDisconnect);
    }

    this.broadcastRoomState();
    return player;
  }

  _findPlayerByWs(ws) {
    for (const p of this.players.values()) {
      if (p.ws === ws) return p;
    }
    return null;
  }

  async webSocketMessage(ws, message) {
    await this._ensureLoaded();
    const player = this._findPlayerByWs(ws);
    if (!player) return;
    this.handleRawFrame(player, message);
  }

  async webSocketClose(ws) {
    await this._ensureLoaded();
    const player = this._findPlayerByWs(ws);
    if (player) {
      this._handleDisconnect(player.clientId);
    }
  }

  async webSocketError(ws) {
    await this._ensureLoaded();
    const player = this._findPlayerByWs(ws);
    if (player) {
      this._handleDisconnect(player.clientId);
    }
  }

  _handleDisconnect(clientId) {
    if (!this.players.has(clientId)) return;
    this.players.delete(clientId);
    if (this.activeCommuneSpeaker?.clientId === clientId) {
      this.activeCommuneSpeaker = null;
    }
    const remaining = Array.from(this.players.values());
    if (remaining.length > 0 && !remaining.some((p) => p.isHost)) {
      remaining[0].isHost = true;
      this._syncSocketAttachment(remaining[0]);
    }
    this._persistState();
    this.broadcastRoomState();
  }

  handleRawFrame(player, data) {
    if (isBinaryPayload(data)) {
      const peer = this.getPeer(player.clientId);
      if (peer && peer.ws) {
        try {
          peer.ws.send(data);
        } catch {
          // ignore closed socket
        }
      }
      return;
    }
    const raw = typeof data === 'string' ? data : String(data ?? '');
    this.handleMessage(player, raw);
  }

  applyCommuneVerdict(judgment = {}, speakerRole = 'Knight', partnerRole = 'Mage') {
    this.activeCommuneSpeaker = null;
    if (judgment.incrementSpam !== false && judgment.spamCount !== undefined) {
      this.spamCount = Number(judgment.spamCount || 0);
    }
    const updatedProgression = this.progression.applyVerdictProgression(judgment);
    const sanitizedJudgment = sanitizePartnerCommunePacket(judgment);
    const packet = {
      type: 'commune_verdict',
      ok: true,
      room: this.roomCode,
      speakerRole,
      partnerRole,
      progression: updatedProgression,
      spamCount: this.spamCount,
      judgment: sanitizedJudgment,
      ...sanitizedJudgment,
      timestamp: Date.now(),
    };
    this.broadcastToAll(packet);
    if (judgment.verdict === 'awakening' || judgment.awakenedStage) {
      this.broadcastToAll({
        type: 'progression_update',
        room: this.roomCode,
        progression: updatedProgression,
        fromRole: speakerRole,
        timestamp: Date.now(),
      });
      this.broadcastRoomState();
    }
    this._persistState();
    return packet;
  }

  handleMessage(player, rawText) {
    if (isBinaryPayload(rawText)) {
      this.handleRawFrame(player, rawText);
      return;
    }
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
        if (typeof msg.playerName === 'string' && msg.playerName.trim()) {
          player.playerName = msg.playerName.trim().slice(0, 32);
        }
        if (typeof msg.claimed === 'boolean') {
          player.claimed = msg.claimed;
        }
        if (typeof msg.ready === 'boolean') {
          player.ready = msg.ready;
        }
        const pref =
          msg.preferredRole === 'Mage' || msg.preferredRole === 'Knight'
            ? msg.preferredRole
            : null;
        if (pref) {
          const peer = this.getPeer(player.clientId);
          if (!peer || peer.role !== pref) {
            player.role = pref;
          } else if (!peer.claimed && !peer.ready) {
            player.role = pref;
            peer.role = pref === 'Knight' ? 'Mage' : 'Knight';
            this._syncSocketAttachment(peer);
          }
        }
        this._syncSocketAttachment(player);
        this._persistState();
        this.broadcastRoomState();
        break;
      }

      case 'lobby_claim': {
        if (typeof msg.playerName === 'string') {
          player.playerName = msg.playerName.trim().slice(0, 32);
        }
        const requestedRole =
          msg.role === 'Mage' || msg.role === 'Knight' ? msg.role : null;
        if (requestedRole) {
          const peer = this.getPeer(player.clientId);
          if (!peer) {
            player.role = requestedRole;
          } else if (peer.role === requestedRole) {
            if (!peer.claimed && !peer.ready) {
              player.role = requestedRole;
              peer.role = requestedRole === 'Knight' ? 'Mage' : 'Knight';
              this._syncSocketAttachment(peer);
            } else {
              player.role = peer.role === 'Knight' ? 'Mage' : 'Knight';
            }
          } else {
            player.role = requestedRole;
          }
        }
        if (typeof msg.claimed === 'boolean') {
          player.claimed = msg.claimed;
          player.ready = msg.ready !== undefined ? Boolean(msg.ready) : msg.claimed;
        } else if (typeof msg.ready === 'boolean') {
          player.ready = msg.ready;
          if (msg.ready) player.claimed = true;
        }
        this._syncSocketAttachment(player);
        this._persistState();
        this.broadcastToAll({
          type: 'lobby_claim',
          room: this.roomCode,
          clientId: player.clientId,
          role: player.role,
          playerName: player.playerName,
          claimed: Boolean(player.claimed),
          ready: Boolean(player.ready),
          players: this.getPlayersList(),
          timestamp: Date.now(),
        });
        this.broadcastRoomState();
        break;
      }

      case 'set_ready': {
        player.ready = Boolean(msg.ready);
        if (player.ready) {
          player.claimed = true;
        }
        if (typeof msg.playerName === 'string' && msg.playerName.trim()) {
          player.playerName = msg.playerName.trim().slice(0, 32);
        }
        this._syncSocketAttachment(player);
        this._persistState();
        this.broadcastToAll({
          type: 'player_ready',
          room: this.roomCode,
          clientId: player.clientId,
          role: player.role,
          playerName: player.playerName,
          ready: player.ready,
          claimed: player.claimed,
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
        if (peer && !peer.ready && !peer.claimed && !msg.force) {
          this.sendJson(player.ws, {
            type: 'expedition_error',
            ok: false,
            error: 'guest_not_ready',
          });
          break;
        }
        player.ready = true;
        player.claimed = true;
        this.expeditionStarted = true;
        this.expeditionStartedAt = Date.now();
        if (msg.resetProgression) {
          this.progression = createRoomProgressionState();
        }
        this._syncSocketAttachment(player);
        this._persistState();
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
        this._persistState();
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
          this._syncSocketAttachment(all[0]);
          this._syncSocketAttachment(all[1]);
        } else if (all.length === 1) {
          all[0].role = all[0].role === 'Knight' ? 'Mage' : 'Knight';
          this._syncSocketAttachment(all[0]);
        }
        this._persistState();
        this.broadcastRoomState();
        break;
      }

      case 'element_toggle': {
        const nextEl = msg.element === 'fire' ? 'fire' : 'ice';
        player.element = nextEl;
        this._syncSocketAttachment(player);
        this.relayToPeer(player.clientId, {
          ...msg,
          type: 'element_toggle',
          role: msg.role || player.role,
          element: nextEl,
          fromClientId: player.clientId,
          fromRole: player.role,
          timestamp: Date.now(),
        });
        break;
      }

      case 'aim_state': {
        this.relayToPeer(player.clientId, {
          ...msg,
          type: 'aim_state',
          role: msg.role || player.role,
          fromClientId: player.clientId,
          fromRole: player.role,
          timestamp: msg.timestamp || Date.now(),
        });
        break;
      }

      case 'snapshot_request':
      case 'request_full_snapshot': {
        this.relayToPeer(player.clientId, {
          ...msg,
          type: 'snapshot_request',
          fromClientId: player.clientId,
          fromRole: player.role,
          timestamp: Date.now(),
        });
        break;
      }

      case 'full_snapshot': {
        if (msg.progression) {
          this.progression.syncFromRemote(msg.progression);
          this._persistState();
        }
        this.relayToPeer(player.clientId, {
          ...msg,
          type: 'full_snapshot',
          progression: this.progression.getState(),
          fromClientId: player.clientId,
          fromRole: player.role,
          timestamp: Date.now(),
        });
        break;
      }

      case 'rtc_signal': {
        this.relayToPeer(player.clientId, {
          ...msg,
          type: 'rtc_signal',
          fromClientId: player.clientId,
          fromRole: player.role,
          timestamp: Date.now(),
        });
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
        this._persistState();
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
          ...sanitizePartnerCommunePacket(msg),
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
    const playersList = this.getPlayersList();
    const progState = this.progression.getState();

    for (const player of this.players.values()) {
      const peer = this.getPeer(player.clientId);
      this.sendJson(player.ws, {
        type: 'room_state',
        room: this.roomCode,
        roomPhrase: this.roomPhrase,
        clientId: player.clientId,
        role: player.role,
        playerName: player.playerName || '',
        claimed: Boolean(player.claimed),
        element: player.element || 'ice',
        isHost: player.isHost,
        ready: Boolean(player.ready),
        peerReady: peer ? Boolean(peer.ready) : false,
        peerClaimed: peer ? Boolean(peer.claimed) : false,
        peerName: peer ? peer.playerName || '' : '',
        peerElement: peer ? peer.element || 'ice' : 'ice',
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
