// İkili yığın (öncelik kuyruğu): A* yol bulma için. İstemci ve sunucu (botlar) aynı kodu kullanır.
export class MinHeap {
  constructor() {
    this.items = [];
    this.keys = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, key) {
    const it = this.items;
    const ks = this.keys;
    let i = it.length;
    it.push(item);
    ks.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (ks[p] <= key) break;
      it[i] = it[p];
      ks[i] = ks[p];
      i = p;
    }
    it[i] = item;
    ks[i] = key;
  }
  pop() {
    const it = this.items;
    const ks = this.keys;
    const top = it[0];
    const lastItem = it.pop();
    const lastKey = ks.pop();
    if (it.length > 0) {
      let i = 0;
      const n = it.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        if (l < n && ks[l] < mk) {
          m = l;
          mk = ks[l];
        }
        if (r < n && ks[r] < mk) {
          m = r;
          mk = ks[r];
        }
        if (m === i) break;
        it[i] = it[m];
        ks[i] = ks[m];
        i = m;
      }
      it[i] = lastItem;
      ks[i] = lastKey;
    }
    return top;
  }
}
