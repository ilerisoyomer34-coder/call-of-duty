// Yüklenebilir uygulama (PWA): hizmet çalışanı kaydı, menüdeki "Uygulama olarak yükle" düğmesi ve
// "yeni sürüm hazır" satırı. Yalnız PWA sürümünde çalışır (sayfada manifest bağlantısı var ve sayfa
// http(s) üzerinden açılmış); bağımsız dosya (file://) ve Artifact sürümünde hiçbir şey yapmaz.
import { PWA } from './config.js';

const $ = (id) => document.getElementById(id);

export function pwaAvailable() {
  return 'serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !!document.querySelector('link[rel="manifest"]');
}

// iOS Safari 'beforeinstallprompt' vermez: yükleme elle, Paylaş menüsünden yapılır
function isIos() {
  const ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isInstalled() {
  return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
}

// Açılışın başında çağrılır: 'beforeinstallprompt' açılış sürerken gelebilir, kaçmasın.
// Hizmet çalışanı ise açılış bitince kaydedilir (register): oyunun kendi indirmeleri önce biter,
// önbelleğe alma sonra tarayıcı önbelleğinden 304'le hızlı geçer.
export function setupPwa() {
  if (!pwaAvailable()) return null;
  const btn = $('btnInstall');
  const line = $('pwaStatus');
  const lineText = $('pwaStatusText');
  const updBtn = $('btnPwaUpdate');
  const P = {
    registration: null,
    deferred: null, // saklanan yükleme istemi
    state: 'idle', // idle | installing | ready | update | offline | installed
    version: '',
    lastCheck: 0,
    updating: false,
  };

  const show = (state, text, canUpdate = false) => {
    P.state = state;
    if (!line) return;
    line.hidden = !text;
    line.classList.toggle('warn', canUpdate);
    if (lineText) lineText.textContent = text || '';
    if (updBtn) updBtn.hidden = !canUpdate;
  };
  const refresh = () => {
    const reg = P.registration;
    if (reg && reg.waiting && navigator.serviceWorker.controller) show('update', 'Yeni sürüm hazır', true);
    else if (!navigator.onLine) show('offline', 'Çevrimdışısın · oyun cihazdaki kopyadan açıldı');
    else if (navigator.serviceWorker.controller) show('ready', 'Çevrimdışı da oynanabilir');
    else if (reg && reg.installing) show('installing', 'Çevrimdışı oynamak için dosyalar kaydediliyor…');
  };
  P.refresh = refresh;

  const hideInstall = () => {
    if (btn) btn.hidden = true;
  };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    P.deferred = e;
    if (btn) btn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    P.deferred = null;
    hideInstall();
    show('installed', 'Uygulama yüklendi · ana ekrandaki simgeden açabilirsin');
  });
  if (btn && isIos() && !isInstalled()) btn.hidden = false;
  if (btn) {
    btn.addEventListener('click', async () => {
      if (P.deferred) {
        const e = P.deferred;
        P.deferred = null;
        try {
          await e.prompt();
          const choice = await e.userChoice;
          if (choice && choice.outcome === 'accepted') hideInstall();
        } catch {
          /* istem gösterilemedi */
        }
      } else if (isIos()) {
        show('hint', 'Safari’de Paylaş düğmesine, sonra “Ana Ekrana Ekle”ye dokun');
      }
    });
  }
  if (updBtn) {
    updBtn.addEventListener('click', () => {
      const w = P.registration && P.registration.waiting;
      if (!w) return;
      P.updating = true;
      show('update', 'Güncelleniyor…');
      w.postMessage('skipWaiting');
    });
  }
  // Denetleyici yalnız oyuncu "Güncelle"ye bastıysa sayfayı yeniler (ilk kurulumdaki devralma yenilemez)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (P.updating) location.reload();
    else refresh();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.version) P.version = e.data.version;
  });
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);

  P.register = async () => {
    try {
      const reg = await navigator.serviceWorker.register(PWA.swUrl);
      P.registration = reg;
      P.lastCheck = performance.now();
      const watch = (w) => {
        if (!w) return;
        w.addEventListener('statechange', refresh);
      };
      watch(reg.installing);
      reg.addEventListener('updatefound', () => {
        watch(reg.installing);
        refresh();
      });
      refresh();
      if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('version');
      // Oyun dosyaları tarayıcının yer açmak için sildiği önbelleklerden olmasın
      if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
    } catch (err) {
      console.warn('[DemirSafak] hizmet çalışanı kaydedilemedi', err);
    }
    return P.registration;
  };
  // Uygulama uzun süre açık kalırsa yeni sürüm, sekmeye/uygulamaya dönüşte denetlenir
  P.checkUpdate = () => {
    const reg = P.registration;
    if (!reg || performance.now() - P.lastCheck < PWA.updateCheckMin * 60000) return;
    P.lastCheck = performance.now();
    reg.update().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') P.checkUpdate();
  });
  return P;
}
