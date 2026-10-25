// İç mekân göz uyumu: kamera bir binanın içindeyken (haritanın `interiors` kutuları) pozlama ve gök ışığı artar.
// Bina içini güneş görmez (duvar ve kat gölgesi), tek ışığı yarım küre gök ışığıdır; pozlama dışarıya göre ayarlı
// olduğundan içerisi ve içerideki askerler loş kalıyordu. Işık eklemek yerine (her yeni ışık bütün malzemelerin
// gölgelendiricisini yeniden derletir ve her pikselde hesap ekler) iki sayı değişir: ton eşleme pozlaması ve gök
// ışığının şiddeti. Ayarlar config.js → INDOOR.
import { INDOOR } from './config.js';

// p: { x, y, z }; boxes: [{ minx, maxx, miny, maxy, minz, maxz, exposure?, hemi? }] → içindeki ilk kutu ya da null
export function interiorAt(p, boxes) {
  if (!boxes) return null;
  for (const b of boxes) {
    if (p.x >= b.minx && p.x <= b.maxx && p.y >= b.miny && p.y <= b.maxy && p.z >= b.minz && p.z <= b.maxz) return b;
  }
  return null;
}

// Hedefe üstel yaklaşım (kare hızından bağımsız): rate 1/s
export function approach(cur, target, rate, dt) {
  return target + (cur - target) * Math.exp(-rate * Math.max(0, dt));
}

// k: 0 dışarı … 1 içeri → { exposure, hemi } çarpanları (kutunun kendi değeri yoksa INDOOR)
export function indoorMultipliers(k, box) {
  const e = box?.exposure ?? INDOOR.exposure;
  const h = box?.hemi ?? INDOOR.hemi;
  return { exposure: 1 + (e - 1) * k, hemi: 1 + (h - 1) * k };
}

export class IndoorLight {
  constructor(game) {
    this.game = game;
    this.k = 0;
    this.box = null; // son içinde bulunulan kutu (çıkarken onun değerleriyle söner)
  }

  // Yeni harita: dışarıda başla
  reset() {
    this.k = 0;
    this.box = null;
    this.apply();
  }

  // snap: geçiş beklemeden (ışınlanma, ölçüm)
  update(dt, snap = false) {
    const g = this.game;
    const inside = interiorAt(g.camera.position, g.mission?.data?.interiors);
    if (inside) this.box = inside;
    const target = inside ? 1 : 0;
    const before = this.k;
    this.k = snap ? target : approach(this.k, target, target > this.k ? INDOOR.inRate : INDOOR.outRate, dt);
    if (this.k < 1e-3 && !inside) this.k = 0;
    if (this.k !== before || snap) this.apply();
  }

  apply() {
    const g = this.game;
    if (!g.env) return;
    const m = indoorMultipliers(this.k, this.box);
    g.renderer.toneMappingExposure = g.env.exposure * m.exposure;
    if (g.hemi) g.hemi.intensity = g.env.hemi[2] * m.hemi;
  }
}
