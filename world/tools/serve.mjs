// ============================================================================
// world/tools/serve.mjs
//
// Zero-dependency HTTP Static Server + RFC 6455 WebSocket Co-Op Room Server
// + Secret-Safe 3-Stone Scripture Catalog (`/api/altar`) & Context-Aware
// Commune Judge (`/api/commune`) for Haru-machi (Stage 5 / Wave 3).
//
// Protocol Parity with `worker/room-do.js` & `worker/index.js`:
// - Strict 2-Seat Cap (`room_full` rejection with 1008 close on 3rd visitor,
//   never evicting seated players)
// - Guest `set_ready` & Host `start_expedition`
// - Sequential 3-Stone `progression_update` synchronization
// - Single active Commune ceremony lock (`activeCommuneSpeaker` / `commune_busy`)
// - Partner Audio & Transcript Privacy (never relays raw audio or transcript)
// - Static File Dotfile Boundary (`403 Forbidden` on `/.env`, `/.git`, etc.)
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { exec, execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  enrichSpellCastPacket,
  sanitizePartnerCommunePacket,
} from '../../worker/room-do.js';
import { getScriptureForStage } from '../../worker/scripture-catalog.js';
import { evaluateCommunePrayer } from '../../worker/commune-judge.js';
import {
  normalizeRoomPhraseToCode,
  formatRoomCodeToPhrase,
  createRoomProgressionState,
} from '../src/net/room-progression.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const defaultPort = Number(process.env.PORT || 4173);
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_TIMEOUT_MS = 2800;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

/* ------------------------------------------------------------------------- */
/* .env Loader & 4-Key Round-Robin Gemini Pool                               */
/* ------------------------------------------------------------------------- */

export function loadDotEnv(envPath = path.join(repoRoot, '.env')) {
  const parsed = {};
  if (!fs.existsSync(envPath)) return parsed;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    val = val.replace(/\\n/g, '\n');
    parsed[key] = val;
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
  return parsed;
}

function loadGeminiApiKeys() {
  const keySet = new Set();
  const addRaw = (raw) => {
    if (!raw) return;
    for (const part of String(raw).split(',')) {
      const k = part.trim();
      if (k.length >= 10) keySet.add(k);
    }
  };

  addRaw(process.env.GEMINI_API_KEYS);
  addRaw(process.env.GEMINI_API_KEY);

  if (process.platform === 'win32') {
    try {
      const regOut = execSync('reg query "HKCU\\Environment"', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const multiMatch = regOut.match(/GEMINI_API_KEYS\s+REG_\w+\s+([^\r\n]+)/i);
      if (multiMatch) addRaw(multiMatch[1]);
      const singleMatch = regOut.match(/GEMINI_API_KEY\s+REG_\w+\s+([^\r\n]+)/i);
      if (singleMatch) addRaw(singleMatch[1]);
    } catch {
      // Fallback to process.env only
    }
  }

  return Array.from(keySet);
}

loadDotEnv();
const geminiKeys = loadGeminiApiKeys();
let geminiKeyCursor = 0;

function nextGeminiKey() {
  if (geminiKeys.length === 0) return null;
  const key = geminiKeys[geminiKeyCursor % geminiKeys.length];
  geminiKeyCursor = (geminiKeyCursor + 1) % geminiKeys.length;
  return key;
}

function normalizeRoomCode(raw) {
  return normalizeRoomPhraseToCode(raw || 'LOVE');
}

function hasDotfileSegment(urlPath) {
  const normalized = String(urlPath || '/').replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments.some((seg) => seg.startsWith('.') && seg.length > 1);
}

function readJsonBody(req, maxBytes = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function callSingleGeminiKey(apiKey, requestBody, hardTimeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), hardTimeoutMs);
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const textPart = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('')
      .trim();
    if (!textPart) {
      throw new Error('Empty response from Gemini');
    }

    return JSON.parse(textPart);
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiWithRotation(requestBody) {
  const maxAttempts = Math.max(1, geminiKeys.length);
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = nextGeminiKey();
    if (!apiKey) {
      throw new Error('No Gemini API keys configured in environment');
    }

    try {
      const primaryPromise = callSingleGeminiKey(apiKey, requestBody, 6500);
      const hedgedResult = await new Promise((resolve, reject) => {
        let settled = false;
        const hedgeTimer = setTimeout(() => {
          if (settled || geminiKeys.length < 2) return;
          const backupKey = nextGeminiKey();
          if (!backupKey) return;
          callSingleGeminiKey(backupKey, requestBody, 5000).then(
            (res) => {
              if (!settled) {
                settled = true;
                resolve(res);
              }
            },
            () => {}
          );
        }, GEMINI_TIMEOUT_MS);

        primaryPromise.then(
          (res) => {
            if (!settled) {
              settled = true;
              clearTimeout(hedgeTimer);
              resolve(res);
            }
          },
          (err) => {
            clearTimeout(hedgeTimer);
            if (!settled) {
              settled = true;
              reject(err);
            }
          }
        );
      });

      return hedgedResult;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini API keys failed');
}

/* ------------------------------------------------------------------------- */
/* RFC 6455 WebSocket Frame Encoder & Streaming Decoder                      */
/* ------------------------------------------------------------------------- */

export function encodeWsFrame(payload, opcode = 0x81) {
  const data = Buffer.isBuffer(payload)
    ? payload
    : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8');
  const len = data.length;

  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, data]);
}

