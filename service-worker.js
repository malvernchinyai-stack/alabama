// service-worker.js — offline-first cache for the Alabama Electrical app.
// Bump CACHE_VERSION whenever any precached file changes so clients pick up the update.
const CACHE_VERSION = 'alabama-electrical-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/item-editor.js',
  './js/pdf.js',
  './js/ui.js',
  './js/utils.js',
  './js/views/boq.js',
  './js/views/catalog.js',
  './js/views/clients.js',
  './js/views/dashboard.js',
  './js/views/quotes.js',
  './js/views/invoices.js',
  './js/views/settings.js',
  './vendor/jspdf.umd.min.js',
  './assets/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Cache-first for everything in this same-origin app (works fully offline once installed).
// Falls back to the network for anything not precached, and updates the cache opportunistically.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin requests pass through untouched

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((networkRes) => {
          const copy = networkRes.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return networkRes;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 408, statusText: 'Offline' });
        });
    })
  );
});
