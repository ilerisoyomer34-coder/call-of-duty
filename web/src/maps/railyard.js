// Demiryolu Kavşağı (gece): düşmanın ikmal hattındaki makas sahası. Oyuncu güneyden gelir; dört hat boyunca
// yük katarları (vagonların arası siper ve dar geçit), batıda istasyon ve peron, kuzeydoğuda lokomotif deposu.
//
// Kuşbakışı (kuzey yukarıda, -Z):
//   z=-90   [ HELİKOPTER PİSTİ ]  yük sahası (konteyner yığınları)        ← dalgalar: batı, kuzey, doğu
//   z=-66                                          LOKOMOTİF DEPOSU
//   z=-44        UÇAKSAVAR-2                ║ lokomotif
//   z=-14   ║ vagon  ║                       ║ vagon         su kulesi
//   z= 14   ║        ║   UÇAKSAVAR-1   ║ vagon ║
//   z= 32  İSTASYON ║ vagon                 ║ vagon
//   z= 62  ═ gedik ═╬═ tel örgü ═╬═ KAPI (MAKİNELİ) ═╬═ tel örgü ═╬═ gedik ═
//   z= 96  ★ BAŞLANGIÇ (yol)
//          hatlar: x = -34, -20, 20, 34 (geçitler hat üstünden)
import { V, nest, house, container, sandbags, hesco, jersey, crate, truck, tower, rock, horizon, skyline, borderRocks, helipad, roadLines, lampPost, ground } from './kit.js';

const TRACKS = [-34, -20, 20, 34];

// Hat: balast şeridi, iki ray, traversler (görsel; üstünden geçilir)
function track(W, x) {
  W.block(x, 0, -2, 3.4, 0.03, 212, 'dirt', 'sand', { collide: false, tint: 0x4e4840 });
  for (const s of [-0.72, 0.72]) W.block(x + s, 0.03, -2, 0.1, 0.14, 212, 'metalDark', 'metal', { collide: false });
  for (let z = -106; z <= 102; z += 3) W.block(x, 0.03, z, 2.6, 0.05, 0.25, 'woodDark', 'wood', { collide: false });
}

// Yük vagonu: alt şasi (çarpışır), tekerlek takımları (görsel), üstünde iki konteyner (20 fit)
function boxcar(W, x, cz, mat) {
  W.block(x, 0.5, cz, 3, 0.5, 13.4, 'metalDark', 'metal');
  for (const dz of [-4.6, 4.6]) W.block(x, 0, cz + dz, 2.4, 0.5, 2.4, 'metalDark', 'metal', { collide: false });
  container(W, x, cz - 3.1, false, mat, 1.0);
  container(W, x, cz + 3.1, false, mat, 1.0);
}

// Tanker vagonu: şasi + yatay tank gövdesi
function tanker(W, x, cz) {
  W.block(x, 0.5, cz, 3, 0.5, 13.4, 'metalDark', 'metal');
  W.box(x, 2.45, cz, 2.8, 2.9, 12, 'contGrey', 'metal');
  W.box(x, 4.05, cz, 1.2, 0.35, 1.2, 'metalDark', 'metal', { collide: false });
}

// Lokomotif: uzun burun, kabin (camlı), baca; flip: kabin güneyde
function loco(W, x, cz, flip = false, mat = 'contGreen') {
  const k = flip ? 1 : -1;
  W.block(x, 0.5, cz, 3, 0.5, 17, 'metalDark', 'metal');
  W.block(x, 1.0, cz - k * 2, 2.6, 2.6, 12, mat, 'metal');
  W.block(x, 1.0, cz + k * 6.4, 3.2, 3.6, 3.6, mat, 'metal');
  W.block(x, 3.1, cz + k * 6.4, 3.25, 0.9, 3.0, 'glass', 'metal', { collide: false });
  W.block(x, 3.6, cz - k * 4, 0.6, 0.9, 0.6, 'metalDark', 'metal', { collide: false });
}

// Sinyal köprüsü: iki direk (çarpışır), kiriş ve lambalar (görsel)
function gantry(W, z) {
  for (const x of [-42, 42]) W.block(x, 0, z, 0.4, 7.2, 0.4, 'metal', 'metal');
  W.block(0, 7.0, z, 84.4, 0.35, 0.35, 'metal', 'metal', { collide: false });
  for (const x of TRACKS) W.block(x, 6.2, z, 0.5, 0.8, 0.3, 'lampRed', 'metal', { collide: false });
}

