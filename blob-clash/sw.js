// Offline support. Network first, cache as the fallback: the game is a graph of ES modules, and
// serving some of them from an older deploy than others would break it, so the cache is only
// for when the network is gone.
const CACHE = 'blob-clash-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'vendor/three/three.module.min.js', 'vendor/three/addons/utils/BufferGeometryUtils.js',
  'vendor/fonts/fredoka-700.woff2', 'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      return (await cache.match(request, { ignoreSearch: true })) ?? Response.error();
    }
  }));
});
