// Ekonomi (Operasyon Güncellemesi §4.2): kalıcı para birimi Kredi (KR). Tüm kredi hareketleri tek giriş
// noktasından (add / spend) geçer: bakiye asla eksiye düşmez, her hareket kayda ve işlem günlüğüne
// yazılır (geliştirici konsolu: econlog), CREDITS_CHANGED olayı arayüzü günceller.
import { EV } from './events.js';
import STORE from './data/store.json' with { type: 'json' };

// "12.500 KR": Türkçe binlik ayırıcı
export function formatKR(n) {
  return `${Math.round(n).toLocaleString('tr-TR')} ${STORE.currency}`;
}

export class EconomySystem {
  constructor(save, events = null, { logSize = STORE.logSize } = {}) {
    this.save = save;
    this.events = events;
    this.logSize = logSize;
  }

  get credits() {
    return this.save.data.credits;
  }

  get log() {
    return this.save.data.econLog;
  }

  canAfford(amount) {
    return amount >= 0 && this.credits >= amount;
  }

  // Kazanç: eklenen miktarı döndürür (geçersiz ya da eksi miktar 0)
  add(amount, reason = '') {
    const n = Math.round(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    this.apply(n, reason);
    return n;
  }

  // Harcama: yetmiyorsa hiçbir şey değişmez, false döner
  spend(amount, reason = '') {
    const n = Math.round(amount);
    if (!Number.isFinite(n) || n < 0 || this.credits < n) return false;
    this.apply(-n, reason);
    return true;
  }

  // Geliştirici konsolu: bakiyeyi doğrudan ayarla
  set(value, reason = 'konsol') {
    const n = Math.max(0, Math.round(value));
    if (!Number.isFinite(n)) return;
    this.apply(n - this.credits, reason);
  }

  apply(delta, reason) {
    this.save.update(
      (d) => {
        d.credits = Math.max(0, d.credits + delta);
        d.econLog.push({ t: Date.now(), delta, reason, balance: d.credits });
        if (d.econLog.length > this.logSize) d.econLog.splice(0, d.econLog.length - this.logSize);
      },
      { now: true }
    );
    this.events?.emit(EV.CREDITS_CHANGED, { credits: this.credits, delta, reason });
  }
}
