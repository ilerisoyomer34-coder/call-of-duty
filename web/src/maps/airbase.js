// Kartal Hava Üssü (öğle, puslu bozkır): düşmanın ele geçirdiği hava üssü. Oyuncu güneyden kara yoluyla gelir;
// batıda hangarlar ve apron (park etmiş jetler), doğuda pist, kuzeybatıda kontrol kulesi.
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-94  [ HELİKOPTER PİSTİ ]                                   ← dalgalar: batı, kuzey, doğu
//   z=-60  KONTROL KULESİ (istihbarat)  kışla        yakıt tankları   │ P │
//   z=-40  ········ apron ········ jetler ········ UÇAKSAVAR-2 ──────  │ İ │  radar
//   z=-32  HANGAR-3                                                    │ S │
//   z= -4  HANGAR-2   jet   (DÜŞMAN TANKI)                             │ T │
//   z= 16  HANGAR-1   jet   yakıt kamyonu    UÇAKSAVAR-1 ─────────     │   │  kargo uçağı
//   z= 62  ═ gedik ══ tel örgü ══ KAPI (MAKİNELİ) ══ tel örgü ══ gedik ═══╪═══╪═
//   z= 96  ★ BAŞLANGIÇ (kara yolu, kamyon)
import { V, nest, house, container, sandbags, hesco, jersey, crate, truck, car, tower, fuelTank, horizon, borderRocks, helipad, roadLines, lampPost, ground } from './kit.js';

// Jet uçağı: gövde (çarpışır, siper), kanatlar, kuyruk ve kokpit camı (görsel). Burun -Z yönünde (rot = 0) ya da +Z
// (rot = π); s: boy ölçeği (kargo uçağı daha büyük)
function jet(W, cx, cz, flip = false, s = 1, mat = 'contGrey') {
  const k = flip ? -1 : 1;
  const z = (lz) => cz + lz * k * s;
  W.box(cx, 1.3 * s, cz, 1.7 * s, 1.6 * s, 12 * s, mat, 'metal');
  W.box(cx, 1.15 * s, z(-6.6), 1.2 * s, 1.0 * s, 1.6 * s, 'metalDark', 'metal');
  W.box(cx, 2.15 * s, z(-3.4), 0.9 * s, 0.55 * s, 2.6 * s, 'glass', 'metal', { collide: false });
  W.box(cx, 1.15 * s, z(0.8), 10 * s, 0.2 * s, 3.4 * s, mat, 'metal', { collide: false });
  W.box(cx, 2.6 * s, z(5.0), 0.2 * s, 2.4 * s, 2.2 * s, mat, 'metal', { collide: false });
  W.box(cx, 1.5 * s, z(5.3), 4.2 * s, 0.15 * s, 1.6 * s, mat, 'metal', { collide: false });
  for (const [dx, lz] of [[0, -4.5], [-1.6, 1.2], [1.6, 1.2]]) W.box(cx + dx * s, 0.25 * s, z(lz), 0.3 * s, 0.5 * s, 0.6 * s, 'tire', 'metal', { collide: false });
}

