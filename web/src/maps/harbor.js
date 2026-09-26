// Liman (gün batımı): konteyner limanı. Oyuncu güneyden kara yoluyla gelir, doğu rıhtım denize bakar.
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-86  [ HELİKOPTER PİSTİ ]  ofis   yakıt tankları        ← dalgalar: batı, kuzey, saha
//   z=-40  ambar-2  ········ konteyner sahası ········  rıhtım: UÇAKSAVAR-2 · vinç
//   z=  2  ambar-1  ········ (MAKİNELİ-2 rıhtım yoluna bakar)  vinç
//   z= 24                                                   rıhtım: UÇAKSAVAR-1       deniz / gemi
//   z= 50  ═ gedik ══ tel örgü ══ KAPI (MAKİNELİ-1) ══ tel örgü ══ gedik ═
//   z= 92  ★ BAŞLANGIÇ (kara yolu, tır parkı)
import { V, nest, house, container, sandbags, hesco, jersey, crate, truck, car, tower, crane, shipHull, lampPost, fuelTank, horizon, skyline, borderRocks, helipad, roadLines } from './kit.js';

const QUAY_X = 57; // rıhtım kenarı: doğusu deniz

export function build(W) {
  W.bounds = { minx: -64, maxx: 56, minz: -106, maxz: 100 };
  // Kara (asfalt), deniz ve rıhtım duvarı. Deniz, rıhtımdan 1,2 m aşağıda
  W.block((-350 + QUAY_X) / 2, -0.02, 0, 350 + QUAY_X, 0.02, 700, 'asphalt', 'sand', { collide: false, skipBottom: true });
  W.floorSurface = 'concrete';
  W.block((QUAY_X + 350) / 2, -1.24, 0, 350 - QUAY_X, 0.02, 700, 'water', 'sand', { collide: false, skipBottom: true });
  W.block(QUAY_X + 0.25, -1.2, 0, 0.5, 1.2, 700, 'concreteDark', 'concrete', { collide: false });
  // Rıhtım bordürü + görünmez korkuluk (denize düşülmesin), babalar
  W.block(QUAY_X - 0.2, 0, -3, 0.4, 0.3, 206, 'concrete', 'concrete', { tint: 0xe6d8a8 });
  W.block(QUAY_X + 0.2, 0, -3, 0.4, 2.4, 206, 'concrete', 'concrete', { visible: false });
  for (let z = -96; z <= 90; z += 12) W.block(QUAY_X - 0.8, 0, z, 0.4, 0.6, 0.4, 'metalDark', 'metal');
  shipHull(W, 67, -22, 92);
  // Ufuk: batıda şehir silueti (güneş arkasında batar), doğu açık deniz
  horizon(W, { mat: 'rock', tint: 0x5a4c50, rockTint: 0x4a3e44, mounds: false, skip: [0, 1.2], r0: 230, peak: 1.3 });
  skyline(W, -300, -170, -260, 260, 30, 11, 0x3c3640);
  borderRocks(W, W.bounds, 5, 0x8a8480, { skip: (side) => side === 'e' });
  roadLines(W, 0, -60, 100);
  roadLines(W, 46, -100, 60);

  // ===== 1) Başlangıç: kara yolu, tır parkı =====
  truck(W, -12, 94, 1.4);
  car(W, 7, 84, -0.2, 'contBlue');
  car(W, -7, 76, 0.15, 'contRed');
  jersey(W, -3, 80);
  jersey(W, 4, 72);
  container(W, -26, 88, true, 'contGrey');
  container(W, 24, 90, false, 'contRed');
  // Başlangıç siperi: kapıdaki makineli yola bakıyor, manga bunun arkasında toplanır
  container(W, 0, 84, true, 'contBlue');
  crate(W, 12, 96, 1.1); // roketatar sandığı: makineli yuvasına karşı
  crate(W, 13.2, 95.3, 0.8, 0, 0.4);
  for (const z of [70, 40, 10, -20, -50]) {
    lampPost(W, -7.5, z, 6, Math.PI / 2);
    lampPost(W, 7.5, z, 6, -Math.PI / 2);
  }

  // ===== 2) Liman kapısı (tel örgü hattı, iki yanda gedik) =====
  hesco(W, -60, -44, 62, true, 0xb8b0a0);
  hesco(W, -38, -9, 62, true, 0xb8b0a0);
  hesco(W, 9, 34, 62, true, 0xb8b0a0);
  hesco(W, 40, 55, 62, true, 0xb8b0a0);
  W.block(-9, 0, 62, 0.3, 1.1, 0.3, 'metal', 'metal');
  W.block(-4.5, 1.0, 62, 9, 0.12, 0.12, 'paint', 'metal', { collide: false, tint: 0xc83a2a });
  house(W, 12, 57, 3.2, 3.2, 2.7, 'plasterWhite', { w: [{ at: 0, width: 2.0, type: 'door' }], s: [{ at: 0, width: 1.4, type: 'window' }], n: [{ at: 0, width: 1.4, type: 'window' }] });
  W.block(12.6, 0, 58.0, 0.9, 0.75, 0.6, 'woodDark', 'wood');
  sandbags(W, -12, 56, 4, true);
  sandbags(W, 16, 48, 3.5, true);
  tower(W, -22, 54, 5.5, 'tarpRed');
  container(W, -36, 44, false, 'contOrange');
  container(W, 30, 44, true, 'contBlue');
  crate(W, 6, 44, 1.1);
  crate(W, -6, 40, 1.0, 0, 0.3);
  // Gediklerin iç tarafında siper (dolanan oyuncu için)
  crate(W, -41, 56, 1.2);
  sandbags(W, 37, 55, 3, true);

  // ===== 3) Konteyner sahası (sıralar arası şeritler; ortada yol) =====
  const S = [
    [-26, 34, 'contRed'], [-26, 34, 'contBlue', 2.6], [-19.7, 34, 'contGreen'], [19.7, 34, 'contOrange'], [26, 34, 'contGrey'], [26, 34, 'contRed', 2.6],
    [-26, 22, 'contBlue'], [-26, 22, 'contOrange', 2.6], [-19.7, 22, 'contGrey'], [19.7, 22, 'contRed'], [19.7, 22, 'contBlue', 2.6], [26, 22, 'contGreen'],
    [-26, 4, 'contGreen'], [-19.7, 4, 'contRed'], [-19.7, 4, 'contGrey', 2.6], [-13.4, 4, 'contBlue'], [13.4, 4, 'contOrange'], [19.7, 4, 'contBlue'], [19.7, 4, 'contRed', 2.6],
    [-26, -14, 'contRed'], [-19.7, -14, 'contBlue'], [19.7, -14, 'contGreen'], [19.7, -14, 'contOrange', 2.6], [26, -14, 'contGrey'],
    [-26, -32, 'contGrey'], [-19.7, -32, 'contRed'], [-19.7, -32, 'contGreen', 2.6], [13.4, -32, 'contBlue'], [19.7, -32, 'contOrange'],
  ];
  for (const [x, z, m, y] of S) container(W, x, z, true, m, y || 0);
  jersey(W, -4, 14);
  jersey(W, 5, 20, false);
  truck(W, -3, -6, 0.1);
  crate(W, 7, -18, 1.1);
  crate(W, 8.2, -18.6, 0.9, 0, 0.5);
  jersey(W, -6, -24, false);
  // Ambarlar (batı)
  house(W, -42, 20, 16, 12, 4.5, 'rust', {
    e: [{ at: -2, width: 3.2, type: 'door' }], s: [{ at: 3, width: 2.0, type: 'door' }], n: [{ at: 0, width: 1.6, type: 'window' }],
  }, { roofMat: 'metalDark' });
  crate(W, -46, 17, 1.2);
  crate(W, -45, 23, 1.1, 0, 0.4);
  W.block(-38, 0, 24.5, 1.4, 0.8, 0.7, 'woodDark', 'wood'); // ambar masası (hafif makineli)
  house(W, -40, -20, 20, 14, 5, 'contGrey', {
    e: [{ at: 0, width: 3.6, type: 'door' }], n: [{ at: -4, width: 2.0, type: 'door' }], s: [{ at: 4, width: 1.6, type: 'window' }],
  }, { roofMat: 'metalDark' });
  crate(W, -44, -24, 1.2);
  crate(W, -36, -16, 1.1);

  // ===== 4) Rıhtım: uçaksavarlar, vinçler =====
  crane(W, 47, 6);
  crane(W, 47, -62);
  sandbags(W, 46, 29, 4, true);
  sandbags(W, 41.3, 24, 3, false);
  sandbags(W, 46, -35, 4, true);
  sandbags(W, 50.8, -40, 3, false);
  container(W, 40, 44, false, 'contRed');
  crate(W, 38, -8, 1.2);
  crate(W, 39.3, -8.4, 1.0, 0, 0.3);
  crate(W, 52, -18, 1.2);
  crate(W, 52, -18, 0.9, 1.2, 0.2);

  // ===== 5) Kuzey: ofis, yakıt tankları, helikopter pisti =====
  house(W, -42, -64, 12, 8, 3.4, 'plasterWhite', { e: [{ at: 0, width: 2.0, type: 'door' }], s: [{ at: -2, width: 1.6, type: 'window' }, { at: 3, width: 1.6, type: 'window' }] });
  W.block(-44, 0, -62, 1.6, 0.78, 0.8, 'woodDark', 'wood'); // ofis masası (D-50)
  jersey(W, -4, -44);
  jersey(W, 6, -50, false);
  truck(W, -14, -52, 0.3);
  helipad(W, -6, -86);
  container(W, -26, -84, false, 'contBlue');
  container(W, 12, -97, true, 'contRed');
  sandbags(W, -16, -74, 4, true);
  sandbags(W, 6, -74, 3.5, true);
  sandbags(W, -19, -98, 3.5, false);
  crate(W, 6, -90, 1.1);
  truck(W, 22, -80, 0.8, true);
  // Yakıt tankları (beton kaide üstünde)
  W.block(38, 0, -90, 18, 0.12, 14, 'concreteDark', 'concrete', { collide: false });
  fuelTank(W, 34, -86, 4, 6, 0xc8c0b0);
  fuelTank(W, 44, -94, 3.2, 5);

  return {
    playerStart: { pos: V(0, 92), yaw: 0 },
    barrels: [V(15, 60.5), V(15.7, 61.1), V(43.5, 28.2), V(43.8, -36.3), V(8, 10), V(-18, -76), V(-17.3, -76.7)],
    aaGuns: [
      { id: 'aa1', pos: V(46, 22), yaw: 0.5, label: 'UÇAKSAVAR-1' },
      { id: 'aa2', pos: V(46, -42), yaw: -0.6, label: 'UÇAKSAVAR-2' },
    ],
    laptop: null,
    ammoCrates: [V(6, 52), V(36, 2), V(-12, -58), V(-2, -76)],
    weaponPickups: [
      { id: 'rpg', pos: V(12, 96, 1.1), rotY: 0.3 },
      { id: 'shotgun', pos: V(12.6, 58.0, 0.75), rotY: 0.1 },
      { id: 'lmg', pos: V(-38, 24.5, 0.8), rotY: 0.2 },
      { id: 'mar556', pos: V(6, 44, 1.1), rotY: 1.1 },
      { id: 'd50', pos: V(-44, -62, 0.78), rotY: 0.5 },
    ],
    lz: V(-6, -86),
    heliFrom: V(170, -86),
    checkpoints: [
      { pos: V(0, 92), yaw: 0 },
      { pos: V(0, 46), yaw: 0 },
      { pos: V(40, 12), yaw: 0 },
      { pos: V(30, -30), yaw: 0 },
      { pos: V(20, -48), yaw: 0.4 },
      { pos: V(-6, -76), yaw: 0 },
    ],
    enemies: [
      // Kapı
      { group: 'outpost', type: 'rifleman', pos: V(-4, 58), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(5, 58), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-22, 54, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'rifleman', pos: V(22, 55), yaw: Math.PI, patrol: [V(22, 55), V(30, 55), V(30, 49), V(22, 49)] },
      { group: 'outpost', type: 'shotgunner', pos: V(-14, 48), yaw: Math.PI, patrol: [V(-14, 48), V(-6, 45), V(-14, 41)] },
      { group: 'outpost', type: 'rifleman', pos: V(12, 44), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-30, 50), yaw: 2.6 },
      // Saha ve rıhtım (uçaksavar muhafızları)
      { group: 'village', type: 'rifleman', pos: V(42, 31), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(51, 19), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(40, 17), yaw: Math.PI, patrol: [V(40, 17), V(40, -6), V(52, -6), V(52, 17)] },
      { group: 'village', type: 'rifleman', pos: V(-9, 16), yaw: Math.PI, patrol: [V(-9, 16), V(-9, -10), V(9, -10), V(9, 16)] },
      { group: 'village', type: 'rifleman', pos: V(-19.7, 22, 2.6), yaw: Math.PI, stationary: true, elevated: true },
      { group: 'village', type: 'heavy', pos: V(10, -2), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(40, -46), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(51, -34), yaw: Math.PI / 2 },
      { group: 'village', type: 'shotgunner', pos: V(38, -30), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(30, -44), yaw: Math.PI, patrol: [V(30, -44), V(30, -24), V(8, -24), V(8, -44)] },
      { group: 'village', type: 'rifleman', pos: V(-36, -18), yaw: -Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(-42, 20), yaw: -Math.PI / 2 },
    ],
    reinforcements: [],
    waves: [
      { t: 3, units: [{ type: 'rifleman', pos: V(-58, -92) }, { type: 'rifleman', pos: V(-56, -98) }, { type: 'rifleman', pos: V(18, -104) }] },
      { t: 25, units: [{ type: 'rifleman', pos: V(-20, -50) }, { type: 'shotgunner', pos: V(-14, -54) }, { type: 'rifleman', pos: V(40, -70) }, { type: 'rifleman', pos: V(-58, -80) }] },
      { t: 50, units: [{ type: 'heavy', pos: V(0, -104) }, { type: 'rifleman', pos: V(-40, -104) }, { type: 'rifleman', pos: V(30, -100) }, { type: 'shotgunner', pos: V(-58, -86) }] },
    ],
    defendTime: 75,
    waveCalls: ['Batıdaki ambarlardan hareket var!', 'Konteyner sahasından yeni bir grup geliyor!', 'Ağır makineli dahil büyük grup, kuzeyden!'],
    obj: {
      outpost: {
        text: 'Liman kapısını temizle', group: 'outpost', marker: V(0, 56, 1.5), doneLine: 'Kapı bizim. ',
        radio: ['İlk hedef liman kapısı. Kapının arkasında makineli yuvası var; tel örgüdeki gediklerden yanına dolan.', 'Başlangıçtaki sandıkta roketatar var. Yuvayı uzaktan susturabilirsin.'],
      },
      aa: {
        text: 'Rıhtımdaki uçaksavarları C4 ile imha et', doneLine: 'Gökyüzü temiz! ', one: 'Bir top gitti. Diğeri rıhtımın kuzeyinde, vincin ötesinde.',
        radio: ['Rıhtımdaki iki uçaksavar hava desteğimizi engelliyor. İkisini de C4 ile patlat.', 'Konteyner sahasında ikinci bir makineli var, rıhtım yolunu tarıyor. Sahanın içinden dolan.'],
      },
      lz: { text: 'Kuzeydeki helikopter pistine ulaş', radio: ['Helikopter kuzeydeki piste gelecek. Ambarların yanından geç.'] },
      defend: { radio: ['Şahin-2 denizden geliyor. Pisti tut, düşman her yönden sıkıştırıyor!'] },
    },
    hmg: [
      nest(0, 50, 0, 70, 'outpost'), // kapının arkası, yola bakar
      nest(32, 2, 46, 30, 'village'), // saha kenarı, rıhtım yolunu tarar
    ],
    fires: [{ pos: V(22, -80, 1.6), size: 0.8 }],
  };
}
