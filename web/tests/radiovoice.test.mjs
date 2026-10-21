// Sesli telsiz (src/radioVoice.js): okunur metin, konuşmacı profilleri, ses seçimi, sıra ve öncelik
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RADIO_VOICE } from '../src/config.js';
import SQUAD from '../src/data/squad.json' with { type: 'json' };

// Tarayıcının konuşma API'si yerine sahte: konuşulanlar kaydedilir, bitiş elle tetiklenir
const spoken = [];
let cancels = 0;
globalThis.window = globalThis;
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};
globalThis.speechSynthesis = {
  getVoices: () => [
    { name: 'Microsoft Tolga', lang: 'tr-TR', localService: true },
    { name: 'Microsoft Ahmet Online (Natural) - Turkish', lang: 'tr-TR', localService: false },
    { name: 'Google English', lang: 'en-US', localService: false },
    { name: 'Google Türkçe', lang: 'tr_TR', localService: false },
  ],
  speak: (u) => spoken.push(u),
  cancel: () => cancels++,
};
const { sayable, profileFor, rankVoices, RadioVoice } = await import('../src/radioVoice.js');

const game = () => {
  const keys = [];
  return {
    settings: { radioVoice: true, radioVolume: 0.7 },
    audio: { radioKey: (o) => keys.push(o ? 'open' : 'close'), radioHiss: () => {} },
    keys,
  };
};

test('ekrandaki satır okunur metne çevrilir', () => {
  assert.equal(sayable('🎤 Alfa-2 sola 20 m git'), 'Alfa iki sola 20 metre git');
  assert.equal(sayable('YUVA: Hedef KARARGÂH binası'), 'Yuva: Hedef Karargâh binası');
  assert.equal(sayable('Alfa-3 → saat 2, 1,5 km'), 'Alfa üç, saat 2, 1,5 kilometre');
  assert.equal(sayable('Ödül 500 KR'), 'Ödül 500 kredi');
  assert.equal(sayable('5 makineli yuvası'), '5 makineli yuvası', 'kelime içindeki m birime dönmez');
  const long = sayable('Bir. '.repeat(100), 60);
  assert.ok(long.length <= 61 && long.endsWith('.'), long);
  assert.equal(sayable(''), '');
});

test('konuşmacının sesi: asker kendi perde/hızıyla, karargâh, pilot, düşman ayrı yuvada', () => {
  SQUAD.members.forEach((m, i) => {
    const p = profileFor(`${m.callsign} Çavuş`, 'ally');
    assert.equal(p.slot, i);
    assert.equal(p.pitch, m.voice.pitch);
  });
  assert.equal(profileFor('YUVA', 'system').slot, RADIO_VOICE.speakers.YUVA.slot);
  assert.equal(profileFor('PİLOT', 'system').slot, RADIO_VOICE.speakers.PİLOT.slot);
  assert.equal(profileFor('Tüfekçi', 'enemy'), RADIO_VOICE.speakers.enemy);
  assert.equal(profileFor('POLİGON', 'system'), RADIO_VOICE.speakers.system);
});

test('yalnız Türkçe sesler, doğal ses önce', () => {
  const r = rankVoices(speechSynthesis.getVoices());
  assert.deepEqual(r.map((v) => v.name), ['Microsoft Ahmet Online (Natural) - Turkish', 'Google Türkçe', 'Microsoft Tolga']);
});

test('satırlar sırayla, en çok maxQueue bekler; acil satır okunanı keser; komutanın sözü okunmaz', () => {
  spoken.length = 0;
  cancels = 0;
  const g = game();
  const rv = new RadioVoice(g);
  assert.equal(rv.say('Komutan → Alfa Timi', 'ilerleyin', { kind: 'player' }), false);
  rv.say('Alfa-1 Çavuş', 'Anlaşıldı', { kind: 'ally' });
  assert.equal(spoken.length, 1, 'ilk satır hemen okunur');
  assert.equal(spoken[0].text, 'Anlaşıldı');
  assert.equal(spoken[0].volume, 0.7);
  assert.equal(spoken[0].voice.name, 'Microsoft Ahmet Online (Natural) - Turkish', 'Alfa-1 en iyi ses yuvasında');
  assert.deepEqual(g.keys, ['open'], 'bas-konuş cızırtısı');
  for (let i = 0; i < 6; i++) rv.say('YUVA', `satır ${i}`, { kind: 'system' });
  assert.equal(rv.queue.length, RADIO_VOICE.maxQueue, 'sıra sınırlı');
  assert.equal(rv.queue.at(-1).text, 'satır 5', 'en yeni kalır');
  rv.say('Alfa-2 Çavuş', 'El bombası!', { kind: 'ally', urgent: true });
  assert.equal(cancels, 1, 'acil satır okunanı kesti');
  rv.update(RADIO_VOICE.gapSec + 0.01);
  assert.equal(spoken.at(-1).text, 'El bombası!');
  // Bitiş olayı: sıradaki satıra geçilir
  spoken.at(-1).onend();
  assert.ok(g.keys.includes('close'));
  rv.update(RADIO_VOICE.gapSec + 0.01);
  assert.equal(spoken.at(-1).text, 'satır 3');
  rv.cancel();
  assert.equal(rv.queue.length, 0);
  assert.equal(rv.speaking, false);
});

test('ayar kapalıyken okunmaz (sesli soruya cevap hariç); bitiş olayı gelmezse satır bitmiş sayılır', () => {
  spoken.length = 0;
  const g = game();
  g.settings.radioVoice = false;
  const rv = new RadioVoice(g);
  assert.equal(rv.say('YUVA', 'Merhaba', { kind: 'system' }), false);
  assert.equal(rv.say('YUVA', 'Sorunun cevabı', { kind: 'system', force: true }), true);
  assert.equal(spoken.length, 1);
  rv.current.endAt = performance.now() - 1;
  rv.update(0.016);
  assert.equal(rv.speaking, false, 'bekçi süresi doldu');
});
