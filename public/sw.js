// EduTest service worker: ilovani telefonga o'rnatish va internet uzilganda oxirgi ochilgan sahifalarni ko'rsatish.
// Strategiya — "avval tarmoq": yangi versiya darhol ishlaydi, tarmoq bo'lmasa keshdagi nusxa beriladi.
// API so'rovlari (natijalar, imtihon) hech qachon keshlanmaydi.
const CACHE = 'edutest-v4';
const SHELL = ['/', '/css/style.css', '/js/app.js', '/js/ui.js', '/js/api.js', '/js/i18n.js', '/js/i18n-dict.js', '/js/theme-init.js',
  '/img/logo.svg', '/img/girih.svg', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Panel (/panel) va asosiy sayt sahifalari alohida keshlanadi
  const shell = url.pathname === '/panel' || url.pathname.startsWith('/panel/') ? '/panel' : '/';
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? shell : req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req.mode === 'navigate' ? shell : req);
      if (hit) return hit;
      throw err;
    }
  })());
});
