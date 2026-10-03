// Yere düşme ve canlandırma kuralları (Operasyon Güncellemesi §7): saf işlevler ve sayaç. Tüm değerler
// data/revive.json'da. Oyun tarafı (oyuncu ve askerlerin yere düşmesi, canlandırıcı seçimi, ekran efekti)
// bunları kullanır; birim testleri doğrudan dener.
import REV from './data/revive.json' with { type: 'json' };

export const REVIVE = REV;
const A = REV.assist;

// Kan kaybı süresi: görevdeki kaçıncı düşüş (1, 2, 3…) ve zorluk çarpanı (Kolay ×1,5, Zor ×0,7)
export function bleedOutFor(downCount, difficulty = 'normal') {
  const arr = REV.bleedOutSec;
  return arr[Math.min(Math.max(1, downCount) - 1, arr.length - 1)] * (REV.bleedMult[difficulty] ?? 1);
}

export function allyBleedOutFor(difficulty = 'normal') {
  return REV.allyBleedOutSec * (REV.bleedMult[difficulty] ?? 1);
}

// Kolay'da yere düşen asker kendi kalkar; Normal/Zor'da kaldırılmazsa ölür (kullanıcı kararı)
export function allyCanDie(difficulty = 'normal') {
  return !!REV.allyDeathByDifficulty[difficulty];
}

// Canlandırma süresi: medik daha hızlı; Muharebe Medik Eğitimi tüm süreleri kısaltır
export function reviveTime({ medic = false, training = 1 } = {}) {
  return (medic ? REV.medicReviveTimeSec : REV.reviveTimeSec) * training;
}

// "Yardım edebilir mi?" puanı (§7.4). pathLen: yol uzunluğu (m, yoksa null); threats: yerdekini gören
// düşman sayısı; exposure: yolun açık kalan oranı 0–1
export function assistScore({ pathLen, threats = 0, exposure = 0, underFire = false, healthPct = 1, medic = false, calledHelp = false, bleedLeft = Infinity }) {
  if (pathLen == null || pathLen > REV.maxAssistDistance) return -Infinity;
  let s = A.base;
  s -= pathLen * A.perMeter;
  s -= threats * A.perThreat;
  s -= exposure * A.exposure;
  if (underFire) s -= A.underFire;
  if (healthPct < A.lowHealthPct) s -= A.lowHealth;
  if (medic) s += A.medicBonus;
  if (calledHelp) s += A.calledHelp;
  if (bleedLeft < A.lastSecondsThreshold) s += A.lastSeconds;
  return s;
}

// Karar: doğrudan canlandır · önce temizle (baskı ateşi, sis) · yardım edemez
export function assistDecision(score) {
  if (score >= A.direct) return 'direct';
  if (score >= A.clearFirst) return 'clearFirst';
  return 'cannot';
}

// Yerdeki birinin kan kaybı sayacı. Canlandırılırken durur; alınan her hasar puanı süreden düşer.
export class BleedOut {
  constructor(seconds) {
    this.total = seconds;
    this.left = seconds;
  }

  get frac() {
    return this.total > 0 ? Math.max(0, this.left / this.total) : 0;
  }

  get expired() {
    return this.left <= 0;
  }

  tick(dt, paused = false) {
    if (!paused) this.left = Math.max(0, this.left - dt);
    return this.expired;
  }

  damage(amount) {
    this.left = Math.max(0, this.left - amount * REV.downedDamageDrainSec);
    return this.expired;
  }
}
