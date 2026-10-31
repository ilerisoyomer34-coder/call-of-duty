// Çarpışma dünyası (belge §5.3): eksen hizalı kutular + y=0 zemin düzlemi, 8 m'lik ızgarada.
// İstemci (src/world.js → World bunu genişletir, görsel ağları ekler) ve sunucu aynı kodu çalıştırır.
// THREE ve DOM yok: vektörler { x, y, z }; istemci newVec()'i THREE.Vector3 döndürecek biçimde ezer.
import { clamp } from './math.js';

const CELL = 8;
const cellKey = (ix, iz) => ((ix + 512) << 10) | (iz + 512);
// Dışa aktarılan çarpışma dosyasının biçim sürümü (shared/maps/*.collision.json)
export const COLLISION_FORMAT = 1;

export class CollisionWorld {
  constructor() {
    this.colliders = [];
    this.grid = new Map();
    this.stamp = 1;
    this.roads = []; // {minx,maxx,minz,maxz} — ayak sesi yüzeyi için
    this.bounds = { minx: -80, maxx: 80, minz: -120, maxz: 115 };
    this.floorSurface = undefined;
    this._q = [];
    this._v = { x: 0, y: 0, z: 0 };
    this._losHit = {};
    // Etkin sis bulutları { pos, r, density 0–1 } (grenades.js yönetir): yalnız görüşü keser
    this.smokes = [];
  }

  // Yeni vektör: ortak kodda düz nesne; istemci THREE.Vector3 verir (hit.point.clone() gibi çağrılar için)
  newVec(x = 0, y = 0, z = 0) {
    return { x, y, z };
  }

