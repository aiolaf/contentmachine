// App shell cache: Notulist opens instantly and works offline (recording works
// without internet; transcribing waits until you are online).
// Only this app's own files are cached. API calls always go to the network.
const CACHE = 'notulist-v2';
const SHELL = [
  './', 'index.html', 'app.js', 'styles.css', 'icon.svg', 'manifest.webmanifest', 'apple-touch-icon.png',
  'lib/util.js', 'lib/db.js', 'lib/recorder.js', 'lib/transcribe.js', 'lib/segments.js', 'lib/format.js',
  'lib/calendar.js', 'lib/share.js', 'lib/prompts.js', 'lib/native.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('notulist-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  const key = e.request.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : url.href.split('?')[0].split('#')[0];
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      const fresh = fetch(e.request, { cache: 'no-cache' })
        .then((res) => { if (res.ok) cache.put(key, res.clone()); return res; })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
