// Mağaza kuralları (Operasyon Güncellemesi §4.8–4.9, §12/1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveSystem } from '../src/save.js';
import { EconomySystem } from '../src/economy.js';
import { StoreSystem, ITEM_BY_ID, BUY } from '../src/store.js';
import { memoryStore } from './helpers.mjs';

function setup(credits = 1000) {
  const save = new SaveSystem({ store: memoryStore(), startCredits: credits });
  const eco = new EconomySystem(save, null);
  return { save, eco, store: new StoreSystem(save, eco) };
}

test('§12/1: 1.000 KR → Hafif Taktik Yelek (800) → 200 KR kalır → kuşanılır', () => {
  const { save, eco, store } = setup();
  const vest = ITEM_BY_ID.get('armor_light');
  assert.equal(store.status(vest), 'available');
  assert.equal(store.buy('armor_light'), BUY.OK);
  assert.equal(eco.credits, 200);
  assert.equal(store.status(vest), 'owned');
  assert.equal(store.equip('armor_light'), true);
  assert.equal(save.data.loadout.armor, 'armor_light');
  assert.equal(store.status(vest), 'equipped');
  assert.equal(store.buy('armor_light'), BUY.OWNED, 'ikinci kez satın alınmaz');
  assert.equal(eco.credits, 200);
});

test('yetersiz kredi: satın alınmaz, eksik miktar hesaplanır', () => {
  const { eco, store } = setup(1650);
  const plate = ITEM_BY_ID.get('armor_plate');
  assert.equal(store.status(plate), 'credit');
  assert.equal(store.missing(plate), 1150, '"1.150 KR eksik"');
  assert.equal(store.buy('armor_plate'), BUY.NO_CREDIT);
  assert.equal(eco.credits, 1650);
});

test('sahip olunmayan zırh kuşanılmaz; kask ayrı yuva; çıkarılabilir', () => {
  const { save, store } = setup(5000);
  assert.equal(store.equip('armor_plate'), false);
  store.buy('helmet_kevlar');
  store.buy('armor_kevlar');
  store.equip('helmet_kevlar');
  store.equip('armor_kevlar');
  assert.deepEqual([save.data.loadout.armor, save.data.loadout.helmet], ['armor_kevlar', 'helmet_kevlar']);
  store.unequip('helmet');
  assert.equal(save.data.loadout.helmet, null);
});

test('sarf malzemesi adetle birikir; üst sınırda "dolu"', () => {
  const { save, store } = setup(10000);
  assert.equal(store.buy('plate_pack'), BUY.OK);
  assert.equal(save.data.inventory.consumables.plate_pack, 3, '3\'lü paket');
  const adr = ITEM_BY_ID.get('adrenaline');
  let n = 0;
  while (store.buy('adrenaline') === BUY.OK) n++;
  assert.equal(n, store.stockLimit(adr));
  assert.equal(store.status(adr), 'full');
});

test('önkoşullu yükseltme: Tim Zırhı Sv. 2 için Sv. 1 gerekir', () => {
  const { store } = setup(20000);
  assert.equal(store.buy('squad_armor_2'), BUY.LOCKED);
  assert.equal(store.buy('squad_armor_1'), BUY.OK);
  assert.equal(store.buy('squad_armor_2'), BUY.OK);
});

test('karşılaştırma: kuşanılana göre daha iyi ▲ / daha kötü ▼', () => {
  const { store } = setup(10000);
  store.buy('armor_kevlar');
  store.equip('armor_kevlar');
  const rows = store.compare(ITEM_BY_ID.get('armor_plate'));
  const zp = rows.find((r) => r.label === 'Zırh Puanı');
  const sp = rows.find((r) => r.label === 'Hız');
  assert.deepEqual([zp.from, zp.to, zp.better], [80, 110, 1], 'ZP 80 → 110 ▲');
  assert.equal(sp.better, -1, 'Hız −%3 → −%6 ▼');
  assert.equal(sp.fmt(sp.to), '−%6');
});
