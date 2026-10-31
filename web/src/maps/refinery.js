// Gece Rafinerisi: petrol rafinerisine gece baskını. Aydınlık yalnızca ışımalı lamba başlıkları, yanan
// variller ve baca alevinden gelir (ışık kaynağı eklenmez); karanlık her iki tarafın görüşünü kısar.
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-86  [ HELİKOPTER PİSTİ ]  depo (batı)   damıtma kuleleri · BACA (doğu)   ← dalgalar
//   z=-40  [ KONTROL ODASI · kodlar ]  önünde MAKİNELİ-4 ve -5
//   z=-16  ═════ yüksek boru köprüsü (altından geçilir) ═════
//   z=  0  tanklar  POMPA-1        MAKİNELİ-2     POMPA-2   MAKİNELİ-3   tanklar
//   z= -6                                  POMPA-3
//   z= 52  ═ gedik ══ tel örgü ══ KAPI (MAKİNELİ-1) ══ tel örgü ══ gedik ═
//   z= 92  ★ BAŞLANGIÇ (karanlık yol)
import * as THREE from 'three';
import { V, nest, house, container, sandbags, hesco, jersey, crate, truck, tower, fuelTank, pipe, lampPost, horizon, skyline, borderRocks, helipad, roadLines } from './kit.js';

