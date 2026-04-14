// Service worker: cache sprites and static assets to reduce edge requests
const CACHE_NAME = 'p151-sprites-v1';

// Cache sprites and static assets on fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only cache same-origin GET requests for sprites and built assets
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const shouldCache =
    path.startsWith('/sprites/') ||
    path.startsWith('/assets/') ||
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
