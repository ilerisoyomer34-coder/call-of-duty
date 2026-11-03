// Ekonomi: kredi ekle/harca, eksiye düşmeme, işlem günlüğü, olay, biçim (Operasyon Güncellemesi §4.2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveSystem, SAVE_KEY } from '../src/save.js';
import { EconomySystem, formatKR } from '../src/economy.js';
import { EV } from '../src/events.js';
import { memoryStore } from './helpers.mjs';

function setup(start = 1000, logSize = 50) {
  const store = memoryStore();
  const save = new SaveSystem({ store, startCredits: start });
  const seen = [];
  const events = { emit: (type, p) => seen.push({ type, ...p }) };
  return { store, save, eco: new EconomySystem(save, events, { logSize }), seen };
}

test('başlangıç kredisi 1.000 KR; biçim Türkçe binlik ayırıcılı', () => {
  const { eco } = setup();
  assert.equal(eco.credits, 1000);
  assert.equal(formatKR(12500), '12.500 KR');
  assert.equal(formatKR(1000), '1.000 KR');
  assert.equal(formatKR(0), '0 KR');
});

test('harcama: yeterliyse düşer ve hemen kayda yazılır; yetmezse değişmez', () => {
  const { eco, store } = setup();
  assert.equal(eco.spend(800, 'Hafif Taktik Yelek'), true);
  assert.equal(eco.credits, 200);
  assert.equal(store.raw(SAVE_KEY).credits, 200, 'satın alma anında yazılır');
  assert.equal(eco.spend(1500, 'Kevlar'), false);
  assert.equal(eco.credits, 200);
  assert.equal(eco.canAfford(200), true);
  assert.equal(eco.canAfford(201), false);
});

test('kredi asla eksiye düşmez; geçersiz miktarlar yok sayılır', () => {
  const { eco } = setup(100);
  assert.equal(eco.add(-50), 0);
  assert.equal(eco.add(NaN), 0);
  assert.equal(eco.spend(-10), false);
  assert.equal(eco.credits, 100);
  eco.set(-500);
  assert.equal(eco.credits, 0);
});

test('işlem günlüğü ve CREDITS_CHANGED olayı; günlük boyutu sınırlı', () => {
  const { eco, seen } = setup(1000, 3);
  eco.add(300, 'Keskin Göz');
  eco.spend(500, 'Kask');
  eco.add(20, 'teselli');
  eco.add(20, 'teselli');
  assert.equal(eco.log.length, 3, 'en eski kayıt atılır');
  assert.deepEqual(eco.log.map((e) => e.delta), [-500, 20, 20]);
  assert.equal(eco.log.at(-1).balance, 840);
  assert.equal(seen.length, 4);
  assert.equal(seen[0].type, EV.CREDITS_CHANGED);
  assert.equal(seen[0].credits, 1300);
  assert.equal(seen[1].delta, -500);
});
