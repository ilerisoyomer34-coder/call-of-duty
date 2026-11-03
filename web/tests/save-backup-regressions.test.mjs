// Çevrim dışı kayıt yedeği (src/saveBackup.js) ve save.js bağlantısı. v1.2 kalite paketinden uyarlandı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineBackup, selectResilientSave, SAVE_BACKUP_KEY, BACKUP_FIELDS, BACKUP_SETTINGS } from '../src/saveBackup.js';
import { SaveSystem, SAVE_KEY, freshSave } from '../src/save.js';
import { DEFAULT_SETTINGS } from '../src/settings.js';

test('yedekte çevrim dışı ilerleme var; kimlik, belirteç ve sunucu adresi yok', () => {
  const original = {
    version: 1, credits: 120, progress: { unlocked: 4 },
    inventory: { weapons: ['k8'] }, progression: { level: 6 },
    settings: { quality: 'medium', serverUrl: 'wss://example.org?token=secret', customPrivate: 'secret' },
    profile: { name: 'Player', id: 'id', token: 'secret', servers: { x: { token: 'secret-2' } } },
    secretUnknownField: 'not safe to back up',
  };
  const backup = offlineBackup(original);
  assert.equal(backup.credits, 120);
  assert.equal(backup.progress.unlocked, 4);
  assert.equal(backup.profile, undefined);
  assert.equal(backup.settings.quality, 'medium');
  assert.equal(backup.settings.serverUrl, undefined);
  assert.equal(backup.settings.customPrivate, undefined);
  assert.equal(backup.secretUnknownField, undefined);
  assert.equal(JSON.stringify(backup).includes('secret'), false);
  assert.ok(SAVE_BACKUP_KEY.startsWith('demirsafak.save.'));
});

test('bozuk ana kayıtta yedek açılır; geçerli ana kayıt hep kazanır', () => {
  const current = { version: 1, credits: 15 };
  const backup = { version: 1, credits: 25 };
  assert.deepEqual(selectResilientSave(current, backup), { raw: current, recovered: false });
  assert.deepEqual(selectResilientSave(null, backup), { raw: backup, recovered: true });
  assert.deepEqual(selectResilientSave({ version: 'broken' }, backup), { raw: backup, recovered: true });
  assert.deepEqual(selectResilientSave([], backup), { raw: backup, recovered: true });
  assert.deepEqual(selectResilientSave(null, { version: 'invalid' }), { raw: null, recovered: false });
});

test('bozuk veri yedeklenmez', () => {
  assert.equal(offlineBackup(null), null);
  assert.equal(offlineBackup({ version: -1, credits: 90 }), null);
  assert.equal(offlineBackup({ version: 1.5 }), null);
});

test('izin listeleri kayıtla eşit: profil dışında her kayıt alanı, sunucu dışında her ayar yedekte', () => {
  assert.deepEqual([...BACKUP_FIELDS].sort(), Object.keys(freshSave()).filter((k) => k !== 'profile').sort());
  const offline = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== 'serverUrl' && k !== 'onlineMode');
  assert.deepEqual([...BACKUP_SETTINGS].sort(), offline.sort(), 'yeni ayar saveBackup.js → BACKUP_SETTINGS listesine de eklenmeli');
});

function memStore(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    m,
    get: (k, f) => (m.has(k) ? JSON.parse(m.get(k)) : f),
    set: (k, v) => m.set(k, JSON.stringify(v)),
  };
}

test('SaveSystem: her yazmada yedek de yazılır; ana kayıt bozulunca yedekten kurtarılır ve yeniden yazılır', () => {
  const store = memStore();
  const a = new SaveSystem({ store, flushDelayMs: 0 });
  a.update((d) => {
    d.credits = 4321;
    d.progress.unlocked = 7;
    d.profile.token = 'gizli-belirtec';
    d.profile.name = 'Komutan';
  }, { now: true });
  const bak = store.get(SAVE_BACKUP_KEY, null);
  assert.equal(bak.credits, 4321);
  assert.equal(JSON.stringify(bak).includes('gizli-belirtec'), false, 'yedekte belirteç yok');
  // Ana kayıt bozuldu (yarım yazılmış JSON: storage.get null döner)
  store.m.set(SAVE_KEY, '{"version":1,"cred');
  const broken = { ...store, get: (k, f) => { try { return store.get(k, f); } catch { return f; } } };
  const b = new SaveSystem({ store: broken, flushDelayMs: 0 });
  assert.equal(b.recoveredFromBackup, true);
  assert.equal(b.data.credits, 4321);
  assert.equal(b.data.progress.unlocked, 7);
  assert.equal(b.data.profile.token, null, 'çevrim içi kimlik kurtarılmaz');
  assert.equal(store.get(SAVE_KEY, null).credits, 4321, 'ana kayıt yeniden yazıldı');
  // Kurtarılan kayıt ana kayda yazıldı: sonraki açılış artık yedeğe düşmez
  const c = new SaveSystem({ store, flushDelayMs: 0 });
  assert.equal(c.recoveredFromBackup, false);
  assert.equal(c.data.credits, 4321);
});

test('SaveSystem: sağlam ana kayıtta yedek kullanılmaz, ad ve hesap korunur', () => {
  const store = memStore();
  const a = new SaveSystem({ store, flushDelayMs: 0 });
  a.update((d) => {
    d.profile.name = 'Komutan';
    d.profile.token = 'belirtec';
  }, { now: true });
  // Yedek eski kalsa bile (ör. farklı kredi) geçerli ana kayıt kazanır
  store.set(SAVE_BACKUP_KEY, { ...store.get(SAVE_BACKUP_KEY, null), credits: 1 });
  const b = new SaveSystem({ store, flushDelayMs: 0 });
  assert.equal(b.recoveredFromBackup, false);
  assert.equal(b.data.profile.name, 'Komutan');
  assert.equal(b.data.profile.token, 'belirtec');
  assert.notEqual(b.data.credits, 1);
});
