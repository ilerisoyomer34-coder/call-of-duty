// Kampanya Co-op'unun paylaşılan kuralları (sunucu server/game/coop.js, istemci src/net/coopHud.js ve gameClient
// aynı dosyayı okur): seviyelerin aşamaları (src/data/coop.json, tools/make-coop.mjs üretir), aşama durumu ve
// "hedefin dibinde E basılı" koşulu. İstemci aynı koşulla hareketi durdurur (tahmin sunucuyla ayrışmasın).
import COOP from '../../src/data/coop.json' with { type: 'json' };

export const COOP_LEVELS = COOP.levels;
export const COOP_LEVEL_IDS = Object.keys(COOP.levels);

// NEV.COOP olayının durumu: aşama sürüyor (hedef/sayaç değişti), aşama bitti, görev tamam, görev başarısız
export const COOP_STATE = { ACTIVE: 0, DONE: 1, COMPLETE: 2, FAILED: 3 };

// Anlık görüntüdeki me.act değeri (Rekabetçi PLANT 1 / DEFUSE 2 ile çakışmasın): hedefte E basılı
export const ACT_HOLD = 3;

// hold aşamasında oyuncunun durduğu, henüz bitmemiş en yakın hedef (yarıçap içinde, yerde); yoksa -1
export function holdTarget(st, done, x, z, grounded) {
  if (!st || st.type !== 'hold' || !grounded) return -1;
  let best = -1;
  let bd = st.r;
  for (let k = 0; k < st.targets.length; k++) {
    if (done[k]) continue;
    const t = st.targets[k];
    const d = Math.hypot(x - t[0], z - t[1]);
    if (d <= bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

// Ağdan gelen bit maskesinden bitmiş hedefler (istemci holdTarget'a aynı biçimde verir)
export function doneFromMask(mask, n, out = []) {
  out.length = n;
  for (let k = 0; k < n; k++) out[k] = (mask & (1 << k)) !== 0;
  return out;
}
