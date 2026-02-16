const CACHE_NAME = 'hourzy-runtime-v2';
const PRECACHE_URLS = ['/', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.status === 200 && request.url.startsWith(self.location.origin)) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;

      if (request.mode === 'navigate') {
        const fallback = await cache.match('/offline.html') || await cache.match('/');
        if (fallback) return fallback;
      }

      return new Response('Offline and no cached response available.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
