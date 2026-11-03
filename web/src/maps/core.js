// Son Kale: alacakaranlıkta kızıl kanyon, robot ordusunun komuta üssü. Kanyon ağzından tahkimatlı kapıya,
// avludaki robot sürüsüne, üç ışıyan enerji çekirdeğine ve komuta sığınağındaki kapatma kodlarına ilerlenir;
// son olarak pist robot dalgalarına karşı tutulur. Kül yağar, ışık kırmızı gökten ve camgöbeği çekirdeklerden.
//
// Kuşbakışı (kuzey yukarıda, -Z; kanyon duvarları doğu ve batıda):
//   z=-88  [ HELİKOPTER PİSTİ ]
//   z=-58  [ KOMUTA SIĞINAĞI · kodlar ]
//   z=-30  [ ÇEKİRDEK-1 · ÇEKİRDEK-2 · ÇEKİRDEK-3 ]  MAKİNELİ-4
//   z= 18  ( AVLU · ROBOT SÜRÜSÜ )  MAKİNELİ-2/3
//   z= 52  ████ tahkimatlı kapı (MAKİNELİ-1) ████
//   z= 90  ★ BAŞLANGIÇ: kanyon ağzı, yanmış araçlar
import * as THREE from 'three';
import { V, nest, house, sandbags, hesco, jersey, crate, truck, car, rock, lampPost, horizon, ground, bunker, helipad, crater, mulberry, container } from './kit.js';

// Kanyon duvarı: üst üste kayalar (aşılmaz, yüksek)
function canyonWall(W, x, z0, z1, side, seed) {
  const rnd = mulberry(seed);
  for (let z = z0; z < z1; z += 7) {
    const h = 9 + rnd() * 9;
    rock(W, x + side * rnd() * 3, z, 8 + rnd() * 5, h, 9 + rnd() * 4, rnd() * 2, 0x8a4a34);
    if (rnd() < 0.5) rock(W, x - side * 2 + side * rnd() * 2, z + 3, 4 + rnd() * 3, 3 + rnd() * 3, 4 + rnd() * 3, rnd() * 3, 0x9a5a40);
  }
}

// Robot iskelesi: üstünde bekleyen (kapalı) robot gövdesi silueti, kırmızı lamba
function gantry(W, cx, cz) {
  for (const s of [-1, 1]) W.block(cx + s * 2.2, 0, cz, 0.4, 5, 0.4, 'metalDark', 'metal');
  W.block(cx, 5, cz, 4.8, 0.4, 1.2, 'metalDark', 'metal', { collide: false });
  W.block(cx, 0, cz, 2.2, 0.4, 2.2, 'metal', 'metal');
  W.block(cx, 5.4, cz, 0.3, 0.2, 0.3, 'lampRed', 'metal', { collide: false });
}

