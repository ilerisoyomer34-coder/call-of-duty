// Basitleştirilmiş vuruş kutuları (belge §5.4). Sunucu iskelet animasyonu çalıştırmaz: kutular duruştan
// (boy, çömelme), yaw/pitch'ten ve yürüyüş fazından türer. İstemcideki görsel model bu poza uyar;
// geliştirici modunda "sv_showhitboxes 1" kutuları tel kafes çizer (src/hitboxDebug.js).
// Bölge adları mevcut verinin adları: silah çarpanı weapons zones {head, torso, limb},
// oyuncu çarpanı armor.json playerZones {head, torso, leg} (bacak → leg; kol gövdeye sayılır, mevcut model gibi).

// Ölçüler boya göre oran (ayakta boy 1,8 m'de değerler yorumda); çömelince kutular boyla birlikte iner
export const HITBOX = {
  headR: 0.13, // baş küresi yarıçapı
  headDown: 0.15, // baş merkezi tepeden aşağı (1,65 m = göz hizası)
  chestR: 0.18, // göğüs kapsülü yarıçapı (gövde 0,97–1,51 m'yi kaplar)
  chestLo: 0.64, // göğüs kapsülü ekseninin alt ucu (boy oranı; 1,15 m) — uç küresi karın kutusunun önüne taşmaz
  chestHi: 0.74, // eksenin üst ucu (1,33 m)
  stomachLo: 0.47, // karın kutusu alt (0,85 m)
  stomachHi: 0.6, // üst (1,08 m)
  stomachHalfW: 0.17,
  stomachHalfD: 0.12,
  shoulderX: 0.2, // omuz yana
  shoulderY: 0.78, // omuz yüksekliği (boy oranı)
  armLen: 0.5, // omuzdan ele (silahı tutar: ileri ve nişan açısıyla)
  armR: 0.06,
  armIn: 0.12, // eller öne doğru içe toplanır
  hipX: 0.1,
  hipY: 0.47, // kalça (boy oranı)
  footX: 0.12,
  legR: 0.085,
  stride: 0.18, // yürüyüş fazında ayağın ileri/geri salınımı (m, tam hızda)
};

const ZONE = { head: 'head', chest: 'torso', stomach: 'torso', arm: 'limb', leg: 'limb' };
const PLAYER_ZONE = { head: 'head', chest: 'torso', stomach: 'torso', arm: 'torso', leg: 'leg' };

const v3 = () => ({ x: 0, y: 0, z: 0 });
const shape = (part, type) => ({ part, type, zone: ZONE[part], playerZone: PLAYER_ZONE[part], a: v3(), b: v3(), r: 0, half: v3(), yaw: 0 });

// Bir karakterin kutu kümesi (bir kez ayrılır, her tick hitboxesFor ile yerinde güncellenir)
export function createHitboxes() {
  return [shape('head', 'sphere'), shape('chest', 'capsule'), shape('stomach', 'box'), shape('arm', 'capsule'), shape('arm', 'capsule'), shape('leg', 'capsule'), shape('leg', 'capsule')];
}

/**
 * Pozdan kutular.
 * @param {{ pos: {x,y,z}, yaw: number, pitch?: number, height: number, phase?: number, speed?: number }} p
 *   pos ayak noktası; height o anki boy (çömelmede küçük); phase yürüyüş fazı (radyan); speed 0–1 salınım oranı
 */
