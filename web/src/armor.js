// Zırh sistemi (Operasyon Güncellemesi §4.5–4.7). Zırh, can çubuğunun önünde ikinci bir koruma katmanıdır:
// vuruş bölgesine göre bir parça seçilir (gövde/kol → yelek, kafa → kask, bacak → yok), parça mermiden
// emdiği kadar aşınır, Zırh Puanı bitince kırılır ve hasarın tamamı cana gider. Değerler data/armor.json'da.
import ARMOR from './data/armor.json' with { type: 'json' };
import WEAPON_META from './data/weapons.json' with { type: 'json' };

export const ARMOR_DATA = ARMOR;
export const ARMOR_DEFS = new Map([
  ...ARMOR.body.map((a) => [a.id, { ...a, slot: 'body' }]),
  ...ARMOR.helmets.map((h) => [h.id, { ...h, slot: 'helmet' }]),
]);

// Saf formül (belge §4.5). rawDamage: bölge çarpanı uygulanmış hasar; armorPen: zırh delme (0 zırh tam
// çalışır, 1 hiç işe yaramaz); piece: { points, absorb } — points yerinde azaltılır.
export function computeArmorDamage(rawDamage, armorPen, piece) {
  if (!piece || piece.points <= 0) return { absorbed: 0, healthDamage: rawDamage, effectiveAbsorb: 0, broken: false };
  const effectiveAbsorb = piece.absorb * (1 - armorPen);
  const absorbed = Math.min(rawDamage * effectiveAbsorb, piece.points);
  piece.points -= absorbed;
  return { absorbed, healthDamage: rawDamage - absorbed, effectiveAbsorb, broken: piece.points <= 0 };
}

export function makePiece(id) {
  const def = id ? ARMOR_DEFS.get(id) : null;
  return def ? { id, def, points: def.points, max: def.points, absorb: def.absorb } : null;
}

// Bir askerin (oyuncu ya da düşman) üstündeki zırh: yelek + kask. Satın alınan zırh her görevin başında
// tam dolu başlar (tamir yok); görev içinde yalnız Zırh Plakası doldurur.
export class ArmorLoadout {
  constructor(bodyId = null, helmetId = null) {
    this.body = makePiece(bodyId);
    this.helmet = makePiece(helmetId);
  }

  get empty() {
    return !this.body && !this.helmet;
  }

  pieceFor(zone) {
    const slot = ARMOR.zoneArmor[zone];
    return slot === 'body' ? this.body : slot === 'helmet' ? this.helmet : null;
  }

  // Hareket, nişan alma ve eğilme hızı çarpanı (1 − ceza)
  get speedMult() {
    return 1 - (this.body?.def.speedPenalty || 0) - (this.helmet?.def.speedPenalty || 0);
  }

  get noSprint() {
    return !!this.body?.def.noSprint;
  }

  refill() {
    for (const p of [this.body, this.helmet]) if (p) p.points = p.max;
  }

  // Zırh Plakası: gövde zırhına ekler (azami değere kadar); eklenen miktarı döndürür
  addPoints(n) {
    const p = this.body;
    if (!p) return 0;
    const before = p.points;
    p.points = Math.min(p.max, before + n);
    return p.points - before;
  }
}

// Denge tablosu (belge §4.6): canı hp olan, gövdesinde tam zırh (bodyId) taşıyan hedefi yalnız gövde
// vuruşuyla yere düşürmek için gereken atış sayısı
export function shotsToDown(damage, armorPen, bodyId, hp = 100) {
  const piece = makePiece(bodyId);
  let health = hp;
  let n = 0;
  while (health > 1e-9 && n < 1000) {
    health -= computeArmorDamage(damage, armorPen, piece).healthDamage;
    n++;
  }
  return n;
}

// Oyuncunun ve dostların silahlarının zırh delmesi: silah kimliği (data/weapons.json), dost tüfeği,
// patlama ve bıçak için ayrı değer
export function penFor(weaponId) {
  if (weaponId === 'explosion' || weaponId === 'rpg') return ARMOR.explosivePen;
  if (weaponId === 'allyRifle') return ARMOR.enemyWeaponPen.rifle;
  if (weaponId === 'melee') return WEAPON_META.knife?.armorPen ?? ARMOR.defaultPen;
  return WEAPON_META[weaponId]?.armorPen ?? ARMOR.defaultPen;
}

// Düşman silahının zırh delmesi (config.js → ENEMY_WEAPONS kimliği)
export function enemyPen(weaponKey) {
  return ARMOR.enemyWeaponPen[weaponKey] ?? ARMOR.defaultPen;
}

// Düşmana zırh: türe, zorluğa ve seviyeye göre veriden (rnd: 0–1 rastgele; testte sabitlenir)
export function rollEnemyArmor(type, diffKey, levelId, rnd = Math.random) {
  const E = ARMOR.enemyArmor;
  const T = E.types[type];
  if (!T || (levelId || 1) < (T.fromLevel || 1)) return null;
  // Olasılığı 1 olan tür (ör. ağır asker) hep zırhlıdır; seviye çarpanı yalnız ara olasılıkları ölçekler
  const base = T.chance[diffKey] ?? T.chance.normal ?? 0;
  const chance = base >= 1 ? 1 : Math.min(1, base * (E.levelScale[levelId] ?? 1));
  if (chance <= 0 || rnd() >= chance) return null;
  const a = new ArmorLoadout(T.body || null, T.helmet || null);
  return a.empty ? null : a;
}

// Oyuncunun vurulduğu bölge: isabetin ayak seviyesinden yüksekliği (rel) ve boy (height)
export function playerZoneAt(rel, height) {
  const Z = ARMOR.playerZones;
  if (rel >= height - Z.headTop) return 'head';
  if (rel < height * Z.legFrac) return 'leg';
  return 'torso';
}

export function playerZoneMult(zone) {
  return ARMOR.playerZones.mult[zone] ?? 1;
}
