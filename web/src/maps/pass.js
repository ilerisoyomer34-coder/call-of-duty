// Karlı Dağ Geçidi (kar yağışı): iki yanı sarp kayalıklı dar vadi, kıvrılan toprak yol. Makineli yuvaları
// yolu tarar; vadinin kenarındaki çamlık ve kaya dipleri yuvaların atış yayının dışında kalır.
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-90  [ PLATO · HELİKOPTER PİSTİ ]                          ← dalgalar: batı, doğu, kuzey
//   z=-40  [ SIĞINAK KOMPLEKSİ · istihbarat ]  önünde MAKİNELİ-3 ve -4
//   z= 10  UÇAKSAVAR-1 (çadırlar)   MAKİNELİ-2 (yol)   UÇAKSAVAR-2
//   z= 52  ══ KARAKOL: bariyer, sığınak, gözetleme kulesi, MAKİNELİ-1 ══
//   z= 92  ★ BAŞLANGIÇ (çamlık, devrilmiş kamyon)
import { V, nest, bunker, sandbags, jersey, crate, truck, tower, rock, pine, snowbank, horizon, borderRocks, helipad, mulberry } from './kit.js';

// Toprak yol parçası: iki nokta arası, karın altından görünen koyu şerit
function road(W, a, b, w = 7) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  W.box((a.x + b.x) / 2, 0.01, (a.z + b.z) / 2, w, 0.02, len + w * 0.5, 'dirt', 'sand', { collide: false, rotY: Math.atan2(dx, dz), tint: 0xd8cfc4 });
}

