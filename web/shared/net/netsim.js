// Ağ koşulu benzetimi (çok oyunculu belge §16.1): gecikme, titreşim ve kayıp. İletilerin sırası korunur
// (WebSocket TCP'dir: kaybolan paket yeniden gönderilir, arkasındakiler bekler). Bu yüzden "kayıp", o iletiyi
// ve arkasındakileri gidiş-dönüş + 200 ms geciktiren bir sıçrama olarak benzetilir.
// İstemci (konsol net_fakelag / ?netsim=) ve sunucu (NETSIM ortam değişkeni) iletiyi bu kuyruktan geçirir.
// Saat ve rastgelelik dışarıdan verilir (testlerde sahte saat ve tohumlu üreteç).

export const LOSS_SPIKE_MS = 200;

export class NetSim {
  /**
   * @param {{ now: () => number, random: () => number, deliver: (msg: any) => void }} o
   */
  constructor(o) {
    this.now = o.now;
    this.random = o.random;
    this.deliver = o.deliver;
    this.lat = 0; // tek yön gecikme (ms)
    this.jitter = 0; // ± ms
    this.loss = 0; // 0–1
    this.queue = []; // { at, msg }
    this.lastAt = 0;
    this.spikes = 0;
  }

  // Profil tek yön değerlerle uygulanır: { rtt, jitter, loss (%) } → yarısı her yöne
  setProfile(p, oneWayShare = 0.5) {
    this.lat = (p?.rtt || 0) * oneWayShare;
    this.jitter = (p?.jitter || 0) * oneWayShare;
    this.loss = (p?.loss || 0) / 100;
  }

  get active() {
    return this.lat > 0 || this.jitter > 0 || this.loss > 0 || this.queue.length > 0;
  }

  send(msg) {
    if (!this.active) {
      this.deliver(msg);
      return;
    }
    const t = this.now();
    let at = t + this.lat + (this.random() * 2 - 1) * this.jitter;
    if (this.loss > 0 && this.random() < this.loss) {
      at += this.lat * 2 + LOSS_SPIKE_MS;
      this.spikes++;
    }
    // Sıra korunur: önceki iletiden önce teslim edilmez
    if (at < this.lastAt) at = this.lastAt;
    this.lastAt = at;
    this.queue.push({ at, msg });
  }

  // Vakti gelenleri teslim et (zamanlayıcıdan ya da her karede çağrılır)
  pump(t = this.now()) {
    let i = 0;
    while (i < this.queue.length && this.queue[i].at <= t) i++;
    if (!i) return;
    const due = this.queue.splice(0, i);
    for (const q of due) this.deliver(q.msg);
  }

  clear() {
    this.queue.length = 0;
    this.lastAt = 0;
  }
}
