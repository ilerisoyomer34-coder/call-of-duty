// Yapay zekâ navigasyonu: ızgara tabanlı yürünebilirlik haritası, A* yol bulma,
// yol düzleştirme ve çarpıştırıcılardan otomatik üretilen siper noktaları.
// Tek oyunculu düşman/dost yapay zekâsı (src/nav.js) ve sunucu botları aynı kodu kullanır: görsel kitaplık yok,
// noktalar dünyanın newVec()'inden (istemcide Vector3). Rastgelelik verilen üreteçten.
import { MinHeap } from './heap.js';
import { clamp } from './math.js';
import { mulberry32 } from './rng.js';

const CS = 1.0; // hücre boyu (m)

export class NavGrid {
  constructor(world, agentRadius = 0.4, random = null) {
    this.world = world;
    this.random = random || mulberry32(1);
    const B = world.bounds;
    this.minx = B.minx;
    this.minz = B.minz;
    this.w = Math.ceil((B.maxx - B.minx) / CS);
    this.h = Math.ceil((B.maxz - B.minz) / CS);
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.cost = new Float32Array(n).fill(1);
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.gen = 1;
    this.build(agentRadius);
    this.covers = [];
    this.coverGrid = new Map();
  }

  build(ar) {
    for (const c of this.world.colliders) this.stampCollider(c, ar);
    // Duvar kenarlarına küçük ek maliyet: düşmanlar duvara sürtünmesin
    const { w, h, blocked, cost } = this;
    for (let z = 1; z < h - 1; z++) {
      for (let x = 1; x < w - 1; x++) {
        const i = z * w + x;
        if (blocked[i]) continue;
        if (blocked[i - 1] || blocked[i + 1] || blocked[i - w] || blocked[i + w]) cost[i] = 1.6;
      }
    }
  }

