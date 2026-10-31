// ============================================================================
// worker/index.js
//
// Cloudflare Worker entry point for Haru-machi 2-Player Co-Op (Pachgaon <-> Sonipat).
// Routes `/api/room/:code/websocket` and `/api/room/:code/status` to `CoopRoomDO`
// Durable Objects and serves static world/library assets via `env.ASSETS`.
// ============================================================================

import { CoopRoomDO } from './room-do.js';

export { CoopRoomDO };

function normalizeRoomCode(raw) {
  const cleaned = String(raw || 'LOVE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return cleaned || 'LOVE';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Route Co-Op Room WebSocket & Status requests to the room's Durable Object
    const roomMatch = url.pathname.match(
      /^\/api\/room\/([A-Za-z0-9_-]{1,16})\/(websocket|status)\/?$/i
    );
    if (roomMatch && env.COOP_ROOMS) {
      const code = normalizeRoomCode(roomMatch[1]);
      const id = env.COOP_ROOMS.idFromName(code);
      const stub = env.COOP_ROOMS.get(id);
      return stub.fetch(request);
    }

    // 2. Redirect root `/` to `/world/index.html`
    if (url.pathname === '/' || url.pathname === '') {
      const target = new URL('/world/index.html', url.origin);
      target.search = url.search;
      request = new Request(target.toString(), request);
    }

    // 3. Fallback to static assets binding with `X-Haru-Coop: 1` header
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
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
