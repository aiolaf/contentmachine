// App shell cache: opens instantly on the iPhone, refreshes in the background.
// Only this app's own files are cached; GitHub and other APIs always go to the network.
const CACHE = 'cm-v13';
const SHELL = [
  './', 'index.html', 'app.js', 'ui.js', 'styles.css', 'icon.svg', 'manifest.webmanifest', 'apple-touch-icon.png',
  'lib/frontmatter.js', 'lib/store.js', 'lib/vault.js', 'lib/capture.js', 'lib/classify.js',
  'lib/learn.js', 'lib/prompts.js', 'lib/pipeline.js', 'lib/seeds.js', 'lib/embeds.js', 'lib/shortcut.js', 'lib/bundles.js',
  'lib/search.js', 'lib/highlights.js', 'lib/review.js', 'lib/textcache.js', 'lib/content.js', 'lib/video.js',
];

self.addEventListener('install', (e) => {
  // "reload" skips the browser cache, so a new version never installs old files.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // Every page (with or without ?url=) is the same single-page app.
  const key = e.request.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : url.href.split('?')[0];
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      // "no-cache" asks GitHub Pages whether the file changed instead of using a
      // copy from the browser cache that can be ten minutes old.
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
