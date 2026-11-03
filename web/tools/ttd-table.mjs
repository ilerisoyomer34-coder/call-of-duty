// Denge tablosu (Operasyon Güncellemesi §4.6): tam zırhlı, 100 canlı hedefi yalnız gövde vuruşuyla yere
// düşürmek için gereken atış sayısı. Oyunun gerçek değerleriyle (config.js, data/*.json) üretilir; denge
// değişikliğinden sonra yeniden koşturulur.
// Kullanım (web/ içinden):  node tools/ttd-table.mjs [--diff normal|easy|hard]
import { WEAPONS, WEAPON_ORDER, ENEMY_WEAPONS, DIFFICULTY } from '../src/config.js';
import WEAPON_META from '../src/data/weapons.json' with { type: 'json' };
import ARMOR from '../src/data/armor.json' with { type: 'json' };
import { shotsToDown } from '../src/armor.js';

const diffKey = process.argv.includes('--diff') ? process.argv[process.argv.indexOf('--diff') + 1] : 'normal';
const D = DIFFICULTY[diffKey] || DIFFICULTY.normal;
const armors = [null, ...ARMOR.body.map((a) => a.id)];
// Kısa sütun adları: armor_light → Hafif, armor_plate → Plaka…
const SHORT = { armor_light: 'Hafif', armor_kevlar: 'Kevlar', armor_plate: 'Plaka', armor_heavy: 'Ağır', armor_assault: 'Saldırı' };
const cols = ['Zırhsız', ...ARMOR.body.map((a) => SHORT[a.id] || a.id)];
const head = ['Silah (hasar, delme)'.padEnd(34), ...cols].join(' | ');
const row = (label, dmg, pen) => [`${label} (${+dmg.toFixed(1)}, ${pen.toFixed(2)})`.padEnd(34), ...armors.map((a, i) => String(shotsToDown(dmg, pen, a)).padStart(cols[i].length))].join(' | ');

console.log(`\n1) Oyuncunun silahları → zırhlı düşman (100 can, gövde, menzil kaybı yok)\n${head}`);
for (const id of WEAPON_ORDER) {
  const w = WEAPONS[id];
  if (w.projectile) continue;
  const dmg = w.damage * (w.zones?.torso || 1) * (w.pellets || 1);
  console.log(row(`${w.name}${w.pellets > 1 ? ` ×${w.pellets}` : ''}`, dmg, WEAPON_META[id]?.armorPen ?? ARMOR.defaultPen));
}

console.log(`\n2) Düşman silahları → zırhlı oyuncu (100 can, gövde, yakın mesafe, zorluk: ${D.label} ×${D.damageMult})\n${head}`);
for (const [id, w] of Object.entries(ENEMY_WEAPONS)) {
  const pen = ARMOR.enemyWeaponPen?.[id] ?? ARMOR.defaultPen;
  console.log(row(`${id}${w.pellets > 1 ? ` ×${w.pellets}` : ''}`, w.damage * (w.pellets || 1) * D.damageMult, pen));
}
console.log('\nNot: oyuncuya gelen hasarda ayrıca saniyelik tavan (DIFFICULTY.dpsCap) ve can yenilenmesi vardır; tablo yalnız zırh–can hesabıdır.');
