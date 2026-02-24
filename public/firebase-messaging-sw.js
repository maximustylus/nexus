// public/firebase-messaging-sw.js

// 1. Import Firebase compat libraries (Required for Service Workers)
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

// 2. Initialize Firebase with your exact public config
firebase.initializeApp({
  apiKey: "AIzaSyANs4oTfPMmFnALFSFGGCsIfqQMDjqxWK0",
  authDomain: "idc-app-e0c59.firebaseapp.com",
  projectId: "idc-app-e0c59",
  storageBucket: "idc-app-e0c59.firebasestorage.app",
  messagingSenderId: "208388673695",
  appId: "1:208388673695:web:b14ff65a8a9bbc988f12aa",
  measurementId: "G-T465RBWBHJ"
});

const messaging = firebase.messaging();

// 3. Handle incoming messages when the app is in the background or closed
messaging.onBackgroundMessage((payload) => {
  console.log('[NEXUS SW] Background Message received: ', payload);

  // 🛡️ THE SHIELD: Prevent badge errors from killing the push notification
  try {
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(1).catch((error) => {
        console.warn('[NEXUS SW] Promise rejected on badge:', error);
      });
    }
  } catch (syncError) {
    console.warn('[NEXUS SW] Synchronous error on badge:', syncError);
  }

  const notificationTitle = payload.notification?.title || "NEXUS Pulse Reminder";
  const notificationOptions = {
    body: payload.notification?.body || "Time for your daily wellbeing check-in.",
    icon: '/nexus.png',
    badge: '/nexus.png',
    tag: 'pulse-reminder', 
    // 🛡️ NEW: Send a routing signal so React knows what to do
    data: { 
      url: '/', 
      type: 'NAVIGATE_TO_PULSE' 
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 4. Enhanced Routing: Focus existing app or open new, then trigger React navigation
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = new URL(self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. Check if NEXUS is already open in any tab
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Send signal to the existing React app
          client.postMessage({ type: 'NAVIGATE_TO_PULSE' });
          return client.focus();
        }
      }

      // 2. If app is not open, open it and then send the signal
      if (clients.openWindow) {
        return clients.openWindow('/').then((windowClient) => {
          // Delay briefly to allow React components to mount before shouting the route command
          setTimeout(() => {
            if (windowClient) windowClient.postMessage({ type: 'NAVIGATE_TO_PULSE' });
          }, 2000);
        });
      }
    })
  );
});
