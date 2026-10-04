// Harita yapı takımı: tüm haritaların ortak kullandığı kutu tabanlı yapı yardımcıları.
// Her yardımcı görseli malzemeye göre birleştirilmiş geometriye, çarpışmayı AABB'ye ekler (world.js).
// Yeni harita = bu yardımcılarla kurulan yeni bir dosya; oyun kodu değişmez.
import * as THREE from 'three';

export const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);

// from noktasından to noktasına bakan yön (oyun yönü: 0 = -Z, artınca sola döner). Mevzi yönü için
export const aim = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

// Ağır makineli mevzi tanımı: konum, baktığı nokta, görev grubu (nişancı o grubun düşmanı sayılır)
export const nest = (x, z, lookX, lookZ, group) => ({ pos: V(x, z), yaw: aim(V(x, z), V(lookX, lookZ)), group });

export function mulberry(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Yapı yardımcıları ---
// Açıklıklı duvar. axis 'x': x0→x1 boyunca, sabit z; axis 'z': z0→z1 boyunca, sabit x.
// openings: [{at (duvar merkezinden), width, type:'door'|'window'|'gap'}] — 'gap': gedik ya da mazgal
// (sill: alt kenar, top: üst kenar yüksekliği; verilmeyen taraf açık kalır)
export function wall(W, axis, a0, a1, fixed, h, t, mat, surface, openings = []) {
  // Açıklık duvarın dışına taşmasın (yıkık binada duvar parçalara bölünür, açıklık iki parçaya düşebilir)
  const ops = openings
    .map((o) => {
      const mid = (a0 + a1) / 2 + o.at;
      return { ...o, a: Math.max(a0, mid - o.width / 2), b: Math.min(a1, mid + o.width / 2) };
    })
    .filter((o) => o.b - o.a > 0.05)
    .sort((p, q) => p.a - q.a);
  let cur = a0;
  const seg = (s, e, y0, y1) => {
    if (e - s < 0.02 || y1 - y0 < 0.02) return;
    const c = (s + e) / 2;
    const len = e - s;
    if (axis === 'x') W.block(c, y0, fixed, len, y1 - y0, t, mat, surface);
    else W.block(fixed, y0, c, t, y1 - y0, len, mat, surface);
  };
  for (const o of ops) {
    seg(cur, o.a, 0, h);
    if (o.type === 'door') seg(o.a, o.b, 2.35, h);
    else if (o.type === 'window') {
      seg(o.a, o.b, 0, 1.05);
      seg(o.a, o.b, 2.0, h);
    } else if (o.type === 'gap') {
      if (o.sill) seg(o.a, o.b, 0, o.sill);
      if (o.top) seg(o.a, o.b, o.top, h);
    }
    cur = o.b;
  }
  seg(cur, a1, 0, h);
}

export function house(W, cx, cz, w, d, h, mat, ops = {}, opts = {}) {
  const t = opts.t || 0.3;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  wall(W, 'x', x0, x1, z0 + t / 2, h, t, mat, 'concrete', ops.n);
  wall(W, 'x', x0, x1, z1 - t / 2, h, t, mat, 'concrete', ops.s);
  wall(W, 'z', z0 + t, z1 - t, x0 + t / 2, h, t, mat, 'concrete', ops.w);
  wall(W, 'z', z0 + t, z1 - t, x1 - t / 2, h, t, mat, 'concrete', ops.e);
  if (opts.roof !== false) {
    W.block(cx, h, cz, w + 0.3, 0.25, d + 0.3, opts.roofMat || 'concreteDark', 'concrete');
    // Korkuluk
    const ph = 0.45;
    W.block(cx, h + 0.25, z0 - 0.1, w + 0.3, ph, 0.2, mat, 'concrete');
    W.block(cx, h + 0.25, z1 + 0.1, w + 0.3, ph, 0.2, mat, 'concrete');
    W.block(x0 - 0.1, h + 0.25, cz, 0.2, ph, d + 0.1, mat, 'concrete');
    W.block(x1 + 0.1, h + 0.25, cz, 0.2, ph, d + 0.1, mat, 'concrete');
  }
  // Zemin döşemesi (görsel)
  W.block(cx, 0, cz, w - 0.1, 0.04, d - 0.1, opts.floor || 'concrete', 'concrete', { collide: false });
}

// Yıkık bina: çatısız, duvar üstleri kırık (parça parça farklı yükseklik), içi molozlu.
// Duvar yükseklikleri seed ile belirlenir: aynı harita her açılışta aynı görünür
export function ruin(W, cx, cz, w, d, h, mat, ops = {}, seed = 1) {
  const rnd = mulberry(seed);
  const t = 0.35;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  const side = (axis, a0, a1, fixed, openings) => {
    // Duvarı 1,5–3 m'lik parçalara böl, her parçaya kırık bir yükseklik ver
    let a = a0;
    while (a < a1 - 0.05) {
      const b = Math.min(a1, a + 1.5 + rnd() * 1.5);
      const hh = h * (0.45 + rnd() * 0.55);
      const segOps = (openings || [])
        .map((o) => ({ ...o, at: o.at + (a0 + a1) / 2 - (a + b) / 2 }))
        .filter((o) => Math.abs(o.at) < (b - a) / 2 + o.width / 2);
      wall(W, axis, a, b, fixed, hh, t, mat, 'concrete', segOps);
      a = b;
    }
  };
  side('x', x0, x1, z0 + t / 2, ops.n);
  side('x', x0, x1, z1 - t / 2, ops.s);
  side('z', z0 + t, z1 - t, x0 + t / 2, ops.w);
  side('z', z0 + t, z1 - t, x1 - t / 2, ops.e);
  W.block(cx, 0, cz, w - 0.1, 0.04, d - 0.1, 'concreteDark', 'concrete', { collide: false });
  // Çökmüş kat döşemesi: bir köşede eğik plaka
  W.box(cx - w * 0.18, 0.9, cz + d * 0.15, w * 0.45, 0.25, d * 0.4, 'concreteDark', 'concrete', { rotY: 0.3, collide: false });
  rubble(W, cx + w * 0.22, cz - d * 0.2, 1.4, seed + 7);
}

// Moloz yığını: birkaç kırık beton parçası (alçak, üstünden görülür, arkasına eğilinir)
export function rubble(W, cx, cz, s = 1.5, seed = 3) {
  const rnd = mulberry(seed);
  for (let i = 0; i < 4; i++) {
    const w = s * (0.5 + rnd() * 0.6);
    const hh = s * (0.25 + rnd() * 0.35);
    W.block(cx + (rnd() - 0.5) * s, 0, cz + (rnd() - 0.5) * s, w, hh, w * (0.6 + rnd() * 0.5), i % 2 ? 'concrete' : 'concreteDark', 'concrete', { rotY: rnd() * 3 });
  }
}

// Konteyner (20 fit). Hazır model yüklendiyse (World.addContainer) görünüm modelden, kutu yalnız çarpıştırıcıdır;
// yoksa (ya da Node'daki çarpışma dünyasında) boyalı kutu. Çarpıştırıcı her durumda aynı çağrı: çarpışma verisi değişmez
export function container(W, cx, cz, alongX, mat, y = 0) {
  const L = 6.06;
  const Wd = 2.44;
  const H = 2.6;
  const w = alongX ? L : Wd;
  const d = alongX ? Wd : L;
  const model = !!W.addContainer?.(cx, y, cz, w, H, d, alongX, mat);
  W.block(cx, y, cz, w, H, d, mat, 'metal', model ? { visible: false } : undefined);
  if (model) return;
  // Kapı çerçevesi detayı
  if (alongX) W.block(cx + L / 2 + 0.02, y + 0.1, cz, 0.06, H - 0.2, Wd - 0.2, 'metalDark', 'metal', { collide: false });
  else W.block(cx, y + 0.1, cz + L / 2 + 0.02, Wd - 0.2, H - 0.2, 0.06, 'metalDark', 'metal', { collide: false });
}

export function sandbags(W, cx, cz, len, alongX, h = 1.05) {
  if (alongX) W.block(cx, 0, cz, len, h, 0.8, 'sandbag', 'sandbag');
  else W.block(cx, 0, cz, 0.8, h, len, 'sandbag', 'sandbag');
}

export function hesco(W, x0, x1, z, alongX = true, tint = 0xd8cfb0) {
  // Büyük tel örgü dolgu bariyerleri
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 1.25));
  for (let i = 0; i < n; i++) {
    const c = x0 + ((i + 0.5) / n) * (x1 - x0);
    if (alongX) W.block(c, 0, z, 1.2, 1.5, 1.2, 'sandbag', 'sandbag', { tint });
    else W.block(z, 0, c, 1.2, 1.5, 1.2, 'sandbag', 'sandbag', { tint });
  }
}

