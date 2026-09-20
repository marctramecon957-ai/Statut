const CACHE_NAME = 'valenca-studio-v2';
const APP_SHELL = [
  '/',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/assets/logo.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---- Notifications push : recues meme si l'app/onglet est ferme ----
self.addEventListener('push', (event) => {
  let data = { title: 'Emploi du temps', body: '' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const taches = [
    self.registration.showNotification(data.title || 'Emploi du temps', {
      body: data.body || '',
      icon: '/assets/icon-192.png',
      badge: '/assets/icon-192.png',
      tag: data.tag || undefined,
    }),
  ];

  // Diagnostic : confirme au serveur que ce push a bien ete recu sur ce
  // telephone, meme si l'affichage echoue pour une raison quelconque.
  if (data.confirmId) {
    taches.push(
      fetch('/api/push-recu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.confirmId }),
      }).catch(() => {})
    );
  }

  event.waitUntil(Promise.all(taches));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

// Reseau d'abord pour les appels API (donnees toujours a jour), cache pour le reste
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
