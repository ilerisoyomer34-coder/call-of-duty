// Prosedürel dokular: harici asset yok, her şey canvas'ta üretilir (lisans derdi yok).
import * as THREE from 'three';

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Döşenebilir (tileable) değer gürültüsü.
function makeNoise(period, seed) {
  const rnd = mulberry32(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = g[y0 * period + x0];
    const b = g[y0 * period + x1];
    const c = g[y1 * period + x0];
    const d = g[y1 * period + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbmFactory(basePeriod, octaves, seed) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(makeNoise(basePeriod << o, seed + o * 101));
  return (u, v) => {
    // u,v ∈ [0,1)
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const p = basePeriod << o;
      sum += layers[o](u * p, v * p) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function fillPixels(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, out, x, y);
      const i = (y * size + x) * 4;
      d[i] = out[0];
      d[i + 1] = out[1];
      d[i + 2] = out[2];
      d[i + 3] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function createTextures(quality = 'high') {
  const big = quality === 'low' ? 256 : 512;
  const mid = quality === 'low' ? 128 : 256;
  const T = {};

  // Kum: sıcak tonlar, rüzgâr dalgacıkları ve çakıllar.
  {
    const n = fbmFactory(4, 5, 11);
    const r = fbmFactory(16, 2, 17);
    T.sand = toTexture(
      fillPixels(big, (u, v, o) => {
        const a = n(u, v);
        const ripple = Math.sin((v * 40 + r(u, v) * 6) * Math.PI) * 0.04;
        const peb = r(u * 3 % 1, v * 3 % 1) > 0.78 ? -0.12 : 0;
        const k = 0.78 + a * 0.35 + ripple + peb;
        o[0] = clamp255(196 * k);
        o[1] = clamp255(166 * k);
        o[2] = clamp255(122 * k);
      })
    );
  }
  // Toprak yol
  {
    const n = fbmFactory(4, 5, 23);
    T.dirt = toTexture(
      fillPixels(mid, (u, v, o) => {
        const a = n(u, v);
        const k = 0.62 + a * 0.45;
        o[0] = clamp255(150 * k);
        o[1] = clamp255(122 * k);
        o[2] = clamp255(90 * k);
      })
    );
  }
  // Beton: gri, lekeli, ince çatlaklar.
  {
    const n = fbmFactory(4, 5, 31);
    const s = fbmFactory(2, 3, 37);
    T.concrete = toTexture(
      fillPixels(mid, (u, v, o) => {
        const a = n(u, v);
        const stain = s(u, v);
        let k = 0.72 + a * 0.3 - Math.max(0, stain - 0.6) * 0.5;
        if (Math.abs(n(u * 0.5 + 0.3, v) - 0.5) < 0.006) k -= 0.18;
        o[0] = clamp255(158 * k);
        o[1] = clamp255(154 * k);
        o[2] = clamp255(146 * k);
      })
    );
  }
  // Sıva (köy evleri): sıcak bej, dökülmüş yamalar.
  {
    const n = fbmFactory(4, 5, 41);
    const p = fbmFactory(3, 3, 43);
    T.plaster = toTexture(
      fillPixels(mid, (u, v, o) => {
        const a = n(u, v);
        const patch = p(u, v) > 0.66;
        let k = 0.82 + a * 0.2;
        let r = 205, g = 184, b = 150;
        if (patch) {
          r = 150; g = 128; b = 104; k *= 0.95;
        }
        k -= Math.max(0, v - 0.85) * 0.6; // alt kısımda kir
        o[0] = clamp255(r * k);
        o[1] = clamp255(g * k);
        o[2] = clamp255(b * k);
      })
    );
  }
  // Oluklu metal (konteyner): gri tonlu, renk materyalden gelir.
  {
    const n = fbmFactory(4, 4, 51);
    const rust = fbmFactory(3, 4, 53);
    T.corrugated = toTexture(
      fillPixels(mid, (u, v, o) => {
        const ridge = Math.sin(u * Math.PI * 2 * 16);
        let k = 0.8 + ridge * 0.12 + n(u, v) * 0.12;
        const rr = rust(u, v);
        let r = 230 * k, g = 230 * k, b = 230 * k;
        if (rr > 0.62) {
          const t = Math.min(1, (rr - 0.62) * 5);
          r = r * (1 - t) + 150 * t * k;
          g = g * (1 - t) + 90 * t * k;
          b = b * (1 - t) + 60 * t * k;
        }
        o[0] = clamp255(r);
        o[1] = clamp255(g);
        o[2] = clamp255(b);
      })
    );
  }
  // Düz metal
  {
    const n = fbmFactory(8, 4, 61);
    T.metal = toTexture(
      fillPixels(mid, (u, v, o) => {
        const k = 0.75 + n(u, v) * 0.3 + Math.sin(v * 200) * 0.01;
        o[0] = clamp255(210 * k);
        o[1] = clamp255(212 * k);
        o[2] = clamp255(214 * k);
      })
    );
  }
  // Ahşap tahta
  {
    const n = fbmFactory(2, 4, 71);
    const g = fbmFactory(8, 3, 73);
    T.wood = toTexture(
      fillPixels(mid, (u, v, o) => {
        const plank = Math.floor(v * 5);
        const seam = (v * 5) % 1 < 0.04 ? 0.55 : 1;
        const grain = Math.sin((u * 30 + n(u, (v + plank * 0.37) % 1) * 8) * Math.PI) * 0.08;
        const k = (0.7 + g(u, v) * 0.25 + grain + ((plank * 7919) % 5) * 0.03) * seam;
        o[0] = clamp255(165 * k);
        o[1] = clamp255(122 * k);
        o[2] = clamp255(78 * k);
      })
    );
  }
  // Kum torbası: tuğla düzeninde yuvarlak torbalar.
  {
    const n = fbmFactory(8, 4, 81);
    T.sandbag = toTexture(
      fillPixels(mid, (u, v, o) => {
        const rows = 4;
        const row = Math.floor(v * rows);
        const off = row % 2 ? 0.25 : 0;
        const cu = ((u * 2 + off) % 1) * 2 - 1;
        const cv = ((v * rows) % 1) * 2 - 1;
        const bag = 1 - Math.pow(Math.max(Math.abs(cu) * 0.9, Math.abs(cv)), 6);
        const k = (0.45 + bag * 0.5) * (0.85 + n(u, v) * 0.25);
        o[0] = clamp255(190 * k);
        o[1] = clamp255(170 * k);
        o[2] = clamp255(125 * k);
      })
    );
  }
  // Kaya
  {
    const n = fbmFactory(3, 6, 91);
    T.rock = toTexture(
      fillPixels(mid, (u, v, o) => {
        const a = n(u, v);
        const k = 0.5 + a * 0.6;
        o[0] = clamp255(160 * k);
        o[1] = clamp255(138 * k);
        o[2] = clamp255(112 * k);
      })
    );
  }
  // Branda / kumaş
  {
    const n = fbmFactory(8, 3, 97);
    T.canvas = toTexture(
      fillPixels(mid, (u, v, o) => {
        const weave = (Math.sin(u * 300) + Math.sin(v * 300)) * 0.02;
        const k = 0.8 + n(u, v) * 0.2 + weave;
        o[0] = clamp255(200 * k);
        o[1] = clamp255(200 * k);
        o[2] = clamp255(200 * k);
      })
    );
  }

  // Kar: mavimsi beyaz, rüzgâr izleri ve parıltılar
  {
    const n = fbmFactory(4, 5, 141);
    const r = fbmFactory(12, 2, 143);
    T.snow = toTexture(
      fillPixels(mid, (u, v, o) => {
        const a = n(u, v);
        const drift = Math.sin((u * 18 + r(u, v) * 5) * Math.PI) * 0.025;
        const k = 0.86 + a * 0.16 + drift;
        const sparkle = r((u * 7) % 1, (v * 7) % 1) > 0.9 ? 0.06 : 0;
        o[0] = clamp255(228 * k + sparkle * 255);
        o[1] = clamp255(236 * k + sparkle * 255);
        o[2] = clamp255(246 * k + sparkle * 255);
      })
    );
  }
  // Asfalt: koyu gri, çakıl taneleri, yama izleri
  {
    const n = fbmFactory(8, 4, 151);
    const pt = fbmFactory(2, 3, 153);
    T.asphalt = toTexture(
      fillPixels(mid, (u, v, o) => {
        const grain = n(u, v);
        const patch = pt(u, v) > 0.64 ? 0.85 : 1;
        const k = (0.55 + grain * 0.35) * patch;
        o[0] = clamp255(92 * k);
        o[1] = clamp255(92 * k);
        o[2] = clamp255(96 * k);
      })
    );
  }
  // Tuğla: harç çizgili, tuğla başına renk farkı, is lekeleri
  {
    const n = fbmFactory(4, 4, 161);
    const soot = fbmFactory(2, 3, 163);
    T.brick = toTexture(
      fillPixels(mid, (u, v, o) => {
        const rows = 8;
        const row = Math.floor(v * rows);
        const uu = u * 4 + (row % 2 ? 0.5 : 0);
        const col = Math.floor(uu);
        const mortar = (v * rows) % 1 < 0.1 || uu % 1 < 0.05;
        const tone = 0.82 + (((row * 31 + col * 17) % 7) / 7) * 0.25;
        let k = mortar ? 0.75 : tone * (0.85 + n(u, v) * 0.2);
        k *= 1 - Math.max(0, soot(u, v) - 0.55) * 0.9;
        o[0] = clamp255((mortar ? 170 : 150) * k);
        o[1] = clamp255((mortar ? 162 : 82) * k);
        o[2] = clamp255((mortar ? 150 : 62) * k);
      })
    );
  }

  // --- Çıkartmalar (decal) ve parçacık dokuları (tekrarsız, alfa kanallı) ---
  const radial = (size, fn) => toTexture(fillPixels(size, fn), { repeat: false });

  T.bulletHole = radial(64, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2;
    const hole = d < 0.18 ? 1 : 0;
    const ring = Math.max(0, 1 - Math.abs(d - 0.3) * 4) * 0.7;
    const soot = Math.max(0, 1 - d) * 0.45;
    o[0] = o[1] = o[2] = hole ? 10 : 35;
    o[3] = clamp255((Math.max(hole, ring, soot)) * 255 * (d < 1 ? 1 : 0));
  });
  T.blood = radial(128, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2;
    const ang = Math.atan2(dy, dx);
    const edge = 0.55 + Math.sin(ang * 7) * 0.08 + Math.sin(ang * 13 + 1) * 0.06;
    const drops = Math.sin(ang * 23) > 0.7 && d < 0.95 && d > 0.6 ? 1 : 0;
    const a = d < edge ? 1 : drops;
    o[0] = 95; o[1] = 8; o[2] = 8;
    o[3] = clamp255(a * 220);
  });
  T.scorch = radial(128, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2;
    const ang = Math.atan2(dy, dx);
    const edge = 0.8 + Math.sin(ang * 9) * 0.1;
    o[0] = o[1] = o[2] = 12;
    o[3] = clamp255(Math.max(0, 1 - d / edge) * 240);
  });
  T.soft = radial(64, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2;
    o[0] = o[1] = o[2] = 255;
    o[3] = clamp255(Math.pow(Math.max(0, 1 - d), 1.6) * 255);
  });
  {
    const n = fbmFactory(4, 4, 131);
    T.smoke = radial(128, (u, v, o) => {
      const dx = u - 0.5, dy = v - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, 1 - d) * (0.55 + n(u, v) * 0.7);
      o[0] = o[1] = o[2] = 255;
      o[3] = clamp255(Math.pow(a, 1.3) * 255);
    });
  }
  // Namlu alevi: yıldız biçimli, parlak merkez.
  T.flash = radial(128, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2;
    const ang = Math.atan2(dy, dx);
    const spikes = Math.pow(Math.abs(Math.cos(ang * 2.5)), 8) * 0.9;
    const core = Math.max(0, 1 - d * 2.2);
    const a = Math.max(core, Math.max(0, spikes - d * 1.05)) + Math.max(0, 1 - d) * 0.25;
    o[0] = 255;
    o[1] = clamp255(200 + core * 55);
    o[2] = clamp255(120 + core * 135);
    o[3] = clamp255(Math.min(1, a) * 255);
  });
  T.flashSide = radial(128, (u, v, o) => {
    // Yandan görünen alev: namlu ekseni boyunca uzun koni
    const dy = (v - 0.5) * 2;
    const along = u;
    const width = 0.15 + along * 0.55;
    const a = Math.max(0, 1 - Math.abs(dy) / width) * Math.pow(1 - along, 0.7) * (0.8 + Math.sin(along * 40) * 0.2);
    o[0] = 255;
    o[1] = clamp255(180 + (1 - along) * 70);
    o[2] = clamp255(90 + (1 - along) * 120);
    o[3] = clamp255(a * 255);
  });
  return T;
}
