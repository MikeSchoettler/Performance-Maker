/**
 * Service Worker для Performance Maker 4.0
 * Кэширование критических ресурсов для офлайн работы и быстрой загрузки
 * Особенно важно для Safari - кэширует аудио файлы для видео
 */

const CACHE_VERSION = 'v4.0.0';
const CACHE_NAME = `performance-maker-${CACHE_VERSION}`;

// Ресурсы для кэширования
const CRITICAL_RESOURCES = [
  '/',
  '/index.html',
  '/App.tsx',
  '/styles/globals.css',
];

// Шрифты Yango (загружаются с GitHub)
const FONT_RESOURCES = [
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/fonts/YangoGroupHeadlineHeavyArabic.woff2',
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/fonts/YangoTextMedium.woff2',
];

// Фоновые изображения (3 стиля)
const BACKGROUND_RESOURCES = [
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/defaults/backgrounds/Style1_EN.png',
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/defaults/backgrounds/Style1_AR.png',
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/defaults/backgrounds/Style2_EN.png',
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/defaults/backgrounds/Style2_AR.png',
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/defaults/backgrounds/Style3_EN.png',
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/defaults/backgrounds/Style3_AR.png',
];

// Иконка приложения
const ICON_RESOURCES = [
  '/public/defaults/yango-logo.svg',
];

// 🔊 V4.0: Аудио файлы для видео (загружаются с GitHub)
const AUDIO_RESOURCES = [
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/defaults/audio/Style1.mp3',
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/defaults/audio/Style2.mp3',
  'https://raw.githubusercontent.com/MikeSchoettler/Performance-Maker/main/public/defaults/audio/Style3.mp3',
];

// Все ресурсы для прекэширования
const PRECACHE_RESOURCES = [
  ...CRITICAL_RESOURCES,
  ...FONT_RESOURCES,
  ...BACKGROUND_RESOURCES,
  ...ICON_RESOURCES,
  ...AUDIO_RESOURCES, // 🎬 V4.0: Кэшируем аудио для видео!
];

/**
 * Install Event - кэшируем критические ресурсы
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching resources...');
        
        // Кэшируем ресурсы по одному, чтобы не ломалось если один недоступен
        return Promise.allSettled(
          PRECACHE_RESOURCES.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache: ${url}`, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] All resources cached');
        // Активируем новый SW сразу
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Precaching failed:', error);
      })
  );
});

/**
 * Activate Event - удаляем старые кэши
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        // Берем контроль над всеми кли��нтами
        return self.clients.claim();
      })
  );
});

/**
 * Fetch Event - стратегия Cache First для ресурсов, Network First для API
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Игнорируем не-GET запросы
  if (request.method !== 'GET') {
    return;
  }
  
  // Игнорируем Chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Стратегия для разных типов ресурсов
  if (
    // Шрифты
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    // Фоны
    url.pathname.includes('/backgrounds/') ||
    // Иконки
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    // 🔊 V4.0: Аудио файлы для видео
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.wav') ||
    url.pathname.endsWith('.ogg') ||
    url.pathname.includes('/audio/')
  ) {
    // Cache First - для статичных ресурсов
    event.respondWith(cacheFirst(request));
  } else if (
    // API запросы
    url.hostname.includes('libretranslate.com') ||
    url.hostname.includes('languagetool.org') ||
    url.hostname.includes('githubusercontent.com')
  ) {
    // Network First - для API и динамических ресурсов
    event.respondWith(networkFirst(request));
  } else {
    // Stale While Revalidate - для остального
    event.respondWith(staleWhileRevalidate(request));
  }
});

/**
 * Cache First Strategy
 * Сначала ищем в кэше, если нет - загружаем из сети и кэшируем
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    console.log('[SW] Cache hit:', request.url);
    return cachedResponse;
  }
  
  console.log('[SW] Cache miss, fetching:', request.url);
  
  try {
    const networkResponse = await fetch(request);
    
    // Кэшируем успешный ответ
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Fetch failed:', request.url, error);
    
    // Возвращаем fallback если есть
    return new Response('Resource not available offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

/**
 * Network First Strategy
 * Сначала пытаемся загрузить из сети, если не получилось - берем из кэша
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Кэшируем успешный ответ
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

/**
 * Stale While Revalidate Strategy
 * Возвращаем из кэша сразу, но параллельно обновляем кэш из сети
 */
async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      const cache = caches.open(CACHE_NAME);
      cache.then(c => c.put(request, networkResponse.clone()));
    }
    return networkResponse;
  }).catch(() => {
    // Игнорируем ошибки сети в фоновом обновлении
  });
  
  // Возвращаем кэшированный ответ или ждем сеть
  return cachedResponse || fetchPromise;
}

/**
 * Message Event - для управления кэшем из приложения
 */
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        console.log('[SW] All caches cleared');
        event.ports[0].postMessage({ success: true });
      })
    );
  }
  
  if (event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      getCacheSize().then((size) => {
        event.ports[0].postMessage({ size });
      })
    );
  }
});

/**
 * Получить размер кэша
 */
async function getCacheSize() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  
  let totalSize = 0;
  
  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }
  
  return totalSize;
}

console.log('[SW] Service Worker loaded', CACHE_VERSION);
