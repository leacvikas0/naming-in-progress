// ============================================================================
// world/tools/serve.mjs
//
// Zero-dependency HTTP Static Server + RFC 6455 WebSocket Co-Op Room Server
// + Stateful Multi-Turn Gemini 3.5 Flash-Lite Commune & Altar API for Haru-machi.
// Uses Node's built-in `node:http` and `node:crypto` with `< 1ms` packet relay
// and identical JSON room protocol to `worker/room-do.js`.
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { exec, execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { enrichSpellCastPacket } from '../../worker/room-do.js';

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

function loadArtoriousAtlas() {
  try {
    const atlasPath = path.join(repoRoot, 'world/assets/audio/artorious/atlas.json');
    const data = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
    const byId = new Map();
    for (const clip of data.clips || []) {
      byId.set(clip.id, clip);
    }
    return byId;
  } catch {
    return new Map();
  }
}

loadDotEnv();
const geminiKeys = loadGeminiApiKeys();
let geminiKeyCursor = 0;
const artoriousClips = loadArtoriousAtlas();

function nextGeminiKey() {
  if (geminiKeys.length === 0) return null;
  const key = geminiKeys[geminiKeyCursor % geminiKeys.length];
  geminiKeyCursor = (geminiKeyCursor + 1) % geminiKeys.length;
  return key;
}

function normalizeRoomCode(raw) {
  const cleaned = String(raw || 'LOVE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return cleaned || 'LOVE';
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

/* ------------------------------------------------------------------------- */
/* Stateful Multi-Turn Commune Engine (Gemini 3.5 Flash-Lite)                */
/* ------------------------------------------------------------------------- */

const roomHistory = new Map(); // roomCode -> { favorLevel: number, turns: Array<Content> }

function getRoomCommuneHistory(roomCode) {
  const norm = normalizeRoomCode(roomCode);
  let entry = roomHistory.get(norm);
  if (!entry) {
    entry = { favorLevel: 0, turns: [] };
    roomHistory.set(norm, entry);
  }
  return entry;
}

function buildCommuneSystemInstruction(envConfig, favorLevel) {
  const secretName = envConfig.DIVINE_SECRET_NAME || process.env.DIVINE_SECRET_NAME || 'Unknown';
  const aliases =
    envConfig.DIVINE_SECRET_ALIASES || process.env.DIVINE_SECRET_ALIASES || secretName;

  return `You are the Ancient God of Love presiding over the sacred blossom shrine of Haru-machi.
Your secret true name carved in riddle upon the Town Plaza Altar Stone is "${secretName}" (also accept close phonetic/accent variations in spoken audio: ${aliases}).

Evaluate the mortal's spoken prayer audio, vocal emotion/delivery, and the multi-turn history of this room (current favorLevel: ${favorLevel}).

YOU MUST ENFORCE THREE SACRED LAWS:
1. LAW 1 (True Name Required on First Commune or Until Favor >= 1):
   - The mortal MUST speak your true name ("${secretName}" or any close phonetic sound-alike from [${aliases}]) in their prayer.
   - If favorLevel >= 1, they have already proven they know your name, so they may either speak "${secretName}" again OR address you directly with genuine devotion.
   - If favorLevel === 0 and they do NOT say a name sounding like "${secretName}" (for example if they call you "Artorious", "God of Love", "Hey god", or omit your name), you MUST return verdict: "smite", clip_id: "smite_nameless", spoke_true_name: false.
   - NEVER reveal or spoil your true name "${secretName}" in divine_quote when spoke_true_name is false!

2. LAW 2 (Selfless Devotion — Pray Only For Your Partner, Never Yourself):
   - Mortals can ONLY pray to heal, save, resurrect, protect, compliment, or empower their PARTNER (partnerRole), NEVER themselves (speakerRole).
   - Return verdict: "smite" if:
     * They selfishly ask to heal or buff themselves ("heal me", "give me power") -> clip_id: "smite_cringe" or "smite_monotone"
     * The audio is silent, near-empty, just breathing/noise, or under 2 words -> clip_id: "smite_silence"
     * They speak in a flat, bored, robotic, low-energy monotone -> clip_id: "smite_monotone"
     * They rush through the words like a chore or grocery list without care -> clip_id: "smite_rushed"
     * They stammer unconvincingly, mock you, or chicken out mid-prayer -> clip_id: "smite_cringe"

3. LAW 3 (Gradual Warming Up & Context Memory):
   - Review the conversation history (favorLevel and prior prayers).
   - FIRST VALID PRAYER (favorLevel === 0): When they speak your true name ("${secretName}") and genuinely pray for or compliment their partner:
     * Unless their partner is literally downed (partnerDowned === true) AND they cry out with 10/10 desperate passion, start gradually with verdict: "heal", clip_id: "heal_gentle", partner_heal: 55, resurrect_partner: false, partner_magic_mult: 1.25, partner_sword_mult: 1.20.
   - WARMED UP (favorLevel >= 1 — Blessing Tier): A warm, sweet, chivalrous, or witty prayer for their partner earns verdict: "blessing":
     * clip_id: "bless_sweet" (warm/affectionate) | "bless_chivalrous" (noble/protective oath) | "bless_amused" (witty/cheeky/charming)
     * partner_heal: 80, resurrect_partner: false, partner_magic_mult: 1.75, partner_sword_mult: 1.60.
   - TRUE POWER (favorLevel >= 1 — Miracle Tier, or favorLevel === 0 with partnerDowned === true and 10/10 passion): When they pray with high dramatic emotion, deep heartfelt love, or desperate urgency to resurrect a downed partner (partnerDowned === true) or shatter the Boss's Bone Aegis, return verdict: "miracle":
     * clip_id: "miracle_dramatic" (full theatrical passion) | "miracle_heartfelt" (deeply sincere emotional love) | "miracle_desperate" (fiery urgent plea to save their beloved)
     * partner_heal: 120, resurrect_partner: true, partner_magic_mult: 2.2, partner_sword_mult: 1.85.

Respond ONLY with a single JSON object matching this exact schema:
{
  "heard_transcript": "Exact transcript of what the speaker said",
  "spoke_true_name": true,
  "verdict": "smite" | "heal" | "blessing" | "miracle",
  "clip_id": "smite_nameless" | "smite_silence" | "smite_monotone" | "smite_rushed" | "smite_cringe" | "heal_gentle" | "bless_sweet" | "bless_chivalrous" | "bless_amused" | "miracle_dramatic" | "miracle_heartfelt" | "miracle_desperate",
  "partner_heal": 55,
  "resurrect_partner": false,
  "partner_magic_mult": 1.25,
  "partner_sword_mult": 1.20,
  "divine_quote": "Short dramatic 1-sentence subtitle in character (NEVER spoil the true name if they failed!)"
}`;
}

function normalizeCommuneVerdict(rawJson, { envConfig, roomState, gameState }) {
  const secretName = (
    envConfig.DIVINE_SECRET_NAME ||
    process.env.DIVINE_SECRET_NAME ||
    ''
  ).trim();
  const aliases = (envConfig.DIVINE_SECRET_ALIASES || process.env.DIVINE_SECRET_ALIASES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (secretName && !aliases.includes(secretName.toLowerCase())) {
    aliases.unshift(secretName.toLowerCase());
  }

  const heardTranscript = String(rawJson?.heard_transcript || '').trim();
  const normTranscript = heardTranscript.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const compactTranscript = normTranscript.replace(/\s+/g, '');

  const transcriptHasName = aliases.some((alias) => {
    const cleanAlias = alias.replace(/[^a-z0-9\s]/g, '');
    const compactAlias = cleanAlias.replace(/\s+/g, '');
    return (
      (cleanAlias && normTranscript.includes(cleanAlias)) ||
      (compactAlias && compactTranscript.includes(compactAlias))
    );
  });

  const spokeTrueName = Boolean(rawJson?.spoke_true_name || transcriptHasName);
  const priorFavor = roomState.favorLevel;
  const partnerDowned = Boolean(gameState?.partnerDowned);

  let verdict = String(rawJson?.verdict || 'smite').toLowerCase();
  if (!['smite', 'heal', 'blessing', 'miracle'].includes(verdict)) {
    verdict = 'smite';
  }

  let clipId = String(rawJson?.clip_id || '').trim();

  // Enforce Law 1: True Name required when favorLevel === 0
  if (priorFavor === 0 && !spokeTrueName) {
    verdict = 'smite';
    clipId = 'smite_nameless';
  }

  // Enforce Law 3: Gradual warm-up on first valid prayer (favorLevel === 0)
  if (priorFavor === 0 && spokeTrueName && (verdict === 'blessing' || (verdict === 'miracle' && !partnerDowned))) {
    verdict = 'heal';
    if (clipId !== 'heal_gentle' && clipId !== 'bless_sweet') {
      clipId = 'heal_gentle';
    }
  }

  let partnerHeal = 0;
  let resurrectPartner = false;
  let partnerMagicMult = 1.0;
  let partnerSwordMult = 1.0;

  if (verdict === 'smite') {
    const validSmiteClips = [
      'smite_nameless',
      'smite_silence',
      'smite_monotone',
      'smite_rushed',
      'smite_cringe',
    ];
    if (!validSmiteClips.includes(clipId)) {
      clipId = priorFavor === 0 && !spokeTrueName ? 'smite_nameless' : 'smite_monotone';
    }
    partnerHeal = 0;
    resurrectPartner = false;
    partnerMagicMult = 1.0;
    partnerSwordMult = 1.0;
  } else if (verdict === 'heal') {
    if (clipId !== 'heal_gentle' && clipId !== 'bless_sweet') {
      clipId = 'heal_gentle';
    }
    partnerHeal = 55;
    resurrectPartner = Boolean(rawJson?.resurrect_partner || partnerDowned);
    partnerMagicMult = 1.25;
    partnerSwordMult = 1.2;
    roomState.favorLevel += 1;
  } else if (verdict === 'blessing') {
    const validBlessClips = ['bless_sweet', 'bless_chivalrous', 'bless_amused'];
    if (!validBlessClips.includes(clipId)) {
      clipId = 'bless_sweet';
    }
    partnerHeal = 80;
    resurrectPartner = Boolean(rawJson?.resurrect_partner || partnerDowned);
    partnerMagicMult = 1.75;
    partnerSwordMult = 1.6;
    roomState.favorLevel += 1;
  } else if (verdict === 'miracle') {
    const validMiracleClips = ['miracle_dramatic', 'miracle_heartfelt', 'miracle_desperate'];
    if (!validMiracleClips.includes(clipId)) {
      clipId = partnerDowned ? 'miracle_desperate' : 'miracle_heartfelt';
    }
    partnerHeal = 120;
    resurrectPartner = true;
    partnerMagicMult = 2.2;
    partnerSwordMult = 1.85;
    roomState.favorLevel += 2;
  }

  const clipMeta = artoriousClips.get(clipId) || artoriousClips.get('smite_nameless');
  let divineQuote = String(rawJson?.divine_quote || clipMeta?.subtitle || '').trim();

  // Never spoil the secret name if they failed to speak it
  if (!spokeTrueName && secretName) {
    const leakRegex = new RegExp(secretName, 'gi');
    if (leakRegex.test(divineQuote)) {
      divineQuote =
        clipMeta?.subtitle ||
        'You dare call into my sacred grove without speaking my true name? Seek the weathered stone in the plaza!';
    }
  }

  return {
    heard_transcript: heardTranscript,
    spoke_true_name: spokeTrueName,
    verdict,
    clip_id: clipId,
    audioUrl: clipMeta?.audioUrl || `/world/assets/audio/artorious/${clipId}.wav`,
    subtitle: divineQuote,
    partner_heal: partnerHeal,
    resurrect_partner: resurrectPartner,
    partner_magic_mult: partnerMagicMult,
    partner_sword_mult: partnerSwordMult,
    divine_quote: divineQuote,
    favorLevel: roomState.favorLevel,
  };
}

async function callSingleGeminiKey(apiKey, requestBody, hardTimeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), hardTimeoutMs);
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
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

      // Hedge with next key if primary takes longer than GEMINI_TIMEOUT_MS (2800ms)
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
      case 'act_transition':
      case 'commune_state':
      case 'commune_verdict': {
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

  return { addClient, getRoomStatus, broadcastToRoom, rooms };
}

/* ------------------------------------------------------------------------- */
/* HTTP + WebSocket Upgrade Server Factory                                   */
/* ------------------------------------------------------------------------- */

export function createWorldServer() {
  const roomManager = createRoomManager();

  // Pre-warm TLS keep-alive socket pool and model route to Gemini endpoint
  if (geminiKeys.length > 0) {
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
    const [rawPath] = rawUrl.split('?');
    const urlPath = decodeURIComponent(rawPath);

    res.setHeader('X-Haru-Coop', '1');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (urlPath === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Town Plaza Altar Riddle endpoint (`GET /api/altar`)
    if (urlPath === '/api/altar' && req.method === 'GET') {
      const envConfig = loadDotEnv();
      const title =
        envConfig.ALTAR_RIDDLE_TITLE ||
        process.env.ALTAR_RIDDLE_TITLE ||
        'The Weathered Stele of the Unnamed Grove';
      const poem = envConfig.ALTAR_RIDDLE_POEM || process.env.ALTAR_RIDDLE_POEM || '';
      const lines = poem
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ title, lines }));
      return;
    }

    // Stateful Multi-Turn Shrine Commune endpoint (`POST /api/commune`)
    if (urlPath === '/api/commune' && req.method === 'POST') {
      const startedAt = Date.now();
      try {
        const body = await readJsonBody(req);
        const envConfig = loadDotEnv();
        const roomCode = normalizeRoomCode(body.room || 'LOVE');
        const speakerRole = body.speakerRole === 'Mage' ? 'Mage' : 'Knight';
        const partnerRole =
          body.partnerRole || (speakerRole === 'Knight' ? 'Mage' : 'Knight');
        const audioBase64 = String(body.audioBase64 || '').replace(
          /^data:[^;]+;base64,/,
          ''
        );
        const mimeType = String(body.mimeType || 'audio/webm');
        const gameState = body.gameState || {};

        const roomState = getRoomCommuneHistory(roomCode);
        const priorFavor = roomState.favorLevel;

        // If empty audio payload was sent, immediately return smite_silence
        if (!audioBase64 || audioBase64.length < 64) {
          const fallback = normalizeCommuneVerdict(
            {
              heard_transcript: '',
              spoke_true_name: false,
              verdict: 'smite',
              clip_id: 'smite_silence',
              partner_heal: 0,
              resurrect_partner: false,
              partner_magic_mult: 1.0,
              partner_sword_mult: 1.0,
              divine_quote:
                'Silence? You summon the Ancient God of Love... just to give me the silent treatment? Perish.',
            },
            { envConfig, roomState, gameState }
          );
          const packet = {
            type: 'commune_verdict',
            ok: true,
            room: roomCode,
            speakerRole,
            partnerRole,
            favorLevel: fallback.favorLevel,
            judgment: fallback,
            ...fallback,
            latencyMs: Date.now() - startedAt,
            timestamp: Date.now(),
          };
          roomManager.broadcastToRoom(roomCode, packet);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(packet));
          return;
        }

        const contextText = [
          `Room: ${roomCode} | Current Favor Level: ${priorFavor}`,
          `Speaker Role: ${speakerRole} (HP: ${gameState.speakerHp ?? 100}/${gameState.speakerMaxHp ?? 100})`,
          `Partner Role (Beloved): ${partnerRole} (HP: ${gameState.partnerHp ?? 100}/${gameState.partnerMaxHp ?? 100}, Downed: ${Boolean(gameState.partnerDowned)})`,
          `Current Act: ${gameState.actId || 'act1'} | Distance Between Lovers: ${gameState.distance ?? 2.5}m`,
          `Listen carefully to the mortal's spoken prayer audio and judge according to the Three Sacred Laws.`,
        ].join('\n');

        const userParts = [
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
          { text: contextText },
        ];

        const contents = [
          ...roomState.turns.slice(-6),
          {
            role: 'user',
            parts: userParts,
          },
        ];

        const geminiRequest = {
          systemInstruction: {
            parts: [{ text: buildCommuneSystemInstruction(envConfig, priorFavor) }],
          },
          contents,
          generationConfig: {
            temperature: 0.4,
            responseMimeType: 'application/json',
            thinkingConfig: {
              thinkingLevel: 'MINIMAL',
            },
          },
        };

        const rawModelJson = await callGeminiWithRotation(geminiRequest);
        const normalized = normalizeCommuneVerdict(rawModelJson, {
          envConfig,
          roomState,
          gameState,
        });

        // Append compact turn history (up to last 6 turns = 3 user+model pairs)
        roomState.turns.push(
          {
            role: 'user',
            parts: [
              {
                text: `${contextText}\n[Spoken Audio Transcript]: "${normalized.heard_transcript}"`,
              },
            ],
          },
          {
            role: 'model',
            parts: [{ text: JSON.stringify(normalized) }],
          }
        );
        if (roomState.turns.length > 6) {
          roomState.turns.splice(0, roomState.turns.length - 6);
        }

        const packet = {
          type: 'commune_verdict',
          ok: true,
          room: roomCode,
          speakerRole,
          partnerRole,
          favorLevel: normalized.favorLevel,
          judgment: normalized,
          ...normalized,
          latencyMs: Date.now() - startedAt,
          timestamp: Date.now(),
        };

        roomManager.broadcastToRoom(roomCode, packet);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(packet));
      } catch (err) {
        const clipMeta = artoriousClips.get('smite_nameless');
        const divineQuote =
          clipMeta?.subtitle ||
          'You dare call into my sacred grove without speaking my true name? Seek the weathered stone in the plaza!';
        const fallbackJudgment = {
          heard_transcript: '',
          spoke_true_name: false,
          verdict: 'smite',
          clip_id: 'smite_nameless',
          audioUrl:
            clipMeta?.audioUrl || '/world/assets/audio/artorious/smite_nameless.wav',
          subtitle: divineQuote,
          partner_heal: 0,
          resurrect_partner: false,
          partner_magic_mult: 1.0,
          partner_sword_mult: 1.0,
          divine_quote: divineQuote,
        };
        const fallbackPacket = {
          type: 'commune_verdict',
          ok: false,
          error: String(err?.message || err),
          favorLevel: 0,
          judgment: fallbackJudgment,
          ...fallbackJudgment,
          latencyMs: Date.now() - startedAt,
          timestamp: Date.now(),
        };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(fallbackPacket));
      }
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
    console.log(
      `Haru-machi 3D World + Co-Op WebSocket + Commune Server (${geminiKeys.length} Gemini keys) listening on ${url}`
    );
    if (process.argv.includes('--open')) {
      exec(`start "" "${url}"`);
    }
  });
}
