// Kara Orman: sisli sabah, sık çam ormanı. Dere üstündeki köprüden kereste kampına, ormanın içinden tepedeki
// radar istasyonuna çıkılır; istasyonu ilk savaş robotu korur. Ağaçlar hem siper hem görüş engeli: düşman
// da manga da sisin ve gövdelerin arkasında kaybolur.
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-96  ( TAHLİYE AÇIKLIĞI )
//   z=-60  [ RADAR İSTASYONU · kulübe (veri) ]  ROBOT devriyesi   MAKİNELİ-2
//   z=-20  ~~~~ sık orman, patika ~~~~
//   z= 30  [ KERESTE KAMPI: biçkıhane, kütük yığınları, gözetleme kulesi ]  MAKİNELİ-1
//   z= 62  ≈≈≈≈ DERE ≈≈≈ köprü ≈≈≈≈
//   z= 96  ★ BAŞLANGIÇ (orman yolu, kütük siperi)
import * as THREE from 'three';
import { V, nest, house, sandbags, crate, truck, tower, pine, rock, lampPost, horizon, borderRocks, ground, mulberry } from './kit.js';

// Kütük yığını: yatay silindirler, tek kutu çarpıştırıcı (diz-göğüs boyu siper)
const logGeo = new THREE.CylinderGeometry(0.28, 0.3, 1, 8);
function logPile(W, cx, cz, len, alongX, rows = 3) {
  let h = 0;
  for (let r = 0; r < rows; r++) {
    const n = rows - r + 1;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 0.56;
      const y = 0.28 + r * 0.48;
      const m = new THREE.Matrix4()
        .makeTranslation(cx + (alongX ? 0 : off), y, cz + (alongX ? off : 0))
        .multiply(new THREE.Matrix4().makeRotationZ(alongX ? Math.PI / 2 : 0))
        .multiply(new THREE.Matrix4().makeRotationX(alongX ? 0 : Math.PI / 2))
        .multiply(new THREE.Matrix4().makeScale(1, len, 1));
      W.addGeometry(logGeo, 'woodDark', m, 0x8a6a4a);
    }
    h = 0.28 + r * 0.48 + 0.3;
  }
  const hw = alongX ? len / 2 : (rows + 1) * 0.3;
  const hd = alongX ? (rows + 1) * 0.3 : len / 2;
  W.addCollider(cx - hw, 0, cz - hd, cx + hw, h, cz + hd, 'wood');
}

// Radar: kafes kule, platform ve çanak (çarpışma yalnız ayaklar ve platform)
function radar(W, cx, cz, h = 9) {
  for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    W.block(cx + dx, 0, cz + dz, 0.22, h, 0.22, 'metalDark', 'metal');
  }
  for (let y = 2; y < h; y += 2.2) {
    W.block(cx, y, cz - 1.4, 2.8, 0.1, 0.1, 'metalDark', 'metal', { collide: false });
    W.block(cx, y, cz + 1.4, 2.8, 0.1, 0.1, 'metalDark', 'metal', { collide: false });
  }
  W.block(cx, h, cz, 3.6, 0.2, 3.6, 'metal', 'metal');
  const dish = new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3.2);
  dish.rotateX(-Math.PI / 2 - 0.5);
  W.addGeometry(dish, 'metal', new THREE.Matrix4().makeTranslation(cx, h + 2.6, cz + 0.6), 0xd8dad6);
  W.block(cx, h + 0.2, cz, 0.4, 2.2, 0.4, 'metalDark', 'metal', { collide: false });
  W.block(cx, h + 2.6, cz - 1.2, 0.18, 0.18, 1.8, 'lampRed', 'metal', { collide: false });
}

