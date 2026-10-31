// Silah eklentileri (kullanıcı isteği: "silahları modifiye edebilelim"): uyum kuralları ve eklentili silah tanımı.
// Saf modül: tek oyunculu silah (src/weapons.js → Weapon), teçhizat ekranı (gunsmithScreen.js) ve çevrim içi sunucu
// (server/game/sim.js) aynı hesabı yapar; çevrim içinde eklentiler ağdan dizinle gelir, sunucu yeniden doğrular.
// Katalog src/data/attachments.json; tanımdaki çarpanların anlamı orada.
import { WEAPONS } from '../../src/config.js';
import ATT from '../../src/data/attachments.json' with { type: 'json' };
import META from '../../src/data/weapons.json' with { type: 'json' };
import SIGHTS from '../../src/data/sights.json' with { type: 'json' };

export const ATTACHMENTS = ATT.items;
export const ATT_CATEGORIES = ATT.categories;
export const ATT_CATS = ATT.categories.map((c) => c.id);
// Ağda taşınan dizin sırası: katalogdaki sıra (yeni eklenti sona eklenir; derleme özeti iki tarafı eşler)
export const ATT_IDS = Object.keys(ATT.items);

const baseSightKind = (weaponId) => SIGHTS.types[SIGHTS.weapons[weaponId]?.sight || 'iron']?.kind || 'iron';

// Eklenti bu silaha takılabilir mi? (sınıf, şarjörlü mü, dürbünlü/nişansız silaha optik yok)
export function compatible(weaponId, attId) {
  const a = ATTACHMENTS[attId];
  const d = WEAPONS[weaponId];
  if (!a || !d || d.melee) return false;
  if (!a.types.includes(META[weaponId]?.type)) return false;
  if (a.needsMag && d.reloadType !== 'mag') return false;
  const kind = baseSightKind(weaponId);
  if (a.cat === 'optic' && (kind === 'scope' || kind === 'none')) return false;
  return true;
}

// Bir kategorinin bu silaha uyan eklentileri (katalog sırasıyla)
export function choicesFor(weaponId, cat) {
  return ATT_IDS.filter((id) => ATTACHMENTS[id].cat === cat && compatible(weaponId, id));
}

// { kategori: eklenti } → yalnız kategorisi doğru ve silaha uyan eklentiler
export function normalizeMods(weaponId, mods) {
  const out = {};
  if (!mods || typeof mods !== 'object') return out;
  for (const cat of ATT_CATS) {
    const id = mods[cat];
    if (typeof id === 'string' && ATTACHMENTS[id]?.cat === cat && compatible(weaponId, id)) out[cat] = id;
  }
  return out;
}

export const modsKey = (mods) => ATT_CATS.map((c) => mods?.[c] || '').join('|');

// Ağ biçimi: eklenti dizinleri (u8)
export const modsToIndices = (mods) => ATT_CATS.filter((c) => mods?.[c]).map((c) => ATT_IDS.indexOf(mods[c]));
export function modsFromIndices(weaponId, list) {
  const m = {};
  for (const i of list || []) {
    const id = ATT_IDS[i];
    if (id) m[ATTACHMENTS[id].cat] = id;
  }
  return normalizeMods(weaponId, m);
}

// Bütün eklentilerin çarpanları bir arada (gösterim için de: gunsmithScreen ▲/▼)
export function modFactors(mods) {
  const k = { recoil: 1, hip: 1, adsTime: 1, mobility: 1, mag: 1, reload: 1, range: 1, noise: 1, flash: 1, adsMove: 1, fov: null, sound: null, sight: null };
  for (const id of Object.values(mods || {})) {
    const a = ATTACHMENTS[id];
    if (!a) continue;
    for (const [x, v] of Object.entries(a.mods || {})) {
      if (x === 'fov') k.fov = k.fov === null ? v : Math.min(k.fov, v);
      else if (x in k) k[x] *= v;
    }
    if (a.sound) k.sound = a.sound;
    if (a.sight) k.sight = a.sight;
  }
  return k;
}

const cache = new Map();

// Eklentili silah tanımı: temel tanımın kopyası, değişen alanlar yeni nesne (temel tanıma dokunulmaz). Eklenti yoksa
// temel tanımın kendisi. Aynı birleşim önbellekte (her doğuşta yeniden kurulmaz)
export function moddedDef(weaponId, mods) {
  const base = WEAPONS[weaponId];
  if (!base) return base;
  const m = normalizeMods(weaponId, mods);
  if (!Object.keys(m).length) return base;
  const key = `${weaponId}#${modsKey(m)}`;
  let d = cache.get(key);
  if (d) return d;
  const k = modFactors(m);
  d = { ...base, mods: m, modsKey: key };
  if (base.recoil) {
    const r = base.recoil;
    d.recoil = { ...r, pattern: (r.pattern || []).map(([x, y]) => [x * k.recoil, y * k.recoil]), random: (r.random || 0) * k.recoil };
    if (r.kick !== undefined) d.recoil.kick = r.kick * k.recoil;
    if (r.kickRot !== undefined) d.recoil.kickRot = r.kickRot * k.recoil;
  }
  if (base.spread) {
    // Lazer kalçadan sapmayı azaltır; sapmanın üst sınırı da yarı oranda iner
    d.spread = { ...base.spread, hip: base.spread.hip * k.hip, max: base.spread.max * (1 + k.hip) * 0.5 };
  }
  if (base.ads) {
    d.ads = { ...base.ads, time: base.ads.time * k.adsTime, moveMult: Math.min(1, base.ads.moveMult * k.adsMove) };
    if (k.fov !== null) d.ads.fovMult = Math.min(base.ads.fovMult, k.fov);
  }
  d.mobility = (base.mobility || 1) * k.mobility;
  if (k.mag !== 1 && base.magSize) {
    d.magSize = Math.round(base.magSize * k.mag);
    d.reserveMax = Math.round(base.reserveMax * k.mag);
    d.reserveStart = Math.round(base.reserveStart * k.mag);
  }
  if (k.reload !== 1) for (const f of ['reloadTactical', 'reloadEmpty', 'reloadStart', 'reloadPerShell', 'reloadEnd']) if (base[f]) d[f] = base[f] * k.reload;
  if (k.range !== 1 && base.falloff) d.falloff = { ...base.falloff, start: base.falloff.start * k.range, end: base.falloff.end * k.range };
  if (base.noise) d.noise = base.noise * k.noise;
  d.flashSize = (base.flashSize || 0.14) * k.flash;
  if (k.sound) d.sound = k.sound;
  if (k.sight) d.sight = k.sight;
  cache.set(key, d);
  return d;
}
