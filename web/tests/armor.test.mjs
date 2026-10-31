// Zırh formülü (Operasyon Güncellemesi §4.5 doğrulama örnekleri, §4.6 tablosu, §12/2 senaryosu)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeArmorDamage, makePiece, ArmorLoadout, shotsToDown, penFor, enemyPen, rollEnemyArmor, playerZoneAt } from '../src/armor.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

test('§4.5/1: AKM (36, delme 0,35) → Seramik Plaka', () => {
  const p = makePiece('armor_plate');
  const r = computeArmorDamage(36, 0.35, p);
  near(r.effectiveAbsorb, 0.3575, 'etkin emme');
  near(r.absorbed, 12.87, 'emilen');
  near(r.healthDamage, 23.13, 'cana giden');
  near(p.points, 97.13, 'kalan zırh');
});

test('§4.5/2: Glock 17 (25, 0,10) → Hafif Taktik Yelek', () => {
  const p = makePiece('armor_light');
  const r = computeArmorDamage(25, 0.1, p);
  near(r.effectiveAbsorb, 0.315, 'etkin emme');
  near(r.absorbed, 7.875, 'emilen');
  near(r.healthDamage, 17.125, 'cana giden');
  near(p.points, 42.125, 'kalan zırh');
});

test('§4.5/3: AI AWM (115, 0,75) → Seramik Plaka: 100 canlı oyuncu tek vuruşta düşmez', () => {
  const p = makePiece('armor_plate');
  const r = computeArmorDamage(115, 0.75, p);
  near(r.effectiveAbsorb, 0.1375, 'etkin emme');
  near(r.absorbed, 15.8125, 'emilen');
  near(r.healthDamage, 99.1875, 'cana giden');
  assert.ok(100 - r.healthDamage > 0);
});

test('§4.5/4: Barrett M82A1 (150, 1,00) → her zırh: emilen 0, tek atış', () => {
  for (const id of ['armor_light', 'armor_kevlar', 'armor_plate', 'armor_heavy', 'armor_assault']) {
    const p = makePiece(id);
    const r = computeArmorDamage(150, 1, p);
    assert.equal(r.absorbed, 0, id);
    assert.equal(r.healthDamage, 150, id);
    assert.equal(p.points, p.max, `${id} aşınmaz`);
  }
});

test('§12/2: Hafif Taktik Yelekli oyuncuya AKM ile tek gövde vuruşu → can 72,19, zırh 41,81', () => {
  const a = new ArmorLoadout('armor_light', null);
  const r = computeArmorDamage(36, 0.35, a.pieceFor('torso'));
  near(100 - r.healthDamage, 72.19, 'can');
  near(a.body.points, 41.81, 'zırh');
});

test('zırh bitince kırılır, artan hasarın tamamı cana gider', () => {
  const p = makePiece('armor_light');
  p.points = 3;
  const r = computeArmorDamage(36, 0.35, p);
  near(r.absorbed, 3, 'en fazla kalan zırh kadar emer');
  near(r.healthDamage, 33, 'gerisi cana');
  assert.equal(r.broken, true);
  const r2 = computeArmorDamage(36, 0.35, p);
  assert.equal(r2.absorbed, 0);
  assert.equal(r2.healthDamage, 36);
});

test('§4.6 tablosu: yere düşürmek için gereken gövde vuruşu (belgedeki tabloyla birebir)', () => {
  const armors = [null, 'armor_light', 'armor_kevlar', 'armor_plate', 'armor_heavy', 'armor_assault'];
  const table = {
    'Glock 17': [25, 0.1, [4, 6, 7, 8, 10, 13]],
    'AKS-74U': [28, 0.3, [4, 5, 6, 6, 7, 8]],
    AKM: [36, 0.35, [3, 4, 4, 5, 5, 6]],
    'HK MG4': [30, 0.3, [4, 5, 5, 6, 7, 8]],
    'AI AWM': [115, 0.75, [1, 1, 1, 2, 2, 2]],
    'Barrett M82A1': [150, 1, [1, 1, 1, 1, 1, 1]],
  };
  for (const [name, [dmg, pen, want]] of Object.entries(table)) {
    assert.deepEqual(armors.map((a) => shotsToDown(dmg, pen, a)), want, name);
  }
});

