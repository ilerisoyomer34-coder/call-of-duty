// Kayan pencereli hız sınırı (belge §13.3): anahtar başına son pencere içindeki istek zamanları.
// Bellek sınırlı kalsın diye eski anahtarlar düzenli temizlenir.
export class RateLimiter {
  constructor() {
    this.hits = new Map();
  }

  // true: izin var (ve sayıldı); false: sınır aşıldı
  allow(key, max, windowMs, now = Date.now()) {
    let arr = this.hits.get(key);
    if (!arr) {
      arr = [];
      this.hits.set(key, arr);
    }
    while (arr.length && arr[0] <= now - windowMs) arr.shift();
    if (arr.length >= max) return false;
    arr.push(now);
    return true;
  }

  sweep(maxAgeMs, now = Date.now()) {
    for (const [k, arr] of this.hits) if (!arr.length || arr[arr.length - 1] <= now - maxAgeMs) this.hits.delete(k);
  }
}
