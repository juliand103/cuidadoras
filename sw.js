// Guarda la app en el iPad para que funcione sin internet.
// Al publicar cambios, subir VERSION para que el iPad baje la versión nueva.
const VERSION = 'v3';
const CACHE = `cuidadoras-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'fonts/atkinson-400.woff2',
  'fonts/atkinson-700.woff2',
  'fonts/atkinson-800.woff2',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/backup.js',
  'js/dates.js',
  'js/format.js',
  'js/model.js',
  'js/share.js',
  'js/store.js',
  'js/vendor/preact-htm.js',
  'js/ui/calendario.js',
  'js/ui/common.js',
  'js/ui/config.js',
  'js/ui/pagos.js',
  'js/ui/resumen.js',
  'js/ui/semana.js',
  'js/ui/turno.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cuidadoras-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('index.html');
      return fetch(req);
    }),
  );
});