  stampCollider(c, ar = 0.4, value = 1) {
    if (c.min.y > 1.6 || c.max.y < 0.35) return;
    const x0 = Math.floor((c.min.x - ar - this.minx) / CS);
    const x1 = Math.floor((c.max.x + ar - this.minx) / CS);
    const z0 = Math.floor((c.min.z - ar - this.minz) / CS);
    const z1 = Math.floor((c.max.z + ar - this.minz) / CS);
    for (let z = Math.max(0, z0); z <= Math.min(this.h - 1, z1); z++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        // Hücre merkezi şişirilmiş kutunun içinde mi?
        const cx = this.minx + (x + 0.5) * CS;
        const cz = this.minz + (z + 0.5) * CS;
        if (cx >= c.min.x - ar && cx <= c.max.x + ar && cz >= c.min.z - ar && cz <= c.max.z + ar) {
          this.blocked[z * this.w + x] = value;
        }
      }
    }
  }

  // Patlayan varil gibi kaldırılan engeller için yeniden hesap.
  unstampCollider(c) {
    this.stampCollider(c, 0.4, 0);
    for (const o of this.world.colliders) {
      if (o === c) continue;
      if (o.max.x < c.min.x - 1 || o.min.x > c.max.x + 1 || o.max.z < c.min.z - 1 || o.min.z > c.max.z + 1) continue;
      this.stampCollider(o, 0.4, 1);
    }
  }

  cellOf(x, z) {
    const cx = Math.floor((x - this.minx) / CS);
    const cz = Math.floor((z - this.minz) / CS);
    return [clamp(cx, 0, this.w - 1), clamp(cz, 0, this.h - 1)];
  }

  // Nokta ızgaranın içinde mi? (cellOf kenara kıstırır; harita dışı hedefler buradan ayıklanır)
  inBounds(x, z) {
    return x >= this.minx && z >= this.minz && x < this.minx + this.w * CS && z < this.minz + this.h * CS;
  }

  isWalkable(x, z) {
    const [cx, cz] = this.cellOf(x, z);
    return !this.blocked[cz * this.w + cx];
  }

  nearestFree(cx, cz, maxR = 6) {
    if (!this.blocked[cz * this.w + cx]) return [cx, cz];
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= this.w || z >= this.h) continue;
          if (!this.blocked[z * this.w + x]) return [x, z];
        }
      }
    }
    return null;
  }

  center(cx, cz, out = this.world.newVec()) {
    out.x = this.minx + (cx + 0.5) * CS;
    out.y = 0;
    out.z = this.minz + (cz + 0.5) * CS;
    return out;
  }

  // A* — sonuç düzleştirilmiş ara noktalar (Vector3[]), bulunamazsa null.
  findPath(from, to, maxExpand = 7000) {
    let [sx, sz] = this.cellOf(from.x, from.z);
    let [gx, gz] = this.cellOf(to.x, to.z);
    const s = this.nearestFree(sx, sz, 3);
    const g = this.nearestFree(gx, gz, 6);
    if (!s || !g) return null;
    [sx, sz] = s;
    [gx, gz] = g;
    const W = this.w;
    const start = sz * W + sx;
    const goal = gz * W + gx;
    if (start === goal) return [this.center(gx, gz)];
    const gen = ++this.gen;
    const heap = new MinHeap();
    const hfn = (i) => {
      const x = i % W;
      const z = (i / W) | 0;
      const dx = Math.abs(x - gx);
      const dz = Math.abs(z - gz);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    this.g[start] = 0;
    this.seen[start] = gen;
    this.from[start] = -1;
    heap.push(start, hfn(start));
    let expanded = 0;
    let found = false;
    let bestI = start;
    let bestH = hfn(start);
    const nb = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];
    while (heap.size) {
      const cur = heap.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expanded > maxExpand) break;
      const cx = cur % W;
      const cz = (cur / W) | 0;
      const hc = hfn(cur);
      if (hc < bestH) {
        bestH = hc;
        bestI = cur;
      }
      for (let k = 0; k < 8; k++) {
        const nx = cx + nb[k][0];
        const nz = cz + nb[k][1];
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue;
        const ni = nz * W + nx;
        if (this.blocked[ni] || this.closed[ni] === gen) continue;
        // Çaprazda köşe kesme yok
        if (k >= 4 && (this.blocked[cz * W + nx] || this.blocked[nz * W + cx])) continue;
        const ng = this.g[cur] + nb[k][2] * this.cost[ni];
        if (this.seen[ni] !== gen || ng < this.g[ni]) {
          this.seen[ni] = gen;
          this.g[ni] = ng;
          this.from[ni] = cur;
          heap.push(ni, ng + hfn(ni));
        }
      }
    }
    const end = found ? goal : bestI;
    const cells = [];
    for (let i = end; i !== -1; i = this.from[i]) {
      cells.push(i);
      if (cells.length > 5000) break;
    }
    cells.reverse();
    // Düzleştirme: görüş hattı olan en uzak noktaya atla
    const pts = cells.map((i) => this.center(i % W, (i / W) | 0));
    if (found) {
      const last = pts[pts.length - 1];
      last.x = to.x;
      last.y = 0;
      last.z = to.z;
    }
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.walkableLine(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  }

  walkableLine(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const n = Math.ceil(len / (CS * 0.4));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!this.isWalkable(a.x + dx * t, a.z + dz * t)) return false;
    }
    return true;
  }

  randomPointNear(p, radius, tries = 12) {
    for (let t = 0; t < tries; t++) {
      const a = this.random() * Math.PI * 2;
      const r = Math.sqrt(this.random()) * radius;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (this.isWalkable(x, z)) return this.world.newVec(x, 0, z);
    }
    return null;
  }

  // --- Siper noktaları ---
  generateCovers() {
    const pts = [];
    const add = (x, z, nx, nz, height) => {
      if (!this.isWalkable(x, z)) return;
      for (const q of pts) if ((q.pos.x - x) ** 2 + (q.pos.z - z) ** 2 < 1.1) return;
      pts.push({ pos: this.world.newVec(x, 0, z), normal: this.world.newVec(nx, 0, nz), low: height < 1.5, taken: null });
    };
    for (const c of this.world.colliders) {
      const h = c.max.y - Math.max(0, c.min.y);
      if (c.min.y > 0.3 || h < 0.8 || c.max.y > 12) continue;
      const sx = c.max.x - c.min.x;
      const sz = c.max.z - c.min.z;
      const off = 0.75;
      const sides = [
        // [başlangıç x,z, yön x,z, uzunluk, dış normal x,z]
        [c.min.x, c.min.z - off, 1, 0, sx, 0, -1],
        [c.min.x, c.max.z + off, 1, 0, sx, 0, 1],
        [c.min.x - off, c.min.z, 0, 1, sz, -1, 0],
        [c.max.x + off, c.min.z, 0, 1, sz, 1, 0],
      ];
      for (const [x0, z0, dx, dz, len, onx, onz] of sides) {
        if (len < 0.6) continue;
        const n = Math.max(1, Math.round(len / 1.6));
        for (let k = 0; k < n; k++) {
          const t = ((k + 0.5) / n) * len;
          // normal: siper noktasından engele doğru
          add(x0 + dx * t, z0 + dz * t, -onx, -onz, h);
        }
      }
    }
    this.covers = pts;
    for (const p of pts) {
      const k = `${Math.floor(p.pos.x / 8)},${Math.floor(p.pos.z / 8)}`;
      let arr = this.coverGrid.get(k);
      if (!arr) this.coverGrid.set(k, (arr = []));
      arr.push(p);
    }
  }

  coversNear(p, radius) {
    const out = [];
    const r = Math.ceil(radius / 8);
    const cx = Math.floor(p.x / 8);
    const cz = Math.floor(p.z / 8);
    for (let x = cx - r; x <= cx + r; x++) {
      for (let z = cz - r; z <= cz + r; z++) {
        const arr = this.coverGrid.get(`${x},${z}`);
        if (!arr) continue;
        for (const c of arr) if ((c.pos.x - p.x) ** 2 + (c.pos.y - p.y) ** 2 + (c.pos.z - p.z) ** 2 < radius * radius) out.push(c);
      }
    }
    return out;
  }
}
