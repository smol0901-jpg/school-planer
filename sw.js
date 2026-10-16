/* Орбита 4 · Service Worker
   • офлайн: все файлы приложения (включая QR-библиотеки) кэшируются при установке
   • обновления: новая версия ставится в фоне, пользователь подтверждает «Обновить» (тост в приложении)
   • «Поделиться в Орбиту»: принимает файл/текст из системного меню (share_target) и передаёт в приложение */
const V = 'orbit-v4.3.3';
const CORE = ['./', './index.html', './manifest.json', './version.json', './browserconfig.xml',
  './css/styles.css', './css/orbit4.css',
  './js/qrcode.js', './js/jsQR.js', './js/xlsx.mini.min.js', './js/app.js',
  './js/orbit/engine.js', './js/orbit/kit.js', './js/orbit/brand.js', './js/orbit/habits.js', './js/orbit/dash.js', './js/orbit/lists.js', './js/orbit/actions.js', './js/orbit/llm.js', './js/orbit/assistant.js', './js/orbit/share.js', './js/orbit/settings.js', './js/orbit/boot.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('orbit-') && k !== V && k !== 'orbit-share').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { const d = e.data; if (d === 'SKIP_WAITING' || (d && d.type === 'SKIP_WAITING')) self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) { e.respondWith(fetch(req).catch(() => caches.match(req))); return; }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(V).then(c => c.put('./index.html', copy)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  // stale-while-revalidate для остальных файлов
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || Response.error();
  }));
});

async function receiveShare(req) {
  try {
    const fd = await req.formData(); let text = '';
    const f = fd.get('file'); if (f && typeof f !== 'string') text = await f.text();
    if (!text) text = [fd.get('text'), fd.get('url')].filter(Boolean).join('\n').trim();
    const c = await caches.open('orbit-share'); await c.put('/shared.orbit', new Response(text));
  } catch (e) {}
  return Response.redirect(new URL('./index.html?shared=1', self.registration.scope).href, 303);
}