export function build(W) {
  W.bounds = { minx: -70, maxx: 70, minz: -110, maxz: 104 };
  ground(W, 700, 'dirt');
  horizon(W, { mat: 'rock', tint: 0x3a3a40, rockTint: 0x2e2e34, mounds: false, r0: 210, peak: 0.9 });
  skyline(W, -320, -190, -260, 260, 26, 21, 0x24242c);
  borderRocks(W, W.bounds, 17, 0x6a6a70);
  for (const x of TRACKS) track(W, x);
  W.block(0, 0, -2, 8, 0.02, 212, 'asphalt', 'sand', { collide: false });
  roadLines(W, 0, -104, 104);
  for (const z of [88, 48, 8, -32, -72]) lampPost(W, 5.5, z, 6.5, -Math.PI / 2);
  for (const z of [68, 28, -12, -52]) lampPost(W, -5.5, z, 6.5, Math.PI / 2);
  gantry(W, 74);
  gantry(W, -54);

  // ===== 1) Başlangıç =====
  truck(W, -11, 98, 1.3);
  jersey(W, -4, 82);
  jersey(W, 6, 78, false);
  container(W, 0, 87, true, 'contGrey'); // kapıdaki makineliye karşı siper
  crate(W, 12, 96, 1.1); // bazuka sandığı
  crate(W, 13.2, 95.3, 0.8, 0, 0.4);

  // ===== 2) Saha kapısı: tel örgü, hat geçitleri gedik =====
  hesco(W, -70, -38, 62, true, 0x8a8478);
  hesco(W, -30, -24, 62, true, 0x8a8478);
  hesco(W, -16, -7, 62, true, 0x8a8478);
  hesco(W, 7, 16, 62, true, 0x8a8478);
  hesco(W, 24, 30, 62, true, 0x8a8478);
  hesco(W, 38, 70, 62, true, 0x8a8478);
  W.block(-4.5, 1.0, 62, 9, 0.12, 0.12, 'paint', 'metal', { collide: false, tint: 0xc83a2a });
  W.block(-7, 0, 62, 0.3, 1.1, 0.3, 'metal', 'metal');
  house(W, 12, 56, 3.4, 3.4, 2.7, 'brick', { w: [{ at: 0, width: 2.0, type: 'door' }], s: [{ at: 0, width: 1.4, type: 'window' }], n: [{ at: 0, width: 1.4, type: 'window' }] });
  W.block(12.6, 0, 57.0, 0.9, 0.75, 0.6, 'woodDark', 'wood');
  tower(W, -11, 54, 5.5, 'tarpRed');
  sandbags(W, -6, 46, 3.5, true);
  sandbags(W, 14, 46, 3.5, true);
  crate(W, 6, 42, 1.1);
  crate(W, -30, 52, 1.2);
  sandbags(W, 27, 55, 3, true);

  // ===== 3) Katarlar =====
  boxcar(W, -34, 46, 'contRed');
  boxcar(W, -34, 32, 'contBlue');
  boxcar(W, -34, 18, 'contGrey');
  boxcar(W, -20, -6, 'contOrange');
  tanker(W, -20, -20);
  boxcar(W, 20, 40, 'contGrey');
  tanker(W, 20, 26);
  loco(W, 34, -16, false);
  boxcar(W, 34, 2, 'contRed');
  boxcar(W, 34, -36, 'contGreen');
  // Hatlar arası siperler
  sandbags(W, 4, 20, 4, true);
  sandbags(W, 14, 10, 3, false);
  jersey(W, -8, 6);
  crate(W, -12, -14, 1.1);
  crate(W, -11, -15.2, 0.9, 0, 0.4);
  sandbags(W, -4, -40, 4, true);
  sandbags(W, -16, -46, 3, false);
  jersey(W, 10, -28, false);
  truck(W, 10, -6, 0.1);

  // ===== 4) İstasyon ve peron (batı) =====
  house(W, -54, 26, 12, 26, 4.5, 'brick', {
    e: [{ at: -6, width: 2.4, type: 'door' }, { at: 6, width: 2.4, type: 'door' }, { at: 0, width: 1.8, type: 'window' }],
    n: [{ at: 0, width: 2.0, type: 'door' }],
    w: [{ at: 0, width: 1.6, type: 'window' }],
  }, { roofMat: 'concreteDark' });
  W.block(-57, 0, 30, 1.6, 0.78, 0.8, 'woodDark', 'wood'); // bilet gişesi (taramalı)
  // Peron 0,3 m: gezinme ağı 0,35 m'den alçak kutuyu yürünebilir sayar (daha yüksekte askerler peronu duvar sanıyordu)
  W.block(-43.5, 0, 26, 6, 0.3, 34, 'concrete', 'concrete', { tint: 0xa8a49a }); // peron
  for (const z of [14, 26, 38]) W.block(-42, 0.3, z, 0.3, 3.25, 0.3, 'metal', 'metal');
  W.block(-43.5, 3.55, 26, 6.6, 0.15, 32, 'metalDark', 'metal', { collide: false });
  crate(W, -44, 18, 1.0, 0.3);
  crate(W, -45, 36, 1.1, 0.3);

  // ===== 5) Kuzeydoğu: lokomotif deposu, su kulesi, kömür yığınları =====
  house(W, 52, -66, 16, 26, 8, 'brick', {
    s: [{ at: 0, width: 9, type: 'gap', top: 6.6 }],
    w: [{ at: 4, width: 2.0, type: 'door' }],
  }, { roofMat: 'metalDark' });
  loco(W, 52, -70, true, 'olive');
  for (const [x, z] of [[46, -58], [58, -76]]) crate(W, x, z, 1.1);
  // Su kulesi: dört ayak, gezinti platformu (nişancı), kuzeydoğu köşesinde tank
  for (const [dx, dz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) W.block(54 + dx, 0, 30 + dz, 0.4, 7, 0.4, 'woodDark', 'wood');
  W.block(54, 7, 30, 6, 0.3, 6, 'woodDark', 'wood');
  W.box(55.3, 9.2, 28.7, 3.2, 3.6, 3.2, 'rust', 'metal', { collide: false });
  rock(W, 56, -8, 7, 2.4, 6, 0.3, 0x2a2a2c);
  rock(W, 60, 8, 6, 2, 5, 1.2, 0x2a2a2c);

  // ===== 6) Kuzey: yük sahası ve helikopter pisti =====
  helipad(W, -6, -90);
  container(W, -28, -94, false, 'contRed');
  container(W, -28, -94, false, 'contBlue', 2.6);
  container(W, 14, -100, true, 'contGrey');
  container(W, 22, -84, false, 'contOrange');
  sandbags(W, -18, -78, 4, true);
  sandbags(W, 6, -78, 3.5, true);
  crate(W, 10, -92, 1.1);

  return {
    playerStart: { pos: V(0, 96), yaw: 0 },
    barrels: [V(15, 60.5), V(15.7, 61.1), V(2, 14), V(2.7, 14.7), V(-8, -36), V(-7.3, -36.7), V(46, -50)],
    aaGuns: [
      { id: 'aa1', pos: V(8, 14), yaw: 0.3, label: 'UÇAKSAVAR-1' },
      { id: 'aa2', pos: V(-8, -46), yaw: -0.4, label: 'UÇAKSAVAR-2' },
    ],
    laptop: null,
    ammoCrates: [V(4, 50), V(-28, 8), V(12, -40), V(-18, -86)],
    weaponPickups: [
      { id: 'rpg', pos: V(12, 96, 1.1), rotY: 0.3 },
      { id: 'shotgun', pos: V(12.6, 57.0, 0.75), rotY: 0.1 },
      { id: 'smg', pos: V(-57, 30, 0.78), rotY: 0.6 },
      { id: 'mar556', pos: V(6, 42, 1.1), rotY: 1.1 },
      { id: 'lmg', pos: V(-12, -14, 1.1), rotY: 0.2 },
      { id: 'sniper', pos: V(46, -58, 1.1), rotY: 0.7 },
    ],
    lz: V(-6, -90),
    heliFrom: V(-170, -90),
    checkpoints: [
      { pos: V(0, 96), yaw: 0 },
      { pos: V(0, 50), yaw: 0 },
      { pos: V(0, 10), yaw: 0 },
      { pos: V(0, -20), yaw: 0 },
      { pos: V(-6, -72), yaw: 0 },
      { pos: V(-6, -84), yaw: 0 },
    ],
    enemies: [
      // Saha kapısı
      { group: 'outpost', type: 'rifleman', pos: V(-4, 58), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(4, 58), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-11, 54, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'rifleman', pos: V(20, 56), yaw: Math.PI, patrol: [V(20, 56), V(20, 50), V(27, 50)] },
      { group: 'outpost', type: 'shotgunner', pos: V(-14, 48), yaw: Math.PI, patrol: [V(-14, 48), V(-26, 48), V(-26, 58)] },
      { group: 'outpost', type: 'rifleman', pos: V(12, 44), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-40, 56), yaw: 2.6 },
      // Hatlar, istasyon, depo
      { group: 'village', type: 'rifleman', pos: V(4, 24), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(12, 6), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(-8, 30), yaw: Math.PI, patrol: [V(-8, 30), V(-8, 12), V(-27, 12), V(-27, 30)] },
      { group: 'village', type: 'heavy', pos: V(-2, 0), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(-43, 30, 0.3), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(-54, 20), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(27, 12), yaw: Math.PI, patrol: [V(27, 12), V(27, -26), V(42, -26), V(42, 12)] },
      { group: 'village', type: 'rifleman', pos: V(-12, -40), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(-2, -50), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(-27, -30), yaw: Math.PI / 2, patrol: [V(-27, -30), V(-27, -60), V(-12, -60), V(-12, -30)] },
      { group: 'village', type: 'rifleman', pos: V(48, -56), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(52.4, 31.6, 7.3), yaw: Math.PI / 2 + 0.4, stationary: true, elevated: true, hardType: 'sniper' },
    ],
    reinforcements: [],
    waves: [
      { t: 3, units: [{ type: 'rifleman', pos: V(-64, -100) }, { type: 'rifleman', pos: V(-60, -106) }, { type: 'rifleman', pos: V(60, -100) }] },
      { t: 26, units: [{ type: 'rifleman', pos: V(-64, -70) }, { type: 'shotgunner', pos: V(-60, -76) }, { type: 'rifleman', pos: V(62, -88) }, { type: 'shotgunner', pos: V(44, -94) }] },
      { t: 54, units: [{ type: 'heavy', pos: V(-6, -108) }, { type: 'rifleman', pos: V(-30, -108) }, { type: 'rifleman', pos: V(20, -108) }, { type: 'rifleman', pos: V(-66, -88) }, { type: 'rifleman', pos: V(64, -78) }] },
    ],
    extraWave: { t: 80, units: [{ type: 'heavy', pos: V(-62, -102) }, { type: 'heavy', pos: V(60, -104) }, { type: 'shotgunner', pos: V(-10, -108) }, { type: 'shotgunner', pos: V(2, -108) }] },
    defendTime: 95,
    waveCalls: ['Batı hattından hareket var!', 'Lokomotif deposundan yeni bir grup!', 'Ağır makineli dahil büyük grup, kuzeyden!', 'Son dalga! İki ağır makineli yanlardan!'],
    obj: {
      outpost: {
        text: 'Saha kapısını temizle', group: 'outpost', marker: V(0, 58, 1.5), doneLine: 'Kapı bizim. ',
        radio: ['Demiryolu kavşağı düşmanın ikmal hattı. İlk hedef saha kapısı; makineli yuvası yola bakıyor, hat geçitlerindeki gediklerden dolan.', 'Karanlıkta namlu alevi seni ele verir. Başlangıçtaki sandıkta bazuka var.'],
      },
      aa: {
        text: 'Hatlar arasındaki uçaksavarları C4 ile imha et', doneLine: 'Gökyüzü temiz! ', one: 'Bir top gitti. Diğeri kuzeyde, tanker vagonunun ötesinde.',
        radio: ['Hatlar arasındaki iki uçaksavar topu helikopterimizi uzak tutuyor. İkisini de C4 ile patlat.', 'Vagonların arası dar; el bombası atmadan köşeyi dönme. Su kulesinde nişancı var.'],
      },
      lz: { text: 'Kuzeydeki yük sahasındaki piste ulaş', radio: ['Şahin-2 kuzeydeki yük sahasına inecek. Ana yoldan ilerle.'] },
      defend: { radio: ['Şahin-2 geliyor. Yük sahasını tut, düşman hatlardan ve depodan sıkıştırıyor!'] },
    },
    hmg: [
      nest(0, 54, 0, 76, 'outpost'), // kapının arkası, yola bakar
      nest(-6, -30, 0, 6, 'village'), // hatlar arası, güneye bakar
      nest(26, -48, 8, -14, 'village'), // lokomotif önü, uçaksavar-2'ye giden yolu tarar
    ],
    tanks: [{ pos: V(8, -62), yaw: Math.PI, group: 'village' }],
    fires: [{ pos: V(-20, -20, 4.2), size: 0.9 }, { pos: V(58, -46, 1.2), size: 0.6 }],
  };
}
