// Push handlers, imported into the generated service worker via
// vite-plugin-pwa workbox.importScripts. Kept as plain JS so it needs no build
// step. The payload shape ({ title, body, url }) is produced by the backend
// sender described in docs/PUSH_SETUP.md.
/* global self, clients */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { body: event.data && event.data.text ? event.data.text() : '' };
  }
  const title = data.title || 'Liftoff';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: data.tag || 'liftoff-reminder',
      // A tag makes a later notification REPLACE an earlier one instead of
      // stacking. Without renotify that replacement is silent, so the CO2
      // window's 10:00 nudge would quietly overwrite the 09:30 one and never
      // alert — the reminder would appear to have stopped working.
      renotify: true,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