export function build(W) {
  W.bounds = { minx: -56, maxx: 56, minz: -106, maxz: 98 };
  ground(W, 700, 'dirt');
  W.floorSurface = 'sand';
  horizon(W, { mat: 'rock', tint: 0x6a3020, rockTint: 0x52261a, mounds: false, r0: 190, peak: 1.5, seed: 51 });
  canyonWall(W, -62, -110, 104, -1, 53);
  canyonWall(W, 62, -110, 104, 1, 59);
  for (const x of [-30, 0, 30]) rock(W, x, -112, 16, 12, 8, 0.3, 0x7a3a28);
  for (const x of [-30, 30]) rock(W, x, 104, 14, 10, 8, 0.6, 0x7a3a28);

  // ===== 1) Kanyon ağzı: yanmış araçlar, kraterler =====
  truck(W, -16, 88, 0.4, true);
  car(W, 14, 84, -0.6);
  crater(W, -4, 76, 2.6);
  crater(W, 22, 70, 2.2);
  rock(W, 0, 80, 4, 1.6, 3, 0.4, 0x8a4a34); // başlangıç siperi (kapıdaki makineli görmesin)
  rock(W, -8, 81, 3, 1.4, 2.6, 1.2, 0x8a4a34);
  crate(W, 8, 92, 1.1); // roketatar
  crate(W, 9.1, 92.6, 0.8, 0, 0.5);

  // ===== 2) Tahkimatlı kapı =====
  for (const [x0, x1] of [[-56, -7], [7, 56]]) W.block((x0 + x1) / 2, 0, 52, x1 - x0, 5, 1.2, 'concreteDark', 'concrete', { tint: 0x9a8478 });
  for (const s of [-1, 1]) {
    W.block(s * 7.6, 0, 52, 1.6, 7.5, 1.6, 'metalDark', 'metal');
    W.block(s * 7.6, 7.5, 52, 0.7, 0.3, 0.7, 'lampRed', 'metal', { collide: false });
  }
  W.block(0, 6.4, 52, 14, 0.8, 0.8, 'metalDark', 'metal', { collide: false });
  sandbags(W, -12, 46, 4, true);
  sandbags(W, 12, 46, 4, true);
  hesco(W, -30, -20, 44, true, 0x7a6a5a);
  hesco(W, 20, 30, 44, true, 0x7a6a5a);

  // ===== 3) Avlu: robot iskeleleri, siperler =====
  gantry(W, -26, 22);
  gantry(W, 26, 22);
  gantry(W, -26, 8);
  gantry(W, 26, 8);
  jersey(W, -6, 30);
  jersey(W, 8, 26);
  jersey(W, -12, 12, false);
  jersey(W, 14, 10, false);
  container(W, 0, 18, true, 'contGrey');
  crate(W, -18, 34, 1.2);
  crate(W, 18, 0, 1.2);
  rock(W, -40, 30, 5, 2.4, 4, 0.5, 0x8a4a34);
  rock(W, 40, 14, 5, 2.6, 4, 1.5, 0x8a4a34);
  for (const [x, z] of [[-14, 40], [14, 40], [-14, 0], [14, 0]]) lampPost(W, x, z, 7, x < 0 ? Math.PI / 2 : -Math.PI / 2);

  // ===== 4) Çekirdek sahası =====
  W.block(0, 0.006, -30, 70, 0.02, 30, 'concreteDark', 'concrete', { collide: false });
  for (const x of [-24, 0, 24]) {
    W.block(x, 0.01, -30, 6, 0.04, 6, 'lampCyan', 'metal', { collide: false, tint: 0x205060 }); // çekirdek zemin ışığı
  }
  sandbags(W, -12, -18, 4, true);
  sandbags(W, 12, -18, 4, true);
  sandbags(W, -36, -30, 4, false);
  sandbags(W, 36, -30, 4, false);
  crate(W, -10, -40, 1.2);
  crate(W, 10, -40, 1.2);

  // ===== 5) Komuta sığınağı =====
  bunker(W, 0, -58, 16, 10, { front: 's', h: 3.4 });
  W.block(0, 0, -60, 3, 0.9, 1.0, 'metalDark', 'metal'); // kod konsolu
  W.block(0, 0.9, -60.3, 2.4, 0.6, 0.06, 'lampCyan', 'metal', { collide: false });
  bunker(W, -30, -62, 8, 6, { front: 's' });
  bunker(W, 30, -62, 8, 6, { front: 's' });

  // ===== 6) Pist =====
  helipad(W, 0, -88);
  sandbags(W, -12, -78, 4, true);
  sandbags(W, 12, -78, 4, true);
  sandbags(W, -18, -98, 4, false);
  sandbags(W, 18, -98, 4, false);
  rock(W, -26, -92, 4, 2.2, 3, 0.6, 0x8a4a34);
  rock(W, 26, -84, 4, 2.4, 3, 1.4, 0x8a4a34);

  return {
    playerStart: { pos: V(0, 90), yaw: 0 },
    grassAvoid: [[-35, -45, 35, -15], [-12, -100, 12, -76]],
    barrels: [V(-20, 40), V(-19.3, 40.6), V(20, 34), V(-30, -20), V(30, -40), V(-8, -76)],
    aaGuns: [
      { id: 'core1', pos: V(-24, -30), yaw: 0, label: 'ÇEKİRDEK-1', kind: 'reactor', group: 'village' },
      { id: 'core2', pos: V(0, -30), yaw: 0, label: 'ÇEKİRDEK-2', kind: 'reactor', group: 'village' },
      { id: 'core3', pos: V(24, -30), yaw: 0, label: 'ÇEKİRDEK-3', kind: 'reactor', group: 'village' },
    ],
    laptop: { pos: V(0, -60, 0.9), yaw: Math.PI },
    ammoCrates: [V(-4, 88), V(-20, 34), V(20, 6), V(0, -42), V(-6, -80)],
    weaponPickups: [
      { id: 'rpg', pos: V(8, 92, 1.1), rotY: 0.3 },
      { id: 'rpg', pos: V(-18, 34, 1.2), rotY: 0.8 },
      { id: 'lmg', pos: V(18, 0, 1.2), rotY: 0.1 },
      { id: 'rpg', pos: V(-10, -40, 1.2), rotY: 1.1 },
      { id: 'sniper', pos: V(10, -40, 1.2), rotY: 0.5 },
    ],
    lz: V(0, -88),
    heliFrom: V(0, 220),
    checkpoints: [
      { pos: V(0, 90), yaw: 0 },
      { pos: V(0, 58), yaw: 0 },
      { pos: V(0, 36), yaw: 0 },
      { pos: V(0, -14), yaw: 0 },
      { pos: V(0, -70), yaw: 0 },
      { pos: V(0, -80), yaw: 0 },
    ],
    enemies: [
      // Kapı
      { group: 'outpost', type: 'rifleman', pos: V(-12, 44), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(12, 44), yaw: Math.PI },
      { group: 'outpost', type: 'heavy', pos: V(0, 42), yaw: Math.PI },
      { group: 'outpost', type: 'shotgunner', pos: V(-24, 40), yaw: Math.PI },
      { group: 'outpost', type: 'shotgunner', pos: V(24, 40), yaw: Math.PI },
      { group: 'outpost', type: 'sniper', pos: V(-7.6, 52, 7.6), yaw: Math.PI, stationary: true, elevated: true },
      { group: 'outpost', type: 'rifleman', pos: V(-36, 42), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(36, 42), yaw: Math.PI },
      // Robot sürüsü
      { group: 'robots', type: 'robot', pos: V(-22, 16), yaw: Math.PI },
      { group: 'robots', type: 'robot', pos: V(22, 16), yaw: Math.PI },
      { group: 'robots', type: 'robot', pos: V(0, 4), yaw: Math.PI, patrol: [V(0, 4), V(-16, 2), V(-16, 28), V(16, 28), V(16, 2)] },
      { group: 'robots', type: 'heavy', pos: V(-10, 22), yaw: Math.PI, hardType: 'robot' },
      { group: 'robots', type: 'rifleman', pos: V(10, 34), yaw: Math.PI },
      { group: 'robots', type: 'rifleman', pos: V(-30, 6), yaw: Math.PI },
      // Çekirdekler ve sığınak
      { group: 'village', type: 'rifleman', pos: V(-12, -20), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(12, -20), yaw: Math.PI },
      { group: 'village', type: 'heavy', pos: V(0, -38), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(-30, -36), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(30, -26), yaw: Math.PI },
      { group: 'village', type: 'robot', pos: V(0, -46), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-4, -56), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(4, -56), yaw: Math.PI },
      { group: 'hq', type: 'heavy', pos: V(-30, -62), yaw: Math.PI },
      { group: 'hq', type: 'heavy', pos: V(30, -62), yaw: Math.PI },
      { group: 'hq', type: 'sniper', pos: V(0, -58, 3.6), yaw: Math.PI, stationary: true, elevated: true },
    ],
    reinforcements: [
      { type: 'rifleman', pos: V(-12, -76) },
      { type: 'rifleman', pos: V(12, -76) },
      { type: 'heavy', pos: V(0, -100) },
    ],
    waves: [
      { t: 3, units: [{ type: 'rifleman', pos: V(-48, -100) }, { type: 'rifleman', pos: V(48, -100) }, { type: 'shotgunner', pos: V(-48, -90) }] },
      { t: 26, units: [{ type: 'robot', pos: V(-46, -102) }, { type: 'rifleman', pos: V(46, -96) }, { type: 'rifleman', pos: V(0, -104) }] },
      { t: 54, units: [{ type: 'robot', pos: V(46, -102) }, { type: 'heavy', pos: V(-46, -92) }, { type: 'shotgunner', pos: V(-20, -104) }, { type: 'shotgunner', pos: V(20, -104) }] },
    ],
    extraWave: { t: 80, units: [{ type: 'robot', pos: V(-40, -104) }, { type: 'robot', pos: V(40, -104) }, { type: 'heavy', pos: V(0, -104) }, { type: 'rifleman', pos: V(-48, -84) }, { type: 'rifleman', pos: V(48, -84) }] },
    defendTime: 110,
    waveCalls: ['Pistin iki yanından piyade!', 'Bir robot kanyondan iniyor!', 'İkinci robot ve ağır makineli, kuzeyden!', 'Son dalga! İki robot birden! Her şeyinizle vurun!'],
    obj: {
      outpost: {
        text: 'Tahkimatlı kapıyı düşür', group: 'outpost', marker: V(0, 48, 1.5), doneLine: 'Kapı düştü! ',
        radio: ['Son Kale. Robot ordusunun beyni bu kanyonun sonunda. Kapıda keskin nişancı ve makineli var.', 'Kayaların arkasından ilerle; bazukaları sakla, ileride robotlar bekliyor.'],
      },
      robots: {
        text: 'Avludaki robot sürüsünü yok et', group: 'robots', cp: 2, doneLine: 'Sürü dağıldı! ',
        radio: ['Avluda en az üç savaş robotu! Kırmızı sensörlerine nişan al, patlayıcıları onlara sakla.', 'Robot devrilirken patlar: yakınında durma!'],
      },
      aa: {
        text: 'Üç enerji çekirdeğini C4 ile patlat', doneLine: 'Çekirdekler söndü! ', one: 'Bir çekirdek söndü. İkisi kaldı.',
        radio: ['Üs üç enerji çekirdeğiyle besleniyor. Hepsine C4 koy, robotlar yavaşlayacak.'],
      },
      intel: {
        text: 'Komuta sığınağından kapatma kodlarını al',
        radio: ['Komuta sığınağında kapatma kodları var. Onları al, bu savaş biter.'],
        got: 'Kodlar elimizde! Bütün robotlara kapatma emri gidiyor… ama yolda olanlar var. Piste koş!',
      },
      lz: { text: 'Kanyonun sonundaki piste ulaş' },
      defend: { radio: ['Şahin-2 geliyor! Son kez Komutan: pisti tut!'] },
    },
    tanks: [],
    hmg: [
      nest(0, 48, 0, 86, 'outpost'), // kapının arkası
      nest(-30, 30, 0, 50, 'robots'),
      nest(30, 30, 0, 50, 'robots'),
      nest(0, -20, 0, 10, 'village'), // çekirdek sahası girişi
      nest(-20, -70, 0, -40, 'hq'),
    ],
    fires: [{ pos: V(-16, 88, 1.8), size: 0.9 }, { pos: V(14, 84, 0.8), size: 0.7 }, { pos: V(40, 60, 0.3), size: 0.5 }],
  };
}
