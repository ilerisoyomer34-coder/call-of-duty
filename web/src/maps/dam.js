// Gölbaşı Barajı (kapalı hava, yağmur): vadiyi kapatan barajın eteğindeki santral. Oyuncu güneyden gelir;
// doğuda dolusavaktan inen nehir (iki köprü), batıda işçi evleri ve kontrol binası, kuzeyde santral ve trafolar.
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-108 ████████████████ BARAJ DUVARI ████████████ dolusavak ███
//   z=-86   SANTRAL (3 JENERATÖR)      trafo sahası          │ N │  şalt sahası
//   z=-52   ···· tahliye alanı (açık) ····                    ═ köprü ═
//   z=-46   KONTROL BİNASI (istihbarat)                        │ E │
//   z=-20   işçi evi   ambar                                   │ H │  telsiz direği
//   z= 24   işçi evleri                                        ═ köprü ═
//   z= 56   ══ KONTROL NOKTASI (bariyer, kule, MAKİNELİ) ══      │ İ │
//   z= 96   ★ BAŞLANGIÇ (vadi yolu)                            │ R │
import { V, nest, house, container, sandbags, jersey, crate, truck, car, tower, pipe, horizon, borderRocks, roadLines, lampPost, ground, rock, pine } from './kit.js';

const RIVER = { x0: 32, x1: 44 }; // nehir yatağı (geçilmez; köprülerden geçilir)
const BRIDGES = [26, -46]; // köprü ortaları (z)
const BRIDGE_W = 6;

// Nehir kıyısı: alçak beton set (görünür) + görünmez yüksek duvar; köprü açıklıklarında kesilir
function bank(W, x) {
  const z0 = -102;
  const z1 = 104;
  const cuts = BRIDGES.map((z) => [z - BRIDGE_W / 2, z + BRIDGE_W / 2]).sort((a, b) => a[0] - b[0]);
  let cur = z0;
  for (const [a, b] of [...cuts, [z1, z1]]) {
    if (a - cur > 0.1) {
      const c = (cur + a) / 2;
      W.block(x, 0, c, 0.6, 0.55, a - cur, 'concrete', 'concrete', { tint: 0xb8b4aa });
      W.block(x, 0, c, 0.6, 2.4, a - cur, 'concrete', 'concrete', { visible: false });
    }
    cur = b;
  }
}

