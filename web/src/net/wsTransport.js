// Tarayıcı taşıması (shared/net/transport.js arayüzü): ikili WebSocket. Ağ benzetimi (konsol net_fakelag,
// ?netsim=) iki yönde ayrı NetSim kuyruğuyla uygulanır: giden komutlar ve gelen anlık görüntüler gecikir.
import { createStats } from '../../shared/net/transport.js';
import { NetSim } from '../../shared/net/netsim.js';

export class WsTransport {
  constructor(url) {
    this.stats = createStats();
    this.onmessage = null;
    this.onopen = null;
    this.onclose = null;
    this.closed = false;
    const now = () => performance.now();
    this.out = new NetSim({ now, random: Math.random, deliver: (b) => this.rawSend(b) });
    this.inn = new NetSim({ now, random: Math.random, deliver: (b) => this.onmessage?.(b) });
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => this.onopen?.();
    ws.onmessage = (e) => {
      if (!(e.data instanceof ArrayBuffer)) return;
      const b = new Uint8Array(e.data);
      this.stats.bytesIn += b.length;
      this.stats.msgsIn++;
      this.inn.send(b);
    };
    ws.onclose = (e) => {
      this.closed = true;
      this.onclose?.(e.code, e.reason);
    };
    ws.onerror = () => {};
  }

  // Profil: { rtt, jitter, loss } (yarısı her yöne) ya da null
  setNetsim(p) {
    this.out.setProfile(p);
    this.inn.setProfile(p);
  }

  // Her karede çağrılır: vakti gelen gecikmiş iletiler
  pump() {
    this.out.pump();
    this.inn.pump();
  }

  send(bytes) {
    this.out.send(bytes);
  }

  rawSend(bytes) {
    if (this.ws.readyState !== 1) return;
    this.stats.bytesOut += bytes.length;
    this.stats.msgsOut++;
    this.ws.send(bytes);
  }

  get bufferedAmount() {
    return this.ws.bufferedAmount;
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws.close(code, reason);
    } catch {
      /* zaten kapalı */
    }
  }
}
