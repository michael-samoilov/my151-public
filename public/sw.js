// Service worker: cache sprites and static assets to reduce edge requests
const CACHE_NAME = 'p151-sprites-v2';

const SPRITE_CDN = 'raw.githubusercontent.com';

// Cache sprites and static assets on fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Same-origin: cache sprites and built assets
  if (url.origin === self.location.origin) {
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
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // CDN: cache PokeAPI sprite images
  if (url.hostname === SPRITE_CDN && url.pathname.includes('/sprites/pokemon/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request, { mode: 'cors' }).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
  }
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
