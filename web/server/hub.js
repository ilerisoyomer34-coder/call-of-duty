// Çevrim içi bağlantılar (WebSocket) ve anlık olaylar: kim çevrim içi, kimin durumu ne (menü / oyunda),
// arkadaşlara durum değişikliği ve bildirim gönderimi. Bir oyuncunun birden çok sekmesi olabilir.
export class Hub {
  constructor(store) {
    this.store = store;
    this.sockets = new Map(); // oyuncu kimliği → Set<ws>
    this.status = new Map(); // oyuncu kimliği → 'menu' | 'playing'
    this.listeners = { online: [], offline: [] };
  }

  on(evt, fn) {
    this.listeners[evt].push(fn);
  }

  isOnline(id) {
    return (this.sockets.get(id)?.size || 0) > 0;
  }

  // 'offline' | 'menu' | 'playing'
  statusOf(id) {
    return this.isOnline(id) ? this.status.get(id) || 'menu' : 'offline';
  }

  send(id, msg) {
    const set = this.sockets.get(id);
    if (!set) return 0;
    const data = JSON.stringify(msg);
    for (const ws of set) if (ws.readyState === 1) ws.send(data);
    return set.size;
  }

  attach(ws, id) {
    let set = this.sockets.get(id);
    const wasOnline = !!set?.size;
    if (!set) {
      set = new Set();
      this.sockets.set(id, set);
    }
    set.add(ws);
    if (!wasOnline) {
      this.store.touch(id);
      this.broadcastPresence(id);
      for (const fn of this.listeners.online) fn(id);
    }
  }

  detach(ws, id) {
    const set = this.sockets.get(id);
    if (!set) return;
    set.delete(ws);
    if (set.size) return;
    this.sockets.delete(id);
    this.status.delete(id);
    this.store.touch(id);
    this.broadcastPresence(id);
    for (const fn of this.listeners.offline) fn(id);
  }

  setStatus(id, status) {
    if (status !== 'menu' && status !== 'playing') return;
    if (this.status.get(id) === status) return;
    this.status.set(id, status);
    this.broadcastPresence(id);
  }

  // Durum değişikliği yalnız çevrim içi arkadaşlara gider
  broadcastPresence(id) {
    const msg = { t: 'presence', id, status: this.statusOf(id) };
    for (const f of this.store.relations(id).friends) if (this.isOnline(f.id)) this.send(f.id, msg);
  }

  closeAll() {
    for (const set of this.sockets.values()) for (const ws of set) ws.terminate();
    this.sockets.clear();
  }
}