export function build(W) {
  W.bounds = { minx: -62, maxx: 62, minz: -106, maxz: 100 };
  W.block(0, -0.02, 0, 700, 0.02, 700, 'asphalt', 'sand', { collide: false, skipBottom: true });
  W.floorSurface = 'concrete';
  horizon(W, { mat: 'rock', tint: 0x2a2a30, rockTint: 0x222228, mounds: false, r0: 220, peak: 0.8 });
  skyline(W, 170, 330, -280, 280, 18, 31, 0x1a1c24, 10, 26);
  borderRocks(W, W.bounds, 13, 0x5a5a60);
  roadLines(W, 0, -70, 100, true, 0xc8c0a0);

  // ===== 1) Başlangıç: karanlık yol =====
  truck(W, -10, 90, 1.5);
  jersey(W, -3, 78);
  jersey(W, 5, 72);
  // Başlangıç siperi: kapıdaki makineli yola bakıyor, manga bunun arkasında toplanır
  container(W, 0, 85, true, 'contGrey');
  crate(W, 12, 88, 1.1); // roketatar
  crate(W, 13.1, 88.6, 0.8, 0, 0.5);
  container(W, -26, 84, true, 'contGrey');
  container(W, 24, 80, false, 'contBlue');

  // ===== 2) Kapı =====
  const T = 0x7a7670;
  hesco(W, -60, -46, 62, true, T);
  hesco(W, -40, -10, 62, true, T);
  hesco(W, 10, 36, 62, true, T);
  hesco(W, 42, 60, 62, true, T);
  W.block(-10, 0, 62, 0.3, 1.1, 0.3, 'metal', 'metal');
  W.block(-5, 1.0, 62, 10, 0.12, 0.12, 'paint', 'metal', { collide: false, tint: 0xc83a2a });
  house(W, 15, 57, 4, 3.2, 2.8, 'brick', { w: [{ at: 0, width: 2.0, type: 'door' }], s: [{ at: 0, width: 1.6, type: 'window' }], n: [{ at: 0, width: 1.4, type: 'window' }] });
  W.block(16, 0, 58, 1.0, 0.75, 0.6, 'woodDark', 'wood'); // kulübe masası (pompalı)
  lampPost(W, -12, 65, 6.5, Math.PI / 2);
  lampPost(W, 12, 65, 6.5, -Math.PI / 2);
  // Nöbetçi ateşi yanan paslı variller (patlamaz; yalnızca ışık gibi görünen alev)
  const drum = new THREE.CylinderGeometry(0.32, 0.32, 0.95, 12);
  for (const x of [-13, 13]) {
    W.addGeometry(drum, 'rust', new THREE.Matrix4().makeTranslation(x, 0.475, 67));
    W.addCollider(x - 0.3, 0, 66.7, x + 0.3, 0.95, 67.3, 'metal');
  }
  tower(W, -26, 54, 5.5, 'tarpRed');
  sandbags(W, -12, 55, 4, true);
  sandbags(W, 18, 48, 3.5, true);
  jersey(W, -4, 44);
  crate(W, 6, 42, 1.1);
  crate(W, -43, 56, 1.2);
  sandbags(W, 39, 55, 3, true);

  // ===== 3) Tank sahası ve pompalar =====
  W.block(-40, 0, 19, 24, 0.12, 40, 'concreteDark', 'concrete', { collide: false });
  fuelTank(W, -41, 30, 6, 9, 0xa8a49c);
  fuelTank(W, -41, 8, 6, 9, 0xa8a49c);
  fuelTank(W, -24, 40, 4, 6, 0xb8b0a0);
  W.block(-28, 0, 19, 0.5, 1.0, 34, 'concrete', 'concrete'); // tank setleri (alçak duvar)
  W.block(44, 0, 22, 18, 0.12, 36, 'concreteDark', 'concrete', { collide: false });
  fuelTank(W, 45, 32, 5, 8, 0xa8a49c);
  fuelTank(W, 46, 12, 4, 6, 0xb8b0a0);
  // Alçak boru hatları (siper) ve yüksek boru köprüsü (altından geçilir)
  pipe(W, 'x', -24, -6, 28, 0.45, 0.32);
  pipe(W, 'x', 8, 26, 30, 0.45, 0.32);
  pipe(W, 'z', 14, 26, 36, 0.45, 0.32);
  pipe(W, 'x', -60, 60, -16, 4.6, 0.4);
  pipe(W, 'x', -60, 60, -14.9, 5.3, 0.3);
  W.block(0, 4.1, -15.5, 120, 0.12, 1.8, 'metalDark', 'metal', { collide: false });
  for (const z of [36, 6, -30, -60]) {
    lampPost(W, -8, z, 7, Math.PI / 2);
    lampPost(W, 8, z, 7, -Math.PI / 2);
  }
  lampPost(W, -30, 20, 6, 0);
  lampPost(W, 32, 22, 6, Math.PI);
  crate(W, -10, 24, 1.1);
  crate(W, 20, 0, 1.1);
  crate(W, 21, 0.8, 0.9, 0, 0.4);
  truck(W, -4, 14, 0.2);
  jersey(W, 8, 18, false);

  // ===== 4) Kontrol odası, damıtma kuleleri, baca =====
  house(W, 0, -40, 18, 12, 4, 'brick', {
    s: [{ at: 0, width: 2.4, type: 'door' }, { at: -5, width: 2, type: 'window' }, { at: 5, width: 2, type: 'window' }],
    n: [{ at: 4, width: 2.2, type: 'door' }],
    w: [{ at: 0, width: 1.8, type: 'window' }],
    e: [{ at: 0, width: 1.8, type: 'window' }],
  });
  W.block(-5, 0, -43, 2.4, 0.8, 1.0, 'metalDark', 'metal'); // kontrol masası (kodlar)
  W.block(5, 0, -44, 2.0, 1.4, 0.8, 'metalDark', 'metal');
  W.block(0, 3.2, -34.2, 5, 0.5, 0.1, 'lampGlow', 'metal', { collide: false }); // kapı üstü lamba
  sandbags(W, -6, -30, 4, true);
  sandbags(W, 6, -30, 4, true);
  container(W, -30, -38, false, 'contRed');
  house(W, -45, -44, 14, 10, 5, 'contGrey', { e: [{ at: 0, width: 3.4, type: 'door' }], s: [{ at: 3, width: 2, type: 'door' }] }, { roofMat: 'metalDark' });
  crate(W, -48, -46, 1.2);
  // Damıtma kuleleri ve baca (tepesinde alev)
  fuelTank(W, 38, -48, 2.2, 22, 0x8a8a90);
  fuelTank(W, 46, -40, 1.8, 18, 0x8a8a90);
  const stack = new THREE.CylinderGeometry(0.7, 1.1, 28, 12);
  W.addGeometry(stack, 'metalDark', new THREE.Matrix4().makeTranslation(52, 14, -64));
  W.addCollider(51, 0, -65, 53, 28, -63, 'metal');
  pipe(W, 'z', -62, -40, 30, 0.45, 0.3);

  // ===== 5) Helikopter pisti =====
  helipad(W, 0, -86);
  container(W, -18, -80, false, 'contBlue');
  container(W, 14, -96, true, 'contGreen');
  sandbags(W, -10, -74, 4, true);
  sandbags(W, 8, -74, 3.5, true);
  sandbags(W, -14, -98, 3.5, false);
  crate(W, 8, -90, 1.1);
  truck(W, 22, -80, 0.6, true);
  lampPost(W, -12, -70, 6, Math.PI / 2);
  lampPost(W, 12, -70, 6, -Math.PI / 2);

  return {
    playerStart: { pos: V(0, 94), yaw: 0 },
    barrels: [V(-15, 24), V(-14.3, 24.7), V(22, 26), V(12.5, -2), V(-9, -28.5), V(8.6, -28.3), V(-10, -78)],
    aaGuns: [
      { id: 'pump1', pos: V(-18, 18), yaw: 0, label: 'POMPA-1', kind: 'pump' },
      { id: 'pump2', pos: V(26, 20), yaw: 0.4, label: 'POMPA-2', kind: 'pump' },
      { id: 'pump3', pos: V(14, -6), yaw: 0, label: 'POMPA-3', kind: 'pump' },
    ],
    laptop: { pos: V(-5, -43, 0.8), yaw: 0 },
    ammoCrates: [V(4, 56), V(-4, 30), V(24, -24), V(-4, -76)],
    weaponPickups: [
      { id: 'rpg', pos: V(12, 88, 1.1), rotY: 0.3 },
      { id: 'shotgun', pos: V(16, 58, 0.75), rotY: 0.1 },
      { id: 'lmg', pos: V(-12, 55, 1.05), rotY: 0 },
      { id: 'sniper', pos: V(-10, 24, 1.1), rotY: 0.6 },
      { id: 'rpg', pos: V(20, 0, 1.1), rotY: 0.9 }, // pompaların yanı: tanklar için
      { id: 'smg', pos: V(-48, -46, 1.2), rotY: 0.4 },
    ],
    lz: V(0, -86),
    heliFrom: V(-170, -86),
    checkpoints: [
      { pos: V(0, 94), yaw: 0 },
      { pos: V(0, 44), yaw: 0 },
      { pos: V(4, 8), yaw: 0 },
      { pos: V(0, -8), yaw: 0 },
      { pos: V(0, -56), yaw: 0 },
      { pos: V(0, -76), yaw: 0 },
    ],
    enemies: [
      // Kapı
      { group: 'outpost', type: 'rifleman', pos: V(-4, 58), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(5, 58), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-26, 54, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'rifleman', pos: V(14.2, 56.3), yaw: Math.PI },
      { group: 'outpost', type: 'shotgunner', pos: V(-14, 48), yaw: Math.PI, patrol: [V(-14, 48), V(-6, 50), V(-20, 42)] },
      { group: 'outpost', type: 'rifleman', pos: V(24, 55), yaw: Math.PI, patrol: [V(24, 55), V(32, 55), V(32, 46), V(24, 46)] },
      { group: 'outpost', type: 'rifleman', pos: V(-32, 50), yaw: 2.6 },
      { group: 'outpost', type: 'heavy', pos: V(10, 44), yaw: Math.PI },
      // Tank sahası
      { group: 'village', type: 'rifleman', pos: V(-14, 22), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(-22, 13), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(22, 25.5), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(30, 16), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(10, -2), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(18, -10), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(-24, 20), yaw: Math.PI, patrol: [V(-24, 20), V(-24, -4), V(-12, -4), V(-12, 10)] },
      { group: 'village', type: 'heavy', pos: V(0, 8), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(45, 30, 8.4), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'village', type: 'rifleman', pos: V(-8, 38), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(38, -4), yaw: Math.PI, patrol: [V(38, -4), V(40, -10), V(28, -10)] },
      // Kontrol odası
      { group: 'hq', type: 'rifleman', pos: V(-6, -31.2), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(6, -31.2), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-5, -38), yaw: Math.PI },
      { group: 'hq', type: 'shotgunner', pos: V(4, -41), yaw: Math.PI },
      { group: 'hq', type: 'sniper', pos: V(6, -36, 4.25), yaw: Math.PI, stationary: true, elevated: true },
      { group: 'hq', type: 'rifleman', pos: V(-24, -28), yaw: Math.PI, patrol: [V(-24, -28), V(-40, -28), V(-38, -54)] },
      { group: 'hq', type: 'rifleman', pos: V(28, -30), yaw: Math.PI, patrol: [V(28, -30), V(28, -56), V(16, -56)] },
      { group: 'hq', type: 'heavy', pos: V(0, -54), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-45, -44), yaw: Math.PI / 2 },
      { group: 'hq', type: 'rifleman', pos: V(24, -50), yaw: Math.PI },
    ],
    reinforcements: [
      { type: 'rifleman', pos: V(-10, -70) },
      { type: 'rifleman', pos: V(10, -72) },
      { type: 'shotgunner', pos: V(0, -84) },
      { type: 'rifleman', pos: V(44, -70) },
      { type: 'rifleman', pos: V(-44, -66) },
    ],
    waves: [
      { t: 3, units: [{ type: 'rifleman', pos: V(-58, -96) }, { type: 'rifleman', pos: V(-56, -102) }, { type: 'rifleman', pos: V(58, -96) }] },
      { t: 28, units: [{ type: 'rifleman', pos: V(58, -76) }, { type: 'shotgunner', pos: V(56, -84) }, { type: 'rifleman', pos: V(-58, -74) }, { type: 'shotgunner', pos: V(-56, -82) }] },
      { t: 58, units: [{ type: 'heavy', pos: V(0, -104) }, { type: 'rifleman', pos: V(-20, -104) }, { type: 'rifleman', pos: V(22, -104) }, { type: 'rifleman', pos: V(-60, -90) }, { type: 'rifleman', pos: V(60, -92) }] },
    ],
    extraWave: { t: 84, units: [{ type: 'heavy', pos: V(-58, -100) }, { type: 'heavy', pos: V(58, -100) }, { type: 'shotgunner', pos: V(-6, -104) }, { type: 'shotgunner', pos: V(6, -104) }, { type: 'rifleman', pos: V(-60, -84) }, { type: 'rifleman', pos: V(60, -82) }] },
    defendTime: 115,
    waveCalls: ['Batıdaki depodan hareket var!', 'Doğu ve batıdan yeni grup, boru hattının altından!', 'Ağır makineli dahil büyük grup, kuzeyden!', 'Son dalga! İki ağır makineli yanlardan, hücumcular önden!'],
    obj: {
      outpost: {
        text: 'Rafineri kapısını düşür', group: 'outpost', marker: V(0, 56, 1.5), doneLine: 'Kapı düştü. ',
        radio: ['Kapının arkasında makineli yuvası var. Karanlıkta tel örgüdeki gediklerden yanına sız.', 'Yanan varillerin ışığında görünürsün, gölgede kal.'],
      },
      aa: {
        text: 'Üç yakıt pompasını C4 ile patlat', doneLine: 'Pompalar sustu! ', one: 'Bir pompa gitti. Kalanlar tank sahasında.',
        radio: ['Rafineri üç pompayla yakıt basıyor. Hepsini C4 ile patlat.', 'Tank sahasında iki makineli yuvası var. Alçak boru hatlarının arkasından ilerle.'],
      },
      intel: {
        text: 'Kontrol odasından kodları al',
        radio: ['Kontrol odası kuzeyde, boru köprüsünün ötesinde. Kodları al.', 'Önünde iki makineli çapraz ateş kuruyor. Mangan bastırsın, sen yandan gir.'],
        got: 'Kodlar elimizde! Alarm çaldı. Kuzeydeki piste git, şafağa az kaldı.',
      },
      lz: { text: 'Kuzeydeki helikopter pistine ulaş' },
      defend: { radio: ['Şahin-2 batıdan geliyor. Şafak sökene dek pisti tut!'] },
    },
    // Tanklar: kapının içinde pompa sahasına, kontrol odasının doğusunda avluya bakar
    tanks: [
      { pos: V(30, 31), yaw: Math.PI, group: 'village' },
      { pos: V(21, -28), yaw: Math.PI, group: 'hq' },
    ],
    hmg: [
      nest(0, 52, 0, 80, 'outpost'), // kapının arkası
      nest(0, 30, 0, 58, 'village'), // tank sahası girişi
      nest(34, 4, 16, 34, 'village'), // doğu, pompalara bakar
      nest(-16, -24, 0, 2, 'hq'), // kontrol odası önü, batı
      nest(16, -24, 0, 2, 'hq'), // kontrol odası önü, doğu
    ],
    fires: [{ pos: V(52, -64, 28.6), size: 2.2 }, { pos: V(-13, 67, 1.0), size: 0.45 }, { pos: V(13, 67, 1.0), size: 0.45 }, { pos: V(22, -80, 1.8), size: 0.8 }],
  };
}