export function jersey(W, cx, cz, alongX = true) {
  if (alongX) W.block(cx, 0, cz, 2.8, 0.95, 0.6, 'concrete', 'concrete', { tint: 0xe0dcd0 });
  else W.block(cx, 0, cz, 0.6, 0.95, 2.8, 'concrete', 'concrete', { tint: 0xe0dcd0 });
}

export function crate(W, cx, cz, s = 1.1, y = 0, rot = 0) {
  W.block(cx, y, cz, s, s, s, 'wood', 'wood', { rotY: rot });
}

// Düzensiz kaya: gürültüyle bozulmuş ikosahedron (köşeli, doğal görünüm)
const rockVariants = [];
function rockGeometry(i) {
  if (rockVariants[i]) return rockVariants[i];
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const rnd = mulberry(100 + i * 17);
  const offsets = new Map();
  for (let k = 0; k < p.count; k++) {
    const key = `${p.getX(k).toFixed(3)},${p.getY(k).toFixed(3)},${p.getZ(k).toFixed(3)}`;
    if (!offsets.has(key)) offsets.set(key, 0.72 + rnd() * 0.45);
    const s = offsets.get(key);
    let y = p.getY(k) * s;
    if (y < -0.25) y = -0.25 + (y + 0.25) * 0.15; // taban düz otursun
    p.setXYZ(k, p.getX(k) * s, y + 0.25, p.getZ(k) * s);
  }
  g.computeVertexNormals();
  rockVariants[i] = g;
  return g;
}

