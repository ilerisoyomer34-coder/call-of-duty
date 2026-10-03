// Türkçe komut ayrıştırıcı (Operasyon Güncellemesi §8.5 test cümleleri)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, normalize } from '../src/commandParser.js';

const cases = [
  ['Herkes siper alsın!', 'TAKE_COVER', 'all', null],
  ['Kaya beni iyileştir', 'HEAL_PLAYER', ['Alfa-2'], null],
  ['Demir ve Yıldız oraya gidin', 'MOVE_TO', ['Alfa-1', 'Alfa-3'], 'aim'],
  ['alfa 3 baskı ateşi aç', 'SUPPRESS', ['Alfa-3'], null],
  ['ATEŞİ KESİN', 'HOLD_FIRE', 'all', null],
  ['Şunu indirin!', 'ATTACK', 'all', 'aim'],
  ['toplanın, beni takip edin', 'FOLLOW', 'all', null],
  ['pizza ısmarlayın', 'UNKNOWN', 'all', null],
];

for (const [text, cmd, who, target] of cases) {
  test(`"${text}" → ${cmd}`, () => {
    const r = parseCommand(text);
    assert.equal(r.commandId, cmd);
    assert.deepEqual(Array.isArray(r.addressees) ? [...r.addressees].sort() : r.addressees, who);
    if (cmd !== 'UNKNOWN') assert.equal(r.target, target);
    else assert.deepEqual(r.suggest, ['Siper alın', 'Takip edin', 'Pozisyonu koruyun']);
  });
}

test('Türkçe büyük harf: I → ı, İ → i; noktalama ve tire', () => {
  assert.equal(normalize('ATEŞİ KESİN!'), 'ateşi kesin');
  assert.equal(normalize('IŞIK'), 'ışık');
  assert.equal(normalize('Alfa-1, BEKLE...'), 'alfa 1 bekle');
});

test('ek almış kökler ve iki köklü fiiller; yön ifadeleri', () => {
  assert.equal(parseCommand('sipere girin').commandId, 'TAKE_COVER');
  assert.equal(parseCommand('Yıldız ilerle').commandId, 'MOVE_TO');
  assert.equal(parseCommand('burada kalın').commandId, 'HOLD');
  assert.deepEqual(parseCommand('saat 2 yönüne baskı').dir, { clock: 2 });
  assert.deepEqual(parseCommand('alfa iki sol tarafı temizle').addressees, ['Alfa-2']);
});