export function build(W) {
  W.bounds = { minx: -70, maxx: 70, minz: -104, maxz: 104 };
  ground(W, 700, 'dirt');
  horizon(W, { mat: 'rock', tint: 0x6e7068, rockTint: 0x585a54, mounds: false, r0: 200, peak: 1.4 });
  borderRocks(W, W.bounds, 13, 0x8a8a82, { skip: (side) => side === 'n' });
  // Baraj duvarı (kuzey kenarı kapatır), üstünde yol korkuluğu, dolusavaktan inen su
  W.block(0, 0, -108, 220, 24, 8, 'concrete', 'concrete', { tint: 0xb4b0a6 });
  W.block(0, 24, -108, 220, 1.2, 0.4, 'concreteDark', 'concrete', { collide: false });
  W.block(38, 0.5, -103.8, 12, 23, 0.3, 'water', 'concrete', { collide: false });
  for (const x of [-60, -30, 0, 60]) W.block(x, 0, -103.6, 1.2, 24, 0.6, 'concreteDark', 'concrete', { collide: false });
  // Nehir: dolusavaktan güneye; su yüzeyi ve setler, iki köprü
  W.block((RIVER.x0 + RIVER.x1) / 2, 0.01, 0, RIVER.x1 - RIVER.x0, 0.01, 208, 'water', 'sand', { collide: false });
  bank(W, RIVER.x0 - 0.3);
  bank(W, RIVER.x1 + 0.3);
  for (const z of BRIDGES) {
    W.block(38, 0, z, RIVER.x1 - RIVER.x0 + 2, 0.22, BRIDGE_W, 'concrete', 'concrete', { tint: 0xa8a49a });
    for (const s of [-1, 1]) W.block(38, 0.22, z + s * (BRIDGE_W / 2 - 0.15), RIVER.x1 - RIVER.x0 + 2, 1.0, 0.3, 'metalDark', 'metal');
  }
  // Vadi yolu (güneyden santrale)
  W.block(0, 0, 18, 8, 0.02, 172, 'asphalt', 'sand', { collide: false });
  roadLines(W, 0, -66, 104);
  for (const z of [84, 44, 4, -36]) lampPost(W, 5.5, z, 6, -Math.PI / 2);
  // Yamaçlarda çam ve kaya (kenarlar)
  for (const [x, z] of [[-62, 70], [-58, 40], [-64, 8], [-60, -24], [62, 76], [60, 50], [64, -10], [58, -70]]) pine(W, x, z, 8);
  rock(W, -52, 86, 6, 3, 5, 0.4, 0x9a9a92);
  rock(W, 54, 90, 5, 2.6, 6, 1.1, 0x9a9a92);

  // ===== 1) Başlangıç: vadi yolu =====
  truck(W, -10, 96, 1.2);
  car(W, 9, 88, 0.25, 'olive');
  jersey(W, -4, 80);
  container(W, 0, 86, true, 'contGreen'); // kontrol noktasındaki makineliye karşı siper
  crate(W, 12, 96, 1.1); // bazuka sandığı
  crate(W, 13.2, 95.3, 0.8, 0, 0.4);

  // ===== 2) Kontrol noktası =====
  sandbags(W, -12, 58, 4, true);
  sandbags(W, 12, 58, 4, true);
  W.block(-4.5, 1.0, 60, 9, 0.12, 0.12, 'paint', 'metal', { collide: false, tint: 0xc83a2a });
  W.block(-9, 0, 60, 0.3, 1.1, 0.3, 'metal', 'metal');
  house(W, -16, 50, 4, 4, 2.7, 'plasterWhite', { e: [{ at: 0, width: 2.0, type: 'door' }], s: [{ at: 0, width: 1.4, type: 'window' }] });
  W.block(-16.6, 0, 49, 0.9, 0.75, 0.6, 'woodDark', 'wood');
  tower(W, 18, 52, 5.5, 'tarpGreen');
  container(W, -28, 56, true, 'contGrey');
  container(W, 22, 42, false, 'contRed');
  crate(W, 6, 44, 1.1);
  crate(W, -6, 40, 1.0, 0, 0.3);

  // ===== 3) İşçi evleri ve ambar =====
  house(W, -40, 22, 9, 7, 3, 'plasterOchre', { e: [{ at: 0, width: 2.0, type: 'door' }], n: [{ at: 0, width: 1.4, type: 'window' }] });
  house(W, -24, 28, 8, 7, 3, 'plasterWhite', { s: [{ at: 0, width: 2.0, type: 'door' }], w: [{ at: 0, width: 1.4, type: 'window' }] });
  house(W, -44, 2, 9, 8, 3, 'brick', { e: [{ at: 1, width: 2.0, type: 'door' }], s: [{ at: 0, width: 1.4, type: 'window' }] });
  W.block(-46, 0, 4, 1.4, 0.78, 0.7, 'woodDark', 'wood'); // ev masası (pompalı)
  house(W, -8, -20, 16, 10, 5, 'rust', { s: [{ at: -3, width: 3.2, type: 'door' }], e: [{ at: 0, width: 2.4, type: 'door' }], n: [{ at: 4, width: 1.6, type: 'window' }] }, { roofMat: 'metalDark' });
  crate(W, -12, -22, 1.2);
  crate(W, -3, -18, 1.1, 0, 0.3);
  W.block(-13, 0, -17, 1.6, 0.8, 0.8, 'woodDark', 'wood'); // ambar tezgâhı (hafif makineli)
  truck(W, 14, 6, 0.1);
  jersey(W, 8, -4);
  sandbags(W, 16, -28, 4, true);
  crate(W, -26, -4, 1.1);
  car(W, -30, 40, 1.4, 'burnt');

  // ===== 4) Kontrol binası (istihbarat) =====
  house(W, -44, -46, 14, 10, 3.6, 'plasterWhite', {
    e: [{ at: -1, width: 2.2, type: 'door' }],
    s: [{ at: -3, width: 1.6, type: 'window' }, { at: 3, width: 1.6, type: 'window' }],
    n: [{ at: 0, width: 2.0, type: 'door' }],
  });
  W.block(-47, 0, -44, 1.6, 0.78, 0.8, 'woodDark', 'wood'); // istihbarat masası
  W.block(-41, 0, -49.6, 2.4, 1.8, 0.6, 'metalDark', 'metal'); // dolap
  sandbags(W, -32, -40, 4, false);
  tower(W, -58, -30, 6, 'tarpGreen');
  jersey(W, -26, -54, false);

  // ===== 5) Santral, cebri borular, trafo sahası =====
  house(W, -8, -86, 34, 14, 8, 'concrete', {
    s: [{ at: -8, width: 4.4, type: 'gap', top: 3.6 }, { at: 9, width: 2.2, type: 'door' }],
    e: [{ at: 0, width: 2.2, type: 'door' }],
    w: [{ at: 0, width: 2.2, type: 'door' }],
    n: [{ at: -10, width: 1.6, type: 'window' }, { at: 10, width: 1.6, type: 'window' }],
  }, { roofMat: 'concreteDark' });
  for (const x of [-18, -8, 2]) pipe(W, 'z', -104, -93.4, x, 5.2, 0.9);
  crate(W, -22, -82, 1.1);
  crate(W, 6, -82, 1.1, 0, 0.4);
  // Trafo sahası: trafolar (siper), direkler ve kablolar (görsel)
  for (const [x, z] of [[16, -88], [22, -88], [16, -78], [22, -78]]) W.block(x, 0, z, 2.6, 2.4, 2.2, 'metalDark', 'metal');
  for (const x of [14, 26]) {
    W.block(x, 0, -96, 0.3, 9, 0.3, 'metal', 'metal');
    W.block(x, 0, -70, 0.3, 9, 0.3, 'metal', 'metal');
  }
  W.block(20, 8.6, -96, 12.4, 0.25, 0.25, 'metal', 'metal', { collide: false });
  W.block(20, 8.6, -70, 12.4, 0.25, 0.25, 'metal', 'metal', { collide: false });
  sandbags(W, 16, -64, 3.5, true);

  // ===== 6) Doğu kıyısı: şalt sahası ve telsiz direği (kanattan dolanma yolu) =====
  for (const [x, z] of [[52, -84], [58, -84], [52, -74]]) W.block(x, 0, z, 2.4, 2.2, 2.4, 'metalDark', 'metal');
  W.block(56, 0, -20, 0.6, 18, 0.6, 'metal', 'metal');
  W.block(56, 17.5, -20, 4, 0.2, 0.2, 'metal', 'metal', { collide: false });
  house(W, 58, 10, 7, 6, 2.8, 'plasterWhite', { w: [{ at: 0, width: 2.0, type: 'door' }] });
  crate(W, 46.5, -36, 1.1);
  sandbags(W, 50, 30, 3.5, false);

  return {
    playerStart: { pos: V(0, 96), yaw: 0 },
    barrels: [V(-9, 64), V(-8.3, 64.7), V(18, 6), V(-24, -10), V(24, -64), V(24.7, -64.7), V(-30, -86)],
    aaGuns: [
      { id: 'gen1', pos: V(-18, -88), yaw: 0, label: 'JENERATÖR-1', kind: 'generator', group: 'village' },
      { id: 'gen2', pos: V(-8, -88), yaw: 0, label: 'JENERATÖR-2', kind: 'generator', group: 'village' },
      { id: 'gen3', pos: V(2, -88), yaw: 0, label: 'JENERATÖR-3', kind: 'generator', group: 'village' },
    ],
    laptop: { pos: V(-47, -44, 0.8), yaw: -Math.PI / 2 },
    ammoCrates: [V(6, 50), V(-18, 10), V(-30, -36), V(20, -56)],
    weaponPickups: [
      { id: 'rpg', pos: V(12, 96, 1.1), rotY: 0.3 },
      { id: 'mar556', pos: V(-16.6, 49, 0.75), rotY: 0.2 },
      { id: 'shotgun', pos: V(-46, 4, 0.78), rotY: 0.4 },
      { id: 'lmg', pos: V(-13, -17, 0.8), rotY: 0.1 },
      { id: 'sniper', pos: V(46.5, -36, 1.1), rotY: 0.8 },
      { id: 'd50', pos: V(-22, -82, 1.1), rotY: 0.3 },
    ],
    lz: V(2, -52),
    heliFrom: V(-170, -52),
    // Savunmasız tahliye: jeneratörlerden sonra santralin önündeki açık alana
    extract: {
      aa: { pos: V(2, -52), cp: 4, radio: ['Santral karardı! Şahin-2 santralin önündeki düzlüğe iniyor. Mangayı topla, helikoptere bin.'] },
      default: { pos: V(2, -52), cp: 4 },
    },
    checkpoints: [
      { pos: V(0, 96), yaw: 0 },
      { pos: V(-4, -34), yaw: 0 },
      { pos: V(0, 20), yaw: 0 },
      { pos: V(-24, -30), yaw: 0 },
      { pos: V(2, -44), yaw: 0 },
      { pos: V(2, -50), yaw: 0 },
    ],
    enemies: [
      // Kontrol noktası
      { group: 'outpost', type: 'rifleman', pos: V(-4, 62), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(4, 62), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(18, 52, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'rifleman', pos: V(-22, 62), yaw: Math.PI, patrol: [V(-22, 62), V(-34, 62), V(-34, 48), V(-22, 48)] },
      { group: 'outpost', type: 'shotgunner', pos: V(10, 50), yaw: Math.PI, patrol: [V(10, 50), V(14, 46), V(12, 38)] },
      { group: 'outpost', type: 'rifleman', pos: V(-14, 46), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(26, 56), yaw: 2.6 },
      // İşçi evleri, ambar ve kontrol binası
      { group: 'hq', type: 'rifleman', pos: V(-36, 16), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-20, 22), yaw: Math.PI, patrol: [V(-20, 22), V(-20, 6), V(-6, 6), V(-6, 22)] },
      { group: 'hq', type: 'shotgunner', pos: V(-44, 2), yaw: Math.PI / 2 },
      { group: 'hq', type: 'heavy', pos: V(-4, -12), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-12, -20), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-36, -40), yaw: Math.PI / 2 },
      { group: 'hq', type: 'rifleman', pos: V(-46, -48), yaw: 0 },
      { group: 'hq', type: 'rifleman', pos: V(-58, -30, 6.3), yaw: Math.PI / 2, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'hq', type: 'rifleman', pos: V(-28, -56), yaw: Math.PI, patrol: [V(-28, -58), V(-14, -58), V(-14, -44), V(-28, -44)] },
      // Santral, trafolar ve doğu kıyısı
      { group: 'village', type: 'rifleman', pos: V(-18, -82), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(0, -82), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(-8, -84), yaw: Math.PI },
      { group: 'village', type: 'heavy', pos: V(-26, -76), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(19, -83), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(12, -74), yaw: Math.PI, patrol: [V(12, -74), V(30, -74), V(30, -60), V(12, -60)] },
      { group: 'village', type: 'rifleman', pos: V(-36, -82), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(52, -64), yaw: -Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(50, -28), yaw: Math.PI, patrol: [V(50, -28), V(50, -50), V(62, -50), V(62, -28)] },
      { group: 'village', type: 'shotgunner', pos: V(60, 4), yaw: Math.PI },
    ],
    reinforcements: [
      { type: 'rifleman', pos: V(-30, -96) },
      { type: 'rifleman', pos: V(-40, -92) },
      { type: 'shotgunner', pos: V(10, -98) },
      { type: 'rifleman', pos: V(56, -92) },
      { type: 'rifleman', pos: V(60, -60) },
    ],
    waves: [],
    obj: {
      outpost: {
        text: 'Vadi yolundaki kontrol noktasını temizle', group: 'outpost', marker: V(0, 56, 1.5), doneLine: 'Kontrol noktası temiz. ',
        radio: ['Gölbaşı Barajı santrali düşman robot fabrikalarına elektrik veriyor. Önce vadi yolundaki kontrol noktası.', 'Yağmur sesleri yutuyor; kuledeki nişancı seni duymaz ama görür. Başlangıçtaki sandıkta bazuka var.'],
      },
      intel: {
        text: 'Kontrol binasından santralin kapatma şemasını al',
        radio: ['Batıdaki kontrol binasında santralin kapatma şeması var. İşçi evlerinin arasından ilerle.', 'Binanın batısındaki gözetleme kulesinde keskin nişancı var.'],
        got: 'Şema elimizde: jeneratörler santralin içinde, üçü yan yana. Kuzeye, santrale ilerle.',
      },
      aa: {
        text: 'Santraldeki üç jeneratörü C4 ile patlat', doneLine: '', one: 'Bir jeneratör gitti! Diğerleri yanında.',
        radio: ['Santralin güney kapısından gir, üç jeneratöre C4 kur.', 'Doğu kıyısından köprüyle dolanırsan trafoların arkasından yaklaşırsın.'],
      },
      extract: { text: 'Santralin önündeki tahliye alanına git, helikoptere bin' },
    },
    hmg: [
      nest(0, 54, 0, 76, 'outpost'), // kontrol noktası, yola bakar
      nest(-20, -8, -6, 24, 'hq'), // ambar önü, işçi evlerine bakar
      nest(8, -68, 2, -40, 'village'), // santral önü, tahliye alanını tarar
    ],
    tanks: [],
    fires: [{ pos: V(-30, 40, 1.2), size: 0.7 }],
  };
}
