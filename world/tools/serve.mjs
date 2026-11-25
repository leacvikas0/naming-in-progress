// ============================================================================
// world/tools/serve.mjs
//
// Zero-dependency HTTP Static Server + RFC 6455 WebSocket Co-Op Room Server
// + Secret-Safe 3-Stone Scripture Catalog (`/api/altar`) & Context-Aware
// Commune Judge (`/api/commune`) for Haru-machi (Stage 5 / Wave 3 & 4).
//
// Protocol Parity with `worker/room-do.js` & `worker/index.js`:
// - Strict 2-Seat Cap (`room_full` rejection with 1008 close on 3rd visitor,
//   never evicting seated players)
// - Mutual Ready Gate (`ready: false`, `claimed: false` on initial join for
//   both Host and Guest; `lobby_claim` name/role sync & collision resolution)
// - `element_toggle`, `aim_state`, `full_snapshot`, `snapshot_request`,
//   `rtc_signal` peer-only relay, and `0x02` binary frame passthrough
// - 15-minute empty-room grace TTL so brief Wi-Fi drops/refreshes never wipe
//   room progression
// - Sequential & Out-of-Order 3-Stone `progression_update` synchronization
// - Single active Commune ceremony lock (`activeCommuneSpeaker` / `commune_busy`)
// - Partner Audio & Transcript Privacy (never relays raw audio or transcript)
// - Static File Dotfile & Sensitive Path Boundary (`403 Forbidden` on `/.env`,
//   `/.git`, `/.dev.vars`, `/worker/`, `/sfx-foley/`, etc.)
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { exec, execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  enrichSpellCastPacket,
  sanitizePartnerCommunePacket,
} from '../../worker/room-do.js';
import { getScriptureForStage } from '../../worker/scripture-catalog.js';
import {
  GEMINI_MODEL,
  GEMINI_MODEL_FALLBACKS,
  GEMINI_HEDGE_TIMEOUT_MS,
  GEMINI_HARD_TIMEOUT_MS,
  callSingleGeminiKey,
  evaluateCommunePrayer,
  buildGentleAudioRetryVerdict,
} from '../../worker/commune-judge.js';
import {
  normalizeRoomPhraseToCode,
  formatRoomCodeToPhrase,
  createRoomProgressionState,
} from '../src/net/room-progression.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const defaultPort = Number(process.env.PORT || 4173);
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;

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
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const BLOCKED_PATH_PREFIXES = [
  '/worker/',
  '/sfx-foley/',
  '/docs/',
  '/scripts/',
  '/qa-review/',
  '/_archive/',
  '/android-twa/',
];

const BLOCKED_EXACT_PATHS = new Set([
  '/worker',
  '/sfx-foley',
  '/docs',
  '/scripts',
  '/qa-review',
  '/_archive',
  '/android-twa',
  '/package.json',
  '/package-lock.json',
  '/wrangler.toml',
  '/.dev.vars',
  '/.env',
  '/.assetsignore',
  '/.gitignore',
]);

/* ------------------------------------------------------------------------- */
/* .env / .dev.vars Loader & 4-Key Round-Robin Gemini Pool                   */
/* ------------------------------------------------------------------------- */

