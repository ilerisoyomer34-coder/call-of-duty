// Mağaza uygulamasının (Capacitor) oyun tarafı. Android geri tuşu tarayıcı geçmişinde geri gider, geçmiş yoksa
// uygulamayı kapatır. Bu yüzden geçmişe bir "bekçi" kaydı konur: geri tuşu önce onu tüketir (popstate), oyun da
// kendi geri davranışını uygular (görevde duraklat, ekranda geri dön) ve bekçiyi yeniden kurar. Ana menüde bekçi
// kurulmaz, kısa bir uyarı çıkar: APP.backExitSec içinde ikinci basış uygulamadan çıkar.
// Eklenti gerekmez (yerel kod da yok); iOS'ta geri tuşu olmadığından yalnız sınıf ve bildirim kalır.
import { APP } from './config.js';
import { STORE_BUILD, isNative } from './platform.js';

const $ = (id) => document.getElementById(id);

// Geri tuşunun oyundaki karşılığı: tüketildiyse true; false → ana menüdeyiz (uygulamadan çıkılabilir)
export function handleBack(game) {
  const g = game;
  const M = g.menus;
  if (g.console?.open) return true;
  if (g.state === 'playing') {
    // Açık çark ve telsiz satırı önce kapanır; yoksa duraklat
    if (g.wheel?.open) g.wheel.close(false);
    else if (g.chat?.open) g.chat.closeChat();
    else g.pause();
    return true;
  }
  if (g.state === 'paused' && M.current === 'pauseScreen') {
    g.resume();
    return true;
  }
  const cur = M.current;
  if (!cur || cur === 'menu') return cur !== 'menu';
  const screen = $(cur);
  // Ekranın kendi Geri düğmesi (Ayarlar'da "Kaydet ve dön" kaydı da yapar); mağazanınki #stBack
  const back = screen?.querySelector('[data-back], #stBack');
  if (back && !back.disabled) back.click();
  else if (cur === 'loadoutScreen') M.back();
  // Ad ekranı (ilk açılış), ölüm ve zafer ekranında geri tuşu bir şey yapmaz: seçim düğmelerle
  return true;
}

export function setupNative(game) {
  if (!STORE_BUILD && !isNative()) return null;
  document.body.classList.add('app');
  const arm = () => {
    if (!history.state?.dsGuard) history.pushState({ dsGuard: true }, '');
  };
  let exitUntil = 0;
  addEventListener('popstate', () => {
    if (handleBack(game)) {
      arm();
      return;
    }
    // Ana menü: bekçi yok, ikinci geri basışı geçmişsiz sayfada uygulamayı kapatır
    exitUntil = performance.now() + APP.backExitSec * 1000;
    game.menus.notice('Çıkmak için geri tuşuna yeniden bas');
    setTimeout(() => {
      if (performance.now() >= exitUntil) arm();
    }, APP.backExitSec * 1000 + 50);
  });
  arm();
  return { arm, handleBack: () => handleBack(game) };
}
