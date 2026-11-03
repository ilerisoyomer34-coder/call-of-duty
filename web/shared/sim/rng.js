// Tohumlu rastgelelik (belge §5.2/1, §5.5). Simülasyonda Math.random yasak: aynı tohum aynı diziyi verir,
// böylece sunucu ile tekrar oynatma aynı saçılmayı üretir. Sunucuda tohum hash(serverSecret, matchId, playerId, seq).

// mulberry32: 32 bit durumlu, hızlı ve oyun için yeterince düzgün dağılımlı üreteç
export function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tamsayıları tek 32 bit tohuma karıştırır (murmur3 fmix). Dize verilirse karakter kodları katılır.
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  const mix = (k) => {
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  };
  for (const p of parts) {
    if (typeof p === 'string') for (let i = 0; i < p.length; i++) mix(p.charCodeAt(i));
    else mix(p | 0);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  constructor(seed = 1) {
    this.seed(seed);
  }
  seed(s) {
    this.state = s >>> 0;
    this.next = mulberry32(this.state);
    return this;
  }
  range(a = 0, b = 1) {
    return a + this.next() * (b - a);
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
  int(n) {
    return (this.next() * n) | 0;
  }
  pick(arr) {
    return arr[(this.next() * arr.length) | 0];
  }
}

// Koni içinde rastgele yön: merkeze hafif yığılmalı dağılım (src/util.js randomInCone'un saf eşi).
// dir ve out { x, y, z } (THREE.Vector3 de olur); out yerinde yazılır ve döndürülür.
export function inCone(dir, halfAngleRad, out, centerBias, rng) {
  if (halfAngleRad <= 0) {
    out.x = dir.x;
    out.y = dir.y;
    out.z = dir.z;
    return out;
  }
  const r = Math.pow(rng.next(), centerBias) * Math.tan(halfAngleRad);
  const phi = rng.next() * Math.PI * 2;
  // dir'e dik iki eksen: b = dir × a, a = b × dir
  let ax = 0;
  let ay = 1;
  let az = 0;
  if (Math.abs(dir.y) > 0.95) {
    ax = 1;
    ay = 0;
  }
  let bx = dir.y * az - dir.z * ay;
  let by = dir.z * ax - dir.x * az;
  let bz = dir.x * ay - dir.y * ax;
  let l = Math.hypot(bx, by, bz) || 1;
  bx /= l;
  by /= l;
  bz /= l;
  ax = by * dir.z - bz * dir.y;
  ay = bz * dir.x - bx * dir.z;
  az = bx * dir.y - by * dir.x;
  l = Math.hypot(ax, ay, az) || 1;
  ax /= l;
  ay /= l;
  az /= l;
  const c = Math.cos(phi) * r;
  const s = Math.sin(phi) * r;
  let x = dir.x + bx * c + ax * s;
  let y = dir.y + by * c + ay * s;
  let z = dir.z + bz * c + az * s;
  l = Math.hypot(x, y, z) || 1;
  out.x = x / l;
  out.y = y / l;
  out.z = z / l;
  return out;
}
