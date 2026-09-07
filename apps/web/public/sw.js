/*
 * Meridian service worker.
 *
 * Scope is deliberately narrow. It caches the application shell and static
 * build assets so the portal opens instantly and degrades to a usable offline
 * page — and it caches nothing else.
 *
 * In particular, **no API response is ever cached**. Bookings, session notes,
 * invoices and client details are personal and often confidential; storing
 * them in the Cache API would leave them readable on a shared device long
 * after sign-out, which no cache-invalidation scheme reliably prevents.
 * Requirement: the portal is installable, not offline-capable for private data.
 */

const VERSION = 'meridian-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = ['/', '/offline.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only. Cross-origin requests (fonts, Paystack) pass straight
  // through so their own cache headers apply.
  if (url.origin !== self.location.origin) return;

  // Never touch the API. Personal data must not enter the cache, and a stale
  // booking or balance would be actively misleading.
  if (url.pathname.startsWith('/api/')) return;

  // Hashed build assets are immutable: cache-first is safe and fast.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network-first so a deploy is picked up immediately, falling
  // back to the cached shell and then to the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached ?? caches.match('/offline.html'))),
    );
  }
});
