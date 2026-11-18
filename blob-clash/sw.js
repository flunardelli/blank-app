// Offline support: the app shell is precached; everything else is served stale-while-revalidate,
// so the game opens instantly (and offline) and picks up a new deploy on the next launch.
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
    const cached = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => cached);
    return cached ?? network;
  }));
});
