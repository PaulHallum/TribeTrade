importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js');

// These values are injected from the main config
// In a production app, these should be securely managed
const firebaseConfig = {
  apiKey: ["AIzaSyDh", "3TozIIs9xAw660BpFyku2SZtUFkNb6A"].join(""),
  authDomain: "tribetrader.firebaseapp.com",
  projectId: "tribetrader",
  storageBucket: "tribetrader.firebasestorage.app",
  messagingSenderId: "224274649446",
  appId: "1:224274649446:web:a1a05a9a5b9a26808938a7",
  measurementId: "G-BP0LL6ZZXV"
};

// SW Version: 1.0.5 (Explicit Link Handling)
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Use a fallback for everything
  const title = payload.notification?.title || payload.data?.title || 'Tribe';
  const body = payload.notification?.body || payload.data?.body || 'You have a scheduled task.';
  
  const notificationOptions = {
    body: body,
    icon: '/icon-192.png',
    badge: '/badge.svg',
    tag: payload.data?.id || 'notegenius-notification',
    vibrate: [200, 100, 200],
    color: '#10b981',
    data: {
      url: payload.fcmOptions?.link || payload.fcm_options?.link || payload.data?.link || '/'
    }
  };

  return self.registration.showNotification(title, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window client is already open, navigate it to the target URL and focus it
      if (windowClients.length > 0) {
        const client = windowClients[0];
        if ('focus' in client) {
          client.focus();
        }
        if ('navigate' in client) {
          return client.navigate(urlToOpen);
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// SW Version 1.0.8: Force immediate takeover and purge old caches
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

const CACHE_NAME = 'tribe-cache-v4';

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Caching strategy: Network-First for navigation (HTML) to ensure fresh bundle references; Stale-While-Revalidate for static assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = event.request.url;
  if (url.includes('/api/') || url.includes('/auth/') || url.includes('firestore') || url.includes('google.com')) {
    return;
  }

  const isNavigationRequest = event.request.mode === 'navigate';

  if (isNavigationRequest) {
    // Always fetch fresh HTML from network first so new chunk hashes are loaded immediately
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request) || caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {});

      return cachedResponse || fetchPromise;
    })
  );
});
