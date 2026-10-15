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

test('ASCII yazımı, eş anlamlılar ve tek harf hatası; net eşleşme bulanık eşleşmeden önceliklidir', () => {
  for (const [text, id] of [
    ['Yildiz baski atesi ac', 'SUPPRESS'], ['Herkes geri çekilsin', 'MOVE_TO'],
    ['Kaya ilk yardım yap', 'HEAL_PLAYER'], ['Demir silahını indir', 'HOLD_FIRE'],
    ['şu binaya geçin', 'MOVE_TO'], ['Siperr alın', 'TAKE_COVER'],
    ['ilerlyin', 'MOVE_TO'], ['beni koru', 'FOLLOW'], ['ateş edin', 'ATTACK'],
  ]) assert.equal(parseCommand(text).commandId, id, text);
});

test('olumsuz ateş ve hareket emirleri olumlu eyleme dönüşmez', () => {
  for (const text of ['Ateş etmeyin', 'Saldırmayın', 'Kimseyi vurmayın', 'Ateş açmayın']) assert.equal(parseCommand(text).commandId, 'HOLD_FIRE', text);
  for (const text of ['gitmeyin', 'ilerlemeyin', 'Beni takip etmeyin']) assert.equal(parseCommand(text).commandId, 'HOLD', text);
  assert.equal(parseCommand('siper almayın').reason, 'negated-order');
  for (const text of ['Beni izlemeyin', 'Yürümeyin', 'Koşmayın', 'Oraya girmeyin']) assert.equal(parseCommand(text).commandId, 'HOLD', text);
  for (const text of ['Bekleme', 'Durmayın', 'Etrafı taramayın', 'Saklanmayın', 'Çömelmeyin']) assert.equal(parseCommand(text).reason, 'negated-order', text);
});

test('sıralı emirler, hitap virgülleri ve adımda yeni asker seçimi', () => {
  const r = parseCommand('Demir sola 20 metre git, sonra bekle');
  assert.deepEqual(r.steps.map((s) => s.commandId), ['MOVE_TO', 'HOLD']);
  assert.ok(r.steps.every((s) => s.addressees[0] === 'Alfa-1'));
  assert.equal(r.steps[0].distance, 20);
  assert.deepEqual(r.steps[0].dir, { clock: 9 });
  assert.deepEqual(parseCommand('Demir, Kaya ve Yıldız, oraya gidin').addressees.sort(), ['Alfa-1', 'Alfa-2', 'Alfa-3']);
  const separate = parseCommand('Demir oraya git ve Yıldız koruma ateşi aç');
  assert.deepEqual(separate.steps.map((s) => s.addressees), [['Alfa-1'], ['Alfa-3']]);
  assert.equal(parseCommand('Demir sola git sonra pizza yap').commandId, 'UNKNOWN');
  assert.equal(parseCommand(Array(9).fill('bekle').join(' sonra ')).reason, 'too-many-steps');
});

test('mesafe, saat yönü ve dünya referansları', () => {
  assert.deepEqual(parseCommand('saat üç yönüne yirmi metre git').dir, { clock: 3 });
  assert.equal(parseCommand('saat üç yönüne yirmi metre git').distance, 20);
  assert.deepEqual(parseCommand('sol arka tarafa git').dir, { clock: 7.5 });
  for (const text of ['saat 0 yönüne git', 'saat 25 yönüne git']) assert.equal(parseCommand(text).reason, 'invalid-direction');
  assert.equal(parseCommand('sola 500 metre git').reason, 'invalid-distance');
  assert.equal(parseCommand('sola 0 metre git').reason, 'invalid-distance');
  assert.equal(parseCommand('sola -5 metre git').reason, 'invalid-distance');
  assert.deepEqual(parseCommand('saat on iki yönüne git').dir, { clock: 0 });
  assert.deepEqual(parseCommand('saat on bir yönüne git').dir, { clock: 11 });
  assert.equal(parseCommand('sola yüz yirmi metre git').distance, 120);
  assert.equal(parseCommand('sola yirmi beş metre git').distance, 25);
  assert.equal(parseCommand('sola iki metre git').distance, 2);
  for (const [text, kind] of [
    ['görev hedefine ilerle', 'objective'], ['tahliye noktasına git', 'extraction'],
    ['istihbarata git', 'intel'], ['tankın yanına git', 'tank'],
    ['helikopterin yanına ilerle', 'helicopter'], ['buraya gelmeyin', null],
    ['En yakındaki düşmana ateş edin', 'nearest-enemy'],
  ]) assert.equal(parseCommand(text).reference?.kind || null, kind, text);
});