export function build(W) {
  W.bounds = { minx: -72, maxx: 72, minz: -112, maxz: 106 };
  ground(W);
  horizon(W, { tint: 0xd2c29c, rockTint: 0x9c8a70, peak: 0.8 });
  borderRocks(W, W.bounds, 9, 0xc8b896);
  // Pist (doğu), apron (batı), bağlantı yolları ve kara yolu
  W.block(44, 0, -4, 24, 0.02, 212, 'asphalt', 'sand', { collide: false });
  roadLines(W, 44, -104, 100);
  for (const x of [32.6, 55.4]) W.block(x, 0.006, -4, 0.3, 0.01, 212, 'paint', 'concrete', { collide: false, tint: 0xe8e0c8 });
  W.block(-12, 0, -6, 44, 0.02, 96, 'asphalt', 'sand', { collide: false });
  for (const z of [20, -42]) W.block(15, 0, z, 34, 0.02, 9, 'asphalt', 'sand', { collide: false });
  W.block(0, 0, 76, 8, 0.02, 62, 'asphalt', 'sand', { collide: false });
  roadLines(W, 0, 46, 106);
  for (const z of [80, 50, 20, -20]) lampPost(W, 8.5, z, 6, -Math.PI / 2);

  // ===== 1) Başlangıç: kara yolu =====
  truck(W, -11, 98, 1.3);
  car(W, 9, 90, 0.2, 'olive');
  jersey(W, -3, 82);
  jersey(W, 6, 78, false);
  // Kapıdaki makineli yola bakar: manga bu konteynerin arkasında toplanır
  container(W, 0, 87, true, 'contGrey');
  crate(W, 13, 98, 1.1); // bazuka sandığı: makineli yuvasına ve tanka karşı
  crate(W, 14.2, 97.3, 0.8, 0, 0.4);

  // ===== 2) Üs kapısı: tel örgü hattı, iki yanda gedik =====
  hesco(W, -70, -46, 62, true, 0xc4b89a);
  hesco(W, -40, -9, 62, true, 0xc4b89a);
  hesco(W, 9, 30, 62, true, 0xc4b89a);
  hesco(W, 36, 70, 62, true, 0xc4b89a);
  W.block(-9, 0, 62, 0.3, 1.1, 0.3, 'metal', 'metal');
  W.block(-4.5, 1.0, 62, 9, 0.12, 0.12, 'paint', 'metal', { collide: false, tint: 0xc83a2a });
  house(W, 13, 56, 3.4, 3.4, 2.7, 'plasterWhite', { w: [{ at: 0, width: 2.0, type: 'door' }], s: [{ at: 0, width: 1.4, type: 'window' }], n: [{ at: 0, width: 1.4, type: 'window' }] });
  W.block(13.6, 0, 57.0, 0.9, 0.75, 0.6, 'woodDark', 'wood');
  tower(W, -20, 56, 5.5, 'tarpTan');
  sandbags(W, -12, 56, 4, true);
  sandbags(W, 19, 48, 3.5, true);
  crate(W, 6, 46, 1.1);
  crate(W, -6, 42, 1.0, 0, 0.3);
  container(W, -32, 46, false, 'contOrange');
  container(W, 25, 44, true, 'contBlue');
  // Gediklerin iç tarafında siper
  crate(W, -43, 56, 1.2);
  sandbags(W, 33, 55, 3, true);

  // ===== 3) Hangarlar ve apron =====
  for (const [z, door] of [[18, 0], [-10, 0], [-38, 0]]) {
    house(W, -52, z, 22, 18, 7.5, 'metal', {
      e: [{ at: door, width: 12, type: 'gap', top: 6.2 }],
      w: [{ at: -4, width: 2.0, type: 'door' }],
      n: [{ at: 5, width: 1.6, type: 'window' }],
    }, { roofMat: 'metalDark' });
  }
  jet(W, -54, 18, false); // hangar-1 içinde bakımda
  W.block(-46, 0, -12, 1.6, 0.8, 0.8, 'woodDark', 'wood'); // hangar-2 tezgâhı (hafif makineli)
  crate(W, -56, -6, 1.2);
  crate(W, -55, -14, 1.1, 0, 0.3);
  for (const [x, z] of [[-58, -34], [-57.2, -35.2], [-58.4, -36.4], [-47, -42]]) crate(W, x, z, 0.9);
  // Apron: üç jet, yakıt kamyonu, araç ve siperler
  jet(W, -18, 22, false);
  jet(W, -6, 22, false);
  jet(W, -16, -24, true);
  truck(W, 6, 8, 0.0);
  car(W, -24, 4, 1.5, 'olive');
  jersey(W, 0, -6);
  jersey(W, -10, -10, false);
  sandbags(W, -26, 36, 4, true);
  crate(W, 4, 30, 1.1);
  crate(W, 5.2, 29.3, 0.8, 0, 0.4);
  crate(W, -30, -44, 1.1);

  // ===== 4) Pist: uçaksavarlar, kargo uçağı, radar =====
  sandbags(W, 26, 22, 4, true);
  sandbags(W, 21.3, 16, 3, false);
  sandbags(W, 27, -36, 4, true);
  sandbags(W, 22.3, -42, 3, false);
  jet(W, 46, 44, false, 1.6, 'plasterWhite'); // kargo uçağı (pistte, büyük gövdesi siper)
  tower(W, 64, -10, 6, 'tarpTan'); // radar kulesi
  W.block(64, 9.3, -10, 0.2, 1.6, 0.2, 'metal', 'metal', { collide: false });
  W.box(64, 10.6, -10, 3.2, 1.6, 0.2, 'metalDark', 'metal', { collide: false });
  crate(W, 58, 20, 1.1);
  sandbags(W, 60, -30, 3.5, false);

  // ===== 5) Kontrol kulesi, kışla, yakıt tankları =====
  house(W, -24, -62, 12, 10, 4, 'plasterWhite', {
    s: [{ at: 1, width: 2.2, type: 'door' }],
    e: [{ at: 0, width: 2.0, type: 'door' }],
    n: [{ at: -2, width: 1.6, type: 'window' }],
    w: [{ at: 0, width: 1.6, type: 'window' }],
  });
  W.block(-21, 0, -58.4, 1.6, 0.78, 0.8, 'woodDark', 'wood'); // istihbarat masası
  // Kule gövdesi ve cam kabin (çatıdan yükselir; içine girilmez)
  W.block(-27, 4.25, -64, 4, 9, 4, 'concrete', 'concrete');
  W.block(-27, 13.25, -64, 6.6, 0.3, 6.6, 'concreteDark', 'concrete');
  W.block(-27, 13.55, -64, 6, 2.4, 6, 'glass', 'concrete', { collide: false });
  W.block(-27, 15.95, -64, 7, 0.3, 7, 'concreteDark', 'concrete', { collide: false });
  W.block(-27, 16.25, -64, 0.15, 4, 0.15, 'metal', 'metal', { collide: false });
  house(W, -2, -60, 14, 8, 3.2, 'plasterOchre', { s: [{ at: -3, width: 2.0, type: 'door' }], n: [{ at: 2, width: 1.6, type: 'window' }], e: [{ at: 0, width: 1.6, type: 'window' }] });
  W.block(1, 0, -61.6, 1.4, 0.78, 0.7, 'woodDark', 'wood'); // kışla masası (D-50)
  sandbags(W, -14, -48, 4, true);
  jersey(W, 10, -48);
  truck(W, 24, -76, 0.4);
  W.block(40, 0, -66, 16, 0.12, 14, 'concreteDark', 'concrete', { collide: false });
  fuelTank(W, 36, -62, 3.6, 5.5, 0xd2cabb);
  fuelTank(W, 45, -70, 3, 4.6, 0xd2cabb);

  // ===== 6) Kuzey: helikopter pisti =====
  helipad(W, 10, -94);
  sandbags(W, -2, -82, 4, true);
  sandbags(W, 22, -82, 3.5, true);
  container(W, -16, -96, false, 'contGrey');
  crate(W, 22, -102, 1.1);
  car(W, 32, -96, 0.6);

  return {
    playerStart: { pos: V(0, 96), yaw: 0 },
    barrels: [V(15, 60.5), V(15.7, 61.1), V(24.2, 19.6), V(24.6, -38.8), V(-2, 4), V(-1.3, 4.7), V(-12, -46), V(30, -60)],
    aaGuns: [
      { id: 'aa1', pos: V(26, 16), yaw: 0.4, label: 'UÇAKSAVAR-1' },
      { id: 'aa2', pos: V(27, -42), yaw: -0.5, label: 'UÇAKSAVAR-2' },
    ],
    laptop: { pos: V(-21, -58.4, 0.8), yaw: Math.PI },
    ammoCrates: [V(6, 52), V(10, -2), V(-10, -44), V(-4, -88)],
    weaponPickups: [
      { id: 'rpg', pos: V(13, 98, 1.1), rotY: 0.3 },
      { id: 'shotgun', pos: V(13.6, 57.0, 0.75), rotY: 0.1 },
      { id: 'mar556', pos: V(6, 46, 1.1), rotY: 1.1 },
      { id: 'lmg', pos: V(-46, -12, 0.8), rotY: 0.2 },
      { id: 'sniper', pos: V(58, 20, 1.1), rotY: 0.6 },
      { id: 'd50', pos: V(1, -61.6, 0.78), rotY: 0.5 },
    ],
    lz: V(10, -94),
    heliFrom: V(170, -94),
    checkpoints: [
      { pos: V(0, 96), yaw: 0 },
      { pos: V(0, 48), yaw: 0 },
      { pos: V(4, 0), yaw: 0 },
      { pos: V(-8, -40), yaw: 0 },
      { pos: V(10, -78), yaw: 0 },
      { pos: V(10, -88), yaw: 0 },
    ],
    enemies: [
      // Kapı
      { group: 'outpost', type: 'rifleman', pos: V(-4, 58), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(5, 58), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-20, 56, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'rifleman', pos: V(22, 55), yaw: Math.PI, patrol: [V(22, 55), V(29, 55), V(29, 50), V(22, 50)] },
      { group: 'outpost', type: 'shotgunner', pos: V(-14, 48), yaw: Math.PI, patrol: [V(-14, 48), V(-6, 45), V(-14, 41)] },
      { group: 'outpost', type: 'rifleman', pos: V(12, 44), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-30, 52), yaw: 2.6 },
      // Apron ve pist (uçaksavar muhafızları)
      { group: 'village', type: 'rifleman', pos: V(24, 26), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(31, 12), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(20, 6), yaw: Math.PI, patrol: [V(20, 6), V(20, -30), V(30, -30), V(30, 6)] },
      { group: 'village', type: 'rifleman', pos: V(-12, 32), yaw: Math.PI, patrol: [V(-12, 32), V(-12, 6), V(0, 6), V(0, 32)] },
      { group: 'village', type: 'heavy', pos: V(-4, -2), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(-38, 18), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(-38, -10), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(64, -10, 6.3), yaw: Math.PI / 2 + 0.6, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'village', type: 'rifleman', pos: V(24, -48), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(33, -34), yaw: Math.PI / 2 },
      { group: 'village', type: 'shotgunner', pos: V(18, -34), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(-24, -16), yaw: Math.PI, patrol: [V(-24, -16), V(-30, -34), V(-8, -34), V(-8, -16)] },
      // Kontrol kulesi ve kışla
      { group: 'hq', type: 'rifleman', pos: V(-24, -51), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-14, -53), yaw: Math.PI },
      { group: 'hq', type: 'sniper', pos: V(-19, -58, 4.3), yaw: Math.PI, stationary: true, elevated: true },
      { group: 'hq', type: 'rifleman', pos: V(-4, -52), yaw: 0, patrol: [V(-4, -52), V(14, -52), V(14, -72), V(-4, -72)] },
      { group: 'hq', type: 'heavy', pos: V(2, -48), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-26, -60), yaw: Math.PI / 2 },
      { group: 'hq', type: 'shotgunner', pos: V(-5, -60), yaw: Math.PI / 2 },
      { group: 'hq', type: 'rifleman', pos: V(-38, -50), yaw: Math.PI / 2 },
      { group: 'hq', type: 'rifleman', pos: V(12, -44), yaw: Math.PI },
    ],
    // İstihbarattan sonra gelen takviye (kuzeyden ve yakıt tanklarından)
    reinforcements: [
      { type: 'rifleman', pos: V(-10, -86) },
      { type: 'rifleman', pos: V(6, -100) },
      { type: 'shotgunner', pos: V(-4, -104) },
      { type: 'rifleman', pos: V(52, -56) },
      { type: 'rifleman', pos: V(54, -48) },
    ],
    waves: [
      { t: 3, units: [{ type: 'rifleman', pos: V(-64, -100) }, { type: 'rifleman', pos: V(-60, -106) }, { type: 'rifleman', pos: V(62, -98) }] },
      { t: 28, units: [{ type: 'rifleman', pos: V(64, -76) }, { type: 'shotgunner', pos: V(60, -82) }, { type: 'rifleman', pos: V(-64, -74) }, { type: 'shotgunner', pos: V(-58, -80) }] },
      { t: 58, units: [{ type: 'heavy', pos: V(10, -108) }, { type: 'rifleman', pos: V(-16, -108) }, { type: 'rifleman', pos: V(34, -108) }, { type: 'rifleman', pos: V(-66, -92) }, { type: 'rifleman', pos: V(66, -92) }] },
    ],
    extraWave: { t: 84, units: [{ type: 'heavy', pos: V(-62, -100) }, { type: 'heavy', pos: V(62, -100) }, { type: 'shotgunner', pos: V(4, -108) }, { type: 'shotgunner', pos: V(16, -108) }, { type: 'rifleman', pos: V(-66, -84) }, { type: 'rifleman', pos: V(66, -84) }] },
    defendTime: 100,
    waveCalls: ['Batıdaki hangarlardan hareket var!', 'Pistin iki yanından yeni bir grup!', 'Ağır makineli dahil büyük grup, kuzeyden!', 'Son dalga! İki ağır makineli yanlardan, hücumcular önden!'],
    obj: {
      outpost: {
        text: 'Üssün kapısını temizle', group: 'outpost', marker: V(0, 58, 1.5), doneLine: 'Kapı bizim. ',
        radio: ['Kartal Hava Üssü düşmanın elinde. İlk hedef ana kapı; arkasında makineli yuvası var, tel örgüdeki gediklerden yanına dolan.', 'Başlangıçtaki sandıkta bazuka var. Apronda bir tank da görüldü.'],
      },
      aa: {
        text: 'Pist kenarındaki uçaksavarları C4 ile imha et', doneLine: 'Hava sahası açık! ', one: 'Bir top gitti. Diğeri pistin kuzeyinde.',
        radio: ['Pist kenarındaki iki uçaksavar topu jetlerimizi uzak tutuyor. İkisini de C4 ile patlat.', 'Radar kulesinde nişancı var. Apronun jetleri iyi siper olur.'],
      },
      intel: {
        text: 'Kontrol kulesinden uçuş kayıtlarını al',
        radio: ['Kuzeybatıdaki kontrol kulesine gir; uçuş kayıtları zemin kattaki masada.', 'Kulenin çatısında keskin nişancı var. Kışlanın yanından yaklaş.'],
        got: 'Kayıtlar elimizde! Alarm çaldı, kuzeyden takviye geliyor. Helikopter pistine ilerle.',
      },
      lz: { text: 'Kuzeydeki helikopter pistine ulaş', radio: ['Şahin-2 kuzeydeki piste inecek. Kışlanın doğusundan geç.'] },
      defend: { radio: ['Şahin-2 geliyor. Pisti tut, düşman hangarlardan ve pistten sıkıştırıyor!'] },
    },
    hmg: [
      nest(0, 52, 0, 72, 'outpost'), // kapının arkası, yola bakar
      nest(8, 28, 0, 52, 'village'), // apron girişi, kapıdan gelen yola bakar
      nest(-14, -44, -6, -8, 'hq'), // kule önü, aprona bakar
      nest(28, -56, 14, -24, 'hq'), // yakıt tankları önü, pist tarafını tarar
    ],
    // Apronda düşman tankı (bazuka başlangıçta; hangar-2 tezgâhında hafif makineli)
    tanks: [{ pos: V(-26, -8), yaw: Math.PI, group: 'village' }],
    fires: [{ pos: V(-16, -30, 1.4), size: 0.7 }, { pos: V(24, -76, 1.6), size: 0.8 }],
  };
}
