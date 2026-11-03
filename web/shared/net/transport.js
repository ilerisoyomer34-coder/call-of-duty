// Taşıma arayüzü (çok oyunculu belge §6.1): oyun kodu WebSocket'i doğrudan görmez.
//   send(bytes: Uint8Array), close(code?, reason?), onmessage(bytes), onclose(code, reason), stats
// Tarayıcı: src/net/wsTransport.js; sunucu: server/game/gateway.js 'ws' bağlantısını sarar;
// testler: memoryPair (aynı süreçte iki uç).

export function createStats() {
  return { bytesIn: 0, bytesOut: 0, msgsIn: 0, msgsOut: 0 };
}

// Aynı süreçte iki uç. auto: iletiler mikro görevle teslim edilir (ağ gibi eşzamansız);
// auto=false iken flush() çağrılana dek bekler (adım adım testler için).
export function memoryPair({ auto = true } = {}) {
  const make = () => ({ onmessage: null, onclose: null, closed: false, stats: createStats(), inbox: [] });
  const a = make();
  const b = make();
  const link = (self, other) => {
    self.send = (bytes) => {
      if (self.closed || other.closed) return;
      const copy = new Uint8Array(bytes);
      self.stats.bytesOut += copy.length;
      self.stats.msgsOut++;
      other.inbox.push(copy);
      if (auto) queueMicrotask(() => other.flush());
    };
    self.flush = () => {
      while (other && self.inbox.length) {
        const m = self.inbox.shift();
        self.stats.bytesIn += m.length;
        self.stats.msgsIn++;
        self.onmessage?.(m);
      }
    };
    self.close = (code = 1000, reason = '') => {
      if (self.closed) return;
      self.closed = true;
      other.closed = true;
      const fire = () => {
        self.onclose?.(code, reason);
        other.onclose?.(code, reason);
      };
      if (auto) queueMicrotask(fire);
      else fire();
    };
  };
  link(a, b);
  link(b, a);
  return [a, b];
}