export function encodeWsCloseFrame(code = 1000, reason = '') {
  const reasonBuf = Buffer.from(String(reason || '').slice(0, 120), 'utf8');
  const payload = Buffer.allocUnsafe(2 + reasonBuf.length);
  payload.writeUInt16BE(code, 0);
  reasonBuf.copy(payload, 2);
  return encodeWsFrame(payload, 0x88);
}

function attachWsDecoder(socket, { onTextMessage, onClose }) {
  let buffer = Buffer.alloc(0);
  let fragments = [];
  let closed = false;

  const triggerClose = () => {
    if (closed) return;
    closed = true;
    onClose?.();
  };

  const feed = (chunk) => {
    if (!chunk || chunk.length === 0 || closed) return;
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const b1 = buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < offset + 2) return;
        payloadLen = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLen === 127) {
        if (buffer.length < offset + 8) return;
        payloadLen = Number(buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      let maskKey = null;
      if (masked) {
        if (buffer.length < offset + 4) return;
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLen) return;

      const payload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
      buffer = buffer.subarray(offset + payloadLen);

      if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i & 3];
        }
      }

      // Control frames (Close = 0x08, Ping = 0x09, Pong = 0x0A)
      if (opcode === 0x08) {
        if (!socket.destroyed && socket.writable) {
          socket.write(encodeWsFrame(Buffer.alloc(0), 0x88));
          socket.end();
        }
        triggerClose();
        return;
      }
      if (opcode === 0x09) {
        if (!socket.destroyed && socket.writable) {
          socket.write(encodeWsFrame(payload, 0x8a));
        }
        continue;
      }
      if (opcode === 0x0a) {
        continue;
      }

      // Data frames (Text = 0x01, Continuation = 0x00)
      if (opcode === 0x01 || opcode === 0x00) {
        fragments.push(payload);
        if (fin) {
          const fullBuf = fragments.length === 1 ? fragments[0] : Buffer.concat(fragments);
          fragments = [];
          onTextMessage?.(fullBuf.toString('utf8'));
        }
      }
    }
  };

  socket.on('data', feed);
  socket.on('close', triggerClose);
  socket.on('end', triggerClose);
  socket.on('error', triggerClose);

  return { feed };
}

/* ------------------------------------------------------------------------- */
/* In-Memory Co-Op Room Manager                                              */
/* ------------------------------------------------------------------------- */

