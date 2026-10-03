// Statik dünya: kutu çarpıştırıcılar (AABB), ızgara hızlandırması, ışın testi,
// karakter çarpışması ve çizim çağrısını azaltmak için malzemeye göre birleştirilmiş geometri.
import * as THREE from 'three';
import { clamp } from './util.js';

const CELL = 8;
// Zemin kaplamaları gölge düşürmez (gölge haritasında boşa çizilmesin)
const FLAT_MATERIALS = new Set(['sand', 'dirt', 'helipad', 'snow', 'asphalt', 'water']);
const cellKey = (ix, iz) => ((ix + 512) << 10) | (iz + 512);

const FACES = [
  { n: [1, 0, 0], r: [0, 0, -1], u: [0, 1, 0] },
  { n: [-1, 0, 0], r: [0, 0, 1], u: [0, 1, 0] },
  { n: [0, 1, 0], r: [1, 0, 0], u: [0, 0, -1] },
  { n: [0, -1, 0], r: [1, 0, 0], u: [0, 0, 1] },
  { n: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
  { n: [0, 0, -1], r: [-1, 0, 0], u: [0, 1, 0] },
];

class Batch {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  get vertexCount() {
    return this.pos.length / 3;
  }
}

export class World {
  constructor(scene, textures) {
    this.scene = scene;
    this.T = textures;
    this.colliders = [];
    this.grid = new Map();
    this.stamp = 1;
    this.batches = new Map();
    this.materials = this.createMaterials();
    this.roads = []; // {minx,maxx,minz,maxz} — ayak sesi yüzeyi için
    this.bounds = { minx: -80, maxx: 80, minz: -120, maxz: 115 };
    this._q = [];
    this._v = new THREE.Vector3();
    this._losHit = {};
    // Etkin sis bulutları { pos, r, density 0–1 } (grenades.js yönetir): yalnız görüşü keser
    this.smokes = [];
  }

  createMaterials() {
    const T = this.T;
    const M = {};
    const std = (map, color, rough = 0.9, metal = 0, tile = 2) => {
      const m = new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: metal, vertexColors: true });
      m.userData.tile = tile;
      return m;
    };
    M.sand = std(T.sand, 0xffffff, 1, 0, 6);
    M.dirt = std(T.dirt, 0xffffff, 1, 0, 4);
    M.concrete = std(T.concrete, 0xffffff, 0.92, 0, 2.5);
    M.concreteDark = std(T.concrete, 0x8a8680, 0.95, 0, 2.5);
    M.plaster = std(T.plaster, 0xffffff, 0.95, 0, 3);
    M.plasterWhite = std(T.plaster, 0xf2efe6, 0.95, 0, 3);
    M.plasterOchre = std(T.plaster, 0xe0b98a, 0.95, 0, 3);
    M.contRed = std(T.corrugated, 0x8e3b2c, 0.7, 0.35, 2.4);
    M.contBlue = std(T.corrugated, 0x2f5470, 0.7, 0.35, 2.4);
    M.contGreen = std(T.corrugated, 0x4d5d3a, 0.7, 0.35, 2.4);
    M.contOrange = std(T.corrugated, 0xa8622a, 0.7, 0.35, 2.4);
    M.contGrey = std(T.corrugated, 0x7b7f80, 0.7, 0.35, 2.4);
    M.metal = std(T.metal, 0x8a8e90, 0.5, 0.7, 1.5);
    M.metalDark = std(T.metal, 0x3c4042, 0.55, 0.6, 1.5);
    M.olive = std(T.metal, 0x55603f, 0.75, 0.25, 1.5);
    M.rust = std(T.corrugated, 0x6b4a36, 0.85, 0.3, 2);
    M.wood = std(T.wood, 0xffffff, 0.9, 0, 1.4);
    M.woodDark = std(T.wood, 0x7a6048, 0.9, 0, 1.4);
    M.sandbag = std(T.sandbag, 0xffffff, 1, 0, 1.3);
    M.rock = std(T.rock, 0xffffff, 1, 0, 5);
    M.tarpTan = std(T.canvas, 0xb59e76, 0.95, 0, 2);
    M.tarpGreen = std(T.canvas, 0x5b6446, 0.95, 0, 2);
    M.tarpRed = std(T.canvas, 0x8a3a2e, 0.95, 0, 2);
    M.tire = std(T.metal, 0x1d1d1d, 0.95, 0, 1);
    M.glass = new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.15, metalness: 0.6, vertexColors: true });
    M.glass.userData.tile = 1;
    M.burnt = std(T.metal, 0x4d4540, 0.95, 0.2, 1.5);
    M.helipad = std(T.concrete, 0x6d6a64, 0.95, 0, 2.5);
    M.paint = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9, vertexColors: true });
    M.paint.userData.tile = 1;
    // Diğer haritalar (yalnızca kullanılan malzemelerin gölgelendiricisi derlenir: birleştirme boş kalanı atlar)
    M.snow = std(T.snow, 0xffffff, 0.9, 0, 6);
    M.asphalt = std(T.asphalt, 0xffffff, 0.95, 0, 4);
    M.brick = std(T.brick, 0xffffff, 0.95, 0, 2);
    M.pine = std(T.canvas, 0x33503a, 0.95, 0, 2);
    M.steelPipe = std(T.metal, 0x8e9398, 0.45, 0.7, 1);
    M.craneYellow = std(T.metal, 0xd6a02a, 0.6, 0.35, 1.5);
    M.hullRed = std(T.corrugated, 0x7a2e24, 0.7, 0.3, 3);
    M.water = new THREE.MeshStandardMaterial({ color: 0x1c3644, roughness: 0.18, metalness: 0.35, vertexColors: true });
    M.water.userData.tile = 1;
    // Işımalı lamba başlığı: gece haritasında ışık kaynağı eklemeden parlak görünür (ışık sayısı sabit)
    M.lampGlow = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd49a, emissiveIntensity: 3, vertexColors: true });
    M.lampGlow.userData.tile = 1;
    return M;
  }

  batch(matKey) {
    let b = this.batches.get(matKey);
    if (!b) {
      b = new Batch();
      this.batches.set(matKey, b);
    }
    return b;
  }

  // Kutu ekler. Görsel birleştirilir; collide=true ise çarpıştırıcı olur.
  // rotY verilirse görsel döner, çarpıştırıcı dönmüş kutunun AABB'si olur.
  box(cx, cy, cz, w, h, d, mat, surface = 'concrete', opts = {}) {
    const { collide = true, visible = true, rotY = 0, tint = null, uvScale = 1, skipBottom = false } = opts;
    if (visible) this.addBoxGeometry(cx, cy, cz, w, h, d, mat, rotY, tint, uvScale, skipBottom);
    if (!collide) return null;
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
    return this.addCollider(cx - hw, cy - h / 2, cz - hd, cx + hw, cy + h / 2, cz + hd, surface, opts.owner);
  }

  // Tabanı zemin seviyesinde olan kutu (y = taban yüksekliği).
  block(cx, baseY, cz, w, h, d, mat, surface, opts) {
    return this.box(cx, baseY + h / 2, cz, w, h, d, mat, surface, opts);
  }

  addBoxGeometry(cx, cy, cz, w, h, d, mat, rotY = 0, tint = null, uvScale = 1, skipBottom = false) {
    const b = this.batch(mat);
    const tile = (this.materials[mat]?.userData.tile || 2) / uvScale;
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const cr = Math.cos(rotY);
    const sr = Math.sin(rotY);
    const col = tint ? new THREE.Color(tint) : null;
    const cR = col ? col.r : 1;
    const cG = col ? col.g : 1;
    const cB = col ? col.b : 1;
    for (let f = 0; f < 6; f++) {
      if (skipBottom && f === 3) continue;
      const F = FACES[f];
      const n = F.n;
      const r = F.r;
      const u = F.u;
      const hn = Math.abs(n[0]) * hx + Math.abs(n[1]) * hy + Math.abs(n[2]) * hz;
      const hr = Math.abs(r[0]) * hx + Math.abs(r[1]) * hy + Math.abs(r[2]) * hz;
      const hu = Math.abs(u[0]) * hx + Math.abs(u[1]) * hy + Math.abs(u[2]) * hz;
      const base = b.vertexCount;
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      // Dönüşten sonra dünya uzayındaki normal
      const nxw = n[0] * cr + n[2] * sr;
      const nzw = -n[0] * sr + n[2] * cr;
      for (const [sx, sy] of corners) {
        const lx = n[0] * hn + r[0] * hr * sx + u[0] * hu * sy;
        const ly = n[1] * hn + r[1] * hr * sx + u[1] * hu * sy;
        const lz = n[2] * hn + r[2] * hr * sx + u[2] * hu * sy;
        const wx = cx + lx * cr + lz * sr;
        const wy = cy + ly;
        const wz = cz - lx * sr + lz * cr;
        b.pos.push(wx, wy, wz);
        b.nor.push(nxw, n[1], nzw);
        // Dünya uzayında UV: bitişik kutularda dikişsiz döşeme
        const rx = r[0] * cr + r[2] * sr;
        const rz = -r[0] * sr + r[2] * cr;
        const ux = u[0] * cr + u[2] * sr;
        const uz = -u[0] * sr + u[2] * cr;
        b.uv.push((wx * rx + wy * r[1] + wz * rz) / tile, (wx * ux + wy * u[1] + wz * uz) / tile);
        // Basit ortam kapatma: tabana yakın köşeleri hafifçe karart
        const ao = wy < 0.15 ? 0.78 : 1;
        b.col.push(cR * ao, cG * ao, cB * ao);
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // Hazır bir BufferGeometry'yi matrisle dönüştürüp birleştirme kuyruğuna ekler.
  addGeometry(geo, mat, matrix, tint = null) {
    const b = this.batch(mat);
    const g = geo.index ? geo : geo;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const base = b.vertexCount;
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const col = tint ? new THREE.Color(tint) : new THREE.Color(1, 1, 1);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      b.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      b.nor.push(v.x, v.y, v.z);
      b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      b.col.push(col.r, col.g, col.b);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) b.idx.push(base + g.index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) b.idx.push(base + i);
    }
  }

  finalize() {
    this.meshes = [];
    for (const [key, b] of this.batches) {
      if (!b.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.setIndex(b.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.materials[key]);
      mesh.castShadow = !FLAT_MATERIALS.has(key);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.batches.clear();
  }

  // --- Çarpıştırıcılar ---
  addCollider(minx, miny, minz, maxx, maxy, maxz, surface = 'concrete', owner = null) {
    const c = {
      min: new THREE.Vector3(minx, miny, minz),
      max: new THREE.Vector3(maxx, maxy, maxz),
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
  // Dönüş: { dist, point, normal, surface, collider } veya null.
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
    r.point = (r.point || new THREE.Vector3()).copy(o).addScaledVector(d, best);
    r.normal = r.normal || new THREE.Vector3();
    if (nAxis < 0) r.normal.copy(d).negate();
    else r.normal.set(nAxis === 0 ? nSign : 0, nAxis === 1 ? nSign : 0, nAxis === 2 ? nSign : 0);
    if (bestC === 'ground') {
      r.collider = null;
      r.surface = this.groundSurface(r.point.x, r.point.z);
    } else {
      r.collider = bestC;
      r.surface = bestC.surface;
    }
    return r;
  }

  lineOfSight(a, b) {
    const d = this._v.subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
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

  // Dikey silindir olarak karakter hareketi. state: {pos, vel, grounded, height, radius}
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
    const head = feet + st.height;
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
    void head;
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
}
