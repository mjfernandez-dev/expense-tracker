// SERVICE WORKER mejorado para Vite
const CACHE_NAME = 'gastos-v1';

// Lista básica - Vite genera nombres dinámicos, así que usamos estrategia de red primero
const urlsToCache = [
  '/',
];

// INSTALACIÓN
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cache abierto');
      return cache.addAll(urlsToCache);
    })
  );
  // Forzar activación inmediata
  self.skipWaiting();
});

// ACTIVACIÓN
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando Service Worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Tomar control inmediato
  return self.clients.claim();
});

// FETCH: Estrategia Network First (red primero, luego cache)
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones al backend (API)
  if (event.request.url.includes(':8000')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la petición funciona, guardar en cache
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla (offline), buscar en cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si no está en cache, mostrar página offline básica
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});