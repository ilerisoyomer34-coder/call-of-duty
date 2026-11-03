// Silah eklentileri (shared/sim/mods.js, src/gunsmith.js): uyum, eklentili tanım, ağ dizinleri, satın alma ve takma
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENTS, ATT_IDS, ATT_CATS, compatible, choicesFor, normalizeMods, moddedDef, modsToIndices, modsFromIndices } from '../shared/sim/mods.js';
import { WEAPONS } from '../src/config.js';
import { SIGHT_TYPES } from '../src/sights.js';
import { OPTIC_SHAPES } from '../src/opticModels.js';
import ATT from '../src/data/attachments.json' with { type: 'json' };
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

test('nişangâhlar ve dürbünler: her optiğin türü ve modeli var, dürbünlüye yalnız dürbün, büyütmeyi optik belirler', () => {
  const optics = Object.entries(ATTACHMENTS).filter(([, a]) => a.cat === 'optic');
  assert.ok(optics.length >= 15, `en az 15 nişangâh (${optics.length})`);
  for (const [id, a] of optics) {
    assert.ok(SIGHT_TYPES[a.sight], `${id}: nişangâh türü`);
    assert.ok(OPTIC_SHAPES.includes(a.model.shape), `${id}: model biçimi ${a.model.shape}`);
    assert.ok(a.model.len > 0 && a.model.len < 0.4, `${id}: boy`);
    if (SIGHT_TYPES[a.sight].kind === 'scope') assert.ok(a.mods.fov > 0 && a.mods.fov < 0.5 && a.model.shape === 'scope', `${id}: dürbün büyütür`);
  }
  // Büyütme sırası adla tutarlı: daha büyük sayı daha dar görüş
  const scopes = optics.filter(([, a]) => SIGHT_TYPES[a.sight].kind === 'scope').map(([, a]) => [parseInt(SIGHT_TYPES[a.sight].zoom, 10), a.mods.fov]).sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < scopes.length; i++) assert.ok(scopes[i][1] < scopes[i - 1][1], `${scopes[i][0]}× ${scopes[i - 1][0]}×'ten dar`);
  // Taarruz tüfeğine kolimatör, prizma ve dürbün; keskin nişancıya yalnız dürbün
  assert.ok(choicesFor('ak74', 'optic').length >= 12);
  const sniper = choicesFor('awm', 'optic');
  assert.ok(sniper.length >= 6 && sniper.every((id) => SIGHT_TYPES[ATTACHMENTS[id].sight].kind === 'scope'), 'keskin nişancıda yalnız dürbün');
  assert.equal(compatible('awm', 'opt_holo'), false);
  assert.equal(compatible('minigun', 'opt_scope4'), false, 'nişan alınamayan');
  // Büyütme: dürbün kendi büyütmesini verir (silahın kendi dürbününden az da olsa); büyütmesiz optik büyütmeli
  // nişangâhın yerine geçince refleks düzeyi
  assert.equal(moddedDef('awm', { optic: 'opt_scope4' }).ads.fovMult, 0.31);
  assert.equal(moddedDef('awm', { optic: 'opt_scope4' }).sight, 'duplex');
  assert.equal(moddedDef('lmg', { optic: 'opt_reddot' }).ads.fovMult, ATT.reflexFov);
  assert.equal(moddedDef('ak74', { optic: 'opt_reddot' }).ads.fovMult, WEAPONS.ak74.ads.fovMult, 'refleks silahın kendi büyütmesi');
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
