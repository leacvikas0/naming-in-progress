// ============================================================================
// world/sw.js
//
// Amarante Service Worker:
// - On localhost / 127.0.0.1: Purges all legacy caches (including
//   `haru-machi-shell-v1`), unregisters itself, and never intercepts requests
//   so local development always serves fresh HTML/JS from disk.
// - In production: Uses Network-First with cache fallback so updates take
//   effect immediately on reload.
// ============================================================================

const CACHE_NAME = 'amarante-shell-v5';
const IS_LOCAL_DEV =
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname === 'localhost';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  if (IS_LOCAL_DEV) {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => IS_LOCAL_DEV || key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
        )
      )
      .then(async () => {
        await self.clients.claim();
        if (IS_LOCAL_DEV && self.registration) {
          await self.registration.unregister();
        }
      })
  );
});

self.addEventListener('fetch', (event) => {
  if (IS_LOCAL_DEV) {
    return;
  }
  const { request } = event;
  if (!request || request.method !== 'GET') return;
  const url = new URL(request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws') ||
    url.searchParams.has('room') ||
    url.searchParams.has('shot')
  ) {
    return;
  }

  // Network-First in production so new builds never serve stale JS/HTML
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
