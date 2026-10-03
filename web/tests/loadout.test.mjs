// Teçhizat kuralları ve silah bilgileri (Operasyon Güncellemesi §5.2–5.5, §4.8 taşıma kuralı)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveSystem } from '../src/save.js';
import { LoadoutSystem, SLOT_COUNT } from '../src/loadout.js';
import { weaponName, setRealNames, weaponStats, weaponInfoLine, weaponBadges, STAT_KEYS } from '../src/weaponInfo.js';
import { WEAPONS, WEAPON_ORDER } from '../src/config.js';
import { memoryStore } from './helpers.mjs';

function setup(consumables = {}) {
  const save = new SaveSystem({ store: memoryStore(), startCredits: 1000 });
  Object.assign(save.data.inventory.consumables, consumables);
  return { save, lo: new LoadoutSystem(save) };
}

test('boş kayıtta varsayılan silahlar; bozuk değerler onarılır', () => {
  const { save, lo } = setup();
  assert.equal(save.data.loadout.primary, 'rifle');
  assert.equal(save.data.loadout.secondary, 'pistol');
  assert.equal(save.data.loadout.slots.length, SLOT_COUNT);
  save.data.loadout.primary = 'pistol'; // yan silah ana yuvada olamaz
  save.data.loadout.armor = 'armor_plate'; // sahip olunmayan zırh
  save.data.loadout.slots = ['medkit', 'medkit', 'yok'];
  lo.repair();
  assert.equal(save.data.loadout.primary, 'rifle');
  assert.equal(save.data.loadout.armor, null);
  assert.deepEqual(save.data.loadout.slots, ['medkit', null]);
});

test('yuvaya uygun silah: yan silah yuvasında yalnız yan silahlar', () => {
  const { save, lo } = setup();
  assert.ok(lo.weaponsFor('secondary').every((id) => WEAPONS[id].category === 'secondary'));
  assert.equal(lo.selectWeapon('secondary', 'rifle'), false);
  assert.equal(lo.selectWeapon('primary', 'lmg'), true);
  assert.equal(save.data.loadout.primary, 'lmg');
  assert.equal(lo.canDeploy(), true);
});

test('taşıma kuralı: yığın sınırı, aynı tür iki yuvaya konmaz, envanterde yoksa konmaz', () => {
  const { save, lo } = setup({ plate_pack: 7, medkit: 1 });
  assert.equal(lo.setSlot(0, 'adrenaline'), false, 'envanterde yok');
  assert.equal(lo.setSlot(0, 'plate_pack'), true);
  assert.equal(lo.setSlot(1, 'plate_pack'), true);
  assert.deepEqual(save.data.loadout.slots, [null, 'plate_pack'], 'aynı tür öbür yuvadan çıkar');
  lo.setSlot(0, 'medkit');
  assert.deepEqual(lo.missionKit(), [{ id: 'medkit', count: 1 }, { id: 'plate_pack', count: 3 }], 'plaka en fazla 3');
});

test('kullanılan sarf envanterden düşer, kullanılmayan kalır', () => {
  const { save, lo } = setup({ medkit: 2 });
  lo.setSlot(0, 'medkit');
  assert.equal(lo.consume('medkit'), true);
  assert.equal(save.data.inventory.consumables.medkit, 1);
  assert.deepEqual(lo.missionKit()[0], { id: 'medkit', count: 1 });
  lo.consume('medkit');
  assert.equal(lo.consume('medkit'), false, 'eksiye düşmez');
  assert.equal(lo.missionKit()[0], null, 'biten tür görevde taşınmaz');
});

test('gerçek ad ayarı: açıkken gerçek, kapalıyken kurgusal ad', () => {
  setRealNames(true);
  assert.equal(weaponName('sniper'), 'Barrett M82A1');
  assert.equal(weaponName('lmg'), 'HK MG4');
  setRealNames(false);
  assert.equal(weaponName('sniper'), 'MR-82 Marret');
  assert.equal(weaponName('pistol'), 'P-9 Sentinel');
  setRealNames(true);
});

test('istatistikler değerlerden türer: 1–100, her çubukta en iyi silah 100', () => {
  const best = {};
  for (const id of WEAPON_ORDER) {
    const s = weaponStats(id);
    assert.equal(s.length, STAT_KEYS.length);
    for (const { key, value } of s) {
      assert.ok(Number.isInteger(value) && value >= 1 && value <= 100, `${id}.${key} = ${value}`);
      best[key] = Math.max(best[key] || 0, value);
    }
  }
  for (const [key] of STAT_KEYS) assert.equal(best[key], 100, key);
  const v = (id, key) => weaponStats(id).find((s) => s.key === key).value;
  assert.ok(v('sniper', 'damage') > v('rifle', 'damage'), 'M82A1 hasarı > AKMS');
  assert.ok(v('smg', 'rate') > v('sniper', 'rate'), 'MP5 atış hızı > M82A1');
  assert.ok(v('sniper', 'range') > v('smg', 'range'), 'M82A1 menzili > MP5');
});

test('bilgi satırı ve rozetler', () => {
  assert.equal(weaponInfoLine('pistol'), '9×19 mm Parabellum · 17 mermi · Tek atış');
  assert.match(weaponInfoLine('shotgun'), /fişek/);
  assert.deepEqual(weaponBadges('sniper'), ['ÇATAL AYAK', 'ZIRH DELİCİ']);
  assert.deepEqual(weaponBadges('lmg'), ['ÇATAL AYAK']);
  assert.deepEqual(weaponBadges('rifle'), []);
});
