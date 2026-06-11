const CACHE = 'limitless-v3';
const ASSETS = [
  '/', '/index.html?v=3',
  '/js/app.js?v=3', '/js/db.js?v=3', '/js/config.js?v=3', '/js/notifications.js?v=3',
  '/css/style.css?v=3',
  '/icons/icon-192.png?v=3', '/icons/icon-512.png?v=3',
  '/manifest.json?v=3',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
  'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@300;400;500&display=swap',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => {
      return Promise.allSettled(ASSETS.map(url =>
        c.add(url).catch(() => {/* skip sw-friendly failures */})
      ));
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Supabase API / EmailJS API — network only
  if (url.hostname.includes('supabase.co') || url.hostname.includes('emailjs')) {
    return;
  }

  // Google Fonts stylesheet — cache-first
  if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
        return res;
      }))
    );
    return;
  }

  // Static assets — cache-first
  if (url.hostname === 'cdn.jsdelivr.net' || url.href.startsWith(self.location.origin)) {
    e.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
        return res;
      }).catch(() => caches.match('/index.html')))
    );
    return;
  }
});
