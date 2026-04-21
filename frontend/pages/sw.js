self.addEventListener('push', function(e) {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Pagani Digital', {
      body: data.body || '',
      icon: '/assets/favicon.svg',
      badge: '/assets/favicon.svg',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  const base = 'https://pagani-digital.vercel.app/';
  const raw = e.notification.data?.url || '/';
  const url = raw.startsWith('http') ? raw : base + raw;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (const c of list) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
