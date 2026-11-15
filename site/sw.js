// Service worker de Eventual: permite instalar la página como app
// y abrirla sin conexión con los últimos eventos descargados.
//
// Estrategia: primero la red (para tener siempre lo último) y, si no hay
// conexión, lo guardado en el teléfono. La versión se reemplaza en cada
// publicación, así se descartan los archivos viejos.
const VERSION = '__V__';
const CACHE = 'eventual-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'styles.css?v=' + VERSION,
  'app.js?v=' + VERSION,
  'pwa.js?v=' + VERSION,
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('eventual-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;
  const fuentes = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!propio && !fuentes) return; // imágenes y links de otros sitios: sin tocar

  // Las tipografías no cambian: primero lo guardado.
  if (fuentes) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
        return res;
      }))
    );
    return;
  }

  // Todo lo demás (página, estilos, eventos): primero la red, si falla lo guardado.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: req.mode === 'navigate' })
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
      )
  );
});
