// ============================================================================
// worker/index.js
//
// Cloudflare Worker entry point for Haru-machi 2-Player Co-Op (Pachgaon <-> Sonipat).
// - Routes `/api/room/:code/websocket` and `/api/room/:code/status` to `CoopRoomDO`
// - Serves `GET /api/altar` (`?stage=1|2|3` or `?stone=1|2|3`) via `scripture-catalog.js`
// - Serves `POST /api/commune` via `commune-judge.js`
// - Blocks dotfile paths (`/.env`, `/.git`, `/.wrangler`) with `403 Forbidden`
// - Serves static world/library assets via `env.ASSETS`
// ============================================================================

import { CoopRoomDO } from './room-do.js';
import { getScriptureForStage } from './scripture-catalog.js';
import { evaluateCommunePrayer } from './commune-judge.js';
import { normalizeRoomPhraseToCode } from '../world/src/net/room-progression.js';

export { CoopRoomDO };

function hasDotfileSegment(pathname) {
  const decoded = decodeURIComponent(String(pathname || '/'));
  const segments = decoded.split('/');
  return segments.some((seg) => seg.startsWith('.') && seg.length > 1);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 0. Dotfile boundary protection (`/.env`, `/.git`, `/.wrangler`, etc.)
    if (hasDotfileSegment(url.pathname)) {
      return new Response('403 Forbidden', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Haru-Coop': '1',
        },
      });
    }

    // 1. Route Co-Op Room WebSocket & Status requests to the room's Durable Object
    const roomMatch = url.pathname.match(
      /^\/api\/room\/([A-Za-z0-9_-]{1,48})\/(websocket|status)\/?$/i
    );
    if (roomMatch && env?.COOP_ROOMS) {
      const code = normalizeRoomPhraseToCode(roomMatch[1]);
      const id = env.COOP_ROOMS.idFromName(code);
      const stub = env.COOP_ROOMS.get(id);
      return stub.fetch(request);
    }

    // 2. Sacred Inscription Stone Catalog (`GET /api/altar?stage=1|2|3` or `?stone=1|2|3`)
    if (url.pathname === '/api/altar' && request.method === 'GET') {
      const stageParam = url.searchParams.get('stage');
      const stoneParam = url.searchParams.get('stone');
      const stonesSolvedParam = url.searchParams.get('stonesSolved');
      const scripture = getScriptureForStage(
        {
          stage: stageParam,
          stone: stoneParam,
          stonesSolved: stonesSolvedParam,
        },
        env
      );
      return new Response(JSON.stringify(scripture), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Haru-Coop': '1',
        },
      });
    }

    // 3. Context-Aware Shrine Commune Judge (`POST /api/commune`)
    if (url.pathname === '/api/commune' && request.method === 'POST') {
      const startedAt = Date.now();
      const body = await request.json().catch(() => ({}));
      const roomCode = normalizeRoomPhraseToCode(body.room || 'LOVE');
      const speakerRole = body.speakerRole === 'Mage' ? 'Mage' : 'Knight';
      const partnerRole =
        body.partnerRole || (speakerRole === 'Knight' ? 'Mage' : 'Knight');

      const judgment = await evaluateCommunePrayer({
        audioBase64: body.audioBase64 || '',
        mimeType: body.mimeType || 'audio/webm',
        transcriptHint: body.transcriptHint || '',
        speakerRole,
        partnerRole,
        gameState: body.gameState || {},
        progressionState: body.progressionState || {},
        spamCount: Number(body.spamCount || 0),
        env,
      });

      const packet = {
        type: 'commune_verdict',
        ok: true,
        room: roomCode,
        speakerRole,
        partnerRole,
        judgment,
        ...judgment,
        latencyMs: Date.now() - startedAt,
        timestamp: Date.now(),
      };

      return new Response(JSON.stringify(packet), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Haru-Coop': '1',
        },
      });
    }

    // 4. Redirect root `/` to `/world/index.html`
    if (url.pathname === '/' || url.pathname === '') {
      const target = new URL('/world/index.html', url.origin);
      target.search = url.search;
      request = new Request(target.toString(), request);
    }

    // 5. Fallback to static assets binding with `X-Haru-Coop: 1` header
    if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const assetRes = await env.ASSETS.fetch(request);
      const headers = new Headers(assetRes.headers);
      headers.set('X-Haru-Coop', '1');
      return new Response(assetRes.body, {
        status: assetRes.status,
        statusText: assetRes.statusText,
        headers,
      });
    }

    return new Response('Haru-machi Co-Op Worker Running', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Haru-Coop': '1',
      },
    });
  },
};
