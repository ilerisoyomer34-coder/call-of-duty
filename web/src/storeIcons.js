// Mağaza ürün görselleri: oyunun arayüz diliyle (kum rengi çizgi, çelik mavisi dolgu) çizilmiş SVG simgeler.
// Hazır görsel dosyası gerekmez, çevrimdışı ve her çözünürlükte keskin. Zırhın sınıfı büyüdükçe plaka/kat
// sayısı artar ki kartta bir bakışta ayırt edilsin.
const S = 'stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';
const F = 'fill="var(--steel)" fill-opacity=".28"';

const vest = (plates, heavy = false) => {
  let p = '';
  for (let i = 0; i < plates; i++) p += `<rect x="${38 - plates * 4 + i * 8}" y="${44 + (i % 2) * 2}" width="6" height="14" rx="1.5" ${S} ${F}/>`;
  return `<path d="M30 14 L40 20 L50 14 L62 20 L60 ${heavy ? 84 : 78} L20 ${heavy ? 84 : 78} L18 20 Z" ${S} ${F}/>
    <path d="M30 14 L40 30 L50 14" ${S} fill="none"/>${heavy ? `<path d="M14 26 L18 20 L18 50 L12 46 Z M66 26 L62 20 L62 50 L68 46 Z" ${S} ${F}/>` : ''}${p}`;
};

const helmet = (visor = false, high = false) => `<path d="M16 ${high ? 52 : 56} C16 30 26 18 40 18 C54 18 64 30 64 ${high ? 52 : 56} L64 60 L16 60 Z" ${S} ${F}/>
  <path d="M12 60 L68 60" ${S}/>${high ? `<path d="M22 46 L22 58 M58 46 L58 58" ${S}/>` : ''}${visor ? `<path d="M20 42 L60 42 L58 54 L22 54 Z" ${S} fill="var(--steel)" fill-opacity=".55"/>` : ''}`;

const ICONS = {
  armor_light: vest(0),
  armor_kevlar: vest(2),
  armor_plate: vest(3),
  armor_heavy: vest(4, false),
  armor_assault: vest(4, true),
  helmet_kevlar: helmet(false, false),
  helmet_tactical: helmet(false, true),
  helmet_heavy: helmet(true, true),
  plate_pack: `<rect x="18" y="22" width="26" height="36" rx="4" ${S} ${F}/><rect x="28" y="28" width="26" height="36" rx="4" ${S} ${F}/><rect x="38" y="34" width="26" height="36" rx="4" ${S} ${F}/>`,
  medkit: `<rect x="14" y="26" width="52" height="38" rx="5" ${S} ${F}/><path d="M32 26 L32 18 L48 18 L48 26" ${S} fill="none"/><path d="M40 36 L40 56 M30 46 L50 46" stroke="var(--red)" stroke-width="5" stroke-linecap="round"/>`,
  adrenaline: `<path d="M20 60 L54 26" ${S}/><rect x="30" y="30" width="26" height="12" rx="3" transform="rotate(-45 43 36)" ${S} ${F}/><path d="M54 26 L62 18 M58 14 L66 22 M20 60 L14 66" ${S}/>`,
  smoke: `<rect x="30" y="34" width="20" height="32" rx="4" ${S} ${F}/><path d="M34 34 L34 28 L46 28 L46 34" ${S} fill="none"/><path d="M24 26 C16 22 20 12 28 14 C30 6 44 6 46 14 C54 10 62 18 56 24" ${S} fill="none" stroke-opacity=".7"/>`,
  frag: `<circle cx="40" cy="48" r="18" ${S} ${F}/><path d="M34 30 L34 22 L50 22 L50 30 M50 24 L60 18" ${S} fill="none"/><path d="M26 44 L54 44 M26 52 L54 52 M40 30 L40 66" ${S} stroke-opacity=".5"/>`,
  squad_armor_1: `<path d="M40 12 L64 20 L62 48 C60 60 50 68 40 72 C30 68 20 60 18 48 L16 20 Z" ${S} ${F}/><path d="M40 30 L40 54" ${S}/>`,
  squad_armor_2: `<path d="M40 12 L64 20 L62 48 C60 60 50 68 40 72 C30 68 20 60 18 48 L16 20 Z" ${S} ${F}/><path d="M34 30 L34 54 M46 30 L46 54" ${S}/>`,
  medic_training: `<circle cx="40" cy="40" r="26" ${S} ${F}/><path d="M40 26 L40 54 M26 40 L54 40" stroke="var(--red)" stroke-width="6" stroke-linecap="round"/>`,
  radio_pack: `<rect x="24" y="26" width="32" height="42" rx="4" ${S} ${F}/><path d="M48 26 L54 8" ${S}/><circle cx="40" cy="38" r="6" ${S} fill="none"/><path d="M30 54 L50 54 M30 60 L50 60" ${S}/>`,
};

const WEAPON = `<path d="M10 40 L56 40 L60 36 L72 36 L72 42 L58 46 L52 46 L48 58 L40 58 L42 46 L10 46 Z" ${S} ${F}/>`;

export function itemIcon(id, category) {
  const body = ICONS[id] || (category === 'weapon' ? WEAPON : ICONS.plate_pack);
  return `<svg viewBox="0 0 80 80" aria-hidden="true">${body}</svg>`;
}