export function rock(W, cx, cz, w, h, d, rot = 0, tint = 0xd8c4a8) {
  const v = Math.floor((Math.abs(cx * 7.3 + cz * 3.1)) % 6);
  const m = new THREE.Matrix4()
    .makeTranslation(cx, 0, cz)
    .multiply(new THREE.Matrix4().makeRotationY(rot))
    .multiply(new THREE.Matrix4().makeScale(w / 2, h / 1.25, d / 2));
  W.addGeometry(rockGeometry(v), 'rock', m, tint);
  // Çarpıştırıcı: dönmüş ayak izinin biraz içeride kalan AABB'si
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const hw = ((w / 2) * c + (d / 2) * s) * 0.78;
  const hd = ((w / 2) * s + (d / 2) * c) * 0.78;
  W.addCollider(cx - hw, 0, cz - hd, cx + hw, h * 0.92, cz + hd, 'rock');
}

// Harita kenarını kapatan kaya sırtı (oyuncu dışarı çıkamasın, ufuk doğal görünsün)
export function borderRocks(W, b, seed = 3, tint = 0xd8c4a8, { skip = null, scale = 1 } = {}) {
  const rnd = mulberry(seed);
  for (let z = b.minz + 4; z <= b.maxz - 2; z += 9) {
    if (!skip?.('w', z)) rock(W, b.minx - 3 - rnd() * 3, z, (6 + rnd() * 4) * scale, (4 + rnd() * 4) * scale, 8 + rnd() * 3, rnd(), tint);
    if (!skip?.('e', z)) rock(W, b.maxx + 3 + rnd() * 3, z, (6 + rnd() * 4) * scale, (4 + rnd() * 4) * scale, 8 + rnd() * 3, rnd(), tint);
  }
  for (let x = b.minx + 2; x <= b.maxx - 2; x += 9) {
    if (!skip?.('n', x)) rock(W, x, b.minz - 4 - rnd() * 3, (8 + rnd() * 4) * scale, (5 + rnd() * 5) * scale, 6 + rnd() * 3, rnd(), tint);
    if (!skip?.('s', x)) rock(W, x, b.maxz + 4 + rnd() * 3, (8 + rnd() * 4) * scale, (3 + rnd() * 3) * scale, 6 + rnd() * 3, rnd(), tint);
  }
}

