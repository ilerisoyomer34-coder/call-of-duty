// Kızılkum Vadisi: çöl vadisindeki görev haritası (kolay seviyeler).
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-115 ── sırt ──────────────────────────────
//          [ İNİŞ BÖLGESİ (helipad) ]  ← dalgalar: KB, KD, B, D
//   z=-72  ══════ kuzey duvarı (geçit) ══════
//          [ KOMUTA MERKEZİ ] kule(KN)  garaj  kışla
//   z=-22  ══════ güney duvarı (kapı) ═══════
//          ev ev  pazar  ev ev
//   UÇAKSAVAR-1 (konteyner sahası)   meydan   UÇAKSAVAR-2 (yakıt deposu)
//   z=66   ══ KONTROL NOKTASI (bariyer, kule, kum torbaları) ══
//   z=104  ★ BAŞLANGIÇ (kayalar, hurda araç)
import * as THREE from 'three';
import { V, wall, house, container, sandbags, hesco, jersey, crate, rock, borderRocks, tower, truck, car, stall, palm, fuelTank, horizon, ground, helipad } from './kit.js';

export function build(W) {
  W.bounds = { minx: -74, maxx: 74, minz: -116, maxz: 110 };
  ground(W);
  horizon(W);
  // Ana yol
  W.block(0, 0, -2, 8, 0.02, 224, 'dirt', 'sand', { collide: false });
  W.block(-40, 0, 20, 34, 0.02, 5, 'dirt', 'sand', { collide: false });
  W.block(40, 0, 16, 34, 0.02, 5, 'dirt', 'sand', { collide: false });
  // Harita kenarı kaya sırtları
  borderRocks(W, W.bounds, 3);

  // ===== 1) Başlangıç =====
  car(W, -5.5, 95, 0.35);
  rock(W, 8, 99, 3, 1.8, 2.4, 0.3);
  rock(W, -13, 90, 4, 2.2, 3, 1.1);
  rock(W, 13, 85, 2.6, 1.4, 2, 0.7);
  rock(W, -20, 100, 5, 3, 4, 0.2);
  rock(W, 22, 96, 4, 2.6, 3.5, 2.2);
  W.block(6, 0, 89, 5, 1.1, 0.5, 'concrete', 'concrete', { tint: 0xcfc8b8 });
  W.block(-7, 0, 83, 4, 1.2, 0.5, 'concrete', 'concrete', { tint: 0xcfc8b8 });
  W.block(-7.5, 0, 81.2, 0.5, 1.2, 3.1, 'concrete', 'concrete', { tint: 0xcfc8b8 });
  palm(W, -16, 80, 6.5);
  palm(W, 18, 104, 5.5);

  // ===== 2) Kontrol noktası =====
  hesco(W, 9, 32, 66);
  hesco(W, -32, -9, 66);
  // Bariyer kolu
  W.block(-5, 0, 66, 0.3, 1.1, 0.3, 'metal', 'metal');
  W.block(-2.5, 1.0, 66, 5, 0.12, 0.12, 'paint', 'metal', { collide: false, tint: 0xc83a2a });
  jersey(W, -2.5, 76);
  jersey(W, 2.5, 72);
  jersey(W, -2.2, 60);
  // Nöbetçi kulübesi
  house(W, 6.8, 68.5, 3.2, 3.2, 2.7, 'plasterWhite', { w: [{ at: 0, width: 2.0, type: 'door' }], s: [{ at: 0, width: 1.4, type: 'window' }], n: [{ at: 0, width: 1.4, type: 'window' }] });
  W.block(7.55, 0, 69.2, 0.9, 0.75, 0.6, 'woodDark', 'wood'); // nöbetçi masası (MAR-556)
  // Kum torbası sığınağı (pompalı burada)
  sandbags(W, -10, 60.4, 5, true);
  sandbags(W, -12.9, 62.4, 3.2, false);
  sandbags(W, -7.1, 62.4, 3.2, false);
  crate(W, -10, 62.6, 0.8);
  sandbags(W, 12, 59.5, 4, true);
  sandbags(W, 20, 73, 5, true);
  // Kule
  tower(W, 18, 74);
  // Konteynerler ve çadır
  container(W, -21, 76, true, 'contRed');
  container(W, -25, 70.5, false, 'contBlue');
  container(W, -21, 76, true, 'contGreen', 2.6);
  W.block(-16, 0, 55, 5, 2.4, 4, 'tarpGreen', 'wood');
  W.block(-16, 2.4, 55, 5.3, 0.4, 4.3, 'tarpGreen', 'wood', { collide: false });
  crate(W, -12.8, 54, 1.0);
  crate(W, -12.9, 55.2, 0.8, 0, 0.4);
  crate(W, 26, 60, 1.1);
  crate(W, 26, 60, 0.9, 1.1, 0.3);

  // ===== 3) Köy =====
  house(W, -14, 38, 9, 7, 3.2, 'plaster', {
    e: [{ at: 0, width: 2.0, type: 'door' }],
    n: [{ at: -2, width: 1.4, type: 'window' }, { at: 2, width: 1.4, type: 'window' }],
    s: [{ at: 1.5, width: 1.4, type: 'window' }],
    w: [{ at: 0, width: 2.0, type: 'door' }],
  });
  W.block(-16.5, 0, 40.3, 1.9, 0.75, 0.7, 'woodDark', 'wood'); // ev içi masa (MR-82)
  house(W, -15, 24, 8, 8, 3.4, 'plasterOchre', {
    e: [{ at: -1.5, width: 2.0, type: 'door' }],
    w: [{ at: 1, width: 1.4, type: 'window' }],
    n: [{ at: 0, width: 1.4, type: 'window' }],
    s: [{ at: 0, width: 2.0, type: 'door' }],
  });
  house(W, 14, 40, 10, 7, 3.2, 'plasterWhite', {
    w: [{ at: 1, width: 2.0, type: 'door' }],
    n: [{ at: 0, width: 1.4, type: 'window' }],
    e: [{ at: 0, width: 2.0, type: 'door' }],
    s: [{ at: -2.5, width: 1.4, type: 'window' }, { at: 2.5, width: 1.4, type: 'window' }],
  });
  house(W, 15, 25, 8, 9, 3.4, 'plaster', {
    w: [{ at: 0, width: 2.0, type: 'door' }],
    s: [{ at: 1.5, width: 2.0, type: 'door' }],
    e: [{ at: -2, width: 1.4, type: 'window' }],
  });
  house(W, -28, 45, 7, 6, 3.0, 'plasterWhite', { s: [{ at: 0, width: 2.0, type: 'door' }], e: [{ at: 0, width: 1.4, type: 'window' }] });
  house(W, 29, 42, 7, 7, 3.0, 'plasterOchre', { s: [{ at: 0, width: 2.0, type: 'door' }], w: [{ at: 0, width: 1.4, type: 'window' }] });
  stall(W, -6.3, 31);
  stall(W, 6.3, 34);
  // Meydan
  W.addGeometry(new THREE.CylinderGeometry(1.3, 1.4, 0.9, 14), 'concrete', new THREE.Matrix4().makeTranslation(0, 0.45, 18));
  W.addCollider(-1.2, 0, 16.8, 1.2, 0.9, 19.2, 'concrete');
  car(W, 5.5, 14, 1.3);
  sandbags(W, -5, 12, 3.5, true);
  sandbags(W, 4, 22, 3, true);
  palm(W, -8, 20, 6);
  palm(W, 8, 46, 6.8);
  palm(W, -9, 48, 5.2);
  crate(W, -9.5, 28, 1.0);
  crate(W, 9.8, 30, 0.9, 0, 0.6);

  // Konteyner sahası (Uçaksavar-1)
  container(W, -36, 30, true, 'contRed');
  container(W, -44, 30, true, 'contBlue');
  container(W, -44, 30, true, 'contOrange', 2.6);
  container(W, -36, 12, true, 'contGreen');
  container(W, -52, 20, false, 'contGrey');
  container(W, -52, 20, false, 'contRed', 2.6);
  container(W, -31, 20, false, 'contBlue');
  sandbags(W, -42, 17.2, 4, true);
  sandbags(W, -46.3, 22, 3, false);
  crate(W, -38.5, 25.5, 1.1);
  crate(W, -39.3, 26.4, 0.9, 0, 0.5);
  crate(W, -47, 26, 1.1);

  // Yakıt deposu (Uçaksavar-2)
  fuelTank(W, 47, 23);
  fuelTank(W, 47, 13.5);
  W.block(34, 0, 10, 0.5, 1.3, 10, 'concrete', 'concrete');
  W.block(34, 0, 25, 0.5, 1.3, 8, 'concrete', 'concrete');
  W.block(43, 0, 4.5, 18, 1.3, 0.5, 'concrete', 'concrete');
  truck(W, 38.5, 27, 0.2);
  crate(W, 37, 7, 1.1);
  crate(W, 44.5, 7.3, 1.0, 0, 0.3);
  sandbags(W, 40, 17.5, 3.5, true);

  // ===== 4) Komuta merkezi =====
  const wh = 3.2;
  // Güney duvarı (kapı) ve kuzey duvarı (geçit)
  wall(W, 'x', -32, 32, -22, wh, 0.5, 'concrete', 'concrete', [{ at: 0, width: 7, type: 'door' }]);
  W.block(-3.8, 0, -22, 0.8, 3.8, 0.8, 'concreteDark', 'concrete');
  W.block(3.8, 0, -22, 0.8, 3.8, 0.8, 'concreteDark', 'concrete');
  wall(W, 'x', -32, 32, -72, wh, 0.5, 'concrete', 'concrete', [{ at: 0, width: 6, type: 'door' }]);
  // Batı ve doğu duvarları (gedikli)
  wall(W, 'z', -71.75, -22.25, -32, wh, 0.5, 'concrete', 'concrete', [{ at: -2, width: 3.2, type: 'door' }]);
  wall(W, 'z', -71.75, -22.25, 32, wh, 0.5, 'concrete', 'concrete', [{ at: 8, width: 3.2, type: 'door' }]);
  // Gedik molozları
  W.block(-33.5, 0, -49.6, 2.4, 0.6, 2.4, 'rock', 'rock', { rotY: 0.5 });
  W.block(33.4, 0, -38, 2, 0.5, 2.2, 'rock', 'rock', { rotY: 0.3 });
  // Ana bina
  house(W, 0, -50, 20, 12, 3.6, 'plasterWhite', {
    s: [{ at: 0, width: 2.2, type: 'door' }, { at: -6, width: 1.6, type: 'window' }, { at: 6, width: 1.6, type: 'window' }],
    n: [{ at: 6, width: 2.0, type: 'door' }, { at: -5, width: 1.6, type: 'window' }],
    w: [{ at: 0, width: 1.6, type: 'window' }],
    e: [{ at: 0, width: 2.0, type: 'door' }],
  });
  // İç bölme duvarı
  wall(W, 'z', -55.7, -44.3, -3, 3.6, 0.25, 'plaster', 'concrete', [{ at: 1.5, width: 2.0, type: 'door' }]);
  W.block(-7, 0, -52.5, 2.2, 0.8, 1.0, 'woodDark', 'wood');
  W.block(-9, 0, -46, 1.2, 1.9, 0.5, 'metalDark', 'metal');
  W.block(-5.5, 0, -46, 1.2, 1.9, 0.5, 'metalDark', 'metal');
  W.block(5, 0, -52, 2.5, 0.8, 1.2, 'wood', 'wood');
  crate(W, 8, -46, 1.0);
  crate(W, 8.9, -46.4, 0.8, 0, 0.3);
  // Kışla
  house(W, -20, -35, 10, 6, 3.0, 'plasterOchre', { e: [{ at: 0, width: 2.0, type: 'door' }], s: [{ at: -2, width: 1.4, type: 'window' }, { at: 2, width: 1.4, type: 'window' }] });
  W.block(-22.5, 0, -33.2, 1.3, 0.75, 0.6, 'woodDark', 'wood'); // kışla masası (SMG-9)
  // Garaj
  house(W, 20, -36, 10, 7, 3.4, 'concrete', { s: [{ at: 0, width: 4.5, type: 'door' }], w: [{ at: 0, width: 1.4, type: 'window' }] });
  truck(W, 20, -36.5, 0);
  crate(W, 17.3, -33.4, 1.0); // roketatar sandığı
  // Avlu siperleri
  jersey(W, -8, -28);
  jersey(W, 9, -30, false);
  sandbags(W, -12, -40, 4, true);
  sandbags(W, 12, -42, 3.5, true);
  crate(W, -3, -34, 1.1);
  crate(W, 4, -38, 1.1, 0, 0.3);
  truck(W, -10, -62, 1.57);
  tower(W, -26, -66);
  container(W, 24, -64, true, 'contGreen');
  container(W, 24, -58, true, 'contGrey');

  // ===== 5) İniş bölgesi =====
  helipad(W, 0, -95);
  container(W, -16, -88, true, 'contRed');
  container(W, 16, -101, false, 'contBlue');
  sandbags(W, -7, -83, 4, true);
  sandbags(W, 7, -107, 4, true);
  sandbags(W, -12, -104, 3.5, false);
  truck(W, 19, -84, 0.9, true);
  crate(W, 9, -86, 1.1);
  crate(W, -9, -100, 1.1, 0, 0.4);
  rock(W, -30, -95, 4, 2.2, 3, 0.4);
  rock(W, 32, -92, 3.5, 1.8, 3, 1.2);
  rock(W, -40, -108, 5, 2.6, 4, 2);
  rock(W, 44, -108, 4.5, 2.4, 4, 0.3);

  return {
    playerStart: { pos: V(0, 104), yaw: 0 },
    barrels: [V(-14, 68.5), V(-13.3, 69.2), V(10.5, 57.8), V(36.5, 20.5), V(37.2, 21.3), V(-40, 13.8), V(16, -30.5), V(16.8, -31.2), V(-44, 24.5)],
    aaGuns: [
      { id: 'aa1', pos: V(-41, 22.5), yaw: 0.6, label: 'UÇAKSAVAR-1' },
      { id: 'aa2', pos: V(40.5, 12.5), yaw: -0.8, label: 'UÇAKSAVAR-2' },
    ],
    laptop: { pos: V(-7, -52.5, 0.8), yaw: Math.PI },
    ammoCrates: [V(8.6, 64.2), V(-2, 44), V(-8, -41.5), V(-3.5, -86)],
    weaponPickups: [
      { id: 'shotgun', pos: V(-10, 62.6, 0.8), rotY: 1.2 },
      { id: 'mar556', pos: V(7.55, 69.2, 0.75), rotY: 0.1 },
      { id: 'sniper', pos: V(-16.5, 40.3, 0.75), rotY: 0.04 },
      { id: 'lmg', pos: V(40, 17.5, 1.05), rotY: 0.0 },
      { id: 'smg', pos: V(-22.5, -33.2, 0.75), rotY: 0.2 },
      { id: 'd50', pos: V(5.3, -52, 0.8), rotY: 0.4 },
      { id: 'rpg', pos: V(17.3, -33.4, 1.0), rotY: -0.3 },
    ],
    lz: V(0, -95),
    // Savunmasız tahliye noktaları (Seviye 1–2): bir önceki hedefe göre, rotor çevresi en az 14 m açık;
    // cp: tahliye başlarken kaydedilen kontrol noktası
    extract: {
      outpost: { pos: V(36, 84), cp: 1, radio: ['Şahin-2 yolun doğusundaki düzlüğe iniyor. Mangayı topla, helikoptere bin.'] },
      aa: { pos: V(0, -5), cp: 2, radio: ['Şahin-2 köyün kuzeyindeki meydana iniyor. Helikoptere bin, limana gidiyoruz.'] },
    },
    checkpoints: [
      { pos: V(0, 104), yaw: 0 },
      { pos: V(0, 58), yaw: 0 },
      { pos: V(0, 56), yaw: 0 },
      { pos: V(0, 56), yaw: 0 },
      { pos: V(6, -60), yaw: 0 },
      { pos: V(-2, -88), yaw: 0 },
    ],
    enemies: [
      // Kontrol noktası
      { group: 'outpost', type: 'rifleman', pos: V(-3.2, 64.6), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(3.8, 64.2), yaw: Math.PI - 0.3 },
      { group: 'outpost', type: 'rifleman', pos: V(9, 70), yaw: Math.PI, patrol: [V(9, 71), V(14, 62), V(24, 62)] },
      { group: 'outpost', type: 'rifleman', pos: V(18, 74, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'rifleman', pos: V(-18, 79), yaw: Math.PI, patrol: [V(-18, 79.5), V(-28, 79), V(-28, 64), V(-18, 63)] },
      { group: 'outpost', type: 'rifleman', pos: V(-11.8, 61.5), yaw: Math.PI + 0.4 },
      { group: 'outpost', type: 'shotgunner', pos: V(-18, 51), yaw: Math.PI, patrol: [V(-18, 51.5), V(-6, 51), V(-6, 58)] },
      // Köy
      { group: 'village', type: 'rifleman', pos: V(-2.5, 47), yaw: Math.PI, patrol: [V(-2.5, 48), V(-2.5, 20), V(2.5, 10), V(2.5, 46)] },
      { group: 'village', type: 'rifleman', pos: V(2.5, 26), yaw: 0, patrol: [V(2.5, 26), V(2.5, 50), V(-2.5, 36), V(-2.5, 14)] },
      { group: 'village', type: 'rifleman', pos: V(-15, 38), yaw: -Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(13, 40.5), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(15, 25, 3.65), yaw: Math.PI, stationary: true, elevated: true },
      { group: 'village', type: 'heavy', pos: V(-1, 16), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(-38, 24), yaw: -Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(-46, 16), yaw: 0, patrol: [V(-46, 15.5), V(-34, 16), V(-34, 26), V(-46, 26)] },
      { group: 'village', type: 'shotgunner', pos: V(-40, 27), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(42, 18.5), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(37, 9), yaw: Math.PI / 2, patrol: [V(37, 9), V(44, 9), V(44, 19), V(37, 19)] },
      { group: 'village', type: 'shotgunner', pos: V(44, 24), yaw: Math.PI / 2 },
      // Komuta merkezi
      { group: 'hq', type: 'rifleman', pos: V(-5.5, -20.5), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(5.5, -20.5), yaw: Math.PI },
      { group: 'hq', type: 'sniper', pos: V(-26, -66, 5.8), yaw: Math.PI - 0.5, stationary: true, elevated: true },
      { group: 'hq', type: 'rifleman', pos: V(-12, -28), yaw: 0, patrol: [V(-12, -28), V(12, -27), V(12, -40), V(-12, -41)] },
      { group: 'hq', type: 'heavy', pos: V(0, -36), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(4, -48), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-8.5, -48.5), yaw: 0 },
      { group: 'hq', type: 'shotgunner', pos: V(7, -54), yaw: Math.PI / 2 },
      { group: 'hq', type: 'rifleman', pos: V(-20, -35), yaw: Math.PI / 2 },
      { group: 'hq', type: 'rifleman', pos: V(20, -38), yaw: Math.PI },
    ],
    // İstihbarattan sonra gelen takviye
    reinforcements: [
      { type: 'rifleman', pos: V(-8, -80) },
      { type: 'rifleman', pos: V(8, -82) },
      { type: 'shotgunner', pos: V(0, -90) },
      { type: 'rifleman', pos: V(40, -45) },
      { type: 'rifleman', pos: V(42, -40) },
    ],
    // İniş bölgesi savunma dalgaları (saniye)
    waves: [
      { t: 3, units: [{ type: 'rifleman', pos: V(-62, -108) }, { type: 'rifleman', pos: V(-58, -112) }, { type: 'rifleman', pos: V(60, -106) }] },
      { t: 28, units: [{ type: 'rifleman', pos: V(64, -80) }, { type: 'shotgunner', pos: V(62, -86) }, { type: 'rifleman', pos: V(-64, -78) }, { type: 'shotgunner', pos: V(-60, -84) }] },
      { t: 58, units: [{ type: 'heavy', pos: V(0, -114) }, { type: 'rifleman', pos: V(-20, -113) }, { type: 'rifleman', pos: V(22, -113) }, { type: 'rifleman', pos: V(-66, -96) }, { type: 'rifleman', pos: V(66, -98) }] },
    ],
    // Zor seviyelerde (4 ve 5) eklenen son dalga: iki ağır makineli yanlardan, hücumcular önden
    extraWave: { t: 84, units: [{ type: 'heavy', pos: V(-64, -104) }, { type: 'heavy', pos: V(64, -102) }, { type: 'shotgunner', pos: V(-6, -114) }, { type: 'shotgunner', pos: V(6, -114) }, { type: 'rifleman', pos: V(-66, -86) }, { type: 'rifleman', pos: V(66, -84) }] },
    defendTime: 95,
    waveCalls: ['Güneyden hareket var!', 'Doğu ve batıdan yeni bir grup!', 'Ağır makineli dahil büyük bir grup geliyor!', 'Son dalga! İki ağır makineli yanlardan, hücumcular önden!'],
    // Hedef metinleri ve telsiz (mission.js objectiveDefs bunları okur)
    obj: {
      outpost: {
        text: 'Kontrol noktasını temizle', group: 'outpost', marker: V(0, 66, 1.5), doneLine: 'Kontrol noktası temiz. ',
        radio: ['İlk hedef kuzeydeki kontrol noktası. Temizle ve yolu aç.'],
      },
      aa: {
        text: 'Uçaksavar toplarını C4 ile imha et', doneLine: 'Gökyüzü temiz! ', one: 'Güzel iş, bir top gitti. Diğerini de bul.',
        radio: ['Köydeki iki uçaksavar topu hava desteğimizi engelliyor. İkisini de C4 ile patlat.', 'Toplar göğe ateş ediyor, izli mermilerden yerlerini görebilirsin. Başlarında nişancı var: seni görürse namluyu sana çevirir, açıkta durma.'],
      },
      intel: {
        text: 'Komuta merkezinden istihbaratı al',
        radio: ['Güneydeki kapıdan komuta merkezine gir ve binadaki istihbaratı al.', 'Kulede bir keskin nişancı var. Kırmızı lazeri görürsen siper al.'],
        got: 'Dosyalar elimizde! Alarm çaldı, takviye geliyor. Kuzey kapısından çık ve iniş bölgesine ilerle.',
      },
      lz: { text: 'İniş bölgesine ulaş' },
      defend: { radio: ['Helikopter yolda. Bölgeyi tut, düşman dört bir yandan geliyor!'] },
    },
    // Ağır makineli mevzileri (seviyenin enemies.hmg sayısı kadarı sırayla kurulur). Kızılkum kolay
    // seviyelerde kullanıldığı için mevzi yok; liste konsoldaki "spawn gunner" denemesi için dolu
    hmg: [
      { pos: V(-6, 52), yaw: 0.0, group: 'outpost' },
      { pos: V(4, 8), yaw: Math.PI, group: 'village' },
    ],
  };
}

