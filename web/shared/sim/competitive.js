// Rekabetçi mod kuralları (bomba kur / imha et, raunt, ekonomi). Sunucu (server/game/comp.js) ve istemci
// (src/net/buyScreen.js, matchHud.js, gameClient.js) aynı tabloyu ve aynı koşulları kullanır: satın alma listesi ve
// dizinleri ağda taşınır, kurma/imha koşulu istemcide hareketi durdurur (tahmin sunucunun gördüğü komutla aynı
// kalsın). Saf modül: DOM, THREE, rastgelelik yok. Değerler src/data/competitive.json.
import COMP from '../../src/data/competitive.json' with { type: 'json' };
import META from '../../src/data/weapons.json' with { type: 'json' };
import { onlineChoices } from './loadout.js';

export const COMP_RULES = COMP;

// Raunt durumu (NEV.ROUND_STATE) ve bitiş nedeni
export const ROUND_STATE = { BUY: 0, LIVE: 1, POST: 2 };
export const ROUND_REASON = { NONE: 0, ELIM: 1, TIME: 2, BOMB: 3, DEFUSE: 4 };
// Bomba (NEV.BOMB)
export const BOMB = { NONE: 0, CARRIED: 1, DROPPED: 2, PLANTED: 3, DEFUSED: 4, EXPLODED: 5 };
// Yerel oyuncunun süren eylemi (anlık görüntü)
export const ACT = { NONE: 0, PLANT: 1, DEFUSE: 2 };

// Ana silahın fiyatı (satılmıyorsa null): silaha özel değer, yoksa sınıfın varsayılanı
export function priceOf(id) {
  const P = COMP.prices;
  if (P.weapons[id] !== undefined) return P.weapons[id];
  const c = META[id]?.type;
  return c && P.classes[c] !== undefined ? P.classes[c] : null;
}

// Satın alma listesi: ağdaki dizin bu sıradır (C_BUY). Ana silahlar fiyat sırasıyla, sonra bombalar
export const BUY_ITEMS = [
  ...onlineChoices('primary')
    .filter((id) => priceOf(id) !== null)
    .map((id) => ({ kind: 'weapon', id, price: priceOf(id) }))
    .sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1)),
  { kind: 'frag', id: 'frag', price: COMP.prices.frag },
  { kind: 'smoke', id: 'smoke', price: COMP.prices.smoke },
];
export const buyIndex = (id) => BUY_ITEMS.findIndex((it) => it.id === id);

// Öldürme ödülü: silah sınıfına göre (bıçak ve el bombası ayrı)
export function killReward(weaponId, how = '') {
  const K = COMP.money.kill;
  if (how === 'melee') return K.melee;
  if (how === 'frag') return K.frag;
  const c = META[weaponId]?.type;
  return K[c] ?? K.default;
}

// Raunt sonu parası: kazanan sabit, kaybeden art arda kaybettiği raunda göre (streak: bu kayıp dahil, 1'den)
export function roundReward(won, streak) {
  const M = COMP.money;
  if (won) return M.win;
  const L = M.lose;
  return L[Math.min(L.length, Math.max(1, streak)) - 1];
}

export const clampMoney = (v) => Math.max(0, Math.min(COMP.money.max, Math.round(v)));

// Bomba bölgesi: sites [[x, z, r], ...] → içindeki bölgenin dizini ya da -1
export function siteAt(sites, x, z) {
  if (!sites) return -1;
  for (let i = 0; i < sites.length; i++) {
    const [sx, sz, r] = sites[i];
    if ((x - sx) ** 2 + (z - sz) ** 2 <= r * r) return i;
  }
  return -1;
}

export const SITE_NAMES = ['A', 'B', 'C'];

// Bu durumda E basılıysa ne yapılır? (kurma, imha ya da hiçbiri). İstemci hareketi bu koşulla durdurur, sunucu da
// ilerlemeyi bununla sayar. me: { slot, side, alive, x, z, grounded }; c: { live, attackSide, bomb: { state, carrier, x, z }, sites }
export function actionFor(me, c) {
  if (!c.live || !me.alive || !me.grounded) return ACT.NONE;
  const B = c.bomb;
  if (me.side === c.attackSide) {
    if (B.state === BOMB.CARRIED && B.carrier === me.slot && siteAt(c.sites, me.x, me.z) >= 0) return ACT.PLANT;
    return ACT.NONE;
  }
  if (B.state === BOMB.PLANTED && Math.hypot(me.x - B.x, me.z - B.z) <= COMP.bomb.defuseDist) return ACT.DEFUSE;
  return ACT.NONE;
}

// Eylemin süresi (sn)
export const actionTime = (act) => (act === ACT.PLANT ? COMP.bomb.plantSec : act === ACT.DEFUSE ? COMP.bomb.defuseSec : 0);

// Patlama hasarı (bomba): merkezde blastDamage, kenarda 0 (duvar kesmez: büyük patlama)
export function bombDamage(dist) {
  const B = COMP.bomb;
  if (dist >= B.blastRadius) return 0;
  return B.blastDamage * (1 - dist / B.blastRadius) ** 1.5;
}