export function build(W) {
  W.bounds = { minx: -64, maxx: 64, minz: -112, maxz: 104 };
  ground(W, 700, 'grass');
  W.floorSurface = 'sand';
  horizon(W, { mat: 'rock', tint: 0x52604e, rockTint: 0x4a524a, mounds: false, r0: 210, peak: 1.2, seed: 21 });
  borderRocks(W, W.bounds, 23, 0x8a8e86);
  // Orman yolu (toprak) boyunca
  W.block(0, 0.005, -4, 7, 0.02, 214, 'dirt', 'sand', { collide: false });

  // ===== 1) Başlangıç: yol, kütük siperi (kamptaki makineli başlangıcı görmesin) =====
  truck(W, -7, 98, 0.15, false, 'olive');
  logPile(W, 0, 86, 9, true, 3);
  logPile(W, -12, 84, 6, true, 2);
  logPile(W, 13, 85, 6, true, 2);
  crate(W, 8, 94, 1.1); // roketatar
  crate(W, 9.1, 94.5, 0.8, 0, 0.5);

  // ===== 2) Dere ve köprü =====
  // Sığ dere: su yüzeyi (çarpışmasız), kıyıda taşlar; köprü yolun üstünde, korkuluklu
  W.block(0, 0.012, 62, 128, 0.02, 7, 'water', 'sand', { collide: false, tint: 0x8fb4b8 });
  W.block(0, 0.5, 62, 7.5, 0.2, 9, 'woodDark', 'wood', { collide: false });
  for (const s of [-1, 1]) W.block(s * 3.6, 0.5, 62, 0.15, 1.0, 9, 'woodDark', 'wood');
  const rnd = mulberry(77);
  for (let i = 0; i < 26; i++) {
    const x = -60 + i * 4.8 + rnd() * 2;
    if (Math.abs(x) < 6) continue;
    rock(W, x, 62 + (rnd() < 0.5 ? -3.6 : 3.6) + rnd() * 0.8, 1 + rnd() * 1.4, 0.5 + rnd() * 0.7, 1 + rnd(), rnd() * 3, 0x8e9088);
  }

  // ===== 3) Kereste kampı =====
  house(W, -14, 28, 14, 8, 4, 'wood', {
    s: [{ at: 0, width: 4, type: 'gap', sill: 0, top: 3.2 }],
    n: [{ at: -3, width: 1.6, type: 'door' }],
    e: [{ at: 0, width: 1.4, type: 'window' }],
  }, { roofMat: 'rust' });
  W.block(-14, 0, 28, 6, 0.9, 1.2, 'metalDark', 'metal'); // biçkı tezgâhı
  house(W, 16, 22, 6, 5, 2.8, 'wood', { w: [{ at: 0, width: 1.4, type: 'door' }], s: [{ at: 0, width: 1.2, type: 'window' }] }, { roofMat: 'tarpGreen' });
  house(W, 18, 38, 6, 5, 2.8, 'wood', { s: [{ at: 0, width: 1.4, type: 'door' }], w: [{ at: 0, width: 1.2, type: 'window' }] }, { roofMat: 'tarpGreen' });
  logPile(W, 4, 38, 8, false, 3);
  logPile(W, -4, 20, 7, true, 2);
  logPile(W, 8, 14, 6, true, 3);
  logPile(W, -26, 40, 8, false, 3);
  truck(W, 6, 26, Math.PI * 0.55, false, 'rust');
  tower(W, -22, 14, 5.5, 'tarpGreen');
  sandbags(W, -6, 46, 4, true);
  sandbags(W, 10, 48, 3.5, true);
  crate(W, 24, 30, 1.1);
  crate(W, -2, 32, 1.0);
  lampPost(W, -6, 34, 5.5, 0);

  // ===== 4) Orman kuşağı: patika boyunca kayalar ve devrik gövdeler =====
  for (const [x, z, l, ax] of [[-8, 4, 7, true], [10, -8, 6, false], [-14, -22, 8, true], [16, -30, 7, true], [-4, -36, 6, false]]) logPile(W, x, z, l, ax, 1);
  for (const [x, z, s] of [[6, 2, 2.2], [-18, -6, 3], [22, -16, 2.6], [-24, -34, 2.4], [4, -26, 1.8], [28, 6, 2.8], [-30, 0, 3.2]]) rock(W, x, z, s, s * 0.7, s * 0.9, x * 0.3, 0x86898a);

  // ===== 5) Radar istasyonu (tepe açıklığı) =====
  W.block(0, 0.006, -60, 46, 0.02, 30, 'dirt', 'sand', { collide: false });
  radar(W, -12, -66, 9);
  house(W, 10, -60, 9, 6, 3, 'plaster', {
    s: [{ at: -1.5, width: 1.6, type: 'door' }, { at: 2.5, width: 1.6, type: 'window' }],
    n: [{ at: 0, width: 1.4, type: 'window' }],
    w: [{ at: 0, width: 1.4, type: 'window' }],
  }, { roofMat: 'metalDark' });
  W.block(11, 0, -61.8, 2.6, 0.8, 0.9, 'metalDark', 'metal'); // veri masası
  // Jeneratör ve yakıt bidonları
  W.block(-2, 0, -74, 2.6, 1.6, 1.4, 'olive', 'metal');
  W.block(-2, 1.62, -74, 0.4, 0.06, 0.4, 'lampRed', 'metal', { collide: false });
  sandbags(W, -6, -48, 4, true);
  sandbags(W, 6, -48, 4, true);
  sandbags(W, 22, -66, 4, false);
  sandbags(W, -24, -56, 4, false);
  crate(W, 2, -52, 1.1);
  crate(W, -18, -52, 1.1);
  lampPost(W, -4, -48, 6, Math.PI / 2);
  lampPost(W, 18, -54, 6, -Math.PI / 2);

  // ===== 6) Tahliye açıklığı =====
  W.block(0, 0.006, -96, 30, 0.02, 22, 'dirt', 'sand', { collide: false });
  rock(W, -12, -90, 3, 2, 2.4, 0.4, 0x86898a);
  rock(W, 13, -100, 2.6, 1.8, 2.2, 1.2, 0x86898a);

  // ===== Ağaçlar: yoldan, dereden ve açıklıklardan uzak, sık orman =====
  const tr = mulberry(91);
  const clear = (x, z) =>
    Math.abs(x) < 6.5 ||
    Math.abs(z - 62) < 5 ||
    (z > 80 && Math.abs(x) < 22) ||
    (x > -32 && x < 30 && z > 8 && z < 50) ||
    (x > -30 && x < 28 && z > -80 && z < -42) ||
    Math.hypot(x, z + 96) < 17;
  let placed = 0;
  for (let i = 0; i < 900 && placed < 260; i++) {
    const x = -60 + tr() * 120;
    const z = -108 + tr() * 208;
    if (clear(x, z)) continue;
    pine(W, x, z, 6.5 + tr() * 4.5);
    placed++;
  }

  return {
    playerStart: { pos: V(0, 96), yaw: 0 },
    // Çimen olmayacak yerler: orman yolu, dere, kamp ve istasyon zemini [x0, z0, x1, z1]
    grassAvoid: [[-4.5, -112, 4.5, 104], [-64, 58, 64, 66], [-23, -75, 23, -45], [-15, -107, 15, -85]],
    barrels: [V(-1, 30), V(12, -74), V(-4, -50)],
    laptop: { pos: V(11, -61.8, 0.8), yaw: Math.PI },
    ammoCrates: [V(3, 93), V(20, 30), V(-14, -8), V(4, -52)],
    weaponPickups: [
      { id: 'rpg', pos: V(8, 94, 1.1), rotY: 0.3 },
      { id: 'sniper', pos: V(-22, 13.4, 0.1), rotY: 0.8 },
      { id: 'shotgun', pos: V(16, 21, 0.05), rotY: 0.2 },
      { id: 'rpg', pos: V(-18, -52, 1.1), rotY: 0.6 }, // radar: robota karşı
      { id: 'lmg', pos: V(2, -52, 1.1), rotY: 1.1 },
    ],
    lz: V(0, -96),
    heliFrom: V(-160, -96),
    checkpoints: [
      { pos: V(0, 96), yaw: 0 },
      { pos: V(0, 56), yaw: 0 },
      { pos: V(0, 10), yaw: 0 },
      { pos: V(0, -30), yaw: 0 },
      { pos: V(0, -44), yaw: 0 },
      { pos: V(0, -86), yaw: 0 },
    ],
    enemies: [
      // Kereste kampı
      { group: 'outpost', type: 'rifleman', pos: V(-8, 44), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(12, 46), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-22, 14, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'shotgunner', pos: V(-14, 26), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(16, 23.2), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(4, 32), yaw: Math.PI, patrol: [V(4, 32), V(-10, 34), V(-10, 18), V(10, 18)] },
      { group: 'outpost', type: 'shotgunner', pos: V(18, 36), yaw: Math.PI },
      { group: 'outpost', type: 'heavy', pos: V(-2, 22), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-28, 34), yaw: 2.4 },
      { group: 'outpost', type: 'rifleman', pos: V(26, 26), yaw: -2.6 },
      // Radar istasyonu
      { group: 'hq', type: 'rifleman', pos: V(-5, -47), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(6, -47), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-12, -66, 9.2), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'hq', type: 'shotgunner', pos: V(10, -59), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(22, -62), yaw: Math.PI / 2 },
      { group: 'hq', type: 'rifleman', pos: V(-25.2, -56), yaw: -Math.PI / 2 },
      { group: 'hq', type: 'heavy', pos: V(0, -70), yaw: Math.PI },
      { group: 'hq', type: 'rifleman', pos: V(-16, -40), yaw: Math.PI, patrol: [V(-16, -40), V(-26, -30), V(-8, -30)] },
      // Robot: istasyonun etrafında devriye; zorda ikincisi gelir
      { group: 'robots', type: 'robot', pos: V(-4, -78), yaw: Math.PI, patrol: [V(-4, -78), V(18, -76), V(18, -50), V(-20, -50)] },
      { group: 'robots', type: 'heavy', pos: V(14, -84), yaw: Math.PI, hardType: 'robot' },
    ],
    reinforcements: [],
    waves: [],
    obj: {
      outpost: {
        text: 'Kereste kampını temizle', group: 'outpost', marker: V(0, 30, 1.5), doneLine: 'Kamp temiz. ',
        radio: ['Kara Orman\'a hoş geldin. Dereyi köprüden geç, ileride kereste kampı var; içinde makineli yuvası.', 'Ağaçlar senin dostun: gövdeden gövdeye ilerle, sis seni saklar.'],
      },
      intel: {
        text: 'Radar istasyonundan verileri indir',
        radio: ['Patikayı izle, tepede bir radar istasyonu var. Kulübedeki bilgisayardan verileri indir.', 'Dikkat: istasyonda bilmediğimiz bir şey hareket ediyor. Ağır adım sesleri duyuyoruz.'],
        got: 'Veriler bizde! Ve o şey… bir savaş robotu! Onu durdur!',
      },
      robots: {
        text: 'Savaş robotunu yok et', group: 'robots', cp: 4, doneLine: 'Robot devrildi! ',
        radio: ['Mermi zırhında seker. Bazuka, C4 ya da el bombası kullan; ön paneldeki kırmızı sensör zayıf noktası.', 'Mangan dikkatini dağıtsın, sen yandan vur. Patlarken yanında durma!'],
      },
      extract: { text: 'Tahliye açıklığına git, helikoptere bin' },
    },
    extract: {
      robots: { pos: V(0, -96), cp: 5, radio: ['Şahin-2 kuzeydeki açıklığa iniyor. Bu robotlar yalnız değil Komutan, karargâha haber vermeliyiz.'] },
      default: { pos: V(0, -96), cp: 5 },
    },
    tanks: [],
    hmg: [
      nest(6, 44, 0, 80, 'outpost'), // kampın girişi, köprüye bakar
      nest(-8, -46, 0, -20, 'hq'), // istasyonun önü, patikaya bakar
      nest(20, -50, 6, -24, 'hq'),
    ],
    fires: [{ pos: V(2, 30, 0.2), size: 0.6 }],
  };
}
