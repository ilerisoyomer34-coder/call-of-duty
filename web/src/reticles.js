// Nişangâh görselleri (data/sights.json türleri): kolimatör/holografik/prizmatik işaretleri tuvale çizilir ve
// silah modelinin camında düzlem olarak gösterilir; dürbün işaretleri HUD kaplamasına SVG olarak yazılır.
// Nişan alırken kapalı gövdenin yerine geçen açık gövdeler (tüp, ACOG, holografik pencere) ve demir
// nişangâhın ışıklı noktaları (tritium, fiber) da burada kurulur. İşaretin ortası her zaman nişan noktasıdır.
import * as THREE from 'three';

const TEX = 256; // işaret tuvali kenarı (piksel)
const texCache = new Map();
let lensTex = null;

// Aydınlatmalı çizginin ortası beyaza yakın: gerçek kolimatörde ışık çekirdeği doygunluğunu yitirir
function coreColor(hex) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(1, 1, 1), 0.35);
  return `#${c.getHexString()}`;
}

// Çizim yordamları: koordinatlar -1..1 (0,0 nişan noktası, +y aşağı). c: 2B bağlam, u: birim (piksel)
const DRAW = {
  // Kırmızı nokta (2 MOA)
  dot(c, u) {
    disc(c, 0, 0, 0.12 * u);
  },
  // Kobra: ucu nişan noktasında ters V, altında kısa direk
  chevron(c, u) {
    c.lineWidth = 0.085 * u;
    c.lineJoin = 'miter';
    c.beginPath();
    c.moveTo(-0.42 * u, 0.4 * u);
    c.lineTo(0, 0);
    c.lineTo(0.42 * u, 0.4 * u);
    c.stroke();
    c.beginPath();
    c.moveTo(0, 0.62 * u);
    c.lineTo(0, 0.96 * u);
    c.stroke();
  },
  // Mini refleks: ince halka + nokta
  circleDot(c, u) {
    c.lineWidth = 0.065 * u;
    ring(c, 0.62 * u);
    disc(c, 0, 0, 0.1 * u);
  },
  // Holografik (65 MOA halka + 1 MOA nokta): halkanın dört yanında içe bakan kısa çentikler
  holo(c, u) {
    c.lineWidth = 0.055 * u;
    ring(c, 0.8 * u);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * 0.8 * u, Math.sin(a) * 0.8 * u);
      c.lineTo(Math.cos(a) * 0.66 * u, Math.sin(a) * 0.66 * u);
      c.stroke();
    }
    disc(c, 0, 0, 0.05 * u);
  },
  // Kolimatör artı: nokta ve ortası boş dört çizgi
  crossDot(c, u) {
    disc(c, 0, 0, 0.09 * u);
    c.lineWidth = 0.065 * u;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * 0.32 * u, Math.sin(a) * 0.32 * u);
      c.lineTo(Math.cos(a) * 0.76 * u, Math.sin(a) * 0.76 * u);
      c.stroke();
    }
  },
  // ACOG: aydınlatmalı ok + kazınmış (siyah) menzil çizgileri ve yatay kıl; yalnız ok parlar
  chevronBdc(c, u) {
    c.save();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(12,12,12,0.92)';
    c.lineWidth = 0.022 * u;
    c.beginPath();
    c.moveTo(-0.98 * u, 0);
    c.lineTo(-0.5 * u, 0);
    c.moveTo(0.5 * u, 0);
    c.lineTo(0.98 * u, 0);
    c.moveTo(0, 0.3 * u);
    c.lineTo(0, 0.92 * u);
    const stadia = [[0.4, 0.2], [0.54, 0.15], [0.68, 0.11], [0.82, 0.08]];
    for (const [y, w] of stadia) {
      c.moveTo(-w * u, y * u);
      c.lineTo(w * u, y * u);
    }
    c.stroke();
    c.restore();
    c.lineWidth = 0.05 * u;
    c.lineJoin = 'miter';
    c.beginPath();
    c.moveTo(-0.17 * u, 0.22 * u);
    c.lineTo(0, 0);
    c.lineTo(0.17 * u, 0.22 * u);
    c.stroke();
    disc(c, 0, 0, 0.02 * u);
  },
};

// Testler katalogdaki her işaretin bir çizimi olduğunu denetler
export const RETICLE_NAMES = Object.keys(DRAW);