export function tower(W, cx, cz, h = 5.5, roof = 'tarpGreen') {
  const s = 1.6;
  for (const [dx, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) W.block(cx + dx, 0, cz + dz, 0.3, h, 0.3, 'woodDark', 'wood');
  W.block(cx, h, cz, 3.8, 0.3, 3.8, 'wood', 'wood');
  // Korkuluk (kum torbası)
  W.block(cx, h + 0.3, cz - 1.8, 3.8, 1.0, 0.25, 'sandbag', 'sandbag');
  W.block(cx, h + 0.3, cz + 1.8, 3.8, 1.0, 0.25, 'sandbag', 'sandbag');
  W.block(cx - 1.8, h + 0.3, cz, 0.25, 1.0, 3.4, 'sandbag', 'sandbag');
  W.block(cx + 1.8, h + 0.3, cz, 0.25, 1.0, 3.4, 'sandbag', 'sandbag');
  for (const [dx, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) W.block(cx + dx, h + 1.3, cz + dz, 0.15, 1.6, 0.15, 'woodDark', 'wood', { collide: false });
  W.block(cx, h + 2.9, cz, 4.2, 0.15, 4.2, roof, 'wood', { collide: false });
  // Çapraz destekler (görsel)
  W.box(cx, h / 2, cz - s, 0.12, h * 1.05, 0.12, 'woodDark', 'wood', { collide: false, rotY: 0 });
}

export function truck(W, cx, cz, rot, burnt = false, body = 'olive') {
  const b = burnt ? 'burnt' : body;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const at = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  let [x, z] = at(0, -2.2);
  W.block(x, 0.5, z, 2.3, 1.6, 2.0, b, 'metal', { rotY: rot });
  [x, z] = at(0, 1.0);
  W.block(x, 0.5, z, 2.4, 1.1, 4.4, b, 'metal', { rotY: rot });
  [x, z] = at(0, 1.0);
  W.block(x, 1.6, z, 2.4, 1.4, 4.4, burnt ? 'burnt' : 'tarpGreen', 'metal', { rotY: rot, collide: !burnt });
  for (const [lx, lz] of [[-1.1, -2.2], [1.1, -2.2], [-1.1, 1.8], [1.1, 1.8]]) {
    [x, z] = at(lx, lz);
    W.block(x, 0, z, 0.35, 0.9, 0.9, 'tire', 'metal', { rotY: rot, collide: false });
  }
}

export function car(W, cx, cz, rot, mat = 'burnt') {
  W.block(cx, 0.25, cz, 1.9, 0.9, 4.3, mat, 'metal', { rotY: rot });
  W.block(cx, 1.15, cz, 1.7, 0.6, 2.2, mat, 'metal', { rotY: rot, collide: false });
  W.block(cx, 0, cz, 2.0, 0.35, 3.8, 'tire', 'metal', { rotY: rot, collide: false });
}

export function stall(W, cx, cz) {
  W.block(cx, 0, cz, 3, 1.0, 1.1, 'wood', 'wood');
  for (const [dx, dz] of [[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.8], [1.4, 0.8]]) W.block(cx + dx, 0, cz + dz, 0.12, 2.5, 0.12, 'woodDark', 'wood', { collide: false });
  W.block(cx, 2.5, cz, 3.4, 0.06, 2.2, 'tarpRed', 'wood', { collide: false });
  crate(W, cx - 0.8, cz - 1.2, 0.6);
}

// Ağaçlar: hazır çam modeli yüklendiyse (World.addTree) tüm ağaçlar onunla çizilir; yoksa (ya da Node'daki
// çarpışma dünyasında) prosedürel ağaç. Gövde kutusu her durumda aynı: çarpışma verisi değişmez
export function palm(W, cx, cz, h = 6) {
  W.addCollider(cx - 0.2, 0, cz - 0.2, cx + 0.2, h, cz + 0.2, 'wood');
  if (W.addTree?.(cx, cz, h)) return;
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, h, 7);
  W.addGeometry(trunk, 'woodDark', new THREE.Matrix4().makeTranslation(cx, h / 2, cz));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.BoxGeometry(0.5, 0.05, 2.6);
    const m = new THREE.Matrix4()
      .makeTranslation(cx, h, cz)
      .multiply(new THREE.Matrix4().makeRotationY(a))
      .multiply(new THREE.Matrix4().makeRotationX(0.45))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.2));
    W.addGeometry(leaf, 'tarpGreen', m, 0x6d8a3a);
  }
}