test('bölge kuralı: kafa → kask, gövde/kol → yelek, bacak → zırh yok', () => {
  const a = new ArmorLoadout('armor_kevlar', 'helmet_tactical');
  assert.equal(a.pieceFor('head'), a.helmet);
  assert.equal(a.pieceFor('torso'), a.body);
  assert.equal(a.pieceFor('arm'), a.body);
  assert.equal(a.pieceFor('leg'), null);
  assert.equal(a.pieceFor('limb'), null);
});

test('hız cezası ve Ağır Saldırı Zırhı koşu kısıtı; plaka azami değere kadar doldurur', () => {
  near(new ArmorLoadout('armor_plate', 'helmet_heavy').speedMult, 0.92, 'plaka −%6 + ağır kask −%2');
  assert.equal(new ArmorLoadout('armor_assault').noSprint, true);
  assert.equal(new ArmorLoadout('armor_heavy').noSprint, false);
  assert.equal(new ArmorLoadout().speedMult, 1);
  const a = new ArmorLoadout('armor_light');
  a.body.points = 20;
  assert.equal(a.addPoints(50), 30, 'en fazla 50 ZP\'ye kadar');
  assert.equal(a.body.points, 50);
  a.body.points = 10;
  a.refill();
  assert.equal(a.body.points, 50);
});

test('zırh delme: silah verisinden; patlama, dost tüfeği ve bıçak ayrı', () => {
  assert.equal(penFor('sniper'), 1);
  assert.equal(penFor('pistol'), 0.1);
  assert.equal(penFor('explosion'), 0.5);
  assert.equal(penFor('rpg'), 0.5);
  assert.equal(penFor('allyRifle'), 0.35);
  assert.equal(penFor('melee'), 0.2);
  assert.equal(penFor('bilinmeyen'), 0.3);
  assert.equal(enemyPen('sniper'), 0.75);
  assert.equal(enemyPen('rifle'), 0.35);
});

test('düşman zırhı: türe, zorluğa ve seviyeye göre', () => {
  const always = () => 0;
  const never = () => 0.999;
  const heavy = rollEnemyArmor('heavy', 'normal', 1, never);
  assert.ok(heavy?.body && heavy.helmet, 'ağır asker her zaman zırhlı (olasılık 1)');
  assert.equal(rollEnemyArmor('rifleman', 'normal', 1, always), null, 'tüfekçi 2. seviyeden önce zırhsız');
  assert.equal(rollEnemyArmor('rifleman', 'easy', 4, always), null, 'Kolay\'da tüfekçi zırhsız');
  assert.equal(rollEnemyArmor('rifleman', 'hard', 4, always)?.body.id, 'armor_light');
  assert.equal(rollEnemyArmor('rifleman', 'hard', 4, never), null, 'olasılık dışında zırhsız');
  assert.equal(rollEnemyArmor('aaGunner', 'hard', 6, always), null, 'tabloda olmayan tür zırhsız');
  const sniper = rollEnemyArmor('sniper', 'hard', 5, always);
  assert.ok(sniper && !sniper.body && sniper.helmet, 'nişancı yalnız kask');
});

test('oyuncunun vurulduğu bölge isabet yüksekliğinden', () => {
  assert.equal(playerZoneAt(1.7, 1.8), 'head');
  assert.equal(playerZoneAt(1.2, 1.8), 'torso');
  assert.equal(playerZoneAt(0.5, 1.8), 'leg');
  assert.equal(playerZoneAt(1.0, 1.15), 'head', 'çömelmişken kafa daha alçakta');
});
