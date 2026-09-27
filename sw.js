// My Med Hub service worker: offline shell + "Share to" handling.
const SHELL = 'mmh-shell-v1';
const SHELL_FILES = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mmh-shell-') && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Something was shared to the app from another app (e.g. Labcorp -> Share).
  if (e.request.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const file = form.get('report');
        const text = [form.get('title'), form.get('text'), form.get('url')].filter(Boolean).join('\n');
        const cache = await caches.open('mmh-shared');
        if (file && typeof file === 'object' && file.size) {
          await cache.put('shared-file', new Response(file, {
            headers: { 'Content-Type': file.type || 'application/pdf', 'X-File-Name': encodeURIComponent(file.name || 'shared-report.pdf') }
          }));
        } else if (text) {
          await cache.put('shared-text', new Response(text, { headers: { 'Content-Type': 'text/plain' } }));
        }
      } catch (err) { /* page will show a friendly message */ }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // App pages: try the network first so updates show up, fall back to the saved copy offline.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
