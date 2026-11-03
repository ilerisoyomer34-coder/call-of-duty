// Demir Şafak hizmet çalışanı (PWA). tools/build.mjs bu şablondan dist/pwa/sw.js üretir:
// __VERSION__ tüm dosyaların içerik özetiyle, __FILES__ önbelleğe alınacak dosya listesiyle değişir.
// Sürüm her içerik değişiminde değiştiği için tarayıcı yeni sw.js'i görür ve güncellemeyi indirir.
const VERSION = '__VERSION__';
const FILES = __FILES__;
const PREFIX = 'demirsafak-';
const CACHE = `${PREFIX}${VERSION}`;
// Yazı tipleri sürümden bağımsız: her güncellemede yeniden inmesin
const FONT_CACHE = `${PREFIX}fonts`;
const FONT_HOST = /^fonts\.(googleapis|gstatic)\.com$/;
const INDEX = 'index.html';

// Kurulum: oyunun tüm dosyaları. 'no-cache' sunucuya sorar ama tarayıcıda zaten inen dosya için
// 304 alır; böylece ilk açılışta ~15 MB iki kez inmez ve bayat HTTP önbelleği de alınmaz.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'no-cache' })))));
});

// Etkinleşme: eski sürümlerin önbelleklerini sil, açık sayfaların denetimini hemen al
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Yeni sürüm kendiliğinden devreye girmez: oyun ortasında eski sayfa yeni dosyalarla karışmasın.
// Oyuncu menüde "Güncelle"ye basınca sayfa bu mesajı yollar.
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  else if (e.data === 'version' && e.source) e.source.postMessage({ version: VERSION });
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(sameOrigin(req));
  else if (FONT_HOST.test(url.hostname)) e.respondWith(font(req));
});

// Önce önbellek: oyun çevrimdışı ve hızlı açılır. Sayfa gezintisi (adres çubuğu, ana ekran simgesi)
// her zaman önbellekteki index.html'e düşer. Listede olmayan dosya ağdan gelir.
async function sameOrigin(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === 'navigate') {
    const index = await c.match(INDEX);
    if (index) return index;
  }
  return fetch(req);
}

// Yazı tipleri: eldeki kopyayı hemen ver, arkada yenile. Ağ da kopya da yoksa stil sayfası boş döner
// (hata yerine: sayfa sessizce yedek yazı tiplerini kullanır), yazı tipi dosyası ise ağ hatası
async function font(req) {
  const c = await caches.open(FONT_CACHE);
  const hit = await c.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res.ok) c.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  const res = await net;
  if (res) return res;
  return req.destination === 'style' ? new Response('', { headers: { 'content-type': 'text/css' } }) : Response.error();
}