  // --- Çarpıştırıcılar ---
  addCollider(minx, miny, minz, maxx, maxy, maxz, surface = 'concrete', owner = null) {
    const c = {
      min: this.newVec(minx, miny, minz),
      max: this.newVec(maxx, maxy, maxz),
      surface,
      owner,
      _s: 0,
      cells: [],
    };
    this.colliders.push(c);
    const ix0 = Math.floor(minx / CELL);
    const ix1 = Math.floor(maxx / CELL);
    const iz0 = Math.floor(minz / CELL);
    const iz1 = Math.floor(maxz / CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = cellKey(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) {
          arr = [];
          this.grid.set(k, arr);
        }
        arr.push(c);
        c.cells.push(k);
      }
    }
    return c;
  }

  // Kutu ekler: görsel (istemcide World çizer; sunucuda ve dışa aktarmada yok) + çarpıştırıcı.
  // Haritalar (src/maps/*.js) yalnız box/block/addGeometry/addCollider kullanır: aynı harita kodu Node'da
  // da çalışır ve aynı çarpıştırıcıları üretir (tools/export-collision.mjs).
  box(cx, cy, cz, w, h, d, mat, surface = 'concrete', opts = {}) {
    const { collide = true, visible = true, rotY = 0, tint = null, uvScale = 1, skipBottom = false } = opts;
    if (visible) this.addBoxGeometry(cx, cy, cz, w, h, d, mat, rotY, tint, uvScale, skipBottom);
    if (!collide) return null;
    return this.addBoxCollider(cx, cy, cz, w, h, d, surface, rotY, opts.owner);
  }

  // Tabanı zemin seviyesinde olan kutu (y = taban yüksekliği).
  block(cx, baseY, cz, w, h, d, mat, surface, opts) {
    return this.box(cx, baseY + h / 2, cz, w, h, d, mat, surface, opts);
  }

  // Görsel kancalar: istemcide World ezer
  addBoxGeometry() {}
  addGeometry() {}
  finalize() {}

  // Merkezi, boyutu ve y ekseni dönüşü verilen kutunun çarpıştırıcısı (dönmüş kutunun AABB'si)
  addBoxCollider(cx, cy, cz, w, h, d, surface = 'concrete', rotY = 0, owner = null) {
    let hw = w / 2;
    let hd = d / 2;
    if (rotY) {
      const c = Math.abs(Math.cos(rotY));
      const s = Math.abs(Math.sin(rotY));
      const nw = hw * c + hd * s;
      const nd = hw * s + hd * c;
      hw = nw;
      hd = nd;
    }
    return this.addCollider(cx - hw, cy - h / 2, cz - hd, cx + hw, cy + h / 2, cz + hd, surface, owner);
  }

  removeCollider(c) {
    for (const k of c.cells) {
      const arr = this.grid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    }
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
    c.cells.length = 0;
  }

  query(minx, minz, maxx, maxz) {
    const out = this._q;
    out.length = 0;
    const s = ++this.stamp;
    const ix0 = Math.floor(minx / CELL);
    const ix1 = Math.floor(maxx / CELL);
    const iz0 = Math.floor(minz / CELL);
    const iz1 = Math.floor(maxz / CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const arr = this.grid.get(cellKey(ix, iz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (c._s === s) continue;
          c._s = s;
          out.push(c);
        }
      }
    }
    return out;
  }

  // Işın testi (zemin düzlemi dahil). dir birim vektör olmalı.
  // Dönüş: { dist, point, normal, surface, collider } veya null. out verilirse yerinde doldurulur.
  raycast(o, d, maxDist, out = null) {
    let best = maxDist;
    let bestC = null;
    let nAxis = -1;
    let nSign = 0;
    // Zemin düzlemi y=0
    if (d.y < -1e-6 && o.y >= 0) {
      const t = -o.y / d.y;
      if (t < best) {
        best = t;
        nAxis = 1;
        nSign = 1;
        bestC = 'ground';
      }
    }
    const s = ++this.stamp;
    let ix = Math.floor(o.x / CELL);
    let iz = Math.floor(o.z / CELL);
    const stepX = d.x > 0 ? 1 : -1;
    const stepZ = d.z > 0 ? 1 : -1;
    const tDX = d.x !== 0 ? Math.abs(CELL / d.x) : Infinity;
    const tDZ = d.z !== 0 ? Math.abs(CELL / d.z) : Infinity;
    let tMX = d.x !== 0 ? (d.x > 0 ? (ix + 1) * CELL - o.x : o.x - ix * CELL) / Math.abs(d.x) : Infinity;
    let tMZ = d.z !== 0 ? (d.z > 0 ? (iz + 1) * CELL - o.z : o.z - iz * CELL) / Math.abs(d.z) : Infinity;
    const invX = 1 / d.x;
    const invY = 1 / d.y;
    const invZ = 1 / d.z;
    let tCell = 0;
    for (let guard = 0; guard < 256; guard++) {
      const arr = this.grid.get(cellKey(ix, iz));
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (c._s === s) continue;
          c._s = s;
          // Slab testi
          let tmin = 0;
          let tmax = best;
          let ax = -1;
          let sg = 0;
          let miss = false;
          // X
          if (d.x === 0) {
            if (o.x < c.min.x || o.x > c.max.x) miss = true;
          } else {
            let t1 = (c.min.x - o.x) * invX;
            let t2 = (c.max.x - o.x) * invX;
            let sgn = -1;
            if (t1 > t2) {
              const tt = t1; t1 = t2; t2 = tt; sgn = 1;
            }
            if (t1 > tmin) { tmin = t1; ax = 0; sg = sgn; }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) miss = true;
          }
          if (miss) continue;
          if (d.y === 0) {
            if (o.y < c.min.y || o.y > c.max.y) continue;
          } else {
            let t1 = (c.min.y - o.y) * invY;
            let t2 = (c.max.y - o.y) * invY;
            let sgn = -1;
            if (t1 > t2) {
              const tt = t1; t1 = t2; t2 = tt; sgn = 1;
            }
            if (t1 > tmin) { tmin = t1; ax = 1; sg = sgn; }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) continue;
          }
          if (d.z === 0) {
            if (o.z < c.min.z || o.z > c.max.z) continue;
          } else {
            let t1 = (c.min.z - o.z) * invZ;
            let t2 = (c.max.z - o.z) * invZ;
            let sgn = -1;
            if (t1 > t2) {
              const tt = t1; t1 = t2; t2 = tt; sgn = 1;
            }
            if (t1 > tmin) { tmin = t1; ax = 2; sg = sgn; }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) continue;
          }
          if (tmin < best) {
            best = tmin;
            bestC = c;
            nAxis = ax;
            nSign = sg;
          }
        }
      }
      if (tMX < tMZ) {
        tCell = tMX;
        tMX += tDX;
        ix += stepX;
      } else {
        tCell = tMZ;
        tMZ += tDZ;
        iz += stepZ;
      }
      if (tCell > best) break;
    }
    if (!bestC) return null;
    const r = out || {};
    r.dist = best;
    const p = (r.point = r.point || this.newVec());
    p.x = o.x + d.x * best;
    p.y = o.y + d.y * best;
    p.z = o.z + d.z * best;
    const n = (r.normal = r.normal || this.newVec());
    if (nAxis < 0) {
      // Işın kutunun içinden başladı: normal ışına karşı
      n.x = -d.x;
      n.y = -d.y;
      n.z = -d.z;
    } else {
      n.x = nAxis === 0 ? nSign : 0;
      n.y = nAxis === 1 ? nSign : 0;
      n.z = nAxis === 2 ? nSign : 0;
    }
    if (bestC === 'ground') {
      r.collider = null;
      r.surface = this.groundSurface(p.x, p.z);
    } else {
      r.collider = bestC;
      r.surface = bestC.surface;
    }
    return r;
  }

  lineOfSight(a, b) {
    const d = this._v;
    d.x = b.x - a.x;
    d.y = b.y - a.y;
    d.z = b.z - a.z;
    const len = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
    if (len < 1e-4) return true;
    // THREE.Vector3.divideScalar ile aynı yuvarlama (1/len ile çarpım)
    const inv = 1 / len;
    d.x *= inv;
    d.y *= inv;
    d.z *= inv;
    return !this.raycast(a, d, len - 0.05, this._losHit);
  }

  // Görüş hattı: duvarlar ve etkin sis bulutları. Sis yalnız görmeyi keser (mermi, patlama ve yol bulma
  // lineOfSight/raycast kullanır); asker ve tank algısı bunu kullanır.
  canSee(a, b) {
    if (this.smokes.length && this.smokeBlocks(a, b)) return false;
    return this.lineOfSight(a, b);
  }

  // Doğru parçası yoğun bir bulutun içinden geçiyor mu? (en yakın nokta kürenin etkin yarıçapında)
  smokeBlocks(a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const len2 = abx * abx + aby * aby + abz * abz || 1;
    for (const s of this.smokes) {
      const r = s.r * s.density;
      if (r <= 0.3) continue;
      const t = Math.max(0, Math.min(1, ((s.pos.x - a.x) * abx + (s.pos.y - a.y) * aby + (s.pos.z - a.z) * abz) / len2));
      const dx = a.x + abx * t - s.pos.x;
      const dy = a.y + aby * t - s.pos.y;
      const dz = a.z + abz * t - s.pos.z;
      if (dx * dx + dy * dy + dz * dz < r * r) return true;
    }
    return false;
  }

  groundSurface(x, z) {
    for (const r of this.roads) {
      if (x >= r.minx && x <= r.maxx && z >= r.minz && z <= r.maxz) return 'sand';
    }
    return this.floorSurface || 'sand';
  }

  // Dikey silindir olarak karakter hareketi. state: {pos, vel, grounded, height, radius, gravity}
  // Dönüş: zemin çarpıştırıcısı (ayak sesi yüzeyi için).
  moveCharacter(st, dt, stepHeight = 0.45) {
    const p = st.pos;
    const r = st.radius;
    // Yatay hareket, büyük adımlarda tünelleme olmasın diye alt adımlara bölünür
    const dx = st.vel.x * dt;
    const dz = st.vel.z * dt;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.8)));
    st.hitWall = false;
    for (let i = 0; i < steps; i++) {
      p.x += dx / steps;
      p.z += dz / steps;
      this.resolveHorizontal(st, stepHeight);
    }
    // Harita sınırları
    const B = this.bounds;
    p.x = clamp(p.x, B.minx + r, B.maxx - r);
    p.z = clamp(p.z, B.minz + r, B.maxz - r);

    // Dikey
    const cands = this.query(p.x - r, p.z - r, p.x + r, p.z + r);
    let groundY = 0;
    let groundC = null;
    let ceiling = Infinity;
    const feet = p.y;
    const rr = r * 0.85;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      const cx = clamp(p.x, c.min.x, c.max.x);
      const cz = clamp(p.z, c.min.z, c.max.z);
      const ddx = p.x - cx;
      const ddz = p.z - cz;
      if (ddx * ddx + ddz * ddz > rr * rr) continue;
      if (c.max.y <= feet + stepHeight + 0.001) {
        if (c.max.y > groundY) {
          groundY = c.max.y;
          groundC = c;
        }
      } else if (c.min.y >= feet + st.height * 0.4 && c.min.y < ceiling) {
        ceiling = c.min.y;
      }
    }
    st.vel.y -= st.gravity * dt;
    let ny = feet + st.vel.y * dt;
    if (ny + st.height > ceiling && st.vel.y > 0) {
      ny = ceiling - st.height;
      st.vel.y = 0;
    }
    const wasGrounded = st.grounded;
    if (ny <= groundY) {
      ny = groundY;
      if (st.vel.y < 0) st.landSpeed = -st.vel.y;
      st.vel.y = 0;
      st.grounded = true;
    } else if (wasGrounded && st.vel.y <= 0 && ny - groundY < stepHeight + 0.05) {
      // Merdiven inerken zemine yapış
      ny = groundY;
      st.vel.y = 0;
      st.grounded = true;
    } else {
      st.grounded = false;
    }
    p.y = ny;
    return groundC;
  }

  resolveHorizontal(st, stepHeight) {
    const p = st.pos;
    const r = st.radius;
    const feet = p.y;
    const head = feet + st.height;
    const cands = this.query(p.x - r - 0.1, p.z - r - 0.1, p.x + r + 0.1, p.z + r + 0.1);
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        if (c.max.y <= feet + stepHeight || c.min.y >= head) continue;
        const cx = clamp(p.x, c.min.x, c.max.x);
        const cz = clamp(p.z, c.min.z, c.max.z);
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        st.hitWall = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = r - d;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
          // Duvara doğru olan hız bileşenini sıfırla (kayma)
          const nx = dx / d;
          const nz = dz / d;
          const vn = st.vel.x * nx + st.vel.z * nz;
          if (vn < 0) {
            st.vel.x -= vn * nx;
            st.vel.z -= vn * nz;
          }
        } else {
          // Merkez kutunun içinde: en kısa eksenden dışarı it
          const l = p.x - c.min.x;
          const rt = c.max.x - p.x;
          const b = p.z - c.min.z;
          const f = c.max.z - p.z;
          const m = Math.min(l, rt, b, f);
          if (m === l) p.x = c.min.x - r;
          else if (m === rt) p.x = c.max.x + r;
          else if (m === b) p.z = c.min.z - r;
          else p.z = c.max.z + r;
        }
      }
    }
  }

  // Ayağa kalkmak için yer var mı?
  canStand(pos, radius, fromH, toH) {
    const cands = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
    for (const c of cands) {
      if (c.min.y >= pos.y + toH || c.max.y <= pos.y + fromH) continue;
      const cx = clamp(pos.x, c.min.x, c.max.x);
      const cz = clamp(pos.z, c.min.z, c.max.z);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      if (dx * dx + dz * dz < radius * radius * 0.8) return false;
    }
    return true;
  }

  // Noktanın bir kutunun içinde olup olmadığı (ör. el bombası sekmesi, siper testi)
  pointInside(p) {
    const cands = this.query(p.x, p.z, p.x, p.z);
    for (const c of cands) {
      if (p.x > c.min.x && p.x < c.max.x && p.y > c.min.y && p.y < c.max.y && p.z > c.min.z && p.z < c.max.z) return c;
    }
    return null;
  }

  // --- Dışa/içe aktarma (shared/maps/<harita>.collision.json; sunucu render olmadan bunu yükler) ---
  // Yalnız sahipsiz (statik) çarpıştırıcılar: tank, mevzi gibi sahipli olanlar oyun mantığıyla kurulur.
  // count verilirse ilk count çarpıştırıcı (haritanın kendisi; görev sonradan sandık, kum torbası ekler).
  // Kutular düz dizi: [minx, miny, minz, maxx, maxy, maxz, yüzeyIndeksi] (dosya küçük kalsın)
  toJSON(map = '', count = this.colliders.length) {
    const surfaces = [];
    const boxes = [];
    const r = (v) => Math.round(v * 1e4) / 1e4;
    for (let i = 0; i < count; i++) {
      const c = this.colliders[i];
      if (c.owner) continue;
      let si = surfaces.indexOf(c.surface);
      if (si < 0) si = surfaces.push(c.surface) - 1;
      boxes.push([r(c.min.x), r(c.min.y), r(c.min.z), r(c.max.x), r(c.max.y), r(c.max.z), si]);
    }
    const data = { map, format: COLLISION_FORMAT, units: 'meter', bounds: { ...this.bounds }, floorSurface: this.floorSurface || 'sand', roads: this.roads.map((q) => ({ ...q })), surfaces, boxes };
    data.hash = collisionHash(data);
    return data;
  }

  static fromJSON(data, into = null) {
    const w = into || new CollisionWorld();
    w.bounds = { ...data.bounds };
    w.floorSurface = data.floorSurface;
    w.roads = (data.roads || []).map((q) => ({ ...q }));
    for (const b of data.boxes) w.addCollider(b[0], b[1], b[2], b[3], b[4], b[5], data.surfaces[b[6]]);
    return w;
  }
}

// Çarpışma verisinin özeti (FNV-1a, 32 bit): dışa aktarılan dosyanın haritayla güncel olup olmadığını denetlemek için
export function collisionHash(data) {
  let h = 0x811c9dc5;
  const s = JSON.stringify([data.bounds, data.floorSurface, data.roads, data.surfaces, data.boxes]);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
