// Minimal offline shell service worker.
// Strategy:
//   - HTML navigations: network-first, fall back to cached '/' shell.
//   - Same-origin GET assets: stale-while-revalidate (fast + updates in background).
//   - Cross-origin (CDN images, API) requests are passed through untouched.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `gallery-shell-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Bypass cross-origin (grafolio CDN, moodboard API, proxy paths, etc.)
  if (url.origin !== self.location.origin) return;
  // Bypass local proxies we don't want cached
  if (url.pathname.startsWith('/api-proxy/') || url.pathname.startsWith('/img-proxy/')) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first for HTML so users get updates the moment they're online
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error())),
    );
    return;
  }

  // Stale-while-revalidate for other same-origin assets
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    ),
  );
});