export function build(W) {
  W.bounds = { minx: -54, maxx: 54, minz: -108, maxz: 100 };
  W.block(0, -0.02, 0, 700, 0.02, 700, 'snow', 'sand', { collide: false, skipBottom: true });
  W.floorSurface = 'snow';
  // Karlı sıradağlar ve vadiyi kapatan sarp kayalıklar
  horizon(W, { mat: 'snow', tint: 0xeef3f8, rockTint: 0x8a8e94, moundMat: 'snow', moundTint: 0xf2f6fa, r0: 170, r1: 70, h0: 40, h1: 45, peak: 1.4, inner: [70, 125] });
  borderRocks(W, W.bounds, 17, 0xd6dce2, { scale: 1.7 });
  const pts = [V(0, 104), V(-6, 60), V(4, 20), V(0, -20), V(0, -104)];
  for (let i = 0; i < pts.length - 1; i++) road(W, pts[i], pts[i + 1]);
  // Çamlık: yolun iki yanında seyrek, kenarlarda sık (yol ve yapı alanları boş kalır)
  const rnd = mulberry(29);
  const clear = [[-12, 12, -106, 104], [-44, -16, 0, 28], [18, 46, -12, 28], [-46, 46, -66, -20], [-30, 30, -108, -64], [-36, 38, 36, 70], [-20, 16, 70, 100]];
  for (let i = 0; i < 90; i++) {
    const x = (rnd() - 0.5) * 100;
    const z = -104 + rnd() * 200;
    const h = 6 + rnd() * 5;
    if (clear.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) continue;
    pine(W, x, z, h, true);
  }

  // ===== 1) Başlangıç =====
  truck(W, -10, 88, 1.9, true);
  rock(W, 0, 85, 7, 2.8, 3.2, 0.1, 0xdde2e8); // başlangıç siperi: karakoldaki makineli yola bakıyor
  rock(W, 9, 94, 3.4, 2, 3, 0.4, 0xdde2e8);
  rock(W, -16, 78, 4, 2.4, 3, 1.1, 0xdde2e8);
  snowbank(W, 6, 80, 5, 2.2, 0.9, 0.3);
  snowbank(W, -4, 72, 4, 2, 0.8, -0.2);
  crate(W, 12, 86, 1.1); // roketatar

  // ===== 2) Karakol =====
  jersey(W, -2, 66);
  jersey(W, 6, 64);
  W.block(-10, 0, 60, 0.3, 1.1, 0.3, 'metal', 'metal');
  W.block(-7, 1.0, 60, 6, 0.12, 0.12, 'paint', 'metal', { collide: false, tint: 0xc83a2a });
  bunker(W, 16, 50, 8, 6, { front: 's' });
  W.block(18, 0, 48.5, 1.2, 0.78, 0.6, 'woodDark', 'wood'); // sığınak masası (pompalı)
  tower(W, -24, 56, 5.5, 'tarpTan');
  sandbags(W, -14, 46, 4, true);
  sandbags(W, 26, 58, 3.5, false);
  snowbank(W, -30, 48, 5, 2.4, 0.9, 0.5);
  snowbank(W, 32, 44, 5, 2.4, 0.9, -0.4);
  crate(W, 8, 42, 1.1);
  crate(W, 9.1, 41.5, 0.8, 0, 0.5);

  // ===== 3) Uçaksavar mevkii =====
  // Batı: çadırlar ve sandıklar
  W.block(-36, 0, 20, 5, 2.4, 4, 'tarpTan', 'wood');
  W.block(-36, 2.4, 20, 5.3, 0.4, 4.3, 'tarpTan', 'wood', { collide: false });
  W.block(-24, 0, 4, 4, 2.2, 5, 'tarpGreen', 'wood');
  crate(W, -34, 8, 1.1);
  crate(W, -33, 9, 0.9, 0, 0.4);
  sandbags(W, -30, 18.5, 4, true);
  sandbags(W, -25.5, 13, 3, false);
  // Doğu
  W.block(38, 0, -2, 5, 2.4, 4, 'tarpGreen', 'wood');
  W.block(38, 2.4, -2, 5.3, 0.4, 4.3, 'tarpGreen', 'wood', { collide: false });
  sandbags(W, 30, 7, 4, true);
  sandbags(W, 25.5, 2, 3, false);
  tower(W, 40, 22, 5.5, 'tarpTan');
  truck(W, 12, 6, 0.3);
  snowbank(W, -8, 30, 4, 2, 0.8, 0.2);
  snowbank(W, 14, 34, 5, 2, 0.8, -0.3);
  crate(W, -6, 2, 1.1);

  // ===== 4) Sığınak kompleksi =====
  bunker(W, 0, -44, 16, 10, { front: 's', h: 3 });
  W.block(-4, 0, -46, 2.2, 0.8, 1.0, 'woodDark', 'wood'); // harita masası (istihbarat)
  W.block(5, 0, -40.6, 1.8, 0.8, 0.9, 'wood', 'wood');
  bunker(W, -30, -40, 8, 6, { front: 'e' });
  bunker(W, 30, -44, 8, 6, { front: 'w' });
  sandbags(W, -6, -30, 4, true);
  sandbags(W, 6, -30, 4, true);
  sandbags(W, -20, -52, 4, false);
  tower(W, -32, -58, 5.5, 'tarpTan');
  jersey(W, 0, -24);
  crate(W, 12, -34, 1.1);
  crate(W, -12, -36, 1.0, 0, 0.3);

  // ===== 5) Plato ve helikopter pisti =====
  helipad(W, 0, -90);
  snowbank(W, -14, -78, 6, 2.4, 1.0, 0.1);
  snowbank(W, 13, -80, 5, 2.4, 1.0, -0.2);
  sandbags(W, -12, -100, 4, true);
  sandbags(W, 12, -100, 4, true);
  rock(W, -22, -92, 4, 2.4, 3.5, 0.6, 0xdde2e8);
  rock(W, 24, -94, 4.4, 2.6, 3.6, 1.8, 0xdde2e8);
  crate(W, 10, -88, 1.1);
  truck(W, -24, -70, 1.1, true);

  return {
    playerStart: { pos: V(0, 94), yaw: 0 },
    barrels: [V(-12, 44), V(20, 56), V(-32, 11), V(33, 5), V(-8, -28), V(9, -28.2), V(8, -86)],
    aaGuns: [
      { id: 'aa1', pos: V(-30, 12), yaw: 0.4, label: 'UÇAKSAVAR-1' },
      { id: 'aa2', pos: V(30, 0), yaw: -0.5, label: 'UÇAKSAVAR-2' },
    ],
    laptop: { pos: V(-4, -46, 0.8), yaw: 0 },
    ammoCrates: [V(4, 56), V(-10, 16), V(18, -24), V(-4, -82)],
    weaponPickups: [
      { id: 'rpg', pos: V(12, 86, 1.1), rotY: 0.3 },
      { id: 'shotgun', pos: V(18, 48.5, 0.78), rotY: 0.2 },
      { id: 'sniper', pos: V(-34, 8, 1.1), rotY: 0.5 },
      { id: 'lmg', pos: V(30, 7, 1.05), rotY: 0 },
      { id: 'mar556', pos: V(5, -40.6, 0.8), rotY: 1.2 },
    ],
    lz: V(0, -90),
    heliFrom: V(0, 170),
    checkpoints: [
      { pos: V(0, 94), yaw: 0 },
      { pos: V(-2, 42), yaw: 0 },
      { pos: V(4, 14), yaw: 0 },
      { pos: V(2, -12), yaw: 0 },
      { pos: V(0, -60), yaw: 0 },
      { pos: V(0, -80), yaw: 0 },
    ],
    enemies: [
      // Karakol
      { group: 'outpost', type: 'rifleman', pos: V(-2, 64.6), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(6, 62.6), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-24, 56, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'rifleman', pos: V(16, 49), yaw: Math.PI },
      { group: 'outpost', type: 'shotgunner', pos: V(-14, 44.6), yaw: Math.PI, patrol: [V(-14, 44.6), V(-22, 40), V(-8, 38)] },
      { group: 'outpost', type: 'rifleman', pos: V(24, 62), yaw: Math.PI, patrol: [V(24, 62), V(30, 50), V(22, 42)] },
      { group: 'outpost', type: 'rifleman', pos: V(-30, 44), yaw: 2.4 },
      { group: 'outpost', type: 'heavy', pos: V(8, 44), yaw: Math.PI },
      // Uçaksavar mevkii
      { group: 'village', type: 'rifleman', pos: V(-26, 17.4), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(-38, 10), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(-22, 10), yaw: Math.PI, patrol: [V(-22, 10), V(-14, 22), V(-26, 26)] },
      { group: 'village', type: 'rifleman', pos: V(28, 5.8), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(38, -8), yaw: Math.PI / 2 },
      { group: 'village', type: 'shotgunner', pos: V(22, -4), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(8, 28), yaw: Math.PI, patrol: [V(8, 28), V(8, 0), V(-4, 0), V(-4, 28)] },
      { group: 'village', type: 'heavy', pos: V(0, 8), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(40, 22, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      // Sığınaklar
      { group: 'hq', type: 'rifleman', pos: V(-6, -31.2), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(6, -31.2), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-4, -43), yaw: Math.PI },
      { group: 'hq', type: 'shotgunner', pos: V(4, -44), yaw: Math.PI },
      { group: 'hq', type: 'sniper', pos: V(-32, -58, 5.8), yaw: Math.PI - 0.6, stationary: true, elevated: true },
      { group: 'hq', type: 'rifleman', pos: V(24, -52), yaw: Math.PI, patrol: [V(24, -52), V(24, -30), V(38, -30)] },
      { group: 'hq', type: 'rifleman', pos: V(-24, -26), yaw: Math.PI, patrol: [V(-24, -26), V(-40, -26), V(-40, -50)] },
      { group: 'hq', type: 'heavy', pos: V(0, -56), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-30, -40), yaw: -Math.PI / 2 },
      { group: 'hq', type: 'rifleman', pos: V(30, -44), yaw: Math.PI / 2 },
    ],
    reinforcements: [
      { type: 'rifleman', pos: V(-10, -72) },
      { type: 'rifleman', pos: V(10, -74) },
      { type: 'shotgunner', pos: V(0, -84) },
      { type: 'rifleman', pos: V(40, -60) },
      { type: 'rifleman', pos: V(-40, -66) },
    ],
    waves: [
      { t: 3, units: [{ type: 'rifleman', pos: V(-48, -96) }, { type: 'rifleman', pos: V(-46, -104) }, { type: 'rifleman', pos: V(48, -98) }] },
      { t: 28, units: [{ type: 'rifleman', pos: V(48, -76) }, { type: 'shotgunner', pos: V(46, -84) }, { type: 'rifleman', pos: V(-48, -74) }, { type: 'shotgunner', pos: V(-46, -82) }] },
      { t: 58, units: [{ type: 'heavy', pos: V(0, -106) }, { type: 'rifleman', pos: V(-20, -106) }, { type: 'rifleman', pos: V(22, -106) }, { type: 'rifleman', pos: V(-50, -90) }, { type: 'rifleman', pos: V(50, -92) }] },
    ],
    extraWave: { t: 84, units: [{ type: 'heavy', pos: V(-48, -100) }, { type: 'heavy', pos: V(48, -100) }, { type: 'shotgunner', pos: V(-6, -106) }, { type: 'shotgunner', pos: V(6, -106) }] },
    defendTime: 100,
    waveCalls: ['Batı yamacından hareket var!', 'Doğu ve batıdan, çamlığın içinden geliyorlar!', 'Ağır makineli dahil büyük grup, geçidin ağzından!', 'Son dalga! İki ağır makineli yanlardan!'],
    obj: {
      outpost: {
        text: 'Karakolu ele geçir', group: 'outpost', marker: V(0, 56, 1.5), doneLine: 'Karakol düştü. ',
        radio: ['Geçidin ağzında bir karakol var; yolun ortasındaki makineli yuvası her şeyi tarıyor. Çamlıktan dolan.', 'Kar sesleri yutuyor ama görüş de kısa. Yakına gelmeden fark etmezler.'],
      },
      aa: {
        text: 'Uçaksavarları C4 ile imha et', doneLine: 'Gökyüzü temiz! ', one: 'Bir top gitti. Diğeri yolun öbür yanında.',
        radio: ['İki uçaksavar yolun iki yanında. İkisini de C4 ile patlat.', 'Yolun ortasında ikinci bir makineli var. Kayalıkların dibinden yürü, yolda kalma.'],
      },
      intel: {
        text: 'Sığınaktaki harita ve kodları al',
        radio: ['Sığınak kompleksi kuzeyde. Ana sığınaktaki harita masasını bul.', 'Sığınak önünde iki makineli yuvası var. Manga bastırırken yandaki sığınaklardan yaklaş.'],
        got: 'Haritalar bizde! Alarm çaldı. Kuzeydeki platoya, iniş pistine git.',
      },
      lz: { text: 'Platodaki iniş pistine ulaş' },
      defend: { radio: ['Şahin-2 fırtınaya rağmen geliyor. Platoyu tut!'] },
    },
    hmg: [
      nest(-6, 52, -8, 84, 'outpost'), // karakol: yola bakar
      nest(0, 22, -2, 50, 'village'), // yol ortası
      nest(-15, -30, -2, 4, 'hq'), // sığınak önü, batı
      nest(15, -32, 2, 4, 'hq'), // sığınak önü, doğu
    ],
    fires: [{ pos: V(-10, 88, 1.8), size: 0.7 }, { pos: V(-24, -70, 1.8), size: 0.7 }],
  };
}
