// Genel matematik ve yardımcı fonksiyonlar. Her modül buradan içe aktarır.
import * as THREE from 'three';
import { inCone } from '../shared/sim/rng.js';
// Saf matematik paylaşılan simülasyonda (sunucu da aynısını kullanır)
export { DEG, clamp, lerp, smoothstep, damp, quantize } from '../shared/sim/math.js';
export { MinHeap } from '../shared/sim/heap.js';

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dampAngle(a, b, speed, dt) {
  return a + angleDiff(a, b) * (1 - Math.exp(-speed * dt));
}

// Yaw (y ekseni) açısından ileri vektör. yaw=0 → -Z (kuzey).
export function yawToDir(yaw, out = new THREE.Vector3()) {
  return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}

export function dirToYaw(dx, dz) {
  return Math.atan2(-dx, -dz);
}

// Koni içinde rastgele yön: merkeze hafif yığılmalı dağılım (gerçekçi saçılma).
// Kozmetik/yapay zekâ kullanımı Math.random ile; oyuncu silahı tohumlu Rng ile (shared/sim/rng.js inCone)
const MATH_RNG = { next: () => Math.random() };
export function randomInCone(dir, halfAngleRad, out = new THREE.Vector3(), centerBias = 1.0) {
  return inCone(dir, halfAngleRad, out, centerBias, MATH_RNG);
}

// Işın - dikey silindir kesişimi (oyuncu vuruş kutusu)
export function rayCylinder(o, d, cx, cz, r, y0, y1, maxT) {
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return -1;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxT) return -1;
  const y = o.y + d.y * t;
  if (y < y0 || y > y1) return -1;
  return t;
}

// Yay-sönüm (spring-damper) — prosedürel animasyonların temel taşı.
export class Spring {
  constructor(stiffness = 120, damping = 14) {
    this.k = stiffness;
    this.c = damping;
    this.x = 0;
    this.v = 0;
    this.target = 0;
  }
  impulse(v) {
    this.v += v;
  }
  update(dt) {
    const a = -this.k * (this.x - this.target) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  reset() {
    this.x = 0;
    this.v = 0;
  }
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Tarayıcı depolaması kapalı olabilir (gizli pencere, önizleme); her erişim korumalı.
export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* depolama yoksa sessizce geç */
    }
  },
};

// Eksik veri oyunu çökertmesin: bir kez uyar, devam et (master prompt §6.9).
const warned = new Set();
export function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[DemirSafak] ${msg}`);
}

// Basit olay yayıcı: sistemler arası gevşek bağlılık (UE'deki delegate'lerin karşılığı).
export class Emitter {
  constructor() {
    this.map = new Map();
  }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, []);
    this.map.get(evt).push(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) {
    const arr = this.map.get(evt);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  emit(evt, ...args) {
    const arr = this.map.get(evt);
    if (!arr) return;
    for (const fn of arr.slice()) fn(...args);
  }
}