test('yardım, durum ve iptal; desteklenmeyen emirde dürüst yanıt', () => {
  assert.equal(parseCommand('yardım').commandId, 'HELP');
  assert.equal(parseCommand('Kaya durum raporu ver').commandId, 'STATUS');
  assert.equal(parseCommand('Kaya durum raporu verir misin').commandId, 'STATUS');
  assert.equal(parseCommand('Bana yardım et').commandId, 'HEAL_PLAYER');
  assert.equal(parseCommand('Alfa-2 buraya gel').commandId, 'MOVE_TO');
  assert.equal(parseCommand('Demir benimle kal').commandId, 'FOLLOW');
  assert.equal(parseCommand('emirleri iptal et').commandId, 'CANCEL_PLAN');
  for (const text of ['Helikoptere binin', 'Tanka bin', 'bomba atın', 'üçgen düzenine geç']) {
    const r = parseCommand(text);
    assert.equal(r.commandId, 'UNKNOWN', text);
    assert.equal(r.reason, 'unsupported', text);
    assert.ok(r.message.length > 20);
  }
  for (const text of ['araba çok güzel', 'merhaba nasılsın', 'pizza ısmarla']) assert.equal(parseCommand(text).commandId, 'UNKNOWN', text);
});

test('bağlaçlar ayrı emirleri ayırır; asker adlarını ve özgün metni korur', () => {
  const r = parseCommand('Demir bekle ama Yıldız ateş serbest');
  assert.deepEqual(r.steps.map((s) => s.commandId), ['HOLD', 'FREE_FIRE']);
  assert.deepEqual(r.steps.map((s) => s.addressees), [['Alfa-1'], ['Alfa-3']]);
  assert.equal(r.steps[1].sourceText, 'Yıldız ateş serbest');
});

test('doğal konuşma ve fiilsiz kısa yön cevabı', () => {
  for (const [text, id] of [
    ['Demir açıkta durma', 'TAKE_COVER'], ['Yıldız başını kaldırma', 'TAKE_COVER'],
    ['yerini terk etme', 'HOLD'], ['yanımdan uzaklaşma', 'FOLLOW'],
    ['bana pansuman yap', 'HEAL_PLAYER'], ['şurayı ateş altında tut', 'SUPPRESS'],
    ['ateş etmeyi bırak', 'HOLD_FIRE'], ['ateşe başlayın', 'FREE_FIRE'],
    ['işaret ettiğim düşmana saldır', 'ATTACK'], ['geri dön', 'MOVE_TO'],
    ['içeriyi kontrol et', 'CLEAR_AREA'], ['Demir sola 10 metre', 'MOVE_TO'],
    ['Silahlarınızı indirin', 'HOLD_FIRE'],
  ]) assert.equal(parseCommand(text).commandId, id, text);
  assert.equal(parseCommand('sola 10 metre').distance, 10);
  assert.equal(parseCommand('aynısını yap').reason, 'missing-context');
  assert.equal(parseCommand('devam et').reason, 'missing-context');
});

test('takip cümlesi önceki muhatabı hatırlar; açık hitap ve çark seçimi önceliklidir', () => {
  const context = { addressees: ['Alfa-1'], defaultAddressees: 'Alfa-2', lastOrder: { commandId: 'MOVE_TO', addressees: ['Alfa-1'] } };
  assert.deepEqual(parseCommand('şimdi bekle', context).addressees, ['Alfa-1']);
  assert.equal(parseCommand('bekle', context).addressees, 'Alfa-2');
  assert.equal(parseCommand('herkes şimdi bekle', context).addressees, 'all');
  assert.deepEqual(parseCommand('emri tekrarla', context).addressees, ['Alfa-1']);
  assert.equal(parseCommand('şimdi aynısını yap', context).commandId, 'MOVE_TO');
  assert.deepEqual(parseCommand('Yıldız aynısını yap', context).addressees, ['Alfa-3']);
  assert.equal(parseCommand('şu kayanın arkasına git').addressees, 'all');
});
