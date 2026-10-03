// Silahların görünen bilgileri (Operasyon Güncellemesi §5.2–5.3): ad, sınıf, kalibre, bilgi satırı, rozetler
// ve kartlardaki 0–100 istatistikler. Atış ayarları config.js → WEAPONS'ta, görünen üst bilgi
// data/weapons.json'da; ikisi kimlikle birleşir. İstatistikler elle girilmez: her biri silahın gerçek
// değerinden türetilip en yüksek silaha oranlanır, böylece denge değişince kartlar kendiliğinden güncellenir.
import { WEAPONS, WEAPON_ORDER } from './config.js';
import META from './data/weapons.json' with { type: 'json' };

export const WEAPON_META = META;

// Ayarlar → "Gerçek silah adları". Ayar uygulanınca main.js çağırır; HUD, menü ve istemler aynı adı görür.
let realNames = true;
export function setRealNames(on) {
  realNames = !!on;
}
export function realNamesOn() {
  return realNames;
}

export function weaponName(id) {
  const m = META[id];
  if (!m) return WEAPONS[id]?.name || id;
  return realNames ? m.displayName : m.altName;
}

// HUD'daki silah yuvası satırı için kısa ad (gerçek adda veriden, kurgusalda adın ilk sözcüğü)
export function weaponShortName(id) {
  const m = META[id];
  if (!m) return (WEAPONS[id]?.name || id).split(' ')[0];
  return realNames ? m.short || m.displayName : m.altName.split(' ')[0];
}

export function weaponClass(id) {
  return META[id]?.class || WEAPONS[id]?.kind || '';
}

const MODE_LABEL = { auto: 'Otomatik', burst: 'Seri', semi: 'Tek atış' };

// Kart bilgi satırı: kalibre · şarjör · atış modu
export function weaponInfoLine(id) {
  const d = WEAPONS[id];
  const m = META[id] || {};
  const mag = d.reloadType === 'shell' ? `${d.magSize} fişek` : d.projectile ? `${d.magSize} roket` : `${d.magSize} mermi`;
  const modes = d.fireModes.map((f) => (f === 'burst' ? `${d.burstCount || 3}'lü seri` : MODE_LABEL[f] || f)).join(' / ');
  return [m.caliber, mag, modes].filter(Boolean).join(' · ');
}

// Rozetler: veriden (ÇATAL AYAK, PATLAYICI) + zırh delme ≥ eşik ise ZIRH DELİCİ (§5.5)
export const ARMOR_PIERCING_AT = 0.75;
export function weaponBadges(id) {
  const m = META[id] || {};
  const out = [...(m.badges || [])];
  if ((m.armorPen || 0) >= ARMOR_PIERCING_AT && !out.includes('ZIRH DELİCİ')) out.push('ZIRH DELİCİ');
  return out;
}

// Ham değerler (büyük = iyi). Roketatar gibi mermisi cisim olan silahlar oranlamada en yükseği belirlemez
// (yoksa diğer her silahın hasarı sıfıra yakın görünür); kendi çubukları 100'de kesilir.
function raw(d) {
  const sp = d.spread;
  // İsabet: nişanlı yayılma baskın, kalçadan atış ve seri atıştaki açılma daha az ağırlıklı; saçma yayılımı eklenir
  const inacc = 1 + 0.08 * sp.hip + 2.5 * sp.hip * sp.adsMult + 0.15 * sp.perShot * Math.min(1, d.rpm / 600) + 0.3 * (d.pelletSpread || 0);
  const pat = d.recoil.pattern;
  const kick = pat.reduce((s, p) => s + Math.abs(p[1]) + Math.abs(p[0]) * 0.5, 0) / pat.length;
  return {
    damage: d.damage * (d.pellets || 1),
    rate: d.rpm,
    accuracy: 1 / inacc,
    range: Math.min(d.falloff?.end ?? d.range, d.range),
    mobility: (d.mobility || 1) * (0.6 + 0.4 * d.ads.moveMult),
    control: 1 / (1 + kick * (1 + d.recoil.random) * d.recoil.adsMult),
  };
}

export const STAT_KEYS = [
  ['damage', 'Hasar'],
  ['rate', 'Atış Hızı'],
  ['accuracy', 'İsabet'],
  ['range', 'Menzil'],
  ['mobility', 'Hareketlilik'],
  ['control', 'Kontrol'],
];

let maxCache = null;
function maxima() {
  if (maxCache) return maxCache;
  maxCache = {};
  for (const id of WEAPON_ORDER) {
    const d = WEAPONS[id];
    if (d.projectile) continue;
    const r = raw(d);
    for (const [k] of STAT_KEYS) maxCache[k] = Math.max(maxCache[k] || 0, r[k]);
  }
  return maxCache;
}

// Hasar ve menzil silahlar arasında çok geniş dağılır (tabanca 34, saçma 9×17); doğrusal oranda tüfekler
// çubuğun beşte birinde kalıp ayırt edilemez. Bu ikisi algıya yakın bir eğriyle (üs < 1) gösterilir.
const CURVE = { damage: 0.6, range: 0.6 };

// → [{ key, label, value 1–100 }]
export function weaponStats(id) {
  const r = raw(WEAPONS[id]);
  const max = maxima();
  return STAT_KEYS.map(([key, label]) => {
    const k = Math.min(1, r[key] / max[key]);
    return { key, label, value: Math.max(1, Math.round(100 * Math.pow(k, CURVE[key] || 1))) };
  });
}

// Görsel yoksa gösterilecek siluet türü (veride yoksa sınıftan tahmin)
export function weaponSilhouette(id) {
  const m = META[id];
  if (m?.silhouette) return m.silhouette;
  const d = WEAPONS[id];
  if (d.projectile) return 'launcher';
  if (d.category === 'secondary') return 'pistol';
  if ((d.pellets || 1) > 1) return 'shotgun';
  return 'rifle';
}
