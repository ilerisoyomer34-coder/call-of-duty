// Çevrim içi el bombası ve sis bombası: atış, sekme ve patlama hesabı. Sunucu (server/game/sim.js) bombayı yetkili
// olarak yürütür; istemci aynı adımı aynı dünyada yürüterek bombayı çizer (yörünge ayrışmaz, konum her tick
// gönderilmez). Patlama ve hasar yalnız sunucudan (NEV.BLAST). DOM, THREE, rastgelelik yok; vektörler düz nesne.
import { ONLINE } from '../../src/config.js';

const N = ONLINE.nades;
const _d = { x: 0, y: 0, z: 0 };
const _hit = {};

export const NADE_KIND = { FRAG: 0, SMOKE: 1 };

// Atış: göz hizasından bakış yönüne, oyuncunun yatay hızının bir kısmı eklenir (tek oyunculu GRENADE ile aynı his)
// eye: göz noktası, yaw/pitch: komutun bakışı, vel: oyuncunun hızı
export function createThrow(eye, yaw, pitch, vel, kind) {
  const cp = Math.cos(pitch);
  const fx = -Math.sin(yaw) * cp;
  const fy = Math.sin(pitch);
  const fz = -Math.cos(yaw) * cp;
  return {
    kind,
    pos: { x: eye.x + fx * N.spawnAhead, y: eye.y + fy * N.spawnAhead, z: eye.z + fz * N.spawnAhead },
    vel: { x: fx * N.throwSpeed + vel.x * N.inherit, y: fy * N.throwSpeed + N.upBoost, z: fz * N.throwSpeed + vel.z * N.inherit },
    fuse: kind === NADE_KIND.SMOKE ? N.smoke.fuse : N.fuse,
    rest: false,
  };
}

// Bir adım: yerçekimi, dünyaya çarpınca yüzeye göre yansıma ve sönüm; durunca yerinde kalır.
// → true: sert sekme (ses)
export function stepGrenade(g, world, dt) {
  g.fuse -= dt;
  if (g.rest) return false;
  const v = g.vel;
  v.y -= N.gravity * dt;
  let bounced = false;
  const speed = Math.hypot(v.x, v.y, v.z);
  const step = speed * dt;
  if (step > 1e-5) {
    _d.x = v.x / speed;
    _d.y = v.y / speed;
    _d.z = v.z / speed;
    const h = world.raycast(g.pos, _d, step + 0.06, _hit);
    if (h) {
      g.pos.x = h.point.x + h.normal.x * 0.07;
      g.pos.y = h.point.y + h.normal.y * 0.07;
      g.pos.z = h.point.z + h.normal.z * 0.07;
      const vn = v.x * h.normal.x + v.y * h.normal.y + v.z * h.normal.z;
      const k = (1 + N.bounce) * vn;
      v.x = (v.x - h.normal.x * k) * N.bounceKeep;
      v.y = (v.y - h.normal.y * k) * N.bounceKeep;
      v.z = (v.z - h.normal.z * k) * N.bounceKeep;
      bounced = Math.abs(vn) > 1.5;
      if (h.normal.y > 0.7 && Math.hypot(v.x, v.y, v.z) < 0.8) settle(g);
    } else {
      g.pos.x += v.x * dt;
      g.pos.y += v.y * dt;
      g.pos.z += v.z * dt;
    }
  }
  // Zemin (y = 0)
  if (g.pos.y < 0.05) {
    g.pos.y = 0.05;
    if (v.y < 0) v.y *= -0.3;
    v.x *= 0.7;
    v.z *= 0.7;
    if (Math.hypot(v.x, v.y, v.z) < 0.6) settle(g);
  }
  return bounced;
}

function settle(g) {
  g.rest = true;
  g.vel.x = g.vel.y = g.vel.z = 0;
}

// Patlama hasarı katsayısı: uzaklıkla azalır, görüş hattı yoksa (siper arkası) çok az (tek oyunculuyla aynı eğri)
export function blastFactor(dist, los) {
  if (dist >= N.radius) return 0;
  return Math.pow(1 - dist / N.radius, N.falloff) * (los ? 1 : N.coverMult);
}

// Sis bulutunun yoğunluğu (0–1): önce kabarır, sonunda söner
export function smokeDensity(age) {
  const S = N.smoke;
  const left = S.duration - age;
  if (left <= 0) return 0;
  return Math.min(1, age / S.grow) * Math.min(1, left / S.fade);
}

// a → b doğrusu yoğun bir bulutun içinden geçiyor mu? smokes: [{ x, y, z, age }] (merkez bulutun ortası)
export function smokeBlocksLine(smokes, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  for (const s of smokes) {
    const r = N.smoke.radius * smokeDensity(s.age);
    if (r <= 0.3) continue;
    const t = Math.max(0, Math.min(1, ((s.x - a.x) * abx + (s.y - a.y) * aby + (s.z - a.z) * abz) / len2));
    const dx = a.x + abx * t - s.x;
    const dy = a.y + aby * t - s.y;
    const dz = a.z + abz * t - s.z;
    if (dx * dx + dy * dy + dz * dz < r * r) return true;
  }
  return false;
}
