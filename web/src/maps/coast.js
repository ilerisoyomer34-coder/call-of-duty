// Kıyı Çıkarması: şafakta sahile çıkarma. Çıkarma gemilerinin arkasından kumsala, engellerin arasından kum
// tepesindeki beton sığınaklara (makineli yuvaları) tırmanılır; sahil yolundaki tankları al ya da patlat, köydeki
// iki kıyı topunu C4 ile sustur, burundaki pisti helikopter gelene dek tut. Denizden dost bir tank da çıkar.
//
// Kuşbakışı (kuzey yukarıda, -Z; deniz güneyde):
//   z=-84  [ BURUN · HELİKOPTER PİSTİ ]
//   z=-44  [ BALIKÇI KÖYÜ · KIYI TOPU-1 / TOPU-2 ]      deniz feneri (doğu)
//   z=  0  ═════ sahil yolu: düşman tankları ═════
//   z= 26  ▲ kum tepesi · SIĞINAKLAR (MAKİNELİ-1..3) · siper hattı
//   z= 46  ✕ ✕ çıkarma engelleri ✕ ✕   kumsal
//   z= 74  ★ BAŞLANGIÇ: çıkarma gemileri · dost tank
//   z>80   ≈≈≈ deniz ≈≈≈
import * as THREE from 'three';
import { V, nest, house, sandbags, crate, truck, tower, palm, rock, lampPost, horizon, borderRocks, ground, bunker, roadLines, helipad, mulberry } from './kit.js';

// Çıkarma gemisi: alçak tekne, açık rampa (önden binilir); iki yan duvarı siper
function landingCraft(W, cx, cz) {
  W.block(cx, 0, cz + 2, 5, 0.6, 9, 'olive', 'metal', { collide: false });
  for (const s of [-1, 1]) W.block(cx + s * 2.4, 0, cz + 2, 0.3, 1.9, 9, 'olive', 'metal');
  W.block(cx, 0, cz + 6.4, 5, 2.2, 0.3, 'olive', 'metal'); // kıç
  W.block(cx, 0, cz - 3.4, 4.6, 0.14, 3, 'metalDark', 'metal', { collide: false }); // indirilmiş rampa
}

// Çek kirpisi: üç çapraz kiriş (diz boyu engel)
function hedgehog(W, cx, cz) {
  const g = new THREE.BoxGeometry(0.16, 0.16, 2.2);
  for (const [rx, ry] of [[0.6, 0], [0.6, Math.PI / 2], [Math.PI / 2, 0]]) {
    W.addGeometry(g, 'metalDark', new THREE.Matrix4().makeTranslation(cx, 0.6, cz).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeRotationX(rx)), 0x3a3a38);
  }
  W.addCollider(cx - 0.7, 0, cz - 0.7, cx + 0.7, 1.1, cz + 0.7, 'metal');
}

// Deniz feneri: beyaz-kırmızı kule, tepede ışıyan fener
function lighthouse(W, cx, cz) {
  for (let i = 0; i < 6; i++) {
    const g = new THREE.CylinderGeometry(2.1 - i * 0.18, 2.3 - i * 0.18, 3, 14);
    W.addGeometry(g, 'plasterWhite', new THREE.Matrix4().makeTranslation(cx, 1.5 + i * 3, cz), i % 2 ? 0xb83a2e : 0xf2efe6);
  }
  W.addGeometry(new THREE.CylinderGeometry(1.2, 1.2, 1.4, 12), 'lampGlow', new THREE.Matrix4().makeTranslation(cx, 18.7, cz));
  W.addGeometry(new THREE.ConeGeometry(1.5, 1.4, 12), 'metalDark', new THREE.Matrix4().makeTranslation(cx, 20.1, cz));
  W.addCollider(cx - 1.9, 0, cz - 1.9, cx + 1.9, 18, cz + 1.9, 'concrete');
}

