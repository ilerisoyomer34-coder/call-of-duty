// Oyuncu adı kuralları (shared/names.js): uzunluk, karakterler, Türkçe katlama, küfür filtresi, etiket
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateName, foldName, turkishLower, isProfane, displayName, cleanName } from '../shared/names.js';

test('geçerli adlar kırpılır ve boşluklar teke iner', () => {
  for (const n of ['Ömer', 'Ayşe Gül', 'Kartal-07', 'Mert_09', 'IŞIK', 'Çağrı', 'Sikke']) assert.ok(validateName(n).ok, n);
  assert.equal(validateName('  Ali   Veli ').name, 'Ali Veli');
  assert.equal(cleanName('\tDeniz\n'), 'Deniz');
});

test('kural dışı adlar hata koduyla reddedilir', () => {
  assert.equal(validateName('ab').error, 'short');
  assert.equal(validateName('a'.repeat(17)).error, 'long');
  assert.equal(validateName('Ömer!').error, 'chars');
  assert.equal(validateName('Иван').error, 'chars');
  assert.equal(validateName('12345').error, 'letter');
  assert.equal(validateName('   ').error, 'short');
});

test('Türkçe küçük harf ve ASCII katlama', () => {
  assert.equal(turkishLower('IŞIK İZMİR'), 'ışık izmir');
  assert.equal(foldName('Ömer ÇAĞLAR'), 'omer caglar');
  assert.equal(foldName('Işıl'), 'isil');
});

test('küfür filtresi: rakam hilesi, tekrar eden harf, kelime içi ve ayrı kelime', () => {
  for (const n of ['orospu', 'OR0SPU', 'ooorospu', 'amk', 'Ali amk', 's1k_lord', 'admin', 'siktir git']) assert.ok(isProfane(n), n);
  // Kısa kökler masum kelimelerin içinde serbest
  for (const n of ['Sikke', 'Gotham', 'Amasya', 'Mükemmel', 'Kocaeli']) assert.equal(isProfane(n), false, n);
  assert.equal(validateName('ORO5PU').error, 'banned');
});

test('ad + etiket gösterimi', () => {
  assert.equal(displayName('Ömer', '4821'), 'Ömer#4821');
  assert.equal(displayName('Ömer', '42'), 'Ömer#0042');
  assert.equal(displayName('Ömer', null), 'Ömer');
});
