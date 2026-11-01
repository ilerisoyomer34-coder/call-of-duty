// Çevrim içi seri ödülleri (İHA, hava saldırısı, topçu): eşikler, hedef noktası ve patlama planı. Sunucu
// (server/game/sim.js) ve istemci (src/net/streakHud.js) aynı tabloyu okur; patlamaların zamanı ve yeri sunucuda
// tohumlu üretilir, istemciye NEV.BLAST ile gelir. Saf modül: DOM, THREE, Math.random yok. Değerler data/streaks.json.
import DATA from '../../src/data/streaks.json' with { type: 'json' };

export const STREAKS = DATA.list;
export const STREAK_INDEX = Object.fromEntries(STREAKS.map((s, i) => [s.id, i]));
// Komutun STREAK bitleri: dizin + 1 (0: kullanım yok)
export const STREAK_SHIFT = 14;
export const STREAK_MASK = 3 << STREAK_SHIFT;
export const streakBits = (index) => ((index + 1) << STREAK_SHIFT) & STREAK_MASK;
export const streakFromBits = (buttons) => ((buttons & STREAK_MASK) >> STREAK_SHIFT) - 1;

// Bu öldürmeyle (ölmeden art arda kaçıncı) hazır olan ödüller
export function earnedAt(kills) {
  const out = [];
  STREAKS.forEach((s, i) => {
    if (s.kills === kills) out.push(i);
  });
  return out;
}

// Hava saldırısı: hedef çevresinde bakış yönünde sıralı patlamalar [{ t (sn, kullanım anından), x, z }]
// Topçu: hedef çevresinde süre boyunca dağılan patlamalar (rng: sunucunun tohumlu üreteci, next() 0–1)
export function strikePlan(index, target, yaw, rng) {
  const s = STREAKS[index];
  const out = [];
  if (s.id === 'airstrike') {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    for (let i = 0; i < s.count; i++) {
      const k = i - (s.count - 1) / 2;
      out.push({ t: s.delay + i * 0.18, x: target.x + fx * k * s.spacing, z: target.z + fz * k * s.spacing });
    }
  } else if (s.id === 'artillery') {
    for (let i = 0; i < s.count; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * s.spread;
      out.push({ t: s.delay + (i / Math.max(1, s.count - 1)) * s.duration, x: target.x + Math.cos(a) * r, z: target.z + Math.sin(a) * r });
    }
  }
  return out;
}

// Patlamanın hasar çarpanı (0–1): merkezde 1, yarıçapta 0
export function strikeFactor(index, dist) {
  const s = STREAKS[index];
  if (dist >= s.radius) return 0;
  return (1 - dist / s.radius) ** s.falloff;
}