// Çam ağacı: gövde + üç kat koni; kar haritasında tepeler beyazlatılır
const pineCones = [new THREE.ConeGeometry(1.9, 2.6, 8), new THREE.ConeGeometry(1.45, 2.3, 8), new THREE.ConeGeometry(0.95, 2.0, 8)];
const pineTrunk = new THREE.CylinderGeometry(0.14, 0.22, 1, 6);
export function pine(W, cx, cz, h = 7, snowy = false) {
  const k = h / 7;
  W.addCollider(cx - 0.25 * k, 0, cz - 0.25 * k, cx + 0.25 * k, h, cz + 0.25 * k, 'wood');
  if (W.addTree?.(cx, cz, h, { snowy })) return;
  W.addGeometry(pineTrunk, 'woodDark', new THREE.Matrix4().makeTranslation(cx, h * 0.25, cz).multiply(new THREE.Matrix4().makeScale(k, h * 0.5, k)));
  const ys = [0.42, 0.62, 0.8];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Matrix4().makeTranslation(cx, h * ys[i], cz).multiply(new THREE.Matrix4().makeScale(k, k, k));
    W.addGeometry(pineCones[i], 'pine', m, snowy && i === 2 ? 0xdfe8ee : snowy ? 0x9fb3aa : null);
  }
}

// Silindir tank (yakıt/depolama). tint: gövde rengi
export function fuelTank(W, cx, cz, r = 2.2, h = 3.4, tint = 0xd9d4c7) {
  const g = new THREE.CylinderGeometry(r, r, h, 16);
  W.addGeometry(g, 'metal', new THREE.Matrix4().makeTranslation(cx, h / 2, cz), tint);
  const top = new THREE.CylinderGeometry(r * 0.95, r, 0.4, 16);
  W.addGeometry(top, 'metal', new THREE.Matrix4().makeTranslation(cx, h + 0.2, cz), 0xbdb6a6);
  W.addCollider(cx - r * 0.85, 0, cz - r * 0.85, cx + r * 0.85, h + 0.4, cz + r * 0.85, 'metal');
  W.addCollider(cx - r, 0, cz - r * 0.4, cx + r, h, cz + r * 0.4, 'metal');
  W.addCollider(cx - r * 0.4, 0, cz - r, cx + r * 0.4, h, cz + r, 'metal');
}

// Yatay boru hattı (x ya da z boyunca), destek ayaklarıyla. Alçak borular siper, yüksekler köprü olur
const pipeGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
export function pipe(W, axis, a0, a1, fixed, y, r = 0.35, mat = 'steelPipe') {
  const len = Math.abs(a1 - a0);
  const mid = (a0 + a1) / 2;
  const m = new THREE.Matrix4();
  if (axis === 'x') m.makeTranslation(mid, y, fixed).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  else m.makeTranslation(fixed, y, mid).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  m.multiply(new THREE.Matrix4().makeScale(r, len, r));
  W.addGeometry(pipeGeo, mat, m);
  if (axis === 'x') W.addCollider(Math.min(a0, a1), y - r, fixed - r, Math.max(a0, a1), y + r, fixed + r, 'metal');
  else W.addCollider(fixed - r, y - r, Math.min(a0, a1), fixed + r, y + r, Math.max(a0, a1), 'metal');
  // Destekler (4 m'de bir)
  if (y - r > 0.3) {
    const n = Math.max(2, Math.round(len / 4) + 1);
    for (let i = 0; i < n; i++) {
      const a = Math.min(a0, a1) + (i / (n - 1)) * len;
      if (axis === 'x') W.block(a, 0, fixed, 0.2, y - r, 0.2, 'metalDark', 'metal');
      else W.block(fixed, 0, a, 0.2, y - r, 0.2, 'metalDark', 'metal');
    }
  }
}

// Lamba direği: ışık kaynağı değil, ışımalı başlık (ışık sayısı sabit kalmalı; bkz. CLAUDE.md)
export function lampPost(W, cx, cz, h = 6, rotY = 0) {
  W.block(cx, 0, cz, 0.18, h, 0.18, 'metalDark', 'metal');
  const ax = Math.sin(rotY);
  const az = Math.cos(rotY);
  W.box(cx + ax * 0.6, h, cz + az * 0.6, 0.12, 0.12, 1.3, 'metalDark', 'metal', { collide: false, rotY });
  W.box(cx + ax * 1.15, h - 0.12, cz + az * 1.15, 0.45, 0.14, 0.3, 'lampGlow', 'metal', { collide: false, rotY });
}

