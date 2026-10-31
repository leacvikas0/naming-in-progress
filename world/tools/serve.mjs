// ============================================================================
// world/tools/serve.mjs
//
// Zero-dependency HTTP Static Server + RFC 6455 WebSocket Co-Op Room Server
// for Haru-machi (Stage 5). Uses Node's built-in `node:http` and `node:crypto`
// with `< 1ms` packet relay and identical JSON room protocol to `worker/room-do.js`.
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { exec } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { enrichSpellCastPacket } from '../../worker/room-do.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const defaultPort = Number(process.env.PORT || 4173);
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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

function normalizeRoomCode(raw) {
  const cleaned = String(raw || 'LOVE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return cleaned || 'LOVE';
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
  const rooms = new Map(); // roomCode -> { code, players: Map<clientId, player> }
  let nextSeq = 1;

  function getOrCreateRoom(code) {
    const norm = normalizeRoomCode(code);
    let room = rooms.get(norm);
    if (!room) {
      room = { code: norm, players: new Map() };
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

  function broadcastRoomState(room) {
    const playersList = Array.from(room.players.values()).map((p) => ({
      clientId: p.clientId,
      role: p.role,
      isHost: p.isHost,
      device: p.device,
    }));

    for (const player of room.players.values()) {
      const peer = getPeer(room, player.clientId);
      sendJson(player.socket, {
        type: 'room_state',
        room: room.code,
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

  function addClient(roomCode, socket, head, initialOpts = {}) {
    const room = getOrCreateRoom(roomCode);

    // If room already has 2 players, replace the non-host (or oldest) slot
    if (room.players.size >= 2) {
      const victim =
        Array.from(room.players.values()).find((p) => !p.isHost) ||
        Array.from(room.players.values())[0];
      if (victim) {
        room.players.delete(victim.clientId);
        try {
          victim.socket.end(encodeWsFrame(Buffer.alloc(0), 0x88));
        } catch {
          // ignore
        }
      }
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
      device: initialOpts.device || (isHost ? 'Desktop' : 'Tablet'),
    };
    room.players.set(clientId, player);

    const decoder = attachWsDecoder(socket, {
      onTextMessage: (rawText) => handleMessage(room, player, rawText),
      onClose: () => {
        if (!room.players.has(clientId)) return;
        room.players.delete(clientId);
        const remaining = Array.from(room.players.values());
        if (remaining.length === 0) {
          rooms.delete(room.code);
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
            ...msg,
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
          device: p.device,
        }))
      : [];
    return {
      ok: true,
      room: norm,
      playerCount: players.length,
      players,
    };
  }

  return { addClient, getRoomStatus, rooms };
}

/* ------------------------------------------------------------------------- */
/* HTTP + WebSocket Upgrade Server Factory                                   */
/* ------------------------------------------------------------------------- */

export function createWorldServer() {
  const roomManager = createRoomManager();

  const server = http.createServer((req, res) => {
    const rawUrl = req.url || '/';
    const [rawPath] = rawUrl.split('?');
    const urlPath = decodeURIComponent(rawPath);

    res.setHeader('X-Haru-Coop', '1');

    if (urlPath === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Room status JSON endpoint (`/api/room/:code/status`)
    const statusMatch = urlPath.match(/^\/api\/room\/([A-Za-z0-9_-]{1,16})\/status\/?$/i);
    if (statusMatch) {
      const status = roomManager.getRoomStatus(statusMatch[1]);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(status));
      return;
    }

    let filePath = path.join(repoRoot, urlPath === '/' ? 'world/index.html' : urlPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
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
      /^\/api\/room\/([A-Za-z0-9_-]{1,16})\/websocket\/?$/i
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
    console.log(`Haru-machi 3D World + Co-Op WebSocket server listening on ${url}`);
    if (process.argv.includes('--open')) {
      exec(`start "" "${url}"`);
    }
  });
}