function createRoomManager() {
  const rooms = new Map();
  let nextSeq = 1;

  function getOrCreateRoom(code) {
    const norm = normalizeRoomCode(code);
    let room = rooms.get(norm);
    if (!room) {
      room = {
        code: norm,
        roomPhrase: formatRoomCodeToPhrase(norm),
        players: new Map(),
        expeditionStarted: false,
        expeditionStartedAt: null,
        progression: createRoomProgressionState(),
        activeCommuneSpeaker: null,
        spamCount: 0,
      };
      rooms.set(norm, room);
    }
    return room;
  }

  function getPeer(room, clientId) {
    for (const [id, p] of room.players.entries()) {
      if (id !== clientId) return p;
    }
    return null;
  }

  function sendJson(socket, obj) {
    if (!socket || socket.destroyed || !socket.writable) return;
    try {
      socket.write(encodeWsFrame(JSON.stringify(obj), 0x81));
    } catch {
      // ignore write error on closing socket
    }
  }

  function broadcastToRoom(code, obj) {
    const norm = normalizeRoomCode(code);
    const room = rooms.get(norm);
    if (!room) return 0;
    let count = 0;
    for (const player of room.players.values()) {
      sendJson(player.socket, obj);
      count++;
    }
    return count;
  }

  function broadcastRoomState(room) {
    const playersList = Array.from(room.players.values()).map((p) => ({
      clientId: p.clientId,
      role: p.role,
      isHost: p.isHost,
      ready: Boolean(p.ready),
      device: p.device,
    }));
    const progState = room.progression.getState();

    for (const player of room.players.values()) {
      const peer = getPeer(room, player.clientId);
      sendJson(player.socket, {
        type: 'room_state',
        room: room.code,
        roomPhrase: room.roomPhrase,
        clientId: player.clientId,
        role: player.role,
        isHost: player.isHost,
        ready: Boolean(player.ready),
        peerReady: peer ? Boolean(peer.ready) : false,
        peerConnected: Boolean(peer),
        peerId: peer ? peer.clientId : null,
        peerRole: peer ? peer.role : null,
        isFull: room.players.size >= 2,
        expeditionStarted: room.expeditionStarted,
        progression: progState,
        activeCommuneSpeaker: room.activeCommuneSpeaker,
        players: playersList,
        timestamp: Date.now(),
      });
    }
  }

  function addClient(roomCode, socket, head, initialOpts = {}) {
    const room = getOrCreateRoom(roomCode);

    // Strict 2-Seat Cap (No Eviction): NEVER evict an existing seated player!
    // Send `room_full` to the 3rd connecting socket and close it cleanly (1008).
    if (room.players.size >= 2) {
      sendJson(socket, {
        type: 'room_full',
        ok: false,
        error: 'room_full',
        maxPlayers: 2,
        room: room.code,
      });
      try {
        socket.end(encodeWsCloseFrame(1008, 'room_full'));
      } catch {
        // ignore
      }
      return null;
    }

    const clientId = `p${nextSeq++}`;
    const existing = Array.from(room.players.values());
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
      socket,
      role,
      isHost,
      ready: Boolean(isHost),
      device: initialOpts.device || (isHost ? 'Desktop' : 'Tablet'),
    };
    room.players.set(clientId, player);

    const decoder = attachWsDecoder(socket, {
      onTextMessage: (rawText) => handleMessage(room, player, rawText),
      onClose: () => {
        if (!room.players.has(clientId)) return;
        room.players.delete(clientId);
        if (room.activeCommuneSpeaker?.clientId === clientId) {
          room.activeCommuneSpeaker = null;
        }
        const remaining = Array.from(room.players.values());
        if (remaining.length === 0) {
          rooms.delete(room.code);
          return;
        }
        if (!remaining.some((p) => p.isHost)) {
          remaining[0].isHost = true;
          remaining[0].ready = true;
        }
        broadcastRoomState(room);
      },
    });

    broadcastRoomState(room);

    if (head && head.length > 0) {
      decoder.feed(head);
    }
    return player;
  }

  function handleMessage(room, player, rawText) {
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
          room.roomPhrase = String(msg.roomPhrase).slice(0, 64);
        }
        const pref =
          msg.preferredRole === 'Mage' || msg.preferredRole === 'Knight'
            ? msg.preferredRole
            : null;
        if (pref) {
          const peer = getPeer(room, player.clientId);
          if (!peer || peer.role !== pref) {
            player.role = pref;
          }
        }
        broadcastRoomState(room);
        break;
      }

      case 'set_ready': {
        player.ready = Boolean(msg.ready);
        broadcastToRoom(room.code, {
          type: 'player_ready',
          room: room.code,
          clientId: player.clientId,
          role: player.role,
          ready: player.ready,
          timestamp: Date.now(),
        });
        broadcastRoomState(room);
        break;
      }

      case 'start_expedition': {
        if (!player.isHost) {
          sendJson(player.socket, {
            type: 'expedition_error',
            ok: false,
            error: 'only_host_can_start',
          });
          break;
        }
        const peer = getPeer(room, player.clientId);
        if (peer && !peer.ready && !msg.force) {
          sendJson(player.socket, {
            type: 'expedition_error',
            ok: false,
            error: 'guest_not_ready',
          });
          break;
        }
        room.expeditionStarted = true;
        room.expeditionStartedAt = Date.now();
        broadcastToRoom(room.code, {
          type: 'expedition_started',
          ok: true,
          room: room.code,
          startedAt: room.expeditionStartedAt,
          progression: room.progression.getState(),
        });
        broadcastRoomState(room);
        break;
      }

      case 'stone_read':
      case 'progression_update': {
        if (msg.stoneId) {
          room.progression.readInscriptionStone(msg.stoneId);
        }
        if (msg.progression) {
          room.progression.syncFromRemote(msg.progression);
        } else {
          room.progression.syncFromRemote(msg);
        }
        const progState = room.progression.getState();
        broadcastToRoom(room.code, {
          type: 'progression_update',
          room: room.code,
          stoneId: msg.stoneId || progState.lastReadStoneId,
          progression: progState,
          fromClientId: player.clientId,
          fromRole: player.role,
          timestamp: Date.now(),
        });
        broadcastRoomState(room);
        break;
      }

      case 'swap_roles': {
        const all = Array.from(room.players.values());
        if (all.length === 2) {
          const tmp = all[0].role;
          all[0].role = all[1].role;
          all[1].role = tmp;
        } else if (all.length === 1) {
          all[0].role = all[0].role === 'Knight' ? 'Mage' : 'Knight';
        }
        broadcastRoomState(room);
        break;
      }

      case 'spell_cast': {
        const peer = getPeer(room, player.clientId);
        if (peer) {
          sendJson(peer.socket, enrichSpellCastPacket(msg, player));
        }
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
            room.activeCommuneSpeaker &&
            room.activeCommuneSpeaker.clientId !== player.clientId &&
            Date.now() - room.activeCommuneSpeaker.startedAt < 32000
          ) {
            sendJson(player.socket, {
              type: 'commune_busy',
              ok: false,
              error: 'commune_busy',
              activeSpeakerRole: room.activeCommuneSpeaker.role,
              room: room.code,
            });
            break;
          }
          room.activeCommuneSpeaker = {
            clientId: player.clientId,
            role: player.role,
            startedAt: Date.now(),
          };
          const peer = getPeer(room, player.clientId);
          if (peer) {
            // Relay ONLY non-spoiler channel state (never raw audio or transcript!)
            sendJson(peer.socket, {
              type: 'commune_state',
              state: 'channel',
              speakerRole: player.role,
              fromClientId: player.clientId,
              fromRole: player.role,
              timestamp: Date.now(),
            });
          }
        } else if (
          targetState === 'idle' ||
          targetState === 'cancel' ||
          targetState === 'complete'
        ) {
          if (room.activeCommuneSpeaker?.clientId === player.clientId) {
            room.activeCommuneSpeaker = null;
          }
          const peer = getPeer(room, player.clientId);
          if (peer) {
            sendJson(peer.socket, {
              type: 'commune_state',
              state: 'idle',
              speakerRole: player.role,
              fromClientId: player.clientId,
              fromRole: player.role,
              timestamp: Date.now(),
            });
          }
        }
        break;
      }

      case 'commune_verdict': {
        room.activeCommuneSpeaker = null;
        room.progression.applyVerdictProgression(msg.judgment || msg);
        const peer = getPeer(room, player.clientId);
        if (peer) {
          sendJson(
            peer.socket,
            sanitizePartnerCommunePacket({
              ...msg,
              progression: room.progression.getState(),
              fromClientId: player.clientId,
              fromRole: player.role,
            })
          );
        }
        break;
      }

      case 'hero_state':
      case 'action_event':
      case 'enemy_hit':
      case 'world_sync':
      case 'revive_partner':
      case 'act_transition': {
        const peer = getPeer(room, player.clientId);
        if (peer) {
          sendJson(peer.socket, {
            ...msg,
            fromClientId: player.clientId,
            fromRole: player.role,
          });
        }
        break;
      }

      case 'ping': {
        sendJson(player.socket, {
          type: 'pong',
          clientTime: msg.clientTime || 0,
          serverTime: Date.now(),
        });
        break;
      }

      default: {
        const peer = getPeer(room, player.clientId);
        if (peer) {
          sendJson(peer.socket, {
            ...sanitizePartnerCommunePacket(msg),
            fromClientId: player.clientId,
            fromRole: player.role,
          });
        }
        break;
      }
    }
  }

  function getRoomStatus(code) {
    const norm = normalizeRoomCode(code);
    const room = rooms.get(norm);
    const players = room
      ? Array.from(room.players.values()).map((p) => ({
          clientId: p.clientId,
          role: p.role,
          isHost: p.isHost,
          ready: Boolean(p.ready),
          device: p.device,
        }))
      : [];
    return {
      ok: true,
      room: norm,
      roomPhrase: room ? room.roomPhrase : formatRoomCodeToPhrase(norm),
      playerCount: players.length,
      isFull: players.length >= 2,
      maxPlayers: 2,
      expeditionStarted: Boolean(room?.expeditionStarted),
      startedAt: room?.expeditionStartedAt || null,
      progression: room ? room.progression.getState() : createRoomProgressionState().getState(),
      activeCommuneSpeaker: room?.activeCommuneSpeaker || null,
      players,
    };
  }

  return {
    addClient,
    getOrCreateRoom,
    getRoomStatus,
    broadcastToRoom,
    broadcastRoomState,
    rooms,
  };
}