function disc(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function ring(c, r) {
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.stroke();
}

// İşaret dokusu (türe göre önbellekte): önce renkli parıltı, üstüne açık renkli çekirdek
export function reticleTexture(spec) {
  const key = `${spec.reticle}|${spec.color}`;
  let tex = texCache.get(key);
  if (tex) return tex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = TEX;
  const c = cv.getContext('2d');
  const u = TEX / 2 - 6;
  const draw = DRAW[spec.reticle] || DRAW.dot;
  c.translate(TEX / 2, TEX / 2);
  c.lineCap = 'round';
  // Parıltı katmanı
  c.save();
  c.shadowColor = spec.color;
  c.shadowBlur = TEX * 0.035;
  c.fillStyle = c.strokeStyle = spec.color;
  c.globalAlpha = 0.85;
  draw(c, u);
  c.restore();
  // Çekirdek
  c.fillStyle = c.strokeStyle = coreColor(spec.color);
  draw(c, u);
  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

// Kolimatör işareti düzlemi. Boyu ekran oranından: tam nişanda kameraya uzaklığı dist, görünüm modeli
// kamerasının dikey açısı vmFov (derece) iken ekran yüksekliğinin spec.size kadarını kaplar
export function reticleMesh(spec, dist, vmFov) {
  const h = 2 * dist * Math.tan(((vmFov / 2) * Math.PI) / 180) * spec.size;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(h, h),
    new THREE.MeshBasicMaterial({ map: reticleTexture(spec), transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0 })
  );
  m.renderOrder = 8;
  m.visible = false;
  return m;
}

// Cam: ortası saydam, kenara doğru kaplama rengi koyulaşır; çaprazında soluk bir yansıma
function lensTexture() {
  if (lensTex) return lensTex;
  const n = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(n / 2, n / 2, n * 0.18, n / 2, n / 2, n * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  c.fillStyle = g;
  c.fillRect(0, 0, n, n);
  const s = c.createLinearGradient(0, 0, n, n);
  s.addColorStop(0.2, 'rgba(255,255,255,0)');
  s.addColorStop(0.3, 'rgba(255,255,255,0.22)');
  s.addColorStop(0.36, 'rgba(255,255,255,0)');
  c.fillStyle = s;
  c.fillRect(0, 0, n, n);
  lensTex = new THREE.CanvasTexture(cv);
  lensTex.colorSpace = THREE.SRGBColorSpace;
  return lensTex;
}

export function lensMaterial(color, opacity = 0.45) {
  return new THREE.MeshBasicMaterial({ map: lensTexture(), color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
}

const bodyMat = () => new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide });
const rubberMat = () => new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide });

function tubeZ(group, r, len, z, material, seg = 28) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.z = z;
  group.add(m);
  return m;
}

function annulus(group, r0, r1, z, material) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 28), material);
  m.position.z = z;
  group.add(m);
  return m;
}

function box(group, w, h, d, x, y, z, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

// Nişan alırken modelin kapalı nişangâh gövdesinin yerine geçen açık gövde. Köken gez noktası, gövde önünde (-Z).
// tube: kırmızı nokta tüpü; acog: kalın lastik göz kapağı + dürbün gövdesi + geniş objektif; box: holografik pencere
export function housingMesh(h, spec) {
  const g = new THREE.Group();
  const body = bodyMat();
  const lens = lensMaterial(spec.lens || '#8090a0');
  const z0 = -0.004;
  if (h.shape === 'box') {
    const { w, len } = h;
    const hh = h.h;
    const t = 0.0035;
    const zc = z0 - len / 2;
    box(g, w + 2 * t, 0.007, len, 0, hh / 2 + 0.0035, zc, body); // üst siper
    box(g, w + 2 * t, 0.006, len * 0.9, 0, -hh / 2 - 0.003, zc, body); // taban
    box(g, t, hh, len, -w / 2 - t / 2, 0, zc, body);
    box(g, t, hh, len, w / 2 + t / 2, 0, zc, body);
    // Ön ve arka pencere camı (holografik nişangâhta iki cam)
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), lens);
    front.position.z = z0 - len + 0.002;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), lensMaterial(spec.lens, 0.2));
    back.position.z = z0 - 0.002;
    g.add(front, back);
    // Kumanda düğmeleri (sağ yanda)
    box(g, 0.004, 0.006, 0.008, w / 2 + t + 0.002, -hh * 0.2, zc + len * 0.25, body);
    box(g, 0.004, 0.006, 0.008, w / 2 + t + 0.002, -hh * 0.2, zc + len * 0.05, body);
  } else if (h.shape === 'acog') {
    const { r, len } = h;
    const rubber = rubberMat();
    // Göz kapağı: kalın lastik halka; sonra ince gövde ve öne doğru genişleyen objektif
    tubeZ(g, r * 1.2, len * 0.18, z0 - len * 0.09, rubber);
    annulus(g, r * 0.94, r * 1.2, z0, rubber);
    tubeZ(g, r * 1.05, len * 0.55, z0 - len * 0.18 - len * 0.275, body);
    const bell = new THREE.CylinderGeometry(r * 1.32, r * 1.05, len * 0.27, 28, 1, true);
    bell.rotateX(-Math.PI / 2);
    const bm = new THREE.Mesh(bell, body);
    bm.position.z = z0 - len * 0.73 - len * 0.135;
    g.add(bm);
    annulus(g, r * 1.12, r * 1.36, z0 - len, body);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(r * 1.12, 28), lens);
    glass.position.z = z0 - len + 0.001;
    g.add(glass);
    // Üstteki fiber optik toplayıcı (ACOG'un ayırt edici sırtı)
    box(g, 0.006, 0.004, len * 0.5, 0, r * 1.05 + 0.002, z0 - len * 0.45, new THREE.MeshStandardMaterial({ color: 0x8a3a1a, roughness: 0.5, metalness: 0.1 }));
  } else {
    const { r, len } = h;
    tubeZ(g, r, len, z0 - len / 2, body);
    annulus(g, r * 0.94, r * 1.18, z0, body);
    annulus(g, r * 0.94, r * 1.24, z0 - len, body);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 28), lens);
    glass.position.z = z0 - len + 0.001;
    g.add(glass);
  }
  g.visible = false;
  return g;
}

