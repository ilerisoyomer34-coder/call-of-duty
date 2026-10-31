// Çelik Fabrika: gece, robot üreten fabrika. Başlangıçta boş bırakılmış bir dost tank bekler: tanka binip kapıyı
// geçer, avludaki robotları ve düşman tankını topla vurursun; montaj salonundaki üç jeneratörü C4 ile patlatıp
// çatıdaki pistten tahliye olursun. Işık yalnız ışımalı lambalardan (kırmızı uyarı, camgöbeği makine ışığı).
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-92  [ HELİKOPTER PİSTİ ]
//   z=-40  [ MONTAJ SALONU: üretim bantları · JENERATÖR-1/2/3 ]  MAKİNELİ-3
//   z= 10  ( AVLU: konteynerler, vinç · ROBOTLAR · düşman tankı )  MAKİNELİ-2
//   z= 56  ════ beton duvar ═══ BÜYÜK KAPI (MAKİNELİ-1) ═══ beton duvar ════
//   z= 88  ★ BAŞLANGIÇ · boş dost tank
import * as THREE from 'three';
import { V, nest, house, container, sandbags, hesco, jersey, crate, truck, tower, fuelTank, pipe, lampPost, horizon, skyline, borderRocks, helipad, ground, crane } from './kit.js';

// Montaj bandı: alçak uzun platform, üstünde yarım kalmış robot iskeletleri (kutular) ve camgöbeği ışık şeridi
function assemblyLine(W, cx, cz, len) {
  W.block(cx, 0, cz, 2.4, 0.9, len, 'metalDark', 'metal');
  W.block(cx, 0.9, cz, 0.12, 0.04, len, 'lampCyan', 'metal', { collide: false });
  for (let z = cz - len / 2 + 3; z < cz + len / 2 - 2; z += 6) {
    W.block(cx, 0.9, z, 1.2, 1.4, 0.9, 'metal', 'metal', { tint: 0x5a6670 });
    W.block(cx, 2.3, z, 0.9, 0.7, 0.7, 'metalDark', 'metal', { collide: false });
    W.block(cx - 1.4, 0, z, 0.3, 3.6, 0.3, 'craneYellow', 'metal'); // robot kolu direği
    W.block(cx - 0.9, 3.4, z, 1.2, 0.2, 0.2, 'craneYellow', 'metal', { collide: false });
  }
}

