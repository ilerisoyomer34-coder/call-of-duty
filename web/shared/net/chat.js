// Maç içi iletişimin ortak kuralları (çok oyunculu belge §11, M8): metin sohbeti, telsiz kalıpları ve takım işareti.
// Sunucu (server/game/room.js) ve istemci (src/net/netChat.js) aynı kuralı kullanır: temizleme, hız sınırı, kimin
// göreceği, işaretin geçerliliği. DOM, THREE, Date.now ve Math.random yok (shared/ kuralı); ayarlar config.js →
// ONLINE.chat, kalıplar data/netRadio.tr.json.
import { ONLINE } from '../../src/config.js';
import RADIO from '../../src/data/netRadio.tr.json' with { type: 'json' };
import { CHAT_FLAG, MARK_KIND } from './protocol.js';

export { CHAT_FLAG, MARK_KIND };

export const RADIO_LINES = RADIO.lines;
const INDEX = new Map(RADIO.lines.map((l, i) => [l.id, i]));
// Çarktaki kalıpların dizinleri (Rekabetçide bomba kalıpları)
export function radioWheel(comp = false) {
  return (comp ? RADIO.comp : RADIO.wheel).map((id) => INDEX.get(id));
}

// Görünmez/denetim karakterleri (yön değiştiren Unicode dahil): başkasının ekranında metni ters çevirip kandırmasın.
// Kod noktası aralıkları (kaynakta görünmez karakter durmasın diye sayıyla)
const HIDDEN = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]];
const hidden = (ch) => {
  const c = ch.codePointAt(0);
  return HIDDEN.some(([a, b]) => c >= a && c <= b);
};

// Ekrana gidecek metin: denetim karakterleri boşluk, boşluklar tek, uç boşluklar atılır, en çok maxLen harf
export function sanitizeChat(raw, max = ONLINE.chat.maxLen) {
  if (typeof raw !== 'string') return '';
  const s = Array.from(raw, (ch) => (hidden(ch) ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, max).join('').trim();
}

// Jeton kovası: saniyede `rate` jeton dolar, en çok `burst` birikir; her ileti bir jeton harcar
export class TokenBucket {
  constructor(rate, burst) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.at = null;
  }

  allow(nowSec) {
    if (this.at !== null) this.tokens = Math.min(this.burst, this.tokens + (nowSec - this.at) * this.rate);
    this.at = nowSec;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/**
 * İletiyi kim görür? from/to: { side, alive }.
 *  - Takım kanalı (taraflı modda): yalnız aynı taraf (ölüler dahil). Tarafsız modda (ÖM) herkese.
 *  - Ölünün "herkese" iletisi, ölümün raunt boyu sürdüğü modda (Rekabetçi: deadChat) yalnız ölülere: canlılara
 *    bilgi taşınmasın.
 */
export function chatVisible(msg, from, to, rules) {
  if (msg.team && rules.sided) return to.side === from.side;
  if (msg.dead && rules.deadChat) return !to.alive;
  return true;
}

// Takım işareti geçerli mi? Gözden menzil içinde ve duvar arkasında değil (işaret konan yüzey görünüyor olmalı)
export function markValid(world, eye, point, range = ONLINE.chat.markRange) {
  if (![point.x, point.y, point.z].every(Number.isFinite)) return false;
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  if (dx * dx + dy * dy + dz * dz > range * range) return false;
  return world.lineOfSight(eye, point);
}
