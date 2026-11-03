// Akıcılık: kare hızı sınırı ve uyarlanır dünya çözünürlüğü. Saf mantık (DOM/THREE yok): tests/framepacing.test.mjs.
// Ayarlar config.js → FRAME.
//  - Sınır: 120/144 Hz ekranda telefonun her kareyi çizmesi pili ve ısıyı artırır, kare süresi dalgalanır. Hedef zaman
//    kare aralığıyla ilerler (ekran yenilemesi sınırın katı değilse de ortalama sınırda kalır).
//  - Uyarlanır çözünürlük ("Dünya çözünürlüğü: Otomatik"): ölçülen kare aralığı hedefi aşınca dünya daha küçük çizilir
//    (eller ve silah hep tam), rahatlayınca geri büyür. Ekran senkronunda kare aralığı yenileme süresinin altına inmez:
//    "boşluk var mı" bilinemediği için hedefi tutan pencereler birikince bir kademe büyütüp denenir; büyütme hedefi
//    bozarsa geri alınır ve bir sonraki deneme giderek seyrekleşir. Küçültmenin kare süresini düşürmediği durumda
//    (işlemci darboğazı: çözünürlük işe yaramaz, yalnız görüntüyü bulanıklaştırır) küçültme geri alınır ve uzun süre
//    denenmez.

// Sınır ayarı → kare/sn (0: sınırsız). 'auto': dokunmatikte FRAME.touchCap, masaüstünde sınırsız
export function resolveFpsCap(setting, isTouch, cfg) {
  if (setting === 'auto' || setting === undefined || setting === null) return isTouch ? cfg.touchCap : 0;
  const n = Number(setting);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Uyarlanır çözünürlüğün hedef kare süresi (ms): sınır varsa o (en çok maxTargetFps), yoksa defaultTargetFps
export function targetFrameMs(cap, cfg) {
  const fps = cap > 0 ? Math.min(cap, cfg.maxTargetFps) : cfg.defaultTargetFps;
  return 1000 / fps;
}

export class FrameLimiter {
  constructor(cfg) {
    this.cfg = cfg;
    this.next = null;
  }

  reset() {
    this.next = null;
  }

  // now: requestAnimationFrame zaman damgası (ms), cap: kare/sn (0 sınırsız) → bu kare işlensin mi
  ready(now, cap) {
    if (!(cap > 0)) {
      this.next = null;
      return true;
    }
    const iv = 1000 / cap;
    if (this.next === null) this.next = now;
    if (now < this.next - this.cfg.capSlackMs) return false;
    // Bir aralıktan çok geride kaldıysa (takılma) birikmiş kareleri arka arkaya çizmeye çalışmaz: sayaç bugünden
    this.next = now - this.next > iv ? now + iv : this.next + iv;
    return true;
  }
}

export class DynamicResolution {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.scale = 1;
    this.sum = 0;
    this.n = 0;
    this.t = 0;
    this.goodWindows = 0;
    this.upBackoff = this.cfg.upAfterWindows;
    this.probe = null; // son değişiklik: { dir: 'down'|'up', avg, from }
    this.downBlocked = 0; // işlemci darboğazında küçültme denenmeyen pencere sayısı
  }

  // Durum değişince (görev başı, duraklatmadan dönüş) ölçüm baştan; ölçek korunur
  restart() {
    this.sum = 0;
    this.n = 0;
    this.t = 0;
    this.goodWindows = 0;
    this.probe = null;
  }

  // ms: gerçek kare aralığı, targetMs: hedef → ölçek değiştiyse true
  sample(ms, targetMs) {
    const C = this.cfg;
    // Takılmalar (yükleme, sekme değişimi, çöp toplama) ortalamayı bozmasın
    if (!(ms > 0) || ms > C.hitchMs) return false;
    this.sum += ms;
    this.n++;
    this.t += ms;
    if (this.t < C.windowMs) return false;
    const avg = this.sum / this.n;
    this.sum = 0;
    this.n = 0;
    this.t = 0;
    if (this.downBlocked > 0) this.downBlocked--;
    const over = avg > targetMs * C.overBudget;
    const probe = this.probe;
    this.probe = null;
    // Son değişikliğin sonucu
    if (probe?.dir === 'down' && avg > probe.avg * (1 - C.minGain)) {
      // Küçültme kare süresini düşürmedi: darboğaz çözünürlük değil, geri al
      this.scale = probe.from;
      this.downBlocked = C.cpuBoundWindows;
      this.goodWindows = 0;
      return true;
    }
    if (probe?.dir === 'up' && over) {
      // Büyütme hedefi bozdu: geri al, sonraki deneme daha seyrek
      this.scale = probe.from;
      this.upBackoff = Math.min(this.upBackoff * 2, C.maxUpAfterWindows);
      this.goodWindows = 0;
      return true;
    }
    if (over) {
      this.goodWindows = 0;
      if (this.downBlocked > 0 || this.scale <= C.min + 1e-6) return false;
      this.probe = { dir: 'down', avg, from: this.scale };
      this.scale = Math.max(C.min, this.scale * C.downStep);
      return true;
    }
    if (this.scale >= 1 - 1e-6) return false;
    if (++this.goodWindows < this.upBackoff) return false;
    this.goodWindows = 0;
    this.probe = { dir: 'up', avg, from: this.scale };
    this.scale = Math.min(1, this.scale * C.upStep);
    return true;
  }
}