export function build(W) {
  W.bounds = { minx: -66, maxx: 66, minz: -110, maxz: 100 };
  ground(W, 700, 'asphalt');
  horizon(W, { mat: 'rock', tint: 0x23252c, rockTint: 0x1c1e24, mounds: false, r0: 230, peak: 0.9, seed: 31 });
  skyline(W, -300, 300, -320, -200, 24, 37, 0x15171c, 20, 50);
  borderRocks(W, W.bounds, 33, 0x4a4c52);

  // ===== 1) Başlangıç: boş dost tank, siper =====
  jersey(W, -4, 76);
  jersey(W, 6, 74);
  container(W, 18, 82, false, 'contGrey');
  container(W, -26, 80, true, 'contGreen');
  crate(W, 6, 90, 1.1); // roketatar
  crate(W, 7.1, 90.6, 0.8, 0, 0.5);
  truck(W, 22, 94, 0.3, true);
  lampPost(W, -14, 70, 6, Math.PI / 2);
  lampPost(W, 14, 70, 6, -Math.PI / 2);

  // ===== 2) Duvar ve büyük kapı =====
  const T = 0x6a6660;
  for (const [x0, x1] of [[-64, -8], [8, 64]]) W.block((x0 + x1) / 2, 0, 56, x1 - x0, 4.5, 0.8, 'concrete', 'concrete', { tint: T });
  for (const s of [-1, 1]) {
    W.block(s * 8.5, 0, 56, 1.4, 6.5, 1.4, 'concreteDark', 'concrete');
    W.block(s * 8.5, 6.5, 56, 0.6, 0.3, 0.6, 'lampRed', 'metal', { collide: false });
  }
  W.block(0, 5.6, 56, 16, 0.6, 0.6, 'metalDark', 'metal', { collide: false }); // kapı kirişi
  tower(W, -30, 50, 6, 'tarpRed');
  tower(W, 32, 50, 6, 'tarpRed');
  sandbags(W, -14, 50, 4, true);
  sandbags(W, 14, 50, 4, true);
  // Duvarda yaya gediği (tanksız ilerleyen için)
  W.block(-40, 0, 56, 3.2, 0.5, 0.9, 'concreteDark', 'concrete');

  // ===== 3) Avlu: konteyner yığınları, vinç, yakıt tankları =====
  container(W, -28, 30, false, 'contRed');
  container(W, -28, 30, false, 'contBlue', 2.6);
  container(W, 30, 34, true, 'contOrange');
  container(W, -14, 4, true, 'contGrey');
  container(W, 36, 6, false, 'contGreen');
  container(W, 36, 6, false, 'contRed', 2.6);
  crane(W, -44, 14, Math.PI / 2, 18);
  fuelTank(W, 50, 30, 4, 6, 0x6a6c70);
  fuelTank(W, 50, 16, 3, 5, 0x6a6c70);
  hesco(W, -6, 6, 22, true, 0x6a6660);
  jersey(W, 16, 18);
  jersey(W, -4, 36, false);
  crate(W, 6, 30, 1.2);
  crate(W, 22, -4, 1.1);
  for (const [x, z] of [[-20, 44], [20, 44], [-20, 10], [20, 10], [0, 26]]) lampPost(W, x, z, 7, x < 0 ? Math.PI / 2 : -Math.PI / 2);
  pipe(W, 'x', -64, -30, 46, 3.8, 0.35);
  pipe(W, 'z', -40, 40, 58, 0.5, 0.4);

  // ===== 4) Montaj salonu =====
  house(W, 0, -40, 44, 26, 9, 'contGrey', {
    s: [{ at: 0, width: 12, type: 'gap', sill: 0, top: 7 }, { at: -16, width: 3, type: 'door' }, { at: 16, width: 3, type: 'door' }],
    n: [{ at: 0, width: 8, type: 'gap', sill: 0, top: 6 }],
    e: [{ at: 0, width: 3, type: 'door' }],
    w: [{ at: 4, width: 3, type: 'door' }],
  }, { roofMat: 'metalDark' });
  assemblyLine(W, -12, -40, 20);
  assemblyLine(W, 12, -40, 20);
  // Salonun içindeki ışık şeritleri (tavan altı)
  for (const x of [-16, 0, 16]) W.block(x, 8.4, -40, 0.4, 0.12, 22, 'lampCyan', 'metal', { collide: false });
  W.block(0, 0, -50, 6, 1.2, 1.4, 'metalDark', 'metal'); // kontrol masası
  sandbags(W, -6, -24, 4, true);
  sandbags(W, 6, -24, 4, true);
  crate(W, -20, -30, 1.2);
  crate(W, 20, -50, 1.2);

  // ===== 5) Çatı pisti (yer seviyesinde, salonun arkası) =====
  helipad(W, 0, -92);
  container(W, -18, -84, false, 'contBlue');
  container(W, 16, -100, true, 'contGrey');
  sandbags(W, -10, -78, 4, true);
  sandbags(W, 9, -78, 3.5, true);
  lampPost(W, -12, -72, 6, Math.PI / 2);
  lampPost(W, 12, -72, 6, -Math.PI / 2);

  return {
    playerStart: { pos: V(0, 92), yaw: 0 },
    barrels: [V(-12, 32), V(-11.3, 32.7), V(24, 40), V(-24, -26), V(24, -60), V(-6, -80)],
    aaGuns: [
      { id: 'gen1', pos: V(-16, -28), yaw: 0, label: 'JENERATÖR-1', kind: 'generator', group: 'village' },
      { id: 'gen2', pos: V(16, -30), yaw: 0, label: 'JENERATÖR-2', kind: 'generator', group: 'village' },
      { id: 'gen3', pos: V(0, -56), yaw: Math.PI, label: 'JENERATÖR-3', kind: 'generator', group: 'village' },
    ],
    vehicles: [{ kind: 'tank', pos: V(-10, 86), yaw: 0 }],
    ammoCrates: [V(4, 88), V(-8, 40), V(24, 0), V(-20, -48), V(-4, -82)],
    weaponPickups: [
      { id: 'rpg', pos: V(6, 90, 1.1), rotY: 0.3 },
      { id: 'lmg', pos: V(-14, 50, 1.05), rotY: 0 },
      { id: 'rpg', pos: V(6, 30, 1.2), rotY: 0.9 },
      { id: 'sniper', pos: V(22, -4, 1.1), rotY: 0.4 },
      { id: 'shotgun', pos: V(-20, -30, 1.2), rotY: 0.6 },
      { id: 'rpg', pos: V(20, -50, 1.2), rotY: 1.2 },
    ],
    lz: V(0, -92),
    heliFrom: V(170, -92),
    checkpoints: [
      { pos: V(0, 92), yaw: 0 },
      { pos: V(0, 64), yaw: 0 },
      { pos: V(0, 40), yaw: 0 },
      { pos: V(0, -14), yaw: 0 },
      { pos: V(0, -64), yaw: 0 },
      { pos: V(0, -78), yaw: 0 },
    ],
    enemies: [
      // Kapı
      { group: 'outpost', type: 'rifleman', pos: V(-12, 48), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(12, 48), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-30, 50, 6.3), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'rifleman', pos: V(32, 50, 6.3), yaw: Math.PI, stationary: true, elevated: true },
      { group: 'outpost', type: 'heavy', pos: V(0, 44), yaw: Math.PI },
      { group: 'outpost', type: 'shotgunner', pos: V(-22, 42), yaw: Math.PI },
      // Avlu robotları ve muhafızları
      { group: 'robots', type: 'robot', pos: V(-8, 20), yaw: Math.PI, patrol: [V(-8, 20), V(10, 24), V(10, 2), V(-12, 6)] },
      { group: 'robots', type: 'robot', pos: V(24, 14), yaw: Math.PI },
      { group: 'robots', type: 'heavy', pos: V(-22, 4), yaw: Math.PI, hardType: 'robot' },
      { group: 'robots', type: 'rifleman', pos: V(-30, 36), yaw: Math.PI },
      { group: 'robots', type: 'rifleman', pos: V(30, 30), yaw: Math.PI },
      { group: 'robots', type: 'rifleman', pos: V(4, 8), yaw: Math.PI },
      // Montaj salonu
      { group: 'village', type: 'rifleman', pos: V(-6, -26), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(6, -26), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(-14.3, -36), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(14.3, -44), yaw: Math.PI },
      { group: 'village', type: 'heavy', pos: V(0, -48), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(-18, -48), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(18, -36), yaw: -Math.PI / 2 },
      { group: 'village', type: 'robot', pos: V(0, -66), yaw: Math.PI, hardType: 'robot' },
      { group: 'village', type: 'rifleman', pos: V(-8, -64), yaw: Math.PI, patrol: [V(-8, -64), V(-20, -70), V(-20, -58)] },
    ],
    reinforcements: [],
    waves: [],
    obj: {
      capture: {
        text: 'Boş dost tanka bin', cp: 0,
        radio: ['Solundaki tank sağlam ama mürettebatı yok. Bin, kapıyı o açsın.', 'Tankın yanına git ve E\'yi basılı tut.'],
        got: 'Tank senin Komutan! Kapıdaki makineliyi top ile sustur, avluya gir.',
      },
      robots: {
        text: 'Avludaki robotları ve tankı yok et', group: 'robots', cp: 1, doneLine: 'Avlu temiz! ',
        radio: ['Avluda en az iki savaş robotu ve bir düşman tankı var. Top atışları robotu iki üç vuruşta indirir.', 'Tank ağır hasar alırsa in, yeni bir siper bul; mangan yaya destek verecek.'],
      },
      aa: {
        text: 'Montaj salonundaki üç jeneratörü C4 ile patlat', doneLine: 'Fabrika karardı! ', one: 'Bir jeneratör gitti. Salonda iki tane daha var.',
        radio: ['Fabrikanın kalbi montaj salonundaki üç jeneratör. Hepsine C4 koy.', 'Salona tankla giremezsin; araçtan in, bantların arkasından ilerle.'],
      },
      extract: { text: 'Salonun arkasındaki piste git, helikoptere bin' },
    },
    extract: {
      aa: { pos: V(0, -92), cp: 5, radio: ['Şahin-2 doğudan geliyor, piste iniyor. Salonun arkasından çık!'] },
      default: { pos: V(0, -92), cp: 5 },
    },
    tanks: [{ pos: V(28, -10), yaw: Math.PI, group: 'robots' }],
    hmg: [
      nest(0, 50, 0, 80, 'outpost'), // kapının arkası
      nest(-30, 20, 0, 50, 'robots'), // avlu batısı, kapıya bakar
      nest(0, -24, 0, 10, 'village'), // salonun girişi
    ],
    fires: [{ pos: V(22, 94, 1.8), size: 0.8 }, { pos: V(-44, 30, 0.3), size: 0.5 }],
  };
}