/* ------------------------------------------------------------------------- */
/* HTTP + WebSocket Upgrade Server Factory                                   */
/* ------------------------------------------------------------------------- */

export function createWorldServer() {
  const roomManager = createRoomManager();

  // Pre-warm TLS keep-alive socket pool only when live and not stubbed in tests
  if (
    geminiKeys.length > 0 &&
    process.env.GEMINI_STUB !== '1' &&
    process.env.HARU_COMMUNE_OFFLINE !== '1'
  ) {
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKeys[0])}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ok' }] }],
          generationConfig: { thinkingConfig: { thinkingLevel: 'MINIMAL' } },
        }),
      }
    ).catch(() => {});
  }

  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
    let urlPath;
    try {
      urlPath = decodeURIComponent(parsedUrl.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('400 Bad Request');
      return;
    }

    res.setHeader('X-Haru-Coop', '1');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Static File Dotfile Boundary: Block any request whose path segment starts with `.`
    if (hasDotfileSegment(urlPath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }

    if (urlPath === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. Sequential 3-Stone Sacred Inscription Catalog (`GET /api/altar`)
    if (urlPath === '/api/altar' && req.method === 'GET') {
      const envConfig = loadDotEnv();
      const stageParam = parsedUrl.searchParams.get('stage');
      const stoneParam = parsedUrl.searchParams.get('stone');
      let stonesSolvedParam = parsedUrl.searchParams.get('stonesSolved');
      const roomParam = parsedUrl.searchParams.get('room');

      if (
        stageParam === null &&
        stoneParam === null &&
        stonesSolvedParam === null &&
        roomParam
      ) {
        const room = roomManager.getOrCreateRoom(roomParam);
        if (stoneParam) {
          room.progression.readInscriptionStone(stoneParam);
        }
        stonesSolvedParam = room.progression.getState().stonesSolved;
      }

      const scripture = getScriptureForStage(
        {
          stage: stageParam,
          stone: stoneParam,
          stonesSolved: stonesSolvedParam,
        },
        envConfig
      );

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(scripture));
      return;
    }

    // 2. Context-Aware Shrine Commune Judge (`POST /api/commune`)
    if (urlPath === '/api/commune' && req.method === 'POST') {
      const startedAt = Date.now();
      try {
        const body = await readJsonBody(req);
        const envConfig = loadDotEnv();
        const roomCode = normalizeRoomCode(body.room || 'LOVE');
        const room = roomManager.getOrCreateRoom(roomCode);

        const speakerRole = body.speakerRole === 'Mage' ? 'Mage' : 'Knight';
        const partnerRole =
          body.partnerRole || (speakerRole === 'Knight' ? 'Mage' : 'Knight');
        const audioBase64 = String(body.audioBase64 || '').replace(
          /^data:[^;]+;base64,/,
          ''
        );
        const mimeType = String(body.mimeType || 'audio/webm');
        const transcriptHint = String(body.transcriptHint || '');
        const gameState = body.gameState || {};
        const progressionState =
          body.progressionState || room.progression.getState();
        const spamCount =
          body.spamCount !== undefined ? Number(body.spamCount) : room.spamCount;

        const judgment = await evaluateCommunePrayer({
          audioBase64,
          mimeType,
          transcriptHint,
          speakerRole,
          partnerRole,
          gameState,
          progressionState,
          spamCount,
          env: envConfig,
          geminiCaller:
            geminiKeys.length > 0 &&
            process.env.GEMINI_STUB !== '1' &&
            process.env.HARU_COMMUNE_OFFLINE !== '1'
              ? callGeminiWithRotation
              : null,
        });

        room.spamCount = Number(judgment.spamCount ?? 0);
        room.activeCommuneSpeaker = null;
        const updatedProgression = room.progression.applyVerdictProgression(judgment);

        const sanitizedJudgment = sanitizePartnerCommunePacket(judgment);
        const packet = {
          type: 'commune_verdict',
          ok: true,
          room: roomCode,
          speakerRole,
          partnerRole,
          progression: updatedProgression,
          judgment: sanitizedJudgment,
          ...sanitizedJudgment,
          latencyMs: Date.now() - startedAt,
          timestamp: Date.now(),
        };

        roomManager.broadcastToRoom(roomCode, packet);
        if (judgment.verdict === 'awakening') {
          roomManager.broadcastToRoom(roomCode, {
            type: 'progression_update',
            room: roomCode,
            progression: updatedProgression,
            fromRole: speakerRole,
            timestamp: Date.now(),
          });
          roomManager.broadcastRoomState(room);
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(packet));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            type: 'commune_verdict',
            ok: false,
            error: String(err?.message || err),
            verdict: 'smite',
            hpDelta: -10,
            shouldSpeakAloud: false,
            audioUrl: null,
            latencyMs: Date.now() - startedAt,
            timestamp: Date.now(),
          })
        );
      }
      return;
    }

    // 3. Room status JSON endpoint (`/api/room/:code/status`)
    const statusMatch = urlPath.match(
      /^\/api\/room\/([A-Za-z0-9_-]{1,48})\/status\/?$/i
    );
    if (statusMatch) {
      const status = roomManager.getRoomStatus(statusMatch[1]);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(status));
      return;
    }

    // 4. Static file serving (with path traversal, dotfile protection, and worktree asset fallback)
    const relUrlPath = urlPath === '/' ? 'world/index.html' : urlPath.replace(/^\/+/, '');
    let filePath = path.resolve(repoRoot, relUrlPath);
    const relPath = path.relative(repoRoot, filePath);
    if (
      relPath.startsWith('..') ||
      path.isAbsolute(relPath) ||
      hasDotfileSegment(relPath)
    ) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      const normRoot = repoRoot.replace(/\\/g, '/');
      const fallbackRoot = normRoot.includes('/.kilo/worktrees/')
        ? path.resolve(repoRoot, '../../..')
        : normRoot.includes('/.worktrees/')
          ? path.resolve(repoRoot, '../..')
          : null;
      if (fallbackRoot) {
        let fallbackPath = path.resolve(fallbackRoot, relUrlPath);
        const fallbackRel = path.relative(fallbackRoot, fallbackPath);
        if (
          !fallbackRel.startsWith('..') &&
          !path.isAbsolute(fallbackRel) &&
          !hasDotfileSegment(fallbackRel)
        ) {
          if (fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isDirectory()) {
            fallbackPath = path.join(fallbackPath, 'index.html');
          }
          if (fs.existsSync(fallbackPath)) {
            filePath = fallbackPath;
          }
        }
      }
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Haru-Coop': '1',
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });

  server.on('upgrade', (req, socket, head) => {
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const wsMatch = parsedUrl.pathname.match(
      /^\/api\/room\/([A-Za-z0-9_-]{1,48})\/websocket\/?$/i
    );
    const secKey = req.headers['sec-websocket-key'];

    if (!wsMatch || !secKey) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const roomCode = normalizeRoomCode(wsMatch[1]);
    const acceptKey = createHash('sha1')
      .update(String(secKey).trim() + WS_GUID)
      .digest('base64');

    socket.setNoDelay(true);
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        'X-Haru-Coop: 1',
        '\r\n',
      ].join('\r\n')
    );

    const preferredRole =
      parsedUrl.searchParams.get('preferredRole') || parsedUrl.searchParams.get('role');
    roomManager.addClient(roomCode, socket, head, { preferredRole });
  });

  return server;
}

export async function startServer(port = 0, host = '127.0.0.1') {
  const srv = createWorldServer();
  await new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(port, host, resolve);
  });
  const address = srv.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    server: srv,
    port: actualPort,
    url: `http://${host}:${actualPort}/world/index.html`,
  };
}

export const server = createWorldServer();

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  server.listen(defaultPort, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${defaultPort}/world/index.html`;
    console.log(
      `Haru-machi 3D World + Co-Op WebSocket + Commune Server (${geminiKeys.length} Gemini keys) listening on ${url}`
    );
    if (process.argv.includes('--open')) {
      exec(`start "" "${url}"`);
    }
  });
}
