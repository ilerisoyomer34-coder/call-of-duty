// Saat eşitleme (çok oyunculu belge §6.7). İstemci sunucunun saatini ve tick'ini tahmin eder:
//   - bağlanınca 5 ölçüm 100 ms arayla, sonra saniyede bir
//   - son 8 ölçümün gidiş-dönüşü en kısa yarısının medyanı (gecikme sıçramaları sapmayı bozmaz)
//   - fark 250 ms'yi aşarsa hemen atlar (yeniden eşitleme), küçük farkı yavaşça kapatır (saat geri gitmesin)
// Zaman kaynağı dışarıdan verilir (testlerde sahte saat); DOM, performance.now yok.
import { TICK_RATE } from '../constants.js';

export const CLOCK = {
  burst: 5, // bağlanınca hızlı ölçüm sayısı
  burstMs: 100,
  periodMs: 1000,
  keep: 8,
  snapMs: 250,
  slew: 0.1, // küçük farkın her ölçümde kapatılan payı
};

export class ClockSync {
  /** @param {() => number} now istemci saati (ms) */
  constructor(now) {
    this.now = now;
    this.samples = []; // { rtt, offset }
    this.offset = 0; // sunucu saati − istemci saati (ms)
    this.rtt = 0;
    this.jitter = 0;
    this.synced = false;
    this.sent = 0;
    this.nextAt = -Infinity;
    this.resyncs = 0;
  }

  reset() {
    this.samples.length = 0;
    this.synced = false;
    this.sent = 0;
    this.nextAt = -Infinity;
  }

  // Şimdi ping gönderilmeli mi? (gönderilecekse sayaç ilerler)
  due(t = this.now()) {
    if (t < this.nextAt) return false;
    this.sent++;
    this.nextAt = t + (this.sent < CLOCK.burst ? CLOCK.burstMs : CLOCK.periodMs);
    return true;
  }

  onPong(clientTime, serverTime, t = this.now()) {
    const rtt = Math.max(0, t - clientTime);
    const offset = serverTime + rtt / 2 - t;
    this.samples.push({ rtt, offset });
    if (this.samples.length > CLOCK.keep) this.samples.shift();
    // Gidiş-dönüşü en kısa yarı: kuyruğa takılmış ölçümler dışarıda kalır
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, Math.max(1, Math.ceil(this.samples.length / 2)));
    const offs = best.map((s) => s.offset).sort((a, b) => a - b);
    const med = offs[(offs.length - 1) >> 1];
    const rtts = this.samples.map((s) => s.rtt).sort((a, b) => a - b);
    this.rtt = rtts[(rtts.length - 1) >> 1];
    const mean = rtts.reduce((a, b) => a + b, 0) / rtts.length;
    this.jitter = Math.sqrt(rtts.reduce((a, b) => a + (b - mean) ** 2, 0) / rtts.length);
    if (!this.synced || Math.abs(med - this.offset) > CLOCK.snapMs) {
      if (this.synced) this.resyncs++;
      this.offset = med;
    } else this.offset += (med - this.offset) * CLOCK.slew;
    // Hızlı ölçümler bitince eşitlenmiş sayılır
    if (this.samples.length >= Math.min(CLOCK.burst, 3)) this.synced = true;
  }

  serverTimeNow(t = this.now()) {
    return t + this.offset;
  }

  // Sunucunun şu anki tick'i (kesirli): sunucu tick k'yı oda açıldıktan k / TICK_RATE sn sonra işler
  serverTickNow(t = this.now()) {
    return (this.serverTimeNow(t) * TICK_RATE) / 1000;
  }
}
