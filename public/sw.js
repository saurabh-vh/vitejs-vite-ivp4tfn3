const CACHE_NAME = 'splat-cache-v1';
const PRECACHE_URLS = [
  'https://virtual-homes.s3.ap-south-1.amazonaws.com/SignatureGlobal/TwinTowerDXP/largefile1splat.splat'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching splat file');
      return cache.addAll(PRECACHE_URLS);
    }).catch(err => {
      console.error('[SW] Precaching failed:', err);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only handle GET requests
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', request.url);
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          // Optionally cache new requests
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
          }
          return networkResponse;
        });
      })
      .catch((err) => {
        console.error('[SW] Fetch failed:', err);
        return new Response('Offline or file not available', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      })
  );
});
