// Harita inşası: "Kızılkum Vadisi" görev haritası ve atış poligonu.
// Tüm yapılar kutulardan kurulur (gri blockout + prosedürel doku); düşman, hedef ve kontrol noktası verileri burada.
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-115 ── sırt ──────────────────────────────
//          [ İNİŞ BÖLGESİ (helipad) ]  ← dalgalar: KB, KD, B, D
//   z=-72  ══════ kuzey duvarı (geçit) ══════
//          [ KOMUTA MERKEZİ ] kule(KN)  garaj  kışla
//   z=-22  ══════ güney duvarı (kapı) ═══════
//          ev ev  pazar  ev ev
//   UÇAKSAVAR-1 (konteyner sahası)   meydan   UÇAKSAVAR-2 (yakıt deposu)
//   z=66   ══ KONTROL NOKTASI (bariyer, kule, kum torbaları) ══
//   z=104  ★ BAŞLANGIÇ (kayalar, hurda araç)
import * as THREE from 'three';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);

// --- Yapı yardımcıları ---
// Açıklıklı duvar. axis 'x': x0→x1 boyunca, sabit z; axis 'z': z0→z1 boyunca, sabit x.
// openings: [{at (duvar merkezinden), width, type:'door'|'window'}]
function wall(W, axis, a0, a1, fixed, h, t, mat, surface, openings = []) {
  const ops = openings
    .map((o) => {
      const mid = (a0 + a1) / 2 + o.at;
      return { ...o, a: mid - o.width / 2, b: mid + o.width / 2 };
    })
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
    }
    cur = o.b;
  }
  seg(cur, a1, 0, h);
}

function house(W, cx, cz, w, d, h, mat, ops = {}, opts = {}) {
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
    W.block(cx, h, cz, w + 0.3, 0.25, d + 0.3, 'concreteDark', 'concrete');
    // Korkuluk
    const ph = 0.45;
    W.block(cx, h + 0.25, z0 - 0.1, w + 0.3, ph, 0.2, mat, 'concrete');
    W.block(cx, h + 0.25, z1 + 0.1, w + 0.3, ph, 0.2, mat, 'concrete');
    W.block(x0 - 0.1, h + 0.25, cz, 0.2, ph, d + 0.1, mat, 'concrete');
    W.block(x1 + 0.1, h + 0.25, cz, 0.2, ph, d + 0.1, mat, 'concrete');
  }
  // Zemin döşemesi (görsel)
  W.block(cx, 0, cz, w - 0.1, 0.04, d - 0.1, 'concrete', 'concrete', { collide: false });
}

function container(W, cx, cz, alongX, mat, y = 0) {
  const L = 6.06;
  const Wd = 2.44;
  const H = 2.6;
  if (alongX) W.block(cx, y, cz, L, H, Wd, mat, 'metal');
  else W.block(cx, y, cz, Wd, H, L, mat, 'metal');
  // Kapı çerçevesi detayı
  if (alongX) W.block(cx + L / 2 + 0.02, y + 0.1, cz, 0.06, H - 0.2, Wd - 0.2, 'metalDark', 'metal', { collide: false });
  else W.block(cx, y + 0.1, cz + L / 2 + 0.02, Wd - 0.2, H - 0.2, 0.06, 'metalDark', 'metal', { collide: false });
}

function sandbags(W, cx, cz, len, alongX, h = 1.05) {
  if (alongX) W.block(cx, 0, cz, len, h, 0.8, 'sandbag', 'sandbag');
  else W.block(cx, 0, cz, 0.8, h, len, 'sandbag', 'sandbag');
}

function hesco(W, x0, x1, z, alongX = true) {
  // Büyük tel örgü dolgu bariyerleri
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 1.25));
  for (let i = 0; i < n; i++) {
    const c = x0 + ((i + 0.5) / n) * (x1 - x0);
    if (alongX) W.block(c, 0, z, 1.2, 1.5, 1.2, 'sandbag', 'sandbag', { tint: 0xd8cfb0 });
    else W.block(z, 0, c, 1.2, 1.5, 1.2, 'sandbag', 'sandbag', { tint: 0xd8cfb0 });
  }
}

