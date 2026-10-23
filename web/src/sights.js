// Nişangâh kataloğu (data/sights.json): her silahın nişangâh türünü, işaretini ve modele özgü gövde ölçülerini
// tek yerden verir. Saf modül (DOM/THREE yok): görünüm (viewmodel), HUD dürbün kaplaması, oyuncu nefes tutma
// ve teçhizat ekranı aynı kaydı okur; testi tests/sights.test.mjs.
import SIGHTS from './data/sights.json' with { type: 'json' };

export const SIGHT_TYPES = SIGHTS.types;
export const SIGHT_KINDS = ['iron', 'reflex', 'prism', 'scope', 'none'];

const NONE = Object.freeze({ id: 'none', ...SIGHTS.types.none, housing: null, glow: [], glowPost: 0 });
const cache = new Map();

// Silahın çözülmüş nişangâhı: tür alanları + silaha özgü gövde/parıltı. Katalogda olmayan silah demir nişangâhlıdır.
// Sonuç önbellekte tutulur (her karede çağrılabilir, bellek ayırmaz)
export function sightFor(weaponId) {
  let s = cache.get(weaponId);
  if (s) return s;
  const w = SIGHTS.weapons[weaponId];
  const typeId = w?.sight || 'iron';
  const t = SIGHTS.types[typeId];
  if (!t) throw new Error(`Bilinmeyen nişangâh türü: ${typeId} (${weaponId})`);
  s = Object.freeze({ id: typeId, ...t, housing: w?.housing || null, glow: w?.glow || [], glowPost: w?.glowPost || 0 });
  if (s.kind === 'none') s = NONE;
  cache.set(weaponId, s);
  return s;
}

// Dürbünlü silah: tam nişanda model gizlenir, ekrana dürbün kaplaması çizilir, nefes tutulabilir
export const isScoped = (weaponId) => sightFor(weaponId).kind === 'scope';

// Nişan alınamayan silah (minigun gibi): sağ tık yalnız silahı hafifçe kaldırır
export const canAim = (weaponId) => sightFor(weaponId).kind !== 'none';

// İşareti model camında çizilen nişangâh (kolimatör, holografik, prizmatik)
export const hasReticle = (weaponId) => {
  const k = sightFor(weaponId).kind;
  return k === 'reflex' || k === 'prism';
};

// Teçhizat ekranı için kısa açıklama: "Holografik", "Taktik dürbün 3×"
export function sightLabel(weaponId) {
  const s = sightFor(weaponId);
  return s.zoom ? `${s.name} ${s.zoom}` : s.name;
}
