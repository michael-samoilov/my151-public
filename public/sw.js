// Service worker: cache sprites to reduce edge requests.
//
// Built files under /assets/ stay with the browser's HTTP cache: their names
// carry a content hash and they are cached as immutable for a year. Routing
// them through this cache cost the hub its artwork on iPhones: the cache kept
// every file of every deploy, and WebKit reopens it on the first request after
// the app has been idle, before it can answer even one image.
const CACHE_NAME = 'p151-sprites-v3';

// Replace the previous worker on this visit, so its large cache goes now.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const shouldCache =
    path.startsWith('/sprites/') ||
    path === '/favicon.svg' ||
    path === '/icons.svg';

  if (!shouldCache) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          // Only cache successful responses
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    )
  );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
});