export function hitboxesFor(p, out) {
  const H = HITBOX;
  const h = p.height;
  const k = h / 1.8; // ölçüler ayakta boya göre; çömelikte orantılı küçülür (yükseklikler)
  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);
  const rx = -fz; // sağ
  const rz = fx;
  const px = p.pos.x;
  const py = p.pos.y;
  const pz = p.pos.z;
  const pitch = p.pitch || 0;
  // Baş
  const head = out[0];
  head.a.x = px + fx * 0.02;
  head.a.y = py + h - H.headDown * k;
  head.a.z = pz + fz * 0.02;
  head.r = H.headR;
  // Göğüs
  const chest = out[1];
  chest.a.x = chest.b.x = px;
  chest.a.z = chest.b.z = pz;
  chest.a.y = py + h * H.chestLo;
  chest.b.y = py + h * H.chestHi;
  chest.r = H.chestR;
  // Karın (yaw ile dönmüş kutu)
  const st = out[2];
  st.a.x = px;
  st.a.y = py + (h * (H.stomachLo + H.stomachHi)) / 2;
  st.a.z = pz;
  st.half.x = H.stomachHalfW;
  st.half.y = (h * (H.stomachHi - H.stomachLo)) / 2;
  st.half.z = H.stomachHalfD;
  st.yaw = p.yaw;
  // Kollar: omuzdan nişan yönünde öne, eller ortaya toplanır
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const arm = out[3 + i];
    arm.a.x = px + rx * H.shoulderX * side;
    arm.a.y = py + h * H.shoulderY;
    arm.a.z = pz + rz * H.shoulderX * side;
    const inX = rx * H.armIn * side;
    const inZ = rz * H.armIn * side;
    arm.b.x = arm.a.x + fx * H.armLen * cp - inX;
    arm.b.y = arm.a.y + H.armLen * sp;
    arm.b.z = arm.a.z + fz * H.armLen * cp - inZ;
    arm.r = H.armR;
  }
  // Bacaklar: kalçadan ayağa; yürürken ayaklar zıt fazda ileri/geri
  const swing = Math.sin(p.phase || 0) * H.stride * (p.speed || 0);
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const leg = out[5 + i];
    leg.a.x = px + rx * H.hipX * side;
    leg.a.y = py + h * H.hipY;
    leg.a.z = pz + rz * H.hipX * side;
    const f = swing * side;
    leg.b.x = px + rx * H.footX * side + fx * f;
    leg.b.y = py + H.legR;
    leg.b.z = pz + rz * H.footX * side + fz * f;
    leg.r = H.legR;
  }
  return out;
}

// --- Işın kesişimleri (d birim vektör); kesişme yoksa -1 ---
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  return t >= 0 ? t : -1;
}

// Kapsül: a–b doğru parçası çevresinde r yarıçap
export function rayCapsule(o, d, a, b, r) {
  const bax = b.x - a.x;
  const bay = b.y - a.y;
  const baz = b.z - a.z;
  const oax = o.x - a.x;
  const oay = o.y - a.y;
  const oaz = o.z - a.z;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * d.x + bay * d.y + baz * d.z;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = d.x * oax + d.y * oay + d.z * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const A = baba - bard * bard;
  const B = baba * rdoa - baoa * bard;
  const C = baba * oaoa - baoa * baoa - r * r * baba;
  const h = B * B - A * C;
  if (A > 1e-12 && h >= 0) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) return t;
  }
  // Uç küreler
  const t1 = raySphere(o, d, a, r);
  const t2 = raySphere(o, d, b, r);
  if (t1 < 0) return t2;
  if (t2 < 0) return t1;
  return Math.min(t1, t2);
}

// Yalnız y ekseninde dönmüş kutu (merkez c, yarı boyutlar half, yaw)
export function rayYawBox(o, d, c, half, yaw) {
  // Işını kutunun yerel uzayına döndür (−yaw)
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const ox = o.x - c.x;
  const oz = o.z - c.z;
  const lox = ox * cs - oz * sn;
  const loz = ox * sn + oz * cs;
  const ldx = d.x * cs - d.z * sn;
  const ldz = d.x * sn + d.z * cs;
  const lo = [lox, o.y - c.y, loz];
  const ld = [ldx, d.y, ldz];
  const hh = [half.x, half.y, half.z];
  let tmin = -Infinity;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < 1e-12) {
      if (lo[i] < -hh[i] || lo[i] > hh[i]) return -1;
      continue;
    }
    let t1 = (-hh[i] - lo[i]) / ld[i];
    let t2 = (hh[i] - lo[i]) / ld[i];
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : tmax;
}

/**
 * En yakın vuruş kutusu.
 * @returns {{ dist: number, zone: string, playerZone: string, part: string } | null}
 */
export function rayHitboxes(o, d, maxDist, boxes, out = {}) {
  let best = maxDist;
  let hit = null;
  for (const s of boxes) {
    const t = s.type === 'sphere' ? raySphere(o, d, s.a, s.r) : s.type === 'capsule' ? rayCapsule(o, d, s.a, s.b, s.r) : rayYawBox(o, d, s.a, s.half, s.yaw);
    if (t >= 0 && t < best) {
      best = t;
      hit = s;
    }
  }
  if (!hit) return null;
  out.dist = best;
  out.zone = hit.zone;
  out.playerZone = hit.playerZone;
  out.part = hit.part;
  return out;
}
