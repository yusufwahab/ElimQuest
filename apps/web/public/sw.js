/*
 * ElimQuest service worker. Deliberately tiny and safe:
 *  - it exists so phones can install the site to the home screen;
 *  - the only thing it caches is a friendly offline page, shown when a page cannot be loaded without a connection;
 *  - it never caches or intercepts API calls, live-game traffic, scripts or styles, so it can never serve stale game data or old code.
 */
const CACHE = 'elimquest-offline-v1';
const OFFLINE_URL = 'offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return; // everything else goes straight to the network
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
});
