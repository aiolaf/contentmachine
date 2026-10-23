// App shell cache: opens instantly on the iPhone, refreshes in the background.
// Only this app's own files are cached; GitHub always goes to the network.
const CACHE = 'ds-v2';
const SHELL = [
  './', 'index.html', 'app.js', 'ui.js', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png',
  'fonts/outfit-latin-wght-normal.woff2', 'fonts/outfit-latin-ext-wght-normal.woff2',
  'lib/core.js', 'lib/store.js', 'lib/sync.js', 'lib/demo.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ds-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  const key = e.request.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : url.href.split('?')[0];
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      const fresh = fetch(e.request, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
