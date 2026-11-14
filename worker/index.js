// ============================================================================
// worker/index.js
//
// Cloudflare Worker entry point for Haru-machi 2-Player Co-Op (Pachgaon <-> Sonipat).
// - Routes `/api/room/:code/websocket`, `/api/room/:code/status`, and
//   `/api/room/:code/internal/commune-apply` to `CoopRoomDO`
// - Serves `GET /api/altar` (`?stage=1|2|3` or `?stone=1|2|3`) via `scripture-catalog.js`
// - Serves `POST /api/commune` via `commune-judge.js` and syncs verdict to `CoopRoomDO`
// - Serves `GET/POST /api/mobile-telemetry` (`200 { ok: true }` + CORS)
// - Blocks dotfile paths (`/.env`, `/.git`, `/.dev.vars`) and sensitive directories
//   (`/worker/`, `/sfx-foley/`, `/docs/`, `/scripts/`, `/package*.json`, `/wrangler.toml`)
//   with `403 Forbidden`
// - Serves static world/library assets via `env.ASSETS`
// ============================================================================

import { CoopRoomDO, sanitizePartnerCommunePacket } from './room-do.js';
import { getScriptureForStage } from './scripture-catalog.js';
import { evaluateCommunePrayer } from './commune-judge.js';
import { normalizeRoomPhraseToCode } from '../world/src/net/room-progression.js';

export { CoopRoomDO };

const BLOCKED_PATH_PREFIXES = [
  '/worker/',
  '/sfx-foley/',
  '/docs/',
  '/scripts/',
  '/qa-review/',
  '/_archive/',
  '/house3d/',
  '/catalog/',
  '/android-twa/',
  '/world/tools/',
  '/world/shots/',
];

const BLOCKED_EXACT_PATHS = new Set([
  '/worker',
  '/sfx-foley',
  '/docs',
  '/scripts',
  '/qa-review',
  '/_archive',
  '/house3d',
  '/catalog',
  '/android-twa',
  '/world/tools',
  '/world/shots',
  '/package.json',
  '/package-lock.json',
  '/wrangler.toml',
  '/.dev.vars',
  '/.env',
  '/.assetsignore',
  '/.gitignore',
]);

const mobileTelemetryHistory = [];
const MAX_MOBILE_TELEMETRY = 50;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'X-Haru-Coop': '1',
};

function isBlockedPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(pathname || '/')).replace(/\\/g, '/');
  } catch {
    return true;
  }
  const lower = decoded.toLowerCase();
  if (BLOCKED_EXACT_PATHS.has(lower)) return true;
  if (BLOCKED_PATH_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
  if (/^\/package(-lock)?\.json$/i.test(lower)) return true;

  const segments = decoded.split('/');
  return segments.some((seg) => seg.startsWith('.') && seg.length > 1);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // 0. Dotfile & sensitive path boundary protection (`/.env`, `/worker/`, `/sfx-foley/`, etc.)
    if (isBlockedPath(url.pathname)) {
      return new Response('403 Forbidden', {
        status: 403,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    // 1. Live Mobile Phone Telemetry (`GET / POST /api/mobile-telemetry`)
    if (url.pathname === '/api/mobile-telemetry' || url.pathname === '/api/mobile-telemetry/') {
      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const snapshot = {
          ...(body && typeof body === 'object' ? body : {}),
          timestamp: Number(body?.timestamp) || Date.now(),
          receivedAt: new Date().toISOString(),
        };
        mobileTelemetryHistory.push(snapshot);
        if (mobileTelemetryHistory.length > MAX_MOBILE_TELEMETRY) {
          mobileTelemetryHistory.splice(0, mobileTelemetryHistory.length - MAX_MOBILE_TELEMETRY);
        }
        return new Response(
          JSON.stringify({
            ok: true,
            count: mobileTelemetryHistory.length,
            latest: snapshot,
            history: mobileTelemetryHistory,
          }),
          {
            status: 200,
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'application/json; charset=utf-8',
            },
          }
        );
      }

      const latest =
        mobileTelemetryHistory.length > 0
          ? mobileTelemetryHistory[mobileTelemetryHistory.length - 1]
          : null;
      return new Response(
        JSON.stringify({
          ok: true,
          count: mobileTelemetryHistory.length,
          latest,
          history: mobileTelemetryHistory,
        }),
        {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
    }

    // 2. Route Co-Op Room WebSocket, Status & Internal Commune Apply requests to `CoopRoomDO`
    const roomMatch = url.pathname.match(
      /^\/api\/room\/([A-Za-z0-9_-]{1,48})\/(websocket|status|internal\/commune-apply|commune-apply)\/?$/i
    );
    if (roomMatch && env?.COOP_ROOMS) {
      const code = normalizeRoomPhraseToCode(roomMatch[1]);
      const id = env.COOP_ROOMS.idFromName(code);
      const stub = env.COOP_ROOMS.get(id);
      return stub.fetch(request);
    }

    // 3. Sacred Inscription Stone Catalog (`GET /api/altar?stage=1|2|3` or `?stone=1|2|3`)
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
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }

    // 4. Context-Aware Shrine Commune Judge (`POST /api/commune`) + DO Sync
    if (url.pathname === '/api/commune' && request.method === 'POST') {
      const startedAt = Date.now();
      const body = await request.json().catch(() => ({}));
      const roomCode = normalizeRoomPhraseToCode(body.room || 'LOVE');
      const speakerRole = body.speakerRole === 'Mage' ? 'Mage' : 'Knight';
      const partnerRole =
        body.partnerRole || (speakerRole === 'Knight' ? 'Mage' : 'Knight');

      let progressionState = body.progressionState || null;
      let spamCount = body.spamCount !== undefined ? Number(body.spamCount || 0) : null;
      let roomStub = null;

      if (env?.COOP_ROOMS) {
        try {
          const id = env.COOP_ROOMS.idFromName(roomCode);
          roomStub = env.COOP_ROOMS.get(id);
          if ((!progressionState || spamCount === null) && typeof roomStub?.fetch === 'function') {
            const stRes = await roomStub.fetch(
              new Request(`https://do.internal/api/room/${roomCode}/status`)
            );
            if (stRes?.ok) {
              const stJson = await stRes.json().catch(() => null);
              if (stJson) {
                if (!progressionState && stJson.progression) {
                  progressionState = stJson.progression;
                }
                if (spamCount === null && typeof stJson.spamCount === 'number') {
                  spamCount = stJson.spamCount;
                }
              }
            }
          }
        } catch {
          // Non-fatal if DO status lookup is unavailable in unit test stub
        }
      }

      const judgment = await evaluateCommunePrayer({
        audioBase64: body.audioBase64 || '',
        mimeType: body.mimeType || 'audio/webm',
        transcriptHint: body.transcriptHint || '',
        speakerRole,
        partnerRole,
        gameState: body.gameState || {},
        progressionState: progressionState || {},
        spamCount: Number(spamCount || 0),
        env,
      });

      let appliedProgression = null;
      if (roomStub) {
        try {
          if (typeof roomStub.applyCommuneVerdict === 'function') {
            const appliedPacket = roomStub.applyCommuneVerdict(
              judgment,
              speakerRole,
              partnerRole
            );
            appliedProgression = appliedPacket?.progression || null;
          } else if (typeof roomStub.fetch === 'function') {
            const applyRes = await roomStub.fetch(
              new Request(`https://do.internal/api/room/${roomCode}/internal/commune-apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  room: roomCode,
                  speakerRole,
                  partnerRole,
                  judgment,
                }),
              })
            );
            if (applyRes?.ok) {
              const applyJson = await applyRes.json().catch(() => null);
              appliedProgression = applyJson?.progression || null;
            }
          }
        } catch {
          // Non-fatal in minimal test stubs
        }
      }

      const sanitizedJudgment = sanitizePartnerCommunePacket(judgment);
      const packet = {
        type: 'commune_verdict',
        ok: true,
        room: roomCode,
        speakerRole,
        partnerRole,
        ...(appliedProgression ? { progression: appliedProgression } : {}),
        judgment: sanitizedJudgment,
        ...sanitizedJudgment,
        latencyMs: Date.now() - startedAt,
        timestamp: Date.now(),
      };

      return new Response(JSON.stringify(packet), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }

    // 5. Redirect root `/` to `/world/index.html`
    if (url.pathname === '/' || url.pathname === '') {
      const target = new URL('/world/index.html', url.origin);
      target.search = url.search;
      request = new Request(target.toString(), request);
    }

    // 6. Fallback to static assets binding with `X-Haru-Coop: 1` header
    if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const assetRes = await env.ASSETS.fetch(request);
      const headers = new Headers(assetRes.headers);
      headers.delete('link');
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
        ...CORS_HEADERS,
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  },
};