function jersey(W, cx, cz, alongX = true) {
  if (alongX) W.block(cx, 0, cz, 2.8, 0.95, 0.6, 'concrete', 'concrete', { tint: 0xe0dcd0 });
  else W.block(cx, 0, cz, 0.6, 0.95, 2.8, 'concrete', 'concrete', { tint: 0xe0dcd0 });
}

function crate(W, cx, cz, s = 1.1, y = 0, rot = 0) {
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

function rock(W, cx, cz, w, h, d, rot = 0) {
  const v = Math.floor((Math.abs(cx * 7.3 + cz * 3.1)) % 6);
  const m = new THREE.Matrix4()
    .makeTranslation(cx, 0, cz)
    .multiply(new THREE.Matrix4().makeRotationY(rot))
    .multiply(new THREE.Matrix4().makeScale(w / 2, h / 1.25, d / 2));
  W.addGeometry(rockGeometry(v), 'rock', m, 0xd8c4a8);
  // Çarpıştırıcı: dönmüş ayak izinin biraz içeride kalan AABB'si
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const hw = ((w / 2) * c + (d / 2) * s) * 0.78;
  const hd = ((w / 2) * s + (d / 2) * c) * 0.78;
  W.addCollider(cx - hw, 0, cz - hd, cx + hw, h * 0.92, cz + hd, 'rock');
}

function tower(W, cx, cz, h = 5.5) {
  const s = 1.6;
  for (const [dx, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) W.block(cx + dx, 0, cz + dz, 0.3, h, 0.3, 'woodDark', 'wood');
  W.block(cx, h, cz, 3.8, 0.3, 3.8, 'wood', 'wood');
  // Korkuluk (kum torbası)
  W.block(cx, h + 0.3, cz - 1.8, 3.8, 1.0, 0.25, 'sandbag', 'sandbag');
  W.block(cx, h + 0.3, cz + 1.8, 3.8, 1.0, 0.25, 'sandbag', 'sandbag');
  W.block(cx - 1.8, h + 0.3, cz, 0.25, 1.0, 3.4, 'sandbag', 'sandbag');
  W.block(cx + 1.8, h + 0.3, cz, 0.25, 1.0, 3.4, 'sandbag', 'sandbag');
  for (const [dx, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) W.block(cx + dx, h + 1.3, cz + dz, 0.15, 1.6, 0.15, 'woodDark', 'wood', { collide: false });
  W.block(cx, h + 2.9, cz, 4.2, 0.15, 4.2, 'tarpGreen', 'wood', { collide: false });
  // Çapraz destekler (görsel)
  W.box(cx, h / 2, cz - s, 0.12, h * 1.05, 0.12, 'woodDark', 'wood', { collide: false, rotY: 0 });
}

function truck(W, cx, cz, rot, burnt = false) {
  const body = burnt ? 'burnt' : 'olive';
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const at = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  let [x, z] = at(0, -2.2);
  W.block(x, 0.5, z, 2.3, 1.6, 2.0, body, 'metal', { rotY: rot });
  [x, z] = at(0, 1.0);
  W.block(x, 0.5, z, 2.4, 1.1, 4.4, body, 'metal', { rotY: rot });
  [x, z] = at(0, 1.0);
  W.block(x, 1.6, z, 2.4, 1.4, 4.4, burnt ? 'burnt' : 'tarpGreen', 'metal', { rotY: rot, collide: !burnt });
  for (const [lx, lz] of [[-1.1, -2.2], [1.1, -2.2], [-1.1, 1.8], [1.1, 1.8]]) {
    [x, z] = at(lx, lz);
    W.block(x, 0, z, 0.35, 0.9, 0.9, 'tire', 'metal', { rotY: rot, collide: false });
  }
}

function car(W, cx, cz, rot) {
  W.block(cx, 0.25, cz, 1.9, 0.9, 4.3, 'burnt', 'metal', { rotY: rot });
  W.block(cx, 1.15, cz, 1.7, 0.6, 2.2, 'burnt', 'metal', { rotY: rot, collide: false });
  W.block(cx, 0, cz, 2.0, 0.35, 3.8, 'tire', 'metal', { rotY: rot, collide: false });
}

function stall(W, cx, cz) {
  W.block(cx, 0, cz, 3, 1.0, 1.1, 'wood', 'wood');
  for (const [dx, dz] of [[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.8], [1.4, 0.8]]) W.block(cx + dx, 0, cz + dz, 0.12, 2.5, 0.12, 'woodDark', 'wood', { collide: false });
  W.block(cx, 2.5, cz, 3.4, 0.06, 2.2, 'tarpRed', 'wood', { collide: false });
  crate(W, cx - 0.8, cz - 1.2, 0.6);
}

function palm(W, cx, cz, h = 6) {
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, h, 7);
  W.addGeometry(trunk, 'woodDark', new THREE.Matrix4().makeTranslation(cx, h / 2, cz));
  W.addCollider(cx - 0.2, 0, cz - 0.2, cx + 0.2, h, cz + 0.2, 'wood');
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

function fuelTank(W, cx, cz, r = 2.2, h = 3.4) {
  const g = new THREE.CylinderGeometry(r, r, h, 16);
  W.addGeometry(g, 'metal', new THREE.Matrix4().makeTranslation(cx, h / 2, cz), 0xd9d4c7);
  const top = new THREE.CylinderGeometry(r * 0.95, r, 0.4, 16);
  W.addGeometry(top, 'metal', new THREE.Matrix4().makeTranslation(cx, h + 0.2, cz), 0xbdb6a6);
  W.addCollider(cx - r * 0.85, 0, cz - r * 0.85, cx + r * 0.85, h + 0.4, cz + r * 0.85, 'metal');
  W.addCollider(cx - r, 0, cz - r * 0.4, cx + r, h, cz + r * 0.4, 'metal');
  W.addCollider(cx - r * 0.4, 0, cz - r, cx + r * 0.4, h, cz + r, 'metal');
}

function dunes(W) {
  // Uzak kum tepeleri ve dağ silüetleri (çarpışmasız)
  const rnd = mulberry(7);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const r = 190 + rnd() * 90;
    const h = 14 + rnd() * 30;
    const g = new THREE.ConeGeometry(40 + rnd() * 40, h, 7, 1);
    g.scale(1, 1, 0.6 + rnd() * 0.6);
    const m = new THREE.Matrix4().makeTranslation(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r).multiply(new THREE.Matrix4().makeRotationY(rnd() * 6));
    W.addGeometry(g, i % 3 === 0 ? 'rock' : 'sand', m, i % 3 === 0 ? 0xa08a70 : 0xe0c9a0);
  }
  for (let i = 0; i < 22; i++) {
    const x = (rnd() - 0.5) * 300;
    const z = (rnd() - 0.5) * 360;
    if (Math.abs(x) < 85 && Math.abs(z) < 125) continue;
    const g = new THREE.SphereGeometry(12 + rnd() * 16, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1.6, 0.22 + rnd() * 0.15, 1);
    W.addGeometry(g, 'sand', new THREE.Matrix4().makeTranslation(x, -0.5, z), 0xe8d2a8);
  }
}

function mulberry(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ground(W, size = 700) {
  W.block(0, -0.02, 0, size, 0.02, size, 'sand', 'sand', { collide: false, skipBottom: true });
}

// ------------------------------------------------------------
// GÖREV HARİTASI
// ------------------------------------------------------------
export function buildMission(W) {
  W.bounds = { minx: -74, maxx: 74, minz: -116, maxz: 110 };
  ground(W);
  dunes(W);
  // Ana yol
  W.block(0, 0, -2, 8, 0.02, 224, 'dirt', 'sand', { collide: false });
  W.block(-40, 0, 20, 34, 0.02, 5, 'dirt', 'sand', { collide: false });
  W.block(40, 0, 16, 34, 0.02, 5, 'dirt', 'sand', { collide: false });
  // Harita kenarı kaya sırtları
  const rnd = mulberry(3);
  for (let z = -112; z <= 108; z += 9) {
    rock(W, -77 - rnd() * 3, z, 6 + rnd() * 4, 4 + rnd() * 4, 8 + rnd() * 3, rnd());
    rock(W, 77 + rnd() * 3, z, 6 + rnd() * 4, 4 + rnd() * 4, 8 + rnd() * 3, rnd());
  }
  for (let x = -72; x <= 72; x += 9) {
    rock(W, x, -120 - rnd() * 3, 8 + rnd() * 4, 5 + rnd() * 5, 6 + rnd() * 3, rnd());
    rock(W, x, 114 + rnd() * 3, 8 + rnd() * 4, 3 + rnd() * 3, 6 + rnd() * 3, rnd());
  }

  // ===== 1) Başlangıç =====
  car(W, -5.5, 95, 0.35);
  rock(W, 8, 99, 3, 1.8, 2.4, 0.3);
  rock(W, -13, 90, 4, 2.2, 3, 1.1);
  rock(W, 13, 85, 2.6, 1.4, 2, 0.7);
  rock(W, -20, 100, 5, 3, 4, 0.2);
  rock(W, 22, 96, 4, 2.6, 3.5, 2.2);
  W.block(6, 0, 89, 5, 1.1, 0.5, 'concrete', 'concrete', { tint: 0xcfc8b8 });
  W.block(-7, 0, 83, 4, 1.2, 0.5, 'concrete', 'concrete', { tint: 0xcfc8b8 });
  W.block(-7.5, 0, 81.2, 0.5, 1.2, 3.1, 'concrete', 'concrete', { tint: 0xcfc8b8 });
  palm(W, -16, 80, 6.5);
  palm(W, 18, 104, 5.5);

  // ===== 2) Kontrol noktası =====
  hesco(W, 9, 32, 66);
  hesco(W, -32, -9, 66);
  // Bariyer kolu
  W.block(-5, 0, 66, 0.3, 1.1, 0.3, 'metal', 'metal');
  W.block(-2.5, 1.0, 66, 5, 0.12, 0.12, 'paint', 'metal', { collide: false, tint: 0xc83a2a });
  jersey(W, -2.5, 76);
  jersey(W, 2.5, 72);
  jersey(W, -2.2, 60);
  // Nöbetçi kulübesi
  house(W, 6.8, 68.5, 3.2, 3.2, 2.7, 'plasterWhite', { w: [{ at: 0, width: 2.0, type: 'door' }], s: [{ at: 0, width: 1.4, type: 'window' }], n: [{ at: 0, width: 1.4, type: 'window' }] });
  // Kum torbası sığınağı (pompalı burada)
  sandbags(W, -10, 60.4, 5, true);
  sandbags(W, -12.9, 62.4, 3.2, false);
  sandbags(W, -7.1, 62.4, 3.2, false);
  crate(W, -10, 62.6, 0.8);
  sandbags(W, 12, 59.5, 4, true);
  sandbags(W, 20, 73, 5, true);
  // Kule
  tower(W, 18, 74);
  // Konteynerler ve çadır
  container(W, -21, 76, true, 'contRed');
  container(W, -25, 70.5, false, 'contBlue');
  container(W, -21, 76, true, 'contGreen', 2.6);
  W.block(-16, 0, 55, 5, 2.4, 4, 'tarpGreen', 'wood');
  W.block(-16, 2.4, 55, 5.3, 0.4, 4.3, 'tarpGreen', 'wood', { collide: false });
  crate(W, -12.8, 54, 1.0);
  crate(W, -12.9, 55.2, 0.8, 0, 0.4);
  crate(W, 26, 60, 1.1);
  crate(W, 26, 60, 0.9, 1.1, 0.3);

  // ===== 3) Köy =====
  house(W, -14, 38, 9, 7, 3.2, 'plaster', {
    e: [{ at: 0, width: 2.0, type: 'door' }],
    n: [{ at: -2, width: 1.4, type: 'window' }, { at: 2, width: 1.4, type: 'window' }],
    s: [{ at: 1.5, width: 1.4, type: 'window' }],
    w: [{ at: 0, width: 2.0, type: 'door' }],
  });
  house(W, -15, 24, 8, 8, 3.4, 'plasterOchre', {
    e: [{ at: -1.5, width: 2.0, type: 'door' }],
    w: [{ at: 1, width: 1.4, type: 'window' }],
    n: [{ at: 0, width: 1.4, type: 'window' }],
    s: [{ at: 0, width: 2.0, type: 'door' }],
  });
  house(W, 14, 40, 10, 7, 3.2, 'plasterWhite', {
    w: [{ at: 1, width: 2.0, type: 'door' }],
    n: [{ at: 0, width: 1.4, type: 'window' }],
    e: [{ at: 0, width: 2.0, type: 'door' }],
    s: [{ at: -2.5, width: 1.4, type: 'window' }, { at: 2.5, width: 1.4, type: 'window' }],
  });
  house(W, 15, 25, 8, 9, 3.4, 'plaster', {
    w: [{ at: 0, width: 2.0, type: 'door' }],
    s: [{ at: 1.5, width: 2.0, type: 'door' }],
    e: [{ at: -2, width: 1.4, type: 'window' }],
  });
  house(W, -28, 45, 7, 6, 3.0, 'plasterWhite', { s: [{ at: 0, width: 2.0, type: 'door' }], e: [{ at: 0, width: 1.4, type: 'window' }] });
  house(W, 29, 42, 7, 7, 3.0, 'plasterOchre', { s: [{ at: 0, width: 2.0, type: 'door' }], w: [{ at: 0, width: 1.4, type: 'window' }] });
  stall(W, -6.3, 31);
  stall(W, 6.3, 34);
  // Meydan
  W.addGeometry(new THREE.CylinderGeometry(1.3, 1.4, 0.9, 14), 'concrete', new THREE.Matrix4().makeTranslation(0, 0.45, 18));
  W.addCollider(-1.2, 0, 16.8, 1.2, 0.9, 19.2, 'concrete');
  car(W, 5.5, 14, 1.3);
  sandbags(W, -5, 12, 3.5, true);
  sandbags(W, 4, 22, 3, true);
  palm(W, -8, 20, 6);
  palm(W, 8, 46, 6.8);
  palm(W, -9, 48, 5.2);
  crate(W, -9.5, 28, 1.0);
  crate(W, 9.8, 30, 0.9, 0, 0.6);

  // Konteyner sahası (Uçaksavar-1)
  container(W, -36, 30, true, 'contRed');
  container(W, -44, 30, true, 'contBlue');
  container(W, -44, 30, true, 'contOrange', 2.6);
  container(W, -36, 12, true, 'contGreen');
  container(W, -52, 20, false, 'contGrey');
  container(W, -52, 20, false, 'contRed', 2.6);
  container(W, -31, 20, false, 'contBlue');
  sandbags(W, -42, 17.2, 4, true);
  sandbags(W, -46.3, 22, 3, false);
  crate(W, -38.5, 25.5, 1.1);
  crate(W, -39.3, 26.4, 0.9, 0, 0.5);
  crate(W, -47, 26, 1.1);

  // Yakıt deposu (Uçaksavar-2)
  fuelTank(W, 47, 23);
  fuelTank(W, 47, 13.5);
  W.block(34, 0, 10, 0.5, 1.3, 10, 'concrete', 'concrete');
  W.block(34, 0, 25, 0.5, 1.3, 8, 'concrete', 'concrete');
  W.block(43, 0, 4.5, 18, 1.3, 0.5, 'concrete', 'concrete');
  truck(W, 38.5, 27, 0.2);
  crate(W, 37, 7, 1.1);
  crate(W, 44.5, 7.3, 1.0, 0, 0.3);
  sandbags(W, 40, 17.5, 3.5, true);

  // ===== 4) Komuta merkezi =====
  const wh = 3.2;
  // Güney duvarı (kapı) ve kuzey duvarı (geçit)
  wall(W, 'x', -32, 32, -22, wh, 0.5, 'concrete', 'concrete', [{ at: 0, width: 7, type: 'door' }]);
  W.block(-3.8, 0, -22, 0.8, 3.8, 0.8, 'concreteDark', 'concrete');
  W.block(3.8, 0, -22, 0.8, 3.8, 0.8, 'concreteDark', 'concrete');
  wall(W, 'x', -32, 32, -72, wh, 0.5, 'concrete', 'concrete', [{ at: 0, width: 6, type: 'door' }]);
  // Batı ve doğu duvarları (gedikli)
  wall(W, 'z', -71.75, -22.25, -32, wh, 0.5, 'concrete', 'concrete', [{ at: -2, width: 3.2, type: 'door' }]);
  wall(W, 'z', -71.75, -22.25, 32, wh, 0.5, 'concrete', 'concrete', [{ at: 8, width: 3.2, type: 'door' }]);
  // Gedik molozları
  W.block(-33.5, 0, -49.6, 2.4, 0.6, 2.4, 'rock', 'rock', { rotY: 0.5 });
  W.block(33.4, 0, -38, 2, 0.5, 2.2, 'rock', 'rock', { rotY: 0.3 });
  // Ana bina
  house(W, 0, -50, 20, 12, 3.6, 'plasterWhite', {
    s: [{ at: 0, width: 2.2, type: 'door' }, { at: -6, width: 1.6, type: 'window' }, { at: 6, width: 1.6, type: 'window' }],
    n: [{ at: 6, width: 2.0, type: 'door' }, { at: -5, width: 1.6, type: 'window' }],
    w: [{ at: 0, width: 1.6, type: 'window' }],
    e: [{ at: 0, width: 2.0, type: 'door' }],
  });
  // İç bölme duvarı
  wall(W, 'z', -55.7, -44.3, -3, 3.6, 0.25, 'plaster', 'concrete', [{ at: 1.5, width: 2.0, type: 'door' }]);
  W.block(-7, 0, -52.5, 2.2, 0.8, 1.0, 'woodDark', 'wood');
  W.block(-9, 0, -46, 1.2, 1.9, 0.5, 'metalDark', 'metal');
  W.block(-5.5, 0, -46, 1.2, 1.9, 0.5, 'metalDark', 'metal');
  W.block(5, 0, -52, 2.5, 0.8, 1.2, 'wood', 'wood');
  crate(W, 8, -46, 1.0);
  crate(W, 8.9, -46.4, 0.8, 0, 0.3);
  // Kışla
  house(W, -20, -35, 10, 6, 3.0, 'plasterOchre', { e: [{ at: 0, width: 2.0, type: 'door' }], s: [{ at: -2, width: 1.4, type: 'window' }, { at: 2, width: 1.4, type: 'window' }] });
  // Garaj
  house(W, 20, -36, 10, 7, 3.4, 'concrete', { s: [{ at: 0, width: 4.5, type: 'door' }], w: [{ at: 0, width: 1.4, type: 'window' }] });
  truck(W, 20, -36.5, 0);
  // Avlu siperleri
  jersey(W, -8, -28);
  jersey(W, 9, -30, false);
  sandbags(W, -12, -40, 4, true);
  sandbags(W, 12, -42, 3.5, true);
  crate(W, -3, -34, 1.1);
  crate(W, 4, -38, 1.1, 0, 0.3);
  truck(W, -10, -62, 1.57);
  tower(W, -26, -66);
  container(W, 24, -64, true, 'contGreen');
  container(W, 24, -58, true, 'contGrey');

  // ===== 5) İniş bölgesi =====
  W.block(0, 0, -95, 16, 0.06, 16, 'helipad', 'concrete');
  // "H" boyası
  W.block(-2.5, 0.06, -95, 0.8, 0.01, 6, 'paint', 'concrete', { collide: false });
  W.block(2.5, 0.06, -95, 0.8, 0.01, 6, 'paint', 'concrete', { collide: false });
  W.block(0, 0.06, -95, 4.2, 0.01, 0.8, 'paint', 'concrete', { collide: false });
  container(W, -16, -88, true, 'contRed');
  container(W, 16, -101, false, 'contBlue');
  sandbags(W, -7, -83, 4, true);
  sandbags(W, 7, -107, 4, true);
  sandbags(W, -12, -104, 3.5, false);
  truck(W, 19, -84, 0.9, true);
  crate(W, 9, -86, 1.1);
  crate(W, -9, -100, 1.1, 0, 0.4);
  rock(W, -30, -95, 4, 2.2, 3, 0.4);
  rock(W, 32, -92, 3.5, 1.8, 3, 1.2);
  rock(W, -40, -108, 5, 2.6, 4, 2);
  rock(W, 44, -108, 4.5, 2.4, 4, 0.3);

  return {
    playerStart: { pos: V(0, 104), yaw: 0 },
    barrels: [V(-14, 68.5), V(-13.3, 69.2), V(10.5, 57.8), V(36.5, 20.5), V(37.2, 21.3), V(-40, 13.8), V(16, -30.5), V(16.8, -31.2), V(-44, 24.5)],
    aaGuns: [
      { id: 'aa1', pos: V(-41, 22.5), yaw: 0.6, label: 'UÇAKSAVAR-1' },
      { id: 'aa2', pos: V(40.5, 12.5), yaw: -0.8, label: 'UÇAKSAVAR-2' },
    ],
    laptop: { pos: V(-7, -52.5, 0.8), yaw: Math.PI },
    ammoCrates: [V(8.6, 64.2), V(-2, 44), V(-8, -41.5), V(-3.5, -86)],
    shotgun: { pos: V(-10, 62.6, 0.8) },
    lz: V(0, -95),
    checkpoints: [
      { pos: V(0, 104), yaw: 0 },
      { pos: V(0, 58), yaw: 0 },
      { pos: V(0, 56), yaw: 0 },
      { pos: V(0, 56), yaw: 0 },
      { pos: V(6, -60), yaw: 0 },
      { pos: V(-2, -88), yaw: 0 },
    ],
    enemies: [
      // Kontrol noktası
      { group: 'outpost', type: 'rifleman', pos: V(-3.2, 64.6), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(3.8, 64.2), yaw: Math.PI - 0.3 },
      { group: 'outpost', type: 'rifleman', pos: V(9, 70), yaw: Math.PI, patrol: [V(9, 71), V(14, 62), V(24, 62)] },
      { group: 'outpost', type: 'rifleman', pos: V(18, 74, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'rifleman', pos: V(-18, 79), yaw: Math.PI, patrol: [V(-18, 79.5), V(-28, 79), V(-28, 64), V(-18, 63)] },
      { group: 'outpost', type: 'rifleman', pos: V(-11.8, 61.5), yaw: Math.PI + 0.4 },
      { group: 'outpost', type: 'shotgunner', pos: V(-18, 51), yaw: Math.PI, patrol: [V(-18, 51.5), V(-6, 51), V(-6, 58)] },
      // Köy
      { group: 'village', type: 'rifleman', pos: V(-2.5, 47), yaw: Math.PI, patrol: [V(-2.5, 48), V(-2.5, 20), V(2.5, 10), V(2.5, 46)] },
      { group: 'village', type: 'rifleman', pos: V(2.5, 26), yaw: 0, patrol: [V(2.5, 26), V(2.5, 50), V(-2.5, 36), V(-2.5, 14)] },
      { group: 'village', type: 'rifleman', pos: V(-15, 38), yaw: -Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(13, 40.5), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(15, 25, 3.65), yaw: Math.PI, stationary: true, elevated: true },
      { group: 'village', type: 'heavy', pos: V(-1, 16), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(-38, 24), yaw: -Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(-46, 16), yaw: 0, patrol: [V(-46, 15.5), V(-34, 16), V(-34, 26), V(-46, 26)] },
      { group: 'village', type: 'shotgunner', pos: V(-40, 27), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(42, 18.5), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(37, 9), yaw: Math.PI / 2, patrol: [V(37, 9), V(44, 9), V(44, 19), V(37, 19)] },
      { group: 'village', type: 'shotgunner', pos: V(44, 24), yaw: Math.PI / 2 },
      // Komuta merkezi
      { group: 'hq', type: 'rifleman', pos: V(-5.5, -20.5), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(5.5, -20.5), yaw: Math.PI },
      { group: 'hq', type: 'sniper', pos: V(-26, -66, 5.8), yaw: Math.PI - 0.5, stationary: true, elevated: true },
      { group: 'hq', type: 'rifleman', pos: V(-12, -28), yaw: 0, patrol: [V(-12, -28), V(12, -27), V(12, -40), V(-12, -41)] },
      { group: 'hq', type: 'heavy', pos: V(0, -36), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(4, -48), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-8.5, -48.5), yaw: 0 },
      { group: 'hq', type: 'shotgunner', pos: V(7, -54), yaw: Math.PI / 2 },
      { group: 'hq', type: 'rifleman', pos: V(-20, -35), yaw: Math.PI / 2 },
      { group: 'hq', type: 'rifleman', pos: V(20, -38), yaw: Math.PI },
    ],
    // İstihbarattan sonra gelen takviye
    reinforcements: [
      { type: 'rifleman', pos: V(-8, -80) },
      { type: 'rifleman', pos: V(8, -82) },
      { type: 'shotgunner', pos: V(0, -90) },
      { type: 'rifleman', pos: V(40, -45) },
      { type: 'rifleman', pos: V(42, -40) },
    ],
    // İniş bölgesi savunma dalgaları (saniye)
    waves: [
      { t: 3, units: [{ type: 'rifleman', pos: V(-62, -108) }, { type: 'rifleman', pos: V(-58, -112) }, { type: 'rifleman', pos: V(60, -106) }] },
      { t: 28, units: [{ type: 'rifleman', pos: V(64, -80) }, { type: 'shotgunner', pos: V(62, -86) }, { type: 'rifleman', pos: V(-64, -78) }, { type: 'shotgunner', pos: V(-60, -84) }] },
      { t: 58, units: [{ type: 'heavy', pos: V(0, -114) }, { type: 'rifleman', pos: V(-20, -113) }, { type: 'rifleman', pos: V(22, -113) }, { type: 'rifleman', pos: V(-66, -96) }, { type: 'rifleman', pos: V(66, -98) }] },
    ],
    defendTime: 95,
  };
}

// ------------------------------------------------------------
// ATIŞ POLİGONU (L_TestGym karşılığı)
// ------------------------------------------------------------
export function buildRange(W) {
  W.bounds = { minx: -34, maxx: 34, minz: -60, maxz: 78 };
  ground(W, 500);
  dunes(W);
  // Atış hattı tezgâhı
  W.block(-10, 0, 62, 14, 1.0, 0.8, 'wood', 'wood');
  W.block(10, 0, 62, 14, 1.0, 0.8, 'wood', 'wood');
  // Mesafe tabelaları: 10/25/50/100 m
  for (const [z, label] of [[52, 10], [37, 25], [12, 50], [-38, 100]]) {
    W.block(-16, 0, z, 0.2, 1.4, 1.2, 'paint', 'concrete', { tint: 0xd8d0b8 });
    W.block(16, 0, z, 0.2, 1.4, 1.2, 'paint', 'concrete', { tint: 0xd8d0b8 });
    void label;
  }
  // Toprak set (arka)
  W.block(0, 0, -50, 60, 5, 4, 'sand', 'sand', { tint: 0xcdb48a });
  // Yan duvarlar
  W.block(-30, 0, 10, 1, 3, 130, 'concrete', 'concrete');
  W.block(30, 0, 10, 1, 3, 130, 'concrete', 'concrete');
  // Yüzey test duvarı: beton / metal / ahşap / kum torbası
  W.block(-24, 0, 44, 3, 2.5, 0.6, 'concrete', 'concrete');
  W.block(-24, 0, 38, 3, 2.5, 0.6, 'metal', 'metal');
  W.block(-24, 0, 32, 3, 2.5, 0.6, 'wood', 'wood');
  W.block(-24, 0, 26, 3, 1.2, 0.9, 'sandbag', 'sandbag');
  // Siper parkuru
  sandbags(W, 22, 48, 3, true);
  container(W, 22, 36, false, 'contRed');
  jersey(W, 22, 26);
  crate(W, 24, 18, 1.1);
  // Merdiven ve rampa: hareket testi
  for (let i = 0; i < 6; i++) W.block(-22, 0, 12 - i * 0.5, 4, 0.25 * (i + 1), 0.5, 'concrete', 'concrete');
  W.block(-22, 0, 7.5, 4, 1.5, 3.5, 'concrete', 'concrete');
  return {
    playerStart: { pos: V(0, 66), yaw: 0 },
    checkpoints: [{ pos: V(0, 66), yaw: 0 }],
    barrels: [V(-6, 24), V(6, 24), V(6.7, 24.6)],
    ammoCrates: [V(4, 64.5)],
    dummies: [
      { pos: V(-8, 52), yaw: Math.PI }, { pos: V(0, 52), yaw: Math.PI }, { pos: V(8, 52), yaw: Math.PI },
      { pos: V(-8, 37), yaw: Math.PI }, { pos: V(8, 37), yaw: Math.PI },
      { pos: V(-6, 12), yaw: Math.PI }, { pos: V(6, 12), yaw: Math.PI },
      { pos: V(0, -38), yaw: Math.PI },
      { pos: V(-10, 44), yaw: Math.PI, patrol: [V(-10, 44), V(10, 44)] },
      { pos: V(10, 20), yaw: Math.PI, patrol: [V(10, 20), V(-10, 20)] },
    ],
  };
}