// Demir nişangâhın ışıklı noktaları (tritium yeşil, fiber kırmızı): göze bakan küçük diskler; glowPost verilmişse
// noktanın altına arpacık direği
export function glowDots(spec, points, post = 0) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: spec.glowColor || '#62ff7c', toneMapped: false });
  const geo = new THREE.CircleGeometry(post ? 0.0011 : 0.00085, 12);
  for (const p of points) {
    const d = new THREE.Mesh(geo, m);
    d.position.set(p[0], p[1], p[2] + 0.0006);
    d.renderOrder = 4;
    g.add(d);
    if (post) box(g, 0.003, post, 0.004, p[0], p[1] - post / 2, p[2] - 0.0015, bodyMat());
  }
  return g;
}

// --- Dürbün kaplaması (HUD, SVG viewBox -100..100) ---
const lineH = (x1, x2, y, w, c) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${c}" stroke-width="${w}"/>`;
const lineV = (x, y1, y2, w, c) => `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`;
const dotAt = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;

const SCOPE = {
  // Mil-dot: kalın dış kıllar, ince orta kıl, her 10 birimde nokta; ortada kırmızı nokta
  mildot(s) {
    const c = s.color;
    let o = lineH(-100, -7, 0, 1.6, c) + lineH(7, 100, 0, 1.6, c) + lineV(0, -100, -7, 1.6, c) + lineV(0, 7, 100, 1.6, c);
    o += lineH(-100, -55, 0, 4, c) + lineH(55, 100, 0, 4, c) + lineV(0, 55, 100, 4, c);
    o += lineH(-7, 7, 0, 0.5, c) + lineV(0, -7, 7, 0.5, c);
    for (const v of [14, 24, 34, 44]) o += dotAt(-v, 0, 1.3, c) + dotAt(v, 0, 1.3, c) + dotAt(0, v, 1.3, c);
    for (const v of [14, 24, 34]) o += dotAt(0, -v, 1.3, c);
    return o + dotAt(0, 0, 0.9, s.accent || '#ff3a22');
  },
  // Duplex: dışta kalın direkler, ortada incelen artı (orta noktası yok)
  duplex(s) {
    const c = s.color;
    let o = lineH(-100, -32, 0, 5, c) + lineH(32, 100, 0, 5, c) + lineV(0, -100, -32, 5, c) + lineV(0, 32, 100, 5, c);
    o += lineH(-32, 32, 0, 0.7, c) + lineV(0, -32, 32, 0.7, c);
    return o;
  },
  // Alman tipi direkli: sol/sağ kalın direkler, alttan sivri direk, ince yatay kıl, aydınlatmalı orta nokta
  post(s) {
    const c = s.color;
    let o = `<rect x="-100" y="-3.2" width="84" height="6.4" fill="${c}"/><rect x="16" y="-3.2" width="84" height="6.4" fill="${c}"/>`;
    o += `<polygon points="-4,100 4,100 4,14 0,4 -4,14" fill="${c}"/>`;
    o += lineH(-16, 16, 0, 0.45, c);
    o += `<circle cx="0" cy="0" r="2.6" fill="${s.accent}" opacity="0.28"/>`;
    return o + dotAt(0, 0, 1.1, s.accent || '#ff2a14');
  },
};

export const SCOPE_RETICLES = Object.keys(SCOPE);

// Silahın dürbün işareti (svg içeriği). Bilinmeyen tür mil-dot çizer
export function scopeSvg(spec) {
  return (SCOPE[spec.reticle] || SCOPE.mildot)(spec);
}
