// SERVICE WORKER AUTO-DESTRUCTOR
// Este SW se desregistra a sí mismo y limpia los caches

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Limpiar todos los caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW] Eliminando cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }),
      // Desregistrar este service worker
      self.registration.unregister().then(() => {
        console.log('[SW] Service Worker desregistrado');
      })
    ])
  );
});

// No interceptar ninguna petición
self.addEventListener('fetch', () => {
  // Dejar pasar todas las peticiones sin interceptar
});
