```javascript
// Простой Service Worker для кэширования
const CACHE_NAME = 'performance-maker-v1';
const urlsToCache = [
  '/',
  '/styles/globals.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