export function build(W) {
  W.bounds = { minx: -70, maxx: 70, minz: -106, maxz: 98 };
  ground(W, 700, 'sand');
  // Deniz: kumsalın güneyi (yürünmez değil ama çarpışmasız yüzey; harita sınırı 98'de)
  W.block(0, 0.02, 200, 700, 0.02, 230, 'water', 'sand', { collide: false, tint: 0x6a9ab0 });
  W.block(0, 0.015, 84, 700, 0.02, 6, 'sand', 'sand', { collide: false, tint: 0x9a8a6a }); // ıslak kum
  horizon(W, { mat: 'rock', tint: 0x8a8070, rockTint: 0x6a6258, r0: 210, peak: 1.0, seed: 41, skip: [Math.PI / 2, 0.9] });
  borderRocks(W, W.bounds, 43, 0xb0a28a, { skip: (side) => side === 's' }); // güney deniz

  // ===== 1) Başlangıç: çıkarma gemileri =====
  landingCraft(W, -14, 74);
  landingCraft(W, 2, 76);
  landingCraft(W, 20, 73);
  crate(W, 8, 70, 1.1); // roketatar
  crate(W, 9.1, 70.6, 0.8, 0, 0.5);

  // ===== 2) Kumsal engelleri =====
  const rnd = mulberry(17);
  for (let i = 0; i < 22; i++) {
    const x = -60 + i * 5.6 + rnd() * 2;
    const z = 44 + rnd() * 10;
    if (Math.abs(x - 2) < 4) continue; // tankın geçeceği koridor
    hedgehog(W, x, z);
  }
  sandbags(W, -30, 52, 5, true, 0.8);
  sandbags(W, 30, 50, 5, true, 0.8);
  rock(W, -44, 58, 3, 1.4, 2.4, 0.3, 0x9a8e7a);
  rock(W, 46, 60, 3.4, 1.6, 2.8, 1.1, 0x9a8e7a);

  // ===== 3) Kum tepesi ve sığınaklar =====
  // Set: ortada tankın geçeceği 10 m'lik gedik
  for (const [x, w] of [[-40, 30], [-8.5, 7], [8.5, 7], [40, 30]]) W.block(x, 0, 30, w, 1.2, 8, 'sand', 'sand', { tint: 0xd8c49a });
  bunker(W, -26, 22, 8, 6, { front: 's' });
  bunker(W, 0, 20, 8, 6, { front: 's' });
  bunker(W, 26, 22, 8, 6, { front: 's' });
  for (const x of [-12, 12, -44, 44]) sandbags(W, x, 26, 6, true);
  tower(W, -50, 18, 5.5, 'tarpTan');

  // ===== 4) Sahil yolu =====
  W.block(0, 0.004, 0, 140, 0.02, 9, 'asphalt', 'concrete', { collide: false });
  roadLines(W, 0, -70, 70, false);
  truck(W, -40, 3, Math.PI / 2, true);
  truck(W, 34, -2, -Math.PI / 2, false, 'olive');
  lighthouse(W, 54, -30);

  // ===== 5) Balıkçı köyü ve kıyı topları =====
  const P = 'plasterWhite';
  house(W, -30, -40, 9, 7, 3.2, P, { s: [{ at: 0, width: 1.5, type: 'door' }], e: [{ at: 0, width: 1.2, type: 'window' }] }, { roofMat: 'tarpRed' });
  house(W, -14, -54, 8, 7, 3, P, { e: [{ at: 0, width: 1.5, type: 'door' }], s: [{ at: 1, width: 1.2, type: 'window' }] }, { roofMat: 'tarpRed' });
  house(W, 18, -50, 10, 7, 3.2, P, { w: [{ at: 0, width: 1.5, type: 'door' }], s: [{ at: -2, width: 1.2, type: 'window' }] }, { roofMat: 'tarpRed' });
  house(W, 30, -36, 7, 6, 3, P, { s: [{ at: 0, width: 1.4, type: 'door' }] }, { roofMat: 'tarpRed' });
  for (const [x, z] of [[-40, -26], [-22, -26], [6, -28], [40, -50], [-6, -66], [26, -66]]) palm(W, x, z, 6 + (x % 3));
  sandbags(W, -8, -30, 4, true);
  sandbags(W, 10, -32, 4, true);
  crate(W, 0, -40, 1.2);
  crate(W, -20, -44, 1.1);
  lampPost(W, -4, -24, 6, Math.PI / 2);
  lampPost(W, 12, -24, 6, -Math.PI / 2);

  // ===== 6) Burun ve pist =====
  W.block(0, 0.006, -84, 34, 0.02, 28, 'dirt', 'sand', { collide: false });
  helipad(W, 0, -84);
  sandbags(W, -12, -72, 4, true);
  sandbags(W, 12, -72, 4, true);
  sandbags(W, -18, -94, 4, false);
  sandbags(W, 18, -94, 4, false);
  rock(W, -24, -82, 3, 2, 3, 0.5, 0xa09480);
  rock(W, 26, -86, 3.4, 2.2, 3, 1.3, 0xa09480);

  return {
    playerStart: { pos: V(2, 74), yaw: 0 },
    // Çimen yalnız kum tepesinin gerisinde ve köyde: ıslak kumsal, yol ve pist boş
    grassAvoid: [[-70, 36, 70, 98], [-70, -5, 70, 5], [-17, -98, 17, -70]],
    barrels: [V(-38, 6), V(-37.3, 6.6), V(30, -40), V(-10, -58), V(8, -76)],
    aaGuns: [
      { id: 'cg1', pos: V(-22, -34), yaw: Math.PI, label: 'KIYI TOPU-1', group: 'village' },
      { id: 'cg2', pos: V(24, -42), yaw: Math.PI, label: 'KIYI TOPU-2', group: 'village' },
    ],
    vehicles: [{ kind: 'tank', pos: V(2, 64), yaw: 0 }],
    ammoCrates: [V(-6, 70), V(-14, 26.5), V(-2, -10), V(4, -36), V(-6, -76)],
    weaponPickups: [
      { id: 'rpg', pos: V(8, 70, 1.1), rotY: 0.3 },
      { id: 'sniper', pos: V(-50, 18.5, 0.1), rotY: 0.8 },
      { id: 'lmg', pos: V(0, 20, 0.05), rotY: 0.2 },
      { id: 'rpg', pos: V(0, -40, 1.2), rotY: 0.5 },
      { id: 'shotgun', pos: V(-20, -44, 1.1), rotY: 1.0 },
    ],
    lz: V(0, -84),
    heliFrom: V(0, 200),
    checkpoints: [
      { pos: V(2, 74), yaw: 0 },
      { pos: V(0, 36), yaw: 0 },
      { pos: V(0, 8), yaw: 0 },
      { pos: V(0, -20), yaw: 0 },
      { pos: V(0, -62), yaw: 0 },
      { pos: V(0, -76), yaw: 0 },
    ],
    enemies: [
      // Kum tepesi ve sığınaklar
      { group: 'outpost', type: 'rifleman', pos: V(-26, 20), yaw: 0 + Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(26, 20), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-12, 24), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(12, 24), yaw: Math.PI },
      { group: 'outpost', type: 'heavy', pos: V(-40, 24.8), yaw: Math.PI },
      { group: 'outpost', type: 'heavy', pos: V(40, 24.8), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-50, 18, 5.8), yaw: Math.PI, stationary: true, elevated: true, hardType: 'sniper' },
      { group: 'outpost', type: 'shotgunner', pos: V(0, 14), yaw: Math.PI },
      { group: 'outpost', type: 'rifleman', pos: V(-34, 12), yaw: Math.PI, patrol: [V(-34, 12), V(-20, 12), V(-20, 4)] },
      { group: 'outpost', type: 'rifleman', pos: V(34, 12), yaw: Math.PI, patrol: [V(34, 12), V(20, 12), V(20, 4)] },
      // Köy ve toplar
      { group: 'village', type: 'rifleman', pos: V(-8, -32), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(10, -34), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(-30, -44.6), yaw: Math.PI },
      { group: 'village', type: 'shotgunner', pos: V(18, -54.6), yaw: Math.PI },
      { group: 'village', type: 'heavy', pos: V(0, -46), yaw: Math.PI },
      { group: 'village', type: 'rifleman', pos: V(54, -26), yaw: Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(-40, -50), yaw: -Math.PI / 2 },
      { group: 'village', type: 'rifleman', pos: V(30, -36), yaw: Math.PI },
      { group: 'village', type: 'robot', pos: V(-4, -60), yaw: Math.PI, hardType: 'robot' },
    ],
    reinforcements: [
      { type: 'rifleman', pos: V(-12, -70) },
      { type: 'rifleman', pos: V(12, -70) },
      { type: 'shotgunner', pos: V(0, -100) },
    ],
    waves: [
      { t: 4, units: [{ type: 'rifleman', pos: V(-64, -96) }, { type: 'rifleman', pos: V(-60, -102) }, { type: 'rifleman', pos: V(64, -96) }] },
      { t: 30, units: [{ type: 'shotgunner', pos: V(-64, -80) }, { type: 'rifleman', pos: V(64, -80) }, { type: 'heavy', pos: V(0, -104) }] },
      { t: 58, units: [{ type: 'robot', pos: V(-60, -100) }, { type: 'rifleman', pos: V(-20, -104) }, { type: 'rifleman', pos: V(22, -104) }, { type: 'shotgunner', pos: V(62, -92) }] },
    ],
    defendTime: 95,
    waveCalls: ['Burnun iki yanından piyade geliyor!', 'Ağır makineli dahil yeni grup, kuzeyden!', 'Bir robot iniyor! Bazukaları hazırlayın!'],
    obj: {
      outpost: {
        text: 'Kum tepesindeki sığınakları al', group: 'outpost', marker: V(0, 22, 1.5), doneLine: 'Sahil bizim! ',
        radio: ['Rampa iniyor! Kumsal açık arazi: engellerin ve gemilerin arkasından ilerle.', 'Arkanda dost bir tank var, istersen bin. Sığınakların mazgallarını top ile sustur.'],
      },
      aa: {
        text: 'Köydeki iki kıyı topunu C4 ile sustur', doneLine: 'Kıyı topları sustu! ', one: 'Bir top gitti. Diğeri köyün doğusunda.',
        radio: ['Sahil yolunda düşman tankları var. Mürettebat ağır hasarda kaçar; boş tankı sen kullanabilirsin.', 'Köydeki iki kıyı topu filomuzu vuruyor. C4 ile sustur.'],
      },
      lz: { text: 'Burundaki helikopter pistine ulaş' },
      defend: { radio: ['Şahin-2 denizden geliyor. Pisti tut!'] },
    },
    tanks: [
      { pos: V(-22, -6), yaw: -Math.PI / 2, group: 'village' },
      { pos: V(26, 2), yaw: Math.PI / 2, group: 'village' },
    ],
    hmg: [
      nest(-26, 23.2, -26, 60, 'outpost'), // sığınak mazgalları
      nest(0, 21.2, 0, 60, 'outpost'),
      nest(26, 23.2, 26, 60, 'outpost'),
      nest(0, -30, 0, 0, 'village'), // köy girişi
    ],
    fires: [{ pos: V(-40, 3, 1.6), size: 0.9 }, { pos: V(-14, 74, 1.2), size: 0.5 }],
  };
}
