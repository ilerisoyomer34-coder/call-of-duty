// Kayıt sistemi: varsayılanlar, eski anahtarlardan yükseltme, bozuk kayıt, yazma (Operasyon Güncellemesi §9.3, §12/12)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveSystem, migrateSave, freshSave, SAVE_KEY, SAVE_VERSION, LEGACY_KEYS } from '../src/save.js';
import { memoryStore } from './helpers.mjs';

test('yeni kayıt: başlangıç kredisi, boş envanter, sürüm yazılır', () => {
  const store = memoryStore();
  const s = new SaveSystem({ store, startCredits: 1000 });
  assert.equal(s.data.version, SAVE_VERSION);
  assert.equal(s.data.credits, 1000);
  assert.deepEqual(s.data.inventory.armor, []);
  assert.deepEqual(s.data.progress, { unlocked: 1, best: {} });
  assert.equal(store.raw(SAVE_KEY).credits, 1000, 'ilk açılışta kayıt hemen yazılır');
});

test('eski sürüm kaydı yükseltilir: seviye, en iyi sonuç, teçhizat ve ayarlar korunur, eski anahtarlar silinmez', () => {
  const store = memoryStore({
    [LEGACY_KEYS.progress]: { unlocked: 4, best: { 2: { score: 1800, time: 300, diff: 'hard' } } },
    [LEGACY_KEYS.loadout]: { primary: 'k8', secondary: 'd50' },
    [LEGACY_KEYS.settings]: { quality: 'low', sensitivity: 1.4 },
  });
  const s = new SaveSystem({ store, startCredits: 1000 });
  assert.equal(s.migrated, true);
  assert.equal(s.data.progress.unlocked, 4);
  assert.equal(s.data.progress.best[2].score, 1800);
  assert.equal(s.data.loadout.primary, 'k8');
  assert.equal(s.data.loadout.secondary, 'd50');
  assert.equal(s.data.settings.quality, 'low');
  assert.equal(s.data.credits, 1000, 'eski sürümde kredi yoktu: başlangıç kredisi verilir');
  const written = store.raw(SAVE_KEY);
  assert.equal(written.version, SAVE_VERSION);
  assert.equal(written.progress.unlocked, 4);
  assert.ok(store.raw(LEGACY_KEYS.progress), 'eski anahtar yedek olarak kalır');
});

test('yeni kayıt varken eski anahtarlar yok sayılır', () => {
  const store = memoryStore({
    [SAVE_KEY]: { ...freshSave(500), progress: { unlocked: 2, best: {} } },
    [LEGACY_KEYS.progress]: { unlocked: 6, best: {} },
  });
  const s = new SaveSystem({ store });
  assert.equal(s.migrated, false);
  assert.equal(s.data.progress.unlocked, 2);
  assert.equal(s.data.credits, 500);
});

test('bozuk ya da eksik alanlar varsayılana döner, bilinmeyen alanlar korunur', () => {
  const { save } = migrateSave(
    { version: 1, credits: -50, inventory: 'x', loadout: { primary: 'rifle', slots: 3 }, stats: { kills: 9 }, futureField: { a: 1 } },
    () => null,
    1000
  );
  assert.equal(save.credits, 0, 'kredi eksi olamaz');
  assert.deepEqual(save.inventory.helmets, []);
  assert.equal(save.loadout.primary, 'rifle');
  assert.deepEqual(save.loadout.slots, [null, null]);
  assert.equal(save.stats.kills, 9);
  assert.equal(save.stats.revivesGiven, 0);
  assert.deepEqual(save.futureField, { a: 1 });
});

test('JSON olmayan kayıt: temiz kayıtla açılır, oyun çökmez', () => {
  const store = memoryStore();
  store.map.set(SAVE_KEY, '{bozuk');
  const s = new SaveSystem({ store, startCredits: 1000 });
  assert.equal(s.data.credits, 1000);
  assert.equal(store.raw(SAVE_KEY).version, SAVE_VERSION);
});

test('update gecikmeli yazar, now ve flush hemen yazar; reset temiz kayda döner', async () => {
  const store = memoryStore();
  const s = new SaveSystem({ store, startCredits: 1000, flushDelayMs: 20 });
  s.update((d) => (d.stats.kills = 3));
  assert.equal(store.raw(SAVE_KEY).stats.kills, 0, 'hemen yazılmaz');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(store.raw(SAVE_KEY).stats.kills, 3, 'gecikmeyle yazılır');
  s.update((d) => (d.credits = 77), { now: true });
  assert.equal(store.raw(SAVE_KEY).credits, 77);
  s.reset();
  assert.equal(store.raw(SAVE_KEY).credits, 1000);
  assert.equal(s.data.stats.kills, 0);
});

test('oyuncu kimliği: boş başlar, eski anahtardaki ad alınır, bozuk alan düzelir, sıfırlamada korunur', () => {
  const s0 = new SaveSystem({ store: memoryStore(), startCredits: 1000 });
  // server/servers: hesap sunucunun kalıcı kimliğine bağlı (ev sunucusunun tünel adresi değişir)
  assert.deepEqual(s0.data.profile, { name: null, tag: null, id: null, token: null, server: null, servers: {} });
  const store = memoryStore({ [LEGACY_KEYS.profile]: { name: 'Deneme' } });
  const s = new SaveSystem({ store, startCredits: 1000 });
  assert.equal(s.data.profile.name, 'Deneme');
  // Kayıttaki ad eski anahtardan önce gelir
  const both = memoryStore({ [SAVE_KEY]: { version: 1, profile: { name: 'Ömer', tag: '0042', id: 'p1', token: 'x' } }, [LEGACY_KEYS.profile]: { name: 'Deneme' } });
  assert.equal(new SaveSystem({ store: both, startCredits: 1000 }).data.profile.name, 'Ömer');
  const bad = migrateSave({ version: 1, profile: { name: 5, tag: '', servers: { s_a: { token: 't', tag: '0001' }, s_b: 'bozuk', s_c: { tag: '1' } } } }, () => null, 1000).save;
  assert.deepEqual(bad.profile, { name: null, tag: null, id: null, token: null, server: null, servers: { s_a: { id: null, tag: '0001', token: 't' } } });
  const r = new SaveSystem({ store: both, startCredits: 1000 });
  r.data.credits = 50;
  r.reset();
  assert.equal(r.data.credits, 1000);
  assert.equal(r.data.profile.name, 'Ömer');
  assert.equal(r.data.profile.token, 'x');
});
