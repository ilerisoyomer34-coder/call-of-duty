// Yıkık Şehir (kapalı hava, savrulan kül): savaşta yıkılmış şehir merkezi. Ana cadde güneyden kuzeye
// uzanır; yan sokaklar ve çatısı çökmüş binalar makineli yuvalarını yandan vurmak için yol verir.
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-88  [ STADYUM · HELİKOPTER PİSTİ ]  tribün (batı)                ← dalgalar
//   z=-60  ══════ yan sokak ══════
//   z=-30  [ BELEDİYE BİNASI · istihbarat ]  önünde MAKİNELİ-2 ve -3 (çapraz ateş)
//   z= -5  ══════ yan sokak ══════
//   z= 40  [ MEYDAN ] çeşme, barikatlar, MAKİNELİ-1 caddeye bakar; iki yanda yıkık binalar
//   z= 90  ★ BAŞLANGIÇ (yanmış araçlar, yıkıntı)
import * as THREE from 'three';
import { V, nest, wall, house, ruin, rubble, crater, sandbags, jersey, crate, truck, car, stall, container, horizon, skyline, borderRocks, helipad, roadLines } from './kit.js';

export function build(W) {
  W.bounds = { minx: -64, maxx: 64, minz: -106, maxz: 100 };
  W.block(0, -0.02, 0, 700, 0.02, 700, 'asphalt', 'sand', { collide: false, skipBottom: true });
  W.floorSurface = 'concrete';
  // Kaldırımlar (caddenin iki yanı) ve yan sokakların toprak dolgusu
  W.block(-9.5, 0, -3, 3, 0.12, 206, 'concrete', 'concrete', { collide: false, tint: 0xb8b4ac });
  W.block(9.5, 0, -3, 3, 0.12, 206, 'concrete', 'concrete', { collide: false, tint: 0xb8b4ac });
  roadLines(W, 0, -100, 98, true, 0xd8d0b0);
  horizon(W, { mat: 'rock', tint: 0x7a7874, rockTint: 0x5e5c5a, mounds: false, r0: 240, peak: 0.9 });
  skyline(W, -320, -170, -260, 260, 22, 21, 0x4e4e52, 14, 30);
  skyline(W, 170, 320, -260, 260, 22, 23, 0x4e4e52, 14, 30);
  skyline(W, -160, 160, -320, -200, 14, 25, 0x4e4e52, 16, 26);
  borderRocks(W, W.bounds, 9, 0x9a9690);

  // ===== 1) Başlangıç: yanmış araçlar, yıkıntılar =====
  car(W, -6, 90, 0.4);
  // Yolu kesen yanmış otobüs: başlangıç siperi (meydandaki makineli caddeye bakıyor)
  W.block(1, 0.35, 84, 10, 2.5, 2.6, 'burnt', 'metal');
  W.block(1, 0, 84, 8.6, 0.35, 2.7, 'tire', 'metal', { collide: false });
  truck(W, 5, 70, 0.1, true); // yanmış otobüs
  crater(W, 3, 80, 2.6);
  crater(W, -4, 58, 2.2);
  ruin(W, -26, 84, 14, 12, 7, 'brick', { e: [{ at: 1, width: 2.2, type: 'gap' }], n: [{ at: -3, width: 1.6, type: 'window' }] }, 1);
  ruin(W, 26, 80, 16, 12, 8, 'plaster', { w: [{ at: -2, width: 2.4, type: 'gap' }], n: [{ at: 3, width: 2.4, type: 'gap' }] }, 2);
  W.block(24, 0, 78, 1.8, 0.8, 0.8, 'woodDark', 'wood'); // yıkıntıda masa (keskin nişancı tüfeği)
  ruin(W, -44, 64, 12, 14, 6, 'plasterOchre', { e: [{ at: 0, width: 2.4, type: 'gap' }] }, 3);
  ruin(W, 46, 62, 14, 12, 7, 'brick', { w: [{ at: 0, width: 2.4, type: 'gap' }], s: [{ at: -2, width: 2, type: 'gap' }] }, 4);
  rubble(W, 12, 92, 2, 5);
  rubble(W, -14, 72, 1.8, 6);

  // ===== 2) Meydan =====
  // Çeşme (batıya kaymış; ortadaki yol makineliye açık kalsın)
  W.addGeometry(new THREE.CylinderGeometry(2.6, 2.8, 0.8, 16), 'concrete', new THREE.Matrix4().makeTranslation(-13, 0.4, 38));
  W.addGeometry(new THREE.CylinderGeometry(0.4, 0.5, 2.4, 8), 'concreteDark', new THREE.Matrix4().makeTranslation(-13, 1.2, 38));
  W.addCollider(-15.4, 0, 35.6, -10.6, 0.8, 40.4, 'concrete');
  W.addCollider(-13.4, 0, 37.6, -12.6, 2.4, 38.4, 'concrete');
  sandbags(W, -8, 30, 4, true);
  sandbags(W, 9, 32, 4, true);
  jersey(W, -3, 50);
  jersey(W, 16, 36, false);
  truck(W, -18, 48, 1.2, true);
  stall(W, 15, 48);
  crater(W, 6, 44, 1.8);
  // Meydanın iki yanında yıkık binalar: makineliyi yandan vurmak için içlerinden geçilir
  ruin(W, -34, 40, 14, 18, 8, 'brick', { e: [{ at: -4, width: 2.4, type: 'gap' }, { at: 4, width: 1.6, type: 'window' }], s: [{ at: 0, width: 2.4, type: 'gap' }], n: [{ at: 2, width: 2.4, type: 'gap' }] }, 7);
  W.block(-37, 0, 36, 1.6, 0.8, 0.7, 'woodDark', 'wood'); // roketatar
  ruin(W, 34, 42, 14, 16, 9, 'plasterOchre', { w: [{ at: 3, width: 2.4, type: 'gap' }], s: [{ at: 0, width: 2.4, type: 'gap' }], n: [{ at: -2, width: 2.4, type: 'gap' }] }, 8);
  // Doğudaki yıkıntıda keskin nişancı balkonu
  W.block(24, 5, 50, 3.2, 0.3, 3.2, 'concreteDark', 'concrete');
  W.block(24, 5.3, 51.5, 3.2, 0.9, 0.3, 'sandbag', 'sandbag');
  for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) W.block(24 + dx, 0, 50 + dz, 0.25, 5, 0.25, 'concreteDark', 'concrete');

  // ===== 3) Yan sokak (z=-5) ve belediye binası =====
  ruin(W, -34, 8, 16, 14, 7, 'plaster', { e: [{ at: 0, width: 2.4, type: 'gap' }], s: [{ at: -3, width: 2.4, type: 'gap' }] }, 11);
  ruin(W, 36, 10, 14, 14, 8, 'brick', { w: [{ at: 1, width: 2.4, type: 'gap' }], n: [{ at: 2, width: 2.2, type: 'gap' }] }, 12);
  car(W, -5, 12, 1.2);
  crater(W, 4, 8, 2.4);
  rubble(W, 22, -4, 2.2, 13);
  rubble(W, -24, -6, 2.2, 14);
  // Belediye binası (sağlam; içinde istihbarat)
  house(W, 0, -32, 26, 16, 7, 'plasterWhite', {
    s: [{ at: 0, width: 3, type: 'door' }, { at: -8, width: 2, type: 'window' }, { at: 8, width: 2, type: 'window' }],
    n: [{ at: -6, width: 2.2, type: 'door' }, { at: 6, width: 2, type: 'window' }],
    w: [{ at: 0, width: 2.2, type: 'door' }],
    e: [{ at: 2, width: 2.2, type: 'door' }],
  });
  wall(W, 'z', -39.7, -24.3, -4, 7, 0.25, 'plaster', 'concrete', [{ at: 2, width: 2.2, type: 'door' }]);
  wall(W, 'z', -39.7, -24.3, 4, 7, 0.25, 'plaster', 'concrete', [{ at: -2, width: 2.2, type: 'door' }]);
  W.block(-7, 0, -35, 2.4, 0.8, 1.1, 'woodDark', 'wood'); // istihbarat masası
  W.block(8, 0, -36, 2.2, 0.8, 1.0, 'wood', 'wood');
  crate(W, 10, -28, 1.0);
  crate(W, -10, -28, 1.1);
  // Ön avlu barikatları
  sandbags(W, -6, -17, 4, true);
  sandbags(W, 6, -17, 4, true);
  jersey(W, 0, -12);
  container(W, -26, -30, false, 'contGrey');
  container(W, 26, -32, false, 'contGreen');
  truck(W, -24, -48, 0.2, true);

  // ===== 4) Kuzey yan sokak (z=-60) ve stadyum =====
  ruin(W, -40, -58, 16, 12, 6, 'brick', { e: [{ at: 0, width: 2.4, type: 'gap' }], n: [{ at: 0, width: 2.4, type: 'gap' }] }, 15);
  ruin(W, 42, -52, 14, 12, 7, 'plaster', { w: [{ at: 0, width: 2.4, type: 'gap' }], n: [{ at: 2, width: 2.4, type: 'gap' }] }, 16);
  crater(W, -2, -54, 2.6);
  // Stadyum: batıda basamaklı tribün, doğu ve kuzeyde gedikli duvar
  for (let i = 0; i < 4; i++) W.block(-24 - i * 1.6, 0, -88, 1.6, 0.6 * (i + 1), 26, 'concrete', 'concrete', { tint: 0xc8c4bc });
  wall(W, 'z', -104, -70, 32, 3, 0.4, 'concrete', 'concrete', [{ at: -6, width: 4, type: 'gap' }, { at: 9, width: 3, type: 'gap' }]);
  wall(W, 'x', -34, 32, -104, 3, 0.4, 'concrete', 'concrete', [{ at: -18, width: 5, type: 'gap' }, { at: 14, width: 4, type: 'gap' }]);
  helipad(W, 0, -88);
  container(W, 16, -80, false, 'contRed');
  sandbags(W, -12, -76, 4, true);
  sandbags(W, 10, -98, 4, true);
  sandbags(W, -14, -98, 3.5, false);
  crate(W, 12, -90, 1.1);
  car(W, -8, -72, 1.4);

  return {
    playerStart: { pos: V(0, 92), yaw: 0 },
    barrels: [V(-10, 26), V(13, 30.5), V(-20, 44), V(4, -14), V(-4.5, -14.2), V(18, -76), V(-18, -94)],
    aaGuns: [],
    laptop: { pos: V(-7, -35, 0.8), yaw: 0 },
    ammoCrates: [V(-6, 62), V(20, 20), V(-12, -8), V(-2, -78)],
    weaponPickups: [
      { id: 'sniper', pos: V(24, 78, 0.8), rotY: 0.1 },
      { id: 'rpg', pos: V(-37, 36, 0.8), rotY: 0.4 },
      { id: 'shotgun', pos: V(8, -36, 0.8), rotY: 1.2 },
      { id: 'lmg', pos: V(-9, 30, 1.05), rotY: 0 },
      { id: 'smg', pos: V(10, -28, 1.0), rotY: 0.3 },
    ],
    lz: V(0, -88),
    heliFrom: V(0, 170),
    checkpoints: [
      { pos: V(0, 92), yaw: 0 },
      { pos: V(0, 58), yaw: 0 },
      { pos: V(0, 58), yaw: 0 },
      { pos: V(0, 22), yaw: 0 },
      { pos: V(0, -50), yaw: 0 },
      { pos: V(0, -78), yaw: 0 },
    ],
    enemies: [
      // Meydan
      { group: 'outpost', type: 'rifleman', pos: V(-8, 28.8), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(9, 30.8), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-32, 40), yaw: Math.PI / 2 },
      { group: 'outpost', type: 'rifleman', pos: V(24, 50, 5.3), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'shotgunner', pos: V(-14, 44), yaw: Math.PI, patrol: [V(-14, 44), V(-6, 52), V(-20, 52)] },
      { group: 'outpost', type: 'rifleman', pos: V(14, 44), yaw: Math.PI, patrol: [V(14, 44), V(20, 34), V(6, 36)] },
      { group: 'outpost', type: 'heavy', pos: V(0, 48), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-20, 54), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(34, 38), yaw: -Math.PI / 2 },
      // Belediye binası
      { group: 'hq', type: 'rifleman', pos: V(-6, -18.8), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(6, -18.8), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-10, -31), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(8, -33), yaw: Math.PI },
      { group: 'hq', type: 'shotgunner', pos: V(0, -27), yaw: Math.PI },
      { group: 'hq', type: 'sniper', pos: V(10, -25, 7.25), yaw: Math.PI, stationary: true, elevated: true },
      { group: 'hq', type: 'rifleman', pos: V(-30, -12), yaw: Math.PI / 2, patrol: [V(-30, -12), V(-50, -12), V(-50, -2), V(-30, -2)] },
      { group: 'hq', type: 'rifleman', pos: V(30, -20), yaw: -Math.PI / 2, patrol: [V(30, -20), V(48, -20), V(48, -38), V(30, -40)] },
      { group: 'hq', type: 'heavy', pos: V(0, -46), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-20, -40), yaw: Math.PI / 2 },
    ],
    reinforcements: [
      { type: 'rifleman', pos: V(-10, -70) },
      { type: 'rifleman', pos: V(10, -72) },
      { type: 'shotgunner', pos: V(0, -80) },
      { type: 'rifleman', pos: V(46, -40) },
      { type: 'rifleman', pos: V(-46, -44) },
    ],
    waves: [
      { t: 3, units: [{ type: 'rifleman', pos: V(-58, -96) }, { type: 'rifleman', pos: V(-56, -102) }, { type: 'rifleman', pos: V(58, -94) }] },
      { t: 28, units: [{ type: 'rifleman', pos: V(-20, -62) }, { type: 'shotgunner', pos: V(22, -60) }, { type: 'rifleman', pos: V(58, -80) }, { type: 'shotgunner', pos: V(-58, -80) }] },
      { t: 58, units: [{ type: 'heavy', pos: V(-19, -104) }, { type: 'rifleman', pos: V(13, -104) }, { type: 'rifleman', pos: V(-40, -104) }, { type: 'rifleman', pos: V(58, -102) }, { type: 'shotgunner', pos: V(0, -62) }] },
    ],
    extraWave: { t: 80, units: [{ type: 'heavy', pos: V(-58, -100) }, { type: 'heavy', pos: V(58, -100) }, { type: 'shotgunner', pos: V(-6, -62) }, { type: 'shotgunner', pos: V(6, -62) }] },
    defendTime: 90,
    waveCalls: ['Batıdaki yıkıntılardan hareket var!', 'Belediye tarafından ve yanlardan yeni grup!', 'Ağır makineli dahil büyük grup, kuzey duvarından!', 'Son dalga! İki ağır makineli yanlardan!'],
    obj: {
      outpost: {
        text: 'Meydanı temizle', group: 'outpost', marker: V(0, 40, 1.5), doneLine: 'Meydan temiz. ',
        radio: ['Meydan ileride. Caddeye bakan bir makineli yuvası var; açık caddeden yürüme, yıkık binaların içinden yanına dolan.', 'Batıdaki yıkıntıda roketatar bıraktık.'],
      },
      intel: {
        text: 'Belediye binasından istihbaratı al',
        radio: ['Kuzeydeki belediye binasına gir, komuta dosyalarını al.', 'Binanın önünde iki makineli çapraz ateş kuruyor. Yan sokaklardan yaklaş, biri eğilince ötekine koş.'],
        got: 'Dosyalar bizde! Alarm çaldı, takviye kuzeyden geliyor. Stadyumdaki piste ilerle.',
      },
      lz: { text: 'Stadyumdaki helikopter pistine ulaş' },
      defend: { radio: ['Şahin-2 yolda. Stadyumu tut, düşman dört bir yandan geliyor!'] },
    },
    hmg: [
      nest(2, 30, 0, 70, 'outpost'), // meydan, caddeye bakar
      nest(-16, -11, 0, 24, 'hq'), // belediye önü, batı
      nest(18, -13, 2, 24, 'hq'), // belediye önü, doğu (çapraz ateş)
    ],
    fires: [{ pos: V(-5, 12, 1.2), size: 0.7 }, { pos: V(5, 70, 1.8), size: 0.9 }, { pos: V(-24, -48, 1.6), size: 0.7 }],
  };
}