// Liman vinci: dört ayak, kiriş ve uzanan kol (çarpışma yalnızca ayaklarda)
export function crane(W, cx, cz, rotY = 0, h = 16) {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const at = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  for (const [lx, lz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
    const [x, z] = at(lx, lz);
    W.block(x, 0, z, 0.8, h, 0.8, 'craneYellow', 'metal');
  }
  let [x, z] = at(0, -3);
  W.box(x, h + 0.5, z, 9, 1, 0.9, 'craneYellow', 'metal', { collide: false, rotY });
  [x, z] = at(0, 3);
  W.box(x, h + 0.5, z, 9, 1, 0.9, 'craneYellow', 'metal', { collide: false, rotY });
  [x, z] = at(0, -6);
  W.box(x, h + 1.4, z, 1.2, 1, 24, 'craneYellow', 'metal', { collide: false, rotY });
  [x, z] = at(0, -1);
  W.box(x, h + 2.6, z, 3, 2.2, 3, 'metalDark', 'metal', { collide: false, rotY });
}

// Yanaşmış gemi gövdesi: rıhtım boyunca yüksek bir duvar (siluet + kenar)
export function shipHull(W, cx, cz, len, rotY = 0) {
  W.box(cx, 3.2, cz, 11, 7.6, len, 'hullRed', 'metal', { rotY });
  W.box(cx, 7.4, cz, 11.4, 0.8, len + 0.4, 'metalDark', 'metal', { rotY, collide: false });
  W.box(cx, 10.5, cz + len * 0.28 * Math.cos(rotY), 8, 5.5, 9, 'plasterWhite', 'metal', { rotY, collide: false });
}

// Beton sığınak: kalın duvarlı, önünde mazgal açıklığı olan kutu; üstü kar/kum ile örtülür
export function bunker(W, cx, cz, w, d, opts = {}) {
  const h = opts.h || 2.6;
  const t = 0.6;
  const front = opts.front ?? 's';
  const ops = { n: [], s: [], e: [], w: [] };
  // Mazgal (göğüs hizasında geniş, alçak pencere) ve arka kapı
  ops[front] = [{ at: 0, width: (front === 'n' || front === 's' ? w : d) * 0.55, type: 'gap', sill: 1.0, top: 1.75 }];
  const back = { n: 's', s: 'n', e: 'w', w: 'e' }[front];
  ops[back] = [{ at: (back === 'n' || back === 's' ? w : d) * 0.25, width: 2.4, type: 'door' }];
  house(W, cx, cz, w, d, h, 'concrete', ops, { t, roofMat: opts.roofMat || 'concreteDark', floor: 'concreteDark' });
}

// Uzak ufuk: tepe/dağ konileri ve alçak höyükler (çarpışmasız). opts: malzeme, renk, yarıçap
export function horizon(W, opts = {}) {
  const { seed = 7, n = 46, r0 = 190, r1 = 90, h0 = 14, h1 = 30, mat = 'sand', tint = 0xe0c9a0, rockTint = 0xa08a70, mounds = true, moundMat = mat, moundTint = 0xe8d2a8, inner = [85, 125], peak = 1 } = opts;
  const rnd = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = r0 + rnd() * r1;
    // skip: bu açı aralığı boş kalır (ör. limanın deniz tarafı). Açı: x = cos, z = sin
    if (opts.skip && Math.cos(a - opts.skip[0]) > Math.cos(opts.skip[1])) continue;
    const h = (h0 + rnd() * h1) * peak;
    const g = new THREE.ConeGeometry(40 + rnd() * 40, h, 7, 1);
    g.scale(1, 1, 0.6 + rnd() * 0.6);
    const m = new THREE.Matrix4().makeTranslation(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r).multiply(new THREE.Matrix4().makeRotationY(rnd() * 6));
    W.addGeometry(g, i % 3 === 0 ? 'rock' : mat, m, i % 3 === 0 ? rockTint : tint);
  }
  if (!mounds) return;
  for (let i = 0; i < 22; i++) {
    const x = (rnd() - 0.5) * 300;
    const z = (rnd() - 0.5) * 360;
    if (Math.abs(x) < inner[0] && Math.abs(z) < inner[1]) continue;
    const g = new THREE.SphereGeometry(12 + rnd() * 16, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1.6, 0.22 + rnd() * 0.15, 1);
    W.addGeometry(g, moundMat, new THREE.Matrix4().makeTranslation(x, -0.5, z), moundTint);
  }
}

