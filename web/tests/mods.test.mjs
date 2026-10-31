// Silah eklentileri (shared/sim/mods.js, src/gunsmith.js): uyum, eklentili tanım, ağ dizinleri, satın alma ve takma
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENTS, ATT_IDS, ATT_CATS, compatible, choicesFor, normalizeMods, moddedDef, modsToIndices, modsFromIndices } from '../shared/sim/mods.js';
import { WEAPONS } from '../src/config.js';
import { GunsmithSystem, MOD_RESULT } from '../src/gunsmith.js';
import { EconomySystem } from '../src/economy.js';
import { freshSave } from '../src/save.js';

test('katalog: her eklentinin kategorisi, fiyatı ve sınıfları geçerli', () => {
  for (const [id, a] of Object.entries(ATTACHMENTS)) {
    assert.ok(ATT_CATS.includes(a.cat), `${id} kategorisi`);
    assert.ok(a.price > 0 && Array.isArray(a.types) && a.types.length, `${id} fiyat/sınıf`);
    if (a.cat === 'optic') assert.ok(a.sight && a.model?.shape, `${id} optik türü`);
    if (a.cat === 'camo') assert.ok(Array.isArray(a.camo?.color), `${id} renk`);
  }
  assert.ok(ATT_IDS.length < 128, 'ağda u8 dizin');
});

test('uyum: dürbünlü silaha optik, pompalıya şarjör, bıçağa hiçbir şey takılmaz', () => {
  assert.equal(compatible('ak74', 'opt_acog'), true);
  assert.equal(compatible('awm', 'opt_reddot'), false, 'keskin nişancı dürbünlü');
  assert.equal(compatible('shotgun', 'mag_extended'), false, 'fişekle dolan');
  assert.equal(compatible('knife', 'camo_gold'), false);
  assert.equal(compatible('d50', 'ub_vertical'), false, 'tabancaya dikey tutamak yok');
  assert.ok(choicesFor('ak74', 'camo').length === 5);
  assert.deepEqual(normalizeMods('ak74', { optic: 'muz_suppressor', muzzle: 'muz_suppressor', stock: 'yok' }), { muzzle: 'muz_suppressor' }, 'yanlış kategori ve bilinmeyen atılır');
});

test('eklentili tanım: çarpanlar işler, temel tanım değişmez, eklentisiz temel döner', () => {
  const base = WEAPONS.ak74;
  assert.equal(moddedDef('ak74', {}), base);
  const d = moddedDef('ak74', { magazine: 'mag_extended', muzzle: 'muz_suppressor', underbarrel: 'ub_vertical', optic: 'opt_acog' });
  assert.equal(d.magSize, Math.round(base.magSize * 1.5));
  assert.ok(Math.abs(d.reloadTactical - base.reloadTactical * 1.15) < 1e-9);
  assert.equal(d.sound, 'suppressed');
  assert.ok(d.noise < base.noise * 0.5 && d.flashSize < base.flashSize);
  assert.ok(d.recoil.pattern[0][1] < base.recoil.pattern[0][1], 'geri tepme azaldı');
  assert.ok(d.falloff.end < base.falloff.end, 'susturucu menzili kısaltır');
  assert.equal(d.ads.fovMult, 0.55, 'ACOG büyütmesi');
  assert.equal(d.sight, 'acog');
  assert.equal(WEAPONS.ak74.magSize, 30, 'temel tanıma dokunulmadı');
  assert.equal(moddedDef('ak74', { magazine: 'mag_extended', muzzle: 'muz_suppressor', underbarrel: 'ub_vertical', optic: 'opt_acog' }), d, 'önbellek');
});

test('ağ dizinleri gidip gelir; sunucu uyumsuzu atar', () => {
  const m = { optic: 'opt_holo', muzzle: 'muz_suppressor', camo: 'camo_night' };
  assert.deepEqual(modsFromIndices('ak74', modsToIndices(m)), m);
  assert.deepEqual(modsFromIndices('awm', modsToIndices(m)), { muzzle: 'muz_suppressor', camo: 'camo_night' }, 'dürbünlüye optik yok');
  assert.deepEqual(modsFromIndices('ak74', [999, -1]), {});
});

function system(credits = 5000) {
  const save = { data: freshSave(credits), update(fn) { if (fn) fn(this.data); } };
  const eco = new EconomySystem(save);
  return { save, eco, gs: new GunsmithSystem(save, eco) };
}

test('satın al ve tak: kredi düşer, bir kez alınan her uyumlu silahta kullanılır', () => {
  const { gs, eco, save } = system(3000);
  assert.equal(gs.status('ak74', 'muz_suppressor'), 'buy');
  assert.equal(gs.equip('ak74', 'muzzle', 'muz_suppressor'), MOD_RESULT.NOT_OWNED);
  assert.equal(gs.buyAndEquip('ak74', 'muz_suppressor'), MOD_RESULT.OK);
  assert.equal(eco.credits, 3000 - ATTACHMENTS.muz_suppressor.price);
  assert.deepEqual(gs.modsFor('ak74'), { muzzle: 'muz_suppressor' });
  assert.equal(gs.status('ak74', 'muz_suppressor'), 'equipped');
  assert.equal(gs.status('mk4', 'muz_suppressor'), 'owned', 'başka silahta da sahipsin');
  assert.equal(gs.buyAndEquip('mk4', 'muz_suppressor'), MOD_RESULT.OK);
  assert.equal(eco.credits, 3000 - ATTACHMENTS.muz_suppressor.price, 'ikinci kez para alınmaz');
  // Yetersiz kredi
  assert.equal(gs.buyAndEquip('ak74', 'camo_gold'), MOD_RESULT.NO_CREDIT);
  assert.equal(gs.status('ak74', 'camo_gold'), 'no_credit');
  // Uyumsuz
  assert.equal(gs.buyAndEquip('shotgun', 'mag_extended'), MOD_RESULT.INCOMPATIBLE);
  // Çıkar
  assert.equal(gs.equip('ak74', 'muzzle', null), MOD_RESULT.OK);
  assert.deepEqual(gs.modsFor('ak74'), {});
  assert.deepEqual(save.data.inventory.attachments, ['muz_suppressor']);
});
