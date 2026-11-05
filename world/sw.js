// ============================================================================
// world/sw.js
//
// Haru-machi Service Worker for Xiaomi Pad 7 Fullscreen Landscape PWA / TWA:
// - Caches core HTML/CSS/JS shell & static 3D assets using Stale-While-Revalidate
// - Strictly bypasses `/api/`, `/ws`, and WebSocket upgrade requests so live
//   Cloudflare `CoopRoomDO` synchronization and `/api/commune` prayers are
//   never intercepted or cached.
// ============================================================================

const CACHE_NAME = 'haru-machi-shell-v1';

const CORE_SHELL_URLS = [
  '/world/index.html',
  '/world/manifest.webmanifest',
  '/world/src/main.js',
  '/world/src/ui/app-flow.js',
  '/world/src/ui/sculpted-hud.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(CORE_SHELL_URLS).catch(() => {
        // Ignore individual pre-cache misses in dev/offline environments
      })
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
        )
      )
      .then(() => self.clients.claim())
  );
});

function shouldBypassCache(request) {
  if (!request || request.method !== 'GET') return true;
  const upgradeHeader = request.headers.get('upgrade');
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    return true;
  }
  const url = new URL(request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws') ||
    url.searchParams.has('room') ||
    url.searchParams.has('shot')
  ) {
    return true;
  }
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (shouldBypassCache(request)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok && response.status === 200 && response.type === 'basic') {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
