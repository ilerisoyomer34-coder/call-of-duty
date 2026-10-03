// Saf matematik yardımcıları: istemci (src/util.js yeniden dışa aktarır) ve sunucu aynı tanımları kullanır.

export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);

// Kare hızından bağımsız üstel yaklaşım: "hız" saniyede kapanan oranı belirler.
export const damp = (a, b, speed, dt) => lerp(a, b, 1 - Math.exp(-speed * dt));

// En yakın q katına yuvarlama (tick sonu nicemleme). -0 yerine 0: durum karşılaştırmaları ve özetler eşleşsin
export function quantize(v, q) {
  const r = Math.round(v / q) * q;
  return r === 0 ? 0 : r;
}