// Uzak şehir silueti: yüksek, çarpışmasız bloklar (x0..x1, z0..z1 bandında)
export function skyline(W, x0, x1, z0, z1, n, seed = 11, tint = 0x5a5654, h0 = 18, h1 = 40) {
  const rnd = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const w = 12 + rnd() * 18;
    const d = 12 + rnd() * 18;
    const h = h0 + rnd() * h1;
    W.block(x0 + rnd() * (x1 - x0), -1, z0 + rnd() * (z1 - z0), w, h, d, 'concreteDark', 'concrete', { collide: false, tint });
  }
}

// Bomba çukuru: koyu yanık leke + kenarında toprak/moloz halkası (üzerinden geçilir)
export function crater(W, cx, cz, r = 2.5, mat = 'dirt') {
  const g = new THREE.CylinderGeometry(r, r * 1.05, 0.04, 14);
  W.addGeometry(g, 'burnt', new THREE.Matrix4().makeTranslation(cx, 0.02, cz), 0x2a2622);
  const ring = new THREE.TorusGeometry(r, 0.35, 5, 14);
  ring.rotateX(Math.PI / 2);
  ring.scale(1, 0.6, 1);
  W.addGeometry(ring, mat, new THREE.Matrix4().makeTranslation(cx, 0.05, cz), 0x9a8e80);
}

// Kar yığını: alçak, yayvan beyaz tümsek (diz boyu siper)
const moundGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
export function snowbank(W, cx, cz, w, d, h = 0.8, rot = 0) {
  const m = new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(rot)).multiply(new THREE.Matrix4().makeScale(w / 2, h, d / 2));
  W.addGeometry(moundGeo, 'snow', m, 0xf4f8fc);
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const hw = ((w / 2) * c + (d / 2) * s) * 0.7;
  const hd = ((w / 2) * s + (d / 2) * c) * 0.7;
  W.addCollider(cx - hw, 0, cz - hd, cx + hw, h * 0.85, cz + hd, 'sand');
}

// Yol çizgisi (kesikli boya)
export function roadLines(W, x, z0, z1, alongZ = true, tint = 0xe8e0c8) {
  for (let z = Math.min(z0, z1); z < Math.max(z0, z1); z += 6) {
    if (alongZ) W.block(x, 0.005, z + 1.5, 0.18, 0.01, 3, 'paint', 'concrete', { collide: false, tint });
    else W.block(z + 1.5, 0.005, x, 3, 0.01, 0.18, 'paint', 'concrete', { collide: false, tint });
  }
}

export function ground(W, size = 700, mat = 'sand') {
  W.block(0, -0.02, 0, size, 0.02, size, mat, 'sand', { collide: false, skipBottom: true });
  // Ayak sesi ve mermi tozu: asfaltta sert zemin, karda beyaz toz
  W.floorSurface = mat === 'asphalt' ? 'concrete' : mat === 'snow' ? 'snow' : 'sand';
}

// Helikopter pisti ("H" boyalı)
export function helipad(W, x, z) {
  W.block(x, 0, z, 16, 0.06, 16, 'helipad', 'concrete');
  W.block(x - 2.5, 0.06, z, 0.8, 0.01, 6, 'paint', 'concrete', { collide: false });
  W.block(x + 2.5, 0.06, z, 0.8, 0.01, 6, 'paint', 'concrete', { collide: false });
  W.block(x, 0.06, z, 4.2, 0.01, 0.8, 'paint', 'concrete', { collide: false });
}

// Ağır makineli mevzisi için kum torbası yarım halkası: ön ve yanlar kapalı, arkası açık.
// yaw: mevzinin baktığı yön (0 = -Z). Silah ve nişancıyı görev kurar (mission.spawnNests)
export function nestRing(W, cx, cz, yaw, h = 1.0) {
  const f = [-Math.sin(yaw), -Math.cos(yaw)];
  const r = [Math.cos(yaw), -Math.sin(yaw)];
  const put = (lx, lz, len, rot) => W.box(cx + r[0] * lx + f[0] * lz, h / 2, cz + r[1] * lx + f[1] * lz, len, h, 0.8, 'sandbag', 'sandbag', { rotY: yaw + rot });
  put(0, 1.3, 3.2, 0);
  put(-2.0, 0.3, 2.2, Math.PI / 2 - 0.35);
  put(2.0, 0.3, 2.2, -Math.PI / 2 + 0.35);
}