export function loadDotEnv(envPath = path.join(repoRoot, '.env')) {
  const parsed = {};
  const files = [path.join(repoRoot, '.dev.vars'), envPath];
  for (const fp of files) {
    if (!fs.existsSync(fp)) continue;
    const raw = fs.readFileSync(fp, 'utf8');
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

function isBlockedServerPath(urlPath) {
  const normalized = String(urlPath || '/').replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  if (hasDotfileSegment(normalized)) return true;
  if (BLOCKED_EXACT_PATHS.has(lower)) return true;
  if (BLOCKED_PATH_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  if (/^\/package(-lock)?\.json$/i.test(lower)) return true;
  return false;
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

async function callGeminiWithRotation(requestBody) {
  if (geminiKeys.length === 0) {
    throw new Error('No Gemini API keys configured in environment');
  }

  const attemptedModels = new Set();
  let lastError = null;

  for (let i = 0; i < GEMINI_MODEL_FALLBACKS.length; i++) {
    const primaryModel = GEMINI_MODEL_FALLBACKS[i];
    if (!primaryModel || attemptedModels.has(primaryModel)) continue;
    attemptedModels.add(primaryModel);

    const apiKey = nextGeminiKey();
    if (!apiKey) {
      throw new Error('No Gemini API keys configured in environment');
    }

    const nextFallbackModel =
      GEMINI_MODEL_FALLBACKS.find((m) => m && !attemptedModels.has(m)) || null;

    try {
      const primaryPromise = callSingleGeminiKey(
        apiKey,
        requestBody,
        GEMINI_HARD_TIMEOUT_MS,
        fetch,
        primaryModel
      );
      const hedgedResult = await new Promise((resolve, reject) => {
        let settled = false;
        let backupInFlight = false;
        let primaryErr = null;

        const hedgeTimer = setTimeout(() => {
          if (settled || !nextFallbackModel || attemptedModels.has(nextFallbackModel)) return;
          const backupKey = nextGeminiKey();
          if (!backupKey) return;
          attemptedModels.add(nextFallbackModel);
          backupInFlight = true;
          callSingleGeminiKey(
            backupKey,
            requestBody,
            Math.max(4000, GEMINI_HARD_TIMEOUT_MS - GEMINI_HEDGE_TIMEOUT_MS),
            fetch,
            nextFallbackModel
          ).then(
            (res) => {
              if (!settled) {
                settled = true;
                resolve(res);
              }
            },
            (bErr) => {
              backupInFlight = false;
              if (!settled && primaryErr) {
                settled = true;
                reject(bErr || primaryErr);
              }
            }
          );
        }, GEMINI_HEDGE_TIMEOUT_MS);

        primaryPromise.then(
          (res) => {
            if (!settled) {
              settled = true;
              clearTimeout(hedgeTimer);
              resolve(res);
            }
          },
          (err) => {
            primaryErr = err;
            clearTimeout(hedgeTimer);
            if (!settled && !backupInFlight) {
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

  throw lastError || new Error('All Gemini models and API keys failed');
}

/* ------------------------------------------------------------------------- */
/* RFC 6455 WebSocket Frame Encoder & Streaming Decoder (Text + Binary 0x02) */
/* ------------------------------------------------------------------------- */

export function encodeWsFrame(payload, opcode = 0x81) {
  const data = Buffer.isBuffer(payload)
    ? payload
    : payload instanceof ArrayBuffer
      ? Buffer.from(payload)
      : ArrayBuffer.isView(payload)
        ? Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength)
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

function attachWsDecoder(socket, { onTextMessage, onBinaryMessage, onClose }) {
  let buffer = Buffer.alloc(0);
  let fragments = [];
  let currentOpcode = 0x01;
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
          try {
            socket.write(encodeWsFrame(Buffer.alloc(0), 0x88));
            socket.end();
          } catch {
            // ignore
          }
        }
        setTimeout(() => {
          if (!socket.destroyed) socket.destroy();
        }, 20).unref?.();
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

      // Data frames (Text = 0x01, Binary = 0x02, Continuation = 0x00)
      if (opcode === 0x01 || opcode === 0x02 || opcode === 0x00) {
        if (opcode !== 0x00) {
          currentOpcode = opcode;
        }
        fragments.push(payload);
        if (fin) {
          const fullBuf = fragments.length === 1 ? fragments[0] : Buffer.concat(fragments);
          const msgOpcode = currentOpcode;
          fragments = [];
          currentOpcode = 0x01;
          if (msgOpcode === 0x02) {
            onBinaryMessage?.(fullBuf);
          } else {
            onTextMessage?.(fullBuf.toString('utf8'));
          }
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
/* In-Memory Co-Op Room Manager (15-min Empty Room Grace TTL)                */
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
        cleanupTimer: null,
      };
      rooms.set(norm, room);
    } else if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
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

  function sendBinary(socket, buf) {
    if (!socket || socket.destroyed || !socket.writable) return;
    try {
      socket.write(encodeWsFrame(buf, 0x82));
    } catch {
      // ignore write error on closing socket
    }
  }

  function getPlayersList(room) {
    return Array.from(room.players.values()).map((p) => ({
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
    const playersList = getPlayersList(room);
    const progState = room.progression.getState();

    for (const player of room.players.values()) {
      const peer = getPeer(room, player.clientId);
      sendJson(player.socket, {
        type: 'room_state',
        room: room.code,
        roomPhrase: room.roomPhrase,
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
        isFull: room.players.size >= 2,
        expeditionStarted: room.expeditionStarted,
        progression: progState,
        activeCommuneSpeaker: room.activeCommuneSpeaker,
        players: playersList,
        timestamp: Date.now(),
      });
    }
  }

  function applyCommuneVerdictToRoom(
    roomCode,
    judgment = {},
    speakerRole = 'Knight',
    partnerRole = 'Mage',
    startedAt = Date.now()
  ) {
    const room = getOrCreateRoom(roomCode);
    if (judgment.incrementSpam !== false && judgment.spamCount !== undefined) {
      room.spamCount = Number(judgment.spamCount ?? 0);
    }
    room.activeCommuneSpeaker = null;
    const updatedProgression = room.progression.applyVerdictProgression(judgment);

    const sanitizedJudgment = sanitizePartnerCommunePacket(judgment);
    const packet = {
      type: 'commune_verdict',
      ok: true,
      room: room.code,
      speakerRole,
      partnerRole,
      progression: updatedProgression,
      spamCount: room.spamCount,
      judgment: sanitizedJudgment,
      ...sanitizedJudgment,
      latencyMs: Math.max(0, Date.now() - startedAt),
      timestamp: Date.now(),
    };

    broadcastToRoom(room.code, packet);
    if (judgment.verdict === 'awakening' || judgment.awakenedStage) {
      broadcastToRoom(room.code, {
        type: 'progression_update',
        room: room.code,
        progression: updatedProgression,
        fromRole: speakerRole,
        timestamp: Date.now(),
      });
      broadcastRoomState(room);
    }
    return packet;
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
      setTimeout(() => {
        if (!socket.destroyed) socket.destroy();
      }, 30).unref?.();
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

    // Default `ready: false` and `claimed: false` for BOTH Host and Guest on initial join!
    const player = {
      clientId,
      socket,
      role,
      isHost,
      ready: false,
      claimed: false,
      playerName: initialOpts.playerName ? String(initialOpts.playerName).trim().slice(0, 32) : '',
      element: 'ice',
      device: initialOpts.device || (isHost ? 'Desktop' : 'Tablet'),
    };
    room.players.set(clientId, player);

    const decoder = attachWsDecoder(socket, {
      onTextMessage: (rawText) => handleMessage(room, player, rawText),
      onBinaryMessage: (binBuf) => {
        const peer = getPeer(room, player.clientId);
        if (peer) {
          sendBinary(peer.socket, binBuf);
        }
      },
      onClose: () => {
        if (!room.players.has(clientId)) return;
        room.players.delete(clientId);
        if (room.activeCommuneSpeaker?.clientId === clientId) {
          room.activeCommuneSpeaker = null;
        }
        const remaining = Array.from(room.players.values());
        if (remaining.length === 0) {
          if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
          room.cleanupTimer = setTimeout(() => {
            if (room.players.size === 0) {
              rooms.delete(room.code);
            }
          }, EMPTY_ROOM_TTL_MS);
          room.cleanupTimer.unref?.();
          return;
        }
        if (!remaining.some((p) => p.isHost)) {
          remaining[0].isHost = true;
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
          const peer = getPeer(room, player.clientId);
          if (!peer || peer.role !== pref) {
            player.role = pref;
          } else if (!peer.claimed && !peer.ready) {
            player.role = pref;
            peer.role = pref === 'Knight' ? 'Mage' : 'Knight';
          }
        }
        broadcastRoomState(room);
        break;
      }

      case 'lobby_claim': {
        if (typeof msg.playerName === 'string') {
          player.playerName = msg.playerName.trim().slice(0, 32);
        }
        const requestedRole =
          msg.role === 'Mage' || msg.role === 'Knight' ? msg.role : null;
        if (requestedRole) {
          const peer = getPeer(room, player.clientId);
          if (!peer) {
            player.role = requestedRole;
          } else if (peer.role === requestedRole) {
            if (!peer.claimed && !peer.ready) {
              player.role = requestedRole;
              peer.role = requestedRole === 'Knight' ? 'Mage' : 'Knight';
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
        broadcastToRoom(room.code, {
          type: 'lobby_claim',
          room: room.code,
          clientId: player.clientId,
          role: player.role,
          playerName: player.playerName,
          claimed: Boolean(player.claimed),
          ready: Boolean(player.ready),
          players: getPlayersList(room),
          timestamp: Date.now(),
        });
        broadcastRoomState(room);
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
        broadcastToRoom(room.code, {
          type: 'player_ready',
          room: room.code,
          clientId: player.clientId,
          role: player.role,
          playerName: player.playerName,
          ready: player.ready,
          claimed: player.claimed,
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
        if (peer && !peer.ready && !peer.claimed && !msg.force) {
          sendJson(player.socket, {
            type: 'expedition_error',
            ok: false,
            error: 'guest_not_ready',
          });
          break;
        }
        player.ready = true;
        player.claimed = true;
        room.expeditionStarted = true;
        room.expeditionStartedAt = Date.now();
        if (msg.resetProgression) {
          room.progression = createRoomProgressionState();
        }
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

      case 'element_toggle': {
        const nextEl = msg.element === 'fire' ? 'fire' : 'ice';
        player.element = nextEl;
        const peer = getPeer(room, player.clientId);
        if (peer) {
          sendJson(peer.socket, {
            ...msg,
            type: 'element_toggle',
            role: msg.role || player.role,
            element: nextEl,
            fromClientId: player.clientId,
            fromRole: player.role,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'aim_state': {
        const peer = getPeer(room, player.clientId);
        if (peer) {
          sendJson(peer.socket, {
            ...msg,
            type: 'aim_state',
            role: msg.role || player.role,
            fromClientId: player.clientId,
            fromRole: player.role,
            timestamp: msg.timestamp || Date.now(),
          });
        }
        break;
      }

      case 'snapshot_request':
      case 'request_full_snapshot': {
        const peer = getPeer(room, player.clientId);
        if (peer) {
          sendJson(peer.socket, {
            ...msg,
            type: 'snapshot_request',
            fromClientId: player.clientId,
            fromRole: player.role,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'full_snapshot': {
        if (msg.progression) {
          room.progression.syncFromRemote(msg.progression);
        }
        const peer = getPeer(room, player.clientId);
        if (peer) {
          sendJson(peer.socket, {
            ...msg,
            type: 'full_snapshot',
            progression: room.progression.getState(),
            fromClientId: player.clientId,
            fromRole: player.role,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'rtc_signal': {
        const peer = getPeer(room, player.clientId);
        if (peer) {
          sendJson(peer.socket, {
            ...msg,
            type: 'rtc_signal',
            fromClientId: player.clientId,
            fromRole: player.role,
            timestamp: Date.now(),
          });
        }
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
    const players = room ? getPlayersList(room) : [];
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
      spamCount: room?.spamCount || 0,
      players,
    };
  }

  return {
    addClient,
    getOrCreateRoom,
    getRoomStatus,
    broadcastToRoom,
    broadcastRoomState,
    applyCommuneVerdictToRoom,
    rooms,
  };
}

/* ------------------------------------------------------------------------- */
/* Live Mobile Phone Ground-Truth Telemetry Store (`/api/mobile-telemetry`)  */
/* ------------------------------------------------------------------------- */

const MAX_MOBILE_TELEMETRY_HISTORY = 50;
const latestMobileTelemetryPath = path.join(
  repoRoot,
  'world',
  'shots',
  'latest-mobile-telemetry.json'
);
export const mobileTelemetryHistory = [];

/* ------------------------------------------------------------------------- */
/* HTTP + WebSocket Upgrade Server Factory                                   */
/* ------------------------------------------------------------------------- */

export function createWorldServer({ prewarmGemini = false } = {}) {
  const roomManager = createRoomManager();
  const upgradedSockets = new Set();

  // Pre-warm TLS keep-alive socket pool only when explicitly requested by standalone server
  if (
    prewarmGemini &&
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

    // Static File Dotfile & Sensitive Path Boundary
    if (isBlockedServerPath(urlPath)) {
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

        const packet = roomManager.applyCommuneVerdictToRoom(
          roomCode,
          judgment,
          speakerRole,
          partnerRole,
          startedAt
        );

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(packet));
      } catch (err) {
        const retryVerdict = buildGentleAudioRetryVerdict({});
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            type: 'commune_verdict',
            ok: true,
            ...retryVerdict,
            judgment: retryVerdict,
            error: String(err?.message || err),
            latencyMs: Date.now() - startedAt,
            timestamp: Date.now(),
          })
        );
      }
      return;
    }

    // 2B. Internal Commune Apply endpoint (`/api/room/:code/internal/commune-apply` or `/internal/commune-apply`)
    const applyMatch = urlPath.match(
      /^\/(?:api\/room\/([A-Za-z0-9_-]{1,48})\/)?(?:internal\/)?commune-apply\/?$/i
    );
    if (applyMatch && req.method === 'POST') {
      const body = await readJsonBody(req).catch(() => ({}));
      const roomCode = normalizeRoomCode(applyMatch[1] || body.room || 'LOVE');
      const speakerRole = body.speakerRole === 'Mage' ? 'Mage' : 'Knight';
      const partnerRole =
        body.partnerRole || (speakerRole === 'Knight' ? 'Mage' : 'Knight');
      const packet = roomManager.applyCommuneVerdictToRoom(
        roomCode,
        body.judgment || body,
        speakerRole,
        partnerRole
      );
      const room = roomManager.getOrCreateRoom(roomCode);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          room: roomCode,
          progression: room.progression.getState(),
          spamCount: room.spamCount,
          packet,
        })
      );
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

    // 3B. Live Mobile Phone Telemetry (`GET /api/mobile-telemetry` & `POST /api/mobile-telemetry`)
    if (urlPath === '/api/mobile-telemetry' || urlPath === '/api/mobile-telemetry/') {
      if (req.method === 'GET') {
        const latest =
          mobileTelemetryHistory.length > 0
            ? mobileTelemetryHistory[mobileTelemetryHistory.length - 1]
            : null;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            ok: true,
            count: mobileTelemetryHistory.length,
            latest,
            history: mobileTelemetryHistory,
          })
        );
        return;
      }

      if (req.method === 'POST') {
        try {
          const body = await readJsonBody(req, 1024 * 1024);
          const snapshot = {
            ...(body && typeof body === 'object' ? body : {}),
            timestamp: Number(body?.timestamp) || Date.now(),
            receivedAt: new Date().toISOString(),
          };
          mobileTelemetryHistory.push(snapshot);
          if (mobileTelemetryHistory.length > MAX_MOBILE_TELEMETRY_HISTORY) {
            mobileTelemetryHistory.splice(
              0,
              mobileTelemetryHistory.length - MAX_MOBILE_TELEMETRY_HISTORY
            );
          }
          try {
            fs.mkdirSync(path.dirname(latestMobileTelemetryPath), { recursive: true });
            fs.writeFileSync(
              latestMobileTelemetryPath,
              JSON.stringify(snapshot, null, 2),
              'utf8'
            );
          } catch {
            // Non-fatal if shots directory is read-only
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              ok: true,
              count: mobileTelemetryHistory.length,
              latest: snapshot,
              history: mobileTelemetryHistory,
            })
          );
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              ok: false,
              error: String(err?.message || err),
            })
          );
        }
        return;
      }
    }

    // 4. Static file serving (redirect bare `/` or `/world` to `/world/index.html` so `./src/main.js` & `../node_modules/*` resolve cleanly)
    if (urlPath === '/' || urlPath === '/index.html' || urlPath === '/world' || urlPath === '/world/') {
      const targetLocation = `/world/index.html${parsedUrl.search || ''}`;
      res.writeHead(302, {
        Location: targetLocation,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      res.end();
      return;
    }

    const relUrlPath = urlPath.replace(/^\/+/, '');
    let filePath = path.resolve(repoRoot, relUrlPath);
    if (!fs.existsSync(filePath) && !relUrlPath.startsWith('world/')) {
      const worldSubPath = path.resolve(repoRoot, 'world', relUrlPath);
      if (fs.existsSync(worldSubPath)) {
        filePath = worldSubPath;
      }
    }
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
          : normRoot.includes('/.gemini/antigravity/worktrees/')
            ? 'C:/Users/silen/projects/kilo-3d-kit'
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
    const stat = fs.statSync(filePath);
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const isImmutableVendorOrModel =
      relUrlPath.startsWith('node_modules/') ||
      relUrlPath.startsWith('library/') ||
      ext === '.glb' ||
      ext === '.png' ||
      ext === '.jpg' ||
      ext === '.webp' ||
      ext === '.wav' ||
      ext === '.mp3';
    const cacheHeader = isImmutableVendorOrModel
      ? 'public, max-age=86400, stale-while-revalidate=604800'
      : 'no-cache';

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        ETag: etag,
        'Cache-Control': cacheHeader,
        'X-Haru-Coop': '1',
      });
      res.end();
      return;
    }

    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    const compressible =
      ext === '.js' ||
      ext === '.mjs' ||
      ext === '.html' ||
      ext === '.css' ||
      ext === '.json' ||
      ext === '.glb' ||
      ext === '.gltf' ||
      ext === '.svg';

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': cacheHeader,
        ETag: etag,
        'X-Haru-Coop': '1',
      });
      res.end();
      return;
    }

    if (compressible && acceptEncoding.includes('gzip') && stat.size >= 1024 && stat.size <= 16 * 1024 * 1024) {
      if (!globalThis.__HARU_GZIP_CACHE__) {
        globalThis.__HARU_GZIP_CACHE__ = new Map();
      }
      const cacheKey = `${filePath}:${Math.floor(stat.mtimeMs)}:${stat.size}`;
      let gzBuf = globalThis.__HARU_GZIP_CACHE__.get(cacheKey);
      if (!gzBuf) {
        const rawBuf = fs.readFileSync(filePath);
        gzBuf = zlib.gzipSync(rawBuf, { level: 6 });
        if (globalThis.__HARU_GZIP_CACHE__.size > 160) {
          const firstKey = globalThis.__HARU_GZIP_CACHE__.keys().next().value;
          globalThis.__HARU_GZIP_CACHE__.delete(firstKey);
        }
        globalThis.__HARU_GZIP_CACHE__.set(cacheKey, gzBuf);
      }
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Encoding': 'gzip',
        'Content-Length': gzBuf.length,
        Vary: 'Accept-Encoding',
        'Cache-Control': cacheHeader,
        ETag: etag,
        'X-Haru-Coop': '1',
      });
      res.end(gzBuf);
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cacheHeader,
      ETag: etag,
      'X-Haru-Coop': '1',
    });

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
    upgradedSockets.add(socket);
    socket.on('close', () => upgradedSockets.delete(socket));
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
    const playerName = parsedUrl.searchParams.get('playerName') || '';
    roomManager.addClient(roomCode, socket, head, { preferredRole, playerName });
  });

  server.on('close', () => {
    for (const sock of upgradedSockets) {
      try {
        sock.destroy();
      } catch {
        // ignore
      }
    }
    upgradedSockets.clear();
    for (const room of roomManager.rooms.values()) {
      if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    }
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
